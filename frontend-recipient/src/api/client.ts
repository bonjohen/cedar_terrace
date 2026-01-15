import type {
  InitiateTicketAccessRequest,
  InitiateTicketAccessResponse,
  CompleteRecipientProfileRequest,
  TicketDetailResponse,
  RecipientAccount,
} from '@cedar-terrace/shared';

class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

class RecipientApiClient {
  private baseUrl =
    (import.meta as any).env?.VITE_API_BASE_URL || '/api';

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options?.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorData.error || errorMessage;
      } catch {
        // If response is not JSON, use status text
      }
      throw new ApiError(response.status, errorMessage);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  // Authentication
  async initiateAccess(qrToken: string, email: string): Promise<InitiateTicketAccessResponse> {
    const requestBody: InitiateTicketAccessRequest = {
      qrToken,
      email,
    };

    return this.request<InitiateTicketAccessResponse>('/recipients/initiate-access', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });
  }

  async activateAccount(activationToken: string): Promise<RecipientAccount> {
    return this.request<RecipientAccount>('/recipients/activate', {
      method: 'POST',
      body: JSON.stringify({ activationToken }),
    });
  }

  // Profile
  async completeProfile(
    accountId: string,
    profile: CompleteRecipientProfileRequest
  ): Promise<RecipientAccount> {
    return this.request<RecipientAccount>(`/recipients/${accountId}/profile`, {
      method: 'POST',
      body: JSON.stringify(profile),
    });
  }

  async getAccount(accountId: string): Promise<RecipientAccount> {
    return this.request<RecipientAccount>(`/recipients/${accountId}`, {
      method: 'GET',
    });
  }

  // Ticket
  async getTicketDetails(accountId: string, qrToken: string): Promise<TicketDetailResponse> {
    return this.request<TicketDetailResponse>(`/recipients/${accountId}/ticket/${qrToken}`, {
      method: 'GET',
    });
  }
}

// Export singleton instance
export const apiClient = new RecipientApiClient();
export { ApiError };
