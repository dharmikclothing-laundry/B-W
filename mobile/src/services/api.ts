import {API_BASE_URL} from '../config/environment';
import {
  getStoredSession,
  refreshStoredSession,
} from './sessionManager';

export {API_BASE_URL};

export function getApiErrorMessage(
  data: unknown,
  fallback: string,
): string {
  if (
    typeof data === 'object' &&
    data !== null &&
    'message' in data
  ) {
    const message = (
      data as {
        message?: unknown;
      }
    ).message;

    if (Array.isArray(message)) {
      return message
        .map(value => String(value))
        .join('\n');
    }

    if (
      typeof message === 'string' &&
      message.trim()
    ) {
      return message;
    }
  }

  return fallback;
}

type ApiRequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  accessToken?: string;
  body?: unknown;
  retryAuthentication?: boolean;
};

export const API_TIMEOUT_MS = 20_000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fetch(url, {...init, signal: controller.signal}),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error(init.method === 'GET'
            ? 'Request timed out. Check your connection and try again.'
            : 'Request timed out. Check your orders before retrying.'));
        }, API_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Request timed out')) throw error;
    if (error instanceof TypeError) throw new Error('Network unavailable. Check your connection and try again.');
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function parseResponse(
  response: Response,
) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const {
    method = 'GET',
    accessToken,
    body,
    retryAuthentication = true,
  } = options;

  const activeAccessToken =
    accessToken ||
    getStoredSession()?.accessToken;

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (activeAccessToken) {
    headers.Authorization =
      `Bearer ${activeAccessToken}`;
  }

  if (body !== undefined) {
    headers['Content-Type'] =
      'application/json';
  }

  let response = await fetchWithTimeout(
    `${API_BASE_URL}${path}`,
    {
      method,
      headers,
      body:
        body === undefined
          ? undefined
          : JSON.stringify(body),
    },
  );

  if (
    response.status === 401 &&
    activeAccessToken &&
    retryAuthentication
  ) {
    const refreshedAccessToken =
      await refreshStoredSession();

    response = await fetchWithTimeout(
      `${API_BASE_URL}${path}`,
      {
        method,
        headers: {
          ...headers,
          Authorization:
            `Bearer ${refreshedAccessToken}`,
        },
        body:
          body === undefined
            ? undefined
            : JSON.stringify(body),
      },
    );
  }

  const data: unknown =
    await parseResponse(response);

  if (!response.ok) {
    throw new Error(
      getApiErrorMessage(
        data,
        `Request failed with status ${response.status}`,
      ),
    );
  }

  return data as T;
}
