(() => {
  document.getElementById('cvu-batch')?.remove();

  const box = document.createElement('div');
  box.id = 'cvu-batch';
  box.style.cssText = 'position:fixed;inset:40px;z-index:999999;background:#fff;border:2px solid #1C274C;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.3);display:flex;flex-direction:column;font:13px Arial,sans-serif;color:#1C274C';
  box.innerHTML = `
    <div style="padding:10px 14px;background:#1C274C;color:#fff;display:flex;justify-content:space-between;align-items:center;border-radius:8px 8px 0 0">
      <b>Batch lookup: Passport / R No.</b>
      <button id="cb-close" style="background:none;border:none;color:#fff;font-size:20px;cursor:pointer">✕</button>
    </div>
    <div style="padding:12px;display:flex;gap:12px;flex:1;min-height:0">
      <div style="width:260px;display:flex;flex-direction:column;gap:8px">
        <label>Paste list, one per line.<br><small>Passport, R No., or both on one line.</small></label>
        <textarea id="cb-input" style="flex:1;font:12px monospace;padding:6px;border:1px solid #ccc;border-radius:6px"></textarea>
        <label><input type="checkbox" id="cb-hide"> Show only NOT FOUND / errors</label>
        <button id="cb-run" style="padding:8px;background:#1C274C;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold">▶ Run</button>
        <button id="cb-copy" style="padding:8px;background:#198754;color:#fff;border:none;border-radius:6px;cursor:pointer" disabled>📋 Copy results for Excel</button>
        <div id="cb-status" style="font-weight:bold;white-space:pre-line"></div>
      </div>
      <div id="cb-results" style="flex:1;overflow:auto;border:1px solid #eee;border-radius:6px"></div>
    </div>`;
  document.body.appendChild(box);
  const q$ = id => box.querySelector('#' + id);
  q$('cb-close').onclick = () => box.remove();

  const token = document.querySelector('input[name="__RequestVerificationToken"]')?.value || '';
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

  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = d => { const m = /\/Date\((\d+)\)\//.exec(d || ''); return m ? new Date(+m[1]).toLocaleDateString('en-GB') : (d || ''); };
  const isR = t => /^R\d{5,}$/.test(t);

  const parse = text => {
    const entries = new Map(), skipped = [];
    for (const raw of text.split('\n')) {
      const line = raw.trim().toUpperCase();
      if (!line) continue;
      const values = [];
      for (const chunk of line.split(/[\/,;|\t]+/)) {
        const parts = chunk.trim().split(/\s+/).filter(Boolean);
        const pieces = parts.length > 1 && parts.some(isR) ? parts : [parts.join('')];
        for (const p of pieces) { const v = p.replace(/[^A-Z0-9]/g, ''); if (v.length >= 5) values.push(v); }
      }
      if (!values.length) { skipped.push(raw.trim()); continue; }
      const rNos = values.filter(isR), passports = values.filter(v => !isR(v));
      const key = [...passports, ...rNos].join('|');
      if (!entries.has(key)) entries.set(key, { input: raw.trim(), passports, rNos });
    }
    return { entries: [...entries.values()], skipped };
  };

  const COLS = ['Input', 'Result', 'Found via', 'AppNo', 'Name', 'Passport on file', 'Status', 'Purpose', 'Office', 'Created'];
  let lastRows = [];
  const render = rows => {
    if (q$('cb-hide').checked) rows = rows.filter(r => /^(❌|💥)/.test(r.Result));
    const color = r => r.startsWith('✅') ? '#d1e7dd' : /^(❌|💥)/.test(r) ? '#f8d7da' : '#fff3cd';
    q$('cb-results').innerHTML = `<table style="border-collapse:collapse;width:100%;font-size:12px">
      <thead style="position:sticky;top:0;background:#1C274C;color:#fff"><tr>${COLS.map(c => `<th style="padding:6px;text-align:left">${c}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr style="background:${color(r.Result)}">${COLS.map(c => `<td style="padding:5px;border-bottom:1px solid #eee">${esc(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  };
  q$('cb-hide').onchange = () => render(lastRows);

  const checkOne = async ({ input, passports, rNos }) => {
    try {
      const passHits = (await Promise.all(passports.map(search))).flat();
      const rHits = (await Promise.all(rNos.map(search))).flat();
      const viaPass = new Set(passHits.map(a => a.Uuid));
      const viaR = new Set(rHits.map(a => a.Uuid));
      const apps = [...new Map([...passHits, ...rHits].map(a => [a.Uuid, a])).values()];
      if (!apps.length) return [{ Input: input, Result: '❌ NOT FOUND' }];

      const both = passports.length && rNos.length;
      return apps.map(a => {
        const p = viaPass.has(a.Uuid), r = viaR.has(a.Uuid);
        return {
          Input: input,
          Result: both ? (p && r ? '✅ BOTH' : p ? '⚠️ passport only' : '⚠️ R no. only') : '✅ found',
          'Found via': [p && 'Passport', r && 'R No.'].filter(Boolean).join(' + '),
          AppNo: a.AppNo, Name: a.FullName, 'Passport on file': a.TravelDocNo,
          Status: a.StatusName, Purpose: a.MainPurpose, Office: a.OfficeName, Created: fmt(a.CreatedDate)
        };
      });
    } catch (e) {
      return [{ Input: input, Result: '💥 ERROR ' + e.message }];
    }
  };

  q$('cb-run').onclick = async () => {
    const { entries, skipped } = parse(q$('cb-input').value);
    if (!entries.length) return;
    q$('cb-run').disabled = true; q$('cb-copy').disabled = true;
    const results = new Array(entries.length);
    let next = 0, done = 0;
    const status = () => q$('cb-status').textContent = `Checked ${done} / ${entries.length}`;
    status();
    const worker = async () => {
      while (next < entries.length) {
        const i = next++;
        results[i] = await checkOne(entries[i]);
        done++; status();
        if (done % 10 === 0) render(results.filter(Boolean).flat());
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    lastRows = results.flat();
    render(lastRows);
    const count = re => results.filter(r => re.test(r[0].Result)).length;
    q$('cb-status').textContent =
      `Done: ${entries.length} unique\n✅ found: ${count(/^(✅|⚠️)/)}\n❌ not found / errors: ${count(/^(❌|💥)/)}` +
      (skipped.length ? `\nSkipped: ${skipped.join(', ')}` : '');
    q$('cb-run').disabled = false; q$('cb-copy').disabled = false;
  };

  q$('cb-copy').onclick = async () => {
    const tsv = [COLS.join('\t'), ...lastRows.map(r => COLS.map(c => r[c] ?? '').join('\t'))].join('\n');
    try { await navigator.clipboard.writeText(tsv); }
    catch { const t = document.createElement('textarea'); t.value = tsv; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
    q$('cb-copy').textContent = '✔ Copied';
    setTimeout(() => q$('cb-copy').textContent = '📋 Copy results for Excel', 2000);
  };
})();
