// functions/api/ceo/auth/session.js  ->  GET /api/ceo/auth/session
//
// The single endpoint every protected page calls before rendering anything.
// Thin routing only (per functions/api/ceo/README.md's rule) — the real
// logic lives in functions/utils/ceo/verify-session.js so future Wave 4+
// Functions can reuse the exact same check without duplicating it.

import { verifySession } from '../../../utils/ceo/verify-session.js';

export async function onRequestGet({ request, env }) {
  const result = await verifySession(request, env);

  const status = result.authorized
    ? 200
    : result.reason === 'not_allowlisted'
      ? 403
      : 401;

  return new Response(JSON.stringify(result), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
