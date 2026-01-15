/**
 * API Client for Cedar Terrace Backend
 * Provides typed methods for all backend endpoints
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1';

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const config: RequestInit = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': 'admin-dev', // TODO: Replace with actual auth
      ...options.headers,
    },
  };

  try {
    const response = await fetch(url, config);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new ApiError(
        error.error || `Request failed: ${response.statusText}`,
        response.status,
        error
      );
    }

    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError('Network error', 0, error);
  }
}

// Parking Positions API
export const parkingPositionsApi = {
  async list(siteId: string) {
    return request<any[]>(`/parking-positions/site/${siteId}`);
  },

  async getById(id: string) {
    return request<any>(`/parking-positions/${id}`);
  },

  async create(data: any) {
    return request<any>('/parking-positions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async update(id: string, data: any) {
    return request<any>(`/parking-positions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async delete(id: string) {
    return request<void>(`/parking-positions/${id}`, {
      method: 'DELETE',
    });
  },

  async findAtPoint(lotImageId: string, x: number, y: number) {
    return request<any>('/parking-positions/find-at-point', {
      method: 'POST',
      body: JSON.stringify({ lotImageId, x, y }),
    });
  },
};

// Observations API
export const observationsApi = {
  async submit(data: any) {
    return request<any>('/observations/submit', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getById(id: string) {
    return request<any>(`/observations/${id}`);
  },

  async getEvidence(id: string) {
    return request<any[]>(`/observations/${id}/evidence`);
  },

  async getByVehicle(vehicleId: string, limit?: number) {
    const query = limit ? `?limit=${limit}` : '';
    return request<any[]>(`/observations/vehicle/${vehicleId}${query}`);
  },

  async getByPosition(positionId: string, limit?: number) {
    const query = limit ? `?limit=${limit}` : '';
    return request<any[]>(`/observations/position/${positionId}${query}`);
  },
};

// Violations API
export const violationsApi = {
  async getById(id: string) {
    return request<any>(`/violations/${id}`);
  },

  async getEvents(id: string) {
    return request<any[]>(`/violations/${id}/events`);
  },

  async getByVehicle(vehicleId: string) {
    return request<any[]>(`/violations/vehicle/${vehicleId}`);
  },

  async addEvent(id: string, eventType: string, notes?: string) {
    return request<any>(`/violations/${id}/events`, {
      method: 'POST',
      body: JSON.stringify({ eventType, notes }),
    });
  },

  async evaluateTimelines() {
    return request<{ transitionsApplied: number }>('/violations/evaluate-timelines', {
      method: 'POST',
    });
  },
};

// Notices API
export const noticesApi = {
  async issue(violationId: string, idempotencyKey: string) {
    return request<any>('/notices/issue', {
      method: 'POST',
      body: JSON.stringify({ violationId, idempotencyKey }),
    });
  },

  async getById(id: string) {
    return request<any>(`/notices/${id}`);
  },

  async getByViolation(violationId: string) {
    return request<any[]>(`/notices/violation/${violationId}`);
  },

  async markPrinted(id: string) {
    return request<void>(`/notices/${id}/printed`, {
      method: 'POST',
    });
  },
};

// Storage API
export const storageApi = {
  async getUploadUrl(fileName: string, contentType: string) {
    return request<any>('/storage/upload-url', {
      method: 'POST',
      body: JSON.stringify({ fileName, contentType }),
    });
  },

  async getDownloadUrl(s3Key: string) {
    return request<{ url: string }>(`/storage/download-url/${encodeURIComponent(s3Key)}`);
  },
};

export { ApiError };
