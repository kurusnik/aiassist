(function () {
  'use strict';

  class NotificationSystem {
    constructor() {
      this.container = null;
      this._initContainer();
    }

    _initContainer() {
      if (document.getElementById('aios-toast-container')) return;
      this.container = document.createElement('div');
      this.container.id = 'aios-toast-container';
      this.container.style.cssText = `
        position: fixed; bottom: 20px; right: 20px; z-index: 1100;
        display: flex; flex-direction: column; gap: 8px; max-width: 380px;
      `;
      document.body.appendChild(this.container);
    }

    show(message, type = 'info', duration = 4000) {
      const toast = document.createElement('div');
      const colors = {
        success: 'var(--success)',
        error: 'var(--danger)',
        warning: 'var(--warning)',
        info: 'var(--accent)'
      };
      const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
      const color = colors[type] || colors.info;
      toast.style.cssText = `
        background: var(--bg-surface); border: 1px solid var(--border-primary);
        border-left: 3px solid ${color}; border-radius: var(--radius-md);
        padding: 12px 16px; display: flex; align-items: center; gap: 10px;
        box-shadow: var(--shadow-lg); font-size: var(--text-sm);
        color: var(--text-primary); animation: toastIn 200ms var(--ease-out);
        max-width: 100%;
      `;
      toast.innerHTML = `<span style="color:${color};font-weight:600;flex-shrink:0;">${icons[type]}</span><span>${this._escape(message)}</span>`;
      this.container.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        toast.style.transition = '200ms var(--ease-out)';
        setTimeout(() => toast.remove(), 200);
      }, duration);
    }

    success(msg, dur) { this.show(msg, 'success', dur); }
    error(msg, dur) { this.show(msg, 'error', dur); }
    warning(msg, dur) { this.show(msg, 'warning', dur); }
    info(msg, dur) { this.show(msg, 'info', dur); }

    _escape(s) {
      const d = document.createElement('div');
      d.textContent = s;
      return d.innerHTML;
    }
  }

  window.AIOS = window.AIOS || {};
  window.AIOS.Notifications = NotificationSystem;

  const style = document.createElement('style');
  style.textContent = `
    @keyframes toastIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
  `;

  function init() {
    window.AIOS.notify = new NotificationSystem();
    document.head.appendChild(style);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();