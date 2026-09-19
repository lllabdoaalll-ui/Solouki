(function(){'use strict';
const db=window.supabase.createClient(SOLOUKI_CONFIG.SUPABASE_URL,SOLOUKI_CONFIG.SUPABASE_ANON_KEY);
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const S={profile:null,stages:[],classes:[],teachers:[],editing:null};
function msg(t,kind='ok'){const e=$('msg');e.textContent=t;e.className='message '+kind;e.hidden=false;setTimeout(()=>e.hidden=true,3500)}
function stageName(id){return S.stages.find(x=>String(x.id)===String(id))?.name_ar||S.stages.find(x=>String(x.id)===String(id))?.name||id}
async function boot(){
 const {data:{session}}=await db.auth.getSession(); if(!session)return location.href='index.html';
 const {data:p,error}=await db.from('profiles').select('*').eq('id',session.user.id).eq('is_active',true).single();
 if(error||!p||!['superadmin','it_officer'].includes(p.role_type)){alert('هذه الصفحة للمسؤول العام أو مسؤول الحاسب فقط.');return location.href='dashboard.html'}
 S.profile=p;
 const {data:st,error:se}=await db.from('stages').select('id,name_ar,name,section,stage_type,sort_order,is_active').eq('school_id',p.school_id).eq('is_active',true).order('sort_order');
 if(se)throw se; S.stages=st||[];
 await loadClasses(); await loadTeachers(); render();
}
async function loadClasses(){
 const ids=S.stages.map(x=>x.id); if(!ids.length){S.classes=[];return}
 let {data,error}=await db.rpc('list_bulk_class_options');
 if(!error&&data?.length){S.classes=data.map(x=>({stage_id:x.stage_id,grade:x.grade,class_name:x.class_name,section:x.section||'arabic',stage_name:x.stage_name||stageName(x.stage_id),student_count:x.student_count||0}));return}
 const r=await db.from('students').select('stage_id,grade,class_name,section').in('stage_id',ids).eq('is_active',true).limit(20000);
 if(r.error){S.classes=[];return}
 const m=new Map();(r.data||[]).forEach(x=>{if(!x.stage_id||!x.grade||!x.class_name)return;const sec=x.section||'arabic';const k=[x.stage_id,x.grade,x.class_name,sec].join('|');if(!m.has(k))m.set(k,{stage_id:x.stage_id,grade:x.grade,class_name:x.class_name,section:sec,stage_name:stageName(x.stage_id),student_count:0});m.get(k).student_count++});S.classes=[...m.values()];
}
async function loadTeachers(){
 const r=await db.from('teacher_directory').select('id,external_teacher_id,full_name,is_active,school_id,teacher_class_assignments(id,stage_id,grade,class_name,section,is_active)').eq('school_id',S.profile.school_id).order('full_name');
 if(r.error){if(String(r.error.message).includes('does not exist'))throw new Error('يجب تنفيذ SQL الخاص بـ STEP 69 أولًا في Supabase.');throw r.error}S.teachers=r.data||[];
}
function render(){
 const q=$('search').value.trim().toLowerCase();const rows=S.teachers.filter(t=>!q||String(t.external_teacher_id).toLowerCase().includes(q)||String(t.full_name).toLowerCase().includes(q));
 $('rows').innerHTML=rows.length?rows.map(t=>{const as=(t.teacher_class_assignments||[]).filter(a=>a.is_active);return `<tr><td dir="ltr"><b>${esc(t.external_teacher_id)}</b></td><td>${esc(t.full_name)}</td><td><div class="scope">${as.map(a=>`<span class="badge">${esc(stageName(a.stage_id))} — ${esc(a.grade)} — ${esc(a.class_name)} — ${a.section==='languages'?'لغات':'عربي'}</span>`).join('')||'—'}</div></td><td>${t.is_active?'نشط':'موقوف'}</td><td><button class="mini" onclick="editTeacher('${t.id}')">تعديل</button> <button class="mini" onclick="toggleTeacher('${t.id}')">${t.is_active?'إيقاف':'تفعيل'}</button></td></tr>`}).join(''):'<tr><td colspan="5">لا توجد سجلات.</td></tr>';
}
function assignmentRow(a={stage_id:'',grade:'',class_name:'',section:'arabic'}){
 const id='a'+Math.random().toString(36).slice(2,9);
 const opts=S.classes.map(c=>`<option value="${esc(c.stage_id+'|'+c.grade+'|'+c.class_name+'|'+c.section)}">${esc(c.stage_name)} — ${esc(c.grade)} — ${esc(c.class_name)} — ${c.section==='languages'?'لغات':'عربي'} (${c.student_count})</option>`).join('');
 const val=a.stage_id?[a.stage_id,a.grade,a.class_name,a.section||'arabic'].join('|'):'';
 return `<div class="assignment-row" data-row="${id}"><label>الفصل<select class="scope-select"><option value="">اختر الفصل</option>${opts}</select></label><button type="button" class="btn btn-outline remove-assignment">حذف</button></div>`;
}
function renderAssignments(items=[]){$('assignments').innerHTML=(items.length?items:[{}]).map(a=>assignmentRow(a)).join('');const rows=[...document.querySelectorAll('.assignment-row')];rows.forEach((r,i)=>{const select=r.querySelector('.scope-select');const a=items[i];if(a&&select)select.value=[a.stage_id,a.grade,a.class_name,a.section||'arabic'].join('|');r.querySelector('.remove-assignment').onclick=()=>{r.remove();}})}
function openTeacher(t=null){S.editing=t;$('title').textContent=t?'تعديل معلم':'إضافة معلم';$('id').value=t?.id||'';$('externalId').value=t?.external_teacher_id||'';$('name').value=t?.full_name||'';$('active').checked=t?t.is_active!==false:true;renderAssignments((t?.teacher_class_assignments||[]).filter(a=>a.is_active));$('modal').hidden=false}
window.editTeacher=id=>openTeacher(S.teachers.find(t=>t.id===id)||null);
window.toggleTeacher=async id=>{const t=S.teachers.find(x=>x.id===id);if(!t)return;try{const {error}=await db.from('teacher_directory').update({is_active:!t.is_active}).eq('id',id);if(error)throw error;await loadTeachers();render();msg(t.is_active?'تم إيقاف المعلم.':'تم تفعيل المعلم.')}catch(e){msg(e.message||'تعذر تحديث الحالة.','error')}};
async function save(e){e.preventDefault();const externalId=$('externalId').value.trim(),name=$('name').value.trim();if(!externalId||!name)return msg('المعرّف والاسم مطلوبان.','error');const assignments=[];for(const r of document.querySelectorAll('.assignment-row')){const v=r.querySelector('.scope-select').value;if(!v)continue;const [stage_id,grade,class_name,section]=v.split('|');assignments.push({stage_id,grade,class_name,section})}if(!assignments.length)return msg('يجب إسناد فصل واحد على الأقل.','error');
 try{let teacherId=$('id').value; if(teacherId){const {error}=await db.from('teacher_directory').update({external_teacher_id:externalId,full_name:name,is_active:$('active').checked}).eq('id',teacherId);if(error)throw error}else{const {data,error}=await db.from('teacher_directory').insert({school_id:S.profile.school_id,external_teacher_id:externalId,full_name:name,is_active:$('active').checked}).select('id').single();if(error)throw error;teacherId=data.id}
 const {error:de}=await db.from('teacher_class_assignments').delete().eq('teacher_directory_id',teacherId);if(de)throw de;const rows=assignments.map(a=>({...a,teacher_directory_id:teacherId,is_active:true}));const {error:ie}=await db.from('teacher_class_assignments').insert(rows);if(ie)throw ie;
 $('modal').hidden=true;await loadTeachers();render();msg('تم حفظ دليل المعلم ونطاق فصوله.');
 }catch(e){msg(e.message||'تعذر الحفظ.','error')}
}
$('form').addEventListener('submit',save);$('add').onclick=()=>openTeacher();$('close').onclick=$('cancel').onclick=()=>{$('modal').hidden=true};$('refresh').onclick=async()=>{await loadClasses();await loadTeachers();render()};$('search').oninput=render;
boot().catch(e=>{console.error(e);msg(e.message||'تعذر تحميل دليل المعلمين.','error')});
})();
