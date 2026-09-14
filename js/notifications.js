(() => {
  const cfg = window.SOLOUKI_CONFIG || {};
  const hasSupabase = cfg.SUPABASE_ANON_KEY && !String(cfg.SUPABASE_ANON_KEY).includes('REPLACE_WITH');
  const sb = hasSupabase && window.supabase
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
    : null;

  const DEMO_VIOL_KEY = 'solouki_demo_violations_today';
  const DEMO_SENT_KEY = 'solouki_demo_notif_sent';
  const DEMO_STUDENTS_KEY = 'solouki_phase3_students_demo';

  let profile = null;
  let groups = []; // [{ studentKey, student, phones, violations, message, status }]

  const $ = id => document.getElementById(id);
  const msg = (id, text, show = true) => {
    $(id).textContent = text;
    $(id).hidden = !show;
  };

  function digits(v) {
    return String(v ?? '')
      .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
      .replace(/\D/g, '');
  }

  /** تطبيع لصيغة wa.me (بدون +) */
  function toWaMe(phone) {
    let d = digits(phone);
    if (!d) return '';
    if (d.startsWith('20')) return d;
    if (d.startsWith('0')) return '20' + d.slice(1);
    if (d.length === 10) return '20' + d;
    return d;
  }

  function todayISO() {
    const t = new Date();
    return t.toISOString().slice(0, 10);
  }

  function loadDemoStudents() {
    try {
      return JSON.parse(localStorage.getItem(DEMO_STUDENTS_KEY) || '[]');
    } catch {
      return [];
    }
  }

  function loadDemoViolations() {
    try {
      const all = JSON.parse(localStorage.getItem(DEMO_VIOL_KEY) || '[]');
      return all.filter(v => v.date === todayISO());
    } catch {
      return [];
    }
  }

  function loadSentMap() {
    try {
      return JSON.parse(localStorage.getItem(DEMO_SENT_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function saveSentMap(map) {
    localStorage.setItem(DEMO_SENT_KEY, JSON.stringify(map));
  }

  function seedDemoViolations() {
    let students = loadDemoStudents().filter(s => s.is_active !== false);
    if (!students.length) {
      students = [{
        national_id: '27301121400377',
        full_name: 'احمد الشافعى',
        class: '1/1',
        grade: 'الأول الابتدائى',
        father_phone: '201113677693',
        mother_phone: '201557907995'
      }];
    }
    const samples = [
      'التأخر عن الطابور الصباحي دون عذر مقبول',
      'عدم الالتزام بالزي المدرسي',
      'إحضار الهاتف المحمول إلى المدرسة'
    ];
    const today = todayISO();
    const viols = [];
    students.slice(0, 5).forEach((s, i) => {
      const n = (i % 3) + 1;
      for (let k = 0; k < n; k++) {
        viols.push({
          id: 'dv-' + s.national_id + '-' + k,
          student_national_id: s.national_id,
          student_name: s.full_name,
          class_name: s.class || s.class_name || '',
          grade: s.grade || '',
          father_phone: s.father_phone || '',
          mother_phone: s.mother_phone || '',
          description: samples[k % samples.length],
          date: today,
          time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
        });
      }
    });
    localStorage.setItem(DEMO_VIOL_KEY, JSON.stringify(viols));
    msg('ok', 'تم إضافة ' + viols.length + ' مخالفة تجريبية لليوم. يمكنك تجربة الإشعارات.');
    buildGroups(viols);
    render();
  }

  function buildMessage(studentName, items) {
    if (items.length === 1) {
      return (
        'ولي الأمر الكريم،\n' +
        'نود إشعاركم بأنه تم تسجيل ملاحظة سلوكية بحق الطالب/ة: ' + studentName + '.\n' +
        'الملاحظة: ' + items[0].description + '.\n' +
        'يمكنكم الدخول إلى برنامج سلوكي للاطلاع على التفاصيل.'
      );
    }
    const lines = items.map((v, i) => (i + 1) + ') ' + v.description).join('\n');
    return (
      'ولي الأمر الكريم،\n' +
      'نود إشعاركم بأنه تم تسجيل ' + items.length + ' ملاحظات سلوكية بحق الطالب/ة: ' + studentName + ' اليوم:\n' +
      lines + '\n' +
      'يمكنكم الدخول إلى برنامج سلوكي للاطلاع على التفاصيل.'
    );
  }

  function pickParentPhone(v) {
    // تفضيل رقم الأب ثم الأم
    const f = toWaMe(v.father_phone);
    const m = toWaMe(v.mother_phone);
    if (f) return { phone: f, label: 'الأب' };
    if (m) return { phone: m, label: 'الأم' };
    return { phone: '', label: '' };
  }

  function buildGroups(violations) {
    const sent = loadSentMap();
    const map = new Map();
    violations.forEach(v => {
      const key = digits(v.student_national_id) || v.student_name;
      if (!map.has(key)) {
        map.set(key, {
          studentKey: key,
          studentName: v.student_name,
          className: v.class_name || '',
          grade: v.grade || '',
          violations: [],
          father_phone: v.father_phone,
          mother_phone: v.mother_phone
        });
      }
      map.get(key).violations.push(v);
    });

    groups = [...map.values()].map(g => {
      const parent = pickParentPhone(g);
      const message = buildMessage(g.studentName, g.violations);
      const status = sent[g.studentKey] ? 'opened' : 'pending';
      return {
        ...g,
        parentPhone: parent.phone,
        parentLabel: parent.label,
        message,
        status
      };
    });
  }

  function waLink(phone, text) {
    return 'https://wa.me/' + phone + '?text=' + encodeURIComponent(text);
  }

  function markOpened(studentKey) {
    const sent = loadSentMap();
    sent[studentKey] = {
      at: new Date().toISOString(),
      by: profile?.full_name || 'أخصائي'
    };
    saveSentMap(sent);
    const g = groups.find(x => x.studentKey === studentKey);
    if (g) g.status = 'opened';
    render();
  }

  // نافذة واحدة فقط: تُفتح مرة، ثم يُغيَّر رابطها (location) لكل ولي أمر
  const WA_WINDOW_NAME = 'solouki_whatsapp';
  let waWindow = null; // مرجع النافذة المفتوحة
  let batchQueue = [];
  let batchIndex = 0;
  let preferCopyOnly = false; // وضع «نسخ فقط» بدون فتح نوافذ

  function navigateWaWindow(url) {
    // 1) إن كانت النافذة مفتوحة → انتقل داخلها بدون فتح جديدة
    if (waWindow && !waWindow.closed) {
      try {
        waWindow.location.href = url;
        waWindow.focus();
        return waWindow;
      } catch (_) {
        // بعض المتصفحات تمنع الوصول بعد الانتقال لدومين آخر — نعيد الفتح بنفس الاسم
      }
    }
    // 2) محاولة بنفس الاسم الثابت (يعيد استخدام التبويب إن بقي)
    const w = window.open(url, WA_WINDOW_NAME);
    if (w) {
      waWindow = w;
      try { w.focus(); } catch (_) {}
    }
    return w;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  function openOne(g, opts = {}) {
    if (!g.parentPhone) {
      msg('error', 'لا يوجد رقم ولي أمر صالح للطالب: ' + g.studentName);
      return false;
    }
    const url = waLink(g.parentPhone, g.message);

    // وضع النسخ فقط: لا نوافذ — الرسالة في الحافظة + عرض الرقم
    if (preferCopyOnly || opts.copyOnly) {
      copyText(g.message).then(ok => {
        markOpened(g.studentKey);
        msg('ok',
          (ok ? 'تم نسخ الرسالة. ' : '') +
          'افتح واتساب يدويًا (نفس النافذة المفتوحة عندك) وتواصل مع: ' +
          g.parentLabel + ' ' + g.parentPhone + ' — ثم الصق الرسالة.'
        );
      });
      return true;
    }

    const w = navigateWaWindow(url);
    if (!w) {
      msg('error', 'المتصفح منع النافذة. اسمح بالنوافذ المنبثقة مرة واحدة، أو فعّل وضع «نسخ فقط بدون نوافذ».');
      return false;
    }
    markOpened(g.studentKey);
    if (!opts.silent) {
      msg('ok', 'نفس نافذة واتساب → ' + g.studentName + ' (' + g.parentLabel + '). بعد الإرسال اضغط «التالي» إن كنت في الوضع المجمّع.');
    }
    return true;
  }

  function updateBatchBar() {
    const bar = $('batchBar');
    if (!bar) return;
    if (!batchQueue.length) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    const total = batchQueue.length;
    const cur = Math.min(batchIndex + 1, total);
    const g = batchQueue[batchIndex];
    $('batchProgress').textContent = g
      ? `مجمّع: ${cur} من ${total} — الحالي: ${g.studentName}`
      : `اكتمل الإرسال المجمّع (${total})`;
    $('batchNextBtn').disabled = batchIndex >= total - 1 && !g;
    if (batchIndex >= total) {
      $('batchNextBtn').disabled = true;
      $('batchProgress').textContent = `✅ تم المرور على ${total} محادثة. يمكنك إغلاق شريط التجميع.`;
    }
  }

  function startBatchQueue() {
    batchQueue = groups.filter(g => g.status !== 'opened' && g.parentPhone);
    if (!batchQueue.length) {
      // إن عُلّمت الكل كمفتوحة، أعد القائمة من كل من لديهم رقم
      batchQueue = groups.filter(g => g.parentPhone);
    }
    if (!batchQueue.length) {
      msg('error', 'لا توجد إشعارات بأرقام صالحة.');
      return;
    }
    batchIndex = 0;
    const first = batchQueue[0];
    openOne(first, { silent: true });
    updateBatchBar();
    msg('ok', 'فُتحت/حُدّثت نافذة واتساب واحدة. بعد كل إرسال اضغط «التالي» لتغيير المحادثة داخل نفس النافذة.');
  }

  function batchNext() {
    if (!batchQueue.length) return startBatchQueue();
    batchIndex += 1;
    if (batchIndex >= batchQueue.length) {
      updateBatchBar();
      msg('ok', 'انتهت قائمة الإرسال المجمّع.');
      return;
    }
    const g = batchQueue[batchIndex];
    openOne(g, { silent: true });
    updateBatchBar();
    msg('ok', `المحادثة ${batchIndex + 1}/${batchQueue.length}: ${g.studentName}`);
  }

  function openAllSequential() {
    startBatchQueue();
  }

  function render() {
    const pending = groups.filter(g => g.status !== 'opened').length;
    const opened = groups.filter(g => g.status === 'opened').length;
    const violCount = groups.reduce((n, g) => n + g.violations.length, 0);
    $('pendingCount').textContent = pending;
    $('openedCount').textContent = opened;
    $('violCount').textContent = violCount;
    $('openAllBtn').disabled = pending === 0;

    if (!groups.length) {
      $('list').innerHTML = '<div class="empty-state">لا توجد مخالفات اليوم لإرسال إشعارات.</div>';
      $('demoBar').hidden = false;
      return;
    }
    $('demoBar').hidden = true;

    $('list').innerHTML = groups.map(g => {
      const phonesNote = g.parentPhone
        ? `<span dir="ltr">${g.parentPhone}</span> (${g.parentLabel})`
        : '<span style="color:#b91c1c">لا يوجد رقم ولي أمر</span>';
      return `
        <article class="notif-item ${g.status === 'opened' ? 'sent' : ''}" data-key="${g.studentKey}">
          <h3>${escapeHtml(g.studentName)}
            <span class="badge-count">${g.violations.length} ملاحظة</span>
          </h3>
          <div class="notif-meta">
            ${escapeHtml(g.grade || '')} ${escapeHtml(g.className || '')}
            — ولي الأمر: ${phonesNote}
            ${g.status === 'opened' ? ' — ✅ تم فتح واتساب' : ''}
          </div>
          <div class="notif-msg">${escapeHtml(g.message)}</div>
          <div class="notif-actions">
            <button type="button" class="btn btn-primary btn-open" ${g.parentPhone ? '' : 'disabled'}>
              📲 فتح واتساب
            </button>
            <button type="button" class="btn btn-outline btn-copy">نسخ الرسالة</button>
            ${g.status === 'opened'
              ? '<button type="button" class="btn btn-outline btn-reset">إعادة للانتظار</button>'
              : ''}
          </div>
        </article>`;
    }).join('');

    $('list').querySelectorAll('.notif-item').forEach(el => {
      const key = el.getAttribute('data-key');
      const g = groups.find(x => x.studentKey === key);
      el.querySelector('.btn-open')?.addEventListener('click', () => openOne(g));
      el.querySelector('.btn-copy')?.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(g.message);
          msg('ok', 'تم نسخ الرسالة.');
        } catch {
          msg('error', 'تعذر النسخ — انسخ يدويًا من المربع.');
        }
      });
      el.querySelector('.btn-reset')?.addEventListener('click', () => {
        const sent = loadSentMap();
        delete sent[key];
        saveSentMap(sent);
        g.status = 'pending';
        render();
      });
    });
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function loadProfile() {
    // جلسة تجريبية / Supabase
    const sessionName = sessionStorage.getItem('solouki_user_name') || localStorage.getItem('solouki_user_name');
    const sessionWa = sessionStorage.getItem('solouki_personal_wa') || localStorage.getItem('solouki_personal_wa');

    if (sb) {
      try {
        const { data: { session } } = await sb.auth.getSession();
        if (session?.user) {
          const { data } = await sb.from('profiles')
            .select('id,full_name,role_type,personal_whatsapp,phone')
            .eq('id', session.user.id)
            .maybeSingle();
          if (data) {
            profile = data;
            const wa = data.personal_whatsapp || data.phone || '';
            $('senderWa').textContent = wa || 'غير مسجّل — سجّله من إدارة الأدوار';
            return;
          }
        }
      } catch (_) { /* demo fallback */ }
    }

    profile = {
      full_name: sessionName || 'أخصائي تجريبي',
      personal_whatsapp: sessionWa || ''
    };
    $('senderWa').textContent = profile.personal_whatsapp || 'غير مسجّل (وضع تجريبي) — سجّله من إدارة الأدوار';
  }

  async function loadViolations() {
    // لاحقًا: من جدول violation_records لتاريخ اليوم
    // حاليًا: تجريبي محلي حتى اكتمال مرحلة تسجيل المخالفات
    let viols = loadDemoViolations();
    if (sb) {
      try {
        const today = todayISO();
        const { data, error } = await sb.from('violation_records')
          .select('id,student_id,custom_violation_ar,violation_date,students(national_id,full_name,class_name,grade,father_phone,mother_phone),violations_catalog(description_ar)')
          .eq('violation_date', today);
        if (!error && data && data.length) {
          viols = data.map(r => ({
            id: r.id,
            student_national_id: r.students?.national_id,
            student_name: r.students?.full_name,
            class_name: r.students?.class_name,
            grade: r.students?.grade,
            father_phone: r.students?.father_phone,
            mother_phone: r.students?.mother_phone,
            description: r.violations_catalog?.description_ar || r.custom_violation_ar || 'ملاحظة سلوكية',
            date: r.violation_date
          }));
        }
      } catch (_) { /* استخدم التجريبي */ }
    }
    buildGroups(viols);
    render();
    if (!viols.length) $('demoBar').hidden = false;
  }

  $('seedDemo').onclick = seedDemoViolations;
  $('refreshBtn').onclick = () => loadViolations();
  $('openAllBtn').onclick = openAllSequential;
  if ($('batchNextBtn')) $('batchNextBtn').onclick = batchNext;
  if ($('batchCloseBtn')) $('batchCloseBtn').onclick = () => {
    batchQueue = [];
    batchIndex = 0;
    if ($('batchBar')) $('batchBar').hidden = true;
  };
  if ($('copyOnlyMode')) {
    preferCopyOnly = $('copyOnlyMode').checked;
    $('copyOnlyMode').onchange = () => { preferCopyOnly = $('copyOnlyMode').checked; };
  }
  // زر تجهيز النافذة مرة واحدة (يقلل رفض المتصفح للنوافذ)
  if ($('prepareWaWin')) {
    $('prepareWaWin').onclick = () => {
      const w = window.open('https://web.whatsapp.com', WA_WINDOW_NAME);
      if (w) {
        waWindow = w;
        msg('ok', 'تم تجهيز نافذة واتساب ويب. من الآن «فتح واتساب» و«التالي» سيستخدمان هذه النافذة فقط.');
      } else {
        msg('error', 'اسمح بالنوافذ المنبثقة ثم أعد المحاولة.');
      }
    };
  }
  $('logout').onclick = async () => {
    if (sb) try { await sb.auth.signOut(); } catch (_) {}
    sessionStorage.clear();
    location.href = 'index.html';
  };

  loadProfile().then(loadViolations);
})();
