export function createSettingsPage({ storage, utils, constants, actions, documentRoot }) {
  if (!storage || !utils || !constants || !actions) {
    throw new TypeError('createSettingsPage requires storage, utils, constants, and actions.');
  }
  const pageDocument = documentRoot || globalThis.document;
  let boundMain = null;

  function renderSettingsPage() {
    const main  = pageDocument.getElementById('mainContent');
    if (!main) {
      console.error('[LibriQ] Missing #mainContent while rendering settings page.');
      return;
    }
    if (globalThis.localStorage?.getItem('libriq_debug_auto_backup')) {
      console.debug('[LibriQ][AutoBackup] full settings render');
    }
    const theme = actions.getActiveTheme?.() || pageDocument.documentElement.getAttribute('data-theme') || 'dark';
    const backupMeta = storage.getBackupMeta?.() || { lastExportedAt: null };
    const hasBooks = storage.getBooks().length > 0;
    const firebase = actions.getFirebaseState();
    const cloudBackupMeta = storage.getCloudBackupMeta?.() || { lastCloudBackupAt: null, bookCount: null, activityCount: null };
    const lastExportedText = backupMeta.lastExportedAt
      ? utils.formatDate(backupMeta.lastExportedAt)
      : 'No backup exported yet.';
    const lastCloudBackupText = cloudBackupMeta.lastCloudBackupAt
      ? utils.formatDate(cloudBackupMeta.lastCloudBackupAt)
      : 'No cloud backup yet.';

    main.innerHTML = `
      <div class="page settings-page" id="settingsPage">
        <div class="settings-header">
          <div class="settings-heading">
            <span class="settings-eyebrow">App preferences</span>
            <h1 class="page-title">Settings</h1>
            <p class="page-subtitle">Tune the app, manage backups, and keep your library safe.</p>
          </div>
        </div>

        <div class="settings-grid">
          <section class="goal-widget settings-panel settings-panel-theme">
            <div class="goal-header">
              <div>
                <div class="goal-title">Appearance</div>
                <div class="settings-panel-subtitle">Choose the surface that feels best for your reading sessions.</div>
              </div>
            </div>
            <div class="settings-row settings-row-action">
              <div class="activity-text">
                <div class="activity-title">Theme</div>
                <div class="activity-subtitle">Switch between the Studio dark and light palettes.</div>
              </div>
              <button class="btn btn-secondary btn-sm" type="button" data-action="toggle-theme">
                <i class="ph ph-${theme === 'dark' ? 'sun' : 'moon'}"></i>
                Switch to ${theme === 'dark' ? 'light' : 'dark'}
              </button>
            </div>
          </section>

          <section class="goal-widget settings-panel">
            <div class="goal-header">
              <div>
                <div class="goal-title">Account</div>
                <div class="settings-panel-subtitle">Sign in only when you want backup, sync, or multi-device continuity.</div>
              </div>
            </div>
            ${_buildAccountSection(firebase)}
            <div class="settings-session-actions">
              <button class="btn btn-secondary btn-sm" type="button" data-action="choose-session-mode">
                <i class="ph ph-arrow-counter-clockwise"></i>
                Choose start mode
              </button>
            </div>
          </section>

          <section class="goal-widget settings-panel settings-panel-cloud">
            <div class="goal-header">
              <div>
                <div class="goal-title">Cloud Backup</div>
                <div class="settings-panel-subtitle">Keep a recovery copy tied to your signed-in account.</div>
              </div>
            </div>
            ${_buildCloudBackupSection(firebase, cloudBackupMeta)}
          </section>

          <section class="goal-widget settings-panel settings-panel-sync">
            <div class="goal-header">
              <div>
                <div class="goal-title">Account Sync</div>
                <div class="settings-panel-subtitle">Sync status and safety notes are separated from everyday backup controls.</div>
              </div>
            </div>
            ${_buildSyncSection(firebase)}
          </section>

          <section class="goal-widget settings-panel settings-panel-data">
            <div class="goal-header">
              <div>
                <div class="goal-title">Export / Import</div>
                <div class="settings-panel-subtitle">Move your library between devices with a JSON backup.</div>
              </div>
            </div>
            <div class="settings-row settings-row-action">
              <div class="activity-text">
                <div class="activity-title">Export library</div>
                <div class="activity-subtitle">Download your data as JSON. Private notes are included.</div>
              </div>
              <button class="btn btn-secondary btn-sm" type="button" data-action="export-data">
                <i class="ph ph-download-simple"></i> Export
              </button>
            </div>
            <div class="settings-row settings-row-action">
              <div class="activity-text">
                <div class="activity-title">Import library</div>
                <div class="activity-subtitle">Review a backup before replacing or merging your library.</div>
              </div>
              <button class="btn btn-secondary btn-sm" type="button" data-action="prompt-import">
                <i class="ph ph-upload-simple"></i> Import
              </button>
            </div>
            <div class="settings-row settings-row-danger">
              <div class="activity-text">
                <div class="activity-title">Danger zone</div>
                <div class="activity-subtitle">Destructive account and cloud data actions live here.</div>
              </div>
              <div class="settings-danger-actions">
                <button class="btn btn-danger btn-sm" type="button" data-action="delete-library">
                  <i class="ph ph-trash"></i> Delete library data
                </button>
                <button class="btn btn-danger btn-sm" type="button" data-action="delete-account">
                  <i class="ph ph-user-minus"></i> Delete account
                </button>
              </div>
            </div>
            <div class="settings-row">
              <div class="activity-text">
                <div class="activity-title">Last exported</div>
                <div class="activity-subtitle">${lastExportedText}</div>
              </div>
            </div>
            <div class="settings-row">
              <div class="activity-text">
                <div class="activity-title">Last cloud backup</div>
                <div class="activity-subtitle">${lastCloudBackupText}</div>
              </div>
            </div>
            ${hasBooks && !backupMeta.lastExportedAt ? `
              <div class="settings-callout">
                Consider exporting a backup before making larger changes.
              </div>` : ''}
            <input id="importLibraryInput" type="file" accept="application/json,.json" hidden data-action="import-file" />
          </section>

          <section class="goal-widget settings-panel">
            <div class="goal-header">
              <div>
                <div class="goal-title">Privacy / Data</div>
                <div class="settings-panel-subtitle">A local-first app with optional account features.</div>
              </div>
            </div>
            <p class="text-sm text-secondary settings-copy">
              LibriQ works without an account. Your library stays on this device unless you choose to back it up, sync it, or export it.
            </p>
            <div class="settings-list">
              ${[
                ['Local library storage', 'LibriQ stores your library locally on this device.'],
                ['Analytics', 'LibriQ uses anonymous page views to understand general traffic.'],
                ['Accounts are optional', 'You can keep using LibriQ without signing in.'],
                ['Backup and sync', 'Backup, restore, merge, and Account Sync stay separate.'],
                ['JSON export', 'Export a copy anytime for your own backup.'],
                ['Private notes and quotes', 'Private notes and quotes stay local unless you include them in a backup.'],
                ['Continue offline', 'Offline mode keeps your books on this device.'],
              ].map(([title, subtitle]) => `
                <div class="settings-row">
                  <div class="activity-text">
                    <div class="activity-title">${title}</div>
                    <div class="activity-subtitle">${subtitle}</div>
                  </div>
                </div>`).join('')}
            </div>
          </section>

          <section class="goal-widget settings-panel">
            <div class="goal-header">
              <div>
                <div class="goal-title">About</div>
                <div class="settings-panel-subtitle">Version and source notes for the current build.</div>
              </div>
            </div>
            <p class="text-sm text-secondary settings-copy">
              <strong class="text-primary">LibriQ</strong> v${constants.VERSION}<br>
              Your reading life, beautifully organized.<br>
              Book data from <a href="https://openlibrary.org" target="_blank" rel="noopener noreferrer" class="text-link">Open Library</a> and <a href="https://books.google.com" target="_blank" rel="noopener noreferrer" class="text-link">Google Books</a>.
              <br>Manual cloud backup is available for signed-in users.
            </p>
          </section>
        </div>
      </div>`;

    bindSettingsActions(main);
  }

  function _buildAccountSection(firebase) {
    if (!firebase.initialized) {
      return `
        <div class="activity-item activity-item--static">
          <div class="activity-text">
            <div class="activity-title">Account</div>
            <div class="activity-subtitle">Loading account status…</div>
          </div>
        </div>`;
    }

    if (!firebase.available) {
      return `
        <div class="activity-item activity-item--static">
          <div class="activity-text">
            <div class="activity-title">Account</div>
            <div class="activity-subtitle">Account features are unavailable in this build.</div>
          </div>
        </div>`;
    }

    if (!firebase.user) {
      return `
        <div class="activity-item activity-item--static activity-item--centered">
          <div class="activity-text">
            <div class="activity-title">Account</div>
            <div class="activity-subtitle">Sign in to enable cloud backup.</div>
          </div>
          <button class="btn btn-secondary btn-sm" id="accountActionBtn" type="button" data-action="account-action" data-account-action="signin">
            Sign in
          </button>
        </div>`;
    }

    const user = firebase.user;
    const emailInfo = actions.getUserEmailAuthInfo(user) || {
      email: String(user.email || '').trim(),
      emailVerified: false,
      hasPasswordProvider: false,
      hasEmail: Boolean(String(user.email || '').trim()),
    };
    const avatar = user.photoURL
      ? `<img src="${utils.sanitize(user.photoURL)}" alt="" aria-hidden="true" class="account-avatar" />`
      : `<div class="account-avatar account-avatar--fallback">${utils.sanitize((user.displayName || user.email || 'U').slice(0,1).toUpperCase())}</div>`;
    const cloudState = actions.getCloudBackupState();
    const hasFirestore = actions.hasFirestore();
    const offlineMode = actions.getSessionPreference?.() === 'offline';
    const isGoogleOnly = Array.isArray(emailInfo.providerData) && emailInfo.providerData.length > 0 && emailInfo.providerData.every(provider => provider.providerId === 'google.com');
    const canEmailActions = emailInfo.hasEmail && emailInfo.hasPasswordProvider;
    const showVerificationNotice = canEmailActions && !emailInfo.emailVerified;
    const cloudLabel = cloudState.status === 'paused' || offlineMode
      ? 'Cloud backup is paused while you’re using offline mode.'
      : hasFirestore
        ? 'Cloud backup is active for this account.'
        : 'You\'re signed in, but cloud backup is unavailable right now.';
    const backupLabel = cloudState.lastSavedAt
      ? cloudState.message || actions.formatLastSavedLabel(cloudState.lastSavedAt) || 'Last backed up: just now'
      : 'Your library is backed up to your account on this device.';

    return `
      <div class="settings-account-card">
        <div class="settings-account-identity">
          ${avatar}
          <div class="settings-account-copy">
            <div class="activity-title">${utils.sanitize(actions.getDisplayName(user) || 'Signed in')}</div>
            <div class="activity-subtitle">${utils.sanitize(user.email || '')}</div>
            ${isGoogleOnly ? `
              <div class="activity-subtitle">Signed in with Google</div>
              <div class="activity-subtitle">Your email is managed by Google.</div>
            ` : ''}
            <div class="activity-subtitle" id="settingsAccountCloudCopy">${utils.sanitize(cloudLabel)}</div>
            ${cloudState.lastSavedAt ? `<div class="activity-subtitle" id="settingsAccountCloudBackupCopy">${utils.sanitize(backupLabel)}</div>` : ''}
            ${showVerificationNotice ? `<div class="settings-callout" id="emailVerificationNotice">Your email isn’t verified yet.</div>` : ''}
          </div>
        </div>
        ${canEmailActions ? `
        <div class="settings-account-actions">
          <div class="settings-account-row">
            <div class="activity-text">
              <div class="activity-title">Email verification</div>
              <div class="activity-subtitle">Send a verification email to your address.</div>
            </div>
            <button class="btn btn-secondary btn-sm" type="button" id="sendVerificationEmailBtn" data-action="send-verification">
              Send verification email
            </button>
          </div>
          <div class="settings-account-row">
            <div class="activity-text">
              <div class="activity-title">Check verification</div>
              <div class="activity-subtitle">Reload your account after you confirm the message.</div>
            </div>
            <button class="btn btn-secondary btn-sm" type="button" id="refreshEmailStatusBtn" data-action="refresh-email-status">
              I’ve verified my email
            </button>
          </div>
          <div class="settings-account-row">
            <div class="activity-text">
              <div class="activity-title">Password reset</div>
              <div class="activity-subtitle">Send a reset link to the email on this account.</div>
            </div>
            <button class="btn btn-secondary btn-sm" type="button" id="resetPasswordBtn" data-action="reset-password">
              Reset password
            </button>
          </div>
          <div class="settings-account-row settings-account-row-change-email">
            <div class="activity-text">
              <div class="activity-title">Change email address</div>
              <div class="activity-subtitle">We’ll send a confirmation link to your new address.</div>
            </div>
            <div class="settings-account-email-controls">
              <input class="form-input" id="changeEmailInput" type="email" value="${utils.sanitize(emailInfo.email)}" placeholder="New email address" />
              <button class="btn btn-secondary btn-sm" type="button" id="changeEmailBtn" data-action="change-email">
                Change email address
              </button>
            </div>
          </div>
        </div>` : (isGoogleOnly ? `<div class="settings-callout">Your email is managed by Google.</div>` : '')}
        <div class="settings-account-row settings-account-signout-row">
          <div class="activity-text">
            <div class="activity-title">Sign out</div>
            <div class="activity-subtitle">Return to the session screen on this device.</div>
          </div>
          <button class="btn btn-secondary btn-sm" id="accountActionBtn" type="button" data-action="account-action" data-account-action="signout">
            Sign out
          </button>
        </div>
      </div>`;
  }

  function _buildCloudBackupSection(firebase, cloudBackupMeta) {
    if (!firebase.initialized) {
      return `
        <div class="activity-item activity-item--static">
          <div class="activity-text">
            <div class="activity-title">Cloud backup</div>
            <div class="activity-subtitle">Checking cloud backup status...</div>
          </div>
        </div>`;
    }

    if (!firebase.available || !actions.hasFirestore()) {
      return `
        <div class="activity-item activity-item--static">
          <div class="activity-text">
            <div class="activity-title">Cloud backup</div>
            <div class="activity-subtitle">Cloud backup is unavailable right now.</div>
          </div>
        </div>`;
    }

    if (!firebase.user) {
      return `
        <div class="activity-item activity-item--static">
          <div class="activity-text">
            <div class="activity-title">Cloud backup</div>
            <div class="activity-subtitle">Sign in to enable cloud backup.</div>
          </div>
        </div>`;
    }

    const cloudState = actions.getCloudBackupState();
    if (globalThis.localStorage?.getItem('libriq_debug_auto_backup')) {
      console.debug('[LibriQ][AutoBackup] renderCloudBackupSection reads status', cloudState);
    }
    const status = cloudState.message || (cloudBackupMeta.lastCloudBackupAt ? 'Cloud backup active' : 'Sign in to enable cloud backup');
    const lastSaved = cloudState.lastSavedAt || cloudBackupMeta.lastCloudBackupAt;
    const lastSavedText = lastSaved
      ? (actions.formatLastSavedLabel(lastSaved) || `Last backed up: ${utils.formatDate(lastSaved)}`)
      : 'No cloud backup yet.';
    const backupHelperText = cloudState.pending
      ? 'Saving...'
      : 'Cloud backup is a safety copy of your library. Account Sync updates books across devices, while backup and restore stay separate.';

    return `
      <div class="activity-list" id="settingsCloudBackupCard">
        <div class="activity-item settings-summary-item activity-item--static">
          <div class="activity-text">
            <div class="activity-title">Cloud backup</div>
            <div class="activity-subtitle" id="cloudBackupStatusText">${status}</div>
            <div class="activity-subtitle" id="cloudBackupSecondaryText">${backupHelperText}</div>
            <div class="activity-subtitle" id="cloudBackupLastSavedText">${lastSavedText}</div>
          </div>
        </div>
        <div class="settings-cloud-actions">
          <button class="btn btn-primary btn-sm" type="button" id="cloudBackupSaveBtn" data-action="backup-cloud">
            <i class="ph ph-cloud-arrow-up"></i>
            Back up now
          </button>
          <button class="btn btn-secondary btn-sm" type="button" id="cloudBackupRestoreBtn" data-action="restore-cloud">
            <i class="ph ph-cloud-arrow-down"></i>
            Restore from cloud
          </button>
          <button class="btn btn-secondary btn-sm" type="button" id="cloudBackupMergeBtn" data-action="merge-cloud">
            <i class="ph ph-arrows-left-right"></i>
            Merge cloud with this device
          </button>
        </div>
      </div>`;
  }

  function _buildSyncSection(firebase) {
    const syncState = actions.getSyncState?.() || { enabled: false, status: 'off', message: 'Account sync off', conflictCount: 0 };
    const signedIn = Boolean(firebase.user || actions.getCurrentUser());
    const offlineMode = actions.getSessionPreference?.() === 'offline';
    const diagnosticsRows = _buildSyncDiagnosticsRows(syncState);
    if (!firebase.initialized) {
      return `
        <div class="activity-item activity-item--static">
          <div class="activity-text">
            <div class="activity-title">Account Sync</div>
            <div class="activity-subtitle">Checking sync status...</div>
          </div>
        </div>`;
    }
    if (!firebase.available || !actions.hasFirestore()) {
      return `
        <div class="activity-item activity-item--static">
          <div class="activity-text">
            <div class="activity-title">Account Sync</div>
            <div class="activity-subtitle">Sync unavailable.</div>
          </div>
        </div>`;
    }
    const description = offlineMode
      ? 'Offline mode: books stay on this device.'
      : signedIn && syncState.enabled
        ? (syncState.pending ? 'Saved locally. Will sync when online.' : 'Your books sync automatically across signed-in devices.')
        : signedIn
          ? 'Sync is off on this device.'
          : 'Sign in to sync your library.';
    const syncStatus = offlineMode ? 'Paused'
      : !signedIn ? 'Off'
      : syncState.pending ? 'Pending'
      : syncState.enabled ? 'On'
      : 'Off';
    const lastSynced = syncState.pending && syncState.pendingSince
      ? `Saved locally: ${utils.formatDate(syncState.pendingSince)}`
      : syncState.lastSyncedAt ? `Last synced: ${utils.formatDate(syncState.lastSyncedAt)}` : 'Last synced: Not yet';
    const errorText = syncState.status === 'error' && syncState.lastError ? `Sync needs attention: ${syncState.lastError}` : '';
    const actionLabel = syncState.enabled && !offlineMode ? 'Turn off sync' : 'Turn on sync';
    const actionDisabled = !signedIn || offlineMode;
    return `
      <div class="activity-list" id="settingsSyncCard">
        <div class="activity-item settings-summary-item activity-item--static">
          <div class="activity-text">
            <div class="activity-title">Account Sync</div>
            <div class="activity-subtitle" id="syncStatusText">Sync status: ${utils.sanitize(syncStatus)}</div>
            <div class="activity-subtitle" id="syncSecondaryText">${utils.sanitize(description)}</div>
            <div class="activity-subtitle" id="syncLastSyncedText">${utils.sanitize(lastSynced)}</div>
            ${errorText ? `<div class="activity-subtitle" id="syncErrorText">${utils.sanitize(errorText)}</div>` : ''}
          </div>
        </div>
        <div class="settings-cloud-actions">
          <button class="btn ${syncState.enabled && !offlineMode ? 'btn-secondary' : 'btn-primary'} btn-sm" type="button" id="syncToggleBtn" data-action="toggle-sync" ${actionDisabled ? 'disabled' : ''} data-sync-enabled="${syncState.enabled && !offlineMode ? '1' : '0'}">
            ${actionLabel}
          </button>
          <button class="btn btn-secondary btn-sm" type="button" id="syncRefreshStatusBtn" data-action="refresh-sync">
            Refresh
          </button>
        </div>
        <details class="settings-diagnostics">
          <summary class="activity-title">Advanced diagnostics</summary>
          <div class="activity-text">
            <div class="activity-subtitle">For troubleshooting only.</div>
            <div class="sync-health-list">${diagnosticsRows}</div>
            <div class="settings-diagnostics-actions">
              <button class="btn btn-secondary btn-sm" type="button" data-action="clear-local-cache">
                <i class="ph ph-trash"></i> Clear local cache
              </button>
            </div>
          </div>
        </details>
      </div>`;
  }

  function _buildSyncDiagnosticsRows(syncState) {
    const listenerStatus = syncState.listenerAttached ? 'Connected' : 'Not connected';
    const lastSnapshot = syncState.lastSnapshotAt ? utils.formatDate(syncState.lastSnapshotAt) : 'Not yet';
    const lastWrite = syncState.lastWriteAt ? utils.formatDate(syncState.lastWriteAt) : 'Not yet';
    const lastError = syncState.lastError || 'None';
    const pendingBooks = Array.isArray(syncState.pendingBookIds) ? syncState.pendingBookIds.length : 0;
    const pendingDeletes = Array.isArray(syncState.pendingDeleteIds) ? syncState.pendingDeleteIds.length : 0;
    const eligibility = syncState.eligibilityAllowed ? 'Allowed' : 'Not eligible right now';
    const syncPath = syncState.syncPath || syncState.listenerPath || 'Not available yet';
    const rows = [
      ['Device ID', syncState.deviceId || 'Not available yet'],
      ['Listener state', listenerStatus],
      ['Sync path', syncPath],
      ['Last snapshot', lastSnapshot],
      ['Last write', lastWrite],
      ['Last error', lastError],
      ['Pending books', String(pendingBooks)],
      ['Pending deletes', String(pendingDeletes)],
      ['Tombstone count', String(syncState.tombstoneCount ?? 0)],
      ['Oldest tombstone', syncState.oldestTombstoneAt ? utils.formatDate(syncState.oldestTombstoneAt) : 'None'],
      ['Eligibility status', eligibility],
    ];
    return rows.map(([label, value]) => `
      <div class="activity-subtitle sync-health-row">
        <strong>${utils.sanitize(label)}:</strong> ${utils.sanitize(value)}
      </div>
    `).join('');
  }

  function bindSettingsActions(main) {
    if (boundMain === main) return;
    boundMain = main;
    main.addEventListener('click', event => {
      const trigger = event.target.closest?.('[data-action]');
      if (!trigger) return;
      const handlers = {
        'toggle-theme': () => actions.toggleTheme?.(),
        'choose-session-mode': () => actions.navigate?.('session'),
        'export-data': () => actions.exportData?.(),
        'prompt-import': () => actions.promptImportData?.(),
        'delete-library': () => actions.confirmDeleteLibraryData?.(),
        'delete-account': () => actions.confirmDeleteAccount?.(),
        'clear-local-cache': () => actions.clearLocalCache?.(),
        'account-action': () => actions.accountAction?.(trigger.dataset.accountAction),
        'send-verification': () => actions.sendVerification?.(),
        'refresh-email-status': () => actions.refreshEmailStatus?.(),
        'reset-password': () => actions.resetPassword?.(),
        'change-email': () => actions.changeEmail?.(pageDocument.getElementById('changeEmailInput')?.value),
        'backup-cloud': () => actions.backupToCloud?.(),
        'restore-cloud': () => actions.openCloudRestorePreview?.(),
        'merge-cloud': () => actions.openCloudMergePreview?.(),
        'toggle-sync': () => actions.toggleSync?.(trigger.dataset.syncEnabled === '1'),
        'refresh-sync': () => actions.refreshSync?.(),
      };
      handlers[trigger.dataset.action]?.();
    });
    main.addEventListener('change', event => {
      if (event.target.matches?.('[data-action="import-file"]')) actions.importDataFromFile?.(event.target.files?.[0]);
    });
  }

  return renderSettingsPage;
}
