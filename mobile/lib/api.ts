import { API_BASE_URL } from './config';

export type TokenPair = {
  access_token: string;
  refresh_token: string;
  token_type: string;
};

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function toFormBody(data: Record<string, string>) {
  return new URLSearchParams(data).toString();
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed?.detail === 'string') {
        message = parsed.detail;
      } else if (Array.isArray(parsed?.detail)) {
        message = parsed.detail
          .map((item: { msg?: string }) => item?.msg)
          .filter(Boolean)
          .join(', ');
      }
    } catch {
      // ignore JSON parse errors
    }
    throw new ApiError(message || `Request failed with status ${response.status}`, response.status);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  if (!text) {
    return undefined as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

export async function register(email: string, password: string) {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new ApiError('Cannot reach backend. Check API URL and backend server.', 0);
  }
  return handleResponse(response);
}

export async function login(email: string, password: string): Promise<TokenPair> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: toFormBody({ username: email, password }),
    });
  } catch {
    throw new ApiError('Cannot reach backend. Check API URL and backend server.', 0);
  }
  return handleResponse(response);
}

export async function refresh(refreshToken: string): Promise<TokenPair> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  } catch {
    throw new ApiError('Cannot reach backend. Check API URL and backend server.', 0);
  }
  return handleResponse(response);
}

export async function logout(refreshToken: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function apiRequest<T>(
  path: string,
  token: string,
  options: RequestOptions = {}
) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...(options.headers ?? {}),
  };
  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    if (typeof FormData !== 'undefined' && options.body instanceof FormData) {
      body = options.body;
    } else if (typeof options.body === 'string') {
      body = options.body;
    } else {
      body = JSON.stringify(options.body);
      if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
    }
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body,
  });
  return handleResponse<T>(response);
}

export async function apiGet<T>(path: string, token: string) {
  return apiRequest<T>(path, token);
}
