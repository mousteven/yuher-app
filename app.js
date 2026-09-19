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
  try{ toast('前端錯誤：' + (e.message || e.type), true); }catch(x){}
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

      $('login').style.display='none'; $('app').style.display='';
  document.body.classList.remove('lgon');
      $('who').textContent = STAFF_NAME;

      // 簽名板要在畫面顯示之後才 init，隱藏時量到的寬度是 0
      ['employer','staff'].forEach(function(k){
        initSig(document.querySelector('[data-sig='+k+']')); });
      addWorker(); $('date').valueAsDate = new Date();
      CAL_SEL = todayStr();

      fillClients();
      bindOther($('client'), $('clientOther'));
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
var OTHER_ = '__other__';

/* ── 登出 ──────────────────────────────────────
   共用手機或換人接手時要能換帳號；登入碼是存在這台機器上的，
   所以登出＝把它清掉再回登入畫面。 */
$('whoBtn').addEventListener('click', function(){
  $('outName').textContent = STAFF_NAME || '（未命名）';
  $('outRole').textContent = STAFF_ROLE ? (STAFF_ROLE + '　登入碼 ' + CODE) : ('登入碼 ' + CODE);
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
  hideBack(); backToTop();
});

$('outReload').addEventListener('click', appReload);
$('newver').addEventListener('click', appReload);

/* 伺服器上的版本跟這一頁不一樣，就是被快取住了 */
var BUILD_AT = 0;
function checkBuild(force){
  if(!force && BUILD_AT && (Date.now() - BUILD_AT) < 5*60*1000) return;
  BUILD_AT = Date.now();
  google.script.run.withSuccessHandler(function(b){
    if(b && BUILD && b !== BUILD){
      $('newver').textContent = '有新版本，點一下更新';
      $('newver').style.display = '';
      fixStick();
    }
  }).withFailureHandler(function(){}).appBuild();
}
document.addEventListener('visibilitychange', function(){
  if(!document.hidden && CODE) checkBuild();
});
$('outCancel').addEventListener('click', function(){
  $('outModal').style.display = 'none';
});
$('outGo').addEventListener('click', function(){
  try { localStorage.removeItem('svc.code'); } catch(e){}
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
function clientVal(){ return valOf($('client'), $('clientOther')); }

/* 客戶清單依服務對象過濾：選了「家庭雇主」就不該還看到一堆工廠。
   宣導也是對工廠，所以沿用工廠的清單。 */
function targetKind(){ return $('target').value.indexOf('家庭') !== -1 ? '家庭雇主' : '工廠'; }
function fillClients(){
  var kind = targetKind();
  var keep = $('client').value;
  var list = PRESETS.filter(function(x){ return (x.t || '工廠') === kind; });
  $('client').innerHTML = '<option value="">請選擇…</option>' +
    list.map(function(x){ return '<option>'+esc(x.c)+'</option>'; }).join('') +
    '<option value="'+OTHER_+'">其他（自行輸入）</option>';
  $('client').value = list.some(function(x){ return x.c === keep; }) ? keep : '';
  if($('client').value !== OTHER_){ $('clientOther').style.display='none'; }
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
$('client').addEventListener('change', applyPreset);
$('clientOther').addEventListener('input', applyPreset);

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
      pollBrief();
      BRIEF_TIMER = setInterval(pollBrief, 8000);
    })
    .withFailureHandler(function(e){
      b.disabled = false; b.textContent = '開始簽到，產生 QR'; toast(e.message, true);
    })
    .createBriefing(CODE, {
      client: clientVal(), date: $('date').value, crew: $('crew').value,
      topic: ws.length ? (ws[0].big + ' / ' + ws[0].sub) : '',
      expected: pickedNames()
    });
});

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
    })
    .withFailureHandler(function(){})
    .briefingProgress(CODE, BRIEF.token);
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
document.querySelectorAll('.tabs button').forEach(function(b){
  b.addEventListener('click', function(){
    document.querySelectorAll('.tabs button').forEach(function(x){ x.className = x===b?'on':''; });
    document.querySelectorAll('.pane').forEach(function(p){ p.classList.remove('on'); });
    $('p-'+b.dataset.t).classList.add('on');
    hideBack();          // 自己按分頁進來的不是「從某一筆點進來」，沒有回去可言
    backToTop();
    if(b.dataset.t==='cal') loadCal();
    if(b.dataset.t==='track') loadTrack();
    if(b.dataset.t==='follow') loadFollow();
    if(b.dataset.t==='stat') loadStat();
  });
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
var CAL_VIEW = 'month';          // month | week | day
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

/* 這一份 app.js 是哪一版——從自己的 <script src> 網址讀 ?v= 出來。

   用途一：同事說「我的畫面怪怪的」時，叫他下拉看一眼就知道手上是哪一版，
           不用猜他到底更新了沒。
   用途二：驗證下拉更新真的有通。正常開啟時是「2026-09-18 1445」這種部署戳記；
           下拉更新之後外殼會在網址後面加時間戳，伺服器再把它接到版面檔的
           ?v= 上，所以會變成「2026-09-18 1445-1758…」。
           **後面多出那串數字，就代表外殼真的重載了、&t= 真的傳到伺服器了。**

   document.currentScript 只在腳本本體執行時讀得到，所以這一段不能搬進函式裡。 */
var ASSET_V = (function(){
  try {
    var el = document.currentScript;
    var m = el && el.src ? /[?&]v=([^&]+)/.exec(el.src) : null;
    return m ? decodeURIComponent(m[1]) : '';
  } catch(e){ return ''; }
})();

/* ── 下拉更新 ───────────────────────────────────── */
var PTR = { on:false, y0:0, d:0, armed:false, busy:false };
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
  p.querySelector('em').textContent = (PTR.armed ? '放開更新' : '下拉更新') +
    (ASSET_V ? '　' + ASSET_V : '');
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
    appReload();
    // 外殼沒接到訊息的話（例如直接開網址），三秒後自己收回來
    setTimeout(function(){ PTR.busy = false; ptrReset(true); }, 3000);
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
        if(--left === 0){ calMerge(months); drawCal(); }
      })
      .withFailureHandler(function(e){
        if(--left === 0){ calMerge(months); drawCal(); }
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
    if(CAL_ST && stKey(r) !== CAL_ST) return false;
    if(CAL_MINE && r.crew !== (STAFF_NAME||'')) return false;
    if(CAL_LG.length){
      var ls = (r.lang||'').split('、').filter(String);
      if(!ls.some(function(l){ return CAL_LG.indexOf(l) !== -1; })) return false;
    }
    return true;
  });
}

/* 上排＝狀態，下排＝語別與人員。兩排都不換行，各自橫向捲。
   狀態一律五個都列出來（就算是 0），位置固定，手指才有肌肉記憶。 */
function drawFilters(langs){
  var live = CAL_ROWS.filter(function(r){ return r.status !== '取消'; });
  var chip = function(on, data, mark, txt, n){
    return '<button type="button" '+data+' class="'+(on?'on':'')+'">'+
      mark+esc(txt)+'<b>'+n+'</b></button>';
  };

  $('calSt').innerHTML =
    chip(!CAL_ST, 'data-st=""', '', '全部', live.length) +
    CAL_ST_DEF.map(function(d){
      var n = live.filter(function(r){ return stKey(r) === d.k; }).length;
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

function drawCal(){
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
  var plan = list.filter(function(r){ return r.status === '預排'; });
  var done = list.filter(function(r){ return r.status === '已完成'; });
  $('calDayCount').textContent = list.length
    ? (plan.length ? ('待處理 '+plan.length+'　已完成 '+done.length) : ('已完成 '+done.length))
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
    var tk = r.caseId
      ? '<span class="c4tk">◷ '+esc(SHORT_[r.caseKind] || r.caseKind || '追蹤')+
        (r.caseN ? ' '+r.caseN+'/'+r.caseTotal : '')+'</span>'
      : '';

    var wcount = r.workers ? String(r.workers).split('、').filter(Boolean).length : 0;

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
        // 移工名（自然截斷）＋ 人數標（永遠不縮）
        (r.workers
          ? '<span class="c4wk"><span class="c4ws">'+esc(r.workers)+'</span>'+
            (wcount>1?'<span class="c4cnt">'+wcount+' 人</span>':'')+'</span>'
          : '')+
        // 時段與翻譯降到最後一行的小字。排一天的行程時還是要看得到。
        '<span class="c4who">'+esc(r.slot||'未定時段')+'　'+esc(r.crew)+'</span>'+
      '</span>'+
      '</div></div>';
  }

  var html = '';
  if(plan.length){
    html += '<div class="grp">待處理 <b>'+plan.length+'</b></div>' +
            plan.map(card).join('');
  }
  if(done.length){
    // 跑完的收在下面：一天結束時往下滑就是當天的成果
    html += '<div class="grp done">已完成 <b>'+done.length+'</b></div>' +
            done.map(card).join('');
  }
  $('calDayList').innerHTML = html || '<div class="mid" style="padding:24px">這天沒有行程</div>';
  fixStick();

  // 卡片本身可以長按拖曳改期（按鈕不受影響）
  var idx = 0;
  var all = plan.concat(done);
  [].forEach.call($('calDayList').querySelectorAll('.ev'), function(card){
    var r2 = all[idx++]; if(!r2) return;
    bindDrag(card, r2);
  });
  if(plan.length && CAL_VIEW !== 'day'){
    $('calDayList').insertAdjacentHTML('beforeend',
      '<p class="draghint">點一下開始填寫　·　長按有更多選項<br>'+
      '往左推：追蹤 → 改期 → 取消　·　長按之後拖動可以改期</p>');
  }

  // 點已完成那一趟的內文＝打開整張服務表，送審前先確認過
  [].forEach.call($('calDayList').querySelectorAll('[data-rec]'), function(b){
    b.addEventListener('click', function(){
      if(DRAG) return;                 // 拖曳中不要誤觸
      var nm = b.querySelector('.n');
      openRecord(b.dataset.rec, {
        id: '', rec: b.dataset.rec, y: window.scrollY,
        view: CAL_VIEW, ym: CAL_YM, sel: CAL_SEL,
        label: (($('calDayTitle') || {}).textContent || '').trim(),
        name: nm ? nm.textContent.trim() : ''
      });
    });
  });
  /* 每一張卡片：點一下（預排＝開始填寫、已完成＝看紀錄）、
     由右往左推出四段選單（有哪幾格看這張卡的狀態）。 */
  var si = 0;
  [].forEach.call($('calDayList').querySelectorAll('.swwrap'), function(w){
    var r3 = all[si++]; if(r3) bindSwipe(w, r3);
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
function cardData(r){
  return { rc: r.recCode || '', go: r.id || '', client: r.client || '',
           workers: r.workers || '', lang: r.lang || '',
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
  var byRank = { 0: [], 1: [], 2: [] };
  rows.forEach(function(c){ byRank[c.rank] = (byRank[c.rank]||[]).concat([c]); });
  var LBL = { 0: '同一位移工　進行中', 1: '同一個客戶　進行中', 2: '其他進行中' };
  var h = '';
  [0,1,2].forEach(function(k){
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
  if(!rows.length){
    h = '<p class="mgnone">目前沒有進行中的案件。開一件新的吧。</p>';
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
    // 預排的點一下開始填寫；已完成的交給裡面的 data-rec，這裡不要攔
    if(r.status === '預排' && r.id){ ev.stopPropagation(); startFromSchedule(r.id); }
  }, true);
}

/* 放開就執行。動作本身沿用長按選單那幾支，不要再寫第二份。
   ⛔ 取消要再問一次：手勢是會滑過頭的，而「取消行程」救不回來。 */
function swDo(k, r){
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

function startFromSchedule(id){
  var r = CAL_ROWS.filter(function(x){ return x.id===id; })[0];
  if(!r) return;
  /* 切分頁之前先量，不然 backToTop() 已經把捲動位置歸零了 */
  var back = { id: id, rec: '', y: window.scrollY,
               view: CAL_VIEW, ym: CAL_YM, sel: CAL_SEL,
               label: (($('calDayTitle') || {}).textContent || '').trim(),
               name: r.client };
  SCHED_ID = id;
  $('date').value = r.date;
  $('target').value = (r.target||'工廠');
  fillClients(); syncMode();
  $('client').value = r.client;
  applyPreset();
  if(CREW.indexOf(r.crew) !== -1) $('crew').value = r.crew;

  // 排程時選好的移工與服務項目一併帶進去，當天只要補處理經過與結果
  var names = (r.workers||'').split('、').filter(String);
  $('workers').innerHTML = '';
  (names.length ? names : ['']).forEach(function(n){
    addWorker();
    var card = $('workers').lastElementChild;
    var sel = card.querySelector('[data-k=name]');
    if(n && sel){ sel.value = n; sel.dispatchEvent(new Event('change')); }
    if(r.big){
      var bg = card.querySelector('[data-k=big]');
      bg.value = r.big; bg.dispatchEvent(new Event('change'));
      if(r.sub){
        var sb = card.querySelector('[data-k=sub]');
        sb.value = r.sub; sb.dispatchEvent(new Event('change'));
      }
    }
  });
  renumber();
  document.querySelector('.tabs button[data-t=new]').click();
  showBack(back, 'form');          // 要在切完分頁之後，分頁切換會把它收起來
  window.scrollTo(0,0);
  toast('已帶入行程，接著填服務內容');
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
[].forEach.call($('calViews').querySelectorAll('button'), function(b){
  b.addEventListener('click', function(){
    CAL_VIEW = b.dataset.v;
    [].forEach.call($('calViews').querySelectorAll('button'), function(x){
      x.className = (x===b) ? 'on' : ''; });
    CAL_YM = CAL_SEL.slice(0,7);
    loadCal();
  });
});

/* ── 排行程 ── */
function openPlan(client){
  $('planDate').textContent = CAL_SEL;
  $('planCrew').innerHTML = CREW.map(function(n){ return '<option>'+esc(n)+'</option>'; }).join('');
  if(CREW.indexOf(STAFF_NAME)!==-1) $('planCrew').value = STAFF_NAME;
  if(client){
    var pz0 = presetOf(client);
    if(pz0){
      $('planTarget').value = (pz0.t === '家庭雇主') ? '家庭雇主' : '工廠';
      fillPlanClients();
      $('planClient').value = client;
      if(pz0.crew && CREW.indexOf(pz0.crew)!==-1) $('planCrew').value = pz0.crew;
    } else { fillPlanClients(); }
  } else {
    fillPlanClients();
  }
  fillPlanBig();
  fillPlanWorkers();
  $('planModal').style.display='';
}
$('calAdd').addEventListener('click', function(){ openPlan(''); });
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
function fillPlanWorkers(){
  var pz = presetOf($('planClient').value);
  $('planWorkers').innerHTML = (pz && pz.w.length)
    ? pz.w.map(function(w){
        return '<label><input type="checkbox" value="'+esc(w.n)+'">'+
          '<span>'+esc(w.n)+(w.o?'<span class="o">'+esc(w.o)+'</span>':'')+'</span>'+
          '<span class="lg">'+esc(w.l)+'</span></label>'; }).join('')
    : '<div class="empty">先選工廠／雇主</div>';
}
function planWorkerNames(){
  return [].map.call($('planWorkers').querySelectorAll('input:checked'),
                     function(i){ return i.value; });
}
$('planClient').addEventListener('change', fillPlanWorkers);

function fillPlanClients(){
  var kind = $('planTarget').value.indexOf('家庭')!==-1 ? '家庭雇主' : '工廠';
  var list = PRESETS.filter(function(x){ return (x.t||'工廠')===kind; });
  $('planClient').innerHTML = '<option value="">請選擇…</option>' +
    list.map(function(x){ return '<option>'+esc(x.c)+'</option>'; }).join('');
}
$('planTarget').addEventListener('change', function(){ fillPlanClients(); fillPlanWorkers(); });
$('planCancel').addEventListener('click', function(){ $('planModal').style.display='none'; });
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
  var b=$('planSave'); b.disabled=true;
  google.script.run
    .withSuccessHandler(function(){
      b.disabled=false; $('planModal').style.display='none';
      toast('已排進行事曆'); calBust(); loadCal();
    })
    .withFailureHandler(function(e){ b.disabled=false; toast(e.message,true); })
    .addSchedule(CODE, { date: CAL_SEL, slot: $('planSlot').value,
      crew: $('planCrew').value, target: $('planTarget').value,
      client: $('planClient').value, lang: lang,
      big: $('planBig').value, sub: $('planSub').value,
      workers: picked.join('、'),
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
   '<div class="g2">'+
     '<div class="f"><label>服務類別</label><select data-k="big"><option value="">請選擇…</option>'+
       TAX.cats.map(function(c){ return '<option>'+esc(c.b)+'</option>'; }).join('')+'</select></div>'+
     '<div class="f"><label>服務細項</label><select data-k="sub"><option value="">先選類別</option></select></div>'+
   '</div>'+
   '<div class="f"><label>處理經過（可複選）</label><div class="chips" data-do>'+
     '<span class="ph">先選服務細項</span></div>'+
     '<p class="hint">接著補寫細節：</p>'+
     '<textarea data-k="dnote" placeholder="例如：亞大醫院骨科，掛號費 350 已代墊"></textarea></div>'+
   '<div class="f"><label>結果（可複選）</label><div class="chips" data-res>'+
     '<span class="ph">先選服務細項</span></div>'+
     '<p class="hint">接著補寫細節：</p>'+
     '<textarea data-k="rnote" placeholder="例如：8/12 上午回診拆線，已跟工廠請假"></textarea></div>'+
   '<div class="f"><label>費用</label><input data-k="fee" placeholder="車資200"></div>'+
   '<div class="f"><label>備註</label><input data-k="memo" placeholder="選填"></div>'+
   '<div class="sig" data-sig="worker">'+
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
  [].forEach.call($('workers').children, function(el,i){
    el.querySelector('.wkh b').textContent='移工 '+(i+1); });
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
  setSelOrOther($('client'), $('clientOther'), d.trip.client);
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
}

function startEdit(recCode){
  google.script.run
    .withSuccessHandler(function(d){
      if(!d.canEdit){ toast('這一筆現在不能修改（' + d.status + '）', true); return; }
      fillFormFrom(d);
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
function collectForm(){
  var trip = {
    date: $('date').value,
    mode: (document.querySelector('input[name=md]:checked')||{}).value||'到場',
    target: $('target').value, client: clientVal(), place: '',
    crew: $('crew').value, crewOwner: $('crewOwner').value,
    brief: BRIEF ? BRIEF.token : '', sched: SCHED_ID,
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

  toast('儲存中…');
  google.script.run
    .withSuccessHandler(function(r){
      b.disabled=false;
      calBust(); revBust();       // 那一趟會從「待處理」變「已完成」，送審清單也多一筆
      try{ showSaved(r.code); }
      catch(err){ toast('已存檔（'+r.code+'），但畫面沒換過來：'+err.message, true); }
    })
    .withFailureHandler(function(e){ b.disabled=false; toast(e.message, true); })
    .saveServiceLog(CODE, trip, workers);
});
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
      openPick({ rc: code, client: $('client').value || '',
                 workers: (PICKED_ || []).join('、'),
                 lang: PICK_LG || '', big: firstBig() });
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
  hideSaved();                 // 存完的那一排收回去，換回原本的三顆
  /* 清空表單等於放棄這次修改。少了這一行，按「清除」之後填的新內容
     會被當成修改、覆寫掉原本那一筆。 */
  if(typeof EDIT_CODE !== 'undefined' && EDIT_CODE){
    EDIT_CODE = null;
    var eb = $('editBar'); if(eb) eb.style.display='none';
    $('save').textContent = '儲存';
  }
  $('pvModal').style.display='none';
  $('client').value=''; $('clientOther').value=''; $('clientOther').style.display='none';
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
/* 送審頁與紀錄詳情的「前後文」列。掛在畫面最上面，點了跳到那個案件。
   查不到就整條不出現——沒掛案件的紀錄佔大多數，不要留一條空的。 */
function caseCtx(recCode){
  var box = $('rvCtx');
  if(box) box.remove();
  if(!recCode) return;
  google.script.run
    .withSuccessHandler(function(r){
      if(!r || !r.has) return;
      if(!$('rvBody')) return;
      var prev = r.list.filter(function(x){ return x.rec !== recCode; })
        .map(function(x){ return x.date + ' ' + (x.sub || ''); }).join('　→　');
      var el = document.createElement('div');
      el.id = 'rvCtx';
      el.className = 'clink';
      el.innerHTML =
        '<span><span class="k">' + esc(r.kind) + '　第 ' + r.n + ' 筆／共 ' +
          r.total + ' 筆</span><b>' + esc(r.id) +
          (r.title ? '　' + esc(r.title) : '') + '</b>' +
          (prev ? '<span class="pv">' + esc(prev) + '</span>' : '') + '</span>' +
        '<span class="go">›</span>';
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

  ws.forEach(function(w, i){
    var o = (typeof origOf === 'function') ? origOf(w.name) : '';
    var proc = [w.did, w.dnote].filter(String).join('。');
    var res  = [w.res, w.rnote].filter(String).join('。');
    var ex = [];
    if(w.fee) ex.push('費用 '+w.fee);
    if(w.memo) ex.push(w.memo);
    h += '<div class="rvw">'+
      '<div class="hd"><i>'+(i+1)+'</i><b>'+esc(w.name||'（未填姓名）')+'</b>'+
        (o?'<span class="or">'+esc(o)+'</span>':'')+
        (w.lang?'<em>'+esc(w.lang)+'</em>':'')+'</div>'+
      rvField('服務項目', (w.big&&w.sub) ? (w.big+' ／ '+w.sub) : (w.big||w.sub||''))+
      rvField('處理經過', proc)+
      rvField('處理結果', res)+
      (ex.length ? rvField('其他', ex.join('　·　')) : '')+
      '<div class="sg"><span>移工簽名</span>'+
        (w.sigWorker ? '<img src="'+esc(w.sigWorker)+'">' : '<em>未簽名</em>')+
      '</div>'+
    '</div>';
  });

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
        'style="width:100%;padding:13px;border-radius:11px;border:1px solid var(--line);'+
        'background:var(--card);color:var(--ink);font-size:15px;font-weight:700;'+
        'font-family:inherit;margin-bottom:8px">修改內容</button>'+
        '<button type="button" class="act p" id="rvSubmit" '+
        'style="width:100%;padding:14px;border-radius:11px;border:1px solid var(--brand);'+
        'background:var(--brand);color:#fff;font-size:15px;font-weight:700;'+
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
var TK_LOADED = '';      // 已經載好的是哪一種，離開再回來時不用重打一次
var TK_UNIT = '件';      // 後端給的單位。「件」數的是案件，不是服務紀錄
var TK_ST = '';          // 狀態過濾（'' = 全部）
var TK_ROWS = [];
var TK_COUNTS = {};

/* 後端的 state.key 對到既有的四組狀態色。
   ⚠ 不要用 .st——那個類別只活在 .rv 底下，而且修飾詞是 wait/done/back，
   套到這裡來會變成一個沒有樣式的字。這裡用自己的 .cst。 */
var TK_TONE = { back: 'bad', late: 'bad', today: 'warn', soon: 'warn',
                empty: 'warn', open: 'info', closed: 'ok', cancel: 'q' };

function tkPill(st){
  return '<span class="cst ' + (TK_TONE[st.key] || 'info') + '">' +
    esc(st.text) + '</span>';
}

/* 一筆案件算不算在某個篩選裡。清單與計數兩邊都要問同一個問題，
   分開寫兩份遲早會有一天對不起來。 */
function tkMatch(c, k){
  if(!k) return true;
  if(k === 'open') return c.status === '進行中';
  if(k === 'closed') return c.status !== '進行中';
  return c.state.key === k;
}

function loadTrack(force){
  if(!$('tkKinds')) return;      // 舊版面沒有這一頁，安靜略過
  drawKinds();
  if(!force && TK_LOADED === TK_CUR){ drawCases(); return; }
  $('tkBody').innerHTML = '<div class="mid" style="padding:26px">載入中…</div>';
  google.script.run
    .withSuccessHandler(function(r){
      TK_ROWS = r.rows || [];
      TK_LOADED = TK_CUR;
      TK_COUNTS = r.counts || {};
      TK_UNIT = r.unit || '件';
      drawKinds();
      drawCases();
    })
    .withFailureHandler(function(e){
      $('tkBody').innerHTML = '<div class="mid" style="padding:26px">' +
        esc(e.message) + '</div>';
    })
    .listCases(CODE, TK_CUR);
}

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
      TK_CUR = b.dataset.k; TK_ST = '';
      TK_ROWS = []; TK_LOADED = '';
      loadTrack(true);
      backToTop();
    });
  });
}

function drawCases(){
  var rows = TK_ROWS.filter(function(c){ return tkMatch(c, TK_ST); });

  /* 篩選：只列真的有東西的那幾格。列出 0 的分類是在浪費一排寬度。 */
  var defs = [
    { k: '', t: '全部', c: '' },
    { k: 'back', t: '有退回', c: 'var(--bad-bar)' },
    { k: 'late', t: '逾期', c: 'var(--bad-bar)' },
    { k: 'today', t: '今天', c: 'var(--warn-bar)' },
    { k: 'soon', t: '快到了', c: 'var(--warn-bar)' },
    { k: 'open', t: '進行中', c: 'var(--info-bar)' },
    { k: 'closed', t: '已結案', c: 'var(--ok-bar)' }
  ];
  $('tkFilt').innerHTML = defs.map(function(d){
    var n = TK_ROWS.filter(function(c){ return tkMatch(c, d.k); }).length;
    if(!n && d.k) return '';
    return '<button type="button" data-st="' + d.k + '"' +
      (TK_ST === d.k ? ' class="on"' : '') + '>' +
      (d.c ? '<i class="sq" style="background:' + d.c + '"></i>' : '') +
      esc(d.t) + '<b>' + n + '</b></button>';
  }).join('');
  [].forEach.call($('tkFilt').children, function(b){
    b.addEventListener('click', function(){ TK_ST = b.dataset.st; drawCases(); });
  });

  // 先講一句人話，再列清單。數字一定帶單位（取捨三）。
  $('tkLede').innerHTML = tkLede();

  if(!rows.length){
    $('tkBody').innerHTML = '<div class="mid" style="padding:26px">' +
      (TK_ROWS.length ? '這個條件下沒有案件' :
        '還沒有' + esc(TK_CUR) + '。從行事曆的行程往右滑就開得了一件。') + '</div>';
    return;
  }
  $('tkBody').innerHTML = rows.map(caseCard).join('');
  [].forEach.call($('tkBody').querySelectorAll('[data-case]'), function(el){
    el.addEventListener('click', function(){ openCase(el.dataset.case); });
  });
}

/* 摘要一句話。照「先講結論」的規矩：不要寫「共 6 件」，
   要寫「3 件超過 7 天還沒結案」——人看完就知道下一步做什麼。 */
function tkLede(){
  var open = TK_ROWS.filter(function(c){ return c.status === '進行中'; });
  var late = open.filter(function(c){ return c.state.key === 'late'; }).length;
  var today = open.filter(function(c){ return c.state.key === 'today'; }).length;
  var back = open.filter(function(c){ return c.badCount > 0; }).length;
  var head, sub;
  if(back){
    head = back + ' 件底下有服務紀錄被退回';
    sub = '退回的要改完重送，案件才結得了。';
  } else if(late){
    head = late + ' 件已經逾期';
    sub = TK_CUR === '體檢通知' ? '體檢逾期受罰的是雇主，要盯工廠人資。'
        : TK_CUR === '返鄉休假' ? '人還沒回來。先聯絡本人，再通知雇主。'
        : '排定的日期過了還沒處理。';
  } else if(today){
    head = '今天有 ' + today + ' 件要處理';
    sub = '出門前先看一下要帶什麼。';
  } else if(open.length){
    head = open.length + ' ' + TK_UNIT + '進行中';
    sub = '沒有逾期的。' + (TK_CUR === '體檢通知'
      ? '體檢前一天晚上系統會自動再提醒一次。' : '');
  } else {
    head = '沒有進行中的' + TK_CUR;
    sub = '從行事曆的行程往右滑，就可以開一件。';
  }
  return '<div class="tklede"><h3>' + esc(head) + '</h3><p>' + esc(sub) + '</p></div>';
}

function caseCard(c){
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
  return '<div class="ev ' + cls + '" data-case="' + esc(c.id) + '">' +
    '<span class="bar lg-' + esc((c.lang || '').split('、')[0]) + '"></span>' +
    '<span class="b">' +
      '<span class="t">' + tkPill(c.state) + '　' + esc(c.openedAt) +
        (c.crew ? '　' + esc(c.crew) : '') + '</span>' +
      '<span class="n">' + esc(c.workers || c.client) + '</span>' +
      '<span class="m">' + esc(c.title || c.sub || c.kind) +
        (c.workers ? '　·　' + esc(c.client) : '') +
        '　<span class="code">' + esc(c.id) + '</span></span>' +
      foot +
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
  $('ckSub').textContent = c.id + '　' + c.state.text;

  var h = '';

  /* 排程型把最重要的那張「票」放最上面：
     返鄉是登機證、體檢是掛號單。機票跟掛號單長什麼樣大家都認得，
     不用再教一次怎麼讀。 */
  if(c.kind === '返鄉休假') h += bpHtml(c);
  if(c.kind === '體檢通知' || c.kind === '就醫追蹤') h += slipHtml(c);

  if(c.link){
    h += '<div class="clink" data-go="' + esc(c.link.id) + '">' +
      '<span><span class="k">相關案件</span><b>' + esc(c.link.kind) + '　' +
      esc(c.link.id) + '　' + esc(c.link.status) + '</b></span>' +
      '<span class="go">›</span></div>';
  }

  h += '<div class="cbox"><h4>基本</h4>' + kvHtml([
    ['移工', c.workers],
    ['雇主／工廠', c.client],
    ['服務類別', c.big && c.sub ? (c.big + ' ／ ' + c.sub) : (c.sub || '')],
    ['負責翻譯', c.crew],
    ['開案', c.openedAt + (c.by ? '　' + c.by : '')],
    ['結案', c.closedAt],
    ['結案結果', c.result],
    ['說明', c.note]
  ]) + '</div>';

  h += stepsHtml(c) + detailHtml(c);

  if(CASE_FORM_[c.kind]){
    h += '<div class="cbox"><h4>服務紀錄　' + c.items.length + ' 筆</h4>' +
      (c.items.length ? ctlHtml(c.items)
        : '<p class="hint" style="margin:0">還沒有。從行事曆的行程往右滑，' +
          '或填完服務表之後掛上來。</p>') +
      '</div>';
  } else {
    h += '<div class="cbox"><h4>下一步</h4>' +
      kvHtml([['日期', c.nextDate], ['要做什麼', c.nextNote]]) +
      (c.nextDate
        ? '<p class="hint" style="margin:9px 0 0">行事曆上已經排好一筆了。' +
          '在那邊刪掉的話，這裡也會跟著清空。</p>'
        : '<p class="hint" style="margin:0">還沒排。排了會自動出現在行事曆上。</p>') +
      '</div>';
  }

  $('ckBody').innerHTML = h;
  var lk = $('ckBody').querySelector('.clink');
  if(lk) lk.addEventListener('click', function(){ openCase(lk.dataset.go); });
  [].forEach.call($('ckBody').querySelectorAll('[data-rv]'), function(el){
    el.addEventListener('click', function(){
      $('caseModal').style.display = 'none';
      openRecord(el.dataset.rv);
    });
  });

  var ed = $('ckEdit');
  if(ed) ed.addEventListener('click', function(){ openDetailForm(c); });
  [].forEach.call($('ckBody').querySelectorAll('[data-step]'), function(b){
    b.addEventListener('click', function(){
      if(b.dataset.step === c.step) return;
      google.script.run
        .withSuccessHandler(function(){
          toast('已改成「' + b.dataset.step + '」');
          TK_LOADED = ''; openCase(c.id);
        })
        .withFailureHandler(function(e){ toast(e.message, true); })
        .setCaseStep(CODE, c.id, b.dataset.step);
    });
  });

  drawCaseActions(c);
}

function kvHtml(pairs){
  var rows = pairs.filter(function(p){ return p[1]; });
  if(!rows.length) return '';
  return '<dl class="ckv">' + rows.map(function(p){
    return '<dt>' + esc(p[0]) + '</dt><dd>' + esc(p[1]) + '</dd>';
  }).join('') + '</dl>';
}

/* 案件的時間軸。每一筆都要看得到自己的審核狀態——
   翻譯在這裡就該發現「有一筆還沒送審」，不用切到送審頁一筆一筆對。 */
function ctlHtml(items){
  return '<div class="ctl">' + items.map(function(it){
    return '<div class="it' + (it.rv === '已歸檔' ? ' done' : '') + '">' +
      '<div class="d">' + esc(it.date) + (it.crew ? '　' + esc(it.crew) : '') +
        (it.mode ? '　' + esc(it.mode) : '') + '</div>' +
      '<div class="h">' + esc(it.sub || '服務紀錄') +
        (it.primary ? '' : '<span class="qq">關聯案件的</span>') + '</div>' +
      (it.how ? '<div class="x">' + esc(it.how) + '</div>' : '') +
      (it.result ? '<div class="x"><b>結果：</b>' + esc(it.result) + '</div>' : '') +
      '<span class="lk" data-rv="' + esc(it.rec) + '">' + esc(it.rec) +
        '　' + esc(RV_LABEL[it.rv] || it.rv) + ' ›</span>' +
    '</div>';
  }).join('') + '</div>';
}

/* 登機證。返鄉休假的細節存在 detail 裡，沒填的那幾格就不要畫出來，
   空的登機證比沒有登機證更難看。 */
function bpHtml(c){
  var d = c.detail || {};
  if(!d.out && !c.nextDate && !d.air) return '';
  var late = c.state.key === 'late';
  return '<div class="bp' + (late ? ' late' : '') + '">' +
    '<div class="hd">去程' + (d.air ? '　' + esc(d.air) : '') +
      (d.book ? '<b>' + esc(d.book) + '</b>' : '') + '</div>' +
    '<div class="leg">' +
      '<span class="ap"><b>' + esc(d.from || 'TPE') + '</b><span>' +
        esc(d.fromName || '桃園') + '</span></span>' +
      '<span class="arw"></span>' +
      '<span class="ap"><b>' + esc(d.to || '—') + '</b><span>' +
        esc(d.toName || '') + '</span></span>' +
    '</div>' +
    '<div class="dt"><div><span>離境</span><b>' + esc(d.out || '—') + '</b></div>' +
      (d.outTime ? '<div><span>起飛</span><b>' + esc(d.outTime) + '</b></div>' : '') +
    '</div>' +
    '<div class="cut"></div>' +
    '<div class="rt">回程' + (d.rair ? '　' + esc(d.rair) : '') +
      '　<b>' + esc(d.back || c.nextDate || '未定') + '</b>' +
      '<span class="tag">' + (late ? '逾期未回' : '應回台') + '</span></div>' +
  '</div>';
}

/* 掛號單。台灣的醫院掛號單就長這樣——看診號是翻譯在櫃檯要報的，
   所以它要最大。沒有預約的時候整張變灰，一眼看得出「還沒約」。 */
function slipHtml(c){
  var d = c.detail || {};
  if(!d.hos && !c.nextDate) return '';
  var none = !c.nextDate;
  return '<div class="slip' + (none ? ' none' : '') + '">' +
    '<div class="hd"><b>' + esc(d.hos || '尚未指定醫院') + '</b>' +
      (d.dep ? '<span>' + esc(d.dep) + '</span>' : '') + '</div>' +
    '<div class="no"><span class="big">' + esc(none ? '未約' : (d.no || '—')) +
      (none || !d.no ? '' : '<em>看診號</em>') + '</span>' +
      '<span class="wh"><b>' + esc(c.nextDate || '尚未預約') +
        (d.time ? '　' + esc(d.time) : '') + '</b><br>' +
        '<span>' + esc(d.room || c.nextNote || '') + '</span></span></div>' +
    (d.bring ? '<div class="ft"><b>要帶：</b>' + esc(d.bring) + '</div>' : '') +
  '</div>';
}

function drawCaseActions(c){
  var open = c.status === '進行中';
  /* id 一律寫死，不要用陣列拼。拼出來的 id 人 grep 不到、
     部署前的檢查器也看不到，等於少一道防線。 */
  var h = '';
  if(open && CASE_FORM_[c.kind]){
    h += '<button type="button" class="p full" id="ckNew">＋ 新增一筆服務紀錄</button>';
  }
  if(open){
    /* 「排下一次」四個字看不出在排什麼。照案件類型講白話，
       而且要講出「會排進行事曆」——那才是人真正在意的事。 */
    var NEXT_T = { '就醫追蹤': '回診', '體檢通知': '體檢', '返鄉休假': '回台' };
    var what = NEXT_T[c.kind] || '下一次';
    h += '<button type="button" class="sec full" id="ckNext">' +
      (c.nextDate ? ('改' + what + '日期　' + esc(c.nextDate))
                  : ('排' + what + '日期　會進行事曆')) + '</button>';
  }
  /* 體檢、返鄉、就醫都要傳訊息給移工。異常事件不傳——
     那是內部處理的事，不該群發給當事人。 */
  if(open && c.kind !== '異常事件'){
    h += '<button type="button" class="sec full" id="ckMsg">' +
      (c.kind === '體檢通知' ? '產生體檢通知訊息' :
       c.kind === '返鄉休假' ? '產生返鄉提醒訊息' : '產生回診提醒訊息') +
      '</button>';
  }
  if(open && c.kind === '異常事件' && !c.link){
    h += '<button type="button" class="sec full" id="ckMed">' +
      '這件要就醫　→　開一筆就醫追蹤</button>';
  }
  if(open) h += '<button type="button" class="q full" id="ckClose">結案</button>';
  $('ckAct').innerHTML = h ? ('<div class="stack">' + h + '</div>') : '';

  if($('ckNew')) $('ckNew').addEventListener('click', function(){ caseNewRecord(c); });
  if($('ckNext')) $('ckNext').addEventListener('click', function(){ caseSetNext(c); });
  if($('ckMsg')) $('ckMsg').addEventListener('click', function(){ openMsg(c, ''); });
  if($('ckMed')) $('ckMed').addEventListener('click', function(){ caseSpawnMed(c); });
  if($('ckClose')) $('ckClose').addEventListener('click', function(){ caseClose(c); });
}

/* 從案件開一張服務表：客戶、移工、服務類別、負責翻譯都帶過去，
   存檔之後自動掛回來。人只要填處理經過、結果、費用、簽名。 */
function caseNewRecord(c){
  CASE_FOR_ = c.id;
  $('caseModal').style.display = 'none';
  goTab('new');
  try {
    $('date').valueAsDate = new Date();
    setVal('client', c.client);
    setVal('crewOwner', c.crew || '');
    /* 服務類別不帶：它是每一張移工卡自己的 select[data-k=big]，
       不是頁面上的單一欄位。一趟服務可能每個人的項目都不同。 */
  } catch(e){}
  toast('填完存檔會自動掛回 ' + c.id);
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
      calBust(); openCase(c.id); loadTrack(true);
    })
    .withFailureHandler(function(e){ toast(e.message, true); })
    .setCaseNext(CODE, c.id, d, note);
}

function caseSpawnMed(c){
  if(!confirm('要開一筆就醫追蹤並跟這件連起來嗎？\n移工與雇主會直接帶過去。')) return;
  google.script.run
    .withSuccessHandler(function(r){
      toast('已開 ' + r.id);
      TK_CUR = '就醫追蹤'; TK_ROWS = []; TK_LOADED = '';
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
      TK_ROWS = []; TK_LOADED = ''; loadTrack(true); openCase(c.id);
    })
    .withFailureHandler(function(e){ alert(e.message); })
    .closeCase(CODE, c.id, r);
}

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
function openPick(d){
  if(!$('pickModal')){ toast('要先更新 App 才有追蹤功能', true); return; }
  PICK_D_ = d;
  $('pickEx').innerHTML = '';
  $('pickModal').style.display = '';
  google.script.run
    .withSuccessHandler(function(r){ drawPickEx((r && r.rows) || []); })
    .withFailureHandler(function(){})
    .openCasesForWorker(CODE, (d.workers || '').split('、')[0] || '', d.client || '');
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
  var d = PICK_D_ || {};
  $('pickModal').style.display = 'none';
  google.script.run
    .withSuccessHandler(function(r){
      toast('已開 ' + r.id);
      TK_CUR = kind; TK_ROWS = []; TK_LOADED = '';
      goTab('track');
      openCase(r.id);
    })
    .withFailureHandler(function(e){ toast(e.message, true); })
    .addCase(CODE, {
      kind: kind, client: d.client || '', workers: d.workers || '',
      lang: d.lang || '', big: d.big || '', sub: d.sub || '',
      title: d.sub || '', recCode: d.rc || '',
      // 行程代碼一定要傳。行程要記住自己屬於哪一件，
      // 之後從行事曆點進去填表，存檔時才掛得回來。
      schedId: d.go || ''
    });
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
  google.script.run
    .withSuccessHandler(function(){
      toast('已掛到 ' + id);
      TK_ROWS = []; TK_LOADED = ''; goTab('track'); openCase(id);
    })
    .withFailureHandler(function(e){ toast(e.message, true); })
    .attachRecord(CODE, id, d.rc);
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
function stepsHtml(c){
  var list = (CK_SCHEMA && CK_SCHEMA.steps && CK_SCHEMA.steps[c.kind]) || [];
  if(!list.length) return '';
  var at = list.indexOf(c.step);
  return '<div class="cbox"><h4>進度</h4><div class="steps">' +
    list.map(function(s, i){
      var cls = (at < 0) ? '' : (i < at ? 'done' : (i === at ? 'now' : ''));
      return '<button type="button" class="stp ' + cls + '" data-step="' + esc(s) + '">' +
        esc(s) + '</button>';
    }).join('') + '</div>' +
    '<p class="hint" style="margin:8px 0 0">點一下就換到那一格。按錯了再點回去就好。</p></div>';
}

/* 詳細欄位。沒填的不要顯示空白列——一整頁「—」看起來像壞掉。 */
function detailHtml(c){
  var defs = (CK_SCHEMA && CK_SCHEMA.fields && CK_SCHEMA.fields[c.kind]) || [];
  if(!defs.length) return '';
  var d = c.detail || {};
  var rows = defs.filter(function(f){
    return f.t === 'check' ? d[f.k] : (d[f.k] !== undefined && d[f.k] !== '');
  });
  var body = rows.length
    ? '<dl class="ckv">' + rows.map(function(f){
        return '<dt>' + esc(f.l) + '</dt><dd>' +
          (f.t === 'check' ? '✓' : esc(d[f.k])) + '</dd>';
      }).join('') + '</dl>'
    : '<p class="hint" style="margin:0">還沒填。按下面那顆把資料補上，' +
      (c.kind === '返鄉休假' ? '登機證' : c.kind === '體檢通知' ? '通知單' : '這一區') +
      '才有東西。</p>';
  return '<div class="cbox"><h4>' + esc(c.kind) + '的細節</h4>' + body +
    '<button type="button" class="sec full" id="ckEdit" style="margin-top:10px">' +
    (rows.length ? '修改細節' : '＋ 填寫細節') + '</button></div>';
}

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
