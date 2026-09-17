/* Solouki 4.62.8 — WhatsApp notification center
 * Distinguishes: (1) access notice, (2) full written warning, (3) warning + escalation steps.
 * Manual sending always reuses the same named WhatsApp window.
 */
(() => {
  const cfg = window.SOLOUKI_CONFIG || {};
  const sb = window.SoloukiDB ? window.SoloukiDB.getClient() : null;
  let profile = null, rows = [], bulkQueue = [], bulkIndex = 0, waWindow = null;
  let sendMode = 'access';
  const WA_WIN = 'solouki_whatsapp';
  const $ = id => document.getElementById(id);
  const note = (id, text, show = true) => { const el=$(id); if(!el)return; el.textContent=text; el.hidden=!show; };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const today = () => { const d=new Date(), p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; };
  const digits = v => String(v ?? '').replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g,'');
  const toWa = v => { let d=digits(v); if(d.startsWith('20'))return d; if(d.startsWith('0'))return '20'+d.slice(1); if(d.length===10)return '20'+d; return d; };
  const waLink = (phone,text) => `https://wa.me/${toWa(phone)}?text=${encodeURIComponent(text||'')}`;

  async function session(){ const r=await SoloukiSession.requireSession({roles:['superadmin','stage_manager','counselor']}); if(!r)return false; profile=r.profile; return true; }
  async function load(){
    if(!await session())return; note('error','',false);
    const {data,error}=await sb.rpc('list_my_whatsapp_notifications',{p_date:today(),p_status:null,p_limit:200});
    if(error){note('error',error.message);return;} rows=data||[]; render(); updateBulkBar();
  }
  async function prepareAll(){
    const b=$('prepareAllBtn'); if(b)b.disabled=true;
    try{ const {data,error}=await sb.rpc('queue_daily_whatsapp_notifications',{p_date:today()}); if(error)throw error; note('ok',data?.[0]?.message||'تم تجهيز الإشعارات.'); await load(); }
    catch(e){note('error',e.message||String(e));} finally{if(b)b.disabled=false;}
  }
  function pendingRows(){return rows.filter(r=>['queued','failed'].includes(r.status));}
  function selectedRows(){return pendingRows().filter(r=>document.querySelector(`[data-select="${CSS.escape(String(r.id))}"]`)?.checked);}

  function getStudentCode(row){return row.student_code||row.code||row.studentCode||'—';}
  function getNationalId(row){return row.national_id||row.nationalId||row.nationalid||'—';}
  function portalUrl(){
    return cfg.guardianUrl || cfg.guardian_url || `${location.origin}${location.pathname.replace(/[^/]*$/,'')}guardian.html`;
  }
  function accessMessage(row){
    const name=row.student_name||'الطالب/الطالبة';
    const code=getStudentCode(row), nid=getNationalId(row);
    return `السلام عليكم ورحمة الله وبركاته،\n\nولي أمر الطالب/ة: ${name}\n\nنحيطكم علماً بأنه تم تسجيل متابعة سلوكية للطالب/ة لدى المدرسة.\n\nللاطلاع على تفاصيل السجل السلوكي والمخالفات والتكريمات والمتابعات، يرجى الدخول إلى نظام سلوكي باستخدام:\n• الرقم القومي: ${nid}\n• كود الطالب: ${code}\n\nرابط الاطلاع: ${portalUrl()}\n\nهذه الرسالة للإخطار فقط، والتفاصيل الكاملة متاحة داخل ملف الطالب في نظام سلوكي.\n\nمع خالص التحية.\nإدارة المدرسة`;
  }
  function fullWarningMessage(row, report, includeEscalation){
    const name=row.student_name||report?.student?.full_name||'الطالب/ة';
    const st=report?.student||{}; const recs=Array.isArray(report?.records)?report.records:[];
    const recent=recs.slice(0,8).map((r,i)=>`${i+1}) ${r.violation_date||'—'} — ${r.violation_label||'مخالفة سلوكية'}${r.degree_id?' — الدرجة '+r.degree_id:''}${r.penalty_label?' — الإجراء: '+r.penalty_label:''}`).join('\n');
    let msg=`السلام عليكم ورحمة الله وبركاته،\n\nولي أمر الطالب/ة: ${name}\nالصف: ${st.grade||row.grade||'—'} — الفصل: ${st.class_name||row.class_name||'—'}\n\nنحيطكم علماً بأنه تم تسجيل المخالفات/المتابعة السلوكية التالية في نظام سلوكي:\n${recent||row.message||'تم تسجيل متابعة سلوكية للطالب/ة.'}\n\nيرجى الاطلاع على التفاصيل والتعاون مع المدرسة في متابعة السلوك وتعديله.`;
    if(includeEscalation){
      const e=report?.escalation||row.escalation||{};
      msg += `\n\nخطوات المتابعة والتصعيد:\n• مستوى المتابعة المقترح: ${e.level||'حسب لائحة المدرسة'}\n• الإجراء المقترح: ${e.suggestion||'تُراجع الحالة مع الأخصائي وإدارة المرحلة وفق اللائحة.'}\n• سبب الاقتراح: ${e.reason||'يُحدد بناءً على تراكم المخالفات والإجراءات السابقة.'}`;
    }
    msg += `\n\nيمكن الاطلاع على السجل الكامل من خلال نظام سلوكي باستخدام الرقم القومي وكود الطالب.\n\nمع خالص التحية،\nإدارة المدرسة`;
    return msg;
  }
  async function composeMessage(row){
    if(sendMode==='access') return accessMessage(row);
    // Enrich the full warning with the same authoritative report used by the student file.
    if(row._report) return fullWarningMessage(row,row._report,sendMode==='warning_escalation');
    if(row.student_id){
      try{
        const {data,error}=await sb.rpc('get_student_behavior_report',{p_student_id:row.student_id});
        if(!error) row._report=data||{};
      }catch(_){/* fallback to queued message */}
    }
    if(!row._report) return `${row.message||''}\n\nللاطلاع على السجل الكامل يرجى استخدام الرقم القومي وكود الطالب داخل نظام سلوكي.`;
    return fullWarningMessage(row,row._report,sendMode==='warning_escalation');
  }
  function openWa(row,text){
    const p=toWa(row.recipient_phone); if(!p||p.length<10){note('error','رقم غير صالح: '+(row.recipient_phone||'—'));return false;}
    const url=waLink(p,text);
    try{ if(!waWindow||waWindow.closed) waWindow=window.open(url,WA_WIN); else {waWindow.location.href=url;waWindow.focus();} }catch(_){waWindow=null;}
    if(!waWindow){note('error','المتصفح منع نافذة واتساب. اسمح بالنوافذ المنبثقة لهذا الموقع ثم أعد المحاولة.');return false;}
    try{waWindow.focus();}catch(_){ }
    return true;
  }
  async function manualOne(row){ const text=await composeMessage(row); if(!openWa(row,text))return; note('ok',`تم فتح واتساب لـ «${row.student_name||''}» بنمط «${modeLabel(sendMode)}». أرسل الرسالة ثم عد إلى سلوكي.`); }
  function modeLabel(m){return m==='access'?'إشعار اطلاع على سلوكي':m==='warning'?'تنبيه كتابي كامل':'تنبيه كتابي + خطوات التصعيد';}

  async function startBulk(){
    const chosen=selectedRows();
    bulkQueue=chosen.length?chosen:pendingRows();
    if(!bulkQueue.length){note('error','حدد طالباً واحداً على الأقل، أو لا توجد إشعارات معلّقة.');return;}
    bulkIndex=0; $('bulkBar').hidden=false; await openBulkCurrent();
  }
  async function openBulkCurrent(){
    if(!bulkQueue.length||bulkIndex>=bulkQueue.length){finishBulk();return;}
    const row=bulkQueue[bulkIndex], text=await composeMessage(row); openWa(row,text); updateBulkBar();
    note('ok',`يدوي ${bulkIndex+1} / ${bulkQueue.length} — «${row.student_name||''}». أرسل الرسالة من WhatsApp ثم اضغط «تم الإرسال، التالي».`);
  }
  async function bulkNext(){bulkIndex++;if(bulkIndex>=bulkQueue.length){finishBulk();return;}await openBulkCurrent();}
  async function bulkPrev(){if(bulkIndex<=0)return;bulkIndex--;await openBulkCurrent();}
  function finishBulk(){bulkQueue=[];bulkIndex=0;$('bulkBar').hidden=true;note('ok','انتهى مسار الإرسال اليدوي. تم إرسال ما أكّدته بنفسك داخل WhatsApp.');updateBulkBar();}
  function updateBulkBar(){
    const prog=$('bulkProgress'),pending=pendingRows().length;
    if(prog)prog.textContent=bulkQueue.length?`النمط: ${modeLabel(sendMode)} — الحالي ${bulkIndex+1} من ${bulkQueue.length} — المتبقي ${Math.max(bulkQueue.length-bulkIndex-1,0)}`:(pending?`${pending} إشعاراً معلّقاً.`:'لا إشعارات معلّقة.');
    if($('bulkNextBtn'))$('bulkNextBtn').disabled=!bulkQueue.length;
    if($('bulkPrevBtn'))$('bulkPrevBtn').disabled=!bulkQueue.length||bulkIndex<=0;
  }
  function statusLabel(s){return ({queued:'مجهز — بانتظار الإرسال اليدوي',sending:'جاري الإرسال',sent:'تم الإرسال (API)',failed:'فشل API — يمكن الفتح يدوياً'}[s]||s);}
  function render(){
    const pending=pendingRows(); $('pendingCount').textContent=pending.length; $('openedCount').textContent=rows.filter(r=>r.status==='sent').length; $('violCount').textContent=rows.reduce((n,r)=>n+(r.violation_count||0),0);
    const list=$('list'); if(!list)return;
    list.innerHTML=rows.length?rows.map(r=>`<article class="notif-item ${r.status==='sent'?'sent':''}">
      <div class="notif-select">${['queued','failed'].includes(r.status)?`<input type="checkbox" data-select="${esc(r.id)}" aria-label="اختيار ${esc(r.student_name||'الطالب')}">`:''}</div>
      <h3>${esc(r.student_name||'—')} <span class="badge-count">${r.violation_count||0} مخالفة</span></h3>
      <div class="notif-meta">${esc(r.grade||'')} ${esc(r.class_name||'')} — ${r.parent_type==='father'?'الأب':'الأم'} — <span dir="ltr">${esc(r.recipient_phone)}</span> — <strong>${esc(statusLabel(r.status))}</strong></div>
      <div class="notif-msg"><b>رسالة الطابور الحالية:</b><br>${esc(r.message)}</div>
      ${r.error_text?`<div class="error-box">${esc(r.error_text)}</div>`:''}
      <div class="notif-actions">${['queued','failed'].includes(r.status)?`<button type="button" class="btn btn-primary" data-manual="${esc(r.id)}">فتح واتساب</button><button type="button" class="btn btn-outline" data-copy="${esc(r.id)}">نسخ النمط الحالي</button>`:''}</div>
    </article>`).join(''):'<div class="empty-state">لم يتم تجهيز إشعارات اليوم بعد. اضغط «تجهيز إشعارات اليوم».</div>';
    rows.forEach(r=>{document.querySelector(`[data-manual="${CSS.escape(String(r.id))}"]`)?.addEventListener('click',()=>manualOne(r));document.querySelector(`[data-copy="${CSS.escape(String(r.id))}"]`)?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(await composeMessage(r));note('ok','تم نسخ الرسالة بالنمط المختار.');}catch(_){note('error','تعذر النسخ.');}});});
    updateSelectAll(); updateBulkBar();
  }
  function updateSelectAll(){const checks=[...document.querySelectorAll('[data-select]')], checked=checks.filter(x=>x.checked).length; if($('selectedCount'))$('selectedCount').textContent=checked; if($('selectAll'))$('selectAll').checked=checks.length>0&&checked===checks.length;}
  function showSender(){const el=$('senderWa');if(el&&profile)el.textContent=profile.personal_whatsapp||profile.whatsapp_phone||profile.phone||'رقم واتساب المستخدم على الجهاز';}
  document.addEventListener('change',e=>{if(e.target.matches('[data-select]'))updateSelectAll();});
  $('selectAll')?.addEventListener('change',e=>document.querySelectorAll('[data-select]').forEach(x=>x.checked=e.target.checked));
  document.querySelectorAll('input[name="sendMode"]').forEach(r=>r.addEventListener('change',()=>{sendMode=r.value; $('modeDescription').textContent=modeDescription(sendMode); updateBulkBar();}));
  function modeDescription(m){return m==='access'?'إشعار مختصر: يطلب من ولي الأمر الاطلاع على سلوكي باستخدام الرقم القومي وكود الطالب. لا نرسل التقرير الكامل.':m==='warning'?'تنبيه كتابي كامل: يرسل نص التنبيه والمخالفات ذات الصلة إلى ولي الأمر.':'تنبيه كتابي كامل مع ملخص خطوات المتابعة والتصعيد المقترحة من ملف الطالب.';}
  $('prepareAllBtn')?.addEventListener('click',prepareAll); $('refreshBtn')?.addEventListener('click',load); $('startBulkBtn')?.addEventListener('click',startBulk); $('bulkNextBtn')?.addEventListener('click',bulkNext); $('bulkPrevBtn')?.addEventListener('click',bulkPrev); $('bulkStopBtn')?.addEventListener('click',finishBulk); $('logout')?.addEventListener('click',()=>SoloukiSession.logout('index.html'));
  load().then(showSender).catch(e=>note('error',e.message||String(e)));
})();
