import { createLogger } from './utils/logger';
import * as timelineWorker from './timeline/handler';
import * as emailWorker from './email/handler';
import * as ingestionWorker from './ingestion/handler';

const logger = createLogger('workers-main');

export interface WorkerOptions {
  workers: Array<'timeline' | 'email' | 'ingestion'>;
}

export async function startWorkers(options: WorkerOptions): Promise<void> {
  logger.info('Starting Cedar Terrace workers', {
    workers: options.workers,
  });

  const promises: Promise<void>[] = [];

  if (options.workers.includes('timeline')) {
    promises.push(timelineWorker.start());
  }

  if (options.workers.includes('email')) {
    promises.push(emailWorker.start());
  }

  if (options.workers.includes('ingestion')) {
    promises.push(ingestionWorker.start());
  }

  if (promises.length === 0) {
    logger.warn('No workers specified');
    return;
  }

  await Promise.all(promises);

  logger.info('All workers started successfully');
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  const workerTypes: Array<'timeline' | 'email' | 'ingestion'> = [];

  if (args.length === 0 || args.includes('--all')) {
    workerTypes.push('timeline', 'email', 'ingestion');
  } else {
    if (args.includes('--timeline')) workerTypes.push('timeline');
    if (args.includes('--email')) workerTypes.push('email');
    if (args.includes('--ingestion')) workerTypes.push('ingestion');
  }

  startWorkers({ workers: workerTypes }).catch((error) => {
    logger.error('Failed to start workers', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  });
}

// Export individual workers
export { timelineWorker, emailWorker, ingestionWorker };
