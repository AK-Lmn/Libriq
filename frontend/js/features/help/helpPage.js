export function createHelpPage({ storage, actions, documentRoot }) {
  if (!storage) throw new TypeError('createHelpPage requires storage.');
  const pageDocument = documentRoot || globalThis.document;

  return function renderHelpPage() {
    const main = pageDocument?.getElementById('mainContent');
    if (!main) return;
    const syncReadiness = storage.getSyncReadiness?.() || { syncReady: false };

    const guideSections = [
      {
        icon: 'ph-seal-check',
        title: 'Getting Started',
        body: 'Start by searching for a book, then add it to your library. From there you can mark reading status, track progress, rate it, and come back to it anytime.',
      },
      {
        icon: 'ph-magnifying-glass',
        title: 'Searching for Books',
        body: 'Use the search bar or press Cmd/Ctrl + K. LibriQ checks Open Library and Google Books, then merges the best match into one result list.',
      },
      {
        icon: 'ph-pencil-simple',
        title: 'Adding Books Manually',
        body: 'If a title is missing from the search results, choose Manual Entry and fill in the details yourself. Manual books work like any other saved book.',
      },
      {
        icon: 'ph-books',
        title: 'Managing the Library',
        body: 'Use My Library to filter by status or favorites, sort the shelf, open book details, and keep your collection organized as it grows.',
      },
      {
        icon: 'ph-chart-line-up',
        title: 'Tracking Reading Progress',
        body: 'Open Book Details to update your current page. LibriQ turns that into progress so you can see how far along you are in each book.',
      },
      {
        icon: 'ph-notebook',
        title: 'Using Private Notes',
        body: 'Private Notes are saved only in your browser. They are perfect for thoughts, quotes, reflections, and reading journal entries you want to keep to yourself.',
      },
      {
        icon: 'ph-arrow-down',
        title: 'Importing and Exporting Backups',
        body: 'Use Settings to export a JSON backup or import one later. This helps protect your local library if you switch browsers or want a safety copy.',
      },
      {
        icon: 'ph-hard-drives',
        title: 'Understanding storage and backups',
        body: 'LibriQ is designed around account-backed reading data. When account services are unavailable, an offline fallback may appear so you can keep using the app on this device.',
      },
      {
        icon: 'ph-arrows-clockwise',
        title: 'Sync Foundation',
        body: 'Account Sync keeps books updated across signed-in devices. Cloud backup, restore, merge, and JSON export/import remain separate safety tools.',
      },
      {
        icon: 'ph-arrows-left-right',
        title: 'Manual Cloud Merge',
        body: 'Merge is safer when you have books on both this device and your cloud backup. LibriQ adds cloud-only items and keeps this device\'s version when something looks different.',
      },
    ];

    const faqItems = [
      ['Why did my books disappear?', 'They may be stored in a different browser or device. Local-first storage stays with the browser profile that saved it.'],
      ['Can I use LibriQ offline?', 'If account services are unavailable, LibriQ may show an offline fallback so you can keep reading on this device.'],
      ['Will notes sync across devices?', 'Private notes stay on the saved library data path and should be treated as account-backed data when synced or backed up.'],
      ['What if search returns no results?', 'Try a different title spelling, search by author, or use Manual Entry to add the book by hand.'],
    ];

    main.innerHTML = `
      <div class="page" id="helpPage">
        <div class="page-header help-header">
          <div class="help-heading">
            <span class="library-eyebrow">Beginner guide</span>
            <h1 class="page-title">Help & Guide Center</h1>
            <p class="page-subtitle">A calm walkthrough for using LibriQ with confidence.</p>
          </div>
        </div>

        <div class="help-intro-card">
          <div class="help-intro-icon"><i class="ph ph-book-open-text"></i></div>
          <div class="help-intro-copy">
            <h2 class="help-intro-title">A calm place to learn the app</h2>
            <p class="text-secondary prose-copy">
              LibriQ stays simple and local-first. This guide covers the core features, backups, and account behavior so you can build your reading space without needing a long tutorial.
            </p>
          </div>
        </div>

        <div class="help-grid stagger">
          ${guideSections.map(section => `
            <article class="help-card">
              <div class="help-card-icon"><i class="ph ${section.icon}"></i></div>
              <h3 class="help-card-title">${section.title}</h3>
              <p class="help-card-body">${section.body}</p>
            </article>
          `).join('')}
        </div>

        <div class="help-grid help-grid-wide">
          <section class="goal-widget help-faq-card">
            <div class="goal-header"><div class="goal-title">FAQ / Troubleshooting</div></div>
            <div class="help-faq-list">
              ${faqItems.map(([question, answer]) => `
                <div class="help-faq-item">
                  <div class="help-faq-question">${question}</div>
                  <div class="help-faq-answer">${answer}</div>
                </div>
              `).join('')}
            </div>
          </section>

          <section class="goal-widget help-faq-card">
            <div class="goal-header"><div class="goal-title">Sync readiness</div></div>
            <div class="help-faq-list">
              ${[
                ['Restore behavior', 'Restore replaces this device\'s library after confirmation.'],
                ['Merge behavior', 'Merge adds safe cloud-only items without replacing local conflicts.'],
                ['Account sync', 'Books sync automatically in signed-in account mode.'],
                ['Has device ID', syncReadiness.hasDeviceId ? 'Yes' : 'No'],
                ['UpdatedAt coverage', syncReadiness.hasUpdatedAtCoverage ? 'Good coverage' : 'Partial coverage'],
                ['DeletedAt support', syncReadiness.hasDeletedAtSupport ? 'Supported' : 'Not yet consistent'],
                ['Backup metadata', syncReadiness.hasBackupMetadata ? 'Present' : 'Missing'],
                ['Sync ready', syncReadiness.syncReady ? 'Yes' : 'No, foundation only'],
              ].map(([question, answer]) => `
                <div class="help-faq-item">
                  <div class="help-faq-question">${question}</div>
                  <div class="help-faq-answer">${answer}</div>
                </div>
              `).join('')}
            </div>
          </section>

          <section class="goal-widget help-next-step-card">
            <div class="goal-header"><div class="goal-title">A quick first step</div></div>
            <div class="help-next-step">
              <p class="help-next-step-text">
                Search for your first book, add it to the library, and open the details panel to try progress tracking and private notes.
              </p>
              <div class="help-next-step-actions">
                <button class="btn btn-primary" type="button" data-action="open-search">
                  <i class="ph ph-magnifying-glass"></i> Search Books
                </button>
                <button class="btn btn-secondary" type="button" data-action="open-library">
                  <i class="ph ph-books"></i> Open Library
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>`;

    main.querySelector('[data-action="open-search"]')?.addEventListener('click', () => actions?.openSearch?.());
    main.querySelector('[data-action="open-library"]')?.addEventListener('click', () => actions?.navigate?.('library'));
  };
}
