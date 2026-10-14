(() => {
  document.getElementById('cvu-refusals')?.remove();

  const box = document.createElement('div');
  box.id = 'cvu-refusals';
  box.style.cssText = 'position:fixed;inset:40px;z-index:999999;background:#fff;border:2px solid #8B0000;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.3);display:flex;flex-direction:column;font:13px Arial,sans-serif;color:#1C274C';
  box.innerHTML = `
    <div style="padding:10px 14px;background:#8B0000;color:#fff;display:flex;justify-content:space-between;align-items:center;border-radius:8px 8px 0 0">
      <b>Refusal reasons lookup</b>
      <button id="rf-close" style="background:none;border:none;color:#fff;font-size:20px;cursor:pointer">✕</button>
    </div>
    <div style="padding:12px;display:flex;gap:12px;flex:1;min-height:0">
      <div style="width:270px;display:flex;flex-direction:column;gap:8px">
        <label>Paste passports and/or R numbers, one per line.</label>
        <textarea id="rf-input" style="flex:1;font:12px monospace;padding:6px;border:1px solid #ccc;border-radius:6px"></textarea>
        <label><input type="checkbox" id="rf-onlyref" checked> Only show refused applications</label>
        <label><input type="checkbox" id="rf-internal"> Also get Internal Comments &amp; Additional Remarks<br><small>(loads the Visa tab data for each case)</small></label>
        <button id="rf-run" style="padding:8px;background:#8B0000;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold">▶ Run</button>
        <button id="rf-copy" style="padding:8px;background:#198754;color:#fff;border:none;border-radius:6px;cursor:pointer" disabled>📋 Copy results for Excel</button>
        <div id="rf-status" style="font-weight:bold;white-space:pre-line"></div>
      </div>
      <div id="rf-results" style="flex:1;overflow:auto;border:1px solid #eee;border-radius:6px"></div>
    </div>`;
  document.body.appendChild(box);
  const q$ = id => box.querySelector('#' + id);
  q$('rf-close').onclick = () => box.remove();

  const token = document.querySelector('input[name="__RequestVerificationToken"]')?.value || '';
  const post = (url, data) => fetch(url, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
    body: typeof data === 'string' ? data : new URLSearchParams(data).toString()
  }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); });

  // ---------- search (same request the Search page sends; works from any NIDMS page) ----------
  let tmplP = null;
  const getTemplate = () => tmplP || (tmplP = (async () => {
    let form = document.getElementById('search-visa-applications-form');
    if (!form) {
      const html = await (await fetch('/portal/DVisaApplication', { credentials: 'same-origin' })).text();
      form = new DOMParser().parseFromString(html, 'text/html').getElementById('search-visa-applications-form');
    }
    if (!form) { tmplP = null; throw new Error('could not load the NIDMS search form (logged out?)'); }
    const t = {};
    form.querySelectorAll('input[name],select[name],textarea[name]').forEach(el => {
      t[el.name] = (el.name === 'AdvancedFilters' || el.name === '__RequestVerificationToken') ? el.value : '';
    });
    return t;
  })());
  const searchOnce = async q => {
    const body = new URLSearchParams({ sort: '', page: 1, pageSize: 50, group: '', filter: '', ...(await getTemplate()), QuickCriteria: q });
    const res = await fetch('/portal/DVisaApplication/DVisaApplications_Read', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
      body
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    try { return JSON.parse(text).Data || []; }
    catch {
      if (/no match/i.test(text)) return [];
      throw new Error(/MODELERRORKEY_EXCEPTION/.test(text) ? 'NIDMS server error' : text.slice(0, 120));
    }
  };
  const search = async q => {
    if (!q) return [];
    try { return await searchOnce(q); }
    catch (e) { await new Promise(r => setTimeout(r, 1500)); return searchOnce(q); }   // one retry
  };

  const getGrounds = async uuid => {
    const text = await post('/portal/DVisaApplication/AppRefusalGrounds_Read?applicationID=' + encodeURIComponent(uuid),
      { sort: '', group: '', filter: '', __RequestVerificationToken: token });
    try { return (JSON.parse(text).Data || []).map(g => g.Ground + (g.Comments ? ` (${g.Comments})` : '')); }
    catch { return ['⚠️ could not read grounds']; }
  };

  const toMs = d => {
    if (!d) return 0;
    if (typeof d === 'number') return d;
    const m = /\/Date\((-?\d+)/.exec(d);
    if (m) return +m[1];
    const uk = /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T]?(\d{1,2})?:?(\d{2})?:?(\d{2})?/.exec(d);
    if (uk) return new Date(+uk[3], uk[2] - 1, +uk[1], +(uk[4] || 0), +(uk[5] || 0), +(uk[6] || 0)).getTime();
    const t = Date.parse(d);
    return isNaN(t) ? 0 : t;
  };
  const fmtDate = d => { const ms = toMs(d); return ms ? new Date(ms).toLocaleDateString('en-GB') : (d || ''); };

  // One audit-history read gives both: sent to L1, and refused
  const getAudit = async uuid => {
    const text = await post('/portal/DVisaApplication/_AuditHistory_Read?applicationId=' + encodeURIComponent(uuid),
      { sort: '', page: 1, pageSize: 500, group: '', filter: '', __RequestVerificationToken: token });
    let rows;
    try { rows = JSON.parse(text).Data || []; }
    catch { const e = { date: '⚠️ could not read audit', by: '' }; return { l1: e, ref: e }; }
    const dt = s => s.ms ? new Date(s.ms).toLocaleString('en-GB') : String(s.raw ?? '');
    const pick = (re, label) => {
      const hits = rows
        .filter(r => re.test(r.BusinessActions || ''))
        .map(r => ({ ms: toMs(r.DateOfAudit), raw: r.DateOfAudit, by: r.Username || '' }))
        .sort((a, b) => a.ms - b.ms);
      if (!hits.length) return { date: '— ' + label, by: '' };
      const first = hits[0], last = hits[hits.length - 1];
      return {
        date: dt(last) + (hits.length > 1 ? `  (${hits.length}x, first ${dt(first)})` : ''),
        by: last.by + (hits.length > 1 && first.by !== last.by ? `  (first: ${first.by})` : '')
      };
    };
    return {
      l1: pick(/SendForVettingLevel1/i, 'not sent to L1'),
      ref: pick(/DVisa_Refuse\b/i, 'no refusal entry')
    };
  };

  const getVisaTab = async uuid => {
    const html = await post('/portal/DVisaApplication/_Visa', { applicationID: uuid, isVisaLoaded: false, __RequestVerificationToken: token });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const read = id => { const el = doc.getElementById(id); return (el?.getAttribute('value') || el?.textContent || '').trim(); };
    return { internal: read('GroundsInternalComments'), remarks: read('OtherRefusalGrounds') };
  };

  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const parse = text => {
    const out = new Map();
    for (const raw of text.split('\n')) {
      const vals = raw.toUpperCase().split(/[\/,;|\t]+/).map(c => c.replace(/\s+/g, '').replace(/[^A-Z0-9]/g, '')).filter(v => v.length >= 5);
      if (vals.length && !out.has(vals.join('|'))) out.set(vals.join('|'), { input: raw.trim(), values: vals });
    }
    return [...out.values()];
  };

  const COLS = ['Input', 'AppNo', 'Name', 'Passport', 'Status', 'Purpose', 'Created', 'Sent to L1 – date', 'Sent to L1 – by', 'Refused – date', 'Refused – by', 'Refusal Grounds', 'Additional Remarks', 'Internal Comments'];
  let lastRows = [];
  const render = rows => {
    q$('rf-results').innerHTML = `<table style="border-collapse:collapse;width:100%;font-size:12px">
      <thead style="position:sticky;top:0;background:#8B0000;color:#fff"><tr>${COLS.map(c => `<th style="padding:6px;text-align:left">${c}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr style="background:${/^(❌|💥)/.test(r.Status || '') ? '#f8d7da' : ''}">${COLS.map(c => `<td style="padding:5px;border-bottom:1px solid #eee;vertical-align:top;white-space:pre-line">${esc(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  };

  const checkOne = async ({ input, values }, onlyRef, wantInternal) => {
    try {
      const found = (await Promise.all(values.map(search))).flat();
      let apps = [...new Map(found.map(a => [a.Uuid, a])).values()];
      if (!apps.length) return [{ Input: input, Status: '❌ NOT FOUND' }];
      if (onlyRef) apps = apps.filter(a => /refus/i.test(a.StatusName || ''));
      if (!apps.length) return [{ Input: input, Status: '❌ No refused application found' }];

      const rows = [];
      for (const a of apps) {
        const isRef = /refus/i.test(a.StatusName || '');
        const [grounds, audit] = await Promise.all([
          isRef ? getGrounds(a.Uuid) : [],
          getAudit(a.Uuid).catch(e => { const x = { date: '⚠️ ' + e.message, by: '' }; return { l1: x, ref: x }; })
        ]);
        const { l1, ref } = audit;
        let extra = { internal: '', remarks: '' };
        if (isRef && wantInternal) { try { extra = await getVisaTab(a.Uuid); } catch (e) { extra.internal = '⚠️ ' + e.message; } }
        rows.push({
          Input: input, AppNo: a.AppNo, Name: a.FullName, Passport: a.TravelDocNo,
          Status: a.StatusName, Purpose: a.MainPurpose, Created: fmtDate(a.CreatedDate),
          'Sent to L1 – date': l1.date, 'Sent to L1 – by': l1.by,
          'Refused – date': isRef ? ref.date : '', 'Refused – by': isRef ? ref.by : '',
          'Refusal Grounds': grounds.map((g, i) => `${i + 1}. ${g}`).join('\n'),
          'Additional Remarks': extra.remarks, 'Internal Comments': extra.internal
        });
      }
      return rows;
    } catch (e) {
      return [{ Input: input, Status: '💥 ERROR ' + e.message }];
    }
  };

  q$('rf-run').onclick = async () => {
    const entries = parse(q$('rf-input').value);
    if (!entries.length) return;
    const onlyRef = q$('rf-onlyref').checked, wantInternal = q$('rf-internal').checked;
    q$('rf-run').disabled = true; q$('rf-copy').disabled = true;
    const results = new Array(entries.length);
    let next = 0, done = 0;
    const status = () => q$('rf-status').textContent = `Checked ${done} / ${entries.length}`;
    status();
    const worker = async () => {
      while (next < entries.length) {
        const i = next++;
        results[i] = await checkOne(entries[i], onlyRef, wantInternal);
        done++; status();
        if (done % 5 === 0) render(results.filter(Boolean).flat());
      }
    };
    await Promise.all(Array.from({ length: 3 }, worker));
    lastRows = results.flat();
    render(lastRows);
    const refused = lastRows.filter(r => r['Refusal Grounds']).length;
    const missing = lastRows.filter(r => /^(❌|💥)/.test(r.Status || '')).length;
    q$('rf-status').textContent = `Done: ${entries.length} checked\n🔴 refused applications: ${refused}\n❌ not found / errors: ${missing}`;
    q$('rf-run').disabled = false; q$('rf-copy').disabled = false;
  };

  q$('rf-copy').onclick = async () => {
    const clean = v => String(v ?? '').replace(/\t/g, ' ').replace(/\n/g, ' | ');
    const tsv = [COLS.join('\t'), ...lastRows.map(r => COLS.map(c => clean(r[c])).join('\t'))].join('\n');
    try { await navigator.clipboard.writeText(tsv); }
    catch { const t = document.createElement('textarea'); t.value = tsv; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
    q$('rf-copy').textContent = '✔ Copied';
    setTimeout(() => q$('rf-copy').textContent = '📋 Copy results for Excel', 2000);
  };
})();
