// Cluster jewel placement engine — a faithful port of Path of Building's
// PassiveSpec:BuildSubgraph + itemLib.getClusterJewelNotableIndices.
(function (root) {
  const A16 = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330];

  function translateOidx(src, srcN, dstN) {
    if (srcN === dstN) return src;
    if (srcN === 12 && dstN === 16) return [0, 1, 3, 4, 5, 7, 8, 9, 11, 12, 13, 15][src];
    if (srcN === 6 && dstN === 16) return [0, 3, 5, 8, 11, 13][src];
    return Math.floor(src * dstN / srcN);
  }

  function orbitAngle(oidx, n) {
    const deg = n === 16 ? A16[oidx] : 360 * oidx / n;
    return deg * Math.PI / 180;
  }

  // Socket template indices used by a jewel (sockets are placed first).
  function socketSlots(J, socketCount) {
    if (J.size === 'Large' && socketCount === 1) return [{ idx: 6, jewelIndex: 1, note: 'Large jewels with a single socket always put it at index 6' }];
    const getJewels = [0, 2, 1];
    const out = [];
    for (let i = 0; i < socketCount && i < J.socketIndicies.length; i++) out.push({ idx: J.socketIndicies[i], jewelIndex: getJewels[i] });
    return out;
  }

  /**
   * Compute the full layout of one cluster jewel.
   * J: jewel template (from data.jewels[size]); cfg: {nodeCount, socketCount, notables:[notable objects]}
   */
  function computeLayout(J, cfg) {
    const trace = [];
    const socketCount = cfg.socketCount;
    const nodeCount = cfg.nodeCount;
    const notableList = cfg.notables.slice().sort((a, b) => a.sort - b.sort);
    const notableCount = notableList.length;
    const smallCount = nodeCount - socketCount - notableCount;
    const slots = {}; // template index -> node

    // 1) sockets
    const sockets = socketSlots(J, socketCount);
    sockets.forEach((s, i) => { slots[s.idx] = { type: 'Socket', idx: s.idx, jewelIndex: s.jewelIndex, name: 'Jewel Socket ' + (i + 1) }; });
    trace.push({ step: 'Sockets', text: socketCount ? `Sockets are placed first: ${sockets.map(s => 'index ' + s.idx).join(', ')}` + (sockets[0] && sockets[0].note ? ` (${sockets[0].note}).` : `, taken in order from the template list [${J.socketIndicies.join(', ')}].`) : 'No jewel sockets on this jewel.' });

    // 2) notable indices
    const remaps = [];
    const cand = [];
    for (let nodeIndex of J.notableIndicies) {
      if (cand.length === notableCount) break;
      const orig = nodeIndex;
      if (J.size === 'Medium') {
        if (socketCount === 0 && notableCount === 2) {
          if (nodeIndex === 6) nodeIndex = 4; else if (nodeIndex === 10) nodeIndex = 8;
        } else if (nodeCount === 4) {
          if (nodeIndex === 10) nodeIndex = 9; else if (nodeIndex === 2) nodeIndex = 3;
        }
      }
      if (orig !== nodeIndex) remaps.push(`${orig}→${nodeIndex}`);
      if (slots[nodeIndex]) { remaps.push(`${nodeIndex} skipped (socket)`); continue; }
      cand.push(nodeIndex);
    }
    const notableIdx = cand.slice().sort((a, b) => a - b);
    if (notableCount) {
      trace.push({ step: 'Notable slots', text: `Walk the notable template list [${J.notableIndicies.join(', ')}] until ${notableCount} free slot${notableCount > 1 ? 's are' : ' is'} found` + (remaps.length ? ` (${remaps.join('; ')})` : '') + `, then sort ascending → [${notableIdx.join(', ')}].` });
      trace.push({ step: 'Notable order', text: `Notables are sorted by their hidden sort order (not by the order on the item): ` + notableList.map(n => `${n.name} (#${n.sort})`).join(' < ') + `. Lowest sort order takes the lowest slot.` });
    }
    notableList.forEach((n, i) => {
      const idx = notableIdx[i];
      if (idx === undefined) return;
      slots[idx] = { type: 'Notable', idx, name: n.name, notable: n };
    });

    // 3) small passives
    const smallIdx = [];
    const sRemaps = [];
    for (let nodeIndex of J.smallIndicies) {
      if (smallIdx.length === smallCount) break;
      const orig = nodeIndex;
      if (J.size === 'Medium') {
        if (nodeCount === 5 && nodeIndex === 4) nodeIndex = 3;
        else if (nodeCount === 4) { if (nodeIndex === 8) nodeIndex = 9; else if (nodeIndex === 4) nodeIndex = 3; }
      }
      if (orig !== nodeIndex) sRemaps.push(`${orig}→${nodeIndex}`);
      if (!slots[nodeIndex]) smallIdx.push(nodeIndex);
    }
    smallIdx.forEach(idx => { slots[idx] = { type: 'Small', idx, name: cfg.smallName || 'Small passive' }; });
    if (smallCount > 0) trace.push({ step: 'Small passives', text: `${smallCount} small passive${smallCount > 1 ? 's fill' : ' fills'} the first free slots of [${J.smallIndicies.join(', ')}]` + (sRemaps.length ? ` (Medium remaps: ${sRemaps.join(', ')})` : '') + ` → [${smallIdx.join(', ')}].` });

    // 4) links: chain in index order, close the loop unless Small
    const present = Object.keys(slots).map(Number).sort((a, b) => a - b);
    const links = [];
    for (let i = 1; i < present.length; i++) links.push([present[i - 1], present[i]]);
    const closed = present.length > 2 && J.size !== 'Small';
    if (closed) links.push([present[present.length - 1], present[0]]);
    trace.push({ step: 'Links', text: `Nodes are linked in index order${closed ? ' and the ring is closed (last ↔ first), so you can path either way round' : ' (Small clusters are not closed into a loop)'}. Index 0 is the entry linked to the parent socket.` });

    // 5) distances from parent socket (entry costs 1 point)
    const adj = {};
    present.forEach(p => adj[p] = []);
    links.forEach(([a, b]) => { adj[a].push(b); adj[b].push(a); });
    const dist = {};
    if (slots[0]) {
      dist[0] = 1;
      const q = [0];
      while (q.length) {
        const c = q.shift();
        for (const nb of adj[c]) if (dist[nb] === undefined) { dist[nb] = dist[c] + 1; q.push(nb); }
      }
    }
    present.forEach(p => slots[p].dist = dist[p]);

    // minimal points to take every notable (connected arc that contains the entry)
    function minCover(targets) {
      if (!targets.length) return 0;
      if (!closed) return Math.max(...targets.map(t => dist[t]));
      const pos = present.map((p, i) => [p, i]);
      const posOf = Object.fromEntries(pos);
      const must = new Set([0, ...targets].map(t => posOf[t]));
      const arr = [...must].sort((a, b) => a - b);
      const N = present.length;
      let maxGap = 0;
      for (let i = 0; i < arr.length; i++) {
        const a = arr[i], b = arr[(i + 1) % arr.length];
        const gap = ((b - a + N) % N || N) - 1; // unallocated nodes strictly between
        if (gap > maxGap) maxGap = gap;
      }
      return N - maxGap;
    }
    const notableSlots = present.filter(p => slots[p].type === 'Notable');
    const socketSlotsArr = present.filter(p => slots[p].type === 'Socket');

    return {
      slots, present, links, closed, trace,
      notableCost: minCover(notableSlots),
      socketCost: minCover(socketSlotsArr),
      allCost: present.length,
      ok: slots[0] !== undefined && smallIdx.length === Math.max(0, smallCount),
    };
  }

  // Convert a layout into tree coordinates for a given socket.
  function placeLayout(layout, J, socket, data) {
    const proxyId = socket.proxy;
    const offs = data.offsets[proxyId];
    const start = offs ? (offs[J.sizeIndex] || 0) : 0;
    const orbit = J.sizeIndex + 1;
    const n = data.orbit.spo[orbit];
    const r = data.orbit.radii[orbit];
    const cx = socket.px, cy = socket.py;
    for (const p of layout.present) {
      const s = layout.slots[p];
      const rel = (p + start) % J.totalIndicies;
      s.oidx = translateOidx(rel, J.totalIndicies, n);
      s.angle = orbitAngle(s.oidx, n);
      s.x = cx + Math.sin(s.angle) * r;
      s.y = cy - Math.cos(s.angle) * r;
    }
    return { cx, cy, r, start, orbit };
  }

  function findChildSocket(data, proxyGroup, jewelIndex) {
    for (const k in data.sockets) {
      const s = data.sockets[k];
      if (s.group === proxyGroup && s.index === jewelIndex) return s;
    }
    return null;
  }

  const api = { computeLayout, placeLayout, findChildSocket, translateOidx, orbitAngle, socketSlots };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Cluster = api;
})(this);
