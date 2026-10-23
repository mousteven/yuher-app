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
    '#ev .c{position:relative;aspect-ratio:1;border-radius:5px;display:grid;place-items:center;font-size:10px;font-weight:700;line-height:1;color:transparent}',
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
    '#ev .hint{padding:28px 8px;text-align:center;color:var(--mute);font-size:15px;line-height:1.9;white-space:pre-line}',
    '#ev .er{background:#FFF4F4;color:#9C0010;border-radius:14px;padding:14px 16px;font-size:14px;font-weight:600;line-height:1.7}',
    /* 來源列（他 2026-10-23「南投iei 的 沒有」）：哪一邊讀到幾筆、哪一邊讀不到，攤在最上面 */
    '#ev .src{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:11px;font-weight:700;color:var(--mute);background:#fff;border-radius:12px;padding:9px 12px}',
    '#ev .src i{font-style:normal;display:inline-flex;align-items:center;gap:5px}',
    '#ev .src i::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--blue)}',
    '#ev .src i.bad{color:#9C0010}#ev .src i.bad::before{background:#E30613}',
    /* 三個類別的顏色（避開紅色——紅色留給「逾期」）。
       ⛔ 對比要量在**膠囊自己的淡底上**，不是量在白底上：承接原本的 #0F7B6C 在白底 5.16、
          在淡綠底只有 4.38，守則要 ≥4.5 → 改深成 #0D6E60（5.22）。入境 5.81、續聘 5.06。 */
    '#ev .k-in{--kc:#0057B8;--kcbg:#E3EDF9}',
    '#ev .k-re{--kc:#6B4FBB;--kcbg:#EDE8FA}',
    '#ev .k-tk{--kc:#0D6E60;--kcbg:#E0F0EC}',
    /* 丁：名字下面的膠囊，寫「續聘 5月」 */
    '#ev .tag{display:inline-block;font-size:10px;font-weight:800;border-radius:5px;padding:1px 5px;margin-right:4px;color:var(--kc);background:var(--kcbg)}',
    /* 丁：月份尺釘在白卡底部（拇指構得到，捲到哪都看得見） */
    '#ev .foot{position:sticky;bottom:0;z-index:8;background:#fff;box-shadow:0 -2px 0 var(--hair);margin:0 -16px -16px;padding:5px 16px 8px}',
    '#ev .foot .mh{padding:0}',
    /* 戊：起算月那一格做記號（●入境 ○續聘 ◆承接）。
       ⛔ 放右下角、外面包一圈白：格子中間已經有 ✓／缺／！，疊上去會看不清。 */
    '#ev .c.start::after,#ev .lg .kd{content:"";width:7px;height:7px;background:var(--kc);box-shadow:0 0 0 1.5px #fff}',
    '#ev .c.start::after{position:absolute;right:-2px;bottom:-2px}',
    '#ev .k-in .c.start::after,#ev .c.start.k-in::after,#ev .k-in .kd{border-radius:50%}',
    '#ev .c.start.k-re::after,#ev .k-re .kd{border-radius:50%;background:#fff;box-shadow:0 0 0 1.5px #fff,inset 0 0 0 2px var(--kc)}',
    '#ev .c.start.k-tk::after,#ev .k-tk .kd{transform:rotate(45deg);border-radius:1px}',
    /* 戊：這個月整欄打亮。⛔ 位置用 CSS calc 算，不要用 JS 量寬度——量到 0 就飛出畫面 */
    '#ev .card.ev{position:relative;--nw:104px;--gp:3px;--cw:calc((100% - 32px - var(--nw) - 12*var(--gp)) / 12)}',
    '#ev .card.ev>.nowcol{position:absolute;top:0;bottom:0;z-index:0;pointer-events:none;background:var(--tint);opacity:.5;border-radius:7px;width:var(--cw);left:calc(16px + var(--nw) + var(--gp) + (var(--n) - 1) * (var(--cw) + var(--gp)))}',
    '#ev .card.ev>.r,#ev .card.ev>.dt,#ev .card.ev>.hint{position:relative;z-index:1}',
    '#ev .mo{margin-left:4px;border:0;background:none;padding:0;color:var(--blue);font:700 12px inherit;text-decoration:underline}'
  ].join('');

  var CH = 60;                                  // 一次畫幾列（565 人全畫手機會卡）
  var J = null, NAT = null, SORT = 'gap', SHOW = CH, OPEN = null;
  var FILL = { on: false, done: 0, stop: false, err: '' };   // 名單還在跟 IEI 補的進度
  var root, body, el, api, LIFF_ID, MINE = '';

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
  /* 入境／續聘／承接三類（他 2026-10-23「入境、續約、承接 視覺上要做區分」）。
     膠囊寫字（丁）＋起算月那一格做記號（戊）。⛔ 不可以只靠顏色。 */
  var KIND = { '入境': 'k-in', '續聘': 'k-re', '承接': 'k-tk' };
  var SITEN = { t: '台中', n: '南投' };
  function kcls(k) { return KIND[k] || 'k-in'; }

  /* 字少一半（他 2026-10-23「文字的補充說明再減掉40%」）：平常只留短的，長的收進「說明」 */
  function shortNote(short, long, cls) {
    var n = mkEl('div', null, { 'class': cls || 'note' });
    n.appendChild(document.createTextNode(short));
    if (long) {
      var b = mkEl('button', '說明', { 'class': 'mo', type: 'button' });
      var more = mkEl('div', long, { 'class': 'note' });
      more.hidden = true;
      b.onclick = function () { more.hidden = !more.hidden; b.textContent = more.hidden ? '說明' : '收起來'; };
      n.appendChild(b);
      n.appendChild(more);
    }
    return n;
  }

  function monthHead() {
    var h = mkEl('div', null, { 'class': 'mh' });
    h.appendChild(mkEl('i'));
    for (var m = 1; m <= 12; m++) h.appendChild(mkEl('i', String(m), m === J.nowM ? { 'class': 'now' } : {}));
    return h;
  }

  function pick() {
    return (J.rows || []).filter(function (r) { return !NAT || r.nat === NAT; });
  }
  function rows() {
    var list = pick();
    if (SORT === 'gap') list = list.slice().sort(function (a, b) {
      var ga = a.judged ? (a.cell.indexOf('miss') !== -1 ? 0 : (a.gaps || []).length ? 1 : 2) : 3;
      var gb = b.judged ? (b.cell.indexOf('miss') !== -1 ? 0 : (b.gaps || []).length ? 1 : 2) : 3;
      return ga - gb || (a.client || '').localeCompare(b.client || '');
    });
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
    var sp = mkEl('span');
    sp.appendChild(mkEl('b', r.kind + ' ' + r.start + '月', { 'class': 'tag ' + kcls(r.kind) }));
    sp.appendChild(document.createTextNode([r.nat, r.client].filter(String).join('・')));
    w.appendChild(sp);
    b.appendChild(w);
    r.cell.forEach(function (s, i) {
      var cl = 'c ' + s;
      if (i + 1 === r.start) cl += ' start ' + kcls(r.kind);      // 戊：起算月那一格
      b.appendChild(mkEl('span', TXT[s] || '', { 'class': cl }));
    });
    b.onclick = function () { OPEN = (OPEN === r ? null : r); draw(); };
    return b;
  }

  function monthName(m) { return m + ' 月'; }

  function detail(r) {
    var d = mkEl('div', null, { 'class': 'dt' });
    d.appendChild(mkEl('h3', r.name || r.orig));
    d.appendChild(mkEl('div', [r.client, r.nat, r.kind + ' ' + r.start + ' 月', r.status].filter(String).join('・'), { 'class': 'sub' }));

    if (!r.judged) {
      d.appendChild(mkEl('div', '這個人對不到 IEI 的工人代碼（名冊上的客戶名或中文名跟 IEI 不一樣），' +
        '所以我查不到他的訪視紀錄——這不代表他真的沒被訪視，我不會把他算成缺件。' +
        '要補的話請到訪談表自己搜尋這個人。', { 'class': 'note' }));
      return d;
    }
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
    if (!J) { body.appendChild(mkEl('div', '讀評鑑名單…', { 'class': 'hint' })); return; }
    if (J.err) { body.appendChild(mkEl('div', J.err, { 'class': 'er' })); return; }

    var all = pick();
    var nMiss = 0, nNow = 0, nUn = 0;
    all.forEach(function (r) {
      if (!r.judged) { nUn++; return; }
      if (r.cell.indexOf('miss') !== -1 || (r.re && r.re.state === 'miss')) nMiss++;
      else if ((r.gaps || []).indexOf(J.nowM) !== -1) nNow++;
    });

    /* ⛔ 來源列先畫（他 2026-10-23「南投iei 的 沒有」）：
       南投其實有 6 筆，是小禾讀不到卻一個字都沒講。哪一邊沒讀到就在這裡紅字寫出來。 */
    var sv = mkEl('div', null, { 'class': 'src' });
    (J.sites || []).forEach(function (x) {
      var nm = SITEN[x.site] || x.site;
      if (x.err) sv.appendChild(mkEl('i', 'IEI ' + nm + ' 讀不到', { 'class': 'bad' }));
      else if ((x.miss || []).length) sv.appendChild(mkEl('i', 'IEI ' + nm + ' ' + x.n + '（' + x.miss.length + ' 個月讀不到）', { 'class': 'bad' }));
      else sv.appendChild(mkEl('i', 'IEI ' + nm + ' ' + x.n));
    });
    sv.appendChild(mkEl('i', '行程表＋服務紀錄 ' + ((J.src && J.src.svc) || 0)));
    sv.appendChild(mkEl('i', '小禾送出 ' + ((J.src && J.src.xh) || 0)));
    var pp = J.ppl || {};
    sv.appendChild(mkEl('i', '名單：IEI 移工資料　台中 ' + (pp.t || 0) + '・南投 ' + (pp.n || 0) + ' 位在職'));
    (pp.err || []).forEach(function (e) { sv.appendChild(mkEl('i', e, { 'class': 'bad' })); });
    body.appendChild(sv);

    /* ⛔ 名單還在補的時候，一定要先講，而且要看得到進度（他 10/23 盯著空白轉了五分鐘） */
    var pp0 = J.ppl || {}, tot = (pp0.t || 0) + (pp0.n || 0);
    if (FILL.err || FILL.stop || pp0.left) {
      var pg = mkEl('div', null, { 'class': 'prog' + (FILL.err || FILL.stop ? ' bad' : '') });
      var doneN = tot - (pp0.left || 0);
      pg.appendChild(mkEl('b', FILL.err ? '名單補到一半停住了'
        : FILL.stop ? '名單還沒補完，先停下來'
        : '正在跟 IEI 建名單　' + doneN + '／' + tot + ' 位'));
      var bar = mkEl('div', null, { 'class': 'bar' });
      var i2 = mkEl('i');
      i2.style.width = (tot ? Math.round(doneN / tot * 100) : 0) + '%';
      bar.appendChild(i2);
      pg.appendChild(bar);
      pg.appendChild(mkEl('span', FILL.err ? FILL.err + '（關掉重開會從停住的地方繼續）'
        : FILL.stop ? '這一趟一位都問不到，先停住不再重試。下面是已經建好的部分；關掉重開會從這裡繼續。'
        : 'IEI 要一位一位問，第一次比較久。下面已經建好的可以先看，建好的會存起來，下次打開就不用再問了。'));
      body.appendChild(pg);
    }

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
      w.appendChild(mkEl('b', J.blind.join('、') + ' 月沒有任何紀錄'));
      w.appendChild(shortNote('IEI 是 ' + (J.first || 9) + ' 月才開始用，之前的紀錄不在系統裡，那幾格不算缺件、不列進數字。',
        '每兩個月那條鏈也從 ' + (J.first || 9) + ' 月開始算，不是從入境月算——不然起算月落在查不到的月份，' +
        '整個人會看起來「沒問題」，那比全紅更糟。'));
      body.appendChild(w);
    }
    if (nUn) body.appendChild(shortNote(nUn + ' 人對不到 IEI 的工人代碼，查不到不代表沒訪視，所以不算缺件。',
      '名冊上的客戶名或中文名跟 IEI 不一樣就對不起來。他們整列灰斜線，也不算進上面的數字。'));
    if (MINE && NAT === MINE) body.appendChild(shortNote('預設只看 ' + MINE + '：翻譯按國籍分，別人的工人你的帳號看不到紀錄，那邊會整片灰。',
      '按上面的籤可以切到別的國籍或全部。'));

    /* ⛔ 2026-10-23 他說「停止使用9/21 的名冊」：名單整個改成 IEI，而 IEI 要一位一位問，
       所以範圍就是「他的工廠」。「全公司」那個切換拿掉了——兩邊會是同一批人，留著只會讓他以為漏人。 */
    body.appendChild(shortNote('這 ' + (J.myCo || 0) + ' 家是你真的跑過的工廠（台中＋南投）。這是下限，跑得少的工廠還沒出現。',
      'IEI 沒有「負責翻譯」這一欄，所以是用 IEI 月曆＋行程表＋小禾送出＋服務紀錄四個來源回推你跑過哪幾家。' +
      'IEI 月曆只有兩個月、行程表只有一個月，所以漏掉的一定是跑得少的那幾家。'));

    var nats = [];
    all.forEach(function (r) { if (r.nat && nats.indexOf(r.nat) === -1) nats.push(r.nat); });
    nats.sort();
    var ch = mkEl('div', null, { 'class': 'chips' });
    var inScope = (J.rows || []);
    nats = [];
    inScope.forEach(function (r) { if (r.nat && nats.indexOf(r.nat) === -1) nats.push(r.nat); });
    nats.sort();
    [['', '全部 ' + inScope.length]].concat(nats.map(function (n) {
      return [n, n + ' ' + inScope.filter(function (r) { return r.nat === n; }).length];
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
    [['ok', '有紀錄'], ['due', '該去'], ['miss', '已逾期'], ['nodata', '查不到／判斷不了'], ['free', '不用去']].forEach(function (x) {
      var s = mkEl('span');
      var i = mkEl('i', TXT[x[0]] || '', {});
      i.className = 'c ' + x[0];
      i.style.cssText = 'width:16px;height:16px;aspect-ratio:auto';
      s.appendChild(i); s.appendChild(mkEl('span', x[1]));
      lg.appendChild(s);
    });
    ['入境', '續聘', '承接'].forEach(function (k) {      // 三類：形狀＋顏色，不只靠顏色
      var s = mkEl('span', null, { 'class': kcls(k) });    // 形狀跟格子裡的記號同一套 CSS，不在這裡重寫
      s.appendChild(mkEl('i', null, { 'class': 'kd' }));
      s.appendChild(mkEl('span', k));
      lg.appendChild(s);
    });
    body.appendChild(lg);

    var list = rows(), card = mkEl('div', null, { 'class': 'card ev' });
    if (J.nowM >= 1 && J.nowM <= 12) {                    // 戊：這個月整欄打亮
      var hl = mkEl('div', null, { 'class': 'nowcol' });
      hl.style.setProperty('--n', J.nowM);
      card.appendChild(hl);
    }
    if (!list.length) card.appendChild(mkEl('div',
      (J.ppl && J.ppl.left) ? '名單還在建，等一下就會出現。' : '這個國籍今年沒有要列入的人。', { 'class': 'hint' }));
    list.slice(0, SHOW).forEach(function (r) {
      card.appendChild(rowEl(r));
      if (OPEN === r) card.appendChild(detail(r));
    });
    var foot = mkEl('div', null, { 'class': 'foot' });    // 丁：月份尺釘在卡片底部
    foot.appendChild(monthHead());
    card.appendChild(foot);
    body.appendChild(card);

    if (list.length > SHOW) {
      var more = mkEl('button', '再看 ' + Math.min(CH, list.length - SHOW) + ' 位（還有 ' + (list.length - SHOW) + ' 位）', { 'class': 'more', type: 'button' });
      more.onclick = function () { SHOW += CH; draw(); };
      body.appendChild(more);
    }

    body.appendChild(shortNote('規則：起算月當月要有一張到場紀錄，之後相鄰兩筆不超過 2 個月。續聘另外要前 2～4 個月的文件。電聯不算。',
      '名單台中南投都從 IEI「移工資料」撈：入境＝聘僱日和入境日同一天、承接＝「承接」那欄有日期、' +
      '續聘＝聘僱日跟入境日不同但沒有承接日。IEI 沒有「續聘轉換日」這一欄，續聘只能這樣推。'));
  }

  /* 第一次：預設篩成「你有紀錄的那個國籍」（翻譯按國籍分，別人的工人你看不到紀錄）。
     ⛔ 名單還在補的時候不要定案——空名單會害它停在「全部」。 */
  function pickNat(j) {
    if (NAT !== null || !(j.rows || []).length) return;
    var c = {};
    j.rows.forEach(function (r) { if (r.cell.indexOf('ok') !== -1) c[r.nat] = (c[r.nat] || 0) + 1; });
    var best = '', n = 0;
    for (var k in c) if (c[k] > n) { n = c[k]; best = k; }
    NAT = n >= 3 ? best : '';
    MINE = NAT;
  }

  /* 名單不夠就一小批一小批補。
     ⛔ 2026-10-23 他在手機上等了五分鐘還在轉——第一次要跟 IEI 問幾百位，
        以前全塞在同一個請求裡。現在打開先畫存好的，剩下的分趟補，每一趟都重畫，
        他看得到數字在動，而且中途就有東西可以看。 */
  function fill() {
    if (!J || !J.ppl || !J.ppl.left || FILL.stop) return;
    FILL.on = true;
    draw();
    api({ api: 'evalfill' }).then(function (j) {
      J = j;
      FILL.done += (j.ppl && j.ppl.got) || 0;
      pickNat(j);
      /* 一趟下來一個都沒問到就停：再問下去只是把同一個錯誤重複幾十次 */
      if (!(j.ppl && j.ppl.got)) { FILL.on = false; FILL.stop = true; draw(); return; }
      FILL.on = false;
      draw();
      fill();
    }).catch(function (e) {
      FILL.on = false; FILL.stop = true; FILL.err = String((e && e.message) || e);
      draw();
    });
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
    api({ api: 'eval' }).then(function (j) {
      J = j;
      pickNat(j);
      draw();
      fill();
    })
      .catch(function (e) { J = { err: '讀不到：' + (e && e.message || e), rows: [] }; draw(); });
  };
})();
