// supabase-client.js
//
// Lazily initializes the official Supabase JS SDK, loaded via ESM CDN import
// (no npm, no build step — see docs/decisions/DEC-003-auth-implementation.md
// for why this is a justified dependency). Fetches its own config from
// /api/ceo/config rather than hardcoding values into a committed file.

let clientPromise = null;

export function getSupabaseClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const [{ createClient }, config] = await Promise.all([
        import('https://esm.sh/@supabase/supabase-js@2'),
        fetchConfig(),
      ]);
      return createClient(config.supabaseUrl, config.supabaseAnonKey);
    })();
  }
  return clientPromise;
}

async function fetchConfig() {
  const res = await fetch('/api/ceo/config');
  if (!res.ok) {
    throw new Error('Could not load AI CEO OS configuration.');
  }
  return res.json();
}
