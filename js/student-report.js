/**
 * Solouki — STEP 46: ملف سلوك الطالب + تجهيز واتساب
 */
(function () {
  'use strict';

  const state = {
    profile: null,
    searchTimer: null,
    report: null
  };

  const $ = (id) => document.getElementById(id);
  const esc = (v) => (window.SoloukiUtils && SoloukiUtils.escapeHtml)
    ? SoloukiUtils.escapeHtml(String(v ?? ''))
    : String(v ?? '').replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function note(id, message) {
    const el = $(id);
    if (!el) return;
    if (window.SoloukiUtils && SoloukiUtils.showNote) {
      SoloukiUtils.showNote(id, message, id === 'error');
      return;
    }
    el.hidden = !message;
    el.textContent = message || '';
  }

  function sb() {
    return SoloukiDB.sb();
  }

  function sectionLabel(s) {
    if (s === 'languages') return 'لغات';
    if (s === 'arabic') return 'عربي';
    return s || '—';
  }

  function digits(v) {
    return String(v ?? '')
      .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
      .replace(/\D/g, '');
  }

  function toWaMe(phone) {
    let d = digits(phone);
    if (!d) return '';
    if (d.startsWith('20')) return d;
    if (d.startsWith('0')) return '20' + d.slice(1);
    if (d.length === 10) return '20' + d;
    return d;
  }

  async function searchStudents(q) {
    const box = $('studentResults');
    if (!q || q.length < 2) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    const { data, error } = await sb().rpc('search_students_for_violation', {
      p_query: q,
      p_limit: 20
    });
    if (error) {
      note('error', error.message);
      box.hidden = true;
      return;
    }
    if (!data || !data.length) {
      box.hidden = false;
      box.innerHTML = '<div class="search-item"><span>لا نتائج ضمن نطاق صلاحياتك</span></div>';
      return;
    }
    box.hidden = false;
    box.innerHTML = data.map((s) => `
      <button type="button" class="search-item" data-id="${s.id}">
        <strong>${esc(s.full_name)}</strong>
        <span>${esc(s.grade)} / ${esc(s.class_name)} · ${esc(s.national_id)}</span>
      </button>
    `).join('');
    box.querySelectorAll('button[data-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        box.hidden = true;
        $('studentSearch').value = '';
        loadReport(btn.dataset.id);
      });
    });
  }

  async function loadReport(studentId) {
    note('ok', '');
    note('error', '');
    const { data, error } = await sb().rpc('get_student_behavior_report', {
      p_student_id: studentId
    });
    if (error) {
      note('error', error.message);
      $('reportSection').hidden = true;
      return;
    }
    state.report = data;
    renderReport(data);
    $('reportSection').hidden = false;
    $('reportSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderReport(data) {
    const st = data.student || {};
    const stats = data.stats || {};
    const records = data.records || [];

    $('reportTitle').textContent = 'ملف سلوك: ' + (st.full_name || '');

    $('studentCard').innerHTML = `
      <strong>${esc(st.full_name)}</strong><br>
      المرحلة: ${esc(st.stage_name || '—')} ·
      الصف: ${esc(st.grade || '—')} ·
      الفصل: ${esc(st.class_name || '—')} ·
      القسم: ${esc(sectionLabel(st.section))}<br>
      الرقم القومي: ${esc(st.national_id || '—')} ·
      رقم الجلوس: ${esc(st.student_code || '—')} ·
      العام: ${esc(st.academic_year || '—')}
    `;

    $('statsGrid').innerHTML = `
      <div class="stat-card"><div class="n">${stats.total || 0}</div><div class="l">إجمالي المخالفات</div></div>
      <div class="stat-card d1"><div class="n">${stats.degree_1 || 0}</div><div class="l">درجة أولى</div></div>
      <div class="stat-card d2"><div class="n">${stats.degree_2 || 0}</div><div class="l">درجة ثانية</div></div>
      <div class="stat-card d3"><div class="n">${stats.degree_3 || 0}</div><div class="l">درجة ثالثة</div></div>
      <div class="stat-card d4"><div class="n">${stats.degree_4 || 0}</div><div class="l">درجة رابعة</div></div>
    `;

    const box = $('recordsTable');
    if (!records.length) {
      box.innerHTML = '<p class="empty-row">لا توجد مخالفات مسجّلة لهذا الطالب.</p>';
    } else {
      box.innerHTML = `
        <table class="data-table records-table">
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>الدرجة</th>
              <th>المخالفة</th>
              <th>المكان</th>
              <th>العقوبة</th>
              <th>سجّلها</th>
              <th>ملاحظات</th>
            </tr>
          </thead>
          <tbody>
            ${records.map((r) => `
              <tr>
                <td>${esc(r.violation_date || '—')}</td>
                <td class="degree-${r.degree_id || ''}">${esc(r.degree_id || '—')}</td>
                <td>${r.violation_code ? '<strong>' + esc(r.violation_code) + '</strong> — ' : ''}${esc(r.violation_label || '—')}</td>
                <td>${esc(r.location_label || '—')}</td>
                <td>${esc(r.penalty_label || '—')}</td>
                <td>${esc(r.recorder_name || '—')}</td>
                <td>${esc(r.notes || '—')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    // WhatsApp
    const father = st.father_phone || '';
    const mother = st.mother_phone || '';
    $('waPhones').innerHTML = `
      <span>الأب: ${father ? esc(father) : '— غير مسجّل'}</span>
      <span>الأم: ${mother ? esc(mother) : '— غير مسجّل'}</span>
    `;
    $('waFatherBtn').disabled = !toWaMe(father);
    $('waMotherBtn').disabled = !toWaMe(mother);
    $('waMessage').value = buildWaMessage(st, stats, records);
  }

  function buildWaMessage(st, stats, records) {
    const lines = [];
    lines.push('السلام عليكم ورحمة الله،');
    lines.push(`إشعار من إدارة المدرسة بخصوص سلوك الطالب/ة: ${st.full_name || ''}`);
    lines.push(`الصف: ${st.grade || ''} / الفصل: ${st.class_name || ''}`);
    lines.push('');
    if (!records.length) {
      lines.push('لا توجد مخالفات مسجّلة حالياً.');
    } else {
      lines.push(`إجمالي المخالفات: ${stats.total || records.length}`);
      if (stats.degree_1) lines.push(`- درجة أولى: ${stats.degree_1}`);
      if (stats.degree_2) lines.push(`- درجة ثانية: ${stats.degree_2}`);
      if (stats.degree_3) lines.push(`- درجة ثالثة: ${stats.degree_3}`);
      if (stats.degree_4) lines.push(`- درجة رابعة: ${stats.degree_4}`);
      lines.push('');
      lines.push('آخر المخالفات:');
      records.slice(0, 5).forEach((r, i) => {
        lines.push(`${i + 1}) ${r.violation_date || ''} — ${r.violation_label || ''}${r.degree_id ? ' (درجة ' + r.degree_id + ')' : ''}`);
      });
      if (records.length > 5) lines.push(`… و${records.length - 5} أخرى`);
    }
    lines.push('');
    lines.push('نرجو المتابعة والتعاون.');
    lines.push('مع تحيات إدارة المدرسة — نظام سلوكي');
    return lines.join('\n');
  }

  function openWa(phone) {
    const num = toWaMe(phone);
    if (!num) {
      note('error', 'لا يوجد رقم صالح');
      return;
    }
    const text = encodeURIComponent($('waMessage').value || '');
    window.open(`https://wa.me/${num}?text=${text}`, '_blank');
  }

  function clearReport() {
    state.report = null;
    $('reportSection').hidden = true;
    $('studentSearch').value = '';
    $('studentResults').hidden = true;
    note('ok', '');
    note('error', '');
  }

  async function boot() {
    const auth = await SoloukiSession.requireSession();
    if (!auth) return;
    state.profile = auth.profile;

    $('logout').addEventListener('click', () => SoloukiSession.logout('index.html'));
    $('studentSearch').addEventListener('input', () => {
      clearTimeout(state.searchTimer);
      const q = $('studentSearch').value.trim();
      state.searchTimer = setTimeout(() => searchStudents(q), 300);
    });
    $('printBtn').addEventListener('click', () => window.print());
    $('clearReportBtn').addEventListener('click', clearReport);
    $('waFatherBtn').addEventListener('click', () => {
      const st = state.report && state.report.student;
      if (st) openWa(st.father_phone);
    });
    $('waMotherBtn').addEventListener('click', () => {
      const st = state.report && state.report.student;
      if (st) openWa(st.mother_phone);
    });
    $('waCopyBtn').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText($('waMessage').value || '');
        note('ok', 'تم نسخ الرسالة');
      } catch (_) {
        note('error', 'تعذّر النسخ — انسخ يدوياً من المربع');
      }
    });

    // deep link: student-report.html?id=UUID
    const params = new URLSearchParams(location.search);
    const sid = params.get('id');
    if (sid) {
      loadReport(sid);
    }
  }

  boot();
})();
