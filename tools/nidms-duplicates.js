(() => {
  document.getElementById('cvu-dupes')?.remove();

  const box = document.createElement('div');
  box.id = 'cvu-dupes';
  box.style.cssText = 'position:fixed;inset:40px;z-index:999999;background:#fff;border:2px solid #5A3E8C;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.3);display:flex;flex-direction:column;font:13px Arial,sans-serif;color:#1C274C';
  box.innerHTML = `
    <div style="padding:10px 14px;background:#5A3E8C;color:#fff;display:flex;justify-content:space-between;align-items:center;border-radius:8px 8px 0 0">
      <b>Passport duplicate check + application status</b>
      <button id="dp-close" style="background:none;border:none;color:#fff;font-size:20px;cursor:pointer">✕</button>
    </div>
    <div style="padding:12px;display:flex;gap:12px;flex:1;min-height:0">
      <div style="width:270px;display:flex;flex-direction:column;gap:8px">
        <label>Paste passport numbers, one per line.</label>
        <textarea id="dp-input" style="flex:1;font:12px monospace;padding:6px;border:1px solid #ccc;border-radius:6px"></textarea>
        <label><input type="checkbox" id="dp-lookupall" checked> Look up every passport in NIDMS<br><small>(untick to look up only the ones duplicated in the list)</small></label>
        <label><input type="checkbox" id="dp-onlydupes"> Show only duplicates</label>
        <button id="dp-run" style="padding:8px;background:#5A3E8C;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold">▶ Run</button>
        <button id="dp-copy" style="padding:8px;background:#198754;color:#fff;border:none;border-radius:6px;cursor:pointer" disabled>📋 Copy results for Excel</button>
        <div id="dp-status" style="font-weight:bold;white-space:pre-line"></div>
      </div>
      <div id="dp-results" style="flex:1;overflow:auto;border:1px solid #eee;border-radius:6px"></div>
    </div>`;
  document.body.appendChild(box);
  const q$ = id => box.querySelector('#' + id);
  q$('dp-close').onclick = () => box.remove();

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
    const body = new URLSearchParams({ sort: '', page: 1, pageSize: 100, group: '', filter: '', ...(await getTemplate()), QuickCriteria: q });
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
  const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const statusColor = s => /issu|grant|approv/i.test(s) ? '#d1e7dd' : /refus|reject/i.test(s) ? '#f8d7da' : /regist/i.test(s) ? '#cfe2ff' : /withdr|cancel|revok|annul/i.test(s) ? '#e2e3e5' : '#fff3cd';

  const parse = text => {
    const map = new Map(), skipped = [];
    text.split('\n').forEach((raw, i) => {
      const v = norm(raw);
      if (!raw.trim()) return;
      if (v.length < 5) { skipped.push(`line ${i + 1}: "${raw.trim()}"`); return; }
      if (!map.has(v)) map.set(v, { passport: v, lines: [], typed: [] });
      map.get(v).lines.push(i + 1);
      map.get(v).typed.push(raw.trim());
    });
    return { items: [...map.values()], skipped };
  };

  const COLS = ['Passport', 'Flag', 'Times in list', 'Lines in list', 'Applications in NIDMS', 'AppNo', 'Name', 'Status', 'Purpose', 'Office', 'Created'];
  let lastRows = [];
  const isDupe = r => r['Times in list'] > 1 || r['Applications in NIDMS'] > 1;
  const render = rows => {
    if (q$('dp-onlydupes').checked) rows = rows.filter(isDupe);
    q$('dp-results').innerHTML = `<table style="border-collapse:collapse;width:100%;font-size:12px">
      <thead style="position:sticky;top:0;background:#5A3E8C;color:#fff"><tr>${COLS.map(c => `<th style="padding:6px;text-align:left">${c}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${COLS.map(c => `<td style="padding:5px;border-bottom:1px solid #eee;vertical-align:top;${c === 'Status' && r.Status ? 'background:' + statusColor(r.Status) + ';font-weight:bold' : ''}${c === 'Flag' && isDupe(r) ? 'background:#ffe5b4;font-weight:bold' : ''}">${esc(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  };
  q$('dp-onlydupes').onchange = () => render(lastRows);

  const checkOne = async ({ passport, lines }, lookup) => {
    const base = { Passport: passport, 'Times in list': lines.length, 'Lines in list': lines.join(', ') };
    const listFlag = lines.length > 1 ? `🔁 ${lines.length}x in list` : '';
    if (!lookup) return [{ ...base, Flag: listFlag || '—', 'Applications in NIDMS': '' }];
    try {
      const apps = (await search(passport)).filter(a => norm(a.TravelDocNo) === passport);
      const unique = [...new Map(apps.map(a => [a.Uuid, a])).values()]
        .sort((a, b) => (+(/\d+/.exec(a.CreatedDate || '') || [0])[0]) - (+(/\d+/.exec(b.CreatedDate || '') || [0])[0]));
      const appFlag = unique.length > 1 ? `📑 ${unique.length} applications` : '';
      const flag = [listFlag, appFlag].filter(Boolean).join(' + ') || (unique.length ? '✅ single' : '❌ not found in NIDMS');
      if (!unique.length) return [{ ...base, Flag: flag, 'Applications in NIDMS': 0 }];
      return unique.map(a => ({
        ...base, Flag: flag, 'Applications in NIDMS': unique.length,
        AppNo: a.AppNo, Name: a.FullName, Status: a.StatusName,
        Purpose: a.MainPurpose, Office: a.OfficeName, Created: fmt(a.CreatedDate)
      }));
    } catch (e) {
      return [{ ...base, Flag: '💥 ERROR ' + e.message, 'Applications in NIDMS': '' }];
    }
  };

  q$('dp-run').onclick = async () => {
    const { items, skipped } = parse(q$('dp-input').value);
    if (!items.length) return;
    const lookupAll = q$('dp-lookupall').checked;
    q$('dp-run').disabled = true; q$('dp-copy').disabled = true;
    const results = new Array(items.length);
    let next = 0, done = 0;
    const status = () => q$('dp-status').textContent = `Checked ${done} / ${items.length}`;
    status();
    const worker = async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await checkOne(items[i], lookupAll || items[i].lines.length > 1);
        done++; status();
        if (done % 10 === 0) render(results.filter(Boolean).flat());
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    lastRows = results.flat();
    render(lastRows);

    const listDupes = items.filter(x => x.lines.length > 1).length;
    const multiApp = results.filter(r => r[0]['Applications in NIDMS'] > 1).length;
    const notFound = results.filter(r => r[0]['Applications in NIDMS'] === 0).length;
    const byStatus = {};
    lastRows.forEach(r => { if (r.Status) byStatus[r.Status] = (byStatus[r.Status] || 0) + 1; });
    q$('dp-status').textContent =
      `Done: ${items.length} unique passports\n🔁 duplicated in list: ${listDupes}\n📑 with 2+ applications: ${multiApp}\n❌ not found: ${notFound}\n\nApplications by status:\n` +
      Object.entries(byStatus).sort((a, b) => b[1] - a[1]).map(([s, n]) => `  ${s}: ${n}`).join('\n') +
      (skipped.length ? `\n\nSkipped: ${skipped.join('; ')}` : '');
    q$('dp-run').disabled = false; q$('dp-copy').disabled = false;
  };

  q$('dp-copy').onclick = async () => {
    const rows = q$('dp-onlydupes').checked ? lastRows.filter(isDupe) : lastRows;
    const tsv = [COLS.join('\t'), ...rows.map(r => COLS.map(c => String(r[c] ?? '').replace(/\t/g, ' ')).join('\t'))].join('\n');
    try { await navigator.clipboard.writeText(tsv); }
    catch { const t = document.createElement('textarea'); t.value = tsv; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
    q$('dp-copy').textContent = '✔ Copied';
    setTimeout(() => q$('dp-copy').textContent = '📋 Copy results for Excel', 2000);
  };
})();
