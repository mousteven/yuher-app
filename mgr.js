/* 小禾主管看板（他 10/22：副理、特助要用；選 E＋六個畫面）。iei.html?v=mgr 載入，用 iei.html 的 api()、el()、$()。
   只讀：今天（每位翻譯的行程＋派工／交辦／訪視紀錄狀態）、這週工作量、訪視紀錄、交辦、客戶多久沒去、個人檔案。
   資料都經 textContent 放進畫面（行程表、客戶名是別人打的字，不用 innerHTML）。 */
(function () {
  var css = [
    '#mg{max-width:560px;margin:0 auto;min-height:100vh;background:#EEF2F6;display:flex;flex-direction:column;font-variant-numeric:tabular-nums}',
    '#mg .mb{flex:1;padding:16px 16px 112px;display:flex;flex-direction:column;gap:16px}',
    '#mg .hd{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;padding:8px 4px 0}',
    '#mg .hd small{display:block;font-size:14px;font-weight:700;color:var(--mute)}#mg h1{margin:2px 0 0;font-size:24px;line-height:1.3}',
    '#mg .nav{display:flex;align-items:center;gap:4px}#mg .nav button{width:44px;height:44px;border:0;border-radius:12px;background:#fff;font-size:20px;color:var(--ink)}',
    '#mg .card{background:#fff;border-radius:24px;padding:16px 20px;display:flex;flex-direction:column;gap:8px}',
    '#mg .card h2{margin:0;font-size:17px}#mg .note{margin:0;font-size:14px;color:var(--mute);line-height:1.5}',
    '#mg .tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}#mg .tiles.t3{grid-template-columns:repeat(3,minmax(0,1fr))}',
    '#mg .tile{background:#fff;border-radius:16px;padding:12px 14px;display:flex;flex-direction:column;gap:2px;min-width:0}',
    '#mg .hd2{display:flex;align-items:center;justify-content:space-between;gap:8px}#mg .hd2 .more{flex:none;white-space:nowrap}#mg .hd2 h2{min-width:0;overflow-wrap:anywhere}',
    '#mg .tile span{font-size:13px;color:var(--mute)}#mg .tile b{font-size:22px}#mg .tile.w{background:#FFF4E5}#mg .tile.w span,#mg .tile.w b{color:#7A3300}',
    '#mg .alerts{display:flex;gap:8px;flex-wrap:wrap}#mg .alerts button{min-height:44px;padding:0 14px;border:0;border-radius:20px;background:#FFF4E5;color:#7A3300;font:inherit;font-size:14px;font-weight:700}',
    '#mg .chips{display:flex;gap:8px;overflow-x:auto;margin:0 -16px;padding:0 16px 4px}',
    '#mg .chips button{flex:none;min-width:68px;height:64px;border:0;border-radius:16px;background:#fff;font:inherit;color:var(--ink);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:0 10px}',
    '#mg .chips button b{font-size:16px}#mg .chips button span{font-size:13px;color:var(--mute)}#mg .chips button.x{box-shadow:inset 0 0 0 2px #B45309}#mg .chips button.x span{color:#B45309;font-weight:700}',
    '#mg .chips button[aria-selected=true]{background:var(--blue);color:#fff}#mg .chips button[aria-selected=true] span{color:#fff}',
    '#mg .tl{display:grid;grid-template-columns:52px 16px minmax(0,1fr);gap:0 12px}#mg .tl .t{font-size:15px;font-weight:700;padding-top:1px}',
    '#mg .tl .dot{display:flex;flex-direction:column;align-items:center}#mg .tl .dot i{width:12px;height:12px;border-radius:50%;margin-top:6px;border:2px solid var(--blue);box-sizing:border-box;background:#fff}',
    '#mg .tl .dot i.ok{background:#0F7B3E;border-color:#0F7B3E}#mg .tl .dot u{flex:1;width:2px;background:var(--hair);text-decoration:none}',
    '#mg .tl .bd{padding-bottom:18px;display:flex;flex-direction:column;gap:4px;min-width:0}#mg .tl .bd b{font-size:16px}#mg .tl .bd>span{font-size:14px;color:var(--mute)}',
    '#mg .tags{display:flex;flex-wrap:wrap;gap:6px}#mg .tag{font-size:13px;font-weight:700;border-radius:6px;padding:1px 8px;background:#F3F5F8;color:var(--mute)}',
    '#mg .tag.g{background:#E8F5EC;color:#0F7B3E}#mg .tag.a{background:#FFF4E5;color:#7A3300}',
    '#mg .row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 8px;padding:10px 0;border-top:1px solid var(--hair)}#mg .row:first-of-type{border-top:0}',
    '#mg .row b{font-size:15px}#mg .row .s{grid-column:1/-1;font-size:14px;color:var(--mute)}#mg .row .r{font-size:13px;font-weight:700;text-align:right}#mg .row .r.a{color:#7A3300}#mg .row .r.g{color:#0F7B3E}',
    '#mg .bars{display:flex;flex-direction:column;gap:10px}#mg .bar{display:grid;grid-template-columns:52px minmax(0,1fr) 64px;gap:8px;align-items:center;font-size:15px}',
    '#mg .bar i{display:block;height:16px;border-radius:6px;background:var(--blue)}#mg .bar em{font-style:normal;text-align:right;font-size:14px}',
    '#mg .stack{display:flex;height:18px;border-radius:6px;overflow:hidden;background:var(--hair)}#mg .legend{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 12px;font-size:14px}',
    '#mg .legend span{display:flex;gap:6px;align-items:center;min-width:0}#mg .legend i{width:12px;height:12px;border-radius:3px;flex:none}',
    '#mg table{width:100%;border-collapse:collapse;font-size:15px}#mg th{font-size:13px;color:var(--mute);font-weight:500;text-align:right;padding:4px 0}#mg th:first-child,#mg td:first-child{text-align:left}',
    '#mg td{text-align:right;padding:8px 0;border-top:1px solid var(--hair)}#mg td.a{color:#7A3300;font-weight:700}',
    '#mg .seg{display:flex;background:#fff;border-radius:12px;padding:4px;gap:4px}#mg .seg button{flex:1;height:44px;border:0;border-radius:8px;background:transparent;font:inherit;font-size:14px;font-weight:700;color:var(--mute);padding:0 12px}',
    '#mg .seg button[aria-pressed=true]{background:var(--tint);color:var(--blue)}#mg .more{min-height:44px;border:0;background:transparent;font:inherit;font-size:15px;font-weight:700;color:var(--blue);text-align:left;padding:0}',
    '#mg .tabs{position:fixed;left:0;right:0;bottom:0;background:#fff;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));padding:8px 8px calc(16px + env(safe-area-inset-bottom,0px));box-shadow:0 -1px 0 var(--hair);z-index:5}',
    '#mg .tabs button{min-height:52px;border:0;background:transparent;font:inherit;font-size:13px;color:var(--mute);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}',
    '#mg .tabs button[aria-current=page]{color:var(--blue);font-weight:700}#mg .tabs svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
    '#mg .ld{padding:32px 0;text-align:center;color:var(--mute);font-size:15px}#mg .er{padding:16px;border-radius:16px;background:#FDECEC;color:#9C0010;font-weight:700;font-size:15px}',
    '#mg .wk{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;align-items:end;height:96px}#mg .wk div{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:13px}',
    '#mg .wk i{width:100%;border-radius:6px;background:#C2D7F0;min-height:4px}#mg .wk div:last-child i{background:var(--blue)}#mg .back{width:44px;height:44px;border:0;border-radius:50%;background:#fff;font-size:20px}'
  ].join('');
  /* 放進 Shadow DOM：訪談表 iei.html 的樣式（.bar、.card、.seg…同名的有 14 個）進不來，主管看板的也出不去。字型、--blue 這些變數照樣繼承 */
  var host = el('div', null, { id: 'mghost' }); document.body.appendChild(host);
  var shadow = host.attachShadow({ mode: 'open' }); shadow.appendChild(el('style', css));
  var ICON = { today: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>', week: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
               rec: '<path d="M9 4h6a2 2 0 0 1 2 2v14H7V6a2 2 0 0 1 2-2z"/><path d="M10 10h4M10 14h4"/>', task: '<path d="m5 12 4 4 10-10"/>', cli: '<path d="M3 21h18M5 21V8l7-4 7 4v13M9 21v-6h6v6"/>' };
  var TABS = [['today', '今天'], ['week', '這週'], ['rec', '訪視紀錄'], ['task', '交辦'], ['cli', '雇主']];
  var TODAY = '', M = { tab: 'today', day: '', sel: '', start: '', month: '', taskDone: false, site: '', who: '', cache: {} };
  var root = el('div', null, { id: 'mg' }), body = el('div', null, { class: 'mb' }), tabs = el('nav', null, { class: 'tabs', 'aria-label': '主管看板分頁' });
  root.appendChild(body); root.appendChild(tabs); shadow.appendChild(root);
  TABS.forEach(function (t) {
    var b = el('button', null, { type: 'button' });
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[t[0]] + '</svg>';   // 寫死的圖示，不是資料
    b.appendChild(el('span', t[1])); b.onclick = function () { M.who = ''; if (t[0] === 'today') M.day = TODAY; go(t[0]); };
    b.dataset.t = t[0]; tabs.appendChild(b);
  });
  /* 小工具 */
  function E(tag, txt, cls, attrs) { var e = el(tag, txt, attrs || {}); if (cls) e.className = cls; return e; }
  function add(p) { for (var i = 1; i < arguments.length; i++) if (arguments[i]) p.appendChild(arguments[i]); return p; }
  function md(s) { return s ? +s.slice(5, 7) + '/' + +s.slice(8, 10) : ''; }   // 2026-10-22 → 10/22
  function wd(s) { return '日一二三四五六'.charAt(new Date(s + 'T00:00:00Z').getUTCDay()); }
  function addDay(s, n) { var d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function tile(label, val, warn) { return add(E('div', null, 'tile' + (warn ? ' w' : '')), E('span', label), E('b', String(val))); }
  function head(sub, title, nav) { var h = E('div', null, 'hd'), t = add(E('div'), E('small', sub), E('h1', title)); return add(h, t, nav || null); }
  function navBtns(prev, next, labelP, labelN) {
    var n = E('div', null, 'nav'), a = E('button', '‹', null, { type: 'button', 'aria-label': labelP }), b = E('button', '›', null, { type: 'button', 'aria-label': labelN });
    a.onclick = prev; b.onclick = next; return add(n, a, b);
  }
  function load(key, params, draw) {
    var hit = M.cache[key];
    if (hit) return draw(hit);
    body.innerHTML = ''; body.appendChild(E('div', '讀取中…', 'ld'));
    api(Object.assign({ api: 'mgr' }, params)).then(function (j) { M.cache[key] = j; if (M.key === key) draw(j); })
      .catch(function (e) { if (M.key !== key) return; body.innerHTML = ''; add(body, E('div', e.message, 'er'), retry(key)); });
  }
  function retry(key) { var b = E('button', '再試一次', 'more', { type: 'button' }); b.onclick = function () { delete M.cache[key]; go(M.tab); }; return b; }
  function go(tab) {
    M.tab = tab; [].forEach.call(tabs.children, function (b) { if (b.dataset.t === tab && !M.who) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    scrollTo(0, 0);
    if (M.who) { M.key = 'who.' + M.who; return load(M.key, { v: 'who', name: M.who }, drawWho); }
    if (tab === 'today') { M.key = 'day.' + M.day; return load(M.key, { v: 'day', day: M.day }, drawDay); }
    if (tab === 'week') { M.key = 'week.' + M.start; return load(M.key, { v: 'week', start: M.start }, drawWeek); }
    if (tab === 'rec') { M.key = 'rec.' + M.month; return load(M.key, { v: 'rec', month: M.month }, drawRec); }
    if (tab === 'task') { M.key = 'task'; return load('task', { v: 'task' }, drawTask); }
    if (tab === 'cli') { M.key = 'cli'; return load('cli', { v: 'cli' }, drawCli); }
  }
  function openWho(name) { if (!name || name === '未派工') return; M.who = name; go(M.tab); }
  function iei(t) {   // 訪視紀錄的狀態標籤
    return t.iei === '已送簽核' ? E('span', '訪視紀錄 已送簽核', 'tag g') : t.iei === '已送出' ? E('span', '訪視紀錄 已送出・等簽名', 'tag')
      : t.iei === '主管退回' ? E('span', '訪視紀錄 被主管退回', 'tag a') : t.iei === '草稿' ? E('span', '訪視紀錄 草稿', 'tag') : null;
  }
  /* 今天：每位翻譯一張時間軸（E） */
  function drawDay(j) {
    M.day = j.day; body.innerHTML = '';
    var done = j.trips.filter(function (t) { return t.st === '已完成'; }).length;
    add(body, head((j.day === j.today ? '今天 ' : '') + md(j.day) + '（' + wd(j.day) + '）', (j.stops || j.trips.length) + ' 站・已完成 ' + done,
      navBtns(function () { M.day = addDay(j.day, -1); go('today'); }, function () { M.day = addDay(j.day, 1); go('today'); }, '前一天', '後一天')));
    var al = E('div', null, 'alerts');
    var alert = function (n, label, fn) { if (!n) return; var b = E('button', label + ' ' + n, null, { type: 'button' }); b.onclick = fn; al.appendChild(b); };
    alert(j.n.none, '未派工', function () { M.sel = '未派工'; drawDay(j); });
    alert(j.n.clash, '撞時段', function () { var p = j.people.filter(function (x) { return x.clash; })[0]; if (p) { M.sel = p.name; drawDay(j); } });
    alert(j.n.confirm, '行政改單・等特助確認', function () { M.sel = '__confirm'; drawDay(j); });
    alert(j.n.late, '訪視紀錄逾期未送', function () { go('rec'); });
    if (al.children.length) body.appendChild(al);
    if (!j.trips.length) return body.appendChild(add(E('div', null, 'card'), E('p', '這天沒有排行程。', 'note')));
    var names = j.people.map(function (p) { return p.name; });
    if (M.sel !== '__confirm' && names.indexOf(M.sel) === -1) M.sel = names[0];
    var chips = E('div', null, 'chips', { role: 'tablist', 'aria-label': '翻譯' });
    j.people.forEach(function (p) {
      var b = E('button', null, p.clash ? 'x' : '', { type: 'button', role: 'tab', 'aria-selected': String(p.name === M.sel) });
      add(b, E('b', p.name), E('span', p.clash ? '撞時段' : p.name === '未派工' ? p.n + ' 站' : p.done + '／' + p.n));
      b.onclick = function () { M.sel = p.name; drawDay(j); }; chips.appendChild(b);
    });
    body.appendChild(chips);
    var mine = M.sel === '__confirm' ? j.trips.filter(function (t) { return /等特助/.test(t.change); })
      : j.trips.filter(function (t) { return M.sel === '未派工' ? !t.crews.length : t.crews.indexOf(M.sel) !== -1; });
    var card = E('div', null, 'card'), ttl = M.sel === '__confirm' ? '行政改單・等特助確認' : M.sel === '未派工' ? '還沒派翻譯' : M.sel + ' 這天';
    var h = add(E('div', null, 'hd2'), E('h2', ttl, null, { style: 'font-size:20px' }));
    if (M.sel !== '未派工' && M.sel !== '__confirm') { var pb = E('button', '個人檔案 ›', 'more', { type: 'button' }); pb.onclick = function () { openWho(M.sel); }; h.appendChild(pb); }
    card.appendChild(h);
    var tl = E('div', null, 'tl');
    mine.forEach(function (t, i) {
      var last = i === mine.length - 1, dot = E('span', null, 'dot');
      add(dot, E('i', null, t.st === '已完成' ? 'ok' : ''), last ? null : E('u'));
      var bd = E('div', null, 'bd'), tags = E('div', null, 'tags');
      add(bd, E('b', t.client || '（沒寫客戶）'), E('span', (t.sub || t.big || t.topic || '') +
        (M.sel === '__confirm' || M.sel === '未派工' ? (t.crews.length ? '・' + t.crews.join('、') : '') : '') +
        (function () { var w = t.crews.concat(t.with || []).filter(function (c, i, a) { return c !== M.sel && a.indexOf(c) === i; }); return M.sel !== '__confirm' && M.sel !== '未派工' && w.length ? '・跟 ' + w.join('、') + ' 一起' : ''; })()));
      add(tags, t.st === '已完成' ? E('span', '已完成', 'tag g') : E('span', t.st || '預排', 'tag'), t.clash ? E('span', '撞時段', 'tag a') : null,
        t.todo.length ? E('span', '交辦 ' + t.todo.filter(function (x) { return x.d; }).length + '／' + t.todo.length, 'tag' + (t.todo.every(function (x) { return x.d; }) ? ' g' : '')) : null,
        iei(t), t.change ? E('span', t.change.replace(/\s*·\s*\d{4}\/\d{2}\/\d{2}$/, ''), 'tag a') : null);
      if (tags.children.length) bd.appendChild(tags);
      if (last) bd.style.paddingBottom = '0';
      add(tl, E('span', t.slot || '未定', 't'), dot, bd);
    });
    card.appendChild(tl); body.appendChild(card);
  }
  /* 這週：每人幾站、做了哪些事 */
  var PAL = ['#0057B8', '#4D8BD1', '#8FB5E3', '#C2D7F0', '#9AA6B8', '#E6EBF2'];
  function drawWeek(j) {
    M.start = j.start; body.innerHTML = '';
    add(body, head(md(j.start) + '（一）– ' + md(j.end) + '（日）', '這週工作量',
      navBtns(function () { M.start = addDay(j.start, -7); go('week'); }, function () { M.start = addDay(j.start, 7); go('week'); }, '上一週', '下一週')));
    add(body, add(E('div', null, 'tiles t3'), tile('全部', j.total + ' 站'), tile('平均每位翻譯', j.avg + ' 站'),
      tile('還沒派工', ((j.people.filter(function (p) { return p.name === '未派工'; })[0] || {}).n || 0) + ' 站', (j.people.filter(function (p) { return p.name === '未派工'; })[0] || {}).n)));
    var max = Math.max.apply(null, j.people.map(function (p) { return p.n; }).concat([1]));
    var bars = E('div', null, 'bars');
    j.people.forEach(function (p) {
      var r = E('div', null, 'bar'), nm = E('b', p.name);
      if (p.name !== '未派工') { nm.style.cursor = 'pointer'; nm.onclick = function () { openWho(p.name); }; }
      var bar = E('i'); bar.style.width = Math.max(4, p.n / max * 100) + '%'; if (p.name === '未派工') bar.style.background = '#E3A15C';
      add(bars, add(r, nm, add(E('span'), bar), E('em', p.n + ' 站' + (p.done ? '・完成 ' + p.done : ''))));
    });
    add(body, add(E('div', null, 'card'), E('h2', '每位翻譯幾站'), j.total ? bars : E('p', '這週還沒有排行程。', 'note'), E('p', '點名字看個人檔案。', 'note')));
    if (!j.cats.length) return;
    var top = j.cats.filter(function (c) { return c.name !== '其他'; }).slice(0, 5), rest = j.total - top.reduce(function (s, c) { return s + c.n; }, 0);   // 沒分類的跟排不進前 5 的併成一個「其他」
    if (rest) top = top.concat([{ name: '其他', n: rest }]);
    var st = E('div', null, 'stack'), lg = E('div', null, 'legend');
    top.forEach(function (c, i) {
      var seg = E('i'); seg.style.width = c.n / j.total * 100 + '%'; seg.style.background = PAL[i]; st.appendChild(seg);
      var sw = E('i'); sw.style.background = PAL[i]; add(lg, add(E('span'), sw, document.createTextNode(c.name + ' ' + Math.round(c.n / j.total * 100) + '%')));
    });
    add(body, add(E('div', null, 'card'), E('h2', '做了哪些服務'), st, lg));
  }
  /* 訪視紀錄：IEI 送簽核的進度（只算有用小禾的翻譯） */
  function drawRec(j) {
    M.month = j.month; body.innerHTML = '';
    var mm = j.month.split('-'), prev = new Date(Date.UTC(+mm[0], +mm[1] - 2, 1)).toISOString().slice(0, 7), next = new Date(Date.UTC(+mm[0], +mm[1], 1)).toISOString().slice(0, 7);
    add(body, head(+mm[1] + ' 月・IEI 訪視紀錄', '紀錄有沒有交齊', navBtns(function () { M.month = prev; go('rec'); }, function () { M.month = next; go('rec'); }, '上個月', '下個月')));
    add(body, add(E('div', null, 'tiles'), tile(+mm[1] + ' 月已送簽核', j.sub), tile(+mm[1] + ' 月已送出・等簽名', j.sent), tile('目前被主管退回', j.rej.length, j.rej.length), tile('目前逾期未送（2 天以上）', j.late.length, j.late.length)));
    var c = add(E('div', null, 'card'), E('h2', '要追的（目前，不分月份）'));
    j.rej.forEach(function (r) { add(c, add(E('div', null, 'row'), E('b', r.who + '・' + r.client), E('span', '被退回', 'r a'), E('span', md(r.date) + ' 的單' + (r.svid ? '・IEI ' + r.svid : '') + '・退回原因：' + r.why, 's'))); });
    j.late.forEach(function (r) { add(c, add(E('div', null, 'row'), E('b', r.who + '・' + r.client), E('span', '逾期 ' + r.days + ' 天', 'r a'), E('span', md(r.date) + ' 去的・' + (r.st === '草稿' ? '還是草稿' : '已送出，還沒送簽核') + (r.svid ? '・IEI ' + r.svid : ''), 's'))); });
    if (!j.rej.length && !j.late.length) c.appendChild(E('p', '沒有要追的，都交了。', 'note'));
    body.appendChild(c);
    var t = E('table'), hr = E('tr'); ['翻譯', '已送簽核', '還沒送簽核', '平均幾天送', '退回'].forEach(function (x) { hr.appendChild(E('th', x)); }); t.appendChild(hr);
    j.people.forEach(function (p) {
      var r = E('tr'); add(r, E('td', p.name), E('td', String(p.sub)), E('td', String(p.sent + p.draft)), E('td', p.avg == null ? '—' : p.avg + ' 天', p.avg > 2 ? 'a' : ''), E('td', String(p.rej), p.rej ? 'a' : ''));
      r.firstChild.style.fontWeight = '700'; r.firstChild.onclick = function () { openWho(p.name); }; t.appendChild(r);
    });
    add(body, add(E('div', null, 'card'), E('h2', '每位翻譯（這個月）'), j.people.length ? add(E('div', null, null, { style: 'overflow-x:auto' }), t) : E('p', '這個月還沒有用小禾送的訪視紀錄。', 'note'),
      j.notJoined.length ? E('p', '還沒加入小禾：' + j.notJoined.join('、') + '。他們在 IEI 網頁送的紀錄，這裡還看不到。', 'note') : null));
  }
  /* 交辦：行政、副理交代的事 */
  function drawTask(j) {
    body.innerHTML = '';
    add(body, head('行程上交代給翻譯的事（最近兩週）', '交辦做完了沒'));
    var sg = E('div', null, 'seg', { role: 'group', 'aria-label': '篩選' });
    [[false, '沒做完 ' + (j.late.length + j.todo.length)], [true, '做完 ' + j.done.length]].forEach(function (x) {
      var b = E('button', x[1], null, { type: 'button', 'aria-pressed': String(M.taskDone === x[0]) }); b.onclick = function () { M.taskDone = x[0]; drawTask(j); }; sg.appendChild(b);
    });
    body.appendChild(sg);
    var item = function (c, x, right, cls) { add(c, add(E('div', null, 'row'), E('b', x.t), E('span', right, 'r ' + (cls || '')), E('span', [x.crew, x.client, md(x.date) + (x.slot ? ' ' + x.slot : ''), x.who ? x.who + ' 建單' : ''].filter(Boolean).join('・'), 's'))); };
    if (M.taskDone) {
      var d = add(E('div', null, 'card'), E('h2', '最近兩週做完的'));
      j.done.forEach(function (x) { item(d, x, '✓ 做完', 'g'); });
      if (!j.done.length) d.appendChild(E('p', '還沒有打勾的交辦。', 'note'));
      return body.appendChild(d);
    }
    if (j.late.length) {
      var l = add(E('div', null, 'card'), E('h2', '過期了・' + j.late.length, null, { style: 'color:#7A3300' }));
      j.late.slice(0, M.taskAll ? 999 : 10).forEach(function (x) { item(l, x, '晚 ' + x.days + ' 天', 'a'); });
      if (j.late.length > 10 && !M.taskAll) { var ab = E('button', '看全部 ' + j.late.length + ' 件', 'more', { type: 'button' }); ab.onclick = function () { M.taskAll = true; drawTask(j); }; l.appendChild(ab); }
      body.appendChild(l);
    }
    var t = add(E('div', null, 'card'), E('h2', '今天和明天要做・' + j.todo.length));
    j.todo.forEach(function (x) { item(t, x, x.date === j.today ? '今天' : '明天'); });
    if (!j.todo.length) t.appendChild(E('p', '今天和明天沒有交辦。', 'note'));
    add(body, t, E('p', '翻譯在小禾行程卡上打勾，這裡就會變成「做完」。', 'note'));
  }
  /* 客戶：多久沒去（照行程表＋App 服務紀錄） */
  function drawCli(j) {
    body.innerHTML = '';
    add(body, head('有聘移工的雇主・' + j.total + ' 家', '哪幾家太久沒去'));
    var long = j.known.filter(function (c) { return c.days >= 30; }).length;
    add(body, add(E('div', null, 'tiles t3'), tile('這個月去過', j.month + ' 家'), tile('30 天以上沒去', long + ' 家', long), tile(md(j.since) + ' 後沒紀錄', j.noneN + ' 家')));
    var sg = E('div', null, 'seg', { role: 'group', 'aria-label': '辦公室' });
    [['', '全部'], ['台中', '台中'], ['南投', '南投']].forEach(function (x) {
      var b = E('button', x[1], null, { type: 'button', 'aria-pressed': String(M.site === x[0]) }); b.onclick = function () { M.site = x[0]; drawCli(j); }; sg.appendChild(b);
    });
    body.appendChild(sg);
    var f = function (c) { return !M.site || c.site === M.site; }, row = function (box, c, right, cls) {
      add(box, add(E('div', null, 'row'), E('b', c.name), E('span', right, 'r ' + (cls || '')), E('span', [c.site, c.n ? '移工 ' + c.n + ' 位' + (c.nat ? '（' + c.nat + '）' : '') : '', c.by ? '上次 ' + c.by : ''].filter(Boolean).join('・'), 's')));
    };
    var k = add(E('div', null, 'card'), E('h2', '最久沒去的'));
    var kn = j.known.filter(f);
    kn.slice(0, M.cliAll ? 999 : 15).forEach(function (c) { row(k, c, c.days === 0 ? '今天' : c.days + ' 天', c.days >= 30 ? 'a' : ''); });
    if (kn.length > 15 && !M.cliAll) { var mb = E('button', '看全部 ' + kn.length + ' 家', 'more', { type: 'button' }); mb.onclick = function () { M.cliAll = true; drawCli(j); }; k.appendChild(mb); }
    if (!kn.length) k.appendChild(E('p', '沒有資料。', 'note'));
    body.appendChild(k);
    var n = add(E('div', null, 'card'), E('h2', md(j.since) + ' 之後沒有紀錄（移工多的排前面）'));
    j.none.filter(f).slice(0, 20).forEach(function (c) { row(n, c, '—'); });
    add(n, E('p', '行程表和 App 服務紀錄是 ' + md(j.since) + ' 才開始記的，更早去過的這裡看不到。', 'note'));
    body.appendChild(n);
  }
  /* 個人檔案 */
  function drawWho(j) {
    body.innerHTML = '';
    var bk = E('button', '‹', 'back', { type: 'button', 'aria-label': '回上一頁' }); bk.onclick = function () { M.who = ''; go(M.tab); };
    add(body, add(E('div', null, null, { style: 'display:flex;align-items:center;gap:12px' }), bk, add(E('div'), E('small', +j.month.slice(5) + ' 月', null, { style: 'font-size:14px;font-weight:700;color:var(--mute)' }), E('h1', j.name))));
    var tl = add(E('div', null, 'tiles'), tile('這個月行程', j.n + ' 站（大家平均 ' + j.avg + '）'), tile('已完成', j.done + ' 站'),
      tile('交辦做完', j.todo.n ? j.todo.done + '／' + j.todo.n : '沒有交辦'),
      j.joined && j.rec ? tile('訪視紀錄已送簽核', j.rec.sub + ' 張' + (j.late ? '・逾期 ' + j.late : ''), j.late) : tile('訪視紀錄', j.joined ? '這個月還沒有' : '還沒加入小禾'));
    body.appendChild(tl);
    var max = Math.max.apply(null, j.weeks.map(function (w) { return w.n; }).concat([1])), wk = E('div', null, 'wk'), lb = E('div', null, null, { style: 'display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;font-size:13px;color:var(--mute);text-align:center' });
    j.weeks.forEach(function (w, i) { var b = E('i'); b.style.height = Math.max(4, w.n / max * 72) + 'px'; add(wk, add(E('div'), E('span', String(w.n)), b)); lb.appendChild(E('span', i === 3 ? '這週' : md(w.start))); });
    add(body, add(E('div', null, 'card'), E('h2', '最近 4 週行程'), wk, lb));
    var c = add(E('div', null, 'card'), E('h2', '最近 60 天常跑的雇主'));
    j.clients.forEach(function (x) { add(c, add(E('div', null, 'row'), E('b', x.name), E('span', x.n + ' 次', 'r'))); });
    if (!j.clients.length) c.appendChild(E('p', '最近 60 天沒有行程。', 'note'));
    body.appendChild(c);
  }
  window.xhMgrStart = function () {
    var t = TODAY = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
    M.day = t; M.month = t.slice(0, 7); var w = new Date(t + 'T00:00:00Z').getUTCDay(); M.start = addDay(t, -((w + 6) % 7));
    go('today');
  };
})();
