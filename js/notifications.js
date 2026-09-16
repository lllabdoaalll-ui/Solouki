/* Solouki STEP 59 — WhatsApp notification center (Cloud API + manual fallback) */
(() => {
  const cfg = window.SOLOUKI_CONFIG || {};
  const sb = window.SoloukiDB ? window.SoloukiDB.getClient() : null;
  let profile = null;
  let rows = [];
  const $ = id => document.getElementById(id);
  const note = (id, text, show = true) => { const el=$(id); if(!el)return; el.textContent=text; el.hidden=!show; };
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const today = () => new Date().toISOString().slice(0,10);
  const digits = v => String(v??'').replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g,'');
  const toWa = v => { let d=digits(v); if(d.startsWith('20')) return d; if(d.startsWith('0')) return '20'+d.slice(1); return d; };
  const waLink = (phone,text) => `https://wa.me/${toWa(phone)}?text=${encodeURIComponent(text||'')}`;

  async function session() {
    const r = await SoloukiSession.requireSession({ roles:['superadmin','stage_manager','counselor'] });
    if (!r) return false;
    profile = r.profile;
    return true;
  }

  async function load() {
    if (!await session()) return;
    const { data, error } = await sb.rpc('list_my_whatsapp_notifications', { p_date: today(), p_status: null, p_limit: 200 });
    if (error) { note('error', error.message); return; }
    rows = data || [];
    render();
  }

  async function prepareAll() {
    const btn=$('prepareAllBtn'); if(btn)btn.disabled=true;
    try {
      const { data, error } = await sb.rpc('queue_daily_whatsapp_notifications', { p_date: today() });
      if(error) throw error;
      note('ok', data?.[0]?.message || 'تم تجهيز الإشعارات.');
      await load();
    } catch(e) { note('error', e.message || String(e)); }
    finally { if(btn)btn.disabled=false; }
  }

  async function sendOne(row) {
    if (!row?.id) return;
    const btns = document.querySelectorAll(`[data-send="${row.id}"]`); btns.forEach(b=>b.disabled=true);
    try {
      const { data, error } = await sb.functions.invoke('whatsapp-send', { body:{ notification_id: row.id } });
      if(error) throw error;
      if(data?.error) throw new Error(data.error);
      note('ok', 'تم إرسال إشعار WhatsApp بنجاح.');
    } catch(e) {
      // Fallback is explicit and never pretends manual opening is API delivery.
      note('error', e.message || 'تعذر الإرسال الآلي. يمكنك استخدام «فتح WhatsApp» كبديل يدوي.');
    } finally { await load(); }
  }

  async function sendPending() {
    const pending=rows.filter(r=>['queued','failed'].includes(r.status));
    if(!pending.length){ note('ok','لا توجد إشعارات معلقة للإرسال.'); return; }
    if(!confirm(`سيتم إرسال ${pending.length} إشعارًا عبر WhatsApp API. هل تريد المتابعة؟`)) return;
    for(const r of pending) await sendOne(r);
  }

  function manual(row) {
    const p=toWa(row.recipient_phone);
    if(!p){note('error','رقم ولي الأمر غير صالح.');return;}
    window.open(waLink(p,row.message),'solouki_whatsapp');
    note('ok','تم فتح WhatsApp يدويًا. هذا لا يغيّر حالة الإرسال الآلي.');
  }

  function statusLabel(s){ return ({queued:'مجهز للإرسال',sending:'جاري الإرسال',sent:'تم الإرسال',failed:'فشل — يمكن إعادة المحاولة'})[s]||s; }
  function providerLabel(s){ return ({sent:'تم قبول الرسالة',delivered:'تم التسليم',read:'تمت القراءة',failed:'فشل لدى WhatsApp',queued:'بانتظار المزود'})[s]||s||'—'; }
  function render(){
    const sent=rows.filter(r=>r.status==='sent').length, pending=rows.filter(r=>['queued','failed'].includes(r.status)).length;
    $('pendingCount').textContent=pending; $('openedCount').textContent=sent; $('violCount').textContent=rows.reduce((n,r)=>n+(r.violation_count||0),0);
    $('list').innerHTML=rows.length?rows.map(r=>`<article class="notif-item ${r.status==='sent'?'sent':''}">
      <h3>${esc(r.student_name||'—')} <span class="badge-count">${r.violation_count||0} مخالفة</span></h3>
      <div class="notif-meta">${esc(r.grade||'')} ${esc(r.class_name||'')} — ${r.parent_type==='father'?'الأب':'الأم'} — <span dir="ltr">${esc(r.recipient_phone)}</span> — <strong>${esc(statusLabel(r.status))}</strong></div>
      <div class="notif-msg">${esc(r.message)}</div>
      ${r.error_text?`<div class="error-box">${esc(r.error_text)}</div>`:''}
      <div class="notif-actions">
        ${['queued','failed'].includes(r.status)?`<button class="btn btn-primary" data-send="${r.id}">إرسال عبر API</button>`:''}
        ${r.status==='failed'?`<button class="btn btn-outline" data-manual="${r.id}">فتح WhatsApp يدويًا</button>`:''}
        ${r.status==='sent'?`<span class="small-note">${r.sent_at?esc(new Date(r.sent_at).toLocaleString('ar-EG')):''}</span>`:''}
      ${r.provider_status?`<div class="small-note">حالة WhatsApp: <strong>${esc(providerLabel(r.provider_status))}</strong>${r.provider_status_at?' — '+esc(new Date(r.provider_status_at).toLocaleString('ar-EG')):''}</div>`:''}
      </div></article>`).join(''):'<div class="empty-state">لم يتم تجهيز إشعارات اليوم بعد. اضغط «تجهيز إشعارات اليوم».</div>';
    rows.forEach(r=>{document.querySelector(`[data-send="${r.id}"]`)?.addEventListener('click',()=>sendOne(r));document.querySelector(`[data-manual="${r.id}"]`)?.addEventListener('click',()=>manual(r));});
  }

  $('prepareAllBtn').onclick=prepareAll;
  $('sendPendingBtn').onclick=sendPending;
  $('refreshBtn').onclick=load;
  $('logout').onclick=()=>SoloukiSession.logout('index.html');
  load().catch(e=>note('error',e.message||String(e)));
})();
