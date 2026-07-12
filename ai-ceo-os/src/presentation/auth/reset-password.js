// reset-password.js
//
// One page, two modes: "request" (default — enter email, get a link) and
// "confirm" (reached via the emailed link, which Supabase's SDK detects
// automatically from the URL and turns into a temporary recovery session).

import { getSupabaseClient } from '../shared/supabase-client.js';

const requestPanel = document.getElementById('ceo-reset-request-panel');
const confirmPanel = document.getElementById('ceo-reset-confirm-panel');

init();

async function init() {
  const supabase = await getSupabaseClient();

  // The SDK, with detectSessionInUrl enabled by default, turns a recovery
  // link's token into a real (temporary) session. If one exists, we're in
  // confirm mode.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const isRecovery = window.location.hash.includes('type=recovery') || Boolean(session);

  if (isRecovery) {
    showConfirmMode();
  } else {
    showRequestMode();
  }
}

function showRequestMode() {
  requestPanel.hidden = false;
  confirmPanel.hidden = true;

  const form = document.getElementById('ceo-reset-request-form');
  const errorBox = document.getElementById('ceo-reset-request-error');
  const successBox = document.getElementById('ceo-reset-request-success');
  const submitBtn = document.getElementById('ceo-reset-request-submit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.hidden = true;
    successBox.hidden = true;
    submitBtn.disabled = true;

    const email = document.getElementById('ceo-reset-email').value.trim();

    try {
      const supabase = await getSupabaseClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.href,
      });

      if (error) {
        errorBox.textContent = 'Could not send a reset link. Please try again.';
        errorBox.hidden = false;
      } else {
        successBox.hidden = false;
        form.reset();
      }
    } catch (err) {
      console.error(err);
      errorBox.textContent = 'Something went wrong. Please try again.';
      errorBox.hidden = false;
    } finally {
      submitBtn.disabled = false;
    }
  });
}

function showConfirmMode() {
  requestPanel.hidden = true;
  confirmPanel.hidden = false;

  const form = document.getElementById('ceo-reset-confirm-form');
  const errorBox = document.getElementById('ceo-reset-confirm-error');
  const submitBtn = document.getElementById('ceo-reset-confirm-submit');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.hidden = true;
    submitBtn.disabled = true;

    const password = document.getElementById('ceo-new-password').value;

    try {
      const supabase = await getSupabaseClient();
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        errorBox.textContent = 'Could not update your password. Please try again.';
        errorBox.hidden = false;
        submitBtn.disabled = false;
        return;
      }

      window.location.replace('/ai-ceo-os/src/presentation/auth/login.html');
    } catch (err) {
      console.error(err);
      errorBox.textContent = 'Something went wrong. Please try again.';
      errorBox.hidden = false;
      submitBtn.disabled = false;
    }
  });
}
