import { resolveAccountDisplayName } from '../../accountDisplayName.js';

export function createProfilePage({ storage, utils, constants, actions = {}, documentRoot } = {}) {
  let boundMain = null;
  const getDocument = () => documentRoot || globalThis.document;

  function getDisplayNameForAccount(user) {
    return resolveAccountDisplayName(storage.getProfile(), user);
  }

  function renderProfilePage() {
    const pageDocument = getDocument();
    const main = pageDocument?.getElementById?.('mainContent');
    if (!main) {
      console.error('[LibriQ] Missing #mainContent while rendering profile page.');
      return;
    }
    const profile = storage.getProfile();
    const user = actions.getFirebaseState?.().user;
    const displayName = resolveAccountDisplayName(profile, user);
    const stats = storage.getStats();
    const streak = storage.getStreak?.();
    const creationTime = user?.metadata?.creationTime;
    const joined = creationTime && Number.isFinite(new Date(creationTime).getTime())
      ? `Joined ${new Date(creationTime).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`
      : 'Join date unavailable';
    const icon = name => `<img class="profile-icon" src="assets/revamp/account/20-1118-${name}.svg" alt="" aria-hidden="true" />`;
    const totals = [
      ['library', 'Total books', stats.total ?? 0, 'Your personal library'],
      ['book-check', 'Books finished', stats.finished ?? 0, `${stats.finishedThisYear ?? 0} finished this year`],
      ['files', 'Pages read', utils.formatNumber(stats.totalPages ?? 0), 'Across finished books'],
      ['flame', 'Longest streak', streak?.best ?? '–', 'Consecutive reading days', 'days'],
      ['star', 'Avg rating', stats.avgRating || '–', `${stats.ratedCount ?? 0} rated books`, '/ 5'],
    ];

    main.innerHTML = `
      <div class="page profile-page" id="profilePage">
        <header class="profile-header">
          <span class="profile-eyebrow">Your private workspace</span>
          <h1 class="page-title">Profile</h1>
          <p class="profile-subtitle">A little space for a lifetime of reading.</p>
        </header>

        <section class="profile-identity" aria-label="Account identity">
          <div class="profile-identity-row">
            ${user?.photoURL ? `<img class="profile-avatar" src="${utils.sanitize(user.photoURL)}" alt="" referrerpolicy="no-referrer" />` : `<div class="profile-avatar profile-avatar--fallback" aria-hidden="true">${utils.sanitize(displayName.slice(0, 1).toUpperCase())}</div>`}
            <div class="profile-account-copy">
              <h2>${utils.sanitize(displayName)}</h2>
              <p>${utils.sanitize(user?.email || 'Account email unavailable')}</p>
            </div>
            <span class="profile-private">${icon('lock-keyhole1')} Private account</span>
          </div>
          <div class="profile-membership">${icon('calendar-days')} ${utils.sanitize(joined)}</div>
        </section>

        <section class="profile-stats" aria-labelledby="profileStatsTitle">
          <header><h2 id="profileStatsTitle">Your reading at a glance</h2><p>All time · Every page adds up.</p></header>
          <div class="profile-stats-grid">
            ${totals.map(([symbol, label, value, description, unit]) => `
              <article class="profile-stat">
                <h3><span class="profile-icon-well">${icon(symbol)}</span>${label}</h3>
                <div class="profile-stat-value">${utils.sanitize(value)}${unit ? `<small>${unit}</small>` : ''}</div>
                <p>${description}</p>
              </article>`).join('')}
          </div>
        </section>

        <details class="profile-editor">
          <summary>Edit profile</summary>
          <form id="profileForm" class="add-book-form" data-action="save-profile">
            <div class="form-group">
              <label class="form-label" for="profileName">Display name</label>
              <input type="text" id="profileName" name="name"
                class="form-input" value="${utils.sanitize(displayName)}"
                placeholder="Your name" maxlength="40" />
              <div class="text-xs text-tertiary field-help">Use any name you want LibriQ to call you.</div>
            </div>
            <div class="form-group">
              <label class="form-label" for="profileBio">Bio <span class="text-tertiary">(optional)</span></label>
              <textarea id="profileBio" name="bio" class="form-input form-textarea"
                placeholder="A few words about your reading life…"
                maxlength="200">${utils.sanitize(profile.bio || '')}</textarea>
            </div>
            <button type="submit" class="btn btn-primary">
              <i class="ph ph-floppy-disk"></i> Save Profile
            </button>
          </form>
        </details>
        <footer class="profile-footer">${icon('lock-keyhole')} Your books. Your space. Always private.</footer>
      </div>`;

    if (boundMain === main) return;
    boundMain = main;
    main.addEventListener('submit', event => {
      if (!event.target.matches?.('[data-action="save-profile"]')) return;
      event.preventDefault();
      storage.saveProfile({
        name: pageDocument.getElementById('profileName')?.value || '',
        bio: pageDocument.getElementById('profileBio')?.value || '',
      });
      utils.toast('Profile saved', 'success');
      actions.profileSaved?.();
    });
  }

  renderProfilePage.getDisplayNameForAccount = getDisplayNameForAccount;
  return renderProfilePage;
}
