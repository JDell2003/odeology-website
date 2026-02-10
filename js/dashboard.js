(() => {
  function setupDashboard() {
    const btn = document.getElementById('dashboard-open-checkin');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('control-checkin')?.click?.();
    });
  }

  document.addEventListener('DOMContentLoaded', setupDashboard);
})();

