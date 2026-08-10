import { Utils } from './utils.js';

export function resolveAccountDisplayName(profile, user) {
  const profileName = String(profile?.name || '').trim();
  if (profileName && profileName.toLowerCase() !== 'reader') return profileName;

  const displayName = Utils.formatDisplayName(user?.displayName);
  if (displayName) return displayName;

  return Utils.formatEmailPrefixName(user?.email) || 'Reader';
}
