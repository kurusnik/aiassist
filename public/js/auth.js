(function () {
  'use strict';

  async function checkAuth(requireAdmin = false) {
    try {
      const response = await fetch('/auth/check', { credentials: 'include' });
      const data = await response.json();
      if (!data.authenticated) {
        window.location.href = '/login.html';
        return null;
      }
      if (requireAdmin && !data.user.isAdmin) {
        window.location.href = '/';
        return null;
      }
      return data.user;
    } catch {
      window.location.href = '/login.html';
      return null;
    }
  }

  async function logout() {
    try {
      await fetch('/logout', { method: 'POST', credentials: 'include' });
    } catch {}
    window.location.href = '/login.html';
  }

  window.AIOS = window.AIOS || {};
  window.AIOS.auth = { checkAuth, logout };
})();