(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var css = function (v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); };
  var snap = null;

  function el(tag, attrs, text) { var e = document.createElement(tag); for (var k in (attrs || {})) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; }
  function svgEl(n, a, p) { var e = document.createElementNS('http://www.w3.org/2000/svg', n); for (var k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; }
  function sgn(x, d) { d = d == null ? 2 : d; return (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(d); }
  function fmt(v, d) { return v == null ? 'n/a' : Number(v).toFixed(d == null ? 2 : d); }
  function days(iso) { return Math.floor((Date.now() - new Date(iso + (iso.length === 10 ? 'T00:00:00Z' : '')).getTime()) / 864e5); }

  /* ---------- tooltip ---------- */
  var tip = $('tip');
  document.body.style.position = 'relative';
  function showTip(host, x, y, text) {
    tip.textContent = text; tip.style.opacity = 1;
    var hr = host.getBoundingClientRect(), w = tip.offsetWidth;
    var left = hr.left + window.scrollX + x - w / 2;
    left = Math.max(hr.left + window.scrollX, Math.min(left, hr.right + window.scrollX - w));
    tip.style.left = left + 'px'; tip.style.top = (hr.top + window.scrollY + y - 36) + 'px';
  }
  function hideTip() { tip.style.opacity = 0; }

  /* ---------- line chart ---------- */
  // series: [{color, step, pts:[{x:label, y:number|null}]}]  opts: {suffix, min, max, labelEvery, last}
  function lineChart(host, series, opts) {
    host.innerHTML = '';
    var all = []; series.forEach(function (s) { s.pts.forEach(function (p) { if (p.y != null) all.push(p.y); }); });
    if (!all.length) { host.appendChild(el('div', { 'class': 'empty' }, opts.emptyText || 'No data yet')); return; }
    var w = Math.max(host.clientWidth, 280), h = 230, m = { l: 40, r: 14, t: 12, b: 28 };
    var lo = opts.min != null ? opts.min : Math.min.apply(null, all), hi = opts.max != null ? opts.max : Math.max.apply(null, all);
    if (opts.min == null) { var pad = (hi - lo) * 0.12 || 1; lo -= pad; hi += pad; }
    var step = niceStep((hi - lo) / 4); lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    var svg = svgEl('svg', { viewBox: '0 0 ' + w + ' ' + h, role: 'img' }); host.appendChild(svg);
    var Y = function (v) { return m.t + (1 - (v - lo) / (hi - lo)) * (h - m.t - m.b); };
    for (var v = lo; v <= hi + 1e-9; v += step) {
      svgEl('line', { x1: m.l, x2: w - m.r, y1: Y(v), y2: Y(v), stroke: v === lo ? css('--axis') : css('--grid') }, svg);
      svgEl('text', { x: m.l - 6, y: Y(v) + 4, 'text-anchor': 'end', 'font-size': 11, fill: css('--muted') }, svg).textContent = v.toFixed(step < 1 ? 1 : 0) + (opts.suffix || '');
    }
    var n = series[0].pts.length, X = function (i) { return m.l + (n === 1 ? 0 : i * (w - m.l - m.r) / (n - 1)); };
    var every = opts.labelEvery || Math.max(1, Math.round(n / 6));
    series[0].pts.forEach(function (p, i) { if (i % every === 0 || i === n - 1) { var anchor = i === n - 1 && n > 8 ? 'end' : 'middle'; svgEl('text', { x: X(i), y: h - 8, 'text-anchor': anchor, 'font-size': 11, fill: css('--muted') }, svg).textContent = p.x; } });
    series.forEach(function (s) {
      var d = '', started = false, prevY = null;
      s.pts.forEach(function (p, i) {
        if (p.y == null) { started = false; return; }
        if (!started) { d += ' M' + X(i) + ' ' + Y(p.y); started = true; }
        else if (s.step) { d += ' H' + X(i) + ' V' + Y(p.y); }
        else { d += ' L' + X(i) + ' ' + Y(p.y); }
      });
      svgEl('path', { d: d, fill: 'none', stroke: s.color, 'stroke-width': 2.4, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
      if (n <= 20) s.pts.forEach(function (p, i) { if (p.y != null) svgEl('circle', { cx: X(i), cy: Y(p.y), r: 3.5, fill: s.color, stroke: css('--surface'), 'stroke-width': 2 }, svg); });
      var lastI = -1; s.pts.forEach(function (p, i) { if (p.y != null) lastI = i; });
      if (lastI >= 0) { svgEl('circle', { cx: X(lastI), cy: Y(s.pts[lastI].y), r: 4.5, fill: s.color, stroke: css('--surface'), 'stroke-width': 2 }, svg); }
    });
    var cross = svgEl('line', { y1: m.t, y2: h - m.b, stroke: css('--axis'), opacity: 0 }, svg);
    var ov = svgEl('rect', { x: m.l, y: m.t, width: w - m.l - m.r, height: h - m.t - m.b, fill: 'transparent' }, svg);
    function move(e) {
      var r = svg.getBoundingClientRect(), sx = (e.clientX - r.left) * (w / r.width);
      var i = Math.max(0, Math.min(n - 1, Math.round((sx - m.l) / ((w - m.l - m.r) / Math.max(n - 1, 1)))));
      cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('opacity', 1);
      var txt = series[0].pts[i].x, top = 1e9;
      series.forEach(function (s) { var p = s.pts[i]; if (p && p.y != null) { txt += ' · ' + (s.name ? s.name + ' ' : '') + p.y.toFixed(2) + (opts.suffix || ''); top = Math.min(top, Y(p.y)); } });
      if (top === 1e9) top = h / 2;
      showTip(host, X(i) * (r.width / w), top * (r.height / h), txt);
    }
    ov.addEventListener('mousemove', move);
    ov.addEventListener('touchmove', function (e) { move(e.touches[0]); }, { passive: true });
    ov.addEventListener('mouseleave', function () { hideTip(); cross.setAttribute('opacity', 0); });
  }
  function niceStep(raw) { var p = Math.pow(10, Math.floor(Math.log10(raw || 1))), f = raw / p; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p; }
  function shortDate(d) { var dt = new Date(d + 'T00:00:00Z'); return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }); }

  /* ---------- render ---------- */
  function render() {
    if (!snap) return;
    var a = snap.analysis, d = a.decision, ind = snap.india, m = a.inputs.market;
    // decision
    var bps = d.move_bps;
    $('move').textContent = bps === 0 ? 'Hold' : (bps > 0 ? '+' : '−') + Math.abs(bps) + ' bps';
    $('verdict').textContent = bps === 0 ? 'Keep the repo rate at ' + fmt(ind.policy.repo) + '%.' : (bps > 0 ? 'Raise' : 'Cut') + ' the repo rate to ' + fmt(d.new_repo) + '%. Next decision: ' + ind.policy.next_decision + '.';
    var kv = $('kv'); kv.innerHTML = '';
    [['Repo rate today', fmt(ind.policy.repo) + '%'], ['Required repo rate (rule)', fmt(d.required) + '%'], ['Gap', sgn(d.gap) + ' pts'],
     ['Expected inflation used', fmt(a.inputs.expInf, 1) + '%'], ['Real repo rate now', sgn(d.real_now) + '%'], ['Real repo rate after move', sgn(d.real_after) + '%'],
     ['Market caution added', sgn(a.inputs.stress, 0) + ' bps']].forEach(function (r) { kv.appendChild(el('dt', {}, r[0])); kv.appendChild(el('dd', {}, r[1])); });
    // narrative: Gemini if present, otherwise the rule-based text
    var nar = $('narrative'); nar.innerHTML = '';
    var paras = snap.llm.text ? snap.llm.text.split(/\n{2,}|\n/).filter(Boolean) : a.narrative;
    paras.forEach(function (t) { nar.appendChild(el('p', {}, t)); });
    $('noteLabel').textContent = snap.llm.text ? 'Analyst note' : 'Reasoning (generated from the live numbers)';
    // lists
    fill($('reasons'), a.reasons); fill($('risks'), a.risks);
    // scenarios
    var t = $('scen'); t.innerHTML = '<thead><tr><th>Shock</th><th class="r">Required repo</th><th class="r">Gap</th><th class="r">Suggested move</th><th class="r">New repo</th></tr></thead>';
    var tb = el('tbody'); a.scenarios.forEach(function (s) {
      var tr = el('tr'); [s.name, fmt(s.required) + '%', sgn(s.gap), s.move_bps === 0 ? 'Hold' : (s.move_bps > 0 ? '+' : '−') + Math.abs(s.move_bps) + ' bps', fmt(s.new_repo) + '%'].forEach(function (x, i) { tr.appendChild(el('td', i ? { 'class': 'r' } : {}, x)); }); tb.appendChild(tr); }); t.appendChild(tb);
    // tiles
    var c = ind.cpi, tiles = [
      ['Repo rate', fmt(ind.policy.repo) + '%', ind.policy.stance, false],
      ['CPI inflation', fmt(c.latest) + '%', 'Prev ' + fmt(c.prev) + '% · limit ' + c.upper_band + '%', c.latest > c.upper_band],
      ['Food inflation', fmt(c.food) + '%', 'Prev ' + fmt(c.food_prev) + '%', c.food > c.upper_band + 2],
      ['Real GDP', fmt(ind.gdp.latest, 1) + '%', ind.gdp.label, false],
      ['Mfg PMI', fmt(ind.pmi.manufacturing, 1), 'Prev ' + fmt(ind.pmi.prev, 1), false],
      ['USD/INR', fmt(m.usdinr), m.usdinr_chg30 == null ? 'live' : sgn(m.usdinr_chg30, 1) + '% in 30 days', false],
      ['Brent', m.brent == null ? 'n/a' : '$' + fmt(m.brent, 1), m.brent_chg7 == null ? 'needs FRED key' : sgn(m.brent_chg7, 1) + '% in 7 days', m.brent != null && m.brent >= 110],
      ['Forex reserves', '$' + fmt(ind.reserves.usd_bn, 0) + ' bn', 'as of ' + ind.reserves.asof, false]];
    var tl = $('tiles'); tl.innerHTML = '';
    tiles.forEach(function (x) { var d = el('div', { 'class': 'tile' + (x[3] ? ' alert' : '') }); d.appendChild(el('div', { 'class': 'l' }, x[0])); d.appendChild(el('div', { 'class': 'v' }, x[1])); d.appendChild(el('div', { 'class': 'n' }, x[2])); tl.appendChild(d); });
    // charts
    var ser = snap.market.series, st = snap.market.status;
    [['brent', '--s2', ' $', ''], ['usdinr', '--s1', '', ''], ['ust10', '--s1', '', '%'], ['in10y', '--s3', '', '%']].forEach(function (x) {
      var id = x[0], pts = (ser[id] || []).map(function (p) { return { x: shortDate(p.d), y: p.v }; });
      var emptyText = st[id] && st[id].error ? st[id].error : 'No data yet';
      lineChart($('ch_' + id), [{ color: css(x[1]), pts: pts }], { suffix: x[3], emptyText: emptyText, labelEvery: id === 'in10y' ? 2 : null });
      var s = st[id]; $('s_' + id).textContent = s ? (s.ok ? s.label + ' · latest ' + s.asof + (s.mock ? ' · DEMO DATA' : '') : s.label + ' · ' + s.error) : '';
    });
    lineChart($('ch_rc'), [
      { name: 'Repo', color: css('--s1'), step: true, pts: ind.repo_history.labels.map(function (l, i) { return { x: l, y: ind.repo_history.values[i] }; }) },
      { name: 'CPI', color: css('--s2'), pts: ind.cpi.labels.map(function (l, i) { return { x: l, y: ind.cpi.values[i] }; }) }], { suffix: '%', min: 0, labelEvery: 2 });
    lineChart($('ch_proj'), [
      { name: 'CPI', color: css('--s2'), pts: ind.rbi_projection.quarters.map(function (l, i) { return { x: l, y: ind.rbi_projection.cpi[i] }; }) },
      { name: 'GDP', color: css('--s3'), pts: ind.rbi_projection.quarters.map(function (l, i) { return { x: l, y: ind.rbi_projection.gdp[i] }; }) }], { suffix: '%', min: 3, max: 8, labelEvery: 1 });
    // freshness
    var rows = [['Repo rate and stance', ind.policy.asof, 70, 'data/india.json'], ['CPI inflation', ind.cpi.asof, 40, 'data/india.json'], ['RBI projections', ind.rbi_projection.asof, 70, 'data/india.json'],
      ['GDP growth', ind.gdp.asof, 120, 'data/india.json'], ['PMI', ind.pmi.asof, 40, 'data/india.json'], ['Forex reserves', ind.reserves.asof, 21, 'data/india.json']];
    var f = $('fresh'); f.innerHTML = '<thead><tr><th>Data</th><th>As of</th><th>Age</th><th>Status</th><th>Source</th></tr></thead>'; var fb = el('tbody');
    rows.forEach(function (r) { var age = days(r[1]), tr = el('tr'); tr.appendChild(el('td', {}, r[0])); tr.appendChild(el('td', {}, r[1])); tr.appendChild(el('td', {}, age + ' days'));
      var td = el('td'); td.appendChild(el('span', { 'class': 'pill ' + (age > r[2] ? 'stale' : 'ok') }, age > r[2] ? 'Update due' : 'Fresh')); tr.appendChild(td); tr.appendChild(el('td', {}, r[3])); fb.appendChild(tr); });
    Object.keys(st).forEach(function (k) { var s = st[k], tr = el('tr'); tr.appendChild(el('td', {}, s.label)); tr.appendChild(el('td', {}, s.asof || '—')); tr.appendChild(el('td', {}, s.asof ? days(s.asof) + ' days' : '—'));
      var td = el('td'); td.appendChild(el('span', { 'class': 'pill ' + (s.ok ? 'ok' : 'bad') }, s.ok ? (s.mock ? 'Demo' : 'Live') : 'Unavailable')); tr.appendChild(td); tr.appendChild(el('td', {}, s.ok ? 'Auto (API)' : s.error)); fb.appendChild(tr); });
    f.appendChild(fb);
    // banner
    var bn = $('banner'), msgs = [];
    if (snap.mock) msgs.push('Demo mode: market numbers are fake (MOCK_DATA=1). Set MOCK_DATA=0 and add your FRED key for live data.');
    var missing = Object.keys(st).filter(function (k) { return !st[k].ok; });
    if (missing.length && !snap.mock) msgs.push(missing.length + ' market source(s) unavailable. The decision still runs with the data that loaded. Details are in the freshness table.');
    bn.hidden = !msgs.length; bn.textContent = msgs.join(' ');
    setStatus('live', 'Live · updated ' + new Date(snap.generated_at).toLocaleTimeString() + ' · refreshes every ' + snap.refresh_minutes + ' min');
  }
  function fill(ul, items) { ul.innerHTML = ''; items.forEach(function (t) { ul.appendChild(el('li', {}, t)); }); }
  function setStatus(kind, text) { $('dot').className = 'dot ' + kind; $('statusText').textContent = text; }

  /* ---------- data + live stream ---------- */
  function load() {
    return fetch('/api/snapshot', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.error) { setStatus('', 'Starting up…'); setTimeout(load, 2000); return; } snap = j; render();
    }).catch(function () { setStatus('off', 'Cannot reach the server'); });
  }
  function connect() {
    var es = new EventSource('/api/stream');
    es.onmessage = function () { load(); };
    es.onerror = function () { setStatus('off', 'Disconnected. Retrying…'); };
    es.onopen = function () { if (snap) setStatus('live', 'Live · connected'); };
  }
  var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(render, 150); });
  load().then(connect);
})();
