/* 常用回覆（罐頭訊息）— React 版
   ─────────────────────────────────────────────────────────
   住在 GitHub Pages。Apps Script 那邊的 Quick.html 只剩一個外殼，
   改這個檔推上去約十分鐘生效，**不用重新部署、不吃版本額度**。

   為什麼可以這樣：頁面本身還是由 Apps Script 送出的，
   所以 `google.script.run` 照樣能用（那是它注入到頁面裡的）。
   搬走的只有版面與邏輯。

   沒有打包步驟：React 從 cdnjs 載 UMD 版，JSX 用 htm（1.2KB）的
   標籤樣板代替，瀏覽器直接跑，不需要 Babel。

   資料流很簡單，不需要 Zustand：
     一份 data（items + folders）＋ 幾個 UI 狀態，全部放在 App 裡，
     用 props 傳下去。開頁時先畫 localStorage 的快取（秒開），
     再跟後端要最新的蓋上去。
   ───────────────────────────────────────────────────────── */

(function () {
  'use strict';

  var h = React.createElement;
  var html = htm.bind(h);
  var useState = React.useState, useEffect = React.useEffect,
      useMemo = React.useMemo, useRef = React.useRef;

  var CACHE_KEY = 'quickReplies.v2';
  var LANGS = [{ k: 'zh', n: '中' }, { k: 'en', n: 'EN' }, { k: 'tl', n: 'TL' }];
  var LANG_FULL = { zh: '中文', en: 'English', tl: 'Tagalog' };

  /* ── 後端 ─────────────────────────────────────────
     這一頁會呼叫到的後端函式，全部列在這裡。

     有兩個作用：
     1. `scripts/check_backend_calls.js` 拿這份清單去對 `.gs` 有沒有這幾支。
        動態呼叫（`run[name](…)`）它掃不到名字，沒有清單就等於沒在檢查，
        打錯字會靜默上線，使用者按下去才發現。
     2. 下面的 api() 會擋掉不在清單上的名字，當場就報錯。 */
  var BACKEND = ['listQuickReplies', 'addQuickReply', 'updateQuickReply',
                 'deleteQuickReply', 'bumpQuickReply', 'getQuickFileData',
                 'translateQuickText'];

  /* 後端是 callback 式的，包成 Promise 才好接。 */
  function api(name) {
    var args = [].slice.call(arguments, 1);
    return new Promise(function (ok, no) {
      if (BACKEND.indexOf(name) === -1) {
        no(new Error('程式錯誤：沒有宣告的後端函式 ' + name)); return;
      }
      if (typeof google === 'undefined' || !google.script) {
        no(new Error('這一頁要從 Apps Script 的網址開啟')); return;
      }
      google.script.run.withSuccessHandler(ok).withFailureHandler(no)[name].apply(null, args);
    });
  }

  /* ── 圖示（Lucide 風格：stroke 1.75、圓端點）────── */
  var PATHS = {
    text:  '<path d="M4 7V5h16v2"/><path d="M12 5v14"/><path d="M9 19h6"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
    video: '<path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
    file:  '<path d="M14 3v5h5"/><path d="M15 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/>',
    link:  '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
    star:  '<path d="m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-2.9L6.7 19.6l1.1-6L3.4 9.4l6-.8z"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    empty: '<path d="M3 7h18"/><path d="M6 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12"/>'
  };
  function Tile(p) {
    var cls = 'tile' + (p.sm ? ' sm' : '');
    return html`<span className=${cls} dangerouslySetInnerHTML=${{
      __html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' +
        (PATHS[p.name] || PATHS.text) + '</svg>'
    }}/>`;
  }

  var KIND = { text: '文字', image: '圖片', video: '影片', file: '檔案', link: '連結' };

  /* ── 資料夾的兩層：試算表只有一欄，用「上層-下層」表示從屬 ── */
  function topOf(f) { var i = f.indexOf('-'); return i < 0 ? f : f.slice(0, i); }
  function subOf(f) { var i = f.indexOf('-'); return i < 0 ? '' : f.slice(i + 1); }

  function textOf(it, lang) { return (it[lang] || '').trim(); }
  /* 這個語言沒有內容時，退而求其次給有的那個。
     原本的做法是顯示「還沒有中文」——那等於整張卡不能用。 */
  function anyText(it, lang) {
    var t = textOf(it, lang);
    if (t) return { text: t, lang: lang, fallback: false };
    for (var i = 0; i < LANGS.length; i++) {
      var k = LANGS[i].k;
      if (k !== lang && textOf(it, k)) return { text: textOf(it, k), lang: k, fallback: true };
    }
    return { text: '', lang: lang, fallback: false };
  }
  function langFull(k) { return LANG_FULL[k] || k; }

  /* ── 複製：內嵌框架裡新版剪貼簿 API 常被權限政策擋掉，
        先試新的，失敗退回 execCommand（框架裡一定能用）。 ── */
  function copyText(text) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      return ok;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; },
                                                      function () { return fallback(); });
    }
    return Promise.resolve(fallback());
  }

  /* ════════════════════════════════════════════════
     元件
     ════════════════════════════════════════════════ */

  /* 頁首那一句人話。規範：標題是事實加細節，不是分類名。
     「常用回覆」是分類名；「43 張訊息，最常用的是體檢」才是事實。 */
  function Lead(p) {
    var items = p.items;
    if (!items.length) {
      return html`<div className="lead">
        <${Tile} name="empty"/>
        <span className="tx">
          <b>還沒有任何罐頭訊息</b>
          <em>把每天重複打的話存進來，之後點一下就複製。按右下角「＋ 新增」開始。</em>
        </span>
      </div>`;
    }
    var folders = {};
    items.forEach(function (x) { folders[topOf(x.folder || '未分類')] = 1; });
    var nf = Object.keys(folders).length;
    var top = items.slice().sort(function (a, b) { return (b.uses || 0) - (a.uses || 0); })[0];
    var lead = top && top.uses
      ? items.length + ' 張訊息，最常用的是「' + (top.title || '無標題') + '」（用了 ' + top.uses + ' 次）'
      : items.length + ' 張訊息，分成 ' + nf + ' 類';
    return html`<div className="lead">
      <${Tile} name=${top && top.uses ? 'star' : 'text'}/>
      <span className="tx">
        <b>${lead}</b>
        <em>點卡片上的「複製」就進剪貼簿，直接貼到 LINE。圖片跟檔案按「分享」。</em>
      </span>
    </div>`;
  }

  function FolderBar(p) {
    var raw = p.folders, cur = p.cur, counts = p.counts;
    var tops = [];
    raw.forEach(function (f) { var t = topOf(f); if (tops.indexOf(t) === -1) tops.push(t); });
    var curTop = cur === '全部' ? '全部' : topOf(cur);
    var subs = raw.filter(function (f) { return topOf(f) === curTop && subOf(f); });

    function chip(f, label, on, n) {
      return html`<button key=${f} className=${on ? 'on' : ''} onClick=${function () { p.onPick(f); }}>
        ${label}${n != null ? html`<span className="n">${n}</span>` : null}
      </button>`;
    }
    return html`<${React.Fragment}>
      <div className="folders">
        ${chip('全部', '全部', cur === '全部', p.total)}
        ${tops.map(function (t) { return chip(t, t, curTop === t, counts[t] || 0); })}
      </div>
      ${(cur !== '全部' && subs.length) ? html`<div className="folders subs">
        ${chip(curTop, '全部', cur === curTop)}
        ${subs.map(function (f) { return chip(f, subOf(f), cur === f); })}
      </div>` : null}
    <//>`;
  }

  function Card(p) {
    var it = p.it, lang = p.lang;
    var isText = it.type === 'text' || it.type === 'link';
    var got = isText ? anyText(it, lang) : { text: '', fallback: false };

    var head = null;
    if (it.type === 'image' && it.thumb) {
      head = html`<img className="th" loading="lazy" src=${it.thumb} alt=""/>`;
    } else if (it.type === 'video' || it.type === 'file') {
      head = html`<div className="filebox">
        <${Tile} sm name=${it.type}/>${it.fileName || KIND[it.type]}
      </div>`;
    }

    return html`<div className="card">
      <div className="hd">
        <${Tile} sm name=${it.type || 'text'}/>
        <span className="kind">${KIND[it.type] || '文字'}</span>
        ${it.uses ? html`<span className="uses">用了 ${it.uses} 次</span>` : null}
      </div>
      ${head}
      <div className="bd">
        <div className="t">${it.title || '(無標題)'}</div>
        ${isText ? (got.text
          ? html`<div className=${got.fallback ? 'alt' : ''}>
              ${got.fallback ? html`<span className="altbadge">只有${langFull(got.lang)}</span>` : null}
              <div className="p">${got.text}</div>
            </div>`
          : html`<div className="p" style=${{ color: 'var(--ink3)' }}>這張卡還沒有文字</div>`) : null}
      </div>
      <div className="ft">
        <button className="go" onClick=${function () { p.onMain(it); }}>
          ${isText ? ('複製' + langFull(got.lang || lang)) : ('分享' + (KIND[it.type] || '檔案'))}
        </button>
        <button className="more" onClick=${function () { p.onMore(it); }}>⋯</button>
      </div>
    </div>`;
  }

  /* ── 更多動作 ─────────────────────────────────── */
  function MoreSheet(p) {
    var it = p.it;
    var isText = it.type === 'text' || it.type === 'link';
    return html`<div className="sheet on" onClick=${function (e) {
      if (e.target === e.currentTarget) p.onClose();
    }}>
      <div className="panel">
        <h3>${it.title || '(無標題)'}</h3>
        ${isText ? LANGS.filter(function (L) { return textOf(it, L.k); }).map(function (L) {
          return html`<button key=${L.k} className="act" onClick=${function () { p.onCopy(it, L.k); }}>
            複製${LANG_FULL[L.k]}<small>${textOf(it, L.k).slice(0, 48)}…</small>
          </button>`;
        }) : null}
        <button className="act" onClick=${function () { p.onEdit(it); }}>
          修改這張卡<small>改文字、換資料夾、補其他語言</small>
        </button>
        <button className="act bad" onClick=${function () { p.onDelete(it); }}>
          刪除這張卡<small>刪掉之後救不回來</small>
        </button>
        <div className="btns"><button onClick=${p.onClose}>關閉</button></div>
      </div>
    </div>`;
  }

  /* ── 新增／編輯 ───────────────────────────────── */
  function EditSheet(p) {
    var init = p.it;
    var [type, setType] = useState((init && init.type) || 'text');
    var [title, setTitle] = useState((init && init.title) || '');
    var [folder, setFolder] = useState((init && init.folder) || (p.curFolder !== '全部' ? p.curFolder : ''));
    var [zh, setZh] = useState((init && init.zh) || '');
    var [en, setEn] = useState((init && init.en) || '');
    var [tl, setTl] = useState((init && init.tl) || '');
    var [busy, setBusy] = useState('');
    var fileRef = useRef(null);
    var [fileName, setFileName] = useState('');

    var editing = !!(init && init.id);
    var isText = type === 'text';

    function translate() {
      if (!zh.trim()) { p.toast('先寫中文', true); return; }
      setBusy('翻譯中…');
      api('translateQuickText', zh).then(function (r) {
        if (r && r.en) setEn(r.en);
        if (r && r.tl) setTl(r.tl);
        setBusy('');
        p.toast('翻好了，存之前自己看一下');
      }, function (e) { setBusy(''); p.toast('翻譯失敗：' + e.message, true); });
    }

    function save() {
      var payload = { type: type, title: title.trim(), folder: folder.trim() || '未分類' };
      if (isText) {
        if (!zh.trim() && !en.trim() && !tl.trim()) { p.toast('至少要填一種語言', true); return; }
        payload.zh = zh; payload.en = en; payload.tl = tl;
      }
      setBusy('儲存中…');

      function done(msg) { setBusy(''); p.onSaved(msg); }
      function fail(e) { setBusy(''); p.toast('存不進去：' + e.message, true); }

      if (editing) {
        api('updateQuickReply', init.id, payload).then(function () { done('已更新'); }, fail);
        return;
      }
      if (isText) {
        api('addQuickReply', payload).then(function () { done('已新增'); }, fail);
        return;
      }
      var f = fileRef.current && fileRef.current.files[0];
      if (!f) { setBusy(''); p.toast('先選一個檔案', true); return; }
      if (f.size > 20 * 1024 * 1024) { setBusy(''); p.toast('檔案超過 20MB，先壓縮一下', true); return; }
      var fr = new FileReader();
      fr.onload = function () {
        payload.file = {
          name: f.name, mimeType: f.type || 'application/octet-stream',
          dataBase64: String(fr.result).split(',')[1]
        };
        api('addQuickReply', payload).then(function () { done('已新增'); }, fail);
      };
      fr.onerror = function () { setBusy(''); p.toast('讀不到這個檔案', true); };
      fr.readAsDataURL(f);
    }

    return html`<div className="sheet on" onClick=${function (e) {
      if (e.target === e.currentTarget && !busy) p.onClose();
    }}>
      <div className="panel">
        <h3>${editing ? '修改' : '新增一張罐頭訊息'}</h3>

        ${!editing ? html`<${React.Fragment}>
          <div className="typegrid">
            ${['text', 'image', 'video', 'file'].map(function (t) {
              return html`<button key=${t} className=${type === t ? 'on' : ''}
                onClick=${function () { setType(t); }}>
                <${Tile} sm name=${t}/>${KIND[t]}
              </button>`;
            })}
          </div>
          <div className="hint">圖片／影片／檔案上限 20MB，會存進你自己的雲端硬碟「常用回覆素材」資料夾。</div>
        <//>` : null}

        ${(!editing && !isText) ? html`<div className="field">
          <label>選擇檔案</label>
          <input type="file" ref=${fileRef} onChange=${function (e) {
            var f = e.target.files[0];
            setFileName(f ? (f.name + '　' + Math.round(f.size / 1024) + ' KB') : '');
          }}/>
          ${fileName ? html`<div className="hint">${fileName}</div>` : null}
        </div>` : null}

        <div className="field">
          <label>標題（自己看的，例如：合約到期怎麼辦）</label>
          <input value=${title} maxLength="40" placeholder="留空會自動用內容前幾個字"
                 onChange=${function (e) { setTitle(e.target.value); }}/>
        </div>

        <div className="field">
          <label>資料夾（子分類用「上層-下層」，例如 保險-comparison）</label>
          <input value=${folder} list="folderList" placeholder="未分類"
                 onChange=${function (e) { setFolder(e.target.value); }}/>
          <datalist id="folderList">
            ${p.folders.map(function (f) { return html`<option key=${f} value=${f}/>`; })}
          </datalist>
        </div>

        ${isText ? html`<${React.Fragment}>
          <div className="field">
            <label>中文</label>
            <textarea value=${zh} placeholder="你要說的話"
                      onChange=${function (e) { setZh(e.target.value); }}/>
          </div>
          <button className="act" style=${{ textAlign: 'center', color: 'var(--brand)' }}
                  disabled=${!!busy} onClick=${translate}>
            ⇩ 用中文自動翻成英文與他加祿語
            <small>機器翻譯，存之前自己看一下</small>
          </button>
          <div className="field">
            <label>English</label>
            <textarea value=${en} placeholder="English version"
                      onChange=${function (e) { setEn(e.target.value); }}/>
          </div>
          <div className="field">
            <label>Tagalog</label>
            <textarea value=${tl} placeholder="Tagalog na bersyon"
                      onChange=${function (e) { setTl(e.target.value); }}/>
          </div>
        <//>` : null}

        <div className="btns">
          <button disabled=${!!busy} onClick=${p.onClose}>取消</button>
          <button className="primary" disabled=${!!busy} onClick=${save}>${busy || '儲存'}</button>
        </div>
      </div>
    </div>`;
  }

  /* ════════════════════════════════════════════════
     主畫面
     ════════════════════════════════════════════════ */
  function App() {
    var [data, setData] = useState({ items: [], folders: [] });
    var [loading, setLoading] = useState(true);
    var [lang, setLang] = useState(function () {
      try { return localStorage.getItem('quickReplies.lang') || 'zh'; } catch (e) { return 'zh'; }
    });
    var [folder, setFolder] = useState('全部');
    var [kw, setKw] = useState('');
    var [more, setMore] = useState(null);
    var [edit, setEdit] = useState(null);      // {} = 新增；{id:…} = 改
    var [msg, setMsg] = useState(null);

    /* 這幾個以前包了 useCallback，是為了互相滿足 dep 陣列。
       但沒有任何子元件包 React.memo，記憶化買不到東西——純粹是儀式。
       掛載的 effect 依賴改成 []（它本來就只該跑一次），整串就不用記憶化了。 */
    var toastTimer = useRef(0);
    function toast(text, bad) {
      setMsg({ text: text, bad: bad });
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(function () { setMsg(null); }, bad ? 3200 : 1600);
    }

    /* 先畫快取（秒開），再跟後端要最新的。
       Apps Script 冷啟動要一兩秒，沒有快取的話那兩秒是全白的。 */
    function refresh(quiet) {
      if (!quiet) setLoading(true);
      return api('listQuickReplies').then(function (res) {
        setData(res); setLoading(false);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(res)); } catch (e) {}
      }, function (e) {
        setLoading(false);
        toast('讀不到資料：' + e.message, true);
      });
    }

    useEffect(function () {
      try {
        var raw = localStorage.getItem(CACHE_KEY);
        if (raw) { setData(JSON.parse(raw)); setLoading(false); }
      } catch (e) {}
      refresh(true);
      // 只在掛載時跑一次。refresh 每次 render 都是新的函式，
      // 放進依賴會變成無限迴圈——這正是當初包 useCallback 的原因。
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(function () {
      try { localStorage.setItem('quickReplies.lang', lang); } catch (e) {}
    }, [lang]);

    var rows = useMemo(function () {
      var q = kw.trim().toLowerCase();
      /* 選上層時連子分類一起看到（選「保險」＝保險＋comparison＋document），
         選子分類才只看那一層。跟他 KeyGo 的行為一致。 */
      function inFolder(f) {
        if (folder === '全部' || f === folder) return true;
        return subOf(folder) === '' && topOf(f) === folder;
      }
      return (data.items || []).filter(function (it) {
        if (!inFolder(it.folder || '未分類')) return false;
        if (!q) return true;
        return [it.title, it.zh, it.en, it.tl, it.folder, it.fileName]
          .some(function (s) { return String(s || '').toLowerCase().indexOf(q) !== -1; });
      });
    }, [data.items, kw, folder]);

    var counts = useMemo(function () {
      var c = {};
      (data.items || []).forEach(function (it) {
        var t = topOf(it.folder || '未分類');
        c[t] = (c[t] || 0) + 1;
      });
      return c;
    }, [data.items]);

    function bump(it) {
      setData(function (d) {
        return Object.assign({}, d, {
          items: d.items.map(function (x) {
            return x.id === it.id ? Object.assign({}, x, { uses: (x.uses || 0) + 1 }) : x;
          })
        });
      });
      api('bumpQuickReply', it.id).catch(function () {});
    }

    function doCopy(it, useLang) {
      var got = useLang ? { text: textOf(it, useLang), lang: useLang } : anyText(it, lang);
      if (!got.text) { toast('這張卡還沒有文字', true); return; }
      copyText(got.text).then(function (ok) {
        toast(ok ? ('已複製' + langFull(got.lang)) : '複製失敗，請長按選取', !ok);
        if (ok) bump(it);
      });
      setMore(null);
    }

    function share(it) {
      toast('準備檔案中…');
      api('getQuickFileData', it.id).then(function (f) {
        var bin = atob(f.dataBase64);
        var arr = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        var blob = new Blob([arr], { type: f.mimeType });
        var file = new File([blob], f.name, { type: f.mimeType });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file] }).then(function () { bump(it); }, function () {});
          return;
        }
        // 內嵌框架裡原生分享常被擋，退回下載讓他自己傳
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = f.name;
        document.body.appendChild(a); a.click(); a.remove();
        toast('已下載，請自己傳出去');
        bump(it);
      }, function (e) { toast('拿不到檔案：' + e.message, true); });
    }

    function del(it) {
      if (!window.confirm('確定刪掉「' + (it.title || '這張卡') + '」？救不回來。')) return;
      setMore(null);
      api('deleteQuickReply', it.id).then(function () {
        toast('已刪除'); refresh(true);
      }, function (e) { toast('刪不掉：' + e.message, true); });
    }

    var body;
    if (loading) {
      body = html`<div className="grid">
        ${[0, 1, 2, 3, 4, 5].map(function (i) {
          return html`<div key=${i} className="skel"><i/></div>`;
        })}
      </div>`;
    } else if (!rows.length) {
      body = html`<div className="empty">
        ${(data.items || []).length
          ? html`<${React.Fragment}><b>這個條件下沒有東西</b>換個資料夾，或把搜尋清空。<//>`
          : html`<${React.Fragment}><b>還沒有任何罐頭訊息</b>
              按右下角「＋ 新增」，把你每天重複打的話存進來。<//>`}
      </div>`;
    } else {
      body = html`<div className="grid">
        ${rows.map(function (it) {
          return html`<${Card} key=${it.id} it=${it} lang=${lang}
            onMain=${function (x) {
              (x.type === 'text' || x.type === 'link') ? doCopy(x) : share(x);
            }}
            onMore=${setMore}/>`;
        })}
      </div>`;
    }

    return html`<${React.Fragment}>
      <div className="top">
        <${Lead} items=${data.items || []}/>
        <div className="row1">
          <input id="q" type="search" value=${kw} placeholder="搜尋內容或標題…"
                 autoComplete="off" onChange=${function (e) { setKw(e.target.value); }}/>
          <div className="langs">
            ${LANGS.map(function (L) {
              return html`<button key=${L.k} className=${lang === L.k ? 'on' : ''}
                onClick=${function () { setLang(L.k); }}>${L.n}</button>`;
            })}
          </div>
        </div>
        <${FolderBar} folders=${data.folders || []} cur=${folder} counts=${counts}
                      total=${(data.items || []).length} onPick=${setFolder}/>
      </div>

      ${body}

      <button className="fab" onClick=${function () { setEdit({}); }}>＋ 新增</button>

      ${more ? html`<${MoreSheet} it=${more} onClose=${function () { setMore(null); }}
        onCopy=${doCopy} onDelete=${del}
        onEdit=${function (it) { setMore(null); setEdit(it); }}/>` : null}

      ${edit ? html`<${EditSheet} it=${edit.id ? edit : null} folders=${data.folders || []}
        curFolder=${folder} toast=${toast}
        onClose=${function () { setEdit(null); }}
        onSaved=${function (m) { setEdit(null); toast(m); refresh(true); }}/>` : null}

      <div id="toast" className=${msg ? ('on' + (msg.bad ? ' bad' : '')) : ''}>
        ${msg ? msg.text : ''}
      </div>
    <//>`;
  }

  ReactDOM.createRoot(document.getElementById('root')).render(h(App));
})();
