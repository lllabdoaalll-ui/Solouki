(() => {
  const cfg=window.SOLOUKI_CONFIG||{};
  const sb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
  let sessionResult=null, profile=null, stages=[], settings=[];
  const $=id=>document.getElementById(id);
  const esc=x=>String(x??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const note=(id,t)=>{ $(id).textContent=t; $(id).hidden=false; setTimeout(()=>$(id).hidden=true,4500); };
  const digits=v=>String(v??'').replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g,'');
  const waPhone=v=>{let d=digits(v); if(!d)return ''; if(d.startsWith('20'))return d; if(d.startsWith('0'))return '20'+d.slice(1); return d;};
  const roleLabel=r=>({superadmin:'المسؤول العام',it_officer:'مسؤول الحاسب'})[r]||r;

  async function load(){
    $('list').innerHTML='<div class="empty">جارٍ التحميل...</div>';
    const s=await SoloukiSession.requireSession(); if(!s)return;
    sessionResult=s; profile=s.profile;
    if(!['superadmin','it_officer'].includes(profile.role_type)){
      note('error','هذه الصفحة متاحة للمسؤول العام ومسؤول الحاسب فقط.');
      setTimeout(()=>location.href='dashboard.html',900); return;
    }
    $('userName').textContent=profile.full_name||'—'; $('userRole').textContent=roleLabel(profile.role_type);
    const {data:st,error:stErr}=await sb.from('stages').select('id,name_ar,school_id,is_active,sort_order').eq('school_id',profile.school_id).eq('is_active',true).order('sort_order');
    if(stErr)throw stErr;
    stages=st||[];
    if(profile.role_type==='it_officer'){
      const {data:as,error:asErr}=await sb.from('stage_assignments').select('stage_id').eq('profile_id',profile.id);
      if(asErr)throw asErr;
      const ids=new Set((as||[]).map(x=>x.stage_id)); stages=stages.filter(x=>ids.has(x.id));
    }
    $('stageCount').textContent=stages.length;
    const ids=stages.map(x=>x.id);
    settings=[];
    if(ids.length){const {data,se}=await sb.from('stage_whatsapp_settings').select('stage_id,business_number,phone_number_id,enabled,updated_at').in('stage_id',ids); if(se)throw se; settings=data||[];}
    render();
  }
  function render(){
    if(!stages.length){$('list').innerHTML='<div class="empty">لا توجد مراحل نشطة مسندة إليك حاليًا.</div>';return;}
    $('list').innerHTML=stages.map(st=>{
      const x=settings.find(y=>y.stage_id===st.id)||{};
      return `<article class="wa-card" data-stage="${esc(st.id)}"><h3>${esc(st.name_ar)}</h3><div class="meta">رقم المرسل المعلن للمرحلة وإعداد الربط الرسمي</div><div class="wa-form"><label>رقم WhatsApp Business<input class="business" dir="ltr" inputmode="tel" value="${esc(x.business_number||'')}" placeholder="01xxxxxxxxx أو 201xxxxxxxxx"></label><label>Phone Number ID <input class="phoneid" dir="ltr" value="${esc(x.phone_number_id||'')}" placeholder="اختياري — من Meta/المزوّد الرسمي"></label></div><div class="wa-actions"><label><input class="enabled" type="checkbox" ${x.enabled?'checked':''}> تفعيل إعدادات المرحلة</label><button class="btn btn-primary save">حفظ</button><button class="btn btn-outline test">فتح WhatsApp Web</button><span class="muted">${x.updated_at?'آخر تحديث: '+new Date(x.updated_at).toLocaleString('ar-EG'):'لم يتم الحفظ بعد'}</span></div></article>`;
    }).join('');
    $('list').querySelectorAll('.wa-card').forEach(card=>{
      const id=card.dataset.stage;
      card.querySelector('.save').onclick=()=>save(card,id);
      card.querySelector('.test').onclick=()=>test(card);
    });
  }
  async function save(card,id){
    const business=card.querySelector('.business').value.trim();
    const phoneId=card.querySelector('.phoneid').value.trim();
    const enabled=card.querySelector('.enabled').checked;
    if(enabled&&!waPhone(business))return note('error','أدخل رقم WhatsApp Business صالحًا قبل تفعيل الإعدادات.');
    const {data,error}=await sb.rpc('save_stage_whatsapp_settings',{p_stage_id:id,p_business_number:business,p_phone_number_id:phoneId,p_enabled:enabled});
    if(error){note('error',error.message||'تعذر حفظ الإعدادات');return;}
    const i=settings.findIndex(x=>x.stage_id===id); if(i>=0)settings[i]=data; else settings.push(data);
    note('ok','تم حفظ إعدادات WhatsApp للمرحلة.'); render();
  }
  function test(card){
    const p=waPhone(card.querySelector('.business').value);
    if(!p)return note('error','أدخل رقمًا صالحًا أولًا.');
    const text='اختبار إعداد WhatsApp Business — سلوكي';
    window.open('https://wa.me/'+p+'?text='+encodeURIComponent(text),'solouki_whatsapp_test');
    note('ok','تم تجهيز محادثة اختبار. هذا الاختبار لا يثبت الإرسال الآلي عبر Meta API.');
  }
  $('refresh').onclick=()=>load().catch(e=>note('error',e.message||String(e)));
  $('logout').onclick=async()=>{await sb.auth.signOut();sessionStorage.clear();location.href='index.html';};
  load().catch(e=>note('error',e.message||String(e)));
})();
