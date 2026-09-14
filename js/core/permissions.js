/**
 * Solouki — طبقة الصلاحيات (واجهة)
 * تعتمد على دوال SQL: my_permission(key) من STEP 41.
 * القيم: 'active' | 'observer' | 'none'
 */
(function (global) {
  'use strict';

  const cache = Object.create(null);

  async function myPermission(key) {
    if (!key) return 'none';
    if (Object.prototype.hasOwnProperty.call(cache, key)) {
      return cache[key];
    }

    const sb = global.SoloukiDB.getClient();
    const { data, error } = await sb.rpc('my_permission', { p_key: key });

    if (error) {
      console.warn('[Solouki] my_permission failed:', key, error.message);
      cache[key] = 'none';
      return 'none';
    }

    const mode = data || 'none';
    cache[key] = mode;
    return mode;
  }

  function clearCache() {
    Object.keys(cache).forEach(function (k) {
      delete cache[k];
    });
  }

  async function canAct(key) {
    return (await myPermission(key)) === 'active';
  }

  async function canView(key) {
    const m = await myPermission(key);
    return m === 'active' || m === 'observer';
  }

  /**
   * يطبّق الصلاحية على عنصر: إخفاء / قراءة فقط / تفعيل
   * @param {HTMLElement|string} elOrId
   * @param {string} key
   * @param {{ hideIfNone?: boolean, disableIfObserver?: boolean }} opts
   */
  async function applyToElement(elOrId, key, opts) {
    const options = opts || {};
    const hideIfNone = options.hideIfNone !== false;
    const disableIfObserver = options.disableIfObserver !== false;
    const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
    if (!el) return 'none';

    const mode = await myPermission(key);

    if (mode === 'none') {
      if (hideIfNone) el.hidden = true;
      el.disabled = true;
      el.setAttribute('data-perm', 'none');
      return mode;
    }

    el.hidden = false;
    el.setAttribute('data-perm', mode);

    if (mode === 'observer' && disableIfObserver) {
      el.disabled = true;
      el.classList.add('perm-readonly');
    } else {
      el.disabled = false;
      el.classList.remove('perm-readonly');
    }
    return mode;
  }

  global.SoloukiPerms = Object.freeze({
    myPermission: myPermission,
    canAct: canAct,
    canView: canView,
    applyToElement: applyToElement,
    clearCache: clearCache
  });
})(window);
