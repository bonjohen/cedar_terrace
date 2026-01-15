import { config } from '../config';
import { query } from '../utils/database';
import { receiveMessages, deleteMessage } from '../utils/sqs';
import { createLogger } from '../utils/logger';

const logger = createLogger('timeline-worker');

interface TimelineMessage {
  violationId: string;
  action: 'evaluate';
}

interface ViolationRow {
  id: string;
  category: string;
  status: string;
  detected_at: Date;
  notice_issued_at: Date | null;
  resolved_at: Date | null;
}

interface ViolationEventRow {
  event_type: string;
  occurred_at: Date;
  event_data: any;
}

// Violation timeline rules (from backend domain logic)
const TIMELINE_RULES = {
  HANDICAPPED_NO_PERMIT: {
    noticeEligibleMinutes: 0, // Immediate
    escalationDays: 7,
    towEligibleDays: 14,
  },
  PURCHASED_UNAUTHORIZED: {
    noticeEligibleMinutes: 0,
    escalationDays: 3,
    towEligibleDays: 7,
  },
  FIRE_LANE: {
    noticeEligibleMinutes: 0,
    escalationDays: 1,
    towEligibleDays: 3,
  },
  REGISTRATION_EXPIRED: {
    noticeEligibleMinutes: 0,
    escalationDays: 14,
    towEligibleDays: 30,
  },
  GENERAL_VIOLATION: {
    noticeEligibleMinutes: 0,
    escalationDays: 7,
    towEligibleDays: 21,
  },
};

async function evaluateViolationTimeline(violationId: string): Promise<void> {
  logger.info('Evaluating violation timeline', { violationId });

  // Fetch violation details
  const violations = await query<ViolationRow>(
    `SELECT id, category, status, detected_at, notice_issued_at, resolved_at
     FROM violations
     WHERE id = $1 AND deleted_at IS NULL`,
    [violationId]
  );

  if (violations.length === 0) {
    logger.warn('Violation not found', { violationId });
    return;
  }

  const violation = violations[0];

  // Skip if already resolved
  if (violation.resolved_at) {
    logger.info('Violation already resolved, skipping', { violationId });
    return;
  }

  // Get timeline rules for category
  const rules = TIMELINE_RULES[violation.category as keyof typeof TIMELINE_RULES];
  if (!rules) {
    logger.warn('No timeline rules for category', {
      violationId,
      category: violation.category,
    });
    return;
  }

  const now = new Date();
  const detectedAt = new Date(violation.detected_at);
  const noticeIssuedAt = violation.notice_issued_at
    ? new Date(violation.notice_issued_at)
    : null;

  // Fetch existing timeline events
  const events = await query<ViolationEventRow>(
    `SELECT event_type, occurred_at, event_data
     FROM violation_events
     WHERE violation_id = $1
     ORDER BY occurred_at DESC`,
    [violationId]
  );

  const hasEscalatedEvent = events.some((e) => e.event_type === 'ESCALATED');
  const hasTowEligibleEvent = events.some((e) => e.event_type === 'TOW_ELIGIBLE');

  let newStatus: string | null = null;
  let eventType: string | null = null;
  let eventData: any = null;

  // Check for tow eligibility
  if (
    noticeIssuedAt &&
    !hasTowEligibleEvent &&
    violation.status !== 'TOW_ELIGIBLE'
  ) {
    const daysSinceNotice =
      (now.getTime() - noticeIssuedAt.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceNotice >= rules.towEligibleDays) {
      newStatus = 'TOW_ELIGIBLE';
      eventType = 'TOW_ELIGIBLE';
      eventData = {
        daysSinceNotice: Math.floor(daysSinceNotice),
        threshold: rules.towEligibleDays,
      };
      logger.info('Violation is now tow eligible', {
        violationId,
        daysSinceNotice,
      });
    }
  }

  // Check for escalation
  if (
    noticeIssuedAt &&
    !hasEscalatedEvent &&
    !newStatus &&
    violation.status === 'NOTICE_ISSUED'
  ) {
    const daysSinceNotice =
      (now.getTime() - noticeIssuedAt.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceNotice >= rules.escalationDays) {
      newStatus = 'ESCALATED';
      eventType = 'ESCALATED';
      eventData = {
        daysSinceNotice: Math.floor(daysSinceNotice),
        threshold: rules.escalationDays,
      };
      logger.info('Violation escalated', { violationId, daysSinceNotice });
    }
  }

  // Apply state transition if needed
  if (newStatus && eventType) {
    await query(
      `UPDATE violations
       SET status = $1, updated_at = NOW()
       WHERE id = $2`,
      [newStatus, violationId]
    );

    await query(
      `INSERT INTO violation_events (id, violation_id, event_type, occurred_at, event_data)
       VALUES (gen_random_uuid(), $1, $2, NOW(), $3)`,
      [violationId, eventType, JSON.stringify(eventData)]
    );

    logger.info('Violation timeline updated', {
      violationId,
      newStatus,
      eventType,
    });
  } else {
    logger.debug('No timeline changes needed', { violationId });
  }
}

async function processMessages(): Promise<void> {
  try {
    const messages = await receiveMessages<TimelineMessage>(
      config.queues.timeline,
      config.worker.maxMessagesPerBatch
    );

    if (messages.length === 0) {
      logger.debug('No messages to process');
      return;
    }

    logger.info('Processing timeline messages', { count: messages.length });

    for (const message of messages) {
      try {
        await evaluateViolationTimeline(message.body.violationId);
        await deleteMessage(config.queues.timeline, message.receiptHandle);
        logger.debug('Message processed successfully', { messageId: message.id });
      } catch (error) {
        logger.error('Failed to process message', {
          messageId: message.id,
          error: error instanceof Error ? error.message : String(error),
        });
        // Message will become visible again after visibility timeout
      }
    }
  } catch (error) {
    logger.error('Failed to receive messages', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function start(): Promise<void> {
  logger.info('Timeline worker starting', {
    pollInterval: config.worker.timelinePollInterval,
    queueUrl: config.queues.timeline,
  });

  // Run initial evaluation for all active violations
  logger.info('Running initial timeline evaluation for all active violations');
  const activeViolations = await query<{ id: string }>(
    `SELECT id FROM violations
     WHERE resolved_at IS NULL AND deleted_at IS NULL`
  );

  logger.info('Found active violations', { count: activeViolations.length });

  for (const violation of activeViolations) {
    try {
      await evaluateViolationTimeline(violation.id);
    } catch (error) {
      logger.error('Failed to evaluate violation on startup', {
        violationId: violation.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Start message processing loop
  setInterval(processMessages, config.worker.timelinePollInterval);

  logger.info('Timeline worker started successfully');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Timeline worker shutting down');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Timeline worker shutting down');
  process.exit(0);
});

// Start the worker
if (require.main === module) {
  start().catch((error) => {
    logger.error('Failed to start timeline worker', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  });
}

export { start, processMessages, evaluateViolationTimeline };
