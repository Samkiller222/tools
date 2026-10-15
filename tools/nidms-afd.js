(() => {
  document.getElementById('cvu-afd')?.remove();

  // ---------- UI ----------
  const box = document.createElement('div');
  box.id = 'cvu-afd';
  box.style.cssText = 'position:fixed;inset:40px;z-index:999999;background:#fff;border:2px solid #B7791F;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.3);display:flex;flex-direction:column;font:13px Arial,sans-serif;color:#1C274C';
  box.innerHTML = `
    <div style="padding:10px 14px;background:#B7791F;color:#fff;display:flex;justify-content:space-between;align-items:center;border-radius:8px 8px 0 0">
      <b>Awaiting Further Documentation (AFD) list</b>
      <button id="af-close" style="background:none;border:none;color:#fff;font-size:20px;cursor:pointer">✕</button>
    </div>
    <div style="padding:12px;display:flex;gap:12px;flex:1;min-height:0">
      <div style="width:250px;display:flex;flex-direction:column;gap:8px">
        <small>Finds every application with the AFD tag, then reads each audit history for who added the tag and when.</small>
        <button id="af-run" style="padding:8px;background:#B7791F;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold">▶ Find AFD applications</button>
        <hr style="width:100%;border:none;border-top:1px solid #eee">
        <label>Purpose<br><select id="af-purpose" style="width:100%;padding:3px"><option value="">All</option></select></label>
        <label>Tag added by<br><select id="af-by" style="width:100%;padding:3px"><option value="">Anyone</option></select></label>
        <label>Search<br><input id="af-q" placeholder="name, passport, app no…" style="width:100%;padding:3px"></label>
        <button id="af-copy" style="padding:8px;background:#198754;color:#fff;border:none;border-radius:6px;cursor:pointer" disabled>📋 Copy for Excel</button>
        <div id="af-status" style="font-weight:bold;white-space:pre-line"></div>
      </div>
      <div id="af-results" style="flex:1;overflow:auto;border:1px solid #eee;border-radius:6px"></div>
    </div>`;
  document.body.appendChild(box);
  const q$ = id => box.querySelector('#' + id);
  q$('af-close').onclick = () => box.remove();
  const say = t => q$('af-status').textContent = t;

  const AFD_TEXT = 'Awaiting Further Documentation';
  const AFD_FALLBACK_ID = 'f91f56c9-c12b-42b4-9614-74c90eddf24d';

  // ---------- search form (from this page, or fetched in the background) ----------
  let tmplP = null;
  const getTemplate = () => tmplP || (tmplP = (async () => {
    let form = document.getElementById('search-visa-applications-form'), html = document.documentElement.innerHTML;
    if (!form) {
      html = await (await fetch('/portal/DVisaApplication', { credentials: 'same-origin' })).text();
      form = new DOMParser().parseFromString(html, 'text/html').getElementById('search-visa-applications-form');
    }
    if (!form) { tmplP = null; throw new Error('could not load the NIDMS search form (logged out?)'); }
    const t = {};
    form.querySelectorAll('input[name],select[name],textarea[name]').forEach(el => {
      t[el.name] = (el.name === 'AdvancedFilters' || el.name === '__RequestVerificationToken') ? el.value : '';
    });
    const m = new RegExp('"Text":"' + AFD_TEXT + '","Value":"([0-9a-f-]{36})"', 'i').exec(html);
    t.TagID = m ? m[1] : AFD_FALLBACK_ID;
    return t;
  })());

  const post = async (url, data) => {
    const res = await fetch(url, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
      body: new URLSearchParams(data)
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.text();
  };
  const retry = async fn => { try { return await fn(); } catch (e) { await new Promise(r => setTimeout(r, 1500)); return fn(); } };

  const readPage = async (page, size) => retry(async () => {
    const text = await post('/portal/DVisaApplication/DVisaApplications_Read',
      { sort: 'CreatedDate-asc', page, pageSize: size, group: '', filter: '', ...(await getTemplate()), QuickCriteria: '' });
    try { const j = JSON.parse(text); return { data: j.Data || [], total: j.Total ?? null }; }
    catch {
      if (/no match/i.test(text)) return { data: [], total: 0 };
      throw new Error(/MODELERRORKEY_EXCEPTION/.test(text) ? 'NIDMS server error' : text.slice(0, 120));
    }
  });

  // ---------- dates ----------
  const toMs = d => {
    if (!d) return 0;
    if (typeof d === 'number') return d;
    const m = /\/Date\((-?\d+)/.exec(d); if (m) return +m[1];
    const uk = /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T]?(\d{1,2})?:?(\d{2})?:?(\d{2})?/.exec(d);
    if (uk) return new Date(+uk[3], uk[2] - 1, +uk[1], +(uk[4] || 0), +(uk[5] || 0), +(uk[6] || 0)).getTime();
    const t = Date.parse(d); return isNaN(t) ? 0 : t;
  };
  const dDate = ms => ms ? new Date(ms).toLocaleDateString('en-GB') : '';
  const dTime = ms => ms ? new Date(ms).toLocaleString('en-GB') : '';

  // ---------- who added the AFD tag ----------
  const getTagAdded = async (uuid, token) => retry(async () => {
    const text = await post('/portal/DVisaApplication/_AuditHistory_Read?applicationId=' + encodeURIComponent(uuid),
      { sort: '', page: 1, pageSize: 500, group: '', filter: '', __RequestVerificationToken: token });
    let rows; try { rows = JSON.parse(text).Data || []; } catch { return { ms: 0, by: '⚠️ could not read audit', n: 0 }; }
    const hits = rows
      .filter(r => /Tags_Add/i.test(r.BusinessActions || '') && new RegExp(AFD_TEXT, 'i').test(r.ActionComments || ''))
      .map(r => ({ ms: toMs(r.DateOfAudit), by: r.Username || '' }))
      .sort((a, b) => a.ms - b.ms);
    if (!hits.length) return { ms: 0, by: '— no Tags_Add entry', n: 0 };
    const last = hits[hits.length - 1];
    return { ...last, n: hits.length, firstMs: hits[0].ms };
  });

  // ---------- render ----------
  const COLS = ['AppNo', 'App Ref No.', 'Name', 'Date of Birth', 'Nationality', 'Passport', 'Purpose', 'Office', 'Status', 'Created', 'AFD added on', 'AFD added by', 'Days waiting'];
  let all = [];
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const filtered = () => {
    const p = q$('af-purpose').value, by = q$('af-by').value, q = q$('af-q').value.trim().toUpperCase();
    return all.filter(r => (!p || r.Purpose === p) && (!by || r._by === by) && (!q || COLS.some(c => String(r[c] ?? '').toUpperCase().includes(q))));
  };
  const fillSelect = (id, values, first) => {
    const cur = q$(id).value;
    q$(id).innerHTML = `<option value="">${first}</option>` + [...new Set(values.filter(Boolean))].sort()
      .map(v => `<option${v === cur ? ' selected' : ''}>${esc(v)}</option>`).join('');
  };
  const render = () => {
    const rows = filtered();
    q$('af-results').innerHTML = `<div style="padding:6px 8px;font-weight:bold">${rows.length} of ${all.length} applications</div>
      <table style="border-collapse:collapse;width:100%;font-size:12px">
      <thead style="position:sticky;top:0;background:#B7791F;color:#fff"><tr>${COLS.map(c => `<th style="padding:6px;text-align:left">${c}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr style="background:${r['Days waiting'] >= 30 ? '#f8d7da' : r['Days waiting'] >= 14 ? '#fff3cd' : ''}">${COLS.map(c =>
        `<td style="padding:4px 6px;border-bottom:1px solid #eee;vertical-align:top">${c === 'AppNo' && r._url ? `<a href="${esc(r._url)}" target="_blank">${esc(r[c])}</a>` : esc(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  };
  ['af-purpose', 'af-by'].forEach(id => q$(id).onchange = render);
  q$('af-q').oninput = render;

  // ---------- run ----------
  q$('af-run').onclick = async () => {
    q$('af-run').disabled = true; q$('af-copy').disabled = true;
    try {
      // 1) every application with the AFD tag
      const SIZE = 100, apps = new Map();
      for (let page = 1; page <= 200; page++) {
        say(`Finding AFD applications… page ${page}`);
        const { data, total } = await readPage(page, SIZE);
        data.forEach(a => apps.set(a.Uuid, a));
        if (!data.length || data.length < SIZE || (total != null && apps.size >= total)) break;
      }
      const list = [...apps.values()];
      if (!list.length) { say('No applications with the AFD tag.'); all = []; render(); return; }

      // 2) audit history for each: who added the tag
      const token = (await getTemplate()).__RequestVerificationToken
        || document.querySelector('input[name="__RequestVerificationToken"]')?.value || '';
      const today = Date.now();
      let next = 0, done = 0;
      all = new Array(list.length);
      const worker = async () => {
        while (next < list.length) {
          const i = next++, a = list[i];
          let t; try { t = await getTagAdded(a.Uuid, token); } catch (e) { t = { ms: 0, by: '⚠️ ' + e.message, n: 0 }; }
          all[i] = {
            AppNo: a.AppNo, 'App Ref No.': a.AppRefNo, Name: a.FullName, 'Date of Birth': dDate(toMs(a.DateOfBirth)),
            Nationality: a.Nationality, Passport: a.TravelDocNo, Purpose: a.MainPurpose, Office: a.OfficeName,
            Status: a.StatusName, Created: dDate(toMs(a.CreatedDate)),
            'AFD added on': dTime(t.ms) + (t.n > 1 ? `  (added ${t.n}x, first ${dDate(t.firstMs)})` : ''),
            'AFD added by': t.by,
            'Days waiting': t.ms ? Math.floor((today - t.ms) / 864e5) : '',
            _by: t.ms ? t.by : '', _ms: t.ms, _url: a.Url && a.Url !== 'Recapture' ? new URL(a.Url, location.href).href : ''
          };
          done++; say(`Reading audit histories… ${done} / ${list.length}`);
        }
      };
      await Promise.all(Array.from({ length: 3 }, worker));
      all.sort((x, y) => (x._ms || Infinity) - (y._ms || Infinity));   // longest waiting first

      fillSelect('af-purpose', all.map(r => r.Purpose), 'All');
      fillSelect('af-by', all.map(r => r._by), 'Anyone');
      const old = all.filter(r => r['Days waiting'] >= 30).length;
      say(`Done: ${all.length} AFD applications\n🔴 waiting 30+ days: ${old}\n🟡 14–29 days: ${all.filter(r => r['Days waiting'] >= 14 && r['Days waiting'] < 30).length}`);
    } catch (e) {
      say('💥 ' + e.message);
    } finally {
      render();
      q$('af-run').disabled = false; q$('af-copy').disabled = !all.length;
    }
  };

  // ---------- copy ----------
  q$('af-copy').onclick = async () => {
    const rows = filtered();
    const tsv = [COLS.join('\t'), ...rows.map(r => COLS.map(c => String(r[c] ?? '').replace(/\t/g, ' ')).join('\t'))].join('\n');
    try { await navigator.clipboard.writeText(tsv); }
    catch { const t = document.createElement('textarea'); t.value = tsv; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
    q$('af-copy').textContent = `✔ Copied ${rows.length} rows`;
    setTimeout(() => q$('af-copy').textContent = '📋 Copy for Excel', 2000);
  };
})();
