(function () {
  'use strict';
  function addStatus() {
    if (document.getElementById('soloukiConnectionStatus')) return;
    const el = document.createElement('div');
    el.id = 'soloukiConnectionStatus';
    el.setAttribute('role','status');
    el.style.cssText = 'position:fixed;bottom:12px;left:12px;z-index:9999;padding:7px 11px;border-radius:999px;font:600 12px/1.2 Cairo,Arial,sans-serif;display:none;box-shadow:0 2px 10px rgba(15,23,42,.12)';
    document.body.appendChild(el);
    const refresh = () => {
      const offline = !navigator.onLine;
      el.textContent = offline ? '⚠️ وضع عدم الاتصال — البيانات قديمة' : '✓ متصل';
      el.style.display = offline ? 'block' : 'none';
    };
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    refresh();
  }

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', {scope:'./'}).catch(() => {});
    });
  }

  function init() { addStatus(); registerSW(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
