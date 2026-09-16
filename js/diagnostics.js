(function(){
  const $=id=>document.getElementById(id); const checks=$('checks');
  function card(title,state,detail){const el=document.createElement('article');el.className='check-card';el.innerHTML=`<div class="check-top"><span class="check-title">${title}</span><span class="status ${state.cls}">${state.label}</span></div><div class="check-detail">${detail}</div>`;checks.appendChild(el);}
  async function run(){
    checks.innerHTML=''; const results=[];
    const online=navigator.onLine; results.push(['الاتصال بالإنترنت',online?'ok':'fail',online?'متصل':'الجهاز غير متصل بالإنترنت']);
    const cfg=window.SOLOUKI_CONFIG; const cfgOk=!!(cfg&&cfg.SUPABASE_URL&&cfg.SUPABASE_ANON_KEY); results.push(['إعداد Supabase',cfgOk?'ok':'fail',cfgOk?'الرابط ومفتاح anon موجودان.':'الإعدادات ناقصة.']);
    let session=null;
    try { const r=await SoloukiDB.sb().auth.getSession(); session=r.data?.session||null; results.push(['جلسة المصادقة',session?'ok':'warn',session?'جلسة Auth فعالة.':'لا توجد جلسة فعالة.']); } catch(e){results.push(['جلسة المصادقة','fail','تعذر الوصول إلى Auth: '+e.message]);}
    if(session){try{const {data,error}=await SoloukiDB.sb().from('profiles').select('id').eq('id',session.user.id).limit(1); results.push(['قاعدة البيانات / profiles',error?'warn':'ok',error?'تعذر قراءة profiles وفق RLS: '+error.message:'تمت قراءة سجل الملف الشخصي.']);}catch(e){results.push(['قاعدة البيانات / profiles','fail',e.message]);}}
    const sw='serviceWorker' in navigator; let swDetail=sw?'Service Worker مدعوم.':'المتصفح لا يدعم Service Worker.'; let swState=sw?'ok':'warn'; if(sw){try{const regs=await navigator.serviceWorker.getRegistrations(); swState=regs.length?'ok':'warn'; swDetail=regs.length?'Service Worker مسجل.':'لم يتم العثور على تسجيل حالي.';}catch(e){swState='warn';swDetail='تعذر التحقق: '+e.message;}} results.push(['PWA / Service Worker',swState,swDetail]);
    results.push(['نسخة التطبيق','ok','الإصدار '+(cfg?.APP_VERSION||'غير معروف')]);
    const secure=location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1'; results.push(['سياق التشغيل',secure?'ok':'warn',secure?'HTTPS/localhost مناسب لـ PWA.':'يفضل HTTPS أو localhost بدل file://.']);
    results.forEach(([t,s,d])=>card(t,s==='ok'?{cls:'ok',label:'سليم'}:s==='warn'?{cls:'warn',label:'تنبيه'}:{cls:'fail',label:'فشل'},d));
    const bad=results.filter(x=>x[1]==='fail').length, warns=results.filter(x=>x[1]==='warn').length; $('overallStatus').textContent=bad?'يوجد فشل يحتاج معالجة':warns?'النظام يعمل مع تنبيهات':'النظام جاهز'; $('overallStatus').style.color=bad?'#991b1b':warns?'#92400e':'#166534'; $('checkedAt').textContent='آخر فحص: '+new Date().toLocaleString('ar-EG');
  }
  $('runChecks').addEventListener('click',run); run();
})();
