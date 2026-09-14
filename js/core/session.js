/**
 * Solouki — إدارة الجلسة والتحقق من الدخول
 * يُستخدم من صفحات التطبيق بعد تسجيل الدخول + PIN.
 */
(function (global) {
  'use strict';

  function cfg() {
    return global.SOLOUKI_CONFIG || {};
  }

  function getStoredProfile() {
    try {
      const raw = sessionStorage.getItem(cfg().SESSION_PROFILE_KEY || 'solouki_profile');
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function isPinVerified() {
    return sessionStorage.getItem(cfg().SESSION_PIN_KEY || 'solouki_pin_verified') === 'true';
  }

  function setSession(profile) {
    sessionStorage.setItem(cfg().SESSION_PIN_KEY || 'solouki_pin_verified', 'true');
    sessionStorage.setItem(
      cfg().SESSION_PROFILE_KEY || 'solouki_profile',
      JSON.stringify(profile)
    );
  }

  function clearSession() {
    sessionStorage.removeItem(cfg().SESSION_PIN_KEY || 'solouki_pin_verified');
    sessionStorage.removeItem(cfg().SESSION_PROFILE_KEY || 'solouki_profile');
    if (global.SoloukiPerms && typeof global.SoloukiPerms.clearCache === 'function') {
      global.SoloukiPerms.clearCache();
    }
  }

  /**
   * يتحقق من Auth + PIN + profile.
   * @param {{ roles?: string[], redirectTo?: string }} options
   * @returns {Promise<{ session: object, profile: object }|null>}
   */
  async function requireSession(options) {
    const opts = options || {};
    const redirectTo = opts.redirectTo || 'index.html';
    const allowedRoles = opts.roles || null;

    const sb = global.SoloukiDB.getClient();
    const { data: { session } } = await sb.auth.getSession();
    const profile = getStoredProfile();

    if (!session || !isPinVerified() || !profile) {
      clearSession();
      window.location.href = redirectTo;
      return null;
    }

    if (allowedRoles && allowedRoles.length && !allowedRoles.includes(profile.role_type)) {
      window.location.href = 'dashboard.html';
      return null;
    }

    return { session: session, profile: profile };
  }

  async function logout(redirectTo) {
    try {
      const sb = global.SoloukiDB.getClient();
      await sb.auth.signOut();
    } catch (_) {
      /* ignore */
    }
    clearSession();
    window.location.href = redirectTo || 'index.html';
  }

  global.SoloukiSession = Object.freeze({
    getStoredProfile: getStoredProfile,
    isPinVerified: isPinVerified,
    setSession: setSession,
    clearSession: clearSession,
    requireSession: requireSession,
    logout: logout
  });
})(window);
