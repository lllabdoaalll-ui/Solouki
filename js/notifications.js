/* Solouki — WhatsApp notification center (manual personal WhatsApp primary) */
(() => {
  const cfg = window.SOLOUKI_CONFIG || {};
  const sb = window.SoloukiDB ? window.SoloukiDB.getClient() : null;
  let profile = null;
  let rows = [];
  let bulkQueue = [];
  let bulkIndex = 0;
  let waWindow = null;
  const WA_WIN = 'solouki_whatsapp'; // نفس النافذة دائماً
  const $ = id => document.getElementById(id);
  const note = (id, text, show = true) => {
    const el = $(id);
    if (!el) return;
    el.textContent = text;
    el.hidden = !show;
  };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
  const today = () => {
    // تاريخ محلي (مهم في مصر: لا نستخدم UTC حتى لا تنتقل إشعارات بعد منتصف الليل لليوم السابق)
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const digits = v => String(v ?? '')
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/\D/g, '');
  const toWa = v => {
    let d = digits(v);
    if (d.startsWith('20')) return d;
    if (d.startsWith('0')) return '20' + d.slice(1);
    return d;
  };
  const waLink = (phone, text) =>
    `https://wa.me/${toWa(phone)}?text=${encodeURIComponent(text || '')}`;

  async function session() {
    const r = await SoloukiSession.requireSession({
      roles: ['superadmin', 'stage_manager', 'counselor']
    });
    if (!r) return false;
    profile = r.profile;
    return true;
  }

  async function load() {
    if (!await session()) return;
    note('error', '', false);
    const { data, error } = await sb.rpc('list_my_whatsapp_notifications', {
      p_date: today(),
      p_status: null,
      p_limit: 200
    });
    if (error) {
      note('error', error.message);
      return;
    }
    rows = data || [];
    render();
    updateBulkBar();
  }

  async function prepareAll() {
    const btn = $('prepareAllBtn');
    if (btn) btn.disabled = true;
    try {
      const { data, error } = await sb.rpc('queue_daily_whatsapp_notifications', {
        p_date: today()
      });
      if (error) throw error;
      note('ok', data?.[0]?.message || 'تم تجهيز الإشعارات.');
      await load();
    } catch (e) {
      note('error', e.message || String(e));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function pendingRows() {
    return rows.filter(r => ['queued', 'failed'].includes(r.status));
  }

  /** فتح رابط واتساب في نفس النافذة المسماة دائماً */
  function openWa(row) {
    const p = toWa(row.recipient_phone);
    if (!p || p.length < 10) {
      note('error', 'رقم غير صالح: ' + (row.recipient_phone || '—'));
      return false;
    }
    const url = waLink(p, row.message);
    // افتح أول مرة من ضغطة المستخدم، ثم أعد استخدام نفس نافذة واتساب
    // بدلاً من إنشاء تبويب جديد لكل طالب.
    try {
      if (!waWindow || waWindow.closed) {
        waWindow = window.open(url, WA_WIN);
      } else {
        waWindow.location.href = url;
        waWindow.focus();
      }
    } catch (_) {
      waWindow = null;
    }
    if (!waWindow) {
      note('error', 'المتصفح منع نافذة واتساب. اسمح بالنوافذ المنبثقة لهذا الموقع ثم أعد المحاولة.');
      return false;
    }
    try { waWindow.focus(); } catch (_) { /* ignore */ }
    return true;
  }

  function manualOne(row) {
    if (!openWa(row)) return;
    note(
      'ok',
      'تم فتح محادثة واتساب لـ «' +
        (row.student_name || '') +
        '». أرسل الرسالة من هاتفك/واتساب ويب، ثم انتقل للتالي إن رغبت.'
    );
  }

  function startBulk() {
    bulkQueue = pendingRows();
    if (!bulkQueue.length) {
      note('error', 'لا توجد إشعارات معلّقة للتجهيز اليدوي.');
      return;
    }
    bulkIndex = 0;
    const bar = $('bulkBar');
    if (bar) bar.hidden = false;
    openBulkCurrent();
  }

  function openBulkCurrent() {
    if (!bulkQueue.length || bulkIndex >= bulkQueue.length) {
      finishBulk();
      return;
    }
    const row = bulkQueue[bulkIndex];
    openWa(row);
    updateBulkBar();
    note(
      'ok',
      'يدوي ' +
        (bulkIndex + 1) +
        ' / ' +
        bulkQueue.length +
        ' — «' +
        (row.student_name || '') +
        '» (' +
        (row.parent_type === 'father' ? 'الأب' : 'الأم') +
        '). أرسل من واتساب ثم اضغط «التالي».'
    );
  }

  function bulkNext() {
    bulkIndex += 1;
    if (bulkIndex >= bulkQueue.length) {
      finishBulk();
      return;
    }
    openBulkCurrent();
  }

  function bulkPrev() {
    if (bulkIndex <= 0) return;
    bulkIndex -= 1;
    openBulkCurrent();
  }

  function finishBulk() {
    bulkQueue = [];
    bulkIndex = 0;
    const bar = $('bulkBar');
    if (bar) bar.hidden = true;
    note(
      'ok',
      'انتهى مسار الإرسال اليدوي. تذكير: الإرسال اليدوي لا يُسجَّل كنجاح API — الحالة تبقى «مجهز» حتى يُفعَّل الإرسال الآلي لاحقاً.'
    );
    updateBulkBar();
  }

  function updateBulkBar() {
    const bar = $('bulkBar');
    const prog = $('bulkProgress');
    const pending = pendingRows().length;
    if (prog) {
      if (bulkQueue.length) {
        prog.textContent =
          'الحالي: ' +
          (bulkIndex + 1) +
          ' من ' +
          bulkQueue.length +
          ' — متبقٍ في الطابور: ' +
          Math.max(bulkQueue.length - bulkIndex - 1, 0);
      } else {
        prog.textContent =
          pending > 0
            ? pending + ' إشعاراً معلّقاً — اضغط «بدء الإرسال اليدوي» لفتحها واحداً تلو الآخر في نفس نافذة واتساب.'
            : 'لا إشعارات معلّقة.';
      }
    }
    const nextBtn = $('bulkNextBtn');
    const prevBtn = $('bulkPrevBtn');
    // التالي متاح طالما لم نتجاوز آخر عنصر (الضغطة الأخيرة تُنهي المسار)
    if (nextBtn) nextBtn.disabled = !bulkQueue.length;
    if (prevBtn) prevBtn.disabled = !bulkQueue.length || bulkIndex <= 0;
  }

  function statusLabel(s) {
    return (
      {
        queued: 'مجهز — بانتظار الإرسال اليدوي',
        sending: 'جاري الإرسال',
        sent: 'تم الإرسال (API)',
        failed: 'فشل API — يمكن الفتح يدوياً'
      }[s] || s
    );
  }

  function render() {
    const sent = rows.filter(r => r.status === 'sent').length;
    const pending = pendingRows().length;
    if ($('pendingCount')) $('pendingCount').textContent = pending;
    if ($('openedCount')) $('openedCount').textContent = sent;
    if ($('violCount'))
      $('violCount').textContent = rows.reduce((n, r) => n + (r.violation_count || 0), 0);

    const list = $('list');
    if (!list) return;
    list.innerHTML = rows.length
      ? rows
          .map(
            r => `<article class="notif-item ${r.status === 'sent' ? 'sent' : ''}">
      <h3>${esc(r.student_name || '—')} <span class="badge-count">${r.violation_count || 0} مخالفة</span></h3>
      <div class="notif-meta">${esc(r.grade || '')} ${esc(r.class_name || '')} — ${
              r.parent_type === 'father' ? 'الأب' : 'الأم'
            } — <span dir="ltr">${esc(r.recipient_phone)}</span> — <strong>${esc(
              statusLabel(r.status)
            )}</strong></div>
      <div class="notif-msg">${esc(r.message)}</div>
      ${r.error_text ? `<div class="error-box">${esc(r.error_text)}</div>` : ''}
      <div class="notif-actions">
        ${
          ['queued', 'failed'].includes(r.status)
            ? `<button type="button" class="btn btn-primary" data-manual="${r.id}">فتح واتساب</button>
               <button type="button" class="btn btn-outline" data-copy="${r.id}">نسخ الرسالة</button>`
            : ''
        }
        ${
          r.status === 'sent'
            ? `<span class="small-note">${
                r.sent_at ? esc(new Date(r.sent_at).toLocaleString('ar-EG')) : ''
              }</span>`
            : ''
        }
      </div></article>`
          )
          .join('')
      : '<div class="empty-state">لم يتم تجهيز إشعارات اليوم بعد. اضغط «تجهيز إشعارات اليوم».</div>';

    rows.forEach(r => {
      document
        .querySelector(`[data-manual="${r.id}"]`)
        ?.addEventListener('click', () => manualOne(r));
      document.querySelector(`[data-copy="${r.id}"]`)?.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(r.message || '');
          note('ok', 'تم نسخ نص الرسالة. يمكنك لصقها في واتساب إن لزم.');
        } catch (_) {
          note('error', 'تعذر النسخ التلقائي — انسخ النص من البطاقة يدوياً.');
        }
      });
    });
    updateBulkBar();
  }

  // sender label if available on profile
  function showSender() {
    const el = $('senderWa');
    if (!el || !profile) return;
    const phone =
      profile.personal_whatsapp ||
      profile.whatsapp_phone ||
      profile.phone ||
      '— رقمك الشخصي من واتساب على الجهاز';
    el.textContent = phone;
  }

  $('prepareAllBtn') && ($('prepareAllBtn').onclick = prepareAll);
  $('refreshBtn') && ($('refreshBtn').onclick = load);
  $('startBulkBtn') && ($('startBulkBtn').onclick = startBulk);
  $('bulkNextBtn') && ($('bulkNextBtn').onclick = bulkNext);
  $('bulkPrevBtn') && ($('bulkPrevBtn').onclick = bulkPrev);
  $('bulkStopBtn') && ($('bulkStopBtn').onclick = finishBulk);
  $('logout') &&
    ($('logout').onclick = () => SoloukiSession.logout('index.html'));

  load()
    .then(() => showSender())
    .catch(e => note('error', e.message || String(e)));
})();
