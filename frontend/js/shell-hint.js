// Runs before first paint, as the first thing in <body>.
//
// Someone who has used LibriQ on this device goes straight from the boot
// screen to their dashboard. If the boot screen is full-screen, the sidebar
// (desktop) or top bar (mobile) appears with the dashboard and pushes the
// whole page over or down: a layout shift of 0.19 on desktop and 0.07 on
// mobile. For those visitors, show the boot screen inside the app chrome
// from the start. The chrome stays inert until the app has started.
//
// The body keeps its boot classes (auth-booting, session-choice-active), which
// the app's start-up logic reads. Only the layout changes, through CSS rules
// that skip body.app-booting. Navigation removes the class after boot.
(() => {
  try {
    const pref = localStorage.getItem('libriq_session_pref');
    const signedInBefore = (pref === 'account' || pref === 'google') && localStorage.getItem('libriq_active_account_uid');
    if (signedInBefore || pref === 'offline') document.body.classList.add('app-booting');
  } catch {
    // Storage blocked: keep the full-screen boot screen.
  }
})();
