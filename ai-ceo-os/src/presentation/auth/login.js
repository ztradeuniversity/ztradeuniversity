// login.js
import { getSupabaseClient } from '../shared/supabase-client.js';

const form = document.getElementById('ceo-login-form');
const errorBox = document.getElementById('ceo-login-error');
const submitBtn = document.getElementById('ceo-login-submit');
const spinner = document.getElementById('ceo-login-spinner');

// If already signed in, don't make the founder log in again.
(async () => {
  const supabase = await getSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) {
    window.location.replace('/ai-ceo-os/src/presentation/command-center/index.html');
  }
})();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError();
  setLoading(true);

  const email = document.getElementById('ceo-email').value.trim();
  const password = document.getElementById('ceo-password').value;

  try {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      showError(mapAuthError(error));
      setLoading(false);
      return;
    }

    // Allowlist check happens on the destination page via session-guard.js —
    // login.js's only job is proving a valid Supabase credential.
    window.location.replace('/ai-ceo-os/src/presentation/command-center/index.html');
  } catch (err) {
    console.error(err);
    showError('Something went wrong. Please try again.');
    setLoading(false);
  }
});

function mapAuthError(error) {
  const msg = (error.message || '').toLowerCase();
  if (msg.includes('email not confirmed')) {
    return 'Please verify your email before signing in.';
  }
  if (msg.includes('invalid login credentials')) {
    return 'Incorrect email or password.';
  }
  return 'Sign-in failed. Please try again.';
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function hideError() {
  errorBox.hidden = true;
}

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  spinner.hidden = !isLoading;
}
