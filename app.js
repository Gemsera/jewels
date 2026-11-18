(async function () {
  const D = await (await fetch('data.json')).json();
  const C = window.Cluster;
  const SVGNS = 'http://www.w3.org/2000/svg';
  const MAX_NOTABLES = { Small: 1, Medium: 2, Large: 3 };
  const SIZE_BY_INDEX = ['Small', 'Medium', 'Large'];
  const SOCKET_OPTIONS = { Large: [[2, '2 (rare)'], [1, '1 (unique, index 6)'], [3, '3 (Voices)']], Medium: [[1, '1 (rare)'], [0, '0 (unique)']], Small: [[0, '0']] };
  const COL = { gold: '#e8c15a', goldFill: '#3a2d12', socket: '#4fb3e8', entry: '#6fcf8a', small: '#93a0b8', smallFill: '#1c2738', link: '#6d7f9e', mega: '#b98cf0', sel: '#ffffff' };
  const notableByName = Object.fromEntries(D.notables.map(n => [n.name, n]));
  for (const size in D.jewels) D.jewels[size].skills = D.jewels[size].skills.filter(s => !s.tag.startsWith('old_'));

  // ---------- helpers
  const $ = id => document.getElementById(id);
  function el(tag, attrs = {}, parent) { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
  function h(tag, attrs = {}, html) { const e = document.createElement(tag); for (const k in attrs) { if (k === 'class') e.className = attrs[k]; else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]); } if (html !== undefined) e.innerHTML = html; return e; }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  // ---------- large socket labels
  const larges = Object.values(D.sockets).filter(s => s.size === 2);
  const LABELS = [[180, 'Left', 'Marauder/Templar'], [-120, 'Top-left', 'Templar/Witch'], [-60, 'Top-right', 'Witch/Shadow'], [0, 'Right', 'Shadow/Ranger'], [60, 'Bottom-right', 'Ranger/Duelist'], [120, 'Bottom-left', 'Duelist/Marauder']];
  larges.forEach(s => {
    const a = Math.atan2(s.y, s.x) * 180 / Math.PI;
    let best = LABELS[0], bd = 999;
    for (const L of LABELS) { const d = Math.abs(((a - L[0] + 540) % 360) - 180); if (d < bd) { bd = d; best = L; } }
    s.label = best[1]; s.classes = best[2]; s.order = LABELS.indexOf(best);
  });
  larges.sort((a, b) => a.order - b.order);

  // ---------- configs
  function notablesFor(tag) { return D.notables.filter(n => n.tags[tag]); }
  const MEGA_DEFAULT = ['Feed the Fury', 'Fuel the Fight', 'Drive the Destruction'];
  function megaCfg() {
    let picks = MEGA_DEFAULT.filter(n => notableByName[n]);
    if (picks.length < 3) picks = D.notables.slice(0, 3).map(n => n.name);
    return { kind: 'mega', size: 'Medium', skill: null, nodeCount: 4, socketCount: 0, notables: picks, showAll: true, q: '' };
  }
  function defaultCfg(size) {
    if (size === 'Megalomaniac') return megaCfg();
    const J = D.jewels[size];
    const pref = { Large: 'affliction_spell_damage', Medium: 'affliction_minion_life', Small: 'affliction_maximum_life' }[size];
    const skill = J.skills.find(s => s.id === pref) || J.skills[0];
    const nodeCount = size === 'Large' ? 8 : size === 'Medium' ? 4 : 3;
    const all = notablesFor(skill.tag);
    const pre = all.filter(n => n.affix === 'Prefix'), suf = all.filter(n => n.affix === 'Suffix');
    const pick = size === 'Large' ? pre.slice(0, 2).concat(suf.slice(0, 1)) : pre.slice(0, size === 'Medium' ? 2 : 1);
    return { kind: 'rare', size, skill: skill.id, nodeCount, socketCount: SOCKET_OPTIONS[size][0][0], notables: pick.map(n => n.name), showAll: false, q: '' };
  }
  function notableLimit(cfg) { if (cfg.kind === 'mega') return 3; return Math.max(0, Math.min(MAX_NOTABLES[cfg.size], cfg.nodeCount - cfg.socketCount - 1)); }
  function trimNotables(cfg) { const lim = notableLimit(cfg); if (cfg.notables.length > lim) cfg.notables = cfg.notables.slice(0, lim); }
  const sizeTagCache = {};
  function sizesFor(n) {
    if (sizeTagCache[n.name] !== undefined) return sizeTagCache[n.name];
    const out = [];
    for (const sz of ['Large', 'Medium', 'Small']) if (D.jewels[sz].skills.some(s => n.tags[s.tag])) out.push(sz[0]);
    return (sizeTagCache[n.name] = out.join('/'));
  }

  // ---------- state (+ remembered in this browser)
  const STORE = 'cjlab.v2';
  let state = { root: larges[0].id, focus: larges[0].id, jewels: {}, zoom: 'all', sel: null, trade: { league: 'Standard', status: 'securable', enchant: true, exact: true, match: 'all' } };
  // trade preferences (league etc.) live under their own key so they survive any other state problem
  const TRADE_STORE = 'cjlab.trade';
  const STATUS_OPTIONS = [['securable', 'Instant Buyout'], ['available', 'Instant Buyout and In Person'], ['online', 'In Person (online)'], ['any', 'Any (incl. offline)']];
  try {
    const tp = JSON.parse(localStorage.getItem(TRADE_STORE) || 'null');
    if (tp && typeof tp === 'object') {
      if (typeof tp.league === 'string' && tp.league.trim()) state.trade.league = tp.league;
      if (STATUS_OPTIONS.some(o => o[0] === tp.status)) state.trade.status = tp.status;
      ['enchant', 'exact'].forEach(k => { if (typeof tp[k] === 'boolean') state.trade[k] = tp[k]; });
      if (typeof tp.match === 'string') state.trade.match = tp.match;
    }
  } catch (e) { /* storage unavailable */ }
  function saveTrade() { try { localStorage.setItem(TRADE_STORE, JSON.stringify(state.trade)); } catch (e) { } }
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (saved && D.sockets[saved.root]) {
      state.root = saved.root; state.focus = D.sockets[saved.focus] ? saved.focus : saved.root;
      for (const k in saved.jewels) { const c = saved.jewels[k]; if (D.sockets[k] && D.jewels[c.size]) { c.notables = (c.notables || []).filter(n => notableByName[n]); c.q = ''; state.jewels[k] = c; } }
      state.zoom = saved.zoom === 'focus' ? 'focus' : 'all';
    }
  } catch (e) { /* storage unavailable */ }
  if (!state.jewels[state.root]) state.jewels[state.root] = defaultCfg('Large');
  function save() { try { localStorage.setItem(STORE, JSON.stringify({ root: state.root, focus: state.focus, jewels: state.jewels, zoom: state.zoom })); } catch (e) { } }

  // ---------- layout of the whole (nested) cluster
  const childName = {};
  function buildAll() {
    const out = [];
    (function rec(socket, depth) {
      const cfg = state.jewels[socket.id];
      if (!cfg) return;
      const J = D.jewels[cfg.size];
      const skill = cfg.kind === 'mega' ? { name: 'Nothing', stats: ['Grants nothing'] } : (J.skills.find(s => s.id === cfg.skill) || J.skills[0]);
      const L = C.computeLayout(J, { nodeCount: cfg.nodeCount, socketCount: cfg.socketCount, notables: cfg.notables.map(n => notableByName[n]).filter(Boolean), smallName: skill.name });
      const geo = C.placeLayout(L, J, socket, D);
      const entry = { socket, cfg, J, skill, L, geo, depth };
      out.push(entry);
      for (const p of L.present) {
        const s = L.slots[p];
        if (s.type !== 'Socket') continue;
        s.child = C.findChildSocket(D, socket.proxyGroup, s.jewelIndex);
        if (s.child) { childName[s.child.id] = s.name.replace('Jewel ', ''); rec(s.child, depth + 1); }
      }
    })(D.sockets[state.root], 0);
    return out;
  }
  function socketTitle(sock) {
    if (sock.size === 2) return `${sock.label} Large socket`;
    return `${SIZE_BY_INDEX[sock.size]} ${(childName[sock.id] || 'socket').toLowerCase()}`;
  }
  function jewelTitle(cfg) { return !cfg ? 'Empty' : cfg.kind === 'mega' ? 'Megalomaniac' : `${cfg.size} Cluster Jewel`; }

  // ---------- actions
  function selectRoot(id) {
    state.root = id; state.focus = id; state.sel = null;
    if (!state.jewels[id]) state.jewels[id] = defaultCfg('Large');
    render();
  }
  function focusSocket(id) {
    state.focus = id; state.sel = null;
    const s = D.sockets[id];
    if (!state.jewels[id]) state.jewels[id] = defaultCfg(s.size === 0 ? 'Small' : 'Medium');
    render();
  }

  // ---------- socket picker + minimap
  function drawSocketBar() {
    const bar = $('socketbar'); bar.innerHTML = '';
    larges.forEach(s => bar.appendChild(h('button', { class: 'button is-dark-soft' + (s.id === state.root ? ' is-selected' : ''), title: `Between ${s.classes}`, onclick: () => selectRoot(s.id) }, `${esc(s.label)}<small class="is-hidden-mobile">${esc(s.classes)}</small>`)));
  }
  const T = D.tree;
  let overviewBase = null;
  function drawOverview(all) {
    const svg = $('overview');
    if (!overviewBase) {
      let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      T.n.forEach(([x, y]) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); });
      const pad = 700;
      svg.setAttribute('viewBox', `${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`);
      let d = '';
      for (const [a, b] of T.e) { const A = T.n[a], B = T.n[b]; if (Math.hypot(A[0] - B[0], A[1] - B[1]) > 1500) continue; d += `M${A[0]} ${A[1]}L${B[0]} ${B[1]}`; }
      overviewBase = d;
    }
    svg.innerHTML = '';
    el('path', { d: overviewBase, stroke: '#34507a', 'stroke-width': 45, fill: 'none' }, svg);
    for (const e of all) for (const p of e.L.present) { const s = e.L.slots[p]; el('circle', { cx: s.x, cy: s.y, r: 110, fill: s.type === 'Notable' ? COL.gold : s.type === 'Socket' ? COL.socket : COL.small }, svg); }
    for (const s of larges) {
      const g = el('g', { style: 'cursor:pointer' }, svg);
      el('circle', { cx: s.x, cy: s.y, r: 900, fill: 'transparent' }, g);
      el('circle', { cx: s.x, cy: s.y, r: 380, fill: s.id === state.root ? '#2f8fe0' : '#13213a', stroke: s.id === state.root ? '#cfe6ff' : '#4f74a8', 'stroke-width': 110 }, g);
      el('title', {}, g).textContent = `${s.label} (${s.classes})`;
      g.addEventListener('click', () => selectRoot(s.id));
    }
  }

  // ---------- main viewer
  function arcPath(cx, cy, r, a1, a2) {
    let span = a2 - a1; while (span <= 0) span += Math.PI * 2;
    const x1 = cx + Math.sin(a1) * r, y1 = cy - Math.cos(a1) * r, x2 = cx + Math.sin(a2) * r, y2 = cy - Math.cos(a2) * r;
    return `M${x1} ${y1}A${r} ${r} 0 ${span > Math.PI ? 1 : 0} 1 ${x2} ${y2}`;
  }
  function drawZoomTools(all) {
    const t = $('zoomTools'); t.innerHTML = '';
    const nested = all.length > 1;
    t.appendChild(h('button', { class: 'button is-dark-soft' + (state.zoom === 'all' ? ' is-selected' : ''), onclick: () => { state.zoom = 'all'; render(); } }, 'Fit all'));
    const fb = h('button', { class: 'button is-dark-soft' + (state.zoom === 'focus' ? ' is-selected' : ''), onclick: () => { state.zoom = 'focus'; render(); } }, 'Zoom to jewel');
    if (!nested) fb.setAttribute('disabled', '');
    t.appendChild(fb);
  }
  function drawDetail(all) {
    const svg = $('detail'); svg.innerHTML = '';
    const root = D.sockets[state.root];
    const focusE = all.find(e => e.socket.id === state.focus);
    const useFocus = state.zoom === 'focus' && all.length > 1 && focusE;
    const pts = [];
    const scope = useFocus ? [focusE] : all;
    pts.push(useFocus ? [focusE.socket.x, focusE.socket.y] : [root.x, root.y]);
    scope.forEach(e => e.L.present.forEach(p => pts.push([e.L.slots[p].x, e.L.slots[p].y])));
    if (!useFocus && state.zoom === 'focus' && !focusE) { const s = D.sockets[state.focus]; pts.push([s.x, s.y]); }
    const narrow = window.innerWidth < 769;
    const basePad = useFocus ? 260 : narrow ? 260 : 420;
    // labelled notables: include an estimate of label extents so names never clip
    const labelled = scope.filter(e => e.socket.id === state.focus || all.length === 1);
    let half = 0, cx = 0, cy = 0;
    for (let pass = 0; pass < 2; pass++) {
      const k0 = half ? half / 700 : 1;
      const P = pts.slice();
      labelled.forEach(e => e.L.present.forEach(p => {
        const s = e.L.slots[p]; if (s.type !== 'Notable') return;
        const ox = s.x - e.geo.cx, oy = s.y - e.geo.cy, len = Math.hypot(ox, oy) || 1;
        const off = 44 + 30 + 20 * k0, w = s.name.length * 34 * k0 * 0.56;
        const lx = s.x + ox / len * off, ly = s.y + oy / len * off;
        const anchor = Math.abs(ox / len) < .3 ? 0 : ox > 0 ? 1 : -1;
        const x1 = anchor === 0 ? lx - w / 2 : anchor > 0 ? lx : lx - w, x2 = x1 + w;
        P.push([x1, ly], [x2, ly]);
      }));
      const minX = Math.min(...P.map(p => p[0])), maxX = Math.max(...P.map(p => p[0]));
      const minY = Math.min(...P.map(p => p[1])), maxY = Math.max(...P.map(p => p[1]));
      cx = (minX + maxX) / 2; cy = (minY + maxY) / 2;
      half = Math.max(maxX - minX, maxY - minY) / 2 + (pass === 0 ? basePad : basePad * 0.45);
    }
    svg.setAttribute('viewBox', `${cx - half} ${cy - half} ${half * 2} ${half * 2}`);
    const k = half / 700; // scale strokes/text with zoom so they stay readable
    const inView = (x, y) => Math.abs(x - cx) < half + 300 && Math.abs(y - cy) < half + 300;

    let d = '';
    for (const [a, b] of T.e) { const A = T.n[a], B = T.n[b]; if (!inView(A[0], A[1]) && !inView(B[0], B[1])) continue; if (Math.hypot(A[0] - B[0], A[1] - B[1]) > 1500) continue; d += `M${A[0]} ${A[1]}L${B[0]} ${B[1]}`; }
    el('path', { d, stroke: '#1f2e48', 'stroke-width': 8 * k, fill: 'none' }, svg);
    for (const [x, y, t] of T.n) if (inView(x, y)) el('circle', { cx: x, cy: y, r: t === 'N' ? 30 : t === 'k' ? 42 : 18, fill: '#131d30', stroke: '#22324f', 'stroke-width': 4 }, svg);

    const sr = el('g', {}, svg);
    el('circle', { cx: root.x, cy: root.y, r: 52, fill: '#0f2236', stroke: COL.socket, 'stroke-width': 8 }, sr);
    el('text', { x: root.x, y: root.y - 76, 'text-anchor': 'middle', fill: '#8a9bb8', 'font-size': 36 * k }, sr).textContent = `${root.label} socket`;

    for (const e of all) {
      const { L, geo } = e;
      const isFocus = e.socket.id === state.focus;
      const dim = useFocus ? 1 : (all.length > 1 && !isFocus ? .55 : 1);
      const lg = el('g', { opacity: dim }, svg);
      el('circle', { cx: geo.cx, cy: geo.cy, r: geo.r, fill: 'none', stroke: isFocus && all.length > 1 ? '#2f5f99' : '#1c2a42', 'stroke-width': 3 * k, 'stroke-dasharray': `${10 * k} ${14 * k}` }, lg);
      const ent = L.slots[0];
      if (ent) el('line', { x1: e.socket.x, y1: e.socket.y, x2: ent.x, y2: ent.y, stroke: COL.entry, 'stroke-width': 10, 'stroke-linecap': 'round', opacity: .85 }, lg);
      for (const [a, b] of L.links) el('path', { d: arcPath(geo.cx, geo.cy, geo.r, L.slots[a].angle, L.slots[b].angle), stroke: COL.link, 'stroke-width': 10, fill: 'none' }, lg);

      for (const p of L.present) {
        const s = L.slots[p];
        const g = el('g', { style: 'cursor:pointer', opacity: dim }, svg);
        const r = s.type === 'Notable' ? 44 : s.type === 'Socket' ? 38 : 26;
        const isSel = state.sel && state.sel.socket === e.socket.id && state.sel.idx === p;
        el('circle', { cx: s.x, cy: s.y, r: r + 40, fill: 'transparent' }, g); // bigger tap target
        if (isSel) el('circle', { cx: s.x, cy: s.y, r: r + 26, fill: 'rgba(255,255,255,.08)', stroke: COL.sel, 'stroke-width': 5, 'stroke-dasharray': '12 8' }, g);
        if (s.type === 'Socket') {
          const filled = s.child && state.jewels[s.child.id];
          const isF = s.child && s.child.id === state.focus;
          el('circle', { cx: s.x, cy: s.y, r, fill: filled ? '#123a57' : '#0f2236', stroke: COL.socket, 'stroke-width': isF ? 13 : 7 }, g);
          if (filled) el('circle', { cx: s.x, cy: s.y, r: r * .42, fill: COL.socket }, g);
          if (!filled) el('text', { x: s.x, y: s.y + 14, 'text-anchor': 'middle', fill: '#e6f4ff', 'font-size': 44, 'font-weight': 700 }, g).textContent = '+';
        } else {
          const isN = s.type === 'Notable';
          el('circle', { cx: s.x, cy: s.y, r, fill: isN ? COL.goldFill : COL.smallFill, stroke: isN ? COL.gold : COL.small, 'stroke-width': isN ? 8 : 6 }, g);
        }
        if (p === 0) el('circle', { cx: s.x, cy: s.y, r: r + 14, fill: 'none', stroke: COL.entry, 'stroke-width': 6 }, g);
        if (s.dist !== undefined && s.type !== 'Socket') {
          el('text', { x: s.x, y: s.y + (s.type === 'Notable' ? 13 : 10), 'text-anchor': 'middle', fill: s.type === 'Notable' ? '#f6dc94' : '#dfe6f3', 'font-size': s.type === 'Notable' ? 38 : 28, 'font-weight': 700 }, g).textContent = s.dist;
        }
        if (s.type === 'Notable' && (isFocus || all.length === 1)) {
          const ox = s.x - geo.cx, oy = s.y - geo.cy, len = Math.hypot(ox, oy) || 1;
          const off = r + 30 + 20 * k;
          const lx = s.x + ox / len * off, ly = s.y + oy / len * off;
          el('text', { x: lx, y: ly + 12 * k, 'text-anchor': Math.abs(ox / len) < .3 ? 'middle' : ox > 0 ? 'start' : 'end', fill: COL.gold, 'font-size': 34 * k, 'font-weight': 600, 'paint-order': 'stroke', stroke: '#0b111c', 'stroke-width': 10 * k }, g).textContent = s.name;
        }
        g.addEventListener('click', () => onNodeClick(e, s, p));
      }
    }
  }

  function nodeInfoHTML(e, s) {
    if (s.type === 'Notable') {
      const n = s.notable;
      return `<p class="mb-1"><span class="t-Notable">${esc(n.name)}</span> <span class="tag is-small ${n.affix === 'Suffix' ? 'is-suffix' : 'is-ghost'}">${n.affix}</span> <span class="tag is-small is-ghost">sort #${n.sort}</span> <span class="tag is-small is-ghost">ilvl ${n.level}+</span></p>${n.stats.map(x => `<p class="statline">${esc(x)}</p>`).join('')}<p class="statline mt-1">Index ${s.idx} · <b>${plural(s.dist, 'point')}</b> from the parent socket</p>`;
    }
    if (s.type === 'Socket') return `<p><span class="t-Socket">${s.child ? SIZE_BY_INDEX[s.child.size] + ' jewel socket' : 'Jewel socket'}</span>, index ${s.idx}. ${s.child ? `Holds: <b>${esc(jewelTitle(state.jewels[s.child.id]))}</b>.` : ''}</p>`;
    return `<p><span class="t-Small">${esc(e.skill.name)}</span> <span class="tag is-small is-ghost">small passive</span></p><p class="statline">${e.skill.stats.map(esc).join(' · ')}</p><p class="statline mt-1">Index ${s.idx} · <b>${plural(s.dist, 'point')}</b> from the parent socket${s.idx === 0 ? ' · entry node' : ''}</p>`;
  }
  function onNodeClick(e, s, p) {
    if (s.type === 'Socket' && s.child) { focusSocket(s.child.id); return; }
    state.sel = { socket: e.socket.id, idx: p };
    if (state.focus !== e.socket.id) state.focus = e.socket.id;
    render();
  }
  function drawInfo(all) {
    const box = $('info');
    if (state.sel) {
      const e = all.find(x => x.socket.id === state.sel.socket);
      const s = e && e.L.slots[state.sel.idx];
      if (s) { box.innerHTML = nodeInfoHTML(e, s); return; }
    }
    box.innerHTML = '<p class="statline">Tap a node to see its stats. Tap a blue socket to put a jewel in it.</p>';
  }

  // ---------- stats
  function drawStats(all) {
    const e = all.find(x => x.socket.id === state.focus);
    const box = $('stats');
    if (!e) { box.innerHTML = ''; return; }
    const { L } = e;
    const hasN = L.present.some(p => L.slots[p].type === 'Notable');
    box.innerHTML = `<div class="stat-box gold"><p class="heading">ALL NOTABLES</p><p class="title">${hasN ? L.notableCost : '–'}</p></div><div class="stat-box"><p class="heading">ALL SOCKETS</p><p class="title">${L.socketCost || '–'}</p></div><div class="stat-box"><p class="heading">WHOLE JEWEL</p><p class="title">${L.allCost}</p></div>`;
  }

  // ---------- breadcrumb
  function drawCrumbs(all) {
    const c = $('crumbs'); c.innerHTML = '';
    const chain = [];
    let s = D.sockets[state.focus];
    while (s) { chain.unshift(s); s = s.parent ? Object.values(D.sockets).find(x => x.id === s.parent) : null; }
    // parent ids in data point at the parent socket; fall back to root if chain does not start there
    if (chain[0].id !== state.root) chain.unshift(D.sockets[state.root]);
    chain.forEach(sock => {
      const li = h('li', { class: sock.id === state.focus ? 'is-active' : '' });
      const a = h('a', { onclick: () => { state.focus = sock.id; state.sel = null; render(); } }, `${esc(socketTitle(sock))} <span class="has-text-grey">· ${esc(jewelTitle(state.jewels[sock.id]))}</span>`);
      li.appendChild(a); c.appendChild(li);
    });
    // children of focused jewel as quick links
    const e = all.find(x => x.socket.id === state.focus);
    if (e) {
      const kids = e.L.present.map(p => e.L.slots[p]).filter(x => x.type === 'Socket' && x.child);
      kids.forEach(k => {
        const li = h('li');
        li.appendChild(h('a', { onclick: () => focusSocket(k.child.id) }, `<span class="has-text-info">+ ${esc(socketTitle(k.child))}</span>`));
        c.appendChild(li);
      });
    }
  }

  // ---------- config
  function field(label, control, help) {
    const f = h('div', { class: 'field' });
    f.appendChild(h('label', { class: 'label' }, label));
    const c = h('div', { class: 'control' }); c.appendChild(control); f.appendChild(c);
    if (help) f.appendChild(h('p', { class: 'help has-text-grey' }, help));
    return f;
  }
  function selectEl(options, value, onchange) {
    const wrap = h('div', { class: 'select is-fullwidth' });
    const s = h('select');
    options.forEach(([v, t]) => s.appendChild(h('option', { value: v }, esc(t))));
    s.value = value; s.onchange = () => onchange(s.value);
    wrap.appendChild(s); return wrap;
  }
  function segmented(options, value, onclick, extraClass = '') {
    const b = h('div', { class: 'buttons has-addons are-small mb-0' });
    options.forEach(([v, t, cls]) => b.appendChild(h('button', { class: `button is-dark-soft ${cls || ''} ${extraClass} ${String(v) === String(value) ? 'is-selected' : ''}`, onclick: () => onclick(v) }, t)));
    return b;
  }

  function drawConfig() {
    const box = $('config'); box.innerHTML = '';
    const sock = D.sockets[state.focus];
    const cfg = state.jewels[state.focus];
    const cap = sock.size;

    // jewel type as toggle tabs
    const kinds = [];
    SIZE_BY_INDEX.slice(0, cap + 1).reverse().forEach(sz => kinds.push([sz, sz]));
    if (cap >= 1) kinds.push(['Megalomaniac', '<span class="is-hidden-mobile">★ Megalomaniac</span><span class="is-hidden-tablet">★ Mega</span>']);
    if (state.focus !== state.root) kinds.push(['', 'Empty']);
    const cur = !cfg ? '' : cfg.kind === 'mega' ? 'Megalomaniac' : cfg.size;
    const tabs = h('div', { class: 'tabs is-toggle is-small is-fullwidth mb-4' });
    const ul = h('ul');
    kinds.forEach(([v, t]) => {
      const li = h('li', { class: (v === cur ? 'is-active' : '') + (v === 'Megalomaniac' ? ' mega' : '') });
      li.appendChild(h('a', { onclick: () => { if (v === cur) return; if (!v) delete state.jewels[state.focus]; else state.jewels[state.focus] = defaultCfg(v); state.sel = null; render(); } }, t));
      ul.appendChild(li);
    });
    tabs.appendChild(ul); box.appendChild(tabs);

    if (!cfg) { box.appendChild(h('div', { class: 'notification node-info' }, 'This socket is empty. Pick a jewel type above to see where its nodes land.')); return; }
    if (cfg.kind === 'mega') { drawMegaConfig(box, cfg); return; }

    const J = D.jewels[cfg.size];
    const skill = J.skills.find(s => s.id === cfg.skill) || J.skills[0];
    box.appendChild(field('Enchant · small passive type', selectEl(J.skills.map(s => [s.id, `${s.name} (${notablesFor(s.tag).length} notables)`]), cfg.skill, v => {
      cfg.skill = v; const tag = J.skills.find(s => s.id === v).tag;
      if (!cfg.showAll) cfg.notables = cfg.notables.filter(n => notableByName[n].tags[tag]);
      render();
    }), skill.stats.join(' · ')));

    const cols = h('div', { class: 'columns is-variable is-2 mb-0' });
    const c1 = h('div', { class: 'column is-7-tablet' });
    const counts = []; for (let i = J.minNodes; i <= J.maxNodes; i++) counts.push([i, String(i)]);
    c1.appendChild(field('Passives added', segmented(counts, cfg.nodeCount, v => { cfg.nodeCount = +v; trimNotables(cfg); render(); })));
    const c2 = h('div', { class: 'column is-5-tablet' });
    c2.appendChild(field('Jewel sockets', selectEl(SOCKET_OPTIONS[cfg.size], cfg.socketCount, v => { cfg.socketCount = +v; trimNotables(cfg); render(); })));
    cols.appendChild(c1); cols.appendChild(c2); box.appendChild(cols);

    const pool = (cfg.showAll ? D.notables : notablesFor(skill.tag)).slice().sort((a, b) => a.sort - b.sort);
    notablePicker(box, cfg, pool, notableLimit(cfg), {
      toggle: h('div', {}, '').appendChild(segmented([[0, 'This enchant'], [1, 'All notables']], cfg.showAll ? 1 : 0, v => { cfg.showAll = !!+v; render(); })).parentNode,
      placementOf: null,
    });

    const warns = [];
    const sel = cfg.notables.map(n => notableByName[n]);
    const pre = sel.filter(n => n.affix === 'Prefix').length, suf = sel.filter(n => n.affix === 'Suffix').length;
    if (cfg.size === 'Large' && (pre > 2 || suf > 1)) warns.push('A rare Large can have at most 2 prefix notables and 1 suffix notable.');
    if (cfg.size !== 'Large' && suf > 0) warns.push('Suffix notables only roll on Large cluster jewels.');
    if (sel.some(n => !n.tags[skill.tag])) warns.push(`Some picked notables can't roll with the “${skill.name}” enchant. They're shown for theory only.`);
    if (cfg.size === 'Large' && cfg.socketCount !== 2) warns.push('Rare Large jewels always have 2 sockets. 1 or 3 sockets only appear on uniques.');
    if (cfg.size === 'Medium' && cfg.socketCount !== 1) warns.push('Rare Medium jewels always have 1 socket.');
    if (warns.length) box.appendChild(h('div', { class: 'notification is-warning is-light mt-3 py-2 px-3 is-size-7' }, warns.map(esc).join('<br>')));
    tradePanel(box, cfg, skill);
  }

  function notablePicker(box, cfg, pool, limit, opts) {
    const head = h('div', { class: 'mb-2 mt-2', style: 'display:flex;align-items:center;justify-content:space-between;gap:.5rem;flex-wrap:wrap' });
    head.appendChild(h('div', { style: 'display:flex;align-items:center;gap:.5rem' }, `<span class="label mb-0">Notables</span><span class="tag is-ghost">${cfg.notables.length}/${limit} · placed by sort #</span>`));
    if (opts.toggle) head.appendChild(opts.toggle);
    box.appendChild(head);

    // picked, in placement order, removable
    const picked = cfg.notables.map(n => notableByName[n]).sort((a, b) => a.sort - b.sort);
    const pickedBox = h('div', { class: 'picked mb-3' });
    if (!picked.length) pickedBox.appendChild(h('span', { class: 'statline' }, 'No notables picked yet. Choose from the list below.'));
    picked.forEach((n, i) => {
      const tag = h('span', { class: 'tag is-gold' }, `${esc(n.name)} <span class="has-text-grey-light ml-1">#${n.sort}</span>${opts.placementOf ? ` <span class="ml-1" style="color:var(--entry)">${opts.placementOf(i, picked.length)}</span>` : ''}`);
      tag.appendChild(h('button', { class: 'delete is-small', 'aria-label': 'remove', onclick: () => { cfg.notables = cfg.notables.filter(x => x !== n.name); render(); } }));
      pickedBox.appendChild(tag);
    });
    box.appendChild(pickedBox);

    const ctl = h('div', { class: 'control has-icons-left mb-2' });
    const search = h('input', { class: 'input is-small', type: 'search', placeholder: `Search ${pool.length} notables by name or stat…` });
    search.value = cfg.q || '';
    ctl.appendChild(search);
    ctl.appendChild(h('span', { class: 'icon is-small is-left' }, '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7f93b5" stroke-width="2.5"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>'));
    box.appendChild(ctl);
    const full = cfg.notables.length >= limit;
    if (full && limit > 0) box.appendChild(h('p', { class: 'help has-text-grey mb-2' }, `All ${limit} slots filled. Remove a tag above to swap one out.`));
    const list = h('div', { class: 'nlist' }); box.appendChild(list);

    function fill() {
      list.innerHTML = '';
      const q = (cfg.q || '').toLowerCase();
      const items = pool.filter(n => !q || n.name.toLowerCase().includes(q) || n.stats.some(s => s.toLowerCase().includes(q)));
      for (const n of items) {
        const sel = cfg.notables.includes(n.name);
        const dis = !sel && full;
        const hint = !sel && !dis && opts.hintFor ? opts.hintFor(n, picked) : '';
        const sz = sizesFor(n);
        const it = h('div', { class: 'nitem' + (sel ? ' sel' : '') + (dis ? ' dis' : '') });
        it.innerHTML = `<span class="check">${sel ? '✓' : ''}</span><div><div class="nm">${esc(n.name)}<span class="tag is-small is-ghost">#${n.sort}</span>${n.affix === 'Suffix' ? '<span class="tag is-small is-suffix">Suffix</span>' : ''}${cfg.kind === 'mega' ? (sz ? `<span class="tag is-small is-ghost">${sz}</span>` : '<span class="tag is-small is-mega">Mega only</span>') : ''}${hint ? `<span class="tag is-small is-hint">${hint}</span>` : ''}</div><div class="meta">${n.stats.map(esc).join(' · ')}</div></div>`;
        it.addEventListener('click', () => {
          if (dis) return;
          if (sel) cfg.notables = cfg.notables.filter(x => x !== n.name); else cfg.notables.push(n.name);
          const top = list.scrollTop; render(); const nl = document.querySelector('.nlist'); if (nl) nl.scrollTop = top;
        });
        list.appendChild(it);
      }
      if (!items.length) list.appendChild(h('div', { class: 'nitem statline' }, 'No notables match.'));
    }
    search.oninput = () => { cfg.q = search.value; fill(); };
    fill();
  }

  function drawMegaConfig(box, cfg) {
    box.appendChild(h('div', { class: 'notification node-info mb-3' }, `<p class="mb-1"><b style="color:var(--mega)">Megalomaniac</b>, a unique Medium Cluster Jewel (corrupted)</p><p class="statline">Adds 4 Passive Skills · Added Small Passive Skills grant Nothing · 3 random notables from any cluster pool · no jewel socket</p>`));
    const slotName = ['front · 2 pts', 'back · 3 pts', 'front · 2 pts'];
    notablePicker(box, cfg, D.notables.slice().sort((a, b) => a.sort - b.sort), 3, {
      placementOf: (i, n) => n === 3 ? slotName[i] : '',
      hintFor: (n, picked) => {
        if (picked.length !== 2) return '';
        const trio = picked.concat([n]).sort((a, b) => a.sort - b.sort);
        return 'goes ' + slotName[trio.indexOf(n)].split(' ·')[0];
      },
    });
    if (cfg.notables.length < 3) box.appendChild(h('div', { class: 'notification is-warning is-light mt-3 py-2 px-3 is-size-7' }, 'A real Megalomaniac always has exactly 3 notables. Fewer is shown for theory only.'));
    tradePanel(box, cfg, null);
  }

  // ---------- trade search (pathofexile.com/trade)
  const TRADE = { enchant: 'enchant.stat_3948993189', passives: 'enchant.stat_3086156145' };
  function buildTradeQuery(cfg, skill) {
    const t = state.trade;
    const notables = cfg.notables.map(n => notableByName[n]).filter(n => n && n.trade);
    const notableFilters = notables.map(n => ({ id: n.trade }));
    const query = { status: { option: t.status || 'securable' }, stats: [] };
    if (cfg.kind === 'mega') {
      query.name = 'Megalomaniac';
      query.type = 'Medium Cluster Jewel';
    } else {
      query.type = `${cfg.size} Cluster Jewel`;
      query.filters = { type_filters: { filters: { rarity: { option: 'nonunique' } } } };
      const req = [];
      if (t.enchant && skill && skill.trade) req.push({ id: TRADE.enchant, value: { option: Number(skill.trade) } });
      if (t.exact) req.push({ id: TRADE.passives, value: { min: cfg.nodeCount, max: cfg.nodeCount } });
      if (req.length) query.stats.push({ type: 'and', filters: req });
    }
    if (notableFilters.length) {
      const atLeast = t.match === 'all' ? notableFilters.length : Math.min(Number(t.match), notableFilters.length);
      if (atLeast >= notableFilters.length) query.stats.push({ type: 'and', filters: notableFilters });
      else query.stats.push({ type: 'count', value: { min: atLeast }, filters: notableFilters });
    }
    if (!query.stats.length) query.stats.push({ type: 'and', filters: [] });
    return { query, sort: { price: 'asc' } };
  }
  function tradeUrl(cfg, skill) {
    const league = (state.trade.league || 'Standard').trim() || 'Standard';
    return `https://www.pathofexile.com/trade/search/${encodeURIComponent(league)}?q=${encodeURIComponent(JSON.stringify(buildTradeQuery(cfg, skill)))}`;
  }
  function tradePanel(box, cfg, skill) {
    const t = state.trade;
    const wrap = h('div', { class: 'trade-box mt-4' });
    wrap.appendChild(h('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:.5rem;flex-wrap:wrap', class: 'mb-2' },
      `<span class="label mb-0">Trade search</span><span class="tag is-ghost">${esc(cfg.kind === 'mega' ? 'Megalomaniac' : cfg.size + ' Cluster Jewel')}</span>`));

    // league
    const lg = h('div', { class: 'field mb-2' });
    const lc = h('div', { class: 'control' });
    const li = h('input', { class: 'input is-small', type: 'text', list: 'leagueList', placeholder: 'League name, e.g. Standard', value: t.league });
    const setLeague = () => { t.league = li.value; refresh(); saveTrade(); };
    li.addEventListener('input', setLeague); li.addEventListener('change', setLeague); li.addEventListener('blur', setLeague);
    lc.appendChild(li); lg.appendChild(h('label', { class: 'label', style: 'font-size:.7rem' }, 'League'));
    lg.appendChild(lc);
    lg.appendChild(h('datalist', { id: 'leagueList' }, ['Standard', 'Hardcore', 'SSF Standard'].map(x => `<option value="${x}">`).join('')));
    lg.appendChild(h('p', { class: 'help has-text-grey' }, 'Type the league exactly as the trade site names it. It’s saved in this browser and kept between visits.'));
    wrap.appendChild(lg);

    // options
    const opts = h('div', { class: 'trade-opts' });
    function chk(key, label, title) {
      const l = h('label', { class: 'checkbox', title: title || '' });
      const c = h('input', { type: 'checkbox' }); c.checked = !!t[key];
      c.addEventListener('change', () => { t[key] = c.checked; refresh(); saveTrade(); });
      l.appendChild(c); l.appendChild(document.createTextNode(' ' + label));
      return l;
    }
    if (cfg.kind !== 'mega') {
      opts.appendChild(chk('enchant', `Enchant: ${skill ? skill.name : ''}`));
      opts.appendChild(chk('exact', `Exactly ${cfg.nodeCount} passives`, 'Notable positions depend on the passive count'));
    }
    const sf = h('div', { class: 'field mb-2' });
    sf.appendChild(h('label', { class: 'label', style: 'font-size:.7rem' }, 'Listing type'));
    sf.appendChild(selectEl(STATUS_OPTIONS, t.status, v => { t.status = v; refresh(); saveTrade(); }));
    wrap.appendChild(sf);
    wrap.appendChild(opts);

    const n = cfg.notables.length;
    if (n >= 2) {
      const mopts = [['all', `All ${n} notables`]];
      for (let k = n - 1; k >= 1; k--) mopts.push([String(k), `At least ${k} of ${n}`]);
      if (!mopts.some(o => o[0] === String(t.match))) t.match = 'all';
      const f = h('div', { class: 'field mt-2 mb-2' });
      f.appendChild(h('label', { class: 'label', style: 'font-size:.7rem' }, 'Notables to match'));
      f.appendChild(selectEl(mopts, t.match, v => { t.match = v; refresh(); saveTrade(); }));
      wrap.appendChild(f);
    }

    const btns = h('div', { class: 'buttons mt-3 mb-1' });
    const open = h('a', { class: 'button is-link', target: '_blank', rel: 'noopener' }, '<span>Open on pathofexile.com/trade</span><span class="icon is-small"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg></span>');
    const copy = h('button', { class: 'button is-dark-soft' }, 'Copy link');
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(open.href); copy.textContent = 'Copied ✓'; }
      catch (e) { linkBox.classList.remove('is-hidden'); linkBox.select(); copy.textContent = 'Select & copy below'; }
      setTimeout(() => { copy.textContent = 'Copy link'; }, 2000);
    });
    btns.appendChild(open); btns.appendChild(copy);
    wrap.appendChild(btns);
    const linkBox = h('textarea', { class: 'textarea is-small is-hidden mt-2', rows: 3, readonly: '' });
    wrap.appendChild(linkBox);
    const note = h('p', { class: 'help has-text-grey' });
    wrap.appendChild(note);

    function refresh() {
      const url = tradeUrl(cfg, skill);
      open.href = url; linkBox.value = url;
      const parts = [];
      if (cfg.kind !== 'mega' && t.enchant && skill) parts.push(skill.name);
      if (cfg.kind !== 'mega' && t.exact) parts.push(`${cfg.nodeCount} passives`);
      if (n) parts.push(t.match === 'all' || n < 2 ? `${plural(n, 'notable')} (all required)` : `≥${t.match} of ${n} notables`);
      const st = STATUS_OPTIONS.find(o => o[0] === t.status);
      note.textContent = `${st ? st[1] : ''} · searches ${cfg.kind === 'mega' ? 'Megalomaniac' : cfg.size + ' Cluster Jewels'}${parts.length ? ' with ' + parts.join(', ') : ''}, cheapest first. The link opens in a new tab.`;
    }
    refresh();
    box.appendChild(wrap);
  }

  // ---------- breakdown
  function drawResult(all) {
    const box = $('result'); box.innerHTML = '';
    const e = all.find(x => x.socket.id === state.focus);
    if (!e) { box.innerHTML = '<p class="statline">This socket is empty. Pick a jewel to see its breakdown.</p>'; return; }
    const { L, cfg, geo, J } = e;

    if (cfg.kind === 'mega') {
      const ns = L.present.filter(p => L.slots[p].type === 'Notable').map(p => L.slots[p]);
      const msg = h('div', { class: 'notification node-info mb-4' });
      msg.innerHTML = ns.length === 3
        ? `<p><b style="color:var(--mega)">Front</b> (2 pts each, 3 for both): <span class="t-Notable">${esc(ns[0].name)}</span> and <span class="t-Notable">${esc(ns[2].name)}</span></p><p><b style="color:var(--mega)">Back</b> (3 pts): <span class="t-Notable">${esc(ns[1].name)}</span>, the middle sort number</p><p class="statline mt-1">All three cost 4 points (the whole jewel). If you only want two, the one you don't want needs the middle sort number.</p>`
        : '<p class="statline">Pick 3 notables to see the real Megalomaniac layout.</p>';
      box.appendChild(msg);
    }

    const cols = h('div', { class: 'columns' });
    const left = h('div', { class: 'column is-7' });
    const tbl = h('table', { class: 'table is-fullwidth is-hoverable is-narrow' });
    tbl.innerHTML = '<thead><tr><th>#</th><th>Node</th><th class="has-text-centered">Pts</th></tr></thead>';
    const tb = h('tbody');
    for (const p of L.present) {
      const s = L.slots[p];
      const isSel = state.sel && state.sel.socket === e.socket.id && state.sel.idx === p;
      const tr = h('tr', { class: isSel ? 'is-sel' : '' });
      let name;
      if (s.type === 'Notable') name = `<span class="t-Notable">${esc(s.name)}</span> <span class="tag is-small is-ghost">#${s.notable.sort}</span>${s.notable.stats.map(x => `<p class="statline">${esc(x)}</p>`).join('')}`;
      else if (s.type === 'Socket') name = `<span class="t-Socket">${esc(s.name)}</span>${s.child ? ` <span class="statline">· ${esc(jewelTitle(state.jewels[s.child.id]))}</span>` : ''}`;
      else name = `<span class="t-Small">${esc(s.name)}</span>${p === 0 ? ' <span class="tag is-small is-hint">entry</span>' : ''}`;
      tr.innerHTML = `<td class="has-text-grey">${p}</td><td>${name}</td><td class="has-text-centered">${s.type === 'Socket' ? `<span class="pts">${s.dist}</span>` : `<span class="pts ${s.type === 'Notable' ? 'n' : ''}">${s.dist}</span>`}</td>`;
      tr.addEventListener('click', () => { if (s.type === 'Socket' && s.child) { focusSocket(s.child.id); return; } state.sel = { socket: e.socket.id, idx: p }; render(); });
      tb.appendChild(tr);
    }
    tbl.appendChild(tb); left.appendChild(tbl); cols.appendChild(left);

    const right = h('div', { class: 'column is-5 why' });
    right.innerHTML = `<p class="label mb-2">Why it looks like this</p><ol>${L.trace.map(t => `<li><b>${esc(t.step)}:</b> ${esc(t.text)}</li>`).join('')}<li><b>Rotation:</b> ${esc(`This socket uses an orbit offset of ${geo.start} for ${cfg.size} jewels. Index i is drawn at orbit position (i + ${geo.start}) mod ${J.totalIndicies}${J.totalIndicies === 12 ? ', spread onto the 16-slot orbit' : ''}. Only the drawing turns; point costs are the same in every socket.`)}</li></ol>`;
    cols.appendChild(right);
    box.appendChild(cols);
    if (!L.ok) box.appendChild(h('div', { class: 'notification is-danger is-light py-2 px-3 is-size-7' }, 'This combination has more nodes than free slots. The game never generates it.'));
  }

  // ---------- static UI wiring
  document.querySelectorAll('[data-scroll]').forEach(a => a.addEventListener('click', () => { $(a.dataset.scroll).scrollIntoView({ behavior: 'smooth', block: 'start' }); $('navMenu').classList.remove('is-active'); $('burger').classList.remove('is-active'); }));
  $('burger').addEventListener('click', () => { $('burger').classList.toggle('is-active'); $('navMenu').classList.toggle('is-active'); });
  $('brandLink').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  document.querySelectorAll('#ruleTabs li').forEach(li => li.addEventListener('click', () => {
    document.querySelectorAll('#ruleTabs li').forEach(x => x.classList.toggle('is-active', x === li));
    document.querySelectorAll('[data-pane]').forEach(p => p.classList.toggle('is-hidden', p.dataset.pane !== li.dataset.tab));
  }));

  function render() {
    const all = buildAll();
    drawSocketBar(); drawOverview(all); drawZoomTools(all); drawDetail(all); drawStats(all); drawInfo(all); drawCrumbs(all); drawConfig(); drawResult(all);
    save();
  }
  function applyHash() {
    if ((location.hash || '').toLowerCase() === '#megalomaniac') { state.jewels[state.root] = megaCfg(); state.focus = state.root; state.sel = null; }
  }
  let rz; let lastNarrow = window.innerWidth < 769;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { const n = window.innerWidth < 769; if (n !== lastNarrow) { lastNarrow = n; render(); } }, 200); });
  applyHash();
  window.addEventListener('hashchange', () => { applyHash(); render(); });
  render();
})();
