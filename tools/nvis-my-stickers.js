(() => {
  document.getElementById('nvis-printed')?.remove();
  const live = document.forms.form1 || document.getElementById('form1');
  if (!live || !document.getElementById('ctl04_my_stickers_dg_mystickers')) return alert('Open Stickers → My Stickers in N-VIS first.');

  const P = 'ctl04$my_stickers$';
  const sel = id => { const s = document.getElementById(id); return s ? s.options[s.selectedIndex]?.text : ''; };

  // ---------- UI ----------
  const box = document.createElement('div');
  box.id = 'nvis-printed';
  box.style.cssText = 'position:fixed;inset:40px;z-index:999999;background:#fff;border:2px solid #0B5394;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.3);display:flex;flex-direction:column;font:13px Arial,sans-serif;color:#1C274C';
  box.innerHTML = `
    <div style="padding:10px 14px;background:#0B5394;color:#fff;display:flex;justify-content:space-between;align-items:center;border-radius:8px 8px 0 0">
      <b>My Stickers export</b>
      <button id="ps-close" style="background:none;border:none;color:#fff;font-size:20px;cursor:pointer">✕</button>
    </div>
    <div style="padding:12px;display:flex;gap:12px;flex:1;min-height:0">
      <div style="width:250px;display:flex;flex-direction:column;gap:8px">
        <div>User: <b>${sel('ctl04_my_stickers_ddl_user_filter') || '?'}</b><br>Status: <b>${sel('ctl04_my_stickers_ddl_status') || '?'}</b><br>
        <small>Uses the filters set on the page. To change them, pick them on the page first, then run again.</small></div>
        <button id="ps-run" style="padding:8px;background:#0B5394;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold">▶ Pull all pages</button>
        <hr style="width:100%;border:none;border-top:1px solid #eee">
        <label>Date from (optional)<br><input id="ps-from" placeholder="DD/MM/YYYY" style="width:100%;padding:3px"></label>
        <label>Date to (optional)<br><input id="ps-to" placeholder="DD/MM/YYYY" style="width:100%;padding:3px"></label>
        <label>Search<br><input id="ps-q" placeholder="name, sticker, application…" style="width:100%;padding:3px"></label>
        <button id="ps-copy" style="padding:8px;background:#198754;color:#fff;border:none;border-radius:6px;cursor:pointer" disabled>📋 Copy for Excel</button>
        <div id="ps-status" style="font-weight:bold;white-space:pre-line"></div>
      </div>
      <div id="ps-results" style="flex:1;overflow:auto;border:1px solid #eee;border-radius:6px"></div>
    </div>`;
  document.body.appendChild(box);
  const q$ = id => box.querySelector('#' + id);
  q$('ps-close').onclick = () => box.remove();
  const say = t => q$('ps-status').textContent = t;

  // ---------- reading a page ----------
  const txt = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const readRows = doc => {
    const t = doc.getElementById('ctl04_my_stickers_dg_mystickers');
    if (!t) return [];
    return [...t.querySelectorAll('tr')].filter(tr => !/dgHeader|dgPager/.test(tr.className) && tr.children.length >= 9).map(tr => {
      const c = [...tr.children].map(txt);
      return { '#': c[0], Sticker: c[2], 'Sticker Location': c[3], Status: c[4], Application: c[5], Applicant: c[6], Date: c[7], User: c[8] };
    });
  };
  const readPager = doc => {
    const td = doc.querySelector('#ctl04_my_stickers_dg_mystickers tr.dgPager td');
    if (!td) return { cur: 1, links: [] };
    const cur = +txt(td.querySelector('span')) || 1;
    const links = [...td.querySelectorAll('a')].map(a => ({
      text: txt(a), target: (/__doPostBack\('([^']+)'/.exec(a.getAttribute('href') || '') || [])[1],
      before: !!(a.compareDocumentPosition(td.querySelector('span') || a) & Node.DOCUMENT_POSITION_FOLLOWING)
    })).filter(l => l.target);
    return { cur, links };
  };

  // ---------- one post-back (like clicking a page number) ----------
  const postback = async (form, target) => {
    const fd = new FormData(form);
    fd.set('__EVENTTARGET', target); fd.set('__EVENTARGUMENT', '');
    const action = new URL(form.getAttribute('action') || location.href, location.href).href;
    const res = await fetch(action, { method: 'POST', credentials: 'same-origin', body: new URLSearchParams(fd) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    const f = doc.forms.form1 || doc.getElementById('form1');
    if (!f || !doc.getElementById('ctl04_my_stickers_dg_mystickers')) throw new Error('page not returned (session expired? log in again)');
    return { doc, form: f };
  };

  // ---------- render ----------
  const COLS = ['#', 'Sticker', 'Sticker Location', 'Status', 'Application', 'Applicant', 'Date', 'User'];
  let all = [];
  const toD = s => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s || ''); return m ? new Date(+m[3], m[2] - 1, +m[1]) : null; };
  const filtered = () => {
    const f = toD(q$('ps-from').value.trim()), t = toD(q$('ps-to').value.trim()), q = q$('ps-q').value.trim().toUpperCase();
    return all.filter(r => {
      const d = toD(r.Date);
      if (f && (!d || d < f)) return false;
      if (t && (!d || d > t)) return false;
      if (q && !COLS.some(c => String(r[c]).toUpperCase().includes(q))) return false;
      return true;
    });
  };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const render = () => {
    const rows = filtered();
    q$('ps-results').innerHTML = `<div style="padding:6px 8px;font-weight:bold">${rows.length} of ${all.length} stickers</div>
      <table style="border-collapse:collapse;width:100%;font-size:12px">
      <thead style="position:sticky;top:0;background:#0B5394;color:#fff"><tr>${COLS.map(c => `<th style="padding:6px;text-align:left">${c}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${COLS.map(c => `<td style="padding:4px 6px;border-bottom:1px solid #eee">${esc(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  };
  ['ps-from', 'ps-to', 'ps-q'].forEach(id => q$(id).oninput = render);

  // ---------- crawl ----------
  q$('ps-run').onclick = async () => {
    q$('ps-run').disabled = true; q$('ps-copy').disabled = true;
    const seen = new Map();
    const add = doc => readRows(doc).forEach(r => seen.set(r.Sticker + '|' + r.Application, r));
    try {
      let doc = document, form = live, { cur } = readPager(doc), steps = 0;

      // 1) go back to page 1
      while (cur > 1) {
        const { links } = readPager(doc);
        const l = links.find(l => l.text === '1') || links.find(l => l.text === '...' && l.before)
               || links.filter(l => l.before && /^\d+$/.test(l.text)).sort((a, b) => a.text - b.text)[0];
        if (!l) break;
        ({ doc, form } = await postback(form, l.target));
        const now = readPager(doc).cur;
        if (now >= cur || ++steps > 200) throw new Error('could not get back to page 1');
        cur = now; say(`Going back to page 1… (page ${cur})`);
      }

      // 2) walk forward page by page
      add(doc);
      for (let guard = 0; guard < 1000; guard++) {
        say(`Reading page ${cur}… ${seen.size} stickers so far`);
        all = [...seen.values()]; render();
        const { links } = readPager(doc);
        const l = links.find(l => l.text === String(cur + 1)) || links.find(l => l.text === '...' && !l.before);
        if (!l) break;
        ({ doc, form } = await postback(form, l.target));
        const now = readPager(doc).cur;
        if (now !== cur + 1) throw new Error(`expected page ${cur + 1}, got ${now}`);
        cur = now; add(doc);
      }
      all = [...seen.values()].sort((a, b) => (+a['#'] || 0) - (+b['#'] || 0));
      say(`Done: ${cur} pages, ${all.length} stickers`);
    } catch (e) {
      all = [...seen.values()].sort((a, b) => (+a['#'] || 0) - (+b['#'] || 0));
      say(`💥 Stopped: ${e.message}\n${all.length} stickers collected so far`);
    }
    render();
    q$('ps-run').disabled = false; q$('ps-copy').disabled = !all.length;
  };

  // ---------- copy ----------
  q$('ps-copy').onclick = async () => {
    const rows = filtered();
    const tsv = [COLS.join('\t'), ...rows.map(r => COLS.map(c => String(r[c] ?? '')).join('\t'))].join('\n');
    try { await navigator.clipboard.writeText(tsv); }
    catch { const t = document.createElement('textarea'); t.value = tsv; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
    q$('ps-copy').textContent = `✔ Copied ${rows.length} rows`;
    setTimeout(() => q$('ps-copy').textContent = '📋 Copy for Excel', 2000);
  };
})();
