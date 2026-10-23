/* 小禾・評鑑補件（他 2026-10-23 選甲案「全年總表」）。
   iei.html?v=eval 載入，用 iei.html 的 api()、el()、LIFF_ID。

   規則（2026-09-11 跟他確認、小羽 EvalRoster.gs 的 evalChain_）：
     當年度入境或續聘的人，起算月當月要有一張到場紀錄，之後相鄰兩筆間隔不可以超過 2 個月；
     續聘的人另外在續聘月前 2～4 個月要有一筆簽續聘文件。電聯不算。

   ⛔ 2026-10-23 量到：IEI 月曆與平台服務紀錄**都只有 9、10 月**，1～8 月兩邊都是零。
      那幾個月畫成灰斜線「查不到」，**絕對不畫紅色**——紅色是在說「他沒去」，而我沒有憑據。
   ⛔ 一列一個人、12 格固定。手機上一格只有 20px，低於 44px 的點擊目標，
      所以**格子不能點**：點整列 → 下面長出那個人的細節與補件選項。 */
(function () {
  var css = [
    '#ev{max-width:720px;margin:0 auto;min-height:100vh;background:#EEF2F6;font-variant-numeric:tabular-nums;padding-bottom:48px}',
    '#ev .top{position:sticky;top:0;z-index:5;background:#EEF2F6;padding:12px 16px 8px;display:flex;gap:8px;align-items:center}',
    '#ev .back{flex:none;width:44px;height:44px;border:0;border-radius:50%;background:#fff;font-size:20px;color:var(--ink)}',
    '#ev .ttl{flex:1;min-width:0;font-size:17px;font-weight:700}#ev .ttl small{display:block;font-size:13px;font-weight:500;color:var(--mute)}',
    '#ev .body{padding:0 16px;display:flex;flex-direction:column;gap:12px}',
    '#ev .card{background:#fff;border-radius:20px;padding:16px}',
    '#ev .sum{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}',
    '#ev .sum div{background:#fff;border-radius:16px;padding:12px 8px;text-align:center}',
    '#ev .sum b{display:block;font-size:26px;font-weight:800;line-height:1.2}',
    '#ev .sum span{font-size:12px;color:var(--mute);font-weight:600}',
    '#ev .sum .hot b{color:#C00012}',
    '#ev .chips{display:flex;gap:6px;overflow-x:auto;padding:2px 0 6px;-ms-overflow-style:none;scrollbar-width:none}',
    '#ev .chips::-webkit-scrollbar{display:none}',
    '#ev .chip{flex:none;min-height:40px;padding:0 14px;border-radius:999px;border:1.5px solid var(--line);background:#fff;color:var(--mute);font:700 14px/36px inherit}',
    '#ev .chip.on{background:var(--blue);border-color:var(--blue);color:#fff}',
    '#ev .seg{display:flex;gap:4px;background:#E6EBF2;padding:4px;border-radius:12px}',
    '#ev .seg button{flex:1;min-height:40px;border:0;border-radius:9px;background:none;color:var(--mute);font:700 14px inherit}',
    '#ev .seg button.on{background:#fff;color:var(--ink);box-shadow:0 1px 3px rgba(11,27,51,.12)}',
    '#ev .warn{background:#FFF4F4;border-radius:16px;padding:14px 16px;font-size:14px;line-height:1.8;color:#7A1016}',
    '#ev .warn b{color:#9C0010}',
    '#ev .note{font-size:13px;color:var(--mute);line-height:1.8}',
    '#ev .mh{display:grid;grid-template-columns:104px repeat(12,1fr);gap:3px;font-size:10px;color:var(--mute);font-weight:700;text-align:center;padding:0 0 4px}',
    '#ev .mh i{font-style:normal}#ev .mh i.now{color:#C00012}',
    '#ev .r{display:grid;grid-template-columns:104px repeat(12,1fr);gap:3px;align-items:center;width:100%;border:0;background:none;padding:6px 0;text-align:left;font:inherit;color:inherit;border-top:1px solid var(--hair)}',
    '#ev .r:first-of-type{border-top:0}#ev .r:active{background:#F3F5F8}',
    '#ev .w{min-width:0;padding-right:6px}',
    '#ev .w b{display:block;font-size:14px;font-weight:700;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#ev .w span{display:block;font-size:11px;color:var(--mute);line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#ev .c{aspect-ratio:1;border-radius:5px;display:grid;place-items:center;font-size:10px;font-weight:700;line-height:1;color:transparent}',
    '#ev .c.free{background:#EDF0F5}',
    '#ev .c.ok{background:var(--tint);color:var(--blue)}',
    '#ev .c.due{background:#fff;box-shadow:inset 0 0 0 1.5px var(--blue);color:var(--blue)}',
    '#ev .c.miss{background:#E30613;color:#fff}',
    '#ev .c.nodata{background:repeating-linear-gradient(45deg,#E4E8EE,#E4E8EE 2px,#EEF2F6 2px,#EEF2F6 4px)}',
    '#ev .lg{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:var(--mute);font-weight:600}',
    '#ev .lg span{display:inline-flex;align-items:center;gap:5px}',
    '#ev .lg i{width:16px;height:16px;border-radius:4px;display:grid;place-items:center;font-size:9px;font-weight:700;font-style:normal}',
    '#ev .more{width:100%;min-height:48px;border:0;border-radius:14px;background:#fff;color:var(--blue);font:700 15px inherit}',
    '#ev .dt{background:#fff;border-radius:20px;padding:18px 16px;display:flex;flex-direction:column;gap:10px}',
    '#ev .dt h3{margin:0;font-size:19px;font-weight:800}',
    '#ev .dt .sub{font-size:13px;color:var(--mute)}',
    '#ev .opt{display:flex;align-items:center;gap:10px;width:100%;min-height:56px;padding:10px 14px;border:1.5px solid var(--line);border-radius:14px;background:#fff;font:inherit;color:inherit;text-align:left}',
    '#ev .opt b{display:block;font-size:15px;font-weight:700}',
    '#ev .opt span{display:block;font-size:12px;color:var(--mute)}',
    '#ev .opt .cv{margin-left:auto;color:var(--blue);font-size:18px;font-weight:800}',
    '#ev .hint{padding:28px 8px;text-align:center;color:var(--mute);font-size:15px;line-height:1.9}',
    '#ev .er{background:#FFF4F4;color:#9C0010;border-radius:14px;padding:14px 16px;font-size:14px;font-weight:600;line-height:1.7}'
  ].join('');

  var CH = 60;                                  // 一次畫幾列（565 人全畫手機會卡）
  var J = null, NAT = '', SORT = 'gap', SHOW = CH, OPEN = null;
  var root, body, el, api, LIFF_ID;

  function host() {
    var h = document.createElement('div');
    document.body.appendChild(h);
    var sr = h.attachShadow ? h.attachShadow({ mode: 'open' }) : h;
    var st = document.createElement('style');
    /* 跟 find.js／mgr.js 一樣用 Shadow DOM：iei.html 有同名的 .card／.row／.top，不隔開會互相壓 */
    st.textContent = ':host{all:initial}*{box-sizing:border-box;font-family:inherit}' +
      ':host{--ink:#0B1B33;--mute:#4A5565;--blue:#0057B8;--line:#D6DEEA;--hair:#EDF0F5;--tint:#E3EDF9;' +
      'font-family:"Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif;color:#0B1B33;display:block}' + css;
    sr.appendChild(st);
    return sr;
  }

  function mkEl(tag, txt, at) {
    var e = document.createElement(tag);
    if (txt != null) e.textContent = txt;                 // ⛔ 一律 textContent（客戶名、人名都是別人打的字）
    for (var k in (at || {})) e.setAttribute(k, at[k]);
    return e;
  }

  var TXT = { ok: '✓', miss: '缺', due: '！', free: '', na: '', nodata: '' };

  function monthHead() {
    var h = mkEl('div', null, { 'class': 'mh' });
    h.appendChild(mkEl('i'));
    for (var m = 1; m <= 12; m++) h.appendChild(mkEl('i', String(m), m === J.nowM ? { 'class': 'now' } : {}));
    return h;
  }

  function rows() {
    var list = (J.rows || []).filter(function (r) { return !NAT || r.nat === NAT; });
    if (SORT === 'client') list = list.slice().sort(function (a, b) {
      return (a.client || '').localeCompare(b.client || '') || (a.name || '').localeCompare(b.name || '');
    });
    if (SORT === 'month') list = list.slice().sort(function (a, b) { return a.start - b.start || (a.client || '').localeCompare(b.client || ''); });
    return list;
  }

  function rowEl(r) {
    var b = mkEl('button', null, { 'class': 'r', type: 'button' });
    var w = mkEl('span', null, { 'class': 'w' });
    w.appendChild(mkEl('b', r.name || r.orig || '（沒有名字）'));
    w.appendChild(mkEl('span', [r.nat, r.client].filter(String).join('・')));
    b.appendChild(w);
    r.cell.forEach(function (s) { b.appendChild(mkEl('span', TXT[s] || '', { 'class': 'c ' + s })); });
    b.onclick = function () { OPEN = (OPEN === r ? null : r); draw(); };
    return b;
  }

  function monthName(m) { return m + ' 月'; }

  function detail(r) {
    var d = mkEl('div', null, { 'class': 'dt' });
    d.appendChild(mkEl('h3', r.name || r.orig));
    d.appendChild(mkEl('div', [r.client, r.nat, r.kind + ' ' + r.start + ' 月', r.status].filter(String).join('・'), { 'class': 'sub' }));

    var gaps = (r.gaps || []).slice();
    if (!gaps.length && !(r.re && r.re.state !== 'ok')) {
      d.appendChild(mkEl('div', '這一年到目前為止沒有缺口。', { 'class': 'note' }));
    }
    gaps.forEach(function (m) {
      var late = m < J.nowM;
      var o = mkEl('button', null, { 'class': 'opt', type: 'button' });
      var t = mkEl('span', null, {});
      t.appendChild(mkEl('b', monthName(m) + (late ? '（已逾期）' : m === J.nowM ? '（這個月）' : '')));
      t.appendChild(mkEl('span', r.la ? '開一張這個月的訪談紀錄表草稿' : '⚠ 這個人對不到 IEI 代碼，要自己在表單裡搜尋'));
      o.appendChild(t);
      o.appendChild(mkEl('span', '›', { 'class': 'cv' }));
      o.onclick = function () { openForm(r, m); };
      d.appendChild(o);
    });
    if (r.re && r.re.state !== 'ok') {
      d.appendChild(mkEl('div', '續聘文件：規則是續聘月（' + r.start + ' 月）的前 2～4 個月，也就是 ' +
        Math.max(1, r.re.from) + '～' + Math.max(1, r.re.to) + ' 月之間要有一筆簽續聘文件的紀錄。' +
        (r.re.state === 'miss' ? '目前查不到。' : '還沒到期限。'), { 'class': 'note' }));
    }
    d.appendChild(mkEl('div',
      '開出來的是草稿，不會直接進 IEI。日期與服務項目帶預設值，內容一個字都不會幫你寫。' +
      '這裡補的是「真的去過但還沒登打」的紀錄——沒去過的不要用這裡補。', { 'class': 'note' }));
    return d;
  }

  function openForm(r, m) {
    var day = J.year + '-' + ('0' + m).slice(-2) + '-15';   // 那個月的中間，他自己改
    var q = '?liff=' + encodeURIComponent(LIFF_ID) + '&day=' + encodeURIComponent(day);
    if (r.cu) q += '&cu=' + encodeURIComponent(r.cu) + '&co=' + encodeURIComponent(r.client || '');
    if (r.la) q += '&w=' + encodeURIComponent(r.la);
    location.href = location.pathname + q;
  }

  function draw() {
    body.innerHTML = '';
    if (!J) { body.appendChild(mkEl('div', '讀評鑑名單…（第一次要跟 IEI 要整年的月曆，約 10 秒）', { 'class': 'hint' })); return; }
    if (J.err) { body.appendChild(mkEl('div', J.err, { 'class': 'er' })); return; }

    var all = J.rows || [];
    var nMiss = 0, nNow = 0;
    all.forEach(function (r) {
      if (r.cell.indexOf('miss') !== -1 || (r.re && r.re.state === 'miss')) nMiss++;
      else if ((r.gaps || []).indexOf(J.nowM) !== -1) nNow++;
    });

    var sum = mkEl('div', null, { 'class': 'sum' });
    [[all.length, J.year + ' 年列入'], [nMiss, '已經逾期'], [nNow, '這個月該去']].forEach(function (x, i) {
      var d = mkEl('div', null, i === 1 && x[0] ? { 'class': 'hot' } : {});
      d.appendChild(mkEl('b', String(x[0])));
      d.appendChild(mkEl('span', x[1]));
      sum.appendChild(d);
    });
    body.appendChild(sum);

    /* ⛔ 查不到的月份一定要講出來，不可以讓他以為那幾格是他的缺口 */
    if ((J.blind || []).length) {
      var w = mkEl('div', null, { 'class': 'warn' });
      w.appendChild(mkEl('b', J.blind.join('、') + ' 月查不到任何紀錄'));
      w.appendChild(mkEl('div', '這幾個月在 IEI 月曆和平台服務紀錄裡都是零筆——不是你沒去，是紀錄不在這兩個系統裡。' +
        '所以那幾格畫成灰斜線，不算缺件、不會列進上面的數字。'));
      body.appendChild(w);
    }

    var nats = [];
    all.forEach(function (r) { if (r.nat && nats.indexOf(r.nat) === -1) nats.push(r.nat); });
    nats.sort();
    var ch = mkEl('div', null, { 'class': 'chips' });
    [['', '全部 ' + all.length]].concat(nats.map(function (n) {
      return [n, n + ' ' + all.filter(function (r) { return r.nat === n; }).length];
    })).forEach(function (x) {
      var b = mkEl('button', x[1], { 'class': 'chip' + (NAT === x[0] ? ' on' : ''), type: 'button' });
      b.onclick = function () { NAT = x[0]; SHOW = CH; OPEN = null; draw(); };
      ch.appendChild(b);
    });
    body.appendChild(ch);

    var seg = mkEl('div', null, { 'class': 'seg' });
    [['gap', '缺口優先'], ['client', '按工廠'], ['month', '按起算月']].forEach(function (x) {
      var b = mkEl('button', x[1], { 'class': SORT === x[0] ? 'on' : '', type: 'button' });
      b.onclick = function () { SORT = x[0]; SHOW = CH; draw(); };
      seg.appendChild(b);
    });
    body.appendChild(seg);

    var lg = mkEl('div', null, { 'class': 'lg' });
    [['ok', '有紀錄'], ['due', '該去'], ['miss', '已逾期'], ['nodata', '查不到'], ['free', '不用去']].forEach(function (x) {
      var s = mkEl('span');
      var i = mkEl('i', TXT[x[0]] || '', {});
      i.className = 'c ' + x[0];
      i.style.cssText = 'width:16px;height:16px;aspect-ratio:auto';
      s.appendChild(i); s.appendChild(mkEl('span', x[1]));
      lg.appendChild(s);
    });
    body.appendChild(lg);

    var list = rows(), card = mkEl('div', null, { 'class': 'card' });
    card.appendChild(monthHead());
    if (!list.length) card.appendChild(mkEl('div', '這個國籍今年沒有要列入的人。', { 'class': 'hint' }));
    list.slice(0, SHOW).forEach(function (r) {
      card.appendChild(rowEl(r));
      if (OPEN === r) card.appendChild(detail(r));
    });
    body.appendChild(card);

    if (list.length > SHOW) {
      var more = mkEl('button', '再看 ' + Math.min(CH, list.length - SHOW) + ' 位（還有 ' + (list.length - SHOW) + ' 位）', { 'class': 'more', type: 'button' });
      more.onclick = function () { SHOW += CH; draw(); };
      body.appendChild(more);
    }

    body.appendChild(mkEl('div', '規則：當年度入境或續聘的人，起算月當月要有一張到場紀錄，' +
      '之後相鄰兩筆的月份間隔不可以超過 2。續聘的人另外在續聘月前 2～4 個月要有一筆簽續聘文件。電聯不算。', { 'class': 'note' }));
  }

  window.xhEvalStart = function () {
    el = window.el; api = window.api; LIFF_ID = window.LIFF_ID;
    root = host();
    var wrap = mkEl('div', null, { id: 'ev' });
    var top = mkEl('div', null, { 'class': 'top' });
    var back = mkEl('button', '‹', { 'class': 'back', type: 'button', 'aria-label': '返回' });
    back.onclick = function () { try { liff.closeWindow(); } catch (e) { history.back(); } };
    var t = mkEl('div', null, { 'class': 'ttl' });
    t.appendChild(document.createTextNode('評鑑補件'));
    t.appendChild(mkEl('small', '今年入境與續聘的人，每兩個月要有一張'));
    top.appendChild(back); top.appendChild(t);
    wrap.appendChild(top);
    body = mkEl('div', null, { 'class': 'body' });
    wrap.appendChild(body);
    root.appendChild(wrap);
    draw();
    api({ api: 'eval' }).then(function (j) { J = j; draw(); })
      .catch(function (e) { J = { err: '讀不到：' + (e && e.message || e), rows: [] }; draw(); });
  };
})();
