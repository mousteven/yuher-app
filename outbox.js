/* 離線暫存：訊號不好的時候，服務表先存在手機裡，有訊號再自動送出。

   ══ 為什麼要這個 ══════════════════════════════════════════
   牟佑彬 2026-09-21：「有時候去工廠他們的網路不是很好，填寫服務表可能
   因為沒有訊號或訊號不好導致無法儲存。」
   在工廠裡填了二十分鐘的表，按儲存失敗就整份不見——這是最傷的一種失敗。

   ══ 三條規則，改動之前先讀 ════════════════════════════════

   ⛔ **1. 先存手機，再送後端。** 順序不能反。
      先送的話，App 在送出過程中被切掉（電話進來、手機沒電、使用者手滑
      關掉分頁）就什麼都不剩。先存再送，最壞的情況是「還在手機裡」。

   ⛔ **2. 每一次送出都帶同一組 cid。** 工廠訊號差最常見的不是「送不出去」，
      而是**送出去了、回應沒收到**。沒有 cid 的話，重送就變成兩筆一模一樣的
      服務紀錄，副理會看到兩份。後端 svcFindByCid_ 認這一組。
      ⚠ cid 只在「建立這一筆」的時候產生一次，重送**絕對不可以**重新產生。

   ⛔ **3. 不是所有失敗都該重試。** 「請先選工廠」這種是內容有問題，
      重試一百次還是一樣，而且會一直跳錯誤打擾他。
      只有看起來像連線問題的才留著重試；連續失敗 MAX_TRY 次就停下來，
      把錯誤訊息顯示出來讓人處理。**安靜地無限重試比失敗更糟。**

   ══ 為什麼用 IndexedDB 而不是 localStorage ════════════════
   一份表可能有六七張簽名，每張幾十 KB 的 PNG。localStorage 只有 5MB，
   而且是同步的——存大字串會卡住畫面。IndexedDB 沒有這兩個問題。 */

var OB = (function () {
  var DB = 'yuher-outbox', STORE = 'jobs', VER = 1;
  var MAX_TRY = 8;            // 超過就停下來問人，不要安靜地一直試
  var db = null, opening = null;

  function open() {
    if (db) return Promise.resolve(db);
    if (opening) return opening;
    opening = new Promise(function (ok, bad) {
      var r = indexedDB.open(DB, VER);
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains(STORE)) {
          d.createObjectStore(STORE, { keyPath: 'cid' });
        }
      };
      r.onsuccess = function () { db = r.result; ok(db); };
      r.onerror = function () { bad(r.error); };
    });
    return opening;
  }

  function tx(mode, fn) {
    return open().then(function (d) {
      return new Promise(function (ok, bad) {
        var t = d.transaction(STORE, mode);
        var st = t.objectStore(STORE);
        var out = fn(st);
        t.oncomplete = function () { ok(out && out.result !== undefined ? out.result : out); };
        t.onerror = function () { bad(t.error); };
        t.onabort = function () { bad(t.error); };
      });
    });
  }

  /* ⚠ 一定要用亂數，不要用時間戳。同一個人同一秒按兩次儲存是有可能的
     （手指抖、或按了沒反應再按一次），時間戳會撞在一起變成同一筆。 */
  function newCid() {
    try {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    } catch (e) {}
    return 'c' + Date.now().toString(36) + '-' +
           Math.random().toString(36).slice(2, 10) +
           Math.random().toString(36).slice(2, 10);
  }

  function put(job) { return tx('readwrite', function (st) { st.put(job); }); }
  function del(cid) { return tx('readwrite', function (st) { st.delete(cid); }); }
  function all() {
    return tx('readonly', function (st) { return st.getAll(); })
      .then(function (r) { return (r || []).sort(function (a, b) { return a.at - b.at; }); });
  }
  function get(cid) { return tx('readonly', function (st) { return st.get(cid); }); }

  return { open: open, newCid: newCid, put: put, del: del, all: all, get: get,
           MAX_TRY: MAX_TRY };
})();

/* ── 是不是「連線問題」？ ────────────────────────────────

   ⛔ 這個判斷決定了「要不要留著重試」，寫錯的代價是兩種：
      判太寬 → 內容有問題的表一直重送，永遠不會好，他也看不到真正的原因。
      判太嚴 → 訊號不好的表被當成壞掉丟掉，那就白做這整套了。

   後端丟出來的都是我們自己寫的中文訊息（「請先選…」「不認得的服務細項…」），
   連線問題則是瀏覽器或 Apps Script 給的英文／逾時訊息。
   ⚠ 所以規則是**反過來的**：看起來像我們自己丟的中文訊息＝內容問題，
     其餘一律當連線問題留著。寧可多留，不要弄丟。 */
function obIsNetwork(msg) {
  msg = String(msg || '');
  if (!msg) return true;                       // 什麼都沒有，多半是斷線
  if (!navigator.onLine) return true;          // 手機自己說沒網路，直接算
  /* 我們自己丟的業務錯誤：一定含中文，而且是這幾種開頭 */
  if (/請先|請選|至少要|不認得|找不到|沒有權限|登入碼|已經送審|不能修改/.test(msg)) {
    return false;
  }
  return true;
}
