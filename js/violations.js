/**
 * Solouki — STEP 44: تسجيل المخالفة
 */
(function () {
  'use strict';

  const state = {
    profile: null,
    canRecord: false,
    canDelete: false,
    catalog: [],
    locations: [],
    penalties: [],
    matrix: [],
    selectedStudent: null,
    searchTimer: null
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
    const loc = $('locationSelect');
    loc.innerHTML = '<option value="">— اختر المكان —</option>' +
      state.locations.map((l) => `<option value="${l.id}">${esc(l.name_ar)}</option>`).join('') +
      '<option value="custom">غير ذلك (كتابة يدوية)</option>';

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
    $('violationSelect').innerHTML = html;
    updatePenalties(null);
  }

  function updatePenalties(degreeId) {
    const sel = $('penaltySelect');
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
    updatePenalties(degree);
  }

  function onLocationChange() {
    const custom = $('locationSelect').value === 'custom';
    $('customLocation').hidden = !custom;
    if (!custom) $('customLocation').value = '';
  }

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
      note('ok', 'تم حفظ المخالفة بنجاح');
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
    updatePenalties(null);
    $('degreeHint').textContent = 'الدرجة تُحدَّد تلقائيًا من الكتالوج';
  }

  function setDefaultDate() {
    const d = new Date();
    const iso = d.toISOString().slice(0, 10);
    $('violationDate').value = iso;
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
              <td class="degree-${r.degree_id}">${esc(r.degree_id)}</td>
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

  async function boot() {
    const auth = await SoloukiSession.requireSession();
    if (!auth) return;
    state.profile = auth.profile;

    const role = auth.profile.role_type;
    state.canRecord = ['superadmin', 'stage_manager', 'counselor'].includes(role);
    state.canDelete = ['superadmin', 'stage_manager'].includes(role);

    // صلاحية أدق إن توفرت
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
