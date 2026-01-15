import dotenv from 'dotenv';

dotenv.config();

export const config = {
  database: {
    url: process.env.DATABASE_URL || 'postgresql://localhost:5432/cedar_terrace',
  },
  aws: {
    region: process.env.AWS_REGION || 'us-west-2',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  queues: {
    timeline: process.env.TIMELINE_QUEUE_URL || '',
    email: process.env.EMAIL_QUEUE_URL || '',
    ingestion: process.env.INGESTION_QUEUE_URL || '',
  },
  email: {
    senderEmail: process.env.SES_SENDER_EMAIL || 'noreply@example.com',
    recipientPortalUrl: process.env.RECIPIENT_PORTAL_URL || 'http://localhost:3001',
  },
  worker: {
    timelinePollInterval: parseInt(process.env.TIMELINE_POLL_INTERVAL_MS || '300000', 10),
    emailPollInterval: parseInt(process.env.EMAIL_POLL_INTERVAL_MS || '5000', 10),
    ingestionPollInterval: parseInt(process.env.INGESTION_POLL_INTERVAL_MS || '10000', 10),
    maxMessagesPerBatch: parseInt(process.env.MAX_MESSAGES_PER_BATCH || '10', 10),
  },
};
