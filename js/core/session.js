/**
 * Solouki — إدارة الجلسة والتحقق من الدخول
 * STEP 53-B: يعتمد على Supabase Auth فقط (بدون PIN)
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

  function setSession(profile) {
    sessionStorage.setItem(
      cfg().SESSION_PROFILE_KEY || 'solouki_profile',
      JSON.stringify(profile)
    );
    // إزالة أي أثر لـ PIN القديم
    sessionStorage.removeItem(cfg().SESSION_PIN_KEY || 'solouki_pin_verified');
  }

  function clearSession() {
    sessionStorage.removeItem(cfg().SESSION_PIN_KEY || 'solouki_pin_verified');
    sessionStorage.removeItem(cfg().SESSION_PROFILE_KEY || 'solouki_profile');
    sessionStorage.removeItem('solouki_force_change_pwd');
    sessionStorage.removeItem('solouki_access_mode');
    if (global.SoloukiPerms && typeof global.SoloukiPerms.clearCache === 'function') {
      global.SoloukiPerms.clearCache();
    }
  }

  /**
   * يتحقق من Auth session + profile.
   * إذا كان must_change_password = true يوجّه لصفحة تغيير كلمة المرور.
   * @param {{ roles?: string[], redirectTo?: string, allowPasswordChange?: boolean }} options
   * @returns {Promise<{ session: object, profile: object }|null>}
   */
  async function requireSession(options) {
    const opts = options || {};
    const redirectTo = opts.redirectTo || 'index.html';
    const allowedRoles = opts.roles || null;
    const allowPasswordChange = opts.allowPasswordChange === true;

    const sb = global.SoloukiDB.getClient();
    const { data: { session } } = await sb.auth.getSession();

    if (!session) {
      clearSession();
      window.location.href = redirectTo;
      return null;
    }

    // جلب/تحديث الملف الشخصي من الخادم
    let profile = getStoredProfile();
    try {
      const { data, error } = await sb
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .eq('is_active', true)
        .single();
      if (!error && data) {
        profile = data;
        setSession(profile);
      }
    } catch (_) { /* استخدم المخزّن محلياً */ }

    if (!profile) {
      clearSession();
      try { await sb.auth.signOut(); } catch (_) {}
      window.location.href = redirectTo;
      return null;
    }

    // إلزام تغيير كلمة المرور
    if (profile.must_change_password === true && !allowPasswordChange) {
      sessionStorage.setItem('solouki_force_change_pwd', '1');
      window.location.href = 'change-password.html?first=1';
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
    } catch (_) { /* ignore */ }
    clearSession();
    window.location.href = redirectTo || 'index.html';
  }

  // توافق عكسي: بعض الصفحات قد تستدعي isPinVerified
  function isPinVerified() {
    return true; // لم يعد مستخدماً — الجلسة تعتمد على Auth فقط
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
