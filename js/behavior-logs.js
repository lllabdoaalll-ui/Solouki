/**
 * Solouki — سجلات الرصد (قسم مستقل)
 * صلاحية: view_behavior_logs
 * فترات: يومي / أسبوعي / شهري / من–إلى
 * طباعة: A4 Landscape
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (m) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));

  const S = {
    period: 'daily',
    rows: [],
    stages: [],
    profile: null
  };

  function msg(t, kind) {
    const e = $('msg');
    if (!e) return;
    e.textContent = t;
    e.className = 'message ' + (kind || 'ok');
    e.hidden = false;
    setTimeout(() => { e.hidden = true; }, 6000);
  }

  function iso(d) {
    if (!(d instanceof Date) || isNaN(d)) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function parseIso(s) {
    if (!s) return null;
    const p = String(s).split('-').map(Number);
    if (p.length < 3) return null;
    return new Date(p[0], p[1] - 1, p[2]);
  }

  /** أسبوع عمل: السبت → الخميس (شائع في المدارس المصرية) */
  function weekRangeContaining(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = d.getDay(); // 0 أحد … 6 سبت
    // نرجع للسبت السابق أو نفس اليوم إن كان سبتاً
    const toSat = (day + 1) % 7; // مسافة الرجوع إلى السبت
    const start = new Date(d);
    start.setDate(d.getDate() - toSat);
    const end = new Date(start);
    end.setDate(start.getDate() + 5); // سبت…خميس
    return { from: start, to: end };
  }

  function monthRange(ym) {
    // ym = YYYY-MM
    const [y, m] = String(ym).split('-').map(Number);
    const from = new Date(y, m - 1, 1);
    const to = new Date(y, m, 0);
    return { from, to };
  }

  function currentRange() {
    if (S.period === 'daily') {
      const d = parseIso($('singleDate').value) || new Date();
      return { from: d, to: d, label: 'يومي — ' + iso(d) };
    }
    if (S.period === 'weekly') {
      const d = parseIso($('singleDate').value) || new Date();
      const w = weekRangeContaining(d);
      return { from: w.from, to: w.to, label: 'أسبوعي — من ' + iso(w.from) + ' إلى ' + iso(w.to) };
    }
    if (S.period === 'monthly') {
      const ym = $('monthInput').value || iso(new Date()).slice(0, 7);
      const r = monthRange(ym);
      return { from: r.from, to: r.to, label: 'شهري — ' + ym };
    }
    const from = parseIso($('fromDate').value);
    const to = parseIso($('toDate').value);
    if (!from || !to) return null;
    if (to < from) return null;
    const days = Math.round((to - from) / 86400000) + 1;
    if (days > 62) {
      msg('الحد الأقصى للفترة المخصصة 62 يوماً لتجنب طباعة مفرطة.', 'error');
      return null;
    }
    return { from, to, label: 'من ' + iso(from) + ' إلى ' + iso(to) };
  }

  function syncPeriodUI() {
    document.querySelectorAll('.period-tab').forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-period') === S.period);
    });
    const daily = S.period === 'daily' || S.period === 'weekly';
    const monthly = S.period === 'monthly';
    const range = S.period === 'range';
    $('wrapSingleDate').hidden = !daily;
    $('wrapMonth').hidden = !monthly;
    $('wrapFrom').hidden = !range;
    $('wrapTo').hidden = !range;

    const r = currentRange();
    $('rangeHint').textContent = r
      ? ('الفترة الحالية: ' + r.label)
      : 'حدد التواريخ بشكل صحيح.';
  }

  function stageName(id) {
    const s = S.stages.find((x) => String(x.id) === String(id));
    return (s && (s.name_ar || s.name)) || id || '—';
  }

  async function loadStages(sb, profile) {
    const { data, error } = await sb
      .from('stages')
      .select('id,name_ar,section,sort_order,is_active')
      .eq('school_id', profile.school_id)
      .eq('is_active', true)
      .order('sort_order');
    if (error) {
      console.warn(error);
      S.stages = [];
      return;
    }
    S.stages = data || [];
    const sel = $('stageSelect');
    sel.innerHTML = '<option value="">كل المراحل المسموح بها</option>' +
      S.stages.map((s) =>
        `<option value="${esc(s.id)}">${esc(s.name_ar || s.id)}</option>`
      ).join('');
  }

  async function fetchRows(sb, fromStr, toStr, stageId, type) {
    const rows = [];

    if (type === 'all' || type === 'violation') {
      let q = sb
        .from('violation_records')
        .select(`
          id, violation_date, degree_id, custom_violation_ar, notes, stage_id,
          student_id,
          students ( full_name, student_code, grade, class_name, section ),
          violations_catalog ( code, description_ar )
        `)
        .gte('violation_date', fromStr)
        .lte('violation_date', toStr)
        .order('violation_date', { ascending: true })
        .limit(2000);
      if (stageId) q = q.eq('stage_id', stageId);
      const { data, error } = await q;
      if (error) throw error;
      (data || []).forEach((r) => {
        const st = r.students || {};
        const cat = r.violations_catalog || {};
        rows.push({
          date: r.violation_date,
          kind: 'violation',
          kindLabel: 'مخالفة',
          student: st.full_name || '—',
          code: st.student_code || '',
          scope: [stageName(r.stage_id), st.grade, st.class_name].filter(Boolean).join(' / '),
          item: cat.description_ar || r.custom_violation_ar || (cat.code ? ('بند ' + cat.code) : '—'),
          score: r.degree_id != null ? ('درجة ' + r.degree_id) : '—',
          notes: r.notes || ''
        });
      });
    }

    if (type === 'all' || type === 'merit') {
      let q = sb
        .from('merit_records')
        .select(`
          id, merit_date, title, description, points, notes, stage_id, student_id,
          students ( full_name, student_code, grade, class_name, section )
        `)
        .gte('merit_date', fromStr)
        .lte('merit_date', toStr)
        .order('merit_date', { ascending: true })
        .limit(2000);
      if (stageId) q = q.eq('stage_id', stageId);
      const { data, error } = await q;
      if (error) {
        // جدول التكريمات قد لا يكون مفعّلاً في بعض التثبيتات
        if (!String(error.message || '').includes('does not exist')) throw error;
      } else {
        (data || []).forEach((r) => {
          const st = r.students || {};
          rows.push({
            date: r.merit_date,
            kind: 'merit',
            kindLabel: 'تكريم',
            student: st.full_name || '—',
            code: st.student_code || '',
            scope: [stageName(r.stage_id), st.grade, st.class_name].filter(Boolean).join(' / '),
            item: r.title || r.description || '—',
            score: r.points != null ? (r.points + ' نقطة') : '—',
            notes: r.notes || r.description || ''
          });
        });
      }
    }

    rows.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.kind.localeCompare(b.kind));
    return rows;
  }

  function renderPreview() {
    const body = $('previewBody');
    const n = S.rows.length;
    $('countBadge').textContent = n + ' سجل';
    $('printBtn').disabled = n === 0;
    if (!n) {
      body.innerHTML = '<tr><td colspan="7" class="empty">لا توجد سجلات في هذه الفترة ضمن نطاق صلاحيتك.</td></tr>';
      return;
    }
    body.innerHTML = S.rows.map((r) => `
      <tr>
        <td>${esc(r.date)}</td>
        <td class="${r.kind === 'merit' ? 'tag-m' : 'tag-v'}">${esc(r.kindLabel)}</td>
        <td>${esc(r.student)}${r.code ? '<br><span style="color:#64748b;font-size:12px">' + esc(r.code) + '</span>' : ''}</td>
        <td>${esc(r.scope)}</td>
        <td>${esc(r.item)}</td>
        <td>${esc(r.score)}</td>
        <td>${esc(r.notes)}</td>
      </tr>
    `).join('');
  }

  function buildPrintHtml(range) {
    const vCount = S.rows.filter((r) => r.kind === 'violation').length;
    const mCount = S.rows.filter((r) => r.kind === 'merit').length;
    const stageLabel = $('stageSelect').selectedOptions[0]
      ? $('stageSelect').selectedOptions[0].textContent
      : 'كل المراحل';
    const rows = S.rows.map((r) => `
      <tr>
        <td style="width:9%">${esc(r.date)}</td>
        <td style="width:7%">${esc(r.kindLabel)}</td>
        <td style="width:16%">${esc(r.student)}</td>
        <td style="width:16%">${esc(r.scope)}</td>
        <td style="width:22%">${esc(r.item)}</td>
        <td style="width:10%">${esc(r.score)}</td>
        <td style="width:20%">${esc(r.notes)}</td>
      </tr>
    `).join('');

    return `
      <div class="ph">
        <div>
          <h1>سجل الرصد السلوكي</h1>
          <div class="meta">${esc(range.label)} · المرحلة: ${esc(stageLabel)}</div>
        </div>
        <div class="meta" style="text-align:left">
          تاريخ الطباعة: ${esc(iso(new Date()))}<br>
          عدد السجلات: ${S.rows.length} (مخالفات ${vCount} / تكريمات ${mCount})
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>التاريخ</th>
            <th>النوع</th>
            <th>الطالب</th>
            <th>المرحلة / الصف / الفصل</th>
            <th>البند</th>
            <th>الدرجة / النقاط</th>
            <th>ملاحظات</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="7">لا بيانات</td></tr>'}</tbody>
      </table>
      <div class="sum">ملخص: ${vCount} مخالفة · ${mCount} تكريم · الإجمالي ${S.rows.length}</div>
      <div class="signs">
        <div>الأخصائي<br>………………</div>
        <div>مدير المرحلة<br>………………</div>
        <div>الاعتماد<br>………………</div>
      </div>
    `;
  }

  async function load() {
    const range = currentRange();
    if (!range) {
      msg('حدد الفترة بشكل صحيح.', 'error');
      return;
    }
    const sb = SoloukiDB.getClient();
    $('loadBtn').disabled = true;
    try {
      const fromStr = iso(range.from);
      const toStr = iso(range.to);
      const stageId = $('stageSelect').value || null;
      const type = $('typeSelect').value || 'all';
      S.rows = await fetchRows(sb, fromStr, toStr, stageId, type);
      renderPreview();
      $('rangeHint').textContent = range.label + ' — ' + S.rows.length + ' سجل';
      if (!S.rows.length) msg('لا توجد سجلات في هذه الفترة ضمن نطاق صلاحيتك.', 'ok');
      else msg('تم تحميل ' + S.rows.length + ' سجلاً.', 'ok');
    } catch (e) {
      console.error(e);
      msg(e.message || 'تعذر تحميل السجل.', 'error');
    } finally {
      $('loadBtn').disabled = false;
    }
  }

  function doPrint() {
    if (!S.rows.length) return;
    const range = currentRange();
    if (!range) return;
    const sheet = $('printSheet');
    sheet.innerHTML = buildPrintHtml(range);
    sheet.setAttribute('aria-hidden', 'false');
    setTimeout(() => window.print(), 150);
  }

  async function boot() {
    const result = await SoloukiSession.requireSession();
    if (!result) return;
    S.profile = result.profile;

    const mode = await SoloukiPerms.myPermission('view_behavior_logs');
    const isSuper = S.profile.role_type === 'superadmin';
    if (!isSuper && mode === 'none') {
      $('filtersPanel').hidden = true;
      $('previewPanel').hidden = true;
      $('permDenied').hidden = false;
      return;
    }

    const today = iso(new Date());
    $('singleDate').value = today;
    $('fromDate').value = today;
    $('toDate').value = today;
    $('monthInput').value = today.slice(0, 7);

    const sb = SoloukiDB.getClient();
    await loadStages(sb, S.profile);
    syncPeriodUI();

    document.querySelectorAll('.period-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        S.period = btn.getAttribute('data-period');
        syncPeriodUI();
      });
    });
    ['singleDate', 'monthInput', 'fromDate', 'toDate'].forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener('change', syncPeriodUI);
    });

    $('loadBtn').onclick = load;
    $('printBtn').onclick = doPrint;
    $('logout').onclick = async () => {
      await sb.auth.signOut();
      location.href = 'index.html';
    };
  }

  boot().catch((e) => {
    console.error(e);
    msg(e.message || 'تعذر فتح سجلات الرصد.', 'error');
  });
})();
