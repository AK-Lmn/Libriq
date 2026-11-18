// Account deletion needs a recent sign-in. When it's too old, ask the reader
// to confirm who they are right here (password or Google) and retry once,
// instead of sending them to sign out and back in.

export function isRecentLoginError(err) {
  return String(err?.code || '').includes('requires-recent-login');
}

/** 'password' | 'google' | null, from getUserEmailAuthInfo() plus provider ids. */
export function reauthMethodFor(info) {
  if (info?.hasPasswordProvider) return 'password';
  if ((info?.providers || []).includes('google.com')) return 'google';
  return null;
}

/**
 * @param {{ deleteAccount: () => Promise<unknown>, confirmIdentity: () => Promise<boolean> }} deps
 *   confirmIdentity resolves false when the reader backs out, and throws when
 *   the check itself fails (wrong password, popup closed).
 * @returns {Promise<'deleted' | 'cancelled'>}
 */
export async function deleteAccountWithReauth({ deleteAccount, confirmIdentity }) {
  try {
    await deleteAccount();
    return 'deleted';
  } catch (err) {
    if (!isRecentLoginError(err)) throw err;
  }
  if (!(await confirmIdentity())) return 'cancelled';
  await deleteAccount();
  return 'deleted';
}
