/* Solouki 4.62.20 — Analytics scope audit + deployment-safe bindings */
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=v=>window.SoloukiUtils?.escapeHtml?SoloukiUtils.escapeHtml(String(v??'')):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtDate=v=>v?new Date(v+'T00:00:00').toLocaleDateString('ar-EG'): '—';
  const fmtNum=v=>Number(v||0).toLocaleString('ar-EG');
  function iso(d){return d.toISOString().slice(0,10)}
  function setLast30(){const to=new Date(),from=new Date();from.setDate(to.getDate()-29);$('fromDate').value=iso(from);$('toDate').value=iso(to)}
  function msg(text){const el=$('analyticsMsg');el.textContent=text||'';el.hidden=!text}
  function renderBars(id,items,labelKey='label'){
    const el=$(id); if(!el)return;
    if(!items.length){el.innerHTML='<div class="empty">لا توجد بيانات في الفترة المحددة.</div>';return}
    const max=Math.max(...items.map(x=>Number(x.count||0)),1);
    el.innerHTML=items.map(x=>`<div class="bar-row"><div class="bar-label" title="${esc(x[labelKey])}">${esc(x[labelKey])}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.max(4,Number(x.count||0)/max*100)}%"></div></div><strong>${fmtNum(x.count)}</strong></div>`).join('')
  }
  function renderDegrees(s){renderBars('degreeBars',[{label:'الدرجة الأولى',count:s.degree_1},{label:'الدرجة الثانية',count:s.degree_2},{label:'الدرجة الثالثة',count:s.degree_3},{label:'الدرجة الرابعة',count:s.degree_4}])}
  let stages=[];
  function stageName(id){const x=stages.find(s=>String(s.id)===String(id));return x?.name||id||'—'}
  function renderClasses(rows){const b=$('classesBody');if(!rows.length){b.innerHTML='<tr><td colspan="6" class="empty">لا توجد بيانات.</td></tr>';return}b.innerHTML=rows.map(r=>`<tr class="card-row"><td data-label="المرحلة">${esc(stageName(r.stage_id))}</td><td data-label="الصف">${esc(r.grade)}</td><td data-label="القسم">${esc(r.section)}</td><td data-label="الفصل">${esc(r.class_name)}</td><td data-label="المخالفات">${fmtNum(r.violations_count)}</td><td data-label="الطلاب">${fmtNum(r.students_count)}</td></tr>`).join('')}
  function renderAttention(rows){const b=$('attentionBody');if(!rows.length){b.innerHTML='<tr><td colspan="7" class="empty">لا توجد حالات متكررة وفق الفترة المحددة.</td></tr>';return}b.innerHTML=rows.map(r=>`<tr class="card-row"><td data-label="الطالب">${esc(r.full_name)}</td><td data-label="الصف/الفصل">${esc(r.grade)} / ${esc(r.class_name)}</td><td data-label="المخالفات">${fmtNum(r.total_count)}</td><td data-label="درجة 2">${fmtNum(r.degree_2)}</td><td data-label="درجة 3">${fmtNum(r.degree_3)}</td><td data-label="درجة 4">${fmtNum(r.degree_4)}</td><td data-label="آخر مخالفة">${fmtDate(r.last_violation_date)}</td></tr>`).join('')}
  function renderData(d){
    const s=d?.summary||{};
    $('totalViolations').textContent=fmtNum(s.total_violations);
    $('studentsWithViolations').textContent=fmtNum(s.students_with_violations);
    $('d1').textContent=fmtNum(s.degree_1); $('d2').textContent=fmtNum(s.degree_2); $('d3').textContent=fmtNum(s.degree_3); $('d4').textContent=fmtNum(s.degree_4);
    renderBars('topViolations',d?.top_violations||[]); renderDegrees(s); renderClasses(d?.classes||[]); renderAttention(d?.attention||[]);
    stages=d?.stages||stages; populateStages(stages,true);
  }
  function populateStages(rows,preserve){
    const current=preserve?$('stageSelect').value:'';
    $('stageSelect').innerHTML='<option value="">كل المراحل المسموح بها</option>'+rows.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
    if(current&&rows.some(s=>String(s.id)===current))$('stageSelect').value=current;
  }
  function renderScopeAudit(a){
    const el=$('scopeAudit'); if(!el)return;
    const raw=Number(a?.raw_period_violations||0), stage=Number(a?.stage_in_scope||0), final=Number(a?.final_in_scope||0);
    const byStage=Number(a?.excluded_by_stage||0), byClass=Number(a?.excluded_by_class||0);
    el.hidden=false;
    el.innerHTML=`<div class="scope-audit-head"><strong>فحص نطاق الصلاحيات</strong><span>${esc(a?.role_type||'—')}</span></div>
      <div class="scope-audit-grid"><div><span>المخالفات في الفترة</span><strong>${fmtNum(raw)}</strong></div><div><span>داخل نطاق المرحلة</span><strong>${fmtNum(stage)}</strong></div><div><span>داخل النطاق النهائي</span><strong>${fmtNum(final)}</strong></div><div><span>مستبعدة بسبب المرحلة</span><strong>${fmtNum(byStage)}</strong></div><div><span>مستبعدة بسبب إسناد الفصل</span><strong>${fmtNum(byClass)}</strong></div></div>
      <p>الفحص تجميعي وآمن: لا يعرض أسماء أو بيانات طلاب خارج نطاق الحساب. يجب أن يساوي «داخل النطاق النهائي» إجمالي التحليلات للفلاتر نفسها.</p>`;
  }
  async function auditScope(){
    msg(''); const from=$('fromDate').value,to=$('toDate').value,stage=$('stageSelect').value||null;
    if(!from||!to)return msg('اختر تاريخ البداية والنهاية أولاً.');
    if(from>to)return msg('تاريخ البداية يجب أن يسبق تاريخ النهاية.');
    $('auditScopeBtn').disabled=true;
    try{
      const {data,error}=await SoloukiDB.sb().rpc('get_behavior_scope_audit_v1',{p_from:from,p_to:to,p_stage_id:stage});
      if(error)throw error;
      renderScopeAudit(data||{});
    }catch(e){
      console.error('[Solouki scope audit]',e);
      msg('تعذر فحص نطاق الصلاحيات. ثبّت ملف SQL الخاص بـ 4.62.19 ثم أعد المحاولة: '+(e?.message||'خطأ غير معروف'));
    }finally{$('auditScopeBtn').disabled=false}
  }
  async function load(){
    msg(''); const from=$('fromDate').value,to=$('toDate').value,stage=$('stageSelect').value||null;
    if(!from||!to)return msg('اختر تاريخ البداية والنهاية.');
    if(from>to)return msg('تاريخ البداية يجب أن يسبق تاريخ النهاية.');
    $('loadBtn').disabled=true;
    try{
      const {data,error}=await SoloukiDB.sb().rpc('get_behavior_analytics_v2',{p_from:from,p_to:to,p_stage_id:stage});
      if(error) throw error;
      renderData(data||{});
      const total=Number(data?.summary?.total_violations||0);
      const raw=Number(data?.diagnostics?.raw_period_violations||0);
      const allowedStages=Number(data?.scope?.allowed_stage_count||0);
      const allowedClasses=data?.scope?.allowed_class_count;
      if(total===0){
        if(raw>0 && (allowedStages===0 || (data?.scope?.role_type==='counselor' && Number(allowedClasses||0)===0))) msg('تم الاتصال بقاعدة البيانات، لكن نطاق صلاحيات الحساب لا يحتوي على مراحل/فصول مسندة حاليًا. لم يتم تجاوز الصلاحيات لعرض البيانات.');
        else if(raw>0) msg('توجد مخالفات في المدرسة ضمن الفترة، لكنها خارج نطاق الحساب الحالي؛ لم يتم عرضها حفاظًا على الصلاحيات.');
        else msg('تم الاتصال بقاعدة البيانات، ولا توجد مخالفات ضمن الفترة/المرحلة المحددة داخل نطاق الحساب.');
      }
    }catch(e){
      console.error('[Solouki analytics]',e);
      msg('تعذر تحميل التحليلات من قاعدة البيانات: '+(e?.message||'خطأ غير معروف'));
    }finally{$('loadBtn').disabled=false}
  }
  async function init(){
    const session=await SoloukiSession.requireSession(); if(!session)return;
    setLast30();
    try{
      const {data,error}=await SoloukiDB.sb().rpc('get_behavior_analytics_v2',{p_from:$('fromDate').value,p_to:$('toDate').value,p_stage_id:null});
      if(error)throw error;
      stages=data?.stages||[]; populateStages(stages,false); renderData(data);
      if(Number(data?.summary?.total_violations||0)===0){
        const raw=Number(data?.diagnostics?.raw_period_violations||0);
        const allowedStages=Number(data?.scope?.allowed_stage_count||0);
        const allowedClasses=data?.scope?.allowed_class_count;
        if(raw>0 && (allowedStages===0 || (data?.scope?.role_type==='counselor' && Number(allowedClasses||0)===0))) msg('تم الاتصال بقاعدة البيانات، لكن لا توجد مرحلة/فصول مسندة لهذا الحساب حاليًا؛ لذلك لم تُعرض بيانات خارج نطاق الصلاحيات.');
        else if(raw>0) msg('توجد مخالفات في المدرسة، لكنها خارج نطاق الحساب الحالي.');
        else msg('تم الاتصال بقاعدة البيانات، ولا توجد مخالفات ضمن آخر 30 يومًا داخل نطاق الحساب الحالي.');
      }
    }catch(e){
      console.error('[Solouki analytics init]',e);
      msg('تبويب التحليلات متصل بقاعدة البيانات، لكن دالة التحليلات تحتاج إلى تثبيت SQL الخاص بـ 4.62.17 (الإصدار الجديد v2): '+(e?.message||'خطأ غير معروف'));
    }
    const loadBtn=$('loadBtn'), auditBtn=$('auditScopeBtn'), lastBtn=$('last30Btn');
    if(loadBtn) loadBtn.onclick=load;
    if(auditBtn) auditBtn.onclick=auditScope;
    if(lastBtn) lastBtn.onclick=()=>{setLast30();load()};
    // Deployment-safe: an older cached HTML page may not contain the scope-audit button.
    // Never let a missing optional control abort the entire analytics page.
    if(!auditBtn) console.warn('[Solouki analytics] Optional scope-audit button is missing from this HTML deployment.');
  }
  init();
})();
