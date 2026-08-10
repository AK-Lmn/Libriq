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
    const displayName = resolveAccountDisplayName(profile, actions.getFirebaseState?.().user);
    const stats = storage.getStats();

    main.innerHTML = `
      <div class="page profile-page page--narrow" id="profilePage">
        <div class="page-header page-header--spaced">
          <h1 class="page-title">Profile</h1>
        </div>

        <div class="goal-widget goal-widget--section-sm">
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
        </div>

        <div class="goal-widget profile-stats-card">
          <div class="goal-header"><div class="goal-title">Reading Stats</div></div>
          <div class="stats-row profile-stats-row profile-stats-grid">
            <div class="stat-card"><div class="stat-card-value">${stats.total}</div><div class="stat-card-label">Books tracked</div></div>
            <div class="stat-card"><div class="stat-card-value">${stats.finished}</div><div class="stat-card-label">Books finished</div></div>
            <div class="stat-card"><div class="stat-card-value">${utils.formatNumber(stats.totalPages)}</div><div class="stat-card-label">Pages read</div></div>
            <div class="stat-card"><div class="stat-card-value">${stats.avgRating || '–'}</div><div class="stat-card-label">Avg rating</div></div>
          </div>
        </div>
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
