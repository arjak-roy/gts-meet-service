const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('accessToken');
  }

  private setTokens(accessToken: string, refreshToken: string) {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
  }

  clearTokens() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }

  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, headers = {} } = options;

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 401) {
      // Try refresh
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        try {
          const refreshResponse = await fetch(`${this.baseUrl}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });

          if (refreshResponse.ok) {
            const tokens = await refreshResponse.json();
            this.setTokens(tokens.accessToken, tokens.refreshToken);

            // Retry original request
            headers['Authorization'] = `Bearer ${tokens.accessToken}`;
            const retryResponse = await fetch(`${this.baseUrl}${endpoint}`, {
              method,
              headers,
              body: body ? JSON.stringify(body) : undefined,
            });

            if (!retryResponse.ok) {
              throw new Error('Request failed after token refresh');
            }

            return retryResponse.json();
          }
        } catch {
          this.clearTokens();
          window.location.href = '/login';
        }
      } else {
        this.clearTokens();
        window.location.href = '/login';
      }
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Auth
  async login(email: string, password: string) {
    const result = await this.request<{
      user: any;
      accessToken: string;
      refreshToken: string;
    }>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    this.setTokens(result.accessToken, result.refreshToken);
    return result;
  }

  async register(name: string, email: string, password: string, role?: string) {
    const result = await this.request<{
      user: any;
      accessToken: string;
      refreshToken: string;
    }>('/auth/register', {
      method: 'POST',
      body: { name, email, password, role },
    });
    this.setTokens(result.accessToken, result.refreshToken);
    return result;
  }

  // Users
  async getProfile() {
    return this.request<any>('/users/me');
  }

  // Rooms
  async createRoom(data: { title: string; type: string; description?: string; scheduledAt?: string; features?: Record<string, boolean> }) {
    return this.request<any>('/rooms', { method: 'POST', body: data });
  }

  async getRooms() {
    return this.request<any[]>('/rooms');
  }

  async getRoom(id: string) {
    return this.request<any>(`/rooms/${id}`);
  }

  async getRoomShareLink(id: string) {
    return this.request<{ roomId: string; title: string; status: string; inviteLink: string }>(
      `/rooms/${id}/share-link`,
    );
  }

  async joinRoom(id: string) {
    return this.request<any>(`/rooms/${id}/join`, { method: 'POST' });
  }

  async leaveRoom(id: string) {
    return this.request<any>(`/rooms/${id}/leave`, { method: 'POST' });
  }

  async endRoom(id: string) {
    return this.request<any>(`/rooms/${id}/end`, { method: 'POST' });
  }

  async getRoomParticipants(id: string) {
    return this.request<any[]>(`/rooms/${id}/participants`);
  }

  async getLobbyQueue(id: string) {
    return this.request<{ roomId: string; pending: Array<any> }>(`/rooms/${id}/lobby`);
  }

  async admitLobbyRequest(roomId: string, requestId: string) {
    return this.request<any>(`/rooms/${roomId}/lobby/${requestId}/admit`, { method: 'POST' });
  }

  async rejectLobbyRequest(roomId: string, requestId: string) {
    return this.request<any>(`/rooms/${roomId}/lobby/${requestId}/reject`, { method: 'POST' });
  }
}

export const api = new ApiClient(API_URL);
