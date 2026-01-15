import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { config } from '../config';
import { receiveMessages, deleteMessage } from '../utils/sqs';
import { createLogger } from '../utils/logger';
import {
  generateActivationEmail,
  generateNoticeIssuedEmail,
  type ActivationEmailData,
  type NoticeIssuedEmailData,
} from './templates';

const logger = createLogger('email-worker');

let sesClient: SESClient | null = null;

function getSESClient(): SESClient {
  if (!sesClient) {
    sesClient = new SESClient({
      region: config.aws.region,
      credentials:
        config.aws.accessKeyId && config.aws.secretAccessKey
          ? {
              accessKeyId: config.aws.accessKeyId,
              secretAccessKey: config.aws.secretAccessKey,
            }
          : undefined,
    });
  }

  return sesClient;
}

interface EmailMessage {
  type: 'ACTIVATION' | 'NOTICE_ISSUED';
  data: ActivationEmailData | NoticeIssuedEmailData;
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<void> {
  const client = getSESClient();

  const command = new SendEmailCommand({
    Source: config.email.senderEmail,
    Destination: {
      ToAddresses: [to],
    },
    Message: {
      Subject: {
        Data: subject,
        Charset: 'UTF-8',
      },
      Body: {
        Html: {
          Data: html,
          Charset: 'UTF-8',
        },
        Text: {
          Data: text,
          Charset: 'UTF-8',
        },
      },
    },
  });

  await client.send(command);
}

async function processEmailMessage(message: EmailMessage): Promise<void> {
  logger.info('Processing email message', { type: message.type });

  try {
    if (message.type === 'ACTIVATION') {
      const data = message.data as ActivationEmailData;
      const { subject, html, text } = generateActivationEmail(data);
      await sendEmail(data.email, subject, html, text);
      logger.info('Activation email sent', { email: data.email });
    } else if (message.type === 'NOTICE_ISSUED') {
      const data = message.data as NoticeIssuedEmailData;
      const { subject, html, text } = generateNoticeIssuedEmail(data);
      await sendEmail(data.email, subject, html, text);
      logger.info('Notice issued email sent', {
        email: data.email,
        violationId: data.violationId,
      });
    } else {
      logger.warn('Unknown email type', { type: message.type });
    }
  } catch (error) {
    logger.error('Failed to send email', {
      type: message.type,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function processMessages(): Promise<void> {
  try {
    const messages = await receiveMessages<EmailMessage>(
      config.queues.email,
      config.worker.maxMessagesPerBatch
    );

    if (messages.length === 0) {
      logger.debug('No messages to process');
      return;
    }

    logger.info('Processing email messages', { count: messages.length });

    for (const message of messages) {
      try {
        await processEmailMessage(message.body);
        await deleteMessage(config.queues.email, message.receiptHandle);
        logger.debug('Message processed successfully', { messageId: message.id });
      } catch (error) {
        logger.error('Failed to process message', {
          messageId: message.id,
          error: error instanceof Error ? error.message : String(error),
        });
        // Message will become visible again after visibility timeout
        // Consider implementing a dead-letter queue for repeated failures
      }
    }
  } catch (error) {
    logger.error('Failed to receive messages', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function start(): Promise<void> {
  logger.info('Email worker starting', {
    pollInterval: config.worker.emailPollInterval,
    queueUrl: config.queues.email,
    senderEmail: config.email.senderEmail,
  });

  // Start message processing loop
  setInterval(processMessages, config.worker.emailPollInterval);

  logger.info('Email worker started successfully');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Email worker shutting down');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Email worker shutting down');
  process.exit(0);
});

// Start the worker
if (require.main === module) {
  start().catch((error) => {
    logger.error('Failed to start email worker', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  });
}

export { start, processMessages, processEmailMessage };
