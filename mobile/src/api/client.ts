import * as FileSystem from 'expo-file-system';
import type {
  Site,
  ParkingPosition,
  SubmitObservationRequest,
  SubmitObservationResponse,
} from '@cedar-terrace/shared';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

/**
 * Custom API Error
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public body?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Mobile API Client
 */
class MobileApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Submit observation (idempotent)
   */
  async submitObservation(
    request: SubmitObservationRequest
  ): Promise<SubmitObservationResponse> {
    const response = await fetch(`${this.baseUrl}/api/v1/observations/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': 'mobile-user', // TODO: Replace with actual user ID
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await this.parseError(response);
      throw error;
    }

    return response.json();
  }

  /**
   * Get pre-signed upload URL for photo
   */
  async getUploadUrl(
    fileName: string,
    contentType: string
  ): Promise<{
    uploadUrl: string;
    s3Key: string;
    expiresAt: string;
  }> {
    const response = await fetch(`${this.baseUrl}/api/v1/storage/upload-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fileName, contentType }),
    });

    if (!response.ok) {
      const error = await this.parseError(response);
      throw error;
    }

    return response.json();
  }

  /**
   * Upload photo directly to S3 using pre-signed URL
   */
  async uploadPhoto(
    uploadUrl: string,
    photoUri: string,
    contentType: string
  ): Promise<void> {
    try {
      const uploadResult = await FileSystem.uploadAsync(uploadUrl, photoUri, {
        httpMethod: 'PUT',
        headers: {
          'Content-Type': contentType,
        },
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      });

      if (uploadResult.status !== 200) {
        throw new ApiError(
          `Failed to upload photo: ${uploadResult.status}`,
          uploadResult.status
        );
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError('Failed to upload photo to S3', undefined, error);
    }
  }

  /**
   * Get all sites
   */
  async getSites(): Promise<Site[]> {
    const response = await fetch(`${this.baseUrl}/api/v1/sites`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await this.parseError(response);
      throw error;
    }

    return response.json();
  }

  /**
   * Get parking positions for a site
   */
  async getPositions(siteId: string): Promise<ParkingPosition[]> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/positions?siteId=${encodeURIComponent(siteId)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = await this.parseError(response);
      throw error;
    }

    return response.json();
  }

  /**
   * Parse error response
   */
  private async parseError(response: Response): Promise<ApiError> {
    let body;
    let message = `HTTP ${response.status}: ${response.statusText}`;

    try {
      body = await response.json();
      if (body.message) {
        message = body.message;
      } else if (body.error) {
        message = body.error;
      }
    } catch {
      // Response body is not JSON
    }

    return new ApiError(message, response.status, body);
  }
}

// Export singleton instance
export const apiClient = new MobileApiClient();
