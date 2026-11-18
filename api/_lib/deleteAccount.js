// Account deletion done on the server, so an interrupted browser can't leave
// half a library behind. The browser only proves who it is; the server wipes
// everything under users/{uid} (including paths the client no longer knows
// about) and then deletes the Firebase Auth user.

// Firebase's own deleteUser needs a sign-in within about five minutes. Use
// the same window so the server never deletes on a stale session.
export const RECENT_AUTH_SECONDS = 5 * 60;

function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

function bearerToken(req) {
  const header = String(req.headers?.authorization || '');
  const match = header.match(/^Bearer\s+(\S+)$/);
  return match ? match[1] : null;
}

/**
 * @param {{ getAdmin: () => Promise<null | {
 *   verifyIdToken(token: string, checkRevoked: boolean): Promise<{ uid: string, auth_time: number }>,
 *   recursiveDelete(path: string): Promise<void>,
 *   deleteDoc(path: string): Promise<void>,
 *   deleteUser(uid: string): Promise<void>,
 * }>, now?: () => number }} deps
 */
export function createDeleteAccountHandler({ getAdmin, now = Date.now }) {
  return async function deleteAccount(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return send(res, 405, { ok: false, code: 'method-not-allowed' });
    }

    const token = bearerToken(req);
    if (!token) return send(res, 401, { ok: false, code: 'invalid-token' });

    const admin = await getAdmin();
    if (!admin) return send(res, 503, { ok: false, code: 'not-configured' });

    let claims;
    try {
      claims = await admin.verifyIdToken(token, true);
    } catch {
      return send(res, 401, { ok: false, code: 'invalid-token' });
    }

    const ageSeconds = Math.floor(now() / 1000) - Number(claims.auth_time);
    if (!Number.isFinite(ageSeconds) || ageSeconds > RECENT_AUTH_SECONDS) {
      return send(res, 403, { ok: false, code: 'auth/requires-recent-login' });
    }

    const uid = claims.uid;
    try {
      // Data first: if anything below fails the account still exists, so the
      // reader can sign in and try again. The other order could orphan data.
      await admin.recursiveDelete(`users/${uid}`);
      await admin.deleteDoc(`polls/mobile_app/votes/${uid}`);
      await admin.deleteUser(uid);
    } catch (err) {
      console.error('[delete-account] failed', { uid, code: err?.code || null, message: err?.message || String(err) });
      return send(res, 500, { ok: false, code: 'delete-failed' });
    }
    return send(res, 200, { ok: true });
  };
}
