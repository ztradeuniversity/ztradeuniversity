// api.js
//
// Authenticated fetch wrapper for the AI CEO OS Functions. Attaches the
// current Supabase session token; redirects to 401 on session loss (same
// contract as session-guard.js, so a mid-session expiry behaves identically
// to a load-time one).

import { getSupabaseClient } from './supabase-client.js';

export async function apiFetch(path, options = {}) {
  const supabase = await getSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    window.location.replace('/ai-ceo-os/src/presentation/errors/401.html');
    throw new Error('no_session');
  }
  const res = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (res.status === 401 || res.status === 403) {
    window.location.replace(`/ai-ceo-os/src/presentation/errors/${res.status}.html`);
    throw new Error(`auth_${res.status}`);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `request_failed_${res.status}`);
  }
  return body;
}

export const getJson = (path) => apiFetch(path);
export const postJson = (path, data) => apiFetch(path, { method: 'POST', body: JSON.stringify(data) });
