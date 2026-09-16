/**
 * Solouki (سلوكي) — المصادقة: Supabase Auth + PIN
 * يعتمد على js/config.js ثم مكتبة supabase-js.
 */

// ============================================================
// تهيئة Supabase من المصدر الموحّد
// ============================================================
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
const loginCard   = document.getElementById('loginCard');
const pinCard     = document.getElementById('pinCard');
if (pinCard) pinCard.hidden = true;
const loginForm   = document.getElementById('loginForm');
const pinForm     = document.getElementById('pinForm');
const loginError  = document.getElementById('loginError');
const pinError    = document.getElementById('pinError');
const loginBtn    = document.getElementById('loginBtn');
const pinBtn      = document.getElementById('pinBtn');
const logoutBtn   = document.getElementById('logoutBtn');
const userInfo    = document.getElementById('userInfo');
const togglePassword = document.getElementById('togglePassword');

// ============================================================
// حالة التطبيق
// ============================================================
let currentUser = null;
let currentProfile = null;

// ============================================================
// أدوات مساعدة
// ============================================================
function showError(el, message) {
  el.textContent = message;
  el.hidden = false;
}

function hideError(el) {
  el.hidden = true;
  el.textContent = '';
}

function setLoading(btn, loading) {
  const text = btn.querySelector('.btn-text');
  const loader = btn.querySelector('.btn-loader');
  btn.disabled = loading;
  if (loading) {
    text.hidden = true;
    loader.hidden = false;
  } else {
    text.hidden = false;
    loader.hidden = true;
  }
}

function showPinScreen(profile) {
  loginCard.hidden = true;
  pinCard.hidden = false;
  userInfo.innerHTML = `
    مرحباً، <strong>${profile.full_name}</strong><br>
    <span style="color:#64748b;font-size:13px">${profile.role_type === 'superadmin' ? 'المسؤول العام' : profile.role_type}</span>
  `;
  document.getElementById('pin').value = '';
  document.getElementById('pin').focus();
}

function showLoginScreen() {
  pinCard.hidden = true;
  loginCard.hidden = false;
  loginForm.reset();
  hideError(loginError);
  hideError(pinError);
}

// ============================================================
// إظهار / إخفاء كلمة المرور
// ============================================================
if (togglePassword) {
  togglePassword.addEventListener('click', () => {
    const input = document.getElementById('password');
    if (!input) return;
    if (input.type === 'password') {
      input.type = 'text';
      togglePassword.textContent = '🔒';
    } else {
      input.type = 'password';
      togglePassword.textContent = '👁';
    }
  });
}

// ============================================================
// تسجيل الدخول (إيميل + كلمة مرور)
// ============================================================
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError(loginError);
  setLoading(loginBtn, true);

  const email = (document.getElementById('email')?.value || '').trim();
  const password = document.getElementById('password')?.value || '';

  if (!email || !password) {
    showError(loginError, 'أدخل البريد وكلمة المرور');
    setLoading(loginBtn, false);
    return;
  }

  try {
    // 1. تسجيل الدخول عبر Supabase Auth
    const { data: authData, error: authError } = await sb.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      throw new Error(translateAuthError(authError.message));
    }

    currentUser = authData.user;

    // 2. جلب بيانات الملف الشخصي
    const { data: profile, error: profileError } = await sb
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .eq('is_active', true)
      .single();

    if (profileError || !profile) {
      await sb.auth.signOut();
      throw new Error('الحساب غير مفعّل أو غير موجود في النظام. تواصل مع المسؤول.');
    }

    currentProfile = profile;

    // 3. الانتقال لشاشة PIN
    sessionStorage.setItem('solouki_profile', JSON.stringify(profile));
      sessionStorage.setItem('solouki_pin_verified', 'true');
      redirectByRole(profile.role_type);

  } catch (err) {
    showError(loginError, err.message || 'حدث خطأ غير متوقع');
  } finally {
    setLoading(loginBtn, false);
  }
});

// ============================================================
// التحقق من PIN
// ============================================================
pinForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError(pinError);
  setLoading(pinBtn, true);

  const pin = document.getElementById('pin').value.trim();

  try {
    if (!pin || pin.length < 4) {
      throw new Error('الرمز السري يجب أن يكون 4 أرقام على الأقل');
    }

    // التحقق من PIN عبر دالة في قاعدة البيانات (أو مقارنة محلية مؤقتاً)
    // حالياً نستخدم طريقة بسيطة: نستدعي دالة SQL للتحقق
    const { data, error } = await sb.rpc('verify_pin', {
      p_user_id: currentUser.id,
      p_pin: pin
    });

    // إذا لم تكن الدالة موجودة بعد، نستخدم طريقة بديلة مؤقتة
    if (error && error.message.includes('function') ) {
      // طريقة مؤقتة: مقارنة مباشرة (ستُستبدل لاحقاً)
      const isValid = await verifyPinLocally(pin);
      if (!isValid) {
        throw new Error('الرمز السري غير صحيح');
      }
    } else if (error) {
      throw new Error('خطأ في التحقق من الرمز السري');
    } else if (data === false) {
      throw new Error('الرمز السري غير صحيح');
    }

    // نجاح → حفظ الجلسة والانتقال للوحة التحكم
    sessionStorage.setItem('solouki_pin_verified', 'true');
    sessionStorage.setItem('solouki_profile', JSON.stringify(currentProfile));

    // توجيه حسب الدور
    redirectByRole(currentProfile.role_type);

  } catch (err) {
    showError(pinError, err.message || 'الرمز السري غير صحيح');
    // زيادة عدد المحاولات الفاشلة (لاحقاً)
  } finally {
    setLoading(pinBtn, false);
  }
});

// ============================================================
// تسجيل الخروج
// ============================================================
logoutBtn.addEventListener('click', async () => {
  await sb.auth.signOut();
  sessionStorage.clear();
  currentUser = null;
  currentProfile = null;
  showLoginScreen();
});

// ============================================================
// التحقق المحلي المؤقت من PIN (حتى إنشاء الدالة)
// ============================================================
async function verifyPinLocally(pin) {
  // هذه طريقة مؤقتة للتطوير فقط
  // في الإنتاج يجب استخدام دالة SECURITY DEFINER في PostgreSQL
  try {
    const { data, error } = await sb
      .from('profiles')
      .select('pin_hash')
      .eq('id', currentUser.id)
      .single();

    if (error || !data) return false;

    // نستخدم RPC للتحقق من الـ hash (لأننا لا نستطيع استخدام crypt في المتصفح)
    // مؤقتاً: إذا كان PIN = 123456 نقبل (للتطوير فقط)
    // TODO: استبدال هذا بدالة SQL حقيقية
    console.warn('⚠️ التحقق من PIN يعمل في وضع التطوير فقط');
    return pin === '123456';
  } catch {
    return false;
  }
}

// ============================================================
// توجيه حسب الدور
// ============================================================
function redirectByRole(role) {
  // حالياً نوجه الجميع لصفحة واحدة (سيتم تطويرها لاحقاً)
  // في المراحل القادمة سنفصل اللوحات
  window.location.href = 'dashboard.html';
}


// ============================================================
// دخول الطاقم: اسم + PIN (أسلوب نظام رصد الدرجات)
// ============================================================
const pinStaffForm = document.getElementById('pinStaffForm');
const pinStaffError = document.getElementById('pinStaffError');
const pinStaffBtn = document.getElementById('pinStaffBtn');
const staffSelect = document.getElementById('staffSelect');

const ROLE_AR = {
  superadmin: 'مسؤول عام',
  stage_manager: 'مدير مرحلة',
  it_officer: 'مسؤول حاسب',
  counselor: 'أخصائي اجتماعي'
};

async function loadStaffLoginList() {
  if (!staffSelect) return;
  try {
    const { data, error } = await sb.rpc('list_staff_for_login');
    if (error) throw error;
    const list = Array.isArray(data) ? data : [];
    if (!list.length) {
      staffSelect.innerHTML = '<option value="">— لا يوجد حسابات بأرقام سرية بعد —</option>';
      return;
    }
    staffSelect.innerHTML = '<option value="">— اختر اسمك —</option>' +
      list.map((p) => {
        const role = ROLE_AR[p.role_type] || p.role_type;
        return `<option value="${p.id}">${p.full_name} — ${role}</option>`;
      }).join('');
  } catch (e) {
    console.warn('list_staff_for_login', e);
    staffSelect.innerHTML = '<option value="">— تعذّر تحميل الأسماء — نفّذ SQL الخطوة 50.3 —</option>';
  }
}

if (pinStaffForm) {
  loadStaffLoginList();

  pinStaffForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError(pinStaffError);
    const profileId = staffSelect?.value;
    const pin = (document.getElementById('staffPin')?.value || '').trim();
    if (!profileId) {
      showError(pinStaffError, 'اختر اسمك من القائمة');
      return;
    }
    if (!pin) {
      showError(pinStaffError, 'أدخل الرقم السري');
      return;
    }
    setLoading(pinStaffBtn, true);
    try {
      const { data, error } = await sb.functions.invoke('pin-login', {
        body: { profile_id: profileId, pin }
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.token_hash) throw new Error('لم تُرجع الخادم رمز جلسة');

      const { data: sess, error: otpErr } = await sb.auth.verifyOtp({
        token_hash: data.token_hash,
        type: 'email'
      });
      if (otpErr) throw otpErr;

      // تحميل الملف الشخصي
      const { data: { user } } = await sb.auth.getUser();
      if (!user) throw new Error('تعذّر إنشاء الجلسة');

      const { data: profile, error: profileError } = await sb
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .eq('is_active', true)
        .single();

      if (profileError || !profile) {
        await sb.auth.signOut();
        throw new Error('لا يوجد ملف شخصي نشط مرتبط بهذا الحساب');
      }

      sessionStorage.setItem('solouki_profile', JSON.stringify(profile));
      sessionStorage.setItem('solouki_pin_verified', 'true');
      redirectByRole(profile.role_type);
    } catch (err) {
      console.error(err);
      let msg = err.message || 'فشل الدخول';
      if (/Failed to send|FunctionsRelayError|not found|404/i.test(msg)) {
        msg = 'دالة الدخول بالرقم السري غير منشورة بعد. انشر Edge Function: pin-login — أو استخدم دخول البريد مؤقتاً.';
      }
      showError(pinStaffError, msg);
    } finally {
      setLoading(pinStaffBtn, false);
    }
  });
}


// ============================================================
// ترجمة أخطاء Supabase
// ============================================================
function translateAuthError(msg) {
  const map = {
    'Invalid login credentials': 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
    'Email not confirmed': 'البريد الإلكتروني غير مؤكد',
    'Too many requests': 'محاولات كثيرة جداً. حاول لاحقاً',
    'User not found': 'المستخدم غير موجود',
    'Invalid email': 'صيغة البريد الإلكتروني غير صحيحة'
  };

  for (const [key, value] of Object.entries(map)) {
    if (msg.includes(key)) return value;
  }
  return 'فشل تسجيل الدخول. تحقق من البيانات وحاول مرة أخرى';
}

// ============================================================
// التحقق من الجلسة عند تحميل الصفحة
// ============================================================
(async function checkSession() {
  const { data: { session } } = await sb.auth.getSession();

  if (session) {
    // دخول الطاقم: كلمة المرور فقط — بدون PIN
    const { data: profile } = await sb
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .eq('is_active', true)
      .single();

    if (profile) {
      currentUser = session.user;
      currentProfile = profile;
      sessionStorage.setItem('solouki_profile', JSON.stringify(profile));
      sessionStorage.setItem('solouki_pin_verified', 'true'); // توافق مع صفحات قديمة
      redirectByRole(profile.role_type);
      return;
    }
  }
})();


// ============================================================
// ولي الأمر: رقم قومي + كود الطالب (بدون حساب Auth)
// ============================================================
(function setupGuardianAccess() {
  const goGuardian = document.getElementById('goGuardian');
  const backToStaff = document.getElementById('backToStaff');
  const guardianCard = document.getElementById('guardianCard');
  const guardianForm = document.getElementById('guardianForm');
  const guardianError = document.getElementById('guardianError');

  if (goGuardian && loginCard && guardianCard) {
    goGuardian.onclick = () => {
      loginCard.hidden = true;
      if (pinCard) pinCard.hidden = true;
      guardianCard.hidden = false;
    };
  }
  if (backToStaff) {
    backToStaff.onclick = () => {
      if (guardianCard) guardianCard.hidden = true;
      loginCard.hidden = false;
    };
  }
  if (guardianForm) {
    guardianForm.onsubmit = async (e) => {
      e.preventDefault();
      if (guardianError) { guardianError.hidden = true; guardianError.textContent = ''; }
      const national = String(document.getElementById('gNational').value || '').replace(/\D/g, '');
      const code = String(document.getElementById('gCode').value || '').trim();
      if (!/^\d{14}$/.test(national)) {
        if (guardianError) { guardianError.textContent = 'الرقم القومي يجب أن يكون 14 رقمًا'; guardianError.hidden = false; }
        return;
      }
      if (!code) {
        if (guardianError) { guardianError.textContent = 'أدخل كود الطالب'; guardianError.hidden = false; }
        return;
      }
      try {
        // RPC آمن: لا يفتح جدول الطلاب لـ anon مباشرة
        const { data, error } = await sb.rpc('guardian_lookup_student', {
          p_national_id: national,
          p_code: code
        });
        if (error) throw error;
        if (!data || !data.id) {
          if (guardianError) { guardianError.textContent = 'لا يوجد طالب مطابق. تحقق من الرقم القومي وكود الطالب.'; guardianError.hidden = false; }
          return;
        }
        sessionStorage.setItem('solouki_guardian_student', JSON.stringify(data));
        sessionStorage.setItem('solouki_guardian_creds', JSON.stringify({ national, code }));
        sessionStorage.setItem('solouki_access_mode', 'guardian');
        window.location.href = 'guardian.html';
      } catch (err) {
        if (guardianError) {
          guardianError.textContent = err.message || 'تعذر التحقق. حاول لاحقًا.';
          guardianError.hidden = false;
        }
      }
    };
  }
})();
