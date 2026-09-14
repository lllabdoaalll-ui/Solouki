/**
 * Solouki — STEP 47: إعدادات ترويسة التقارير
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  let logos = { right: null, ar: null, lang: null };

  function note(id, message) {
    const el = $(id);
    if (!el) return;
    if (window.SoloukiUtils && SoloukiUtils.showNote) {
      SoloukiUtils.showNote(id, message, id === 'error');
      return;
    }
    el.hidden = !message;
    el.textContent = message || '';
  }

  function sb() {
    return SoloukiDB.sb();
  }

  function showPrev(id, dataUrl) {
    const box = $(id);
    if (!dataUrl) {
      box.innerHTML = '<span style="font-size:11px;color:#8aa">لا يوجد</span>';
      return;
    }
    box.innerHTML = '<img alt="شعار" src="' + dataUrl + '">';
  }

  function readFile(file, maxKb) {
    return new Promise((resolve, reject) => {
      if (!file) return resolve(null);
      if (file.size > (maxKb || 400) * 1024) {
        reject(new Error('حجم الصورة كبير — الحد حوالي ' + (maxKb || 400) + ' كيلوبايت'));
        return;
      }
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('تعذّر قراءة الملف'));
      r.readAsDataURL(file);
    });
  }

  function bindFile(inputId, key, prevId) {
    $(inputId).addEventListener('change', async (e) => {
      try {
        const data = await readFile(e.target.files[0]);
        if (data) {
          logos[key] = data;
          showPrev(prevId, data);
        }
      } catch (err) {
        note('error', err.message);
      }
    });
  }

  async function load() {
    const { data, error } = await sb().rpc('get_report_settings');
    if (error) throw error;
    const s = data || {};
    $('governorate').value = s.governorate || '';
    $('directorate').value = s.directorate || '';
    $('administration').value = s.administration || '';
    $('schoolName').value = s.school_name || '';
    $('academicYear').value = s.academic_year || '';
    $('signCounselor').value = s.sign_counselor_title || 'الأخصائي الاجتماعي';
    $('signStage').value = s.sign_stage_manager_title || 'مدير المرحلة';
    $('signPrincipal').value = s.sign_principal_title || 'مدير المدرسة';
    $('introText').value = s.intro_text || '';
    $('noticeText').value = s.notice_text || '';
    $('closingText').value = s.closing_text || '';
    logos.right = s.logo_right || null;
    logos.ar = s.logo_left_arabic || null;
    logos.lang = s.logo_left_languages || null;
    showPrev('prevRight', logos.right);
    showPrev('prevAr', logos.ar);
    showPrev('prevLang', logos.lang);
  }

  async function save() {
    note('ok', '');
    note('error', '');
    $('saveBtn').disabled = true;
    try {
      const { error } = await sb().rpc('upsert_report_settings', {
        p_governorate: $('governorate').value,
        p_directorate: $('directorate').value,
        p_administration: $('administration').value,
        p_school_name: $('schoolName').value,
        p_academic_year: $('academicYear').value,
        p_logo_right: logos.right || '',
        p_logo_left_arabic: logos.ar || '',
        p_logo_left_languages: logos.lang || '',
        p_sign_counselor_title: $('signCounselor').value,
        p_sign_stage_manager_title: $('signStage').value,
        p_sign_principal_title: $('signPrincipal').value,
        p_intro_text: $('introText').value,
        p_notice_text: $('noticeText').value,
        p_closing_text: $('closingText').value
      });
      if (error) throw error;
      note('ok', 'تم حفظ إعدادات التقارير');
    } catch (e) {
      note('error', e.message || 'تعذّر الحفظ');
    } finally {
      $('saveBtn').disabled = false;
    }
  }

  async function boot() {
    const auth = await SoloukiSession.requireSession();
    if (!auth) return;
    const role = auth.profile && auth.profile.role_type;
    if (!['superadmin', 'stage_manager'].includes(role)) {
      note('error', 'تعديل إعدادات التقارير للمسؤول العام أو مدير المرحلة فقط. يمكنك الاطلاع إن وُجدت صلاحية قراءة.');
    }
    $('logout').addEventListener('click', () => SoloukiSession.logout('index.html'));
    bindFile('logoRightFile', 'right', 'prevRight');
    bindFile('logoArFile', 'ar', 'prevAr');
    bindFile('logoLangFile', 'lang', 'prevLang');
    $('clearRight').addEventListener('click', () => { logos.right = null; showPrev('prevRight', null); $('logoRightFile').value = ''; });
    $('clearAr').addEventListener('click', () => { logos.ar = null; showPrev('prevAr', null); $('logoArFile').value = ''; });
    $('clearLang').addEventListener('click', () => { logos.lang = null; showPrev('prevLang', null); $('logoLangFile').value = ''; });
    $('saveBtn').addEventListener('click', save);
    try {
      await load();
    } catch (e) {
      note('error', e.message || 'تعذّر التحميل — تأكد من تنفيذ SQL الخاص بإعدادات التقارير');
    }
  }

  boot();
})();
