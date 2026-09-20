(function(){
'use strict';
const db = window.supabase.createClient(SOLOUKI_CONFIG.SUPABASE_URL, SOLOUKI_CONFIG.SUPABASE_ANON_KEY);
const $ = id => document.getElementById(id);
const esc = x => String(x ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const S = { profile:null, stages:[], classes:[], teachers:[], editing:null };

function msg(t, kind='ok'){
  const e = $('msg');
  e.textContent = t;
  e.className = 'message ' + kind;
  e.hidden = false;
  setTimeout(() => e.hidden = true, 4000);
}

function stageName(id){
  const s = S.stages.find(x => String(x.id) === String(id));
  return s?.name_ar || s?.name || id || '';
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
  render();
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
    b.innerHTML = '<tr><td colspan="5">لا توجد سجلات.</td></tr>';
    return;
  }
  b.innerHTML = list.map(t => {
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
  }).join('');
}

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

/* ===== استيراد Excel ===== */
function downloadTemplate(){
  const wb = XLSX.utils.book_new();
  const data = [
    ['Teacher ID', 'اسم المعلم'],
    ['T001', 'أحمد محمد'],
    ['T002', 'فاطمة علي']
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'معلمين');
  XLSX.writeFile(wb, 'نموذج_استيراد_معلمين_سلوكي.xlsx');
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

    // دعم أسماء أعمدة عربية أو إنجليزية
    const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const mapRow = r => {
      const keys = Object.keys(r);
      let id = '', name = '';
      for (const k of keys) {
        const nk = norm(k);
        if (['teacher id', 'teacher_id', 'id', 'معرف', 'معرّف', 'كود المعلم', 'رقم المعلم'].some(x => nk.includes(x) || nk === x))
          id = String(r[k]).trim();
        if (['اسم', 'name', 'full_name', 'اسم المعلم', 'المعلم'].some(x => nk === x || nk.includes('اسم')))
          name = String(r[k]).trim();
      }
      // fallback: أول عمودين
      if (!id && keys[0]) id = String(r[keys[0]]).trim();
      if (!name && keys[1]) name = String(r[keys[1]]).trim();
      return { external_teacher_id: id, full_name: name };
    };

    const parsed = rows.map(mapRow).filter(x => x.external_teacher_id && x.full_name);
    if (!parsed.length) return msg('لم يُعثر على صفوف صالحة (Teacher ID + اسم).', 'error');

    let created = 0, updated = 0, failed = 0;
    for (const row of parsed) {
      try {
        const existing = S.teachers.find(t =>
          String(t.external_teacher_id).toLowerCase() === row.external_teacher_id.toLowerCase()
        );
        if (existing) {
          const { error } = await db.from('teacher_directory')
            .update({ full_name: row.full_name, is_active: true })
            .eq('id', existing.id);
          if (error) throw error;
          updated++;
        } else {
          const { error } = await db.from('teacher_directory')
            .insert({
              school_id: S.profile.school_id,
              external_teacher_id: row.external_teacher_id,
              full_name: row.full_name,
              is_active: true
            });
          if (error) throw error;
          created++;
        }
      } catch (e) {
        console.warn(row, e);
        failed++;
      }
    }
    await loadTeachers();
    render();
    msg(`تم الاستيراد: ${created} جديد، ${updated} محدّث` + (failed ? `، ${failed} فشل` : '') + '. بعد الاستيراد حدّد الفصول لكل معلم من زر تعديل.');
  } catch (e) {
    console.error(e);
    msg(e.message || 'تعذر قراءة ملف Excel.', 'error');
  }
}

$('form').addEventListener('submit', save);
$('add').onclick = () => openTeacher();
$('close').onclick = $('cancel').onclick = () => { $('modal').hidden = true; };
$('refresh').onclick = async () => { await loadClasses(); await loadTeachers(); render(); };
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
