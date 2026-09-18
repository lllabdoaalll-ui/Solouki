/**
 * Solouki STEP 63 — System Factory Reset wizard
 * يظهر للمسؤول العام فقط من لوحة التحكم.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  let state = {
    step: 1,
    passwordOk: false,
    otpSent: false,
    emailHint: '',
    countdown: 0,
    timer: null
  };

  function sb() {
    return window.SoloukiDB.sb();
  }

  function showStep(n) {
    state.step = n;
    for (let i = 1; i <= 4; i++) {
      const el = $('srStep' + i);
      if (el) el.hidden = i !== n;
    }
    const title = $('srTitle');
    if (title) {
      const titles = {
        1: 'تحذير — تنظيف جميع بيانات النظام',
        2: 'إعادة المصادقة',
        3: 'كود التحقق من البريد',
        4: 'التأكيد النهائي'
      };
      title.textContent = titles[n] || 'تنظيف النظام';
    }
  }

  function msg(text, ok) {
    const el = $('srMsg');
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || '';
    el.style.background = ok ? '#ecfdf5' : '#fef2f2';
    el.style.color = ok ? '#065f46' : '#991b1b';
  }

  function openModal() {
    const modal = $('systemResetModal');
    if (!modal) return;
    state = { step: 1, passwordOk: false, otpSent: false, emailHint: '', countdown: 0, timer: null };
    msg('');
    if ($('srPassword')) $('srPassword').value = '';
    if ($('srOtp')) $('srOtp').value = '';
    if ($('srConfirmCheck')) $('srConfirmCheck').checked = false;
    if ($('srFinalBtn')) {
      $('srFinalBtn').disabled = true;
      $('srFinalBtn').textContent = 'تنفيذ المسح النهائي';
    }
    showStep(1);
    modal.hidden = false;
    modal.style.display = 'flex';
  }

  function closeModal() {
    const modal = $('systemResetModal');
    if (!modal) return;
    modal.hidden = true;
    modal.style.display = 'none';
    if (state.timer) clearInterval(state.timer);
  }

  async function verifyPassword() {
    msg('');
    const password = ($('srPassword')?.value || '').trim();
    if (!password) return msg('أدخل كلمة المرور الحالية');

    try {
      const { data: { user } } = await sb().auth.getUser();
      const email = user?.email;
      if (!email) return msg('تعذر معرفة البريد الإلكتروني للحساب');

      const { error } = await sb().auth.signInWithPassword({ email, password });
      if (error) return msg('كلمة المرور غير صحيحة');

      state.passwordOk = true;
      showStep(3);
      // إرسال OTP تلقائياً
      await sendOtp();
    } catch (e) {
      msg(e.message || 'فشل التحقق');
    }
  }

  async function sendOtp() {
    msg('');
    const btn = $('srSendOtpBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'جاري الإرسال…';
    }
    try {
      // تهيئة من جهة القاعدة (تحقق صلاحية + تلميح البريد)
      const { data: prep, error: prepErr } = await sb().rpc('request_system_reset_otp', {
        p_client_meta: { ua: navigator.userAgent || '' }
      });
      if (prepErr) throw prepErr;
      if (!prep?.ok) {
        const map = {
          forbidden: 'هذه العملية للمسؤول العام فقط',
          rate_limited: 'تم تجاوز حد المحاولات. انتظر 15 دقيقة',
          no_email: 'لا يوجد بريد مرتبط بالحساب',
          not_authenticated: 'الجلسة غير صالحة'
        };
        throw new Error(map[prep?.error] || prep?.error || 'تعذر تجهيز رمز التحقق');
      }
      state.emailHint = prep.email_hint || '';

      // Edge Function لإصدار الكود وإرسال البريد
      const { data: fnData, error: fnErr } = await sb().functions.invoke('system-reset-otp', {
        body: { action: 'send_otp' }
      });

      if (fnErr) {
        // الدالة غير منشورة أو فشل الشبكة
        console.error(fnErr);
        msg(
          'تعذر استدعاء دالة إرسال الكود (Edge Function). ' +
          'انشر الدالة system-reset-otp من مجلد supabase/functions ثم أعد المحاولة. ' +
          (fnErr.message || ''),
          false
        );
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'إعادة إرسال الكود';
        }
        return;
      }

      if (!fnData?.ok) {
        throw new Error(fnData?.error || 'فشل إرسال الكود');
      }

      state.otpSent = true;
      state.emailHint = fnData.email_hint || state.emailHint;
      const hintEl = $('srEmailHint');
      if (hintEl) {
        hintEl.textContent = state.emailHint
          ? `تم إرسال كود التحقق إلى: ${state.emailHint}`
          : 'تم إصدار كود التحقق';
      }

      if (fnData.emailed) {
        msg('تم إرسال كود التحقق إلى بريدك. صالح لمدة 10 دقائق.', true);
      } else {
        msg(
          'تم إصدار الكود. إن لم يصلك بريد، راجع سجلات Edge Function أو اضبط RESEND_API_KEY. ' +
          (fnData.email_error ? '(' + fnData.email_error + ')' : ''),
          true
        );
      }
    } catch (e) {
      console.error(e);
      msg(e.message || 'فشل إرسال الكود');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'إعادة إرسال الكود';
      }
    }
  }

  function goFinal() {
    msg('');
    const otp = ($('srOtp')?.value || '').trim();
    if (!/^\d{6}$/.test(otp)) return msg('أدخل كود التحقق المكوّن من 6 أرقام');
    showStep(4);
    startCountdown();
  }

  function startCountdown() {
    const btn = $('srFinalBtn');
    const check = $('srConfirmCheck');
    state.countdown = 10;
    if (btn) {
      btn.disabled = true;
      btn.textContent = `انتظر ${state.countdown} ثانية…`;
    }
    if (state.timer) clearInterval(state.timer);
    state.timer = setInterval(() => {
      state.countdown -= 1;
      if (state.countdown <= 0) {
        clearInterval(state.timer);
        state.timer = null;
        updateFinalEnabled();
        if (btn) btn.textContent = 'تنفيذ المسح النهائي';
      } else if (btn) {
        btn.textContent = `انتظر ${state.countdown} ثانية…`;
      }
    }, 1000);
  }

  function updateFinalEnabled() {
    const btn = $('srFinalBtn');
    const check = $('srConfirmCheck');
    if (!btn) return;
    btn.disabled = !(state.countdown <= 0 && check && check.checked);
  }

  async function executeWipe() {
    msg('');
    const otp = ($('srOtp')?.value || '').trim();
    const btn = $('srFinalBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'جاري المسح…';
    }
    try {
      const { data, error } = await sb().rpc('execute_system_factory_reset', { p_otp: otp });
      if (error) throw error;
      if (!data?.ok) {
        const map = {
          otp_mismatch_or_expired: 'كود التحقق غير صحيح أو منتهٍ',
          forbidden: 'غير مصرح',
          invalid_otp: 'كود غير صالح'
        };
        throw new Error(map[data?.error] || data?.error || 'فشل المسح');
      }

      // محاولة مسح Storage (اختياري — لا يوقف النجاح)
      try {
        await sb().functions.invoke('system-reset-otp', { body: { action: 'wipe_storage' } });
      } catch (_) { /* تجاهل */ }

      msg('تم تنظيف النظام بنجاح. سيتم تسجيل الخروج…', true);
      setTimeout(() => {
        try { sessionStorage.clear(); } catch (_) {}
        window.SoloukiSession.logout('index.html');
      }, 1800);
    } catch (e) {
      console.error(e);
      msg(e.message || 'فشل تنفيذ المسح');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'تنفيذ المسح النهائي';
      }
    }
  }

  function init(profile) {
    if (!profile || profile.role_type !== 'superadmin') return;

    // إظهار منطقة الخطر
    const zone = $('dangerZone');
    if (zone) zone.hidden = false;

    const openBtn = $('openSystemResetBtn');
    if (openBtn) openBtn.addEventListener('click', openModal);

    $('srCloseBtn')?.addEventListener('click', closeModal);
    $('srCancel1')?.addEventListener('click', closeModal);
    $('srToStep2')?.addEventListener('click', () => showStep(2));
    $('srVerifyPass')?.addEventListener('click', verifyPassword);
    $('srSendOtpBtn')?.addEventListener('click', sendOtp);
    $('srToFinal')?.addEventListener('click', goFinal);
    $('srBack3')?.addEventListener('click', () => showStep(2));
    $('srBack4')?.addEventListener('click', () => showStep(3));
    $('srConfirmCheck')?.addEventListener('change', updateFinalEnabled);
    $('srFinalBtn')?.addEventListener('click', executeWipe);

    const modal = $('systemResetModal');
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  window.SoloukiSystemReset = { init };
})();
