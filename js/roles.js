const sb=supabase.createClient(SOLOUKI_CONFIG.SUPABASE_URL,SOLOUKI_CONFIG.SUPABASE_ANON_KEY);
const S={profile:null,stages:[],users:[],assign:[],classes:[],availableClasses:[],revealedPasswords:{},permCatalog:[],rolePerms:[]};const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const rn=r=>({stage_manager:'مدير مرحلة',it_officer:'مسؤول حاسب',counselor:'أخصائي اجتماعي'})[r]||r;
function note(id,t){$(id).textContent=t;$(id).hidden=false;setTimeout(()=>$(id).hidden=true,3500)}
async function invokeStaff(action, profile_id, password=''){
  const body={action,profile_id}; if(password) body.password=password;
  const {data,error}=await sb.functions.invoke('admin-manage-staff',{body});
  if(error){
    let detail=error.message||String(error);
    try{const r=error.context;if(r&&typeof r.json==='function'){const b=await r.json();if(b?.error)detail=b.error;}}catch(_){ }
    throw new Error(detail);
  }
  if(data?.error) throw new Error(data.error);
  if(!data?.ok) throw new Error('لم تنجح العملية');
  return data;
}
async function boot(){const {data:{session}}=await sb.auth.getSession();if(!session)return location.href='index.html';
const p=await sb.from('profiles').select('*').eq('id',session.user.id).eq('is_active',true).single();if(p.error||p.data.role_type!=='superadmin'){alert('المسؤول العام فقط.');return location.href='dashboard.html'}S.profile=p.data;
const a=await Promise.all([sb.from('stages').select('*').eq('school_id',p.data.school_id).order('sort_order'),sb.from('profiles').select('*').eq('school_id',p.data.school_id).in('role_type',['stage_manager','it_officer','counselor']).order('full_name')]);
S.stages=a[0].data||[];S.users=a[1].data||[];const ids=S.stages.map(x=>x.id);
if(ids.length){S.assign=(await sb.from('stage_assignments').select('*').in('stage_id',ids)).data||[];S.classes=(await sb.from('counselor_class_assignments').select('*').in('stage_id',ids)).data||[]}
/* تحميل الفصول المتاحة من الطلاب (أو من RPC) لعرضها عند إسناد الأخصائي */
S.availableClasses=await loadAvailableClasses(ids);
const permA=await Promise.all([sb.from('permission_catalog').select('*').order('sort_order'),sb.from('role_permissions').select('*')]);S.permCatalog=permA[0].data||[];S.rolePerms=permA[1].data||[];renderPermissions();
render()}
/** يجلب الفصول الفعلية من الطلاب (أو RPC) وليس من الإسنادات السابقة فقط */
async function loadAvailableClasses(stageIds){
  try{
    const {data,error}=await sb.rpc('list_bulk_class_options');
    if(!error&&data&&data.length){
      return data.map(o=>({
        stage_id:o.stage_id,
        grade:o.grade,
        class_name:o.class_name,
        section:o.section||'arabic',
        stage_name:o.stage_name||stage(o.stage_id),
        student_count:o.student_count||0
      }));
    }
  }catch(_){}
  /* احتياطي: استعلام مباشر من جدول الطلاب */
  if(!stageIds||!stageIds.length)return[];
  const {data,error}=await sb.from('students')
    .select('stage_id,grade,class_name,section')
    .in('stage_id',stageIds)
    .eq('is_active',true);
  if(error||!data)return[];
  const map=new Map();
  data.forEach(s=>{
    if(!s.stage_id||!s.grade||!s.class_name)return;
    const key=`${s.stage_id}|${s.grade}|${s.class_name}|${s.section||'arabic'}`;
    if(!map.has(key))map.set(key,{stage_id:s.stage_id,grade:s.grade,class_name:s.class_name,section:s.section||'arabic',stage_name:stage(s.stage_id),student_count:0});
    map.get(key).student_count++;
  });
  return[...map.values()].sort((a,b)=>String(a.stage_name).localeCompare(String(b.stage_name),'ar')||String(a.grade).localeCompare(String(b.grade),'ar')||String(a.class_name).localeCompare(String(b.class_name),'ar'));
}
function stage(id){return S.stages.find(x=>x.id===id)?.name_ar||id}
function scope(u){if(u.role_type==='counselor')return S.classes.filter(x=>x.counselor_id===u.id).map(x=>`${stage(x.stage_id)} — ${x.grade} — ${x.class_name}`);return S.assign.filter(x=>x.profile_id===u.id).map(x=>stage(x.stage_id))}
function table(role,id){const us=S.users.filter(x=>x.role_type===role);$(id).innerHTML=`<div class="table-wrap"><table class="data-table"><tr><th>الاسم</th><th>البريد</th><th>النطاق</th><th>الحالة</th><th></th></tr>${us.map(u=>`<tr><td><b>${esc(u.full_name)}</b></td><td dir="ltr">${esc(u.email||'—')}</td><td>${scope(u).map(x=>`<span class="badge">${esc(x)}</span>`).join('')||'—'}</td><td>${u.is_active?'نشط':'موقوف'}</td><td><button class="mini" onclick="editUser('${u.id}')">تعديل</button> <button class="mini" onclick="resetUserPassword('${u.id}')" title="إصدار كلمة مرور جديدة وإلغاء القديمة">كلمة مرور جديدة</button> <button class="mini" onclick="toggleUser('${u.id}')">${u.is_active?'إيقاف':'تفعيل'}</button></td></tr>`).join('')}</table></div>`}
function render(){
  $('mCount').textContent=S.users.filter(x=>x.role_type==='stage_manager').length;
  $('iCount').textContent=S.users.filter(x=>x.role_type==='it_officer').length;
  $('cCount').textContent=S.users.filter(x=>x.role_type==='counselor').length;
  $('sCount').textContent=S.stages.filter(x=>x.is_active).length;
  table('stage_manager','managerList');
  table('it_officer','itList');
  table('counselor','counselorList');
  $('cardsList').innerHTML=S.users.map(u=>{
    const password=S.revealedPasswords[u.id];
    const ready=!!password;
    return `<article class="access-card ${ready?'ready':''}" data-user-id="${esc(u.id)}">
      <small>سلوكي</small>
      <h3>${esc(u.full_name)}</h3>
      <small>${rn(u.role_type)}</small>
      <div class="login-label">البريد الإلكتروني</div>
      <div class="login-email" dir="ltr">${esc(u.email||'—')}</div>
      <div class="login-label">كلمة المرور</div>
      <div class="pin" dir="ltr">${ready?esc(password):'غير متاحة'}</div>
      <small>${scope(u).map(esc).join(' • ')||'لم يُسند بعد'}</small>
      ${ready?'<div class="ready-note no-print">جاهزة للطباعة</div>':'<div class="missing-note no-print">أصدر كلمة مرور جديدة أولًا</div>'}
      <div class="card-actions no-print"><button type="button" class="mini" onclick="printSingleCard('${u.id}')" ${ready?'':'disabled'}>طباعة البطاقة</button><button type="button" class="mini" onclick="regeneratePassword('${u.id}')">كلمة مرور جديدة</button></div>
    </article>`;
  }).join('');
}

window.resetUserPassword=async id=>{
  const u=S.users.find(x=>x.id===id);if(!u)return;
  const me=S.profile;if(!me||(me.role_type!=='superadmin'&&me.role_type!=='it_officer'))return note('error','غير مصرح');
  if(me.role_type==='it_officer'&&u.role_type==='superadmin')return note('error','لا يمكن لمسؤول الحاسب إعادة تعيين كلمة سر المسؤول العام');
  if(!confirm('سيتم إصدار كلمة مرور جديدة لـ '+u.full_name+' وإلغاء القديمة فورًا. تأكيد؟'))return;
  try{
    const payload=await invokeStaff('reset_password',id);
    const pw=payload.password;
    if(!pw)throw new Error('لم تُرجع كلمة مرور جديدة');
    S.revealedPasswords[id]=pw; render();
    note('ok','تم إصدار كلمة مرور جديدة لـ '+u.full_name+' وهي جاهزة للطباعة.');
    try{await navigator.clipboard.writeText(pw);}catch(_){ }
    alert('كلمة المرور الجديدة لـ '+u.full_name+':\n\n'+pw+'\n\nتم وضعها في بطاقة الدخول وجاهزة للطباعة.');
  }catch(e){note('error','تعذر تجهيز بطاقة الدخول: '+(e.message||String(e)))}
};

window.regeneratePassword=async id=>{
  const u=S.users.find(x=>x.id===id);if(!u)return;
  if(!S.profile||!['superadmin','it_officer'].includes(S.profile.role_type))return note('error','غير مصرح');
  if(S.profile.role_type==='it_officer'&&u.role_type==='superadmin')return note('error','لا يمكن لمسؤول الحاسب إعادة تعيين كلمة سر المسؤول العام');
  if(!confirm('سيتم إصدار كلمة مرور مؤقتة جديدة لـ '+u.full_name+' وإلزامه بتغييرها عند الدخول. تأكيد؟'))return;
  try{
    const data=await invokeStaff('reset_password',id);
    const pw=data.password;if(!pw)throw new Error('لم تُرجع كلمة مرور');
    S.revealedPasswords[id]=pw; render();
    note('ok','كلمة مرور مؤقتة لـ '+u.full_name+' أصبحت جاهزة للطباعة.');
    try{await navigator.clipboard.writeText(pw)}catch(_){ }
    alert('كلمة المرور المؤقتة:\n'+pw+'\n\nتم وضعها في بطاقة الدخول. سيُطلب تغييرها عند أول دخول.');
  }catch(err){note('error','تعذر تجهيز بطاقة الدخول: '+(err.message||String(err)))}
};

window.printSingleCard=id=>{
  const u=S.users.find(x=>x.id===id); if(!u)return;
  if(!u.is_active)return alert('لا يمكن طباعة بطاقة دخول لحساب موقوف.');
  if(!S.revealedPasswords[id])return alert('أصدر كلمة مرور جديدة أولًا، ثم اطبع البطاقة.');
  const source=document.querySelector(`.access-card[data-user-id=\"${CSS.escape(id)}\"]`);
  if(!source)return alert('تعذر العثور على بطاقة العضو.');
  const old=document.getElementById('singlePrintCard'); if(old)old.remove();
  const wrap=document.createElement('div'); wrap.id='singlePrintCard'; wrap.className='single-print-card';
  const clone=source.cloneNode(true); clone.querySelectorAll('.no-print').forEach(x=>x.remove()); wrap.appendChild(clone); document.body.appendChild(wrap);
  document.body.classList.add('printing-one-card');
  window.print();
  setTimeout(()=>{document.body.classList.remove('printing-one-card');wrap.remove()},500);
};
window.printCards=()=>{
  const ready=S.users.filter(u=>u.is_active&&S.revealedPasswords[u.id]);
  if(!ready.length){alert('لا توجد بطاقات دخول جاهزة للطباعة. استخدم «كلمة مرور جديدة» للحساب المطلوب أولًا.');return;}
  const eligible=S.users.filter(u=>u.is_active).length;
  const missing=eligible-ready.length;
  if(missing>0&&!confirm(`سيتم طباعة ${ready.length} بطاقة دخول جاهزة فقط.\n\nهناك ${missing} حساب نشط بدون كلمة مرور جاهزة، ولن تُطبع بطاقاته.\n\nهل تريد المتابعة؟`))return;
  document.body.classList.add('printing-cards');
  window.print();
  setTimeout(()=>document.body.classList.remove('printing-cards'),500);
};

const PERM_ROLES=[['stage_manager','مدير مرحلة'],['it_officer','مسؤول حاسب'],['counselor','أخصائي اجتماعي']];
const PERM_MODES=[['none','غير مفعّل'],['observer','مراقب'],['active','فعّال']];
function permMode(role,key){return S.rolePerms.find(p=>p.role_type===role&&p.permission_key===key)?.mode||'none'}
function renderPermissions(){$('permissionsTable').innerHTML=`<div class="table-wrap"><table class="data-table"><tr><th>الصلاحية</th>${PERM_ROLES.map(r=>`<th>${esc(r[1])}</th>`).join('')}</tr>${S.permCatalog.map(p=>`<tr><td><b>${esc(p.label_ar)}</b></td>${PERM_ROLES.map(r=>`<td><select data-role="${r[0]}" data-key="${esc(p.key)}" onchange="setRolePermission(this)">${PERM_MODES.map(m=>`<option value="${m[0]}" ${permMode(r[0],p.key)===m[0]?'selected':''}>${m[1]}</option>`).join('')}</select></td>`).join('')}</tr>`).join('')}</table></div>`}
window.setRolePermission=async sel=>{const role=sel.dataset.role,key=sel.dataset.key,mode=sel.value;sel.disabled=true;const {error}=await sb.rpc('set_role_permission',{p_role_type:role,p_permission_key:key,p_mode:mode});sel.disabled=false;if(error)return note('error',error.message);const row=S.rolePerms.find(p=>p.role_type===role&&p.permission_key===key);if(row)row.mode=mode;else S.rolePerms.push({role_type:role,permission_key:key,mode});note('ok','تم حفظ الصلاحية.')}
function openUser(role,u=null){$('modal').hidden=false;$('role').value=role;$('editId').value=u?.id||'';$('modalTitle').textContent=(u?'تعديل ':'إضافة ')+rn(role);$('name').value=u?.full_name||'';$('email').value=u?.email||'';
const isNew=!u;
if($('password')){$('password').value=isNew?generatePassword(12):'';$('password').placeholder=isNew?'كلمة مرور مولَّدة — انسخها الآن':'اتركه فارغًا لعدم التغيير'}
$('pin').value='';

const wa=u?.personal_whatsapp||u?.phone||'';$('personalWa').value=wa;
$('waBox').hidden=false;$('waHint').hidden=role!=='counselor';
$('stagesBox').hidden=role==='counselor';$('classesBox').hidden=role!=='counselor';$('sectionsBox').hidden=role!=='it';
$('stages').innerHTML=S.stages.filter(x=>x.is_active).map(s=>`<label><input type="checkbox" value="${esc(s.id)}" ${u&&scope(u).includes(s.name_ar)?'checked':''}>${esc(s.name_ar)}</label>`).join('');
if(role==='counselor'){
  const assigned=new Set((S.classes||[]).filter(c=>u&&c.counselor_id===u.id).map(c=>`${c.stage_id}|${c.grade}|${c.class_name}`));
  const list=S.availableClasses||[];
  if(!list.length){
    $('classes').innerHTML='<span>لا توجد فصول بعد. ارفع الطلاب أولاً من صفحة الطلاب ثم أعد فتح هذه النافذة.</span>';
  }else{
    $('classes').innerHTML=list.map(c=>{
      const val=`${c.stage_id}|${c.grade}|${c.class_name}`;
      const label=`${c.stage_name||stage(c.stage_id)} — ${c.grade} — ${c.class_name}${c.section&&c.section!=='arabic'?' · '+c.section:''}${c.student_count?` (${c.student_count})`:''}`;
      const checked=assigned.has(val)?'checked':'';
      return`<label><input type="checkbox" value="${esc(val)}" ${checked}>${esc(label)}</label>`;
    }).join('');
  }
}}
function closeUser(){$('modal').hidden=true}window.closeUser=closeUser;
window.openUser=openUser;
window.editUser=id=>openUser(S.users.find(u=>u.id===id)?.role_type,S.users.find(u=>u.id===id));
window.toggleUser=async id=>{
  const u=S.users.find(x=>x.id===id); if(!u)return;
  const goingOff=!!u.is_active;
  if(goingOff){
    if(!confirm('إيقاف حساب «'+u.full_name+'»؟\nلن يتمكن من الدخول، وتبقى المخالفات والتكريمات التي سجّلها محفوظة.'))return;
    try{
      const {data,error}=await sb.functions.invoke('admin-manage-staff',{body:{action:'deactivate',profile_id:id}});
      if(error)throw error;
      if(data?.error)throw new Error(data.error);
      note('ok',data?.note||'تم إيقاف الحساب.');
    }catch(err){return note('error',err.message||String(err))}
  }else{
    try{
      const {data,error}=await sb.functions.invoke('admin-manage-staff',{body:{action:'reactivate',profile_id:id}});
      if(error)throw error;
      if(data?.error)throw new Error(data.error);
      note('ok','تم إعادة تفعيل الحساب.');
    }catch(err){return note('error',err.message||String(err))}
  }
  await boot();
}
$('form').onsubmit=async e=>{e.preventDefault();
const role=$('role').value,id=$('editId').value;
const full_name=$('name').value.trim();
const email=$('email').value.trim().toLowerCase();
const password=($('password')&&$('password').value||'').trim();
const personal_whatsapp=$('personalWa').value.trim();
if(!full_name||!email)return note('error','الاسم والبريد مطلوبان');

// ——— إنشاء مستخدم جديد عبر Edge Function ———
if(!id){
  if(!password||password.length<8)return note('error','كلمة المرور الافتراضية مطلوبة (8 أحرف على الأقل) — اضغط توليد');
  const stage_ids=[...($('stages')?$('stages').querySelectorAll('input:checked'):[])].map(x=>x.value);
  const classes=role==='counselor'
    ?[...($('classes')?$('classes').querySelectorAll('input:checked'):[])].map(x=>{const [stage_id,grade,class_name]=x.value.split('|');return{stage_id,grade,class_name}})
    :[];
  try{
    const {data,error}=await sb.functions.invoke('admin-manage-staff',{body:{
      action:'create',
      full_name,email,role_type:role,password,
      personal_whatsapp:personal_whatsapp||null,
      stage_ids, classes
    }});
    if(error)throw error;
    if(data?.error)throw new Error(data.error);
    if(!data?.ok)throw new Error('فشل إنشاء الحساب');
    const pw=data.password||password;
    S.revealedPasswords[data.profile_id]=pw;
    closeUser();
    note('ok','تم إنشاء الحساب. انسخ كلمة المرور الآن (مرة واحدة): '+pw);
    try{await navigator.clipboard.writeText(pw)}catch(_){}
    alert('تم إنشاء حساب:\n'+data.full_name+'\n'+data.email+'\n\nكلمة المرور الافتراضية:\n'+pw+'\n\nسيُطلب منه تغييرها عند أول دخول.');
    await boot();
  }catch(err){
    note('error',err.message||String(err));
  }
  return;
}

// ——— تعديل مستخدم موجود ———
const {error}=await sb.from('profiles').update({
  full_name, email,
  personal_whatsapp:personal_whatsapp||null,
  phone:personal_whatsapp||null,
  updated_at:new Date().toISOString()
}).eq('id',id);
if(error)return note('error',error.message);

// تحديث كلمة المرور إن أُدخلت
if(password&&password.length>=8){
  try{
    const {data,error:pwErr}=await sb.functions.invoke('admin-manage-staff',{body:{
      action:'reset_password', profile_id:id, password
    }});
    if(pwErr)throw pwErr;
    if(data?.error)throw new Error(data.error);
    if(data?.password)S.revealedPasswords[id]=data.password;
    note('ok','تم حفظ التعديلات وتحديث كلمة المرور. البطاقة جاهزة للطباعة.');
  }catch(err){
    return note('error','حُفظ الملف لكن فشل تحديث كلمة المرور: '+(err.message||err));
  }
}

await sb.from('stage_assignments').delete().eq('profile_id',id);
const st=[...($('stages')?$('stages').querySelectorAll('input:checked'):[])].map(x=>({profile_id:id,stage_id:x.value,assigned_by:S.profile.id}));
if(st.length)await sb.from('stage_assignments').insert(st);
if(role==='counselor'){
  await sb.from('counselor_class_assignments').delete().eq('counselor_id',id);
  const rows=[...($('classes')?$('classes').querySelectorAll('input:checked'):[])].map(x=>{
    const [stage_id,grade,class_name]=x.value.split('|');
    const match=(S.availableClasses||[]).find(c=>c.stage_id===stage_id&&c.grade===grade&&c.class_name===class_name);
    const section=match?.section||'arabic';
    return{counselor_id:id,stage_id,grade,class_name,class_key:stage_id+':'+grade+':'+class_name,section,assigned_by:S.profile.id};
  });
  if(rows.length)await sb.from('counselor_class_assignments').insert(rows);
}
closeUser();
if(!(password&&password.length>=8)) note('ok','تم حفظ التعديلات.');
await boot();
};
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tabs button,.panel').forEach(x=>x.classList.remove('active'));b.classList.add('active');$(b.dataset.tab).classList.add('active')});
$('logout').onclick=async()=>{await sb.auth.signOut();sessionStorage.clear();location.href='index.html'};
if($('btnGenPin'))$('btnGenPin').onclick=()=>{ if($('password')){$('password').value=generatePassword(12); note('ok','تم توليد كلمة مرور.');} };
if($('btnGenPassword'))$('btnGenPassword').onclick=()=>{ $('password').value=generatePassword(12); note('ok','تم توليد كلمة مرور جديدة — انسخها قبل الحفظ.'); };
boot();

/* Excel bulk import/export */
let IMPORT_ROWS=[];

function generatePassword(length){
  // مستوحى من أنظمة الدخول المدرسية: بدون أحرف ملتبسة (0OIl1)
  const len=Math.max(Number(length)||12,10);
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const arr=new Uint32Array(len);
  crypto.getRandomValues(arr);
  let out='';
  for(let i=0;i<len;i++) out+=chars.charAt(arr[i]%chars.length);
  // ضمان تنوع بسيط
  if(!/[A-Z]/.test(out)||!/[a-z]/.test(out)||!/[0-9]/.test(out)) return generatePassword(len);
  return out;
}

const ROLE_VALUES={stage_manager:'مدير مرحلة',it_officer:'مسؤول حاسب',counselor:'أخصائي اجتماعي'};
function downloadBlob(data,name,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function downloadTemplate(){
 const rows=[
  ['role_type','full_name','email','password','stage_names','classes','sections','is_active'],
  ['stage_manager','أحمد محمد','manager@example.com','','المرحلة الابتدائية;المرحلة الإعدادية','','','TRUE'],
  ['it_officer','مسؤول الحاسب','it@example.com','','كل المراحل','','arabic;languages','TRUE'],
  ['counselor','الأخصائي الاجتماعي','counselor@example.com','','المرحلة الإعدادية','المرحلة الإعدادية|أولى إعدادي|1;المرحلة الإعدادية|ثانية إعدادي|2','arabic','TRUE']
 ];
 const instructions=[['الحقل','التعليمات'],['role_type','stage_manager أو it_officer أو counselor'],['full_name','الاسم الكامل'],['password','كلمة مرور الحساب الجديد؛ 8 أحرف على الأقل. لا يتم تصديرها لاحقًا'],['email','البريد الإلكتروني، ويجب أن يكون فريدًا'],['password','اتركه فارغًا إذا كان النظام سيولّد كلمة مرور للحساب الجديد؛ تُلزم بالتغيير عند أول دخول'],['stage_names','أسماء المراحل مفصولة بعلامة ; أو اكتب كل المراحل لمسؤول الحاسب'],['classes','للأخصائي فقط: stage_name|grade|class_name مفصولة بـ ; (ستُطابق بعد وجود الفصول)'],['sections','arabic;languages لمسؤول الحاسب'],['is_active','TRUE أو FALSE']];
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'المستخدمون');XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(instructions),'تعليمات');
 const out=XLSX.write(wb,{bookType:'xlsx',type:'array'});downloadBlob(out,'solouki-users-template.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
function exportUsers(){
 const rows=[['role_type','full_name','email','password','stage_names','classes','sections','is_active']];
 S.users.forEach(u=>{const stages=S.assign.filter(a=>a.profile_id===u.id).map(a=>stage(a.stage_id));const classes=S.classes.filter(c=>c.counselor_id===u.id).map(c=>`${stage(c.stage_id)}|${c.grade}|${c.class_name}`);rows.push([u.role_type,u.full_name,u.email||'','',stages.join(';'),classes.join(';'),u.role_type==='it_officer'?'arabic;languages':'',u.is_active?'TRUE':'FALSE'])});
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'المستخدمون');const out=XLSX.write(wb,{bookType:'xlsx',type:'array'});downloadBlob(out,'solouki-users-export.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
function openImport(){$('importModal').hidden=false;IMPORT_ROWS=[];$('excelFile').value='';$('importSummary').hidden=true;$('importPreview').innerHTML='';$('confirmImport').disabled=true}
function closeImport(){$('importModal').hidden=true}
function norm(v){return String(v??'').trim()}
function validateImportRow(r,i){const errors=[];const role=norm(r.role_type).toLowerCase();const email=norm(r.email);const password=norm(r.password);if(!ROLE_VALUES[role])errors.push('الدور غير صحيح');if(!norm(r.full_name))errors.push('الاسم مطلوب');if(!/^\S+@\S+\.\S+$/.test(email))errors.push('البريد غير صحيح');const isExisting=S.users.some(u=>(u.email||'').toLowerCase()===email.toLowerCase());if(!norm(r.password)&&!isExisting)errors.push('كلمة المرور مطلوبة للحساب الجديد');if(password&&password.length<8)errors.push('كلمة المرور يجب أن تكون 8 أحرف على الأقل');if(role!=='counselor'&&!norm(r.stage_names))errors.push('المرحلة مطلوبة');if(role==='counselor'&&!norm(r.stage_names))errors.push('المرحلة مطلوبة للأخصائي');if(role!=='it_officer'&&norm(r.sections))errors.push('الأقسام لمسؤول الحاسب فقط');return {...r,role_type:role,full_name:norm(r.full_name),email,password,errors,row:i+2}}
async function previewExcel(ev){const f=ev.target.files?.[0];if(!f)return;try{const data=await f.arrayBuffer();const wb=XLSX.read(data,{type:'array'});const ws=wb.Sheets[wb.SheetNames[0]];const raw=XLSX.utils.sheet_to_json(ws,{defval:''});if(!raw.length)throw Error('الملف لا يحتوي على بيانات.');const allowed=['role_type','full_name','email','password','stage_names','classes','sections','is_active'];const missing=allowed.filter(k=>!(k in raw[0]));if(missing.length)throw Error('الأعمدة الناقصة: '+missing.join(', '));IMPORT_ROWS=raw.map(validateImportRow);const seen=new Set();IMPORT_ROWS.forEach(r=>{const k=r.email.toLowerCase();if(seen.has(k))r.errors.push('البريد مكرر داخل الملف');seen.add(k);});const bad=IMPORT_ROWS.filter(r=>r.errors.length).length;renderImportPreview();$('importSummary').innerHTML=`<b>عدد السجلات:</b> ${IMPORT_ROWS.length} &nbsp; <span class="${bad?'bad':'good'}"><b>تحتاج مراجعة:</b> ${bad}</span>`;$('importSummary').hidden=false;$('confirmImport').disabled=bad>0||!IMPORT_ROWS.length}catch(e){note('error',e.message)}}
function renderImportPreview(){const rows=IMPORT_ROWS;const head=['#','الدور','الاسم','البريد','كلمة المرور','المراحل','الفصول','الحالة','الملاحظات'];$('importPreview').innerHTML=`<table class="data-table"><tr>${head.map(x=>`<th>${x}</th>`).join('')}</tr>${rows.map(r=>`<tr class="${r.errors.length?'import-row-error':''}"><td>${r.row}</td><td>${esc(ROLE_VALUES[r.role_type]||r.role_type)}</td><td>${esc(r.full_name)}</td><td dir="ltr">${esc(r.email)}</td><td>${r.password?'موجودة':'—'}</td><td>${esc(r.stage_names)}</td><td>${esc(r.classes)}</td><td>${String(r.is_active).toUpperCase()==='FALSE'?'موقوف':'نشط'}</td><td>${r.errors.length?`<ul class="import-errors">${r.errors.map(esc).map(x=>`<li>${x}</li>`).join('')}</ul>`:'✓ صالح'}</td></tr>`).join('')}</table>`}
async function confirmExcelImport(){if(!IMPORT_ROWS.length||IMPORT_ROWS.some(r=>r.errors.length))return;const {data:{session}}=await sb.auth.getSession();if(!session)return;const payload={rows:IMPORT_ROWS.map(({errors,row,...r})=>({...r,is_active:String(r.is_active).toUpperCase()!=='FALSE'}))};$('confirmImport').disabled=true;$('confirmImport').textContent='جاري الاستيراد...';const {data,error}=await sb.functions.invoke('bulk-user-import',{body:payload});if(error){note('error',error.message);$('confirmImport').disabled=false;$('confirmImport').textContent='تأكيد الاستيراد';return}note('ok',`تم الاستيراد: ${data?.created||0} جديد، ${data?.updated||0} محدث.`); if(window.SoloukiAudit) SoloukiAudit.record('bulk_user_import','profiles',null,{created:data?.created||0,updated:data?.updated||0});closeImport();await boot();
 const issued=(data?.results||[]).filter(r=>r.status==='ok'&&r.password);
 if(issued.length){const byEmail=new Map(S.users.map(u=>[String(u.email||'').toLowerCase(),u.id]));issued.forEach(r=>{const id=byEmail.get(String(r.email||'').toLowerCase());if(id)S.revealedPasswords[id]=r.password});render();document.querySelector('.tabs button[data-tab="cards"]').click();note('ok','كلمات المرور المؤقتة للحسابات الجديدة جاهزة — انسخها أو اطبع البطاقات الآن.')}}
