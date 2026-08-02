function switchDash(name){
  ['prod','meter','tc'].forEach(t=>{
    const el=document.getElementById('dash-'+t);
    if(el){el.style.display='none';}
    const tab=document.getElementById('dtab-'+t);
    if(tab){tab.style.background='';tab.style.color='var(--text2)';}
  });
  const sel=document.getElementById('dash-'+name);
  if(sel){
    sel.style.display='flex';
    sel.style.flexDirection='column';
    sel.style.gap='8px';
  }
  const activeTab=document.getElementById('dtab-'+name);
  if(activeTab){activeTab.style.background='var(--bg3)';activeTab.style.color='var(--blue)';}
  if(name==='meter') renderMeterDash();
  if(name==='prod' && typeof renderDashboard==='function') renderDashboard();
}

// ── 대시보드 렌더링 (헬스 허브: 장비 + 계측기) ──
function _hubIsMeter(d){ const g=(d.group||'').toUpperCase(), m=(d.model||'').toUpperCase(); return g==='계측기'||g==='METER'||g==='INSTRUMENT'||m.includes('IXIA')||m.includes('SPIRENT')||m.includes('N2X')||m.includes('STC'); }
function _hubEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _hubCC(list){ return list.filter(d=>d.status==='connected').length; }

function _hubUp(d){ return d.status==='connected'||d.status==='연결됨'; }
function _hubDown(d){ return d.status==='disconnected'||d.status==='미연결'; }
function _dshClass(d){   // 장비 분류: role 우선(L2/L3/OLT), 없으면 model 폴백
  const r=String(d.role||'');
  if(r.indexOf('L3')>=0) return 'L3';
  if(r.indexOf('L2')>=0) return 'L2';
  if(r==='OLT') return 'OLT';
  const m=(d.model||'').toUpperCase();
  if(/OLT/.test(m)) return 'OLT';
  if(m.indexOf('E8')===0||m.indexOf('E7')===0) return 'L3';
  return 'L2';
}
function _dshIsMeter(d){ return !!(d && (d.role==='계측기' || String(d.protocol||'').toLowerCase()==='tcl')) || _hubIsMeter(d||{}); }
function _dshCtx(){
  // 실제 등록 장비(device-catalog = deviceList) 기준 — 상단 배지와 동일 소스. 없으면 구 devices 폴백.
  let src=[];
  if(typeof deviceList!=='undefined' && Array.isArray(deviceList) && deviceList.length) src=deviceList;
  else if(typeof devices!=='undefined' && Array.isArray(devices)) src=devices;
  if(!src.length && typeof loadDeviceData==='function' && !window._dshDevLoading){ window._dshDevLoading=true; loadDeviceData().then(function(){ window._dshDevLoading=false; try{ renderDashboard(); }catch(e){} }).catch(function(){ window._dshDevLoading=false; }); }
  const net=[], meters=[];
  src.forEach(d=>{ (_dshIsMeter(d)?meters:net).push(d); });
  const tot=net.length, nUp=net.filter(_hubUp).length, nDown=net.filter(_hubDown).length, nUnk=tot-nUp-nDown;
  let nL2=0,nL3=0,nOlt=0; net.forEach(d=>{ const c=_dshClass(d); if(c==='L3')nL3++; else if(c==='OLT')nOlt++; else nL2++; });
  return {tot:tot,nUp:nUp,nDown:nDown,nUnk:nUnk,nL2:nL2,nL3:nL3,nOlt:nOlt,meters:meters,net:net,
    donutSegs:[{label:'운용 중',value:nUp,color:'#00a872'},{label:'미연결',value:nDown,color:'#e53e5a'},{label:'미확인',value:nUnk,color:'#c4c9d4'}],
    catRows:[{label:'L2 스위치',value:nL2,color:'#2d6fd4'},{label:'L3 스위치',value:nL3,color:'#8b5cf6'},{label:'OLT',value:nOlt,color:'#00a872'}]};
}
function renderDashboard(){
  const setHTML=(id,h)=>{ const e=document.getElementById(id); if(e) e.innerHTML=h; };
  try{
    try{_dshEnsureData();}catch(e){}
    const ctx=_dshCtx();
    const view=_dshCurView();
    setHTML('dsh-head', _dshRoleHead(view));
    let html;
    if(view==='exec') html=_dshExecView(ctx);
    else if(view==='lead') html=_dshLeadView(ctx);
    else if(view==='eng') html=_dshEngView(ctx);
    else if(view==='widget'){ html=_dshWidgetGrid(ctx, !!window._dshEdit); try{_dshSetupRefresh();}catch(e){} }
    else html=_dshUnifiedView(ctx);
    setHTML('dsh-grid', html);
    _dshAnimate();
    // 진행 중 Cycle 서버 상태 조회 (새로고침·페이지 재진입 시 복원)
    try{ if(typeof _dshCycleRunningFetch==='function') _dshCycleRunningFetch(); }catch(_e){}
  }catch(err){
    // 렌더 실패 시 빈 화면 대신 원인 표시(디버깅 + 앱 생존)
    console.error('[renderDashboard] 렌더 실패:', err);
    setHTML('dsh-grid', '<div style="padding:40px;text-align:center;color:#e53e5a;font-size:13px;line-height:1.7;">'
      +'<i class="ti ti-alert-triangle" style="font-size:28px;display:block;margin-bottom:10px;"></i>'
      +'대시보드 렌더 중 오류가 발생했습니다.<br><span style="color:#8a92a6;font-size:12px;font-family:ui-monospace,monospace;">'
      +String((err&&err.message)||err).replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</span></div>');
  }
}
// ── 역할 전환 ──
function _dshDefView(){ return 'unified'; }   // 기본 = 좌(장비/계측기)·우(시험) 통합 2열
function _dshCurView(){ if(!window._dshView) window._dshView=_dshDefView(); return window._dshView; }
function dshSetView(v){ window._dshView=v; renderDashboard(); }
function _dshEnsureData(){
  if(window._dshDataLoading) return;
  var noTc=(typeof tcList==='undefined'||!tcList||!tcList.length);
  var noReq=(typeof reqList==='undefined'||!reqList||!reqList.length);
  var noCyc=(typeof cycleList==='undefined'||!cycleList||!cycleList.length);
  if(!noTc&&!noReq&&!noCyc){
    // meta 는 있지만 items 상세가 아직 없으면 최근 몇 개 cycle 만 상세 로드 (1회만)
    if(!window._dshCycleFullDone && typeof loadCycleFull==='function' && Array.isArray(cycleList) && cycleList.length){
      window._dshCycleFullDone=true;   // 1회만 실행
      var _pending=cycleList.slice().sort(function(a,b){ return String(b.updated_at||b.created_at||'').localeCompare(String(a.updated_at||a.created_at||'')); }).slice(0,10);
      var _fullPs=_pending.filter(function(cy){return cy && !cy._full;}).map(function(cy){ return loadCycleFull(cy.id).catch(function(){}); });
      if(_fullPs.length){
        Promise.all(_fullPs).then(function(){ try{renderDashboard();}catch(e){} });
      }
    }
    return;
  }
  var ps=[];
  if(noReq&&typeof loadREQData==='function') ps.push(Promise.resolve(loadREQData()).catch(function(){}));
  if(noTc&&typeof loadTCData==='function') ps.push(Promise.resolve(loadTCData()).catch(function(){}));
  if(noCyc&&typeof loadCycleData==='function') ps.push(Promise.resolve(loadCycleData()).catch(function(){}));
  if(!ps.length) return;
  window._dshDataLoading=true;
  Promise.all(ps).then(function(){ window._dshDataLoading=false; try{renderDashboard();}catch(e){} }).catch(function(){ window._dshDataLoading=false; });
}
function _dshRoleHead(view){
  const t=new Date(), hh=('0'+t.getHours()).slice(-2), mm=('0'+t.getMinutes()).slice(-2);
  const ed=!!window._dshEdit;
  const views=[['unified','통합'],['exec','임원'],['lead','팀장'],['eng','담당'],['widget','위젯']];
  const sw=views.map(function(v){ return '<button class="rdsh-vbtn'+(view===v[0]?' on':'')+'" onclick="dshSetView(\''+v[0]+'\')">'+v[1]+'</button>'; }).join('');
  let tools='';
  if(view==='widget'){ tools='<div class="dsh-tools">'
    +'<button class="dsh-tbtn add" onclick="dshAddWidget()"><i class="ti ti-plus"></i> 위젯 추가</button>'
    +'<button class="dsh-tbtn" onclick="dshResetLayout()"><i class="ti ti-refresh"></i> 기본값</button></div>'; }
  return '<div class="dsh-title"><i class="ti ti-layout-dashboard"></i> UTOP 대시보드 <span class="dsh-time">'+hh+':'+mm+' 기준</span></div>'
    +'<div class="rdsh-switch">'+sw+'</div>'+tools;
}
// ── 위젯 그리드(기존 유지) ──
function _dshWidgetGrid(ctx, ed){
  let grid=''; const lay=_dshGetLayout();
  lay.forEach(function(w,i){
    const dd=_DSH_DATA[w.data]||_DSH_DATA.status;
    let ch=w.chart; if(!_DSH_CHART[ch]||_DSH_CHART[ch].kinds.indexOf(dd.kind)<0) ch=_dshDefChart(dd.kind);
    var payload=dd.g(ctx);
    if(payload&&payload.cats&&w.sort&&w.sort!=='none') payload.cats=_dshSortCats(payload.cats,w.sort,w.sortDir||'desc');
    const body=w.min?'<div class="dsh-w-mini">최소화됨 — ⋯ 메뉴에서 펼치기</div>':(_DSH_CHART[ch]||_DSH_CHART.kpi).r(payload);
    const wd=Math.max(1,Math.min(4,w.w||2));
    grid+='<div class="dsh-w jira" draggable="true" ondragstart="dshWDrag(event,'+i+')" ondragover="event.preventDefault()" ondrop="dshWDrop(event,'+i+')" style="grid-column:span '+wd+';--wc:'+(w.color||'#2d6fd4')+';">'
      +'<div class="dsh-w-bar"><i class="ti ti-grip-vertical dsh-w-mv" title="드래그하여 이동"></i><span class="dsh-w-ttl">'+_hubEsc(w.title||dd.t)+'</span>'
      +'<span class="dsh-w-acts">'
      +'<button class="dsh-wb" title="확대" onclick="dshWExpand('+i+')"><i class="ti ti-arrows-maximize"></i></button>'
      +'<button class="dsh-wb" title="설정" onclick="event.stopPropagation();dshWMenu('+i+',this)"><i class="ti ti-dots-vertical"></i></button>'
      +'</span></div><div class="dsh-w-body">'+body+'</div></div>';
  });
  if(!lay.length) grid='<div class="dsh-empty" style="grid-column:1/-1;"><i class="ti ti-layout-dashboard"></i>위젯이 없습니다 — "위젯 추가"로 구성하세요</div>';
  return grid;
}
function _dshSortCats(cats,sort,dir){ var c=cats.slice(), d=(dir==='asc')?1:-1; if(sort==='name')c.sort(function(a,b){return String(a.label).localeCompare(String(b.label))*d;}); else if(sort==='value')c.sort(function(a,b){return ((a.value||0)-(b.value||0))*d;}); return c; }
function _dshCloseMenu(){ var m=document.getElementById('dsh-wmenu'); if(m)m.remove(); try{ document.removeEventListener('mousedown',_dshMenuOut,true); }catch(e){} }
function _dshMenuOut(e){ var m=document.getElementById('dsh-wmenu'); if(m&&!m.contains(e.target)) _dshCloseMenu(); }
function dshWMenu(i,btn){
  _dshCloseMenu();
  var L=_dshGetLayout(), w=L[i]; if(!w)return;
  var pal=['#2d6fd4','#00a872','#7c5cff','#c9923e','#e53e5a','#0ea5e9','#ec4899','#14b8a6','#f59e0b','#64748b'];
  var sw=pal.map(function(c){return '<span class="dsh-sw'+((w.color||'#2d6fd4')===c?' on':'')+'" style="background:'+c+'" onclick="dshWSetColor('+i+',\''+c+'\')"></span>';}).join('');
  var m=document.createElement('div'); m.id='dsh-wmenu'; m.className='dsh-wmenu';
  m.innerHTML='<div class="dsh-wmsw">'+sw+'</div>'
    +'<button onclick="dshWEdit('+i+')"><i class="ti ti-pencil"></i> 편집</button>'
    +'<button onclick="dshWMin('+i+')"><i class="ti ti-'+(w.min?'arrows-diagonal':'minus')+'"></i> '+(w.min?'펼치기':'최소화')+'</button>'
    +'<button class="del" onclick="dshWRemove('+i+')"><i class="ti ti-trash"></i> 삭제</button>';
  document.body.appendChild(m);
  var r=btn.getBoundingClientRect();
  m.style.left=Math.max(8,Math.min(r.right-196,window.innerWidth-204))+'px';
  m.style.top=(r.bottom+5)+'px';
  setTimeout(function(){ document.addEventListener('mousedown',_dshMenuOut,true); },0);
}
function dshWSetColor(i,c){ var L=_dshGetLayout(); if(L[i]){ L[i].color=c; _dshSaveLayout(); } _dshCloseMenu(); renderDashboard(); }
function dshWMin(i){ var L=_dshGetLayout(); if(L[i]){ L[i].min=!L[i].min; _dshSaveLayout(); } _dshCloseMenu(); renderDashboard(); }
function dshWExpand(i){
  _dshCloseMenu(); var ctx=_dshCtx(), L=_dshGetLayout(), w=L[i]; if(!w)return;
  var dd=_DSH_DATA[w.data]||_DSH_DATA.status; var ch=w.chart; if(!_DSH_CHART[ch]||_DSH_CHART[ch].kinds.indexOf(dd.kind)<0) ch=_dshDefChart(dd.kind);
  var payload=dd.g(ctx); if(payload&&payload.cats&&w.sort&&w.sort!=='none') payload.cats=_dshSortCats(payload.cats,w.sort,w.sortDir||'desc');
  var body=(_DSH_CHART[ch]||_DSH_CHART.kpi).r(payload);
  var ov=document.createElement('div'); ov.id='dsh-wexp'; ov.className='dsh-modal-ov'; ov.onclick=function(e){if(e.target===ov)ov.remove();};
  ov.innerHTML='<div class="dsh-wexp-box" style="border-top:4px solid '+(w.color||'#2d6fd4')+';"><div class="dsh-wexp-hd">'+_hubEsc(w.title||dd.t)+'<i class="ti ti-x" onclick="this.closest(\'.dsh-modal-ov\').remove()" style="cursor:pointer;margin-left:auto;"></i></div><div class="dsh-wexp-body">'+body+'</div></div>';
  document.body.appendChild(ov); try{_dshAnimate();}catch(e){}
}
function _dshCloseEdit(){ var e=document.getElementById('dsh-wedit'); if(e)e.remove(); }
function dweCol(el,c){ window._dweColor=c; var p=el.parentNode; if(p)p.querySelectorAll('.dsh-sw').forEach(function(x){x.classList.remove('on');}); el.classList.add('on'); }
function dweData(){ var d=document.getElementById('dwe-data'), cs=document.getElementById('dwe-chart'); if(!d||!cs)return; var dd=_DSH_DATA[d.value]; if(!dd)return; cs.innerHTML=Object.keys(_DSH_CHART).filter(function(k){return _DSH_CHART[k].kinds.indexOf(dd.kind)>=0;}).map(function(k){return '<option value="'+k+'">'+_DSH_CHART[k].t+'</option>';}).join(''); }
function dshWEdit(i){
  _dshCloseMenu(); var L=_dshGetLayout(), w=L[i]; if(!w)return;
  window._dweColor=w.color||'#2d6fd4';
  var dd=_DSH_DATA[w.data]||_DSH_DATA.status;
  var pal=['#2d6fd4','#00a872','#7c5cff','#c9923e','#e53e5a','#0ea5e9','#ec4899','#14b8a6','#f59e0b','#64748b'];
  var dataOpts=Object.keys(_DSH_DATA).map(function(k){return '<option value="'+k+'"'+(k===w.data?' selected':'')+'>'+_DSH_DATA[k].t+'</option>';}).join('');
  var chartOpts=Object.keys(_DSH_CHART).filter(function(k){return _DSH_CHART[k].kinds.indexOf(dd.kind)>=0;}).map(function(k){return '<option value="'+k+'"'+(k===w.chart?' selected':'')+'>'+_DSH_CHART[k].t+'</option>';}).join('');
  var sw=pal.map(function(c){return '<span class="dsh-sw'+((w.color||'#2d6fd4')===c?' on':'')+'" style="background:'+c+'" onclick="dweCol(this,\''+c+'\')"></span>';}).join('');
  var f='width:100%;font-size:13px;padding:7px 9px;border:1px solid var(--border);border-radius:7px;background:var(--bg2,#fff);color:var(--text);outline:none;box-sizing:border-box;';
  var ov=document.createElement('div'); ov.id='dsh-wedit'; ov.className='dsh-modal-ov'; ov.onclick=function(e){if(e.target===ov)_dshCloseEdit();};
  ov.innerHTML='<div class="dsh-edit-box">'
    +'<div class="dsh-edit-hd"><i class="ti ti-pencil"></i> 위젯 편집<i class="ti ti-x" onclick="_dshCloseEdit()" style="margin-left:auto;cursor:pointer;"></i></div>'
    +'<div class="dsh-edit-body">'
    +'<label>제목</label><input id="dwe-title" value="'+_hubEsc(w.title||'')+'" placeholder="'+_hubEsc(dd.t)+'" style="'+f+'">'
    +'<label>데이터 (집계 기준)</label><select id="dwe-data" onchange="dweData()" style="'+f+'">'+dataOpts+'</select>'
    +'<label>차트</label><select id="dwe-chart" style="'+f+'">'+chartOpts+'</select>'
    +'<div class="dwe-row"><div class="dwe-c"><label>정렬</label><select id="dwe-sort" style="'+f+'"><option value="none"'+(!w.sort||w.sort==='none'?' selected':'')+'>기본</option><option value="value"'+(w.sort==='value'?' selected':'')+'>개수</option><option value="name"'+(w.sort==='name'?' selected':'')+'>이름</option></select></div><div class="dwe-c"><label>방향</label><select id="dwe-dir" style="'+f+'"><option value="desc"'+((w.sortDir||'desc')==='desc'?' selected':'')+'>내림차순</option><option value="asc"'+(w.sortDir==='asc'?' selected':'')+'>오름차순</option></select></div></div>'
    +'<div class="dwe-row"><div class="dwe-c"><label>너비</label><select id="dwe-width" style="'+f+'">'+[1,2,3,4].map(function(n){return '<option value="'+n+'"'+((w.w||2)===n?' selected':'')+'>'+n+'칸</option>';}).join('')+'</select></div><div class="dwe-c"><label>자동 새로고침</label><select id="dwe-refresh" style="'+f+'"><option value="0"'+(!w.refresh?' selected':'')+'>끔</option><option value="1"'+(w.refresh===1?' selected':'')+'>1분</option><option value="5"'+(w.refresh===5?' selected':'')+'>5분</option><option value="15"'+(w.refresh===15?' selected':'')+'>15분</option></select></div></div>'
    +'<label>색상</label><div class="dsh-swrow">'+sw+'</div>'
    +'</div>'
    +'<div class="dsh-edit-ft"><button class="dsh-btn-c" onclick="_dshCloseEdit()">취소</button><button class="dsh-btn-s" onclick="dshWEditSave('+i+')">저장</button></div>'
    +'</div>';
  document.body.appendChild(ov);
}
function dshWEditSave(i){
  var L=_dshGetLayout(), w=L[i]; if(!w){ _dshCloseEdit(); return; }
  var gv=function(id){ var e=document.getElementById(id); return e?e.value:''; };
  w.title=gv('dwe-title'); w.data=gv('dwe-data')||w.data; w.chart=gv('dwe-chart')||w.chart;
  w.sort=gv('dwe-sort'); w.sortDir=gv('dwe-dir'); w.w=parseInt(gv('dwe-width'),10)||w.w||2; w.refresh=parseInt(gv('dwe-refresh'),10)||0;
  if(window._dweColor) w.color=window._dweColor;
  var dd=_DSH_DATA[w.data]; if(dd&&(!_DSH_CHART[w.chart]||_DSH_CHART[w.chart].kinds.indexOf(dd.kind)<0)) w.chart=_dshDefChart(dd.kind);
  _dshSaveLayout(); _dshCloseEdit(); try{_dshSetupRefresh();}catch(e){} renderDashboard();
}
function _dshSetupRefresh(){
  try{ clearInterval(window._dshRefreshT); }catch(e){}
  var L=_dshGetLayout(), mins=L.map(function(w){return w.refresh;}).filter(Boolean);
  if(mins.length){ var m=Math.min.apply(null,mins); window._dshRefreshT=setInterval(function(){ try{ if(window._curPage==='prod'&&_dshCurView()==='widget') renderDashboard(); }catch(e){} }, m*60000); }
}
// ── 역할 뷰 공통 헬퍼 ──
function _dshMe(){ try{ return (currentUser&&(currentUser.name||currentUser.username))||''; }catch(e){ return ''; } }
function _dshTcsAll(){ return (typeof tcList!=='undefined'&&Array.isArray(tcList))?tcList:[]; }
function _dshOwner(t){ return (t&&(t.owner||t.created_by||t.author))||'미지정'; }
function _dshTcName(t){ return (t&&(t.name||t.title||t.tcid||t.id))||'TC'; }
function _dshTcStat(t){ var his=(t&&t.result_history)||[]; if(!his.length) return {st:'pending',txt:'예정',c:'#9aa3b2',ex:''}; var last=his[his.length-1]; if(last&&last.result==='Pass') return {st:'pass',txt:'합격',c:'#00a872',ex:last.executor||'',dt:last.date||''}; return {st:'fail',txt:'불합격',c:'#e53e5a',ex:(last&&last.executor)||'',dt:(last&&last.date)||''}; }
function _dshRing2(pct,color,size){ size=size||86; pct=Math.max(0,Math.min(100,Math.round(pct||0))); var C=2*Math.PI*40, off=C*(1-pct/100); return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 96 96"><circle cx="48" cy="48" r="40" fill="none" stroke="#eef1f6" stroke-width="9"/><circle cx="48" cy="48" r="40" fill="none" stroke="'+color+'" stroke-width="9" stroke-linecap="round" stroke-dasharray="'+C+'" stroke-dashoffset="'+off+'" transform="rotate(-90 48 48)"/><text x="48" y="53" text-anchor="middle" font-size="16" font-weight="900" fill="#1b2333">'+pct+'%</text></svg>'; }
function _dshKpi2(l,n,sub,color){ return '<div class="rdsh-kpi" style="--c:'+color+'"><div class="rdsh-kl">'+l+'</div><div class="rdsh-kn">'+n+'</div>'+(sub?'<div class="rdsh-ks">'+sub+'</div>':'')+'</div>'; }
function _dshDonutCard(title,cats){ var leg=cats.map(function(s){return '<div class="rdsh-lr"><span class="rdsh-ld" style="background:'+s.color+'"></span>'+s.label+'<b>'+s.value+'</b></div>';}).join(''); return '<div class="rdsh-card"><div class="rdsh-ch">'+title+'</div><div style="display:flex;align-items:center;gap:18px;">'+_dshDonut(cats,120)+'<div class="rdsh-leg">'+leg+'</div></div></div>'; }
// ── 임원 뷰 ──
function _dshExecView(c){
  var g=_dshGauges(c), vc=_dshVerdictCats();
  var pass=vc[0].value, fail=vc[1].value, pend=vc[2].value;
  var passRate=(pass+fail)?Math.round(pass/(pass+fail)*100):0;
  var find=function(l){ return g.filter(function(x){return x.label===l;})[0]; };
  var prog=find('REQ/TC 시험'), progPct=prog?prog.pct:0;
  var uptime=c.tot?Math.round(c.nUp/c.tot*100):0;
  var nCyc=(typeof cycleList!=='undefined'&&cycleList)?cycleList.length:0;
  var kpis='<div class="rdsh-kpis four">'
    +_dshKpi2('전체 합격률',passRate+'<small>%</small>','합격 '+pass+' / '+(pass+fail),'#00a872')
    +_dshKpi2('시험 진척률',progPct+'<small>%</small>',(prog?prog.sub:''),'#2d6fd4')
    +_dshKpi2('장비 가동률',uptime+'<small>%</small>',c.nUp+' / '+c.tot,'#7c5cff')
    +_dshKpi2('진행 사이클',nCyc,'개','#c9923e')+'</div>';
  var rings='<div class="rdsh-card"><div class="rdsh-ch">진행률</div><div class="rdsh-ringrow">'
    +g.map(function(r){return '<div class="rdsh-ring">'+_dshRing2(r.pct,r.color)+'<div class="rdsh-rl">'+r.label+'</div><div class="rdsh-rs">'+r.sub+'</div></div>';}).join('')+'</div></div>';
  var risk='<div class="rdsh-card"><div class="rdsh-ch">⚠ 주의 · 위험</div><div class="rdsh-risk">'
    +'<div><b style="color:#e53e5a;">'+fail+'</b> 불합격 TC</div>'
    +'<div><b style="color:#c9923e;">'+pend+'</b> 미실행(예정)</div>'
    +'<div><b style="color:#7c5cff;">'+(c.tot-c.nUp)+'</b> 미연결 장비</div></div></div>';
  return '<div class="rdsh">'+kpis+'<div class="rdsh-2col">'+_dshDonutCard('시험 결과 분포',vc)+rings+'</div>'+risk+'</div>';
}
// ── 팀장 뷰 ──
function _dshLeadView(c){
  var tcs=_dshTcsAll(), e=_hubEsc;
  var byO={}; tcs.forEach(function(t){ var o=_dshOwner(t); if(!byO[o])byO[o]={tot:0,exec:0,fail:0}; byO[o].tot++; var s=_dshTcStat(t); if(s.st!=='pending')byO[o].exec++; if(s.st==='fail')byO[o].fail++; });
  var owners=Object.keys(byO).sort(function(a,b){return byO[b].tot-byO[a].tot;}).slice(0,8);
  var oRows=owners.map(function(o){ var d=byO[o], pct=d.tot?Math.round(d.exec/d.tot*100):0; return '<div class="rdsh-prow"><span class="rdsh-pn" title="'+e(o)+'">'+e(o)+'</span><span class="rdsh-bar"><span class="rdsh-fill" style="width:'+pct+'%;background:#2d6fd4;"></span></span><b>'+d.exec+'/'+d.tot+'</b>'+(d.fail?'<span class="rdsh-fc">'+d.fail+'↯</span>':'')+'</div>'; }).join('');
  var owner='<div class="rdsh-card"><div class="rdsh-ch">👥 담당자별 진행</div>'+(oRows||'<div class="rdsh-empty">TC 없음</div>')+'</div>';
  var res='<div class="rdsh-card"><div class="rdsh-ch">🔌 리소스 (장비·계측기)</div>'
    +c.net.slice(0,5).map(function(d){ var on=_hubUp(d); return '<div class="rdsh-rr"><span class="rdsh-sd" style="background:'+(on?'#00a872':'#cbd2dd')+'"></span><span class="rdsh-rn">'+e(d.name||d.model||'')+'</span><span class="rdsh-tag">'+_dshClass(d)+'</span><span class="rdsh-rstat" style="margin-left:auto;color:'+(on?'#00a872':'#9aa3b5')+'">'+(on?'가용':'미연결')+'</span></div>'; }).join('')
    +c.meters.slice(0,3).map(function(d){ var on=_hubUp(d); return '<div class="rdsh-rr"><span class="rdsh-sd" style="background:'+(on?'#7c5cff':'#cbd2dd')+'"></span><span class="rdsh-rn">'+e(d.name||d.model||'')+'</span><span class="rdsh-tag" style="background:#efeaff;color:#7c5cff;">계측기</span><span class="rdsh-rstat" style="margin-left:auto;color:'+(on?'#00a872':'#9aa3b5')+'">'+(on?'연결':'미연결')+'</span></div>'; }).join('')+'</div>';
  var fails=tcs.filter(function(t){return _dshTcStat(t).st==='fail';}).slice(0,7);
  var blk='<div class="rdsh-card"><div class="rdsh-ch">🧱 블로커 · 재시험 필요</div>'+(fails.length?fails.map(function(t){return '<div class="rdsh-rr"><span class="rdsh-pill fail">불합격</span><span class="rdsh-rn">'+e(_dshTcName(t))+'</span><span class="rdsh-own">'+e(_dshOwner(t))+'</span></div>';}).join(''):'<div class="rdsh-empty">불합격 TC 없음 👍</div>')+'</div>';
  return '<div class="rdsh"><div class="rdsh-2col">'+owner+res+'</div><div class="rdsh-2col">'+blk+_dshDonutCard('시험 결과 요약',_dshVerdictCats())+'</div></div>';
}
// ── 담당·팀원 뷰 ──
function _dshEngView(c){
  var me=_dshMe(), tcs=_dshTcsAll(), e=_hubEsc;
  var mine=tcs.filter(function(t){ return _dshOwner(t)===me || _dshTcStat(t).ex===me; });
  var demo=false; if(!mine.length){ mine=tcs.slice(0,14); demo=true; }
  var tot=mine.length, exec=mine.filter(function(t){return _dshTcStat(t).st!=='pending';}).length, fail=mine.filter(function(t){return _dshTcStat(t).st==='fail';}).length;
  var kpis='<div class="rdsh-kpis three">'
    +_dshKpi2(demo?'TC (전체)':'내 TC',tot,demo?'담당 미지정 → 전체 표시':'담당','#2d6fd4')
    +_dshKpi2('실행 완료',exec+'<small>/'+tot+'</small>','','#00a872')
    +_dshKpi2('재시험 필요',fail,'불합격','#e53e5a')+'</div>';
  var rows=mine.slice(0,14).map(function(t){ var s=_dshTcStat(t); return '<div class="rdsh-rr"><span class="rdsh-sd" style="background:'+s.c+'"></span><span class="rdsh-rn">'+e(_dshTcName(t))+'</span><span class="rdsh-pill" style="margin-left:auto;background:'+s.c+'22;color:'+s.c+';">'+s.txt+'</span></div>'; }).join('');
  var list='<div class="rdsh-card"><div class="rdsh-ch">✅ '+(demo?'TC 목록':'내 담당 TC')+'</div>'+(rows||'<div class="rdsh-empty">TC 없음</div>')+'</div>';
  var dev='<div class="rdsh-card"><div class="rdsh-ch">🔌 실행 대상 장비·계측기</div>'
    +c.net.slice(0,5).map(function(d){ var on=_hubUp(d); return '<div class="rdsh-rr"><span class="rdsh-sd" style="background:'+(on?'#00a872':'#cbd2dd')+'"></span><span class="rdsh-rn">'+e(d.name||d.model||'')+'</span><span class="rdsh-rstat" style="margin-left:auto;color:'+(on?'#00a872':'#9aa3b5')+'">'+(on?'연결':'미연결')+'</span></div>'; }).join('')
    +c.meters.slice(0,3).map(function(d){ var on=_hubUp(d); return '<div class="rdsh-rr"><span class="rdsh-sd" style="background:'+(on?'#7c5cff':'#cbd2dd')+'"></span><span class="rdsh-rn">'+e(d.name||d.model||'')+'</span><span class="rdsh-rstat" style="margin-left:auto;color:'+(on?'#00a872':'#9aa3b5')+'">'+(on?'연결':'미연결')+'</span></div>'; }).join('')+'</div>';
  return '<div class="rdsh">'+kpis+'<div class="rdsh-2col">'+list+dev+'</div></div>';
}
// ── 통합 뷰 (기본) : 좌 장비/계측기 · 우 시험 ──
function _dshUnifiedView(c){
  var e=_hubEsc, g=_dshGauges(c), vc=_dshVerdictCats();
  var uptime=c.tot?Math.round(c.nUp/c.tot*100):0;
  var nReq=(typeof reqList!=='undefined'&&reqList)?reqList.length:0;
  var nTc=(typeof tcList!=='undefined'&&tcList)?tcList.length:0;
  var tcs=_dshTcsAll();
  var execN=tcs.filter(function(t){return (t.result_history||[]).length;}).length;
  var pass=vc[0].value, fail=vc[1].value;
  var passRate=(pass+fail)?Math.round(pass/(pass+fail)*100):0;
  // ── 좌: 장비/계측기 ──
  var topL='<div class="rdsh-card"><div style="display:flex;gap:14px;align-items:center;">'
    +'<div style="text-align:center;">'+_dshRing2(uptime,'#7c5cff',92)+'<div class="rdsh-rl">가동률</div></div>'
    +'<div style="flex:1;display:flex;flex-direction:column;gap:9px;">'
      +'<div class="rdsh-mini" style="--c:#2d6fd4;"><span>네트워크 장비</span><b>'+c.tot+'</b></div>'
      +'<div class="rdsh-mini" style="--c:#7c5cff;"><span>계측기</span><b>'+c.meters.length+'</b></div>'
    +'</div></div></div>';
  var cat='<div class="rdsh-card"><div class="rdsh-ch">네트워크 장비 분류</div><div style="display:flex;align-items:center;gap:16px;">'+_dshDonut(c.catRows,110)+'<div class="rdsh-leg">'+c.catRows.map(function(s){return '<div class="rdsh-lr"><span class="rdsh-ld" style="background:'+s.color+'"></span>'+s.label+'<b>'+s.value+'</b></div>';}).join('')+'</div></div></div>';
  var devs='<div class="rdsh-card"><div class="rdsh-ch">네트워크 장비 <span style="color:var(--text3);font-weight:700;">· 연결 '+c.nUp+'/'+c.tot+'</span></div>'
    +(c.net.length?c.net.slice(0,6).map(function(d){var on=_hubUp(d);return '<div class="rdsh-rr"><span class="rdsh-sd" style="background:'+(on?'#00a872':'#cbd2dd')+'"></span><span class="rdsh-rn">'+e(d.name||d.model||'')+'</span><span class="rdsh-tag">'+_dshClass(d)+'</span><span class="rdsh-rstat" style="margin-left:auto;color:'+(on?'#00a872':'#9aa3b5')+'">'+(on?'연결':'미연결')+'</span></div>';}).join(''):'<div class="rdsh-empty">등록된 장비 없음</div>')+'</div>';
  var meters='<div class="rdsh-card"><div class="rdsh-ch" style="color:#7c5cff;">계측기 (트래픽 발생기)</div>'
    +(c.meters.length?'<div class="rdsh-mcards">'+c.meters.slice(0,4).map(function(d){var on=_hubUp(d);return '<div class="rdsh-mcard"><div class="rdsh-mtop">'+(on?'<span class="rdsh-rstat" style="color:#00a872;">● 연결</span>':'<span class="rdsh-rstat" style="color:#9aa3b5;">○ 미연결</span>')+'</div><div class="rdsh-mname">'+e(d.name||d.model||'')+'</div><div class="rdsh-mip">'+e(d.ip||'')+'</div></div>';}).join('')+'</div>':'<div class="rdsh-empty">등록된 계측기 없음</div>')+'</div>';
  var left='<div class="rdsh-col"><div class="rdsh-coltitle"><span class="rdsh-cdot" style="background:#2d6fd4;"></span>장비 · 계측기 현황</div>'+topL+cat+devs+meters+'</div>';
  // ── 우: 시험 현황 ──
  var kpis='<div class="rdsh-kpis four">'
    +_dshKpi2('REQ',nReq,'','#c9923e')+_dshKpi2('TC',nTc,'','#00a872')
    +_dshKpi2('실행 완료',execN+'<small>/'+nTc+'</small>','','#2d6fd4')
    +_dshKpi2('합격률',passRate+'<small>%</small>','','#e53e5a')+'</div>';
  var rings='<div class="rdsh-card"><div class="rdsh-ch">진행률</div><div class="rdsh-ringrow">'+g.map(function(r){return '<div class="rdsh-ring">'+_dshRing2(r.pct,r.color)+'<div class="rdsh-rl">'+r.label+'</div><div class="rdsh-rs">'+r.sub+'</div></div>';}).join('')+'</div></div>';
  // 최근 실행: Cycle 의 items 를 순회해 실행 완료된 것들 수집 — 모델(장비), 버전, TC 이름, 결과 표시
  var runs=[];
  try{
    var _cyList=(typeof cycleList!=='undefined'&&Array.isArray(cycleList))?cycleList:[];
    _cyList.forEach(function(cy){
      if(!cy||!Array.isArray(cy.items)) return;
      var _mdl=cy.model||'', _ver=cy.version||'';
      cy.items.forEach(function(it){
        var _r=(it&&(it.result||it.exec_result||it.status))||'';
        var _at=it&&(it.executed_at||it.updated_at||it.date||'');
        if(!_r||_r==='예정'||_r==='') return;
        var _nm=(it&&(it.name||it.tcName))||'';
        if(!_nm && it&&it.tcid){ var _t=tcs.find(function(t){return (t.tcid||t.id)===it.tcid;}); _nm=_t?_dshTcName(_t):it.tcid; }
        runs.push({model:_mdl, version:_ver, name:_nm, result:_r, at:_at, tcid:it.tcid||''});
      });
    });
  }catch(_e){}
  // 최근 순 정렬 (executed_at 없으면 뒤로)
  runs.sort(function(a,b){ return String(b.at||'').localeCompare(String(a.at||'')); });
  runs=runs.slice(0,8);
  var recent='<div class="rdsh-card"><div class="rdsh-ch">최근 실행</div>'+(runs.length?runs.map(function(x){
    var p=x.result==='PASS'||x.result==='Pass'; var f=x.result==='FAIL'||x.result==='Fail';
    var col=p?'#00a872':(f?'#e53e5a':'#8a92a6');
    var _mv=[x.model, x.version].filter(Boolean).join(' · ');
    return '<div class="rdsh-rr" style="align-items:center;">'
      +'<span class="rdsh-sd" style="background:'+col+';"></span>'
      +'<div style="flex:1;min-width:0;">'
        +(_mv?('<div style="font-size:10.5px;color:var(--text3);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+e(_mv)+'</div>'):'')
        +'<div class="rdsh-rn" style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="'+e(x.name||'')+'">'+e(x.name||'')+'</div>'
      +'</div>'
      +'<span class="rdsh-rstat" style="margin-left:8px;color:'+col+';font-weight:800;flex-shrink:0;">'+e(x.result||'-')+'</span>'
      +'</div>';
  }).join(''):'<div class="rdsh-empty">실행 이력 없음</div>')+'</div>';
  var runningCard='<div class="rdsh-card" id="dsh-cycle-running"><div class="rdsh-ch"><span class="rdsh-live-dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#00a872;box-shadow:0 0 0 4px rgba(0,168,114,0.2);margin-right:6px;animation:_dshPulse 1.4s ease-in-out infinite;"></span>Cycle 진행중</div><div id="dsh-cycle-running-body">'+_dshCycleRunningHtml()+'</div></div>';
  var right='<div class="rdsh-col"><div class="rdsh-coltitle"><span class="rdsh-cdot" style="background:#00a872;"></span>시험 현황</div>'+kpis+'<div class="rdsh-2col">'+_dshDonutCard('시험 결과 분포',vc)+rings+'</div>'+recent+runningCard+'</div>';
  return '<div class="rdsh-unified">'+left+right+'</div>';
}

// 진행 중 Cycle 표시용 캐시: 서버 /api/cycle-run-progress + WS cb_run_progress 로 갱신
var _dshCycleRun=null;   // {user, name, done, total, stepIdx, stepCnt, stepName, ids}
function _dshCycleRunningHtml(){
  var e=function(s){return String(s==null?'':s).replace(/</g,'&lt;').replace(/&/g,'&amp;');};
  var st=_dshCycleRun;
  // 서버/WS 상태 없어도 이 브라우저에서 자기 자신이 실행 중이면 로컬 값으로 표시 (broadcast 실패 대비)
  try{
    if(!st && typeof _cbRunActive!=='undefined' && _cbRunActive){
      var _ids=(typeof _cbRunCycleIds!=='undefined'&&Array.isArray(_cbRunCycleIds))?_cbRunCycleIds.slice():[];
      var _done=(typeof _cbRunDoneKeys!=='undefined'&&Array.isArray(_cbRunDoneKeys))?_cbRunDoneKeys.length:0;
      var _total=(typeof _cbRunAllKeys!=='undefined'&&Array.isArray(_cbRunAllKeys))?_cbRunAllKeys.length:0;
      var _name='', _cyList=(typeof cycleList!=='undefined'&&Array.isArray(cycleList))?cycleList:[];
      if(_ids.length){ var _cy=_cyList.find(function(x){return x&&x.id===_ids[0];}); if(_cy) _name=(_cy.name||_cy.model||'')+(_ids.length>1?(' 외 '+(_ids.length-1)):''); }
      var _me=(typeof currentUser!=='undefined'&&currentUser&&(currentUser.name||currentUser.username))||'';
      st={ids:_ids, name:_name, done:_done, total:_total, user:_me};
    }
  }catch(_le){}
  if(!st) return '<div class="rdsh-empty">진행 중인 사이클 없음</div>';
  var done=parseInt(st.done)||0, tot=parseInt(st.total)||0;
  var pct=tot>0?Math.min(100,Math.round(done/tot*100)):0;
  // 실행 대상 Cycle 에서 장비(model)·버전 정보 추출
  var _mdl='', _ver='';
  try{
    var _ids=Array.isArray(st.ids)?st.ids:[];
    var _cyList=(typeof cycleList!=='undefined'&&Array.isArray(cycleList))?cycleList:[];
    var _mset={}, _vset={};
    _ids.forEach(function(cid){ var _cy=_cyList.find(function(x){return x&&x.id===cid;}); if(_cy){ if(_cy.model)_mset[_cy.model]=1; if(_cy.version)_vset[_cy.version]=1; } });
    _mdl=Object.keys(_mset).join(', '); _ver=Object.keys(_vset).join(', ');
  }catch(_ce){}
  var stepInfo='';
  if(st.stepName){
    var si=parseInt(st.stepIdx)||0, sc=parseInt(st.stepCnt)||0;
    stepInfo='<div style="padding:6px 10px 4px;border-top:1px dashed var(--border);margin-top:4px;font-size:11px;color:var(--text3);"><span style="color:var(--text2);font-weight:700;">Step '+(si+1)+(sc?('/'+sc):'')+':</span> '+e((st.stepName||'').slice(0,60))+'</div>';
  }
  return ''
    +'<div style="padding:6px 10px 4px;display:flex;align-items:center;gap:8px;">'
      +'<span class="rdsh-sd" style="background:#00a872;animation:_dshPulse 1.4s ease-in-out infinite;flex-shrink:0;"></span>'
      +'<div style="flex:1;min-width:0;">'
        +((_mdl||_ver)?('<div style="font-size:10.5px;color:var(--text3);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+e([_mdl,_ver].filter(Boolean).join(' · '))+'</div>'):'')
        +'<div style="font-size:12.5px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="'+e(st.name||'')+'">'+e(st.name||'(진행중)')+'</div>'
      +'</div>'
      +'<span style="font-size:11px;color:var(--text3);flex-shrink:0;">'+e(st.user||'')+'</span>'
    +'</div>'
    +'<div style="padding:2px 10px 8px;display:flex;align-items:center;gap:8px;">'
      +'<div style="flex:1;height:10px;background:#e6ecf3;border-radius:5px;overflow:hidden;position:relative;box-shadow:inset 0 1px 2px rgba(0,0,0,0.08);">'
        +'<div style="height:100%;width:'+pct+'%;background:linear-gradient(90deg,#00a872,#00d688);transition:width 0.4s ease;border-radius:5px;position:relative;overflow:hidden;">'
          +'<div style="position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.35),transparent);animation:_dshShine 2s linear infinite;"></div>'
        +'</div>'
      +'</div>'
      +'<span style="font-size:12.5px;font-weight:800;color:#00875a;white-space:nowrap;min-width:80px;text-align:right;">'+done+' / '+tot+' <span style="color:#00a872;">('+pct+'%)</span></span>'
    +'</div>'
    +stepInfo;
}
function _dshCycleRunningRefresh(){
  var el=document.getElementById('dsh-cycle-running-body');
  if(el) el.innerHTML=_dshCycleRunningHtml();
}
// 서버에 저장된 진행 상태 조회 (첫 렌더링 + 페이지 이동 후 복원)
async function _dshCycleRunningFetch(){
  try{
    var r=await fetch('/api/cycle-run-progress',{cache:'no-store'});
    if(!r.ok) return;
    var d=await r.json();
    _dshCycleRun=(d&&d.state)?d.state:null;
    _dshCycleRunningRefresh();
  }catch(_e){}
}
// WebSocket 진행 이벤트 수신 시 → 실시간 반영
window.dashboardOnCycleRunProgress=function(msg){
  if(!msg) return;
  if(msg.evt==='done'){ _dshCycleRun=null; }
  else {
    _dshCycleRun={
      user:msg.user||'', name:msg.name||'',
      done:msg.done||0, total:msg.total||0,
      stepIdx:msg.stepIdx, stepCnt:msg.stepCnt, stepName:msg.stepName||'',
      ids:msg.ids||[]
    };
  }
  _dshCycleRunningRefresh();
};
// 애니메이션 CSS 주입 (한 번만)
(function(){ try{ if(document.getElementById('dsh-cycle-run-css')) return; var s=document.createElement('style'); s.id='dsh-cycle-run-css'; s.textContent='@keyframes _dshPulse{0%,100%{opacity:1;}50%{opacity:0.4;}}@keyframes _dshShine{0%{transform:translateX(-100%);}100%{transform:translateX(100%);}}'; document.head.appendChild(s); }catch(_e){} })();

function _dshKpi(lbl,color,num){ return '<div class="dsh-kpi" style="color:'+color+'"><div class="dsh-kpi-lbl">'+lbl+'</div><div class="dsh-kpi-num"><span data-cu="'+num+'">0</span></div></div>'; }

function _dshDonut(segs,size){
  size=size||140; const cx=size/2, cy=size/2, r=size/2-13, C=2*Math.PI*r;
  const tot=segs.reduce((s,x)=>s+(x.value||0),0);
  let off=0, arcs='';
  if(tot>0){ segs.forEach(function(s){ if(!s.value) return; const len=C*(s.value/tot);
    arcs+='<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="'+s.color+'" stroke-width="14" stroke-dasharray="'+len+' '+(C-len)+'" stroke-dashoffset="'+(-off)+'" transform="rotate(-90 '+cx+' '+cy+')"/>'; off+=len; }); }
  return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 '+size+' '+size+'"><circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="var(--bg3)" stroke-width="14"/>'+arcs+'</svg>';
}
function _dshRing(pct,color){
  pct=Math.max(0,Math.min(100,pct||0)); const C=2*Math.PI*40, off=C*(1-pct/100);
  return '<svg width="96" height="96" viewBox="0 0 96 96"><circle cx="48" cy="48" r="40" fill="none" stroke="var(--bg3)" stroke-width="9"/>'
   +'<circle cx="48" cy="48" r="40" fill="none" stroke="'+color+'" stroke-width="9" stroke-linecap="round" stroke-dasharray="'+C+'" stroke-dashoffset="'+off+'" transform="rotate(-90 48 48)"/></svg>';
}
// ── 차트 렌더러 (payload → HTML) ──
const _DSH_PAL=['#2d6fd4','#00a872','#8b5cf6','#c9923e','#e53e5a','#0ea5e9','#ec4899','#14b8a6','#f59e0b','#64748b'];
function _dshChDonut(p){ const segs=p.cats||[]; const leg=segs.map(s=>'<div class="dsh-leg-row"><span class="dsh-leg-dot" style="background:'+s.color+'"></span>'+s.label+'<b>'+s.value+'</b></div>').join(''); return '<div class="dsh-donut-wrap">'+_dshDonut(segs,130)+'<div class="dsh-leg">'+leg+'</div></div>'; }
function _dshChBar(p){ const rows=p.cats||[]; const max=Math.max(1,...rows.map(r=>r.value||0)); return '<div class="dsh-bars">'+rows.map(r=>'<div class="dsh-bar-row"><div class="dsh-bar-top">'+r.label+'<b>'+(r.value||0)+'</b></div><div class="dsh-bar-track"><div class="dsh-bar-fill" data-w="'+Math.round((r.value||0)/max*100)+'" style="width:0;background:linear-gradient(90deg,'+r.color+','+(r.color)+'bb)"></div></div></div>').join('')+'</div>'; }
function _dshChKpi(p){ let items=p.stats; if(!items){ items=(p.total!=null?[{label:'전체',value:p.total,color:'var(--text)'}]:[]).concat(p.cats||[]); } return '<div class="dsh-kpirow">'+items.map(s=>_dshKpi(s.label,s.color||'var(--text)',s.value)).join('')+'</div>'; }
function _dshChRings(p){ const g=p.gauges||[]; return '<div class="dsh-rings">'+g.map(r=>'<div class="dsh-ring"><div class="dsh-ring-wrap">'+_dshRing(r.pct,r.color)+'<div class="dsh-ring-pct">'+r.pct+'%</div></div><div class="dsh-ring-lbl">'+r.label+'</div><div class="dsh-ring-sub">'+r.sub+'</div></div>').join('')+'</div>'; }
function _dshChPbar(p){ const g=p.gauges||[]; return '<div class="dsh-bars">'+g.map(r=>'<div class="dsh-bar-row"><div class="dsh-bar-top">'+r.label+'<b>'+r.pct+'%</b></div><div class="dsh-bar-track"><div class="dsh-bar-fill" data-w="'+r.pct+'" style="width:0;background:linear-gradient(90deg,'+r.color+','+(r.color)+'bb)"></div></div></div>').join('')+'</div>'; }
function _dshChList(p){ const meters=p.meters||[]; if(!meters.length) return '<div class="dsh-empty"><i class="ti ti-wave-square"></i>등록된 계측기가 없습니다</div>';
  return '<div class="dsh-mlist">'+meters.map(function(d,i){ const kind=_hubMeterKind(d), on=_hubUp(d), canPort=(kind==='N2X'||kind==='STC'); const ico=kind==='STC'?'ti-router-2':kind==='IXIA'?'ti-device-desktop-analytics':kind==='N2X'?'ti-router':'ti-wave-sine';
    return '<div class="dsh-mrow"><span class="dsh-mico"><i class="ti '+ico+'"></i></span><div class="dsh-minfo"><div class="dsh-mname">'+_hubEsc(d.name||d.model||kind)+'</div><div class="dsh-mip">'+_hubEsc(d.ip||'')+' · '+kind+'</div></div>'+(on?'<span class="dsh-mstat on">● 연결</span>':'<span class="dsh-mstat">○ 미연결</span>')+'<span class="dsh-mport" id="hubmp-'+i+'"></span>'+(canPort?'<button class="dsh-mbtn" id="hubmb-'+i+'" onclick="hubFetchPorts('+i+',\''+kind+'\',\''+_hubEsc(d.ip||'')+'\',\''+_hubEsc(d.username||'2')+'\')"><i class="ti ti-plug-connected"></i> 포트</button>':'')+'</div>';
  }).join('')+'</div>';
}
// ── 데이터 집계 헬퍼 ──
function _dshGroup(arr,keyFn){ const m={},ord=[]; (arr||[]).forEach(d=>{ const k=keyFn(d)||'기타'; if(m[k]==null){m[k]=0;ord.push(k);} m[k]++; }); return ord.map((k,i)=>({label:k,value:m[k],color:_DSH_PAL[i%_DSH_PAL.length]})); }
function _dshVerdictCats(){ let p=0,f=0,pe=0,ex=0; try{ if(typeof _rptCollect==='function'&&typeof _rptVerdict==='function'){ (_rptCollect()||[]).forEach(it=>{ const v=_rptVerdict(it); if(v==='pass')p++; else if(v==='fail')f++; else if(v==='exclude')ex++; else pe++; }); } }catch(e){} return [{label:'합격',value:p,color:'#00a872'},{label:'불합격',value:f,color:'#e53e5a'},{label:'예정',value:pe,color:'#9aa3b2'},{label:'제외',value:ex,color:'#c9923e'}]; }
function _dshGauges(c){ const g=[]; try{ if(typeof tcList!=='undefined'&&Array.isArray(tcList)&&tcList.length){ const T=tcList.length; const exec=tcList.filter(t=>t&&Array.isArray(t.result_history)&&t.result_history.length).length; const wstep=tcList.filter(t=>t&&Array.isArray(t.checks)&&t.checks.length).length; g.push({pct:Math.round(exec/T*100),label:'REQ/TC 시험',sub:exec+' / '+T,color:'#2d6fd4'}); g.push({pct:Math.round(wstep/T*100),label:'자동화 커버리지',sub:wstep+' / '+T,color:'#c9923e'}); } }catch(e){} try{ if(typeof _rptCollect==='function'&&typeof _rptVerdict==='function'){ let p=0,f=0; (_rptCollect()||[]).forEach(it=>{ const v=_rptVerdict(it); if(v==='pass')p++; else if(v==='fail')f++; }); if(p+f>0) g.push({pct:Math.round(p/(p+f)*100),label:'시험 합격률',sub:p+' / '+(p+f),color:'#00a872'}); } }catch(e){} g.push({pct:c.tot?Math.round(c.nUp/c.tot*100):0,label:'장비 가동률',sub:c.nUp+' / '+c.tot,color:'#7c5cff'}); return g; }
function _dshLen(g){ return (typeof g!=='undefined'&&Array.isArray(g))?g.length:0; }
function _dshCounts(c){ return [{label:'네트워크 장비',value:c.tot,color:'#2d6fd4'},{label:'계측기',value:(c.meters||[]).length,color:'#7c5cff'},{label:'TC',value:_dshLen(typeof tcList!=='undefined'?tcList:null),color:'#00a872'},{label:'REQ',value:_dshLen(typeof reqList!=='undefined'?reqList:null),color:'#c9923e'},{label:'사이클',value:_dshLen(typeof cycleList!=='undefined'?cycleList:null),color:'#e53e5a'}]; }
// ── 데이터 소스 레지스트리 (드롭다운1) ──
const _DSH_DATA={
  status:  {t:'장비 상태',          kind:'cats',  g:c=>({total:c.tot,cats:c.donutSegs})},
  category:{t:'장비 분류(L2/L3/OLT)', kind:'cats',  g:c=>({total:c.tot,cats:c.catRows})},
  protocol:{t:'접속 프로토콜',        kind:'cats',  g:c=>({total:c.tot,cats:_dshGroup(c.net,d=>String(d.protocol||'기타').toUpperCase())})},
  vendor:  {t:'제조사(Vendor)',       kind:'cats',  g:c=>({total:c.tot,cats:_dshGroup(c.net,d=>(d.vendor||'기타'))})},
  verdict: {t:'시험 결과 분포',        kind:'cats',  g:c=>({cats:_dshVerdictCats()})},
  progress:{t:'시험·가동 진행률',      kind:'gauges',g:c=>({gauges:_dshGauges(c)})},
  meters:  {t:'계측기 현황',           kind:'list',  g:c=>({meters:c.meters})},
  counts:  {t:'요약 카운트',           kind:'stat',  g:c=>({stats:_dshCounts(c)})}
};
// ── 차트 레지스트리 (드롭다운2 — 데이터 kind에 맞는 것만 노출) ──
const _DSH_CHART={
  donut:{t:'도넛',    kinds:['cats'],        r:_dshChDonut},
  bar:  {t:'막대',    kinds:['cats'],        r:_dshChBar},
  kpi:  {t:'숫자',    kinds:['cats','stat'], r:_dshChKpi},
  rings:{t:'링 게이지',kinds:['gauges'],      r:_dshChRings},
  pbar: {t:'진행 막대',kinds:['gauges'],      r:_dshChPbar},
  list: {t:'목록',    kinds:['list'],        r:_dshChList}
};
function _dshDefChart(kind){ return kind==='gauges'?'rings':kind==='list'?'list':kind==='stat'?'kpi':'donut'; }// ── 위젯 레이아웃 상태 (localStorage 저장) ──
function _dshDefaultLayout(){ return [{data:'status',chart:'kpi',w:4},{data:'status',chart:'donut',w:2},{data:'category',chart:'bar',w:2},{data:'progress',chart:'rings',w:2},{data:'meters',chart:'list',w:2}]; }
function _dshMigrate(L){ const map={kpi:['status','kpi',4],status:['status','donut',2],category:['category','bar',2],progress:['progress','rings',2],meters:['meters','list',2]}; return (L||[]).map(function(w){ if(w&&w.data) return {data:w.data,chart:w.chart,w:w.w||2}; if(w&&w.type&&map[w.type]) return {data:map[w.type][0],chart:map[w.type][1],w:w.w||map[w.type][2]}; return {data:'status',chart:'donut',w:(w&&w.w)||2}; }); }
function _dshGetLayout(){ if(!Array.isArray(window._dshLayout)){ var L=null; try{ var s=localStorage.getItem('utop_dash_widgets'); L=s?JSON.parse(s):null; }catch(e){ L=null; } window._dshLayout=Array.isArray(L)?_dshMigrate(L):_dshDefaultLayout(); } return window._dshLayout; }
function _dshSaveLayout(){ try{ localStorage.setItem('utop_dash_widgets',JSON.stringify(window._dshLayout||[])); }catch(e){} }function dshResetLayout(){ window._dshLayout=_dshDefaultLayout(); _dshSaveLayout(); renderDashboard(); }
function dshAddWidget(){ var L=_dshGetLayout(); L.push({data:'status',chart:'donut',w:2}); _dshSaveLayout(); window._dshEdit=true; renderDashboard(); }
function dshWRemove(i){ var L=_dshGetLayout(); L.splice(i,1); _dshSaveLayout(); renderDashboard(); }function dshWData(i,data){ var L=_dshGetLayout(); if(L[i]){ L[i].data=data; var dd=_DSH_DATA[data]; if(dd&&(!_DSH_CHART[L[i].chart]||_DSH_CHART[L[i].chart].kinds.indexOf(dd.kind)<0)) L[i].chart=_dshDefChart(dd.kind); _dshSaveLayout(); renderDashboard(); } }
function dshWChart(i,chart){ var L=_dshGetLayout(); if(L[i]){ L[i].chart=chart; _dshSaveLayout(); renderDashboard(); } }
function dshWDrag(e,i){ window._dshDragI=i; try{ e.dataTransfer.effectAllowed='move'; }catch(_){} }
function dshWDrop(e,i){ e.preventDefault(); var from=window._dshDragI; if(from==null||from===i) return; var L=_dshGetLayout(); var m=L.splice(from,1)[0]; L.splice(i,0,m); window._dshDragI=null; _dshSaveLayout(); renderDashboard(); }

function _hubMeterKind(d){ const s=((d.model||'')+' '+(d.name||'')+' '+(d.vendor||'')).toUpperCase(); const p=String(d.protocol||'').toLowerCase(); if(s.indexOf('IXNET')>=0) return 'IXIA'; if(s.indexOf('N2X')>=0||p==='tcl') return 'N2X'; if(s.indexOf('STC')>=0||s.indexOf('SPIRENT')>=0) return 'STC'; if(s.indexOf('IXIA')>=0) return 'N2X'; return 'METER'; }function _hubMeterCard(d,i){
  const on=d.status==='connected';
  const kind=_hubMeterKind(d);
  const ico=kind==='N2X'?'ti-router':kind==='STC'?'ti-router-2':kind==='IXIA'?'ti-device-desktop-analytics':'ti-wave-sine';
  const canPort=(kind==='N2X'||kind==='STC');
  return '<div class="hub-card m" id="hubm-'+i+'" style="--ac:#7c5cff;--ac2:#b794ff;">'
   +'<div class="hub-ctop"><span class="hub-cico"><i class="ti '+ico+'"></i></span>'
   +(on?'<span class="hub-live"><span class="hub-live-dot"></span>연결</span>':'<span class="hub-dead">○ 미연결</span>')+'</div>'
   +'<div class="hub-cmodel">'+_hubEsc(d.name||d.model||kind)+'</div>'
   +'<div class="hub-cip">'+_hubEsc(d.ip||'')+'  ·  '+kind+'</div>'
   +'<div class="hub-mport" id="hubmp-'+i+'"><span class="e">포트 미조회</span></div>'
   +(canPort?'<button class="hub-mbtn" id="hubmb-'+i+'" onclick="hubFetchPorts('+i+',\''+kind+'\',\''+_hubEsc(d.ip||'')+'\',\''+_hubEsc(d.username||'2')+'\')"><i class="ti ti-plug-connected"></i> 세션 연결 · 포트 조회</button>':'')
   +'</div>';
}

async function hubFetchPorts(i,kind,ip,label){
  const box=document.getElementById('hubmp-'+i);
  const btn=document.getElementById('hubmb-'+i);
  if(box) box.innerHTML='<span class="ld"><i class="ti ti-loader-2 hub-spin"></i> 세션 연결·조회 중… (최대 1분)</span>';
  if(btn) btn.disabled=true;
  try{
    let total=0, active=0, ok=false, err='';
    if(kind==='N2X'){
      const r=await fetch('/api/n2x/ports?server='+encodeURIComponent(ip)+'&label='+encodeURIComponent(label||'2'));
      const d=await r.json();
      if(d&&d.ok){ ok=true; (d.modules||[]).forEach(m=>{ (m.portList||[]).forEach(p=>{ total++; if(p.mine||String(p.lock||'0')!=='0') active++; }); }); }
      else err=(d&&d.error)||'조회 실패';
    } else if(kind==='STC'){
      const r=await fetch('/api/stc/reserve/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chassis:ip})});
      const d=await r.json();
      if(d&&d.ok){ ok=true; const ps=d.ports||d.portList||[]; total=ps.length; active=ps.filter(p=>p&&(p.reserved||p.owned||p.mine||/up|active|reserv/i.test(String(p.state||p.status||'')))).length; }
      else err=(d&&d.error)||'조회 실패';
    } else { err='이 계측기는 포트 조회 미지원'; }
    if(box){ box.innerHTML= ok ? ('<span class="dsh-pp">포트 <b>'+total+'</b> · 활성 <b style="color:var(--green)">'+active+'</b></span>') : ('<span class="dsh-pperr">'+_hubEsc(err)+'</span>'); }
  }catch(e){ if(box) box.innerHTML='<span class="err">오류: '+_hubEsc(e.message)+'</span>'; }
  if(btn) btn.disabled=false;
}

function _dshAnimate(){
  document.querySelectorAll('#dash-prod [data-cu]').forEach(function(el){ const to=parseFloat(el.getAttribute('data-cu'))||0; const suf=el.getAttribute('data-suffix')||''; _hubCountUp(el,to,suf); });
  document.querySelectorAll('#dash-prod .dsh-bar-fill').forEach(function(el){ const w=el.getAttribute('data-w')||0; setTimeout(function(){ el.style.width=w+'%'; },60); });
}
function _hubCountUp(el,to,suf){
  let start=null; const dur=900, from=0;
  function step(ts){ if(start==null)start=ts; const p=Math.min(1,(ts-start)/dur); const v=Math.round(from+(to-from)*(1-Math.pow(1-p,3))); el.textContent=v+suf; if(p<1) requestAnimationFrame(step); }
  requestAnimationFrame(step);
}

// ── REQ 관리 ──
let reqFolders=[], reqList=[], selReqId=null, reqCurCat='all';

const DEFAULT_FOLDERS=[
  {id:'f-sys', name:'U-REQ-SYS',  parent:'root', color:'#c48a00'},
  {id:'f-kt',  name:'KT-REQ',     parent:'root', color:'#2d6fd4'},
  {id:'f-lgu', name:'C-REQ-LGU+', parent:'root', color:'var(--green)'},
  {id:'f-ipv4l2', name:'IPv4_L2', parent:'f-sys', color:''},
  {id:'f-qos',    name:'QoS',     parent:'f-sys', color:''},
  {id:'f-epon',   name:'EPON',    parent:'f-sys', color:''},
];

let _reqDataLoadedAt=0;
// 캐시는 딱 한 tick(수 백 ms) 만 — 동일 페이지 여러 서브 렌더가 연속 호출할 때만 스킵.
// 페이지 전환·재진입 시엔 항상 API 재요청 → TC/REQ 변경(추가/삭제/이동)이 즉시 다음 진입에 반영.
const REQ_DATA_CACHE_MS=500;
function invalidateREQDataCache(){ _reqDataLoadedAt=0; }
async function loadREQData(force){
  if(!force && _reqDataLoadedAt && (Date.now()-_reqDataLoadedAt)<REQ_DATA_CACHE_MS) return;
  try{
    const r=await fetch('/api/req', {cache:'no-store'});
    if(!r.ok) throw new Error('API 오류');
    const data=await r.json();
    reqFolders=data.folders||[];
    reqList=data.reqs||[];
    _reqDataLoadedAt=Date.now();
    // localStorage 백업은 '선택적' — 용량 초과(QuotaExceededError) 나도 서버 데이터를 절대 덮어쓰지 않음
    try{
      localStorage.setItem('utop_req_folders',JSON.stringify(reqFolders));
      // 구현내용 HTML 등 큰 필드는 캐시에서 제외해 용량 초과 방지
      const slim=reqList.map(r=>{ const {implementation_html, overview_html, ...rest}=r; return rest; });
      localStorage.setItem('utop_req_list',JSON.stringify(slim));
    } catch(le){
      console.warn('REQ localStorage 캐시 건너뜀(용량 초과):', le&&le.name);
      try{ localStorage.removeItem('utop_req_list'); }catch(_){}
    }
  } catch(e){
    console.warn('REQ API 실패, localStorage fallback:', e);
    const fs=localStorage.getItem('utop_req_folders');
    const rs=localStorage.getItem('utop_req_list');
    reqFolders=fs?JSON.parse(fs):DEFAULT_FOLDERS;
    reqList=rs?JSON.parse(rs):[];
  }
}

async function saveREQData(){
  // 폴더 저장
  try{
    await fetch('/api/folders',{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({folders:reqFolders})});
  } catch(e){}
  // localStorage 백업
  localStorage.setItem('utop_req_folders',JSON.stringify(reqFolders));
  localStorage.setItem('utop_req_list',JSON.stringify(reqList));
}

async function saveOneREQ(r){
  if(!r) return;
  // ★ URL id (DB PK) 는 반드시 r.id 사용. r.reqid 는 사용자 지정 REQ 번호(예: "부팅-001") 라 다를 수 있음.
  //   URL 에 reqid 를 썼다가 DB PK 는 reqid 로, data.id 는 원래 id 로 저장돼 두 row 로 갈라지는 버그가 있었음.
  const rid=r.id||r.reqid;
  if(!rid){ console.warn('saveOneREQ: id 없음', r); return; }
  if(!r.id) r.id=rid;
  if(!r.reqid) r.reqid=rid;
  // 생성자·변경자 자동 스탬프(모든 REQ 저장 경로 공통)
  var _wn=(typeof _whoNow==='function')?_whoNow():'admin';
  if(!r.created_by) r.created_by=_wn;
  r.updated_at=new Date().toISOString().slice(0,10); r.updated_by=_wn;
  try{
    const res=await fetch('/api/req/'+encodeURIComponent(rid),{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(r)});
    if(!res.ok) throw new Error('저장 실패');
  } catch(e){
    console.warn('saveOneREQ API 실패:', e);
  }
  localStorage.setItem('utop_req_list',JSON.stringify(reqList));
  // 트리 카운트 즉시 갱신
  updateREQTreeCounts();
}

async function deleteOneREQ(reqidOrObj){
  // 호출부가 r.reqid (사용자 번호) 를 넘기는 경우가 많으나, 서버 DELETE 는 PK(id) 로 매칭.
  // reqid 로 넘어오면 reqList 에서 실제 id 를 찾아 PK 로 변환한다. 못 찾으면 그대로 전송(호환).
  var pk='';
  try{
    if(reqidOrObj && typeof reqidOrObj==='object'){ pk=reqidOrObj.id||reqidOrObj.reqid||''; }
    else {
      var _key=String(reqidOrObj||'');
      var _r=(typeof reqList!=='undefined'&&Array.isArray(reqList))?reqList.find(function(x){return x&&(x.id===_key||x.reqid===_key);}):null;
      pk=_r?(_r.id||_r.reqid||_key):_key;
    }
  }catch(_e){ pk=String(reqidOrObj||''); }
  if(!pk) return;
  try{
    await fetch('/api/req/'+encodeURIComponent(pk),{method:'DELETE'});
  } catch(e){}
}

// ══════════════════════════════════════════
// 4열 컬럼 리사이즈
// ══════════════════════════════════════════
let _colDrag={active:false,colId:null,startX:0,startW:0,min:0,max:0,moved:false};
function colDragStart(e,colId,min,max){
  const col=document.getElementById(colId);
  _colDrag={active:true,colId,startX:e.clientX,startW:col?col.offsetWidth:200,min,max,moved:false};
  document.body.style.cursor='col-resize';
  document.body.style.userSelect='none';
  e.stopPropagation();
  e.preventDefault();
}
document.addEventListener('mousemove',e=>{
  if(!_colDrag.active) return;
  const dx=e.clientX-_colDrag.startX;
  if(Math.abs(dx)>3) _colDrag.moved=true;
  if(!_colDrag.moved) return;
  const newW=Math.max(_colDrag.min,Math.min(_colDrag.max,_colDrag.startW+dx));
  const col=document.getElementById(_colDrag.colId);
  if(col) col.style.width=newW+'px';
});
document.addEventListener('mouseup',()=>{
  if(_colDrag.active){
    _colDrag.active=false;
    document.body.style.cursor='';
    document.body.style.userSelect='';
    if(_colDrag.moved){
      localStorage.setItem('utop_col_'+_colDrag.colId,document.getElementById(_colDrag.colId)?.offsetWidth);
    }
    _colDrag.moved=false;
  }
});

let _colHidden={};
// ══════════════════════════════════════════
// 4열 TC 목록 렌더링
// ══════════════════════════════════════════
let tc4SelReqId=null, tc4SelFolderId=null, tc4ExpandedIds=new Set();
let selectedReqIds=new Set(), selectedTcIds=new Set();
let expandedReqIds=new Set(); // 폴더뷰 REQ 펼치기

function selectREQItem(id){
  selReqId=id; tc4SelReqId=id; tc4SelFolderId=null;
  document.querySelectorAll('.req-item').forEach(el=>el.classList.toggle('sel',el.dataset.id===id));
  const r=reqList.find(x=>x.id===id);
  if(!r) return;
  renderREQDetail(r);
  const doRender=()=>{
    const tcs=getTC4ForReq(id);
    console.log('[TC4]','REQ:',r.reqid,'r.tc:',JSON.stringify(r.tc?.slice(0,2)),'tcList len:',tcList.length,'결과:',tcs.length);
    renderTC4Table(tcs, r.reqid+' · '+r.title);
  };
  if(tcList.length===0 && (r.tc||[]).length>0){
    loadTCData().then(doRender);
  } else {
    doRender();
  }
}

function selectFolder(folderId){
  tc4SelFolderId=folderId; tc4SelReqId=null; selReqId=null;
  document.querySelectorAll('.req-item').forEach(el=>el.classList.remove('sel'));
  const folder=reqFolders.find(f=>f.id===folderId);
  const stats=getFolderStats(folderId);
  const hdr=document.getElementById('req-doc-hdr-ph');
  const body=document.getElementById('req-doc-body');

  if(hdr) hdr.innerHTML=`<div style="display:flex;align-items:center;gap:8px;width:100%;flex-wrap:wrap;">
    <i class="ti ti-folder-filled" style="color:${folder?.color||'var(--text2)'};" aria-hidden="true"></i>
    <span style="font-size:13px;font-weight:600;color:var(--text);">${folder?.name||'-'}</span>
    <span style="font-size:11px;color:var(--text3);">REQ ${stats.reqCount}개 · SC ${stats.scCount}개 · TC ${stats.tcCount}개</span>
  </div>`;

  if(body) body.innerHTML=`
    <div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin-bottom:8px;padding:6px 8px;background:var(--bg3);border-radius:6px;">
      <span style="font-size:10px;color:var(--text3);">카테고리</span>
      <select id="folder-filter-cat" onchange="renderFolderREQList('${folderId}')" style="font-size:10px;padding:2px 5px;border-radius:5px;border:1px solid var(--border);background:var(--bg2);color:var(--text2);">
        <option value="all">전체</option><option value="L2">L2</option><option value="L3">L3</option>
        <option value="OLT">OLT</option><option value="HGW">HGW</option><option value="CPE">CPE</option><option value="공통">공통</option>
      </select>
      <span style="font-size:10px;color:var(--text3);">우선순위</span>
      <select id="folder-filter-prio" onchange="renderFolderREQList('${folderId}')" style="font-size:10px;padding:2px 5px;border-radius:5px;border:1px solid var(--border);background:var(--bg2);color:var(--text2);">
        <option value="all">전체</option><option value="MUST">MUST</option><option value="SHOULD">SHOULD</option><option value="MAY">MAY</option>
      </select>
      <span style="font-size:10px;color:var(--text3);">상태</span>
      <select id="folder-filter-status" onchange="renderFolderREQList('${folderId}')" style="font-size:10px;padding:2px 5px;border-radius:5px;border:1px solid var(--border);background:var(--bg2);color:var(--text2);">
        <option value="all">전체</option><option value="DRAFT">DRAFT</option><option value="APPROVED">APPROVED</option><option value="DEPRECATED">DEPRECATED</option>
      </select>
    </div>
    <div id="folder-req-list"></div>`;

  renderFolderREQList(folderId);
  const reqs=getReqsInFolder(folderId,true);
  const allTcs=reqs.flatMap(r=>getTC4ForReq(r.id));
  renderTC4Table(allTcs,(folder?.name||'-')+' 전체 TC');
}

function renderFolderREQList(folderId){
  if(!folderId) folderId=tc4SelFolderId;
  if(!folderId){ console.warn('[REQ] folderId 없음'); return; }
  console.log('[REQ] renderFolderREQList folderId:',folderId,'expanded:',expandedReqIds.size);
  const reqs=getReqsInFolder(folderId,true);
  const cat=document.getElementById('folder-filter-cat')?.value||'all';
  const prio=document.getElementById('folder-filter-prio')?.value||'all';
  const status=document.getElementById('folder-filter-status')?.value||'all';
  const prioColor=p=>p==='MUST'?'var(--red)':p==='SHOULD'?'var(--yellow)':'var(--text3)';
  const priBg=p=>p==='MUST'?'rgba(229,62,90,0.08)':p==='SHOULD'?'rgba(196,138,0,0.08)':'var(--bg3)';
  const statusColor=s=>s==='APPROVED'?'var(--green)':s==='DRAFT'?'var(--yellow)':'var(--text3)';
  const staBg=s=>s==='APPROVED'?'rgba(0,168,114,0.08)':s==='DRAFT'?'rgba(196,138,0,0.08)':'var(--bg3)';
  const filtered=reqs.filter(r=>{
    if(cat!=='all'&&!(r.products||[]).includes(cat)) return false;
    if(prio!=='all'&&r.priority!==prio) return false;
    if(status!=='all'&&r.status!==status) return false;
    return true;
  });
  const listEl=document.getElementById('folder-req-list');
  if(!listEl) return;
  if(!filtered.length){
    listEl.innerHTML='<div class="detail-empty"><i class="ti ti-file-description"></i><span>해당 조건의 REQ가 없습니다</span></div>';
    return;
  }
  listEl.innerHTML=`
    <table style="width:100%;border-collapse:collapse;font-size:11px;">
      <thead><tr style="background:var(--bg3);position:sticky;top:0;z-index:1;">
        <th style="width:32px;padding:5px 6px;border-bottom:1px solid var(--border);text-align:center;">
          <input type="checkbox" id="folder-chk-all" onclick="toggleAllFolderREQ(this.checked,'${folderId}')"
            style="cursor:pointer;accent-color:var(--blue);">
        </th>
        <th style="padding:5px 8px;text-align:left;font-size:9px;font-weight:600;color:var(--text2);text-transform:uppercase;border-bottom:1px solid var(--border);">REQ ID</th>
        <th style="padding:5px 8px;text-align:left;font-size:9px;font-weight:600;color:var(--text2);text-transform:uppercase;border-bottom:1px solid var(--border);white-space:nowrap;">우선순위</th>
        <th style="padding:5px 8px;text-align:left;font-size:9px;font-weight:600;color:var(--text2);text-transform:uppercase;border-bottom:1px solid var(--border);">상태</th>
        <th style="padding:5px 8px;text-align:center;font-size:9px;font-weight:600;color:var(--text2);text-transform:uppercase;border-bottom:1px solid var(--border);">SC</th>
        <th style="padding:5px 8px;text-align:center;font-size:9px;font-weight:600;color:var(--text2);text-transform:uppercase;border-bottom:1px solid var(--border);">TC</th>
        <th style="width:32px;border-bottom:1px solid var(--border);"></th>
      </tr></thead>
      <tbody>${filtered.map(r=>{
        let scCount=0;
        try{ const scs=JSON.parse(r.scenarios||'[]'); scCount=Array.isArray(scs)?scs.length:0; }catch(e){}
        const chk=selectedReqIds.has(r.id);
        const expanded=expandedReqIds.has(r.id);
        return `
        <tr id="folder-req-row-${r.id}" style="border-bottom:1px solid var(--border);background:${chk?'rgba(45,111,212,0.06)':selReqId===r.id?'rgba(45,111,212,0.08)':''};">
          <td style="padding:5px 6px;text-align:center;" onclick="event.stopPropagation()">
            <input type="checkbox" ${chk?'checked':''} onclick="toggleReqSelect('${r.id}',this.checked);updateFolderBulkBar()"
              style="cursor:pointer;accent-color:var(--blue);">
          </td>
          <td style="padding:5px 8px;font-family:monospace;font-size:10px;white-space:nowrap;color:var(--text2);">
            <span onclick="selectREQItem('${r.id}')"
              style="cursor:pointer;color:var(--blue);text-decoration:underline;text-underline-offset:2px;"
              title="클릭하면 3열에서 REQ 상세 보기">${r.reqid}</span>
            <span onclick="toggleFolderREQ('${r.id}')"
              style="cursor:pointer;color:var(--text3);margin-left:4px;font-size:11px;"
              title="펼치기/접기">${expanded?'▼':'▶'}</span>
          </td>
          <td style="padding:4px 8px;" onclick="event.stopPropagation()">
            <select style="font-size:10px;padding:1px 6px;border-radius:20px;font-weight:600;border:1px solid ${r.priority==='MUST'?'rgba(229,62,90,0.3)':r.priority==='SHOULD'?'rgba(196,138,0,0.3)':'var(--border)'};background:${priBg(r.priority)};color:${prioColor(r.priority)};outline:none;cursor:pointer;"
              onchange="inlineUpdateREQ('${r.id}','priority',this.value);renderFolderREQList('${folderId}')">
              <option ${r.priority==='MUST'?'selected':''}>MUST</option>
              <option ${r.priority==='SHOULD'?'selected':''}>SHOULD</option>
              <option ${r.priority==='MAY'?'selected':''}>MAY</option>
            </select>
          </td>
          <td style="padding:4px 8px;" onclick="event.stopPropagation()">
            <select style="font-size:10px;padding:1px 6px;border-radius:20px;font-weight:600;border:1px solid ${r.status==='APPROVED'?'rgba(0,168,114,0.3)':r.status==='DRAFT'?'rgba(196,138,0,0.3)':'var(--border)'};background:${staBg(r.status)};color:${statusColor(r.status)};outline:none;cursor:pointer;"
              onchange="inlineUpdateREQ('${r.id}','status',this.value);renderFolderREQList('${folderId}')">
              <option ${r.status==='DRAFT'?'selected':''}>DRAFT</option>
              <option ${r.status==='APPROVED'?'selected':''}>APPROVED</option>
              <option ${r.status==='DEPRECATED'?'selected':''}>DEPRECATED</option>
            </select>
          </td>
          <td style="padding:5px 8px;text-align:center;font-weight:600;color:${scCount>0?'var(--text2)':'var(--text3)'};">${scCount}</td>
          <td style="padding:5px 8px;text-align:center;font-weight:600;color:${(r.tc||[]).length>0?'var(--blue)':'var(--text3)'};">${(r.tc||[]).length}</td>
          <td style="padding:4px 6px;text-align:center;" onclick="event.stopPropagation()">
            <button onclick="deleteREQ('${r.id}')"
              style="background:none;border:none;cursor:pointer;color:var(--text3);padding:2px 4px;border-radius:4px;"
              onmouseenter="this.style.color='var(--red)';this.style.background='rgba(229,62,90,0.08)'"
              onmouseleave="this.style.color='var(--text3)';this.style.background='none'"
              title="REQ 삭제">
              <i class="ti ti-trash" style="font-size:13px;" aria-hidden="true"></i>
            </button>
          </td>
        </tr>
        `; }).join('')}
      </tbody>
    </table>
    <!-- 다중 삭제 바 -->
    <div id="folder-bulk-bar" style="${selectedReqIds.size>0?'':'display:none;'}padding:6px 10px;border-top:1px solid var(--border);background:var(--bg3);align-items:center;gap:6px;">
      <i class="ti ti-checkbox" style="font-size:13px;color:var(--text3);" aria-hidden="true"></i>
      <span id="folder-sel-count" style="font-size:11px;font-weight:600;color:var(--text2);flex:1;">${selectedReqIds.size}개 선택됨</span>
      <button onclick="bulkDeleteREQ()" style="font-size:10px;padding:3px 10px;border-radius:5px;border:1px solid rgba(229,62,90,0.5);background:rgba(229,62,90,0.12);color:var(--red);cursor:pointer;font-weight:500;">
        <i class="ti ti-trash" style="font-size:11px;" aria-hidden="true"></i> 삭제
      </button>
      <button onclick="clearReqSelection();renderFolderREQList('${folderId}')" style="font-size:10px;padding:3px 8px;border-radius:5px;border:1px solid var(--border);background:var(--bg3);color:var(--text3);cursor:pointer;">취소</button>
    </div>`;
}

function getTC4ForReq(reqId){
  const r=reqList.find(x=>x.id===reqId);
  if(!r) return [];
  const refs=r.tc||[];
  if(refs.length===0){
    return tcList.filter(t=>t.req_id===reqId||t.req_id===r.reqid||t.req_id===r.id).map(t=>({...t,_req:r}));
  }
  // REQ의 tc 참조 배열을 기반으로, tcList에 풀 데이터가 있으면 병합
  return refs.map(ref=>{
    const full=tcList.find(t=>t.tcid===ref.tcid);
    if(full) return {...full,_req:r};
    // tcList에 없으면 ref 자체를 TC로 사용 (tcid, name, status, type, kind 포함)
    return {
      tcid: ref.tcid||'',
      name: ref.name||'이름 없음',
      status: ref.status||'대기',
      type: ref.type||'FT',
      kind: ref.kind||'자체',
      steps: ref.steps||[],
      precondition: ref.precondition||'',
      overview: ref.overview||'',
      history: ref.history||[],
      _req: r
    };
  });
}

function renderTC4Table(tcs, title){
  const body=document.getElementById('tc4-body');
  const titleEl=document.getElementById('tc4-title');
  const statsEl=document.getElementById('tc4-stats');
  if(!body){
    // 새 REQ2 UI: 현재 열린 REQ의 TC 탭 갱신
    if(tc4SelReqId){
      const tabContent=document.getElementById('req2-tabcontent-'+tc4SelReqId);
      if(tabContent&&window['req2ActiveTab_'+tc4SelReqId]==='tc'){
        const r=reqList.find(x=>x.id===tc4SelReqId);
        if(r) tabContent.innerHTML=req2TabTC(r);
      }
    }
    return;
  }
  console.log('[TC4] renderTC4Table 호출 - TC수:',tcs?.length,'제목:',title);

  if(titleEl) titleEl.textContent=title||'TC 목록';
  const ft=document.getElementById('tc4-filter-type')?.value||'all';
  const fk=document.getElementById('tc4-filter-kind')?.value||'all';
  // 구 타입값 매핑 (FT→Function, PT→Performance, ST→Maintenance)
  const typeCompat={FT:'Function',PT:'Performance',ST:'Maintenance'};
  const filtered=tcs.filter(t=>{
    if(ft!=='all'){
      const tType=typeCompat[t.type]||t.type||'Function';
      if(tType!==ft) return false;
    }
    if(fk!=='all'&&(t.kind||'자체')!==fk) return false;
    return true;
  });

  if(!filtered.length){
    const hasTC=(tcs||[]).length>0;
    body.innerHTML=`<div class="detail-empty"><i class="ti ti-clipboard-list"></i><span>${hasTC?'필터 조건에 맞는 TC가 없습니다':'TC가 없습니다. TC 추가 버튼을 눌러 추가하세요.'}</span></div>`;
    return;
  }

  body.innerHTML=`<table style="width:100%;border-collapse:collapse;font-size:11px;">
    <thead>
      <tr style="background:var(--bg3);position:sticky;top:0;z-index:1;">
        <th style="width:28px;padding:5px 4px;border-bottom:1px solid var(--border);text-align:center;">
          <input type="checkbox" id="tc4-chk-all" onclick="toggleAllTC(this.checked)"
            style="cursor:pointer;accent-color:var(--blue);">
        </th>
        <th style="padding:5px 6px;text-align:left;font-size:9px;font-weight:600;color:var(--text2);text-transform:uppercase;border-bottom:1px solid var(--border);white-space:nowrap;">TC ID</th>
        <th style="padding:5px 6px;text-align:left;font-size:9px;font-weight:600;color:var(--text2);text-transform:uppercase;border-bottom:1px solid var(--border);">TC Summary</th>
        <th style="padding:5px 6px;text-align:left;font-size:9px;font-weight:600;color:var(--text2);text-transform:uppercase;border-bottom:1px solid var(--border);">타입</th>
        <th style="padding:5px 6px;text-align:left;font-size:9px;font-weight:600;color:var(--text2);text-transform:uppercase;border-bottom:1px solid var(--border);">구분</th>
        <th style="width:28px;border-bottom:1px solid var(--border);"></th>
      </tr>
    </thead>
    <tbody id="tc4-tbody">
      ${filtered.map(t=>renderTC4Row(t)).join('')}
    </tbody>
  </table>
  <div id="tc4-bulk-bar" style="${selectedTcIds.size>0?'':'display:none;'}padding:6px 10px;border-top:1px solid var(--border);background:var(--bg3);display:flex;align-items:center;gap:6px;">
    <span style="font-size:10px;color:var(--text3);flex:1;"><b style="color:var(--blue);">${selectedTcIds.size}</b>개 선택됨</span>
    <button onclick="bulkDeleteTC()" style="font-size:10px;padding:2px 10px;border-radius:5px;border:1px solid rgba(229,62,90,0.4);background:rgba(229,62,90,0.08);color:var(--red);cursor:pointer;">
      <i class="ti ti-trash" style="font-size:11px;" aria-hidden="true"></i> 선택 삭제
    </button>
    <button onclick="clearTcSelection()" style="font-size:10px;padding:2px 8px;border-radius:5px;border:1px solid var(--border);background:transparent;color:var(--text3);cursor:pointer;">취소</button>
  </div>`;
}

function renderTC4Row(t){
  const expanded=tc4ExpandedIds.has(t.tcid);
  const r=t._req||{};

  return `<tr id="tc4-row-${t.tcid}" style="border-bottom:1px solid var(--border);background:${expanded?'rgba(45,111,212,0.04)':selectedTcIds.has(t.tcid)?'rgba(229,62,90,0.04)':''};">
    <td style="padding:5px 4px;text-align:center;width:28px;" onclick="event.stopPropagation()">
      <input type="checkbox" ${selectedTcIds.has(t.tcid)?'checked':''} onclick="toggleTcSelect('${t.tcid}',this.checked)"
        style="cursor:pointer;accent-color:var(--blue);">
    </td>
    <td style="padding:5px 6px;font-family:monospace;font-size:10px;color:var(--blue);white-space:nowrap;cursor:pointer;text-decoration:underline;text-underline-offset:2px;"
      onclick="tc4ToggleExpand('${t.tcid}',event)"
      title="클릭하면 상세 내역 펼치기">${t.tcid||'-'} ${expanded?'▼':'▶'}${(t.steps&&t.steps.length)?`<span title="절차(Step) ${t.steps.length}개" style="text-decoration:none;display:inline-block;margin-left:5px;background:rgba(45,111,212,0.1);color:var(--blue);border-radius:10px;padding:0 6px;font-size:9px;font-weight:700;vertical-align:middle;">${t.steps.length}</span>`:''}</td>
    <td style="padding:3px 6px;font-size:11px;font-weight:500;color:var(--text);min-width:120px;">
      <div id="tc-name-view-${t.tcid}"
        style="padding:2px 4px;border-radius:4px;border:1px solid transparent;cursor:text;transition:all 0.15s;"
        onclick="event.stopPropagation();startEditTCName('${t.tcid}')"
        title="클릭하면 이름 수정">${t.name||'-'}</div>
      <input id="tc-name-input-${t.tcid}" value="${(t.name||'').replace(/"/g,'&quot;')}"
        style="display:none;width:100%;font-size:11px;font-weight:500;padding:2px 4px;border-radius:4px;border:1px solid var(--green);background:rgba(0,168,114,0.05);color:var(--text);outline:none;"
        onblur="saveTCName('${t.tcid}',this.value)"
        onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape'){document.getElementById('tc-name-view-${t.tcid}').style.display='';this.style.display='none';}"
        onclick="event.stopPropagation()">
    </td>
    <td style="padding:5px 6px;" onclick="event.stopPropagation()">
      <select style="font-size:9px;padding:1px 4px;border-radius:8px;border:1px solid rgba(45,111,212,0.3);background:rgba(45,111,212,0.08);color:var(--blue);outline:none;cursor:pointer;"
        onchange="updateTCField('${t.tcid}','type',this.value)">
        ${(()=>{const cur=({'FT':'Function','PT':'Performance','ST':'Maintenance'})[t.type]||t.type||'Function';return ['Protocol','Function','Performance','Security','Management','Maintenance'].map(tp=>`<option ${cur===tp?'selected':''}>${tp}</option>`).join('');})()}
      </select>
    </td>
    <td style="padding:5px 6px;" onclick="event.stopPropagation()">
      <select style="font-size:9px;padding:1px 4px;border-radius:8px;border:1px solid ${t.kind==='장애'?'rgba(229,62,90,0.3)':'rgba(45,111,212,0.3)'};background:${t.kind==='장애'?'rgba(229,62,90,0.08)':'rgba(45,111,212,0.08)'};color:${t.kind==='장애'?'var(--red)':'var(--blue)'};outline:none;cursor:pointer;"
        onchange="updateTCField('${t.tcid}','kind',this.value)">
        <option ${(t.kind||'자체')==='자체'?'selected':''}>자체</option>
        <option ${t.kind==='장애'?'selected':''}>장애</option>
      </select>
    </td>
    <td style="padding:5px 4px;text-align:center;width:54px;white-space:nowrap;" onclick="event.stopPropagation()">
      <button onclick="exportTCPDF('${t.tcid}')"
        style="background:none;border:none;cursor:pointer;color:var(--text3);padding:2px 4px;border-radius:4px;transition:all 0.15s;"
        onmouseenter="this.style.color='var(--blue)';this.style.background='rgba(45,111,212,0.08)'"
        onmouseleave="this.style.color='var(--text3)';this.style.background='none'"
        title="TC PDF 출력">
        <i class="ti ti-printer" style="font-size:13px;" aria-hidden="true"></i>
      </button>
      <button onclick="deleteTC4('${t.tcid}')"
        style="background:none;border:none;cursor:pointer;color:var(--text3);padding:2px 4px;border-radius:4px;transition:all 0.15s;"
        onmouseenter="this.style.color='var(--red)';this.style.background='rgba(229,62,90,0.08)'"
        onmouseleave="this.style.color='var(--text3)';this.style.background='none'"
        title="TC 삭제">
        <i class="ti ti-trash" style="font-size:13px;" aria-hidden="true"></i>
      </button>
    </td>
  ${expanded?renderTC4Detail(t):`<tr id="tc4-detail-${t.tcid}" style="display:none;"><td colspan="6"></td></tr>`}`;
}

function renderTC4Detail(t){
  const steps=t.steps||[];
  const sc=s=>s==='PASS'?'var(--green)':s==='FAIL'?'var(--red)':'var(--text3)';
  const sb=s=>s==='PASS'?'rgba(0,168,114,0.08)':s==='FAIL'?'rgba(229,62,90,0.08)':'var(--bg3)';

  // 토폴로지 에디터 (안전하게)
  let topoHtml='<div style="padding:10px;font-size:11px;color:var(--text3);text-align:center;">구성도 없음 - LLM 또는 REQ 참조</div>';
  try{ topoHtml=renderTopoEditor({id:'tc-'+t.tcid, topo:t.topo||''}); } catch(e){ console.warn('TC topo render 오류:',e); }
  const stepsHtml=steps.length?steps.map((s,i)=>`
    <div id="tc-step-${t.tcid}-${i}" style="display:flex;align-items:flex-start;gap:8px;padding:5px 0;border-bottom:0.5px solid var(--border);">
      <div style="width:18px;height:18px;border-radius:50%;background:rgba(45,111,212,0.1);color:var(--blue);font-size:9px;font-weight:600;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;">${i+1}</div>
      <div style="flex:1;">
        <div contenteditable="true" style="font-size:11px;font-weight:500;color:var(--text);outline:none;border-bottom:1px solid transparent;padding:1px 2px;transition:all 0.15s;"
          onblur="saveTCStep('${t.tcid}',${i},'desc',this.innerText)"
          onfocus="this.style.borderBottomColor='var(--green)';this.style.color='var(--green)'"
          onblurCapture="this.style.borderBottomColor='transparent';this.style.color=''"
        >${s.desc||'절차 설명'}</div>
        <div contenteditable="true" style="font-family:monospace;font-size:10px;color:var(--blue);background:rgba(45,111,212,0.05);padding:2px 6px;border-radius:4px;margin:2px 0;outline:none;min-height:18px;"
          onblur="saveTCStep('${t.tcid}',${i},'input',this.innerText)"
        >${s.input||'입력/CLI'}</div>
        <div contenteditable="true" style="font-size:10px;color:var(--text2);outline:none;border-bottom:1px solid transparent;padding:1px 2px;transition:all 0.15s;"
          onblur="saveTCStep('${t.tcid}',${i},'expected',this.innerText)"
          onfocus="this.style.borderBottomColor='var(--green)'"
          onblurCapture="this.style.borderBottomColor='transparent'"
        >→ ${s.expected||'기대결과'}</div>
      </div>
      <button onclick="event.stopPropagation();deleteTCStep('${t.tcid}',${i})"
        style="font-size:10px;padding:1px 5px;border-radius:4px;border:1px solid var(--border);background:transparent;color:var(--red);cursor:pointer;flex-shrink:0;"><i class="ti ti-x" style="font-size:10px;" aria-hidden="true"></i></button>
    </div>`).join('')
    :`<div style="font-size:11px;color:var(--text3);padding:6px 0;text-align:center;">절차가 없습니다</div>`;

  const history=(t.history||[]).slice(-5).reverse();
  const historyHtml=history.length?history.map(h=>`
    <div style="display:flex;gap:8px;font-size:10px;padding:3px 0;border-bottom:0.5px solid var(--border);">
      <span style="color:var(--text3);flex-shrink:0;">${h.date||''}</span>
      <span style="color:var(--text3);flex-shrink:0;">${h.version||''}</span>
      <span style="font-size:9px;padding:1px 5px;border-radius:8px;background:${sb(h.status)};color:${sc(h.status)};flex-shrink:0;">${h.status}</span>
      <span style="color:var(--text3);">${h.owner||''}</span>
      ${h.memo?`<span style="color:var(--text3);">${h.memo}</span>`:''}
    </div>`).join('')
    :`<div style="font-size:10px;color:var(--text3);padding:4px 0;">실행 이력 없음</div>`;

  // 계측기 목록
  const meters=(devices||[]).filter(d=>d.group==='계측기'||d.type==='meter'||d.group?.includes('계측'));

  return `<tr id="tc4-detail-${t.tcid}">
    <td colspan="6" style="padding:0;border-bottom:2px solid var(--border);">
      <div style="padding:8px 12px 10px 36px;background:rgba(45,111,212,0.02);">

        <!-- TC 기본정보 카드 -->
        <div style="background:var(--bg3);border-radius:8px;padding:10px 14px;margin-bottom:8px;border:0.5px solid var(--border);">
          <!-- 1행: TC ID | 타입 | 구분 -->
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;border-bottom:1px solid var(--border);padding-bottom:8px;margin-bottom:8px;">
            <div style="display:flex;flex-direction:column;gap:2px;flex:1;min-width:140px;">
              <div style="font-size:9px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">TC ID</div>
              <span style="font-family:monospace;font-size:11px;font-weight:600;color:var(--text);">${t.tcid}</span>
            </div>
            <div style="width:1px;height:28px;background:var(--border);flex-shrink:0;"></div>
            <div style="display:flex;flex-direction:column;gap:2px;flex-shrink:0;">
              <div style="font-size:9px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">타입</div>
              <select style="font-size:10px;padding:2px 8px;border-radius:20px;border:1px solid rgba(45,111,212,0.3);background:rgba(45,111,212,0.08);color:var(--blue);outline:none;cursor:pointer;"
                onchange="updateTCField('${t.tcid}','type',this.value)" onclick="event.stopPropagation()">
                ${(()=>{const cur=({'FT':'Function','PT':'Performance','ST':'Maintenance'})[t.type]||t.type||'Function';return ['Protocol','Function','Performance','Security','Management','Maintenance'].map(tp=>`<option ${cur===tp?'selected':''}>${tp}</option>`).join('');})()}
              </select>
            </div>
            <div style="width:1px;height:28px;background:var(--border);flex-shrink:0;"></div>
            <div style="display:flex;flex-direction:column;gap:2px;flex-shrink:0;">
              <div style="font-size:9px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">구분</div>
              <select style="font-size:10px;padding:2px 8px;border-radius:20px;border:1px solid ${t.kind==='장애'?'rgba(229,62,90,0.3)':'rgba(45,111,212,0.3)'};background:${t.kind==='장애'?'rgba(229,62,90,0.08)':'rgba(45,111,212,0.08)'};color:${t.kind==='장애'?'var(--red)':'var(--blue)'};outline:none;cursor:pointer;"
                onchange="updateTCField('${t.tcid}','kind',this.value)" onclick="event.stopPropagation()">
                <option ${(t.kind||'자체')==='자체'?'selected':''}>자체</option>
                <option ${t.kind==='장애'?'selected':''}>장애</option>
              </select>
            </div>
          </div>
          <!-- 2행: 적용 대상 -->
          <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
            <span style="font-size:9px;color:var(--text3);font-weight:600;text-transform:uppercase;flex-shrink:0;">적용 대상</span>
            ${['L2','L3','OLT','HGW','CPE','ONT','공통'].map(p=>{
              const on=(t.products||(t._req?.products)||[]).includes(p);
              return `<div id="tc-prod-${t.tcid}-${p}" style="font-size:10px;padding:2px 8px;border-radius:20px;border:1px solid ${on?'rgba(45,111,212,0.4)':'var(--border)'};background:${on?'rgba(45,111,212,0.08)':'transparent'};color:${on?'var(--blue)':'var(--text3)'};cursor:pointer;user-select:none;"
                onclick="event.stopPropagation();toggleTCProduct('${t.tcid}','${p}')">${p}</div>`;
            }).join('')}
          </div>
        </div>

        <!-- 개요 -->
        <div style="border:0.5px solid var(--border);border-radius:6px;overflow:hidden;margin-bottom:6px;">
          <div style="padding:4px 8px;background:var(--bg3);font-size:10px;font-weight:500;color:var(--text2);display:flex;align-items:center;gap:4px;">
            <i class="ti ti-file-text" style="font-size:11px;" aria-hidden="true"></i> 개요
            <span id="tc-llm-notice-${t.tcid}-overview" style="font-size:9px;margin-left:2px;"></span>
            <button onclick="event.stopPropagation();llmGenTCField('${t.tcid}','overview')"
              style="margin-left:auto;font-size:9px;padding:1px 5px;border-radius:4px;border:1px solid rgba(157,123,255,0.35);background:rgba(157,123,255,0.08);color:#9d7bff;cursor:pointer;">
              <i class="ti ti-sparkles" style="font-size:9px;" aria-hidden="true"></i> LLM</button>
          </div>
          <div contenteditable="true" id="tc-overview-${t.tcid}"
            style="padding:6px 8px;font-size:11px;color:var(--text2);line-height:1.6;outline:none;min-height:30px;border-left:2px solid transparent;transition:all 0.15s;"
            onblur="saveTCField('${t.tcid}','overview',this.innerText);this.style.borderLeftColor='transparent';this.style.background='';"
            onfocus="this.style.borderLeftColor='var(--green)';this.style.background='rgba(0,168,114,0.03)';"
          >${t.overview||'개요를 입력하세요'}</div>
        </div>

        <!-- 구성도 -->
        <div style="border:0.5px solid var(--border);border-radius:6px;overflow:hidden;margin-bottom:6px;">
          <div style="padding:4px 8px;background:var(--bg3);font-size:10px;font-weight:500;color:var(--text2);display:flex;align-items:center;gap:4px;">
            <i class="ti ti-topology-star" style="font-size:11px;" aria-hidden="true"></i> 시험 구성도
            <span id="tc-llm-notice-${t.tcid}-topo" style="font-size:9px;margin-left:2px;"></span>
            <div style="margin-left:auto;display:flex;gap:4px;">
              <button onclick="event.stopPropagation();llmGenTCTopo('${t.tcid}')"
                style="font-size:9px;padding:1px 5px;border-radius:4px;border:1px solid rgba(157,123,255,0.35);background:rgba(157,123,255,0.08);color:#9d7bff;cursor:pointer;">
                <i class="ti ti-sparkles" style="font-size:9px;" aria-hidden="true"></i> LLM</button>
              <button onclick="event.stopPropagation();tcTopoSave('${t.tcid}')"
                style="font-size:9px;padding:1px 5px;border-radius:4px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;">
                <i class="ti ti-device-floppy" style="font-size:9px;" aria-hidden="true"></i></button>
              <button onclick="event.stopPropagation();tcTopoClear('${t.tcid}')"
                style="font-size:9px;padding:1px 5px;border-radius:4px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;">
                <i class="ti ti-refresh" style="font-size:9px;" aria-hidden="true"></i></button>
            </div>
          </div>
          <div style="height:300px;display:flex;overflow:hidden;" onclick="event.stopPropagation()">
            ${topoHtml}
          </div>
        </div>

        <!-- Traffic Generator -->
        <div style="border:0.5px solid var(--border);border-radius:6px;overflow:hidden;margin-bottom:6px;">
          <div style="padding:4px 8px;background:var(--bg3);font-size:10px;font-weight:500;color:var(--text2);display:flex;align-items:center;gap:4px;">
            <i class="ti ti-device-analytics" style="font-size:11px;" aria-hidden="true"></i> Traffic Generator
          </div>
          <div style="padding:8px 10px;display:flex;flex-direction:column;gap:10px;" onclick="event.stopPropagation()">
            <!-- 샤시 -->
            <div>
              <div style="font-size:9px;color:var(--blue);font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;display:flex;align-items:center;gap:4px;"><i class="ti ti-server-2" style="font-size:10px;" aria-hidden="true"></i> 샤시</div>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
                <div>
                  <div style="font-size:9px;color:var(--text3);font-weight:600;margin-bottom:2px;">Vendor</div>
                  <select style="width:100%;font-size:10px;padding:3px 6px;border-radius:4px;border:1px solid var(--border);background:var(--bg3);color:var(--text);outline:none;"
                    onchange="saveTCField('${t.tcid}','meter_vendor',this.value)">
                    <option value="">미지정</option>
                    ${['IXIA N2X','IxNetworks','SpirentTC'].map(v=>`<option value="${v}" ${t.meter_vendor===v?'selected':''}>${v}</option>`).join('')}
                  </select>
                </div>
                <div>
                  <div style="font-size:9px;color:var(--text3);font-weight:600;margin-bottom:2px;">IP Address</div>
                  <input value="${t.meter_ip||''}" placeholder="192.168.1.100"
                    style="width:100%;font-size:10px;padding:3px 6px;border-radius:4px;border:1px solid var(--border);background:var(--bg3);color:var(--text);outline:none;font-family:monospace;"
                    onblur="saveTCField('${t.tcid}','meter_ip',this.value)">
                </div>
                <div>
                  <div style="font-size:9px;color:var(--text3);font-weight:600;margin-bottom:2px;">Port Reserved</div>
                  <input value="${t.meter_port||''}" placeholder="ex) P1↔P2, 1G/10G"
                    style="width:100%;font-size:10px;padding:3px 6px;border-radius:4px;border:1px solid var(--border);background:var(--bg3);color:var(--text);outline:none;"
                    onblur="saveTCField('${t.tcid}','meter_port',this.value)">
                </div>
              </div>
            </div>
            <!-- 트래픽 -->
            <div>
              <div style="font-size:9px;color:var(--blue);font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;display:flex;align-items:center;gap:4px;"><i class="ti ti-arrows-exchange" style="font-size:10px;" aria-hidden="true"></i> 트래픽</div>
              <!-- MAC: Src | Dst -->
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px;">
                <div>
                  <div style="font-size:9px;color:var(--text3);font-weight:600;margin-bottom:2px;">Src Mac</div>
                  <input value="${t.meter_src_mac||''}" placeholder="00:00:00:00:00:01"
                    style="width:100%;font-size:10px;padding:2px 5px;border-radius:4px;border:1px solid var(--border);background:var(--bg3);color:var(--text);outline:none;font-family:monospace;"
                    onblur="saveTCField('${t.tcid}','meter_src_mac',this.value)">
                </div>
                <div>
                  <div style="font-size:9px;color:var(--text3);font-weight:600;margin-bottom:2px;">Dst Mac</div>
                  <input value="${t.meter_dst_mac||''}" placeholder="00:00:00:00:00:02"
                    style="width:100%;font-size:10px;padding:2px 5px;border-radius:4px;border:1px solid var(--border);background:var(--bg3);color:var(--text);outline:none;font-family:monospace;"
                    onblur="saveTCField('${t.tcid}','meter_dst_mac',this.value)">
                </div>
              </div>
              <!-- IP: Src | Dst | Gateway -->
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
                <div>
                  <div style="font-size:9px;color:var(--text3);font-weight:600;margin-bottom:2px;">Src IP</div>
                  <input value="${t.meter_src_ip||''}" placeholder="192.168.10.1"
                    style="width:100%;font-size:10px;padding:2px 5px;border-radius:4px;border:1px solid var(--border);background:var(--bg3);color:var(--text);outline:none;font-family:monospace;"
                    onblur="saveTCField('${t.tcid}','meter_src_ip',this.value)">
                </div>
                <div>
                  <div style="font-size:9px;color:var(--text3);font-weight:600;margin-bottom:2px;">Dst IP</div>
                  <input value="${t.meter_dst_ip||''}" placeholder="192.168.20.1"
                    style="width:100%;font-size:10px;padding:2px 5px;border-radius:4px;border:1px solid var(--border);background:var(--bg3);color:var(--text);outline:none;font-family:monospace;"
                    onblur="saveTCField('${t.tcid}','meter_dst_ip',this.value)">
                </div>
                <div>
                  <div style="font-size:9px;color:var(--text3);font-weight:600;margin-bottom:2px;">Gateway IP</div>
                  <input value="${t.meter_gw||''}" placeholder="192.168.10.254"
                    style="width:100%;font-size:10px;padding:2px 5px;border-radius:4px;border:1px solid var(--border);background:var(--bg3);color:var(--text);outline:none;font-family:monospace;"
                    onblur="saveTCField('${t.tcid}','meter_gw',this.value)">
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Object -->
        <div style="border:0.5px solid var(--border);border-radius:6px;overflow:hidden;margin-bottom:6px;">
          <div style="padding:4px 8px;background:var(--bg3);font-size:10px;font-weight:500;color:var(--text2);display:flex;align-items:center;gap:4px;">
            <i class="ti ti-target" style="font-size:11px;" aria-hidden="true"></i> Object (시험 목적/사전조건)
            <span id="tc-llm-notice-${t.tcid}-object" style="font-size:9px;margin-left:2px;"></span>
            <button onclick="event.stopPropagation();llmGenTCField('${t.tcid}','object')"
              style="margin-left:auto;font-size:9px;padding:1px 5px;border-radius:4px;border:1px solid rgba(157,123,255,0.35);background:rgba(157,123,255,0.08);color:#9d7bff;cursor:pointer;">
              <i class="ti ti-sparkles" style="font-size:9px;" aria-hidden="true"></i> LLM</button>
          </div>
          <div contenteditable="true" id="tc-object-${t.tcid}"
            style="padding:6px 8px;font-size:11px;color:var(--text2);line-height:1.6;outline:none;min-height:30px;border-left:2px solid transparent;transition:all 0.15s;"
            onblur="saveTCField('${t.tcid}','precondition',this.innerText);this.style.borderLeftColor='transparent';this.style.background='';"
            onfocus="this.style.borderLeftColor='var(--green)';this.style.background='rgba(0,168,114,0.03)';"
          >${t.precondition||'시험 목적 및 사전조건을 입력하세요'}</div>
        </div>

        <!-- 절차 -->
        <div style="border:0.5px solid var(--border);border-radius:6px;overflow:hidden;margin-bottom:6px;">
          <div style="padding:4px 8px;background:var(--bg3);font-size:10px;font-weight:500;color:var(--text2);display:flex;align-items:center;gap:4px;">
            <i class="ti ti-list-numbers" style="font-size:11px;" aria-hidden="true"></i> 절차
            <span style="font-size:9px;color:var(--text3);">${steps.length}개</span>
            <span id="tc-llm-notice-${t.tcid}-steps" style="font-size:9px;margin-left:2px;"></span>
            <button onclick="event.stopPropagation();llmGenTCField('${t.tcid}','steps')"
              style="font-size:9px;padding:1px 5px;border-radius:4px;border:1px solid rgba(157,123,255,0.35);background:rgba(157,123,255,0.08);color:#9d7bff;cursor:pointer;">
              <i class="ti ti-sparkles" style="font-size:9px;" aria-hidden="true"></i> LLM</button>
            <button onclick="event.stopPropagation();addTCStep4('${t.tcid}')"
              style="font-size:9px;padding:1px 6px;border-radius:4px;border:1px solid var(--border);background:transparent;color:var(--blue);cursor:pointer;margin-left:auto;">
              <i class="ti ti-plus" style="font-size:9px;" aria-hidden="true"></i> Step 추가</button>
          </div>
          <div style="padding:4px 8px;" id="tc-steps-${t.tcid}">${stepsHtml}</div>
        </div>

        <!-- 실행 결과 이력 -->
        <div style="border:0.5px solid var(--border);border-radius:6px;overflow:hidden;">
          <div style="padding:4px 8px;background:var(--bg3);font-size:10px;font-weight:500;color:var(--text2);display:flex;align-items:center;gap:4px;">
            <i class="ti ti-history" style="font-size:11px;" aria-hidden="true"></i> 실행 결과 이력
          </div>
          <div style="padding:4px 8px;">${historyHtml}</div>
        </div>

      </div>
    </td>
  </tr>`;
}

function tc4ToggleExpand(tcid, e){
  if(['BUTTON','SELECT','INPUT','TEXTAREA'].includes(e.target.tagName)) return;
  if(tc4ExpandedIds.has(tcid)) tc4ExpandedIds.delete(tcid);
  else tc4ExpandedIds.add(tcid);
  if(tc4SelReqId){
    const tcs=getTC4ForReq(tc4SelReqId);
    const r=reqList.find(x=>x.id===tc4SelReqId);
    renderTC4Table(tcs,(r?.reqid||'')+' · '+(r?.title||''));
  } else if(tc4SelFolderId){
    const reqs=getReqsInFolder(tc4SelFolderId,true);
    const allTcs=reqs.flatMap(r=>getTC4ForReq(r.id));
    const folder=reqFolders.find(f=>f.id===tc4SelFolderId);
    renderTC4Table(allTcs,(folder?.name||'-')+' 전체 TC');
  }
  if(tc4ExpandedIds.has(tcid)){
    const tc=tcList.find(t=>t.tcid===tcid);
    if(tc?.topo) setTimeout(()=>topoRestore('tc-'+tcid),80);
  }
}

function renderTC4List(){
  const body=document.getElementById('tc4-body');
  if(!body) return;
  if(tc4SelReqId){
    const r=reqList.find(x=>x.id===tc4SelReqId);
    const tcs=getTC4ForReq(tc4SelReqId);
    renderTC4Table(tcs,(r?.reqid||'')+' · '+(r?.title||''));
  } else if(tc4SelFolderId){
    const folder=reqFolders.find(f=>f.id===tc4SelFolderId);
    const reqs=getReqsInFolder(tc4SelFolderId,true);
    const allTcs=reqs.flatMap(r=>getTC4ForReq(r.id));
    renderTC4Table(allTcs,(folder?.name||'-')+' 전체 TC');
  }
}

function openNewTC4(){
  if(!tc4SelReqId){ showToast('REQ를 먼저 선택하세요.'); return; }
  const r=reqList.find(x=>x.id===tc4SelReqId);
  if(!r) return;
  const _seq=String(_nextSeqFor((r.reqid||'REQ').replace(/-\d{3}$/,''),'-TC-','tc')).padStart(3,'0');
  const _autoId=(r.reqid||'REQ').replace(/-\d{3}$/,'')+'-TC-'+_seq;

  // TC 추가 모달
  let modal=document.getElementById('modal-new-tc');
  if(modal) modal.remove();
  modal=document.createElement('div');
  modal.id='modal-new-tc';
  modal.className='modal-overlay';
  modal.style.display='flex';
  modal.innerHTML=
    '<div class="modal" style="width:480px;border-radius:12px;padding:0;display:flex;flex-direction:column;">'+
      '<div style="padding:14px 20px;border-bottom:1px solid var(--border);background:#f8f9fb;display:flex;align-items:center;gap:8px;flex-shrink:0;">'+
        '<i class="ti ti-clipboard-plus" style="font-size:18px;color:var(--blue);"></i>'+
        '<span style="font-size:15px;font-weight:700;">TC 추가</span>'+
        '<span style="font-size:12px;color:var(--text3);margin-left:4px;">— '+r.reqid+'</span>'+
        '<button onclick="this.closest(\'.modal-overlay\').remove()" style="margin-left:auto;width:28px;height:28px;border-radius:6px;border:1px solid var(--border);background:#fff;color:var(--text3);cursor:pointer;"><i class="ti ti-x"></i></button>'+
      '</div>'+
      '<div style="padding:20px;display:flex;flex-direction:column;gap:14px;">'+
        '<div><label style="font-size:12px;color:var(--text3);font-weight:600;display:block;margin-bottom:5px;">TC ID *</label>'+
          '<input id="new-tc-id" value="'+_autoId+'" placeholder="예: '+r.reqid+'-TC-01-001" style="width:100%;font-size:13px;padding:8px 10px;border:1.5px solid var(--border);border-radius:7px;background:#fff;outline:none;box-sizing:border-box;font-family:monospace;" onfocus="this.style.borderColor=\'var(--blue)\'" onblur="this.style.borderColor=\'var(--border)\'"></div>'+
        '<div><label style="font-size:12px;color:var(--text3);font-weight:600;display:block;margin-bottom:5px;">Summary *</label>'+
          '<input id="new-tc-name" placeholder="TC 설명 입력..." style="width:100%;font-size:13px;padding:8px 10px;border:1.5px solid var(--border);border-radius:7px;background:#fff;outline:none;box-sizing:border-box;" onfocus="this.style.borderColor=\'var(--blue)\'" onblur="this.style.borderColor=\'var(--border)\'"></div>'+
      '</div>'+
      '<div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;flex-shrink:0;">'+
        '<button onclick="this.closest(\'.modal-overlay\').remove()" style="font-size:13px;padding:7px 18px;border-radius:7px;border:1.5px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;">취소</button>'+
        '<button onclick="submitNewTCModal(\''+r.id+'\')" style="font-size:13px;padding:7px 18px;border-radius:7px;border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:600;"><i class="ti ti-plus"></i> 추가</button>'+
      '</div>'+
    '</div>';
  document.body.appendChild(modal);
  setTimeout(()=>{ const el=document.getElementById('new-tc-name'); if(el) el.focus(); },50);
}
async function submitNewTCModal(reqId){
  const tcid=document.getElementById('new-tc-id')?.value?.trim();
  const name=document.getElementById('new-tc-name')?.value?.trim();
  if(!tcid){ showToast('TC ID를 입력하세요'); return; }
  if(!name){ showToast('Summary를 입력하세요'); return; }
  const r=reqList.find(x=>x.id===reqId); if(!r) return;
  if(_allTcIds().has(tcid)){ showToast('이미 존재하는 TC ID입니다 ('+tcid+')'); return; }   // 전역(모든 REQ+tcList) 중복 방지
  const now=new Date().toISOString().slice(0,10);
  const newTC={ tcid, id:tcid, name, req_id:reqId, status:'Draft', severity:'Normal', products:[], steps:[], issue_list:[], result_history:[], traffic:{}, object:'', precondition:'', custom_fields:{}, created_by:_whoNow(), updated_by:_whoNow(), created_at:now, updated_at:now };
  if(!r.tc) r.tc=[];
  r.tc.push({tcid, name});
  await saveTCFile(newTC);
  await saveOneREQ(r);
  tcList.push(newTC);
  document.getElementById('modal-new-tc')?.remove();
  showToast('TC 추가: '+tcid);
  if(typeof tcGridRerender==='function') tcGridRerender(reqId);
  if(typeof tmRenderTC==='function' && document.getElementById('page-tm')?.classList.contains('active')) tmRenderTC();
  try{ if(typeof renderExplorer==='function') renderExplorer(); }catch(e){}
  try{ if(typeof expRenderREQDetail==='function'&&typeof expSel!=='undefined'&&expSel&&expSel.type==='req'&&expSel.id===reqId) expRenderREQDetail(reqId); }catch(e){}
}

// REQ 상세 렌더 (3열)
function renderREQDetail(r){
  const hdr=document.getElementById('req-doc-hdr-ph');
  const body=document.getElementById('req-doc-body');
  if(!r){
    if(hdr) hdr.textContent='REQ 상세';
    if(body) body.innerHTML='<div class="detail-empty"><i class="ti ti-file-description"></i><span>REQ를 선택하세요</span></div>';
    return;
  }
  const prioColor=r.priority==='MUST'?'var(--red)':r.priority==='SHOULD'?'var(--yellow)':'var(--text2)';
  const statusColor=r.status==='APPROVED'?'var(--green)':r.status==='DRAFT'?'var(--yellow)':'var(--text3)';
  const allTags=['L2','L3','OLT','HGW','CPE','공통'];
  const selTags=r.products||[];

  if(hdr) hdr.innerHTML=`
    <div style="display:flex;align-items:center;gap:6px;width:100%;overflow:hidden;">
      <span style="font-size:11px;font-weight:600;color:var(--text);font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.reqid}</span>
      <span style="font-size:10px;padding:1px 7px;border-radius:20px;background:${r.status==='APPROVED'?'rgba(0,168,114,0.1)':'rgba(196,138,0,0.1)'};color:${statusColor};flex-shrink:0;">${r.status}</span>
      <button onclick="llmGenTC('${r.id}')" style="margin-left:auto;font-size:10px;padding:2px 8px;border-radius:6px;border:1px solid rgba(157,123,255,0.35);background:rgba(157,123,255,0.08);color:#9d7bff;cursor:pointer;flex-shrink:0;white-space:nowrap;">
        <i class="ti ti-wand" style="font-size:10px;" aria-hidden="true"></i> TC 생성
      </button>
    </div>`;

  if(body) body.innerHTML=`
    <!-- Properties 카드 -->
    <div class="req-sec" style="margin-bottom:8px;">
      <div class="req-sec-b" style="padding:10px 14px;display:flex;flex-direction:column;gap:8px;">

        <!-- 1행: REQ ID | 우선순위 | 상태 -->
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;border-bottom:1px solid var(--border);padding-bottom:8px;">
          <div style="display:flex;flex-direction:column;gap:2px;flex:1;min-width:120px;">
            <div style="font-size:9px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">REQ ID</div>
            <input id="edit-reqid" value="${r.reqid}"
              style="font-family:monospace;font-size:11px;font-weight:600;color:var(--text);background:transparent;border:none;border-bottom:1px dashed transparent;outline:none;padding:1px 2px;width:100%;transition:all 0.2s;"
              onblur="saveInlineREQ('${r.id}');this.style.borderBottomColor='transparent';"
              onfocus="this.style.borderBottomColor='var(--green)';this.style.color='var(--green)';">
          </div>
          <div style="width:1px;height:28px;background:var(--border);flex-shrink:0;"></div>
          <div style="display:flex;flex-direction:column;gap:2px;flex-shrink:0;">
            <div style="font-size:9px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">우선순위</div>
            <select id="edit-priority" style="font-size:11px;font-weight:600;background:${r.priority==='MUST'?'rgba(229,62,90,0.08)':r.priority==='SHOULD'?'rgba(196,138,0,0.08)':'var(--bg3)'};color:${prioColor};border:1px solid ${r.priority==='MUST'?'rgba(229,62,90,0.3)':r.priority==='SHOULD'?'rgba(196,138,0,0.3)':'var(--border)'};border-radius:20px;padding:2px 8px;outline:none;cursor:pointer;"
              onchange="saveInlineREQ('${r.id}')">
              <option${r.priority==='MUST'?' selected':''}>MUST</option>
              <option${r.priority==='SHOULD'?' selected':''}>SHOULD</option>
              <option${r.priority==='MAY'?' selected':''}>MAY</option>
            </select>
          </div>
          <div style="display:flex;flex-direction:column;gap:2px;flex-shrink:0;">
            <div style="font-size:9px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">상태</div>
            <select id="edit-status" style="font-size:11px;font-weight:600;background:${r.status==='APPROVED'?'rgba(0,168,114,0.08)':r.status==='DRAFT'?'rgba(196,138,0,0.08)':'var(--bg3)'};color:${statusColor};border:1px solid ${r.status==='APPROVED'?'rgba(0,168,114,0.3)':r.status==='DRAFT'?'rgba(196,138,0,0.3)':'var(--border)'};border-radius:20px;padding:2px 8px;outline:none;cursor:pointer;"
              onchange="saveInlineREQ('${r.id}')">
              <option${r.status==='DRAFT'?' selected':''}>DRAFT</option>
              <option${r.status==='APPROVED'?' selected':''}>APPROVED</option>
              <option${r.status==='DEPRECATED'?' selected':''}>DEPRECATED</option>
            </select>
          </div>
        </div>

        <!-- 2행: 적용 대상 + TC개수 + 삭제 -->
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span style="font-size:10px;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;flex-shrink:0;">적용 대상</span>
          ${allTags.map(p=>{
            const checked=selTags.includes(p);
            return `<div id="prod-lbl-${r.id}-${p}" style="display:inline-flex;align-items:center;font-size:13px;font-weight:${checked?'700':'500'};padding:6px 14px;border-radius:20px;border:2px solid ${checked?'var(--blue)':'var(--border)'};background:${checked?'var(--blue)':'#fff'};color:${checked?'#fff':'var(--text3)'};cursor:pointer;user-select:none;transition:all 0.15s;box-shadow:${checked?'0 2px 6px rgba(45,111,212,0.3)':'none'};" onclick="toggleProduct(event,'${r.id}','${p}')">
              <input type="checkbox" ${checked?'checked':''} data-product="${p}" style="display:none;">
              <span style="font-size:11px;font-weight:${checked?'600':'400'};color:${checked?'var(--blue)':'var(--text3)'};">${p}</span>
            </div>`;
          }).join('')}
          <div style="margin-left:auto;display:flex;align-items:center;gap:6px;flex-shrink:0;">
            <span style="font-size:11px;color:var(--text3);">TC <b style="color:var(--blue);">${(r.tc||[]).length}</b>개</span>
            <button class="btn danger" style="padding:3px 7px;" onclick="deleteREQ('${r.id}')"><i class="ti ti-trash" aria-hidden="true"></i></button>
          </div>
        </div>

      </div>
    </div>

    <!-- 개요 -->
    <div class="req-sec" style="margin-bottom:8px;">
      <div class="req-sec-h" style="justify-content:space-between;">
        <span><i class="ti ti-file-text" style="font-size:13px;" aria-hidden="true"></i> 개요</span>
        <div style="display:flex;gap:5px;align-items:center;">
          <span style="font-size:10px;color:var(--text3);">클릭하여 편집</span>
          <span id="overview-llm-notice-${r.id}"></span>
          <button onclick="llmGenOverview('${r.id}')"
            style="font-size:10px;padding:2px 8px;border-radius:6px;border:1px solid rgba(157,123,255,0.35);background:rgba(157,123,255,0.08);color:#9d7bff;cursor:pointer;display:flex;align-items:center;gap:3px;">
            <i class="ti ti-sparkles" style="font-size:11px;" aria-hidden="true"></i> LLM 업데이트</button>
        </div>
      </div>
      <div class="req-sec-b">
        <div contenteditable="true" id="edit-overview"
          style="font-size:11px;color:var(--text2);line-height:1.6;outline:none;min-height:60px;border-radius:4px;padding:4px;transition:all 0.2s;"
          onblur="saveInlineREQ('${r.id}');this.style.background='';this.style.borderLeft='';"
          onfocus="this.style.background='rgba(0,168,114,0.05)';this.style.borderLeft='2px solid var(--green)';this.style.paddingLeft='7px';"
        >${r.overview||'개요를 입력하세요...'}</div>
      </div>
    </div>

    <!-- 구현 내용 -->
    <div class="req-sec" style="margin-bottom:8px;">
      <div class="req-sec-h" style="justify-content:space-between;">
        <span><i class="ti ti-code" style="font-size:13px;" aria-hidden="true"></i> 구현 내용 <span style="font-size:9px;color:var(--text3);font-weight:400;">(CLI 조회 결과 등 — LLM TC 생성에 자동 반영)</span></span>
        <span style="font-size:10px;color:var(--text3);">클릭하여 편집</span>
      </div>
      <div class="req-sec-b">
        <div contenteditable="true" id="edit-implementation"
          style="font-size:11px;color:var(--text2);line-height:1.55;outline:none;min-height:60px;border-radius:4px;padding:6px;white-space:pre-wrap;font-family:ui-monospace,monospace;transition:all 0.2s;background:#fafbfc;"
          onblur="saveInlineREQ('${r.id}');this.style.background='#fafbfc';this.style.borderLeft='';"
          onfocus="this.style.background='rgba(0,168,114,0.05)';this.style.borderLeft='2px solid var(--green)';this.style.paddingLeft='9px';"
        >${(r.implementation||'').replace(/</g,'&lt;')}</div>
      </div>
    </div>

    <!-- 구성도 placeholder -->
    <div id="req-topo-wrap-${r.id}" class="req-sec" style="margin-bottom:8px;overflow:visible;">
      <div class="req-sec-h" style="justify-content:space-between;">
        <span><i class="ti ti-topology-star" style="font-size:13px;" aria-hidden="true"></i> 구성도</span>
        <div style="display:flex;gap:4px;align-items:center;">
          <span style="font-size:10px;color:var(--text3);">팔레트→드래그 추가 · ⊕드래그→연결 · 선 클릭→삭제</span>
          <button onclick="llmGenTopo('${r.id}')" style="font-size:10px;padding:2px 8px;border-radius:6px;border:1px solid rgba(157,123,255,0.35);background:rgba(157,123,255,0.08);color:#9d7bff;cursor:pointer;"><i class="ti ti-sparkles" style="font-size:11px;" aria-hidden="true"></i> LLM 구성도</button>
          <button onclick="topoSave('${r.id}')" style="font-size:10px;padding:2px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;"><i class="ti ti-device-floppy"></i> 저장</button>
          <button onclick="topoClear('${r.id}')" style="font-size:10px;padding:2px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;"><i class="ti ti-refresh"></i> 초기화</button>
        </div>
      </div>
      <div id="req-topo-canvas-${r.id}" style="height:300px;display:flex;overflow:hidden;border:1px solid var(--border);border-radius:0 0 6px 6px;"></div>
    </div>

    <!-- 시나리오 placeholder -->
    <div class="req-sec">
      <div class="req-sec-h" style="justify-content:space-between;">
        <span><i class="ti ti-list-details" style="font-size:13px;" aria-hidden="true"></i> 동작 시나리오 (Scenario)</span>
        <div style="display:flex;gap:5px;align-items:center;">
          <span id="sc-llm-notice-${r.id}"></span>
          <button onclick="addScenario('${r.id}')"
            style="font-size:10px;padding:2px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;"><i class="ti ti-plus" style="font-size:11px;" aria-hidden="true"></i> Scenario 추가</button>
          <button onclick="llmGenScenarios('${r.id}')"
            style="font-size:10px;padding:2px 8px;border-radius:6px;border:1px solid rgba(157,123,255,0.35);background:rgba(157,123,255,0.08);color:#9d7bff;cursor:pointer;display:flex;align-items:center;gap:3px;">
            <i class="ti ti-sparkles" style="font-size:11px;" aria-hidden="true"></i> LLM Scenario 업데이트</button>
        </div>
      </div>
      <div id="sc-llm-notice-${r.id}" style="display:none;"></div>
      <div class="req-sec-b" style="padding:5px 8px;" id="sc-accordion-${r.id}"></div>
    </div>`;

  // 구성도 별도 삽입 (백틱 충돌 방지)
  const topoCanvas=document.getElementById('req-topo-canvas-'+r.id);
  if(topoCanvas) topoCanvas.innerHTML=renderTopoEditor(r);

  // 시나리오 별도 삽입
  const scAccordion=document.getElementById('sc-accordion-'+r.id);
  if(scAccordion) scAccordion.innerHTML=renderScenarioAccordion(r);

  setTimeout(()=>topoRestore(r.id), 150);
}
let sidebarVisible=true;
// TC 이름 인라인 편집
function startEditTCName(tcid){
  const view=document.getElementById('tc-name-view-'+tcid);
  const input=document.getElementById('tc-name-input-'+tcid);
  if(!view||!input) return;
  view.style.display='none';
  input.style.display='block';
  input.focus();
  input.select();
}

async function saveTCName(tcid, value){
  const view=document.getElementById('tc-name-view-'+tcid);
  const input=document.getElementById('tc-name-input-'+tcid);
  const tc=tcList.find(t=>t.tcid===tcid);
  const newName=value.trim();
  if(newName && tc){
    tc.name=newName;
    await saveTCFile(tc);
    updateREQTCRef(tc);
    if(view){ view.textContent=newName; view.style.display=''; }
    if(input) input.style.display='none';
  } else {
    if(view) view.style.display='';
    if(input) input.style.display='none';
  }
}

// ── REQ 다중 선택 ──
function toggleReqSelect(id, checked){
  if(checked) selectedReqIds.add(id);
  else selectedReqIds.delete(id);
  updateReqBulkBar();
}
function updateReqBulkBar(){
  const bar=document.getElementById('req-bulk-bar');
  const cnt=document.getElementById('req-sel-count');
  if(!bar) return;
  if(selectedReqIds.size>0){
    bar.style.display='block';
    if(cnt) cnt.textContent=`${selectedReqIds.size}개 선택됨`;
  } else {
    bar.style.display='none';
  }
}
function clearReqSelection(){
  selectedReqIds.clear();
  renderREQTree();
  updateReqBulkBar();
}
async function bulkDeleteREQ(){
  const ids=[...selectedReqIds];
  if(!ids.length) return;
  if(!confirm(`REQ ${ids.length}개를 삭제하시겠습니까?\n(해당 REQ의 TC도 모두 삭제됩니다)`)) return;
  for(const id of ids){
    const r=reqList.find(x=>x.id===id);
    if(!r) continue;
    // TC 도 함께 삭제
    for(const ref of (r.tc||[])){
      await deleteTCFile(ref.tcid);
      tcList=tcList.filter(t=>t.tcid!==ref.tcid);
    }
    await deleteOneREQ(r.reqid);
    reqList=reqList.filter(x=>x.id!==id);
  }
  selectedReqIds.clear();
  selReqId=null; tc4SelReqId=null;
  const hdr=document.getElementById('req-doc-hdr-ph');
  const body=document.getElementById('req-doc-body');
  if(hdr) hdr.innerHTML='REQ 상세';
  if(body) body.innerHTML='<div class="detail-empty"><i class="ti ti-file-description"></i><span>REQ를 선택하세요</span></div>';
  renderREQTree();
  renderTC4List();
}

// ── TC 다중 선택 ──
function toggleTcSelect(tcid, checked){
  if(checked) selectedTcIds.add(tcid);
  else selectedTcIds.delete(tcid);
  updateTcBulkBar();
}
function toggleAllTC(checked){
  const rows=document.querySelectorAll('[id^="tc4-row-"]');
  rows.forEach(row=>{
    const tcid=row.id.replace('tc4-row-','');
    if(checked) selectedTcIds.add(tcid);
    else selectedTcIds.delete(tcid);
    const chk=row.querySelector('input[type="checkbox"]');
    if(chk) chk.checked=checked;
  });
  updateTcBulkBar();
}
function updateTcBulkBar(){
  const bar=document.getElementById('tc4-bulk-bar');
  if(!bar) return;
  if(selectedTcIds.size>0){
    bar.style.display='flex';
    const span=bar.querySelector('span');
    if(span) span.innerHTML=`<b style="color:var(--blue);">${selectedTcIds.size}</b>개 선택됨`;
  } else {
    bar.style.display='none';
  }
}
function clearTcSelection(){
  selectedTcIds.clear();
  renderTC4List();
}
async function bulkDeleteTC(){
  const ids=[...selectedTcIds];
  if(!ids.length) return;
  if(!confirm(`TC ${ids.length}개를 삭제하시겠습니까?`)) return;
  for(const tcid of ids){
    const tc=tcList.find(t=>t.tcid===tcid);
    const reqId=tc?.req_id||tc4SelReqId;
    await deleteTCFile(tcid);
    tcList=tcList.filter(t=>t.tcid!==tcid);
    const r=reqList.find(x=>x.id===reqId);
    if(r){ r.tc=(r.tc||[]).filter(t=>t.tcid!==tcid); await saveOneREQ(r); }
  }
  selectedTcIds.clear();
  renderREQTree();
  renderTC4List();
}

// TC 삭제 (4열에서)
async function deleteTC4(tcid){
  if(!confirm(`TC "${tcid}"를 삭제하시겠습니까?`)) return;
  const tc=tcList.find(t=>t.tcid===tcid);
  const reqId=tc?.req_id||tc4SelReqId;
  await deleteTCFile(tcid);
  tcList=tcList.filter(t=>t.tcid!==tcid);
  // REQ tc 참조에서도 제거
  const r=reqList.find(x=>x.id===reqId);
  if(r){ r.tc=(r.tc||[]).filter(t=>t.tcid!==tcid); await saveOneREQ(r); }
  tc4ExpandedIds.delete(tcid);
  renderREQTree();
  renderTC4List();
}

// TC 타입/구분 즉시 저장
async function updateTCField(tcid, field, value){
  const tc=tcList.find(t=>t.tcid===tcid);
  if(!tc) return;
  tc[field]=value;
  await saveTCFile(tc);
  updateREQTCRef(tc);
}

// TC 구성도 저장/초기화
function tcTopoSave(tcid){
  const reqId='tc-'+tcid;
  const st=getTopoState(reqId);
  const tc=tcList.find(t=>t.tcid===tcid);
  if(!tc) return;
  tc.topo=JSON.stringify({
    nodes:Object.values(st.nodes).map(n=>({id:n.id,type:n.type,model:n.model||'',ip:n.ip||'',x:n.x,y:n.y})),
    conns:st.conns
  });
  saveTCFile(tc);
  alert('구성도가 저장되었습니다!');
}
function tcTopoClear(tcid){
  const reqId='tc-'+tcid;
  const st=getTopoState(reqId);
  Object.keys(st.nodes).forEach(nid=>{ document.getElementById('topo-'+reqId+'-'+nid)?.remove(); });
  st.nodes={}; st.conns=[]; st.nodeCount=0; st.connCount=0;
  const svg=document.getElementById('topo-'+reqId+'-svg');
  if(svg) svg.innerHTML='';
  const tc=tcList.find(t=>t.tcid===tcid);
  if(tc){ tc.topo=''; saveTCFile(tc); }
}
async function llmGenTCTopo(tcid){
  const tc=tcList.find(t=>t.tcid===tcid);
  if(!tc) return;
  // REQ 구성도를 TC로 복사
  const r=reqList.find(x=>x.id===tc.req_id)||tc._req;
  if(r?.topo){
    tc.topo=r.topo;
    await saveTCFile(tc);
    const el=document.getElementById('tc-llm-notice-'+tcid+'-topo');
    if(el){ el.innerHTML=`<span style="font-size:9px;color:var(--green);">✓ REQ 구성도 복사됨</span>`; setTimeout(()=>el.innerHTML='',2000); }
    // 토폴로지 복원
    setTimeout(()=>topoRestore('tc-'+tcid),100);
  } else {
    await llmGenTCField(tcid,'topo');
  }
}

// TC Step 인라인 저장
async function saveTCStep(tcid, stepIdx, field, value){
  const tc=tcList.find(t=>t.tcid===tcid);
  if(!tc||!tc.steps) return;
  if(!tc.steps[stepIdx]) return;
  // "→ " 접두사 제거
  tc.steps[stepIdx][field]=value.replace(/^→\s*/,'');
  await saveTCFile(tc);
}

// Step 삭제
async function deleteTCStep(tcid, stepIdx){
  const tc=tcList.find(t=>t.tcid===tcid);
  if(!tc||!tc.steps) return;
  tc.steps.splice(stepIdx,1);
  await saveTCFile(tc);
  // 리렌더
  if(tc4SelReqId) selectREQItem(tc4SelReqId);
  else if(tc4SelFolderId) selectFolder(tc4SelFolderId);
}

// Step 추가 (인라인)
async function addTCStep4(tcid){
  const tc=tcList.find(t=>t.tcid===tcid);
  if(!tc) return;
  if(!tc.steps) tc.steps=[];
  tc.steps.push({desc:'새 절차',input:'',expected:'',result:''});
  await saveTCFile(tc);
  if(tc4SelReqId) selectREQItem(tc4SelReqId);
  else if(tc4SelFolderId) selectFolder(tc4SelFolderId);
}

// TC 필드 인라인 저장
async function saveTCField(tcid, field, value){
  const tc=tcList.find(t=>t.tcid===tcid);
  if(!tc) return;
  tc[field]=value;
  await saveTCFile(tc);
}

// TC 필드 LLM 생성
async function llmGenTCField(tcid, field){
  const tc=tcList.find(t=>t.tcid===tcid);
  if(!tc) return;
  const r=reqList.find(x=>x.id===tc.req_id)||tc._req;
  const noticeId=`tc-llm-notice-${tcid}-${field}`;
  const overlay=document.getElementById('llm-overlay');
  const msgEl=document.getElementById('llm-overlay-msg');
  const el=document.getElementById(noticeId);
  const fieldLabel={overview:'개요',topo:'구성도',object:'Object',steps:'절차'}[field]||field;

  if(field==='topo'){
    if(el) el.innerHTML=`<span style="font-size:9px;color:var(--text3);">REQ 구성도 참조</span>`;
    setTimeout(()=>{if(el)el.innerHTML='';},2000);
    return;
  }

  if(overlay&&msgEl){ msgEl.textContent=`TC ${fieldLabel} 생성 중...`; overlay.style.display='block'; }
  if(el) el.innerHTML=`<span class="llm-running" style="font-size:9px;"><i class="ti ti-circle-filled" style="font-size:7px;"></i></span>`;

  const selLLMId=document.getElementById('chat-model-select')?.value;
  let llm=llmList.find(x=>x.id===selLLMId);
  if(!llm) llm=llmList.find(x=>x.status==='active'&&x.type!=='claude'&&(x.uses||[]).includes('tc'))||llmList.find(x=>x.status==='active'&&(x.uses||[]).includes('tc'))||llmList.find(x=>x.status==='active'&&x.type!=='claude')||llmList.find(x=>x.status==='active');

  const prompts={
    overview:`다음 TC의 개요를 2~3문장으로 작성. JSON만 응답: {"overview":"..."}
TC: ${tc.tcid} / ${tc.name}
REQ 개요: ${r?.overview||''}`,
    object:`다음 TC의 시험 목적과 사전조건 작성. JSON만 응답: {"precondition":"..."}\nTC: ${tc.tcid} / ${tc.name}\nREQ 개요: ${r?.overview||''}`,
    steps:`다음 TC의 시험 절차를 단계별로 작성. JSON 배열만 응답: [{"desc":"절차설명","input":"CLI/조작","expected":"기대결과"},...]\nTC: ${tc.tcid} / ${tc.name}\n사전조건: ${tc.precondition||''}\nREQ 시나리오: ${r?.scenarios||''}`
  };

  try{
    let reply='';
    const _fpKey={overview:'overview',object:'precondition',steps:'steps'}[field];
    const _userFp=((llm&&llm.field_prompts&&llm.field_prompts.tc&&llm.field_prompts.tc[_fpKey])||'').trim();
    const _ctx=`TC: ${tc.tcid} / ${tc.name}\nREQ 개요: ${r?.overview||''}\n사전조건: ${tc.precondition||''}\nREQ 시나리오: ${r?.scenarios||''}`;
    const _fmt={overview:'반드시 JSON만 응답: {"overview":"..."}',object:'반드시 JSON만 응답: {"precondition":"..."}',steps:'반드시 JSON 배열만 응답: [{"desc":"절차설명","input":"CLI/조작","expected":"기대결과"},...]'}[field];
    const prompt=_userFp?(_userFp+'\n\n'+_ctx+'\n\n'+_fmt):(prompts[field]||'');
    if(!llm||llm.type==='claude'){
      const res=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({message:prompt,history:[]})});
      reply=(await res.json()).reply;
    } else {
      const res=await fetch('/api/chat/local',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({endpoint:llm.endpoint,model:llm.model,
          messages:[{role:'user',content:prompt}],
          max_tokens:llm.max_tokens||1024,context_size:llm.context_size||262144,
          temperature:0.3,apikey:llm.apikey||''})});
      reply=(await res.json()).reply;
    }
    if(overlay) overlay.style.display='none';

    if(field==='steps'){
      const m=reply.match(/\[[\s\S]*\]/);
      if(m){
        tc.steps=JSON.parse(m[0]).map(s=>({desc:s.desc||'',input:s.input||'',expected:s.expected||'',result:''}));
        await saveTCFile(tc);
        if(el) el.innerHTML=`<span style="font-size:9px;color:var(--green);">✓ ${tc.steps.length}개 생성</span>`;
        setTimeout(()=>{if(el)el.innerHTML='';if(tc4SelReqId)selectREQItem(tc4SelReqId);},1500);
      }
    } else {
      const m=reply.match(/\{[\s\S]*\}/);
      if(m){
        const data=JSON.parse(m[0]);
        if(field==='overview'&&data.overview){
          tc.overview=data.overview;
          const d=document.getElementById('tc-overview-'+tcid);
          if(d) d.innerText=tc.overview;
        }
        if(field==='object'&&data.precondition){
          tc.precondition=data.precondition;
          const d=document.getElementById('tc-object-'+tcid);
          if(d) d.innerText=tc.precondition;
        }
        await saveTCFile(tc);
        if(el) el.innerHTML=`<span style="font-size:9px;color:var(--green);">✓ 완료</span>`;
        setTimeout(()=>{if(el)el.innerHTML='';},3000);
      }
    }
  } catch(e){
    if(overlay) overlay.style.display='none';
    if(el) el.innerHTML=`<span style="font-size:9px;color:var(--red);">✗ ${e.message}</span>`;
    setTimeout(()=>{if(el)el.innerHTML='';},3000);
  }
}

// 드롭다운 메뉴
let _ddTimer={};
function showDropdown(id){
  clearTimeout(_ddTimer[id]);
  document.querySelectorAll('.top-dropdown').forEach(d=>{ if(d.id!==id) d.classList.remove('show'); });
  document.getElementById(id)?.classList.add('show');
}(function(){ try{ document.body.classList.remove('navcol'); localStorage.setItem('utop_navcol','0'); }catch(e){} })();   // 가로 탑 네비 — 사이드바 접힘 상태 미사용
// 사이드바 nav-item의 라벨 텍스트를 span.nav-label로 감싸 페이드/툴팁(data-label) 지원
function _wrapNavLabels(){
  document.querySelectorAll('.topnav-bar .nav-item').forEach(function(it){
    if(it.querySelector('.nav-label')) return;
    var txt='';
    for(var i=it.childNodes.length-1;i>=0;i--){ var n=it.childNodes[i]; if(n.nodeType===3 && n.textContent.trim()){ txt=n.textContent.trim(); it.removeChild(n); break; } }
    if(txt){ var sp=document.createElement('span'); sp.className='nav-label'; sp.textContent=txt; it.appendChild(sp); it.setAttribute('data-label',txt); }
  });
}
if(document.readyState!=='loading') _wrapNavLabels(); else document.addEventListener('DOMContentLoaded',_wrapNavLabels);
// 등록된 브랜딩 로고를 헤더에 적용
async function _loadBranding(){
  try{
    const d=await (await fetch('/api/branding')).json();
    const img=document.getElementById('tb-logo-img');
    if(img){ if(d&&d.logo){ img.src=d.logo; img.style.display=''; } else { img.removeAttribute('src'); img.style.display='none'; } }
    const txt=document.querySelector('.tb-logo-text');
    if(txt&&d){ if(d.name_text){ txt.innerHTML=(typeof _brandNameHtml==='function'?_brandNameHtml(d.name_text,d.name_accent_color):d.name_text); } if(d.name_size){ txt.style.fontSize=d.name_size; } if(d.name_color){ txt.style.color=d.name_color; } if(d.name_font){ txt.style.fontFamily=d.name_font; } }
    if(d&&typeof d.fab_greeting==='string') window._fabGreeting=d.fab_greeting;
    if(d&&Array.isArray(d.fab_quick)) window._fabQuick=d.fab_quick;
    if(d&&typeof d.fab_prompt==='string') window._fabPrompt=d.fab_prompt;
    if(d&&typeof d.fab_rules==='string') window._fabRules=d.fab_rules;
  }catch(e){}
}
if(document.readyState!=='loading') _loadBranding(); else document.addEventListener('DOMContentLoaded',_loadBranding);
// 모달/팝업(전체화면 오버레이)이 열리면 좌측 사이드바를 회색+클릭불가로
(function(){
  function _isOverlay(el){
    if(!(el&&el.nodeType===1)) return false;
    try{ var s=getComputedStyle(el); if(s.position!=='fixed') return false; if(s.display==='none'||s.visibility==='hidden'||parseFloat(s.opacity||'1')===0) return false;
      var r=el.getBoundingClientRect(); return r.width>=window.innerWidth*0.55 && r.height>=window.innerHeight*0.55;
    }catch(e){ return false; }
  }
  function _chkModal(){ try{ var any=Array.prototype.some.call(document.body.children,_isOverlay); document.body.classList.toggle('has-modal',any); }catch(e){} }
  function _startModalWatch(){ if(!document.body) return; try{ new MutationObserver(_chkModal).observe(document.body,{childList:true}); _chkModal(); }catch(e){} }
  if(document.readyState!=='loading') _startModalWatch(); else document.addEventListener('DOMContentLoaded',_startModalWatch);
})();
function hideDropdown(id){
  _ddTimer[id]=setTimeout(()=>{ document.getElementById(id)?.classList.remove('show'); },200);
}
// 가로 탑 네비: 탑메뉴 클릭 → 하위 드롭다운 토글(아래로 출력)
function navTop(ev, ddId){ if(ev&&ev.stopPropagation)ev.stopPropagation(); document.querySelectorAll('.top-dropdown').forEach(function(x){ if(x.id!==ddId){ clearTimeout(_ddTimer[x.id]); x.classList.remove('show'); } }); const d=document.getElementById(ddId); if(d){ clearTimeout(_ddTimer[ddId]); d.classList.add('show'); } if(ddId==='dd-itms'&&typeof renderItmsMenu==='function'){ try{renderItmsMenu();}catch(e){} } }
document.addEventListener('click',function(){ document.querySelectorAll('.top-dropdown.show').forEach(function(x){ x.classList.remove('show'); }); });
document.addEventListener('click',e=>{
  if(!e.target.closest('.top-menu-wrap')) document.querySelectorAll('.top-dropdown').forEach(d=>d.classList.remove('show'));
});

// 트리 REQ/TC 카운트 실시간 갱신 (전체 재렌더 없이)
function updateREQTreeCounts(){
  reqFolders.forEach(f=>{
    const stats=getFolderStats(f.id);
    // 폴더 헤더의 카운트 span 업데이트
    const el=document.getElementById('fname-'+f.id);
    if(el){
      const countEl=el.parentElement?.querySelector('.folder-count');
      if(countEl) countEl.textContent=`REQ ${stats.reqCount} / SC ${stats.scCount} / TC ${stats.tcCount}`;
    }
  });
}

// ── REQ 패널 리사이즈 ──
let reqSplitDragging=false, reqSplitStartX=0, reqSplitStartW=0, reqSplitClickTime=0;

document.addEventListener('mousemove',e=>{
  if(!reqSplitDragging) return;
  const dx=e.clientX-reqSplitStartX;
  const newW=Math.max(140,Math.min(500,reqSplitStartW+dx));
  const tree=document.getElementById('req-panel-tree');
  if(tree) tree.style.width=newW+'px';
});

document.addEventListener('mouseup',e=>{
  if(!reqSplitDragging) return;
  reqSplitDragging=false;
  document.body.style.cursor='';
  document.body.style.userSelect='';
  // 클릭(드래그 없이)이면 접기/펼치기
  if(Date.now()-reqSplitClickTime<200&&Math.abs(e.clientX-reqSplitStartX)<5){
    reqToggleTree();
  }
  // 너비 저장
  const tree=document.getElementById('req-panel-tree');
  if(tree) localStorage.setItem('utop_tree_width',tree.offsetWidth);
});

// ── 트리 패널 접기/펼치기
let reqTreeVisible=true;
function reqToggleTree(){
  const tree=document.getElementById('req-panel-tree');
  const icon=document.getElementById('req-split-icon');
  reqTreeVisible=!reqTreeVisible;
  tree.style.display=reqTreeVisible?'':'none';
  if(icon) icon.className=reqTreeVisible?'ti ti-chevron-left':'ti ti-chevron-right';
}

// 폴더 열림 상태 저장
let reqFolderState={};

function renderREQTree(){
  const tree=document.getElementById('req-tree');
  if(!tree) return;
  const q=(document.getElementById('req-search')?.value||'').toLowerCase();
  const rootFolders=reqFolders.filter(f=>f.parent==='root');
  let html='';
  rootFolders.forEach(f=>{
    const color=f.color||'var(--text2)';
    const isOpen=reqFolderState['rc-'+f.id]!==false;
    const children=renderREQChildren(f.id,q);
    const stats=getFolderStats(f.id);
    html+=`<div class="req-folder" draggable="true" data-folderid="${f.id}"
      ondragstart="reqFolderDragStart(event,'${f.id}')"
      ondragover="reqFolderDragOver(event,'${f.id}')"
      ondrop="reqFolderDrop(event,'${f.id}')"
      ondragleave="document.querySelectorAll('[data-folderid]').forEach(el=>el.style.outline='')">
      <div class="req-folder-hdr" oncontextmenu="reqFolderCtx(event,'${f.id}')">
        <i class="ti ti-chevron-right" id="rarr-${f.id}" style="font-size:11px;color:var(--text3);transition:transform 0.15s;${isOpen?'transform:rotate(90deg)':''};cursor:pointer;" onclick="reqToggleFolder('rc-${f.id}')" aria-hidden="true"></i>
        <i class="ti ti-folder-filled" style="font-size:14px;color:${color};cursor:pointer;" onclick="selectFolder('${f.id}')" aria-hidden="true"></i>
        <span id="fname-${f.id}" style="flex:1;cursor:pointer;" onclick="selectFolder('${f.id}')" ondblclick="reqFolderDblClick(event,'${f.id}')" title="더블클릭으로 이름 변경">${f.name}</span>
        <span class="folder-count" style="font-size:10px;color:var(--text3);">REQ ${stats.reqCount} / SC ${stats.scCount} / TC ${stats.tcCount}</span>
      </div>
      <div class="req-folder-children" id="rc-${f.id}" style="display:${isOpen?'block':'none'};">${children}</div>
    </div>`;
  });
  html+=`<div class="req-no-result" id="req-no-result" style="display:none;">
    <i class="ti ti-search-off" style="font-size:24px;display:block;margin-bottom:6px;" aria-hidden="true"></i>
    검색 결과 없음
  </div>`;
  tree.innerHTML=html;
}

// 폴더 내 REQ 수 / TC 합계 계산
function getFolderStats(folderId){
  const directReqs=reqList.filter(r=>r.folder===folderId);
  const subFolders=reqFolders.filter(f=>f.parent===folderId);
  let reqCount=directReqs.length;
  let scCount=directReqs.reduce((s,r)=>{
    try{ const scs=JSON.parse(r.scenarios||'[]'); return s+(Array.isArray(scs)?scs.length:0); }
    catch(e){ return s+(r.scenarios?r.scenarios.split('\n').filter(l=>l.trim()).length:0); }
  },0);
  let tcCount=directReqs.reduce((s,r)=>s+(r.tc||[]).length,0);
  subFolders.forEach(f=>{
    const sub=getFolderStats(f.id);
    reqCount+=sub.reqCount;
    scCount+=sub.scCount;
    tcCount+=sub.tcCount;
  });
  return {reqCount,scCount,tcCount};
}

function isInFolder(folderId, rootId){
  if(folderId===rootId) return true;
  const sub=reqFolders.filter(f=>f.parent===rootId);
  return sub.some(f=>isInFolder(folderId,f.id));
}

function renderREQChildren(parentId, q){
  const subFolders=reqFolders.filter(f=>f.parent===parentId);
  const items=reqList.filter(r=>r.folder===parentId);
  let html='';
  subFolders.forEach(f=>{
    const isOpen=reqFolderState['rc-'+f.id]!==false;
    const children=renderREQChildren(f.id,q);
    const stats=getFolderStats(f.id);
    html+=`<div class="req-folder" draggable="true" data-folderid="${f.id}"
      ondragstart="reqFolderDragStart(event,'${f.id}')"
      ondragover="reqFolderDragOver(event,'${f.id}')"
      ondrop="reqFolderDrop(event,'${f.id}')"
      ondragleave="document.querySelectorAll('[data-folderid]').forEach(el=>el.style.outline='')">
      <div class="req-subfolder-hdr" oncontextmenu="reqFolderCtx(event,'${f.id}')">
        <i class="ti ti-chevron-right" id="rarr-${f.id}" style="font-size:11px;color:var(--text3);transition:transform 0.15s;${isOpen?'transform:rotate(90deg)':''};cursor:pointer;" onclick="reqToggleFolder('rc-${f.id}')" aria-hidden="true"></i>
        <i class="ti ti-folder" style="font-size:13px;color:var(--text3);cursor:pointer;" onclick="selectFolder('${f.id}')" aria-hidden="true"></i>
        <span id="fname-${f.id}" style="flex:1;cursor:pointer;" onclick="selectFolder('${f.id}')" ondblclick="reqFolderDblClick(event,'${f.id}')" title="더블클릭으로 이름 변경">${f.name}</span>
        <span class="folder-count" style="font-size:10px;color:var(--text3);">REQ ${stats.reqCount} / SC ${stats.scCount} / TC ${stats.tcCount}</span>
      </div>
      <div class="req-folder-children" id="rc-${f.id}" style="display:${isOpen?'block':'none'};">${children}</div>
    </div>`;
  });
  items.forEach(r=>{
    const catMatch=reqCurCat==='all'||(r.products||[]).includes(reqCurCat);
    const textMatch=!q||r.title.toLowerCase().includes(q)||r.reqid.toLowerCase().includes(q);
    const show=catMatch&&textMatch;
    const dotClass='cd-'+r.cat;
    const tcCount=(r.tc||[]).length;
    let scCount=0;
    try{ const scs=JSON.parse(r.scenarios||'[]'); scCount=Array.isArray(scs)?scs.length:0; } catch(e){}
    const chk=selectedReqIds.has(r.id);
    html+=`<div class="req-item${r.id===selReqId?' sel':''}" data-id="${r.id}" style="${show?'':'display:none;'}" onclick="selectREQItem('${r.id}')">
      <input type="checkbox" ${chk?'checked':''} onclick="event.stopPropagation();toggleReqSelect('${r.id}',this.checked)"
        style="flex-shrink:0;cursor:pointer;accent-color:var(--blue);">
      <div class="cat-dot ${dotClass}"></div>
      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.title}</span>
      ${scCount>0?`<span class="req-rid" style="color:var(--text3);font-size:9px;">SC ${scCount}</span>`:''}
      ${tcCount>0?`<span class="req-rid" title="TC ${tcCount}개">TC ${tcCount}</span>`:`<span class="req-rid" style="color:var(--text3);">TC 0</span>`}
    </div>`;
  });
  return html;
}

function reqToggleFolder(id){
  const el=document.getElementById(id);
  const fid=id.replace('rc-','');
  const arr=document.getElementById('rarr-'+fid);
  if(!el) return;
  const open=el.style.display!=='none';
  el.style.display=open?'none':'block';
  if(arr) arr.style.transform=open?'':'rotate(90deg)';
  // 상태 저장
  reqFolderState[id]=!open;
}

// 폴더 우클릭 컨텍스트 메뉴
let reqCtxFolderId=null;
function reqFolderCtx(e, folderId){
  e.preventDefault();
  reqCtxFolderId=folderId;
  let menu=document.getElementById('req-ctx-menu');
  if(!menu){
    menu=document.createElement('div');
    menu.id='req-ctx-menu';
    menu.style.cssText='position:fixed;background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:4px;z-index:999;box-shadow:0 4px 12px rgba(0,0,0,0.2);min-width:160px;';
    menu.innerHTML=`
      <div onclick="reqCtxNewFolder()" style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:12px;color:var(--text2);" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
        <i class="ti ti-folder-plus" aria-hidden="true"></i> 하위 폴더 생성
      </div>
      <div onclick="reqCtxNewREQ()" style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:12px;color:var(--text2);" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
        <i class="ti ti-plus" aria-hidden="true"></i> REQ 추가
      </div>
      <div style="height:1px;background:var(--border);margin:3px 0;"></div>
      <div onclick="reqCtxDeleteFolder()" style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:12px;color:var(--red);" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
        <i class="ti ti-trash" aria-hidden="true"></i> 폴더 삭제
      </div>`;
    document.body.appendChild(menu);
    document.addEventListener('click',()=>menu.style.display='none');
  }
  menu.style.display='block';
  menu.style.left=Math.min(e.clientX, window.innerWidth-170)+'px';
  menu.style.top=Math.min(e.clientY, window.innerHeight-130)+'px';
}

function reqCtxNewFolder(){
  document.getElementById('req-ctx-menu').style.display='none';
  const name=prompt('하위 폴더 이름:');
  if(!name) return;
  const fid='f-'+Date.now();
  reqFolders.push({id:fid,name,parent:reqCtxFolderId,color:''});
  reqFolderState['rc-'+reqCtxFolderId]=true; // 부모 펼침
  saveREQData();
  renderREQTree();
  updateREQFolderSelect();
}

function reqCtxNewREQ(){
  document.getElementById('req-ctx-menu').style.display='none';
  openNewREQ(reqCtxFolderId);
}

function reqCtxDeleteFolder(){
  document.getElementById('req-ctx-menu').style.display='none';
  const folder=reqFolders.find(f=>f.id===reqCtxFolderId);
  if(!folder) return;
  if(!confirm(`"${folder.name}" 폴더를 삭제하시겠습니까?\n(하위 REQ는 삭제되지 않습니다)`)) return;
  reqFolders=reqFolders.filter(f=>f.id!==reqCtxFolderId);
  saveREQData();
  renderREQTree();
  updateREQFolderSelect();
}

function reqSearch(val){
  reqCurCat=document.querySelector('.req-chip.active')?.dataset?.cat||'all';
  renderREQTree();
  // 검색어 있으면 폴더 자동 펼침
  if(val.trim()){
    document.querySelectorAll('.req-folder-children').forEach(el=>{
      el.style.display='block';
    });
    document.querySelectorAll('[id^="rarr-"]').forEach(el=>{
      el.style.transform='rotate(90deg)';
    });
  }
  // 결과 없음 체크
  const visible=document.querySelectorAll('.req-item:not([style*="display:none"])').length;
  const nr=document.getElementById('req-no-result');
  if(nr) nr.style.display=visible?'none':'block';
}

let reqAllExpanded=true;
// ── 구성도 에디터 (draw.io 임베드) ──
const _drawioFrames={};

function renderTopoEditor(r){
  const reqId=r.id;
  return '<div id="drawio-wrap-'+reqId+'" style="width:100%;height:100%;display:flex;flex-direction:column;background:#f8f9fb;">'
    +'<div style="padding:6px 10px;background:#f0f2f5;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;flex-shrink:0;">'
    +'<span style="font-size:12px;color:var(--text3);"><i class="ti ti-vector-triangle"></i> 네트워크 구성도 (draw.io)</span>'
    +'<button id="drawio-save-'+reqId+'" style="margin-left:auto;font-size:12px;padding:4px 12px;border-radius:6px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;"><i class="ti ti-device-floppy"></i> PNG 저장</button>'
    +'<button id="drawio-clear-'+reqId+'" style="font-size:12px;padding:4px 12px;border-radius:6px;border:1px solid rgba(229,62,90,0.3);background:rgba(229,62,90,0.05);color:var(--red);cursor:pointer;"><i class="ti ti-trash"></i> 초기화</button>'
    +'</div>'
    +'<iframe id="drawio-frame-'+reqId+'"'
    +' src="https://embed.diagrams.net/?embed=1&ui=min&proto=json&lang=ko&libraries=1&noSaveBtn=1&noExitBtn=1&modified=unsavedChanges"'
    +' style="flex:1;border:none;width:100%;height:420px;"'
    +' allow="clipboard-read; clipboard-write">'
    +'</iframe>'
    +'</div>';
}

function topoDrawioInit(reqId){
  const frame=document.getElementById('drawio-frame-'+reqId);
  if(!frame||_drawioFrames[reqId]) return;
  _drawioFrames[reqId]={frame, reqId, ready:false};
  const r=reqList.find(x=>x.id===reqId);
  const emptyXml='<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>';

  const handler=e=>{
    if(!e.data||typeof e.data!=='string') return;
    let msg; try{msg=JSON.parse(e.data);}catch(ex){return;}
    if(!msg||!msg.event) return;
    if(msg.event==='init'){
      _drawioFrames[reqId].ready=true;
      const xml=(r&&r.topo_drawio)||emptyXml;
      frame.contentWindow.postMessage(JSON.stringify({action:'load',autosave:1,xml}),'*');
    } else if(msg.event==='autosave'){
      if(r&&msg.xml){r.topo_drawio=msg.xml;saveOneREQ(r);}
    } else if(msg.event==='export'){
      if(r&&msg.data){r.topo_image=msg.data;saveOneREQ(r);showToast('구성도 PNG 저장 완료');}
    }
  };
  window.addEventListener('message',handler);
  _drawioFrames[reqId].handler=handler;

  setTimeout(()=>{
    const saveBtn=document.getElementById('drawio-save-'+reqId);
    const clearBtn=document.getElementById('drawio-clear-'+reqId);
    if(saveBtn) saveBtn.onclick=()=>{
      if(_drawioFrames[reqId]&&_drawioFrames[reqId].ready)
        frame.contentWindow.postMessage(JSON.stringify({action:'export',format:'png',scale:1.5}),'*');
    };
    if(clearBtn) clearBtn.onclick=()=>{
      if(!confirm('구성도를 초기화하시겠습니까?')) return;
      if(_drawioFrames[reqId]&&_drawioFrames[reqId].ready)
        frame.contentWindow.postMessage(JSON.stringify({action:'load',xml:emptyXml}),'*');
      if(r){r.topo_drawio='';r.topo_image='';saveOneREQ(r);}
    };
  },500);
}


// 기존 호환 함수들
function topoSave(reqId){
  const fd=_drawioFrames[reqId];
  if(fd&&fd.ready) fd.frame.contentWindow.postMessage(JSON.stringify({action:'export',format:'xmlpng'}),'*');
  showToast('저장 요청됨');
}
function topoClear(reqId){
  const fd=_drawioFrames[reqId];
  if(fd&&fd.ready) fd.frame.contentWindow.postMessage(JSON.stringify({action:'load',xml:'<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>'}),'*');
  const r=reqList.find(x=>x.id===reqId); if(r){r.topo_drawio='';r.topo_image='';saveOneREQ(r);}
}

// ── TC 전용 draw.io 망 구성도 (도형/노트/사진 붙여넣기, tc.topo_drawio·topo_image에 저장) ──
const _tcDrawioFrames={};function topoRestore(reqId){ topoDrawioInit(reqId); }
function getTopoState(r){ return {}; }
function topoAddNode(){}
function topoRenderNode(){}
function topoSaveField(){}
function topoHandleDragStart(){}
function topoDelNode(){}

// Fabric.js CDN 동적 로드
function loadFabric(cb){
  if(window.fabric){cb();return;}
  const s=document.createElement('script');
  s.src='https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.1/fabric.min.js';
  s.onload=cb;
  document.head.appendChild(s);
}

function renderTopoEditor(r){
  const reqId=r.id;
  const typeList=[
    {type:'l2sw', label:'L2 스위치', color:'#2d6fd4'},
    {type:'l3sw', label:'L3 스위치', color:'#9d7bff'},
    {type:'olt',  label:'OLT',       color:'#00a872'},
    {type:'ont',  label:'ONT',       color:'#00a872'},
    {type:'hgw',  label:'HGW',       color:'#c48a00'},
    {type:'pc',   label:'PC/서버',   color:'#555'},
    {type:'meter',label:'계측기',    color:'#e53e5a'},
    {type:'cloud',label:'Cloud',     color:'#888'},
  ];
  // 팔레트 HTML - 인라인 이벤트 없이 data 속성만 사용
  const paletteItems=typeList.map(t=>
    '<div class="topo-pal-btn" data-type="'+t.type+'" data-label="'+t.label+'" data-color="'+t.color+'" data-reqid="'+reqId+'"'
    +' draggable="true"'
    +' style="display:flex;align-items:center;gap:6px;padding:7px 8px;border-radius:6px;cursor:grab;margin-bottom:4px;background:#fff;border:1px solid #ddd;font-size:12px;color:#444;user-select:none;">'
    +'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="'+t.color+'" stroke-width="2">'+_topoGetSVGPath(t.type)+'</svg>'
    +t.label+'</div>'
  ).join('');
  return '<div style="width:130px;flex-shrink:0;background:#f8f9fb;border-right:1px solid var(--border);overflow-y:auto;padding:8px 6px;">'
    +'<div style="font-size:10px;font-weight:700;color:#888;text-transform:uppercase;margin-bottom:8px;">장비 타입</div>'
    +paletteItems+'</div>'
    +'<div style="flex:1;position:relative;overflow:hidden;" id="topo-canvas-wrap-'+reqId+'">'
    +'<canvas id="topo-canvas-'+reqId+'"></canvas>'
    +'<div style="position:absolute;bottom:8px;right:8px;display:flex;gap:4px;z-index:10;">'
    +'<button id="topo-btn-text-'+reqId+'" style="font-size:11px;padding:3px 8px;border-radius:5px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;"><i class="ti ti-text-size"></i> 텍스트</button>'
    +'<button id="topo-btn-arrow-'+reqId+'" style="font-size:11px;padding:3px 8px;border-radius:5px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;"><i class="ti ti-arrow-right"></i> 연결선</button>'
    +'<button id="topo-btn-del-'+reqId+'" style="font-size:11px;padding:3px 8px;border-radius:5px;border:1px solid rgba(229,62,90,0.3);background:rgba(229,62,90,0.05);color:#e53e5a;cursor:pointer;"><i class="ti ti-trash"></i></button>'
    +'</div>'
    +'<div style="position:absolute;top:6px;left:50%;transform:translateX(-50%);font-size:10px;color:#aaa;white-space:nowrap;">아이콘 클릭/드래그 배치 · 더블클릭 텍스트편집 · Ctrl+V 사진</div>'
    +'</div>';
}

function _topoGetSVGPath(type){
  const paths={
    l2sw:'<rect x="3" y="6" width="18" height="12" rx="2"/><line x1="7" y1="12" x2="9" y2="12"/><line x1="11" y1="12" x2="13" y2="12"/><line x1="15" y1="12" x2="17" y2="12"/>',
    l3sw:'<polygon points="12,2 22,8 22,16 12,22 2,16 2,8"/>',
    olt: '<line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="7" x2="22" y2="7"/><line x1="2" y1="17" x2="22" y2="17"/>',
    ont: '<rect x="4" y="4" width="16" height="16" rx="2"/><line x1="8" y1="20" x2="8" y2="24"/><line x1="16" y1="20" x2="16" y2="24"/>',
    hgw: '<path d="M2,12 Q12,2 22,12"/><path d="M6,12 Q12,6 18,12"/><path d="M10,12 Q12,10 14,12"/><circle cx="12" cy="13" r="1" fill="currentColor"/>',
    pc:  '<rect x="3" y="4" width="18" height="13" rx="1"/><line x1="8" y1="17" x2="8" y2="21"/><line x1="16" y1="17" x2="16" y2="21"/><line x1="5" y1="21" x2="19" y2="21"/>',
    meter:'<path d="M4,12 a8,8 0 0,1 16,0"/><line x1="12" y1="12" x2="16" y2="8"/>',
    cloud:'<path d="M6,15 Q2,15 2,11 Q2,7 6,7 Q7,4 11,4 Q15,4 16,7 Q20,7 20,11 Q20,15 16,15 Z"/>',
  };
  return paths[type]||paths.pc;
}

let _topoDragType=null,_topoDragLabel=null,_topoDragColor=null;
function topoFabricDrop(e,reqId){
  e.preventDefault();
  const wrap=document.getElementById('topo-canvas-wrap-'+reqId);
  if(!wrap||!_topoDragType) return;
  const rect=wrap.getBoundingClientRect();
  const x=e.clientX-rect.left, y=e.clientY-rect.top;
  topoFabricAddNode(reqId,_topoDragType,_topoDragLabel,_topoDragColor,x,y);
  _topoDragType=null;
}

var _fabricCanvases=(typeof _fabricCanvases!=='undefined'&&_fabricCanvases)?_fabricCanvases:{};
function topoFabricInit(reqId){
  if(_fabricCanvases[reqId]) return _fabricCanvases[reqId];
  const wrap=document.getElementById('topo-canvas-wrap-'+reqId);
  const canvasEl=document.getElementById('topo-canvas-'+reqId);
  if(!wrap||!canvasEl||!window.fabric) return null;
  const w=wrap.clientWidth||600, h=wrap.clientHeight||280;
  canvasEl.width=w; canvasEl.height=h;
  canvasEl.style.cssText='position:absolute;top:0;left:0;width:'+w+'px;height:'+h+'px;';
  const fc=new fabric.Canvas('topo-canvas-'+reqId,{
    backgroundColor:'#fff', selection:true, preserveObjectStacking:true,
  });
  fc.setWidth(w); fc.setHeight(h);
  _fabricCanvases[reqId]=fc;

  // 팔레트 아이템 클릭/드래그 바인딩
  const pal=document.getElementById('topo-palette-'+reqId)||wrap.previousSibling;
  if(pal){
    pal.querySelectorAll('.topo-pal-btn').forEach(btn=>{
      // hover
      btn.addEventListener('mouseenter',()=>{btn.style.background='rgba(45,111,212,0.08)';btn.style.borderColor='#2d6fd4';});
      btn.addEventListener('mouseleave',()=>{btn.style.background='#fff';btn.style.borderColor='#ddd';});
      // 클릭으로 캔버스 중앙에 추가
      btn.addEventListener('click',()=>{
        topoFabricAddNode(reqId,btn.dataset.type,btn.dataset.label,btn.dataset.color,w/2,h/2);
      });
      // 드래그
      btn.addEventListener('dragstart',e=>{
        _topoDragType=btn.dataset.type;
        _topoDragLabel=btn.dataset.label;
        _topoDragColor=btn.dataset.color;
        e.dataTransfer.effectAllowed='copy';
      });
    });
  }

  // 드래그앤드롭
  wrap.addEventListener('dragover',e=>e.preventDefault());
  wrap.addEventListener('drop',e=>topoFabricDrop(e,reqId));

  // 버튼 바인딩
  const btnText=document.getElementById('topo-btn-text-'+reqId);
  const btnArrow=document.getElementById('topo-btn-arrow-'+reqId);
  const btnDel=document.getElementById('topo-btn-del-'+reqId);
  if(btnText) btnText.onclick=()=>topoFabricAddText(reqId);
  if(btnArrow) btnArrow.onclick=()=>topoFabricAddArrow(reqId);
  if(btnDel) btnDel.onclick=()=>topoFabricDelSel(reqId);

  // 더블클릭 텍스트 편집
  fc.on('mouse:dblclick',opt=>{
    const obj=opt.target; if(!obj) return;
    if(obj.type==='i-text'){ fc.setActiveObject(obj); obj.enterEditing(); return; }
    if(obj.group){
      const grp=obj.group;
      const items=grp.getObjects();
      const idx=items.indexOf(obj);
      grp.toActiveSelection();
      const target=items.find(o=>o.type==='i-text')||(idx>0?items[idx]:items[items.length-1]);
      if(target&&target.type==='i-text'){ fc.setActiveObject(target); target.enterEditing(); }
    }
  });

  // Ctrl+V 사진 붙여넣기
  document.addEventListener('paste',e=>{
    if(!document.getElementById('topo-canvas-wrap-'+reqId)) return;
    topoFabricPaste(e,reqId);
  });

  fc.on('object:modified',()=>topoFabricSave(reqId));
  fc.on('object:added',()=>topoFabricSave(reqId));
  fc.on('object:removed',()=>topoFabricSave(reqId));
  return fc;
}

// 아이콘 SVG path 맵
const _topoSVGPaths={
  l2sw:'M4,4 L20,4 L20,16 L4,16 Z M7,8 L9,8 M11,8 L13,8 M15,8 L17,8',
  l3sw:'M12,2 L22,8 L22,16 L12,22 L2,16 L2,8 Z',
  olt: 'M12,2 L12,22 M2,7 L22,7 M2,17 L22,17',
  ont: 'M4,4 L20,4 L20,20 L4,20 Z M8,20 L8,24 M16,20 L16,24',
  hgw: 'M2,12 Q12,2 22,12 M6,12 Q12,6 18,12 M10,12 Q12,10 14,12',
  pc:  'M4,4 L20,4 L20,16 L4,16 Z M8,16 L8,20 M16,16 L16,20 M5,20 L19,20',
  meter:'M12,12 m-8,0 a8,8 0 0,1 16,0 M12,12 L16,8',
  cloud:'M6,15 Q2,15 2,11 Q2,7 6,7 Q7,4 11,4 Q15,4 16,7 Q20,7 20,11 Q20,15 16,15 Z',
};

function topoFabricAddNode(reqId,type,label,color,x,y){
  const fc=_fabricCanvases[reqId]; if(!fc) return;
  const svgStr='<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="'+color+'" stroke-width="2"><path d="'+(_topoSVGPaths[type]||_topoSVGPaths.pc)+'"/></svg>';
  fabric.loadSVGFromString(svgStr,(objs,opts)=>{
    const icon=fabric.util.groupSVGElements(objs,opts);
    icon.scaleToWidth(40);
    // 장비명 텍스트
    const nameText=new fabric.IText(label,{
      fontSize:12, fill:'#333', fontFamily:'sans-serif',
      textAlign:'center', originX:'center',
      top:44, left:20, width:90,
    });
    // IP 텍스트
    const ipText=new fabric.IText('IP',{
      fontSize:10, fill:'#888', fontFamily:'sans-serif',
      textAlign:'center', originX:'center',
      top:58, left:20, width:90,
    });
    // 배경 박스
    const bg=new fabric.Rect({
      width:90, height:76, rx:8, ry:8,
      fill:'rgba('+hexToRgb(color)+',0.06)',
      stroke:color, strokeWidth:1.5,
      originX:'center', left:20, top:0,
      selectable:false, evented:false,
    });
    icon.set({originX:'center',left:20,top:8,selectable:false,evented:false});
    const grp=new fabric.Group([bg,icon,nameText,ipText],{
      left:x-45, top:y-38,
      subTargetCheck:true,
      hasControls:true,
      hasBorders:true,
    });
    // 더블클릭으로 해당 텍스트 편집
    grp.on('mousedblclick',opt=>{
      const ptr=fc.getPointer(opt.e);
      const gLeft=grp.left+grp.width*grp.scaleX/2;
      const isName=opt.e.clientY<(grp.top+grp.height*grp.scaleY*0.65+fc._offset.top);
      grp.toActiveSelection();
      const target=isName?nameText:ipText;
      fc.setActiveObject(target);
      target.enterEditing();
      target.selectAll();
    });
    fc.add(grp);
    fc.setActiveObject(grp);
    fc.renderAll();
    topoFabricSave(reqId);
  });
}

function hexToRgb(hex){
  const r=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r?parseInt(r[1],16)+','+parseInt(r[2],16)+','+parseInt(r[3],16):'45,111,212';
}

function topoFabricAddText(reqId){
  const fc=_fabricCanvases[reqId]; if(!fc) return;
  const txt=new fabric.IText('텍스트 입력',{
    left:100, top:100, fontSize:14, fill:'#333', fontFamily:'sans-serif',
    backgroundColor:'rgba(255,255,255,0.8)',
    padding:4, borderRadius:4,
  });
  fc.add(txt);
  fc.setActiveObject(txt);
  txt.enterEditing();
  txt.selectAll();
  fc.renderAll();
}

function topoFabricAddArrow(reqId){
  const fc=_fabricCanvases[reqId]; if(!fc) return;
  const line=new fabric.Line([80,150,220,150],{
    stroke:'#555', strokeWidth:2,
    selectable:true, hasControls:true,
  });
  const arrowHead=new fabric.Triangle({
    width:12,height:14,fill:'#555',
    left:214,top:143,angle:90,
    selectable:false,evented:false,
  });
  const grp=new fabric.Group([line,arrowHead],{hasControls:true});
  fc.add(grp);
  fc.setActiveObject(grp);
  fc.renderAll();
}

function topoFabricDelSel(reqId){
  const fc=_fabricCanvases[reqId]; if(!fc) return;
  const objs=fc.getActiveObjects();
  objs.forEach(o=>fc.remove(o));
  fc.discardActiveObject();
  fc.renderAll();
  topoFabricSave(reqId);
}

function topoFabricPaste(e,reqId){
  const items=e.clipboardData?.items;
  if(!items) return;
  for(const item of items){
    if(item.type.startsWith('image/')){
      const blob=item.getAsFile();
      const url=URL.createObjectURL(blob);
      fabric.Image.fromURL(url,img=>{
        const fc=_fabricCanvases[reqId]; if(!fc) return;
        img.scaleToWidth(Math.min(300,fc.width*0.5));
        img.set({left:50,top:50,hasBorders:true,hasControls:true});
        fc.add(img);
        fc.setActiveObject(img);
        fc.renderAll();
        topoFabricSave(reqId);
      });
      break;
    }
  }
}

function topoFabricSave(reqId){
  const fc=_fabricCanvases[reqId]; if(!fc) return;
  const r=reqList.find(x=>x.id===reqId);
  if(!r) return;
  r.topo_json=JSON.stringify(fc.toJSON());
  r.topo_image=fc.toDataURL({format:'png',multiplier:1});
  saveOneREQ(r);
}

function topoFabricRestore(reqId){
  const fc=_fabricCanvases[reqId]; if(!fc) return;
  const r=reqList.find(x=>x.id===reqId);
  if(!r||!r.topo_json) return;
  try{
    fc.loadFromJSON(r.topo_json,()=>{
      fc.renderAll();
    });
  }catch(e){}
}

function topoSave(reqId){ topoFabricSave(reqId); showToast('구성도가 저장되었습니다.'); }
function topoClear(reqId){
  const fc=_fabricCanvases[reqId];
  if(fc){ fc.clear(); fc.backgroundColor='#fff'; fc.renderAll(); }
  const r=reqList.find(x=>x.id===reqId);
  if(r){ r.topo_json=''; r.topo_image=''; saveOneREQ(r); }
}
function topoRestore(reqId){
  loadFabric(()=>{
    setTimeout(()=>{
      const fc=topoFabricInit(reqId);
      if(fc) topoFabricRestore(reqId);
    },100);
  });
}

// 기존 API 호환 (구버전 코드 대응)
function getTopoState(r){ return {}; }
function topoAddNode(reqId,type,x,y,d){ topoFabricAddNode(reqId,type,type,'#2d6fd4',x,y); }
function topoRenderNode(reqId,nid){}
function topoSaveField(reqId,nid,field,el){}
function topoHandleDragStart(e,reqId,nid){}
function topoDelNode(reqId,nid){
  const fc=_fabricCanvases[reqId]; if(!fc) return;
  const objs=fc.getObjects();
  if(objs.length>0){ fc.remove(objs[objs.length-1]); fc.renderAll(); }
}

let _suppressToast=false; // 전체 실행 중엔 코너 토스트 끄고 헤더 ②로만 표시
function showToast(msg){
  if(_suppressToast) return;
  let t=document.getElementById('utop-toast');
  if(!t){t=document.createElement('div');t.id='utop-toast';t.style.cssText='position:fixed;top:56px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:10px 18px;border-radius:8px;font-size:13px;z-index:99999;transition:opacity 0.3s;box-shadow:0 6px 24px rgba(0,0,0,0.3);pointer-events:none;';document.body.appendChild(t);}
  t.style.pointerEvents='none';   // 토스트는 클릭 대상 아님 — 숨겨져도 아래 툴바 클릭 가로채지 않게
  t.textContent=msg;t.style.opacity='1';
  clearTimeout(t._t);t._t=setTimeout(()=>{t.style.opacity='0';},2000);
}
function uiPrompt(opts){
  opts=opts||{}; const old=document.getElementById('ui-prompt'); if(old)old.remove();
  const m=document.createElement('div'); m.id='ui-prompt'; m.className='modal-overlay'; m.style.cssText='display:flex;z-index:100050;';
  const box=document.createElement('div'); box.style.cssText='width:400px;max-width:92vw;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.4);';
  box.innerHTML='<div style="padding:15px 20px;background:linear-gradient(135deg,#2d6fd4,#4f8ae8);color:#fff;display:flex;align-items:center;gap:10px;"><i class="ti '+(opts.icon||'ti-pencil')+'" style="font-size:22px;"></i><div style="font-size:15px;font-weight:800;">'+_bdEsc(opts.title||'입력')+'</div></div>'
    +'<div style="padding:18px 20px;">'+(opts.label?'<div style="font-size:11.5px;color:var(--text3);font-weight:700;margin-bottom:6px;">'+_bdEsc(opts.label)+'</div>':'')+'<input id="ui-prompt-input" style="width:100%;font-size:14px;padding:9px 11px;border:1.5px solid var(--border);border-radius:8px;outline:none;box-sizing:border-box;"></div>'
    +'<div style="padding:0 20px 18px;display:flex;gap:8px;justify-content:flex-end;"><button id="ui-prompt-cancel" style="font-size:13px;padding:8px 18px;border-radius:8px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;">취소</button><button id="ui-prompt-ok" style="font-size:13px;padding:8px 22px;border-radius:8px;border:none;background:#2d6fd4;color:#fff;cursor:pointer;font-weight:700;">'+_bdEsc(opts.confirmText||'확인')+'</button></div>';
  m.appendChild(box); document.body.appendChild(m);
  const inp=box.querySelector('#ui-prompt-input'); inp.value=(opts.value!=null?opts.value:''); inp.placeholder=opts.placeholder||'';
  const close=function(){ m.remove(); };
  const done=function(){ const v=inp.value; close(); if(opts.onConfirm) opts.onConfirm(v); };
  box.querySelector('#ui-prompt-ok').addEventListener('click',done);
  box.querySelector('#ui-prompt-cancel').addEventListener('click',close);
  m.addEventListener('click',function(e){ if(e.target===m)close(); });
  inp.addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); done(); } });
  setTimeout(function(){ inp.focus(); inp.select(); },30);
}
function uiConfirm(opts){
  opts=opts||{}; let m=document.getElementById('ui-confirm'); if(m)m.remove();
  m=document.createElement('div'); m.id='ui-confirm'; m.className='modal-overlay'; m.style.display='flex'; m.style.zIndex='100050';
  m.addEventListener('click',function(e){ if(e.target===m)m.remove(); });
  const col=opts.color||(opts.danger?'#e53e5a':'#2d6fd4');
  const grad=opts.danger?'linear-gradient(135deg,#e8820c,#f0a93a)':('linear-gradient(135deg,'+col+',#4f8ae8)');
  window._uiConfirmCb=opts.onConfirm||function(){};
  m.innerHTML='<div onclick="event.stopPropagation()" style="width:390px;max-width:92vw;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.4);">'
    +'<div style="padding:16px 20px;background:'+grad+';color:#fff;display:flex;align-items:center;gap:11px;"><i class="ti '+(opts.icon||'ti-help-circle')+'" style="font-size:24px;"></i><div style="font-size:16px;font-weight:800;">'+_bdEsc(opts.title||'확인')+'</div></div>'
    +'<div style="padding:18px 20px;font-size:13px;color:var(--text);line-height:1.6;">'+(opts.msg||'')+'</div>'
    +'<div style="padding:0 20px 18px;display:flex;gap:8px;justify-content:flex-end;"><button onclick="document.getElementById(\'ui-confirm\').remove()" style="font-size:13px;padding:8px 18px;border-radius:8px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;">'+_bdEsc(opts.cancelText||'취소')+'</button><button onclick="var f=window._uiConfirmCb;document.getElementById(\'ui-confirm\').remove();if(f)f();" style="font-size:13px;padding:8px 22px;border-radius:8px;border:none;background:'+(opts.danger?'#e53e5a':col)+';color:#fff;cursor:pointer;font-weight:700;">'+_bdEsc(opts.confirmText||'확인')+'</button></div>'
  +'</div>';
  document.body.appendChild(m);
}


// ── 구성도 LLM 자동 생성 ──
async function llmGenTopo(reqId){
  const r=reqList.find(x=>x.id===reqId);
  if(!r) return;
  const selLLMId=document.getElementById('chat-model-select')?.value;
  const llm=llmList.find(x=>x.id===selLLMId);

  const wrap=document.getElementById('topo-'+reqId+'-nodes');
  if(!wrap) return;

  // 로딩 표시
  const loading=document.createElement('div');
  loading.style.cssText='position:absolute;inset:0;background:rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;z-index:99;border-radius:4px;';
  loading.innerHTML='<div style="background:var(--bg2);padding:12px 20px;border-radius:8px;font-size:12px;color:var(--text2);display:flex;align-items:center;gap:8px;"><i class="ti ti-loader spin" aria-hidden="true"></i> LLM이 구성도를 생성 중...</div>';
  wrap.parentElement.appendChild(loading);

  const typeList=['l2sw(L2스위치)','l3sw(L3스위치)','olt(OLT)','ont(ONT)','hgw(HGW)','meter(계측기/IXIA/Spirent)','pc(PC/서버)','cloud(클라우드)'];

  const prompt=`다음 네트워크 요구사항(REQ)을 분석하여 시험 구성도를 생성해주세요.

REQ ID: ${r.reqid}
제목: ${r.title}
적용 대상: ${(r.products||[]).join(', ')}
개요: ${r.overview||'없음'}
동작 시나리오 (Scenario): ${(()=>{
  try{
    const scs=JSON.parse(r.scenarios||'[]');
    return Array.isArray(scs)?scs.map(s=>s.desc).join(', '):r.scenarios;
  }catch(e){ return r.scenarios||'없음'; }
})()}

장비 타입 목록: ${typeList.join(', ')}

시험에 필요한 장비와 연결 구성을 JSON으로만 응답하세요.
노드는 최소 2개, 최대 6개.
x/y 좌표는 캔버스(500x300) 기준으로 적절히 배치하세요.

{
  "nodes": [
    {"type":"l2sw","model":"DUT(L2 SW)","ip":"","x":80,"y":120},
    {"type":"meter","model":"IXIA N2X","ip":"","x":320,"y":80},
    {"type":"pc","model":"테스트 PC","ip":"","x":320,"y":200}
  ],
  "conns": [
    {"from":0,"to":1,"label":"eth0/1 ↔ P1"},
    {"from":0,"to":2,"label":"eth0/2 ↔ ETH"}
  ]
}`;

  try{
    let reply='';
    if(!llm||llm.type==='claude'){
      const res=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({message:prompt,history:[]})});
      reply=(await res.json()).reply;
    } else {
      const res=await fetch('/api/chat/local',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({endpoint:llm.endpoint,model:llm.model,
          messages:[{role:'user',content:prompt}],
          max_tokens:llm.max_tokens||1024,context_size:llm.context_size||262144,
          temperature:0.3,apikey:llm.apikey||''})});
      reply=(await res.json()).reply;
    }

    const m=reply.match(/\{[\s\S]*\}/);
    if(!m) throw new Error('JSON 파싱 실패');
    const data=JSON.parse(m[0]);

    // 기존 노드 제거
    const st=getTopoState(reqId);
    Object.keys(st.nodes).forEach(nid=>{
      document.getElementById('topo-'+reqId+'-'+nid)?.remove();
    });
    document.querySelectorAll(`.topo-conn-overlay-${reqId}`).forEach(el=>el.remove());
    st.nodes={}; st.conns=[]; st.nodeCount=0; st.connCount=0;

    // 노드 생성
    const nodeIdMap={};
    (data.nodes||[]).forEach((n,i)=>{
      const nid='n'+(++st.nodeCount);
      nodeIdMap[i]=nid;
      st.nodes[nid]={
        id:nid, type:n.type||'pc',
        model:n.model||'', ip:n.ip||'',
        x:n.x||50+i*120, y:n.y||100,
        def:TOPO_TYPES[n.type]||{label:n.type,icon:'ti-box',color:'#888'}
      };
      topoRenderNode(reqId,nid);
    });

    // 연결 생성
    (data.conns||[]).forEach(c=>{
      const fromNid=nodeIdMap[c.from];
      const toNid=nodeIdMap[c.to];
      if(fromNid&&toNid){
        st.conns.push({id:'c'+(++st.connCount),from:fromNid,to:toNid,label:c.label||''});
      }
    });

    setTimeout(()=>topoUpdateSVG(reqId),80);
    loading.remove();

  } catch(e){
    loading.remove();
    alert('구성도 생성 실패: '+e.message);
  }
}

// ── 시나리오 파싱/렌더링 ──

// 기존 텍스트 → 구조화 변환 (마이그레이션)
function parseScenarios(raw){
  if(!raw) return [];
  // 이미 JSON 배열이면 그대로
  if(typeof raw==='string'&&raw.trim().startsWith('[')){
    try{ return JSON.parse(raw); }catch(e){}
  }
  // 텍스트 형식 파싱: "SC-ACC-01: 설명\nSC-TRK-01: 설명"
  return raw.split('\n').filter(s=>s.trim()).map(s=>{
    const m=s.match(/^(SC-[\w-]+)\s*:\s*(.*)$/);
    return {
      id: m?m[1]:'SC-???',
      desc: m?m[2].trim():s.trim(),
      cli_set:'', cli_get:'', snmp:'', syslog:''
    };
  });
}

function scenariosToRaw(list){
  return JSON.stringify(list);
}

function renderScenarioAccordion(r){
  const scenarios=parseScenarios(r.scenarios);
  if(!scenarios.length) return `<div style="font-size:11px;color:var(--text3);padding:6px 0;">시나리오가 없습니다. Scenario 추가 버튼을 눌러 추가하세요.</div>`;

  return scenarios.map((sc,i)=>`
    <div style="border:1px solid var(--border);border-radius:6px;margin-bottom:5px;overflow:hidden;" id="sc-wrap-${r.id}-${i}">
      <!-- 헤더 -->
      <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg3);">
        <span style="font-size:10px;padding:1px 7px;border-radius:20px;background:rgba(45,111,212,0.1);color:var(--blue);font-weight:600;flex-shrink:0;cursor:pointer;"
          onclick="toggleSC('sc-body-${r.id}-${i}',this.closest('div'))">${sc.id}</span>
        <div contenteditable="true"
          style="flex:1;font-size:12px;color:var(--text);outline:none;padding:2px 6px;border-radius:4px;border:1px solid transparent;transition:all 0.15s;"
          onfocus="this.style.borderColor='var(--green)';this.style.background='rgba(0,168,114,0.05)';"
          onblur="saveSCDesc('${r.id}',${i},this);this.style.borderColor='transparent';this.style.background='';"
        >${sc.desc||'시나리오 설명을 입력하세요...'}</div>
        <button onclick="deleteSC('${r.id}',${i})" style="font-size:10px;padding:1px 6px;border-radius:4px;border:1px solid var(--border);background:transparent;color:var(--red);cursor:pointer;flex-shrink:0;" aria-label="삭제"><i class="ti ti-trash" aria-hidden="true"></i></button>
        <i class="ti ti-chevron-down sc-arrow" style="font-size:12px;color:var(--text3);transition:transform 0.2s;cursor:pointer;flex-shrink:0;"
          onclick="toggleSC('sc-body-${r.id}-${i}',this.closest('div'))" aria-hidden="true"></i>
      </div>
      <!-- 바디 (접혀있음) -->
      <div id="sc-body-${r.id}-${i}" style="display:none;padding:10px 12px;display:none;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div>
            <div style="font-size:10px;font-weight:600;color:var(--text2);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.4px;"><i class="ti ti-terminal-2" style="font-size:11px;"></i> CLI 설정</div>
            <div contenteditable="true" data-sc="${r.id}" data-idx="${i}" data-field="cli_set"
              style="font-family:monospace;font-size:11px;color:var(--green);background:var(--bg4);border-radius:4px;padding:6px 8px;min-height:36px;outline:none;white-space:pre-wrap;transition:all 0.2s;"
              onblur="saveSCField(this)"
              onfocus="this.style.borderLeft='2px solid var(--green)';"
            >${sc.cli_set||'CLI 설정 명령어...'}</div>
          </div>
          <div>
            <div style="font-size:10px;font-weight:600;color:var(--text2);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.4px;"><i class="ti ti-terminal" style="font-size:11px;"></i> CLI 조회</div>
            <div contenteditable="true" data-sc="${r.id}" data-idx="${i}" data-field="cli_get"
              style="font-family:monospace;font-size:11px;color:var(--blue);background:var(--bg4);border-radius:4px;padding:6px 8px;min-height:36px;outline:none;white-space:pre-wrap;transition:all 0.2s;"
              onblur="saveSCField(this)"
              onfocus="this.style.borderLeft='2px solid var(--blue)';"
            >${sc.cli_get||'show ...'}</div>
          </div>
          <div>
            <div style="font-size:10px;font-weight:600;color:var(--text2);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.4px;"><i class="ti ti-network" style="font-size:11px;"></i> SNMP OID</div>
            <div contenteditable="true" data-sc="${r.id}" data-idx="${i}" data-field="snmp"
              style="font-family:monospace;font-size:11px;color:var(--text2);background:var(--bg3);border-radius:4px;padding:6px 8px;min-height:32px;outline:none;white-space:pre-wrap;transition:all 0.2s;"
              onblur="saveSCField(this)"
              onfocus="this.style.borderLeft='2px solid var(--green)';"
            >${sc.snmp||'.1.3.6.1...'}</div>
          </div>
          <div>
            <div style="font-size:10px;font-weight:600;color:var(--text2);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.4px;"><i class="ti ti-file-text" style="font-size:11px;"></i> Syslog</div>
            <div contenteditable="true" data-sc="${r.id}" data-idx="${i}" data-field="syslog"
              style="font-size:11px;color:var(--text2);background:var(--bg3);border-radius:4px;padding:6px 8px;min-height:32px;outline:none;white-space:pre-wrap;transition:all 0.2s;"
              onblur="saveSCField(this)"
              onfocus="this.style.borderLeft='2px solid var(--yellow)';"
            >${sc.syslog||'-'}</div>
          </div>
        </div>
      </div>
    </div>`).join('');
}

function toggleSC(bodyId, hdr){
  const body=document.getElementById(bodyId);
  if(!body) return;
  const open=body.style.display!=='none';
  body.style.display=open?'none':'block';
  const arr=hdr.querySelector('.sc-arrow');
  if(arr) arr.style.transform=open?'':'rotate(180deg)';
}

function saveSCDesc(reqId,idx,el){
  const r=reqList.find(x=>x.id===reqId);
  if(!r) return;
  const scenarios=parseScenarios(r.scenarios);
  if(scenarios[idx]){
    scenarios[idx].desc=el.innerText.trim();
    r.scenarios=scenariosToRaw(scenarios);
    saveOneREQ(r); renderREQTree();
    localStorage.setItem('utop_req_list',JSON.stringify(reqList));
  }
}

function saveSCField(el){
  const reqId=el.dataset.sc;
  const idx=parseInt(el.dataset.idx);
  const field=el.dataset.field;
  const r=reqList.find(x=>x.id===reqId);
  if(!r) return;
  const scenarios=parseScenarios(r.scenarios);
  if(scenarios[idx]){
    scenarios[idx][field]=el.innerText.trim();
    r.scenarios=scenariosToRaw(scenarios);
    saveOneREQ(r);
    localStorage.setItem('utop_req_list',JSON.stringify(reqList));
  }
  el.style.borderLeft='';
}

function addScenario(reqId){
  const r=reqList.find(x=>x.id===reqId);
  if(!r) return;
  const scenarios=parseScenarios(r.scenarios);
  const num=String(scenarios.length+1).padStart(2,'0');

  // REQ 제목에서 기능 키워드 추출
  const title=(r.title||'').toUpperCase();
  let abbr='SC';
  const keyMap=[
    ['ACCESS','ACC'],['TRUNK','TRK'],['HYBRID','HYB'],
    ['QINQ','QQ'],['Q-IN-Q','QQ'],['802.1AD','QQ'],
    ['VLAN','VLAN'],['QOS','QOS'],['DSCP','DSCP'],
    ['LACP','LACP'],['LAG','LAG'],
    ['STP','STP'],['RSTP','RSTP'],['MSTP','MSTP'],
    ['OSPF','OSPF'],['BGP','BGP'],['ISIS','ISIS'],
    ['IGMP','IGMP'],['MULTICAST','MCAST'],
    ['EPON','EPON'],['GPON','GPON'],['ONU','ONU'],['ONT','ONT'],
    ['SNMP','SNMP'],['SYSLOG','SLOG'],['NTP','NTP'],
    ['SSH','SSH'],['TELNET','TEL'],
    ['ACL','ACL'],['FILTER','FLT'],['SECURITY','SEC'],
    ['DHCP','DHCP'],['ARP','ARP'],['NAT','NAT'],
    ['BANDWIDTH','BW'],['THROUGHPUT','THRU'],['LATENCY','LAT'],
    ['STABILITY','STAB'],['REBOOT','RBT'],['RECOVERY','RCV'],
    ['COPPER','COP'],['FIBER','FBR'],['PON','PON'],
  ];
  for(const [key,val] of keyMap){
    if(title.includes(key)){ abbr=val; break; }
  }

  // REQ ID 분해: U-REQ-SYS-IPv4_L2-VLAN-001
  // → base: U-REQ-SYS-IPv4_L2-VLAN
  // → seq:  001
  const reqParts=r.reqid.split('-');
  const reqSeq=reqParts.slice(-1)[0]||'001';          // 001
  const reqBase=reqParts.slice(0,-1).join('-');        // U-REQ-SYS-IPv4_L2-VLAN

  // SC ID: U-REQ-SYS-IPv4_L2-VLAN-SC-01-001
  const scId=`${reqBase}-SC-${num}-${reqSeq}`;

  const newSC={id:scId, desc:'', cli_set:'', cli_get:'', snmp:'', syslog:''};
  scenarios.push(newSC);
  r.scenarios=scenariosToRaw(scenarios);
  saveOneREQ(r);
  renderREQTree();
  const acc=document.getElementById('sc-accordion-'+reqId);
  if(acc) acc.innerHTML=renderScenarioAccordion(r);
  const lastBody=document.getElementById(`sc-body-${reqId}-${scenarios.length-1}`);
  if(lastBody) lastBody.style.display='block';
}

function deleteSC(reqId, idx){
  if(!confirm('이 시나리오를 삭제하시겠습니까?')) return;
  const r=reqList.find(x=>x.id===reqId);
  if(!r) return;
  const scenarios=parseScenarios(r.scenarios);
  scenarios.splice(idx,1);
  r.scenarios=scenariosToRaw(scenarios);
  saveOneREQ(r); renderREQTree();
  const acc=document.getElementById('sc-accordion-'+reqId);
  if(acc) acc.innerHTML=renderScenarioAccordion(r);
}

// 3,4. 인라인 저장
function saveInlineREQ(id){
  const r=reqList.find(x=>x.id===id);
  if(!r) return;
  const reqidEl=document.getElementById('edit-reqid');
  const titleEl=document.getElementById('edit-title');
  const overviewEl=document.getElementById('edit-overview');
  const implEl=document.getElementById('edit-implementation');
  const priorityEl=document.getElementById('edit-priority');
  const statusEl=document.getElementById('edit-status');
  const productChecks=document.querySelectorAll('[data-product]');

  if(reqidEl) r.reqid=reqidEl.value;
  if(titleEl) r.title=titleEl.value;
  if(overviewEl) r.overview=overviewEl.innerText;
  if(implEl) r.implementation=implEl.innerText;
  if(priorityEl) r.priority=priorityEl.value;
  if(statusEl) r.status=statusEl.value;
  if(productChecks.length){
    r.products=Array.from(productChecks).filter(c=>c.checked).map(c=>c.dataset.product);
  }

  saveOneREQ(r);
  localStorage.setItem('utop_req_list',JSON.stringify(reqList));

  // 트리 아이템 즉시 업데이트
  const tcCount=(r.tc||[]).length;
  let scCount=0;
  try{ const scs=JSON.parse(r.scenarios||'[]'); scCount=Array.isArray(scs)?scs.length:0; } catch(e){}
  document.querySelectorAll('.req-item').forEach(el=>{
    if(el.dataset.id===id){
      el.innerHTML=`<div class="cat-dot cd-${r.cat}"></div>
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.title}</span>
        ${scCount>0?`<span class="req-rid" style="color:var(--text3);font-size:9px;">SC ${scCount}</span>`:''}
        ${tcCount>0?`<span class="req-rid">TC ${tcCount}</span>`:`<span class="req-rid" style="color:var(--text3);">TC 0</span>`}`;
    }
  });

  // 헤더 즉시 업데이트
  const statusColor=r.status==='APPROVED'?'var(--green)':r.status==='DRAFT'?'var(--yellow)':'var(--text3)';
  const hdr=document.getElementById('req-doc-hdr-ph');
  if(hdr) hdr.innerHTML=`
    <div style="display:flex;align-items:center;gap:8px;width:100%;overflow:hidden;">
      <span style="font-size:12px;font-weight:600;color:var(--text);font-family:monospace;flex-shrink:0;">${r.reqid}</span>
      <span style="font-size:11px;color:var(--text3);flex-shrink:0;">·</span>
      <span style="font-size:12px;font-weight:500;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.title}</span>
      <span style="font-size:10px;padding:2px 8px;border-radius:20px;background:${r.status==='APPROVED'?'rgba(0,168,114,0.1)':r.status==='DRAFT'?'rgba(196,138,0,0.1)':'var(--bg3)'};color:${statusColor};flex-shrink:0;">${r.status}</span>
    </div>`;

  // 우선순위/상태 select 색상 즉시 반영
  const prioColor=r.priority==='MUST'?'var(--red)':r.priority==='SHOULD'?'var(--yellow)':'var(--text2)';
  if(priorityEl){
    priorityEl.style.color=prioColor;
    priorityEl.style.background=r.priority==='MUST'?'rgba(229,62,90,0.08)':r.priority==='SHOULD'?'rgba(196,138,0,0.08)':'var(--bg3)';
    priorityEl.style.borderColor=r.priority==='MUST'?'rgba(229,62,90,0.3)':r.priority==='SHOULD'?'rgba(196,138,0,0.3)':'var(--border)';
  }
  if(statusEl){
    statusEl.style.color=statusColor;
    statusEl.style.background=r.status==='APPROVED'?'rgba(0,168,114,0.08)':r.status==='DRAFT'?'rgba(196,138,0,0.08)':'var(--bg3)';
    statusEl.style.borderColor=r.status==='APPROVED'?'rgba(0,168,114,0.3)':r.status==='DRAFT'?'rgba(196,138,0,0.3)':'var(--border)';
  }
}

// REQ 제목 visible input → hidden 동기화
function syncREQTitle(val){
  const hidden=document.getElementById('ra-title');
  if(hidden) hidden.value=val;
}

function openNewREQ(folderId){
  const _get=id=>document.getElementById(id);
  const _set=(id,val)=>{ const el=_get(id); if(el) el.value=val; };
  const _chk=(id,val)=>{ const el=_get(id); if(el) el.checked=val; };
  const title=_get('req-modal-title');
  if(title) title.innerHTML='<i class="ti ti-plus"></i> REQ 등록';
  _set('ra-id','');
  _set('ra-title','');
  _set('ra-title-vis','');
  _set('ra-confluence','');
  _set('ra-overview','');
  _set('ra-scenarios','');
  _set('ra-priority','MUST');
  _set('ra-status','DRAFT');
  _chk('ra-p-l2',false); _chk('ra-p-l3',false);
  _chk('ra-p-olt',false); _chk('ra-p-cmn',false);
  updateREQFolderSelect();
  if(folderId){
    _set('ra-folder',folderId);
    updateREQId();
  }
  openModal('modal-req-add');
}

function submitREQFolder(){
  const name=document.getElementById('rf-name').value.trim();
  const parent=document.getElementById('rf-parent').value;
  if(!name){alert('폴더 이름을 입력하세요.');return;}
  const fid='f-'+Date.now();
  reqFolders.push({id:fid,name,parent,color:''});
  saveREQData();
  closeModal('modal-req-folder');
  renderREQTree();
  updateREQFolderSelect();
}

function updateREQFolderSelect(){
  const sel=document.getElementById('ra-folder');
  if(!sel) return;
  sel.innerHTML=reqFolders.map(f=>`<option value="${f.id}">${f.name}</option>`).join('');
  updateREQId();
}

// 폴더 전체 경로 조립 (루트까지 역추적)
function getFolderPath(folderId){
  const parts=[];
  let cur=folderId;
  let safety=0;
  while(cur&&safety++<20){
    const f=reqFolders.find(x=>x.id===cur);
    if(!f) break;
    parts.unshift(f.name);
    cur=f.parent||null;
  }
  return parts.join('-');
}

function updateREQId(){
  const fid=document.getElementById('ra-folder')?.value;
  const folder=reqFolders.find(f=>f.id===fid);
  // 보이는 제목 입력창 우선, 없으면 hidden
  const title=(document.getElementById('ra-title-vis')?.value||document.getElementById('ra-title')?.value||'').trim();

  // 제목에서 키워드 추출
  const titleUpper=title.toUpperCase();
  let keyword='';
  const keyMap=[
    ['ACCESS','ACC'],['TRUNK','TRK'],['HYBRID','HYB'],
    ['QINQ','QQ'],['Q-IN-Q','QQ'],
    ['VLAN','VLAN'],['QOS','QOS'],['DSCP','DSCP'],
    ['LACP','LACP'],['LAG','LAG'],
    ['STP','STP'],['RSTP','RSTP'],['MSTP','MSTP'],
    ['OSPF','OSPF'],['BGP','BGP'],['ISIS','ISIS'],
    ['IGMP','IGMP'],['MULTICAST','MCAST'],
    ['EPON','EPON'],['GPON','GPON'],['ONU','ONU'],['ONT','ONT'],
    ['SNMP','SNMP'],['SYSLOG','SLOG'],['NTP','NTP'],
    ['SSH','SSH'],['TELNET','TEL'],
    ['ACL','ACL'],['FILTER','FLT'],['SECURITY','SEC'],
    ['DHCP','DHCP'],['ARP','ARP'],['NAT','NAT'],
    ['STABILITY','STAB'],['REBOOT','RBT'],
    ['COPPER','COP'],['PON','PON'],
  ];
  for(const [key,val] of keyMap){
    if(titleUpper.includes(key)){ keyword=val; break; }
  }
  if(!keyword&&title){
    // 키워드 없고 제목 있으면 첫 단어 사용
    keyword=title.split(/[\s\-_]/)[0].toUpperCase().slice(0,8);
  }
  // 제목 없으면 keyword도 없게 (폴더명만 사용)

  if(folder){
    const folderPath=getFolderPath(fid);
    const reqId=keyword?`${folderPath}-${keyword}`:`${folderPath}`;
    document.getElementById('ra-reqid').value=reqId;
  }
}

async function submitREQ(){
  const id=document.getElementById('ra-id').value;
  const reqid=document.getElementById('ra-reqid').value.trim();
  const title=document.getElementById('ra-title-vis')?.value?.trim()||document.getElementById('ra-title')?.value?.trim()||reqid.split('-').slice(-1)[0]||'';
  if(!reqid){ alert('REQ ID가 없습니다. 폴더와 제목을 입력하면 자동 생성됩니다.'); return; }
  const products=[];
  if(document.getElementById('ra-p-l2').checked) products.push('L2');
  if(document.getElementById('ra-p-l3').checked) products.push('L3');
  if(document.getElementById('ra-p-olt').checked) products.push('OLT');
  if(document.getElementById('ra-p-cmn').checked) products.push('공통');
  const req={
    id:id||'req'+Date.now(),
    folder:document.getElementById('ra-folder').value,
    reqid,
    title,
    products,
    priority:document.getElementById('ra-priority').value,
    status:document.getElementById('ra-status').value,
    confluence:document.getElementById('ra-confluence').value||'',
    overview:document.getElementById('ra-overview').value||'',
    scenarios:document.getElementById('ra-scenarios').value||'',
    tc:id?reqList.find(r=>r.id===id)?.tc||[]:[]
  };
  if(id) reqList=reqList.map(r=>r.id===id?req:r);
  else reqList.push(req);
  await saveOneREQ(req);
  await saveREQData();
  closeModal('modal-req-add');
  renderREQTree();
  selectREQItem(req.id);
}

async function deleteREQ(id){
  const r=reqList.find(x=>x.id===id);
  if(!r) return;
  const tcRefs=r.tc||[];
  const msg=tcRefs.length>0
    ?`REQ "${r.reqid}"를 삭제하시겠습니까?\n연결된 TC ${tcRefs.length}개도 함께 삭제됩니다.`
    :`REQ "${r.reqid}"를 삭제하시겠습니까?`;
  if(!confirm(msg)) return;
  // TC 먼저 삭제
  for(const ref of tcRefs){
    await deleteTCFile(ref.tcid);
    tcList=tcList.filter(t=>t.tcid!==ref.tcid);
  }
  // REQ 삭제
  await deleteOneREQ(r.reqid);
  reqList=reqList.filter(x=>x.id!==id);
  selReqId=null; tc4SelReqId=null;
  selectedReqIds.delete(id);
  const hdr=document.getElementById('req-doc-hdr-ph');
  const body=document.getElementById('req-doc-body');
  if(hdr) hdr.innerHTML='REQ 상세';
  if(body) body.innerHTML='<div class="detail-empty"><i class="ti ti-file-description"></i><span>REQ를 선택하세요</span></div>';
  renderREQTree();
  renderTC4List();
  updateReqBulkBar();
}

function toggleFolderREQ(id){
  const existingDetail=document.getElementById('folder-req-detail-'+id);
  if(existingDetail){
    const isHidden=existingDetail.style.display==='none';
    existingDetail.style.display=isHidden?'':'none';
    // ▶/▼ 아이콘 업데이트
    const mainRow=document.getElementById('folder-req-row-'+id);
    const icon=mainRow?.querySelector('span[title="펼치기/접기"]');
    if(icon) icon.textContent=isHidden?'▼':'▶';
    if(isHidden) expandedReqIds.add(id); else expandedReqIds.delete(id);
    return;
  }
  expandedReqIds.add(id);
  const r=reqList.find(x=>x.id===id);
  if(!r) return;
  const mainRow=document.getElementById('folder-req-row-'+id);
  if(!mainRow) return;
  // ▶ → ▼
  const icon=mainRow.querySelector('span[title="펼치기/접기"]');
  if(icon) icon.textContent='▼';

  let scCount=0;
  try{ const scs=JSON.parse(r.scenarios||'[]'); scCount=Array.isArray(scs)?scs.length:0; }catch(e){}
  const prioColor=p=>p==='MUST'?'var(--red)':p==='SHOULD'?'var(--yellow)':'var(--text3)';
  const priBg=p=>p==='MUST'?'rgba(229,62,90,0.08)':p==='SHOULD'?'rgba(196,138,0,0.08)':'var(--bg3)';
  const staBg=s=>s==='APPROVED'?'rgba(0,168,114,0.08)':s==='DRAFT'?'rgba(196,138,0,0.08)':'var(--bg3)';
  const staColor=s=>s==='APPROVED'?'var(--green)':s==='DRAFT'?'var(--yellow)':'var(--text3)';
  const allTags=['L2','L3','OLT','HGW','CPE','공통'];

  let scsHtml='';
  try{
    const scs=JSON.parse(r.scenarios||'[]');
    if(Array.isArray(scs)&&scs.length){
      scsHtml=`<div style="border:0.5px solid var(--border);border-radius:6px;overflow:hidden;">
        <div style="padding:4px 8px;background:var(--bg3);font-size:10px;font-weight:500;color:var(--text2);"><i class="ti ti-list-details" style="font-size:11px;"></i> 동작 시나리오 (${scs.length})</div>
        <div style="padding:4px 8px;">${scs.map((sc,i)=>`
          <div style="display:flex;gap:6px;padding:4px 0;border-bottom:0.5px solid var(--border);font-size:11px;">
            <span style="font-family:monospace;font-size:10px;color:var(--blue);flex-shrink:0;">${sc.id||'SC-'+(i+1)}</span>
            <span style="color:var(--text2);">${sc.desc||''}</span>
          </div>`).join('')}</div></div>`;
    }
  }catch(e){}

  // Properties 카드를 DOM API로 생성
  const wrap=document.createElement('div');
  wrap.style.cssText='display:flex;flex-direction:column;gap:8px;';

  // 1. Properties 카드
  const propCard=document.createElement('div');
  propCard.style.cssText='background:var(--bg3);border-radius:6px;padding:8px 12px;display:flex;flex-direction:column;gap:6px;';

  // 1-1. REQ ID | 우선순위▼ | 상태▼
  const row1=document.createElement('div');
  row1.style.cssText='display:flex;align-items:center;gap:8px;flex-wrap:wrap;border-bottom:1px solid var(--border);padding-bottom:6px;';
  row1.innerHTML=
    '<div style="display:flex;flex-direction:column;gap:1px;flex:1;min-width:120px;">'+
      '<div style="font-size:9px;color:var(--text3);font-weight:600;text-transform:uppercase;">REQ ID</div>'+
      '<span style="font-family:monospace;font-size:11px;font-weight:600;color:var(--text);">'+r.reqid+'</span>'+
    '</div>'+
    '<div style="width:1px;height:28px;background:var(--border);"></div>'+
    '<div style="display:flex;flex-direction:column;gap:2px;">'+
      '<div style="font-size:9px;color:var(--text3);font-weight:600;text-transform:uppercase;">우선순위</div>'+
      '<select id="fi-prio-'+r.id+'" style="font-size:10px;padding:2px 8px;border-radius:20px;font-weight:600;border:1px solid '+
        (r.priority==='MUST'?'rgba(229,62,90,0.3)':r.priority==='SHOULD'?'rgba(196,138,0,0.3)':'var(--border)')+
        ';background:'+(r.priority==='MUST'?'rgba(229,62,90,0.08)':r.priority==='SHOULD'?'rgba(196,138,0,0.08)':'var(--bg3)')+
        ';color:'+(r.priority==='MUST'?'var(--red)':r.priority==='SHOULD'?'var(--yellow)':'var(--text3)')+
        ';outline:none;cursor:pointer;">'+
        '<option '+(r.priority==='MUST'?'selected':'')+'>MUST</option>'+
        '<option '+(r.priority==='SHOULD'?'selected':'')+'>SHOULD</option>'+
        '<option '+(r.priority==='MAY'?'selected':'')+'>MAY</option>'+
      '</select>'+
    '</div>'+
    '<div style="width:1px;height:28px;background:var(--border);"></div>'+
    '<div style="display:flex;flex-direction:column;gap:2px;">'+
      '<div style="font-size:9px;color:var(--text3);font-weight:600;text-transform:uppercase;">상태</div>'+
      '<select id="fi-status-'+r.id+'" style="font-size:10px;padding:2px 8px;border-radius:20px;font-weight:600;border:1px solid '+
        (r.status==='APPROVED'?'rgba(0,168,114,0.3)':r.status==='DRAFT'?'rgba(196,138,0,0.3)':'var(--border)')+
        ';background:'+(r.status==='APPROVED'?'rgba(0,168,114,0.08)':r.status==='DRAFT'?'rgba(196,138,0,0.08)':'var(--bg3)')+
        ';color:'+(r.status==='APPROVED'?'var(--green)':r.status==='DRAFT'?'var(--yellow)':'var(--text3)')+
        ';outline:none;cursor:pointer;">'+
        '<option '+(r.status==='DRAFT'?'selected':'')+'>DRAFT</option>'+
        '<option '+(r.status==='APPROVED'?'selected':'')+'>APPROVED</option>'+
        '<option '+(r.status==='DEPRECATED'?'selected':'')+'>DEPRECATED</option>'+
      '</select>'+
    '</div>';
  propCard.appendChild(row1);

  // select 이벤트 - 즉시 저장
  setTimeout(()=>{
    const prioSel=document.getElementById('fi-prio-'+r.id);
    const statusSel=document.getElementById('fi-status-'+r.id);
    if(prioSel) prioSel.onchange=()=>{ r.priority=prioSel.value; saveOneREQ(r); inlineUpdateREQ(r.id,'priority',prioSel.value); };
    if(statusSel) statusSel.onchange=()=>{ r.status=statusSel.value; saveOneREQ(r); inlineUpdateREQ(r.id,'status',statusSel.value); };
  },0);

  // 1-2. 적용 대상 (클릭으로 토글)
  const row2=document.createElement('div');
  row2.style.cssText='display:flex;align-items:center;gap:5px;flex-wrap:wrap;';
  const labelEl=document.createElement('span');
  labelEl.style.cssText='font-size:9px;color:var(--text3);font-weight:600;text-transform:uppercase;flex-shrink:0;';
  labelEl.textContent='적용 대상';
  row2.appendChild(labelEl);
  allTags.forEach(p=>{
    const tag=document.createElement('div');
    const on=(r.products||[]).includes(p);
    tag.id='prod-lbl-'+r.id+'-'+p;
    tag.style.cssText='font-size:10px;padding:2px 8px;border-radius:20px;cursor:pointer;user-select:none;border:1px solid '+(on?'rgba(45,111,212,0.4)':'var(--border)')+';background:'+(on?'rgba(45,111,212,0.08)':'transparent')+';color:'+(on?'var(--blue)':'var(--text3)')+';';
    tag.innerHTML='<input type="checkbox" '+(on?'checked':'')+' data-product="'+p+'" style="display:none;"><span style="font-weight:'+(on?'600':'400')+';color:'+(on?'var(--blue)':'var(--text3)')+';">'+p+'</span>';
    tag.onclick=()=>toggleProduct(null,r.id,p);
    row2.appendChild(tag);
  });
  const countEl=document.createElement('div');
  countEl.style.cssText='margin-left:auto;font-size:10px;color:var(--text3);';
  countEl.innerHTML='SC <b>'+scCount+'</b> · TC <b style="color:var(--blue);">'+(r.tc||[]).length+'</b>';
  row2.appendChild(countEl);
  propCard.appendChild(row2);
  wrap.appendChild(propCard);

  // 2. 개요 (contenteditable)
  const ovDiv=document.createElement('div');
  ovDiv.style.cssText='border:0.5px solid var(--border);border-radius:6px;overflow:hidden;';
  const ovHdr=document.createElement('div');
  ovHdr.style.cssText='padding:4px 8px;background:var(--bg3);font-size:10px;font-weight:500;color:var(--text2);';
  ovHdr.textContent='개요';
  const ovBody=document.createElement('div');
  ovBody.contentEditable='true';
  ovBody.style.cssText='padding:6px 10px;font-size:11px;color:var(--text2);line-height:1.6;outline:none;min-height:40px;border-left:2px solid transparent;transition:all 0.15s;';
  ovBody.textContent=r.overview||'개요를 입력하세요...';
  ovBody.onfocus=()=>{ ovBody.style.borderLeftColor='var(--green)'; ovBody.style.background='rgba(0,168,114,0.03)'; };
  ovBody.onblur=()=>{ ovBody.style.borderLeftColor='transparent'; ovBody.style.background=''; r.overview=ovBody.innerText; saveOneREQ(r); };
  ovDiv.appendChild(ovHdr);
  ovDiv.appendChild(ovBody);
  wrap.appendChild(ovDiv);

  // 3. 구성도 (DOM API로 생성 - 백틱 충돌 방지)
  const topoSec=document.createElement('div');
  topoSec.style.cssText='border:0.5px solid var(--border);border-radius:6px;overflow:hidden;';
  const topoHdr=document.createElement('div');
  topoHdr.style.cssText='padding:4px 8px;background:var(--bg3);font-size:10px;font-weight:500;color:var(--text2);display:flex;align-items:center;justify-content:space-between;';
  topoHdr.innerHTML='<span><i class="ti ti-topology-star" style="font-size:11px;"></i> 구성도</span>'+
    '<div style="display:flex;gap:4px;">'+
      '<button onclick="topoSave(\''+r.id+'\')" style="font-size:9px;padding:1px 6px;border-radius:4px;border:1px solid var(--border);background:var(--bg2);color:var(--text2);cursor:pointer;">저장</button>'+
      '<button onclick="topoClear(\''+r.id+'\')" style="font-size:9px;padding:1px 6px;border-radius:4px;border:1px solid var(--border);background:var(--bg2);color:var(--text2);cursor:pointer;">초기화</button>'+
    '</div>';
  const topoCanvas=document.createElement('div');
  topoCanvas.style.cssText='height:260px;display:flex;overflow:hidden;';
  topoCanvas.innerHTML=renderTopoEditor(r);
  topoSec.appendChild(topoHdr);
  topoSec.appendChild(topoCanvas);
  wrap.appendChild(topoSec);
  setTimeout(()=>topoRestore(r.id), 100);

  // 4. 시나리오
  if(scsHtml){ const scDiv=document.createElement('div'); scDiv.innerHTML=scsHtml; wrap.appendChild(scDiv.firstChild); }

  const detailRow=document.createElement('tr');
  detailRow.id='folder-req-detail-'+id;
  detailRow.style.cssText='background:rgba(45,111,212,0.02);border-bottom:1px solid var(--border);';
  const td=document.createElement('td');
  td.colSpan=7;
  td.style.cssText='padding:10px 16px 14px 40px;';
  td.appendChild(wrap);
  detailRow.appendChild(td);
  mainRow.after(detailRow);
}

function toggleAllFolderREQ(checked, folderId){
  const reqs=getReqsInFolder(folderId,true);
  reqs.forEach(r=>{ if(checked) selectedReqIds.add(r.id); else selectedReqIds.delete(r.id); });
  updateFolderBulkBar();
  renderFolderREQList(folderId);
}
function updateFolderBulkBar(){
  const bar=document.getElementById('folder-bulk-bar');
  const cnt=document.getElementById('folder-sel-count');
  if(!bar) return;
  if(selectedReqIds.size>0){
    bar.style.display='flex';
    if(cnt) cnt.textContent=`${selectedReqIds.size}개 선택됨`;
  } else {
    bar.style.display='none';
  }
  updateReqBulkBar();
}

// 폴더뷰에서 REQ 우선순위/상태 인라인 수정
async function inlineUpdateREQ(id, field, value){
  const r=reqList.find(x=>x.id===id);
  if(!r) return;
  r[field]=value;
  await saveOneREQ(r);
}

// ══════════════════════════════════════════
// REQ2 - 새 REQ UI 로직
// ══════════════════════════════════════════
let req2SelFolderId=null, req2ExpandedIds=new Set(), req2CtxFolderId=null;
let req2SelIds=new Set(); // 다중 선택된 REQ id
let req2SearchQ='';

// ── 폴더 트리 렌더 ──
