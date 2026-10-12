export function createHelpPage({ storage, actions, documentRoot }) {
  if (!storage) throw new TypeError('createHelpPage requires storage.');
  const pageDocument = documentRoot || globalThis.document;
  let boundMain = null;
  const icon = name => `<img class="help-icon" src="assets/revamp/account/18-4308-${name}.svg" alt="" aria-hidden="true" />`;
  const paragraph = (heading, body) => `<div class="help-prose"><h3>${heading}</h3><p>${body}</p></div>`;
  const question = (title, answer, open = false) => `<details class="help-question" ${open ? 'open' : ''}><summary>${title}<span class="help-expand">${icon('plus')}</span></summary><p>${answer}</p></details>`;
  const returnActions = () => `<div class="help-return-actions">
    <button class="btn btn-primary" type="button" data-action="open-search">${icon('search1')} Back to Search</button>
    <button class="btn btn-secondary" type="button" data-action="open-library">${icon('library1')} Back to Library</button>
  </div>`;

  return function renderHelpPage() {
    const main = pageDocument?.getElementById('mainContent');
    if (!main) return;
    const syncReadiness = storage.getSyncReadiness?.() || { syncReady: false };
    const sections = [
      ['Getting started', `
        <p>Your Library holds the books you want to read, the ones you are reading, and the ones you have put down. Begin with a single book.</p>
        <ol class="help-steps">
          <li>${paragraph('Find a book', 'Open Search and enter a title, author, or ISBN. Check the edition and page count before adding it. If there is no useful match, use manual entry.')}</li>
          <li>${paragraph('Make it yours', 'Add the book to your Library and choose a reading status. Start with Want to read, or choose Reading if you have already begun.')}</li>
          <li>${paragraph('Return as you read', 'Open the book in your Library to update your current page and save a note. Small updates are enough; there is no reading schedule to keep.')}</li>
        </ol>
        ${question('How do I install LibriQ as an app?', 'For an app-like reading space, use your browser’s Install app or Add to Home Screen option, when available. Open LibriQ from its icon to use it in a standalone window.')}`],
      ['Search &amp; manual entry', `
        ${paragraph('Search for the edition you own', 'Try the full title or the author’s name. An ISBN can help narrow the results to a specific edition. Compare language, format, and page count; different editions may track progress differently.')}
        ${paragraph('No match? Add it manually.', 'Choose manual entry and enter the title and author. Add an ISBN and total pages if you know them. Review the details before saving; you can correct a book’s information later from its Library entry.')}
        <aside class="help-callout">${icon('info')}<div><strong>Check before adding again</strong><p>Look in your Library first. A different cover or edition may still be the same book you have already saved.</p></div></aside>`],
      ['Library management', `
        <p>Use a book’s status to describe where it sits in your reading life. You can change it whenever your plans change.</p>
        <div class="help-statuses"><span>Reading</span><span>Finished</span><span>Want to read</span><span>Did not finish</span></div>
        ${paragraph('Find, filter, and tidy', 'Search within your Library or filter by status or favorites to narrow your shelves. Sort the shelf and open a book to edit its details. Before removing an entry, check its progress and notes and save anything you want to keep.')}
        ${question('What should I do with duplicate editions?', 'Compare the edition, ISBN, progress and notes before removing anything. Export a backup first. A manual cloud merge skips duplicates and keeps this device’s version where details conflict.')}`],
      ['Progress &amp; notes', `
        ${paragraph('Keep your place', 'Open a book and enter your current page. Check that the total pages match your edition so the progress percentage is meaningful. For a book without a reliable page count, use the reading status and notes instead.')}
        ${paragraph('Capture a thought, not a performance', 'Save a short reflection, a quotation, or a page reference in the book’s notes. Review the saved entry before leaving. Mark a book Finished when you are done, or Did not finish if you choose to stop. Notes are part of your library data when included in a backup or sync.')}
        ${question('Why does my progress percentage look wrong?', 'Check your current page and the edition’s total pages. Different editions can have different page counts. Correct the book details from its Library entry before updating progress.')}`],
      ['Backup &amp; cloud-merge', `
        ${paragraph('A backup is not the same as sync', 'A backup is a saved snapshot at a point in time. Sync keeps account-backed changes aligned between sessions or devices. Neither should be treated as a guarantee that deleted data can be recovered.')}
        ${paragraph('Before you import or merge', 'Export a fresh JSON backup of your current Library from Settings and keep the original backup file unchanged. Check the file’s date and source account. If sync is pending, let it complete before comparing your local and account-backed data.')}
        ${paragraph('Review differences before confirming', 'Inspect conflicting book details, reading progress, and notes in the preview. Restore replaces this device’s library after confirmation. Manual cloud merge adds safe cloud-only books and keeps this device’s version of conflicts; it does not let you select each conflicting value. Review possible duplicates, confirm only when ready, then check the resulting Library and sync state.')}
        <aside class="help-callout">${icon('info')}<p>Keep the pre-merge backup until you have verified the result.</p></aside>
        ${question('Can I use an older backup without replacing everything?', 'Use the import or cloud merge preview to review what will be added. Keep a fresh export first. Do not choose Restore unless you intend to replace this device’s library.')}`],
      ['Account-backed storage', `
        ${paragraph('Use the same account on each device', 'LibriQ requires an account. Check the signed-in account before expecting your Library to appear elsewhere. A different account can show a different Library. Your installed app and another session should use the same account if you want the same books.')}
        ${paragraph('Check the sync state, not just the connection', 'Reconnect if you are offline and inspect the sync status. Pending or failed changes may not yet be visible on another device. Wait for completion, then reopen the Library. Keep a backup before signing out, clearing app data, or reinstalling. Offline access keeps your existing account’s books on this device; it does not bypass account creation.')}
        <aside class="help-callout">${icon('info')}<div><strong>If books still seem to be missing</strong><p>Check your account and Library filters first. Do not immediately import an older backup; compare the data and review conflicts before making another change.</p></div></aside>`],
      ['FAQ / troubleshooting', `
        ${question('My Library looks empty. Where should I start?', 'Clear active filters and search terms, confirm you are in the same account, and check the sync state. If a device still has your books, preserve a backup there before trying an import or merge.', true)}
        ${question('Can I reduce motion?', 'Yes. Enable reduced motion in your device’s accessibility settings. LibriQ respects prefers-reduced-motion: animated transitions and spring movement are removed or made immediate. Reading and navigation remain available.', true)}
        ${question('Can I turn off the glass effect?', 'Use reduced transparency in your device’s accessibility settings where available. The solid-surface fallback replaces translucent cards with opaque surfaces and removes background blur while keeping the same text, contrast, and layout.', true)}
        <aside class="help-solid-preview"><strong>Solid surfaces · same quiet space</strong><p>No transparency. No backdrop blur. Guidance stays readable.</p></aside>
        ${question('Why are search results not loading?', 'Check your connection, try a different title spelling or search by author or ISBN. Search uses Open Library and Google Books; either service may be temporarily unavailable. Use Manual Entry if there is no useful match. Cmd/Ctrl + K opens Search.')}
        ${question('Is my Library a public profile?', 'No. LibriQ is your personal reading space, not a public profile or a shared shelf. Private notes and quotes remain part of your library data when included in a backup or sync.')}
        <details class="help-question"><summary>Sync readiness<span class="help-expand">${icon('plus')}</span></summary><dl class="help-readiness">${[
          ['Has device ID', syncReadiness.hasDeviceId ? 'Yes' : 'No'],
          ['UpdatedAt coverage', syncReadiness.hasUpdatedAtCoverage ? 'Good coverage' : 'Partial coverage'],
          ['DeletedAt support', syncReadiness.hasDeletedAtSupport ? 'Supported' : 'Not yet consistent'],
          ['Backup metadata', syncReadiness.hasBackupMetadata ? 'Present' : 'Missing'],
          ['Sync ready', syncReadiness.syncReady ? 'Yes' : 'No, foundation only'],
        ].map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl></details>`],
    ];

    main.innerHTML = `
      <div class="page help-page" id="helpPage">
        <aside class="help-contents">
          <nav aria-label="In this guide"><h2>IN THIS GUIDE</h2>
            ${sections.map(([title], i) => `<a href="#help-section-${i + 1}" data-action="open-guide-section" data-section-id="help-section-${i + 1}"><span>${String(i + 1).padStart(2, '0')}</span>${title}</a>`).join('')}
          </nav>
          <div class="help-personal-note">${icon('book-heart')}<h3>Just you and your books.</h3><p>LibriQ is your personal reading space. No public profile, no shared shelves, no pressure to keep pace.</p></div>
          <p>Read at your own pace. Each section can be opened on its own.</p>
        </aside>
        <div class="help-reading-column">
          <header class="help-introduction">
            <span class="help-eyebrow">${icon('compass')} A LITTLE GUIDANCE</span>
            <h1 class="page-title">Help &amp; Guide Center</h1>
            <p>A quieter way to keep track of your reading. Find your next book, tend your library, and keep your progress close.</p>
            ${returnActions()}
          </header>
          <div class="help-sections">
            ${sections.map(([title, body], i) => `<details class="help-section" id="help-section-${i + 1}" open>
              <summary><span class="help-section-number">${String(i + 1).padStart(2, '0')}</span><h2>${title}</h2><span class="help-chevron">${icon('chevron-up')}</span></summary>
              <div class="help-section-body">${body}</div>
            </details>`).join('')}
          </div>
          <section class="help-return-card"><h2>Back to your next chapter.</h2><p>Find something new or pick up where you left off. This is your personal reading space, not a public profile or a shared shelf.</p>${returnActions()}</section>
          <footer class="help-footer"><span>LibriQ · A quiet place for your books</span><span>HELP / GUIDE</span></footer>
        </div>
      </div>`;

    if (boundMain === main) return;
    boundMain = main;
    main.addEventListener('click', event => {
      const trigger = event.target.closest?.('[data-action]');
      if (!trigger) return;
      if (trigger.dataset.action === 'open-search') actions?.openSearch?.();
      if (trigger.dataset.action === 'open-library') actions?.navigate?.('library');
      if (trigger.dataset.action === 'open-guide-section') {
        const section = pageDocument.getElementById(trigger.dataset.sectionId);
        if (section) section.open = true;
      }
    });
  };
}
