import { dismissPoll, submitPollVote } from '../../services/mobileAppPoll.js';

export function createDashboardPage({ dashboard, actions }) {
  if (!dashboard?.render) throw new TypeError('createDashboardPage requires a dashboard renderer.');

  return function renderDashboardPage({ root }) {
    dashboard.render();
    return initDashboardEvents(root || document.getElementById('mainContent'), actions);
  };
}

export function initDashboardEvents(container, actions = {}) {
  if (!container || container.dataset.dashboardEventsBound === 'true') return () => {};

  const onClick = (event) => {
    const trigger = event.target.closest?.('[data-action]');
    if (!trigger || !container.contains?.(trigger)) return;

    const action = trigger.dataset.action;
    const bookId = trigger.dataset.bookId;
    const route = trigger.dataset.route;
    const handlers = {
      'open-search': () => actions.openSearch?.(),
      'open-manual-entry': () => actions.openManualEntry?.(),
      'import-backup': () => actions.importBackup?.(),
      'navigate': () => actions.navigate?.(route),
      'show-book-details': () => actions.showBookDetails?.(bookId),
      'update-progress': () => actions.updateProgress?.(bookId),
      'toggle-favorite': () => actions.toggleFavorite?.(bookId),
      'dismiss-onboarding': () => {
        localStorage.setItem('libriq_onboarding_dismissed', '1');
        const container = document.querySelector('.onboarding-checklist');
        if (container) container.remove();
      },
      'dismiss-mobile-poll': () => {
        dismissPoll();
        actions.dismissMobilePoll?.();
        const pollCard = document.getElementById('dashboardMobilePoll');
        if (pollCard) {
          pollCard.style.opacity = '0';
          pollCard.style.transform = 'translateY(-6px)';
          pollCard.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
          setTimeout(() => pollCard.remove(), 220);
        }
      },
      'submit-mobile-poll': () => {
        const choice = trigger.dataset.pollChoice;
        if (!choice) return;
        const actionRow = document.getElementById('dashboardPollActionRow');
        const successMsg = document.getElementById('dashboardPollSuccess');
        if (actionRow) actionRow.hidden = true;
        if (successMsg) successMsg.hidden = false;
        if (actions.submitMobilePoll) {
          actions.submitMobilePoll(choice);
        } else {
          submitPollVote(choice);
        }
        setTimeout(() => {
          const pollCard = document.getElementById('dashboardMobilePoll');
          if (pollCard) {
            pollCard.style.opacity = '0';
            pollCard.style.transform = 'translateY(-6px)';
            pollCard.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            setTimeout(() => pollCard.remove(), 320);
          }
        }, 1800);
      },
    };

    if (!handlers[action]) return;
    event.preventDefault();
    event.stopPropagation();
    handlers[action]();
  };

  container.dataset.dashboardEventsBound = 'true';
  container.addEventListener('click', onClick);
  return () => {
    container.removeEventListener?.('click', onClick);
    delete container.dataset.dashboardEventsBound;
  };
}
