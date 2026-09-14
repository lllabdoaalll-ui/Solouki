(() => {
  const cfg = window.SOLOUKI_CONFIG || {};
  const hasSupabase = cfg.SUPABASE_ANON_KEY && !String(cfg.SUPABASE_ANON_KEY).includes('REPLACE_WITH');
  const sb = hasSupabase && window.supabase ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  const DEMO_KEY = 'solouki_phase3_students_demo';
  // معرفات مطابقة لجدول stages في القاعدة (لا تستخدم primary/kg العارية)
  const FIXED_CLOUD_STAGES = [
    { id: 'stage_kg_ar', name: 'رياض أطفال عربي', name_ar: 'رياض أطفال عربي', section: 'arabic', stage_type: 'kg' },
    { id: 'stage_kg_lang', name: 'رياض أطفال لغات', name_ar: 'رياض أطفال لغات', section: 'languages', stage_type: 'kg' },
    { id: 'stage_primary_ar', name: 'ابتدائي عربي', name_ar: 'ابتدائي عربي', section: 'arabic', stage_type: 'primary' },
    { id: 'stage_primary_lang', name: 'ابتدائي لغات', name_ar: 'ابتدائي لغات', section: 'languages', stage_type: 'primary' },
    { id: 'stage_prep_ar', name: 'إعدادى عربي', name_ar: 'إعدادى عربي', section: 'arabic', stage_type: 'prep' },
    { id: 'stage_prep_lang', name: 'إعدادى لغات', name_ar: 'إعدادى لغات', section: 'languages', stage_type: 'prep' },
    { id: 'stage_secondary_ar', name: 'ثانوي عربي', name_ar: 'ثانوي عربي', section: 'arabic', stage_type: 'secondary' },
    { id: 'stage_secondary_lang', name: 'ثانوي لغات', name_ar: 'ثانوي لغات', section: 'languages', stage_type: 'secondary' }
  ];
  const GRADES_BY_TYPE = {
    kg: ['KG1', 'KG2', 'KG3', 'بستان', 'تمهيدي'],
    primary: ['الأول الابتدائي','الثاني الابتدائي','الثالث الابتدائي','الرابع الابتدائي','الخامس الابتدائي','السادس الابتدائي'],
    prep: ['الأول الإعدادي','الثاني الإعدادي','الثالث الإعدادي'],
    secondary: ['الأول الثانوي','الثاني الثانوي','الثالث الثانوي']
  };
  const STAGE_OPTIONS = FIXED_CLOUD_STAGES.map(s => ({
    id: s.id,
    name: s.name,
    section: s.section,
    stage_type: s.stage_type,
    grades: GRADES_BY_TYPE[s.stage_type] || []
  }));
  // للتوافق مع تبويب WhatsApp
  const STAGES = STAGE_OPTIONS.map(s => s.name);
  const HEADERS = ['الرقم القومي','كود الطالب','اسم الطالب','النوع','الصف','القسم','الفصل','رقم التليفون الأب','رقم تليفون الأم'];
  const MERGE_FIELDS = ['student_code','full_name','gender','grade','section','class','father_phone','mother_phone'];
  const FIELD_LABELS = {
    student_code: 'كود الطالب',
    full_name: 'اسم الطالب',
    gender: 'النوع',
    grade: 'الصف',
    section: 'القسم',
    class: 'الفصل',
    father_phone: 'رقم الأب',
    mother_phone: 'رقم الأم'
  };

  let current = [];
  let pending = null;
  let selectedFile = null;   // الملف المختار قبل المعالجة
  let parsedRaw = null;      // نتيجة parse قبل الدمج

  const $ = id => document.getElementById(id);
  const msg = (id, text, show = true) => { $(id).textContent = text; $(id).hidden = !show; };

  let lastSyncAt = null;
  let lastSyncDetail = '';

  function setPill(id, text, kind) {
    const el = $(id);
    if (!el) return;
    el.textContent = text;
    el.className = 'sync-pill ' + (kind || 'sync-unknown');
  }

  function setSyncStatus({ net, db, detail }) {
    if (net === 'online') setPill('syncNet', 'الاتصال: متصل ✓', 'sync-ok');
    else if (net === 'offline') setPill('syncNet', 'الاتصال: غير متصل', 'sync-bad');
    else setPill('syncNet', 'الاتصال: …', 'sync-unknown');

    if (db === 'ok') setPill('syncDb', 'قاعدة البيانات: متصلة ✓', 'sync-ok');
    else if (db === 'fail') setPill('syncDb', 'قاعدة البيانات: غير متاحة', 'sync-bad');
    else if (db === 'local') setPill('syncDb', 'قاعدة البيانات: وضع محلي', 'sync-warn');
    else setPill('syncDb', 'قاعدة البيانات: جاري الفحص…', 'sync-unknown');

    if (detail) lastSyncDetail = detail;
    if (lastSyncAt) {
      const when = lastSyncAt.toLocaleString('ar-EG');
      setPill('syncLast', 'آخر مزامنة: ' + when + (lastSyncDetail ? ' — ' + lastSyncDetail : ''), 'sync-muted');
    } else {
      setPill('syncLast', 'آخر مزامنة: —', 'sync-muted');
    }
  }

  async function refreshConnectionStatus() {
    const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
    if (!sb) {
      setSyncStatus({ net: online ? 'online' : 'offline', db: 'local' });
      return;
    }
    if (!online) {
      setSyncStatus({ net: 'offline', db: 'fail' });
      return;
    }
    setSyncStatus({ net: 'online', db: 'unknown' });
    try {
      const { data, error } = await sb.from('stages').select('id').limit(1);
      if (error) {
        console.warn('sync check', error.message);
        setSyncStatus({ net: 'online', db: 'fail' });
      } else {
        setSyncStatus({ net: 'online', db: 'ok' });
      }
    } catch (e) {
      console.warn('sync check', e);
      setSyncStatus({ net: 'online', db: 'fail' });
    }
  }

  function updateSectionDisplay() {
    const sec = $('importSection');
    const disp = $('sectionDisplay');
    if (!sec || !disp) return;
    const v = sec.value;
    if (v === 'arabic') disp.textContent = 'عربي';
    else if (v === 'languages') disp.textContent = 'لغات';
    else disp.textContent = 'يُحدد من المرحلة';
  }

  function normalize(v) {
    return String(v ?? '').replace(/[\u200e\u200f]/g, '').trim();
  }
  function digits(v) {
    let s = normalize(v);
    // Excel قد يحوّل الرقم القومي إلى Scientific Notation مثل 2.73011E+13
    if (/e\+?/i.test(s)) {
      const n = Number(String(v).trim().replace(/,/g, ''));
      if (Number.isFinite(n) && n > 0) s = n.toFixed(0);
    }
    return s
      .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
      .replace(/\D/g, '');
  }
  function gender(v) {
    // للعرض والمعالجة الداخلية بالعربية
    v = normalize(v).toLowerCase();
    if (['ذكر','ولد','male','m'].includes(v)) return 'ذكر';
    if (['أنثى','انثى','بنت','female','f'].includes(v)) return 'أنثى';
    return normalize(v);
  }
  function genderToDb(v) {
    // قاعدة البيانات: CHECK (gender IN ('M','F'))
    const g = gender(v);
    if (g === 'ذكر' || g === 'M' || g === 'm') return 'M';
    if (g === 'أنثى' || g === 'F' || g === 'f') return 'F';
    // احتياطي من الرقم القومي: خانة الترتيب (الرقم قبل الأخير غالبًا) — فردي ذكر
    const nid = digits(v);
    if (nid.length === 14) {
      const orderDigit = parseInt(nid[12], 10);
      if (!Number.isNaN(orderDigit)) return orderDigit % 2 === 1 ? 'M' : 'F';
    }
    return null;
  }
  function genderFromDb(v) {
    if (v === 'M' || v === 'm' || v === 'ذكر') return 'ذكر';
    if (v === 'F' || v === 'f' || v === 'أنثى' || v === 'انثى') return 'أنثى';
    return gender(v) || '';
  }
  function sectionToDb(v, fallback) {
    // القاعدة: CHECK (section IN ('arabic', 'languages'))
    const s = normalize(v).toLowerCase();
    if (s === 'arabic' || s.includes('عربي') || s.includes('عربى')) return 'arabic';
    if (s === 'languages' || s.includes('لغات') || s.includes('لغة') || s.includes('lang')) return 'languages';
    if (fallback === 'arabic' || fallback === 'languages') return fallback;
    return null;
  }
  function sectionFromDb(v) {
    if (v === 'arabic') return 'عربي';
    if (v === 'languages') return 'لغات';
    return normalize(v);
  }
  function phone(v) {
    const d = digits(v);
    if (!d) return '';
    if (d.startsWith('20')) return d;
    if (d.startsWith('0')) return '20' + d.slice(1);   // 01xxxxxxxxx → 201xxxxxxxxx
    if (d.length === 10) return '20' + d;
    return d;
  }
  function validPhone(v) {
    const d = phone(v);
    if (!d) return true; // فارغ مسموح — يُفرض وجود رقم واحد على الأقل عند الحاجة
    return /^201[0125][0-9]{8}$/.test(d);
  }
  function validNational(v) {
    return /^\d{14}$/.test(digits(v));
  }
  function studentKey(s) {
    return digits(s.national_id);
  }

  function currentAcademicYear() {
    // العام الدراسي المصري تقريبًا: من أغسطس يبدأ العام الجديد
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1; // 1-12
    const start = m >= 8 ? y : y - 1;
    return start + '/' + (start + 1);
  }

  function getImportScope() {
    const stageId = $('importStage')?.value || '';
    let section = $('importSection')?.value || '';
    const grade = $('importGrade')?.value || '';
    // احتياطي: إن كانت القائمة معطّلة أو فارغة نأخذ القسم من المرحلة السحابية
    if (!section && stageId) {
      const opt = $('importStage')?.selectedOptions?.[0];
      const ds = opt?.getAttribute('data-section') || '';
      if (ds === 'arabic' || ds === 'languages') section = ds;
    }
    const cloud = cloudStages.find(s => String(s.id) === String(stageId));
    const local = STAGE_OPTIONS.find(s => s.id === stageId);
    const stageName = cloud
      ? (cloud.name_ar || cloud.name || stageId)
      : (local ? local.name : ($('importStage')?.selectedOptions[0]?.textContent || stageId));
    return {
      stageId,
      stageName,
      section,
      sectionLabel: section === 'languages' ? 'لغات' : (section === 'arabic' ? 'عربي' : ''),
      grade
    };
  }


  function setImportStep(n) {
    document.querySelectorAll('#importSteps .up-step-pill').forEach(el => {
      const s = Number(el.getAttribute('data-step'));
      el.classList.remove('is-active', 'is-done');
      if (s < n) el.classList.add('is-done');
      else if (s === n) el.classList.add('is-active');
    });
  }

  function scopeOk() {
    const sc = getImportScope();
    return !!(sc.stageId && sc.section && sc.grade);
  }

  function studentInScope(s, sc) {
    if (!sc || !sc.stageId) return true;
    // مطابقة مرنة: بالصف المختار + القسم إن وُجد
    const g = normalize(s.grade || s.stage || '');
    const sec = normalize(s.section || '');
    const gradeMatch = !sc.grade || g === normalize(sc.grade) || g.includes(normalize(sc.grade)) || normalize(sc.grade).includes(g);
    let sectionMatch = true;
    if (sc.section === 'arabic') {
      sectionMatch = !sec || sec.includes('عربي') || sec.toLowerCase() === 'arabic' || sec === 'قسم عربى' || sec === 'قسم عربي';
    } else if (sc.section === 'languages') {
      sectionMatch = !sec || sec.includes('لغات') || sec.toLowerCase() === 'languages' || sec.includes('لغة');
    }
    return gradeMatch && sectionMatch;
  }

  let cloudStages = []; // من Supabase إن وُجدت

  function safeStorageToken(str) {
    try {
      const utf8 = unescape(encodeURIComponent(String(str || 'x')));
      return btoa(utf8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch {
      return String(str || 'x').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    }
  }

  function workbookStorageKey(scope, fileName) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeName = safeStorageToken((fileName || 'roster').replace(/\.xlsx?$/i, ''));
    return [
      safeStorageToken(scope.stageId || scope.stageName || 'stage'),
      safeStorageToken(scope.section || 'sec'),
      safeStorageToken(scope.grade || 'grade'),
      stamp + '_' + safeName + '.xlsx'
    ].join('/');
  }

  async function uploadWorkbookToCloud(file, scope) {
    if (!sb || !file) return null;
    const path = workbookStorageKey(scope, file.name);
    try {
      const { error } = await sb.storage.from('student-files').upload(path, file, {
        upsert: true,
        contentType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      if (error) {
        console.warn('storage upload:', error.message);
        // فشل رفع ملف Excel فقط — لا يعني فشل حفظ صفوف الطلاب
        console.warn('storage upload failed:', error.message);
        return null;
      }
      return path;
    } catch (e) {
      console.warn(e);
      return null;
    }
  }

  function fillImportSelectorsFromLocal() {
    const st = $('importStage');
    const gr = $('importGrade');
    const sec = $('importSection');
    if (!st || !gr) return;
    cloudStages = FIXED_CLOUD_STAGES.map(s => ({ ...s, is_active: true }));
    st.innerHTML = '<option value="">— اختر المرحلة —</option>' +
      STAGE_OPTIONS.map(s => {
        const secLabel = s.section === 'languages' ? 'لغات' : 'عربي';
        return `<option value="${s.id}" data-section="${s.section}" data-type="${s.stage_type}">${s.name} — ${secLabel}</option>`;
      }).join('');
    gr.innerHTML = '<option value="">— اختر الصف —</option>';
    st.onchange = () => {
      const stage = STAGE_OPTIONS.find(s => s.id === st.value);
      const opt = st.selectedOptions[0];
      const section = opt?.getAttribute('data-section') || stage?.section || '';
      if (sec && (section === 'arabic' || section === 'languages')) {
        sec.value = section;
      }
      updateSectionDisplay();
      const grades = stage?.grades || GRADES_BY_TYPE[opt?.getAttribute('data-type')] || [];
      gr.innerHTML = '<option value="">— اختر الصف —</option>' +
        grades.map(g => `<option value="${g}">${g}</option>`).join('');
    };
  }

  async function fillImportSelectors() {
    const st = $('importStage');
    const gr = $('importGrade');
    const sec = $('importSection');
    if (!st || !gr) return;

    // محاولة جلب المراحل من Supabase
    if (sb) {
      try {
        const { data, error } = await sb.from('stages')
          .select('id,name_ar,name,section,stage_type,sort_order,is_active')
          .order('sort_order');
        if (!error && data && data.length) {
          cloudStages = data.filter(s => s.is_active !== false);
          st.innerHTML = '<option value="">— اختر المرحلة —</option>' +
            cloudStages.map(s => {
              const label = s.name_ar || s.name || s.id;
              const secLabel = s.section === 'languages' ? 'لغات' : (s.section === 'arabic' ? 'عربي' : (s.section || ''));
              return `<option value="${s.id}" data-section="${s.section || ''}" data-type="${s.stage_type || ''}">${label}${secLabel ? ' — ' + secLabel : ''}</option>`;
            }).join('');
          st.onchange = () => {
            const opt = st.selectedOptions[0];
            const type = opt?.getAttribute('data-type') || '';
            const section = opt?.getAttribute('data-section') || '';
            // القسم مرتبط بالمرحلة السحابية (عربي/لغات) — يُضبط تلقائيًا ويُوضَّح للمستخدم
            if (sec) {
              if (section === 'languages' || section === 'arabic') sec.value = section;
              else if (!sec.value) sec.value = '';
            }
            updateSectionDisplay();
            const grades = GRADES_BY_TYPE[type] ||
              STAGE_OPTIONS.find(s => s.id === (opt?.value || ''))?.grades ||
              STAGE_OPTIONS.flatMap(s => s.grades);
            gr.innerHTML = '<option value="">— اختر الصف —</option>' +
              grades.map(g => `<option value="${g}">${g}</option>`).join('');
          };
          return;
        }
      } catch (e) {
        console.warn('stages cloud load failed', e);
      }
    }
    fillImportSelectorsFromLocal();
  }

  function fillImportSelectors_legacy_unused() {
    fillImportSelectorsFromLocal();
  }

  function currentScoped() {
    const sc = getImportScope();
    if (!scopeOk()) return current.filter(s => s.is_active !== false);
    return current.filter(s => s.is_active !== false && studentInScope(s, sc));
  }


  function loadDemo() {
    try { return JSON.parse(localStorage.getItem(DEMO_KEY) || '[]'); } catch { return []; }
  }
  function saveDemo() {
    localStorage.setItem(DEMO_KEY, JSON.stringify(current));
  }
  function seedIfEmpty() {
    current = loadDemo();
    if (!current.length) {
      current = [{
        id: 'demo-1',
        national_id: '27301121400377',
        student_code: '123456',
        full_name: 'احمد الشافعى',
        gender: 'ذكر',
        grade: 'الأول الابتدائى',
        stage: 'الصف الأول الابتدائي',
        section: 'قسم لغات',
        class: '1/1',
        father_phone: '201113677693',
        mother_phone: '201557907995',
        is_active: true
      }];
      saveDemo();
    }
  }

  async function loadCurrent() {
    if (!sb) {
      seedIfEmpty();
      renderStats();
      if ($('roster') && !$('roster').hidden) renderRoster();
      return;
    }
    // جلب مرن: إن نقص عمود في القاعدة نحاول select * ثم نسقط الأعمدة الناقصة
    let data = null;
    let error = null;
    const preferred =
      'id,national_id,student_code,full_name,gender,grade,stage_id,stage_name,section,class_name,father_phone,mother_phone,is_active,status,seat_number,guardian_phone';
    ({ data, error } = await sb.from('students').select(preferred));
    if (error && /column .* does not exist/i.test(error.message || '')) {
      console.warn('students select preferred failed, fallback to *', error.message);
      ({ data, error } = await sb.from('students').select('*'));
    }
    if (error) {
      msg('error', 'تعذر تحميل الطلاب من Supabase: ' + error.message +
        ' — نفّذ sql/phase4-step42-students-columns.sql في محرر SQL إن كان العمود ناقصًا.');
      return;
    }
    current = (data || []).map(s => ({
      id: s.id,
      national_id: s.national_id,
      student_code: s.student_code || s.seat_number || '',
      full_name: s.full_name,
      gender: genderFromDb(s.gender),
      grade: s.grade,
      stage: s.stage_name || s.grade,
      section: sectionFromDb(s.section),
      class: s.class_name || s.class || '',
      father_phone: s.father_phone || s.guardian_phone || '',
      mother_phone: s.mother_phone || '',
      is_active: s.is_active !== false,
      status: s.status || (s.is_active === false ? 'withdrawn' : 'active')
    }));
    renderStats();
    setSyncStatus({ net: navigator.onLine ? 'online' : 'offline', db: 'ok' });
  }

  function renderStats() {
    const active = current.filter(s => s.is_active !== false);
    $('studentCount').textContent = active.length;
    if (!pending) {
      $('newCount').textContent = '0';
      $('changedCount').textContent = '0';
      $('withdrawnCount').textContent = '0';
    }
  }

  function normalizeHeader(h) {
    return normalize(h)
      .replace(/[إأآ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/\s+/g, '');
  }

  function headerMap(header) {
    const aliases = {
      'الرقمالقومي': 'national_id',
      'كودالطالب': 'student_code',
      'اسمالطالب': 'full_name',
      'النوع': 'gender',
      'الصف': 'grade',
      'القسم': 'section',
      'الفصل': 'class',
      'رقمالتليفونالاب': 'father_phone',
      'رقمتليفونالام': 'mother_phone',
      'رقمالتليفونالأب': 'father_phone',
      'رقمتليفونالأم': 'mother_phone'
    };
    const map = {};
    header.forEach((h, i) => {
      const k = normalizeHeader(h);
      if (aliases[k]) map[aliases[k]] = i;
    });
    return map;
  }

  /** قراءة خام من Excel — لا دمج بعد */
  function parseWorkbook(file) {
    return file.arrayBuffer().then(buf => {
      const wb = XLSX.read(buf, { type: 'array', cellDates: false, raw: false });
      const name = wb.SheetNames[0];
      const sheet = wb.Sheets[name];
      const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
      if (matrix.length < 2) throw Error('الملف لا يحتوي على صفوف بيانات.');
      const map = headerMap(matrix[0]);
      if (Object.keys(map).length < 9) {
        throw Error('لم نتعرف على الأعمدة التسعة المطلوبة. استخدم النموذج الرسمي.');
      }
      const out = [];
      for (let r = 1; r < matrix.length; r++) {
        const a = matrix[r];
        if (a.every(v => normalize(v) === '')) continue;
        out.push({
          national_id: digits(a[map.national_id]),
          student_code: normalize(a[map.student_code]),
          full_name: normalize(a[map.full_name]),
          gender: gender(a[map.gender]),
          grade: normalize(a[map.grade]),
          section: normalize(a[map.section]),
          class: normalize(a[map.class]),
          father_phone: phone(a[map.father_phone]),
          mother_phone: phone(a[map.mother_phone]),
          row: r + 1,
          // قيم خام قبل التحويل (للتقارير)
          _raw: {
            student_code: normalize(a[map.student_code]),
            full_name: normalize(a[map.full_name]),
            gender: normalize(a[map.gender]),
            grade: normalize(a[map.grade]),
            section: normalize(a[map.section]),
            class: normalize(a[map.class]),
            father_phone: normalize(a[map.father_phone]),
            mother_phone: normalize(a[map.mother_phone])
          }
        });
      }
      return { sheet: name, rows: out };
    });
  }

  /**
   * دمج ذكي: خانة Excel فارغة → الإبقاء على القيمة القديمة في النظام
   * خانة Excel بها بيانات → استبدال القيمة القديمة
   */
  function mergeWithExisting(excelRows) {
    const oldMap = new Map(current.map(s => [studentKey(s), s]));
    return excelRows.map(ex => {
      const key = studentKey(ex);
      const old = oldMap.get(key);
      if (!old) {
        // طالب جديد — نأخذ كل ما في Excel كما هو
        return { ...ex, _merged: false, _old: null, _fieldChanges: [] };
      }
      // طالب موجود — دمج حقل بحقل
      const merged = { ...ex, _merged: true, _old: old, _fieldChanges: [] };
      MERGE_FIELDS.forEach(f => {
        const excelVal = normalize(ex[f]);
        const oldVal = normalize(old[f]);
        if (excelVal === '') {
          // فارغ في Excel → احتفظ بالقديم
          merged[f] = old[f] || '';
        } else if (excelVal !== oldVal) {
          // قيمة جديدة مختلفة → استبدال + تسجيل التغيير
          merged[f] = ex[f];
          merged._fieldChanges.push({
            field: f,
            label: FIELD_LABELS[f] || f,
            from: oldVal || '(فارغ)',
            to: excelVal
          });
        } else {
          merged[f] = ex[f];
        }
      });
      return merged;
    });
  }

  function validate(list) {
    const errors = [];
    const seen = new Map();
    list.forEach(s => {
      const isNew = !s._merged;
      if (!validNational(s.national_id)) {
        errors.push(`صف Excel ${s.row}: الرقم القومي يجب أن يكون 14 رقمًا.`);
      }
      if (seen.has(studentKey(s))) {
        errors.push(`صف Excel ${s.row}: الرقم القومي مكرر مع الصف ${seen.get(studentKey(s))}.`);
      } else if (studentKey(s)) {
        seen.set(studentKey(s), s.row);
      }

      // الحقول الإلزامية للطلاب الجدد فقط
      // للطلاب الموجودين: يكفي الرقم القومي (باقي الحقول تُدمج)
      if (isNew) {
        if (!s.student_code) errors.push(`صف Excel ${s.row}: كود الطالب مطلوب (طالب جديد).`);
        if (!s.full_name) errors.push(`صف Excel ${s.row}: اسم الطالب مطلوب (طالب جديد).`);
        if (!s.gender) errors.push(`صف Excel ${s.row}: النوع مطلوب (طالب جديد).`);
        if (!s.grade) errors.push(`صف Excel ${s.row}: الصف مطلوب (طالب جديد).`);
        if (!s.section) errors.push(`صف Excel ${s.row}: القسم مطلوب (طالب جديد).`);
        if (!s.class) errors.push(`صف Excel ${s.row}: الفصل مطلوب (طالب جديد).`);
        if (!s.father_phone && !s.mother_phone) {
          errors.push(`صف Excel ${s.row}: يجب وجود رقم الأب أو الأم على الأقل (طالب جديد).`);
        }
      }

      if (!validPhone(s.father_phone)) errors.push(`صف Excel ${s.row}: رقم الأب غير صحيح.`);
      if (!validPhone(s.mother_phone)) errors.push(`صف Excel ${s.row}: رقم الأم غير صحيح.`);
    });
    return errors;
  }


  function buildConfirmMessage(d) {
    const lines = [];
    if (d.new.length) {
      const names = d.new.slice(0, 8).map(s => s.full_name || s.national_id).join('، ');
      const more = d.new.length > 8 ? ` ...و${d.new.length - 8} آخرين` : '';
      lines.push(`➕ إضافة ${d.new.length} طالب جديد: ${names}${more}`);
    }
    if (d.changed.length) {
      lines.push(`✏️ تعديل بيانات ${d.changed.length} طالب مستمر (بدون حذف سجلاتهم السابقة):`);
      const fieldCounts = {};
      d.changed.forEach(s => (s._fieldChanges || []).forEach(c => {
        fieldCounts[c.label] = (fieldCounts[c.label] || 0) + 1;
      }));
      Object.keys(fieldCounts).forEach(f => lines.push(`   • ${f}: ${fieldCounts[f]} طالب`));
    }
    if (d.withdrawn.length) {
      const names = d.withdrawn.slice(0, 8).map(s => s.full_name || s.national_id).join('، ');
      const more = d.withdrawn.length > 8 ? ` ...و${d.withdrawn.length - 8} آخرين` : '';
      lines.push(`🔴 تعليم ${d.withdrawn.length} كمنسحب (لن تُحذف المخالفات القديمة): ${names}${more}`);
    }
    if (d.same.length) lines.push(`⚪ بدون تغيير: ${d.same.length} طالب`);
    if (!lines.length) lines.push('لا توجد تغييرات لتطبيقها.');
    return `سيتم تحديث كشف الطلاب كالتالي:\n\n${lines.join('\n')}\n\nهل تريد المتابعة واعتماد التحديث؟`;
  }

  function buildDiff(mergedList) {
    return buildDiffAgainst(current, mergedList);
  }

  function buildDiffAgainst(oldList, mergedList) {
    const oldMap = new Map(oldList.map(s => [studentKey(s), s]));
    const incoming = new Map(mergedList.map(s => [studentKey(s), s]));
    const d = { new: [], changed: [], same: [], withdrawn: [] };

    mergedList.forEach(s => {
      const o = oldMap.get(studentKey(s));
      if (!o) {
        d.new.push(s);
      } else {
        const hasChanges = (s._fieldChanges && s._fieldChanges.length > 0);
        if (hasChanges) d.changed.push(s);
        else d.same.push(s);
      }
    });

    oldList.filter(s => s.is_active !== false).forEach(s => {
      if (!incoming.has(studentKey(s))) d.withdrawn.push(s);
    });
    return d;
  }

  function renderDiffReport(d) {
    // بطاقات الملخص
    $('diff').innerHTML = [
      ['جدد', d.new.length, 'new', 'سيُضاف'],
      ['متغيرون', d.changed.length, 'changed', 'سيُحدّث'],
      ['منسحبون', d.withdrawn.length, 'withdrawn', 'سيُعلّم منسحبًا'],
      ['بدون تغيير', d.same.length, 'same', 'لا تغيير']
    ].map(x => `
      <div class="diff">
        <small>${x[0]}</small>
        <strong>${x[1]}</strong>
        <span class="badge ${x[2]}">${x[3]}</span>
      </div>
    `).join('');
    $('diff').hidden = false;

    // تقرير تفصيلي
    let html = '';

    if (d.new.length) {
      html += `<h3 class="report-title">➕ طلاب جدد (${d.new.length})</h3>`;
      html += '<table class="report-table"><thead><tr><th>الصف في Excel</th><th>الرقم القومي</th><th>الاسم</th><th>الفصل</th></tr></thead><tbody>';
      d.new.forEach(s => {
        html += `<tr class="row-new"><td>${s.row}</td><td dir="ltr">${s.national_id}</td><td>${s.full_name || '—'}</td><td>${s.class || '—'}</td></tr>`;
      });
      html += '</tbody></table>';
    }

    if (d.changed.length) {
      html += `<h3 class="report-title">✏️ تغييرات على طلاب موجودين (${d.changed.length})</h3>`;
      html += '<table class="report-table"><thead><tr><th>الاسم</th><th>الرقم القومي</th><th>التغييرات</th></tr></thead><tbody>';
      d.changed.forEach(s => {
        const changesHtml = (s._fieldChanges || []).map(c =>
          `<div class="change-line"><span class="field-name">${c.label}</span>: <span class="from">${escapeHtml(c.from)}</span> ← <span class="to">${escapeHtml(c.to)}</span></div>`
        ).join('');
        html += `<tr class="row-changed"><td>${s.full_name || s._old?.full_name || '—'}</td><td dir="ltr">${s.national_id}</td><td class="changes-cell">${changesHtml}</td></tr>`;
      });
      html += '</tbody></table>';
    }

    if (d.withdrawn.length) {
      html += `<h3 class="report-title">🔴 سيُعلَّمون منسجبين (${d.withdrawn.length})</h3>`;
      html += '<p class="small-note">هؤلاء موجودون في النظام وغير موجودين في ملف Excel. لن تُحذف سجلاتهم، فقط يُعلَّمون كمنسحبين.</p>';
      html += '<table class="report-table"><thead><tr><th>الاسم</th><th>الرقم القومي</th><th>الفصل الحالي</th></tr></thead><tbody>';
      d.withdrawn.forEach(s => {
        html += `<tr class="row-withdrawn"><td>${s.full_name || '—'}</td><td dir="ltr">${s.national_id}</td><td>${s.class || '—'}</td></tr>`;
      });
      html += '</tbody></table>';
    }

    if (!d.new.length && !d.changed.length && !d.withdrawn.length) {
      html += '<div class="ok">لا توجد تغييرات — كل البيانات مطابقة لما في النظام.</div>';
    }

    $('preview').innerHTML = html;
    $('preview').hidden = false;

    $('newCount').textContent = d.new.length;
    $('changedCount').textContent = d.changed.length;
    $('withdrawnCount').textContent = d.withdrawn.length;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** اختيار الملف فقط — بدون معالجة */
  function onFileSelected(file) {
    if (!file) return;
    if (!scopeOk()) {
      msg('error', 'اختر المرحلة والقسم والصف أولاً ثم أعد اختيار الملف.');
    }
    selectedFile = file;
    parsedRaw = null;
    pending = null;
    msg('error', '', false);
    msg('ok', '', false);
    $('fileInfo').hidden = false;
    $('fileInfo').textContent = `تم اختيار الملف: ${file.name} — اضغط «معالجة الملف» لبدء الفحص والمقارنة.`;
    $('validation').hidden = true;
    $('diff').hidden = true;
    $('preview').hidden = true;
    $('confirmImport').disabled = true;
    $('cancelImport').disabled = false;
    $('processFile').disabled = false;
    $('processFile').textContent = '⚙️ معالجة الملف';
  }

  /** زر المعالجة */
  async function processSelectedFile() {
    if (!selectedFile) {
      msg('error', 'اختر ملف Excel أولاً.');
      return;
    }
    if (!scopeOk()) {
      msg('error', 'اختر المرحلة والقسم والصف قبل المعالجة.');
      return;
    }
    msg('error', '', false);
    msg('ok', '', false);
    $('processFile').disabled = true;
    $('processFile').textContent = 'جارٍ المعالجة...';
    try {
      const parsed = await parseWorkbook(selectedFile);
      parsedRaw = parsed;

      // ربط الصفوف بالنطاق المختار + دمج ذكي مع طلاب نفس المرحلة/الصف فقط
      const sc = getImportScope();
      const scopedCurrent = currentScoped();
      // مؤقتاً: merge يعتمد على current — نضيّق المقارنة عبر تمرير scoped
      const prevCurrent = current;
      current = scopedCurrent;
      const tagged = parsed.rows.map(r => ({
        ...r,
        grade: r.grade || sc.grade,
        section: r.section || sc.sectionLabel,
        stage: sc.stageName,
        stage_id: sc.stageId
      }));
      const merged = mergeWithExisting(tagged);
      current = prevCurrent; // استعادة القائمة الكاملة
      const errors = validate(merged);
      const diff = buildDiffAgainst(scopedCurrent, merged);

      pending = {
        file: selectedFile.name,
        sheet: parsed.sheet,
        rows: merged,
        diff,
        errors
      };

      const scInfo = getImportScope();
      $('fileInfo').textContent = `${selectedFile.name} — الورقة: ${parsed.sheet} — صفوف: ${parsed.rows.length} — النطاق: ${scInfo.stageName} / ${scInfo.sectionLabel} / ${scInfo.grade}`;
      $('validation').hidden = false;
      if (errors.length) {
        $('validation').innerHTML = `<div class="bad"><strong>يوجد ${errors.length} خطأ:</strong><ul>${errors.slice(0, 40).map(e => `<li>${e}</li>`).join('')}</ul>${errors.length > 40 ? '<p>تم إظهار أول 40 خطأ فقط.</p>' : ''}</div>`;
        $('confirmImport').disabled = true;
      } else {
        $('validation').innerHTML = `<div class="ok">✓ الملف اجتاز الفحوص. راجع تقرير الإضافات والتغييرات أدناه ثم اضغط «اعتماد التغييرات».</div>`;
        $('confirmImport').disabled = false;
      }

      renderDiffReport(diff);
      setImportStep(3);
      $('cancelImport').disabled = false;
    } catch (e) {
      pending = null;
      msg('error', e.message || 'تعذر قراءة الملف.');
      $('confirmImport').disabled = true;
    } finally {
      $('processFile').disabled = !selectedFile;
      $('processFile').textContent = '⚙️ معالجة الملف';
    }
  }

  async function commit() {
    if (!pending || pending.errors.length) return;
    const d = pending.diff;
    if (!d.new.length && !d.changed.length && !d.withdrawn.length) {
      msg('ok', 'لا توجد تغييرات للاعتماد.');
      return;
    }
    if (!window.confirm(buildConfirmMessage(d))) return;
    let cloudStudentsOk = false;
    let cloudFilePath = null;
    let cloudFileOk = false;
    let usedLocalFallback = false;

    if (sb) {
      msg('ok', 'جارٍ اعتماد التغييرات على السحابة...');
      const sc = getImportScope();
      // التحقق من أن المرحلة موجودة فعليًا في جدول stages (FK)
      const stageOk = sc.stageId && cloudStages.some(s => String(s.id) === String(sc.stageId));
      if (!stageOk) {
        msg('error', 'المرحلة المختارة غير موجودة في قاعدة البيانات. اختر مرحلة من القائمة السحابية (مثل ابتدائي عربي) وليس خيارًا محليًا مؤقتًا. إن كانت القائمة فارغة، أنشئ المراحل أولاً من لوحة المسؤول.');
        return;
      }
      // رفع ملف Excel الأصلي إلى Storage
      let storagePath = null;
      if (selectedFile) {
        storagePath = await uploadWorkbookToCloud(selectedFile, sc);
        cloudFilePath = storagePath;
        cloudFileOk = !!storagePath;
      }
      const baseRow = (s) => ({
        national_id: s.national_id,
        student_code: s.student_code || null,
        full_name: s.full_name || null,
        gender: genderToDb(s.gender || s.national_id) || genderToDb(s.national_id),
        grade: s.grade || sc.grade || null,
        stage_id: sc.stageId || null,
        stage_name: s.stage || sc.stageName || s.grade || null,
        section: sectionToDb(s.section, sc.section) || sc.section || null,
        class_name: s.class || null,
        father_phone: s.father_phone || null,
        mother_phone: s.mother_phone || null,
        academic_year: s.academic_year || currentAcademicYear(),
        is_active: true,
        status: 'active',
        source_file: pending.file || null,
        source_storage: storagePath || null,
        updated_at: new Date().toISOString()
      });
      // حفظ صفًا صفًا: يعمل سواء كان UNIQUE على national_id أو على (stage_id, national_id)
      // ولا يعتمد على ON CONFLICT الذي فشل في قاعدتك الحالية.
      const saveErrors = [];
      for (const s of pending.rows) {
        const row = baseRow(s);
        let q = sb.from('students').select('id').eq('national_id', row.national_id);
        if (sc.stageId) q = q.eq('stage_id', sc.stageId);
        const { data: found, error: findErr } = await q.limit(1).maybeSingle();
        if (findErr && !/multiple/i.test(findErr.message || '')) {
          // maybeSingle قد يفشل إن تعددت الصفوف — نتجاهل ونكمل بـ limit
        }
        let existingId = found?.id;
        if (!existingId) {
          const { data: list } = await sb.from('students').select('id').eq('national_id', row.national_id).limit(1);
          existingId = list?.[0]?.id;
        }
        let err = null;
        if (existingId) {
          const { error } = await sb.from('students').update(row).eq('id', existingId);
          err = error;
        } else {
          const { error } = await sb.from('students').insert(row);
          err = error;
        }
        if (err) saveErrors.push((s.full_name || s.national_id) + ': ' + err.message);
      }
      if (saveErrors.length) {
        let m = saveErrors.slice(0, 5).join(' | ');
        if (/father_phone|student_code|column/i.test(m)) {
          m += ' — نفّذ sql/phase4-step42-students-columns.sql ثم أعد المحاولة.';
        }
        msg('error', m);
        return;
      }
      cloudStudentsOk = true;
      for (const s of d.withdrawn) {
        await sb.from('students').update({
          is_active: false,
          status: 'withdrawn',
          updated_at: new Date().toISOString()
        }).eq('id', s.id);
      }
      await sb.from('student_import_batches').insert({
        file_name: pending.file,
        sheet_name: pending.sheet,
        total_rows: pending.rows.length,
        new_count: d.new.length,
        changed_count: d.changed.length,
        withdrawn_count: d.withdrawn.length,
        same_count: d.same.length,
        status: 'completed',
        storage_path: storagePath || null,
        stage_id: sc.stageId || null,
        stage_name: sc.stageName || null,
        section: sc.section || null,
        grade: sc.grade || null
      });
    } else {
      // وضع Demo محلي
      usedLocalFallback = true;
      const byKey = new Map(current.map(s => [studentKey(s), s]));
      pending.rows.forEach(s => {
        const key = studentKey(s);
        const existing = byKey.get(key);
        if (existing) {
          Object.assign(existing, {
            student_code: s.student_code,
            full_name: s.full_name,
            gender: s.gender,
            grade: s.grade,
            section: s.section,
            class: s.class,
            father_phone: s.father_phone,
            mother_phone: s.mother_phone,
            is_active: true,
            status: 'active'
          });
        } else {
          const sc2 = getImportScope();
          const neu = {
            id: key,
            national_id: s.national_id,
            student_code: s.student_code,
            full_name: s.full_name,
            gender: s.gender,
            grade: s.grade || sc2.grade,
            stage: s.stage || sc2.stageName || s.grade,
            section: s.section || sc2.sectionLabel,
            class: s.class,
            father_phone: s.father_phone,
            mother_phone: s.mother_phone,
            is_active: true,
            status: 'active'
          };
          current.push(neu);
          byKey.set(key, neu);
        }
      });
      d.withdrawn.forEach(s => {
        const ex = byKey.get(studentKey(s));
        if (ex) {
          ex.is_active = false;
          ex.status = 'withdrawn';
        }
      });
      saveDemo();
    }

    // سجل محلي
    const logs = JSON.parse(localStorage.getItem('solouki_phase3_logs') || '[]');
    logs.unshift({
      file: pending.file,
      date: new Date().toLocaleString('ar-EG'),
      new: d.new.length,
      changed: d.changed.length,
      withdrawn: d.withdrawn.length
    });
    localStorage.setItem('solouki_phase3_logs', JSON.stringify(logs.slice(0, 30)));
    renderLogs();

    setImportStep(4);
    lastSyncAt = new Date();
    let summary = `تم اعتماد الاستيراد: ${d.new.length} جديد، ${d.changed.length} متغير، ${d.withdrawn.length} منسحب، ${d.same.length} بدون تغيير.`;
    if (cloudStudentsOk) {
      summary += ' — بيانات الطلاب: محفوظة في قاعدة البيانات السحابية.';
      lastSyncDetail = 'طلاب على السحابة';
      setSyncStatus({ net: navigator.onLine ? 'online' : 'offline', db: 'ok', detail: lastSyncDetail });
    } else if (usedLocalFallback) {
      summary += ' — بيانات الطلاب: محفوظة محليًا فقط (لا اتصال بقاعدة البيانات).';
      lastSyncDetail = 'حفظ محلي';
      setSyncStatus({ net: navigator.onLine ? 'online' : 'offline', db: 'local', detail: lastSyncDetail });
    }
    if (sb && selectedFile) {
      if (cloudFileOk) summary += ' — ملف Excel: رُفع للتخزين السحابي.';
      else summary += ' — ملف Excel: لم يُرفع (صلاحيات التخزين). بيانات الطلاب قد تكون سحابية.';
    }
    msg('ok', summary);
    if (cloudFileOk === false && sb && !cloudStudentsOk) {
      msg('error', 'تعذّر إكمال المزامنة السحابية بالكامل. راجع مؤشر الحالة أعلاه.');
    } else if (sb && selectedFile && !cloudFileOk && cloudStudentsOk) {
      msg('error', 'ملف Excel لم يُرفع للتخزين (RLS). نفّذ sql/phase4-step42-storage-policies.sql — بيانات الطلاب سحابية.');
    }
    pending = null;
    selectedFile = null;
    parsedRaw = null;
    $('confirmImport').disabled = true;
    $('cancelImport').disabled = true;
    $('processFile').disabled = true;
    $('preview').hidden = true;
    $('diff').hidden = true;
    $('validation').hidden = true;
    $('fileInfo').hidden = true;
    await loadCurrent();
  }

  function cancelImport() {
    pending = null;
    selectedFile = null;
    parsedRaw = null;
    $('fileInfo').hidden = true;
    $('validation').hidden = true;
    $('diff').hidden = true;
    $('preview').hidden = true;
    $('confirmImport').disabled = true;
    $('cancelImport').disabled = true;
    $('processFile').disabled = true;
    msg('error', '', false);
    msg('ok', '', false);
    renderStats();
  }

  function downloadTemplate() {
    const data = [
      HEADERS,
      ['27301121400377', '123456', 'احمد الشافعى', 'ذكر', 'الأول الابتدائى', 'قسم لغات', '1/1', '01113677693', '01557907995']
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 24 }, { wch: 10 }, { wch: 22 }, { wch: 16 }, { wch: 12 }, { wch: 18 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الطلاب');
    XLSX.writeFile(wb, 'solouki-students-template.xlsx');
  }

  function renderLogs() {
    const logs = JSON.parse(localStorage.getItem('solouki_phase3_logs') || '[]');
    $('logsList').innerHTML = logs.length
      ? logs.map(x => `<div class="log-item"><strong>${x.file}</strong><br><small>${x.date} — جديد: ${x.new} — متغير: ${x.changed} — منسحب: ${x.withdrawn}</small></div>`).join('')
      : '<p class="small-note">لا توجد عمليات اختبار محلية بعد.</p>';
  }

  async function loadStages() {
    const sel = $('waStage');
    sel.innerHTML = STAGES.map((s, i) => `<option value="${i}">${s}</option>`).join('');
  }
  function waLocalKey() { return 'solouki_phase3_wa'; }
  function loadWa() {
    const all = JSON.parse(localStorage.getItem(waLocalKey()) || '{}');
    const x = all[$('waStage').value] || {};
    $('waNumber').value = x.number || '';
    $('waPhoneId').value = x.phone_id || '';
    $('waStatus').textContent = x.number ? 'آخر حفظ محلي: ' + x.number : 'لم يتم حفظ رقم لهذه المرحلة.';
  }
  function saveWa() {
    const all = JSON.parse(localStorage.getItem(waLocalKey()) || '{}');
    all[$('waStage').value] = { number: $('waNumber').value.trim(), phone_id: '', note: 'personal-ref' };
    localStorage.setItem(waLocalKey(), JSON.stringify(all));
    $('waStatus').textContent = 'تم حفظ الملاحظة المرجعية للمرحلة. الإرسال الفعلي من صفحة إشعارات واتساب عبر الرقم الشخصي.';
    msg('ok', 'تم الحفظ. تذكير: لا يُستخدم Meta API — الإرسال من واتساب الشخصي على الجهاز.');
  }
  function testWa() {
    location.href = 'notifications.html';
  }


  // —— صلاحية تعديل بيانات الطالب (Phase 4 / STEP 41) ——
  let myAccess = { role: null, editStudents: 'none' };
  async function loadMyAccess() {
    if (!sb) { myAccess = { role: 'superadmin', editStudents: 'active' }; return; } // وضع تجريبي محلي بدون قاعدة بيانات
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;
      const { data: prof } = await sb.from('profiles').select('role_type').eq('id', session.user.id).eq('is_active', true).single();
      myAccess.role = prof?.role_type || null;
      const { data: mode } = await sb.rpc('my_permission', { p_key: 'edit_students' });
      myAccess.editStudents = mode || 'none';
    } catch (err) { console.warn('loadMyAccess', err); }
  }
  function canEditStudents() { return myAccess.role === 'superadmin' || myAccess.editStudents === 'active'; }
  function canViewStudentDetails() { return canEditStudents() || myAccess.editStudents === 'observer'; }

  // —— قائمة الطلاب وتعديل البيانات ——
  function renderRoster() {
    const q = normalize($('rosterSearch')?.value || '').toLowerCase();
    const filter = $('rosterFilter')?.value || 'active';
    let list = [...current];
    if (filter === 'active') list = list.filter(s => s.is_active !== false);
    else if (filter === 'withdrawn') list = list.filter(s => s.is_active === false);

    if (q) {
      list = list.filter(s => {
        const blob = [s.full_name, s.national_id, s.student_code, s.class, s.grade, s.section, s.father_phone, s.mother_phone]
          .map(x => normalize(x).toLowerCase()).join(' ');
        return blob.includes(q);
      });
    }

    if (!list.length) {
      $('rosterTable').innerHTML = '<p class="small-note">لا يوجد طلاب مطابقون.</p>';
      return;
    }

    const actionCell = canEditStudents()
      ? '<button type="button" class="btn btn-primary btn-sm btn-edit-student">تعديل</button>'
      : (canViewStudentDetails() ? '<button type="button" class="btn btn-outline btn-sm btn-edit-student">عرض</button>' : '');

    let html = `<table class="roster-table"><thead><tr>
      <th>الاسم</th><th>الرقم القومي</th><th>الكود</th><th>الصف / الفصل</th><th>هاتف الأب</th><th>هاتف الأم</th><th>الحالة</th><th></th>
    </tr></thead><tbody>`;
    list.forEach(s => {
      const key = studentKey(s);
      const active = s.is_active !== false;
      html += `<tr class="${active ? '' : 'inactive'}" data-key="${key}">
        <td>${escapeHtml(s.full_name || '—')}</td>
        <td dir="ltr">${escapeHtml(s.national_id || '')}</td>
        <td dir="ltr">${escapeHtml(s.student_code || '—')}</td>
        <td>${escapeHtml((s.grade || '') + ' / ' + (s.class || ''))}</td>
        <td dir="ltr">${escapeHtml(s.father_phone || '—')}</td>
        <td dir="ltr">${escapeHtml(s.mother_phone || '—')}</td>
        <td>${active ? 'نشط' : 'منسحب'}</td>
        <td class="roster-actions">
          ${actionCell}
        </td>
      </tr>`;
    });
    html += '</tbody></table>';
    $('rosterTable').innerHTML = html;
    $('rosterTable').querySelectorAll('.btn-edit-student').forEach(btn => {

      btn.onclick = () => {
        const tr = btn.closest('tr');
        openEditStudent(tr.getAttribute('data-key'));
      };
    });
  }

  function openEditStudent(key) {
    const s = current.find(x => studentKey(x) === key);
    if (!s) return msg('error', 'الطالب غير موجود.');
    const readOnly = !canEditStudents();
    $('editKey').value = key;
    $('editTitle').textContent = (readOnly ? 'عرض: ' : 'تعديل: ') + (s.full_name || key);
    $('editNational').value = s.national_id || '';
    $('editCode').value = s.student_code || '';
    $('editName').value = s.full_name || '';
    $('editGender').value = s.gender === 'أنثى' ? 'أنثى' : 'ذكر';
    $('editGrade').value = s.grade || '';
    $('editSection').value = s.section || '';
    $('editClass').value = s.class || '';
    // عرض الأرقام بشكل ودّي إن كانت دولية
    const pretty = v => {
      const d = digits(v);
      if (d.startsWith('20') && d.length === 12) return '0' + d.slice(2);
      return v || '';
    };
    $('editFather').value = pretty(s.father_phone);
    $('editMother').value = pretty(s.mother_phone);
    $('editActive').checked = s.is_active !== false;
    ['editNational','editCode','editName','editGender','editGrade','editSection','editClass','editFather','editMother','editActive']
      .forEach(id => { const el = $(id); if (el) el.disabled = readOnly; });
    const saveBtn = $('editForm')?.querySelector('button[type="submit"]');
    if (saveBtn) saveBtn.hidden = readOnly;
    $('editModal').hidden = false;
  }

  function closeEditStudent() {
    $('editModal').hidden = true;
  }

  async function saveEditStudent(e) {
    e.preventDefault();
    if (!canEditStudents()) return msg('error', 'لا تملك صلاحية تعديل بيانات الطلاب.');
    const key = $('editKey').value;
    const s = current.find(x => studentKey(x) === key);
    if (!s) return msg('error', 'الطالب غير موجود.');

    const national_id = digits($('editNational').value);
    if (!validNational(national_id)) return msg('error', 'الرقم القومي يجب أن يكون 14 رقمًا.');

    const father = phone($('editFather').value);
    const mother = phone($('editMother').value);
    if (!validPhone(father)) return msg('error', 'رقم الأب غير صحيح.');
    if (!validPhone(mother)) return msg('error', 'رقم الأم غير صحيح.');

    // منع تكرار الرقم القومي مع طالب آخر
    const dup = current.find(x => studentKey(x) === national_id && studentKey(x) !== key);
    if (dup) return msg('error', 'الرقم القومي مستخدم لطالب آخر: ' + (dup.full_name || ''));

    const patch = {
      national_id,
      student_code: normalize($('editCode').value),
      full_name: normalize($('editName').value),
      gender: $('editGender').value,
      grade: normalize($('editGrade').value),
      section: normalize($('editSection').value),
      class: normalize($('editClass').value),
      father_phone: father,
      mother_phone: mother,
      is_active: $('editActive').checked,
      status: $('editActive').checked ? 'active' : 'withdrawn'
    };
    if (!patch.full_name) return msg('error', 'اسم الطالب مطلوب.');

    if (sb) {
      if (!s.id || String(s.id).length <= 20) return msg('error', 'لا يمكن تعديل هذا السجل مباشرة؛ حدّثه عبر استيراد Excel أولًا.');
      const { data: okSaved, error } = await sb.rpc('admin_update_student', {
        p_student_id: s.id,
        p_national_id: patch.national_id,
        p_student_code: patch.student_code || null,
        p_full_name: patch.full_name,
        p_gender: genderToDb(patch.gender) || patch.gender,
        p_grade: patch.grade || null,
        p_section: sectionToDb(patch.section) || patch.section || null,
        p_class_name: patch.class || null,
        p_father_phone: patch.father_phone || null,
        p_mother_phone: patch.mother_phone || null,
        p_is_active: patch.is_active
      });
      if (error) return msg('error', error.message);
      if (!okSaved) return msg('error', 'تعذّر حفظ التعديل — تحقق من الصلاحية.');
      lastSyncAt = new Date();
      lastSyncDetail = 'تعديل طالب';
      setSyncStatus({ net: navigator.onLine ? 'online' : 'offline', db: 'ok', detail: lastSyncDetail });
      await loadCurrent();
    } else {
      Object.assign(s, patch);
      // إذا تغيّر الرقم القومي، حدّث المفتاح المحلي
      if (s.id === key || s.id === studentKey({ national_id: key })) s.id = national_id;
      saveDemo();
      renderStats();
    }

    closeEditStudent();
    renderRoster();
    msg('ok', 'تم حفظ تعديلات الطالب: ' + patch.full_name);
  }


  // —— أحداث الواجهة (مع حماية من العناصر غير الموجودة) ——
  const on = (id, event, fn) => {
    const el = $(id);
    if (!el) return;
    if (event === 'click') el.onclick = fn;
    else el.addEventListener(event, fn);
  };

  on('excelFile', 'change', e => {
    if (e.target.files[0]) onFileSelected(e.target.files[0]);
  });
  on('dropzone', 'dragover', e => {
    e.preventDefault();
    $('dropzone').classList.add('drag');
  });
  on('dropzone', 'dragleave', () => $('dropzone') && $('dropzone').classList.remove('drag'));
  on('dropzone', 'drop', e => {
    e.preventDefault();
    $('dropzone') && $('dropzone').classList.remove('drag');
    const f = e.dataTransfer.files[0];
    if (f) onFileSelected(f);
  });
  // نقر منطقة السحب يفتح اختيار الملف — مع تجنب النقر المزدوج
  // لأن زر «اختيار ملف» داخل label يفتح النافذة بالفعل
  on('dropzone', 'click', (e) => {
    if (e.target.closest('label') || e.target.closest('input') || e.target.id === 'excelFile') return;
    const input = $('excelFile');
    if (input) input.click();
  });

  on('processFile', 'click', processSelectedFile);
  on('downloadTemplate', 'click', downloadTemplate);
  on('confirmImport', 'click', commit);
  on('cancelImport', 'click', cancelImport);
  on('clearDemo', 'click', () => {
    localStorage.removeItem(DEMO_KEY);
    localStorage.removeItem('solouki_phase3_logs');
    location.reload();
  });
  on('waStage', 'change', loadWa);
  on('saveWa', 'click', saveWa);
  // testWa اختياري — قد لا يوجد في الواجهة الجديدة
  on('testWa', 'click', () => { location.href = 'notifications.html'; });

  document.querySelectorAll('.tabs button').forEach(b => {
    b.onclick = () => {
      document.querySelectorAll('.tabs button').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      const panel = $(b.dataset.tab);
      if (panel) panel.classList.add('active');
      if (b.dataset.tab === 'roster') renderRoster();
    };
  });
  on('rosterSearch', 'input', renderRoster);
  on('rosterFilter', 'change', renderRoster);
  on('closeEdit', 'click', closeEditStudent);
  on('cancelEdit', 'click', closeEditStudent);
  if ($('editForm')) $('editForm').onsubmit = saveEditStudent;
  on('logout', 'click', async () => {
    if (sb) try { await sb.auth.signOut(); } catch (_) {}
    sessionStorage.clear();
    location.href = 'index.html';
  });

  // ملء القوائم + تفعيل الخطوات — مع احتياطي محلي دائم
  Promise.resolve()
    .then(() => fillImportSelectors())
    .catch(err => {
      console.warn('fillImportSelectors', err);
      fillImportSelectorsFromLocal();
    })
    .finally(() => {
      if (!$('importStage') || !$('importStage').options.length) fillImportSelectorsFromLocal();
      setImportStep(1);
      ['importStage', 'importSection', 'importGrade'].forEach(id => {
        on(id, 'change', () => { setImportStep(scopeOk() ? 2 : 1); });
      });
    });

  loadStages().then(loadWa).catch(() => {});
  loadMyAccess().then(() => { if ($('roster')?.classList.contains('active')) renderRoster(); });
  refreshConnectionStatus();
  setTimeout(() => refreshConnectionStatus(), 600);
  window.addEventListener('online', () => refreshConnectionStatus());
  window.addEventListener('offline', () => refreshConnectionStatus());
  loadCurrent();
  renderLogs();
})();
