// ════════════ 자원 관리: 설정형 데이터베이스(노션식) — 표/보드/타임라인/차트 ════════════
// 컬럼·타입·선택옵션·그룹·필터는 모두 사용자가 설정. 엔진(기능)만 제공.
// 인원 현황: 연도(상위) → 월(하위) 페이지 계층. 월별 입력 + 연간 자동 집계.
let _rscDB={manpower:null, projects:null};
let _rscView='manpower'; let _rscTab='table'; let _rscGrid=null; let _rscHot=null; let _rscCharts=[]; let _rscChartCol='';
let _rscFilters=[]; let _rscSearchQ=''; let _rscTreeOpen={}; let _rscSorts=[]; let _rscSelSet=new Set(); let _rscPage=1; let _rscPageSize=20; let _rscGrpOpen={}; let _rscGrpHidden={};
const _RSC_PAL=['#2d6fd4','#00a872','#7c5cff','#c9923e','#e53e5a','#0ea5e9','#ec4899','#14b8a6','#f59e0b','#64748b','#0a9b5a','#d12d4a'];
function _rscEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _rscColor(v){ var s=String(v==null?'':v),h=0,i; for(i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0; return _RSC_PAL[h%_RSC_PAL.length]; }
function _rscTagHtml(v,color){ if(v==null||v==='') return ''; var c=color||_rscColor(v); return '<span style="background:'+c+'22;color:'+c+';padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap;">'+_rscEsc(v)+'</span>'; }
function _rscOptColor(c,v){ try{ if(c&&c.optColors&&c.optColors[v]) return c.optColors[v]; }catch(e){} return _rscColor(v); }   // 컬럼에 사용자 지정 색이 있으면 사용
function _rscNewId(){ return 'c'+Date.now().toString(36)+Math.floor(Math.random()*1296).toString(36); }
function _rscPad2(n){ return (n<10?'0':'')+n; }
function _rscIsYear(k){ return /^\d{4}$/.test(String(k||'')); }
function _rscMonKey(y,m){ return y+'-'+_rscPad2(m); }
// ── 기본 데이터베이스(첫 사용 예시 — 전부 편집 가능) ──
function _rscDefMP(){
  var cols=[
    {id:'dept',title:'부서',type:'select',options:['PA1팀','PA2팀','QA팀'],width:90},
    {id:'name',title:'인원',type:'text',width:84},
    {id:'rank',title:'직급',type:'select',options:['책임','선임','사원'],width:74},
    {id:'biz',title:'사업자',type:'select',options:['공공','KT','LG U+'],width:84},
    {id:'prod',title:'제품명',type:'text',width:120},
    {id:'cat',title:'업무분류',type:'text',width:180},
    {id:'mm',title:'공수(M/M)',type:'number',width:96}
  ];
  var now=new Date(), y=now.getFullYear(), mo=now.getMonth()+1;
  var people=[
    {dept:'PA1팀',name:'이재익',rank:'책임',biz:'공공',prod:'E71xx',cat:'1.신규-시험망구축'},
    {dept:'PA1팀',name:'최병호',rank:'사원',biz:'공공',prod:'E4320-24TX',cat:'1.신규-상시망검증'},
    {dept:'QA팀',name:'주원기',rank:'책임',biz:'LG U+',prod:'U9500H',cat:'2.개선-코칭&피드백'},
    {dept:'QA팀',name:'권민수',rank:'사원',biz:'',prod:'',cat:'4.자체-AI 지식기반'},
    {dept:'PA2팀',name:'이준원',rank:'선임',biz:'LG U+',prod:'C511PD',cat:'1.신규-상시망검증'}
  ];
  var prevMo=mo>1?mo-1:12, prevY=mo>1?y:y-1;
  var kPrev=_rscMonKey(prevY,prevMo), kThis=_rscMonKey(y,mo);
  var pages={};
  pages[kPrev]={rows:people.map(function(p,i){ return Object.assign({},p,{mm:[0.4,0.95,0.2,1,0.6][i]||0.3}); })};
  pages[kThis]={rows:people.map(function(p,i){ return Object.assign({},p,{mm:[0.5,0.4,0.1,1,0.5][i]||0.2}); })};
  var ys={}; ys[String(y)]=1; ys[String(prevY)]=1;
  return {columns:cols, groupBy:'dept', boardBy:'dept', years:Object.keys(ys).sort().reverse(), pages:pages, curPage:kThis};
}
function _rscDefPJ(){ return {columns:[
  {id:'customer',title:'고객',type:'select',options:['공공','KT','LG U+'],width:80},
  {id:'cat',title:'업무분류',type:'select',options:['신규개발','개선개발','장애재현'],width:92},
  {id:'status',title:'상태',type:'select',options:['시작 전','대내 진행 중','대외 진행 중','완료'],width:110},
  {id:'dept',title:'부서',type:'text',width:58},
  {id:'name',title:'프로젝트명',type:'text',width:250},
  {id:'owner',title:'담당',type:'text',width:90},
  {id:'dstart',title:'대내 시작',type:'date',width:112},
  {id:'dend',title:'대내 완료',type:'date',width:112}
], groupBy:'', boardBy:'status', rows:[
  {customer:'LG U+',cat:'신규개발',status:'대외 진행 중',dept:'PA1',name:'E8013 R261 개선 OS 검증',owner:'김인겸',dstart:'2026-03-23',dend:'2026-06-05'},
  {customer:'KT',cat:'신규개발',status:'대외 진행 중',dept:'PA1',name:'400G 광모듈 BMT',owner:'이재익',dstart:'2026-04-20',dend:'2026-04-29'},
  {customer:'KT',cat:'신규개발',status:'대내 진행 중',dept:'PA1',name:'코티나 10G 업링크 BMT 준비',owner:'임종현',dstart:'2026-06-01',dend:'2026-06-30'},
  {customer:'LG U+',cat:'신규개발',status:'대내 진행 중',dept:'PA2',name:'1G PD(C511PD)(CA8188) - 1종',owner:'이준원',dstart:'2026-03-18',dend:'2026-05-18'},
  {customer:'공공',cat:'개선개발',status:'시작 전',dept:'PA1',name:'E43XX Series 삼성 SDN 연동 시험',owner:''},
  {customer:'LG U+',cat:'개선개발',status:'완료',dept:'PA2',name:'C514L UART PIN제거·FW 보안개선',owner:'윤용진',dstart:'2026-05-01',dend:'2026-05-11'}
]}; }

// ── 구버전(평면 m1~m12) → 계층(월 페이지) 마이그레이션 ──
function _rscMigrateMP(d){
  if(d && d.pages) return d;                       // 이미 계층형
  var monthIds=[]; var cols=(d.columns||[]).filter(function(c){ if(/^m(1[0-2]|[1-9])$/.test(c.id)){ monthIds.push(c.id); return false; } return true; });
  if(!cols.some(function(c){return c.id==='mm';})) cols.push({id:'mm',title:'공수(M/M)',type:'number',width:96});
  var now=new Date(), y=now.getFullYear(), curK=_rscMonKey(y,now.getMonth()+1);
  var pages={}, years={}; years[String(y)]=1;
  (d.rows||[]).forEach(function(r){
    var base={}; cols.forEach(function(c){ if(c.id!=='mm' && r[c.id]!=null) base[c.id]=r[c.id]; });
    if(monthIds.length){
      monthIds.forEach(function(mc){ var v=r[mc]; if(v!=null&&v!==''){ var k=_rscMonKey(y,parseInt(mc.slice(1),10)); pages[k]=pages[k]||{rows:[]}; pages[k].rows.push(Object.assign({},base,{mm:v})); } });
    } else { pages[curK]=pages[curK]||{rows:[]}; pages[curK].rows.push(Object.assign({},base)); }
  });
  if(!Object.keys(pages).length) pages[curK]={rows:[]};
  Object.keys(pages).forEach(function(k){ years[k.slice(0,4)]=1; });
  return {columns:cols, groupBy:d.groupBy||'', boardBy:d.boardBy||'', years:Object.keys(years).sort().reverse(), pages:pages, curPage:pages[curK]?curK:Object.keys(pages).sort().pop()};
}
// 월별 페이지(YYYY-MM) → 연도 페이지(YYYY)로 통합. 연도당 가장 많은 월 페이지를 대표로(중복 방지)
function _rscMigrateToYear(mp){
  var keys=Object.keys(mp.pages||{}); var hasMonth=keys.some(function(k){return /^\d{4}-\d{2}$/.test(k);});
  if(!hasMonth) return mp;
  var ny={};
  keys.forEach(function(k){ var yr=/^\d{4}$/.test(k)?k:((k.match(/^(\d{4})-\d{2}$/)||[])[1]); if(!yr)return; var rows=(mp.pages[k].rows||[]); if(!ny[yr] || rows.length>(ny[yr].rows||[]).length) ny[yr]={rows:rows.slice()}; });
  mp.pages=ny;
  return mp;
}
function _rscMP(){
  if(!_rscDB.manpower) _rscDB.manpower=_rscDefMP();
  var mp=_rscDB.manpower;
  if(!mp.pages){ mp=_rscDB.manpower=_rscMigrateMP(mp); }
  _rscMigrateToYear(mp);                                  // 연도 표 구조로 통합
  var ys={}; Object.keys(mp.pages).forEach(function(k){ if(/^\d{4}$/.test(k))ys[k]=1; }); (mp.years||[]).forEach(function(y){ if(/^\d{4}$/.test(y))ys[y]=1; });
  mp.years=Object.keys(ys).sort().reverse(); if(!mp.years.length) mp.years=[String(new Date().getFullYear())];
  mp.years.forEach(function(y){ if(!mp.pages[y]) mp.pages[y]={rows:[]}; });   // 연도마다 표 보장
  var cy=String(mp.curPage||'').slice(0,4);              // 월키였으면 연도로
  if(!/^\d{4}$/.test(cy) || !mp.pages[cy]) cy=mp.years[0];
  mp.curPage=cy;
  return mp;
}

async function loadResourceData(){
  try{ var r=await fetch('/api/resource/manpower'); var d=await r.json(); _rscDB.manpower=(d&&Array.isArray(d.columns)&&d.columns.length)?d:null; }catch(e){ _rscDB.manpower=null; }
  try{ var r2=await fetch('/api/resource/projects'); var d2=await r2.json(); _rscDB.projects=(d2&&Array.isArray(d2.columns)&&d2.columns.length)?d2:null; }catch(e){ _rscDB.projects=null; }
  if(!_rscDB.manpower) _rscDB.manpower=_rscDefMP();
  if(!_rscDB.projects) _rscDB.projects=_rscDefPJ();
  try{ var sv=localStorage.getItem('utop_rscView'); if(sv==='manpower'||sv==='projects') _rscView=sv; }catch(e){}   // 새로고침 시 마지막 보기(인원/프로젝트) 유지
}
// 엔진용 현재 db: projects=평면, manpower 월페이지=공유 스키마+해당 월 rows
function _rscCur(){
  if(_rscView==='projects'){ if(!_rscDB.projects) _rscDB.projects=_rscDefPJ(); return _rscDB.projects; }
  var mp=_rscMP();
  var pg=mp.pages[mp.curPage]; if(!pg){ pg={rows:[]}; mp.pages[mp.curPage]=pg; }   // 연도 페이지 = 표(엔진 사용)
  if(!Array.isArray(pg.rows)) pg.rows=[];
  mp.rows=pg.rows; mp._rowsPage=mp.curPage;         // 엔진이 쓰는 live 참조 + 그 참조가 '어느 연도' 것인지 기록
  return mp;
}
async function _rscSave(){
  if(_rscView==='manpower'){
    var mp=_rscDB.manpower; if(!mp) return;
    // ★ mp.rows(편집 버퍼)는 '그 버퍼가 속한 연도'(_rowsPage)가 현재 페이지일 때만 반영 — 연도 전환 직후 stale 참조로 다른 연도를 덮어쓰는 치명 버그 방지
    if(mp.curPage){ var _cpg=mp.pages[mp.curPage]=mp.pages[mp.curPage]||{rows:[]};
      if(Array.isArray(mp.rows) && mp._rowsPage===mp.curPage){ _cpg.rows=mp.rows; }
      if(!Array.isArray(_cpg.rows)) _cpg.rows=[];
    }
    // 안전장치: 두 연도 페이지가 같은 rows 배열을 공유하면 복제해 분리
    var _seen=[]; Object.keys(mp.pages||{}).forEach(function(k){ var pr=mp.pages[k]; if(!pr||!Array.isArray(pr.rows))return; if(_seen.indexOf(pr.rows)>=0){ pr.rows=pr.rows.map(function(r){return Object.assign({},r);}); } _seen.push(pr.rows); });
    var save=Object.assign({},mp); delete save.rows;
    try{ await fetch('/api/resource/manpower',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(save)}); }catch(e){}
  } else {
    try{ await fetch('/api/resource/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(_rscDB.projects)}); }catch(e){}
  }
}
function _rscCol(db,id){ return (db.columns||[]).filter(function(c){return c.id===id;})[0]; }

// ── 페이지 ──
function renderResourcePage(){
  const el=document.getElementById('page-resource'); if(!el) return;
  if(typeof Handsontable==='undefined'){ el.innerHTML='<div class="rsc-wrap"><div class="rsc-empty">표 라이브러리(CDN) 로딩 실패 — 네트워크 확인 후 새로고침(Ctrl+Shift+R)</div></div>'; return; }
  if(_rscView==='manpower'){ _rscRenderMP(el); } else { _rscRenderFlat(el); }
}
// 인원 현황: 사이드 연도 트리 + 본문(연도 표). 각 연도 = 01월~12월 컬럼이 있는 한 표
function _rscRenderMP(el){
  var mp=_rscMP(); var key=mp.curPage;
  _rscViews(mp); _rscLoadView(mp);
  var content='<div class="rsc-head"><span style="font-size:22px;">👥</span><b>인원 투입 · '+key+'년</b>'
    +'<span style="font-size:12px;color:var(--text3);font-weight:600;">연간 표 · 컬럼은 모든 연도 공통</span></div>'
    +_rscViewTabsHtml(mp)
    +'<div class="rsc-toolbar" id="rsc-toolbar"></div><div id="rsc-body"></div>';
  el.innerHTML='<div class="rsc-wrap"><div class="rsc-layout"><div class="rsc-side">'+_rscPageTree(mp)+'</div><div class="rsc-main">'+content+'</div></div></div>';
  _rscRenderTab();
}
// 프로젝트 현황(평면 — 사이드 없음)
function _rscRenderFlat(el){
  var db=_rscCur(); _rscViews(db); _rscLoadView(db);
  el.innerHTML='<div class="rsc-wrap">'
    +'<div class="rsc-head"><span style="font-size:22px;">📋</span><b>프로젝트 현황</b><span style="font-size:12px;color:var(--text3);font-weight:600;">설정형 DB · 컬럼/옵션/그룹 직접 구성</span></div>'
    +_rscViewTabsHtml(db)
    +'<div class="rsc-toolbar" id="rsc-toolbar"></div><div id="rsc-body"></div></div>';
  _rscRenderTab();
}
function rscGo(view){ _rscView=view; try{ localStorage.setItem('utop_rscView',view); }catch(e){} if(typeof showPage==='function'){ showPage('resource'); } else { renderResourcePage(); } }
// ── 보기(View) 모델: 표/보드/차트/타임라인을 사용자가 추가·복사. 필터·정렬·그룹은 보기마다 별도, 데이터·열은 공유 ──
var _RSC_VIEWTYPES=[['table','📋','표'],['board','🗂','보드'],['chart','📊','차트'],['gantt','📅','타임라인']];
function _rscViewIcon(t){ for(var i=0;i<_RSC_VIEWTYPES.length;i++)if(_RSC_VIEWTYPES[i][0]===t)return _RSC_VIEWTYPES[i][1]; return '📋'; }
function _rscViewTypeName(t){ for(var i=0;i<_RSC_VIEWTYPES.length;i++)if(_RSC_VIEWTYPES[i][0]===t)return _RSC_VIEWTYPES[i][2]; return '표'; }
function _rscViews(db){ if(!db) return []; if(!Array.isArray(db.views)||!db.views.length){ db.views=[{id:_rscNewId(),name:'표',type:'table'},{id:_rscNewId(),name:'보드',type:'board'},{id:_rscNewId(),name:'차트',type:'chart'}]; } if(!db.curView||!db.views.some(function(v){return v.id===db.curView;})) db.curView=db.views[0].id; return db.views; }
function _rscCV(db){ _rscViews(db); return db.views.filter(function(v){return v.id===db.curView;})[0]||db.views[0]; }
function _rscLoadView(db){ var v=_rscCV(db); if(!v)return; _rscTab=v.type||'table'; _rscSearchQ=v.searchQ||''; db.groupBy=v.groupBy||''; if(v.boardBy!=null)db.boardBy=v.boardBy; _rscChartCol=v.chartCol||'';
  _rscFilters=Array.isArray(v.filters)?v.filters.slice():(v.filtCol?[{col:v.filtCol,op:'eq',val:v.filtVal||''}]:[]);   // 멀티필터(구버전 단일 이관)
  _rscSorts=Array.isArray(v.sorts)?v.sorts.slice():(v.sortCol?[{col:v.sortCol,dir:v.sortDir||1}]:[]);
  _rscGrpHidden=(v.hiddenGroups&&typeof v.hiddenGroups==='object')?Object.assign({},v.hiddenGroups):{};   // 숨긴 그룹 복원
  _rscGrpOpen=(v.collapsedGroups&&typeof v.collapsedGroups==='object')?Object.assign({},v.collapsedGroups):{}; }   // 접힌 그룹 복원
function _rscSaveView(){ var db=_rscCur(); var v=_rscCV(db); if(!v)return; v.searchQ=_rscSearchQ; v.groupBy=db.groupBy; v.boardBy=db.boardBy; v.chartCol=_rscChartCol; v.filters=_rscFilters; v.sorts=_rscSorts; v.hiddenGroups=Object.assign({},_rscGrpHidden); v.collapsedGroups=Object.assign({},_rscGrpOpen); try{delete v.filtCol;delete v.filtVal;delete v.sortCol;delete v.sortDir;}catch(e){} _rscSave(); }
function _rscViewTabsHtml(db){ var vs=_rscViews(db); return '<div class="rsc-tabs">'+vs.map(function(v){ return '<div class="rsc-tab'+(db.curView===v.id?' on':'')+'" onclick="rscView(\''+v.id+'\')" oncontextmenu="return _rscViewMenu(event,\''+v.id+'\')" title="우클릭: 이름변경/복사/삭제">'+_rscViewIcon(v.type)+' '+_rscEsc(v.name)+'</div>'; }).join('')+'<div class="rsc-tab rsc-tab-add" onclick="rscAddView(event)" title="보기 추가"><i class="ti ti-plus"></i></div></div>'; }
function rscView(id){ var db=_rscCur(); _rscViews(db); db.curView=id; _rscLoadView(db); _rscSave(); renderResourcePage(); }
function rscAddView(e){ try{e&&e.stopPropagation();}catch(_){} _rscViewMenuClose(); var m=document.createElement('div'); m.id='rsc-viewmenu'; m.className='dsh-wmenu'; m.style.cssText='position:fixed;z-index:12000;width:180px;'; m.innerHTML='<div style="font-size:10px;font-weight:800;color:var(--text3);padding:5px 9px 3px;">보기 추가</div>'+_RSC_VIEWTYPES.map(function(t){ return '<button onclick="_rscViewCreate(\''+t[0]+'\')">'+t[1]+' '+t[2]+'</button>'; }).join(''); document.body.appendChild(m); var x=(e&&e.clientX)||220,y=(e&&e.clientY)||130; m.style.left=Math.min(x,window.innerWidth-190)+'px'; m.style.top=Math.min(y,window.innerHeight-220)+'px'; setTimeout(function(){document.addEventListener('mousedown',_rscViewMenuOut,true);},0); }
function _rscViewCreate(type){ var db=_rscCur(); var vs=_rscViews(db); vs.push({id:_rscNewId(),name:_rscViewTypeName(type),type:type}); db.curView=vs[vs.length-1].id; _rscLoadView(db); _rscViewMenuClose(); _rscSave(); renderResourcePage(); }
function _rscViewMenu(e,id){ try{e.preventDefault();e.stopPropagation();}catch(_){} _rscViewMenuClose(); var db=_rscCur(); var vs=_rscViews(db); var v=vs.filter(function(x){return x.id===id;})[0]; if(!v)return false; var m=document.createElement('div'); m.id='rsc-viewmenu'; m.className='dsh-wmenu'; m.style.cssText='position:fixed;z-index:12000;width:170px;'; m.innerHTML='<button onclick="_rscViewRename(\''+id+'\')"><i class="ti ti-pencil"></i> 이름 변경</button><button onclick="_rscViewDup(\''+id+'\')"><i class="ti ti-copy"></i> 보기 복사</button>'+(vs.length>1?'<button class="del" onclick="_rscViewDel(\''+id+'\')"><i class="ti ti-trash"></i> 보기 삭제</button>':''); document.body.appendChild(m); m.style.left=Math.min((e&&e.clientX)||200,window.innerWidth-180)+'px'; m.style.top=Math.min((e&&e.clientY)||120,window.innerHeight-150)+'px'; setTimeout(function(){document.addEventListener('mousedown',_rscViewMenuOut,true);},0); return false; }
function _rscViewMenuClose(){ var m=document.getElementById('rsc-viewmenu'); if(m)m.remove(); try{document.removeEventListener('mousedown',_rscViewMenuOut,true);}catch(e){} }
function _rscViewMenuOut(e){ var m=document.getElementById('rsc-viewmenu'); if(m&&!m.contains(e.target))_rscViewMenuClose(); }
function _rscViewDup(id){ var db=_rscCur(); var vs=_rscViews(db); var i=-1,v=null; vs.forEach(function(x,k){ if(x.id===id){v=x;i=k;} }); if(!v)return; var nv=JSON.parse(JSON.stringify(v)); nv.id=_rscNewId(); nv.name=v.name+' 복사'; vs.splice(i+1,0,nv); db.curView=nv.id; _rscLoadView(db); _rscViewMenuClose(); _rscSave(); renderResourcePage(); }
function _rscViewDel(id){ var db=_rscCur(); var vs=_rscViews(db); if(vs.length<=1)return; var i=-1; vs.forEach(function(x,k){if(x.id===id)i=k;}); if(i<0)return; vs.splice(i,1); if(db.curView===id)db.curView=vs[0].id; _rscLoadView(db); _rscViewMenuClose(); _rscSave(); renderResourcePage(); }
async function _rscViewRename(id){ var db=_rscCur(); var v=_rscViews(db).filter(function(x){return x.id===id;})[0]; _rscViewMenuClose(); if(!v)return; var nm=null; try{ nm=await uiPrompt({title:'보기 이름 변경',label:'보기 이름',value:v.name,icon:'ti-pencil'}); }catch(e){ nm=null; } if(nm!=null&&String(nm).trim()){ v.name=String(nm).trim(); _rscSave(); renderResourcePage(); } }   // 네이티브 prompt → 커스텀 모달

// ── 페이지 트리(연도 ▸ 월) — 사이클 Folder Tree 스타일 ──
function _rscPageTree(mp){
  var btn='width:21px;height:21px;border-radius:5px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;padding:0;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;';
  var h='<div class="rsc-tree-panel">'
    +'<div class="rsc-tree-hd"><span style="font-size:13px;font-weight:800;color:var(--text2);white-space:nowrap;"><i class="ti ti-calendar-stats" style="color:var(--blue);font-size:15px;"></i> 연도</span><span style="flex:1;"></span>'
      +'<button onclick="rscAddYear()" title="연도 추가" style="'+btn+'color:#2d6fd4;"><i class="ti ti-plus" style="font-size:13px;"></i></button>'
    +'</div><div class="rsc-tree-body" id="rsc-tree">';
  mp.years.forEach(function(y){
    var sel=(mp.curPage===y); var sbg=sel?'rgba(45,111,212,0.10)':''; var n=((mp.pages[y]||{}).rows||[]).length;
    h+='<div onclick="rscOpenPage(\''+y+'\')" oncontextmenu="return _rscYearMenu(event,\''+y+'\')" title="우클릭: 비우기/삭제" style="display:flex;align-items:center;gap:7px;padding:7px 8px;border-radius:6px;cursor:pointer;background:'+sbg+';border-left:3px solid '+(sel?'#2d6fd4':'transparent')+';" onmouseenter="this.style.background=\'#f0f4ff\'" onmouseleave="this.style.background=\''+sbg+'\'">'
      +'<i class="ti ti-calendar" style="font-size:15px;color:var(--blue);flex-shrink:0;"></i>'
      +'<span style="font-size:13px;font-weight:700;color:'+(sel?'#2d6fd4':'var(--blue)')+';flex:1;">'+y+'년</span>'
      +'<span style="font-size:10px;color:var(--text3);font-weight:700;background:rgba(100,116,139,0.10);padding:1px 6px;border-radius:4px;">'+n+'</span>'
    +'</div>';
  });
  return h+'</div></div>';
}function rscOpenPage(key){ var mp=_rscMP(); mp.curPage=key; _rscSave(); renderResourcePage(); }
function rscAddYear(){
  var mp=_rscMP(); _rscYearModalClose();
  var nums=mp.years.map(Number).filter(function(n){return !isNaN(n);});
  var base=(nums.length?Math.max.apply(null,nums):(new Date().getFullYear()-1));
  var cands=[]; for(var k=1;k<=4;k++){ var y=base+k; if(mp.years.indexOf(String(y))<0) cands.push(y); }
  if(!cands.length){ var cy=new Date().getFullYear(); for(var k2=0;k2<6;k2++){ if(mp.years.indexOf(String(cy-k2))<0) cands.push(cy-k2); } }
  var def=cands[0]||(base+1);
  var ov=document.createElement('div'); ov.id='rsc-yearmodal'; ov.className='dsh-modal-ov'; ov.onclick=function(e){ if(e.target===ov)_rscYearModalClose(); };
  ov.innerHTML='<div class="dsh-edit-box" style="width:340px;"><div class="dsh-edit-hd"><i class="ti ti-calendar-plus"></i> 연도 추가<i class="ti ti-x" onclick="_rscYearModalClose()" style="margin-left:auto;cursor:pointer;"></i></div>'
    +'<div class="dsh-edit-body"><label style="font-size:12px;color:var(--text2);font-weight:700;">연도(YYYY)</label>'
    +'<input id="rsc-year-inp" type="number" value="'+def+'" onkeydown="if(event.key===\'Enter\')_rscDoAddYear()" style="width:100%;margin:7px 0 11px;font-size:19px;font-weight:900;text-align:center;letter-spacing:2px;padding:9px;border:1.5px solid var(--border);border-radius:10px;outline:none;color:var(--text);background:var(--bg2,#fff);">'
    +(cands.length?'<div style="display:flex;gap:6px;flex-wrap:wrap;">'+cands.slice(0,4).map(function(y){return '<button class="rsc-chip" onclick="var i=document.getElementById(\'rsc-year-inp\');i.value='+y+';i.focus();">'+y+'</button>';}).join('')+'</div>':'')+'</div>'
    +'<div class="dsh-edit-ft"><button class="dsh-btn-c" onclick="_rscYearModalClose()">취소</button><button class="dsh-btn-s" onclick="_rscDoAddYear()">추가</button></div></div>';
  document.body.appendChild(ov); setTimeout(function(){ var i=document.getElementById('rsc-year-inp'); if(i){ i.focus(); i.select(); } },30);
}
function _rscYearModalClose(){ var m=document.getElementById('rsc-yearmodal'); if(m)m.remove(); }
// 연도 우클릭 메뉴: 비우기 / 삭제
function _rscYearMenu(e,y){ try{e.preventDefault();e.stopPropagation();}catch(_){} _rscViewMenuClose(); var m=document.createElement('div'); m.id='rsc-viewmenu'; m.className='dsh-wmenu'; m.style.cssText='position:fixed;z-index:12000;width:178px;'; m.innerHTML='<div style="font-size:10px;font-weight:800;color:var(--text3);padding:5px 10px 3px;">'+_rscEsc(y)+'년</div><button onclick="_rscYearClear(\''+y+'\')"><i class="ti ti-eraser"></i> 이 연도 비우기</button><button class="del" onclick="_rscYearDel(\''+y+'\')"><i class="ti ti-trash"></i> 연도 삭제</button>'; document.body.appendChild(m); m.style.left=Math.min((e&&e.clientX)||200,window.innerWidth-188)+'px'; m.style.top=Math.min((e&&e.clientY)||120,window.innerHeight-120)+'px'; setTimeout(function(){document.addEventListener('mousedown',_rscViewMenuOut,true);},0); return false; }
function _rscYearClear(y){ _rscViewMenuClose(); var mp=_rscMP(); _rscConfirm(y+'년 비우기', y+'년의 모든 행을 삭제합니다. (열 구성은 유지)', function(){ mp.pages[y]=mp.pages[y]||{rows:[]}; mp.pages[y].rows=[]; if(mp.curPage===y)mp.rows=mp.pages[y].rows; _rscSave(); renderResourcePage(); if(typeof showToast==='function')showToast('🧹 '+y+'년 비움'); }); }
function _rscYearDel(y){ _rscViewMenuClose(); var mp=_rscMP(); if(mp.years.length<=1){ if(typeof showToast==='function')showToast('최소 1개 연도는 필요합니다'); return; } _rscConfirm(y+'년 삭제', y+'년 표를 삭제합니다.', function(){ var i=mp.years.indexOf(y); if(i>=0)mp.years.splice(i,1); delete mp.pages[y]; if(mp.curPage===y){ mp.curPage=mp.years[0]; mp.rows=(mp.pages[mp.curPage]||{rows:[]}).rows; } _rscSave(); renderResourcePage(); if(typeof showToast==='function')showToast('🗑 '+y+'년 삭제'); }); }
function _rscDoAddYear(){ var mp=_rscMP(); var inp=document.getElementById('rsc-year-inp'); var y=inp?String(inp.value).trim():''; if(!/^\d{4}$/.test(y)){ if(typeof showToast==='function')showToast('YYYY(4자리) 연도를 입력하세요'); return; }
  if(mp.years.indexOf(y)<0) mp.years.push(y); mp.years.sort().reverse(); if(!mp.pages[y])mp.pages[y]={rows:[]}; mp.curPage=y; mp.rows=mp.pages[y].rows; mp._rowsPage=y; _rscYearModalClose(); _rscSave(); renderResourcePage();   // ★ live 참조를 새 빈 페이지로(이전 연도 rows 공유/덮어쓰기 방지)
  if(typeof showToast==='function')showToast('📁 '+y+'년 추가됨');
}
// 월 추가 모달(월 선택 + 직전 월 복사)
function _rscMonModalClose(){ var m=document.getElementById('rsc-monmodal'); if(m)m.remove(); }
function _rscLatestBefore(mp,key){ var ks=Object.keys(mp.pages).filter(function(k){ return !_rscIsYear(k) && k<key; }).sort(); return ks.length?ks[ks.length-1]:null; }
function _rscDoAddMonth(year){
  var mp=_rscMP(); var sel=document.getElementById('rsc-mon-sel'); var carry=document.getElementById('rsc-mon-carry');
  var mo=sel?parseInt(sel.value,10):0; if(!mo){ _rscMonModalClose(); return; }
  var key=_rscMonKey(year,mo);
  if(mp.pages[key]){ mp.curPage=key; _rscMonModalClose(); _rscSave(); renderResourcePage(); return; }
  var rows=[];
  if(carry&&carry.checked){ var prev=_rscLatestBefore(mp,key); if(prev){ var numIds=(mp.columns||[]).filter(function(c){return c.type==='number';}).map(function(c){return c.id;});
    rows=((mp.pages[prev]||{}).rows||[]).map(function(r){ var nr=JSON.parse(JSON.stringify(r)); numIds.forEach(function(id){ nr[id]=''; }); return nr; }); } }
  mp.pages[key]={rows:rows};
  if(mp.years.indexOf(year)<0){ mp.years.push(year); mp.years.sort().reverse(); }
  _rscTreeOpen[year]=true; mp.curPage=key; _rscTab='table'; _rscMonModalClose(); _rscSave(); renderResourcePage();
  if(typeof showToast==='function') showToast('📄 '+year+'년 '+mo+'월 추가'+(rows.length?(' · 직전 월 '+rows.length+'명 복사'):''));
}

// ── 연간 집계(읽기전용: 인원×월 공수 표 + 차트) ──
function _rscRenderTab(){
  const tb=document.getElementById('rsc-toolbar'), body=document.getElementById('rsc-body'); if(!body) return;
  try{ _rscCharts.forEach(function(c){ try{c.destroy();}catch(e){} }); _rscCharts=[]; }catch(e){}
  _rscSelSet=new Set();   // 탭/보기/월 전환 시 선택 초기화 (페이지 이동은 _rscRenderTable만 호출 → 선택 유지)
  try{ if(_rscHot){ _rscHot.destroy(); _rscHot=null; } }catch(e){}
  var db=_rscCur();
  if(_rscTab==='table'){
    var fCount=_rscFilters.filter(function(f){return f&&f.col;}).length, sCount=_rscSorts.filter(function(s){return s&&s.col;}).length;
    var grpOpts='<option value="">그룹 없음</option>'+(db.columns||[]).filter(function(c){return c.type!=='number';}).map(function(c){return '<option value="'+c.id+'"'+(db.groupBy===c.id?' selected':'')+'>그룹: '+_rscEsc(c.title)+'</option>';}).join('');
    tb.innerHTML='<input class="rsc-search" id="rsc-q" placeholder="🔍 검색" value="'+_rscEsc(_rscSearchQ)+'" oninput="rscDoSearch(this.value)">'
      +'<button class="rsc-btn gh'+(fCount?' rsc-on':'')+'" onclick="rscFilterMenu(event)"><i class="ti ti-filter"></i> 필터'+(fCount?' '+fCount:'')+'</button>'
      +'<button class="rsc-btn gh'+(sCount?' rsc-on':'')+'" onclick="rscSortMenu(event)"><i class="ti ti-arrows-sort"></i> 정렬'+(sCount?' '+sCount:'')+'</button>'
      +'<select class="rsc-sel'+(db.groupBy?' rsc-on':'')+'" onchange="rscSetGroup(this.value)">'+grpOpts+'</select>'
      +((db.groupBy&&Object.keys(_rscGrpHidden).length)?'<button class="rsc-btn gh rsc-on" onclick="rscGrpHiddenMenu(event)" title="숨긴 그룹 복원"><i class="ti ti-eye-off"></i> 숨긴 그룹 '+Object.keys(_rscGrpHidden).length+'</button>':'')
      +'<span style="flex:1;"></span>'
      +'<button class="rsc-btn gh" onclick="rscColMgr()"><i class="ti ti-columns"></i> 열 설정</button>'
      +'<button class="rsc-btn gh" onclick="rscAddCol()"><i class="ti ti-column-insert-right"></i> 열 추가</button>'
      +'<button class="rsc-btn gh" onclick="rscAddRow()"><i class="ti ti-plus"></i> 행 추가</button>'
      +'<button class="rsc-btn gh" onclick="rscImport()"><i class="ti ti-file-import"></i> 엑셀</button>'
      +'<button class="rsc-btn" onclick="rscExport()"><i class="ti ti-download"></i> CSV</button>';
    body.innerHTML='<div class="rsc-toprow"><div id="rsc-selbar" class="rsc-selbar"></div><div class="rsc-toprow-sp"></div><div id="rsc-page" class="rsc-page rsc-page-inrow"></div></div><div id="rsc-grid" class="rsc-hot"></div><div id="rsc-foot" class="rsc-foot"></div>'; _rscRenderTable();   // 선택바 + 페이지컨트롤(총N행·행수)을 한 줄로(빈 줄 제거)
  } else if(_rscTab==='board'){
    var bOpts=(db.columns||[]).filter(function(c){return c.type==='select'||c.type==='status';}).map(function(c){return '<option value="'+c.id+'"'+(db.boardBy===c.id?' selected':'')+'>기준: '+_rscEsc(c.title)+'</option>';}).join('');
    tb.innerHTML='<select class="rsc-sel" onchange="rscSetBoardBy(this.value)">'+bOpts+'</select><span style="font-size:11px;color:var(--text3);">카드 드래그 → 값 변경</span><span style="flex:1;"></span><button class="rsc-btn" onclick="rscAddRow()"><i class="ti ti-plus"></i> 항목</button>';
    body.innerHTML='<div class="rsc-kanban" id="rsc-kanban"></div>'; _rscRenderBoard();
  } else if(_rscTab==='gantt'){
    tb.innerHTML='<span style="font-size:11.5px;color:var(--text3);">날짜 열 2개(시작·완료) 기준 타임라인</span>';
    body.innerHTML='<div class="rsc-card"><div id="rsc-gantt-wrap" style="overflow:auto;"><svg id="rsc-gantt"></svg></div></div>'; _rscRenderGantt();
  } else if(_rscTab==='chart'){
    var selCols=(db.columns||[]).filter(function(c){return c.type==='select'||c.type==='text';});
    if(!_rscChartCol||!_rscCol(db,_rscChartCol)) _rscChartCol=(selCols[0]&&selCols[0].id)||'';
    var cOpts=selCols.map(function(c){return '<option value="'+c.id+'"'+(_rscChartCol===c.id?' selected':'')+'>'+_rscEsc(c.title)+'</option>';}).join('');
    tb.innerHTML='<span style="font-size:11.5px;color:var(--text3);">기준 열</span><select class="rsc-sel" onchange="rscSetChartCol(this.value)">'+cOpts+'</select>';
    body.innerHTML='<div class="rsc-charts"><div class="rsc-card"><div class="rsc-ch">개수 분포</div><div style="height:280px;"><canvas id="rsc-c-cnt"></canvas></div></div>'
      +'<div class="rsc-card"><div class="rsc-ch">숫자 열 합계</div><div style="height:280px;"><canvas id="rsc-c-sum"></canvas></div></div></div>'; _rscRenderChart();
  }
}

// ── 표 (Handsontable 6.2.2 MIT, 제네릭) ──
function _rscNumFmt(n){ var r=Math.round(n*100)/100; return String(r); }
// 선택 영역(셀/행)을 TSV로 클립보드 복사 — 엑셀 등에 붙여넣기
function _rscClipText(t){
  t=String(t==null?'':t); var ok=false;
  try{ var ta=document.createElement('textarea'); ta.value=t; ta.style.cssText='position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;padding:0;border:0;'; document.body.appendChild(ta); ta.focus(); ta.select(); try{ta.setSelectionRange(0,t.length);}catch(_){} ok=document.execCommand('copy'); document.body.removeChild(ta); }catch(e){}
  try{ if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(t); ok=true; } }catch(e){}   // 두 방식 모두 시도 — 하나라도 되면 복사됨(HTTP/HTTPS 무관)
  return ok;
}
// 표 전체(헤더+모든 행)를 TSV로 복사 — 모든 탭(표/보드/차트)에서 동작하는 툴바 복사// ── 행 선택(객체 기준 → 페이지 넘겨도 유지)·전체선택·일괄동작 ──
function _rscSelBar(){
  var bar=document.getElementById('rsc-selbar'); if(!bar)return;
  var pr=window._rscPageRows||[]; var ar=window._rscAllRows||[]; var sel=_rscSelSet.size;
  var pageSel=pr.filter(function(o){return _rscSelSet.has(o);}).length; var allPageOn=(pr.length>0&&pageSel===pr.length);
  var allDataOn=(ar.length>0&&sel>=ar.length);
  var html='<label class="rsc-selall"><input type="checkbox" '+(allPageOn?'checked':'')+' onchange="_rscSelAll(this.checked)"> 이 페이지 전체</label>';
  if(ar.length>pr.length){ html+=allDataOn?'<button class="rsc-btn gh" onclick="_rscSelClear()">전체('+ar.length+'행) 해제</button>':'<button class="rsc-btn gh" onclick="_rscSelAllData()"><i class="ti ti-checks"></i> 전체 '+ar.length+'행 선택</button>'; }
  if(sel>0){ html+='<span class="rsc-selcnt">'+sel+'행 선택</span>'
    +'<button class="rsc-btn gh" onclick="_rscSelCopy()"><i class="ti ti-copy"></i> 복사</button>'
    +'<button class="rsc-btn gh" onclick="_rscSelDup()"><i class="ti ti-copy-plus"></i> 복제</button>'
    +'<button class="rsc-btn gh rsc-del" onclick="_rscSelDel()"><i class="ti ti-trash"></i> 삭제</button>'
    +'<button class="rsc-btn gh" onclick="_rscSelClear()">해제</button>'; }
  bar.innerHTML=html;
}
function _rscSelAll(on){ var pr=window._rscPageRows||[]; pr.forEach(function(o){ if(on)_rscSelSet.add(o); else _rscSelSet.delete(o); }); if(_rscHot)try{_rscHot.render();}catch(e){} _rscSelBar(); }
function _rscSelAllData(){ var ar=window._rscAllRows||[]; ar.forEach(function(o){ _rscSelSet.add(o); }); if(_rscHot)try{_rscHot.render();}catch(e){} _rscSelBar(); }
function _rscSelClear(){ _rscSelSet=new Set(); if(_rscHot)try{_rscHot.render();}catch(e){} _rscSelBar(); }
function _rscSelObjs(){ return Array.from(_rscSelSet); }
function _rscSelCopy(){ var db=_rscCur(); var cols=db.columns||[]; var objs=_rscSelObjs(); if(!objs.length)return;
  var lines=[cols.map(function(c){return c.title;}).join('\t')]; objs.forEach(function(r){ lines.push(cols.map(function(c){var v=r[c.id];return v==null?'':String(v);}).join('\t')); });
  _rscClipText(lines.join('\n')); if(typeof showToast==='function')showToast('📋 '+objs.length+'행 복사됨 — 붙여넣기 가능'); }
function _rscSelDup(){ var db=_rscCur(); var objs=_rscSelObjs(); if(!objs.length)return; objs.forEach(function(r){ db.rows.push(JSON.parse(JSON.stringify(r))); }); _rscSelSet=new Set(); _rscSave(); _rscRenderTable(); if(typeof showToast==='function')showToast('⧉ '+objs.length+'행 복제됨'); }
function _rscSelDel(){ var objs=_rscSelObjs(); if(!objs.length)return; _rscConfirm(objs.length+'행을 삭제할까요?','삭제하면 되돌릴 수 없습니다.',function(){ var db=_rscCur(); objs.forEach(function(r){ var i=db.rows.indexOf(r); if(i>=0)db.rows.splice(i,1); }); _rscSelSet=new Set(); _rscSave(); _rscRenderTable(); if(typeof showToast==='function')showToast('🗑 '+objs.length+'행 삭제됨'); }); }
// 모던 확인창 (native confirm 대체)
function _rscConfirm(title,desc,onYes){
  var ov=document.getElementById('rsc-confirm'); if(ov)ov.remove();
  ov=document.createElement('div'); ov.id='rsc-confirm'; ov.className='dsh-modal-ov'; ov.onclick=function(e){ if(e.target===ov)ov.remove(); };
  ov.innerHTML='<div class="dsh-edit-box" style="width:340px;"><div class="dsh-edit-hd"><i class="ti ti-alert-triangle" style="color:#e53e5a;"></i> '+_rscEsc(title)+'</div>'
    +'<div class="dsh-edit-body"><div style="font-size:12.5px;color:var(--text2);line-height:1.6;">'+_rscEsc(desc||'')+'</div></div>'
    +'<div class="dsh-edit-ft"><button class="dsh-btn-c" id="rsc-cf-no">취소</button><button class="dsh-btn-s" id="rsc-cf-yes" style="background:#e53e5a;">삭제</button></div></div>';
  document.body.appendChild(ov);
  document.getElementById('rsc-cf-no').onclick=function(){ ov.remove(); };
  document.getElementById('rsc-cf-yes').onclick=function(){ ov.remove(); try{onYes&&onYes();}catch(e){} };
}
function _rscPageBar(total,ps,page,pages,start){
  var bar=document.getElementById('rsc-page'); if(!bar)return;
  if(total<=ps && page<=1){ bar.innerHTML='<span class="rsc-page-info">총 '+total+'행</span><span style="flex:1;"></span>'+_rscPageSizeSel(ps); bar.style.display='flex'; return; }
  var to=Math.min(start+ps,total);
  bar.innerHTML='<span class="rsc-page-info">'+(start+1)+'–'+to+' / '+total+'행</span><span style="flex:1;"></span>'
    +'<button class="rsc-pg-btn" '+(page<=1?'disabled':'')+' onclick="rscPageGo(1)">«</button>'
    +'<button class="rsc-pg-btn" '+(page<=1?'disabled':'')+' onclick="rscPageGo('+(page-1)+')">‹</button>'
    +'<span class="rsc-page-cur">'+page+' / '+pages+'</span>'
    +'<button class="rsc-pg-btn" '+(page>=pages?'disabled':'')+' onclick="rscPageGo('+(page+1)+')">›</button>'
    +'<button class="rsc-pg-btn" '+(page>=pages?'disabled':'')+' onclick="rscPageGo('+pages+')">»</button>'
    +_rscPageSizeSel(ps);
  bar.style.display='flex';
}
function _rscPageSizeSel(ps){ return '<select class="rsc-sel" style="margin-left:10px;" onchange="rscPageSize(this.value)">'+[20,50,100,500].map(function(n){return '<option value="'+n+'"'+(ps===n?' selected':'')+'>'+n+'행씩</option>';}).join('')+'<option value="0"'+(ps===0?' selected':'')+'>전체</option></select>'; }
// ── 그룹핑 렌더러/토글 ──
function _rscColById(id){ var db=_rscCur(); return (db.columns||[]).filter(function(c){return c.id===id;})[0]; }
function _rscGrpRenderer(inst,td,row,col,prop,value){
  var h=(window._rscPageRows||[])[row]; if(!h||h.__grp===undefined){ td.innerHTML=''; return td; }
  if(col!==0){ td.innerHTML=''; td.className='rsc-grp-empty'; return td; }
  var gesc=_rscEsc(h.__grp).replace(/"/g,'&quot;');
  // 펼침 = 이름만(소계는 하단 소계행). 접힘 = 헤더에 소계 요약 인라인.
  var inline=''; if(h.__collapsed){ var sums=h.__sums||{}; var sumStr=Object.keys(sums).filter(function(k){return sums[k];}).map(function(k){var c=_rscColById(k);return (c?c.title:k)+' '+_rscNumFmt(sums[k]);}).join(' · '); if(sumStr) inline='<span class="rsc-grp-sum">'+_rscEsc(sumStr)+'</span>'; }
  td.innerHTML='<div class="rsc-grp" data-grp="'+gesc+'"><i class="ti ti-chevron-'+(h.__collapsed?'right':'down')+'"></i><b>'+_rscEsc(h.__grp)+'</b><span class="rsc-grp-cnt">'+h.__count+'개</span><button class="rsc-grp-hide" data-grphide="'+gesc+'" title="이 그룹 숨기기"><i class="ti ti-eye-off"></i> 숨기기</button>'+inline+'</div>';
  td.className='rsc-grp-cell'; return td;
}
// 노션식 그룹 하단 소계행: 각 열 칸에 그 열의 합계를 정렬해서 표시
function _rscGrpFootRenderer(inst,td,row,col,prop,value){
  var h=(window._rscPageRows||[])[row]; if(!h||h.__grpfoot===undefined){ td.innerHTML=''; td.className=''; return td; }
  var sums=h.__sums||{};
  if(prop!=null && sums[prop]!==undefined && sums[prop]!==null){ td.innerHTML='<span class="rsc-gf-lbl">합계</span> <b>'+_rscEsc(_rscNumFmt(sums[prop]))+'</b>'; }
  else { td.innerHTML=''; }
  td.className='rsc-gf-cell'; return td;
}
function _rscGrpToggle(gv){ if(_rscGrpOpen[gv]===false) delete _rscGrpOpen[gv]; else _rscGrpOpen[gv]=false; _rscSaveView(); _rscRenderTable(); }
function _rscGrpHide(gv){ _rscGrpHidden[gv]=true; _rscSaveView(); renderResourcePage(); if(typeof showToast==='function')showToast('그룹 숨김: '+gv+' — 툴바 [숨긴 그룹]에서 복원'); }   // 전체 렌더(툴바 갱신)
function _rscGrpShow(gv){ delete _rscGrpHidden[gv]; _rscSaveView(); renderResourcePage(); }
function _rscGrpShowAll(){ _rscGrpHidden={}; _rscSaveView(); _rscPopClose&&_rscPopClose(); renderResourcePage(); }
function rscGrpHiddenMenu(e){ _rscPopClose&&_rscPopClose(); var keys=Object.keys(_rscGrpHidden); var m=_rscPop('rsc-pop',e,260);
  var rows=keys.map(function(gv){ var g2=gv.replace(/'/g,"\\'"); return '<div class="rsc-hg-row"><span class="rsc-hg-name">'+_rscEsc(gv)+'</span><button class="rsc-btn gh" style="padding:2px 9px;" onclick="_rscGrpShow(\''+g2+'\')"><i class="ti ti-eye"></i> 표시</button></div>'; }).join('');
  m.innerHTML='<div class="rsc-cm-lbl">숨긴 그룹 ('+keys.length+')</div><div class="rsc-hg-list">'+(rows||'<div style="font-size:11.5px;color:var(--text3);padding:4px 2px;">없음</div>')+'</div>'+(keys.length?'<button class="rsc-btn gh" style="margin-top:7px;width:100%;color:#2d6fd4;" onclick="_rscGrpShowAll()"><i class="ti ti-eye"></i> 모두 표시</button>':'');
}
function rscPageGo(p){ _rscPage=parseInt(p,10)||1; _rscRenderTable(); }   // 페이지 이동 시 선택 유지(전체선택 후 페이지 넘겨도 유지)
function rscPageSize(n){ _rscPageSize=parseInt(n,10)||0; _rscPage=1; _rscSelSet=new Set(); _rscRenderTable(); }
// ── 엑셀/CSV 임포팅 (필드 매핑) ──
function _rscParseCSV(text){ var rows=[],row=[],cur='',q=false,i=0,s=String(text||'').replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  for(;i<s.length;i++){ var ch=s[i];
    if(q){ if(ch==='"'){ if(s[i+1]==='"'){cur+='"';i++;} else q=false; } else cur+=ch; }
    else { if(ch==='"')q=true; else if(ch===','){row.push(cur);cur='';} else if(ch==='\n'){row.push(cur);rows.push(row);row=[];cur='';} else cur+=ch; }
  }
  if(cur!==''||row.length){ row.push(cur); rows.push(row); }
  return rows;
}
function rscImport(){
  var inp=document.createElement('input'); inp.type='file'; inp.accept='.csv,.xlsx,.xls'; inp.style.display='none';
  inp.onchange=function(){ var f=inp.files&&inp.files[0]; if(!f)return; var nm=f.name.toLowerCase(); var isX=/\.(xlsx|xls)$/.test(nm)&&typeof XLSX!=='undefined';
    var rd=new FileReader();
    rd.onload=function(ev){ try{ var r2=null;
        if(isX){ var wb=XLSX.read(ev.target.result,{type:'array'}); var ws=wb.Sheets[wb.SheetNames[0]]; r2=XLSX.utils.sheet_to_json(ws,{header:1,defval:''}); }
        else { r2=_rscParseCSV(ev.target.result); }
        r2=(r2||[]).filter(function(r){ return r&&r.some(function(c){return String(c==null?'':c).trim()!=='';}); });
        if(!r2.length){ if(typeof showToast==='function')showToast('데이터가 없습니다'); return; }
        _rscImportDialog(r2);
      }catch(e){ if(typeof showToast==='function')showToast('파일 읽기 실패: '+((e&&e.message)||e)); } };
    if(isX) rd.readAsArrayBuffer(f); else rd.readAsText(f,'utf-8');
  };
  document.body.appendChild(inp); inp.click(); setTimeout(function(){ try{inp.remove();}catch(e){} },2000);
}
function _rscImportDialog(r2){
  _rscImportClose(); window._rscImp={data:r2, header:true};
  var db=_rscCur(); var cols=db.columns||[]; var hdr=r2[0]||[];
  window._rscImp.map=hdr.map(function(h){ var hn=String(h||'').trim().toLowerCase(); var m=cols.filter(function(c){return String(c.title).trim().toLowerCase()===hn;})[0]; return m?m.id:''; });
  _rscImportRender();
}
function _rscImportRender(){
  var imp=window._rscImp; if(!imp)return; var db=_rscCur(); var cols=db.columns||[];
  var src = imp.header ? (imp.data[0]||[]) : (imp.data[0]||[]).map(function(_,i){return '열'+(i+1);});
  var nData = imp.header ? imp.data.length-1 : imp.data.length;
  var rows=src.map(function(h,i){ var opts='<option value="">— 무시 —</option>'+cols.map(function(c){return '<option value="'+c.id+'"'+(imp.map[i]===c.id?' selected':'')+'>'+_rscEsc(c.title)+'</option>';}).join('');
    return '<div class="rsc-imp-row"><span class="rsc-imp-src" title="'+_rscEsc(String(h))+'">'+_rscEsc(String(h)||('열'+(i+1)))+'</span><i class="ti ti-arrow-right" style="color:var(--text3);"></i><select class="rsc-sel" onchange="window._rscImp.map['+i+']=this.value;">'+opts+'</select></div>'; }).join('');
  _rscImportClose();
  var ov=document.createElement('div'); ov.id='rsc-impmodal'; ov.className='dsh-modal-ov'; ov.onclick=function(e){ if(e.target===ov)_rscImportClose(); };
  ov.innerHTML='<div class="dsh-edit-box" style="width:520px;"><div class="dsh-edit-hd"><i class="ti ti-file-import"></i> 엑셀/CSV 가져오기 — 필드 매핑<i class="ti ti-x" onclick="_rscImportClose()" style="margin-left:auto;cursor:pointer;"></i></div>'
    +'<div class="dsh-edit-body"><label style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--text2);cursor:pointer;margin-bottom:8px;"><input type="checkbox" '+(imp.header?'checked':'')+' onchange="window._rscImp.header=this.checked;_rscImportRender();"> 첫 행을 헤더로 사용 (이름으로 자동 매핑)</label>'
    +'<div style="font-size:11px;color:var(--text3);margin-bottom:6px;">가져올 열 → 표의 어느 속성에 넣을지 선택 (무시 가능) · 데이터 '+nData+'행</div>'
    +'<div class="rsc-imp-list">'+rows+'</div></div>'
    +'<div class="dsh-edit-ft"><button class="dsh-btn-c" onclick="_rscImportClose()">취소</button><button class="dsh-btn-s" onclick="_rscImportApply()">'+nData+'행 가져오기</button></div></div>';
  document.body.appendChild(ov);
}
function _rscImportClose(){ var m=document.getElementById('rsc-impmodal'); if(m)m.remove(); }
function _rscImportApply(){
  var imp=window._rscImp; if(!imp)return; var db=_rscCur(); var data=imp.header?imp.data.slice(1):imp.data; var map=imp.map||[]; var added=0;
  data.forEach(function(r){ var obj={},any=false; map.forEach(function(cid,si){ if(cid && r[si]!=null && String(r[si]).trim()!==''){ obj[cid]=String(r[si]); any=true; } }); if(any){ db.rows.push(obj); added++; } });
  _rscSave(); _rscImportClose(); if(_rscTab==='table')_rscRenderTable(); else if(_rscTab==='board')_rscRenderBoard(); else renderResourcePage();
  if(typeof showToast==='function')showToast('📥 '+added+'행 가져옴');
}
// ── 커스텀 선택/상태 드롭다운 (HOT 기본 대신 색 태그) ──
function _rscOptDropdown(row,col,e){
  _rscOptDropClose(); var db=_rscCur(); var c=(db.columns||[])[col]; if(!c||!_rscHot)return;
  if(c.options&&c.options.length>1){ var _srt=c.options.slice().sort(function(a,b){return String(a).localeCompare(String(b),'ko',{numeric:true});}); if(_srt.join('')!==c.options.join('')){ c.options=_srt; try{_rscSave();}catch(e){} } }   // 드롭다운 옵션 자연정렬(매번 보장)
  var opts=c.options||[]; var multi=(c.type==='multiselect');
  var cur=multi?String(_rscHot.getDataAtCell(row,col)||'').split(',').map(function(x){return x.trim();}).filter(Boolean):[String(_rscHot.getDataAtCell(row,col)||'')];
  var m=document.createElement('div'); m.id='rsc-optdrop'; m.className='rsc-optdrop';
  var list=opts.map(function(o,oi){ var oc=_rscOptColor(c,o); var on=cur.indexOf(o)>=0; return '<div class="rsc-optitem'+(on?' on':'')+'" onclick="_rscOptPick('+row+','+col+','+oi+','+multi+')">'+(multi?'<i class="ti '+(on?'ti-checkbox':'ti-square')+'" style="font-size:15px;color:'+(on?'#2d6fd4':'#c0c6d0')+';"></i>':'')+(c.type==='status'?_rscStatusHtml(o,oc):_rscTagHtml(o,oc))+(on&&!multi?'<i class="ti ti-check" style="margin-left:auto;color:#2d6fd4;font-size:15px;"></i>':'')+'</div>'; }).join('');
  if(!opts.length) list='<div style="padding:9px 11px;color:var(--text3);font-size:12px;">옵션 없음 — 열 제목 우클릭 → 옵션 추가</div>';
  m.innerHTML='<div class="rsc-optdrop-list">'+list+'</div>'+((!multi&&cur[0])?'<div class="rsc-optitem rsc-optclear" onclick="_rscOptPick('+row+','+col+',-1,false)"><i class="ti ti-eraser"></i> 비우기</div>':'')+(multi?'<div class="rsc-optdrop-ft"><button onclick="_rscOptDropClose()">완료</button></div>':'');
  document.body.appendChild(m);
  var td=null; try{ td=_rscHot.getCell(row,col); }catch(_){} var r=(td&&td.getBoundingClientRect)?td.getBoundingClientRect():{left:(e&&e.clientX)||120,bottom:(e&&e.clientY)||120,width:170};
  m.style.minWidth=Math.max(160,r.width)+'px'; m.style.left=Math.max(8,Math.min(r.left,window.innerWidth-m.offsetWidth-10))+'px'; m.style.top=Math.min(r.bottom+2,window.innerHeight-m.offsetHeight-8)+'px';
  setTimeout(function(){ document.addEventListener('mousedown',_rscOptDropOut,true); },0);
}
function _rscOptDropClose(){ var m=document.getElementById('rsc-optdrop'); if(m)m.remove(); try{document.removeEventListener('mousedown',_rscOptDropOut,true);}catch(e){} }
function _rscOptDropOut(e){ var m=document.getElementById('rsc-optdrop'); if(m&&!m.contains(e.target))_rscOptDropClose(); }
// 기간(daterange) 셀 팝업: 시작·종료 날짜 2개 → "시작~종료" 문자열로 저장
function _rscDateRangePopup(row,col,e){
  _rscOptDropClose(); var old=document.getElementById('rsc-drpop'); if(old)old.remove();
  var cur=(_rscHot&&typeof _rscHot.getDataAtCell==='function')?_rscHot.getDataAtCell(row,col):''; var r=_rscDateRangeParse(cur);
  var td=null; try{ td=_rscHot.getCell(row,col); }catch(_){}
  var rect=td?td.getBoundingClientRect():{left:(e?e.clientX:200),bottom:(e?e.clientY:200),width:160};
  var m=document.createElement('div'); m.id='rsc-drpop';
  m.style.cssText='position:fixed;z-index:100050;background:#fff;border:1px solid #d0d5dd;border-radius:10px;box-shadow:0 10px 30px rgba(20,30,60,0.22);padding:12px 14px;min-width:250px;';
  var _l=Math.min(rect.left, window.innerWidth-280), _t=Math.min(rect.bottom+4, window.innerHeight-170);
  m.style.left=_l+'px'; m.style.top=_t+'px';
  var inS='font-size:12.5px;padding:6px 9px;border:1px solid var(--border);border-radius:7px;outline:none;box-sizing:border-box;width:100%;';
  m.innerHTML='<div style="font-size:11px;font-weight:800;color:#2d6fd4;margin-bottom:8px;"><i class="ti ti-calendar-week"></i> 기간 설정</div>'
    +'<div style="display:flex;flex-direction:column;gap:8px;">'
    +'<div><div style="font-size:10.5px;color:var(--text3);font-weight:700;margin-bottom:3px;">시작일</div><input type="date" id="rsc-dr-s" value="'+_rscEsc(r.s)+'" style="'+inS+'"></div>'
    +'<div><div style="font-size:10.5px;color:var(--text3);font-weight:700;margin-bottom:3px;">종료일</div><input type="date" id="rsc-dr-e" value="'+_rscEsc(r.e)+'" style="'+inS+'"></div>'
    +'</div>'
    +'<div style="display:flex;gap:6px;margin-top:11px;justify-content:flex-end;">'
    +'<button onclick="_rscDateRangeClear('+row+','+col+')" style="font-size:11px;padding:5px 10px;border-radius:6px;border:1px solid var(--border);background:#fff;color:var(--text3);cursor:pointer;">비우기</button>'
    +'<button onclick="_rscDateRangeApply('+row+','+col+')" style="font-size:11.5px;font-weight:700;padding:5px 14px;border-radius:6px;border:none;background:#2d6fd4;color:#fff;cursor:pointer;">적용</button>'
    +'</div>';
  document.body.appendChild(m);
  setTimeout(function(){ document.addEventListener('mousedown',_rscDateRangeOut,true); },10);
}
function _rscDateRangeOut(e){ var m=document.getElementById('rsc-drpop'); if(m&&!m.contains(e.target))_rscDateRangeCloseDR(); }
function _rscDateRangeCloseDR(){ var m=document.getElementById('rsc-drpop'); if(m)m.remove(); try{document.removeEventListener('mousedown',_rscDateRangeOut,true);}catch(e){} }
function _rscDateRangeApply(row,col){ var s=(document.getElementById('rsc-dr-s')||{}).value||''; var ed=(document.getElementById('rsc-dr-e')||{}).value||''; var v=(s||ed)?(s+'~'+ed):''; try{ _rscHot.setDataAtCell(row,col,v); }catch(e){} _rscDateRangeCloseDR(); }
function _rscDateRangeClear(row,col){ try{ _rscHot.setDataAtCell(row,col,''); }catch(e){} _rscDateRangeCloseDR(); }
function _rscOptPick(row,col,oi,multi){
  var db=_rscCur(); var c=db.columns[col]; if(!c||!_rscHot)return; var val=(oi<0)?'':((c.options||[])[oi]); if(oi>=0&&val==null)return;
  if(multi){ var cur=String(_rscHot.getDataAtCell(row,col)||'').split(',').map(function(x){return x.trim();}).filter(Boolean); var k=cur.indexOf(val); if(k>=0)cur.splice(k,1); else cur.push(val); _rscHot.setDataAtCell(row,col,cur.join(', ')); _rscOptDropdown(row,col,null); }
  else { _rscHot.setDataAtCell(row,col,val); _rscOptDropClose(); }
}
// ── 셀 우클릭 메뉴 (복사/복제/추가/삭제) — HOT 비의존 ──
function _rscCellMenu(e,vrow){
  _rscCellMenuClose();
  var m=document.createElement('div'); m.id='rsc-cellmenu'; m.className='dsh-wmenu'; m.style.cssText='position:fixed;z-index:12000;width:200px;';
  m.innerHTML='<button onclick="_rscCellCopy('+vrow+');_rscCellMenuClose()"><i class="ti ti-copy"></i> 복사 (클립보드)</button>'
    +'<button onclick="_rscCellDup('+vrow+');_rscCellMenuClose()"><i class="ti ti-row-insert-bottom"></i> 행 복제</button>'
    +'<button onclick="_rscCellAdd();_rscCellMenuClose()"><i class="ti ti-plus"></i> 행 추가</button>'
    +'<button class="del" onclick="_rscCellDel('+vrow+');_rscCellMenuClose()"><i class="ti ti-trash"></i> 행 삭제</button>';
  document.body.appendChild(m);
  m.style.left=Math.min((e&&e.clientX)||100,window.innerWidth-210)+'px'; m.style.top=Math.min((e&&e.clientY)||100,window.innerHeight-170)+'px';
  setTimeout(function(){ document.addEventListener('mousedown',_rscCellMenuOut,true); },0);
}
function _rscCellMenuClose(){ var m=document.getElementById('rsc-cellmenu'); if(m)m.remove(); try{document.removeEventListener('mousedown',_rscCellMenuOut,true);}catch(e){} }
function _rscCellMenuOut(e){ var m=document.getElementById('rsc-cellmenu'); if(m&&!m.contains(e.target))_rscCellMenuClose(); }
function _rscCellCopy(vrow){
  if(!_rscHot)return; var sel=null; try{ sel=_rscHot.getSelectedLast(); }catch(_){}
  var ncol=(_rscCur().columns||[]).length; var r1,c1,r2,c2;
  if(sel&&sel.length>=4){ r1=Math.min(sel[0],sel[2]); r2=Math.max(sel[0],sel[2]); c1=Math.min(sel[1],sel[3]); c2=Math.max(sel[1],sel[3]); }
  else { r1=r2=vrow; c1=0; c2=ncol-1; }
  var lines=[]; for(var r=r1;r<=r2;r++){ var cells=[]; for(var c=c1;c<=c2;c++){ var v=_rscHot.getDataAtCell(r,c); cells.push(v==null?'':String(v)); } lines.push(cells.join('\t')); }
  _rscClipText(lines.join('\n')); if(typeof showToast==='function')showToast('📋 복사됨 ('+(r2-r1+1)+'행) — 붙여넣기 가능');
}
function _rscCellDup(vrow){ var db=_rscCur(); var rws=(_rscHot&&_rscHot.getSourceData)?_rscHot.getSourceData():db.rows; var src=rws[vrow]; if(!src)return; var idx=db.rows.indexOf(src); var nd=JSON.parse(JSON.stringify(src)); db.rows.splice(idx<0?db.rows.length:idx+1,0,nd); _rscSave(); _rscRenderTable(); if(typeof showToast==='function')showToast('⧉ 행 복제됨'); }
function _rscCellAdd(){ var db=_rscCur(); db.rows.push({}); _rscSave(); _rscRenderTable(); }
function _rscCellDel(vrow){ var db=_rscCur(); var rws=(_rscHot&&_rscHot.getSourceData)?_rscHot.getSourceData():db.rows; var src=rws[vrow]; if(!src)return; var idx=db.rows.indexOf(src); if(idx>=0){ db.rows.splice(idx,1); _rscSave(); _rscRenderTable(); } }
function _rscClipCopy(sel){
  if(!_rscHot||!sel||!sel[0]){ return; }
  var r1=Math.min(sel[0].start.row,sel[0].end.row), r2=Math.max(sel[0].start.row,sel[0].end.row);
  var c1=Math.min(sel[0].start.col,sel[0].end.col), c2=Math.max(sel[0].start.col,sel[0].end.col);
  var lines=[]; for(var r=r1;r<=r2;r++){ var cells=[]; for(var c=c1;c<=c2;c++){ var v=_rscHot.getDataAtCell(r,c); cells.push(v==null?'':String(v)); } lines.push(cells.join('\t')); }
  _rscClipText(lines.join('\n'));
  if(typeof showToast==='function')showToast('📋 클립보드 복사됨 ('+(r2-r1+1)+'행 × '+(c2-c1+1)+'열) — 붙여넣기 가능');
}
// 필터/검색 적용된 행(원본 객체 참조 그대로 → 편집이 db.rows에 반영)
function _rscMatch(r,f){ if(!f||!f.col)return true; var v=r[f.col]; var vs=String(v==null?'':v); var fv=String(f.val==null?'':f.val);
  if(f.op!=='empty'&&f.op!=='notempty'&&fv.trim()==='') return true;   // 값 없는 조건은 비활성(전부 통과) → 잔재 필터로 0행 되는 문제 방지
  switch(f.op){ case 'eq':return vs===fv; case 'neq':return vs!==fv; case 'contains':return vs.toLowerCase().indexOf(fv.toLowerCase())>=0; case 'ncontains':return vs.toLowerCase().indexOf(fv.toLowerCase())<0; case 'empty':return vs.trim()===''; case 'notempty':return vs.trim()!==''; case 'gt':return parseFloat(v)>parseFloat(fv); case 'lt':return parseFloat(v)<parseFloat(fv); case 'gte':return parseFloat(v)>=parseFloat(fv); case 'lte':return parseFloat(v)<=parseFloat(fv); default:return vs===fv; } }
function _rscCmp(av,bv,num){ if(num){ av=parseFloat(av);bv=parseFloat(bv); if(isNaN(av))av=-Infinity; if(isNaN(bv))bv=-Infinity; return av<bv?-1:av>bv?1:0; } av=String(av==null?'':av); bv=String(bv==null?'':bv); return av.localeCompare(bv,'ko',{numeric:true}); }
function _rscViewRows(db){
  var q=_rscSearchQ;
  var out=(db.rows||[]).filter(function(r){
    if(q && JSON.stringify(r).toLowerCase().indexOf(q)<0) return false;
    for(var i=0;i<_rscFilters.length;i++){ if(!_rscMatch(r,_rscFilters[i])) return false; }   // 멀티 필터 = 모두 만족(AND)
    return true;
  });
  if(_rscSorts.length){ out=out.slice().sort(function(a,b){ for(var i=0;i<_rscSorts.length;i++){ var s=_rscSorts[i]; if(!s||!s.col)continue; var c=_rscCol(db,s.col); var cmp=_rscCmp(a[s.col],b[s.col],c&&c.type==='number')*(s.dir||1); if(cmp)return cmp; } return 0; }); }   // 멀티 정렬 = 1순위, 2순위...
  return out;
}
// 태그(select) 렌더러// 숫자 막대 렌더러 생성(열 최대값 기준)
function _rscHotNum(mx){
  return function(inst, td, row, col, prop, value){
    var num=parseFloat(value);
    if(isNaN(num)){ td.innerHTML=''; td.className='htMiddle'; return td; }
    var pct=mx>0?Math.max(4,Math.min(100,num/mx*100)):0; var hot=mx>0&&num/mx>=0.85;
    td.innerHTML='<div class="rsc-numbar"><i class="rsc-numbar-fill'+(hot?' hot':'')+'" style="width:'+pct+'%"></i><b>'+_rscEsc(_rscNumFmt(num))+'</b></div>';
    td.className='htMiddle'; return td;
  };
}
// 상태(점+칩) 렌더러
function _rscStatusHtml(v,color){ if(v==null||v==='')return ''; var c=color||_rscColor(v); return '<span style="display:inline-flex;align-items:center;gap:5px;background:'+c+'18;color:'+c+';padding:2px 9px;border-radius:6px;font-size:11px;font-weight:700;white-space:nowrap;"><span style="width:7px;height:7px;border-radius:50%;background:'+c+';"></span>'+_rscEsc(v)+'</span>'; }
// 색상 인식(컬럼 c의 optColors 사용) 렌더러 팩토리
function _rscHotTagC(c){ return function(inst,td,row,col,prop,value){ td.innerHTML=(value!=null&&value!=='')?_rscTagHtml(value,_rscOptColor(c,value)):''; td.className='htMiddle rsc-cell-tag'; return td; }; }
function _rscHotStatusC(c){ return function(inst,td,row,col,prop,value){ td.innerHTML=(value!=null&&value!=='')?_rscStatusHtml(value,_rscOptColor(c,value)):''; td.className='htMiddle rsc-cell-tag'; return td; }; }
function _rscHotMultiC(c){ return function(inst,td,row,col,prop,value){ var s=String(value==null?'':value); td.innerHTML=s.split(',').map(function(x){return x.trim();}).filter(Boolean).map(function(x){return _rscTagHtml(x,_rscOptColor(c,x));}).join(' '); td.className='htMiddle rsc-cell-tag'; return td; }; }
// 사람(아바타+이름)
function _rscHotPerson(inst,td,row,col,prop,value){ var s=String(value==null?'':value).trim(); td.innerHTML=s?('<span class="rsc-person"><span class="rsc-ava" style="background:'+_rscColor(s)+'">'+_rscEsc(s.charAt(0))+'</span>'+_rscEsc(s)+'</span>'):''; td.className='htMiddle'; return td; }
// 기간(시작~종료): 값 = "시작~종료" 또는 {s,e}. 셀엔 "시작 ~ 종료" 칩으로 표시
function _rscDateRangeParse(v){ if(v==null||v==='')return {s:'',e:''}; if(typeof v==='object')return {s:v.s||v.start||'',e:v.e||v.end||''};
  var str=String(v);
  // 구분자는 '~'만 (날짜 안의 '-'는 구분자 아님). 없으면 ' - '(공백-공백)만 허용
  var p=str.indexOf('~')>=0 ? str.split('~') : (/\s-\s/.test(str)? str.split(/\s-\s/) : [str]);
  return {s:(p[0]||'').trim(),e:(p[1]||'').trim()}; }
function _rscHotDateRange(inst,td,row,col,prop,value){
  var r=_rscDateRangeParse(value); td.className='htMiddle htCenter';
  if(!r.s&&!r.e){ td.innerHTML='<span style="color:#c8cdd6;font-size:11px;">기간 선택</span>'; return td; }
  var full=(r.s||'?')+' ~ '+(r.e||'?');
  var sY=(r.s||'').slice(0,4), eY=(r.e||'').slice(0,4);
  var eShort=(r.e&&sY&&sY===eY)?r.e.slice(5):(r.e||'?');
  // 소요 일수(양끝 포함) → 날짜 옆에 인라인 표시
  var days=0; try{ if(r.s&&r.e){ var d1=new Date(r.s), d2=new Date(r.e); if(!isNaN(d1)&&!isNaN(d2)) days=Math.round((d2-d1)/86400000)+1; } }catch(e){}
  var durHtml=days>0?'<span style="font-size:10px;font-weight:800;color:#2d6fd4;background:#eaf1fd;border-radius:8px;padding:1px 7px;flex-shrink:0;">'+days+'일</span>':'';
  td.innerHTML='<span title="'+_rscEsc(full)+(days>0?(' ('+days+'일)'):'')+'" style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:#1c2030;white-space:normal;word-break:keep-all;justify-content:center;line-height:1.3;"><i class="ti ti-calendar-week" style="font-size:13px;color:#2d6fd4;flex-shrink:0;"></i><span>'+_rscEsc(r.s||'?')+' <span style="color:#9aa3b5;">~</span> '+_rscEsc(eShort)+'</span>'+durHtml+'</span>';
  return td;
}
// 기간 일수(자동 계산): 같은 행의 daterange 열(지정 srcCol 또는 첫 기간열)에서 시작~종료 차이(양끝 포함)
function _rscHotDateDiff(db, c){
  return function(inst,td,row,col,prop,value){
    td.className='htMiddle htCenter';
    // 참조할 기간 열: c.srcCol 지정 시 그 열, 없으면 첫 daterange 열
    var srcId=c&&c.srcCol; var dr=null;
    if(srcId) dr=(db.columns||[]).find(function(x){return x.id===srcId;});
    if(!dr) dr=(db.columns||[]).find(function(x){return x.type==='daterange';});
    if(!dr){ td.innerHTML='<span style="color:#c8cdd6;font-size:10.5px;">기간 열 없음</span>'; return td; }
    // 이 행의 원본 데이터에서 기간 값 읽기 (HOT 인스턴스 우선 — 그룹헤더/정렬 안전)
    var rowObj=null; try{ rowObj=inst.getSourceDataAtRow(row); }catch(e){}
    if(!rowObj||typeof rowObj!=='object'){ try{ rowObj=(window._rscDataRows&&window._rscDataRows[row])||null; }catch(e2){} }
    var rangeVal=rowObj?rowObj[dr.id]:'';
    var r=_rscDateRangeParse(rangeVal);
    var days=0; try{ if(r.s&&r.e){ var d1=new Date(r.s), d2=new Date(r.e); if(!isNaN(d1)&&!isNaN(d2)) days=Math.round((d2-d1)/86400000)+1; } }catch(e){}
    if(days>0){ td.innerHTML='<span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:800;color:#2d6fd4;"><i class="ti ti-clock-hour-4" style="font-size:12px;"></i>'+days+'일</span>'; }
    else { td.innerHTML='<span style="color:#c8cdd6;font-size:10.5px;">—</span>'; }
    return td;
  };
}
// URL/이메일/전화 링크
function _rscHotLink(kind){ return function(inst,td,row,col,prop,value){ var s=String(value==null?'':value).trim(); if(!s){td.innerHTML='';td.className='htMiddle';return td;} var href=kind==='email'?('mailto:'+s):kind==='phone'?('tel:'+s):(/^https?:/i.test(s)?s:('https://'+s)); var ic=kind==='email'?'ti-mail':kind==='phone'?'ti-phone':'ti-link'; td.innerHTML='<a href="'+_rscEsc(href)+'" target="_blank" rel="noopener" class="rsc-link" onclick="event.stopPropagation()"><i class="ti '+ic+'"></i>'+_rscEsc(s)+'</a>'; td.className='htMiddle'; return td; }; }
// 자동 합계 열(c.autoSum): 각 행 = 다른 '숫자' 열들의 합 (수식 — 노션 sum)
function _rscRecalcAuto(db){ if(!db||!db.columns)return; var autos=db.columns.filter(function(c){return c.autoSum;}); if(!autos.length)return; var nums=db.columns.filter(function(c){return c.type==='number'&&!c.autoSum;}); (db.rows||[]).forEach(function(r){ autos.forEach(function(ac){ var s=0; nums.forEach(function(nc){ var v=parseFloat(r[nc.id]); if(!isNaN(v))s+=v; }); r[ac.id]=Math.round(s*1e6)/1e6; }); }); }
function _rscRenderTable(){
  var db=_rscCur(); var host=document.getElementById('rsc-grid'); if(!host) return;
  _rscRecalcAuto(db);   // 합계 자동계산 열 갱신(렌더 전)
  try{ if(_rscHot){ _rscHot.destroy(); _rscHot=null; } }catch(e){}
  var cols=(db.columns||[]); if(!cols.length){ host.innerHTML='<div class="rsc-empty">열이 없습니다 — [열 설정]에서 추가하세요</div>'; return; }
  var maxMap={}; cols.filter(function(c){return c.type==='number';}).forEach(function(c){ var mx=0; (db.rows||[]).forEach(function(r){ var v=parseFloat(r[c.id]); if(!isNaN(v)&&v>mx)mx=v; }); maxMap[c.id]=mx; });
  var hotCols=cols.map(function(c){
    var o={data:c.id}; var t=c.type;
    if(t==='number'){ o.type='numeric'; o.numericFormat={pattern:'0.[00]'}; o.renderer=_rscHotNum(maxMap[c.id]||0); o.className='htRight'; }
    else if(t==='select'){ o.type='text'; o.editor=false; o.renderer=_rscHotTagC(c); }     // HOT 기본 드롭다운 끔 → 커스텀 색태그 드롭다운(셀 클릭)
    else if(t==='status'){ o.type='text'; o.editor=false; o.renderer=_rscHotStatusC(c); }
    else if(t==='multiselect'){ o.type='text'; o.editor=false; o.renderer=_rscHotMultiC(c); }
    else if(t==='date'){ o.type='date'; o.dateFormat='YYYY-MM-DD'; o.correctFormat=true; o.className='htCenter'; }
    else if(t==='daterange'){ o.type='text'; o.editor=false; o.renderer=_rscHotDateRange; o.className='htCenter'; }   // 기간(시작~종료) — 클릭 시 범위 피커
    else if(t==='datediff'){ o.type='text'; o.editor=false; o.readOnly=true; o.className='htCenter'; o.renderer=_rscHotDateDiff(db, c); }   // 기간 일수(자동 계산) — daterange 열의 시작~종료 차이
    else if(t==='checkbox'){ o.type='checkbox'; o.className='htCenter'; }
    else if(t==='person'){ o.type='text'; o.renderer=_rscHotPerson; }
    else if(t==='url'){ o.type='text'; o.renderer=_rscHotLink('url'); }
    else if(t==='email'){ o.type='text'; o.renderer=_rscHotLink('email'); }
    else if(t==='phone'){ o.type='text'; o.renderer=_rscHotLink('phone'); }
    else { o.type='text'; }
    if(c.autoSum){ o.readOnly=true; o.editor=false; }   // 합계 자동계산 열은 편집 불가(수식)
    return o;
  });
  var widths=cols.map(function(c){ return c.width||120; });
  var filterActive = !!_rscSearchQ || _rscFilters.some(function(f){return f&&f.col;}) || _rscSorts.some(function(s){return s&&s.col;});   // 필터·검색·정렬 → 뷰행 사용 + 행이동 비활성
  var allRows = filterActive ? _rscViewRows(db) : (db.rows||[]);
  window._rscDataRows = allRows;   // 필터·검색·정렬 적용된 '데이터 행'(그룹헤더·페이지 분할 전) → 하단 합계행 기준
  // ── 그룹핑(접기/펼치기 + 소계): 그룹헤더 행 객체(__grp) 삽입, mergeCells로 한 칸 병합 ──
  var grpCol = (db.groupBy && _rscCol(db,db.groupBy)) ? _rscCol(db,db.groupBy) : null;
  var mergeCells=null;
  // 소계 대상 열: 숫자 타입 + '값 전체가 숫자'인 열만(Number). '1.신규-21…'처럼 앞에만 숫자인 텍스트는 제외(parseFloat 오합산 방지)
  var numCols=(db.columns||[]).filter(function(c){ if(c.type==='number')return true; var anyNum=false,allOk=true; (allRows||[]).forEach(function(r){ var v=r&&r[c.id]; var s=String(v==null?'':v).trim(); if(s===''){return;} if(isNaN(Number(s))){allOk=false;} else {anyNum=true;} }); return anyNum&&allOk; });
  if(grpCol){
    var by={}, order=[]; allRows.forEach(function(r){ var gv=String(r[grpCol.id]==null||r[grpCol.id]===''?'(빈값)':r[grpCol.id]); if(!by[gv]){by[gv]=[];order.push(gv);} by[gv].push(r); });
    order.sort(function(a,b){return a.localeCompare(b,'ko',{numeric:true});});
    order=order.filter(function(gv){ return !_rscGrpHidden[gv]; });   // 노션식: 숨긴 그룹 제외
    window._rscDataRows=order.reduce(function(a,gv){ return a.concat(by[gv]); },[]);   // 합계는 보이는 그룹 기준
    var disp=[]; mergeCells=[]; var ncol=Math.max(1,cols.length);
    order.forEach(function(gv){ var rs=by[gv]; var collapsed=(_rscGrpOpen[gv]===false);
      var sums={}; numCols.forEach(function(c){ sums[c.id]=rs.reduce(function(a,r){var v=parseFloat(r[c.id]);return a+(isNaN(v)?0:v);},0); });
      mergeCells.push({row:disp.length,col:0,rowspan:1,colspan:ncol});   // 그룹 헤더만 병합(▼ 이름)
      disp.push({__grp:gv,__count:rs.length,__sums:sums,__collapsed:collapsed});
      if(!collapsed){ rs.forEach(function(r){disp.push(r);}); disp.push({__grpfoot:gv,__sums:sums}); }   // 노션식: 그룹 맨 아래 열별 소계행(병합 안 함)
    });
    allRows=disp;
  }
  var total=allRows.length, ps=_rscPageSize||20, pages=Math.max(1,Math.ceil(total/ps)); _rscPage=Math.min(Math.max(1,_rscPage),pages); var start=(_rscPage-1)*ps;
  var canDrag=!filterActive;   // 필터·검색·정렬 없으면 드래그 가능 (그룹 있어도 허용)
  var paged=(!grpCol && ps>0 && total>ps && !canDrag); var rows = (canDrag||grpCol)?allRows:allRows.slice(start,start+ps);   // 드래그·그룹 시 전체 표시
  window._rscPageRows=rows; window._rscAllRows=allRows; window._rscPageStart=grpCol?0:start;   // 선택은 행 객체 기준(_rscSelSet) → 페이지 넘겨도 유지
  // 행번호: 그룹헤더·소계행 제외하고 데이터 행만 순번
  (function(){ var o=grpCol?0:start; window._rscRowOrd=rows.map(function(rr){ if(rr&&(rr.__grp!==undefined||rr.__grpfoot!==undefined))return ''; o++; return o; }); })();
  window._rscRowMoveOK=canDrag;   // ★ Handsontable 생성 전에 설정 — rowHeaders/afterGetRowHeader가 생성 시점에 읽음(뷰 전환 시 stale 방지)
  var ctx={ items:{
    'clip':{ name:'📋 복사 (클립보드 — 셀/행)', callback:function(key,sel){ _rscClipCopy(sel); } },
    'dup':{ name:'⧉ 행 복제 (아래에 붙여넣기)', callback:function(key,sel){ var r=(sel&&sel[0])?sel[0].start.row:-1; var src=rows[r]; if(!src)return; var idx=db.rows.indexOf(src); var nd=JSON.parse(JSON.stringify(src)); db.rows.splice(idx<0?db.rows.length:idx+1,0,nd); _rscSave(); _rscRenderTable(); if(typeof showToast==='function')showToast('⧉ 행 복제됨 (전체 내용)'); } },
    'add':{ name:'➕ 행 추가', callback:function(){ db.rows.push({}); _rscSave(); _rscRenderTable(); } },
    'remove':{ name:'🗑 행 삭제', callback:function(key,sel){ var r=(sel&&sel[0])?sel[0].start.row:-1; var src=rows[r]; if(!src)return; var idx=db.rows.indexOf(src); if(idx>=0){ db.rows.splice(idx,1); _rscSave(); _rscRenderTable(); } } }
  }};
  var hopt={
    data: rows, columns: hotCols, colHeaders: cols.map(function(c){return '<span class="rsc-hd"><i class="ti '+_rscTypeIcon(c.type)+'"></i> '+_rscEsc(c.title)+'</span>';}), colWidths: widths,
    rowHeaders:function(r){ var rr=rows[r]; if(rr&&(rr.__grp!==undefined||rr.__grpfoot!==undefined)) return ''; var ord=(window._rscRowOrd||[])[r]; var mv=window._rscRowMoveOK?'<span class="rsc-rowhandle" title="드래그하여 행 이동"><i class="ti ti-grip-vertical"></i></span>':''; return '<label class="rsc-rh">'+mv+'<input type="checkbox" class="rsc-rowchk" data-r="'+r+'"'+(_rscSelSet.has(rr)?' checked':'')+'><b>'+(ord||'')+'</b></label>'; }, rowHeaderWidth:70, maxRows:100000,
    mergeCells: mergeCells||false,
    cells:function(row,col){ var rr=rows[row]; if(rr&&rr.__grp!==undefined){ return {readOnly:true, renderer:_rscGrpRenderer}; } if(rr&&rr.__grpfoot!==undefined){ return {readOnly:true, renderer:_rscGrpFootRenderer}; } return {}; },   // 그룹헤더(병합)·소계행(열별) → 읽기전용 + 전용 렌더러
    stretchH:'none', manualColumnResize:false, manualColumnMove:false, manualRowMove:false,   // 네이티브 리사이즈·열이동·행이동 끔 → 아래 커스텀(그립 드래그)
    autoRowSize:{syncLimit:100}, currentRowClassName:'rsc-cur-row', currentColClassName:'rsc-cur-col', autoColumnSize:false,
    contextMenu:false, fillHandle:{direction:'vertical',autoInsertRow:false}, wordWrap:true,   // HOT 기본 메뉴 끔 → 아래 커스텀 우클릭 메뉴 사용(확실히 동작)
    afterChange:function(changes,source){ if(source==='loadData')return; var hasAuto=(db.columns||[]).some(function(c){return c.autoSum;}); var hasDiff=(db.columns||[]).some(function(c){return c.type==='datediff';}); if(hasAuto){ _rscRecalcAuto(db); } _rscSave(); try{ if(hasAuto||hasDiff) _rscHot.render(); _rscRenderFoot(db,cols); try{ _rscHot.getPlugin('autoRowSize').recalculateAllRowsHeight(); _rscHot.render(); }catch(_){} }catch(e){} },   // 합계/기간일수 자동계산 열 있으면 재렌더
    afterOnCellMouseDown:function(e,coords){ try{ if(!coords||coords.row<0||coords.col<0)return; if(e&&e.button!==0)return; var cc=cols[coords.col]; if(cc&&(cc.type==='select'||cc.type==='status'||cc.type==='multiselect')) setTimeout(function(){ _rscOptDropdown(coords.row,coords.col,e); },0); else if(cc&&cc.type==='daterange') setTimeout(function(){ _rscDateRangePopup(coords.row,coords.col,e); },0); }catch(_){} },   // 선택/상태 셀 클릭 → 커스텀 드롭다운, 기간 셀 → 범위 피커
    afterGetColHeader:function(col,TH){ if(col<0||!TH)return; if(col===window._rscColActive){ TH.className=(TH.className||'')+' rsc-hd-active'; } TH.oncontextmenu=function(ev){ try{ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation();}catch(_){} var _r=TH.getBoundingClientRect(); _rscColMenu({clientX:_r.left,clientY:_r.bottom+2},col); return false; };   // 메뉴를 헤더 바로 아래에
      TH.setAttribute('data-rsccol',col);
      try{ TH.style.position='relative';
        if(TH.querySelector && !TH.querySelector('.rsc-colgrip')){ var _g=document.createElement('div'); _g.className='rsc-colgrip'; _g.innerHTML='<i class="ti ti-grip-vertical"></i>'; _g.title='드래그하여 열 이동'; _g.onmousedown=function(ev){ if(ev.button!==0)return; try{ev.preventDefault();ev.stopPropagation();}catch(_){} var c=parseInt(TH.getAttribute('data-rsccol'),10); if(!isNaN(c))_rscColDragStart(c,ev); }; TH.appendChild(_g); }   // 전용 드래그 그립(이것만 드래그)
        if(TH.querySelector && !TH.querySelector('.rsc-rzh')){ var _hd=document.createElement('div'); _hd.className='rsc-rzh'; _hd.onmousedown=function(ev){ try{ev.preventDefault();ev.stopPropagation();}catch(_){} _rscColResizeStart(col,ev); }; TH.appendChild(_hd); }   // 커스텀 폭 조절 핸들
      }catch(_){}
      if(!TH._rscClickBound){ TH._rscClickBound=true; TH.addEventListener('click',function(ev){ if(ev.target&&ev.target.closest&&(ev.target.closest('.rsc-colgrip')||ev.target.closest('.rsc-rzh')))return; var c=parseInt(TH.getAttribute('data-rsccol'),10); if(isNaN(c))return; var _r2=TH.getBoundingClientRect(); _rscColMenu({clientX:_r2.left,clientY:_r2.bottom+2},c); }); }   // 헤더 클릭 → 헤더 바로 아래에 메뉴
    },
    afterRowMove:function(){ if(filterActive||paged)return; try{ db.rows=_rscHot.getSourceData().slice(); _rscSave(); }catch(e){} },
    afterGetRowHeader:function(row,TH){ if(row<0||!TH)return; TH.setAttribute('data-rscrow',row);   // 행이동 대상 판정용
      if(!window._rscRowMoveOK){ try{TH.classList.remove('rsc-rowdrag');}catch(_){} return; }   // 필터·정렬·페이징·그룹 중엔 행이동 끔(순서 뒤섞임 방지)
      try{ TH.style.position='relative'; TH.classList.add('rsc-rowdrag'); TH.title='드래그하여 행 순서 이동';
        if(!TH._rscRowDragBound){ TH._rscRowDragBound=true;
          TH.addEventListener('mousedown',function(ev){ if(ev.button!==0)return; if(ev.target&&ev.target.closest&&ev.target.closest('.rsc-rowchk'))return;   // 체크박스는 선택용 → 드래그 제외
            try{ev.preventDefault();ev.stopPropagation();}catch(_){} var r=parseInt(TH.getAttribute('data-rscrow'),10); if(!isNaN(r))_rscRowDragStart(r,ev); }); }   // 행 헤더 아무 데나(번호·핸들) 잡고 드래그 → 넓은 히트영역
      }catch(_){}
    }
  };
  // Test Report식 + 스크롤바 1개(깜빡임 없음): 모든 행 실제 렌더(renderAllRows) + 생성 '같은 프레임'에서 실제 내용 높이로 1회 확정 → HOT 자체 세로 스크롤 없음 → 바깥(.rsc-wrap)만 스크롤.
  hopt.renderAllRows = true;
  hopt.height = Math.max(160, 40 + (rows.length||1)*31);   // 0으로 접힘 방지용 초기 높이(아래에서 즉시 정확 높이로 교체 — 중간 페인트 없음)
  try{ _rscHot=new Handsontable(host,hopt);
    try{ var _core=host.querySelector('.ht_master .htCore')||host.querySelector('.htCore'); if(_core){ var _fh=_core.offsetHeight+2; if(_fh>60&&Math.abs(_fh-hopt.height)>2){ hopt.height=_fh; _rscHot.updateSettings({height:_fh}); } } }catch(_e){}   // 같은 동기 프레임에서 정확 높이 확정 → 깜빡임/이중 스크롤 제거
    _rscRenderFoot(db,cols);
    host.oncontextmenu=function(e){ try{ var td=e.target&&e.target.closest&&e.target.closest('td'); if(!td)return; var co=null; try{co=_rscHot.getCoords(td);}catch(_){} if(!co||co.row==null||co.row<0)return; e.preventDefault(); e.stopPropagation(); _rscCellMenu(e,co.row); return false; }catch(_){} };   // 셀 우클릭 → 커스텀 메뉴
    if(!host._rscSelBound){ host._rscSelBound=true;
      host.addEventListener('mousedown',function(e){ if(e.target&&e.target.classList&&e.target.classList.contains('rsc-rowchk')) e.stopPropagation(); },true);
      host.addEventListener('change',function(e){ var t=e.target; if(t&&t.classList&&t.classList.contains('rsc-rowchk')){ var r=parseInt(t.getAttribute('data-r'),10); var obj=(window._rscPageRows||[])[r]; if(!obj)return; if(t.checked)_rscSelSet.add(obj); else _rscSelSet.delete(obj); _rscSelBar(); } });
      host.addEventListener('click',function(e){ var hb=e.target&&e.target.closest&&e.target.closest('[data-grphide]'); if(hb){ e.stopPropagation(); var gh=hb.getAttribute('data-grphide'); if(gh!=null)_rscGrpHide(gh); return; } var g=e.target&&e.target.closest&&e.target.closest('.rsc-grp'); if(g){ var gv=g.getAttribute('data-grp'); if(gv!=null)_rscGrpToggle(gv); } });   // 눈 아이콘=그룹 숨기기 / 헤더=접기·펼치기
    }
    _rscSelBar(); _rscPageBar(grpCol?((window._rscDataRows||[]).length):total,ps,_rscPage,pages,start);   // 그룹 시 '총 N행'은 데이터 행 기준(헤더·소계행 제외)
  }
  catch(e){ host.innerHTML='<div class="rsc-empty">표 렌더링 오류: '+_rscEsc((e&&e.message)||e)+'</div>'; if(typeof console!=='undefined')console.error('Handsontable init 실패',e); }
}
// ── 합계(footer) 행 — 노션식 열별 계산(개수/합계/평균/최소/최대/고유값) ──
var _RSC_CALC=[['none','없음'],['count','개수'],['filled','비어있지 않음'],['empty','비어있음'],['unique','고유값'],['sum','합계'],['avg','평균'],['min','최소'],['max','최대']];
function _rscCalcLabel(k){ for(var i=0;i<_RSC_CALC.length;i++)if(_RSC_CALC[i][0]===k)return _RSC_CALC[i][1]; return '없음'; }
function _rscCalc(rows,c,calc){
  if(!calc||calc==='none')return '';
  var vals=(rows||[]).map(function(r){return r[c.id];});
  if(calc==='count')return String(vals.length);
  if(calc==='filled')return String(vals.filter(function(v){return v!=null&&String(v).trim()!=='';}).length);
  if(calc==='empty')return String(vals.filter(function(v){return v==null||String(v).trim()==='';}).length);
  if(calc==='unique'){ var s={}; vals.forEach(function(v){ if(v!=null&&String(v).trim()!=='')s[v]=1; }); return String(Object.keys(s).length); }
  var nums=vals.map(function(v){return parseFloat(v);}).filter(function(n){return !isNaN(n);});
  if(!nums.length)return '';
  if(calc==='sum')return _rscNumFmt(nums.reduce(function(a,b){return a+b;},0));
  if(calc==='avg')return _rscNumFmt(nums.reduce(function(a,b){return a+b;},0)/nums.length);
  if(calc==='min')return _rscNumFmt(Math.min.apply(null,nums));
  if(calc==='max')return _rscNumFmt(Math.max.apply(null,nums));
  return '';
}
function _rscRenderFoot(db,cols){
  var foot=document.getElementById('rsc-foot'); if(!foot||!_rscHot)return;
  var rws=(window._rscDataRows||db.rows||[]).filter(function(r){return r && r.__grp===undefined;});   // 필터·검색 적용된 데이터 행 기준(페이지·그룹헤더 제외)
  var html='<div class="rsc-foot-rh"></div>';
  cols.forEach(function(c,i){
    var w=0; try{ w=_rscHot.getColWidth(i); }catch(e){} if(!w)w=c.width||120;
    var calc=c.calc||(c.type==='number'?'sum':'none');
    var val=_rscCalc(rws,c,calc);
    html+='<div class="rsc-foot-cell" style="width:'+w+'px;" onclick="_rscCalcMenu('+i+',this)" title="계산 방식 선택">'
      +(val!==''?'<span class="rsc-foot-lbl">'+_rscEsc(_rscCalcLabel(calc))+'</span><b>'+_rscEsc(val)+'</b>':'<span class="rsc-foot-calc">계산 ▾</span>')+'</div>';
  });
  foot.innerHTML=html;
}
function _rscCalcMenu(ci,el){
  _rscCalcMenuClose(); var db=_rscCur(); var c=(db.columns||[])[ci]; if(!c)return;
  var cur=c.calc||(c.type==='number'?'sum':'none');
  var m=document.createElement('div'); m.id='rsc-calcmenu'; m.className='rsc-colmenu'; m.style.width='160px';
  m.innerHTML='<div class="rsc-cm-lbl">계산</div>'+_RSC_CALC.map(function(t){ return '<button class="rsc-cm-typerow'+(cur===t[0]?' on':'')+'" onclick="_rscCalcPick('+ci+',\''+t[0]+'\')"><span>'+t[1]+'</span>'+(cur===t[0]?'<i class="ti ti-check rsc-cm-chk"></i>':'')+'</button>'; }).join('');
  document.body.appendChild(m);
  var r=el.getBoundingClientRect(); m.style.left=Math.max(8,Math.min(r.left,window.innerWidth-m.offsetWidth-10))+'px'; m.style.top=Math.max(8,r.top-m.offsetHeight-4)+'px';
  setTimeout(function(){ document.addEventListener('mousedown',_rscCalcMenuOut,true); },0);
}
function _rscCalcMenuClose(){ var m=document.getElementById('rsc-calcmenu'); if(m)m.remove(); try{document.removeEventListener('mousedown',_rscCalcMenuOut,true);}catch(e){} }
function _rscCalcMenuOut(e){ var m=document.getElementById('rsc-calcmenu'); if(m&&!m.contains(e.target))_rscCalcMenuClose(); }
function _rscCalcPick(ci,k){ var db=_rscCur(); var c=db.columns[ci]; if(!c)return; c.calc=k; _rscSave(); _rscCalcMenuClose(); _rscRenderFoot(db,db.columns); }
// ── 커스텀 열 폭 드래그 (HOT 네이티브 미사용) ──
function _rscColResizeStart(col,ev){
  var db=_rscCur(); var c=(db.columns||[])[col]; if(!c||!_rscHot)return;
  var startX=ev.clientX; var startW=0; try{ startW=_rscHot.getColWidth(col); }catch(_){} if(!startW)startW=c.width||120;
  var raf=null;
  function allW(){ return (_rscCur().columns||[]).map(function(cc){return cc.width||120;}); }
  function mv(e){ var nw=Math.max(40,Math.round(startW+(e.clientX-startX))); c.width=nw; if(raf)return; raf=requestAnimationFrame(function(){ raf=null; try{ _rscHot.updateSettings({colWidths:allW()}); }catch(_){} }); }
  function up(){ document.removeEventListener('mousemove',mv,true); document.removeEventListener('mouseup',up,true); document.body.style.cursor=''; document.body.style.userSelect=''; try{ _rscHot.updateSettings({colWidths:allW()}); }catch(_){} _rscSave(); try{ _rscRenderFoot(_rscCur(),_rscCur().columns); }catch(_){} }
  document.addEventListener('mousemove',mv,true); document.addEventListener('mouseup',up,true); document.body.style.cursor='col-resize'; document.body.style.userSelect='none';
}
// ── 커스텀 열(필드) 드래그 이동 ──
function _rscColDragStart(col,ev){
  var db=_rscCur(); var cols=db.columns||[]; if(col<0||col>=cols.length)return;
  var host=document.getElementById('rsc-grid'); if(!host)return;
  var startX=ev.clientX, startY=ev.clientY; var moved=false; var targetCol=col, after=false;
  var ind=document.createElement('div'); ind.className='rsc-coldrop'; ind.style.left='-9999px'; ind.style.display='none'; document.body.appendChild(ind);
  var hb=host.getBoundingClientRect();
  function mm(e){
    if(!moved){ if(Math.abs(e.clientX-startX)<4)return; moved=true; document.body.style.cursor='grabbing'; document.body.style.userSelect='none'; }
    e.preventDefault();
    ind.style.display='none';   // 매 이동마다 기본 숨김 → 유효 헤더 위일 때만 표시(왼쪽 잔상 방지)
    var el=document.elementFromPoint(e.clientX,e.clientY); var th=el&&el.closest&&el.closest('th[data-rsccol]');
    if(!th)return; var tc=parseInt(th.getAttribute('data-rsccol'),10); if(isNaN(tc)||tc<0)return;
    var r=th.getBoundingClientRect(); after=(e.clientX>r.left+r.width/2); targetCol=tc;
    ind.style.display='block'; ind.style.left=((after?r.right:r.left)-1)+'px'; ind.style.top=hb.top+'px'; ind.style.height=Math.max(80,hb.height)+'px';
  }
  function mu(){ document.removeEventListener('mousemove',mm,true); document.removeEventListener('mouseup',mu,true); document.body.style.cursor=''; document.body.style.userSelect=''; try{ind.remove();}catch(_){}
    if(!moved)return;   // 그립을 잡았다 놓기만 함 → 아무것도 안 함(메뉴는 헤더 클릭 담당)
    var to=targetCol+(after?1:0); if(to===col||to===col+1)return;   // 제자리면 무시
    var arr=cols.slice(); var m=arr.splice(col,1)[0]; if(col<to)to--; if(to<0)to=0; if(to>arr.length)to=arr.length; arr.splice(to,0,m);
    db.columns=arr; _rscSave(); _rscRenderTable();
  }
  document.addEventListener('mousemove',mm,true); document.addEventListener('mouseup',mu,true);
}
// 행을 위/아래로 드래그해 순서 변경 (db.rows 재배열). 필터·정렬·페이징·그룹 중엔 비활성.
// 잡은 행을 반투명 고스트로 커서에 붙이고, 놓일 곳에 굵은 파란선 + 대상 행 하이라이트로 직관성 확보.
function _rscRowDragStart(row,ev){
  if(!window._rscRowMoveOK)return;
  var db=_rscCur(); var dbRows=(db.rows||[]);
  var viewRows=window._rscPageRows||dbRows;
  // 그룹헤더·소계행이면 드래그 무시
  var srcObj=viewRows[row]; if(!srcObj||srcObj.__grp!==undefined||srcObj.__grpfoot!==undefined)return;
  var host=document.getElementById('rsc-grid'); if(!host)return;
  var startY=ev.clientY; var moved=false; var targetRow=row, after=false;
  var ind=document.createElement('div'); ind.className='rsc-rowdrop'; ind.style.left='-9999px'; ind.style.display='none'; document.body.appendChild(ind);
  var ghost=null, gOffY=0;
  function _visTr(r){ try{ return host.querySelector('.ht_master .htCore tbody tr:nth-child('+(r+1)+')'); }catch(_){ return null; } }
  function _clearHi(){ try{ host.querySelectorAll('.rsc-rowtarget').forEach(function(x){x.classList.remove('rsc-rowtarget');}); }catch(_){} }
  function _mkGhost(){
    var tr=_visTr(row); if(!tr)return; var rc=tr.getBoundingClientRect();
    ghost=document.createElement('div'); ghost.className='rsc-rowghost';
    ghost.style.width=Math.min(rc.width,560)+'px'; ghost.style.height=rc.height+'px';
    var lbl=''; try{ var lc=(db.columns||[]).filter(function(c){return c.type==='text'||c.id==='name';})[0]||(db.columns||[])[0]; if(lc){ var v=srcObj[lc.id]; lbl=(v!=null&&String(v).trim())?String(v):('행 '+(row+1)); } }catch(_){}
    ghost.innerHTML='<i class="ti ti-arrows-move"></i> <b>'+_rscEsc(lbl||('행 '+(row+1)))+'</b> <span>이동 중…</span>';
    document.body.appendChild(ghost); gOffY=12;
  }
  function mm(e){
    if(!moved){ if(Math.abs(e.clientY-startY)<4)return; moved=true; document.body.style.cursor='grabbing'; document.body.style.userSelect='none';
      try{ var st=_visTr(row); if(st)st.classList.add('rsc-rowdragging'); }catch(_){} _mkGhost(); }
    e.preventDefault();
    if(ghost){ ghost.style.left=(e.clientX+14)+'px'; ghost.style.top=(e.clientY+gOffY)+'px'; }
    ind.style.display='none'; _clearHi();
    var el=document.elementFromPoint(e.clientX,e.clientY); if(!el||!el.closest)return;
    var td=el.closest('td'); var th=el.closest('th[data-rscrow]'); var tr=null, tc=-1;
    if(td){ try{ var co=_rscHot.getCoords(td); if(co&&co.row!=null&&co.row>=0)tc=co.row; }catch(_){} tr=td.getBoundingClientRect(); }
    else if(th){ tc=parseInt(th.getAttribute('data-rscrow'),10); tr=th.getBoundingClientRect(); }
    if(tc<0||isNaN(tc)||!tr)return;
    // 그룹헤더·소계행은 드롭 타깃 제외
    var tcObj=viewRows[tc]; if(tcObj&&(tcObj.__grp!==undefined||tcObj.__grpfoot!==undefined))return;
    after=(e.clientY>tr.top+tr.height/2); targetRow=tc;
    var hb=host.getBoundingClientRect();
    ind.style.display='block'; ind.style.top=((after?tr.bottom:tr.top)-1.5)+'px'; ind.style.left=hb.left+'px'; ind.style.width=Math.max(80,Math.min(hb.width,host.scrollWidth||hb.width))+'px';
    var htr=_visTr(tc); if(htr&&tc!==row)htr.classList.add('rsc-rowtarget');
  }
  function mu(){
    document.removeEventListener('mousemove',mm,true); document.removeEventListener('mouseup',mu,true);
    document.body.style.cursor=''; document.body.style.userSelect='';
    try{ind.remove();}catch(_){} try{ if(ghost)ghost.remove(); }catch(_){} _clearHi();
    try{ var sd=_visTr(row); if(sd)sd.classList.remove('rsc-rowdragging'); }catch(_){}
    if(!moved)return;
    // 뷰 인덱스 → db.rows 원본 인덱스로 변환
    var tgtObj=viewRows[targetRow]; if(!tgtObj||tgtObj.__grp!==undefined||tgtObj.__grpfoot!==undefined)return;
    var fromIdx=dbRows.indexOf(srcObj); var toIdx=dbRows.indexOf(tgtObj);
    if(fromIdx<0||toIdx<0||fromIdx===toIdx)return;
    if(after&&toIdx>=fromIdx) toIdx++;
    else if(!after&&toIdx<=fromIdx) toIdx--;
    var m=dbRows.splice(fromIdx,1)[0];
    var insertAt=dbRows.indexOf(tgtObj); if(insertAt<0)insertAt=after?dbRows.length:0; else if(after)insertAt++;
    dbRows.splice(insertAt,0,m);
    _rscSave(); _rscRenderTable();
  }
  document.addEventListener('mousemove',mm,true); document.addEventListener('mouseup',mu,true);
}
function rscDoSearch(q){ _rscSearchQ=String(q||'').toLowerCase().trim(); _rscSaveView(); _rscApplyFilter(); }// ── 멀티 필터 ──
var _RSC_FOPS=[['eq','같음'],['neq','다름'],['contains','포함'],['ncontains','미포함'],['gt','초과'],['lt','미만'],['gte','이상'],['lte','이하'],['empty','비어있음'],['notempty','안비어있음']];// 필터 값 입력칸: select/상태/멀티선택(또는 옵션 있는) 열이면 드롭다운으로 값 선택, 아니면 텍스트
function _rscFiltValCtl(i,f,c){
  var esc=_rscEsc;
  var isOpt = c && (c.type==='select'||c.type==='status'||c.type==='multiselect'||(c.options&&c.options.length));
  if(!isOpt) return '<input class="rsc-fl-val" value="'+esc(f.val||'')+'" placeholder="값" onchange="_rscFiltSet('+i+',\'val\',this.value)">';
  var db=_rscCur(); var vals=(c.options||[]).slice();
  (db.rows||[]).forEach(function(r){ var v=r[c.id]; if(v==null||v==='')return; if(Array.isArray(v)){ v.forEach(function(x){ x=String(x); if(x&&vals.indexOf(x)<0)vals.push(x); }); } else { var s=String(v); if(vals.indexOf(s)<0)vals.push(s); } });
  var opts='<option value="">(값 선택)</option>'+vals.map(function(v){ return '<option value="'+esc(v)+'"'+(String(f.val||'')===String(v)?' selected':'')+'>'+esc(v)+'</option>'; }).join('');
  return '<select class="rsc-fl-val rsc-sel" onchange="_rscFiltSet('+i+',\'val\',this.value)">'+opts+'</select>';
}
function rscFilterMenu(e){ _rscPopClose(); var db=_rscCur(); var cols=db.columns||[];
  var rows=_rscFilters.map(function(f,i){ var colOpts=cols.map(function(c){return '<option value="'+c.id+'"'+(f.col===c.id?' selected':'')+'>'+_rscEsc(c.title)+'</option>';}).join('');
    var opOpts=_RSC_FOPS.map(function(o){return '<option value="'+o[0]+'"'+(f.op===o[0]?' selected':'')+'>'+o[1]+'</option>';}).join('');
    var needVal=(f.op!=='empty'&&f.op!=='notempty'); var fc=cols.filter(function(c){return c.id===f.col;})[0];
    return '<div class="rsc-fl-row"><select class="rsc-sel" onchange="_rscFiltSet('+i+',\'col\',this.value)">'+colOpts+'</select><select class="rsc-sel" onchange="_rscFiltSet('+i+',\'op\',this.value)">'+opOpts+'</select>'+(needVal?_rscFiltValCtl(i,f,fc):'<span style="flex:1;"></span>')+'<button class="rsc-cmdel" onclick="_rscFiltDel('+i+')">✕</button></div>'; }).join('');
  if(!_rscFilters.length) rows='<div style="font-size:11.5px;color:var(--text3);padding:4px 2px;">조건이 없습니다.</div>';
  var m=_rscPop('rsc-pop', e, 420);
  m.innerHTML='<div class="rsc-cm-lbl">필터 (모든 조건 만족)</div><div class="rsc-fl-list">'+rows+'</div><button class="rsc-btn gh" style="margin-top:7px;width:100%;" onclick="_rscFiltAdd()"><i class="ti ti-plus"></i> 조건 추가</button>'+(_rscFilters.length?'<button class="rsc-btn gh" style="margin-top:5px;width:100%;color:#e53e5a;" onclick="_rscFiltClear()">모든 필터 지우기</button>':'');
}
function _rscFiltAdd(){ var db=_rscCur(); var c=(db.columns||[])[0]; _rscFilters.push({col:c?c.id:'',op:'contains',val:''}); _rscSaveView(); rscFilterMenu(window._rscPopEv); _rscApplyFilter(); }
function _rscFiltSet(i,k,v){ if(!_rscFilters[i])return; _rscFilters[i][k]=v; if(k==='col')_rscFilters[i].val=''; _rscSaveView(); rscFilterMenu(window._rscPopEv); _rscApplyFilter(); }
function _rscFiltDel(i){ _rscFilters.splice(i,1); _rscSaveView(); rscFilterMenu(window._rscPopEv); _rscApplyFilter(); }
function _rscFiltClear(){ _rscFilters=[]; _rscSaveView(); _rscPopClose(); renderResourcePage(); }
// ── 멀티 정렬 ──
function rscSortMenu(e){ _rscPopClose(); var db=_rscCur(); var cols=db.columns||[];
  var rows=_rscSorts.map(function(s,i){ var colOpts=cols.map(function(c){return '<option value="'+c.id+'"'+(s.col===c.id?' selected':'')+'>'+_rscEsc(c.title)+'</option>';}).join('');
    return '<div class="rsc-fl-row"><span class="rsc-sort-n">'+(i+1)+'</span><select class="rsc-sel" style="flex:1;" onchange="_rscSortSet('+i+',\'col\',this.value)">'+colOpts+'</select><button class="rsc-btn gh" onclick="_rscSortSet('+i+',\'dir\','+(s.dir<0?1:-1)+')"><i class="ti '+(s.dir<0?'ti-sort-descending':'ti-sort-ascending')+'"></i> '+(s.dir<0?'내림':'오름')+'</button><button class="rsc-cmdel" onclick="_rscSortDel('+i+')">✕</button></div>'; }).join('');
  if(!_rscSorts.length) rows='<div style="font-size:11.5px;color:var(--text3);padding:4px 2px;">정렬이 없습니다.</div>';
  var m=_rscPop('rsc-pop', e, 380);
  m.innerHTML='<div class="rsc-cm-lbl">정렬 (위가 1순위)</div><div class="rsc-fl-list">'+rows+'</div><button class="rsc-btn gh" style="margin-top:7px;width:100%;" onclick="_rscSortAdd()"><i class="ti ti-plus"></i> 정렬 추가</button>'+(_rscSorts.length?'<button class="rsc-btn gh" style="margin-top:5px;width:100%;color:#e53e5a;" onclick="_rscSortClear()">정렬 지우기</button>':'');
}
function _rscSortAdd(){ var db=_rscCur(); var c=(db.columns||[])[0]; _rscSorts.push({col:c?c.id:'',dir:1}); _rscSaveView(); rscSortMenu(window._rscPopEv); renderResourcePage(); }
function _rscSortSet(i,k,v){ if(!_rscSorts[i])return; _rscSorts[i][k]=(k==='dir'?parseInt(v,10):v); _rscSaveView(); rscSortMenu(window._rscPopEv); renderResourcePage(); }
function _rscSortDel(i){ _rscSorts.splice(i,1); _rscSaveView(); rscSortMenu(window._rscPopEv); renderResourcePage(); }
function _rscSortClear(){ _rscSorts=[]; _rscSaveView(); _rscPopClose(); renderResourcePage(); }
// 공통 팝업
function _rscPop(id,e,w){ _rscPopClose(); window._rscPopEv=e?{clientX:e.clientX,clientY:e.clientY}:window._rscPopEv; var m=document.createElement('div'); m.id=id; m.className='rsc-colmenu'; m.style.width=(w||320)+'px'; document.body.appendChild(m); var ev=window._rscPopEv||{clientX:200,clientY:140}; m.style.left=Math.max(8,Math.min(ev.clientX,window.innerWidth-(w||320)-12))+'px'; m.style.top=Math.min(ev.clientY,window.innerHeight-260)+'px'; setTimeout(function(){ document.addEventListener('mousedown',_rscPopOut,true); },0); return m; }
function _rscPopClose(){ var m=document.getElementById('rsc-pop'); if(m)m.remove(); try{document.removeEventListener('mousedown',_rscPopOut,true);}catch(e){} }
function _rscPopOut(e){ var m=document.getElementById('rsc-pop'); if(m&&!m.contains(e.target))_rscPopClose(); }
function _rscApplyFilter(){ if(_rscTab==='table') _rscRenderTable(); }   // Handsontable: 필터 변경 시 뷰 행만 다시 그림(편집은 원본 참조라 그대로 반영)
function rscSetGroup(id){ var db=_rscCur(); db.groupBy=id||''; _rscGrpOpen={}; _rscGrpHidden={}; _rscPage=1; _rscSaveView(); renderResourcePage(); }   // 그룹 바꾸면 숨김/접힘 초기화 + 툴바(숨긴그룹 버튼) 갱신 위해 전체 렌더
function rscAddRow(){ var db=_rscCur(); db.rows.push({}); _rscSave(); if(_rscTab==='table')_rscRenderTable(); else if(_rscTab==='board')_rscRenderBoard(); }
function rscAddCol(){ var db=_rscCur(); db.columns=db.columns||[]; db.columns.push({id:_rscNewId(),title:'새 속성',type:'text',width:130}); _rscSave(); _rscRenderTable(); if(typeof showToast==='function')showToast('열 추가됨 — 헤더 우클릭으로 이름·유형 변경'); }
function rscExport(){ try{ if(_rscHot){ _rscHot.getPlugin('exportFile').downloadFile('csv',{filename:(_rscView==='manpower'?('인원투입_'+_rscMP().curPage):'프로젝트'),columnHeaders:true,bom:true}); } }catch(e){ if(typeof showToast==='function')showToast('CSV 내보내기 실패'); } }
function rscSetChartCol(id){ _rscChartCol=id; _rscSaveView(); _rscRenderChart(); }
function rscSetBoardBy(id){ var db=_rscCur(); db.boardBy=id; _rscSaveView(); _rscRenderBoard(); }

// ── 보드(칸반, 제네릭: boardBy 컬럼 값별) ──
function _rscRenderBoard(){
  var db=_rscCur(); var host=document.getElementById('rsc-kanban'); if(!host) return;
  var bc=_rscCol(db,db.boardBy)||(db.columns||[]).filter(function(c){return c.type==='select'||c.type==='status';})[0]; if(!bc){ host.innerHTML='<div class="rsc-empty">선택/상태 타입 열이 있어야 보드를 만들 수 있습니다 — [열 설정]에서 추가하세요</div>'; return; }
  var groups=(bc.options||[]).slice(); (db.rows||[]).forEach(function(r){ var v=r[bc.id]||''; if(v&&groups.indexOf(v)<0)groups.push(v); }); if(!groups.length)groups=['(미지정)'];
  var titleCol=(db.columns||[]).filter(function(c){return c.type==='text';})[0];
  host.innerHTML=groups.map(function(g){ var col=_rscColor(g); var items=(db.rows||[]).map(function(r,i){return {r:r,i:i};}).filter(function(x){return (x.r[bc.id]||'(미지정)')===g || ((x.r[bc.id]||'')===''&&g==='(미지정)');});
    return '<div class="rsc-kcol"><div class="rsc-kcol-h"><span class="rsc-kdot" style="background:'+col+'"></span>'+_rscEsc(g)+'<span class="rsc-cnt">'+items.length+'</span></div>'
      +'<div class="rsc-klist" data-g="'+_rscEsc(g)+'">'+items.map(function(x){ var meta=(db.columns||[]).filter(function(c){return c.id!==bc.id&&c.id!==(titleCol&&titleCol.id)&&x.r[c.id];}).slice(0,3).map(function(c){return _rscEsc(c.title)+': '+_rscEsc(x.r[c.id]);}).join(' · ');
        return '<div class="rsc-kcard" data-idx="'+x.i+'" oncontextmenu="return _rscCardMenu(event,'+x.i+')"><div class="rsc-kname">'+_rscEsc((titleCol&&x.r[titleCol.id])||'(제목)')+'</div>'+(meta?'<div class="rsc-kmeta">'+meta+'</div>':'')+'</div>'; }).join('')+'</div></div>'; }).join('');
  if(typeof Sortable!=='undefined'){ host.querySelectorAll('.rsc-klist').forEach(function(lst){ new Sortable(lst,{group:'rscb',animation:150,ghostClass:'rsc-kghost',onEnd:function(ev){ var idx=parseInt(ev.item.getAttribute('data-idx'),10); var ng=ev.to.getAttribute('data-g'); if(!isNaN(idx)&&db.rows[idx]){ db.rows[idx][bc.id]=(ng==='(미지정)'?'':ng); _rscSave(); _rscRenderBoard(); } } }); }); }
}

// ── 타임라인(Frappe Gantt, 제네릭: 날짜 열 2개) ──
function _rscRenderGantt(){
  var db=_rscCur(); var wrap=document.getElementById('rsc-gantt-wrap'); if(!wrap) return;
  if(typeof Gantt==='undefined'){ wrap.innerHTML='<div class="rsc-empty">타임라인 라이브러리 로딩 실패 — 새로고침</div>'; return; }
  var titleCol=(db.columns||[]).filter(function(c){return c.type==='text';})[0];
  var drCol=(db.columns||[]).filter(function(c){return c.type==='daterange';})[0];   // 기간 열 우선
  var tasks;
  if(drCol){   // 기간(daterange) 열 하나로 시작~종료 파싱
    tasks=(db.rows||[]).map(function(r,i){ var rr=_rscDateRangeParse(r[drCol.id]); if(!rr.s||!rr.e)return null; return {id:'t'+i,name:_rscEsc((titleCol&&r[titleCol.id])||('항목'+(i+1))),start:rr.s,end:rr.e,progress:0}; }).filter(Boolean);
  } else {   // 폴백: date 열 2개(시작·완료)
    var dts=(db.columns||[]).filter(function(c){return c.type==='date';}); if(dts.length<2){ wrap.innerHTML='<div class="rsc-empty">기간 열 1개 또는 날짜 열 2개(시작·완료)가 필요합니다</div>'; return; }
    var sCol=dts[0].id, eCol=dts[1].id;
    tasks=(db.rows||[]).filter(function(r){return r[sCol]&&r[eCol];}).map(function(r,i){ return {id:'t'+i,name:_rscEsc((titleCol&&r[titleCol.id])||('항목'+(i+1))),start:r[sCol],end:r[eCol],progress:0}; });
  }
  if(!tasks.length){ wrap.innerHTML='<div class="rsc-empty">시작·완료일이 입력된 행이 없습니다</div>'; return; }
  wrap.innerHTML='<svg id="rsc-gantt"></svg>';
  try{ new Gantt('#rsc-gantt',tasks,{view_mode:'Month',bar_height:22,padding:14}); }catch(e){ wrap.innerHTML='<div class="rsc-empty">타임라인 오류: '+_rscEsc((e&&e.message)||e)+'</div>'; }
}

// ── 차트(제네릭: 기준 열 개수분포 + 숫자 열 합계) ──
function _rscRenderChart(){
  var db=_rscCur(); if(typeof Chart==='undefined') return;
  var cc=_rscCol(db,_rscChartCol); var cnt={};
  if(cc){ (db.rows||[]).forEach(function(r){ var v=r[cc.id]||'(빈값)'; cnt[v]=(cnt[v]||0)+1; }); }
  var ck=Object.keys(cnt); var c1=document.getElementById('rsc-c-cnt');
  if(c1&&ck.length) _rscCharts.push(new Chart(c1,{type:'doughnut',data:{labels:ck,datasets:[{data:ck.map(function(k){return cnt[k];}),backgroundColor:ck.map(function(k){return _rscColor(k);}),borderWidth:2,borderColor:'#fff'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}}}}));
  var numCols=(db.columns||[]).filter(function(c){return c.type==='number';}); var sums=numCols.map(function(c){ var s=0; (db.rows||[]).forEach(function(r){s+=(parseFloat(r[c.id])||0);}); return Math.round(s*100)/100; });
  var c2=document.getElementById('rsc-c-sum');
  if(c2&&numCols.length) _rscCharts.push(new Chart(c2,{type:'bar',data:{labels:numCols.map(function(c){return c.title;}),datasets:[{label:'합계',data:sums,backgroundColor:'#2d6fd4',borderRadius:5}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false}},y:{beginAtZero:true}}}}));
}

// ── 열 설정 모달(컬럼 추가/이름/타입/선택옵션/삭제) ──
function rscColMgr(){
  var db=_rscCur(); _rscColMgrClose();
  var ov=document.createElement('div'); ov.id='rsc-colmgr'; ov.className='dsh-modal-ov'; ov.onclick=function(e){ if(e.target===ov)_rscColMgrClose(); };
  var types=[['text','📝 텍스트'],['number','🔢 숫자'],['select','🔽 선택'],['multiselect','🏷 다중 선택'],['status','◉ 상태'],['date','📅 날짜'],['daterange','🗓 기간'],['datediff','⏱ 기간 일수'],['person','👤 사람'],['checkbox','☑ 체크박스'],['url','🔗 URL'],['email','✉ 이메일'],['phone','📞 전화번호']];
  var hasOpt=function(t){ return t==='select'||t==='status'||t==='multiselect'; };
  var rows=(db.columns||[]).map(function(c,i){ return '<div class="rsc-cmrow">'
    +'<input value="'+_rscEsc(c.title)+'" onchange="_rscColEdit('+i+',\'title\',this.value)" style="flex:1.4;">'
    +'<select onchange="_rscColEdit('+i+',\'type\',this.value)" style="flex:1.1;">'+types.map(function(t){return '<option value="'+t[0]+'"'+(c.type===t[0]?' selected':'')+'>'+t[1]+'</option>';}).join('')+'</select>'
    +'<input value="'+_rscEsc((c.options||[]).join(', '))+'" placeholder="'+(hasOpt(c.type)?'옵션(쉼표)':'옵션 없음')+'" onchange="_rscColEdit('+i+',\'options\',this.value)" style="flex:1.6;'+(hasOpt(c.type)?'':'opacity:.35;')+'">'
    +'<button class="rsc-cmdel" onclick="_rscColDel('+i+')" title="삭제">✕</button></div>'; }).join('');
  ov.innerHTML='<div class="dsh-edit-box" style="width:560px;"><div class="dsh-edit-hd"><i class="ti ti-columns"></i> 열 설정'+(_rscView==='manpower'?' <small style="color:var(--text3);font-weight:600;">(전 월 공통)</small>':'')+'<i class="ti ti-x" onclick="_rscColMgrClose()" style="margin-left:auto;cursor:pointer;"></i></div>'
    +'<div class="dsh-edit-body"><div style="font-size:11px;color:var(--text3);margin-bottom:6px;">이름 · 타입 · 선택옵션(쉼표 구분) — 바꾸면 즉시 저장</div><div id="rsc-cmlist">'+rows+'</div>'
    +'<button class="rsc-btn gh" onclick="_rscColAdd()" style="margin-top:8px;"><i class="ti ti-plus"></i> 열 추가</button></div>'
    +'<div class="dsh-edit-ft"><button class="dsh-btn-s" onclick="_rscColMgrClose()">완료</button></div></div>';
  document.body.appendChild(ov);
}
function _rscColMgrClose(){ var m=document.getElementById('rsc-colmgr'); if(m)m.remove(); renderResourcePage(); }

// ── 열 헤더 우클릭 → 속성 메뉴(노션식: 이름·유형·옵션·삽입·복제·삭제) ──
var _RSC_TYPES=[{t:'text',ic:'ti-align-left',n:'텍스트'},{t:'number',ic:'ti-hash',n:'숫자'},{t:'select',ic:'ti-circle-chevron-down',n:'선택'},{t:'multiselect',ic:'ti-tags',n:'다중 선택'},{t:'status',ic:'ti-circle-dot',n:'상태'},{t:'date',ic:'ti-calendar',n:'날짜'},{t:'daterange',ic:'ti-calendar-week',n:'기간'},{t:'datediff',ic:'ti-clock-hour-4',n:'기간 일수'},{t:'person',ic:'ti-user',n:'사람'},{t:'checkbox',ic:'ti-checkbox',n:'체크박스'},{t:'url',ic:'ti-link',n:'URL'},{t:'email',ic:'ti-mail',n:'이메일'},{t:'phone',ic:'ti-phone',n:'전화번호'}];
function _rscTypeIcon(t){ for(var i=0;i<_RSC_TYPES.length;i++)if(_RSC_TYPES[i].t===t)return _RSC_TYPES[i].ic; return 'ti-align-left'; }var _RSC_OPTPAL=['#6b7280','#dc2626','#ea580c','#d97706','#16a34a','#0891b2','#2563eb','#7c3aed','#db2777','#e11d48','#0a9b5a','#475569'];
function _rscColMenu(e,ci){
  _rscColMenuClose(); var db=_rscCur(); var c=(db.columns||[])[ci]; if(!c) return;
  window._rscColMenuPos={x:(e&&e.clientX)||200, y:(e&&e.clientY)||120, ci:ci};
  _rscSetActiveCol(ci);
  var hasOpt=(c.type==='select'||c.type==='status'||c.type==='multiselect');
  // 유형: 세로 행 목록(아이콘+이름, 현재 유형 체크) — 노션식
  var typeHtml='<div class="rsc-cm-lbl">유형</div><div class="rsc-cm-types">'
    +_RSC_TYPES.map(function(t){return '<button class="rsc-cm-typerow'+(c.type===t.t?' on':'')+'" onclick="_rscColMenuType('+ci+',\''+t.t+'\')"><i class="ti '+t.ic+'"></i><span>'+t.n+'</span>'+(c.type===t.t?'<i class="ti ti-check rsc-cm-chk"></i>':'')+'</button>';}).join('')
    +'</div>';
  // 옵션: 칩(색+인라인 이름+삭제) 목록 + 추가 입력 — 노션식
  var optHtml='';
  if(hasOpt){
    optHtml='<div class="rsc-cm-lbl">옵션</div><div class="rsc-cm-opts">'
      +(c.options||[]).map(function(opt,oi){ var col=_rscOptColor(c,opt); return '<div class="rsc-cm-optrow">'
        +'<button class="rsc-cm-swatch" style="background:'+col+'" title="색상" onclick="_rscColOptPalette('+ci+','+oi+',this)"></button>'
        +'<input class="rsc-cm-optname" value="'+_rscEsc(opt)+'" onkeydown="if(event.key===\'Enter\'){this.blur();}" onchange="_rscColOptRename('+ci+','+oi+',this.value)">'
        +'<button class="rsc-cm-optdel" title="옵션 삭제" onclick="_rscColOptDel('+ci+','+oi+')"><i class="ti ti-x"></i></button>'
      +'</div>'; }).join('')
      +'</div>'
      +'<input class="rsc-cm-optadd" placeholder="＋ 옵션 추가 후 Enter" onkeydown="if(event.key===\'Enter\'){_rscColOptAdd('+ci+',this.value);}">';
  }
  var m=document.createElement('div'); m.id='rsc-colmenu'; m.className='rsc-colmenu';
  m.innerHTML='<div class="rsc-cm-sec"><input class="rsc-cm-name" value="'+_rscEsc(c.title)+'" placeholder="속성 이름" onkeydown="if(event.key===\'Enter\'){this.blur();}" onchange="_rscColMenuRename('+ci+',this.value)"></div>'
    +typeHtml + optHtml
    +'<div class="rsc-cm-lbl">수식</div><div class="rsc-cm-types"><button class="rsc-cm-typerow'+(c.autoSum?' on':'')+'" onclick="_rscColToggleAutoSum('+ci+')"><i class="ti ti-sum"></i><span>합계 자동계산 (숫자 열 합산)</span>'+(c.autoSum?'<i class="ti ti-check rsc-cm-chk"></i>':'')+'</button></div>'
    +'<div class="rsc-cm-div"></div>'
    +'<button class="rsc-cm-act" onclick="_rscColMove('+ci+',-1)"><i class="ti ti-arrow-left"></i> 왼쪽으로 이동</button>'
    +'<button class="rsc-cm-act" onclick="_rscColMove('+ci+',1)"><i class="ti ti-arrow-right"></i> 오른쪽으로 이동</button>'
    +'<button class="rsc-cm-act" onclick="_rscColIns('+ci+',0)"><i class="ti ti-arrow-bar-to-left"></i> 왼쪽에 속성 추가</button>'
    +'<button class="rsc-cm-act" onclick="_rscColIns('+ci+',1)"><i class="ti ti-arrow-bar-to-right"></i> 오른쪽에 속성 추가</button>'
    +'<button class="rsc-cm-act" onclick="_rscColDup('+ci+')"><i class="ti ti-copy"></i> 속성 복제</button>'
    +'<button class="rsc-cm-act del" onclick="_rscColDelMenu('+ci+')"><i class="ti ti-trash"></i> 속성 삭제</button>';
  document.body.appendChild(m);
  var x=Math.min(window._rscColMenuPos.x, window.innerWidth-m.offsetWidth-12); var y=Math.min(window._rscColMenuPos.y, window.innerHeight-m.offsetHeight-12);
  m.style.left=Math.max(8,x)+'px'; m.style.top=Math.max(8,y)+'px';
  setTimeout(function(){ document.addEventListener('mousedown',_rscColMenuOut,true); },0);
}
function _rscColMenuRefresh(){ var p=window._rscColMenuPos; if(p) _rscColMenu({clientX:p.x,clientY:p.y}, p.ci); }
function _rscSetActiveCol(ci){ window._rscColActive=ci; try{ if(_rscHot)_rscHot.render(); }catch(e){} }   // 헤더 활성 하이라이트 칠하기
function _rscClearActiveCol(){ window._rscColActive=null; try{ if(_rscHot)_rscHot.render(); }catch(e){} }
// 옵션 추가/이름변경/삭제 (노션식)
function _rscColOptAdd(ci,v){ var db=_rscCur(); var c=db.columns[ci]; if(!c)return; var nv=String(v||'').trim(); if(!nv)return; c.options=c.options||[]; if(c.options.indexOf(nv)<0)c.options.push(nv); _rscSave(); _rscRenderTable(); _rscColMenuRefresh(); setTimeout(function(){ var a=document.querySelector('#rsc-colmenu .rsc-cm-optadd'); if(a)a.focus(); },50); }
function _rscColOptRename(ci,oi,v){ var db=_rscCur(); var c=db.columns[ci]; if(!c)return; var old=(c.options||[])[oi]; var nv=String(v||'').trim(); if(!nv||nv===old)return; if(c.options.indexOf(nv)>=0){ if(typeof showToast==='function')showToast('이미 있는 옵션'); _rscColMenuRefresh(); return; } c.options[oi]=nv; if(c.optColors&&c.optColors[old]!=null){ c.optColors[nv]=c.optColors[old]; delete c.optColors[old]; } (db.rows||[]).forEach(function(r){ if(c.type==='multiselect'){ if(typeof r[c.id]==='string') r[c.id]=r[c.id].split(',').map(function(x){return x.trim()===old?nv:x.trim();}).filter(Boolean).join(', '); } else if(r[c.id]===old) r[c.id]=nv; }); _rscSave(); _rscRenderTable(); _rscColMenuRefresh(); }
function _rscColOptDel(ci,oi){ var db=_rscCur(); var c=db.columns[ci]; if(!c)return; var old=(c.options||[])[oi]; if(old==null)return; c.options.splice(oi,1); if(c.optColors)delete c.optColors[old]; _rscSave(); _rscRenderTable(); _rscColMenuRefresh(); }
// 옵션 색상 팔레트
function _rscColOptPalette(ci,oi,el){
  _rscPalClose(); var db=_rscCur(); var c=db.columns[ci]; if(!c)return; var opt=(c.options||[])[oi]; if(opt==null)return;
  var p=document.createElement('div'); p.id='rsc-pal'; p.className='rsc-pal';
  p.innerHTML=_RSC_OPTPAL.map(function(col){ return '<button class="rsc-pal-c" style="background:'+col+'" title="'+col+'" onclick="_rscColOptSetColor('+ci+','+oi+',\''+col+'\')"></button>'; }).join('')
    +'<button class="rsc-pal-c rsc-pal-auto" title="자동(기본)" onclick="_rscColOptSetColor('+ci+','+oi+',\'\')">↺</button>';
  document.body.appendChild(p);
  var r=el.getBoundingClientRect(); p.style.left=Math.max(8,Math.min(r.left,window.innerWidth-p.offsetWidth-10))+'px'; p.style.top=Math.min(r.bottom+5,window.innerHeight-p.offsetHeight-8)+'px';
  setTimeout(function(){ document.addEventListener('mousedown',_rscPalOut,true); },0);
}
function _rscPalClose(){ var p=document.getElementById('rsc-pal'); if(p)p.remove(); try{document.removeEventListener('mousedown',_rscPalOut,true);}catch(e){} }
function _rscPalOut(e){ var p=document.getElementById('rsc-pal'); if(p&&!p.contains(e.target))_rscPalClose(); }
function _rscColOptSetColor(ci,oi,color){ var db=_rscCur(); var c=db.columns[ci]; if(!c)return; var opt=(c.options||[])[oi]; if(opt==null)return; c.optColors=c.optColors||{}; if(color){ c.optColors[opt]=color; } else { delete c.optColors[opt]; } _rscSave(); _rscPalClose(); _rscRenderTable(); _rscColMenuRefresh(); }
function _rscColMenuClose(){ var m=document.getElementById('rsc-colmenu'); if(m)m.remove(); try{document.removeEventListener('mousedown',_rscColMenuOut,true);}catch(e){} }
function _rscColMenuOut(e){ var m=document.getElementById('rsc-colmenu'); var p=document.getElementById('rsc-pal'); if(m&&!m.contains(e.target)&&!(p&&p.contains(e.target))){ _rscColMenuClose(); _rscClearActiveCol(); } }
function _rscColMenuRename(ci,v){ var db=_rscCur(); var c=db.columns[ci]; if(!c)return; var nv=String(v||'').trim(); if(nv)c.title=nv; _rscSave(); _rscRenderTable(); }
// 선택/상태/다중선택 열로 바꿀 때, 데이터에 이미 있는 값들을 옵션으로 자동 추가
function _rscAutoOptions(db,c){ if(!c)return; var seen={}; (c.options||[]).forEach(function(o){seen[o]=1;}); var add=[]; (db.rows||[]).forEach(function(r){ var v=r[c.id]; if(v==null)return; var parts=(c.type==='multiselect')?String(v).split(',').map(function(x){return x.trim();}):[String(v).trim()]; parts.forEach(function(p){ if(p&&!seen[p]){seen[p]=1;add.push(p);} }); }); if(add.length){ c.options=(c.options||[]).concat(add); c.options.sort(function(a,b){return String(a).localeCompare(String(b),'ko',{numeric:true});}); } }   // 옵션 자연정렬(한글·숫자)
function _rscColToggleAutoSum(ci){ var db=_rscCur(); var c=db.columns[ci]; if(!c)return; c.autoSum=!c.autoSum; if(c.autoSum){ c.type='number'; } _rscRecalcAuto(db); _rscSave(); _rscRenderTable(); _rscColMenuRefresh(); }
function _rscColMove(ci,dir){ var db=_rscCur(); var cols=db.columns||[]; var j=ci+dir; if(j<0||j>=cols.length)return; var t=cols[ci]; cols[ci]=cols[j]; cols[j]=t; _rscSave(); _rscRenderTable(); _rscColMenuClose(); }   // 열 한 칸 좌/우 이동(확실한 방법)
function _rscColMenuType(ci,t){ var db=_rscCur(); var c=db.columns[ci]; if(!c)return; c.type=t; if(t==='select'||t==='status'||t==='multiselect'){ _rscAutoOptions(db,c); }   // 데이터 값 자동 옵션화
  if(t==='daterange' && (!c.width || c.width<160)) c.width=170;   // 기간 열은 시작~종료 표시 위해 넓게
  if(t!=='number')c.autoSum=false; _rscSave(); _rscRenderTable(); _rscColMenuRefresh(); }   // 유형 바꿔도 메뉴 유지 → 헤더 아이콘 즉시 반영
function _rscColIns(ci,after){ var db=_rscCur(); db.columns.splice(ci+(after?1:0),0,{id:_rscNewId(),title:'새 속성',type:'text',width:120}); _rscSave(); _rscColMenuClose(); _rscClearActiveCol(); _rscRenderTable(); }
function _rscColDup(ci){ var db=_rscCur(); var c=db.columns[ci]; if(!c)return; var nc=JSON.parse(JSON.stringify(c)); nc.id=_rscNewId(); nc.title=c.title+' 복사'; db.columns.splice(ci+1,0,nc); (db.rows||[]).forEach(function(r){ if(r[c.id]!=null)r[nc.id]=r[c.id]; }); _rscSave(); _rscColMenuClose(); _rscClearActiveCol(); _rscRenderTable(); }
function _rscColDelMenu(ci){ var db=_rscCur(); if(!db.columns[ci])return; if((db.columns||[]).length<=1){ if(typeof showToast==='function')showToast('마지막 열은 삭제할 수 없습니다'); return; } db.columns.splice(ci,1); _rscSave(); _rscColMenuClose(); _rscClearActiveCol(); _rscRenderTable(); }
function _rscColEdit(i,k,v){ var db=_rscCur(); var c=db.columns[i]; if(!c)return; if(k==='options'){ c.options=String(v||'').split(',').map(function(x){return x.trim();}).filter(Boolean); } else { c[k]=v; } if(k==='type'&&(v==='select'||v==='status'||v==='multiselect')){ _rscAutoOptions(db,c); }   // 데이터 값 자동 옵션화
  _rscSave(); if(k==='type'){ rscColMgr(); } }
function _rscColDel(i){ var db=_rscCur(); db.columns.splice(i,1); _rscSave(); rscColMgr(); }
function _rscColAdd(){ var db=_rscCur(); db.columns.push({id:_rscNewId(),title:'새 열',type:'text',width:120}); _rscSave(); rscColMgr(); }

// ── 우클릭 복사/삭제 (표·보드 공통, 전체 필드 복사 — 업무분류 등 그대로) ──
function rscCopyRow(idx){ var db=_rscCur(); var r=db.rows[idx]; if(!r)return; db.rows.splice(idx+1,0,JSON.parse(JSON.stringify(r))); _rscSave(); if(_rscTab==='board')_rscRenderBoard(); else _rscRenderTable(); if(typeof showToast==='function')showToast('📋 복사됨 (전체 내용 복제)'); }
function rscDelRow(idx){ var db=_rscCur(); if(db.rows[idx]){ db.rows.splice(idx,1); _rscSave(); if(_rscTab==='board')_rscRenderBoard(); else _rscRenderTable(); } }
function _rscMenuClose(){ var m=document.getElementById('rsc-cmenu'); if(m)m.remove(); try{document.removeEventListener('mousedown',_rscMenuOut,true);}catch(e){} }
function _rscMenuOut(e){ var m=document.getElementById('rsc-cmenu'); if(m&&!m.contains(e.target))_rscMenuClose(); }
function _rscCardMenu(e,idx){ try{e.preventDefault();}catch(_){} _rscMenuClose(); var m=document.createElement('div'); m.id='rsc-cmenu'; m.className='dsh-wmenu'; m.style.cssText='position:fixed;z-index:11000;width:160px;'; m.innerHTML='<button onclick="rscCopyRow('+idx+');_rscMenuClose()"><i class="ti ti-copy"></i> 복사하기</button><button onclick="rscAddRow();_rscMenuClose()"><i class="ti ti-plus"></i> 항목 추가</button><button class="del" onclick="rscDelRow('+idx+');_rscMenuClose()"><i class="ti ti-trash"></i> 삭제</button>'; document.body.appendChild(m); m.style.left=Math.min(e.clientX,window.innerWidth-170)+'px'; m.style.top=Math.min(e.clientY,window.innerHeight-110)+'px'; setTimeout(function(){ document.addEventListener('mousedown',_rscMenuOut,true); },0); return false; }
