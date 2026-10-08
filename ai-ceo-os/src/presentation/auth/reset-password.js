// reset-password.js
//
// One page, two modes, using the existing Supabase Auth recovery flow:
//   "request"  (default) — enter email → Supabase emails a recovery link.
//   "confirm"  — reached via that link; the SDK turns the link's token into a
//                temporary recovery session, and we set a new password with it.
// After a successful change the recovery session is signed out and the founder
// returns to the login page — access to the Command Center still requires the
// normal sign-in + admin_allowlist check (session-guard.js). This page grants
// nothing by itself.
//
// Passwords are only ever read from the inputs and handed to the SDK; they are
// never logged, stored or put in a URL.

import { getSupabaseClient } from '../shared/supabase-client.js';

const LOGIN_URL = '/ai-ceo-os/src/presentation/auth/login.html';
const RESET_PATH = '/ai-ceo-os/src/presentation/auth/reset-password.html';
const RECOVERY_FLAG = 'ceo-recovery-active'; // survives a refresh of the confirm page (this tab only)
const MIN_PASSWORD_LENGTH = 8;

const MSG = {
  linkInvalid: 'This reset link is invalid or has expired. Request a new one below.',
  requestSent: 'If that email is registered, a reset link is on its way. Check your inbox.',
  requestFailed: 'Could not send a reset link. Please try again.',
  rateLimited: 'Too many requests. Please wait a minute and try again.',
  generic: 'Something went wrong. Please try again.',
  empty: 'Enter and confirm your new password.',
  tooShort: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
  mismatch: 'The two passwords do not match.',
  samePassword: 'Choose a password that is different from your current one.',
  weakPassword: 'That password is too weak. Use a longer, less predictable one.',
  updateFailed: 'Could not update your password. Please try again.',
};

// Read BEFORE the SDK is created: the SDK consumes and strips the URL hash.
const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
const queryParams = new URLSearchParams(window.location.search);
const linkError = hashParams.get('error') || queryParams.get('error'); // e.g. otp_expired / access_denied
const fromRecoveryLink =
  hashParams.get('type') === 'recovery' || queryParams.has('code') || queryParams.get('type') === 'recovery';

const requestPanel = document.getElementById('ceo-reset-request-panel');
const confirmPanel = document.getElementById('ceo-reset-confirm-panel');
const requestForm = document.getElementById('ceo-reset-request-form');
const requestError = document.getElementById('ceo-reset-request-error');
const requestSuccess = document.getElementById('ceo-reset-request-success');
const requestSubmit = document.getElementById('ceo-reset-request-submit');
const confirmForm = document.getElementById('ceo-reset-confirm-form');
const confirmError = document.getElementById('ceo-reset-confirm-error');
const confirmSubmit = document.getElementById('ceo-reset-confirm-submit');

requestForm.addEventListener('submit', onRequestSubmit);
confirmForm.addEventListener('submit', onConfirmSubmit);
init();

async function init() {
  // An expired / already-used / otherwise rejected link: Supabase redirects
  // back here with an error instead of a token.
  if (linkError) {
    showRequestMode(MSG.linkInvalid);
    return;
  }

  try {
    const supabase = await getSupabaseClient();
    // getSession() waits for the SDK's initialisation, which is where the
    // recovery token in the URL is validated and turned into a session. A
    // token the server rejects leaves no session behind.
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (fromRecoveryLink) {
      if (session) {
        sessionStorage.setItem(RECOVERY_FLAG, '1');
        showConfirmMode();
      } else {
        showRequestMode(MSG.linkInvalid);
      }
      return;
    }

    // Plain visit. Only stay in confirm mode on a refresh of the confirm page
    // in the same tab — never merely because some session exists.
    if (session && sessionStorage.getItem(RECOVERY_FLAG) === '1') {
      showConfirmMode();
      return;
    }
    sessionStorage.removeItem(RECOVERY_FLAG);
    showRequestMode();
  } catch (err) {
    console.error('Reset page init failed:', err && err.message);
    showRequestMode(MSG.generic);
  }
}

function showRequestMode(notice) {
  requestPanel.hidden = false;
  confirmPanel.hidden = true;
  requestSuccess.hidden = true;
  if (notice) {
    requestError.textContent = notice;
    requestError.hidden = false;
  } else {
    requestError.hidden = true;
  }
}

function showConfirmMode() {
  requestPanel.hidden = true;
  confirmPanel.hidden = false;
  confirmError.hidden = true;
}

async function onRequestSubmit(e) {
  e.preventDefault();
  requestError.hidden = true;
  requestSuccess.hidden = true;

  const email = document.getElementById('ceo-reset-email').value.trim();
  if (!email) {
    requestError.textContent = 'Enter your email address.';
    requestError.hidden = false;
    return;
  }

  requestSubmit.disabled = true;
  try {
    const supabase = await getSupabaseClient();
    // Explicit target (not window.location.href): no stale hash/query is ever
    // carried into the emailed link, and it is the exact URL allowlisted in
    // Supabase → Authentication → URL Configuration.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${RESET_PATH}`,
    });

    if (error) {
      const limited = error.status === 429 || error.code === 'over_email_send_rate_limit';
      requestError.textContent = limited ? MSG.rateLimited : MSG.requestFailed;
      requestError.hidden = false;
    } else {
      requestSuccess.textContent = MSG.requestSent;
      requestSuccess.hidden = false;
      requestForm.reset();
    }
  } catch (err) {
    console.error('Reset request failed:', err && err.message);
    requestError.textContent = MSG.generic;
    requestError.hidden = false;
  } finally {
    requestSubmit.disabled = false;
  }
}

async function onConfirmSubmit(e) {
  e.preventDefault();
  confirmError.hidden = true;

  const password = document.getElementById('ceo-new-password').value;
  const confirmation = document.getElementById('ceo-confirm-password').value;

  const problem = !password || !confirmation ? MSG.empty
    : password.length < MIN_PASSWORD_LENGTH ? MSG.tooShort
    : password !== confirmation ? MSG.mismatch
    : null;
  if (problem) {
    showConfirmError(problem);
    return;
  }

  confirmSubmit.disabled = true;
  try {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      if (isMissingSession(error)) {
        // Recovery session gone or expired between opening the link and submitting.
        sessionStorage.removeItem(RECOVERY_FLAG);
        showRequestMode(MSG.linkInvalid);
      } else {
        showConfirmError(mapUpdateError(error));
      }
      confirmSubmit.disabled = false;
      return;
    }

    // Done. End the temporary recovery session (and any other session for this
    // account) so the new password must be used to sign in.
    sessionStorage.removeItem(RECOVERY_FLAG);
    try {
      await supabase.auth.signOut();
    } catch (_) {
      /* the redirect below still happens; login.js will not auto-enter without a valid session + allowlist */
    }
    window.location.replace(`${LOGIN_URL}?reset=ok`);
  } catch (err) {
    console.error('Password update failed:', err && err.message);
    showConfirmError(MSG.generic);
    confirmSubmit.disabled = false;
  }
}

function showConfirmError(message) {
  confirmError.textContent = message;
  confirmError.hidden = false;
}

function isMissingSession(error) {
  const code = error.code || '';
  return (
    error.name === 'AuthSessionMissingError' ||
    code === 'session_not_found' ||
    code === 'refresh_token_not_found' ||
    error.status === 401 ||
    error.status === 403
  );
}

function mapUpdateError(error) {
  const code = error.code || '';
  const msg = (error.message || '').toLowerCase();
  if (code === 'same_password' || msg.includes('different from the old password')) return MSG.samePassword;
  if (code === 'weak_password') return MSG.weakPassword;
  return MSG.updateFailed;
}
