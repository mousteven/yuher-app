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
      MYSIG = r.mysig || '';

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
      applyMySig();

      var bd = $('revBadge');
      if(r.reviewCount){ bd.textContent = r.reviewCount; bd.style.display=''; }

      fixStick();
      // 行事曆的資料 bootstrap 已經帶回來了，不用再打一次
      if(r.sched){ CAL_YM = r.sched.ym; drawSched(r.sched); }
      else loadCal();
    })
    .withFailureHandler(loginFail)
    .svcBootstrap(code, cached ? cached.v : '', ymOf(new Date()));
}

function loginFail(e){
  $('btnLogin').disabled = false;
  $('login').style.display=''; $('app').style.display='none';
  var msg = (e && e.message) || '登入失敗';
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
    lgMsg('登入中…');
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
/* 反過來告訴外殼我們的頂欄與底欄該是什麼顏色，
   安全區域那一條才不會露出不搭的底色。 */
function tellShell(){
  try {
    if(window.parent && window.parent !== window){
      var cs = getComputedStyle(document.body);
      window.parent.postMessage({
        yuher: 'ready',
        top: cs.getPropertyValue('--chrome-bg').trim() || '#1B3B6F',
        bottom: cs.getPropertyValue('--card').trim() || '#ffffff'
      }, '*');
    }
  } catch(e){}
}

function appReload(){
  try {
    if(window.parent && window.parent !== window){
      window.parent.postMessage({ yuher: 'reload' }, '*');
      setTimeout(function(){ try{ top.location.reload(); }catch(e){} }, 700);
      return;
    }
  } catch(e){}
  try { top.location.reload(); } catch(e2){ location.reload(); }
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
    backToTop();
    if(b.dataset.t==='cal') loadCal();
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

  function card(r){
    var l = (r.lang||'').split('、')[0] || '';
    var cls = r.status==='已完成' ? 'done' : (r.status==='取消' ? 'cancel' : 'plan');
    return '<div class="ev '+cls+'">'+
      '<span class="bar lg-'+esc(l)+'"></span>'+
      '<span class="b"'+(r.recCode?' data-rec="'+esc(r.recCode)+'"':'')+'>'+
        '<span class="t">'+esc(r.slot||'未定時段')+'　'+esc(r.crew)+'</span>'+
        '<span class="n">'+esc(r.client)+
          (r.target&&r.target.indexOf('工廠')!==0?'　'+esc(r.target):'')+'</span>'+
        '<span class="m">'+esc(r.topic||'—')+
          (r.workers?'　·　'+esc(r.workers):'')+
          (r.recCode?'　<span class="code">'+esc(r.recCode)+'</span>':'')+'</span>'+
        (r.rv?progHtml(r.rv):'')+
      '</span>'+
      '<span class="acts">'+
        (r.status==='預排'
          ? '<button type="button" class="p" data-go="'+esc(r.id)+'">開始填寫</button>'+
            '<button type="button" data-cancel="'+esc(r.id)+'">取消</button>'
          : (r.recCode
              ? '<button type="button" data-pdf="'+esc(r.recCode)+'">PDF</button>'+
                // 送出去之後就不該再有送審鈕，狀態標籤講得比按鈕清楚
                ((r.rv==='未送審'||r.rv==='退回補正')
                  ? '<button type="button" data-sub="'+esc(r.recCode)+'">送審</button>' : '')
              : ''))+
      '</span></div>';
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
    bindDrag(card, r2.id, r2.status);
  });
  if(plan.length && CAL_VIEW !== 'day'){
    $('calDayList').insertAdjacentHTML('beforeend',
      '<p class="draghint">長按行程可以拖到上面的日期改期</p>');
  }

  // 點已完成那一趟的內文＝打開整張服務表，送審前先確認過
  [].forEach.call($('calDayList').querySelectorAll('[data-rec]'), function(b){
    b.addEventListener('click', function(){
      if(DRAG) return;                 // 拖曳中不要誤觸
      openRecord(b.dataset.rec);
    });
  });
  [].forEach.call($('calDayList').querySelectorAll('[data-go]'), function(b){
    b.addEventListener('click', function(){ startFromSchedule(b.dataset.go); });
  });
  [].forEach.call($('calDayList').querySelectorAll('[data-cancel]'), function(b){
    b.addEventListener('click', function(){
      google.script.run.withSuccessHandler(function(){
          toast('已取消'); calBust(); loadCal(); })
        .withFailureHandler(function(e){ toast(e.message,true); })
        .setScheduleStatus(CODE, b.dataset.cancel, '取消');
    });
  });
  [].forEach.call($('calDayList').querySelectorAll('[data-sub]'), function(b){
    b.addEventListener('click', function(){
      b.disabled = true;
      google.script.run
        // 重畫一次，卡片上的狀態標籤才會跟著變成「待副理審核」
        .withSuccessHandler(function(){
          toast('已送給副理審閱'); calBust(); loadCal(); refreshBadge(); })
        .withFailureHandler(function(e){ b.disabled=false; toast(e.message, true); })
        .submitForReview(CODE, b.dataset.sub);
    });
  });
  // 已完成的可以直接調 PDF 出來，不用回查詢頁再找一次
  [].forEach.call($('calDayList').querySelectorAll('[data-pdf]'), function(b){
    b.addEventListener('click', function(){
      b.disabled = true; b.textContent = '產生中…';
      google.script.run
        .withSuccessHandler(function(r){
          b.disabled=false; b.textContent='PDF';
          openDone(b.dataset.pdf, 0);
          $('dnOut').innerHTML =
            '<p class="hint" style="margin-bottom:8px">檔名：<b>'+esc(r.name)+'</b></p>'+
            '<div class="btns">'+
              '<a class="lk p" href="'+esc(r.url)+'" target="_blank" rel="noopener">開啟 PDF</a>'+
              '<a class="lk" href="https://line.me/R/msg/text/?'+
                encodeURIComponent('服務紀錄表 '+r.name.replace(/\.pdf$/,'')+
                                   String.fromCharCode(10)+r.url)+
                '" target="_blank" rel="noopener">分享到 LINE</a></div>';
        })
        .withFailureHandler(function(e){
          b.disabled=false; b.textContent='PDF'; toast(e.message, true);
        })
        .exportServiceSheetPdf(CODE, b.dataset.pdf);
    });
  });
}

/* ── 長按拖曳改期 ──────────────────────────────
   長按 500ms 進入拖曳，手指移到哪一天就亮哪一天，放開就改期。
   進入拖曳前不擋捲動，所以平常滑動不受影響。 */
var DRAG = null;
function bindDrag(el, id, status){
  if(status !== '預排') return;      // 已完成的連著紀錄，不給改期
  var timer = null, sx = 0, sy = 0;

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
    timer = setTimeout(function(){
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
    if(!DRAG){
      // 還沒進入拖曳，手指移動超過一點就當作是在捲動
      if(Math.abs(t.clientX-sx) > 8 || Math.abs(t.clientY-sy) > 8) cancel();
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
function startFromSchedule(id){
  var r = CAL_ROWS.filter(function(x){ return x.id===id; })[0];
  if(!r) return;
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
  box.__sig = {
    data:   function(){ return st.url; },
    signed: function(){ return !!st.url; },
    clear:  function(){ st.url=''; paint(); },
    set:    function(u){ st.url=u||''; paint(); }
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
$('save').addEventListener('click', function(){
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
  if(!workers.length){ toast('每位移工都要選服務類別與細項', true); return; }
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
        calBust();
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
      calBust();                  // 那一趟會從「待處理」變「已完成」
      try{ openDone(r.code, r.count); }
      catch(err){ toast('已存檔（'+r.code+'），但面板打不開：'+err.message, true); }
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

/* ── 存檔完成：要不要輸出 PDF 給雇主 ─────────────────────
   雇主常常當場就說「給我一份」，所以存完直接給 PDF 與分享按鈕，
   不用再回去查詢頁重找一次。 */
var DONE_CODE_ = '';
var PDF_FORCE_ = false;   // 產過的 PDF 直接沿用，不要每按一次就在硬碟多一個檔
function openDone(code, cnt){
  DONE_CODE_ = code;
  $('dnCode').textContent = code;
  $('dnCnt').textContent = cnt;
  $('dnOut').innerHTML = '';
  $('dnPdf').disabled = false;
  $('dnPdf').textContent = '輸出 PDF 給雇主';
  $('dnSubmit').disabled = false; $('dnSubmit').textContent = '送審';
  PDF_FORCE_ = false;
  $('doneModal').style.display = '';
}
$('dnClose').addEventListener('click', function(){
  $('doneModal').style.display='none'; resetForm();
});
/* 存完直接回行事曆：那一趟會從「待處理」移到「已完成」，
   一天下來往下滑就是當天的成果。 */
/* 跑完就送審，不要等回辦公室才想起來——紙本流程最常卡在這一步 */
$('dnSubmit').addEventListener('click', function(){
  var b = $('dnSubmit'); b.disabled = true;
  google.script.run
    .withSuccessHandler(function(){ b.textContent='已送審'; toast('已送給副理審閱'); })
    .withFailureHandler(function(e){ b.disabled=false; toast(e.message, true); })
    .submitForReview(CODE, DONE_CODE_);
});
$('dnCal').addEventListener('click', function(){
  $('doneModal').style.display='none';
  resetForm();
  document.querySelector('.tabs button[data-t=cal]').click();
  window.scrollTo(0,0);
});
$('dnPdf').addEventListener('click', function(){
  var b = $('dnPdf'); b.disabled = true; b.textContent = '產生中…';
  $('dnOut').innerHTML = '<p class="hint">正在把紀錄轉成 PDF，約 10 秒…</p>';
  google.script.run
    .withSuccessHandler(function(r){
      b.textContent = '重新產生'; b.disabled = false;
      var msg = '服務紀錄表 ' + r.name.replace(/\.pdf$/,'') + String.fromCharCode(10) + r.url;
      $('dnOut').innerHTML =
        '<p class="hint" style="margin-bottom:8px">檔名：<b>'+esc(r.name)+'</b></p>'+
        '<div class="btns">'+
          '<a class="lk p" href="'+esc(r.url)+'" target="_blank" rel="noopener">開啟 PDF</a>'+
          '<a class="lk" href="https://line.me/R/msg/text/?'+encodeURIComponent(msg)+
            '" target="_blank" rel="noopener">分享到 LINE</a>'+
        '</div>'+
        '<button type="button" class="cp" data-u="'+esc(r.url)+'">複製連結</button>';
      $('dnOut').querySelector('.cp').addEventListener('click', function(){
        var t = document.createElement('textarea');
        t.value = this.dataset.u; document.body.appendChild(t); t.select();
        try{ document.execCommand('copy'); toast('連結已複製'); }
        catch(e){ toast('複製失敗，請長按連結複製', true); }
        t.remove();
      });
    })
    .withFailureHandler(function(e){
      b.disabled = false; b.textContent = '再試一次';
      $('dnOut').innerHTML = '<p class="hint" style="color:var(--danger)">'+esc(e.message)+'</p>';
    })
    .exportServiceSheetPdf(CODE, DONE_CODE_, PDF_FORCE_);
  PDF_FORCE_ = true;   // 第一次用已產好的檔，之後按才是真的重新產生
});

$('pvBack').addEventListener('click', function(){ $('pvModal').style.display='none'; });
$('pvSign').addEventListener('click', function(){
  $('pvModal').style.display='none';
  // 看完直接把畫面帶到簽名區，不用自己再捲回去找
  var box = document.querySelector('[data-sig=worker]') ||
            document.querySelector('[data-sig=employer]');
  if(box) box.scrollIntoView({behavior:'smooth', block:'center'});
});

function resetForm(){
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

function loadFollow(){
  $('p-follow').innerHTML = '<div class="mid">載入中…</div>';
  google.script.run
    .withSuccessHandler(function(r){ REV = r; REV_PICK = []; drawReview(); })
    .withFailureHandler(function(e){
      $('p-follow').innerHTML = '<div class="mid">'+esc(e.message)+'</div>'; })
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

  var html =
    '<div class="rvhead"><b>'+esc(r.queueTitle)+'　'+r.queue.length+'</b>'+
      '<em>'+esc(r.role)+'　'+esc(r.me)+'</em></div>' +
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
        loadFollow();
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
function openRecord(recCode){
  showReviewModal(recCode, function(){ calBust(); loadCal(); refreshBadge(); });
}

var RV_CODE = '';
var RV_DETAIL = null;
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
  $('rvBody').innerHTML = '<div class="mid" style="padding:30px">讀取中…</div>';
  $('rvAct').innerHTML = '';
  $('revModal').style.display = '';
  $('rvBody').scrollTop = 0;

  google.script.run
    .withSuccessHandler(function(d){
      RV_DETAIL = d;
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
function drawRecordBody(d){
  var t = d.trip, ws = d.workers || [];
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
  var h = '';
  if(role === '翻譯' && (r.status === '未送審' || r.status === '退回補正')){
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
    h = '<p class="hint">'+esc(RV_LABEL[r.status]||r.status)+
        (r.mgr?('　·　副理：'+esc(r.follow||'不需追蹤')):'')+
        (r.boss?('　·　總經理 '+esc(r.boss)):'')+'</p>';
  }
  $('rvAct').innerHTML = h;

  var eb = $('rvEdit');
  if(eb) eb.addEventListener('click', function(){ startEdit(RV_CODE); });
  var sb = $('rvSubmit');
  if(sb) sb.addEventListener('click', function(){
    sb.disabled = true;
    google.script.run
      .withSuccessHandler(function(){ toast('已送審'); closeReview(); })
      .withFailureHandler(function(e){ sb.disabled=false; toast(e.message,true); })
      .submitForReview(CODE, r.code);
  });

  var ok = $('rvOk');
  if(ok) ok.addEventListener('click', function(){
    ok.disabled = true;
    var note = $('rvNote') ? $('rvNote').value.trim() : '';
    var f = (document.querySelector('input[name=rvf]:checked')||{}).value || '不需追蹤';
    var done = function(){ toast('已完成'); closeReview(); };
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
      .withSuccessHandler(function(){ toast('已退回'); closeReview(); })
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
    var gap = past.length ? ('缺 '+past.map(function(g){ return g+'月'; }).join('、'))
            : x.gaps.length ? ('最晚 '+x.gaps[0]+' 月要去')
            : '目前正常';
    return '<div class="evw'+(st==='miss'?' bad':'')+'">'+
      '<div class="hd"><b>'+esc(x.name)+'</b>'+
        // 家庭類的移工只有原文名，中文名欄位放的就是原文名，不要印兩次
        ((x.orig && x.orig !== x.name)?'<span class="or">'+esc(x.orig)+'</span>':'')+
        '<span class="kd'+(x.kind==='續聘'?' re':'')+'">'+x.kind+' '+x.start+'月</span>'+
        '<span class="st">'+esc(x.crew||'')+'</span></div>'+
      '<div class="sub">'+esc(x.client)+'　<em>'+esc(x.lang||'')+
        (x.status!=='在職'?('　·　'+esc(x.status)+'，義務到 '+x.endM+' 月'):'')+
        '　·　'+esc(gap)+'</em></div>'+
      mon+
      '<div class="evgrid">'+
        x.cell.map(function(c,i){
          var cls = c + ((i+1)===x.start ? ' start' : '');
          var txt = c==='ok' ? '✓' : c==='miss' ? '✕' : c==='due' ? '・' : '';
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

/* 記得上次的登入碼，直接進去 */
if(CODE){ $('code').value = CODE; login(CODE); }
else { $('login').style.display=''; }   // 沒碼才需要登入畫面
