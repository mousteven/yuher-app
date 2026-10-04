/* 羽禾 移工服務平台 — 前端程式
   2026-09-12 從 src/Service.html 拆出來之後，**這個檔就是正本**。
   Service.html 只剩 16KB 的骨架（HTML 結構 ＋ 兩個伺服器端變數），
   前端程式已經不在那裡了，要改就是改這裡。
   改完 push 到 GitHub Pages，並在 Apps Script 重新部署換掉 ?v= 的版本戳記，
   否則同事的瀏覽器會繼續吃舊快取。 */
// 網址帶了登入碼就以它為準，沒帶才回頭找上次記住的
var CODE = PRESET_CODE || localStorage.getItem('svc.code') || '';
var TAX = null;
var seq = 0;

function $(id){ return document.getElementById(id); }
/* 手機上沒有開發者工具，前端出錯只會「按了沒反應」。
   把未攔截的錯誤直接顯示出來，才查得到是哪裡壞掉。 */
window.addEventListener('error', function(e){
  /* ⛔ 只印 e.message 的話，跨網域載入的 app.js 一律只會給
     「Script error.」——2026-09-21 就是這樣，查不下去。
     <script> 上已經掛了 crossorigin="anonymous"，所以檔名行號拿得到，
     一定要印出來，不然這個提示等於沒有。 */
  try{
    var at = e.filename ? (' @' + String(e.filename).split('/').pop() +
                           ':' + e.lineno + ':' + e.colno) : '';
    toast('前端錯誤：' + (e.message || e.type) + at, true);
  }catch(x){}
});
/* Promise 裡的錯誤不會觸發 error 事件，會靜靜消失。 */
window.addEventListener('unhandledrejection', function(e){
  try{ toast('前端錯誤：' + ((e.reason && (e.reason.message || e.reason)) || '?'), true); }
  catch(x){}
});
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
var tt;
function toast(m,bad){ var t=$('toast'); t.textContent=m; t.className='on'+(bad?' bad':'');
  clearTimeout(tt); tt=setTimeout(function(){ t.className=''; }, bad?3200:1600); }

/* ── 登入 ───────────────────────────────
   原本要打六支後端才看得到行事曆（驗登入碼、服務分類、常用客戶、
   審閱數量、這個月的行程、版本戳記）。Apps Script 每一支來回大概
   三到八百毫秒，而且同一個人的執行會互相排隊——在工廠用 4G 開，
   等四五秒是常有的事。現在合成一支 svcBootstrap。

   常用客戶那一份有四百多家、四百多位移工，大概 85KB。
   它只有在程式改版時才會變，所以存在這台手機上，
   把版本號帶給伺服器比對，一樣就不重傳。 */
function presetsCache(){
  try {
    var raw = localStorage.getItem('svc.presets');
    if(!raw) return null;
    var o = JSON.parse(raw);
    return (o && o.v && o.c) ? o : null;
  } catch(e){ return null; }
}

function login(code){
  $('btnLogin').disabled = true;
  var cached = presetsCache();
  google.script.run
    .withSuccessHandler(function(r){


      if(!r || !r.ok){ loginFail({ message: '登入碼不正確' }); return; }
      CODE = code;
      try { localStorage.setItem('svc.code', code); } catch(e){}
      TAX = r.tax;
      BUILD = r.build || BUILD;
      STAFF_NAME = r.staff || '';
      STAFF_ROLE = r.role || '';
      CREW = r.crew || [];

      if(r.clients){
        PRESETS = r.clients;
        try {
          localStorage.setItem('svc.presets',
            JSON.stringify({ v: r.presetsVer, c: r.clients }));
        } catch(e2){}     // 存不下就算了，下次再跟伺服器拿
      } else if(cached){
        PRESETS = cached.c;
      } else {
        PRESETS = [];
      }

      ADMIN_OF = r.adminOf || {};
      CREW_LANG_ = r.crewLang || {};

      $('login').style.display='none'; $('app').style.display='';
  document.body.classList.remove('lgon');
      $('who').textContent = STAFF_NAME;
      /* ⛔ 底頁要按角色重排（牟佑彬 2026-09-28：
         「翻譯、行政、特助能不能統一用一個介面」）。
         行政不跑外勤，填寫／追蹤／送審／評鑑對他們是雜訊；
         特助只確認，連填寫都不需要。 */
      applyRoleTabs();

      // 簽名板要在畫面顯示之後才 init，隱藏時量到的寬度是 0
      ['employer','staff'].forEach(function(k){
        initSig(document.querySelector('[data-sig='+k+']')); });
      addWorker();
      /* ⚠ 不要用 valueAsDate。在沒有原生日期輸入框的 Safari（桌機 WebKit）
         上，type=date 會退化成 text，設 valueAsDate 直接丟 InvalidStateError，
         **把後面整段初始化一起帶走**（客戶名單、翻譯人員、移工卡全部沒長出來），
         而錯誤只會顯示成一句「Script error.」。
         寫字串沒有這個問題，兩邊行為也一樣。 */
      $('date').value = todayStr();
      CAL_SEL = todayStr();

      fillClients();
      /* 上一次沒送出去的表：登入就先畫出來、順便試送一次。
         ⛔ 不畫的話他完全不知道手機裡還有東西。 */
      try { obPaint(); obFlush(); } catch(eOb){}
      var opts = '<option value="">請選擇…</option>' +
        CREW.map(function(n){ return '<option>'+esc(n)+'</option>'; }).join('');
      $('crew').innerHTML = opts;
      $('crewOwner').innerHTML = opts;
      if(CREW.indexOf(STAFF_NAME) !== -1){
        $('crew').value = STAFF_NAME;
        // 翻譯人員預設只看自己的：行事曆與查詢兩處一致
        CAL_MINE = true;
        $('mine').checked = true;
      }
      $('crewOwner').value = ''; PICKED_ = []; PICK_LG = ''; SCHED_ID = '';
      paintTodo(null);   // ⛔ 換人／清空時要收起來，不然會留著上一筆的交代
      [].forEach.call($('workers').children, fillWorkerNames);

      var bd = $('revBadge');
      if(r.reviewCount){ bd.textContent = r.reviewCount; bd.style.display=''; }
      /* 這兩個紅點數的不是同一種東西：送審數的是「服務紀錄」、
         追蹤數的是「案件」。一件案件可能含四筆紀錄，所以兩個數字
         永遠不會相等——摘要那一行會把單位寫出來（取捨三）。 */
      var cb = $('caseBadge');
      if(cb && r.caseCount){ cb.textContent = r.caseCount; cb.style.display=''; }

      fixStick();
      // 行事曆的資料 bootstrap 已經帶回來了，不用再打一次
      if(r.sched){ CAL_YM = r.sched.ym; drawSched(r.sched); }
      else loadCal();
      appShown();                     // 到這裡畫面已經有東西了，外殼可以收遮罩
    })
    .withFailureHandler(loginFail)
    .svcBootstrap(code, cached ? cached.v : '', ymOf(new Date()));
}

function loginFail(e){
  $('btnLogin').disabled = false;
  $('login').style.display=''; $('app').style.display='none';
  document.body.classList.add('lgon');
  appShown();                         // 登入畫面也是「看得到東西」
  var msg = (e && e.message) || '登入失敗';
  lgBusy(false);
  LG = ''; lgDraw(true);
  lgMsg(msg.indexOf('過多') !== -1 ? msg : '登入碼不正確，再試一次', true);
  try { localStorage.removeItem('svc.code'); } catch(err){}
}

$('btnLogin').addEventListener('click', function(){
  var c = $('code').value.trim();
  if(!c){ toast('請輸入登入碼', true); return; }
  login(c);
});

/* ── 切換身分（測試用）────────────────────────────────────
   牟佑彬 2026-09-30 要的：從帳號選單直接跳到行政／特助去測試，
   不用登出再登入。

   ⛔ **只有這份名單上的人看得到**，其他人連後端都不會去叫。
      這顆按鈕等於「一鍵變成別人」——名單與碼雖然在「操作說明」裡
      本來就對所有同事開放，但那是「查得到」，這是「一鍵切換」，門檻差很多。
   ⛔ **切換＝整頁重新整理**，不要在原地換 CODE。
      原地換的話 TAX／PRESETS／CAL_ROWS／REV 這些快取會留著上一個身分的資料，
      畫面看起來對、資料是錯的——那比直接壞掉更難查。 */
/* 誰可以「開始」切換。切過去之後靠裝置旗標，見 switchOK()。 */
var SWITCH_OK_ = ['佑彬'];
var SWITCH_FLAG_ = 'svc.devsw';
/* ⛔ 這一支是 2026-10-01 補的漏洞：原本只看 SWITCH_OK_，
   所以一切到行政一，**切換鈕就消失了，要回去只能登出重打登入碼**。
   我當時只想到「誰可以開始切換」，沒想到「切過去之後怎麼回來」。
   改成：名單上的人可以開始；開始過一次之後，**這台裝置**就一直看得到。
   ⚠ 旗標存在裝置上，所以別人的手機不會莫名其妙多出這顆按鈕。 */
function switchOK(){
  if(SWITCH_OK_.indexOf(STAFF_NAME) >= 0) return true;
  try { return localStorage.getItem(SWITCH_FLAG_) === '1'; } catch(e){ return false; }
}
var SWITCH_ROLES_ = ['翻譯', '行政', '特助', '副理', '總經理'];

function drawSwitch(){
  /* ⛔ 容器由這裡動態插入，**不要寫進 Service.html**。
     Service.html 是後端檔，改它就要重新部署；版本額度是稀缺資源
     （2026-09-30 只剩 5 個）。純 app.js 的改動推 GitHub Pages 就生效。 */
  var box = $('outSwitch');
  if(!box){
    var anchor = $('outBuild');
    if(!anchor) return;
    box = document.createElement('div');
    box.id = 'outSwitch';
    box.style.display = 'none';
    anchor.parentNode.insertBefore(box, anchor);
  }
  if(!switchOK()){ box.style.display = 'none'; return; }
  box.style.display = '';
  if(HELP_DIR){ drawSwitchRows(HELP_DIR); return; }
  box.innerHTML = '<div class="swrole"><div class="swt">切換身分</div>' +
    '<div class="swg"><span class="hint">載入中…</span></div></div>';
  google.script.run
    .withSuccessHandler(function(r){ HELP_DIR = r; drawSwitchRows(r); })
    .withFailureHandler(function(){
      box.innerHTML = '<div class="swrole"><div class="swt">切換身分</div>' +
        '<span class="hint">名單載入失敗，下拉重新整理再試</span></div>'; })
    .helpDirectory(CODE);
}
function drawSwitchRows(r){
  var box = $('outSwitch');
  if(!box || !r || !r.rows) return;
  /* 每個角色只留一個代表，不要把十一個翻譯都列出來。
     ⛔ 2026-10-01 實測抓到：原本 SWITCH_ROLES_ **沒有「翻譯」**，
        所以切成行政一之後清單變成「行政一／行政一／特助／副理／劉總」——
        行政一重複兩次（一次是「我」、一次是行政的代表），
        **而且完全回不去翻譯端**。按鈕有了、路卻是單向的。
     翻譯那一格固定挑 SWITCH_OK_ 上的人（佑彬自己的帳號），他是從那裡出發的。
     去重要用 code，不是用 role。 */
  var seen = {}, pick = [];
  SWITCH_ROLES_.forEach(function(role){
    var pool = r.rows.filter(function(x){ return x.role === role; });
    var x = pool.filter(function(y){ return SWITCH_OK_.indexOf(y.name) >= 0; })[0] || pool[0];
    if(x && !seen[x.code]){ seen[x.code] = 1; pick.push(x); }
  });
  var me = r.rows.filter(function(x){ return x.me; })[0];
  if(me && !seen[me.code]){ seen[me.code] = 1; pick.unshift(me); }
  box.innerHTML = '<div class="swrole"><div class="swt">切換身分（測試用）</div>' +
    '<div class="swg">' + pick.map(function(x){
      return '<button type="button" class="' + (x.code === CODE ? 'now' : '') +
        '" data-sw="' + esc(x.code) + '">' + esc(x.name) +
        '<i>' + esc(x.role || '翻譯') + '</i></button>';
    }).join('') + '</div></div>';
  [].forEach.call(box.querySelectorAll('[data-sw]'), function(b){
    b.onclick = function(){
      var c = b.dataset.sw;
      if(c === CODE){ $('outModal').style.display = 'none'; return; }
      switchTo(c);
    };
  });
}

/* 真的換人。
   ⛔ **不可以用 location.reload()。** app.js 第 8 行是
      `PRESET_CODE || localStorage.getItem('svc.code')`——
      網址上的 ?code= 優先權比 localStorage 高，而點專屬連結進來的網址都帶著碼。
      重新整理之後會再用網址那組登入、還把 localStorage 蓋回去，
      **切換等於沒發生，而且完全不報錯**（2026-09-30 實測）。
   ⛔ 每個人專屬的狀態一定要在這裡清乾淨。漏掉 CAL_MINE 的話，
      從翻譯切到行政會看到**空白的行事曆**——因為「只看我的」還開著，
      而行政名下一筆行程都沒有。 */
function switchTo(code){
  $('outModal').style.display = 'none';
  /* 用過一次就記住這台裝置，切成行政／特助之後才回得來。 */
  try { localStorage.setItem(SWITCH_FLAG_, '1'); } catch(e){}
  /* 跟登出清的是同一組，差別只在不回登入畫面。 */
  if(typeof fdWipe === 'function') fdWipe();
  TAX = null; PRESETS = []; CREW = []; MYSIG = '';
  STAFF_NAME = ''; STAFF_ROLE = '';
  CAL_ROWS = []; REV = null; EV = null;
  CAL_MINE = false;          // ⛔ 漏這行就是空白行事曆
  /* 勾勾也要跟著放掉。只改變數不改畫面的話，
     「只看我的」看起來是打勾的、實際上沒有在篩——**畫面在騙人**。 */
  if($('mine')) $('mine').checked = false;
  HELP_DIR = null;           // 名單要重拿，不然切換清單還標在舊的身分上
  EV_CREW = ''; DP_CLI = ''; DP_SUG = null;
  try { localStorage.removeItem('svc.presets'); } catch(e){}
  toast('切換中…');
  login(code);
}

/* 廠商篩選列（行政專用）。
   ⛔ 只列這個範圍內真的有排的，而且帶數量。換月份名單就跟著換。
   ⚠ 容器用注入的，不寫進 Service.html——那是後端檔，改它要重新部署。 */
function drawCalCli(live){
  var box = $('calCli');
  if(STAFF_ROLE !== '行政'){ if(box) box.style.display = 'none'; return; }
  if(!box){
    var anchor = $('calLangs');
    if(!anchor) return;
    box = document.createElement('div');
    box.id = 'calCli';
    box.className = 'calcli';
    anchor.parentNode.insertBefore(box, anchor.nextSibling);
  }
  box.style.display = '';
  var cnt = {}, order = [];
  (live || []).forEach(function(r){
    if(!r.client) return;
    if(cnt[r.client] === undefined){ cnt[r.client] = 0; order.push(r.client); }
    cnt[r.client]++;
  });
  order.sort(function(a, b){ return cnt[b] - cnt[a]; });
  /* 名字太長會把整列撐爆，砍掉「股份有限公司」這種後綴就夠認了 */
  var shortName = function(n){
    return String(n).replace(/(股份)?有限公司$/, '').slice(0, 8);
  };
  box.innerHTML =
    '<button type="button" data-cl="" class="'+(CAL_CLI?'':'on')+'">全部<s>'+
      (live||[]).length+'</s></button>' +
    order.map(function(n){
      return '<button type="button" data-cl="'+esc(n)+'" class="'+
        (CAL_CLI===n?'on':'')+'">'+esc(shortName(n))+'<s>'+cnt[n]+'</s></button>';
    }).join('');
  [].forEach.call(box.querySelectorAll('[data-cl]'), function(b){
    b.onclick = function(){
      CAL_CLI = (CAL_CLI === b.dataset.cl) ? '' : b.dataset.cl;
      drawCal();
    };
  });
}

/* ── 數字鍵盤 ──────────────────────────────────────
   四位數按完自動送出。按錯的時候點會抖一下並轉紅，
   不用讀字也知道錯了——這比跳一個對話框快，也不用再點一次關掉。 */
var LG = '';
function lgDraw(bad){
  var d = $('lgDots');
  [].forEach.call(d.children, function(i, n){
    i.className = (n < LG.length) ? 'on' : '';
  });
  d.className = 'lg-dots' + (bad ? ' bad' : '');
  if(bad) setTimeout(function(){ d.className = 'lg-dots'; }, 460);
}
/* 等待狀態。四個點開始呼吸、鍵盤退到背景、文字換成安靜的短句——
   「登入中…」那個刪節號是在製造焦慮，動態本身已經表達了「還在跑」。 */
function lgBusy(on){
  var d = $('lgDots'), p = $('lgPad'), m = $('lgMsg');
  if(d) d.className = 'lg-dots' + (on ? ' busy' : '');
  if(p) p.className = 'lg-pad' + (on ? ' busy' : '');
  if(m){
    m.textContent = on ? '正在登入' : '輸入登入碼';
    m.className = 'lg-msg' + (on ? ' busy' : '');
  }
}

function lgMsg(t, bad){
  var m = $('lgMsg');
  m.textContent = t;
  m.className = 'lg-msg' + (bad ? ' bad' : '');
}
function lgTap(k){
  if(k === 'del'){ LG = LG.slice(0, -1); lgDraw(); lgMsg('輸入登入碼'); return; }
  if(k === 'other'){ $('lgAlt').classList.toggle('on');
    try { $('code').focus(); } catch(e){} return; }
  if(LG.length >= 4) return;
  LG += k;
  lgDraw();
  try { if(navigator.vibrate) navigator.vibrate(8); } catch(e){}
  if(LG.length === 4){
    lgBusy(true);
    $('code').value = LG;
    login(LG);
  }
}
[].forEach.call($('lgPad').querySelectorAll('button'), function(b){
  // 按下去就給反應，不等放開
  b.addEventListener('pointerdown', function(){
    try { if(navigator.vibrate) navigator.vibrate(5); } catch(e){}
  });
  b.addEventListener('click', function(){ lgTap(b.dataset.k); });
});
/* 有實體鍵盤（桌機）時也能直接打 */
document.addEventListener('keydown', function(e){
  if($('login').style.display === 'none') return;
  if(document.activeElement === $('code')) return;
  if(/^[0-9]$/.test(e.key)) lgTap(e.key);
  else if(e.key === 'Backspace') lgTap('del');
});
$('code').addEventListener('keydown', function(e){ if(e.key==='Enter') $('btnLogin').click(); });

/* ── 常用客戶：挑一家就帶出地址、承辦人與這家的移工 ─────────
   同一家工廠每次手打，寫法都不一樣，之後查詢與統計就對不起來；
   固定下來也省掉在工廠現場翻通訊錄找電話。 */
var PRESETS = [];
var CREW = [];
var STAFF_NAME = '';
var STAFF_ROLE = '';
var ADMIN_OF = {};          // 客戶 → 負責行政。空的＝還沒劃分，全部都看得到
var OTHER_ = '__other__';

/* ── 登出 ──────────────────────────────────────
   共用手機或換人接手時要能換帳號；登入碼是存在這台機器上的，
   所以登出＝把它清掉再回登入畫面。 */
$('whoBtn').addEventListener('click', function(){
  $('outName').textContent = STAFF_NAME || '（未命名）';
  $('outRole').textContent = STAFF_ROLE ? (STAFF_ROLE + '　登入碼 ' + CODE) : ('登入碼 ' + CODE);
  drawSwitch();
  $('outBuild').textContent = '目前版本 ' + BUILD;
  $('outModal').style.display = '';
  checkBuild();
});

/* 重新整理。
   這一頁是嵌在 Apps Script 的沙箱 iframe 裡，直接 location.reload()
   重載的是那個 googleusercontent 網址，重載不回來就變成空白畫面
   （登出跳空白就是這個原因）。所以改成請外層的 App 外殼重新載入，
   外殼會在網址後面加一個時間戳，繞過瀏覽器快取。
   不在外殼裡（直接開網址）就退回用最上層的 location。 */
/* iPhone 底部那條 home 指示線的高度。
   iframe 裡面讀不到 env(safe-area-inset-bottom)，所以底部選單會停在
   指示線上方，外殼的底色從下面露出來——原生 App 的選單是一路鋪到底的。
   外殼量好之後用 postMessage 傳進來，這裡收下來設成 --sab。 */
window.addEventListener('message', function(ev){
  var d = ev.data;
  if(d && d.yuher === 'insets' && typeof d.bottom === 'number'){
    document.documentElement.style.setProperty('--sab', d.bottom + 'px');
    fixStick();
  }
});
/* ⚠️ 2026-09-18：送訊息給外殼一定要用 window.top，不能用 window.parent。

   Apps Script 不是把我們的 HTML 直接放進外殼的 iframe，而是自己再包一層：

     外殼 (mousteven.github.io)
      └ iframe → script.google.com/…/exec         ← Google 的包裝層
           └ iframe → googleusercontent.com       ← 程式真正跑的地方

   所以 window.parent 是「Google 的包裝層」，不是外殼。那一層收到我們的訊息
   就丟掉，外殼從來沒收到過任何一則——下拉更新沒作用、「有新版本」按了沒反應、
   安全區域的顏色沒傳過去、底部選單的高度沒對齊，全都是同一個原因。

   postMessage 本身可以跨網域，所以直接送給 window.top 就到得了外殼。
   （window.top.location 才會被擋，那是另一回事。） */
function shellPost(msg){
  try {
    if(window.top && window.top !== window) window.top.postMessage(msg, '*');
  } catch(e){}
}

/* 「畫面真的可以看了」。跟 ready 不一樣，這一點很重要：

   ready 是 app.js 一開始跑就送的（第三百多行，整支三千多行），
   那時候登入還沒驗、資料還沒抓、畫面是空的。外殼如果收到 ready 就把
   載入遮罩拿掉，使用者會看到深藍消失之後又一片白——這正是他回報的現象。

   所以另外送一則 shown：畫面上已經有東西可以看了才送。
   三個時間點：登入成功畫完行事曆、登入失敗顯示登入畫面、
   一開始就沒有登入碼直接顯示登入畫面。 */
function appShown(){
  /* 等真的畫出來再講。原本是收完資料就立刻送，但那一刻瀏覽器還沒把新畫面
     畫上去——外殼收掉藍色遮罩的時候，下面其實還是白的，所以他看到「白畫面
     停留一下」。連等兩個影格：第一個是「安排這一次繪製」，第二個代表
     「上一次繪製已經送出去了」。到這裡畫面才真的在螢幕上。 */
  requestAnimationFrame(function(){
    requestAnimationFrame(function(){ shellPost({ yuher: 'shown' }); });
  });
}

/* 反過來告訴外殼我們的頂欄與底欄該是什麼顏色，
   安全區域那一條才不會露出不搭的底色。 */
function tellShell(){
  try {
    var cs = getComputedStyle(document.body);
    shellPost({
      yuher: 'ready',
      top: cs.getPropertyValue('--chrome-bg').trim() || '#1B3B6F',
      /* ⚠ 瀏海／狀態列那一條在 iframe 外面，是外殼畫的。
         只送純色的話它會跟頂欄的漸層對不起來——2026-09-24 他截圖抓到。
         135° 在 390×66 這種扁比例裡幾乎等於橫向，所以外殼那一條
         畫同一道漸層，左右變化就會接得上，接縫看不出來。 */
      topGrad: cs.getPropertyValue('--chrome-grad').trim(),
      bottom: cs.getPropertyValue('--card').trim() || '#ffffff'
    });
  } catch(e){}
}

function appReload(){
  shellPost({ yuher: 'reload' });
  /* 外殼收到之後會整個換掉那個 iframe，我們的文件會被卸載，
     下面這一行就執行不到。1.2 秒後還活著＝沒有外殼（直接開網址的情況），
     那就自己重載。

     注意不要用 top.location.reload()：top 是外殼、跨網域，一定會被擋，
     以前那個「退路」其實從來沒有跑成功過。 */
  setTimeout(function(){
    try { location.reload(); } catch(e){}
  }, 1200);
}
/* 日間／夜間／跟著手機。存在這台手機上。
   「自動」是跟系統走——白天在工廠亮、晚上回家暗，不用自己切。
   不管哪一種，簽名板與服務表預覽都是白底（見 CSS 的說明）。 */
/* 字級。預設「大」——使用者年齡層偏中年以上，在工廠光線雜的地方看手機。
   換字級之後所有釘住的高度都要重量，不然標題會疊到。 */
function fsPref(){
  try { return localStorage.getItem('svc.fs') || '1.12'; } catch(e){ return '1.12'; }
}
function applyFs(){
  var v = fsPref();
  document.documentElement.style.setProperty('--fs', v);
  [].forEach.call($('outFs').querySelectorAll('button'), function(b){
    b.className = (b.dataset.f === v) ? 'on' : '';
  });
  fixStick();
}
[].forEach.call($('outFs').querySelectorAll('button'), function(b){
  b.addEventListener('click', function(){
    try { localStorage.setItem('svc.fs', b.dataset.f); } catch(e){}
    applyFs();
  });
});
applyFs();

var THEME_MQ = matchMedia('(prefers-color-scheme: dark)');
/* 預設日間。翻譯是在工廠、宿舍、醫院這些地方用，環境光線亮，
   白底好讀；要夜間的人自己去切，切了就記住。 */
function themePref(){
  try { return localStorage.getItem('svc.theme') || 'light'; } catch(e){ return 'light'; }
}
function applyTheme(){
  var p = themePref();
  var dark = (p === 'dark') || (p === 'auto' && THEME_MQ.matches);
  document.body.classList.toggle('dark', dark);
  [].forEach.call($('outTheme').querySelectorAll('button'), function(b){
    b.className = (b.dataset.th === p) ? 'on' : '';
  });
  var m = document.querySelector('meta[name=theme-color]');
  if(m) m.setAttribute('content', dark ? '#141C2E' : '#1B3B6F');
  tellShell();
}
[].forEach.call($('outTheme').querySelectorAll('button'), function(b){
  b.addEventListener('click', function(){
    try { localStorage.setItem('svc.theme', b.dataset.th); } catch(e){}
    applyTheme();
  });
});
if(THEME_MQ.addEventListener) THEME_MQ.addEventListener('change', function(){
  if(themePref() === 'auto') applyTheme();
});
applyTheme();

/* 分頁列放上面還是下面。存在這台手機上，每個人可以不一樣。 */
function tabsPos(){
  var v = 'bottom';
  try { v = localStorage.getItem('svc.tabs') || 'bottom'; } catch(e){}
  return v;
}
function applyTabsPos(){
  var bottom = tabsPos() === 'bottom';
  document.body.classList.toggle('tabsbottom', bottom);

  /* 選單放下面時，要把它搬出 #chrome。
     #chrome 往下滑時是用 transform 收起來的，而 transform 會讓
     裡面 position:fixed 的東西改成相對於它定位——選單就會跟著
     一起飛到畫面上方去。搬出來之後它才是真的固定在視窗底部。 */
  var tabs = document.querySelector('.tabs');
  var chrome = $('chrome');
  if(tabs && chrome){
    if(bottom && tabs.parentNode === chrome){
      $('app').appendChild(tabs);
    } else if(!bottom && tabs.parentNode !== chrome){
      chrome.appendChild(tabs);
    }
  }
  var b = $('outTabs');
  if(b) b.textContent = bottom ? '分頁列改放上面' : '分頁列改放下面（拇指好按）';
  fixStick();
}

$('outTabs').addEventListener('click', function(){
  try { localStorage.setItem('svc.tabs', tabsPos() === 'bottom' ? 'top' : 'bottom'); }
  catch(e){}
  applyTabsPos();
});
applyTabsPos();

/* 查詢讓位給追蹤，但功能沒有拿掉——查舊紀錄是偶爾才做的事，
   追蹤那四件是天天要看的，底部那五格要給天天用的東西。 */
/* ⚠ 這幾個元素是新版 Service.html 才有的。版面在 GitHub Pages、
   後端在 Apps Script，兩邊各自能推——**很容易只推一半**。
   先推 Pages 的話，舊版面上這幾個 id 都不存在，沒有這層保護整個 App 會掛。
   有就綁、沒有就算了，舊版面照樣能用。 */
if($('outFind')) $('outFind').addEventListener('click', function(){
  $('outModal').style.display = 'none';
  document.querySelectorAll('.tabs button').forEach(function(x){ x.classList.remove('on'); });
  document.querySelectorAll('.pane').forEach(function(p){ p.classList.remove('on'); });
  $('p-find').classList.add('on');
  drawAudit();
  hideBack(); backToTop();
});

$('outReload').addEventListener('click', runUpdate);
$('newver').addEventListener('click', runUpdate);

/* ── 程式更新 ───────────────────────────────────────
   ⛔ 跟「下拉更新」是兩件不同的事，以前混在一起：
      下拉會把整個程式重載，三秒白畫面，填到一半的東西消失。
      使用者下拉要的只是「資料是不是新的」。

   下拉    → 只重新抓這一頁的資料（ptrRefresh）
   有新版  → 自己更新，不要叫他按（下面這一段）

   ⚠ YouTube 可以想更新就更新，因為它沒有表單。我們有——
     填到一半的服務紀錄、簽名板上那一筆、開著的視窗。
     重載就全部消失，而且他不會知道是誰弄掉的。
     所以自動更新只在「乾淨」的時候做，不乾淨就先掛著等。 */

var NEWVER_ = false;          // 伺服器上有比這一頁新的版本
var BUILD_AT = 0;

/* 現在重載會不會弄丟東西。
   ⚠ 填寫分頁只要開著就算忙——不去猜「他有沒有真的填了字」。
     猜錯的代價不對稱：多等一下沒人受傷，猜錯就是他打的字沒了。 */
function appBusy(){
  if(typeof DIRTY_ !== 'undefined' && DIRTY_) return true;
  var pane = document.querySelector('.pane.on');
  if(pane && pane.id === 'p-new') return true;
  var masks = document.querySelectorAll('.smask, .rvfull, #pvModal, #outModal');
  for(var i = 0; i < masks.length; i++){
    if(masks[i].style.display !== 'none' && masks[i].offsetParent !== null) return true;
  }
  return false;
}

function checkBuild(force){
  if(!force && BUILD_AT && (Date.now() - BUILD_AT) < 5*60*1000) return;
  BUILD_AT = Date.now();
  google.script.run.withSuccessHandler(function(b){
    if(b && BUILD && b !== BUILD){ NEWVER_ = true; tryUpdate(); }
  }).withFailureHandler(function(){}).appBuild();
}

/* 能更新就直接更新；不能就顯示一條，等他手上的事做完。 */
function tryUpdate(){
  if(!NEWVER_) return;
  if(appBusy()){
    $('newver').textContent = '有新版本　·　等你這一筆做完就更新';
    $('newver').style.display = '';
    fixStick();
    return;
  }
  runUpdate();
}

function runUpdate(){
  $('newver').style.display = 'none';
  /* ⚠ #upbar 是 2026-09-21 才加進 Service.html 的。
     GitHub Pages 的 app.js 會比 Apps Script 的部署早幾分鐘到，
     那個空檔裡舊版面上沒有這個元素——不防的話這裡直接炸，
     整條更新的路斷掉，而且畫面上看不出原因。 */
  var bar = $('upbar');
  if(bar) bar.style.display = '';
  fixStick();
  appReload();
}

document.addEventListener('visibilitychange', function(){
  if(!document.hidden && CODE) checkBuild();
});
$('outCancel').addEventListener('click', function(){
  $('outModal').style.display = 'none';
});
$('outGo').addEventListener('click', function(){
  try { localStorage.removeItem('svc.code'); } catch(e){}
  /* ⛔ 登出一併清掉切換旗標。手機借人或轉給同事時，
     不可以讓對方一登入就看到「一鍵變成別人」。 */
  try { localStorage.removeItem('svc.devsw'); } catch(e){}
  /* ⛔ 名冊裡有 1687 個人的完整手機，登出一定要一起清掉。
     ⚠ 2026-09-23 我在 commit 訊息裡寫了「登出清掉」，但其實沒接上——
       fdWipe 只有存備註的時候被呼叫到。**寫在訊息裡不等於做了。** */
  if(typeof fdWipe === 'function') fdWipe();
  CODE = ''; TAX = null; PRESETS = []; CREW = []; MYSIG = '';
  STAFF_NAME = ''; STAFF_ROLE = '';
  CAL_ROWS = []; REV = null; EV = null;
  $('outModal').style.display = 'none';
  $('app').style.display = 'none';
  $('login').style.display = '';
  document.body.classList.add('lgon');
  $('btnLogin').disabled = false;
  $('code').value = '';
  LG = ''; lgDraw(); lgMsg('輸入登入碼');
  $('lgAlt').classList.remove('on');
});

/* 下拉選到「其他」就把旁邊的輸入框放出來，兩者取其一當作值。
   固定選項是為了讓同一家工廠、同一個人每次都寫成同一種寫法，
   不然查詢與統計會被拆成好幾筆。 */
function bindOther(sel, inp){
  sel.addEventListener('change', function(){
    var on = sel.value === OTHER_;
    inp.style.display = on ? '' : 'none';
    if(on) inp.focus();
  });
}
function valOf(sel, inp){
  return sel.value === OTHER_ ? inp.value.trim() : sel.value;
}
/* #client 現在是 hidden input，選擇器直接把最後的名字寫進去
   （名單上沒有的雇主也一樣，走選擇器裡的「自行輸入」那一列）。 */
function clientVal(){ return $('client').value.trim(); }

/* 客戶清單依服務對象過濾：選了「家庭雇主」就不該還看到一堆工廠。
   宣導也是對工廠，所以沿用工廠的清單。 */
function targetKind(){ return $('target').value.indexOf('家庭') !== -1 ? '家庭雇主' : '工廠'; }
/* 服務紀錄那一邊的選擇器。
   ⚠ 預設分頁是「最近選過」——同一個翻譯一週跑的就是那幾家，
     第一週它是空的（畫面上有講），之後就是兩下點完。 */
var SVC_PK_ = {
  id: 'svcPk', mode: 'svc', list: [], allowNew: true,
  onPick: function(c){ setClientValue(c); applyPreset(); }
};
/* ⛔⛔ 2026-09-21：這裡曾經直接把 PRESETS 丟給選擇器，結果整個清單是空的
   ＋ 一句「前端錯誤：Script error.」。原因是**兩邊的資料形狀不一樣**：
     hcClients 給的是 {c, n, due, late, missed, fac, who, next}
     PRESETS   給的是 {c, t, crew, p, w}
   `x.fac` 是 undefined → 走到家庭雇主那一支 → `x.who.length` 直接炸，
   而 pkDraw 在 `box.innerHTML = …` 之前就死了，所以畫面**留在空白**，
   看起來像「打字沒反應」。我當時誤判成輸入法的問題，修錯了兩次。
   ⚠ 共用元件就要在入口把形狀轉好，不要讓元件去猜。 */
function pkFromPreset_(x){
  var w = x.w || [];
  return { c: x.c, n: w.length, fac: (x.t || '工廠') === '工廠',
           who: w.slice(0, 3).map(function(p){ return p.n; }),
           due: 0, late: 0, missed: 0, next: '' };
}

function fillClients(){
  var kind = targetKind();
  var keep = $('client').value;
  SVC_PK_.list = PRESETS.filter(function(x){ return (x.t || '工廠') === kind; })
                        .map(pkFromPreset_);
  /* 換服務對象之後，原本選的那一家可能不在這一類裡了。
     ⛔ 不要默默留著——工廠名單裡選到家庭雇主，移工名單會整個對不上。
        自行輸入的（不在名單上）留著，那是他刻意打的。 */
  if(keep && presetOf(keep) && !SVC_PK_.list.some(function(x){ return x.c === keep; })){
    setClientValue('');
  }
  if($('svcPkPop').style.display !== 'none') pkDraw(SVC_PK_);
}

function presetOf(name){
  var k = String(name||'').replace(/[\s　]/g,'');
  if(!k) return null;
  for(var i=0;i<PRESETS.length;i++){
    if(PRESETS[i].c.replace(/[\s　]/g,'')===k) return PRESETS[i];
  }
  return null;
}
/* 換工廠時，每張移工卡的姓名選單都要跟著換成那一家的人 */
function fillWorkerNames(card){
  var sel = card.querySelector('[data-k=name]');
  var oth = card.querySelector('[data-k=nameOther]');
  if(!sel) return;
  var keep = sel.value;
  var pz = presetOf(clientVal());
  sel.innerHTML = '<option value="">請選擇…</option>' +
    (pz ? pz.w.map(function(w){
        return '<option value="'+esc(w.n)+'">'+esc(w.n)+
               (w.o?'　'+esc(w.o):'')+'</option>'; }).join('') : '') +
    '<option value="'+OTHER_+'">其他（自行輸入）</option>';
  sel.value = keep || '';
  if(sel.value !== OTHER_) oth.style.display='none';
  if(!sel.__bound){
    sel.__bound = true;
    bindOther(sel, oth);
    // 挑到名單上的人，語別自動跟著選
    sel.addEventListener('change', function(){
      var p2 = presetOf(clientVal()); if(!p2) return;
      var hit = p2.w.filter(function(w){ return w.n === sel.value; })[0];
      if(!hit) return;
      [].forEach.call(card.querySelectorAll('input[type=radio]'), function(r){
        if(r.value === hit.l) r.checked = true;
      });
    });
  }
}
function applyPreset(){
  var pz = presetOf(clientVal());
  // 這家的專責翻譯自動帶入；實際由別人代跑時，在下面的代理人員註記
  if(pz && pz.crew) $('crew').value = pz.crew;
  // 宣導模式是使用者自己選的，不要被工廠的預設服務對象蓋掉
  if(pz && pz.t && !isBrief()) $('target').value = pz.t;
  [].forEach.call($('workers').children, fillWorkerNames);
  if(isBrief()) fillPicks();
}
/* ⚠ hidden input 不會發 change，所以不掛監聽——選擇器的 onPick 直接叫 applyPreset。 */
pkWire(SVC_PK_);

/* ── 翻譯人員的簽名存在伺服器，跟著帳號走 ──────────────────
   同一個人一天要簽好幾份，每次重畫太浪費時間。
   不存在瀏覽器裡：這一頁跑在巢狀 iframe，清快取或換手機就沒了；
   存在伺服器端，換裝置或代理人登入自己的帳號都還在。 */
var MYSIG = '';
function saveMySig(u){
  MYSIG = u;
  google.script.run
    .withSuccessHandler(function(){ toast('簽名已存，下次開表自動帶入'); })
    .withFailureHandler(function(e){ toast(e.message, true); })
    .saveStaffSignature(CODE, u);
}
/* 簽名要用才抓，抓過就留著。登入時不拿——Drive 呼叫是最慢的一種，
   而這張圖只有按「簽名」的時候才用得到。 */
var MYSIG_ASKED = false;
function ensureMySig(then){
  if(MYSIG || MYSIG_ASKED){ if(then) then(); return; }
  MYSIG_ASKED = true;
  google.script.run
    .withSuccessHandler(function(u){ MYSIG = u || ''; if(then) then(); })
    .withFailureHandler(function(){ if(then) then(); })
    .getMySignature(CODE);
}

function applyMySig(){
  var box = document.querySelector('[data-sig=staff]');
  if(box && box.__sig && MYSIG && !box.__sig.signed()) box.__sig.set(MYSIG);
}

/* ── 宣導（一對多）─────────────────────────────
   到工廠做宣導時對的是 20～30 人，不可能一個個在翻譯人員的手機上簽。
   做法：現場出示 QR，大家用自己的手機同時簽，翻譯人員這端看即時進度。
   工廠訊號差就退回紙本簽到表拍照。 */
var BRIEF = null;          // { token, url }
var BRIEF_TIMER = null;

function isBrief(){ return $('target').value.indexOf('宣導') !== -1; }

/* 參加人員勾選。宣導不一定是全廠都來，先圈出應到名單，
   之後的進度、簽到頁的名單、PDF 的「應到／實到」才有意義。 */
var PICK_LG = '';   // '' = 全部
function fillPicks(){
  var pz = presetOf(clientVal());
  var ws = pz ? pz.w : [];
  // 國籍篩選鈕只列這家實際有的語別，不要出現空的選項
  var langs = [];
  ws.forEach(function(w){ if(langs.indexOf(w.l) === -1) langs.push(w.l); });
  $('pickFilter').innerHTML = ws.length
    ? ['<button type="button" data-lg="" class="'+(PICK_LG?'':'on')+'">全部 '+ws.length+'</button>']
        .concat(langs.map(function(l){
          var n = ws.filter(function(w){ return w.l === l; }).length;
          return '<button type="button" data-lg="'+esc(l)+'" class="'+
                 (PICK_LG===l?'on':'')+'">'+esc(l)+' '+n+'</button>';
        })).join('')
    : '';
  var show = PICK_LG ? ws.filter(function(w){ return w.l === PICK_LG; }) : ws;
  var picked = pickedNames();
  $('pickList').innerHTML = ws.length
    ? show.map(function(w){
        return '<label><input type="checkbox" value="'+esc(w.n)+'"'+
          (picked.indexOf(w.n) !== -1 ? ' checked' : '')+'>'+
          '<span>'+esc(w.n)+
            (w.o?'<span class="o">'+esc(w.o)+'</span>':'')+'</span>'+
          '<span class="lg">'+esc(w.l)+'</span></label>';
      }).join('')
    : '<div class="empty">先選工廠，這裡才會出現名單</div>';
  countPicks();
}
/* 勾選狀態要跨篩選保留，不然切到「泰」再切回「全部」就把剛剛勾的清掉了 */
var PICKED_ = [];
$('pickFilter').addEventListener('click', function(e){
  var b = e.target.closest('button'); if(!b) return;
  PICKED_ = pickedNames();
  PICK_LG = b.dataset.lg || '';
  fillPicks();
});
function pickedNames(){
  var vis = [].map.call($('pickList').querySelectorAll('input:checked'),
                        function(i){ return i.value; });
  // 被篩選藏起來、但先前勾過的也要算進去
  var hidden = PICKED_.filter(function(n){
    return !$('pickList').querySelector('input[value="'+n.replace(/"/g,'')+'"]');
  });
  return vis.concat(hidden).filter(function(v,i,a){ return a.indexOf(v)===i; });
}
function countPicks(){ $('pickCount').textContent = pickedNames().length; }
$('pickList').addEventListener('change', countPicks);
// 全選只作用在目前篩選出來的人，這樣「選全部泰國工」才是一鍵
$('pickAll').addEventListener('click', function(){
  [].forEach.call($('pickList').querySelectorAll('input'), function(i){ i.checked = true; });
  countPicks();
});
$('pickNone').addEventListener('click', function(){
  [].forEach.call($('pickList').querySelectorAll('input'), function(i){ i.checked = false; });
  PICKED_ = [];
  countPicks();
});

function syncMode(){
  var b = isBrief();
  $('briefCard').style.display = b ? '' : 'none';
  // 宣導只填一次服務內容，所以固定留一張卡、也不給再加人
  $('addWk').style.display = b ? 'none' : '';
  [].forEach.call($('workers').children, function(el, i){
    el.style.display = (b && i > 0) ? 'none' : '';
    var nm = el.querySelector('.f');
    if(nm) nm.style.display = b ? 'none' : '';        // 宣導不填個別姓名
    // 宣導現場常常同時有越、泰、印、菲，語別要可以複選，
    // 服務表上中文底下就會依序出現每一種語言的翻譯
    [].forEach.call(el.querySelectorAll('input[type=radio]'), function(r){
      r.type = b ? 'checkbox' : 'radio';
    });
    var sg = el.querySelector('[data-sig=worker]');
    if(sg) sg.style.display = b ? 'none' : '';         // 簽名在簽到表上
    /* 宣導只留一張卡，「同上」沒有上一位可以複製、「移除」移掉就沒了 */
    var hb = el.querySelector('.wkh > div');
    if(hb) hb.style.display = b ? 'none' : '';
  });
  var h = $('workers').querySelector('.wkh b');
  if(h) h.textContent = b ? '宣導內容' : '移工 1';
}
$('target').addEventListener('change', function(){
  fillClients(); syncMode(); if(isBrief()) fillPicks();
});

$('briefStart').addEventListener('click', function(){
  if(!clientVal()){ toast('請先選工廠／雇主名稱', true); return; }
  if(!pickedNames().length){ toast('請先勾選這場宣導的參加人員', true); return; }
  var b = $('briefStart'); b.disabled = true; b.textContent = '產生中…';
  var ws = collectWorkers();
  google.script.run
    .withSuccessHandler(function(r){
      b.disabled = false; b.textContent = '開始簽到，產生 QR';
      briefShow(r);
    })
    .withFailureHandler(function(e){
      b.disabled = false; b.textContent = '開始簽到，產生 QR'; toast(e.message, true);
    })
    .createBriefing(CODE, {
      client: clientVal(), date: $('date').value, crew: $('crew').value,
      topic: ws.length ? (ws[0].big + ' / ' + ws[0].sub) : '',
      content: briefContent_(),
      expected: pickedNames()
    });
});

/* 把場次畫到畫面上。開新的一場、以及重新打開已經存檔的那一筆，
   走的是同一支——⛔ 不要為了「重開」再寫一份，兩份一定會長歪。 */
function briefShow(r){
  BRIEF = r;
  $('briefIdle').style.display = 'none';
  $('briefLive').style.display = '';
  $('qr').innerHTML = '';
  try{
    new QRCode($('qr'), { text: r.url, width: 230, height: 230,
                          correctLevel: QRCode.CorrectLevel.M });
  }catch(e){
    $('qr').innerHTML = '<p class="hint">QR 產生失敗，請改用下面的網址</p>';
  }
  $('qrUrl').textContent = r.url;
  briefDeadline(r);
  briefShare(r);
  briefNeedContent();
  pollBrief();
  if(BRIEF_TIMER) clearInterval(BRIEF_TIMER);
  BRIEF_TIMER = setInterval(pollBrief, 8000);
}

/* 內容還沒填的話，工人那一頁的「今天的內容」是空的——
   他們等於在簽一份沒有內容的表。
   ⛔ 這不是錯誤，是「還沒做完」，所以用提醒不用報錯；
      但一定要講出來，不然沒有人會發現（那一段在工人的手機上，不在他的）。 */
function briefNeedContent(){
  var el = $('briefNeed'); if(!el) return;
  var c = briefContent_();
  var has = c && (c.big || c.sub || (c.did||[]).length || c.dnote ||
                  (c.res||[]).length || c.rnote);
  el.style.display = has ? 'none' : '';
  el.textContent = has ? '' :
    '下面的「宣導內容」還沒填——工人簽名前看到的那一段現在是空的。填了會自動同步過去。';
}

/* 把簽到連結傳到工廠的 LINE 群組。

   現場掃 QR 解決一半的人；另一半是「在產線上」「手機沒電」「請假」，
   要等晚一點才簽。QR 拍照傳群組會糊，直接給連結最可靠。

   ⚠ 訊息要中英並陳。收到的人有一半看不懂中文，
     只寫中文等於只有翻譯自己看得懂。
   ⚠ 連結單獨一行。夾在句子裡 LINE 常常把後面的標點一起吃進網址。 */
function briefShare(r){
  var box = $('briefShare'); if(!box || !r.url) return;
  if(r.open === false){ box.innerHTML = ''; return; }
  var who = (clientVal() || '').trim();
  var txt = '【宣導簽到 · Sign in】\n' +
    (who ? who + '　' : '') + ($('date').value || '') + '\n' +
    '請點下面的連結，選語言後簽名。\n' +
    'Please tap the link, choose your language and sign.\n' +
    r.url;
  box.innerHTML =
    '<a class="line" target="_blank" rel="noopener" href="https://line.me/R/msg/text/?' +
      encodeURIComponent(txt) + '">傳到 LINE</a>' +
    '<button type="button" id="briefCopy">複製連結</button>';
  /* ⛔ 不要用 window.open——這一頁跑在 Apps Script 的巢狀 iframe 裡，
     window.open 會被擋掉，<a target="_blank"> 才過得去。 */
  var cp = $('briefCopy');
  if(cp) cp.addEventListener('click', function(){
    /* navigator.clipboard 在 iframe 裡常常沒有權限，失敗就退回選取文字，
       讓他自己長按複製——比按了沒反應好。 */
    var done = function(){ cp.textContent = '已複製';
      setTimeout(function(){ cp.textContent = '複製連結'; }, 1600); };
    try {
      navigator.clipboard.writeText(r.url).then(done, function(){ selUrl(); });
    } catch(e){ selUrl(); }
  });
  function selUrl(){
    try {
      var rg = document.createRange(); rg.selectNodeContents($('qrUrl'));
      var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(rg);
      toast('已選起來，長按複製');
    } catch(e2){ toast('請長按上面的網址複製', true); }
  }
}

/* 補簽期限一定要寫在畫面上。
   ⚠ 不寫的話，過期那天他只會看到「這個連結無效」，
     而現場的人已經站在那裡等著簽了。 */
function briefDeadline(r){
  var el = $('briefDue'); if(!el) return;
  if(r.open === false){
    el.textContent = r.why || '這場的簽到已經結束';
    el.className = 'bdue off';
  } else if(r.lastDay){
    el.textContent = '沒簽到的人可以補簽到 ' + r.lastDay + '（存檔之後這個 QR 還是有效）';
    el.className = 'bdue';
  } else {
    el.textContent = ''; el.className = 'bdue';
  }
}

/* 宣導模式只有一張卡（標題被改成「宣導內容」），工人頁要看的就是它。
   ⛔ 不要把整包 collectWorkers() 送上去——裡面有費用、備註、DOM 節點，
      那些不該出現在工人看得到的頁面上。 */
function briefContent_(){
  var c = $('workers').children[0];
  if(!c) return null;
  var g = function(k){ var el = c.querySelector('[data-k='+k+']');
                       return el ? el.value.trim() : ''; };
  var pick = function(sel){
    return [].map.call(c.querySelectorAll(sel+' input:checked'),
                       function(i){ return i.value; });
  };
  return { big: g('big'), sub: g('sub'), did: pick('[data-do]'),
           dnote: g('dnote'), res: pick('[data-res]'), rnote: g('rnote') };
}

function pollBrief(){
  if(!BRIEF) return;
  google.script.run
    .withSuccessHandler(function(p){
      var roster = p.roster || [];
      var byName = {};
      p.rows.forEach(function(x){ byName[x.name] = x; });
      var total = roster.length;
      // 名單外的人（臨時來的、或名字自己打的）另外列一組，不要混進名單裡
      var extra = p.rows.filter(function(x){ return roster.indexOf(x.name) === -1; });

      $('briefCount').textContent = p.count;
      $('briefTotal').textContent = total ? ('／' + total + ' 人應到') : ' 人已簽到';
      $('briefBar').style.width = total
        ? Math.min(100, Math.round(p.count / total * 100)) + '%'
        : (p.count ? '100%' : '0%');
      var signedInList = p.count - extra.length;
      $('rosterLabel').textContent = total
        ? ('應到名單　' + Math.max(0, total - signedInList) + ' 人未簽')
        : '已簽到名單';

      function item(name, hit){
        return '<div class="it'+(hit?' on':'')+'">'+
          '<span class="mk">✓</span><span class="nm">'+esc(name)+'</span>'+
          (hit ? '<span class="tm">'+esc((hit.at||'').slice(-5))+'</span>' : '')+'</div>';
      }
      var html = roster.map(function(n){ return item(n, byName[n]); }).join('');
      if(extra.length){
        html += '<div class="grp">名單外</div>' +
                extra.map(function(x){ return item(x.name, x); }).join('');
      }
      $('briefList').innerHTML = html || '<div class="none">還沒有人簽到</div>';
      briefDeadline(p);
      briefNeedContent();
      if(p.open === false){ var sb2 = $('briefShare'); if(sb2) sb2.innerHTML = ''; }
      /* 已經結束就別再每 8 秒問一次 */
      if(p.open === false && BRIEF_TIMER){ clearInterval(BRIEF_TIMER); BRIEF_TIMER = null; }
    })
    .withFailureHandler(function(){})
    /* ⚠ 把畫面上的宣導內容一起送上去。實務上他常常先按「開始簽到」
       讓大家邊聽邊簽，服務項目與處理經過是後來才填的——
       只在建立場次時存一次的話，工人頁永遠是空白。
       後端內容沒變就不寫，不會一直改試算表。 */
    .briefingProgress(CODE, BRIEF.token, briefContent_());
}
$('briefRefresh').addEventListener('click', pollBrief);
$('rosterToggle').addEventListener('click', function(){
  var open = $('briefList').style.display === 'none';
  $('briefList').style.display = open ? '' : 'none';
  this.classList.toggle('open', open);
});

$('briefClose').addEventListener('click', function(){
  if(!BRIEF) return;
  google.script.run
    .withSuccessHandler(function(){
      if(BRIEF_TIMER){ clearInterval(BRIEF_TIMER); BRIEF_TIMER = null; }
      briefDeadline({ open: false, why: '這場的簽到已經結束，QR 失效' });
      var sb = $('briefShare'); if(sb) sb.innerHTML = '';
      toast('簽到已結束，QR 失效');
    })
    .withFailureHandler(function(e){ toast(e.message, true); })
    .closeBriefing(CODE, BRIEF.token);
});

/* 紙本備援：工廠訊號差時傳著簽紙本，拍照上傳附進紀錄。
   照片先在手機上縮到 1600px、轉 JPEG，不然原始檔太大送不上去。 */
$('briefPaper').addEventListener('click', function(){ $('paperFile').click(); });
$('paperFile').addEventListener('change', function(){
  var f = this.files && this.files[0];
  this.value = '';
  if(!f || !BRIEF) return;
  toast('照片處理中…');
  var rd = new FileReader();
  rd.onload = function(){
    var im = new Image();
    im.onload = function(){
      var k = Math.min(1, 1600 / Math.max(im.width, im.height));
      var cv = document.createElement('canvas');
      cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
      cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
      var url = cv.toDataURL('image/jpeg', 0.78);
      google.script.run
        .withSuccessHandler(function(){ toast('紙本簽到表已上傳，會印在 PDF 最後一頁'); })
        .withFailureHandler(function(e){ toast(e.message, true); })
        .uploadBriefPaper(CODE, BRIEF.token, url);
    };
    im.onerror = function(){ toast('讀不到這張照片', true); };
    im.src = rd.result;
  };
  rd.readAsDataURL(f);
});

/* ── 分頁 ─────────────────────────────── *//* ── 分頁 ─────────────────────────────── */
/* ⛔ 以前是載入時對每一顆按鈕各綁一次，所以**後來注入的分頁按不動**。
   行政的「總表」是注入的（寫進 Service.html 就要重新部署、吃版本額度），
   改成委派之後，以後再加分頁都不用動這裡。 */
document.querySelector('.tabs').addEventListener('click', function(ev){
  var b = ev.target.closest('button[data-t]');
  if(b){
    document.querySelectorAll('.tabs button').forEach(function(x){ x.className = x===b?'on':''; });
    document.querySelectorAll('.pane').forEach(function(p){ p.classList.remove('on'); });
    $('p-'+b.dataset.t).classList.add('on');
    hideBack();          // 自己按分頁進來的不是「從某一筆點進來」，沒有回去可言
    backToTop();
    if(b.dataset.t==='cal') loadCal();
    if(b.dataset.t==='track') loadTrack();
    if(b.dataset.t==='follow') loadFollow();
    if(b.dataset.t==='stat') loadStat();
    // 派工（行政與特助）。資料跟行事曆同一份 CAL_ROWS，不另外去拿。
    if(b.dataset.t==='order') loadOrder();
    if(b.dataset.t==='mine')  loadMine();
    if(b.dataset.t==='conf')  loadConf();
    if(b.dataset.t==='sum')   loadSum();
    if(b.dataset.t==='ps1')   loadPS('ps1');
    if(b.dataset.t==='ps2')   loadPS('ps2');
    if(b.dataset.t==='ps3')   loadRT();
    /* 離開填寫頁＝手上的事告一段落，這時候更新不會弄丟東西。 */
    tryUpdate();
  }
});

/* ── 行事曆 ────────────────────────────────────────
   行程與服務紀錄是同一件事的兩個階段：
   排 → 點「開始填寫」把資料帶進填寫頁 → 存檔後行程自動變已完成。
   臨時直接跑的，存檔時後端會自動補一筆已完成的進來。 */
var CAL_YM = '';                 // 目前顯示的月份 yyyy-MM
var CAL_ROWS = [];
var CAL_SEL = '';                // 選到的日期
var CAL_LG = [];                 // 語別過濾（空 = 全部）
// 翻譯人員一打開先只看自己的。主管沒有自己的行程，維持看全部。
var CAL_MINE = false;            // 只看我的
var CAL_ST = '';                 // 狀態過濾（'' = 全部）
/* 廠商過濾（行政用）。'' = 全部。
   ⛔ 名單只列**目前這個月真的有排的**，而且帶數量——
      309 家全部列出來等於沒有篩選（牟佑彬 2026-10-03）。 */
var CAL_CLI = '';
/* ⛔ 2026-09-22 設計檢視第 6 項：預設從「月」改成「日」。
   翻譯早上打開 App 只問一句：**今天要去哪**。
   月曆回答的是「這個月哪幾天有事」——那是排程的問題，不是出門前的問題。
   量到的：首屏 168px 篩選 ＋ 825px 全空的月曆，
   而「今天要跑哪幾家」在摺線下面看不到。
   ⚠ 月與週沒有拿掉，在切換器上，要排程的時候切過去。 */
var CAL_VIEW = 'day';            // month | week | day
var SCHED_ID = '';               // 這次填寫是從哪一筆行程來的

/* 頂欄與分頁列的高度會隨字級與裝置變，量出來再設，不要寫死 */
function fixStick(){
  var top = document.querySelector('.top');
  var tabs = document.querySelector('.tabs');
  var bottom = document.body.classList.contains('tabsbottom');
  var h = (top ? top.offsetHeight : 47) +
          (bottom ? 0 : (tabs ? tabs.offsetHeight : 45));
  document.documentElement.style.setProperty('--stick', h + 'px');
  // 釘住的東西是一層疊一層的，每一層的高度都要量出來，
  // 下一層才知道自己該停在哪裡。寫死的話換手機或改字級就會錯位。
  var st = document.documentElement.style;
  var cs = document.querySelector('.calsticky');
  st.setProperty('--calh', (cs ? cs.offsetHeight : 0) + 'px');
  /* 追蹤頁那條（頁籤列）的高度。分段標題要釘在它下面。
     ⚠ 一定要指名 #p-track——querySelector('.calsticky') 會先撈到行事曆那條。 */
  var tk = document.querySelector('#p-track .calsticky');
  st.setProperty('--tkh', (tk ? tk.offsetHeight : 0) + 'px');
  var dh = document.querySelector('.daylist h4');
  st.setProperty('--dayh', (dh ? dh.offsetHeight : 0) + 'px');
  var rv = document.querySelector('#p-follow .evsticky');
  st.setProperty('--revh', (rv ? rv.offsetHeight : 0) + 'px');
}

/* 往下滑收起頂欄與分頁列、往上滑放回來；滑深了右下角出現回頂端。
   門檻 6px 是避免手指小抖動就一直閃；140px 是讓最上面那一段
   還沒真的開始看的時候不要動。 */
var SC_Y = 0, SC_HID = false;
function onScroll(){
  var y = window.scrollY || document.documentElement.scrollTop || 0;
  var d = y - SC_Y;
  if(Math.abs(d) >= 6){
    if(d > 0 && y > 140 && !SC_HID){
      document.body.classList.add('hidechrome'); SC_HID = true;
    } else if(d < 0 && SC_HID){
      document.body.classList.remove('hidechrome'); SC_HID = false;
    }
    SC_Y = y;
  }
  var t = $('toTop');
  if(t) t.className = (y > 420) ? 'on' : '';
}
window.addEventListener('scroll', onScroll, { passive: true });


/* ── 下拉更新 ───────────────────────────────────────
   ⛔ 下拉＝只換這一頁的資料，不重載程式。
      （程式更新是另一件事，自己會做，見上面 tryUpdate。）

   ⛔ 一定要等資料真的回來才收起轉圈。用固定秒數假裝完成是騙人：
      訊號差的時候三秒還沒回來，轉圈收掉了，畫面上還是舊的，
      他會以為「更新過了，資料就是這樣」。 */
var PTR = { on:false, y0:0, d:0, armed:false, busy:false };
var PTR_CB = null;

/* 內容畫出來了。四支 draw* 的開頭都會叫這一支。 */
function refreshed(){
  var f = PTR_CB; PTR_CB = null;
  if(f) f();
}

function ptrRefresh(done){
  PTR_CB = done;
  /* 超時的保險：十秒還沒畫出來就收回去並講實話。
     ⚠ 沒有這一條的話，某條失敗路徑沒叫到 refreshed()，轉圈會一直轉。 */
  var t = setTimeout(function(){
    if(PTR_CB){ PTR_CB = null; toast('更新失敗，請再試一次', true); done(); }
  }, 10000);
  var wrapped = PTR_CB;
  PTR_CB = function(){ clearTimeout(t); wrapped(); };

  var on = document.querySelector('.tabs button.on');
  var k = on ? on.dataset.t : 'cal';
  if(k === 'cal')         loadCal(null, true);
  else if(k === 'track')  { delete TK_CACHE[TK_CUR]; loadTrack(true); }
  else if(k === 'follow') loadFollow(true);
  else if(k === 'stat'){ EV = null; loadStat(); }
  else refreshed();       // 填寫頁沒有「內容」可以更新
}
var PTR_TRIG = 64;          // 拉過這個距離才算數

function ptrPane(){ return document.querySelector('.pane.on'); }

function ptrBlocked(){
  // 有視窗開著、或正在簽名的時候不要攔
  if(PTR.busy) return true;
  var masks = document.querySelectorAll('.smask, .rvfull, #pvModal');
  for(var i=0;i<masks.length;i++){
    if(masks[i].style.display !== 'none' && masks[i].offsetParent !== null) return true;
  }
  return false;
}

function ptrSet(d){
  var p = $('ptr'), pane = ptrPane();
  PTR.armed = d >= PTR_TRIG;
  p.style.opacity = Math.min(1, d / 40);
  p.style.transform = 'translate(-50%,' + (d - 52) + 'px)';
  p.className = PTR.armed ? 'go' : '';
  p.querySelector('em').textContent = PTR.armed ? '放開更新' : '下拉更新';
  if(pane) pane.style.transform = 'translateY(' + (d * 0.5) + 'px)';
}

function ptrReset(animate){
  var p = $('ptr'), pane = ptrPane();
  if(animate){
    p.style.transition = 'transform .3s cubic-bezier(.32,.72,0,1),opacity .25s ease';
    if(pane) pane.style.transition = 'transform .3s cubic-bezier(.32,.72,0,1)';
    setTimeout(function(){
      p.style.transition = ''; if(pane) pane.style.transition = '';
    }, 320);
  }
  p.style.opacity = '0';
  p.style.transform = 'translate(-50%,-60px)';
  p.className = '';
  if(pane) pane.style.transform = '';
  PTR.on = false; PTR.d = 0; PTR.armed = false;
}

document.addEventListener('touchstart', function(e){
  if(ptrBlocked() || e.touches.length !== 1) return;
  if((window.scrollY || document.documentElement.scrollTop || 0) > 0) return;
  PTR.on = true; PTR.y0 = e.touches[0].clientY; PTR.d = 0;
}, { passive: true });

document.addEventListener('touchmove', function(e){
  if(!PTR.on || ptrBlocked()) return;
  var raw = e.touches[0].clientY - PTR.y0;
  if(raw <= 0){
    if(PTR.d){ ptrReset(false); }
    PTR.on = false;
    return;
  }
  // 橡皮筋：拉越多動越少
  var h = window.innerHeight || 700;
  PTR.d = (raw * h * 0.55) / (h + 0.55 * raw);
  e.preventDefault();
  ptrSet(PTR.d);
}, { passive: false });

document.addEventListener('touchend', function(){
  if(!PTR.on) return;
  if(PTR.armed){
    PTR.busy = true;
    var p = $('ptr');
    p.className = 'spin';
    p.style.transform = 'translate(-50%,18px)';
    p.querySelector('em').textContent = '更新中…';
    var pane = ptrPane();
    if(pane){
      pane.style.transition = 'transform .3s cubic-bezier(.32,.72,0,1)';
      pane.style.transform = 'translateY(28px)';
    }
    ptrRefresh(function(){
      PTR.busy = false;
      ptrReset(true);
      /* 資料換完了，這時候順便看看程式有沒有新版。
         ⚠ 順序不能反：先更新資料、再考慮重載程式。
           反過來的話他下拉一次就被整個重載，又回到原本那個問題。 */
      checkBuild(true);
    });
  } else {
    ptrReset(true);
  }
  PTR.on = false;
}, { passive: true });

function backToTop(){
  document.body.classList.remove('hidechrome'); SC_HID = false; SC_Y = 0;
  var smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
}
$('toTop').addEventListener('click', backToTop);
window.addEventListener('resize', fixStick);
window.addEventListener('orientationchange', fixStick);

function ymOf(d){ return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2); }
function dsOf(d){ return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+
  '-'+('0'+d.getDate()).slice(-2); }
function weekStart(ds){
  var d = new Date(ds+'T00:00:00');
  d.setDate(d.getDate() - d.getDay());
  return d;
}
/* 週檢視可能跨月，要把兩個月的資料都抓回來合併 */
function monthsNeeded(){
  if(CAL_VIEW === 'month') return [CAL_YM];
  var a = weekStart(CAL_SEL), b = new Date(a); b.setDate(a.getDate()+6);
  if(CAL_VIEW === 'day') return [CAL_SEL.slice(0,7)];
  var m1 = ymOf(a), m2 = ymOf(b);
  return m1 === m2 ? [m1] : [m1, m2];
}
function todayStr(){ var d=new Date();
  return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }

/* bootstrap 已經把這個月的行程帶回來了，直接畫，不用再打一次後端 */
function drawSched(r){
  CAL_CACHE[r.ym] = r.rows || [];
  CAL_CACHE_AT[r.ym] = Date.now();
  CAL_ROWS = r.rows || [];
  if(!CREW.length) CREW = r.crew || [];
  if(!CAL_SEL) CAL_SEL = todayStr();
  drawCal();
}

/* 抓過的月份存起來。
   月／週／日切來切去看的其實是同一個月的資料，以前每切一次就重抓一次，
   在工廠用 4G 每次都要等一下。存下來之後切換是瞬間的。
   存檔、改期、取消、送審之後會清掉（calBust），所以不會看到舊的。 */
var CAL_CACHE = {};        // yyyy-MM -> rows
var CAL_CACHE_AT = {};     // yyyy-MM -> 幾點抓的
var CAL_TTL = 3 * 60 * 1000;

function calBust(ym){
  if(ym){ delete CAL_CACHE[ym]; delete CAL_CACHE_AT[ym]; }
  else { CAL_CACHE = {}; CAL_CACHE_AT = {}; }
}

function calMerge(months){
  var seen = {}, out = [];
  months.forEach(function(m){
    (CAL_CACHE[m] || []).forEach(function(x){
      // 同一筆可能被兩個月各抓一次，去掉重複
      if(seen[x.id]) return; seen[x.id] = 1; out.push(x);
    });
  });
  CAL_ROWS = out;
}

function loadCal(ym, force){
  if(ym) CAL_YM = ym;
  if(!CAL_YM) CAL_YM = ymOf(new Date());
  if(!CAL_SEL) CAL_SEL = todayStr();

  var months = monthsNeeded();
  var now = Date.now();
  var need = months.filter(function(m){
    return force || !CAL_CACHE[m] || (now - (CAL_CACHE_AT[m] || 0)) > CAL_TTL;
  });

  if(!need.length){ calMerge(months); drawCal(); return; }

  // 手上已經有一部分就先畫出來，不要整片變成「載入中」
  if(months.some(function(m){ return CAL_CACHE[m]; })){ calMerge(months); drawCal(); }
  else $('calGrid').innerHTML = '<div class="mid" style="grid-column:1/-1">載入中…</div>';

  var left = need.length;
  need.forEach(function(m){
    google.script.run
      .withSuccessHandler(function(r){
        CAL_CACHE[m] = r.rows || [];
        CAL_CACHE_AT[m] = Date.now();
        if(!CREW.length) CREW = r.crew || [];
        if(r.leave) LEAVE_ = r.leave;      // 誰哪天不在
        /* ⛔ 只有最後一個月份也回來了才算更新完成。
           上面那段會先拿舊快取畫一次（不要整片變成載入中），
           如果把 refreshed() 放在 drawCal 裡面，下拉的轉圈會在
           新資料回來之前就收掉——畫面還是舊的，但他以為更新過了。 */
        if(--left === 0){ calMerge(months); drawCal(); refreshed(); }
      })
      .withFailureHandler(function(e){
        if(--left === 0){ calMerge(months); drawCal(); refreshed(); }
        toast(e.message, true);
      })
      .listSchedule(CODE, m);
  });
}


/* 一趟行程從排到歸檔會經過好幾個狀態，
   在行事曆上直接分類，才不用切到審閱頁一筆一筆找誰還沒送審。 */
function stKey(r){
  if(r.status !== '已完成' || !r.recCode) return 'plan';
  var v = r.rv || '未送審';
  if(v === '未送審') return 'nosub';
  if(v === '退回補正') return 'back';
  if(v === '已歸檔') return 'pass';
  return 'ing';
}
// 顏色跟行事曆卡片上的狀態標籤同一套，篩選與卡片才對得起來
/* 行政要的三個（牟佑彬 2026-10-03）。
   ⛔ 審核那五個（待送審／審核中／已退回／審核通過）是**翻譯與副理**在看的，
      行政不送審也不審核，列出來只是雜訊。 */
var CAL_ST_ADM = [
  { k:'pre',  t:'預排',   c:'#96A0B2' },
  { k:'plan', t:'未完成', c:'#C99A3E' },
  { k:'done', t:'已完成', c:'#1E9E72' }
];
function stAdm(r){
  if (r.status === '已完成') return 'done';
  return r.crew ? 'plan' : 'pre';
}
function stDefs(){ return (STAFF_ROLE === '行政') ? CAL_ST_ADM : CAL_ST_DEF; }

var CAL_ST_DEF = [
  { k:'plan',  t:'未完成',   c:'#96A0B2' },
  { k:'nosub', t:'待送審',   c:'#C99A3E' },
  { k:'ing',   t:'審核中',   c:'#4A6FA5' },
  { k:'back',  t:'已退回',   c:'#9E3B52' },
  { k:'pass',  t:'審核通過', c:'#1E9E72' }
];

function visible(){
  return CAL_ROWS.filter(function(r){
    if(r.status === '取消') return false;
    /* ⚠ 行政看的是預排／未完成／已完成，不是審核那五個。
       這裡漏掉的話，按下「預排」會一筆都不剩——而且不會報錯。 */
    var stOf2 = (STAFF_ROLE === '行政') ? stAdm : stKey;
    if(CAL_ST && stOf2(r) !== CAL_ST) return false;
    if(CAL_CLI && r.client !== CAL_CLI) return false;
    /* ⛔ 灰色預排也算「我的」。
       行政排給我、特助還沒確認的那幾筆，**我要看得到**
       （牟佑彬 2026-09-27：讓翻譯提早知道未來會有這樣的行程）。
       ⚠ 只有「建議給我」才算——別人的預排不要塞進我的清單。 */
    if(CAL_MINE && r.crew !== (STAFF_NAME||'') &&
       !(!r.crew && r.sug && r.sug === (STAFF_NAME||''))) return false;
    if(CAL_LG.length){
      var ls = (r.lang||'').split('、').filter(String);
      if(!ls.some(function(l){ return CAL_LG.indexOf(l) !== -1; })) return false;
    }
    return true;
  });
}

/* 上排＝狀態，下排＝語別與人員。兩排都不換行，各自橫向捲。
   狀態一律五個都列出來（就算是 0），位置固定，手指才有肌肉記憶。
   ⛔ 不要改成「數量為零就不畫」——位置會跳，肌肉記憶就沒了。

   ⚠ 2026-09-22 改成：**日檢視預設收起來**。
      篩選是「找東西」的行為，屬於搜尋；「今天要去哪」不需要它。
      月／週檢視是用來掃描與排程的，那時候篩選才有意義，維持攤開。 */
var CAL_FILT_OPEN_ = false;
function calFiltShow_(){
  /* ⛔ CAL_MINE 不算「他在篩選」——翻譯一登入它就是開的，是預設值。
     把預設值當成篩選條件的話，這一排永遠不會收起來。 */
  return CAL_VIEW !== 'day' || CAL_FILT_OPEN_ || !!(CAL_ST || CAL_LG.length);
}
function drawFilters(langs){
  var live = CAL_ROWS.filter(function(r){ return r.status !== '取消'; });
  var chip = function(on, data, mark, txt, n){
    return '<button type="button" '+data+' class="'+(on?'on':'')+'">'+
      mark+esc(txt)+'<b>'+n+'</b></button>';
  };

  var stOf = (STAFF_ROLE === '行政') ? stAdm : stKey;
  $('calSt').innerHTML =
    chip(!CAL_ST, 'data-st=""', '', '全部', live.length) +
    stDefs().map(function(d){
      var n = live.filter(function(r){ return stOf(r) === d.k; }).length;
      return chip(CAL_ST===d.k, 'data-st="'+d.k+'"',
        '<i class="sq" style="background:'+d.c+'"></i>', d.t, n);
    }).join('');

  var on = CAL_LG.length || CAL_MINE;
  $('calLangs').innerHTML =
    // 最常按的擺最前面，不用先往右滑
    '<button type="button" id="calMine" class="'+(CAL_MINE?'on':'')+'">只看我的</button>' +
    chip(!CAL_LG.length, 'data-lg=""', '', '全部語別',
         CAL_ROWS.filter(function(r){ return r.status !== '取消'; }).length) +
    langs.map(function(l){
      var n = CAL_ROWS.filter(function(r){ return (r.lang||'').indexOf(l)!==-1; }).length;
      return chip(CAL_LG.indexOf(l)!==-1, 'data-lg="'+esc(l)+'"',
        '<i class="dot lg-'+esc(l)+'"></i>', l, n);
    }).join('') +
    (on ? '<button type="button" class="clr" id="calClr">取消全選</button>' : '');

  drawCalCli(live);

  /* 收起來的時候：兩排都不畫，改成一顆「篩選」。
     ⚠ 有在篩的時候一定攤開——不然他會忘記自己開著篩選，
       然後以為今天真的沒有行程。 */
  /* ⛔ 一定要限定在行事曆那一頁裡面找。.calfw 追蹤頁也有一個
     （包著 #tkFilt），用 document.querySelectorAll 會把追蹤的篩選
     一起收掉——2026-09-22 就這樣把追蹤頁的篩選弄不見了一次。 */
  var wraps = $('p-cal').querySelectorAll('.calfw');
  var show = calFiltShow_();
  [].forEach.call(wraps, function(w){ w.style.display = show ? '' : 'none'; });
  var fb = $('calFiltBtn');
  if(!show){
    if(!fb){
      fb = document.createElement('button');
      fb.type = 'button'; fb.id = 'calFiltBtn'; fb.className = 'calfb';
      wraps[0].parentNode.insertBefore(fb, wraps[0]);
    }
    fb.textContent = '篩選';
    fb.style.display = '';
    fb.onclick = function(){ CAL_FILT_OPEN_ = true; drawCal(); };
  } else if(fb){ fb.style.display = 'none'; }

  [].forEach.call($('calSt').querySelectorAll('button'), function(b){
    b.addEventListener('click', function(){
      CAL_ST = (CAL_ST === b.dataset.st) ? '' : b.dataset.st; drawCal(); });
  });
  [].forEach.call($('calLangs').querySelectorAll('button[data-lg]'), function(b){
    b.addEventListener('click', function(){
      var l = b.dataset.lg;
      if(!l) CAL_LG = [];
      else {
        var i = CAL_LG.indexOf(l);
        if(i === -1) CAL_LG.push(l); else CAL_LG.splice(i, 1);
      }
      drawCal();
    });
  });
  $('calMine').addEventListener('click', function(){ CAL_MINE=!CAL_MINE; drawCal(); });
  var c = $('calClr');
  if(c) c.addEventListener('click', function(){ CAL_LG=[]; CAL_MINE=false; drawCal(); });
}

/* 交代清單的圖示。
   ⛔ 不用繪文字（📌）：顏色、粗細、圓角全都不歸我們管，每支手機還長得不一樣，
      而且它本身是尖的，跟整張卡的圓角打架（牟佑彬 2026-10-04）。
   ⚠ 24 格、線寬 1.75、圓頭圓角——跟底下那排分頁圖示同一套畫法。
      外框圓角 4.6/24 ≈ 卡片 12px 圓角縮到 13px 的比例。 */
var TODO_IC_ = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
  ' stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="3.7" y="3.7" width="16.6" height="16.6" rx="4.6"/>' +
  '<path d="M8.1 9.4h7.8M8.1 14.6h5"/></svg>';

/* 右下角那顆。只有圖示與「做完幾件／共幾件」（牟佑彬 2026-10-04 選的「丁」）。 */
function todoPill_(r){
  var t = r.todo || [];
  if(!t.length) return '';
  var done = t.filter(function(x){ return x.d; }).length;
  return '<span class="c4todo'+(done === t.length ? ' ok' : '')+'" data-tdg="1"'+
    ' aria-label="交代事項 '+done+' / '+t.length+'">'+
    TODO_IC_+'<span class="nm">'+done+' / '+t.length+'</span><i class="ar">⌄</i></span>';
}
function todoList_(r){
  var t = r.todo || [];
  if(!t.length) return '';
  return '<span class="c4tdl"><span class="c4tdin"><span>'+t.map(function(x){
    return '<b'+(x.d?' class="done"':'')+'><u>'+(x.d?'✓':'□')+'</u>'+
      esc(x.t||x||'')+'</b>';
  }).join('')+'</span></span></span>';
}
/* 卡片的最後一列：左邊原本就有的東西，右邊掛交代。
   ⛔ 以前交代是卡片最底下一條**整寬**的把手，每張卡都因此長高一截，
      一天五筆就多出一百多 px（牟佑彬 2026-10-04：「為了不讓區塊變太長」）。
      現在收著的時候**一行都不多**——它佔的是那一列本來就空著的右邊。
   ⚠ 沒有交代事項的話一個字都不動，維持原樣。 */
function todoRow_(inner, r){
  var p = todoPill_(r);
  if(!p) return inner;
  return '<span class="c4row">'+inner+p+'</span>'+todoList_(r);
}

/* ⚠ 一定要走捕獲階段。卡片外層 .swwrap 自己有一個 click（點了會開表單），
   冒泡階段攔不住它——點「交代」會變成點開整張卡。 */
document.addEventListener('click', function(e){
  var g = e.target.closest && e.target.closest('[data-tdg]');
  if(!g) return;
  e.stopPropagation(); e.preventDefault();
  var open = !g.classList.contains('open');
  g.classList.toggle('open', open);
  /* ⛔ 清單是 .c4row 的**下一個**兄弟，不是那顆膠囊的——
     膠囊在 .c4row 裡面。寫成 g.nextElementSibling 會抓到 null。
     ⚠ 行事曆的卡片外層是 .b，總表的列是 .sumrow，兩邊共用這一支。 */
  var box = g.closest('.b') || g.closest('.sumrow');
  var l = box && box.querySelector('.c4tdl');
  if(l) l.classList.toggle('on', open);
}, true);

function drawCal(){
  /* ⛔ 紅點與派工三頁掛在這裡，不掛在「CAL_ROWS = …」那一行。
     CAL_ROWS 有兩個賦值點（drawSched 直接給、mergeCache 合併後給），
     2026-09-28 只掛了後者 → 翻譯一進來走的是前者，**紅點永遠不亮**。
     drawCal 是兩條路都會經過的地方。 */
  try { paintOwed(); } catch(ePO){}
  try {
    var onTab = document.querySelector('.tabs button.on');
    var tt2 = onTab && onTab.dataset.t;
    if(tt2==='order') loadOrder();
    else if(tt2==='mine') loadMine();
    else if(tt2==='conf') loadConf();
  } catch(eDP){}

  var y = +CAL_YM.slice(0,4), m = +CAL_YM.slice(5,7);

  // 語別過濾：只列這個月實際有的語別，不要出現空選項
  var langs = [];
  CAL_ROWS.forEach(function(r){
    (r.lang||'').split('、').filter(String).forEach(function(l){
      if(langs.indexOf(l) === -1) langs.push(l); });
  });
  drawFilters(langs);

  var rows = visible();
  var byDay = {};
  rows.forEach(function(r){ (byDay[r.date] = byDay[r.date] || []).push(r); });

  var isMonth = CAL_VIEW === 'month';
  var isWeek  = CAL_VIEW === 'week';
  $('calDow').style.display   = isMonth ? '' : 'none';
  $('calGrid').style.display  = isMonth ? '' : 'none';
  $('calWeek').style.display  = isWeek  ? '' : 'none';

  if(isMonth){
    $('calMonth').textContent = y + ' 年 ' + m + ' 月';
    var first = new Date(y, m-1, 1);
    var start = new Date(first); start.setDate(1 - first.getDay());
    var html = '';
    // 一次畫一整週；整週都不在這個月就不要畫，月底才不會多出一排空格子
    for(var wk=0; wk<6; wk++){
      var week = '', has = false;
      for(var k=0;k<7;k++){
        var d = new Date(start); d.setDate(start.getDate()+wk*7+k);
        var ds = dsOf(d);
        var out = (d.getMonth()+1 !== m);
        if(!out) has = true;
        var list = byDay[ds] || [];
        week += '<div class="cell'+(out?' dim':'')+
          (ds===todayStr()?' today':'')+(ds===CAL_SEL?' sel':'')+'" data-d="'+ds+'">'+
          '<span class="d">'+d.getDate()+'</span><span class="dots">'+
          list.slice(0,6).map(function(r){
            var l = (r.lang||'').split('、')[0] || '';
            return '<i class="lg-'+esc(l)+(r.status==='預排'?' hollow':'')+'"></i>';
          }).join('')+'</span></div>';
      }
      if(!has) break;
      html += week;
    }
    $('calGrid').innerHTML = html;
    [].forEach.call($('calGrid').querySelectorAll('.cell'), function(c){
      c.addEventListener('click', function(){ CAL_SEL = c.dataset.d; drawCal(); });
    });
  }
  else if(isWeek){
    // 手機上七欄太窄，改成一天一列：橫向看得到那天有誰、直向看得到整週密度
    var ws = weekStart(CAL_SEL), we = new Date(ws); we.setDate(ws.getDate()+6);
    $('calMonth').textContent =
      (ws.getMonth()+1)+'/'+ws.getDate()+' – '+(we.getMonth()+1)+'/'+we.getDate();
    var wd = ['日','一','二','三','四','五','六'];
    var rows7 = '';
    for(var i=0;i<7;i++){
      var d2 = new Date(ws); d2.setDate(ws.getDate()+i);
      var ds2 = dsOf(d2);
      var list2 = (byDay[ds2] || []);
      rows7 += '<div class="r'+(ds2===CAL_SEL?' sel':'')+
        (ds2===todayStr()?' today':'')+'" data-d="'+ds2+'">'+
        '<span class="dd"><b>'+d2.getDate()+'</b><span>'+wd[d2.getDay()]+'</span></span>'+
        '<span class="es">'+
          (list2.length ? list2.map(function(r){
            var l = (r.lang||'').split('、')[0] || '';
            var what = r.topic || ((r.big&&r.sub) ? (r.big+' ／ '+r.sub) : '');
            return '<span class="e'+(r.status==='已完成'?' done':'')+'">'+
              '<i class="lg-'+esc(l)+(r.status==='預排'?' hollow':'')+'"></i>'+
              '<span class="x">'+
                '<span class="h">'+esc(r.client)+
                  '<b>'+esc(r.slot||'未定')+'　'+esc(r.crew)+'</b></span>'+
                (what?'<span class="p">'+esc(what)+'</span>':'')+
                (r.workers?'<span class="p">'+esc(r.workers)+'</span>':'')+
              '</span></span>';
          }).join('') : '<span class="none">—</span>')+
        '</span></div>';
    }
    $('calWeek').innerHTML = '<div class="wk">'+rows7+'</div>';
    [].forEach.call($('calWeek').querySelectorAll('.r'), function(c){
      c.addEventListener('click', function(){ CAL_SEL = c.dataset.d; drawCal(); });
    });
  }
  else {
    var dd = new Date(CAL_SEL+'T00:00:00');
    $('calMonth').textContent = (dd.getMonth()+1)+' 月 '+dd.getDate()+' 日（'+
      ['日','一','二','三','四','五','六'][dd.getDay()]+'）';
  }

  drawDay();
}

function drawDay(){
  var d = CAL_SEL;
  var wd = ['日','一','二','三','四','五','六'][new Date(d+'T00:00:00').getDay()];
  $('calDayTitle').textContent = (+d.slice(5,7))+' 月 '+(+d.slice(8,10))+' 日（'+wd+'）';
  var list = visible().filter(function(r){ return r.date === d; });
  /* 三組：已確認的待處理／灰色預排／已完成。
     ⛔ 灰色的不可以混進「待處理」——那會讓人照著去跑，而它還沒定。 */
  /* ⛔ 以前這裡還要求 `&& r.sug`（一定要有建議翻譯）。
     結果「預排、但還沒想好給誰」的那一筆**三組都不收，整筆消失**——
     而月曆上的點不看這個條件，所以會出現「有點、點進去卻說這天沒有行程」。
     2026-10-03 線上有 5 筆是這種狀態。
     ⚠ 這種「還沒配人」的才是最該被看到的：它是唯一一種沒有人在等它的行程。 */
  var pre  = list.filter(function(r){ return r.status === '預排' && !r.crew; });
  var plan = list.filter(function(r){ return r.status === '預排' && r.crew; });
  var done = list.filter(function(r){ return r.status === '已完成'; });
  $('calDayCount').textContent = list.length
    ? (plan.length ? ('待處理 '+plan.length+'　已完成 '+done.length) : ('已完成 '+done.length))
      + (pre.length ? ('　預排 '+pre.length) : '')
    : '沒有行程';

  /* ── 行程卡 ─────────────────────────────────────────
     版型是他從六輪 mockup 挑定的 F4③：

       服務細項（小字眉標）              ◷ 就醫 3/4   進度  狀態
       客戶名                                    [S260918-DV]
       移工名                                          [2 人]

     幾個刻意的決定，改之前先看懂：

     · **服務細項放最上面當眉標。** 翻譯在掃一天的行程時，
       先問的是「這趟要做什麼」，不是「這是哪一家」。
     · **大類不印。** 「費用收取與發放 ／ 收服務費」——大類講過的事
       細項又講一次，省一整段寬度。
     · **「待處理」字樣拿掉。** 上面的分組標題已經寫了「待處理 2」，
       而且「沒有進度條、沒有代碼」本身就是訊號。
     · **紀錄代碼做成小標籤貼在客戶名右邊。** 這樣它只在有代碼的時候
       佔位置，預排的卡片完全不受影響——而預排佔了一天裡的大半。
     · **卡片上沒有按鈕。** PDF 與送審改成長按出選單，
       整張卡的寬度都還給文字，長名字不再換行。
     · **每人細項不同時改成一人一列。** 合併寫成「收服務費 · 帶工人就醫」
       看不出誰做哪一件，而那正是翻譯要知道的事。 */
  function card(r){
    var l = (r.lang||'').split('、')[0] || '';
    var cls = r.status==='已完成' ? 'done' : (r.status==='取消' ? 'cancel' : 'plan');
    var plan = r.status === '預排';

    /* 由右往左推，一格一個動作。軌道藏在卡片右邊外面，跟著卡片一起走。
       data-go 留在外層，「從填寫頁返回」要靠它把這一張找回來。 */
    var wrapA = '<div class="swwrap"' +
      ' data-sid="'+esc(r.id||'')+'"' +
      (r.id ? ' data-go="'+esc(r.id)+'"' : '') +
      (r.recCode ? ' data-rc="'+esc(r.recCode)+'"' : '') +
      ' data-plan="'+(plan ? '1' : '')+'"' +
      (r.caseId ? ' data-case="'+esc(r.caseId)+'"' : '') +
      ' data-client="'+esc(r.client||'')+'"' +
      ' data-workers="'+esc(r.workers||'')+'"' +
      ' data-lang="'+esc(r.lang||'')+'"' +
      ' data-big="'+esc(r.big||'')+'" data-sub="'+esc(r.sub||'')+'">' +
      swRail(r);

    // 眉標右邊的追蹤標籤。有序號就寫「就醫 3/4」，沒有就只寫類型。
    var tk = r.caseId ? '<span class="c4tk">'+esc(caseTag_(r))+'</span>' : '';
    /* 追蹤案件自己排的行程要標出來。
       ⛔ 2026-09-19 他在行事曆看到一筆「拆線」完全不知道哪來的——
       系統做了事卻只寫在試算表的備註欄，畫面上看不到。 */
    if(r.auto) tk += '<span class="c4auto">自動排的</span>';
    /* ⛔ 下面客戶名旁邊那個服務對象標，條件是「開頭不是工廠」，
       而「工廠宣導（一對多）」開頭剛好就是工廠，所以它一直被藏起來。
       一對多另外給一個標，不要跟家庭雇主擠同一個位置。 */
    if(isManyRow_(r)) tk += '<span class="c4many">一對多</span>';


    return wrapA + '<div class="ev '+cls+'">'+
      '<span class="bar lg-'+esc(l)+'"></span>'+
      '<span class="b"'+(r.recCode?' data-rec="'+esc(r.recCode)+'"':'')+'>'+
        // 眉標：做什麼 ＋ 追蹤 ＋ 進度 ＋ 狀態
        '<span class="c4eye">'+
          '<span class="sv">'+esc(r.topic || r.sub || '—')+'</span>'+
          tk + (r.rv ? progDots(r.rv) : '') + rvWord(r.rv) +
        '</span>'+
        // 客戶名 ＋ 紀錄代碼
        '<span class="c4nm">'+
          '<span class="n">'+esc(r.client)+
            (r.target&&r.target.indexOf('工廠')!==0?'　'+esc(r.target):'')+'</span>'+
          (r.recCode?'<span class="c4code">'+esc(r.recCode)+'</span>':'')+
        '</span>'+
        // 移工名（自然截斷）＋ 人數標（永遠不縮）。一對多改成「全廠宣導」
        cardWkLine_(r)+
        // 時段與翻譯降到最後一行的小字。排一天的行程時還是要看得到。
        /* 時段與翻譯那一列的右邊掛交代，收著的時候卡片一行都不多。
           ⛔ 項目預設**不攤開**——一天五筆、每筆三四條，攤開要捲很久
              才看得到下一筆（2026-09-30 比過五種放法才定的）。 */
        todoRow_('<span class="c4who">'+esc(r.slot||'未定時段')+'　'+
          esc(r.crew)+'</span>', r)+
      '</span>'+
      '</div></div>';
  }


/* 灰色預排的卡片**刻意另外寫一個**，不重用上面那支。
     ⛔ 那一支帶著側滑軌道、長按拖曳改期、點開填服務紀錄——
        那些動作對「還沒確認的行程」全部都不該有。
        與其在 card() 裡到處加 if，不如給預排一張安靜的卡。
     ⚠ 這一段是十個人每天在用的畫面，能不動既有的就不動。 */
  function preCard(r){
    var l = (r.lang||'').split('、')[0] || '';
    /* 預排的卡以前**完全不能滑**——它是另外畫的一種卡，沒有軌道
       （牟佑彬 2026-10-03 指出）。包進 .swwrap 之後就跟其他卡同一套。
       ⛔ 但**不可以讓它拖曳改期**：下面 bindDrag 用的是 `.ev:not(.pre)`，
          那一條要留著。還沒確認的行程被拖來拖去，特助會對不上。 */
    /* ⛔ 「我那天不行」那顆按鈕拿掉了（牟佑彬 2026-10-04）。
       ⚠ 代價：翻譯在 App 裡**沒有地方可以說自己那天不行**了，請假要走別的管道。
         已經說過不行的那一筆還是會顯示（下面這一行），只是沒有入口可以按。 */
    var tail = r.decline
      ? '<span class="c4no">你說了：'+esc(String(r.decline).split('：').slice(1).join('：')
          || r.decline)+'</span>'
      : '';
    var whoTx = '<span class="c4who">'+esc(r.slot||'未定時段')+'　'+
      (r.sug ? ('建議 '+esc(r.sug)) : '<b class="non">還沒配人</b>')+'</span>';
    /* 行政沒有「我那天不行」，那一顆就落在時段那一列的右邊——一樣是右下角。 */
    var who = tail ? whoTx : todoRow_(whoTx, r);

    return '<div class="swwrap" data-sid="'+esc(r.id||'')+'"'+
      (r.id ? ' data-go="'+esc(r.id)+'"' : '')+
      ' data-plan="1" data-client="'+esc(r.client||'')+'"'+
      ' data-workers="'+esc(r.workers||'')+'" data-lang="'+esc(r.lang||'')+'"'+
      ' data-big="'+esc(r.big||'')+'" data-sub="'+esc(r.sub||'')+'">'+
      swRail(r)+
      '<div class="ev pre" data-pre="'+esc(r.id||'')+'">'+
      '<span class="bar lg-'+esc(l)+'"></span>'+
      '<span class="b">'+
        '<span class="c4eye"><span class="sv">'+esc(r.topic || r.sub || '—')+'</span>'+
        /* 掛了追蹤就要標出來（牟佑彬 2026-10-04）。
           ⛔ 預排的卡是另外畫的一張，所以 card() 裡那個標籤它沒有，
              他按了追蹤、畫面上什麼都沒變，只能回試算表才看得到。 */
        (r.caseId ? '<span class="c4tk">'+esc(caseTag_(r))+'</span>' : '')+
        (isManyRow_(r) ? '<span class="c4many">一對多</span>' : '')+
        '<span class="c4pre">預排・還沒確認</span></span>'+
        '<span class="c4nm"><span class="n">'+esc(r.client)+'</span></span>'+
        cardWkLine_(r)+
        /* ⛔ 這裡原本還接一句「XXX 排的，等特助確認」。
           但上面那條分組標題已經寫了「行政排好了，等特助確認——先不要去」，
           每張卡再寫一次是重複的，而且把真正要看的（時段、配了誰）擠到左邊
           （牟佑彬 2026-10-03 指出）。 */
        who+
        /* 行政交代的事，預排的卡以前整個沒有——而**預排正是行政剛交代完的時候**
           （牟佑彬 2026-10-04：「預排的交代事項在行程區塊要顯示」）。
           ⚠ 掛在**最後一列的右邊**，所以收著的時候卡片一行都不多。
             有「我那天不行」就跟它同一排，沒有就跟時段那一排。 */
        (tail ? todoRow_(tail, r) : '')+
      '</span></div></div>';
  }

  var html = '';
  /* 被換掉的通知。⛔ 他可能已經排好路線、甚至跟工廠約好了，
     所以一定要講一聲（牟佑彬 2026-09-27 指定）。 */
  var moved = CAL_ROWS.filter(function(r){
    return r.moved && String(r.moved).indexOf((STAFF_NAME||'') + ' →') === 0 &&
           r.date === CAL_SEL;
  });
  if(moved.length){
    html += moved.map(function(r){
      /* 兩種情況共用這張卡，但話要講對：
         換人 → 「不用你去了」
         行政改單 → 「被改過了，等特助重新確認」——**還是你的**，不要叫他別去。
         ⛔ 2026-10-03 之前只有前面那一句，行政一改日期，翻譯看到的是
            「不用你去了」，那是錯的。 */
      /* ⛔ 「被行政改過了」那一張拿掉（牟佑彬 2026-10-03）：
         「反正我也只是看，我也沒辦法去動。」行程本身還在行事曆上，
         那張卡只是多占一塊位置。
         ⚠ 代價他知道：行政把日期改到別天，他只會看到它換了位置，
           不會知道「有人動過」。他選擇這樣。
         換人那一張留著——那一筆是真的從他手上拿走了，不講他不會知道。 */
      if(/改單/.test(String(r.moved||''))) return '';
      return '<div class="c4moved">🔔'+
        ' <b>'+esc(r.client)+' '+esc(r.topic||'')+' 不用你去了</b>'+
        '<span>'+esc(r.moved)+'</span></div>';
    }).join('');
  }
  if(plan.length){
    html += '<div class="grp">待處理 <b>'+plan.length+'</b></div>' +
            plan.map(card).join('');
  }
  if(pre.length){
    html += '<div class="grp pre">預排 <b>'+pre.length+'</b>' +
            '<span class="gn">行政排好了，等特助確認——先不要去</span></div>' +
            pre.map(preCard).join('');
  }
  if(done.length){
    // 跑完的收在下面：一天結束時往下滑就是當天的成果
    html += '<div class="grp done">已完成 <b>'+done.length+'</b></div>' +
            done.map(card).join('');
  }
  $('calDayList').innerHTML = html || '<div class="mid" style="padding:24px">這天沒有行程</div>';
  fixStick();

  // 卡片本身可以長按拖曳改期（按鈕不受影響）
  /* 「我那天不行」——灰色預排專用。
     ⛔ 只能對「建議給自己、而且還沒確認」的講，後端也會再驗一次。
        已確認的要改得找特助，不然行程會在出發前自己消失。 */
  [].forEach.call($('calDayList').querySelectorAll('[data-nogo]'), function(b){
    b.onclick = function(ev){
      ev.stopPropagation();
      var why = prompt('那天為什麼不行？特助會看到。', '');
      if(why === null) return;
      b.disabled = true; b.textContent = '送出中…';
      google.script.run
        .withSuccessHandler(function(){
          toast('跟特助說了'); calBust(); loadCal();
        })
        .withFailureHandler(function(e){
          b.disabled = false; b.textContent = '我那天不行';
          toast(e.message, true);
        })
        .declineSchedule(CODE, b.dataset.nogo, why);
    };
  });

  var idx = 0;
  var all = plan.concat(done);
  /* ⚠ 預排卡也是 .ev，但它不可以拖曳改期——用 :not(.pre) 排除。
     不排除的話 all[idx] 會對錯人，拖到的是別張卡片。 */
  [].forEach.call($('calDayList').querySelectorAll('.ev:not(.pre)'), function(card){
    var r2 = all[idx++]; if(!r2) return;
    bindDrag(card, r2);
  });
  if(plan.length && CAL_VIEW !== 'day'){
    $('calDayList').insertAdjacentHTML('beforeend',
      '<p class="draghint">點一下開始填寫　·　長按有更多選項<br>'+
      '往左推：追蹤 → 改期 → 取消　·　長按之後拖動可以改期</p>');
  }

  /* ⛔ 這裡以前是 querySelectorAll('[data-rec]') 逐個綁 click，
     而 data-rec 在卡片「中間那塊文字」上——左邊的色條與四周的內距
     全都是死區，拇指落在邊上就沒反應。他回報的「點進去有時候沒反應」
     就是這個。現在交給 bindSwipe 的 click（綁在整張 .ev 上，
     而且手上有整筆 r），不要兩套。 */
  /* 每一張卡片：點一下（預排＝開始填寫、已完成＝看紀錄）、
     由右往左推出四段選單（有哪幾格看這張卡的狀態）。 */
  /* ⛔ 以前這裡是「第幾個 .swwrap 配 all[si++]」，而 all 只有
     plan.concat(done)——預排卡一旦也變成 .swwrap，順序就全部錯一位，
     **滑到的會是別人的那筆**，而且畫面上完全看不出來。
     改成用卡片自己身上的 data-sid 去找，順序怎麼變都不會配錯。
     （同一個坑上面 bindDrag 那段註解也記了一次。） */
  var byId = {};
  CAL_ROWS.forEach(function(r){ if(r.id) byId[r.id] = r; });
  [].forEach.call($('calDayList').querySelectorAll('.swwrap'), function(w){
    var r3 = byId[w.dataset.sid];
    if(r3) bindSwipe(w, r3);
  });
}

/* ── 左滑四段選單 ──────────────────────────────────────
   2026-09-19。原本是「往右滑＝追蹤、往左滑＝取消」兩顆按鈕，
   改成由右往左推的一條軌道，推愈遠換愈後面的動作，放開就執行。

   ⛔ 不要寫死四格。四個動作沒有一張卡片全部適用：
       預排　　　　　→ 追蹤 / 改期 / 取消
       已完成・未送審 → 送審 / 追蹤
       已完成・已送審 → 追蹤（送審的走審核流程，行程本身不能再動）
   排出按不動的格子比少幾格更糟，跟長按選單同一個原則。

   順序固定「送審 → 追蹤 → 改期 → 取消」：最常用的先碰到，
   會出事的（取消）推到最遠，而且要再確認一次。 */
var SW_STEP_ = 52;          // 一格多寬，跟 CSS 的 .swst 一致
var SW_ARM_  = 0.6;         // 露出六成就算數，不用推滿

function swStops(r){
  /* 行政看到的是別的三個（牟佑彬 2026-10-03）。
     ⛔ 沒有「催確認」——他說改成跟翻譯一樣做追蹤。
     ⛔ 已完成的只剩追蹤：那一筆連著一張服務紀錄，改不得也取消不得。 */
  if(STAFF_ROLE === '行政'){
    var done = (r.status === '已完成');
    var z = [];
    if(!done) z.push({ k:'edit', t:'改', i:'✎' });
    z.push({ k:'track', t: r.caseId ? '看追蹤' : '追蹤', i:'◷' });
    if(!done) z.push({ k:'del', t:'取消', i:'✕', bad:1 });
    return z;
  }
  var plan = r.status === '預排', rv = r.rv || '';
  var a = [];
  if(r.recCode && (rv === '未送審' || rv === '退回補正'))
    a.push({ k:'sub', t:'送審', i:'➤' });
  a.push({ k:'track', t: r.caseId ? '看追蹤' : '追蹤', i:'◷' });
  if(plan){
    a.push({ k:'date', t:'改期', i:'📅' });
    a.push({ k:'del',  t:'取消', i:'✕', bad:1 });
  }
  return a;
}
function swRail(r){
  return '<div class="swrail">' + swStops(r).map(function(x){
    return '<span class="swst'+(x.bad?' bad':'')+'">' +
      '<i>'+x.i+'</i><b>'+x.t+'</b></span>';
  }).join('') + '</div>';
}

/* ── 長按行程卡：選單 ──────────────────────────────────
   2026-09-19。卡片上的 PDF 與送審按鈕拿掉了，改成長按出選單。

   ⚠ 長按原本已經被「拖曳改期」佔用。用 iOS 桌面那套解決：
       長按不動放開 → 出選單
       長按之後移動 → 進入拖曳（只有預排的行程可以改期）
   兩個手勢共存，不用二選一。

   ⛔ 選單內容不是固定的一組。預排的沒有 PDF 也沒東西可以送審；
   送審後的不能改。放一堆按不了的灰按鈕比少幾個選項更糟——人會以為壞了。
   上鎖的狀況一定要講出原因與怎麼辦。 */

var CM_ = null;          // 目前選單對應的那一筆

function openCardMenu(r){
  if(!$('cardMenu')){ toast('要先更新 App', true); return; }
  CM_ = r;
  var plan = r.status === '預排';
  var rv = r.rv || '';
  var locked = rv === '待副理審' || rv === '待總經理核准' || rv === '已歸檔';
  var b = [];

  if(plan){
    b.push(['go',   '✎', '開始填寫']);
    b.push(['date', '📅', '改期']);
  } else {
    b.push(['pdf',  '📄', '輸出 PDF 給雇主']);
    if(rv === '未送審') b.push(['sub', '➤', '送給副理審閱']);
    if(rv === '退回補正') b.push(['edit', '✎', '改完重新送審']);
    if(rv === '未送審') b.push(['edit', '✎', '修改這一筆']);
  }
  // 追蹤：有就看、沒有就開。這一項每一種狀態都有。
  b.push(r.caseId ? ['seechain', '◷', '看追蹤', r.caseId]
                  : ['track',    '◷', r.recCode ? '加入追蹤' : '開一件追蹤']);
  if(r.recCode) b.push(['copy', '⧉', '複製紀錄代碼', r.recCode]);
  if(plan) b.push(['del', '✕', '取消這個行程', '', 1]);

  $('cmTitle').textContent = r.client || '';
  $('cmSub').textContent = (r.topic || r.sub || '') +
    (r.workers ? '　·　' + r.workers : '') +
    (r.recCode ? '　·　' + r.recCode : '');
  $('cmList').innerHTML = b.map(function(x){
    return '<button type="button" class="cmi'+(x[4]?' red':'')+'" data-a="'+x[0]+'">' +
      '<i>'+x[1]+'</i>'+esc(x[2]) +
      (x[3] ? '<em>'+esc(x[3])+'</em>' : '') + '</button>';
  }).join('');

  /* 上鎖要講原因與怎麼辦。只把按鈕拿掉，人會以為系統壞了。 */
  var why = '';
  if(rv === '待副理審' || rv === '待總經理核准') why = '送審之後就不能改了。真的要改，請副理退回。';
  else if(rv === '已歸檔') why = '已經歸檔了，內容不能再更動。';
  else if(rv === '退回補正') why = '副理退回了，改完要重新送審。';
  else if(!plan && !r.caseId) why = '這一筆還沒掛在任何追蹤底下。';
  $('cmWhy').textContent = why;
  $('cmWhy').style.display = why ? '' : 'none';

  $('cardMenu').style.display = '';
  [].forEach.call($('cmList').children, function(el){
    el.addEventListener('click', function(){ cardMenuDo(el.dataset.a); });
  });
}

function closeCardMenu(){ $('cardMenu').style.display = 'none'; }

function cardMenuDo(a){
  var r = CM_ || {};
  closeCardMenu();
  if(a === 'go')   { startFromSchedule(r.id); return; }
  if(a === 'date') { cardReschedule(r); return; }
  if(a === 'pdf')  {
    openPdfSheet(r.recCode, { client: r.client,
      cnt: r.workers ? String(r.workers).split('、').filter(Boolean).length : 0 });
    return;
  }
  if(a === 'sub')  { cardSubmit(r); return; }
  if(a === 'edit') { openRecord(r.recCode, { rec: r.recCode, y: window.scrollY,
      view: CAL_VIEW, ym: CAL_YM, sel: CAL_SEL,
      label: (($('calDayTitle')||{}).textContent||'').trim(), name: r.client }); return; }
  if(a === 'seechain'){ openChain(r.recCode || '', r.caseId); return; }
  if(a === 'track'){
    // 已經有服務紀錄的走「併進現有的一串」，沒有的走原本的開案流程
    if(r.recCode) openMergePick(r); else openPick(cardData(r));
    return;
  }
  if(a === 'copy') { copyText(r.recCode, '紀錄代碼'); return; }
  if(a === 'del')  { cardCancel(r); return; }
}

/* 選單要的欄位跟右滑那個面板一樣，湊成同一個形狀就好，不要兩套 */
/* 這一趟是不是「工廠宣導（一對多）」。
   ⛔ isBrief() 看的是表單上的 #target，行事曆的卡片沒有表單可看。
      卡片以前完全不管服務對象，所以改成一對多之後**畫面上一點變化都沒有**，
      還是印著一個移工的名字（牟佑彬 2026-10-04：「為什麼這邊還是一個人的名字？」）。 */
function isManyRow_(r){ return String(r.target || '').indexOf('宣導') !== -1; }

function wkCount_(r){
  return r.workers ? String(r.workers).split('、').filter(Boolean).length : 0;
}

/* 追蹤標的字。行事曆、派工台共用，不要各寫一份（牟佑彬 2026-10-04：
   「行程區塊的顯示要與翻譯那邊和特助那邊都要一致」）。 */
function caseTag_(r){
  if(!r.caseId) return '';
  return '◷ ' + (SHORT_[r.caseKind] || r.caseKind || '追蹤') +
    (r.caseN ? ' ' + r.caseN + '/' + r.caseTotal : '');
}

/* 卡片上那一行移工。一對多要講「這是整廠的場次」，不要只印一個人名。 */
function cardWkLine_(r){
  var n = wkCount_(r);
  /* ⚠ 一對多不要報人數。翻譯那邊的宣導紀錄從頭到尾不提個別的人
     （服務表上那一列就叫「宣導內容（一對多）」），
     卡片報「1 人應到」只會讓人以為這一趟只有一個人
     （牟佑彬 2026-10-04：「應到為什麼 1 人？」）。 */
  if(isManyRow_(r)) return '<span class="c4wk"><span class="c4ws">全廠宣導</span></span>';
  if(!n) return '';
  return '<span class="c4wk"><span class="c4ws">'+esc(r.workers)+'</span>'+
    (n>1?'<span class="c4cnt">'+n+' 人</span>':'')+'</span>';
}

function cardData(r){
  /* ⚠ date 一定要帶。不帶的話後端用「今天」當開案日——
     他 2026-10-04 在 10/7 的行程上按追蹤，開案日變成 10/4
     （牟佑彬：「追蹤是以行程當天為追蹤，不應該變成是今日的日期」）。 */
  return { rc: r.recCode || '', go: r.id || '', date: r.date || '',
           client: r.client || '',
           target: r.target || '', workers: r.workers || '', lang: r.lang || '',
           big: r.big || '', sub: r.sub || '' };
}

function cardSubmit(r){
  google.script.run
    .withSuccessHandler(function(){
      toast('已送給副理審閱'); calBust(); loadCal(); refreshBadge(); })
    .withFailureHandler(function(e){ toast(e.message, true); })
    .submitForReview(CODE, r.recCode);
}
function cardCancel(r){
  google.script.run
    .withSuccessHandler(function(){ toast('已取消'); calBust(); loadCal(); })
    .withFailureHandler(function(e){ toast(e.message, true); })
    .setScheduleStatus(CODE, r.id, '取消');
}
function cardReschedule(r){
  openDatePick({ kind: '', nextDate: r.date, nextNote: '' }, function(d){
    if(!d) return;
    google.script.run
      .withSuccessHandler(function(){ toast('已改到 ' + d); calBust(); loadCal(); })
      .withFailureHandler(function(e){ toast(e.message, true); })
      .moveSchedule(CODE, r.id, d);
  });
}

/* iOS 的 Safari 對 clipboard API 很挑，execCommand 這條老路反而穩。
   兩條都試，哪條成了就算成了。 */
function copyText(t, what){
  var ta = document.createElement('textarea');
  ta.value = t; ta.style.cssText = 'position:fixed;top:-100px;opacity:0';
  document.body.appendChild(ta); ta.select();
  var ok = false;
  try { ok = document.execCommand('copy'); } catch(e){}
  ta.remove();
  if(ok){ toast((what||'') + '已複製'); return; }
  if(navigator.clipboard){
    navigator.clipboard.writeText(t).then(
      function(){ toast((what||'') + '已複製'); },
      function(){ toast('複製不了，請長按選取', true); });
  } else toast('複製不了，請長按選取', true);
}

if($('cmCancel')) $('cmCancel').addEventListener('click', closeCardMenu);
if($('cardMenu')) $('cardMenu').addEventListener('click', function(e){
  if(e.target === $('cardMenu')) closeCardMenu();
});


/* ── 長按追蹤：整串服務紀錄（他挑的 L1 時間軸清單）──────────
   由舊到新一條線串起來，每一列：第幾次、日期、做了什麼、結果、代碼、審核狀態。

   三個讓第一次用的人就懂的設計：
     ① 標題直接寫「第 3 次・共 4 次」，不要只寫案件代碼——
        人不需要先理解「案件」這個概念才看得懂。
     ② 目前這一筆要標出來。不然點進去看完第一筆，回來就不知道自己原本在哪。
     ③ 最後一列是「＋ 記第 N 次」。看到它就知道這一串還會繼續長，
        這比任何說明文字都有效。 */
function openChain(recCode, caseId){
  if(!$('chainModal')){ toast('要先更新 App', true); return; }
  $('chList').innerHTML = '<div class="mid" style="padding:22px">讀取中…</div>';
  $('chKind').textContent = ''; $('chCount').textContent = '這一串服務';
  $('chWho').textContent = '';
  $('chainModal').style.display = '';
  google.script.run
    .withSuccessHandler(function(r){ drawChain(r, recCode); })
    .withFailureHandler(function(e){
      $('chList').innerHTML = '<div class="mid" style="padding:22px">'+esc(e.message)+'</div>'; })
    .caseChainOf(CODE, recCode);
}

function drawChain(r, recCode){
  if(!r || !r.has){
    $('chList').innerHTML = '<div class="mid" style="padding:22px">這一筆還沒掛在任何追蹤底下</div>';
    return;
  }
  $('chKind').textContent = '◷ ' + r.kind + '　' + r.id;
  $('chCount').textContent = (r.n ? ('第 ' + r.n + ' 次・') : '') + '共 ' + r.total + ' 次服務';
  $('chWho').textContent = (r.client || '') + (r.workers ? '　·　' + r.workers : '');
  $('chList').innerHTML = '<div class="chl">' + r.list.map(function(x){
    var cur = x.rec === recCode;
    return '<button type="button" class="ci'+(cur?' cur':'')+'" data-rec="'+esc(x.rec)+'">' +
      '<span class="no">'+x.n+'</span>' +
      '<span class="top"><span class="d">'+esc(x.date)+'</span>' +
      (cur?'<span class="me">這一筆</span>':'') +
      '<span class="cd">'+esc(x.rec)+'</span></span>' +
      '<span class="s">'+esc(x.sub || '服務紀錄')+'</span>' +
      (x.result ? '<span class="r">'+esc(x.result)+'　·　'+
        esc(RV_LABEL[x.rv] || x.rv)+'</span>'
                : '<span class="r">'+esc(RV_LABEL[x.rv] || x.rv)+'</span>') +
    '</button>';
  }).join('') +
  '<button type="button" class="cadd" data-add="'+esc(r.id)+'">＋　記第 ' +
    (r.total + 1) + ' 次服務</button></div>';

  [].forEach.call($('chList').querySelectorAll('[data-rec]'), function(b){
    b.addEventListener('click', function(){
      $('chainModal').style.display = 'none';
      openRecord(b.dataset.rec, { rec: b.dataset.rec, y: window.scrollY,
        view: CAL_VIEW, ym: CAL_YM, sel: CAL_SEL,
        label: (($('calDayTitle')||{}).textContent||'').trim(), name: r.client });
    });
  });
  var add = $('chList').querySelector('[data-add]');
  if(add) add.addEventListener('click', function(){
    $('chainModal').style.display = 'none';
    goTab('track'); openCase(add.dataset.add);
  });
}
if($('chCancel')) $('chCancel').addEventListener('click', function(){
  $('chainModal').style.display = 'none';
});

/* ── 加入追蹤（做法一）────────────────────────────────
   長按一筆已完成、還沒掛案件的紀錄 → 加入追蹤 → 挑一件 → 確認。

   ⛔ 不要讓人從一長串裡找。系統已經知道這張卡的移工與客戶，
   同一位移工的排最前面並標「同一人」。 */
function openMergePick(r){
  if(!$('mergeModal')){ toast('要先更新 App', true); return; }
  MG_REC_ = r.recCode;
  $('mgK').textContent = '加入追蹤';
  $('mgTitle').textContent = '要併到哪一件？';
  $('mgSub').textContent = (r.workers || '') + (r.client ? '　·　' + r.client : '');
  $('mgBody').innerHTML = '<div class="mid" style="padding:20px">找找看有哪些…</div>';
  $('mergeModal').style.display = '';
  google.script.run
    .withSuccessHandler(function(res){ drawMergePick(res.rows || [], r); })
    .withFailureHandler(function(e){
      $('mgBody').innerHTML = '<div class="mid" style="padding:20px">'+esc(e.message)+'</div>'; })
    .caseCandidates(CODE, (r.workers||'').split('、')[0] || '', r.client || '');
}
var MG_REC_ = '';

function drawMergePick(rows, r){
  /* ⛔ 只分「同一位移工」與「同一個雇主」兩組。
     以前還有第三組「其他進行中」，那是全系統的案件——
     併進另一個移工、另一個雇主的案件沒有任何合理情境。
     後端 caseCandidates 已經不回了，這裡也不要留位置給它。 */
  var byRank = { 0: [], 1: [] };
  rows.forEach(function(c){ if(byRank[c.rank]) byRank[c.rank].push(c); });
  var LBL = { 0: '同一位移工　進行中', 1: '同一個雇主　進行中' };
  var h = '';
  [0,1].forEach(function(k){
    if(!byRank[k].length) return;
    h += '<div class="mgsec">'+LBL[k]+'</div>' + byRank[k].map(function(c){
      return '<button type="button" class="mgi" data-id="'+esc(c.id)+'">' +
        '<span class="ic">◷</span><span class="tx">' +
        '<b>'+esc(c.kind)+'　'+esc(c.id)+
          (c.sameWorker?'<span class="hit">同一人</span>':'')+'</b>' +
        '<span>'+esc(c.title || c.client)+'　·　目前 '+c.n+' 次　·　'+
          esc(c.openedAt)+' 開案</span></span></button>';
    }).join('');
  });
  if(!byRank[0].length && !byRank[1].length){
    h = '<p class="mgnone">' + esc((r.workers || '這位移工').split('、')[0]) +
      '與' + esc(r.client || '這個雇主') +
      '目前都沒有進行中的追蹤。<br>開一件新的吧。</p>';
  }
  h += '<button type="button" class="cmi" id="mgNew"><i>＋</i>都不是，開一件新的</button>';
  $('mgBody').innerHTML = h;
  [].forEach.call($('mgBody').querySelectorAll('[data-id]'), function(b){
    b.addEventListener('click', function(){ openMergeConfirm(b.dataset.id); });
  });
  $('mgNew').addEventListener('click', function(){
    $('mergeModal').style.display = 'none';
    openPick(cardData(r));
  });
}

/* 確認：序號會怎麼重排。
   ⚠ 這一步不能省。清單是照日期排的，後補的紀錄日期比較早就會插在中間，
   後面全部往後推——人會以為系統把資料弄亂了。先算給他看。 */
function openMergeConfirm(caseId){
  $('mgK').textContent = '確認';
  $('mgTitle').textContent = '算一下會變成怎樣';
  $('mgBody').innerHTML = '<div class="mid" style="padding:20px">算…</div>';
  google.script.run
    .withSuccessHandler(function(p){ drawMergeConfirm(p, caseId); })
    .withFailureHandler(function(e){
      $('mgBody').innerHTML = '<div class="mid" style="padding:20px">'+esc(e.message)+'</div>'; })
    .casePreviewAttach(CODE, caseId, MG_REC_);
}

function drawMergeConfirm(p, caseId){
  $('mgTitle').textContent = '加進去會變成第 ' + p.at + ' 次';
  $('mgSub').textContent = p.kind + '　' + p.id + '　目前 ' + p.before + ' 次';
  var moved = p.list.filter(function(x){ return x.moved; }).length;
  $('mgBody').innerHTML =
    (moved ? '<div class="mgwarn"><b>加進去之後，序號會重排</b>' +
      '清單是照日期排的。這一筆會插在中間，後面 ' + moved + ' 筆的序號各往後一格。</div>' : '') +
    '<div class="mgmini">' + p.list.map(function(x){
      return '<div class="r'+(x.isNew?' new':'')+'">' +
        '<span class="no">'+x.n+'</span>' +
        '<span class="d">'+esc(x.date)+'</span>' +
        '<span class="s">'+esc(x.sub || '服務紀錄')+'</span>' +
        (x.isNew ? '<span class="was">新加入</span>'
                 : (x.moved ? '<span class="was">原本第 '+x.was+'</span>' : '')) +
      '</div>';
    }).join('') + '</div>' +
    '<div class="mggo"><button type="button" id="mgBack">再想想</button>' +
    '<button type="button" class="p" id="mgGo">加進去</button></div>';
  $('mgBack').addEventListener('click', function(){ $('mergeModal').style.display = 'none'; });
  $('mgGo').addEventListener('click', function(){
    $('mgGo').disabled = true;
    google.script.run
      .withSuccessHandler(function(){
        $('mergeModal').style.display = 'none';
        toast('已併入 ' + caseId);
        calBust(); loadCal(); TK_LOADED = '';
      })
      .withFailureHandler(function(e){ $('mgGo').disabled = false; toast(e.message, true); })
      .attachRecord(CODE, caseId, MG_REC_);
  });
}
if($('mgCancel')) $('mgCancel').addEventListener('click', function(){
  $('mergeModal').style.display = 'none';
});

/* ── 往左滑出取消 ──────────────────────────────────────
   跟下面的長按拖曳改期共存，靠的是兩邊的門檻剛好錯開：
   拖曳的長按計時器在手指移動超過 8px 時就自己取消了，
   而左滑要移動超過 10px 且水平大於垂直才成立——
   所以左滑成立的當下，長按早就放棄了，不會兩個同時發生。
   反過來，長按已經進入拖曳（DRAG 不是 null）時這裡整段不動。

   兩邊都用 touch 事件，不要一邊 pointer 一邊 touch——
   同一個手指會產生兩套事件，判斷會互相打架。 */
/* ⚠ 這裡以前有一整套「一次只開一張」的記帳（SWIPE_OPEN_ / closeSwipe /
   dataset.x / scroll 監聽）。那是為了「滑出來會停在那裡等你點按鈕」的舊做法。
   現在是放開就執行，卡片永遠彈回 0，沒有東西會停在開著的狀態——整套刪掉。
   哪天又改回「滑出來latch住」，記得要一起加回來。 */

/* 每滑過一格的體感。
   ⚠ navigator.vibrate 只有 Android 有，iOS Safari 一律無效（Apple 擋的，
   裝成 PWA 也一樣，沒有繞路的方法）。所以視覺上的那一下 .pop 不是裝飾，
   它是 iPhone 唯一收得到的回饋，不要拿掉。
   聲音沒做：他們在工廠手機都是靜音，而且 iOS 靜音時 Web Audio 也不響。 */
function swTick(chip){
  if(!chip) return;
  var bad = chip.classList.contains('bad');
  try { if(navigator.vibrate) navigator.vibrate(bad ? 18 : 6); } catch(e){}
  chip.classList.remove('pop');
  void chip.offsetWidth;            // 重播動畫要先讓瀏覽器看到類別被拿掉
  chip.classList.add('pop');
}

function bindSwipe(w, r){
  var el = w.querySelector('.ev'), rail = w.querySelector('.swrail');
  if(!el || !rail) return;
  var chips = [].slice.call(rail.querySelectorAll('.swst'));
  if(!chips.length) return;
  var MAX = SW_STEP_ * chips.length;
  var sx = 0, sy = 0, mode = null, at = -1, moved = false;

  /* 推多遠 → 現在指著第幾格 */
  function indexOf(x){
    return Math.max(-1, Math.min(chips.length - 1,
      Math.floor(x / SW_STEP_ - SW_ARM_)));
  }
  function put(x, snap){
    el.classList.toggle('snap', !!snap);
    rail.classList.toggle('snap', !!snap);
    var t = x ? 'translateX(' + (-x) + 'px)' : '';
    el.style.transform = t; rail.style.transform = t;
  }
  function reset(){ mode = null; at = -1; mark(-1); put(0, true); }
  function mark(n){
    chips.forEach(function(c, i){ c.classList.toggle('hot', i === n); });
  }
  /* 超出最後一格就愈推愈重，不要硬停——硬停讀起來像當掉 */
  function rubber(over){ return over * 42 / (42 + over); }

  el.addEventListener('touchstart', function(e){
    if(DRAG) return;
    var t = e.touches[0];
    sx = t.clientX; sy = t.clientY;
    mode = null; moved = false; at = -1;
    el.classList.remove('snap'); rail.classList.remove('snap');
  }, {passive:true});

  el.addEventListener('touchmove', function(e){
    if(DRAG) return;                       // 長按拖曳優先
    var t = e.touches[0];
    var dx = sx - t.clientX, dy = t.clientY - sy;
    if(mode === null){
      if(Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) mode = 'swipe';
      else if(Math.abs(dy) > 10) mode = 'scroll';
      else return;
    }
    if(mode !== 'swipe') return;
    e.preventDefault();                    // 確定是左滑了才擋捲動
    moved = true;
    var nx = dx <= MAX ? Math.max(0, dx) : MAX + rubber(dx - MAX);
    var n = indexOf(nx);
    if(n !== at){ at = n; mark(at); if(at >= 0) swTick(chips[at]); }
    put(nx, false);
  }, {passive:false});

  el.addEventListener('touchend', function(){
    if(DRAG || mode !== 'swipe'){ mode = null; return; }
    var n = at;
    reset();
    if(n >= 0) swDo(swStops(r)[n].k, r);
  });
  el.addEventListener('touchcancel', reset);

  /* 用捕獲階段接，才擋得住裡面 .b[data-rec] 的那個 click——
     不然滑完放開，手指底下那一筆紀錄會跟著被打開。 */
  el.addEventListener('click', function(ev){
    if(DRAG) return;
    if(moved){ ev.stopPropagation(); ev.preventDefault(); moved = false; return; }
    ev.stopPropagation();
    // 預排的點一下開始填寫，已完成的打開那張服務表。整張卡都算數。
    if(r.status === '預排'){ if(r.id) startFromSchedule(r.id); return; }
    if(r.recCode){
      openRecord(r.recCode, {
        id: '', rec: r.recCode, y: window.scrollY,
        view: CAL_VIEW, ym: CAL_YM, sel: CAL_SEL,
        label: (($('calDayTitle') || {}).textContent || '').trim(),
        name: r.client || ''
      });
    }
  }, true);
}

/* 放開就執行。動作本身沿用長按選單那幾支，不要再寫第二份。
   ⛔ 取消要再問一次：手勢是會滑過頭的，而「取消行程」救不回來。 */
function swDo(k, r){
  if(k === 'edit') { openPlanEdit(r); return; }
  if(k === 'sub')  { cardSubmit(r); return; }
  if(k === 'date') { cardReschedule(r); return; }
  if(k === 'del')  {
    if(!confirm('要取消這個行程嗎？\n' + (r.client || '') +
                (r.slot ? '　' + r.slot : ''))) return;
    cardCancel(r); return;
  }
  if(k === 'track'){
    if(r.caseId){ goTab('track'); openCase(r.caseId); return; }
    if(r.recCode){ openMergePick(r); return; }
    openPick(cardData(r));
  }
}

/* ── 長按拖曳改期 ──────────────────────────────
   長按 500ms 進入拖曳，手指移到哪一天就亮哪一天，放開就改期。
   進入拖曳前不擋捲動，所以平常滑動不受影響。 */
var DRAG = null;
/* 長按：不動放開 → 出選單；按住之後移動 → 拖曳改期。
   跟 iOS 桌面同一套。已完成的行程不給改期，長按一律出選單。 */
function bindDrag(el, r){
  var id = r.id, canDrag = r.status === '預排';
  var timer = null, sx = 0, sy = 0, held = false, moved = false;

  function cancel(){
    if(timer){ clearTimeout(timer); timer = null; }
  }
  function endDrag(commit, x, y){
    if(!DRAG) return;
    document.body.style.userSelect = '';
    var gh = $('dragGhost'); if(gh) gh.remove();
    el.classList.remove('dragging');
    var hit = dropTargetAt(x, y);
    clearDrop();
    var d = DRAG; DRAG = null;
    if(commit && hit && hit !== d.from){
      google.script.run
        .withSuccessHandler(function(){ toast('已改到 '+hit); calBust(); loadCal(); })
        .withFailureHandler(function(e){ toast(e.message, true); })
        .moveSchedule(CODE, d.id, hit);
    }
  }

  el.addEventListener('touchstart', function(e){
    var t = e.touches[0]; sx = t.clientX; sy = t.clientY;
    held = false; moved = false;
    timer = setTimeout(function(){
      held = true;
      if(!canDrag) return;          // 已完成的不進拖曳，放開時出選單
      DRAG = { id: id, from: CAL_SEL };
      el.classList.add('dragging');
      document.body.style.userSelect = 'none';
      var gh = document.createElement('div');
      gh.id = 'dragGhost';
      gh.textContent = (el.querySelector('.n') || el).textContent.trim().slice(0, 18);
      gh.style.left = sx+'px'; gh.style.top = sy+'px';
      document.body.appendChild(gh);
      if(navigator.vibrate) navigator.vibrate(18);
      toast('拖到想改的日期，放開就改期');
    }, 500);
  }, {passive:true});

  el.addEventListener('touchmove', function(e){
    var t = e.touches[0];
    if(Math.abs(t.clientX-sx) > 8 || Math.abs(t.clientY-sy) > 8) moved = true;
    if(!DRAG){
      // 還沒進入拖曳，手指移動超過一點就當作是在捲動
      if(moved) cancel();
      return;
    }
    e.preventDefault();
    var gh = $('dragGhost');
    if(gh){ gh.style.left = t.clientX+'px'; gh.style.top = t.clientY+'px'; }
    highlightDrop(t.clientX, t.clientY);
  }, {passive:false});

  el.addEventListener('touchend', function(e){
    cancel();
    var t = (e.changedTouches && e.changedTouches[0]) || {};
    /* 按住不動就放開 → 出選單。按住之後移動過 → 那是拖曳（或捲動），
       選單不要跳出來打斷他。 */
    if(held && !moved && !DRAG){ openCardMenu(r); held = false; return; }
    if(held && !moved && DRAG){
      // 進了拖曳但手指沒動過：他要的是選單，不是改期
      endDrag(false); openCardMenu(r); held = false; return;
    }
    held = false;
    endDrag(true, t.clientX, t.clientY);
  });
  el.addEventListener('touchcancel', function(){ cancel(); endDrag(false); });
}

/* 手指下方是哪一天：月曆看格子、週曆看整列 */
function dropTargetAt(x, y){
  if(x == null || y == null) return '';
  var el = document.elementFromPoint(x, y);
  while(el && el !== document.body){
    if(el.dataset && el.dataset.d) return el.dataset.d;
    el = el.parentElement;
  }
  return '';
}
function clearDrop(){
  [].forEach.call(document.querySelectorAll('.dropok'), function(c){
    c.classList.remove('dropok'); });
}
function highlightDrop(x, y){
  clearDrop();
  var d = dropTargetAt(x, y);
  if(!d) return;
  var t = document.querySelector('[data-d="'+d+'"]');
  if(t) t.classList.add('dropok');
}

/* 點「開始填寫」：把行程的資料帶進填寫頁，接著填服務內容就好 */
/* ── 從行事曆進來的返回路徑 ──────────────────────────────
   他的原話：「按下返回鍵之後，要能回到我當初按進去的那個行程，
   有時候返回沒有回到那個地方，使用者會找不到當初是在哪邊點進去的。」

   所以不是「回到行事曆」就好——那一頁可能有二十筆。要做三件事：
     1. 記住進去之前捲到哪、看的是哪個月哪一天哪種檢視
     2. 把那一張卡片捲到畫面正中間
     3. 讓它亮一下再淡掉 ← 這一項最關鍵，眼睛會被動作吸走，不用自己找 */
var BACK_ = null;   // { id, rec, y, view, ym, sel, label, name }

/* 同一條返回列會長在兩個地方：填寫頁最上面，以及服務紀錄那個全螢幕視窗最上面。
   兩邊行為完全一樣，所以共用同一段程式，不要各寫一份。 */
function bkBar(id, hostId, plain){
  var b = $(id);
  if(b) return b;
  var host = $(hostId);
  if(!host) return null;          // 這支 app.js 兩個部署共用，前台沒有這些容器
  b = document.createElement('div');
  b.id = id;
  b.className = 'bkbar' + (plain ? ' plain' : '');
  b.style.display = 'none';
  b.innerHTML = '<span class="cv">‹</span><span>回</span><span class="to"></span>';
  host.insertAdjacentElement('afterbegin', b);
  b.addEventListener('click', backToCal);
  return b;
}

/* where：'form' = 填寫頁、'rec' = 服務紀錄視窗 */
function showBack(meta, where){
  var id = (where === 'rec') ? 'rvBk' : 'bkBar';
  var b = bkBar(id, (where === 'rec') ? 'revModal' : 'p-new', where === 'rec');
  if(!b) return;
  // 沒有標籤就不要畫這一條。以前會印出「回 undefined」——
  // 使用者看得到的字串要在這裡擋，不能靠呼叫的人記得帶。
  if(!meta || !meta.label){ hideBack(); return; }
  BACK_ = meta;
  b.querySelector('.to').textContent = meta.label + (meta.name ? '　·　' + meta.name : '');
  b.style.display = '';
}

function hideBack(){
  ['bkBar', 'rvBk'].forEach(function(id){
    var b = $(id);
    if(b) b.style.display = 'none';
  });
  BACK_ = null;
}

function backToCal(){
  var m = BACK_;
  hideBack();
  var rm = $('revModal');          // 從服務紀錄視窗返回的話，先把那一層收掉
  if(rm && rm.style.display !== 'none') rm.style.display = 'none';
  /* 從追蹤案件頁點「看這張表」進來的，要回那件案子，不是回行事曆。
     改版之後這條路變常走了——時間軸上每一筆旁邊都有「看這張表」。 */
  if(m && m.caseBack){ goTab('track'); openCase(m.caseBack); return; }
  if(m){ CAL_VIEW = m.view; CAL_YM = m.ym; CAL_SEL = m.sel; }
  document.querySelector('.tabs button[data-t=cal]').click();
  if(!m) return;
  /* 行事曆會整個重畫，所以不能記舊的節點，要用行程編號重新找。
     重畫要等資料回來，所以用短輪詢等它出現，最多兩秒。
     已經存過檔的那一筆會從「待處理」變「已完成」、掉了 data-go，
     所以也用紀錄編號找一次。 */
  var tries = 0;
  (function find(){
    /* 從已完成的卡片進來時沒有行程編號（m.id 是空的），
       空字串拿去查會比對到 data-go="" 之類的東西，所以要先擋掉。 */
    var hit = m.id ? document.querySelector('#calDayList [data-go="' + m.id + '"]') : null;
    if(!hit && m.rec) hit = document.querySelector('#calDayList [data-rec="' + m.rec + '"]');
    /* data-go 在外層的 .swwrap 上、data-rec 在卡片裡面的 .b 上，
       所以往上往下都要找一次。 */
    var card = hit ? (hit.closest('.ev') || hit.querySelector('.ev')) : null;
    if(!card){
      if(++tries < 20) return setTimeout(find, 100);
      window.scrollTo(0, m.y);        // 真的找不到，至少回到原本捲的位置
      return;
    }
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('flash');
    setTimeout(function(){ card.classList.remove('flash'); }, 1200);
  })();
}

/* ── 行政交代清單：填寫頁裡的那一塊（方案 ④）──────────────
   牟佑彬 2026-09-30：「如果這個 checklist 是在行程區塊那邊，
   那點擊服務表進去之後是不是又看不到了？」——所以清單要跟著進填寫頁，
   放在「這一趟」卡片裡。

   ⛔ 勾了就立刻送出，不要等存檔。人在工廠裡隨時可能被打斷，
      等存檔才寫回去的話，勾了一半關掉 App 就全沒了。
   ⚠ 只送「第幾項勾了」，不送整份清單——行政同時在後台改項目才不會被覆蓋。 */
function paintTodo(r){
  var box = $('todoBox');
  if(!box) return;                        // 舊版 Service.html 沒有這一塊
  /* 標題改成跟「服務日期」「處理方式」同一種寫法，不要用繪文字。
     ⛔ 直接改文字節點，不動 Service.html——那是後端檔，改它要重新部署。
     ⚠ 只改第一個文字節點，<em id="todoN"> 的數字要留著。 */
  var hd = box.querySelector('.todohd');
  if(hd && hd.firstChild && hd.firstChild.nodeType === 3)
    hd.firstChild.nodeValue = '行政交代';
  var t = (r && r.todo) || [];
  if(!t.length){ box.style.display = 'none'; box.dataset.id = ''; return; }
  box.dataset.id = r.id || '';
  box.style.display = '';
  drawTodo(t);
}
function drawTodo(t){
  var done = t.filter(function(x){ return x.d; }).length;
  $('todoN').textContent = done + ' / ' + t.length;
  $('todoList').innerHTML = t.map(function(x, i){
    return '<div class="todoit'+(x.d?' on':'')+'" data-i="'+i+'">'+
      '<span class="bx">'+(x.d?'✓':'')+'</span>'+
      '<span class="tx">'+esc(x.t)+'</span></div>';
  }).join('');
}
$('todoList') && $('todoList').addEventListener('click', function(e){
  var it = e.target.closest ? e.target.closest('.todoit') : null;
  if(!it) return;
  /* ⛔ 預排還沒確認＝這還不是他的行程，勾不得（牟佑彬 2026-10-04）。
     CSS 的 pointer-events 已經擋住了，這裡是第二道——
     勾一下會真的寫回試算表，不是只有畫面動。 */
  if(document.body.classList.contains('rotrip')) return;
  var id = $('todoBox').dataset.id;
  if(!id) return;
  it.classList.toggle('on');                       // 先動畫面，不要等後端
  it.querySelector('.bx').textContent = it.classList.contains('on') ? '✓' : '';
  var done = [];
  [].forEach.call($('todoList').children, function(el, i){
    if(el.classList.contains('on')) done.push(i);
  });
  $('todoN').textContent = done.length + ' / ' + $('todoList').children.length;
  google.script.run
    .withSuccessHandler(function(res){
      /* 後端回的是權威版本。行政剛好改過項目的話，這裡會把畫面校正回來。 */
      var row = CAL_ROWS.filter(function(x){ return x.id === id; })[0];
      if(row) row.todo = res.todo;
      if(res.todo && res.todo.length !== $('todoList').children.length) drawTodo(res.todo);
    })
    .withFailureHandler(function(err){
      it.classList.toggle('on');                   // 送不出去就退回去，不要騙人
      it.querySelector('.bx').textContent = it.classList.contains('on') ? '✓' : '';
      toast(err.message, true);
    })
    .setScheduleTodo(CODE, id, done);
});

function startFromSchedule(id){
  var r = CAL_ROWS.filter(function(x){ return x.id===id; })[0];
  if(!r) return;
  /* 翻譯點「還沒確認」的預排＝只能看（牟佑彬 2026-10-03）。
     ⛔ 卡片上就寫著「先不要去」，卻讓他點進去填服務紀錄，是互相矛盾的。
     ⚠ 行政與特助不受影響——他們進去是要改行程（body.filladm）。 */
  var ro = (!document.body.classList.contains('filladm') &&
            r.status === '預排' && !r.crew);
  document.body.classList.toggle('rotrip', ro);
  /* 從「排一筆新的」切回「改這一筆」，標題與按鈕要變回來 */
  if(document.body.classList.contains('filladm')){
    var h2 = document.querySelector('#p-new .card h3');
    if(h2) h2.textContent = '改這一筆行程';
    if($('admSave')) $('admSave').textContent = '存檔變更';
  }
  /* ⛔ 這裡原本會在表單最上面插一條橘色的「這一筆還沒確認，只能看」。
     牟佑彬 2026-10-04 要求拿掉——那一條佔掉整個第一屏，而且每次點進來都要再看一次。
     ⚠ 唯讀的理由**還是要講**，只是改成一次性的 toast（下面那行）：
       欄位本來就是鎖住的，他看得出來，不需要一塊常駐的橫幅重複講。 */
  /* 切分頁之前先量，不然 backToTop() 已經把捲動位置歸零了 */
  var back = { id: id, rec: '', y: window.scrollY,
               view: CAL_VIEW, ym: CAL_YM, sel: CAL_SEL,
               label: (($('calDayTitle') || {}).textContent || '').trim(),
               name: r.client };
  SCHED_ID = id;
  fillTripForm(r);
  paintTodo(r);
  document.querySelector('.tabs button[data-t=new]').click();
  showBack(back, 'form');          // 要在切完分頁之後，分頁切換會把它收起來
  window.scrollTo(0,0);
  toast(document.body.classList.contains('filladm')
    ? '可以改日期、翻譯、移工與服務項目'
    : (ro ? '這一筆還沒確認，只能看' : '已帶入行程，接著填服務內容'));
}

/* 上一頁／下一頁依目前檢視移動：月跳月、週跳七天、日跳一天 */
function calStep(dir){
  if(CAL_VIEW === 'month'){
    var y=+CAL_YM.slice(0,4), m=+CAL_YM.slice(5,7)+dir;
    if(m<1){ m=12; y--; } if(m>12){ m=1; y++; }
    CAL_YM = y+'-'+('0'+m).slice(-2);
    CAL_SEL = CAL_YM+'-01';
  } else {
    var d = new Date(CAL_SEL+'T00:00:00');
    d.setDate(d.getDate() + dir*(CAL_VIEW==='week'?7:1));
    CAL_SEL = dsOf(d);
    CAL_YM = CAL_SEL.slice(0,7);
  }
  loadCal();
}
$('calPrev').addEventListener('click', function(){ calStep(-1); });
$('calNext').addEventListener('click', function(){ calStep(1); });
$('calToday').addEventListener('click', function(){
  CAL_SEL = todayStr(); CAL_YM = CAL_SEL.slice(0,7); loadCal();
});
/* ⛔ 亮起來的那一顆以 CAL_VIEW 為準，不要靠 Service.html 裡寫死的 class="on"。
   版面在 GitHub Pages、Service.html 在 Apps Script，兩邊各自推——
   只推一半的話會變成「畫的是日、亮的是月」。唯一事實來源是 CAL_VIEW。 */
[].forEach.call($('calViews').querySelectorAll('button'), function(b){
  b.className = (b.dataset.v === CAL_VIEW) ? 'on' : '';
  b.addEventListener('click', function(){
    CAL_VIEW = b.dataset.v;
    [].forEach.call($('calViews').querySelectorAll('button'), function(x){
      x.className = (x===b) ? 'on' : ''; });
    CAL_YM = CAL_SEL.slice(0,7);
    loadCal();
  });
});

/* ── 排行程 ── */
/* 正在改的那一筆的行程代碼。'' = 開新的。 */
var PLAN_EDIT = '';

/* 行政要的四樣，planModal 本來沒有：
     1. 日期可以改（原本是固定顯示 CAL_SEL）
     2. 「建議誰去」可以不選——不選就是丟給特助配人
     3. 交代清單
     4. 存成「預排」，不是直接指派
   ⚠ 這幾塊用注入的，不寫進 Service.html——那是後端檔，改它要重新部署，
     而版本額度只剩 3 個。 */
function planAdmBits(){
  if(STAFF_ROLE !== '行政') return;
  var p = $('planDate');
  if(!$('planDateIn')){
    p.innerHTML = '<label class="dplb" style="margin-right:6px">服務日期</label>' +
      '<input type="date" id="planDateIn">';
  }
  $('planDateIn').value = CAL_SEL;
  /* 建議誰去：最前面補一個空的 */
  var cs = $('planCrew');
  if(cs && !cs.querySelector('option[value=""]')){
    cs.insertAdjacentHTML('afterbegin',
      '<option value="">還沒決定，交給特助配人</option>');
  }
  /* ⛔ openPlan 會把翻譯人員預選成「自己」，那是給翻譯自己排行程用的。
     行政不跑外勤，預選成名單第一個（佑彬）的話，**每一單都會莫名其妙建議他**，
     而且畫面上看起來很合理，不會有人發現。開新的一律從空白開始。
     2026-10-03 端到端實測抓到。 */
  if(cs && !PLAN_EDIT) cs.value = '';
  var lb = cs && cs.parentNode.querySelector('label');
  if(lb) lb.textContent = '建議誰去（可以不選）';
  /* 交代清單 */
  if(!$('planTodo')){
    var topic = $('planTopic');
    topic.parentNode.insertAdjacentHTML('afterend',
      '<div class="f" style="margin-top:10px"><label>交代給翻譯的事</label>' +
      '<div id="planTodo"></div>' +
      '<button type="button" class="dpsm" id="planTodoAdd">＋ 再加一項</button></div>');
    $('planTodoAdd').onclick = function(){
      var bx = $('planTodo'); if(bx) bx.dataset.touched = '1';
      planTodoAdd(''); };
  }
}
function planTodoAdd(v){
  var box = $('planTodo'); if(!box) return;
  if(box.children.length >= 12) return;      // 上限跟後端 schedTodoStr_ 一致
  var d = document.createElement('div');
  d.className = 'tdrow';
  d.innerHTML = '<input type="text" value="'+esc(v||'')+'" placeholder="例如：找會計部林小姐">'+
    '<button type="button" class="dpsm" data-x="1">✕</button>';
  d.querySelector('[data-x]').onclick = function(){
    d.remove(); box.dataset.touched = '1'; };
  d.querySelector('input').addEventListener('input', function(){
    box.dataset.touched = '1'; });
  box.appendChild(d);
}
function planTodoRows(){
  return [].map.call(($('planTodo')||{children:[]}).children, function(r){
    return (r.querySelector('input')||{}).value || ''; })
    .map(function(v){ return v.trim(); }).filter(String);
}

/* 左滑的「改」。沿用同一個視窗，只是先把值填回去。 */
function openPlanEdit(r){
  PLAN_EDIT = r.id;
  openPlan(r.client);
  $('planTarget').value = (r.target && r.target.indexOf('工廠') !== 0) ? '家庭雇主' : '工廠';
  $('planSlot').value = r.slot || '';
  $('planBig').value = r.big || '';
  $('planBig').dispatchEvent(new Event('change'));
  $('planSub').value = r.sub || '';
  $('planTopic').value = r.memo || '';
  if($('planDateIn')) $('planDateIn').value = r.date || CAL_SEL;
  if($('planCrew')) $('planCrew').value = r.crew || r.sug || '';
  var bx = $('planTodo');
  if(bx){
    bx.innerHTML = ''; bx.dataset.touched = '1';
    (r.todo || []).forEach(function(t){ planTodoAdd(t.t || t); });
  }
  /* 已確認的改完會退回待確認，按鈕上要先講 */
  $('planSave').textContent = r.crew ? '存檔（會退回待確認）' : '存檔';
  fillPlanWorkers(r.workers || '');
}

function openPlan(client){
  PLAN_EDIT = PLAN_EDIT || '';
  $('planDate').textContent = CAL_SEL;
  $('planCrew').innerHTML = CREW.map(function(n){ return '<option>'+esc(n)+'</option>'; }).join('');
  if(CREW.indexOf(STAFF_NAME)!==-1) $('planCrew').value = STAFF_NAME;
  if(client){
    var pz0 = presetOf(client);
    if(pz0){
      $('planTarget').value = (pz0.t === '家庭雇主') ? '家庭雇主' : '工廠';
      fillPlanClients();
      setPlanClient(client);
      if(pz0.crew && CREW.indexOf(pz0.crew)!==-1) $('planCrew').value = pz0.crew;
    } else { fillPlanClients(); setPlanClient(client); }
  } else {
    fillPlanClients(); setPlanClient('');
  }
  fillPlanBig();
  fillPlanWorkers();
  planAdmBits();
  if(!PLAN_EDIT) $('planSave').textContent = '排進行事曆';
  $('planModal').style.display='';
}
$('calAdd').addEventListener('click', function(){
  /* 行政走同一張表單（牟佑彬 2026-10-03）。
     ⛔ 不要再開 planModal——那是另一個版面，同一件事兩種長相。 */
  if(document.body.classList.contains('filladm')){ admNewTrip(); return; }
  openPlan('');
});

/* 行政：開一張空白的行程表。跟「改這一筆」是同一頁，差別只在沒有 SCHED_ID。 */
function admNewTrip(){
  SCHED_ID = '';
  document.body.classList.remove('rotrip');
  resetForm();
  $('date').value = CAL_SEL;
  $('workers').innerHTML = '';
  addWorker();
  document.querySelector('.tabs button[data-t=new]').click();
  window.scrollTo(0, 0);
  if($('admTodo')) $('admTodo').innerHTML = '';
  var h = document.querySelector('#p-new .card h3');
  if(h) h.textContent = '排一筆新的行程';
  if($('admSave')) $('admSave').textContent = '排進行事曆';
  toast('選工廠、要找誰、要辦什麼事');
}
/* 排程時就選好服務項目與移工，當天點「開始填寫」整張表已經填好一半 */
function fillPlanBig(){
  $('planBig').innerHTML = '<option value="">請選擇…</option>' +
    (TAX.cats||[]).map(function(c){ return '<option>'+esc(c.b)+'</option>'; }).join('');
  $('planSub').innerHTML = '<option value="">先選類別</option>';
}
$('planBig').addEventListener('change', function(){
  var c = (TAX.cats||[]).filter(function(x){ return x.b === $('planBig').value; })[0];
  $('planSub').innerHTML = c
    ? '<option value="">請選擇…</option>' +
      c.s.map(function(x){ return '<option>'+esc(x.n)+'</option>'; }).join('')
    : '<option value="">先選類別</option>';
});
/* @param {string} picked 已經選過的移工，用「、」隔開（改單的時候帶回來）
   ⛔ 沒有這個參數的話，行政按「改」進去會看到移工全部沒勾，
      存檔就把本來選的人洗掉了——而且畫面上看不出來。 */
function fillPlanWorkers(picked){
  var was = String(picked || '').split('、').filter(String);
  var pz = presetOf($('planClient').value);
  $('planWorkers').innerHTML = (pz && pz.w.length)
    ? pz.w.map(function(w){
        return '<label><input type="checkbox" value="'+esc(w.n)+'"'+
          (was.indexOf(w.n) !== -1 ? ' checked' : '')+'>'+
          '<span>'+esc(w.n)+(w.o?'<span class="o">'+esc(w.o)+'</span>':'')+'</span>'+
          '<span class="lg">'+esc(w.l)+'</span></label>'; }).join('')
    : '<div class="empty">先選工廠／雇主</div>';
}
function planWorkerNames(){
  return [].map.call($('planWorkers').querySelectorAll('input:checked'),
                     function(i){ return i.value; });
}
/* 排行程那一格。跟開單、服務紀錄共用同一個元件——
   ⛔ 三個畫面三種選法，使用者每換一個地方就要重新學一次。
   ⚠ #planClient 是 hidden input，不會發 change，所以不掛監聽，
     由 onPick 直接叫 fillPlanWorkers。 */
var PLAN_PK_ = {
  id: 'planPk', mode: 'svc', list: [], allowNew: true,
  onPick: function(c){ setPlanClient(c); fillPlanWorkers(); }
};
function setPlanClient(c){
  c = c || '';
  $('planClient').value = c;
  $('planPkVal').textContent = c || '請選擇…';
  $('planPkVal').classList.toggle('has', !!c);
  $('planPkVal').classList.remove('open');
  $('planPkPop').style.display = 'none';
  if($('planPkQ')) $('planPkQ').value = '';
}
pkWire(PLAN_PK_);

function fillPlanClients(){
  var kind = $('planTarget').value.indexOf('家庭')!==-1 ? '家庭雇主' : '工廠';
  PLAN_PK_.list = PRESETS.filter(function(x){ return (x.t||'工廠')===kind; })
                         .map(pkFromPreset_);
  /* 換了服務對象，原本選的那一家可能不在這一類裡了。
     ⛔ 不要默默留著——工廠名單裡留著家庭雇主，移工名單會整個對不上。 */
  var keep = $('planClient').value;
  if(keep && presetOf(keep) &&
     !PLAN_PK_.list.some(function(x){ return x.c === keep; })){
    setPlanClient('');
  }
  if($('planPkPop').style.display !== 'none') pkDraw(PLAN_PK_);
}
$('planTarget').addEventListener('change', function(){ fillPlanClients(); fillPlanWorkers(); });
$('planCancel').addEventListener('click', function(){ $('planModal').style.display='none'; });
/* ⛔ 關掉視窗一定要清 PLAN_EDIT。漏掉的話下一次按「＋ 排一筆行程」
   會變成**改到剛剛那一筆**，而且畫面上看不出來。 */
$('planCancel').addEventListener('click', function(){ PLAN_EDIT = ''; });

$('planSave').addEventListener('click', function(){
  if(!$('planClient').value){ toast('請選工廠／雇主名稱', true); return; }
  var pz = presetOf($('planClient').value);
  var picked = planWorkerNames();
  // 語別：選了移工就用他們的，沒選就用這家人數最多的那一種，
  // 行事曆上的顏色才有代表性
  var lang = '';
  if(pz){
    if(picked.length){
      var ls = [];
      pz.w.forEach(function(w){
        if(picked.indexOf(w.n)!==-1 && ls.indexOf(w.l)===-1) ls.push(w.l); });
      lang = ls.join('、');
    } else {
      var cnt={}, best=0;
      pz.w.forEach(function(w){ cnt[w.l]=(cnt[w.l]||0)+1;
        if(cnt[w.l]>best){ best=cnt[w.l]; lang=w.l; } });
    }
  }
  var adm = (STAFF_ROLE === '行政');
  /* ⛔ 這一行是 10/7 行程被搬到 10/4 的兇手。
     行政改單走的是下面的 updateSchedule，裡面送 date: day。
     注入的 #planDateIn 只要有一次沒生出來（planAdmBits 是注入的，
     openPlanEdit 第 2809 行也只在它存在時才填 r.date），
     day 就變成 CAL_SEL ——**當時行事曆上選的那一天**，
     於是整趟行程被無聲搬走，沒有任何提示。
     改法：拿不到真的日期欄位就**整個不要送 date**（後端沒傳就不動）。 */
  var dayIn = (adm && $('planDateIn')) ? $('planDateIn').value : '';
  var day = dayIn || CAL_SEL;        // 新增行程還是要有一天
  var who = $('planCrew').value;
  var b=$('planSave'); b.disabled=true;

  /* 行政改既有的那一筆 */
  if(adm && PLAN_EDIT){
    if(dayIn && !askMoveDate(PLAN_EDIT, dayIn)){ b.disabled = false; return; }
    var patch = {
      slot: $('planSlot').value, lang: lang,
      big: $('planBig').value, sub: $('planSub').value,
      topic: $('planBig').value + ' ／ ' + $('planSub').value,
      memo: $('planTopic').value.trim(),
      workers: picked.join('、'), sug: who,
      todo: planTodoRows()
    };
    if(dayIn) patch.date = dayIn;        // 沒有日期欄位就不碰那一欄
    google.script.run
      .withSuccessHandler(function(res){
        b.disabled=false; PLAN_EDIT=''; $('planModal').style.display='none';
        toast('改好了' + (res && res.back
          ? ('　已退回待確認' + (res.who ? ('，已通知 '+res.who) : '')) : ''));
        calBust(); loadCal(null, true);
      })
      .withFailureHandler(function(e){ b.disabled=false; toast(e.message,true); })
      .updateSchedule(CODE, PLAN_EDIT, patch);
    return;
  }

  google.script.run
    .withSuccessHandler(function(){
      b.disabled=false; PLAN_EDIT=''; $('planModal').style.display='none';
      toast(adm ? (who ? ('開好了　建議 '+who+'，等特助確認') : '開好了　等特助配人')
                : '已排進行事曆');
      calBust(); loadCal();
    })
    .withFailureHandler(function(e){ b.disabled=false; toast(e.message,true); })
    /* ⛔ 行政**不可以直接指派**。crew 一定要明確傳空字串——
       不傳的話後端會掛給開單的人（行政自己），而行政不跑外勤，
       特助也就永遠看不到待指派池（Schedule.gs 的 addSchedule 註解）。 */
    .addSchedule(CODE, { date: day, slot: $('planSlot').value,
      crew: adm ? '' : who, sug: adm ? who : '',
      target: $('planTarget').value,
      client: $('planClient').value, lang: lang,
      big: $('planBig').value, sub: $('planSub').value,
      workers: picked.join('、'),
      todo: adm ? planTodoRows().map(function(t){ return {t:t, d:0}; }) : [],
      topic: $('planTopic').value.trim() });
});

/* ── 簽名 ─────────────────────────────
   原本是直接在頁面裡的框上簽，手指要捲動頁面時常常掃過簽名框就畫上一筆。
   改成：框平常只是預覽，點一下才跳出整頁的簽名板，簽完按完成寫回來。
   頁面照常捲動，也不會再誤畫；順便簽名區域變大，簽起來清楚很多。 */
var SIG_BOX_ = null;      // 目前正在簽哪一格
var SM_ = null;           // 全螢幕簽名板的狀態

function initSig(box){
  var pad = box.querySelector('.pad');
  var st = { url:'' };
  function paint(){
    var img = pad.querySelector('img');
    if(st.url){
      if(!img){ img=document.createElement('img'); pad.appendChild(img); }
      img.src = st.url; pad.classList.add('on');
    } else {
      if(img) img.remove();
      pad.classList.remove('on');
    }
  }
  /* 簽名板是畫在 canvas 上的，不會發 input 事件，所以在這裡補。
     四個入口（雇主、翻譯、每位移工）共用這一段，一個地方就攔得到。 */
  box.__sig = {
    data:   function(){ return st.url; },
    signed: function(){ return !!st.url; },
    clear:  function(){ st.url=''; paint(); markDirty(); },
    set:    function(u){ st.url=u||''; paint(); markDirty(); }
  };
  pad.addEventListener('click', function(){ openSig(box); });
  box.querySelector('[data-clear]').addEventListener('click', function(e){
    e.stopPropagation(); box.__sig.clear();
  });
}

function openSig(box){
  SIG_BOX_ = box;
  var lb = box.querySelector('.lb label');
  $('smTitle').textContent = lb ? lb.textContent : '簽名';
  // 只有翻譯人員自己的簽名值得存起來重複用；移工與雇主每次都是不同人
  var isStaff = box.dataset.sig === 'staff';
  // 只有翻譯人員自己的簽名值得存起來重複用；移工與雇主每次都是不同人
  $('smMine').style.display = isStaff ? '' : 'none';
  $('smUse').style.display = MYSIG ? '' : 'none';
  /* 還沒抓過就抓，抓到再把「沿用上次簽名」的按鈕打開 */
  ensureMySig(function(){
    var u = $('smUse'); if(u) u.style.display = MYSIG ? '' : 'none';
  });
  $('smHint').textContent = isStaff
    ? '簽完按「存為我的簽名」，以後開表就會自動帶上去，不用每次重畫。'
    : '用手指在下面的白框裡簽，簽完按「完成」。';
  $('sigModal').style.display='';
  // 要等版面畫出來才量得到寬高，量到 0 會畫不出線
  setTimeout(function(){ smInit(box.__sig.data()); }, 30);
}
function closeSig(){ $('sigModal').style.display='none'; SIG_BOX_=null; }

function smInit(preset){
  var cv = $('smCanvas');
  var pad = cv.parentNode;
  var ctx = cv.getContext('2d');
  var r = pad.getBoundingClientRect();
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(r.width*dpr); cv.height = Math.round(r.height*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.lineWidth=6.2; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.strokeStyle='#111';
  var drawing=false, dirty=false, last=null;

  if(preset){
    var im=new Image();
    im.onload=function(){ ctx.drawImage(im,0,0,r.width,r.height); dirty=true; };
    im.src=preset;
  }
  function pt(e){ var b=cv.getBoundingClientRect(); var t=e.touches?e.touches[0]:e;
    return { x:t.clientX-b.left, y:t.clientY-b.top }; }
  function down(e){ e.preventDefault(); drawing=true; dirty=true; last=pt(e); }
  function move(e){ if(!drawing) return; e.preventDefault();
    var q=pt(e); ctx.beginPath(); ctx.moveTo(last.x,last.y); ctx.lineTo(q.x,q.y); ctx.stroke(); last=q; }
  function up(){ drawing=false; }
  // 每次開啟都重綁：先換掉節點把舊的監聽清乾淨
  var fresh = cv.cloneNode(false); cv.parentNode.replaceChild(fresh, cv);
  cv = fresh; ctx = cv.getContext('2d');
  cv.width=Math.round(r.width*dpr); cv.height=Math.round(r.height*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.lineWidth=6.2; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.strokeStyle='#111';
  if(preset){ var im2=new Image();
    im2.onload=function(){ ctx.drawImage(im2,0,0,r.width,r.height); }; im2.src=preset; }
  ['mousedown','touchstart'].forEach(function(k){ cv.addEventListener(k,down,{passive:false}); });
  ['mousemove','touchmove'].forEach(function(k){ cv.addEventListener(k,move,{passive:false}); });
  ['mouseup','mouseleave','touchend','touchcancel'].forEach(function(k){ cv.addEventListener(k,up); });

  SM_ = {
    canvas: cv,
    clear: function(){ ctx.clearRect(0,0,cv.width,cv.height); dirty=false; },
    dirty: function(){ return dirty; }
  };
}
$('smClear').addEventListener('click', function(){ if(SM_) SM_.clear(); });
/* 一鍵貼上存過的簽名，不用重畫 */
$('smUse').addEventListener('click', function(){
  if(!MYSIG){ toast('還沒有存過簽名', true); return; }
  if(SIG_BOX_) SIG_BOX_.__sig.set(MYSIG);
  closeSig();
  toast('已貼上你存的簽名');
});
$('smSave').addEventListener('click', function(){
  if(!SM_ || !SM_.dirty()){ toast('還沒簽名', true); return; }
  var u = trimSig(SM_.canvas);
  if(SIG_BOX_) SIG_BOX_.__sig.set(u);
  closeSig();
  saveMySig(u);
});
$('smCancel').addEventListener('click', closeSig);
/* 簽名板很大，但實際寫到的只是中間一小塊。直接存整張的話，
   放進表單那條簽名線時會被 contain 縮到很小、看起來像一根細線。
   這裡先量出墨跡的外框、裁掉四周空白再存，簽名就能填滿該有的位置。 */
function trimSig(cv){
  var ctx=cv.getContext('2d'), w=cv.width, h=cv.height;
  var d;
  try{ d=ctx.getImageData(0,0,w,h).data; }catch(e){ return cv.toDataURL('image/png'); }
  var x0=w, y0=h, x1=-1, y1=-1;
  for(var y=0;y<h;y++){
    for(var x=0;x<w;x++){
      if(d[(y*w+x)*4+3]>12){
        if(x<x0)x0=x; if(x>x1)x1=x;
        if(y<y0)y0=y; if(y>y1)y1=y;
      }
    }
  }
  if(x1<0) return '';
  var pad=Math.round(Math.min(w,h)*0.04);
  x0=Math.max(0,x0-pad); y0=Math.max(0,y0-pad);
  x1=Math.min(w-1,x1+pad); y1=Math.min(h-1,y1+pad);
  var cw=x1-x0+1, ch=y1-y0+1;
  var o=document.createElement('canvas'); o.width=cw; o.height=ch;
  o.getContext('2d').drawImage(cv, x0,y0,cw,ch, 0,0,cw,ch);
  return o.toDataURL('image/png');
}
$('smOk').addEventListener('click', function(){
  if(SIG_BOX_ && SM_) SIG_BOX_.__sig.set(SM_.dirty() ? trimSig(SM_.canvas) : '');
  closeSig();
});
$('sigModal').addEventListener('click', function(e){ if(e.target===this) closeSig(); });

function sigOf(box){ return (box && box.__sig) ? box.__sig.data() : ''; }

/* ── 移工卡 ───────────────────────────── */
function itemOf(big, sub){
  var c = TAX.cats.filter(function(x){ return x.b===big; })[0];
  if(!c) return null;
  return c.s.filter(function(x){ return x.n===sub; })[0] || null;
}
function fillOpts(card, big, sub){
  var it = itemOf(big, sub);
  var bd = card.querySelector('[data-do]'), br = card.querySelector('[data-res]');
  function mk(a){ return a.map(function(v){
    return '<label><input type="checkbox" value="'+esc(v)+'">'+esc(v)+'</label>'; }).join(''); }
  if(!it){ bd.innerHTML = br.innerHTML = '<span class="ph">先選服務細項</span>'; return; }
  bd.innerHTML = mk(it.d);
  br.innerHTML = mk(it.r.concat(TAX.resultCommon));
}
function addWorker(){
  var id='w'+(++seq);
  var d=document.createElement('div');
  d.className='wk';
  d.innerHTML =
   '<div class="wkh"><b>移工 '+($('workers').children.length+1)+'</b><div>'+
     '<button type="button" data-same="1">同上</button>'+
     '<button type="button" class="del" data-del="1">移除</button></div></div>'+
   '<div class="g2">'+
     '<div class="f"><label>姓名</label>'+
       '<select data-k="name"></select>'+
       '<input data-k="nameOther" placeholder="自行輸入姓名" style="display:none;margin-top:7px"></div>'+
     '<div class="f"><label>語別</label><div class="chips">'+
       TAX.langs.map(function(l){ return '<label><input type="radio" name="lg_'+id+'" value="'+l+'">'+l+'</label>'; }).join('')+
     '</div></div></div>'+
   /* ⛔ 這裡以前標 data-adm="one"，行政只有第一張卡看得到服務項目，
      理由是「行程表上只有一組服務類別／細項」。
      那個理由在加了「移工項目」那一欄（方案乙）之後就不成立了，
      但標記忘了拿掉——他 2026-10-04 又踩到：
      「第二個的服務項目也要開放讓我選擇，跟翻譯端的一樣」。 */
   '<div class="g2">'+
     '<div class="f"><label>服務類別</label><select data-k="big"><option value="">請選擇…</option>'+
       TAX.cats.map(function(c){ return '<option>'+esc(c.b)+'</option>'; }).join('')+'</select></div>'+
     '<div class="f"><label>服務細項</label><select data-k="sub"><option value="">先選類別</option></select></div>'+
   '</div>'+
   /* data-adm="hide" ＝服務做完才填的，行政看不到。
      ⛔ 行程表上沒有這些欄位，留著只會讓行政白打一場。 */
   '<div class="f" data-adm="hide"><label>處理經過（可複選）</label><div class="chips" data-do>'+
     '<span class="ph">先選服務細項</span></div>'+
     '<p class="hint">接著補寫細節：</p>'+
     '<textarea data-k="dnote" placeholder="例如：亞大醫院骨科，掛號費 350 已代墊"></textarea></div>'+
   '<div class="f" data-adm="hide"><label>結果（可複選）</label><div class="chips" data-res>'+
     '<span class="ph">先選服務細項</span></div>'+
     '<p class="hint">接著補寫細節：</p>'+
     '<textarea data-k="rnote" placeholder="例如：8/12 上午回診拆線，已跟工廠請假"></textarea></div>'+
   '<div class="f" data-adm="hide"><label>費用</label><input data-k="fee" placeholder="車資200"></div>'+
   '<div class="f" data-adm="hide"><label>備註</label><input data-k="memo" placeholder="選填"></div>'+
   '<div class="sig" data-adm="hide" data-sig="worker">'+
     '<div class="lb"><label>移工簽名</label><button type="button" data-clear>清除</button></div>'+
     '<div class="pad"><div class="ph">點一下簽名</div></div></div>';

  var big=d.querySelector('[data-k=big]'), sub=d.querySelector('[data-k=sub]');
  big.addEventListener('change', function(){
    var c = TAX.cats.filter(function(x){ return x.b===big.value; })[0];
    sub.innerHTML='';
    if(!c){ sub.add(new Option('先選類別','')); }
    else { sub.add(new Option('請選擇…',''));
           c.s.forEach(function(x){ sub.add(new Option(x.n, x.n)); }); }
    fillOpts(d,'','');
  });
  sub.addEventListener('change', function(){ fillOpts(d, big.value, sub.value); });
  $('workers').appendChild(d);
  // 一定要等接進畫面才 init：簽名板要量得到寬度才畫得對
  fillWorkerNames(d);
  syncMode();
  initSig(d.querySelector('[data-sig=worker]'));
}
function renumber(){
  /* ⛔ 這一行以前無條件寫「移工 N」，所以每次重建卡片，
     syncMode() 設好的「宣導內容」就被蓋回去了——
     行政點進一對多的行程，底下還是出現「移工 1」
     （牟佑彬 2026-10-04：「一對多的下面為什麼還有出現一個移工的欄位？」）。 */
  var b = isBrief();
  [].forEach.call($('workers').children, function(el,i){
    el.querySelector('.wkh b').textContent = (b && i===0) ? '宣導內容' : ('移工 '+(i+1)); });
}
$('addWk').addEventListener('click', addWorker);

$('workers').addEventListener('click', function(e){
  var card = e.target.closest('.wk'); if(!card) return;
  if(e.target.dataset.del){
    if($('workers').children.length===1){ toast('至少要留一位移工', true); return; }
    card.remove(); renumber(); return;
  }
  if(e.target.dataset.same){
    var p = card.previousElementSibling;
    if(!p){ toast('這是第一位，沒有上一位可複製', true); return; }
    var bg=card.querySelector('[data-k=big]');
    bg.value = p.querySelector('[data-k=big]').value;
    bg.dispatchEvent(new Event('change'));
    var sb=card.querySelector('[data-k=sub]');
    sb.value = p.querySelector('[data-k=sub]').value;
    fillOpts(card, bg.value, sb.value);
    ['[data-do]','[data-res]'].forEach(function(sel){
      var on=[].map.call(p.querySelectorAll(sel+' input:checked'), function(i){ return i.value; });
      [].forEach.call(card.querySelectorAll(sel+' input'), function(i){
        i.checked = on.indexOf(i.value)!==-1; });
    });
    var pl=p.querySelector('input[type=radio]:checked');
    if(pl){ var t=[].filter.call(card.querySelectorAll('input[type=radio]'),
              function(x){ return x.value===pl.value; })[0]; if(t) t.checked=true; }
    card.querySelector('[data-k=follow]').value = p.querySelector('[data-k=follow]').value;
  }
});

/* ── 修改被退回的紀錄 ──────────────────────────────────────────
   副理或總經理退回之後，翻譯要能真的改內容再送一次。
   原本這裡只有「送審給副理」一個按鈕，等於只能把一模一樣的東西再送一次。

   做法是把整筆載回原本的填寫表單，不另外做編輯畫面——
   服務細項連動、處理經過選項那些都是現成的，再做一份會變成維護兩套。 */

var EDIT_CODE = null;          // 不是 null 就代表「正在改這一筆」

function fireChange(el){
  if(el) el.dispatchEvent(new Event('change', { bubbles: true }));
}

/* 值在下拉選單裡就選它，不在就切到「其他」並填進輸入框 */
function setSelOrOther(sel, inp, v){
  if(!sel) return;
  v = (v || '').toString();
  var hit = [].some.call(sel.options, function(o){ return o.value === v; });
  if(hit){ sel.value = v; if(inp){ inp.value = ''; inp.style.display = 'none'; } }
  else if(inp){ sel.value = OTHER_; inp.value = v; inp.style.display = ''; }
  fireChange(sel);
}

function checkThese(card, sel, vals){
  var want = vals || [];
  [].forEach.call(card.querySelectorAll(sel + ' input'), function(i){
    i.checked = want.indexOf(i.value) !== -1;
  });
}

function fillFormFrom(d){
  resetForm();                           // 也會把 EDIT_CODE 清掉，所以先清再設
  hideBack();                            // 換成改別筆了，原本那條返回路徑已經不相干
  $('date').value = d.trip.date || '';
  $('target').value = d.trip.target || '工廠';
  fireChange($('target'));
  var md = document.querySelector('input[name=md][value="' + (d.trip.mode || '到場') + '"]');
  if(md){ md.checked = true; }
  try { syncMode(); } catch(e){}
  setClientValue(d.trip.client);
  try { applyPreset(); } catch(e2){}     // 移工姓名選單要先長出來
  if($('crew') && d.trip.crew) $('crew').value = d.trip.crew;
  if($('crewOwner')) $('crewOwner').value = d.trip.crewOwner || '';

  $('workers').innerHTML = '';
  d.workers.forEach(function(w){
    addWorker();
    var card = $('workers').lastElementChild;
    setSelOrOther(card.querySelector('[data-k=name]'),
                  card.querySelector('[data-k=nameOther]'), w.name);
    (w.lang || '').split('、').filter(String).forEach(function(l){
      var r = card.querySelector('input[name^=lg_][value="' + l + '"]');
      if(r) r.checked = true;
    });
    var bg = card.querySelector('[data-k=big]');
    if(bg){ bg.value = w.big; fireChange(bg); }
    var sb = card.querySelector('[data-k=sub]');
    if(sb){ sb.value = w.sub; }
    try { fillOpts(card, w.big, w.sub); } catch(e3){}
    checkThese(card, '[data-do]', w.did);
    checkThese(card, '[data-res]', w.res);
    ['dnote','rnote','fee','memo','follow'].forEach(function(k){
      var el = card.querySelector('[data-k=' + k + ']');
      if(el) el.value = w[k] || '';
    });
  });

  /* ⛔ 宣導場次要接回同一場。resetForm() 已經把 BRIEF 清掉了，
     沒有這一段的話畫面會退回「開始簽到，產生 QR」——
     按下去是開一場新的、換一個 QR，**已經簽好的人全部作廢**。
     這正是他 2026-09-21 遇到的事：存完檔要補簽，QR 卻死了。 */
  if(d.brief && d.brief.ok){
    briefShow(d.brief);
    if(isBrief()) fillPicks();
  }
}

function startEdit(recCode){
  google.script.run
    .withSuccessHandler(function(d){
      if(!d.canEdit){ toast('這一筆現在不能修改（' + d.status + '）', true); return; }
      fillFormFrom(d);
      restoreSigs(recCode);
      EDIT_CODE = recCode;
      $('ebCode').textContent = recCode;
      $('ebWhy').textContent = d.reject || '';
      $('ebWhy').style.display = d.reject ? '' : 'none';
      $('editBar').style.display = '';
      $('save').textContent = '儲存修改';
      try { closeReview(); } catch(e){}
      document.querySelector('.tabs button[data-t=new]').click();
      window.scrollTo(0, 0);
      toast('已載入，改完按「儲存修改」');
    })
    .withFailureHandler(function(e){ toast(e.message, true); })
    .getServiceLogForEdit(CODE, recCode);
}

/* 把原本的簽名畫回框裡。
   ⛔ 不做的話三個框都是空的，看起來像「簽名不見了」——
      而他很可能因此重簽，重簽會真的覆寫掉移工當場簽的那一張。
   ⚠ 資料來源是 RV_DETAIL（審核視窗剛剛顯示過同一筆），
      不是後端的 getServiceLogForEdit——那一支沒有回傳簽名。
      這樣就不用改後端、不用部署。
   ⚠ 塞進去的是雲端硬碟網址；後端只認 data:image 開頭的才算重簽，
      所以原封不動存回去不會多存一份。 */
function restoreSigs(recCode){
  var d = RV_DETAIL;
  if(!d || !d.trip || d.trip.code !== recCode) return;
  var set = function(sel, url){
    if(!url) return;
    var box = document.querySelector(sel);
    if(box && box.__sig) box.__sig.set(url);
  };
  set('[data-sig=employer]', d.trip.sigEmployer);
  set('[data-sig=staff]', d.trip.sigStaff);
  var ws = d.workers || [];
  [].forEach.call($('workers').children, function(c, i){
    var w = ws[i];
    if(w && w.sigWorker){
      var box = c.querySelector('[data-sig=worker]');
      if(box && box.__sig) box.__sig.set(w.sigWorker);
    }
  });
  /* 框裡有東西了，但那是「原本的」不是「剛簽的」——講清楚，
     不然他會以為自己已經重簽過。 */
  [].forEach.call(document.querySelectorAll('#p-new .sig .pad.on'), function(p){
    if(!p.querySelector('.sigold')){
      var tag = document.createElement('span');
      tag.className = 'sigold';
      tag.textContent = '原本的簽名　要換就點一下重簽';
      p.appendChild(tag);
    }
  });
}

function endEdit(){
  EDIT_CODE = null;
  $('editBar').style.display = 'none';
  $('save').textContent = '儲存';
}
$('ebCancel').addEventListener('click', function(){
  endEdit();
  resetForm();
  document.querySelector('.tabs button[data-t=follow]').click();
});


/* ── 儲存 ─────────────────────────────── */
/* 把表單收成後端要的形狀。驗不過回 null（訊息已經 toast 出去了）。
   抽出來是因為「儲存修改」要用同一份——兩邊各寫一次，
   哪天改了欄位卻只改一邊，送出去的資料就會不一樣。 */
/* 這張表還是不是從那筆行程來的？
   ⛔ SCHED_ID 一旦設了就只有整個 App 重載才會清。所以「點了一張卡、
   退回去、改填另一筆」的時候它還留著，存檔就會把新紀錄掛到舊那張卡上——
   舊卡被誤標成已完成，顯示的雇主又還是舊的（後端只寫狀態與代碼，
   不同步雇主移工）。2026-09-19 實機上就是這樣跑出「點黃秀英開出鉅鋐」。
   對不上就不要掛，後端會自己補一列正確的，舊那張預排也留著。 */
function schedLink_(){
  if(!SCHED_ID) return '';
  var r = (typeof CAL_ROWS !== 'undefined' ? CAL_ROWS : [])
            .filter(function(x){ return x.id === SCHED_ID; })[0];
  if(!r) return SCHED_ID;          // 查不到就別自作聰明，維持原本的行為
  return (r.client === clientVal() && r.date === $('date').value) ? SCHED_ID : '';
}

function collectForm(){
  var trip = {
    date: $('date').value,
    mode: (document.querySelector('input[name=md]:checked')||{}).value||'到場',
    target: $('target').value, client: clientVal(), place: '',
    crew: $('crew').value, crewOwner: $('crewOwner').value,
    brief: BRIEF ? BRIEF.token : '', sched: schedLink_(),
    sigEmployer: sigOf(document.querySelector('[data-sig=employer]')),
    sigStaff: sigOf(document.querySelector('[data-sig=staff]'))
  };
  var workers=[], bad=0;
  [].forEach.call($('workers').children, function(c){
    var g=function(k){ var el=c.querySelector('[data-k='+k+']'); return el?el.value.trim():''; };
    if(!g('big')||!g('sub')){ bad++; return; }
    workers.push({
      name:nameOf(c),
      lang: langsOf(c),
      big:g('big'), sub:g('sub'),
      did:[].map.call(c.querySelectorAll('[data-do] input:checked'),function(i){return i.value;}),
      dnote:g('dnote'),
      res:[].map.call(c.querySelectorAll('[data-res] input:checked'),function(i){return i.value;}),
      rnote:g('rnote'), fee:g('fee'), follow:'', memo:g('memo'),
      sig: sigOf(c.querySelector('[data-sig=worker]'))
    });
  });
  if(!workers.length){ toast('每位移工都要選服務類別與細項', true); return null; }
  return { trip: trip, workers: workers };
}

$('save').addEventListener('click', function(){
  var f = collectForm();
  if(!f) return;
  var trip = f.trip, workers = f.workers;
  var b=$('save'); b.disabled=true;

  /* 修改模式：覆寫既有那幾列，不要新增一筆。
     這裡走錯分支的後果是同一趟服務在表上出現兩次，統計與評鑑都會多算。 */
  if(EDIT_CODE){
    var editing = EDIT_CODE;
    toast('儲存修改中…');
    google.script.run
      .withSuccessHandler(function(r){
        b.disabled=false;
        endEdit();
        resetForm();
        calBust(); revBust();
        toast(r.changed ? ('已修改 '+r.changed+' 處，記得再送審') : '內容沒有變動');
        document.querySelector('.tabs button[data-t=follow]').click();
        loadReview();
      })
      .withFailureHandler(function(e){ b.disabled=false; toast(e.message, true); })
      .updateServiceLog(CODE, editing, trip, workers);
    return;
  }

  /* ⛔ 先存進手機，再送後端。順序不能反——先送的話，
     App 在送出過程中被切掉（電話進來、沒電、手滑關掉）就什麼都不剩。
     最壞的情況要是「還在手機裡」，不是「整份不見」。 */
  trip.cid = OB.newCid();
  var job = { cid: trip.cid, at: Date.now(), code: CODE,
              trip: trip, workers: workers, tries: 0, err: '' };
  toast('儲存中…');
  OB.put(job).then(function(){
    obSend(job, function(r){
      b.disabled = false;
      calBust(); revBust();     // 那一趟會從「待處理」變「已完成」，送審清單也多一筆
      try{ showSaved(r.code); }
      catch(err){ toast('已存檔（'+r.code+'），但畫面沒換過來：'+err.message, true); }
    }, function(msg, keep){
      b.disabled = false;
      if(keep){
        /* ⛔ 2026-10-04 之前這裡是 resetForm()，理由是「清空讓他做下一家，
           不然他會以為沒存到而重打一次」。他實際用下來的回報剛好相反：
           **畫面突然全空，更像是沒存到**。而且上面那條橘色的
           「1 筆還在手機裡」已經講得很清楚。
           改成：欄位全部留著，但把儲存鈕鎖起來，旁邊給一顆「做下一家」。
           ⚠ 鎖起來是必要的——表單還在，再按一次儲存會排出**第二筆**。
              cid 只防同一次送出的重試，不防他重新按。 */
        offlineHold();
        toast('沒訊號，已存在手機裡，有訊號會自動送出', true);
      } else {
        toast(msg, true);
      }
      obPaint();
    });
  }).catch(function(){
    /* 連手機都存不進去（無痕模式、空間滿了）——那就退回原本的直送，
       ⚠ 不要假裝存好了。 */
    google.script.run
      .withSuccessHandler(function(r){
        b.disabled=false; calBust(); revBust();
        try{ showSaved(r.code); }catch(err){ toast('已存檔（'+r.code+'）', true); }
      })
      .withFailureHandler(function(e){ b.disabled=false; toast(e.message, true); })
      .saveServiceLog(CODE, trip, workers);
  });
});

/* ── 待送出的表：送、重試、顯示 ───────────────────────────
   規則寫在 outbox.js 開頭，改這裡之前先讀那一段。 */
var OB_BUSY_ = false;

function obSend(job, ok, bad){
  google.script.run
    .withSuccessHandler(function(r){
      /* ⛔ 一定要等後端回「寫好了」才從手機刪掉。
         先刪再送 = 送失敗就永遠不見。 */
      OB.del(job.cid).then(function(){ obPaint(); });
      ok(r);
    })
    .withFailureHandler(function(e){
      var msg = (e && e.message) || '';
      var keep = obIsNetwork(msg);
      job.tries = (job.tries || 0) + 1;
      job.err = msg;
      if(keep && job.tries >= OB.MAX_TRY){
        /* ⚠ 試太多次還是不行，就不要再安靜地試下去——
           讓它留著但停手，畫面上寫出原因，由人決定。 */
        keep = true; job.stopped = true;
      }
      if(keep){ OB.put(job).then(function(){ obPaint(); }); }
      else { OB.del(job.cid).then(function(){ obPaint(); }); }
      bad(msg || '送不出去', keep);
    })
    .saveServiceLog(job.code || CODE, job.trip, job.workers);
}

/* 把手機裡還沒送出去的都送一遍。
   ⚠ 一次只送一筆。工廠的訊號本來就不好，同時送三筆只會三筆一起失敗，
     而且簽名圖都很大。 */
/* ⛔ 補送成功要講出來。2026-09-22 的檢視發現：成功的時候
   「待上傳 N 筆」那條列只是 display:none 消失，什麼都不說——
   **他無法分辨「送成功了」跟「資料不見了」**，而這兩件事的後果差很多。
   ⚠ 只在整批送完的時候講一次，不要每送一筆跳一次。 */
var OB_SENT_ = 0;
function obFlush(){
  if(OB_BUSY_ || !CODE) return;
  OB.all().then(function(list){
    var pend = list.filter(function(j){ return !j.stopped; });
    if(!pend.length){
      if(OB_SENT_){
        toast('補送完成　' + OB_SENT_ + ' 筆已經送出去了');
        OB_SENT_ = 0;
      }
      obPaint(); return;
    }
    OB_BUSY_ = true;
    var j = pend[0];
    obSend(j, function(){
      OB_BUSY_ = false;
      OB_SENT_++;
      calBust(); revBust();
      obPaint();
      obFlush();                      // 還有就接著送
    }, function(){
      OB_BUSY_ = false;               // 失敗就停在這裡，等下一次觸發
      /* ⚠ 停下來就把計數歸零。不歸零的話，下次成功會報
         「補送完成 8 筆」——那個 8 是跨了好幾次嘗試累積的，是錯的。 */
      OB_SENT_ = 0;
      obPaint();
    });
  }).catch(function(){ OB_BUSY_ = false; });
}

/* 畫面上那一條「待上傳 N 筆」。
   ⛔ 沒有這一條的話，表在手機裡他完全不知道，會以為存丟了而重打一次。 */
function obPaint(){
  var box = $('obBar'); if(!box) return;
  OB.all().then(function(list){
    if(!list.length){ box.style.display = 'none'; box.innerHTML = ''; return; }
    var stop = list.filter(function(j){ return j.stopped; });
    box.style.display = '';
    box.className = 'obbar' + (stop.length ? ' bad' : '');
    box.innerHTML =
      '<div class="obh"><b>' + list.length + ' 筆還在手機裡</b>' +
        '<button type="button" id="obGo">' +
          (OB_BUSY_ ? '送出中…' : '立即送出') + '</button></div>' +
      list.map(function(j){
        return '<div class="ob1"><span class="c">' +
          esc((j.trip && j.trip.client) || '—') + '　' +
          esc((j.trip && j.trip.date) || '') + '</span>' +
          '<span class="s">' + (j.stopped
            ? ('送不出去：' + esc((j.err || '').slice(0, 40)))
            : (j.tries ? ('試過 ' + j.tries + ' 次') : '等訊號')) + '</span></div>';
      }).join('') +
      (stop.length ? '<p class="hint">送不出去的那幾筆要人處理：' +
        '確認網路之後按「立即送出」，還是不行就截圖給佑彬。</p>' : '');
    var g = $('obGo');
    if(g) g.addEventListener('click', function(){
      /* 手動按的話，連之前放棄的那幾筆也重新試一次 */
      OB.all().then(function(l2){
        return Promise.all(l2.map(function(j){
          if(!j.stopped) return null;
          j.stopped = false; j.tries = 0; return OB.put(j);
        }));
      }).then(obFlush);
    });
  });
}

/* 什麼時候送：一連上網、回到 App、每 30 秒各試一次。
   ⚠ 三個都要。只靠 online 事件的話，手機從「訊號極差」變成「還可以」
     不會觸發任何事件——那正是工廠裡最常見的狀態。 */
window.addEventListener('online', obFlush);
document.addEventListener('visibilitychange', function(){
  if(!document.hidden) obFlush();
});
setInterval(obFlush, 30000);
/* ── 預覽：把每位移工的經過與結果翻成他的母語 ───────────────
   簽名之前先給他看，不然他等於在簽一份看不懂的東西。 */
/* 一般服務是單選、宣導是複選，統一回傳字串（多語用「、」串起來） */
function langsOf(card){
  var v = [].map.call(card.querySelectorAll('input[name^=lg_]:checked'),
                      function(i){ return i.value; });
  return v.join('、');
}
/* 中文譯名 → 原文名。移工自己認得的是原文，表上要並列。 */
function origOf(name){
  var pz = presetOf(clientVal());
  if(!pz) return '';
  var hit = pz.w.filter(function(w){ return w.n === name; })[0];
  return hit ? (hit.o || '') : '';
}
function nameOf(card){
  var sel = card.querySelector('[data-k=name]');
  var oth = card.querySelector('[data-k=nameOther]');
  if(!sel) return '';
  return sel.value === OTHER_ ? oth.value.trim() : sel.value;
}
function collectWorkers(){
  var out=[];
  [].forEach.call($('workers').children, function(c){
    var g=function(k){ var el=c.querySelector('[data-k='+k+']'); return el?el.value.trim():''; };
    if(!g('big')||!g('sub')) return;
    out.push({
      name:nameOf(c),
      lang: langsOf(c),
      big:g('big'), sub:g('sub'),
      did:[].map.call(c.querySelectorAll('[data-do] input:checked'),function(i){return i.value;}),
      dnote:g('dnote'),
      res:[].map.call(c.querySelectorAll('[data-res] input:checked'),function(i){return i.value;}),
      rnote:g('rnote'), fee:g('fee'), follow:'', memo:g('memo'),
      el:c
    });
  });
  return out;
}

$('preview').addEventListener('click', function(){
  var ws = collectWorkers();
  if(!ws.length){ toast('每位移工都要選服務類別與細項', true); return; }
  var b=$('preview'); b.disabled=true;
  $('pvBody').innerHTML='<div class="mid">翻譯中…</div>';
  $('pvModal').style.display='';

  var done=0, blocks=new Array(ws.length);
  ws.forEach(function(w,i){
    // 服務項目、經過、結果一起送去翻，移工才看得懂自己要簽的是什麼
    var lines=[], iCat=0, iDo=-1, iRes=-1;
    lines.push(w.big+' ／ '+w.sub);
    var doTxt='', resTxt='';
    if(w.did.length) doTxt = w.did.join('、')+(w.dnote?'。'+w.dnote:'');
    else if(w.dnote) doTxt = w.dnote;
    if(w.res.length) resTxt = w.res.join('、')+(w.rnote?'。'+w.rnote:'');
    else if(w.rnote) resTxt = w.rnote;
    if(doTxt){ iDo=lines.length; lines.push(doTxt); }
    if(resTxt){ iRes=lines.length; lines.push(resTxt); }

    function render(tr, langList){
      var meta=[];
      if(w.lang) meta.push(w.lang.split('、').join(' · '));
      var tgt=$('target').value; if(tgt) meta.push(tgt);
      var sb = w.el.querySelector('[data-sig=worker]');
      var su = (sb && sb.__sig) ? sb.__sig.data() : '';
      function seg(lab,en,val,idx,hi){
        var h='<div class="seg"><div class="k">'+lab+
              (en?'<s>'+en+'</s>':'')+'</div>'+
              '<div class="v">'+esc(val)+'</div>';
        (langList||[]).forEach(function(lg){
          var line = tr && tr[lg] && tr[lg][idx];
          if(line) h += '<div class="t'+(hi?' hi':'')+'">'+
            (langList.length>1?'<em>'+esc(lg)+'</em>':'')+esc(line)+'</div>';
        });
        return h+'</div>';
      }
      // 追蹤與否由主管在表上勾，翻譯人員不填
      var ex=[];
      if(w.fee) ex.push('費用 '+w.fee);
      if(w.memo) ex.push(w.memo);
      var tags = ex.length ? '<span class="ex">'+esc(ex.join('　·　'))+'</span>' : '';

      var h='<div class="wsec">'+
        '<div class="band"><i>'+(i+1)+'</i>'+
          '<b>'+esc(w.name||'(未填姓名)')+'</b>'+
          (origOf(w.name)?'<span class="orig">'+esc(origOf(w.name))+'</span>':'')+
          (meta.length?'<em>'+esc(meta.join(' · '))+'</em>':'')+'</div>'+
        seg('服務項目','Service Item', lines[iCat], iCat, true);
      if(doTxt) h+=seg('處理經過','Process', doTxt, iDo);
      if(resTxt) h+=seg('處理結果','Result', resTxt, iRes);
      if(!doTxt && !resTxt) h+=seg('處理情形','', '還沒勾處理經過與結果', '');
      h+=(tags?'<div class="tags">'+tags+'</div>':'')+
         '<div class="wsig"><div class="ln">'+(su?'<img src="'+su+'">':'')+'</div>'+
         '<div class="k">移工簽名<s>Employee</s></div></div>'+
         '</div>';
      blocks[i]=h;
      if(++done===ws.length) paint();
    }

    // 語別可能有多個（宣導現場同時有越、泰、印、菲），
    // 每一種各翻一次，最後照選的順序疊在中文底下。
    var langs = (w.lang || '').split('、').filter(String);
    if(!langs.length || lines.length===1){ render(null); return; }
    var got = {}, left = langs.length;
    langs.forEach(function(lg){
      google.script.run
        .withSuccessHandler(function(tr){ got[lg] = tr; if(--left === 0) render(got, langs); })
        .withFailureHandler(function(){ if(--left === 0) render(got, langs); })
        .translateServiceText(CODE, lines, lg);
    });
  });

  function th(zh,en){ return '<th><i>'+zh+'</i><s>'+en+'</s></th>'; }

  function paint(){
    var names = ws.map(function(w){ return w.name||'(未填姓名)'; });
    var mode = (document.querySelector('input[name=md]:checked')||{}).value||'';
    // 表上只印翻譯人員。代理人員是內部備註，留在試算表就好，
    // 印在給雇主的表上反而讓人困惑。
    var who = $('crew').value || STAFF_NAME || '—';
    var blank = '本次服務紀錄記載至此。';
    var sigE = sigOf(document.querySelector('[data-sig=employer]'));
    var sigS = sigOf(document.querySelector('[data-sig=staff]'));

    $('pvBody').innerHTML =
      '<div class="fit"><div class="sheet">'+
        '<div class="sh"><b>客戶服務紀錄表</b>'+
          '<span>紀錄編號<u>存檔後產生</u></span></div>'+
        '<div class="strip">'+
          '<div class="it"><span class="lb">服務日期</span>'+
            '<span class="vl">'+esc($('date').value||'—')+'</span></div>'+
          '<div class="it"><span class="lb">服務方式</span><span class="mode">'+
            '<span class="'+(mode==='到場'?'on':'')+'"><i>'+(mode==='到場'?'■':'□')+'</i>到場</span>'+
            '<span class="'+(mode==='電話'?'on':'')+'"><i>'+(mode==='電話'?'■':'□')+'</i>電話</span>'+
          '</span></div>'+
        '</div>'+
        '<table class="hd">'+
          '<tr>'+th('雇主姓名','Employer Name')+'<td>'+esc(clientVal()||'—')+'</td>'+
                 th('移工姓名','Employee Name')+'<td>'+
                 esc(names.length>1?('共 '+names.length+' 位'):names[0])+'</td>'+
                 th('客服人員','Service Crew')+'<td>'+esc(who)+'</td></tr>'+
        '</table>'+
        blocks.join('')+
        '<div class="blank">'+esc(blank)+'<hr><span>以下空白</span></div>'+
        '<div class="srow">'+
          '<div><div class="ln">'+(sigE?'<img src="'+sigE+'">':'')+'</div>'+
            '<div class="k">雇主簽名<s>Employer</s></div></div>'+
          '<div><div class="ln">'+(sigS?'<img src="'+sigS+'">':'')+'</div>'+
            '<div class="k">客服人員<s>Service Crew</s></div></div>'+
        '</div>'+
        '<div class="boss"><div class="o"><div class="k">主管批示　SUPERVISOR</div>'+
            '<div><span class="bx">□</span>不需追蹤</div>'+
            '<div><span class="bx">□</span>需追蹤後續：'+
              '<u style="display:inline-block;width:58%;border-bottom:1px solid #111">'+
              '&nbsp;</u></div>'+
          '</div><div class="seal">主管簽章<u></u></div></div>'+
      '</div></div>';
    PV_ZOOM = false;
    relayoutPv();
    b.disabled=false;
  }
});

/* ── 預覽的縮放 ─────────────────────────────
   紙張是固定 A4 的 794px 寬，再照畫面寬度整張等比縮小，
   版型才不會因為螢幕窄就被擠到換行、跟設計稿對不起來。 */
var PV_ZOOM = false;
function fitSheet(){
  var fit = $('pvBody').querySelector('.fit');
  if(!fit) return;
  var sh = fit.querySelector('.sheet');
  // 量「內容區」的寬度而不是含 padding 的容器寬，不然會差一圈、右邊被切掉
  var avail = fit.clientWidth || $('pvBody').clientWidth;
  var base = Math.min(1, avail / sh.offsetWidth);
  var k = PV_ZOOM ? Math.min(1, base * 2.2) : base;
  sh.style.transformOrigin = 'top left';
  sh.style.transform = 'scale('+k+')';
  // 高寬都要跟著縮放後的尺寸走，放大時外層才會出現捲軸
  fit.style.height = Math.ceil(sh.offsetHeight * k) + 'px';
  fit.style.width  = Math.ceil(sh.offsetWidth  * k) + 'px';
}
function relayoutPv(){
  // 版面畫完才量得準，所以排到下一個影格
  requestAnimationFrame(function(){ requestAnimationFrame(fitSheet); });
}
window.addEventListener('resize', function(){
  if($('pvModal').style.display !== 'none') fitSheet();
});
/* 點兩下放大／還原。手機沒有 dblclick，所以自己判兩次點擊的間隔。 */
function togglePvZoom(){ PV_ZOOM = !PV_ZOOM; fitSheet(); }
$('pvBody').addEventListener('dblclick', togglePvZoom);
var lastTap = 0;
$('pvBody').addEventListener('touchend', function(e){
  var t = Date.now();
  if(t - lastTap < 320){ e.preventDefault(); togglePvZoom(); lastTap = 0; }
  else lastTap = t;
});

/* ── 存檔完成 ─────────────────────────────────────────────
   2026-09-18 改版。原本存完會蓋一層面板，裡面四顆按鈕；而同一個面板
   也服務「從行事曆調一份舊 PDF」那條路徑，結果兩條路各有一半按鈕用不到
   （從行事曆進來時，送審、清空表單、回行事曆三顆都是多餘的）。

   拆成兩個各自單純的東西：
     · 填寫頁存完 → 底部那一排就地換內容，不跳第二層
     · 行事曆按 PDF → 只有 PDF 的小面板

   「回行事曆」拿掉了：底部分頁列本來就有那一格，同一件事不需要兩個入口。
   「清空」與「完成，清空表單」合併成一顆「完成」，同一個位置、同一顆按鈕。 */
var DONE_CODE_ = '';

/* PDF 的結果卡。還沒產生時那一格是一顆按鈕，產生後就地變成檔案本身——
   不要一個按鈕再配一塊結果，那是同一件事佔兩個位置。 */
function pdfCardHtml(r, reId){
  var msg = '服務紀錄表 ' + r.name.replace(/\.pdf$/,'') + String.fromCharCode(10) + r.url;
  return '<div class="pdfbox">' +
    '<div class="fn"><b>' + esc(r.name) + '</b></div>' +
    '<div class="lks">' +
      '<a href="' + esc(r.url) + '" target="_blank" rel="noopener">開啟 PDF</a>' +
      '<a href="https://line.me/R/msg/text/?' + encodeURIComponent(msg) +
        '" target="_blank" rel="noopener">分享到 LINE</a>' +
      '<a class="cp" data-u="' + esc(r.url) + '">複製連結</a>' +
      (reId ? '<a class="re" id="' + reId + '">重新產生</a>' : '') +
    '</div></div>';
}

function bindCopy(slot){
  var c = slot.querySelector('.cp');
  if(!c) return;
  c.addEventListener('click', function(){
    var t = document.createElement('textarea');
    t.value = this.dataset.u; document.body.appendChild(t); t.select();
    try{ document.execCommand('copy'); toast('連結已複製'); }
    catch(e){ toast('複製失敗，請長按連結複製', true); }
    t.remove();
  });
}

/* 產生 PDF。兩條路徑共用，差別只在結果放進哪一個容器。
   force=false 會沿用已經產好的那一份，不要每按一次就在雲端硬碟多一個檔。 */
function makePdf(recCode, force, slot, reId){
  slot.innerHTML = '<div class="pdfbox"><p class="wait">正在把紀錄轉成 PDF，約 10 秒…</p></div>';
  google.script.run
    .withSuccessHandler(function(r){
      slot.innerHTML = pdfCardHtml(r, reId);
      bindCopy(slot);
      if(reId && $(reId)){
        $(reId).addEventListener('click', function(){ makePdf(recCode, true, slot, reId); });
      }
    })
    .withFailureHandler(function(e){
      slot.innerHTML = '<div class="pdfbox"><p class="err">' + esc(e.message) + '</p>' +
        '<div class="lks"><a class="rt">再試一次</a></div></div>';
      slot.querySelector('.rt').addEventListener('click', function(){
        makePdf(recCode, force, slot, reId);
      });
    })
    .exportServiceSheetPdf(CODE, recCode, force);
}

/* ── 填寫頁：存完就地換那一排 ──────────────────────────
   原本的三顆按鈕只是藏起來，不是砍掉重建——事件監聽器還在，不用重掛。 */
function svDoneBox(){
  var box = $('svDone');
  if(box) return box;
  box = document.createElement('div');
  box.id = 'svDone';
  box.className = 'svdone';
  box.style.display = 'none';
  box.innerHTML =
    '<p class="savedln" id="svStat"></p>' +
    '<div class="stack">' +
      '<button type="button" class="p full" id="svSubmit">送給副理審閱</button>' +
      '<div class="full" id="svPdfSlot"></div>' +
      '<button type="button" class="q full" id="svClose">完成</button>' +
    '</div>' +
    '<p class="note" id="svWhy" style="display:none"></p>';
  $('save').parentNode.insertAdjacentElement('afterend', box);

  /* 「完成」才是這一趟真正結束。單純按「清空」不收返回列——
     返回列講的是「你從哪裡進來的」，清空並沒有改變這件事，
     收掉反而讓人失去回頭路。 */
  $('svClose').addEventListener('click', function(){
    hideSaved(); hideBack(); resetForm();
  });
  /* 同一顆按鈕兩種身分：內容跟存檔一致時送審，改過了就先存起來。
     位置不變，人不用去別的地方找「再存一次」在哪。 */
  $('svSubmit').addEventListener('click', function(){
    var b = $('svSubmit'); b.disabled = true;
    if(DIRTY_){
      var f = collectForm();
      if(!f){ b.disabled = false; return; }
      toast('儲存修改中…');
      google.script.run
        .withSuccessHandler(function(r){
          DIRTY_ = false; paintSaved();
          calBust(); revBust();
          toast(r && r.changed ? ('已存下 ' + r.changed + ' 處修改') : '已儲存');
        })
        .withFailureHandler(function(e){ b.disabled = false; toast(e.message, true); })
        .updateServiceLog(CODE, DONE_CODE_, f.trip, f.workers);
      return;
    }
    google.script.run
      .withSuccessHandler(function(){
        SUBMITTED_ = true; DIRTY_ = false; paintSaved();
        toast('已送給副理審閱'); revBust(); calBust(); refreshBadge();
      })
      .withFailureHandler(function(e){ b.disabled = false; toast(e.message, true); })
      .submitForReview(CODE, DONE_CODE_);
  });
  return box;
}

/* 存過之後又動了東西。送審與 PDF 在這個狀態要停用——
   不然送出去的、印出來的是舊內容，而人以為是新的。 */
var DIRTY_ = false;

/* 沒訊號暫存之後：欄位留著、儲存鈕鎖住、旁邊給一顆「做下一家」。
   動了任何一格就解鎖——那代表他真的要改這一筆，不是要開新的。 */
/* 改單要搬日期的時候問一句。回 false 就是他說不要。
   ⛔ 兩條路都要用：點卡片進去改、左滑按「改」。
      只擋一條等於沒擋。 */
function askMoveDate(id, newDate){
  var r = (CAL_ROWS || []).filter(function(x){ return x.id === id; })[0];
  if(!r || !r.date || !newDate || r.date === newDate) return true;
  return confirm(
    '這一趟要從 ' + r.date + ' 搬到 ' + newDate + ' 嗎？\n\n' +
    (r.client || '') + (r.workers ? ('　' + r.workers) : '') + '\n' +
    (r.crew ? (r.crew + ' 手機上的這一筆會換到新的那一天。')
            : (r.sug ? ('建議給 ' + r.sug + '，他看到的也會換天。') : '')));
}

var HOLD_ = false;
function offlineHold(){
  HOLD_ = true;
  var sv = $('save');
  if(sv){ sv.disabled = true; sv.textContent = '已存在手機裡'; }
  if(!$('holdNext')){
    var row = sv && sv.closest('.btns');
    if(row) row.insertAdjacentHTML('afterbegin',
      '<button type="button" id="holdNext">做下一家</button>');
    var nx = $('holdNext');
    if(nx) nx.onclick = function(){ offlineRelease(); resetForm(); };
  }
  var nx2 = $('holdNext'); if(nx2) nx2.style.display = '';
}
function offlineRelease(){
  if(!HOLD_) return;
  HOLD_ = false;
  var sv = $('save');
  if(sv){ sv.disabled = false; sv.textContent = EDIT_CODE ? '儲存修改' : '儲存'; }
  var nx = $('holdNext'); if(nx) nx.style.display = 'none';
}
/* 使用者動了表單就解鎖。⚠ 用捕獲階段綁在整頁上，一個地方就攔得到，
   不用每個欄位各綁一次（新加的移工卡也涵蓋得到）。 */
document.addEventListener('input', function(e){
  if(HOLD_ && e.target && e.target.closest && e.target.closest('#p-new')) offlineRelease();
}, true);
document.addEventListener('change', function(e){
  if(HOLD_ && e.target && e.target.closest && e.target.closest('#p-new')) offlineRelease();
}, true);
var SUBMITTED_ = false;   // 這一筆在這個畫面按過送審了

function markDirty(){
  if(DIRTY_) return;
  var box = $('svDone');
  if(!box || box.style.display === 'none') return;   // 還沒存過就沒有「改了還沒存」
  DIRTY_ = true;
  paintSaved();
}

/* 存過之後那一區長什麼樣，完全由 DIRTY_ 決定。
   只改文字與狀態，不重建元素——按鈕的事件監聽器是建立時掛上去的。 */
function paintSaved(){
  var code = DONE_CODE_;
  /* 送出去之後就不能改了（後端的 canEdit 只認「未送審／退回補正」）。
     與其讓人按一次「儲存修改」再吃一個錯誤訊息，這裡直接講清楚
     為什麼不能改、以及怎麼辦。 */
  if(SUBMITTED_){
    $('svStat').className = 'savedln lock';
    $('svStat').innerHTML = '<span class="tick">🔒</span><span><b>已送審，等副理審閱</b>' +
      '<span class="wh">　·　' + esc(code) + '</span></span>';
    $('svSubmit').className = 'full';
    $('svSubmit').textContent = '已送審';
    $('svSubmit').disabled = true;
    $('svWhy').textContent = '送審之後不能修改。要改的話，請等副理退回補正。';
    $('svWhy').style.display = '';
    $('svClose').textContent = '完成';
    return;
  }
  if(DIRTY_){
    $('svStat').className = 'savedln warn';
    $('svStat').innerHTML = '<span class="tick">！</span><span><b>改了還沒存</b>' +
      '<span class="wh">　·　' + esc(code) + '　按一次「儲存修改」才算數</span></span>';
    $('svSubmit').className = 'w full';
    $('svSubmit').textContent = '儲存修改';
    $('svSubmit').disabled = false;
    $('svPdfSlot').innerHTML =
      '<button type="button" disabled>輸出 PDF 給雇主</button>';
    $('svWhy').textContent = '存好之前不能送審、也不能輸出 PDF——那會送出舊的內容。';
    $('svWhy').style.display = '';
    $('svClose').textContent = '放棄修改';
  } else {
    $('svStat').className = 'savedln';
    $('svStat').innerHTML = '<span class="tick">✓</span><span>已儲存　<b>' + esc(code) +
      '</b><span class="wh">　·　在行事曆的今天找得到</span></span>';
    $('svSubmit').className = 'p full';
    $('svSubmit').textContent = '送給副理審閱';
    $('svSubmit').disabled = false;
    $('svPdfSlot').innerHTML =
      '<button type="button" class="sec" id="svPdf">輸出 PDF 給雇主</button>' +
      '<button type="button" class="sec full" id="svTrack" style="margin-top:8px">' +
      '掛到追蹤案件</button>';
    $('svPdf').addEventListener('click', function(){
      makePdf(code, false, $('svPdfSlot'), 'svRe');
    });
    $('svTrack').addEventListener('click', function(){
      /* ⛔ 這裡以前送的是 PICKED_ 與 PICK_LG ——那是「移工名冊挑人視窗」的
         勾選與語別篩選，不是這張表上實際填的人。翻譯直接在移工卡打名字
         （沒走那個視窗）時 PICKED_ 是空的，開出來的案件就沒有移工。
         而且 sub 與 target 根本沒傳，target 用預設的「工廠」——
         2026-09-19 張寶華（家庭雇主）那件記成工廠就是這裡來的。
         直接從表單讀，collectForm 已經在做這件事，不要再寫第三份。 */
      var f = collectForm();          // 剛存過的表單一定是有效的
      var w = (f && f.workers) || [];
      var uniq = function(a){ var o = []; a.forEach(function(x){
        if(x && o.indexOf(x) === -1) o.push(x); }); return o.join('、'); };
      openPick({
        rc: code, go: SCHED_ID || '',
        target: (f && f.trip.target) || $('target').value || '',
        client: (f && f.trip.client) || clientVal() || '',
        workers: uniq(w.map(function(x){ return x.name; })),
        lang: uniq(w.map(function(x){ return x.lang; })),
        big: (w[0] || {}).big || '', sub: (w[0] || {}).sub || ''
      });
    });
    $('svWhy').style.display = 'none';
    $('svClose').textContent = '完成';
  }
}

function showSaved(code){
  /* 從案件按「＋新增服務紀錄」進來的，存完自動掛回那個案件，
     不用再去案件頁選一次。掛失敗不能擋住存檔——表已經存好了，
     掛不上頂多是少一條關聯，講一聲讓人自己補。 */
  if(CASE_FOR_){
    (function(cid){
      google.script.run
        .withSuccessHandler(function(){ toast('已掛回 ' + cid); TK_ROWS = []; TK_LOADED = ''; })
        .withFailureHandler(function(e){
          toast('存好了，但沒掛回 ' + cid + '：' + e.message, true);
        })
        .attachRecord(CODE, cid, code);
    })(CASE_FOR_);
    CASE_FOR_ = '';
  }
  DONE_CODE_ = code;
  if(BACK_) BACK_.rec = code;   // 存完卡片會掉 data-go，用紀錄編號才找得回來
  DIRTY_ = false;
  SUBMITTED_ = false;
  var box = svDoneBox();
  paintSaved();
  $('save').parentNode.style.display = 'none';
  box.style.display = '';
  /* toast 給當下的回饋，上面那一行常駐字負責「之後還看得到」。
     兩層都要：toast 會消失，人低頭處理別的事很容易錯過。 */
  toast('已儲存　' + code);
}

function hideSaved(){
  var box = $('svDone');
  if(box) box.style.display = 'none';
  $('save').parentNode.style.display = '';
  DIRTY_ = false;
  SUBMITTED_ = false;
}

/* 那一行事實（客戶、幾位移工）住在 .smbox 底下的第一個 <p>。

   ⚠️ 不要再用 $('dnCnt').parentNode 去拿它。原本的 HTML 是
   `<p>共 <b id="dnCnt">0</b> 位移工…</p>`，而下面會設 p.textContent ——
   那會把 <b id="dnCnt"> 本身一起清掉，所以只有第一次拿得到，
   第二次 $('dnCnt') 就是 null，整個面板打不開。
   2026-09-17 我自己寫出來的，使用者存第二筆才炸出來。
   改成用結構位置去拿，跟那個 <b> 還在不在無關。 */
function dnFactsEl(){
  var m = $('doneModal');
  return m ? m.querySelector('.smbox > p') : null;
}

/* 表單裡任何一個欄位動了就標記。用捕獲階段掛在整個填寫頁上，
   新增的移工卡片不用另外再掛一次。
   存過之前 markDirty() 是空操作，所以填寫過程不受影響。 */
(function(){
  var host = $('p-new');
  if(!host) return;
  host.addEventListener('input', markDirty, true);
  host.addEventListener('change', markDirty, true);
})();

/* ── 行事曆：只有 PDF 的小面板 ──────────────────────────
   這條路徑是來拿檔案的，不是剛存完。沒有送審（卡片上就有那顆）、
   沒有清空（沒有表單可清）、沒有回行事曆（人就在行事曆上）。 */
function openPdfSheet(recCode, meta){
  meta = meta || {};
  var h4 = $('dnCode').parentNode;
  if(h4.firstChild && h4.firstChild.nodeType === 3) h4.firstChild.nodeValue = '服務紀錄表　';
  $('dnCode').textContent = recCode;

  var facts = [];
  if(meta.client) facts.push(meta.client);
  if(meta.cnt > 0) facts.push(meta.cnt + ' 位移工');
  var p = dnFactsEl();
  if(p){
    p.className = 'fct';
    p.textContent = facts.join('　·　');
    p.style.display = facts.length ? '' : 'none';
  }

  $('dnSubmit').style.display = 'none';
  $('dnCal').style.display = 'none';
  $('dnPdf').style.display = 'none';
  $('dnClose').className = 'q';
  $('dnClose').textContent = '關閉';

  var m = $('doneModal');
  m.style.display = '';
  requestAnimationFrame(function(){ m.classList.add('on'); });
  makePdf(recCode, false, $('dnOut'), 'dnRe');
}

/* 收起來走同一條路：往下退回去，不是原地消失 */
function closeDone(after){
  var m = $('doneModal');
  m.classList.remove('on');
  var done = false;
  var fin = function(){ if(done) return; done = true;
    m.style.display = 'none'; if(after) after(); };
  m.querySelector('.smbox').addEventListener('transitionend', fin, { once:true });
  setTimeout(fin, 380);          // 動畫被關掉時 transitionend 不會來
}
$('dnClose').addEventListener('click', function(){ closeDone(); });

$('pvBack').addEventListener('click', function(){ $('pvModal').style.display='none'; });
$('pvSign').addEventListener('click', function(){
  $('pvModal').style.display='none';
  // 看完直接把畫面帶到簽名區，不用自己再捲回去找
  var box = document.querySelector('[data-sig=worker]') ||
            document.querySelector('[data-sig=employer]');
  if(box) box.scrollIntoView({behavior:'smooth', block:'center'});
});

function resetForm(){
  offlineRelease();          // ⛔ 漏這行按鈕會卡在「已存在手機裡」
  hideSaved();                 // 存完的那一排收回去，換回原本的三顆
  /* 清空表單等於放棄這次修改。少了這一行，按「清除」之後填的新內容
     會被當成修改、覆寫掉原本那一筆。 */
  if(typeof EDIT_CODE !== 'undefined' && EDIT_CODE){
    EDIT_CODE = null;
    var eb = $('editBar'); if(eb) eb.style.display='none';
    $('save').textContent = '儲存';
  }
  $('pvModal').style.display='none';
  setClientValue('');
  if(CREW.indexOf(STAFF_NAME) !== -1) $('crew').value = STAFF_NAME;
  $('workers').innerHTML=''; addWorker();
  applyMySig();
  if(BRIEF_TIMER){ clearInterval(BRIEF_TIMER); BRIEF_TIMER = null; }
  BRIEF = null;
  $('briefIdle').style.display=''; $('briefLive').style.display='none';
  syncMode();
  ['employer','staff'].forEach(function(k){
    var b=document.querySelector('[data-sig='+k+']');
    if(b && b.__sig) b.__sig.clear();
  });
}
$('reset').addEventListener('click', resetForm);

/* ── 從 LINE 貼上行程表 ─────────────────────────
   特助每天在群組貼一份隔日行程，那份資料本來就在，
   翻譯再對著它重打一次沒有意義。 */
var PASTE = null;

/* ⛔ 「從 LINE 貼上整天行程」整個收起來（牟佑彬 2026-10-03，三個角色都拿掉）。
   ⚠ **只從畫面拿掉，程式不刪**。後端那一整套解析（看得懂 LINE 的格式、
      自動分類、對客戶名）還在 Paste.gs，要用回來把下面這行刪掉就有；
      刪掉就要重寫。 */
if($('calPaste')) $('calPaste').style.display = 'none';
$('calPaste').addEventListener('click', function(){
  $('pasteBox').value = '';
  $('pasteOut').innerHTML = '';
  PASTE = null;
  $('pasteModal').style.display = '';
  setTimeout(function(){ try{ $('pasteBox').focus(); }catch(e){} }, 60);
});
$('pasteClose').addEventListener('click', function(){
  $('pasteModal').style.display = 'none';
});

$('pasteGo').addEventListener('click', function(){
  var t = $('pasteBox').value.trim();
  if(!t){ toast('先把行程表貼進來', true); return; }
  var b = $('pasteGo'); b.disabled = true; b.textContent = '解析中…';
  $('pasteOut').innerHTML = '<div class="mid">解析中…</div>';
  google.script.run
    .withSuccessHandler(function(r){
      b.disabled = false; b.textContent = '解析看看';
      PASTE = r; drawPaste();
    })
    .withFailureHandler(function(e){
      b.disabled = false; b.textContent = '解析看看';
      $('pasteOut').innerHTML = '<div class="mid">'+esc(e.message)+'</div>';
    })
    .parsePastedSchedule(CODE, t, +CAL_YM.slice(0,4));
});

function pasteSubOpts(big, cur){
  var c = (TAX && TAX.cats) ? TAX.cats.filter(function(x){ return x.b===big; })[0] : null;
  if(!c || !c.s) return '';
  return '<option value="">— 選服務細項 —</option>' + c.s.map(function(x){
    return '<option'+(x.n===cur?' selected':'')+'>'+esc(x.n)+'</option>'; }).join('');
}

function drawPaste(){
  var r = PASTE;
  if(!r.rows.length){
    $('pasteOut').innerHTML = '<div class="mid" style="padding:24px">'+
      '沒有解析到任何派給翻譯人員的行程<br>'+
      '<span style="font-size:.8rem">確認貼進來的是整則行程表，而不是單一則訊息</span></div>';
    return;
  }
  var bad = r.rows.filter(function(x){ return !x.client || !x.big; }).length;
  var dup = r.rows.filter(function(x){ return x.dup; }).length;

  var html = '<div class="psum">'+
    '<span class="ok">可以建立 '+r.ready+'</span>'+
    (bad?'<span class="warn">要補資料 '+bad+'</span>':'')+
    (dup?'<span class="dup">已經有了 '+dup+'</span>':'')+
    (r.skipped?'<span>跳過非翻譯 '+r.skipped+'</span>':'')+
    (r.date?'<span>'+esc(r.date)+'</span>':'<span class="warn">找不到日期</span>')+
  '</div>';

  html += r.rows.map(function(x,i){
    var cls = x.dup ? 'dup' : ((!x.client || !x.big) ? 'bad' : '');
    var topic = x.big ? (x.big + (x.sub ? (' ／ ' + x.sub) : ' ／ ？')) : '？';
    return '<div class="prow '+cls+'">'+
      '<input type="checkbox" data-i="'+i+'"'+
        ((x.dup || !x.client || !x.big)?'':' checked')+'>'+
      '<span class="b">'+
        '<span class="t">'+esc(x.date||'？')+'　'+esc(x.crew)+
          (x.slot?('　'+esc(x.slot)):'')+(x.lang?('　'+esc(x.lang)):'')+
          (x.dup?'　·　這一筆已經有了':'')+'</span>'+
        '<span class="n">'+(x.client ? esc(x.client)
          : '<em>對不上客戶：'+esc(x.clientRaw||'（沒抓到）')+'</em>')+'</span>'+
        '<span class="m">'+esc(topic)+
          (x.workers?('　·　'+esc(x.workers)):'')+'</span>'+
        (!x.client && x.guess.length
          ? '<select data-c="'+i+'"><option value="">— 選客戶 —</option>'+
            x.guess.map(function(g){ return '<option>'+esc(g)+'</option>'; }).join('')+
            '</select>' : '')+
        (x.big && !x.sub
          ? '<select data-s="'+i+'">'+pasteSubOpts(x.big,'')+'</select>' : '')+
        '<span class="src">'+esc(x.raw)+'</span>'+
      '</span>'+
    '</div>';
  }).join('');

  html += '<div class="smbtns" style="margin-top:12px">'+
    '<button type="button" id="pasteAll">全選可建立的</button>'+
    '<button type="button" class="p" id="pasteMake">建立勾選的 <span id="pasteN">0</span></button>'+
  '</div>';

  $('pasteOut').innerHTML = html;
  bindPaste();
  countPaste();
}

function bindPaste(){
  [].forEach.call($('pasteOut').querySelectorAll('input[type=checkbox]'), function(c){
    c.addEventListener('change', countPaste);
  });
  [].forEach.call($('pasteOut').querySelectorAll('select[data-c]'), function(sel){
    sel.addEventListener('change', function(){
      PASTE.rows[+sel.dataset.c].client = sel.value;
      countPaste();
    });
  });
  [].forEach.call($('pasteOut').querySelectorAll('select[data-s]'), function(sel){
    sel.addEventListener('change', function(){
      PASTE.rows[+sel.dataset.s].sub = sel.value;
    });
  });
  $('pasteAll').addEventListener('click', function(){
    [].forEach.call($('pasteOut').querySelectorAll('input[type=checkbox]'), function(c){
      var x = PASTE.rows[+c.dataset.i];
      c.checked = !!(x.client && x.big && !x.dup);
    });
    countPaste();
  });
  $('pasteMake').addEventListener('click', makePaste);
}

function pastePicked(){
  return [].filter.call($('pasteOut').querySelectorAll('input[type=checkbox]'),
    function(c){ return c.checked; }).map(function(c){ return PASTE.rows[+c.dataset.i]; });
}
function countPaste(){
  var n = $('pasteN'); if(n) n.textContent = pastePicked().length;
}

function makePaste(){
  var picked = pastePicked().filter(function(x){ return x.date && x.client; });
  if(!picked.length){ toast('沒有可以建立的（客戶和日期都要有）', true); return; }
  var b = $('pasteMake'); b.disabled = true;
  google.script.run
    .withSuccessHandler(function(res){
      b.disabled = false;
      $('pasteModal').style.display = 'none';
      toast('已建立 '+res.made+' 筆行程');
      calBust(); loadCal();
    })
    .withFailureHandler(function(e){ b.disabled = false; toast(e.message, true); })
    .createFromPaste(CODE, picked);
}


/* ── 操作說明 ──────────────────────────────────────────────
   「點進去出不來」要從三個方向一起堵：
     · 左上角的返回鍵
     · Android 的實體返回鍵、iPhone 的邊緣返回手勢（靠 history）
     · Esc（桌機）
   三條路都走 closeHelp()，行為完全一致。

   掛 history 的作法：開啟時 pushState，返回鍵一律呼叫 history.back()，
   真正關閉的動作放在 popstate。這樣不管使用者按哪一個，
   歷史紀錄都不會亂掉——不會出現「按了系統返回鍵卻退出整個 App」。 */
var HELP_HTML = null;      // 抓過一次就留著
/* 手冊內容放在 GitHub Pages（help-content.html），開啟時才抓。
   Service.html 因此維持輕量，而且改手冊只要 push 上 Pages 就生效，
   不用重新部署 Apps Script。
   Pages 有送 Access-Control-Allow-Origin: *，所以跨網域 fetch 拿得到。 */
function loadHelpBody(){
  var box = $('hpBody');
  if(!box) return;
  function done(html){
    box.innerHTML = html;
    /* hpMe 在手冊的「你的登入碼」那一節裡面（help-content.html 有留位置），
       不掛在文末——那一節的文字就是在講這張表。 */
    drawHelpMe();
  }
  if(HELP_HTML){ done(HELP_HTML); return; }
  fetch('https://mousteven.github.io/yuher-app/help-content.html?v=' + encodeURIComponent(BUILD))
    .then(function(r){ if(!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
    .then(function(t){ HELP_HTML = t; done(t); })
    .catch(function(e){
      box.innerHTML = '<div class="hp-load">操作說明載入失敗（' + esc(e.message) + '）' +
        '<br>檢查一下網路，或稍後再開一次。</div>';
    });
}

/* 標題列的高度會跟著系統字級變，量一次寫進 CSS 變數，
   內容的第一行才不會被壓在標題列底下。 */
function hpFit(){
  var h = $('help'), bar = h && h.querySelector('.hp-bar');
  if(bar) h.style.setProperty('--hpbar', bar.offsetHeight + 'px');
}

/* 往下滑把標題列收起來、往上滑再放回來——說明內容因此占滿整個螢幕。
   10px 是遲滯門檻：手指抖一下不會讓它一直閃。
   捲到最上面一定放回來，所以「找不到返回鍵」不會發生。 */
var HP_LASTY = 0;
function hpScroll(){
  var h = $('help'), b = $('hpBody');
  if(!h || !b) return;
  var y = b.scrollTop;
  if(y < 6){ h.classList.remove('hpdn'); HP_LASTY = y; return; }
  var d = y - HP_LASTY;
  if(d > 10){ h.classList.add('hpdn'); HP_LASTY = y; }
  else if(d < -10){ h.classList.remove('hpdn'); HP_LASTY = y; }
}

function openHelp(){
  var h = $('help');
  if(!h || h.classList.contains('on')) return;
  loadHelpBody();
  h.classList.add('on');
  h.classList.remove('hpdn');
  HP_LASTY = 0;
  try { $('hpBody').scrollTop = 0; } catch(e0){}
  hpFit();
  h.setAttribute('aria-hidden', 'false');
  try { history.pushState({ help: 1 }, ''); } catch(e){}
  try { $('hpBack').focus(); } catch(e2){}
}
function closeHelp(){
  var h = $('help');
  if(!h || !h.classList.contains('on')) return;
  h.classList.remove('on');
  h.setAttribute('aria-hidden', 'true');
}
/* 自己的登入資訊。換手機、重灌的時候第一個要找的就是這個，
   所以放在說明的最上面，而且附一個複製鈕——
   在工廠裡要同事手抄一串網址是不切實際的。 */
var HELP_DIR = null;      // 拿過一次就不再問後端
function linkOf(code){
  return 'https://mousteven.github.io/yuher-app/?code=' + encodeURIComponent(code || '');
}
function drawHelpMe(){
  var box = $('hpMe');
  if(!box) return;
  /* 還沒登入就不要去打後端——那一定會失敗，而畫面上跳出一行紅字
     只會讓人以為程式壞了。沒登入時這一塊就安靜地說明它是做什麼的。 */
  if(!CODE){
    box.innerHTML = '<b>你的專屬連結</b>' +
      '<p>登入之後，這裡會顯示你的專屬連結與全體同仁的登入碼。</p>';
    return;
  }
  box.innerHTML =
    '<b>' + (STAFF_NAME ? (esc(STAFF_NAME) + ' 的專屬連結') : '你的專屬連結') + '</b>' +
    '<p>換手機或重灌之後，用這條連結點一下就登入，不用再輸入登入碼。</p>' +
    '<button type="button" id="hpCopy">複製我的專屬連結</button>' +
    '<div id="hpDir" class="hp-dir">載入全體同仁的登入碼…</div>';
  var b = $('hpCopy');
  if(b) b.addEventListener('click', function(){
    try { navigator.clipboard.writeText(linkOf(CODE)); toast('已複製，貼到 LINE 給自己就好'); }
    catch(e){ toast('複製失敗，請截圖或手動記下', true); }
  });
  if(HELP_DIR) { drawHelpDir(HELP_DIR); return; }
  /* 名單一定要從後端拿。?page=svc 不做伺服器端驗證——
     整份 HTML 與 app.js 任何人打開網址都拿得到，
     碼寫進前端就等於公開在網路上。helpDirectory 會過 staffAuth_。 */
  google.script.run
    .withSuccessHandler(function(r){ HELP_DIR = r; drawHelpDir(r); })
    .withFailureHandler(function(){
      var d = $('hpDir'); if(d) d.textContent = '（登入碼名單載入失敗，請下拉重新整理）'; })
    .helpDirectory(CODE);
}
function drawHelpDir(r){
  var d = $('hpDir');
  if(!d) return;
  if(!r || !r.rows || !r.rows.length){ d.textContent = ''; return; }
  d.innerHTML = '<b>全體同仁的登入碼</b>' +
    '<p class="hp-dir-note">要幫誰重新登入時用。每個人的專屬連結是同一條網址加上他的碼。</p>' +
    '<table><tbody>' + r.rows.map(function(x){
      return '<tr' + (x.me ? ' class="me"' : '') + '><td>' + esc(x.name) +
             (x.me ? '<em>你</em>' : '') + '</td><td class="ro">' + esc(x.role || '翻譯') +
             '</td><td class="cd">' + esc(x.code) + '</td>' +
             '<td><button type="button" data-c="' + esc(x.code) + '">複製連結</button></td></tr>';
    }).join('') + '</tbody></table>';
  [].forEach.call(d.querySelectorAll('button[data-c]'), function(b){
    b.addEventListener('click', function(){
      try { navigator.clipboard.writeText(linkOf(b.dataset.c)); toast('已複製他的專屬連結'); }
      catch(e){ toast('複製失敗', true); }
    });
  });
}
$('guideBtn').addEventListener('click', openHelp);
$('hpBody').addEventListener('scroll', hpScroll, { passive: true });
window.addEventListener('resize', hpFit);
$('hpBack').addEventListener('click', function(){
  /* 一律走 history.back()，讓按鈕跟系統返回鍵是同一條路徑 */
  if(history.state && history.state.help) history.back();
  else closeHelp();
});
window.addEventListener('popstate', function(){ closeHelp(); });
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape') closeHelp();
});

/* ── 查詢 ─────────────────────────────── */
function recHtml(r){
  return '<div class="rec">'+
    '<div class="h"><span>'+esc(r.date)+'　'+esc(r.mode)+'</span><span>'+esc(r.staff)+'</span></div>'+
    '<div class="n">'+esc(r.client||'(未填客戶)')+(r.name?'　·　'+esc(r.name):'')+
      (r.lang?'（'+esc(r.lang)+'）':'')+'</div>'+
    '<span class="c">'+esc(r.big)+' / '+esc(r.sub)+'</span>'+
    (r.did||r.dnote ? '<p>經過：'+esc(r.did)+(r.dnote?'。'+esc(r.dnote):'')+'</p>' : '')+
    (r.res||r.rnote ? '<p>結果：'+esc(r.res)+(r.rnote?'。'+esc(r.rnote):'')+'</p>' : '')+
    (r.fee?'<p>費用：'+esc(r.fee)+'</p>':'')+
    (r.memo?'<p>'+esc(r.memo)+'</p>':'')+
    (r.follow?'<span class="fu">追蹤：'+esc(r.follow)+'</span>':'')+
    (r.rv?'<div class="recprog">'+progHtml(r.rv)+'</div>':'')+
    sigRow(r)+
    '</div>';
}
function sigRow(r){
  var got=[];
  if(r.sigEmployer) got.push(['雇主',r.sigEmployer]);
  if(r.sigWorker) got.push(['移工',r.sigWorker]);
  if(r.sigStaff) got.push(['翻譯',r.sigStaff]);
  if(!got.length) return '<p style="color:var(--ink3);font-size:12px">（無簽名）</p>';
  return '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">'+
    got.map(function(g){
      return '<a href="'+esc(g[1])+'" target="_blank" rel="noopener" '+
        'style="flex:1;min-width:92px;text-decoration:none">'+
        '<div style="font-size:11px;color:var(--ink3);margin-bottom:2px">'+g[0]+'簽名</div>'+
        '<img src="'+esc(g[1])+'" loading="lazy" alt="'+g[0]+'簽名" '+
        'style="width:100%;height:46px;object-fit:contain;background:#fff;'+
        'border:1px solid var(--line);border-radius:6px"></a>';
    }).join('')+'</div>';
}
/* 查詢的時間範圍。預設三個月——服務紀錄會一直長，
   每次都整張掃，資料再多一倍就會開始等。要翻舊帳再自己放寬。 */
var FIND_M = 3;
var FIND_RANGE = [{m:3,t:'最近 3 個月'},{m:6,t:'最近半年'},
                  {m:12,t:'最近一年'},{m:0,t:'全部'}];
function drawFindRange(){
  $('findRange').innerHTML = FIND_RANGE.map(function(d){
    return '<button type="button" data-m="'+d.m+'" class="'+
      (FIND_M===d.m?'on':'')+'">'+d.t+'</button>'; }).join('');
  [].forEach.call($('findRange').querySelectorAll('button'), function(b){
    b.addEventListener('click', function(){
      FIND_M = +b.dataset.m; drawFindRange(); doFind(); });
  });
}
drawFindRange();

function doFind(){
  $('findOut').innerHTML='<div class="mid">查詢中…</div>';
  google.script.run
    .withSuccessHandler(function(res){
      if(!res.rows.length){
        $('findOut').innerHTML = '<div class="mid">這個範圍內沒有符合的紀錄'+
          (FIND_M?'<br>要找更早的，把上面的範圍放寬':'')+'</div>';
        return;
      }
      $('findOut').innerHTML='<p class="hint">共 '+res.total+' 筆，顯示最近 '+
        res.rows.length+' 筆'+(res.since?('　·　'+esc(res.since)+' 之後'):'')+'</p>'+
        res.rows.map(recHtml).join('');
    })
    .withFailureHandler(function(e){ $('findOut').innerHTML='<div class="mid">'+esc(e.message)+'</div>'; })
    .listServiceLogs(CODE, $('q').value.trim(), $('mine').checked, FIND_M);
}
$('q').addEventListener('keydown', function(e){ if(e.key==='Enter') doFind(); });
$('mine').addEventListener('change', doFind);

/* ── 審閱 ────────────────────────────────────────
   同一個畫面依角色給不同隊列：翻譯看「我要送審的」、
   副理看「待我審閱」、總經理看「待我核准」。
   每個人只看到輪到自己的東西，不用在一堆紀錄裡找。 */
var REV = null;
var REV_PICK = [];
var REV_ST = '';        // 送審頁的狀態篩選（'' = 全部）
// 顏色跟行事曆、跟進度條同一套
var REV_ST_DEF = [
  { k:'未送審',       t:'尚未送審',   c:'#C99A3E' },
  { k:'待副理審',     t:'待副理審核', c:'#C99A3E' },
  { k:'待總經理核准', t:'待總經理核准', c:'#4A6FA5' },
  { k:'已歸檔',       t:'審核通過',   c:'#1E9E72' },
  { k:'退回補正',     t:'已退回',     c:'#9E3B52' }
];

/* 送審頁的快取。原本每次點頁籤都重掃整張服務紀錄與審核表，
   來回一趟在工廠的 4G 上要好幾秒。行事曆早就有快取了，這裡照同一套：
   三分鐘內直接用手上這份，送審／退回／存檔時主動作廢。 */
var REV_AT = 0;
var REV_TTL = 3 * 60 * 1000;
/* 審核狀態一變（送審、退回、批示、核准、改內容），明細也跟著失效。
   revBust 本來就是「審核相關的東西過期了」那個訊號，掛在這裡就不會漏。 */
function revBust(){ REV = null; REV_AT = 0; RV_CACHE_ = {}; }

function loadFollow(force){
  if(!force && REV && (Date.now() - REV_AT) < REV_TTL){
    REV_PICK = []; drawReview();
    return;
  }
  if(!REV) $('p-follow').innerHTML = '<div class="mid">載入中…</div>';
  google.script.run
    .withSuccessHandler(function(r){ REV = r; REV_AT = Date.now(); REV_PICK = []; drawReview(); })
    .withFailureHandler(function(e){
      if(!REV) $('p-follow').innerHTML = '<div class="mid">'+esc(e.message)+'</div>'; })
    .listReviewQueue(CODE);
}

function stCls(st){
  if(st === '退回補正') return 'back';
  if(st === '已歸檔') return 'done';
  if(st === '未送審') return '';
  return 'wait';
}

function revCard(r, pickable){
  return '<div class="rv" data-code="'+esc(r.code)+'">'+
    (pickable ? '<input type="checkbox" value="'+esc(r.code)+'">' : '')+
    '<span class="b" data-open="'+esc(r.code)+'">'+
      '<span class="t">'+esc(r.date)+'　'+esc(r.crew)+'</span>'+
      '<span class="n">'+esc(r.client)+'</span>'+
      '<span class="m">'+esc((r.big&&r.sub)?(r.big+' ／ '+r.sub):'—')+
        (r.names.length?'　·　'+esc(r.names.join('、')):'')+'</span>'+
      '<span class="code">'+esc(r.code)+'</span>'+
      (r.reject?'<span class="rej">'+esc(r.reject)+'</span>':'')+
      (r.mgr&&r.status!=='退回補正'
        ? '<span class="m">副理：'+esc(r.follow||'不需追蹤')+
          (r.mgrNote?'　'+esc(r.mgrNote):'')+'</span>' : '')+
      progHtml(r.status)+
    '</span>'+
  '</div>';
}

/* 深色小方塊配線性圖示。要動作時換成警示色，一眼看得出有沒有事。 */
function rvIcon(alert){
  var p = alert
    ? '<path d="M12 8v5"/><path d="M12 16.5h.01"/><circle cx="12" cy="12" r="9"/>'
    : '<path d="M20 6 9 17l-5-5"/>';
  return '<span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg></span>';
}

/* 放最久的那一筆放了幾天。這個數字才是有用的——
   「5 筆等你審」不會讓人動起來，「最久的放了 3 天」會。 */
function rvOldest(list){
  var best = null;
  (list || []).forEach(function(x){
    if(!x.date) return;
    if(!best || x.date < best) best = x.date;
  });
  if(!best) return 0;
  var d = new Date(best + 'T00:00:00+08:00');
  if(isNaN(d.getTime())) return 0;
  return Math.max(0, Math.round((Date.now() - d.getTime()) / 86400000));
}

/* 送審頁的第一句話。先講結論，不要讓使用者自己從數字推論。 */
function rvLead(r, isMgr){
  var nQ = (r.queue || []).length;
  var nBack = (r.back || []).length;
  var who = '<span class="who">' + esc(r.role) + '　' + esc(r.me) + '</span>';

  if(isMgr){
    if(!nQ){
      return '<div class="rvhead">' + rvIcon(false) + '<span class="tx">' +
        '<b>目前沒有要審的</b><em>翻譯送上來會出現在這裡。</em>' + who + '</span></div>';
    }
    var days = rvOldest(r.queue);
    return '<div class="rvhead' + (days >= 3 ? ' act' : '') + '">' + rvIcon(days >= 3) +
      '<span class="tx"><b>' + nQ + ' 筆等你' +
      (r.role === '總經理' ? '核准' : '審') +
      (days >= 1 ? ('，最久的放了 ' + days + ' 天') : '') + '</b>' +
      '<em>點開可以直接' + (r.role === '總經理' ? '核准' : '批示') +
      '或退回。也可以勾起來批次處理。</em>' + who + '</span></div>';
  }

  /* 翻譯人員：被退回的最重要——那是主管等著你補的。 */
  var nTodo = nQ - nBack;
  if(!nQ){
    return '<div class="rvhead">' + rvIcon(false) + '<span class="tx">' +
      '<b>沒有待處理的紀錄</b><em>填完的都送出去了。</em>' + who + '</span></div>';
  }
  var line = [];
  if(nBack) line.push(nBack + ' 筆被退回要補');
  if(nTodo > 0) line.push(nTodo + ' 筆還沒送審');
  return '<div class="rvhead' + (nBack ? ' act' : '') + '">' + rvIcon(!!nBack) +
    '<span class="tx"><b>' + line.join('、') + '</b><em>' +
    (nBack ? '被退回的先改——主管寫了原因，點進去按「修改內容」。' : '') +
    (nTodo > 0 ? (nBack ? '其他的' : '') + '點進去按「送審給副理」就好。' : '') +
    '</em>' + who + '</span></div>';
}

function drawReview(){
  refreshed();
  var r = REV;
  var badge = $('revBadge');
  if(r.count){ badge.textContent = r.count; badge.style.display=''; }
  else badge.style.display='none';

  var isMgr = (r.role === '副理' || r.role === '總經理');
  // 全部的卡片攤平成一份，篩選才有東西可以算
  var all = (r.queue || []).concat(r.back || [], r.done || []);
  var seenC = {};
  all = all.filter(function(x){
    if(seenC[x.code]) return false; seenC[x.code]=1; return true; });

  var html = rvLead(r, isMgr) +
    '<div class="evsticky"><div class="calfw"><div class="calf" id="revSt">' +
      '<button type="button" data-st="" class="'+(REV_ST?'':'on')+'">全部<b>'+
        all.length+'</b></button>' +
      REV_ST_DEF.map(function(d){
        var n = all.filter(function(x){ return x.status === d.k; }).length;
        return '<button type="button" data-st="'+d.k+'" class="'+
          (REV_ST===d.k?'on':'')+'">'+
          '<i class="sq" style="background:'+d.c+'"></i>'+d.t+'<b>'+n+'</b></button>';
      }).join('') +
    '</div></div></div>';

  // 有篩選的時候就不分區了，直接把符合的列出來——一次只看一種狀態
  if(REV_ST){
    var hit = all.filter(function(x){ return x.status === REV_ST; });
    html += hit.length
      ? hit.map(function(x){
          // 只有輪到自己的那一種狀態才給勾選框，別的狀態勾了也不能批
          var mine = (r.role === '副理' && x.status === '待副理審') ||
                     (r.role === '總經理' && x.status === '待總經理核准');
          return revCard(x, isMgr && mine);
        }).join('')
      : '<div class="mid" style="padding:26px">這個狀態沒有紀錄</div>';
    $('p-follow').innerHTML = html;
    bindReview();
    return;
  }

  if(isMgr && r.queue.length){
    // 批次核准：紙本要一張一張簽，這是數位化最直接的效率差別
    html += '<div class="rvbar">'+
      '<button type="button" id="rvAll">全選</button>'+
      '<button type="button" class="p" id="rvBatch">批次核准 <span id="rvN">0</span></button>'+
    '</div>';
  }

  html += r.queue.length
    ? r.queue.map(function(x){ return revCard(x, isMgr); }).join('')
    : '<div class="mid" style="padding:26px">目前沒有輪到你的</div>';

  // 退回去的不能就這樣消失——主管要看得到「我退了什麼、回來了沒」
  if(isMgr && r.back && r.back.length){
    html += '<div class="rvgrp">已退回，等翻譯人員補正 '+r.back.length+'</div>' +
            r.back.map(function(x){ return revCard(x, false); }).join('');
  }
  if(r.done.length){
    html += '<div class="rvgrp">已處理 '+r.done.length+'</div>' +
            r.done.map(function(x){ return revCard(x, false); }).join('');
  }
  $('p-follow').innerHTML = html;
  bindReview();
  fixStick();
}

function bindReview(){
  [].forEach.call($('p-follow').querySelectorAll('#revSt button'), function(b){
    b.addEventListener('click', function(){
      REV_ST = (REV_ST === b.dataset.st) ? '' : b.dataset.st; drawReview(); });
  });
  [].forEach.call($('p-follow').querySelectorAll('[data-open]'), function(b){
    b.addEventListener('click', function(){ openReview(b.dataset.open); });
  });
  [].forEach.call($('p-follow').querySelectorAll('.rv input[type=checkbox]'), function(c){
    c.addEventListener('change', function(){
      REV_PICK = [].map.call($('p-follow').querySelectorAll('.rv input:checked'),
                             function(i){ return i.value; });
      var n = $('rvN'); if(n) n.textContent = REV_PICK.length;
    });
  });
  var all = $('rvAll');
  if(all) all.addEventListener('click', function(){
    [].forEach.call($('p-follow').querySelectorAll('.rv input[type=checkbox]'),
      function(i){ i.checked = true; });
    REV_PICK = [].map.call($('p-follow').querySelectorAll('.rv input:checked'),
                           function(i){ return i.value; });
    $('rvN').textContent = REV_PICK.length;
  });
  var bt = $('rvBatch');
  if(bt) bt.addEventListener('click', function(){
    if(!REV_PICK.length){ toast('先勾要核准的', true); return; }
    bt.disabled = true;
    google.script.run
      .withSuccessHandler(function(res){
        bt.disabled=false;
        toast('已核准 '+res.ok+' 筆'+(res.fail.length?('，'+res.fail.length+' 筆失敗'):''));
        revBust(); loadFollow(true);
      })
      .withFailureHandler(function(e){ bt.disabled=false; toast(e.message,true); })
      .reviewBatch(CODE, REV_PICK, REV.role==='總經理'?'boss':'manager', '不需追蹤', '');
  });
}

/* 點一筆就直接看 PDF，不用另外開分頁——審的人要看的是那張表本身 */
var REV_AFTER = null;

function openReview(recCode){
  showReviewModal(recCode, loadFollow);
}

/* 從行事曆點已完成的那一趟：送審前先看過內容再決定
   （以前是印出來翻一遍，現在直接在手機上看） */
/* meta 帶進來的話，視窗最上面會出現返回列，按了回到行事曆的那一張卡片。
   從「送審」那一頁開的不帶——清單就在後面，關閉就回去了。 */
function openRecord(recCode, meta){
  showReviewModal(recCode, function(){ calBust(); loadCal(); refreshBadge(); });
  if(meta) showBack(meta, 'rec'); else hideBack();
}

var RV_CODE = '';
var RV_DETAIL = null;

/* 抓過的明細留著。同一筆再開就是瞬間，不用再付一次來回。
   內容可能被別人改（副理批示、退回），所以拿快取畫完之後照樣去抓一次，
   回來不一樣才重畫——使用者先看到東西，正確性也沒放掉。 */
var RV_CACHE_ = {};

/* 先畫已經知道的。行事曆列表上本來就有客戶、日期、翻譯、服務項目、
   移工名單與審核狀態，那些不必等伺服器。
   只有處理經過、結果、費用、簽名要等，那幾格畫成灰條。 */
function drawRecordSkeleton(recCode, r){
  /* 從「送審」那一頁開的不會有行事曆那一列，那就只能老實說在讀取。
     有列的（從行事曆點進來的）才畫得出客戶與日期。 */
  var names = (r && r.workers ? String(r.workers).split('、') : ['']);
  $('rvTitle').textContent = (r && r.client)
    ? (r.client + (r.date ? '　' + r.date : ''))
    : '讀取中…';
  $('rvSub').textContent = recCode + (r && r.crew ? '　' + r.crew : '') +
    (r && r.rv ? '　' + (RV_LABEL[r.rv] || r.rv) : '');

  var sk = function(w){ return '<span class="sk ' + w + '"></span>'; };
  var h = '<div class="rvmeta">' +
    '<div><span>服務日期</span><b>' + esc((r && r.date) || '') + '</b></div>' +
    '<div><span>服務方式</span><b>' + sk('w1') + '</b></div>' +
    '<div><span>雇主</span><b>' + esc((r && r.client) || '') + '</b></div>' +
    '<div><span>客服人員</span><b>' + esc((r && r.crew) || '') + '</b></div>' +
  '</div>';

  names.forEach(function(nm, i){
    h += '<div class="rvw">' +
      '<div class="hd"><i>' + (i + 1) + '</i><b>' + esc(nm || '') + '</b></div>' +
      '<div class="rvf"><span>服務項目</span><b>' +
        esc(r && r.big && r.sub ? (r.big + ' ／ ' + r.sub) : ((r && r.topic) || '')) +
      '</b></div>' +
      '<div class="rvf"><span>處理經過</span><b>' + sk('w3') + '</b></div>' +
      '<div class="rvf"><span>處理結果</span><b>' + sk('w2') + '</b></div>' +
      '<div class="sg"><span>移工簽名</span>' + sk('w1') + '</div>' +
    '</div>';
  });
  $('rvBody').innerHTML = h;
  $('rvAct').innerHTML = '';
}
var RV_PDF_SRC = '';   // 不能用 iframe.src 判斷有沒有產生過，理由見下面的切換鈕

function showReviewModal(recCode, after){
  RV_CODE = recCode;
  RV_DETAIL = null;
  REV_AFTER = after || null;
  $('rvTitle').textContent = '讀取中…';
  $('rvSub').textContent = recCode;
  $('rvFrame').removeAttribute('src');
  RV_PDF_SRC = '';
  $('rvPdfWrap').style.display = 'none';
  $('rvBody').style.display = '';
  $('rvPdfTgl').textContent = '正式表';
  $('rvPdfTgl').disabled = false;
  /* 不要再整片空白等 2–3 秒。有快取就直接畫完整的，
     沒有就先畫已經知道的那一半，剩下的用灰條佔位。 */
  var cached = RV_CACHE_[recCode];
  if(cached){
    RV_DETAIL = cached;
    drawRecordBody(cached);
    drawReviewActions(cached.trip);
  } else {
    drawRecordSkeleton(recCode,
      (typeof CAL_ROWS !== 'undefined' ? CAL_ROWS : []).filter(function(x){
        return x.recCode === recCode;
      })[0]);
  }
  $('revModal').style.display = '';
  $('rvBody').scrollTop = 0;

  google.script.run
    .withSuccessHandler(function(d){
      if(RV_CODE !== recCode) return;          // 使用者已經開別筆了，不要蓋掉
      var same = RV_DETAIL && JSON.stringify(RV_DETAIL) === JSON.stringify(d);
      RV_CACHE_[recCode] = d;
      RV_DETAIL = d;
      if(same) return;                          // 跟畫面上的一樣就不要重畫，免得閃一下
      drawRecordBody(d);
      drawReviewActions(d.trip);
    })
    .withFailureHandler(function(e){
      $('rvBody').innerHTML = '<div class="mid" style="padding:30px;color:var(--danger)">'+
        esc(e.message)+'</div>';
    })
    .getRecordDetail(CODE, recCode);
}

/* 宣導簽到那一段。
   ⚠ 這裡**不放簽名圖**：一場可能三十個人，每張幾十 KB，整包會大到
     手機讀不動。要看簽名就按下面的「看正式服務紀錄表（PDF）」，
     那份的簽到表上每一格都有圖。 */
function rvBriefBlock(bf){
  var signs = bf.signs || [];
  var exp = bf.expected || [];
  var by = {};
  signs.forEach(function(x){ by[x.name] = x; });
  /* 應到名單優先，沒指定就照實際簽到的順序 */
  var rows = exp.length
    ? exp.map(function(n){ return by[n] || { name: n }; })
    : signs.slice();
  /* 名單外自己打名字簽的人要接在後面，不可以漏掉——他們真的到場了 */
  signs.forEach(function(x){
    if(!rows.some(function(r){ return r.name === x.name; })) rows.push(x);
  });
  var done = rows.filter(function(r){ return r.at; }).length;
  return '<div class="rvbf">'+
    '<div class="hd"><b>宣導簽到</b>'+
      '<em>'+done+' ／ '+rows.length+' 人已簽</em></div>'+
    rows.map(function(r){
      return '<div class="bf1'+(r.at?' on':'')+'">'+
        '<span class="mk">'+(r.at?'✓':'')+'</span>'+
        '<span class="nm">'+esc(r.name)+'</span>'+
        (r.lang?'<span class="lg">'+esc(r.lang)+'</span>':'')+
        '<span class="tm">'+esc(r.at ? String(r.at).slice(-5) : '未簽')+'</span>'+
      '</div>';
    }).join('')+
    (bf.paper ? '<p class="hint">另有紙本簽到表照片，在 PDF 裡</p>' : '')+
    '<p class="hint">簽名影像在正式表單（PDF）的簽到表上</p>'+
  '</div>';
}

/* 一趟服務走完要經過四關。與其只印現在停在哪，不如把整條路畫出來——
   翻譯人員一眼就知道「我的表在誰手上」，不用去問。 */
var PROG_STEPS_ = ['送審', '副理', '總經理', '歸檔'];
var PROG_MAP_ = {
  '未送審':       ['todo', '',     '',     ''],
  '待副理審':     ['done', 'now',  '',     ''],
  '待總經理核准': ['done', 'done', 'now',  ''],
  '已歸檔':       ['done', 'done', 'done', 'done'],
  '退回補正':     ['done', 'back', '',     '']
};
/* 類型短名。卡片上寫「就醫 3/4」比「就醫追蹤 3/4」省兩個字，
   而那兩個字在手機上就是名字會不會被截斷的差別。 */
var SHORT_ = { '異常事件':'異常', '返鄉休假':'返鄉', '就醫追蹤':'就醫', '體檢通知':'體檢' };

/* 進度：四段細條（他挑的 P2）。取代原本四格長條＋四個文字標籤，省掉一整行。
   被退回那一格要紅的——退回是最需要被看見的狀態。 */
var PROG_AT_ = { '未送審':1, '待副理審':2, '待總經理核准':3, '已歸檔':4, '退回補正':2 };
function progDots(rv){
  if(!rv) return '';
  var at = PROG_AT_[rv] || 1, bad = rv === '退回補正', pass = rv === '已歸檔';
  return '<span class="c4pg">' + [0,1,2,3].map(function(i){
    var c = i < at-1 ? 'on' : (i === at-1 ? (bad ? 'bad' : (pass ? 'on' : 'now')) : '');
    return '<i class="' + c + '"></i>';
  }).join('') + '</span>';
}
/* 狀態那兩三個字。進度條講「走到哪」，這裡講「在等誰」。 */
function rvWord(rv){
  if(!rv) return '';
  var t = RV_LABEL[rv] || rv;
  var c = rv === '退回補正' ? ' bad' : (rv === '已歸檔' ? ' pass' : '');
  return '<span class="c4st' + c + '">' + esc(t) + '</span>';
}

function progHtml(rv){
  var st = PROG_MAP_[rv] || ['', '', '', ''];
  return '<span class="prog'+(rv==='已歸檔'?' all':'')+'">'+
    PROG_STEPS_.map(function(t, i){
      // 被退回的時候，第二關直接寫「退回」，比寫「副理」清楚
      var label = (st[i] === 'back') ? '退回' : t;
      return '<span class="s '+st[i]+'"><i></i><em>'+label+'</em></span>';
    }).join('')+'</span>';
}

var RV_LABEL = { '未送審':'尚未送審', '待副理審':'待副理審核',
                 '待總經理核准':'待總經理核准', '已歸檔':'審核通過', '退回補正':'已退回' };
function rvCls(st){
  return st==='已歸檔' ? 'pass' : st==='退回補正' ? 'back'
       : st==='待副理審' ? 'wait' : st==='待總經理核准' ? 'wait2' : '';
}

function rvField(k, v){
  return '<div class="rvf"><span>'+k+'</span><b>'+esc(v||'—')+'</b></div>';
}

/* 把整趟服務攤開成手機看得舒服的欄位。
   全部是印出來的字，主管改不了——要改只能退回給翻譯人員重填。 */
/* 送審頁與紀錄詳情的「前後文」列：這一筆屬於哪一串追蹤、走到第幾步。
   查不到就整條不出現——沒掛案件的紀錄佔大多數，不要留一條空的。

   2026-09-19 改版（他挑的 A）。原本最大的字是案件代碼 M260918-E34B，
   對人沒有意義卻排在最顯眼的地方；而「2026-09-16 帶工人就醫」看起來
   像這一筆的日期，其實是上一筆的。現在：
     一句人話（這是第幾次） → 一條走到哪的進度 → 代碼縮到最小放最後

   ⚠ 這支是非同步的。同一筆被畫兩次的時候，第二次的 remove 會在
   第一次的 insert 之前跑完，於是插出兩條——他實機上看到的就是這個。
   用序號擋：回來的時候不是最新那次就整個丟掉。 */
var CTX_SEQ_ = 0;

function caseCtx(recCode){
  var box = $('rvCtx');
  if(box) box.remove();
  if(!recCode) return;
  var seq = ++CTX_SEQ_;
  google.script.run
    .withSuccessHandler(function(r){
      if(seq !== CTX_SEQ_) return;        // 已經有更新的一次在跑了
      if(!r || !r.has || !$('rvBody')) return;
      var old = $('rvCtx');
      if(old) old.remove();               // 兩道防線：非同步就是會這樣
      var el = document.createElement('div');
      el.id = 'rvCtx';
      el.className = 'c5';
      el.innerHTML = ctxHtml(r);
      el.addEventListener('click', function(){
        $('revModal').style.display = 'none';
        goTab('track');
        openCase(r.id);
      });
      $('rvBody').insertBefore(el, $('rvBody').firstChild);
    })
    .withFailureHandler(function(){})
    .caseContextOf(CODE, recCode);
}

/* 進度條上的一格。日期寫成 9/16 這種短的，項目截斷不換行——
   三格塞在 360px 寬的螢幕上，每格只有一百出頭。 */
function ctxStep(cls, when, what){
  return '<span class="c5stp ' + cls + '"><i></i>' +
    '<em>' + esc(when) + '</em><span>' + esc(what) + '</span></span>';
}
function shortDate_(d){
  var p = String(d || '').split('-');
  return p.length === 3 ? (+p[1] + '/' + +p[2]) : (d || '');
}

function ctxHtml(r){
  var done = r.status !== '進行中';
  var steps = r.list.map(function(x, i){
    var cls = i + 1 < r.n ? 'done' : (i + 1 === r.n ? 'now' : '');
    return ctxStep(cls, shortDate_(x.date), x.sub || '服務');
  });
  /* 最後補一格「下一次」。已結案就不補——那一格會變成永遠亮不起來的幽靈。 */
  if(!done){
    steps.push(ctxStep('', r.nextDate ? shortDate_(r.nextDate) : '未排', '下一次'));
  }
  return '<p class="c5line"><span class="c5k">◷ ' + esc(r.kind) + '</span>' +
      '這是<b>第 ' + r.n + ' 次服務</b>，目前共 ' + r.total + ' 次</p>' +
    '<span class="c5rail">' + steps.join('') + '</span>' +
    '<span class="c5foot"><span class="c5id">追蹤編號 ' + esc(r.id) + '</span>' +
      (done ? '已結案' : '還沒結案') +
      '<span class="c5go">看整串 ›</span></span>';
}

function drawRecordBody(d){
  var t = d.trip, ws = d.workers || [];
  /* 這一筆屬不屬於某個追蹤案件。副理本來只看得到單筆，
     判斷不了「這個費用合不合理」「該不該結案」——
     四趟職災加起來的代墊金額，單看一筆看不到。
     另外打一支後端，不要拖慢主要內容的顯示。 */
  caseCtx(t.code);
  $('rvTitle').textContent = t.client + '　' + t.date;
  $('rvSub').textContent = t.code + '　' + (t.crew||t.staff||'') + '　' +
    (RV_LABEL[t.status] || t.status);

  var h = '<div class="rvmeta">'+
    '<div><span>服務日期</span><b>'+esc(t.date)+'</b></div>'+
    '<div><span>服務方式</span><b>'+esc(t.mode||'—')+'</b></div>'+
    '<div><span>雇主</span><b>'+esc(t.client)+'</b></div>'+
    '<div><span>客服人員</span><b>'+esc(t.crew||t.staff||'—')+'</b></div>'+
    (t.owner && t.owner !== t.crew
      ? '<div class="w"><span>這家原負責</span><b>'+esc(t.owner)+'（本次代跑）</b></div>' : '')+
  '</div>';

  if(t.reject){
    h += '<div class="rvrej"><b>已退回，等翻譯人員補正</b>'+esc(t.reject)+'</div>';
  }

  /* 宣導（一對多）的簽名不在這一列上，在「宣導簽到」表裡。
     ⛔ 沿用一般紀錄的排版會印成「（未填姓名）· 移工簽名 未簽名」——
        看起來整場都沒人簽，但 PDF 的簽到表上明明有四個人簽了。
        2026-09-21 他截圖指出來的。 */
  var bf = d.brief;
  ws.forEach(function(w, i){
    var o = (typeof origOf === 'function') ? origOf(w.name) : '';
    var proc = [w.did, w.dnote].filter(String).join('。');
    var res  = [w.res, w.rnote].filter(String).join('。');
    var ex = [];
    if(w.fee) ex.push('費用 '+w.fee);
    if(w.memo) ex.push(w.memo);
    /* 一對多那一列是「宣導內容」，本來就不會有個別移工的名字。 */
    var isBf = !!bf && !w.name;
    h += '<div class="rvw">'+
      '<div class="hd"><i>'+(i+1)+'</i><b>'+
        esc(w.name || (isBf ? '宣導內容（一對多）' : '（未填姓名）'))+'</b>'+
        (o?'<span class="or">'+esc(o)+'</span>':'')+
        (w.lang?'<em>'+esc(w.lang)+'</em>':'')+'</div>'+
      rvField('服務項目', (w.big&&w.sub) ? (w.big+' ／ '+w.sub) : (w.big||w.sub||''))+
      rvField('處理經過', proc)+
      rvField('處理結果', res)+
      (ex.length ? rvField('其他', ex.join('　·　')) : '')+
      (isBf ? '' :
        '<div class="sg"><span>移工簽名</span>'+
          (w.sigWorker ? '<img src="'+esc(w.sigWorker)+'">' : '<em>未簽名</em>')+
        '</div>')+
    '</div>';
  });

  if(bf) h += rvBriefBlock(bf);

  h += '<div class="rvsig">'+
    '<div><span>雇主簽名</span>'+
      (t.sigEmployer?'<img src="'+esc(t.sigEmployer)+'">':'<em>未簽名</em>')+'</div>'+
    '<div><span>客服人員</span>'+
      (t.sigStaff?'<img src="'+esc(t.sigStaff)+'">':'<em>未簽名</em>')+'</div>'+
  '</div>';

  // 稽核軌跡：誰在什麼時候看過，評鑑要看的就是這個
  var steps = [];
  if(t.by) steps.push('送審　<b>'+esc(t.by)+'</b>　'+esc(t.at2||''));
  if(t.mgr) steps.push('副理　<b>'+esc(t.follow||'不需追蹤')+'</b>'+
    (t.mgrNote?('　'+esc(t.mgrNote)):'')+'　'+esc(t.mgrAt||''));
  if(t.boss) steps.push('總經理　<b>'+esc(t.boss)+'</b>　'+
    esc(t.bossNote||'核准')+'　'+esc(t.bossAt||''));
  if(steps.length) h += '<div class="rvsteps">'+steps.join('<br>')+'</div>';

  h += '<button type="button" id="rvSeePdf">看正式服務紀錄表（PDF）</button>';
  $('rvBody').innerHTML = h;
  $('rvSeePdf').addEventListener('click', function(){ $('rvPdfTgl').click(); });
}

/* 正式表只在真的要看紙本樣子時才產生——一天看十幾筆，
   每筆都先跑一次 PDF 是白花時間 */
$('rvPdfTgl').addEventListener('click', function(){
  var t = $('rvPdfTgl');
  if($('rvPdfWrap').style.display !== 'none'){
    $('rvPdfWrap').style.display='none'; $('rvBody').style.display='';
    t.textContent = '正式表';
    return;
  }
  if(RV_PDF_SRC){
    $('rvBody').style.display='none'; $('rvPdfWrap').style.display='';
    t.textContent = '看內容';
    return;
  }
  t.disabled = true; t.textContent = '產生中…';
  google.script.run
    .withSuccessHandler(function(p){
      t.disabled=false; t.textContent='看內容';
      RV_PDF_SRC = 'https://drive.google.com/file/d/'+p.id+'/preview';
      $('rvFrame').src = RV_PDF_SRC;
      $('rvBody').style.display='none'; $('rvPdfWrap').style.display='';
    })
    .withFailureHandler(function(e){
      t.disabled=false; t.textContent='正式表'; toast(e.message, true);
    })
    .exportServiceSheetPdf(CODE, RV_CODE, false);
});

function drawReviewActions(r){
  var role = STAFF_ROLE || (REV && REV.role) || '翻譯';
  /* 副理與總經理自己也跑案場、也要填紀錄。判斷該給「修改／送審」還是
     「批示／核准」，看的不是職稱，而是「這一筆是不是我自己跑的」——
     以前寫死 role==='翻譯'，副理填完自己的紀錄就送不出去。 */
  var me = (REV && REV.me) || STAFF_NAME || '';
  var isMine = !!me && r.crew === me;
  var h = '';
  if(isMine && (r.status === '未送審' || r.status === '退回補正')){
    /* 被退回的一定要能改，不然退回等於沒有作用。
       「修改內容」放在送審上面——被退回時該做的是先改，不是再送一次。 */
    h = '<div class="rvform">'+
        '<button type="button" class="act" id="rvEdit" '+
        /* ⚠ 這兩顆是行內樣式，所以尺度與顏色都要自己照 token 寫：
           圓角只有 --r0/--r1/--r2，字級只有 --t0…--t6，
           填滿式按鈕的底是 --fill 不是 --brand（夜間 --brand 是淺藍，
           白字壓上去只有 2.5:1）。 */
        'style="width:100%;padding:13px;border-radius:var(--r1);border:1px solid var(--line);'+
        'background:var(--card);color:var(--ink);font-size:var(--t2);font-weight:700;'+
        'font-family:inherit;margin-bottom:8px">修改內容</button>'+
        '<button type="button" class="act p" id="rvSubmit" '+
        'style="width:100%;padding:14px;border-radius:var(--r1);border:1px solid var(--fill);'+
        'background:var(--fill);color:var(--fill-ink);font-size:var(--t2);font-weight:700;'+
        'font-family:inherit">送審給副理</button></div>';
  } else if(role === '副理' && r.status === '待副理審'){
    h = '<div class="rvform">'+
      /* 自己跑的自己批，稽核上說不清楚。不擋，但要看得見。 */
      (isMine ? '<p class="hint" style="margin:0 0 9px;color:var(--warn,#b8860b)">'+
                '⚠ 這是你自己跑的紀錄，自己批示留不下第三人的稽核軌跡。</p>' : '')+
      '<label>批示</label>'+
      '<div class="chips" id="rvFollow">'+
        '<label><input type="radio" name="rvf" value="不需追蹤" checked>不需追蹤</label>'+
        '<label><input type="radio" name="rvf" value="需追蹤">需追蹤後續</label>'+
      '</div>'+
      '<input id="rvNote" placeholder="批示說明（需追蹤時請寫清楚要追什麼）">'+
      '<div class="smbtns" style="margin-top:10px">'+
        '<button type="button" id="rvReject">退回補正</button>'+
        '<button type="button" class="p" id="rvOk">批示完成，送總經理</button>'+
      '</div></div>';
  } else if(role === '總經理' && r.status === '待總經理核准'){
    h = '<div class="rvform">'+
      (isMine ? '<p class="hint" style="margin:0 0 9px;color:var(--warn,#b8860b)">'+
                '⚠ 這是你自己跑的紀錄，自己核准留不下第三人的稽核軌跡。</p>' : '')+
      '<input id="rvNote" placeholder="核准意見（選填）">'+
      '<div class="smbtns" style="margin-top:10px">'+
        '<button type="button" id="rvReject">退回補正</button>'+
        '<button type="button" class="p" id="rvOk">核准並歸檔</button>'+
      '</div></div>';
  } else if(role !== '翻譯' && r.status !== '已歸檔' && r.status !== '退回補正'){
    // 還沒輪到自己，但內容有問題還是要能擋下來
    h = '<div class="rvform">'+
      '<p class="hint" style="margin:0 0 9px">'+esc(RV_LABEL[r.status]||r.status)+'</p>'+
      '<button type="button" id="rvReject" style="width:100%;padding:12px;'+
      'border-radius:11px;border:1px solid var(--line);background:var(--card);'+
      'font-size:14px;font-family:inherit">退回補正</button></div>';
  } else {
    /* 只寫「待副理審核」不夠——人會想「那我要改怎麼辦」。
       把「怎麼辦」寫出來，才不會以為是壞掉了或自己少按了什麼。 */
    h = '<p class="hint">'+esc(RV_LABEL[r.status]||r.status)+
        (r.mgr?('　·　副理：'+esc(r.follow||'不需追蹤')):'')+
        (r.boss?('　·　總經理 '+esc(r.boss)):'')+'</p>'+
        (isMine && r.status !== '已歸檔'
          ? '<p class="hint" style="margin-top:6px">送審之後不能修改。要改的話，'+
            '請等副理退回補正。</p>' : '');
  }
  $('rvAct').innerHTML = h;

  var eb = $('rvEdit');
  if(eb) eb.addEventListener('click', function(){ startEdit(RV_CODE); });
  var sb = $('rvSubmit');
  if(sb) sb.addEventListener('click', function(){
    sb.disabled = true;
    google.script.run
      .withSuccessHandler(function(){ toast('已送審'); revBust(); closeReview(); })
      .withFailureHandler(function(e){ sb.disabled=false; toast(e.message,true); })
      .submitForReview(CODE, r.code);
  });

  var ok = $('rvOk');
  if(ok) ok.addEventListener('click', function(){
    ok.disabled = true;
    var note = $('rvNote') ? $('rvNote').value.trim() : '';
    var f = (document.querySelector('input[name=rvf]:checked')||{}).value || '不需追蹤';
    var done = function(){ toast('已完成'); revBust(); closeReview(); };
    var fail = function(e){ ok.disabled=false; toast(e.message,true); };
    if(role === '副理'){
      google.script.run.withSuccessHandler(done).withFailureHandler(fail)
        .managerApprove(CODE, r.code, f, note);
    } else {
      google.script.run.withSuccessHandler(done).withFailureHandler(fail)
        .bossApprove(CODE, r.code, note);
    }
  });

  var rj = $('rvReject');
  if(rj) rj.addEventListener('click', function(){
    // 退回一定要寫原因，翻譯人員在自己的清單就看得到要改什麼
    var why = prompt('退回原因（翻譯人員會看到）：');
    if(!why) return;
    rj.disabled = true;
    google.script.run
      .withSuccessHandler(function(){ toast('已退回'); revBust(); closeReview(); })
      .withFailureHandler(function(e){ rj.disabled=false; toast(e.message,true); })
      .reviewReject(CODE, r.code, why);
  });
}
function refreshBadge(){
  google.script.run.withSuccessHandler(function(rq){
    var bd = $('revBadge');
    if(rq && rq.count){ bd.textContent = rq.count; bd.style.display=''; }
    else bd.style.display='none';
  }).withFailureHandler(function(){}).listReviewQueue(CODE);
}
function closeReview(){
  $('revModal').style.display='none';
  $('rvFrame').removeAttribute('src'); RV_PDF_SRC = '';
  if(REV_AFTER){ REV_AFTER(); REV_AFTER = null; }
}
$('rvClose').addEventListener('click', function(){
  $('revModal').style.display='none';
  $('rvFrame').removeAttribute('src'); RV_PDF_SRC = '';
  REV_AFTER = null;
  hideBack();        // 不收的話，下次從別的地方開會留著上一筆的返回文字
});


function bars(title, rows, total){
  if(!rows.length) return '';
  var mx = rows[0][1] || 1;
  return '<h3>'+esc(title)+'</h3><div class="bars">'+rows.map(function(r){
    return '<div class="r"><div class="l"><b>'+esc(r[0])+'</b><span>'+r[1]+'</span></div>'+
      '<div class="b"><i style="width:'+(r[1]/mx*100).toFixed(1)+'%"></i></div></div>';
  }).join('')+'</div>';
}
/* ── 評鑑進度 ──────────────────────────────────────
   規則（與牟佑彬確認）：只看當年度入境或續聘的人，
   從起算月開始，相鄰兩筆到場紀錄的月份間隔不能超過兩個月，
   而且最後一筆要落在 11 或 12 月。多跑不會多算，重點是不能空窗。 */
var EV = null;
var EV_F = '';          // all | miss | due | ok
var EV_CREW = '';

function loadStat(){
  if(EV){ drawEval(); return; }        // 算過就不要再跑一次
  $('evBody').innerHTML = '<div class="mid">計算中…</div>';
  google.script.run
    .withSuccessHandler(function(r){
      EV = r;
      // 預設先看自己的
      if(EV_CREW === '' && r.crews.indexOf(r.me) !== -1) EV_CREW = r.me;
      drawEval();
    })
    .withFailureHandler(function(e){
      $('evBody').innerHTML = '<div class="mid">'+esc(e.message)+'</div>'; })
    .evalProgress(CODE, 0);
}

/* 三種狀態：
     miss 過去的月份該有沒有——這是真的出問題了
     now  這個月就到期、還沒去——這個月要動的名單
     ok   目前沒問題（後面還有未到期的月份是正常的） */
function evState(r){
  if(r.cell.indexOf('miss') !== -1 || (r.re && r.re.state === 'miss')) return 'miss';
  if(r.gaps.indexOf(EV.nowM) !== -1 ||
     (r.re && r.re.state === 'due' && r.re.to === EV.nowM)) return 'now';
  return 'ok';
}

function drawEval(){
  refreshed();
  var r = EV;
  // 上面的數字跟著人員篩選走——選了自己就只算自己的
  var scope = EV_CREW ? r.rows.filter(function(x){ return x.crew===EV_CREW; }) : r.rows;
  var cnt = function(f){ return scope.filter(f).length; };
  $('evHead').innerHTML =
    '<div class="evsum">'+
      '<div><b>'+scope.length+'</b><span>列入評鑑</span></div>'+
      '<div><b>'+cnt(function(x){ return x.kind==='入境'; })+'</b><span>今年入境</span></div>'+
      '<div><b>'+cnt(function(x){ return x.kind==='續聘'; })+'</b><span>今年續聘</span></div>'+
      '<div class="bad"><b>'+cnt(function(x){ return evState(x)==='miss'; })+
        '</b><span>已缺件</span></div>'+
      '<div class="due"><b>'+cnt(function(x){ return evState(x)==='now'; })+
        '</b><span>本月到期</span></div>'+
    '</div>';

  $('evNote').innerHTML =
    '<p class="evnote">'+esc(r.year)+' 年度。只列當年度入境或續聘的移工。'+
      '<br>'+
      '<i><u style="background:#12674A"></u>有到場紀錄</i>'+
      '<i><u style="background:var(--danger)"></u>該有沒有（已過期）</i>'+
      '<i><u style="background:#C99A3E"></u>還沒到期</i>'+
    '</p>';

  var defs = [{k:'',t:'全部',n:scope.length},
              {k:'miss',t:'已缺件',n:0},{k:'now',t:'本月到期',n:0},
              {k:'ok',t:'目前正常',n:0}];
  scope.forEach(function(x){
    var st = evState(x);
    defs.forEach(function(d){ if(d.k === st) d.n++; });
  });
  $('evFilt').innerHTML = defs.map(function(d){
    return '<button type="button" data-f="'+d.k+'" class="'+(EV_F===d.k?'on':'')+'">'+
      d.t+'<b>'+d.n+'</b></button>'; }).join('');

  // 每個人都看得到別人的——代跑、交接、主管抽查都需要。
  // 但一打開先只看自己的，不然一整頁別人的名字沒人想看。
  $('evCrew').innerHTML =
    '<button type="button" data-c="" class="'+(EV_CREW?'':'on')+'">全部翻譯<b>'+
      r.rows.length+'</b></button>' +
    r.crews.map(function(c){
      var n = r.rows.filter(function(x){ return x.crew===c; }).length;
      return '<button type="button" data-c="'+esc(c)+'" class="'+
        (EV_CREW===c?'on':'')+'">'+esc(c)+'<b>'+n+'</b></button>'; }).join('');

  var list = r.rows.filter(function(x){
    if(EV_F && evState(x) !== EV_F) return false;
    if(EV_CREW && x.crew !== EV_CREW) return false;
    return true;
  });

  var mon = '<div class="evmon">';
  for(var m=1;m<=12;m++) mon += '<span>'+m+'</span>';
  mon += '</div>';

  $('evBody').innerHTML = list.length ? list.map(function(x){
    var st = evState(x);
    var startTxt = (x.kind==='入境'? '入境 ':'續聘 ') + x.start + ' 月';
    var past = x.gaps.filter(function(g){ return g < r.nowM; });
    /* 已經有案件排了行程落在缺的那一格 → 講「已有安排」，不要叫人再排一趟。
       這是追蹤案件接進評鑑最實際的那一條：省掉的是真的車資與人力。 */
    var gap = x.plan ? ('已有安排　'+x.plan.date+'　'+x.plan.kind)
            : past.length ? ('缺 '+past.map(function(g){ return g+'月'; }).join('、'))
            : x.gaps.length ? ('最晚 '+x.gaps[0]+' 月要去')
            : '目前正常';
    return '<div class="evw'+(st==='miss'&&!x.plan?' bad':'')+'">'+
      '<div class="hd"><b>'+esc(x.name)+'</b>'+
        // 家庭類的移工只有原文名，中文名欄位放的就是原文名，不要印兩次
        ((x.orig && x.orig !== x.name)?'<span class="or">'+esc(x.orig)+'</span>':'')+
        '<span class="kd'+(x.kind==='續聘'?' re':'')+'">'+x.kind+' '+x.start+'月</span>'+
        '<span class="st">'+esc(x.crew||'')+'</span></div>'+
      '<div class="sub'+(x.plan?' planned':'')+'">'+esc(x.client)+'　<em>'+esc(x.lang||'')+
        (x.status!=='在職'?('　·　'+esc(x.status)+'，義務到 '+x.endM+' 月'):'')+
        '　·　'+esc(gap)+'</em></div>'+
      mon+
      '<div class="evgrid">'+
        x.cell.map(function(c,i){
          var cls = c + ((i+1)===x.start ? ' start' : '');
          var txt = c==='ok' ? '✓' : c==='miss' ? '✕'
                  : c==='plan' ? '◷' : c==='due' ? '・' : '';
          return '<span class="'+cls+'">'+txt+'</span>';
        }).join('')+
      '</div>'+
      (x.re ? '<div class="evre '+x.re.state+'">續聘文件　'+
        (x.re.state==='ok' ? ('已於 '+x.re.month+' 月簽署')
          : (x.re.from+'～'+x.re.to+' 月之間要簽，'+
             (x.re.state==='miss'?'已逾期':'尚未簽署')))+'</div>' : '')+
    '</div>';
  }).join('') : '<div class="mid" style="padding:30px">這個條件下沒有紀錄</div>';

  [].forEach.call($('evFilt').querySelectorAll('button'), function(b){
    b.addEventListener('click', function(){
      EV_F = (EV_F === b.dataset.f) ? '' : b.dataset.f; drawEval(); });
  });
  [].forEach.call($('evCrew').querySelectorAll('button'), function(b){
    b.addEventListener('click', function(){
      EV_CREW = (EV_CREW === b.dataset.c) ? '' : b.dataset.c; drawEval(); });
  });
}

/* 服務統計改成按了才載：評鑑進度已經要掃一次整張表，
   兩件事一起跑，開這一頁就要等很久。 */
$('statGo').addEventListener('click', function(){
  var b = $('statGo');
  b.disabled = true; b.textContent = '統計中…';
  google.script.run
    .withSuccessHandler(function(s){
      b.style.display = 'none';
      $('statOut').innerHTML =
        '<div class="stat">'+
          '<div><b>'+s.trips+'</b><span>趟服務</span></div>'+
          '<div><b>'+s.people+'</b><span>人次</span></div>'+
          '<div><b>'+s.followOpen+'</b><span>待追蹤</span></div>'+
        '</div>'+
        '<p class="hint">範圍：'+esc(s.range)+'</p>'+
        bars('服務類別', s.byBig)+
        bars('最常做的細項（前 15）', s.bySub)+
        bars('最常跑的客戶（前 15）', s.byClient)+
        bars('翻譯人員', s.byStaff)+
        bars('語別', s.byLang)+
        bars('處理方式', s.byMode);
    })
    .withFailureHandler(function(e){
      b.disabled = false; b.textContent = '載入服務統計'; toast(e.message, true); })
    .serviceStats(CODE, 0);
});

/* ── 追蹤：異常事件／返鄉休假／就醫追蹤／體檢通知 ─────────────
   四件都要追到結束，但性質分兩種，介面也跟著分兩種：

     案件型（異常事件、就醫追蹤）底下掛服務紀錄，看的是一條時間軸。
     排程型（返鄉休假、體檢通知）不掛紀錄，看的是日期到了沒。

   後端 Cases.gs 已經把狀態、逾期天數、退回筆數都算好了，
   這裡不要再算第二次——算兩次就會有一天對不起來。 */
var TK_KINDS = ['異常事件', '返鄉休假', '就醫追蹤', '體檢通知'];
var TK_SHORT = { '異常事件': '異常', '返鄉休假': '返鄉',
                 '就醫追蹤': '就醫', '體檢通知': '體檢' };
var TK_CUR = '異常事件';
/* ⛔ 一種一份快取，不是「只記得最後載的那一種」。
   2026-09-21 之前只有一個 TK_LOADED，切到別的頁籤就把它清掉，
   所以四個頁籤來回按每一次都是「載入中…」——而 listCases 要兩秒多。
   他的原話：「切換這四個頁籤時 不要每次都載入中，需要時 會自行下拉更新」。
   ⚠ 快取沒有時效。要新的就下拉更新——那是他自己說的，也是對的：
     自動過期會在他正在看的時候把畫面洗掉。 */
var TK_CACHE = {};       // { 異常事件: { rows, counts, unit }, … }
var TK_LOADED = '';      // 已經載好的是哪一種，離開再回來時不用重打一次
var TK_UNIT = '件';      // 後端給的單位。「件」數的是案件，不是服務紀錄
var TK_ROWS = [];
var TK_COUNTS = {};

/* ── 三分法（2026-09-22 設計檢視第 7 項）────────────────────

   ⛔ 在這之前，畫面上有**十四個階段詞**（申請中／證件齊／已離境／已回台／
      待通知／已通知／已預約／已預約・已通知／剛開案／處理中／追蹤中／
      治療中／追蹤回診，加上逾期與退回），配**五種顏色**，而顏色跟詞
      各講各的——「還沒排日期」是灰的（看起來可以不管），
      「已離境」是綠的（看起來沒事），可是這兩件都要你動。

   這十四個詞底下只有一個問題：**球在誰手上。**

     在我手上   你現在就能做一件事把它推進去
     在等別人   你做完了，在等工人回、等醫院、等他人在國外
     還沒到我   排好了，時間還沒到，今天不用看它

   ⚠ 詞沒有刪。它們變成小字留在旁邊——要細節的時候還是讀得到，
     但**要記的只有三種顏色**。

   ⚠ 顏色分兩軸，不要混在一起：
       膠囊＝球在誰手上（三分法）
       左邊那條＝有多糟（逾期／被退回才是紅的）
     混在一起的話，「申請中」會跟「逾期 41 天」一樣紅，
     那就是 CLAUDE.md 裡那句「會亂叫的警報比沒有警報更糟」。 */
var BAND_ = {
  me:    { t: '在我手上', c: 'warn' },
  them:  { t: '在等別人', c: 'info' },
  later: { t: '還沒到我', c: 'q'    },
  done:  { t: '已結束',   c: 'ok'   }
};
var BAND_ORDER_ = ['me', 'them', 'later', 'done'];

/* 階段詞 → 三分法。⛔ 這張表就是唯一的事實來源，
   再多一個階段詞就要在這裡表態它屬於哪一類，不可以留空。 */
var PHASE_BAND_ = {
  '申請中': 'me',   '已回台': 'me',   '待通知': 'me',
  '處理中': 'me',   '剛開案': 'me',
  '已通知': 'them', '已離境': 'them', '治療中': 'them',
  '追蹤中': 'them', '追蹤回診': 'them',
  '證件齊': 'later', '已預約': 'later', '已預約・已通知': 'later'
};

function tkBand(c){
  var k = c.state.key;
  if(k === 'closed' || k === 'cancel') return 'done';
  /* 逾期、今天、被退回、還沒有服務紀錄——不管階段是什麼，都回到你手上。 */
  if(k === 'late' || k === 'today' || k === 'back' || k === 'empty') return 'me';
  /* ⛔ 返鄉問 vtState_，不要問階段詞。條子的顏色是 vtState_ 給的，
     膠囊與篩選如果改問 c.phase，同一列就會「條子藍、膠囊琥珀」。
     一個畫面兩套算法遲早有一天對不起來——這裡讓它們同源。 */
  if(c.kind === '返鄉休假' && typeof vtState_ === 'function'){
    return VACT_BAND_[vtState_(c, vtParse_(todayStr()))] || 'me';
  }
  return PHASE_BAND_[c.phase] || 'me';   // 認不得的階段一律當成要你看
}

/* 案件真的有變動（開案、結案、改內容）時把快取整個丟掉。
   ⛔ 只清目前那一種不夠：開一件異常事件會讓「異常」的數字變，
      但四個頁籤上的 badge 是同一次呼叫回來的。 */
function tkBust(){ TK_CACHE = {}; TK_LOADED = ''; TK_ROWS = []; }

/* 膠囊寫**階段詞**（含倒數），顏色照三分法。

   ⛔ 2026-09-23 改回來的：9/22 那一版膠囊上寫的是「在我手上」三個字。
      但 9/23 清單加了分段標題之後，標題已經講了一次「在我手上」，
      膠囊再講一次就是**同一句話在相鄰兩行講兩次**。
      現在：類別由標題講一次，膠囊講這一件現在到哪一步。
      顏色兩邊一致，所以還是一眼看得出誰跟誰同一類。 */
function tkPill(c){
  return '<span class="cst ' + BAND_[tkBand(c)].c + '">' +
    esc(c.state.text) + '</span>';
}

function loadTrack(force){
  if(!$('tkKinds')) return;      // 舊版面沒有這一頁，安靜略過
  drawKinds();
  /* 四種案件共用的那一條提醒。獨立打，不要塞進 listCases——
     那支現在就要 2 秒多了。
     ⛔ 2026-09-22 之前這裡是 hcNudge（只講體檢，卻四個頁籤都出現），
        而體檢頁另外還有一條 hcTodoBar 講重疊的事。合成一條了。 */
  if(typeof tkTodo === 'function') tkTodo();
  /* 手上有這一種的快取就直接畫，不要閃「載入中」。 */
  var hit = TK_CACHE[TK_CUR];
  if(!force && hit){
    TK_ROWS = hit.rows; TK_COUNTS = hit.counts; TK_UNIT = hit.unit;
    TK_LOADED = TK_CUR;
    drawKinds(); drawCases();
    return;
  }
  /* ⛔ 只有「真的沒有東西可以畫」才顯示載入中。
     手上有舊的就先畫舊的——下拉更新的時候整片變成「載入中」
     等於把他正在看的東西拿走。 */
  if(!hit){
    $('tkBody').innerHTML = '<div class="mid" style="padding:26px">載入中…</div>';
  }
  var want = TK_CUR;             // 回來的時候他可能已經切走了
  google.script.run
    .withSuccessHandler(function(r){
      TK_CACHE[want] = { rows: r.rows || [], counts: r.counts || {},
                         unit: r.unit || '件' };
      /* ⚠ 慢回應不可以蓋掉他現在正在看的那一頁籤。 */
      if(want !== TK_CUR){ refreshed(); return; }
      TK_ROWS = TK_CACHE[want].rows;
      TK_LOADED = want;
      TK_COUNTS = TK_CACHE[want].counts;
      TK_UNIT = TK_CACHE[want].unit;
      drawKinds();
      drawCases();
    })
    .withFailureHandler(function(e){
      refreshed();
      /* 手上有舊的就留著，只用 toast 講一聲——
         ⛔ 把畫面換成錯誤訊息等於把他本來看得到的資料弄不見。 */
      if(TK_CACHE[want]) toast(e.message, true);
      else $('tkBody').innerHTML = '<div class="mid" style="padding:26px">' +
        esc(e.message) + '</div>';
    })
    .listCases(CODE, want);
}

if($('tkAdd')) $('tkAdd').addEventListener('click', function(){
  if(TK_CUR === '體檢通知'){
    /* 體檢有自己的開單流程（挑人、算期別、算報到時段），
       ⛔ 不要塞進那個四選一的通用選單——那支只收雇主與移工。 */
    hcMode($('hcPane').style.display === 'none');
    return;
  }
  openPick(null);
});

function drawKinds(){
  $('tkKinds').innerHTML = TK_KINDS.map(function(k){
    var n = TK_COUNTS[k] || 0;
    return '<button type="button" data-k="' + esc(k) + '"' +
      (k === TK_CUR ? ' class="on"' : '') + '>' + esc(TK_SHORT[k]) +
      (n ? '<i class="badge">' + n + '</i>' : '') + '</button>';
  }).join('');
  [].forEach.call($('tkKinds').children, function(b){
    b.addEventListener('click', function(){
      if(b.dataset.k === TK_CUR) return;
      TK_CUR = b.dataset.k;
      /* 離開體檢就把開單表單收起來——留在畫面上，切到「異常」
         卻看到一張體檢單，會以為自己按錯。 */
      hcMode(false);
      /* ⛔ 不要清掉 TK_ROWS／TK_LOADED，也不要 force。
         清掉就等於每次切頁籤都重打一次後端（要兩秒多）。
         要拿新的資料：下拉更新。 */
      loadTrack();
      backToTop();
    });
  });
}

/* 一批案件按三分法分組，回 [{ k, t, n, rows }]，空的那一組不回。
   ⛔ 順序一律照 BAND_ORDER_，不要另外寫一組——兩份排序遲早對不起來。 */
function tkGroups(rows){
  var by = {};
  rows.forEach(function(c){ (by[tkBand(c)] = by[tkBand(c)] || []).push(c); });
  return BAND_ORDER_.filter(function(k){ return by[k] && by[k].length; })
    .map(function(k){
      return { k: k, t: BAND_[k].t, c: BAND_[k].c, n: by[k].length, rows: by[k] };
    });
}

/* 看板（返鄉、體檢）的標頭沿用同一組字。
   ⛔ 看板刻意照日期排——時間順序本身就是資訊，不能拆成三段。
      所以那兩頁把三分法的數量寫進**既有的**標頭列，不另外加一排。 */
function tkTally(rows){
  return tkGroups(rows).map(function(g){
    return '<em class="bnd ' + g.c + '">' + esc(g.t) + ' ' + g.n + '</em>';
  }).join('');
}

function drawCases(){
  refreshed();
  /* ⛔ 2026-09-23：篩選那一排（全部／在我手上／在等別人／還沒到我／已結束）
     整排拿掉了。牟佑彬：「上面的選單和篩選佔用太多空間」——
     iPhone 13 上實測：頂欄 66 ＋ 頁籤 46 ＋ 篩選 46 ＋ 空隙 23 ＝ 181px，
     **螢幕的 21.4% 在第一件事出現之前就用掉了。**

     他選的是「② 篩選變成清單裡的分段標題」。理由：
     **清單本來就已經照三分法排序了，只是沒有人講出來。**
     在每一段前面加一條細標題，捲動就是篩選——
     把一個「模式」（要先選再看）換成「結構」（本來就分好了），
     少一排控制項，而且什麼都沒有藏起來。

     ⚠ 連帶解決了一個對不起來的地方：「要你處理 106 件」跟
       「全部 4」本來挨在上下兩排，但 106 是待辦筆數、4 是案件數。
       兩個單位不同的數字擺這麼近，會讓人以為其中一個算錯了。 */
  var rows = TK_ROWS;

  // 先講一句人話，再列清單。數字一定帶單位（取捨三）。
  /* ⛔ tkLede 2026-09-22 拿掉（牟佑彬）。上面的頁籤與篩選鈕已經把
     同一組數字講過兩次，第三次是雜訊，而且會把開單按鈕擠到螢幕外。 */
  var b2 = $('tkAdd');
  if(b2 && $('hcPane') && $('hcPane').style.display === 'none') b2.textContent = hcAddLabel();

  /* 體檢走自己那一套：一批多人，卡片與排序都跟單人案件不一樣。
     搜尋列只在體檢出現——別的頁籤件數少，多一條輸入框只是雜訊。 */
  if(TK_CUR === '體檢通知'){
    $('tkBody').innerHTML = hcSearchBar();
    hcBindSearch();          // 這一支自己把 #hcList 畫出來並綁點擊
    return;
  }

  if(!rows.length){
    $('tkBody').innerHTML = '<div class="mid" style="padding:26px">' +
      (TK_ROWS.length ? '這個條件下沒有案件' :
        '還沒有' + esc(TK_CUR) + '。上面那顆「＋ 開一件追蹤」就開得了。') + '</div>';
    return;
  }
  /* 返鄉走航廈看板。這個頁籤唯一要回答的問題是
     「誰快走了、誰還沒回來」——一排日期＋目的地＋狀態燈，比通用卡片直接。 */
  /* ⛔ 返鄉走甘特圖，**時間順序本身就是資訊**，不可以拆成三段——
     打散了就看不出誰跟誰的假期疊在一起。它把三分法的數量
     寫進看板標頭（見 vacBoard）。 */
  $('tkBody').innerHTML = (TK_CUR === '返鄉休假')
    ? vacBoard(rows)
    : tkGroups(rows).map(function(g){
        return '<div class="tkband ' + g.c + '">' +
            '<i></i>' + esc(g.t) + '<span>' + g.n + ' 件</span></div>' +
          g.rows.map(caseCard).join('');
      }).join('');
  if(TK_CUR === '返鄉休假'){
    vacWire();
    if(VACL_OPEN_) vaclWire();
    if(VACP_OPEN_) vacGateWire();
    vacGateLoad();
  }
  [].forEach.call($('tkBody').querySelectorAll('[data-case]'), function(el){
    el.addEventListener('click', function(){ openCase(el.dataset.case); });
  });
}

/* ── 航廈看板（返鄉休假專用）──────────────────────────

   牟佑彬 2026-09-22：「希望這個頁籤看起來像是有出國的 feel」。

   ⛔ **借形狀，不借字。** 階段不改成航空術語——「申請中」不會變成
      CHECK-IN、「證件齊」不會變成 BOARDING。那些字看起來很像機場，
      但對不到任何實際狀態，翻譯要判斷的是「這個人還缺什麼」，
      不是猜一個英文詞是什麼意思。
      所以每一列是兩層：上面英文給氣氛，**下面那行小字才是真的階段**。

   ⚠ 看板刻意不跟著日夜模式變（見 app.css 的 .fids）。 */

/* 顏色與標籤。⛔ 只有這五種狀態，不要再加——每多一種，
   工廠裡那台手機上的圖例就多一行。 */
/* ⛔ 顏色交給 CSS，這裡只給 class。寫死色碼等於押注在一種主題上——
   他 2026-09-22 要「日間淺色、夜間深色」，寫死的在另一邊不是刺眼就是看不見。
   st-*  是文字色、bnd-* 是條子的底色，兩組都在 app.css 的 token 區。 */
/* ⛔ 2026-09-22 第 7 項：英文標籤留著（氣氛），**顏色改照三分法**。
   原本 out（人在國外）是綠的、none（還沒排日期）是灰的——
   看起來都像「沒事」，可是 none 明明就是你要去排。
   現在：要你動的一律琥珀，在等別人的一律藍，排好了的才是灰。
   ⚠ 逾期還是紅的——那是嚴重度，不是三分法，見 BAND_ 上面那段。 */
var VACT_BAND_ = { over:'me', none:'me', out:'them', plan:'later', done:'done' };
var VACT_C_ = { over:'st-bad', out:'st-info', plan:'st-dim',
                done:'st-ok', none:'st-warn' };
var VACT_B_ = { over:'bnd-bad', out:'bnd-info', plan:'bnd-dim',
                done:'bnd-ok', none:'bnd-warn' };
var VACT_L_ = { over:'OVERDUE', out:'ABROAD', plan:'PLANNED',
                done:'ARRIVED', none:'NO DATE' };

function vtDay_(a, b){ return Math.round((b - a) / 86400000); }
function vtParse_(s){
  if(!s) return null;
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

/* 一列的狀態。⛔ 先看日期再看階段——階段是後端從日期算的，
   但「該回來了卻還沒結案」這件事只有比對今天才看得出來。 */
function vtState_(c, today){
  var d = c.detail || {};
  var o = vtParse_(d.out), b = vtParse_(d.back);
  if(!o) return 'none';
  if(c.status !== '進行中') return 'done';
  if(b && b < today) return 'over';          // 該回來了卻還沒結案
  if(o <= today && (!b || today <= b)) return 'out';
  if(o > today) return 'plan';
  return 'out';                              // 走了、但沒填回台日
}

/* ── 一人一列：看板與時間軸合而為一 ────────────────

   ⛔ 2026-09-22 之前是兩張表：上面「出境看板」一人一列、
      底下「時間軸」一人一條——**同一批人畫了兩次**，佔兩倍版面，
      而且兩邊各自算各自的，畫面上出現過「7 人在途中」與
      「現在在國外 1 人」同時存在。牟佑彬看到就問要相信哪一個。

   現在一列就是一個人：左邊航線與人、底下那條是他的休假期間、
   右邊是狀態與**去程 › 回程**。

   ⛔ 右邊一定要兩個日期。只印一個的話，「還沒走」印出發日、
      「已經走了」印回台日——**同一個位置兩種意思**，最容易看錯。
      而且接機要提前排、逾期未回是最嚴重的事，回台日不能等人走了才出現。

   點一列 → 就地展開（見 vacExp）。⚠ 一次只開一個。 */

var VAC_STEPS_ = ['申請中', '證件齊', '已離境', '已回台'];
var VACX_ = '';          // 目前展開的是哪一件
var VACP_OPEN_ = false;  // 待處理問卷那一區展開了沒
var VACL_OPEN_ = false;  // 發問卷那一區展開了沒

/* 時間窗固定五個月（上個月 1 號 ～ 三個月後月底）。
   ⛔ 不要改成「把所有人都包進來」。牟佑彬 2026-09-22：
      「休假三個月、或三個月之後才走的，看不到沒關係」——
      自動延伸的話，只要有一個人訂了半年後的票，
      **其他所有人的條子就會被壓成一根細線**。 */
function vacWin_(today){
  var A = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  var B = new Date(today.getFullYear(), today.getMonth() + 4, 1);
  var span = vtDay_(A, B) || 1;
  var ticks = '', cur = new Date(A);
  while(cur < B){
    var nx = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    ticks += '<span style="flex:' + vtDay_(cur, nx) + '">' + (cur.getMonth() + 1) + '月</span>';
    cur = nx;
  }
  return { A:A, B:B, span:span, ticks:ticks, nowPct: vtDay_(A, today) / span * 100 };
}

function vacBoard(rows){
  var today = vtParse_(todayStr());
  var w = vacWin_(today);
  /* ⛔ 逾期要單獨算。三分法只講「球在誰手上」，逾期是**有多糟**——
     兩個軸不能互相取代：「在我手上 2」裡面有一個已經逾期 41 天，
     只印前者等於把最嚴重的事藏起來。
     （「在國外 N」拿掉了——那就是「在等別人」，同一件事講兩次。） */
  var nOver = 0;
  rows.forEach(function(c){ if(vtState_(c, today) === 'over') nOver++; });
  var off = rows.filter(function(c){
    var o = vtParse_((c.detail || {}).out); if(!o) return false;
    var bk = vtParse_(c.detail.back) || new Date(o.getTime() + 30 * 86400000);
    return bk < w.A || o >= w.B;
  });
  var inWin = rows.filter(function(c){ return off.indexOf(c) === -1; });

  return '<div class="vb">' +
    /* ⛔ 三分法的數量寫在這裡，不另外加一排篩選鈕。
       甘特圖照日期排是刻意的，拆成三段就看不出誰跟誰的假期疊在一起。 */
    '<div class="bar"><b>返鄉</b><span class="now">' + tkTally(rows) +
      (nOver ? ('　<em class="bad">逾期 ' + nOver + '</em>') : '') +
      '　今天 ' + esc(todayStr().slice(5).replace('-', '/')) + '</span></div>' +
    '<div class="vtax">' + w.ticks + '</div>' +
    (inWin.length ? inWin.map(function(c){ return vacRow(c, today, w); }).join('')
                  : '<div class="vbempty">這個條件下沒有案件</div>') +
    (off.length ? ('<div class="vtoff">另有 ' + off.length + ' 位不在這五個月裡（' +
      esc(off.map(function(c){
        return (c.workers || '?') + ' ' + c.detail.out.slice(0, 7).replace('-', '/');
      }).join('、')) + '）</div>') : '') +
    '<div class="vbact">' +
      (VACP_.length ? ('<button type="button" class="gate" id="vbGate">問卷 ' +
        VACP_.length + ' 筆待處理</button>') : '') +
      '<button type="button" class="pri" id="vbIssue">' +
        (VACL_OPEN_ ? '收起來' : '發問卷') + '</button>' +
    '</div>' +
    /* ⛔ 圖例一定要跟條子同一組 class。2026-09-22 改成三分法配色時
       這裡忘了跟著改，畫面上「在國外」是藍的、圖例是綠的——
       圖例錯了比沒有圖例更糟。 */
    '<div class="vtlg">' +
      '<span><i class="bnd-warn"></i>' + BAND_.me.t + '</span>' +
      '<span><i class="bnd-info"></i>' + BAND_.them.t + '</span>' +
      '<span><i class="bnd-dim"></i>' + BAND_.later.t + '</span>' +
      '<span><i class="bnd-bad"></i>逾期未回</span>' +
      '<span><i class="tdy"></i>今天</span></div>' +
  '</div>' +
  (VACP_OPEN_ ? ('<div id="vgateBox">' + vacGate() + '</div>') : '') +
  (VACL_OPEN_ ? vacIssue() : '');
}

function vacRow(c, today, w){
  var d = c.detail || {};
  var k = vtState_(c, today), col = VACT_C_[k];
  var open = (VACX_ === c.id);

  /* 航線。⛔ 機場還沒填就寫「回 ○○」或「目的地未定」，不要印 ???——
     那看起來像系統壞了，而不是「這一格他還沒填」。 */
  var route = (d.from && d.to)
    ? (esc(d.from) + ' <i>›</i> ' + esc(d.to) +
       (d.air ? ' <i>' + esc(d.air) + '</i>' : ' <i>未訂票</i>'))
    : (d.toName ? ('回 ' + esc(d.toName) + ' <i>未訂機場</i>') : '<i>目的地未定</i>');

  /* 右欄第三行：**真正的階段** ＋ 還有幾天。
     ⛔ 不可以只印英文。ABROAD／PLANNED 是借航廈的氣氛，
        但「申請中」跟「證件齊」在這裡都算 PLANNED——只印英文的話
        他分不出證件辦好了沒。2026-09-22 合併時漏掉這一條，
        svc_smoke 的「真正的階段還印得出來」把它抓回來了。
     ⚠ 英文給氣氛，下面那行小字才是真的階段。 */
  var o = vtParse_(d.out), bk = vtParse_(d.back);
  var tail = '';
  if(k === 'over')      tail = '逾期 ' + vtDay_(bk, today) + ' 天未回';
  else if(k === 'out')  tail = bk ? ('剩 ' + vtDay_(today, bk) + ' 天回台') : '已離境';
  else if(k === 'plan') tail = vtDay_(today, o) + ' 天後出發';
  else if(k === 'done') tail = '已結案';
  else                  tail = '還沒排';

  var dd = o
    ? (esc(vtMd_(d.out)) + '<i>›</i>' + (bk ? ('<b>' + esc(vtMd_(d.back)) + '</b>') : '—'))
    : '—<i>›</i>—';

  return '<div class="lrow vrow' + (open ? ' on' : '') + '" data-vac="' + esc(c.id) + '">' +
    '<span class="a">' +
      '<span class="rt' + (d.from && d.to ? '' : ' dim') + '">' + route + '</span>' +
      '<span class="nm">' + esc(c.workers || '（未填移工）') + '</span>' +
      '<span class="co">' + esc(c.client || '') + '</span>' +
      vacTrk_(c, today, w, col, k) +
    '</span>' +
    '<span class="b">' +
      '<span class="st ' + col + '">' + VACT_L_[k] + '</span>' +
      '<span class="dd ' + col + '">' + dd + '</span>' +
      '<span class="sub2">' +
        (c.phase ? ('<em>' + esc(c.phase) + '</em>　') : '') +
        esc(tail) + (open ? '　⌃' : '　⌄') + '</span>' +
    '</span>' +
  '</div>' + (open ? vacExp(c, k) : '');
}

function vtMd_(s){ return String(s || '').slice(5).replace('-', '/'); }

/* 那一條。沒有日期的畫整條灰的——⚠ 看板上真的有這種人，
   假裝他不存在的話他會以為所有人都排好了。 */
function vacTrk_(c, today, w, col, k){
  var d = c.detail || {}, line = '<i class="tdy" style="left:' + w.nowPct.toFixed(2) + '%"></i>';
  if(k === 'none') return '<span class="trk"><i class="bnd none"></i>' + line + '</span>';
  var o = vtParse_(d.out);
  var bk = vtParse_(d.back) || new Date(o.getTime() + 30 * 86400000);
  var r0 = vtDay_(w.A, o) / w.span * 100, r1 = vtDay_(w.A, bk) / w.span * 100;
  var s0 = Math.max(0, r0), e0 = Math.min(100, r1);
  var cut = (r0 < 0 ? ' cutl' : '') + (r1 > 100 ? ' cutr' : '');
  return '<span class="trk"><i class="bnd ' + VACT_B_[k] + cut + '" style="left:' +
    s0.toFixed(2) + '%;width:' + Math.max(5, e0 - s0).toFixed(2) + '%"></i>' +
    line + '</span>';
}

/* ── 就地展開 ─────────────────────────────────────

   ⛔ 階段那一排是**唯讀**的。後端 casePhase_ 從日期算出來
      （出發日過了就是已離境、回台日過了就是已回台），
      **沒有「按一下推進去」這回事**。畫成按鈕的話他會一直按，
      按了沒反應比沒有這個東西更糟。

   ⚠ 這裡只放他在工廠最常做的四件事。結案、「這件開錯了」、
     翻服務紀錄留在完整那一頁——少做、而且比較重要，
     不該跟「改個日期」擺在一起誤觸。 */
function vacExp(c, k){
  var d = c.detail || {};
  var at = VAC_STEPS_.indexOf(c.phase || '');
  var steps = VAC_STEPS_.map(function(t, i){
    var cls = i < at ? 'done' : (i === at ? 'cur' : '');
    return '<span class="' + cls + '">' + esc(t) + (i < at ? ' ✓' : '') + '</span>';
  }).join('');

  var STP = [['passport', '護照'], ['arc', '居留證'],
             ['reentry', '重入國'], ['ticket', '機票']];
  var stamps = STP.map(function(x){
    return '<span class="' + (d[x[0]] ? '' : 'no') + '">' + x[1] +
      (d[x[0]] ? ' ✓' : ' ✗') + '</span>';
  }).join('');

  var kv = [];
  if(d.from || d.air){
    kv.push(['去程', [d.air, vtMd_(d.out), d.outTime,
      (d.fromName || d.from) && ((d.fromName || d.from) + ' › ' + (d.toName || d.to || ''))]
      .filter(function(x){ return x; }).join('　')]);
  }
  if(d.back){
    kv.push(['回台', [vtMd_(d.back), d.backTime, d.pickup ? '要接機' : '']
      .filter(function(x){ return x; }).join('　')]);
  }
  if(d.book) kv.push(['機票', d.book]);
  if(d.domConn && d.domAirport) kv.push(['國內轉機', d.domAirport]);
  if(d.bagKg) kv.push(['加購行李', d.bagKg + ' 公斤']);
  if(d.con) kv.push(['海外聯絡', d.con]);

  return '<div class="vexp">' +
    '<div class="vstep">' + steps + '</div>' +
    '<div class="vstamp">' + stamps + '</div>' +
    (kv.length ? ('<dl class="vkv">' + kv.map(function(r){
      return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>';
    }).join('') + '</dl>') : '') +
    '<div class="vacts">' +
      '<button type="button" data-va="next">' +
        (c.nextDate ? '改日期' : '排日期') + '</button>' +
      '<button type="button" data-va="msg">提醒訊息</button>' +
      '<button type="button" data-va="detail">填細節</button>' +
      '<button type="button" class="full" data-va="full">' +
        '打開完整那一頁（結案／開錯了／服務紀錄）</button>' +
    '</div>' +
  '</div>';
}

/* 展開、收合、以及展開區裡那四顆。
   ⚠ 每次 drawCases 重畫都要重接——整段 innerHTML 換掉了。 */
function vacWire(){
  var B = $('tkBody');
  [].forEach.call(B.querySelectorAll('[data-vac]'), function(el){
    el.addEventListener('click', function(){
      /* 一次只開一個。連開三個之後整頁都是細節，就找不到人了。 */
      VACX_ = (VACX_ === el.dataset.vac) ? '' : el.dataset.vac;
      drawCases();
    });
  });
  [].forEach.call(B.querySelectorAll('[data-va]'), function(el){
    el.addEventListener('click', function(ev){
      ev.stopPropagation();       /* 不要連帶把那一列收起來 */
      var c = null;
      TK_ROWS.forEach(function(x){ if(x.id === VACX_) c = x; });
      if(!c) return;
      var a = el.dataset.va;
      if(a === 'full')        openCase(c.id);
      else if(a === 'next')   caseSetNext(c);
      else if(a === 'msg')    openMsg(c, '');
      else if(a === 'detail') openDetailForm(c);
    });
  });
  var g = $('vbGate');
  if(g) g.addEventListener('click', function(){
    VACP_OPEN_ = !VACP_OPEN_; VACL_OPEN_ = false; drawCases();
  });
  var i = $('vbIssue');
  if(i) i.addEventListener('click', function(){
    VACL_OPEN_ = !VACL_OPEN_; VACP_OPEN_ = false; drawCases();
  });
}

/* ── 待處理的問卷（GATE）─────────────────────────────

   工人自己填的問卷不會自動變成案件——問卷是公開網址，
   自動開案的話填錯的、重複的、亂填的都會長在看板上。
   這裡列出來讓他按一下轉成案件，資料自動帶進去，不用重打。

   ⚠ 這一區只在「有待處理」的時候出現。永遠掛一塊空的在那裡，
     兩個禮拜後他就不會再看它了。 */
var VACP_ = [];

function vacGate(){
  if(!VACP_.length) return '';
  return '<div class="vgate">' +
    '<div class="vg1"><b>GATE</b><span>工人填好的問卷 ' + VACP_.length + ' 筆　按一下開成案件</span></div>' +
    VACP_.map(function(q, i){
      var when = q.out ? q.out.slice(5) : '未定';
      return '<div class="vgrow">' +
        '<span class="d">' + esc(when) + '<s>' + (q.dep ? 'FINAL' : 'RETURN') + '</s></span>' +
        '<span class="m"><b>' + esc(q.name || '（沒填姓名）') + '</b>' +
          '<i>' + esc(q.client) + '</i>' +
          '<u>' + esc([q.country, q.book, q.back ? ('回台 ' + q.back.slice(5)) : '']
                        .filter(function(x){ return x; }).join('　·　')) + '</u></span>' +
        '<span class="a">' +
          '<button type="button" class="vgo" data-i="' + i + '">開成案件</button>' +
          '<button type="button" class="vno" data-i="' + i + '">忽略</button>' +
        '</span></div>';
    }).join('') +
  '</div>';
}

/* 抓待處理的問卷。⚠ 失敗就當作沒有——這一區是加分項，
   後端出問題不該讓整個出境看板跟著空白。 */
function vacGateLoad(){
  google.script.run
    .withSuccessHandler(function(r){
      VACP_ = (r && r.rows) || [];
      var box = $('vgateBox');
      if(box){ box.innerHTML = vacGate(); vacGateWire(); }
    })
    .withFailureHandler(function(){})
    .vacPending(CODE);
}

function vacGateWire(){
  var box = $('vgateBox'); if(!box) return;
  [].forEach.call(box.querySelectorAll('.vgo'), function(b){
    b.addEventListener('click', function(){
      var q = VACP_[+b.dataset.i]; if(!q) return;
      b.disabled = true; b.textContent = '開案中…';
      google.script.run
        .withSuccessHandler(function(res){
          toast('已開成 ' + ((res && res.id) || '案件'));
          /* 看板要立刻多出那一筆——重畫會順便再抓一次待處理的問卷。 */
          TK_LOADED = ''; TK_ROWS = []; loadTrack();
        })
        .withFailureHandler(function(err){
          b.disabled = false; b.textContent = '開成案件';
          toast((err && err.message) || '開案失敗', true);
        })
        .vacToCase(CODE, q.row);
    });
  });
  [].forEach.call(box.querySelectorAll('.vno'), function(b){
    b.addEventListener('click', function(){
      var q = VACP_[+b.dataset.i]; if(!q) return;
      if(!confirm('把「' + (q.name || '這一筆') + '」收起來？\n\n' +
                  '那一列還在試算表裡，只是不再出現在這裡。')) return;
      google.script.run
        .withSuccessHandler(function(){ vacGateLoad(); })
        .withFailureHandler(function(err){ toast((err && err.message) || '失敗', true); })
        .vacIgnore(CODE, q.row);
    });
  });
}


/* ── 發問卷給工人（CHECK-IN）────────────────────────────

   牟佑彬 2026-09-22：「返鄉休假到底哪邊可以產生連結給移工填寫」。
   在這之前只有電腦版後台產得出來，但他人在工廠、工人當面跟他說
   「我十一月要回家」——那一刻就要能把連結傳出去。

   ⛔ 不走後端短連結。問卷頁自己讀 ?employer=，所以連結在前端就組得出來，
      不用等一次往返（工廠訊號差的時候那一次往返就是放棄的理由）。
   ⚠ 版面跟著航廈走：這一塊是登機證的存根聯。 */
var VAC_PAGE_ = 'https://mousteven.github.io/yuher-app/vac.html';
/* eid＝名冊上的外國人編號。⛔ 指定給某個人的連結要它才發得出來，
   而它**不會出現在網址上**（流水號，加一就是別人）。
   ⚠ msg／lang 是 2026-09-23 加的：發給工人的那段話由後端照
     名冊上的語別組好帶回來，前端不再自己拼中英雙語。 */
var VACL_ = { cat: 'factory', name: '', eid: '', who: '',
              url: '', msg: '', lang: '' };

var VACL_PK_ = {
  id: 'vaclPk', mode: 'svc', list: [], allowNew: false,
  onPick: function(c){
    VACL_.name = c;
    VACL_.eid = ''; VACL_.who = ''; VACL_.url = ''; VACL_.msg = ''; VACL_.lang = '';
    var v = $('vaclPkVal');
    v.textContent = c; v.classList.add('has'); v.classList.remove('open');
    $('vaclPkPop').style.display = 'none';
    vaclWorkers();
    vaclPaint();
  }
};

/* 這一家名冊上有哪些人。⚠ 名單來自 PRESETS（每月匯入一次），
   這個月新接的雇主還不在裡面——那時候只能發整家共用的。 */
function vaclWorkers(){
  var sel = $('vaclWho'); if(!sel) return;
  var pz = presetOf(VACL_.name);
  var ws = (pz && pz.w) || [];
  sel.innerHTML = '<option value="">不指定（整家共用）</option>' +
    ws.filter(function(w){ return w.e; }).map(function(w){
      return '<option value="' + esc(w.e) + '">' + esc(w.n) +
        (w.o ? ('　' + esc(w.o)) : '') + '</option>';
    }).join('');
  if(!ws.length){
    sel.innerHTML = '<option value="">名冊上這家沒有人</option>';
  }
}

/* 整家共用的那一條在前端就組得出來（問卷頁自己讀 ?employer=）。
   ⛔ 指定給某個人的那一條**一定要向後端拿**——網址上只放一組
      猜不到的代碼，姓名與手機由後端憑代碼給。 */
function vaclUrl(){
  if(VACL_.eid) return VACL_.url;          // 後端給的那一條
  if(!VACL_.name) return '';
  return VAC_PAGE_ + '?employer=' + encodeURIComponent(VACL_.name) +
         '&cat=' + VACL_.cat;
}

/* 選了某個人 → 跟後端要一條他專用的。 */
function vaclMint(){
  var box = $('vaclOut');
  if(box) box.innerHTML = '<span class="bphint">產生連結中…</span>';
  google.script.run
    .withSuccessHandler(function(r){
      if(!r || !r.ok){ VACL_.eid = ''; vaclPaint(); return; }
      VACL_.url = r.url;
      VACL_.who = r.name || VACL_.who;
      /* 訊息由後端組（只有它有 I18n.gs 那六句審過的標題）。
         ⚠ 舊版後端不會回 msg，vaclPaint 會退回中英雙語那一版。 */
      VACL_.msg = r.msg || '';
      VACL_.lang = r.lang || '';
      vaclPaint(r.phone);
    })
    .withFailureHandler(function(e){
      VACL_.eid = ''; VACL_.url = ''; VACL_.msg = ''; VACL_.lang = '';
      toast((e && e.message) || '產生連結失敗', true);
      vaclPaint();
    })
    .vacInvite(CODE, VACL_.eid);
}

function vacIssue(){
  return '<div class="bpass">' +
    '<div class="bp1"><b>CHECK-IN</b><span>發問卷給工人</span></div>' +
    '<div class="bp2">' +
      '<div class="bpf"><label>PASSENGER / 雇主</label>' +
        '<div class="epk" id="vaclPk">' +
          '<button type="button" class="epkval" id="vaclPkVal">請選擇…</button>' +
          '<div class="epkpop" id="vaclPkPop" style="display:none">' +
            '<input id="vaclPkQ" placeholder="打一個字就會出現" autocomplete="off">' +
            '<div id="vaclPkBox"></div>' +
          '</div></div></div>' +
      '<div class="bpf"><label>CLASS / 類別</label>' +
        '<select id="vaclCat"><option value="factory">工廠</option>' +
        '<option value="caretaker">家庭雇主</option></select></div>' +
    '</div>' +
    /* ⛔ 指定移工之後，連結就是「他本人的」——打開來姓名與手機
       已經帶好了。不指定的話是整家共用的空白表。
       ⚠ 兩種都要留：他常常是先傳給整個工廠群組，
         但也常常是某個人當面跟他講「我十一月要回家」。 */
    '<div class="bp2"><div class="bpf" style="flex:1">' +
      '<label>NAME / 移工（可不選）</label>' +
      '<select id="vaclWho"><option value="">先選雇主…</option></select>' +
    '</div></div>' +
    '<div class="bp3" id="vaclOut"></div>' +
  '</div>';
}

/* 畫面重繪之後要重接一次——vacBoard 每次都是整段換掉 innerHTML。 */
function vaclWire(){
  if(!$('vaclPkVal')) return;
  vaclFill();
  pkWire(VACL_PK_);
  $('vaclCat').value = VACL_.cat;
  $('vaclCat').addEventListener('change', function(){
    VACL_.cat = this.value;
    VACL_.name = ''; VACL_.eid = ''; VACL_.who = ''; VACL_.url = ''; VACL_.msg = ''; VACL_.lang = '';
    $('vaclPkVal').textContent = '請選擇…';
    $('vaclPkVal').classList.remove('has');
    vaclFill(); vaclPaint();
  });
  if(VACL_.name){
    $('vaclPkVal').textContent = VACL_.name;
    $('vaclPkVal').classList.add('has');
    vaclWorkers();
    if(VACL_.eid) $('vaclWho').value = VACL_.eid;
  }
  $('vaclWho').addEventListener('change', function(){
    VACL_.eid = this.value;
    VACL_.who = this.value ? this.options[this.selectedIndex].textContent.split('　')[0] : '';
    VACL_.url = ''; VACL_.msg = ''; VACL_.lang = '';
    if(VACL_.eid) vaclMint(); else vaclPaint();
  });
  vaclPaint();
}

function vaclFill(){
  var kind = VACL_.cat === 'caretaker' ? '家庭雇主' : '工廠';
  VACL_PK_.list = PRESETS.filter(function(x){ return (x.t || '工廠') === kind; })
                         .map(pkFromPreset_);
}

function vaclPaint(phone){
  var box = $('vaclOut'); if(!box) return;
  var url = vaclUrl();
  if(!url){
    box.innerHTML = '<span class="bphint">選一家雇主，就會產生那一家專用的連結</span>';
    return;
  }
  /* 指定給某個人的時候講清楚兩件事：這條是誰的、他的電話帶到了沒。
     ⚠ 沒帶到不是錯——名冊上本來就有人沒留電話，問卷會讓他自己填。 */
  var tag = VACL_.eid
    ? ('<div class="bpwho"><b>' + esc(VACL_.who || '這一位') + '</b> 專用' +
       (phone ? ('　<i>手機 ' + esc(phone) + ' 已帶入</i>')
              : '　<i class="warn">名冊上沒有手機，會請他自己填</i>') + '</div>')
    : '';
  /* ⛔ 2026-09-23：這一段本來寫死中英雙語，
     **越南籍與泰籍工人收到的是兩種他都看不懂的文字**。
     現在由後端照名冊上的語別組好（vacInviteMsg_），
     連結也直接帶 &lang=，打開就是他的語言，不用自己選。
     ⚠ 沒指定人（整家共用）的那一條不知道是誰要收，維持中英雙語。 */
  var txt = VACL_.msg || ('【返鄉休假 / 期滿離境問卷】\n' +
    (VACL_.who ? (VACL_.who + '\n') : '') +
    'Vacation / Final Departure Questionnaire\n' +
    '請點連結，選你的語言後填寫。\n' +
    'Please tap the link, choose your language and fill it in.\n' + url);
  box.innerHTML = tag +
    '<code class="bpurl">' + esc(url) + '</code>' +
    '<div class="bpbtn">' +
      '<a class="line" target="_blank" rel="noopener" ' +
        'href="https://line.me/R/msg/text/?' + encodeURIComponent(txt) + '">傳到 LINE</a>' +
      '<button type="button" id="vaclCopy">複製連結</button>' +
    '</div>';
  var cp = $('vaclCopy');
  cp.addEventListener('click', function(){
    var done = function(){ cp.textContent = '已複製';
      setTimeout(function(){ cp.textContent = '複製連結'; }, 1600); };
    /* clipboard 在 iframe 裡常常沒權限，失敗就把網址選起來讓他長按複製——
       比按了完全沒反應好。 */
    try { navigator.clipboard.writeText(url).then(done, vaclSel); }
    catch(e){ vaclSel(); }
  });
}

function vaclSel(){
  var el = $('vaclOut') && $('vaclOut').querySelector('.bpurl');
  if(!el) return;
  var r = document.createRange(); r.selectNodeContents(el);
  var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
}

/* 摘要一句話。照「先講結論」的規矩：不要寫「共 6 件」，
   要寫「3 件超過 7 天還沒結案」——人看完就知道下一步做什麼。 */
/* ⛔ tkLede 2026-09-22 整支刪掉（牟佑彬指定）。
   它印的是「3 件進行中／沒有逾期的…」——但上面的頁籤 badge 與
   篩選鈕（快到了 1 · 進行中 3 · 已結案）已經把同一組數字講過兩次了。
   第三次是雜訊，而且它把真正要用的東西（開單按鈕）擠到螢幕外面。
   ⚠ 要復活的話記得：同一個數字在一個畫面上只講一次。 */


/* 四張證件 ＋ 行李條。
   ⚠ 行李條只有勾了加購才出現——空的元件比沒有元件難看。 */
var VAC_STAMP_ = [['passport', '護照'], ['arc', '居留證'],
                  ['reentry', '重入國'], ['ticket', '機票']];
function vacStamps(d){
  var h = '<div class="stamps">' + VAC_STAMP_.map(function(x){
    return '<div class="stp ' + (d[x[0]] ? 'on' : 'miss') + '">' +
      '<b>' + esc(x[1]) + '</b></div>';
  }).join('') + '</div>';
  var kg = String(d.bagKg || '').trim();
  if(kg){
    h += '<div class="tag2"><span class="n">+' + esc(kg.replace(/[^0-9.]/g, '') || kg) +
      '</span><span class="t"><b>加購託運行李　' + esc(kg) + ' 公斤</b>' +
      '費用由旅行社／車行另外報價</span></div>';
  }
  return h;
}

function caseCard(c){
  /* ⛔ 左邊那條是**嚴重度**，不是三分法。只有逾期與被退回才紅——
     膠囊已經講了球在誰手上，兩個東西講同一件事就沒有一個在講嚴重度了。 */
  var cls = c.state.key === 'back' || c.state.key === 'late' ? 'bad'
          : c.state.key === 'closed' ? 'done'
          : c.state.key === 'cancel' ? 'cancel' : 'plan';
  var foot = '';
  if(c.recCount || CASE_FORM_[c.kind]){
    foot = '<span class="crecs"><b>' + c.recCount + '</b> 筆服務紀錄' +
      (c.badCount ? '　·　<em>' + c.badCount + ' 筆被退回</em>' : '') + '</span>';
  } else if(c.nextDate){
    foot = '<span class="crecs">下一步　<b>' + esc(c.nextDate) + '</b>' +
      (c.nextNote ? '　' + esc(c.nextNote) : '') + '</span>';
  }
  /* 開案日與負責人從第一行挪到最底下。第一行的位置要留給
     「球在誰手上」＋「現在到哪一步」，那才是掃過去要看的。 */
  var by = [];
  if(c.openedAt) by.push('開案 ' + shortDate_(c.openedAt));
  if(c.crew) by.push(c.crew);
  return '<div class="ev ' + cls + '" data-case="' + esc(c.id) + '">' +
    '<span class="bar lg-' + esc((c.lang || '').split('、')[0]) + '"></span>' +
    '<span class="b">' +
      '<span class="t">' + tkPill(c) + '</span>' +
      '<span class="n">' + esc(c.workers || c.client) + '</span>' +
      '<span class="m">' + esc(c.title || c.sub || c.kind) +
        (c.workers ? '　·　' + esc(c.client) : '') +
        '　<span class="code">' + esc(c.id) + '</span></span>' +
      foot +
      (by.length ? ('<span class="cby">' + esc(by.join('　·　')) + '</span>') : '') +
    '</span></div>';
}

/* 哪幾種底下掛服務紀錄。跟後端 CASE_KINDS_ 的 form 對應——
   案件型看時間軸、排程型看日期，整個版面就是由這一個布林決定的。 */
var CASE_FORM_ = { '異常事件': 1, '就醫追蹤': 1, '返鄉休假': 0, '體檢通知': 0 };

/* ── 案件詳情 ─────────────────────────────────────── */
var CK_CUR = null;

function openCase(id){
  if(!$('caseModal')){ toast('要先更新 App 才有追蹤功能', true); return; }
  // 欄位定義只抓一次，之後開任何案件都用同一份
  loadSchema(function(){});
  $('ckBody').innerHTML = '<div class="mid" style="padding:30px">讀取中…</div>';
  $('ckAct').innerHTML = '';
  $('caseModal').style.display = '';
  $('ckBody').scrollTop = 0;
  google.script.run
    .withSuccessHandler(function(r){
      CK_CUR = r.c;
      drawCase(r.c);
    })
    .withFailureHandler(function(e){
      $('ckBody').innerHTML = '<div class="mid" style="padding:30px">' +
        esc(e.message) + '</div>';
    })
    .getCase(CODE, id);
}

function drawCase(c){
  $('ckTitle').textContent = c.kind;
  /* ⛔ 改版時我把案件編號從這裡拿掉了，結果它只剩服務表看得到，
     點「看整串」進來反而不見，想核對也核對不到。補回去。 */
  $('ckSub').textContent = (c.workers || c.client || '') +
    '　·　' + c.id + '　·　' + c.state.text;
  $('ckBody').innerHTML = caseSummary(c) + caseLine(c);
  drawCaseActions(c);
  bindCase(c);
  caseLooseHint(c);
  /* 體檢通知的案子多一塊：每個人確認了沒、分到哪一車、報到了沒。
     一件案子底下有一整批人，那是其他三種類型沒有的形狀。 */
  if(c.kind === '體檢通知') hcCaseBlock(c.id);
}

/* 摘要：第一眼要回答「誰、什麼事、現在到哪一步」。
   移工的名字放最大——以前它埋在第二張卡的第一列。 */
function caseSummary(c){
  var open = c.status === '進行中';
  var h = '<div class="c6sum">' +
    '<div class="c6who">' + esc(c.workers || '（未填移工）') + '</div>' +
    '<div class="c6at">' + esc(c.client) +
      (c.sub ? '　·　' + esc(c.sub) : '') + '</div>';

  /* ⛔ 這裡以前有「治療中／追蹤回診／待結案」三顆按鈕給人手動切。
     2026-09-19 拿掉了。他的原話：「你放上去有時候也會人家忘了去更改，
     所以說我覺得沒有必要」——他是對的，而且沒人更新的狀態比沒有狀態更糟：
     它會肯定地告訴你一件錯的事。而且當時還有兩套狀態在打架
     （這三格 vs 標題上系統算的那行）。現在只剩後端 casePhase_ 算的那一個。 */
  h += '<div class="c6now">' + esc(c.state.text) + '</div>';

  /* 一行 meta。空的欄位不要留「—」，一整排破折號看起來像壞掉。 */
  var m = [];
  if(c.crew) m.push('負責 <b>' + esc(c.crew) + '</b>');
  if(c.openedAt) m.push('開案 <b>' + esc(shortDate_(c.openedAt)) + '</b>');
  m.push('已服務 <b>' + c.items.length + ' 次</b>');
  if(!open) m.push('<b>' + esc(c.status) + '</b>');
  h += '<div class="c6meta">' + m.map(function(x){
    return '<span>' + x + '</span>'; }).join('') + '</div>';

  /* 登機證與掛號單只在「真的有東西」的時候畫。
     ⛔ 以前只要有 nextDate 就畫，結果畫出一張「尚未指定醫院」的空單——
     那個日期現在在時間軸的「下一次」那一格，這裡不用重複。 */
  h += '</div>';
  var d = c.detail || {};
  var bpShown = false;
  if(c.kind === '返鄉休假'){
    var bp = bpHtml(c);
    if(bp){ h += bp; bpShown = true; }
  }
  /* ⛔ 這裡以前還會畫一張「掛號單」（醫院／科別／看診號）。
     2026-09-19 他要求拿掉：那些欄位底下「就醫追蹤的細節」那張卡已經
     完整列出來了，兩塊在講同一件事，而且還會互相矛盾——
     掛號單寫「未約」，細節卡卻有看診號 15。 */

  if(c.link){
    h += '<div class="c6link" data-go="' + esc(c.link.id) + '">' +
      '<span>相關案件　<b>' + esc(c.link.kind) + '　' + esc(c.link.id) + '</b>　' +
      esc(c.link.status) + '</span><span class="go">›</span></div>';
  }

  /* 填好的細節才顯示。沒填的走時間軸最後那一格的「填細節」。
     ⛔ 上面已經畫了登機證的話，那 10 個欄位不要再列一次（2026-09-20）。 */
  var defs = (CK_SCHEMA && CK_SCHEMA.fields && CK_SCHEMA.fields[c.kind]) || [];
  var hidden = bpShown ? BP_SHOWN_ : [];
  var rows = defs.filter(function(f){
    if(hidden.indexOf(f.k) !== -1) return false;
    return f.t === 'check' ? d[f.k] : (d[f.k] !== undefined && d[f.k] !== '');
  });
  /* 返鄉：四張證件畫成通關章，比四個勾選框好懂，缺哪一張一眼看到。
     ⛔ 只在登機證有畫出來的時候才接在後面——沒訂票的案子連機場都還沒有，
        單獨一排章沒有上下文。 */
  if(bpShown && c.kind === '返鄉休假'){
    h += vacStamps(d);
  }
  if(rows.length){
    h += '<div class="c6det"><p class="c6dh">' + esc(c.kind) + '的細節' +
      '<button type="button" class="c6edit" id="ckEdit">修改</button></p>' +
      '<dl class="ckv">' + rows.map(function(f){
        /* ⛔ 醫院那一欄存的是「中文|English|地址|地標|地圖網址」整條，
           原樣印出來是一條看不完的管線，而且網址撐爆版面。
           這裡只顯示中文名——要地址地圖的是工人，不是翻譯，
           那些已經送到工人那一頁上了。 */
        var v2 = (f.k === 'hos') ? String(d[f.k]).split('|')[0].trim() : d[f.k];
        /* link 型別是工人上傳的檔案（機票照片）。
           ⛔ 印出一長條 Drive 網址沒有人看得懂，要給一顆點得開的。 */
        if(f.t === 'link'){
          return '<dt>' + esc(f.l) + '</dt><dd>' +
            '<a href="' + esc(v2) + '" target="_blank" rel="noopener">開啟</a></dd>';
        }
        return '<dt>' + esc(f.l) + '</dt><dd>' +
          (f.t === 'check' ? '✓' : esc(v2)) + '</dd>';
      }).join('') + '</dl></div>';
  }
  return h;
}

/* 整件事就是一條線：開案 → 每一次服務 → 下一次 → 結案。
   動作掛在對應的那一格旁邊，不要全部堆到螢幕最底下——
   「改回診日期」放在「要回診」旁邊，比跟其他三顆擠在一起清楚太多。 */
function caseLine(c){
  var open = c.status === '進行中';
  var NEXT_T = { '就醫追蹤': '回診', '體檢通知': '體檢', '返鄉休假': '回台' };
  var what = NEXT_T[c.kind] || '下一次';
  var h = '<div class="c6line">';

  /* ⛔ 這裡以前有一格「開案」。2026-09-19 拿掉：
     他說會讓人搞糊塗，確實——那一格沒有任何動作可做，而且案子常常是
     事後補開的，「開案 9/19」會排在「服務 9/2」前面，看起來像時間倒著走。
     開案日已經寫在摘要卡的 meta 那一行，不用在時間軸上再占一格。 */

  c.items.forEach(function(it, i){
    var last = i === c.items.length - 1;
    var acts = '<a data-rv="' + esc(it.rec) + '">看這張表</a>';
    if(open) acts += '<a class="rm" data-off="' + esc(it.rec) + '">從這串拿掉</a>';
    h += c6row(last ? 'now' : 'ok', String(i + 1), shortDate_(it.date),
      it.sub || '服務紀錄',
      esc(it.rec) + '　' + esc(RV_LABEL[it.rv] || it.rv) +
        (it.primary ? '' : '　關聯案件的') + c6grid(it),
      acts);
  });

  if(!c.items.length && CASE_FORM_[c.kind]){
    h += c6row('', '—', '', '還沒有服務紀錄',
      '從行事曆的行程往左推到「追蹤」，或按底下那顆開一張。', '');
  }

  if(open){
    var when = c.nextDate ? (shortDate_(c.nextDate) +
      (c.nextIn ? '' : '')) : '未排';
    var acts = '';
    if(CASE_FORM_[c.kind]) acts += '<a data-a="new">＋ 開一筆</a>';
    acts += '<a data-a="next">' + (c.nextDate ? '改日期' : '排日期') + '</a>';
    if(c.kind !== '異常事件') acts += '<a data-a="msg">提醒訊息</a>';
    h += c6row('next', '!', when, '要' + what,
      c.nextDate
        ? (esc(c.nextNote || '') || '行事曆上已經排好一筆了')
        : '還沒排。排了會自動出現在行事曆上。', acts);

    var ca = '';
    var defs = (CK_SCHEMA && CK_SCHEMA.fields && CK_SCHEMA.fields[c.kind]) || [];
    if(defs.length) ca += '<a data-a="detail">填細節</a>';
    if(c.kind === '異常事件' && !c.link) ca += '<a data-a="med">開一筆就醫追蹤</a>';
    ca += '<a data-a="close">結案</a>';
    ca += '<a class="rm" data-a="cancel">這件開錯了</a>';
    h += c6row('', '', '之後', '結案',
      '全部的服務紀錄都歸檔之後才結得掉。', ca);
  } else {
    h += c6row('ok', '✓', shortDate_(c.closedAt), esc(c.status),
      esc(c.result || ''), '');
  }
  return h + '</div><div id="ckHint"></div>';
}

/* 時間軸上的服務內容：四個固定欄位排成兩欄格線（他挑的排法 F）。
     做了　罐頭選項　　　　淡的，每一筆都長得差不多，是雜訊
     細節　人自己補寫的　　深的＋淡色底，這才分得出發生什麼事
     結果　罐頭選項　　　　淡的
     交代　人自己補寫的　　深的＋淡色底
   空的欄位整列不出現——一整排「—」看起來像壞掉。

   ⚠「細節」不要寫成「現場」。那個詞只對「帶工人去醫院」成立，
   電話詢問、文件送達、收取證件的補充寫「現場」會很怪。 */
function c6grid(it){
  var rows = [
    ['做了', it.how,    0],
    ['細節', it.hnote,  1],
    ['結果', it.result, 0],
    ['交代', it.rnote,  1]
  ].filter(function(r){ return r[1]; });
  if(!rows.length) return '';
  return '<dl class="c6g">' + rows.map(function(r){
    return '<dt>' + r[0] + '</dt><dd' + (r[2] ? ' class="hi"' : '') + '>' +
      esc(r[1]) + '</dd>';
  }).join('') + '</dl>';
}

function c6row(cls, dot, when, title, body, acts){
  return '<div class="c6i ' + cls + '"><span class="d">' + esc(dot) + '</span>' +
    '<div class="c">' + (when ? '<em>' + esc(when) + '</em>' : '') +
    '<b>' + esc(title) + '</b>' +
    (body ? '<p>' + body + '</p>' : '') +
    (acts ? '<span class="c6a">' + acts + '</span>' : '') +
    '</div></div>';
}

/* 底下只剩一顆。其餘的動作都在時間軸上它該在的那一格旁邊。 */
function drawCaseActions(c){
  var h = '';
  if(c.status === '進行中' && CASE_FORM_[c.kind]){
    h = '<button type="button" class="p full" id="ckNew">＋ 新增一筆服務紀錄</button>';
  }
  $('ckAct').innerHTML = h ? ('<div class="stack">' + h + '</div>') : '';
  if($('ckNew')) $('ckNew').addEventListener('click', function(){ caseNewRecord(c); });
}

/* 所有點擊集中綁一次。時間軸的動作是 <a data-a>，服務紀錄是 <a data-rv>。 */
function bindCase(c){
  var B = $('ckBody');
  var ACT = {
    'new':    function(){ caseNewRecord(c); },
    'next':   function(){ caseSetNext(c); },
    'msg':    function(){
      openMsg(c, '');
      /* 體檢的「已通知」是唯一算不出來的（訊息到底發了沒）。
         做了這件事本來就等於通知了，順手記起來，不要再要人多按一次。 */
      if(c.kind === '體檢通知' && !(c.detail || {}).noticeAt){
        google.script.run.withSuccessHandler(function(){})
          .withFailureHandler(function(){})
          .setCaseDetail(CODE, c.id, { noticeAt: new Date().toISOString().slice(0,10) });
      }
    },
    'med':    function(){ caseSpawnMed(c); },
    'detail': function(){ openDetailForm(c); },
    'close':  function(){ caseClose(c); },
    'cancel': function(){ caseCancelAll(c); }
  };
  [].forEach.call(B.querySelectorAll('[data-a]'), function(el){
    el.addEventListener('click', function(){ (ACT[el.dataset.a] || function(){})(); });
  });
  [].forEach.call(B.querySelectorAll('[data-rv]'), function(el){
    el.addEventListener('click', function(){
      $('caseModal').style.display = 'none';
      openRecord(el.dataset.rv, { caseBack: c.id, rec: el.dataset.rv,
        label: c.kind, name: c.workers || c.client || '' });
    });
  });
  [].forEach.call(B.querySelectorAll('[data-off]'), function(el){
    el.addEventListener('click', function(){ caseDetach(c, el.dataset.off); });
  });
  var ed = $('ckEdit');
  if(ed) ed.addEventListener('click', function(){ openDetailForm(c); });
  var lk = B.querySelector('.c6link');
  if(lk) lk.addEventListener('click', function(){ openCase(lk.dataset.go); });
}

/* 把一筆從這串拿掉。
   ⛔ 確認訊息一定要寫「不會怎樣」——「服務紀錄本身不會刪掉」這一句
   比什麼都重要。不寫，沒有人敢按，錯的資料就會一直放著。 */
function caseDetach(c, rec){
  var n = c.items.length - 1;
  if(!confirm('把這一筆從「' + c.kind + '」拿掉？\n\n' +
      '· 服務紀錄本身不會刪掉，行事曆與查詢裡都還在\n' +
      '· 它只是不再算進這件事，這串會剩 ' + n + ' 筆\n' +
      '· 之後隨時可以再加回來')) return;
  google.script.run
    .withSuccessHandler(function(){
      TK_LOADED = '';
      if(n === 0) askCancelEmpty(c); else { toast('已從這串拿掉'); openCase(c.id); }
    })
    .withFailureHandler(function(e){ toast(e.message, true); })
    .detachRecord(CODE, c.id, rec);
}

/* 拿掉最後一筆之後順便問。不問的話，空的一串會一直留在追蹤頁製造困惑。 */
function askCancelEmpty(c){
  if(confirm('這串已經沒有任何服務紀錄了。\n\n' +
      '整件「' + c.kind + ' ' + c.id + '」要一起取消嗎？\n\n' +
      '· 先留著：之後還可以把服務放回來\n' +
      '· 取消整件：追蹤那一頁不會再出現它，自動排的行程也會收掉')){
    doCancelCase(c, '拿掉最後一筆之後一起取消');
  } else { toast('已從這串拿掉'); openCase(c.id); }
}

function caseCancelAll(c){
  var why = prompt('這件開錯了要取消。\n請寫一句原因（之後查得到）：', '');
  if(why === null) return;
  doCancelCase(c, why || '（未填原因）');
}
function doCancelCase(c, why){
  google.script.run
    .withSuccessHandler(function(){
      toast('已取消整件');
      $('caseModal').style.display = 'none';
      TK_LOADED = ''; TK_ROWS = []; loadTrack();
    })
    .withFailureHandler(function(e){ toast(e.message, true); })
    .cancelCase(CODE, c.id, why);
}

/* 「這位移工還有 N 筆沒歸案」。另外打一支，不要拖慢案件頁的顯示。
   這是「一開始不問」那個做法的另一半：建案當下不逼他挑，
   案件建好之後在這裡輕輕提一句，要理不理都可以。 */
function caseLooseHint(c){
  if(c.status !== '進行中') return;
  google.script.run
    .withSuccessHandler(function(r){
      if(!r || !r.ok || !r.n || !$('ckHint')) return;
      $('ckHint').innerHTML = '<div class="c6sug"><span class="ic">◷</span>' +
        '<span class="c"><b>' + esc((c.workers || '').split('、')[0] || '這位移工') +
        '還有 ' + r.n + ' 筆沒歸在任何一串底下</b>' +
        (r.near ? '<span>其中 ' + r.near + ' 筆在這件前後兩個月內</span>' : '') +
        '</span><span class="go">看看 ›</span></div>';
      $('ckHint').firstChild.addEventListener('click', function(){
        openLoosePick({ mode: 'add', caseId: c.id, kind: c.kind,
          worker: (c.workers || '').split('、')[0], client: c.client,
          nearDate: c.openedAt, big: c.big,
          exclude: c.items.map(function(x){ return x.rec; }) });
      });
    })
    .withFailureHandler(function(){})
    .caseLooseHint(CODE, c.id);
}

/* ── 挑選還沒歸案的服務 ─────────────────────────────
   2026-09-19。他問「一年 30 筆的話會不會找太久」——會，所以這一頁
   刻意不給全部：後端 looseRecordsFor 預設只回 5 筆，排序也在那裡。

   前端只負責三件事：分組顯示、寫出分母、搜尋。

   ⛔ 一列一定要有「處理經過 · 結果」那一行。少了它，同一位移工一年
   五筆「文件送達／領回」長得一模一樣，人只能用猜的。 */
var LP_ = null;

function openLoosePick(o){
  if(!$('lpModal')){ toast('要先更新 App', true); return; }
  LP_ = { o: o, rows: [], sel: {}, all: false, kw: '', step: 'pick' };
  $('lpTitle').textContent = '還要一起放進來嗎？';
  $('lpWho').textContent = (o.worker || o.client || '') + '　' + (o.kind || '');
  $('lpKw').value = '';
  $('lpModal').style.display = '';
  $('lpBody').scrollTop = 0;
  lpLoad();
}
function closeLoosePick(){ $('lpModal').style.display = 'none'; LP_ = null; }

function lpLoad(){
  var o = LP_.o;
  $('lpList').innerHTML = '<div class="mid" style="padding:26px">讀取中…</div>';
  google.script.run
    .withSuccessHandler(function(r){
      if(!LP_) return;
      LP_.rows = r.rows || []; LP_.info = r;
      drawLoosePick();
    })
    .withFailureHandler(function(e){
      if(!LP_) return;
      $('lpList').innerHTML = '<div class="mid" style="padding:26px">' +
        esc(e.message) + '</div>';
    })
    .looseRecordsFor(CODE, { worker: o.worker, client: o.client,
      nearDate: o.nearDate, big: o.big, exclude: o.exclude || [],
      kw: LP_.kw, all: LP_.all });
}

/* 分組：同一大類又時間相近的最可能，其餘次之，已歸案的鎖住排最後。
   規則跟後端的 scoreLoose_ 對得上，不要各自發明一套。 */
function lpBucket(r){
  if(r.caseId) return 2;
  return (LP_.o.big && r.big === LP_.o.big && r.days <= (LP_.info.nearDays || 60))
    ? 0 : 1;
}
var LP_GRP_ = [
  ['最可能', '同一類 · 時間相近'],
  ['其他沒歸案的', '按時間遠近排'],
  ['已經在別串底下', '不能重複掛，列出來只是讓你知道它去哪了']
];

function drawLoosePick(){
  var i = LP_.info;
  $('lpTally').innerHTML =
    '<span>共 <b>' + i.total + '</b> 筆</span>' +
    '<span class="hi">還沒歸案 <b>' + i.loose + '</b> 筆</span>' +
    '<span>' + (LP_.all ? '全部列出' : '這裡先列 <b>' + i.shown + '</b> 筆') + '</span>';

  if(!LP_.rows.length){
    $('lpList').innerHTML = '<p class="hint" style="padding:18px 2px">' +
      (LP_.kw ? '找不到符合「' + esc(LP_.kw) + '」的。' : '沒有其他可以放進來的服務。') +
      '</p>';
    lpCount(); return;
  }

  var by = [[], [], []];
  LP_.rows.forEach(function(r){ by[lpBucket(r)].push(r); });
  var h = '';
  by.forEach(function(list, g){
    if(!list.length) return;
    h += '<p class="lpgrp"><b>' + LP_GRP_[g][0] + '</b><span>' +
      LP_GRP_[g][1] + '</span></p>' + list.map(lpRow).join('');
  });
  if(!LP_.all && LP_.info.total > LP_.info.shown){
    h += '<button type="button" class="lpmore" id="lpMore">還有 ' +
      (LP_.info.total - LP_.info.shown) + ' 筆　·　全部列出</button>';
  }
  $('lpList').innerHTML = h;

  [].forEach.call($('lpList').querySelectorAll('.lprw'), function(el){
    if(el.dataset.lock) return;
    el.addEventListener('click', function(){
      var k = el.dataset.rec;
      if(LP_.sel[k]) delete LP_.sel[k]; else LP_.sel[k] = 1;
      el.classList.toggle('on', !!LP_.sel[k]);
      lpCount();
    });
  });
  if($('lpMore')) $('lpMore').addEventListener('click', function(){
    LP_.all = true; lpLoad();
  });
  lpCount();
}

function lpRow(r){
  var lock = !!r.caseId;
  return '<div class="lprw' + (LP_.sel[r.rec] ? ' on' : '') + (lock ? ' lock' : '') +
    '" data-rec="' + esc(r.rec) + '"' + (lock ? ' data-lock="1"' : '') + '>' +
    '<span class="ck">' + (LP_.sel[r.rec] ? '✓' : '') + '</span>' +
    '<span class="c">' +
      '<span class="r1"><b>' + esc(r.sub || '服務紀錄') + '</b>' +
        '<em>' + esc(r.ago) + '</em></span>' +
      (r.gist ? '<span class="r2">' + esc(r.gist) + '</span>' : '') +
      '<span class="r3">' +
        (lock ? '<i class="pill lk">在 ' + esc(r.caseId) + ' 底下</i>'
              : '<i class="pill">' + esc(r.big || '未分類') + '</i>') +
        esc(r.date) + '<i>' + esc(r.crew || '') + '</i>' + esc(r.rec) +
      '</span>' +
    '</span></div>';
}

function lpCount(){
  var n = Object.keys(LP_.sel).length;
  $('lpCount').textContent = '已選 ' + n + ' 筆';
  $('lpGo').disabled = !n;
  $('lpGo').textContent = LP_.step === 'pick' ? '看看順序' : ('確定加進去　' + n + ' 筆');
}

/* 先算給人看再寫進去。這一步是整個流程最重要的一步——
   現在的問題是按下去才知道發生什麼事。 */
function lpPreview(){
  LP_.step = 'confirm';
  var keep = LP_.rows.filter(function(r){ return LP_.sel[r.rec]; });
  var have = (LP_.o.items || []).slice();
  var all = have.concat(keep.map(function(r){
    return { date: r.date, sub: r.sub, rec: r.rec, isNew: 1 };
  }));
  all.sort(function(a, b){ return (a.date || '').localeCompare(b.date || ''); });
  $('lpTitle').textContent = '加進去會變這樣';
  $('lpTally').innerHTML = '<span>加完之後共 <b>' + all.length + '</b> 筆</span>';
  $('lpList').innerHTML = '<div class="lppv">' + all.map(function(x, i){
    return '<div class="pvi' + (x.isNew ? ' add' : '') + '">' +
      '<span class="k">' + (i + 1) + '</span>' +
      '<span class="c"><b>' + esc(x.sub || '服務紀錄') + '</b>' +
        '<span>' + esc(x.date) + '　' + esc(x.rec) + '</span></span>' +
      (x.isNew ? '<span class="t">要加的</span>' : '') + '</div>';
  }).join('') + '</div>' +
  '<p class="hint" style="margin:10px 2px 0">按日期排。服務紀錄本身不會有任何更動。</p>';
  lpCount();
}

function lpCommit(){
  var list = Object.keys(LP_.sel);
  if(!list.length) return;
  var id = LP_.o.caseId;
  $('lpGo').disabled = true;
  google.script.run
    .withSuccessHandler(function(r){
      toast(r.failed && r.failed.length
        ? ('加了 ' + r.n + ' 筆，' + r.failed.length + ' 筆沒進去')
        : ('已加進 ' + r.n + ' 筆'));
      closeLoosePick();
      TK_LOADED = ''; openCase(id);
    })
    .withFailureHandler(function(e){ $('lpGo').disabled = false; toast(e.message, true); })
    .attachRecords(CODE, id, list);
}

/* 搜尋。打字就送太吵，停 350ms 再問後端。 */
var LP_T_ = null;
function bindLoosePick(){
  if(!$('lpModal')) return;
  $('lpBack').addEventListener('click', function(){
    if(LP_ && LP_.step === 'confirm'){
      LP_.step = 'pick'; $('lpTitle').textContent = '還要一起放進來嗎？';
      drawLoosePick(); return;
    }
    closeLoosePick();
  });
  $('lpGo').addEventListener('click', function(){
    if(LP_.step === 'pick') lpPreview(); else lpCommit();
  });
  $('lpKw').addEventListener('input', function(){
    if(LP_T_) clearTimeout(LP_T_);
    var v = $('lpKw').value;
    LP_T_ = setTimeout(function(){
      if(!LP_) return;
      LP_.kw = v; LP_.all = false; lpLoad();
    }, 350);
  });
}

/* 登機證上已經畫過的欄位。底下那張「返鄉休假的細節」不要再印一次——
   2026-09-20 清點：18 個欄位有 10 個是重複的。
   ⚠ 跟掛號單不同，登機證本身留著：兩邊都從同一個 detail 讀，不會互相矛盾，
     而且「逾期未回整張變紅」是清單式的細節卡做不到的事。 */
var BP_SHOWN_ = ['air', 'from', 'fromName', 'to', 'toName',
                 'out', 'outTime', 'rair', 'back', 'book'];

/* 登機證。返鄉休假的細節存在 detail 裡，沒填的那幾格就不要畫出來，
   空的登機證比沒有登機證更難看。

   ⛔ 沒填的欄位一律顯示「—」，不要自己補一個看起來很合理的預設值。
      2026-09-20 修掉兩個：出發機場沒填就印 TPE／桃園、回台日沒填就拿
      nextDate 頂替印成「已經訂好票」的樣子。畫面上看不出那是猜的，
      跟掛號單印「未約」是同一種錯。原件沒有的資料就寫沒有。 */
function bpHtml(c){
  var d = c.detail || {};
  if(!d.out && !d.back && !d.air) return '';
  var late = c.state.key === 'late';
  return '<div class="bp' + (late ? ' late' : '') + '">' +
    '<div class="hd">去程' + (d.air ? '　' + esc(d.air) : '') +
      (d.book ? '<b>' + esc(d.book) + '</b>' : '') + '</div>' +
    '<div class="leg">' +
      '<span class="ap"><b>' + esc(d.from || '—') + '</b><span>' +
        esc(d.fromName || '') + '</span></span>' +
      '<span class="arw"></span>' +
      '<span class="ap"><b>' + esc(d.to || '—') + '</b><span>' +
        esc(d.toName || '') + '</span></span>' +
    '</div>' +
    '<div class="dt"><div><span>離境</span><b>' + esc(d.out || '—') + '</b></div>' +
      (d.outTime ? '<div><span>起飛</span><b>' + esc(d.outTime) + '</b></div>' : '') +
    '</div>' +
    '<div class="cut"></div>' +
    '<div class="rt">回程' + (d.rair ? '　' + esc(d.rair) : '') +
      '　<b>' + esc(d.back || '未填') + '</b>' +
      '<span class="tag">' + (late ? '逾期未回' : '應回台') + '</span></div>' +
    /* 條碼印的是案件代碼——那本來就是這張單的編號，不是裝飾。 */
    '<div class="code"><div class="bars"></div>' +
      '<div class="id">' + esc(String(c.id).split('').join(' ')) + '</div></div>' +
  '</div>';
}

/* 把已知的資料填進服務表。
   ⛔ 這支是「從行程開表」與「從案件開表」共用的。
   2026-09-19 之前兩條路各寫一份，案件那一份漏了服務對象、移工與服務項目，
   而且沒有先設服務對象就填雇主——家庭雇主的名字在工廠名單裡找不到，
   帶過去的名字直接掉了。同一件事不要維護兩份。

   ⚠ 順序不能動：先設服務對象 → fillClients() 重建雇主名單 → 才填得進雇主。 */
/* 把雇主名字填進去。名單裡沒有就走「其他，自行輸入」——
   寧可讓人看到名字再確認，也不要默默弄丟。 */
function setClientValue(name){
  name = name || '';
  $('client').value = name;
  $('svcPkVal').textContent = name || '請選擇…';
  $('svcPkVal').classList.toggle('has', !!name);
  $('svcPkVal').classList.remove('open');
  $('svcPkPop').style.display = 'none';
  if($('svcPkQ')) $('svcPkQ').value = '';
}

function fillTripForm(r){
  /* ⛔ 一定要先結束編輯狀態。
     2026-09-19 實機：從案件頁按「＋ 開一筆」，填一填滑到最下面發現
     它說「內容有異動，要按儲存」——那是在改第一筆服務紀錄，不是新增。
     因為 EDIT_CODE 是上一次開「修改內容」留下來的，沒有人清。
     跟 SCHED_ID 完全同一個形狀的 bug：上下文全域設了之後只在特定路徑清。
     用別人的資料重填表單，就表示不再是在編輯原本那一筆——修在這裡，
     「從行程開表」與「從案件開表」兩條路一起受惠。 */
  if(typeof EDIT_CODE !== 'undefined' && EDIT_CODE) endEdit();
  if(r.date) $('date').value = r.date;
  /* ⚠ 不要相信傳進來的「服務對象」。
     2026-09-19 實機：張寶華是家庭雇主，但案件那一列記成工廠，
     結果拉出工廠的名單、裡面沒有他，select 默默拒絕了那個值，
     雇主就空了；移工名單跟著雇主長，所以移工也一起沒了。
     客戶名單自己就知道每一家是工廠還是家庭雇主——用它當準。 */
  var pz = presetOf(r.client);
  /* ⛔ 「工廠宣導（一對多）」不是客戶的屬性，是**這一趟的做法**。
     客戶名單只知道每一家是工廠還是家庭雇主，它不可以蓋掉一對多。
     蓋掉的結果（牟佑彬 2026-10-04 連試兩次）：
       改成一對多 → 存檔（試算表真的寫進去了）→ 再點進來又顯示「工廠」
       → 再存一次就把一對多洗掉 → 看起來像「怎麼改都沒用」。
     applyPreset() 早就用 !isBrief() 擋過同一件事，這裡漏了。 */
  $('target').value = (/一對多/.test(r.target || '')) ? r.target
                    : ((pz && pz.t) ? pz.t : (r.target || '工廠'));
  if(!$('target').value) $('target').value = '工廠';
  fillClients(); syncMode();
  setClientValue(r.client);
  applyPreset();
  /* ⛔ 預排的 crew 本來就是空的，建議的人在 r.sug。
     只看 r.crew 的話，行政點進去會看到空白的「翻譯人員」，
     存檔就把原本的建議洗掉——2026-10-03 他實測踩到，
     一筆行程因此從行事曆上消失。 */
  var who0 = r.crew || r.sug || '';
  if(CREW.indexOf(who0) !== -1) $('crew').value = who0;
  if(r.crewOwner && CREW.indexOf(r.crewOwner) !== -1) $('crewOwner').value = r.crewOwner;

  // 移工與服務項目一併帶進去，當天只要補處理經過與結果
  var names = (r.workers || '').split('、').filter(String);
  $('workers').innerHTML = '';
  (names.length ? names : ['']).forEach(function(n){
    addWorker();
    var card = $('workers').lastElementChild;
    var sel = card.querySelector('[data-k=name]');
    if(n && sel){
      sel.value = n;
      // 不在這家的名單上（換雇主、名字有出入）就走「其他」，不要默默弄丟
      if(sel.value !== n){
        var oth = card.querySelector('[data-k=nameOther]');
        sel.value = OTHER_;
        if(oth){ oth.style.display = ''; oth.value = n; }
      }
      sel.dispatchEvent(new Event('change'));
    }
    /* 行政排程時幫這一位選好的項目優先；沒有才退回整趟的事由。
       ⛔ 這就是加「移工項目」那一欄的目的——翻譯當天打開，
          每張卡的服務項目已經填好了，不用一個一個重選
          （牟佑彬 2026-10-03 指定的理由之二）。 */
    var mine = (r.wkItems || []).filter(function(x){ return x.n === n; })[0] || {};
    var bigV = mine.b || r.big, subV = mine.s || (mine.b ? '' : r.sub);
    if(bigV){
      var bg = card.querySelector('[data-k=big]');
      bg.value = bigV; bg.dispatchEvent(new Event('change'));
      if(subV){
        var sb = card.querySelector('[data-k=sub]');
        sb.value = subV; sb.dispatchEvent(new Event('change'));
      }
    }
  });
  renumber();
  /* ⛔ 上面 syncMode() 跑在重建卡片**之前**，所以宣導模式套在舊卡片上，
     重建完就沒了。卡片換過就要再套一次。 */
  syncMode();
  /* 行政版：把交代事項填回下面那一塊（見 admFillBits）。 */
  if(document.body.classList.contains('filladm')){
    var tb = $('admTodo');
    if(tb){ tb.innerHTML = ''; (r.todo || []).forEach(function(t){ admTodoAdd(t.t || t); }); }
  }
}

/* 從案件開一張服務表：雇主、移工、服務項目、負責翻譯全部帶過去，
   存檔之後自動掛回來。人只要填處理經過、結果、費用、簽名。
   日期帶案件的下次日期（那才是這一趟要去的日子），沒有就帶今天。 */
function caseNewRecord(c){
  CASE_FOR_ = c.id;
  $('caseModal').style.display = 'none';
  goTab('new');
  try {
    fillTripForm({
      date: c.nextDate || new Date().toISOString().slice(0, 10),
      target: c.target, client: c.client,
      crew: c.crew, crewOwner: c.crew,
      workers: c.workers, big: c.big, sub: c.sub
    });
  } catch(e){}
  window.scrollTo(0, 0);
  toast('已帶入 ' + (c.workers || c.client) + '，接著填服務內容');
}
var CASE_FOR_ = '';       // 這次填寫要掛回哪個案件

/* 第一張移工卡選的服務類別。開案時拿來當預設分類用，沒有就空的。 */
function firstBig(){
  var el = document.querySelector('#workers select[data-k="big"]');
  return el ? el.value : '';
}

function setVal(id, v){
  var el = $(id);
  if(!el || !v) return;
  el.value = v;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function caseSetNext(c){
  openDatePick(c, function(d, note){ saveCaseNext(c, d, note); });
}

/* 日期用原生的 <input type="date">，手機上會跳系統的滾輪。
   用 prompt 要他打出 2026-11-04，在工廠戴著手套是打不出來的。 */
function openDatePick(c, done){
  if(!$('dateModal')){ toast('要先更新 App', true); return; }
  $('dtDate').value = c.nextDate || '';
  $('dtNote').value = c.nextNote || '';
  $('dtTitle').textContent = c.kind === '體檢通知' ? '體檢日期'
    : c.kind === '就醫追蹤' ? '下次回診' : '下一次是哪一天';
  $('dateModal').style.display = '';
  $('dtOk').onclick = function(){
    $('dateModal').style.display = 'none';
    done($('dtDate').value || '', $('dtNote').value || '');
  };
  $('dtClear').onclick = function(){
    $('dateModal').style.display = 'none';
    done('', '');
  };
  $('dtCancel').onclick = function(){ $('dateModal').style.display = 'none'; };
}

function saveCaseNext(c, d, note){
  google.script.run
    .withSuccessHandler(function(r){
      toast(r.date ? ('已排 ' + r.date + '，行事曆上也有了') : '已取消下一次');
      calBust(); tkBust(); openCase(c.id); loadTrack(true);
    })
    .withFailureHandler(function(e){ toast(e.message, true); })
    .setCaseNext(CODE, c.id, d, note);
}

function caseSpawnMed(c){
  if(!confirm('要開一筆就醫追蹤並跟這件連起來嗎？\n移工與雇主會直接帶過去。')) return;
  google.script.run
    .withSuccessHandler(function(r){
      toast('已開 ' + r.id);
      TK_CUR = '就醫追蹤'; tkBust();
      loadTrack(true);
      openCase(r.id);
    })
    .withFailureHandler(function(e){ toast(e.message, true); })
    .spawnMedicalCase(CODE, c.id);
}

/* 結案。後端會擋住底下還沒歸檔的紀錄，而且會講是哪一筆卡在誰那裡——
   那段訊息有換行，用 alert 才看得完整，toast 會被截掉。 */
function caseClose(c){
  var r = prompt('結案結果是什麼？（會留在紀錄上）', '');
  if(r === null) return;
  google.script.run
    .withSuccessHandler(function(res){
      toast('已結案');
      if(res.openLink){
        alert('這件結了，但連著的 ' + res.openLink.kind + ' ' +
              res.openLink.id + ' 還在進行中。\n那一件要自己走完。');
      }
      tkBust(); loadTrack(true); openCase(c.id);
    })
    .withFailureHandler(function(e){ alert(e.message); })
    .closeCase(CODE, c.id, r);
}

/* 挑選頁的按鈕在頁面載入時綁一次。跟其他浮層同一個做法。 */
bindLoosePick();

if($('ckClose2')) $('ckClose2').addEventListener('click', function(){
  $('caseModal').style.display = 'none';
});

/* ── 行程卡右滑之後：要開哪一種 ───────────────────────── */
var PICK_D_ = null;

/* ⚠ 四個選項寫死在 Service.html 裡，不是這裡產生的。
   2026-09-18 實機上出現過「選單開了但裡面完全是空的」，
   drawPick() 單獨在 Node 跑得出東西、CSS 也是新的，追不到確切原因。
   會不會渲染出來是整個功能的入口，不值得賭在一段非同步流程上。
   動態的只剩「掛到現有案件」，放在另一個 div，失敗就是少那一段，
   四個選項照樣在。 */
/* d = null 代表「從追蹤頁直接開」——沒有行程、也還不知道是誰。
   ⛔ 返鄉休假通常是工人先來講「我十一月要回家」，那時候還沒有任何行程。
      只留「行事曆右滑」一個入口，等於逼人先去排一筆假行程。 */
function openPick(d){
  if(!$('pickModal')){ toast('要先更新 App 才有追蹤功能', true); return; }
  PICK_D_ = d;
  $('pickEx').innerHTML = '';
  var who = $('pickWho');
  if(who) who.style.display = d ? 'none' : '';
  $('pickWhy').textContent = d
    ? '開好之後，這一趟的服務紀錄會自動掛到那個案件底下。'
    : '先選是誰，再選要開哪一種。之後那一家的服務紀錄可以再掛進來。';
  $('pickModal').style.display = '';
  if(!d){ pkcFill(); return; }        // 還沒選人，沒有「現有案件」可以查
  google.script.run
    .withSuccessHandler(function(r){ drawPickEx((r && r.rows) || []); })
    .withFailureHandler(function(){})
    .openCasesForWorker(CODE, (d.workers || '').split('、')[0] || '', d.client || '');
}

/* 追蹤頁那顆「＋ 開一件追蹤」用的雇主選擇器。跟其他三個畫面同一個元件。 */
var PKC_PK_ = {
  id: 'pkcPk', mode: 'svc', list: [], allowNew: true,
  onPick: function(c){
    $('pkClient').value = c;
    $('pkcPkVal').textContent = c;
    $('pkcPkVal').classList.add('has');
    $('pkcPkVal').classList.remove('open');
    $('pkcPkPop').style.display = 'none';
    pkcWorkers();
    /* 選好人才查得到「已經有哪幾件」——不查的話他會重複開一件。 */
    google.script.run
      .withSuccessHandler(function(r){ drawPickEx((r && r.rows) || []); })
      .withFailureHandler(function(){})
      .openCasesForWorker(CODE, '', c);
  }
};
if($('pkcPkVal')) pkWire(PKC_PK_);

function pkcFill(){
  if(!$('pkcPkVal')) return;
  var kind = $('pkTarget').value.indexOf('家庭') !== -1 ? '家庭雇主' : '工廠';
  PKC_PK_.list = PRESETS.filter(function(x){ return (x.t||'工廠') === kind; })
                        .map(pkFromPreset_);
  $('pkClient').value = '';
  $('pkcPkVal').textContent = '請選擇…';
  $('pkcPkVal').classList.remove('has');
  $('pkWorkers').innerHTML = '<div class="empty">先選工廠／雇主</div>';
  $('pickEx').innerHTML = '';
}
if($('pkTarget')) $('pkTarget').addEventListener('change', pkcFill);

function pkcWorkers(){
  var pz = presetOf($('pkClient').value);
  var ws = pz ? pz.w : [];
  $('pkWorkers').innerHTML = ws.length
    ? ws.map(function(w){
        return '<label><input type="checkbox" value="'+esc(w.n)+'">'+
          '<span>'+esc(w.n)+(w.o?'<span class="o">'+esc(w.o)+'</span>':'')+'</span>'+
          (w.l?'<span class="lg">'+esc(w.l)+'</span>':'')+'</label>';
      }).join('')
    : '<div class="empty">這一家名冊上沒有人，直接開也可以</div>';
}
function pkcPicked(){
  return [].map.call($('pkWorkers').querySelectorAll('input:checked'),
                     function(i){ return i.value; }).join('、');
}

function drawPickEx(existing){
  if(!existing.length || !$('pickEx')) return;
  $('pickEx').innerHTML = existing.map(function(c){
    return '<button type="button" class="pk ex" data-id="' + esc(c.id) + '">' +
      '<b>掛到現有的：' + esc(c.kind) + '</b>' +
      '<em>' + esc(c.title || c.id) + '　' + esc(c.openedAt) + '</em></button>';
  }).join('') + '<p class="hint" style="margin:10px 0 8px">或開一件新的：</p>';
  [].forEach.call($('pickEx').querySelectorAll('[data-id]'), function(b){
    b.addEventListener('click', function(){ pickAttach(b.dataset.id); });
  });
}

/* 寫死的那四顆只綁一次，不是每次開選單重綁 */
[].forEach.call(document.querySelectorAll('#pickList [data-k]'), function(b){
  b.addEventListener('click', function(){ pickNew(b.dataset.k); });
});

function pickNew(kind){
  var d = PICK_D_;
  if(!d){
    /* 從追蹤頁直接開的那條路：雇主是必填，移工可以空著
       （例如整廠的宣導型追蹤）。 */
    var c = ($('pkClient') || {}).value || '';
    if(!c){ toast('請先選工廠／雇主名稱', true); return; }
    d = { client: c, workers: pkcPicked(), target: $('pkTarget').value };
  }
  $('pickModal').style.display = 'none';
  google.script.run
    .withSuccessHandler(function(r){
      toast('已開 ' + r.id);
      TK_CUR = kind; tkBust();
      goTab('track');
      openCase(r.id);
    })
    .withFailureHandler(function(e){ toast(e.message, true); })
    .addCase(CODE, {
      kind: kind, client: d.client || '', workers: d.workers || '',
      lang: d.lang || '', big: d.big || '', sub: d.sub || '',
      date: d.date || '',          // 空的話後端才用今天

      // 服務對象沒傳的話後端會用預設的「工廠」，家庭雇主就記錯了
      target: d.target || '',
      title: d.sub || '', recCode: d.rc || '',
      // 行程代碼一定要傳。行程要記住自己屬於哪一件，
      // 之後從行事曆點進去填表，存檔時才掛得回來。
      schedId: d.go || ''
    });
}

/* 掛進某一件之前先問清楚它現在屬於誰。
   ⛔ 後端已經擋了「已經在別件底下」，但只擋不給路，人就會去開第三件案子
   ——2026-09-19 那三筆重複就是這樣來的。所以這裡先查，是別件就問要不要搬。
   先查再做，也比讓後端丟錯誤訊息回來給人看好懂。 */
function attachOrMove(caseId, recCode, done){
  if(!recCode){ done(); return; }
  google.script.run
    .withSuccessHandler(function(r){
      if(r && r.has && r.id !== caseId){
        if(!confirm('這一筆已經掛在「' + (r.kind||'另一件') + ' ' + r.id + '」底下了。\n\n' +
            '一筆服務只能算在一件事裡，不然次數會重複。\n\n' +
            '要從那邊搬過來嗎？')) return;
        google.script.run
          .withSuccessHandler(function(){ toast('已搬過來'); done(); })
          .withFailureHandler(function(e){ toast(e.message, true); })
          .moveRecord(CODE, r.id, caseId, recCode);
        return;
      }
      if(r && r.has && r.id === caseId){ toast('本來就在這一件底下'); done(); return; }
      google.script.run
        .withSuccessHandler(function(){ done(); })
        .withFailureHandler(function(e){ toast(e.message, true); })
        .attachRecord(CODE, caseId, recCode);
    })
    .withFailureHandler(function(e){ toast(e.message, true); })
    .caseChainOf(CODE, recCode);
}

function pickAttach(id){
  var d = PICK_D_ || {};
  $('pickModal').style.display = 'none';
  if(!d.rc){
    // 還沒有服務紀錄（預排的行程），掛不了東西上去，直接打開那件讓人看
    openCase(id);
    goTab('track');
    return;
  }
  attachOrMove(id, d.rc, function(){
    toast('已掛到 ' + id);
    TK_ROWS = []; TK_LOADED = ''; goTab('track'); openCase(id);
  });
}

if($('pickCancel')) $('pickCancel').addEventListener('click', function(){
  $('pickModal').style.display = 'none';
});


/* ── 案件的詳細欄位、階段、給移工的訊息 ────────────────────
   欄位定義在後端 CaseFields.gs，這裡照著畫。
   ⛔ 不要在這裡再寫一份欄位清單——加欄位時只改一邊，送出去就會少東西。 */
var CK_SCHEMA = null;

function loadSchema(then){
  if(CK_SCHEMA){ then && then(); return; }
  google.script.run
    .withSuccessHandler(function(r){ CK_SCHEMA = r; then && then(); })
    .withFailureHandler(function(){ CK_SCHEMA = { fields:{}, steps:{} }; then && then(); })
    .caseSchema(CODE);
}

/* 階段條。返鄉要追的是「人走了沒、回來了沒」，
   體檢要追的是「通知了沒、約了沒、提醒了沒」——
   那是一格一格往前走的東西，用狀態欄的三個值表達不了。 */
/* 詳細欄位。沒填的不要顯示空白列——一整頁「—」看起來像壞掉。 */
/* 編輯表單。型別由後端給，這裡只負責把它畫成輸入框。 */
function openDetailForm(c){
  var defs = (CK_SCHEMA && CK_SCHEMA.fields && CK_SCHEMA.fields[c.kind]) || [];
  if(!defs.length){ toast('這個類型沒有可以填的細節', true); return; }
  var d = c.detail || {};
  $('dfTitle').textContent = c.kind + '的細節';
  $('dfBody').innerHTML = defs.map(function(f){
    var v = d[f.k] === undefined ? '' : d[f.k];
    var hint = f.hint ? '<p class="hint" style="margin:3px 0 0">' + esc(f.hint) + '</p>' : '';
    if(f.t === 'check'){
      return '<div class="chips" style="margin-bottom:10px"><label>' +
        '<input type="checkbox" data-k="' + esc(f.k) + '"' + (v ? ' checked' : '') + '>' +
        esc(f.l) + '</label></div>' + hint;
    }
    if(f.t === 'select'){
      return '<div class="f"><label>' + esc(f.l) + '</label><select data-k="' + esc(f.k) + '">' +
        '<option value="">請選擇…</option>' +
        (f.opt || []).map(function(o){
          return '<option' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>';
        }).join('') + '</select>' + hint + '</div>';
    }
    if(f.t === 'area'){
      return '<div class="f"><label>' + esc(f.l) + '</label>' +
        '<textarea data-k="' + esc(f.k) + '" rows="3">' + esc(v) + '</textarea>' + hint + '</div>';
    }
    /* ⛔ link 是工人上傳的東西，翻譯不該手打一條 Drive 網址。
       有就給一顆點得開的，沒有就直說「工人還沒傳」。
       ⚠ 不放 data-k——放了 patch 會把它變成空字串，把連結洗掉。 */
    if(f.t === 'link'){
      return '<div class="f"><label>' + esc(f.l) + '</label>' +
        (v ? '<a class="dflink" href="' + esc(v) + '" target="_blank" rel="noopener">開啟</a>'
           : '<p class="hint" style="margin:0">工人還沒傳</p>') + hint + '</div>';
    }
    var type = f.t === 'date' ? 'date' : f.t === 'time' ? 'time' : 'text';
    return '<div class="f"><label>' + esc(f.l) + '</label>' +
      '<input type="' + type + '" data-k="' + esc(f.k) + '" value="' + esc(v) + '">' +
      hint + '</div>';
  }).join('');
  $('detailModal').style.display = '';
  $('dfBody').scrollTop = 0;

  $('dfSave').onclick = function(){
    var patch = {};
    [].forEach.call($('dfBody').querySelectorAll('[data-k]'), function(el){
      patch[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value;
    });
    $('dfSave').disabled = true;
    google.script.run
      .withSuccessHandler(function(){
        $('dfSave').disabled = false;
        $('detailModal').style.display = 'none';
        toast('存好了');
        TK_LOADED = ''; openCase(c.id);
      })
      .withFailureHandler(function(e){ $('dfSave').disabled = false; toast(e.message, true); })
      .setCaseDetail(CODE, c.id, patch);
  };
}
if($('dfCancel')) $('dfCancel').addEventListener('click', function(){
  $('detailModal').style.display = 'none';
});

/* 給移工的訊息。翻譯每次都要重打一遍「明天八點半在門口等車，帶居留證健保卡」，
   還要自己翻。這裡把案件上已經有的資料塞進範本，一次產出三種語言。 */
function openMsg(c, which){
  $('msgBody').innerHTML = '<div class="mid" style="padding:22px">產生中…</div>';
  $('msgModal').style.display = '';
  google.script.run
    .withSuccessHandler(function(r){ drawMsg(r); })
    .withFailureHandler(function(e){
      $('msgBody').innerHTML = '<div class="mid" style="padding:22px">' + esc(e.message) + '</div>';
    })
    .caseMessage(CODE, c.id, which || '');
}

function drawMsg(r){
  /* 第三種語言照移工的語別挑。挑不到就不要硬塞一個他看不懂的，
     直接給英文——菲籍看他加祿語，越南印尼籍目前只有英文。 */
  var third = /菲/.test(r.lang) ? { k: 'tl', t: 'Tagalog' } : null;
  var tabs = [{ k: 'zh', t: '中文' }, { k: 'en', t: 'English' }];
  if(third) tabs.push(third);
  $('msgBody').innerHTML =
    '<div class="segs" id="msgTabs">' + tabs.map(function(t, i){
      return '<button type="button" data-m="' + t.k + '"' + (i === 0 ? ' class="on"' : '') +
        '>' + esc(t.t) + '</button>';
    }).join('') + '</div>' +
    '<textarea id="msgText" rows="12" style="width:100%">' + esc(r.zh) + '</textarea>' +
    '<p class="hint" style="margin:8px 0 0">可以直接改。按複製之後貼到 LINE 給 ' +
    esc(r.worker || '移工') + '。</p>';
  [].forEach.call($('msgTabs').children, function(b){
    b.addEventListener('click', function(){
      [].forEach.call($('msgTabs').children, function(x){ x.classList.remove('on'); });
      b.classList.add('on');
      $('msgText').value = r[b.dataset.m] || '';
    });
  });
}

if($('msgCopy')) $('msgCopy').addEventListener('click', function(){
  var el = $('msgText');
  if(!el) return;
  el.select();
  /* iOS 的 Safari 對 clipboard API 很挑，execCommand 這條老路反而穩。
     兩條都試，哪條成了就算成了。 */
  var done = false;
  try { done = document.execCommand('copy'); } catch(e){}
  if(!done && navigator.clipboard){
    navigator.clipboard.writeText(el.value).then(function(){ toast('複製好了'); },
      function(){ toast('複製不了，請長按選取', true); });
    return;
  }
  toast(done ? '複製好了，去 LINE 貼上' : '複製不了，請長按選取', !done);
});
if($('msgClose')) $('msgClose').addEventListener('click', function(){
  $('msgModal').style.display = 'none';
});

/* 切到某一個分頁。按鈕本來就綁好了，直接借用，不要再寫一次切換邏輯。 */
function goTab(t){
  var b = document.querySelector('.tabs button[data-t="' + t + '"]');
  if(b) b.click();
}

/* 記得上次的登入碼，直接進去 */
if(CODE){ $('code').value = CODE; lgBusy(true); login(CODE); }

else { $('login').style.display=''; document.body.classList.add('lgon'); appShown(); }

/* ==========================================================================
   體檢通知（2026-09-20）

   後端在 HealthCheck.gs / HealthCheckPub.gs，工人那一頁在 HealthCheck.html。
   這裡只負責翻譯這一端：開單、補接送資訊、點名、結案。

   ⚠ 三件事跟其他功能不一樣，改之前先知道：
   1. 體檢通知不產生服務紀錄。所以它不走 collectForm / saveTrip 那條路，
      也不該出現在評鑑與月報的服務次數裡。
   2. 一人一條短連結。訊息裡每個人的網址都不同，不可以共用——
      共用的話誰按的都分不出來。
   3. 報到來源有強弱。翻譯點名與收據是證據，工人自己按只是訊號
      （在家也按得下去）。畫面上一定要標出來，不可以混在一起算。
   ========================================================================== */

var HC_OPT_ = null;        // 醫院／司機／可平日工廠，第一次進體檢頁才抓
var HC_PICK_ = [];         // 開單畫面上那份名單
var HC_CUR_ = null;        // 正在看的那一件（車輛／點名共用）
var HC_CARS_ = [];         // 車次編輯中的暫存

function hcOpt(cb){
  if(HC_OPT_){ cb(HC_OPT_); return; }
  google.script.run.withSuccessHandler(function(r){
    HC_OPT_ = r || { hos:[], weekday:[], drivers:[], terms:[] };
    cb(HC_OPT_);
  }).withFailureHandler(function(e){ toast(e.message, true); }).hcOptions(CODE);
}

/* 下一個週日。體檢幾乎都排週日——工人要上班，工廠不放人。
   可平日體檢的工廠另外列在設定裡，選到那幾家會提示，但不擋。 */
function hcNextSunday_(){
  var d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
  return d.getFullYear() + '-' + ('0'+(d.getMonth()+1)).slice(-2) +
         '-' + ('0'+d.getDate()).slice(-2);
}

/* ── 體檢開單：現在住在「追蹤 › 體檢」那一頁 ─────────────

   ⛔ 2026-09-22 從填寫頁搬過來（牟佑彬）。
      理由：體檢本來就是四種追蹤之一，**建立的地方跟看的地方應該是同一處**。
      以前要在「填寫 › 體檢通知」開單，卻在「追蹤 › 體檢」看，
      而且兩邊的數字還是分開算的。

   ⚠ 表單預設收起來。這一頁最常做的事是「看還有哪幾批要處理」，
     不是「再開一批」——開單的入口是下面那顆按鈕。 */
function hcMode(on){
  var pane = $('hcPane');
  if(!pane) return;
  pane.style.display = on ? '' : 'none';
  var b = $('tkAdd');
  if(b) b.textContent = on ? '收起來' : hcAddLabel();
  if(on){
    hcInit();
    pane.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/* 按鈕上的字要跟著頁籤換——四種案件不是同一件事，
   寫成一律「＋ 開一件追蹤」的話，在體檢那一頁按下去會跑出四選一，很怪。 */
function hcAddLabel(){
  return TK_CUR === '體檢通知' ? '＋ 開一張體檢通知' : '＋ 開一件追蹤';
}


/* ══ 雇主選擇器 ══════════════════════════════════════════════

   309 家。原生 <select> 在手機上要捲三十次，而且看不到「哪一家有事」。

   ⛔ 分類選單解決不了 309 這個數量。先選工廠/家庭、再選地區、再選名字，
      是把一次滑動換成三次點擊，而且分類錯的時候（一家同時有廠工與看護）
      使用者會找不到，還以為那家不存在。**只有打字解得掉。**

   ⛔ 兩個頁面的**預設不一樣**，那是這個元件最重要的部分：
        體檢通知 → 只給「有人要做」的（309 家裡 190 家現在完全沒事）
        服務紀錄 → 今天行事曆排的 → 最近去過的
      預設給錯，等於逼他每次都打字。

   ⚠ 一次把 309 家拿完，在前端篩。每打一個字往返一次，工廠的訊號撐不住。 */

/* ⚠ 長的排前面。取第一個對上的，所以「有限公司」若排在
   「股份有限公司」前面，「全錦興工業股份有限公司」會被切成
   「全錦興工業股份」——多一個「股」字，看起來只是小錯，
   但那是每一列都會出現的小錯。 */
var PK_SUF_ = ['股份有限公司', '有限公司', '企業社', '工業社', '工藝社',
               '實業社', '企業行', '商行'];

/* 「全錦興工業股份有限公司」→ ['全錦興', '工業股份有限公司']
   ⚠ 實測 309 家拿掉後綴之後 0 個撞名，而且 83% 只剩 3-4 個字。
     所以核心名可以放大、後綴縮小——能分辨的就是前面那幾個字。 */
function pkSplit_(name){
  var n = String(name || '');
  for(var i = 0; i < PK_SUF_.length; i++){
    var k = n.lastIndexOf(PK_SUF_[i]);
    if(k > 0 && k + PK_SUF_[i].length === n.length){
      return [n.slice(0, k), n.slice(k)];
    }
  }
  return [n, ''];
}

/* 比對：中文任意位置、英文、移工名字。後綴不參與——
   打「有限公司」不應該跑出 117 家。 */
function pkHit_(x, q){
  if(!q) return true;
  /* ⛔ 只比核心名，不要再補一條「整個名字有沒有含」。
     309 家裡一百多家的全名都含「有限公司」——補那一條等於後綴又回到比對裡，
     打「有」就跳出一百多家，篩了跟沒篩一樣。
     後綴不在清單上的公司，核心名本來就是整個名字，不會漏掉。 */
  if(pkSplit_(x.c)[0].toLowerCase().indexOf(q) !== -1) return true;
  return (x.who || []).some(function(w){
    return String(w).toLowerCase().indexOf(q) !== -1;
  });
}

function pkRow_(x, mode, q){
  var p = pkSplit_(x.c);
  /* ⛔ 缺欄位不可以讓整張清單消失。上面那個 bug 的傷害不是「少一行字」，
     是 pkDraw 整個中斷、畫面一片空白，而錯誤訊息又是不透明的
     「Script error.」——查了三輪才找到。少一個欄位最多就是那一格空著。 */
  var who = x.who || [], n = x.n || who.length;
  var sub, right;
  if(mode === 'hc'){
    sub = x.due ? (x.due + ' 人要做 · 共 ' + n + ' 人') : ('共 ' + n + ' 人');
    if(!x.fac && who.length) sub = who.join('、') + (n > who.length ? ' 等' : '');
    right = x.due
      ? ('<span class="due' + (x.late ? ' r' : '') + '"><b>' + x.due + '</b>' +
         (x.late ? ('逾期 ' + x.late) : (x.next ? esc(x.next.slice(5)) : '')) + '</span>')
      : (x.missed
         ? '<span class="due r"><b>!</b>漏 ' + x.missed + '</span>'
         : '<span class="due g"><b>—</b></span>');
  } else {
    sub = x.fac ? ('共 ' + n + ' 人')
                : (who.join('、') + (n > who.length ? ' 等' : ''));
    right = '<span class="due g"><b>›</b></span>';
  }
  return '<button type="button" class="epkrow" data-c="' + esc(x.c) + '">' +
    '<span class="nm"><b>' + esc(p[0]) +
      (p[1] ? '<em>' + esc(p[1]) + '</em>' : '') + '</b>' +
      (sub ? '<i>' + esc(sub) + '</i>' : '') + '</span>' + right + '</button>';
}

/* opts = { id, mode:'hc'|'svc', list, value, onPick, only:'fac'|'home'|'' } */
function pkDraw(o){
  var box = $(o.id + 'Box'); if(!box) return;
  var q = (($(o.id + 'Q') && $(o.id + 'Q').value) || '').trim().toLowerCase();
  /* 注音還沒組完（「ㄔㄤ ㄍ」）就當作他還沒打字：維持原本的清單，
     不要閃一下「找不到」，更不要冒出「用「ㄔㄤ ㄍ」當雇主名稱」。 */
  if(pkTyping_(q)) q = '';
  var tab = o.tab || (o.mode === 'hc' ? 'due'
                    : (pkRecent_(o.mode).length ? 'recent' : 'all'));
  var all = o.list || [];

  /* 服務對象先選了的話，清單跟著變。這一層過濾是免費的——
     「服務對象」本來就是必填，他一定會先選。 */
  if(o.only === 'fac')  all = all.filter(function(x){ return x.fac; });
  if(o.only === 'home') all = all.filter(function(x){ return !x.fac; });

  var head = '', rows = [];
  if(q){
    rows = all.filter(function(x){ return pkHit_(x, q); });
    head = '找到 ' + rows.length + ' 家';
  } else if(tab === 'due'){
    rows = all.filter(function(x){ return x.due || x.missed; });
    head = '有人要做的';
  } else if(tab === 'fac'){
    rows = all.filter(function(x){ return x.fac; }); head = '工廠';
  } else if(tab === 'home'){
    rows = all.filter(function(x){ return !x.fac; }); head = '家庭雇主';
  } else if(tab === 'recent'){
    var rec = pkRecent_(o.mode);
    rows = rec.map(function(c){
      return all.filter(function(x){ return x.c === c; })[0];
    }).filter(Boolean);
    head = '最近選過的';
  } else { rows = all; head = '全部'; }

  var more = '';
  if(rows.length > 40){ more = '還有 ' + (rows.length - 40) + ' 家，打字縮小範圍';
                        rows = rows.slice(0, 40); }

  var chips = (o.mode === 'hc')
    ? [['due', '有人要做'], ['fac', '工廠'], ['home', '家庭'], ['all', '全部']]
    : [['recent', '最近選過'], ['all', '全部']];

  box.innerHTML =
    '<div class="epkchips">' + chips.map(function(t){
      var n = t[0] === 'due'
        ? all.filter(function(x){ return x.due || x.missed; }).length
        : t[0] === 'fac' ? all.filter(function(x){ return x.fac; }).length
        : t[0] === 'home' ? all.filter(function(x){ return !x.fac; }).length
        : t[0] === 'all' ? all.length : pkRecent_(o.mode).length;
      /* ⚠ 有打字的時候分頁不生效（搜尋是跨分頁的），
         所以不要留一個亮著的——那會讓人以為只在那一類裡找。 */
      return '<button type="button" class="epkchip' + (!q && tab === t[0] ? ' on' : '') +
        '" data-t="' + t[0] + '">' + esc(t[1]) + ' ' + n + '</button>';
    }).join('') + '</div>' +
    (rows.length ? ('<p class="epkhd">' + esc(head) + '</p>') : '') +
    (rows.length
      ? rows.map(function(x){ return pkRow_(x, o.mode, q); }).join('')
      : '<p class="epkempty">' + (q ? ('找不到「' + esc(q) + '」') :
          (tab === 'recent' ? '還沒有紀錄——打字找，選過之後這裡會記住'
                            : '這個條件下沒有')) + '</p>') +
    (more ? '<p class="epkmore">' + esc(more) + '</p>' : '') +
    /* 名冊每月匯入一次，這個月新接的雇主還不在裡面。
       ⛔ 不要只留「找不到」——那等於叫他放棄填這張表。 */
    /* ⚠ 至少兩個字才給。一個字就冒出來，等於他每次打字都看到一列
       「用「全」當雇主名稱」——那是雜訊，而且很容易誤觸。 */
    ((o.allowNew && q.length >= 2 &&
      !rows.some(function(x){ return x.c === q; }))
      ? '<button type="button" class="epkrow epknew" data-new="1">' +
          '<span class="nm"><b>用「' + esc(q) + '」當雇主名稱</b>' +
          '<i>名單上沒有這一家——新接的雇主要等下次匯入名冊</i></span>' +
          '<span class="due g"><b>+</b></span></button>'
      : '');

  [].forEach.call(box.querySelectorAll('.epkchip'), function(b){
    b.addEventListener('click', function(){ o.tab = b.dataset.t; pkDraw(o); });
  });
  [].forEach.call(box.querySelectorAll('.epkrow'), function(b){
    b.addEventListener('click', function(){
      var v = b.dataset.new ? (($(o.id + 'Q') || {}).value || '').trim() : b.dataset.c;
      if(!v) return;
      if(!b.dataset.new) pkRemember_(o.mode, v);   // 自行輸入的不記，下次匯入就有了
      o.onPick(v);
    });
  });
}

/* 打開／收起 ＋ 打字。兩個畫面共用。

   ⛔ **注音／拼音是邊打邊組字的。** 2026-09-21 實機截圖抓到：
      打「暢廣」的過程中 input 事件先送出「ㄔㄤ ㄍ」，於是
        · 清單顯示「找不到「ㄔㄤ ㄍ」」——其實他字都還沒打完
        · 而且冒出一列「用「ㄔㄤ ㄍ」當雇主名稱」，
          按下去就把注音符號存成雇主名字了
      組字中不要搜尋，組完（compositionend）再搜一次。
   ⚠ 打開時自動聚焦輸入框——他點這裡就是要找，少一次點擊。 */
function pkWire(o){
  var val = $(o.id + 'Val'), pop = $(o.id + 'Pop'), q = $(o.id + 'Q');
  val.addEventListener('click', function(){
    var on = pop.style.display === 'none';
    pop.style.display = on ? '' : 'none';
    val.classList.toggle('open', on);
    if(on){ pkDraw(o); setTimeout(function(){ q.focus(); }, 40); }
  });
  /* ⛔⛔ 不要用「組字中就跳過 input」的旗標。2026-09-21 第一版這樣寫，
     結果 iOS 注音打「日瀚」整個清單完全不動——compositionend 沒有照預期
     送達（或送達時 value 還沒更新），旗標就卡在 true，之後每一個 input
     事件都被跳過，等於輸入框整個死掉。
     **擋住輸入的保護，比它本來要防的問題更糟。**
     改成：永遠重畫，由 pkDraw 自己看「這一串還在組字嗎」。
     這樣就算 composition 事件一個都沒送到，搜尋照樣會動。
   ⚠ 每一個字都重畫。309 筆在前端篩，量過是毫秒等級——
     不要做防抖，那會讓打字看起來卡。 */
  q.addEventListener('input', function(){ pkDraw(o); });
  /* 組完字再補一次：WebKit 在 compositionend 當下 value 有時還沒更新，
     所以排到下一個 tick 再畫。純粹是補強，沒有它也能動。 */
  q.addEventListener('compositionend', function(){
    setTimeout(function(){ pkDraw(o); }, 0);
  });
}

/* ⚠ 最後一道防線：有些 Android 輸入法不發 compositionend。
   只要字串裡還有注音符號，就代表他還在組字——不給「自行輸入」那一列。
   （\u3105-\u312F 是注音，\u31A0-\u31BF 是閩客語擴充。） */
function pkTyping_(s){ return /[\u3105-\u312F\u31A0-\u31BF]/.test(s); }

/* 「最近選過」記在這台手機上——一人一份，不用後端。
   ⚠ 第一週它是空的，那是對的，不是壞掉。畫面上要講出來。 */
function pkRecent_(mode){
  try {
    return JSON.parse(localStorage.getItem('pk.recent.' + mode) || '[]');
  } catch(e){ return []; }
}
function pkRemember_(mode, c){
  try {
    var a = pkRecent_(mode).filter(function(x){ return x !== c; });
    a.unshift(c);
    localStorage.setItem('pk.recent.' + mode, JSON.stringify(a.slice(0, 6)));
  } catch(e){}
}

/* 體檢那一邊的選擇器。預設只給「有人要做」的——
   309 家裡 190 家現在完全沒事，列出來是純雜訊。 */
var HC_PK_ = {
  id: 'hcPk', mode: 'hc', list: [],
  onPick: function(c){
    $('hcClient').value = c;
    $('hcPkVal').textContent = c;
    $('hcPkVal').classList.add('has');
    $('hcPkVal').classList.remove('open');
    $('hcPkPop').style.display = 'none';
    hcLoadWho();
  }
};
/* 從待辦條「去開單」跳過來時，那一家先填好，他只要按「產生通知」。 */
function hcPickClient_(c){
  if(!c || !$('hcPkVal')) return;
  HC_PK_.onPick(c);
}
function hcPkClear(){
  $('hcClient').value = '';
  $('hcPkVal').textContent = '請選擇…';
  $('hcPkVal').classList.remove('has', 'open');
  $('hcPkPop').style.display = 'none';
  if($('hcPkQ')) $('hcPkQ').value = '';
}

var HC_READY_ = false;
function hcInit(){
  if(HC_READY_) return;
  HC_READY_ = true;
  hcOpt(function(o){
    /* 值是整行設定（後端要拿地址地標），但顯示只給中文名——
       2026-09-21 設定值從兩欄變五欄，整行印出來是一條看不完的管線。 */
    $('hcHos').innerHTML = o.hos.map(function(h){
      return '<option value="'+esc(h)+'">'+esc(h.split('|')[0].trim())+
             '</option>'; }).join('') +
      '<option value="'+OTHER_+'">其他（自行輸入）</option>';
    $('hcDrv').innerHTML = '<option value="">先不指定</option>' +
      o.drivers.map(function(d){
        return '<option value="'+esc(d.phone)+'">'+esc(d.name) +
               (d.phone ? '　'+esc(d.phone) : '') + '</option>'; }).join('');
    HC_SLOTS_ = o.slots || {};
    if(!$('hcDate').value) $('hcDate').value = hcNextSunday_();
    hcSlots();
    /* ⛔ 要帶什麼一定要從詞彙表點選，不要讓人打自由文字。
       2026-09-20 實機：翻譯打的中文直接印在越南籍工人的通知上，他看不懂。
       詞彙表在 HealthCheck.gs 的 HC_BRING_，四語各一份。
       表外的東西還是收（下面那格），但畫面會標「只有中文」。 */
    $('hcBringPick').innerHTML = (o.bring || []).map(function(x){
      var on = HC_BRING_DEF_.indexOf(x) !== -1;
      return '<button type="button" class="'+(on?'on':'')+'" data-b="'+esc(x)+'">' +
        esc(x) + '</button>';
    }).join('');
    [].forEach.call($('hcBringPick').children, function(b){
      b.addEventListener('click', function(){ b.classList.toggle('on'); });
    });
    /* 費用看職類：廠工 1800、看護 2000（牟佑彬 2026-09-21）。
       做成選的不是打的——打字會出現 1800／1,800／NT$1800 三種寫法。
       ⚠ 按鈕上印職類而不只是金額。翻譯記得住「這家是廠工」，
         記不住「這家是 1800」。 */
    $('hcFeePick').innerHTML = (o.fees || []).map(function(x, i){
      return '<button type="button" class="'+(i === 0 ? 'on' : '')+
        '" data-fee="'+esc(x.v)+'">'+esc(x.t)+' '+esc(hcThou_(x.v))+
        '</button>';
    }).join('');
    [].forEach.call($('hcFeePick').children, function(b){
      b.addEventListener('click', function(){
        [].forEach.call($('hcFeePick').children, function(x){
          x.classList.toggle('on', x === b); });
      });
    });
  });
  /* ⛔ 不要用填寫頁那份「服務客戶名單」。2026-09-20 實際比對：
     移工名冊上有 184 家，其中 51 家不在服務客戶名單裡（多半是家庭雇主）。
     沿用那一份的話，那 51 家的移工永遠收不到體檢通知，而且畫面上看不出來。
     體檢的事實來源是名冊——名冊上有在職的人，就要通知。 */
  google.script.run.withSuccessHandler(function(r){
    HC_PK_.list = (r && r.list) || [];
    pkDraw(HC_PK_);
  }).withFailureHandler(function(e){ toast(e.message, true); }).hcClients(CODE);
}

/* 預設勾起來的三樣。這三樣每一次體檢都要帶，不勾反而是漏。
   護照 2026-09-20 從詞彙表整個拿掉——體檢掛號認居留證就好。
   口罩 2026-09-21 加進預設（牟佑彬）。 */
var HC_BRING_DEF_ = ['居留證正本', '健保卡', '口罩'];

/* ── 報到時段：查表，不是用打的 ─────────────────────
   「醫院＋星期」就決定了報到時段，跟這一批是誰無關。
   ⛔ 醫院那天不開就把送出鈕停掉。提醒沒有用——翻譯在工廠裡
      用手機邊走邊填，警告文字會被滑過去，而代價是八個人白跑。
   ⚠ 表上沒有的醫院（他自己加的）退回讓他自己打時間。
      不知道就說不知道，不要猜一個時段出來。 */
var HC_SLOTS_ = null;

function hcSlots(){
  var sel = $('hcTime'), oth = $('hcTimeOther'), hint = $('hcSlotHint');
  var hos = (valOf($('hcHos'), $('hcHosOther')) || '').split('|')[0].trim();
  var tbl = HC_SLOTS_ && HC_SLOTS_[hos];
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec($('hcDate').value || '');
  var list = (tbl && m)
    ? (tbl[new Date(+m[1], +m[2] - 1, +m[3]).getDay()] || [])
        .map(function(p){ return p[0] + '-' + p[1]; })
    : null;

  sel.style.display = list && list.length ? '' : 'none';
  oth.style.display = list ? 'none' : '';
  hint.style.display = (list && !list.length) ? '' : 'none';

  if(list && list.length){
    var keep = sel.value;
    sel.innerHTML = list.map(function(x){
      return '<option>'+esc(x)+'</option>'; }).join('');
    if(list.indexOf(keep) !== -1) sel.value = keep;
  } else if(list){
    hint.innerHTML = '⛔ ' + esc(hos) + ' ' +
      (m ? HC_DOWZ_[new Date(+m[1], +m[2]-1, +m[3]).getDay()] : '') +
      ' 不收體檢。換日期或換醫院。';
  }
  $('hcGo').disabled = !!(list && !list.length);
}

function hcThou_(n){
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function hcFeeVal(){
  var on = [].filter.call($('hcFeePick').children, function(b){
    return b.classList.contains('on'); })[0];
  return on ? on.dataset.fee : '';
}

function hcBringVal(){
  var picked = [].filter.call($('hcBringPick').children, function(b){
    return b.classList.contains('on'); }).map(function(b){ return b.dataset.b; });
  var extra = $('hcBring').value.trim();
  return picked.concat(extra ? extra.split(/[、,，]/).map(function(x){
    return x.trim(); }).filter(String) : []).join('、');
}

function hcRideVal(){
  var r = document.querySelector('#hcRide input:checked');
  return r ? r.value : 'later';
}

/* ── 誰要通知 ───────────────────────────────────────── */

function hcLoadWho(){
  var c = $('hcClient').value;
  /* 這家肯不肯讓人平日去，只是提示，不要幫他改日期——
     那是他跟工廠人資談出來的，程式不該自作主張。 */
  var wd = HC_OPT_ && HC_OPT_.weekday.indexOf(c) !== -1;
  $('hcWeek').style.display = c ? '' : 'none';
  $('hcWeek').textContent = !c ? '' : (wd
    ? '這家可以平日體檢，日期不一定要挑週日。'
    : '這家沒列在「可平日體檢」名單裡，預設排週日。');
  if(!c){ $('hcWho').innerHTML = '<p class="hint">先選工廠</p>'; return; }
  $('hcWho').innerHTML = '<p class="hint">查名冊…</p>';
  google.script.run.withSuccessHandler(function(r){
    HC_PICK_ = (r && r.list) || [];
    hcDrawWho();
  }).withFailureHandler(function(e){
    $('hcWho').innerHTML = '<p class="hint">'+esc(e.message)+'</p>';
  }).hcPickFor(CODE, c);
}

function hcDrawWho(){
  if(!HC_PICK_.length){
    $('hcWho').innerHTML = '<p class="hint">名冊上這家沒有在職的移工。' +
      '名冊是從管理系統匯入的——人不在上面，先確認那邊有沒有，' +
      '然後重新匯入。</p>';
    $('hcTally').textContent = '';
    return;
  }
  $('hcWho').innerHTML = HC_PICK_.map(function(w, i){
    var late = w.days !== undefined && w.days < 0;
    /* 原文名印出來——中文名會撞（1781 人裡 198 個重複），
       翻譯勾人的時候看原文名才確定是哪一個。 */
    /* 電話先填的話，工人那邊從「打十碼」變成「按一下確認」。
       ⛔ 留空是正常的——不知道就讓他自己填，不要逼翻譯去問。 */
    return '<div class="hcw'+(late?' late':'')+'">' +
      '<label class="p">' +
        '<input type="checkbox" data-i="'+i+'"'+(w.pick?' checked':'')+'>' +
        '<span class="n">'+esc(w.name)+
          (w.orig?'<i class="og">'+esc(w.orig)+'</i>':'')+
          (w.lang?'<em>'+esc(w.lang)+'</em>':'')+'</span>' +
        '<span class="w'+(w.missed?' miss':'')+'">'+
          esc(w.term ? (w.term+'　'+w.why) : w.why)+
          (w.baseFrom ? '<i>依'+esc(w.baseFrom)+'</i>' : '')+'</span>' +
      '</label>' +
      '<input class="hcph" data-ph="'+i+'" inputmode="tel" value="'+
        esc(w.phone || '')+'" placeholder="'+
        (w.phone ? '' : '他的手機（知道就先填，他只要按確認）')+'">' +
    '</div>';
  }).join('');
  [].forEach.call($('hcWho').querySelectorAll('[data-i]'), function(el){
    el.addEventListener('change', function(){
      HC_PICK_[+el.dataset.i].pick = el.checked; hcTally();
    });
  });
  [].forEach.call($('hcWho').querySelectorAll('[data-ph]'), function(el){
    el.addEventListener('input', function(){
      HC_PICK_[+el.dataset.ph].phone = el.value.trim();
    });
  });
  hcTally();
}
function hcTally(){
  var n = HC_PICK_.filter(function(w){ return w.pick; }).length;
  $('hcTally').textContent = '　已選 ' + n + ' / ' + HC_PICK_.length + ' 位';
  $('hcGo').textContent = n ? ('產生通知　·　' + n + ' 人') : '產生通知';
}

/* ── 產生 ───────────────────────────────────────────── */

function hcSubmit(){
  var people = HC_PICK_.filter(function(w){ return w.pick; })
    .map(function(w){
      /* ⛔ term 要逐人帶。同一批車上可以有人是 6 個月、有人 18 個月。
         以前是開單畫面選一個套給全部人，那本來就會選錯，
         而錯的值會讓「他哪幾期做過了」跟結案算的下次到期日一起錯。 */
      /* ⛔ eid（外國人編號）一定要帶。後端用它查名冊，沒帶會直接擋下來。
         姓名會撞——1781 人裡 198 個中文名重複，連「姓名＋客戶」都撞 93 組。 */
      return { eid: w.eid, name: w.name, lang: w.lang, phone: w.phone || '',
               term: w.term || '' }; });
  if(!people.length){ toast('至少要選一位移工', true); return; }
  var hos = valOf($('hcHos'), $('hcHosOther'));
  if(!hos){ toast('請選體檢醫院', true); return; }
  var ride = hcRideVal();
  var drv = $('hcDrv');
  var o = {
    client: $('hcClient').value, date: $('hcDate').value,
    time: ($('hcTime').style.display === 'none'
             ? $('hcTimeOther').value : $('hcTime').value),
    hos: hos,
    fee: hcFeeVal(), bring: hcBringVal(),
    note: $('hcNote').value.trim(),
    ride: ride === 'self' ? '自行前往' : '接送',
    carLater: ride === 'later',
    carAt: $('hcCarAt').value, carWhere: $('hcWhere').value.trim(),
    carPlate: $('hcPlate').value.trim(),
    driver: drv.selectedIndex > 0
      ? drv.options[drv.selectedIndex].text.split('　')[0] : '',
    driverPhone: drv.value,
    people: people
  };
  if(!o.client){ toast('請選工廠', true); return; }
  if(!o.date){ toast('請選體檢日期', true); return; }
  var b = $('hcGo'); b.disabled = true; b.textContent = '產生中…';
  google.script.run.withSuccessHandler(function(r){
    b.disabled = false;
    toast('已開單　' + r.n + ' 人');
    HC_PICK_ = []; $('hcWho').innerHTML = '<p class="hint">先選工廠</p>';
    hcPkClear(); $('hcWeek').style.display = 'none';
    hcTally();
    hcShowMsgs(r.id, 'new');
  }).withFailureHandler(function(e){
    b.disabled = false; hcTally(); toast(e.message, true);
  }).hcCreate(CODE, o);
}

/* ── 要貼到群組的訊息 ───────────────────────────────── */

var HC_LGN_ = { vi:'越南文', id:'印尼文', th:'泰文', en:'英文' };

/* 「傳到 LINE」。
   ⛔ 用 line.me/R/msg/text/?<編碼過的內容>，跟服務紀錄 PDF 那邊同一套——
      不要另外發明一種。點下去會開 LINE 讓他挑聊天室，內容已經填好。

   ⚠ 這一頁跑在 Apps Script 的 iframe 裡，所以一定要用 <a target="_blank">，
     不可以用 window.open()——跨網域的頂層導向會被擋掉，而且是靜默的。

   ⚠ 訊息很長（中文編碼後大約 1500 字元）。真的太長的話 LINE 會截斷，
     所以「複製」那一顆要留著當備援，不可以拿掉。 */
function hcLineBtn(text, label){
  return '<a class="lnbtn" target="_blank" rel="noopener" href="' +
    'https://line.me/R/msg/text/?' + encodeURIComponent(text) + '">' +
    esc(label || '傳到 LINE') + '</a>';
}

function hcShowMsgs(caseId, which){
  $('hcMsgModal').style.display = '';
  $('hcMsgSub').textContent = caseId;
  $('hcMsgT').textContent = which === 'car' ? '車輛資訊補發' : '貼到工廠群組';
  $('hcMsgBody').innerHTML = '<div class="mid">產生中…</div>';
  google.script.run.withSuccessHandler(function(r){
    var m = (r && r.msgs) || [];
    if(!m.length){
      $('hcMsgBody').innerHTML = '<div class="mid">沒有要發的人</div>'; return;
    }
    /* 兩人以上就給一則群組訊息（牟佑彬 2026-09-21 選的 G3）。
       一條連結，每個人點進去認自己。
       ⛔ 放在最上面而且是預設要貼的那一則。一人一則留著當備援——
          有人沒看到群組、或要單獨補發的時候用。 */
    var g = r && r.group;
    var gh = '';
    if(g){
      gh = '<div class="hcmsg gm"><p class="h">一則貼群組　' + g.n + ' 位' +
        '<em class="sub">一條連結，各自認自己</em>' +
        hcLineBtn(g.text) +
        '<button type="button" id="hcCopyG">複製</button></p>' +
        '<pre>' + esc(g.text) + '</pre></div>' +
        '<p class="hint" style="margin:11px 0 3px">' +
        '下面這幾則是備援——有人沒看到群組、或要單獨補發的時候才用。</p>';
    }

    /* ⛔ 一人一則，不要合成一大則。2026-09-20 實機發現：
       LINE 會替每一條連結各生一張預覽卡，八個人就掛八張
       「Health Check・體檢通知」，整則被卡片淹掉，
       工人找不到自己那一行。一則一條連結＝一張乾淨的卡。 */
    $('hcMsgBody').innerHTML = gh +
      '<p class="hint">一人一則，' + m.length + ' 則。' +
      (which === 'car'
        ? '內容已經換到同一條連結上了，這幾則只是叫他回去看。'
        : '一則一個人、一條連結——合起來貼的話 LINE 會掛一排預覽卡。') +
      '</p>' +
      '<div class="hcacts" style="margin:0 0 11px">' +
        '<button type="button" id="hcCopyAll">複製全部（' + m.length + ' 則，' +
        '中間空一行）</button></div>' +
      m.map(function(x, i){
        return '<div class="hcmsg"><p class="h">' + esc(x.name) +
          '<em style="font-style:normal;font-weight:400;color:var(--ink2);' +
          'font-size:0.75rem;margin-left:6px">' +
          esc(HC_LGN_[x.lang] || x.lang) + '</em>' +
          hcLineBtn(x.text) +
          '<button type="button" data-c="'+i+'">複製</button></p>' +
          '<pre>'+esc(x.text)+'</pre></div>';
      }).join('');
    [].forEach.call($('hcMsgBody').querySelectorAll('button[data-c]'), function(b){
      b.addEventListener('click', function(){ hcCopy(m[+b.dataset.c].text, b); });
    });
    if(g) $('hcCopyG').addEventListener('click', function(){
      hcCopy(g.text, $('hcCopyG'));
    });
    $('hcCopyAll').addEventListener('click', function(){
      hcCopy(m.map(function(x){ return x.text; }).join('\n\n'), $('hcCopyAll'));
    });
  }).withFailureHandler(function(e){
    $('hcMsgBody').innerHTML = '<div class="mid">'+esc(e.message)+'</div>';
  }).hcMessages(CODE, caseId, which || 'new');
}

/* 工廠訊號差的時候 clipboard API 會靜默失敗，退回 execCommand。
   兩條都不成至少要講出來——不要什麼都不發生，那比報錯更難查。 */
function hcCopy(text, btn){
  /* 記住原本的字再改。寫死成「複製」的話，
     「複製全部（8 則…）」那顆按一次就變成「複製」，再也回不來。 */
  var was = btn.textContent;
  function done(){
    btn.textContent = '已複製';
    setTimeout(function(){ btn.textContent = was; }, 1500);
  }
  function fallback(){
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    var okd = false;
    try { okd = document.execCommand('copy'); } catch(e){}
    document.body.removeChild(ta);
    if(okd) done(); else toast('複製不了，長按上面那段文字自己選', true);
  }
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(done, fallback);
  } else { fallback(); }
}

/* ── 接送資訊（晚到的那一段）─────────────────────────

   實務上日期先發、車牌司機體檢前 3–5 天才拿到。
   ⛔ 不要重發通知。連結是活的頁面，這裡存完工人手上那條就換內容了；
      補發的三行訊息只是敲門。

   車次 = 一台車＋一個司機，底下掛幾個上車點。
   ⚠ 單位是車次不是工廠：會變的是司機，不是廠。做成一廠一列的話，
     一個司機跑兩廠就要把同一組車牌電話打兩次，改司機要改兩個地方。 */

function hcOpenCar(v){
  HC_CUR_ = v;
  var cars = (v.detail.cars || []).slice();
  if(!cars.length) cars = [{ n:1, at:'', where:'', driver:'', phone:'', plate:'' }];
  /* 已經分過車的人跟著自己那一車；沒分過的全部先放第 1 車。 */
  cars.forEach(function(c){ c.who = []; });
  v.list.forEach(function(p){
    var i = Math.max(0, cars.map(function(c){ return String(c.n); })
                            .indexOf(String(p.car)));
    cars[i].who.push(p.name);
  });
  HC_CARS_ = cars;
  $('hcCarModal').style.display = '';
  $('hcCarSub').textContent = v.date + '　·　' + v.list.length + ' 人';
  hcDrawCar();
}

function hcDrawCar(){
  var drv = (HC_OPT_ && HC_OPT_.drivers) || [];
  $('hcCarBody').innerHTML = HC_CARS_.map(function(c, i){
    return '<div class="hccar"><p class="h">第 ' + (i+1) + ' 車' +
      '<em>' + c.who.length + ' 人</em>' +
      (HC_CARS_.length > 1
        ? '<button type="button" data-rm="'+i+'">刪掉這一車</button>' : '') +
      '</p><div class="b">' +
      '<div class="g2">' +
        '<div class="f"><label>上車時間</label>' +
          '<input type="time" data-k="at" data-i="'+i+'" value="'+esc(c.at)+'"></div>' +
        '<div class="f"><label>車牌</label>' +
          '<input data-k="plate" data-i="'+i+'" value="'+esc(c.plate)+'" ' +
          'placeholder="BQL-2187"></div>' +
      '</div>' +
      '<div class="f"><label>上車地點</label>' +
        '<input data-k="where" data-i="'+i+'" value="'+esc(c.where)+'" ' +
        'placeholder="工廠大門口"></div>' +
      '<div class="f"><label>司機</label><select data-k="drv" data-i="'+i+'">' +
        '<option value="">先不指定</option>' +
        drv.map(function(d){
          return '<option value="'+esc(d.phone)+'"' +
            (d.name === c.driver ? ' selected' : '') + '>' + esc(d.name) +
            (d.phone ? '　'+esc(d.phone) : '') + '</option>';
        }).join('') + '</select></div>' +
      '<div class="f"><label>誰坐這一車</label><div class="hcwho">' +
        HC_CUR_.list.map(function(p){
          var here = c.who.indexOf(p.name) !== -1;
          return '<button type="button" class="'+(here?'on':'')+'" ' +
            'data-mv="'+esc(p.name)+'" data-to="'+i+'">'+esc(p.name)+'</button>';
        }).join('') + '</div></div>' +
      '</div></div>';
  }).join('');

  [].forEach.call($('hcCarBody').querySelectorAll('[data-k]'), function(el){
    el.addEventListener('change', function(){
      var c = HC_CARS_[+el.dataset.i];
      if(el.dataset.k === 'drv'){
        c.phone = el.value;
        c.driver = el.selectedIndex > 0
          ? el.options[el.selectedIndex].text.split('　')[0] : '';
      } else { c[el.dataset.k] = el.value; }
    });
  });
  [].forEach.call($('hcCarBody').querySelectorAll('[data-mv]'), function(b){
    b.addEventListener('click', function(){
      var nm = b.dataset.mv, to = +b.dataset.to;
      HC_CARS_.forEach(function(c){
        c.who = c.who.filter(function(x){ return x !== nm; });
      });
      HC_CARS_[to].who.push(nm);
      hcDrawCar();
    });
  });
  [].forEach.call($('hcCarBody').querySelectorAll('[data-rm]'), function(b){
    b.addEventListener('click', function(){
      var i = +b.dataset.rm;
      var moved = HC_CARS_[i].who;
      HC_CARS_.splice(i, 1);
      /* 刪掉一車，車上的人要有地方去。丟回第 1 車，不要讓他們消失——
         「有人沒分到車」存檔時會被擋，但那時候他已經不知道是誰不見了。 */
      HC_CARS_[0].who = HC_CARS_[0].who.concat(moved);
      hcDrawCar();
    });
  });
}

function hcSaveCar(){
  var b = $('hcCarSave'); b.disabled = true; b.textContent = '存…';
  google.script.run.withSuccessHandler(function(r){
    b.disabled = false; b.textContent = '存起來並補發';
    $('hcCarModal').style.display = 'none';
    if(!r.changed.length){ toast('車輛資訊已更新（沒有人的車次有變）'); openCase(HC_CUR_.id); return; }
    toast('已更新　' + r.changed.length + ' 人要重看');
    hcShowMsgs(HC_CUR_.id, 'car');
  }).withFailureHandler(function(e){
    b.disabled = false; b.textContent = '存起來並補發'; toast(e.message, true);
  }).hcSetCars(CODE, HC_CUR_.id, HC_CARS_);
}

/* ── 當天點名 ───────────────────────────────────────

   ⛔ 沒按報到 ≠ 缺席。工人自己按那顆只是訊號，在家也按得下去；
      沒按也可能是到了忘記按。所以預設值一律是「還沒點」，
      不要拿工人自己的動作直接當成點名結果。
      自己按過的會標出來當參考，但要翻譯自己勾。 */

var HC_MARK_ = {};

function hcOpenRoll(v){
  HC_CUR_ = v; HC_MARK_ = {};
  $('hcRollModal').style.display = '';
  $('hcRollSub').textContent = v.date + '　·　' + v.detail.hos;
  hcDrawRoll();
}

function hcSrc_(p){
  if(!p.inAt) return '<span class="src n">沒動作</span>';
  if(p.receipt) return '<span class="src a">收據</span>';
  if(p.inBy === '翻譯點名') return '<span class="src a">已點名</span>';
  return '<span class="src b">自己按</span>';
}

function hcDrawRoll(){
  $('hcRollBody').innerHTML =
    '<p class="hint">工人自己按的那顆只是參考——在家也按得下去。' +
    '真正算數的是你在這裡勾的。</p>' +
    HC_CUR_.list.map(function(p){
      var m = HC_MARK_[p.name];
      return '<div class="hcrow"><div class="c"><b>'+esc(p.name)+'</b>' +
        '<span>'+hcSrc_(p) + (p.inAt ? esc(p.inAt) : '還沒報到') + '</span></div>' +
        '<div class="seg2">' +
          '<button type="button" data-y="'+esc(p.name)+'"' +
            (m === true ? ' class="on"' : '') + '>到</button>' +
          '<button type="button" data-n="'+esc(p.name)+'"' +
            (m === false ? ' class="no on"' : ' class="no"') + '>沒到</button>' +
        '</div></div>';
    }).join('');
  [].forEach.call($('hcRollBody').querySelectorAll('[data-y]'), function(b){
    b.addEventListener('click', function(){ HC_MARK_[b.dataset.y] = true; hcDrawRoll(); });
  });
  [].forEach.call($('hcRollBody').querySelectorAll('[data-n]'), function(b){
    b.addEventListener('click', function(){ HC_MARK_[b.dataset.n] = false; hcDrawRoll(); });
  });
  var done = Object.keys(HC_MARK_).length;
  var no = Object.keys(HC_MARK_).filter(function(k){ return !HC_MARK_[k]; });
  $('hcRollN').textContent = '已點 ' + done + ' / ' + HC_CUR_.list.length +
    (no.length ? ('　沒到 ' + no.length) : '');
}

function hcSaveRoll(){
  if(!Object.keys(HC_MARK_).length){ toast('還沒點任何人', true); return; }
  var no = Object.keys(HC_MARK_).filter(function(k){ return !HC_MARK_[k]; });
  if(no.length && !confirm('要記「沒到」的有 ' + no.length + ' 位：\n' +
      no.join('、') + '\n\n沒到要收 500 元交通費並改期。\n' +
      '他有可能是到了忘記按——確定要記沒到嗎？')) return;
  var b = $('hcRollSave'); b.disabled = true;
  google.script.run.withSuccessHandler(function(r){
    b.disabled = false; $('hcRollModal').style.display = 'none';
    toast('已存　到 ' + r.came.length + ' 人' +
          (r.missed.length ? ('　沒到 ' + r.missed.length + ' 人') : ''));
    openCase(HC_CUR_.id);
  }).withFailureHandler(function(e){
    b.disabled = false; toast(e.message, true);
  }).hcRoll(CODE, HC_CUR_.id, HC_MARK_);
}

/* ── 結案 ───────────────────────────────────────────

   結案時才算下一次到期日。算法是「下一個還沒做的期別」，
   不是「這次 + 12 個月」——法定是 6／18／30 三個固定點，不等距。 */

function hcClose(v){
  var res = {};
  var undone = [];
  v.list.forEach(function(p){
    if(p.result === '沒到'){ res[p.name] = '沒到'; return; }
    if(!p.inAt){ undone.push(p.name); return; }
    res[p.name] = '正常';
  });
  if(undone.length && !confirm('這 ' + undone.length + ' 位沒有報到紀錄：\n' +
      undone.join('、') + '\n\n先當他們沒到嗎？\n' +
      '（要改成正常的話，先回去點名）')) return;
  undone.forEach(function(n){ res[n] = '沒到'; });

  var bad = prompt('報告有異常的寫在這裡，用頓號分開。\n' +
    '沒有就直接按確定。\n\n（異常的會另外開一件就醫追蹤）', '');
  if(bad === null) return;
  String(bad).split(/[、,，]/).map(function(x){ return x.trim(); })
    .filter(String).forEach(function(n){ res[n] = '異常'; });

  google.script.run.withSuccessHandler(function(r){
    toast('已結案' + (r.bad.length ? ('　異常 ' + r.bad.length + ' 人要開就醫追蹤') : ''));
    tkBust(); loadTrack(true);
  }).withFailureHandler(function(e){ toast(e.message, true); })
    .hcCloseBatch(CODE, v.id, res);
}

/* ── 案件頁上的體檢區塊 ─────────────────────────────── */

function hcCaseBlock(caseId){
  /* 兩塊都要先清掉。只清 hcBox 的話，換看另一件案子時
     頁首會留著上一件的「接送資訊還沒填」——指著錯的案子。 */
  var box = $('hcBox'); if(box) box.remove();
  var al0 = $('hcAl'); if(al0) al0.remove();
  google.script.run.withSuccessHandler(function(v){
    if(!v || !v.has || !$('ckBody')) return;
    var old = $('hcBox'); if(old) old.remove();
    var old2 = $('hcAl'); if(old2) old2.remove();
    /* ⛔ 「接送資訊還沒填」要放在最上面，不是頁尾。
       2026-09-21 牟佑彬指出：它在整頁最下面，要捲過期別、醫院、
       時間軸、結案按鈕才看得到。**那是這一頁唯一一件要你現在動手的事**，
       擺在最後等於藏起來，而漏填的代價是一整車人在門口等不到車。 */
    if(v.needCar){
      var al = document.createElement('div');
      /* ⛔ 不可以寫 'hcbox top'。.top 早就是 App 最上面那條深藍標題列
       （深藍底＋白字），套上去之後這一塊會被塗成深藍、字變白，
       「接送資訊還沒填」就消失在淺藍底上（2026-09-22 他截圖回報）。
       擺在最上面是 insertBefore 做的，不需要任何 class。 */
    al.id = 'hcAl'; al.className = 'hcbox';
      al.innerHTML = hcCarAlert(v);
      $('ckBody').insertBefore(al, $('ckBody').firstChild);
    }
    /* ⛔ 名單也放最上面（牟佑彬 2026-09-21）。
       這一頁點進來要回答的第一個問題是「誰確認了、誰還沒」，
       不是「這件案子的細節是什麼」。細節查一次就記住了，
       名單是每天都要看的。
       ⚠ 插在接送提醒後面：接送沒填是「我現在就要做的事」，
         名單是「我要去追的事」，先做再追。 */
    var el = document.createElement('div');
    el.id = 'hcBox'; el.className = 'hcbox';
    el.innerHTML = hcBoxHtml(v);
    var after = $('hcAl');
    if(after && after.nextSibling) $('ckBody').insertBefore(el, after.nextSibling);
    else if(after) $('ckBody').appendChild(el);
    else $('ckBody').insertBefore(el, $('ckBody').firstChild);
    hcBindBox(v);
  }).withFailureHandler(function(){}).hcCaseView(CODE, caseId);
}

/* 只有這一塊會被搬到頁首。其餘的（進度、每個人的狀態）留在原位——
   那些是「看」的，不是「做」的。 */
function hcCarAlert(v){
  return '<div class="hcal ' + (v.carUrgent ? 'r' : (v.carWarn ? 'w' : '')) + '">' +
    '<b>接送資訊還沒填</b><span>' +
    (v.days === null ? '' :
      (v.days < 0 ? '體檢日已經過了' :
       v.days === 0 ? '就是今天' : ('剩 ' + v.days + ' 天'))) +
    '　·　' + v.tally.n + ' 位移工在等</span>' +
    '<button type="button" id="hcCarBtn">去填</button></div>';
}

function hcBoxHtml(v){
  var t = v.tally;
  var h = '<p class="h">通知狀態' +
    '<em>' + t.ack + ' / ' + t.n + ' 人已確認</em></p>';

  h += '<div class="hclist">' + v.list.map(function(p){
    var st = p.inAt ? 'g' : (p.ack ? 'b' : (p.seen ? 'y' : 'n'));
    var txt = p.inAt ? '已報到' : (p.ack ? '已確認' : (p.seen ? '看過沒按' : '沒讀'));
    /* 生日錯 1 次就要看得到。門檻設在 3 的話，翻譯永遠不知道前兩次
       發生過什麼——而生日存錯的時候（第一輪是工人自己填的，沒人審），
       那個人會一直錯下去，而且他輸入真的生日反而過不了。 */
    /* ⛔ 「看過沒按」跟「沒讀」要分開，因為要打的電話不一樣：
       看過沒按 → 他知道有這件事，可能只是嫌麻煩
       沒讀 → 他可能根本沒收到，或名冊上的手機是舊的 ← 更急 */
    /* ⛔ 2026-09-23：這三段本來是 .hccall／.hcnop／.hcdone，
       **而那三個類別在 app.css 裡一行樣式都沒有**——
       所以瀏覽器給了預設值：<a> 是藍色底線、<i> 是斜體。
       整個 App 沒有別的地方是斜體或藍底線，所以這一塊看起來像外來的。

       ⛔ 而且「打」原本畫在名字**上面**。這一列的主角是人，
          動作應該在最右邊——跟「去處理」「去填」同一個位置。
       ⚠ 還是要維持 <a href="tel:">，OS 才會跳撥號；只是外觀做成按鈕。 */
    var call = '', noPhone = false;
    if(!p.ack && !p.inAt){
      if(p.phone){
        call = '<a class="rcp go" href="tel:' + esc(p.phone) + '" ' +
               'data-call="' + esc(p.name) + '">打電話</a>';
      } else {
        noPhone = true;   /* 不是動作，是問題——印在電話號碼該在的位置 */
      }
    }
    var called = p.called
      ? ('<div class="hcdone">已打過　' + esc(p.called) + '</div>') : '';

    var warn = '';
    if(p.miss > 0){
      warn = '<i class="flag">⚠ 生日輸入錯 ' + p.miss + ' 次' +
        (p.dob ? ('　系統存的是 ' + esc(p.dob)) : '') +
        (p.flagged ? '　可能不是本人' : '') + '</i>';
    }
    /* 一列的順序固定：人 → 次要動作 → 狀態 → 主要動作（最右邊）。
       四個頁籤的列都是這個骨架，換頁籤不用重新學。 */
    return '<div class="hcrow"><div class="c">' +
      '<b>' + esc(p.name) + warn + '</b>' +
      '<span' + (noPhone ? ' class="nop"' : '') + '>' +
        (p.car ? ('第 ' + esc(p.car) + ' 車　') : '') +
        (p.inAt ? hcSrc_(p) : '') +
        (noPhone ? '名冊沒電話'
                 : (p.phone ? esc(p.phone) : (p.ack ? '沒留電話' : ''))) +
      '</span></div>' +
      (p.miss > 0 ? '<button type="button" class="rcp" data-fix="' +
        esc(p.name) + '">清生日</button>' : '') +
      (p.receipt ? '<button type="button" class="rcp" data-r="' + esc(p.name) +
        '">收據</button>' : '') +
      '<span class="st ' + st + '">' + txt + '</span>' +
      call + '</div>' + called +
      /* 他自己填了、而且跟名冊那支不一樣。
         ⛔ 不可以自動覆蓋名冊——手滑打錯一碼、或群組裡有人亂填，
            你會失去一個原本正確的聯絡方式，那比沒收到通知更難救。
            並排給翻譯看，按了才換。 */
      (p.said ? '<div class="hcdiff"><b>他自己填的號碼跟名冊不一樣</b>' +
        '<span>名冊 <s>' + esc(p.phone || '（空的）') + '</s>　→　' +
        '他填 <em>' + esc(p.said) + '</em></span>' +
        '<div class="act"><button type="button" data-ad="' + esc(p.name) +
        '">以他填的為準</button><button type="button" data-dr="' + esc(p.name) +
        '">不採用</button></div></div>' : '');
  }).join('') + '</div>';

  var acts = [];
  acts.push('<button type="button" id="hcMsgBtn">複製通知訊息</button>');
  if(!v.needCar && v.detail.ride === '接送')
    acts.push('<button type="button" id="hcCarBtn2">改接送資訊</button>');
  if(v.isToday || t.inn)
    acts.push('<button type="button" class="p" id="hcRollBtn">當天點名</button>');
  if(t.inn || v.days < 0)
    acts.push('<button type="button" id="hcCloseBtn">結案</button>');
  h += '<div class="hcacts">' + acts.join('') + '</div>';
  return h;
}

function hcBindBox(v){
  function on(id, fn){ var b = $(id); if(b) b.addEventListener('click', fn); }
  /* 打電話：撥號的同時就留一筆。
     ⛔ 不要做成「撥號」＋「另外按一顆已通知」兩步——
        翻譯講完電話人在工廠裡，第二顆一定會忘記按，
        然後舉證鏈就缺了那一環。撥號本身就是他做過的證據。 */
  [].forEach.call(document.querySelectorAll('#hcBox [data-call]'), function(a){
    a.addEventListener('click', function(){
      google.script.run
        .withSuccessHandler(function(){ hcCaseBlock(v.id); })
        .withFailureHandler(function(e){ toast(e.message, true); })
        .hcMarkCalled(CODE, v.id, a.dataset.call, '');
    });
  });
  on('hcCarBtn', function(){ hcOpenCar(v); });
  on('hcCarBtn2', function(){ hcOpenCar(v); });
  on('hcMsgBtn', function(){ hcShowMsgs(v.id, 'new'); });
  on('hcRollBtn', function(){ hcOpenRoll(v); });
  on('hcCloseBtn', function(){ hcClose(v); });
  [].forEach.call(document.querySelectorAll('#hcBox [data-r]'), function(b){
    b.addEventListener('click', function(){ hcReceipt(v.id, b.dataset.r); });
  });
  [].forEach.call(document.querySelectorAll('#hcBox [data-fix]'), function(b){
    b.addEventListener('click', function(){ hcFixDob(v, b.dataset.fix); });
  });
  [].forEach.call(document.querySelectorAll('#hcBox [data-ad]'), function(b){
    b.addEventListener('click', function(){ hcPhone(v, b.dataset.ad, 1); });
  });
  [].forEach.call(document.querySelectorAll('#hcBox [data-dr]'), function(b){
    b.addEventListener('click', function(){ hcPhone(v, b.dataset.dr, 0); });
  });
}

/* 採用或丟棄移工自己回報的號碼。兩種都會在備註留痕，
   之後要查「這支號碼是誰改的、什麼時候改的」查得到。 */
function hcPhone(v, name, take){
  var p = v.list.filter(function(x){ return x.name === name; })[0] || {};
  /* ⚠ 確認框**不要承諾同步到個人資料**。
     ⛔ 前端會比後端早到（Pages 推了、Apps Script 還沒部署），
        那個空檔裡承諾會變成謊話。真正發生了什麼由下面的 toast
        照後端回的 r.sync 講——那是唯一知道實情的地方。
     ⚠ 舊版寫「更新名冊」，
     但它根本沒碰名冊、也沒碰個人資料——只改了體檢那一列。
     按鈕名字騙人比功能沒做還糟（牟佑彬 2026-09-24 抓到）。 */
  if(take && !confirm('把「' + name + '」的電話改成他自己填的？\n\n' +
      '現在：' + (p.phone || '（空的）') + '\n' +
      '他填：' + p.said)) return;
  google.script.run.withSuccessHandler(function(r){
    /* ⛔ 不可以一律說「已更新」。同步失敗的時候這一場換了、個人資料沒換，
       畫面講得肯定而錄錯是最糟的一種。 */
    if(!take){ toast('已記錄，號碼不改'); }
    else if(r && r.sync && r.sync.ok){ toast('換好了，個人資料也同步了'); }
    else { toast((r && r.note) || '這一場換了，個人資料沒換到', true); }
    openCase(v.id);
  }).withFailureHandler(function(e){ toast(e.message, true); })
    [take ? 'hcAdoptPhone' : 'hcDropSaidPhone'](CODE, v.id, name);
}

/* 清掉存錯的生日，讓工人重填一次。
   ⛔ 沒有這一顆的話，生日一填錯就把人鎖在外面：那個錯的值變成往後
      每一次的門檻，他輸入真的生日反而過不了，而翻譯兩張表都改不到。 */
function hcFixDob(v, name){
  var p = v.list.filter(function(x){ return x.name === name; })[0] || {};
  if(!confirm('要清掉「' + name + '」的生日嗎？\n\n' +
      '系統現在存的是：' + (p.dob || '（空的）') + '\n' +
      '他已經輸入錯 ' + (p.miss || 0) + ' 次。\n\n' +
      '清掉之後，他下一次開連結填什麼就存什麼——\n' +
      '所以先確認那個人真的是本人再清。')) return;
  google.script.run.withSuccessHandler(function(r){
    toast('已清掉（原本 ' + r.was + '），請他重開連結填一次');
    openCase(v.id);
  }).withFailureHandler(function(e){ toast(e.message, true); })
    .hcResetDob(CODE, v.id, name);
}

/* 收據只在點「看大圖」時才抓。列表一次帶十張圖回來，
   在工廠的 4G 下就是十幾秒的空白。 */
function hcReceipt(caseId, name){
  toast('讀收據…');
  google.script.run.withSuccessHandler(function(r){
    if(!r || !r.ok){ toast('讀不到這張收據', true); return; }
    var w = window.open('');
    if(!w){ toast('瀏覽器擋掉新分頁了', true); return; }
    w.document.write('<title>' + esc(name) + ' 收據</title>' +
      '<body style="margin:0;background:#111"><img style="width:100%" src="data:' +
      r.mime + ';base64,' + r.data + '">');
    w.document.close();
  }).withFailureHandler(function(e){ toast(e.message, true); })
    .hcReceiptData(CODE, caseId, name);
}

/* ── 追蹤頁頂端的兩條提醒 ───────────────────────────── */

/* 追蹤頁頂端的提醒條。
   ⛔ 收成一行。原本兩三條攤開，佔掉第一屏，
      他剛開的那張單被推到看不見的地方——2026-09-21 他反映的就是這個。
      **提醒的作用是叫你去看，不是自己變成主角。**
   ⛔ 兩支後端各自回來就各自 += 的話會疊。loadTrack 會被叫好幾次
      （切頁籤、切篩選、存完檔重載），第二輪的清空跟第一輪的回呼交錯，
      畫面上就出現兩條一模一樣的。改成兩支都回來才一次畫完，
      並用序號擋掉舊的那一輪。 */
var HC_NUDGE_SEQ_ = 0;
var HC_NUDGE_ = null;          // 上一次算好的內容，展開時重畫用


/* ── 設定 ───────────────────────────────────────────── */

function hcOpenSet(){
  hcOpt(function(o){
    $('hcSetHos').value = o.hos.join('\n');
    $('hcSetDrv').value = o.drivers.map(function(d){
      return d.name + (d.phone ? (',' + d.phone) : ''); }).join('\n');
    $('hcSetWd').value = o.weekday.join('\n');
    $('hcSetModal').style.display = '';
  });
}

function hcSaveSet(){
  var b = $('hcSetSave'); b.disabled = true;
  var jobs = [['體檢常用醫院', $('hcSetHos').value],
              ['接送司機名單', $('hcSetDrv').value],
              ['可平日體檢的工廠', $('hcSetWd').value]];
  var left = jobs.length, bad = 0;
  jobs.forEach(function(j){
    google.script.run.withSuccessHandler(fin).withFailureHandler(function(e){
      bad++; toast(e.message, true); fin();
    }).hcSaveSetting(CODE, j[0], j[1]);
  });
  function fin(){
    if(--left) return;
    b.disabled = false;
    if(bad) return;
    $('hcSetModal').style.display = 'none';
    HC_OPT_ = null; HC_READY_ = false; hcInit();
    toast('設定已更新');
  }
}

/* ── 綁定 ───────────────────────────────────────────── */

pkWire(HC_PK_);
$('hcDate').addEventListener('change', hcSlots);
$('hcHosOther').addEventListener('input', hcSlots);
$('hcHos').addEventListener('change', function(){
  $('hcHosOther').style.display = $('hcHos').value === OTHER_ ? '' : 'none';
  hcSlots();
});
[].forEach.call($('hcRide').querySelectorAll('input'), function(r){
  r.addEventListener('change', function(){
    var v = hcRideVal();
    $('hcCarNow').style.display = v === 'now' ? '' : 'none';
    $('hcRideHint').textContent = v === 'later'
      ? '工人那邊會顯示「車輛資訊 體檢前 3 天通知」，不會是空白。體檢前 5 天追蹤頁會自己提醒你填。'
      : v === 'now'
        ? '現在填的話，工人第一次點連結就看得到車牌與司機。'
        : '自行前往：當天 06:00–14:00 那條連結會變成報到畫面，他自己按「我到了」，還可以選填上傳繳費收據。';
  });
});
$('hcGo').addEventListener('click', hcSubmit);
$('hcSet').addEventListener('click', hcOpenSet);
$('hcSetX').addEventListener('click', function(){ $('hcSetModal').style.display='none'; });
$('hcSetSave').addEventListener('click', hcSaveSet);
$('hcMsgX').addEventListener('click', function(){ $('hcMsgModal').style.display='none'; });
$('hcCarX').addEventListener('click', function(){ $('hcCarModal').style.display='none'; });
$('hcCarSave').addEventListener('click', hcSaveCar);
$('hcCarAdd').addEventListener('click', function(){
  HC_CARS_.push({ n: HC_CARS_.length + 1, at:'', where:'', driver:'',
                  phone:'', plate:'', who:[] });
  hcDrawCar();
});
$('hcRollX').addEventListener('click', function(){ $('hcRollModal').style.display='none'; });
$('hcRollSave').addEventListener('click', hcSaveRoll);

/* ══════════════════════════════════════════════════════════════
   體檢頁籤的批次卡與日期分組（2026-09-21，牟佑彬選 A）

   ⛔ 為什麼要另外一套卡：通用的 caseCard 把 workers 整串印出來。
      體檢一批 17 個人，那張卡就印 17 個名字佔半個螢幕，
      而真正要看的「幾個人、確認了幾個、還缺什麼」一個都沒有。

   批次卡的主角是**日期與進度**，名字收進去點開才看。
   「已確認 5/8」那條進度條是整張卡最有用的一行——
   它回答「我現在要不要催人」。
   ══════════════════════════════════════════════════════════════ */

var HC_Q_ = '';                     // 搜尋字串
var HC_ALERT_OPEN_ = false;         // 提醒條展開了沒

var HC_DOWZ_ = ['日', '一', '二', '三', '四', '五', '六'];

/** 2026-09-27 → { d:'9/27', w:'週日', days:6 } */
function hcDay_(ymd){
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
  if(!m) return null;
  var dt = new Date(Date.UTC(+m[1], +m[2]-1, +m[3]));
  var t = new Date();
  var today = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
  return { d: (+m[2]) + '/' + (+m[3]), w: '週' + HC_DOWZ_[dt.getUTCDay()],
           days: Math.round((dt.getTime() - today) / 86400000) };
}

/** 今天開的單要標「剛開的」——這是他開完單找不到自己那張的解法。 */
function hcIsNew_(c){
  var t = new Date();
  var today = t.getFullYear() + '-' + ('0'+(t.getMonth()+1)).slice(-2) +
              '-' + ('0'+t.getDate()).slice(-2);
  return c.openedAt === today;
}

/** 這一批現在卡在哪。回空字串＝沒事，不要為了填滿版面硬寫一句。 */
function hcTodo_(c){
  var h = c.hc || {}, day = hcDay_(c.nextDate);
  if(c.status !== '進行中') return null;
  if(day && day.days === 0 && h.n && h.inn < h.n)
    return { t: '今天要點名　' + (h.n - h.inn) + ' 人還沒報到', bad: 1 };
  if(h.ride === '接送' && !h.car && day && day.days <= 5)
    return { t: '接送資訊還沒填　剩 ' + day.days + ' 天', bad: day.days <= 2 };
  if(h.n && h.ack === 0 && day && day.days <= 10)
    return { t: '發出去了，一個都還沒確認', bad: day.days <= 3 };
  if(h.flag) return { t: h.flag + ' 人生日連錯，可能不是本人', bad: 1 };
  if(h.said) return { t: h.said + ' 人回報了新號碼，要不要改過來', bad: 0 };
  return null;
}

function hcPill_(c){
  var day = hcDay_(c.nextDate);
  if(c.status === '已結案') return ['g', '已結案'];
  if(c.status === '已取消') return ['', '已取消'];
  if(!day) return ['i', '沒設日期'];
  if(day.days < 0) return ['b', '過了 ' + (-day.days) + ' 天'];
  if(day.days === 0) return ['b', '今天'];
  if(day.days <= 5) return ['w', '剩 ' + day.days + ' 天'];
  return ['i', '剩 ' + day.days + ' 天'];
}

/* 票根（牟佑彬 2026-09-21 選的 T3）。

   ⛔ 大字放什麼要看他怎麼去，不是固定一種：
      坐車 → 上車時段。他真正要記的是幾點在哪等車，
              報到時間退成小字（車到了自然就到了）。
      自去 → 報到時段。沒有人接他，時間就是他的責任。
      把兩種印成同一種，等於叫坐車的人自己看著報到時間出門。

   ⛔ 兩個名字都要印。中文是我們內部叫的，原文是他護照上的——
      當天在醫院門口點名、打電話給他，用得到的是原文那個。

   日期不在卡片上，在上面那條分組標題（同一天的排在一起）。 */
/* ── 體檢：一列一批 ＋ 待辦條（牟佑彬選的 ①＋②）────────

   ⛔ 2026-09-22 之前是「一批一張票根卡」，一張佔 190px，
      三批就要捲兩個畫面；而且要點進去才知道誰沒讀、接送車填了沒。
      他說：「盡量塞在一個頁面，看起來非常精簡俐落乾淨」。

   體檢跟返鄉問的問題不一樣：
     返鄉 → 「誰還在國外」＝一個時間點
     體檢 → 「還有誰沒確認、我要打給誰」＝一份待辦
   所以版型同構，但**右邊那一欄放的是確認進度**，不是日期區間。
   逾期受罰的是雇主，而罰的原因幾乎都是「通知發了但沒人確認」。

   ⚠ 展開裡面的東西**完全重用案件頁那兩支**（hcCarAlert / hcBoxHtml /
     hcBindBox）——它們已經會畫每個人的沒讀／沒電話／打電話／
     生日錯／他自己填的號碼。不要再寫第二份。 */

var HCX_ = '';        // 目前展開的是哪一批
var HCV_ = {};        // 展開過的就記著，收合再打開不用重抓

/* 待辦條：把每一批的 hcTodo_ 攤平成一條一件。
   ⛔ 沒有待辦就整條不出現。永遠掛一塊「目前沒有待辦」在那裡，
      兩個禮拜後他就不會再看它了——跟返鄉的 GATE 同一個規矩。 */
/* ── 一條提醒，四種案件共用（2026-09-22 設計檢視第 2、3、4 項）──

   ⛔ 在這之前有**兩條**提醒列在講重疊的事：
      舊的 hcNudge（收合式、掛在 #tkBody 外面，所以四個頁籤都看得到，
      你在看返鄉它在講體檢的接送車）＋ 我 9/22 新加的 hcTodoBar。
      兩條文案不同、排序不同、收合狀態不同。**那是我造成的。**

   ⛔ 而且四個頁籤裡**只有體檢有催辦**。返鄉逾期 41 天未回，
      畫面上只有一行紅字——它應該來找你，不是等你去找它。

   ⛔ 舊的提醒用**文字**指路：「到『填寫 → 體檢通知』開單」。
      但體檢開單 9/22 已經搬到追蹤頁籤了，那句話沒跟著搬。
      **文案會過期，按鈕不會**——所以每一條現在都是按鈕。

   ⚠ 沒有待辦就整條不出現。永遠掛一塊「目前沒有待辦」在那裡，
     兩個禮拜後就沒有人看它了。 */

var TKTODO_ = [];
var TKTODO_SEQ_ = 0;

/* 從已經載到的案件算出來的待辦（不用再打後端）。
   ⚠ 只算「現在這一種」——別種的資料還沒載，算出來會是錯的。 */
function tkTodoLocal_(){
  var out = [], today = todayStr();
  (TK_ROWS || []).forEach(function(c){
    if(c.status !== '進行中') return;
    var d = c.detail || {};
    if(c.kind === '返鄉休假'){
      /* ⛔ 逾期未回是這個業務最嚴重的事之一。
         本來只有那一列變紅，而你要先打開返鄉頁籤才看得到。 */
      if(d.back && d.back < today){
        var late = vtDay_(vtParse_(d.back), vtParse_(today));
        out.push({ k: c.kind, id: c.id, bad: late > 3,
          t: (c.workers || c.client) + '　回台日過了 ' + late + ' 天還沒結案',
          s: c.client + '　回台 ' + d.back });
      } else if(!d.out && !c.nextDate){
        out.push({ k: c.kind, id: c.id, bad: 0,
          t: (c.workers || c.client) + '　還沒排日期',
          s: c.client + '　開案 ' + (c.openedAt || '') });
      }
    } else if(c.kind === '異常事件' || c.kind === '就醫追蹤'){
      /* 排了下一次卻過期，代表那一天沒有人去做。 */
      if(c.nextDate && c.nextDate < today){
        out.push({ k: c.kind, id: c.id, bad: 1,
          t: (c.workers || c.client) + '　' + c.nextDate + ' 那一次沒有紀錄',
          s: c.client + '　' + (c.nextNote || c.kind) });
      } else if(!c.nextDate && !c.recCount){
        out.push({ k: c.kind, id: c.id, bad: 0,
          t: (c.workers || c.client) + '　開了案但還沒有任何紀錄',
          s: c.client + '　開案 ' + (c.openedAt || '') });
      }
    }
  });
  return out;
}

function tkTodo(){
  var box = $('tkTodo');
  if(!box){
    box = document.createElement('div');
    box.id = 'tkTodo';
    $('tkBody').parentNode.insertBefore(box, $('tkBody'));
  }
  var seq = ++TKTODO_SEQ_;
  var got = { car: null, ack: null, due: null, cf: null };

  function paint(){
    if(seq !== TKTODO_SEQ_) return;
    if(got.car === null || got.ack === null || got.due === null ||
       got.cf === null) return;
    /* ⛔ 排序＝「要花多少時間才追得完」，不是嚴重度。
       「還沒確認」要打電話給好幾個人，最花時間，所以排最前面。
       「還沒開單」是自己按幾下就好。 */
    /* 衝突排最前面。它代表「畫面上現在顯示的資料可能不是你要的」——
       在那之前做的任何判斷都可能是錯的，所以要先解決。 */
    TKTODO_ = got.cf.concat(got.ack, got.due, got.car, tkTodoLocal_());
    tkDrawTodo();
  }
  function fail(k){ return function(){ got[k] = []; paint(); }; }

  /* 還沒確認的人——通知發了但沒人按。 */
  google.script.run.withSuccessHandler(function(r){
    var l = (r && r.list) || [];
    got.ack = l.map(function(x){
      return { k: '體檢通知', id: x.caseId || x.id, bad: x.days <= 1,
        t: x.client + '　' + x.list.length + ' 位還沒確認，要打電話',
        s: '剩 ' + x.days + ' 天　' +
           x.list.map(function(p){ return p.name; }).join('、') };
    });
    paint();
  }).withFailureHandler(fail('ack')).hcAckTodo(CODE);

  /* ⛔ 你改過的手機／生日，跟管理系統後來改的打架了。
     ⚠ 只有**真衝突**會來（管理系統沒動、或改成跟你一樣的都不會）。
       會亂叫的警報比沒有警報更糟。 */
  google.script.run.withSuccessHandler(function(r){
    got.cf = ((r && r.list) || []).map(function(x){
      var f = x.phone ? '手機' : '生日';
      var d = x.phone || x.dob || {};
      return { k: '名冊', eid: x.eid, go: 'conflict', field: x.phone ? 'phone' : 'dob',
               bad: 1,
               t: (x.name || x.orig) + '　' + f + '有兩個版本，要用哪一個',
               s: '你改的 ' + (d.mine || '（空的）') +
                  '　·　管理系統 ' + (d.now || '（空的）') +
                  (x.client ? ('　·　' + x.client) : '') };
    });
    paint();
  }).withFailureHandler(fail('cf')).svcConflicts(CODE);

  /* 接送資訊還沒填。 */
  google.script.run.withSuccessHandler(function(r){
    var l = (r && r.list) || [];
    got.car = l.map(function(x){
      return { k: '體檢通知', id: x.caseId || x.id, bad: !!x.late,
        t: x.client + '　接送資訊還沒填',
        s: x.date + '　剩 ' + x.days + ' 天' };
    });
    paint();
  }).withFailureHandler(fail('car')).hcCarTodo(CODE);

  /* ⛔ 這一條是第 2 項：「誰該開體檢單」。
     資料一直都算得出來（hcDueSoon），但以前只出現在
     **開單畫面的選擇器裡**——你得先決定要開單，才看得到誰該開單。
     這是整個 App 唯一會產生罰鍰的環，所以要放到最外面。 */
  google.script.run.withSuccessHandler(function(r){
    var all = (r && r.list) || [];
    var l = all.filter(function(x){ return !x.noBase; });
    var nb = all.filter(function(x){ return x.noBase; });
    var out = [];
    if(l.length){
      var late = l.filter(function(x){ return x.late; }).length;
      /* 同一家工廠的人合成一條——他是一家一家開單的，不是一個一個。 */
      var byC = {}, order = [];
      l.forEach(function(x){
        if(!byC[x.client]){ byC[x.client] = []; order.push(x.client); }
        byC[x.client].push(x);
      });
      order.forEach(function(cl){
        var g = byC[cl], lt = g.filter(function(x){ return x.late; }).length;
        out.push({ k: '體檢通知', go: 'hcnew', client: cl, bad: !!lt,
          t: cl + '　' + g.length + ' 人體檢到期還沒開單' +
             (lt ? ('（逾期 ' + lt + ' 人）') : ''),
          s: g.slice(0, 3).map(function(x){
               return x.name + (x.late ? ('　逾期 ' + (-x.days) + ' 天')
                                       : ('　剩 ' + x.days + ' 天'));
             }).join('　·　') });
      });
    }
    /* 算不出到期日的人要講出來，不要靜靜地漏掉。
       這是名冊缺資料，不是沒有人到期。 */
    if(nb.length){
      out.push({ k: '體檢通知', bad: 0,
        t: nb.length + ' 人算不出體檢到期日',
        s: '名冊上沒有許可生效日：' +
           nb.slice(0, 4).map(function(x){ return x.name; }).join('、') +
           (nb.length > 4 ? ' 等' : '') + '　·　要改請改管理系統再重匯' });
    }
    got.due = out; paint();
  }).withFailureHandler(fail('due')).hcDueSoon(CODE, 30);
}

function tkDrawTodo(){
  var box = $('tkTodo');
  if(!box) return;
  var n = (TKTODO_ || []).length;
  if(!n){ box.innerHTML = ''; return; }
  var bad = TKTODO_.some(function(x){ return x.bad; });
  /* 超過四條就收起來。全部攤開的話，畫面上再也看不到案件本身。 */
  var show = TKTODO_OPEN_ ? TKTODO_ : TKTODO_.slice(0, 4);
  var more = n - show.length;

  box.innerHTML = '<div class="tktd' + (bad ? ' bad' : '') + '">' +
    '<div class="bar"><b>要你處理</b>' +
      '<span class="now">' + n + ' 件待辦' +
        (more > 0 ? '　<em class="mo">看全部</em>' :
         (TKTODO_OPEN_ && n > 4 ? '　<em class="mo">收起來</em>' : '')) +
      '</span></div>' +
    show.map(function(x, i){
      return '<button type="button" class="tktr" data-i="' + i + '">' +
        '<i class="dot' + (x.bad ? ' r' : '') + '"></i>' +
        '<span class="tx"><b>' + esc(x.t) + '</b>' +
          '<s>' + esc(TK_SHORT[x.k] || x.k) + '　' + esc(x.s) + '</s></span>' +
        '<span class="go">' + (x.go === 'hcnew' ? '去開單' : '去處理') + '</span>' +
      '</button>';
    }).join('') +
  '</div>';

  var mo = box.querySelector('.mo');
  if(mo) mo.addEventListener('click', function(ev){
    ev.stopPropagation(); TKTODO_OPEN_ = !TKTODO_OPEN_; tkDrawTodo();
  });
  [].forEach.call(box.querySelectorAll('.tktr'), function(b){
    b.addEventListener('click', function(){ tkTodoGo_(show[+b.dataset.i]); });
  });
}
var TKTODO_OPEN_ = false;

/* ⛔ 按鈕直接帶過去，不要用文字指路。
   2026-09-22 之前那句「到『填寫 → 體檢通知』開單」在功能搬家之後
   就指到空的地方了——**文案會過期，按鈕不會**。 */
function tkTodoGo_(x){
  if(!x) return;
  /* 名冊衝突：直接開那個人的頁面，兩個值並排給他選。 */
  if(x.go === 'conflict'){
    if(typeof pplOpen === 'function'){
      document.body.classList.add('finding');
      return pplOpen('w', x.eid);
    }
    return;
  }
  var goNew = (x.go === 'hcnew');
  var need = x.k;
  function arrive(){
    if(goNew){
      hcMode(true);
      /* 那一家先填好，他只要按「產生通知」。 */
      if(x.client && typeof hcPickClient_ === 'function') hcPickClient_(x.client);
    } else if(x.id){
      if(need === '返鄉休假') VACX_ = x.id;
      if(need === '體檢通知') HCX_ = x.id;
      drawCases();
      var el = $('tkBody').querySelector('[data-vac="' + x.id + '"],[data-hc="' + x.id + '"]');
      if(el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      else openCase(x.id);      /* 異常與就醫還沒有就地展開，開整頁 */
    }
  }
  if(TK_CUR === need){ arrive(); return; }
  TK_CUR = need;
  hcMode(false);
  drawKinds();
  loadTrack();
  /* loadTrack 有快取就同步畫完，沒有的話要等。兩種都要能到。 */
  setTimeout(arrive, TK_CACHE[need] ? 60 : 900);
}


/* 一列一批。⚠ 至少 78px——工廠裡站著單手點。 */
function hcRow(c){
  var h = c.hc || {}, day = hcDay_(c.nextDate), p = hcPill_(c);
  var open = (HCX_ === c.id);
  var todo = hcTodo_(c);
  /* 當天之後看的是報到，不是確認——那時候「誰確認了」已經沒有意義。 */
  var after = day && day.days <= 0 && h.n;
  var got = after ? h.inn : h.ack;
  var pct = h.n ? Math.round((got / h.n) * 100) : 0;
  /* ⛔ tone 只用來挑 class，不要拿它去組色碼。 */
  var tone = !h.n ? 'dim' : (got >= h.n ? 'g' : (got === 0 ? 'rd' : 'am'));
  var stCls = { g:'st-ok', am:'st-warn', rd:'st-bad', dim:'st-dim' }[tone];

  var ride = (h.ride === '自行前往');
  var line2 = (ride ? '自行前往' : '接送') +
    (h.hos ? ('　' + h.hos) : '　醫院未填') +
    (h.time ? ('　報到 ' + h.time) : '');

  /* 名字：前三個，多的寫「等 N 人」。⚠ 名單是空的要講出來——
     那一批不會有任何人收到通知，而畫面上看起來跟正常的一樣。 */
  var who = (h.who || []);
  var nm = h.n ? (who.join('、') + (h.n > who.length ? (' 等 ' + h.n + ' 人') : ''))
               : '名單是空的，這批不會有人收到通知';

  return '<div class="lrow hrow' + (open ? ' on' : '') + (todo && todo.bad ? ' bad' : '') +
      '" data-hc="' + esc(c.id) + '">' +
    '<span class="d">' + (day ? esc(day.d) : '—') +
      '<s>' + (day ? esc(day.w.slice(1)) : '沒日期') + '</s></span>' +
    '<span class="m">' +
      '<span class="t1">' + esc(line2) + '</span>' +
      '<span class="nm' + (h.n ? '' : ' none') + '">' + esc(c.client || '') +
        /* 今天開的標一下。⛔ 不要拿掉——這是他開完單找不到自己
           那一張的解法（清單照體檢日排，新開的可能排在很後面）。 */
        (hcIsNew_(c) ? '<em class="new">剛開的</em>' : '') + '</span>' +
      '<span class="co">' + esc(nm) + '</span>' +
      (h.n ? ('<span class="pg"><i class="bnd-' +
              (tone === 'g' ? 'ok' : tone === 'rd' ? 'bad' : 'warn') +
              '" style="width:' + Math.max(3, pct) + '%"></i></span>') : '') +
    '</span>' +
    '<span class="b">' +
      (h.n ? ('<span class="st ' + stCls + '">' + got + ' / ' + h.n + '</span>') : '') +
      '<span class="big ' + ({ g:'st-ok', w:'st-warn', b:'st-bad',
                                i:'st-info' }[p[0]] || 'st-dim') + '">' +
        (day && day.days !== null ? Math.abs(day.days) : '—') + '</span>' +
      '<span class="s2">' +
        (!day ? '沒設日期'
              : day.days === 0 ? '今天'
              : day.days < 0 ? '天前' : '天後') +
        (open ? '　⌃' : '　⌄') + '</span>' +
    '</span>' +
  '</div>' + (open ? hcExp(c) : '');
}

/* 展開。內容要跟後端要（誰沒讀、誰沒電話那些不在清單的資料裡），
   所以先放一個殼，拿到再填。 */
function hcExp(c){
  return '<div class="hexp" id="hcExp-' + esc(c.id) + '">' +
    '<div class="mid" style="padding:18px;font-size:0.8125rem">載入中…</div></div>';
}

/* 把案件頁那兩塊搬進展開區。⛔ 不要重寫——hcBoxHtml 已經處理了
   沒讀／看過沒按／名冊沒電話／生日錯／他自己填了新號碼那五種狀況。 */
function hcExpFill(c){
  var box = $('hcExp-' + c.id);
  if(!box) return;
  function draw(v){
    if(!v || !v.has){ box.innerHTML =
      '<div class="mid" style="padding:18px;font-size:0.8125rem">這一批沒有名單</div>';
      return; }
    var d = v.detail || {};
    var kv = [];
    /* ⛔ d.hos 是用 | 分欄存的：名稱|英文名|地址|地標|地圖網址。
       整串印出來就是一大坨（他 2026-09-22 截圖裡最擠的地方）。
       拆成三行：名稱＋報到時間、地址＋認路的地標、一顆開地圖。
       ⚠ 英文名不印——那是給工人的通知訊息在用的，翻譯的畫面上是雜訊。 */
    if(d.hos){
      var hp = String(d.hos).split('|');
      var hname = (hp[0] || '').trim();
      var haddr = [(hp[2] || '').trim(), (hp[3] || '').trim()]
                    .filter(function(x){ return x; }).join('・');
      var hmap  = (hp[4] || '').trim();
      kv.push(['醫院', esc(hname) + (d.time ? ('　報到 ' + esc(d.time)) : '') +
        (haddr ? ('<br><span class="sub">' + esc(haddr) + '</span>') : '') +
        (hmap ? ('<br><a href="' + esc(hmap) + '" target="_blank" ' +
                 'rel="noopener" class="lnk">開地圖</a>') : ''), 1]);
    }
    if(d.ride === '接送'){
      kv.push(['接送車', v.needCar ? '上車時間未定'
        : ((d.at || '') + '　' + (d.where || ''))]);
    }
    if(d.bring) kv.push(['要帶', d.bring]);
    box.innerHTML =
      (v.needCar ? ('<div class="hcbox">' + hcCarAlert(v) + '</div>') : '') +
      '<div class="hcbox">' + hcBoxHtml(v) + '</div>' +
      /* r[2] 為真＝這一格已經是組好的 HTML，不要再 esc 一次。 */
      (kv.length ? ('<dl class="hkv">' + kv.map(function(r){
        return '<dt>' + esc(r[0]) + '</dt><dd>' +
          (r[2] ? r[1] : esc(r[1])) + '</dd>';
      }).join('') + '</dl>') : '') +
      '<div class="hacts">' +
        '<button type="button" data-ha="next">改日期</button>' +
        '<button type="button" data-ha="detail">填細節</button>' +
        '<button type="button" class="full" data-ha="full">' +
          '打開完整那一頁（結案／開錯了／服務紀錄）</button>' +
      '</div>';
    hcBindBox(v);
    [].forEach.call(box.querySelectorAll('[data-ha]'), function(el){
      el.addEventListener('click', function(ev){
        ev.stopPropagation();
        var a = el.dataset.ha;
        if(a === 'full') openCase(c.id);
        else if(a === 'next') caseSetNext(c);
        else if(a === 'detail') openDetailForm(c);
      });
    });
  }
  if(HCV_[c.id]) { draw(HCV_[c.id]); return; }
  google.script.run
    .withSuccessHandler(function(v){ HCV_[c.id] = v; draw(v); })
    .withFailureHandler(function(e){
      box.innerHTML = '<div class="mid" style="padding:18px;font-size:0.8125rem">' +
        esc((e && e.message) || '讀不到') + '</div>';
    })
    .hcCaseView(CODE, c.id);
}

/* ── 搜尋 ──────────────────────────────────────────
   搜工廠、移工姓名、單號。24 件已經要捲，一年下來會有兩百多件。 */
function hcHit_(c, q){
  if(!q) return true;
  return [c.client, c.workers, c.id, c.crew, (c.hc || {}).hos]
    .join(' ').toLowerCase().indexOf(q) !== -1;
}

/* 一份清單，照體檢日排。⛔ 不要再依日期分組——
   2026-09-22 之前是分組的，但一天通常只有一批，那個標題等於白佔一行。
   日期已經印在每一列的左邊了。 */
function hcList(rows){
  var q = HC_Q_.trim().toLowerCase();
  var hit = rows.filter(function(c){ return hcHit_(c, q); });
  if(!hit.length){
    return '<div class="mid" style="padding:26px">' +
      (q ? ('找不到「' + esc(HC_Q_) + '」') : '這個條件下沒有體檢單') + '</div>';
  }
  /* 沒設日期的排最後——它是待辦，不是某一天的事。 */
  hit.sort(function(a, b){
    var x = a.nextDate || '9999', y = b.nextDate || '9999';
    return x.localeCompare(y);
  });
  var ppl = hit.reduce(function(s, c){ return s + ((c.hc || {}).n || 0); }, 0);
  var noAck = hit.reduce(function(s, c){
    var h = c.hc || {};
    return s + (c.status === '進行中' ? Math.max(0, (h.n || 0) - (h.ack || 0)) : 0);
  }, 0);

  return     '<div class="hb">' +
      /* ⛔ 同上：清單照體檢日排，所以三分法寫在標頭，不另外加一排。
         ⚠ 「幾批幾人」留著——那是這一頁獨有的形狀（一張單底下一整批人），
           三分法回答不了它。 */
      '<div class="bar"><b>體檢</b><span class="now">' +
        hit.length + ' 批 · ' + ppl + ' 人' +
        (noAck ? ('　<em>' + noAck + ' 人沒確認</em>') : '') +
        '　' + tkTally(hit) +
        '　今天 ' + esc(todayStr().slice(5).replace('-', '/')) + '</span></div>' +
      hit.map(hcRow).join('') +
      '<div class="hlg">' +
        '<span><i class="bnd-ok"></i>都確認了</span>' +
        '<span><i class="bnd-warn"></i>確認了一部分</span>' +
        '<span><i class="bnd-bad"></i>一個都還沒</span>' +
      '</div>' +
    '</div>';
}

/* ── 搜尋列 ─────────────────────────────────────────
   ⛔ 打字的時候不可以重畫輸入框本身，不然每打一個字焦點就跳掉、
      中文選字也會被打斷。所以搜尋列畫一次，之後只換底下的 #hcList。 */
function hcSearchBar(){
  return '<div class="hsr"><input id="hcQ" type="search" ' +
    'placeholder="搜工廠、姓名、單號…" value="' + esc(HC_Q_) + '"></div>' +
    '<div id="hcList"></div>';
}

function hcPaintList(){
  var rows = TK_ROWS;
  $('hcList').innerHTML = hcList(rows);
  [].forEach.call($('hcList').querySelectorAll('[data-hc]'), function(el){
    el.addEventListener('click', function(){
      /* 一次只開一個。連開三批之後整頁都是名單，就找不到批了。 */
      HCX_ = (HCX_ === el.dataset.hc) ? '' : el.dataset.hc;
      hcPaintList();
    });
  });
  if(HCX_){
    var c = null;
    TK_ROWS.forEach(function(x){ if(x.id === HCX_) c = x; });
    if(c) hcExpFill(c);
  }
}

function hcBindSearch(){
  var box = $('hcQ');
  if(!box) return;
  hcPaintList();
  box.addEventListener('input', function(){
    HC_Q_ = box.value;
    hcPaintList();
  });
}

/* ══ 全域搜尋（2026-09-23）══════════════════════════════════

   牟佑彬：「打姓氏或名字、中文或英文或各語言，都能搜尋到
   工廠、雇主、工人、行程內容。」他選的版型是「⑤ 打字時只給提示」。

   ⛔ 兩段式，因為 Apps Script 冷啟動要三十幾秒：
        人與工廠 → 名冊登入時下載一次，**在手機裡搜**，打字當下就出結果
        行程與紀錄 → 停止打字 400ms 之後才打後端
      每按一個鍵打一次後端，在工廠的訊號下是不可能的。

   ⛔ 手機號碼確實下載到手機裡（他決定的，要能離線打、能用末四碼搜）。
      **所以一定要配兩道**：登出清掉、24 小時過期。
      少了那兩道，手機掉了等於整份名冊外流。 */

var FD_ROWS_ = [];          // 名冊（搜尋用的精簡欄位）
var FD_AT_ = '';            // 名冊是哪一天的
var FD_Q_ = '';
var FD_T_ = null;           // 後端查詢的 debounce
var FD_HIT_ = { sched: [], logs: [] };
var FD_BUSY_ = false;
var FD_KEY_ = 'svc.roster';
var FD_TTL_ = 24 * 3600 * 1000;   // 24 小時

/* ── 名冊：存在手機裡 ─────────────────────────────────── */

function fdLoad(cb){
  if(FD_ROWS_.length) { if(cb) cb(); return; }
  /* 先用手機裡那一份畫，再去後端拿新的——
     ⚠ 第一次打開就要能搜，不能等三十幾秒的冷啟動。 */
  try {
    var raw = localStorage.getItem(FD_KEY_);
    if(raw){
      var o = JSON.parse(raw);
      if(o && o.rows && (Date.now() - (o.t || 0)) < FD_TTL_){
        FD_ROWS_ = o.rows; FD_AT_ = o.at || '';
      } else {
        localStorage.removeItem(FD_KEY_);   // 過期就丟掉，不要留著
      }
    }
  } catch(e){}
  if(cb) cb();
  google.script.run
    .withSuccessHandler(function(r){
      if(!r || !r.ok || !r.rows) return;
      FD_ROWS_ = r.rows; FD_AT_ = r.at || '';
      try {
        localStorage.setItem(FD_KEY_,
          JSON.stringify({ t: Date.now(), at: r.at, rows: r.rows }));
      } catch(e2){}      /* 存不下就算了，記憶體裡那一份還在 */
      if($('findWrap') && $('findWrap').style.display !== 'none') fdDraw();
    })
    .withFailureHandler(function(){})
    .svcRoster(CODE);
}

/* 只改名冊裡的一列（存完負責翻譯之後用）。
   ⛔ 不要為了一格改動就把整份名冊丟掉重載——那會出現一段
      「名冊是空的」的空窗，而畫面在那段期間會講出錯的話。 */
function fdPatch_(eid, fields){
  var hit = null;
  FD_ROWS_.forEach(function(w){ if(w.e === eid) hit = w; });
  if(!hit) return;
  Object.keys(fields).forEach(function(k){ hit[k] = fields[k]; });
  try {
    localStorage.setItem(FD_KEY_,
      JSON.stringify({ t: Date.now(), at: FD_AT_, rows: FD_ROWS_ }));
  } catch(e){}
}

/* ⛔ 登出一定要清掉。名冊裡有 1687 個人的手機號碼。 */
function fdWipe(){
  FD_ROWS_ = []; FD_AT_ = ''; FD_Q_ = '';
  try { localStorage.removeItem(FD_KEY_); } catch(e){}
}

/* ── 比對 ─────────────────────────────────────────────

   ⚠ 中文用「包含」，英文不分大小寫，數字同時比對編號與手機。
   ⛔ 手機比對要把符號去掉——名冊上有 0968-892445 這種寫法，
      他打 892445 一樣要找得到。 */

function fdNorm_(s){ return String(s || '').toLowerCase(); }
function fdDigits_(s){ return String(s || '').replace(/[^0-9]/g, ''); }

function fdMatchWorker_(w, q, qd){
  if(fdNorm_(w.n).indexOf(q) !== -1) return 3;      // 中文名
  if(fdNorm_(w.o).indexOf(q) !== -1) return 2;      // 原文名
  if(qd && qd.length >= 3){
    if(fdDigits_(w.p).indexOf(qd) !== -1) return 2; // 手機
    if(String(w.e).indexOf(qd) !== -1) return 2;    // 外國人編號
  }
  if(fdNorm_(w.c).indexOf(q) !== -1) return 1;      // 他的雇主
  return 0;
}

/* 雇主清單從 PRESETS 來（登入時就有了），不用另外下載。 */
function fdClients_(q){
  var out = [];
  (PRESETS || []).forEach(function(c){
    if(fdNorm_(c.c).indexOf(q) === -1) return;
    out.push(c);
  });
  return out;
}

/* ── 畫面 ─────────────────────────────────────────────── */

function fdOpen(){
  /* ⛔ 不要在這裡記「原本在哪一個底頁」。這一層是蓋上去的，
     關掉就露出底下原本那一頁——底頁的狀態從頭到尾沒有被動過。
     （第一版寫了 `FD_BACK_ = TAB`，而這個 App 根本沒有 TAB 這個變數，
      分頁是用 DOM 上的 .tabs button.on 記的。那一行讓 fdOpen
      一進來就 ReferenceError，整個搜尋打不開，而且**沒有任何錯誤訊息**。） */
  fdLoad(function(){});
  $('findWrap').style.display = '';
  document.body.classList.add('finding');
  $('fdQ').value = FD_Q_;
  fdDraw();
  /* ⚠ 要等一拍再 focus。立刻 focus 的話 iOS 的鍵盤會把還在做的
     版面切換推掉，結果鍵盤跳出來又收回去。 */
  setTimeout(function(){ try { $('fdQ').focus(); } catch(e){} }, 60);
}

function fdClose(){
  $('findWrap').style.display = 'none';
  document.body.classList.remove('finding');
}

function fdDraw(){
  var box = $('fdOut'); if(!box) return;
  var q = fdNorm_(FD_Q_.trim());
  var qd = fdDigits_(FD_Q_);
  if(!q && !qd){
    box.innerHTML = '<div class="fdhint">' +
      '打名字找人（中文或原文都可以）<br>' +
      '打工廠名找一整家<br>' +
      '打手機末四碼找人<br>' +
      '<s>名冊 ' + (FD_ROWS_.length || 0) + ' 人' +
      (FD_AT_ ? ('　·　' + esc(FD_AT_) + ' 更新') : '') + '</s></div>';
    return;
  }

  var ws = [];
  FD_ROWS_.forEach(function(w){
    var sc = fdMatchWorker_(w, q, qd);
    if(sc) ws.push({ w: w, sc: sc });
  });
  /* 自己負責的排前面（他選的：全部都搜得到，自己的優先）。 */
  ws.sort(function(a, b){
    if(a.sc !== b.sc) return b.sc - a.sc;
    var am = (a.w.t === STAFF_NAME) ? 0 : 1, bm = (b.w.t === STAFF_NAME) ? 0 : 1;
    if(am !== bm) return am - bm;
    return String(a.w.n).localeCompare(String(b.w.n));
  });
  var cs = q ? fdClients_(q) : [];

  /* ⛔ 打工廠名的時候，工廠要排在工人前面。
     2026-09-23 壓力測試量到的：打「帝寶」（448 人那家），
     前 8 列全是那家的**工人**，**工廠被擠到第 9 個**——
     可是你打廠名就是想找那家工廠。

     判斷方式不是「有沒有工廠符合」，而是**工人是靠什麼比中的**：
       靠自己的名字比中（sc >= 2）→ 你在找人，人排前面
       只靠雇主名比中（sc === 1）→ 你在找工廠，工廠排前面
     所以打「阮」的時候工人照樣在最前面（他們是靠名字比中的）。 */
  var byName = ws.some(function(x){ return x.sc >= 2; });

  var SHOW = 8;
  var h = '<div class="fdlist">';
  if(!byName) h += fdClientRows_(cs, FD_Q_);
  ws.slice(0, SHOW).forEach(function(x){
    var w = x.w;
    h += '<button type="button" class="fdrow" data-e="' + esc(w.e) + '">' +
      '<span class="k">移工</span><span class="m">' +
        fdMark_(w.n || w.o, FD_Q_) +
        '<u>' + esc(w.c || '') + (w.t ? ('　·　' + esc(w.t)) : '') + '</u>' +
      '</span></button>';
  });
  if(byName) h += fdClientRows_(cs, FD_Q_);
  FD_HIT_.sched.slice(0, 3).forEach(function(r){
    h += '<button type="button" class="fdrow" data-s="' + esc(r.id) + '">' +
      '<span class="k">行程</span><span class="m">' +
      esc((r.date || '').slice(5) + ' ' + (r.client || '') + ' ' + (r.topic || '')) +
      /* 查編號查到的，一定要把編號印出來——不然他拿著紙本對不起來。 */
      '<u>' + esc(r.id || '') + (r.rec ? ('　→　' + esc(r.rec)) : '') +
      (r.workers ? ('　' + esc(r.workers)) : '') + '</u></span></button>';
  });
  FD_HIT_.logs.slice(0, 3).forEach(function(r){
    h += '<button type="button" class="fdrow" data-l="' + esc(r.code) + '">' +
      '<span class="k">紀錄</span><span class="m">' +
      esc((r.date || '').slice(5) + ' ' + (r.name || r.client || '') + ' ' +
          (r.big || '')) +
      '<u>' + esc(r.code || '') + '　' + esc(r.client || '') + '</u></span></button>';
  });
  h += '</div>';

  var more = ws.length - Math.min(ws.length, SHOW);
  var tail = [];
  if(more > 0) tail.push('還有 ' + more + ' 位　·　繼續打字縮小範圍');
  if(FD_BUSY_) tail.push('行程與紀錄查詢中…');
  if(!ws.length && !cs.length && !FD_BUSY_ &&
     !FD_HIT_.sched.length && !FD_HIT_.logs.length){
    h = '<div class="fdhint">找不到「' + esc(FD_Q_) + '」<br>' +
        '<s>試試看原文名，或只打前兩個字</s></div>';
  }
  box.innerHTML = h + (tail.length ?
    ('<p class="fdmore">' + esc(tail.join('　·　')) + '</p>') : '');

  [].forEach.call(box.querySelectorAll('.fdrow'), function(b){
    b.addEventListener('click', function(){
      if(b.dataset.e) return pplOpen('w', b.dataset.e);
      if(b.dataset.c) return pplOpen('c', b.dataset.c);
      /* 查到了就要打得開。以前只跳一句「在行事曆或查詢頁裡打得開」，
         等於叫他自己再找一次（牟佑彬 2026-10-03）。 */
      if(b.dataset.l){
        fdClose();
        openRecord(b.dataset.l, { rec: b.dataset.l, y: window.scrollY,
          label: '搜尋', name: b.dataset.l });
        return;
      }
      if(b.dataset.s){
        var row = (CAL_ROWS||[]).filter(function(x){ return x.id === b.dataset.s; })[0];
        fdClose();
        if(row){
          CAL_SEL = row.date; CAL_VIEW = 'day';
          document.querySelector('.tabs button[data-t=cal]').click();
          drawCal();
          toast(row.client + '　' + row.date);
        } else {
          toast('那一筆不在目前載入的月份，先把行事曆切到 ' +
            (b.dataset.s.slice(1,3) + '/' + b.dataset.s.slice(3,5)));
        }
      }
    });
  });
}

function fdClientRows_(cs, q){
  return cs.slice(0, 4).map(function(c){
    var n = (c.w || []).length;
    return '<button type="button" class="fdrow" data-c="' + esc(c.c) + '">' +
      '<span class="k">' + (c.t === '家庭雇主' ? '雇主' : '工廠') + '</span>' +
      '<span class="m">' + fdMark_(c.c, q) +
      '<u>在職 ' + n + ' 人</u></span></button>';
  }).join('');
}

/* 把打的字標起來。⚠ 一定要先 esc 再插標記，
   否則名字裡有 < 就會變成標籤。 */
function fdMark_(text, q){
  var t = String(text || ''), k = String(q || '').trim();
  if(!k) return esc(t);
  var i = t.toLowerCase().indexOf(k.toLowerCase());
  if(i < 0) return esc(t);
  return esc(t.slice(0, i)) + '<mark>' + esc(t.slice(i, i + k.length)) +
         '</mark>' + esc(t.slice(i + k.length));
}

function fdType(){
  FD_Q_ = $('fdQ').value || '';
  FD_HIT_ = { sched: [], logs: [] };
  fdDraw();                                  /* 人與工廠：立刻 */
  clearTimeout(FD_T_);
  var q = FD_Q_.trim();
  if(q.length < 2){ FD_BUSY_ = false; return; }
  /* 行程與紀錄：停手 400ms 才打後端。
     ⛔ 不要每按一鍵就打——冷啟動三十幾秒，而且會排隊。 */
  FD_BUSY_ = true;
  FD_T_ = setTimeout(function(){
    var mine = q;
    google.script.run
      .withSuccessHandler(function(r){
        if(mine !== FD_Q_.trim()) return;    /* 已經又打了字，這份是舊的 */
        FD_BUSY_ = false;
        FD_HIT_ = { sched: (r && r.sched) || [], logs: (r && r.logs) || [] };
        fdDraw();
      })
      .withFailureHandler(function(){ FD_BUSY_ = false; fdDraw(); })
      .svcFind(CODE, mine, 3);
  }, 400);
}

/* ══ 移工頁與工廠頁（2026-09-23）══════════════════════════

   從搜尋點進來的那一頁。⛔ 整頁開、左上角返回——
   這是設計檢視第 9 項定的兩種中斷裡的「換一個畫面」那一種，
   不是就地展開。

   ⛔ 移工頁的資料**一趟拿完**（svcPerson）。不要分兩趟——
      2026-09-23 返鄉問卷就是分兩趟，冷啟動時工人面對一張空白的表。 */

var PPL_KIND_ = '';
var PPL_ID_ = '';

function pplOpen(kind, id){
  PPL_KIND_ = kind; PPL_ID_ = id;
  $('findWrap').style.display = 'none';
  $('pplWrap').style.display = '';
  document.body.classList.add('finding');
  $('pplOut').innerHTML = '<div class="mid" style="padding:30px">讀取中…</div>';
  $('pplTitle').textContent = kind === 'c' ? id : '…';
  window.scrollTo(0, 0);
  if(kind === 'c') return pplClient(id);
  google.script.run
    .withSuccessHandler(pplDrawWorker)
    .withFailureHandler(function(e){
      $('pplOut').innerHTML = '<div class="mid" style="padding:30px">' +
        esc((e && e.message) || '讀不到') + '</div>';
    })
    .svcPerson(CODE, id);
}

function pplBack(){
  $('pplWrap').style.display = 'none';
  $('findWrap').style.display = '';
  /* ⚠ 一定要重畫。在個人頁改過負責翻譯之後回來，
     不重畫的話清單還停在舊的那一份，看起來像沒存進去。 */
  fdDraw();
  setTimeout(function(){ try { $('fdQ').focus(); } catch(e){} }, 60);
}

/* 剩幾天。⚠ 回 null 代表沒有日期，呼叫端要自己決定印什麼——
   印「剩 null 天」比不印更糟。 */
function pplDays_(ymd){
  if(!ymd) return null;
  var a = vtParse_(ymd), b = vtParse_(todayStr());
  return (a && b) ? vtDay_(b, a) : null;
}
function pplLeft_(ymd){
  var d = pplDays_(ymd);
  if(d === null) return '';
  return d < 0 ? ('逾期 ' + (-d) + ' 天') : (d === 0 ? '今天' : ('剩 ' + d + ' 天'));
}
/* 只有最急的那一個上色。⛔ 三個都標紅等於沒有標。 */
function pplTone_(d){
  if(d === null) return 'q';
  if(d < 0) return 'bad';
  if(d <= 30) return 'warn';
  return 'q';
}

function pplDrawWorker(p){
  if(!p || !p.ok){ $('pplOut').innerHTML =
    '<div class="mid" style="padding:30px">讀不到</div>'; return; }
  $('pplTitle').textContent = p.name || p.orig || '移工';

  var h = '';
  /* ① 是不是他 */
  h += '<div class="pcard phd">' +
    '<div class="nm">' + esc(p.name || '（沒有中文名）') + '</div>' +
    '<div class="og">' + esc(p.orig || '') + '</div>' +
    '<div class="mt"><span class="cst ok">在職</span>' +
      esc([p.eid, p.nat, p.dob].filter(Boolean).join('　·　')) + '</div>' +
    '<div class="pacts">' +
      (p.phone
        ? ('<a class="p" href="tel:' + esc(p.phone) + '">打電話</a>')
        : '<span class="p off">名冊沒電話</span>') +
      '<button type="button" id="pplCase">開一件追蹤</button>' +
      '<button type="button" id="pplVac">發問卷</button>' +
    '</div></div>';

  /* ② 要你處理——沒有就整段不畫 */
  var open = (p.cases || []).filter(function(c){ return c.status === '進行中'; });
  if(open.length){
    h += '<div class="psec warn"><i></i>要你處理<span>' + open.length + ' 件</span></div>' +
      '<div class="pcard">' + open.map(function(c){
        return '<button type="button" class="prow" data-case="' + esc(c.id) + '">' +
          '<span class="vl"><b>' + esc(c.kind) + '</b><s>' +
          esc((c.state && c.state.text) || c.phase || '') + '</s></span>' +
          '<span class="go">去處理</span></button>';
      }).join('') + '</div>';
  }

  /* ③ 聯絡與位置——每一列都是一個動作 */
  h += '<div class="psec"><i></i>聯絡與位置</div><div class="pcard">';
  if(p.phone) h += pplRow_('手機', pplTel_(p.phone),
    p.phoneMine ? '你改過的（名冊上不是這個）' : '', 'tel:' + p.phone, '☏');
  h += pplRow_('雇主', p.client, (p.job || '') + (p.employerId ? ('　·　' + p.employerId) : ''),
               'client:' + p.client, '›');
  if(p.workAddr) h += pplRow_('工作地', p.workAddr, '',
    'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(p.workAddr), '⌖');
  if(p.workContact || p.workTel)
    h += pplRow_('現場', p.workContact || '（未填）', pplTel_(p.workTel),
                 p.workTel ? ('tel:' + p.workTel) : '', p.workTel ? '☏' : '');
  h += '</div>';

  /* ④ 時鐘 */
  var clocks = [['下次體檢', p.nextHc], ['居留期限', p.arcEnd], ['期滿日', p.expire]]
    .filter(function(x){ return x[1]; });
  if(clocks.length){
    h += '<div class="psec"><i></i>時鐘</div><div class="pcard">' +
      clocks.map(function(x){
        var d = pplDays_(x[1]);
        return '<div class="prow static"><span class="lb">' + esc(x[0]) + '</span>' +
          '<span class="vl"><b>' + esc(x[1]) + '</b></span>' +
          '<span class="cst ' + pplTone_(d) + '">' + esc(pplLeft_(x[1])) + '</span></div>';
      }).join('') + '</div>';
  }

  /* ⑤ 衝突：你改過的值跟管理系統後來改的打架。
     ⛔ 兩個值**並排**給他看，不要只說「有衝突」。
        他要判斷的是哪一個號碼打得通，不是「有沒有衝突」這件事本身。
     ⚠ 目前畫面上顯示、發通知會用的是**管理系統那一個**（見 rosterMerge_），
       所以要講清楚，不然他會以為按了才生效。 */
  if(p.conflict){
    ['phone', 'dob'].forEach(function(f){
      var c = p.conflict[f]; if(!c) return;
      var lb = (f === 'phone') ? '手機' : '生日';
      h += '<div class="pconf"><b>' + lb + '有兩個版本</b>' +
        '<div class="two">' +
          '<div><s>你改的</s>' + esc(c.mine || '（空的）') + '</div>' +
          '<div class="now"><s>管理系統　現在用這個</s>' +
            esc(c.now || '（空的）') + '</div>' +
        '</div>' +
        '<div class="cbtn">' +
          '<button type="button" data-cf="' + f + '" data-w="sys">就用管理系統的</button>' +
          '<button type="button" data-cf="' + f + '" data-w="mine">還是用我改的</button>' +
        '</div></div>';
    });
  }

  /* ⑥ 續聘。⛔ 編號不一樣一定要講出來——發問卷的連結是綁編號的。 */
  if(p.prev){
    h += '<div class="pwarn"><b>這是續聘後的新合約</b>' +
      '前一份 ' + esc(p.prev.expire || '') + ' 到期（編號 ' + esc(p.prev.eid) + '）。' +
      '名冊上有兩筆，系統一律讀新的這一份。</div>';
  }

  /* ⑦ 服務過他的人。牟佑彬 2026-09-23：
     「搜尋到一個點進去之後，底下也會附上曾經服務過他的」。
     ⛔ 接手別人的案子時，真正要問的是「該找誰」——
        底下那條時間線回答「發生過什麼」，這一段回答「誰最熟他」。
     ⚠ 自己標出來。翻譯掃過去第一件事是找自己在不在裡面。 */
  if((p.served || []).length){
    h += '<div class="psec"><i></i>服務過他的人<span>' +
      p.served.length + ' 位</span></div><div class="pcard">' +
      p.served.map(function(x){
        var me = (x.crew === STAFF_NAME);
        return '<div class="prow static"><span class="vl"><b>' +
          esc(x.crew) + (me ? '　<em class="pme">你</em>' : '') + '</b>' +
          '<s>最近 ' + esc((x.last || '').slice(5).replace('-', '/')) + '</s></span>' +
          '<span class="cst q">' + x.n + ' 次</span></div>';
      }).join('') + '</div>';
  }

  /* ⑧ 最近的接觸——行程與紀錄合流 */
  if((p.timeline || []).length){
    h += '<div class="psec"><i></i>最近的接觸' +
      (p.timelineAll > p.timeline.length
        ? ('<span>共 ' + p.timelineAll + ' 次</span>') : '') +
      '</div><div class="pcard">' +
      p.timeline.map(function(t){
        return '<div class="ptl"><span class="dt">' +
          esc((t.date || '').slice(5).replace('-', '/')) + '</span>' +
          '<span class="bd"><b>' + esc(t.t || '') + '</b><s>' +
          esc([t.client, t.crew].filter(Boolean).join('　·　')) + '</s></span>' +
          '<span class="kk">' + esc(t.k) + '</span></div>';
      }).join('') + '</div>';
  }

  /* ⑨ 可以改的那幾格。虛線框跟上面的唯讀區分開。 */
  /* ⛔ 可以改的只有這四格，而且它們**存在另一張表**（移工註記），
     匯入不碰那張表，所以不會被每週更新蓋掉。
     ⚠ 手機與生日另外記「你改的當下名冊是什麼」，
       管理系統後來如果也改了，會進「要你處理」讓他選，
       不會安靜地被覆蓋、也不會安靜地永遠蓋住名冊。
     ⛔ 姓名、編號、雇主、許可生效日、期滿日、體檢日**不開放改**——
        體檢排程整個是從許可生效日算的，在這裡蓋一個錯的值
        會算出錯的到期日，而且沒有人會發現。那是唯一會罰錢的環。 */
  h += '<div class="psec"><i></i>這幾格可以改</div>' +
    '<div class="pedit">' +
      '<label>手機</label>' +
      '<input id="pplPhone" type="tel" inputmode="tel" value="' +
        esc(p.phone || '') + '">' +
      '<label>生日</label>' +
      '<input id="pplDob" type="date" value="' + esc(p.dob || '') + '">' +
      '<label>負責翻譯</label>' +
      '<select id="pplCrew">' +
        '<option value="">（未指定）</option>' +
        (CREW || []).map(function(n){
          return '<option' + (n === p.crew ? ' selected' : '') + '>' + esc(n) + '</option>';
        }).join('') +
      '</select>' +
      '<label>備註</label>' +
      '<textarea id="pplMemo" rows="2">' + esc(p.memo || '') + '</textarea>' +
      '<button type="button" id="pplSave">存起來</button>' +
    '</div>' +
    '<p class="fdmore">這幾格存在另一張表，每週更新不會蓋掉　·　' +
      '姓名與證件日期要改請改管理系統</p>';

  $('pplOut').innerHTML = h;
  pplWire(p);
}

/* 電話加分隔號。⚠ 0912345678 這樣一串要一位一位對，
   0912-345-678 才唸得出來——翻譯常常是照著螢幕唸給雇主聽的。
   ⛔ 只是顯示，撥號用的還是原始字串（tel: 不要有多餘的符號）。 */
function pplTel_(s){
  var d = String(s || '').replace(/[^0-9]/g, '');
  if(/^09\d{8}$/.test(d)) return d.slice(0,4) + '-' + d.slice(4,7) + '-' + d.slice(7);
  if(/^0[2-8]\d{7,8}$/.test(d)) return d.slice(0,2) + '-' + d.slice(2);
  return String(s || '');
}

function pplRow_(lb, val, sub, href, arrow){
  var tap = href ? ' tap' : '';
  return '<button type="button" class="prow' + tap + '"' +
    (href ? (' data-go="' + esc(href) + '"') : '') + '>' +
    '<span class="lb">' + esc(lb) + '</span>' +
    '<span class="vl"><b>' + esc(val || '') + '</b>' +
    (sub ? ('<s>' + esc(sub) + '</s>') : '') + '</span>' +
    (arrow ? ('<span class="ar">' + arrow + '</span>') : '') + '</button>';
}

function pplWire(p){
  [].forEach.call($('pplOut').querySelectorAll('[data-go]'), function(b){
    b.addEventListener('click', function(){
      var g = b.dataset.go;
      if(g.indexOf('client:') === 0) return pplOpen('c', g.slice(7));
      window.open(g, g.indexOf('tel:') === 0 ? '_self' : '_blank');
    });
  });
  [].forEach.call($('pplOut').querySelectorAll('[data-case]'), function(b){
    b.addEventListener('click', function(){
      $('pplWrap').style.display = 'none';
      document.body.classList.remove('finding');
      openCase(b.dataset.case);
    });
  });
  [].forEach.call($('pplOut').querySelectorAll('[data-cf]'), function(b){
    b.addEventListener('click', function(){
      b.disabled = true;
      google.script.run
        .withSuccessHandler(function(){ pplOpen('w', p.eid); })
        .withFailureHandler(function(e){
          b.disabled = false; toast((e && e.message) || '處理失敗', true);
        })
        .svcResolveConflict(CODE, p.eid, b.dataset.cf, b.dataset.w);
    });
  });
  fdOn_('pplSave', function(){
    var btn = $('pplSave'); btn.disabled = true; btn.textContent = '存…';
    google.script.run
      .withSuccessHandler(function(){
        btn.textContent = '已存起來';
        setTimeout(function(){ btn.disabled = false; btn.textContent = '存起來'; }, 1500);
        /* ⛔ **不要 fdWipe()。** 2026-09-23 牟佑彬回報：
           清單上寫「在職 1 人」，點進去卻說「名冊上這一家沒有在職的人」。
           原因就是這裡——fdWipe 把 FD_ROWS_ 清成空的**卻沒有重新載入**，
           而雇主那幾列是從 PRESETS 來的（沒被清），所以清單看起來還正常，
           點進去用 FD_ROWS_ 一濾就是 0 人。
           **畫面說了一句肯定而錯誤的話**，那比慢比當掉都糟。
           改成只改動到的那一格，名冊其餘部分原封不動。 */
        fdPatch_(p.eid, { t: $('pplCrew').value,
                          p: $('pplPhone').value });
      })
      .withFailureHandler(function(e){
        btn.disabled = false; btn.textContent = '存起來';
        toast((e && e.message) || '存不進去', true);
      })
      .svcPersonNote(CODE, p.eid, $('pplCrew').value, $('pplMemo').value,
                     $('pplPhone').value, $('pplDob').value);
  });
  fdOn_('pplCase', function(){
    $('pplWrap').style.display = 'none';
    document.body.classList.remove('finding');
    toast('到「追蹤 → ＋ 開一件」，' + (p.client || '') + ' 已經記起來了');
  });
  fdOn_('pplVac', function(){
    $('pplWrap').style.display = 'none';
    document.body.classList.remove('finding');
    toast('到「追蹤 → 返鄉 → 發問卷」挑 ' + (p.name || '') + '');
  });
}

/* ── 工廠／雇主頁 ────────────────────────────────────
   同一套骨架，主角換成一群人。
   ⛔ 家庭雇主不另外做一種版型——兩種長得不一樣才是要重新學。 */

function pplClient(name){
  var pz = presetOf(name);
  var ws = FD_ROWS_.filter(function(w){ return w.c === name; });
  $('pplTitle').textContent = name;

  var h = '<div class="pcard phd">' +
    '<div class="nm sm">' + esc(name) + '</div>' +
    '<div class="mt"><span class="cst q">' +
      esc((pz && pz.t) || '工廠') + '</span>在職 ' + ws.length + ' 人' +
      ((pz && pz.crew) ? ('　·　' + esc(pz.crew)) : '') + '</div>' +
    '<div class="pacts">' +
      '<button type="button" id="pclPlan" class="p">排行程</button>' +
      '<button type="button" id="pclVac">發問卷</button>' +
    '</div></div>';

  if(ws.length){
    h += '<div class="psec"><i></i>在職名單<span>' + ws.length + ' 人</span></div>' +
      '<div class="pcard">' + ws.map(function(w){
        var d = pplDays_(w.h || w.x);
        var lb = w.h ? ('體檢 ' + pplLeft_(w.h)) : (w.x ? ('期滿 ' + pplLeft_(w.x)) : '—');
        return '<button type="button" class="prow tap" data-e="' + esc(w.e) + '">' +
          '<span class="vl"><b>' + esc(w.n || w.o) + '</b><s>' +
          esc(w.o || '') + '</s></span>' +
          '<span class="cst ' + pplTone_(d) + '">' + esc(lb) + '</span>' +
          '<span class="ar">›</span></button>';
      }).join('') + '</div>';
  } else {
    /* ⛔ 名冊還沒載回來的時候**不可以**說「沒有在職的人」。
       那是一句肯定而且可能是錯的話——2026-09-23 他就是看到這一句，
       而實際上那一家有一位在職。分不出來的時候就說分不出來。 */
    h += '<div class="mid" style="padding:22px">' +
      (FD_ROWS_.length ? '名冊上這一家沒有在職的人'
                       : '名冊還在載入，稍等一下再看名單') + '</div>';
  }

  if(pz && pz.p){
    h += '<div class="psec"><i></i>聯絡與位置</div><div class="pcard">' +
      pplRow_('聯絡', pz.p, '', '', '') + '</div>';
  }
  $('pplOut').innerHTML = h;

  [].forEach.call($('pplOut').querySelectorAll('[data-e]'), function(b){
    b.addEventListener('click', function(){ pplOpen('w', b.dataset.e); });
  });
  fdOn_('pclPlan', function(){
    $('pplWrap').style.display = 'none';
    document.body.classList.remove('finding');
    openPlan(name);
  });
  fdOn_('pclVac', function(){
    $('pplWrap').style.display = 'none';
    document.body.classList.remove('finding');
    toast('到「追蹤 → 返鄉 → 發問卷」選 ' + name);
  });
}

/* ⛔ 自己的 fdOn_，不要用 on()。
   on() 是**別的函式裡面的區域函式**（app.js 7670 行），
   接在檔案尾端的這一段看不到它——2026-09-23 踩到：
   `ReferenceError: Can't find variable: on`，整個搜尋打不開，
   而且 app.js 跨網域載入，手機上只會看到「Script error.」。
   ⚠ 這是同一天第二次了（第一次是用了不存在的 TAB）。
     **靜態檢查抓不到這一類，只有真的把頁面跑起來才看得到。** */
function fdOn_(id, fn){ var b = $(id); if(b) b.addEventListener('click', fn); }

/* ── 接上去 ─────────────────────────────────────────── */
fdOn_('findBtn', fdOpen);
fdOn_('fdBack', fdClose);
fdOn_('pplBack', pplBack);
fdOn_('fdClr', function(){ $('fdQ').value = ''; fdType(); $('fdQ').focus(); });
if($('fdQ')){
  $('fdQ').addEventListener('input', fdType);
  /* ⚠ iOS 的 type=search 有一顆自己的清除鈕，它發的是 search 事件不是 input。 */
  $('fdQ').addEventListener('search', fdType);
}


/* ══════════════════════════════════════════════════════════════
   派工：行政開單 → 特助確認 → 翻譯執行

   牟佑彬 2026-09-28：「翻譯、行政、特助能不能統一用一個介面」——
   所以不做第二個網頁，而是這支 App 多三個底頁，**按角色顯示**。
   行事曆、卡片樣式、篩選、下拉更新全部沿用，不再造一套。

   流程（他 2026-09-27 選的做法二）：
     行政填「建議誰去」（可留空）→ 特助按確認 → 翻譯手機上才變成正式行程。
     還沒確認的是**灰色預排**，大家都看得到，讓翻譯提早知道、
     也能先說「我那天不行」。
   ══════════════════════════════════════════════════════════════ */

/* 角色決定看得到哪幾個底頁。
   ⛔ 這只是「看得到什麼」，不是權限——後端每一支都各自再驗一次。 */
var ROLE_TABS_ = {
  /* 行政只剩行事曆（牟佑彬 2026-10-03）。
     「客戶」與「我開的單」收進行事曆：客戶變成篩選列、我開的單變成一個開關。
     ⚠ p-order／p-mine 的程式沒有刪掉——那兩支還有副理在用的路徑，
       而且萬一要退回來只要把 'order','mine' 加回這一行。 */
  /* 總表是行政自己掃全月用的（牟佑彬 2026-10-04）：
     誰還沒配人、特助後來派了誰、文件哪天還。資料跟行事曆同一份。 */
  '行政':   ['cal', 'sum'],
  /* 特助：行事曆 ＋ 排班甲 ＋ 排班戊 ＋ 總表。
     ⛔ 「待確認」（conf）先收起來——牟佑彬 2026-10-04 說拿掉，
        排班那兩頁就是它的替代。後端一行都沒動，要回來把 'conf' 加回這一行就好。
     ⚠ 甲與戊是**讓他試用的兩種做法**，選完之後砍掉沒選的那一個。 */
  '特助':   ['cal', 'ps1', 'ps2', 'ps3', 'sum'],
  '副理':   ['cal', 'new', 'track', 'follow', 'stat', 'conf'],
  '總經理': ['cal', 'new', 'track', 'follow', 'stat', 'conf']
};
/* 行政換一套色票（牟佑彬 2026-10-03 指定公司色系的紅）。
   ⛔ 「出事」的紅要跟主色分開，不然兩種紅混在一起誰都看不出差別——
      所以 --bad-* 一起改成橘紅，只用在真的出事的地方。
   ⚠ 掛在 body 上，不是每個元件各自改。app.css 的 body.adm 那一段就是全部。 */
/* 總表的圖示：橫線清單。24 格、線寬 1.75、圓頭圓角，跟其他分頁同一套。 */
var SUM_IC_ = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
  ' stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M9 6.4h10M9 12h10M9 17.6h10"/>' +
  '<path d="M4.6 6.4h.01M4.6 12h.01M4.6 17.6h.01"/></svg>';

/* 行政的「行程總表」分頁。
   ⚠ 用注入的，不寫進 Service.html——那是後端檔，改它要重新部署、吃版本額度。
     planModal 的行政欄位也是同一個理由（見 planAdmBits）。 */
/* 排班那兩頁的圖示。左邊是摺疊清單，右邊是一人一頁。 */
var PS1_IC_ = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
  ' stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M4.4 6.2h15.2M4.4 12h15.2M4.4 17.8h15.2"/>' +
  '<path d="m8.6 4.4 1.6 1.8 1.6-1.8"/></svg>';
var PS2_IC_ = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
  ' stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="7.4" y="4.6" width="9.2" height="14.8" rx="2.6"/>' +
  '<path d="M4.2 8.4v7.2M19.8 8.4v7.2"/></svg>';

/* 特助的兩個排班分頁。
   ⚠ 一樣用注入的，不寫進 Service.html——那是後端檔，改它要重新部署。 */
/* 路線頁的圖示：幾個點用一條線串起來。 */
var PS3_IC_ = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
  ' stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<circle cx="6" cy="17.6" r="2.4"/><circle cx="18" cy="6.4" r="2.4"/>' +
  '<path d="M8.4 17.6h5.2a3.2 3.2 0 0 0 0-6.4h-3.2a3.2 3.2 0 0 1 0-6.4h5.2"/></svg>';

function assBits(){
  if($('p-ps1')) return;
  var cal = $('p-cal');
  if(!cal) return;
  cal.insertAdjacentHTML('afterend',
    '<div class="pane" id="p-ps1"></div><div class="pane" id="p-ps2"></div>' +
    '<div class="pane" id="p-ps3"></div>');
  var cb = document.querySelector('.tabs button[data-t=cal]');
  if(!cb) return;
  cb.insertAdjacentHTML('afterend',
    '<button data-t="ps1">' + PS1_IC_ + '<span>排班甲</span></button>' +
    '<button data-t="ps2">' + PS2_IC_ + '<span>排班戊</span></button>' +
    '<button data-t="ps3">' + PS3_IC_ + '<span>路線</span></button>');
}

function sumBits(){
  if($('p-sum')) return;
  var cal = $('p-cal');
  if(!cal) return;
  cal.insertAdjacentHTML('afterend', '<div class="pane" id="p-sum"></div>');
  var cb = document.querySelector('.tabs button[data-t=cal]');
  if(!cb) return;
  cb.insertAdjacentHTML('afterend',
    '<button data-t="sum">' + SUM_IC_ + '<span>總表</span></button>');
  /* 中間那顆加號，跟翻譯那邊一樣（牟佑彬 2026-10-04）。
     翻譯按下去是「填服務紀錄」，行政按下去是「排一筆新的行程」。
     ⛔ 故意不給 data-t：分頁委派只認 data-t，不給它就不會被當成分頁去切 pane。 */
  if(!$('admAdd')) cb.insertAdjacentHTML('afterend',
    '<button type="button" id="admAdd" aria-label="排一筆行程">' +
    '<i class="plus" aria-hidden="true"></i></button>');
  var ad = $('admAdd');
  if(ad && !ad.dataset.on){
    ad.dataset.on = '1';
    ad.onclick = function(){
      /* 沒選日期就用今天。⛔ 不要沿用上一次留著的 CAL_SEL——
         他可能是從總表按進來的，那個日期跟現在要排的沒關係。 */
      if(!CAL_SEL) CAL_SEL = todayStr();
      goTab('cal');
      admNewTrip();
    };
  }
}

function applyRoleSkin(){
  var adm = (STAFF_ROLE === '行政');
  var ass = (STAFF_ROLE === '特助');
  document.body.classList.toggle('adm', adm);
  /* 特助一套黑的（牟佑彬 2026-10-04 指定）。
     ⚠ 跟 body.adm 完全同一個骨架，只換色票——元件一個都沒改。 */
  document.body.classList.toggle('ass', ass);
  /* 總表與加號：行政與特助共用。
     ⛔ 可見性一律綁在角色 class 上（#admAdd 綁 body.adm/body.ass），
        不要靠「切身分的時候記得收回去」——那一招已經漏過四次。 */
  if(adm || ass) sumBits();     // 要在 applyRoleTabs 挑分頁之前就生出來
  if(ass) assBits();            // 特助的兩個排班分頁，同理
  /* 填寫頁的標題依角色決定。
     ⛔ 以前是行政注入的時候改一次，切回翻譯沒有人改回來，
        於是佑彬看到「改這一筆行程」「排一筆新的行程」（2026-10-04 他的截圖）。
     ⚠ 這支每次切身分都會跑，寫在這裡就不可能漏。
       行政按「＋」開新的那一次，admNewTrip() 會再改成「排一筆新的行程」。 */
  var h3 = document.querySelector('#p-new .card h3');
  if(h3) h3.textContent = (adm || ass) ? '改這一筆行程' : '這一趟';
  /* ⚠ 紅色只給行政；但「那一頁是改行程、不是填紀錄」**行政與特助都要**。
     特助一樣不跑外勤、不填服務紀錄，點進去落到填寫頁同樣會誤存
     （牟佑彬 2026-10-03）。所以兩個 class 的範圍故意不一樣。 */
  var edit = adm || ass;
  /* 行政永遠不填服務紀錄，所以那一頁對他**永遠**是「改行程」的樣子。
     ⛔ 2026-10-03 之前他點進去看到的是翻譯要填的服務紀錄表，
        按下儲存會真的開出一筆正式紀錄、給編號、把行程標成已完成。
        線上已經因此多出兩筆錯的紀錄（填表人寫成行政一），已清除。
     ⚠ 用角色判斷而不是「進來的時候設、出去的時候清」——
        後者只要有一條路徑忘了清，就會卡在錯的模式。 */
  document.body.classList.toggle('filladm', edit);
  if(edit) admFillBits();
}

/* 行政版那一頁要補的東西。只跑一次。 */
function admFillBits(){
  if($('admSave')) return;
  var save = $('save');
  if(!save) return;
  /* ⛔ 這兩顆要插在 `.btns` **裡面**（它是一列按鈕），
     但交代事項那一塊要插在 `.btns` **前面**——
     2026-10-03 我把它插在 #save 前面，結果整塊被當成按鈕列裡的一項，
     夾在「存檔變更」與「清空」中間，三個東西擠成一排。 */
  save.insertAdjacentHTML('beforebegin',
    '<button type="button" id="admCancel">取消</button>'+
    '<button type="button" class="p" id="admSave">存檔變更</button>');
  $('admSave').onclick = admSaveTrip;
  $('admCancel').onclick = function(){
    document.querySelector('.tabs button[data-t=cal]').click();
  };
  /* ⛔ 這裡原本還注入一段說明「行政在這裡只改行程內容…」。
     牟佑彬 2026-10-04 劃掉——而且它還跟著漏到翻譯那一頁去了。
     標題也不在這裡改了，改在 applyRoleSkin()：那支**每次切身分都會跑**，
     所以切回翻譯的時候會自己變回「這一趟」。
     ⚠ 在這裡改＝只在注入那一次改，之後沒有人會把它改回來。 */

  /* ② 交代事項搬到最下面，而且可以改字、可以加、可以刪。
     ⛔ 上面那個釘住的打勾清單是**翻譯在現場勾的**，行政改不了字也加不了條。 */
  if(!$('admTodo')){
    var row = save.closest('.btns') || save;
    row.insertAdjacentHTML('beforebegin',
      '<div class="f" id="admTodoBox"><label>交代給翻譯的事</label>'+
      '<div id="admTodo"></div>'+
      '<button type="button" class="dpsm" id="admTodoAdd">＋ 再加一項</button></div>');
    $('admTodoAdd').onclick = function(){ admTodoAdd(''); };
  }
}

function admTodoAdd(v){
  var box = $('admTodo'); if(!box) return;
  if(box.children.length >= 12) return;      // 上限跟後端 schedTodoStr_ 一致
  var d = document.createElement('div');
  d.className = 'tdrow';
  d.innerHTML = '<input type="text" value="'+esc(v||'')+'" placeholder="例如：找會計部林小姐">'+
    '<button type="button" class="dpsm" data-x="1">✕</button>';
  d.querySelector('[data-x]').onclick = function(){ d.remove(); };
  box.appendChild(d);
}
function admTodoRows(){
  return [].map.call(($('admTodo')||{children:[]}).children, function(r){
    return (r.querySelector('input')||{}).value || ''; })
    .map(function(v){ return v.trim(); }).filter(String);
}

/* 存檔變更：走 updateSchedule，**不會開服務紀錄、不會給編號**。 */
function admSaveTrip(){
  /* ⛔ 這裡原本是「沒有 SCHED_ID 就擋下來」——那在只有「改既有行程」
     的時候是對的。2026-10-04 加了「排一筆新的」之後，新增**本來就沒有**
     行程代碼，於是永遠卡在這一行，畫面只跳「這一筆沒有對應的行程」。
     加新路徑卻忘了鬆開舊的守門——他當場撞到。
     現在改成：有代碼＝改既有的，沒有＝開新的（下面的 isNew 分流）。 */
  var cards = $('workers').children;
  var names = [];
  [].forEach.call(cards, function(c){
    var sel = c.querySelector('[data-k=name]');
    var oth = c.querySelector('[data-k=nameOther]');
    var n = (sel && sel.value === OTHER_) ? (oth ? oth.value.trim() : '')
                                          : (sel ? sel.value.trim() : '');
    if(n && names.indexOf(n) < 0) names.push(n);
  });
  /* 每位移工各自的服務項目，整批存進行程的「移工項目」那一欄。
     ⛔ 行程本身的 big/sub 是**整趟的事由**（行事曆卡片印的就是它），
        取第一位那一組——跟翻譯當日直接填寫時 schedAutoComplete_ 的做法一致。
        線上 S260925-RM 就是現成例子：三位移工三種細項，行程卡只寫一種。 */
  var wkItems = [];
  [].forEach.call(cards, function(c){
    var sel = c.querySelector('[data-k=name]');
    var oth = c.querySelector('[data-k=nameOther]');
    var n = (sel && sel.value === OTHER_) ? (oth ? oth.value.trim() : '')
                                          : (sel ? sel.value.trim() : '');
    if(!n) return;
    wkItems.push({ n: n,
      b: (c.querySelector('[data-k=big]')||{}).value || '',
      s: (c.querySelector('[data-k=sub]')||{}).value || '',
      /* lg 只給前端自己用（決定行事曆上那條色塊），不寫進試算表 */
      lg: (langsOf(c) || '').split('、')[0] || '' });
  });
  var big = wkItems.length ? wkItems[0].b : '';
  var sub = wkItems.length ? wkItems[0].s : '';
  if(SCHED_ID && !askMoveDate(SCHED_ID, $('date').value)) return;
  var b = $('admSave');
  var isNew = !SCHED_ID;
  if(isNew && !clientVal()){ toast('請先選工廠／雇主', true); return; }
  if(isNew && !names.length){ toast('至少要選一位移工', true); return; }
  b.disabled = true; b.textContent = '存檔中…';

  if(isNew){
    google.script.run
      .withSuccessHandler(function(){
        b.disabled = false; b.textContent = '排進行事曆';
        toast('開好了' + ($('crew').value
          ? ('　建議 '+$('crew').value+'，等特助確認') : '　等特助配人'));
        calBust();
        document.querySelector('.tabs button[data-t=cal]').click();
        loadCal(null, true);
      })
      .withFailureHandler(function(e){
        b.disabled = false; b.textContent = '排進行事曆'; toast(e.message, true); })
      /* ⛔ 行政不可以直接指派：crew 一定要明確傳空字串，
         不傳的話後端會掛給開單的人（行政自己），特助就永遠看不到待指派池。 */
      .addSchedule(CODE, {
        date: $('date').value, slot: '',
        crew: '', sug: $('crew').value,
        target: $('target').value, client: clientVal(),
        lang: (wkItems.map(function(x){ return x.lg; }).filter(Boolean)[0] || ''),
        big: big, sub: sub,
        topic: (big && sub) ? (big + ' ／ ' + sub) : big,
        workers: names.join('、'),
        wkItems: wkItems,
        todo: admTodoRows().map(function(t){ return {t:t, d:0}; })
      });
    return;
  }

  google.script.run
    .withSuccessHandler(function(res){
      b.disabled = false; b.textContent = '存檔變更';
      toast('改好了' + (res && res.back
        ? ('　已退回待確認' + (res.who ? ('，已通知 '+res.who) : '')) : ''));
      calBust();
      document.querySelector('.tabs button[data-t=cal]').click();
      loadCal(null, true);
    })
    .withFailureHandler(function(e){
      b.disabled = false; b.textContent = '存檔變更'; toast(e.message, true); })
    .updateSchedule(CODE, SCHED_ID, {
      /* ⛔ target 以前沒送，所以改成「一對多」按了沒反應。 */
      target: $('target').value,
      date: $('date').value,
      sug: $('crew').value,
      workers: names.join('、'),
      big: big, sub: sub,
      topic: (big && sub) ? (big + ' ／ ' + sub) : big,
      wkItems: wkItems,
      todo: admTodoRows().map(function(t){ return {t:t, d:0}; })
    });
}

/* 只剩一個分頁就把整條收起來（牟佑彬 2026-10-03）。
   ⛔ 規則寫成「只剩一個就不畫」，不是寫死「行政不畫」——
      以後行政若又多一個分頁，它會自己回來。 */
function hideLoneTabs(){
  var bar = document.querySelector('.tabs');
  if(!bar) return;
  var n = [].filter.call(bar.querySelectorAll('button'),
    function(b){ return !b.hidden; }).length;
  bar.style.display = (n <= 1) ? 'none' : '';
  document.body.classList.toggle('notabs', n <= 1);
}

function applyRoleTabs(){
  applyRoleSkin();
  /* ⛔ 這支以前分成兩條路：有角色的一條、翻譯的一條（直接 return）。
     每加一樣「某個角色才設的狀態」，就要記得在**另一條路**也重設一次，
     而我已經漏掉兩次了：
       2026-10-03　hideLoneTabs() 的 display:none 與 body.notabs
       2026-10-04　.tabs.few（每顆 min-width:120px × 五顆 = 600px，
                   在 420px 的手機上塞不下，翻譯的底欄只剩三顆）
     所以把兩條路合成一條：翻譯用預設的五個，後面的程式只寫一次。
     ⚠ 以後要再加「某個角色才有的狀態」，就加在這條唯一的路上。 */
  var want = ROLE_TABS_[STAFF_ROLE] || ['cal', 'new', 'track', 'follow', 'stat'];
  /* ⛔ 只管有 data-t 的那些。行政那顆加號（#admAdd）故意沒有 data-t——
     它不是分頁、不切 pane。以前這一行會把它算成「不在名單上」而藏起來，
     於是加號生出來了卻看不見（2026-10-04 實測踩到）。 */
  var btns = document.querySelectorAll('.tabs button[data-t]');
  [].forEach.call(btns, function(b){ b.hidden = (want.indexOf(b.dataset.t) === -1); });
  /* 只剩兩三顆的時候不要每顆撐到半個畫面——那看起來像壞掉。
     ⚠ 用 class 標記而不是改 .tabs button 的通則，
       翻譯那五顆（含中間的加號）完全不受影響。 */
  var bar = document.querySelector('.tabs');
  if(bar) bar.classList.toggle('few', want.length <= 3);
  hideLoneTabs();
  /* 目前那一頁如果被藏起來了，要跳回第一個看得到的，
     不然畫面停在一個按不到的分頁上。 */
  var on = document.querySelector('.tabs button.on');
  if(on && on.hidden){
    var first = document.querySelector('.tabs button:not([hidden])');
    if(first) first.click();
  }
}

/* ── 共用：這一筆現在什麼狀態 ───────────────────── */
function dpLive(){ return CAL_ROWS.filter(function(r){ return r.status !== '取消'; }); }
function dpDay(d){ return dpLive().filter(function(r){ return r.date === d; }); }
function dpWho(r){ return r.crew || r.sug || ''; }
function dpUrg(r){
  if(r.slot) return ['dpu1', '壓時間 ' + r.slot];
  if((r.memo||'').indexOf('不急') === 0) return ['dpu3', '不急'];
  return ['dpu2', '壓日期'];
}
function dpLabel(d){
  if(!d) return '（沒有日期）';
  var p = d.split('-'), x = new Date(+p[0], +p[1]-1, +p[2]);
  return (+p[1]) + '/' + (+p[2]) + '（' + '日一二三四五六'.charAt(x.getDay()) + '）';
}
function dpCrewLang(n){ return (TAX && TAX.crewLang && TAX.crewLang[n]) || CREW_LANG_[n] || ''; }
var CREW_LANG_ = {};   // 由 bootstrap 帶進來（svcBootstrap 的 crewLang）
/* 誰哪一天不在。⛔ listSchedule 每次都有回 leave，前端從來沒收過——
   「排給請假的人＝整筆白排」是 2026-09-28 七天模擬列出的六個破口之一。
   ⚠ 那張表現在是空的（沒人登記，也還沒有登記入口），所以目前永遠不會亮。 */
var LEAVE_ = {};       // 姓名 -> ['yyyy-MM-dd', …]

/* ── 衝突偵測 ────────────────────────────────────
   四種：撞時間／語言不對／本人說不行／可能太滿。
   前三種是硬的，第四種只提醒——**件數不等於多累**。
   ⚠️ 「那天請假」做不了：系統沒有請假登記，
      目前靠翻譯自己在灰色預排上按「我那天不行」頂著。 */
function dpConflicts(d){
  var rows = dpDay(d).filter(function(r){ return dpWho(r) && r.status === '預排'; });
  var out = [], seen = {};
  for(var i=0;i<rows.length;i++) for(var j=i+1;j<rows.length;j++){
    var a=rows[i], b=rows[j];
    if(dpWho(a)!==dpWho(b) || !a.slot || !b.slot || a.slot!==b.slot) continue;
    out.push({ hard:1, ty:'撞時間', id:a.id,
      title: dpWho(a)+' '+a.slot+' 同時有兩件',
      why: esc(a.client)+' '+esc(a.topic||'')+'（'+esc(a.by)+'）　vs　'+
           esc(b.client)+' '+esc(b.topic||'')+'（'+esc(b.by)+'）' });
  }
  rows.forEach(function(r){
    var w = dpWho(r), lg = dpCrewLang(w);
    if(r.decline){
      out.push({ hard:1, ty:'本人說不行', id:r.id,
        title: w+' 說 '+dpLabel(r.date)+' 那天不行',
        why: esc(r.client)+' '+esc(r.topic||'')+'　·　他寫的：'+
             esc(String(r.decline).split('：').slice(1).join('：') || r.decline) });
    } else if(r.lang && lg && lg !== r.lang){
      var alt = CREW.filter(function(n){ return dpCrewLang(n) === r.lang; });
      out.push({ hard:1, ty:'語言不對', id:r.id,
        title: esc(r.client)+' '+esc(r.topic||'')+' 排給了 '+w,
        why: '這一場是'+esc(r.lang)+'文，'+w+' 是'+esc(lg)+'文　·　同語別的：'+
             (alt.map(function(n){ return n+'（'+
               dpDay(r.date).filter(function(y){ return dpWho(y)===n; }).length+' 件）';
             }).join('、') || '沒有人') });
    }
  });
  var cnt = {}, seenC = {}, hs = {};
  rows.forEach(function(r){
    var w = dpWho(r); cnt[w] = (cnt[w]||0) + 1;
    var k = w + '｜' + r.client;
    if(!seenC[k]){ seenC[k] = 1; hs[w] = (hs[w]||0) + 1; }
  });
  Object.keys(cnt).forEach(function(w){
    /* ⛔ 這裡原本是「排了 5 件以上 → 可能太滿」。
       牟佑彬 2026-10-04 直接否掉這個門檻：「不一定。相近的當然能多跑一點。」
       ⚠ 所以改成**純陳述**：只講那天幾件、幾家，不替她下「太滿」的判斷。
         件數多不多要看地點散不散，而**地點系統現在還不知道**
         （鄉鎮在「專責翻譯_草稿」，正式客戶名單那一欄是空的）。
         等鄉鎮併進來，這裡才改成「N 件散在 K 個鄉鎮」。 */
    if(cnt[w] >= 4) out.push({ hard:0, ty:'那天的量', id:'',
      title: w+' '+dpLabel(d)+' 排了 '+cnt[w]+' 件，'+(hs[w]||0)+' 家',
      why: '不一定跑不完——地點相近就跑得多。散開的話看一下順不順路。' });
  });
  return out.filter(function(c){
    var k = c.id ? (c.ty+c.id) : ('s'+c.title);
    if(seen[k]) return false; seen[k]=1; return true;
  });
}
function dpHardSet(d){
  var m={}; dpConflicts(d).forEach(function(c){ if(c.hard && c.id) m[c.id]=c.ty; }); return m;
}

/* ── 共用卡片。沿用行事曆的視覺語言，不另外發明一套。 ── */
function dpCard(r, acts){
  var u = dpUrg(r), w = dpWho(r), pre = (!r.crew && r.sug);
  return '<div class="dpcd'+(pre?' pre':'')+(r.crew?' ok':'')+'">'+
    '<div class="dpb">'+
      '<div class="dpk">'+esc(r.topic || r.sub || '—')+
        /* 做完的要印服務編號。行政拿著紙本三聯單找這一筆，
           或是副理要調出來看，靠的就是這個號碼。
           ⛔ 資料早就回來了（listSchedule 的 recCode），
              **行事曆的卡片一直有印，派工台這張從來沒印過**——
              而真正需要它的是行政與副理，不是翻譯（牟佑彬 2026-10-03）。 */
        (r.recCode?'<span class="dpcode">'+esc(r.recCode)+'</span>':'')+'</div>'+
      '<div class="dpc">'+esc(r.client)+'</div>'+
      /* 一對多要講「整廠的場次」，不要只印一個人名——
         這三張卡（翻譯的行事曆、預排、特助的派工台）要長得一樣。 */
      (isManyRow_(r)
        ? '<div class="dpw">全廠宣導</div>'
        : (r.workers?'<div class="dpw">'+esc(r.workers)+'</div>':''))+
      (r.memo?'<div class="dpw">'+esc(r.memo)+'</div>':'')+
      '<div class="dpm">'+dpLabel(r.date)+'　'+esc(r.slot||'未定時段')+'　'+
        (w?'<b>'+esc(w)+'</b>':'<b class="non">還沒有人</b>')+
        '　·　'+esc(r.by||'')+(r.sug&&!r.crew?' 建議':' 開單')+
        (r.decline?'<br><b class="non">本人說不行：'+
          esc(String(r.decline).split('：').slice(1).join('：')||r.decline)+'</b>':'')+
        (r.moved?'<br>改過：'+esc(r.moved):'')+
      '</div>'+
    '</div>'+
    '<div class="dpg">'+
      (r.status==='已完成' ? '<span class="dpt ok">✓ 已完成</span>'
        : r.crew ? '<span class="dpt ok">✓ 已確認</span>'
        : r.sug ? '<span class="dpt pre">預排・未確認</span>'
        : '<span class="dpt wait">還沒有人</span>')+
      /* ⑶ 審核狀態。⛔ listSchedule 早就回了 r.rv（Schedule.gs:153），
         在 2026-09-28 之前**沒有任何畫面印它**——翻譯的紀錄被退回，
         開單的行政完全不知道，客戶打電話來問他答不出話。
         ⚠ 只有已完成的才印：還沒做的當然「未送審」，印出來是雜訊。 */
      (r.status==='已完成' && r.rv
        ? '<span class="dpt '+(r.rv==='已歸檔' ? 'ok'
            : r.rv==='退回補正' ? 'dpu1' : 'wait')+'">'+esc(r.rv)+'</span>'
        : '')+
      /* 一對多與追蹤：行事曆上有，派工台以前沒有。特助看不到就會把
         整廠宣導當成一個人的行程去配人（牟佑彬 2026-10-04 要求三邊一致）。 */
      (isManyRow_(r)?'<span class="dpt many">一對多</span>':'')+
      (r.caseId?'<span class="dpt">'+esc(caseTag_(r))+'</span>':'')+
      '<span class="dpt '+u[0]+'">'+esc(u[1])+'</span>'+
      (r.lang?'<span class="dpt">'+esc(r.lang)+'文</span>':'<span class="dpt">不用翻譯</span>')+
      (acts||'')+
    '</div></div>';
}
function dpGroup(title, list, tone){
  if(!list.length) return '';
  return '<div class="dphd '+(tone||'')+'">'+title+' <b>'+list.length+'</b></div>'+
    list.map(function(r){ return dpCard(r, dpEditBtn(r)); }).join('');
}

/* 開單的人自己可以改（牟佑彬 2026-10-03）。
   ⛔ 已完成的不給改——那一筆連著一張服務紀錄。
   ⚠ 已確認的也給改，但按鈕字要不一樣：改完會退回待確認，
      這不是「小修一下」，要讓行政按之前就知道。 */
function dpEditBtn(r){
  if(!r || r.status === '已完成' || r.status === '取消') return '';
  /* 「看得到待確認分頁」＝有指派權，跟 ROLE_TABS_ 用同一個事實來源。
     ⛔ 不要再寫一份角色名單——兩份遲早會不一致。 */
  var tabs = ROLE_TABS_[STAFF_ROLE] || [];
  if(r.by !== STAFF_NAME && tabs.indexOf('conf') < 0 && tabs.indexOf('order') < 0) return '';
  return '<button type="button" class="dpsm" data-edit="'+esc(r.id)+'">'+
    (r.crew ? '改（會退回重審）' : '改')+'</button>';
}

/* ── ⑴ 欠填紅點（2026-09-28 七天模擬列出來的破口之一）─────
   「做完了但沒填紀錄」七天累積 30 筆，**連翻譯自己都不知道欠著**。
   追蹤與送審本來就有紅點，照抄那個做法。
   ⚠️ 數的是「已完成但沒有紀錄代碼」——那正是漏掉的定義。 */
function owedCount(){
  return CAL_ROWS.filter(function(r){
    return r.status === '已完成' && !r.recCode && r.crew === (STAFF_NAME || '');
  }).length;
}
function paintOwed(){
  var b = $('newBadge');
  if(!b) return;
  var n = owedCount();
  b.textContent = n;
  b.style.display = n ? '' : 'none';
}

/* ── ⑵ 過期未結案 ───────────────────────────────
   日期已經過了、還停在「預排」——七天模擬裡累積 50 筆，**沒有任何人看得到**。
   ⚠️ 不看「已完成」也不看「取消」：那兩種都已經有結論了。 */
function overdue(){
  var t = todayStr();
  return CAL_ROWS.filter(function(r){
    return r.status === '預排' && r.date && r.date < t;
  }).sort(function(a,b){ return a.date.localeCompare(b.date); });
}
function owedAll(){
  return CAL_ROWS.filter(function(r){ return r.status === '已完成' && !r.recCode; });
}

function dpTomorrow(){ var d=new Date(); d.setDate(d.getDate()+1); return dpYmd(d); }
function dpYmd(d){ return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+
  '-'+('0'+d.getDate()).slice(-2); }
function dpPlus(s,n){ var p=s.split('-'), d=new Date(+p[0],+p[1]-1,+p[2]);
  d.setDate(d.getDate()+n); return dpYmd(d); }

/* ══ 行政：客戶（開單）════════════════════════ */
var DP_CLI = '', DP_SUG = null, DP_MINEONLY = true;
/* ⚠ 單獨一行宣告，不要併進上面那串。check_js_globals.js 只認
   `var` 後面緊接的第一個名字，併在逗號後面會被誤報成「沒有宣告」。 */
var DP_RESET_ = 0;
/* ⛔ loadOrder 是**整塊 innerHTML 重畫**的，而點「建議誰去」就會呼叫它一次。
      所以在 2026-10-01 之前，點一下人選會把**語別、事由、日期、備註、
      打到一半的交代事項全部打回預設**——只是沒有人注意到。
      加了語別連動之後它才浮出來：語別明明設成「英」，畫面上卻跳回空白。
   做法：重畫前拍一張、重畫完貼回去。存檔成功後才讓它真的清空（DP_RESET_）。 */
function dpSnap(){
  if(!$('dpL')) return null;
  if(DP_RESET_){ DP_RESET_ = 0; return null; }
  return { b:$('dpB').value, s:$('dpS').value, l:$('dpL').value, u:$('dpU').value,
           d:$('dpD').value, t:$('dpT').value, m:$('dpM').value,
           todo: dpTodoRows(),
           touched: (($('dpTodo')||{dataset:{}}).dataset||{}).touched };
}
function dpRestore(k){
  if(!k || !$('dpL')) return;
  $('dpB').value = k.b; $('dpB').onchange();      // 會重填「事由」那個下拉
  $('dpS').value = k.s;
  $('dpL').value = k.l;
  $('dpU').value = k.u; $('dpU').onchange();      // 壓時間才顯示時間欄；它會改日期
  $('dpD').value = k.d; $('dpT').value = k.t; $('dpM').value = k.m;
  if(k.touched === '1'){
    var bx = $('dpTodo');
    if(bx){ bx.innerHTML = ''; bx.dataset.touched = '1'; k.todo.forEach(function(v){ dpTodoAdd(v); }); }
  } else {
    dpTodoDefaults();                             // 事由已經貼回去了，預設要重算
  }
}
/* ══ 行政的行程總表（牟佑彬 2026-10-04）══════════════════════════
   他要的是「一眼掃完」：哪幾趟還沒配人、特助後來派了誰、文件哪天還、
   還有有沒有哪一家整個月被忘記。

   ⛔ 資料跟行事曆**同一份**（CAL_CACHE），不另外去抓。
      另外抓的話兩邊會對不起來，而且多打兩次後端。
   ⚠ 固定看「這個月 ＋ 下個月」。行政是往前排的，看過去意義不大；
      要查舊的用放大鏡搜尋。
   ⛔ 文件那一欄是**用關鍵字猜的**——系統目前沒有「文件」這個欄位，
      收還是打在交代清單的自由文字裡（例如「跟王 收居留證」）。
      所以它會漏，不可以當成完整清單。要真的管得住，
      交代那一條要多一個「這是要收／還的文件」的勾（待他決定）。 */
var SUM_F = 'all';
var SUM_S = 'date';
var SUM_MINE = true;
var SUM_DOC_ = /\u8b49|\u8b77\u7167|\u6587\u4ef6|\u6263\u7e73|\u7c3d\u7f72|\u6b78\u9084/;

function sumMonths_(){
  var d = new Date(), y = d.getFullYear(), m = d.getMonth();
  function k(yy, mm){ if(mm > 11){ yy++; mm -= 12; } return yy + '-' + ('0' + (mm + 1)).slice(-2); }
  return [k(y, m), k(y, m + 1)];
}
function sumOwn_(){
  return PRESETS.filter(function(c){ return ADMIN_OF[c.c] === STAFF_NAME; });
}
function sumRows_(){
  var out = [];
  sumMonths_().forEach(function(m){
    (CAL_CACHE[m] || []).forEach(function(r){ out.push(r); });
  });
  var own = sumOwn_();
  if(SUM_MINE && own.length){
    var mine = {};
    own.forEach(function(c){ mine[c.c] = 1; });
    out = out.filter(function(r){ return mine[r.client]; });
  }
  return out;
}
function sumDoc_(r){
  var t = (r.todo || []).map(function(x){ return x.t || x; })
            .filter(function(x){ return SUM_DOC_.test(x); });
  if(!t.length) return null;
  return { tx: t[0], back: /\u9084/.test(t.join('')) };
}
function sumCrew_(r){
  if(r.crew) return ['', r.crew];
  if(r.sug)  return ['sug', '\u5efa\u8b70 ' + r.sug];
  return ['none', '\u9084\u6c92\u914d\u4eba'];
}
/* \u26d4 \u56de\u5b8c\u6574\u7684\u985e\u5225\u540d\uff0c\u4e0d\u8981\u5728\u6a23\u677f\u88e1\u62fc 's-'+x\u2014\u2014
   \u6aa2\u67e5\u5668\u53ea\u770b\u5f97\u5230 's-'\uff0c\u6703\u8aa4\u5831\u300c\u7528\u5230\u4e86\u4f46\u4e00\u884c\u6a23\u5f0f\u90fd\u6c92\u6709\u300d\u3002 */
function sumSt_(r){
  if(r.status === '\u5df2\u5b8c\u6210') return ['s-done', '\u5df2\u5b8c\u6210'];
  if(r.status === '\u53d6\u6d88')       return ['s-cancel', '\u53d6\u6d88'];
  if(r.crew)                            return ['s-ok', '\u5df2\u78ba\u8a8d'];
  return ['s-pre', '\u9810\u6392'];
}
var SUM_FILT_ = [
  ['all',    '\u5168\u90e8',           function(){ return true; }],
  ['pre',    '\u9810\u6392',           function(r){ return r.status === '\u9810\u6392' && !r.crew; }],
  ['ok',     '\u5df2\u78ba\u8a8d',     function(r){ return r.status === '\u9810\u6392' && !!r.crew; }],
  ['done',   '\u5df2\u5b8c\u6210',     function(r){ return r.status === '\u5df2\u5b8c\u6210'; }],
  ['nobody', '\u9084\u6c92\u914d\u4eba', function(r){ return r.status === '\u9810\u6392' && !r.crew && !r.sug; }],
  ['doc',    '\u6709\u6587\u4ef6',     function(r){ return !!sumDoc_(r); }]
];

/* 星期幾與「10 月 3 日（六）」 */
function wdOf_(d){
  var p = String(d).split('-');
  if(p.length !== 3) return '';
  return '\u65e5\u4e00\u4e8c\u4e09\u56db\u4e94\u516d'
    .charAt(new Date(+p[0], +p[1] - 1, +p[2]).getDay());
}
function sumDayLabel_(d){
  var p = String(d).split('-');
  if(p.length !== 3) return d;
  return (+p[1]) + ' \u6708 ' + (+p[2]) + ' \u65e5\uff08' + wdOf_(d) + '\uff09';
}

function loadSum(force){
  var box = $('p-sum');
  if(!box) return;
  var ms = sumMonths_();
  var need = ms.filter(function(m){
    return force || !CAL_CACHE[m] || (Date.now() - (CAL_CACHE_AT[m] || 0)) > CAL_TTL;
  });
  if(!need.length){ drawSum(); return; }
  if(ms.some(function(m){ return CAL_CACHE[m]; })) drawSum();
  else box.innerHTML = '<div class="mid" style="padding:26px">\u8f09\u5165\u4e2d\u2026</div>';
  var left = need.length;
  need.forEach(function(m){
    google.script.run
      .withSuccessHandler(function(r){
        CAL_CACHE[m] = r.rows || [];
        CAL_CACHE_AT[m] = Date.now();
        if(!CREW.length) CREW = r.crew || [];
        if(r.leave) LEAVE_ = r.leave;      // 誰哪天不在
        if(--left === 0){ drawSum(); refreshed(); }
      })
      .withFailureHandler(function(e){
        if(--left === 0){ drawSum(); refreshed(); }
        toast(e.message, true);
      })
      .listSchedule(CODE, m);
  });
}

function drawSum(){
  var box = $('p-sum');
  if(!box) return;
  var all = sumRows_();
  var f = SUM_FILT_.filter(function(x){ return x[0] === SUM_F; })[0] || SUM_FILT_[0];
  var rows = all.filter(f[2]).slice();

  if(SUM_S === 'date') rows.sort(function(a, b){
    return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
  if(SUM_S === 'client') rows.sort(function(a, b){
    return String(a.client).localeCompare(String(b.client), 'zh-Hant') ||
           (a.date < b.date ? -1 : 1); });
  if(SUM_S === 'status') rows.sort(function(a, b){
    var o = { '\u9810\u6392': 0, '\u5df2\u5b8c\u6210': 1, '\u53d6\u6d88': 2 };
    return ((o[a.status] || 0) - (o[b.status] || 0)) || (a.date < b.date ? -1 : 1); });

  var own = sumOwn_();
  /* \u26d4 \u6a19\u984c\u5e95\u4e0b\u90a3\u884c\u300c2026-10 \u8207 2026-11\u3000\u5171 15 \u7b46\u300d\u62ff\u6389\u4e86\uff08\u725f\u4f51\u5f6c 2026-10-04 \u5283\u6389\uff09\u3002
     \u7b46\u6578\u4e0b\u9762\u90a3\u6392\u7be9\u9078\u6bcf\u4e00\u9846\u90fd\u6709\uff0c\u9019\u88e1\u518d\u5beb\u4e00\u6b21\u662f\u91cd\u8907\u7684\u3002 */
  var h = '<div class="sumhd"><h3>\u884c\u7a0b\u7e3d\u8868</h3></div>';

  /* \u4e00\u884c\u6392\u5b8c\uff0c\u8d85\u51fa\u53bb\u7684\u5de6\u53f3\u6ed1\uff08\u725f\u4f51\u5f6c 2026-10-04\uff09\u3002
     \u26d4 \u672c\u4f86\u662f\u6298\u884c\uff0c\u516d\u9846\u4f54\u6389\u5169\u884c\uff0c\u628a\u884c\u7a0b\u64e0\u5230\u4e0b\u9762\u53bb\u3002 */
  h += '<div class="sumf">' + SUM_FILT_.map(function(x){
    return '<button type="button" data-sf="' + x[0] + '"' +
      (x[0] === SUM_F ? ' class="on"' : '') + '>' + esc(x[1]) +
      '<em>' + all.filter(x[2]).length + '</em></button>';
  }).join('') + '</div>';

  h += '<div class="sumbar"><b>' + esc(f[1]) + ' ' + rows.length + ' \u7b46</b>' +
    (own.length
      ? '<button type="button" class="dpsm" id="sumMine">' +
        (SUM_MINE ? ('\u53ea\u770b\u6211\u7684 ' + own.length + ' \u5bb6')
                  : ('\u5168\u90e8 ' + PRESETS.length + ' \u5bb6')) + '</button>'
      : '') +
    '<span class="sp"></span><span class="sumsort">' +
    [['date', '\u4f9d\u65e5\u671f'], ['client', '\u4f9d\u5ba2\u6236'],
     ['status', '\u4f9d\u72c0\u614b']].map(function(k){
      return '<button type="button" data-ss="' + k[0] + '"' +
        (SUM_S === k[0] ? ' class="on"' : '') + '>' + k[1] + '</button>';
    }).join('') + '</span></div>';

  /* \u26d4 \u300c\u884c\u653f\u8ca0\u8cac\u5ba2\u6236\u90a3\u5f35\u8868\u9084\u6c92\u586b\u300d\u90a3\u6bb5\u8aaa\u660e\u62ff\u6389\u4e86\uff08\u725f\u4f51\u5f6c 2026-10-04 \u5283\u6389\uff09\u3002
     \u26a0 \u4e8b\u5be6\u6c92\u8b8a\uff1a\u6c92\u586b\u7684\u8a71\u9019\u88e1\u9084\u662f\u5217\u5168\u90e8\u7684\u884c\u7a0b\uff0c\u53ea\u662f\u4e0d\u518d\u6bcf\u6b21\u90fd\u8ddf\u4ed6\u8b1b\u4e00\u6b21\u3002
       \u586b\u597d\u4e4b\u5f8c\u300c\u53ea\u770b\u6211\u7684\u300d\u90a3\u9846\u6309\u9215\u6703\u81ea\u5df1\u51fa\u73fe\u3002 */

  if(!rows.length) h += '<div class="mid" style="padding:28px">' +
    '\u9019\u500b\u689d\u4ef6\u4e0b\u6c92\u6709\u884c\u7a0b</div>';

  var today = todayStr(), last = '';
  rows.forEach(function(r){
    var key = SUM_S === 'client' ? r.client : (SUM_S === 'status' ? r.status : r.date);
    if(key !== last){
      last = key;
      h += '<div class="sumday' + (SUM_S === 'date' && r.date === today ? ' now' : '') + '">' +
        esc(SUM_S === 'date' ? sumDayLabel_(r.date) : (key || '\u2014')) +
        (SUM_S === 'date' && r.date === today ? '<u>\u4eca\u5929</u>' : '') + '</div>';
    }
    var cw = sumCrew_(r), st = sumSt_(r);
    var p = String(r.date).split('-');
    h += '<div class="sumrow' +
      (cw[0] === 'none' && r.status === '\u9810\u6392' ? ' gap' : '') +
      '" data-sday="' + esc(r.date) + '">' +
      '<span class="sdt">' + (+p[1]) + '/' + (+p[2]) +
        '<u>' + wdOf_(r.date) + '</u></span>' +
      '<span class="scl">' + esc(r.client || '\u2014') + '</span>' +
      '<span class="ssb">' + esc(r.topic || r.sub || '\uff08\u9084\u6c92\u586b\u4e8b\u7531\uff09') +
        (r.workers ? ('\u3000\u00b7\u3000' + esc(r.workers)) : '') + '</span>' +
      '<span class="srt"><span class="spill ' + st[0] + '">' + st[1] + '</span>' +
        '<span class="scw ' + cw[0] + '">' + esc(cw[1]) + '</span></span>' +
      /* 交代與文件同一排。交代那顆點了會在這一列底下攤開
         （牟佑彬 2026-10-04：「也要做下拉式」）。
         ⚠ 跟行事曆卡片用的是**同一支** todoPill_／todoList_，
           改一邊兩邊一起變，不會又長出第二種樣子。 */
      /* \u26d4 \u300c\u6587\u4ef6\u3000\u8ddf\u9ec3\u5c0f\u59d0\u62ff\u6263\u7e73\u300d\u90a3\u500b\u6a19\u62ff\u6389\u4e86\uff08\u725f\u4f51\u5f6c 2026-10-04\uff09\u3002
         \u5b83\u5370\u7684\u662f**\u4ea4\u4ee3\u7684\u7b2c\u4e00\u4ef6\u4e8b**\u2014\u2014\u65e2\u7136\u9ede\u4e00\u4e0b\u5c31\u6574\u4e32\u6524\u5f97\u958b\uff0c
         \u5728\u5217\u4e0a\u5148\u9810\u89bd\u4e00\u689d\u53ea\u662f\u628a\u6bcf\u4e00\u5217\u6490\u9ad8\uff0c\u800c\u4e14\u7b2c\u4e8c\u689d\u4e4b\u5f8c\u770b\u4e0d\u5230\u53cd\u800c\u66f4\u60f3\u9ede\u3002
         \u26a0 \u300c\u6709\u6587\u4ef6\u300d\u90a3\u500b\u7be9\u9078**\u7559\u8457**\uff1a\u5b83\u53ea\u7528\u4f86\u7be9\uff0c\u4e0d\u5370\u5167\u5bb9\u3002 */
      ((r.todo || []).length ? '<span class="stag">' + todoPill_(r) + '</span>' : '') +
      todoList_(r) +
      '</div>';
  });

  /* 「有沒有忘記排」。
     ⛔ 只有在「行政負責客戶」填好之後才顯示——沒填的話名單是全部 304 家，
        印出「這 304 家還沒有行程」完全沒有用，而且會把真正要看的擠掉
        （2026-10-04 實拍發現）。會亂叫的提醒比沒有提醒更糟。 */
  if(own.length){
    var hasTrip = {};
    all.forEach(function(r){ hasTrip[r.client] = 1; });
    var miss = own.filter(function(c){ return !hasTrip[c.c]; });
    if(miss.length){
      h += '<div class="summiss"><h4>你負責的 ' + own.length +
        ' 家裡，這 ' + miss.length +
        ' 家這兩個月還沒有行程</h4>' +
        '<div class="cs">' + miss.slice(0, 20).map(function(c){
          return '<span>' + esc(c.c) + '</span>'; }).join('') +
        (miss.length > 20
          ? '<span class="more">…還有 ' + (miss.length - 20) + ' 家</span>'
          : '') + '</div></div>';
    }
  }
  box.innerHTML = h;
}

/* 篩選、排序、只看我的、點一列跳回行事曆的那一天。
   ⚠ 用委派綁在整頁上，畫面重畫之後不用重綁。 */
document.addEventListener('click', function(e){
  var t = e.target;
  if(!t || !t.closest || !t.closest('#p-sum')) return;
  var b = t.closest('[data-sf]');
  if(b){ SUM_F = b.dataset.sf; drawSum(); return; }
  var sb = t.closest('[data-ss]');
  if(sb){ SUM_S = sb.dataset.ss; drawSum(); return; }
  if(t.closest('#sumMine')){ SUM_MINE = !SUM_MINE; drawSum(); return; }
  var row = t.closest('[data-sday]');
  if(row){
    /* 點一列跳到行事曆的那一天。
       ⛔ 不要直接開表單——他在總表上是在「掃」，掃到可疑的那一筆才要進去看。 */
    CAL_SEL = row.dataset.sday;
    CAL_YM = CAL_SEL.slice(0, 7);
    CAL_VIEW = 'day';
    goTab('cal');
    loadCal(CAL_YM);
  }
}, false);

/* ══ 特助排班（牟佑彬 2026-10-04 定案的流程）══════════════════════
   卡到 → ① 問行政調時間 → ② 其他翻譯 → ③ 非翻譯＋電話 → ④ 改天 → 退回

   ⛔ 系統不排班，系統只負責「把要她判斷的那幾筆挑出來」。
      ①③④三關的答案都在人身上（工廠肯不肯、這場要不要翻譯、能不能延），
      系統猜了反而要她花時間推翻。能自動的只有兩件：
      **算出誰卡到了**、**算出誰可以頂**。

   ⚠ 甲（摺疊條）與戊（一人一頁）是**讓他試用的兩種做法**，
     他看過實體介面之後會挑一個，沒選的那一個要砍掉。

   ⛔ 未定時段不算撞——他的原話：「沒填表示該行程有彈性」。
   ⛔ 不准用件數門檻判斷「太滿」——他的原話：「不一定。相近的當然能多跑一點。」
   ══════════════════════════════════════════════════════════════ */
var PS_DAY = '';          // 看哪一天，預設明天
var PS_OPEN = '';         // 甲：展開的是誰
var PS_CUR = 0;           // 戊：翻到第幾個人
var PS_SHEET = null;      // 開著換人面板的那一筆

function psTomorrow_(){
  var d = new Date(); d.setDate(d.getDate() + 1);
  return d.getFullYear() + '-' + ('0'+(d.getMonth()+1)).slice(-2) +
    '-' + ('0'+d.getDate()).slice(-2);
}
function psShift_(day, n){
  var p = String(day).split('-');
  var d = new Date(+p[0], +p[1]-1, +p[2]); d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + ('0'+(d.getMonth()+1)).slice(-2) +
    '-' + ('0'+d.getDate()).slice(-2);
}

/* 這一天為什麼卡住。只認他確認過的那幾種，不自己加。 */
/* 卡住的原因。回 { why: 給那一塊看的長句, tag: 標在那一塊上的短標 }。
   ⛔ 只寫「卡住」兩個字她看不出為什麼——原因有五種
      （撞時段、語言不對、請假、本人說不行、沒有人），
      牟佑彬 2026-10-04 看著整片紅問「卡住的原因是什麼」。 */
/* 這一塊要不要補一句灰字。**只寫事實，不做判斷**——
   撞不撞由特助自己看（牟佑彬 2026-10-04：「那個就由特助自己個人去判斷」）。
   ⛔ 回傳空字串＝什麼都不寫。不要為了「有東西可寫」硬湊。 */
function psNote_(r){
  var w = dpWho(r);
  if(!w) return '';
  if(r.decline) return w + ' 說那天不行';
  if((LEAVE_[w] || []).indexOf(r.date) !== -1) return w + ' 那天請假';
  var lg = dpCrewLang(w);
  if(r.lang && lg && lg !== r.lang) return w + ' 是' + lg + '文，這一場是' + r.lang + '文';
  return '';
}

function psRows_(){
  return dpDay(PS_DAY).filter(function(r){ return r.status === '預排'; });
}
/* 跟這一筆同一個翻譯、同一天的所有行程。順序是一個人一組，不是整天一組。 */
function psMine_(r){
  var w = dpWho(r);
  return psRows_().filter(function(x){ return dpWho(x) === w; });
}
function psGroups_(){
  var rows = psRows_(), by = {};
  rows.forEach(function(r){
    var w = dpWho(r) || '（還沒有人）';
    (by[w] = by[w] || []).push(r);
  });
  return Object.keys(by).map(function(w){
    return { who: w, rows: by[w] };
  }).sort(function(a, b){
    /* ⛔ 不再「有問題的排前面」——沒有誰有問題了。照名字排，
       每天打開順序一樣，她才找得到人。 */
    return String(a.who).localeCompare(String(b.who), 'zh-Hant');
  });
}

/* 那天跑的順序：上午 → 下午／全天 → 不壓時間，各區內照存起來的 ord。
   ⛔ 編號 1234 一直接續，不管上下午（他 2026-10-04 指定）。 */
var PS_ZONES_ = ['上午', '下午', ''];
/* 時段那一格可以是「上午／下午／全天」，也可以是真的時間 09:30（選填）。
   ⛔ 回傳的是**分鐘數**，不是字串——要拿來比大小。沒填時間就回 null。
   ⚠ 後端存進試算表會變成時間格式，讀回來 schedSlot_ 已經格式化成 HH:mm。 */
function psTimeOf_(r){
  var m = /^(\d{1,2}):(\d{2})$/.exec(String((r && r.slot) || '').trim());
  if(!m) return null;
  var hh = +m[1], mm = +m[2];
  if(hh > 23 || mm > 59) return null;
  return hh * 60 + mm;
}
function psZoneOf_(r){
  var t = psTimeOf_(r);
  if(t !== null) return t < 12 * 60 ? '上午' : '下午';   // 填了時間就自己歸區
  if(r.slot === '上午') return '上午';
  if(r.slot) return '下午';          // 下午與全天都歸下午那一區
  return '';
}
function psOrdered_(rows){
  var out = [];
  PS_ZONES_.forEach(function(z){
    rows.filter(function(r){ return psZoneOf_(r) === z; })
      .sort(function(a, b){
        /* ⚠ 兩件都填了時間就照時間走——9:00 排在 10:00 前面是常識，
           不應該要她再手動拖一次。只有一邊有時間就照原本的順序。 */
        var ta = psTimeOf_(a), tb = psTimeOf_(b);
        if(ta !== null && tb !== null && ta !== tb) return ta - tb;
        return (a.ord || 9999) - (b.ord || 9999) ||
               String(a.id).localeCompare(String(b.id));
      })
      .forEach(function(r){ out.push(r); });
  });
  out.forEach(function(r, i){ r._no = i + 1; });
  return out;
}
/* 拖完存回去。
   ⛔ 一次送一個翻譯的一整天，不要一筆一筆打後端——
      六七筆就要打六七次，她在手機上會等到以為當掉。
   ⛔ 順序是**一個翻譯一組 1234**，不是整天累加。
      2026-10-04 第一版傳了整天 72 筆進來，存出來變成 5、16、17、37…
      排序still對，但數字看起來莫名其妙，而且一旦改派給別人就全亂了。 */
function psSaveOrder_(rows){
  var list = psOrdered_(rows).map(function(r){ return { id: r.id, ord: r._no }; });
  if(!list.length) return;
  google.script.run
    .withSuccessHandler(function(){ toast('順序存好了'); })
    .withFailureHandler(function(e){ toast(e.message, true); loadPS('ps1'); })
    .setScheduleOrder(CODE, list);
}

function psTrip_(r){
  var ad = psAddrShort_(r.client), note = psNote_(r);
  /* ⚠ 時段標在編號下面。區塊標題雖然也寫了，但她看的是「這一塊」，
     而且全天會落在下午那一區，不標就看不出來（牟佑彬 2026-10-04）。 */
  return '<div class="pstr" data-id="' + esc(r.id) + '">' +
    '<span class="nz"><span class="no">' + (r._no || '?') + '</span>' +
      '<span class="sl">' + esc(r.slot || '不壓') + '</span></span>' +
    '<span class="bd">' +
      '<span class="c">' + esc(r.client) + '</span>' +
      '<span class="t">' + esc(r.topic || r.sub || '—') +
        (r.workers ? ('　·　' + esc(r.workers)) : '') + '</span>' +
      '<span class="ad"><i>◎</i>' +
        (ad || '<i class="non">名冊上沒有地址</i>') + '</span>' +
      (note ? '<span class="nt">' + esc(note) + '</span>' : '') +
      /* ⛔ 「改時間／換人／改天」原本只長在警告面板裡。面板拿掉了，
         就得搬到每一塊自己身上——不然她只能動被標到的那幾件。 */
      '<span class="mv">' +
        '<button type="button" data-ps="zone" data-z="上午" data-id="' + esc(r.id) + '">↑ 上午</button>' +
        '<button type="button" data-ps="zone" data-z="下午" data-id="' + esc(r.id) + '">↓ 下午</button>' +
        '<button type="button" data-ps="zone" data-z="" data-id="' + esc(r.id) + '">不壓時間</button>' +
      '</span>' +
      '<span class="mv">' +
        '<button type="button" data-ps="time" data-id="' + esc(r.id) + '">幾點</button>' +
        '<button type="button" data-ps="pick" data-id="' + esc(r.id) + '">換人</button>' +
        '<button type="button" data-ps="day" data-id="' + esc(r.id) + '">改天</button>' +
      '</span></span>' +
    '<span class="gp">⠿</span>' +
    '</div>';
}

/* 三個區塊。拖進哪一區就變成那個時段（他說直接改，不用再問一次）。 */
function psZones_(g){
  var rows = psOrdered_(g.rows), h = '';
  PS_ZONES_.forEach(function(z){
    var list = rows.filter(function(r){ return psZoneOf_(r) === z; });
    /* ⚠ 標題只陳述「這一區幾件」。不講撞、不講滿——那是特助自己判斷的事。 */
    h += '<div class="pszone" data-z="' + esc(z) + '" data-who="' + esc(g.who) + '">' +
      '<div class="pszh">' +
        (z === '' ? '不壓時間（翻譯自己跟工廠約）' : z) +
        '<s>' + list.length + ' 件</s></div>' +
      (list.length
        ? list.map(function(r){ return psTrip_(r); }).join('')
        : '<div class="pszm">（空的，可以拖進來）</div>') +
      '</div>';
  });
  return h;
}
function psHead_(){
  var gs = psGroups_();
  return '<div class="pshd">' +
    '<button type="button" class="psnav" data-ps="prev">‹</button>' +
    '<span class="d"><b>' + esc(dpLabel(PS_DAY)) + '</b>' +
      '<s>' + psRows_().length + ' 筆　·　' + gs.length + ' 位翻譯</s></span>' +
    '<button type="button" class="psnav" data-ps="next">›</button>' +
    '</div>' +
    (PS_DAY !== psTomorrow_()
      ? '<button type="button" class="pstm" data-ps="tmr">回到明天</button>' : '');
}

/* 甲：摺疊條。卡住的排前面，點開才看細節。 */
function drawPS1(){
  var box = $('p-ps1'); if(!box) return;
  var gs = psGroups_();
  var h = psHead_();
  if(!gs.length) h += '<div class="mid" style="padding:30px">這一天還沒有預排的行程</div>';
  gs.forEach(function(g){
    h += '<div class="pspc' + (PS_OPEN === g.who ? ' open' : '') + '">' +
      '<div class="pshdr" data-ps="open" data-who="' + esc(g.who) + '">' +
        '<b>' + esc(g.who) + '</b>' +
        (dpCrewLang(g.who) ? '<span class="lg">' + esc(dpCrewLang(g.who)) + '</span>' : '') +
        '<s>' + g.rows.length + ' 件</s></div>' +
      '<div class="psin">' + psZones_(g) +
        '<button type="button" class="psok" data-ps="okall" data-who="' +
          esc(g.who) + '">確認 ' + g.rows.length + ' 筆</button>' +
      '</div></div>';
  });
  if(gs.length) h += '<button type="button" class="psall" data-ps="okgood">' +
    '全部確認（' + psRows_().length + ' 筆）</button>';
  box.innerHTML = h;
  psSheet_(box);
}

/* 戊：一人一頁，左右翻。 */
function drawPS2(){
  var box = $('p-ps2'); if(!box) return;
  var gs = psGroups_();
  var h = psHead_();
  if(!gs.length){
    box.innerHTML = h + '<div class="mid" style="padding:30px">這一天還沒有預排的行程</div>';
    return;
  }
  if(PS_CUR >= gs.length) PS_CUR = 0;
  var g = gs[PS_CUR];
  h += '<div class="pssw">' +
    '<button type="button" class="psnav" data-ps="pprev">‹</button>' +
    '<span class="m"><b>' + esc(g.who) + '</b>' +
      (dpCrewLang(g.who) ? '<span class="lg">' + esc(dpCrewLang(g.who)) + '</span>' : '') +
      '<s>' + g.rows.length + ' 件</s></span>' +
    '<button type="button" class="psnav" data-ps="pnext">›</button></div>' +
    '<div class="pspc open"><div class="psin">' +
      psZones_(g) +
      '<button type="button" class="psok" data-ps="okall" data-who="' +
        esc(g.who) + '">確認 ' + g.rows.length + ' 筆</button>' +
    '</div></div>' +
    '<div class="psdots">' + gs.map(function(x, i){
      return '<i class="' + (i === PS_CUR ? 'on' : '') +
        '" data-ps="dot" data-i="' + i + '"></i>';
    }).join('') + '</div>';
  box.innerHTML = h;
  psSheet_(box);
}

/* 換人面板。⚠ 兩頁共用同一支，改一次兩邊都變。 */
function psSheet_(box){
  if(!PS_SHEET) return;
  var job = CAL_ROWS.filter(function(r){ return r.id === PS_SHEET; })[0];
  if(!job) { PS_SHEET = null; return; }
  var list = psRank_(job);
  var ok = list.filter(function(x){ return !x.stop && !x.langNo; });
  var wn = list.filter(function(x){ return !x.stop && x.langNo; });
  var no = list.filter(function(x){ return x.stop; });
  function it(x){
    return '<div class="psit' + (x.stop ? ' no' : '') + '"' +
      (x.stop ? '' : ' data-ps="take" data-id="' + esc(job.id) + '" data-who="' +
        esc(x.n) + '"') + '>' +
      '<span class="bd"><span class="nm">' + esc(x.n) +
        (dpCrewLang(x.n) ? '' : '<span class="bk">非翻譯</span>') + '</span>' +
      '<span class="rs">' + (x.stop ? '<span class="stop">' + esc(x.stop) + '</span> · ' : '') +
        esc(x.bits.join(' · ')) + '</span></span>' +
      (x.stop ? '' : '<span class="go">換他 ›</span>') + '</div>';
  }
  box.insertAdjacentHTML('beforeend',
    '<div class="pssheet"><div class="psbx">' +
    '<h4>換誰去</h4><p class="mt">' + esc(job.client) + '　' +
      esc(job.topic || job.sub || '') +
      (job.lang ? ('　·　這一場是' + esc(job.lang) + '文') : '') + '</p>' +
    '<div class="pspk">' +
      (ok.length ? '<div class="sec">建議這幾位</div>' + ok.map(it).join('') : '') +
      (wn.length ? '<div class="sec">語言不對，但人有空</div>' + wn.map(it).join('') : '') +
      (no.length ? '<div class="sec">那天不能去</div>' + no.map(it).join('') : '') +
    '</div><button type="button" class="pscls" data-ps="close">算了</button>' +
    '</div></div>');
}


/* ══ 長按拖曳排序：佔位法（牟佑彬 2026-10-04 說第一版不順）══════════
   ⛔ 第一版為什麼會抖（我的錯）：元素用 translateY 跟著手指，
      但**每換一次位置就把基準點重設**，所以每交換一次畫面就跳一下；
      還疊了 scale，位移與縮放同時變更晃；而且拖到邊緣不會自動捲。

   ✓ 佔位法：浮起來的那一塊改成 position:fixed **精準跟著手指**，
     原位留一個同高的佔位格，要插到哪裡就把佔位格移到哪裡，放開就歸位。

   ⛔ 長按不可以跳出選取文字／放大鏡，不然拖不動。三道一起上：
      ① CSS user-select:none ＋ -webkit-touch-callout:none
      ② 進入拖曳後 touchmove preventDefault（{passive:false} 才擋得住）
      ③ contextmenu 直接擋掉
   ⚠ 長按 260ms 才算拖曳；之前手指移超過 10px 就當成捲動放行。 */
document.addEventListener('contextmenu', function(e){
  if(e.target && e.target.closest && e.target.closest('.pstr')) e.preventDefault();
});

var PSD_ = null;   // { el, ph, dy, x, w }

function psDragStop_(){
  if(!PSD_) return;
  var d = PSD_; PSD_ = null;
  d.el.classList.remove('lift');
  d.el.style.position = ''; d.el.style.left = ''; d.el.style.top = '';
  d.el.style.width = ''; d.el.style.zIndex = ''; d.el.style.pointerEvents = '';
  if(d.ph && d.ph.parentNode){
    d.ph.parentNode.insertBefore(d.el, d.ph);
    d.ph.parentNode.removeChild(d.ph);
  }
  [].forEach.call(document.querySelectorAll('.pszone'), function(q){
    q.classList.remove('hit'); });
  document.body.classList.remove('psdrag');
  return d;
}

/* 手指靠近上下邊緣就自動捲。⚠ 不做的話拖到螢幕外就卡住了。 */
function psAutoScroll_(y){
  var h = window.innerHeight || 800;
  if(y < 110) window.scrollBy(0, -Math.max(6, (110 - y) / 4));
  else if(y > h - 110) window.scrollBy(0, Math.max(6, (y - (h - 110)) / 4));
}

function psDragBind(){
  [].forEach.call(document.querySelectorAll('#p-ps1 .pstr, #p-ps2 .pstr'), function(el){
    if(el._psd) return;
    el._psd = 1;
    var timer = null, sy = 0, sx = 0, armed = false;

    function lift(y){
      var r = el.getBoundingClientRect();
      var ph = document.createElement('div');
      ph.className = 'psph';
      ph.style.height = r.height + 'px';
      el.parentNode.insertBefore(ph, el);
      el.style.position = 'fixed';
      el.style.left = r.left + 'px';
      el.style.width = r.width + 'px';
      el.style.top = r.top + 'px';
      el.style.zIndex = '60';
      el.classList.add('lift');
      document.body.classList.add('psdrag');
      PSD_ = { el: el, ph: ph, dy: y - r.top };
      if(navigator.vibrate) try { navigator.vibrate(12); } catch(e2){}
    }
    function start(y, x){
      sy = y; sx = x; armed = true;
      timer = setTimeout(function(){ if(armed) lift(y); }, 260);
    }
    function move(y, x, ev){
      if(!PSD_){
        if(armed && (Math.abs(y - sy) > 10 || Math.abs(x - sx) > 10)){
          clearTimeout(timer); armed = false;
        }
        return;
      }
      if(ev && ev.cancelable) ev.preventDefault();
      el.style.top = (y - PSD_.dy) + 'px';
      psAutoScroll_(y);

      /* ⛔ 要先把自己關掉，不然 elementFromPoint 永遠打到自己身上。 */
      el.style.pointerEvents = 'none';
      var over = document.elementFromPoint(x, y);
      el.style.pointerEvents = '';
      if(!over || !over.closest) return;

      var zone = over.closest('.pszone');
      if(!zone) return;
      [].forEach.call(document.querySelectorAll('.pszone'), function(q){
        q.classList.toggle('hit', q === zone); });

      var row = over.closest('.pstr');
      var ph = PSD_.ph;
      if(row && row !== el && row !== ph){
        var rr = row.getBoundingClientRect();
        zone.insertBefore(ph, (y < rr.top + rr.height / 2) ? row : row.nextSibling);
      } else if(!row && ph.parentNode !== zone){
        zone.appendChild(ph);           // 拖進空的區塊
      }
    }
    function end(y, x){
      clearTimeout(timer); armed = false;
      if(!PSD_) return;
      var zone = PSD_.ph.parentNode;
      psDragStop_();

      var id = el.dataset.id;
      var r = CAL_ROWS.filter(function(q){ return q.id === id; })[0];
      if(!r || !zone){ psDraw(); return; }

      var want = zone.dataset.z;
      var moved = (psZoneOf_(r) !== want);
      /* ⚠ 原本填了幾點、又被拖到另一個半天 → 那個時間一定要講一聲再清掉。
         安靜地把 09:30 吃掉，她會以為時間還在。 */
      var hadTime = (moved && psTimeOf_(r) !== null) ? r.slot : '';
      if(moved) r.slot = want;

      /* 畫面上現在的先後就是新的順序——照 DOM 重新編號。
         ⛔ 只算這一個翻譯的，順序是一個人一組 1234。 */
      var pane = el.closest('#p-ps2') ? '#p-ps2' : '#p-ps1';
      var card = el.closest('.pspc');
      var n = 0;
      [].forEach.call(card.querySelectorAll('.pszone'), function(q){
        [].forEach.call(q.querySelectorAll('.pstr'), function(t){
          var rr = CAL_ROWS.filter(function(x2){ return x2.id === t.dataset.id; })[0];
          if(rr){ rr.ord = ++n; if(t === el) rr.slot = q.dataset.z; }
        });
      });
      psDraw();

      var mine = psMine_(r);
      if(moved){
        google.script.run
          .withSuccessHandler(function(){ psSaveOrder_(mine); })
          .withFailureHandler(function(e){ toast(e.message, true); loadPS('ps1'); })
          .updateSchedule(CODE, id, { slot: want });
        toast(r.client + '　→　' + (want || '不壓時間') +
          (hadTime ? '（原本的 ' + hadTime + ' 取消了）' : ''));
      } else {
        psSaveOrder_(mine);
      }
    }

    el.addEventListener('touchstart', function(e){
      if(e.target.closest('button')) return;
      var t = e.touches[0]; start(t.clientY, t.clientX); }, { passive: true });
    el.addEventListener('touchmove', function(e){
      var t = e.touches[0]; move(t.clientY, t.clientX, e); }, { passive: false });
    el.addEventListener('touchend', function(e){
      var t = e.changedTouches[0]; end(t.clientY, t.clientX); });
    el.addEventListener('touchcancel', function(){
      clearTimeout(timer); armed = false; psDragStop_(); });
    /* 桌機也能拖，方便驗證 */
    el.addEventListener('mousedown', function(e){
      if(e.target.closest('button')) return;
      start(e.clientY, e.clientX);
      function mm(ev){ move(ev.clientY, ev.clientX, ev); }
      function mu(ev){ end(ev.clientY, ev.clientX);
        document.removeEventListener('mousemove', mm);
        document.removeEventListener('mouseup', mu); }
      document.addEventListener('mousemove', mm);
      document.addEventListener('mouseup', mu);
    });
  });
}

function psDraw(){ drawPS1(); drawPS2(); psDragBind();
  /* 順序一改，路線就該跟著變——不然她拖完去看路線還是舊的。 */
  if($('p-ps3') && $('p-ps3').innerHTML) drawRT(); }

function loadPS(which){
  var box = $('p-' + which); if(!box) return;
  if(!PS_DAY) PS_DAY = psTomorrow_();
  var m = PS_DAY.slice(0, 7);
  if(CAL_CACHE[m] && (Date.now() - (CAL_CACHE_AT[m] || 0)) <= CAL_TTL){
    calMerge([m]); psDraw(); return;
  }
  if(!CAL_CACHE[m]) box.innerHTML = '<div class="mid" style="padding:26px">載入中…</div>';
  google.script.run
    .withSuccessHandler(function(r){
      CAL_CACHE[m] = r.rows || []; CAL_CACHE_AT[m] = Date.now();
      if(!CREW.length) CREW = r.crew || [];
      if(r.leave) LEAVE_ = r.leave;
      calMerge([m]); psDraw(); refreshed();
    })
    .withFailureHandler(function(e){ toast(e.message, true); psDraw(); })
    .listSchedule(CODE, m);
}

/* 動作。⚠ 用委派綁在整頁上，畫面重畫之後不用重綁。 */
document.addEventListener('click', function(e){
  var t = e.target;
  if(!t || !t.closest) return;
  var b = t.closest('[data-ps]');
  if(!b || !b.closest('#p-ps1, #p-ps2')) return;
  e.stopPropagation(); e.preventDefault();
  var a = b.dataset.ps, id = b.dataset.id;
  var r = id ? (CAL_ROWS.filter(function(x){ return x.id === id; })[0] || {}) : {};

  if(a === 'prev'){ PS_DAY = psShift_(PS_DAY, -1); PS_CUR = 0; loadPS('ps1'); return; }
  if(a === 'next'){ PS_DAY = psShift_(PS_DAY, 1);  PS_CUR = 0; loadPS('ps1'); return; }
  if(a === 'tmr'){  PS_DAY = psTomorrow_();        PS_CUR = 0; loadPS('ps1'); return; }
  if(a === 'open'){ PS_OPEN = (PS_OPEN === b.dataset.who) ? '' : b.dataset.who;
    psDraw(); return; }
  if(a === 'pprev'){ var n1 = psGroups_().length;
    PS_CUR = (PS_CUR - 1 + n1) % n1; psDraw(); return; }
  if(a === 'pnext'){ var n2 = psGroups_().length;
    PS_CUR = (PS_CUR + 1) % n2; psDraw(); return; }
  if(a === 'dot'){ PS_CUR = +b.dataset.i; psDraw(); return; }
  if(a === 'pick'){ PS_SHEET = id; psDraw(); return; }
  if(a === 'zone'){
    /* 搬到別的區塊＝改時段，**直接改不要再問**（他 2026-10-04 指定）。
       ⚠ 畫面先動，不要等後端——她一天要搬好幾次。 */
    var z = b.dataset.z;
    if(r.slot === z){ return; }
    r.slot = z;
    psDraw();
    google.script.run
      .withSuccessHandler(function(){ psSaveOrder_(psMine_(r)); })
      .withFailureHandler(function(e){ toast(e.message, true); loadPS('ps1'); })
      .updateSchedule(CODE, id, { slot: z });
    toast(r.client + '　→　' + (z || '不壓時間'));
    return;
  }
  if(a === 'close'){ PS_SHEET = null; psDraw(); return; }

  if(a === 'take'){
    /* 換人＝確認給他。⛔ confirmSchedule 帶 who 就是改派，後端會順便通知原本那個人。 */
    PS_SHEET = null;
    psRun_(function(ok, bad){
      google.script.run.withSuccessHandler(ok).withFailureHandler(bad)
        .confirmSchedule(CODE, id, b.dataset.who, '');
    }, '已改派給 ' + b.dataset.who);
    return;
  }
  if(a === 'flex'){
    /* 「這件不動」＝把時間清掉讓它有彈性。他的原話：沒填表示該行程有彈性。 */
    psRun_(function(ok, bad){
      google.script.run.withSuccessHandler(ok).withFailureHandler(bad)
        .updateSchedule(CODE, id, { slot: '' });
    }, '改成未定時段，讓它有彈性');
    return;
  }
  if(a === 'time'){
    var now = r.slot || '';
    var pick = prompt('這一件幾點？\n\n' +
      '留白＝不壓時間（最常用，翻譯自己跟工廠約）\n' +
      '可以填：上午、下午、全天\n' +
      '也可以直接填時間：9:30、0930、14:00', now);
    if(pick === null) return;
    pick = psSlotIn_(String(pick).trim());
    if(pick === null){ toast('時間看不懂。可以填 9:30、0930，或上午／下午／全天', true);
      return; }
    psRun_(function(ok, bad){
      google.script.run.withSuccessHandler(ok).withFailureHandler(bad)
        .updateSchedule(CODE, id, { slot: pick });
    }, pick ? ('改成 ' + pick) : '時間清掉了，變成有彈性');
    return;
  }
  if(a === 'day'){
    var d = prompt('改到哪一天？（yyyy-MM-dd）\n\n' +
      r.client + '　' + (r.topic || ''), psShift_(PS_DAY, 1));
    if(d === null) return;
    d = String(d).trim();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(d)){ toast('日期格式要像 2026-10-08', true); return; }
    psRun_(function(ok, bad){
      google.script.run.withSuccessHandler(ok).withFailureHandler(bad)
        .updateSchedule(CODE, id, { date: d });
    }, '已改到 ' + d);
    return;
  }
  if(a === 'okall' || a === 'okgood'){
    var gs = psGroups_();
    var list = (a === 'okall')
      ? (gs.filter(function(g){ return g.who === b.dataset.who; })[0] || {rows:[]}).rows
      : gs.reduce(function(acc, g){ return acc.concat(g.rows); }, []);
    if(!list.length) return;
    var left = list.length, n = 0, err = '';
    list.forEach(function(x){
      google.script.run
        .withSuccessHandler(function(){ n++; if(!--left) psAfter_(n + ' 筆確認完'); })
        .withFailureHandler(function(er){ err = er.message;
          if(!--left) psAfter_(n ? (n + ' 筆過了，有幾筆沒過：' + err) : err); })
        .confirmSchedule(CODE, x.id, '');
    });
    return;
  }
}, true);

/* 做完一定要重抓——畫面上的是快取，不重抓她會以為沒生效。 */
/* 她打進來的時段。⚠ 手機上打字很煩，所以「930」「9:30」「09：30」（全形冒號）
   都要認得，認不得就回 null 讓外面擋下來——**不要安靜地存一個怪字串進去**。 */
function psSlotIn_(v){
  v = String(v || '').trim().replace(/：/g, ':').replace(/\s+/g, '');
  if(!v) return '';
  if(v === '上午' || v === '下午' || v === '全天') return v;
  var m = /^(\d{1,2}):?(\d{2})$/.exec(v);
  if(!m) return null;
  var hh = +m[1], mm = +m[2];
  if(hh > 23 || mm > 59) return null;
  return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
}

function psRun_(go, msg){
  go(function(){ psAfter_(msg); },
     function(e){ toast(e.message, true); });
}
function psAfter_(msg){
  toast(msg);
  calBust(PS_DAY.slice(0, 7));
  loadPS('ps1');
}

/* ══ 路線頁（牟佑彬 2026-10-04）══════════════════════════════════
   照排班頁拖出來的 1→2→3，把一個翻譯那天要跑的點連起來。

   ⛔ 這是**示意圖，不是真的地圖**。位置是相對的，只保證
      「北的在上、南的在下、海線在左、山線在右」。
      真的地圖＋真的車程要 Google 的 API，那個要錢——
      他 2026-10-04 自己想到更好的做法：**導去 Google 地圖就好，那是免費的**。

   ⛔ Google 連結**不給 origin**，Google 就會從她**現在的位置**開始導
      （他 2026-10-04 特別交代的）。
   ⚠ 那種連結最多 10 個點（終點＋中間 9 個 waypoints），超過要拆兩段。
   ⚠ 導航要**完整地址**（門牌），畫面上只顯示到路名——兩個都留著。 */

/* 地圖資料（縣市／鄉鎮輪廓＋鄉鎮中心點）。**用到才載**，125KB。
   座標＝以 120.0E / 23.5N 為原點的公里平面，x 往東、y 往南 → 兩點相減約略是公里。

   ⛔ 中心點是**鄉鎮的中心**，不是門牌位置。畫面上的「約 N 公里」是鄉鎮對鄉鎮的
      直線距離，實際開車一定更遠——所以文案只寫「大約」，不給分鐘數。
      要精確到門牌得做地理編碼，那要付錢（他還沒同意）。 */
var TWM_ = null;
var TWM_ERR_ = false;
function twLoad_(then){
  if(window.TWMAP){ TWM_ = window.TWMAP; then(); return; }
  if(TWM_ERR_){ then(); return; }
  if(twLoad_.busy){ twLoad_.wait.push(then); return; }
  twLoad_.busy = 1; twLoad_.wait = [then];
  var el = document.createElement('script');
  el.src = 'https://mousteven.github.io/yuher-app/twmap.js?v=1';
  el.crossOrigin = 'anonymous';
  el.onload = function(){
    TWM_ = window.TWMAP; twLoad_.busy = 0;
    twLoad_.wait.forEach(function(f){ f(); }); twLoad_.wait = [];
  };
  el.onerror = function(){
    TWM_ERR_ = true; twLoad_.busy = 0;
    twLoad_.wait.forEach(function(f){ f(); }); twLoad_.wait = [];
  };
  document.head.appendChild(el);
}

/* 地址 → 地圖上的鍵（縣市＋鄉鎮）。⚠ 名冊裡「臺」「台」兩種寫法都有，統一成「台」。 */
function rtKey_(client){
  var a = String(psAddrRaw_(client) || '').replace(/臺/g, '台');
  var m = /^(.{2,3}[市縣])(.{1,4}[區鄉鎮市])/.exec(a);
  return m ? (m[1] + m[2]) : '';
}
function rtPos_(key){ return (TWM_ && TWM_.p[key]) || null; }
/* 兩個鄉鎮中心的直線距離（公里）。沒有座標就回 0，呼叫端要自己當成「不知道」。 */
function rtDist_(ka, kb){
  var p = rtPos_(ka), q = rtPos_(kb);
  if(!p || !q) return 0;
  return Math.sqrt(Math.pow(p[0]-q[0], 2) + Math.pow(p[1]-q[1], 2));
}

/* 複選。⚠ 一次看幾個人的路線疊在一起，才看得出「兩個人同一天都往烏日跑」。 */
var RT_SEL = {};

/* 這一天有配到人的翻譯。⛔ 沒有人的那一筆不畫路線——它還沒有人要跑。 */
function rtGroups_(){
  return psGroups_().filter(function(g){ return g.who !== '（還沒有人）'; })
    .sort(function(a, b){
      return String(a.who).localeCompare(String(b.who), 'zh-Hant'); });
}

/* 疊圖用的顏色。⚠ 要在日間與夜間都看得見，所以用中間調，不要太淺或太深。
   ⛔ 多人模式下**不在點上印號碼**——點變小、字擠不下，而且重點是「誰跟誰重疊」。 */
var RT_COL_ = ['#3F8F6F', '#C05A6C', '#4A7FD0', '#D08040', '#8E73C4', '#3F96A3'];

function rtSelected_(){
  var gs = rtGroups_();
  var on = gs.filter(function(g){ return RT_SEL[g.who]; });
  if(!on.length && gs.length) on = [gs[0]];
  return on;
}
function rtStops_(g){
  return psOrdered_(g.rows).map(function(r){
    var key = rtKey_(r.client);
    var m = /^(.{2,3}[市縣])(.+)$/.exec(key) || ['', '', key];
    var cty = m[1];
    return { r: r, c: r.client, key: key, cty: cty, town: m[2],
             far: (cty && cty !== '台中市') ? cty.replace(/[市縣]$/, '') : '',
             addr: psAddrRaw_(r.client), short: psAddrShort_(r.client) };
  });
}
/* 哪些鄉鎮有兩個以上的人要去。這就是他要的「重疊或在附近」。
   ⚠ 比的是**同一個鄉鎮**，不是半徑幾公里——隔壁鄉鎮其實很近也不會被抓出來。 */
function rtOverlap_(sel){
  var by = {};
  sel.forEach(function(g){
    rtStops_(g).forEach(function(st){
      if(!st.key) return;
      (by[st.key] = by[st.key] || []).push({ who: g.who, s: st });
    });
  });
  return Object.keys(by).map(function(k){
    var who = {};
    by[k].forEach(function(x){ who[x.who] = (who[x.who] || 0) + 1; });
    return { key: k, town: by[k][0].s.town, far: by[k][0].s.far,
             who: who, n: Object.keys(who).length, stops: by[k] };
  }).filter(function(x){ return x.n >= 2; })
    .sort(function(a, b){ return b.stops.length - a.stops.length; });
}

/* ══ 地圖：真的縣市輪廓，可以兩指縮放、一指拖移 ═══════════════════
   ⛔ 分兩層畫：輪廓那層只在換人的時候重畫，縮放時**只重畫上面那層**
      （點、線、字）。368 個鄉鎮路徑每一幀重畫會卡。
   ⛔ 輪廓用 vector-effect="non-scaling-stroke"，放大之後線才不會變粗。 */
var RT_AR_ = 108 / 100;        // 高 ÷ 寬，跟 CSS 的 aspect-ratio 要一致
var RT_VB = null;              // 現在看到的範圍 {x,y,w,h}，單位公里
var RT_FITW = 0;               // 「看全部」時的寬度——用來判斷現在是不是放大狀態
var RT_NOW = [];               // 現在選到的人，縮放時重畫要用

function rtFit_(sel){
  var xs = [], ys = [];
  sel.forEach(function(g){
    rtStops_(g).forEach(function(st){
      var p = rtPos_(st.key); if(p){ xs.push(p[0]); ys.push(p[1]); } }); });
  if(!xs.length) return { x: -60, y: -125, w: 160, h: 160 * RT_AR_ };
  var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
  var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
  var w = Math.max(x1 - x0, 10), hh = Math.max(y1 - y0, 10);
  var pad = Math.max(w, hh) * 0.18 + 5;
  w += pad * 2; hh += pad * 2;
  if(hh / w < RT_AR_) hh = w * RT_AR_; else w = hh / RT_AR_;
  return { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - hh / 2, w: w, h: hh };
}

/* 輪廓層：全台縣市 ＋ 這次會去到的那幾個縣市的鄉鎮界 */
function rtBase_(sel){
  if(!TWM_) return '';
  var ctys = {};
  sel.forEach(function(g){ rtStops_(g).forEach(function(st){
    if(st.cty) ctys[st.cty] = 1; }); });
  var h = '';
  Object.keys(TWM_.t).forEach(function(k){
    if(!ctys[k.slice(0, 3)]) return;
    h += '<path d="' + TWM_.t[k] + '" class="tw"/>';
  });
  Object.keys(TWM_.c).forEach(function(k){
    h += '<path d="' + TWM_.c[k] + '" class="cw"/>';
  });
  return h;
}

/* 點、線、字。縮放時只重畫這一層，字跟點的大小跟著縮放補回去 → 螢幕上大小固定。 */
function rtOver_(sel){
  if(!TWM_ || !RT_VB) return '';
  var one = (sel.length === 1), vb = RT_VB;
  var fs = vb.w / 26, rr = vb.w / 42;
  var hits = {};
  rtOverlap_(sel).forEach(function(o){ hits[o.key] = o.n; });

  var h = '';
  Object.keys(hits).forEach(function(k){
    var p = rtPos_(k); if(!p) return;
    h += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + (rr * 3).toFixed(2) +
      '" fill="currentColor" fill-opacity=".13"/>';
  });

  sel.forEach(function(g, gi){
    var col = one ? null : RT_COL_[gi % RT_COL_.length];
    /* ⛔ 同一個鄉鎮有好幾站的話，點會完全重疊、號碼看不到。
       沿著一個小圈把它們散開——散開是「這裡有好幾站」的意思，
       不是真的位置（本來也只精確到鄉鎮）。 */
    var nSame = {};
    rtStops_(g).forEach(function(st){ nSame[st.key] = (nSame[st.key] || 0) + 1; });
    var iSame = {};
    var pts = rtStops_(g).map(function(st){
      var p = rtPos_(st.key);
      if(!p) return null;
      var n = nSame[st.key], x = p[0], y = p[1];
      if(n > 1){
        var k = iSame[st.key] = (iSame[st.key] || 0);
        iSame[st.key]++;
        var a = (k / n) * Math.PI * 2 - Math.PI / 2;
        x += Math.cos(a) * rr * 1.9; y += Math.sin(a) * rr * 1.9;
      }
      return { x: x, y: y, st: st };
    }).filter(function(x){ return x; });
    if(pts.length > 1){
      h += '<path d="' + pts.map(function(p, i){
          return (i ? 'L' : 'M') + p.x + ' ' + p.y; }).join(' ') +
        '" fill="none" stroke="' + (col || 'var(--fill)') + '" stroke-opacity="' +
        (one ? '.8' : '.8') + '" stroke-width="' + (rr * 0.5).toFixed(2) +
        '" stroke-dasharray="' + (rr * 1.1).toFixed(2) + ' ' + (rr * 0.8).toFixed(2) + '"/>';
    }
    pts.forEach(function(p, i){
      var fill = one
        ? (p.st.far ? 'var(--bad-ink)'
             : ({ '上午':'var(--warn-fill)', '下午':'var(--info-ink)' }[psZoneOf_(p.st.r)]
                || 'var(--fill)'))
        : col;
      /* ⛔ 多選的時候也要印 1234（牟佑彬 2026-10-04 特別交代）。
         所以點不能縮小——縮小了數字就擠不進去。 */
      h += '<circle cx="' + p.x + '" cy="' + p.y + '" r="' + (rr * 1.5).toFixed(2) +
        '" fill="' + fill + '" stroke="#fff" stroke-opacity=".85" stroke-width="' +
        (rr * 0.22).toFixed(2) + '"/>' +
        '<text x="' + p.x + '" y="' + (p.y + fs * 0.33).toFixed(1) +
          '" text-anchor="middle" font-size="' + (fs * 0.86).toFixed(2) +
          '" font-weight="800" fill="#fff">' + (i + 1) + '</text>';
    });
  });

  /* 鄉鎮名只寫一次，不然多人疊起來會糊成一團 */
  /* ⛔ 擠在一起的鄉鎮名先不寫——寫了會糊成一團，反而什麼都看不到。
     放大之後距離拉開，名字自己就會出現（每次縮放都重算）。
     ⚠ 有重疊的那幾個鄉鎮**一定要寫**，那是這一頁的重點。 */
  var named = {}, put = [];
  function room_(x, y, must){
    if(must) return true;
    for(var i = 0; i < put.length; i++){
      if(Math.abs(put[i][0] - x) < fs * 2.6 && Math.abs(put[i][1] - y) < fs * 1.25)
        return false;
    }
    return true;
  }
  sel.forEach(function(g){
    rtStops_(g).forEach(function(st){
      if(!st.key || named[st.key]) return;
      var p = rtPos_(st.key); if(!p) return;
      var ly = p[1] - rr * 2;
      if(!room_(p[0], ly, !!hits[st.key])) return;
      put.push([p[0], ly]);
      named[st.key] = 1;
      h += '<text x="' + p[0] + '" y="' + (p[1] - rr * 2).toFixed(1) +
        '" text-anchor="middle" font-size="' + fs.toFixed(2) + '" font-weight="' +
        (hits[st.key] ? '800' : '700') + '" fill="currentColor" opacity="' +
        (hits[st.key] ? '1' : '.75') + '" paint-order="stroke" stroke="var(--card)" ' +
        'stroke-width="' + (fs * 0.26).toFixed(2) + '" stroke-linejoin="round">' +
        esc(st.town) + '</text>';
    });
  });
  return h;
}

/* 沒有座標的停靠點（名冊沒地址、或鄉鎮名怪怪的）要講出來，不可以安靜不畫。 */
function rtNoPos_(sel){
  var bad = [];
  sel.forEach(function(g){ rtStops_(g).forEach(function(st){
    if(!rtPos_(st.key)) bad.push(st.c); }); });
  return bad;
}

/* ⛔ 一根手指在沒放大的時候要**讓頁面照常上下捲**，不然圖佔掉大半個畫面、
   手指放上去就捲不動（touch-action:none 會把捲動整個吃掉）。
   放大之後才改成一根手指平移——那時候他要的是移動地圖，不是捲頁面。 */
function rtZoomed_(){ return !!(RT_VB && RT_FITW && RT_VB.w < RT_FITW * 0.98); }
function rtMark_(){
  var box = document.querySelector('#p-ps3 .rtmap');
  if(box) box.classList.toggle('z', rtZoomed_());
}

function rtPaintOver_(){
  var g = document.querySelector('#p-ps3 .rtsvg .ov');
  if(g) g.innerHTML = rtOver_(RT_NOW);
}
function rtApplyVB_(){
  var svg = document.querySelector('#p-ps3 .rtsvg');
  if(!svg || !RT_VB) return;
  svg.setAttribute('viewBox', RT_VB.x.toFixed(2) + ' ' + RT_VB.y.toFixed(2) + ' ' +
    RT_VB.w.toFixed(2) + ' ' + RT_VB.h.toFixed(2));
  rtMark_();
  rtPaintOver_();
}
/* 縮放。f 是倍率，(cx,cy) 是螢幕上的焦點（公里座標），焦點要固定不動。 */
var RT_MINW_ = 3;
var RT_MAXW_ = 460;
function rtZoom_(f, cx, cy){
  if(!RT_VB) return;
  var w = Math.min(RT_MAXW_, Math.max(RT_MINW_, RT_VB.w / f));
  f = RT_VB.w / w;
  var hh = w * RT_AR_;
  RT_VB = { x: cx - (cx - RT_VB.x) / f, y: cy - (cy - RT_VB.y) / f, w: w, h: hh };
  rtApplyVB_();
}

/* ＋ 要往**有行程的地方**放大，不是往畫面正中央。
   ⛔ 中部一天的行程常常擠在北邊，正中央可能是山區——往那裡放大等於什麼都看不到。
   取停靠點的中位數（不是平均），這樣一個很遠的點不會把焦點拉走。 */
function rtFocus_(){
  var xs = [], ys = [];
  RT_NOW.forEach(function(g){ rtStops_(g).forEach(function(st){
    var p = rtPos_(st.key); if(p){ xs.push(p[0]); ys.push(p[1]); } }); });
  if(!xs.length || !RT_VB) return { x: RT_VB ? RT_VB.x + RT_VB.w / 2 : 0,
                                    y: RT_VB ? RT_VB.y + RT_VB.h / 2 : 0 };
  xs.sort(function(a, b){ return a - b; });
  ys.sort(function(a, b){ return a - b; });
  var mx = xs[xs.length >> 1], my = ys[ys.length >> 1];
  /* 焦點不在畫面裡的話（他已經拖到別的地方）就照畫面中央，不要硬把他拉回去 */
  if(mx < RT_VB.x || mx > RT_VB.x + RT_VB.w || my < RT_VB.y || my > RT_VB.y + RT_VB.h)
    return { x: RT_VB.x + RT_VB.w / 2, y: RT_VB.y + RT_VB.h / 2 };
  return { x: mx, y: my };
}

function rtBind_(){
  var box = document.querySelector('#p-ps3 .rtmap');
  if(!box || box._rtb) return;
  box._rtb = 1;
  var svg = box.querySelector('.rtsvg');
  function km(cx, cy){
    var r = svg.getBoundingClientRect();
    return { x: RT_VB.x + (cx - r.left) / r.width * RT_VB.w,
             y: RT_VB.y + (cy - r.top) / r.height * RT_VB.h };
  }
  function gap(t){
    return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }
  var st = null, raf = 0;
  function paint(){ if(raf) return; raf = requestAnimationFrame(function(){
    raf = 0; rtApplyVB_(); }); }

  box.addEventListener('touchstart', function(e){
    if(!RT_VB) return;
    if(e.touches.length === 1){
      /* 沒放大就不接管——讓頁面自己捲 */
      st = rtZoomed_()
        ? { m: 1, x: e.touches[0].clientX, y: e.touches[0].clientY,
            vb: { x: RT_VB.x, y: RT_VB.y, w: RT_VB.w, h: RT_VB.h } }
        : null;
    } else if(e.touches.length === 2){
      var mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      var my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      st = { m: 2, d: gap(e.touches), c: km(mx, my), mx: mx, my: my,
             vb: { x: RT_VB.x, y: RT_VB.y, w: RT_VB.w, h: RT_VB.h } };
    }
  }, { passive: true });

  box.addEventListener('touchmove', function(e){
    if(!st || !RT_VB) return;
    var r = svg.getBoundingClientRect();
    if(st.m === 1 && e.touches.length === 1){
      e.preventDefault();
      RT_VB = { x: st.vb.x - (e.touches[0].clientX - st.x) / r.width * st.vb.w,
                y: st.vb.y - (e.touches[0].clientY - st.y) / r.height * st.vb.h,
                w: st.vb.w, h: st.vb.h };
      paint();
    } else if(st.m === 2 && e.touches.length === 2){
      e.preventDefault();
      var f = gap(e.touches) / (st.d || 1);
      var w = Math.min(RT_MAXW_, Math.max(RT_MINW_, st.vb.w / f));
      var hh = w * RT_AR_;
      /* 焦點（兩指中間）在螢幕上的比例固定 → 那個點就不會跑掉 */
      var px = (st.mx - r.left) / r.width, py = (st.my - r.top) / r.height;
      RT_VB = { x: st.c.x - px * w, y: st.c.y - py * hh, w: w, h: hh };
      paint();
    }
  }, { passive: false });

  box.addEventListener('touchend', function(){ st = null; });
  box.addEventListener('touchcancel', function(){ st = null; });

  /* 桌機：滾輪縮放、拖曳平移（驗證用，手機不會走到這裡） */
  box.addEventListener('wheel', function(e){
    if(!RT_VB) return;
    e.preventDefault();
    var c = km(e.clientX, e.clientY);
    rtZoom_(e.deltaY < 0 ? 1.18 : 1 / 1.18, c.x, c.y);
  }, { passive: false });
  box.addEventListener('mousedown', function(e){
    if(!RT_VB || e.target.closest('button')) return;
    var sx = e.clientX, sy = e.clientY;
    var vb = { x: RT_VB.x, y: RT_VB.y, w: RT_VB.w, h: RT_VB.h };
    var r = svg.getBoundingClientRect();
    function mm(ev){
      RT_VB = { x: vb.x - (ev.clientX - sx) / r.width * vb.w,
                y: vb.y - (ev.clientY - sy) / r.height * vb.h, w: vb.w, h: vb.h };
      paint();
    }
    function mu(){ document.removeEventListener('mousemove', mm);
      document.removeEventListener('mouseup', mu); }
    document.addEventListener('mousemove', mm);
    document.addEventListener('mouseup', mu);
  });

  box.addEventListener('click', function(e){
    var b = e.target.closest('[data-rz]'); if(!b || !RT_VB) return;
    var z = b.dataset.rz;
    if(z === 'fit'){ RT_VB = rtFit_(RT_NOW); RT_FITW = RT_VB.w; rtApplyVB_(); return; }
    rtZoom_(z === 'in' ? 1.6 : 1 / 1.6, rtFocus_().x, rtFocus_().y);
  });
}

/* 畫整張圖。sel 換了才呼叫——縮放只走 rtApplyVB_。 */
function rtPaint_(sel){
  RT_NOW = sel;
  var svg = document.querySelector('#p-ps3 .rtsvg');
  if(!svg) return;
  /* ⛔ 地圖資料還沒到的時候**不可以**把 .rtmap 的內容換掉——
     svg 一旦被刪，資料到了也沒有東西可以畫（2026-10-04 實測踩到）。
     改成蓋一張紙在上面，載到了再把紙拿掉。 */
  var box = document.querySelector('#p-ps3 .rtmap');
  var veil = box && box.querySelector('.rtfail');
  if(!TWM_){
    if(box && !veil){
      veil = document.createElement('div');
      veil.className = 'rtfail';
      box.appendChild(veil);
    }
    if(veil) veil.textContent = TWM_ERR_
      ? '地圖載不到（可能是沒有網路），下面的清單還是可以用' : '地圖載入中…';
    return;
  }
  if(veil) veil.parentNode.removeChild(veil);
  RT_VB = rtFit_(sel);
  RT_FITW = RT_VB.w;
  svg.querySelector('.bs').innerHTML = rtBase_(sel);
  rtApplyVB_();
  rtBind_();
}

/* ⛔ 不給 origin → Google 從**現在的位置**開始導（他 2026-10-04 交代的）。 */
function rtGmap_(stops){
  var full = stops.map(function(x){ return x.addr || x.c; })
    .filter(function(x){ return x; });
  if(!full.length) return '';
  var use = full.slice(0, 10);            // 終點 ＋ 最多 9 個中途點
  var dest = use[use.length - 1];
  var way = use.slice(0, -1);
  return 'https://www.google.com/maps/dir/?api=1' +
    '&destination=' + encodeURIComponent(dest) +
    (way.length ? '&waypoints=' + way.map(encodeURIComponent).join('%7C') : '') +
    '&travelmode=driving';
}

function drawRT(){
  var box = $('p-ps3'); if(!box) return;
  var gs = rtGroups_();
  var h = psHead_();
  if(!gs.length){
    box.innerHTML = h + '<div class="mid" style="padding:30px">' +
      '這一天還沒有配好人的行程</div>';
    return;
  }
  var sel = rtSelected_();
  var onName = {};
  sel.forEach(function(g, i){ onName[g.who] = RT_COL_[i % RT_COL_.length]; });

  h += '<div class="rtwho">' + gs.map(function(x){
    var on = !!onName[x.who];
    return '<button type="button" data-rt="who" data-who="' + esc(x.who) + '"' +
      (on ? ' class="on"' : '') +
      (on && sel.length > 1 ? ' style="background:' + onName[x.who] +
        ';border-color:' + onName[x.who] + '"' : '') + '>' +
      esc(x.who) + '<s>' + x.rows.length + '</s></button>'; }).join('') +
    (sel.length > 1
      ? '<button type="button" data-rt="clear" class="cl">只看一個</button>' : '') +
    '</div>';
  h += '<p class="rthint">' + (sel.length > 1
    ? '點名字可以多選，路線會疊在一起看'
    : '點第二個名字，就能看兩個人的路線有沒有重疊') + '</p>';

  /* ⛔ 骨架先放著，實際的圖在 box.innerHTML 之後由 rtPaint_ 填——
     地圖資料是用到才載的，這裡可能還沒到。 */
  var np = rtNoPos_(sel);
  h += '<div class="rtmap"><svg class="rtsvg" role="img" aria-label="' +
    esc(sel.map(function(g){ return g.who; }).join('、')) + ' 那天要跑的地方">' +
    '<g class="bs"></g><g class="ov"></g></svg>' +
    '<div class="rtz"><button type="button" data-rz="in" aria-label="放大">＋</button>' +
    '<button type="button" data-rz="out" aria-label="縮小">−</button>' +
    '<button type="button" data-rz="fit" class="f">看全部</button></div>' +
    '<div class="rtnote">兩指可以縮放、一指可以拖　·　點標在鄉鎮的中心，不是門牌' +
    (np.length ? '　·　' + np.length + ' 家沒有地址，圖上沒有畫（' +
      esc(np.slice(0, 3).join('、')) + (np.length > 3 ? '…' : '') + '）' : '') +
    '</div></div>';

  if(sel.length === 1){
    /* ── 一個人：照 1234 的停靠清單 ── */
    var g = sel[0], stops = rtStops_(g);
    h += '<div class="rtlist"><div class="rth">停靠順序<s>' + stops.length + ' 站</s></div>';
    var far = 0, back = 0;
    stops.forEach(function(st, i){
      if(i){
        var prev = stops[i-1];
        var cross = prev.cty !== st.cty;
        if(cross) far++;
        var dk = rtDist_(prev.key, st.key);
        h += '<div class="rthop' + (cross ? ' far' : '') + '">↓　' +
          esc(prev.town || '？') + ' → ' + esc(st.town || '？') +
          (prev.key && prev.key === st.key ? '　同一區'
            : dk ? '　約 ' + (dk < 10 ? dk.toFixed(1) : Math.round(dk)) + ' 公里' : '') +
          (cross ? '　跨縣市' : '') + '</div>';
      }
      var z = psZoneOf_(st.r);
      var zc = (z === '上午') ? 'zam' : (z === '下午') ? 'zpm' : 'zfx';
      h += '<div class="rtst ' + zc + '">' +
        '<span class="no">' + (i+1) + '</span>' +
        '<span class="bd"><span class="c">' + esc(st.c) + '</span>' +
        '<span class="a">' + (st.short || '<i class="non">名冊上沒有地址</i>') +
        '</span></span>' +
        '<span class="sl">' + esc(st.r.slot || '不壓') + '</span></div>';
    });
    var tot = 0;
    for(var k = 1; k < stops.length; k++) tot += rtDist_(stops[k-1].key, stops[k].key);
    for(var k2 = 2; k2 < stops.length; k2++){
      var d0 = rtDist_(stops[k2-2].key, stops[k2].key);
      var d1 = rtDist_(stops[k2-2].key, stops[k2-1].key);
      if(d1 > 0 && d0 < d1 * 0.6) back++;
    }
    /* ⛔ 只寫「直線」。鄉鎮中心對鄉鎮中心，實際開車一定更遠，不要給分鐘數。 */
    h += '</div><div class="rtsum"><b>' + esc(g.who) + '</b> 這一天 ' +
      stops.length + ' 站' +
      (tot ? '　·　直線約 ' + Math.round(tot) + ' 公里' : '') +
      (far ? '　·　<span class="w">跨縣市 ' + far + ' 次</span>' : '　·　都在同一個縣市') +
      (back ? '　·　<span class="w">看起來有 ' + back + ' 段折回頭</span>'
            : '　·　路線沒有明顯折返') + '</div>';
    var u = rtGmap_(stops);
    if(u) h += '<a class="rtgo" href="' + esc(u) + '" target="_blank" rel="noopener">' +
      (stops.length > 10 ? '用 Google 地圖導前 10 站' : '用 Google 地圖導這條路線') +
      '　›</a><div class="rtfoot">從你現在的位置開始導，' +
      (stops.length > 10 ? '超過 10 站要分兩段' : '照上面的順序走') + '</div>';
  } else {
    /* ── 多人：重點是哪幾個鄉鎮兩個人都要去 ── */
    var ov = rtOverlap_(sel);
    h += '<div class="rtlist"><div class="rth">同一天都要去的地方<s>' +
      ov.length + ' 個鄉鎮</s></div>';
    if(!ov.length){
      h += '<div class="rtnone">這幾位的路線沒有重疊的鄉鎮。' +
        '<s>（「在附近」目前只能比到鄉鎮，系統沒有真的距離）</s></div>';
    }
    ov.forEach(function(o){
      h += '<div class="rtov"><div class="t">' + esc(o.town) +
        (o.far ? '<b class="far">' + esc(o.far) + '</b>' : '') +
        '<s>' + o.n + ' 個人</s></div>' +
        o.stops.map(function(x){
          return '<div class="r"><i style="background:' +
            (onName[x.who] || 'var(--ink3)') + '"></i>' +
            '<b>' + esc(x.who) + '</b>' +
            '<span>' + esc(x.s.c) + '</span>' +
            '<u>' + esc(x.s.r.slot || '不壓') + '</u></div>'; }).join('') +
        '</div>';
    });
    h += '</div>';
    h += '<div class="rtsum">' + sel.map(function(g, i){
      return '<span class="pp"><i style="background:' +
        RT_COL_[i % RT_COL_.length] + '"></i>' + esc(g.who) +
        ' ' + g.rows.length + ' 站</span>'; }).join('') +
      (ov.length ? '　·　<span class="w">' + ov.length +
        ' 個鄉鎮兩個人都要去——看看能不能併給同一個人</span>' : '') + '</div>';
  }
  box.innerHTML = h;
  rtPaint_(sel);
}

function loadRT(){
  /* 地圖資料跟行程資料同時開始抓，誰先到都不影響另一邊。 */
  twLoad_(function(){ if($('p-ps3') && $('p-ps3').innerHTML) drawRT(); });
  if(!PS_DAY) PS_DAY = psTomorrow_();
  var m = PS_DAY.slice(0, 7);
  if(CAL_CACHE[m] && (Date.now() - (CAL_CACHE_AT[m] || 0)) <= CAL_TTL){
    calMerge([m]); drawRT(); return;
  }
  loadPS('ps1');
  setTimeout(drawRT, 1200);
}

document.addEventListener('click', function(e){
  var b = e.target.closest && e.target.closest('[data-rt]');
  if(!b || !b.closest('#p-ps3')) return;
  if(b.dataset.rt === 'clear'){ RT_SEL = {}; drawRT(); return; }
  var w = b.dataset.who;
  /* 點一下加進來、再點一下拿掉。⚠ 全部取消的話回到只看第一個，
     不要讓畫面變空白（那看起來像壞掉）。 */
  if(RT_SEL[w]) delete RT_SEL[w]; else RT_SEL[w] = 1;
  drawRT();
}, false);

function loadOrder(){
  var box = $('p-order'), keep = dpSnap();
  var own = PRESETS.filter(function(c){ return ADMIN_OF[c.c] === STAFF_NAME; });
  var pool = (DP_MINEONLY && own.length) ? own : PRESETS;
  if(!pool.length) pool = PRESETS;
  if(!pool.some(function(c){ return c.c === DP_CLI; })) DP_CLI = pool.length ? pool[0].c : '';
  var c = PRESETS.filter(function(x){ return x.c === DP_CLI; })[0];
  var ts = dpLive().filter(function(r){ return r.client === DP_CLI; });

  var h = '<div class="dpbar"><label class="dplb">客戶</label><select id="dpCli">'+
    pool.map(function(x){
      var n = dpLive().filter(function(y){ return y.client===x.c && !y.crew; }).length;
      return '<option value="'+esc(x.c)+'"'+(x.c===DP_CLI?' selected':'')+'>'+
        esc(x.c)+(n?('（待確認 '+n+'）'):'')+'</option>';
    }).join('')+'</select>'+
    (own.length?'<button type="button" class="dpsm" id="dpTgl">'+
      (DP_MINEONLY?('只看我的 '+own.length+' 家'):('全部 '+PRESETS.length+' 家'))+
      '</button>':'')+'</div>';
  if(!own.length) h += '<p class="dpnote">「行政負責客戶」那張表還沒填，'+
    '所以先顯示全部 '+PRESETS.length+' 家。</p>';
  if(c) h += '<p class="dpnote">'+esc(c.p||'（名冊沒有地址）')+
    '　·　'+((c.w&&c.w.length)||0)+' 位移工</p>';

  h += dpGroup('還沒確認', ts.filter(function(r){ return !r.crew && r.status==='預排'; }), 'a');
  h += dpGroup('特助確認了', ts.filter(function(r){ return r.crew && r.status==='預排'; }), '');
  h += dpGroup('做完了', ts.filter(function(r){ return r.status==='已完成'; }), 'g');
  if(!ts.length) h += '<p class="mid" style="padding:18px">這家目前沒有待辦</p>';

  if(c){
    var cats = (TAX && TAX.cats) || [];
    h += '<div class="dpform"><div class="dphd">開一筆新的</div>'+
      '<div class="dpr"><label class="dplb">服務類別</label><select id="dpB">'+
      cats.map(function(x,i){ return '<option value="'+i+'">'+esc(x.b)+'</option>'; }).join('')+
      '</select><label class="dplb">事由</label><select id="dpS"></select></div>'+
      '<div class="dpr"><label class="dplb">語別</label><select id="dpL">'+
      '<option value="">不用翻譯</option>'+
      ((TAX&&TAX.langs)||[]).map(function(l){ return '<option>'+esc(l)+'</option>'; }).join('')+
      '</select><label class="dplb">急迫度</label><select id="dpU">'+
      '<option value="dated">壓日期</option><option value="urgent">壓時間</option>'+
      '<option value="loose">不急</option></select>'+
      '<input type="date" id="dpD"><input type="text" id="dpT" placeholder="09:00" '+
      'style="display:none;max-width:96px"></div>'+
      '<div class="dpr"><input type="text" id="dpM" placeholder="備註：找誰、要注意什麼…"></div>'+
      /* 語別與建議翻譯**雙向連動**（牟佑彬 2026-10-01）。
         ⛔ 以前兩個欄位互不相干：選了佑彬（英）語別還停在「越」，
            **兩邊不一致而且沒有任何地方會發現**。
         ⚠ 語別不符的只是**變淡，還是點得下去**——有時候真的要找代打。
            擋死的話實務上會被繞過（行政改成不填語別），反而更糟。 */
      '<div class="dpr"><label class="dplb">建議誰去</label><div class="dpsug">'+
      CREW.map(function(n){
        var lg = dpCrewLang(n), want = ($('dpL')||{}).value || '';
        /* 阿源是外務、沒有語別，任何語別都不該把他變淡 */
        var dim = want && lg && lg !== want;
        return '<button type="button" class="dpp'+(DP_SUG===n?' on':'')+
          (dim?' dim':'')+'" data-p="'+esc(n)+'">'+esc(n)+
          '<s>'+(lg||'外務')+'</s></button>';
      }).join('')+'</div></div>'+
      /* 交代事項：選了服務細項會自動帶出那個細項的「處理經過」，
         行政刪掉用不到的、補上這一家特別的。
         ⛔ 這些預設值就是翻譯填服務紀錄時的處理經過選項（fillOpts 用的同一份），
            **不是另外維護一套**。 */
      '<div class="dpr" style="display:block"><label class="dplb">'+
      '交代事項（翻譯到現場一條一條勾）</label>'+
      '<div id="dpTodo"></div>'+
      '<button type="button" class="tdadd" id="dpTodoAdd">＋ 再加一條</button></div>'+
      '<div class="dpr"><span class="dpnote">留空就是交給特助配</span>'+
      '<button type="button" class="dpgo" id="dpSave">存檔</button></div></div>';
  }
  box.innerHTML = h;

  var sel = $('dpCli');
  if(sel) sel.onchange = function(){
    DP_CLI = this.value; DP_SUG = null;
    var bx = $('dpTodo'); if(bx) bx.dataset.touched = '';   // 換客戶＝重新帶預設
    loadOrder(); };
  var tg = $('dpTgl');
  if(tg) tg.onclick = function(){ DP_MINEONLY = !DP_MINEONLY; loadOrder(); };
  [].forEach.call(box.querySelectorAll('.dpp'), function(b){
    b.onclick = function(){
      DP_SUG = (DP_SUG===b.dataset.p)?null:b.dataset.p;
      /* 選了人 → 語別跟著變成他的語別。
         ⛔ 外務（阿源）沒有語別，**不要把語別清空**——
            那會把行政剛選好的語別洗掉。 */
      if(DP_SUG){
        var lg = dpCrewLang(DP_SUG);
        if(lg && $('dpL')) $('dpL').value = lg;
      }
      loadOrder();
    };
  });
  /* 反方向：改語別 → 重畫人選（不符的變淡）。
     ⚠ 如果目前選的人語別不符，不要自動取消他——行政可能是刻意找代打的。 */
  bindEdit(box);
  var lsel = $('dpL');
  if(lsel) lsel.onchange = function(){ loadOrder(); };
  var nb = $('dpB');
  if(nb){
    var fillSub = function(){
      var cat = ((TAX&&TAX.cats)||[])[+nb.value] || { s:[] };
      $('dpS').innerHTML = (cat.s||[]).map(function(x){
        return '<option>'+esc(x.n)+'</option>'; }).join('');
    };
    nb.onchange = function(){ fillSub(); dpTodoDefaults(); };
    fillSub();
    $('dpS').addEventListener('change', dpTodoDefaults);
    dpTodoDefaults();
    var ta = $('dpTodoAdd');
    if(ta) ta.onclick = function(){
      var bx = $('dpTodo'); if(bx) bx.dataset.touched = '1';
      dpTodoAdd(''); };
    $('dpD').value = dpTomorrow();
    $('dpU').onchange = function(){
      $('dpT').style.display = (this.value==='urgent')?'':'none';
      /* 不急的往後兩週——不要卡在明天那一頁擋住真正急的事。 */
      $('dpD').value = (this.value==='loose') ? dpPlus(dpTomorrow(),13) : dpTomorrow();
    };
    $('dpSave').onclick = dpSave;
    dpRestore(keep);
  }
}
/* 行政改單的面板。
   ⚠ 直接長在卡片上面，不另外開一頁——行政是在「哪一筆」的脈絡下改的，
     跳頁會失去那個脈絡。
   ⚠ 只放會改的那幾格。客戶不給改：換客戶等於換一筆單，
     應該取消重開，不然這家客戶的待辦統計全部會錯。 */
var DP_EDIT = null;
/* 兩個面板都會畫出「改」，綁定寫一次就好。
   ⚠ 每次重畫 innerHTML 之後都要再綁一次——舊的 onclick 跟著舊節點消失了。 */
function bindEdit(pane){
  if(!pane) return;
  [].forEach.call(pane.querySelectorAll('[data-edit]'), function(b){
    b.onclick = function(){ dpEditOpen(b.dataset.edit); };
  });
}
function dpEditOpen(id){
  var r = CAL_ROWS.filter(function(x){ return x.id===id; })[0];
  if(!r) return;
  [].forEach.call(document.querySelectorAll('.dpedit'), function(x){
    x.parentNode.removeChild(x); });
  if(DP_EDIT === id){ DP_EDIT = null; return; }     // 再按一次就收起來
  DP_EDIT = id;
  var cats = (TAX && TAX.cats) || [];
  var bi = 0;
  cats.forEach(function(c,i){ if(c.b === r.big) bi = i; });
  var box = document.createElement('div');
  box.className = 'dpedit';
  box.innerHTML =
    '<div class="dphd">改這一筆　'+esc(r.client)+'</div>'+
    (r.crew ? '<div class="dpalert"><b>這一筆特助已經確認了</b>'+
      '<s>改完會退回待確認，'+esc(r.crew)+' 手機上會變回灰色預排並收到通知，'+
      '要等特助再確認一次。</s></div>' : '')+
    '<div class="dpr"><label class="dplb">服務類別</label>'+
      '<select data-f="big">'+cats.map(function(c,i){
        return '<option value="'+i+'"'+(i===bi?' selected':'')+'>'+esc(c.b)+'</option>';
      }).join('')+'</select>'+
      '<label class="dplb">事由</label><select data-f="sub"></select></div>'+
    '<div class="dpr"><label class="dplb">語別</label>'+
      '<select data-f="lang"><option value="">不用翻譯</option>'+
      ((TAX&&TAX.langs)||[]).map(function(l){
        return '<option'+(l===r.lang?' selected':'')+'>'+esc(l)+'</option>'; }).join('')+
      '</select>'+
      '<input type="date" data-f="date" value="'+esc(r.date||'')+'">'+
      '<input type="text" data-f="slot" placeholder="時段 09:00" '+
      'style="max-width:96px" value="'+esc(r.slot||'')+'"></div>'+
    '<div class="dpr"><input type="text" data-f="memo" placeholder="備註" '+
      'value="'+esc(r.memo||'')+'"></div>'+
    '<div class="dpr"><label class="dplb">建議誰去</label><div class="dpsug">'+
      CREW.map(function(n){
        var lg = dpCrewLang(n), want = r.lang || '';
        var dim = want && lg && lg !== want;
        return '<button type="button" class="dpp'+((r.crew||r.sug)===n?' on':'')+
          (dim?' dim':'')+'" data-ep="'+esc(n)+'">'+esc(n)+
          '<s>'+(lg||'外務')+'</s></button>';
      }).join('')+'</div></div>'+
    '<div class="dpr"><label class="dplb">跟他說一聲（可以不填）</label>'+
      '<input type="text" data-f="why" maxlength="60" placeholder="例如：客戶改時間"></div>'+
    '<div class="cfbt"><button type="button" class="dpsm" data-ecancel="1">算了</button>'+
      '<button type="button" class="dpgo sm" data-esave="'+esc(id)+'">存檔</button></div>';
  var card = document.querySelector('[data-edit="'+esc(id)+'"]');
  var anchor = card ? card.closest('.dpcd') : null;
  if(!anchor) { DP_EDIT = null; return; }
  anchor.parentNode.insertBefore(box, anchor);

  var bsel = box.querySelector('[data-f="big"]');
  var ssel = box.querySelector('[data-f="sub"]');
  var fillSub = function(keep){
    var cat = cats[+bsel.value] || { s: [] };
    ssel.innerHTML = (cat.s||[]).map(function(x){
      return '<option'+(keep && x.n===keep ? ' selected' : '')+'>'+esc(x.n)+'</option>';
    }).join('');
  };
  fillSub(r.sub);
  bsel.onchange = function(){ fillSub(''); };
  var pick = (r.crew || r.sug || '');
  [].forEach.call(box.querySelectorAll('[data-ep]'), function(b){
    b.onclick = function(){
      pick = (pick === b.dataset.ep) ? '' : b.dataset.ep;
      [].forEach.call(box.querySelectorAll('[data-ep]'), function(x){
        x.classList.toggle('on', x.dataset.ep === pick); });
    };
  });
  box.querySelector('[data-ecancel]').onclick = function(){
    DP_EDIT = null; box.parentNode.removeChild(box); };
  box.querySelector('[data-esave]').onclick = function(){
    var g = function(f){ var el = box.querySelector('[data-f="'+f+'"]');
      return el ? el.value.trim() : ''; };
    var btn = box.querySelector('[data-esave]');
    btn.disabled = true; btn.textContent = '存檔中…';
    google.script.run
      .withSuccessHandler(function(res){
        DP_EDIT = null;
        toast(r.client + '　改好了' +
          (res && res.back ? '　已退回待確認' + (res.who ? ('，已通知 '+res.who) : '') : ''));
        calBust(); loadCal(null, true);
      })
      .withFailureHandler(function(e){
        btn.disabled = false; btn.textContent = '存檔'; toast(e.message, true); })
      .updateSchedule(CODE, id, {
        date: g('date'), slot: g('slot'), lang: g('lang'),
        big: (cats[+bsel.value]||{}).b || '', sub: ssel.value,
        topic: ((cats[+bsel.value]||{}).b || '') + ' ／ ' + ssel.value,
        memo: g('memo'), sug: pick, why: g('why')
      });
  };
}

/* ── 行政端的交代事項輸入 ──────────────────────────── */
function dpTodoRows(){
  return [].map.call(($('dpTodo')||{children:[]}).children, function(r){
    return (r.querySelector('input')||{}).value || ''; })
    .map(function(v){ return v.trim(); }).filter(String);
}
function dpTodoAdd(v){
  var box = $('dpTodo'); if(!box) return;
  if(box.children.length >= 12) return;      // 上限跟後端 schedTodoStr_ 一致
  var d = document.createElement('div');
  d.className = 'tdrow';
  d.innerHTML = '<input type="text" value="'+esc(v||'')+'" placeholder="例如：找會計部林小姐">'+
    '<button type="button" class="dpsm" data-x="1">✕</button>';
  d.querySelector('[data-x]').onclick = function(){
    d.remove(); box.dataset.touched = '1'; };
  /* ⛔ 使用者一動過就不再被預設覆蓋——打了一半被清掉是最惱人的事。 */
  d.querySelector('input').addEventListener('input', function(){
    box.dataset.touched = '1'; });
  box.appendChild(d);
}
/* 換了服務細項就重帶預設。
   ⛔ 只在「使用者還沒自己動過」的時候覆蓋——
      打了一半被清掉是最惱人的事。 */
function dpTodoDefaults(){
  var box = $('dpTodo'); if(!box) return;
  if(box.dataset.touched === '1') return;
  var cats = (TAX && TAX.cats) || [];
  var big = (cats[+($('dpB')||{value:0}).value] || {}).b || '';
  var it = itemOf(big, ($('dpS')||{}).value || '');
  box.innerHTML = '';
  ((it && it.d) || []).slice(0, 6).forEach(function(v){ dpTodoAdd(v); });
}

function dpSave(){
  var b = $('dpSave'); if(b.disabled) return;
  var cats = (TAX&&TAX.cats)||[];
  var big = (cats[+$('dpB').value]||{}).b || '', sub = $('dpS').value || '';
  var mode = $('dpU').value, memo = $('dpM').value.trim();
  if(mode==='loose') memo = memo ? ('不急・'+memo) : '不急';
  if(mode==='urgent' && !$('dpT').value.trim()){ toast('壓時間就要填時間', true); return; }
  b.disabled = true; b.textContent = '存檔中…';
  var picked = DP_SUG, cli = DP_CLI;
  var c = PRESETS.filter(function(x){ return x.c===cli; })[0] || {};
  google.script.run
    .withSuccessHandler(function(){
      DP_SUG = null;
      toast(cli+' '+sub+' 開好了'+(picked
        ? ('　→ '+picked+' 的行事曆上會出現灰色預排') : '　→ 等特助配人'));
      DP_SUG = null; DP_RESET_ = 1;   // 存好了才讓表單真的清空，見 dpSnap()
      calBust(); loadCal(null, true);
    })
    .withFailureHandler(function(e){
      b.disabled=false; b.textContent='存檔'; toast(e.message, true);
    })
    /* ⛔ crew 一定要明確傳空字串：不傳的話後端會掛給開單的人（行政自己）。
       sug 才是「我建議誰」。 */
    .addSchedule(CODE, { todo: dpTodoRows().map(function(t){ return {t:t, d:0}; }),
      date:$('dpD').value,
      slot: mode==='urgent'?$('dpT').value.trim():'',
      crew:'', sug: picked||'', target:(c.t==='家庭雇主'?'家庭':'工廠'), client:cli,
      lang:$('dpL').value, big:big, sub:sub, memo:memo });
}

/* ══ 行政：我開的單（含審核狀態）════════════════ */
function loadMine(){
  var mine = dpLive().filter(function(r){ return r.by === STAFF_NAME; });
  var wait = mine.filter(function(r){ return !r.crew && r.status==='預排'; });
  var okd  = mine.filter(function(r){ return r.crew && r.status==='預排'; });
  var done = mine.filter(function(r){ return r.status==='已完成'; });
  /* ⑶ 審核狀態。⛔ listSchedule 早就回了 r.rv（Schedule.gs:153），
     在 2026-09-28 之前**這裡一個字都沒印**——
     翻譯的紀錄被退回，開單的行政完全不知道，客戶打來他答不出話。 */
  var back = done.filter(function(r){ return r.rv === '退回補正'; });
  var h = '';
  if(back.length) h += '<div class="dpalert">⚠ <b>'+back.length+' 筆被退回補正</b>'+
    '<s>翻譯要補資料才會歸檔。這幾筆還沒結束。</s></div>';
  h += dpGroup('等特助確認', wait, 'a') +
       dpGroup('排好了', okd, '') +
       dpGroup('做完了', done, 'g');
  if(!mine.length) h += '<p class="mid" style="padding:22px">'+
    '還沒有你開的單——切到「客戶」開一筆</p>';
  h += '<p class="dpnote" style="margin-top:14px">'+
    '這裡跟翻譯行事曆是<b>同一批資料</b>，只有一份。</p>';
  $('p-mine').innerHTML = h;
  bindEdit($('p-mine'));
}

/* ══ 特助：待確認 ════════════════════════════ */
function loadConf(){
  var day = CAL_SEL || todayStr();
  var rows = dpDay(day), cfs = dpConflicts(day), bad = dpHardSet(day);
  var pend = rows.filter(function(r){ return !r.crew && r.status==='預排'; });
  var okSug  = pend.filter(function(r){ return r.sug && !bad[r.id]; });
  var badSug = pend.filter(function(r){ return r.sug && bad[r.id]; });
  var none   = pend.filter(function(r){ return !r.sug; });
  var od = overdue(), ow = owedAll();

  var h = '<div class="dpbar"><label class="dplb">日期</label>'+
    '<input type="date" id="dpDay" value="'+esc(day)+'">'+
    '<button type="button" class="dpsm" id="dpToday">今天</button></div>';

  /* ⑵ 過期未結案。**七天模擬裡累積 50 筆，沒有任何人看得到。**
     放在最上面——它是唯一一個「愈拖愈多、而且沒有人在看」的東西。 */
  if(od.length){
    h += '<div class="dpalert big">⛔ <b>'+od.length+' 筆過期還沒結案</b>'+
      '<s>日期已經過了，狀態還停在「預排」——做了沒？取消了？沒有人知道。</s></div>'+
      od.slice(0,12).map(function(r){ return dpCard(r, dpAct(r)); }).join('')+
      (od.length>12?('<p class="dpnote">還有 '+(od.length-12)+' 筆</p>'):'');
  }
  if(ow.length){
    h += '<div class="dpalert">⚠ <b>'+ow.length+' 筆做完了沒填紀錄</b>'+
      '<s>行程已完成但沒有服務紀錄，等於沒有留下任何憑證。</s></div>'+
      ow.slice(0,8).map(function(r){ return dpCard(r); }).join('');
  }
  if(cfs.length){
    h += '<div class="dphd b">有問題　先看這個 <b>'+cfs.length+'</b></div>';
    cfs.forEach(function(c){
      h += '<div class="dpcf'+(c.hard?'':' soft')+'"><span class="dpty">'+esc(c.ty)+
        '</span><div><b>'+esc(c.title)+'</b><s>'+c.why+'</s></div>'+
        (c.id?dpPick(c.id, '改給…'):'')+'</div>';
    });
  }
  if(okSug.length) h += '<div class="dphd">行政填了人，看起來沒問題 <b>'+okSug.length+
    '</b><button type="button" class="dpgo sm" id="dpAll">全部確認</button></div>'+
    okSug.map(function(r){ return dpCard(r, dpAct(r)); }).join('');
  if(badSug.length) h += '<div class="dphd b">這幾筆有上面的問題 <b>'+badSug.length+
    '</b></div>'+badSug.map(function(r){ return dpCard(r, dpAct(r)); }).join('');
  if(none.length) h += '<div class="dphd a">行政沒填人，要你配 <b>'+none.length+
    '</b></div>'+none.map(function(r){ return dpCard(r, dpAct(r)); }).join('');
  var done = rows.filter(function(r){ return r.crew; });
  /* 已確認的也要能改——臨時請假、語別不對、撞行程都會發生。
     ⛔ 卡片上**不掛按鈕**：一天幾十筆，每張兩顆會很吵，
        而且改派是會通知別人的動作，誤觸代價高。
        改成往左滑出軌道，跟翻譯端的行程卡同一套手勢。 */
  if(done.length) h += '<div class="dphd g">已確認 <b>'+done.length+'</b>'+
    '<span class="dpnote" style="margin-left:auto;font-weight:400">往左滑可以改派</span></div>'+
    done.map(function(r){
      return '<div class="dpsw" data-id="'+esc(r.id)+'">'+
        '<div class="swrail">'+
          '<span class="swst"><i>⇄</i><b>改派</b></span>'+
          '<span class="swst bad"><i>↩</i><b>退回</b></span>'+
        '</div>'+dpCard(r)+'</div>';
    }).join('');
  if(!rows.length && !od.length && !ow.length)
    h += '<p class="mid" style="padding:22px">這一天沒有行程</p>';
  h += '<p class="dpnote" style="margin-top:14px">'+
    '確認之後那一筆才會變成翻譯手機上的正式行程。'+
    '換人的話<b>被拿掉的那位會收到通知</b>。</p>';
  $('p-conf').innerHTML = h;

  $('dpDay').onchange = function(){ CAL_SEL = this.value; loadConf(); };
  $('dpToday').onclick = function(){ CAL_SEL = todayStr(); loadConf(); };
  var a = $('dpAll');
  if(a) a.onclick = function(){ dpConfirmAll(okSug); };
  [].forEach.call($('p-conf').querySelectorAll('.dpsel'), function(s){
    s.onchange = function(){ if(this.value) dpDo(this.dataset.id, this.value); };
  });
  [].forEach.call($('p-conf').querySelectorAll('[data-conf]'), function(b){
    b.onclick = function(){ dpDo(b.dataset.conf, ''); };
  });
  [].forEach.call($('p-conf').querySelectorAll('.dpsw'), bindConfSwipe);
}
/* 已確認的卡片：往左滑出「改派／退回」。
   ⛔ 滑鼠與觸控都要能用——**特助是坐在電腦前的**，
      只做觸控的話他根本滑不動（2026-09-29 派工台原型就踩過一次）。
   ⚠ 這裡**不重用 bindSwipe**：那一支綁在翻譯端行程卡上、跑了兩週很穩，
      為了多一個用途去改它不划算。這一支短很多，狀態也單純。 */
function bindConfSwipe(w){
  var card = w.querySelector('.dpcd'), rail = w.querySelector('.swrail');
  if(!card || !rail) return;
  var stops = rail.querySelectorAll('.swst'), MAX = SW_STEP_ * stops.length;
  var x0 = 0, open = 0, dragging = false, moved = false;

  function put(v){
    open = Math.max(0, Math.min(MAX, v));
    var t = open ? 'translateX(' + (-open) + 'px)' : '';
    card.style.transform = t; rail.style.transform = t;
    var i = Math.floor(open / SW_STEP_ - SW_ARM_);
    [].forEach.call(stops, function(s, k){ s.classList.toggle('hot', k === i); });
  }
  function end(){
    var i = Math.floor(open / SW_STEP_ - SW_ARM_);
    if(i >= 0){ put(0); confAct(w.dataset.id, i === 0 ? 'move' : 'back'); }
    else put(open > SW_STEP_ * 0.4 ? MAX : 0);
  }
  function startAt(x){ x0 = x; dragging = true; moved = false; }
  function moveTo(x){
    if(!dragging) return;
    var d = x0 - x;
    if(Math.abs(d) > 5) moved = true;
    put(d);
  }
  w.addEventListener('touchstart', function(e){ startAt(e.touches[0].clientX); }, {passive:true});
  w.addEventListener('touchmove', function(e){
    if(!dragging) return;
    moveTo(e.touches[0].clientX);
    if(moved) e.preventDefault();
  }, {passive:false});
  w.addEventListener('touchend', function(){ dragging = false; end(); });
  /* 滑鼠：用 Pointer Events，pointerType 是 touch 的交給上面那組，不要兩套一起跑 */
  w.addEventListener('pointerdown', function(e){
    if(e.pointerType === 'touch' || e.button) return;
    w.setPointerCapture(e.pointerId); startAt(e.clientX);
  });
  w.addEventListener('pointermove', function(e){
    if(e.pointerType === 'touch') return;
    moveTo(e.clientX);
  });
  w.addEventListener('pointerup', function(e){
    if(e.pointerType === 'touch') return;
    dragging = false; end();
  });
}
/* 改派／退回共用同一個面板（牟佑彬 2026-10-03）。
   ⛔ 兩個動作都會把某個人從他的行事曆上拿掉，**留一句話的需求是一樣的**——
      退回其實更需要（那一筆直接變成沒有人）。不要一個有留話、一個沒有。
   ⚠ 留話是**選填**。強迫填理由的欄位最後都會被填成「無」，比留白更沒資訊。
   ⚠ 退回原本是 confirm() 一按就送。改成面板之後多一步，但那一步正好是
      「要不要留話」，不是白加的。 */
function confAct(id, what){
  var r = CAL_ROWS.filter(function(x){ return x.id===id; })[0] || {};
  /* 連滑兩張不要疊出兩個面板。只清自己插的（.mv），
     不要動 loadConf 本來就會畫的那三條 .dpalert 提醒。 */
  [].forEach.call($('p-conf').querySelectorAll('.dpalert.mv'), function(x){
    x.parentNode.removeChild(x); });
  var card = document.querySelector('.dpsw[data-id="'+id+'"]');
  if(!card) return;
  var who = r.crew || r.sug || '';
  var back = (what === 'back');
  var sel = document.createElement('div');
  sel.className = 'dpalert mv';
  sel.innerHTML =
    '<b>'+(back?'退回待確認':'改派')+'　'+esc(r.client)+'</b>'+
    '<s>目前是 '+esc(who||'（還沒有人）')+'。'+
      (who ? esc(who)+' 手機上的這一筆會消失，而且會收到通知。' : '')+'</s>'+
    (who ? '<div class="f" style="margin-top:8px">'+
      '<label>跟 '+esc(who)+' 說一聲（可以不填）</label>'+
      '<input type="text" data-why="1" maxlength="60" '+
      'placeholder="例如：你今天另一邊壓時間"></div>' : '')+
    (back ? '<div class="cfbt">'+
        '<button type="button" class="dpsm" data-no="1">算了</button>'+
        '<button type="button" class="dpgo sm" data-yes="1">確定退回</button></div>'
      : dpPick(id, '改給…'));
  card.parentNode.insertBefore(sel, card);
  var why = function(){
    var i = sel.querySelector('[data-why]'); return i ? i.value.trim() : '';
  };
  var no = sel.querySelector('[data-no]');
  if(no) no.onclick = function(){ sel.parentNode.removeChild(sel); };
  var yes = sel.querySelector('[data-yes]');
  if(yes) yes.onclick = function(){
    var note = why();
    google.script.run
      .withSuccessHandler(function(){
        toast(r.client + ' 已退回待確認' + (who ? ('　已通知 ' + who) : ''));
        calBust(); loadCal(null, true);
      })
      .withFailureHandler(function(e){ toast(e.message, true); })
      .assignSchedule(CODE, id, '', note);
  };
  var s2 = sel.querySelector('.dpsel');
  /* ⚠ 下拉是沿用待確認那邊的 dpPick，裡面會包含**現在這個人**。
     選到同一個人就什麼都不要做——不然會白送一則「你的行程換人了」給他。 */
  if(s2) s2.onchange = function(){
    if(!this.value) return;
    if(this.value === r.crew){ sel.parentNode.removeChild(sel); return; }
    dpDo(id, this.value, why());
  };
}

function dpPick(id, ph){
  var r = CAL_ROWS.filter(function(x){ return x.id===id; })[0] || {};
  var pool = CREW.filter(function(n){
    return !r.lang || dpCrewLang(n)===r.lang || !dpCrewLang(n); });
  return '<select class="dpsel" data-id="'+esc(id)+'"><option value="">'+ph+'</option>'+
    pool.map(function(n){
      /* ⛔ value 一定要是乾淨的名字。2026-09-27 撞過：顯示帶「（N 件）」，
         送到後端變成不存在的人名，被 SVC_CREW_ 驗證擋下來。 */
      return '<option value="'+esc(n)+'">'+esc(n)+'（'+
        dpDay(r.date).filter(function(y){ return dpWho(y)===n; }).length+' 件）</option>';
    }).join('')+'</select>';
}
function dpAct(r){
  return (r.sug?'<button type="button" class="dpgo sm" data-conf="'+esc(r.id)+
    '">確認</button>':'')+dpPick(r.id, r.sug?'換人…':'配人…');
}
function dpDo(id, who, why){
  var r = CAL_ROWS.filter(function(x){ return x.id===id; })[0] || {};
  var was = dpWho(r);
  google.script.run
    .withSuccessHandler(function(){
      toast(who ? (r.client+'：'+(was||'沒人')+' → '+who+
                   (was&&was!==who?('　已通知 '+was):''))
                : (r.client+' 確認給 '+was));
      calBust(); loadCal(null, true);
    })
    .withFailureHandler(function(e){ toast(e.message, true); })
    .confirmSchedule(CODE, id, who || '', why || '');
}
function dpConfirmAll(list){
  if(!list.length) return;
  var left = list.length, n = 0;
  list.forEach(function(r){
    google.script.run
      .withSuccessHandler(function(){ n++; if(!--left){
        toast(n+' 筆一次確認完'); calBust(); loadCal(null, true); } })
      .withFailureHandler(function(e){ if(!--left){
        toast('有幾筆沒過：'+e.message, true); calBust(); loadCal(null, true); } })
      .confirmSchedule(CODE, r.id, '');
  });
}


/* ══ 評鑑調閱（2026-10-03）══════════════════════════
   委員指定一份移工名單，要看這些人有沒有被服務過。

   ⛔ 這一頁的重點不是列印，是**先讓他知道誰查不到**。
      所以查不到的排最上面、標紅，而且先講「幾個人查不到」再講總數。
      排在最後面的話他要滑到底才發現，那通常已經在評鑑現場了。

   ⚠ 容器用注入的，不寫進 Service.html——那是後端檔，改它要重新部署，
     而版本額度是稀缺資源。 */
function drawAudit(){
  var pane = $('p-find');
  if(!pane || $('auBox')) return;
  var box = document.createElement('div');
  box.id = 'auBox';
  box.className = 'card';
  box.innerHTML =
    '<h3>評鑑調閱</h3>'+
    '<p class="dpnote">把委員給的名單貼進來，一行一個名字。'+
    '中文名、護照上的英文名都查得到。</p>'+
    '<div class="f"><textarea id="auNames" rows="4" '+
      'placeholder="阮文雄&#10;陳氏梅&#10;Dela Cruz, Maria"></textarea></div>'+
    '<button type="button" class="dpgo" id="auGo">查這些人</button>'+
    '<div id="auOut"></div>';
  pane.appendChild(box);
  $('auGo').onclick = auRun;
}

var AU_RES = null;
function auRun(){
  var txt = ($('auNames').value || '').trim();
  if(!txt){ toast('先貼上名單', true); return; }
  var b = $('auGo');
  b.disabled = true; b.textContent = '查詢中…';
  google.script.run
    .withSuccessHandler(function(r){
      b.disabled = false; b.textContent = '查這些人';
      AU_RES = r; auDraw(r);
    })
    .withFailureHandler(function(e){
      b.disabled = false; b.textContent = '查這些人'; toast(e.message, true); })
    .auditLookup(CODE, txt);
}

function auDraw(r){
  if(!r || !r.rows){ $('auOut').innerHTML = ''; return; }
  var h = '';
  /* 先講壞消息。 */
  if(r.miss){
    h += '<div class="dpalert big">⛔ <b>'+r.miss+' 個人查不到任何服務紀錄</b>'+
      '<s>評鑑前要先處理這幾個。下面標紅的就是。</s></div>';
  } else {
    h += '<div class="dpalert"><b>'+r.total+' 個人都有紀錄</b>'+
      '<s>總共 '+r.sheets+' 份服務紀錄表。</s></div>';
  }
  h += '<div class="aulst">' + r.rows.map(function(x, i){
    return '<div class="aurow'+(x.n?'':' bad')+'">'+
      (x.n ? '<input type="checkbox" data-pick="'+i+'" checked>'
           : '<span class="auno">✕</span>')+
      '<span class="aunm">'+esc(x.name)+
        (x.client?'<s>'+esc(x.client)+'</s>':
          (x.inRoster?'<s>名冊上有，但沒有服務紀錄</s>':'<s>名冊上也找不到這個名字</s>'))+
      '</span>'+
      '<span class="aun">'+x.n+' 筆</span></div>';
  }).join('') + '</div>';
  if(r.sheets){
    h += '<button type="button" class="dpgo" id="auPrint" style="margin-top:10px">'+
      '整理這 '+r.sheets+' 份服務紀錄表</button>'+
      '<p class="dpnote">會把 PDF 收進一個雲端硬碟資料夾，'+
      '你打開資料夾全選就能一次列印。</p>';
  }
  $('auOut').innerHTML = h;
  var p = $('auPrint');
  if(p) p.onclick = auExport;
  [].forEach.call($('auOut').querySelectorAll('[data-pick]'), function(c){
    c.onchange = auCount;
  });
}

/* 勾選改變時按鈕上的數字要跟著動——按鈕寫的是「這 12 份」，
   不是「列印」。現場要知道手上到底有幾份。 */
function auCount(){
  if(!AU_RES) return;
  var n = 0;
  [].forEach.call($('auOut').querySelectorAll('[data-pick]'), function(c){
    if(c.checked) n += (AU_RES.rows[+c.dataset.pick] || {}).n || 0;
  });
  var p = $('auPrint');
  if(p){ p.textContent = '整理這 ' + n + ' 份服務紀錄表'; p.disabled = !n; }
}

function auExport(){
  if(!AU_RES) return;
  var codes = [];
  [].forEach.call($('auOut').querySelectorAll('[data-pick]'), function(c){
    if(!c.checked) return;
    ((AU_RES.rows[+c.dataset.pick] || {}).recs || []).forEach(function(x){
      if(x.rec && codes.indexOf(x.rec) < 0) codes.push(x.rec);
    });
  });
  if(!codes.length){ toast('沒有勾到任何人', true); return; }
  if(codes.length > 40){ toast('一次最多 40 份，先取消勾幾個', true); return; }
  var b = $('auPrint');
  b.disabled = true; b.textContent = '整理中…（'+codes.length+' 份要一點時間）';
  google.script.run
    .withSuccessHandler(function(r){
      b.disabled = false; auCount();
      var h = '<div class="dpalert"><b>整理好了：'+r.n+' 份</b>'+
        '<s>'+esc(r.name)+(r.bad && r.bad.length ? ('　有 '+r.bad.length+' 份產不出來') : '')+'</s>'+
        '<a class="dpgo sm" href="'+esc(r.url)+'" target="_blank" '+
        'style="display:inline-block;margin-top:8px">打開資料夾</a></div>';
      $('auOut').insertAdjacentHTML('afterbegin', h);
    })
    .withFailureHandler(function(e){
      b.disabled = false; auCount(); toast(e.message, true); })
    .auditExport(CODE, codes);
}
