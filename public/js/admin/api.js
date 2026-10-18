// Supabase client + request wrapper with session-expiry handling.
// The browser only ever holds the PUBLISHABLE key. Authorisation is enforced
// by Row Level Security and the admin-only RPCs, never by this file.

export const config = window.BELAL_PORTFOLIO_CONFIG || {};

export const client =
  window.supabase && config.supabaseUrl && config.publishableKey
    ? window.supabase.createClient(config.supabaseUrl, config.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;

/** Fires `expired` when the session can no longer be refreshed. */
export const sessionEvents = new EventTarget();

export function isMissingFunction(error) {
  const text = `${error?.code || ''} ${error?.message || ''}`;
  return /PGRST202|42883|Could not find the function|schema cache/i.test(text);
}

export function isMissingRelation(error) {
  return /PGRST205|42P01|Could not find the table/i.test(`${error?.code || ''} ${error?.message || ''}`);
}

export function isAuthError(error) {
  if (!error) return false;
  if (error.status === 401) return true;
  return /PGRST301|JWT expired|invalid JWT|JWT.*(expired|invalid)|Invalid Refresh Token/i
    .test(`${error.code || ''} ${error.message || ''}`);
}

/** Human-readable text for an error coming back from Supabase. */
export function describeError(error) {
  if (!error) return 'Unexpected error.';
  const code = error.code || '';
  const message = error.message || String(error);
  if (code === '42501' || /row-level security|permission denied|Not authorized/i.test(message)) {
    return 'Permission denied. This account is not allowed to do that.';
  }
  if (code === '23514') return 'The database rejected a value (too long or in the wrong format).';
  if (code === '23505') return 'That already exists.';
  if (isMissingFunction(error) || isMissingRelation(error)) {
    return 'This feature needs the latest database migrations. Apply them and refresh.';
  }
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
    return 'Network error. Check your connection and try again.';
  }
  return message;
}

/**
 * Runs `fn` (which must return a Supabase `{ data, error }` result). On an
 * authentication error it refreshes the session once and retries; if that
 * fails it emits `expired` so the UI can ask the user to sign in again.
 */
export async function call(fn) {
  let result;
  try {
    result = await fn();
  } catch (error) {
    result = { data: null, error };
  }
  if (!isAuthError(result.error)) return result;

  const { error: refreshError } = await client.auth.refreshSession();
  if (refreshError) {
    sessionEvents.dispatchEvent(new Event('expired'));
    return result;
  }
  try {
    result = await fn();
  } catch (error) {
    result = { data: null, error };
  }
  if (isAuthError(result.error)) sessionEvents.dispatchEvent(new Event('expired'));
  return result;
}

/** Like `call`, but returns the data and throws an Error with a readable message. */
export async function run(fn) {
  const { data, error } = await call(fn);
  if (error) {
    const wrapped = new Error(describeError(error));
    wrapped.cause = error;
    wrapped.missing = isMissingFunction(error) || isMissingRelation(error);
    throw wrapped;
  }
  return data;
}
