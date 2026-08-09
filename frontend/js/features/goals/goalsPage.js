export function createGoalsPage({ storage, utils, actions, documentRoot }) {
  if (!storage || !utils) throw new TypeError('createGoalsPage requires storage and utils.');
  const pageDocument = documentRoot || globalThis.document;

  function renderGoalsPage() {
    const main = pageDocument?.getElementById('mainContent');
    if (!main) return;
    const goals = storage.getGoals();
    const stats = storage.getStats();
    const now = new Date();
    const currentYear = now.getFullYear();

    main.innerHTML = `
      <div class="page goals-page page--narrow" id="goalsPage">
        <div class="page-header page-header--spaced">
          <h1 class="page-title">Reading Goals</h1>
          <p class="page-subtitle">Set your target for ${currentYear}</p>
        </div>

        <div class="goal-widget goal-widget--section-sm">
          <form id="goalsForm" class="add-book-form">
            <div class="form-group">
              <label class="form-label" for="yearlyGoalInput">Books to read in ${currentYear}</label>
              <input type="number" id="yearlyGoalInput" name="yearly"
                class="form-input" value="${goals.yearly}" min="1" max="365" />
            </div>
            <div class="goal-presets">
              ${[6, 12, 24, 52].map(yearly => `
                <button type="button" class="btn btn-secondary btn-sm"
                  data-action="set-goal-preset" data-goal-preset="${yearly}">
                  ${yearly} books
                </button>`).join('')}
            </div>
            <button type="submit" class="btn btn-primary form-submit-offset">
              <i class="ph ph-floppy-disk"></i> Save Goal
            </button>
          </form>
        </div>

        <div class="goal-widget">
          <div class="goal-header"><div class="goal-title">Progress</div></div>
          <div class="activity-list">
            ${[
              ['Goal', goals.yearly + ' books'],
              ['Completed', stats.finishedThisYear + ' books'],
              ['Remaining', Math.max(0, goals.yearly - stats.finishedThisYear) + ' books'],
              ['On track', stats.finishedThisYear >= Math.round(goals.yearly * (now.getMonth() + 1) / 12) ? '✅ Yes' : '⚠️ Behind'],
            ].map(([label, val]) => `
              <div class="activity-item activity-item--noninteractive">
                <div class="activity-text"><div class="activity-subtitle">${label}</div></div>
                <div class="activity-time activity-time--strong">${val}</div>
              </div>`).join('')}
          </div>
        </div>
      </div>`;

    const form = main.querySelector('#goalsForm');
    form?.addEventListener('click', event => {
      const button = event.target.closest('[data-action="set-goal-preset"]');
      if (!button) return;
      const input = form.querySelector('#yearlyGoalInput');
      actions?.setGoalPreset?.(input, Number(button.dataset.goalPreset));
    });

    form?.addEventListener('submit', event => {
      event.preventDefault();
      const yearly = parseInt(new FormData(event.target).get('yearly'), 10);
      if (!yearly || yearly < 1) return;
      storage.saveGoals({ yearly, year: new Date().getFullYear() });
      utils.toast(`Goal set: ${yearly} books in ${new Date().getFullYear()}`, 'success');
      if (actions?.refreshGoals) actions.refreshGoals();
      else renderGoalsPage();
    });
  }

  return renderGoalsPage;
}
