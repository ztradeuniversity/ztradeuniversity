// functions/api/ceo/config.js  ->  GET /api/ceo/config
//
// Returns the two public-safe values the browser needs to initialize the
// Supabase client. Not a secret leak: the anon key is designed to be public
// (RLS is the real gate, per the RLS Constitution). This exists so no value
// has to be hardcoded into a committed static file — the single source of
// truth stays the Cloudflare environment variables.

export async function onRequestGet({ env }) {
  if (!env.CEO_SUPABASE_URL || !env.CEO_SUPABASE_ANON_KEY) {
    return new Response(
      JSON.stringify({ error: 'server_misconfigured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({
      supabaseUrl: env.CEO_SUPABASE_URL,
      supabaseAnonKey: env.CEO_SUPABASE_ANON_KEY,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=300',
      },
    }
  );
}
