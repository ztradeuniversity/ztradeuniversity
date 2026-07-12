// session-guard.js
//
// Runs at the top of every protected page. `<body class="ceo-auth-pending">`
// starts hidden (base.css); this module reveals it only after the server
// confirms authorization, or redirects away — never a flash of protected
// content (Frontend Constitution's UX governance).

import { getSupabaseClient } from './supabase-client.js';

export async function guardPage() {
  try {
    const supabase = await getSupabaseClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      redirectTo('/ai-ceo-os/src/presentation/errors/401.html');
      return null;
    }

    const res = await fetch('/api/ceo/auth/session', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (res.status === 403) {
      redirectTo('/ai-ceo-os/src/presentation/errors/403.html');
      return null;
    }

    if (!res.ok) {
      redirectTo('/ai-ceo-os/src/presentation/errors/401.html');
      return null;
    }

    const result = await res.json();
    document.body.classList.remove('ceo-auth-pending');
    return result.user;
  } catch (err) {
    console.error('Session guard failed:', err);
    redirectTo('/ai-ceo-os/src/presentation/errors/500.html');
    return null;
  }
}

function redirectTo(path) {
  window.location.replace(path);
}
