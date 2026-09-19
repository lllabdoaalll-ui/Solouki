/**
 * Solouki (سلوكي) — المصادقة: بريد إلكتروني + كلمة مرور
 * STEP 53-B: إزالة PIN بالكامل والانتقال إلى Supabase Auth
 * يعتمد على js/config.js ثم مكتبة supabase-js.
 */

(function ensureConfig() {
  if (!window.SOLOUKI_CONFIG) {
    throw new Error('js/config.js يجب أن يُحمَّل قبل auth.js');
  }
})();

const sb = window.supabase.createClient(
  window.SOLOUKI_CONFIG.SUPABASE_URL,
  window.SOLOUKI_CONFIG.SUPABASE_ANON_KEY
);

// ============================================================
// عناصر الواجهة
// ============================================================
const loginCard      = document.getElementById('loginCard');
const emailLoginForm = document.getElementById('emailLoginForm');
const loginError     = document.getElementById('loginError');
const loginSuccess   = document.getElementById('loginSuccess');
const loginBtn       = document.getElementById('loginBtn');
const togglePassword = document.getElementById('togglePassword');
const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
const forgotModal    = document.getElementById('forgotModal');
const forgotForm     = document.getElementById('forgotForm');
const cancelForgot   = document.getElementById('cancelForgot');
const forgotMsg      = document.getElementById('forgotMsg');

// ============================================================
// أدوات مساعدة
// ============================================================
function showError(el, message) {
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  el.classList.remove('success-box');
  el.classList.add('error-box');
}

function showSuccess(el, message) {
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  el.classList.remove('error-box');
  el.classList.add('success-box');
}

function hideMsg(el) {
  if (!el) return;
  el.hidden = true;
  el.textContent = '';
}

function setLoading(btn, loading) {
  if (!btn) return;
  const text = btn.querySelector('.btn-text');
  const loader = btn.querySelector('.btn-loader');
  btn.disabled = loading;
  if (text) text.hidden = loading;
  if (loader) loader.hidden = !loading;
}

function translateAuthError(msg) {
  const m = (msg || '').toLowerCase();
  if (m.includes('invalid login') || m.includes('invalid credentials')) {
    return 'البريد أو كلمة المرور غير صحيحة';
  }
  if (m.includes('email not confirmed')) {
    return 'البريد غير مفعّل. تحقق من صندوق الوارد أو تواصل مع المسؤول.';
  }
  if (m.includes('too many requests')) {
    return 'محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة.';
  }
  if (m.includes('user not found')) {
    return 'لا يوجد حساب بهذا البريد.';
  }
  return msg || 'حدث خطأ أثناء تسجيل الدخول';
}

function redirectByRole(/* role */) {
  window.location.href = 'dashboard.html';
}

// ============================================================
// إظهار / إخفاء كلمة المرور
// ============================================================
if (togglePassword) {
  togglePassword.addEventListener('click', () => {
    const input = document.getElementById('loginPassword');
    if (!input) return;
    if (input.type === 'password') {
      input.type = 'text';
      togglePassword.innerHTML = '<span class="ico-svg i-eye-off" aria-hidden="true"></span>';
      togglePassword.setAttribute('aria-label', 'إخفاء كلمة المرور');
    } else {
      input.type = 'password';
      togglePassword.innerHTML = '<span class="ico-svg i-eye" aria-hidden="true"></span>';
      togglePassword.setAttribute('aria-label', 'إظهار كلمة المرور');
    }
  });
}

// ============================================================
// تسجيل الدخول (بريد + كلمة مرور)
// ============================================================
if (emailLoginForm) {
  emailLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMsg(loginError);
    hideMsg(loginSuccess);
    setLoading(loginBtn, true);

    const email = (document.getElementById('loginEmail')?.value || '').trim();
    const password = document.getElementById('loginPassword')?.value || '';

    if (!email || !password) {
      showError(loginError, 'أدخل البريد وكلمة المرور');
      setLoading(loginBtn, false);
      return;
    }

    try {
      // 1) تسجيل الدخول عبر Supabase Auth
      const { data: authData, error: authError } = await sb.auth.signInWithPassword({
        email,
        password
      });

      if (authError) {
        throw new Error(translateAuthError(authError.message));
      }

      const user = authData.user;
      if (!user) throw new Error('تعذّر إنشاء الجلسة');

      // 2) جلب الملف الشخصي
      const { data: profile, error: profileError } = await sb
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .eq('is_active', true)
        .single();

      if (profileError || !profile) {
        await sb.auth.signOut();
        throw new Error('الحساب غير مفعّل أو غير موجود في النظام. تواصل مع المسؤول.');
      }

      // 3) تسجيل آخر دخول (لا يوقف التدفق إن فشل)
      try {
        await sb.rpc('record_last_login');
      } catch (_) { /* ignore */ }

      // 4) حفظ الملف في الجلسة
      sessionStorage.setItem(
        window.SOLOUKI_CONFIG.SESSION_PROFILE_KEY || 'solouki_profile',
        JSON.stringify(profile)
      );
      sessionStorage.setItem('solouki_access_mode', 'staff');
      // إزالة أي أثر لـ PIN القديم
      sessionStorage.removeItem(window.SOLOUKI_CONFIG.SESSION_PIN_KEY || 'solouki_pin_verified');

      // 5) إلزام تغيير كلمة المرور عند أول دخول / بعد إعادة التعيين
      if (profile.must_change_password === true) {
        sessionStorage.setItem('solouki_force_change_pwd', '1');
        window.location.href = 'change-password.html?first=1';
        return;
      }

      // 6) توجيه حسب الدور
      redirectByRole(profile.role_type);

    } catch (err) {
      showError(loginError, err.message || 'حدث خطأ غير متوقع');
    } finally {
      setLoading(loginBtn, false);
    }
  });
}

// ============================================================
// نسيت كلمة المرور
// ============================================================
function openForgotModal() {
  if (!forgotModal) return;
  forgotModal.hidden = false;
  forgotModal.style.display = 'flex';
  hideMsg(forgotMsg);
  const emailInput = document.getElementById('forgotEmail');
  const loginEmail = document.getElementById('loginEmail');
  if (emailInput && loginEmail && loginEmail.value) {
    emailInput.value = loginEmail.value.trim();
  }
  if (emailInput) emailInput.focus();
}

function closeForgotModal() {
  if (!forgotModal) return;
  forgotModal.hidden = true;
  forgotModal.style.display = 'none';
  if (forgotForm) forgotForm.reset();
  hideMsg(forgotMsg);
}

if (forgotPasswordBtn) {
  forgotPasswordBtn.addEventListener('click', openForgotModal);
}
if (cancelForgot) {
  cancelForgot.addEventListener('click', closeForgotModal);
}
if (forgotModal) {
  forgotModal.addEventListener('click', (e) => {
    if (e.target === forgotModal) closeForgotModal();
  });
}

if (forgotForm) {
  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMsg(forgotMsg);

    const email = (document.getElementById('forgotEmail')?.value || '').trim();
    if (!email) {
      showError(forgotMsg, 'أدخل البريد الإلكتروني');
      return;
    }

    const submitBtn = forgotForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      // يجب أن يكون Redirect URL مضبوطاً في Supabase → Authentication → URL Configuration
      const redirectTo = window.location.origin +
        (window.location.pathname.replace(/\/[^/]*$/, '/') || '/') +
        'reset-password.html';

      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo
      });

      if (error) throw error;

      showSuccess(forgotMsg, 'تم إرسال رابط الاستعادة إلى بريدك. تحقق من صندوق الوارد (والبريد المزعج).');
      setTimeout(closeForgotModal, 3500);
    } catch (err) {
      showError(forgotMsg, translateAuthError(err.message) || 'تعذّر إرسال الرابط. حاول لاحقاً.');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

// ============================================================
// ولي الأمر: رقم قومي + كود الطالب (بدون حساب Auth)
// ============================================================
(function setupGuardianAccess() {
  const guardianCard = document.getElementById('guardianCard');
  const guardianForm = document.getElementById('guardianForm');
  const guardianError = document.getElementById('guardianError');
  const guardianBtn = document.getElementById('guardianBtn');

  if (!guardianForm) return;

  guardianForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMsg(guardianError);

    const national = String(document.getElementById('gNational')?.value || '').replace(/\D/g, '');
    const code = String(document.getElementById('gCode')?.value || '').trim();

    if (!/^\d{14}$/.test(national)) {
      showError(guardianError, 'الرقم القومي يجب أن يكون 14 رقماً');
      return;
    }
    if (!code) {
      showError(guardianError, 'أدخل كود الطالب');
      return;
    }

    setLoading(guardianBtn, true);

    try {
      const { data, error } = await sb.rpc('guardian_lookup_student', {
        p_national_id: national,
        p_code: code
      });
      if (error) throw error;
      if (!data || !data.id) {
        showError(guardianError, 'لا يوجد طالب مطابق. تحقق من الرقم القومي وكود الطالب.');
        return;
      }

      sessionStorage.setItem('solouki_guardian_student', JSON.stringify(data));
      sessionStorage.setItem('solouki_guardian_creds', JSON.stringify({ national, code }));
      sessionStorage.setItem('solouki_access_mode', 'guardian');
      window.location.href = 'guardian.html';
    } catch (err) {
      showError(guardianError, err.message || 'تعذر التحقق. حاول لاحقاً.');
    } finally {
      setLoading(guardianBtn, false);
    }
  });
})();

// ============================================================
// إذا كان المستخدم مسجلاً مسبقاً → توجيه تلقائي
// ============================================================
(async function checkExistingSession() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;

    // لا نوجّه تلقائياً إذا كنا على صفحة تغيير/إعادة تعيين كلمة المرور
    const path = (window.location.pathname || '').toLowerCase();
    if (path.includes('change-password') || path.includes('reset-password')) return;

    const { data: profile } = await sb
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .eq('is_active', true)
      .single();

    if (!profile) return;

    sessionStorage.setItem(
      window.SOLOUKI_CONFIG.SESSION_PROFILE_KEY || 'solouki_profile',
      JSON.stringify(profile)
    );

    if (profile.must_change_password === true) {
      sessionStorage.setItem('solouki_force_change_pwd', '1');
      window.location.href = 'change-password.html?first=1';
      return;
    }

    // على صفحة الدخول فقط: توجيه للوحة
    if (path.endsWith('/') || path.endsWith('index.html') || path === '') {
      redirectByRole(profile.role_type);
    }
  } catch (_) {
    // تجاهل — المستخدم يبقى على صفحة الدخول
  }
})();
