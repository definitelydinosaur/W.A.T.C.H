import supabase from './supabase';

const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');

export async function profileApi<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!API_URL) {
    throw new Error('Set EXPO_PUBLIC_API_URL to your backend URL.');
  }

  const { data, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!data.session) {
    throw new Error('Your session expired. Please log in again.');
  }

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${data.session.access_token}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
  });
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error(`The server returned an invalid response (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    const message = (result as { message?: string | string[] }).message;
    throw new Error(
      Array.isArray(message)
        ? message.join(', ')
        : message ?? `Request failed (HTTP ${response.status}).`,
    );
  }

  return result as T;
}
