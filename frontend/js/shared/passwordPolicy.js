// Password rules for new accounts. Matches the Firebase Authentication
// password policy (Console -> Authentication -> Settings -> Password policy),
// which is what actually enforces it; this check just answers sooner.
export const MIN_PASSWORD_LENGTH = 8;
// Firebase refuses anything longer.
export const MAX_PASSWORD_LENGTH = 4096;

/** @returns {string|null} a message for the reader, or null when it's fine */
export function newPasswordProblem(password) {
  const length = [...String(password ?? '')].length;
  if (length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`;
  if (length > MAX_PASSWORD_LENGTH) return 'That password is too long.';
  return null;
}
