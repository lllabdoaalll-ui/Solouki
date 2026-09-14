/**
 * Solouki — أدوات مساعدة مشتركة
 * لا تعتمد على DOM خاص بصفحة معيّنة.
 */
(function (global) {
  'use strict';

  function $(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, function (m) {
      return ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      })[m];
    });
  }

  function digits(value) {
    return String(value ?? '').replace(/\D/g, '');
  }

  function normalizeText(value) {
    return String(value ?? '').trim().replace(/\s+/g, ' ');
  }

  function phone(value) {
    const d = digits(value);
    if (!d) return '';
    if (d.startsWith('20')) return d;
    if (d.startsWith('0')) return '20' + d.slice(1);
    if (d.length === 10) return '20' + d;
    return d;
  }

  function validPhone(value) {
    const d = phone(value);
    if (!d) return true;
    return /^201[0125][0-9]{8}$/.test(d);
  }

  function validNationalId(value) {
    return /^\d{14}$/.test(digits(value));
  }

  function roleLabel(roleType) {
    const map = {
      superadmin: 'المسؤول العام',
      stage_manager: 'مدير مرحلة',
      it_officer: 'مسؤول حاسب',
      counselor: 'أخصائي اجتماعي',
      teacher: 'معلم',
      guardian: 'ولي أمر'
    };
    return map[roleType] || roleType || '—';
  }

  function showNote(elOrId, message, isError) {
    const el = typeof elOrId === 'string' ? $(elOrId) : elOrId;
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    if (isError) el.classList.add('error');
    else el.classList.remove('error');
    clearTimeout(el._soloukiNoteTimer);
    el._soloukiNoteTimer = setTimeout(function () {
      el.hidden = true;
    }, 3500);
  }

  function formatDateAr(isoOrDate) {
    if (!isoOrDate) return '—';
    try {
      const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
      if (Number.isNaN(d.getTime())) return String(isoOrDate);
      return d.toLocaleDateString('ar-EG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (_) {
      return String(isoOrDate);
    }
  }

  global.SoloukiUtils = Object.freeze({
    $,
    esc,
    digits,
    normalizeText,
    phone,
    validPhone,
    validNationalId,
    roleLabel,
    showNote,
    formatDateAr
  });
})(window);
