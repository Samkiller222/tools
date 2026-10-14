// CVU Tools launcher — loaded by the "CVU Tools" bookmark.
// To add a tool: put the file in /tools and add a line to TOOLS below.
(() => {
  const VERSION = '2026-10-14e';
  const TOOLS = [
    { site: 'nidms', file: 'cvu-comments.js',     name: 'Comment writer',               hint: 'Open application (needs the Internal Comments box)' },
    { site: 'nidms', file: 'nidms-lookup.js',     name: 'Passport / R No. lookup',      hint: 'Search D-Visa Applications page' },
    { site: 'nidms', file: 'nidms-refusals.js',   name: 'Refusal reasons + L1 + refused date', hint: 'Search D-Visa Applications page' },
    { site: 'nidms', file: 'nidms-duplicates.js', name: 'Passport duplicate check',      hint: 'Search D-Visa Applications page' },
    { site: 'nvis',  file: 'nvis-my-stickers.js', name: 'My Stickers export',            hint: 'Stickers → My Stickers' },
    { site: 'nvis',  file: 'nvis-visa-lookup.js', name: 'Visa number lookup (test)',     hint: 'N-VIS Search page' },
  ];
  const SITES = { nidms: 'NIDMS', nvis: 'N-VIS' };

  const me = document.currentScript?.src || [...document.scripts].map(s => s.src).find(s => /\/cvu\.js/.test(s)) || '';
  const BASE = me.replace(/cvu\.js.*$/, '');
  const here = /\/portal\/DVisaApplication|nidms/i.test(location.href) ? 'nidms'
             : /visa\.intra\.gov\.mt|N-VIS/i.test(location.href + document.title) ? 'nvis' : '';

  document.getElementById('cvu-launcher')?.remove();
  const box = document.createElement('div');
  box.id = 'cvu-launcher';
  box.style.cssText = 'position:fixed;top:60px;right:30px;z-index:1000000;width:320px;background:#fff;border:2px solid #1C274C;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.3);font:13px Arial,sans-serif;color:#1C274C;overflow:hidden';

  const btn = t => {
    const ok = t.site === here;
    return `<button data-file="${t.file}" ${ok ? '' : 'disabled'} title="${ok ? '' : 'Open ' + SITES[t.site] + ' → ' + t.hint}"
      style="display:block;width:100%;text-align:left;padding:9px 12px;margin:0 0 6px;border:1px solid ${ok ? '#1C274C' : '#ddd'};border-radius:6px;
      background:${ok ? '#fff' : '#f6f6f6'};color:${ok ? '#1C274C' : '#999'};cursor:${ok ? 'pointer' : 'not-allowed'};font:13px Arial">
      <b>${t.name}</b><br><small>${t.hint}</small></button>`;
  };
  const groups = Object.keys(SITES).sort((a, b) => (b === here) - (a === here));
  box.innerHTML = `
    <div style="padding:9px 12px;background:#1C274C;color:#fff;display:flex;justify-content:space-between;align-items:center">
      <b>CVU Tools</b><span><small style="opacity:.7;margin-right:8px">v${VERSION}</small>
      <button id="cvu-l-close" style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer">✕</button></span>
    </div>
    <div style="padding:10px 12px">
      ${groups.map(g => `<div style="font-weight:bold;margin:4px 0 6px;color:${g === here ? '#1C274C' : '#999'}">${SITES[g]}${g === here ? ' (this page)' : ''}</div>
        ${TOOLS.filter(t => t.site === g).map(btn).join('')}`).join('')}
      <div id="cvu-l-msg" style="font-size:12px;color:#8B0000"></div>
    </div>`;
  document.body.appendChild(box);
  box.querySelector('#cvu-l-close').onclick = () => box.remove();

  box.querySelectorAll('button[data-file]').forEach(b => b.onclick = () => {
    const s = document.createElement('script');
    s.src = BASE + 'tools/' + b.dataset.file + '?v=' + Date.now();
    s.onload = () => box.remove();
    s.onerror = () => box.querySelector('#cvu-l-msg').textContent = 'Could not load ' + b.dataset.file + '. Check your connection.';
    document.body.appendChild(s);
  });
})();
