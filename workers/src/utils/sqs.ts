import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  SendMessageCommand,
  Message,
} from '@aws-sdk/client-sqs';
import { config } from '../config';

let sqsClient: SQSClient | null = null;

export function getSQSClient(): SQSClient {
  if (!sqsClient) {
    sqsClient = new SQSClient({
      region: config.aws.region,
      credentials: config.aws.accessKeyId && config.aws.secretAccessKey
        ? {
            accessKeyId: config.aws.accessKeyId,
            secretAccessKey: config.aws.secretAccessKey,
          }
        : undefined,
    });
  }

  return sqsClient;
}

export interface QueueMessage<T = any> {
  id: string;
  receiptHandle: string;
  body: T;
}

export async function receiveMessages<T = any>(
  queueUrl: string,
  maxMessages: number = 10
): Promise<QueueMessage<T>[]> {
  const client = getSQSClient();

  const command = new ReceiveMessageCommand({
    QueueUrl: queueUrl,
    MaxNumberOfMessages: Math.min(maxMessages, 10),
    WaitTimeSeconds: 20, // Long polling
    VisibilityTimeout: 60, // 1 minute to process
  });

  const response = await client.send(command);

  if (!response.Messages || response.Messages.length === 0) {
    return [];
  }

  return response.Messages.map((msg: Message) => ({
    id: msg.MessageId!,
    receiptHandle: msg.ReceiptHandle!,
    body: JSON.parse(msg.Body || '{}') as T,
  }));
}

export async function deleteMessage(
  queueUrl: string,
  receiptHandle: string
): Promise<void> {
  const client = getSQSClient();

  const command = new DeleteMessageCommand({
    QueueUrl: queueUrl,
    ReceiptHandle: receiptHandle,
  });

  await client.send(command);
}

export async function sendMessage<T = any>(
  queueUrl: string,
  body: T
): Promise<void> {
  const client = getSQSClient();

  const command = new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(body),
  });

  await client.send(command);
}
