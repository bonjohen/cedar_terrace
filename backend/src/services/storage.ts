import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetUploadUrlResponse } from '@cedar-terrace/shared';
import { v4 as uuidv4 } from 'uuid';

export class StorageService {
  private s3Client: S3Client;
  private bucketName: string;

  constructor() {
    const endpoint = process.env.S3_ENDPOINT;
    this.bucketName = process.env.S3_BUCKET || 'parking-evidence';

    this.s3Client = new S3Client({
      endpoint,
      region: process.env.AWS_REGION || 'us-east-1',
      forcePathStyle: !!endpoint, // Required for MinIO/localstack
      credentials: endpoint
        ? {
            accessKeyId: process.env.S3_ACCESS_KEY || 'minio',
            secretAccessKey: process.env.S3_SECRET_KEY || 'minio123',
          }
        : undefined,
    });
  }

  /**
   * Generate a pre-signed URL for uploading evidence
   * Client uploads directly to S3 using this URL
   */
  async getUploadUrl(
    fileName: string,
    contentType: string,
    expiresIn = 3600
  ): Promise<GetUploadUrlResponse> {
    // Generate unique S3 key
    const fileExt = fileName.split('.').pop();
    const s3Key = `evidence/${uuidv4()}.${fileExt}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn });

    return {
      uploadUrl,
      s3Key,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  }

  /**
   * Generate a pre-signed URL for downloading/viewing evidence
   * Used to provide time-limited access to private evidence
   */
  async getDownloadUrl(s3Key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  /**
   * Generate multiple download URLs for evidence items
   */
  async getDownloadUrls(s3Keys: string[], expiresIn = 3600): Promise<Map<string, string>> {
    const urls = new Map<string, string>();

    for (const key of s3Keys) {
      const url = await this.getDownloadUrl(key, expiresIn);
      urls.set(key, url);
    }

    return urls;
  }

  /**
   * Upload lot image (used by admin for initial setup)
   */
  async uploadLotImage(
    imageBuffer: Buffer,
    contentType: string
  ): Promise<string> {
    const s3Key = `lot-images/${uuidv4()}.jpg`;

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        Body: imageBuffer,
        ContentType: contentType,
      })
    );

    return s3Key;
  }
}
