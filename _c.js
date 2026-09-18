function esc(x){return String(x==null?'':x).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
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
function card(r){
    var l = (r.lang||'').split('、')[0] || '';
    var cls = r.status==='已完成' ? 'done' : (r.status==='取消' ? 'cancel' : 'plan');
    /* 待處理的包一層：紅色的取消壓在下面，卡片往左滑才露出來。
       data-go 留在外層，「從填寫頁返回」要靠它把這一張找回來。 */
    var acts = (r.status !== '預排' && r.recCode)
      ? '<button type="button" data-pdf="'+esc(r.recCode)+'"'+
          ' data-client="'+esc(r.client||'')+'"'+
          ' data-n="'+(r.workers?String(r.workers).split('、').length:0)+'"'+
          '>PDF</button>'+
        // 送出去之後就不該再有送審鈕，狀態標籤講得比按鈕清楚
        ((r.rv==='未送審'||r.rv==='退回補正')
          ? '<button type="button" data-sub="'+esc(r.recCode)+'">送審</button>' : '')
      : '';
    var wrapA = '', wrapB = '';
    if(r.status === '預排'){
      wrapA = '<div class="swwrap" data-go="'+esc(r.id)+'">'+
              '<button type="button" class="swdel">取消</button>';
      wrapB = '</div>';
    }
    return wrapA + '<div class="ev '+cls+'">'+
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
      /* 待處理的沒有按鈕了（點卡片開始填、左滑出取消），
         所以整個 .acts 不輸出——空的 flex 子元素還是會吃掉父層 10px 的間距。 */
      (acts ? '<span class="acts">' + acts + '</span>' : '') +
      '</div>' + wrapB;
  }
function n(h,t){ return h.split(t).length-1; }
function bal(h,tag){ var o=n(h,'<'+tag+' ')+n(h,'<'+tag+'>'), c=n(h,'</'+tag+'>');
  return o===c?('OK('+o+')'):('不平衡 '+o+'/'+c); }
var plan = card({status:'預排', id:'S99', client:'暢廣', slot:'下午', crew:'佑彬',
  topic:'費用收取與發放 / 收服務費', workers:'美利、傑伊', lang:'英'});
var done = card({status:'已完成', id:'S98', recCode:'S260918-AA', client:'品茂', slot:'上午',
  crew:'佑彬', topic:'到廠溝通', workers:'艾薇、羅密歐', lang:'越', rv:'未送審'});
var sent = card({status:'已完成', id:'S97', recCode:'S260918-BB', client:'磐石', slot:'09:00',
  crew:'光蘭', topic:'生活關懷', workers:'阿香', lang:'印', rv:'待副理審'});
[['待處理',plan],['已完成·未送審',done],['已完成·審核中',sent]].forEach(function(x){
  var h=x[1];
  console.log('  '+x[0]+'  div='+bal(h,'div')+' span='+bal(h,'span')+' button='+bal(h,'button'));
});
console.log();
console.log('  待處理 有 .swwrap        ', plan.indexOf('class="swwrap"')>-1);
console.log('  待處理 有紅色取消鈕      ', plan.indexOf('class="swdel"')>-1);
console.log('  待處理 沒有開始填寫按鈕  ', plan.indexOf('開始填寫')===-1);
console.log('  待處理 沒有空的 .acts    ', plan.indexOf('class="acts"')===-1);
console.log('  待處理 data-go 在外層    ', plan.indexOf('class="swwrap" data-go=')>-1);
console.log('  已完成 沒有被包起來      ', done.indexOf('swwrap')===-1);
console.log('  已完成 PDF 鈕還在        ', done.indexOf('data-pdf')>-1 && sent.indexOf('data-pdf')>-1);
console.log('  未送審 才有送審鈕        ', done.indexOf('data-sub')>-1 && sent.indexOf('data-sub')===-1);
console.log('  進度條都還在             ', done.indexOf('class="prog')>-1 && sent.indexOf('class="prog')>-1);
