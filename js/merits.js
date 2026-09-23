/**
 * Solouki — STEP 50: تسجيل التكريمات + نقاط
 */
(function () {
  'use strict';

  const state = {
    profile: null,
    selected: null,
    categories: [],
    searchTimer: null
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

  function todayISO() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }

  async function ensureAuth() {
    if (!window.SoloukiSession || !SoloukiSession.requireAuth) {
      note('error', 'جلسة غير متاحة');
      return null;
    }
    const profile = await SoloukiSession.requireAuth();
    if (!profile) return null;
    state.profile = profile;
    return profile;
  }

  async function loadCategories() {
    try {
      const { data, error } = await sb().rpc('list_merit_categories');
      if (error) throw error;
      state.categories = Array.isArray(data) ? data : [];
    } catch (_) {
      state.categories = [];
    }
    const sel = $('categorySelect');
    if (!sel) return;
    sel.innerHTML = '<option value="general">— اختر أو اكتب عنواناً —</option>' +
      state.categories.map((c) =>
        `<option value="${esc(c.code)}" data-points="${c.default_points || 10}">${esc(c.label_ar)} (+${c.default_points || 10})</option>`
      ).join('');
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
    const list = Array.isArray(data) ? data : [];
    if (!list.length) {
      box.innerHTML = '<div class="search-item muted">لا نتائج</div>';
      box.hidden = false;
      return;
    }
    box.innerHTML = list.map((s) => `
      <button type="button" class="search-item" data-id="${esc(s.id)}">
        <strong>${esc(s.full_name)}</strong>
        <span class="meta">${esc(s.grade)} / ${esc(s.class_name)} · ${sectionLabel(s.section)} · ${esc(s.national_id || '')}</span>
      </button>
    `).join('');
    box.hidden = false;
    box.querySelectorAll('.search-item[data-id]').forEach((btn) => {
      btn.addEventListener('click', () => selectStudent(list.find((x) => x.id === btn.dataset.id)));
    });
  }

  function selectStudent(s) {
    if (!s) return;
    state.selected = s;
    $('studentResults').hidden = true;
    $('studentSearch').value = s.full_name || '';
    const card = $('selectedStudent');
    card.hidden = false;
    card.innerHTML = `
      <strong>${esc(s.full_name)}</strong><br>
      الصف: ${esc(s.grade)} — الفصل: ${esc(s.class_name)} — ${sectionLabel(s.section)}<br>
      الرقم القومي: ${esc(s.national_id || '—')} · كود/جلوس: ${esc(s.student_code || s.seat_number || '—')}
    `;
    $('meritFormPanel').hidden = false;
    $('recentPanel').hidden = false;
    $('meritDate').value = todayISO();
    $('meritPoints').value = 10;
    loadStudentMerits(s.id);
    note('error', '');
    note('success', '');
  }

  async function loadStudentMerits(studentId) {
    const box = $('meritsList');
    box.innerHTML = '<p class="empty-row">جاري التحميل…</p>';
    try {
      const { data, error } = await sb().rpc('list_student_merits', { p_student_id: studentId });
      if (error) throw error;
      const list = Array.isArray(data) ? data : [];
      if (!list.length) {
        box.innerHTML = '<p class="empty-row">لا توجد تكريمات مسجّلة لهذا الطالب بعد.</p>';
        return;
      }
      box.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>العنوان</th>
              <th>النقاط</th>
              <th>بواسطة</th>
            </tr>
          </thead>
          <tbody>
            ${list.map((m) => `
              <tr class="card-row">
                <td data-label="التاريخ">${esc(m.merit_date || '')}</td>
                <td data-label="العنوان"><strong>${esc(m.title)}</strong>${m.description ? '<br><span class="meta">' + esc(m.description) + '</span>' : ''}</td>
                <td data-label="النقاط" class="points-pos">+${esc(m.points)}</td>
                <td data-label="بواسطة">${esc(m.awarded_by_name || '—')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch (e) {
      box.innerHTML = '<p class="empty-row">' + esc(e.message || e) + '</p>';
    }
  }

  async function saveMerit(ev) {
    ev.preventDefault();
    note('error', '');
    note('success', '');
    if (!state.selected) {
      note('error', 'اختر طالباً أولاً');
      return;
    }
    const title = ($('meritTitle').value || '').trim();
    if (!title) {
      note('error', 'عنوان التكريم مطلوب');
      return;
    }
    const points = parseInt($('meritPoints').value, 10);
    if (isNaN(points) || points < 0 || points > 100) {
      note('error', 'النقاط يجب أن تكون بين 0 و 100');
      return;
    }
    const btn = $('saveMeritBtn');
    btn.disabled = true;
    try {
      const { data, error } = await sb().rpc('record_merit', {
        p_student_id: state.selected.id,
        p_title: title,
        p_description: ($('meritDesc').value || '').trim() || null,
        p_points: points,
        p_merit_date: $('meritDate').value || todayISO(),
        p_category: $('categorySelect').value || 'general',
        p_notes: ($('meritNotes').value || '').trim() || null
      });
      if (error) throw error;
      note('success', 'تم تسجيل التكريم بنجاح (+' + points + ' نقطة)');
      $('meritTitle').value = '';
      $('meritDesc').value = '';
      $('meritNotes').value = '';
      $('meritPoints').value = 10;
      $('categorySelect').value = 'general';
      await loadStudentMerits(state.selected.id);
    } catch (e) {
      note('error', e.message || String(e));
    } finally {
      btn.disabled = false;
    }
  }

  function onCategoryChange() {
    const opt = $('categorySelect').selectedOptions[0];
    if (!opt || opt.value === 'general') return;
    const pts = opt.getAttribute('data-points');
    if (pts) $('meritPoints').value = pts;
    if (!$('meritTitle').value) {
      $('meritTitle').value = opt.textContent.replace(/\s*\(\+\d+\)\s*$/, '').trim();
    }
  }

  async function init() {
    const profile = await ensureAuth();
    if (!profile) return;

    const can = await SoloukiPerms.canAct('record_merits');
    if (!can && profile.role_type !== 'superadmin') {
      note('error', 'ليس لديك صلاحية تسجيل التكريمات. راجع مدير النظام.');
      $('meritFormPanel').hidden = true;
    }

    await loadCategories();
    $('meritDate').value = todayISO();

    $('studentSearch').addEventListener('input', () => {
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(() => searchStudents($('studentSearch').value.trim()), 280);
    });

    $('categorySelect').addEventListener('change', onCategoryChange);
    $('meritForm').addEventListener('submit', saveMerit);
    $('resetMeritBtn').addEventListener('click', () => {
      $('meritForm').reset();
      $('meritDate').value = todayISO();
      $('meritPoints').value = 10;
      note('error', '');
      note('success', '');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
