/**
 * Solouki STEP 66 — App shell helpers (bottom nav + page class)
 */
(function () {
  'use strict';

  const PAGES = [
    { href: 'dashboard.html', icon: '🏠', label: 'الرئيسية', match: /dashboard\.html|^\/?$/i },
    { href: 'violations.html', icon: '📝', label: 'مخالفة', match: /violations\.html/i, perm: 'record_violations' },
    { href: 'merits.html', icon: '🏆', label: 'تكريم', match: /merits\.html/i, perm: 'record_merits' },
    { href: 'students.html', icon: '👨‍🎓', label: 'طلاب', match: /students\.html/i, perm: 'view_students' },
    { href: 'student-report.html', icon: '📁', label: 'ملف', match: /student-report\.html/i, perm: 'view_reports' }
  ];

  function pathName() {
    return (location.pathname || '').split('/').pop() || 'dashboard.html';
  }

  function ensureBottomNav() {
    if (document.getElementById('bottomNav')) return;
    if (window.matchMedia && window.matchMedia('(min-width: 900px)').matches) {
      // ما زال نضيف العنصر؛ CSS يخفيه على الشاشات الكبيرة
    }
    const nav = document.createElement('nav');
    nav.className = 'bottom-nav';
    nav.id = 'bottomNav';
    nav.setAttribute('aria-label', 'التنقل الرئيسي');
    const current = pathName();
    nav.innerHTML = PAGES.map((p) => {
      const active = p.match.test(current) ? ' is-active' : '';
      return `<a href="${p.href}" class="${active.trim()}" data-nav="${p.href}"><span class="nav-ico">${p.icon}</span><span>${p.label}</span></a>`;
    }).join('');
    document.body.appendChild(nav);
    document.body.classList.add('app-page');
  }

  function wireLogout(btn) {
    if (!btn || btn._soloukiLogoutBound) return;
    btn._soloukiLogoutBound = true;
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      if (window.SoloukiSession && SoloukiSession.logout) {
        SoloukiSession.logout('index.html');
      } else {
        location.href = 'index.html';
      }
    });
  }

  function init() {
    // لا نضيف الشريط على صفحة الدخول
    const path = pathName();
    if (/^(index|offline|guardian|reset-password|change-password)\.html$/i.test(path)) return;
    if (document.body.classList.contains('auth-page')) return;

    ensureBottomNav();
    document.querySelectorAll('#logout, #logoutDashBtn, [data-action="logout"]').forEach(wireLogout);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.SoloukiAppShell = { init: init, ensureBottomNav: ensureBottomNav };
})();
