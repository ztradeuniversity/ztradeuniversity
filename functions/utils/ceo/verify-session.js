// functions/utils/ceo/verify-session.js
//
// Shared server-side auth check for the AI CEO OS. Every protected Cloudflare
// Function under functions/api/ceo/ imports and calls this instead of
// duplicating the logic. Never used by any existing ZTU function — this file
// only knows about the OS's own Supabase project and its admin_allowlist.
//
// "Being authenticated is necessary, never sufficient" (Technical Architecture
// §6): step 1 confirms the bearer token is a real, current Supabase session;
// step 2 confirms that session's email is on admin_allowlist. Both must pass.

export async function verifySession(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return { authorized: false, reason: 'no_token' };
  }

  // Step 1: is this a real, current Supabase session? Ask Supabase directly —
  // never trust a client-presented claim without a fresh server-side check.
  const userRes = await fetch(`${env.CEO_SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: env.CEO_SUPABASE_ANON_KEY,
    },
  });

  if (!userRes.ok) {
    return { authorized: false, reason: 'invalid_session' };
  }

  const authUser = await userRes.json();
  const email = authUser.email;
  const userId = authUser.id;

  if (!email || !userId) {
    return { authorized: false, reason: 'invalid_session' };
  }

  // Step 2: is this email on the allowlist? Uses the service_role key
  // deliberately — this is the one place server-side code is trusted with
  // elevated access, to check a table RLS otherwise locks to admins only
  // (a chicken-and-egg problem: we can't use is_admin() to check admin
  // status before we know if this user IS an admin).
  const allowlistRes = await fetch(
    `${env.CEO_SUPABASE_URL}/rest/v1/admin_allowlist?email=eq.${encodeURIComponent(email)}&select=email`,
    {
      headers: {
        Authorization: `Bearer ${env.CEO_SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: env.CEO_SUPABASE_SERVICE_ROLE_KEY,
      },
    }
  );

  if (!allowlistRes.ok) {
    // Fail closed: a denial due to an infrastructure error is safer than a
    // false authorization.
    return { authorized: false, reason: 'allowlist_check_failed' };
  }

  const rows = await allowlistRes.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    return { authorized: false, reason: 'not_allowlisted' };
  }

  return { authorized: true, user: { id: userId, email } };
}
