(function(){
'use strict';
const db = (window.SoloukiDB && typeof window.SoloukiDB.getClient === 'function')
  ? window.SoloukiDB.getClient()
  : window.supabase.createClient(SOLOUKI_CONFIG.SUPABASE_URL, SOLOUKI_CONFIG.SUPABASE_ANON_KEY);
const $ = id => document.getElementById(id);
const esc = x => String(x ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const S = { profile:null, stages:[], classes:[], teachers:[], switches:[], editing:null };

function msg(t, kind='ok'){
  const e = $('msg');
  if (!e) return;
  e.textContent = t;
  e.className = 'message ' + kind;
  e.hidden = false;
  setTimeout(() => e.hidden = true, 5000);
}

function stageName(id){
  const s = S.stages.find(x => String(x.id) === String(id));
  return s?.name_ar || s?.name || id || '';
}

function resolveStageId(token){
  const t = String(token || '').trim();
  if (!t) return null;
  const byId = S.stages.find(x => String(x.id) === t);
  if (byId) return byId.id;
  const byName = S.stages.find(x =>
    String(x.name_ar || '').trim() === t ||
    String(x.name || '').trim() === t
  );
  return byName ? byName.id : null;
}

function normalizeSection(raw){
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return 'arabic';
  if (['languages','lang','language','لغات','لغة','لغات انجليزي','english'].includes(s)) return 'languages';
  return 'arabic';
}

/** Parse "stage|grade|class|section;..." into assignment objects */
function parseAssignmentsCell(raw){
  const text = String(raw || '').trim();
  if (!text) return [];
  const out = [];
  const seen = new Set();
  text.split(/[;\n]+/).forEach(part => {
    const p = part.trim();
    if (!p) return;
    const bits = p.split('|').map(x => x.trim()).filter(Boolean);
    if (bits.length < 3) return;
    const stage_id = resolveStageId(bits[0]);
    if (!stage_id) return;
    const grade = bits[1];
    const class_name = bits[2];
    const section = normalizeSection(bits[3] || 'arabic');
    if (!grade || !class_name) return;
    const key = [stage_id, grade, class_name, section].join('|');
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ stage_id, grade, class_name, section });
  });
  return out;
}

async function boot(){
  const { data: { session } } = await db.auth.getSession();
  if (!session) return location.href = 'index.html';
  const { data: p, error } = await db.from('profiles').select('*').eq('id', session.user.id).eq('is_active', true).single();
  if (error || !p || !['superadmin','it_officer'].includes(p.role_type)) {
    alert('هذه الصفحة للمسؤول العام أو مسؤول الحاسب فقط.');
    return location.href = 'dashboard.html';
  }
  S.profile = p;
  const { data: st, error: se } = await db.from('stages')
    .select('id,name_ar,section,stage_type,sort_order,is_active')
    .eq('school_id', p.school_id)
    .eq('is_active', true)
    .order('sort_order');
  if (se) throw se;
  S.stages = st || [];
  await loadClasses();
  await loadTeachers();
  await loadSwitches();
  render();
  renderSwitches();
}

async function loadClasses(){
  const ids = S.stages.map(x => x.id);
  if (!ids.length) { S.classes = []; return; }
  let { data, error } = await db.rpc('list_bulk_class_options');
  if (!error && data?.length) {
    S.classes = data.map(x => ({
      stage_id: x.stage_id,
      grade: x.grade,
      class_name: x.class_name,
      section: x.section || 'arabic',
      stage_name: x.stage_name || stageName(x.stage_id),
      student_count: x.student_count || 0
    }));
    return;
  }
  const r = await db.from('students')
    .select('stage_id,grade,class_name,section')
    .in('stage_id', ids)
    .eq('is_active', true)
    .limit(20000);
  if (r.error) { S.classes = []; return; }
  const m = new Map();
  (r.data || []).forEach(x => {
    if (!x.stage_id || !x.grade || !x.class_name) return;
    const sec = x.section || 'arabic';
    const k = [x.stage_id, x.grade, x.class_name, sec].join('|');
    if (!m.has(k)) m.set(k, {
      stage_id: x.stage_id, grade: x.grade, class_name: x.class_name,
      section: sec, stage_name: stageName(x.stage_id), student_count: 0
    });
    m.get(k).student_count++;
  });
  S.classes = [...m.values()];
}

async function loadTeachers(){
  const r = await db.from('teacher_directory')
    .select('id,external_teacher_id,full_name,is_active,school_id,teacher_class_assignments(id,stage_id,grade,class_name,section,is_active)')
    .eq('school_id', S.profile.school_id)
    .order('full_name');
  if (r.error) {
    if (String(r.error.message).includes('does not exist'))
      throw new Error('يجب تنفيذ SQL الخاص بـ STEP 69 أولًا في Supabase.');
    throw r.error;
  }
  S.teachers = r.data || [];
}

async function loadSwitches(){
  const box = $('switchesPanel');
  if (!box) { S.switches = []; return; }
  const r = await db.from('teacher_behavior_switches')
    .select('id,stage_id,section,recording_enabled,merits_enabled,updated_at')
    .eq('school_id', S.profile.school_id)
    .order('stage_id');
  if (r.error) {
    S.switches = [];
    if (String(r.error.message || '').includes('does not exist')) {
      box.innerHTML = '<p class="small-note" style="color:#b45309">لم يُنفَّذ بعد سكربت STEP 70 (مفاتيح التفعيل). نفّذ <code>sql/phase4-step70-security-and-switches.sql</code> في Supabase.</p>';
    }
    return;
  }
  S.switches = r.data || [];
}

function render(){
  const q = ($('search').value || '').trim().toLowerCase();
  let list = S.teachers;
  if (q) {
    list = list.filter(t =>
      String(t.external_teacher_id || '').toLowerCase().includes(q) ||
      String(t.full_name || '').toLowerCase().includes(q)
    );
  }
  const b = $('rows');
  if (!list.length) {
    b.innerHTML = '<p class="role-empty">لا توجد سجلات.</p>';
    return;
  }
  b.innerHTML = `<div class="sol-cards teachers-cards">${list.map(t => {
    const assigns = (t.teacher_class_assignments || [])
      .filter(a => a.is_active)
      .map(a => `${esc(stageName(a.stage_id))} — ${esc(a.grade)} — ${esc(a.class_name)}`)
      .join(' · ') || '—';
    const st = t.is_active !== false
      ? '<span class="status-pill on">نشط</span>'
      : '<span class="status-pill off">موقوف</span>';
    return `<article class="sol-card">
      <header class="sol-card-head">
        <div>
          <div class="sol-card-title">${esc(t.full_name)}</div>
          <div class="sol-card-sub" dir="ltr">ID: ${esc(t.external_teacher_id)}</div>
        </div>
        ${st}
      </header>
      <div class="sol-card-body"><strong>النطاق:</strong> ${assigns}</div>
      <div class="sol-card-actions">
        <button type="button" class="btn btn-outline btn-sm" onclick="editTeacher('${t.id}')">تعديل</button>
        <button type="button" class="btn btn-outline btn-sm" onclick="toggleTeacher('${t.id}')">${t.is_active !== false ? 'إيقاف' : 'تفعيل'}</button>
      </div>
    </article>`;
  }).join('')}</div>
  <div class="table-wrap teachers-table-desktop"><table class="data-table"><thead><tr><th>Teacher ID</th><th>المعلم</th><th>النطاق الدراسي</th><th>الحالة</th><th></th></tr></thead><tbody>${list.map(t => {
    const assigns = (t.teacher_class_assignments || [])
      .filter(a => a.is_active)
      .map(a => `${esc(stageName(a.stage_id))} — ${esc(a.grade)} — ${esc(a.class_name)}`)
      .join('<br>') || '—';
    const st = t.is_active !== false
      ? '<span class="badge ok">نشط</span>'
      : '<span class="badge off">موقوف</span>';
    return `<tr>
      <td dir="ltr">${esc(t.external_teacher_id)}</td>
      <td>${esc(t.full_name)}</td>
      <td style="font-size:13px">${assigns}</td>
      <td>${st}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-outline btn-sm" onclick="editTeacher('${t.id}')">تعديل</button>
        <button class="btn btn-outline btn-sm" onclick="toggleTeacher('${t.id}')">${t.is_active !== false ? 'إيقاف' : 'تفعيل'}</button>
      </td>
    </tr>`;
  }).join('')}</tbody></table></div>`;
}

function renderSwitches(){
  const box = $('switchesPanel');
  if (!box) return;
  if (!S.stages.length) {
    box.innerHTML = '<p class="small-note">لا توجد مراحل نشطة.</p>';
    return;
  }
  if (!S.switches.length && box.querySelector('code')) return;

  // كل مرحلة في جدول stages مرتبطة بقسم واحد (arabic أو languages).
  // لا نضرب المراحل × القسمين — ذلك يسبب تكراراً ظاهرياً عندما يكون اسم المرحلة يحتوي القسم.
  const sectionLabel = (key) => (key === 'languages' ? 'لغات' : 'عربي');

  const rows = S.stages.map(st => {
    const secKey = (st.section === 'languages' || st.section === 'arabic')
      ? st.section
      : 'arabic';
    let sw = S.switches.find(x => String(x.stage_id) === String(st.id) && x.section === secKey);
    if (!sw) {
      sw = { stage_id: st.id, section: secKey, recording_enabled: false, merits_enabled: false, _missing: true };
    }
    return { stage: st, sec: { key: secKey, label: sectionLabel(secKey) }, sw };
  });

  box.innerHTML = `
    <p class="small-note" style="margin-bottom:10px">
      التفعيل هنا هو التدخل البشري الوحيد المطلوب. عند الإيقاف يرفض الجسر أي تسجيل من المعلمين لهذه المرحلة/القسم.
    </p>
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>المرحلة</th>
            <th>القسم</th>
            <th>تسجيل مخالفات</th>
            <th>تسجيل تكريمات</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(({ stage, sec, sw }) => `
            <tr>
              <td>${esc(stage.name_ar || stage.id)}</td>
              <td>${esc(sec.label)}</td>
              <td style="text-align:center">
                <label class="inline-check" style="justify-content:center">
                  <input type="checkbox" data-sw-stage="${esc(stage.id)}" data-sw-section="${sec.key}" data-sw-kind="recording"
                    ${sw.recording_enabled ? 'checked' : ''} onchange="saveSwitch(this)">
                  ${sw.recording_enabled ? 'مفعّل' : 'موقوف'}
                </label>
              </td>
              <td style="text-align:center">
                <label class="inline-check" style="justify-content:center">
                  <input type="checkbox" data-sw-stage="${esc(stage.id)}" data-sw-section="${sec.key}" data-sw-kind="merits"
                    ${sw.merits_enabled ? 'checked' : ''} onchange="saveSwitch(this)">
                  ${sw.merits_enabled ? 'مفعّل' : 'موقوف'}
                </label>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

window.saveSwitch = async function(el){
  const stageId = el.getAttribute('data-sw-stage');
  const section = el.getAttribute('data-sw-section');
  const kind = el.getAttribute('data-sw-kind');
  const enabled = !!el.checked;
  try {
    const payload = {
      school_id: S.profile.school_id,
      stage_id: stageId,
      section,
      updated_by: S.profile.id,
      updated_at: new Date().toISOString()
    };
    if (kind === 'merits') payload.merits_enabled = enabled;
    else payload.recording_enabled = enabled;

    const existing = S.switches.find(x => String(x.stage_id) === String(stageId) && x.section === section);
    if (existing && existing.id) {
      const { error } = await db.from('teacher_behavior_switches')
        .update(payload)
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const insertRow = {
        school_id: S.profile.school_id,
        stage_id: stageId,
        section,
        recording_enabled: kind === 'recording' ? enabled : false,
        merits_enabled: kind === 'merits' ? enabled : false,
        updated_by: S.profile.id
      };
      const { error } = await db.from('teacher_behavior_switches').upsert(insertRow, {
        onConflict: 'school_id,stage_id,section'
      });
      if (error) throw error;
    }
    await loadSwitches();
    renderSwitches();
    msg(enabled ? 'تم التفعيل.' : 'تم الإيقاف.');
  } catch (e) {
    console.error(e);
    el.checked = !enabled;
    msg(e.message || 'تعذر حفظ حالة التفعيل. تأكد من تنفيذ SQL الخاص بـ STEP 70.', 'error');
  }
};

function renderAssignments(selected){
  const box = $('assignments');
  const sel = new Set((selected || []).map(a =>
    [a.stage_id, a.grade, a.class_name, a.section || 'arabic'].join('|')
  ));
  if (!S.classes.length) {
    box.innerHTML = '<p class="small-note">لا توجد فصول. استورد طلابًا أولًا.</p>';
    return;
  }
  box.innerHTML = S.classes.map(c => {
    const v = [c.stage_id, c.grade, c.class_name, c.section || 'arabic'].join('|');
    const label = `${c.stage_name || stageName(c.stage_id)} — ${c.grade} — ${c.class_name}${c.section && c.section !== 'arabic' ? ' · ' + c.section : ''}`;
    return `<label class="assignment-row"><input type="checkbox" class="scope-select" value="${esc(v)}" ${sel.has(v) ? 'checked' : ''}> ${esc(label)}</label>`;
  }).join('');
}

function openTeacher(t){
  S.editing = t;
  $('title').textContent = t ? 'تعديل معلم' : 'إضافة معلم';
  $('id').value = t?.id || '';
  $('externalId').value = t?.external_teacher_id || '';
  $('name').value = t?.full_name || '';
  $('active').checked = t ? t.is_active !== false : true;
  renderAssignments((t?.teacher_class_assignments || []).filter(a => a.is_active));
  $('modal').hidden = false;
}

window.editTeacher = id => openTeacher(S.teachers.find(t => t.id === id) || null);

window.toggleTeacher = async id => {
  const t = S.teachers.find(x => x.id === id);
  if (!t) return;
  try {
    const { error } = await db.from('teacher_directory').update({ is_active: !t.is_active }).eq('id', id);
    if (error) throw error;
    await loadTeachers();
    render();
    msg(t.is_active ? 'تم إيقاف المعلم.' : 'تم تفعيل المعلم.');
  } catch (e) {
    msg(e.message || 'تعذر تحديث الحالة.', 'error');
  }
};

async function save(e){
  e.preventDefault();
  const externalId = $('externalId').value.trim();
  const name = $('name').value.trim();
  if (!externalId || !name) return msg('المعرّف والاسم مطلوبان.', 'error');
  const assignments = [];
  for (const r of document.querySelectorAll('.assignment-row')) {
    const cb = r.querySelector('.scope-select');
    if (!cb || !cb.checked) continue;
    const [stage_id, grade, class_name, section] = cb.value.split('|');
    assignments.push({ stage_id, grade, class_name, section });
  }
  if (!assignments.length) return msg('يجب إسناد فصل واحد على الأقل.', 'error');
  try {
    let teacherId = $('id').value;
    if (teacherId) {
      const { error } = await db.from('teacher_directory')
        .update({ external_teacher_id: externalId, full_name: name, is_active: $('active').checked })
        .eq('id', teacherId);
      if (error) throw error;
    } else {
      const { data, error } = await db.from('teacher_directory')
        .insert({ school_id: S.profile.school_id, external_teacher_id: externalId, full_name: name, is_active: $('active').checked })
        .select('id').single();
      if (error) throw error;
      teacherId = data.id;
    }
    const { error: de } = await db.from('teacher_class_assignments').delete().eq('teacher_directory_id', teacherId);
    if (de) throw de;
    const rows = assignments.map(a => ({ ...a, teacher_directory_id: teacherId, is_active: true }));
    const { error: ie } = await db.from('teacher_class_assignments').insert(rows);
    if (ie) throw ie;
    $('modal').hidden = true;
    await loadTeachers();
    render();
    msg('تم حفظ دليل المعلم ونطاق فصوله.');
  } catch (e) {
    msg(e.message || 'تعذر الحفظ.', 'error');
  }
}

/* ===== استيراد Excel (مع النطاق التلقائي) ===== */
function downloadTemplate(){
  const wb = XLSX.utils.book_new();
  const data = [
    ['Teacher ID', 'اسم المعلم', 'الفصول'],
    ['T001', 'أحمد محمد', 'ابتدائي|1|1|arabic;ابتدائي|2|1|arabic'],
    ['T002', 'فاطمة علي', 'إعدادي|1|2|languages']
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'معلمين');
  const note = XLSX.utils.aoa_to_sheet([
    ['تعليمات عمود الفصول'],
    ['الصيغة: المرحلة|الصف|الفصل|القسم'],
    ['المرحلة = معرّف المرحلة في سلوكي أو اسمها العربي'],
    ['القسم = arabic أو languages (اختياري، الافتراضي arabic)'],
    ['افصل عدة فصول بفاصلة منقوطة ;'],
    ['مثال: ابتدائي|1|1|arabic;ابتدائي|1|2|arabic']
  ]);
  XLSX.utils.book_append_sheet(wb, note, 'تعليمات');
  XLSX.writeFile(wb, 'نموذج_استيراد_معلمين_سلوكي.xlsx');
}

async function applyAssignments(teacherId, assignments){
  if (!assignments || !assignments.length) return 0;
  await db.from('teacher_class_assignments').delete().eq('teacher_directory_id', teacherId);
  const rows = assignments.map(a => ({
    teacher_directory_id: teacherId,
    stage_id: a.stage_id,
    grade: a.grade,
    class_name: a.class_name,
    section: a.section || 'arabic',
    is_active: true
  }));
  const { error } = await db.from('teacher_class_assignments').insert(rows);
  if (error) throw error;
  return rows.length;
}

async function handleExcelImport(file){
  if (!file) return;
  try {
    msg('جاري قراءة الملف...', 'ok');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (!rows.length) return msg('الملف فارغ.', 'error');

    const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const mapRow = r => {
      const keys = Object.keys(r);
      let id = '', name = '', classesRaw = '';
      for (const k of keys) {
        const nk = norm(k);
        if (['teacher id', 'teacher_id', 'id', 'معرف', 'معرّف', 'كود المعلم', 'رقم المعلم', 'المعرف'].some(x => nk === x || nk.includes(x)))
          id = String(r[k]).trim();
        else if (['اسم', 'name', 'full_name', 'اسم المعلم', 'المعلم'].some(x => nk === x || nk.includes('اسم')))
          name = String(r[k]).trim();
        else if (['الفصول', 'فصول', 'classes', 'assignments', 'النطاق', 'scope', 'class_assignments'].some(x => nk === x || nk.includes(x)))
          classesRaw = String(r[k]).trim();
      }
      if (!id && keys[0]) id = String(r[keys[0]]).trim();
      if (!name && keys[1]) name = String(r[keys[1]]).trim();
      if (!classesRaw && keys[2] && !norm(keys[2]).includes('مادة') && !norm(keys[2]).includes('subject'))
        classesRaw = String(r[keys[2]]).trim();
      return {
        external_teacher_id: id,
        full_name: name,
        assignments: parseAssignmentsCell(classesRaw)
      };
    };

    const parsed = rows.map(mapRow).filter(x => x.external_teacher_id && x.full_name);
    if (!parsed.length) return msg('لم يُعثر على صفوف صالحة (Teacher ID + اسم).', 'error');

    let created = 0, updated = 0, scoped = 0, failed = 0, skippedScope = 0;
    for (const row of parsed) {
      try {
        let teacherId = null;
        const existing = S.teachers.find(t =>
          String(t.external_teacher_id).toLowerCase() === row.external_teacher_id.toLowerCase()
        );
        if (existing) {
          const { error } = await db.from('teacher_directory')
            .update({ full_name: row.full_name, is_active: true })
            .eq('id', existing.id);
          if (error) throw error;
          teacherId = existing.id;
          updated++;
        } else {
          const { data, error } = await db.from('teacher_directory')
            .insert({
              school_id: S.profile.school_id,
              external_teacher_id: row.external_teacher_id,
              full_name: row.full_name,
              is_active: true
            })
            .select('id')
            .single();
          if (error) throw error;
          teacherId = data.id;
          created++;
        }
        if (row.assignments.length) {
          const n = await applyAssignments(teacherId, row.assignments);
          scoped += n > 0 ? 1 : 0;
        } else {
          skippedScope++;
        }
      } catch (e) {
        console.warn(row, e);
        failed++;
      }
    }
    await loadTeachers();
    render();
    let m = `تم الاستيراد: ${created} جديد، ${updated} محدّث`;
    if (scoped) m += `، نطاق تلقائي لـ ${scoped} معلم`;
    if (skippedScope) m += `، ${skippedScope} بلا عمود فصول (حدّد يدوياً إن لزم)`;
    if (failed) m += `، ${failed} فشل`;
    msg(m);
  } catch (e) {
    console.error(e);
    msg(e.message || 'تعذر قراءة ملف Excel.', 'error');
  }
}

$('form').addEventListener('submit', save);
$('add').onclick = () => openTeacher();
$('close').onclick = $('cancel').onclick = () => { $('modal').hidden = true; };
$('refresh').onclick = async () => {
  await loadClasses();
  await loadTeachers();
  await loadSwitches();
  render();
  renderSwitches();
};
$('search').oninput = render;
$('logout').onclick = async () => { await db.auth.signOut(); location.href = 'index.html'; };

$('templateBtn').onclick = downloadTemplate;
$('importBtn').onclick = () => $('excelFile').click();
$('excelFile').onchange = e => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (f) handleExcelImport(f);
};

boot().catch(e => {
  console.error(e);
  msg(e.message || 'تعذر تحميل دليل المعلمين.', 'error');
});
})();
