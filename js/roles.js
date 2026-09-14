const sb=supabase.createClient(SOLOUKI_CONFIG.SUPABASE_URL,SOLOUKI_CONFIG.SUPABASE_ANON_KEY);
const S={profile:null,stages:[],users:[],assign:[],classes:[],revealedPins:{},permCatalog:[],rolePerms:[]};const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const rn=r=>({stage_manager:'مدير مرحلة',it_officer:'مسؤول حاسب',counselor:'أخصائي اجتماعي'})[r]||r;
function note(id,t){$(id).textContent=t;$(id).hidden=false;setTimeout(()=>$(id).hidden=true,3500)}
async function boot(){const {data:{session}}=await sb.auth.getSession();if(!session)return location.href='index.html';
const p=await sb.from('profiles').select('*').eq('id',session.user.id).eq('is_active',true).single();if(p.error||p.data.role_type!=='superadmin'){alert('المسؤول العام فقط.');return location.href='dashboard.html'}S.profile=p.data;
const a=await Promise.all([sb.from('stages').select('*').eq('school_id',p.data.school_id).order('sort_order'),sb.from('profiles').select('*').eq('school_id',p.data.school_id).in('role_type',['stage_manager','it_officer','counselor']).order('full_name')]);
S.stages=a[0].data||[];S.users=a[1].data||[];const ids=S.stages.map(x=>x.id);
if(ids.length){S.assign=(await sb.from('stage_assignments').select('*').in('stage_id',ids)).data||[];S.classes=(await sb.from('counselor_class_assignments').select('*').in('stage_id',ids)).data||[]}
const permA=await Promise.all([sb.from('permission_catalog').select('*').order('sort_order'),sb.from('role_permissions').select('*')]);S.permCatalog=permA[0].data||[];S.rolePerms=permA[1].data||[];renderPermissions();
render()}
function stage(id){return S.stages.find(x=>x.id===id)?.name_ar||id}
function scope(u){if(u.role_type==='counselor')return S.classes.filter(x=>x.counselor_id===u.id).map(x=>`${stage(x.stage_id)} — ${x.grade} — ${x.class_name}`);return S.assign.filter(x=>x.profile_id===u.id).map(x=>stage(x.stage_id))}
function table(role,id){const us=S.users.filter(x=>x.role_type===role);$(id).innerHTML=`<div class="table-wrap"><table class="data-table"><tr><th>الاسم</th><th>البريد</th><th>النطاق</th><th>الحالة</th><th></th></tr>${us.map(u=>`<tr><td><b>${esc(u.full_name)}</b></td><td dir="ltr">${esc(u.email||'—')}</td><td>${scope(u).map(x=>`<span class="badge">${esc(x)}</span>`).join('')||'—'}</td><td>${u.is_active?'نشط':'موقوف'}</td><td><button class="mini" onclick="editUser('${u.id}')">تعديل</button> <button class="mini" onclick="resetUserPassword('${u.id}')" title="إصدار كلمة مرور جديدة وإلغاء القديمة">كلمة مرور جديدة</button> <button class="mini" onclick="toggleUser('${u.id}')">${u.is_active?'إيقاف':'تفعيل'}</button></td></tr>`).join('')}</table></div>`}
function render(){ $('mCount').textContent=S.users.filter(x=>x.role_type==='stage_manager').length;$('iCount').textContent=S.users.filter(x=>x.role_type==='it_officer').length;$('cCount').textContent=S.users.filter(x=>x.role_type==='counselor').length;$('sCount').textContent=S.stages.filter(x=>x.is_active).length;table('stage_manager','managerList');table('it_officer','itList');table('counselor','counselorList');$('cardsList').innerHTML=S.users.map(u=>`<article class="access-card"><small>سلوكي</small><h3>${esc(u.full_name)}</h3><small>${rn(u.role_type)}</small><div class="pin">${'كلمة مرور الحساب'}</div><small>${scope(u).map(esc).join(' • ')||'لم يُسند بعد'}</small><button type="button" class="mini no-print" onclick="regeneratePin('${u.id}')">إعادة إصدار بيانات الدخول</button></article>`).join('')}

window.resetUserPassword=async id=>{
  const u=S.users.find(x=>x.id===id);if(!u)return;
  const me=S.profile;if(!me||(me.role_type!=='superadmin'&&me.role_type!=='it_officer'))return note('error','غير مصرح');
  if(me.role_type==='it_officer'&&u.role_type==='superadmin')return note('error','لا يمكن لمسؤول الحاسب إعادة تعيين كلمة سر المسؤول العام');
  if(!confirm('سيتم إصدار كلمة مرور جديدة لـ '+u.full_name+' وإلغاء القديمة فورًا. تأكيد؟'))return;
  try{
    const {data,error}=await sb.functions.invoke('admin-reset-password',{body:{profile_id:id}});
    if(error)throw error;
    const payload=data?.error?null:data;
    if(!payload?.ok)throw new Error(data?.error||'فشل إعادة التعيين');
    const pw=payload.password;
    note('ok','كلمة مرور جديدة لـ '+u.full_name+' (انسخها الآن): '+pw);
    try{await navigator.clipboard.writeText(pw);}catch(_){}
    alert('كلمة المرور الجديدة لـ '+u.full_name+':\n\n'+pw+'\n\nلن تظهر مرة أخرى. انسخها وأبلغ المستخدم.');
  }catch(e){
    note('error',(e.message||String(e))+' — تأكد من نشر Edge Function: admin-reset-password');
  }
};

window.regeneratePin=async id=>{const u=S.users.find(x=>x.id===id);if(!u)return;if(!confirm(`سيتم إصدار رقم سري جديد لـ ${u.full_name} فورًا، ولن يمكن استرجاع عرضه لاحقًا إلا بتجديده مجددًا. تأكيد؟`))return;const {data,error}=await sb.rpc('admin_set_profile_pin',{p_profile_id:id});if(error)return note('error',error.message);S.revealedPins[id]=data;render();note('ok','تم إصدار رقم سري جديد. اطبع البطاقة الآن قبل مغادرة الصفحة.')}
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
if(role==='counselor'){$('classes').innerHTML=S.classes.length?S.classes.map(c=>`<label><input type="checkbox" value="${esc(c.stage_id+'|'+c.grade+'|'+c.class_name)}">${esc(stage(c.stage_id)+' — '+c.grade+' — '+c.class_name)}</label>`).join(''):'<span>ستظهر الفصول بعد رفع الطلاب في المرحلة 3.</span>'}}
function closeUser(){$('modal').hidden=true}window.closeUser=closeUser;
window.openUser=openUser;
window.editUser=id=>openUser(S.users.find(u=>u.id===id)?.role_type,S.users.find(u=>u.id===id));
window.toggleUser=async id=>{const u=S.users.find(x=>x.id===id);const {error}=await sb.rpc('set_profile_active',{p_profile_id:id,p_is_active:!u.is_active});if(error)return note('error',error.message);note('ok','تم تحديث حالة الحساب.');await boot()}
$('form').onsubmit=async e=>{e.preventDefault();const role=$('role').value,id=$('editId').value,pin=$('pin').value.trim();if(pin&&!/^[0-9]{6}$/.test(pin))return note('error','PIN يجب أن يكون 6 أرقام، أو اتركه فارغًا.');
if(!id)return note('error','إنشاء مستخدم Auth جديد يحتاج Edge Function آمنة في الخادم. استخدم استيراد Excel لإضافة مستخدم جديد.');
const u=S.users.find(x=>x.id===id);const personal_whatsapp=$('personalWa').value.trim();const {error}=await sb.from('profiles').update({full_name:$('name').value.trim(),email:$('email').value.trim(),personal_whatsapp:personal_whatsapp||null,phone:personal_whatsapp||null,updated_at:new Date().toISOString()}).eq('id',id);if(error)return note('error',error.message);
if(pin){const {data,error:pinErr}=await sb.rpc('admin_set_profile_pin',{p_profile_id:id,p_pin:pin});if(pinErr)return note('error',pinErr.message);S.revealedPins[id]=data}
await sb.from('stage_assignments').delete().eq('profile_id',id);const st=[...$('stages').querySelectorAll('input:checked')].map(x=>({profile_id:id,stage_id:x.value,assigned_by:S.profile.id}));if(st.length)await sb.from('stage_assignments').insert(st);
if(role==='counselor'){await sb.from('counselor_class_assignments').delete().eq('counselor_id',id);const rows=[...$('classes').querySelectorAll('input:checked')].map(x=>{const [stage_id,grade,class_name]=x.value.split('|');return{counselor_id:id,stage_id,grade,class_name,class_key:stage_id+':'+grade+':'+class_name,section:'arabic',assigned_by:S.profile.id}});if(rows.length)await sb.from('counselor_class_assignments').insert(rows)}
closeUser();note('ok',pin?'تم حفظ التعديلات وإصدار رقم سري جديد — اطبع بطاقته من تبويب بطاقات الدخول.':'تم حفظ التعديلات.');await boot()};
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tabs button,.panel').forEach(x=>x.classList.remove('active'));b.classList.add('active');$(b.dataset.tab).classList.add('active')});
$('logout').onclick=async()=>{await sb.auth.signOut();sessionStorage.clear();location.href='index.html'};
if($('btnGenPin'))$('btnGenPin').onclick=()=>{ $('pin').value=generateRandomPin(6); note('ok','تم توليد PIN جديد.'); };
if($('btnGenPassword'))$('btnGenPassword').onclick=()=>{ $('password').value=generatePassword(12); note('ok','تم توليد كلمة مرور جديدة — انسخها قبل الحفظ.'); };
boot();

/* Excel bulk import/export */
let IMPORT_ROWS=[];

/* توليد PIN وكلمة مرور — مستوحى من نظام الرصد مع تكييف لسلوكي (PIN رقمي 6) */
function generateRandomPin(length){
  const len=Math.max(Number(length)||6,6);
  const used=new Set(Object.values(S.revealedPins||{}).map(String));
  // أرقام ضعيفة ممنوعة
  const weak=new Set(['000000','111111','123456','654321','121212','112233']);
  for(let attempt=0;attempt<40;attempt++){
    let out='';
    const arr=new Uint32Array(len);
    crypto.getRandomValues(arr);
    for(let i=0;i<len;i++) out+=String(arr[i]%10);
    if(weak.has(out)||used.has(out)) continue;
    return out;
  }
  // احتياطي
  return String(Math.floor(100000+Math.random()*900000));
}
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
  ['role_type','full_name','email','password','pin','stage_names','classes','sections','is_active'],
  ['stage_manager','أحمد محمد','manager@example.com','TempPass123!','123456','المرحلة الابتدائية;المرحلة الإعدادية','','','TRUE'],
  ['it_officer','مسؤول الحاسب','it@example.com','TempPass234!','234567','كل المراحل','','arabic;languages','TRUE'],
  ['counselor','الأخصائي الاجتماعي','counselor@example.com','TempPass345!','345678','المرحلة الإعدادية','المرحلة الإعدادية|أولى إعدادي|1;المرحلة الإعدادية|ثانية إعدادي|2','arabic','TRUE']
 ];
 const instructions=[['الحقل','التعليمات'],['role_type','stage_manager أو it_officer أو counselor'],['full_name','الاسم الكامل'],['password','كلمة مرور الحساب الجديد؛ 8 أحرف على الأقل. لا يتم تصديرها لاحقًا'],['email','البريد الإلكتروني، ويجب أن يكون فريدًا'],['pin','6 أرقام للحساب الجديد؛ اتركه فارغًا عند تعديل حساب قائم للاحتفاظ برقمه الحالي'],['stage_names','أسماء المراحل مفصولة بعلامة ; أو اكتب كل المراحل لمسؤول الحاسب'],['classes','للأخصائي فقط: stage_name|grade|class_name مفصولة بـ ; (ستُطابق بعد وجود الفصول)'],['sections','arabic;languages لمسؤول الحاسب'],['is_active','TRUE أو FALSE']];
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'المستخدمون');XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(instructions),'تعليمات');
 const out=XLSX.write(wb,{bookType:'xlsx',type:'array'});downloadBlob(out,'solouki-users-template.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
function exportUsers(){
 const rows=[['role_type','full_name','email','password','pin','stage_names','classes','sections','is_active']];
 S.users.forEach(u=>{const stages=S.assign.filter(a=>a.profile_id===u.id).map(a=>stage(a.stage_id));const classes=S.classes.filter(c=>c.counselor_id===u.id).map(c=>`${stage(c.stage_id)}|${c.grade}|${c.class_name}`);rows.push([u.role_type,u.full_name,u.email||'','','',stages.join(';'),classes.join(';'),u.role_type==='it_officer'?'arabic;languages':'',u.is_active?'TRUE':'FALSE'])});
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'المستخدمون');const out=XLSX.write(wb,{bookType:'xlsx',type:'array'});downloadBlob(out,'solouki-users-export.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
function openImport(){$('importModal').hidden=false;IMPORT_ROWS=[];$('excelFile').value='';$('importSummary').hidden=true;$('importPreview').innerHTML='';$('confirmImport').disabled=true}
function closeImport(){$('importModal').hidden=true}
function norm(v){return String(v??'').trim()}
function validateImportRow(r,i){const errors=[];const role=norm(r.role_type).toLowerCase();const email=norm(r.email);const pin=norm(r.pin);const password=norm(r.password);if(!ROLE_VALUES[role])errors.push('الدور غير صحيح');if(!norm(r.full_name))errors.push('الاسم مطلوب');if(!/^\S+@\S+\.\S+$/.test(email))errors.push('البريد غير صحيح');const isExisting=S.users.some(u=>(u.email||'').toLowerCase()===email.toLowerCase());if(pin&&!/^\d{6}$/.test(pin))errors.push('PIN يجب أن يكون 6 أرقام أو فارغًا للاحتفاظ بالرقم الحالي');if(!pin&&!isExisting)errors.push('PIN مطلوب للحساب الجديد');if(!norm(r.is_active)){} if(!norm(r.password)&&!isExisting)errors.push('كلمة المرور مطلوبة للحساب الجديد');if(password&&password.length<8)errors.push('كلمة المرور يجب أن تكون 8 أحرف على الأقل');if(role!=='counselor'&&!norm(r.stage_names))errors.push('المرحلة مطلوبة');if(role==='counselor'&&!norm(r.stage_names))errors.push('المرحلة مطلوبة للأخصائي');if(role!=='it_officer'&&norm(r.sections))errors.push('الأقسام لمسؤول الحاسب فقط');return {...r,role_type:role,full_name:norm(r.full_name),email,password,pin,errors,row:i+2}}
async function previewExcel(ev){const f=ev.target.files?.[0];if(!f)return;try{const data=await f.arrayBuffer();const wb=XLSX.read(data,{type:'array'});const ws=wb.Sheets[wb.SheetNames[0]];const raw=XLSX.utils.sheet_to_json(ws,{defval:''});if(!raw.length)throw Error('الملف لا يحتوي على بيانات.');const allowed=['role_type','full_name','email','password','pin','stage_names','classes','sections','is_active'];const missing=allowed.filter(k=>!(k in raw[0]));if(missing.length)throw Error('الأعمدة الناقصة: '+missing.join(', '));IMPORT_ROWS=raw.map(validateImportRow);const seen=new Set();IMPORT_ROWS.forEach(r=>{const k=r.email.toLowerCase();if(seen.has(k))r.errors.push('البريد مكرر داخل الملف');seen.add(k);});const bad=IMPORT_ROWS.filter(r=>r.errors.length).length;renderImportPreview();$('importSummary').innerHTML=`<b>عدد السجلات:</b> ${IMPORT_ROWS.length} &nbsp; <span class="${bad?'bad':'good'}"><b>تحتاج مراجعة:</b> ${bad}</span>`;$('importSummary').hidden=false;$('confirmImport').disabled=bad>0||!IMPORT_ROWS.length}catch(e){note('error',e.message)}}
function renderImportPreview(){const rows=IMPORT_ROWS;const head=['#','الدور','الاسم','البريد','كلمة المرور','المراحل','الفصول','الحالة','الملاحظات'];$('importPreview').innerHTML=`<table class="data-table"><tr>${head.map(x=>`<th>${x}</th>`).join('')}</tr>${rows.map(r=>`<tr class="${r.errors.length?'import-row-error':''}"><td>${r.row}</td><td>${esc(ROLE_VALUES[r.role_type]||r.role_type)}</td><td>${esc(r.full_name)}</td><td dir="ltr">${esc(r.email)}</td><td>${r.password?'موجودة':'—'}</td><td>${esc(r.stage_names)}</td><td>${esc(r.classes)}</td><td>${String(r.is_active).toUpperCase()==='FALSE'?'موقوف':'نشط'}</td><td>${r.errors.length?`<ul class="import-errors">${r.errors.map(esc).map(x=>`<li>${x}</li>`).join('')}</ul>`:'✓ صالح'}</td></tr>`).join('')}</table>`}
async function confirmExcelImport(){if(!IMPORT_ROWS.length||IMPORT_ROWS.some(r=>r.errors.length))return;const {data:{session}}=await sb.auth.getSession();if(!session)return;const payload={rows:IMPORT_ROWS.map(({errors,row,...r})=>({...r,is_active:String(r.is_active).toUpperCase()!=='FALSE'}))};$('confirmImport').disabled=true;$('confirmImport').textContent='جاري الاستيراد...';const {data,error}=await sb.functions.invoke('bulk-user-import',{body:payload});if(error){note('error',error.message);$('confirmImport').disabled=false;$('confirmImport').textContent='تأكيد الاستيراد';return}note('ok',`تم الاستيراد: ${data?.created||0} جديد، ${data?.updated||0} محدث.`);closeImport();await boot();
 const issued=(data?.results||[]).filter(r=>r.status==='ok'&&r.pin);
 if(issued.length){const byEmail=new Map(S.users.map(u=>[String(u.email||'').toLowerCase(),u.id]));issued.forEach(r=>{const id=byEmail.get(String(r.email||'').toLowerCase());if(id)S.revealedPins[id]=r.pin});render();document.querySelector('.tabs button[data-tab="cards"]').click();note('ok','بطاقات الأرقام السرية الجديدة جاهزة للطباعة الآن — لن تظهر مرة أخرى بعد مغادرة الصفحة.')}}
