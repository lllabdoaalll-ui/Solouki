/**
 * Solouki — كتالوج المخالفات والعقوبات (STEP 43)
 * قراءة فقط لمعظم الأدوار؛ إضافة/إيقاف مخالفات وأماكن مخصصة للمسؤول العام فقط.
 * الدرجات والعقوبات والمصفوفة ثابتة بنص اللائحة ولا تُدار من هنا.
 */
(function () {
  'use strict';

  const $ = SoloukiUtils.$;
  const esc = SoloukiUtils.esc;

  const SEVERITY_LABEL = {
    simple: 'بسيطة',
    medium: 'متوسطة الخطورة',
    serious: 'خطيرة',
    critical: 'شديدة الخطورة'
  };

  const TIER_LABEL = {
    verbal: 'تنبيه شفوي',
    written: 'تنبيه كتابي',
    task: 'مهام مدرسية إضافية',
    deduction: 'خصم درجات السلوك',
    referral: 'تحويل / استدعاء',
    suspension: 'فصل مؤقت',
    transfer: 'نقل / تحويل نهائي'
  };

  const state = {
    profile: null,
    isAdmin: false,
    degrees: [],
    violations: [],
    locations: [],
    penalties: [],
    matrix: []
  };

  function note(id, message) {
    SoloukiUtils.showNote(id, message, id === 'error');
  }

  // ------------------------------------------------------------
  // تحميل البيانات
  // ------------------------------------------------------------
  async function loadAll() {
    const sb = SoloukiDB.sb();
    const [degreesRes, violationsRes, locationsRes, penaltiesRes, matrixRes] = await Promise.all([
      sb.from('violation_degrees').select('*').order('id'),
      sb.from('violations_catalog').select('*').order('degree_id').order('code'),
      sb.from('violation_locations').select('*').order('sort_order'),
      sb.from('penalties').select('*').order('id'),
      sb.from('degree_penalty_matrix').select('*')
    ]);

    const firstError = [degreesRes, violationsRes, locationsRes, penaltiesRes, matrixRes]
      .find((r) => r.error);
    if (firstError) {
      note('error', firstError.error.message || 'تعذّر تحميل الكتالوج');
      return false;
    }

    state.degrees = degreesRes.data || [];
    state.violations = violationsRes.data || [];
    state.locations = locationsRes.data || [];
    state.penalties = penaltiesRes.data || [];
    state.matrix = matrixRes.data || [];
    return true;
  }

  // ------------------------------------------------------------
  // الإحصائيات
  // ------------------------------------------------------------
  function renderStats() {
    $('statDegrees').textContent = state.degrees.length;
    $('statViolations').textContent = state.violations.filter((v) => v.is_active).length;
    $('statPenalties').textContent = state.penalties.length;
    $('statLocations').textContent = state.locations.filter((l) => l.is_active).length;
  }

  // ------------------------------------------------------------
  // الدرجات
  // ------------------------------------------------------------
  function renderDegrees() {
    $('degreesGrid').innerHTML = state.degrees.map((d) => `
      <article class="degree-card" style="--degree-color:${esc(d.color_hex || '#173b35')}">
        <span class="degree-number">الدرجة ${esc(d.id)}</span>
        <h3>${esc(d.name_ar)}</h3>
        <div class="degree-meta">
          <span><span>مستوى الخطورة</span><b>${esc(SEVERITY_LABEL[d.severity] || d.severity)}</b></span>
          <span><span>أقصى عقوبة</span><b>#${esc(d.max_penalty)}</b></span>
        </div>
      </article>
    `).join('');
  }

  // ------------------------------------------------------------
  // المخالفات (مجمّعة حسب الدرجة)
  // ------------------------------------------------------------
  function renderViolations() {
    $('btnAddViolation').hidden = !state.isAdmin;
    $('violationsHint').textContent = state.isAdmin
      ? 'المسؤول العام: إضافة، تعديل، نقل درجة، إيقاف/تفعيل، وحذف المخالفات المخصصة.'
      : 'قراءة فقط. المخالفات المخصّصة يضيفها المسؤول العام حسب تقدير لجنة الحماية المدرسية.';

    const query = (($('violationSearch') && $('violationSearch').value) || '').trim().toLowerCase();
    let shown = 0;
    const groups = state.degrees
      .filter((d) => d.id !== 4)
      .map((degree) => {
        const rows = state.violations.filter((v) => {
          if (v.degree_id !== degree.id) return false;
          if (!query) return true;
          return String(v.code || '').toLowerCase().includes(query) || String(v.description_ar || '').toLowerCase().includes(query);
        });
        shown += rows.length;
        const rowsHtml = rows.map((v) => {
          let actions = '';
          if (state.isAdmin) {
            const buttons = [
              `<button class="mini" data-action="toggle-violation" data-id="${v.id}" data-active="${v.is_active}">${v.is_active ? 'إيقاف' : 'تفعيل'}</button>`
            ];
            if (v.is_custom) {
              buttons.push(
                `<button class="mini" data-action="edit-violation" data-id="${v.id}">تعديل</button>`,
                `<button class="mini mini-danger" data-action="delete-violation" data-id="${v.id}" data-code="${esc(v.code)}">حذف</button>`
              );
            }
            actions = `<td class="center actions-cell">${buttons.join(' ')}</td>`;
          }
          return `
          <tr>
            <td>${esc(v.code)}</td>
            <td>${esc(v.description_ar)}${v.is_custom ? ' <span class="badge">مخصصة</span>' : ''}${!v.is_active ? ' <span class="badge badge-off">موقوفة</span>' : ''}</td>
            ${actions}
          </tr>`;
        }).join('');

        return `
          <div class="violation-group" style="--degree-color:${esc(degree.color_hex || '#173b35')}">
            <div class="violation-group-head"><h3>${esc(degree.name_ar)} <small>${rows.length} مخالفة</small></h3></div>
            <div class="table-wrap">
              <table class="data-table">
                <thead><tr><th>الكود</th><th>وصف المخالفة</th>${state.isAdmin ? '<th>الإجراء</th>' : ''}</tr></thead>
                <tbody>${rowsHtml || `<tr><td colspan="${state.isAdmin ? 3 : 2}" class="empty-row">لا توجد نتائج مطابقة.</td></tr>`}</tbody>
              </table>
            </div>
          </div>
        `;
      });

    $('violationsGroups').innerHTML = groups.join('');
    if ($('violationCount')) $('violationCount').textContent = `${shown} مخالفة ظاهرة`;
  }

  // ------------------------------------------------------------
  // العقوبات (ثابتة — قراءة فقط)
  // ------------------------------------------------------------
  function renderPenalties() {
    const rows = state.penalties.map((p) => `
      <tr>
        <td>${esc(p.id)}</td>
        <td>${esc(p.name_ar)}</td>
        <td>${esc(TIER_LABEL[p.tier] || p.tier)}</td>
        <td class="center">${p.is_suspend ? '✓' : '—'}</td>
        <td class="center">${p.is_terminal ? '✓' : '—'}</td>
      </tr>
    `).join('');

    $('penaltiesTable').innerHTML = `
      <table class="data-table">
        <thead><tr><th>#</th><th>العقوبة</th><th>الفئة</th><th class="center">فصل؟</th><th class="center">نهائية؟</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  // ------------------------------------------------------------
  // مصفوفة الدرجة × العقوبة
  // ------------------------------------------------------------
  function renderMatrix() {
    const allowed = new Set(state.matrix.map((m) => `${m.degree_id}:${m.penalty_id}`));
    const header = state.penalties.map((p) => `<th class="center" title="${esc(p.name_ar)}">${esc(p.id)}</th>`).join('');

    const rows = state.degrees.map((d) => {
      const cells = state.penalties.map((p) => {
        const isAllowed = allowed.has(`${d.id}:${p.id}`);
        return `<td class="center ${isAllowed ? 'yes' : 'no'}">${isAllowed ? '✓' : '—'}</td>`;
      }).join('');
      return `<tr><td><b>${esc(d.name_ar)}</b></td>${cells}</tr>`;
    }).join('');

    $('matrixTable').innerHTML = `
      <table class="data-table">
        <thead><tr><th>الدرجة \\ العقوبة رقم</th>${header}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="small-note">✓ = مسموحة · — = غير مسموحة. أرقام الأعمدة تقابل رقم العقوبة في تبويب «العقوبات».</p>
    `;
  }

  // ------------------------------------------------------------
  // الأماكن
  // ------------------------------------------------------------
  function renderLocations() {
    $('btnAddLocation').hidden = !state.isAdmin;
    $('locationsHint').textContent = state.isAdmin
      ? 'المسؤول العام يمكنه إضافة مكان مخصص أو إيقاف/تفعيل مكان قائم.'
      : 'قراءة فقط.';
    const query = (($('locationSearch') && $('locationSearch').value) || '').trim().toLowerCase();
    const filtered = state.locations.filter((l) => !query || String(l.name_ar || '').toLowerCase().includes(query));
    const rows = filtered.map((l) => `
      <tr>
        <td>${esc(l.name_ar)}${l.is_custom ? ' <span class="badge">مخصص</span>' : ''}${!l.is_active ? ' <span class="badge badge-off">موقوف</span>' : ''}</td>
        ${state.isAdmin ? `<td class="center"><button class="mini" data-action="toggle-location" data-id="${l.id}" data-active="${l.is_active}">${l.is_active ? 'إيقاف' : 'تفعيل'}</button></td>` : ''}
      </tr>
    `).join('');

    $('locationsTable').innerHTML = `
      <table class="data-table">
        <thead><tr><th>المكان</th>${state.isAdmin ? '<th>الإجراء</th>' : ''}</tr></thead>
        <tbody>${rows || `<tr><td colspan="${state.isAdmin ? 2 : 1}" class="empty-row">لا توجد نتائج مطابقة.</td></tr>`}</tbody>
      </table>
    `;
    if ($('locationCount')) $('locationCount').textContent = `${filtered.length} مكان ظاهر`;
  }

  function renderAll() {
    renderStats();
    renderDegrees();
    renderViolations();
    renderPenalties();
    renderMatrix();
    renderLocations();
  }

  // ------------------------------------------------------------
  // إجراءات المسؤول العام
  // ------------------------------------------------------------
  async function toggleViolation(id, currentlyActive) {
    const sb = SoloukiDB.sb();
    const { error } = await sb.rpc('admin_set_violation_active', {
      p_violation_id: Number(id),
      p_is_active: !currentlyActive
    });
    if (error) return note('error', error.message);
    const row = state.violations.find((v) => v.id === Number(id));
    if (row) row.is_active = !currentlyActive;
    renderStats();
    renderViolations();
    note('ok', 'تم تحديث حالة المخالفة.');
  }

  async function toggleLocation(id, currentlyActive) {
    const sb = SoloukiDB.sb();
    const { error } = await sb.rpc('admin_set_location_active', {
      p_location_id: Number(id),
      p_is_active: !currentlyActive
    });
    if (error) return note('error', error.message);
    const row = state.locations.find((l) => l.id === Number(id));
    if (row) row.is_active = !currentlyActive;
    renderStats();
    renderLocations();
    note('ok', 'تم تحديث حالة المكان.');
  }

  async function addViolation(degreeId, description) {
    const sb = SoloukiDB.sb();
    const { data, error } = await sb.rpc('admin_add_violation', {
      p_degree_id: Number(degreeId),
      p_description: description
    });
    if (error) return note('error', error.message);
    state.violations.push(data);
    renderStats();
    renderViolations();
    note('ok', 'تمت إضافة المخالفة: ' + data.code);
  }

  async function updateViolation(id, degreeId, description) {
    const sb = SoloukiDB.sb();
    const { data, error } = await sb.rpc('admin_update_violation', {
      p_violation_id: Number(id),
      p_degree_id: Number(degreeId),
      p_description: description
    });
    if (error) return note('error', error.message);
    const idx = state.violations.findIndex((v) => v.id === Number(id));
    if (idx >= 0) state.violations[idx] = data;
    else state.violations.push(data);
    renderStats();
    renderViolations();
    note('ok', 'تم تحديث المخالفة: ' + data.code);
  }

  async function deleteViolation(id, code) {
    const label = code || id;
    if (!window.confirm('هل تريد حذف المخالفة «' + label + '» نهائيًا؟\nلا يمكن التراجع عن هذا الإجراء.')) return;
    const sb = SoloukiDB.sb();
    const { error } = await sb.rpc('admin_delete_violation', {
      p_violation_id: Number(id)
    });
    if (error) return note('error', error.message);
    state.violations = state.violations.filter((v) => v.id !== Number(id));
    renderStats();
    renderViolations();
    note('ok', 'تم حذف المخالفة: ' + label);
  }

  async function addLocation(name) {
    const sb = SoloukiDB.sb();
    const { data, error } = await sb.rpc('admin_add_location', { p_name_ar: name });
    if (error) return note('error', error.message);
    state.locations.push(data);
    state.locations.sort((a, b) => a.sort_order - b.sort_order);
    renderStats();
    renderLocations();
    note('ok', 'تمت إضافة المكان: ' + data.name_ar);
  }

  // ------------------------------------------------------------
  // ربط الأحداث
  // ------------------------------------------------------------
  function activateTab(id) {
    document.querySelectorAll('.tabs button, .panel').forEach((el) => el.classList.remove('active'));
    const btn = document.querySelector(`.tabs button[data-tab="${id}"]`);
    if (btn) btn.classList.add('active');
    const panel = $(id);
    if (panel) panel.classList.add('active');
    if (history.replaceState) history.replaceState(null, '', `#${id}`);
  }

  function setupSearch() {
    const v = $('violationSearch');
    const l = $('locationSearch');
    if (v) v.addEventListener('input', renderViolations);
    if (l) l.addEventListener('input', renderLocations);
    document.querySelectorAll('[data-jump]').forEach((card) => card.addEventListener('click', () => activateTab(card.dataset.jump)));
  }

  function setupTabs() {
    document.querySelectorAll('.tabs button').forEach((btn) => btn.addEventListener('click', () => activateTab(btn.dataset.tab)));
    const hash = location.hash.replace('#', '');
    if (hash && document.getElementById(hash)) activateTab(hash);
  }

  function setupRowActions() {
    document.body.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button[data-action]');
      if (!btn) return;
      const id = btn.dataset.id;
      const active = btn.dataset.active === 'true';
      if (btn.dataset.action === 'toggle-violation') toggleViolation(id, active);
      if (btn.dataset.action === 'toggle-location') toggleLocation(id, active);
      if (btn.dataset.action === 'edit-violation') openEditViolation(id);
      if (btn.dataset.action === 'delete-violation') deleteViolation(id, btn.dataset.code);
    });
  }

  function openEditViolation(id) {
    const row = state.violations.find((v) => v.id === Number(id));
    if (!row || !row.is_custom) {
      note('error', 'يمكن تعديل المخالفات المخصصة فقط.');
      return;
    }
    const form = $('violationForm');
    form.reset();
    $('violationEditId').value = String(row.id);
    $('violationDegree').value = String(row.degree_id);
    $('violationDescription').value = row.description_ar || '';
    $('violationModalKicker').textContent = 'تعديل';
    $('violationModalTitle').textContent = 'تعديل مخالفة مخصصة — ' + (row.code || '');
    $('violationSubmitBtn').textContent = 'حفظ التعديلات';
    const hint = $('violationEditHint');
    if (hint) hint.hidden = false;
    $('violationModal').hidden = false;
  }

  function setupViolationModal() {
    const modal = $('violationModal');
    const form = $('violationForm');

    const openAdd = () => {
      form.reset();
      $('violationEditId').value = '';
      $('violationModalKicker').textContent = 'إضافة جديدة';
      $('violationModalTitle').textContent = 'إضافة مخالفة مخصصة';
      $('violationSubmitBtn').textContent = 'حفظ المخالفة';
      const hint = $('violationEditHint');
      if (hint) hint.hidden = true;
      modal.hidden = false;
    };
    const close = () => { modal.hidden = true; };

    $('btnAddViolation').addEventListener('click', openAdd);
    $('closeViolationModal').addEventListener('click', close);
    $('cancelViolationModal').addEventListener('click', close);
    modal.addEventListener('click', (ev) => { if (ev.target === modal) close(); });

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const editId = ($('violationEditId').value || '').trim();
      const degreeId = $('violationDegree').value;
      const description = $('violationDescription').value.trim();
      if (editId) {
        await updateViolation(editId, degreeId, description);
      } else {
        await addViolation(degreeId, description);
      }
      close();
    });
  }

  function setupLocationModal() {
    const modal = $('locationModal');
    const form = $('locationForm');
    const open = () => { form.reset(); modal.hidden = false; };
    const close = () => { modal.hidden = true; };

    $('btnAddLocation').addEventListener('click', open);
    $('closeLocationModal').addEventListener('click', close);
    $('cancelLocationModal').addEventListener('click', close);
    modal.addEventListener('click', (ev) => { if (ev.target === modal) close(); });

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      await addLocation($('locationName').value.trim());
      close();
    });
  }

  function setupLogout() {
    $('logout').addEventListener('click', () => SoloukiSession.logout('index.html'));
  }

  // ------------------------------------------------------------
  // الإقلاع
  // ------------------------------------------------------------
  async function boot() {
    const auth = await SoloukiSession.requireSession();
    if (!auth) return;

    state.profile = auth.profile;
    state.isAdmin = auth.profile.role_type === 'superadmin';

    setupTabs();
    setupSearch();
    setupRowActions();
    setupViolationModal();
    setupLocationModal();
    setupLogout();

    const ok = await loadAll();
    if (ok) renderAll();
  }

  boot();
})();
