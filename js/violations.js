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
      const savedStudent = state.selectedStudent ? { ...state.selectedStudent } : null;
      const penLabel = penaltyLabelById(penaltyVal);
      const isWW = isWrittenWarningLabel(penLabel);
      const vOpt = $('violationSelect').selectedOptions[0];
      const locOpt = $('locationSelect').selectedOptions[0];
      const recordHint = {
        violation_date: $('violationDate').value || null,
        degree_id: vOpt && vOpt.dataset ? vOpt.dataset.degree : null,
        violation_code: vOpt ? (vOpt.dataset.code || '') : '',
        violation_label: vOpt ? vOpt.textContent : '',
        location_label: locOpt && locOpt.value === 'custom'
          ? ($('customLocation').value || '—')
          : (locOpt ? locOpt.textContent : '—'),
        penalty_label: penLabel || 'تنبيه كتابي',
        notes: $('notes').value.trim() || null
      };
      note('ok', 'تم حفظ المخالفة بنجاح');
      const okEl = $('ok');
      if (okEl && sid) {
        okEl.hidden = false;
        let html = 'تم حفظ المخالفة بنجاح — <a href="student-report.html?id=' + sid + '" style="color:inherit;font-weight:800;text-decoration:underline">عرض ملف السلوك</a>';
        if (isWW) {
          html += ' &nbsp;|&nbsp; <button type="button" class="mini" id="printWWNow" style="font-weight:800">🖨️ طباعة تنبيه كتابي للتوقيع</button>';
        }
        okEl.innerHTML = html;
        if (isWW) {
          const btn = $('printWWNow');
          if (btn) {
            btn.addEventListener('click', () => {
              printWrittenWarningForStudent(sid, recordHint, []);
            });
          }
          // عرض فوري اختياري
          if (confirm('العقوبة: تنبيه كتابي.\nهل تريد طباعة نموذج التنبيه الآن ليوقّع عليه الطالب؟')) {
            await printWrittenWarningForStudent(sid, recordHint, []);
          }
        }
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
    const pad = n => String(n).padStart(2, '0');
    const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
      const penLabel = penaltyLabelById(penaltyVal);
      const isWW = isWrittenWarningLabel(penLabel);
      const ids = [...state.basket.keys()];
      const vOpt = $('bulkViolationSelect').selectedOptions[0];
      const locOpt = $('bulkLocationSelect').selectedOptions[0];
      const recordHint = {
        violation_date: $('bulkViolationDate').value || null,
        degree_id: vOpt && vOpt.dataset ? vOpt.dataset.degree : null,
        violation_code: vOpt ? (vOpt.dataset.code || '') : '',
        violation_label: vOpt ? vOpt.textContent : '',
        location_label: locOpt && locOpt.value === 'custom'
          ? ($('bulkCustomLocation').value || '—')
          : (locOpt ? locOpt.textContent : '—'),
        penalty_label: penLabel || 'تنبيه كتابي',
        notes: $('bulkNotes').value.trim() || null
      };
      const okEl = $('ok');
      if (okEl) {
        okEl.hidden = false;
        let html = esc(msg);
        if (isWW && ids.length) {
          html += ' &nbsp;|&nbsp; <button type="button" class="mini" id="printWWBatch" style="font-weight:800">🖨️ طباعة تنبيه كتابي لكل المشاركين (' + ids.length + ')</button>';
        }
        okEl.innerHTML = html;
        if (isWW && ids.length) {
          const btn = $('printWWBatch');
          if (btn) {
            btn.addEventListener('click', () => printWrittenWarningBatch(ids, recordHint));
          }
          if (confirm('العقوبة: تنبيه كتابي لـ ' + ids.length + ' طالباً.\nهل تريد طباعة نماذج التنبيه الآن ليوقّع عليها الطلاب؟')) {
            await printWrittenWarningBatch(ids, recordHint);
          }
        }
      }
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

  /* ---------- تنبيه كتابي: طباعة ورقية للتوقيع ---------- */
  function isWrittenWarningLabel(label) {
    return /تنبيه\s*كتابي/i.test(String(label || ''));
  }

  function penaltyLabelById(id) {
    if (!id) return '';
    const p = state.penalties.find((x) => Number(x.id) === Number(id));
    return p ? (p.name_ar || '') : '';
  }

  function sectionLabel(sec) {
    if (sec === 'languages') return 'لغات';
    if (sec === 'arabic') return 'عربي';
    return sec || '—';
  }

  function buildWrittenWarningSheet(opts) {
    const st = opts.student || {};
    const rec = opts.record || {};
    const peers = opts.peers || []; // طلاب آخرون في نفس الواقعة (جماعي)
    const s = opts.settings || {};
    const today = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
    const year = st.academic_year || s.academic_year || '—';
    const body = s.intro_text ||
      'يُنذَر الطالب/ة كتابياً بما ثبت بحقه/ها من مخالفات سلوكية، ويُطلب الالتزام بلائحة الانضباط المدرسي الصادرة بالقرار الوزاري رقم (150) لسنة 2024، والتعاون مع إدارة المدرسة لتعديل السلوك.';

    const peersBlock = peers.length
      ? `<div style="margin:10px 0 6px;font-weight:700;font-size:13px">الطلاب المشاركون في الواقعة</div>
         <table class="solouki-table"><thead><tr><th style="width:8%">م</th><th>الاسم</th><th>الصف / الفصل</th><th>التوقيع</th></tr></thead>
         <tbody>${peers.map((p, i) => `<tr>
           <td style="text-align:center">${i + 1}</td>
           <td>${esc(p.full_name || p.student_name || '—')}</td>
           <td>${esc((p.grade || '') + (p.class_name ? ' / ' + p.class_name : ''))}</td>
           <td style="min-width:90px;height:28px"></td>
         </tr>`).join('')}</tbody></table>`
      : '';

    return `
      <div class="solouki-sheet" style="page-break-after:always">
      <div class="solouki-letterhead">
        <div class="org-block" style="width:100%;text-align:center">
          <div class="org-republic">جمهورية مصر العربية</div>
          <div class="org-ministry">وزارة التربية والتعليم والتعليم الفني</div>
          <div class="org-dir">${esc(s.directorate || 'مديرية التربية والتعليم')}${s.governorate ? ' — ' + esc(s.governorate) : ''}</div>
          <div class="org-dir">${esc(s.administration || 'الإدارة التعليمية')}</div>
          <div class="org-school">${esc(s.school_name || 'اسم المدرسة')}</div>
        </div>
      </div>
      <div class="solouki-brand-bar">
        <span>نظام <strong>سلوكي Solouki</strong></span>
        <span>القرار الوزاري <strong>150 لسنة 2024</strong></span>
      </div>
      <div class="solouki-doc-title">
        <h1>تنبيه كتابي</h1>
        <div class="meta">العام الدراسي: <b>${esc(year)}</b> &nbsp;|&nbsp; التاريخ: <b>${esc(today)}</b></div>
      </div>
      <div class="solouki-student-box">
        <div class="name">${esc(st.full_name || st.student_name || '—')}</div>
        <div class="row">
          <b>الصف:</b> ${esc(st.grade || '—')} ·
          <b>الفصل:</b> ${esc(st.class_name || '—')} ·
          <b>القسم:</b> ${esc(sectionLabel(st.section))} ·
          <b>الرقم القومي:</b> ${esc(st.national_id || '—')}
        </div>
      </div>
      <p class="solouki-prose">${esc(body)}</p>
      <table class="solouki-table">
        <thead>
          <tr>
            <th style="width:14%">التاريخ</th>
            <th style="width:10%">الدرجة</th>
            <th>المخالفة</th>
            <th style="width:16%">المكان</th>
            <th style="width:18%">العقوبة</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${esc(rec.violation_date || today)}</td>
            <td class="deg" style="text-align:center">${esc(rec.degree_id || '—')}</td>
            <td>${rec.violation_code ? '<strong>' + esc(rec.violation_code) + '</strong> — ' : ''}${esc(rec.violation_label || '—')}</td>
            <td>${esc(rec.location_label || '—')}</td>
            <td>${esc(rec.penalty_label || 'تنبيه كتابي')}</td>
          </tr>
        </tbody>
      </table>
      ${rec.notes ? `<p class="solouki-prose"><b>ملاحظات:</b> ${esc(rec.notes)}</p>` : ''}
      ${peersBlock}
      <div class="solouki-ack" style="border:1px solid #334155;padding:12px 14px;margin:14px 0;border-radius:6px;background:#f8fafc">
        <div style="font-weight:800;margin-bottom:8px">إقرار الطالب / الطالبة</div>
        <p style="margin:0 0 10px;line-height:1.7;font-size:13.5px">
          أقرّ أنا الموقع أدناه بأنني اطّلعت على مضمون هذا التنبيه الكتابي والمخالفة الموضّحة أعلاه،
          وأتعهّد بالالتزام بلائحة الانضباط المدرسي وعدم تكرار المخالفة.
        </p>
        <div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:12px">
          <div style="flex:1;min-width:180px">
            <div style="font-size:12px;color:#475569">اسم الطالب</div>
            <div style="border-bottom:1px solid #64748b;min-height:28px;margin-top:4px">${esc(st.full_name || st.student_name || '')}</div>
          </div>
          <div style="flex:1;min-width:140px">
            <div style="font-size:12px;color:#475569">التوقيع</div>
            <div style="border-bottom:1px solid #64748b;min-height:28px;margin-top:4px"></div>
          </div>
          <div style="flex:1;min-width:120px">
            <div style="font-size:12px;color:#475569">التاريخ</div>
            <div style="border-bottom:1px solid #64748b;min-height:28px;margin-top:4px"></div>
          </div>
        </div>
        <div style="margin-top:16px;font-weight:700;font-size:13px">ولي الأمر (للاطلاع والتوقيع إن لزم)</div>
        <div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:8px">
          <div style="flex:1;min-width:180px">
            <div style="font-size:12px;color:#475569">اسم ولي الأمر</div>
            <div style="border-bottom:1px solid #64748b;min-height:28px;margin-top:4px"></div>
          </div>
          <div style="flex:1;min-width:140px">
            <div style="font-size:12px;color:#475569">التوقيع</div>
            <div style="border-bottom:1px solid #64748b;min-height:28px;margin-top:4px"></div>
          </div>
          <div style="flex:1;min-width:120px">
            <div style="font-size:12px;color:#475569">التاريخ</div>
            <div style="border-bottom:1px solid #64748b;min-height:28px;margin-top:4px"></div>
          </div>
        </div>
      </div>
      <p class="solouki-notice">${esc(s.notice_text || 'لذا لزم الإحاطة والتنويه بالعلم، مع رجاء المتابعة والتعاون.')}</p>
      <p class="solouki-date-line">تحريراً في: <b>${esc(today)}</b></p>
      <div class="solouki-signs">
        <div class="sign">
          <div class="title">${esc(s.sign_counselor_title || 'الأخصائي الاجتماعي')}</div>
          <div class="line">الاسم / التوقيع</div>
        </div>
        <div class="sign">
          <div class="title">${esc(s.sign_stage_manager_title || 'مدير المرحلة')}</div>
          <div class="line">الاسم / التوقيع</div>
        </div>
        <div class="sign">
          <div class="title">${esc(s.sign_principal_title || 'مدير المدرسة')}</div>
          <div class="line">الاسم / التوقيع / الخاتم</div>
        </div>
      </div>
      <div class="solouki-footer">
        مُنشأ عبر <strong>سلوكي Solouki</strong> — يُعتمد بعد التوقيع والخاتم · يُسلَّم للطالب للتوقيع عليه
      </div>
      </div>`;
  }

  async function loadReportSettings() {
    try {
      const { data } = await sb().rpc('get_report_settings');
      return data || {};
    } catch (_) {
      return {};
    }
  }

  async function printWrittenWarningForStudent(studentId, recordHint, peers) {
    if (!$('printSheet')) {
      note('error', 'عنصر الطباعة غير متاح — حدّث الصفحة');
      return;
    }
    note('ok', 'جاري تجهيز التنبيه الكتابي للطباعة…');
    try {
      const settings = await loadReportSettings();
      let student = { id: studentId };
      let record = recordHint || {};

      // تحميل بيانات الطالب والتقرير إن أمكن
      try {
        const { data } = await sb().rpc('get_student_behavior_report', { p_student_id: studentId });
        if (data && data.student) {
          student = data.student;
          if (!record.violation_label && data.records && data.records.length) {
            // أحدث مخالفة أو المطابقة
            const match = record.id
              ? data.records.find((r) => r.id === record.id)
              : data.records[0];
            if (match) {
              record = {
                ...record,
                violation_date: match.violation_date || record.violation_date,
                degree_id: match.degree_id || record.degree_id,
                violation_code: match.violation_code || record.violation_code,
                violation_label: match.violation_label || record.violation_label,
                location_label: match.location_label || record.location_label,
                penalty_label: match.penalty_label || record.penalty_label || 'تنبيه كتابي',
                notes: match.notes || record.notes
              };
            }
          }
        }
      } catch (_) { /* نكمل بالبيانات المتوفرة */ }

      if (!student.full_name && record.student_name) {
        student.full_name = record.student_name;
        student.grade = record.grade;
        student.class_name = record.class_name;
        student.section = record.section;
        student.national_id = record.national_id;
      }

      const html = buildWrittenWarningSheet({
        student,
        record: { ...record, penalty_label: record.penalty_label || 'تنبيه كتابي' },
        peers: peers || [],
        settings
      });
      $('printSheet').innerHTML = html;
      setTimeout(() => window.print(), 200);
      note('ok', 'تم فتح نافذة الطباعة — سلّم النموذج للطالب للتوقيع');
    } catch (e) {
      note('error', e.message || 'تعذّرت الطباعة');
    }
  }

  async function printWrittenWarningBatch(studentIds, recordHint) {
    if (!studentIds || !studentIds.length) return;
    if (!$('printSheet')) return note('error', 'عنصر الطباعة غير متاح');
    note('ok', 'جاري تجهيز ' + studentIds.length + ' تنبيهاً كتابياً…');
    try {
      const settings = await loadReportSettings();
      const sheets = [];
      // قائمة المشاركين كاملة لعرضها في كل ورقة (اختياري)
      const peerList = [];
      for (const id of studentIds) {
        const fromBasket = state.basket.get(id);
        if (fromBasket) peerList.push(fromBasket);
      }
      for (const id of studentIds) {
        let student = state.basket.get(id) || { id };
        let record = { ...(recordHint || {}) };
        try {
          const { data } = await sb().rpc('get_student_behavior_report', { p_student_id: id });
          if (data && data.student) {
            student = data.student;
            if (data.records && data.records.length) {
              const m = data.records[0];
              record = {
                violation_date: m.violation_date || record.violation_date,
                degree_id: m.degree_id || record.degree_id,
                violation_code: m.violation_code || record.violation_code,
                violation_label: m.violation_label || record.violation_label,
                location_label: m.location_label || record.location_label,
                penalty_label: m.penalty_label || record.penalty_label || 'تنبيه كتابي',
                notes: m.notes || record.notes
              };
            }
          }
        } catch (_) {}
        const peers = peerList.filter((p) => p.id !== id);
        sheets.push(buildWrittenWarningSheet({ student, record, peers, settings }));
      }
      $('printSheet').innerHTML = sheets.join('');
      setTimeout(() => window.print(), 250);
      note('ok', 'تم تجهيز ' + sheets.length + ' نموذجاً للطباعة والتوقيع');
    } catch (e) {
      note('error', e.message || 'تعذّرت الطباعة الجماعية');
    }
  }

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
      <div class="records-cards" aria-label="سجل المخالفات">
        ${data.map((r) => {
          const ww = isWrittenWarningLabel(r.penalty_label);
          const code = r.violation_code ? esc(r.violation_code) + ' — ' : '';
          return `
          <article class="v-card">
            <header class="v-card-head">
              <time class="v-card-date" dir="ltr">${esc(r.violation_date)}</time>
              <span class="v-card-degree degree-${esc(r.degree_id || '')}">درجة ${esc(r.degree_id || '—')}</span>
            </header>
            <div class="v-card-student">
              <strong>${esc(r.student_name)}</strong>
              <span class="v-card-meta">${esc(r.grade || '')} · ${esc(r.class_name || '')}</span>
            </div>
            <p class="v-card-violation">${code}${esc(r.violation_label || '—')}</p>
            <dl class="v-card-facts">
              <div><dt>المكان</dt><dd>${esc(r.location_label || '—')}</dd></div>
              <div><dt>العقوبة</dt><dd>${esc(r.penalty_label || '—')}</dd></div>
              <div><dt>سجّلها</dt><dd>${esc(r.recorder_name || '—')}</dd></div>
            </dl>
            <footer class="v-card-actions">
              ${ww ? `<button type="button" class="mini" data-print-ww="${esc(r.student_id || '')}" data-rec-id="${esc(r.id || '')}" title="طباعة تنبيه كتابي">🖨️ تنبيه</button>` : ''}
              ${canDel ? `<button type="button" class="mini mini-danger" data-del="${esc(r.id)}">حذف</button>` : ''}
            </footer>
          </article>`;
        }).join('')}
      </div>
      <table class="data-table records-table records-table-desktop">
        <thead>
          <tr>
            <th>التاريخ</th>
            <th>الطالب</th>
            <th>الدرجة</th>
            <th>المخالفة</th>
            <th>المكان</th>
            <th>العقوبة</th>
            <th>سجّلها</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${data.map((r) => {
            const ww = isWrittenWarningLabel(r.penalty_label);
            return `
            <tr>
              <td>${esc(r.violation_date)}</td>
              <td>${esc(r.student_name)}<br><small>${esc(r.grade)} / ${esc(r.class_name)}</small></td>
              <td class="degree-${r.degree_id || ''}">${esc(r.degree_id || '—')}</td>
              <td>${r.violation_code ? '<strong>' + esc(r.violation_code) + '</strong> — ' : ''}${esc(r.violation_label)}</td>
              <td>${esc(r.location_label || '—')}</td>
              <td>${esc(r.penalty_label || '—')}</td>
              <td>${esc(r.recorder_name || '—')}</td>
              <td style="white-space:nowrap">
                ${ww ? `<button type="button" class="mini" data-print-ww="${esc(r.student_id || '')}" data-rec-id="${esc(r.id || '')}" title="طباعة تنبيه كتابي">🖨️ تنبيه</button>` : ''}
                ${canDel ? ` <button type="button" class="mini mini-danger" data-del="${esc(r.id)}">حذف</button>` : ''}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    `;
    box.querySelectorAll('[data-print-ww]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sid = btn.dataset.printWw;
        if (!sid) return note('error', 'معرف الطالب غير متاح');
        const row = data.find((x) => String(x.id) === String(btn.dataset.recId)) || {};
        printWrittenWarningForStudent(sid, {
          id: row.id,
          violation_date: row.violation_date,
          degree_id: row.degree_id,
          violation_code: row.violation_code,
          violation_label: row.violation_label,
          location_label: row.location_label,
          penalty_label: row.penalty_label || 'تنبيه كتابي',
          notes: row.notes,
          student_name: row.student_name,
          grade: row.grade,
          class_name: row.class_name,
          section: row.section,
          national_id: row.national_id
        }, []);
      });
    });
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
