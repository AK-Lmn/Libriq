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
    const yearly = Math.max(0, Number(goals.yearly) || 0);
    const completed = Math.max(0, Number(stats.finishedThisYear) || 0);
    const percent = yearly > 0 ? Math.min(100, Math.round(completed / yearly * 100)) : 0;

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
              <div class="goal-number-field">
                <input type="number" id="yearlyGoalInput" name="yearly"
                  class="form-input" value="${yearly}" min="1" max="365" required step="1" />
                <div class="goal-stepper">
                  <button type="button" data-action="step-goal" data-step="1" aria-label="Increase goal"><img src="assets/revamp/insights/goal-chevron-up.svg" alt="" /></button>
                  <button type="button" data-action="step-goal" data-step="-1" aria-label="Decrease goal"><img src="assets/revamp/insights/goal-chevron-down.svg" alt="" /></button>
                </div>
              </div>
            </div>
            <div class="goal-presets">
              ${[6, 12, 24, 52].map(yearly => `
                <button type="button" class="btn btn-secondary btn-sm"
                  aria-pressed="${yearly === Number(goals.yearly)}"
                  data-action="set-goal-preset" data-goal-preset="${yearly}">
                  ${yearly} books
                </button>`).join('')}
            </div>
            <button type="submit" class="btn btn-primary form-submit-offset">
              Save Goal
            </button>
          </form>
        </div>

        <div class="goal-widget">
          <div class="goal-header"><h2 class="goal-title">Progress</h2>
            <div class="goal-completion" role="progressbar" aria-label="Yearly reading goal" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100" style="--goal-progress:${percent}%">
              <img src="assets/revamp/insights/goal-ring-track.svg" alt="" /><span>${percent}%</span>
            </div>
          </div>
          <div class="activity-list">
            ${[
              ['Goal', yearly + ' books'],
              ['Completed', completed + ' books'],
              ['Remaining', Math.max(0, yearly - completed) + ' books'],
              ['On track', yearly === 0 ? 'Set a goal' : completed >= Math.round(yearly * (now.getMonth() + 1) / 12) ? 'Yes' : 'Behind'],
            ].map(([label, val]) => `
              <div class="activity-item activity-item--noninteractive">
                <div class="activity-text"><div class="activity-subtitle">${label}</div></div>
                <div class="activity-time activity-time--strong">${val}</div>
              </div>`).join('')}
          </div>
        </div>
      </div>`;

    const form = main.querySelector('#goalsForm');
    function updatePresets() {
      const value = Number(form?.querySelector('#yearlyGoalInput')?.value);
      form?.querySelectorAll?.('[data-goal-preset]').forEach(button => {
        button.setAttribute('aria-pressed', String(Number(button.dataset.goalPreset) === value));
      });
    }
    form?.addEventListener('input', updatePresets);
    form?.addEventListener('click', event => {
      const stepper = event.target.closest('[data-action="step-goal"]');
      if (stepper?.dataset.step) {
        const input = form.querySelector('#yearlyGoalInput');
        input.value = Math.min(365, Math.max(1, (Number(input.value) || 0) + Number(stepper.dataset.step)));
        updatePresets();
        return;
      }
      const button = event.target.closest('[data-action="set-goal-preset"]');
      if (!button) return;
      const input = form.querySelector('#yearlyGoalInput');
      if (actions?.setGoalPreset) actions.setGoalPreset(input, Number(button.dataset.goalPreset));
      else input.value = Number(button.dataset.goalPreset);
      updatePresets();
    });

    form?.addEventListener('submit', event => {
      event.preventDefault();
      const yearly = Number(new FormData(event.target).get('yearly'));
      if (!Number.isInteger(yearly) || yearly < 1 || yearly > 365) return;
      storage.saveGoals({ yearly, year: new Date().getFullYear() });
      utils.toast(`Goal set: ${yearly} books in ${new Date().getFullYear()}`, 'success');
      if (actions?.refreshGoals) actions.refreshGoals();
      else renderGoalsPage();
    });
  }

  return renderGoalsPage;
}
