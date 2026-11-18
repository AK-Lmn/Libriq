// Ask the server (api/delete-account.js) to wipe the account. Returns
// 'deleted' when the server removed the data and the Firebase user, or
// 'fallback' when the route isn't available here (local dev, or the server
// credentials aren't set), so the caller can delete from the client instead.
export async function deleteAccountOnServer({ getIdToken, fetchFn = globalThis.fetch }) {
  const token = await getIdToken();
  if (!token) return 'fallback';

  let res;
  try {
    res = await fetchFn('/api/delete-account', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'omit',
    });
  } catch {
    return 'fallback';
  }

  if (res.ok) return 'deleted';
  if ([404, 405, 503].includes(res.status)) return 'fallback';

  const body = await res.json().catch(() => ({}));
  if (body?.code === 'auth/requires-recent-login') {
    const error = new Error('For security, please sign in again before deleting your account.');
    error.code = 'auth/requires-recent-login';
    throw error;
  }
  const error = new Error('The server could not delete this account.');
  error.code = 'account-delete-failed';
  error.status = res.status;
  throw error;
}
