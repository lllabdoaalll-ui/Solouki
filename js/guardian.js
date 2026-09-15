/**
 * Solouki — STEP 48: بوابة ولي الأمر (قراءة فقط)
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function sectionLabel(s) {
    if (s === 'languages') return 'لغات';
    if (s === 'arabic') return 'عربي';
    return s || '—';
  }

  function getClient() {
    const cfg = window.SOLOUKI_CONFIG || {};
    if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
      throw new Error('إعدادات الاتصال غير مكتملة');
    }
    return window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  }

  function requireGuardianSession() {
    if (sessionStorage.getItem('solouki_access_mode') !== 'guardian') {
      location.href = 'index.html';
      return null;
    }
    let student = null;
    let creds = null;
    try {
      student = JSON.parse(sessionStorage.getItem('solouki_guardian_student') || 'null');
      creds = JSON.parse(sessionStorage.getItem('solouki_guardian_creds') || 'null');
    } catch (_) {}
    if (!student || !student.id) {
      location.href = 'index.html';
      return null;
    }
    return { student, creds };
  }

  function showError(msg) {
    const el = $('error');
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg || '';
  }

  function renderStudent(st) {
    $('studentName').textContent = st.full_name || '—';
    $('studentMeta').textContent = [
      st.stage_name || '',
      st.grade ? 'الصف: ' + st.grade : '',
      st.class_name ? 'الفصل: ' + st.class_name : '',
      'القسم: ' + sectionLabel(st.section),
      st.student_code ? 'الكود: ' + st.student_code : ''
    ].filter(Boolean).join(' · ');
  }

  function renderStats(stats) {
    stats = stats || {};
    $('stTotal').textContent = stats.total || 0;
    $('st1').textContent = stats.degree_1 || 0;
    $('st2').textContent = stats.degree_2 || 0;
    $('st3').textContent = stats.degree_3 || 0;
    $('st4').textContent = stats.degree_4 || 0;
  }

  function renderRecords(records) {
    const box = $('recordsBox');
    if (!records || !records.length) {
      box.innerHTML = '<p class="g-empty">لا توجد ملاحظات سلوكية مسجّلة حتى الآن.</p>';
      return;
    }
    box.innerHTML = `
      <table class="g-table">
        <thead>
          <tr>
            <th>التاريخ</th>
            <th>الدرجة</th>
            <th>المخالفة</th>
            <th>المكان</th>
            <th>الإجراء / العقوبة</th>
          </tr>
        </thead>
        <tbody>
          ${records.map((r) => `
            <tr>
              <td>${esc(r.violation_date || '—')}</td>
              <td class="deg">${esc(r.degree_id || '—')}</td>
              <td>${r.violation_code ? '<strong>' + esc(r.violation_code) + '</strong> — ' : ''}${esc(r.violation_label || '—')}</td>
              <td>${esc(r.location_label || '—')}</td>
              <td>${esc(r.penalty_label || '—')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }


  function renderPoints(pts) {
    const card = $('pointsCard');
    const box = $('gPoints');
    if (!card || !box) return;
    pts = pts || {};
    const net = pts.net ?? 0;
    card.hidden = false;
    box.innerHTML = `
      <div class="g-point"><span>تكريمات</span><b class="pos">+${pts.positive || 0}</b></div>
      <div class="g-point"><span>خصم مخالفات</span><b class="neg">−${pts.negative || 0}</b></div>
      <div class="g-point"><span>الرصيد</span><b class="${net >= 0 ? 'pos' : 'neg'}">${net > 0 ? '+' : ''}${net}</b></div>
    `;
  }

  function renderMerits(merits) {
    const card = $('meritsCard');
    const box = $('meritsBox');
    if (!card || !box) return;
    merits = Array.isArray(merits) ? merits : [];
    if (!merits.length) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    box.innerHTML = `
      <table class="g-table">
        <thead><tr><th>التاريخ</th><th>التكريم</th><th>النقاط</th></tr></thead>
        <tbody>
          ${merits.map((m) => `
            <tr>
              <td>${esc(m.merit_date || '—')}</td>
              <td>${esc(m.title || '')}${m.description ? '<br><small>' + esc(m.description) + '</small>' : ''}</td>
              <td class="pos">+${esc(m.points)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  async function loadReport(sb, creds, fallbackStudent) {
    showError('');
    $('recordsBox').innerHTML = '<p class="g-empty">جاري التحميل…</p>';

    if (creds && creds.national && creds.code) {
      const { data, error } = await sb.rpc('guardian_get_behavior_report', {
        p_national_id: creds.national,
        p_code: creds.code
      });
      if (error) throw error;
      renderStudent(data.student || fallbackStudent);
      renderStats(data.stats);
      renderRecords(data.records);
      renderPoints(data.points);
      renderMerits(data.merits);
      if (data.student) {
        sessionStorage.setItem('solouki_guardian_student', JSON.stringify(data.student));
      }
      return;
    }

    // توافق قديم: عرض البيانات الأساسية فقط إن لم تُحفظ بيانات الدخول
    renderStudent(fallbackStudent);
    renderStats({});
    $('recordsBox').innerHTML =
      '<p class="g-empty">أعد تسجيل الدخول من الصفحة الرئيسية لعرض السجل الكامل.</p>';
  }

  async function boot() {
    const session = requireGuardianSession();
    if (!session) return;

    const { student, creds } = session;
    renderStudent(student);

    $('gLogout').addEventListener('click', () => {
      sessionStorage.removeItem('solouki_guardian_student');
      sessionStorage.removeItem('solouki_guardian_creds');
      sessionStorage.removeItem('solouki_access_mode');
      location.href = 'index.html';
    });

    let sb;
    try {
      sb = getClient();
    } catch (e) {
      showError(e.message);
      return;
    }

    const run = async () => {
      try {
        await loadReport(sb, creds, student);
      } catch (e) {
        showError(e.message || 'تعذّر تحميل السجل');
        $('recordsBox').innerHTML = '<p class="g-empty">تعذّر التحميل</p>';
      }
    };

    $('refreshBtn').addEventListener('click', run);
    await run();
  }

  boot();
})();
