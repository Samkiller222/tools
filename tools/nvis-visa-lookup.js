(() => {
  document.getElementById('nvis-batch')?.remove();
  const form = document.forms.form1 || document.getElementById('form1');
  if (!form || !form.querySelector('[name="ctl04$txt_visanumber"]')) return alert('Open the N-VIS Search page first.');

  // ---------- UI ----------
  const today = new Date().toLocaleDateString('en-GB');
  const box = document.createElement('div');
  box.id = 'nvis-batch';
  box.style.cssText = 'position:fixed;inset:40px;z-index:999999;background:#fff;border:2px solid #0B5394;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.3);display:flex;flex-direction:column;font:13px Arial,sans-serif;color:#1C274C';
  box.innerHTML = `
    <div style="padding:10px 14px;background:#0B5394;color:#fff;display:flex;justify-content:space-between;align-items:center;border-radius:8px 8px 0 0">
      <b>N-VIS batch lookup: Visa Numbers</b>
      <button id="nv-close" style="background:none;border:none;color:#fff;font-size:20px;cursor:pointer">✕</button>
    </div>
    <div style="padding:12px;display:flex;gap:12px;flex:1;min-height:0">
      <div style="width:270px;display:flex;flex-direction:column;gap:8px">
        <label>Paste visa numbers, one per line.</label>
        <textarea id="nv-input" style="flex:1;font:12px monospace;padding:6px;border:1px solid #ccc;border-radius:6px"></textarea>
        <div style="display:flex;gap:6px">
          <label style="flex:1">From<br><input id="nv-from" value="01/01/2018" style="width:100%;padding:3px"></label>
          <label style="flex:1">To<br><input id="nv-to" value="${today}" style="width:100%;padding:3px"></label>
        </div>
        <small>N-VIS needs a date range. Keep it wide so older visas are found.</small>
        <label><input type="checkbox" id="nv-hide"> Show only NOT FOUND / errors</label>
        <button id="nv-run" style="padding:8px;background:#0B5394;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold">▶ Run</button>
        <button id="nv-copy" style="padding:8px;background:#198754;color:#fff;border:none;border-radius:6px;cursor:pointer" disabled>📋 Copy results for Excel</button>
        <div id="nv-status" style="font-weight:bold;white-space:pre-line"></div>
      </div>
      <div id="nv-results" style="flex:1;overflow:auto;border:1px solid #eee;border-radius:6px"></div>
    </div>`;
  document.body.appendChild(box);
  const q$ = id => box.querySelector('#' + id);
  q$('nv-close').onclick = () => box.remove();

  // ---------- one search = the same post-back the Search button does ----------
  const CLEAR = ['txt_application', 'txt_mv_application', 'txt_surname', 'txt_name', 'txt_dob', 'txt_passport',
                 'txt_host', 'txt_barcode', 'txt_transactionId'];
  const search = async (visaNo, from, to) => {
    const fd = new FormData(form);
    CLEAR.forEach(n => fd.set('ctl04$' + n, ''));
    fd.set('ctl04$txt_visanumber', visaNo);
    fd.set('ctl04$txt_datefrom', from);
    fd.set('ctl04$txt_dateto', to);
    fd.set('ctl04$ddl_status', '-2');
    fd.set('ctl04$ddl_visatype', 'ALL');
    fd.set('__EVENTTARGET', ''); fd.set('__EVENTARGUMENT', '');
    fd.set('ctl04$cb_search', 'Search');
    const res = await fetch(form.action, { method: 'POST', credentials: 'same-origin', body: new URLSearchParams(fd) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();
    window.__nvisLast = html;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    if (!doc.querySelector('[name="ctl04$txt_visanumber"]')) throw new Error('session expired? log in again');

    const table = [...doc.querySelectorAll('table')].find(t => t.querySelector('[class*="searchresult-c"]'))
               || doc.querySelector('.table-responsive table');
    if (!table) return { headers: [], rows: [] };

    const cellText = c => {
      const t = c.textContent.replace(/\s+/g, ' ').trim();
      const tip = c.querySelector('acronym,abbr,[title]')?.getAttribute('title')?.trim();
      return tip && tip !== t ? (t ? `${t} (${tip})` : tip) : t;
    };
    const trs = [...table.querySelectorAll('tr')];
    const headTr = trs.find(tr => tr.querySelector('th'));
    let headers = headTr ? [...headTr.children].map(cellText) : [];
    const rows = trs.filter(tr => tr !== headTr && tr.querySelectorAll('td').length > 2).map(tr => {
      const cells = [...tr.children].map(cellText);
      const link = tr.querySelector('a[href]:not([href^="javascript"])')?.href || '';
      return { cells, link };
    });
    if (!headers.length && rows.length) headers = rows[0].cells.map((_, i) => 'Col ' + (i + 1));
    return { headers, rows };
  };

  // ---------- helpers ----------
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = s => String(s || '').toUpperCase().replace(/\s+/g, '').trim();
  const statusColor = s => /issu|grant|print/i.test(s) ? '#d1e7dd' : /refus|annul|revok/i.test(s) ? '#f8d7da' : /closed|discontinu/i.test(s) ? '#e2e3e5' : '';
  let COLS = ['Visa No.', 'Result'], lastRows = [];

  const render = () => {
    let rows = lastRows;
    if (q$('nv-hide').checked) rows = rows.filter(r => /^(❌|💥)/.test(r.Result));
    q$('nv-results').innerHTML = `<table style="border-collapse:collapse;width:100%;font-size:12px">
      <thead style="position:sticky;top:0;background:#0B5394;color:#fff"><tr>${COLS.map(c => `<th style="padding:6px;text-align:left">${esc(c)}</th>`).join('')}<th></th></tr></thead>
      <tbody>${rows.map(r => {
        const bg = /^(❌|💥)/.test(r.Result) ? '#f8d7da' : statusColor(Object.values(r).join(' '));
        return `<tr style="background:${bg}">${COLS.map(c => `<td style="padding:5px;border-bottom:1px solid #eee;vertical-align:top">${esc(r[c])}</td>`).join('')}<td>${r._link ? `<a href="${esc(r._link)}" target="_blank">Open</a>` : ''}</td></tr>`;
      }).join('')}</tbody></table>`;
  };
  q$('nv-hide').onchange = render;

  // ---------- run ----------
  q$('nv-run').onclick = async () => {
    const list = [...new Set(q$('nv-input').value.split('\n').map(norm).filter(v => v.length >= 4))];
    if (!list.length) return;
    const from = q$('nv-from').value.trim(), to = q$('nv-to').value.trim();
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(from) || !/^\d{2}\/\d{2}\/\d{4}$/.test(to)) return alert('Dates must be DD/MM/YYYY');
    q$('nv-run').disabled = true; q$('nv-copy').disabled = true;

    const results = new Array(list.length);
    let next = 0, done = 0;
    const status = () => q$('nv-status').textContent = `Checked ${done} / ${list.length}`;
    status();

    const worker = async () => {
      while (next < list.length) {
        const i = next++, v = list[i];
        try {
          const { headers, rows } = await search(v, from, to);
          headers.forEach(h => { if (h && !COLS.includes(h)) COLS.push(h); });
          results[i] = rows.length
            ? rows.map(r => {
                const o = { 'Visa No.': v, Result: rows.length > 1 ? `✅ found (${rows.length} results)` : '✅ found', _link: r.link };
                r.cells.forEach((c, k) => { const h = headers[k]; if (h) o[h] = c; });
                return o;
              })
            : [{ 'Visa No.': v, Result: '❌ NOT FOUND' }];
        } catch (e) {
          results[i] = [{ 'Visa No.': v, Result: '💥 ERROR ' + e.message }];
        }
        done++; status();
        lastRows = results.filter(Boolean).flat(); render();
      }
    };
    await Promise.all(Array.from({ length: 2 }, worker));

    lastRows = results.flat(); render();
    const nf = results.filter(r => /^(❌|💥)/.test(r[0].Result)).length;
    q$('nv-status').textContent = `Done: ${list.length} checked\n✅ found: ${list.length - nf}\n❌ not found / errors: ${nf}`;
    q$('nv-run').disabled = false; q$('nv-copy').disabled = false;
  };

  // ---------- copy to Excel ----------
  q$('nv-copy').onclick = async () => {
    const tsv = [COLS.join('\t'), ...lastRows.map(r => COLS.map(c => String(r[c] ?? '').replace(/\t/g, ' ')).join('\t'))].join('\n');
    try { await navigator.clipboard.writeText(tsv); }
    catch { const t = document.createElement('textarea'); t.value = tsv; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
    q$('nv-copy').textContent = '✔ Copied';
    setTimeout(() => q$('nv-copy').textContent = '📋 Copy results for Excel', 2000);
  };
})();
