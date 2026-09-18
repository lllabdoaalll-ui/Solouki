/**
 * Solouki STEP 64 — بداية عام دراسي جديد (أرشفة دون مسح كامل)
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  let preview = null;
  let countdown = 0;
  let timer = null;

  function sb() {
    return window.SoloukiDB.sb();
  }

  function msg(text, ok) {
    const el = $('nyMsg');
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || '';
    el.style.background = ok ? '#ecfdf5' : '#fef2f2';
    el.style.color = ok ? '#065f46' : '#991b1b';
  }

  function showStep(n) {
    for (let i = 1; i <= 3; i++) {
      const el = $('nyStep' + i);
      if (el) el.hidden = i !== n;
    }
  }

  async function openModal() {
    const modal = $('newYearModal');
    if (!modal) return;
    msg('');
    if ($('nyPassword')) $('nyPassword').value = '';
    if ($('nyConfirmCheck')) $('nyConfirmCheck').checked = false;
    if ($('nyArchiveStudents')) $('nyArchiveStudents').checked = true;
    if ($('nyNotes')) $('nyNotes').value = '';
    if ($('nyFinalBtn')) {
      $('nyFinalBtn').disabled = true;
      $('nyFinalBtn').textContent = 'بدء العام الدراسي الجديد';
    }
    showStep(1);
    modal.hidden = false;
    modal.style.display = 'flex';

    // تحميل المعاينة
    try {
      const { data, error } = await sb().rpc('preview_new_academic_year');
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'تعذر المعاينة');
      preview = data;
      if ($('nyCurrentYear')) $('nyCurrentYear').textContent = data.current_year || '— غير محدد —';
      if ($('nySuggested')) {
        $('nySuggested').value = data.suggested_next_year || '';
      }
      if ($('nyStats')) {
        $('nyStats').innerHTML =
          `<li>طلاب نشطون حالياً: <b>${data.active_students ?? 0}</b></li>` +
          `<li>مخالفات محفوظة (لن تُحذف): <b>${data.violations_count ?? 0}</b></li>` +
          `<li>تكريمات محفوظة (لن تُحذف): <b>${data.merits_count ?? 0}</b></li>`;
      }
    } catch (e) {
      console.error(e);
      msg('تعذر تحميل المعاينة: ' + (e.message || e) + ' — تأكد من تنفيذ SQL الخاص بـ STEP 64', false);
    }
  }

  function closeModal() {
    const modal = $('newYearModal');
    if (!modal) return;
    modal.hidden = true;
    modal.style.display = 'none';
    if (timer) clearInterval(timer);
  }

  async function goConfirm() {
    msg('');
    const year = ($('nySuggested')?.value || '').trim();
    if (year.length < 4) return msg('أدخل العام الدراسي الجديد (مثال: 2026/2027)');
    showStep(2);
  }

  async function verifyAndGoFinal() {
    msg('');
    const password = ($('nyPassword')?.value || '').trim();
    if (!password) return msg('أدخل كلمة المرور');
    try {
      const { data: { user } } = await sb().auth.getUser();
      const email = user?.email;
      if (!email) return msg('تعذر معرفة البريد');
      const { error } = await sb().auth.signInWithPassword({ email, password });
      if (error) return msg('كلمة المرور غير صحيحة');
      showStep(3);
      startCountdown();
    } catch (e) {
      msg(e.message || 'فشل التحقق');
    }
  }

  function startCountdown() {
    const btn = $('nyFinalBtn');
    countdown = 8;
    if (btn) {
      btn.disabled = true;
      btn.textContent = `انتظر ${countdown} ثانية…`;
    }
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      countdown -= 1;
      if (countdown <= 0) {
        clearInterval(timer);
        timer = null;
        updateFinal();
        if (btn) btn.textContent = 'بدء العام الدراسي الجديد';
      } else if (btn) {
        btn.textContent = `انتظر ${countdown} ثانية…`;
      }
    }, 1000);
  }

  function updateFinal() {
    const btn = $('nyFinalBtn');
    const check = $('nyConfirmCheck');
    if (!btn) return;
    btn.disabled = !(countdown <= 0 && check && check.checked);
  }

  async function execute() {
    msg('');
    const year = ($('nySuggested')?.value || '').trim();
    const archive = !!($('nyArchiveStudents')?.checked);
    const notes = ($('nyNotes')?.value || '').trim() || null;
    const btn = $('nyFinalBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'جاري التنفيذ…';
    }
    try {
      const { data, error } = await sb().rpc('start_new_academic_year', {
        p_new_year: year,
        p_archive_students: archive,
        p_notes: notes
      });
      if (error) throw error;
      if (!data?.ok) {
        const map = {
          forbidden: 'هذه العملية للمسؤول العام فقط',
          invalid_year: 'العام الدراسي غير صالح',
          not_authenticated: 'الجلسة غير صالحة'
        };
        throw new Error(map[data?.error] || data?.error || 'فشل التنفيذ');
      }

      msg(
        `تم بنجاح. العام الجديد: ${data.to_year}` +
        (data.archived_students ? ` — تم أرشفة ${data.archived_students} طالباً` : ' — لم تُؤرشف الطلاب') +
        ` — المخالفات المحتفظ بها: ${data.violations_kept ?? 0}` +
        `. الخطوة التالية: رفع كشف طلاب العام الجديد من شاشة الطلاب.`,
        true
      );

      setTimeout(() => {
        closeModal();
        // تحديث خفيف للصفحة
        try {
          const note = document.getElementById('dashVersionNote');
          if (note) note.textContent = (note.textContent || '') + ' · عام ' + data.to_year;
        } catch (_) {}
      }, 2500);
    } catch (e) {
      console.error(e);
      msg(e.message || 'فشل بدء العام الجديد');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'بدء العام الدراسي الجديد';
      }
    }
  }

  function init(profile) {
    if (!profile || profile.role_type !== 'superadmin') return;

    const zone = $('dangerZone');
    if (zone) zone.hidden = false;

    const btn = $('openNewYearBtn');
    if (btn) {
      btn.disabled = false;
      btn.removeAttribute('title');
      btn.addEventListener('click', openModal);
    }

    $('nyCloseBtn')?.addEventListener('click', closeModal);
    $('nyCancel1')?.addEventListener('click', closeModal);
    $('nyToStep2')?.addEventListener('click', goConfirm);
    $('nyVerifyPass')?.addEventListener('click', verifyAndGoFinal);
    $('nyBack2')?.addEventListener('click', () => showStep(1));
    $('nyBack3')?.addEventListener('click', () => showStep(2));
    $('nyConfirmCheck')?.addEventListener('change', updateFinal);
    $('nyFinalBtn')?.addEventListener('click', execute);

    $('newYearModal')?.addEventListener('click', (e) => {
      if (e.target === $('newYearModal')) closeModal();
    });
  }

  window.SoloukiNewYear = { init };
})();
