/* 小禾查詢頁（他 10/22：「做成像羽禾 App 的放大鏡搜尋，打關鍵字找得到工人或工廠，工人要有他的資訊和服務過他的服務紀錄表」）。
   iei.html?v=find 載入，用 iei.html 的 api()、el()、norm()、bInfo()、LIFF_ID。
   兩段式（同 App）：人與工廠在手機上篩（xh.wk／xh.cust，打字當下就出）；有英文字母或數字才停手 0.4 秒問 IEI（手機清單只有中文名）。
   紀錄表只列自己填的（他 10/22 選的；IEI 本來就只給登入那個帳號的）。資料一律 textContent。 */
(function () {
  var css = [
    '#fd{max-width:560px;margin:0 auto;min-height:100vh;background:#EEF2F6;font-variant-numeric:tabular-nums}',
    '#fd .top{position:sticky;top:0;z-index:5;background:#EEF2F6;padding:12px 16px 8px;display:flex;gap:8px;align-items:center}',
    '#fd .back{flex:none;width:44px;height:44px;border:0;border-radius:50%;background:#fff;font-size:20px;color:var(--ink)}',
    '#fd .box{flex:1;min-width:0;display:flex;align-items:center;gap:8px;height:52px;padding:0 8px 0 16px;border-radius:16px;background:#fff;border:1.5px solid var(--line);color:var(--mute)}',
    '#fd .box:focus-within{border-color:var(--blue);box-shadow:0 0 0 4px rgba(0,87,184,.14);color:var(--blue)}',
    '#fd .box svg{width:22px;height:22px;flex:none;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round}',
    '#fd .box input{flex:1;min-width:0;border:0;outline:none;background:none;font:inherit;font-size:17px;font-weight:500;color:var(--ink)}',
    '#fd .clr{flex:none;width:44px;height:44px;border:0;background:none;font-size:20px;color:var(--mute)}',
    '#fd .ttl{flex:1;min-width:0;font-size:17px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '#fd .body{padding:4px 16px 48px;display:flex;flex-direction:column;gap:16px}',
    '#fd .hint{padding:24px 8px;text-align:center;color:var(--mute);font-size:15px;line-height:1.9}#fd .hint small{display:block;font-size:13px;margin-top:8px}',
    '#fd .list{background:#fff;border-radius:20px;overflow:hidden}',
    '#fd .row{display:flex;align-items:center;gap:12px;width:100%;min-height:60px;padding:10px 16px;border:0;border-top:1px solid var(--hair);background:#fff;font:inherit;color:var(--ink);text-align:left}',
    '#fd .row:first-child{border-top:0}#fd .row:active{background:var(--tint)}',
    '#fd .k{flex:none;font-size:12px;font-weight:700;border-radius:6px;padding:2px 8px;background:var(--tint);color:var(--blue)}#fd .k.c{background:#F3F5F8;color:var(--mute)}',
    '#fd .m{flex:1;min-width:0;display:flex;flex-direction:column}#fd .m b{font-size:16px;font-weight:700}#fd .m b mark{background:none;color:var(--blue)}',
    '#fd .m span{font-size:14px;color:var(--mute);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '#fd .chev{flex:none;color:var(--mute);font-size:18px}',
    '#fd .more{font-size:14px;color:var(--mute);text-align:center;margin:0}',
    '#fd .card{background:#fff;border-radius:24px;padding:20px;display:flex;flex-direction:column;gap:8px}',
    '#fd .pill{align-self:flex-start;font-size:13px;font-weight:700;border-radius:999px;padding:2px 10px;background:var(--tint);color:var(--blue)}',
    '#fd .name{font-size:28px;font-weight:800;line-height:1.25;margin:4px 0 0}#fd .en{font-size:15px;color:var(--mute)}',
    '#fd .due{display:flex;align-items:baseline;gap:6px;margin-top:4px}#fd .due b{font-size:30px}#fd .due span{font-size:14px;color:var(--mute)}',
    '#fd .due.w b{color:#B45309}#fd .due.x b{color:#C00012}',
    '#fd .btns{display:flex;gap:8px;margin-top:8px}#fd .btn{flex:1;min-height:48px;border:0;border-radius:14px;font:inherit;font-size:16px;font-weight:700;display:flex;align-items:center;justify-content:center;text-decoration:none}',
    '#fd .btn.go{background:var(--blue);color:#fff}#fd .btn.soft{background:var(--tint);color:var(--blue)}',
    '#fd h2{margin:0;font-size:17px;display:flex;justify-content:space-between;align-items:baseline;gap:8px}#fd h2 small{font-size:13px;font-weight:500;color:var(--mute)}',
    '#fd dl{display:grid;grid-template-columns:88px minmax(0,1fr);gap:8px 12px;margin:0;font-size:15px}#fd dt{color:var(--mute)}#fd dd{margin:0;overflow-wrap:anywhere}',
    '#fd .tl{display:flex;flex-direction:column}#fd .v{display:grid;grid-template-columns:52px minmax(0,1fr);gap:0 12px;padding:12px 0;border-top:1px solid var(--hair);border-left:0;border-right:0;border-bottom:0;background:none;font:inherit;color:var(--ink);text-align:left;width:100%}',
    '#fd .v:first-child{border-top:0}#fd .v .d{font-size:15px;font-weight:700}#fd .v .d small{display:block;font-size:12px;font-weight:500;color:var(--mute)}',
    '#fd .v .c{display:flex;flex-direction:column;gap:2px;min-width:0}#fd .v .c b{font-size:15px}#fd .v .c span{font-size:14px;color:var(--mute)}',
    '#fd .v .c p{margin:2px 0 0;font-size:14px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
    '#fd .st{align-self:flex-start;font-size:12px;font-weight:700;border-radius:6px;padding:1px 8px;background:#F3F5F8;color:var(--mute)}',
    '#fd .st.g{background:#E8F5EC;color:#0F7B3E}#fd .st.w{background:#E3EDF9;color:#003F87}#fd .st.o{background:#FFF4E5;color:#7A3300}#fd .st.d{background:#FFF4E5;color:#7A3300}',
    '#fd .v .op{font-size:13px;font-weight:700;color:var(--blue)}',
    '#fd .ld{padding:16px 0;text-align:center;color:var(--mute);font-size:15px}#fd .er{padding:12px 16px;border-radius:14px;background:#FFF4E5;color:#7A3300;font-size:14px;font-weight:700}',
    '#fd .site{font-size:12px;font-weight:700;border-radius:6px;padding:1px 6px;background:#F3F5F8;color:var(--mute);margin-left:6px;vertical-align:2px}'
  ].join('');
  var host = el('div', null, { id: 'fdhost' }); document.body.appendChild(host);
  var sh = host.attachShadow({ mode: 'open' }); sh.appendChild(el('style', css));
  var root = el('div', null, { id: 'fd' }), top = el('div', null, { class: 'top' }), body = el('div', null, { class: 'body' });
  root.appendChild(top); root.appendChild(body); sh.appendChild(root);

  var WK = null, CU = null, Q = '', HIT = [], BUSY = '', TMR = 0, STACK = [], SITES2 = false;
  try { WK = JSON.parse(localStorage.getItem('xh.wk') || 'null'); CU = JSON.parse(localStorage.getItem('xh.cust') || 'null'); } catch (e) {}
  function sites() { SITES2 = !!((WK && WK.w.some(function (w) { return /^n:/.test(w[1]); })) || (CU && CU.some(function (c) { return /^n:/.test(c.cu00); }))); }
  sites();
  if (!WK) api({ api: 'wks' }).then(function (j) { if (j.list && j.list.w) { WK = j.list; try { localStorage.setItem('xh.wk', JSON.stringify(WK)); } catch (e) {} sites(); if (!STACK.length) draw(); } }).catch(function () {});
  if (!CU) api({ api: 'custs' }).then(function (j) { if (j.list) { CU = j.list; try { localStorage.setItem('xh.cust', JSON.stringify(CU)); } catch (e) {} sites(); if (!STACK.length) draw(); } }).catch(function () {});

  function siteOf(cu) { return /^n:/.test(cu || '') ? 'n' : 't'; }
  function tag(cu) { return SITES2 && cu != null ? el('span', siteOf(cu) === 'n' ? '南投' : '台中', { class: 'site' }) : document.createTextNode(''); }
  function mark(t, q) {   // 打到的字標藍（textContent 組，不用 innerHTML）
    var b = el('b'), i = q ? t.toLowerCase().indexOf(q.toLowerCase()) : -1;
    if (i < 0) b.textContent = t;
    else { b.appendChild(document.createTextNode(t.slice(0, i))); b.appendChild(el('mark', t.substr(i, q.length))); b.appendChild(document.createTextNode(t.slice(i + q.length))); }
    return b;
  }
  function row(kind, name, sub, fn, cu) {
    var b = el('button', null, { type: 'button', class: 'row' }), m = el('span', null, { class: 'm' });
    b.appendChild(el('span', kind, { class: 'k' + (kind === '移工' ? '' : ' c') }));
    var nb = mark(name, Q.trim()); nb.appendChild(tag(cu)); m.appendChild(nb); m.appendChild(el('span', sub));
    b.appendChild(m); b.appendChild(el('span', '›', { class: 'chev' })); b.onclick = fn;
    return b;
  }
  function coOf(cu) { return (WK && WK.co[cu]) || ((CU || []).filter(function (c) { return c.cu00 === cu; })[0] || {}).name || ''; }
  function wkOfCu(cu) { return WK ? WK.w.filter(function (w) { return w[1] === cu; }) : []; }

  /* ---------- 搜尋 ---------- */
  function searchTop() {
    top.innerHTML = '';
    var box = el('label', null, { class: 'box' }), inp = el('input', null, { type: 'text', placeholder: '工人名字、工廠、居留證號', enterkeyhint: 'search', 'aria-label': '搜尋' }), x = el('button', '✕', { type: 'button', class: 'clr', 'aria-label': '清掉' });
    box.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>';   // 寫死的圖示
    inp.value = Q; x.hidden = !Q;
    inp.oninput = function () { Q = inp.value; x.hidden = !Q; type(); };
    inp.onkeydown = function (e) { if (e.key === 'Enter') inp.blur(); };
    x.onclick = function () { Q = ''; inp.value = ''; x.hidden = true; HIT = []; BUSY = ''; draw(); inp.focus(); };
    box.appendChild(inp); box.appendChild(x); top.appendChild(box);
    setTimeout(function () { if (!Q) try { inp.focus(); } catch (e) {} }, 60);
  }
  function type() {
    HIT = []; clearTimeout(TMR); draw();
    var q = Q.trim();
    if (/[㄀-ㄯˇˊˋ˙]/.test(q) || q.length < 2 || !/[A-Za-z0-9]/.test(q)) { BUSY = ''; return draw(); }   // 中文名手機清單就有；英文名、居留證號才問 IEI
    BUSY = q; draw();
    TMR = setTimeout(function () {
      api({ api: 'fnd', q: q }).then(function (j) {
        if (Q.trim() !== q) return;
        HIT = j.list || []; BUSY = j.many ? 'many' : ''; draw();
      }).catch(function (e) { if (Q.trim() === q) { BUSY = 'err:' + e.message; draw(); } });
    }, 400);
  }
  function draw() {
    body.innerHTML = '';
    var q = Q.trim(), n = norm(q);
    if (!q) {
      var h = el('div', null, { class: 'hint' });
      ['打工人中文名（打一部分就好）', '英文名、居留證號也可以', '打工廠名找一整家'].forEach(function (t) { h.appendChild(el('div', t)); });
      h.appendChild(el('small', WK ? '手機裡有 ' + WK.w.length + ' 位在職移工、' + (CU || []).length + ' 家工廠' : '正在下載移工清單…'));
      return body.appendChild(h);
    }
    var ws = !n || !WK ? [] : WK.w.filter(function (w) { return norm(w[2]).indexOf(n) !== -1; });
    var cs = !n || !CU ? [] : CU.filter(function (c) { var m = norm(c.name); return m && m.indexOf(n) !== -1; });
    var seen = {}, list = el('div', null, { class: 'list' });
    ws.forEach(function (w) { seen[siteOf(w[1]) + w[0]] = 1; });
    var hs = HIT.filter(function (h) { return !seen[h.site + h.la]; });
    /* 打的是工廠名（沒有人名字中）→ 工廠排前面（App 9/23 壓力測試學到的） */
    function cRows() { cs.slice(0, 4).forEach(function (c) { var k = wkOfCu(c.cu00).length; list.appendChild(row('工廠', c.name, (k ? '在職 ' + k + ' 人' : '') + (c.addr ? (k ? '・' : '') + c.addr : ''), function () { openCu(c.cu00, c.name); }, c.cu00)); }); }
    if (!ws.length && !hs.length) cRows();
    ws.slice(0, 8).forEach(function (w) { list.appendChild(row('移工', w[2], [coOf(w[1]), w[3]].filter(Boolean).join('・'), function () { openWk({ la: w[0], cu: w[1], zh: w[2], nat: w[3] }); }, w[1])); });
    hs.forEach(function (h) { list.appendChild(row('移工', [h.zh, h.en].filter(Boolean).join(' '), h.co || '', function () { openWk({ la: h.la, cu: h.cu || (h.site === 'n' ? 'n:' : ''), zh: h.zh, en: h.en, site: h.site }); }, h.site === 'n' ? 'n:' : '')); });
    if (ws.length || hs.length) cRows();
    if (list.children.length) body.appendChild(list);
    var tail = [];
    if (ws.length > 8) tail.push('還有 ' + (ws.length - 8) + ' 位・多打幾個字縮小範圍');
    if (BUSY === 'many') tail.push('「' + q + '」IEI 符合的人太多，打完整一點');
    else if (/^err:/.test(BUSY)) tail.push('IEI 沒查成功：' + BUSY.slice(4));
    else if (BUSY) tail.push('在 IEI 找英文名、居留證號…');
    if (!list.children.length && !BUSY) tail.push(/[A-Za-z0-9]/.test(q) || q.length < 2 ? '找不到「' + q + '」' + (q.length < 2 ? '，多打一個字' : '') : '手機清單找不到「' + q + '」（只有在職的），試試英文名或居留證號');
    tail.forEach(function (t) { body.appendChild(el('p', t, { class: 'more' })); });
  }

  /* ---------- 細節頁（工人／工廠）：一層一層疊，返回鍵與手機的上一頁都會退回 ---------- */
  function push(fn) { STACK.push(fn); history.pushState({ fd: STACK.length }, ''); fn(); scrollTo(0, 0); }
  function back() { history.back(); }
  window.addEventListener('popstate', function () { STACK.pop(); if (STACK.length) STACK[STACK.length - 1](); else { searchTop(); draw(); } });
  function headBar(t) {
    top.innerHTML = '';
    var b = el('button', '‹', { type: 'button', class: 'back', 'aria-label': '返回' }); b.onclick = back;
    top.appendChild(b); top.appendChild(el('div', t, { class: 'ttl' }));
  }
  function formUrl(o) { return location.pathname + '?liff=' + encodeURIComponent(LIFF_ID) + Object.keys(o).map(function (k) { return '&' + k + '=' + encodeURIComponent(o[k]); }).join(''); }
  function ymd(s) { var m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/.exec(String(s || '')); return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : ''; }
  function days(d) { return Math.round((Date.parse(d + 'T00:00:00+08:00') - Date.now()) / 864e5); }
  function dl(pairs) { var d = el('dl'); pairs.forEach(function (p) { if (!p[1]) return; d.appendChild(el('dt', p[0])); d.appendChild(el('dd', p[1])); }); return d; }
  function sec(t, small) { var h = el('h2', t); if (small) h.appendChild(el('small', small)); return h; }

  function visits(card, j, who) {   // 我填過的紀錄表（時間序單欄）
    card.innerHTML = '';
    card.appendChild(sec('我填過的紀錄表', j ? '近 ' + j.months + ' 個月・' + j.visits.length + ' 張' : ''));
    if (!j) return card.appendChild(el('div', '讀 IEI 紀錄表…', { class: 'ld' }));
    if (j.miss && j.miss.length) card.appendChild(el('div', '有 ' + j.miss.length + ' 個月 IEI 沒讀到（' + j.miss.join('、') + '），下面可能不完整', { class: 'er' }));
    if (!j.visits.length) return card.appendChild(el('div', '近 ' + j.months + ' 個月你沒有替' + who + '填過紀錄表（只看得到你自己帳號填的）', { class: 'ld' }));
    var tl = el('div', null, { class: 'tl' });
    j.visits.forEach(function (v) {
      var inf = bInfo(v), b = el(v.d ? 'button' : 'div', null, v.d ? { type: 'button', class: 'v' } : { class: 'v' }), d = el('div', v.date.slice(5).replace('-', '/'), { class: 'd' }), c = el('div', null, { class: 'c' });
      d.appendChild(el('small', v.date.slice(0, 4)));
      c.appendChild(el('b', who === '這家' ? (v.wn || []).slice(0, 3).join('、') + ((v.wn || []).length > 3 ? ' 等 ' + v.n + ' 人' : '') || v.n + ' 人' : v.cu));
      var it = (v.itn || []).join('、'); if (it || v.vt) c.appendChild(el('span', [it, v.vt ? '第 ' + v.vt + ' 次' : '', v.agn ? v.agn + '代理' : ''].filter(Boolean).join('・')));
      if (v.pr) c.appendChild(el('p', v.pr));
      var foot = el('div', null, { style: 'display:flex;gap:8px;align-items:center;margin-top:4px' });
      foot.appendChild(el('span', inf[0], { class: 'st ' + (inf[2] || '') }));
      foot.appendChild(el('span', 'IEI ' + v.svid, { style: 'font-size:12px;color:var(--mute)' }));
      if (v.d) foot.appendChild(el('span', '打開 ›', { class: 'op' }));
      c.appendChild(foot); b.appendChild(d); b.appendChild(c);
      if (v.d) b.onclick = function () { location.href = formUrl({ d: v.d, day: v.date }); };
      tl.appendChild(b);
    });
    card.appendChild(tl);
  }

  function openWk(w) { push(function () { drawWk(w); }); }
  function drawWk(w) {
    headBar('移工'); body.innerHTML = '';
    var cu = w.cu && w.cu !== 'n:' ? w.cu : '', co = w.co || coOf(cu), site = w.site || siteOf(w.cu);
    var card = el('div', null, { class: 'card' }), info = el('div', null, { class: 'card' }), vc = el('div', null, { class: 'card' });
    var pill = el('span', [w.nat, site === 'n' ? '南投 IEI' : SITES2 ? '台中 IEI' : ''].filter(Boolean).join('・') || '移工', { class: 'pill' });
    card.appendChild(pill); card.appendChild(el('div', w.zh || w.en, { class: 'name' }));
    var en = el('div', w.zh ? w.en || '' : '', { class: 'en' }); card.appendChild(en);
    var due = el('div', null, { class: 'due' }); card.appendChild(due);
    var btns = el('div', null, { class: 'btns' }), go = el('a', '開訪談表', { class: 'btn go', href: cu ? formUrl({ w: w.la, cu: cu, co: co }) : formUrl({}) });
    btns.appendChild(go); card.appendChild(btns);
    body.appendChild(card); info.appendChild(el('div', '讀 IEI 移工資料…', { class: 'ld' })); body.appendChild(info); body.appendChild(vc);
    visits(vc, null, '他');
    (w._j ? Promise.resolve(w._j) : api({ api: 'fdw', la: w.la, site: site, q: w.zh || (w.en || '').split(' ').sort(function (a, b) { return b.length - a.length; })[0] || '' })).then(function (j) {
      w._j = j;
      var r = j.w, f = (r && r.f) || {};
      info.innerHTML = '';
      if (!r) info.appendChild(el('div', 'IEI 移工資料讀不到這位' + (j.err ? '（' + j.err + '）' : '') + '，紀錄表照樣列在下面', { class: 'er' }));
      else {
        if (!w.zh && r.zh) card.children[1].textContent = r.zh;
        en.textContent = r.en || '';
        var dob = ymd(f['生日']), age = dob ? Math.floor((Date.now() - Date.parse(dob)) / 31557600000) : '';
        pill.textContent = [r.status && r.status !== '在職中' ? r.status : '', f['國籍'] || w.nat, f['性別'], age !== '' ? age + ' 歲' : ''].filter(Boolean).join('・');
        var end = ymd(f['到期日期']);
        if (end) { var n = days(end); due.className = 'due' + (n < 0 ? ' x' : n <= 90 ? ' w' : ''); due.appendChild(el('b', String(Math.abs(n)))); due.appendChild(el('span', n < 0 ? '天前期滿' : '天後期滿（' + end + '）')); }
        var tel = (String(f['電話'] || '').split(/[\/,、;\s]+/).filter(String)[0] || '').replace(/[^\d+]/g, '');
        if (tel) btns.appendChild(el('a', '撥打', { class: 'btn soft', href: 'tel:' + tel }));
        info.appendChild(sec('身分'));
        info.appendChild(dl([['居留證', r.arc || f['居留證']], ['生日', dob], ['電話', f['電話']], ['護照', [r.passport || f['護照號碼'], f['護照到期日'] ? '到 ' + f['護照到期日'] : ''].filter(Boolean).join('　')]]));
        info.appendChild(sec('期限'));
        info.appendChild(dl([['入境', ymd(f['入境日'])], ['聘僱日', ymd(f['聘僱日'])], ['期滿', end], ['居留證效期', ymd(f['居留證效期']) || f['居留證效期']]]));
        info.appendChild(sec('公司與住處'));
        info.appendChild(dl([['公司', co], ['接送地址', f['接送地址']], ['宿舍', f['居住地址']]]));
      }
      visits(vc, j, '他');
    }).catch(function (e) { info.innerHTML = ''; info.appendChild(el('div', e.message, { class: 'er' })); vc.innerHTML = ''; });
  }

  function openCu(cu, name) { push(function () { drawCu(cu, name); }); }
  function drawCu(cu, name) {
    headBar('工廠'); body.innerHTML = '';
    var c = (CU || []).filter(function (x) { return x.cu00 === cu; })[0] || {}, ws = wkOfCu(cu);
    var card = el('div', null, { class: 'card' }), wl = el('div', null, { class: 'card' }), vc = el('div', null, { class: 'card' });
    card.appendChild(el('span', (siteOf(cu) === 'n' ? '南投' : '台中') + ' IEI・在職 ' + ws.length + ' 人', { class: 'pill' }));
    card.appendChild(el('div', name, { class: 'name' }));
    if (c.addr) card.appendChild(el('div', c.addr, { class: 'en' }));
    var btns = el('div', null, { class: 'btns' });
    btns.appendChild(el('a', '開訪談表', { class: 'btn go', href: formUrl({ cu: cu, co: name }) }));
    if (c.addr) btns.appendChild(el('a', '導航', { class: 'btn soft', href: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(c.addr), target: '_blank' }));
    card.appendChild(btns); body.appendChild(card);
    if (ws.length) {
      wl.appendChild(sec('在職移工', ws.length + ' 人'));
      var list = el('div', null, { class: 'list', style: 'margin:0 -20px -20px;border-radius:0 0 24px 24px' });
      ws.forEach(function (w) { list.appendChild(row('移工', w[2], w[3] || '', function () { openWk({ la: w[0], cu: w[1], zh: w[2], nat: w[3] }); }, null)); });
      wl.appendChild(list); body.appendChild(wl);
    }
    body.appendChild(vc); visits(vc, null, '這家');
    (drawCu[cu] ? Promise.resolve(drawCu[cu]) : api({ api: 'fdc', cu: cu, co: name })).then(function (j) { drawCu[cu] = j; visits(vc, j, '這家'); })
      .catch(function (e) { vc.innerHTML = ''; vc.appendChild(el('div', e.message, { class: 'er' })); });
  }

  window.xhFindStart = function () { searchTop(); draw(); };
})();
