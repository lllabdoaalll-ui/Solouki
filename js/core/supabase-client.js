/**
 * Solouki — عميل Supabase موحّد (Singleton)
 * يُحمَّل بعد config.js ومكتبة supabase-js.
 */
(function (global) {
  'use strict';

  let client = null;

  function getClient() {
    if (client) return client;

    const cfg = global.SOLOUKI_CONFIG;
    if (!cfg || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
      throw new Error('SOLOUKI_CONFIG غير مُعرَّف. تأكد من تحميل js/config.js أولاً.');
    }
    if (!global.supabase || typeof global.supabase.createClient !== 'function') {
      throw new Error('مكتبة @supabase/supabase-js غير محمّلة.');
    }

    client = global.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    return client;
  }

  global.SoloukiDB = Object.freeze({
    getClient: getClient,
    /** اختصار شائع */
    sb: function () {
      return getClient();
    }
  });
})(window);
