/**
 * Solouki — STEP 44 + 45: تسجيل مخالفة (فردي + جماعي)
 */
(function () {
  'use strict';

  const BULK_MAX = 50;

  const state = {
    profile: null,
    canRecord: false,
    canDelete: false,
    catalog: [],
    locations: [],
    penalties: [],
    matrix: [],
    selectedStudent: null,
    searchTimer: null,
    // bulk
    classOptions: [],   // from list_bulk_class_options
    currentClassStudents: [],
    basket: new Map()   // id -> { id, full_name, grade, class_name, section }
  };

  const $ = (id) => document.getElementById(id);
  const esc = (v) => (window.SoloukiUtils && SoloukiUtils.escapeHtml)
    ? SoloukiUtils.escapeHtml(String(v ?? ''))
    : String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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

  /* ---------- Lookups (shared) ---------- */
  async function loadLookups() {
    const client = sb();
    const [v, l, p, m] = await Promise.all([
      client.from('violations_catalog').select('id,code,degree_id,description_ar,is_active').eq('is_active', true).order('code'),
      client.from('violation_locations').select('id,name_ar,is_active,sort_order').eq('is_active', true).order('sort_order'),
      client.from('penalties').select('id,name_ar').order('id'),
      client.from('degree_penalty_matrix').select('degree_id,penalty_id')
    ]);
    if (v.error) throw v.error;
    if (l.error) throw l.error;
    if (p.error) throw p.error;
    if (m.error) throw m.error;
    state.catalog = v.data || [];
    state.locations = l.data || [];
    state.penalties = p.data || [];
    state.matrix = m.data || [];
  }

  function fillSelects() {
    // single
    const loc = $('locationSelect');
    loc.innerHTML = '<option value="">— اختر المكان —</option>' +
      state.locations.map((l) => `<option value="${l.id}">${esc(l.name_ar)}</option>`).join('') +
      '<option value="custom">غير ذلك (كتابة يدوية)</option>';

    // bulk location (optional)
    const bloc = $('bulkLocationSelect');
    if (bloc) {
      bloc.innerHTML = '<option value="">— بدون تحديد —</option>' +
        state.locations.map((l) => `<option value="${l.id}">${esc(l.name_ar)}</option>`).join('') +
        '<option value="custom">غير ذلك (كتابة يدوية)</option>';
    }

    fillViolationSelect($('violationSelect'));
    fillViolationSelect($('bulkViolationSelect'));
    updatePenalties(null, 'penaltySelect');
    updatePenalties(null, 'bulkPenaltySelect');
  }

  function fillViolationSelect(sel) {
    if (!sel) return;
    const grouped = { 1: [], 2: [], 3: [] };
    state.catalog.forEach((c) => {
      if (grouped[c.degree_id]) grouped[c.degree_id].push(c);
    });
    const labels = {
      1: 'الدرجة الأولى (البسيطة)',
      2: 'الدرجة الثانية (متوسطة)',
      3: 'الدرجة الثالثة (الخطيرة)'
    };
    let html = '<option value="">— اختر المخالفة —</option>';
    [1, 2, 3].forEach((d) => {
      if (!grouped[d].length) return;
      html += `<optgroup label="${labels[d]}">`;
      grouped[d].forEach((c) => {
        html += `<option value="${c.id}" data-degree="${c.degree_id}">${esc(c.code)} — ${esc(c.description_ar)}</option>`;
      });
      html += '</optgroup>';
    });
    sel.innerHTML = html;
  }

  function updatePenalties(degreeId, selectId) {
    const sel = $(selectId || 'penaltySelect');
    if (!sel) return;
    const allowed = degreeId
      ? state.matrix.filter((m) => Number(m.degree_id) === Number(degreeId)).map((m) => Number(m.penalty_id))
      : [];
    const list = degreeId
      ? state.penalties.filter((p) => allowed.includes(Number(p.id)))
      : [];
    sel.innerHTML = '<option value="">— بدون تحديد الآن —</option>' +
      list.map((p) => `<option value="${p.id}">${esc(p.name_ar)}</option>`).join('');
  }

  function onViolationChange() {
    const opt = $('violationSelect').selectedOptions[0];
    const degree = opt && opt.dataset.degree ? Number(opt.dataset.degree) : null;
    $('degreeHint').textContent = degree
      ? 'الدرجة المحددة تلقائيًا: ' + degree
      : 'الدرجة تُحدَّد تلقائيًا من الكتالوج';
    updatePenalties(degree, 'penaltySelect');
  }

  function onBulkViolationChange() {
    const opt = $('bulkViolationSelect').selectedOptions[0];
    const degree = opt && opt.dataset.degree ? Number(opt.dataset.degree) : null;
    $('bulkDegreeHint').textContent = degree
      ? 'الدرجة المحددة تلقائيًا: ' + degree
      : 'الدرجة تُحدَّد تلقائيًا من الكتالوج';
    updatePenalties(degree, 'bulkPenaltySelect');
  }

  function onLocationChange() {
    const custom = $('locationSelect').value === 'custom';
    $('customLocation').hidden = !custom;
    if (!custom) $('customLocation').value = '';
  }

  function onBulkLocationChange() {
    const custom = $('bulkLocationSelect').value === 'custom';
    $('bulkCustomLocation').hidden = !custom;
    if (!custom) $('bulkCustomLocation').value = '';
  }

  /* ---------- Single mode (unchanged core) ---------- */
  function renderSelectedStudent() {
    const box = $('selectedStudent');
    const s = state.selectedStudent;
    if (!s) {
      box.hidden = true;
      box.innerHTML = '';
      $('studentId').value = '';
      return;
    }
    $('studentId').value = s.id;
    box.hidden = false;
    box.innerHTML = `${esc(s.full_name)} · ${esc(s.grade)} / ${esc(s.class_name)} · ${esc(s.section === 'languages' ? 'لغات' : 'عربي')} · قومي: ${esc(s.national_id)}`;
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
        const row = data.find((x) => x.id === btn.dataset.id);
        state.selectedStudent = row || null;
        renderSelectedStudent();
        box.hidden = true;
        $('studentSearch').value = row ? row.full_name : '';
      });
    });
  }

  async function saveRecord(ev) {
    ev.preventDefault();
    note('ok', '');
    note('error', '');

    if (!state.canRecord) {
      return note('error', 'ليست لديك صلاحية تسجيل المخالفات');
    }
    if (!state.selectedStudent) {
      return note('error', 'اختر طالبًا من نتائج البحث');
    }

    const locationVal = $('locationSelect').value;
    let locationId = null;
    let customLocation = null;
    if (locationVal === 'custom') {
      customLocation = $('customLocation').value.trim();
      if (!customLocation) return note('error', 'اكتب المكان المخصص');
    } else if (locationVal) {
      locationId = Number(locationVal);
    } else {
      return note('error', 'اختر مكان الواقعة');
    }

    const violationId = $('violationSelect').value ? Number($('violationSelect').value) : null;
    if (!violationId) return note('error', 'اختر المخالفة من الكتالوج');

    const penaltyVal = $('penaltySelect').value;
    const payload = {
      p_student_id: state.selectedStudent.id,
      p_violation_id: violationId,
      p_custom_violation_ar: null,
      p_degree_id: null,
      p_location_id: locationId,
      p_custom_location_ar: customLocation,
      p_violation_date: $('violationDate').value || null,
      p_applied_penalty_id: penaltyVal ? Number(penaltyVal) : null,
      p_notes: $('notes').value.trim() || null
    };

    $('saveBtn').disabled = true;
    try {
      const { data, error } = await sb().rpc('record_violation', payload);
      if (error) return note('error', error.message);
      const sid = state.selectedStudent && state.selectedStudent.id;
      note('ok', 'تم حفظ المخالفة بنجاح' + (sid ? ' — <a href="student-report.html?id=' + sid + '">عرض ملف السلوك</a>' : ''));
      // allow HTML in note
      const okEl = $('ok');
      if (okEl && sid) {
        okEl.hidden = false;
        okEl.innerHTML = 'تم حفظ المخالفة بنجاح — <a href="student-report.html?id=' + sid + '" style="color:inherit;font-weight:800;text-decoration:underline">عرض ملف السلوك وإشعار ولي الأمر</a>';
      }
      resetForm(false);
      await loadRecords();
    } finally {
      $('saveBtn').disabled = false;
    }
  }

  function resetForm(clearNote) {
    if (clearNote !== false) {
      note('ok', '');
      note('error', '');
    }
    $('violationRecordForm').reset();
    state.selectedStudent = null;
    renderSelectedStudent();
    $('studentResults').hidden = true;
    $('customLocation').hidden = true;
    setDefaultDate();
    updatePenalties(null, 'penaltySelect');
    $('degreeHint').textContent = 'الدرجة تُحدَّد تلقائيًا من الكتالوج';
  }

  function setDefaultDate() {
    const d = new Date();
    const iso = d.toISOString().slice(0, 10);
    $('violationDate').value = iso;
    if ($('bulkViolationDate')) $('bulkViolationDate').value = iso;
  }

  /* ---------- Bulk mode ---------- */
  async function loadClassOptions() {
    const { data, error } = await sb().rpc('list_bulk_class_options');
    if (error) {
      note('error', 'تعذّر تحميل الفصول: ' + error.message);
      state.classOptions = [];
      return;
    }
    state.classOptions = data || [];
    fillBulkStage();
  }

  function fillBulkStage() {
    const stages = new Map();
    state.classOptions.forEach((o) => {
      if (!stages.has(o.stage_id)) stages.set(o.stage_id, o.stage_name || o.stage_id);
    });
    const sel = $('bulkStage');
    sel.innerHTML = '<option value="">— المرحلة —</option>' +
      [...stages.entries()].map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join('');
    $('bulkGrade').innerHTML = '<option value="">— الصف —</option>';
    $('bulkGrade').disabled = true;
    $('bulkClass').innerHTML = '<option value="">— الفصل —</option>';
    $('bulkClass').disabled = true;
    clearBulkStudentList();
  }

  function onBulkStageChange() {
    const stageId = $('bulkStage').value;
    const grades = new Set();
    state.classOptions.filter((o) => o.stage_id === stageId).forEach((o) => grades.add(o.grade));
    const sel = $('bulkGrade');
    sel.innerHTML = '<option value="">— الصف —</option>' +
      [...grades].sort().map((g) => `<option value="${esc(g)}">${esc(g)}</option>`).join('');
    sel.disabled = !stageId;
    $('bulkClass').innerHTML = '<option value="">— الفصل —</option>';
    $('bulkClass').disabled = true;
    clearBulkStudentList();
  }

  function onBulkGradeChange() {
    const stageId = $('bulkStage').value;
    const grade = $('bulkGrade').value;
    const classes = state.classOptions.filter(
      (o) => o.stage_id === stageId && o.grade === grade
    );
    const sel = $('bulkClass');
    // value = class_name|section
    sel.innerHTML = '<option value="">— الفصل —</option>' +
      classes.map((o) => {
        const secLabel = o.section === 'languages' ? 'لغات' : (o.section === 'arabic' ? 'عربي' : o.section || '');
        const label = `${o.class_name}${secLabel ? ' · ' + secLabel : ''} (${o.student_count || 0})`;
        return `<option value="${esc(o.class_name)}|${esc(o.section || '')}">${esc(label)}</option>`;
      }).join('');
    sel.disabled = !grade;
    clearBulkStudentList();
  }

  async function onBulkClassChange() {
    const stageId = $('bulkStage').value;
    const grade = $('bulkGrade').value;
    const raw = $('bulkClass').value;
    if (!stageId || !grade || !raw) {
      clearBulkStudentList();
      return;
    }
    const [className, section] = raw.split('|');
    const { data, error } = await sb().rpc('list_students_for_bulk', {
      p_stage_id: stageId,
      p_grade: grade,
      p_class_name: className,
      p_section: section || null
    });
    if (error) {
      note('error', error.message);
      clearBulkStudentList();
      return;
    }
    state.currentClassStudents = data || [];
    renderBulkStudentList();
    setBulkListControls(true);
  }

  function clearBulkStudentList() {
    state.currentClassStudents = [];
    $('bulkStudentList').innerHTML = '<p class="empty-row">اختر المرحلة والصف والفصل أولاً</p>';
    setBulkListControls(false);
  }

  function setBulkListControls(enabled) {
    ['bulkListSearch', 'bulkSelectAll', 'bulkDeselectAll', 'bulkAddToBasket'].forEach((id) => {
      const el = $(id);
      if (el) el.disabled = !enabled;
    });
    if ($('bulkListSearch')) $('bulkListSearch').value = '';
  }

  function renderBulkStudentList(filterText) {
    const box = $('bulkStudentList');
    let rows = state.currentClassStudents;
    if (filterText) {
      const q = filterText.trim().toLowerCase();
      rows = rows.filter((s) =>
        (s.full_name || '').toLowerCase().includes(q) ||
        (s.national_id || '').includes(q) ||
        (s.student_code || '').toLowerCase().includes(q)
      );
    }
    if (!rows.length) {
      box.innerHTML = '<p class="empty-row">لا طلاب في هذا الفصل أو لا نتائج للبحث</p>';
      return;
    }
    box.innerHTML = rows.map((s) => {
      const inBasket = state.basket.has(s.id);
      return `
        <label class="bulk-student-row">
          <input type="checkbox" data-id="${s.id}" ${inBasket ? 'checked' : ''}>
          <span>${esc(s.full_name)}</span>
          <span class="meta">${esc(s.student_code || s.national_id || '')}</span>
        </label>`;
    }).join('');
  }

  function getCheckedStudentIds() {
    return [...$('bulkStudentList').querySelectorAll('input[type="checkbox"]:checked')]
      .map((cb) => cb.dataset.id);
  }

  function addCheckedToBasket() {
    const ids = getCheckedStudentIds();
    if (!ids.length) {
      note('error', 'حدّد طالباً واحداً على الأقل من القائمة');
      return;
    }
    let added = 0;
    ids.forEach((id) => {
      if (state.basket.has(id)) return;
      if (state.basket.size >= BULK_MAX) return;
      const s = state.currentClassStudents.find((x) => x.id === id);
      if (s) {
        state.basket.set(id, {
          id: s.id,
          full_name: s.full_name,
          grade: s.grade,
          class_name: s.class_name,
          section: s.section
        });
        added++;
      }
    });
    if (state.basket.size >= BULK_MAX && added === 0) {
      note('error', `الحد الأقصى ${BULK_MAX} طالباً في السلة`);
    } else {
      note('ok', `تمت إضافة ${added} طالباً إلى السلة (الإجمالي ${state.basket.size})`);
    }
    renderBasket();
    updateBulkSaveBtn();
  }

  function renderBasket() {
    const box = $('basketList');
    const badge = $('basketBadge');
    const countEl = $('basketCount');
    const clearBtn = $('clearBasket');
    const n = state.basket.size;
    countEl.textContent = n;
    badge.hidden = n === 0;
    clearBtn.hidden = n === 0;

    if (!n) {
      box.innerHTML = '<p class="empty-row">لا يوجد طلاب في السلة بعد</p>';
      return;
    }
    box.innerHTML = [...state.basket.values()].map((s) => `
      <div class="basket-item" data-id="${s.id}">
        <span>${esc(s.full_name)} <small style="font-weight:500;color:#5a736c">· ${esc(s.grade)} / ${esc(s.class_name)}</small></span>
        <button type="button" data-remove="${s.id}">إزالة</button>
      </div>
    `).join('');
    box.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.basket.delete(btn.dataset.remove);
        renderBasket();
        renderBulkStudentList($('bulkListSearch').value);
        updateBulkSaveBtn();
      });
    });
  }

  function updateBulkSaveBtn() {
    $('bulkSaveBtn').disabled = !(state.canRecord && state.basket.size > 0);
  }

  async function saveBulk() {
    note('ok', '');
    note('error', '');
    if (!state.canRecord) return note('error', 'ليست لديك صلاحية تسجيل المخالفات');
    if (!state.basket.size) return note('error', 'أضف طلاباً إلى السلة أولاً');
    if (state.basket.size > BULK_MAX) return note('error', `الحد الأقصى ${BULK_MAX} طالباً`);

    const violationId = $('bulkViolationSelect').value ? Number($('bulkViolationSelect').value) : null;
    if (!violationId) return note('error', 'اختر المخالفة من الكتالوج');

    const locationVal = $('bulkLocationSelect').value;
    let locationId = null;
    let customLocation = null;
    if (locationVal === 'custom') {
      customLocation = $('bulkCustomLocation').value.trim() || null;
    } else if (locationVal) {
      locationId = Number(locationVal);
    }

    const namesPreview = [...state.basket.values()].slice(0, 8).map((s) => s.full_name).join('، ');
    const more = state.basket.size > 8 ? ` و${state.basket.size - 8} آخرين` : '';
    if (!confirm(`سيتم تسجيل المخالفة لـ ${state.basket.size} طالباً:\n${namesPreview}${more}\n\nهل تريد المتابعة؟`)) {
      return;
    }

    const penaltyVal = $('bulkPenaltySelect').value;
    const payload = {
      p_student_ids: [...state.basket.keys()],
      p_violation_id: violationId,
      p_custom_violation_ar: null,
      p_degree_id: null,
      p_location_id: locationId,
      p_custom_location_ar: customLocation,
      p_violation_date: $('bulkViolationDate').value || null,
      p_applied_penalty_id: penaltyVal ? Number(penaltyVal) : null,
      p_notes: $('bulkNotes').value.trim() || null
    };

    $('bulkSaveBtn').disabled = true;
    try {
      const { data, error } = await sb().rpc('record_violation_bulk', payload);
      if (error) return note('error', error.message);
      const row = Array.isArray(data) ? data[0] : data;
      const msg = (row && row.message) || 'تم التسجيل الجماعي';
      note('ok', msg + ' — يمكنك فتح ملف سلوك أي طالب من قائمة السجل أو صفحة ملف السلوك');
      state.basket.clear();
      renderBasket();
      renderBulkStudentList($('bulkListSearch').value);
      updateBulkSaveBtn();
      await loadRecords();
    } finally {
      $('bulkSaveBtn').disabled = false;
      updateBulkSaveBtn();
    }
  }

  function resetBulk() {
    note('ok', '');
    note('error', '');
    state.basket.clear();
    renderBasket();
    fillBulkStage();
    $('bulkViolationSelect').value = '';
    $('bulkLocationSelect').value = '';
    $('bulkCustomLocation').hidden = true;
    $('bulkCustomLocation').value = '';
    $('bulkNotes').value = '';
    $('bulkPenaltySelect').innerHTML = '<option value="">— بدون تحديد الآن —</option>';
    $('bulkDegreeHint').textContent = 'الدرجة تُحدَّد تلقائيًا من الكتالوج';
    setDefaultDate();
    updateBulkSaveBtn();
  }

  /* ---------- Mode tabs ---------- */
  function switchMode(mode) {
    document.querySelectorAll('.mode-tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.mode === mode);
    });
    const single = mode === 'single';
    const record = $('recordPanel');
    const bulk = $('bulkPanel');
    // catalog.css: .panel { display:none } .panel.active { display:block }
    // must toggle .active (hidden attr alone is not enough)
    if (record) {
      record.classList.toggle('active', single);
      record.hidden = !single;
    }
    if (bulk) {
      bulk.classList.toggle('active', !single);
      bulk.hidden = single;
    }
    if (!single && state.classOptions.length === 0) {
      loadClassOptions();
    }
  }

  /* ---------- Records list ---------- */
  async function loadRecords() {
    const box = $('recordsList');
    const { data, error } = await sb().rpc('list_recent_violations', { p_limit: 40 });
    if (error) {
      box.innerHTML = `<p class="empty-row">${esc(error.message)}</p>`;
      return;
    }
    if (!data || !data.length) {
      box.innerHTML = '<p class="empty-row">لا توجد مخالفات مسجّلة ضمن نطاقك بعد.</p>';
      return;
    }
    const canDel = state.canDelete;
    box.innerHTML = `
      <table class="data-table records-table">
        <thead>
          <tr>
            <th>التاريخ</th>
            <th>الطالب</th>
            <th>الدرجة</th>
            <th>المخالفة</th>
            <th>المكان</th>
            <th>العقوبة</th>
            <th>سجّلها</th>
            ${canDel ? '<th></th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${data.map((r) => `
            <tr>
              <td>${esc(r.violation_date)}</td>
              <td>${esc(r.student_name)}<br><small>${esc(r.grade)} / ${esc(r.class_name)}</small></td>
              <td class="degree-${r.degree_id || ''}">${esc(r.degree_id || '—')}</td>
              <td>${r.violation_code ? '<strong>' + esc(r.violation_code) + '</strong> — ' : ''}${esc(r.violation_label)}</td>
              <td>${esc(r.location_label || '—')}</td>
              <td>${esc(r.penalty_label || '—')}</td>
              <td>${esc(r.recorder_name || '—')}</td>
              ${canDel ? `<td><button type="button" class="mini mini-danger" data-del="${r.id}">حذف</button></td>` : ''}
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    if (canDel) {
      box.querySelectorAll('[data-del]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm('حذف سجل المخالفة نهائيًا؟')) return;
          const { error: err } = await sb().rpc('admin_delete_violation_record', {
            p_record_id: btn.dataset.del
          });
          if (err) return note('error', err.message);
          note('ok', 'تم حذف السجل');
          loadRecords();
        });
      });
    }
  }

  /* ---------- Boot ---------- */
  async function boot() {
    const auth = await SoloukiSession.requireSession();
    if (!auth) return;
    state.profile = auth.profile;

    const role = auth.profile.role_type;
    state.canRecord = ['superadmin', 'stage_manager', 'counselor'].includes(role);
    state.canDelete = ['superadmin', 'stage_manager'].includes(role);

    if (window.SoloukiPerms && role !== 'superadmin') {
      try {
        const mode = await SoloukiPerms.get('record_violations');
        if (mode === 'none') state.canRecord = false;
      } catch (_) { /* ignore */ }
    }

    if (!state.canRecord) {
      note('error', 'حسابك لا يملك صلاحية تسجيل المخالفات. يمكنك الاطلاع على السجل فقط إن وُجد.');
    }

    $('logout').addEventListener('click', () => SoloukiSession.logout('index.html'));
    $('violationSelect').addEventListener('change', onViolationChange);
    $('locationSelect').addEventListener('change', onLocationChange);
    $('violationRecordForm').addEventListener('submit', saveRecord);
    $('resetForm').addEventListener('click', () => resetForm(true));
    $('refreshList').addEventListener('click', loadRecords);

    $('studentSearch').addEventListener('input', () => {
      clearTimeout(state.searchTimer);
      const q = $('studentSearch').value.trim();
      state.searchTimer = setTimeout(() => searchStudents(q), 300);
    });

    // mode tabs
    document.querySelectorAll('.mode-tab').forEach((tab) => {
      tab.addEventListener('click', () => switchMode(tab.dataset.mode));
    });

    // bulk events
    $('bulkStage').addEventListener('change', onBulkStageChange);
    $('bulkGrade').addEventListener('change', onBulkGradeChange);
    $('bulkClass').addEventListener('change', onBulkClassChange);
    $('bulkSelectAll').addEventListener('click', () => {
      $('bulkStudentList').querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = true; });
    });
    $('bulkDeselectAll').addEventListener('click', () => {
      $('bulkStudentList').querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = false; });
    });
    $('bulkAddToBasket').addEventListener('click', addCheckedToBasket);
    $('bulkListSearch').addEventListener('input', () => {
      renderBulkStudentList($('bulkListSearch').value);
    });
    $('clearBasket').addEventListener('click', () => {
      state.basket.clear();
      renderBasket();
      renderBulkStudentList($('bulkListSearch').value);
      updateBulkSaveBtn();
    });
    $('bulkViolationSelect').addEventListener('change', onBulkViolationChange);
    $('bulkLocationSelect').addEventListener('change', onBulkLocationChange);
    $('bulkSaveBtn').addEventListener('click', saveBulk);
    $('bulkResetBtn').addEventListener('click', resetBulk);

    setDefaultDate();
    try {
      await loadLookups();
      fillSelects();
      await loadRecords();
    } catch (e) {
      note('error', e.message || 'تعذّر تحميل البيانات');
    }
  }

  boot();
})();
