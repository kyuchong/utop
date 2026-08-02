async function renderItmsMenu(){
  const dd=document.getElementById('dd-itms'); if(!dd)return;
  try{ await loadRacks(); }catch(e){}
  const _canLab=(typeof canAccess!=='function')||canAccess('itms-rack');
  const _canEdit=(typeof canAccess!=='function')||canAccess('itms-rack-edit');
  let h='';
  if(_canLab){
    h+='<div style="padding:6px 16px 4px;font-size:11px;font-weight:700;color:var(--text3);letter-spacing:0.5px;">Lab</div>';
    if(labLabs.length){ h+=labLabs.map(function(l){ const cnt=labRacks.filter(r=>r.lab_id===l.id).length; return '<div class="dd-item" onclick="openLabView(\''+l.id+'\')"><i class="ti ti-building"></i> '+_bdEsc(l.name)+' <span style="font-size:10px;color:var(--text3);">· '+cnt+'랙</span></div>'; }).join(''); }
    else { h+='<div style="padding:6px 16px 8px;font-size:12px;color:var(--text3);">Lab 없음'+(_canEdit?' — 아래 Rack View 설정에서 추가':'')+'</div>'; }
  }
  if(_canEdit){ h+=(_canLab?'<div style="margin:4px 8px;border-top:1px solid var(--border);"></div>':'')+'<div class="dd-item" onclick="openItmsEdit()"><i class="ti ti-settings"></i> Rack View 설정 (편집)</div>'; }
  // Device Management 3종 — Rack View 설정 아래로 이동(페이지 접근은 각 페이지 RBAC가 처리)
  h+=((_canLab||_canEdit)?'<div style="margin:4px 8px;border-top:1px solid var(--border);"></div>':'')
    +'<div style="padding:6px 16px 4px;font-size:11px;font-weight:700;color:var(--text3);letter-spacing:0.5px;">Device Management</div>'
    +'<div class="dd-item" onclick="showPage(\'device-reg-beta\')"><i class="ti ti-server-cog"></i> Device Registration</div>'
    +'<div class="dd-item" onclick="showPage(\'model\')"><i class="ti ti-versions"></i> Model / Vendor Registration</div>'
    +'<div class="dd-item" onclick="showPage(\'linecard\')"><i class="ti ti-cpu"></i> Line Card Registration</div>';
  // 리소스 관리(구 '자원 관리') — Device Management 아래로 이동
  h+='<div style="margin:4px 8px;border-top:1px solid var(--border);"></div>'
    +'<div style="padding:6px 16px 4px;font-size:11px;font-weight:700;color:var(--text3);letter-spacing:0.5px;">리소스 관리</div>'
    +'<div class="dd-item" onclick="rscGo(\'manpower\')"><i class="ti ti-users"></i> 인원 투입 현황</div>'
    +'<div class="dd-item" onclick="rscGo(\'projects\')"><i class="ti ti-layout-kanban"></i> 프로젝트 현황</div>';
  dd.innerHTML=h;
}
function openLabView(labId){ if(typeof canAccess==='function'&&!canAccess('itms-rack')){ if(typeof _rbacDenied==='function')_rbacDenied('Rack View Lab'); return; } _rackEdit=false; _rackLab=labId; showPage('itms-rack'); }
function openItmsView(){ if(typeof canAccess==='function'&&!canAccess('itms-rack')&&!canAccess('itms-rack-edit')){ if(typeof _rbacDenied==='function')_rbacDenied('Rack View'); return; } _rackEdit=false; showPage('itms-rack'); }
// ══════════ STC 트래픽 시험 (Spirent STC · 실섀시 REST, 목업 없음) ══════════
let stcCfg=null; let _stcTimer=null; let _stcState={running:false,elapsed:0,fps:0,streams:[]};
function stcLoadCfg(){ try{ stcCfg=JSON.parse(localStorage.getItem('utop_stc_cfg')); }catch(e){ stcCfg=null; } if(!stcCfg) stcCfg={chassis:'192.168.5.100',session:'STC_GUI_Test',user:'jssong',restIp:'localhost',restPort:8888,pyCmd:'py -3.12',scriptPath:'',slotCount:1,portCount:16,slot:1,portA:15,portB:16,frame:512,load:10,loadUnit:'PERCENT_LINE_RATE',proto:'UDP',dstPort:80,srcPort:1024,duration:30,interval:2,devA:{ip:'1.1.1.1',gw:'1.1.1.2',mac:'00:10:94:00:00:01'},devB:{ip:'1.1.1.2',gw:'1.1.1.1',mac:'00:10:94:00:10:01'}}; }
function stcSaveCfg(){ try{ localStorage.setItem('utop_stc_cfg',JSON.stringify(stcCfg)); }catch(e){} }
function _sg(id){ const el=document.getElementById(id); return el?el.value:''; }
function stcReadForm(){ if(!stcCfg)stcLoadCfg();
  // 필드가 현재 화면에 없으면 기존 설정값을 유지한다(단계별로 입력이 흩어져도 안전).
  const has=function(id){ return !!document.getElementById(id); };
  if(has('stc-chassis')) stcCfg.chassis=_sg('stc-chassis').trim()||stcCfg.chassis;
  if(has('stc-session')) stcCfg.session=_sg('stc-session').trim()||stcCfg.session;
  if(has('stc-frame')) stcCfg.frame=parseInt(_sg('stc-frame'),10)||stcCfg.frame||512;
  if(has('stc-load')) stcCfg.load=parseFloat(_sg('stc-load'))||stcCfg.load||10;
  if(has('stc-loadunit')) stcCfg.loadUnit=_sg('stc-loadunit')||stcCfg.loadUnit;
  if(has('stc-proto')) stcCfg.proto=_sg('stc-proto')||stcCfg.proto;
  if(has('stc-duration')) stcCfg.duration=parseInt(_sg('stc-duration'),10)||stcCfg.duration||30;
  if(has('stc-interval')) stcCfg.interval=parseFloat(_sg('stc-interval'))||stcCfg.interval||2;
  if(has('stc-devA-ip')) stcCfg.devA.ip=_sg('stc-devA-ip').trim()||stcCfg.devA.ip;
  if(has('stc-devA-gw')) stcCfg.devA.gw=_sg('stc-devA-gw').trim()||stcCfg.devA.gw;
  if(has('stc-devB-ip')) stcCfg.devB.ip=_sg('stc-devB-ip').trim()||stcCfg.devB.ip;
  if(has('stc-devB-gw')) stcCfg.devB.gw=_sg('stc-devB-gw').trim()||stcCfg.devB.gw;
  if(has('stc-pycmd')) stcCfg.pyCmd=(_sg('stc-pycmd')||'').trim()||stcCfg.pyCmd;
  if(has('stc-rest')){ const _rs=(_sg('stc-rest')||'localhost:8888').split(':'); stcCfg.restIp=(_rs[0]||'localhost').trim(); stcCfg.restPort=parseInt(_rs[1],10)||8888; }
  if(has('stc-script')) stcCfg.scriptPath=(_sg('stc-script')||'').trim();
  stcSaveCfg(); }
function _stcStreams(){ const A=_stcSel.A,B=_stcSel.B; if(!A||!B) return []; const a='p'+A.slot+'_'+A.port, b='p'+B.slot+'_'+B.port; const arr=[{name:'SB_'+a+'_to_'+b,tx:a,rx:b}]; return arr; }
function _stcFps(){ const lineL1=10e9*(stcCfg.load/100); return Math.max(1,Math.round(lineL1/((stcCfg.frame+20)*8))); }
function _fN(n){ return (n||0).toLocaleString('en-US'); }
function _fBps(b){ b=b||0; if(b>=1e9) return (b/1e9).toFixed(3)+' Gbps'; if(b>=1e6) return (b/1e6).toFixed(2)+' Mbps'; if(b>=1e3) return (b/1e3).toFixed(1)+' Kbps'; return Math.round(b)+' bps'; }
function renderIxiaTraffic(){
  const page=document.getElementById('page-ixia-traffic'); if(!page) return;
  page.innerHTML=
    '<div style="padding:10px 18px;border-bottom:1px solid var(--border);background:var(--bg3);display:flex;align-items:center;gap:12px;flex-shrink:0;">'+
      '<i class="ti ti-wave-sine" style="font-size:19px;color:#e8820c;"></i><span style="font-size:15px;font-weight:800;">IXIA N2X 트래픽 시험</span>'+
      '<span style="font-size:11px;color:var(--text3);">Agilent N2X · RouterTester 900 · Tcl 연동</span>'+
      '<span style="flex:1;"></span>'+
      '<span style="font-size:11px;color:var(--text3);">서버</span>'+
      '<input id="n2x-server" value="210.1.2.248" style="font-size:12px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;width:120px;font-family:ui-monospace,monospace;">'+
      '<span style="font-size:11px;color:var(--text3);">계정</span>'+
      '<input id="n2x-label" value="utop" placeholder="계정" style="font-size:12px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;width:130px;">'+
      '<button onclick="n2xProbe()" style="font-size:12px;padding:5px 13px;border-radius:6px;border:none;background:#e8820c;color:#fff;font-weight:700;cursor:pointer;"><i class="ti ti-plug-connected"></i> 연결 조회</button>'+
    '</div>'+
    '<div id="n2x-body" style="flex:1;overflow:auto;padding:18px;"><div style="color:var(--text3);text-align:center;padding:50px 20px;"><i class="ti ti-plug" style="font-size:42px;opacity:0.25;display:block;margin-bottom:12px;"></i>상단의 <b>연결 조회</b>를 눌러 N2X 서버 상태와 모듈 구성을 확인하세요.</div></div>';
}
async function n2xProbe(){
  const body=document.getElementById('n2x-body'); if(!body) return;
  const server=((document.getElementById('n2x-server')||{}).value||'210.1.2.248').trim();
  const label=((document.getElementById('n2x-label')||{}).value||'utop').trim();
  // 이전 조회가 아직 pending 이면 취소 (페이지 이동 후 재조회, 중복 클릭 시 요청 폭주 방지)
  try{ if(window._n2xProbeAbort) window._n2xProbeAbort.abort(); }catch(e){}
  var ctrl=new AbortController(); window._n2xProbeAbort=ctrl;
  // 경과 시간 카운터 + 15초 이상 걸리면 진단/재기동 버튼 노출
  var t0=Date.now();
  function _render(sec){
    var tips='';
    if(sec>=15) tips='<div style="margin-top:14px;font-size:11.5px;color:#8a6a1c;">응답이 늦어지고 있습니다. 예약이 진행 중이거나 데몬이 멈췄을 수 있습니다.</div>'
      +'<div style="margin-top:8px;display:flex;gap:8px;justify-content:center;">'
      +'<button onclick="try{window._n2xProbeAbort.abort();}catch(e){} n2xProbe();" style="font-size:11.5px;padding:5px 12px;border-radius:6px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;"><i class="ti ti-refresh"></i> 취소 후 재조회</button>'
      +'<button onclick="n2xDiag()" style="font-size:11.5px;padding:5px 12px;border-radius:6px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;">데몬 상태 확인</button>'
      +'<button onclick="n2xReset()" style="font-size:11.5px;padding:5px 12px;border-radius:6px;border:1px solid #e53e5a;background:#fff;color:#e53e5a;cursor:pointer;font-weight:700;"><i class="ti ti-refresh"></i> 데몬 강제 재기동</button>'
      +'</div>';
    body.innerHTML='<div style="color:var(--text3);text-align:center;padding:40px 20px;">'
      +'<i class="ti ti-loader-2" style="font-size:30px;display:block;margin-bottom:10px;animation:spin 1s linear infinite;"></i>'
      +' N2X 포트 상태 조회 중… <span style="font-size:11px;">('+sec+'초 경과)</span>'
      +tips
      +'</div>';
  }
  _render(0);
  var timer=setInterval(function(){ _render(Math.floor((Date.now()-t0)/1000)); }, 1000);
  if(!document.getElementById('n2x-spin-style')){ var st=document.createElement('style'); st.id='n2x-spin-style'; st.textContent='@keyframes spin{to{transform:rotate(360deg);}}'; document.head.appendChild(st); }
  // 클라이언트 하드 타임아웃 50초 — 서버측 lock/ports 타임아웃(45s+3s lock_wait)보다 조금 여유
  var hardTmo=setTimeout(function(){ try{ ctrl.abort(); }catch(e){} }, 50000);
  let d;
  try{ d=await (await fetch('/api/n2x/ports?server='+encodeURIComponent(server)+'&label='+encodeURIComponent(label), {signal: ctrl.signal})).json(); }
  catch(e){
    clearTimeout(hardTmo); clearInterval(timer);
    // AbortError: 사용자가 다시 조회했거나 취소한 경우 — 이후 성공 렌더로 덮어쓰기 되므로 화면 갱신 X
    if(e && e.name==='AbortError'){ return; }
    body.innerHTML='<div style="color:#e53e5a;padding:30px;">조회 오류: '+e.message+'</div>';
    return;
  }
  clearTimeout(hardTmo);
  clearInterval(timer);
  if(!d||!d.ok){
    body.innerHTML='<div style="color:#e53e5a;padding:30px;text-align:center;">'
      +'<b>연결 실패</b><br><span style="font-size:12px;">'+((d&&d.error)||'알 수 없는 오류')+'</span>'
      +'<div style="margin-top:14px;display:flex;gap:8px;justify-content:center;">'
      +'<button onclick="n2xDiag()" style="font-size:11.5px;padding:5px 12px;border-radius:6px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;">데몬 상태 확인</button>'
      +'<button onclick="n2xReset()" style="font-size:11.5px;padding:5px 12px;border-radius:6px;border:1px solid #e53e5a;background:#fff;color:#e53e5a;cursor:pointer;font-weight:700;"><i class="ti ti-refresh"></i> 데몬 강제 재기동</button>'
      +'</div></div>';
    return;
  }
  n2xRenderBody(d,label);
}
// 데몬 상태 진단
async function n2xDiag(){
  const server=((document.getElementById('n2x-server')||{}).value||'210.1.2.248').trim();
  const label=((document.getElementById('n2x-label')||{}).value||'utop').trim();
  try{
    const d=await (await fetch('/api/n2x/diag?server='+encodeURIComponent(server)+'&label='+encodeURIComponent(label))).json();
    var msg='데몬 상태:\n\n대상 살아있음: '+(d.target_alive?'예':'아니오')+'\n\n등록된 데몬:\n';
    (d.daemons||[]).forEach(function(x){ msg+='• '+x.key+' — alive='+x.alive+' pid='+(x.pid||'')+' exit='+(x.exit_code||'')+'\n'; });
    if(!(d.daemons||[]).length) msg+='(없음)';
    alert(msg);
  }catch(e){ alert('진단 오류: '+e.message); }
}
// 데몬 강제 재기동 (kill → 다음 요청 시 자동 재기동)
async function n2xReset(){
  const server=((document.getElementById('n2x-server')||{}).value||'210.1.2.248').trim();
  const label=((document.getElementById('n2x-label')||{}).value||'utop').trim();
  const _t=typeof showToast==='function'?showToast:function(){};
  if(!confirm('N2X 데몬을 강제 종료하고 재기동합니다. 진행 중인 예약 작업이 있으면 중단될 수 있습니다.\n계속할까요?')) return;
  try{
    const d=await (await fetch('/api/n2x/reset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({server:server,label:label})})).json();
    _t(d.killed?'데몬 종료됨 — 재조회 중':'실행 중인 데몬 없음');
    setTimeout(n2xProbe, 500);
  }catch(e){ _t('오류: '+e.message); }
}
function n2xRenderBody(d,label){
  const body=document.getElementById('n2x-body'); if(!body) return;
  window._n2xLastData=d; window._n2xLastLabel=label;   // 로컬 낙관적 갱신용 캐시
  // pending 포트 pulse 애니메이션 CSS 1회 주입
  if(!document.getElementById('n2x-pulse-style')){
    var st=document.createElement('style'); st.id='n2x-pulse-style';
    st.textContent='@keyframes n2xPulse{0%,100%{opacity:1;}50%{opacity:0.55;}}';
    document.head.appendChild(st);
  }
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const cAge=(d && d.cached)?(
    d.stale
      ? (' <span style="color:#e8820c;font-size:10px;font-weight:700;" title="'+(d.cache_age||0)+'초 전 상태 · 이유: '+(d.stale_reason||'데몬 사용 중')+'">·오래된 캐시('+(d.cache_age||0)+'s)</span>')
      : (' <span style="color:#c9923e;font-size:10px;" title="' + (d.cache_age||0) + '초 전 캐시된 결과">·캐시</span>')
  ):'';
  let html='<div style="display:flex;align-items:center;gap:9px;margin-bottom:6px;"><span style="width:10px;height:10px;border-radius:50%;background:#00a872;display:inline-block;box-shadow:0 0 6px rgba(0,168,114,0.6);"></span><b style="font-size:14px;">연결됨</b><span style="color:var(--text3);font-size:12px;">세션 #'+esc(d.session)+' · 계정 '+esc(label)+cAge+'</span></div>';
  html+='<div style="font-size:10.5px;color:var(--text3);margin-bottom:14px;">포트 클릭 — <span style="color:#00875a;font-weight:700;">초록=가능(예약)</span> · <span style="color:#2d6fd4;font-weight:700;">파랑=내예약(클릭 시 해제)</span> · <span style="color:#9a9aa5;font-weight:700;">회색=타예약</span></div>';
  (d.modules||[]).forEach(m=>{
    const st=String(m.state||''); const ready=st.indexOf('READY')>=0, locked=st.indexOf('LOCKED')>=0;
    const sc=ready?'#00a872':(locked?'#e8820c':'#e53e5a');
    const card=esc(String(m.card||'').replace('AGT_CARD_','').replace(/_/g,' '));
    html+='<div style="margin-top:14px;"><div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;"><b style="font-family:ui-monospace,monospace;color:#7c3aed;">모듈 '+esc(m.id)+'</b><span style="font-size:11px;color:var(--text3);">'+card+' · '+esc(m.ports)+'P</span><span style="font-size:10px;color:'+sc+';font-weight:700;">'+esc(st.replace('AGT_MODULE_',''))+'</span></div>';
    if(st.indexOf('NOT_RESPONDING')>=0){ html+='<div style="font-size:11px;color:#c0c4cc;padding:4px 2px;">응답 없음 (포트 사용 불가)</div></div>'; return; }
    html+='<div style="display:flex;flex-wrap:wrap;gap:6px;">';
    (m.portList||[]).forEach(p=>{
      let bg,bd,fg,oc,sub;
      var pending=p._pending;
      if(pending){
        // 진행중 — 클릭 잠금, 노란 테두리 + 스피너
        bg='#fff8e1';bd='#e8c46b';fg='#8a6a1c';oc='';
        sub=(pending==='mine'?'예약중':'해제중')+' ⏳';
      }
      else if(p.avail){ bg='#e9f9f1';bd='#9ad9bd';fg='#00875a';oc="n2xReserve('"+esc(m.id)+"',"+p.port+")";sub='가능'; }
      else if(p.mine){ bg='#e4f0ff';bd='#a9cdf5';fg='#2d6fd4';oc="n2xRelease('"+esc(m.id)+"',"+p.port+")";sub='내예약'; }
      else { bg='#f2f2f4';bd='#e2e2e6';fg='#9a9aa5';oc='';sub=esc(p.label||'사용중'); }
      html+='<div onclick="'+oc+'" title="'+sub+'" style="width:58px;text-align:center;padding:6px 0;border:1px solid '+bd+';background:'+bg+';color:'+fg+';border-radius:6px;cursor:'+(oc?'pointer':(pending?'wait':'default'))+';font-size:12px;user-select:none;'+(pending?'animation:n2xPulse 1.2s ease-in-out infinite;':'')+'"><b>'+p.port+'</b><div style="font-size:8.5px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+sub+'</div></div>';
    });
    html+='</div></div>';
  });
  // 다중 스트림 위저드
  window._n2xModOpts=(d.modules||[]).filter(m=>String(m.state||'').indexOf('NOT_RESPONDING')<0).map(m=>'<option value="'+esc(m.id)+'">'+esc(m.id)+'</option>').join('');
  var _m0=((d.modules||[]).filter(m=>String(m.state||'').indexOf('NOT_RESPONDING')<0)[0]||{}).id||'';
  html+='<div style="margin-top:22px;padding:14px;background:#eef5ff;border:1px solid #c5dcf0;border-radius:8px;">';
  html+='<div style="display:flex;align-items:center;gap:7px;margin-bottom:10px;flex-wrap:wrap;"><span style="font-size:13px;font-weight:800;color:#2d6fd4;"><i class="ti ti-send"></i> 트래픽 전송 (다중 스트림)</span><span style="flex:1;"></span><select id="n2x-mode" onchange="n2xModeToggle()" title="전송 모드" style="font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:5px;background:#fff;cursor:pointer;"><option value="cont">지속 전송</option><option value="time">시간 설정</option></select><span id="n2x-dur-wrap" style="display:none;align-items:center;gap:4px;"><input id="n2x-dur" value="10" title="이 시간(초) 동안 전송 후 자동 정지" style="width:46px;font-size:12px;padding:3px 6px;border:1px solid var(--border);border-radius:5px;"><span style="font-size:11px;color:var(--text3);">초</span></span><button onclick="n2xStreamAdd()" style="font-size:11px;padding:4px 11px;border-radius:5px;border:1px solid #2d6fd4;background:#fff;color:#2d6fd4;font-weight:700;cursor:pointer;">+ 스트림</button><button onclick="n2xTrafficStart()" style="font-size:12px;padding:5px 14px;border-radius:6px;border:none;background:#00a872;color:#fff;font-weight:700;cursor:pointer;"><i class="ti ti-player-play-filled"></i> 시작</button><button onclick="n2xTrafficStop()" style="font-size:12px;padding:5px 13px;border-radius:6px;border:none;background:#e8820c;color:#fff;font-weight:700;cursor:pointer;"><i class="ti ti-player-stop-filled"></i> 멈춤</button><button onclick="n2xTrafficClear()" style="font-size:12px;padding:5px 12px;border-radius:6px;border:1px solid #c5cdd8;background:#fff;color:#5a6072;font-weight:700;cursor:pointer;"><i class="ti ti-eraser"></i> 클리어</button></div>';
  html+='<div id="n2x-streams" style="overflow-x:auto;"></div>';
  html+='<div id="n2x-traffic-result" style="margin-top:11px;font-size:12px;min-height:18px;"></div>';
  html+='</div>';
  body.innerHTML=html;
  if(!window._n2xStreams||!window._n2xStreams.length){
    try{ var _sv=localStorage.getItem('n2x_streams_'+label); if(_sv){ var _p=JSON.parse(_sv); if(_p&&_p.length) window._n2xStreams=_p; } }catch(e){}
  }
  if(!window._n2xStreams||!window._n2xStreams.length){ window._n2xStreams=[{txMod:_m0,txPort:'1',rxMod:_m0,rxPort:'2',proto:'udp',frame:'64',pps:'1000',npkt:'0',srcMac:'',dstMac:'',srcIp:'',dstIp:''}]; }
  n2xStreamRender();
}
function n2xStreamRender(){
  const box=document.getElementById('n2x-streams'); if(!box) return;
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const mo=window._n2xModOpts||'';
  const fl='font-size:11px;padding:3px 5px;border:1px solid var(--border);border-radius:4px;';
  const th='padding:4px 5px;background:#dde9f7;border-bottom:1px solid #b8cde6;font-size:10px;color:#2d6fd4;white-space:nowrap;';
  let h='<table style="border-collapse:collapse;font-size:11px;white-space:nowrap;"><thead><tr>'+['#','송신 Mod','P','수신 Mod','P','Proto','Frame','pps','패킷수','Src MAC','Dst MAC','Src IP','Dst IP',''].map(t=>'<th style="'+th+'">'+t+'</th>').join('')+'</tr></thead><tbody>';
  (window._n2xStreams||[]).forEach((s,i)=>{
    const g=(k,w)=>'<input value="'+esc(s[k])+'" oninput="window._n2xStreams['+i+'].'+k+'=this.value;n2xStreamPersist()" style="'+fl+'width:'+w+'px;">';
    const sel=k=>{ const v=esc(s[k]); return '<select onchange="window._n2xStreams['+i+'].'+k+'=this.value;n2xStreamPersist()" style="'+fl+'">'+mo.replace('value="'+v+'"','value="'+v+'" selected')+'</select>'; };
    const pr='<select onchange="window._n2xStreams['+i+'].proto=this.value;n2xStreamPersist()" style="'+fl+'">'+['udp','tcp','ipv4','eth'].map(p=>'<option'+(s.proto===p?' selected':'')+'>'+p+'</option>').join('')+'</select>';
    h+='<tr><td style="text-align:center;color:#7c3aed;font-weight:700;">'+(i+1)+'</td><td>'+sel('txMod')+'</td><td>'+g('txPort',32)+'</td><td>'+sel('rxMod')+'</td><td>'+g('rxPort',32)+'</td><td>'+pr+'</td><td>'+g('frame',44)+'</td><td>'+g('pps',54)+'</td><td>'+g('npkt',50)+'</td><td>'+g('srcMac',118)+'</td><td>'+g('dstMac',118)+'</td><td>'+g('srcIp',92)+'</td><td>'+g('dstIp',92)+'</td><td><i class="ti ti-trash" onclick="n2xStreamDel('+i+')" style="cursor:pointer;color:#e53e5a;font-size:14px;"></i></td></tr>';
  });
  h+='</tbody></table>';
  box.innerHTML=h;
  if(typeof n2xStatRender==='function') n2xStatRender(window._n2xStats||[], !!window._n2xPoll); // 스트림 변경 시 통계 표(0행)도 갱신
}
function n2xStreamPersist(){
  const label=((document.getElementById('n2x-label')||{}).value||'').trim();
  try{ localStorage.setItem('n2x_streams_'+label, JSON.stringify(window._n2xStreams||[])); }catch(e){}
}
function n2xStreamAdd(){
  window._n2xStreams=window._n2xStreams||[];
  const last=window._n2xStreams.slice(-1)[0]||{};
  window._n2xStreams.push({txMod:last.txMod||'',txPort:'1',rxMod:last.rxMod||'',rxPort:'2',proto:'udp',frame:'64',pps:'1000',npkt:'0',srcMac:'',dstMac:'',srcIp:'',dstIp:''});
  n2xStreamRender(); n2xStreamPersist();
}
function n2xStreamDel(i){ (window._n2xStreams||[]).splice(i,1); n2xStreamRender(); n2xStreamPersist(); }
function _n2xHdr(){ return {server:((document.getElementById('n2x-server')||{}).value||'210.1.2.248').trim(), label:((document.getElementById('n2x-label')||{}).value||'2').trim()}; }
function n2xModeToggle(){ const m=((document.getElementById('n2x-mode')||{}).value||'cont'); const w=document.getElementById('n2x-dur-wrap'); if(w) w.style.display=(m==='time')?'inline-flex':'none'; } // 지속=시간숨김, 시간설정=시간입력 표시
async function n2xTrafficStart(){
  const {server,label}=_n2xHdr();
  const mode=((document.getElementById('n2x-mode')||{}).value||'cont');
  const dur=(mode==='time')?(((document.getElementById('n2x-dur')||{}).value||'10').trim()):'0'; // 지속=0(멈춤까지), 시간=N초 후 자동 정지
  const streams=window._n2xStreams||[];
  if(!streams.length){ if(typeof showToast==='function')showToast('+ 스트림으로 추가하세요'); return; }
  if(window._n2xPoll){ clearInterval(window._n2xPoll); window._n2xPoll=null; }
  let d;
  try{ d=await (await fetch('/api/n2x/traffic/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({server:server,label:label,dur:dur,streams:streams})})).json(); }
  catch(e){ if(typeof showToast==='function')showToast('시작 오류: '+e.message); return; }
  if(!d||!d.ok){ if(typeof showToast==='function')showToast('시작 실패: '+((d&&d.error)||'')); n2xStatRender([],false); return; }
  window._n2xStats=[]; n2xStatRender([], true);
  window._n2xPoll=setInterval(async()=>{
    try{
      const s=await (await fetch('/api/n2x/traffic/stat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({server:server,label:label})})).json();
      if(s&&s.ok){ window._n2xStats=s.streams||[]; n2xStatRender(s.streams, s.running); if(!s.running){ clearInterval(window._n2xPoll); window._n2xPoll=null; } }
    }catch(e){}
  }, 1000);
}
async function n2xTrafficStop(){
  const {server,label}=_n2xHdr();
  if(window._n2xPoll){ clearInterval(window._n2xPoll); window._n2xPoll=null; }
  let d; try{ d=await (await fetch('/api/n2x/traffic/stop',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({server:server,label:label})})).json(); }catch(e){ return; }
  if(d&&d.ok&&d.streams){ window._n2xStats=d.streams; }
  n2xStatRender(window._n2xStats||[], false);
}
async function n2xTrafficClear(){
  const {server,label}=_n2xHdr();
  if(window._n2xPoll){ clearInterval(window._n2xPoll); window._n2xPoll=null; }
  try{ await fetch('/api/n2x/traffic/clear',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({server:server,label:label})}); }catch(e){}
  window._n2xStats=[]; n2xStatRender([], false);
}
// 통계 표 — 스트림 목록 기준(스트림 만들면 0행 표시), 통계 있으면 채움
function n2xStatRender(stats, running){
  const rb=document.getElementById('n2x-traffic-result'); if(!rb) return;
  const sts=stats||window._n2xStats||[];
  const byIdx={}; sts.forEach(x=>{ byIdx[x.idx]=x; });
  const streams=window._n2xStreams||[];
  const td='padding:5px 9px;border-bottom:1px solid #f0eef0;text-align:right;';
  let h='<div style="font-size:11px;font-weight:700;margin-bottom:5px;color:'+(running?'#00a872':'var(--text3)')+';">'+(running?'<i class="ti ti-circle-filled" style="font-size:8px;vertical-align:middle;"></i> 전송 중 — 실시간':'<i class="ti ti-chart-bar" style="font-size:12px;vertical-align:middle;"></i> 통계')+'</div>';
  h+='<table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr>'+['스트림','TX','RX','손실','지연(µs)','순서이탈'].map((t,i)=>'<th style="padding:6px 9px;background:#eaf2ff;border-bottom:1px solid #c5dcf0;font-size:10.5px;color:#2d6fd4;text-align:'+(i?'right':'left')+';">'+t+'</th>').join('')+'</tr></thead><tbody>';
  streams.forEach((s,i)=>{
    const st=byIdx[i]||{tx:0,rx:0,loss:0,latency:'0',misorder:0};
    const route='#'+(i+1)+' '+(s.txMod||'')+'/'+(s.txPort||'')+'→'+(s.rxMod||'')+'/'+(s.rxPort||'');
    const lc=(+st.loss>0)?'#e53e5a':'#00a872';
    h+='<tr style="font-family:ui-monospace,monospace;"><td style="'+td+'text-align:left;color:#7c3aed;">'+route+'</td><td style="'+td+'color:#2d6fd4;font-weight:700;">'+st.tx+'</td><td style="'+td+'color:#00a872;font-weight:700;">'+st.rx+'</td><td style="'+td+'color:'+lc+';font-weight:700;">'+st.loss+'</td><td style="'+td+'">'+st.latency+'</td><td style="'+td+'">'+st.misorder+'</td></tr>';
  });
  if(!streams.length) h+='<tr><td colspan="6" style="padding:9px;text-align:center;color:var(--text3);">+ 스트림으로 추가하세요</td></tr>';
  h+='</tbody></table>';
  rb.innerHTML=h;
}
async function n2xReserve(module, port){
  const server=((document.getElementById('n2x-server')||{}).value||'210.1.2.248').trim();
  const label=((document.getElementById('n2x-label')||{}).value||'utop').trim();
  const _t=typeof showToast==='function'?showToast:function(){};
  // 낙관적 UI: 서버 응답 기다리지 않고 즉시 "내예약(진행중)" 상태로 표시 → 사용자는 즉시 반응 체감
  if(_n2xLocalMark(module,port,'pending-mine')) n2xRenderBody(window._n2xLastData, window._n2xLastLabel);
  _t(module+'/'+port+' 예약 중…');
  // 안전장치: 60초 지나도 응답이 없으면 로컬 상태만 서버에 재확인해서 갱신 (pending 무한 방치 방지)
  var _safety=setTimeout(function(){ _n2xVerifyPortState(module,port); }, 60000);
  try{
    const d=await (await fetch('/api/n2x/reserve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({server:server,label:label,module:String(module),ports:[String(port)]})})).json();
    clearTimeout(_safety);
    // async 응답: 서버가 timeout 이라 background 확인 중 — pending 유지 후 3초 뒤 재확인 반복
    if(d && d.async){
      _t('예약 처리 중 (백그라운드 확인) — 잠시 후 자동 갱신');
      var _pollN=0; var _poll=setInterval(async function(){
        _pollN++;
        await _n2xVerifyPortState(module,port);
        var _ld=window._n2xLastData;
        var _found=null;
        if(_ld&&_ld.modules) for(var _i=0;_i<_ld.modules.length&&!_found;_i++){ var _m=_ld.modules[_i]; if(String(_m.id)!==String(module)) continue;
          for(var _j=0;_j<(_m.portList||[]).length&&!_found;_j++){ var _p=_m.portList[_j]; if(String(_p.port)===String(port)) _found=_p; } }
        if(_found && !_found._pending){ clearInterval(_poll); }
        if(_pollN>=20){ clearInterval(_poll); }   // 최대 20회(약 60초) 시도 후 중단
      }, 3000);
      return;
    }
    if(!d||!d.ok){
      _t('예약 실패: '+((d&&d.error)||'응답 없음'));
      _n2xVerifyPortState(module,port);
      return;
    }
    if((d.failed||[]).length){
      _t(module+'/'+port+' 예약 실패 (이미 잠김)');
      _n2xVerifyPortState(module,port);
      return;
    }
    _t('✓ '+module+'/'+port+' 예약됨 (계정 '+label+')');
    if(_n2xLocalMark(module,port,'mine')) n2xRenderBody(window._n2xLastData, window._n2xLastLabel);
  }catch(e){
    clearTimeout(_safety);
    _t('오류: '+e.message);
    _n2xVerifyPortState(module,port);
  }
}
async function n2xRelease(module, port){
  const server=((document.getElementById('n2x-server')||{}).value||'210.1.2.248').trim();
  const label=((document.getElementById('n2x-label')||{}).value||'utop').trim();
  const _t=typeof showToast==='function'?showToast:function(){};
  // 낙관적 UI: 즉시 "해제 진행중"
  if(_n2xLocalMark(module,port,'pending-free')) n2xRenderBody(window._n2xLastData, window._n2xLastLabel);
  _t(module+'/'+port+' 해제 중…');
  var _safety=setTimeout(function(){ _n2xVerifyPortState(module,port); }, 60000);
  try{
    const d=await (await fetch('/api/n2x/release',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({server:server,label:label,module:String(module),port:String(port)})})).json();
    clearTimeout(_safety);
    if(d && d.async){
      _t('해제 처리 중 (백그라운드 확인) — 잠시 후 자동 갱신');
      var _pollN=0; var _poll=setInterval(async function(){
        _pollN++;
        await _n2xVerifyPortState(module,port);
        var _ld=window._n2xLastData;
        var _found=null;
        if(_ld&&_ld.modules) for(var _i=0;_i<_ld.modules.length&&!_found;_i++){ var _m=_ld.modules[_i]; if(String(_m.id)!==String(module)) continue;
          for(var _j=0;_j<(_m.portList||[]).length&&!_found;_j++){ var _p=_m.portList[_j]; if(String(_p.port)===String(port)) _found=_p; } }
        if(_found && !_found._pending){ clearInterval(_poll); }
        if(_pollN>=20){ clearInterval(_poll); }
      }, 3000);
      return;
    }
    if(!d||!d.ok){
      _t('해제 실패: '+((d&&d.error)||'응답 없음'));
      _n2xVerifyPortState(module,port);
      return;
    }
    _t('✓ '+module+'/'+port+' 해제됨');
    if(_n2xLocalMark(module,port,'free')) n2xRenderBody(window._n2xLastData, window._n2xLastLabel);
  }catch(e){
    clearTimeout(_safety);
    _t('오류: '+e.message);
    _n2xVerifyPortState(module,port);
  }
}
// 특정 포트의 실제 상태를 서버(force 캐시 우회)에서 조회 후 로컬 반영 — 낙관적 UI 실패/응답없음 시 사용
async function _n2xVerifyPortState(module, port){
  try{
    const server=((document.getElementById('n2x-server')||{}).value||'210.1.2.248').trim();
    const label=((document.getElementById('n2x-label')||{}).value||'utop').trim();
    const d=await (await fetch('/api/n2x/ports?server='+encodeURIComponent(server)+'&label='+encodeURIComponent(label)+'&force=1')).json();
    if(!d||!d.ok||!d.modules) return;
    var found=null;
    for(var i=0;i<d.modules.length && !found;i++){
      var m=d.modules[i]; if(String(m.id)!==String(module)) continue;
      for(var j=0;j<(m.portList||[]).length && !found;j++){
        var p=m.portList[j]; if(String(p.port)===String(port)) found=p;
      }
    }
    if(!found) return;
    // 실제 상태로 로컬 갱신 (pending 초기화) + 재렌더
    if(found.mine){ _n2xLocalMark(module,port,'mine'); }
    else if(found.avail){ _n2xLocalMark(module,port,'free'); }
    else {
      // 타 세션이 잡음 — 로컬 상태에서 pending 만 제거하고 서버 값으로 덮어쓰기
      var ld=window._n2xLastData;
      if(ld && ld.modules){
        for(var ii=0;ii<ld.modules.length;ii++){ var mm=ld.modules[ii]; if(String(mm.id)!==String(module)) continue;
          for(var jj=0;jj<(mm.portList||[]).length;jj++){ var pp=mm.portList[jj]; if(String(pp.port)===String(port)){
            pp.mine=0; pp.avail=0; pp.lock=found.lock||'1'; pp.label=found.label||''; pp._pending=0; break;
          } }
        }
      }
    }
    n2xRenderBody(window._n2xLastData, window._n2xLastLabel);
  }catch(e){}
}
// 로컬 캐시된 마지막 ports 응답에서 해당 포트 상태를 즉시 업데이트 → 재렌더 (N2X 재조회 없음)
// kind: 'mine' | 'free' | 'pending-mine' | 'pending-free'
function _n2xLocalMark(module, port, kind){
  var d=window._n2xLastData; if(!d||!d.modules) return false;
  var lb=window._n2xLastLabel||'';
  for(var i=0;i<d.modules.length;i++){ var m=d.modules[i]; if(String(m.id)!==String(module)) continue;
    for(var j=0;j<(m.portList||[]).length;j++){ var p=m.portList[j]; if(String(p.port)!==String(port)) continue;
      if(kind==='mine'){ p.mine=1; p.avail=0; p.lock=String(d.session||'1'); p.label=lb; p._pending=0; }
      else if(kind==='free'){ p.mine=0; p.avail=1; p.lock='0'; p.label=''; p._pending=0; }
      else if(kind==='pending-mine'){ p._pending='mine'; p.mine=1; p.avail=0; p.lock=String(d.session||'1'); p.label=lb; }
      else if(kind==='pending-free'){ p._pending='free'; p.mine=0; p.avail=1; p.lock='0'; p.label=''; }
      return true;
    }
  }
  return false;
}
function renderStcTraffic(){
  stcLoadCfg(); stcInvLoad(); try{var _w=parseInt(localStorage.getItem('utop_stc_wiz'),10); if(_w>=1&&_w<=4)_stcWiz=_w;}catch(e){} const c=stcCfg; const fld='width:100%;font-size:13px;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;outline:none;box-sizing:border-box;background:#fff;';
  const lbl='font-size:11px;font-weight:700;color:var(--text3);display:block;margin-bottom:5px;';
  const page=document.getElementById('page-stc-traffic'); if(!page) return;
  page.innerHTML=
    '<div style="padding:10px 18px;border-bottom:1px solid var(--border);background:var(--bg3);display:flex;align-items:center;gap:12px;flex-shrink:0;">'+
      '<i class="ti ti-activity-heartbeat" style="font-size:19px;color:#c0497b;"></i><span style="font-size:15px;font-weight:800;">STC 트래픽 시험</span>'+
      '<span style="font-size:11px;color:var(--text3);">Spirent STC · UDP 양방향 · 실섀시 연동</span>'+
      '<span id="stc-status" style="font-size:11.5px;font-weight:800;padding:3px 12px;border-radius:7px;"></span>'+
      '<span id="stc-elapsed" style="font-size:12px;color:var(--text2);font-weight:700;"></span>'+
      '<span style="flex:1;"></span>'+
      '<span style="font-size:10.5px;color:var(--text3);font-weight:700;">REST 서버</span>'+
      '<input id="stc-rest" value="'+(((stcCfg&&stcCfg.restIp)||'localhost')+':'+((stcCfg&&stcCfg.restPort)||8888))+'" onchange="stcReadForm();" title="STC REST 서버(stcweb) 주소. 이 PC에 stcweb이 있으면 localhost:8888, 원격이면 예: 220.1.1.236:8888" placeholder="localhost:8888" style="font-size:11px;padding:3px 8px;border:1px solid var(--border);border-radius:6px;width:140px;font-family:ui-monospace,monospace;background:var(--bg2);color:var(--text);">'+
      '<span id="stc-srv-status" title="STC REST API 서버(stcweb.exe) 상태" style="font-size:11px;font-weight:800;padding:3px 10px;border-radius:7px;background:#eee;color:#888;cursor:pointer;" onclick="stcServerStart()">REST: 확인중</span>'+
    '</div>'+
    '<div id="stc-nav" style="display:flex;gap:7px;padding:9px 16px;border-bottom:1px solid var(--border);background:var(--bg3);flex-shrink:0;overflow-x:auto;"></div>'+
    '<div style="flex:1;display:flex;overflow:hidden;min-height:0;">'+
      '<div style="width:248px;flex-shrink:0;border-right:1px solid var(--border);overflow:auto;background:var(--bg2);" id="stc-side"></div>'+
      '<div style="flex:1;display:flex;flex-direction:column;overflow:hidden;background:#fff;">'+
        '<div style="flex:1;overflow:auto;padding:18px 22px;" id="stc-wiz"></div>'+
        '<div style="padding:5px 14px;border-top:1px solid var(--border);background:#11151c;color:#7f8b99;font-size:10px;font-weight:700;flex-shrink:0;display:flex;align-items:center;gap:8px;"><i class="ti ti-terminal-2" style="color:#7CFC00;"></i> STC 콘솔(실제 REST stdout)<span style="flex:1;"></span><button onclick="var c=document.getElementById(\'stc-console\');if(c)c.textContent=\'\';" style="font-size:9px;padding:2px 7px;border-radius:4px;border:1px solid #2a2f3a;background:#1a1f29;color:#9aa;cursor:pointer;">지우기</button></div>'+
        '<pre id="stc-console" style="height:130px;overflow:auto;margin:0;background:#0c0f14;color:#cfe3d6;font-family:ui-monospace,monospace;font-size:11px;line-height:1.5;padding:8px 12px;white-space:pre-wrap;flex-shrink:0;"></pre>'+
      '</div>'+
    '</div>';
  var _wz=document.getElementById('stc-wiz'); if(_wz)_wz.onclick=_stcWizClick; // 포트 클릭 위임
  stcRenderNav(); stcRenderSide(); stcWizRender(); stcServerStatus(); stcAutoConnect(); stcStartStatusPoll();
}
// ══════════ 도움말 (앱 내, 마크다운 렌더) ══════════
var _STC_HELP_MD = [
'# STC 트래픽 시험 도움말',
'',
'Spirent TestCenter(STC) 실섀시에 REST API로 연결해, 가상 장비 간 UDP/TCP 트래픽을 보내고 **손실·지연을 실측**하는 기능입니다. 화면 상단 4단계를 순서대로 진행하세요.',
'',
'## 시작 전 — 계측기 연결',
'- 우측 상단 **`REST:`** 표시가 *실행중*이어야 합니다. *대기*면 클릭해 STC REST 서버(stcweb.exe)를 켭니다.',
'- 섀시는 1단계 진입 시 자동 연결됩니다. iTest와 섀시를 공유하므로 포트 점유에 유의하세요.',
'',
'## 1단계 · 포트 예약',
'- 왼쪽 **포트 상태** 패널에 가능/내예약/타예약 수가 표시됩니다.',
'- **가능**(초록) 포트를 클릭해 예약합니다. 양방향 시험이면 **2개**(A·B)를 예약하세요.',
'- 예약한 포트는 *내 예약*으로 유지되어 다음 단계로 이어집니다.',
'',
'## 2단계 · Device Setting (가상 장비)',
'- 예약한 포트 위에 가상 장비를 만듭니다. **L2**(EthernetII)와 **L3**(IPv4: IP·GW·Prefix) 지원.',
'- **개수(Count)** 와 **증가(Step)** 로 한 포트에 장비를 여러 개(IP/MAC 자동 증가) 생성할 수 있습니다.',
'- 플로우당 장비를 N개로 늘리면, 그 스트림이 **N개의 개별 스트림(플로우)** 으로 펼쳐집니다.',
'',
'## 3단계 · Stream Block (트래픽 정의)',
'- 엑셀형 표에서 스트림을 정의합니다: **Source→Destination 장비**, 프레임 길이/모드, **부하(Load)+단위**(%·Mbps·bps·fps), 프로토콜(UDP/TCP), Dst/Src 포트.',
'- 행별 **Active** 체크로 전송 여부를 정하고, **복사/삭제/추가**로 여러 스트림을 만듭니다.',
'- **방향은 한 스트림당 하나(Source→Destination)** 입니다. 양방향이 필요하면 **반대 방향 스트림을 하나 더 추가**하세요. (예: `Stream_1` 2→3, `Stream_2` 3→2)',
'',
'## 4단계 · 전송 · Result',
'- **지속 전송(정지까지)** 을 켜면 정지를 누를 때까지 보냅니다. 끄면 **시험 시간(초)** 동안만.',
'- **결과 주기(초)** 마다 실시간 결과가 갱신됩니다.',
'- **▶ 트래픽 전송** 시작 / **■ 정지** / **결과 지우기**(행은 유지, 값만 0).',
'- 아래 **STC 콘솔**에 실제 REST 진행 로그가 실시간 표시됩니다.',
'',
'## 결과 읽는 법 (개별 스트림)',
'결과표는 **개별 스트림(플로우)별**로 한 줄씩 보여줍니다. 같은 스트림이 여러 플로우면 `#1 #2 …`로 번호가 붙습니다.',
'',
'| 컬럼 | 의미 |',
'|---|---|',
'| TX / RX | 그 스트림이 보낸/받은 프레임 수 |',
'| 손실(Dropped) | STC가 **시퀀스 번호로 직접 센 실측 손실** |',
'| 손실률 % | 손실 비율 |',
'| 지연 µs (최소/평균/최대) | 전송 지연(latency) |',
'| 지터 µs | 지연 변동(평균) |',
'| 순서이탈/중복 | 순서 어긋남·중복 수신 프레임 |',
'',
'- **무손실이면 손실=0, TX==RX** 가 됩니다. 맨 아래 합계에 **합격(무손실)/불합격** 판정이 표시됩니다.',
'- 손실은 포트 TX−RX 뺄셈이 아니라 **시그니처(시퀀스) 기반 실측**이라 타이밍에 흔들리지 않습니다.',
'- 정지 시 *송신정지 → 인플라이트 배수 → 정착값 읽기 → 분석정지* 순서라, 손실이 없으면 TX와 RX가 정확히 맞습니다.',
'',
'## 자주 묻는 질문 / 문제해결',
'- **TX와 RX가 다른데 손실이 0?** 개별 스트림 기준으로는 손실이 없으면 TX==RX입니다. (양방향에서 한 *포트*의 TX와 RX는 서로 다른 스트림이라 포트 합산으로 보면 달라 보일 수 있습니다.)',
'- **정지 후 재전송 시 에러?** 세션이 서버 연결을 잃으면(섀시 공유 환경) 자동으로 감지해 새 세션으로 복구합니다(콘솔에 *손상된 전송 세션 정리* 표시). 그래도 *이미 전송 중*이 반복되면 백엔드(서버)를 재시작하세요.',
'- **시작이 오래 걸려요.** 섀시 *연결·예약·매핑(AttachPorts)* 에 시간이 듭니다. 콘솔의 **`⏱ 시작 준비 총 소요`** 로그로 어느 단계가 오래 걸리는지 확인할 수 있습니다.',
'- **스트림이 정의한 개수보다 많이 나와요.** 2단계에서 장비 개수(Count)를 늘리면 한 스트림이 그 수만큼 개별 플로우로 펼쳐집니다(정상).'
].join('\n');function stcHelpClose(){ var ov=document.getElementById('stc-help-ov'); if(ov)ov.remove(); }
// ══════════ 트래픽 시험 위저드 (좌측 단계 메뉴 + 우측 패널) ══════════
const _STC_NAV=[
 {n:1,t:'포트 예약',i:'ti-server-2'},
 {n:2,t:'Device Setting',i:'ti-network'},
 {n:3,t:'Stream Block',i:'ti-route'},
 {n:4,t:'전송 · Result',i:'ti-activity-heartbeat'}
];
let _stcWiz=1; let _stcPick=[]; let _stcWizLoading=false; let _stcDevSel=[]; let _stcDevAnchor=null; // 선택된 디바이스 행들 ["pk|di"]
let _stcInv={};    // 섀시 IP별 인벤토리: {ip:{loading,info:{model,serial,firmware},modules:[...],error}}
let _stcExpand={}; // 섀시 IP별 트리 펼침 상태
let _stcResvInfo='<span style="color:var(--text3);">예약/해제 후 현재 예약 상태가 표시됩니다.</span>';
let _stcMyResv={};  // 우리가 예약한 포트(사용 중) "ip|slot/port"
let _stcPortSt={};  // 포트 실상태 "ip|slot/port" -> 'available'|'reserved_other'|'error'|'unavailable'
let _stcPortWho={}; // 누가 예약했는지 "ip|slot/port" -> 로그인ID 또는 '외부'
let _stcPortLink={}; // 실제 케이블 링크 "ip|slot/port" -> 'up'|'down'
let _stcPortSpeed={}; // 실제 링크속도 "ip|slot/port" -> '10G' 등
function stcRenderNav(){ const el=document.getElementById('stc-nav'); if(!el)return; el.innerHTML=_STC_NAV.map(function(s){ const on=_stcWiz===s.n; return '<div onclick="stcWizGo('+s.n+')" style="display:flex;align-items:center;gap:7px;padding:7px 15px;border-radius:9px;cursor:pointer;white-space:nowrap;flex-shrink:0;background:'+(on?'#2d6fd4':'#fff')+';border:1.5px solid '+(on?'#2d6fd4':'var(--border)')+';color:'+(on?'#fff':'var(--text2)')+';">'+'<span style="width:20px;height:20px;border-radius:50%;background:'+(on?'rgba(255,255,255,0.25)':'var(--bg3)')+';display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0;">'+s.n+'</span><span style="font-size:12.5px;font-weight:'+(on?'800':'600')+';"><i class="ti '+s.i+'" style="margin-right:4px;"></i>'+s.t+'</span></div>'; }).join(''); }
// 왼쪽 포트 상태 패널 (모든 단계에서 항상 표시 — 실 STC All Ports 뷰처럼)
function stcRenderSide(){ var el=document.getElementById('stc-side'); if(!el)return; var e=_bdEsc; var ip=_stcActiveIP(); var inv=_stcInv[ip]||{}; var mods=(inv.modules||[]).filter(function(m){return (m.ports||0)>0;});
  var h='<div style="padding:13px 12px 10px;">'+'<div style="font-size:12px;font-weight:800;color:var(--text2);margin-bottom:10px;"><i class="ti ti-list-check" style="margin-right:5px;color:#2d6fd4;"></i>포트 상태</div>';
  if(!mods.length){ h+='<div style="font-size:11.5px;color:var(--text3);">섀시 연결 대기…</div></div>'; el.innerHTML=h; return; }
  var av=0,mi=0,oth=0,un=0,mine=[];
  mods.forEach(function(m){ for(var p=1;p<=m.ports;p++){ var k=ip+'|'+m.slot+'/'+p; var s=_stcPortSt[k]; if(_stcMyResv[k]){mi++; mine.push(m.slot+'/'+p);} else if(s==='reserved_other')oth++; else if(s==='unavailable'||s==='error')un++; else av++; } });
  mine.sort(function(a,b){var pa=a.split('/'),pb=b.split('/');return (parseInt(pa[0])-parseInt(pb[0]))||(parseInt(pa[1])-parseInt(pb[1]));});
  h+='<div style="font-family:ui-monospace,monospace;font-size:12.5px;font-weight:800;">'+e(ip)+'</div>';
  h+='<div style="font-size:10px;color:var(--text3);margin-bottom:11px;">'+e((inv.info&&inv.info.model)||'')+(inv.info&&inv.info.firmware?(' · FW '+e(inv.info.firmware)):'')+'</div>';
  h+='<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:13px;">'+
     '<span style="font-size:10.5px;font-weight:800;padding:3px 8px;border-radius:6px;background:#e7f6ef;color:#0a7a52;">가능 '+av+'</span>'+
     '<span style="font-size:10.5px;font-weight:800;padding:3px 8px;border-radius:6px;background:#e8f0ff;color:#1b50a8;">내예약 '+mi+'</span>'+
     '<span style="font-size:10.5px;font-weight:800;padding:3px 8px;border-radius:6px;background:#f3edff;color:#7c3aed;">타예약 '+oth+'</span>'+
     (un?('<span style="font-size:10.5px;font-weight:800;padding:3px 8px;border-radius:6px;background:#fdeee0;color:#c2710c;">불가 '+un+'</span>'):'')+'</div>';
  h+='<div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:6px;">내 예약 포트 ('+mine.length+')</div>';
  if(!mine.length){ h+='<div style="font-size:11.5px;color:var(--text3);padding:6px 0;">1단계에서 <b>가능</b> 포트를 클릭해 예약하세요.</div>'; }
  else { mine.forEach(function(pk){ var meta=_stcPortMeta(pk); h+='<div style="display:flex;align-items:center;gap:7px;padding:6px 9px;border-radius:7px;background:rgba(45,111,212,0.07);margin-bottom:4px;"><span style="color:'+(meta.up?'#0a7a52':'#c0414f')+';font-size:10px;">●</span><span style="font-weight:800;font-size:12.5px;">'+pk+'</span><span style="flex:1;"></span><span style="font-size:9.5px;color:var(--text3);font-weight:700;">'+(meta.speed||'')+' '+(meta.up?'Up':'Down')+'</span></div>'; }); }
  h+='</div>'; el.innerHTML=h;
}
function stcWizGo(n){ try{ if(stcCfg){ stcReadForm(); if(typeof _stcReadDevs==='function')_stcReadDevs(); if(typeof _stcReadStreams==='function')_stcReadStreams(); stcSaveCfg(); } }catch(e){} _stcWiz=n; try{localStorage.setItem('utop_stc_wiz',String(n));}catch(e){} stcRenderNav(); stcRenderSide(); stcWizRender(); if(n===1)stcAutoConnect(); stcStartStatusPoll(); }
// 1단계 진입 시 등록된 첫 섀시를 자동 연결(이미 로드/로딩 중이면 건너뜀) — 사용자가 [연결] 안 눌러도 포트가 바로 보이게
function stcAutoConnect(){ var list=stcChassisAll(); if(!list.length)return; var first=list[0].ip; var inv=_stcInv[first]||{}; if(inv.modules||inv.loading)return; _stcExpand[first]=true; stcConnectChassis(first); }
function stcWizRender(){ const el=document.getElementById('stc-wiz'); if(!el)return; if(!stcCfg)stcLoadCfg();
  if(_stcWiz===1){ el.innerHTML=_stcWiz1(); }
  else if(_stcWiz===2) el.innerHTML=_stcWiz3();
  else if(_stcWiz===3) el.innerHTML=_stcWiz4();
  else if(_stcWiz===4){ el.innerHTML=_stcWiz5(); stcRenderRows(); if(typeof stcRenderTxResults==='function')stcRenderTxResults(); }
}
// ── 섀시(계측기) 저장/선택 ──
function stcChassisAll(){ try{ var a=JSON.parse(localStorage.getItem('utop_stc_chassis')); if(Array.isArray(a)&&a.length) return a; }catch(e){} return [{ip:'192.168.5.100',name:'SPT-N11U'}]; }
function stcChassisSave(a){ try{ localStorage.setItem('utop_stc_chassis',JSON.stringify(a)); }catch(e){} }
function stcChassisAdd(){ var ip=((document.getElementById('stc-new-ip')||{}).value||'').trim(); if(!ip){ showToast('섀시 IP를 입력하세요'); return; } var nm=((document.getElementById('stc-new-name')||{}).value||'').trim(); var a=stcChassisAll(); if(!a.some(function(x){return x.ip===ip;})){ a.push({ip:ip,name:nm||ip}); stcChassisSave(a); } stcChassisSelect(ip); }
function stcChassisSelect(ip){ if(!stcCfg)stcLoadCfg(); stcCfg.chassis=ip; stcSaveCfg(); _stcRealModules=null; _stcConnInfo=null; stcWizRender(); }
function stcChassisDel(ip){ var a=stcChassisAll().filter(function(x){return x.ip!==ip;}); stcChassisSave(a); if(stcCfg.chassis===ip){ stcCfg.chassis=(a[0]&&a[0].ip)||''; stcSaveCfg(); } stcWizRender(); }
async function stcDisconnectChassis(ip){
  stcConsole('▶ 섀시 연결 해제: '+ip);
  try{ stcCfg.chassis=ip; var d=await _stcStepCall('disconnect');
    if(d&&d.ok){ stcConsole('  ✔ 연결 해제됨'); showToast(ip+' 연결 해제'); }
    else { stcConsole('  ✘ 해제 실패: '+((d&&d.error)||'')); showToast('해제 실패'); }
  }catch(e){ stcConsole('  ✘ 호출 실패: '+e.message); }
  delete _stcInv[ip]; Object.keys(_stcPortSt).forEach(function(k){ if(k.split('|')[0]===ip) delete _stcPortSt[k]; }); stcWizRender();
}// 인벤토리 캐시 — 새로고침해도 포트 구성/펼침/예약상태 유지
function stcInvSave(){ try{ localStorage.setItem('utop_stc_inv', JSON.stringify({inv:_stcInv,exp:_stcExpand,my:_stcMyResv})); }catch(e){} }
function stcInvLoad(){ try{ var d=JSON.parse(localStorage.getItem('utop_stc_inv')); if(d){ _stcInv=d.inv||{}; _stcExpand=d.exp||{}; _stcMyResv=d.my||{}; Object.keys(_stcInv).forEach(function(ip){ if(_stcInv[ip]&&_stcInv[ip].loading)_stcInv[ip].loading=false; }); } }catch(e){} }
// 섀시(IP) → Slot → Port 계층 트리
async function stcConnectChassis(ip){ if(!stcCfg)stcLoadCfg(); _stcInv[ip]=Object.assign({},_stcInv[ip],{loading:true,error:null}); _stcExpand[ip]=true; stcWizRender();
  stcConsole('▶ 연결 & 포트 구성: '+ip+' …(10~20초)');
  try{ var r=await fetch('/api/stc/conncheck',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chassis:ip,restIp:stcCfg.restIp,restPort:stcCfg.restPort})}); var d=await r.json();
    if(d&&d.ok){ _stcInv[ip]={loading:false,info:{model:d.model,serial:d.serial,firmware:d.firmware},modules:d.modules||[]};
      // 포트별 실상태(예약/링크) → _stcPortSt 갱신
      Object.keys(_stcPortSt).forEach(function(k){ if(k.split('|')[0]===ip) delete _stcPortSt[k]; });
      (d.modules||[]).forEach(function(m){ (m.port_detail||[]).forEach(function(pd){ var key=ip+'|'+m.slot+'/'+pd.index; if(pd.status==='reserved') _stcPortSt[key]='reserved_other'; else if(pd.status==='error') _stcPortSt[key]='error'; }); });
      // 우리 세션의 예약 포트는 '사용 중'으로 구분(conncheck는 소유자가 같아 구분 불가)
      try{ stcCfg.chassis=ip; var sd=await _stcStepCall('status'); Object.keys(_stcMyResv).forEach(function(k){ if(k.split('|')[0]===ip) delete _stcMyResv[k]; }); ((sd&&sd.ports)||[]).forEach(function(p){ var nm=String(p).split(' ')[0]; var mt=nm.match(/p(\d+)_(\d+)/); if(mt) _stcMyResv[ip+'|'+mt[1]+'/'+mt[2]]=true; }); }catch(e){}
      stcConsole('  ✔ '+(d.model||'')+' · 모듈 '+(d.modules||[]).filter(function(m){return m.ports>0;}).length+'개'); showToast(ip+' 연결됨'); }
    else { _stcInv[ip]={loading:false,error:(d&&d.error)||'실패'}; stcConsole('  ✘ '+ip+' 연결 실패: '+((d&&d.error)||'')); showToast('연결 실패'); } }
  catch(e){ _stcInv[ip]={loading:false,error:e.message}; stcConsole('  ✘ 호출 실패: '+e.message); }
  stcInvSave(); stcWizRender();
}
function stcToggleChassis(ip){ _stcExpand[ip]=!_stcExpand[ip]; var inv=_stcInv[ip]||{}; if(_stcExpand[ip]&&!inv.modules&&!inv.loading){ stcConnectChassis(ip); return; } stcInvSave(); stcWizRender(); }
// 트리만 갱신(깜빡임 없이 포트 색상/상태 업데이트)
function stcRenderTree(){ var el=document.getElementById('stc-tree'); if(el)el.innerHTML=_stcChassisTree(); }
// 포트 클릭 = 이벤트 위임 (트리 innerHTML 이 폴링마다 바뀌어도 안정적)
function _stcWizClick(ev){ var el=ev.target; while(el && el.getAttribute){ var pk=el.getAttribute('data-pk'); if(pk){ stcPortClick(pk); return; }
    var act=el.getAttribute('data-act');
    if(act){ var dpk=el.getAttribute('data-dpk'); var di=parseInt(el.getAttribute('data-di'),10); var pidx=parseInt(el.getAttribute('data-pidx'),10);
      if(act==='copy')stcDevCopy(dpk,di);
      else if(act==='del')stcDevRemove(dpk,di);
      else if(act==='add')stcDevAdd(dpk,pidx);
      else if(act==='mode')stcDevMode(dpk,di,el.getAttribute('data-m'));
      else if(act==='selrow'){ _stcDevSelClick(dpk+'|'+di, ev.shiftKey, ev.ctrlKey||ev.metaKey); stcWizRender(); }
      else if(act==='stadd')stcStreamAdd();
      else if(act==='stcopy')stcStreamCopy(di);
      else if(act==='stdel')stcStreamRemove(di);
      return; }
    el=el.parentNode; } }
// 다중 행 선택: 클릭=단일, Ctrl/Cmd+클릭=토글, Shift+클릭=범위(같은 포트 내)
function _stcDevSelClick(k, shift, ctrl){
  if(ctrl){ var i=_stcDevSel.indexOf(k); if(i>=0)_stcDevSel.splice(i,1); else _stcDevSel.push(k); _stcDevAnchor=k; }
  else if(shift && _stcDevAnchor){ var ap=_stcDevAnchor.split('|'), kp=k.split('|'); if(ap[0]===kp[0]){ var a=parseInt(ap[1],10), b=parseInt(kp[1],10), lo=Math.min(a,b), hi=Math.max(a,b); _stcDevSel=[]; for(var di=lo;di<=hi;di++)_stcDevSel.push(ap[0]+'|'+di); } else { _stcDevSel=[k]; _stcDevAnchor=k; } }
  else { _stcDevSel=(_stcDevSel.length===1&&_stcDevSel[0]===k)?[]:[k]; _stcDevAnchor=k; } }
function stcDevSelClear(){ _stcDevSel=[]; _stcDevAnchor=null; stcWizRender(); }
// 선택 행들을 아래(각 포트 끝)에 복사 + MAC/IP 자동 증가
function stcDevSelCopyDown(){ if(!_stcDevSel.length){showToast('행을 먼저 선택하세요(#번호 클릭)');return;} stcReadForm(); _stcReadDevs();
  var byPort={}; _stcDevSel.forEach(function(k){ var a=k.split('|'); (byPort[a[0]]=byPort[a[0]]||[]).push(parseInt(a[1],10)); });
  var added=0; Object.keys(byPort).forEach(function(pk){ var l=_stcDevList(pk,0); byPort[pk].sort(function(x,y){return x-y;}).forEach(function(di){ var s=l[di]; if(!s)return; var c=parseInt(s.count,10)||1; var nd=JSON.parse(JSON.stringify(s)); nd.name=(s.name||'Device')+'_copy'; nd.mac=_macInc(s.mac,c); nd.ip=_ipInc(s.ip,c); l.push(nd); added++; }); });
  stcSaveCfg(); _stcDevSel=[]; _stcDevAnchor=null; stcWizRender(); showToast('선택 행 '+added+'개 복사(+증가)'); }
// 선택 행들 삭제
function stcDevSelDelMulti(){ if(!_stcDevSel.length){showToast('행을 먼저 선택하세요');return;} stcReadForm(); _stcReadDevs();
  var byPort={}; _stcDevSel.forEach(function(k){ var a=k.split('|'); (byPort[a[0]]=byPort[a[0]]||[]).push(parseInt(a[1],10)); });
  Object.keys(byPort).forEach(function(pk){ var l=_stcDevList(pk,0); byPort[pk].sort(function(x,y){return y-x;}).forEach(function(di){ if(l.length>1)l.splice(di,1); }); });
  stcSaveCfg(); _stcDevSel=[]; _stcDevAnchor=null; stcWizRender(); }
// 연결된 첫 섀시 IP
function _stcActiveIP(){ var ks=Object.keys(_stcInv); for(var i=0;i<ks.length;i++){ if(_stcInv[ks[i]]&&_stcInv[ks[i]].modules) return ks[i]; } return stcCfg&&stcCfg.chassis; }
// 실시간 포트 상태 폴링 (영속 세션 portstatus, 초고속)
let _stcStatusTimer=null;
// 위저드 안 입력 요소에 포커스가 있는지 — 있으면 폴링/재렌더 스킵 (입력 중 포커스 손실 방지)
function _stcInputHasFocus(){ try{ var a=document.activeElement; if(!a) return false; var tag=(a.tagName||'').toUpperCase(); if(tag!=='INPUT'&&tag!=='SELECT'&&tag!=='TEXTAREA') return false;
  var host=document.getElementById('stc-wiz')||document.getElementById('stc-side')||document.getElementById('stc-tree');
  return !!(host && host.contains(a)); }catch(e){ return false; } }
async function stcPollStatus(){ if(_stcBusy||_stcClickBusy)return; /* 클릭 처리 중엔 폴링이 끼어들어 덮어쓰지 않게 */
  if(_stcInputHasFocus()) return;   // 입력 중이면 재렌더 스킵 (다음 주기에 반영)
  if(!document.getElementById('stc-side')){ stcStopStatusPoll(); return; } var ip=_stcActiveIP(); if(!ip||!_stcInv[ip]||!_stcInv[ip].modules)return;
  try{ stcCfg.chassis=ip; var d=await _stcStepCall('portstatus'); if(d&&d.ok&&d.ports){
    Object.keys(_stcPortSt).forEach(function(k){if(k.split('|')[0]===ip)delete _stcPortSt[k];});
    Object.keys(_stcMyResv).forEach(function(k){if(k.split('|')[0]===ip)delete _stcMyResv[k];});
    Object.keys(_stcPortWho).forEach(function(k){if(k.split('|')[0]===ip)delete _stcPortWho[k];});
    Object.keys(_stcPortLink).forEach(function(k){if(k.split('|')[0]===ip)delete _stcPortLink[k];});
    Object.keys(_stcPortSpeed).forEach(function(k){if(k.split('|')[0]===ip)delete _stcPortSpeed[k];});
    d.ports.forEach(function(r){ var key=ip+'|'+r.slot+'/'+r.port; if(r.status==='mine'){_stcMyResv[key]=true; if(r.who)_stcPortWho[key]=r.who;} else if(r.status==='other'){_stcPortSt[key]='reserved_other'; _stcPortWho[key]=r.who||'외부';} else if(r.status==='unavailable')_stcPortSt[key]='unavailable'; if(r.link)_stcPortLink[key]=r.link; if(r.speed)_stcPortSpeed[key]=r.speed; });
    stcInvSave(); if(document.getElementById('stc-tree'))stcRenderTree(); stcRenderSide();
  } }catch(e){} }
function stcStartStatusPoll(){ if(_stcStatusTimer)clearInterval(_stcStatusTimer); _stcStatusTimer=setInterval(stcPollStatus,4000); stcPollStatus(); }
function stcStopStatusPoll(){ if(_stcStatusTimer){clearInterval(_stcStatusTimer);_stcStatusTimer=null;} }
// 슬롯 폴더 펼침/접힘 (기본 펼침)
let _stcSlotExpand={};
function stcToggleSlot(sKey){ _stcSlotExpand[sKey]=(_stcSlotExpand[sKey]===false); stcRenderTree(); }
// 슬롯 전체 예약: 해당 슬롯의 '가능' 포트를 한 번에 예약
async function stcSlotReserveAll(ip,slot){ if(_stcClickBusy){showToast('처리 중…');return;} var inv=_stcInv[ip]; if(!inv||!inv.modules){showToast('연결 먼저');return;} var mod=inv.modules.filter(function(m){return parseInt(m.slot,10)===slot;})[0]; if(!mod)return;
  var ports=[]; for(var p=1;p<=mod.ports;p++){ var k=ip+'|'+slot+'/'+p; var s=_stcPortSt[k]; if(!_stcMyResv[k]&&s!=='reserved_other'&&s!=='unavailable'&&s!=='error') ports.push(slot+'/'+p); }
  if(!ports.length){showToast('예약 가능한 포트 없음');return;} stcReadForm(); stcCfg.chassis=ip; _stcClickBusy=true; stcConsole('▶ 슬롯 '+slot+' 전체 예약 '+ports.length+'개 …'); showToast('예약 중…');
  try{ var d=await _stcStepCall('reserve',{ports:ports.join(',')}); var rok=((d&&d.reserved)||[]).length, fl=((d&&d.failed)||[]).length; stcConsole('  ✔ 예약 '+rok+'개'+(fl?(' · ✘ 실패 '+fl):'')); showToast(fl?('예약 '+rok+' · 실패 '+fl):'예약 완료 '+rok+'개'); await stcPollStatus(); stcRenderTree(); }
  catch(e){ stcConsole('  ✘ '+e.message); } finally{_stcClickBusy=false;} }
// 슬롯 전체 해제: 해당 슬롯의 '내 예약' 포트를 한 번에 해제
async function stcSlotReleaseAll(ip,slot){ if(_stcClickBusy){showToast('처리 중…');return;} var ports=Object.keys(_stcMyResv).filter(function(k){var a=k.split('|');return a[0]===ip&&a[1].split('/')[0]===String(slot);}).map(function(k){return k.split('|')[1];});
  if(!ports.length){showToast('해제할 내 예약 없음');return;} stcReadForm(); stcCfg.chassis=ip; _stcClickBusy=true; stcConsole('▶ 슬롯 '+slot+' 전체 해제 '+ports.length+'개 …'); showToast('해제 중…');
  try{ var d=await _stcStepCall('releaseports',{ports:ports.join(',')}); stcConsole((d&&d.ok)?('  ✔ 해제 '+ports.length+'개'):('  ✘ 해제 실패')); await stcPollStatus(); stcRenderTree(); }
  catch(e){ stcConsole('  ✘ '+e.message);} finally{_stcClickBusy=false;} }
// 강제 리셋(Force User Off): 다른 사용자가 예약한 포트를 강제로 해제 → 사용 가능 상태로
async function stcForceReset(ip,portstr){ if(_stcState.running){ showToast('전송 중에는 포트를 변경할 수 없습니다 — 정지 후'); return; } if(_stcClickBusy){showToast('처리 중…');return;} if(!confirm('포트 '+portstr+' 의 다른 사용자 예약을 강제로 해제합니다.\n실제 사용 중이면 그 사용자의 작업이 중단될 수 있습니다.\n계속할까요?'))return; stcReadForm(); stcCfg.chassis=ip; _stcClickBusy=true; stcConsole('▶ 강제 리셋 '+portstr+' …'); showToast('강제 리셋 중…');
  try{ var d=await _stcStepCall('forcereset',{ports:portstr}); var ok=((d&&d.reset)||[]).length; stcConsole((d&&d.ok&&ok)?('  ✔ 강제 리셋 '+ok+'개'):('  ✘ 실패: '+(((d&&d.failed)||[]).length?'명령 거부':((d&&d.error)||'')))); showToast(ok?('강제 리셋 '+ok+'개'):'강제 리셋 실패'); await stcPollStatus(); stcRenderTree(); }
  catch(e){ stcConsole('  ✘ '+e.message);} finally{_stcClickBusy=false;} }
async function stcSlotForceReset(ip,slot){ if(_stcClickBusy){showToast('처리 중…');return;} var ports=Object.keys(_stcPortSt).filter(function(k){var a=k.split('|');return a[0]===ip&&a[1].split('/')[0]===String(slot)&&_stcPortSt[k]==='reserved_other';}).map(function(k){return k.split('|')[1];}); if(!ports.length){showToast('강제 리셋할 타 예약 없음');return;} if(!confirm('슬롯 '+slot+' 의 다른 사용자 예약 '+ports.length+'개를 강제 해제합니다.\n계속할까요?'))return; stcReadForm(); stcCfg.chassis=ip; _stcClickBusy=true; stcConsole('▶ 슬롯 '+slot+' 강제 리셋 '+ports.length+'개 …'); showToast('강제 리셋 중…');
  try{ var d=await _stcStepCall('forcereset',{ports:ports.join(',')}); var ok=((d&&d.reset)||[]).length; stcConsole((d&&d.ok)?('  ✔ 강제 리셋 '+ok+'개'+(((d&&d.failed)||[]).length?(' · 실패 '+d.failed.length):'')):'  ✘ 실패'); showToast('강제 리셋 '+ok+'개'); await stcPollStatus(); stcRenderTree(); }
  catch(e){ stcConsole('  ✘ '+e.message);} finally{_stcClickBusy=false;} }
function _stcChassisPorts(ip,modules){ var e=_bdEsc; var mods=(modules||[]).filter(function(m){return (m.ports||0)>0;}).map(function(m){ var md=m.model||''; return {slot:parseInt(m.slot,10),model:md,ports:m.ports,speed:(/10G/.test(md)?'10G':/1G/.test(md)?'1G':'')}; });
  if(!mods.length) return '<div style="padding:12px 24px;color:var(--text3);font-size:12px;">사용 가능한 포트 없음</div>';
  var _myname=(typeof currentUser!=='undefined'&&currentUser&&currentUser.username)||'나';
  var _av=0,_mi=0,_oth=0,_un=0,_er=0; mods.forEach(function(m){ for(var pp=1;pp<=m.ports;pp++){ var kk=ip+'|'+m.slot+'/'+pp; var s=_stcPortSt[kk]; if(_stcMyResv[kk])_mi++; else if(s==='unavailable')_un++; else if(s==='error')_er++; else if(s==='reserved_other')_oth++; else _av++; } });
  var summary='<div style="padding:6px 16px;font-size:11px;background:#fbfcfd;border-top:1px solid #eef0f3;">Status: <b style="color:#0a7a52;">가능 '+_av+'</b> · <b style="color:#1b50a8;">예약(내 '+_mi+')</b> · <b style="color:#7c3aed;">예약(타 '+_oth+')</b>'+((_un+_er)?(' · <b style="color:#c2710c;">불가능 '+(_un+_er)+'</b>'):'')+'</div>';
  var th='padding:5px 10px;font-size:10.5px;font-weight:800;color:#5a6072;';
  var header='<div style="display:flex;align-items:center;background:#eef1f5;border-top:1px solid #cfd4dc;border-bottom:1px solid #cfd4dc;">'+
    '<span style="'+th+'width:34px;"></span><span style="'+th+'flex:1;">Connection Name</span><span style="'+th+'width:150px;">Speed (Link)</span><span style="'+th+'width:210px;">Status</span></div>';
  var body=mods.map(function(m){
    var sKey=ip+'|'+m.slot; var sOpen=(_stcSlotExpand[sKey]!==false);
    var sav=0,smi=0,soth=0,sbad=0; for(var q=1;q<=m.ports;q++){ var kq=ip+'|'+m.slot+'/'+q; var sq=_stcPortSt[kq]; if(_stcMyResv[kq])smi++; else if(sq==='reserved_other')soth++; else if(sq==='unavailable'||sq==='error')sbad++; else sav++; }
    var bs='font-size:10px;padding:3px 9px;border-radius:6px;cursor:pointer;font-weight:800;margin-left:5px;';
    var sbtn='';
    if(sav>0) sbtn+='<button onclick="event.stopPropagation();stcSlotReserveAll(\''+ip+'\','+m.slot+')" style="'+bs+'border:1px solid #00a872;background:#fff;color:#00875a;">전체 예약 '+sav+'</button>';
    if(smi>0) sbtn+='<button onclick="event.stopPropagation();stcSlotReleaseAll(\''+ip+'\','+m.slot+')" style="'+bs+'border:1px solid #c0414f;background:#fff;color:#c0414f;">전체 해제 '+smi+'</button>';
    if(soth>0) sbtn+='<button onclick="event.stopPropagation();stcSlotForceReset(\''+ip+'\','+m.slot+')" style="'+bs+'border:1px solid #d97706;background:#fff7ed;color:#b45309;" title="이 슬롯의 다른 사용자 예약을 강제 해제(Force User Off)">⚠ 강제 리셋 '+soth+'</button>';
    var slotHdr='<div onclick="stcToggleSlot(\''+sKey+'\')" style="display:flex;align-items:center;padding:6px 10px 6px 12px;background:#f4f6f9;font-size:11px;font-weight:700;color:var(--text2);border-top:1px solid #e3e7ec;cursor:pointer;">'+
      '<i class="ti ti-chevron-'+(sOpen?'down':'right')+'" style="width:15px;color:var(--text3);"></i>'+
      '<i class="ti ti-folder'+(sOpen?'-open':'')+'" style="color:#e8a93c;margin-right:5px;"></i>'+
      'Slot '+m.slot+' <span style="color:var(--text3);font-weight:500;margin-left:3px;">· '+e(m.model)+'</span>'+
      '<span style="font-size:10px;color:var(--text3);font-weight:600;margin-left:8px;">가능 '+sav+(smi?(' · 내예약 '+smi):'')+(soth?(' · 타예약 '+soth):'')+(sbad?(' · 불가 '+sbad):'')+'</span>'+
      '<span style="flex:1;"></span>'+sbtn+'</div>';
    if(!sOpen) return slotHdr;
    var rows='';
    for(var p=1;p<=m.ports;p++){ var key=ip+'|'+m.slot+'/'+p; var st=_stcPortSt[key]; var mine=!!_stcMyResv[key]; var resvOther=(st==='reserved_other'); var unav=(st==='unavailable'); var err=(st==='error'); var blocked=resvOther||unav||err;
      var scol,stext,chkBg,chkBd,chkTxt;
      if(mine){ scol='#1b50a8'; stext='● 예약 ('+e(_stcPortWho[key]||_myname)+')'; chkBg='#2d6fd4';chkBd='#2d6fd4';chkTxt='✓'; }
      else if(resvOther){ var who=_stcPortWho[key]||'외부'; scol='#7c3aed'; stext='● 예약 ('+e(who)+')'; chkBg='#efe9fc';chkBd='#c4b0ef';chkTxt=''; }
      else if(unav){ scol='#c2710c'; stext='◐ 불가능 (전환 중)'; chkBg='#fff4e6';chkBd='#f0b37a';chkTxt=''; }
      else if(err){ scol='#c0414f'; stext='✕ 불가능 (Link Error)'; chkBg='#fdecee';chkBd='#e88a95';chkTxt=''; }
      else { scol='#0a7a52'; stext='● 가능'; chkBg='#fff';chkBd='#00a872';chkTxt=''; }
      var clickable=mine||!blocked; var td='padding:6px 10px;font-size:12px;';
      var xbtn=resvOther?('<button onclick="event.stopPropagation();stcForceReset(\''+ip+'\',\''+m.slot+'/'+p+'\')" style="font-size:9.5px;padding:2px 7px;border-radius:5px;border:1px solid #d97706;background:#fff7ed;color:#b45309;cursor:pointer;font-weight:800;margin-left:8px;" title="이 포트의 다른 사용자 예약을 강제 해제">⚠ 강제</button>'):'';
      rows+='<div '+(clickable?('data-pk="'+key+'" '):'')+'title="'+(mine?'클릭하면 해제':(blocked?'사용 불가':'클릭하면 예약'))+'" style="display:flex;align-items:center;border-top:1px solid #f2f3f5;'+(clickable?'cursor:pointer;':'cursor:not-allowed;opacity:0.85;')+'background:'+(mine?'rgba(45,111,212,0.06)':'#fff')+';">'+
        '<span style="'+td+'width:34px;text-align:center;"><span style="display:inline-flex;width:16px;height:16px;border-radius:4px;border:1.5px solid '+chkBd+';background:'+chkBg+';align-items:center;justify-content:center;color:#fff;font-size:8px;font-weight:800;">'+chkTxt+'</span></span>'+
        '<span style="'+td+'flex:1;font-weight:600;">Port '+p+' <span style="color:var(--text3);font-weight:400;font-size:11px;">(Group '+p+')</span></span>'+
        '<span style="'+td+'width:150px;color:var(--text3);">'+(err?'Link Error, ':'Link Up, ')+e(m.speed)+'</span>'+
        '<span style="'+td+'width:230px;font-weight:700;color:'+scol+';">'+stext+xbtn+'</span>'+
      '</div>';
    }
    return slotHdr+rows;
  }).join('');
  return summary+header+body;
}
function _stcChassisTree(){ var list=stcChassisAll(); var e=_bdEsc;
  return '<div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;">'+
   '<div style="display:flex;padding:7px 12px;background:#eef1f5;font-size:10.5px;font-weight:800;color:#5a6072;border-bottom:1px solid #cfd4dc;"><span style="flex:1;">Connection Name (IP · Slot · Port)</span><span style="width:130px;">Speed</span><span style="width:120px;">Status</span><span style="width:70px;"></span></div>'+
   list.map(function(x){ var inv=_stcInv[x.ip]||{}; var open=!!_stcExpand[x.ip]; var loaded=!!inv.modules;
     var head='<div onclick="stcToggleChassis(\''+x.ip+'\')" style="display:flex;align-items:center;padding:8px 12px;border-bottom:1px solid #eef0f3;cursor:pointer;background:#f6f9ff;">'+
       '<i class="ti ti-chevron-'+(open?'down':'right')+'" style="width:16px;color:var(--text3);"></i>'+
       '<i class="ti ti-router" style="color:#2d6fd4;margin-right:6px;"></i>'+
       '<span style="flex:1;font-weight:800;font-size:12.5px;font-family:ui-monospace,monospace;">'+e(x.ip)+(x.name&&x.name!==x.ip?(' <span style="color:var(--text3);font-weight:500;font-family:inherit;">'+e(x.name)+'</span>'):'')+(inv.info?(' <span style="color:var(--text3);font-weight:500;font-family:inherit;">· '+e(inv.info.model||'')+'</span>'):'')+'</span>'+
       '<span style="width:130px;font-size:11px;color:var(--text3);">'+(inv.info?('FW '+e(inv.info.firmware||'')):'')+'</span>'+
       '<span style="width:120px;font-size:11px;font-weight:700;color:'+(loaded?'#00875a':(inv.error?'#e53e5a':'var(--text3)'))+';">'+(inv.loading?'연결 중…':loaded?'Connected':(inv.error?'오류':'미연결'))+'</span>'+
       '<button onclick="event.stopPropagation();stcConnectChassis(\''+x.ip+'\')" style="font-size:10.5px;padding:3px 11px;border-radius:6px;border:1px solid #2d6fd4;background:#fff;color:#2d6fd4;cursor:pointer;font-weight:700;white-space:nowrap;">'+(loaded?'재연결':'연결')+'</button>'+
       (loaded?'<button onclick="event.stopPropagation();stcDisconnectChassis(\''+x.ip+'\')" title="섀시 연결 해제" style="font-size:10.5px;padding:3px 9px;border-radius:6px;border:1px solid #e08a2e;background:#fff;color:#c2710c;cursor:pointer;font-weight:700;margin-left:4px;"><i class="ti ti-plug-x" style="font-size:12px;"></i> 해제</button>':'')+
       '<button onclick="event.stopPropagation();stcChassisDel(\''+x.ip+'\')" style="margin-left:4px;border:none;background:transparent;color:var(--text3);cursor:pointer;font-size:13px;"><i class="ti ti-trash"></i></button>'+
     '</div>';
     var body='';
     if(open){ if(inv.loading){ body='<div style="padding:16px;text-align:center;color:#2d6fd4;font-size:12px;"><i class="ti ti-loader-2"></i> 포트 구성 조회 중… (10~20초)</div>'; }
       else if(loaded){ body=_stcChassisPorts(x.ip,inv.modules); }
       else if(inv.error){ body='<div style="padding:14px 24px;color:#e53e5a;font-size:12px;">연결 오류: '+e(inv.error)+'</div>'; }
       else { body='<div style="padding:14px 24px;color:var(--text3);font-size:12px;">[연결]을 눌러 포트 구성을 불러오세요.</div>'; } }
     return head+body;
   }).join('')+'</div>';
}
// 포트 클릭 = 즉시 예약/해제 토글 (가능→예약, 내 예약→해제). 남의 예약/불가능은 막음.
let _stcClickBusy=false;
async function stcPortClick(key){ if(_stcState.running){ showToast('전송 중에는 포트를 변경할 수 없습니다 — 정지 후 변경'); return; } if(_stcClickBusy){ showToast('처리 중…'); return; } var st=_stcPortSt[key]; var mine=!!_stcMyResv[key];
  if(!mine && (st==='reserved_other'||st==='unavailable'||st==='error')){ showToast(st==='reserved_other'?'다른 사용자 예약 — 사용 불가':'불가능 포트'); return; }
  var ip=key.split('|')[0], pp=key.split('|')[1]; stcReadForm(); stcCfg.chassis=ip; _stcClickBusy=true;
  var _me=(currentUser&&currentUser.username)||'admin';
  // ① 클릭 즉시 포트가 먼저 반응(실 STC처럼) — 서버 호출 전에 낙관적 반영
  if(mine){ delete _stcMyResv[key]; delete _stcPortSt[key]; delete _stcPortWho[key]; }
  else { _stcMyResv[key]=true; delete _stcPortSt[key]; _stcPortWho[key]=_me; }
  stcInvSave(); stcRenderTree();
  try{
    if(mine){ stcConsole('▶ 해제 '+pp+' …'); var d=await _stcStepCall('releaseports',{ports:pp});
      if(d&&d.ok){ stcConsole('  ✔ 해제 '+pp); }
      else { stcConsole('  ✘ 해제 실패: '+((d&&d.error)||'')); showToast('해제 실패'); _stcMyResv[key]=true; _stcPortWho[key]=_me; stcRenderTree(); /* 되돌림 */ } }
    else { stcConsole('▶ 예약 '+pp+' …'); var d=await _stcStepCall('reserve',{ports:pp});
      if(d&&d.ok&&(d.reserved||[]).length){ stcConsole('  ✔ 예약 '+pp); }
      else { stcConsole('  ✘ 예약 실패(이미 사용 중) '+pp); showToast('이미 예약된 포트'); delete _stcMyResv[key]; _stcPortSt[key]='reserved_other'; _stcPortWho[key]='외부'; stcRenderTree(); /* 되돌림 */ } }
    await stcPollStatus(); stcRenderTree(); /* 서버 실상태로 확정 */
  }catch(e){ stcConsole('  ✘ 호출 실패: '+e.message); }
  finally{ _stcClickBusy=false; }
}
// ── 1단계: 계측기 선택 ──
function _stcWiz1(){ var fld='font-size:13px;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;outline:none;box-sizing:border-box;background:#fff;';
  return '<div style="font-size:16px;font-weight:800;margin-bottom:4px;">1. 계측기 선택 · 포트 할당</div>'+
    '<div style="font-size:12px;color:var(--text3);margin-bottom:10px;">섀시 [연결] 후, <b style="color:#00875a;">가능</b> 포트를 클릭하면 바로 예약(내 예약=파랑), <b style="color:#1b50a8;">내 예약</b>을 클릭하면 해제됩니다. 예약은 해제 전까지 유지.</div>'+
    '<div id="stc-tree">'+_stcChassisTree()+'</div>'+
    '<div style="display:flex;gap:8px;margin:12px 0 14px;"><input id="stc-new-ip" placeholder="섀시 IP 추가 (예: 192.168.5.101)" style="'+fld+'flex:1;"><input id="stc-new-name" placeholder="이름(선택)" style="'+fld+'width:120px;"><button onclick="stcChassisAdd()" style="font-size:12.5px;padding:8px 16px;border-radius:8px;border:none;background:#00a872;color:#fff;cursor:pointer;font-weight:800;">+ 섀시 등록</button></div>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:4px;"><span style="font-size:12px;color:var(--text3);"><i class="ti ti-click" style="margin-right:3px;"></i>포트를 클릭하면 바로 <b style="color:#00875a;">예약</b>, 내 예약을 클릭하면 <b style="color:#c0414f;">해제</b>됩니다.</span><span style="flex:1;"></span><button onclick="stcWizGo(2)" style="font-size:12.5px;padding:8px 16px;border-radius:8px;border:none;background:#2d6fd4;color:#fff;cursor:pointer;font-weight:800;">다음: 가상 장비 →</button></div>';
}
function _stcPickIP(){ return _stcPick.length?_stcPick[0].split('|')[0]:stcCfg.chassis; }
function _stcPickPorts(ip){ return _stcPick.filter(function(k){return k.split('|')[0]===ip;}).map(function(k){return k.split('|')[1];}); }
// 내가 예약한 포트(해당 섀시) — 트래픽 단계의 A/B 후보
function _stcMyResvPorts(ip){ ip=ip||_stcActiveIP(); return Object.keys(_stcMyResv).filter(function(k){return k.split('|')[0]===ip;}).map(function(k){return k.split('|')[1];}).sort(function(a,b){var pa=a.split('/'),pb=b.split('/');return (parseInt(pa[0])-parseInt(pb[0]))||(parseInt(pa[1])-parseInt(pb[1]));}); }// 선택한 포트만 해제 (선택 없으면 아무것도 안 함 — 전체 해제 사고 방지)// 전체 해제(세션 종료) — 명시적// ── 3단계: 가상 장비 ──
// ── 2단계: Device Setting (예약 포트별 L2/L3 가상 장비) ──
// 포트당 디바이스 '리스트'(여러 개). 각 디바이스: 이름·모드(L2/L3)·MAC/IP/GW/Prefix·Count·step.
function _stcDevDefault(pidx,di){ var pi=('0'+((pidx+1)&255).toString(16)).slice(-2); var dh=('0'+((di+1)&255).toString(16)).slice(-2); return {name:'Device_'+(pidx+1)+'_'+(di+1),mode:'L3',mac:'00:10:94:'+pi+':00:'+dh,ip:'10.'+(pidx+1)+'.'+(di+1)+'.1',gw:'10.'+(pidx+1)+'.'+(di+1)+'.254',prefix:24,count:1,macStep:'00:00:00:00:00:01',ipStep:'0.0.0.1',gwStep:'0.0.0.0'}; }
function _stcDevList(pk,pidx){ if(!stcCfg.devs)stcCfg.devs={}; var v=stcCfg.devs[pk]; if(!Array.isArray(v)){ stcCfg.devs[pk]=(v&&typeof v==='object')?[v]:[_stcDevDefault(pidx,0)]; } if(!stcCfg.devs[pk].length)stcCfg.devs[pk].push(_stcDevDefault(pidx,0)); return stcCfg.devs[pk]; }
function _stcReadDevs(){ if(!stcCfg.devs)stcCfg.devs={}; _stcMyResvPorts().forEach(function(pk,pidx){ var list=_stcDevList(pk,pidx); var base='stc-dev-'+pk.replace('/','_'); list.forEach(function(d,di){ var id=base+'-'+di; var g=function(s){var el=document.getElementById(id+s);return el?el.value.trim():null;}; var v; if((v=g('-name'))!==null)d.name=v||d.name; if((v=g('-mac'))!==null)d.mac=v||d.mac; if((v=g('-ip'))!==null)d.ip=v||d.ip; if((v=g('-gw'))!==null)d.gw=v||d.gw; if((v=g('-prefix'))!==null)d.prefix=parseInt(v,10)||d.prefix; if((v=g('-count'))!==null)d.count=Math.max(1,parseInt(v,10)||1); if((v=g('-macstep'))!==null)d.macStep=v||d.macStep; if((v=g('-ipstep'))!==null)d.ipStep=v||d.ipStep; if((v=g('-gwstep'))!==null)d.gwStep=v||d.gwStep; }); }); }
function stcDevMode(pk,di,m){ stcReadForm(); _stcReadDevs(); _stcDevList(pk,0)[di].mode=m; stcSaveCfg(); stcWizRender(); }
function stcDevCountChange(){ stcReadForm(); _stcReadDevs(); stcSaveCfg(); stcWizRender(); }
function stcDevAdd(pk,pidx){ stcReadForm(); _stcReadDevs(); var l=_stcDevList(pk,pidx); l.push(_stcDevDefault(pidx,l.length)); stcSaveCfg(); stcWizRender(); }
function stcDevRemove(pk,di){ stcReadForm(); _stcReadDevs(); var l=_stcDevList(pk,0); if(l.length>1)l.splice(di,1); stcSaveCfg(); stcWizRender(); }
function _ipInc(ip,n){ try{ var p=String(ip).split('.').map(function(x){return parseInt(x,10);}); if(p.length!==4||p.some(isNaN))return ip; var v=(p[0]*16777216+p[1]*65536+p[2]*256+p[3]+n)>>>0; return [Math.floor(v/16777216)%256,Math.floor(v/65536)%256,Math.floor(v/256)%256,v%256].join('.'); }catch(e){return ip;} }
function _macInc(mac,n){ try{ var h=String(mac).split(':'); if(h.length!==6)return mac; var v=0; for(var i=0;i<6;i++)v=v*256+parseInt(h[i],16); v+=n; var o=[]; for(var j=0;j<6;j++){o.unshift(('0'+(v%256).toString(16)).slice(-2)); v=Math.floor(v/256);} return o.join(':'); }catch(e){return mac;} }
// 복사: 디바이스 행을 복제(MAC/IP를 원본 Count만큼 증가시켜 범위가 안 겹치게)
function stcDevCopy(pk,di){ stcReadForm(); _stcReadDevs(); var l=_stcDevList(pk,0); var s=l[di]; var c=parseInt(s.count,10)||1; var nd=JSON.parse(JSON.stringify(s)); nd.name=(s.name||'Device')+'_copy'; nd.mac=_macInc(s.mac,c); nd.ip=_ipInc(s.ip,c); l.splice(di+1,0,nd); stcSaveCfg(); stcWizRender(); }
// 포트 메타(Location·속도·링크상태) — 실 STC All Ports 뷰처럼 표시
function _stcPortMeta(pk){ var ip=_stcActiveIP(); var inv=_stcInv[ip]||{}; var slot=parseInt(pk.split('/')[0],10); var mod=(inv.modules||[]).filter(function(m){return parseInt(m.slot,10)===slot;})[0]; var md=(mod&&mod.model)||''; var key=ip+'|'+pk; var lk=_stcPortLink[key];
  // 실제 케이블 링크상태(LinkStatus) 우선; 없으면 점유상태에서 보조 추정
  var up; if(lk==='up')up=true; else if(lk==='down')up=false; else { var st=_stcPortSt[key]; up=!(st==='unavailable'||st==='error'); }
  var spd=_stcPortSpeed[key]||(/10G/.test(md)?'10G':/1G/.test(md)?'1G':''); return {loc:'//'+ip+'/'+pk, speed:spd, up:up, link:lk}; }
function _stcWiz3(){ var fld='font-size:13px;padding:7px 9px;border:1.5px solid var(--border);border-radius:7px;outline:none;box-sizing:border-box;background:#fff;width:100%;'; var lbl='font-size:10.5px;font-weight:700;color:var(--text3);display:block;margin-bottom:3px;';
  if(!stcCfg.devs)stcCfg.devs={};
  var ports=_stcMyResvPorts();
  if(!ports.length) return '<div style="font-size:16px;font-weight:800;margin-bottom:4px;">2. Device Setting</div>'+
    '<div style="padding:28px;text-align:center;color:var(--text3);font-size:13px;">먼저 <b>1단계 포트 예약</b>에서 포트를 예약하세요.</div>'+
    '<button onclick="stcWizGo(1)" style="font-size:12.5px;padding:9px 18px;border-radius:8px;border:1.5px solid var(--border);background:#fff;cursor:pointer;font-weight:700;">← 포트 예약으로</button>';
  var ci='font-size:11.5px;padding:4px 6px;border:none;background:transparent;width:100%;box-sizing:border-box;outline:none;';
  var th='padding:5px 7px;font-size:10px;font-weight:800;color:#5a6072;background:#eef1f5;border:1px solid #d7dce3;white-space:nowrap;text-align:left;';
  var cards=ports.map(function(pk,pidx){ var meta=_stcPortMeta(pk); var list=_stcDevList(pk,pidx); var base='stc-dev-'+pk.replace('/','_');
    var rows=list.map(function(d,di){ var isL3=((d.mode||'L3')!=='L2'); var cnt=parseInt(d.count,10)||1; var multi=cnt>1; var id=base+'-'+di; var sel=(_stcDevSel.indexOf(pk+'|'+di)>=0);
      var seg=function(m,t){ var on=(d.mode||'L3')===m; return '<button data-act="mode" data-dpk="'+pk+'" data-di="'+di+'" data-m="'+m+'" style="font-size:9.5px;font-weight:800;padding:2px 7px;border:1px solid '+(on?'#2d6fd4':'#cfd4dc')+';background:'+(on?'#2d6fd4':'#fff')+';color:'+(on?'#fff':'#888')+';cursor:pointer;">'+t+'</button>'; };
      var td=function(suf,val,extra){ return '<td style="border:1px solid #e3e7ec;padding:0;"><input id="'+id+suf+'" value="'+_bdEsc(val)+'" '+(extra||'')+' style="'+ci+'"></td>'; };
      var tdN=function(suf,val,en){ return '<td style="border:1px solid #e3e7ec;padding:0;'+(en?'':'background:#f4f5f6;')+'"><input id="'+id+suf+'" value="'+_bdEsc(val)+'" '+(en?'':'disabled')+' style="'+ci+(en?'':'color:#bbb;')+'"></td>'; };
      return '<tr style="'+(sel?'background:rgba(45,111,212,0.12);':'')+'">'+
        '<td data-act="selrow" data-dpk="'+pk+'" data-di="'+di+'" title="행 선택" style="border:1px solid #e3e7ec;text-align:center;color:'+(sel?'#2d6fd4':'var(--text3)')+';font-weight:800;font-size:10px;background:'+(sel?'#dbe7fb':'#fafbfc')+';cursor:pointer;">'+(di+1)+'</td>'+
        td('-name', d.name||('Device_'+(pidx+1)+'_'+(di+1)), '')+
        '<td style="border:1px solid #e3e7ec;text-align:center;white-space:nowrap;padding:2px 3px;">'+seg('L2','L2')+' '+seg('L3','L3')+'</td>'+
        td('-count', cnt, 'type="number" min="1" onchange="stcDevCountChange()"')+
        td('-mac', d.mac, 'title="HW MAC'+(multi?' 시작':'')+'"')+
        tdN('-ip', d.ip, isL3)+
        tdN('-gw', d.gw, isL3)+
        tdN('-prefix', d.prefix||24, isL3)+
        tdN('-macstep', d.macStep||'00:00:00:00:00:01', multi)+
        tdN('-ipstep', d.ipStep||'0.0.0.1', isL3&&multi)+
        tdN('-gwstep', d.gwStep||'0.0.0.0', isL3&&multi)+
        '<td style="border:1px solid #e3e7ec;text-align:center;white-space:nowrap;padding:2px 4px;">'+
          '<button data-act="copy" data-dpk="'+pk+'" data-di="'+di+'" title="복사(+증가)" style="border:none;background:transparent;color:#2d6fd4;cursor:pointer;font-size:13px;"><i class="ti ti-copy" style="pointer-events:none;"></i></button>'+
          (list.length>1?('<button data-act="del" data-dpk="'+pk+'" data-di="'+di+'" title="삭제" style="border:none;background:transparent;color:#c0414f;cursor:pointer;font-size:13px;margin-left:3px;"><i class="ti ti-trash" style="pointer-events:none;"></i></button>'):'')+
        '</td>'+
      '</tr>'; }).join('');
    var thead='<tr><th style="'+th+'width:24px;text-align:center;">#</th><th style="'+th+'min-width:130px;">Device Name</th><th style="'+th+'text-align:center;">Type</th><th style="'+th+'width:52px;text-align:center;">Count</th><th style="'+th+'min-width:130px;">HW MAC</th><th style="'+th+'min-width:95px;">IP</th><th style="'+th+'min-width:95px;">Gateway</th><th style="'+th+'width:42px;">Pfx</th><th style="'+th+'min-width:120px;">MAC step</th><th style="'+th+'min-width:80px;">IP step</th><th style="'+th+'min-width:80px;">GW step</th><th style="'+th+'width:54px;"></th></tr>';
    return '<div style="border:1px solid var(--border);border-radius:10px;padding:11px 12px;margin-bottom:12px;">'+
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;"><span style="font-weight:800;color:#2d6fd4;font-size:13px;"><i class="ti ti-server-2" style="margin-right:4px;"></i>포트 '+pk+'</span><span style="font-size:10px;color:var(--text3);font-family:ui-monospace,monospace;">'+_bdEsc(meta.loc)+(meta.speed?(' · '+meta.speed):'')+' · <span style="color:'+(meta.up?'#0a7a52':'#c0414f')+';font-weight:800;">●</span> '+(meta.up?'Link Up':'Link Down')+'</span><span style="flex:1;"></span><span style="font-size:10px;color:var(--text3);font-weight:700;">디바이스 '+list.length+'개</span></div>'+
      '<div style="overflow-x:auto;"><table style="border-collapse:collapse;width:100%;table-layout:auto;"><thead>'+thead+'</thead><tbody>'+rows+'</tbody></table></div>'+
      '<button data-act="add" data-dpk="'+pk+'" data-pidx="'+pidx+'" style="margin-top:8px;font-size:11px;font-weight:700;padding:5px 12px;border-radius:7px;border:1.5px dashed #2d6fd4;background:#fff;color:#2d6fd4;cursor:pointer;"><i class="ti ti-plus" style="pointer-events:none;"></i> 디바이스 추가</button>'+
    '</div>'; }).join('');
  return '<div style="font-size:16px;font-weight:800;margin-bottom:4px;">2. Device Setting</div>'+
    '<div style="font-size:12px;color:var(--text3);margin-bottom:10px;">엑셀 표처럼 셀을 직접 편집합니다. <b>#번호 클릭=행 선택</b> (Ctrl+클릭=여러 행, Shift+클릭=범위), 선택 후 <b>아래로 복사</b>하면 MAC/IP 자동 증가. <b>Count</b>=한 행으로 N개 생성.</div>'+
    (_stcDevSel.length?('<div style="display:flex;align-items:center;gap:8px;margin-bottom:11px;padding:7px 11px;background:#eef4ff;border:1px solid #cfe0ff;border-radius:8px;"><span style="font-size:12px;font-weight:800;color:#2d6fd4;">선택 '+_stcDevSel.length+'행</span><span style="flex:1;"></span>'+
      '<button onclick="stcDevSelCopyDown()" style="font-size:11.5px;font-weight:800;padding:6px 13px;border-radius:7px;border:none;background:#2d6fd4;color:#fff;cursor:pointer;"><i class="ti ti-copy"></i> 아래로 복사(+증가)</button>'+
      '<button onclick="stcDevSelDelMulti()" style="font-size:11.5px;font-weight:800;padding:6px 13px;border-radius:7px;border:1.5px solid #c0414f;background:#fff;color:#c0414f;cursor:pointer;"><i class="ti ti-trash"></i> 삭제</button>'+
      '<button onclick="stcDevSelClear()" style="font-size:11.5px;font-weight:700;padding:6px 11px;border-radius:7px;border:1.5px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;">선택 해제</button></div>'):'')+
    cards+
    '<div style="font-size:11px;color:var(--text3);margin-top:10px;"><i class="ti ti-info-circle" style="margin-right:3px;"></i>설정은 저장만 됩니다. 실제 계측기 적용은 <b>4단계 전송</b>에서 한 번에 빌드됩니다(STC_UDP.py 방식).</div>'+
    '<div style="display:flex;gap:8px;margin-top:8px;"><button onclick="stcWizDevices()" style="font-size:12.5px;padding:9px 18px;border-radius:8px;border:1.5px solid #00a872;background:#fff;color:#00875a;cursor:pointer;font-weight:800;"><i class="ti ti-device-floppy"></i> Device 설정 저장</button><span style="flex:1;"></span><button onclick="stcWizDevices();stcWizGo(3)" style="font-size:12.5px;padding:9px 18px;border-radius:8px;border:none;background:#2d6fd4;color:#fff;cursor:pointer;font-weight:800;">다음: Stream Block →</button></div>';
}
// 수집 전용: 설정만 저장(계측기는 4단계 전송에서 STC_UDP.py 방식으로 일괄 빌드)
function stcWizDevices(){ var ip=_stcActiveIP(); var ports=_stcMyResvPorts(ip); if(!ports.length){ showToast('예약한 포트가 없습니다'); return; } stcReadForm(); _stcReadDevs(); stcCfg.chassis=ip; stcSaveCfg();
  var nDev=0,nEmu=0; ports.forEach(function(pk,pi){ _stcDevList(pk,pi).forEach(function(d){ nDev++; nEmu+=Math.max(1,parseInt(d.count,10)||1); }); });
  stcConsole('▶ Device 설정 저장 — 포트 '+ports.length+' / 디바이스 정의 '+nDev+'개 / 총 에뮬레이트 '+nEmu+'개 (전송 단계에서 일괄 빌드)'); showToast('Device 설정 저장됨 ('+nDev+'개)'); }
// ── 3단계: Stream Block (디바이스 간 스트림, 엑셀 표) ──
function _stcAllDevices(){ var out=[]; _stcMyResvPorts().forEach(function(pk,pi){ _stcDevList(pk,pi).forEach(function(d){ out.push({name:d.name,port:pk,mode:d.mode||'L3',ip:d.ip,prefix:d.prefix||24}); }); }); return out; }
function _stcDevByName(nm){ var dv=_stcAllDevices(); for(var i=0;i<dv.length;i++)if(dv[i].name===nm)return dv[i]; return null; }
function _stcDevPortOf(nm){ var d=_stcDevByName(nm); return d?('//'+_stcActiveIP()+'/'+d.port):'-'; }
function _stcDevLabel(d){ return d.port+' · '+d.name+(d.mode==='L3'&&d.ip?(' ('+d.ip+'/'+d.prefix+')'):' [L2]'); }
function _stcStreamList(){ if(!Array.isArray(stcCfg.streams))stcCfg.streams=[]; return stcCfg.streams; }
function _stcStreamDefault(i){ var dv=_stcAllDevices(); var s=(dv[0]&&dv[0].name)||''; var dd=(dv[1]&&dv[1].name)||s; return {name:'Stream_'+(i+1),active:true,src:s,dst:dd,proto:'UDP',count:1,frame:512,frameMode:'FIXED',load:10,loadUnit:'PERCENT_LINE_RATE',dstPort:80,srcPort:1024}; }
function _stcReadStreams(){ var l=_stcStreamList(); l.forEach(function(s,i){ var id='stc-st-'+i; var g=function(suf){var el=document.getElementById(id+suf);return el?el.value.trim():null;}; var v; if((v=g('-name'))!==null)s.name=v||s.name; if((v=g('-src'))!==null)s.src=v; if((v=g('-dst'))!==null)s.dst=v; if((v=g('-proto'))!==null)s.proto=v; if((v=g('-count'))!==null)s.count=Math.max(1,parseInt(v,10)||1); if((v=g('-frame'))!==null)s.frame=parseInt(v,10)||s.frame; if((v=g('-mode'))!==null)s.frameMode=v; if((v=g('-load'))!==null)s.load=v||s.load; if((v=g('-unit'))!==null)s.loadUnit=v; if((v=g('-dport'))!==null)s.dstPort=parseInt(v,10)||s.dstPort; if((v=g('-sport'))!==null)s.srcPort=parseInt(v,10)||s.srcPort; var a=document.getElementById(id+'-active'); if(a)s.active=a.checked; }); }
function stcStreamAdd(){ stcReadForm(); _stcReadStreams(); var l=_stcStreamList(); l.push(_stcStreamDefault(l.length)); stcSaveCfg(); stcWizRender(); }
function stcStreamCopy(i){ stcReadForm(); _stcReadStreams(); var l=_stcStreamList(); var nd=JSON.parse(JSON.stringify(l[i])); nd.name=(l[i].name||'SB')+'_copy'; l.splice(i+1,0,nd); stcSaveCfg(); stcWizRender(); }
function stcStreamRemove(i){ stcReadForm(); _stcReadStreams(); var l=_stcStreamList(); if(l.length>1)l.splice(i,1); stcSaveCfg(); stcWizRender(); }
function stcStreamSelChange(){ stcReadForm(); _stcReadStreams(); stcSaveCfg(); stcWizRender(); }
function _stcWiz4(){ var th='padding:5px 7px;font-size:10px;font-weight:800;color:#5a6072;background:#eef1f5;border:1px solid #d7dce3;white-space:nowrap;text-align:left;'; var ci='font-size:11.5px;padding:4px 5px;border:none;background:transparent;width:100%;box-sizing:border-box;outline:none;';
  var devs=_stcAllDevices();
  if(!devs.length) return '<div style="font-size:16px;font-weight:800;margin-bottom:4px;">3. Stream Block</div><div style="padding:28px;text-align:center;color:var(--text3);font-size:13px;">먼저 <b>2단계 Device Setting</b>에서 디바이스를 만드세요.</div><button onclick="stcWizGo(2)" style="font-size:12.5px;padding:9px 18px;border-radius:8px;border:1.5px solid var(--border);background:#fff;cursor:pointer;font-weight:700;">← Device Setting</button>';
  var list=_stcStreamList(); if(!list.length)list.push(_stcStreamDefault(0));
  var devOpts=function(s2){ return devs.map(function(d){ return '<option value="'+_bdEsc(d.name)+'"'+(d.name===s2?' selected':'')+'>'+_bdEsc(_stcDevLabel(d))+'</option>'; }).join(''); };
  var roTd=function(val){ return '<td style="border:1px solid #e3e7ec;padding:4px 6px;font-size:10.5px;color:var(--text3);font-family:ui-monospace,monospace;background:#fafbfc;white-space:nowrap;">'+_bdEsc(val)+'</td>'; };
  var rows=list.map(function(s,i){ var id='stc-st-'+i;
    var inp=function(suf,val,extra){ return '<td style="border:1px solid #e3e7ec;padding:0;"><input id="'+id+suf+'" value="'+_bdEsc(val)+'" '+(extra||'')+' style="'+ci+'"></td>'; };
    var sel=function(suf,opts,ext){ return '<td style="border:1px solid #e3e7ec;padding:0;"><select id="'+id+suf+'" '+(ext||'')+' style="'+ci+'cursor:pointer;">'+opts+'</select></td>'; };
    var protoOpts='<option'+(s.proto==='UDP'?' selected':'')+'>UDP</option><option'+(s.proto==='TCP'?' selected':'')+'>TCP</option>';
    var modeOpts=['FIXED','INCR','RANDOM','IMIX'].map(function(u){return '<option value="'+u+'"'+(s.frameMode===u?' selected':'')+'>'+u+'</option>';}).join('');
    var unitOpts=[['PERCENT_LINE_RATE','%'],['MEGABITS_PER_SECOND','Mbps'],['BITS_PER_SECOND','bps'],['FRAMES_PER_SECOND','fps']].map(function(u){return '<option value="'+u[0]+'"'+(s.loadUnit===u[0]?' selected':'')+'>'+u[1]+'</option>';}).join('');
    return '<tr>'+
      '<td style="border:1px solid #e3e7ec;text-align:center;"><input type="checkbox" id="'+id+'-active" '+(s.active!==false?'checked':'')+' title="Active"></td>'+
      '<td style="border:1px solid #e3e7ec;text-align:center;color:var(--text3);font-weight:800;font-size:10px;background:#fafbfc;">'+(i+1)+'</td>'+
      inp('-name', s.name, '')+
      sel('-src', devOpts(s.src), 'onchange="stcStreamSelChange()"')+
      sel('-dst', devOpts(s.dst), 'onchange="stcStreamSelChange()"')+
      roTd(_stcDevPortOf(s.src))+
      roTd(_stcDevPortOf(s.dst))+
      sel('-proto', protoOpts)+
      inp('-count', parseInt(s.count,10)||1, 'type="number" min="1"')+
      inp('-frame', s.frame, 'type="number" min="64"')+
      sel('-mode', modeOpts)+
      inp('-load', s.load, '')+
      sel('-unit', unitOpts)+
      inp('-dport', s.dstPort, 'type="number"')+
      inp('-sport', s.srcPort, 'type="number"')+
      '<td style="border:1px solid #e3e7ec;text-align:center;white-space:nowrap;padding:2px 4px;">'+
        '<button data-act="stcopy" data-di="'+i+'" title="복사" style="border:none;background:transparent;color:#2d6fd4;cursor:pointer;font-size:13px;"><i class="ti ti-copy" style="pointer-events:none;"></i></button>'+
        (list.length>1?('<button data-act="stdel" data-di="'+i+'" title="삭제" style="border:none;background:transparent;color:#c0414f;cursor:pointer;font-size:13px;margin-left:3px;"><i class="ti ti-trash" style="pointer-events:none;"></i></button>'):'')+
      '</td>'+
    '</tr>'; }).join('');
  var thead='<tr><th style="'+th+'text-align:center;width:42px;">Active</th><th style="'+th+'width:22px;text-align:center;">#</th><th style="'+th+'min-width:110px;">Stream Name</th><th style="'+th+'min-width:130px;">Source</th><th style="'+th+'min-width:130px;">Destination</th><th style="'+th+'">Tx Port</th><th style="'+th+'">Rx Port</th><th style="'+th+'width:58px;">Proto</th><th style="'+th+'width:50px;">Count</th><th style="'+th+'width:58px;">Frame Len</th><th style="'+th+'width:70px;">Mode</th><th style="'+th+'width:50px;">Load</th><th style="'+th+'width:62px;">Unit</th><th style="'+th+'width:58px;">Dst Port</th><th style="'+th+'width:58px;">Src Port</th><th style="'+th+'width:50px;"></th></tr>';
  return '<div style="font-size:16px;font-weight:800;margin-bottom:4px;">3. Stream Block</div>'+
    '<div style="font-size:12px;color:var(--text3);margin-bottom:11px;">디바이스 간 트래픽 스트림을 정의합니다(엑셀 표). <b>Source→Destination</b> 디바이스 선택 후 프레임/부하/프로토콜/포트 설정. 한 방향당 스트림 1개입니다(역방향이 필요하면 스트림을 하나 더 추가하세요).</div>'+
    '<div style="overflow-x:auto;"><table style="border-collapse:collapse;width:100%;table-layout:auto;"><thead>'+thead+'</thead><tbody>'+rows+'</tbody></table></div>'+
    '<button data-act="stadd" style="margin-top:8px;font-size:11px;font-weight:700;padding:5px 12px;border-radius:7px;border:1.5px dashed #2d6fd4;background:#fff;color:#2d6fd4;cursor:pointer;"><i class="ti ti-plus" style="pointer-events:none;"></i> 스트림 추가</button>'+
    '<div style="font-size:11px;color:var(--text3);margin-top:10px;"><i class="ti ti-info-circle" style="margin-right:3px;"></i>설정만 저장됩니다. 실제 계측기 적용은 <b>4단계 전송</b>에서 일괄 빌드(STC_UDP.py 방식).</div>'+
    '<div style="display:flex;gap:8px;margin-top:8px;"><button onclick="stcWizStreams()" style="font-size:12.5px;padding:9px 18px;border-radius:8px;border:1.5px solid #00a872;background:#fff;color:#00875a;cursor:pointer;font-weight:800;"><i class="ti ti-device-floppy"></i> 스트림 저장</button><span style="flex:1;"></span><button onclick="stcWizStreams();stcWizGo(4)" style="font-size:12.5px;padding:9px 18px;border-radius:8px;border:none;background:#2d6fd4;color:#fff;cursor:pointer;font-weight:800;">다음: 전송 →</button></div>';
}
function stcWizStreams(){ stcReadForm(); _stcReadStreams(); stcSaveCfg(); var n=_stcStreamList().length; stcConsole('▶ 스트림 저장 — '+n+'개 정의 (전송 단계에서 일괄 빌드)'); showToast('스트림 저장됨 ('+n+'개)'); }
// ── 4단계: 전송 · Result ──
function _stcUnitShort(u){ return ({PERCENT_LINE_RATE:'%',MEGABITS_PER_SECOND:'Mbps',BITS_PER_SECOND:'bps',FRAMES_PER_SECOND:'fps'}[u])||u||''; }
function _stcWiz5(){ var run=_stcState.running; var c=stcCfg;
  var devs=_stcAllDevices(); var streams=_stcStreamList(); var active=streams.filter(function(s){return s.active!==false;});
  var th='padding:5px 8px;font-size:10px;font-weight:800;color:#5a6072;background:#eef1f5;border:1px solid #d7dce3;text-align:left;white-space:nowrap;';
  var td='padding:5px 8px;font-size:11.5px;border:1px solid #e3e7ec;white-space:nowrap;';
  var srows=active.map(function(s,i){ var ar='→'; return '<tr>'+
    '<td style="'+td+'text-align:center;color:var(--text3);font-weight:800;">'+(i+1)+'</td>'+
    '<td style="'+td+'font-weight:700;">'+_bdEsc(s.name)+'</td>'+
    '<td style="'+td+'">'+_bdEsc(s.src)+' <b style="color:#2d6fd4;">'+ar+'</b> '+_bdEsc(s.dst)+'</td>'+
    '<td style="'+td+'font-family:ui-monospace,monospace;color:var(--text3);">'+_bdEsc(_stcDevPortOf(s.src))+' '+ar+' '+_bdEsc(_stcDevPortOf(s.dst))+'</td>'+
    '<td style="'+td+'text-align:center;">'+_bdEsc(s.proto)+'</td>'+
    '<td style="'+td+'text-align:right;">'+_bdEsc(s.frame)+'B</td>'+
    '<td style="'+td+'text-align:right;">'+_bdEsc(s.load)+' '+_stcUnitShort(s.loadUnit)+'</td>'+
  '</tr>'; }).join('');
  var streamTbl=active.length?('<div style="overflow-x:auto;"><table style="border-collapse:collapse;width:100%;"><thead><tr><th style="'+th+'width:24px;text-align:center;">#</th><th style="'+th+'">Stream</th><th style="'+th+'">Source → Dest</th><th style="'+th+'">Tx → Rx Port</th><th style="'+th+'">Proto</th><th style="'+th+'">Frame</th><th style="'+th+'">Load</th></tr></thead><tbody>'+srows+'</tbody></table></div>'):'<div style="padding:18px;text-align:center;color:var(--text3);font-size:12.5px;">전송할 스트림이 없습니다. <span onclick="stcWizGo(3)" style="color:#2d6fd4;cursor:pointer;font-weight:700;">← Stream Block</span> 에서 만드세요.</div>';
  var fld='font-size:13px;padding:7px 9px;border:1.5px solid var(--border);border-radius:7px;outline:none;box-sizing:border-box;width:92px;';
  return '<div style="font-size:16px;font-weight:800;margin-bottom:4px;">4. 전송 · Result</div>'+
   '<div style="font-size:12px;color:var(--text3);margin-bottom:12px;">수집한 설정(포트 '+_stcMyResvPorts().length+' · 디바이스 '+devs.length+' · 스트림 '+active.length+'/'+streams.length+')으로 STC_UDP.py처럼 한 세션에 통으로 빌드하고 트래픽을 전송합니다.</div>'+
   '<div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:14px;"><div style="padding:7px 12px;background:#f6f9ff;font-size:12px;font-weight:800;color:#2d6fd4;"><i class="ti ti-route" style="margin-right:4px;"></i>전송할 스트림 ('+active.length+'개)</div>'+streamTbl+'</div>'+
   '<div style="display:flex;gap:14px;align-items:end;margin-bottom:14px;flex-wrap:wrap;">'+
     '<label style="display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;color:var(--text2);cursor:pointer;padding-bottom:9px;"><input type="checkbox" id="stc-continuous" '+(c.continuous!==false?'checked':'')+' onchange="stcContToggle()"> 지속 전송(정지까지)</label>'+
     '<div'+(c.continuous!==false?' style="opacity:0.4;"':'')+'><label style="font-size:11px;font-weight:700;color:var(--text3);display:block;margin-bottom:4px;">시험 시간(초)</label><input id="stc-duration" type="number" value="'+(c.duration||30)+'" '+(c.continuous!==false?'disabled':'')+' style="'+fld+'"></div>'+
     '<div><label style="font-size:11px;font-weight:700;color:var(--text3);display:block;margin-bottom:4px;">결과 주기(초)</label><input id="stc-interval" type="number" value="'+(c.interval||2)+'" style="'+fld+'"></div>'+
     '<button onclick="stcTrafficSend()" '+(run?'disabled':'')+' style="font-size:13px;padding:9px 22px;border-radius:8px;border:none;background:'+(run?'#9aa':'#00a872')+';color:#fff;cursor:pointer;font-weight:800;"><i class="ti ti-player-play"></i> 트래픽 전송</button>'+
     '<button onclick="stcTrafficStop()" style="font-size:13px;padding:9px 20px;border-radius:8px;border:1.5px solid var(--red);background:#fff;color:var(--red);cursor:pointer;font-weight:800;"><i class="ti ti-player-stop"></i> 정지</button>'+
     '<button onclick="stcClearTxResults()" '+(run?'disabled':'')+' title="결과표 비우기(전송 중엔 비활성)" style="font-size:13px;padding:9px 16px;border-radius:8px;border:1.5px solid var(--border);background:'+(run?'#f1f2f5':'#fff')+';color:'+(run?'#b0b4bd':'var(--text2)')+';cursor:'+(run?'default':'pointer')+';font-weight:700;"><i class="ti ti-eraser"></i> 결과 지우기</button>'+
     '<span id="stc-run-state" style="align-self:center;font-size:12px;font-weight:700;color:'+(run?'#00875a':'var(--text3)')+';">'+(run?'● 전송 중':'대기')+'</span>'+
   '</div>'+
   '<div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;"><div style="padding:8px 12px;background:#faf7f9;font-size:12px;font-weight:800;color:#c0497b;"><i class="ti ti-table"></i> 실시간 결과 (개별 스트림별 송신·수신·손실·지연) — 시그니처 기반 실측</div><div id="stc-results" style="max-height:62vh;overflow:auto;"></div><div id="stc-summary" style="padding:10px 14px;border-top:1px solid var(--border);background:#fafbfc;"></div></div>';
}
// 전송: 수집한 포트+디바이스+스트림을 한 세션에 통으로 빌드+전송 (STC_UDP.py 방식, 결과 스트리밍)
function stcContToggle(){ var el=document.getElementById('stc-continuous'); stcCfg.continuous=el?el.checked:true; stcSaveCfg(); stcWizRender(); }
async function stcTrafficSend(){ var ip=_stcActiveIP(); var streams=_stcStreamList().filter(function(s){return s.active!==false;}); if(!streams.length){ showToast('전송할 스트림이 없습니다'); return; }
  var cont=((document.getElementById('stc-continuous')||{}).checked)!==false; stcCfg.continuous=cont;
  var dur=cont?0:(parseInt((document.getElementById('stc-duration')||{}).value,10)||30); var itv=parseInt((document.getElementById('stc-interval')||{}).value,10)||2; stcCfg.duration=dur||stcCfg.duration; stcCfg.interval=itv; stcSaveCfg();
  // 활성 스트림이 실제 쓰는 디바이스(src/dst)만 빌드 → 스트림에 안 쓰는 포트(예: 1/4)는 잡지 않음
  var usedDev={}; streams.forEach(function(s){ if(s.src)usedDev[s.src]=1; if(s.dst)usedDev[s.dst]=1; });
  var cfgPorts=Object.keys(stcCfg.devs||{}); if(!cfgPorts.length)cfgPorts=_stcMyResvPorts();
  var devices=[]; var ports=[]; cfgPorts.forEach(function(pk,pi){ var pdevs=_stcDevList(pk,pi).filter(function(d){ return usedDev[d.name]; }); if(!pdevs.length)return; ports.push(pk); pdevs.forEach(function(d){ devices.push({port:pk,name:d.name,mode:d.mode||'L3',mac:d.mac,ip:d.ip,gw:d.gw,prefix:d.prefix||24,count:parseInt(d.count,10)||1,macStep:d.macStep,ipStep:d.ipStep,gwStep:d.gwStep}); }); });
  if(!ports.length){ showToast('디바이스를 먼저 설정하세요(2단계)'); _stcState.running=false; return; }
  var payload={chassis:ip,restIp:stcCfg.restIp,restPort:stcCfg.restPort,duration:dur,interval:itv,ports:ports,devices:devices,streams:streams,user:(typeof currentUser!=='undefined'&&currentUser&&currentUser.username)||'admin'};
  _stcState.running=true; stcStopStatusPoll(); /* 전송 중 상태폴링 멈춤 — 섀시 경합 방지 */ stcWizRender(); stcConsole('▶ 트래픽 전송 — 포트 '+ports.length+' · 디바이스 '+devices.length+' · 스트림 '+streams.length+(dur?(' · '+dur+'초'):' · 지속')+' …(빌드 10~20초)');
  try{ var r=await fetch('/api/stc/traffic/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); var d=await r.json();
    if(d&&d.ok){ stcConsole('  ✔ 전송 시작 — 결과는 아래 STC 콘솔에 실시간 표시'); } else { stcConsole('  ✘ 실패: '+((d&&d.error)||'')); showToast('전송 실패'); _stcState.running=false; stcWizRender(); } }
  catch(e){ stcConsole('  ✘ 호출 실패: '+e.message); _stcState.running=false; stcWizRender(); } }
function stcTrafficStop(){ stcConsole('■ 트래픽 정지 요청'); fetch('/api/stc/traffic/stop',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).catch(function(){}); _stcState.running=false; stcWizRender(); showToast('정지 요청됨'); }
let _stcPortMap=[]; let _stcSel={A:{slot:1,port:15},B:{slot:1,port:16}};
function stcGenPortMap(){ if(!stcCfg)stcLoadCfg(); const sc=stcCfg.slotCount||1, pc=stcCfg.portCount||16; _stcPortMap=[]; for(let s=1;s<=sc;s++){ for(let p=1;p<=pc;p++){ _stcPortMap.push({slot:s,port:p,status:'unknown',owner:''}); } } }
function _stcIsSel(which,s,p){ const v=_stcSel[which]; return v&&v.slot===s&&v.port===p; }// (구) 목업 포트그리드용 stcPortClick(slot,port) 제거됨 — 위저드 stcPortClick(key) 와 이름 충돌하여 클릭이 안 먹던 원인이었음
// (구) 목업 포트 그리드 함수 제거됨 — 실섀시 인벤토리는 연결 확인/포트 다이얼로그에서만 사용
let _stcRealModules=null; // '연결 확인'이 채우는 실섀시 모듈 [{slot,model,ports}] — 목업 없음
let _stcConnInfo=null;     // {model,serial,firmware} — 연결 확인 결과
// 실섀시에서 받은 모듈만 사용한다. 데이터가 없으면 빈 목록(가짜 모듈 표시 금지).
function _stcMods(){ if(!(_stcRealModules&&_stcRealModules.length)) return []; return _stcRealModules.filter(function(m){return (m.ports||0)>0;}).map(function(m){ const md=m.model||''; return {slot:parseInt(m.slot,10),model:md,ports:m.ports,speed:(/10G/.test(md)?'10G':/1G/.test(md)?'1G':'')}; }); }
let _stcReserved={}; let _stcDlgChk={};
function _pk(s,p){ return s+'/'+p; }
function stcGenPortMap(){ _stcPortMap=[]; _stcMods().forEach(function(mod){ for(let p=1;p<=mod.ports;p++){ _stcPortMap.push({slot:mod.slot,port:p,model:mod.model,speed:mod.speed,status:'available',owner:'',link:'up'}); } }); Object.keys(_stcReserved).forEach(function(k){ const a=k.split('/'); const x=_stcPortMap.find(function(q){return q.slot===parseInt(a[0],10)&&q.port===parseInt(a[1],10);}); if(x)x.status='reserved_me'; }); }
function _stcSyncSel(){ const ks=Object.keys(_stcReserved); const P=function(k){ const a=k.split('/'); return {slot:parseInt(a[0],10),port:parseInt(a[1],10)}; }; _stcSel.A=ks[0]?P(ks[0]):null; _stcSel.B=ks[1]?P(ks[1]):null; if(_stcSel.A){stcCfg.slot=_stcSel.A.slot;stcCfg.portA=_stcSel.A.port;} if(_stcSel.B){stcCfg.portB=_stcSel.B.port;} }
function stcRenderPortChips(){ const el=document.getElementById('stcp-sel'); if(!el)return; const ks=Object.keys(_stcReserved); if(!ks.length){ el.innerHTML='<span style="font-size:11px;color:var(--text3);">예약된 포트 없음 — 위 버튼으로 선택</span>'; return; } el.innerHTML='<div style="font-size:10px;color:var(--text3);margin-bottom:4px;">예약된 포트 ('+ks.length+') · A↔B 양방향</div><div style="display:flex;gap:5px;flex-wrap:wrap;">'+ks.map(function(k,i){ const bg=i===0?'#2d6fd4':i===1?'#00a872':'#eef3ff'; const fg=i<2?'#fff':'#2d6fd4'; return '<span style="font-size:11px;font-weight:700;color:'+fg+';background:'+bg+';border-radius:7px;padding:3px 9px;">'+(i===0?'A ':i===1?'B ':'')+'//'+k+'</span>'; }).join('')+'</div>'; }function stcDlgRender(){ const body=document.getElementById('stc-dlg-body'); if(!body)return; const e=_bdEsc; const th='padding:7px 10px;text-align:left;font-size:10.5px;font-weight:800;color:#5a6072;background:#eef1f5;border-bottom:1px solid #cfd4dc;position:sticky;top:0;'; let h='<table style="width:100%;border-collapse:collapse;"><thead><tr><th style="'+th+'width:34px;text-align:center;"></th><th style="'+th+'">연결명</th><th style="'+th+'">모델</th><th style="'+th+'">속도(Link)</th><th style="'+th+'">Status</th></tr></thead><tbody>'; h+='<tr><td colspan="5" style="padding:6px 10px;font-weight:800;font-size:11.5px;background:#f6f9ff;color:#2d6fd4;border-bottom:1px solid #e3ecfb;"><i class="ti ti-router"></i> '+e(stcCfg.chassis)+' · Connected</td></tr>'; _stcMods().forEach(function(mod){ h+='<tr><td></td><td colspan="4" style="padding:5px 10px;font-weight:700;font-size:11px;background:#fafbfc;color:var(--text2);border-bottom:1px solid #eef0f3;">▾ Slot '+mod.slot+' &nbsp;<span style="color:var(--text3);font-weight:500;">'+e(mod.model)+'</span></td></tr>'; _stcPortMap.filter(function(p){return p.slot===mod.slot;}).forEach(function(p){ const k=_pk(p.slot,p.port); const td='padding:5px 10px;border-bottom:1px solid #f2f3f5;font-size:11.5px;'; const dis=(p.link==='error'||p.status==='reserved_other'); const chk=!!_stcDlgChk[k]; const link=(p.link==='error')?('<span style="color:#e8820c;">Link Error, '+p.speed+'</span>'):('Link Up, '+p.speed); let stat; if(p.link==='error')stat='<span style="color:#e8820c;font-weight:700;">Link Error</span>'; else if(p.status==='reserved_other')stat='<span style="color:#e53e5a;font-weight:700;">Reserved by '+e(p.owner)+'</span>'; else if(chk)stat='<span style="color:#2d6fd4;font-weight:700;">Reserved by me</span>'; else stat='<span style="color:#00875a;">Available</span>'; h+='<tr style="background:'+(chk?'rgba(45,111,212,0.06)':'')+';'+(dis?'opacity:0.6;':'cursor:pointer;')+'" '+(dis?'':'onclick="stcDlgToggle('+p.slot+','+p.port+')"')+'><td style="'+td+'text-align:center;"><input type="checkbox" '+(chk?'checked':'')+' '+(dis?'disabled':'')+' onclick="event.stopPropagation();stcDlgToggle('+p.slot+','+p.port+')"></td><td style="'+td+'padding-left:22px;font-weight:600;">Port '+p.port+'</td><td style="'+td+'color:var(--text3);">'+e(mod.model.split(" ").slice(0,2).join(" "))+'</td><td style="'+td+'">'+link+'</td><td style="'+td+'">'+stat+'</td></tr>'; }); }); h+='</tbody></table>'; body.innerHTML=h; const sum=document.getElementById('stc-dlg-sum'); if(sum){ let avail=0,other=0,me=0,err=0; _stcPortMap.forEach(function(p){ if(p.link==='error'){err++;return;} if(p.status==='reserved_other'){other++;return;} if(_stcDlgChk[_pk(p.slot,p.port)])me++; else avail++; }); sum.innerHTML='<b>요약(Summary)</b> &nbsp; Available <b style="color:#00875a;">'+avail+'</b> · Reserved by me <b style="color:#2d6fd4;">'+me+'</b> · Reserved by other <b style="color:#e53e5a;">'+other+'</b> · Link Error '+err+' &nbsp;|&nbsp; Ports '+_stcPortMap.length+' · Modules '+_stcMods().length; } }
function stcDlgToggle(s,p){ const x=_stcPortMap.find(function(q){return q.slot===s&&q.port===p;}); if(!x||x.link==='error'||x.status==='reserved_other'){ showToast('예약 불가 (사용 중/링크 오류)'); return; } const k=_pk(s,p); if(_stcDlgChk[k])delete _stcDlgChk[k]; else _stcDlgChk[k]=true; stcDlgRender(); }
async function stcDlgOK(){ _stcReserved={}; Object.keys(_stcDlgChk).forEach(function(k){_stcReserved[k]=true;}); stcGenPortMap(); _stcSyncSel(); stcSaveCfg(); const md=document.getElementById('stc-port-dlg'); if(md)md.remove(); stcRenderPortChips(); _stcState.streams=[]; if(typeof stcRenderRows==='function')stcRenderRows();
  // 실제 STC REST 예약 (영속 세션) — Spirent STC 프로그램에 Reserved by utop 로 보임
  stcReadForm(); const ports=Object.keys(_stcReserved).join(',');
  stcConsole('▶ 실제 포트 예약: '+(ports||'(없음)')+' @ '+stcCfg.chassis+' … (10~20초)');
  showToast('실섀시 예약 중…');
  try{ const r=await fetch('/api/stc/reserve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ports:ports,chassis:stcCfg.chassis,restIp:stcCfg.restIp,restPort:stcCfg.restPort})}); const d=await r.json();
    if(d.ok){ stcConsole('  ✔ 실예약 완료 — '+((d.reserved||[]).join(', ')||'없음')+'  (STC 프로그램에서 Reserved by utop 확인)'); showToast('실섀시 예약 완료'); }
    else { stcConsole('  ✘ 예약 실패 — '+(d.error||'')); showToast('예약 실패'); } }
  catch(e){ stcConsole('  ✘ 백엔드 호출 실패: '+e.message); showToast('백엔드 호출 실패'); }
}
async function stcReleaseReal(){ if(!stcCfg)stcLoadCfg(); stcReadForm(); stcConsole('▶ 실제 예약 해제 @ '+stcCfg.chassis);
  try{ const r=await fetch('/api/stc/release',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chassis:stcCfg.chassis,restIp:stcCfg.restIp,restPort:stcCfg.restPort})}); const d=await r.json();
    if(d.ok){ stcConsole('  ✔ 실예약 해제됨'+(d.released?'':' (해제할 예약 없음)')); _stcReserved={}; stcGenPortMap(); stcRenderPortChips(); showToast('예약 해제됨'); }
    else { stcConsole('  ✘ 해제 실패 — '+(d.error||'')); showToast('해제 실패'); } }
  catch(e){ stcConsole('  ✘ 백엔드 호출 실패: '+e.message); } }
async function stcDlgRefresh(){ const sum=document.getElementById('stc-dlg-sum'); if(sum)sum.innerHTML='<span style="color:var(--text3);">섀시 조회 중… (10~20초)</span>';
  const ok=await stcLoadRealPorts(); stcGenPortMap(); stcDlgRender(); if(!ok&&sum)showToast('실섀시 조회 실패 — 이전 데이터 표시'); }
// 연결 확인 엔드포인트로 실섀시 모듈/포트 인벤토리를 받아 _stcRealModules 에 저장
async function stcLoadRealPorts(){ if(!stcCfg)stcLoadCfg();
  try{ const r=await fetch('/api/stc/conncheck',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chassis:stcCfg.chassis,restIp:stcCfg.restIp,restPort:stcCfg.restPort})}); const d=await r.json();
    if(d.ok&&d.modules){ _stcRealModules=d.modules; _stcConnInfo={model:d.model,serial:d.serial,firmware:d.firmware}; return true; } }
  catch(e){}
  return false; }
function stcRenderStatus(){
  const st=document.getElementById('stc-status'); if(st){ const r=_stcState.running; const done=!r&&_stcState.elapsed>0; st.textContent=r?'실행 중':(done?'완료':'대기'); st.style.background=r?'rgba(0,168,114,0.14)':(done?'rgba(45,111,212,0.12)':'#eee'); st.style.color=r?'#00875a':(done?'#2d6fd4':'#888'); }
  const el=document.getElementById('stc-elapsed'); if(el&&stcCfg) el.textContent=_stcState.elapsed?('경과 '+_stcState.elapsed.toFixed(1)+'s / '+stcCfg.duration+'s'):'';
  const bs=document.getElementById('stc-btn-start'); if(bs) bs.disabled=_stcState.running;
}
function stcRenderRows(){
  const wrap=document.getElementById('stc-results'); if(!wrap) return; const th='padding:8px 10px;text-align:right;font-size:10.5px;font-weight:800;color:#5a6072;background:#f1edf0;border-bottom:1px solid #e0d6dc;white-space:nowrap;position:sticky;top:0;';
  const head='<tr><th style="'+th+'text-align:left;">스트림</th><th style="'+th+'text-align:center;">방향</th><th style="'+th+'">TX 프레임</th><th style="'+th+'">RX 프레임</th><th style="'+th+'">TX fps</th><th style="'+th+'">RX fps</th><th style="'+th+'">TX Rate</th><th style="'+th+'">RX Rate</th><th style="'+th+'">Loss</th><th style="'+th+'">Loss%</th></tr>';
  const rows=(_stcState.streams||[]).map(function(s){ const td='padding:7px 10px;text-align:right;border-bottom:1px solid #f0eef0;font-size:11.5px;font-family:ui-monospace,monospace;white-space:nowrap;'; const lr=s.txF?(s.loss/s.txF*100):0; const lc=s.loss>0?'#e53e5a':'#00a872';
    return '<tr><td style="'+td+'text-align:left;font-family:inherit;font-weight:700;color:#c0497b;">'+_bdEsc(s.name)+'</td><td style="'+td+'text-align:center;font-family:inherit;color:var(--text3);">'+s.tx+'→'+s.rx+'</td><td style="'+td+'">'+_fN(s.txF)+'</td><td style="'+td+'">'+_fN(s.rxF)+'</td><td style="'+td+'color:var(--text3);">'+_fN(s.txFps)+'</td><td style="'+td+'color:var(--text3);">'+_fN(s.rxFps)+'</td><td style="'+td+'">'+_fBps(s.txBps)+'</td><td style="'+td+'">'+_fBps(s.rxBps)+'</td><td style="'+td+'color:'+lc+';font-weight:700;">'+_fN(s.loss)+'</td><td style="'+td+'color:'+lc+';font-weight:700;">'+lr.toFixed(4)+'%</td></tr>';
  }).join('');
  wrap.innerHTML='<table style="width:100%;border-collapse:collapse;"><thead>'+head+'</thead><tbody>'+rows+'</tbody></table>';
  const sm=document.getElementById('stc-summary'); if(sm){ const tx=(_stcState.streams||[]).reduce(function(a,s){return a+s.txF;},0); const rx=(_stcState.streams||[]).reduce(function(a,s){return a+s.rxF;},0); const loss=Math.max(0,tx-rx); const lr=tx?(loss/tx*100):0; const pass=loss===0; const verdict=(_stcState.running||tx===0)?'':('<span style="font-size:12px;font-weight:800;color:#fff;background:'+(pass?'#00a872':'#e53e5a')+';border-radius:7px;padding:3px 14px;margin-left:10px;">'+(pass?'합격 (무손실)':'불합격 (손실 발생)')+'</span>');
    sm.innerHTML='<div style="display:flex;align-items:center;gap:16px;font-size:12px;flex-wrap:wrap;"><span style="font-weight:800;color:var(--text2);">합계</span><span>총 TX <b>'+_fN(tx)+'</b></span><span>총 RX <b>'+_fN(rx)+'</b></span><span style="color:'+(loss?'#e53e5a':'#00a872')+';">Loss <b>'+_fN(loss)+'</b> ('+lr.toFixed(4)+'%)</span>'+verdict+'</div>'; }
}
// 트래픽 결과: 스크립트의 __STC_RES__ JSON 마커를 파싱해 표를 in-place 갱신(로그 누적 X)
let _stcTxData=null;
function stcClearTxResults(){
  if(_stcTxData&&_stcTxData.streams&&_stcTxData.streams.length){
    // 스트림 행은 유지하고 카운터만 0으로 초기화
    _stcTxData.streams.forEach(function(p){ p.tx=0; p.rx=0; p.dropped=0; p.lossPct=0; p.latMin=0; p.latAvg=0; p.latMax=0; p.jitAvg=0; p.jitMax=0; p.outSeq=0; p.reordered=0; p.late=0; p.dup=0; });
    _stcTxData.t=0; _stcTxData.final=false;
    stcRenderTxResults();
  } else {
    var w=document.getElementById('stc-results'); if(w)w.innerHTML='';
    var s=document.getElementById('stc-summary'); if(s)s.innerHTML='';
    _stcTxData=null;
  }
  showToast('카운터를 지웠습니다');
}
function stcUpdateTxResults(s){ var d; try{ d=JSON.parse(s); }catch(e){ return; }
  // 백엔드가 포트 단위({ports:[{port,tx,rx,loss}]})로 보내는 경우 → 표(streams) 형식으로 매핑 (필드명 호환)
  if(d && !Array.isArray(d.streams) && Array.isArray(d.ports)){
    d.streams=d.ports.map(function(p){ var tx=+p.tx||0, rx=+p.rx||0; return {name:String(p.port||''), src:String(p.port||''), dst:'', tx:tx, rx:rx, dropped:(p.loss!=null?(+p.loss||0):Math.max(0,tx-rx)), outSeq:0, dup:0}; });
  }
  // 정지 직후 0-프레임 결과가 와도 직전 누적값을 덮어쓰지 않음(누적 보존)
  if(d&&d.streams&&_stcTxData&&_stcTxData.streams){
    var nt=d.streams.reduce(function(a,p){return a+(p.tx||0)+(p.rx||0);},0);
    var ot=_stcTxData.streams.reduce(function(a,p){return a+(p.tx||0)+(p.rx||0);},0);
    if(nt===0&&ot>0){ if(d.final)_stcTxData.final=true; stcRenderTxResults(); return; }
  }
  _stcTxData=d; stcRenderTxResults();
}function stcRenderTxResults(){ var wrap=document.getElementById('stc-results'); if(!wrap||!_stcTxData)return;
  // 스트림(방향)별 시그니처 측정: 손실 없으면 TX==RX, 손실은 STC 가 시퀀스로 직접 셈(Dropped).
  var th='padding:4px 9px;text-align:right;font-size:10.5px;font-weight:800;color:#5a6072;background:#f1edf0;border-bottom:1px solid #e0d6dc;white-space:nowrap;position:sticky;top:0;';
  var sub='font-weight:600;color:#aeb4c0;font-size:8.5px;';
  var fin=_stcTxData.final;
  var head='<tr><th style="'+th+'text-align:left;">스트림</th>'+
    '<th style="'+th+'text-align:left;">경로</th>'+
    '<th style="'+th+'">TX <span style="'+sub+'">송신</span></th>'+
    '<th style="'+th+'">RX <span style="'+sub+'">수신</span></th>'+
    '<th style="'+th+'">손실 <span style="'+sub+'">Dropped</span></th>'+
    '<th style="'+th+'">손실률 <span style="'+sub+'">%</span></th>'+
    '<th style="'+th+'">지연 µs <span style="'+sub+'">최소</span></th>'+
    '<th style="'+th+'">지연 µs <span style="'+sub+'">평균</span></th>'+
    '<th style="'+th+'">지연 µs <span style="'+sub+'">최대</span></th>'+
    '<th style="'+th+'">지터 µs <span style="'+sub+'">평균</span></th>'+
    '<th style="'+th+'">순서이탈 <span style="'+sub+'">중복</span></th></tr>';
  // 같은 스트림 이름이 여러 플로우로 펼쳐지면 #1,#2… 로 번호 매김
  var _seen={};
  var rows=(_stcTxData.streams||[]).map(function(p){ var td='padding:5px 10px;text-align:right;border-bottom:1px solid #f0eef0;font-size:12.5px;font-family:ui-monospace,monospace;white-space:nowrap;';
    var bad=((p.dropped||0)>0); var lc=bad?'#e53e5a':'#00a872';
    var rxc=(fin&&p.rx<p.tx&&!bad)?'#b86a00':'#222';
    _seen[p.name]=(_seen[p.name]||0)+1; var flowNo=_seen[p.name];
    var nameTot=(_stcTxData.streams||[]).filter(function(q){return q.name===p.name;}).length;
    var label=_bdEsc(p.name)+(nameTot>1?(' <span style="color:#aeb4c0;font-weight:600;">#'+flowNo+'</span>'):'');
    var oseq=(p.outSeq||0), dup=(p.dup||0); var seqc=(oseq>0)?'#e8820c':'var(--text3)';
    return '<tr><td style="'+td+'text-align:left;font-weight:700;color:#7c3aed;font-family:inherit;">'+label+'</td>'+
      '<td style="'+td+'text-align:left;color:#c0497b;font-family:inherit;font-size:11px;">'+_bdEsc(p.src)+' → '+_bdEsc(p.dst)+'</td>'+
      '<td style="'+td+'">'+_fN(p.tx)+'</td>'+
      '<td style="'+td+'color:'+rxc+';">'+_fN(p.rx)+'</td>'+
      '<td style="'+td+'color:'+lc+';font-weight:700;">'+_fN(p.dropped||0)+'</td>'+
      '<td style="'+td+'color:'+lc+';">'+(+(p.lossPct||0)).toFixed(3)+'%</td>'+
      '<td style="'+td+'color:var(--text3);">'+_fN(p.latMin)+'</td>'+
      '<td style="'+td+'font-weight:700;">'+_fN(p.latAvg)+'</td>'+
      '<td style="'+td+'color:var(--text3);">'+_fN(p.latMax)+'</td>'+
      '<td style="'+td+'color:var(--text3);">'+_fN(p.jitAvg)+'</td>'+
      '<td style="'+td+'color:'+seqc+';">'+_fN(oseq)+' / '+_fN(dup)+'</td></tr>'; }).join('');
  wrap.innerHTML='<table style="width:100%;border-collapse:collapse;"><thead>'+head+'</thead><tbody>'+rows+'</tbody></table>';
  var sm=document.getElementById('stc-summary'); if(sm){ var ss=_stcTxData.streams||[];
    var tx=ss.reduce(function(a,p){return a+(p.tx||0);},0);
    var rx=ss.reduce(function(a,p){return a+(p.rx||0);},0);
    var drop=ss.reduce(function(a,p){return a+(p.dropped||0);},0);
    var lr=tx?(drop/tx*100):0; var ok=(drop===0&&tx>0);
    var verdict=fin?('<span style="font-size:12px;font-weight:800;color:#fff;background:'+(ok?'#00a872':'#e53e5a')+';border-radius:7px;padding:3px 14px;margin-left:8px;">'+(ok?'합격 (무손실)':'불합격 (손실 '+_fN(drop)+')')+'</span>'):'';
    sm.innerHTML='<div style="display:flex;align-items:center;gap:16px;font-size:12px;flex-wrap:wrap;"><span style="font-weight:800;color:var(--text2);">t='+(_stcTxData.t||0)+'s'+(fin?' (최종)':' · 실시간')+'</span><span>총 TX <b>'+_fN(tx)+'</b></span><span>총 RX <b>'+_fN(rx)+'</b></span><span style="color:'+(drop?'#e53e5a':'#00a872')+';">손실 <b>'+_fN(drop)+'</b> ('+lr.toFixed(4)+'%)</span>'+verdict+'</div>'; }
}
// 시뮬레이션(목업) 엔진 stcTick/stcStart 제거됨 — 트래픽은 실제 STC GeneratorStart 만 사용
function stcStop(){ if(_stcTimer){ clearInterval(_stcTimer); _stcTimer=null; } _stcState.running=false; stcRenderStatus(); stcRenderRows(); }
let _stcRealRunning=false;function stcConsole(line){ const c=document.getElementById('stc-console'); if(!c)return; c.textContent+=(line||'')+'\n'; c.scrollTop=c.scrollHeight; }
function _stcSrvSet(txt,bg,fg){ const el=document.getElementById('stc-srv-status'); if(el){ el.textContent=txt; el.style.background=bg; el.style.color=fg; } }
async function stcServerStatus(){ try{ const r=await fetch('/api/stc/server/status'); const d=await r.json();
    if(d.listening){ _stcSrvSet('REST: 실행중','rgba(0,168,114,0.15)','#00875a'); } else { _stcSrvSet('REST: 대기 (클릭해 시작)','#fdecef','#e53e5a'); }
    return d.listening; }catch(e){ _stcSrvSet('REST: 확인불가','#eee','#888'); return false; } }// ══════════ 트래픽 시험 5단계 (영속 세션) ══════════
let _stcStep={connect:'idle',reserve:'idle',devices:'idle',streams:'idle',traffic:'idle'};
let _stcCntTimer=null;
const _STC_STEPS=[
 {k:'connect',n:1,t:'계측기 연결',d:'세션 열고 섀시 연결'},
 {k:'reserve',n:2,t:'포트 잡기(예약)',d:'아래 선택한 A·B 포트 예약'},
 {k:'devices',n:3,t:'가상 장비(L2/L3)',d:'양쪽 IPv4 장비 생성'},
 {k:'streams',n:4,t:'트래픽 정의',d:'프레임·부하로 스트림 생성'},
 {k:'traffic',n:5,t:'트래픽 시작/정지·결과',d:'송신 + 카운터 조회'}
];
function _stcDot(s){ return {idle:'#c2c8d2',run:'#e8820c',ok:'#00a872',err:'#e53e5a'}[s]||'#c2c8d2'; }
function stcRenderSteps(){ const el=document.getElementById('stc-steps'); if(!el)return;
  const sb='font-size:11px;padding:5px 10px;border-radius:7px;border:1px solid #2d6fd4;background:#fff;color:#2d6fd4;cursor:pointer;font-weight:700;';
  el.innerHTML=_STC_STEPS.map(function(s){ const st=_stcStep[s.k]||'idle';
    var ctrl;
    if(s.k==='traffic'){ ctrl='<button onclick="stcStepStart()" title="실제 트래픽 송신" style="font-size:11px;padding:5px 9px;border-radius:7px;border:none;background:#00a872;color:#fff;cursor:pointer;font-weight:800;"><i class="ti ti-player-play"></i></button><button onclick="stcStepStop()" style="font-size:11px;padding:5px 9px;border-radius:7px;border:1px solid var(--red);background:#fff;color:var(--red);cursor:pointer;font-weight:800;margin-left:4px;"><i class="ti ti-player-stop"></i></button>'; }
    else { ctrl='<button onclick="stcStepRun(\''+s.k+'\')" style="'+sb+'">실행</button>'; }
    return '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);"><span style="width:9px;height:9px;border-radius:50%;background:'+_stcDot(st)+';flex-shrink:0;"></span><span style="width:14px;font-weight:800;color:var(--text3);font-size:11px;">'+s.n+'</span><div style="flex:1;min-width:0;"><div style="font-size:12.5px;font-weight:700;">'+s.t+'</div><div style="font-size:10px;color:var(--text3);">'+s.d+'</div></div>'+ctrl+'</div>';
  }).join('')+
  '<div style="display:flex;gap:6px;margin-top:9px;"><button onclick="stcRunAll()" style="flex:1;font-size:12px;padding:8px;border-radius:8px;border:none;background:#7c3aed;color:#fff;cursor:pointer;font-weight:800;"><i class="ti ti-wand"></i> ①~④ 한 번에 준비</button><button onclick="stcStepEnd()" title="세션 종료=예약·구성 모두 해제" style="font-size:12px;padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;font-weight:700;">정리</button></div>';
}
function _stcAB(){ const A=_stcSel.A||{slot:stcCfg.slot||1,port:stcCfg.portA},B=_stcSel.B||{slot:stcCfg.slot||1,port:stcCfg.portB}; return {A:A,B:B}; }
let _stcBusy=false;
async function _stcStepCall(action,params){
  // STC 세션은 동시에 하나의 요청만 처리 가능 → 직렬화(경합·세션잠금 방지)
  var _w=0; while(_stcBusy && _w<150){ await new Promise(function(r){setTimeout(r,200);}); _w++; }
  _stcBusy=true;
  try{ stcReadForm(); var _u=(typeof currentUser!=='undefined'&&currentUser&&currentUser.username)||'admin'; var _p=Object.assign({user:_u}, params||{});
    const body={chassis:stcCfg.chassis,restIp:stcCfg.restIp,restPort:stcCfg.restPort,params:_p};
    const r=await fetch('/api/stc/sess/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); return await r.json(); }
  finally{ _stcBusy=false; }
}
async function stcStepRun(k){ _stcStep[k]='run'; stcRenderSteps(); const ab=_stcAB(); let res;
  try{
    if(k==='connect'){ stcConsole('▶ ① 계측기 연결 …(10~20초)'); res=await _stcStepCall('connect'); if(res&&res.ok)stcConsole('  ✔ 연결 — '+(res.model||'')+' FW '+(res.firmware||'')); }
    else if(k==='reserve'){ stcConsole('▶ ② 포트 예약 '+ab.A.slot+'/'+ab.A.port+', '+ab.B.slot+'/'+ab.B.port+' …'); res=await _stcStepCall('reserve',{ports:ab.A.slot+'/'+ab.A.port+','+ab.B.slot+'/'+ab.B.port}); if(res&&res.ok)stcConsole('  ✔ 예약: '+(res.reserved||[]).join(', ')); }
    else if(k==='devices'){ stcConsole('▶ ③ 가상 장비(L2/L3) 생성 …'); res=await _stcStepCall('devices',{portA:ab.A.slot+'/'+ab.A.port,portB:ab.B.slot+'/'+ab.B.port,A:{ip:stcCfg.devA.ip,gw:stcCfg.devA.gw,mac:stcCfg.devA.mac,prefix:24},B:{ip:stcCfg.devB.ip,gw:stcCfg.devB.gw,mac:stcCfg.devB.mac,prefix:24}}); if(res&&res.ok)stcConsole('  ✔ 장비 A('+stcCfg.devA.ip+') · B('+stcCfg.devB.ip+')'); }
    else if(k==='streams'){ stcConsole('▶ ④ 트래픽 정의(스트림) …'); res=await _stcStepCall('streams',{frame:stcCfg.frame,load:stcCfg.load,loadUnit:stcCfg.loadUnit,proto:stcCfg.proto,dstPort:stcCfg.dstPort,srcPort:stcCfg.srcPort}); if(res&&res.ok)stcConsole('  ✔ 스트림: '+(res.streams||[]).join(', ')); }
    if(res&&res.note){ stcConsole('  ℹ '+res.note); }
    if(!(res&&res.ok)){ stcConsole('  ✘ 실패: '+((res&&res.error)||'알 수 없음')); }
    _stcStep[k]=(res&&res.ok)?'ok':'err';
  }catch(e){ _stcStep[k]='err'; stcConsole('  ✘ '+k+' 호출 실패: '+e.message); }
  stcRenderSteps(); return _stcStep[k]==='ok';
}
async function stcRunAll(){ stcConsole('▶ 트래픽 시험 준비 ①~④ 시작 …'); const seq=['connect','reserve','devices','streams']; for(var i=0;i<seq.length;i++){ const ok=await stcStepRun(seq[i]); if(!ok){ showToast(seq[i]+' 단계 실패 — 중단'); return; } } showToast('준비 완료 — ⑤ ▶로 트래픽 시작'); }
async function stcStepStart(){ _stcStep.traffic='run'; stcRenderSteps(); stcConsole('▶ ⑤ 실제 트래픽 시작'); try{ const res=await _stcStepCall('start'); if(res&&res.ok){ stcConsole('  ✔ 송신 시작 (generators '+res.generators+')'); _stcState.running=true; stcRenderStatus(); _stcStartCounters(); } else { _stcStep.traffic='err'; stcConsole('  ✘ 시작 실패: '+((res&&res.error)||'')); } }catch(e){ _stcStep.traffic='err'; stcConsole('  ✘ 시작 호출 실패: '+e.message); } stcRenderSteps(); }
async function stcStepStop(){ stcConsole('■ 트래픽 정지'); if(_stcCntTimer){clearInterval(_stcCntTimer);_stcCntTimer=null;} try{ const res=await _stcStepCall('stop'); await _stcPollCounters(); _stcState.running=false; _stcStep.traffic=(res&&res.ok)?'ok':'err'; stcRenderStatus(); stcConsole('  ✔ 정지'); }catch(e){ stcConsole('  ✘ 정지 실패: '+e.message); } stcRenderSteps(); }
function _stcStartCounters(){ if(_stcCntTimer)clearInterval(_stcCntTimer); _stcCntTimer=setInterval(_stcPollCounters,2000); _stcPollCounters(); }
async function _stcPollCounters(){ try{ const res=await _stcStepCall('counters'); if(res&&res.ok){ _stcState.streams=(res.streams||[]).map(function(s){ return {name:s.name,tx:'→',rx:'',txF:s.tx,rxF:s.rx,txFps:0,rxFps:0,txBps:0,rxBps:0,loss:s.loss}; }); if(!_stcInputHasFocus()) stcRenderRows(); } }catch(e){} }
async function stcStepEnd(){ stcConsole('▶ 세션 정리(종료) …'); if(_stcCntTimer){clearInterval(_stcCntTimer);_stcCntTimer=null;} try{ const res=await _stcStepCall('end'); stcConsole('  ✔ 세션 종료'+((res&&res.ended)?'':' (세션 없음)')); }catch(e){} _stcStep={connect:'idle',reserve:'idle',devices:'idle',streams:'idle',traffic:'idle'}; _stcState.running=false; stcRenderStatus(); stcRenderSteps(); showToast('세션 정리됨'); }
async function stcServerStart(){ if(!stcCfg)stcLoadCfg(); _stcSrvSet('REST: 시작중…','#fff7e6','#b86a00'); stcConsole('▶ REST 서버 시작 요청 (stcweb.exe)');
  try{ const r=await fetch('/api/stc/server/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({port:stcCfg.restPort||8888})}); const d=await r.json();
    if(d.ok){ _stcSrvSet('REST: 실행중','rgba(0,168,114,0.15)','#00875a'); stcConsole(d.already?'   이미 실행 중':'   서버 준비됨 (localhost:'+(stcCfg.restPort||8888)+')'); showToast('REST 서버 실행중'); }
    else { _stcSrvSet('REST: 실패','#fdecef','#e53e5a'); stcConsole('[오류] '+(d.error||'시작 실패')); showToast(d.error||'REST 서버 시작 실패'); } }
  catch(e){ _stcSrvSet('REST: 실패','#fdecef','#e53e5a'); stcConsole('[오류] 백엔드 호출 실패: '+e.message); } }async function stcStopReal(){ if(!_stcRealRunning){ return; } try{ await fetch('/api/stc/stop',{method:'POST'}); stcConsole('■ 중지 요청'); }catch(e){} }
function stcOnWS(msg){
  if(msg.type==='stc_start'){ stcConsole('═══ STC 시작 ═══  '+(msg.cmd||'')); return; }
  if(msg.type==='stc_done'){ _stcRealRunning=false; _stcState.running=false; stcRenderStatus(); stcRenderRows(); stcConsole('═══ 종료 (exit '+msg.code+') ═══'); if(typeof stcStartStatusPoll==='function')stcStartStatusPoll(); /* 전송 끝나면 폴링 재개(포트 복원 반영) */ if(_stcWiz===4)stcWizRender(); return; }
  if(msg.type==='stc_line'){ var ln=msg.line||''; if(ln.indexOf('__STC_RES__')===0){ stcUpdateTxResults(ln.replace(/^__STC_RES__\s*/,'')); return; } stcConsole(ln); stcParseLine(ln); }
}
function stcParseLine(line){
  if(!line||line.indexOf('|')<0) return;
  const cells=line.split('|').map(function(x){return x.trim();});
  // LIVE 행: 첫 칸이 elapsed("12.0s")이고 둘째가 스트림명인 행만 반영
  const em=(cells[0]||'').match(/^([\d.]+)s$/); if(!em) return;
  const el=parseFloat(em[1]); if(!isNaN(el)) _stcState.elapsed=el;
  const sname=cells[1]||''; const st=(_stcState.streams||[]).find(function(s){return s.name===sname;});
  if(st){ const num=function(v){ return parseInt(String(v||'').replace(/[^\d]/g,''),10)||0; };
    // 컬럼 순서는 스크립트 SELECTED_COUNTERS 기준 (tx_frames/rx_frames 위치 추정)
    const txi=cells.findIndex(function(c,i){return i>=4&&/^\d[\d,]*$/.test(c);});
    if(txi>0){ st.txF=num(cells[txi]); st.rxF=num(cells[txi+1]); st.loss=Math.max(0,st.txF-st.rxF); }
  }
  if(_stcInputHasFocus()) return;   // 입력 중이면 재렌더 스킵 (데이터 상태만 갱신, 화면은 다음 이벤트에서)
  stcRenderStatus(); stcRenderRows();
}
function openItmsEdit(){ if(typeof canAccess==='function'&&!canAccess('itms-rack-edit')){ if(typeof _rbacDenied==='function')_rbacDenied('Rack View 설정(편집)'); return; } _rackEdit=true; showPage('itms-rack'); }
function _nextRackName(labId){ let n=0; (labRacks||[]).filter(r=>r.lab_id===labId).forEach(function(r){ const mm=(r.name||'').match(/(\d+)\s*$/); if(mm){ const x=parseInt(mm[1],10); if(x>n)n=x; } }); return 'Rack-'+(n+1); }
function rackQuickAdd(u){ if(!_rackLab){ showToast('먼저 Lab을 추가/선택하세요'); return; } const units=(u===36||u===45)?u:45; labRacks.push({id:'rack-'+Date.now(),name:_nextRackName(_rackLab),units:units,lab_id:_rackLab}); saveRacks(); renderRackPage(); showToast(units+'U 랙 추가됨'); }
function rackAddPrompt(){
  if(!_rackLab){ showToast('먼저 Lab을 추가/선택하세요'); return; }
  const lab=labLabs.find(l=>l.id===_rackLab); const e=_bdEsc;
  const old=document.getElementById('rack-add-modal'); if(old)old.remove();
  const m=document.createElement('div'); m.id='rack-add-modal'; m.className='modal-overlay'; m.style.display='flex';
  const uChips=[45,36].map(function(u){ return '<button type="button" onclick="document.getElementById(\'rack-add-u\').value='+u+'" style="font-size:13px;padding:6px 16px;border-radius:7px;border:1.5px solid #e8820c;background:#fff;color:#e8820c;cursor:pointer;font-weight:800;">'+u+'U</button>'; }).join('');
  m.innerHTML='<div class="modal" style="width:480px;max-width:94vw;border-radius:14px;padding:0;overflow:hidden;">'+
    '<div style="padding:18px 22px;background:linear-gradient(135deg,#e8820c,#f59e2b);color:#fff;display:flex;align-items:center;gap:11px;"><div style="width:40px;height:40px;border-radius:11px;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;"><i class="ti ti-server-2" style="font-size:21px;"></i></div><div><div style="font-size:16px;font-weight:800;">새 Rack 추가</div><div style="font-size:11.5px;opacity:0.9;"><i class="ti ti-building" style="font-size:11px;"></i> '+e(lab?lab.name:'')+'</div></div></div>'+
    '<div style="padding:18px 22px 4px;"><label style="font-size:11.5px;font-weight:700;color:var(--text3);display:block;margin-bottom:6px;">소속 Lab</label><select id="rack-add-lab" onchange="var n=document.getElementById(\'rack-add-name\');if(n)n.value=_nextRackName(this.value)" style="width:100%;font-size:14px;padding:11px 13px;border:1.5px solid var(--border);border-radius:9px;outline:none;box-sizing:border-box;background:#fff;cursor:pointer;">'+labLabs.map(function(l){return '<option value="'+l.id+'" '+(l.id===_rackLab?'selected':'')+'>'+e(l.name)+'</option>';}).join('')+'</select></div>'+
    '<div style="padding:10px 22px 4px;display:flex;gap:14px;">'+
      '<div style="flex:1;"><label style="font-size:11.5px;font-weight:700;color:var(--text3);display:block;margin-bottom:6px;">이름 <span style="font-weight:400;">(개수 2↑이면 접두어)</span></label><input id="rack-add-name" value="'+e(_nextRackName(_rackLab))+'" onkeydown="if(event.key===\'Enter\')rackAddSubmit()" style="width:100%;font-size:14px;padding:11px 13px;border:1.5px solid var(--border);border-radius:9px;outline:none;box-sizing:border-box;"></div>'+
      '<div style="width:90px;"><label style="font-size:11.5px;font-weight:700;color:var(--text3);display:block;margin-bottom:6px;">개수</label><input id="rack-add-count" type="number" min="1" value="1" onkeydown="if(event.key===\'Enter\')rackAddSubmit()" style="width:100%;font-size:14px;padding:11px 13px;border:1.5px solid var(--border);border-radius:9px;outline:none;box-sizing:border-box;"></div>'+
    '</div>'+
    '<div style="padding:8px 22px 4px;"><label style="font-size:11.5px;font-weight:700;color:var(--text3);display:block;margin-bottom:6px;">높이 (U)</label><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">'+uChips+'</div><input id="rack-add-u" type="number" min="1" value="45" onkeydown="if(event.key===\'Enter\')rackAddSubmit()" style="width:120px;font-size:14px;padding:9px 13px;border:1.5px solid var(--border);border-radius:9px;outline:none;box-sizing:border-box;"></div>'+
    '<div style="padding:12px 22px 20px;display:flex;gap:9px;justify-content:flex-end;"><button onclick="document.getElementById(\'rack-add-modal\').remove()" style="font-size:13px;padding:9px 18px;border-radius:9px;border:1.5px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;font-weight:600;">취소</button><button onclick="rackAddSubmit()" style="font-size:13px;padding:9px 22px;border-radius:9px;border:none;background:#e8820c;color:#fff;cursor:pointer;font-weight:700;"><i class="ti ti-plus"></i> 생성</button></div>'+
  '</div>';
  document.body.appendChild(m); setTimeout(function(){const i=document.getElementById('rack-add-name');if(i){i.focus();i.select();}},50);
}
function rackAddSubmit(){
  const ni=document.getElementById('rack-add-name'); const lab=(document.getElementById('rack-add-lab')||{}).value||_rackLab; _rackLab=lab;
  const name0=((ni&&ni.value||'').trim())||_nextRackName(lab);
  const u=parseInt((document.getElementById('rack-add-u')||{}).value,10)||45;
  const count=Math.max(1,parseInt((document.getElementById('rack-add-count')||{}).value,10)||1);
  if(count===1){ labRacks.push({id:'rack-'+Date.now(),name:name0,units:u,lab_id:lab}); }
  else { const mm=name0.match(/^(.*?)(\d+)\s*$/); const pre=mm?mm[1]:(name0+'-'); const start=mm?parseInt(mm[2],10):1; for(let i=0;i<count;i++){ labRacks.push({id:'rack-'+Date.now()+'-'+i,name:pre+(start+i),units:u,lab_id:lab}); } }
  saveRacks(); const m=document.getElementById('rack-add-modal'); if(m)m.remove(); renderRackPage(); showToast(count+'개 랙 추가됨');
}
function rackEditU(id){ const rk=labRacks.find(r=>r.id===id); if(!rk)return; uiPrompt({title:'랙 높이 (U) 변경', label:'높이 (45 또는 36 권장)', value:String(rk.units||45), icon:'ti-server-2', onConfirm:function(v){ const u=parseInt(v,10); if(u&&u>0){ rk.units=u; saveRacks(); renderRackPage(); showToast(u+'U로 변경됨'); } }}); }
function rackRename(id){ const rk=labRacks.find(r=>r.id===id); if(!rk)return; uiPrompt({title:'랙 이름 변경', label:'랙 이름 (번호 '+(rk.name||'')+')', value:rk.label||'', icon:'ti-server-2', placeholder:'예: BMT-1, 상용망-A', onConfirm:function(v){ const r=labRacks.find(x=>x.id===id); if(!r)return; r.label=(v||'').trim(); saveRacks(); renderRackPage(); showToast('랙 이름: '+(r.label||'(없음)')); }}); }
function rackDel(id){
  const rk=labRacks.find(r=>r.id===id); if(!rk)return;
  _uiConfirm({ title:'랙 삭제', danger:true, okText:'삭제',
    msg:'<b>'+_bdEsc(rk.name)+'</b>'+(rk.label?(' · '+_bdEsc(rk.label)):'')+' 랙을 삭제할까요?<br><span style="color:var(--text3);font-size:12.5px;">배치된 장비는 미배치로 돌아가고, 이 랙의 블랭크도 제거됩니다.</span>',
    onOk:function(){
      (deviceList||[]).forEach(d=>{ if(d.rack_id===rk.id||(!d.rack_id&&d.rack_name===rk.name)){ d.rack_id=''; d.rack_name=''; d.rack_pos=0; } });
      rackBlanks=(rackBlanks||[]).filter(b=>!(b.rack_id===rk.id||(!b.rack_id&&b.rack_name===rk.name)));
      labRacks=labRacks.filter(r=>r.id!==id); saveRacks(); saveDeviceData(); renderRackPage();
    }});
}
// 현대식 확인 모달
function _uiConfirm(o){
  o=o||{}; var e=_bdEsc; var old=document.getElementById('ui-confirm'); if(old)old.remove();
  var danger=!!o.danger;
  var m=document.createElement('div'); m.id='ui-confirm';
  m.style.cssText='position:fixed;inset:0;background:rgba(15,20,30,0.45);z-index:100002;display:flex;align-items:center;justify-content:center;';
  m.innerHTML='<div style="background:#fff;width:min(400px,92vw);border-radius:16px;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,0.35);">'+
    '<div style="padding:22px 24px 6px;display:flex;align-items:flex-start;gap:13px;"><div style="width:42px;height:42px;border-radius:12px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:'+(danger?'#fdecee':'#eef3ff')+';color:'+(danger?'#e23d4d':'#2d6fd4')+';"><i class="ti '+(o.icon||(danger?'ti-trash':'ti-help-circle'))+'" style="font-size:22px;"></i></div>'+
      '<div style="flex:1;padding-top:2px;"><div style="font-size:16px;font-weight:800;color:var(--text);margin-bottom:5px;">'+e(o.title||'확인')+'</div><div style="font-size:13.5px;color:var(--text2);line-height:1.55;">'+(o.msg||'')+'</div></div></div>'+
    '<div style="padding:16px 22px 18px;display:flex;gap:9px;justify-content:flex-end;"><button id="ui-confirm-no" style="font-size:13.5px;padding:9px 18px;border-radius:9px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;font-weight:600;">취소</button><button id="ui-confirm-yes" style="font-size:13.5px;padding:9px 20px;border-radius:9px;border:none;background:'+(danger?'#e23d4d':'#2d6fd4')+';color:#fff;cursor:pointer;font-weight:700;">'+e(o.okText||'확인')+'</button></div>'+
  '</div>';
  document.body.appendChild(m);
  var close=function(){ var x=document.getElementById('ui-confirm'); if(x)x.remove(); };
  m.addEventListener('mousedown',function(ev){ if(ev.target===m)close(); });
  document.getElementById('ui-confirm-no').onclick=close;
  document.getElementById('ui-confirm-yes').onclick=function(){ close(); if(typeof o.onOk==='function')o.onOk(); };
  var y=document.getElementById('ui-confirm-yes'); if(y)y.focus();
}
function _RU(d){ var n=parseInt(d&&d.rack_units,10); return (n>0)?n:1; }   // rack_units → 정수(문자열 저장 방어)
function _RP(d){ var n=parseInt(d&&d.rack_pos,10); return (n>0)?n:0; }     // rack_pos → 정수
// 장비/블랭크-랙 매칭: rack_id 우선(이름은 구 데이터 폴백) → 동명 랙 lab간 중복 방지
function _devInRack(d,rk){ if(!rk||!_RP(d))return false; return d.rack_id?(d.rack_id===rk.id):(d.rack_name===rk.name); }
function _blkInRack(b,rk){ if(!rk)return false; return b.rack_id?(b.rack_id===rk.id):(b.rack_name===rk.name); }
function _rackDevAt(rk,u){ return (deviceList||[]).find(d=>_devInRack(d,rk) && u>=_RP(d) && u<(_RP(d)+_RU(d))); }
function _rackBlankAt(rk,u){ return (rackBlanks||[]).find(function(b){ var bp=parseInt(b.pos,10)||0,bu=parseInt(b.units,10)||1; return _blkInRack(b,rk)&&bp&&u>=bp&&u<(bp+bu); }); }
function _rackOccAt(rk,u){ const d=_rackDevAt(rk,u); if(d)return {type:'dev',d:d}; const b=_rackBlankAt(rk,u); if(b)return {type:'blk',b:b}; return null; }
function rackDragBlank(ev,label,units,color,icon){ ev.dataTransfer.setData('text/plain','blk|'+units+'|'+(color||'')+'|'+(icon||'')+'|'+label); ev.dataTransfer.effectAllowed='copy'; _rackDragSetup(units,'blk',''); }
function rackBlankRemove(id){ rackBlanks=(rackBlanks||[]).filter(b=>b.id!==id); saveRacks(); renderRackPage(); }
function blankTypeDel(i){ rackBlankTypes.splice(i,1); saveRacks(); renderRackPage(); }
function blankTypeAdd(){
  const old=document.getElementById('blank-add-modal'); if(old)old.remove();
  const m=document.createElement('div'); m.id='blank-add-modal'; m.className='modal-overlay'; m.style.display='flex';
  m.innerHTML='<div class="modal" style="width:430px;max-width:94vw;border-radius:14px;padding:0;overflow:hidden;">'+
    '<div style="padding:18px 22px;background:linear-gradient(135deg,#475569,#64748b);color:#fff;display:flex;align-items:center;gap:11px;"><div style="width:40px;height:40px;border-radius:11px;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;"><i class="ti ti-rectangle" style="font-size:21px;"></i></div><div><div style="font-size:16px;font-weight:800;">Blank 부품 등록</div><div style="font-size:11.5px;opacity:0.85;">블랭크/홀 패널 — 드래그해서 랙에 배치</div></div></div>'+
    '<div style="padding:20px 22px;display:flex;gap:14px;"><div style="flex:1;"><label style="font-size:11.5px;font-weight:700;color:var(--text3);display:block;margin-bottom:6px;">이름</label><input id="blank-add-label" value="Blank" onkeydown="if(event.key===\'Enter\')blankTypeSubmit()" placeholder="Blank / Blank hole" style="width:100%;font-size:14px;padding:11px 13px;border:1.5px solid var(--border);border-radius:9px;outline:none;box-sizing:border-box;"></div><div style="width:120px;"><label style="font-size:11.5px;font-weight:700;color:var(--text3);display:block;margin-bottom:6px;">크기 (U)</label><input id="blank-add-u" type="number" min="1" value="1" onkeydown="if(event.key===\'Enter\')blankTypeSubmit()" style="width:100%;font-size:14px;padding:11px 13px;border:1.5px solid var(--border);border-radius:9px;outline:none;box-sizing:border-box;"></div></div>'+
    '<div style="padding:0 22px 20px;display:flex;gap:9px;justify-content:flex-end;"><button onclick="document.getElementById(\'blank-add-modal\').remove()" style="font-size:13px;padding:9px 18px;border-radius:9px;border:1.5px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;font-weight:600;">취소</button><button onclick="blankTypeSubmit()" style="font-size:13px;padding:9px 22px;border-radius:9px;border:none;background:#475569;color:#fff;cursor:pointer;font-weight:700;"><i class="ti ti-plus"></i> 등록</button></div>'+
  '</div>';
  document.body.appendChild(m); setTimeout(function(){const i=document.getElementById('blank-add-label');if(i)i.focus();},50);
}
function blankTypeSubmit(){ const li=document.getElementById('blank-add-label'); const label=(li&&li.value||'').trim()||'Blank'; const units=parseInt((document.getElementById('blank-add-u')||{}).value,10)||1; rackBlankTypes.push({label,units}); saveRacks(); const m=document.getElementById('blank-add-modal'); if(m)m.remove(); renderRackPage(); showToast('Blank 부품 등록됨'); }
function rackDragStart(ev,devId){ ev.dataTransfer.setData('text/plain',devId); ev.dataTransfer.effectAllowed='move'; const d=(deviceList||[]).find(x=>x.id===devId); _rackDragSetup(d?_RU(d):1,'dev',devId); }
function rackModelDragStart(ev,modelId){ ev.dataTransfer.setData('text/plain','model|'+modelId); ev.dataTransfer.effectAllowed='copy'; _rackDragSetup(1,'model',modelId); }
function rackDrop(ev,rackId,u){
  ev.preventDefault(); _rackHlClear();
  const data=ev.dataTransfer.getData('text/plain'); const rk=labRacks.find(r=>r.id===rackId); if(!rk)return;
  if(data.indexOf('model|')===0){   // 모델 팔레트에서 드래그 → 실물 인스턴스 신규 생성 후 배치
    const mid=data.slice(6); const m=(modelList||[]).find(x=>x.id===mid); if(!m)return;
    const size=1; let start=u; if(start+size-1>rk.units) start=rk.units-size+1; if(start<1)start=1;
    for(let i=start;i<start+size;i++){ if(_rackOccAt(rk,i)){ showToast('U'+i+'에 이미 채워져 있습니다'); return; } }
    const base=String(m.name||'장비'); const taken={}; (deviceList||[]).forEach(d=>{ if(d.name)taken[String(d.name)]=1; }); let nm=base; if(taken[nm]){ let n=1; while(taken[base+'_'+n])n++; nm=base+'_'+n; }
    const refDev=(deviceList||[]).find(x=>x.name===m.name); const role=(refDev&&refDev.role)||m.role||'기타';
    const labObj=(labLabs||[]).find(l=>l.id===rk.lab_id); const labNm=(labObj&&labObj.name)||rk.lab_name||'';
    deviceList.push({id:'dev-'+Date.now()+'-'+Math.floor(Math.random()*1000),name:nm,model:m.name,vendor:m.vendor||'',family:m.family||'',role:role,protocol:'telnet',device_type:'cisco_ios_telnet',status:'미확인',lab:labNm,rack_units:1,rack_id:rk.id,rack_name:rk.name,rack_pos:start});
    saveDeviceData(); renderRackPage(); showToast('"'+nm+'" 배치됨 — 우클릭으로 IP/시리얼 설정');
    return;
  }
  if(data.indexOf('blkmove|')===0){   // 이미 설치된 도구/Blank 이동(중복 생성 X, 위치만 갱신)
    const _bid=data.slice(8); const _b=(rackBlanks||[]).find(x=>x.id===_bid); if(!_b)return;
    const _bs=parseInt(_b.units,10)||1; let _st=u; if(_st+_bs-1>rk.units) _st=rk.units-_bs+1; if(_st<1)_st=1;
    for(let i=_st;i<_st+_bs;i++){ const occ=_rackOccAt(rk,i); if(occ&&!(occ.type==='blk'&&occ.b.id===_bid)){ showToast('U'+i+'에 이미 채워져 있습니다'); return; } }
    _b.rack_id=rk.id; _b.rack_name=rk.name; _b.pos=_st; saveRacks(); renderRackPage(); return;
  }
  if(data.indexOf('blk|')===0){
    const parts=data.split('|'); const size=parseInt(parts[1],10)||1; const _col=parts[2]||''; const _ic=parts[3]||''; const label=parts.slice(4).join('|')||'Blank';
    let start=u; if(start+size-1>rk.units) start=rk.units-size+1; if(start<1)start=1;
    for(let i=start;i<start+size;i++){ if(_rackOccAt(rk,i)){ showToast('U'+i+'에 이미 채워져 있습니다'); return; } }
    rackBlanks.push({id:'blk-'+Date.now(),rack_id:rk.id,rack_name:rk.name,pos:start,units:size,label:label,color:_col,icon:_ic}); saveRacks(); renderRackPage(); return;
  }
  const devId=data.indexOf('dev|')===0?data.slice(4):data; const d=(deviceList||[]).find(x=>x.id===devId); if(!d)return;
  const size=_RU(d); let start=u; if(start+size-1>rk.units) start=rk.units-size+1; if(start<1)start=1;
  for(let i=start;i<start+size;i++){ const occ=_rackOccAt(rk,i); if(occ&&!(occ.type==='dev'&&occ.d.id===devId)){ showToast('U'+i+'에 이미 채워져 있습니다'); return; } }
  d.rack_id=rk.id; d.rack_name=rk.name; d.rack_pos=start; saveDeviceData(); renderRackPage();
}
function rackUnplace(devId){ const d=(deviceList||[]).find(x=>x.id===devId); if(!d)return; d.rack_id=''; d.rack_name=''; d.rack_pos=0; saveDeviceData(); renderRackPage(); }
// ── 랙 드래그 점유 미리보기 + 우클릭 메뉴 + 설치 도구 이동 ──
let _rackDragSize=0, _rackDragDevId='', _rackDragKind='';
function _rackDragSetup(size, kind, id){ _rackDragSize=Math.max(1,parseInt(size,10)||1); _rackDragKind=kind||''; _rackDragDevId=id||''; try{ document.addEventListener('dragend', _rackDragEnd, {once:true}); }catch(e){} }
function _rackDragEnd(){ _rackHlClear(); _rackDragSize=0; _rackDragDevId=''; _rackDragKind=''; }
function _rackHlClear(){ try{ document.querySelectorAll('.rack-hl-ok,.rack-hl-no').forEach(function(el){ el.classList.remove('rack-hl-ok'); el.classList.remove('rack-hl-no'); }); }catch(e){} }
function _ensureRackCss(){ if(document.getElementById('rack-dnd-style'))return; const s=document.createElement('style'); s.id='rack-dnd-style'; s.textContent='.rack-hl-ok{box-shadow:inset 0 0 0 2px #e8820c !important;background:rgba(232,130,12,0.20) !important;border-color:#e8820c !important;} .rack-hl-no{box-shadow:inset 0 0 0 2px #e53e5a !important;background:rgba(229,62,90,0.16) !important;border-color:#e53e5a !important;}'; (document.head||document.body).appendChild(s); }
function rackDragOverSlot(ev, rackId, u){
  ev.preventDefault();
  const rk=(labRacks||[]).find(r=>r.id===rackId); if(!rk)return;
  const size=_rackDragSize||1;
  let start=u; if(start+size-1>rk.units) start=rk.units-size+1; if(start<1)start=1;
  let ok=true;
  for(let i=start;i<start+size;i++){ const occ=_rackOccAt(rk,i); if(occ){ const self=(occ.type==='dev'&&occ.d.id===_rackDragDevId)||(occ.type==='blk'&&occ.b.id===_rackDragDevId); if(!self){ ok=false; } } }
  _rackHlClear();
  try{ document.querySelectorAll('[data-rk="'+rackId+'"][data-u]').forEach(function(el){ const eu=parseInt(el.getAttribute('data-u'),10); if(eu>=start && eu<start+size){ el.classList.add(ok?'rack-hl-ok':'rack-hl-no'); } }); }catch(e){}
}
function rackBlankDragStart(ev,blankId){ ev.dataTransfer.setData('text/plain','blkmove|'+blankId); ev.dataTransfer.effectAllowed='move'; const b=(rackBlanks||[]).find(x=>x.id===blankId); _rackDragSetup(b?(parseInt(b.units,10)||1):1,'blkmove',blankId); }
function rackCtxMenu(ev, kind, id){
  ev.preventDefault(); ev.stopPropagation(); _rackCtxClose(); _rackHoverHide();   // 우클릭 시 hover 정보 제거
  const m=document.createElement('div'); m.id='rack-ctx-menu';
  m.style.cssText='position:fixed;z-index:10000;background:#fff;border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.2);padding:5px;min-width:160px;font-size:12.5px;';
  const isDev=(kind==='dev'); const act=isDev?('rackUnplace(\''+id+'\')'):('rackBlankRemove(\''+id+'\')'); const lab=isDev?'랙에서 제외':'삭제';
  const editItem=isDev?('<div onclick="_rackCtxClose();_devQuickEdit(\''+id+'\')" onmouseenter="this.style.background=\'#eef3ff\'" onmouseleave="this.style.background=\'transparent\'" style="display:flex;align-items:center;gap:9px;padding:8px 11px;border-radius:6px;cursor:pointer;color:#2d6fd4;font-weight:600;"><i class="ti ti-edit" style="font-size:15px;"></i>장비 정보 편집 (IP/시리얼/연결)</div>'):'';
  m.innerHTML=editItem+'<div onclick="_rackCtxClose();'+act+'" onmouseenter="this.style.background=\'#fdecee\'" onmouseleave="this.style.background=\'transparent\'" style="display:flex;align-items:center;gap:9px;padding:8px 11px;border-radius:6px;cursor:pointer;color:#e53e5a;font-weight:600;"><i class="ti ti-trash" style="font-size:15px;"></i>'+lab+'</div>';
  document.body.appendChild(m);
  m.style.left=Math.min(ev.clientX,(window.innerWidth-178))+'px'; m.style.top=Math.min(ev.clientY,(window.innerHeight-(isDev?100:58)))+'px';
  setTimeout(function(){ document.addEventListener('click',_rackCtxClose,{once:true}); },0);
}
function _rackCtxClose(){ const m=document.getElementById('rack-ctx-menu'); if(m) m.remove(); }
function _modelRolePick(ev,modelId){ ev.preventDefault(); ev.stopPropagation(); _rackCtxClose();
  const roles=(typeof DEVICE_ROLES!=='undefined'?DEVICE_ROLES:['L2 스위치','L3 스위치','OLT','ONT','CPE','HGW','계측기','PC/서버','Cloud','기타']);
  const cur=(modelList||[]).find(x=>x.id===modelId); const curRole=cur?(cur.role||''):'';
  const m=document.createElement('div'); m.id='rack-ctx-menu'; m.style.cssText='position:fixed;z-index:10001;background:#fff;border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.2);padding:5px;min-width:150px;font-size:12.5px;max-height:320px;overflow:auto;';
  m.innerHTML='<div style="padding:5px 10px 6px;font-size:10.5px;font-weight:800;color:var(--text3);">제품군 지정</div>'+roles.map(function(r){ const c=(typeof DEVICE_ROLE_COLORS!=='undefined'&&DEVICE_ROLE_COLORS[r])||'#2d6fd4'; const on=(r===curRole); return '<div onclick="_modelSetRole(\''+modelId+'\',\''+r+'\')" onmouseenter="this.style.background=\'#f0f3f8\'" onmouseleave="this.style.background=\'transparent\'" style="display:flex;align-items:center;gap:8px;padding:7px 11px;border-radius:6px;cursor:pointer;'+(on?'background:#eef3ff;':'')+'"><span style="width:9px;height:9px;border-radius:2px;background:'+c+';flex-shrink:0;"></span><span style="flex:1;'+(on?'font-weight:800;':'')+'">'+r+'</span>'+(on?'<i class="ti ti-check" style="color:#2d6fd4;font-size:14px;"></i>':'')+'</div>'; }).join('');
  document.body.appendChild(m); m.style.left=Math.min(ev.clientX,(window.innerWidth-168))+'px'; m.style.top=Math.min(ev.clientY,(window.innerHeight-300))+'px';
  setTimeout(function(){ document.addEventListener('click',_rackCtxClose,{once:true}); },0);
}
function _modelSetRole(modelId,role){ _rackCtxClose(); const m=(modelList||[]).find(x=>x.id===modelId); if(!m)return; m.role=role; if(typeof saveDeviceData==='function')saveDeviceData(); renderRackPage(); if(typeof showToast==='function')showToast('"'+(m.name||'')+'" → '+role); }
function _devQuickEdit(devId){
  const d=(deviceList||[]).find(x=>x.id===devId); if(!d)return;
  const old=document.getElementById('dev-quick-edit'); if(old)old.remove();
  const m=document.createElement('div'); m.id='dev-quick-edit'; m.className='modal-overlay'; m.style.display='flex';
  const fld='width:100%;box-sizing:border-box;font-size:13px;padding:8px 10px;border:1px solid var(--border);border-radius:7px;outline:none;';
  const lab=t=>'<label style="font-size:11.5px;font-weight:700;color:var(--text2);display:block;margin:0 0 4px;">'+t+'</label>';
  const inp=(id,v,ph)=>'<input id="'+id+'" value="'+_bdEsc(v||'')+'" placeholder="'+(ph||'')+'" style="'+fld+'">';
  const protoOpts=['telnet','ssh','snmp','rest'].map(p=>'<option value="'+p+'"'+((d.protocol||'telnet')===p?' selected':'')+'>'+p.toUpperCase()+'</option>').join('');
  const numInp=(id,v)=>'<input id="'+id+'" type="number" min="0" value="'+(v==null?'':v)+'" style="'+fld+'">';
  const labNames=(typeof labLabs!=='undefined'&&labLabs)?labLabs.map(l=>(l&&l.name)||l).filter(Boolean):[]; if(d.lab&&labNames.indexOf(d.lab)<0)labNames.push(d.lab);
  const labOpts='<option value=""></option>'+labNames.map(n=>'<option value="'+_bdEsc(n)+'"'+(d.lab===n?' selected':'')+'>'+_bdEsc(n)+'</option>').join('');
  const assetOpts=['','BMT','자산이관','자산구매','무상임대'].map(a=>'<option value="'+a+'"'+((d.asset||'')===a?' selected':'')+'>'+(a||'-')+'</option>').join('');
  const deptOpts=['','PA1','PA2','QA'].map(a=>'<option value="'+a+'"'+((d.dept||'')===a?' selected':'')+'>'+(a||'-')+'</option>').join('');
  m.innerHTML='<div class="modal" style="width:430px;max-width:94vw;border-radius:12px;overflow:hidden;">'
    +'<div style="padding:13px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;background:var(--bg2);"><i class="ti ti-edit" style="color:#2d6fd4;"></i><b style="font-size:14px;flex:1;">'+_bdEsc(d.name||'장비')+' 정보</b><button onclick="document.getElementById(\'dev-quick-edit\').remove()" style="width:26px;height:26px;border:none;border-radius:6px;background:var(--bg3);cursor:pointer;"><i class="ti ti-x"></i></button></div>'
    +'<div style="padding:16px 18px;">'
      +lab('IP')+inp('dqe-ip',d.ip,'192.168.0.1')
      +'<div style="display:flex;gap:10px;margin-top:10px;"><div style="flex:1;">'+lab('연결방식')+'<select id="dqe-proto" style="'+fld+'cursor:pointer;">'+protoOpts+'</select></div><div style="flex:1;">'+lab('계정(ID)')+inp('dqe-user',d.username)+'</div></div>'
      +'<div style="display:flex;gap:10px;margin-top:10px;"><div style="flex:1;">'+lab('비밀번호')+inp('dqe-pw',d.password)+'</div><div style="flex:1;">'+lab('Enable')+inp('dqe-secret',d.secret)+'</div></div>'
      +'<div style="display:flex;gap:10px;margin-top:10px;"><div style="flex:1;">'+lab('시리얼')+inp('dqe-serial',d.serial)+'</div><div style="flex:1;">'+lab('MAC')+inp('dqe-mac',d.mac)+'</div></div>'
      +'<div style="display:flex;gap:10px;margin-top:10px;"><div style="flex:2;">'+lab('Lab(랩)')+'<select id="dqe-lab" style="'+fld+'cursor:pointer;">'+labOpts+'</select></div><div style="width:70px;">'+lab('U')+numInp('dqe-u',d.rack_units||1)+'</div><div style="width:88px;">'+lab('전력(W)')+numInp('dqe-power',d.power||0)+'</div></div>'
      +'<div style="display:flex;gap:10px;margin-top:10px;"><div style="flex:1;">'+lab('자산여부')+'<select id="dqe-asset" style="'+fld+'cursor:pointer;">'+assetOpts+'</select></div><div style="flex:1;">'+lab('관리부서')+'<select id="dqe-dept" style="'+fld+'cursor:pointer;">'+deptOpts+'</select></div></div>'
      +'<div style="margin-top:10px;">'+lab('비고')+inp('dqe-note',d.note,'용도·담당·기타 메모')+'</div>'
      +'<div id="dqe-result" style="font-size:12px;margin:12px 0 4px;min-height:16px;color:var(--text3);"></div>'
      +'<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px;"><button onclick="_devQuickTest(\''+devId+'\')" style="font-size:13px;font-weight:700;padding:8px 16px;border:1px solid #00a872;border-radius:8px;background:#fff;color:#00875a;cursor:pointer;"><i class="ti ti-plug"></i> 연결 확인</button><button onclick="_devQuickSave(\''+devId+'\')" style="font-size:13px;font-weight:700;padding:8px 18px;border:none;border-radius:8px;background:#2d6fd4;color:#fff;cursor:pointer;"><i class="ti ti-device-floppy"></i> 저장</button></div>'
    +'</div></div>';
  document.body.appendChild(m); m.addEventListener('click',e=>{ if(e.target===m)m.remove(); });
}
function _devQuickSave(devId){ const d=(deviceList||[]).find(x=>x.id===devId); if(!d)return; const g=id=>(document.getElementById(id)||{}).value||''; d.ip=g('dqe-ip').trim(); d.protocol=g('dqe-proto'); d.device_type=(d.protocol==='ssh'?'cisco_ios':'cisco_ios_telnet'); d.username=g('dqe-user'); d.password=g('dqe-pw'); d.secret=g('dqe-secret'); d.serial=g('dqe-serial').trim(); d.mac=g('dqe-mac').trim(); d.lab=g('dqe-lab'); d.rack_units=parseInt(g('dqe-u'),10)||1; d.power=parseFloat(g('dqe-power'))||0; d.asset=g('dqe-asset'); d.dept=g('dqe-dept'); d.note=g('dqe-note').trim(); saveDeviceData(); renderRackPage(); if(typeof showToast==='function')showToast('저장됨'); const m=document.getElementById('dev-quick-edit'); if(m)m.remove(); }
async function _devQuickTest(devId){ const d=(deviceList||[]).find(x=>x.id===devId); if(!d)return; const g=id=>(document.getElementById(id)||{}).value||''; const res=document.getElementById('dqe-result'); const proto=g('dqe-proto'); if(res){res.textContent='연결 확인 중…';res.style.color='#b8860b';}
  try{ const r=await fetch('/api/lab-test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host:g('dqe-ip').trim(),port:d.port,protocol:proto,username:g('dqe-user'),password:g('dqe-pw'),secret:g('dqe-secret'),device_type:(proto==='ssh'?'cisco_ios':'cisco_ios_telnet')})});
    const dd=await r.json(); if(res){ res.textContent=dd.ok?('✅ 연결 성공'+(dd.prompt?' · '+dd.prompt:'')):('❌ 실패: '+(dd.error||'')); res.style.color=dd.ok?'#00875a':'#e53e5a'; } d.status=dd.ok?'연결됨':'실패'; saveDeviceData();
  }catch(e){ if(res){res.textContent='요청 오류: '+e.message;res.style.color='#e53e5a';} }
}
function renderRackPage(){
  _rackHoverHide();   // 재렌더(장비 삭제·이동 등) 시 남아있던 hover 정보 제거
  // 모델 팔레트 스크롤 위치 저장 → 재렌더 후 복원(장비 배치·삭제 액션 후 목록이 위로 튀는 문제 방지)
  var _savedPalScroll=0;
  try{ var _p0=document.getElementById('rack-model-pal'); if(_p0) _savedPalScroll=_p0.scrollTop||0; }catch(_e){}
  const board=document.getElementById('rack-board'); if(!board)return; _ensureRackCss(); const e=_bdEsc; const ed=_rackEdit;
  // 렌더 후 스크롤 복원 (requestAnimationFrame 으로 innerHTML 반영 뒤 실행)
  var _restorePalScroll=function(){
    try{ var _p=document.getElementById('rack-model-pal'); if(_p && _savedPalScroll>0) _p.scrollTop=_savedPalScroll; }catch(_e){}
  };
  // 렌더 함수 종료 직전(마지막 innerHTML 세팅 이후)에 실행되도록 예약
  if(typeof requestAnimationFrame==='function') requestAnimationFrame(_restorePalScroll);
  else setTimeout(_restorePalScroll, 0);
  // 구 데이터 1회 마이그레이션: 이름 연결 → rack_id 연결(동명 랙 lab간 중복 방지)
  (function(){ var chD=false,chB=false;
    (deviceList||[]).forEach(function(d){ if(_RP(d)&&!d.rack_id&&d.rack_name){ var r=(labRacks||[]).find(function(x){return x.name===d.rack_name;}); if(r){ d.rack_id=r.id; chD=true; } } });
    (rackBlanks||[]).forEach(function(b){ if(!b.rack_id&&b.rack_name){ var r=(labRacks||[]).find(function(x){return x.name===b.rack_name;}); if(r){ b.rack_id=r.id; chB=true; } } });
    if(chD&&typeof saveDeviceData==='function')saveDeviceData();
    if(chB&&typeof saveRacks==='function')saveRacks();
  })();
  try{ localStorage.setItem('utop_rack_lab',_rackLab||''); localStorage.setItem('utop_rack_edit',_rackEdit?'1':'0'); }catch(_e){}
  const _eb=document.getElementById('rack-edit-btns'); if(_eb)_eb.style.display=ed?'flex':'none';
  const _ds=document.getElementById('rack-desc'); if(_ds)_ds.style.display=ed?'inline':'none';
  if(ed&&_rackSlide){ rackSlideStop(); _rackSlide=false; }
  const _sb=document.getElementById('rack-slide-btn'); if(_sb){ _sb.style.display=(!ed&&labLabs.length>1)?'inline-flex':'none'; _sb.innerHTML=_rackSlide?'<i class="ti ti-player-pause"></i> 정지':'<i class="ti ti-player-play"></i> 슬라이드'; _sb.style.background=_rackSlide?'#2d6fd4':'#fff'; _sb.style.color=_rackSlide?'#fff':'#2d6fd4'; }
  const _sw=document.getElementById('rack-slide-secwrap'); if(_sw){ _sw.style.display=(!ed&&labLabs.length>1)?'inline-flex':'none'; }
  const _mb=document.getElementById('rack-mode-badge'); if(_mb){ _mb.textContent=ed?'편집 모드':''; _mb.style.display=ed?'inline-block':'none'; _mb.style.background='rgba(232,130,12,0.12)'; _mb.style.color='#b5730f'; }
  const tabsEl=document.getElementById('rack-labtabs');
  if(tabsEl){ tabsEl.innerHTML=labLabs.map(function(l){ const on=l.id===_rackLab; const cnt=labRacks.filter(r=>r.lab_id===l.id).length; return '<div onclick="labPick(\''+l.id+'\')" onmouseenter="_labHover(event,\''+l.id+'\')" onmousemove="_rackHoverMove(event)" onmouseleave="_rackHoverHide()" style="display:flex;align-items:center;gap:7px;padding:7px 15px;border-radius:8px;cursor:pointer;white-space:nowrap;flex-shrink:0;background:'+(on?'#7c3aed':'#fff')+';color:'+(on?'#fff':'var(--text2)')+';border:1px solid '+(on?'#7c3aed':'var(--border)')+';font-weight:'+(on?'700':'600')+';font-size:13px;"><i class="ti ti-building" style="font-size:16px;"></i>'+e(l.name)+'<span style="font-size:9.5px;opacity:0.8;">'+cnt+'랙</span>'+(on&&_rackEdit?('<i class="ti ti-settings" onclick="event.stopPropagation();labEditNote(\''+l.id+'\')" title="Lab 설정 (이름·세부내역)" style="font-size:13px;opacity:0.85;margin-left:3px;"></i><i class="ti ti-x" onclick="event.stopPropagation();labDel(\''+l.id+'\')" style="font-size:13px;opacity:0.85;"></i>'):'')+'</div>'; }).join(''); }
  if(!labLabs.length){ board.innerHTML='<div style="flex:1;display:flex;flex-direction:column;gap:10px;align-items:center;justify-content:center;color:var(--text3);font-size:14px;"><i class="ti ti-building" style="font-size:42px;opacity:0.3;"></i>Lab이 없습니다. 우측 상단 <b>[+ Lab 추가]</b>로 시작하세요.</div>'; return; }
  const racks=labRacks.filter(r=>r.lab_id===_rackLab);
  const allDevs=(deviceList||[]);
  // 계측기(STC/IXIA) 판별 — 랙에서 보라색+파형 아이콘으로 구분
  const _isMeter=_isMeterDev;
  // 배치(랙에 실장)된 장비는 목록에서 제외 — 미배치만 표시
  const _isPlaced=function(d){ return !!(_RP(d) && (d.rack_id?labRacks.some(r=>r.id===d.rack_id):(d.rack_name&&labRacks.some(r=>r.name===d.rack_name)))); };
  const unplacedDevs=allDevs.filter(function(d){ return !_isPlaced(d); });
  const blanksPal=(rackBlankTypes||[]).map(function(bt,i){ var _bc=bt.color||''; var _ic=(/홀|hole|vent/i.test(bt.label)?'ti-menu-2':'ti-rectangle'); return '<div draggable="true" ondragstart="rackDragBlank(event,\''+e(bt.label)+'\','+(bt.units||1)+',\''+_bc+'\',\''+_ic+'\')" style="padding:6px 9px;border:1px solid '+(_bc?(_bc+'88'):'#b9c0cc')+';border-radius:7px;margin-bottom:5px;background:'+(_bc?(_bc+'22'):_blankBg(bt.label))+';cursor:grab;display:flex;align-items:center;gap:7px;"><i class="ti '+_ic+'" draggable="false" onmousedown="event.stopPropagation()" onclick="event.stopPropagation();blankTypeEditColor('+i+')" title="색상 변경 (클릭)" style="color:'+(_bc||'#6b7280')+';font-size:14px;cursor:pointer;flex-shrink:0;"></i><span style="flex:1;font-size:11.5px;font-weight:700;color:'+(_bc?'#33405a':'#4b5563')+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+e(bt.label)+'</span><span style="font-size:10px;color:'+(_bc?'#64748b':'#6b7280')+';font-weight:700;">'+(bt.units||1)+'U</span><i class="ti ti-x" draggable="false" onmousedown="event.stopPropagation()" onclick="event.stopPropagation();blankTypeDel('+i+')" title="삭제" style="font-size:11px;color:#8a93a3;cursor:pointer;flex-shrink:0;"></i></div>'; }).join('');
  const toolsPal=(rackToolTypes||[]).map(function(t,i){ return '<div draggable="true" ondragstart="rackDragBlank(event,\''+e(t.label)+'\','+(t.units||1)+',\''+(t.color||'')+'\',\''+(t.icon||'')+'\')" title="드래그하여 랙에 배치 · 아이콘 클릭=색상" style="padding:6px 9px;border:1px solid '+(t.color?(t.color+'88'):'#d4dae4')+';border-radius:7px;margin-bottom:5px;background:'+(t.color?(t.color+'18'):'#fff')+';cursor:grab;display:flex;align-items:center;gap:7px;"><i class="ti '+(t.icon||'ti-tools')+'" draggable="false" onmousedown="event.stopPropagation()" onclick="event.stopPropagation();toolTypeEditColor('+i+')" title="색상 변경 (클릭)" style="color:'+(t.color||'#0ea5e9')+';font-size:15px;flex-shrink:0;cursor:pointer;"></i><span style="flex:1;font-size:11.5px;font-weight:600;color:#33405a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+e(t.label)+'</span><span draggable="false" onmousedown="event.stopPropagation()" onclick="event.stopPropagation();toolTypeEditU('+i+')" title="U 변경 (클릭)" style="font-size:10px;color:#0284b5;font-weight:800;cursor:pointer;flex-shrink:0;background:#eaf6fb;border-radius:4px;padding:1px 5px;">'+(t.units||1)+'U</span><i class="ti ti-x" draggable="false" onmousedown="event.stopPropagation()" onclick="event.stopPropagation();toolTypeDel('+i+')" title="삭제" style="font-size:11px;color:#bbb;cursor:pointer;flex-shrink:0;"></i></div>'; }).join('');
  // 모델 팔레트(제품군별) — Device Registration에 등록된 "미배치" 실물 장비를 모델그룹별로 묶어 표시. 드래그하면 그 실물을 랙에 배치(신규 생성 없음)
  const _modelSearchBar='<div style="padding:6px 8px;flex-shrink:0;"><input id="rack-model-q" type="text" value="'+e(window._rackModelQ||'')+'" oninput="rackModelSearch(this.value)" placeholder="모델명·IP·구역 검색..." style="width:100%;font-size:11.5px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:#fff;outline:none;box-sizing:border-box;"></div>';
  const _sec=window._rackLeftSec||'model';
  const _accHdr=function(key,bg,color,icon,label,rightBtn){ const open=(_sec===key); return '<div onclick="rackLeftSec(\''+key+'\')" style="padding:8px 12px;border-bottom:1px solid var(--border);'+(key!=='model'?'border-top:1px solid var(--border);':'')+'background:'+bg+';font-size:12px;font-weight:800;color:'+color+';display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none;flex-shrink:0;"><i class="ti '+icon+'" style="font-size:14px;"></i> '+label+'<span style="flex:1;"></span>'+(rightBtn||'')+'<i class="ti ti-chevron-'+(open?'down':'right')+'" style="font-size:15px;opacity:.6;margin-left:5px;"></i></div>'; };
  const _toolAddBtn='<button onclick="event.stopPropagation();toolTypeAdd()" title="도구 추가" style="width:20px;height:20px;border-radius:5px;border:1px solid #00a87255;background:#fff;color:#00875a;cursor:pointer;padding:0;"><i class="ti ti-plus" style="font-size:11px;"></i></button>';
  const _blankAddBtn='<button onclick="event.stopPropagation();blankTypeAdd()" title="Blank 등록" style="width:20px;height:20px;border-radius:5px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;padding:0;"><i class="ti ti-plus" style="font-size:11px;"></i></button>';
  const left='<div style="width:290px;flex-shrink:0;border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;background:var(--bg2);">'+
    _accHdr('model','#f3eeff','#7c3aed','ti-versions','모델 (제품군별) '+(allDevs.length-unplacedDevs.length)+'/'+allDevs.length,'<span style="font-size:9.5px;color:var(--text3);font-weight:600;">드래그 배치</span>')+
    (_sec==='model'?(_modelSearchBar+'<div id="rack-model-pal" style="flex:1;overflow:auto;padding:0 8px 8px;min-height:70px;">'+_rackModelPalHtml()+'</div>'):'')+
    _accHdr('tool','#e8f5ef','#00875a','ti-tools','기타 도구·장비',_toolAddBtn)+
    (_sec==='tool'?'<div style="flex:1;overflow:auto;padding:8px;">'+(toolsPal||'<div style="font-size:11px;color:var(--text3);text-align:center;padding:10px;">[+]로 도구 추가</div>')+'</div>':'')+
    _accHdr('blank','#eef2f7','var(--text2)','ti-rectangle','Blank 부품',_blankAddBtn)+
    (_sec==='blank'?'<div style="flex:1;overflow:auto;padding:8px;">'+(blanksPal||'<div style="font-size:11px;color:var(--text3);text-align:center;padding:10px;">[+]로 Blank 등록</div>')+'</div>':'')+
  '</div>';
  let racksHtml;
  if(!racks.length){ racksHtml='<div style="flex:1;display:flex;flex-direction:column;gap:12px;align-items:center;justify-content:center;color:var(--text3);font-size:13px;">이 Lab에 랙이 없습니다.'+(ed?'<div style="display:flex;gap:8px;"><button onclick="rackQuickAdd(45)" style="font-size:13px;padding:9px 18px;border-radius:9px;border:none;background:#e8820c;color:#fff;cursor:pointer;font-weight:700;"><i class="ti ti-plus"></i> 45U 랙</button><button onclick="rackQuickAdd(36)" style="font-size:13px;padding:9px 18px;border-radius:9px;border:1px solid #e8820c;background:#fff;color:#e8820c;cursor:pointer;font-weight:700;"><i class="ti ti-plus"></i> 36U 랙</button></div>':' 보기 전용 모드입니다.')+'</div>'; }
  else {
    const maxU=racks.reduce(function(mx,r){return Math.max(mx,r.units||45);},1);
    let UH=20;
    // 보기 모드: 랙(범례+카드 헤더 약 88px+패딩 포함)이 화면 안에 들어오도록 U 높이 자동 계산 — 세로 스크롤 방지
    // 모든 칸은 정확히 UH px(border-box·margin 0) → 장비/빈칸/랙 간 높이 오차 없음
    if(!ed){ UH=Math.floor((Math.max(220,(board.clientHeight||760)-134))/maxU); if(UH<9)UH=9; if(UH>26)UH=26; }
    var _ledLeg=function(c,t){ return '<span style="display:inline-flex;align-items:center;gap:4px;white-space:nowrap;"><span style="width:10px;height:10px;border-radius:50%;background:'+c+';box-shadow:0 0 0 1px rgba(0,0,0,0.18);flex-shrink:0;"></span>'+t+'</span>'; };
    var _rackLegend='<div style="flex-shrink:0;display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:7px 14px;background:var(--bg2,#f4f6f9);border-bottom:1px solid var(--border);font-size:10.5px;color:var(--text2);font-weight:600;">'
      +'<span style="font-weight:800;color:var(--text2);"><i class="ti ti-info-circle" style="font-size:12px;vertical-align:-1px;"></i> LED</span>'
      +_ledLeg('#16c60c','연결됨 · Telnet')
      +_ledLeg('#2d6fd4','연결됨 · SSH')
      +_ledLeg('#ff4d4f','미연결')
      +_ledLeg('#f5b301','확인중')
      +_ledLeg('#9aa3b2','미확인')
      +'</div>';
    racksHtml='<div style="flex:1;display:flex;flex-direction:column;min-height:0;min-width:0;overflow:hidden;">'+_rackLegend+'<div id="rack-hscroll" style="flex:1;overflow:auto;padding:8px 14px;display:flex;gap:10px;align-items:flex-start;scroll-behavior:smooth;">'+racks.map(function(rk){
      const U=rk.units||42; const _sp=(maxU-U)*UH; let rows='';   // 칸당 정확히 UH px → 낮은 랙도 1번 U가 같은 높이(바닥 정렬)
      for(let u=U;u>=1;u--){
        const occ=_rackOccAt(rk,u);
        if(occ&&occ.type==='dev'){
          const dev=occ.d;
          if(_RP(dev)+_RU(dev)-1===u){
            const h=_RU(dev)*UH;
            const _conn=(dev.status==='연결됨'||dev.status==='connected');
            const _chk=(dev.status==='확인중');
            const _unk=(!dev.status||dev.status==='미확인');
            const _proto=String(dev.protocol||'').toUpperCase();
            // LED 색: 확인중=노랑 · 미확인=회색 · 미연결=빨강 · 연결됨은 접속방식별(Telnet=주황/SSH=파랑/기타=녹색)
            var _sC,_sTxt;
            if(_chk){ _sC='#f5b301'; _sTxt='확인중'; }
            else if(_unk){ _sC='#9aa3b2'; _sTxt='미확인'; }
            else if(!_conn){ _sC='#ff4d4f'; _sTxt='미연결'; }
            else if(_proto==='SSH'){ _sC='#2d6fd4'; _sTxt='연결됨 · SSH'; }
            else { _sC='#16c60c'; _sTxt='연결됨'+(_proto&&_proto!=='TELNET'?(' · '+_proto):' · Telnet'); }
            const _dn=(String(dev.name||'').trim()||String(dev.model||'').trim()||String(dev.serial||'').trim()||String(dev.ip||'').trim()||('장비#'+String(dev.id||'').slice(-4)));
            const _mt=_isMeter(dev);
            const _tC=_chk?'#c08a00':(_conn?'#15a05a':(_unk?'#6b7280':'#3b6fc4'));  // 글씨/상태색: 정상=녹색, 미연결=파랑, 미확인=회색
            const _rc=dev.rack_color||'';   // 사용자 지정 랙 색상 — 있으면 상태 배경/테두리 대신 사용
            const _bBg=_rc?(_rc+'22'):(_mt?'#f1eafc':(_conn?'#bdd4f7':'#e4eefc'));   // 연결됨=더 진한 파랑 / 계측기=연보라 / 사용자색 옅게 — 연결상태는 우측 점으로
            const _bBrd=_rc?(_rc+'66'):(_mt?'#dccef5':(_conn?'#76a4e6':'#c6d9f6'));
            const _bIc=_mt?'ti-wave-square':'ti-server';
            rows+='<div onclick="rackConnect(\''+dev.id+'\')" '+(ed?'draggable="true" ondragstart="rackDragStart(event,\''+dev.id+'\')" oncontextmenu="rackCtxMenu(event,\'dev\',\''+dev.id+'\')" ':'')+'onmouseenter="_rackHover(event,\''+dev.id+'\',this)" onmousemove="_rackHoverMove(event)" onmouseleave="_rackHoverHide()" style="height:'+h+'px;box-sizing:border-box;border:1px solid '+_bBrd+';border-left:3px solid '+(_rc||((_conn&&!_mt)?'#1248ab':'#2d6fd4'))+';border-radius:6px;background:'+_bBg+';color:#33405a;display:flex;align-items:center;gap:5px;padding:0 6px;cursor:'+(ed?'move':(_mt?'default':'pointer'))+';margin:0;overflow:hidden;box-shadow:0 1px 2px rgba(30,40,70,0.08);">'+
              '<i class="ti '+_bIc+'" style="font-size:13px;flex-shrink:0;opacity:.9;"></i>'+
              '<span style="font-size:11px;line-height:17px;font-weight:800;color:'+((_conn&&!_mt&&!_rc)?'#0c3576':'#33405a')+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0;">'+e(_dn)+'</span>'+
              '<span title="'+_sTxt+'" style="width:11px;height:11px;border-radius:50%;background:'+_sC+';flex-shrink:0;margin-left:5px;box-shadow:0 0 0 1px rgba(0,0,0,0.18);"></span>'+
              (ed?'<i class="ti ti-x" onclick="event.stopPropagation();rackUnplace(\''+dev.id+'\')" title="랙에서 제외" style="font-size:12px;color:#b0b7c2;cursor:pointer;flex-shrink:0;margin-left:2px;"></i>':'')+
            '</div>';
          }
        } else if(occ&&occ.type==='blk'){
          const b=occ.b;
          if(b.pos+(b.units||1)-1===u){
            const bh=(b.units||1)*UH;
            let _bc=b.color||'', _bi=b.icon||'';
            if(!_bc){ const _tt=(rackToolTypes||[]).find(function(x){return x.label===b.label;}); if(_tt){ _bc=_tt.color||''; _bi=_tt.icon||''; } }
            const _rm=(ed?'draggable="true" ondragstart="rackBlankDragStart(event,\''+b.id+'\')" oncontextmenu="rackCtxMenu(event,\'blk\',\''+b.id+'\')" title="드래그: 이동 · 우클릭: 메뉴" ':'');
            if(_bc){
              rows+='<div '+_rm+'style="height:'+bh+'px;box-sizing:border-box;border:1px solid '+_bc+'66;border-left:3px solid '+_bc+';border-radius:8px;background:'+_bc+'14;color:'+_bc+';display:flex;align-items:center;gap:5px;padding:0 7px;margin:0;font-size:11px;font-weight:700;cursor:pointer;overflow:hidden;"><i class="ti '+(_bi||'ti-tools')+'" style="font-size:13px;flex-shrink:0;"></i><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'+(/패치/.test(b.label||'')?'color:#111;font-weight:800;':'')+'">'+e(b.label||'')+'</span><span style="flex:1;"></span><span style="font-size:10px;opacity:.7;flex-shrink:0;">'+(b.units||1)+'U</span></div>';
            } else {
              var _isBlk=!(b.label)|| /^blank$/i.test(String(b.label).trim())||/^민자|가로홀/.test(String(b.label));
              rows+='<div '+_rm+'style="height:'+bh+'px;box-sizing:border-box;border:1px '+(_isBlk?'dashed #e0e3ea':'solid #cfd4dd')+';border-radius:8px;background:'+(_isBlk?'#fafbfc':'#f2f4f8')+';color:'+(_isBlk?'#b6bcc7':'#8a90a0')+';display:flex;align-items:center;justify-content:center;gap:6px;margin:0;font-size:9.5px;font-weight:'+(_isBlk?'500':'700')+';letter-spacing:0.4px;cursor:pointer;">'+e(b.label||'BLANK')+' · '+(b.units||1)+'U</div>';
            }
          }
        } else {
          rows+='<div '+(ed?'data-rk="'+rk.id+'" data-u="'+u+'" ondragover="rackDragOverSlot(event,\''+rk.id+'\','+u+')" ondrop="rackDrop(event,\''+rk.id+'\','+u+')" ':'')+'style="height:'+UH+'px;box-sizing:border-box;border-bottom:1px '+((u%5===0||u===1)?'solid #dde3ec':'dashed #edf0f6')+';margin:0;'+(ed?'background:#fbfcfe;':'')+'"></div>';
        }
      }
      const inRack=(deviceList||[]).filter(d=>_devInRack(d,rk));
      const used=inRack.reduce((s,d)=>s+_RU(d),0);
      const pw=inRack.reduce((s,d)=>s+(parseFloat(d.power)||0),0);
      const wt=inRack.reduce((s,d)=>s+(parseFloat(d.weight)||0),0);
      // ── 랙 헤더 카드: 이름 + U 배지 / 용도(라벨) ──
      const _hdrBtns=ed
        ?('<button onclick="rackRename(\''+rk.id+'\')" title="이름 변경" style="width:20px;height:20px;border:none;border-radius:5px;background:transparent;color:#b6bdc8;cursor:pointer;padding:0;flex-shrink:0;" onmouseenter="this.style.color=\'#2d6fd4\'" onmouseleave="this.style.color=\'#b6bdc8\'"><i class="ti ti-edit" style="font-size:12px;"></i></button>'
          +'<button onclick="rackDel(\''+rk.id+'\')" title="랙 삭제" style="width:20px;height:20px;border:none;border-radius:5px;background:transparent;color:#b6bdc8;cursor:pointer;padding:0;flex-shrink:0;" onmouseenter="this.style.color=\'var(--red)\'" onmouseleave="this.style.color=\'#b6bdc8\'"><i class="ti ti-trash" style="font-size:12px;"></i></button>')
        :'';
      const _hdrCard=
        '<div style="padding:8px 12px 7px;border-bottom:1px solid #f1f3f7;">'+
          '<div style="display:flex;align-items:center;gap:7px;min-width:0;">'+
            '<i class="ti ti-server-2" style="color:#5b5bd6;font-size:15px;flex-shrink:0;"></i>'+
            '<span style="font-size:13.5px;font-weight:800;color:#1f2635;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;" title="'+e(rk.name)+'">'+e(rk.name)+'</span>'+
            '<span style="flex:1;"></span>'+_hdrBtns+
            '<span '+(ed?'onclick="rackEditU(\''+rk.id+'\')" title="U 변경" ':'')+'style="font-size:10.5px;font-weight:800;color:#5a6270;background:#f1f2f6;border-radius:10px;padding:2px 9px;flex-shrink:0;'+(ed?'cursor:pointer;':'')+'">'+U+'U</span>'+
          '</div>'+
          '<div '+(ed?'onclick="rackRename(\''+rk.id+'\')" title="용도/이름 변경" ':(rk.label?'title="'+e(rk.label)+'" ':''))+'style="font-size:11.5px;font-weight:600;color:#8a93a4;margin:2px 0 6px 22px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'+(ed?'cursor:pointer;':'')+'">'+(rk.label?e(rk.label):'<span style="color:#c3c9d4;">'+(ed?'＋ 용도/이름 추가':'&nbsp;')+'</span>')+'</div>'+
        '</div>';
      // 왼쪽 U 레일 — 실제 랙 레일 눈금처럼 번호를 슬롯 밖으로 분리 (전체 표기, 5U·1U는 강조)
      var rail=''; for(var ru=U;ru>=1;ru--){
        var _rMark=(ru%5===0||ru===1);
        rail+='<div style="height:'+UH+'px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;font-size:8.5px;font-weight:'+(_rMark?'800':'600')+';color:'+(_rMark?'#98a3b5':'#c3cbd8')+';">'+ru+'</div>';
      }
      return '<div data-rk-wrap="1" style="width:234px;flex-shrink:0;">'+
        (_sp>0?'<div style="height:'+_sp+'px;"></div>':'')+
        '<div style="background:#fff;border:1px solid #e9ecf2;border-radius:14px;box-shadow:0 1px 5px rgba(30,40,70,0.08);overflow:hidden;">'+
          _hdrCard+
          '<div style="padding:6px 8px 8px 4px;display:flex;">'+
            '<div style="width:18px;flex-shrink:0;border-right:1px solid #f0f2f7;margin-right:4px;">'+rail+'</div>'+
            '<div style="flex:1;min-width:0;">'+rows+'</div>'+
          '</div>'+
        '</div>'+
      '</div>';
    }).join('')+(ed?'<div style="width:104px;flex-shrink:0;min-height:110px;border:2px dashed var(--border);border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;padding:8px;"><span style="font-size:10px;color:var(--text3);font-weight:700;">랙 추가</span><button onclick="rackQuickAdd(45)" style="font-size:11.5px;padding:5px 14px;border-radius:6px;border:1px solid #e8820c;background:#fff;color:#e8820c;cursor:pointer;font-weight:800;">45U</button><button onclick="rackQuickAdd(36)" style="font-size:11.5px;padding:5px 14px;border-radius:6px;border:1px solid #e8820c;background:#fff;color:#e8820c;cursor:pointer;font-weight:800;">36U</button></div>':'')+'</div></div>';
  }
  board.innerHTML=(ed?left:'')+racksHtml;
}
function rackLeftSec(s){ window._rackLeftSec=s; renderRackPage(); }   // 좌측 패널 아코디언(해당 목록만 표시)
// 모델(제품군별) 팔레트 — Device Registration의 "미배치" 실물 장비를 모델그룹별로 묶어 렌더 (부분 갱신용으로 분리: 검색 시 input 포커스 유지)
function _rackModelPalHtml(){
  const e=_bdEsc; const _isMeter=_isMeterDev;
  const allDevs=(deviceList||[]);
  const _isPlaced=function(d){ return !!(_RP(d) && (d.rack_id?labRacks.some(r=>r.id===d.rack_id):(d.rack_name&&labRacks.some(r=>r.name===d.rack_name)))); };
  var _m2g={}; (typeof modelList!=='undefined'&&modelList?modelList:[]).forEach(function(m){ if(m&&m.name) _m2g[m.name]=String(m.group||'').trim(); });
  var _mdlNameOf=function(d){ return String(d.model||'').trim()||String(d.name||'').trim().replace(/_\d+$/,''); };
  var _mdlGrpOf=function(d){ var g=_m2g[_mdlNameOf(d)]; return (g==null||g==='')?'(미지정)':g; };
  var _rackModelQ=String(window._rackModelQ||'').trim().toLowerCase();
  var _qMatch=function(d){ if(!_rackModelQ) return true; var hay=[d.name,d.model,d.vendor,d.ip,d.lab].map(function(x){return String(x==null?'':x);}).join(' ').toLowerCase(); return hay.indexOf(_rackModelQ)>=0; };
  // 전체 장비(배치+미배치) 대상 — 모델그룹 > 모델명 > 실물 3단으로 묶음
  var _byGrp={}; allDevs.filter(_qMatch).forEach(function(d){ var g=_mdlGrpOf(d); (_byGrp[g]=_byGrp[g]||[]).push(d); });
  var _grpOrder=Object.keys(_byGrp).sort(function(a,b){ if(a==='(미지정)')return 1; if(b==='(미지정)')return -1; return a.localeCompare(b,undefined,{numeric:true}); });
  var _grpCol=window._rackModelGrpCol||{};
  if(!_grpOrder.length) return '<div style="padding:16px;text-align:center;color:var(--text3);font-size:12px;">'+(_rackModelQ?'검색 결과가 없습니다':'등록된 장비가 없습니다.<br>Device Management → Device Registration에서 추가하세요.')+'</div>';
  return _grpOrder.map(function(g){
    var col=_grpCol[g];
    var _placedCnt=_byGrp[g].filter(_isPlaced).length;
    var _hdr='<div onclick="rackModelGrpToggle(\''+e(g).replace(/'/g,"\\'")+'\')" style="display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none;margin:11px 0 5px;padding:5px 7px;background:rgba(124,58,237,0.08);border-radius:6px;border-left:3px solid #7c3aed;">'
      +'<i class="ti ti-chevron-'+(col?'right':'down')+'" style="font-size:13px;color:#7c3aed;flex-shrink:0;"></i>'
      +'<span style="font-size:11.5px;font-weight:800;color:#5b21b6;letter-spacing:.2px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+e(g)+'</span>'
      +'<span style="font-size:9.5px;font-weight:700;color:#7c3aed;background:#fff;border-radius:8px;padding:1px 7px;flex-shrink:0;">'+_placedCnt+'/'+_byGrp[g].length+'</span>'
      +'</div>';
    if(col) return _hdr;
    // 모델명 단위 소그룹
    var _byMdl={}; _byGrp[g].forEach(function(d){ var mn=_mdlNameOf(d)||'(모델명 없음)'; (_byMdl[mn]=_byMdl[mn]||[]).push(d); });
    var _mdlOrder=Object.keys(_byMdl).sort(function(a,b){ return a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'}); });
    var _body=_mdlOrder.map(function(mn){
      var devs=_byMdl[mn].slice().sort(function(a,b){ return String(a.name||'').localeCompare(String(b.name||''),undefined,{numeric:true,sensitivity:'base'}); });
      var _mdlHdr=_mdlOrder.length>1?('<div style="font-size:10px;font-weight:700;color:#8a8fa3;margin:6px 2px 3px 20px;">'+e(mn)+' <span style="color:#b8bcc9;">('+devs.length+')</span></div>'):'';
      var _cards=devs.map(function(d){
        var _mt=_isMeter(d);
        var _dn=(String(d.name||'').trim()||String(d.model||'').trim()||String(d.serial||'').trim()||String(d.ip||'').trim()||('장비#'+String(d.id||'').slice(-4)));
        var _pl=_isPlaced(d);
        var _drag=_pl?'':' draggable="true" ondragstart="rackDragStart(event,\''+d.id+'\')"';
        var _stBadge=_pl?'<span style="font-size:8px;font-weight:800;color:#00875a;background:#e6f7ee;border-radius:7px;padding:1px 6px;flex-shrink:0;">설치됨</span>':'<span style="font-size:8px;font-weight:700;color:#8a93a4;background:#eef1f5;border-radius:7px;padding:1px 6px;flex-shrink:0;">미설치</span>';
        return '<div'+_drag+' onmouseenter="_rackModelHover(event,\''+d.id+'\',this)" onmousemove="_rackHoverMove(event)" onmouseleave="_rackHoverHide()" onclick="'+(_pl?('rackJumpTo(\''+d.id+'\')'):'')+'" style="padding:6px 9px 6px 20px;border:1px solid '+(_mt?'#7c3aed44':(_pl?'#e3e6ec':'#7c3aed33'))+';border-radius:7px;margin-bottom:5px;background:'+(_pl?'#fafbfc':(_mt?'#faf6ff':'#fff'))+';cursor:'+(_pl?'pointer':'grab')+';display:flex;align-items:center;gap:7px;opacity:'+(_pl?'0.82':'1')+';"><i class="ti '+(_mt?'ti-wave-square':'ti-server')+'" style="color:'+(_pl?'#9aa1ad':'#7c3aed')+';font-size:14px;flex-shrink:0;"></i><div style="flex:1;min-width:0;font-size:12px;font-weight:700;color:'+(_pl?'#5a6270':'#1c2030')+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+e(_dn)+'</div>'+_stBadge+(_pl?'':'<i class="ti ti-palette" draggable="false" onmousedown="event.stopPropagation()" onclick="event.stopPropagation();devRackColorPick(\''+d.id+'\')" title="랙 배치 색상 지정" style="font-size:12px;color:'+(d.rack_color||'#c4cad3')+';cursor:pointer;flex-shrink:0;"></i>')+'</div>';
      }).join('');
      return _mdlHdr+_cards;
    }).join('');
    return _hdr+_body;
  }).join('');
}
function rackJumpTo(devId){ var d=(deviceList||[]).find(function(x){return x.id===devId;}); if(!d||!d.rack_id) return; var el=document.querySelector('[data-rk-wrap] [onclick*="rackConnect(\''+devId+'\')"]'); if(el&&el.scrollIntoView) el.scrollIntoView({block:'center',inline:'center',behavior:'smooth'}); if(el){ el.style.boxShadow='0 0 0 3px #7c3aed'; setTimeout(function(){ el.style.boxShadow=''; },1200); } }
function rackModelGrpToggle(g){ window._rackModelGrpCol=window._rackModelGrpCol||{}; window._rackModelGrpCol[g]=!window._rackModelGrpCol[g]; var w=document.getElementById('rack-model-pal'); if(w) w.innerHTML=_rackModelPalHtml(); }   // 모델(제품군별) 그룹 접기/펴기 (부분 갱신)
function rackModelSearch(v){ window._rackModelQ=v||''; var w=document.getElementById('rack-model-pal'); if(w) w.innerHTML=_rackModelPalHtml(); }   // 모델(제품군별) 검색 (부분 갱신 — input 포커스 유지)
function rackScroll(dir){ var el=document.getElementById('rack-hscroll'); if(!el)return; el.scrollBy({left:dir*Math.max(280,Math.round(el.clientWidth*0.7)),behavior:'smooth'}); }   // 랙 좌우 이동
// 마우스오버 현황 팝업(세부정보)
// ── 랙 호버: 포트 형상(show interface status) 조회·캐시 ──
// 장비마다 인터페이스 표기가 달라(Giga1/1, gi0/1, te1/0/1, 1/1 …) 출력의 이름을 그대로 파싱해 생성
var _rackPortCache={};   // devId → {ts, ports:[{n,st}], err}
function _rackPortsParse(out){
  var ports=[]; var lines=String(out||'').split(/\r?\n/);
  for(var i=0;i<lines.length;i++){
    var ln=lines[i]; var t=ln.trim(); if(!t||/^[-=+*]+$/.test(t)) continue;
    var m=ln.match(/^\s*([A-Za-z]{1,14}\d[\d\/:.]*|\d+\/[\d\/:.]+)\s+(.+)$/); if(!m) continue;
    var name=m[1], rest=' '+(m[2]||'')+' ';
    if(/^(Port|Interface|Total)/i.test(name)) continue;   // 헤더 행 제외
    var st='';
    if(/[\s](connected|up)[\s,]/i.test(rest) && !/notconnect|err-?disab|admin(istratively)?[- ]?down/i.test(rest)) st='up';
    else if(/notconnect|disabled|err-?disab|[\s]down[\s,]|not\s?present|shutdown/i.test(rest)) st='down';
    else continue;   // 상태 열이 없는 행은 스킵
    ports.push({n:name,st:st});
    if(ports.length>=128) break;
  }
  return ports;
}
function _rackPortsFetch(d){
  var c=_rackPortCache[d.id], now=Date.now();
  if(c && (now-c.ts) < (c.err?20000:60000)){ _rackPortsPaint(d,c); return; }   // 캐시: 성공 60초 / 실패 20초
  var body={host:d.ip,ip:d.ip,port:d.port||0,protocol:d.protocol,username:d.username||'',password:d.password||'',secret:d.secret||'',device_type:d.device_type||((d.protocol||'')==='ssh'?'cisco_ios':'cisco_ios_telnet'),commands:['show interface status'],tail_wait:0.3};
  fetch('/api/run-cli',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
    .then(function(r){ return r.json(); })
    .then(function(j){
      var out=(j&&j.outputs&&j.outputs[0]&&j.outputs[0].output)||'';
      var ports=(j&&j.ok)?_rackPortsParse(out):[];
      var ent={ts:Date.now(),ports:ports,err:(j&&j.ok)?'':String((j&&j.error)||'조회 실패')};
      if(!ent.ports.length&&!ent.err) ent.err='인터페이스 상태를 해석하지 못했습니다';
      _rackPortCache[d.id]=ent; _rackPortsPaint(d,ent);
    })
    .catch(function(err){ var ent={ts:Date.now(),ports:[],err:(err&&err.message)||'요청 오류'}; _rackPortCache[d.id]=ent; _rackPortsPaint(d,ent); });
}
function _rackPortsPaint(d,ent){
  if(window._rackHoverDev!==d.id) return;   // 이미 다른 장비 호버 중이면 무시
  var el=document.getElementById('rack-hover-ports'); if(!el) return;
  if(ent.err){ el.innerHTML='<span style="color:#7a8696;">⚠ '+_bdEsc(ent.err)+'</span>'; }
  else{
    var up=0; ent.ports.forEach(function(p){ if(p.st==='up')up++; });
    // 실제 장비 전면판처럼: 모듈(프리픽스)별 블록 + 위=홀수/아래=짝수 2단 + 6포트 그룹 간격
    var groups=[]; var _gm={};
    ent.ports.forEach(function(p){
      var pre=String(p.n).replace(/\d+\s*$/,'');
      if(!_gm[pre]){ _gm[pre]={pre:pre,list:[]}; groups.push(_gm[pre]); }
      _gm[pre].list.push(p);
    });
    var _cell=function(p){
      if(!p) return '<span style="width:18px;height:14px;"></span>';
      var num=(String(p.n).match(/(\d+)\s*$/)||[])[1]||'·';
      return '<span title="'+_bdEsc(p.n)+'" style="width:18px;height:14px;border-radius:2.5px;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:800;color:'+(p.st==='up'?'#04350f':'#4a0d10')+';background:'+(p.st==='up'?'#2ee06a':'#ff5a61')+';box-shadow:inset 0 -1px 0 rgba(0,0,0,0.3);">'+_bdEsc(num)+'</span>';
    };
    var html=groups.map(function(g){
      var cols=[]; for(var i=0;i<g.list.length;i+=2){ cols.push([g.list[i],g.list[i+1]||null]); }
      var cells=cols.map(function(c,ci){
        return '<span style="display:flex;flex-direction:column;gap:2px;'+((ci%6===5&&ci<cols.length-1)?'margin-right:6px;':'')+'">'+_cell(c[0])+_cell(c[1])+'</span>';
      }).join('');
      return '<div style="margin-bottom:6px;">'
        +(g.pre?'<div style="font-size:9.5px;color:#8a96a6;font-weight:700;margin-bottom:3px;letter-spacing:.03em;">'+_bdEsc(g.pre)+'</div>':'')
        +'<div style="display:flex;gap:2px;flex-wrap:wrap;background:#141a23;border:1px solid #2a3442;border-radius:6px;padding:6px 7px;max-width:400px;width:fit-content;">'+cells+'</div>'
      +'</div>';
    }).join('');
    el.innerHTML=html+'<div style="margin-top:2px;font-size:10.5px;color:#8a96a6;">connected '+up+' / 전체 '+ent.ports.length+'포트</div>';
  }
  var bb=document.getElementById('rack-hover');   // 내용이 늘어나 화면 아래로 넘치면 위로 보정
  if(bb){ var vh=window.innerHeight; var r=bb.getBoundingClientRect(); if(r.bottom>vh-8){ bb.style.top=Math.max(6,(vh-8-bb.offsetHeight))+'px'; } }
}
function _rackHover(ev,devId,el){
  var d=(deviceList||[]).find(function(x){return x.id===devId;}); if(!d)return;
  _rackHoverHide();
  window._rackHoverDev=devId;
  var e=_bdEsc;
  var conn=(d.status==='연결됨'||d.status==='connected');
  var sTxt=conn?'정상':(d.status==='실패'?'미연결':(d.status==='확인중'?'확인중':'미확인'));
  var sCol=conn?'#27d07a':(d.status==='실패'?'#ff7a85':(d.status==='확인중'?'#f5c542':'#9aa6b4'));
  var pos=(d.rack_pos?(_RP(d)+(_RU(d)>1?('–'+(_RP(d)+_RU(d)-1)):'')+'U'):'-');
  var row=function(lab,val){ return '<div style="display:flex;gap:10px;"><span style="color:#8a96a6;min-width:66px;flex-shrink:0;">'+lab+'</span><span style="color:#e7ecf3;">'+val+'</span></div>'; };
  var b=document.createElement('div'); b.id='rack-hover';
  b.style.cssText='position:fixed;z-index:100000;background:#1f2632;color:#e7ecf3;font-size:14px;line-height:1.6;padding:14px 18px;border-radius:11px;box-shadow:0 14px 40px rgba(0,0,0,0.45);max-width:440px;pointer-events:none;border:1px solid #313b49;';
  b.innerHTML='<div style="font-weight:800;font-size:17px;margin-bottom:8px;display:flex;align-items:center;gap:8px;">'+e(d.name||d.ip||'장비')+'<span style="font-size:13px;color:'+sCol+';font-weight:800;">● '+sTxt+'</span></div>'+
    row('IP', e(d.ip||'-')+(d.protocol?('  <span style="color:#8a96a6;">'+e(String(d.protocol).toUpperCase())+'</span>'):''))+
    (d.mac?row('MAC', e(d.mac)):'')+
    (d.serial?row('시리얼', e(d.serial)):'')+
    row('위치', (d.rack_name?e(d.rack_name)+' · ':'')+pos)+
    (d.lab?row('구역', e(d.lab)):'')+
    ((d.vendor||d.role)?row('장비', e(d.vendor||'-')+(d.role?(' · '+e(d.role)):'')):'')+
    (d.dept?row('관리부서', e(d.dept)):'')+
    (d.asset?row('자산여부', e(d.asset)):'')+
    (d.power?row('소모전력', (parseFloat(d.power)||0)+'W'):'')+
    '<div style="margin-top:6px;padding-top:6px;border-top:1px solid #38424f;">'+(d.note?('<div style="white-space:pre-wrap;color:#dfe6ee;">'+e(d.note)+'</div>'):'<div style="color:#7a8696;font-size:11px;">메모 없음 · 클릭 → 세부정보 입력</div>')+'</div>';
  // 포트 형상 섹션 — telnet/ssh + IP 있는 장비만 (show interface status 실시간 조회)
  var _pLow=String(d.protocol||'').toLowerCase();
  var _canPorts=!!(d.ip&&(_pLow==='telnet'||_pLow==='ssh'));
  if(_canPorts){
    b.innerHTML+='<div style="margin-top:8px;padding-top:7px;border-top:1px solid #38424f;">'
      +'<div style="font-size:11px;color:#8a96a6;font-weight:700;margin-bottom:5px;">포트 형상 <span style="font-weight:400;">(show interface status · <span style="color:#27d07a;">■</span> connected · <span style="color:#ff7a85;">■</span> down)</span></div>'
      +'<div id="rack-hover-ports" style="font-size:11px;color:#7a8696;"><span class="ring-spin" style="width:11px;height:11px;border-width:2px;display:inline-block;vertical-align:-2px;"></span> 장비에서 조회 중…</div>'
    +'</div>';
  }
  b.style.left='-9999px'; b.style.top='0';
  document.body.appendChild(b);
  if(_canPorts) _rackPortsFetch(d);
  var slot=el||ev.target;
  var sr=slot.getBoundingClientRect();
  var wrap=slot.parentElement&&slot.parentElement.parentElement;
  var wr=wrap?wrap.getBoundingClientRect():sr;
  var _zoomProbe=document.createElement('div');
  _zoomProbe.style.cssText='position:fixed;left:100px;top:0;width:1px;height:1px;pointer-events:none;visibility:hidden;';
  document.body.appendChild(_zoomProbe);
  requestAnimationFrame(function(){
    var probeX=_zoomProbe.getBoundingClientRect().x;
    var zoom=probeX/100;
    _zoomProbe.remove();
    if(!zoom||zoom<=0) zoom=1;
    var w=b.offsetWidth, h=b.offsetHeight;
    var vw=window.innerWidth, vh=window.innerHeight;
    var rackRight=Math.min(wr.right/zoom, vw-8);
    var rackLeft=Math.max(wr.left/zoom, 8);
    var srTop=sr.top/zoom, srH=sr.height/zoom;
    var x, y;
    if(rackRight+8+w<=vw-8){
      x=rackRight+8;
    } else if(rackLeft-8-w>=8){
      x=rackLeft-8-w;
    } else {
      x=vw-w-8;
    }
    y=Math.round(srTop+srH/2-h/2);
    if(y+h>vh-8){ y=vh-h-8; }
    if(y<6){ y=6; }
    b.style.left=x+'px'; b.style.top=y+'px';
  });
}
function _rackHoverMove(ev){ }
function _rackHoverHide(){ window._rackHoverDev=''; var b=document.getElementById('rack-hover'); if(b)b.remove(); }
// 모델(제품군별) 팔레트 전용 hover — IP·구역·장비(벤더·제품군)·관리부서만 표시(랙 배치 장비의 상세 팝업 _rackHover와는 별개)
function _rackModelHover(ev,devId,el){
  var d=(deviceList||[]).find(function(x){return x.id===devId;}); if(!d)return;
  _rackHoverHide();
  window._rackHoverDev=devId;
  var e=_bdEsc;
  var row=function(lab,val){ return '<div style="display:flex;gap:10px;"><span style="color:#8a96a6;min-width:66px;flex-shrink:0;">'+lab+'</span><span style="color:#e7ecf3;">'+val+'</span></div>'; };
  var b=document.createElement('div'); b.id='rack-hover';
  b.style.cssText='position:fixed;z-index:100000;background:#1f2632;color:#e7ecf3;font-size:14px;line-height:1.6;padding:14px 18px;border-radius:11px;box-shadow:0 14px 40px rgba(0,0,0,0.45);max-width:380px;pointer-events:none;border:1px solid #313b49;';
  b.innerHTML='<div style="font-weight:800;font-size:17px;margin-bottom:8px;">'+e(d.name||d.ip||'장비')+'</div>'+
    row('IP', e(d.ip||'-'))+
    row('구역', e(d.lab||'-'))+
    row('장비', e(d.vendor||'-')+(d.role?(' · '+e(d.role)):''))+
    row('관리부서', e(d.dept||'-'));
  b.style.left='-9999px'; b.style.top='0';
  document.body.appendChild(b);
  var slot=el||ev.target;
  var sr=slot.getBoundingClientRect();
  var _zoomProbe=document.createElement('div');
  _zoomProbe.style.cssText='position:fixed;left:100px;top:0;width:1px;height:1px;pointer-events:none;visibility:hidden;';
  document.body.appendChild(_zoomProbe);
  requestAnimationFrame(function(){
    var probeX=_zoomProbe.getBoundingClientRect().x;
    var zoom=probeX/100;
    _zoomProbe.remove();
    if(!zoom||zoom<=0) zoom=1;
    var w=b.offsetWidth, h=b.offsetHeight;
    var vw=window.innerWidth, vh=window.innerHeight;
    var srRight=Math.min(sr.right/zoom, vw-8);
    var srLeft=Math.max(sr.left/zoom, 8);
    var srTop=sr.top/zoom, srH=sr.height/zoom;
    var x, y;
    if(srRight+8+w<=vw-8){ x=srRight+8; }
    else if(srLeft-8-w>=8){ x=srLeft-8-w; }
    else { x=vw-w-8; }
    y=Math.round(srTop+srH/2-h/2);
    if(y+h>vh-8){ y=vh-h-8; }
    if(y<6){ y=6; }
    b.style.left=x+'px'; b.style.top=y+'px';
  });
}
// Lab 세부내역 입력 폼(관리부서·위치·담당자·연락처·비고)
function labEditNote(labId){
  var L=(labLabs||[]).find(function(x){return x.id===labId;}); if(!L)return;
  var e=_bdEsc; var old=document.getElementById('lab-info-modal'); if(old)old.remove();
  var fld='width:100%;font-size:13px;padding:8px 11px;border:1px solid var(--border);border-radius:8px;outline:none;box-sizing:border-box;';
  var fr=function(lab,id,val){ return '<div><div style="font-size:12px;color:var(--text3);font-weight:600;margin-bottom:4px;">'+lab+'</div><input id="'+id+'" value="'+e(val||'').replace(/"/g,'&quot;')+'" style="'+fld+'"></div>'; };
  var m=document.createElement('div'); m.id='lab-info-modal';
  m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:100001;display:flex;align-items:center;justify-content:center;';
  m.innerHTML='<div style="background:#fff;width:min(460px,94vw);border-radius:14px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.3);">'+
    '<div style="padding:14px 18px;border-bottom:1px solid var(--border);background:var(--bg3);display:flex;align-items:center;gap:9px;"><i class="ti ti-building" style="color:#7c3aed;font-size:18px;"></i><b style="font-size:15px;">'+e(L.name)+' — 세부내역</b><span style="flex:1;"></span><button onclick="document.getElementById(\'lab-info-modal\').remove()" style="width:26px;height:26px;border-radius:6px;border:1px solid var(--border);background:#fff;cursor:pointer;"><i class="ti ti-x"></i></button></div>'+
    '<div style="padding:16px 18px;display:flex;flex-direction:column;gap:11px;">'+
      fr('관리부서','lab-f-dept',L.dept)+
      fr('Lab 이름 (수정)','lab-f-name',L.name)+
      fr('위치/장소','lab-f-loc',L.location)+
      fr('담당자','lab-f-mgr',L.manager)+
      fr('연락처','lab-f-tel',L.contact)+
      '<div><div style="font-size:12px;color:var(--text3);font-weight:600;margin-bottom:4px;">비고</div><textarea id="lab-f-note" style="'+fld+'min-height:70px;resize:vertical;font-family:inherit;">'+e(L.note||'')+'</textarea></div>'+
    '</div>'+
    '<div style="padding:12px 18px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;"><button onclick="document.getElementById(\'lab-info-modal\').remove()" style="font-size:13px;padding:8px 16px;border-radius:8px;border:1px solid var(--border);background:#fff;cursor:pointer;">취소</button><button onclick="labInfoSave(\''+labId+'\')" style="font-size:13px;padding:8px 18px;border-radius:8px;border:none;background:#7c3aed;color:#fff;cursor:pointer;font-weight:700;">저장</button></div>'+
  '</div>';
  document.body.appendChild(m); var f=document.getElementById('lab-f-dept'); if(f)f.focus();
}
function labInfoSave(labId){
  var L=(labLabs||[]).find(function(x){return x.id===labId;}); if(!L)return;
  var g=function(id){ var el=document.getElementById(id); return el?(el.value||'').trim():''; };
  // Lab 이름 변경 → 해당 Lab을 참조하는 장비(d.lab)에 전파
  var _newName=g('lab-f-name');
  if(_newName && _newName!==L.name){ var _oldName=L.name; (deviceList||[]).forEach(function(d){ if(d.lab===_oldName) d.lab=_newName; }); L.name=_newName; if(typeof saveDeviceData==='function') saveDeviceData(); }
  L.dept=g('lab-f-dept'); L.location=g('lab-f-loc'); L.manager=g('lab-f-mgr'); L.contact=g('lab-f-tel'); L.note=g('lab-f-note');
  saveRacks(); var m=document.getElementById('lab-info-modal'); if(m)m.remove(); renderRackPage(); if(typeof showToast==='function')showToast('Lab 저장됨');
}
// Lab 탭 마우스오버 현황
function _labHover(ev,labId){
  var L=(labLabs||[]).find(function(x){return x.id===labId;}); if(!L)return;
  _rackHoverHide();
  var e=_bdEsc;
  var racks=(labRacks||[]).filter(function(r){return r.lab_id===labId;});
  var names=racks.map(function(r){return r.name;});
  var devs=(deviceList||[]).filter(function(d){return _RP(d) && racks.some(function(r){return d.rack_id?(r.id===d.rack_id):(r.name===d.rack_name);});});
  var isMt=_isMeterDev;
  var meters=devs.filter(isMt).length;
  var conn=devs.filter(function(d){return d.status==='연결됨'||d.status==='connected';}).length;
  var pw=devs.reduce(function(s,d){return s+(parseFloat(d.power)||0);},0);
  var usedU=devs.reduce(function(s,d){return s+_RU(d);},0);
  var totU=racks.reduce(function(s,r){return s+(parseInt(r.units,10)||0);},0);
  var byModel={}; devs.forEach(function(d){ var nm=(String(d.name||'').trim()||String(d.model||'').trim()||'(모델 미지정)'); nm=nm.replace(/_\d+$/,''); byModel[nm]=(byModel[nm]||0)+1; });   // 끝의 _1,_2… 접미사는 같은 모델로 합산
  var mk=Object.keys(byModel).sort(); var manyModels=mk.length>8;
  var modelLines=mk.map(function(nm){ return '<div style="display:flex;justify-content:space-between;gap:14px;"><span style="color:#dfe6ee;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px;">'+_bdEsc(nm)+'</span><span style="color:#9fe6c0;font-weight:800;flex-shrink:0;">'+byModel[nm]+'대</span></div>'; }).join('');
  var row=function(lab,val){ return '<div style="display:flex;gap:10px;"><span style="color:#8a96a6;min-width:74px;flex-shrink:0;">'+lab+'</span><span style="color:#e7ecf3;">'+val+'</span></div>'; };
  var b=document.createElement('div'); b.id='rack-hover';
  b.style.cssText='position:fixed;z-index:100000;background:#1f2632;color:#e7ecf3;font-size:14px;line-height:1.6;padding:14px 18px;border-radius:11px;box-shadow:0 14px 40px rgba(0,0,0,0.45);max-width:'+(manyModels?'680':'440')+'px;pointer-events:none;border:1px solid #313b49;';
  b.innerHTML='<div style="font-weight:800;font-size:17px;margin-bottom:8px;display:flex;align-items:center;gap:8px;"><i class="ti ti-building" style="color:#a78bfa;font-size:18px;"></i>'+e(L.name)+'</div>'+
    (L.dept?row('관리부서', e(L.dept)):'')+
    (L.location?row('위치', e(L.location)):'')+
    ((L.manager||L.contact)?row('담당자', e(L.manager||'-')+(L.contact?(' · '+e(L.contact)):'')):'')+
    row('랙', racks.length+'개')+
    row('배치 장비', devs.length+'대'+(meters?(' (계측기 '+meters+')'):''))+
    row('연결', '<span style="color:#27d07a;font-weight:800;">'+conn+'</span> / '+devs.length+' 정상')+
    row('사용 U', usedU+' / '+totU+'U')+
    (pw?row('총 소모전력', Math.round(pw)+'W'):'')+
    (modelLines?'<div style="margin-top:7px;padding-top:7px;border-top:1px solid #38424f;"><div style="color:#8a96a6;margin-bottom:3px;">모델별 수량</div><div style="'+(manyModels?'display:grid;grid-template-columns:1fr 1fr;column-gap:26px;row-gap:1px;':'')+'">'+modelLines+'</div></div>':'')+
    (L.note?'<div style="margin-top:7px;padding-top:7px;border-top:1px solid #38424f;white-space:pre-wrap;color:#dfe6ee;">'+e(L.note)+'</div>':'');
  b.style.left='-9999px'; b.style.top='0';
  document.body.appendChild(b);
  var slot2=ev.currentTarget||ev.target; var r2=slot2.getBoundingClientRect();
  var _zoomProbe2=document.createElement('div');
  _zoomProbe2.style.cssText='position:fixed;left:100px;top:0;width:1px;height:1px;pointer-events:none;visibility:hidden;';
  document.body.appendChild(_zoomProbe2);
  requestAnimationFrame(function(){
    var probeX2=_zoomProbe2.getBoundingClientRect().x;
    var zoom2=probeX2/100;
    _zoomProbe2.remove();
    if(!zoom2||zoom2<=0) zoom2=1;
    var w2=b.offsetWidth, h2=b.offsetHeight;
    var vw2=window.innerWidth, vh2=window.innerHeight;
    var x2, y2;
    if(r2.right/zoom2+8+w2<=vw2-8){
      x2=r2.right/zoom2+8;
    } else {
      x2=r2.left/zoom2-8-w2;
    }
    if(x2<8){ x2=8; }
    y2=Math.round(r2.top/zoom2);   // 팝업 상단을 버튼 상단과 일치 (중앙 정렬 시 버튼보다 위로 올라가던 문제)
    if(y2+h2>vh2-8){ y2=vh2-h2-8; }
    if(y2<6){ y2=6; }
    b.style.left=x2+'px'; b.style.top=y2+'px';
  });
}
function _isMeterDev(d){ if(!d) return false; var p=String(d.protocol||'').toLowerCase(); return !!(d.role==='계측기'||d.group==='계측기'||p==='rest'||p==='tcl'||/spirent|stc|ixia/i.test(String(d.name||'')+' '+String(d.model||'')+' '+String(d.vendor||''))); }   // 계측기(STC/IXIA/Spirent·REST·TCL) 판별 공통
function rackConnect(devId){ const d=(deviceList||[]).find(x=>x.id===devId); if(!d)return; if(_isMeterDev(d))return; rackTerminal(d); }   // 계측기는 클릭 무반응
// 실장된 장비 전체 접속확인 (접속방식별: rest→STC, telnet/ssh/snmp→lab-test, tcl→보류)
var _termTabs=[];   // [{id,name,ip,protocol,out,input,prompt,hist,histIdx,warmed}]
var _termActive=''; var _popoutWin=null;
function _termDev(d){ return {id:d.id,host:d.ip||'',ip:d.ip||'',port:d.port||0,protocol:d.protocol||'telnet',username:d.username||'',password:d.password||'',secret:d.secret||'',device_type:d.device_type||((d.protocol||'')==='ssh'?'cisco_ios':'cisco_ios_telnet'),name:d.name||''}; }
function rackTerminal(d){
  if(_popoutWin && !_popoutWin.closed){   // 팝아웃 창이 열려있으면 거기에 탭으로 추가
    try{ _popoutWin.addTab(JSON.stringify(_termDev(d)), (d.name||'')+' ('+(d.ip||'')+') 터미널 — 명령을 입력하세요.\n'); _popoutWin.focus(); return; }catch(e){ _popoutWin=null; }
  }
  let tab=_termTabs.find(x=>x.id===d.id);
  if(!tab){ tab={id:d.id,name:d.name||'',ip:d.ip||'',protocol:(d.protocol||''),out:(d.name||'')+' ('+(d.ip||'')+') 터미널 — 명령을 입력하세요.\n',input:'',prompt:'$ ',hist:[],histIdx:0,warmed:false}; _termTabs.push(tab); }
  else { tab.name=d.name||tab.name; tab.ip=d.ip||tab.ip; }
  _termActive=d.id;
  if(!document.getElementById('rack-term')) document.body.appendChild(_termBuildWindow());
  _termRender();
  const sc=document.getElementById('rack-term-screen'); if(sc)sc.focus();
  if(!tab.warmed){ tab.warmed=true; rackTermWarm(d); }
}
function _termBuildWindow(){
  const m=document.createElement('div'); m.id='rack-term';
  m.style.cssText='position:fixed;top:70px;left:calc(50% - 400px);width:800px;max-width:95vw;height:74vh;z-index:1300;background:#0c0f14;border:1px solid #2a2f3a;border-radius:12px;box-shadow:0 14px 48px rgba(0,0,0,.45);display:flex;flex-direction:column;overflow:hidden;';
  const ic='width:26px;height:26px;border-radius:6px;border:1px solid #2a2f3a;background:#1a1f29;color:#9aa;cursor:pointer;';
  m.innerHTML='<div id="rack-term-bar" onmousedown="rackTermDrag(event)" style="padding:10px 14px;border-bottom:1px solid var(--border);background:#11151c;color:#cfe3d6;display:flex;align-items:center;gap:9px;cursor:move;user-select:none;"><i class="ti ti-terminal-2" style="color:#7CFC00;"></i><b style="font-size:13px;">장비 터미널</b><span style="font-size:10px;color:#5e6878;font-weight:700;">⠿ 드래그 이동</span><span style="flex:1;"></span><button onclick="rackTermTest(_termActive)" style="font-size:11px;padding:5px 11px;border-radius:6px;border:1px solid #2e7d50;background:#13241a;color:#7CFC00;cursor:pointer;font-weight:700;"><i class="ti ti-plug"></i> 접속확인</button><button onclick="rackTermPopout()" title="새 창으로 열기 (화면 밖·다른 모니터로 이동 가능)" style="'+ic+'margin-left:6px;"><i class="ti ti-external-link"></i></button><button onclick="rackTermMin()" title="최소화/복원" style="'+ic+'margin-left:4px;"><i class="ti ti-minus"></i></button><button onclick="rackTermCloseAll()" title="전체 닫기(모든 세션 종료)" style="'+ic+'margin-left:4px;"><i class="ti ti-x"></i></button></div>'+
    '<div id="rack-term-tabs" style="display:flex;gap:3px;align-items:flex-end;padding:6px 8px 0;background:#11151c;border-bottom:1px solid #2a2f3a;overflow-x:auto;flex-shrink:0;"></div>'+
    '<style>@keyframes tcblink{50%{opacity:0}}#rack-term-screen .tcur{display:inline-block;width:7px;height:14px;vertical-align:text-bottom;background:#7CFC00;animation:tcblink 1.1s step-end infinite;margin-left:1px;}</style>'+
    '<div id="rack-term-body" style="flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0;">'+
    '<div id="rack-term-screen" tabindex="0" onkeydown="rackTermKey(event)" onpaste="rackTermPaste(event)" onclick="rackTermFocus()" style="flex:1;margin:0;padding:12px 16px;background:#0c0f14;color:#cfe3d6;font-size:12.5px;line-height:1.55;overflow:auto;white-space:pre-wrap;font-family:monospace;outline:none;cursor:text;"><span id="rack-term-hist"></span><span id="rack-term-cur"></span></div>'+
    '</div>';
  return m;
}
function rackTermFocus(){ try{ if(String(window.getSelection()).length)return; }catch(e){} const sc=document.getElementById('rack-term-screen'); if(sc)sc.focus(); }
function _termRender(){
  const tb=document.getElementById('rack-term-tabs'); if(!tb)return; const e=_bdEsc;
  tb.innerHTML=_termTabs.map(function(t){ const on=(t.id===_termActive); return '<div onclick="rackTermActivate(\''+t.id+'\')" title="'+e(t.name+' '+t.ip)+'" style="display:flex;align-items:center;gap:6px;padding:6px 9px;border-radius:7px 7px 0 0;cursor:pointer;font-size:12px;white-space:nowrap;flex-shrink:0;'+(on?'background:#0c0f14;color:#cfe3d6;border:1px solid #2a2f3a;border-bottom-color:#0c0f14;':'background:#171c24;color:#8a96a6;border:1px solid transparent;')+'"><span style="width:7px;height:7px;border-radius:50%;background:'+(on?'#7CFC00':'#5e6878')+';flex-shrink:0;"></span><span style="max-width:140px;overflow:hidden;text-overflow:ellipsis;'+(on?'font-weight:700;':'')+'">'+e(t.name||t.ip||'장비')+'</span><i class="ti ti-x" onclick="event.stopPropagation();rackTermCloseTab(\''+t.id+'\')" title="이 탭 닫기" style="font-size:13px;opacity:.55;flex-shrink:0;"></i></div>'; }).join('');
  _termPaint();
}
function _termPaint(){ const t=_termTabs.find(x=>x.id===_termActive); const h=document.getElementById('rack-term-hist'); if(h&&t)h.textContent=t.out||''; _termCur(); }
function _termCur(){ const t=_termTabs.find(x=>x.id===_termActive); const c=document.getElementById('rack-term-cur'); if(!c)return; c.textContent=''; if(!t)return; c.appendChild(document.createTextNode((t.prompt||'$ ')+(t.input||''))); const cur=document.createElement('span'); cur.className='tcur'; c.appendChild(cur); const sc=document.getElementById('rack-term-screen'); if(sc)sc.scrollTop=sc.scrollHeight; }
function rackTermKey(ev){
  const t=_termTabs.find(x=>x.id===_termActive); if(!t)return; const k=ev.key;
  if((ev.ctrlKey||ev.metaKey)&&(k==='c'||k==='C')){ if(String(window.getSelection()).length)return; ev.preventDefault(); t.out=(t.out||'')+(t.prompt||'$ ')+(t.input||'')+'^C\n'; t.input=''; _termPaint(); return; }
  if(ev.ctrlKey||ev.metaKey)return;   // 복사/붙여넣기/선택 등 브라우저 기본 허용
  if(k==='Enter'){ ev.preventDefault(); const cmd=(t.input||''); t.out=(t.out||'')+(t.prompt||'$ ')+cmd+'\n'; if(cmd.trim()){ t.hist=t.hist||[]; t.hist.push(cmd); } t.histIdx=(t.hist||[]).length; t.input=''; _termPaint(); rackTermExec(_termActive,cmd.trim()); return; }
  if(k==='Tab'){ ev.preventDefault(); rackTermComplete(_termActive); return; }
  if(k==='?'){ ev.preventDefault(); rackTermHelp(_termActive); return; }   // ? → 입력 가능한 명령 즉시 표시(실행 안 함)
  if(k==='Backspace'){ ev.preventDefault(); t.input=(t.input||'').slice(0,-1); _termCur(); return; }
  if(k==='ArrowUp'){ ev.preventDefault(); const H=t.hist||[]; if(H.length){ t.histIdx=Math.max(0,(t.histIdx==null?H.length:t.histIdx)-1); t.input=H[t.histIdx]||''; _termCur(); } return; }
  if(k==='ArrowDown'){ ev.preventDefault(); const H=t.hist||[]; if(H.length){ t.histIdx=Math.min(H.length,(t.histIdx==null?H.length:t.histIdx)+1); t.input=(t.histIdx>=H.length)?'':(H[t.histIdx]||''); _termCur(); } return; }
  if(k && k.length===1 && !ev.altKey){ ev.preventDefault(); t.input=(t.input||'')+k; _termCur(); return; }
}
function rackTermPaste(ev){ const t=_termTabs.find(x=>x.id===_termActive); if(!t)return; ev.preventDefault(); const txt=(((ev.clipboardData||window.clipboardData).getData('text'))||'').replace(/\r?\n/g,' '); t.input=(t.input||'')+txt; _termCur(); }
async function rackTermComplete(devId){
  const t=_termTabs.find(x=>x.id===devId); if(!t)return; const d=(deviceList||[]).find(x=>x.id===devId); if(!d)return;
  const partial=t.input||''; if(!partial.trim())return;
  try{ const r=await fetch('/api/cli-complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host:d.ip,port:d.port,protocol:d.protocol,username:d.username,password:d.password,secret:d.secret,device_type:d.device_type,partial:partial})});
    const dd=await r.json();
    if(dd&&dd.ok&&dd.completed&&dd.completed!==partial){ t.input=dd.completed; _termCur(); }
    else if(dd&&dd.options&&dd.options.length>1){ _rackOut(devId,'\n'+dd.options.join('\n')+'\n'); }
  }catch(e){}
}
// ? 도움말: 현재 입력 + ? 를 장비에 보내 '입력 가능한 명령'을 표시 (실행하지 않음 → 빠르고, 명령 잘못 실행 안 됨)
async function rackTermHelp(devId){
  const t=_termTabs.find(x=>x.id===devId); if(!t)return; const d=(deviceList||[]).find(x=>x.id===devId); if(!d)return;
  const partial=t.input||'';
  t.out=(t.out||'')+(t.prompt||'$ ')+partial+'?\n'; _termPaint();   // 사용자가 친 대로 표시
  try{
    const r=await fetch('/api/cli-complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host:d.ip,port:d.port,protocol:d.protocol,username:d.username,password:d.password,secret:d.secret,device_type:d.device_type,partial:partial,help:true})});
    const dd=await r.json();
    if(dd&&dd.ok){ const h=String(dd.help||(dd.options||[]).join('\n')||'').replace(/\s+$/,''); _rackOut(devId, h?(h+'\n'):'(입력 가능한 명령 없음)\n'); }
    else if(dd&&dd.no_session){ _rackOut(devId,'[세션 없음 — 재접속 중]\n'); rackTermWarm(d); }
    else { _rackOut(devId,'[?] '+((dd&&dd.error)||'도움말 조회 실패')+'\n'); }
  }catch(e){ _rackOut(devId,'[오류] '+e.message+'\n'); }
  if(devId===_termActive)_termCur();   // 입력은 유지 → 프롬프트+입력 다시 표시(이어서 타이핑)
}
function rackTermActivate(id){ if(!_termTabs.find(x=>x.id===id))return; _termActive=id; _termRender(); const sc=document.getElementById('rack-term-screen'); if(sc)sc.focus(); }
function _termCloseSession(id){ const d=(deviceList||[]).find(x=>x.id===id); if(d){ try{ fetch('/api/session-close',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host:d.ip,port:d.port,protocol:d.protocol,username:d.username,password:d.password,secret:d.secret,device_type:d.device_type})}); }catch(e){} } }
function rackTermCloseTab(id){ _termCloseSession(id); _termTabs=_termTabs.filter(x=>x.id!==id); if(!_termTabs.length){ const w=document.getElementById('rack-term'); if(w)w.remove(); _termActive=''; return; } if(_termActive===id) _termActive=_termTabs[_termTabs.length-1].id; _termRender(); }
function rackTermCloseAll(){ _termTabs.slice().forEach(t=>_termCloseSession(t.id)); _termTabs=[]; _termActive=''; const w=document.getElementById('rack-term'); if(w)w.remove(); }
function rackTermPopout(){
  if(!_termTabs.length){ if(typeof showToast==='function')showToast('열린 터미널이 없습니다'); return; }
  const w=window.open('', 'rackterm_popout', 'width=900,height=660,resizable=yes,scrollbars=yes');
  if(!w){ if(typeof showToast==='function')showToast('팝업이 차단됨 — 브라우저 팝업 허용 필요(또는 일반 브라우저에서 접속)'); return; }
  const tabs=_termTabs.map(function(t){ const d=(deviceList||[]).find(x=>x.id===t.id)||{}; const dev=_termDev(d); dev.id=t.id; dev.name=t.name; dev.ip=t.ip; return {dev:dev, out:t.out||''}; });
  w.document.open(); w.document.write(_termPopoutHtml(location.origin, tabs)); w.document.close();
  _popoutWin=w;
  _termTabs=[]; _termActive=''; const win=document.getElementById('rack-term'); if(win)win.remove();   // 인앱 창 닫기(세션은 팝업이 이어받음)
  if(typeof showToast==='function')showToast('새 창으로 열림 — 이후 장비 클릭 시 이 창에 탭으로 추가됩니다');
}
function _termPopoutHtml(origin, tabs){
  const ORIGIN=JSON.stringify(origin); const INIT=JSON.stringify(tabs||[]).replace(/</g,'\\u003c');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>장비 터미널</title>
<style>
*{box-sizing:border-box}html,body{margin:0;height:100%}
body{display:flex;flex-direction:column;background:#0c0f14;color:#cfe3d6;font-family:monospace}
#bar{display:flex;align-items:center;gap:9px;padding:9px 13px;background:#11151c;border-bottom:1px solid #2a2f3a;font-family:'Segoe UI',system-ui,sans-serif}
#bar b{font-size:13px}
#tabs{display:flex;gap:3px;align-items:flex-end;padding:6px 8px 0;background:#11151c;border-bottom:1px solid #2a2f3a;overflow-x:auto}
.tab{display:flex;align-items:center;gap:6px;padding:6px 9px;border-radius:7px 7px 0 0;cursor:pointer;font-size:12px;white-space:nowrap;font-family:'Segoe UI',system-ui,sans-serif}
.dot{width:7px;height:7px;border-radius:50%}.tabx{opacity:.6;padding-left:2px}
#screen{flex:1;padding:12px 16px;overflow:auto;white-space:pre-wrap;font-size:12.5px;line-height:1.55;outline:none;cursor:text}
@keyframes tcblink{50%{opacity:0}}
.tcur{display:inline-block;width:7px;height:14px;vertical-align:text-bottom;background:#7CFC00;animation:tcblink 1.1s step-end infinite;margin-left:1px}
#testb{font-size:11px;padding:5px 11px;border-radius:6px;border:1px solid #2e7d50;background:#13241a;color:#7CFC00;cursor:pointer;font-weight:700;font-family:'Segoe UI',system-ui,sans-serif}
</style></head><body>
<div id="bar"><span style="color:#7CFC00">▣</span><b>장비 터미널</b><span style="font-size:10px;color:#5e6878">— 탭으로 여러 장비</span><span style="flex:1"></span><button id="testb">접속확인</button></div>
<div id="tabs"></div>
<div id="screen" tabindex="0"><span id="hist"></span><span id="cur"></span></div>
<script>
var API=${ORIGIN}; var TABS=[]; var ACT=''; var INIT=${INIT};
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');}
function findT(id){for(var i=0;i<TABS.length;i++){if(TABS[i].id===id)return TABS[i];}return null;}
function body(dev,x){return JSON.stringify(Object.assign({host:dev.host,port:dev.port,protocol:dev.protocol,username:dev.username,password:dev.password,secret:dev.secret,device_type:dev.device_type},x||{}));}
function paintTabs(){var tb=document.getElementById('tabs');var h='';for(var i=0;i<TABS.length;i++){var t=TABS[i];var on=(t.id===ACT);h+='<div class="tab" data-id="'+t.id+'" style="'+(on?'background:#0c0f14;color:#cfe3d6;border:1px solid #2a2f3a;border-bottom-color:#0c0f14':'background:#171c24;color:#8a96a6;border:1px solid transparent')+'"><span class="dot" style="background:'+(on?'#7CFC00':'#5e6878')+'"></span>'+esc(t.dev.name||t.dev.ip||'장비')+'<span class="tabx" data-id="'+t.id+'">✕</span></div>';}tb.innerHTML=h;}
function curr(){var t=findT(ACT);var c=document.getElementById('cur');c.textContent='';if(!t)return;c.appendChild(document.createTextNode((t.prompt||'$ ')+(t.input||'')));var x=document.createElement('span');x.className='tcur';c.appendChild(x);var s=document.getElementById('screen');s.scrollTop=s.scrollHeight;}
function paint(){var t=findT(ACT);var h=document.getElementById('hist');if(t)h.textContent=t.out||'';curr();}
function render(){paintTabs();paint();}
function out(id,txt){var t=findT(id);if(t)t.out=(t.out||'')+txt;if(id===ACT){var h=document.getElementById('hist');h.appendChild(document.createTextNode(txt));curr();}}
function activate(id){if(!findT(id))return;ACT=id;render();document.getElementById('screen').focus();}
function addTab(dev,initOut){if(typeof dev==='string')dev=JSON.parse(dev);var t=findT(dev.id);if(!t){t={id:dev.id,dev:dev,out:initOut||'',input:'',prompt:'$ ',hist:[],histIdx:0,warmed:false};TABS.push(t);}ACT=dev.id;render();document.getElementById('screen').focus();if(!t.warmed){t.warmed=true;warm(t);}}
window.addTab=addTab;
async function warm(t){out(t.id,'[세션 접속 중...] '+t.dev.host+'\\n');try{var r=await fetch(API+'/api/session-open',{method:'POST',headers:{'Content-Type':'application/json'},body:body(t.dev,{fast:true})});var d=await r.json();if(d&&d.ok){if(d.prompt){t.prompt=String(d.prompt).trim()+' ';}out(t.id,'✓ 접속됨'+(d.prompt?' — '+String(d.prompt).trim():'')+'\\n');if(t.id===ACT)curr();}else out(t.id,'[접속 실패] '+((d&&d.error)||'')+'\\n');}catch(e){out(t.id,'[오류] '+e.message+'\\n');}}
async function test(){var t=findT(ACT);if(!t)return;out(t.id,'\\n[접속 확인 중...] '+t.dev.host+'\\n');try{var r=await fetch(API+'/api/lab-test',{method:'POST',headers:{'Content-Type':'application/json'},body:body(t.dev)});var d=await r.json();out(t.id,d.ok?('연결 성공'+(d.prompt?' · '+d.prompt:'')+'\\n'):('연결 실패: '+(d.error||'')+'\\n'));}catch(e){out(t.id,'[오류] '+e.message+'\\n');}}
async function exec(t,cmd){if(!cmd)return;try{var resp=await fetch(API+'/api/run-cli-stream',{method:'POST',headers:{'Content-Type':'application/json'},body:body(t.dev,{commands:[cmd]})});if(!resp.ok||!resp.body){out(t.id,'[오류] 스트리밍 실패\\n');return;}var reader=resp.body.getReader();var dec=new TextDecoder();var sb='';while(true){var rd=await reader.read();if(rd.done)break;sb+=dec.decode(rd.value,{stream:true});var i;while((i=sb.indexOf('\\n\\n'))>=0){var evt=sb.slice(0,i);sb=sb.slice(i+2);if(evt.indexOf('data: ')!==0)continue;try{var o=JSON.parse(evt.slice(6));if(o.o!=null)out(t.id,o.o);else if(o.err)out(t.id,'[오류] '+o.err+'\\n');}catch(e){}}}}catch(e){out(t.id,'[오류] '+e.message+'\\n');}}
async function complete(t){if(!t)return;var partial=t.input||'';if(!partial.trim())return;try{var r=await fetch(API+'/api/cli-complete',{method:'POST',headers:{'Content-Type':'application/json'},body:body(t.dev,{partial:partial})});var d=await r.json();if(d&&d.ok&&d.completed&&d.completed!==partial){t.input=d.completed;curr();}else if(d&&d.options&&d.options.length>1){out(t.id,'\\n'+d.options.join('\\n')+'\\n');}}catch(e){}}
async function help(t){if(!t)return;var partial=t.input||'';out(t.id,(t.prompt||'$ ')+partial+'?\\n');try{var r=await fetch(API+'/api/cli-complete',{method:'POST',headers:{'Content-Type':'application/json'},body:body(t.dev,{partial:partial,help:true})});var d=await r.json();if(d&&d.ok){var h=String(d.help||(d.options||[]).join('\\n')||'').replace(/\\s+$/,'');out(t.id,(h?h+'\\n':'(입력 가능한 명령 없음)\\n'));}else if(d&&d.no_session){out(t.id,'[세션 없음 — 재접속 중]\\n');warm(t);}else out(t.id,'[?] '+((d&&d.error)||'')+'\\n');}catch(e){out(t.id,'[오류] '+e.message+'\\n');}if(t.id===ACT)curr();}
function closeTab(id){var t=findT(id);if(t){try{fetch(API+'/api/session-close',{method:'POST',headers:{'Content-Type':'application/json'},body:body(t.dev)});}catch(e){}}TABS=TABS.filter(function(x){return x.id!==id;});if(!TABS.length){window.close();return;}if(ACT===id)ACT=TABS[TABS.length-1].id;render();}
document.getElementById('testb').addEventListener('click',test);
document.getElementById('tabs').addEventListener('click',function(ev){var x=ev.target.closest('.tabx');if(x){closeTab(x.getAttribute('data-id'));return;}var tab=ev.target.closest('.tab');if(tab)activate(tab.getAttribute('data-id'));});
var SC=document.getElementById('screen');
SC.addEventListener('click',function(){if(!String(window.getSelection()).length)SC.focus();});
SC.addEventListener('paste',function(ev){var t=findT(ACT);if(!t)return;ev.preventDefault();var txt=((ev.clipboardData||window.clipboardData).getData('text')||'').replace(/\\r?\\n/g,' ');t.input=(t.input||'')+txt;curr();});
SC.addEventListener('keydown',function(ev){var t=findT(ACT);if(!t)return;var k=ev.key;if((ev.ctrlKey||ev.metaKey)&&(k==='c'||k==='C')){if(String(window.getSelection()).length)return;ev.preventDefault();t.out=(t.out||'')+(t.prompt||'$ ')+(t.input||'')+'^C\\n';t.input='';paint();return;}if(ev.ctrlKey||ev.metaKey)return;if(k==='Enter'){ev.preventDefault();var cmd=(t.input||'');t.out=(t.out||'')+(t.prompt||'$ ')+cmd+'\\n';if(cmd.trim())t.hist.push(cmd);t.histIdx=t.hist.length;t.input='';paint();exec(t,cmd.trim());return;}if(k==='Tab'){ev.preventDefault();complete(t);return;}if(k==='?'){ev.preventDefault();help(t);return;}if(k==='Backspace'){ev.preventDefault();t.input=(t.input||'').slice(0,-1);curr();return;}if(k==='ArrowUp'){ev.preventDefault();if(t.hist.length){t.histIdx=Math.max(0,(t.histIdx==null?t.hist.length:t.histIdx)-1);t.input=t.hist[t.histIdx]||'';curr();}return;}if(k==='ArrowDown'){ev.preventDefault();if(t.hist.length){t.histIdx=Math.min(t.hist.length,(t.histIdx==null?t.hist.length:t.histIdx)+1);t.input=(t.histIdx>=t.hist.length)?'':(t.hist[t.histIdx]||'');curr();}return;}if(k&&k.length===1&&!ev.altKey){ev.preventDefault();t.input=(t.input||'')+k;curr();return;}});
window.addEventListener('beforeunload',function(){try{TABS.forEach(function(t){fetch(API+'/api/session-close',{method:'POST',headers:{'Content-Type':'application/json'},body:body(t.dev),keepalive:true});});}catch(e){}});
(INIT||[]).forEach(function(it){addTab(it.dev,it.out);});
if(TABS.length){ACT=TABS[0].id;render();SC.focus();}
<\/script></body></html>`;
}
function rackTermDrag(ev){
  if(ev.target.closest('button,input'))return;   // 버튼·입력은 드래그 제외
  const m=document.getElementById('rack-term'); if(!m)return;
  const r=m.getBoundingClientRect(); const ox=ev.clientX-r.left, oy=ev.clientY-r.top;
  m.style.left=r.left+'px'; m.style.top=r.top+'px';
  function mv(e){ m.style.left=Math.max(0,Math.min(window.innerWidth-80,e.clientX-ox))+'px'; m.style.top=Math.max(0,Math.min(window.innerHeight-40,e.clientY-oy))+'px'; }
  function up(){ document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up); }
  document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up); ev.preventDefault();
}
function rackTermMin(){ const m=document.getElementById('rack-term'); const b=document.getElementById('rack-term-body'); if(!m||!b)return; if(b.style.display==='none'){ b.style.display='flex'; m.style.height=(m._savedH||'74vh'); }else{ m._savedH=m.style.height||'74vh'; b.style.display='none'; m.style.height='auto'; } }
// 세션 미리 접속(warm-up) — 지속 세션을 열어두면 이후 명령이 재접속 없이 빠르게 실행됨
async function rackTermWarm(d){
  _rackOut(d.id,'[세션 접속 중...] '+d.ip+'\n');
  try{
    const r=await fetch('/api/session-open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host:d.ip,port:d.port,protocol:d.protocol,username:d.username,password:d.password,secret:d.secret,device_type:d.device_type,fast:true})});
    const dd=await r.json();
    if(dd&&dd.ok){ const _t=_termTabs.find(x=>x.id===d.id); if(_t&&dd.prompt){ _t.prompt=String(dd.prompt).trim()+' '; } _rackOut(d.id,'✓ 접속됨'+(dd.prompt?' — '+String(dd.prompt).trim():'')+'\n'); if(d.id===_termActive)_termCur(); d.status='연결됨'; if(typeof saveDeviceData==='function')saveDeviceData(); }
    else { _rackOut(d.id,'[접속 실패] '+((dd&&dd.error)||'')+' — 명령 입력 시 자동 재접속합니다\n'); }
  }catch(err){ _rackOut(d.id,'[오류] '+err.message+'\n'); }
}
function _rackOut(devId,txt){ const t=_termTabs.find(x=>x.id===devId); if(t)t.out=(t.out||'')+txt; if(devId===_termActive){ const h=document.getElementById('rack-term-hist'); if(h){ h.appendChild(document.createTextNode(txt)); _termCur(); } } }
// 가벼운 출력: 타자기 애니메이션 없이 즉시 표시(append) — 대용량 출력에도 렉 없음
function _rackStream(devId,txt){ _rackOut(devId,String(txt)); }
async function rackTermTest(devId){
  const d=(deviceList||[]).find(x=>x.id===devId); if(!d)return; _rackOut(devId,'\n[접속 확인 중...] '+d.ip+'\n');
  try{ const r=await fetch('/api/lab-test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host:d.ip,port:d.port,protocol:d.protocol,username:d.username,password:d.password,secret:d.secret,device_type:d.device_type})}); const dd=await r.json(); d.status=dd.ok?'연결됨':'실패'; _rackOut(devId,dd.ok?('연결 성공'+(dd.prompt?' · '+dd.prompt:'')+'\n'):('연결 실패: '+(dd.error||'')+'\n')); saveDeviceData(); }catch(err){ _rackOut(devId,'[오류] '+err.message+'\n'); }
}
async function rackTermExec(devId,cmd){
  if(!cmd)return;
  const d=(deviceList||[]).find(x=>x.id===devId); if(!d){ _rackOut(devId,'[오류] 장비 정보 없음\n'); return; }
  try{
    const resp=await fetch('/api/run-cli-stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host:d.ip,port:d.port,protocol:d.protocol,username:d.username,password:d.password,secret:d.secret,device_type:d.device_type,commands:[cmd]})});
    if(!resp.ok||!resp.body){ _rackOut(devId,'[오류] 스트리밍 실패 ('+((resp&&resp.status)||'')+')\n'); return; }
    const reader=resp.body.getReader(); const dec=new TextDecoder(); let sb='';
    while(true){ const rd=await reader.read(); if(rd.done)break; sb+=dec.decode(rd.value,{stream:true}); let i;
      while((i=sb.indexOf('\n\n'))>=0){ const evt=sb.slice(0,i); sb=sb.slice(i+2);
        if(evt.indexOf('data: ')!==0) continue;
        try{ const o=JSON.parse(evt.slice(6)); if(o.o!=null){ _rackStream(devId,o.o); } else if(o.err){ _rackOut(devId,'[오류] '+o.err+'\n'); } }catch(e){}
      }
    }
  }catch(err){ _rackOut(devId,'[오류] '+err.message+'\n'); }
}
// ── Vendor 등록 ──
function renderVendorReg(){
  const body=document.getElementById('vendor-body'); if(!body) return;
  let h='<div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;"><i class="ti ti-building-store" style="font-size:22px;color:var(--blue);"></i><div><div style="font-size:18px;font-weight:800;color:var(--text);">Vendor Registration</div><div style="font-size:12px;color:var(--text3);">장비 벤더를 등록해 두면 장비 등록 시 드롭다운에서 선택할 수 있습니다</div></div></div>';
  h+='<div style="display:flex;gap:8px;margin-bottom:16px;max-width:600px;"><input id="vendor-new-name" placeholder="벤더명 (예: Ubiquoss)" onkeydown="if(event.key===\'Enter\')vendorAdd()" style="flex:1;font-size:13px;padding:9px 12px;border:1.5px solid var(--border);border-radius:7px;outline:none;"><input id="vendor-new-note" placeholder="비고 (선택)" style="width:200px;font-size:13px;padding:9px 12px;border:1.5px solid var(--border);border-radius:7px;outline:none;"><button onclick="vendorAdd()" style="font-size:13px;padding:9px 18px;border-radius:7px;border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:700;white-space:nowrap;"><i class="ti ti-plus"></i> 추가</button></div>';
  if(!vendorList.length){ h+='<div style="padding:44px;text-align:center;color:var(--text3);border:2px dashed var(--border);border-radius:12px;max-width:600px;"><i class="ti ti-building" style="font-size:38px;opacity:0.25;display:block;margin-bottom:10px;"></i>등록된 벤더가 없습니다.</div>'; }
  else {
    h+='<div style="max-width:600px;border:1px solid var(--border);border-radius:10px;overflow:hidden;background:#fff;">';
    vendorList.forEach((v,i)=>{
      const cnt=deviceList.filter(d=>d.vendor===v.name).length;
      if(_venEditIdx===i){
        h+='<div style="display:flex;align-items:center;gap:8px;padding:8px 14px;border-top:'+(i?'1px solid #f0f0f0':'none')+';background:#f4f7fd;"><input id="ven-edit-name" value="'+(v.name||'').replace(/"/g,'&quot;')+'" onkeydown="if(event.key===\'Enter\')vendorEditSave('+i+')" style="flex:1;font-size:13px;padding:6px 10px;border:1.5px solid var(--blue);border-radius:6px;outline:none;"><input id="ven-edit-note" value="'+(v.note||'').replace(/"/g,'&quot;')+'" placeholder="비고" style="width:180px;font-size:13px;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;outline:none;"><button onclick="vendorEditSave('+i+')" style="font-size:12px;padding:6px 13px;border-radius:6px;border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:700;">저장</button><button onclick="vendorEditCancel()" style="font-size:12px;padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:#fff;color:var(--text3);cursor:pointer;">취소</button></div>';
      } else {
        h+='<div style="display:flex;align-items:center;gap:10px;padding:11px 16px;border-top:'+(i?'1px solid #f0f0f0':'none')+';"><i class="ti ti-building" style="color:var(--blue);font-size:16px;"></i><span style="font-size:14px;font-weight:600;color:var(--text);flex:1;">'+v.name+(v.note?'<span style="font-size:11px;color:var(--text3);font-weight:400;margin-left:8px;">'+v.note+'</span>':'')+'</span><span style="font-size:11px;color:var(--text3);">장비 '+cnt+'</span><i class="ti ti-edit" onclick="vendorEditStart('+i+')" title="수정" style="color:var(--text3);cursor:pointer;font-size:15px;" onmouseenter="this.style.color=\'var(--blue)\'" onmouseleave="this.style.color=\'var(--text3)\'"></i><i class="ti ti-trash" onclick="vendorDelete('+i+')" title="삭제" style="color:var(--text3);cursor:pointer;font-size:15px;" onmouseenter="this.style.color=\'var(--red)\'" onmouseleave="this.style.color=\'var(--text3)\'"></i></div>';
      }
    });
    h+='</div>';
  }
  body.innerHTML=h;
}
async function vendorAdd(){
  const ne=document.getElementById('vendor-new-name'); const name=(ne.value||'').trim();
  const note=(document.getElementById('vendor-new-note').value||'').trim();
  if(!name){ showToast('벤더명을 입력하세요'); return; }
  if(vendorList.some(v=>v.name===name)){ showToast('이미 등록된 벤더입니다'); return; }
  vendorList.push({id:'ven-'+Date.now(), name, note});
  await saveDeviceData();
  renderModelReg();
  showToast('벤더 추가됨');
}
async function vendorDelete(i){
  const v=vendorList[i]; if(!v) return;
  if(!confirm('"'+v.name+'" 벤더를 삭제하시겠습니까?')) return;
  vendorList.splice(i,1);
  familyList=familyList.filter(f=>f.vendor!==v.name);
  if(_venEditIdx===i) _venEditIdx=-1;
  if(_venSelIdx===i){ _venSelIdx=-1; _famSel=''; } else if(_venSelIdx>i) _venSelIdx--;
  await saveDeviceData();
  renderModelReg();
  showToast('삭제됨');
}
function vendorEditStart(i){ _venEditIdx=i; renderModelReg(); setTimeout(()=>{ const e=document.getElementById('ven-edit-name'); if(e){ e.focus(); e.select(); } },20); }
function vendorEditCancel(){ _venEditIdx=-1; renderModelReg(); }
async function vendorEditSave(i){
  const v=vendorList[i]; if(!v) return;
  const name=(document.getElementById('ven-edit-name').value||'').trim();
  const note=(document.getElementById('ven-edit-note').value||'').trim();
  if(!name){ showToast('벤더명을 입력하세요'); return; }
  if(vendorList.some((x,j)=>j!==i&&x.name===name)){ showToast('이미 등록된 벤더입니다'); return; }
  const old=v.name; v.name=name; v.note=note;
  if(old!==name){ deviceList.forEach(d=>{ if(d.vendor===old) d.vendor=name; }); modelList.forEach(m=>{ if(m.vendor===old) m.vendor=name; }); familyList.forEach(f=>{ if(f.vendor===old) f.vendor=name; }); }
  _venEditIdx=-1;
  await saveDeviceData();
  renderModelReg();
  showToast('수정됨');
}

// ── Model 등록 (모델명 + 벤더) ──
function renderModelReg(){ _modRegEnsureDefault(); return _renderModelReg_v3(); }   // 머지: Vendor→제품군→Model 3단 페이지
function _modRegEnsureDefault(){
  if(_modRegInit) return; if(!vendorList||!vendorList.length) return; _modRegInit=true;
  const vi=vendorList.findIndex(function(v){ return /ubiquoss/i.test(String((v&&v.name)||'')); }); if(vi<0) return;
  _venSelIdx=vi; const vn=vendorList[vi].name;
  const fam=(familyList||[]).find(function(f){ return f.vendor===vn && /^\s*l2\s*$/i.test(String(f.name||'')); });
  if(!fam) return; _famSel=fam.name; _grpSel='__UNG__';   // 그룹 미지정(기존 모델)을 기본 표시
  const md=(modelList||[]).find(function(x){ return x.vendor===vn && x.family===fam.name && /e5924rl/i.test(String(x.name||'')); });
  if(md){ _modSel=md.id; _modMode='view'; }
}function vendorSelect(i){ _venSelIdx=i; _venEditIdx=-1; _famEditId=''; _modEditIdx=-1; _famSel=''; _modSel=''; _grpSel=''; _grpEditId=''; renderModelReg(); }
function familySelect(name){ _famSel=name; _famEditId=''; _modEditIdx=-1; _modSel=''; _grpSel=''; _grpEditId=''; renderModelReg(); }
function groupSelect(name){ _grpSel=name; _grpEditId=''; _modEditIdx=-1; _modSel=''; renderModelReg(); }
async function groupAdd(){
  const selV=(_venSelIdx>=0&&vendorList[_venSelIdx])?vendorList[_venSelIdx]:null;
  if(!selV){ showToast('먼저 벤더를 선택하세요'); return; }
  if(!_famSel||_famSel==='__UN__'){ showToast('먼저 제품군을 선택하세요'); return; }
  const ne=document.getElementById('group-new-name'); const name=((ne&&ne.value)||'').trim();
  if(!name){ showToast('모델그룹명을 입력하세요'); return; }
  if(groupList.some(g=>g.vendor===selV.name&&g.family===_famSel&&g.name===name)){ showToast('이미 등록된 모델그룹입니다'); return; }
  groupList.push({id:'grp-'+Date.now(), name, vendor:selV.name, family:_famSel});
  _grpSel=name; await saveDeviceData(); renderModelReg(); showToast('모델그룹 추가됨');
}
function groupEditStart(id){ _grpEditId=id; renderModelReg(); setTimeout(function(){ const e=document.getElementById('grp-edit-name'); if(e){ e.focus(); e.select(); } },20); }
function groupEditCancel(){ _grpEditId=''; renderModelReg(); }
async function groupEditSave(id){
  const g=groupList.find(x=>x.id===id); if(!g) return;
  const name=(document.getElementById('grp-edit-name').value||'').trim();
  if(!name){ showToast('모델그룹명을 입력하세요'); return; }
  if(groupList.some(x=>x.id!==id&&x.vendor===g.vendor&&x.family===g.family&&x.name===name)){ showToast('이미 등록된 모델그룹입니다'); return; }
  const old=g.name; g.name=name;
  if(old!==name){ modelList.forEach(m=>{ if(m.vendor===g.vendor&&m.family===g.family&&m.group===old) m.group=name; }); if(_grpSel===old) _grpSel=name; }
  _grpEditId=''; await saveDeviceData(); renderModelReg(); showToast('수정됨');
}
async function groupDelete(id){
  const g=groupList.find(x=>x.id===id); if(!g) return;
  if(!confirm('"'+g.name+'" 모델그룹을 삭제하시겠습니까? (소속 모델은 (미지정)으로 남습니다)')) return;
  groupList=groupList.filter(x=>x.id!==id);
  if(_grpSel===g.name) _grpSel='';
  await saveDeviceData(); renderModelReg(); showToast('삭제됨');
}
async function familyAdd(){
  const selV=(_venSelIdx>=0&&vendorList[_venSelIdx])?vendorList[_venSelIdx]:null;
  if(!selV){ showToast('먼저 벤더를 선택하세요'); return; }
  const ne=document.getElementById('family-new-name'); const name=((ne&&ne.value)||'').trim();
  if(!name){ showToast('제품군명을 입력하세요'); return; }
  if(familyList.some(f=>f.vendor===selV.name&&f.name===name)){ showToast('이미 등록된 제품군입니다'); return; }
  familyList.push({id:'fam-'+Date.now(), name, vendor:selV.name});
  _famSel=name;
  await saveDeviceData();
  renderModelReg();
  showToast('제품군 추가됨');
}
function familyEditStart(id){ _famEditId=id; renderModelReg(); setTimeout(()=>{ const e=document.getElementById('fam-edit-name'); if(e){ e.focus(); e.select(); } },20); }
function familyEditCancel(){ _famEditId=''; renderModelReg(); }
async function familyEditSave(id){
  const f=familyList.find(x=>x.id===id); if(!f) return;
  const name=(document.getElementById('fam-edit-name').value||'').trim();
  if(!name){ showToast('제품군명을 입력하세요'); return; }
  if(familyList.some(x=>x.id!==id&&x.vendor===f.vendor&&x.name===name)){ showToast('이미 등록된 제품군입니다'); return; }
  const old=f.name; f.name=name;
  if(old!==name){ modelList.forEach(m=>{ if(m.vendor===f.vendor&&m.family===old) m.family=name; }); if(_famSel===old) _famSel=name; }
  _famEditId='';
  await saveDeviceData();
  renderModelReg();
  showToast('수정됨');
}
async function familyDelete(id){
  const f=familyList.find(x=>x.id===id); if(!f) return;
  if(!confirm('"'+f.name+'" 제품군을 삭제하시겠습니까? (소속 모델은 (미지정)으로 남습니다)')) return;
  familyList=familyList.filter(x=>x.id!==id);
  if(_famSel===f.name) _famSel='';
  await saveDeviceData();
  renderModelReg();
  showToast('삭제됨');
}
function _modelRows(rows,fOptsFor,vOptsFor,gOptsFor){
  if(!rows.length) return '<div style="padding:36px;text-align:center;color:var(--text3);border:2px dashed var(--border);border-radius:12px;"><i class="ti ti-device-desktop" style="font-size:32px;opacity:0.25;display:block;margin-bottom:10px;"></i>등록된 모델이 없습니다.</div>';
  rows=rows.slice().sort(function(a,b){ return String(a.name||'').localeCompare(String(b.name||''),undefined,{numeric:true,sensitivity:'base'}); });   // 이름 자연정렬(E3010<E4020<E5010<ES…)
  let h='<div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;background:#fff;">';
  rows.forEach((m,ri)=>{
    const i=modelList.indexOf(m);
    const cnt=deviceList.filter(d=>d.name===m.name).length;
    if(_modEditIdx===i){
      h+='<div style="display:flex;align-items:center;gap:8px;padding:8px 14px;border-top:'+(ri?'1px solid #f0f0f0':'none')+';background:#f4f7fd;flex-wrap:wrap;"><input id="model-edit-name" value="'+(m.name||'').replace(/"/g,'&quot;')+'" onkeydown="if(event.key===\'Enter\')modelEditSave('+i+')" style="flex:1;min-width:120px;font-size:13px;padding:6px 10px;border:1.5px solid var(--blue);border-radius:6px;outline:none;"><select id="model-edit-vendor" style="width:140px;font-size:12px;padding:6px 8px;border:1.5px solid var(--border);border-radius:6px;outline:none;">'+vOptsFor(m.vendor||'')+'</select><select id="model-edit-family" style="width:150px;font-size:12px;padding:6px 8px;border:1.5px solid var(--border);border-radius:6px;outline:none;">'+fOptsFor(m.vendor||'',m.family||'')+'</select><select id="model-edit-group" title="모델그룹" style="width:130px;font-size:12px;padding:6px 8px;border:1.5px solid var(--border);border-radius:6px;outline:none;">'+(gOptsFor?gOptsFor(m.vendor||'',m.family||'',m.group||''):'')+'</select><input id="model-edit-ip" value="'+(m.ip||'').replace(/"/g,'&quot;')+'" placeholder="IP 주소" style="width:118px;font-size:12px;padding:6px 8px;border:1.5px solid var(--border);border-radius:6px;outline:none;"><button onclick="modelEditSave('+i+')" style="font-size:12px;padding:6px 12px;border-radius:6px;border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:700;">저장</button><button onclick="modelEditCancel()" style="font-size:12px;padding:6px 9px;border-radius:6px;border:1px solid var(--border);background:#fff;color:var(--text3);cursor:pointer;">취소</button></div>';
    } else {
      const _ssel=(_modSel===m.id); const _act=(m.active!==false);
      const _ifS=(m.subscriber_ifs||[]).length; const _ifU=(m.uplink_ifs||[]).length;
      h+='<div onclick="modSelect(\''+m.id+'\')" title="클릭 → 오른쪽에 슬롯·인터페이스 편집" style="display:flex;align-items:center;gap:8px;padding:11px 16px;cursor:pointer;border-top:'+(ri?'1px solid #f0f0f0':'none')+';border-left:3px solid '+(_ssel?'var(--blue)':'transparent')+';background:'+(_ssel?'rgba(45,111,212,0.08)':'#fff')+';opacity:'+(_act?'1':'0.5')+';"><i class="ti ti-device-desktop" style="color:var(--blue);font-size:16px;flex-shrink:0;"></i><span style="font-size:14px;font-weight:600;color:var(--text);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+m.name+'</span>'+(m.ip?('<span title="관리 IP" style="font-size:10px;font-weight:700;color:#0784b5;background:rgba(7,132,181,0.1);border-radius:8px;padding:1px 7px;flex-shrink:0;font-family:ui-monospace,monospace;">'+String(m.ip).replace(/</g,'&lt;')+'</span>'):'')+'<button onclick="event.stopPropagation();modelToggleActive('+i+')" title="활성/비활성 — 비활성하면 Step 모델그룹 목록에서 숨김" style="font-size:10px;font-weight:700;padding:3px 10px;border-radius:11px;border:1px solid '+(_act?'rgba(0,168,114,0.4)':'rgba(229,62,90,0.35)')+';background:'+(_act?'rgba(0,168,114,0.1)':'rgba(229,62,90,0.07)')+';color:'+(_act?'#00875a':'#c0414f')+';cursor:pointer;flex-shrink:0;white-space:nowrap;">'+(_act?'● 활성':'○ 비활성')+'</button><button onclick="event.stopPropagation();modOpen(\''+m.id+'\')" title="이 모델의 슬롯·인터페이스 추가" style="font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:6px;border:1px solid var(--blue);background:#fff;color:var(--blue);cursor:pointer;white-space:nowrap;flex-shrink:0;"><i class="ti ti-plus"></i> 인터페이스</button>'+(_ifS?'<span title="가입자 인터페이스" style="font-size:10px;font-weight:700;color:#00875a;background:rgba(0,168,114,0.12);border-radius:8px;padding:1px 7px;flex-shrink:0;">가입자 '+_ifS+'</span>':'')+(_ifU?'<span title="업링크 인터페이스" style="font-size:10px;font-weight:700;color:#2d6fd4;background:rgba(45,111,212,0.12);border-radius:8px;padding:1px 7px;flex-shrink:0;">업링크 '+_ifU+'</span>':'')+'<span style="font-size:11px;color:var(--text3);flex-shrink:0;">장비 '+cnt+'</span><i class="ti ti-edit" onclick="event.stopPropagation();modelEditStart('+i+')" title="수정" style="color:var(--text3);cursor:pointer;font-size:15px;flex-shrink:0;"></i><i class="ti ti-trash" onclick="event.stopPropagation();modelDelete('+i+')" title="삭제" style="color:var(--text3);cursor:pointer;font-size:15px;flex-shrink:0;"></i></div>';
    }
  });
  h+='</div>';
  return h;
}
// ── 모델 하드웨어(슬롯·가입자/업링크 인터페이스) — 모델 클릭 시 오른쪽 4번째 컬럼 ──
function _curMod(){ return modelList.find(x=>x.id===_modSel); }
function modSelect(id){ _modSel=(_modSel===id?'':id); _modMode='view'; _modEditIdx=-1; renderModelReg(); }
function modelToggleActive(i){ const m=modelList[i]; if(!m)return; m.active=(m.active===false); if(typeof saveDeviceData==='function')saveDeviceData(); renderModelReg(); if(typeof showToast==='function')showToast('"'+(m.name||'')+'" '+(m.active===false?'비활성(Step 숨김)':'활성')); }
function modOpen(id){ _modSel=id; _modMode='edit'; _modEditIdx=-1; renderModelReg(); }
function modSetMode(k){ _modMode=k; renderModelReg(); }
async function modIfAdd(g){ const m=_curMod(); if(!m) return; const arr=(g==='up')?(m.uplink_ifs=m.uplink_ifs||[]):(m.subscriber_ifs=m.subscriber_ifs||[]); const pre=((document.getElementById('mod-if-pre-'+g)||{}).value||'').trim(); const n=((document.getElementById('mod-if-name-'+g)||{}).value||'').trim(); const sp=((document.getElementById('mod-if-speed-'+g)||{}).value||''); if(!n){ showToast('포트명을 입력하세요'); return; } const nm=pre+n; if(arr.some(p=>p.name===nm)){ showToast('이미 있는 포트명'); return; } arr.push({name:nm,type:'',speed:sp}); await saveDeviceData(); renderModelReg(); }
async function modIfRange(g){ const m=_curMod(); if(!m) return; const arr=(g==='up')?(m.uplink_ifs=m.uplink_ifs||[]):(m.subscriber_ifs=m.subscriber_ifs||[]); const pre=((document.getElementById('mod-rg-pre-'+g)||{}).value||''); const s=parseInt((document.getElementById('mod-rg-s-'+g)||{}).value,10); const e=parseInt((document.getElementById('mod-rg-e-'+g)||{}).value,10); const sp=((document.getElementById('mod-if-speed-'+g)||{}).value||''); if(isNaN(s)||isNaN(e)||e<s){ showToast('범위 확인 (시작 ≤ 끝)'); return; } if(e-s>256){ showToast('한 번에 256개까지'); return; } let added=0; for(let i=s;i<=e;i++){ const nm=pre+i; if(!arr.some(p=>p.name===nm)){ arr.push({name:nm,type:'',speed:sp}); added++; } } await saveDeviceData(); renderModelReg(); showToast(added+'개 포트 추가'); }
async function modIfRemove(g,idx){ const m=_curMod(); if(!m) return; const arr=(g==='up')?m.uplink_ifs:m.subscriber_ifs; if(!arr) return; arr.splice(idx,1); await saveDeviceData(); renderModelReg(); }
async function modIfClear(g){ const m=_curMod(); if(!m) return; const arr=(g==='up')?m.uplink_ifs:m.subscriber_ifs; if(!arr||!arr.length) return; if(!confirm((g==='up'?'업링크':'가입자')+' 포트를 모두 지울까요?')) return; arr.length=0; await saveDeviceData(); renderModelReg(); }
async function modSlotAdd(){ const m=_curMod(); if(!m) return; const slot=((document.getElementById('mod-slot-num')||{}).value||'').trim(); const pre=((document.getElementById('mod-slot-pre')||{}).value||'').trim(); const cardId=((document.getElementById('mod-slot-card')||{}).value||''); const card=(typeof cardList!=='undefined'?cardList:[]).find(c=>c.id===cardId); if(!slot){ showToast('슬롯 번호를 입력하세요'); return; } if(!card){ showToast('라인카드를 선택하세요'); return; } m.slots=m.slots||[]; if(m.slots.some(s=>String(s.slot)===slot)){ showToast('이미 있는 슬롯'); return; } m.slots.push({slot:slot,card:card.name,cardId:card.id}); m.subscriber_ifs=m.subscriber_ifs||[]; let port=1,added=0; (card.groups||[]).forEach(grp=>{ for(let k=0;k<(+grp.count||0);k++){ const nm=pre+slot+'/'+port; if(!m.subscriber_ifs.some(x=>x.name===nm)){ m.subscriber_ifs.push({name:nm,type:'',speed:grp.speed}); added++; } port++; } }); await saveDeviceData(); renderModelReg(); showToast('슬롯 '+slot+' = '+card.name+' → 가입자 '+added+'포트'); }
async function modSlotRemove(idx){ const m=_curMod(); if(!m) return; if(!m.slots) return; m.slots.splice(idx,1); await saveDeviceData(); renderModelReg(); }
function _modelDetailPane(m){
  const edit=(_modMode==='edit');
  const sub=m.subscriber_ifs||[]; const up=m.uplink_ifs||[]; const slots=m.slots||[];
  const spOpts=(typeof DEVICE_IF_SPEEDS!=='undefined'?DEVICE_IF_SPEEDS:['10G','1G']).map(s=>'<option'+(s==='10G'?' selected':'')+'>'+s+'</option>').join('');
  const cardOpts='<option value="">(라인카드)</option>'+((typeof cardList!=='undefined'?cardList:[]).map(c=>'<option value="'+c.id+'">'+String(c.name||'').replace(/</g,'&lt;')+'</option>').join(''));
  const chip=function(arr,g,color){ return arr.length?('<div style="display:flex;flex-wrap:wrap;gap:5px;">'+arr.map(function(p,idx){ return '<span style="font-size:11px;font-family:ui-monospace,monospace;padding:3px 8px;border-radius:5px;background:'+color+'14;color:'+color+';border:1px solid '+color+'33;display:inline-flex;align-items:center;gap:5px;">'+String(p.name).replace(/</g,'&lt;')+(p.speed?'<span style="opacity:0.6;">·'+p.speed+'</span>':'')+(edit?'<i class="ti ti-x" onclick="modIfRemove(\''+g+'\','+idx+')" style="cursor:pointer;color:#c44;font-size:11px;"></i>':'')+'</span>'; }).join('')+'</div>'):'<span style="font-size:11px;color:#bbb;">없음</span>'; };
  const ifSect=function(g,label,color){ const arr=(g==='up')?up:sub; return '<div style="margin-top:14px;"><div style="font-size:12px;font-weight:800;color:'+color+';margin-bottom:7px;display:flex;align-items:center;gap:6px;"><i class="ti ti-plug"></i> '+label+' <span style="color:var(--text3);font-weight:600;font-size:11px;">'+arr.length+'개</span>'+(edit?'<span style="flex:1;"></span><span onclick="modIfClear(\''+g+'\')" style="font-size:10px;color:var(--text3);cursor:pointer;">전체삭제</span>':'')+'</div>'
    +(edit?('<div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin-bottom:7px;"><input id="mod-if-pre-'+g+'" placeholder="te" title="접두어" style="width:42px;font-size:12px;padding:5px 6px;border:1px solid var(--border);border-radius:5px;outline:none;"><input id="mod-if-name-'+g+'" placeholder="0/1" onkeydown="if(event.key===\'Enter\')modIfAdd(\''+g+'\')" style="width:74px;font-size:12px;padding:5px 7px;border:1px solid var(--border);border-radius:5px;outline:none;"><select id="mod-if-speed-'+g+'" style="width:66px;font-size:12px;padding:5px 5px;border:1px solid var(--border);border-radius:5px;outline:none;">'+spOpts+'</select><button onclick="modIfAdd(\''+g+'\')" style="font-size:11.5px;padding:5px 10px;border-radius:6px;border:1px solid var(--blue);background:#fff;color:var(--blue);cursor:pointer;font-weight:600;">+ 추가</button></div>'
    +'<div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin-bottom:8px;font-size:11px;color:var(--text3);">범위 <input id="mod-rg-pre-'+g+'" placeholder="te0/" style="width:54px;font-size:12px;padding:4px 5px;border:1px solid var(--border);border-radius:5px;outline:none;"><input id="mod-rg-s-'+g+'" type="number" placeholder="1" style="width:42px;font-size:12px;padding:4px 4px;border:1px solid var(--border);border-radius:5px;outline:none;">~<input id="mod-rg-e-'+g+'" type="number" placeholder="24" style="width:42px;font-size:12px;padding:4px 4px;border:1px solid var(--border);border-radius:5px;outline:none;"><button onclick="modIfRange(\''+g+'\')" style="font-size:11px;padding:5px 9px;border-radius:5px;border:1px solid var(--green);background:#fff;color:var(--green);cursor:pointer;font-weight:600;">범위 추가</button></div>'):'')
    +chip(arr,g,color)+'</div>'; };
  const slotChips=slots.length?('<div style="display:flex;flex-wrap:wrap;gap:5px;">'+slots.map(function(s,idx){ return '<span style="font-size:11px;padding:4px 9px;border-radius:6px;background:#7c3aed14;color:#7c3aed;border:1px solid #7c3aed33;display:inline-flex;align-items:center;gap:6px;"><b>슬롯 '+String(s.slot).replace(/</g,'&lt;')+'</b> · '+String(s.card||'').replace(/</g,'&lt;')+(edit?'<i class="ti ti-x" onclick="modSlotRemove('+idx+')" style="cursor:pointer;color:#c44;font-size:11px;"></i>':'')+'</span>'; }).join('')+'</div>'):'<span style="font-size:11px;color:#bbb;">등록된 슬롯이 없습니다</span>';
  const slotSect='<div><div style="font-size:12px;font-weight:800;color:#7c3aed;margin-bottom:7px;display:flex;align-items:center;gap:6px;"><i class="ti ti-layout-grid"></i> 슬롯 (라인카드) <span style="color:var(--text3);font-weight:600;font-size:11px;">'+slots.length+'개</span></div>'
    +(edit?('<div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin-bottom:7px;">접두어<input id="mod-slot-pre" placeholder="te" style="width:40px;font-size:12px;padding:5px 6px;border:1px solid var(--border);border-radius:5px;outline:none;">슬롯<input id="mod-slot-num" placeholder="0" style="width:42px;font-size:12px;padding:5px 6px;border:1px solid var(--border);border-radius:5px;outline:none;"><select id="mod-slot-card" style="max-width:170px;font-size:12px;padding:5px 6px;border:1px solid var(--border);border-radius:5px;outline:none;">'+cardOpts+'</select><button onclick="modSlotAdd()" style="font-size:11.5px;padding:5px 11px;border-radius:6px;border:1px solid #7c3aed;background:#fff;color:#7c3aed;cursor:pointer;font-weight:600;">슬롯 추가</button></div>'):'')+slotChips+'</div>';
  const toggle='<div style="display:inline-flex;border:1px solid var(--border);border-radius:7px;overflow:hidden;margin-right:6px;">'
    +'<span onclick="modSetMode(\'view\')" style="font-size:11px;font-weight:700;padding:4px 11px;cursor:pointer;background:'+(edit?'#fff':'var(--blue)')+';color:'+(edit?'var(--text3)':'#fff')+';">보기</span>'
    +'<span onclick="modSetMode(\'edit\')" style="font-size:11px;font-weight:700;padding:4px 11px;cursor:pointer;background:'+(edit?'var(--blue)':'#fff')+';color:'+(edit?'#fff':'var(--text3)')+';">편집</span></div>';
  return '<div style="flex:1.4;min-width:320px;border:1px solid var(--border);border-radius:12px;padding:16px 18px;background:#fff;">'
    +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;"><i class="ti ti-device-desktop" style="color:var(--blue);font-size:18px;"></i><span style="font-size:16px;font-weight:800;color:var(--text);">'+String(m.name||'').replace(/</g,'&lt;')+'</span><span style="font-size:11px;color:var(--text3);">'+String(m.vendor||'')+(m.family?(' · '+m.family):'')+'</span><span style="flex:1;"></span>'+toggle+'<i class="ti ti-x" onclick="modSelect(\''+m.id+'\')" title="닫기" style="cursor:pointer;color:var(--text3);font-size:18px;"></i></div>'
    +'<div style="font-size:11.5px;color:var(--text3);margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--border);">'+(edit?'이 모델의 하드웨어(슬롯·포트)를 추가·편집합니다.':'이 모델에 등록된 슬롯·인터페이스입니다. (추가/편집: [편집] 또는 행의 + 인터페이스)')+'</div>'
    +slotSect+ifSect('sub','가입자 인터페이스 (Access/PON)','#00a872')+ifSect('up','업링크 인터페이스 (Uplink)','#2d6fd4')+'</div>';
}
function _renderModelReg_v3(){
  const body=document.getElementById('model-body'); if(!body) return;
  const knownVendors=vendorList.map(v=>v.name);
  const vOptsFor=cur=>'<option value="">(벤더 선택)</option>'+vendorList.map(v=>'<option value="'+v.name+'" '+(cur===v.name?'selected':'')+'>'+v.name+'</option>').join('');
  const famsOf=vn=>familyList.filter(f=>f.vendor===vn);
  const knownFamsOf=vn=>famsOf(vn).map(f=>f.name);
  const fOptsFor=(vn,cur)=>'<option value="">(미지정)</option>'+famsOf(vn).map(f=>'<option value="'+f.name+'" '+(cur===f.name?'selected':'')+'>'+f.name+'</option>').join('');
  const modelsFor=(vn,fam)=>{
    if(vn===null) return modelList.filter(m=>!m.vendor||knownVendors.indexOf(m.vendor)<0);
    if(fam==='__UN__') return modelList.filter(m=>m.vendor===vn&&(!m.family||knownFamsOf(vn).indexOf(m.family)<0));
    if(fam==null||fam==='') return modelList.filter(m=>m.vendor===vn);
    return modelList.filter(m=>m.vendor===vn&&m.family===fam);
  };
  const groupsOf=(vn,fam)=>groupList.filter(g=>g.vendor===vn&&g.family===fam);
  const knownGrpsOf=(vn,fam)=>groupsOf(vn,fam).map(g=>g.name);
  const modelsForG=(vn,fam,grp)=>{ const base=modelsFor(vn,fam); if(grp==null||grp==='') return base; if(grp==='__UNG__') return base.filter(m=>!m.group||knownGrpsOf(vn,fam).indexOf(m.group)<0); return base.filter(m=>m.group===grp); };
  const gOptsFor=(vn,fam,cur)=>'<option value="">(미지정 그룹)</option>'+groupsOf(vn,fam).map(g=>'<option value="'+g.name+'" '+(cur===g.name?'selected':'')+'>'+g.name+'</option>').join('');
  const selV=(_venSelIdx>=0&&vendorList[_venSelIdx])?vendorList[_venSelIdx]:null;
  const vnSel=selV?selV.name:(_venSelIdx===-2?null:undefined);
  let h='<div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;"><i class="ti ti-versions" style="font-size:22px;color:var(--blue);"></i><div><div style="font-size:18px;font-weight:800;color:var(--text);">Model / Vendor Registration</div><div style="font-size:12px;color:var(--text3);">벤더 → 제품군 → 모델그룹 → 모델 순으로 선택·등록하세요 (그룹: TC 1개로 여러 모델 실행 · 모델별 IP 관리)</div></div></div>';
  h+='<div style="display:flex;gap:16px;align-items:flex-start;">';
  // ── Col1: 벤더 ──
  h+='<div style="width:250px;flex:none;">';
  h+='<div style="font-size:12px;font-weight:700;color:var(--text3);margin-bottom:8px;">벤더</div>';
  h+='<div style="display:flex;gap:6px;margin-bottom:12px;"><input id="vendor-new-name" placeholder="벤더명" onkeydown="if(event.key===\'Enter\')vendorAdd()" style="flex:1;min-width:0;font-size:13px;padding:8px 9px;border:1.5px solid var(--border);border-radius:7px;outline:none;"><input id="vendor-new-note" placeholder="비고" style="width:50px;font-size:13px;padding:8px 6px;border:1.5px solid var(--border);border-radius:7px;outline:none;"><button onclick="vendorAdd()" title="벤더 추가" style="font-size:13px;padding:8px 11px;border-radius:7px;border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:700;"><i class="ti ti-plus"></i></button></div>';
  h+='<div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;background:#fff;">';
  if(!vendorList.length){ h+='<div style="padding:24px;text-align:center;color:var(--text3);font-size:12px;">벤더 없음</div>'; }
  vendorList.forEach((v,i)=>{
    if(_venEditIdx===i){
      h+='<div style="display:flex;align-items:center;gap:6px;padding:8px 10px;border-top:'+(i?'1px solid #f0f0f0':'none')+';background:#f4f7fd;"><input id="ven-edit-name" value="'+(v.name||'').replace(/"/g,'&quot;')+'" onkeydown="if(event.key===\'Enter\')vendorEditSave('+i+')" style="flex:1;min-width:0;font-size:13px;padding:5px 8px;border:1.5px solid var(--blue);border-radius:6px;outline:none;"><input id="ven-edit-note" value="'+(v.note||'').replace(/"/g,'&quot;')+'" placeholder="비고" style="width:46px;font-size:13px;padding:5px 6px;border:1.5px solid var(--border);border-radius:6px;outline:none;"><button onclick="vendorEditSave('+i+')" style="font-size:11px;padding:5px 8px;border-radius:6px;border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:700;">저장</button><button onclick="vendorEditCancel()" style="font-size:11px;padding:5px 6px;border-radius:6px;border:1px solid var(--border);background:#fff;color:var(--text3);cursor:pointer;">취소</button></div>';
    } else {
      const sel=(_venSelIdx===i); const cnt=famsOf(v.name).length;
      h+='<div onclick="vendorSelect('+i+')" style="display:flex;align-items:center;gap:7px;padding:9px 11px;cursor:pointer;border-top:'+(i?'1px solid #f0f0f0':'none')+';border-left:3px solid '+(sel?'var(--blue)':'transparent')+';background:'+(sel?'rgba(45,111,212,0.08)':'#fff')+';"><i class="ti ti-building" style="color:var(--blue);font-size:15px;flex-shrink:0;"></i><span style="font-size:13px;font-weight:600;flex:1;color:var(--text);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+v.name+(v.note?'<span style="font-size:11px;color:var(--text3);font-weight:400;margin-left:5px;">'+v.note+'</span>':'')+'</span><span style="font-size:10px;color:var(--text3);flex-shrink:0;">제품군 '+cnt+'</span><i class="ti ti-edit" onclick="event.stopPropagation();vendorEditStart('+i+')" title="수정" style="color:var(--text3);cursor:pointer;font-size:14px;flex-shrink:0;"></i><i class="ti ti-trash" onclick="event.stopPropagation();vendorDelete('+i+')" title="삭제" style="color:var(--text3);cursor:pointer;font-size:14px;flex-shrink:0;"></i></div>';
    }
  });
  const unV=modelsFor(null).length;
  if(unV||_venSelIdx===-2){ const s=(_venSelIdx===-2);
    h+='<div onclick="vendorSelect(-2)" style="display:flex;align-items:center;gap:7px;padding:9px 11px;cursor:pointer;border-top:1px solid #f0f0f0;border-left:3px solid '+(s?'var(--blue)':'transparent')+';background:'+(s?'rgba(45,111,212,0.08)':'#fafafa')+';"><i class="ti ti-help-circle" style="color:var(--text3);font-size:15px;"></i><span style="font-size:13px;color:var(--text3);flex:1;">(미지정 벤더)</span><span style="font-size:10px;color:var(--text3);">모델 '+unV+'</span></div>';
  }
  h+='</div></div>';
  // ── Col2: 제품군 (실제 벤더 선택 시) ──
  if(_venSelIdx>=0&&selV){
    const fams=famsOf(selV.name);
    h+='<div style="width:230px;flex:none;">';
    h+='<div style="font-size:12px;font-weight:700;color:var(--text3);margin-bottom:8px;">제품군 · '+selV.name+'</div>';
    h+='<div style="display:flex;gap:6px;margin-bottom:12px;"><input id="family-new-name" placeholder="제품군명 (예: U9000 시리즈)" onkeydown="if(event.key===\'Enter\')familyAdd()" style="flex:1;min-width:0;font-size:13px;padding:8px 9px;border:1.5px solid var(--border);border-radius:7px;outline:none;"><button onclick="familyAdd()" title="제품군 추가" style="font-size:13px;padding:8px 11px;border-radius:7px;border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:700;"><i class="ti ti-plus"></i></button></div>';
    h+='<div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;background:#fff;">';
    if(!fams.length){ h+='<div style="padding:22px;text-align:center;color:var(--text3);font-size:12px;">제품군 없음</div>'; }
    fams.forEach((f,fi)=>{
      if(_famEditId===f.id){
        h+='<div style="display:flex;align-items:center;gap:6px;padding:8px 10px;border-top:'+(fi?'1px solid #f0f0f0':'none')+';background:#f4f7fd;"><input id="fam-edit-name" value="'+(f.name||'').replace(/"/g,'&quot;')+'" onkeydown="if(event.key===\'Enter\')familyEditSave(\''+f.id+'\')" style="flex:1;min-width:0;font-size:13px;padding:5px 8px;border:1.5px solid var(--blue);border-radius:6px;outline:none;"><button onclick="familyEditSave(\''+f.id+'\')" style="font-size:11px;padding:5px 8px;border-radius:6px;border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:700;">저장</button><button onclick="familyEditCancel()" style="font-size:11px;padding:5px 6px;border-radius:6px;border:1px solid var(--border);background:#fff;color:var(--text3);cursor:pointer;">취소</button></div>';
      } else {
        const s=(_famSel===f.name); const cnt=modelsFor(selV.name,f.name).length;
        h+='<div onclick="familySelect(\''+f.name.replace(/\\/g,"\\\\").replace(/'/g,"\\'")+'\')" style="display:flex;align-items:center;gap:7px;padding:9px 11px;cursor:pointer;border-top:'+(fi?'1px solid #f0f0f0':'none')+';border-left:3px solid '+(s?'var(--blue)':'transparent')+';background:'+(s?'rgba(45,111,212,0.08)':'#fff')+';"><i class="ti ti-layers-subtract" style="color:#7c3aed;font-size:14px;flex-shrink:0;"></i><span style="font-size:13px;font-weight:600;flex:1;color:var(--text);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+f.name+'</span><span style="font-size:10px;color:var(--text3);">모델 '+cnt+'</span><i class="ti ti-edit" onclick="event.stopPropagation();familyEditStart(\''+f.id+'\')" title="수정" style="color:var(--text3);cursor:pointer;font-size:14px;"></i><i class="ti ti-trash" onclick="event.stopPropagation();familyDelete(\''+f.id+'\')" title="삭제" style="color:var(--text3);cursor:pointer;font-size:14px;"></i></div>';
      }
    });
    const unF=modelsFor(selV.name,'__UN__').length;
    if(unF||_famSel==='__UN__'){ const s=(_famSel==='__UN__');
      h+='<div onclick="familySelect(\'__UN__\')" style="display:flex;align-items:center;gap:7px;padding:9px 11px;cursor:pointer;border-top:1px solid #f0f0f0;border-left:3px solid '+(s?'var(--blue)':'transparent')+';background:'+(s?'rgba(45,111,212,0.08)':'#fafafa')+';"><i class="ti ti-help-circle" style="color:var(--text3);font-size:14px;"></i><span style="font-size:13px;color:var(--text3);flex:1;">(미지정)</span><span style="font-size:10px;color:var(--text3);">모델 '+unF+'</span></div>';
    }
    h+='</div></div>';
  }
  // ── Col2.5: 모델그룹 (제품군 선택 시) ──
  if(_venSelIdx>=0&&selV&&_famSel&&_famSel!=='__UN__'){
    const grps=groupsOf(selV.name,_famSel);
    h+='<div style="width:210px;flex:none;">';
    h+='<div style="font-size:12px;font-weight:700;color:var(--text3);margin-bottom:8px;">모델그룹 · '+_famSel+'</div>';
    h+='<div style="display:flex;gap:6px;margin-bottom:12px;"><input id="group-new-name" placeholder="모델그룹명 (예: E5000 시리즈)" onkeydown="if(event.key===\'Enter\')groupAdd()" style="flex:1;min-width:0;font-size:13px;padding:8px 9px;border:1.5px solid var(--border);border-radius:7px;outline:none;"><button onclick="groupAdd()" title="모델그룹 추가" style="font-size:13px;padding:8px 11px;border-radius:7px;border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:700;"><i class="ti ti-plus"></i></button></div>';
    h+='<div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;background:#fff;">';
    if(!grps.length){ h+='<div style="padding:18px 12px;text-align:center;color:var(--text3);font-size:11.5px;">그룹 없음 — 아래 <b>(미지정)</b>에서 바로 모델 관리</div>'; }
    grps.forEach((g,gi)=>{
      if(_grpEditId===g.id){
        h+='<div style="display:flex;align-items:center;gap:6px;padding:8px 10px;border-top:'+(gi?'1px solid #f0f0f0':'none')+';background:#f4f7fd;"><input id="grp-edit-name" value="'+(g.name||'').replace(/"/g,'&quot;')+'" onkeydown="if(event.key===\'Enter\')groupEditSave(\''+g.id+'\')" style="flex:1;min-width:0;font-size:13px;padding:5px 8px;border:1.5px solid var(--blue);border-radius:6px;outline:none;"><button onclick="groupEditSave(\''+g.id+'\')" style="font-size:11px;padding:5px 8px;border-radius:6px;border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:700;">저장</button><button onclick="groupEditCancel()" style="font-size:11px;padding:5px 6px;border-radius:6px;border:1px solid var(--border);background:#fff;color:var(--text3);cursor:pointer;">취소</button></div>';
      } else {
        const s=(_grpSel===g.name); const cnt=modelsForG(selV.name,_famSel,g.name).length;
        h+='<div onclick="groupSelect(\''+g.name.replace(/\\/g,"\\\\").replace(/'/g,"\\'")+'\')" style="display:flex;align-items:center;gap:7px;padding:9px 11px;cursor:pointer;border-top:'+(gi?'1px solid #f0f0f0':'none')+';border-left:3px solid '+(s?'var(--blue)':'transparent')+';background:'+(s?'rgba(45,111,212,0.08)':'#fff')+';"><i class="ti ti-stack-2" style="color:#0ea5e9;font-size:14px;flex-shrink:0;"></i><span style="font-size:13px;font-weight:600;flex:1;color:var(--text);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+g.name+'</span><span style="font-size:10px;color:var(--text3);">모델 '+cnt+'</span><i class="ti ti-edit" onclick="event.stopPropagation();groupEditStart(\''+g.id+'\')" title="수정" style="color:var(--text3);cursor:pointer;font-size:14px;"></i><i class="ti ti-trash" onclick="event.stopPropagation();groupDelete(\''+g.id+'\')" title="삭제" style="color:var(--text3);cursor:pointer;font-size:14px;"></i></div>';
      }
    });
    const unG=modelsForG(selV.name,_famSel,'__UNG__').length;
    if(unG||_grpSel==='__UNG__'||!grps.length){ const s=(_grpSel==='__UNG__');
      h+='<div onclick="groupSelect(\'__UNG__\')" style="display:flex;align-items:center;gap:7px;padding:9px 11px;cursor:pointer;border-top:1px solid #f0f0f0;border-left:3px solid '+(s?'var(--blue)':'transparent')+';background:'+(s?'rgba(45,111,212,0.08)':'#fafafa')+';"><i class="ti ti-help-circle" style="color:var(--text3);font-size:14px;"></i><span style="font-size:13px;color:var(--text3);flex:1;">(미지정)</span><span style="font-size:10px;color:var(--text3);">모델 '+unG+'</span></div>';
    }
    h+='</div></div>';
  }
  // ── Col3: 모델 ──
  h+='<div style="flex:1;min-width:0;">';
  if(_venSelIdx===-1){
    h+='<div style="padding:54px 30px;text-align:center;color:var(--text3);border:2px dashed var(--border);border-radius:12px;"><i class="ti ti-arrow-left" style="font-size:30px;opacity:0.25;display:block;margin-bottom:10px;"></i>왼쪽에서 벤더를 선택하세요.</div>';
  } else if(vnSel===null){
    h+='<div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:12px;">(미지정 벤더) 모델</div>';
    h+='<div style="font-size:12px;color:var(--text3);margin-bottom:12px;">벤더가 없거나 삭제된 모델입니다. 각 행을 수정해 벤더를 지정하세요.</div>';
    h+=_modelRows(modelsFor(null),fOptsFor,vOptsFor,gOptsFor);
  } else if(_famSel===''){
    h+='<div style="padding:54px 30px;text-align:center;color:var(--text3);border:2px dashed var(--border);border-radius:12px;"><i class="ti ti-arrow-left" style="font-size:30px;opacity:0.25;display:block;margin-bottom:10px;"></i>제품군을 선택하면<br>그 제품군의 모델을 등록·관리할 수 있습니다.</div>';
  } else if(_famSel!=='__UN__'&&_grpSel===''){
    h+='<div style="padding:54px 30px;text-align:center;color:var(--text3);border:2px dashed var(--border);border-radius:12px;"><i class="ti ti-arrow-left" style="font-size:30px;opacity:0.25;display:block;margin-bottom:10px;"></i>모델그룹을 선택하면<br>그 그룹의 모델을 등록·관리할 수 있습니다.<br><span style="font-size:11px;">그룹이 없으면 <b>(미지정)</b> 선택</span></div>';
  } else {
    const isUn=(_famSel==='__UN__');
    const grpLabel=isUn?'(미지정)':(_grpSel==='__UNG__'?'(미지정 그룹)':_grpSel);
    h+='<div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:12px;">'+selV.name+' · '+(isUn?'(미지정)':(_famSel+' · '+grpLabel))+' 모델</div>';
    if(!isUn&&_grpSel!=='__UNG__'){
      h+='<div style="display:flex;gap:8px;margin-bottom:14px;"><input id="model-new-name" placeholder="모델명 (예: U9024A-10G)" onkeydown="if(event.key===\'Enter\')modelAdd()" style="flex:1;font-size:13px;padding:9px 12px;border:1.5px solid var(--border);border-radius:7px;outline:none;"><button onclick="modelAdd()" style="font-size:13px;padding:9px 18px;border-radius:7px;border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:700;white-space:nowrap;"><i class="ti ti-plus"></i> 추가</button></div>';
    } else {
      h+='<div style="font-size:12px;color:var(--text3);margin-bottom:12px;">'+(isUn?'제품군이 지정되지 않은(또는 삭제된) 모델입니다. 각 행을 수정해 제품군을 지정하세요.':'모델그룹이 지정되지 않은 모델입니다. 각 행 수정에서 그룹을 지정하세요.')+'</div>';
    }
    h+=_modelRows(isUn?modelsFor(selV.name,_famSel):modelsForG(selV.name,_famSel,_grpSel),fOptsFor,vOptsFor,gOptsFor);
  }
  h+='</div>';
  if(_modSel){ const _dm=modelList.find(x=>x.id===_modSel); if(_dm) h+=_modelDetailPane(_dm); }
  h+='</div>';
  body.innerHTML=h;
}async function modelAdd(){
  const ne=document.getElementById('model-new-name'); const name=(ne.value||'').trim();
  const _sv=(_venSelIdx>=0&&vendorList[_venSelIdx])?vendorList[_venSelIdx]:null;
  const vendor=_sv?_sv.name:'';
  const family=(_famSel&&_famSel!=='__UN__')?_famSel:'';
  const group=(_grpSel&&_grpSel!=='__UNG__')?_grpSel:'';
  if(!name){ showToast('모델명을 입력하세요'); return; }
  if(modelList.some(m=>m.name===name)){ showToast('이미 등록된 모델입니다'); return; }
  modelList.push({id:'mod-'+Date.now(), name, vendor, family, group});
  await saveDeviceData();
  renderModelReg();
  showToast('모델 추가됨');
}
function modelEditStart(i){ _modEditIdx=i; renderModelReg(); setTimeout(()=>{ const e=document.getElementById('model-edit-name'); if(e){ e.focus(); e.select(); } },20); }
function modelEditCancel(){ _modEditIdx=-1; renderModelReg(); }
async function modelEditSave(i){
  const m=modelList[i]; if(!m) return;
  const name=(document.getElementById('model-edit-name').value||'').trim();
  const vendor=document.getElementById('model-edit-vendor').value||'';
  const _fe=document.getElementById('model-edit-family'); const family=_fe?(_fe.value||''):(m.family||'');
  const _ge=document.getElementById('model-edit-group'); const group=_ge?(_ge.value||''):(m.group||'');
  const _ie=document.getElementById('model-edit-ip'); const ip=_ie?((_ie.value||'').trim()):(m.ip||'');
  if(!name){ showToast('모델명을 입력하세요'); return; }
  if(modelList.some((x,j)=>j!==i&&x.name===name)){ showToast('이미 등록된 모델입니다'); return; }
  const old=m.name; m.name=name; m.vendor=vendor; m.family=family; m.group=group; m.ip=ip;
  if(old!==name){ deviceList.forEach(d=>{ if(d.name===old) d.name=name; }); }
  _modEditIdx=-1;
  await saveDeviceData();
  renderModelReg();
  showToast('수정됨');
}
async function modelDelete(i){
  const m=modelList[i]; if(!m) return;
  if(!confirm('"'+m.name+'" 모델을 삭제하시겠습니까?')) return;
  modelList.splice(i,1);
  if(_modEditIdx===i) _modEditIdx=-1;
  await saveDeviceData();
  renderModelReg();
  showToast('삭제됨');
}

// ── Line Card 등록 (카드명 + 속도별 포트 구성) ──
function cardCompo(c){ const g=c.groups||[]; const tot=g.reduce((s,x)=>s+(+x.count||0),0); return (g.map(x=>x.speed+'×'+x.count).join(' + ')||'-')+' = '+tot+'P'; }
function renderCardReg(){
  const body=document.getElementById('card-body'); if(!body) return;
  const spOpts=DEVICE_IF_SPEEDS.map(t=>'<option'+(t==='10G'?' selected':'')+'>'+t+'</option>').join('');
  const editCard=_cardEditId?cardList.find(c=>c.id===_cardEditId):null;
  let h='<div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;"><i class="ti ti-cpu" style="font-size:22px;color:var(--blue);"></i><div><div style="font-size:18px;font-weight:800;color:var(--text);">Line Card Registration</div><div style="font-size:12px;color:var(--text3);">라인카드(슬롯에 꽂는 카드) 타입을 정의 — OLT 등록 시 슬롯마다 골라 배치합니다</div></div></div>';
  h+='<div style="border:1px solid var(--border);border-radius:10px;padding:14px 16px;max-width:700px;margin-bottom:18px;background:#fff;">'
    +'<input id="card-new-name" value="'+(editCard?(editCard.name||'').replace(/"/g,'&quot;'):'')+'" placeholder="카드명 (예: 10G-8P, 1G-16P, Combo-A)" style="width:100%;font-size:13px;padding:9px 12px;border:1.5px solid '+(editCard?'var(--blue)':'var(--border)')+';border-radius:7px;outline:none;box-sizing:border-box;margin-bottom:10px;">'
    +'<div style="font-size:11px;color:var(--text3);margin-bottom:5px;">포트 구성 — 속도별 개수 (Combo는 여러 그룹 추가)</div>'
    +'<div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;"><select id="card-grp-speed" style="width:90px;font-size:12px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;outline:none;">'+spOpts+'</select><span style="color:var(--text3);">×</span><input id="card-grp-count" type="number" placeholder="8" onkeydown="if(event.key===\'Enter\')cardAddGroup()" style="width:64px;font-size:12px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;outline:none;"><button onclick="cardAddGroup()" style="font-size:12px;padding:6px 12px;border-radius:6px;border:1px solid var(--blue);background:#fff;color:var(--blue);cursor:pointer;font-weight:600;">+ 그룹</button></div>'
    +'<div id="card-grp-list" style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px;"></div>'
    +(editCard?'<div style="display:flex;gap:8px;"><button onclick="cardAdd()" style="flex:1;font-size:13px;padding:9px;border-radius:7px;border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:700;">수정 저장</button><button onclick="cardEditCancel()" style="font-size:13px;padding:9px 16px;border-radius:7px;border:1px solid var(--border);background:#fff;color:var(--text3);cursor:pointer;">취소</button></div>':'<button onclick="cardAdd()" style="width:100%;font-size:13px;padding:9px;border-radius:7px;border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:700;"><i class="ti ti-plus"></i> 라인카드 추가</button>')
  +'</div>';
  if(!cardList.length){ h+='<div style="padding:40px;text-align:center;color:var(--text3);border:2px dashed var(--border);border-radius:12px;max-width:700px;"><i class="ti ti-cpu" style="font-size:36px;opacity:0.25;display:block;margin-bottom:10px;"></i>등록된 라인카드가 없습니다.</div>'; }
  else {
    h+='<div style="max-width:700px;border:1px solid var(--border);border-radius:10px;overflow:hidden;background:#fff;">';
    cardList.forEach((c,i)=>{
      h+='<div style="display:flex;align-items:center;gap:10px;padding:11px 16px;border-top:'+(i?'1px solid #f0f0f0':'none')+';"><i class="ti ti-cpu" style="color:var(--blue);font-size:16px;"></i><span style="font-size:14px;font-weight:700;color:var(--text);min-width:120px;">'+c.name+'</span><span style="font-size:12px;font-family:monospace;color:var(--text2);flex:1;">'+cardCompo(c)+'</span><i class="ti ti-edit" onclick="cardEditStart('+i+')" title="수정" style="color:var(--text3);cursor:pointer;font-size:15px;" onmouseenter="this.style.color=\'var(--blue)\'" onmouseleave="this.style.color=\'var(--text3)\'"></i><i class="ti ti-trash" onclick="cardDelete('+i+')" title="삭제" style="color:var(--text3);cursor:pointer;font-size:15px;" onmouseenter="this.style.color=\'var(--red)\'" onmouseleave="this.style.color=\'var(--text3)\'"></i></div>';
    });
    h+='</div>';
  }
  body.innerHTML=h;
  cardRenderGroups();
}
function cardRenderGroups(){
  const el=document.getElementById('card-grp-list'); if(!el) return;
  if(!_cardDraftGroups.length){ el.innerHTML='<span style="font-size:11px;color:#bbb;">그룹을 추가하세요 (예: 10G×4, 1G×8)</span>'; return; }
  el.innerHTML=_cardDraftGroups.map((g,i)=>'<span style="font-size:12px;font-family:monospace;padding:3px 9px;border-radius:6px;background:#eef2f7;color:#46506a;display:inline-flex;align-items:center;gap:5px;">'+g.speed+'×'+g.count+'<i class="ti ti-x" onclick="cardRemoveGroup('+i+')" style="cursor:pointer;color:#c44;font-size:12px;"></i></span>').join('');
}
function cardAddGroup(){
  const sp=document.getElementById('card-grp-speed').value||'';
  const ce=document.getElementById('card-grp-count'); const cnt=parseInt(ce.value,10);
  if(isNaN(cnt)||cnt<1){ showToast('개수를 입력하세요'); return; }
  _cardDraftGroups.push({speed:sp,count:cnt}); ce.value=''; ce.focus();
  cardRenderGroups();
}
function cardRemoveGroup(i){ _cardDraftGroups.splice(i,1); cardRenderGroups(); }
async function cardAdd(){
  const name=(document.getElementById('card-new-name').value||'').trim();
  if(!name){ showToast('카드명을 입력하세요'); return; }
  if(!_cardDraftGroups.length){ showToast('포트 구성을 추가하세요'); return; }
  if(cardList.some(c=>c.name===name&&c.id!==_cardEditId)){ showToast('이미 등록된 카드명입니다'); return; }
  if(_cardEditId){
    const c=cardList.find(x=>x.id===_cardEditId);
    if(c){ c.name=name; c.groups=JSON.parse(JSON.stringify(_cardDraftGroups)); }
    _cardEditId=null;
  } else {
    cardList.push({id:'card-'+Date.now(), name, groups:JSON.parse(JSON.stringify(_cardDraftGroups))});
  }
  _cardDraftGroups=[];
  await saveDeviceData();
  renderCardReg();
  showToast('저장됨');
}
function cardEditStart(i){ const c=cardList[i]; if(!c) return; _cardEditId=c.id; _cardDraftGroups=JSON.parse(JSON.stringify(c.groups||[])); renderCardReg(); const b=document.getElementById('card-body'); if(b) b.scrollTop=0; }
function cardEditCancel(){ _cardEditId=null; _cardDraftGroups=[]; renderCardReg(); }
async function cardDelete(i){
  const c=cardList[i]; if(!c) return;
  if(!confirm('"'+c.name+'" 라인카드를 삭제하시겠습니까?')) return;
  cardList.splice(i,1);
  if(_cardEditId===c.id) _cardEditId=null;
  await saveDeviceData();
  renderCardReg();
  showToast('삭제됨');
}

// ══ TC 시험 구성도 (카탈로그 기반: 장비 배치 + IP + 포트 결선) ══
function _tcById(tcid){ return tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); }
function tcTopo2Get(tc){ let t=tc.topo2; if(!t||typeof t!=='object'){ t={nodes:[],links:[]}; } if(!Array.isArray(t.nodes)) t.nodes=[]; if(!Array.isArray(t.links)) t.links=[]; return t; }
async function _tcTopo2Save(tc,t2){ tc.topo2=t2; try{ await saveTCFile(tc); }catch(e){} }
// ── 구성도 사진(붙여넣기/업로드) ──
function _topo2ScaleImg(dataUrl, cb){   // 너무 큰 이미지는 1400px로 축소(파일 비대화 방지)
  try{ var img=new Image();
    img.onload=function(){ var w=img.naturalWidth||img.width, hh=img.naturalHeight||img.height; var MAX=1400;
      if(w>MAX){ hh=Math.round(hh*MAX/w); w=MAX; }
      try{ var cv=document.createElement('canvas'); cv.width=w; cv.height=hh; cv.getContext('2d').drawImage(img,0,0,w,hh);
        var out=cv.toDataURL('image/png'); if(out.length>1600000) out=cv.toDataURL('image/jpeg',0.85); cb(out); }
      catch(e){ cb(dataUrl); } };
    img.onerror=function(){ cb(dataUrl); }; img.src=dataUrl;
  }catch(e){ cb(dataUrl); }
}
function topo2PasteImg(tcid, e){
  try{ var items=((e&&(e.clipboardData||window.clipboardData))||{}).items||[];
    for(var i=0;i<items.length;i++){ if(items[i].type&&items[i].type.indexOf('image')===0){ e.preventDefault();
      var blob=items[i].getAsFile(); if(!blob) continue; var fr=new FileReader();
      fr.onload=function(){ _topo2ScaleImg(fr.result, function(url){ _topo2SetImg(tcid,url); }); }; fr.readAsDataURL(blob); return; } }
    if(typeof showToast==='function')showToast('클립보드에 이미지가 없습니다 (캡처 후 다시 Ctrl+V)');
  }catch(err){}
}
function topo2UploadImg(tcid, inp){
  var f=inp&&inp.files&&inp.files[0]; if(!f) return; var fr=new FileReader();
  fr.onload=function(){ _topo2ScaleImg(fr.result, function(url){ _topo2SetImg(tcid,url); }); }; fr.readAsDataURL(f); try{ inp.value=''; }catch(e){}
}
async function _topo2SetImg(tcid,url){ var tc=_tcById(tcid); if(!tc) return; var t2=tcTopo2Get(tc); t2.bgImage=url; await _tcTopo2Save(tc,t2); tcTopo2Refresh(tcid); if(typeof showToast==='function')showToast('구성도 사진 추가됨'); }
// ── 구성도 사진 복사/붙여넣기 (Ctrl+C/Ctrl+V · 다른 TC Topology 간 이동) ──
function _topo2PngBlob(dataUrl){
  return new Promise(function(res,rej){
    var img=new Image();
    img.onload=function(){ try{ var cv=document.createElement('canvas'); cv.width=img.naturalWidth||img.width; cv.height=img.naturalHeight||img.height; cv.getContext('2d').drawImage(img,0,0); cv.toBlob(function(b){ if(b)res(b); else rej(new Error('toBlob 실패')); },'image/png'); }catch(e){ rej(e); } };
    img.onerror=function(){ rej(new Error('이미지 로드 실패')); };
    img.src=dataUrl;
  });
}
async function topo2CopyImg(tcid){
  var tc=_tcById(tcid); if(!tc) return; var t2=tcTopo2Get(tc);
  if(!t2.bgImage){ if(typeof showToast==='function')showToast('복사할 구성도 사진이 없습니다'); return; }
  // 내부 클립보드(항상 저장): http 환경 등 시스템 클립보드 불가 시 [사진 붙여넣기] 버튼으로 사용
  window._topo2ImgClip=t2.bgImage;
  try{ localStorage.setItem('utop_topo2_imgclip', t2.bgImage); }catch(e){}
  try{
    if(!(navigator.clipboard&&navigator.clipboard.write&&window.ClipboardItem)) throw new Error('clipboard 미지원');
    var png=await _topo2PngBlob(t2.bgImage);
    await navigator.clipboard.write([new ClipboardItem({'image/png':png})]);
    if(typeof showToast==='function')showToast('구성도 사진 복사됨 — 다른 TC의 Topology에서 Ctrl+V 하세요');
  }catch(e){
    if(typeof showToast==='function')showToast('사진 복사됨 — 다른 TC의 Topology에서 [사진 붙여넣기] 버튼을 누르세요');
  }
}
async function topo2PasteImgBtn(tcid){
  // 1) 시스템 클립보드에서 이미지 읽기 (https/localhost)
  try{
    if(navigator.clipboard&&navigator.clipboard.read){
      var items=await navigator.clipboard.read();
      for(var i=0;i<items.length;i++){
        var t=(items[i].types||[]).filter(function(x){return String(x).indexOf('image/')===0;})[0];
        if(t){ var b=await items[i].getType(t); var fr=new FileReader(); fr.onload=function(){ _topo2ScaleImg(fr.result,function(url){ _topo2SetImg(tcid,url); }); }; fr.readAsDataURL(b); return; }
      }
    }
  }catch(e){}
  // 2) 내부 클립보드 폴백 ([사진 복사]로 담아둔 이미지)
  var clip=window._topo2ImgClip; try{ clip=clip||localStorage.getItem('utop_topo2_imgclip'); }catch(e){}
  if(clip){ _topo2ScaleImg(clip,function(url){ _topo2SetImg(tcid,url); }); return; }
  if(typeof showToast==='function')showToast('클립보드에 이미지가 없습니다 — 원본 TC에서 [사진 복사]를 먼저 하세요');
}
async function topo2ClearImg(tcid){ var tc=_tcById(tcid); if(!tc) return; if(!confirm('구성도 사진을 제거할까요?')) return; var t2=tcTopo2Get(tc); delete t2.bgImage; await _tcTopo2Save(tc,t2); tcTopo2Refresh(tcid); }
// 구성도 사진 이동(드래그) / 크기조절(코너 핸들)
var _topo2ImgDrag=null;
function topo2ImgDragStart(e,tcid){ var el=document.getElementById('topo2-img-'+tcid); if(!el) return; e.preventDefault(); _topo2ImgDrag={tcid:tcid,el:el,sx:e.clientX,sy:e.clientY,ox:parseInt(el.style.left)||0,oy:parseInt(el.style.top)||0}; document.addEventListener('mousemove',_topo2ImgMove); document.addEventListener('mouseup',_topo2ImgEnd); }
function _topo2ImgMove(e){ var d=_topo2ImgDrag; if(!d)return; d.el.style.left=Math.max(0,d.ox+(e.clientX-d.sx))+'px'; d.el.style.top=Math.max(0,d.oy+(e.clientY-d.sy))+'px'; }
function _topo2ImgEnd(){ var d=_topo2ImgDrag; _topo2ImgDrag=null; document.removeEventListener('mousemove',_topo2ImgMove); document.removeEventListener('mouseup',_topo2ImgEnd); if(!d)return; var tc=_tcById(d.tcid); if(!tc)return; var t2=tcTopo2Get(tc); t2.bgImageX=parseInt(d.el.style.left)||0; t2.bgImageY=parseInt(d.el.style.top)||0; _tcTopo2Save(tc,t2); }
var _topo2ImgRz=null;
function topo2ImgResizeStart(e,tcid){ e.preventDefault(); e.stopPropagation(); var el=document.getElementById('topo2-img-'+tcid); if(!el)return; var r=el.getBoundingClientRect(); _topo2ImgRz={tcid:tcid,el:el,sx:e.clientX,sy:e.clientY,ow:r.width,oh:r.height}; document.addEventListener('mousemove',_topo2ImgRzMove); document.addEventListener('mouseup',_topo2ImgRzEnd); }
function _topo2ImgRzMove(e){ var d=_topo2ImgRz; if(!d)return; d.el.style.width=Math.max(60,d.ow+(e.clientX-d.sx))+'px'; d.el.style.height=Math.max(40,d.oh+(e.clientY-d.sy))+'px'; }
function _topo2ImgRzEnd(){ var d=_topo2ImgRz; _topo2ImgRz=null; document.removeEventListener('mousemove',_topo2ImgRzMove); document.removeEventListener('mouseup',_topo2ImgRzEnd); if(!d)return; var tc=_tcById(d.tcid); if(!tc)return; var t2=tcTopo2Get(tc); t2.bgImageW=parseInt(d.el.style.width)||620; t2.bgImageH=parseInt(d.el.style.height)||0; _tcTopo2Save(tc,t2); tcTopo2Refresh(d.tcid); }
function renderTCTopo2(tcid){ return '<div id="tc-topo2-'+tcid+'">'+tcTopo2Inner(tcid)+'</div>'; }
function tcTopo2Refresh(tcid){ const el=document.getElementById('tc-topo2-'+tcid); if(el){ el.innerHTML=tcTopo2Inner(tcid); setTimeout(()=>tcTopo2DrawLines(tcid),25); } }
function topoRoleIcon(role){ role=role||''; if(role.indexOf('OLT')>=0) return 'ti-router'; if(role.indexOf('ONT')>=0) return 'ti-access-point'; if(role.indexOf('계측')>=0) return 'ti-device-analytics'; if(role.indexOf('Cloud')>=0||role.indexOf('클라우드')>=0) return 'ti-cloud'; if(role.indexOf('PC')>=0||role.indexOf('서버')>=0) return 'ti-server-2'; if(role.indexOf('L2')>=0||role.indexOf('L3')>=0||role.indexOf('스위치')>=0) return 'ti-binary-tree'; return 'ti-device-desktop'; }
function _edgePt(cx,cy,hw,hh,tx,ty){ const dx=tx-cx,dy=ty-cy; if(!dx&&!dy) return [cx,cy]; const sx=dx?hw/Math.abs(dx):Infinity, sy=dy?hh/Math.abs(dy):Infinity; const s=Math.min(sx,sy); return [cx+dx*s, cy+dy*s]; }
function tcTopo2DrawLines(tcid){
  const tc=_tcById(tcid); if(!tc) return; const t2=tcTopo2Get(tc);
  const canvas=document.getElementById('topo2-canvas-'+tcid), svg=document.getElementById('topo2-svg-'+tcid);
  if(!canvas||!svg) return;
  const cr=canvas.getBoundingClientRect();
  let s='';
  t2.links.forEach(lk=>{
    const ea=document.getElementById('topo2-node-'+lk.a), eb=document.getElementById('topo2-node-'+lk.b);
    if(!ea||!eb) return;
    const ra=ea.getBoundingClientRect(), rb=eb.getBoundingClientRect();
    const ax=ra.left+ra.width/2-cr.left, ay=ra.top+ra.height/2-cr.top;
    const bx=rb.left+rb.width/2-cr.left, by=rb.top+rb.height/2-cr.top;
    const pa=_edgePt(ax,ay,ra.width/2,ra.height/2,bx,by), pb=_edgePt(bx,by,rb.width/2,rb.height/2,ax,ay);
    const x1=pa[0],y1=pa[1],x2=pb[0],y2=pb[1];
    const mx=(x1+x2)/2, my=(y1+y2)/2;
    const na=t2.nodes.find(x=>x.id===lk.a), nb=t2.nodes.find(x=>x.id===lk.b);
    const la=na&&(na.logical||[]).find(l=>l.name===lk.ap), lb=nb&&(nb.logical||[]).find(l=>l.name===lk.bp);
    const lg=la||lb; const col=lg?'#7c3aed':'#2d6fd4'; const wdt=lg?5:2.5;
    s+='<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="'+col+'" stroke-width="'+wdt+'" stroke-opacity="0.6"/>';
    s+='<circle cx="'+x1+'" cy="'+y1+'" r="'+(lg?4.5:3.5)+'" fill="'+col+'"/><circle cx="'+x2+'" cy="'+y2+'" r="'+(lg?4.5:3.5)+'" fill="'+col+'"/>';
    const lbl=lk.ap+' ↔ '+lk.bp+(lg?' ['+((la&&la.type)||(lb&&lb.type))+']':''); const w=lbl.length*7.6+16;
    s+='<rect x="'+(mx-w/2)+'" y="'+(my-11)+'" width="'+w+'" height="22" rx="6" fill="#fff" stroke="'+col+'" stroke-width="1.3"/><text x="'+mx+'" y="'+(my+4.5)+'" font-size="12" font-weight="700" fill="'+col+'" text-anchor="middle" font-family="ui-monospace,SFMono-Regular,monospace">'+lbl+'</text>';
  });
  svg.innerHTML=s;
}function topo2DragStart(e,tcid,nid){
  const t=e.target; if(t.tagName==='INPUT'||t.tagName==='SELECT'||t.tagName==='OPTION'||(t.classList&&t.classList.contains('ti-trash'))) return;
  const el=document.getElementById('topo2-node-'+nid), canvas=document.getElementById('topo2-canvas-'+tcid);
  if(!el||!canvas) return;
  const cr=canvas.getBoundingClientRect(), er=el.getBoundingClientRect();
  _topo2Drag={tcid:tcid,nid:nid,el:el,canvas:canvas,crL:cr.left,crT:cr.top,offX:e.clientX-er.left,offY:e.clientY-er.top,x:null,y:null};
  el.style.zIndex='3'; el.style.boxShadow='0 6px 18px rgba(0,0,0,0.22)';
  e.preventDefault();
  document.addEventListener('mousemove',_topo2DragMove);
  document.addEventListener('mouseup',_topo2DragEnd);
}
function _topo2DragMove(e){
  const d=_topo2Drag; if(!d) return;
  let x=e.clientX-d.crL-d.offX, y=e.clientY-d.crT-d.offY;
  x=Math.max(0,x); y=Math.max(0,y);
  d.el.style.left=x+'px'; d.el.style.top=y+'px'; d.x=x; d.y=y;
  if(d.canvas.offsetHeight<y+130) d.canvas.style.height=(y+130)+'px';
  tcTopo2DrawLines(d.tcid);
}
async function _topo2DragEnd(){
  const d=_topo2Drag; _topo2Drag=null;
  document.removeEventListener('mousemove',_topo2DragMove);
  document.removeEventListener('mouseup',_topo2DragEnd);
  if(!d) return;
  if(d.el){ d.el.style.zIndex='1'; d.el.style.boxShadow='0 2px 10px rgba(0,0,0,0.08)'; }
  if(d.x==null) return;
  const tc=_tcById(d.tcid); if(!tc) return; const t2=tcTopo2Get(tc);
  const n=t2.nodes.find(x=>x.id===d.nid); if(n){ n.x=Math.round(d.x); n.y=Math.round(d.y); await _tcTopo2Save(tc,t2); }
}
function topo2NodeHtml(n,tcid,idx){
  const c=DEVICE_ROLE_COLORS[n.role]||'#888';
  const num='#'+((idx||0)+1);
  const numBadge='<span style="font-size:10px;font-weight:800;color:#fff;background:'+c+';border-radius:5px;padding:1px 6px;flex-shrink:0;">'+num+'</span>';
  const ipBox='<input value="'+(n.ip||'').replace(/"/g,'&quot;')+'" placeholder="IP" onchange="topo2SetIp(\''+tcid+'\',\''+n.id+'\',this.value)"';
  if(_topo2Mode==='icon'){
    return '<div id="topo2-node-'+n.id+'" style="width:128px;text-align:center;position:relative;">'
      +'<div style="position:absolute;top:1px;left:6px;font-size:11px;font-weight:800;color:'+c+';">'+num+'</div>'
      +'<i class="ti ti-trash" onclick="topo2DelNode(\''+tcid+'\',\''+n.id+'\')" style="position:absolute;top:0;right:8px;color:#ccc;cursor:pointer;font-size:13px;" onmouseenter="this.style.color=\'var(--red)\'" onmouseleave="this.style.color=\'#ccc\'"></i>'
      +'<div style="width:62px;height:62px;border-radius:16px;border:2px solid '+c+';background:'+c+'14;display:flex;align-items:center;justify-content:center;margin:0 auto 6px;box-shadow:0 2px 10px rgba(0,0,0,0.1);"><i class="ti '+topoRoleIcon(n.role)+'" style="font-size:32px;color:'+c+';"></i></div>'
      +'<div style="font-size:12px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+(n.model||'')+'</div>'
      +ipBox+' style="width:112px;font-size:11px;font-family:monospace;text-align:center;padding:3px 4px;border:1px solid var(--border);border-radius:5px;outline:none;margin-top:4px;">'
      +'<div style="font-size:9px;color:var(--text3);margin-top:2px;">가입'+((n.sub||[]).length)+' · 업'+((n.up||[]).length)+'</div>'
      +'</div>';
  }
  return '<div id="topo2-node-'+n.id+'" onmousedown="topo2DragStart(event,\''+tcid+'\',\''+n.id+'\')" style="border:1.5px solid '+c+'66;border-top:3px solid '+c+';border-radius:9px;padding:11px 10px 8px;width:182px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.08);text-align:center;position:absolute;left:'+(n._px||0)+'px;top:'+(n._py||0)+'px;cursor:move;user-select:none;z-index:1;">'
    +'<span style="position:absolute;top:8px;left:9px;font-size:10px;font-weight:800;color:#fff;background:'+c+';border-radius:5px;padding:1px 6px;">'+num+'</span>'
    +'<i class="ti ti-trash" onclick="topo2DelNode(\''+tcid+'\',\''+n.id+'\')" style="position:absolute;top:8px;right:10px;color:#ccc;cursor:pointer;font-size:14px;" onmouseenter="this.style.color=\'var(--red)\'" onmouseleave="this.style.color=\'#ccc\'"></i>'
    +'<div style="font-size:12px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+(n.model||'')+'</div>'
    +'<div style="font-size:9px;color:var(--text3);margin-bottom:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+(n.role||'')+(n.vendor?' · '+n.vendor:'')+'</div>'
    +'<div style="display:flex;align-items:center;gap:5px;"><i class="ti ti-network" style="font-size:12px;color:var(--text3);flex-shrink:0;"></i>'+ipBox+' style="flex:1;min-width:0;font-size:11px;font-family:monospace;text-align:center;padding:4px 5px;border:1px solid var(--border);border-radius:5px;outline:none;box-sizing:border-box;"></div>'
    +'<div style="font-size:9.5px;margin-top:5px;"><span style="color:#00a872;">가입 <b>'+((n.sub||[]).length)+'</b></span> <span style="color:#ccc;">·</span> <span style="color:#2d6fd4;">업 <b>'+((n.up||[]).length)+'</b></span></div>'
    +'</div>';
}
function tcTopo2Inner(tcid){
  const tc=_tcById(tcid); if(!tc) return '';
  const t2=tcTopo2Get(tc);
  if(typeof deviceList==='undefined'||!deviceList){ return '<div style="color:var(--text3);font-size:12px;padding:14px;">장비 카탈로그 로딩 중... (Device Registration 필요)</div>'; }
  const devOpts='<option value="">(등록 장비 선택)</option>'+deviceList.map(d=>'<option value="'+d.id+'">['+(d.role||'')+'] '+(d.name||'')+(d.vendor?' · '+d.vendor:'')+'</option>').join('');
  let h='<div style="display:flex;gap:6px;align-items:center;margin-bottom:10px;padding:10px;background:#f8f9fb;border:1px solid var(--border);border-radius:8px;flex-wrap:wrap;">'
    +'<i class="ti ti-router" style="color:var(--blue);"></i><b style="font-size:12px;">장비 배치</b>'
    +'<select id="topo2-dev-'+tcid+'" style="font-size:12px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;max-width:300px;">'+devOpts+'</select>'
    +'<button onclick="topo2AddNode(\''+tcid+'\')" style="font-size:12px;padding:6px 12px;border-radius:6px;border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:600;"><i class="ti ti-plus"></i> 추가</button>'
    +(deviceList.length?'':'<span style="font-size:11px;color:#c48a00;">Device Registration에 장비를 먼저 등록하세요</span>')
    +'</div>';
  // 구성도 사진 (붙여넣기/업로드/복사) — 네트워크 구성도 캡처를 그대로 첨부, Ctrl+C/V로 TC 간 이동
  h+='<div onpaste="topo2PasteImg(\''+tcid+'\',event)" onkeydown="if((event.ctrlKey||event.metaKey)&&(event.key===\'c\'||event.key===\'C\')){topo2CopyImg(\''+tcid+'\');event.preventDefault();}" tabindex="0" title="이 영역 클릭 후 Ctrl+V=붙여넣기 · Ctrl+C=사진 복사" style="display:flex;gap:8px;align-items:center;margin-bottom:10px;padding:8px 11px;background:#fbfaff;border:1px dashed #c9b6f0;border-radius:8px;flex-wrap:wrap;outline:none;cursor:text;">'
    +'<i class="ti ti-photo" style="color:#7c3aed;font-size:15px;"></i><b style="font-size:12px;">구성도 사진</b>'
    +'<span style="font-size:11px;color:var(--text3);">이 영역 클릭 후 <b style="color:#7c3aed;">Ctrl+V</b> 붙여넣기 · 또는</span>'
    +'<label style="font-size:11.5px;padding:5px 11px;border-radius:6px;border:1px solid #7c3aed;background:#fff;color:#7c3aed;cursor:pointer;font-weight:600;"><i class="ti ti-upload"></i> 파일 선택<input type="file" accept="image/*" onchange="topo2UploadImg(\''+tcid+'\',this)" style="display:none;"></label>'
    +'<button onclick="topo2PasteImgBtn(\''+tcid+'\')" title="복사해 둔 구성도 사진 붙여넣기 (다른 TC에서 [사진 복사] 한 것)" style="font-size:11.5px;padding:5px 10px;border-radius:6px;border:1px solid #2d6fd4;background:#fff;color:#2d6fd4;cursor:pointer;font-weight:600;"><i class="ti ti-clipboard"></i> 사진 붙여넣기</button>'
    +(t2.bgImage?'<button onclick="topo2CopyImg(\''+tcid+'\')" title="구성도 사진 복사 (Ctrl+C) — 다른 TC Topology에 붙여넣기 가능" style="font-size:11.5px;padding:5px 10px;border-radius:6px;border:1px solid #7c3aed;background:#fff;color:#7c3aed;cursor:pointer;font-weight:600;"><i class="ti ti-copy"></i> 사진 복사</button>':'')
    +(t2.bgImage?'<button onclick="topo2ClearImg(\''+tcid+'\')" style="font-size:11.5px;padding:5px 10px;border-radius:6px;border:1px solid #f0c2cb;background:#fff;color:#c0392b;cursor:pointer;"><i class="ti ti-trash"></i> 사진 제거</button>':'')
    +'</div>';
  if(t2.bgImage){
    var _iw=(typeof t2.bgImageW==='number'&&t2.bgImageW>40)?t2.bgImageW:620;
    var _ih=(typeof t2.bgImageH==='number'&&t2.bgImageH>40)?t2.bgImageH:0;
    var _ix=(typeof t2.bgImageX==='number'&&t2.bgImageX>=0)?t2.bgImageX:0;
    var _iy=(typeof t2.bgImageY==='number'&&t2.bgImageY>=0)?t2.bgImageY:0;
    var _stageH=Math.max(320,_iy+(_ih||440)+20);
    h+='<div style="position:relative;width:100%;min-height:'+_stageH+'px;border:1px solid var(--border);border-radius:10px;background:#fafbfc;margin-bottom:12px;overflow:visible;">'
      +'<div style="position:absolute;left:8px;top:6px;font-size:10px;color:#9aa3b2;z-index:1;">드래그=이동 · 우하단 ●=크기조절</div>'
      +'<div id="topo2-img-'+tcid+'" tabindex="0" onmousedown="topo2ImgDragStart(event,\''+tcid+'\');try{this.focus();}catch(e){}" onkeydown="if((event.ctrlKey||event.metaKey)&&(event.key===\'c\'||event.key===\'C\')){topo2CopyImg(\''+tcid+'\');event.preventDefault();}" title="드래그=이동 · 클릭 후 Ctrl+C=사진 복사" style="position:absolute;left:'+_ix+'px;top:'+_iy+'px;width:'+_iw+'px;'+(_ih?('height:'+_ih+'px;'):'')+'cursor:move;box-shadow:0 2px 8px rgba(0,0,0,0.18);border-radius:6px;background:#fff;outline:none;">'
        +'<img src="'+t2.bgImage+'" draggable="false" style="width:100%;'+(_ih?'height:100%;object-fit:contain;':'')+'display:block;border-radius:6px;pointer-events:none;user-select:none;">'
        +'<div onmousedown="topo2ImgResizeStart(event,\''+tcid+'\')" title="크기 조절" style="position:absolute;right:-7px;bottom:-7px;width:16px;height:16px;background:#7c3aed;border:2px solid #fff;border-radius:50%;cursor:nwse-resize;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>'
      +'</div></div>';
  }
  const portChips=arr=>(arr||[]).map(p=>'<span style="font-size:10px;font-family:monospace;padding:1px 5px;border-radius:3px;background:#eef2f7;color:#46506a;">'+p.name+(p.speed?'<span style="color:#9aab;">·'+p.speed+'</span>':'')+'</span>').join(' ');
  if(!t2.nodes.length){ h+='<div style="padding:26px;text-align:center;color:var(--text3);font-size:12px;border:2px dashed var(--border);border-radius:10px;">배치된 장비가 없습니다. 위에서 등록 장비를 골라 <b>추가</b>하세요.</div>'; return h; }
  const order=['계측기','L3 스위치','L2 스위치','OLT','ONT','PC/서버','Cloud','기타'];
  const rk=r=>{ const i=order.indexOf(r); return i<0?99:i; };
  const tiers={}; t2.nodes.forEach(n=>{ const k=rk(n.role); (tiers[k]=tiers[k]||[]).push(n); });
  const NW=182,NH=86,GX=38,GY=46; const auto={}; const tk=Object.keys(tiers).map(Number).sort((a,b)=>a-b);
  tk.forEach((k,ti)=>{ tiers[k].forEach((n,ci)=>{ auto[n.id]={x:ci*(NW+GX)+30, y:ti*(NH+GY)+12}; }); });
  let maxY=0,maxX=0;
  t2.nodes.forEach(n=>{ const p=(typeof n.x==='number'&&typeof n.y==='number')?{x:n.x,y:n.y}:auto[n.id]; n._px=p.x; n._py=p.y; maxX=Math.max(maxX,p.x+NW); maxY=Math.max(maxY,p.y+NH); });
  h+='<div id="topo2-canvas-'+tcid+'" style="position:relative;margin-bottom:14px;height:'+(maxY+24)+'px;min-width:'+(maxX+24)+'px;"><svg id="topo2-svg-'+tcid+'" style="position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:4;overflow:visible;"></svg>';
  t2.nodes.forEach((n,i)=>{ h+=topo2NodeHtml(n,tcid,i); });
  h+='</div>';
  const nodeOpts=t2.nodes.map((x,i)=>'<option value="'+x.id+'">#'+(i+1)+' '+(x.model||'')+'</option>').join('');
  // 로지컬 인터페이스 (LACP/ECMP/번들)
  h+='<div style="border-top:1px solid var(--border);padding-top:10px;margin-bottom:12px;"><div style="font-size:12px;font-weight:700;margin-bottom:6px;"><i class="ti ti-binary-tree-2" style="color:#7c3aed;"></i> 로지컬 인터페이스 (LACP / ECMP / 번들)</div>'
    +'<div style="display:flex;gap:5px;align-items:flex-start;flex-wrap:wrap;margin-bottom:8px;">'
    +'<select id="topo2-lg-dev-'+tcid+'" onchange="topo2LogicalFillPorts(\''+tcid+'\')" style="font-size:12px;padding:5px 7px;border:1px solid var(--border);border-radius:5px;"><option value="">장비</option>'+nodeOpts+'</select>'
    +'<input id="topo2-lg-name-'+tcid+'" placeholder="이름 (Po1)" style="width:84px;font-size:12px;padding:5px 7px;border:1px solid var(--border);border-radius:5px;outline:none;">'
    +'<select id="topo2-lg-type-'+tcid+'" style="font-size:12px;padding:5px 7px;border:1px solid var(--border);border-radius:5px;">'+['LACP','ECMP','Bridge','VLAN','기타'].map(t=>'<option>'+t+'</option>').join('')+'</select>'
    +'<select id="topo2-lg-mem-'+tcid+'" multiple style="font-size:11px;padding:3px 5px;border:1px solid var(--border);border-radius:5px;min-width:120px;height:64px;"><option value="">멤버(장비 선택)</option></select>'
    +'<button onclick="topo2AddLogical(\''+tcid+'\')" style="font-size:12px;padding:5px 11px;border-radius:6px;border:1px solid #7c3aed;background:#fff;color:#7c3aed;cursor:pointer;font-weight:600;">추가</button>'
    +'<span style="font-size:10px;color:var(--text3);align-self:center;">멤버 다중선택<br>(Ctrl/드래그)</span>'
    +'</div>';
  const allLog=[]; t2.nodes.forEach((n,i)=>{ (n.logical||[]).forEach(l=>allLog.push({ni:i,nid:n.id,model:n.model,l:l})); });
  if(allLog.length){ h+='<div style="display:flex;flex-wrap:wrap;gap:6px;">'+allLog.map(x=>'<span style="font-size:11px;padding:3px 9px;border-radius:6px;background:rgba(124,58,237,0.08);border:1px solid rgba(124,58,237,0.3);color:#7c3aed;">#'+(x.ni+1)+' '+(x.model||'')+' · <b>'+x.l.name+'</b> ['+x.l.type+'] = '+((x.l.members||[]).join(','))+'<i class="ti ti-x" onclick="topo2DelLogical(\''+tcid+'\',\''+x.nid+'\',\''+x.l.id+'\')" style="cursor:pointer;color:#c44;margin-left:6px;"></i></span>').join('')+'</div>'; }
  h+='</div>';
  h+='<div style="border-top:1px solid var(--border);padding-top:10px;"><div style="font-size:12px;font-weight:700;margin-bottom:6px;"><i class="ti ti-link" style="color:var(--blue);"></i> 결선 (포트 ↔ 포트)</div>'
    +'<div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin-bottom:8px;">'
    +'<select id="topo2-la-'+tcid+'" onchange="topo2FillPorts(\''+tcid+'\')" style="font-size:12px;padding:5px 7px;border:1px solid var(--border);border-radius:5px;"><option value="">장비 A</option>'+nodeOpts+'</select>'
    +'<select id="topo2-lap-'+tcid+'" style="font-size:12px;padding:5px 7px;border:1px solid var(--border);border-radius:5px;"><option value="">포트</option></select>'
    +'<span style="color:var(--text3);font-weight:700;">↔</span>'
    +'<select id="topo2-lb-'+tcid+'" onchange="topo2FillPorts(\''+tcid+'\')" style="font-size:12px;padding:5px 7px;border:1px solid var(--border);border-radius:5px;"><option value="">장비 B</option>'+nodeOpts+'</select>'
    +'<select id="topo2-lbp-'+tcid+'" style="font-size:12px;padding:5px 7px;border:1px solid var(--border);border-radius:5px;"><option value="">포트</option></select>'
    +'<button onclick="topo2AddLink(\''+tcid+'\')" style="font-size:12px;padding:5px 12px;border-radius:6px;border:1px solid var(--green);background:#fff;color:var(--green);cursor:pointer;font-weight:600;">연결</button>'
    +'</div>';
  if(t2.links.length){
    h+='<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;"><table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:#f4f5f7;"><th style="padding:6px 10px;text-align:left;color:#666;">장비 A</th><th style="padding:6px 10px;text-align:left;color:#666;">포트</th><th style="padding:6px;"></th><th style="padding:6px 10px;text-align:left;color:#666;">장비 B</th><th style="padding:6px 10px;text-align:left;color:#666;">포트</th><th style="width:30px;"></th></tr></thead><tbody>';
    t2.links.forEach((lk,i)=>{ const ia=t2.nodes.findIndex(x=>x.id===lk.a),ib=t2.nodes.findIndex(x=>x.id===lk.b); const na=t2.nodes[ia],nb=t2.nodes[ib]; h+='<tr style="border-top:1px solid #f0f0f0;"><td style="padding:6px 10px;">'+(na?'<b style="color:var(--text3);">#'+(ia+1)+'</b> '+na.model:'?')+'</td><td style="padding:6px 10px;font-family:monospace;color:var(--blue);font-weight:600;">'+lk.ap+'</td><td style="text-align:center;color:var(--text3);">──</td><td style="padding:6px 10px;">'+(nb?'<b style="color:var(--text3);">#'+(ib+1)+'</b> '+nb.model:'?')+'</td><td style="padding:6px 10px;font-family:monospace;color:var(--blue);font-weight:600;">'+lk.bp+'</td><td style="padding:6px 10px;text-align:right;"><i class="ti ti-trash" onclick="topo2DelLink(\''+tcid+'\','+i+')" style="color:#ccc;cursor:pointer;" onmouseenter="this.style.color=\'var(--red)\'" onmouseleave="this.style.color=\'#ccc\'"></i></td></tr>'; });
    h+='</tbody></table></div>';
  } else { h+='<div style="font-size:11px;color:var(--text3);">아직 결선이 없습니다. 장비A·포트 ↔ 장비B·포트를 선택해 연결하세요.</div>'; }
  h+='</div>';
  return h;
}
async function topo2AddNode(tcid){
  const tc=_tcById(tcid); if(!tc) return;
  const devId=(document.getElementById('topo2-dev-'+tcid)||{}).value; const d=deviceList.find(x=>x.id===devId);
  if(!d){ showToast('등록 장비를 선택하세요'); return; }
  const t2=tcTopo2Get(tc);
  t2.nodes.push({id:'n'+Date.now(), model:d.name||'', role:d.role||'', vendor:d.vendor||'', ip:'', sub:JSON.parse(JSON.stringify(d.subscriber_ifs||[])), up:JSON.parse(JSON.stringify(d.uplink_ifs||[]))});
  await _tcTopo2Save(tc,t2); tcTopo2Refresh(tcid);
}
async function topo2DelNode(tcid,nid){
  const tc=_tcById(tcid); if(!tc) return; const t2=tcTopo2Get(tc);
  t2.nodes=t2.nodes.filter(n=>n.id!==nid); t2.links=t2.links.filter(l=>l.a!==nid&&l.b!==nid);
  await _tcTopo2Save(tc,t2); tcTopo2Refresh(tcid);
}
async function topo2SetIp(tcid,nid,ip){
  const tc=_tcById(tcid); if(!tc) return; const t2=tcTopo2Get(tc);
  const n=t2.nodes.find(x=>x.id===nid); if(n){ n.ip=ip; await _tcTopo2Save(tc,t2); }
}
function topo2FillPorts(tcid){
  const tc=_tcById(tcid); if(!tc) return; const t2=tcTopo2Get(tc);
  ['la','lb'].forEach(s=>{ const nid=(document.getElementById('topo2-'+s+'-'+tcid)||{}).value; const n=t2.nodes.find(x=>x.id===nid); const psel=document.getElementById('topo2-'+s+'p-'+tcid); if(psel){ const ports=n?[...(n.sub||[]),...(n.up||[])]:[]; const lgo=(n&&n.logical||[]).map(l=>'<option value="'+l.name+'">◆ '+l.name+' ('+l.type+')</option>').join(''); psel.innerHTML='<option value="">포트</option>'+lgo+ports.map(p=>'<option value="'+p.name+'">'+p.name+(p.speed?' ('+p.speed+')':'')+'</option>').join(''); } });
}
async function topo2AddLink(tcid){
  const tc=_tcById(tcid); if(!tc) return; const t2=tcTopo2Get(tc);
  const a=(document.getElementById('topo2-la-'+tcid)||{}).value, ap=(document.getElementById('topo2-lap-'+tcid)||{}).value;
  const b=(document.getElementById('topo2-lb-'+tcid)||{}).value, bp=(document.getElementById('topo2-lbp-'+tcid)||{}).value;
  if(!a||!ap||!b||!bp){ showToast('장비와 포트를 모두 선택하세요'); return; }
  if(a===b&&ap===bp){ showToast('같은 포트끼리는 연결할 수 없습니다'); return; }
  t2.links.push({a:a,ap:ap,b:b,bp:bp});
  await _tcTopo2Save(tc,t2); tcTopo2Refresh(tcid);
}
async function topo2DelLink(tcid,i){
  const tc=_tcById(tcid); if(!tc) return; const t2=tcTopo2Get(tc);
  t2.links.splice(i,1); await _tcTopo2Save(tc,t2); tcTopo2Refresh(tcid);
}
function topo2LogicalFillPorts(tcid){
  const tc=_tcById(tcid); if(!tc) return; const t2=tcTopo2Get(tc);
  const nid=(document.getElementById('topo2-lg-dev-'+tcid)||{}).value; const n=t2.nodes.find(x=>x.id===nid);
  const sel=document.getElementById('topo2-lg-mem-'+tcid); if(!sel) return;
  const ports=n?[...(n.sub||[]),...(n.up||[])]:[];
  sel.innerHTML=ports.length?ports.map(p=>'<option value="'+p.name+'">'+p.name+(p.speed?' ('+p.speed+')':'')+'</option>').join(''):'<option value="">포트 없음</option>';
}
async function topo2AddLogical(tcid){
  const tc=_tcById(tcid); if(!tc) return; const t2=tcTopo2Get(tc);
  const nid=(document.getElementById('topo2-lg-dev-'+tcid)||{}).value; const n=t2.nodes.find(x=>x.id===nid);
  const name=(document.getElementById('topo2-lg-name-'+tcid).value||'').trim();
  const type=document.getElementById('topo2-lg-type-'+tcid).value||'LACP';
  const mem=[...(document.getElementById('topo2-lg-mem-'+tcid)||{selectedOptions:[]}).selectedOptions].map(o=>o.value).filter(Boolean);
  if(!n){ showToast('장비를 선택하세요'); return; }
  if(!name){ showToast('로지컬 이름을 입력하세요 (예: Po1)'); return; }
  if(!mem.length){ showToast('멤버 포트를 선택하세요'); return; }
  n.logical=n.logical||[];
  if(n.logical.some(l=>l.name===name)){ showToast('이미 있는 로지컬 이름입니다'); return; }
  n.logical.push({id:'lg'+Date.now(), name:name, type:type, members:mem});
  await _tcTopo2Save(tc,t2); tcTopo2Refresh(tcid);
}
async function topo2DelLogical(tcid,nid,lid){
  const tc=_tcById(tcid); if(!tc) return; const t2=tcTopo2Get(tc);
  const n=t2.nodes.find(x=>x.id===nid); if(!n) return;
  const lg=(n.logical||[]).find(l=>l.id===lid);
  n.logical=(n.logical||[]).filter(l=>l.id!==lid);
  if(lg){ t2.links=t2.links.filter(l=>!((l.a===nid&&l.ap===lg.name)||(l.b===nid&&l.bp===lg.name))); }
  await _tcTopo2Save(tc,t2); tcTopo2Refresh(tcid);
}

function initSysCustom(){
  loadCustomFields().then(()=>renderSysCustom());
}

function renderSysCustom(){
  const wrap=document.getElementById('sys-custom-panels');
  if(!wrap) return;
  const targets=[
    {key:'req',label:'REQ 필드',icon:'ti-file-description',color:'var(--blue)'},
    {key:'tc',label:'TC 필드',icon:'ti-clipboard-check',color:'var(--green)'},
    {key:'cycle',label:'Cycle 필드',icon:'ti-rotate-clockwise',color:'#e8820c'},
  ];
  const tg=k=>targets.find(x=>x.key===k);
  wrap.innerHTML=
    '<div style="display:flex;flex-direction:column;gap:16px;width:100%;align-items:stretch;">'+
      sysCustomPanel(tg('req'))+
      sysCustomPanel(tg('tc'))+
      sysCustomPanel(tg('cycle'))+
      sysResultPanel()+
    '</div>';
}
// ── 시험 결과 상태 관리 ──
function resultEnsure(){ if(!Array.isArray(customFields.result)||!customFields.result.length){ customFields.result=JSON.parse(JSON.stringify(DEFAULT_RESULT_STATUSES)); } }
function resultSaveStatuses(){ saveCustomFields(); renderSysCustom(); }
function resultAddStatus(){ resultEnsure(); customFields.result.push({value:'새 상태',color:'#888888',verdict:'exclude'}); resultSaveStatuses(); }
function resultUpdateStatus(i,field,val){ resultEnsure(); if(customFields.result[i]){ customFields.result[i][field]=val; resultSaveStatuses(); } }
function resultDeleteStatus(i){ resultEnsure(); customFields.result.splice(i,1); resultSaveStatuses(); }
function resultMoveStatus(i,dir){ resultEnsure(); const a=customFields.result; const j=i+dir; if(j<0||j>=a.length) return; const t=a[i]; a[i]=a[j]; a[j]=t; resultSaveStatuses(); }
function sysResultPanel(){
  const list=resultStatuses();
  const vlabel={pass:'합격',fail:'불합격',pending:'예정',exclude:'제외'};
  const rows=list.map((st,i)=>
    '<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;background:#fff;">'+
      '<input type="color" value="'+((st.color&&st.color[0]==='#')?st.color:'#999999')+'" onchange="resultUpdateStatus('+i+',\'color\',this.value)" title="색상" style="width:30px;height:28px;border:none;background:none;cursor:pointer;flex-shrink:0;padding:0;">'+
      '<input value="'+(st.value||'').replace(/"/g,'&quot;')+'" onblur="resultUpdateStatus('+i+',\'value\',this.value)" placeholder="결과명 (예: 진행불가)" style="flex:1;font-size:13px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;outline:none;">'+
      '<select onchange="resultUpdateStatus('+i+',\'verdict\',this.value)" title="판정" style="font-size:12px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;outline:none;flex-shrink:0;">'+
        ['pass','fail','pending','exclude'].map(v=>'<option value="'+v+'" '+(st.verdict===v?'selected':'')+'>'+vlabel[v]+'</option>').join('')+
      '</select>'+
      '<div style="display:flex;flex-direction:column;gap:2px;flex-shrink:0;">'+
        '<button onclick="resultMoveStatus('+i+',-1)" '+(i===0?'disabled':'')+' title="위로" style="font-size:11px;padding:1px 6px;border-radius:5px;border:1px solid var(--border);background:'+(i===0?'#f5f5f5':'#fff')+';color:'+(i===0?'#ccc':'var(--text2)')+';cursor:'+(i===0?'not-allowed':'pointer')+';line-height:1;"><i class="ti ti-chevron-up" style="font-size:13px;"></i></button>'+
        '<button onclick="resultMoveStatus('+i+',1)" '+(i===list.length-1?'disabled':'')+' title="아래로" style="font-size:11px;padding:1px 6px;border-radius:5px;border:1px solid var(--border);background:'+(i===list.length-1?'#f5f5f5':'#fff')+';color:'+(i===list.length-1?'#ccc':'var(--text2)')+';cursor:'+(i===list.length-1?'not-allowed':'pointer')+';line-height:1;"><i class="ti ti-chevron-down" style="font-size:13px;"></i></button>'+
      '</div>'+
      '<button onclick="resultDeleteStatus('+i+')" title="삭제" style="border:1px solid rgba(229,62,90,0.3);background:rgba(229,62,90,0.06);color:var(--red);border-radius:5px;padding:5px 9px;cursor:pointer;flex-shrink:0;"><i class="ti ti-trash"></i></button>'+
    '</div>'
  ).join('');
  return '<div style="width:100%;border:1.5px solid var(--border);border-radius:12px;overflow:hidden;">'+
    '<div style="padding:14px 18px;background:linear-gradient(135deg,rgba(0,168,114,0.06),transparent);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;">'+
      '<i class="ti ti-checkup-list" style="font-size:18px;color:var(--green);"></i>'+
      '<span style="font-size:14px;font-weight:700;flex:1;">시험 결과 상태</span>'+
      '<span style="font-size:11px;color:var(--text3);">'+list.length+'개</span>'+
      '<button onclick="resultAddStatus()" style="font-size:12px;padding:4px 12px;border-radius:6px;border:1px solid rgba(0,168,114,0.3);background:rgba(0,168,114,0.08);color:var(--green);cursor:pointer;font-weight:600;"><i class="ti ti-plus"></i> 상태 추가</button>'+
    '</div>'+
    '<div style="padding:10px;">'+
      '<div style="font-size:11px;color:var(--text3);margin-bottom:8px;line-height:1.6;">사이클 실행표의 결과 버튼으로 사용됩니다. 판정 — <b style="color:var(--green);">합격</b>·<b style="color:var(--red);">불합격</b>·<b style="color:#888;">예정</b>: 진행율 포함 (예정 = 미실행) · <b>제외</b>: 진행율에서 제외 (미구현·미지원 등). 진행율 = (합격+불합격) / (합격+불합격+예정)</div>'+
      rows+
    '</div>'+
  '</div>';
}

function sysCustomPanel(t){
  const fields=customFields[t.key]||[];
  return '<div style="width:100%;border:1.5px solid var(--border);border-radius:12px;overflow:hidden;">'+
    // 패널 헤더
    '<div style="padding:14px 18px;background:linear-gradient(135deg,rgba(45,111,212,0.06),transparent);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;">'+
      '<i class="ti '+t.icon+'" style="font-size:18px;color:'+t.color+';"></i>'+
      '<span style="font-size:14px;font-weight:700;flex:1;">'+t.label+'</span>'+
      '<span style="font-size:11px;color:var(--text3);">'+fields.length+'개</span>'+
      '<button onclick="openCFModal(\''+t.key+'\')" style="font-size:12px;padding:4px 12px;border-radius:6px;border:1px solid rgba(45,111,212,0.3);background:rgba(45,111,212,0.08);color:var(--blue);cursor:pointer;font-weight:600;"><i class="ti ti-plus"></i> 필드 추가</button>'+
    '</div>'+
    // 필드 목록
    '<div style="padding:8px;" id="cf-list-'+t.key+'">'+
      (fields.length?fields.map((f,i)=>sysCustomFieldRow(t.key,f,i)).join(''):
        '<div style="padding:30px;text-align:center;color:var(--text3);font-size:13px;"><i class="ti ti-plus-circle" style="font-size:24px;display:block;margin-bottom:8px;opacity:0.3;"></i>아직 필드가 없습니다</div>')+
    '</div>'+
  '</div>';
}

function sysCustomFieldRow(target, f, idx){
  const total=(customFields[target]||[]).length;
  const typeIcon=CF_TYPE_ICONS[f.type]||'ti-forms';
  const typeColor={'Text':'#666','Number':'var(--blue)','Select':'var(--green)','MultiSelect':'#9d7bff','Date':'#e8820c','Checkbox':'var(--green)','URL':'var(--blue)','Textarea':'#666'}[f.type]||'#666';
  const active=f.active!==false;
  const showInfo=f.show_info!==false; // 기본 true
  const showFilter=f.show_filter===true; // 기본 false (Select/MultiSelect만 의미있음)
  const showPdf=f.show_pdf!==false; // 기본 true (PDF 출력)
  const useInCycle=f.useInCycle!==false; // 기본 true (사이클 생성 필터 적용)
  const canFilter=f.type==='Select'||f.type==='MultiSelect';

  const toggleBtn=(label,icon,isOn,fn)=>
    '<button onclick="'+fn+'" title="'+label+'" style="font-size:11px;padding:3px 8px;border-radius:5px;border:1px solid '+(isOn?'rgba(45,111,212,0.4)':'#ddd')+';background:'+(isOn?'rgba(45,111,212,0.1)':'#fff')+';color:'+(isOn?'var(--blue)':'#bbb')+';cursor:pointer;display:flex;align-items:center;gap:3px;white-space:nowrap;">'+
      '<i class="ti '+icon+'" style="font-size:12px;"></i><span style="font-size:10px;">'+label+'</span>'+
    '</button>';

  return '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:8px;border:1px solid '+(active?'var(--border)':'#e0e0e0')+';margin-bottom:6px;background:'+(active?'#fff':'#f8f8f8')+';opacity:'+(active?'1':'0.6')+';transition:all 0.2s;">'+
    '<i class="ti '+typeIcon+'" style="font-size:16px;color:'+(active?typeColor:'#ccc')+';flex-shrink:0;"></i>'+
    '<div style="font-size:13px;font-weight:600;color:'+(active?'var(--text)':'#aaa')+';width:180px;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+f.label+'</div>'+
    '<span style="font-size:10px;padding:2px 7px;border-radius:4px;background:rgba(0,0,0,0.06);color:var(--text3);width:78px;flex-shrink:0;text-align:center;">'+f.type+'</span>'+
    '<span style="width:42px;flex-shrink:0;text-align:center;">'+(f.required?'<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(229,62,90,0.08);color:var(--red);">필수</span>':'<span style="color:#d8dce2;font-size:12px;">·</span>')+'</span>'+
    '<div style="flex:1;min-width:0;display:flex;gap:3px;flex-wrap:wrap;align-items:center;">'+
      ((f.type==='Select'||f.type==='MultiSelect')&&f.options?.length?
        f.options.map(o=>'<span style="font-size:10px;padding:1px 6px;border-radius:4px;border:1px solid '+cfOptColor(o)+';color:'+cfOptColor(o)+';background:rgba(0,0,0,0.03);">'+cfOptValue(o)+'</span>').join(''):'')+
    '</div>'+
    // 활성 토글
    '<div onclick="toggleCFActive(\''+target+'\','+idx+')" style="display:flex;align-items:center;gap:4px;cursor:pointer;padding:3px 8px;border-radius:12px;border:1px solid '+(active?'rgba(0,168,114,0.3)':'#ddd')+';background:'+(active?'rgba(0,168,114,0.08)':'#f5f5f5')+';flex-shrink:0;">'+
      '<div style="width:24px;height:14px;border-radius:7px;background:'+(active?'var(--green)':'#ccc')+';position:relative;">'+
        '<div style="width:10px;height:10px;border-radius:50%;background:#fff;position:absolute;top:2px;left:'+(active?'12px':'2px')+';transition:left 0.2s;"></div>'+
      '</div>'+
      '<span style="font-size:10px;font-weight:600;color:'+(active?'var(--green)':'#aaa')+';">'+(active?'활성':'비활성')+'</span>'+
    '</div>'+
    // Information 표시 토글
    toggleBtn('Information','ti-file-description',showInfo,'toggleCFShowInfo(\''+target+'\','+idx+')')+
    // PDF 출력 토글
    toggleBtn('PDF','ti-printer',showPdf,'toggleCFShowPdf(\''+target+'\','+idx+')')+
    // 필터 토글 (Select/MultiSelect만)
    (canFilter?toggleBtn('필터','ti-filter',showFilter,'toggleCFShowFilter(\''+target+'\','+idx+')'):
      '<button disabled style="font-size:11px;padding:3px 8px;border-radius:5px;border:1px solid #eee;background:#f8f8f8;color:#ccc;cursor:not-allowed;display:flex;align-items:center;gap:3px;white-space:nowrap;"><i class="ti ti-filter" style="font-size:12px;"></i><span style="font-size:10px;">필터</span></button>')+
    // 사이클 생성 필터 적용 토글 (Select/MultiSelect만)
    (canFilter?toggleBtn('사이클 생성','ti-columns-3',useInCycle,'toggleCFUseInCycle(\''+target+'\','+idx+')'):'')+
    // 순서 변경 (위/아래)
    '<div style="display:flex;flex-direction:column;gap:2px;flex-shrink:0;">'+
      '<button onclick="moveCF(\''+target+'\','+idx+',-1)" '+(idx===0?'disabled':'')+' title="위로 이동" style="font-size:11px;padding:1px 6px;border-radius:5px;border:1px solid var(--border);background:'+(idx===0?'#f5f5f5':'#fff')+';color:'+(idx===0?'#ccc':'var(--text2)')+';cursor:'+(idx===0?'not-allowed':'pointer')+';line-height:1;"><i class="ti ti-chevron-up" style="font-size:13px;"></i></button>'+
      '<button onclick="moveCF(\''+target+'\','+idx+',1)" '+(idx===total-1?'disabled':'')+' title="아래로 이동" style="font-size:11px;padding:1px 6px;border-radius:5px;border:1px solid var(--border);background:'+(idx===total-1?'#f5f5f5':'#fff')+';color:'+(idx===total-1?'#ccc':'var(--text2)')+';cursor:'+(idx===total-1?'not-allowed':'pointer')+';line-height:1;"><i class="ti ti-chevron-down" style="font-size:13px;"></i></button>'+
    '</div>'+
    // 편집/삭제
    '<div style="display:flex;gap:4px;flex-shrink:0;">'+
      '<button onclick="openCFModal(\''+target+'\','+idx+')" style="font-size:11px;padding:3px 8px;border-radius:5px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;"><i class="ti ti-edit"></i></button>'+
      '<button onclick="deleteCF(\''+target+'\','+idx+')" style="font-size:11px;padding:3px 8px;border-radius:5px;border:1px solid rgba(229,62,90,0.3);background:rgba(229,62,90,0.06);color:var(--red);cursor:pointer;"><i class="ti ti-trash"></i></button>'+
    '</div>'+
  '</div>';
}

// 옵션 값 추출 (구버전 string[], 신버전 {value,color}[] 모두 호환)
function cfOptValue(o){ return typeof o==='string'?o:(o.value||''); }
function cfOptColor(o){ return typeof o==='string'?'#666':(o.color||'#666'); }
function cfOptToObj(o){ return typeof o==='string'?{value:o,color:'#666'}:o; }

const CF_PRESET_COLORS=[
  {hex:'#e53e5a',label:'빨강'},
  {hex:'#e8820c',label:'주황'},
  {hex:'#f5b731',label:'노랑'},
  {hex:'#00a872',label:'초록'},
  {hex:'#2d6fd4',label:'파랑'},
  {hex:'#9d7bff',label:'보라'},
  {hex:'#666666',label:'회색'},
  {hex:'#333333',label:'검정'},
];

function openCFModal(target, editIdx){
  const isEdit=editIdx!==undefined;
  const f=isEdit?(customFields[target]||[])[editIdx]:{label:'',type:'Text',required:false,options:[],placeholder:''};
  const opts=(f.options||[]).map(cfOptToObj);
  let modal=document.getElementById('modal-cf');
  if(modal) modal.remove();
  modal=document.createElement('div');
  modal.id='modal-cf';
  modal.className='modal-overlay';
  modal.style.display='flex';
  const targetLabel={'req':'REQ','tc':'TC','cycle':'Cycle'}[target];
  modal.innerHTML=
    '<div class="modal" style="width:520px;max-height:88vh;border-radius:12px;padding:0;display:flex;flex-direction:column;">'+
      '<div style="padding:14px 20px;border-bottom:1px solid var(--border);background:#f8f9fb;display:flex;align-items:center;gap:8px;flex-shrink:0;">'+
        '<i class="ti ti-table-options" style="font-size:18px;color:var(--blue);"></i>'+
        '<span style="font-size:15px;font-weight:700;">'+(isEdit?'필드 수정':'필드 추가')+' — '+targetLabel+'</span>'+
        '<button onclick="this.closest(\'.modal-overlay\').remove()" style="margin-left:auto;width:28px;height:28px;border-radius:6px;border:1px solid var(--border);background:#fff;color:var(--text3);cursor:pointer;"><i class="ti ti-x"></i></button>'+
      '</div>'+
      '<div style="padding:18px 20px;display:flex;flex-direction:column;gap:13px;overflow-y:auto;flex:1;">'+
        '<div><label style="font-size:12px;color:var(--text3);font-weight:600;display:block;margin-bottom:5px;">필드명 *</label>'+
          '<input id="cf-label" value="'+(f.label||'')+'" placeholder="예: 담당자, 완료일, 검토자..." style="width:100%;font-size:13px;padding:8px 10px;border:1.5px solid var(--border);border-radius:7px;background:#fff;outline:none;box-sizing:border-box;"></div>'+
        '<div><label style="font-size:12px;color:var(--text3);font-weight:600;display:block;margin-bottom:5px;">필드 타입</label>'+
          '<select id="cf-type" onchange="cfTypeChange()" style="width:100%;font-size:13px;padding:8px 10px;border:1.5px solid var(--border);border-radius:7px;background:#fff;outline:none;">'+
            CF_TYPES.map(tp=>'<option '+(f.type===tp?'selected':'')+'>'+tp+'</option>').join('')+
          '</select></div>'+
        // 옵션 목록 (Select/MultiSelect)
        '<div id="cf-options-wrap" style="'+(f.type==='Select'||f.type==='MultiSelect'?'':'display:none;')+'">'+
          '<div style="display:flex;align-items:center;margin-bottom:8px;">'+
            '<label style="font-size:12px;color:var(--text3);font-weight:600;flex:1;">옵션 및 색상</label>'+
            '<button onclick="cfAddOption()" style="font-size:11px;padding:3px 10px;border-radius:5px;border:1px solid rgba(45,111,212,0.3);background:rgba(45,111,212,0.08);color:var(--blue);cursor:pointer;"><i class="ti ti-plus"></i> 옵션 추가</button>'+
          '</div>'+
          '<div id="cf-opt-list" style="display:flex;flex-direction:column;gap:6px;">'+
            opts.map((o,i)=>cfOptRowHtml(o,i)).join('')+
          '</div>'+
        '</div>'+
        '<div><label style="font-size:12px;color:var(--text3);font-weight:600;display:block;margin-bottom:5px;">힌트 텍스트</label>'+
          '<input id="cf-placeholder" value="'+(f.placeholder||'')+'" placeholder="입력 안내 텍스트..." style="width:100%;font-size:13px;padding:8px 10px;border:1.5px solid var(--border);border-radius:7px;background:#fff;outline:none;box-sizing:border-box;"></div>'+
        '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--text2);">'+
          '<input type="checkbox" id="cf-required" '+(f.required?'checked':'')+' style="width:16px;height:16px;cursor:pointer;"> 필수 필드로 설정'+
        '</label>'+
      '</div>'+
      '<div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;flex-shrink:0;">'+
        '<button onclick="this.closest(\'.modal-overlay\').remove()" style="font-size:13px;padding:7px 18px;border-radius:7px;border:1.5px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;">취소</button>'+
        '<button onclick="saveCF(\''+target+'\','+(isEdit?editIdx:'null')+')" style="font-size:13px;padding:7px 18px;border-radius:7px;border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:600;">'+(isEdit?'수정':'추가')+'</button>'+
      '</div>'+
    '</div>';
  document.body.appendChild(modal);
}

function cfOptRowHtml(o, idx){
  const color=cfOptColor(o)||'#666666';
  const value=cfOptValue(o);
  return '<div id="cf-opt-'+idx+'" style="display:flex;align-items:center;gap:6px;padding:4px 0;">'+
    '<div style="width:20px;height:20px;border-radius:50%;background:'+color+';flex-shrink:0;border:2px solid rgba(0,0,0,0.1);" id="cf-opt-preview-'+idx+'"></div>'+
    '<input value="'+value+'" placeholder="옵션명" oninput="cfOptUpdateVal('+idx+',this.value)" style="flex:1;font-size:13px;padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;background:#fff;outline:none;">'+
    '<div style="display:flex;gap:3px;flex-shrink:0;">'+
      CF_PRESET_COLORS.map(c=>'<div onclick="cfOptUpdateColor('+idx+',\''+c.hex+'\')" title="'+c.label+'" style="width:18px;height:18px;border-radius:50%;background:'+c.hex+';cursor:pointer;border:2px solid '+(color===c.hex?'#000':'transparent')+';transition:transform 0.1s;" id="cf-color-dot-'+idx+'-'+c.hex.replace('#','')+'" onmouseenter="this.style.transform=\'scale(1.3)\'" onmouseleave="this.style.transform=\'\'"></div>').join('')+
    '</div>'+
    '<button onclick="cfOptRemove('+idx+')" style="width:22px;height:22px;border-radius:4px;border:none;background:none;color:var(--text3);cursor:pointer;flex-shrink:0;" onmouseenter="this.style.color=\'var(--red)\'" onmouseleave="this.style.color=\'var(--text3)\'"><i class="ti ti-x"></i></button>'+
  '</div>';
}

function cfOptUpdateVal(idx, val){
  if(!window._cfOptData[idx]) window._cfOptData[idx]={value:val,color:'#666666'};
  window._cfOptData[idx].value=val;
}

function cfOptUpdateColor(idx, color){
  const preview=document.getElementById('cf-opt-preview-'+idx);
  if(preview) preview.style.background=color;
  CF_PRESET_COLORS.forEach(c=>{
    const dot=document.getElementById('cf-color-dot-'+idx+'-'+c.hex.replace('#',''));
    if(dot) dot.style.border='2px solid '+(c.hex===color?'#000':'transparent');
  });
}

function cfGetCurrentOpts(){
  const list=document.getElementById('cf-opt-list');
  if(!list) return [];
  return Array.from(list.querySelectorAll('[id^="cf-opt-"]')).filter(r=>r.id.match(/^cf-opt-\d+$/)).map(row=>{
    const val=row.querySelector('input')?.value?.trim()||'';
    const preview=row.querySelector('[id^="cf-opt-preview-"]');
    const color=preview?preview.style.background:'#666666';
    return {value:val,color:color||'#666666'};
  }).filter(o=>o.value);
}

function cfAddOption(){
  const list=document.getElementById('cf-opt-list');
  if(!list) return;
  const idx=list.children.length;
  const div=document.createElement('div');
  div.innerHTML=cfOptRowHtml({value:'',color:'#666666'},idx);
  list.appendChild(div.firstChild);
}

function cfOptRemove(idx){
  const row=document.getElementById('cf-opt-'+idx);
  if(row) row.remove();
  const list=document.getElementById('cf-opt-list');
  if(list) Array.from(list.children).forEach((r,i)=>{r.id='cf-opt-'+i;});
}



function cfTypeChange(){
  const type=document.getElementById('cf-type')?.value;
  const wrap=document.getElementById('cf-options-wrap');
  if(wrap) wrap.style.display=(type==='Select'||type==='MultiSelect')?'':'none';
}

async function saveCF(target, editIdx){
  const label=document.getElementById('cf-label')?.value?.trim();
  if(!label){ showToast('필드명을 입력하세요'); return; }
  const type=document.getElementById('cf-type')?.value||'Text';
  const placeholder=document.getElementById('cf-placeholder')?.value?.trim()||'';
  const required=document.getElementById('cf-required')?.checked||false;
  // 옵션 수집 (색상 포함)
  const options=(type==='Select'||type==='MultiSelect')?cfGetCurrentOpts().filter(o=>o.value):[];
  const field={label,type,options,placeholder,required,id:'cf-'+Date.now()};
  if(!customFields[target]) customFields[target]=[];
  if(editIdx!==null&&editIdx!==undefined){
    const existing=customFields[target][editIdx];
    customFields[target][editIdx]={...existing,...field,id:existing.id||field.id};
  } else customFields[target].push(field);
  await saveCustomFields();
  document.getElementById('modal-cf')?.remove();
  renderSysCustom();
  tmRenderCFFilters();
  showToast('커스텀 필드가 저장되었습니다');
}

async function deleteCF(target, idx){
  if(!confirm('이 필드를 삭제하시겠습니까?')) return;
  customFields[target].splice(idx,1);
  await saveCustomFields();
  renderSysCustom();
  showToast('필드가 삭제되었습니다');
}

// 커스텀 필드 순서 변경 (dir: -1 위, +1 아래)
async function moveCF(target, idx, dir){
  const arr=customFields[target];
  if(!arr) return;
  const ni=idx+dir;
  if(ni<0||ni>=arr.length) return;
  [arr[idx],arr[ni]]=[arr[ni],arr[idx]];
  await saveCustomFields();
  renderSysCustom();
  tmRenderCFFilters(); // 필터 순서도 즉시 반영
}

async function toggleCFActive(target, idx){
  if(!customFields[target]||!customFields[target][idx]) return;
  const f=customFields[target][idx];
  f.active=f.active===false?true:false;
  await saveCustomFields();
  renderSysCustom();
  showToast(f.label+' '+(f.active?'활성화':'비활성화')+'되었습니다');
}

async function toggleCFShowInfo(target, idx){
  if(!customFields[target]||!customFields[target][idx]) return;
  const f=customFields[target][idx];
  f.show_info=f.show_info===false?true:false;
  await saveCustomFields();
  renderSysCustom();
  showToast(f.label+' Information '+(f.show_info!==false?'표시':'숨김'));
}

async function toggleCFShowFilter(target, idx){
  if(!customFields[target]||!customFields[target][idx]) return;
  const f=customFields[target][idx];
  f.show_filter=!f.show_filter;
  await saveCustomFields();
  renderSysCustom();
  tmRenderCFFilters(); // 필터 즉시 갱신
  showToast(f.label+' 필터 '+(f.show_filter?'추가':'제거'));
}
async function toggleCFShowPdf(target, idx){
  if(!customFields[target]||!customFields[target][idx]) return;
  const f=customFields[target][idx];
  f.show_pdf=f.show_pdf===false?true:false;
  await saveCustomFields();
  renderSysCustom();
  showToast(f.label+' PDF 출력 '+(f.show_pdf!==false?'표시':'숨김'));
}
async function toggleCFUseInCycle(target, idx){
  if(!customFields[target]||!customFields[target][idx]) return;
  const f=customFields[target][idx];
  f.useInCycle=f.useInCycle===false?true:false;
  await saveCustomFields();
  renderSysCustom();
  showToast(f.label+' 사이클 필터 '+(f.useInCycle!==false?'적용':'제외'));
}

function renderCustomFieldsForTarget(target, dataObj, saveFn){
  if(!customFields||!customFields[target]) return '';
  const fields=(customFields[target]||[]).filter(f=>f.active!==false&&f.show_info!==false);
  if(!fields.length) return '';
  const cfData=dataObj.custom_fields||{};
  const row=(label,content)=>'<div style="display:flex;align-items:flex-start;padding:9px 0;border-top:1px solid #f5f5f5;"><div style="width:130px;flex-shrink:0;font-size:13px;color:#aaa;padding-top:2px;">'+label+'</div><div style="flex:1;">'+content+'</div></div>';
  // saveFn을 window에 임시 등록
  const cbKey='__cfCb_'+target+'_'+Date.now();
  window[cbKey]=saveFn;
  return '<div style="margin-top:4px;">'+
    '<div style="font-size:11px;font-weight:700;color:var(--blue);letter-spacing:0.5px;padding:8px 0 4px;border-top:2px solid #f0f0f0;display:flex;align-items:center;gap:5px;"><i class="ti ti-table-options" style="font-size:13px;"></i> 커스텀 필드</div>'+
    fields.map(f=>{
      const val=cfData[f.id]||'';
      let input='';
      const onchg=`window['${cbKey}']('${f.id}',this.value)`;
      const onchgChk=`window['${cbKey}']('${f.id}',String(this.checked))`;
      if(f.type==='Text'||f.type==='URL'){
        input=`<input value="${val}" placeholder="${f.placeholder||''}" onblur="${onchg}" style="width:100%;font-size:13px;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;background:#fff;outline:none;box-sizing:border-box;" onfocus="this.style.borderColor='var(--blue)'">`;
      } else if(f.type==='Number'){
        input=`<input type="number" value="${val}" onblur="${onchg}" style="width:120px;font-size:13px;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;background:#fff;outline:none;">`;
      } else if(f.type==='Textarea'){
        input=`<textarea onblur="${onchg}" placeholder="${f.placeholder||''}" style="width:100%;font-size:13px;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;background:#fff;outline:none;resize:vertical;min-height:60px;box-sizing:border-box;">${val}</textarea>`;
      } else if(f.type==='Date'){
        input=`<input type="date" value="${val}" onchange="${onchg}" style="font-size:13px;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;background:#fff;outline:none;">`;
      } else if(f.type==='Checkbox'){
        input=`<label style="display:flex;align-items:center;gap:6px;cursor:pointer;"><input type="checkbox" ${val==='true'?'checked':''} onchange="${onchgChk}" style="width:16px;height:16px;"><span style="font-size:13px;color:var(--text2);">${f.placeholder||'예/아니오'}</span></label>`;
      } else if(f.type==='Select'){
        const selColor=cfGetOptColor(f,val)||'var(--text)';
        input=`<select onchange="${onchg};this.style.color=cfGetOptColor(document.getElementById('cf-type'),'this.value')||'var(--text)'" style="font-size:13px;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;background:#fff;outline:none;min-width:160px;color:${selColor};">` +
          `<option value="">선택...</option>`+
          (f.options||[]).map(o=>{
            const ov=cfOptValue(o);const oc=cfOptColor(o);
            return `<option value="${ov}" ${val===ov?'selected':''} style="color:${oc};">${ov}</option>`;
          }).join('')+'</select>';
      } else if(f.type==='MultiSelect'){
        input='<div style="display:flex;flex-wrap:wrap;gap:5px;">'+
          (f.options||[]).map(o=>{
            const ov=cfOptValue(o);const oc=cfOptColor(o);
            const on=(val||'').split(',').filter(Boolean).includes(ov);
            return `<span onclick="cfMultiToggle(this,'${cbKey}','${f.id}')" data-val="${ov}" style="font-size:12px;padding:3px 10px;border-radius:12px;cursor:pointer;border:1px solid ${on?oc:'var(--border)'};background:${on?oc+'22':'#fff'};color:${on?oc:'var(--text2)'};">${ov}</span>`;
          }).join('')+'</div>';
      }
      return row((f.required?'<span style="color:var(--red);">*</span> ':'')+f.label, input);
    }).join('')+'</div>';
}

function cfMultiToggle(el, cbKey, fieldId){
  const container=el.parentElement;
  const selected=[];
  container.querySelectorAll('span').forEach(s=>{
    const on=s===el?(s.style.background.includes('rgba(45')?false:true):s.style.background.includes('rgba(45');
    s.style.border='1px solid '+(on?'var(--blue)':'var(--border)');
    s.style.background=on?'rgba(45,111,212,0.1)':'#fff';
    s.style.color=on?'var(--blue)':'var(--text2)';
    if(on) selected.push(s.dataset.val);
  });
  window[cbKey]?.(fieldId, selected.join(','));
}

async function saveTCCustomField(tcid, fieldId, value){
  const tc=tcList.find(t=>t.tcid===tcid||t.id===tcid);
  if(!tc) return;
  if(!tc.custom_fields) tc.custom_fields={};
  tc.custom_fields[fieldId]=value;
  await saveTCFile(tc);
}

async function saveREQCustomField(reqId, fieldId, value){
  const r=reqList.find(x=>x.id===reqId);
  if(!r) return;
  if(!r.custom_fields) r.custom_fields={};
  r.custom_fields[fieldId]=value;
  r.updated_at=new Date().toISOString().slice(0,10);
  saveOneREQ(r);
}

async function saveCycleItemCustomField(cycleId, itemIdx, fieldId, value){
  const cycle=cycleList.find(c=>c.id===cycleId);
  if(!cycle||!cycle.items[itemIdx]) return;
  const item=cycle.items[itemIdx];
  if(!item.custom_fields) item.custom_fields={};
  item.custom_fields[fieldId]=value;
  await saveCycle(cycle);
}

// ══ 시스템: 프롬프트 설정 ══
let promptConfig = {};

// 용도 정의
const PROMPT_DEFS = [
  {
    group: 'REQ', icon: 'ti-file-description', color: 'var(--blue)',
    items: [
      {
        id: 'req_desc',
        label: '요구사항 개요/설명',
        desc: 'REQ Summary → 기능/조건/예외사항 생성',
        defaultPrompt: `당신은 네트워크 장비(EPON/OLT/Switch) 전문 QA 엔지니어입니다.
아래 요구사항 ID와 Summary를 바탕으로 상세 요구사항 설명을 작성하세요.

[요구사항 ID]: {{REQ_ID}}
[Summary]: {{SUMMARY}}

다음 형식으로 한국어로 작성하세요:
## 기능 설명
(해당 기능의 상세 설명)

## 조건
- (동작 조건 목록)

## 예외사항
- (예외 처리 사항 목록)

## 관련 표준/규격
(관련 표준이 있으면 기재, 없으면 생략)`
      },
      {
        id: 'req_scenario',
        label: '요구사항 시나리오',
        desc: 'REQ → 시험 시나리오 항목 생성',
        defaultPrompt: `당신은 네트워크 장비(EPON/OLT/Switch) 전문 QA 엔지니어입니다.
아래 요구사항을 바탕으로 시험이 필요한 시나리오를 도출하세요.

[요구사항 ID]: {{REQ_ID}}
[Summary]: {{SUMMARY}}
[설명]: {{DESCRIPTION}}

다음 형식으로 한국어로 작성하세요 (JSON):
[
  {"id": "SC-01", "desc": "시나리오 설명", "support": "필수"},
  {"id": "SC-02", "desc": "시나리오 설명", "support": "선택"}
]

support 값은 필수/선택/개발예정 중 하나로 지정하세요.
JSON만 출력하고 다른 설명은 하지 마세요.`
      }
    ]
  },
  {
    group: 'TC', icon: 'ti-clipboard-check', color: 'var(--green)',
    items: [
      {
        id: 'tc_object',
        label: 'Test Object (목적)',
        desc: 'TC Summary → 시험 목적 생성',
        defaultPrompt: `당신은 네트워크 장비(EPON/OLT/Switch) 전문 QA 엔지니어입니다.
아래 시험 항목의 목적을 간결하게 작성하세요.

[TC ID]: {{TC_ID}}
[Summary]: {{SUMMARY}}
[REQ 설명]: {{REQ_DESC}}

시험 목적을 2~3문장으로 한국어로 작성하세요.
목적만 작성하고 다른 설명은 하지 마세요.`
      },
      {
        id: 'tc_precondition',
        label: 'Pre-Condition (사전조건)',
        desc: 'TC → 시험 사전조건 생성',
        defaultPrompt: `당신은 네트워크 장비(EPON/OLT/Switch) 전문 QA 엔지니어입니다.
아래 시험 항목의 사전조건을 작성하세요.

[TC ID]: {{TC_ID}}
[Summary]: {{SUMMARY}}
[REQ 설명]: {{REQ_DESC}}

사전조건을 항목 형식으로 한국어로 작성하세요:
1. (장비 연결 상태)
2. (초기 설정 상태)
3. (소프트웨어 버전)
...

사전조건 목록만 작성하고 다른 설명은 하지 마세요.`
      },
      {
        id: 'tc_diagram',
        label: 'Test Diagram (구성도)',
        desc: 'TC → 장비 연결 구성도 텍스트 생성',
        defaultPrompt: `당신은 네트워크 장비(EPON/OLT/Switch) 전문 QA 엔지니어입니다.
아래 시험 항목에 필요한 장비 연결 구성도를 ASCII로 표현하세요.

[TC ID]: {{TC_ID}}
[Summary]: {{SUMMARY}}

ASCII 다이어그램으로 장비 연결 구성을 표현하고
각 장비의 포트/인터페이스 정보를 함께 표기하세요.
예시:
[PC] ─── [OLT(Port1)] ─── [ONT] ─── [PC]

구성도와 간단한 설명만 작성하세요.`
      },
      {
        id: 'tc_steps',
        label: '시험 절차 (Step)',
        desc: 'TC → 시험 절차 Step 자동 생성',
        defaultPrompt: `당신은 네트워크 장비(EPON/OLT/Switch) 전문 QA 엔지니어입니다.
아래 시험 항목의 시험 절차를 Step별로 작성하세요.

[TC ID]: {{TC_ID}}
[Summary]: {{SUMMARY}}
[사전조건]: {{PRECONDITION}}
[REQ 설명]: {{REQ_DESC}}

다음 JSON 형식으로 작성하세요:
[
  {
    "device": "OLT",
    "cli": "show vlan",
    "criteria": "VLAN 100이 Active 상태로 표시되어야 함"
  }
]

- device: 명령어를 입력할 장비명
- cli: 실제 CLI 명령어 (없으면 빈 문자열)
- criteria: 판정 기준 (Pass/Fail 판단 기준)

JSON만 출력하고 다른 설명은 하지 마세요.`
      }
    ]
  }
];

async function loadPromptConfig(){
  try{
    const r=await fetch('/api/prompts');
    if(r.ok) promptConfig=await r.json();
  }catch(e){}
  // 기본값 설정
  PROMPT_DEFS.forEach(g=>g.items.forEach(item=>{
    if(!promptConfig[item.id]) promptConfig[item.id]={
      llm_id:'', prompt:item.defaultPrompt
    };
  }));
}

async function savePromptConfig(){
  try{
    await fetch('/api/prompts',{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(promptConfig)});
  }catch(e){}
}

function initSysPrompt(){
  loadPromptConfig().then(()=>renderSysPrompt());
}

function renderSysPrompt(){
  const wrap=document.getElementById('sys-prompt-panels');
  if(!wrap) return;
  wrap.innerHTML=`
    <div style="display:flex;gap:16px;flex-wrap:wrap;">
      ${PROMPT_DEFS.map(g=>`
        <div style="flex:1;min-width:320px;border:1.5px solid var(--border);border-radius:12px;overflow:hidden;">
          <div style="padding:12px 18px;background:linear-gradient(135deg,rgba(45,111,212,0.06),transparent);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;">
            <i class="ti ${g.icon}" style="font-size:18px;color:${g.color};"></i>
            <span style="font-size:14px;font-weight:700;">${g.group} 용도</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:0;">
            ${g.items.map(item=>promptItemHtml(item)).join('<hr style="margin:0;border:none;border-top:1px solid var(--border);">')}
          </div>
        </div>
      `).join('')}
    </div>`;
}

function promptItemHtml(item){
  const cfg=promptConfig[item.id]||{llm_id:'',prompt:item.defaultPrompt};
  const llmOpts=llmList.map(l=>`<option value="${l.id}" ${cfg.llm_id===l.id?'selected':''}>${l.name||l.url}</option>`).join('');
  return `
    <div style="padding:14px 18px;" id="prompt-item-${item.id}">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:700;color:var(--text);">${item.label}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px;">${item.desc}</div>
        </div>
        <button onclick="resetPrompt('${item.id}')" title="기본값 복원" style="font-size:11px;padding:2px 8px;border-radius:5px;border:1px solid var(--border);background:#fff;color:var(--text3);cursor:pointer;white-space:nowrap;"><i class="ti ti-refresh"></i></button>
      </div>
      <div style="margin-bottom:8px;">
        <label style="font-size:11px;color:var(--text3);font-weight:600;display:block;margin-bottom:4px;">LLM 모델</label>
        <select onchange="promptConfig['${item.id}'].llm_id=this.value;savePromptConfig()"
          style="width:100%;font-size:12px;padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;background:#fff;outline:none;">
          <option value="">모델 선택...</option>
          ${llmOpts}
        </select>
      </div>
      <div>
        <label style="font-size:11px;color:var(--text3);font-weight:600;display:block;margin-bottom:4px;">프롬프트 <span style="font-weight:400;color:#aaa;">{{변수}} 사용 가능</span></label>
        <textarea onblur="promptConfig['${item.id}'].prompt=this.value;savePromptConfig()"
          style="width:100%;font-size:12px;padding:8px 10px;border:1.5px solid var(--border);border-radius:6px;background:#fff;outline:none;resize:vertical;min-height:140px;line-height:1.6;font-family:monospace;box-sizing:border-box;"
          onfocus="this.style.borderColor='var(--blue)'" onblur_extra="this.style.borderColor='var(--border)'"
          >${cfg.prompt}</textarea>
      </div>
    </div>`;
}

function resetPrompt(itemId){
  if(!confirm('기본 프롬프트로 초기화하시겠습니까?')) return;
  const def=PROMPT_DEFS.flatMap(g=>g.items).find(i=>i.id===itemId);
  if(!def) return;
  promptConfig[itemId].prompt=def.defaultPrompt;
  savePromptConfig();
  renderSysPrompt();
  showToast('기본 프롬프트로 초기화되었습니다');
}

// 용도별 LLM + 프롬프트 가져오기
function getPromptCfg(itemId){
  const cfg=promptConfig[itemId]||{};
  const llm=llmList.find(l=>l.id===cfg.llm_id)||llmList[0];
  const def=PROMPT_DEFS.flatMap(g=>g.items).find(i=>i.id===itemId);
  return {llm, prompt:cfg.prompt||(def?.defaultPrompt||'')};
}

// 프롬프트 변수 치환
function fillPrompt(template, vars){
  return Object.entries(vars).reduce((p,[k,v])=>p.replaceAll('{{'+k+'}}',v||''),template);
}

// LLM 호출 공통 함수// ── 1열: 폴더 트리 ──
function tmRenderFolderTree(){
  const tree=document.getElementById('tm-folder-tree');
  if(!tree) return;
  const roots=reqFolders.filter(f=>!f.parent).sort((a,b)=>(a.order||0)-(b.order||0));
  tree.innerHTML=roots.length
    ? roots.map(f=>tmFolderHtml(f,0)).join('')
    : '<div style="padding:20px;text-align:center;font-size:12px;color:var(--text3);">폴더 없음</div>';
}

function tmFolderHtml(f, depth){
  const children=reqFolders.filter(c=>c.parent===f.id).sort((a,b)=>(a.order||0)-(b.order||0));
  const open=req2ExpandedIds.has('tm-'+f.id);
  const sel=tmSelFolderId===f.id;
  const dotColor=f.color==='blue'?'var(--blue)':f.color==='green'?'var(--green)':f.color==='red'?'var(--red)':'var(--yellow)';
  const allFids=tmGetAllFolderIds(f.id);
  const rCnt=reqList.filter(r=>allFids.includes(r.folder)).length;
  const tCnt=tcList.filter(t=>reqList.find(r=>r.id===t.req_id&&allFids.includes(r.folder))).length;
  const indent=depth*16;
  const childHtml=children.length&&open?'<div>'+children.map(c=>tmFolderHtml(c,depth+1)).join('')+'</div>':'';
  return '<div>'+
    // 위쪽 드롭존: 폴더 사이에 끼워넣기
    '<div style="height:5px;border-radius:2px;margin:1px 0;transition:all 0.12s;"'+
      ' ondragover="event.preventDefault();event.stopPropagation();this.style.background=\'var(--blue)\';this.style.height=\'10px\';"'+
      ' ondragleave="this.style.background=\'\';this.style.height=\'5px\';"'+
      ' ondrop="event.stopPropagation();tmFolderDropBetween(event,\''+f.id+'\');this.style.background=\'\';this.style.height=\'5px\';"></div>'+
    // 폴더 아이템
    '<div id="tmf-'+f.id+'"'+
      ' draggable="true"'+
      ' ondragstart="tmFolderDragStart(event,\''+f.id+'\')"'+
      ' ondragover="event.preventDefault();event.stopPropagation();this.style.background=\'rgba(45,111,212,0.12)\';"'+
      ' ondragleave="this.style.background=\''+(sel?'rgba(45,111,212,0.08)':'')+'\';"'+
      ' ondrop="event.stopPropagation();tmFolderDrop(event,\''+f.id+'\')"'+
      ' onclick="tmSelectFolder(\''+f.id+'\')"'+
      ' oncontextmenu="event.preventDefault();tmShowFolderCtx(event,\''+f.id+'\')"'+
      ' style="display:flex;align-items:center;gap:6px;padding:7px 8px;padding-left:'+(10+indent)+'px;border-radius:6px;cursor:pointer;font-size:14px;'+(sel?'background:rgba(45,111,212,0.08);color:var(--blue);font-weight:600;':'color:var(--text2);')+'">'+
      (children.length
        ?'<i class="ti ti-chevron-right" style="font-size:13px;flex-shrink:0;transition:transform 0.15s;'+(open?'transform:rotate(90deg)':'')+'" onclick="event.stopPropagation();tmToggleFolder(\''+f.id+'\')"></i>'
        :'<span style="width:16px;flex-shrink:0;"></span>')+
      '<i class="ti ti-folder'+(open?'-open':'')+'" style="font-size:18px;color:'+dotColor+';flex-shrink:0;"></i>'+
      '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+f.name+'</span>'+
      (rCnt?'<span style="font-size:11px;color:var(--blue);font-weight:700;flex-shrink:0;">'+rCnt+'-'+tCnt+'</span>':'')+
    '</div>'+childHtml+'</div>';
}

// ── TM 폴더 우클릭 메뉴 ──
let _tmCtxFolderId=null;
function tmShowFolderCtx(e, fid){
  _tmCtxFolderId=fid;
  const ctx=document.getElementById('tm-folder-ctx');
  if(!ctx) return;
  ctx.style.display='block';
  ctx.style.left=Math.min(e.clientX, window.innerWidth-180)+'px';
  ctx.style.top=Math.min(e.clientY, window.innerHeight-220)+'px';
  setTimeout(()=>document.addEventListener('click',()=>{ctx.style.display='none';}, {once:true}), 10);
}

// ── TM 폴더 드래그 ──
let _tmDragFolderId=null;
function tmFolderDragStart(e, fid){
  _tmDragFolderId=fid;
  e.dataTransfer.effectAllowed='move';
  e.dataTransfer.setData('text/plain', fid);
  setTimeout(()=>{const el=document.getElementById('tmf-'+fid);if(el)el.style.opacity='0.4';},0);
}

async function tmFolderDrop(e, targetFid){
  e.preventDefault(); e.stopPropagation();
  document.querySelectorAll('[id^="tmf-"]').forEach(el=>{el.style.background='';el.style.opacity='';});
  const srcId=_tmDragFolderId; _tmDragFolderId=null;
  if(!srcId||srcId===targetFid) return;
  const src=reqFolders.find(f=>f.id===srcId);
  const target=reqFolders.find(f=>f.id===targetFid);
  if(!src||!target) return;
  const isDescendant=(pid)=>{if(!pid)return false;if(pid===srcId)return true;const p=reqFolders.find(f=>f.id===pid);return p?isDescendant(p.parent):false;};
  if(isDescendant(targetFid)){showToast('자식 폴더로 이동 불가');return;}
  src.parent=targetFid;
  req2ExpandedIds.add('tm-'+targetFid);
  await req2SaveFolders();
  tmRenderFolderTree();
  showToast('폴더 이동 완료');
}

function tmGetAllFolderIds(fid){
  return [fid,...reqFolders.filter(c=>c.parent===fid).flatMap(c=>tmGetAllFolderIds(c.id))];
}

function tmToggleFolder(fid){
  if(req2ExpandedIds.has('tm-'+fid)) req2ExpandedIds.delete('tm-'+fid);
  else req2ExpandedIds.add('tm-'+fid);
  tmRenderFolderTree();
}

// ── 폴더 사이에 끼워넣기 ──
async function tmFolderDropBetween(e, targetFid){
  const srcId=_tmDragFolderId; _tmDragFolderId=null;
  document.querySelectorAll('[id^="tmf-"]').forEach(el=>{el.style.opacity='';});
  if(!srcId||srcId===targetFid) return;
  const src=reqFolders.find(f=>f.id===srcId);
  const target=reqFolders.find(f=>f.id===targetFid);
  if(!src||!target) return;
  const isDescendant=(pid)=>{if(!pid)return false;if(pid===srcId)return true;const p=reqFolders.find(f=>f.id===pid);return p?isDescendant(p.parent):false;};
  if(isDescendant(targetFid)) return;
  // 타겟과 같은 부모 레벨로 이동, 타겟 앞에 삽입
  const targetParent=target.parent||null;
  src.parent=targetParent;
  const siblings=reqFolders.filter(f=>(f.parent||null)===targetParent);
  const withoutSrc=siblings.filter(f=>f.id!==srcId);
  const tgtIdx=withoutSrc.findIndex(f=>f.id===targetFid);
  withoutSrc.splice(Math.max(0,tgtIdx),0,src);
  withoutSrc.forEach((f,i)=>{f.order=i;});
  await req2SaveFolders();
  tmRenderFolderTree();
  showToast('폴더 순서 변경 완료');
}

function tmSelectFolder(fid){
  tmSelFolderId=fid; tmSelReqId=null; tmSelTcId=null;
  const hasChildren=reqFolders.some(c=>c.parent===fid);
  tmFolderMode=hasChildren?'all':'single';
  req2ExpandedIds.add('tm-'+fid);
  localStorage.setItem('utop_tm_folder', fid);
  tmRenderFolderTree();
  const f=reqFolders.find(x=>x.id===fid);
  // 상위 폴더 포함 풀 경로
  const getPath=(id)=>{const parts=[];let cur=id;let safety=0;while(cur&&safety++<10){const f=reqFolders.find(x=>x.id===cur);if(!f)break;parts.unshift(f.name);cur=f.parent||null;}return parts.join(' / ');};
  const fullPath=getPath(fid)+(hasChildren?' 전체':'');
  const t2=document.getElementById('tm-req-title');
  const t3=document.getElementById('tm-tc-title');
  if(t2) t2.textContent=fullPath;
  if(t3) t3.textContent=fullPath;
  const pdfBtnWrap=document.getElementById('tm-folder-pdf-btn');
  if(pdfBtnWrap){
    pdfBtnWrap.innerHTML=`<button onclick="exportFolderPDF('${fid}')" title="폴더 전체 PDF" style="padding:4px 6px;border-radius:5px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;display:flex;align-items:center;" onmouseenter="this.style.background='var(--bg4)';this.style.color='var(--text)'" onmouseleave="this.style.background='var(--bg3)';this.style.color='var(--text2)'"><i class="ti ti-printer" style="font-size:16px;"></i></button>`;
  }
  // 2열 REQ + 3열 TC 동시 갱신
  tmRenderREQ();
  tmRenderTC();
}

// ── 2열: REQ 목록 ──
function tmRenderREQ(){
  const wrap=document.getElementById('tm-req-list');
  if(!wrap||!tmSelFolderId) return;
  const fids=tmFolderMode==='all'?tmGetAllFolderIds(tmSelFolderId):[tmSelFolderId];
  const search=(document.getElementById('tm-req-search')?.value||'').toLowerCase();
  const cfFilters=getREQCFFilters();
  let reqs=reqList.filter(r=>fids.includes(r.folder));
  if(search) reqs=reqs.filter(r=>(r.reqid||'').toLowerCase().includes(search)||(r.title||'').toLowerCase().includes(search));
  // 커스텀 필드 필터 적용
  Object.entries(cfFilters).forEach(([fid,val])=>{
    reqs=reqs.filter(r=>{const v=(r.custom_fields||{})[fid]||'';return v===val||v.split(',').includes(val);});
  });
  const cnt=document.getElementById('tm-req-count');
  if(cnt) cnt.textContent=reqs.length+'개';
  if(!reqs.length){ wrap.innerHTML='<div style="padding:30px;text-align:center;color:var(--text3);font-size:13px;">REQ 없음</div>'; return; }
  wrap.innerHTML=reqs.map(r=>{
    const sel=tmSelReqId===r.id;
    const isOpen=sel;
    const tcCnt=tcList.filter(t=>t.req_id===r.id).length||(r.tc||[]).length;
    const cfBadges=getCFBadges('req',r);
    return '<div id="tmr-'+r.id+'">'+
      '<div style="padding:8px 12px;border-bottom:1px solid #f0f0f0;background:'+(isOpen?'rgba(45,111,212,0.05)':'')+';border-left:3px solid '+(isOpen?'var(--blue)':'transparent')+';">'+
        '<div style="display:flex;align-items:center;gap:5px;min-width:0;">'+
          '<input type="checkbox" onclick="event.stopPropagation();tmToggleREQSel(\''+r.id+'\',this.checked)" '+(tmSelReqIds.has(r.id)?'checked':'')+' style="flex-shrink:0;cursor:pointer;width:14px;height:14px;margin-right:2px;">'+
          '<i class="ti ti-chevron-right" onclick="tmSelectREQ(\''+r.id+'\')" style="font-size:11px;color:var(--text3);transition:transform 0.15s;'+(isOpen?'transform:rotate(90deg)':'')+';flex-shrink:0;cursor:pointer;padding:2px;"></i>'+
          '<span onclick="tmSelectREQ(\''+r.id+'\')" style="font-family:monospace;font-size:13px;color:var(--blue);font-weight:700;white-space:nowrap;flex-shrink:0;cursor:pointer;user-select:none;">'+r.reqid+'</span>'+
          '<span id="tm-req-title-'+r.id+'" style="font-size:13px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;cursor:text;user-select:none;padding:2px 4px;border-radius:4px;" onclick="event.stopPropagation();tmEditREQTitle(\''+r.id+'\')" onmouseenter="this.style.background=\'rgba(45,111,212,0.06)\'" onmouseleave="this.style.background=\'\'" title="클릭으로 수정">'+r.title+'</span>'+
          (tcCnt?'<span style="font-size:11px;font-weight:700;color:var(--blue);white-space:nowrap;flex-shrink:0;background:rgba(45,111,212,0.08);padding:1px 6px;border-radius:4px;">TC'+tcCnt+'</span>':'')+
          '<button onclick="event.stopPropagation();exportReqPDF(\''+r.id+'\')" title="PDF 출력" style="flex-shrink:0;padding:4px 6px;border-radius:5px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;display:flex;align-items:center;" onmouseenter="this.style.background=\'var(--bg4)\';this.style.color=\'var(--text)\'" onmouseleave="this.style.background=\'var(--bg3)\';this.style.color=\'var(--text2)\'"><i class="ti ti-printer" style="font-size:16px;"></i></button>'+
        '</div>'+
      '</div>'+
      '<div id="tmr-detail-'+r.id+'" style="'+(isOpen?'':'display:none;')+'border-bottom:2px solid rgba(45,111,212,0.12);">'+
        (isOpen?tmBuildREQDetail(r):'')+
      '</div>'+
    '</div>';
  }).join('');
}

function tmSelectREQ(reqId){
  if(tmSelReqId===reqId){ tmSelReqId=null; tmRenderREQ(); tmRenderTC(); return; }
  tmSelReqId=reqId; tmSelTcId=null;
  tmRenderREQ();
  // TC 타이틀은 폴더 풀네임 유지 (변경 안 함)
  tmRenderTC();
}

function tmBuildREQDetail(r){
  const curTab=window['tmReqTab_'+r.id]||'details';
  const tabs=[
    {id:'details',label:'Information'},
    {id:'scenario',label:'Requirement Description'},
    {id:'tc',label:'TC Link'},
  ];
  const tabBar=tabs.map(t=>'<div onclick="tmSwitchREQTab(\''+r.id+'\',\''+t.id+'\')" style="padding:8px 14px;font-size:12px;font-weight:500;cursor:pointer;white-space:nowrap;flex-shrink:0;border-bottom:2px solid '+(curTab===t.id?'var(--blue)':'transparent')+';color:'+(curTab===t.id?'var(--blue)':'var(--text3)')+';">'+t.label+'</div>').join('');
  return '<div style="display:flex;overflow-x:auto;border-bottom:1px solid var(--border);background:#fafbfc;">'+tabBar+'</div>'+
    '<div style="padding:14px 16px;" id="tmr-tabcontent-'+r.id+'">'+tmREQTabContent(r,curTab)+'</div>';
}

function tmSwitchREQTab(reqId, tab){
  window['tmReqTab_'+reqId]=tab;
  const r=reqList.find(x=>x.id===reqId);
  if(!r) return;
  const wrap=document.getElementById('tmr-detail-'+reqId);
  if(wrap) wrap.innerHTML=tmBuildREQDetail(r);
  if(tab==='scenario') setTimeout(()=>req2InitTiny(reqId), 150);
  else req2DestroyTiny(reqId);
}

function tmREQTabContent(r, tab){
  if(tab==='details') return req2TabDetails(r);
  if(tab==='scenario') return req2TabScenario(r);
  if(tab==='tc'){
    const tcs=tcList.filter(t=>t.req_id===r.id).concat(
      (r.tc||[]).filter(ref=>!tcList.find(t=>t.tcid===ref.tcid)).map(ref=>({...ref,req_id:r.id}))
    );
    if(!tcs.length) return '<div style="padding:20px;text-align:center;color:var(--text3);font-size:13px;">연결된 TC 없음</div>';
    return '<div style="font-size:12px;color:var(--text3);margin-bottom:8px;">연결된 TC '+tcs.length+'개</div>'+
      tcs.map(t=>'<div style="padding:6px 10px;border-radius:6px;background:#f8f9fb;margin-bottom:4px;font-family:monospace;font-size:12px;color:var(--blue);">'+t.tcid+' <span style="font-family:sans-serif;color:var(--text2);font-size:12px;">'+(t.name||'')+'</span></div>').join('');
  }
  return '';
}

// ── 3열: TC 목록 ──
let tmLastTCList=[];  // 마지막으로 렌더된 TC 목록 (PDF 다중 추출용)
function tmRenderTC(){
  const wrap=document.getElementById('tm-tc-list');
  if(!wrap) return;
  const search=(document.getElementById('tm-tc-search')?.value||'').toLowerCase();
  const cfFilters=getTCCFFilters();

  // TC 소스: REQ 선택 시 해당 TC만, 폴더 선택 시 전체
  let baseTCs=[];
  if(tmSelReqId){
    const r=reqList.find(x=>x.id===tmSelReqId);
    if(!r){ wrap.innerHTML=''; return; }
    const seen=new Set();
    const fromList=tcList.filter(t=>t.req_id===r.id);
    const fromRefs=(r.tc||[]).map(ref=>{const f=tcList.find(t=>t.tcid===ref.tcid);return f?{...ref,...f}:{...ref,req_id:r.id};});
    [...fromList,...fromRefs].forEach(t=>{const k=t.tcid||t.id||'';if(k&&!seen.has(k)){seen.add(k);baseTCs.push(t);}});
  } else if(tmSelFolderId){
    const fids=tmFolderMode==='all'?tmGetAllFolderIds(tmSelFolderId):[tmSelFolderId];
    const reqs=reqList.filter(r=>fids.includes(r.folder));
    const seen=new Set();
    reqs.forEach(r=>{
      const fromList=tcList.filter(t=>t.req_id===r.id);
      const fromRefs=(r.tc||[]).map(ref=>{const f=tcList.find(t=>t.tcid===ref.tcid);return f?{...ref,...f}:{...ref,req_id:r.id};});
      [...fromList,...fromRefs].forEach(t=>{const k=t.tcid||t.id||'';if(k&&!seen.has(k)){seen.add(k);baseTCs.push(t);}});
    });
  } else {
    wrap.innerHTML='<div style="padding:40px 16px;text-align:center;color:var(--text3);font-size:13px;"><i class="ti ti-clipboard-check" style="font-size:28px;display:block;margin-bottom:8px;opacity:0.3;"></i>REQ를 선택하세요</div>';
    return;
  }

  let tcs=[...baseTCs];
  if(search) tcs=tcs.filter(t=>(t.tcid||'').toLowerCase().includes(search)||(t.name||'').toLowerCase().includes(search));
  // 커스텀 필드 필터 적용
  Object.entries(cfFilters).forEach(([fid,val])=>{
    tcs=tcs.filter(t=>{const v=((tcList.find(x=>x.tcid===(t.tcid||t.id))||t).custom_fields||{})[fid]||'';return v===val||v.split(',').includes(val);});
  });

  tmLastTCList=tcs;  // PDF 다중 추출용 현재 목록 저장
  const cnt=document.getElementById('tm-tc-count');
  if(cnt) cnt.textContent=tcs.length+'개';
  const sevColor={'Critical':'var(--red)','Major':'#e8820c','Normal':'var(--blue)','Minor':'var(--green)','Cosmetic':'var(--text3)'};

  if(!tcs.length){
    wrap.innerHTML='<div style="padding:30px;text-align:center;color:var(--text3);font-size:13px;">TC 없음<br><button onclick="tmAddTC()" style="margin-top:8px;font-size:12px;padding:5px 12px;border-radius:6px;border:1.5px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;"><i class="ti ti-plus"></i> TC 추가</button></div>';
    return;
  }
  wrap.innerHTML=tcs.map(t=>{
    const tcid=t.tcid||t.id||'';
    const isOpen=tmSelTcId===tcid;
    const fullTC=tcList.find(x=>x.tcid===tcid||x.id===tcid)||t;
    const cfBadges=getCFBadges('tc', fullTC);
    return '<div id="tmt-'+tcid+'">'+
      '<div style="padding:9px 14px;border-bottom:1px solid #f0f0f0;background:'+(isOpen?'rgba(45,111,212,0.05)':'')+';border-left:3px solid '+(isOpen?'var(--blue)':'transparent')+';">'+
        '<div style="display:flex;align-items:center;gap:4px;">'+
          '<input type="checkbox" onclick="event.stopPropagation();tmToggleTCSel(\''+tcid+'\',this.checked)" '+(tmSelTcIds.has(tcid)?'checked':'')+' style="flex-shrink:0;cursor:pointer;width:14px;height:14px;margin-right:2px;">'+
          '<i class="ti ti-chevron-right" onclick="tmSelectTC(\''+tcid+'\')" style="font-size:11px;color:var(--text3);transition:transform 0.15s;'+(isOpen?'transform:rotate(90deg)':'')+';flex-shrink:0;cursor:pointer;padding:2px;"></i>'+
          '<span onclick="tmSelectTC(\''+tcid+'\')" style="font-family:monospace;font-size:13px;color:var(--blue);font-weight:700;white-space:nowrap;flex-shrink:0;cursor:pointer;user-select:none;">'+tcid+'</span>'+
          '<span id="tm-tc-title-'+tcid+'" style="font-size:13px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;cursor:text;user-select:none;padding:2px 4px;border-radius:4px;" onclick="event.stopPropagation();tmEditTCTitle(\''+tcid+'\')" onmouseenter="this.style.background=\'rgba(45,111,212,0.06)\'" onmouseleave="this.style.background=\'\'" title="클릭으로 수정">'+(t.name||'')+'</span>'+
          ((fullTC.steps||[]).length?'<span style="font-size:11px;font-weight:700;color:var(--blue);white-space:nowrap;flex-shrink:0;background:rgba(45,111,212,0.12);padding:1px 7px;border-radius:10px;">Step '+(fullTC.steps||[]).length+'</span>':'')+
          '<button onclick="event.stopPropagation();exportTCPDF(\''+tcid+'\')" title="PDF 출력" style="flex-shrink:0;padding:4px 6px;border-radius:5px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;display:flex;align-items:center;" onmouseenter="this.style.background=\'var(--bg4)\';this.style.color=\'var(--text)\'" onmouseleave="this.style.background=\'var(--bg3)\';this.style.color=\'var(--text2)\'"><i class="ti ti-printer" style="font-size:16px;"></i></button>'+
        '</div>'+
      '</div>'+
      '<div id="tmt-detail-'+tcid+'" style="'+(isOpen?'':'display:none;')+'border-bottom:2px solid rgba(45,111,212,0.12);background:#fafbfc;">'+
        (isOpen?tmBuildTCDetail(fullTC):'')+
      '</div>'+
    '</div>';
  }).join('');
}

async function tmSelectTC(tcid){
  if(tmSelTcId===tcid){ tmSelTcId=null; tmRenderTC(); return; }
  tmSelTcId=tcid;

  let fullTC=tcList.find(t=>t.tcid===tcid||t.id===tcid);

  try{
    const r=await fetch('/api/tc/'+_tcUrl(tcid));
    if(r.ok){
      const data=await r.json();
      const merged={
        status:'Draft', severity:'Normal', products:[], steps:[],
        issue_list:[], result_history:[], traffic:{}, object:'', precondition:'',
        ...(fullTC||{}), ...data
      };
      const idx=tcList.findIndex(t=>t.tcid===tcid||t.id===tcid);
      if(idx>=0) tcList[idx]=merged; else tcList.push(merged);
      fullTC=merged;
    } else {
      // 파일 없음 → 기본값으로 TC 파일 생성
      const base={
        tcid, id:tcid,
        name: fullTC?.name||'',
        req_id: fullTC?.req_id||'',
        status: fullTC?.status||'Draft',
        severity: fullTC?.severity||'Normal',
        products: fullTC?.products||[],
        steps: fullTC?.steps||[],
        issue_list: [],
        result_history: [],
        traffic: {},
        object: '',
        precondition: '',
        created_at: new Date().toISOString().slice(0,10),
        updated_at: new Date().toISOString().slice(0,10),
      };
      await saveTCFile(base);
      const idx=tcList.findIndex(t=>t.tcid===tcid||t.id===tcid);
      if(idx>=0) tcList[idx]=base; else tcList.push(base);
      fullTC=base;
    }
  }catch(e){
    // 네트워크 오류 시에도 기본값으로 표시
    if(fullTC){
      fullTC={
        status:'Draft', severity:'Normal', products:[], steps:[],
        issue_list:[], result_history:[], traffic:{}, object:'', precondition:'',
        ...fullTC
      };
    }
  }
  tmRenderTC();
}

function tmBuildTCDetail(tc){
  const tcid=tc.tcid||tc.id||'';
  const curTab=window['tmTCTab_'+tcid]||'info';
  const steps=tc.steps||[];
  const tabs=[
    {id:'info',label:'Information'},
    {id:'env',label:'Test Environments'},{id:'traffic',label:'Traffic Generator'},
    {id:'procedure',label:'시험 절차',badge:(tc.checks&&tc.checks.length)||steps.length},
    {id:'issue',label:'Issue Tracker'},{id:'history',label:'Test Result History'},
  ];
  const tabBar=tabs.map(t=>'<div onclick="tmSwitchTCTab(\''+tcid+'\',\''+t.id+'\')" style="padding:8px 12px;font-size:12px;font-weight:500;cursor:pointer;white-space:nowrap;flex-shrink:0;border-bottom:2px solid '+(curTab===t.id?'var(--blue)':'transparent')+';color:'+(curTab===t.id?'var(--blue)':'var(--text3)')+';">'+t.label+(t.badge?'<span style="font-size:10px;padding:1px 5px;border-radius:6px;background:rgba(45,111,212,0.1);color:var(--blue);margin-left:3px;">'+t.badge+'</span>':'')+'</div>').join('');
  return '<div style="display:flex;overflow-x:auto;border-bottom:1px solid var(--border);background:#fafbfc;">'+tabBar+'</div>'+
    '<div style="padding:14px 16px;background:#fff;" id="tmt-tabcontent-'+tcid+'">'+tcTabContent(tc,curTab)+'</div>';
}

function tmSwitchTCTab(tcid, tab){
  window['tmTCTab_'+tcid]=tab;
  const tc=tcList.find(t=>t.tcid===tcid||t.id===tcid);
  if(!tc) return;
  const wrap=document.getElementById('tmt-detail-'+tcid);
  if(wrap) wrap.innerHTML=tmBuildTCDetail(tc);
}

// tm 페이지 REQ 제목 클릭 수정
function tmEditREQTitle(reqId){
  // 이미 수정 중이면 무시
  if(document.querySelector('.tm-title-editing')) return;
  const el=document.getElementById('tm-req-title-'+reqId);
  const r=reqList.find(x=>x.id===reqId);
  if(!r||!el) return;
  const orig=r.title;
  const input=document.createElement('input');
  input.className='tm-title-editing';
  input.value=orig;
  input.style.cssText='font-size:13px;padding:2px 6px;border:1.5px solid var(--blue);border-radius:4px;background:#fff;outline:none;width:100%;box-sizing:border-box;';
  el.replaceWith(input);
  input.focus(); input.select();
  let saved=false;
  const save=async()=>{
    if(saved) return; saved=true;
    const v=input.value.trim()||orig;
    r.title=v; r.updated_at=new Date().toISOString().slice(0,10);
    await saveOneREQ(r);
    tmRenderREQ();
  };
  input.onblur=save;
  input.onkeydown=e=>{
    if(e.key==='Enter'){e.preventDefault();save();}
    if(e.key==='Escape'){saved=true;r.title=orig;tmRenderREQ();}
  };
}

// tm 페이지 TC 제목 클릭 수정
function tmEditTCTitle(tcid){
  if(document.querySelector('.tm-title-editing')) return;
  const el=document.getElementById('tm-tc-title-'+tcid);
  const tc=tcList.find(t=>t.tcid===tcid||t.id===tcid);
  if(!tc||!el) return;
  const orig=tc.name||'';
  const input=document.createElement('input');
  input.className='tm-title-editing';
  input.value=orig;
  input.style.cssText='font-size:13px;padding:2px 6px;border:1.5px solid var(--blue);border-radius:4px;background:#fff;outline:none;width:100%;box-sizing:border-box;';
  el.replaceWith(input);
  input.focus(); input.select();
  let saved=false;
  const save=async()=>{
    if(saved) return; saved=true;
    const v=input.value.trim()||orig;
    tc.name=v; tc.updated_at=new Date().toISOString().slice(0,10);
    reqList.forEach(r=>{const ref=(r.tc||[]).find(t=>t.tcid===tcid);if(ref)ref.name=v;});
    await saveTCFile(tc);
    tmRenderTC();
  };
  input.onblur=save;
  input.onkeydown=e=>{
    if(e.key==='Enter'){e.preventDefault();save();}
    if(e.key==='Escape'){saved=true;tc.name=orig;tmRenderTC();}
  };
}

async function tmSubmitNewREQ(reqid){
  const title=document.getElementById('tm-new-req-name')?.value?.trim();
  if(!title){ showToast('Summary를 입력하세요'); return; }
  if(!tmSelFolderId){ showToast('폴더를 선택하세요'); return; }

  if(reqList.find(r=>r.reqid===reqid)){ showToast('이미 존재하는 REQ ID입니다'); return; }

  const newREQ={
    id:'req-'+Date.now(),
    reqid, title,
    folder:tmSelFolderId,
    status:'Draft', priority:'Medium',
    products:[], confluence:'', tc:[],
    custom_fields:{},
    created_at:new Date().toISOString().slice(0,10),
    updated_at:new Date().toISOString().slice(0,10),
  };

  reqList.push(newREQ);
  saveOneREQ(newREQ);

  document.getElementById('tm-new-req-row')?.remove();
  showToast('REQ 추가: '+reqid);
  tmRenderREQ();
  // 새 REQ 자동 선택
  setTimeout(()=>tmSelectREQ(newREQ.id), 100);
}

function tmAddTC(){
  if(!tmSelReqId){ showToast('REQ를 먼저 선택하세요'); return; }
  const r=reqList.find(x=>x.id===tmSelReqId);
  if(!r) return;

  // TC ID 자동 생성 (기존 TC 기반)
  const existingTCs=r.tc||[];
  let autoId='';
  if(existingTCs.length>0){
    // 마지막 TC ID에서 숫자 증가
    const lastId=existingTCs[existingTCs.length-1].tcid||'';
    const m=lastId.match(/^(.*-)(\d+)$/);
    if(m) autoId=m[1]+String(parseInt(m[2])+1).padStart(m[2].length,'0');
    else autoId=lastId+'-001';
  } else {
    // 첫 번째 TC: REQ ID 기반
    autoId=(r.reqid||'TC').replace('U-REQ-','U-REQ-')+'-TC-01-001';
  }

  // TC 목록 맨 아래에 인라인 입력 행 추가
  const wrap=document.getElementById('tm-tc-list');
  if(!wrap) return;

  // 기존 입력창 있으면 제거
  document.getElementById('tm-new-tc-row')?.remove();

  const row=document.createElement('div');
  row.id='tm-new-tc-row';
  row.style.cssText='padding:10px 14px;border-bottom:2px solid var(--blue);background:rgba(45,111,212,0.03);';
  row.innerHTML=
    '<div style="display:flex;align-items:center;gap:6px;">'+
      '<i class="ti ti-plus" style="font-size:13px;color:var(--blue);flex-shrink:0;"></i>'+
      '<span style="font-family:monospace;font-size:11px;color:var(--text3);white-space:nowrap;flex-shrink:0;">'+autoId+'</span>'+
      '<input id="tm-new-tc-name" placeholder="Summary 입력 후 Enter..." style="flex:1;font-size:13px;padding:4px 8px;border:1.5px solid var(--blue);border-radius:6px;background:#fff;outline:none;" '+
        'onkeydown="if(event.key===\'Enter\')tmSubmitNewTC(\''+r.id+'\',\''+autoId+'\');if(event.key===\'Escape\')document.getElementById(\'tm-new-tc-row\')?.remove()">'+
      '<button onclick="tmSubmitNewTC(\''+r.id+'\',\''+autoId+'\')" style="font-size:11px;padding:4px 10px;border-radius:5px;border:none;background:var(--blue);color:#fff;cursor:pointer;flex-shrink:0;">추가</button>'+
      '<button onclick="document.getElementById(\'tm-new-tc-row\')?.remove()" style="font-size:11px;padding:4px 8px;border-radius:5px;border:1px solid var(--border);background:#fff;color:var(--text3);cursor:pointer;flex-shrink:0;"><i class="ti ti-x"></i></button>'+
    '</div>';
  wrap.appendChild(row);
  setTimeout(()=>document.getElementById('tm-new-tc-name')?.focus(), 50);
}

async function tmSubmitNewTC(reqId, tcid){
  const name=document.getElementById('tm-new-tc-name')?.value?.trim();
  if(!name){ showToast('Summary를 입력하세요'); return; }

  const r=reqList.find(x=>x.id===reqId);
  if(!r) return;

  tcid=_uniqueTcId(tcid);   // 자동 ID 전역 유일 보장(중복이면 끝 숫자 +1)

  const newTC={
    tcid, id:tcid, name, req_id:reqId,
    status:'Draft', severity:'Normal', products:[],
    steps:[], issue_list:[], result_history:[],
    traffic:{}, object:'', precondition:'',
    custom_fields:{},
    created_at:new Date().toISOString().slice(0,10),
    updated_at:new Date().toISOString().slice(0,10),
  };

  if(!r.tc) r.tc=[];
  r.tc.push({tcid, name});
  saveOneREQ(r);
  await saveTCFile(newTC);
  tcList.push(newTC);

  document.getElementById('tm-new-tc-row')?.remove();
  showToast('TC 추가: '+tcid);
  tmRenderTC();
  // 새 TC 자동 선택
  setTimeout(()=>tmSelectTC(tcid), 100);
}

// ── 폴더 추가 (tm 페이지용) ──
// ── 드래그 리사이즈 ──
// ══ SNMP OID Management ══
// 공개 표준 MIB-II / IF-MIB / ENTITY / HOST-RESOURCES OID (RFC 1213, 2863 등)
const SNMP_STD_OIDS=[
  {name:'sysDescr',oid:'1.3.6.1.2.1.1.1.0',access:'public',desc:'시스템 설명'},
  {name:'sysObjectID',oid:'1.3.6.1.2.1.1.2.0',access:'public',desc:'시스템 객체 ID'},
  {name:'sysUpTime',oid:'1.3.6.1.2.1.1.3.0',access:'public',desc:'가동 시간'},
  {name:'sysContact',oid:'1.3.6.1.2.1.1.4.0',access:'public',desc:'관리자 연락처'},
  {name:'sysName',oid:'1.3.6.1.2.1.1.5.0',access:'public',desc:'시스템 이름'},
  {name:'sysLocation',oid:'1.3.6.1.2.1.1.6.0',access:'public',desc:'설치 위치'},
  {name:'sysServices',oid:'1.3.6.1.2.1.1.7.0',access:'public',desc:'서비스 계층'},
  {name:'ifNumber',oid:'1.3.6.1.2.1.2.1.0',access:'public',desc:'인터페이스 개수'},
  {name:'ifIndex',oid:'1.3.6.1.2.1.2.2.1.1',access:'public',desc:'인터페이스 인덱스'},
  {name:'ifDescr',oid:'1.3.6.1.2.1.2.2.1.2',access:'public',desc:'인터페이스 이름'},
  {name:'ifType',oid:'1.3.6.1.2.1.2.2.1.3',access:'public',desc:'인터페이스 타입'},
  {name:'ifMtu',oid:'1.3.6.1.2.1.2.2.1.4',access:'public',desc:'MTU'},
  {name:'ifSpeed',oid:'1.3.6.1.2.1.2.2.1.5',access:'public',desc:'속도(bps)'},
  {name:'ifPhysAddress',oid:'1.3.6.1.2.1.2.2.1.6',access:'public',desc:'MAC 주소'},
  {name:'ifAdminStatus',oid:'1.3.6.1.2.1.2.2.1.7',access:'public',desc:'관리 상태(1:up 2:down)'},
  {name:'ifOperStatus',oid:'1.3.6.1.2.1.2.2.1.8',access:'public',desc:'운영 상태(1:up 2:down)'},
  {name:'ifInOctets',oid:'1.3.6.1.2.1.2.2.1.10',access:'public',desc:'수신 바이트'},
  {name:'ifInErrors',oid:'1.3.6.1.2.1.2.2.1.14',access:'public',desc:'수신 에러'},
  {name:'ifOutOctets',oid:'1.3.6.1.2.1.2.2.1.16',access:'public',desc:'송신 바이트'},
  {name:'ifOutErrors',oid:'1.3.6.1.2.1.2.2.1.20',access:'public',desc:'송신 에러'},
  {name:'ifName',oid:'1.3.6.1.2.1.31.1.1.1.1',access:'public',desc:'인터페이스 이름(ifName)'},
  {name:'ifHCInOctets',oid:'1.3.6.1.2.1.31.1.1.1.6',access:'public',desc:'64bit 수신 바이트'},
  {name:'ifHCOutOctets',oid:'1.3.6.1.2.1.31.1.1.1.10',access:'public',desc:'64bit 송신 바이트'},
  {name:'ifHighSpeed',oid:'1.3.6.1.2.1.31.1.1.1.15',access:'public',desc:'속도(Mbps)'},
  {name:'ifAlias',oid:'1.3.6.1.2.1.31.1.1.1.18',access:'public',desc:'인터페이스 별칭'},
  {name:'ipForwarding',oid:'1.3.6.1.2.1.4.1.0',access:'public',desc:'IP 포워딩 여부'},
  {name:'ipAdEntAddr',oid:'1.3.6.1.2.1.4.20.1.1',access:'public',desc:'IP 주소'},
  {name:'entPhysicalDescr',oid:'1.3.6.1.2.1.47.1.1.1.1.2',access:'public',desc:'물리 엔티티 설명'},
  {name:'entPhysicalSerialNum',oid:'1.3.6.1.2.1.47.1.1.1.1.11',access:'public',desc:'시리얼 번호'},
  {name:'entPhysicalSoftwareRev',oid:'1.3.6.1.2.1.47.1.1.1.1.10',access:'public',desc:'소프트웨어 버전'},
  {name:'hrProcessorLoad',oid:'1.3.6.1.2.1.25.3.3.1.2',access:'public',desc:'CPU 부하(%)'},
  {name:'hrStorageUsed',oid:'1.3.6.1.2.1.25.2.3.1.6',access:'public',desc:'스토리지 사용량'},
  {name:'hrSystemUptime',oid:'1.3.6.1.2.1.25.1.1.0',access:'public',desc:'호스트 가동 시간'},
  {name:'hrMemorySize',oid:'1.3.6.1.2.1.25.2.2.0',access:'public',desc:'총 메모리(KB)'},
  {name:'hrSystemNumUsers',oid:'1.3.6.1.2.1.25.1.5.0',access:'public',desc:'접속 사용자 수'},
  {name:'hrSystemProcesses',oid:'1.3.6.1.2.1.25.1.6.0',access:'public',desc:'실행 프로세스 수'},
  {name:'ifInUcastPkts',oid:'1.3.6.1.2.1.2.2.1.11',access:'public',desc:'수신 유니캐스트 패킷'},
  {name:'ifInDiscards',oid:'1.3.6.1.2.1.2.2.1.13',access:'public',desc:'수신 폐기'},
  {name:'ifOutUcastPkts',oid:'1.3.6.1.2.1.2.2.1.17',access:'public',desc:'송신 유니캐스트 패킷'},
  {name:'ifOutDiscards',oid:'1.3.6.1.2.1.2.2.1.19',access:'public',desc:'송신 폐기'},
  {name:'ifLastChange',oid:'1.3.6.1.2.1.2.2.1.9',access:'public',desc:'마지막 상태 변경'},
  {name:'ifInMulticastPkts',oid:'1.3.6.1.2.1.31.1.1.1.2',access:'public',desc:'수신 멀티캐스트'},
  {name:'ifInBroadcastPkts',oid:'1.3.6.1.2.1.31.1.1.1.3',access:'public',desc:'수신 브로드캐스트'},
  {name:'ifConnectorPresent',oid:'1.3.6.1.2.1.31.1.1.1.17',access:'public',desc:'커넥터 존재 여부'},
  {name:'entPhysicalName',oid:'1.3.6.1.2.1.47.1.1.1.1.7',access:'public',desc:'물리 엔티티 이름'},
  {name:'entPhysicalModelName',oid:'1.3.6.1.2.1.47.1.1.1.1.13',access:'public',desc:'모델명'},
  {name:'entPhysicalFirmwareRev',oid:'1.3.6.1.2.1.47.1.1.1.1.9',access:'public',desc:'펌웨어 버전'},
  {name:'entPhysicalHardwareRev',oid:'1.3.6.1.2.1.47.1.1.1.1.8',access:'public',desc:'하드웨어 버전'},
  {name:'ipInReceives',oid:'1.3.6.1.2.1.4.3.0',access:'public',desc:'IP 수신 데이터그램'},
  {name:'ipInDelivers',oid:'1.3.6.1.2.1.4.9.0',access:'public',desc:'IP 상위 전달'},
  {name:'ipOutRequests',oid:'1.3.6.1.2.1.4.10.0',access:'public',desc:'IP 송신 요청'},
  {name:'ipForwDatagrams',oid:'1.3.6.1.2.1.4.6.0',access:'public',desc:'IP 포워딩 데이터그램'},
  {name:'icmpInMsgs',oid:'1.3.6.1.2.1.5.1.0',access:'public',desc:'ICMP 수신 메시지'},
  {name:'icmpInErrors',oid:'1.3.6.1.2.1.5.2.0',access:'public',desc:'ICMP 수신 에러'},
  {name:'icmpOutMsgs',oid:'1.3.6.1.2.1.5.14.0',access:'public',desc:'ICMP 송신 메시지'},
  {name:'tcpActiveOpens',oid:'1.3.6.1.2.1.6.5.0',access:'public',desc:'TCP 능동 연결'},
  {name:'tcpCurrEstab',oid:'1.3.6.1.2.1.6.9.0',access:'public',desc:'TCP 현재 연결 수'},
  {name:'tcpInSegs',oid:'1.3.6.1.2.1.6.10.0',access:'public',desc:'TCP 수신 세그먼트'},
  {name:'tcpOutSegs',oid:'1.3.6.1.2.1.6.11.0',access:'public',desc:'TCP 송신 세그먼트'},
  {name:'tcpRetransSegs',oid:'1.3.6.1.2.1.6.12.0',access:'public',desc:'TCP 재전송'},
  {name:'udpInDatagrams',oid:'1.3.6.1.2.1.7.1.0',access:'public',desc:'UDP 수신'},
  {name:'udpOutDatagrams',oid:'1.3.6.1.2.1.7.4.0',access:'public',desc:'UDP 송신'},
  {name:'udpInErrors',oid:'1.3.6.1.2.1.7.3.0',access:'public',desc:'UDP 에러'},
  {name:'snmpInPkts',oid:'1.3.6.1.2.1.11.1.0',access:'public',desc:'SNMP 수신 패킷'},
  {name:'snmpOutPkts',oid:'1.3.6.1.2.1.11.2.0',access:'public',desc:'SNMP 송신 패킷'},
  {name:'dot1dBaseNumPorts',oid:'1.3.6.1.2.1.17.1.2.0',access:'public',desc:'브리지 포트 수'},
  {name:'dot1dStpTopChanges',oid:'1.3.6.1.2.1.17.2.4.0',access:'public',desc:'STP 토폴로지 변경 횟수'},
  {name:'dot1dStpDesignatedRoot',oid:'1.3.6.1.2.1.17.2.5.0',access:'public',desc:'STP 루트 브리지'},
  {name:'dot1qVlanStaticName',oid:'1.3.6.1.2.1.17.7.1.4.3.1.1',access:'public',desc:'VLAN 이름'},
  {name:'lldpLocSysName',oid:'1.0.8802.1.1.2.1.3.3.0',access:'public',desc:'LLDP 로컬 시스템명'},
  {name:'lldpRemSysName',oid:'1.0.8802.1.1.2.1.4.1.1.9',access:'public',desc:'LLDP 원격 시스템명'},
  {name:'lldpRemPortId',oid:'1.0.8802.1.1.2.1.4.1.1.7',access:'public',desc:'LLDP 원격 포트 ID'}
];
function snmpAddStdMibs(){ if(!snmpData) loadSnmp(); const have=new Set((snmpData.oids||[]).map(o=>String(o.oid||'').trim())); let n=0; SNMP_STD_OIDS.forEach(s=>{ if(!have.has(s.oid)){ snmpData.oids.push({name:s.name,oid:s.oid,access:s.access,desc:s.desc}); have.add(s.oid); n++; } }); saveSnmp(); renderSnmp(); showToast(n>0?('공용 MIB '+n+'개 추가'):'이미 모두 등록됨'); }
// ══ 유비쿼스 Private(쓰기 가능, read-write/read-create) OID — ubiquoss private MIB 지원 현황 기반 ══
const UBIQUOSS_PRIV_OIDS=[
  // System
  {name:'ubiSysReset',oid:'1.3.6.1.4.1.7800.100.1.1.1',desc:'시스템 리셋 (1:reset, 2:resetMinDown)'},
  {name:'ubiSysClock',oid:'1.3.6.1.4.1.7800.100.1.1.2.7',desc:'시스템 clock 정보'},
  {name:'ubiSysTimeZoneName',oid:'1.3.6.1.4.1.7800.100.1.1.2.8.1',desc:'시스템 timezone 이름'},
  {name:'ubiSysTimeZoneOffset',oid:'1.3.6.1.4.1.7800.100.1.1.2.8.2',desc:'timezone offset (Hours:Minutes)'},
  {name:'ubiCpuRisingThreshold',oid:'1.3.6.1.4.1.7800.100.1.1.3.4',desc:'CPU 사용률 상한 임계치(%)'},
  {name:'ubiCpuFallingThreshold',oid:'1.3.6.1.4.1.7800.100.1.1.3.5',desc:'CPU 사용률 하한 임계치(%)'},
  {name:'ubiCpuLoadTimePeriod',oid:'1.3.6.1.4.1.7800.100.1.1.3.6',desc:'CPU 측정 주기(1:5초,2:1분,3:5분)'},
  {name:'ubiMemoryThreshold',oid:'1.3.6.1.4.1.7800.100.1.1.4.5',desc:'가용 메모리율 하한 임계치(%)'},
  {name:'ubiSysRcsEnableCpuNotification',oid:'1.3.6.1.4.1.7800.100.1.1.5.1',desc:'CPU notification 전송'},
  {name:'ubiSysRcsEnableMemoryNotification',oid:'1.3.6.1.4.1.7800.100.1.1.5.2',desc:'Memory notification 전송'},
  // Environment
  {name:'ubiEnvMonTemperatureHighThreshold',oid:'1.3.6.1.4.1.7800.100.2.1.1.1.4',desc:'온도 상한 임계치(℃)'},
  {name:'ubiEnvMonTemperatureLowThreshold',oid:'1.3.6.1.4.1.7800.100.2.1.1.1.5',desc:'온도 하한 임계치(℃)'},
  {name:'ubiEnvMonEnableTempStatusChange',oid:'1.3.6.1.4.1.7800.100.2.2.1',desc:'온도 상태변경 notification'},
  {name:'ubiEnvMonEnableFanStatusChange',oid:'1.3.6.1.4.1.7800.100.2.2.2',desc:'Fan 상태변경 notification'},
  {name:'ubiEnvMonEnableSupplyStatusChange',oid:'1.3.6.1.4.1.7800.100.2.2.3',desc:'Power 상태변경 notification'},
  // Module / FRU
  {name:'ubiFRUControlEnabled',oid:'1.3.6.1.4.1.7800.100.3.1.1.1',desc:'FRU notification 전송'},
  {name:'ubiModuleAction',oid:'1.3.6.1.4.1.7800.100.3.1.2.1.8',desc:'module action(reset)'},
  // Port / Interface
  {name:'ubiLinkUpDownEnable',oid:'1.3.6.1.4.1.7800.100.4.1.1.1.1',desc:'LinkUp/Down notification 전송'},
  {name:'ubiPortAdminDuplex',oid:'1.3.6.1.4.1.7800.100.4.1.2.1.6',desc:'Duplex 설정값'},
  {name:'ubiPortAdminSpeed',oid:'1.3.6.1.4.1.7800.100.4.1.2.1.7',desc:'Speed 설정값'},
  {name:'ubiPortMtu',oid:'1.3.6.1.4.1.7800.100.4.1.2.1.8',desc:'MTU 값(기본 1500)'},
  {name:'ubiPortReset',oid:'1.3.6.1.4.1.7800.100.4.1.2.1.11',desc:'Port reset(none/reset)'},
  {name:'ubiSwitchportMode',oid:'1.3.6.1.4.1.7800.100.4.1.4.1.1.2',desc:'Switchport 타입(access/trunk/hybrid)'},
  {name:'ubiSwitchportVlanNative',oid:'1.3.6.1.4.1.7800.100.4.1.4.1.1.4',desc:'Switchport native vlan ID'},
  {name:'ubiSwitchportVlanTaggedSet',oid:'1.3.6.1.4.1.7800.100.4.1.4.2.1.1',desc:'Tagged vlan 설정'},
  {name:'ubiSwitchportVlanUntaggedSet',oid:'1.3.6.1.4.1.7800.100.4.1.4.2.1.2',desc:'Untagged vlan 설정'},
  {name:'ubiSwitchportSecurityEnable',oid:'1.3.6.1.4.1.7800.100.4.1.4.4.1.1',desc:'port-security 활성화'},
  {name:'ubiSwitchportecurityMax',oid:'1.3.6.1.4.1.7800.100.4.1.4.4.1.2',desc:'port-security 최대 secure addr'},
  {name:'ubiIfStatsSnmpClear',oid:'1.3.6.1.4.1.7800.100.4.1.6.2.1.15',desc:'인터페이스 통계 초기화'},
  {name:'ubiEgressTrafficRate',oid:'1.3.6.1.4.1.7800.100.4.1.7.2.1.1.1',desc:'egress traffic rate'},
  {name:'ubiIngressTrafficRate',oid:'1.3.6.1.4.1.7800.100.4.1.7.2.1.1.4',desc:'ingress traffic rate'},
  // ERPS notification
  {name:'ubiErpsRingStateChangeEnabled',oid:'1.3.6.1.4.1.7800.100.11.1.5.1',desc:'ERPS ring 상태변경 notification'},
  {name:'ubiErpsRingEastIfStateChangeEnabled',oid:'1.3.6.1.4.1.7800.100.11.1.5.2',desc:'ERPS east if 상태변경'},
  {name:'ubiErpsRingWestIfStateChangeEnabled',oid:'1.3.6.1.4.1.7800.100.11.1.5.3',desc:'ERPS west if 상태변경'},
  // VLAN
  {name:'ubiVlanName',oid:'1.3.6.1.4.1.7800.100.5.1.2.1.3',desc:'VLAN 이름'},
  {name:'ubiVlanStatus',oid:'1.3.6.1.4.1.7800.100.5.1.2.1.4',desc:'VLAN 현재 상태'},
  {name:'ubiVlanRowStatus',oid:'1.3.6.1.4.1.7800.100.5.1.2.1.8',desc:'VLAN 생성 및 삭제'},
  // DHCP relay / snoop
  {name:'ubiDhcpRelayAdminStatus',oid:'1.3.6.1.4.1.7800.100.6.2.1.1.1',desc:'DHCP relay agent 서비스'},
  {name:'ubiDhcpRelayOption82Status',oid:'1.3.6.1.4.1.7800.100.6.2.1.1.2',desc:'DHCP relay option82 설정'},
  {name:'ubiDhcpRelayOption82Policy',oid:'1.3.6.1.4.1.7800.100.6.2.1.1.3',desc:'DHCP relay option82 policy'},
  {name:'ubiDhcpRelayVerifyMAC',oid:'1.3.6.1.4.1.7800.100.6.2.1.1.5',desc:'DHCP relay MAC 검증'},
  {name:'ubiDhcpSnoopAdminStatus',oid:'1.3.6.1.4.1.7800.100.6.3.1.1.1',desc:'DHCP Snooping Enable/Disable'},
  {name:'ubiDhcpSnoopOption82Status',oid:'1.3.6.1.4.1.7800.100.6.3.1.1.4',desc:'DHCP Snooping option82 설정'},
  {name:'ubiDhcpSnoopVerifyMAC',oid:'1.3.6.1.4.1.7800.100.6.3.1.1.6',desc:'DHCP Snooping MAC 검증'},
  {name:'ubiDhcpSnoopIfTrust',oid:'1.3.6.1.4.1.7800.100.6.3.4.1.1',desc:'DHCP Snoop Trust(none/trusted)'},
  // QoS / Policy
  {name:'ubiClassMapRowStatus',oid:'1.3.6.1.4.1.7800.100.12.1.1.1.2',desc:'Class-map 생성 및 삭제'},
  {name:'ubiPolicyMapRowStatus',oid:'1.3.6.1.4.1.7800.100.12.2.1.1.2',desc:'Policy-map 생성 및 삭제'},
  {name:'ubiPmActionPoliceRate',oid:'1.3.6.1.4.1.7800.100.12.2.3.1.7',desc:'classified traffic policer'},
  {name:'ubiServicePolicyRowStatus',oid:'1.3.6.1.4.1.7800.100.12.3.1.1.3',desc:'Service policy entry 생성/삭제'},
  {name:'ubiInterfaceTrust',oid:'1.3.6.1.4.1.7800.100.12.4.5.1.8',desc:'인터페이스 trust mode'},
  // ACL
  {name:'ubiAclRowStatus',oid:'1.3.6.1.4.1.7800.100.13.1.1.1.5',desc:'Access-list 생성 및 삭제'},
  {name:'ubiAclExtRowStatus',oid:'1.3.6.1.4.1.7800.100.13.1.2.1.16',desc:'Extend access-list 생성/삭제'},
  {name:'ubiAclMacRowStatus',oid:'1.3.6.1.4.1.7800.100.13.1.4.1.7',desc:'MAC acl 생성 및 삭제'},
  // IP / Route / Ping
  {name:'ubiIpAddrIfIndex',oid:'1.3.6.1.4.1.7800.100.14.1.1.1.4',desc:'IP가 설정된 인터페이스 인덱스'},
  {name:'ubiIpAddrStatus',oid:'1.3.6.1.4.1.7800.100.14.1.1.1.5',desc:'IP 상태(primary/secondary)'},
  {name:'ubiIpAddrRowstatus',oid:'1.3.6.1.4.1.7800.100.14.1.1.1.6',desc:'IP address 생성 및 삭제'},
  {name:'ubiInetRouteRowstatus',oid:'1.3.6.1.4.1.7800.100.14.1.2.1.19',desc:'Route 생성 및 삭제'},
  {name:'ubiPingSendTarget',oid:'1.3.6.1.4.1.7800.100.14.2.2.2',desc:'Ping 목적지 주소'},
  {name:'ubiPingSendRepeat',oid:'1.3.6.1.4.1.7800.100.14.2.2.3',desc:'Ping 재전송 수'},
  {name:'ubiPingSendExecute',oid:'1.3.6.1.4.1.7800.100.14.2.2.15',desc:'Ping 전송 동작 설정'},
  // Syslog
  {name:'ubiSyslogConsoleEnable',oid:'1.3.6.1.4.1.7800.100.15.1.1.1',desc:'Console logging 활성화'},
  {name:'ubiSyslogConsoleSeverity',oid:'1.3.6.1.4.1.7800.100.15.1.1.2',desc:'Console logging level'},
  {name:'ubiSyslogTrapEnable',oid:'1.3.6.1.4.1.7800.100.15.1.1.7',desc:'Trap logging 활성화'},
  {name:'ubiSyslogServerRowStatus',oid:'1.3.6.1.4.1.7800.100.15.1.2.1.1.3',desc:'Logging server 생성/삭제'},
  // NTP
  {name:'ubiNtpMasterEnable',oid:'1.3.6.1.4.1.7800.100.17.1.1.4.1',desc:'NTP Master 기능 enable'},
  {name:'ubiNtpMasterStratum',oid:'1.3.6.1.4.1.7800.100.17.1.1.4.2',desc:'NTP master stratum 값'},
  {name:'ubiNtpServerRowStatus',oid:'1.3.6.1.4.1.7800.100.17.1.2.1.3',desc:'NTP server 생성 및 삭제'},
  // Config copy
  {name:'ubiConfigNextStatus',oid:'1.3.6.1.4.1.7800.100.18.1.1.1.4',desc:'재시작 후 적용 config/image'},
  {name:'ubiConfigSourceMethod',oid:'1.3.6.1.4.1.7800.100.18.1.3.1',desc:'Source copy 메소드'},
  {name:'ubiConfigSourceFileName',oid:'1.3.6.1.4.1.7800.100.18.1.3.2',desc:'Source copy 파일명'},
  {name:'ubiConfigDestinationMethod',oid:'1.3.6.1.4.1.7800.100.18.1.3.7',desc:'Destination copy 메소드'},
  {name:'ubiConfigCopyOperate',oid:'1.3.6.1.4.1.7800.100.18.1.3.13',desc:'Copy 동작 적용'},
  // SNMP SDN ext
  {name:'ubiSnmpMibsSdnExt',oid:'1.3.6.1.4.1.7800.100.19.1.6.1',desc:'SDN extension mibs access'},
  // IGMP snooping
  {name:'ubiIgmpSnoopVlanFastLeaveEnabled',oid:'1.3.6.1.4.1.7800.100.21.1.1.1.3',desc:'IGMP snoop fast-leave'},
  {name:'ubiIgmpSnoopVlanForcedSourceIP',oid:'1.3.6.1.4.1.7800.100.21.1.1.1.5',desc:'IGMP packet source IP'},
  {name:'ubiIgmpSnoopVlanRowStatus',oid:'1.3.6.1.4.1.7800.100.21.1.1.1.6',desc:'IGMP snoop vlan config 설정'},
  {name:'ubiIgmpSnoopStaticGroupRowStatus',oid:'1.3.6.1.4.1.7800.100.21.1.3.1.4',desc:'static-group 설정/해제'},
  // TWAMP
  {name:'ubiTwampSenderEnable',oid:'1.3.6.1.4.1.7800.100.41.1.1.1',desc:'TWAMP Sender Enable/Disable'},
  {name:'ubiTwampResponderEnable',oid:'1.3.6.1.4.1.7800.100.41.1.2.1',desc:'TWAMP Responder Enable/Disable'},
  {name:'ubiTwampServerEnable',oid:'1.3.6.1.4.1.7800.100.41.1.3.1',desc:'TWAMP Server Enable/Disable'},
  // 802.1x
  {name:'ubiDot1xauthMaxSession',oid:'1.3.6.1.4.1.7800.100.46.1.1',desc:'authentication session max'},
];
function snmpAddUbiquossPriv(){ if(!snmpData) loadSnmp(); const have=new Set((snmpData.oids||[]).map(o=>String(o.oid||'').trim())); let n=0; UBIQUOSS_PRIV_OIDS.forEach(s=>{ if(!have.has(s.oid)){ snmpData.oids.push({name:s.name,oid:s.oid,access:'private',desc:s.desc}); have.add(s.oid); n++; } }); saveSnmp(); renderSnmp(); showToast(n>0?('유비쿼스 Private OID '+n+'개 등록'):'이미 모두 등록됨'); }
// ══ Trap / Notification OID — ubiquoss trap MIB 지원 현황 기반 (장비가 송신하는 알림) ══
const UBIQUOSS_TRAP_OIDS=[
  // 표준 Trap
  {name:'coldStart',oid:'1.3.6.1.6.3.1.1.5.1',desc:'물리적 요인(정전 등)으로 재시작'},
  {name:'warmStart',oid:'1.3.6.1.6.3.1.1.5.2',desc:'논리적 요인(reload 등)으로 재시작'},
  {name:'linkDown',oid:'1.3.6.1.6.3.1.1.5.3',desc:'link down 시 발생'},
  {name:'linkUp',oid:'1.3.6.1.6.3.1.1.5.4',desc:'link up 시 발생'},
  {name:'authenticationFailure',oid:'1.3.6.1.6.3.1.1.5.5',desc:'SNMP 인증 실패 시 발생'},
  {name:'risingAlarm',oid:'1.3.6.1.2.1.16.0.1',desc:'RMON 상한 임계 초과 시'},
  {name:'fallingAlarm',oid:'1.3.6.1.2.1.16.0.2',desc:'RMON 하한 임계 미달 시'},
  {name:'entConfigChange',oid:'1.3.6.1.2.1.47.2.0.1',desc:'entity 추가/삭제 시'},
  {name:'lldpRemTablesChange',oid:'1.0.8802.1.1.2.0.0.1',desc:'LLDP remote table 변경 시'},
  {name:'ospfNbrStateChange',oid:'1.3.6.1.2.1.14.16.2.2',desc:'OSPF neighbor 상태 변경'},
  {name:'ospfIfStateChange',oid:'1.3.6.1.2.1.14.16.2.16',desc:'OSPF interface 상태 변경'},
  {name:'bgpEstablishedNotification',oid:'1.3.6.1.2.1.15.0.1',desc:'BGP session 수립 시'},
  {name:'bgpBackwardTransNotification',oid:'1.3.6.1.2.1.15.0.2',desc:'BGP FSM 하향 천이 시'},
  {name:'vrrpTrapNewMaster',oid:'1.3.6.1.2.1.68.0.1',desc:'VRRP Master 변경 시'},
  {name:'vrrpv3NewMaster',oid:'1.3.6.1.2.1.207.0.1',desc:'VRRPv3 Master 변경 시'},
  {name:'vrrpv3ProtoError',oid:'1.3.6.1.2.1.207.0.2',desc:'VRRPv3 protocol error'},
  {name:'pethPsePortOnOffNotification',oid:'1.3.6.1.2.1.105.0.1',desc:'PoE port detection 상태 변경'},
  {name:'pimNeighborLoss',oid:'1.3.6.1.2.1.157.0.1',desc:'PIM neighbor 상태 변경'},
  {name:'mplsXCUp',oid:'1.3.6.1.2.1.10.166.2.0.1',desc:'MPLS XC up'},
  {name:'mplsXCDown',oid:'1.3.6.1.2.1.10.166.2.0.2',desc:'MPLS XC down'},
  {name:'mplsTunnelUp',oid:'1.3.6.1.2.1.10.166.3.0.1',desc:'RSVP session up'},
  {name:'mplsTunnelDown',oid:'1.3.6.1.2.1.10.166.3.0.2',desc:'RSVP session down'},
  {name:'pwUp',oid:'1.3.6.1.2.1.10.246.0.3',desc:'PW up'},
  {name:'pwDown',oid:'1.3.6.1.2.1.10.246.0.2',desc:'PW down'},
  {name:'pwDeleted',oid:'1.3.6.1.2.1.10.246.0.1',desc:'PW 삭제'},
  // 유비쿼스 System
  {name:'ubiSysRcsCpuRisingNotification',oid:'1.3.6.1.4.1.7800.100.1.2.0.1',desc:'CPU 상한 임계 초과'},
  {name:'ubiSysRcsCpuFallingNotification',oid:'1.3.6.1.4.1.7800.100.1.2.0.2',desc:'CPU 하한 임계 미달'},
  {name:'ubiSysRcsMemoryRisingNotification',oid:'1.3.6.1.4.1.7800.100.1.2.0.3',desc:'가용메모리 임계 미달'},
  {name:'ubiSysRcsMemoryFallingNotification',oid:'1.3.6.1.4.1.7800.100.1.2.0.4',desc:'가용메모리 정상 복귀'},
  {name:'ubiSysResetReasonNotification',oid:'1.3.6.1.4.1.7800.100.1.2.0.5',desc:'system reset 이유 통지'},
  {name:'ubiSysShutdownNotification',oid:'1.3.6.1.4.1.7800.100.1.2.0.10',desc:'system shutdown 직전'},
  {name:'ubiSysCpuStatusChangeNotification',oid:'1.3.6.1.4.1.7800.100.1.2.0.11',desc:'CPU 사용률 상태 변경'},
  {name:'ubiSysMemoryStatusChangeNotification',oid:'1.3.6.1.4.1.7800.100.1.2.0.12',desc:'메모리율 상태 변경'},
  // 환경감시
  {name:'ubiEnvMonTempStatusChange',oid:'1.3.6.1.4.1.7800.100.2.3.0.1',desc:'온도 상태 변경'},
  {name:'ubiEnvMonFanStatusChange',oid:'1.3.6.1.4.1.7800.100.2.3.0.2',desc:'Fan 상태 변경'},
  {name:'ubiEnvMonSupplyStatusChange',oid:'1.3.6.1.4.1.7800.100.2.3.0.3',desc:'Power 상태 변경'},
  {name:'ubiEnvMonSupplyPowerStatus',oid:'1.3.6.1.4.1.7800.100.2.3.0.5',desc:'power fail 시'},
  {name:'ubiEnvMonFanActivateStatus',oid:'1.3.6.1.4.1.7800.100.2.3.0.6',desc:'fan activate 상태 변경'},
  // Module / FRU
  {name:'ubiFRUInserted',oid:'1.3.6.1.4.1.7800.100.3.2.0.1',desc:'FRU 실장 시'},
  {name:'ubiFRURemoved',oid:'1.3.6.1.4.1.7800.100.3.2.0.2',desc:'FRU 탈장 시'},
  {name:'ubiFabricCrcErrorNotification',oid:'1.3.6.1.4.1.7800.100.3.2.0.3',desc:'Fabric CRC Error 시'},
  {name:'ubiFRUUnrecognized',oid:'1.3.6.1.4.1.7800.100.3.2.0.4',desc:'미지원 FRU 탈장 시'},
  {name:'ubiEntSensorThreshold',oid:'1.3.6.1.4.1.7800.100.3.2.1.1',desc:'Transceiver sensor 임계 변경'},
  // Port / Interface
  {name:'ubiPortStpAutoShutdown',oid:'1.3.6.1.4.1.7800.100.4.0.0.2',desc:'STP auto shutdown 시'},
  {name:'ubiLoadMonitorFallingAlarm',oid:'1.3.6.1.4.1.7800.100.4.0.0.1',desc:'load monitor 하한 알람'},
  {name:'ubiPortAutoNegoFault',oid:'1.3.6.1.4.1.7800.100.4.0.1.1',desc:'Auto-nego 실패 링크 변경'},
  {name:'ubiLoadMonitorRisingAlarm',oid:'1.3.6.1.4.1.7800.100.4.0.1.2',desc:'load monitor 상한 알람'},
  {name:'ubiTrafficControlRisingAlarm',oid:'1.3.6.1.4.1.7800.100.4.0.1.3',desc:'traffic-control 상한 초과'},
  {name:'ubiTrafficControlFallingAlarm',oid:'1.3.6.1.4.1.7800.100.4.0.1.4',desc:'traffic-control 하한'},
  {name:'ubiPortEgressQueueDropRisingAlarm',oid:'1.3.6.1.4.1.7800.100.4.0.1.5',desc:'Queue drop 상한 초과'},
  {name:'ubiTrafficMonitorThresholdRisingAlarm',oid:'1.3.6.1.4.1.7800.100.4.0.1.7',desc:'Traffic Monitoring 알람'},
  {name:'ubiPortCRCThresholdRisingAlarm',oid:'1.3.6.1.4.1.7800.100.4.0.1.9',desc:'CRC high-threshold 초과'},
  {name:'ubiRecentMacChangeNotification',oid:'1.3.6.1.4.1.7800.100.4.0.1.13',desc:'새 MAC learning 시'},
  {name:'ubiPortSecurityViolationNotification',oid:'1.3.6.1.4.1.7800.100.4.0.1.14',desc:'port-security 위반 시'},
  // VLAN / FDB
  {name:'ubiVlanCreated',oid:'1.3.6.1.4.1.7800.100.5.0.0.1',desc:'VLAN 생성 시'},
  {name:'ubiVlanDeleted',oid:'1.3.6.1.4.1.7800.100.5.2.0.2',desc:'VLAN 삭제 시'},
  {name:'ubiFdbAlarmAsserted',oid:'1.3.6.1.4.1.7800.100.5.0.1.1',desc:'FDB High threshold 초과'},
  {name:'ubiFdbAlarmCleared',oid:'1.3.6.1.4.1.7800.100.5.0.1.2',desc:'FDB Low threshold 복귀'},
  // CFM / ERPS
  {name:'ubiCfmRemoteMepStatusChange',oid:'1.3.6.1.4.1.7800.100.10.0.0.1',desc:'CFM RMEP CC 상태 변경'},
  {name:'ubiCfmPmFrameDelayEvent',oid:'1.3.6.1.4.1.7800.100.10.0.0.3',desc:'Frame delay 임계 초과'},
  {name:'ubiCfmPmFrameLossEvent',oid:'1.3.6.1.4.1.7800.100.10.0.0.4',desc:'Frame loss 임계 초과'},
  {name:'ubiErpsRingStateChange',oid:'1.3.6.1.4.1.7800.100.11.0.0.1',desc:'ERPS ring 상태 변경'},
  {name:'ubiErpsRingEastIfStateChange',oid:'1.3.6.1.4.1.7800.100.11.0.0.2',desc:'ERPS East IF BLK/FWD 변경'},
  {name:'ubiErpsRingWestIfStateChange',oid:'1.3.6.1.4.1.7800.100.11.0.0.3',desc:'ERPS West IF BLK/FWD 변경'},
  // Ping / TWping
  {name:'ubiPingSendCompletion',oid:'1.3.6.1.4.1.7800.100.14.0.2.1',desc:'Ping 시험 완료 결과'},
  {name:'ubiTwpingSendCompletion',oid:'1.3.6.1.4.1.7800.100.14.0.4.1',desc:'TWping 시험 완료 결과'},
  // Config / Auto-reset
  {name:'ubiConfigCopyResultNotification',oid:'1.3.6.1.4.1.7800.100.18.0.1',desc:'config copy 결과 반환'},
  {name:'ubiAutoResetCpuNotification',oid:'1.3.6.1.4.1.7800.100.27.0.1',desc:'CPU에 의한 auto-reset'},
  {name:'ubiAutoResetMemoryNotification',oid:'1.3.6.1.4.1.7800.100.27.0.2',desc:'Memory에 의한 auto-reset'},
  {name:'ubiAutoResetIcmpNotification',oid:'1.3.6.1.4.1.7800.100.27.0.3',desc:'ICMP에 의한 auto-reset'},
  {name:'ubiAutoResetNotification',oid:'1.3.6.1.4.1.7800.100.27.0.4',desc:'auto-reset 발생'},
  // 이중화 / 알람 / 보안
  {name:'ubiSwitchOverNotification',oid:'1.3.6.1.4.1.7800.100.29.0.1',desc:'이중화 Switchover 발생'},
  {name:'ubiRedundancyConnectionStateNotification',oid:'1.3.6.1.4.1.7800.100.29.0.2',desc:'Standby 연결상태 변경'},
  {name:'ubiAlarmAsserted',oid:'1.3.6.1.4.1.7800.100.28.0.0.1',desc:'환경감시기 Alarm 발생'},
  {name:'ubiAlarmCleared',oid:'1.3.6.1.4.1.7800.100.28.0.0.2',desc:'환경감시기 Alarm 해제'},
  {name:'ubiCpuMacFilterNotification',oid:'1.3.6.1.4.1.7800.100.30.0.1',desc:'CPU-MAC-Filter event'},
  {name:'ubiSecurityDetectionNotification',oid:'1.3.6.1.4.1.7800.100.32.0.1',desc:'security detection 탐지'},
  {name:'ubiSecurityAnomalyDosNotification',oid:'1.3.6.1.4.1.7800.100.32.0.2',desc:'Anomaly DoS 탐지'},
  {name:'ubiRunCfgChangeNotification',oid:'1.3.6.1.4.1.7800.100.42.0.0.1',desc:'running-config 변경 시'},
  {name:'ubiDot1xMaxSessionExceedNotification',oid:'1.3.6.1.4.1.7800.100.46.0.1',desc:'auth max-session 도달'},
  // 알람 통지 (시스템 점검)
  {name:'sysColdStartNoti',oid:'1.3.6.1.4.1.7800.100.7.3.2',desc:'물리적 요인 재시작 알람'},
  {name:'sysWarmStartNoti',oid:'1.3.6.1.4.1.7800.100.7.3.1',desc:'논리적 요인 재시작 알람'},
  {name:'linkUpNoti',oid:'1.3.6.1.4.1.7800.100.7.3.3',desc:'link up 알람'},
  {name:'linkDownNoti',oid:'1.3.6.1.4.1.7800.100.7.3.4',desc:'link down 알람'},
  {name:'tempHighNoti',oid:'1.3.6.1.4.1.7800.100.7.3.11',desc:'온도 상한 알람'},
  {name:'fanAlarmNoti',oid:'1.3.6.1.4.1.7800.100.7.3.12',desc:'fan 상태 변경 알람'},
  {name:'psuAlarmNoti',oid:'1.3.6.1.4.1.7800.100.7.3.14',desc:'power 상태 변경 알람'},
  {name:'portAdminNoti',oid:'1.3.6.1.4.1.7800.100.7.3.16',desc:'Port Admin 상태 변경'},
  {name:'rmonRisingNoti',oid:'1.3.6.1.4.1.7800.100.7.3.18',desc:'RMON Rising 알람'},
  {name:'portSLDNoti',oid:'1.3.6.1.4.1.7800.100.7.3.20',desc:'SLD 상태 변경'},
  {name:'ponLinkStatusNoti',oid:'1.3.6.1.4.1.7800.100.7.3.55',desc:'PON Link 상태 변경'},
  {name:'onuOperStatusNoti',oid:'1.3.6.1.4.1.7800.100.7.3.51',desc:'ONT operation 상태 변경'},
  {name:'sysRebootMaxTempNoti',oid:'1.3.6.1.4.1.7800.100.7.3.112',desc:'온도 초과로 system reset'},
];
function snmpAddUbiquossTrap(){ if(!snmpData) loadSnmp(); const have=new Set((snmpData.oids||[]).map(o=>String(o.oid||'').trim())); let n=0; UBIQUOSS_TRAP_OIDS.forEach(s=>{ if(!have.has(s.oid)){ snmpData.oids.push({name:s.name,oid:s.oid,access:'trap',desc:s.desc}); have.add(s.oid); n++; } }); saveSnmp(); renderSnmp(); showToast(n>0?('Trap OID '+n+'개 등록'):'이미 모두 등록됨'); }
let snmpData=null;
function loadSnmp(){
  try{ snmpData=JSON.parse(localStorage.getItem('utop_snmp')||'null'); }catch(e){ snmpData=null; }
  if(!snmpData||typeof snmpData!=='object') snmpData={};
  if(!Array.isArray(snmpData.communities)){
    snmpData.communities=[];
    if(snmpData.publicComm) snmpData.communities.push({id:'sc'+Date.now(),name:'기본 Public',community:snmpData.publicComm,version:'v2c'});
    if(!snmpData.communities.length) snmpData.communities.push({id:'sc'+Date.now(),name:'기본 Public',community:'public',version:'v2c'});
    delete snmpData.publicComm; delete snmpData.privateComm;
  }
  if(!Array.isArray(snmpData.oids)) snmpData.oids=SNMP_STD_OIDS.slice(0,17).map(o=>({name:o.name,oid:o.oid,access:o.access,desc:o.desc}));
  saveSnmp();
}
function saveSnmp(){ try{ localStorage.setItem('utop_snmp',JSON.stringify(snmpData)); }catch(e){} }
let _snmpSel={type:'oid',access:'public'};
function snmpSelComm(id){ _snmpSel={type:'comm',id:id}; renderSnmp(); }
function snmpSelOid(access){ _snmpSel={type:'oid',access:access}; renderSnmp(); }
function snmpAddComm(){ if(!snmpData) loadSnmp(); const id='sc'+Date.now()+Math.floor(Math.random()*1000); snmpData.communities.push({id:id,name:'새 프로파일',community:'',version:'v2c'}); saveSnmp(); _snmpSel={type:'comm',id:id}; renderSnmp(); }
function snmpSetComm(id,field,val){ if(!snmpData) return; const c=snmpData.communities.find(x=>x.id===id); if(!c) return; c[field]=val; saveSnmp(); }
function snmpDelComm(id){ if(!snmpData) return; if(!confirm('이 Community 프로파일을 삭제하시겠습니까?')) return; snmpData.communities=snmpData.communities.filter(x=>x.id!==id); _snmpSel={type:'oid',access:'public'}; saveSnmp(); renderSnmp(); }
function snmpAddOid(){ if(!snmpData) loadSnmp(); const acc=(_snmpSel&&_snmpSel.type==='oid')?_snmpSel.access:'public'; snmpData.oids.push({name:'',oid:'',access:acc,desc:''}); saveSnmp(); renderSnmp(); }
function snmpSetOid(i,field,val){ if(!snmpData||!snmpData.oids[i]) return; snmpData.oids[i][field]=val; saveSnmp(); }
function snmpDelOid(i){ if(!snmpData) return; snmpData.oids.splice(i,1); saveSnmp(); renderSnmp(); }
function renderSnmp(){
  if(!snmpData) loadSnmp();
  if(!_snmpSel) _snmpSel={type:'oid',access:'public'};
  const body=document.getElementById('snmp-body'); if(!body) return;
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  const pubCount=(snmpData.oids||[]).filter(o=>o.access!=='private'&&o.access!=='trap').length;
  const prvCount=(snmpData.oids||[]).filter(o=>o.access==='private').length;
  const trapCount=(snmpData.oids||[]).filter(o=>o.access==='trap').length;
  // ── 왼쪽 마스터 목록 ──
  const navRow=(active,onclick,icon,col,label,sub)=>'<div onclick="'+onclick+'" style="display:flex;align-items:center;gap:8px;padding:9px 11px;border-radius:8px;cursor:pointer;margin-bottom:4px;border:1px solid '+(active?col:'transparent')+';background:'+(active?col+'14':'transparent')+';"><i class="ti '+icon+'" style="color:'+col+';font-size:16px;flex-shrink:0;"></i><div style="flex:1;min-width:0;"><div style="font-size:12.5px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+label+'</div>'+(sub?'<div style="font-size:10.5px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:ui-monospace,monospace;">'+sub+'</div>':'')+'</div></div>';
  const commItems=(snmpData.communities||[]).map(cm=>navRow(_snmpSel.type==='comm'&&_snmpSel.id===cm.id,'snmpSelComm(\''+cm.id+'\')','ti-lock-open','#00a872',esc(cm.name||'(이름없음)'),esc(cm.community||'')+' · '+(cm.version||'v2c'))).join('');
  const left='<div style="display:flex;align-items:center;margin-bottom:8px;"><span style="font-size:11px;font-weight:700;color:var(--text3);">COMMUNITY (Public·읽기)</span><span style="flex:1;"></span><button onclick="snmpAddComm()" style="font-size:11px;padding:4px 10px;border-radius:6px;border:1px solid #00a872;background:#fff;color:#00a872;cursor:pointer;font-weight:600;"><i class="ti ti-plus"></i> 추가</button></div>'
    +(commItems||'<div style="padding:12px;text-align:center;color:var(--text3);font-size:11.5px;border:1px dashed var(--border);border-radius:8px;margin-bottom:8px;">프로파일 없음</div>')
    +'<div style="font-size:11px;font-weight:700;color:var(--text3);margin:14px 0 8px;">OID 목록</div>'
    +navRow(_snmpSel.type==='oid'&&_snmpSel.access==='public','snmpSelOid(\'public\')','ti-lock-open','#00a872','Public OID','읽기 RO · '+pubCount+'개')
    +navRow(_snmpSel.type==='oid'&&_snmpSel.access==='private','snmpSelOid(\'private\')','ti-lock','#e53e5a','Private OID','쓰기 RW · '+prvCount+'개')
    +navRow(_snmpSel.type==='oid'&&_snmpSel.access==='trap','snmpSelOid(\'trap\')','ti-bell','#e8820c','Trap (Notification)','장비 송신 알림 · '+trapCount+'개');
  // ── 오른쪽 디테일 ──
  let right='';
  if(_snmpSel.type==='comm'){
    const cm=(snmpData.communities||[]).find(x=>x.id===_snmpSel.id);
    if(!cm){ right='<div style="padding:30px;color:var(--text3);">프로파일을 선택하세요.</div>'; }
    else right='<div style="max-width:560px;"><div style="font-size:15px;font-weight:700;margin-bottom:14px;"><i class="ti ti-lock-open" style="color:#00a872;"></i> Community 프로파일</div>'
      +'<div style="margin-bottom:13px;"><div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:4px;">프로파일 이름</div><input value="'+esc(cm.name)+'" onblur="snmpSetComm(\''+cm.id+'\',\'name\',this.value)" placeholder="랩 공용" style="width:100%;font-size:13px;padding:8px 10px;border:1px solid var(--border);border-radius:7px;outline:none;box-sizing:border-box;"></div>'
      +'<div style="display:flex;gap:12px;margin-bottom:13px;"><div style="flex:1;"><div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:4px;">Community 문자열</div><input value="'+esc(cm.community)+'" onblur="snmpSetComm(\''+cm.id+'\',\'community\',this.value)" placeholder="public" style="width:100%;font-size:13px;font-family:ui-monospace,monospace;padding:8px 10px;border:1px solid var(--border);border-radius:7px;outline:none;box-sizing:border-box;"></div><div style="width:120px;"><div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:4px;">버전</div><select onchange="snmpSetComm(\''+cm.id+'\',\'version\',this.value)" style="width:100%;font-size:13px;padding:8px 6px;border:1px solid var(--border);border-radius:7px;outline:none;">'+['v1','v2c','v3'].map(v=>'<option'+((cm.version||'v2c')===v?' selected':'')+'>'+v+'</option>').join('')+'</select></div></div>'
      +'<button onclick="snmpDelComm(\''+cm.id+'\')" style="font-size:12px;padding:7px 14px;border-radius:7px;border:1px solid #f0c2cb;background:#fff;color:var(--red);cursor:pointer;font-weight:600;"><i class="ti ti-trash"></i> 프로파일 삭제</button></div>';
  } else {
    const acc=_snmpSel.access;
    const filtered=(snmpData.oids||[]).map((o,i)=>({o:o,i:i})).filter(x=>acc==='private'?x.o.access==='private':acc==='trap'?x.o.access==='trap':(x.o.access!=='private'&&x.o.access!=='trap'));
    const rows=filtered.map(x=>{ const o=x.o,i=x.i; return '<tr style="border-bottom:1px solid #eef0f3;">'
      +'<td style="padding:5px 8px;text-align:center;font-size:11px;color:var(--text3);">'+(i+1)+'</td>'
      +'<td style="padding:4px 6px;"><input value="'+esc(o.name)+'" onblur="snmpSetOid('+i+',\'name\',this.value)" placeholder="sysDescr" style="width:100%;font-size:12.5px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;outline:none;box-sizing:border-box;"></td>'
      +'<td style="padding:4px 6px;"><input value="'+esc(o.oid)+'" onblur="snmpSetOid('+i+',\'oid\',this.value)" placeholder="1.3.6.1.2.1.1.1.0" style="width:100%;font-size:12.5px;font-family:ui-monospace,monospace;padding:6px 8px;border:1px solid var(--border);border-radius:6px;outline:none;box-sizing:border-box;"></td>'
      +'<td style="padding:4px 6px;"><input value="'+esc(o.desc)+'" onblur="snmpSetOid('+i+',\'desc\',this.value)" placeholder="설명" style="width:100%;font-size:12.5px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;outline:none;box-sizing:border-box;"></td>'
      +'<td style="padding:4px 6px;text-align:center;"><i class="ti ti-trash" onclick="snmpDelOid('+i+')" style="font-size:15px;color:#d8dce3;cursor:pointer;" onmouseenter="this.style.color=\'var(--red)\'" onmouseleave="this.style.color=\'#d8dce3\'"></i></td>'
    +'</tr>'; }).join('');
    const aColor=acc==='private'?'#e53e5a':acc==='trap'?'#e8820c':'#00a872'; const aIcon=acc==='private'?'ti-lock':acc==='trap'?'ti-bell':'ti-lock-open'; const aLabel=acc==='private'?'Private OID (쓰기 RW)':acc==='trap'?'Trap / Notification (장비 송신)':'Public OID (읽기 RO)';
    right='<div style="display:flex;align-items:center;gap:6px;margin-bottom:11px;"><span style="font-size:15px;font-weight:700;"><i class="ti '+aIcon+'" style="color:'+aColor+';"></i> '+aLabel+' <span style="font-size:12px;color:var(--text3);font-weight:400;">('+filtered.length+')</span></span><span style="flex:1;"></span>'+(acc!=='private'?'<button onclick="snmpAddStdMibs()" title="공개 표준 MIB-II/IF-MIB OID 일괄 등록" style="font-size:12px;padding:6px 13px;border-radius:7px;border:1px solid #7c3aed;background:#fff;color:#7c3aed;cursor:pointer;font-weight:600;"><i class="ti ti-library"></i> 공용 MIB 추가</button>':acc==='private'?'<button onclick="snmpAddUbiquossPriv()" title="유비쿼스 private MIB의 쓰기 가능(SET) OID 일괄 등록" style="font-size:12px;padding:6px 13px;border-radius:7px;border:1px solid #e53e5a;background:#fff;color:#e53e5a;cursor:pointer;font-weight:600;"><i class="ti ti-library"></i> 유비쿼스 Private MIB 추가</button>':'<button onclick="snmpAddUbiquossTrap()" title="유비쿼스 trap MIB의 Notification OID 일괄 등록" style="font-size:12px;padding:6px 13px;border-radius:7px;border:1px solid #e8820c;background:#fff;color:#e8820c;cursor:pointer;font-weight:600;"><i class="ti ti-library"></i> 유비쿼스 Trap MIB 추가</button>')+'<button onclick="snmpAddOid()" style="font-size:12px;padding:6px 14px;border-radius:7px;border:1px solid '+aColor+';background:#fff;color:'+aColor+';cursor:pointer;font-weight:600;"><i class="ti ti-plus"></i> OID 추가</button></div>'
      +'<div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;"><table style="width:100%;border-collapse:collapse;table-layout:fixed;"><colgroup><col style="width:34px;"><col style="width:150px;"><col style="width:185px;"><col><col style="width:40px;"></colgroup>'
      +'<thead><tr style="background:#f4f6f9;"><th style="padding:8px;font-size:11px;color:var(--text3);">#</th><th style="padding:8px;text-align:left;font-size:11px;color:var(--text3);">이름</th><th style="padding:8px;text-align:left;font-size:11px;color:var(--text3);">OID</th><th style="padding:8px;text-align:left;font-size:11px;color:var(--text3);">설명</th><th style="padding:8px;"></th></tr></thead>'
      +'<tbody>'+(rows||'<tr><td colspan="5" style="padding:24px;text-align:center;color:var(--text3);font-size:13px;">'+aLabel+'가 없습니다. [OID 추가]로 등록하세요.</td></tr>')+'</tbody></table></div>';
  }
  body.innerHTML=
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;"><i class="ti ti-binary-tree" style="font-size:24px;color:var(--blue);"></i><span style="font-size:20px;font-weight:700;">SNMP OID Management</span></div>'
    +'<div style="display:flex;gap:0;align-items:stretch;border:1px solid #cfd4dc;border-radius:12px;overflow:hidden;box-shadow:0 1px 7px rgba(0,0,0,0.06);">'
      +'<div style="width:236px;flex-shrink:0;border-right:2px solid #cdd3db;padding:14px;background:#eef2f7;">'
        +'<div style="font-size:10px;font-weight:800;color:#9aa1ad;letter-spacing:1px;margin-bottom:10px;">선택 (1열)</div>'+left
      +'</div>'
      +'<div style="flex:1;min-width:0;padding:18px 20px;background:#fff;min-height:360px;">'
        +'<div style="font-size:10px;font-weight:800;color:#b8bdc8;letter-spacing:1px;margin-bottom:12px;">상세 (2열)</div>'+right
      +'</div>'
    +'</div>';
}
const _CRUMB={
  dashboard:['Dashboard',''],
  chat:['AI Assistant','AI 채팅'], llm:['AI Assistant','LLM 설정'], manual:['AI Assistant','RAG Data'], 'sys-ai':['AI Assistant','시험절차 학습/조회'], 'ai-stat':['AI Assistant','AI 피드백·통계'], 'ai-config':['AI Assistant','AI 어시스턴트 설정'], 'jira-ai':['AI Assistant','지식 검색'], 'jira-ai-beta':['AI Assistant','지식 검색'],
  explorer:['Test Workflow','Requirements & Test Coverage'], tm:['Test Workflow','Requirements & Test Coverage'], explorer3:['Test Workflow','Requirements & Test Coverage'], 'explorer3-beta':['Test Workflow','Requirements & Test Coverage (Beta)'], req:['Test Workflow','Requirements'], tc:['Test Workflow','Test Case'], board:['Test Workflow','실행 보드'],
  milestone:['Test Workflow','Milestone (Test Planning)'], cycle:['Test Workflow','Test Cycle'], report:['Test Workflow','Test Report'],
  'ixia-traffic':['Test Workflow','IXIA N2X 트래픽 시험'], 'stc-traffic':['Test Workflow','STC 트래픽 시험'], snmp:['Test Workflow','SNMP OID Management'], 'sys-custom':['Test Workflow','커스텀 필드 설정'], 'global-params':['Test Workflow','Global Parameters'],
  'issue-sync':['Issue Sync',''],
  'itms-rack':['Rack View','Rack 배치 (Lab Rack View)'],
  'device-reg':['Device Management','Device Registration'], 'device-reg-beta':['Device Management','Device Registration'], model:['Device Management','Model / Vendor Registration'], linecard:['Device Management','Line Card Registration'], vendor:['Device Management','Vendor Registration'], meters:['Device Management','Traffic Generator'], lab:['Device Management','Lab'],
  bbs:['시스템','게시판 (요청사항)'], 'sys-theme':['시스템','테마 설정'], 'sys-mail':['시스템','메일(SMTP) 설정'], 'sys-jira':['Jira Integration','Jira 연동 설정'], 'sys-jira-search':['AI Assistant','Jira Search 설정'], 'sys-jira-panel':['Jira Integration','Jira 프로젝트 패널 설정'], 'sys-users':['시스템','사용자 관리'], 'sys-perms':['시스템','권한 관리'], 'sys-org':['시스템','조직 설정'], 'sys-export':['시스템','데이터 내보내기'], 'sys-import':['시스템','데이터 가져오기'], 'sys-version':['시스템','버전 현황'], 'sys-config':['시스템','시스템 설정'], 'sys-help':['시스템','사용 도움말'], 'sys-prompt':['시스템','프롬프트']
};

// ══════════════ Jira 연동 ══════════════
var _jiraCfg=null;
function _jrField(label,inner){ return '<div><div style="font-size:12px;color:var(--text3);font-weight:600;margin-bottom:4px;">'+label+'</div>'+inner+'</div>'; }
function _jrGV(id){ var e=document.getElementById(id); return e?e.value.trim():''; }
function _jrFormCfg(){ return { url:_jrGV('jr-url'), auth:_jrGV('jr-auth'), user:_jrGV('jr-user'), token:_jrGV('jr-token'), verify:!!(document.getElementById('jr-verify')&&document.getElementById('jr-verify').checked) }; }
// ── Jira 패널 설정: 패널 정의 ──
var _JI_PANELS=[
  {id:'p_ref',    name:'1. 관련 근거',        auto:true},
  {id:'p_obj',    name:'2. 목적',             auto:true},
  {id:'p_pre',    name:'3. 사전 준비 조건',    auto:true},
  {id:'p_topo',   name:'4. 시험 구성도',       auto:false},
  {id:'p_proc',   name:'5. 시험 절차 및 결과', auto:true},
  {id:'p_log',    name:'6. Kernel Log',       auto:true},
];
var _jiProjPanels={};   // { "P106": { defect:{p_ref:true,...}, cr:{...} }, ... }
var _jiProjSel='';      // 현재 선택된 프로젝트 key
var _jiPanelType='defect'; // 현재 이슈유형 탭

async function renderJiraConfig(){
  var el=document.getElementById('jira-config-body'); if(!el)return;
  el.innerHTML='<div style="color:var(--text3);padding:20px;">불러오는 중…</div>';
  try{ _jiraCfg=await (await fetch('/api/jira/config')).json(); }catch(e){ _jiraCfg={}; }
  _jiraCfg=_jiraCfg||{}; var c=_jiraCfg;
  _jiProjPanels=c.panel_templates||{};
  var esc=function(s){return String(s==null?'':s).replace(/"/g,'&quot;');};
  var inSt='width:100%;font-size:13px;padding:9px 12px;border:1px solid var(--border);border-radius:8px;outline:none;box-sizing:border-box;';

  el.innerHTML=
    '<div style="display:flex;align-items:center;gap:11px;margin-bottom:18px;"><i class="ti ti-brand-jira" style="font-size:26px;color:#2684ff;"></i><div><div style="font-size:19px;font-weight:800;">Jira 연동 설정</div><div style="font-size:12.5px;color:var(--text3);">Jira Server 8.14 · REST API v2 · 시험 결함을 이슈로 등록/조회</div></div></div>'
    +'<div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;">'
      +'<div style="border:1px solid var(--border);border-radius:12px;padding:18px 20px;background:#fff;flex:1 1 0;min-width:300px;display:flex;flex-direction:column;gap:13px;">'
        +_jrField('Jira URL','<input id="jr-url" value="'+esc(c.url||'')+'" placeholder="https://devums.ubiquoss.com" style="'+inSt+'">')
        +_jrField('인증 방식','<select id="jr-auth" style="'+inSt+'cursor:pointer;"><option value="basic"'+((c.auth||'basic')==='basic'?' selected':'')+'>ID / 비밀번호 (Basic)</option><option value="bearer"'+(c.auth==='bearer'?' selected':'')+'>PAT 토큰 (Bearer · 권장)</option></select>')
        +_jrField('사용자 ID','<input id="jr-user" value="'+esc(c.user||'')+'" placeholder="itest" style="'+inSt+'">')
        +_jrField('비밀번호 / PAT','<input id="jr-token" type="password" value="'+esc(c.token||'')+'" placeholder="비밀번호 또는 Personal Access Token" style="'+inSt+'">')
        +'<label style="display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--text2);cursor:pointer;"><input type="checkbox" id="jr-verify" '+((c.verify!==false)?'checked':'')+'> TLS 인증서 검증 (사내 자체서명 인증서로 실패하면 해제)</label>'
        +'<div style="display:flex;gap:8px;flex-wrap:wrap;"><button onclick="jiraCfgSave()" style="font-size:13px;font-weight:700;padding:9px 18px;border-radius:8px;border:none;background:#00a872;color:#fff;cursor:pointer;"><i class="ti ti-device-floppy"></i> 저장</button><button onclick="jiraCfgTest()" style="font-size:13px;font-weight:700;padding:9px 18px;border-radius:8px;border:1px solid #2684ff;background:#fff;color:#2684ff;cursor:pointer;"><i class="ti ti-plug"></i> 연결 테스트</button></div>'
        +'<div id="jr-test-result" style="font-size:13px;"></div>'
      +'</div>'
      +'<div style="border:1px solid var(--border);border-radius:12px;padding:18px 20px;background:#fff;flex:1 1 0;min-width:280px;">'
        +'<div style="font-size:14px;font-weight:800;margin-bottom:10px;">기본값 <span style="font-weight:500;color:var(--text3);font-size:12px;">— 이슈 등록 시 미리 선택</span></div>'
        +'<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">'
          +'<div style="flex:1;min-width:200px;"><div style="font-size:12px;color:var(--text3);font-weight:600;margin-bottom:4px;">기본 프로젝트</div><select id="jr-def-proj" onchange="jiraLoadIssueTypes(this.value,\'jr-def-itype\')" style="'+inSt+'cursor:pointer;"><option value="">— 프로젝트 로드 필요 —</option></select></div>'
          +'<button onclick="jiraLoadProjects(\'jr-def-proj\')" style="font-size:12.5px;padding:9px 14px;border-radius:8px;border:1px solid var(--border);background:#fff;cursor:pointer;"><i class="ti ti-refresh"></i> 프로젝트 로드</button>'
        +'</div>'
        +'<div style="margin-top:10px;max-width:300px;"><div style="font-size:12px;color:var(--text3);font-weight:600;margin-bottom:4px;">기본 이슈유형</div><select id="jr-def-itype" style="'+inSt+'cursor:pointer;"><option value="">— 프로젝트 선택 후 —</option></select></div>'
        +'<button onclick="jiraDefSave()" style="margin-top:12px;font-size:13px;font-weight:700;padding:9px 18px;border-radius:8px;border:none;background:#2d6fd4;color:#fff;cursor:pointer;"><i class="ti ti-device-floppy"></i> 기본값 저장</button>'
      +'</div>'
      +'<div style="border:1px solid var(--border);border-radius:12px;padding:18px 20px;background:#fff;flex:1 1 0;min-width:300px;">'
        +'<div style="font-size:14px;font-weight:800;margin-bottom:3px;">주요 프로젝트 <span style="font-weight:500;color:var(--text3);font-size:12px;">— 체크한 것만 이슈 등록 드롭다운에 표시 (프로젝트가 많을 때)</span></div>'
        +'<div style="display:flex;gap:8px;margin:9px 0;flex-wrap:wrap;"><button onclick="jiraFavLoad()" style="font-size:12.5px;padding:8px 14px;border-radius:8px;border:1px solid var(--border);background:#fff;cursor:pointer;"><i class="ti ti-list-check"></i> 전체 프로젝트 불러오기</button><button onclick="jiraFavSave()" style="font-size:12.5px;padding:8px 16px;border-radius:8px;border:none;background:#00a872;color:#fff;cursor:pointer;font-weight:700;"><i class="ti ti-device-floppy"></i> 주요 프로젝트 저장</button></div>'
        +'<div id="jr-fav-box" style="max-height:300px;overflow:auto;border:1px solid var(--border);border-radius:8px;padding:9px 11px;font-size:13px;color:var(--text3);">[전체 프로젝트 불러오기]를 눌러 자주 쓰는 프로젝트를 체크하세요. (체크 항목이 없으면 전체 표시)</div>'
      +'</div>'
    +'</div>'
    +'<div style="font-size:11.5px;color:var(--text3);margin-top:12px;line-height:1.6;"><i class="ti ti-shield-lock"></i> 보안: 비밀번호 대신 <b>PAT(Personal Access Token)</b> 권장. 자격증명은 백엔드 <b>data/integrations/jira.json</b>에만 저장(외부 전송 없음).</div>';

  if(c.url && c.token){ jiraLoadProjects('jr-def-proj', c.default_project, c.default_issuetype); }
}

async function renderJiraPanelPage(){
  var el=document.getElementById('jira-panel-body'); if(!el)return;
  el.innerHTML='<div style="color:var(--text3);padding:20px;">불러오는 중…</div>';
  try{ _jiraCfg=await (await fetch('/api/jira/config')).json(); }catch(e){ _jiraCfg={}; }
  _jiraCfg=_jiraCfg||{};
  _jiProjPanels=_jiraCfg.panel_templates||{};

  el.innerHTML=
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;">'
      +'<i class="ti ti-layout-columns" style="font-size:22px;color:#2d6fd4;"></i>'
      +'<div style="flex:1;"><div style="font-size:18px;font-weight:800;">Jira 프로젝트 패널 설정</div>'
      +'<div style="font-size:12.5px;color:var(--text3);">프로젝트별 Defect·CR 이슈 등록 폼에 표시할 패널을 설정합니다. 체크 변경 즉시 저장됩니다.</div></div>'
      +'<button onclick="jrPanelLoadProjs()" style="font-size:12.5px;padding:6px 14px;border-radius:8px;border:1px solid var(--border);background:#fff;cursor:pointer;color:var(--text2);display:flex;align-items:center;gap:5px;font-weight:600;flex-shrink:0;"><i class="ti ti-refresh"></i> 새로고침</button>'
    +'</div>'
    // Fail 자동 이슈 등록 — 프로젝트별 on/off (좌측에서 선택한 프로젝트 기준)
    +'<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;padding:11px 15px;border:1px solid var(--border);border-radius:10px;background:#fff;">'
      +'<i class="ti ti-bug" style="color:#e8820c;font-size:17px;flex-shrink:0;"></i>'
      +'<div style="flex:1;min-width:0;">'
        +'<div style="font-size:12.5px;font-weight:800;color:#344054;">Fail 자동 이슈 등록 <span id="jr-auto-proj" style="color:#2d6fd4;font-family:ui-monospace,monospace;"></span></div>'
        +'<div style="font-size:11px;color:var(--text3);line-height:1.5;">Test Cycle 자동 실행에서 이 프로젝트로 매칭된 Fail 항목을 자동으로 이슈 등록합니다. 기본은 꺼짐 — 좌측 목록의 스위치로도 켜고 끌 수 있습니다.</div>'
      +'</div>'
      +'<label id="jr-auto-jira-wrap" style="display:flex;align-items:center;gap:9px;flex-shrink:0;cursor:pointer;">'
        +'<span id="jr-auto-jira-label" style="font-size:12.5px;font-weight:800;color:#8a93a4;">꺼짐</span>'
        +'<span onclick="jrAutoJiraOnSave()" style="display:inline-flex;align-items:center;width:40px;height:22px;border-radius:12px;cursor:pointer;padding:2px;box-sizing:border-box;background:#d7dce3;transition:background .15s;" id="jr-auto-jira-sw">'
          +'<span style="width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,0.25);transition:transform .15s;" id="jr-auto-jira-dot"></span>'
        +'</span>'
      +'</label>'
    +'</div>'
    // 3열 카드 그리드
    +'<div style="display:grid;grid-template-columns:320px 1fr 1fr;gap:0;border:1px solid var(--border);border-radius:12px;overflow:hidden;background:#fff;">'
      // 1열: 프로젝트
      +'<div style="border-right:1px solid var(--border);display:flex;flex-direction:column;">'
        +'<div style="padding:10px 14px;background:#f8f9fb;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:6px;">'
          +'<span style="font-size:12.5px;font-weight:700;color:#344054;flex:1;">프로젝트</span>'
          +'<span id="jr-proj-count" style="font-size:11.5px;color:var(--text3);"></span>'
        +'</div>'
        +'<div id="jr-panel-projlist" style="overflow-y:auto;max-height:480px;">'
          +'<div style="padding:20px;text-align:center;font-size:12.5px;color:var(--text3);"><i class="ti ti-loader"></i> 로드 중…</div>'
        +'</div>'
      +'</div>'
      // 2열: Defect
      +'<div style="border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;">'
        +'<div style="padding:10px 14px;background:#fff8f8;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:7px;flex-shrink:0;">'
          +'<span style="background:#fee2e2;color:#991b1b;border-radius:4px;padding:2px 9px;font-size:12.5px;font-weight:700;">Defect</span>'
          +'<div style="margin-left:auto;display:flex;gap:5px;">'
            +'<button onclick="jrPanelSelAll(\'defect\')" style="font-size:11.5px;padding:2px 8px;border-radius:5px;border:1px solid var(--border);background:#fff;cursor:pointer;color:var(--text2);font-weight:600;">전체</button>'
            +'<button onclick="jrPanelSelNone(\'defect\')" style="font-size:11.5px;padding:2px 8px;border-radius:5px;border:1px solid var(--border);background:#fff;cursor:pointer;color:var(--text2);font-weight:600;">해제</button>'
          +'</div>'
        +'</div>'
        +'<div style="padding:6px 10px;background:#fff8f8;border-bottom:1px solid var(--border);font-size:11.5px;font-weight:700;color:#991b1b;flex-shrink:0;">표시 패널</div>'
        +'<div id="jr-panel-defect" style="display:flex;flex-direction:column;border-bottom:1px solid var(--border);"></div>'
        +'<div style="padding:6px 10px;background:#fff8f8;border-bottom:1px solid var(--border);font-size:11.5px;font-weight:700;color:#991b1b;flex-shrink:0;display:flex;align-items:center;gap:6px;">필드 기본값 <span style="font-size:11px;font-weight:500;color:var(--text3);">— 이슈 등록 시 자동 입력</span><button onclick="jrFieldDefaultsLoad(\'defect\')" style="margin-left:auto;font-size:11px;padding:2px 8px;border-radius:5px;border:1px solid var(--border);background:#fff;cursor:pointer;color:var(--text2);font-weight:600;display:flex;align-items:center;gap:4px;"><i class="ti ti-refresh" style="font-size:11px;"></i> 로드</button></div>'
        +'<div id="jr-flddef-defect" style="flex:1;overflow-y:auto;padding:8px 10px;display:flex;flex-direction:column;gap:7px;min-height:60px;"><div style="font-size:12px;color:var(--text3);">← 프로젝트 선택 후 [로드]</div></div>'
      +'</div>'
      // 3열: CR
      +'<div style="display:flex;flex-direction:column;overflow:hidden;">'
        +'<div style="padding:10px 14px;background:#faf8ff;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:7px;flex-shrink:0;">'
          +'<span style="background:#ede9fe;color:#6d28d9;border-radius:4px;padding:2px 9px;font-size:12.5px;font-weight:700;">CR</span>'
          +'<div style="margin-left:auto;display:flex;gap:5px;">'
            +'<button onclick="jrPanelSelAll(\'cr\')" style="font-size:11.5px;padding:2px 8px;border-radius:5px;border:1px solid var(--border);background:#fff;cursor:pointer;color:var(--text2);font-weight:600;">전체</button>'
            +'<button onclick="jrPanelSelNone(\'cr\')" style="font-size:11.5px;padding:2px 8px;border-radius:5px;border:1px solid var(--border);background:#fff;cursor:pointer;color:var(--text2);font-weight:600;">해제</button>'
          +'</div>'
        +'</div>'
        +'<div style="padding:6px 10px;background:#faf8ff;border-bottom:1px solid var(--border);font-size:11.5px;font-weight:700;color:#6d28d9;flex-shrink:0;">표시 패널</div>'
        +'<div id="jr-panel-cr" style="display:flex;flex-direction:column;border-bottom:1px solid var(--border);"></div>'
        +'<div style="padding:6px 10px;background:#faf8ff;border-bottom:1px solid var(--border);font-size:11.5px;font-weight:700;color:#6d28d9;flex-shrink:0;display:flex;align-items:center;gap:6px;">필드 기본값 <span style="font-size:11px;font-weight:500;color:var(--text3);">— 이슈 등록 시 자동 입력</span><button onclick="jrFieldDefaultsLoad(\'cr\')" style="margin-left:auto;font-size:11px;padding:2px 8px;border-radius:5px;border:1px solid var(--border);background:#fff;cursor:pointer;color:var(--text2);font-weight:600;display:flex;align-items:center;gap:4px;"><i class="ti ti-refresh" style="font-size:11px;"></i> 로드</button></div>'
        +'<div id="jr-flddef-cr" style="flex:1;overflow-y:auto;padding:8px 10px;display:flex;flex-direction:column;gap:7px;min-height:60px;"><div style="font-size:12px;color:var(--text3);">← 프로젝트 선택 후 [로드]</div></div>'
      +'</div>'
    +'</div>';

  jrPanelLoadProjs();
}

function jrPanelTypeTab(type){
  _jiPanelType=type;
  // 탭 버튼 스타일
  ['defect','cr'].forEach(function(t){
    var btn=document.getElementById('jrpt-'+t);
    var panel=document.getElementById('jr-panel-'+t);
    var on=(t===type);
    if(btn){
      btn.style.borderBottomColor=on?(type==='defect'?'#e23d4d':'#7c3aed'):'transparent';
      var badge=btn.querySelector('span');
      if(badge){ badge.style.background=on?(type==='defect'?'#fee2e2':'#ede9fe'):'#f3f4f6'; badge.style.color=on?(type==='defect'?'#991b1b':'#6d28d9'):'#6b7280'; }
    }
    if(panel) panel.style.display=on?'flex':'none';
  });
}

async function jrPanelLoadProjs(){
  var box=document.getElementById('jr-panel-projlist'); if(!box) return;
  box.innerHTML='<div style="padding:20px;text-align:center;font-size:12.5px;color:var(--text3);"><i class="ti ti-loader"></i> 로드 중…</div>';
  var projs=[];
  try{
    var d=await (await fetch('/api/jira/projects')).json();
    if(d.ok){
      var cfg=_jiraCfg||{}; var favs=cfg.fav_projects||[];
      projs=(favs.length?d.projects.filter(function(p){return favs.indexOf(p.key)>=0;}):d.projects.slice());
      projs.sort(function(a,b){return String(a.key).localeCompare(String(b.key),undefined,{numeric:true});});
    }
  }catch(e){}
  Object.keys(_jiProjPanels).forEach(function(k){ if(!projs.find(function(p){return p.key===k;})) projs.unshift({key:k,name:k}); });
  var cnt=document.getElementById('jr-proj-count'); if(cnt) cnt.textContent=projs.length+'개';
  if(!projs.length){
    box.innerHTML='<div style="padding:20px;text-align:center;font-size:12.5px;color:var(--text3);">프로젝트 없음<br><small style="color:var(--text3);">Jira 연동 설정을 먼저 완료하세요</small></div>';
    return;
  }
  box.innerHTML=projs.map(function(p){
    var hasCfg=!!_jiProjPanels[p.key];
    var _ajOn=!!(_jiProjPanels[p.key]&&_jiProjPanels[p.key].auto_jira===true);
    return '<div class="jr-proj-item" data-key="'+p.key+'" onclick="jrPanelSelProj(\''+p.key+'\')"'
      +' style="padding:9px 14px;cursor:pointer;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;border-left:3px solid transparent;">'
      +'<div style="flex:1;min-width:0;display:flex;align-items:baseline;gap:8px;overflow:hidden;">'
        +'<span style="font-size:13px;font-weight:800;color:#1e3a5f;flex-shrink:0;width:72px;font-family:ui-monospace,monospace;">'+p.key+'</span>'
        +(p.name&&p.name!==p.key?'<span style="font-size:13px;font-weight:700;color:#2d6fd4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;">'+p.name+'</span>':'')
      +'</div>'
      +_jrAutoSwitchHtml(p.key,_ajOn)
      +(hasCfg?'<span class="jr-cfg-badge" style="font-size:11px;font-weight:700;background:#dbeafe;color:#1d4ed8;border-radius:4px;padding:1px 6px;flex-shrink:0;">설정됨</span>':'')
    +'</div>';
  }).join('');
  if(projs.length) jrPanelSelProj(projs[0].key);
}

function jrPanelSelProj(key){
  _jiProjSel=key;
  document.querySelectorAll('.jr-proj-item').forEach(function(el){
    var on=el.getAttribute('data-key')===key;
    el.style.background=on?'#eef3fb':'';
    el.style.borderLeftColor=on?'#2d6fd4':'transparent';
  });
  var cfg=_jiProjPanels[key]||{};
  // 이슈 키 매핑 입력 갱신 (프로젝트별 auto_models)
  var apEl=document.getElementById('jr-auto-proj'); if(apEl) apEl.textContent='— '+key;
  _jrAutoJiraSwUpdate(cfg.auto_jira===true);
  _jrPanelRender('jr-panel-defect','defect',cfg.defect||{});
  _jrPanelRender('jr-panel-cr','cr',cfg.cr||{});
  var pd=document.getElementById('jr-panel-defect'); if(pd) pd.style.display='flex';
  var pc=document.getElementById('jr-panel-cr'); if(pc) pc.style.display='flex';
  // 필드 기본값 영역 초기화 후 자동 로드
  ['defect','cr'].forEach(function(t){
    var b=document.getElementById('jr-flddef-'+t);
    if(b) b.innerHTML='<div style="font-size:12px;color:var(--text3);"><i class="ti ti-loader"></i> 로드 중…</div>';
  });
  jrFieldDefaultsLoad('defect');
  jrFieldDefaultsLoad('cr');
}

function _jrPanelRender(containerId, type, saved){
  var box=document.getElementById(containerId); if(!box) return;
  box.innerHTML=_JI_PANELS.map(function(p){
    var on=(saved[p.id]!==false);
    return '<label style="display:flex;align-items:center;gap:10px;padding:7px 12px;border-bottom:1px solid var(--border);background:'+(on?'#f0fdf4':'#fff')+';cursor:pointer;" onclick="jrPanelToggle(this,\''+type+'\',\''+p.id+'\')">'
      +'<input type="checkbox" data-type="'+type+'" data-pid="'+p.id+'" '+(on?'checked':'')+' onclick="event.stopPropagation()" style="width:14px;height:14px;accent-color:#2d6fd4;flex-shrink:0;">'
      +'<span style="font-size:12.5px;font-weight:600;color:'+(on?'#065f46':'#344054')+';flex:1;">'+p.name+'</span>'
      +(p.auto?'<span style="font-size:12.5px;font-weight:600;color:#9aa0b8;">자동</span>':'<span style="font-size:12.5px;font-weight:600;color:#c0c4cc;">수동</span>')
    +'</label>';
  }).join('');
}

function jrPanelToggle(label, type, pid){
  var cb=label.querySelector('input[type=checkbox]');
  cb.checked=!cb.checked;
  var on=cb.checked;
  label.style.background=on?'#f0fdf4':'#fff';
  var nameEl=label.querySelector('span:first-of-type');
  if(nameEl) nameEl.style.color=on?'#065f46':'#344054';
  // 즉시 자동저장
  jrPanelSave(true);
}

function jrPanelSelAll(type){
  type=type||_jiPanelType||'defect';
  document.querySelectorAll('#jr-panel-'+type+' label').forEach(function(label){
    var cb=label.querySelector('input'); if(!cb) return;
    cb.checked=true; label.style.background='#f0fdf4';
    var nm=label.querySelector('span:first-of-type'); if(nm) nm.style.color='#065f46';
  });
  jrPanelSave(true);
}
function jrPanelSelNone(type){
  type=type||_jiPanelType||'defect';
  document.querySelectorAll('#jr-panel-'+type+' label').forEach(function(label){
    var cb=label.querySelector('input'); if(!cb) return;
    cb.checked=false; label.style.background='#fff';
    var nm=label.querySelector('span:first-of-type'); if(nm) nm.style.color='#344054';
  });
  jrPanelSave(true);
}

async function jrPanelSave(silent){
  if(!_jiProjSel){ if(!silent&&typeof showToast==='function')showToast('프로젝트를 선택하세요'); return; }
  // 기존 설정(field_defaults·issuetype)을 보존하며 패널 체크만 병합 — 통째 교체 시 기본값이 초기화되는 버그 방지
  var cfg=_jiProjPanels[_jiProjSel]||{};
  ['defect','cr'].forEach(function(type){
    cfg[type]=cfg[type]||{};
    _JI_PANELS.forEach(function(p){
      var cb=document.querySelector('#jr-panel-'+type+' input[data-pid="'+p.id+'"]');
      cfg[type][p.id]=cb?cb.checked:true;
    });
  });
  _jiProjPanels[_jiProjSel]=cfg;
  try{
    await fetch('/api/jira/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({panel_templates:_jiProjPanels})});
    if(_jiraCfg) _jiraCfg.panel_templates=_jiProjPanels;
    if(!silent&&typeof showToast==='function') showToast(_jiProjSel+' 패널 설정 저장됨');
    // "설정됨" 뱃지 갱신
    document.querySelectorAll('.jr-proj-item[data-key="'+_jiProjSel+'"]').forEach(function(el){
      if(!el.querySelector('span.jr-cfg-badge')){ el.innerHTML+='<span class="jr-cfg-badge" style="font-size:11px;font-weight:700;background:#dbeafe;color:#1d4ed8;border-radius:4px;padding:1px 6px;flex-shrink:0;">설정됨</span>'; }
    });
  }catch(e){ if(!silent&&typeof showToast==='function')showToast('저장 오류: '+e.message); }
}
async function jrFieldDefaultsLoad(type){
  var box=document.getElementById('jr-flddef-'+type); if(!box) return;
  if(!_jiProjSel){ box.innerHTML='<div style="font-size:12px;color:var(--text3);">프로젝트를 선택하세요</div>'; return; }
  // 이슈유형 select의 현재 값을 지우기 전에 먼저 읽음 (사용자가 방금 바꾼 선택이 저장값으로 되돌아가는 버그 방지)
  var liveIt=(function(){ var s=document.getElementById('jr-flddef-itype-'+type); return s?s.value:''; })();
  // 이슈유형 키 결정 (Defect / CR 이름으로 Jira에서 매칭)
  box.innerHTML='<div style="font-size:12px;color:var(--text3);"><i class="ti ti-loader"></i> 로드 중…</div>';
  var saved=(_jiProjPanels[_jiProjSel]&&_jiProjPanels[_jiProjSel][type]&&_jiProjPanels[_jiProjSel][type].field_defaults)||{};
  var savedItype=(_jiProjPanels[_jiProjSel]&&_jiProjPanels[_jiProjSel][type]&&_jiProjPanels[_jiProjSel][type].issuetype)||'';
  try{
    // 이슈유형 목록 로드
    var itd=await (await fetch('/api/jira/issuetypes?project='+encodeURIComponent(_jiProjSel))).json();
    var itypes=(itd.ok?itd.issuetypes:[]);
    // Defect/CR 자동 매칭
    var isCR=(type==='cr');
    var matched=itypes.find(function(it){ var n=it.name.toLowerCase(); return isCR?(n.indexOf('cr')>=0||n.indexOf('change')>=0):(n.indexOf('defect')>=0||n.indexOf('bug')>=0); })||itypes[0];
    var itypeName=liveIt||savedItype||(matched?matched.name:'');
    if(!itypeName){ box.innerHTML='<div style="font-size:12px;color:var(--text3);">이슈유형을 찾을 수 없습니다</div>'; return; }
    // createmeta로 필드 로드
    var fd=await (await fetch('/api/jira/createmeta?project='+encodeURIComponent(_jiProjSel)+'&issuetype='+encodeURIComponent(itypeName))).json();
    if(!fd.ok){ box.innerHTML='<div style="font-size:12px;color:#e23d4d;">필드 로드 실패</div>'; return; }
    var skip={project:1,issuetype:1,summary:1,description:1,attachment:1,issuelinks:1,labels:1};
    var flds=fd.fields.filter(function(f){ return !skip[f.id]; });
    var inSt='width:100%;font-size:12.5px;padding:6px 9px;border:1px solid var(--border);border-radius:6px;outline:none;box-sizing:border-box;';
    var itypeOpts=itypes.map(function(it){ return '<option value="'+it.name+'"'+(it.name===itypeName?' selected':'')+'>'+it.name+'</option>'; }).join('');
    var html='<div style="margin-bottom:8px;display:flex;align-items:center;gap:6px;">'
      +'<span style="font-size:12px;font-weight:700;color:var(--text2);flex-shrink:0;">이슈유형</span>'
      +'<select id="jr-flddef-itype-'+type+'" onchange="jrFieldDefaultsLoad(\''+type+'\')" style="'+inSt+'cursor:pointer;flex:1;">'+itypeOpts+'</select>'
      +'</div>';
    html+=flds.map(function(f){
      var v=saved[f.id]!==undefined?saved[f.id]:'';
      var lab='<div style="font-size:11.5px;font-weight:700;color:var(--text2);margin-bottom:3px;">'+String(f.name||f.id).replace(/</g,'&lt;')+(f.required?' <span style="color:#c0414f;">*</span>':'')+'</div>';
      var inp;
      if(f.options&&f.options.length){
        var opts=f.options.map(function(o){ return '<option value="'+o.id+'"'+(String(o.id)===String(v)||o.name===v?' selected':'')+'>'+String(o.name).replace(/</g,'&lt;')+'</option>'; }).join('');
        inp='<select id="jrfd-'+type+'-'+f.id+'" data-fid="'+f.id+'" onchange="jrFieldDefaultsSave(\''+type+'\')" style="'+inSt+'cursor:pointer;"><option value="">(기본값 없음)</option>'+opts+'</select>';
      } else if(f.type==='date'||f.items==='date'){
        inp='<input id="jrfd-'+type+'-'+f.id+'" data-fid="'+f.id+'" type="date" value="'+String(v).replace(/"/g,'&quot;')+'" onchange="jrFieldDefaultsSave(\''+type+'\')" style="'+inSt+'">';
      } else {
        inp='<input id="jrfd-'+type+'-'+f.id+'" data-fid="'+f.id+'" value="'+String(v).replace(/"/g,'&quot;')+'" oninput="jrFieldDefaultsSave(\''+type+'\')" placeholder="기본값 없음" style="'+inSt+'">';
      }
      return '<div>'+lab+inp+'</div>';
    }).join('');
    box.innerHTML=html||'<div style="font-size:12px;color:var(--text3);">설정 가능한 필드 없음</div>';
    // 이슈유형 저장 (사용자가 select로 변경했으면 서버에도 즉시 저장)
    if(!_jiProjPanels[_jiProjSel]) _jiProjPanels[_jiProjSel]={};
    if(!_jiProjPanels[_jiProjSel][type]) _jiProjPanels[_jiProjSel][type]={};
    var _prevIt=_jiProjPanels[_jiProjSel][type].issuetype||'';
    _jiProjPanels[_jiProjSel][type].issuetype=itypeName;
    if(liveIt&&liveIt!==_prevIt){
      try{
        await fetch('/api/jira/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({panel_templates:_jiProjPanels})});
        if(_jiraCfg) _jiraCfg.panel_templates=_jiProjPanels;
      }catch(e2){}
    }
  }catch(e){ box.innerHTML='<div style="font-size:12px;color:#e23d4d;">오류: '+e.message+'</div>'; }
}

// Test Cycle 자동 실행의 Fail 자동 이슈 등록 — 프로젝트별 on/off (기본 OFF)
// 두 곳에서 토글 가능: ① 좌측 목록의 미니 스위치(jrAutoJiraToggle) ② 상단 카드의 큰 스위치(jrAutoJiraOnSave, 현재 선택 프로젝트)
function _jrAutoSwitchHtml(key,on){
  var kk=String(key).replace(/'/g,"\\'");
  return '<span onclick="event.stopPropagation();jrAutoJiraToggle(\''+kk+'\')" title="Fail 자동 이슈 등록 — Test Cycle 자동 실행에서 Fail 시 이 프로젝트로 이슈를 자동 등록합니다 (기본 꺼짐)" style="flex-shrink:0;display:inline-flex;align-items:center;width:34px;height:19px;border-radius:10px;cursor:pointer;padding:2px;box-sizing:border-box;background:'+(on?'#2d6fd4':'#d7dce3')+';transition:background .15s;">'
    +'<span style="width:15px;height:15px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,0.25);transform:translateX('+(on?'15px':'0')+');transition:transform .15s;"></span>'
  +'</span>';
}
function _jrMiniSwUpdate(key,on){
  document.querySelectorAll('.jr-proj-item[data-key="'+key+'"] > span[onclick*="jrAutoJiraToggle"]').forEach(function(el){
    el.style.background=on?'#2d6fd4':'#d7dce3';
    var dot=el.querySelector('span'); if(dot) dot.style.transform='translateX('+(on?'15px':'0')+')';
  });
}
function _jrAutoJiraSwUpdate(on){
  var sw=document.getElementById('jr-auto-jira-sw'); var dot=document.getElementById('jr-auto-jira-dot'); var lab=document.getElementById('jr-auto-jira-label');
  if(sw) sw.style.background=on?'#2d6fd4':'#d7dce3';
  if(dot) dot.style.transform='translateX('+(on?'18px':'0')+')';
  if(lab){ lab.textContent=on?'켜짐':'꺼짐'; lab.style.color=on?'#1d4ed8':'#8a93a4'; }
}
async function _jrAutoJiraSave(key,on){
  if(!_jiProjPanels[key]) _jiProjPanels[key]={};
  if(on) _jiProjPanels[key].auto_jira=true; else delete _jiProjPanels[key].auto_jira;
  _jrMiniSwUpdate(key,on);
  if(key===_jiProjSel) _jrAutoJiraSwUpdate(on);
  try{
    await fetch('/api/jira/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({panel_templates:_jiProjPanels})});
    if(_jiraCfg) _jiraCfg.panel_templates=_jiProjPanels;
    showToast('Fail 자동 이슈 등록 — '+key+': '+(on?'켜짐':'꺼짐'));
  }catch(e){ showToast('저장 오류: '+e.message); }
}
function jrAutoJiraToggle(key){   // 좌측 목록 미니 스위치
  var on=!(_jiProjPanels[key]&&_jiProjPanels[key].auto_jira===true);
  _jrAutoJiraSave(key,on);
}
function jrAutoJiraOnSave(){   // 상단 카드 큰 스위치 — 현재 선택된 프로젝트
  if(!_jiProjSel) return;
  var on=!(_jiProjPanels[_jiProjSel]&&_jiProjPanels[_jiProjSel].auto_jira===true);
  _jrAutoJiraSave(_jiProjSel,on);
}
async function jrFieldDefaultsSave(type){
  if(!_jiProjSel) return;
  var itSel=document.getElementById('jr-flddef-itype-'+type);
  var itypeName=itSel?itSel.value:'';
  var defaults={};
  document.querySelectorAll('#jr-flddef-'+type+' [data-fid]').forEach(function(el){
    var v=el.value; if(v) defaults[el.getAttribute('data-fid')]=v;
  });
  if(!_jiProjPanels[_jiProjSel]) _jiProjPanels[_jiProjSel]={};
  if(!_jiProjPanels[_jiProjSel][type]) _jiProjPanels[_jiProjSel][type]={};
  _jiProjPanels[_jiProjSel][type].field_defaults=defaults;
  if(itypeName) _jiProjPanels[_jiProjSel][type].issuetype=itypeName;
  try{
    await fetch('/api/jira/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({panel_templates:_jiProjPanels})});
    if(_jiraCfg) _jiraCfg.panel_templates=_jiProjPanels;
  }catch(e){}
}

function jiraApplyPanelVisibility(){
  var proj=(_jrGV&&_jrGV('ji-proj'))||'';
  var itype=(_jrGV&&_jrGV('ji-itype'))||'';
  var cfg=(_jiraCfg&&_jiraCfg.panel_templates&&proj&&_jiraCfg.panel_templates[proj]);
  if(!cfg){ _JI_PANELS.forEach(function(p){ var el=document.getElementById('ji-sec-'+p.id); if(el)el.style.display=''; }); return; }
  // Defect/CR 판별: 이슈유형 이름 기준 (대소문자 무시)
  var itypeL=itype.toLowerCase();
  var isCR=(itypeL.indexOf('cr')>=0||itypeL.indexOf('change')>=0||itypeL.indexOf('개선')>=0);
  var typeKey=isCR?'cr':'defect';
  var panelCfg=cfg[typeKey]||{};
  _JI_PANELS.forEach(function(p){
    var el=document.getElementById('ji-sec-'+p.id); if(!el) return;
    var on=(panelCfg[p.id]!==false);
    el.style.display=on?'':'none';
  });
}

async function jiraCfgSave(){
  try{ await fetch('/api/jira/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(_jrFormCfg())}); showToast('Jira 설정 저장됨'); }
  catch(e){ showToast('저장 오류: '+e.message); }
}
async function jiraCfgTest(){
  var rEl=document.getElementById('jr-test-result'); if(rEl)rEl.innerHTML='<span style="color:var(--text2);"><i class="ti ti-loader"></i> 연결 확인 중… (수 초)</span>';
  try{
    var r=await fetch('/api/jira/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(_jrFormCfg())});
    var d=await r.json();
    if(d.ok){ if(rEl)rEl.innerHTML='<span style="color:#00a872;font-weight:700;"><i class="ti ti-circle-check"></i> 연결 성공 · '+(d.displayName||d.name||'')+'</span>'; }
    else{ if(rEl)rEl.innerHTML='<span style="color:#e23d4d;"><i class="ti ti-circle-x"></i> 실패: '+String(d.error||'').replace(/</g,'&lt;')+'</span>'; }
  }catch(e){ if(rEl)rEl.innerHTML='<span style="color:#e23d4d;">요청 오류: '+e.message+'</span>'; }
}
async function jiraLoadProjects(selId, preKey, preItype){
  var sel=document.getElementById(selId); if(!sel)return;
  sel.innerHTML='<option value="">로드 중…</option>';
  try{
    var d=await (await fetch('/api/jira/projects')).json();
    if(!d.ok){ sel.innerHTML='<option value="">실패: '+String(d.error||'').slice(0,60)+'</option>'; return; }
    var cfg={}; try{ cfg=await (await fetch('/api/jira/config')).json(); }catch(e){}
    var favs=(cfg&&cfg.fav_projects)||[];
    var list=(favs.length? d.projects.filter(function(p){return favs.indexOf(p.key)>=0;}) : d.projects.slice());
    list.sort(function(a,b){ return String(a.key).localeCompare(String(b.key),undefined,{numeric:true}); });
    sel.innerHTML='<option value="">(선택)</option>'+list.map(function(p){ return '<option value="'+p.key+'"'+(preKey===p.key?' selected':'')+'>'+p.key+' · '+String(p.name).replace(/</g,'&lt;')+'</option>'; }).join('')+(favs.length?'<option value="" disabled>— 주요 '+list.length+'개 표시 (설정에서 변경) —</option>':'');
    if(preKey){ jiraLoadIssueTypes(preKey, selId==='jr-def-proj'?'jr-def-itype':(selId.replace('-proj','-itype')), preItype); }
  }catch(e){ sel.innerHTML='<option value="">오류: '+e.message+'</option>'; }
}
async function jiraLoadIssueTypes(projectKey, itypeSelId, preItype){
  var sel=document.getElementById(itypeSelId); if(!sel)return;
  if(!projectKey){ sel.innerHTML='<option value="">— 프로젝트 선택 후 —</option>'; return; }
  sel.innerHTML='<option value="">로드 중…</option>';
  try{
    var d=await (await fetch('/api/jira/issuetypes?project='+encodeURIComponent(projectKey))).json();
    if(!d.ok){ sel.innerHTML='<option value="">실패: '+String(d.error||'').slice(0,60)+'</option>'; return; }
    sel.innerHTML=d.issuetypes.filter(function(t){return !t.subtask;}).map(function(t){ return '<option value="'+t.id+'"'+(String(preItype)===String(t.id)?' selected':'')+'>'+String(t.name).replace(/</g,'&lt;')+'</option>'; }).join('');
    if(itypeSelId==='ji-itype'){ jiraLoadFields(); }   // 이슈 모달: 선택된 유형의 필드 로드
  }catch(e){ sel.innerHTML='<option value="">오류: '+e.message+'</option>'; }
}
async function jiraDefSave(){
  var body={ default_project:_jrGV('jr-def-proj'), default_issuetype:_jrGV('jr-def-itype') };
  try{ await fetch('/api/jira/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); showToast('기본값 저장됨'); }
  catch(e){ showToast('저장 오류: '+e.message); }
}
async function jiraFavLoad(){
  var box=document.getElementById('jr-fav-box'); if(!box)return; box.innerHTML='불러오는 중…';
  try{
    var d=await (await fetch('/api/jira/projects')).json();
    if(!d.ok){ box.innerHTML='실패: '+String(d.error||'').slice(0,80); return; }
    var cfg={}; try{ cfg=await (await fetch('/api/jira/config')).json(); }catch(e){}
    var favs=(cfg&&cfg.fav_projects)||[];
    var ps=d.projects.slice().sort(function(a,b){ return String(a.key).localeCompare(String(b.key),undefined,{numeric:true}); });
    box.innerHTML='<input id="jr-fav-search" oninput="jiraFavFilter()" placeholder="프로젝트 검색… ('+ps.length+'개)" style="width:100%;font-size:12.5px;padding:7px 10px;border:1px solid var(--border);border-radius:7px;margin-bottom:8px;box-sizing:border-box;">'+
      '<div id="jr-fav-items">'+ps.map(function(p){ var t=String(p.key+' '+p.name).toLowerCase().replace(/"/g,'&quot;'); return '<label data-t="'+t+'" style="display:flex;align-items:center;gap:8px;padding:4px 2px;cursor:pointer;"><input type="checkbox" class="jr-fav-chk" value="'+p.key+'"'+(favs.indexOf(p.key)>=0?' checked':'')+'> <span style="font-weight:700;color:var(--text);">'+p.key+'</span> <span style="color:var(--text3);">'+String(p.name).replace(/</g,'&lt;')+'</span></label>'; }).join('')+'</div>';
  }catch(e){ box.innerHTML='오류: '+e.message; }
}
function jiraFavFilter(){ var s=document.getElementById('jr-fav-search'); var q=(s?s.value:'').toLowerCase(); Array.prototype.forEach.call(document.querySelectorAll('#jr-fav-items label'),function(l){ l.style.display=(l.getAttribute('data-t').indexOf(q)>=0)?'flex':'none'; }); }
async function jiraFavSave(){
  var ks=Array.prototype.slice.call(document.querySelectorAll('.jr-fav-chk')).filter(function(c){return c.checked;}).map(function(c){return c.value;});
  try{ await fetch('/api/jira/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fav_projects:ks})}); showToast('주요 프로젝트 저장됨 ('+ks.length+'개)'); if(_jiraCfg)_jiraCfg.fav_projects=ks; jiraLoadProjects('jr-def-proj', _jrGV('jr-def-proj')); }
  catch(e){ showToast('저장 오류: '+e.message); }
}

// ══════════════ Issue Sync — 특정 Jira 프로젝트의 이슈 동기화(조회) ══════════════
let _isyncIssues=[], _isyncCfg={}, _isyncFields=null;
const _ISYNC_DEF_COLS=[{id:'key',label:'키'},{id:'project',label:'프로젝트'},{id:'issuetype',label:'유형'},{id:'summary',label:'제목'},{id:'status',label:'상태'},{id:'reporter',label:'보고자'}];
function _isyncCols(){ try{ const s=localStorage.getItem('utop_isync_cols'); if(s){ const a=JSON.parse(s); if(Array.isArray(a)&&a.length) return a; } }catch(e){} return _ISYNC_DEF_COLS.slice(); }
function _isyncColsSave(cols){ try{ localStorage.setItem('utop_isync_cols', JSON.stringify(cols)); }catch(e){} }
function _isyncFieldsParam(cols){ const ids=cols.map(c=>c.id).filter(id=>id!=='key'); if(ids.indexOf('status')<0)ids.push('status'); return ids.join(','); }
async function renderIssueSync(){
  const el=document.getElementById('issue-sync-body'); if(!el) return;
  el.innerHTML='<div style="color:var(--text3);padding:26px;">불러오는 중…</div>';
  try{ _isyncCfg=await (await fetch('/api/jira/config')).json(); }catch(e){ _isyncCfg={}; }
  _isyncCfg=_isyncCfg||{};
  if(!_isyncCfg.url || !_isyncCfg.token){
    el.innerHTML='<div style="max-width:1000px;margin:0 auto;padding:22px 24px;box-sizing:border-box;">'+
      '<div style="display:flex;align-items:center;gap:11px;margin-bottom:8px;"><i class="ti ti-brand-jira" style="font-size:24px;color:#2684ff;"></i><div style="font-size:19px;font-weight:800;">Jira 연동 · AI 설정</div></div>'+
      '<div style="font-size:13px;color:var(--text3);margin-bottom:13px;line-height:1.6;">아래에서 <b>Jira 연결(URL·인증)</b>을 입력 → <b>연결 테스트</b> → <b>전체 저장</b> 하면 이슈 동기화와 AI 검색을 바로 쓸 수 있습니다.</div>'+
      '<div style="border:1px solid #c9b6f0;border-radius:12px;padding:16px 18px;background:#faf8ff;">'+_jiraAiCfgPanel()+'</div>'+
    '</div>';
    _jiraAiLoadLlms();
    return;
  }
  const inSt='font-size:13px;padding:8px 11px;border:1px solid var(--border);border-radius:8px;outline:none;box-sizing:border-box;';
  el.innerHTML=
    '<div style="width:100%;margin:0;padding:18px 22px;box-sizing:border-box;">'+
      '<div style="display:flex;align-items:center;gap:11px;margin-bottom:16px;"><i class="ti ti-refresh" style="font-size:24px;color:#2684ff;"></i><div style="font-size:19px;font-weight:800;">Issue Sync <span style="font-size:12px;font-weight:500;color:var(--text3);">— 특정 Jira 프로젝트의 이슈 동기화</span></div></div>'+
      '<div style="display:flex;gap:9px;flex-wrap:wrap;align-items:flex-end;border:1px solid var(--border);border-radius:12px;padding:14px 16px;background:#fff;margin-bottom:10px;">'+
        '<div style="flex:1;min-width:220px;"><div style="font-size:12px;color:var(--text3);font-weight:600;margin-bottom:4px;">프로젝트</div><select id="isync-proj" onchange="isyncLoadStored(this.value)" style="'+inSt+'width:100%;cursor:pointer;"><option value="">로드 중…</option></select></div>'+
        '<button onclick="isyncSync(false)" title="마지막 동기화 이후 변경분만 가져와 저장(증분)" style="font-size:13px;font-weight:700;padding:9px 18px;border-radius:8px;border:none;background:#2684ff;color:#fff;cursor:pointer;"><i class="ti ti-cloud-download"></i> 동기화</button>'+
        '<button onclick="isyncSync(true)" title="전체를 다시 가져와 저장(최초/재동기화)" style="font-size:13px;font-weight:700;padding:9px 14px;border-radius:8px;border:1px solid #2684ff;background:#fff;color:#2684ff;cursor:pointer;"><i class="ti ti-refresh"></i> 전체</button>'+
        '<button onclick="isyncFieldPicker()" style="font-size:13px;font-weight:700;padding:9px 14px;border-radius:8px;border:1px solid #2684ff;background:#fff;color:#2684ff;cursor:pointer;"><i class="ti ti-columns-3"></i> 필드/컬럼</button>'+
        '<button onclick="isyncExport()" style="font-size:13px;font-weight:700;padding:9px 14px;border-radius:8px;border:1px solid #00a872;background:#fff;color:#00875a;cursor:pointer;"><i class="ti ti-file-spreadsheet"></i> 엑셀(CSV)</button>'+
        '<button onclick="isyncDefectClassify()" id="isync-defbtn" title="현재 목록 이슈를 LLM으로 defect 자동 분류 (현장장애/상용망검증)" style="font-size:13px;font-weight:700;padding:9px 14px;border-radius:8px;border:none;background:#7c3aed;color:#fff;cursor:pointer;"><i class="ti ti-robot"></i> LLM 분류</button>'+
        '<button onclick="isyncDefectStats()" title="분류 집계 보기 (발생상황·유형·카테고리별 건수)" style="font-size:13px;font-weight:700;padding:9px 14px;border-radius:8px;border:1px solid #7c3aed;background:#fff;color:#6b3fc4;cursor:pointer;"><i class="ti ti-chart-bar"></i> 분류 집계</button>'+
        '<div style="flex:1;min-width:170px;"><div style="font-size:12px;color:var(--text3);font-weight:600;margin-bottom:4px;">검색</div><input id="isync-search" oninput="isyncFilter()" placeholder="제목·키·전체 필드…" style="'+inSt+'width:100%;"></div>'+
      '</div>'+
      '<div id="isync-colbar" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px;"></div>'+
      '<div id="isync-meta" style="font-size:12px;color:var(--text3);margin-bottom:8px;"></div>'+
      '<div id="isync-list"><div style="padding:30px;text-align:center;color:var(--text3);font-size:13px;"><i class="ti ti-arrow-up" style="font-size:18px;"></i><br>프로젝트를 선택하고 <b>동기화</b>를 누르세요.</div></div>'+
    '</div>';
  _isyncRenderColbar();
  await _isyncLoadProjects();
}
// ══════════════ Jira AI 검색·답변 — AI Assistant 하위 전용 페이지 ══════════════
// ── Jira AI 채팅 상태 ──
// 선택기(어시스턴트/모드) 통합: 'jira' | 'kb' | 'dify:<id>'(커스텀 어시스턴트)
var _jaiSel=(function(){ try{ return localStorage.getItem('utop_jai_sel')||localStorage.getItem('utop_jai_mode')||'kb'; }catch(e){ return 'kb'; } })();
// _jaiMode 호환: 'kb'/'jira'만 구분(커스텀 어시스턴트는 kb 계열로 렌더)
Object.defineProperty(window,'_jaiMode',{ get:function(){ return (_jaiSel==='jira')?'jira':'kb'; }, configurable:true });
function _jaiSetSel(v){
  _jaiSel=v||'kb';
  try{ localStorage.setItem('utop_jai_sel',_jaiSel); }catch(e){}
  // 대상 전환 시 세션 목록도 대상별로 필터되므로, 현재 세션이 다른 대상 소속이면 이 대상의 최근 세션으로 자동 이동.
  // 이 대상 소속 세션이 하나도 없으면 새 대화 생성.
  try{
    _jaiLoadSessions();
    var _cur=_jaiCurSession();
    var _match=(_jaiSessions||[]).filter(function(s){ return s.sel===_jaiSel; });
    if(!_cur || (_cur.sel && _cur.sel!==_jaiSel)){
      if(_match.length){ _jaiCurId=_match[0].id; try{ localStorage.setItem(_jaiStorageKey()+'_cur',_jaiCurId); }catch(e){} }
      else { _jaiNewSession(); }
    }
  }catch(_e){}
  if(typeof renderJiraAi==='function') renderJiraAi();
}
function _jaiSetMode(m){ _jaiSetSel((m==='kb')?'kb':'jira'); }   // 구 호출 호환
// 현재 선택된 커스텀 어시스턴트(dify:<id>) 객체 (없으면 null)
function _jaiCurAsst(){ if(String(_jaiSel).indexOf('dify:')!==0) return null; var id=_jaiSel.slice(5); return (typeof difyList!=='undefined'?difyList:[]).find(function(x){return x.id===id;})||null; }
// ── 선택기 드롭다운: 내장 모드 2개 + 공개 커스텀 어시스턴트 ──
function _jaiLlmId(){ try{ var c=(window._pageAiCfg&&window._pageAiCfg.jira_ai)||{}; return c.llm_id||''; }catch(e){ return ''; } }
// 3개 드롭다운(가로 칩): ① UTOP 내부 검색 ② 로컬 지식 툴 ③ 외부 지식 툴 — 하나만 선택, 활성 그룹 색 강조
// 검색 대상 그룹 데이터 — 선택기 칩(원본)·트리(Beta) 공용
function _jaiSelGroups(){
  var asst=(typeof difyList!=='undefined'&&Array.isArray(difyList))?difyList:[];
  var llms=(typeof llmList!=='undefined'&&Array.isArray(llmList))?llmList:[];
  var byGroup={general:[],kb:[],jira:[],external:[]};
  // LLM: kb_group 지정된 것만 (Tests/Cycle/Reports 등 미지정은 자동 제외) → 'general:<id>'
  llms.forEach(function(l){ var gr=l.kb_group||''; if(!byGroup[gr]) return; var id=l.id||l.name; byGroup[gr].push({v:'general:'+id, label:(l.name||l.model||id)}); });
  // 어시스턴트: kb_group(기본 external), 공개(public!==false)만 → 'dify:<id>'
  asst.forEach(function(a){ if(a.public===false) return; var gr=a.kb_group||'external'; if(!byGroup[gr]) return; byGroup[gr].push({v:'dify:'+a.id, label:(a.name||a.id)}); });
  return [
    {key:'general', label:'일반 검색', icon:'ti-message-2', color:'#e8820c', opts:byGroup.general},
    {key:'kb', label:'UTOP 내부 검색', icon:'ti-database-search', color:'#7c3aed', opts:[{v:'kb',label:'UTOP 지식 검색'}].concat(byGroup.kb.filter(function(o){return o.label!=='UTOP 지식 검색' && o.v!=='kb';}))},
    {key:'jira', label:'로컬 지식 툴', icon:'ti-ticket', color:'#2684ff', opts:[{v:'jira',label:'UMS(Jira) 이슈 검색'}].concat(byGroup.jira.filter(function(o){return o.label!=='UMS(Jira) 이슈 검색' && o.v!=='jira';}))},
    {key:'external', label:'외부 지식 툴', icon:'ti-plug-connected', color:'#0d9488', opts:byGroup.external}
  ];
}
function _jaiSelectorBar(){
  var esc=function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); };
  var sel=_jaiSel;
  var chip=function(g){
    var inThis=g.opts.some(function(o){return o.v===sel;});
    var on=inThis; var c=g.color;
    var wrapBg=on?(c+'1f'):'var(--bg2,#fff)';
    var wrapBd=on?c:'var(--border)';
    var txtCol=on?c:'var(--text2)';
    var selOpts='<option value=""'+(inThis?'':' selected')+'>선택 안 함</option>'
      +g.opts.map(function(o){ return '<option value="'+esc(o.v)+'"'+(sel===o.v?' selected':'')+'>'+esc(o.label)+'</option>'; }).join('');
    return '<div style="display:inline-flex;flex-direction:column;gap:3px;border:1.5px solid '+wrapBd+';background:'+wrapBg+';border-radius:11px;padding:6px 11px;min-width:150px;transition:all .12s;'+(on?('box-shadow:0 2px 8px '+c+'33;'):'')+'">'
      +'<span style="display:flex;align-items:center;gap:5px;font-size:11px;font-weight:800;color:'+txtCol+';letter-spacing:.2px;"><i class="ti '+g.icon+'" style="font-size:14px;"></i>'+esc(g.label)+(on?' <i class="ti ti-circle-check-filled" style="font-size:13px;color:'+c+';margin-left:auto;"></i>':'')+'</span>'
      +'<select onchange="_jaiSetSel(this.value)" style="font-size:13px;font-weight:'+(on?'800':'600')+';border:none;background:transparent;color:'+(on?'var(--text)':'var(--text3)')+';outline:none;cursor:pointer;padding:1px 0;max-width:150px;">'+selOpts+'</select>'
      +'</div>';
  };
  return '<div style="display:inline-flex;align-items:stretch;gap:8px;flex-wrap:wrap;">'+_jaiSelGroups().map(chip).join('')+'</div>';
}
// Beta: 검색 대상 트리 — 그룹(접기/펴기) > 항목(클릭 선택)
function _jaiSelectorTree(){
  var esc=function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); };
  var sel=_jaiSel;
  window._jaiTreeOpen=window._jaiTreeOpen||{};
  return _jaiSelGroups().map(function(g){
    var open=(window._jaiTreeOpen[g.key]!==false);
    var inThis=g.opts.some(function(o){return o.v===sel;});
    // 그룹(검색 대상): 회색 헤더 바 — 항목(모델)과 시각적으로 구분
    var h='<div onclick="_jaiTreeToggle(\''+g.key+'\')" style="display:flex;align-items:center;gap:6px;padding:7px 9px;border-radius:8px;cursor:pointer;font-size:12.5px;font-weight:800;margin-bottom:2px;background:'+(inThis?(g.color+'14'):'#eef1f6')+';border:1px solid '+(inThis?(g.color+'55'):'#e3e8f0')+';color:'+(inThis?g.color:'var(--text2)')+';letter-spacing:.02em;" onmouseenter="this.style.filter=\'brightness(0.97)\'" onmouseleave="this.style.filter=\'\'">'
      +'<i class="ti ti-chevron-'+(open?'down':'right')+'" style="font-size:11px;color:'+(inThis?g.color:'var(--text3)')+';flex-shrink:0;width:12px;"></i>'
      +'<i class="ti '+g.icon+'" style="font-size:14px;color:'+g.color+';flex-shrink:0;"></i>'
      +'<span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(g.label)+'</span>'
      +(inThis?'<i class="ti ti-circle-check-filled" style="font-size:12px;color:'+g.color+';flex-shrink:0;"></i>':'')
      +'<span style="font-size:10px;color:var(--text3);flex-shrink:0;">'+g.opts.length+'</span>'
    +'</div>';
    if(open){
      // 항목(모델): 들여쓰기 + 세로 가이드 라인 아래 리스트
      var kids;
      if(!g.opts.length){ kids='<div style="padding:3px 7px 4px 8px;font-size:11px;color:var(--text3);">항목 없음</div>'; }
      else kids=g.opts.map(function(o){
        var on=(sel===o.v);
        return '<div onclick="_jaiSetSel(\''+String(o.v).replace(/\\/g,'\\\\').replace(/'/g,"\\'")+'\')" style="display:flex;align-items:center;gap:7px;padding:5px 8px;border-radius:7px;cursor:pointer;font-size:12.5px;font-weight:'+(on?'800':'500')+';'+(on?('background:'+g.color+'1a;color:'+g.color+';'):'color:var(--text);')+'" '+(on?'':'onmouseenter="this.style.background=\'#e9edf4\'" onmouseleave="this.style.background=\'\'"')+'>'
          +'<span style="width:12px;height:12px;border-radius:50%;border:1.5px solid '+(on?g.color:'#c3cbd8')+';display:flex;align-items:center;justify-content:center;flex-shrink:0;box-sizing:border-box;">'+(on?('<span style="width:5px;height:5px;border-radius:50%;background:'+g.color+';"></span>'):'')+'</span>'
          +'<span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(o.label)+'</span>'
        +'</div>';
      }).join('');
      h+='<div style="margin:0 0 8px 15px;padding-left:9px;border-left:2px solid '+(inThis?(g.color+'55'):'#e2e7f0')+';">'+kids+'</div>';
    } else {
      h+='<div style="height:6px;"></div>';
    }
    return h;
  }).join('');
}
function _jaiTreeToggle(k){ window._jaiTreeOpen=window._jaiTreeOpen||{}; window._jaiTreeOpen[k]=(window._jaiTreeOpen[k]!==false)?false:true; renderJiraAi(); }
// Beta 컬럼 클릭 포커스 강조 — explorer3와 동일 문법 (1열 보라 / 2열 초록 / 3열 파랑)
function _jaiFocusSet(n){ window._jaiFocus=n; _jaiFocusUI(); }
function _jaiFocusUI(){
  var cols={1:'jai-tree-col',2:'jai-sidebar',3:'jai-chat-col'};
  var borders={1:'2px solid #7c3aed',2:'2px solid #00875a',3:'2px solid #2d6fd4'};
  var shadows={1:'0 0 0 3px rgba(124,58,237,0.18),0 4px 18px rgba(124,58,237,0.14)',2:'0 0 0 3px rgba(0,135,90,0.18),0 4px 18px rgba(0,135,90,0.14)',3:'0 0 0 3px rgba(45,111,212,0.18),0 4px 18px rgba(45,111,212,0.14)'};
  var n=window._jaiFocus;
  [1,2,3].forEach(function(i){
    var el=document.getElementById(cols[i]); if(!el) return;
    if(i===n){ el.style.border=borders[i]; el.style.boxShadow=shadows[i]; }
    else { el.style.border='1px solid var(--border)'; el.style.boxShadow='0 2px 10px rgba(40,50,90,0.06)'; }
  });
}
// Beta 1열(검색 대상) 폭 드래그 조절 — localStorage 저장·복원
function _jaiTreeRailDrag(e){
  e.preventDefault();
  var col=document.getElementById('jai-tree-col'); if(!col) return;
  var startX=e.clientX; var startW=col.offsetWidth;
  function onMove(ev){
    var w=Math.max(170,Math.min(500,startW+(ev.clientX-startX)));
    col.style.width=w+'px';
    try{ localStorage.setItem('utop_jai_tree_w',w); }catch(ex){}
  }
  function onUp(){ document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp); }
  document.addEventListener('mousemove',onMove);
  document.addEventListener('mouseup',onUp);
}
// 현재 선택의 그룹·항목 라벨 (Beta 헤더 배지용)
function _jaiSelLabel(){
  var gs=_jaiSelGroups();
  for(var i=0;i<gs.length;i++){
    var o=gs[i].opts.find(function(x){ return x.v===_jaiSel; });
    if(o) return {g:gs[i], o:o};
  }
  return null;
}
function _jaiSetLlm(v){ _jaiSetSel(v); }   // 드롭다운 onchange (구 호출 호환)
function _jaiHint(){
  if(String(_jaiSel).indexOf('general:')===0) return '선택한 LLM에게 일반적인 질문을 자유롭게 물어보세요 (사내 지식·Jira 검색 없음)';
  if(_jaiSel==='jira') return 'Jira 이슈를 검색해 LLM이 근거와 함께 답합니다';
  if(_jaiSel==='kb') return '매뉴얼·제품스펙 등 사내 지식을 검색해 LLM이 답합니다';
  var a=_jaiCurAsst();
  if(a){ return (a.type==='llm')?('일반 어시스턴트 · '+(a.rag?'사내 지식검색 + ':'')+'LLM 답변'):('Dify 지식 어시스턴트 · 외부 ChatFlow'); }
  return '어시스턴트를 선택해 질문하세요';
}
// 내장 kb 모드용 LLM (page-ai jira_ai.llm_id → 폴백 제마)
async function _jaiPickLlm(){
  var id=_jaiLlmId();
  if(id && typeof _rptLLMById==='function'){ var l=await _rptLLMById(id); if(l&&l.endpoint) return l; }
  return (typeof _rptGemma==='function')?await _rptGemma():null;
}
// 선택된 LLM 객체 반환 (미지정/무효면 제마 폴백)
async function _jaiPickLlm(){
  var id=_jaiLlmId();
  if(id && typeof _rptLLMById==='function'){ var l=await _rptLLMById(id); if(l&&l.endpoint) return l; }
  return (typeof _rptGemma==='function')?await _rptGemma():null;
}
var _jaiSessions=null;   // [{id,title,folderId,msgs:[{role,content,cited,jql,jqlMode}]}]
var _jaiFolders=null;    // [{id,name,open}]
var _jaiCurId=null;
var _jaiFolderCollapsed={};  // {folderId: true/false}
function _jaiStorageKey(){ return 'utop_jira_ai_sessions'; }
function _jaiLoadSessions(){
  if(_jaiSessions) return;
  try{ _jaiSessions=JSON.parse(localStorage.getItem(_jaiStorageKey()))||[]; }catch(e){ _jaiSessions=[]; }
  try{ _jaiFolders=JSON.parse(localStorage.getItem(_jaiStorageKey()+'_folders'))||[]; }catch(e){ _jaiFolders=[]; }
  try{ _jaiFolderCollapsed=JSON.parse(localStorage.getItem(_jaiStorageKey()+'_collapsed'))||{}; }catch(e){ _jaiFolderCollapsed={}; }
  try{ var sid=localStorage.getItem(_jaiStorageKey()+'_cur'); if(sid&&_jaiSessions.find(function(s){return s.id===sid;})) _jaiCurId=sid; }catch(e){}
}
function _jaiSaveSessions(){
  try{
    localStorage.setItem(_jaiStorageKey(),JSON.stringify((_jaiSessions||[]).slice(0,100)));
    localStorage.setItem(_jaiStorageKey()+'_folders',JSON.stringify(_jaiFolders||[]));
    localStorage.setItem(_jaiStorageKey()+'_collapsed',JSON.stringify(_jaiFolderCollapsed||{}));
    if(_jaiCurId) localStorage.setItem(_jaiStorageKey()+'_cur',_jaiCurId);
  }catch(e){}
}
function _jaiCurSession(){ return (_jaiSessions||[]).find(function(s){return s.id===_jaiCurId;})||null; }
function _jaiNewSession(){
  _jaiLoadSessions();
  var id='jai-'+Date.now();
  // 새 대화 세션에 현재 검색 대상(_jaiSel) 을 기록 → 대상 전환 시 세션 목록 필터링에 사용
  var s={id:id,title:'새 대화',folderId:null,msgs:[],sel:(typeof _jaiSel!=='undefined'?_jaiSel:'')};
  (_jaiSessions=_jaiSessions||[]).unshift(s);
  _jaiCurId=id;
  _jaiSaveSessions();
  return s;
}
function _jaiEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;'); }

function _jaiAccent(){ return _jaiSelColor(_jaiSel); }
// 검색 대상별 강조 색 — _jaiSelGroups() 에 정의된 그룹 색과 정확히 일치
// (일반=오렌지, UTOP 내부=보라, 로컬(Jira)=파랑, 외부=청록)
function _jaiSelColor(sel){
  try{
    var v=String(sel||'');
    var groups=(typeof _jaiSelGroups==='function')?_jaiSelGroups():[];
    for(var gi=0;gi<groups.length;gi++){
      var g=groups[gi];
      if((g.opts||[]).some(function(o){return o.v===v;})) return g.color;
    }
  }catch(e){}
  // 폴백 (그룹 못 찾은 경우)
  var _v=String(sel||'');
  if(_v==='kb') return '#7c3aed';
  if(_v==='jira') return '#2684ff';
  if(_v.indexOf('general:')===0) return '#e8820c';
  if(_v.indexOf('dify:')===0) return '#0d9488';
  return '#7c3aed';
}
// 강조 색의 옅은 배경색 (활성 세션 배경)
function _jaiSelBg(sel){ var c=_jaiSelColor(sel); return c+'22'; }
function _jaiModeBtn(m,ic,lbl){
  var on=(_jaiMode===m); var c=(m==='kb')?'#0d9488':'#7c3aed';
  return '<button onclick="_jaiSetMode(\''+m+'\')" style="display:flex;align-items:center;gap:5px;font-size:12px;font-weight:'+(on?'700':'500')+';padding:5px 12px;border:none;border-radius:7px;background:'+(on?'#fff':'transparent')+';color:'+(on?c:'var(--text3)')+';cursor:pointer;box-shadow:'+(on?'0 1px 3px rgba(0,0,0,0.12)':'none')+';white-space:nowrap;"><i class="ti '+ic+'"></i> '+lbl+'</button>';
}
async function renderJiraAi(targetId){
  // targetId: 'jira-ai-body'(원본) | 'jira-ai-beta-body'(Beta) — 지정 시 대상 전환, 이후 재렌더는 같은 대상 유지
  if(targetId==='jira-ai-body'||targetId==='jira-ai-beta-body') window._jaiTarget=targetId;
  var _tid=window._jaiTarget||'jira-ai-body';
  const el=document.getElementById(_tid); if(!el) return;
  // 같은 id의 내부 요소가 두 페이지에 동시에 존재하지 않도록 반대쪽 컨테이너 비움
  var _other=document.getElementById(_tid==='jira-ai-body'?'jira-ai-beta-body':'jira-ai-body');
  if(_other) _other.innerHTML='';
  // fast path: 60초 내 재렌더(트리 선택·토글 등)는 로딩 문구·설정 재조회 생략 → 동기 렌더로 깜빡임 제거
  var _fast=(window._jaiLoadedTs&&(Date.now()-window._jaiLoadedTs)<60000);
  if(!_fast){
    el.innerHTML='<div style="color:var(--text3);padding:26px;">불러오는 중…</div>';
    try{ _isyncCfg=await (await fetch('/api/jira/config')).json(); }catch(e){ _isyncCfg={}; }
    _isyncCfg=_isyncCfg||{};
    // LLM 선택 드롭다운용: Chat LLM 목록 + 저장된 선택(page-ai jira_ai) 확보
    try{ if((typeof llmList==='undefined'||!llmList.length)&&typeof loadLLMsFromServer==='function') await loadLLMsFromServer(); }catch(e){}
    try{ if(typeof _pgAiCfgGet==='function') await _pgAiCfgGet(); }catch(e){}
    try{ if(typeof loadDifyAssistants==='function') await loadDifyAssistants(); }catch(e){}   // 커스텀 어시스턴트 선택기용
    window._jaiLoadedTs=Date.now();
  }
  _isyncCfg=_isyncCfg||{};
  // Jira 모드에서만 연동 설정 필요 — 제품스펙·디버깅(kb) 모드는 Jira 없이도 사용
  if(_jaiMode!=='kb' && (!_isyncCfg.url || !_isyncCfg.token)){
    el.innerHTML='<div style="max-width:700px;margin:60px auto;text-align:center;color:var(--text3);padding:0 24px;">'+
      '<i class="ti ti-search" style="font-size:48px;color:#7c3aed;"></i>'+
      '<h2 style="margin:16px 0 8px;color:var(--text);font-size:19px;">지식 검색</h2>'+
      '<p style="font-size:13px;line-height:1.7;">Jira 이슈 검색에는 Jira Search 설정이 필요합니다.<br>제품스펙·디버깅 질문은 아래 버튼으로 바로 사용할 수 있습니다.</p>'+
      '<div style="display:flex;gap:8px;justify-content:center;margin-top:12px;">'+
        '<button onclick="_jaiSetMode(\'kb\')" style="font-size:13px;font-weight:700;padding:9px 18px;border-radius:8px;border:none;background:#0d9488;color:#fff;cursor:pointer;"><i class="ti ti-book-2"></i> 제품스펙·디버깅으로</button>'+
        '<button onclick="showPage(\'sys-jira-search\')" style="font-size:13px;font-weight:700;padding:9px 18px;border-radius:8px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;"><i class="ti ti-settings"></i> Jira Search 설정</button>'+
      '</div>'+
    '</div>';
    return;
  }
  _jaiLoadSessions();
  if(!_jaiCurId || !_jaiCurSession()){ _jaiNewSession(); }
  if(!document.getElementById('jai-chat-style')){
    var _cs=document.createElement('style'); _cs.id='jai-chat-style';
    _cs.textContent=
      '.jai-sess-item{padding:9px 12px;border-radius:8px;cursor:pointer;font-size:12.5px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:6px;}'+
      '.jai-sess-item:hover{background:var(--bg);}'+
      '.jai-sess-item.active{background:#ede9fe;color:#6d28d9;font-weight:700;}'+
      '.jai-bubble-user{display:flex;justify-content:flex-end;margin:12px 0 2px;}'+
      '.jai-user-wrap{display:flex;flex-direction:column;align-items:flex-end;max-width:78%;gap:3px;}'+
      '.jai-user-name{font-size:11px;font-weight:700;color:var(--text3);}'+
      '.jai-user-bubble{background:#7c3aed;color:#fff;border-radius:16px 16px 4px 16px;padding:9px 14px;font-size:13px;line-height:1.6;word-break:break-word;}'+
      '.jai-user-actions{display:flex;justify-content:flex-end;margin-top:1px;height:22px;}'+
      '.jai-copy-btn{opacity:0;display:inline-flex;align-items:center;justify-content:center;width:24px;height:22px;border-radius:6px;border:none;background:transparent;color:var(--text3);cursor:pointer;font-size:14px;transition:all .12s;}'+
      '.jai-bubble-user:hover .jai-copy-btn{opacity:1;}'+
      '.jai-copy-btn:hover{background:var(--bg3,#f0f2f5);color:#7c3aed;}'+
      '.jai-ai-actions{display:flex;align-items:center;gap:2px;margin-top:8px;}'+
      '.jai-act-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;width:28px;height:26px;border-radius:7px;border:none;background:transparent;color:var(--text3);cursor:pointer;font-size:15px;transition:all .12s;}'+
      '.jai-act-btn:hover{background:var(--bg3,#f0f2f5);color:var(--text);}'+
      '.jai-act-btn.on-up{color:#00a872;}.jai-act-btn.on-down{color:#e53e5a;}'+
      '.jai-act-btn::after{content:attr(data-tip);position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);background:#1f2430;color:#fff;font-size:11px;font-weight:600;padding:4px 9px;border-radius:6px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .12s;z-index:5;box-shadow:0 3px 10px rgba(0,0,0,0.25);}'+
      '.jai-act-btn::before{content:"";position:absolute;bottom:calc(100% + 1px);left:50%;transform:translateX(-50%);border:5px solid transparent;border-top-color:#1f2430;opacity:0;pointer-events:none;transition:opacity .12s;z-index:5;}'+
      '.jai-act-btn:hover::after,.jai-act-btn:hover::before{opacity:1;}'+
      '.jai-bubble-ai{display:flex;justify-content:flex-start;margin:2px 0 14px;gap:10px;}'+
      '.jai-bubble-ai .avatar{width:26px;height:26px;border-radius:50%;background:#7c3aed;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:3px;}'+
      '.jai-bubble-ai .body{flex:1;font-size:13px;line-height:1.75;color:var(--text);word-break:break-word;padding-top:2px;}';
    document.head.appendChild(_cs);
  }
  _jiraAnimInit();
  var _jaiSbW=280; try{ var _sw=parseInt(localStorage.getItem('utop_jai_sidebar_w')); if(_sw>=160&&_sw<=500) _jaiSbW=_sw; }catch(e){}
  var _isBeta=(_tid==='jira-ai-beta-body');
  var _selLb=_isBeta?_jaiSelLabel():null;
  // 공용 조각: 대화 목록(헤더+리스트) / 드래그 레일 / (아래에서 채팅 컬럼 내부)
  var _sessInner=
      '<div style="padding:12px 10px 6px;display:flex;align-items:center;gap:6px;">'+
        '<span style="font-size:12px;font-weight:800;color:var(--text2);flex:1;">대화 목록</span>'+
        '<button onclick="_jaiNewChat()" title="새 대화" style="border:none;background:none;cursor:pointer;color:#7c3aed;font-size:17px;padding:2px 3px;"><i class="ti ti-edit"></i></button>'+
        '<button onclick="_jaiNewFolder()" title="폴더 생성" style="border:none;background:none;cursor:pointer;color:var(--text3);font-size:17px;padding:2px 3px;" onmouseenter="this.style.color=\'#2d6fd4\'" onmouseleave="this.style.color=\'var(--text3)\'"><i class="ti ti-folder-plus"></i></button>'+
        '<button onclick="_jaiDeleteAll()" title="전체 삭제" style="border:none;background:none;cursor:pointer;color:var(--text3);font-size:17px;padding:2px 3px;" onmouseenter="this.style.color=\'#c0392b\'" onmouseleave="this.style.color=\'var(--text3)\'"><i class="ti ti-trash"></i></button>'+
      '</div>'+
      '<div id="jai-sess-list" style="flex:1;overflow-y:auto;padding:4px 6px;"></div>';
  var _rail='<div id="jai-sidebar-rail" onmousedown="_jaiSidebarDrag(event)" style="width:6px;flex-shrink:0;cursor:col-resize;background:transparent;transition:background .15s;z-index:1;" onmouseenter="this.style.background=\'var(--border)\'" onmouseleave="this.style.background=\'transparent\'"></div>';
  var _card='background:#fff;border:1px solid var(--border);border-radius:12px;box-shadow:0 2px 10px rgba(40,50,90,0.06);overflow:hidden;';
  if(_isBeta){
    // ── Beta: 3열 카드 (①검색 대상 ②대화 목록 ③채팅) — Device Registration Beta와 동일 문법 ──
    el.style.cssText='display:flex;height:100%;min-height:0;padding:8px;gap:8px;background:var(--bg);box-sizing:border-box;';
  } else {
    el.style.cssText='display:flex;height:100%;min-height:0;';
  }
  el.innerHTML=
    (_isBeta?(
      '<div id="jai-tree-col" onclick="_jaiFocusSet(1)" style="width:'+(function(){ var w=250; try{ var s=parseInt(localStorage.getItem('utop_jai_tree_w')); if(s>=170&&s<=500) w=s; }catch(e){} return w; })()+'px;flex-shrink:0;display:flex;flex-direction:column;'+_card+'">'+
        '<div style="padding:11px 12px 9px;border-bottom:1px solid var(--border);font-size:12.5px;font-weight:800;color:var(--text2);display:flex;align-items:center;gap:6px;flex-shrink:0;"><i class="ti ti-sitemap" style="font-size:15px;color:#7c3aed;"></i>검색 대상</div>'+
        '<div style="flex:1;overflow-y:auto;padding:8px;">'+_jaiSelectorTree()+'</div>'+
      '</div>'+
      '<div onmousedown="_jaiTreeRailDrag(event)" title="드래그로 폭 조절" style="width:6px;flex-shrink:0;cursor:col-resize;background:transparent;transition:background .15s;z-index:1;" onmouseenter="this.style.background=\'var(--border)\'" onmouseleave="this.style.background=\'transparent\'"></div>'+
      '<div id="jai-sidebar" onclick="_jaiFocusSet(2)" style="width:'+_jaiSbW+'px;flex-shrink:0;display:flex;flex-direction:column;'+_card+'">'+_sessInner+'</div>'
    ):(
      '<div id="jai-sidebar" style="width:'+_jaiSbW+'px;flex-shrink:0;border-right:1px solid var(--border);display:flex;flex-direction:column;background:var(--bg3,#f0f2f5);">'+_sessInner+'</div>'
    ))+
    _rail+
    // ── 채팅 영역 — 파일 드래그앤드롭 첨부 지원 ──
    '<div'+(_isBeta?' id="jai-chat-col" onclick="_jaiFocusSet(3)"':'')+' style="flex:1;display:flex;flex-direction:column;min-width:0;position:relative;'+(_isBeta?_card:'background:#fff;')+'" ondragover="_jaiDragOver(event)" ondragleave="_jaiDragLeave(event)" ondrop="_jaiDrop(event)">'+
      '<div id="jai-drop-overlay" style="display:none;position:absolute;inset:0;z-index:30;background:rgba(124,58,237,0.08);border:2.5px dashed '+_jaiAccent()+';border-radius:12px;margin:8px;align-items:center;justify-content:center;pointer-events:none;">'+
        '<div style="display:flex;flex-direction:column;align-items:center;gap:8px;color:'+_jaiAccent()+';font-weight:800;font-size:15px;background:rgba(255,255,255,0.92);padding:18px 30px;border-radius:12px;box-shadow:0 4px 18px rgba(0,0,0,0.08);"><i class="ti ti-file-upload" style="font-size:34px;"></i>여기에 놓아 파일 첨부</div>'+
      '</div>'+
      '<div style="padding:9px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;flex-shrink:0;background:#fff;flex-wrap:wrap;">'+
        '<i class="ti ti-message-chatbot" style="font-size:19px;color:'+_jaiAccent()+';"></i>'+
        (_isBeta
          // Beta: 현재 선택 배지 (선택은 왼쪽 트리에서)
          ?('<div style="display:inline-flex;align-items:center;margin-left:8px;">'
            +(_selLb
              ?('<span style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:800;color:'+_selLb.g.color+';background:'+_selLb.g.color+'14;border:1.5px solid '+_selLb.g.color+'66;border-radius:11px;padding:5px 12px;"><i class="ti '+_selLb.g.icon+'" style="font-size:14px;"></i>'+_bdEsc(_selLb.g.label)+' · '+_bdEsc(_selLb.o.label)+'</span>')
              :'<span style="font-size:12.5px;color:var(--text3);">왼쪽 트리에서 검색 대상을 선택하세요</span>')
            +'</div>')
          // 원본: 4개 드롭다운 칩(가로)
          :('<div style="display:inline-flex;align-items:center;margin-left:8px;">'+_jaiSelectorBar()+'</div>'))+
        '<span style="font-size:12.5px;color:var(--text3);margin-left:8px;">'+_jaiHint()+'</span>'+
      '</div>'+
      '<div id="jai-chat-body" style="flex:1;overflow-y:auto;padding:16px 20px;font-size:17px;line-height:1.85;"></div>'+
      // 입력창
      '<div style="border-top:1px solid var(--border);padding:7px 12px;background:#fff;flex-shrink:0;">'+
        '<div style="display:flex;gap:7px;align-items:flex-end;">'+
          '<input type="file" id="jai-file-input" onchange="_jaiFilePick(this)" style="display:none;">'+
          '<button onclick="_jaiFileBtn()" title="파일 첨부 (이미지: 모든 모드 · 문서: 외부 지식 툴)" style="width:42px;height:42px;border-radius:50%;border:1.5px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;font-size:18px;flex-shrink:0;display:flex;align-items:center;justify-content:center;" onmouseenter="this.style.color=\''+_jaiAccent()+'\';this.style.borderColor=\''+_jaiAccent()+'\'" onmouseleave="this.style.color=\'var(--text2)\';this.style.borderColor=\'var(--border)\'">'+
            '<i class="ti ti-paperclip"></i>'+
          '</button>'+
          '<div style="flex:1;border:1.5px solid '+_jaiAccent()+'88;border-radius:10px;overflow:hidden;background:#fff;">'+
            '<div id="jai-img-preview" style="display:none;"></div>'+
            '<textarea id="jira-ask-q" rows="1" onpaste="_jaiPaste(event)" onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();jiraAsk();}" oninput="this.style.height=\'auto\';this.style.height=Math.min(this.scrollHeight,120)+\'px\';" placeholder="'+((_jaiSel==='kb'&&((window._pageAiCfg||{}).jira_ai||{}).placeholder)?String(((window._pageAiCfg||{}).jira_ai||{}).placeholder).replace(/"/g,'&quot;'):(_jaiSel==='jira'?'Jira 이슈에 대해 질문하세요… (캡처 이미지 Ctrl+V 첨부 · Enter 전송)':'무엇이든 물어보세요… (캡처 이미지 Ctrl+V 첨부 · Enter 전송)'))+'" style="width:100%;font-size:16px;padding:8px 12px;border:none;outline:none;resize:none;line-height:1.5;background:transparent;color:var(--text);box-sizing:border-box;max-height:120px;"></textarea>'+
            (_jaiMode==='kb'?'':(
            '<div style="display:flex;align-items:center;gap:5px;padding:3px 8px 4px;border-top:1px solid #ede9fe;">'+
              '<i class="ti ti-code" style="font-size:12px;color:var(--text3);flex-shrink:0;" title="JQL 직접 입력"></i>'+
              '<input id="jira-ask-jql" placeholder="JQL 직접 입력 (선택)" style="flex:1;font-size:11px;padding:2px 4px;border:none;outline:none;background:transparent;color:var(--text2);">'+
            '</div>'))+
          '</div>'+
          '<button onclick="_jaiSendOrStop()" id="jira-ask-btn" title="Enter 전송 / 답변 중 클릭 시 중지" style="width:42px;height:42px;border-radius:50%;border:none;background:'+_jaiAccent()+';color:#fff;cursor:pointer;font-size:18px;flex-shrink:0;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px '+_jaiAccent()+'4d;">'+
            '<i class="ti ti-send"></i>'+
          '</button>'+
        '</div>'+
      '</div>'+
    '</div>';
  _jaiRenderSessionList();
  _jaiRenderChat();
  if(_isBeta) _jaiFocusUI();   // 재렌더 후 컬럼 포커스 강조 복원
}
// UTOP 스타일 확인 팝업 — Promise 기반, 기존 새 폴더 모달과 동일한 그라디언트·타이포·애니메이션.
// opts: {title, message, confirmText='삭제', cancelText='취소', tone='danger'|'primary', icon='ti-alert-triangle'}
window.utopConfirm=function(opts){
  opts=opts||{};
  return new Promise(function(resolve){
    var old=document.getElementById('utop-confirm-modal'); if(old) old.remove();
    var esc=function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;'); };
    var tone=opts.tone||'danger';
    var _grad = tone==='danger' ? 'linear-gradient(135deg,#e23d4d,#c0392b)' : 'linear-gradient(135deg,#2d6fd4,#7c3aed)';
    var _shadow = tone==='danger' ? 'rgba(226,61,77,0.35)' : 'rgba(45,111,212,0.32)';
    var _btnShadow = tone==='danger' ? 'rgba(226,61,77,0.32)' : 'rgba(45,111,212,0.32)';
    var _icon = opts.icon || (tone==='danger' ? 'ti-alert-triangle' : 'ti-info-circle');
    var _title = opts.title || '확인';
    var _msg = opts.message || '';
    var _confirmText = opts.confirmText || (tone==='danger'?'삭제':'확인');
    var _cancelText = opts.cancelText || '취소';
    var ov=document.createElement('div'); ov.id='utop-confirm-modal';
    ov.style.cssText='position:fixed;inset:0;z-index:12300;background:rgba(15,18,26,0.42);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;animation:jaiModalIn .16s ease;';
    var _close=function(v){ ov.remove(); resolve(v); };
    ov.onclick=function(e){ if(e.target===ov) _close(false); };
    document.addEventListener('keydown', function _k(e){
      if(!document.body.contains(ov)){ document.removeEventListener('keydown', _k); return; }
      if(e.key==='Escape'){ _close(false); document.removeEventListener('keydown', _k); }
      else if(e.key==='Enter'){ _close(true); document.removeEventListener('keydown', _k); }
    });
    ov.innerHTML='<div style="background:var(--bg2,#fff);border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,0.35);width:420px;max-width:92vw;overflow:hidden;">'
      +'<div style="display:flex;align-items:flex-start;gap:13px;padding:20px 22px 8px;">'
        +'<span style="width:42px;height:42px;border-radius:11px;background:'+_grad+';display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 4px 12px '+_shadow+';"><i class="ti '+_icon+'" style="font-size:22px;color:#fff;"></i></span>'
        +'<div style="flex:1;min-width:0;padding-top:2px;">'
          +'<div style="font-size:16px;font-weight:800;color:var(--text);line-height:1.35;">'+esc(_title)+'</div>'
          +(_msg?'<div style="font-size:12.5px;color:var(--text2);margin-top:5px;line-height:1.6;">'+esc(_msg).replace(/\n/g,'<br>')+'</div>':'')
        +'</div>'
      +'</div>'
      +'<div style="display:flex;justify-content:flex-end;gap:8px;padding:16px 22px 20px;">'
        +'<button id="utop-cf-cancel" style="font-size:13px;font-weight:600;padding:9px 18px;border-radius:9px;border:1px solid var(--border);background:var(--bg2,#fff);color:var(--text2);cursor:pointer;">'+esc(_cancelText)+'</button>'
        +'<button id="utop-cf-ok" style="font-size:13px;font-weight:800;padding:9px 20px;border-radius:9px;border:none;background:'+_grad+';color:#fff;cursor:pointer;box-shadow:0 3px 10px '+_btnShadow+';display:inline-flex;align-items:center;gap:5px;"><i class="ti '+(tone==='danger'?'ti-trash':'ti-check')+'" style="font-size:14px;"></i>'+esc(_confirmText)+'</button>'
      +'</div>'
      +'</div>';
    document.body.appendChild(ov);
    document.getElementById('utop-cf-cancel').onclick=function(){ _close(false); };
    document.getElementById('utop-cf-ok').onclick=function(){ _close(true); };
    // 팝업 등장 애니메이션 스타일 — 기존 jai-modal-anim 재사용(없으면 주입)
    if(!document.getElementById('jai-modal-anim')){ var st=document.createElement('style'); st.id='jai-modal-anim'; st.textContent='@keyframes jaiModalIn{from{opacity:0}to{opacity:1}}#utop-confirm-modal>div,#jai-folder-modal>div{animation:jaiCardIn .2s cubic-bezier(.2,.8,.2,1)}@keyframes jaiCardIn{from{transform:translateY(14px) scale(.97);opacity:0}to{transform:none;opacity:1}}'; document.head.appendChild(st); }
    setTimeout(function(){ var b=document.getElementById('utop-cf-ok'); if(b) b.focus(); },40);
  });
};
async function _jaiDeleteAll(){
  var ok=await utopConfirm({
    title:'대화 목록을 전체 삭제할까요?',
    message:'모든 대화와 폴더가 삭제됩니다. 이 작업은 되돌릴 수 없어요.',
    confirmText:'전체 삭제',
    tone:'danger',
    icon:'ti-trash-x'
  });
  if(!ok) return;
  _jaiSessions=[]; _jaiFolders=[]; _jaiFolderCollapsed={}; _jaiCurId=null;
  _jaiNewSession(); _jaiSaveSessions(); _jaiRenderSessionList(); _jaiRenderChat();
}
function _jaiNewChat(){
  _jaiNewSession(); _jaiRenderSessionList(); _jaiRenderChat();
}
function _jaiNewFolder(){
  var old=document.getElementById('jai-folder-modal'); if(old) old.remove();
  var esc=function(s){ return String(s==null?'':s).replace(/</g,'&lt;'); };
  var ov=document.createElement('div'); ov.id='jai-folder-modal';
  ov.style.cssText='position:fixed;inset:0;z-index:12200;background:rgba(15,18,26,0.42);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;animation:jaiModalIn .16s ease;';
  ov.onclick=function(e){ if(e.target===ov) ov.remove(); };
  ov.onkeydown=function(e){ if(e.key==='Escape') ov.remove(); };
  ov.innerHTML='<div style="background:var(--bg2,#fff);border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,0.35);width:400px;max-width:92vw;overflow:hidden;">'
    +'<div style="display:flex;align-items:center;gap:11px;padding:18px 22px 6px;">'
      +'<span style="width:40px;height:40px;border-radius:11px;background:linear-gradient(135deg,#2d6fd4,#7c3aed);display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 4px 12px rgba(45,111,212,0.35);"><i class="ti ti-folder-plus" style="font-size:21px;color:#fff;"></i></span>'
      +'<div><div style="font-size:16px;font-weight:800;color:var(--text);">새 폴더</div><div style="font-size:11.5px;color:var(--text3);margin-top:1px;">대화를 정리할 폴더 이름을 입력하세요</div></div>'
    +'</div>'
    +'<div style="padding:8px 22px 4px;">'
      +'<input id="jai-folder-name" type="text" placeholder="예: 제품 스펙 문의" maxlength="40" style="width:100%;box-sizing:border-box;font-size:14px;padding:11px 13px;border:1.5px solid var(--border);border-radius:10px;outline:none;background:var(--bg2,#fff);color:var(--text);" onkeydown="if(event.key===\'Enter\')_jaiCreateFolder()">'
    +'</div>'
    +'<div style="display:flex;justify-content:flex-end;gap:8px;padding:14px 22px 18px;">'
      +'<button onclick="document.getElementById(\'jai-folder-modal\').remove()" style="font-size:13px;font-weight:600;padding:9px 18px;border-radius:9px;border:1px solid var(--border);background:var(--bg2,#fff);color:var(--text2);cursor:pointer;">취소</button>'
      +'<button onclick="_jaiCreateFolder()" style="font-size:13px;font-weight:800;padding:9px 20px;border-radius:9px;border:none;background:linear-gradient(135deg,#2d6fd4,#7c3aed);color:#fff;cursor:pointer;box-shadow:0 3px 10px rgba(45,111,212,0.32);"><i class="ti ti-check" style="font-size:14px;"></i> 만들기</button>'
    +'</div>'
    +'</div>';
  document.body.appendChild(ov);
  // 모달 등장 애니메이션 1회 주입
  if(!document.getElementById('jai-modal-anim')){ var st=document.createElement('style'); st.id='jai-modal-anim'; st.textContent='@keyframes jaiModalIn{from{opacity:0}to{opacity:1}}#jai-folder-modal>div{animation:jaiCardIn .2s cubic-bezier(.2,.8,.2,1)}@keyframes jaiCardIn{from{transform:translateY(14px) scale(.97);opacity:0}to{transform:none;opacity:1}}'; document.head.appendChild(st); }
  setTimeout(function(){ var i=document.getElementById('jai-folder-name'); if(i)i.focus(); },40);
}
function _jaiCreateFolder(){
  var i=document.getElementById('jai-folder-name'); var name=i?(i.value||'').trim():'';
  if(!name){ if(i){ i.style.borderColor='#e53e5a'; i.focus(); } return; }
  _jaiFolders=_jaiFolders||[];
  var fid='jf-'+Date.now();
  _jaiFolders.push({id:fid,name:name});
  _jaiFolderCollapsed[fid]=false;
  _jaiSaveSessions(); _jaiRenderSessionList();
  var m=document.getElementById('jai-folder-modal'); if(m)m.remove();
  if(typeof showToast==='function') showToast('폴더 "'+name+'" 생성됨');
}
function _jaiSelectSession(id){
  _jaiCurId=id; _jaiSaveSessions(); _jaiRenderSessionList(); _jaiRenderChat();
}
function _jaiDeleteSession(id,e){
  e.stopPropagation();
  _jaiSessions=(_jaiSessions||[]).filter(function(s){return s.id!==id;});
  // 삭제 후 다음 활성 세션은 반드시 "현재 검색 대상(_jaiSel)"과 같은 sel — 다른 대상 세션으로 자동 점프하면 헤더/입력창이 어긋남
  if(_jaiCurId===id){
    var _same=(_jaiSessions||[]).filter(function(s){return s.sel===_jaiSel;});
    _jaiCurId=_same.length?_same[0].id:null;
    if(!_jaiCurId) _jaiNewSession();   // 같은 sel 세션이 없으면 현재 sel로 새 세션 생성
  }
  _jaiSaveSessions(); _jaiRenderSessionList(); _jaiRenderChat();
}
async function _jaiDeleteFolder(fid,e){
  e.stopPropagation();
  // 폴더 이름과 안에 든 대화 수를 함께 안내 — 실수로 파괴적인 클릭을 하지 않도록
  var _f=(_jaiFolders||[]).find(function(x){return x.id===fid;});
  var _cnt=((_jaiSessions||[]).filter(function(s){return s.folderId===fid;})||[]).length;
  var ok=await utopConfirm({
    title:'폴더 "'+((_f&&_f.name)||'폴더')+'"를 삭제할까요?',
    message:'폴더 안 대화 '+_cnt+'개도 함께 삭제됩니다. 이 작업은 되돌릴 수 없어요.',
    confirmText:'폴더 삭제',
    tone:'danger',
    icon:'ti-folder-x'
  });
  if(!ok) return;
  _jaiSessions=(_jaiSessions||[]).filter(function(s){return s.folderId!==fid;});
  _jaiFolders=(_jaiFolders||[]).filter(function(f){return f.id!==fid;});
  delete _jaiFolderCollapsed[fid];
  // 현재 세션이 삭제됐으면 같은 sel 세션 우선, 없으면 현재 sel 유지한 채 새 세션
  if(!_jaiCurSession()){
    var _same=(_jaiSessions||[]).filter(function(s){return s.sel===_jaiSel;});
    _jaiCurId=_same.length?_same[0].id:null;
    if(!_jaiCurId) _jaiNewSession();
  }
  _jaiSaveSessions(); _jaiRenderSessionList(); _jaiRenderChat();
}
function _jaiFolderToggle(fid,e){
  e.stopPropagation();
  _jaiFolderCollapsed[fid]=!_jaiFolderCollapsed[fid];
  _jaiSaveSessions(); _jaiRenderSessionList();
}
function _jaiMoveToFolder(sid,fid){
  var s=(_jaiSessions||[]).find(function(x){return x.id===sid;}); if(!s) return;
  s.folderId=(fid||null);
  _jaiSaveSessions(); _jaiRenderSessionList();
}
// 드래그 이동 상태
var _jaiDragId=null;
function _jaiDragStart(sid,e){ e.dataTransfer.effectAllowed='move'; _jaiDragId=sid; e.currentTarget.style.opacity='0.5'; }
function _jaiDragEnd(e){ e.currentTarget.style.opacity='1'; _jaiDragId=null; }
function _jaiDragOver(e){ e.preventDefault(); e.dataTransfer.dropEffect='move'; }
function _jaiDropOnFolder(fid,e){
  e.preventDefault(); e.stopPropagation();
  if(_jaiDragId) _jaiMoveToFolder(_jaiDragId,fid);
  e.currentTarget.style.background='';
}
function _jaiDropOnRoot(e){
  e.preventDefault();
  if(_jaiDragId) _jaiMoveToFolder(_jaiDragId,null);
}
function _jaiRenderSessionList(){
  var el=document.getElementById('jai-sess-list'); if(!el) return;
  var folders=_jaiFolders||[];
  // 현재 검색 대상(_jaiSel) 기준으로 세션 필터 — 대상별 대화 목록 완전 분리
  var _curSel=(typeof _jaiSel!=='undefined'?_jaiSel:'');
  // 옛 세션(sel 없음)은 첫 메시지의 sel 값에서 회수 → 없으면 kb 로 기본 배정 후 저장
  var _needSave=false;
  (_jaiSessions||[]).forEach(function(s){
    if(!s.sel){
      var _fromMsg=(s.msgs||[]).find(function(m){return m&&m.sel;});
      s.sel=_fromMsg?_fromMsg.sel:'kb';
      _needSave=true;
    }
  });
  if(_needSave) _jaiSaveSessions();
  var sessions=(_jaiSessions||[]).filter(function(s){ return s.sel===_curSel; });
  // 현재 검색 대상 세션이 하나도 없으면 자동으로 "새 대화" 하나 생성 → 목록 비는 상황을 없앰
  if(!sessions.length){
    var _ns=_jaiNewSession();
    _jaiSaveSessions();
    sessions=[_ns];
  }
  var btn='font-size:12px;border:none;background:none;cursor:pointer;padding:1px 3px;border-radius:3px;color:var(--text3);opacity:0;';
  var html='';
  // ── 폴더들 ──
  folders.forEach(function(f){
    var collapsed=!!_jaiFolderCollapsed[f.id];
    var children=sessions.filter(function(s){return s.folderId===f.id;});
    html+=
      '<div ondragover="_jaiDragOver(event)" ondrop="_jaiDropOnFolder(\''+f.id+'\',event)" onmouseenter="this.querySelector(\'.jai-fd\').style.opacity=1;" onmouseleave="this.querySelector(\'.jai-fd\').style.opacity=0;">'+
        '<div onclick="_jaiFolderToggle(\''+f.id+'\',event)" style="display:flex;align-items:center;gap:5px;padding:7px 8px;border-radius:7px;cursor:pointer;font-size:12.5px;font-weight:700;color:var(--text2);" onmouseenter="this.style.background=\'var(--bg)\'" onmouseleave="this.style.background=\'\'">'+
          '<i class="ti '+(collapsed?'ti-folder':'ti-folder-open')+'" style="font-size:14px;color:#2d6fd4;flex-shrink:0;"></i>'+
          '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;">'+_jaiEsc(f.name)+'</span>'+
          '<span style="font-size:11px;color:var(--text3);font-weight:400;">'+children.length+'</span>'+
          '<button class="jai-fd" onclick="_jaiDeleteFolder(\''+f.id+'\',event)" style="'+btn+'" onmouseenter="this.style.color=\'#c0392b\';this.style.opacity=1;" onmouseleave="this.style.color=\'var(--text3)\';this.style.opacity=0;" title="폴더 삭제"><i class="ti ti-trash" style="font-size:12px;"></i></button>'+
        '</div>';
    if(!collapsed){
      children.forEach(function(s){
        var active=s.id===_jaiCurId;
        var _actStyle=active?(';background:'+_jaiSelBg(_curSel)+';color:'+_jaiSelColor(_curSel)+';font-weight:700;'):'';
        html+=
          '<div class="jai-sess-item'+(active?' active':'')+'" draggable="true" ondragstart="_jaiDragStart(\''+s.id+'\',event)" ondragend="_jaiDragEnd(event)" onclick="_jaiSelectSession(\''+s.id+'\')" style="padding-left:24px'+_actStyle+'" onmouseenter="this.querySelector(\'.jai-sd\').style.opacity=1;" onmouseleave="this.querySelector(\'.jai-sd\').style.opacity=0;">'+
            '<i class="ti ti-message" style="font-size:12px;flex-shrink:0;opacity:0.5;"></i>'+
            '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;font-size:12.5px;">'+_jaiEsc(s.title)+'</span>'+
            '<button class="jai-sd" onclick="_jaiDeleteSession(\''+s.id+'\',event)" style="'+btn+'" onmouseenter="this.style.color=\'#c0392b\';this.style.opacity=1;" onmouseleave="this.style.color=\'var(--text3)\';this.style.opacity=0;" title="삭제"><i class="ti ti-x" style="font-size:11px;"></i></button>'+
          '</div>';
      });
    }
    html+='</div>';
  });
  // ── 폴더 없는 세션들 ──
  var rootSessions=sessions.filter(function(s){return !s.folderId;});
  if(folders.length&&rootSessions.length){
    html+='<div style="font-size:10.5px;font-weight:700;color:var(--text3);padding:8px 8px 3px;letter-spacing:.04em;">기타</div>';
  }
  rootSessions.forEach(function(s){
    var active=s.id===_jaiCurId;
    var _actStyle=active?('background:'+_jaiSelBg(_curSel)+';color:'+_jaiSelColor(_curSel)+';font-weight:700;'):'';
    html+=
      '<div class="jai-sess-item'+(active?' active':'')+'" draggable="true" ondragstart="_jaiDragStart(\''+s.id+'\',event)" ondragend="_jaiDragEnd(event)" onclick="_jaiSelectSession(\''+s.id+'\')" style="'+_actStyle+'" onmouseenter="this.querySelector(\'.jai-sd\').style.opacity=1;" onmouseleave="this.querySelector(\'.jai-sd\').style.opacity=0;">'+
        '<i class="ti ti-message" style="font-size:12px;flex-shrink:0;opacity:0.5;"></i>'+
        '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;font-size:12.5px;">'+_jaiEsc(s.title)+'</span>'+
        '<button class="jai-sd" onclick="_jaiDeleteSession(\''+s.id+'\',event)" style="'+btn+'" onmouseenter="this.style.color=\'#c0392b\';this.style.opacity=1;" onmouseleave="this.style.color=\'var(--text3)\';this.style.opacity=0;" title="삭제"><i class="ti ti-x" style="font-size:11px;"></i></button>'+
      '</div>';
  });
  el.innerHTML=html||'<div style="font-size:12px;color:var(--text3);padding:12px 8px;">대화 없음</div>';
}
// 질문(메시지) 복사 — 현재 세션의 idx번째 메시지 내용을 클립보드로
function _jaiCopyMsg(idx){
  try{
    var s=_jaiCurSession(); var m=s&&s.msgs&&s.msgs[idx]; if(!m) return;
    var txt=String(m.content||'');
    var done=function(){ if(typeof showToast==='function') showToast('질문을 복사했어요'); };
    if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(txt).then(done).catch(function(){ _jaiCopyFallback(txt); done(); }); }
    else { _jaiCopyFallback(txt); done(); }
  }catch(e){}
}
function _jaiCopyFallback(txt){ try{ var ta=document.createElement('textarea'); ta.value=txt; ta.style.position='fixed'; ta.style.left='-9999px'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }catch(e){} }
// ── 이미지 붙여넣기(캡처) → 비전 LLM 전달 ──
var _jaiImg=null;   // {dataUrl}
function _jaiPaste(e){
  try{
    var items=(e.clipboardData&&e.clipboardData.items)||[];
    for(var i=0;i<items.length;i++){
      var it=items[i];
      if(it.kind==='file' && (it.type||'').indexOf('image/')===0){
        var f=it.getAsFile(); if(!f) continue; e.preventDefault();
        var rd=new FileReader();
        rd.onload=function(ev){
          var url=ev.target.result;
          // 너무 큰 이미지는 축소(비전 토큰·크기 절감) — 최대 폭 1280
          _jaiResizeImg(url, 1280, function(small){ _jaiImg={dataUrl:small||url}; _jaiRenderImgPreview(); });
        };
        rd.readAsDataURL(f);
        return;
      }
    }
  }catch(_e){}
}
function _jaiResizeImg(dataUrl, maxW, cb){
  try{
    var img=new Image();
    img.onload=function(){
      if(img.width<=maxW){ cb(dataUrl); return; }
      var sc=maxW/img.width; var cv=document.createElement('canvas'); cv.width=maxW; cv.height=Math.round(img.height*sc);
      var cx=cv.getContext('2d'); cx.drawImage(img,0,0,cv.width,cv.height);
      try{ cb(cv.toDataURL('image/jpeg',0.85)); }catch(_e){ cb(dataUrl); }
    };
    img.onerror=function(){ cb(dataUrl); };
    img.src=dataUrl;
  }catch(_e){ cb(dataUrl); }
}
function _jaiRenderImgPreview(){
  var box=document.getElementById('jai-img-preview'); if(!box) return;
  if(!_jaiImg && !_jaiFile){ box.style.display='none'; box.innerHTML=''; return; }
  box.style.display='block';
  var h='';
  if(_jaiImg){
    h+='<div style="display:inline-flex;align-items:center;gap:8px;margin:7px 8px 0;padding:5px 6px 5px 5px;background:var(--bg3,#f0f2f5);border:1px solid var(--border);border-radius:9px;position:relative;">'
      +'<img src="'+_jaiImg.dataUrl+'" style="width:44px;height:44px;object-fit:cover;border-radius:6px;display:block;">'
      +'<span style="font-size:11.5px;color:var(--text2);font-weight:600;">캡처 이미지 첨부됨</span>'
      +'<button onclick="_jaiClearImg()" title="첨부 제거" style="width:22px;height:22px;border:none;border-radius:6px;background:transparent;color:var(--text3);cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;"><i class="ti ti-x"></i></button>'
    +'</div>';
  }
  if(_jaiFile){
    h+='<div style="display:inline-flex;align-items:center;gap:7px;margin:7px 8px 0;padding:7px 8px 7px 10px;background:var(--bg3,#f0f2f5);border:1px solid var(--border);border-radius:9px;">'
      +'<i class="ti ti-paperclip" style="font-size:14px;color:var(--text2);"></i>'
      +'<span style="font-size:11.5px;color:var(--text2);font-weight:600;max-width:260px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+_jaiEsc(_jaiFile.name)+'</span>'
      +'<button onclick="_jaiClearFile()" title="첨부 제거" style="width:22px;height:22px;border:none;border-radius:6px;background:transparent;color:var(--text3);cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;"><i class="ti ti-x"></i></button>'
    +'</div>';
  }
  box.innerHTML=h;
}
function _jaiClearImg(){ _jaiImg=null; _jaiRenderImgPreview(); }
// ── 파일 첨부(클립 버튼) — 이미지는 붙여넣기와 동일 처리, 문서는 외부 지식 툴(Dify)로 업로드 ──
var _jaiFile=null;   // {file,name}
function _jaiFileBtn(){ var i=document.getElementById('jai-file-input'); if(i) i.click(); }
// 문서 파일 텍스트 추출 — txt류(직접) / pdf(pdfjs) / docx(mammoth). cb(text|''|null) — null=미지원 형식
function _jaiExtractFile(f, cb){
  var name=String(f.name||'').toLowerCase();
  if(/\.(txt|log|cfg|conf|config|md|csv|json|xml|yaml|yml|ini|py|sh|tcl|bat)$/.test(name) || (f.type||'').indexOf('text/')===0){
    var rd=new FileReader(); rd.onload=function(ev){ cb(String(ev.target.result||'')); }; rd.onerror=function(){ cb(''); }; rd.readAsText(f); return;
  }
  if(/\.pdf$/.test(name)){
    var rd2=new FileReader();
    rd2.onload=function(ev){
      try{
        if(!window.pdfjsLib){ cb(''); return; }
        try{ pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'; }catch(e){}
        pdfjsLib.getDocument({data:new Uint8Array(ev.target.result)}).promise.then(function(pdf){
          var n=Math.min(pdf.numPages,60); var out=[];
          var next=function(i){
            if(i>n){ cb(out.join('\n')); return; }
            pdf.getPage(i).then(function(pg){ return pg.getTextContent(); }).then(function(tc){ out.push(tc.items.map(function(it){return it.str;}).join(' ')); next(i+1); }).catch(function(){ next(i+1); });
          }; next(1);
        }).catch(function(){ cb(''); });
      }catch(e){ cb(''); }
    };
    rd2.readAsArrayBuffer(f); return;
  }
  if(/\.docx$/.test(name)){
    var rd3=new FileReader();
    rd3.onload=function(ev){ try{ mammoth.extractRawText({arrayBuffer:ev.target.result}).then(function(r){ cb(String((r&&r.value)||'')); }).catch(function(){ cb(''); }); }catch(e){ cb(''); } };
    rd3.readAsArrayBuffer(f); return;
  }
  cb(null);
}
function _jaiAddFile(f){
  if(!f) return;
  if((f.type||'').indexOf('image/')===0){
    var rd=new FileReader();
    rd.onload=function(ev){ _jaiResizeImg(ev.target.result,1280,function(small){ _jaiImg={dataUrl:small||ev.target.result}; _jaiRenderImgPreview(); }); };
    rd.readAsDataURL(f); return;
  }
  // 문서 파일 — Dify형 어시스턴트는 파일 자체 업로드, 그 외 모드는 텍스트 추출해 LLM 컨텍스트로 전달
  var _asst=(String(_jaiSel).indexOf('dify:')===0 && typeof _jaiCurAsst==='function')?_jaiCurAsst():null;
  if(_asst && _asst.type!=='llm'){ _jaiFile={file:f,name:f.name||'file'}; _jaiRenderImgPreview(); return; }
  if(_jaiSel==='jira'){ if(typeof showToast==='function') showToast('Jira 이슈 검색은 이미지 첨부만 지원합니다'); return; }
  if(typeof showToast==='function') showToast('파일 내용 읽는 중…');
  _jaiExtractFile(f, function(txt){
    if(txt===null){ if(typeof showToast==='function') showToast('지원하지 않는 형식입니다 (txt·log·cfg·pdf·docx 등)'); return; }
    if(!String(txt).trim()){ if(typeof showToast==='function') showToast('파일에서 텍스트를 추출하지 못했습니다'); return; }
    _jaiFile={name:f.name||'file', text:String(txt).slice(0,60000)};
    _jaiRenderImgPreview();
    if(typeof showToast==='function') showToast('"'+(f.name||'파일')+'" 첨부됨 ('+Math.min(String(txt).length,60000).toLocaleString()+'자)');
  });
}
function _jaiFilePick(inp){ var f=inp&&inp.files&&inp.files[0]; if(inp) inp.value=''; _jaiAddFile(f); }
// ── 드래그앤드롭 첨부 — 채팅 영역에 파일을 끌어다 놓으면 첨부 ──
function _jaiDragOver(e){
  var ts=(e.dataTransfer&&e.dataTransfer.types)||[];
  var hasFile=false; for(var i=0;i<ts.length;i++){ if(ts[i]==='Files'){ hasFile=true; break; } }
  if(!hasFile) return;
  e.preventDefault(); if(e.dataTransfer) e.dataTransfer.dropEffect='copy';
  var ov=document.getElementById('jai-drop-overlay'); if(ov) ov.style.display='flex';
}
function _jaiDragLeave(e){
  if(e.relatedTarget && e.currentTarget && e.currentTarget.contains(e.relatedTarget)) return;   // 내부 이동은 무시
  var ov=document.getElementById('jai-drop-overlay'); if(ov) ov.style.display='none';
}
function _jaiDrop(e){
  e.preventDefault();
  var ov=document.getElementById('jai-drop-overlay'); if(ov) ov.style.display='none';
  var f=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0];
  if(f) _jaiAddFile(f);
}
function _jaiClearFile(){ _jaiFile=null; _jaiRenderImgPreview(); }
function _jaiDataUrlBlob(du){ try{ var a=String(du).split(','); var mt=((a[0]||'').match(/data:([^;]+)/)||[])[1]||'image/jpeg'; var bin=atob(a[1]||''); var u8=new Uint8Array(bin.length); for(var i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i); return new Blob([u8],{type:mt}); }catch(e){ return null; } }
// user 메시지 content — 첨부 이미지 있으면 멀티모달 배열(OpenAI vision 형식)
function _jaiUserContent(q, imgUrl){
  if(imgUrl) return [{type:'text',text:String(q||'')},{type:'image_url',image_url:{url:imgUrl}}];
  return String(q||'');
}
// 답변 평가(좋아요/싫어요) — 토글 저장
function _jaiFeedback(idx,v){
  try{
    var s=_jaiCurSession(); var m=s&&s.msgs&&s.msgs[idx]; if(!m) return;
    m.feedback=(m.feedback===v)?'':v;   // 같은 버튼 다시 누르면 해제
    _jaiSaveSessions(); _jaiRenderChat();
  }catch(e){}
}
// 답변 재실행 — 마지막 질문을 현재 선택기로 다시 전송
function _jaiRegenerate(){
  try{
    var s=_jaiCurSession(); if(!s||!s.msgs||!s.msgs.length) return;
    // 마지막 user 질문 찾기
    var lastQ=''; for(var i=s.msgs.length-1;i>=0;i--){ if(s.msgs[i].role==='user'){ lastQ=s.msgs[i].content||''; break; } }
    if(!lastQ) return;
    // 마지막 AI 답변 제거(재생성)
    if(s.msgs[s.msgs.length-1].role==='ai') s.msgs.pop();
    // 마지막 user 메시지도 제거 → 입력창에 넣고 재전송(같은 질문 중복 방지)
    if(s.msgs.length&&s.msgs[s.msgs.length-1].role==='user') s.msgs.pop();
    _jaiSaveSessions(); _jaiRenderChat();
    var inp=document.getElementById('jira-ask-q'); if(inp){ inp.value=lastQ; }
    if(typeof jiraAsk==='function') jiraAsk();
  }catch(e){}
}
function _jaiRenderChat(){
  var el=document.getElementById('jai-chat-body'); if(!el) return;
  var s=_jaiCurSession();
  var msgs=(s&&s.msgs)||[];
  if(!msgs.length){
    // UTOP 지식 검색 모드: LLM 설정 › 지식 검색 AI의 오프닝 멘트(jira_ai.greeting) 우선
    var _kbGreet=(_jaiSel==='kb')?(((window._pageAiCfg||{}).jira_ai||{}).greeting||''):'';
    if(_kbGreet){
      el.innerHTML='<div style="max-width:680px;margin:40px auto 0;color:var(--text2);font-size:13px;line-height:1.75;">'+_jiraRenderMd(_kbGreet)+'</div>';
      return;
    }
    el.innerHTML=
      '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--text3);gap:10px;">'+
        '<i class="ti ti-message-chatbot" style="font-size:48px;color:#c4b5fd;"></i>'+
        '<div style="font-size:14px;font-weight:600;">'+(_jaiSel==='kb'?'제품 스펙·디버깅 등 사내 지식에 대해 무엇이든 물어보세요':'Jira 이슈에 대해 무엇이든 물어보세요')+'</div>'+
        '<div style="font-size:12px;">'+(_jaiSel==='kb'?'예: E7500 OLT 포트 상태 확인 CLI는?':'예: P68 프로젝트 미처리 Defect 현황은?')+'</div>'+
      '</div>';
    return;
  }
  var base=(_isyncCfg&&_isyncCfg.url)?String(_isyncCfg.url).replace(/\/+$/,''):'';
  el.innerHTML=msgs.map(function(m,_mi){
    if(m.role==='user'){
      var _nm=m.by||((typeof currentUser!=='undefined'&&currentUser&&(currentUser.name||currentUser.username))||'나');
      var _imgHtml=m.img?('<img src="'+m.img+'" onclick="window.open(this.src)" style="max-width:220px;max-height:180px;border-radius:10px;border:1px solid var(--border);margin-bottom:5px;display:block;cursor:zoom-in;">'):'';
      var _fileHtml=m.file?('<div style="display:inline-flex;align-items:center;gap:6px;padding:6px 11px;background:var(--bg3,#f0f2f5);border:1px solid var(--border);border-radius:9px;margin-bottom:5px;font-size:12px;color:var(--text2);font-weight:600;"><i class="ti ti-paperclip" style="font-size:13px;"></i>'+_jaiEsc(m.file)+'</div>'):'';
      var _bub=(String(m.content||'').trim())?('<div class="jai-user-bubble">'+_jaiEsc(m.content)+'</div>'):'';
      return '<div class="jai-bubble-user">'
        +'<div class="jai-user-wrap">'
          +'<div class="jai-user-name">'+_jaiEsc(_nm)+'</div>'
          +_imgHtml+_fileHtml+_bub
          +'<div class="jai-user-actions"><button class="jai-copy-btn" onclick="_jaiCopyMsg('+_mi+')" title="질문 복사"><i class="ti ti-copy"></i></button></div>'
        +'</div></div>';
    }
    if(m.clarify){
      // 예전 버전의 되묻기 카드(질문마다 {tool/model} 구분이 없던 구조)가 세션에 남아있으면
      // 새 3단계 렌더러와 안 맞아 깨지므로, 유효하지 않으면 렌더링하지 않고 취소 취급
      var _validClr=Array.isArray(m.clarify.qs)&&m.clarify.qs.length&&m.clarify.qs.every(function(q){return q&&typeof q==='object'&&(q.tool||q.model||q.opts);});
      if(!_validClr){ m.content='✕ 확인을 취소했어요. 다시 질문해 주세요.'; delete m.clarify; }
      else return '<div class="jai-bubble-ai">'+
        '<div class="avatar"><i class="ti ti-sparkles" style="color:#fff;font-size:13px;"></i></div>'+
        '<div class="body">'+_jaiClarifyHtml(_mi,m.clarify)+'</div>'+
      '</div>';
    }
    var body=_jiraRenderMd(m.content||'');
    // 근거 문서(cited) 칩 표시 제거 — 답변 본문에 이미 출처가 링크로 포함되므로 별도 chips 렌더 안 함
    var chips='';
    // JQL 표시 박스 — 답변 본문 상단에 크게 배치 (사용된 검색식을 잘 보이도록)
    // 모드 라벨은 '+모델제목' 등 부가 표기 제거하고 앞부분(AI생성/JQL 등)만 노출
    var _jqlLbl=String(m.jqlMode||'JQL').replace(/[\s·+\-].*$/,'').trim()||'JQL';
    var jqlBox=m.jql?('<div style="margin:0 0 12px;padding:10px 14px;background:linear-gradient(135deg,#f3eefe,#eef4ff);border:1px solid #d9c9f7;border-radius:9px;font-family:ui-monospace,Consolas,monospace;word-break:break-all;line-height:1.55;"><span style="display:inline-block;font-size:11px;font-weight:800;color:#7c3aed;margin-right:8px;letter-spacing:0.3px;">🔍 '+_jaiEsc(_jqlLbl)+'</span><span style="font-size:13.5px;color:#1a2236;font-weight:600;">'+_jaiEsc(m.jql)+'</span></div>'):'';
    // 답변 액션 바: 복사 / 좋아요 / 싫어요 / 재실행 (완성된 답변에만)
    var _fb=m.feedback||''; var _isLast=(_mi===msgs.length-1);
    var actions=(String(m.content||'').trim())?('<div class="jai-ai-actions">'
      +'<button class="jai-act-btn" data-tip="복사" onclick="_jaiCopyMsg('+_mi+')"><i class="ti ti-copy"></i></button>'
      +'<button class="jai-act-btn'+(_fb==='up'?' on-up':'')+'" data-tip="좋아요" onclick="_jaiFeedback('+_mi+',\'up\')"><i class="ti ti-thumb-up'+(_fb==='up'?'-filled':'')+'"></i></button>'
      +'<button class="jai-act-btn'+(_fb==='down'?' on-down':'')+'" data-tip="싫어요" onclick="_jaiFeedback('+_mi+',\'down\')"><i class="ti ti-thumb-down'+(_fb==='down'?'-filled':'')+'"></i></button>'
      +(_isLast?'<button class="jai-act-btn" data-tip="재실행" onclick="_jaiRegenerate()"><i class="ti ti-refresh"></i></button>':'')
      +'</div>'):'';
    return '<div class="jai-bubble-ai">'+
      '<div class="avatar"><i class="ti ti-sparkles" style="color:#fff;font-size:13px;"></i></div>'+
      '<div class="body">'+jqlBox+body+chips+actions+'</div>'+
    '</div>';
  }).join('');
  el.scrollTop=el.scrollHeight;
  var _lastClr=msgs.length&&msgs[msgs.length-1].clarify;
  if(_lastClr){ setTimeout(function(){ var f=document.getElementById('jai-clr-'+(msgs.length-1)+'-0'); if(f){ try{ f.focus({preventScroll:true}); }catch(_){ f.focus(); } } el.scrollTop=el.scrollHeight; },40); }
}
function _jaiSidebarDrag(e){
  e.preventDefault();
  var sb=document.getElementById('jai-sidebar'); if(!sb) return;
  var startX=e.clientX; var startW=sb.offsetWidth;
  function onMove(ev){
    var w=Math.max(160,Math.min(500,startW+(ev.clientX-startX)));
    sb.style.width=w+'px';
    try{ localStorage.setItem('utop_jai_sidebar_w',w); }catch(ex){}
  }
  function onUp(){ document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp); }
  document.addEventListener('mousemove',onMove);
  document.addEventListener('mouseup',onUp);
}
// ══════════════ Jira Search 설정 — 별도 페이지 (Jira Integration > 설정) ══════════════
async function renderJiraSearchCfg(){
  const el=document.getElementById('jira-search-cfg-body'); if(!el) return;
  el.innerHTML='<div style="color:var(--text3);padding:26px;">불러오는 중…</div>';
  try{ _isyncCfg=await (await fetch('/api/jira/config')).json(); }catch(e){ _isyncCfg={}; }
  _isyncCfg=_isyncCfg||{};
  if(!document.getElementById('jai-search-style')){
    var _st=document.createElement('style'); _st.id='jai-search-style';
    _st.textContent='#jira-search-cfg-body input:invalid,#jira-search-cfg-body select:invalid{box-shadow:none;outline:none;}';
    document.head.appendChild(_st);
  }
  var c=_isyncCfg; var ai=(c.ai)||{};
  var esc=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');};
  var inSt='width:100%;font-size:13px;padding:9px 11px;border:1px solid var(--border);border-radius:8px;outline:none;box-sizing:border-box;background:var(--bg2,#fff);color:var(--text);';
  var lab=function(t,sub){
    return '<div style="font-size:11.5px;font-weight:700;color:var(--text2);margin-bottom:5px;">'+t+
      (sub?'<span style="font-weight:400;color:var(--text3);margin-left:5px;">'+sub+'</span>':'')+'</div>';
  };
  var sec=function(t){
    return '<div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--text3);padding:10px 0 7px;border-bottom:1px solid var(--border);margin-bottom:13px;">'+t+'</div>';
  };
  var row=function(body){ return '<div style="margin-bottom:12px;">'+body+'</div>'; };

  // ── 1열: Jira 연결 ──
  var col1=
    sec('Jira 연결')+
    row(lab('서버 URL')+'<input id="jai-url" value="'+esc(c.url||'')+'" placeholder="https://ums.ubiquoss.com" style="'+inSt+'">')+
    row(lab('인증 방식')+'<select id="jai-auth" style="'+inSt+'cursor:pointer;">'+
      '<option value="bearer"'+((c.auth==='bearer')?' selected':'')+'>PAT 토큰 (권장)</option>'+
      '<option value="basic"'+(((c.auth||'basic')==='basic')?' selected':'')+'>ID / 비밀번호</option>'+
    '</select>')+
    row(lab('사용자 ID')+'<input id="jai-user" autocomplete="off" value="'+esc(c.user||'')+'" placeholder="itest" style="'+inSt+'">')+
    row(lab('비밀번호 / PAT')+'<input id="jai-token" type="password" autocomplete="new-password" value="'+esc(c.token||'')+'" placeholder="PAT 또는 비밀번호" style="'+inSt+'">'
      +'<div style="font-size:11px;color:var(--text3);margin-top:4px;line-height:1.5;"><i class="ti ti-info-circle"></i> 댓글·이슈는 <b>이 인증 계정</b>으로 등록됩니다. PAT 방식이면 사용자 ID와 무관하게 <b>PAT 소유 계정</b>이 사용됩니다.</div>')+
    '<label style="display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--text2);cursor:pointer;margin-bottom:14px;">'+
      '<input type="checkbox" id="jai-verify" '+((c.verify!==false)?'checked':'')+' style="accent-color:#2684ff;">'+
      'TLS 인증서 검증 <span style="font-size:11px;color:var(--text3);">(자체서명이면 해제)</span>'+
    '</label>'+
    '<button onclick="jiraAiCfgTest()" style="width:100%;font-size:13px;font-weight:700;padding:9px;border-radius:8px;border:1.5px solid #2684ff;background:#fff;color:#2684ff;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:8px;">'+
      '<i class="ti ti-plug-connected"></i> 연결 테스트'+
    '</button>'+
    '<div id="jai-test-msg" style="font-size:12px;min-height:18px;text-align:center;"></div>';

  // ── 2열: LLM · 검색 파라미터 ──
  var col2=
    sec('검색 설정')+
    row(lab('검색 프로젝트','(비우면 전체)')+'<input id="jai-proj" value="'+esc(ai.project||'')+'" placeholder="예: P106" style="'+inSt+'">')+
    row(lab('검색 이슈 수','(비우면 전체)')+'<input id="jai-max" type="number" min="1" placeholder="전체" value="'+esc((ai.max_issues&&ai.max_issues>0)?ai.max_issues:'')+'" style="'+inSt+'">')+
    row(lab('이슈 설명 길이','(비우면 전체)')+'<input id="jai-desc" type="number" min="1" placeholder="전체" value="'+esc((ai.desc_len&&ai.desc_len>0)?ai.desc_len:'')+'" style="'+inSt+'">')+
    row(lab('댓글 포함 수','(비우면 전체 · 0=제외)')+'<input id="jai-cmt" type="number" min="0" placeholder="전체" value="'+esc((ai.comment_n!=null&&ai.comment_n!=='')?ai.comment_n:'')+'" style="'+inSt+'">')+
    '<label style="display:flex;align-items:flex-start;gap:8px;font-size:12.5px;color:var(--text2);cursor:pointer;padding:10px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;margin-bottom:16px;">'+
      '<input type="checkbox" id="jai-autojql" '+((ai.auto_jql===false)?'':'checked')+' style="width:15px;height:15px;accent-color:#7c3aed;flex-shrink:0;margin-top:2px;">'+
      '<div><b style="color:var(--text);">JQL 자동 변환</b><br><span style="font-size:11.5px;color:var(--text3);">질문을 LLM이 JQL로 변환 (끄면 키워드 OR 검색)</span></div>'+
    '</label>'+
    sec('LLM 설정')+
    row(lab('사용할 LLM')+'<select id="jai-llm" style="'+inSt+'cursor:pointer;"><option value="">자동 (로컬 LLM 우선)</option></select>')+
    row(lab('temperature','(창의성 0.0~2.0)')+'<input id="jai-temp" type="number" step="0.05" min="0" max="2" value="'+esc(ai.temperature!=null?ai.temperature:0.35)+'" style="'+inSt+'">')+
    row(lab('max_tokens','(최대 출력 토큰)')+'<input id="jai-tok" type="number" min="256" value="'+esc(ai.max_tokens||3500)+'" style="'+inSt+'">')+
    '';

  // ── 3열: 탭 카드 (프롬프트 / Key 매핑) ──
  // 기본 프롬프트 — 백엔드의 sys_p 기본값과 동일 문구를 그대로 채워 넣어 편집·삭제·변경 가능
  var _defP=
    "너는 사내 Jira 이슈를 분석해 주는 전문 어시스턴트다. 아래 '검색된 Jira 이슈'(제목·유형·상태·우선순위·담당·설명·댓글)만을 근거로, 사용자 질문에 한국어로 **상세하고 구조적으로** 답한다. 각 이슈의 제목(summary)·본문(설명, text)·댓글 내용을 모두 확인해 답변 근거로 삼는다. 검색된 이슈 전체를 훑어 관련도를 판단하되, 사용자가 개수를 따로 지정하지 않은 질문이면 그중 가장 관련도 높거나 최신인 이슈 최대 5건(Top5)만 골라 '## 이슈별 상세'에 다룬다 — 나머지는 '## 종합 결론'에서 개수·경향만 요약한다. 다음 형식을 반드시 따른다:\n\n"+
    "## 핵심 요약\n질문에 대한 답을 3~5문장으로 먼저 제시한다.\n\n"+
    "## 이슈별 상세\n관련된 각 이슈마다 아래 항목을 모두 포함해 최소 5~8줄 분량으로 구체적으로 작성한다(간단히 한두 줄로 뭉뚱그리지 않는다):\n"+
    "- **[PROJ-123] 제목** — (상태/우선순위/담당)\n"+
    "- 증상/현상: 무엇이 어떤 상황에서 발생했는지 설명에 적힌 그대로 구체적으로.\n"+
    "- 원인: 설명·댓글에서 분석된 원인(추정이면 '추정'이라 표시).\n"+
    "- 조치/진행 상태: 어떤 조치가 있었는지, 아직 진행 중이면 무엇이 남았는지.\n"+
    "- 댓글 논의: 댓글에서 드러난 추가 논의·의견 충돌·결론이 있으면 발언자와 함께 반영.\n"+
    "- 영향 범위(있으면): 장비/버전/특정 조건 등 이 이슈가 재현되는 범위.\n\n"+
    "## 종합 결론\n공통 원인·패턴, 미해결(Open) 항목, 우선 처리 권고, 추가로 확인이 필요한 점을 정리한다.\n\n"+
    "[규칙] 근거가 된 이슈는 반드시 이슈 키([P106-2436]처럼 '프로젝트코드-숫자' 형태, 각 이슈의 '이슈키 [...]' 값)로 인용한다. 이슈 제목 안의 [U9532H]·[LGU]·[상용망] 같은 대괄호 태그는 이슈 키가 아니므로 절대 키 자리에 쓰지 않는다. 이슈에 '제목매칭/본문언급' 표시가 있으면: 질문의 모델명이 제목에 있는 '제목매칭' 이슈를 그 모델의 이슈로 우선하고, '본문언급' 이슈는 참고로만 다룬다. 설명·댓글이 없는 관리성 이슈(산출물·릴리즈 등)가 최신이면 그 사실을 명시하고, 실질 내용이 있는 최신 이슈도 함께 제시한다. 설명·댓글에 실제로 있는 내용만 쓰고 추측·창작은 금지한다. 검색식(JQL)을 임의로 만들어 답변에 표시하지 않는다 — 실제 사용된 JQL은 시스템이 하단에 별도 표시한다. 정보가 부족하면 '해당 이슈의 설명/댓글에 정보가 부족함'이라고 명시한다. 검색 결과 자체가 없으면 '관련 이슈를 찾지 못했습니다'라고만 답한다. 충분히 길고 빠짐없이, 마크다운(##, **, -)으로 가독성 있게 작성한다.";
  // 저장된 프롬프트가 있으면 그대로, 없으면 기본 프롬프트를 편집 가능하도록 채워 표시
  window._jaiPromptDef=_defP;
  var _curPrompt=(ai.prompt&&String(ai.prompt).trim())?String(ai.prompt):_defP;
  window._jaiKeyMap=Array.isArray(ai.key_mappings)?ai.key_mappings.slice():[];
  var _tabBtnCss='font-size:12.5px;font-weight:800;padding:7px 14px;border-radius:8px;border:1.5px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;display:inline-flex;align-items:center;gap:5px;';
  var _tabBtnOn='background:#7c3aed;color:#fff;border-color:#7c3aed;box-shadow:0 2px 8px rgba(124,58,237,0.24);';
  var col3=
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">'+
      '<button id="jai-tab-prompt" onclick="_jaiCfgTab(\'prompt\')" style="'+_tabBtnCss+_tabBtnOn+'"><i class="ti ti-message-2"></i> 프롬프트</button>'+
      '<button id="jai-tab-keymap" onclick="_jaiCfgTab(\'keymap\')" style="'+_tabBtnCss+'"><i class="ti ti-key"></i> Key 매핑</button>'+
    '</div>'+
    '<div id="jai-tab-prompt-body" style="flex:1;min-height:0;display:flex;flex-direction:column;">'+
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">'+
        '<div style="font-size:11.5px;font-weight:700;color:var(--text2);">답변 프롬프트 <span style="font-weight:400;color:var(--text3);margin-left:4px;">(그대로 LLM 시스템 프롬프트로 사용)</span></div>'+
        '<button onclick="_jaiPromptReset()" style="font-size:11px;font-weight:700;padding:5px 10px;border-radius:6px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;"><i class="ti ti-refresh" style="font-size:12px;"></i> 기본값 복원</button>'+
      '</div>'+
      '<textarea id="jai-prompt" style="'+inSt+'flex:1;min-height:0;resize:none;font-family:inherit;font-size:12.5px;line-height:1.7;display:block;">'+esc(_curPrompt)+'</textarea>'+
    '</div>'+
    '<div id="jai-tab-keymap-body" style="flex:1;min-height:0;display:none;flex-direction:column;">'+
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:8px;flex-wrap:wrap;">'+
        '<div style="font-size:11.5px;font-weight:700;color:var(--text2);flex:1;min-width:200px;">Jira 프로젝트 Key ↔ 프로젝트명 매핑 <span style="font-weight:400;color:var(--text3);margin-left:4px;">(질문에 프로젝트명이 언급되면 Key로 자동 치환)</span></div>'+
        '<div style="display:flex;gap:6px;flex-shrink:0;">'+
          '<button onclick="_jaiKeyMapFetch()" title="Jira 서버에서 프로젝트 목록을 가져와 매핑 자동 생성 (기존 매핑 유지 · 신규만 추가)" style="font-size:11.5px;font-weight:800;padding:6px 12px;border-radius:7px;border:1.5px solid #2684ff;background:#fff;color:#2684ff;cursor:pointer;"><i class="ti ti-cloud-download" style="font-size:12px;"></i> Jira에서 가져오기</button>'+
          '<button onclick="_jaiKeyMapAdd()" style="font-size:11.5px;font-weight:800;padding:6px 12px;border-radius:7px;border:1.5px solid #7c3aed;background:#fff;color:#7c3aed;cursor:pointer;"><i class="ti ti-plus" style="font-size:12px;"></i> 매핑 추가</button>'+
        '</div>'+
      '</div>'+
      '<div id="jai-keymap-msg" style="font-size:11.5px;min-height:0;margin-bottom:6px;"></div>'+
      '<div id="jai-keymap-list" style="flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:8px;"></div>'+
    '</div>';
  // 카드 렌더 완료 후 Key 매핑 리스트 초기 그리기
  setTimeout(function(){ _jaiKeyMapRender(); }, 0);

  el.innerHTML=
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">'+
      '<i class="ti ti-search" style="font-size:20px;color:#7c3aed;"></i>'+
      '<span style="font-size:18px;font-weight:800;">Jira Search 설정</span>'+
      '<span style="flex:1;"></span>'+
      '<button onclick="jiraAiCfgSave()" style="font-size:13px;font-weight:700;padding:9px 22px;border-radius:8px;border:none;background:#7c3aed;color:#fff;cursor:pointer;display:flex;align-items:center;gap:7px;box-shadow:0 2px 10px rgba(124,58,237,0.22);">'+
        '<i class="ti ti-device-floppy"></i> 저장'+
      '</button>'+
      '<span id="jai-cfg-msg" style="font-size:12px;color:#16804a;min-width:60px;"></span>'+
    '</div>'+
    '<div style="display:grid;grid-template-columns:260px 320px 1fr;gap:16px;height:calc(100vh - 160px);min-height:400px;">'+
      '<div style="background:var(--bg2,#fff);border:1px solid var(--border);border-radius:12px;padding:16px 16px 12px;overflow-y:auto;">'+col1+'</div>'+
      '<div style="background:var(--bg2,#fff);border:1px solid var(--border);border-radius:12px;padding:16px 16px 12px;overflow-y:auto;">'+col2+'</div>'+
      '<div style="background:var(--bg2,#fff);border:1px solid var(--border);border-radius:12px;padding:16px 16px 12px;display:flex;flex-direction:column;">'+col3+'</div>'+
    '</div>';
  _jiraAiLoadLlms();
}
function _jiraAiCfgPanel(){
  /* renderJiraSearchCfg로 이전됨 — 하위호환용 빈 반환 */
  return '';
}
async function _jiraAiLoadLlms(){
  var sel=document.getElementById('jai-llm'); if(!sel||sel._loaded) return; sel._loaded=true;
  try{ var d=await (await fetch('/api/llms')).json(); var cur=((_isyncCfg&&_isyncCfg.ai&&_isyncCfg.ai.llm_id)||''); (d.llms||[]).forEach(function(l){ if(l.status&&l.status!=='active')return; var o=document.createElement('option'); o.value=l.id; o.textContent=l.name+' ('+(l.model||l.type||'')+')'; if(String(l.id)===String(cur))o.selected=true; sel.appendChild(o); }); }catch(e){}
}
// Jira Search 설정 › 오른쪽 카드 탭 전환 (프롬프트 / Key 매핑)
function _jaiCfgTab(name){
  var p=document.getElementById('jai-tab-prompt-body'), k=document.getElementById('jai-tab-keymap-body');
  var bp=document.getElementById('jai-tab-prompt'), bk=document.getElementById('jai-tab-keymap');
  if(!p||!k||!bp||!bk) return;
  var on='background:#7c3aed;color:#fff;border-color:#7c3aed;box-shadow:0 2px 8px rgba(124,58,237,0.24);';
  var off='background:#fff;color:var(--text2);border-color:var(--border);box-shadow:none;';
  if(name==='keymap'){
    p.style.display='none'; k.style.display='flex';
    bk.style.cssText=bk.style.cssText.replace(/background:[^;]+;?/,'').replace(/color:[^;]+;?/,'').replace(/border-color:[^;]+;?/,'').replace(/box-shadow:[^;]+;?/,'')+on;
    bp.style.cssText=bp.style.cssText.replace(/background:[^;]+;?/,'').replace(/color:[^;]+;?/,'').replace(/border-color:[^;]+;?/,'').replace(/box-shadow:[^;]+;?/,'')+off;
  } else {
    k.style.display='none'; p.style.display='flex';
    bp.style.cssText=bp.style.cssText.replace(/background:[^;]+;?/,'').replace(/color:[^;]+;?/,'').replace(/border-color:[^;]+;?/,'').replace(/box-shadow:[^;]+;?/,'')+on;
    bk.style.cssText=bk.style.cssText.replace(/background:[^;]+;?/,'').replace(/color:[^;]+;?/,'').replace(/border-color:[^;]+;?/,'').replace(/box-shadow:[^;]+;?/,'')+off;
  }
}
// 답변 프롬프트를 기본값으로 되돌림 (편집·삭제 후 되찾고 싶을 때)
function _jaiPromptReset(){
  if(!confirm('프롬프트를 기본값으로 되돌립니다. 현재 편집 내용은 사라집니다. 계속?')) return;
  var ta=document.getElementById('jai-prompt'); if(ta) ta.value=window._jaiPromptDef||'';
}
// Jira 프로젝트 키↔이름 매핑 — 로컬 상태(window._jaiKeyMap)로 유지, 저장 시 payload.ai.key_mappings 로 전송
window._jaiKeyMap=window._jaiKeyMap||[];
function _jaiKeyMapAdd(){
  window._jaiKeyMap=window._jaiKeyMap||[];
  window._jaiKeyMap.push({key:'',name:'',desc:''});
  _jaiKeyMapRender(); setTimeout(function(){ var arr=document.querySelectorAll('#jai-keymap-list input[data-km-k]'); var last=arr[arr.length-1]; if(last) last.focus(); }, 10);
}
// Jira 서버에서 프로젝트 목록을 가져와 Key 매핑에 자동 채움
// 규칙: 기존 매핑은 유지, Key가 없는 신규만 추가. 기존 매핑도 이름·설명이 비어있으면 API 값으로 채움.
async function _jaiKeyMapFetch(){
  var msg=document.getElementById('jai-keymap-msg');
  if(msg){ msg.style.color='#6b7280'; msg.innerHTML='<i class="ti ti-loader"></i> Jira에서 프로젝트 목록 조회 중…'; }
  try{
    var d=await (await fetch('/api/jira/projects?expand=description')).json();
    if(!d||!d.ok){ throw new Error((d&&d.error)||'조회 실패'); }
    var projs=(d.projects||[]).slice().sort(function(a,b){ return String(a.key||'').localeCompare(String(b.key||''), undefined,{numeric:true}); });
    window._jaiKeyMap=window._jaiKeyMap||[];
    var existing={}; window._jaiKeyMap.forEach(function(it){ if(it&&it.key) existing[String(it.key).toUpperCase()]=it; });
    var _added=0, _filled=0;
    projs.forEach(function(p){
      var k=String(p.key||'').toUpperCase(); if(!k) return;
      var cur=existing[k];
      if(!cur){
        window._jaiKeyMap.push({key:p.key, name:(p.name||''), desc:(p.description||'')});
        _added++;
      } else {
        // 기존 매핑 — 비어있는 필드만 API 값으로 보강 (사용자가 편집한 값은 보존)
        var _f=false;
        if(!String(cur.name||'').trim() && p.name){ cur.name=p.name; _f=true; }
        if(!String(cur.desc||'').trim() && p.description){ cur.desc=p.description; _f=true; }
        if(_f) _filled++;
      }
    });
    _jaiKeyMapRender();
    if(msg){
      msg.style.color='#16804a';
      msg.innerHTML='<i class="ti ti-check"></i> 프로젝트 '+projs.length+'건 — 신규 <b>'+_added+'</b>건 추가, 기존 <b>'+_filled+'</b>건 보강. (저장 버튼을 눌러야 반영됩니다)';
    }
  } catch(e){
    if(msg){ msg.style.color='#c0392b'; msg.innerHTML='<i class="ti ti-alert-circle"></i> '+String(e.message||e).replace(/</g,'&lt;'); }
  }
}
function _jaiKeyMapDel(i){
  (window._jaiKeyMap||[]).splice(i,1); _jaiKeyMapRender();
}
function _jaiKeyMapEdit(i,field,val){
  var it=(window._jaiKeyMap||[])[i]; if(!it) return; it[field]=val;
}
function _jaiKeyMapRender(){
  var el=document.getElementById('jai-keymap-list'); if(!el) return;
  var list=window._jaiKeyMap||[];
  var esc=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');};
  var inSt='font-size:12.5px;padding:7px 10px;border:1px solid var(--border);border-radius:7px;outline:none;box-sizing:border-box;background:#fff;color:var(--text);';
  if(!list.length){
    el.innerHTML='<div style="padding:24px;text-align:center;color:var(--text3);font-size:12.5px;border:1.5px dashed var(--border);border-radius:10px;">등록된 매핑이 없습니다. <b>+ 매핑 추가</b> 버튼으로 시작하세요.</div>';
    return;
  }
  // 헤더 (컬럼명) — 매핑이 하나라도 있을 때만 표시
  var _hdr='<div style="display:grid;grid-template-columns:160px 220px 1fr 36px;gap:8px;align-items:center;padding:0 4px 6px;font-size:10.5px;font-weight:800;color:var(--text3);letter-spacing:.04em;text-transform:uppercase;">'+
    '<div>키값</div>'+
    '<div>프로젝트명</div>'+
    '<div>설명</div>'+
    '<div></div>'+
    '</div>';
  el.innerHTML=_hdr+list.map(function(it,i){
    return '<div style="display:grid;grid-template-columns:160px 220px 1fr 36px;gap:8px;align-items:center;border:1px solid var(--border);border-radius:10px;padding:8px 10px;background:var(--bg2,#fff);">'+
      '<input data-km-k value="'+esc(it.key)+'" oninput="_jaiKeyMapEdit('+i+',\'key\',this.value)" placeholder="예: P106" style="'+inSt+'font-weight:800;color:#2d6fd4;">'+
      '<input value="'+esc(it.name)+'" oninput="_jaiKeyMapEdit('+i+',\'name\',this.value)" placeholder="프로젝트명" style="'+inSt+'">'+
      '<input value="'+esc(it.desc)+'" oninput="_jaiKeyMapEdit('+i+',\'desc\',this.value)" placeholder="이 프로젝트가 무엇을 다루는지" style="'+inSt+'">'+
      '<button onclick="_jaiKeyMapDel('+i+')" title="이 매핑 삭제" style="width:32px;height:32px;border-radius:7px;border:1px solid var(--border);background:#fff;color:#c0392b;cursor:pointer;font-size:14px;"><i class="ti ti-trash"></i></button>'+
    '</div>';
  }).join('');
}
async function jiraAiCfgTest(){
  var g=function(id){var e=document.getElementById(id);return e?e.value:'';}; var ck=function(id){var e=document.getElementById(id);return e?e.checked:true;};
  var msg=document.getElementById('jai-test-msg'); if(msg){msg.style.color='#6b7280';msg.textContent='테스트 중…';}
  var body={url:String(g('jai-url')).trim(), auth:g('jai-auth'), user:String(g('jai-user')).trim(), token:g('jai-token'), verify:ck('jai-verify')};
  try{ var d=await (await fetch('/api/jira/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
    if(msg){ if(d&&d.ok){msg.style.color='#16804a';msg.textContent='✓ 연결 성공 — '+(d.displayName||d.name||'');} else {msg.style.color='#c0392b';msg.textContent='✗ '+((d&&d.error)||'실패');} }
  }catch(e){ if(msg){msg.style.color='#c0392b';msg.textContent='✗ '+e.message;} }
}
async function jiraAiCfgSave(){
  var g=function(id){var e=document.getElementById(id);return e?e.value:'';}; var ck=function(id){var e=document.getElementById(id);return e?e.checked:true;};
  // 빈 값 규칙: max_issues/desc_len/comment_n 모두 빈 문자열이면 서버에 빈 문자열로 넘겨 "전체"로 해석되게 함
  var _rd=String(g('jai-desc')).trim(); var _rc=String(g('jai-cmt')).trim();
  var ai={
    llm_id:g('jai-llm'),
    max_issues:(String(g('jai-max')).trim()===''?0:(parseInt(g('jai-max'))||0)),
    project:String(g('jai-proj')).trim(),
    auto_jql:ck('jai-autojql'),
    prompt:g('jai-prompt'),
    desc_len:(_rd===''?'':(parseInt(_rd)||'')),
    comment_n:(_rc===''?'':(parseInt(_rc,10))),
    temperature:(isNaN(parseFloat(g('jai-temp')))?0.35:parseFloat(g('jai-temp'))),
    max_tokens:parseInt(g('jai-tok'))||3500,
    key_mappings:(window._jaiKeyMap||[]).filter(function(k){return k&&k.key;})
  };
  var body={ url:String(g('jai-url')).trim(), auth:g('jai-auth'), user:String(g('jai-user')).trim(), token:g('jai-token'), verify:ck('jai-verify'), ai:ai };
  var _cm=document.getElementById('jai-cfg-msg');
  try{
    var resp=await fetch('/api/jira/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    var r=await resp.json();
    if(!resp.ok||!(r&&r.ok)){ throw new Error((r&&(r.error||r.detail))||('HTTP '+resp.status)); }
    if(typeof showToast==='function')showToast('Jira Search 설정 저장됨');
    if(_cm){ _cm.style.color='#16804a'; _cm.textContent='✓ 저장됨'; }
    _isyncCfg=Object.assign({},body);
    // 저장된 인증으로 실제 어떤 계정이 쓰이는지 즉시 확인 (댓글·이슈 등록 계정)
    try{
      var t=await (await fetch('/api/jira/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
      if(_cm){
        if(t&&t.ok){ _cm.style.color='#16804a'; _cm.textContent='✓ 저장됨 — 등록 계정: '+(t.displayName||t.name||''); }
        else { _cm.style.color='#c0392b'; _cm.textContent='✓ 저장됨 · ✗ 인증 실패: '+String((t&&t.error)||'').slice(0,60); }
      }
    }catch(e2){}
  }
  catch(e){ if(typeof showToast==='function')showToast('저장 오류: '+e.message); if(_cm){_cm.style.color='#c0392b';_cm.textContent='✗ 저장 실패: '+String(e.message||'').slice(0,60);} }
}
function _jiraAnimInit(){ if(document.getElementById('jira-ai-anim')) return; var st=document.createElement('style'); st.id='jira-ai-anim'; st.textContent='@keyframes jiraOrb{0%,100%{transform:scale(.8);opacity:.65}50%{transform:scale(1.07);opacity:1}}@keyframes jiraDot{0%,80%,100%{transform:translateY(0);opacity:.35}40%{transform:translateY(-4px);opacity:1}}@keyframes jiraCaret{0%,100%{opacity:1}50%{opacity:0}}.jira-dots i{display:inline-block;width:4px;height:4px;border-radius:50%;background:#7c3aed;margin-left:3px;animation:jiraDot 1.2s infinite}.jira-dots i:nth-child(2){animation-delay:.16s}.jira-dots i:nth-child(3){animation-delay:.32s}'; (document.head||document.body).appendChild(st); }
function _jiraLoadingHtml(phase, sec, llm){
  return '<div style="display:flex;align-items:center;gap:13px;padding:15px 17px;background:linear-gradient(135deg,#faf8ff,#f1ebfd);border:1px solid #e0d6f5;border-radius:11px;">'
    +'<div style="position:relative;width:30px;height:30px;flex-shrink:0;"><div style="position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 35% 30%,#b79df8,#7c3aed);animation:jiraOrb 1.3s ease-in-out infinite;box-shadow:0 0 14px rgba(124,58,237,0.45);"></div><i class="ti ti-sparkles" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:15px;"></i></div>'
    +'<div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:700;color:#5b2db0;display:flex;align-items:center;flex-wrap:wrap;">'+String(phase||'처리 중')+'<span class="jira-dots"><i></i><i></i><i></i></span></div><div style="font-size:11px;color:var(--text3);margin-top:3px;">'+(llm?(String(llm)+' · '):'')+(sec||0)+'초 경과'+(sec>=20?' — 로컬 LLM 응답 대기 중(첫 답변까지 다소 걸릴 수 있어요)':'')+'</div></div>'
    +'</div>';
}
// 지식 검색 공통 표기 규칙 — LLM이 LaTeX($\rightarrow$ 등)를 출력하지 않도록
var _JAI_NOTEX='\n[표기 규칙] LaTeX 수식 표기($...$, \\rightarrow, \\times, \\leq 등)는 절대 사용하지 마라. 화살표는 → 기호를, 곱셈·비교는 × ≤ ≥ 기호를 그대로 쓴다.';
// 모델 전환 규칙 — 이전 대화의 다른 모델 정보로 답하지 않도록
var _JAI_MDLRULE='\n[대상 규칙] 현재 질문에 특정 모델명(예: U9532H, E7500)이 있으면 반드시 그 모델 기준으로만 답한다. 이전 대화가 다른 모델에 대한 것이었어도 그 내용을 현재 모델의 사실처럼 섞어 쓰지 않는다.';
// HITL(되묻기) 규칙 — AI Assistant FAB(_fabPromptParts)와 동일한 [CLARIFY] 프로토콜을 지식 검색에도 적용
var _JAI_HITL='\n[HITL] 정보가 충분하면 절대 되묻지 말고 바로 답하라. 다만 (a) 질문이 모호해 무엇을 묻는지 이해하기 어렵거나, (b) 대상(모델/항목)이 특정되지 않아 후보가 여럿이거나, (c) 검색된 지식에 답할 근거가 부족해 답이 애매·불확실할 때는 — "학습된 데이터에 없습니다"로 끝내지 말고, 응답 첫 줄에 정확히 [CLARIFY]만 쓰고 다음 줄부터 "무엇을 더 알려주면 정확히 찾을 수 있는지"를 "- 질문" 형식으로 물어라(최대 3개). 질문에 이미 모델명/시리즈가 있으면 모델을 되묻지 마라. ★ 지식(RAG/Confluence) 컨텍스트가 제공된 경우에는 [CLARIFY]를 쓰지 말고, 컨텍스트에 있는 정보로 최대한 답변하라. 정말 컨텍스트에 없는 세부만 되물어야 한다면 먼저 컨텍스트 요약을 답하고 그 뒤에 필요한 세부를 한두 개만 짧게 물어라.';
// HITL 사전 필터: 로컬 LLM(gemma 등 소형 모델)이 [HITL] 프롬프트 지침을 안정적으로 안 따를 때의 안전망.
// 키워드를 정확히 맞혀야만 걸리는 방식(_JAI_VAGUE_RX)은 "스펙"의 오타·변형("스페","스팩","스페이"...)을 다 놓쳐서
// 무력화되기 쉬웠음 — 대신 "모델명이 없고 짧은 질문"이면 키워드와 무관하게 무조건 되묻는 방식으로 전환.
// 일반 인사·감사·취소 같은 명백한 비질문만 예외로 걸러 대화가 매번 끊기지 않게 함.
var _JAI_MODEL_RX=/\b[A-Za-z]{1,3}\d{3,5}[A-Za-z0-9-]*\b/;
var _JAI_CHIT_RX=/^(안녕|하이|고마워|감사|땡큐|thanks|thank you|취소|그만|알겠|ok|okay|네|응|좋아)[!.~？?\s]*$/i;
// 도구 후보(1단계 선택지) — UTOP 지식 검색(kb) + 등록된 외부 지식 툴(어시스턴트) 전부.
// 각 옵션의 v는 _jaiSel에 그대로 대입할 값(kb / dify:<id>)
function _jaiToolOpts(){
  var groups=_jaiSelGroups();
  var kbG=groups.find(function(g){return g.key==='kb';});
  var extG=groups.find(function(g){return g.key==='external';});
  var opts=[{v:'kb',label:'UTOP 지식 검색(스펙·매뉴얼·디버깅)'}];
  (extG&&extG.opts||[]).forEach(function(o){ opts.push({v:o.v,label:o.label}); });
  return opts;
}
function _jaiNeedsClarifyPre(q){
  var t=String(q||'').trim();
  if(!t || t.length<2 || t.length>28) return null;
  if(_JAI_MODEL_RX.test(t)) return null;
  if(_JAI_CHIT_RX.test(t)) return null;
  // 어시스턴트별 3단계 커스터마이즈 — 검증 지식 Assistant(specs) 는 도구 선택 대신 "의도 카테고리" 선택
  var _sel=(typeof _jaiSel!=='undefined')?_jaiSel:'';
  if(String(_sel||'').indexOf('dify:specs')===0){
    return [
      {text:'질문 의도를 선택해 주세요', tool:true, toolOpts:[
        {v:'intent:spec',   label:'제품 스펙'},
        {v:'intent:debug',  label:'디버깅 방법'},
        {v:'intent:weekly', label:'주간 업무'},
      ]},
      {text:'정확한 모델명이나 시리즈를 알려주세요', model:true, opts:['건너뛰기']},
      {text:'추가로 궁금한 점이 있으면 적어주세요', opts:['건너뛰기'], optional:true}
    ];
  }
  // UTOP 지식 검색(kb) — 어느 지식 소스를 우선 볼지 (매뉴얼/제품스펙) 선택
  if(_sel==='kb'){
    return [
      {text:'어떤 지식을 찾고 계신가요?', tool:true, toolOpts:[
        {v:'intent:manual', label:'매뉴얼'},
        {v:'intent:spec',   label:'제품 스펙'},
      ]},
      {text:'정확한 모델명이나 시리즈를 알려주세요', model:true, opts:['건너뛰기']},
      {text:'추가로 궁금한 점이 있으면 적어주세요', opts:['건너뛰기'], optional:true}
    ];
  }
  var toolOpts=_jaiToolOpts();
  if(toolOpts.length<=1) return null;
  return [
    {text:'질문의 의도가 명확하지 않습니다. 질문의 의도를 선택해 주세요', tool:true, toolOpts:toolOpts},
    {text:'정확한 모델명이나 시리즈를 알려주세요', model:true},
    {text:'추가로 궁금한 점이 있으면 적어주세요 (없으면 건너뛰기)', opts:['건너뛰기'], optional:true}
  ];
}
// 되묻기 메시지 push 공용 헬퍼 — 카드를 그리기 전에 모델 후보를 미리 로드해 c.models에 담아둔다.
// (비동기 로드를 기다리지 않으면 첫 질문에서 모델 목록이 비어 콤보 대신 일반 입력창으로 떨어지는 문제가 있었음)
async function _jaiClarifyPush(s, qs, origQ){
  var models=await _jaiClarifyModelOpts();
  s.msgs.push({role:'ai',content:'',clarify:{qs:qs,origQ:origQ,sel:_jaiSel,models:models},kb:true,sel:_jaiSel});
}
// HITL: 답변이 [CLARIFY]로 시작하면 일반 답변 대신 되묻기 메시지로 저장. true 반환 시 호출쪽은 일반 push를 건너뜀
// ★ 단, RAG 컨텍스트가 이미 있는 경우엔 되묻지 말고 원문 답변(자유텍스트)을 그대로 보여준다.
async function _jaiPushClarify(s, answer, origQ, hadRagCtx){
  var t=String(answer||'').trim();
  if(!/^\[CLARIFY\]/i.test(t)) return false;
  // RAG 컨텍스트가 있으면 [CLARIFY] 태그만 벗겨서 원문 답변 유지 (되묻기 카드 X)
  if(hadRagCtx){
    var body=t.replace(/^\[CLARIFY\]\s*\r?\n?/i,'').trim();
    if(body){
      s.msgs.push({role:'ai',content:body,kb:true,sel:_jaiSel});
      return true;
    }
  }
  var qs=t.replace(/^\[CLARIFY\]/i,'').split(/\r?\n/).map(function(x){return x.replace(/^[\s\-*•]+/,'').trim();}).filter(Boolean).slice(0,3);
  if(!qs.length) qs=['어떤 모델/제품군에 대한 질문인가요?'];
  await _jaiClarifyPush(s, qs, origQ);
  return true;
}
// 되묻기 카드용 모델 후보 목록 — Confluence 스펙 모델 우선, 없으면 TC 모델그룹 폴백(AI Assistant FAB와 동일 소스)
// async: 카드를 그리기 전에 확실히 로드해서, 첫 질문 때 목록이 비어 콤보 대신 일반 입력창으로 떨어지는 문제 방지
async function _jaiClarifyModelOpts(){
  if(window._specModels===undefined){
    try{ var r=await fetch('/api/confluence/models'); var d=await r.json(); window._specModels=(d&&d.models)||[]; }
    catch(e){ window._specModels=[]; }
  }
  var _specM=window._specModels||[];
  var _tcM=(typeof _allTcModelGroups==='function')?(_allTcModelGroups()||[]):[];
  return (_specM&&_specM.length)?_specM.slice():_tcM;
}
// 되묻기 카드 HTML — 클로드 AskUserQuestion 패널과 동일한 구조: 질문마다 탭(①②③)으로 전환,
// 각 탭은 라디오 목록(선택지 + 설명, 마지막은 "직접 입력할게요")으로 답하는 방식.
// c.qs[i] = {text, model?:bool, opts?:string[]}. c.answers[i] = 그 질문의 선택된 답(문자열) 또는 null(미답변).
// c.active = 현재 보고 있는 탭 인덱스. c.models = 모델 질문용 후보(카드 push 시점에 미리 로드해둠).
function _jaiClarifyHtml(mi, c){
  var qs=c.qs||[];
  // 구버전 세션 호환 — qs가 예전 형식(문자열 배열)으로 저장돼 있으면 새 {text,...} 구조로 변환
  qs=qs.map(function(q){ return (typeof q==='string')?{text:q}:q; });
  c.qs=qs;
  if(!c.answers||c.answers.length!==qs.length) c.answers=qs.map(function(){return null;});
  if(c.active==null) c.active=0;
  var esc=_jaiEsc;
  var ai=c.active;
  var q=qs[ai]||{};
  var answeredN=c.answers.filter(function(v){return v!=null;}).length;
  var allAnswered=answeredN>=qs.length;
  // 탭 헤더 — 번호 + 라벨(질문 성격별 짧은 이름), 현재 탭은 보라 밑줄, 답변된 탭은 체크 표시
  var tabLabel=function(qq,i){ if(qq.tool) return '① 질문 의도'; if(qq.model) return '② 모델명'; return '③ 추가질문'; };
  var tabs=qs.map(function(qq,i){
    var on=(i===ai); var done=(c.answers[i]!=null);
    return '<div onclick="_jaiClarifyTab('+mi+','+i+')" style="padding:6px 4px;font-size:11.5px;font-weight:700;color:'+(on?'#6b3fc4':(done?'var(--text2)':'var(--text3)'))+';border-bottom:2px solid '+(on?'#7c3aed':'transparent')+';cursor:pointer;display:flex;align-items:center;gap:4px;">'
      +(done?'<i class="ti ti-circle-check-filled" style="font-size:11px;color:#00a872;"></i>':'')+esc(tabLabel(qq,i))+'</div>';
  }).join('<div style="width:12px;"></div>');
  var h='<div style="border:1px solid #e7defb;border-radius:9px;background:#faf8ff;padding:0;overflow:hidden;">'
    +(qs.length>1?('<div style="display:flex;align-items:center;padding:0 10px;border-bottom:1px solid #ecdffc;background:#fff;">'+tabs+'</div>'):'')
    +'<div style="padding:10px 10px 9px;">'
    +'<div style="font-size:12.5px;font-weight:700;color:var(--text);margin-bottom:8px;line-height:1.4;">'+esc(q.text||'')+'</div>';
  h+='<div style="display:flex;flex-direction:column;gap:4px;">';
  if(q.tool){
    // 1단계: 도구 선택 — {v,label} 객체 옵션, 답은 v(예: 'kb'/'dify:specs')를 저장
    (q.toolOpts||[]).forEach(function(o){
      var on=(c.answers[ai]===o.v);
      h+='<div onclick="_jaiClarifyPickOpt('+mi+','+ai+',\''+String(o.v).replace(/'/g,"\\'")+'\')" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid '+(on?'#7c3aed':'#e2d8f6')+';border-radius:8px;background:'+(on?'#f3eefe':'#fff')+';cursor:pointer;" onmouseenter="this.style.borderColor=\'#7c3aed\'" onmouseleave="this.style.borderColor=\''+(on?'#7c3aed':'#e2d8f6')+'\'">'
        +'<span style="width:14px;height:14px;border-radius:50%;border:1.5px solid '+(on?'#7c3aed':'#c3cbd8')+';display:flex;align-items:center;justify-content:center;flex-shrink:0;">'+(on?'<span style="width:6px;height:6px;border-radius:50%;background:#7c3aed;"></span>':'')+'</span>'
        +'<span style="font-size:12px;font-weight:600;color:var(--text);">'+esc(o.label)+'</span>'
      +'</div>';
    });
    h+='</div></div>'
      +'<div style="display:flex;align-items:center;gap:8px;padding:9px 10px;border-top:1px solid #ecdffc;background:#fff;">'
      +'<span style="font-size:10.5px;color:var(--text3);flex-shrink:0;">'+answeredN+'/'+qs.length+'</span>'
      +'<button onclick="_jaiClarifySubmit('+mi+')" '+(allAnswered?'':'disabled')+' style="flex:1;font-size:11.5px;font-weight:800;padding:7px 0;border:none;border-radius:7px;background:'+(allAnswered?'#7c3aed':'#d9caf5')+';color:#fff;cursor:'+(allAnswered?'pointer':'not-allowed')+';"><i class="ti ti-send" style="font-size:12px;"></i> 보내기</button>'
      +'<button onclick="_jaiClarifyCancel('+mi+')" style="flex-shrink:0;font-size:11px;color:#8a8f9c;background:none;border:none;cursor:pointer;">취소</button>'
      +'</div></div>';
    return h;
  }
  // 선택지 렌더 — model 질문은 등록된 모델 목록 + "직접 입력할게요", opts 질문(추가질문 등)은 주어진 옵션 그대로
  var opts=q.model?(c.models||[]).slice():(q.opts||[]).slice();
  var isFree=(c.answers[ai]!=null)&&opts.indexOf(c.answers[ai])<0;
  var freeActive=(window['_jaiClrFree'+mi+'_'+ai]===true)||isFree;
  opts.slice(0,30).forEach(function(o){
    var on=(c.answers[ai]===o);
    h+='<div onclick="_jaiClarifyPickOpt('+mi+','+ai+',\''+String(o).replace(/'/g,"\\'")+'\')" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid '+(on?'#7c3aed':'#e2d8f6')+';border-radius:8px;background:'+(on?'#f3eefe':'#fff')+';cursor:pointer;" onmouseenter="this.style.borderColor=\'#7c3aed\'" onmouseleave="this.style.borderColor=\''+(on?'#7c3aed':'#e2d8f6')+'\'">'
      +'<span style="width:14px;height:14px;border-radius:50%;border:1.5px solid '+(on?'#7c3aed':'#c3cbd8')+';display:flex;align-items:center;justify-content:center;flex-shrink:0;">'+(on?'<span style="width:6px;height:6px;border-radius:50%;background:#7c3aed;"></span>':'')+'</span>'
      +'<span style="font-size:12px;font-weight:600;color:var(--text);">'+esc(o)+'</span>'
    +'</div>';
  });
  // 직접입력 옵션 — 모델 질문이면 타이핑 검색까지 겸함
  h+='<div onclick="_jaiClarifyFreeToggle('+mi+','+ai+')" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid '+(freeActive?'#7c3aed':'#e2d8f6')+';border-radius:8px;background:'+(freeActive?'#f3eefe':'#fff')+';cursor:pointer;">'
    +'<span style="width:14px;height:14px;border-radius:50%;border:1.5px solid '+(freeActive?'#7c3aed':'#c3cbd8')+';display:flex;align-items:center;justify-content:center;flex-shrink:0;">'+(freeActive?'<span style="width:6px;height:6px;border-radius:50%;background:#7c3aed;"></span>':'')+'</span>'
    +'<span style="font-size:12px;font-weight:600;color:var(--text);">직접 입력할게요</span>'
  +'</div>';
  if(freeActive){
    var _id='jai-clr-'+mi+'-'+ai;
    h+='<input id="'+_id+'" value="'+(isFree?esc(c.answers[ai]):'')+'" oninput="_jaiClrDD2('+mi+','+ai+')" onkeydown="if(event.key===\'Enter\'){event.preventDefault();_jaiClarifyFreeCommit('+mi+','+ai+');}" placeholder="'+(q.model?'모델명 검색 또는 입력…':'답변 입력…')+'" style="margin-top:4px;width:100%;font-size:11.5px;padding:7px 9px;border:1px solid #d9caf5;border-radius:7px;box-sizing:border-box;outline:none;background:#fff;" autofocus>';
    if(q.model) h+='<div id="'+_id+'-dd" style="margin-top:2px;background:#fff;border:1px solid var(--border);border-radius:8px;box-shadow:0 6px 16px rgba(20,30,60,0.1);max-height:150px;overflow:auto;"></div>';
  }
  h+='</div></div>'
    +'<div style="display:flex;align-items:center;gap:8px;padding:9px 10px;border-top:1px solid #ecdffc;background:#fff;">'
    +'<span style="font-size:10.5px;color:var(--text3);flex-shrink:0;">'+answeredN+'/'+qs.length+'</span>'
    +'<button onclick="_jaiClarifySubmit('+mi+')" '+(allAnswered?'':'disabled')+' style="flex:1;font-size:11.5px;font-weight:800;padding:7px 0;border:none;border-radius:7px;background:'+(allAnswered?'#7c3aed':'#d9caf5')+';color:#fff;cursor:'+(allAnswered?'pointer':'not-allowed')+';"><i class="ti ti-send" style="font-size:12px;"></i> 보내기</button>'
    +'<button onclick="_jaiClarifyCancel('+mi+')" style="flex-shrink:0;font-size:11px;color:#8a8f9c;background:none;border:none;cursor:pointer;">취소</button>'
    +'</div></div>';
  return h;
}
function _jaiClarifyTab(mi, i){
  var s=_jaiCurSession(); if(!s) return; var m=s.msgs[mi]; if(!m||!m.clarify) return;
  m.clarify.active=i; _jaiRenderChat();
}
function _jaiClarifyPickOpt(mi, qi, val){
  var s=_jaiCurSession(); if(!s) return; var m=s.msgs[mi]; if(!m||!m.clarify) return;
  window['_jaiClrFree'+mi+'_'+qi]=false;
  m.clarify.answers[qi]=val;
  var qs=m.clarify.qs||[];
  // "주간 업무" 처럼 모델과 무관한 의도를 고르면 모델명(model:true) 질문을 자동 건너뛰기 + 다음 탭으로 점프
  var _nextIdx=qi+1;
  if(qi===0 && String(val||'')==='intent:weekly'){
    for(var _qi=1;_qi<qs.length;_qi++){
      if(qs[_qi] && qs[_qi].model){ m.clarify.answers[_qi]='건너뛰기'; if(_nextIdx===_qi) _nextIdx=_qi+1; }
    }
  }
  if(_nextIdx<qs.length) m.clarify.active=_nextIdx;   // 다음 질문 탭으로 (스킵된 탭 건너뛰어 바로 그 다음)
  _jaiRenderChat();
}
function _jaiClarifyFreeToggle(mi, qi){
  var s=_jaiCurSession(); if(!s) return; var m=s.msgs[mi]; if(!m||!m.clarify) return;
  window['_jaiClrFree'+mi+'_'+qi]=true;
  if(m.clarify.answers[qi]==null) m.clarify.answers[qi]=undefined;   // 아직 값은 없지만 자유입력 모드로 전환됐음을 표시
  _jaiRenderChat();
  setTimeout(function(){ var el=document.getElementById('jai-clr-'+mi+'-'+qi); if(el) el.focus(); },30);
}
function _jaiClarifyFreeCommit(mi, qi){
  var s=_jaiCurSession(); if(!s) return; var m=s.msgs[mi]; if(!m||!m.clarify) return;
  var el=document.getElementById('jai-clr-'+mi+'-'+qi); var v=el?String(el.value||'').trim():'';
  if(!v) return;
  m.clarify.answers[qi]=v;
  var qs=m.clarify.qs||[];
  if(m.clarify.active<qs.length-1) m.clarify.active++;
  _jaiRenderChat();
}
// 직접입력이 모델 질문일 때 타이핑 검색 드롭다운(모델 후보 필터링, 클릭 선택)
function _jaiClrDD2(mi, qi){
  var s=_jaiCurSession(); if(!s) return; var m=s.msgs[mi]; if(!m||!m.clarify) return;
  var q=(m.clarify.qs||[])[qi]||{}; if(!q.model) return;
  var inp=document.getElementById('jai-clr-'+mi+'-'+qi); var dd=document.getElementById('jai-clr-'+mi+'-'+qi+'-dd');
  if(!inp||!dd) return;
  var esc=_jaiEsc;
  var query=String(inp.value||'').trim().toLowerCase();
  var arr=m.clarify.models||[];
  var hits=query?arr.filter(function(v){return String(v).toLowerCase().indexOf(query)>=0;}):arr;
  if(!hits.length){ dd.innerHTML=''; return; }
  dd.innerHTML=hits.slice(0,40).map(function(v){
    var s2=String(v);
    return '<div onmousedown="event.preventDefault();_jaiClarifyPickOpt('+mi+','+qi+',\''+s2.replace(/'/g,"\\'")+'\')" style="padding:7px 9px;font-size:11.5px;font-weight:600;color:var(--text);cursor:pointer;" onmouseenter="this.style.background=\'#f3eefe\'" onmouseleave="this.style.background=\'\'">'+esc(s2)+'</div>';
  }).join('');
}
function _jaiClarifySubmit(mi){
  var s=_jaiCurSession(); if(!s) return;
  var m=s.msgs[mi]; if(!m||!m.clarify) return;
  var qs=m.clarify.qs||[]; var answers=m.clarify.answers||[];
  var answeredN=answers.filter(function(v){return v!=null;}).length;
  if(answeredN<qs.length){ if(typeof showToast==='function') showToast('모든 질문에 답해주세요'); return; }
  // 1단계 답 처리: 도구(kb/dify:*) 이면 _jaiSel 전환, intent:* 이면 현재 어시스턴트 유지 + 힌트만 붙임
  var toolIdx=qs.findIndex(function(q){return q.tool;});
  var toolAnsVal=(toolIdx>=0)?String(answers[toolIdx]||''):'';
  var _isIntent=/^intent:/.test(toolAnsVal);
  var targetSel=(toolIdx>=0 && !_isIntent)?toolAnsVal:(m.sel||_jaiSel);
  var toolLabel=toolIdx>=0?((qs[toolIdx].toolOpts||[]).find(function(o){return o.v===toolAnsVal;})||{}).label:'';
  var textAns=[]; qs.forEach(function(q,i){ if(q.tool) return; var v=answers[i]; if(v&&v!=='건너뛰기') textAns.push(v); });
  // intent 는 UI 라벨용으로만 씀 (질문 텍스트에는 붙이지 않음). kb 모드일 땐 세션에 힌트로 저장 → 검색 소스 우선순위에 반영
  if(_isIntent && targetSel==='kb'){ s.kbIntent=toolAnsVal.replace(/^intent:/,''); }
  var combined=(String(m.clarify.origQ||'')+' '+textAns.join(' ')).replace(/\s+/g,' ').trim();
  m.content='('+(toolLabel?toolLabel+' · ':'')+textAns.join(', ')+')'; delete m.clarify;
  s.hitlDepth=(s.hitlDepth||0)+1;
  _jaiSel=targetSel;
  var qel=document.getElementById('jira-ask-q');
  if(qel){ qel.value=combined; }
  if(_jaiSel==='kb') _jaiKbAsk(); else _jaiAsstAsk();
}
function _jaiClarifyCancel(mi){
  var s=_jaiCurSession(); if(!s) return;
  var m=s.msgs[mi]; if(!m) return;
  m.content='✕ 확인을 취소했어요.'; delete m.clarify;
  s.hitlDepth=0;
  _jaiSaveSessions(); _jaiRenderChat();
}
// 질문에 첨부 문서 텍스트 합치기 — 텍스트 추출형 첨부(_jaiFile.text)를 LLM 컨텍스트로 전달
function _jaiQWithFile(q, f){
  if(f&&f.text){ return (q?q+'\n\n':'')+'[첨부 파일: '+(f.name||'파일')+' — 내용 시작]\n'+f.text+'\n[첨부 파일 끝 — 위 파일 내용을 근거로 답하라]'; }
  return q;
}
// 대화 맥락 모드 필터 — 다른 검색 모드(Jira/일반/UTOP내부/어시스턴트)에서 오간 메시지는 맥락에서 제외(모드 혼선 방지)
function _jaiHistMode(msgs, sel){ return msgs.filter(function(m){ return m.sel===sel; }); }
// 대화 맥락 필터 — 현재 질문에 모델명이 있으면, 다른 모델을 다뤘던 이전 메시지는 맥락에서 제외(모델 혼선 방지)
function _jaiHistFilter(msgs, q){
  var rx=/\b[A-Za-z]{1,3}\d{3,5}[A-Za-z0-9-]*\b/g;
  var qm=(String(q||'').match(rx)||[]).map(function(t){return t.toUpperCase();});
  if(!qm.length) return msgs;
  return msgs.filter(function(m){
    var hm=(String(m.content||'').match(rx)||[]).map(function(t){return t.toUpperCase();});
    if(!hm.length) return true;   // 모델 언급 없는 일반 대화는 유지
    return hm.some(function(t){ return qm.indexOf(t)>=0; });   // 같은 모델 언급만 유지
  });
}
// 답변 스트리밍 상태 관리 — 진행 중이면 window._jaiAbort 로 현재 AbortController 유지, 버튼은 "중지" 아이콘으로 스왑
window._jaiAbort = null;
function _jaiBtnStart(ctl){
  window._jaiAbort=ctl||null;
  var btn=document.getElementById('jira-ask-btn'); if(!btn) return;
  btn.disabled=false; btn.style.opacity='1';
  btn.style.background='#e23d4d';
  btn.style.boxShadow='0 2px 8px rgba(226,61,77,0.35)';
  btn.title='답변 중지';
  btn.innerHTML='<i class="ti ti-player-stop-filled"></i>';
}
function _jaiBtnEnd(){
  window._jaiAbort=null;
  var btn=document.getElementById('jira-ask-btn'); if(!btn) return;
  btn.disabled=false; btn.style.opacity='1';
  var _ac=(typeof _jaiAccent==='function')?_jaiAccent():'#7c3aed';
  btn.style.background=_ac;
  btn.style.boxShadow='0 2px 8px '+_ac+'4d';
  btn.title='Enter 전송 / 답변 중 클릭 시 중지';
  btn.innerHTML='<i class="ti ti-send"></i>';
}
// 보내기 버튼 클릭 라우터 — 답변 스트리밍 중이면 중지, 아니면 정상 질문 전송
function _jaiSendOrStop(){
  if(window._jaiAbort){
    try{ window._jaiAbort.abort(); }catch(e){}
    window._jaiAbort=null;
    return;
  }
  return jiraAsk();
}
async function jiraAsk(){
  // HITL 1단계 사전 필터 — 어느 모드로 진입했든, 질문 자체가 모호하면(모델명 없는 스펙/디버깅류)
  // "① 질문 의도 ② 모델명 ③ 추가질문" 3단계 되묻기 카드부터 띄운다(질문 의도 선택에 따라 최종 _jaiSel이 정해짐)
  // Jira/일반 검색은 HITL 사전 필터 대상 아님 (Jira 는 JQL·이슈키로 특정, 일반은 순수 LLM 대화)
  if(String(_jaiSel).indexOf('general:')!==0 && _jaiSel!=='jira'){
    var _qel0=document.getElementById('jira-ask-q'); var _q0=((_qel0&&_qel0.value)||'').trim();
    var _s0=_jaiCurSession();
    // HITL 재진입 방지 — 이미 clarify 로 한 번 답변 진행 중이면(_hitlDepth>=1) 프리필터 스킵
    if(_s0 && !_jaiImg && !_jaiFile && !(_s0.hitlDepth>=1)){
      var _preQs0=_jaiNeedsClarifyPre(_q0);
      if(_preQs0){
        if(_qel0){ _qel0.value=''; _qel0.style.height='auto'; }
        if(_s0.msgs.length===0){ _s0.title=_q0.slice(0,30)+(_q0.length>30?'…':''); _jaiRenderSessionList(); }
        _s0.msgs.push({role:'user',content:_q0,sel:_jaiSel,by:((typeof currentUser!=='undefined'&&currentUser&&(currentUser.name||currentUser.username))||'')});
        await _jaiClarifyPush(_s0,_preQs0,_q0);
        _jaiSaveSessions(); _jaiRenderChat();
        return;
      }
    }
  }
  if(String(_jaiSel).indexOf('general:')===0){
    var _gg=await _jaiKnowledgeSrcGlobal();
    if(_gg.general===false){ if(typeof showToast==='function') showToast('일반 gemma 검색이 AI Assistant › 지식 소스 설정에서 꺼져 있습니다'); return; }
    return _jaiGeneralAsk();
  }
  if(String(_jaiSel).indexOf('dify:')===0){ return _jaiAsstAsk(); }   // 커스텀 어시스턴트(일반형/Dify형)
  if(_jaiSel==='kb'){ return _jaiKbAsk(); }   // 내장 제품스펙·디버깅 모드 → RAG+LLM
  if(_jaiSel==='jira'){
    var _gj=await _jaiKnowledgeSrcGlobal();
    if(_gj.jira===false){ if(typeof showToast==='function') showToast('Jira 검색이 AI Assistant › 지식 소스 설정에서 꺼져 있습니다'); return; }
  }
  const qel=document.getElementById('jira-ask-q'); const q=((qel&&qel.value)||'').trim();
  const jql=((document.getElementById('jira-ask-jql')||{}).value||'').trim();
  const chatEl=document.getElementById('jai-chat-body'); const btn=document.getElementById('jira-ask-btn');
  var _img=_jaiImg?_jaiImg.dataUrl:'';
  if(!q && !_img) return;
  var _abort=new AbortController(); _jaiBtnStart(_abort);
  if(qel){ qel.value=''; qel.style.height='auto'; }
  _jaiClearImg();
  // 세션 제목 자동 설정 (첫 질문)
  var s=_jaiCurSession();
  if(s&&s.msgs.length===0){ s.title=(q||'이미지 질문').slice(0,30)+((q||'').length>30?'…':''); _jaiRenderSessionList(); }
  // 사용자 말풍선 추가
  if(s) s.msgs.push({role:'user',content:q,img:_img,sel:_jaiSel,by:((typeof currentUser!=='undefined'&&currentUser&&(currentUser.name||currentUser.username))||'')});
  _jaiRenderChat();
  // AI 응답 말풍선 (스트리밍 중 업데이트)
  var answer=''; var cited=[]; var jqlUsed=''; var jqlMode=''; var errored=false; var errMsg='';
  var t0=Date.now(); var phase='Jira 이슈 검색 중…'; var llmName='';
  _jiraAnimInit();
  function paintLive(){
    if(!chatEl) return;
    var base=(_isyncCfg&&_isyncCfg.url)?String(_isyncCfg.url).replace(/\/+$/,''):'';
    var lastBubble=chatEl.querySelector('.jai-bubble-ai:last-child .body');
    var html='';
    if(answer){
      html=_jiraRenderMd(answer)+'<span style="display:inline-block;width:2px;height:13px;background:#7c3aed;vertical-align:-2px;animation:jiraCaret 1s steps(1) infinite;margin-left:1px;"></span>';
    } else {
      html=_jiraLoadingHtml(phase, Math.floor((Date.now()-t0)/1000), llmName);
    }
    if(lastBubble){ lastBubble.innerHTML=html; chatEl.scrollTop=chatEl.scrollHeight; }
    else {
      var node=document.createElement('div'); node.className='jai-bubble-ai';
      node.innerHTML='<div class="avatar"><i class="ti ti-sparkles" style="color:#fff;font-size:13px;"></i></div><div class="body">'+html+'</div>';
      chatEl.appendChild(node); chatEl.scrollTop=chatEl.scrollHeight;
    }
  }
  var _tick=setInterval(function(){ if(!answer&&!errored) paintLive(); },1000);
  function _stopTick(){ if(_tick){clearInterval(_tick);_tick=null;} }
  paintLive();
  function handle(o){
    if(!o) return;
    if(o.meta){ cited=o.meta.cited||[]; llmName=o.meta.llm||llmName; jqlUsed=o.meta.jql||jqlUsed; jqlMode=o.meta.jql_mode||jqlMode; var cnt=o.meta.count||0; phase='이슈 '+cnt+'건 분석 · 답변 작성 중…'; paintLive(); }
    else if(o.delta!=null){ answer+=o.delta; _stopTick(); paintLive(); }
    else if(o.error){ errored=true; errMsg=String(o.error||''); _stopTick(); var node=chatEl&&chatEl.querySelector('.jai-bubble-ai:last-child .body'); if(node) node.innerHTML='<span style="color:#c0392b;">⚠ '+_jaiEsc(o.error)+'</span>'; }
    else if(o.done){ _stopTick(); }
  }
  try{
    const r=await fetch('/api/jira/ask-stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q,jql:jql,image:_img}),signal:_abort.signal});
    if(!r.ok||!r.body||!r.body.getReader){
      const d=await (await fetch('/api/jira/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q,jql:jql,image:_img}),signal:_abort.signal})).json();
      if(d&&d.ok){ answer=d.answer||''; cited=d.cited||[]; jqlUsed=d.jql||''; jqlMode=d.jql_mode||''; }
      else { errored=true; }
    } else {
      const reader=r.body.getReader(); const dec=new TextDecoder(); var buf='';
      while(true){ const rd=await reader.read(); if(rd.done) break; buf+=dec.decode(rd.value,{stream:true});
        var parts=buf.split('\n\n'); buf=parts.pop();
        for(var i=0;i<parts.length;i++){ var ev=parts[i].trim(); if(ev.indexOf('data:')!==0) continue; var ds=ev.slice(5).trim(); if(!ds) continue; try{ handle(JSON.parse(ds)); }catch(e){} }
      }
      var tail=buf.trim(); if(tail.indexOf('data:')===0){ var ds2=tail.slice(5).trim(); if(ds2){ try{ handle(JSON.parse(ds2)); }catch(e){} } }
    }
  }catch(e){
    if(e&&e.name==='AbortError'){ _stopTick(); if(!answer) answer=''; answer+=(answer?'\n\n':'')+'_(중지됨)_'; }
    else { errored=true; errMsg=e.message||String(e); var node=chatEl&&chatEl.querySelector('.jai-bubble-ai:last-child .body'); if(node) node.innerHTML='<span style="color:#c0392b;">요청 오류: '+_jaiEsc(e.message)+'</span>'; }
  }
  _stopTick();
  // 세션에 AI 답변 저장 후 최종 렌더 — 실패 시 에러를 답변으로 보존(칩만 남고 본문이 사라지는 문제 방지)
  var _final=answer;
  if(errored){ _final=(answer?answer+'\n\n':'')+'> ⚠ **답변 생성 실패:** '+(errMsg||'알 수 없는 오류')+'\n> 검색 이슈가 너무 많으면 질문을 더 구체적으로 하거나, Jira Search 설정에서 검색 이슈 수를 줄여보세요.'; }
  else if(!String(_final).trim()){ _final='> ⚠ LLM이 빈 답변을 반환했습니다. 질문을 더 구체적으로 하거나 다시 시도해 보세요.'; }
  if(s) s.msgs.push({role:'ai',content:_final,cited:cited,jql:jqlUsed,jqlMode:jqlMode,sel:_jaiSel});
  _jaiSaveSessions();
  _jaiRenderChat();
  _jaiBtnEnd();
}
// ── 제품스펙·디버깅 모드: RAG(매뉴얼·제품스펙·디버깅 지식) 검색 → 로컬 제마(gemma)가 근거와 함께 스트리밍 답변 ──
async function _jaiKbAsk(){
  const qel=document.getElementById('jira-ask-q'); const q=((qel&&qel.value)||'').trim();
  const chatEl=document.getElementById('jai-chat-body'); const btn=document.getElementById('jira-ask-btn');
  var _img=_jaiImg?_jaiImg.dataUrl:'';
  var _f=_jaiFile;   // 첨부 문서(텍스트 추출형)
  if(!q && !_img && !_f) return;
  var _abort=new AbortController(); _jaiBtnStart(_abort);
  if(qel){ qel.value=''; qel.style.height='auto'; }
  _jaiClearImg(); _jaiClearFile();
  var s=_jaiCurSession();
  if(s&&s.msgs.length===0){ s.title=(q||(_f?_f.name:'이미지 질문')).slice(0,30)+((q||'').length>30?'…':''); _jaiRenderSessionList(); }
  if(s) s.msgs.push({role:'user',content:q,img:_img,file:(_f?_f.name:''),sel:_jaiSel,by:((typeof currentUser!=='undefined'&&currentUser&&(currentUser.name||currentUser.username))||'')});
  // HITL 사전 필터 — 모델명 없는 모호한 질문이면 LLM 호출 없이 바로 되묻기. 단 재진입(hitlDepth>=1)은 스킵.
  if(s && !_img && !_f && !(s.hitlDepth>=1)){
    var _preQs=_jaiNeedsClarifyPre(q);
    if(_preQs){ await _jaiClarifyPush(s,_preQs,q); _jaiSaveSessions(); _jaiRenderChat(); if(btn){ btn.disabled=false; btn.style.opacity='1'; } return; }
  }
  _jaiRenderChat();
  var answer=''; var cited=[]; var errored=false; var t0=Date.now(); var phase='사내 지식 검색 중…'; var llmName='';
  _jiraAnimInit();
  function paintLive(){
    if(!chatEl) return;
    var lastBubble=chatEl.querySelector('.jai-bubble-ai:last-child .body');
    // RAG 컨텍스트 있으면 [CLARIFY] 태그만 벗기고 스트리밍 표시 (되묻기 로딩 대신 원문 답변)
    var _hasRag=(typeof ragCtx!=='undefined' && !!ragCtx);
    var _isClarifying=/^\s*\[CLARIFY\]/i.test(answer)&&!_hasRag;
    var _display=_hasRag?String(answer).replace(/^\s*\[CLARIFY\]\s*\r?\n?/i,''):answer;
    var html= _isClarifying ? _jiraLoadingHtml('확인이 필요한지 살펴보는 중…', Math.floor((Date.now()-t0)/1000), llmName)
            : _display ? (_jiraRenderMd(_display)+'<span style="display:inline-block;width:2px;height:13px;background:'+_jaiAccent()+';vertical-align:-2px;animation:jiraCaret 1s steps(1) infinite;margin-left:1px;"></span>')
                     : _jiraLoadingHtml(phase, Math.floor((Date.now()-t0)/1000), llmName);
    if(lastBubble){ lastBubble.innerHTML=html; chatEl.scrollTop=chatEl.scrollHeight; }
    else { var node=document.createElement('div'); node.className='jai-bubble-ai'; node.innerHTML='<div class="avatar" style="background:'+_jaiAccent()+';"><i class="ti ti-book-2" style="color:#fff;font-size:13px;"></i></div><div class="body">'+html+'</div>'; chatEl.appendChild(node); chatEl.scrollTop=chatEl.scrollHeight; }
  }
  var _tick=setInterval(function(){ if(!answer&&!errored) paintLive(); },1000);
  function _stop(){ if(_tick){clearInterval(_tick);_tick=null;} }
  paintLive();
  try{
    // 시스템 프롬프트/소스 설정: LLM 설정 › 지식 검색 AI 탭에서 편집(jira_ai) — rag_sources로 소스별 활성화+우선순위 결정
    var _paiKb=(window._pageAiCfg&&window._pageAiCfg.jira_ai)||{};
    var _defP=(typeof _pageAiDefPrompt==='function'?_pageAiDefPrompt('jira_ai'):'')||'너는 유비쿼스(Ubiquoss) 네트워크 장비 시험 자동화 전문가다. 제품 스펙, CLI/설정 방법, 디버깅·트러블슈팅 질문에 한국어로 정확하고 간결하게 답한다. CLI는 코드블록으로 표시한다. 아래 지식 소스가 관련 있으면 근거로 삼고 출처를 밝힌다.';
    // 1) 지식 소스(① TC 세부절차 ② 매뉴얼/문서 ③ Confluence)를 설정된 우선순위 순서로 검색해 ragCtx 조립.
    // rag_sources 미설정 시 기존 동작(TC+매뉴얼, Confluence 제외)으로 폴백
    var ragCtx=''; var hits=[]; var procs=[];
    var srcOrderKb=await _jaiRagSourceOrder(_paiKb, ['tc','manual']);
    // HITL에서 선택한 지식 카테고리로 소스 우선순위 조정 — 매뉴얼 우선/제품스펙(=confluence) 우선
    if(s && s.kbIntent){
      var _hint=String(s.kbIntent);
      var _boost=(_hint==='spec')?'confluence':(_hint==='manual'?'manual':'');
      if(_boost){
        if(srcOrderKb.indexOf(_boost)<0) srcOrderKb=[_boost].concat(srcOrderKb);
        else srcOrderKb=[_boost].concat(srcOrderKb.filter(function(x){return x!==_boost;}));
      }
      s.kbIntent='';   // 1회 사용 후 초기화(다음 질문은 새 HITL 흐름)
    }
    for(var _ki=0;_ki<srcOrderKb.length;_ki++){
      var _ksrc=srcOrderKb[_ki];
      if(_ksrc==='tc'){
        try{
          var _pLearn=await fetch('/api/learn/procedures?limit=300'); var _pLd=await _pLearn.json();
          var _items=(_pLd&&_pLd.items)||[];
          var _terms=String(q).toLowerCase().split(/\s+/).filter(function(t){return t.length>=2;});
          if(_terms.length&&_items.length){
            var _scored=_items.map(function(it){
              var hay=(String(it.title||'')+' '+((it.models||[]).join(' '))+' '+String(it.role||'')+' '
                +((it.steps||[]).map(function(st){return String(st.desc||'')+' '+String(st.cli||'')+' '+String(st.imageText||'');}).join(' '))).toLowerCase();
              var sc=0; _terms.forEach(function(t){ if(hay.indexOf(t)>=0) sc++; });
              return {it:it,sc:sc};
            }).filter(function(x){return x.sc>0;});
            _scored.sort(function(a,b){return b.sc-a.sc;});
            procs=_scored.slice(0,4).map(function(x){return x.it;});
          }
          if(procs.length){
            ragCtx+='\n\n【시험절차 학습 데이터 — 검증된 절차이므로 최우선 근거로 사용하고 시험항목명을 밝히세요】\n'
              +procs.map(function(it){
                var ln='· 시험항목: '+String(it.title||'')+' (모델 '+((it.models||[]).join(',')||'-')+' / 제품군 '+(it.role||'-')+')\n';
                (it.steps||[]).forEach(function(st){
                  ln+='   - '+String(st.desc||'')+': `'+String(st.cli||'')+'` [판정 '+(st.type||'')+' "'+String(st.criteria||'')+'"]';
                  if(st.imageText) ln+=' / 이미지인식: '+String(st.imageText).slice(0,150);
                  ln+='\n';
                });
                return ln;
              }).join('');
            cited=cited.concat(procs.map(function(it){ return {name:it.title,source:'시험절차'}; }));
          }
        }catch(e){}
      } else if(_ksrc==='manual'){
        try{
          var _rRag=await fetch('/api/rag/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:q,top_k:6,confluence:false,min_score:0.15})}); var _rRd=await _rRag.json();
          hits=(_rRd&&_rRd.hits)||[];
          if(hits.length){
            ragCtx+='\n\n【사내 지식 검색 결과(RAG Data 문서 발췌) — 관련 있으면 근거로 활용하고 출처(문서명)를 언급하세요. 없으면 무시하세요.】\n'
              +hits.map(function(h,i){ return '('+(i+1)+') ['+(h.source||'manual')+' · '+String(h.name||'').slice(0,60)+'] '+String(h.text||'').slice(0,600); }).join('\n');
            cited=cited.concat(hits.map(function(h){ return {name:h.name,source:h.source}; }));
          }
        }catch(e){}
      } else if(_ksrc==='confluence'){
        try{
          if(window._confLiveOn===undefined){ var _cc=await (await fetch('/api/confluence/config')).json(); window._confLiveOn=!!_cc.live_query; }
          if(window._confLiveOn){
            var _crr=await fetch('/api/confluence/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:q,limit:4})});
            var _crd=await _crr.json(); var _chits=(_crd&&_crd.hits)||[];
            if(_chits.length){
              ragCtx+='\n\n[Confluence 위키 — 제품 스펙·형상·주간업무 등, 관련 있으면 근거로 삼고 출처를 밝히세요. 본문의 ![image](URL)는 그대로 함께 보여주세요]\n'
                +_chits.map(function(h,i){ var nm=String(h.name||'').replace(/^Confluence\s*·\s*/,''); return '=== 페이지: '+nm+' ===\n'+String(h.text||'').slice(0,20000); }).join('\n\n');
              cited=cited.concat(_chits.map(function(h){ return {name:String(h.name||'').replace(/^Confluence\s*·\s*/,''),source:'confluence'}; }));
            }
          }
        }catch(e){}
      }
    }
    phase='지식 '+(hits.length+procs.length)+'건 분석 · 답변 작성 중…'; paintLive();
    // 2) 선택된 LLM 스트리밍 (드롭다운 지정 → 없으면 제마)
    var llm=(typeof _jaiPickLlm==='function')?await _jaiPickLlm():((typeof _rptGemma==='function')?await _rptGemma():null);
    if(!llm||!llm.endpoint){ throw new Error('로컬 LLM이 설정되지 않았습니다 — AI Assistant › LLM 설정 확인'); }
    llmName=llm.name||'제마';
    // 최근 대화 맥락 (같은 세션·같은 모드) — 다른 모드/다른 모델 메시지는 제외(혼선 방지)
    var hist=[]; if(s){ _jaiHistFilter(_jaiHistMode(s.msgs.slice(0,-1),_jaiSel).slice(-6), q).forEach(function(m){ hist.push({role:m.role==='ai'?'assistant':'user',content:String(m.content||'').slice(0,1500)}); }); }
    var _hitlOn=((s&&(s.hitlDepth||0))<3);
    var _hitlOn=((s&&(s.hitlDepth||0))<3);
    var sysP=((_paiKb.prompt&&String(_paiKb.prompt).trim())||_defP)+_JAI_NOTEX+_JAI_MDLRULE+(_hitlOn?_JAI_HITL:'')+ragCtx;
    var payload={ endpoint:llm.endpoint, model:llm.model, messages:[{role:'system',content:sysP}].concat(hist).concat([{role:'user',content:_jaiUserContent(_jaiQWithFile(q,_f),_img)}]), max_tokens:llm.max_tokens||2048, context_size:llm.context_size||262144, temperature:0.4, apikey:llm.apikey||'' };
    var resp=await fetch('/api/chat/local/stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:_abort.signal});
    if(resp.ok&&resp.body&&resp.body.getReader){
      // 스트리밍 파서 — chunk가 라인 중간에 쪼개져도 손실 없이 이어붙임(buf에 미완성 라인 보관)
      var reader=resp.body.getReader(); var dec=new TextDecoder(); var buf='';
      while(true){ var rc=await reader.read(); if(rc.done) break;
        buf+=dec.decode(rc.value,{stream:true});
        var nl; while((nl=buf.indexOf('\n'))>=0){ var ln=buf.slice(0,nl); buf=buf.slice(nl+1);
          if(ln.indexOf('data: ')!==0) continue; var ds=ln.slice(6); if(ds==='[DONE]') continue;
          try{ var ck=JSON.parse(ds); if(ck.text){ answer+=ck.text; _stop(); paintLive(); } }catch(e){}
        }
      }
    } else {
      // 스트리밍 불가 → 일반 응답
      var r2=await fetch('/api/chat/local',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:_abort.signal});
      var d2=await r2.json(); answer=(d2&&d2.reply)||'응답을 받지 못했습니다.'; _stop(); paintLive();
    }
  }catch(e){
    // 사용자 중지(AbortError) 는 오류 아님 — 지금까지 받은 텍스트에 "(중지됨)" 만 붙임
    if(e&&e.name==='AbortError'){ _stop(); if(!answer) answer=''; answer+=(answer?'\n\n':'')+'_(중지됨)_'; }
    else { errored=true; _stop(); var node=chatEl&&chatEl.querySelector('.jai-bubble-ai:last-child .body'); if(node) node.innerHTML='<span style="color:#c0392b;">⚠ '+_jaiEsc(e.message)+'</span>'; }
  }
  _stop();
  if(!errored){
    if(s && !(await _jaiPushClarify(s,answer,q,!!ragCtx))){ s.msgs.push({role:'ai',content:answer,cited:cited,kb:true,sel:_jaiSel}); if(s) s.hitlDepth=0; }   // 정상 답변을 받았으면 되묻기 사이클 종료 — 카운터 리셋 (RAG 컨텍스트 있으면 CLARIFY 되묻지 말고 원문 답변)
    _jaiSaveSessions(); _jaiRenderChat();
  }
  _jaiBtnEnd();
}
// AI Assistant › 지식 소스 설정(전역 On/Off) 캐시 로드 — 세션당 1회. internal 스위치가 tc/manual을 함께 통제.
async function _jaiKnowledgeSrcGlobal(){
  if(window._ksrcGlobalCache) return window._ksrcGlobalCache;
  try{ window._ksrcGlobalCache=await (await fetch('/api/knowledge-sources')).json(); }
  catch(e){ window._ksrcGlobalCache={general:true,internal:true,jira:true,confluence:true}; }
  return window._ksrcGlobalCache;
}
// 지식 소스 검색 순서 — cfg.rag_sources(LLM 설정에서 소스별 활성화+우선순위 지정) 기준.
// 설정이 없으면 fallback(호출부별 기존 동작)을 그대로 사용해 기존 어시스턴트/kb 모드 동작을 유지.
// 반환 전 전역 지식 소스 설정(_jaiKnowledgeSrcGlobal)에서 꺼진 소스는 무조건 제외.
async function _jaiRagSourceOrder(cfg, fallback){
  var rs=cfg&&cfg.rag_sources;
  var order=(!Array.isArray(rs)||!rs.length) ? (fallback||['manual','confluence']).slice()
    : rs.filter(function(x){return x&&x.enabled;}).sort(function(a,b){ return (a.priority||0)-(b.priority||0); }).map(function(x){ return x.source; });
  var g=await _jaiKnowledgeSrcGlobal();
  return order.filter(function(src){
    if(src==='tc'||src==='manual') return g.internal!==false;
    if(src==='confluence') return g.confluence!==false;
    return true;
  });
}
// 커스텀 어시스턴트(dify:<id>) 실행 — 일반형(llm+prompt+선택RAG) / Dify형(외부 ChatFlow)
async function _jaiAsstAsk(){
  var asst=_jaiCurAsst(); if(!asst){ return _jaiKbAsk(); }
  const qel=document.getElementById('jira-ask-q'); const q=((qel&&qel.value)||'').trim();
  const chatEl=document.getElementById('jai-chat-body'); const btn=document.getElementById('jira-ask-btn');
  var _img=_jaiImg?_jaiImg.dataUrl:'';
  var _f=_jaiFile;   // 문서 파일(Dify 업로드용)
  if(!q && !_img && !_f) return;
  var _abort=new AbortController(); _jaiBtnStart(_abort);
  if(qel){ qel.value=''; qel.style.height='auto'; }
  _jaiClearImg(); _jaiClearFile();
  var s=_jaiCurSession();
  if(s&&s.msgs.length===0){ s.title=(q||(_f?_f.name:'이미지 질문')).slice(0,30)+((q||'').length>30?'…':''); _jaiRenderSessionList(); }
  if(s) s.msgs.push({role:'user',content:q,img:_img,file:(_f?_f.name:''),sel:_jaiSel,by:((typeof currentUser!=='undefined'&&currentUser&&(currentUser.name||currentUser.username))||'')});
  // HITL 사전 필터 — 모델명 없는 모호한 질문이면 LLM/Dify 호출 없이 바로 되묻기. 단 재진입(hitlDepth>=1)은 스킵.
  if(s && !_img && !_f && !(s.hitlDepth>=1)){
    var _preQs=_jaiNeedsClarifyPre(q);
    if(_preQs){ await _jaiClarifyPush(s,_preQs,q); _jaiSaveSessions(); _jaiRenderChat(); _jaiBtnEnd(); return; }
  }
  _jaiRenderChat();
  var answer=''; var cited=[]; var errored=false; var t0=Date.now(); var phase='답변 준비 중…'; var llmName=asst.name||'';
  _jiraAnimInit();
  function paintLive(){
    if(!chatEl) return;
    var lastBubble=chatEl.querySelector('.jai-bubble-ai:last-child .body');
    // [CLARIFY] 로 시작해도 RAG 컨텍스트가 있으면 태그만 벗기고 스트리밍 표시 (되묻기 대신 원문 답변)
    var _hasRag=(typeof ragCtx!=='undefined' && !!ragCtx);
    var _isClarifying=(asst.type==='llm')&&/^\s*\[CLARIFY\]/i.test(answer)&&!_hasRag;
    var _display=_hasRag?String(answer).replace(/^\s*\[CLARIFY\]\s*\r?\n?/i,''):answer;
    var html= _isClarifying ? _jiraLoadingHtml('확인이 필요한지 살펴보는 중…', Math.floor((Date.now()-t0)/1000), llmName)
            : _display ? (_jiraRenderMd(_display)+'<span style="display:inline-block;width:2px;height:13px;background:'+_jaiAccent()+';vertical-align:-2px;animation:jiraCaret 1s steps(1) infinite;margin-left:1px;"></span>')
                     : _jiraLoadingHtml(phase, Math.floor((Date.now()-t0)/1000), llmName);
    if(lastBubble){ lastBubble.innerHTML=html; chatEl.scrollTop=chatEl.scrollHeight; }
    else { var node=document.createElement('div'); node.className='jai-bubble-ai'; node.innerHTML='<div class="avatar" style="background:'+_jaiAccent()+';"><i class="ti '+(asst.type==='llm'?'ti-message-chatbot':'ti-sparkles')+'" style="color:#fff;font-size:13px;"></i></div><div class="body">'+html+'</div>'; chatEl.appendChild(node); chatEl.scrollTop=chatEl.scrollHeight; }
  }
  var _tick=setInterval(function(){ if(!answer&&!errored) paintLive(); },1000);
  function _stop(){ if(_tick){clearInterval(_tick);_tick=null;} }
  paintLive();
  try{
    var hist=[]; if(s){ _jaiHistFilter(_jaiHistMode(s.msgs.slice(0,-1),_jaiSel).slice(-6), q).forEach(function(m){ hist.push({role:m.role==='ai'?'assistant':'user',content:String(m.content||'').slice(0,1500)}); }); }
    if(asst.type==='llm'){
      // 지식 소스 3종(① TC 세부절차 ② 매뉴얼/문서 RAG ③ Confluence)을 어시스턴트 설정(rag_sources)의
      // 활성화 여부·우선순위에 따라 순서대로 검색해 프롬프트에 삽입. rag_sources 미설정 시 기존 동작(매뉴얼+Confluence)으로 폴백.
      var ragCtx='';
      if(asst.rag){
        var srcCfg=await _jaiRagSourceOrder(asst, ['manual','confluence']);
        for(var _si=0;_si<srcCfg.length;_si++){
          var _src=srcCfg[_si];
          if(_src==='tc'){
            phase='시험절차 학습 데이터 검색 중…'; paintLive();
            try{
              var pr=await fetch('/api/learn/procedures?limit=300'); var pd=await pr.json();
              var pitems=(pd&&pd.items)||[];
              var pterms=String(q).toLowerCase().split(/\s+/).filter(function(t){return t.length>=2;});
              var pscored=pitems.map(function(it){
                var hay=(String(it.title||'')+' '+((it.models||[]).join(' '))+' '+String(it.role||'')+' '
                  +((it.steps||[]).map(function(sp){return String(sp.desc||'')+' '+String(sp.cli||'');}).join(' '))).toLowerCase();
                var sc=0; pterms.forEach(function(t){ if(hay.indexOf(t)>=0) sc++; });
                return {it:it,sc:sc};
              }).filter(function(x){return x.sc>0;}).sort(function(a,b){return b.sc-a.sc;});
              var procs=pscored.slice(0,4).map(function(x){return x.it;});
              if(procs.length){
                ragCtx+='\n\n【시험절차 학습 데이터 — 검증된 절차이므로 최우선 근거로 사용하고 시험항목명을 밝히세요】\n'
                  +procs.map(function(it){
                    var ln='· 시험항목: '+String(it.title||'')+' (모델 '+((it.models||[]).join(',')||'-')+' / 제품군 '+(it.role||'-')+')\n';
                    (it.steps||[]).forEach(function(sp){ ln+='   - '+String(sp.desc||'')+': `'+String(sp.cli||'')+'` [판정 '+(sp.type||'')+' "'+String(sp.criteria||'')+'"]\n'; });
                    return ln;
                  }).join('');
                cited=cited.concat(procs.map(function(it){ return {name:it.title,source:'시험절차'}; }));
              }
            }catch(e){}
          } else if(_src==='manual'){
            phase='사내 지식 검색 중…'; paintLive();
            try{ var rr=await fetch('/api/rag/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:q,top_k:6,confluence:false,min_score:0.15})}); var rd=await rr.json(); var hits=(rd&&rd.hits)||[];
              if(hits.length){ ragCtx+='\n\n[사내 지식 검색 결과 — 관련 있으면 근거로 삼고 출처를 밝히세요]\n'+hits.map(function(h,i){return '('+(i+1)+') ['+(h.source||'manual')+' · '+String(h.name||'').slice(0,60)+'] '+String(h.text||'').slice(0,600);}).join('\n'); cited=cited.concat(hits.map(function(h){return {name:h.name,source:h.source};})); }
            }catch(e){}
          } else if(_src==='confluence'){
            try{
              if(window._confLiveOn===undefined){ var cc=await (await fetch('/api/confluence/config')).json(); window._confLiveOn=!!cc.live_query; }
              if(window._confLiveOn){
                phase='Confluence 위키 검색 중…'; paintLive();
                var cr=await fetch('/api/confluence/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:q,limit:4})});
                var cd=await cr.json(); var chits=(cd&&cd.hits)||[];
                if(chits.length){
                  // 병합 hit 은 여러 페이지가 합쳐져 있으므로 slice 크게 (기본 6000/2000 → hit 별 20000 상한)
                  ragCtx+='\n\n[Confluence 위키 — 제품 스펙·디버깅·주간업무, 관련 있으면 근거로 삼고 출처를 밝히세요. 본문의 ![image](URL)는 그대로 함께 보여주세요]\n'
                    +chits.map(function(h,i){ var nm=String(h.name||'').replace(/^Confluence\s*·\s*/,''); return '=== 페이지: '+nm+' ===\n'+String(h.text||'').slice(0,20000); }).join('\n\n');
                  // hit 하나에 여러 페이지가 병합돼 온 경우(h.pages) 각 페이지를 개별 근거로 분리 저장
                  chits.forEach(function(h){
                    if(Array.isArray(h.pages)&&h.pages.length){
                      h.pages.forEach(function(p){ cited.push({name:String(p.name||'').replace(/^Confluence\s*·\s*/,''),source:'confluence',url:p.url||''}); });
                    } else {
                      cited.push({name:String(h.name||'').replace(/^Confluence\s*·\s*/,''),source:'confluence',url:h.url||''});
                    }
                  });
                }
              }
            }catch(e){}
          }
        }
      }
      phase='답변 작성 중…'; paintLive();
      var llm=(asst.llm_id&&typeof _rptLLMById==='function')?await _rptLLMById(asst.llm_id):((typeof _rptGemma==='function')?await _rptGemma():null);
      if(!llm||!llm.endpoint){ throw new Error('LLM이 설정되지 않았습니다 — LLM 설정 확인'); }
      llmName=llm.name||asst.name;
      // LLM 설정의 시스템 프롬프트만 사용 (자동 추가 규칙 없음). RAG 컨텍스트만 별도 첨부.
      var sysP=(asst.prompt&&String(asst.prompt).trim())||'너는 유용한 어시스턴트다. 한국어로 정확하고 간결하게 답한다.';
      if(ragCtx) sysP+=ragCtx;
      var payload={ endpoint:llm.endpoint, model:llm.model, messages:[{role:'system',content:sysP}].concat(hist).concat([{role:'user',content:_jaiUserContent(_jaiQWithFile(q,_f),_img)}]), max_tokens:llm.max_tokens||2048, context_size:llm.context_size||262144, temperature:0.4, apikey:llm.apikey||'' };
      // 진단: 실제로 LLM 에 보내는 프롬프트와 컨텍스트 크기 로그
      try{ console.log('[jai-asst] sysP len=', (sysP||'').length, 'ragCtx?', !!ragCtx, 'ragCtx head=', (ragCtx||'').slice(0,200)); }catch(_){}
      var resp=await fetch('/api/chat/local/stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:_abort.signal});
      if(resp.ok&&resp.body&&resp.body.getReader){
        // chunk가 라인 중간에 쪼개져도 손실 없도록 buf에 이어붙여 라인 단위로 파싱
        var reader=resp.body.getReader(); var dec=new TextDecoder(); var buf='';
        while(true){ var rc=await reader.read(); if(rc.done) break;
          buf+=dec.decode(rc.value,{stream:true});
          var nl; while((nl=buf.indexOf('\n'))>=0){ var ln=buf.slice(0,nl); buf=buf.slice(nl+1);
            if(ln.indexOf('data: ')!==0) continue; var ds=ln.slice(6); if(ds==='[DONE]') continue;
            try{ var ck=JSON.parse(ds); if(ck.text){ answer+=ck.text; _stop(); paintLive(); } }catch(e){}
          }
        }
      } else { var r2=await fetch('/api/chat/local',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:_abort.signal}); var d2=await r2.json(); answer=(d2&&d2.reply)||'응답을 받지 못했습니다.'; _stop(); paintLive(); try{ console.log('[jai-asst] non-stream answer=', JSON.stringify(answer)); }catch(_){} }
    } else {
      // Dify ChatFlow 스트리밍
      phase='Dify 어시스턴트 응답 중…'; paintLive();
      if(!s.difyConv) s.difyConv={};
      var convId=(s.difyConv&&s.difyConv[asst.id])||'';
      var _user=(typeof currentUser!=='undefined'&&currentUser&&(currentUser.username||currentUser.name))||'utop';
      // 첨부(문서 또는 캡처 이미지)가 있으면 Dify에 업로드 → 이 대화의 파일로 유지(재업로드 불필요)
      var _upSrc=(_f&&_f.file)?{blob:_f.file,name:_f.name}:(_img?{blob:_jaiDataUrlBlob(_img),name:'capture.jpg'}:null);
      if(_upSrc&&_upSrc.blob){
        phase='파일 업로드 중…'; paintLive();
        var fd=new FormData(); fd.append('assistant',asst.id); fd.append('user',_user); fd.append('file',_upSrc.blob,_upSrc.name);
        var ur=await fetch('/api/dify/upload',{method:'POST',body:fd}); var uj=await ur.json();
        if(uj&&uj.ok&&uj.id){ if(!s.difyFileByAsst)s.difyFileByAsst={}; s.difyFileByAsst[asst.id]={id:uj.id,type:uj.type||'document',name:_upSrc.name}; }
        else { throw new Error('파일 업로드 실패: '+String((uj&&uj.error)||('HTTP '+ur.status))); }
        phase='Dify 어시스턴트 응답 중…'; paintLive();
      }
      var _df=(s.difyFileByAsst&&s.difyFileByAsst[asst.id])?[{upload_file_id:s.difyFileByAsst[asst.id].id,type:s.difyFileByAsst[asst.id].type||'document'}]:[];
      var dr=await fetch('/api/dify/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({assistant:asst.id,query:q||('첨부한 파일('+((_upSrc&&_upSrc.name)||'파일')+')을 분석해줘'),conversation_id:convId,user:_user,files:_df}),signal:_abort.signal});
      if(dr.ok&&dr.body&&dr.body.getReader){
        // Dify SSE — chunk가 라인 중간에 쪼개져도 손실 없도록 buf에 이어붙여 라인 단위로 파싱
        var rdr=dr.body.getReader(); var dc=new TextDecoder(); var buf2='';
        while(true){ var r3=await rdr.read(); if(r3.done) break;
          buf2+=dc.decode(r3.value,{stream:true});
          var nl2; while((nl2=buf2.indexOf('\n'))>=0){ var l2=buf2.slice(0,nl2); buf2=buf2.slice(nl2+1);
            if(l2.indexOf('data: ')!==0) continue; var d3=l2.slice(6); if(d3==='[DONE]') continue;
            try{ var ch=JSON.parse(d3); if(ch.text){ answer+=ch.text; _stop(); paintLive(); } if(ch.conv&&s){ if(!s.difyConv)s.difyConv={}; s.difyConv[asst.id]=ch.conv; } }catch(e){}
          }
        }
      } else { var dj=await dr.json(); answer=(dj&&(dj.answer||dj.reply))||'응답을 받지 못했습니다.'; _stop(); paintLive(); }
    }
  }catch(e){
    if(e&&e.name==='AbortError'){ _stop(); if(!answer) answer=''; answer+=(answer?'\n\n':'')+'_(중지됨)_'; }
    else { errored=true; _stop(); var node=chatEl&&chatEl.querySelector('.jai-bubble-ai:last-child .body'); if(node) node.innerHTML='<span style="color:#c0392b;">⚠ '+_jaiEsc(e.message)+'</span>'; }
  }
  _stop();
  if(!errored){
    if(s && !(await _jaiPushClarify(s,answer,q,!!ragCtx))){ s.msgs.push({role:'ai',content:answer,cited:cited,kb:true,sel:_jaiSel}); if(s) s.hitlDepth=0; }   // 정상 답변을 받았으면 되묻기 사이클 종료 — 카운터 리셋 (RAG 컨텍스트 있으면 CLARIFY 되묻지 말고 원문 답변)
    _jaiSaveSessions(); _jaiRenderChat();
  }
  _jaiBtnEnd();
}
// 일반 검색 — 순수 LLM 대화 (사내지식·Jira·RAG 없이). _jaiSel='general:<llmid>'
async function _jaiGeneralAsk(){
  var llmId=(String(_jaiSel).indexOf('general:')===0)?String(_jaiSel).slice('general:'.length):'';
  const qel=document.getElementById('jira-ask-q'); const q=((qel&&qel.value)||'').trim();
  const chatEl=document.getElementById('jai-chat-body'); const btn=document.getElementById('jira-ask-btn');
  var _img=_jaiImg?_jaiImg.dataUrl:'';   // 첨부 이미지(비전)
  var _f=_jaiFile;   // 첨부 문서(텍스트 추출형)
  if(!q && !_img && !_f) return;
  var _abort=new AbortController(); _jaiBtnStart(_abort);
  if(qel){ qel.value=''; qel.style.height='auto'; }
  _jaiClearImg(); _jaiClearFile();
  var s=_jaiCurSession();
  if(s&&s.msgs.length===0){ s.title=(q||(_f?_f.name:'이미지 질문')).slice(0,30)+((q||'').length>30?'…':''); _jaiRenderSessionList(); }
  if(s) s.msgs.push({role:'user',content:q,img:_img,file:(_f?_f.name:''),sel:_jaiSel,by:((typeof currentUser!=='undefined'&&currentUser&&(currentUser.name||currentUser.username))||'')});
  _jaiRenderChat();
  var answer=''; var errored=false; var t0=Date.now(); var phase='답변 작성 중…'; var llmName='';
  _jiraAnimInit();
  function paintLive(){
    if(!chatEl) return;
    var lastBubble=chatEl.querySelector('.jai-bubble-ai:last-child .body');
    var html= answer ? (_jiraRenderMd(answer)+'<span style="display:inline-block;width:2px;height:13px;background:'+_jaiAccent()+';vertical-align:-2px;animation:jiraCaret 1s steps(1) infinite;margin-left:1px;"></span>')
                     : _jiraLoadingHtml(phase, Math.floor((Date.now()-t0)/1000), llmName);
    if(lastBubble){ lastBubble.innerHTML=html; chatEl.scrollTop=chatEl.scrollHeight; }
    else { var node=document.createElement('div'); node.className='jai-bubble-ai'; node.innerHTML='<div class="avatar" style="background:'+_jaiAccent()+';"><i class="ti ti-message-2" style="color:#fff;font-size:13px;"></i></div><div class="body">'+html+'</div>'; chatEl.appendChild(node); chatEl.scrollTop=chatEl.scrollHeight; }
  }
  var _tick=setInterval(function(){ if(!answer&&!errored) paintLive(); },1000);
  function _stop(){ if(_tick){clearInterval(_tick);_tick=null;} }
  paintLive();
  try{
    var llm=(llmId&&typeof _rptLLMById==='function')?await _rptLLMById(llmId):((typeof _rptGemma==='function')?await _rptGemma():null);
    if(!llm||!llm.endpoint){ throw new Error('LLM이 설정되지 않았습니다 — LLM 설정 확인'); }
    llmName=llm.name||'';
    var hist=[]; if(s){ _jaiHistFilter(_jaiHistMode(s.msgs.slice(0,-1),_jaiSel).slice(-8), q).forEach(function(m){ hist.push({role:m.role==='ai'?'assistant':'user',content:String(m.content||'').slice(0,2000)}); }); }
    var sysP=((llm.system_prompt&&String(llm.system_prompt).trim())||'너는 유용한 AI 어시스턴트다. 한국어로 정확하고 친절하게 답한다.')+_JAI_NOTEX+_JAI_MDLRULE;
    var payload={ endpoint:llm.endpoint, model:llm.model, messages:[{role:'system',content:sysP}].concat(hist).concat([{role:'user',content:_jaiUserContent(_jaiQWithFile(q,_f),_img)}]), max_tokens:llm.max_tokens||2048, context_size:llm.context_size||262144, temperature:(llm.temperature!=null?llm.temperature:0.7), apikey:llm.apikey||'' };
    var resp=await fetch('/api/chat/local/stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:_abort.signal});
    if(resp.ok&&resp.body&&resp.body.getReader){
      // chunk가 라인 중간에 쪼개져도 손실 없도록 buf에 이어붙여 라인 단위로 파싱
      var reader=resp.body.getReader(); var dec=new TextDecoder(); var buf='';
      while(true){ var rc=await reader.read(); if(rc.done) break;
        buf+=dec.decode(rc.value,{stream:true});
        var nl; while((nl=buf.indexOf('\n'))>=0){ var ln=buf.slice(0,nl); buf=buf.slice(nl+1);
          if(ln.indexOf('data: ')!==0) continue; var ds=ln.slice(6); if(ds==='[DONE]') continue;
          try{ var ck=JSON.parse(ds); if(ck.text){ answer+=ck.text; _stop(); paintLive(); } }catch(e){}
        }
      }
    } else { var r2=await fetch('/api/chat/local',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:_abort.signal}); var d2=await r2.json(); answer=(d2&&d2.reply)||'응답을 받지 못했습니다.'; _stop(); paintLive(); }
  }catch(e){
    if(e&&e.name==='AbortError'){ _stop(); if(!answer) answer=''; answer+=(answer?'\n\n':'')+'_(중지됨)_'; }
    else { errored=true; _stop(); var node=chatEl&&chatEl.querySelector('.jai-bubble-ai:last-child .body'); if(node) node.innerHTML='<span style="color:#c0392b;">⚠ '+_jaiEsc(e.message)+'</span>'; }
  }
  _stop();
  if(!errored){ if(s) s.msgs.push({role:'ai',content:answer,kb:true,sel:_jaiSel}); _jaiSaveSessions(); _jaiRenderChat(); }
  _jaiBtnEnd();
}
// Jira AI 답변 마크다운 렌더 — 표(| … |)·헤더(##)·불릿(-)·굵게(**)·이슈키([P-1]) 처리
function _jiraRenderMd(text){
  if(typeof _deLatex==='function') text=_deLatex(text);   // $\rightarrow$ 등 LaTeX → 유니코드(→)
  var esc=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');};
  var _safeUrl=function(u){ u=String(u||'').trim(); return /^(https?:|\/)/i.test(u)?u.replace(/"/g,'%22'):''; };
  var inl=function(s){
    s=String(s==null?'':s);
    var ph=[];
    s=s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,function(m,alt,url){ var u=_safeUrl(url); if(!u) return ''; ph.push('<img src="'+u+'" alt="'+esc(alt)+'" style="max-width:340px;max-height:260px;border-radius:8px;border:1px solid var(--border);margin:6px 0;display:block;cursor:zoom-in;" onclick="window.open(this.src)">'); return '@@PH'+(ph.length-1)+'@@'; });
    s=s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,function(m,txt,url){ var u=_safeUrl(url); if(!u) return m; ph.push('<a href="'+u+'" target="_blank" rel="noopener" style="color:#2684ff;text-decoration:underline;">'+esc(txt)+'</a>'); return '@@PH'+(ph.length-1)+'@@'; });
    // 이슈 키 [P68-1889] → Jira 하이퍼링크 (Jira 서버 URL 설정 시), 없으면 파란 강조만
    var _jb=(typeof _isyncCfg!=='undefined'&&_isyncCfg&&_isyncCfg.url)?String(_isyncCfg.url).replace(/\/+$/,''):'';
    s=esc(s).replace(/\*\*([^*]+)\*\*/g,'<b style="color:#16204a;">$1</b>')
      .replace(/\[([A-Z][A-Z0-9_]+-\d+)\]/g,function(m,k){ return _jb?('<a href="'+_jb+'/browse/'+k+'" target="_blank" rel="noopener" title="Jira에서 열기" style="color:#2684ff;font-weight:800;text-decoration:none;" onmouseenter="this.style.textDecoration=\'underline\'" onmouseleave="this.style.textDecoration=\'none\'">['+k+']</a>'):('<b style="color:#2684ff;">['+k+']</b>'); })
      .replace(/`([^`]+)`/g,'<code>$1</code>');
    return s.replace(/@@PH(\d+)@@/g,function(m,idx){ return ph[+idx]||''; });
  };
  var _src=String(text==null?'':text);
  // 코드 펜스(```lang ... ```) — 문단 중간에 오거나 여닫힘이 안 맞아도 처리, 스트리밍 중 닫힘 없이도 임시 <pre>로 표시
  // 라인 파서 앞에서 미리 분리해두면 아래 while 안에서 헤딩/불릿 등과 충돌 없이 자체 <pre> 로 렌더된다
  var _fenceRx=/```([A-Za-z0-9_+\-]*)\s*\r?\n([\s\S]*?)(?:\r?\n```|$)/g;
  var _fences=[]; _src=_src.replace(_fenceRx,function(m,lang,code){
    _fences.push({lang:String(lang||'').trim(), code:String(code||'').replace(/\r?\n$/,'')});
    return ' FENCE'+(_fences.length-1)+' ';
  });
  var _preHtml=function(idx){
    var f=_fences[idx]||{lang:'',code:''};
    var _langLbl=f.lang?('<div style="font-size:10.5px;font-weight:800;color:#8a7bb9;letter-spacing:0.5px;padding:2px 8px;background:#efe9fa;border-bottom:1px solid #dfd2f5;">'+esc(f.lang.toUpperCase())+'</div>'):'';
    var _code=esc(f.code);
    return '<div style="margin:8px 0;border:1px solid #dfd2f5;border-radius:8px;overflow:hidden;background:#faf7ff;">'
      +_langLbl
      +'<pre style="margin:0;padding:10px 12px;background:#faf7ff;color:#2a1e4a;font-family:ui-monospace,Consolas,\'Courier New\',monospace;font-size:14.5px;line-height:1.65;white-space:pre-wrap;word-break:break-all;overflow-x:auto;">'+_code+'</pre>'
      +'</div>';
  };
  var lines=_src.split(/\r?\n/);
  var isRow=function(l){ return /^\s*\|.*\|\s*$/.test(l); };
  var isSepRow=function(cells){ return cells.length && cells.every(function(c){var t=c.trim();return t===''||/^:?-+:?$/.test(t);}) && cells.some(function(c){return /-/.test(c);}); };
  var _fenceLineRx=/^\s* FENCE(\d+) \s*$/;
  var out=''; var i=0;
  while(i<lines.length){
    var l=lines[i];
    var _fm=l.match(_fenceLineRx);
    if(_fm){ out+=_preHtml(+_fm[1]); i++; continue; }
    if(isRow(l)){
      var block=[]; while(i<lines.length && isRow(lines[i])){ block.push(lines[i]); i++; }
      var rows=block.map(function(r){ return r.trim().replace(/^\|/,'').replace(/\|\s*$/,'').split('|').map(function(c){return c.trim();}); });
      var sepIdx=-1; for(var k=0;k<rows.length;k++){ if(isSepRow(rows[k])){ sepIdx=k; break; } }
      var head=(sepIdx>0)?rows.slice(0,sepIdx):[]; var body=(sepIdx>=0)?rows.slice(sepIdx+1):rows;
      var t='<table style="border-collapse:collapse;font-size:15px;margin:8px 0;width:100%;table-layout:auto;">';
      head.forEach(function(hr){ t+='<tr>'+hr.map(function(c){return '<th style="border:1px solid #d9c9f7;padding:4px 8px;background:#f1ebfb;color:#5b2db0;text-align:left;white-space:nowrap;">'+inl(c)+'</th>';}).join('')+'</tr>'; });
      body.forEach(function(br){ t+='<tr>'+br.map(function(c){return '<td style="border:1px solid #e6ddf5;padding:4px 8px;color:#1c2230;vertical-align:top;word-break:break-word;">'+inl(c)+'</td>';}).join('')+'</tr>'; });
      out+=t+'</table>';
    } else {
      var hm=l.match(/^\s*#{1,6}\s*(.+?)\s*$/); var bm=l.match(/^\s*[-*]\s+(.+?)\s*$/);
      if(hm){ out+='<div style="font-weight:800;font-size:17px;color:#5b2db0;margin:14px 0 5px;border-bottom:1px solid #ece3fb;padding-bottom:4px;">'+inl(hm[1])+'</div>'; }
      else if(bm){ out+='<div style="margin:2px 0 2px 6px;padding-left:14px;text-indent:-12px;line-height:1.85;"><span style="color:#7c3aed;font-weight:800;">·</span> '+inl(bm[1])+'</div>'; }
      else if(l.trim()===''){ out+='<div style="height:6px;"></div>'; }
      else { out+='<div style="line-height:1.85;">'+inl(l)+'</div>'; }
      i++;
    }
  }
  // 인라인으로 남은 fence 마커 치환(문장 중간 포함) — inl() 이 이스케이프한 형태로도 대응
  out=out.replace(/ FENCE(\d+) /g,function(m,idx){ return _preHtml(+idx); });
  return out||'(빈 답변)';
}
async function _isyncLoadProjects(){
  const sel=document.getElementById('isync-proj'); if(!sel) return;
  let pre=''; try{ pre=localStorage.getItem('utop_isync_proj')||''; }catch(e){}
  if(!pre) pre=_isyncCfg.default_project||'';
  sel.innerHTML='<option value="">로드 중…</option>';
  try{
    const d=await (await fetch('/api/jira/projects')).json();
    if(!d.ok){ sel.innerHTML='<option value="">실패: '+String(d.error||'').slice(0,60)+'</option>'; return; }
    const favs=(_isyncCfg&&_isyncCfg.fav_projects)||[];
    let list=(favs.length? (d.projects||[]).filter(p=>favs.indexOf(p.key)>=0) : (d.projects||[]).slice());
    list.sort((a,b)=>String(a.key).localeCompare(String(b.key),undefined,{numeric:true}));
    sel.innerHTML='<option value="">(프로젝트 선택)</option>'+list.map(p=>'<option value="'+p.key+'"'+(pre===p.key?' selected':'')+'>'+p.key+' · '+String(p.name).replace(/</g,'&lt;')+'</option>').join('');
    if(pre && list.some(p=>p.key===pre)){ isyncLoadStored(pre); }   // 진입 시 저장본 로드(Jira 호출 X)
  }catch(e){ sel.innerHTML='<option value="">오류: '+e.message+'</option>'; }
}
async function isyncSync(full){
  const sel=document.getElementById('isync-proj'); const key=sel?sel.value:'';
  const listEl=document.getElementById('isync-list');
  if(!key){ if(typeof showToast==='function')showToast('프로젝트를 선택하세요'); return; }
  try{ localStorage.setItem('utop_isync_proj',key); }catch(e){}
  if(listEl) listEl.innerHTML='<div style="padding:30px;text-align:center;color:var(--text3);"><i class="ti ti-loader"></i> '+key+(full?' 전체':' 변경분')+' 동기화 중… (Jira에서 가져와 utop에 저장)</div>';
  const fields=_isyncFieldsParam(_isyncCols());
  try{
    const d=await (await fetch('/api/issues/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:key,fields:fields,full:!!full})})).json();
    if(!d.ok){ if(listEl)listEl.innerHTML='<div style="padding:24px;color:#e23d4d;font-size:13px;">동기화 실패: '+String(d.error||'').replace(/</g,'&lt;')+'</div>'; return; }
    _isyncIssues=d.issues||[];
    await _isyncLoadDefect();
    _isyncMetaRender(key,d); _isyncRender();
    if(typeof showToast==='function')showToast((d.mode==='full'?'전체 동기화':'증분 동기화')+' · 신규 '+d.added+' / 변경 '+d.updated+' / 총 '+d.total);
  }catch(e){ if(listEl)listEl.innerHTML='<div style="padding:24px;color:#e23d4d;">요청 오류: '+e.message+'</div>'; }
}
async function isyncLoadStored(key){
  const sel=document.getElementById('isync-proj'); if(key==null)key=sel?sel.value:'';
  const listEl=document.getElementById('isync-list'); const metaEl=document.getElementById('isync-meta');
  if(!key){ _isyncIssues=[]; if(listEl)listEl.innerHTML='<div style="padding:30px;text-align:center;color:var(--text3);font-size:13px;">프로젝트를 선택하세요.</div>'; if(metaEl)metaEl.textContent=''; return; }
  try{ localStorage.setItem('utop_isync_proj',key); }catch(e){}
  if(listEl) listEl.innerHTML='<div style="padding:24px;text-align:center;color:var(--text3);"><i class="ti ti-loader"></i> 저장된 데이터 불러오는 중…</div>';
  try{
    const d=await (await fetch('/api/issues/'+encodeURIComponent(key))).json();
    _isyncIssues=(d&&d.issues)||[];
    await _isyncLoadDefect();   // 분류 데이터 로드(스키마+저장분류)
    if(_isyncIssues.length){ _isyncMetaRender(key,d); _isyncRender(); }
    else { if(listEl)listEl.innerHTML='<div style="padding:30px;text-align:center;color:var(--text3);font-size:13px;"><i class="ti ti-database-off" style="font-size:18px;"></i><br>저장된 데이터가 없습니다. <b>동기화</b> 또는 <b>전체</b>를 눌러 가져오세요.</div>'; if(metaEl)metaEl.textContent=''; }
  }catch(e){ _isyncIssues=[]; if(listEl)listEl.innerHTML='<div style="padding:24px;color:#e23d4d;">불러오기 오류: '+e.message+'</div>'; }
}
function _isyncMetaRender(key,d){
  const metaEl=document.getElementById('isync-meta'); if(!metaEl)return;
  const ls=(d&&d.last_synced_at)||''; const tot=(d&&d.total!=null)?d.total:((d&&d.count!=null)?d.count:_isyncIssues.length);
  const chg=(d&&(d.added!=null||d.updated!=null))?(' · <span style="color:#2684ff;">신규 '+(d.added||0)+' · 변경 '+(d.updated||0)+'</span>'):'';
  metaEl.innerHTML='<b style="color:var(--text2);">'+key+'</b> · 저장 '+tot+'건'+chg+' · '+(ls?('최근 동기화 '+ls):'<span style="color:#e8820c;">동기화 이력 없음</span>');
}// 호환
function isyncFilter(){ _isyncRender(); }
function _isyncRenderColbar(){
  const bar=document.getElementById('isync-colbar'); if(!bar) return;
  const cols=_isyncCols();
  bar.innerHTML='<span style="font-size:11px;color:var(--text3);font-weight:700;">컬럼:</span>'+cols.map((c,i)=>'<span data-ci="'+i+'" draggable="true" ondragstart="_isyncColDragStart(event,'+i+')" ondragover="_isyncColDragOver(event,'+i+')" ondragleave="_isyncColDragLeave(event)" ondrop="_isyncColDrop(event,'+i+')" ondragend="_isyncColDragEnd(event)" title="드래그하여 순서 변경" style="display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:600;padding:3px 5px 3px 6px;border-radius:14px;background:#eef3fb;color:#2d6fd4;border:1px solid #cfe0f5;cursor:grab;user-select:none;transition:box-shadow .08s;"><i class="ti ti-grip-vertical" style="font-size:12px;color:#9fb4d4;margin-right:-2px;pointer-events:none;"></i>'+String(c.label).replace(/</g,'&lt;')+(c.id==='key'?'':'<i class="ti ti-x" onclick="isyncRemoveCol('+i+')" title="컬럼 제거" style="cursor:pointer;font-size:13px;color:#7e97bd;"></i>')+'</span>').join('')+'<button onclick="isyncFieldPicker()" style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:14px;border:1px dashed #2684ff;background:#fff;color:#2684ff;cursor:pointer;">+ 필드</button>';
}
// ── 컬럼 칩 드래그 재정렬 (드롭 위치 기준으로 배열·표 재배치) ──
var _isyncDragCol=-1;
function _isyncColDragStart(e,i){ _isyncDragCol=i; try{ e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain',String(i)); }catch(_){} }
function _isyncColDragOver(e,i){ e.preventDefault(); try{ e.dataTransfer.dropEffect='move'; }catch(_){} const t=e.currentTarget; if(t && _isyncDragCol>=0 && _isyncDragCol!==i){ t.style.boxShadow=(i>_isyncDragCol?'inset -3px 0 0 #2684ff':'inset 3px 0 0 #2684ff'); } }
function _isyncColDragLeave(e){ const t=e.currentTarget; if(t) t.style.boxShadow=''; }
function _isyncColDragEnd(e){ _isyncDragCol=-1; const bar=document.getElementById('isync-colbar'); if(bar) bar.querySelectorAll('[data-ci]').forEach(function(x){ x.style.boxShadow=''; }); }
function _isyncColDrop(e,i){ e.preventDefault(); const from=_isyncDragCol; _isyncDragCol=-1; const cols=_isyncCols(); if(from<0||from>=cols.length||i<0||i>=cols.length||from===i){ _isyncRenderColbar(); return; } const moved=cols.splice(from,1)[0]; cols.splice(i,0,moved); _isyncColsSave(cols); _isyncRenderColbar(); _isyncRender(); if(typeof showToast==='function')showToast('컬럼 순서 변경: '+moved.label); }
function isyncRemoveCol(i){ const cols=_isyncCols(); if(i<0||i>=cols.length||cols[i].id==='key') return; cols.splice(i,1); _isyncColsSave(cols); _isyncRenderColbar(); _isyncRender(); }
// ISO 8601 datetime 문자열(예: "2026-07-14T18:04:33.000+0900")을 감지하여 YYYY-MM-DD 부분만 반환.
// Jira의 created/updated/duedate 등 날짜 필드가 사람 친화적으로 보이도록.
function _isyncDateShort(s){
  var _s=String(s||'');
  var _m=_s.match(/^(\d{4}-\d{2}-\d{2})T/);
  return _m ? _m[1] : _s;
}
function _isyncFmt(v){
  if(v==null) return '';
  if(typeof v==='string') return _isyncDateShort(v);
  if(typeof v==='number'||typeof v==='boolean') return String(v);
  if(Array.isArray(v)) return v.map(_isyncFmt).filter(function(x){return x!=='';}).join(', ');
  if(typeof v==='object') return String(v.displayName||v.name||v.value||v.key||v.emailAddress||(v.fields&&v.fields.summary)||'');
  return '';
}
function _isyncCell(it, colId){
  if(colId==='key') return it.key||'';
  const f=it.fields||{};
  if(colId==='project'){ const p=f.project||{}; return p.key||p.name||''; }
  return _isyncFmt(f[colId]);
}
function _isyncFilteredRows(){
  const q=((document.getElementById('isync-search')||{}).value||'').toLowerCase().trim();
  if(!q) return _isyncIssues.slice();
  const cols=_isyncCols();
  return _isyncIssues.filter(function(it){ const hay=cols.map(function(c){return _isyncCell(it,c.id);}).join(' ').toLowerCase(); return hay.indexOf(q)>=0; });
}
// ── Defect 분류 (현장장애/상용망검증) ──
var _defClass={}, _defSchema=null;
async function _isyncLoadDefect(){
  try{ if(!_defSchema){ _defSchema=await (await fetch('/api/jira/defect/schema')).json(); } }catch(e){ _defSchema=null; }
  try{ var d=await (await fetch('/api/jira/defect/class')).json(); _defClass=(d&&d.classes)||{}; }catch(e){ _defClass={}; }
}
function _defOf(key){ return _defClass[key]||{}; }
function _defBadge(txt,color,bg){ if(!txt)return '<span style="color:#c5cbd6;">-</span>'; return '<span style="font-size:10.5px;font-weight:700;color:'+color+';background:'+bg+';border-radius:9px;padding:1px 8px;white-space:nowrap;">'+String(txt).replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</span>'; }
function _defSrcBadge(s){ if(s==='현장장애')return _defBadge('현장장애','#c0392b','rgba(192,57,43,0.1)'); if(s==='상용망검증')return _defBadge('상용망검증','#2d6fd4','rgba(45,111,212,0.1)'); return '<span style="color:#c5cbd6;">미분류</span>'; }
// 이슈 행에 분류 셀들(발생상황·유형·카테고리·항목) — 클릭 시 수동 편집
function _defCells(key){
  var c=_defOf(key); var e=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');};
  var wrap=function(inner){ return '<td style="padding:6px 8px;white-space:nowrap;cursor:pointer;" onclick="isyncDefectEdit(\''+e(key)+'\')" title="클릭: 분류 수정">'+inner+'</td>'; };
  return wrap(_defSrcBadge(c.source))
    + wrap(_defBadge(c.device,'#7c3aed','rgba(124,58,237,0.1)'))
    + wrap(_defBadge(c.category,'#00875a','rgba(0,168,114,0.1)'))
    + wrap(c.source==='상용망검증'?(_defBadge(c.item,'#e8820c','rgba(232,130,12,0.12)')+' '+_defBadge(c.type3,'#0d9488','rgba(13,148,136,0.12)')):'<span style="color:#c5cbd6;">-</span>');
}
function _isyncRender(){
  const listEl=document.getElementById('isync-list'); if(!listEl) return;
  const cols=_isyncCols();
  const base=(_isyncCfg.url||'').replace(/\/+$/,'');
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  if(!_isyncIssues.length){ listEl.innerHTML='<div style="padding:30px;text-align:center;color:var(--text3);font-size:13px;">동기화된 이슈가 없습니다.</div>'; return; }
  const rows=_isyncFilteredRows();
  const _stCol=c=>c==='done'?'#00875a':c==='indeterminate'?'#2d6fd4':'#6b7280';
  const _stBg=c=>c==='done'?'rgba(0,168,114,0.14)':c==='indeterminate'?'rgba(45,111,212,0.14)':'rgba(107,114,128,0.14)';
  const th=t=>'<th style="text-align:left;padding:8px 10px;font-size:11.5px;font-weight:700;color:#3a4254;background:#eef1f5;border-bottom:1px solid #c4cad3;white-space:nowrap;position:sticky;top:0;">'+esc(t)+'</th>';
  var _defHead='<th style="text-align:left;padding:8px 10px;font-size:11.5px;font-weight:700;color:#5b2db0;background:#f3eefe;border-bottom:1px solid #d9cdf0;white-space:nowrap;position:sticky;top:0;">';
  const head='<thead><tr>'+cols.map(c=>th(c.label)).join('')+_defHead+'발생상황</th>'+_defHead+'유형</th>'+_defHead+'카테고리</th>'+_defHead+'항목/유형(상용망)</th></tr></thead>';
  const body=rows.map(function(it){ const f=it.fields||{};
    const tds=cols.map(function(c){
      if(c.id==='key'){ const link=base?(base+'/browse/'+it.key):''; return '<td style="padding:7px 10px;white-space:nowrap;">'+(link?'<a href="'+link+'" target="_blank" rel="noopener" style="color:#2684ff;font-weight:700;font-family:ui-monospace,monospace;text-decoration:none;">'+esc(it.key)+'</a>':'<b>'+esc(it.key)+'</b>')+'</td>'; }
      if(c.id==='status'){ const cat=(f.status&&f.status.statusCategory&&f.status.statusCategory.key)||''; const nm=(f.status&&f.status.name)||''; return '<td style="padding:7px 10px;white-space:nowrap;"><span style="font-size:11px;font-weight:700;padding:2px 9px;border-radius:20px;background:'+_stBg(cat)+';color:'+_stCol(cat)+';">'+esc(nm)+'</span></td>'; }
      if(c.id==='summary'){ return '<td style="padding:7px 10px;font-size:12.5px;color:var(--text);min-width:240px;">'+esc(_isyncCell(it,c.id))+'</td>'; }
      return '<td style="padding:7px 10px;font-size:12px;color:var(--text2);white-space:nowrap;">'+esc(_isyncCell(it,c.id))+'</td>';
    }).join('');
    return '<tr style="border-bottom:1px solid #eef0f3;">'+tds+_defCells(it.key)+'</tr>';
  }).join('');
  listEl.innerHTML='<div style="border:1px solid var(--border);border-radius:10px;overflow:auto;max-height:calc(100vh - 290px);background:#fff;"><table style="width:100%;border-collapse:collapse;">'+head+'<tbody>'+(body||'<tr><td colspan="'+(cols.length+4)+'" style="padding:24px;text-align:center;color:var(--text3);">검색 결과 없음</td></tr>')+'</tbody></table></div>';
}
// ── LLM 자동 분류 (현재 목록 이슈) ──
async function isyncDefectClassify(){
  var rows=(typeof _isyncFilteredRows==='function')?_isyncFilteredRows():(_isyncIssues||[]);
  var keys=rows.map(function(it){return it.key;}).filter(Boolean);
  if(!keys.length){ if(typeof showToast==='function')showToast('분류할 이슈가 없습니다'); return; }
  var ow=confirm(keys.length+'개 이슈를 LLM으로 자동 분류합니다.\n\n[확인] = 이미 분류된 것도 다시(덮어쓰기)\n[취소] = 미분류만 분류');
  var btn=document.getElementById('isync-defbtn'); if(btn){ btn.disabled=true; btn.style.opacity='0.6'; btn.innerHTML='<i class="ti ti-loader"></i> 분류 중…'; }
  try{
    var d=await (await fetch('/api/jira/defect/classify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({keys:keys, overwrite:ow})})).json();
    if(d&&d.ok){ await _isyncLoadDefect(); _isyncRender(); if(typeof showToast==='function')showToast('LLM 분류 완료: '+(d.classified||0)+'건'+(d.failed&&d.failed.length?(' · 실패 '+d.failed.length):'')+(d.llm?(' ('+d.llm+')'):'')); }
    else { if(typeof showToast==='function')showToast('분류 실패: '+String((d&&d.error)||(d&&d.detail)||'').slice(0,120)); }
  }catch(e){ if(typeof showToast==='function')showToast('분류 오류: '+e.message); }
  if(btn){ btn.disabled=false; btn.style.opacity='1'; btn.innerHTML='<i class="ti ti-robot"></i> LLM 분류'; }
}
// ── 수동 분류 편집 (팝업) ──
function isyncDefectEdit(key){
  var c=_defOf(key); var S=_defSchema||{}; var e=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;');};
  var opt=function(list,cur){ return '<option value="">-</option>'+(list||[]).map(function(x){return '<option'+(x===cur?' selected':'')+'>'+e(x)+'</option>';}).join(''); };
  var old=document.getElementById('def-edit-modal'); if(old)old.remove();
  var m=document.createElement('div'); m.id='def-edit-modal'; m.className='modal-overlay'; m.style.display='flex'; m.style.zIndex='100060';
  var sel='width:100%;font-size:13px;padding:7px 9px;border:1.5px solid var(--border);border-radius:7px;background:#fff;cursor:pointer;box-sizing:border-box;';
  var lb='font-size:11px;color:var(--text3);font-weight:700;display:block;margin:9px 0 3px;';
  m.innerHTML='<div class="modal" style="width:420px;max-width:94vw;border-radius:13px;padding:0;overflow:hidden;">'+
    '<div style="padding:12px 16px;border-bottom:1px solid var(--border);background:#f3eefe;display:flex;align-items:center;gap:8px;"><i class="ti ti-tag" style="color:#7c3aed;"></i><b style="font-size:14px;">Defect 분류 — '+e(key)+'</b><span style="flex:1;"></span><button onclick="document.getElementById(\'def-edit-modal\').remove()" style="width:26px;height:26px;border:1px solid var(--border);border-radius:6px;background:#fff;cursor:pointer;"><i class="ti ti-x"></i></button></div>'+
    '<div style="padding:14px 16px;">'+
      '<label style="'+lb+'">발생상황</label><select id="def-src" onchange="_defEditSrcChange()" style="'+sel+'"><option value="">-</option><option'+(c.source==='현장장애'?' selected':'')+'>현장장애</option><option'+(c.source==='상용망검증'?' selected':'')+'>상용망검증</option></select>'+
      '<label style="'+lb+'">유형(장비)</label><select id="def-dev" style="'+sel+'">'+opt(S.device,c.device)+'</select>'+
      '<label style="'+lb+'">카테고리</label><select id="def-cat" style="'+sel+'"></select>'+
      '<div id="def-live" style="display:'+(c.source==='상용망검증'?'block':'none')+';">'+
        '<label style="'+lb+'">항목(상용망)</label><select id="def-item" style="'+sel+'">'+opt(S.item,c.item)+'</select>'+
        '<label style="'+lb+'">유형(상용망)</label><select id="def-type3" style="'+sel+'">'+opt(S.type3,c.type3)+'</select>'+
      '</div>'+
    '</div>'+
    '<div style="padding:11px 16px;border-top:1px solid var(--border);background:#fafbfc;display:flex;gap:8px;justify-content:flex-end;"><button onclick="document.getElementById(\'def-edit-modal\').remove()" style="font-size:13px;padding:7px 15px;border-radius:7px;border:1px solid var(--border);background:#fff;cursor:pointer;">취소</button><button onclick="isyncDefectEditSave(\''+e(key)+'\')" style="font-size:13px;padding:7px 18px;border-radius:7px;border:none;background:#7c3aed;color:#fff;cursor:pointer;font-weight:700;">저장</button></div>'+
  '</div>';
  document.body.appendChild(m); window._defEditCur=c; _defEditSrcChange();
}
function _defEditSrcChange(){ var S=_defSchema||{}; var src=(document.getElementById('def-src')||{}).value||''; var cur=window._defEditCur||{};
  var live=document.getElementById('def-live'); if(live)live.style.display=(src==='상용망검증')?'block':'none';
  var catList=(src==='상용망검증')?(S.category_live||[]):(S.category_field||[]);
  var csel=document.getElementById('def-cat'); if(csel){ var cv=cur.category||''; csel.innerHTML='<option value="">-</option>'+catList.map(function(x){return '<option'+(x===cv?' selected':'')+'>'+String(x).replace(/</g,'&lt;')+'</option>';}).join(''); } }
async function isyncDefectEditSave(key){
  var g=function(id){ var el=document.getElementById(id); return el?el.value:''; };
  var cls={source:g('def-src'),device:g('def-dev'),category:g('def-cat'),item:g('def-item'),type3:g('def-type3')};
  try{ var d=await (await fetch('/api/jira/defect/class',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:key,class:cls})})).json();
    if(d&&d.ok){ _defClass[key]=d.class; var md=document.getElementById('def-edit-modal'); if(md)md.remove(); _isyncRender(); if(typeof showToast==='function')showToast('분류 저장됨'); }
    else if(typeof showToast==='function')showToast('저장 실패');
  }catch(e){ if(typeof showToast==='function')showToast('저장 오류: '+e.message); }
}
// ── 분류 집계 팝업 ──
function isyncDefectStats(){
  var rows=(typeof _isyncFilteredRows==='function')?_isyncFilteredRows():(_isyncIssues||[]);
  var g={현장장애:{},상용망검증:{},미분류:0}; var byDev={}, byCat={}, byItem={}, tot=0, cnt=0;
  rows.forEach(function(it){ var c=_defOf(it.key); tot++; var s=c.source||''; if(!s){g.미분류++;return;} cnt++;
    g[s]=g[s]||{}; if(c.device){byDev[c.device]=(byDev[c.device]||0)+1;} if(c.category){byCat[c.category]=(byCat[c.category]||0)+1;} if(c.item){byItem[c.item]=(byItem[c.item]||0)+1;} });
  var e=function(s){return String(s==null?'':s).replace(/</g,'&lt;');};
  var kv=function(obj){ var ks=Object.keys(obj); if(!ks.length)return '<span style="color:#c5cbd6;">-</span>'; return ks.sort().map(function(k){return '<span style="display:inline-block;font-size:11.5px;margin:2px 5px 2px 0;padding:2px 9px;border-radius:9px;background:#eef2f7;color:#3a4254;">'+e(k)+' <b style="color:#2d6fd4;">'+obj[k]+'</b></span>';}).join(''); };
  var srcCnt={현장장애:0,상용망검증:0}; rows.forEach(function(it){var s=_defOf(it.key).source; if(s&&srcCnt[s]!=null)srcCnt[s]++;});
  var old=document.getElementById('def-stats-modal'); if(old)old.remove();
  var m=document.createElement('div'); m.id='def-stats-modal'; m.className='modal-overlay'; m.style.display='flex'; m.style.zIndex='100060';
  m.innerHTML='<div class="modal" style="width:560px;max-width:94vw;max-height:88vh;border-radius:13px;padding:0;overflow:hidden;display:flex;flex-direction:column;">'+
    '<div style="padding:12px 16px;border-bottom:1px solid var(--border);background:#f3eefe;display:flex;align-items:center;gap:8px;"><i class="ti ti-chart-bar" style="color:#7c3aed;"></i><b style="font-size:14px;">Defect 분류 집계</b><span style="flex:1;"></span><button onclick="document.getElementById(\'def-stats-modal\').remove()" style="width:26px;height:26px;border:1px solid var(--border);border-radius:6px;background:#fff;cursor:pointer;"><i class="ti ti-x"></i></button></div>'+
    '<div style="padding:16px;overflow:auto;font-size:13px;line-height:1.7;">'+
      '<div style="margin-bottom:12px;"><b>발생상황</b> · 전체 '+tot+'건 (분류 '+cnt+' / 미분류 '+(tot-cnt)+')<br>'+
        '<span style="display:inline-block;margin:4px 8px 0 0;padding:3px 11px;border-radius:9px;background:rgba(192,57,43,0.1);color:#c0392b;font-weight:700;">현장장애 '+srcCnt.현장장애+'</span>'+
        '<span style="display:inline-block;margin:4px 8px 0 0;padding:3px 11px;border-radius:9px;background:rgba(45,111,212,0.1);color:#2d6fd4;font-weight:700;">상용망검증 '+srcCnt.상용망검증+'</span></div>'+
      '<div style="margin-bottom:12px;"><b>유형(장비)</b><br>'+kv(byDev)+'</div>'+
      '<div style="margin-bottom:12px;"><b>카테고리</b><br>'+kv(byCat)+'</div>'+
      '<div><b>항목(상용망)</b><br>'+kv(byItem)+'</div>'+
    '</div></div>';
  document.body.appendChild(m);
}
// ── 엑셀(CSV) 내보내기 — 현재 컬럼·필터 기준 ──
function isyncExport(){
  if(!_isyncIssues.length){ if(typeof showToast==='function')showToast('먼저 동기화하세요'); return; }
  const cols=_isyncCols(); const rows=_isyncFilteredRows();
  const cq=function(s){ s=String(s==null?'':s); return /[",\n\r]/.test(s)?('"'+s.replace(/"/g,'""')+'"'):s; };
  let csv=cols.map(function(c){return cq(c.label);}).join(',')+'\r\n';
  rows.forEach(function(it){ csv+=cols.map(function(c){return cq(_isyncCell(it,c.id));}).join(',')+'\r\n'; });
  const proj=(document.getElementById('isync-proj')||{}).value||'jira';
  let ts=''; try{ ts=new Date().toISOString().slice(0,10); }catch(e){}
  const blob=new Blob([String.fromCharCode(0xFEFF)+csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='issues_'+proj+(ts?('_'+ts):'')+'.csv'; document.body.appendChild(a); a.click(); setTimeout(function(){ try{ URL.revokeObjectURL(a.href); a.remove(); }catch(e){} },120);
  if(typeof showToast==='function')showToast('CSV '+rows.length+'건 내보냄 (엑셀에서 열기)');
}
// ── 필드/컬럼 구성 모달 (Jira 필드 목록에서 추가) ──
async function isyncFieldPicker(){
  const old=document.getElementById('isync-field-modal'); if(old)old.remove();
  const m=document.createElement('div'); m.id='isync-field-modal';
  m.style.cssText='position:fixed;inset:0;background:rgba(15,20,30,0.5);z-index:100004;display:flex;align-items:center;justify-content:center;';
  m.innerHTML='<div style="background:#fff;width:min(560px,95vw);max-height:88vh;border-radius:14px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 24px 70px rgba(0,0,0,0.35);">'+
    '<div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:9px;"><i class="ti ti-columns-3" style="color:#2684ff;font-size:19px;"></i><b style="font-size:15px;flex:1;">필드/컬럼 구성</b><button onclick="document.getElementById(\'isync-field-modal\').remove()" style="width:28px;height:28px;border-radius:7px;border:none;background:#eef1f5;cursor:pointer;"><i class="ti ti-x"></i></button></div>'+
    '<div style="padding:12px 18px;border-bottom:1px solid var(--border);"><div style="font-size:11.5px;color:var(--text3);font-weight:700;margin-bottom:6px;">현재 컬럼 (추가하면 다시 동기화 시 값이 채워집니다)</div><div id="isync-cur-cols" style="display:flex;gap:6px;flex-wrap:wrap;"></div></div>'+
    '<div style="padding:10px 18px 4px;"><input id="isync-field-search" oninput="_isyncFieldFilter()" placeholder="필드 검색…" style="width:100%;font-size:13px;padding:8px 11px;border:1px solid var(--border);border-radius:8px;outline:none;box-sizing:border-box;"></div>'+
    '<div id="isync-field-list" style="flex:1;overflow:auto;padding:6px 18px 14px;font-size:13px;color:var(--text3);">필드 목록 불러오는 중…</div>'+
  '</div>';
  document.body.appendChild(m);
  _isyncRenderCurCols();
  if(!_isyncFields){ try{ const d=await (await fetch('/api/jira/fields')).json(); _isyncFields=(d.ok&&d.fields)?d.fields:[]; }catch(e){ _isyncFields=[]; } }
  _isyncRenderFieldList();
}
function _isyncRenderCurCols(){
  const box=document.getElementById('isync-cur-cols'); if(!box) return;
  box.innerHTML=_isyncCols().map((c,i)=>'<span style="display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:600;padding:3px 5px 3px 9px;border-radius:14px;background:#eef3fb;color:#2d6fd4;border:1px solid #cfe0f5;">'+String(c.label).replace(/</g,'&lt;')+(c.id==='key'?'':'<i class="ti ti-x" onclick="isyncRemoveCol('+i+');_isyncRenderCurCols();_isyncRenderFieldList();" style="cursor:pointer;font-size:13px;color:#7e97bd;"></i>')+'</span>').join('');
}
function _isyncRenderFieldList(){
  const box=document.getElementById('isync-field-list'); if(!box) return;
  const q=((document.getElementById('isync-field-search')||{}).value||'').toLowerCase().trim();
  const cur=_isyncCols().map(c=>c.id);
  let fl=(_isyncFields||[]).filter(f=>f.id&&f.name);
  if(q) fl=fl.filter(f=>(f.name+' '+f.id).toLowerCase().indexOf(q)>=0);
  fl.sort((a,b)=>String(a.name).localeCompare(String(b.name)));
  if(!fl.length){ box.innerHTML='<div style="padding:14px;text-align:center;">필드가 없습니다.</div>'; return; }
  box.innerHTML=fl.slice(0,400).map(function(f){ const added=cur.indexOf(f.id)>=0;
    return '<div style="display:flex;align-items:center;gap:8px;padding:6px 4px;border-bottom:1px solid #f0f2f5;"><div style="flex:1;min-width:0;"><span style="font-weight:600;color:var(--text);">'+String(f.name).replace(/</g,'&lt;')+'</span> '+(f.custom?'<span style="font-size:9.5px;color:#7c3aed;background:#f3edff;border-radius:6px;padding:0 5px;">custom</span>':'')+'<span style="font-size:10.5px;color:var(--text3);font-family:ui-monospace,monospace;margin-left:6px;">'+String(f.id).replace(/</g,'&lt;')+'</span></div>'+(added?'<span style="font-size:11px;color:#00875a;font-weight:700;"><i class="ti ti-check"></i> 추가됨</span>':'<button onclick="isyncAddField(\''+f.id+'\')" style="font-size:11px;font-weight:700;padding:4px 11px;border-radius:7px;border:1px solid #2684ff;background:#fff;color:#2684ff;cursor:pointer;">+ 추가</button>')+'</div>';
  }).join('')+(fl.length>400?'<div style="padding:8px;text-align:center;color:var(--text3);font-size:11px;">… 상위 400개만 표시. 검색으로 좁히세요.</div>':'');
}
function _isyncFieldFilter(){ _isyncRenderFieldList(); }
function isyncAddField(id){
  const cols=_isyncCols(); if(cols.some(c=>c.id===id)) return;
  const f=(_isyncFields||[]).find(x=>x.id===id); const name=f?f.name:id;
  cols.push({id:id,label:name}); _isyncColsSave(cols);
  _isyncRenderCurCols(); _isyncRenderFieldList(); _isyncRenderColbar(); _isyncRender();
  if(typeof showToast==='function')showToast('컬럼 추가: '+name+' — [동기화]를 다시 누르면 값이 채워집니다');
}

// ══════════════ Release Summary — Jira 버전(릴리스)별 이슈 = 배포 현황 ══════════════
let _rlsCfg={}, _rlsIssues=[], _rlsVerName='', _rlsVers=[], _rlsProjKey='', _rlsJudge={};
let _rlsStore={}, _rlsSelIssue='', _rlsSelTC='', _rlsDetail={}, _rlsFolderClosed=new Set(), _rlsProjects=[], _rlsCol1W=0, _rlsDetailOpen=new Set();   // 데이터·선택·상세캐시·폴더접힘·프로젝트목록·1열폭(px)·이슈상세펼침(기본닫힘)
var _rlsColWidths={};
(function(){ try{ var s=localStorage.getItem('utop_rls_colw'); if(s) _rlsColWidths=JSON.parse(s)||{}; }catch(e){} })();
function _rlsSaveColWidths(){ try{ localStorage.setItem('utop_rls_colw', JSON.stringify(_rlsColWidths)); }catch(e){} }
var _rlsColCollapsed={};
(function(){ try{ var s=localStorage.getItem('utop_rls_collapsed'); if(s) _rlsColCollapsed=JSON.parse(s)||{}; }catch(e){} _rlsColCollapsed.col3=false; })();
function _rlsSaveCollapsed(){ try{ localStorage.setItem('utop_rls_collapsed', JSON.stringify(_rlsColCollapsed)); }catch(e){} }
var _rlsTypeFilter=new Set();   // 멀티 선택: 'cr'/'df'/'dev'/'os', 빈 Set = 전체
(function(){ try{ var s=localStorage.getItem('utop_rls_typefilter'); if(s){ var a=JSON.parse(s); if(Array.isArray(a)) _rlsTypeFilter=new Set(a); } }catch(e){} })();
function _rlsSaveTypeFilter(){ try{ localStorage.setItem('utop_rls_typefilter', JSON.stringify(Array.from(_rlsTypeFilter))); }catch(e){} }
var _rlsOpFilter='';  // 사업자 필터: '' = 전체
function rlsSetOpFilter(v){ _rlsOpFilter=v; if(window._rlsSubView==='status-beta'&&typeof rlsBRenderTree==='function'){ rlsBRenderTree(); } else { rlsRenderCol1(); } }
var _rlsColFocus='';
function _rlsSetFocus(col){
  _rlsColFocus=col;
  var cfg={col1:{id:'rls-col1',border:'2px solid var(--blue)',shadow:'0 0 0 3px rgba(45,111,212,0.18),0 4px 18px rgba(45,111,212,0.14)'},col2:{id:'rls-col2',border:'2px solid #00875a',shadow:'0 0 0 3px rgba(0,135,90,0.18),0 4px 18px rgba(0,135,90,0.14)'},col3:{id:'rls-col3',border:'2px solid #7c3aed',shadow:'0 0 0 3px rgba(124,58,237,0.18),0 4px 18px rgba(124,58,237,0.14)'}};
  ['col1','col2','col3'].forEach(function(k){ var el=document.getElementById(cfg[k].id); if(!el)return; if(k===col){ el.style.border=cfg[k].border; el.style.boxShadow=cfg[k].shadow; } else { el.style.border='1px solid var(--border)'; el.style.boxShadow='0 2px 10px rgba(40,50,90,0.06)'; } });
}
function _rlsColHtml(n){
  const collapsed=!!_rlsColCollapsed['col'+n];
  const defW=n===1?(_rlsColWidths.col1||260):n===2?(_rlsColWidths.col2||400):0;
  const label=n===1?'버전·이슈':n===2?'Jira 설명':'TC·Step';
  const icon=n===1?'ti-folders':n===2?'ti-file-description':'ti-list-details';
  const color=n===1?'var(--blue)':n===2?'#00875a':'#7c3aed';
  const extra=n===1?'onclick="_rlsSetFocus(\'col1\')" oncontextmenu="rlsCtxMenu(event)"':n===2?'onclick="_rlsSetFocus(\'col2\')"':'onclick="_rlsSetFocus(\'col3\')"';
  if(collapsed){
    return '<div id="rls-col'+n+'" onclick="_rlsColToggle('+n+')" title="'+label+' 열 펼치기" style="flex:0 0 30px;width:30px;flex-shrink:0;align-self:stretch;background:#fff;border:1px solid var(--border);border-radius:12px;box-shadow:0 2px 10px rgba(40,50,90,0.06);cursor:pointer;display:flex;flex-direction:column;align-items:center;padding-top:10px;gap:10px;">'
      +'<i class="ti ti-layout-sidebar-left-expand" style="color:'+color+';font-size:18px;"></i>'
      +'<span style="writing-mode:vertical-rl;font-size:10.5px;color:'+color+';font-weight:700;letter-spacing:1px;">'+label+'</span>'
    +'</div>';
  }
  const flexStyle=n===3?'flex:1 1 0;min-width:0;':'flex:0 0 '+defW+'px;min-width:'+(n===1?160:220)+'px;';
  return '<div id="rls-col'+n+'" '+extra+' style="'+flexStyle+'align-self:stretch;min-height:0;display:flex;flex-direction:column;background:#fff;border:1px solid var(--border);border-radius:12px;box-shadow:0 2px 10px rgba(40,50,90,0.06);overflow:hidden;"></div>';
}
function _rlsColToggle(n){
  const key='col'+n; _rlsColCollapsed[key]=!_rlsColCollapsed[key]; _rlsSaveCollapsed();
  const old=document.getElementById('rls-col'+n); if(!old) return;
  const tmp=document.createElement('div'); tmp.innerHTML=_rlsColHtml(n);
  const newEl=tmp.firstChild; old.parentNode.replaceChild(newEl, old);
  if(!_rlsColCollapsed[key]){ if(n===1)rlsRenderCol1(); else if(n===2)rlsRenderCol2(); else rlsRenderCol3(); }
}
function _rlsRailDrag(e){ _rlsRailDrag12(e); }   // 레거시 호환
function _rlsRailDragImpl(e, colId, storageKey, minW, maxFn){
  e.preventDefault();
  const col=document.getElementById(colId); if(!col) return;
  const startX=e.clientX, startW=col.getBoundingClientRect().width;
  const ov=document.createElement('div'); ov.style.cssText='position:fixed;inset:0;z-index:99999;cursor:col-resize;'; document.body.appendChild(ov);
  const _pu=document.body.style.userSelect; document.body.style.userSelect='none';
  const mv=function(ev){ const w=Math.max(minW, Math.min(maxFn(), startW+(ev.clientX-startX))); col.style.flex='0 0 '+w+'px'; _rlsColWidths[storageKey]=w; };
  const up=function(){ document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up); if(ov.parentNode)ov.parentNode.removeChild(ov); document.body.style.userSelect=_pu||''; _rlsSaveColWidths(); };
  document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up);
}
function _rlsRailDrag12(e){ _rlsRailDragImpl(e,'rls-col1','col1',160,function(){ return window.innerWidth-300; }); }
function _rlsRailDragTree(e){ _rlsRailDragImpl(e,'rls-tree-col','treeCol',160,function(){ return window.innerWidth-400; }); }
// ── 1열 프로젝트→사업자→버전 폴더 트리 ──
var _rlsTreeOpen=new Set();
function _rlsRenderTree(){
  const el=document.getElementById('rls-tree-body'); if(!el) return;
  const esc=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');};
  const store=_rlsStore||{};
  // 전체 store에서 프로젝트→사업자→버전 구조 추출
  const projMap={};
  Object.keys(store).forEach(function(k){
    if(!store[k]||!Object.keys(store[k]).length) return;
    const i=k.indexOf('@@'); if(i<0) return;
    const proj=k.slice(0,i); const ver=k.slice(i+2);
    const op=_rlsOperator(ver)||'공통';
    if(!projMap[proj]) projMap[proj]={};
    if(!projMap[proj][op]) projMap[proj][op]=[];
    if(projMap[proj][op].indexOf(ver)<0) projMap[proj][op].push(ver);
  });
  const projs=Object.keys(projMap).sort();
  if(!projs.length){
    el.innerHTML='<div style="padding:20px 8px;text-align:center;color:var(--text3);font-size:11px;line-height:1.8;">Sync 후<br>트리가 표시됩니다</div>';
    return;
  }
  let h='';
  // 전체 항목
  const allSel=!_rlsProjKey&&!_rlsVerName;
  h+='<div onclick="_rlsTreePick(\'\',\'\',\'\')" style="display:flex;align-items:center;gap:5px;padding:5px 6px;border-radius:6px;cursor:pointer;margin-bottom:2px;background:'+(allSel?'rgba(45,111,212,0.1)':'')+';font-size:12px;font-weight:'+(allSel?'700':'600')+';color:'+(allSel?'#2d6fd4':'var(--text2)');+'"><i class="ti ti-stack-2" style="font-size:13px;color:#2d6fd4;"></i> 전체</div>';
  projs.forEach(function(proj){
    const pk='P@@'+proj;
    const projOpen=_rlsTreeOpen.has(pk);
    const projSel=_rlsProjKey===proj&&!_rlsVerName;
    h+='<div onclick="event.stopPropagation();_rlsTreeToggle(\''+pk+'\');_rlsTreePick(\''+esc(proj)+'\',\'\',\'\')" style="display:flex;align-items:center;gap:4px;padding:5px 6px;border-radius:6px;cursor:pointer;background:'+(projSel?'rgba(45,111,212,0.08)':'')+';border-left:3px solid '+(projSel?'#2d6fd4':'transparent')+';">'
      +'<i class="ti ti-chevron-'+(projOpen?'down':'right')+'" onclick="event.stopPropagation();_rlsTreeToggle(\''+pk+'\')" style="font-size:10px;color:var(--text3);cursor:pointer;width:12px;flex-shrink:0;"></i>'
      +'<i class="ti ti-folder'+(projOpen?'-open':'')+'" style="font-size:13px;color:#2d6fd4;flex-shrink:0;"></i>'
      +(function(){ const _pn=(_rlsProjects||[]).find(function(p){return p.key===proj;}); const _nm=_pn&&_pn.name?(' <span style="font-size:10.5px;color:var(--text3);font-weight:400;">('+esc(_pn.name)+')</span>'):''; return '<span style="flex:1;min-width:0;font-size:12px;font-weight:'+(projSel?'700':'600')+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text);">'+esc(proj)+_nm+'</span>'; })()
    +'</div>';
    if(projOpen){
      const opMap=projMap[proj];
      const ops=Object.keys(opMap).sort();
      ops.forEach(function(op){
        const opk='O@@'+proj+'@@'+op;
        const opOpen=_rlsTreeOpen.has(opk);
        const opSel=_rlsProjKey===proj&&!_rlsVerName;
        h+='<div onclick="event.stopPropagation();_rlsTreeToggle(\''+opk+'\')" style="display:flex;align-items:center;gap:4px;padding:4px 6px 4px 18px;border-radius:6px;cursor:pointer;">'
          +'<i class="ti ti-chevron-'+(opOpen?'down':'right')+'" style="font-size:10px;color:var(--text3);cursor:pointer;width:12px;flex-shrink:0;"></i>'
          +'<i class="ti ti-building-community" style="font-size:12px;color:#00a872;flex-shrink:0;"></i>'
          +'<span style="flex:1;min-width:0;font-size:11.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text2);">'+esc(op)+'</span>'
        +'</div>';
        if(opOpen){
          const vers=opMap[op].slice().sort(function(a,b){return String(b).localeCompare(String(a),undefined,{numeric:true});});
          vers.forEach(function(ver){
            const vSel=_rlsProjKey===proj&&_rlsVerName===ver;
            const t=_rlsVerTC(proj,ver);
            h+='<div onclick="_rlsTreePick(\''+esc(proj)+'\',\''+esc(ver)+'\',\''+esc(op)+'\')" style="display:flex;align-items:center;gap:4px;padding:4px 6px 4px 32px;border-radius:6px;cursor:pointer;background:'+(vSel?'rgba(45,111,212,0.1)':'')+';border-left:3px solid '+(vSel?'#2d6fd4':'transparent')+';">'
              +'<i class="ti ti-tag" style="font-size:11px;color:#e8820c;flex-shrink:0;"></i>'
              +'<span style="flex:1;min-width:0;font-size:11px;font-weight:'+(vSel?'700':'500')+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:'+(vSel?'#2d6fd4':'var(--text2)')+';" title="'+esc(ver)+'">'+esc(ver)+'</span>'
              +(t.issues?'<span style="font-size:9.5px;background:#f1f5f9;color:#64748b;border-radius:8px;padding:0 5px;flex-shrink:0;">'+t.issues+'</span>':'')
            +'</div>';
          });
        }
      });
    }
  });
  el.innerHTML=h;
}
function _rlsTreeToggle(key){
  _rlsTreeOpen.has(key)?_rlsTreeOpen.delete(key):_rlsTreeOpen.add(key);
  _rlsRenderTree();
}
function _rlsTreePick(proj,ver,op){
  // 프로젝트·버전 드롭다운과 동기화
  _rlsProjKey=proj||''; _rlsVerName=ver||''; _rlsSelIssue=''; _rlsSelTC='';
  const psel=document.getElementById('rls-proj'); if(psel&&proj) psel.value=proj;
  const vsel=document.getElementById('rls-ver'); if(vsel&&ver) vsel.value=ver;
  // 선택 시 해당 노드 자동 펼침
  if(proj) _rlsTreeOpen.add('P@@'+proj);
  if(proj&&op) _rlsTreeOpen.add('O@@'+proj+'@@'+op);
  try{ if(ver)localStorage.setItem('utop_rls_ver',ver); if(proj)localStorage.setItem('utop_rls_proj',proj); }catch(e){}
  _rlsRenderTree(); rlsRenderCol1(); rlsRenderCol3();
}
function _rlsRailDrag23(e){ _rlsRailDragImpl(e,'rls-col2','col2',160,function(){ return window.innerWidth-300; }); }
// ── Stats 뷰 트리 (프로젝트→사업자→버전) ──
var _rlsStatsTreeOpen=new Set();
var _rlsStatsTreeSel={proj:'',op:'',ver:''};
function _rlsStatsTreeHtml(recs){
  const esc=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');};
  const O=_rlsStatsTreeOpen; const S=_rlsStatsTreeSel;
  const pn=function(k){ return (window._rlsProjNameMap&&window._rlsProjNameMap[k])||k; };   // 프로젝트 키 → Jira 프로젝트명
  // 프로젝트명 → 사업자(KT/LGU+…) → 버전 구조. '>' 캐럿만 접기/펴기, 이름 클릭=선택(표 반영)
  const projMap={};
  (recs||[]).forEach(function(r){ (projMap[r.proj]=projMap[r.proj]||{}); (projMap[r.proj][r.op]=projMap[r.proj][r.op]||[]).push(r); });
  const allSel=!S.proj&&!S.op&&!S.ver;
  let h='<div onclick="_rlsStatsTreePick(\'\',\'\',\'\')" style="display:flex;align-items:center;gap:5px;padding:5px 6px;border-radius:6px;cursor:pointer;margin-bottom:3px;background:'+(allSel?'rgba(45,111,212,0.1)':'')+';font-size:12px;font-weight:'+(allSel?'700':'600')+';color:'+(allSel?'#2d6fd4':'var(--text2)')+';">'
    +'<i class="ti ti-stack-2" style="font-size:13px;color:#2d6fd4;"></i>&nbsp;전체</div>';
  Object.keys(projMap).sort(function(a,b){ return String(pn(a)).localeCompare(String(pn(b)),undefined,{numeric:true}); }).forEach(function(proj){
    const pk='SP@@'+proj; const pOpen=O.has(pk);
    const pSel=S.proj===proj&&!S.op&&!S.ver;
    const pCnt=Object.keys(projMap[proj]).reduce(function(s,o){return s+projMap[proj][o].length;},0);
    h+='<div onclick="_rlsStatsTreePick(\''+esc(proj)+'\',\'\',\'\')" style="display:flex;align-items:center;gap:4px;padding:5px 6px;border-radius:6px;cursor:pointer;background:'+(pSel?'rgba(45,111,212,0.1)':'')+';border-left:3px solid '+(pSel?'#2d6fd4':'transparent')+';">'
      +'<i class="ti ti-chevron-'+(pOpen?'down':'right')+'" onclick="event.stopPropagation();_rlsStatsTreeToggle(\''+pk+'\')" style="font-size:10px;color:var(--text3);cursor:pointer;width:12px;flex-shrink:0;"></i>'
      +'<i class="ti ti-folder'+(pOpen?'-open':'')+'" style="font-size:13px;color:#2d6fd4;flex-shrink:0;"></i>'
      +'<span style="flex:1;min-width:0;font-size:12px;font-weight:'+(pSel?'700':'600')+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:'+(pSel?'#2d6fd4':'var(--text)')+';" title="'+esc(pn(proj))+' ('+esc(proj)+')">'+esc(pn(proj))+(String(pn(proj))!==String(proj)?' <span style="font-size:11.5px;font-weight:600;color:var(--text2);">('+esc(proj)+')</span>':'')+'</span>'
      +'<span style="font-size:10px;color:var(--text3);flex-shrink:0;">'+pCnt+'</span>'
    +'</div>';
    if(pOpen){
      const opMap=projMap[proj];
      Object.keys(opMap).sort().forEach(function(op){
        const opk='SO@@'+proj+'@@'+op; const opOpen=O.has(opk);
        const opSel=S.proj===proj&&S.op===op&&!S.ver;
        const opRecs=opMap[op];
        h+='<div onclick="_rlsStatsTreePick(\''+esc(proj)+'\',\''+esc(op)+'\',\'\')" style="display:flex;align-items:center;gap:4px;padding:4px 6px 4px 18px;border-radius:6px;cursor:pointer;background:'+(opSel?'rgba(45,111,212,0.1)':'')+';border-left:3px solid '+(opSel?'#2d6fd4':'transparent')+';">'
          +'<i class="ti ti-chevron-'+(opOpen?'down':'right')+'" onclick="event.stopPropagation();_rlsStatsTreeToggle(\''+opk+'\')" style="font-size:10px;color:var(--text3);cursor:pointer;width:12px;flex-shrink:0;"></i>'
          +'<i class="ti ti-building-community" style="font-size:12px;color:#00a872;flex-shrink:0;"></i>'
          +'<span style="flex:1;min-width:0;font-size:11.5px;font-weight:'+(opSel?'700':'600')+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:'+(opSel?'#2d6fd4':'var(--text2)')+';">'+esc(op)+'</span>'
          +'<span style="font-size:10px;color:var(--text3);flex-shrink:0;">'+opRecs.length+'</span>'
        +'</div>';
        if(opOpen){
          opRecs.slice().sort(function(a,b){return String(b.ver).localeCompare(String(a.ver),undefined,{numeric:true});}).forEach(function(r){
            const vSel=S.proj===proj&&S.op===op&&S.ver===r.ver;
            h+='<div onclick="_rlsStatsTreePick(\''+esc(proj)+'\',\''+esc(op)+'\',\''+esc(r.ver)+'\')" style="display:flex;align-items:center;gap:4px;padding:4px 6px 4px 32px;border-radius:6px;cursor:pointer;background:'+(vSel?'rgba(45,111,212,0.1)':'')+';border-left:3px solid '+(vSel?'#2d6fd4':'transparent')+';">'
              +'<i class="ti ti-tag" style="font-size:11px;color:#e8820c;flex-shrink:0;"></i>'
              +'<span style="flex:1;min-width:0;font-size:11px;font-weight:'+(vSel?'700':'500')+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:'+(vSel?'#2d6fd4':'var(--text2)')+';" title="'+esc(r.ver)+'">'+esc(r.ver)+'</span>'
              +(r.issues?'<span style="font-size:9.5px;background:#f1f5f9;color:#64748b;border-radius:8px;padding:0 5px;flex-shrink:0;">'+r.issues+'</span>':'')
            +'</div>';
          });
        }
      });
    }
  });
  return h||'<div style="padding:20px 8px;text-align:center;color:var(--text3);font-size:11px;">데이터 없음</div>';
}
function _rlsStatsTreeToggle(key){
  _rlsStatsTreeOpen.has(key)?_rlsStatsTreeOpen.delete(key):_rlsStatsTreeOpen.add(key);
  const el=document.getElementById('rls-stats-tree-body');
  if(el) el.innerHTML=_rlsStatsTreeHtml(window._rlsStatsRecs||[]);
}
function _rlsStatsTreePick(proj,op,ver){
  _rlsStatsTreeSel={proj:proj,op:op,ver:ver};
  if(proj&&(op||ver)) _rlsStatsTreeOpen.add('SP@@'+proj);   // 선택은 조상 경로만 열림 유지 (자기 노드는 캐럿으로만 접기/펴기)
  if(proj&&op&&ver) _rlsStatsTreeOpen.add('SO@@'+proj+'@@'+op);
  const el=document.getElementById('rls-stats-tree-body');
  if(el) el.innerHTML=_rlsStatsTreeHtml(window._rlsStatsRecs||[]);
  // 2열 데이터 필터링
  _rlsStatsRenderData(proj,op,ver);
}
function _rlsStatsRenderData(proj,op,ver){
  // 트리 선택 → 메모리 캐시로 우측 데이터만 부분 갱신 (서버/Jira 재호출·전체 리렌더·깜빡임 없음)
  const dataEl=document.getElementById('rls-stats-data-col'); if(!dataEl) return;
  dataEl.innerHTML=_rlsStatsDataHtml();
}
function _rlsStatsRailDrag(e){
  e.preventDefault();
  const col=document.getElementById('rls-stats-tree-col'); if(!col) return;
  const startX=e.clientX, startW=col.getBoundingClientRect().width;
  const ov=document.createElement('div'); ov.style.cssText='position:fixed;inset:0;z-index:99999;cursor:col-resize;'; document.body.appendChild(ov);
  const _pu=document.body.style.userSelect; document.body.style.userSelect='none';
  const mv=function(ev){
    const w=Math.max(180,Math.min(window.innerWidth-300,startW+(ev.clientX-startX)));
    col.style.flex='0 0 '+w+'px';
    try{ localStorage.setItem('utop_rls_stats_tree_w',w); }catch(_e){}
  };
  const up=function(){ document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up); if(ov.parentNode)ov.parentNode.removeChild(ov); document.body.style.userSelect=_pu||''; };
  document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up);
}
function _rlsRelKey(){ return _rlsProjKey+'@@'+_rlsVerName; }
function _rlsIssueData(key){
  // 현재 릴리스 키 우선, 없으면 전체 store에서 이슈 키로 검색(버전 불일치 방어)
  const rk=_rlsRelKey();
  _rlsStore[rk]=_rlsStore[rk]||{};
  if(_rlsStore[rk][key]) return _rlsStore[rk][key];
  // 다른 버전 키에서 찾기
  const found=Object.keys(_rlsStore).find(function(k){ return _rlsStore[k]&&_rlsStore[k][key]; });
  if(found){ return _rlsStore[found][key]; }
  _rlsStore[rk][key]={tcs:[]};
  return _rlsStore[rk][key];
}function _rlsTCVerdict(tc){ if(!tc) return ''; if(tc.override) return tc.verdict||'';
  if(Array.isArray(tc.checks)){ const ck=tc.checks.filter(function(c){return c&&(c.kind||'cli')==='cli';}); if(!ck.length) return tc.verdict||''; const res=ck.map(function(c){return String(c.repeatResult||'');}); if(res.some(function(r){return r==='Fail'||r==='불합격';})) return 'Fail'; if(res.every(function(r){return r==='Pass'||r==='합격'||r==='실행완료';})) return 'Pass'; return tc.verdict||''; }
  const st=tc.steps||[]; if(!st.length) return tc.verdict||''; if(st.some(function(s){return s.verdict==='Fail';})) return 'Fail'; if(st.every(function(s){return s.verdict==='Pass';})) return 'Pass'; return tc.verdict||''; }
// RS 전용 TC를 tcList에 넣어 실제 TC 편집기를 그대로 사용 (같은 객체 참조 → 편집이 _rlsStore에 반영)
function _rlsEnsureTcs(key){ try{ if(typeof tcList==='undefined')return; const data=_rlsIssueData(key); (data.tcs||[]).forEach(function(tc){ if(tc&&tc.tcid){ tc._rlsOnly=true; if(!Array.isArray(tc.checks))tc.checks=tc.checks||[]; const i=tcList.findIndex(function(x){return (x.tcid||x.id)===tc.tcid;}); if(i<0) tcList.push(tc); else if(tcList[i]!==tc) tcList[i]=tc; } }); }catch(e){} }
function _rlsSaveTcBack(tc){ _rlsSave(); }   // RS 전용 TC는 _rlsStore와 동일 참조라 저장만 트리거
function _rlsIssueVerdict(key){ const d=(_rlsStore[_rlsRelKey()]||{})[key]; const tcs=(d&&d.tcs)||[]; if(!tcs.length) return ''; const vs=tcs.map(_rlsTCVerdict); if(vs.some(function(v){return v==='Fail';})) return 'Fail'; if(vs.every(function(v){return v==='Pass';})) return 'Pass'; return ''; }   // 읽기전용(빈 항목 자동생성 안 함)
function _rlsNewId(p){ return p+'_'+Date.now()+'_'+Math.floor(Math.random()*100000); }
async function _rlsLoad(){ try{ const d=await (await fetch('/api/release-summary')).json(); _rlsStore=(d&&d.releases)||{}; if(Array.isArray(_rlsStore)||typeof _rlsStore!=='object'||!_rlsStore) _rlsStore={}; }catch(e){ _rlsStore={}; } }
let _rlsSaveT=null;
function _rlsSave(){ if(_rlsSaveT)clearTimeout(_rlsSaveT); _rlsSaveT=setTimeout(function(){ fetch('/api/release-summary',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({releases:_rlsStore})}).catch(function(){}); },500); }
async function _rlsLLM(prompt){
  const list=(typeof llmList!=='undefined'?llmList:[]);
  const llm=list.find(function(x){return /test\s*work\s*flow/i.test(String(x.name||''));})||list.find(function(x){return /gemma/i.test(String(x.name||'')+' '+String(x.model||''));})||list[0];
  if(!llm) return (typeof _cbLLMSummary==='function')?_cbLLMSummary(prompt):'';
  try{ const r=await fetch('/api/llm/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({llm_id:llm.id,message:prompt,stream:true})}); if(!r.ok)return ''; const reader=r.body.getReader(); const dec=new TextDecoder(); let out=''; while(true){ const x=await reader.read(); if(x.done)break; out+=dec.decode(x.value); } return out.trim(); }catch(e){ return ''; }
}
// ── Release Summary 서브메뉴: ① 모델·버전별 통계 ② 시험 현황 ──
function rlsShowSub(mode){ window._rlsSubView=(mode==='stats')?'stats':(mode==='status-beta')?'status-beta':'status'; try{ localStorage.setItem('utop_rls_subview',window._rlsSubView); hideDropdown('dd-jira'); }catch(e){} showPage('release-summary'); }
function _rlsEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function _rlsBar(pct,col){ pct=Math.max(0,Math.min(100,pct||0)); return '<div style="display:flex;align-items:center;gap:7px;"><div style="flex:1;height:8px;background:#eef0f4;border-radius:5px;overflow:hidden;"><div style="height:100%;width:'+pct+'%;background:'+col+';border-radius:5px;"></div></div><span style="font-size:11px;font-weight:700;color:var(--text2);min-width:30px;">'+pct+'%</span></div>'; }
function _rlsOperator(ver){ const m=String(ver||'').match(/\(([A-Za-z가-힣]+)[_)]/); const code=(m?m[1]:'').toUpperCase(); const map={LGU:'LGU+',KT:'KT',KTS:'KT',SKB:'SKB',SK:'SK',SO:'SO'}; return map[code]||code||'공통'; }
function _rlsVerTC(proj,ver){ const m=_rlsStore[proj+'@@'+ver]||{}; let tcN=0,pass=0,fail=0,pend=0,issues=0,done=0; Object.keys(m).forEach(function(k){ const d=m[k]||{}; issues++; if(String(d.statusCat||'').toLowerCase()==='done') done++; const tcs=(d.tcs)||[]; tcs.forEach(function(tc){ tcN++; const v=_rlsTCVerdict(tc); if(v==='Pass')pass++; else if(v==='Fail')fail++; else pend++; }); }); return {issues:issues,done:done,tcN:tcN,pass:pass,fail:fail,pend:pend}; }
function _rlsPr(p,f){ return (p+f)?Math.round(p/(p+f)*100):0; }
function _rlsRelBadge(rec){ const ok=(rec.issues>0&&rec.done>=rec.issues); return ok?'<span style="font-size:10.5px;font-weight:700;color:#12b76a;background:rgba(18,183,106,0.13);padding:2px 9px;border-radius:20px;white-space:nowrap;">● 배포완료</span>':'<span style="font-size:10.5px;font-weight:700;color:#e8820c;background:rgba(232,130,12,0.13);padding:2px 9px;border-radius:20px;white-space:nowrap;">● 미배포</span>'; }
// ── Beta: REQ/TC 스타일 3열 (버전 | 이슈 | TC·Step) ──
var _rlsBW1=220, _rlsBW2=340;
var _rlsBSelVer='';   // 트리에서 선택한 버전 (보고서 범위)
var _rlsBSelOp='';    // 트리에서 선택한 사업자 그룹 (보고서 범위)
var _rlsBOpenVers={};  // {ver: true} 펼침 상태
var _rlsBClosedOps={}; // {사업자: true} 그룹 접힘 상태 (기본 펼침)

function _rlsBResizeStart(e,handle){
  const leftCol=handle.previousElementSibling; if(!leftCol) return;
  const startX=e.clientX, startW=leftCol.offsetWidth;
  let ov=document.getElementById('rlsb-resize-ov'); if(ov)ov.remove();
  ov=document.createElement('div'); ov.id='rlsb-resize-ov';
  ov.style.cssText='position:fixed;inset:0;z-index:99999;cursor:col-resize;';
  document.body.appendChild(ov);
  function onMove(ev){ const nw=Math.max(200,startW+(ev.clientX-startX)); leftCol.style.flex='0 0 '+nw+'px'; leftCol.style.width=nw+'px'; _rlsBW1=nw; }
  function onUp(){ ov.remove(); document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp); try{ localStorage.setItem('utop_rlsb_widths',JSON.stringify({w1:_rlsBW1})); }catch(e){} }
  document.addEventListener('mousemove',onMove); document.addEventListener('mouseup',onUp);
  e.preventDefault();
}

async function _rlsRenderBeta(el){
  el.innerHTML='<div style="color:var(--text3);padding:26px;">불러오는 중…</div>';
  try{ _rlsCfg=await (await fetch('/api/jira/config')).json(); }catch(e){ _rlsCfg={}; }
  _rlsCfg=_rlsCfg||{};
  if(!_rlsCfg.url||!_rlsCfg.token){
    el.innerHTML='<div style="max-width:560px;margin:60px auto;text-align:center;color:var(--text3);padding:0 20px;"><i class="ti ti-clipboard-text" style="font-size:48px;color:#7c3aed;"></i><h2 style="margin:16px 0 8px;color:var(--text);font-size:19px;">Jira Issue Coverage</h2><p style="font-size:13px;line-height:1.7;">Jira 연동 설정이 필요합니다.</p><button onclick="showPage(\'sys-jira\')" style="margin-top:10px;font-size:13px;font-weight:700;padding:9px 18px;border-radius:8px;border:none;background:#7c3aed;color:#fff;cursor:pointer;"><i class="ti ti-settings"></i> Jira 연동 설정으로</button></div>';
    return;
  }
  try{ const ws=JSON.parse(localStorage.getItem('utop_rlsb_widths')||'{}'); if(ws.w1)_rlsBW1=ws.w1; }catch(e){}
  await _rlsLoad();
  // 잘못된 버전 위치에 생긴 항목 정리 (TC는 원래 버전으로 병합)
  try{ if(_rlsBCleanupMisplaced()&&typeof showToast==='function') showToast('버전 위치가 잘못된 이슈를 원래 버전으로 정리했습니다'); }catch(e){}
  _rlsLoadFolders();
  const inSt='font-size:13px;padding:6px 10px;border:1px solid var(--border);border-radius:8px;outline:none;box-sizing:border-box;';
  const treeW=_rlsBW1||320;
  el.innerHTML=
    '<div style="display:flex;flex-direction:column;height:100%;box-sizing:border-box;">'+
      '<div style="padding:7px 14px;border-bottom:1px solid var(--border);background:var(--bg2);flex-shrink:0;display:flex;align-items:center;gap:9px;flex-wrap:nowrap;min-width:0;">'+
        '<i class="ti ti-clipboard-list" style="font-size:17px;color:#7c3aed;flex-shrink:0;"></i>'+
        '<span style="font-size:14px;font-weight:800;white-space:nowrap;flex-shrink:0;margin-right:auto;">Jira Issue Coverage</span>'+
        '<select id="rls-proj" onchange="rlsLoadVersions()" style="'+inSt+'cursor:pointer;min-width:120px;max-width:220px;"><option value="">로드 중…</option></select>'+
        '<select id="rls-ver" onchange="rlsVerChange()" title="버전 선택 (Sync·이슈 추가 대상)" style="'+inSt+'cursor:pointer;min-width:380px;max-width:560px;"><option value="">버전…</option></select>'+
        '<button onclick="rlsFetch()" style="font-size:12.5px;font-weight:700;padding:6px 13px;border-radius:8px;border:none;background:#7c3aed;color:#fff;cursor:pointer;white-space:nowrap;flex-shrink:0;"><i class="ti ti-refresh"></i> Sync</button>'+
        '<input id="rls-search" oninput="rlsBRenderTree()" placeholder="버전·이슈 검색…" style="'+inSt+'width:540px;min-width:200px;max-width:540px;margin-right:auto;">'+
      '</div>'+
      '<div style="flex:1;min-height:0;display:flex;padding:10px;gap:6px;background:var(--bg);box-sizing:border-box;">'+
        '<div id="rlsb-tree-wrap" style="flex:0 0 '+treeW+'px;width:'+treeW+'px;display:flex;flex-direction:column;background:#fff;border:1px solid var(--border);border-radius:12px;box-shadow:0 2px 10px rgba(40,50,90,0.06);overflow:hidden;">'+
          // 트리 헤더: 버전·이슈 타이틀 + 사업자·이슈유형 필터 + 전체 펼치기/닫기 (기존 페이지와 동일 구성)
          '<div style="padding:5px 6px 4px 10px;border-bottom:1px solid var(--border);background:#fff;flex-shrink:0;display:flex;align-items:center;gap:5px;flex-wrap:nowrap;">'+
            '<span style="font-size:13px;font-weight:800;color:var(--text2);white-space:nowrap;flex-shrink:0;"><i class="ti ti-folders" style="color:var(--blue);font-size:15px;"></i> 버전·이슈</span>'+
            '<span style="flex:1;"></span>'+
            '<select id="rlsb-op-sel" onchange="rlsSetOpFilter(this.value)" title="사업자 필터" style="font-size:12px;padding:2px 6px;border:1px solid var(--border);border-radius:6px;background:#fff;color:var(--text2);cursor:pointer;height:22px;flex-shrink:0;max-width:110px;"><option value="">사업자 전체</option></select>'+
            '<div style="position:relative;flex-shrink:0;">'+
              '<button id="rlsb-type-btn" onclick="rlsToggleTypeDD(event)" title="이슈유형 필터 (다중 선택)" style="height:22px;padding:0 8px;font-size:12px;border:1px solid var(--border);border-radius:6px;background:#fff;color:var(--text2);cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:4px;">이슈유형 전체 <i class="ti ti-chevron-down" style="font-size:10px;"></i></button>'+
            '</div>'+
            '<button onclick="rlsBExpandAll(true)" title="전체 펼치기" style="height:22px;padding:0 7px;border-radius:5px;border:1px solid var(--border);background:#fff;color:var(--text3);cursor:pointer;font-size:11px;font-weight:700;white-space:nowrap;flex-shrink:0;">전체 +</button>'+
            '<button onclick="rlsBExpandAll(false)" title="전체 닫기" style="height:22px;padding:0 7px;border-radius:5px;border:1px solid var(--border);background:#fff;color:var(--text3);cursor:pointer;font-size:11px;font-weight:700;white-space:nowrap;flex-shrink:0;">전체 −</button>'+
            '<button onclick="rlsBAddMenu(event)" title="사업자 그룹/버전 추가" style="height:22px;width:22px;display:flex;align-items:center;justify-content:center;border-radius:5px;border:1px dashed #7c3aed;background:#fff;color:#7c3aed;cursor:pointer;font-size:12px;flex-shrink:0;padding:0;"><i class="ti ti-plus"></i></button>'+
            '<button onclick="rlsReport()" title="선택 범위(사업자/버전/이슈) 기준 보고서" style="height:22px;padding:0 9px;border-radius:5px;border:1px solid #7c3aed;background:#fff;color:#7c3aed;cursor:pointer;font-size:11px;font-weight:700;white-space:nowrap;flex-shrink:0;display:flex;align-items:center;gap:3px;"><i class="ti ti-file-text" style="font-size:11px;"></i> 보고서</button>'+
          '</div>'+
          '<div id="rlsb-tree" style="flex:1;overflow-y:auto;overflow-x:hidden;"></div>'+
        '</div>'+
        '<div onmousedown="_rlsBResizeStart(event,this)" style="width:5px;flex-shrink:0;cursor:col-resize;background:var(--border);opacity:0.3;border-radius:3px;" onmouseenter="this.style.opacity=\'0.7\'" onmouseleave="this.style.opacity=\'0.3\'"></div>'+
        '<div id="rlsb-col3" style="flex:1;min-width:0;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;background:#fff;border:1px solid var(--border);border-radius:12px;box-shadow:0 2px 10px rgba(40,50,90,0.06);"></div>'+
      '</div>'+
    '</div>';
  await _rlsLoadProjects();
  rlsBRenderTree();
}

// ── Beta 트리: 버전(인라인 폴더) → 이슈 인라인 ──
function rlsBRenderTree(){
  const el=document.getElementById('rlsb-tree'); if(!el) return;
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const q=s=>String(s==null?'':s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const srch=((document.getElementById('rls-search')||{}).value||'').toLowerCase().trim();
  const tf=_rlsTypeFilter;

  const allVers=_rlsBVers();   // Sync된 버전 + 수동 추가(아직 이슈 없는) 버전
  const customOps=_rlsBCustomOps();

  // ── 툴바 필터 컨트롤 동기화 (사업자 select · 이슈유형 멀티버튼 라벨) ──
  try{
    const opSel=document.getElementById('rlsb-op-sel');
    if(opSel){
      const ops={}; allVers.forEach(function(v){ ops[_rlsOperator(v)]=1; });
      const opList=Object.keys(ops).sort();
      if(_rlsOpFilter&&opList.indexOf(_rlsOpFilter)<0) opList.push(_rlsOpFilter);
      opSel.innerHTML='<option value="">사업자 전체</option>'+opList.map(function(op){ return '<option value="'+esc(op)+'"'+(_rlsOpFilter===op?' selected':'')+'>'+esc(op)+'</option>'; }).join('');
    }
    const tbtn=document.getElementById('rlsb-type-btn');
    if(tbtn){
      const tfTypes=[{k:'df',l:'Defect'},{k:'dev',l:'개발 Defect'},{k:'cr',l:'CR'},{k:'os',l:'OS Release(개발)'}];
      const tfLabel=(tf.size===0)?'이슈유형 전체':tfTypes.filter(function(t){return tf.has(t.k);}).map(function(t){return t.l;}).join(', ');
      tbtn.innerHTML=tfLabel+' <i class="ti ti-chevron-down" style="font-size:10px;"></i>';
      tbtn.style.borderColor=tf.size>0?'#6938ef':'var(--border)';
      tbtn.style.background=tf.size>0?'#f4f3ff':'#fff';
      tbtn.style.color=tf.size>0?'#6938ef':'var(--text2)';
    }
  }catch(e){}

  if(!allVers.length&&!customOps.length){
    el.innerHTML='<div style="padding:36px 16px;text-align:center;color:var(--text3);font-size:12px;line-height:1.8;">프로젝트를 선택하고<br>Sync를 눌러주세요.<br><span style="color:#7c3aed;">+ 버튼으로 직접 추가할 수도 있습니다.</span></div>';
    return;
  }

  // Requirements & Test Coverage(explorer)식 트리 가이드선: ├ └ 엘보 + 세로 연속선
  const GC='#d2d7de';
  const gElbow=function(isLast){
    return '<span style="flex:0 0 16px;align-self:stretch;position:relative;">'
      +'<span style="position:absolute;left:8px;top:0;height:50%;border-left:1px solid '+GC+';"></span>'
      +(isLast?'':'<span style="position:absolute;left:8px;top:50%;bottom:0;border-left:1px solid '+GC+';"></span>')
      +'<span style="position:absolute;left:8px;top:50%;width:6px;border-top:1px solid '+GC+';"></span>'
    +'</span>';
  };
  const gPass=function(isLast){   // 하위 계층 옆 세로선 이음
    return isLast?'<span style="flex:0 0 16px;flex-shrink:0;"></span>'
      :'<span style="flex:0 0 16px;flex-shrink:0;align-self:stretch;position:relative;"><span style="position:absolute;left:8px;top:0;bottom:0;border-left:1px solid '+GC+';"></span></span>';
  };

  // ── 사업자(버전 그룹) → 버전 목록 (사업자 필터 + 사용자 지정 순서 적용) ──
  const ordVers=_rlsBOrderedVers(allVers);
  const groups={};
  ordVers.forEach(function(ver){
    const op=_rlsOperator(ver);
    if(_rlsOpFilter && op!==_rlsOpFilter) return;
    (groups[op]=groups[op]||[]).push(ver);
  });
  // 수동 추가한 빈 사업자 그룹도 트리에 표시
  customOps.forEach(function(op){
    if(_rlsOpFilter && op!==_rlsOpFilter) return;
    if(!groups[op]) groups[op]=[];
  });
  const opKeys=Object.keys(groups).sort();

  let h='<div style="padding:4px 4px 10px;">';
  let rendered=0;
  opKeys.forEach(function(op){
    // 그룹 내 버전별 데이터 선계산 (이슈유형·검색 필터 적용)
    const rows=[];
    groups[op].forEach(function(ver){
      const rk=(_rlsProjKey||'')+'@@'+ver;
      const issueMap=_rlsStore[rk]||{};
      let issues=Object.keys(issueMap).map(function(k){ const o=issueMap[k]||{}; o.key=o.key||k; return o; })
        .filter(function(o){ return (o.summary&&String(o.summary).trim())||o.type||(Array.isArray(o.tcs)&&o.tcs.length); })   // 제목·유형·TC 다 없는 빈 placeholder 숨김
        .sort(function(a,b){ return String(a.key).localeCompare(String(b.key),undefined,{numeric:true}); });
      if(tf.size>0) issues=issues.filter(function(d){ return tf.has(_rlsClassifyType(d.type||'')); });
      let matched=issues;
      if(srch){
        matched=issues.filter(function(d){ return String(d.key).toLowerCase().includes(srch)||String(d.summary||'').toLowerCase().includes(srch); });
        if(ver.toLowerCase().includes(srch)) matched=issues;   // 버전명 매치 → 전체 이슈 표시
        if(!matched.length) return;
      }
      rows.push({ver:ver, issues:issues, matched:matched});
    });
    const emptyCustom=(!rows.length && customOps.indexOf(op)>=0 && !srch);   // 빈 커스텀 그룹은 검색 중이 아니면 표시
    if(!rows.length && !emptyCustom) return;
    rendered+=rows.length||1;
    const gOpen=!!(srch||!_rlsBClosedOps[op]);
    const gIssueN=rows.reduce(function(s,r){ return s+r.issues.length; },0);

    // ── 사업자 그룹 행: 클릭=선택, 체브론=펼치기/접기 ──
    const osel=(_rlsBSelOp===op);
    const obg=osel?'rgba(45,111,212,0.12)':'';
    h+='<div onclick="rlsBSelectOpRow(\''+q(op)+'\')" oncontextmenu="rlsBOpMenu(event,\''+q(op)+'\')" title="클릭: 선택(보고서 범위) · ▸: 펼치기/접기 · 우클릭: 메뉴" style="display:flex;align-items:center;gap:6px;padding:0 8px;min-height:27px;border-radius:6px;cursor:pointer;font-size:12.5px;user-select:none;background:'+obg+';'+(osel?'box-shadow:inset 2px 0 0 #2d6fd4;':'')+'" onmouseenter="if(\''+q(op)+'\'!==_rlsBSelOp)this.style.background=\'rgba(0,0,0,0.03)\'" onmouseleave="this.style.background=\''+obg+'\'">'
      +'<i class="ti ti-chevron-right" onclick="event.stopPropagation();rlsBToggleOp(\''+q(op)+'\')" title="펼치기/접기" style="font-size:12px;flex-shrink:0;color:var(--text3);transition:transform 0.15s;cursor:pointer;'+(gOpen?'transform:rotate(90deg);':'')+'"></i>'
      +'<i class="ti ti-building-community" style="font-size:16px;color:#2d6fd4;flex-shrink:0;"></i>'
      +'<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:800;color:var(--text);">'+esc(op)+'</span>'
      +'<span style="font-size:10px;font-weight:700;color:#2d6fd4;background:rgba(45,111,212,0.1);border-radius:8px;padding:1px 7px;flex-shrink:0;">버전 '+rows.length+'</span>'
      +(gIssueN?'<span style="font-size:10px;font-weight:700;color:#7c3aed;background:rgba(124,58,237,0.1);border-radius:8px;padding:1px 7px;flex-shrink:0;">이슈 '+gIssueN+'</span>':'')
    +'</div>';
    if(!gOpen) return;
    if(!rows.length){
      h+='<div style="display:flex;align-items:center;">'+gElbow(true)+'<span style="padding:5px 4px;font-size:11px;color:var(--text3);">버전이 없습니다 · 우클릭으로 버전 추가</span></div>';
      return;
    }

    rows.forEach(function(row,ri){
      const ver=row.ver;
      const isLastVer=(ri===rows.length-1);
      const total=row.issues.length;
      const isOpen=!!(srch||_rlsBOpenVers[ver]);
      const vsel=(_rlsBSelVer===ver);
      const vbg=vsel?'rgba(232,168,60,0.16)':'';

      // ── 버전 = 폴더 행: 클릭=선택, 체브론=펼치기/접기, 드래그=순서 이동 ──
      h+='<div draggable="true" ondragstart="rlsBVerDragStart(event,\''+q(ver)+'\')" ondragover="event.preventDefault();this.style.background=\'rgba(45,111,212,0.12)\'" ondragleave="this.style.background=\''+vbg+'\'" ondrop="this.style.background=\''+vbg+'\';rlsBVerDrop(event,\''+q(ver)+'\')" onclick="rlsBSelectVerRow(\''+q(ver)+'\')" oncontextmenu="rlsBVerMenu(event,\''+q(ver)+'\')" title="클릭: 선택 · ▸: 펼치기/접기 · 드래그: 순서 이동 · 우클릭: 메뉴" style="display:flex;align-items:center;gap:6px;padding:0 8px 0 0;min-height:26px;border-radius:6px;cursor:pointer;font-size:12.5px;color:var(--text2);user-select:none;background:'+vbg+';" onmouseenter="if(\''+q(ver)+'\'!==_rlsBSelVer)this.style.background=\'rgba(0,0,0,0.03)\'" onmouseleave="this.style.background=\''+vbg+'\'">'
        +gElbow(isLastVer)
        +'<i class="ti ti-chevron-right" onclick="event.stopPropagation();rlsBToggleVer(\''+q(ver)+'\')" title="펼치기/접기" style="font-size:12px;flex-shrink:0;color:var(--text3);transition:transform 0.15s;cursor:pointer;'+(isOpen?'transform:rotate(90deg);':'')+'"></i>'
        +'<i class="ti ti-folder'+(isOpen?'-open':'')+'" style="font-size:16px;color:#e8a83c;flex-shrink:0;"></i>'
        +'<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;color:var(--text);" title="'+esc(ver)+'">'+esc(ver)+'</span>'
        +(total?'<span style="font-size:10px;font-weight:700;color:#7c3aed;background:rgba(124,58,237,0.1);border-radius:8px;padding:1px 7px;flex-shrink:0;">이슈 '+total+'</span>':'')
        +'<button onclick="event.stopPropagation();rlsSyncVer(_rlsBJiraName(\''+q(ver)+'\'))" title="이 버전만 Sync" style="height:20px;padding:0 7px;display:flex;align-items:center;gap:2px;border-radius:5px;border:1px solid var(--border);background:#fff;color:#2d6fd4;cursor:pointer;flex-shrink:0;font-size:10.5px;font-weight:700;white-space:nowrap;"><i class="ti ti-refresh" style="font-size:11px;"></i> Sync</button>'
        +'<button onclick="event.stopPropagation();rlsBDelVer(\''+q(ver)+'\')" title="버전 삭제" style="height:20px;width:22px;display:flex;align-items:center;justify-content:center;border-radius:5px;border:1px solid #f0c2cb;background:#fff;color:#c0392b;cursor:pointer;flex-shrink:0;font-size:11px;padding:0;"><i class="ti ti-trash"></i></button>'
      +'</div>';

      // ── 이슈 = 트리 하위 행 ──
      if(!isOpen) return;
      if(!row.matched.length){
        h+='<div style="display:flex;align-items:center;">'+gPass(isLastVer)+gElbow(true)+'<span style="padding:5px 4px;font-size:11px;color:var(--text3);">이슈가 없습니다.</span></div>';
        return;
      }
      row.matched.forEach(function(d,di){
        const key=d.key||'';
        const dsum=(d.summary&&String(d.summary).trim())?d.summary:_rlsBFindSummary(key);   // 제목 없으면 다른 버전의 같은 이슈에서 보완
        const isLast=(di===row.matched.length-1);
        const verdict=_rlsIssueVerdict(d);
        const vdot=verdict==='Pass'?'#12b76a':verdict==='Fail'?'#e53e5a':'#c8cdd6';
        const sel=_rlsSelIssue===key;
        const tcn=(d.tcs||[]).length;
        const detOpen=_rlsDetailOpen.has(key);
        const bg=sel?'rgba(124,58,237,0.09)':'';
        h+='<div onclick="rlsBSelectIssue(\''+q(key)+'\')" title="클릭: TC·Step 보기" style="display:flex;align-items:stretch;gap:5px;padding:0 8px 0 0;min-height:34px;border-radius:6px;cursor:pointer;background:'+bg+';'+(sel?'box-shadow:inset 2px 0 0 #7c3aed;':'')+'" onmouseenter="if(\''+q(key)+'\'!==_rlsSelIssue)this.style.background=\'rgba(0,0,0,0.03)\'" onmouseleave="this.style.background=\''+bg+'\'">'+
          gPass(isLastVer)+gElbow(isLast)+
          '<div style="display:flex;align-items:flex-start;gap:5px;flex:1;min-width:0;padding:5px 0;">'+
            '<button onclick="event.stopPropagation();rlsToggleIssueDetail(\''+q(key)+'\')" title="'+(detOpen?'접기':'Jira 설명·댓글')+'" style="width:16px;height:16px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;color:'+(detOpen?'#7c3aed':'#94a3b8')+';cursor:pointer;flex-shrink:0;padding:0;margin-top:2px;">'+
              '<i class="ti ti-chevron-right" style="font-size:12px;transition:transform 0.15s;'+(detOpen?'transform:rotate(90deg);':'')+'"></i>'+
            '</button>'+
            '<span title="'+(verdict||'미평가')+'" style="width:8px;height:8px;border-radius:50%;background:'+vdot+';flex-shrink:0;margin-top:6px;"></span>'+
            '<div style="flex:1;min-width:0;line-height:1.35;">'+
              // 1줄: 이슈 키 + 제목
              '<div style="display:flex;align-items:center;gap:6px;min-width:0;">'+
                '<a href="'+esc((_rlsCfg.url||'')+'/browse/'+key)+'" target="_blank" onclick="event.stopPropagation()" title="Jira에서 열기" style="font-family:ui-monospace,monospace;font-size:12.5px;font-weight:700;color:#0052cc;text-decoration:none;white-space:nowrap;flex-shrink:0;" onmouseenter="this.style.textDecoration=\'underline\'" onmouseleave="this.style.textDecoration=\'none\'">'+esc(key)+'</a>'+
                '<span data-rlsb-tip="'+_rlsbAttr(key)+'|'+_rlsbAttr(d.type||'')+'|'+(_rlsClassifyType(d.type||'')==='df'?'#d92d20':_rlsClassifyType(d.type||'')==='dev'?'#e07000':_rlsClassifyType(d.type||'')==='cr'?'#6938ef':_rlsClassifyType(d.type||'')==='os'?'#079455':'#667085')+'|'+_rlsbAttr(dsum||'')+'" style="font-size:12.5px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(dsum||'(제목 없음)')+'</span>'+
              '</div>'+
              // 2줄: 유형 · 이슈구분 · 문제유형 · 상태 · 보고자 · 담당자 · TC (11.5px, 투명 바탕 회색 글자)
              '<div style="display:flex;align-items:center;gap:5px;margin-top:3px;flex-wrap:wrap;">'+
                (d.type?'<span style="font-size:11.5px;font-weight:600;color:#667085;background:transparent;border-radius:5px;padding:1px 7px;white-space:nowrap;">'+esc(d.type)+'</span>':'')+
                (d.issuePhase?'<span style="font-size:11.5px;font-weight:600;color:#667085;background:transparent;border-radius:5px;padding:1px 7px;white-space:nowrap;">'+esc(d.issuePhase)+'</span>':'')+
                (d.problemType?'<span style="font-size:11.5px;font-weight:600;color:#667085;background:transparent;border-radius:5px;padding:1px 7px;white-space:nowrap;">'+esc(d.problemType)+'</span>':'')+
                (d.status?'<span style="font-size:11.5px;font-weight:600;color:#667085;background:transparent;border-radius:12px;padding:1px 8px;white-space:nowrap;">'+esc(d.status)+'</span>':'')+
                (d.reporter?'<span style="font-size:11.5px;color:#667085;background:transparent;border-radius:5px;padding:1px 7px;white-space:nowrap;"><span style="color:#98a2b3;">보고자</span> '+esc(d.reporter)+'</span>':'')+
                (d.assignee?'<span style="font-size:11.5px;color:#667085;background:transparent;border-radius:5px;padding:1px 7px;white-space:nowrap;"><span style="color:#98a2b3;">담당자</span> '+esc(d.assignee)+'</span>':'')+
                (tcn?'<span style="font-size:11.5px;font-weight:700;color:#7c3aed;background:rgba(124,58,237,0.08);border-radius:5px;padding:1px 7px;white-space:nowrap;">TC '+tcn+'</span>':'')+
              '</div>'+
            '</div>'+
          '</div>'+
        '</div>';
        // 상세 펼침(설명·댓글): 트리 세로선을 이어서 그 옆에 표시
        if(detOpen) h+='<div style="display:flex;align-items:stretch;">'+gPass(isLastVer)+gPass(isLast)+'<div style="flex:1;min-width:0;">'+_rlsDetailHtml(key)+'</div></div>';
      });
    });
  });
  h+='</div>';

  el.innerHTML=rendered?h:'<div style="padding:36px 16px;text-align:center;color:var(--text3);font-size:12px;">결과 없음</div>';
  // 제목 호버 → 커스텀 플로팅 툴팁 (기존 페이지 _rlsTip 재사용: 이슈키 + 유형 칩 + 제목 전문)
  try{
    el.querySelectorAll('[data-rlsb-tip]').forEach(function(sp){
      var p=(sp.getAttribute('data-rlsb-tip')||'').split('|');
      _rlsTip(sp, p[0]||'', p.slice(3).join('|'), p[1]||'', p[2]||'#667085');
    });
  }catch(e){}
}

// 속성값 이스케이프 (제목에 따옴표 포함돼도 안전)
function _rlsbAttr(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }

// 버전 불일치 정리: 제목·유형 없이 생긴 항목(=_rlsIssueData가 엉뚱한 버전에 자동 생성)을
// 같은 프로젝트의 실데이터 버전으로 병합(TC 이관)하거나, 빈 껍데기면 삭제
function _rlsBCleanupMisplaced(){
  let changed=false;
  const keys=Object.keys(_rlsStore).filter(function(k){ return k.indexOf('@@')>0 && _rlsStore[k]; });
  keys.forEach(function(rk){
    const proj=rk.slice(0,rk.indexOf('@@'));
    const map=_rlsStore[rk];
    Object.keys(map).forEach(function(ik){
      const it=map[ik]||{};
      if((it.summary&&String(it.summary).trim())||it.type) return;   // 실데이터 보유 → 제 위치
      const tcs=Array.isArray(it.tcs)?it.tcs:[];
      const others=keys.filter(function(k2){ return k2!==rk && k2.indexOf(proj+'@@')===0 && _rlsStore[k2][ik]; })
        .sort(function(a,b){ return String(b).localeCompare(String(a),undefined,{numeric:true}); });
      const realRk=others.find(function(k2){ const o=_rlsStore[k2][ik]; return (o.summary&&String(o.summary).trim())||o.type; });
      if(!realRk){
        if(!tcs.length){ delete map[ik]; changed=true; }   // 어디에도 실데이터 없고 TC도 없음 → 고아 placeholder 삭제
        return;                                            // TC만 있으면 보존 (수동 작성 가능성)
      }
      if(tcs.length){ const real=_rlsStore[realRk][ik]; real.tcs=(real.tcs||[]).concat(tcs); }   // TC를 원래 버전으로 이관
      delete map[ik]; changed=true;
    });
  });
  if(changed) _rlsSave();
  return changed;
}

// 같은 이슈 키를 다른 버전 저장분에서 찾아 제목 보완 (버전 불일치로 생긴 제목 없는 항목 표시용)
function _rlsBFindSummary(key){
  if(!key) return '';
  const pref=(_rlsProjKey||'')+'@@';
  let s='';
  Object.keys(_rlsStore).some(function(k){
    if(k.indexOf(pref)!==0) return false;
    const it=_rlsStore[k]&&_rlsStore[k][key];
    if(it&&it.summary&&String(it.summary).trim()){ s=it.summary; return true; }
    return false;
  });
  return s;
}

// ── 수동 추가 버전(아직 이슈 없음)·커스텀 사업자 그룹 (프로젝트별 localStorage) ──
function _rlsBExtraVers(){ try{ return (JSON.parse(localStorage.getItem('utop_rlsb_extravers')||'{}')[_rlsProjKey||''])||[]; }catch(e){ return []; } }
function _rlsBSetExtraVers(arr){ try{ const s=JSON.parse(localStorage.getItem('utop_rlsb_extravers')||'{}'); s[_rlsProjKey||'']=arr; localStorage.setItem('utop_rlsb_extravers',JSON.stringify(s)); }catch(e){} }
function _rlsBMergeVers(vers){ const ex=_rlsBExtraVers().filter(function(v){ return vers.indexOf(v)<0; }); return vers.concat(ex); }
// Beta 전용 버전 목록: 이슈가 저장된 버전 + 수동 추가 버전만.
// (_rlsProjVers는 드롭다운 선택 버전(_rlsVerName)을 빈 버전이라도 끼워 넣어 "선택 시에만 보이는 버전"이 생김)
function _rlsBVers(){
  const pref=(_rlsProjKey||'')+'@@';
  const vers=Object.keys(_rlsStore).filter(function(k){ return k.indexOf(pref)===0 && _rlsStore[k] && Object.keys(_rlsStore[k]).length; }).map(function(k){ return k.slice(pref.length); });
  vers.sort(function(a,b){ return String(b).localeCompare(String(a),undefined,{numeric:true}); });
  return _rlsBMergeVers(vers);
}
// 버전 별칭: 그룹 이동/이름변경된 버전의 {Jira 원래 이름: 로컬 이름} — Sync가 원래 그룹에 재생성하는 것을 방지
function _rlsBAlias(){ try{ return (JSON.parse(localStorage.getItem('utop_rlsb_veralias')||'{}')[_rlsProjKey||''])||{}; }catch(e){ return {}; } }
function _rlsBSaveAlias(m){ try{ const s=JSON.parse(localStorage.getItem('utop_rlsb_veralias')||'{}'); s[_rlsProjKey||'']=m; localStorage.setItem('utop_rlsb_veralias',JSON.stringify(s)); }catch(e){} }
function _rlsBJiraName(ver){ try{ const am=_rlsBAlias(); const j=Object.keys(am).find(function(k){ return am[k]===ver; }); return j||ver; }catch(e){ return ver; } }
function _rlsBAliasRemoveLocal(ver){ try{ const am=_rlsBAlias(); let ch=false; Object.keys(am).forEach(function(k){ if(am[k]===ver){ delete am[k]; ch=true; } }); if(ch)_rlsBSaveAlias(am); }catch(e){} }
function _rlsBCustomOps(){ try{ return (JSON.parse(localStorage.getItem('utop_rlsb_customops')||'{}')[_rlsProjKey||''])||[]; }catch(e){ return []; } }
function _rlsBSaveCustomOps(arr){ try{ const s=JSON.parse(localStorage.getItem('utop_rlsb_customops')||'{}'); s[_rlsProjKey||'']=arr; localStorage.setItem('utop_rlsb_customops',JSON.stringify(s)); }catch(e){} }

// ── 공용 플로팅 메뉴 (우클릭·추가 버튼) — items: [{icon,label,color,fn}] 또는 '-' 구분선 ──
function _rlsBMenu(e, items){
  try{ e.preventDefault(); e.stopPropagation(); }catch(_){}
  const old=document.getElementById('rlsb-ctx'); if(old) old.remove();
  const m=document.createElement('div'); m.id='rlsb-ctx';
  m.style.cssText='position:fixed;z-index:99990;background:#fff;border:1px solid #d0d5dd;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.13);padding:5px;min-width:160px;';
  m.style.left=e.clientX+'px'; m.style.top=e.clientY+'px';
  items.forEach(function(it){
    if(it==='-'){ const hr=document.createElement('div'); hr.style.cssText='height:1px;background:#eef0f4;margin:4px 6px;'; m.appendChild(hr); return; }
    const row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;gap:7px;padding:7px 11px;border-radius:7px;cursor:pointer;font-size:12.5px;font-weight:600;color:'+(it.color||'#344054')+';';
    row.innerHTML='<i class="ti '+(it.icon||'ti-point')+'" style="font-size:13px;"></i>'+it.label;
    row.onmouseenter=function(){ row.style.background='#f4f6fa'; };
    row.onmouseleave=function(){ row.style.background='transparent'; };
    row.onclick=function(ev){ ev.stopPropagation(); m.remove(); it.fn(); };
    m.appendChild(row);
  });
  document.body.appendChild(m);
  try{ const r=m.getBoundingClientRect(); if(r.right>window.innerWidth-6) m.style.left=(window.innerWidth-r.width-6)+'px'; if(r.bottom>window.innerHeight-6) m.style.top=(window.innerHeight-r.height-6)+'px'; }catch(e2){}
  setTimeout(function(){ document.addEventListener('mousedown',function _c(ev){ if(!m.contains(ev.target)){ m.remove(); document.removeEventListener('mousedown',_c); } }); },0);
}

// ── 헤더 + 버튼: 그룹/버전 추가 ──
function rlsBAddMenu(e){
  _rlsBMenu(e,[
    {icon:'ti-building-community',label:'사업자 그룹 추가',fn:rlsBAddOp},
    {icon:'ti-folder-plus',label:'버전 추가',fn:function(){ rlsBAddVer(''); }}
  ]);
}
function rlsBAddOp(){
  const nm=prompt('추가할 사업자 그룹 이름 (예: KT, LGU+, SKB):',''); if(!nm||!nm.trim()) return;
  const op=nm.trim();
  const list=_rlsBCustomOps();
  if(list.indexOf(op)>=0){ if(typeof showToast==='function')showToast('이미 있는 그룹입니다'); return; }
  list.push(op); _rlsBSaveCustomOps(list);
  delete _rlsBClosedOps[op];
  rlsBRenderTree(); if(typeof showToast==='function')showToast('그룹 추가됨: '+op);
}
function rlsBAddVer(op){
  const raw=prompt((op?'"'+op+'" 그룹에 ':'')+'추가할 버전 이름:',''); if(!raw||!raw.trim()) return;
  let ver=raw.trim();
  if(op&&op!=='공통'&&_rlsOperator(ver)!==op){
    const rev={'LGU+':'LGU'};   // 표시명→버전명 코드 (그 외는 표시명 그대로)
    ver='('+(rev[op]||op)+') '+ver;   // 사업자 코드 접두 — _rlsOperator가 그룹으로 인식
  }
  const pk=_rlsProjKey||'';
  if(_rlsStore[pk+'@@'+ver]&&Object.keys(_rlsStore[pk+'@@'+ver]).length){ if(typeof showToast==='function')showToast('이미 있는 버전입니다'); return; }
  _rlsStore[pk+'@@'+ver]=_rlsStore[pk+'@@'+ver]||{};
  const ex=_rlsBExtraVers(); if(ex.indexOf(ver)<0){ ex.push(ver); _rlsBSetExtraVers(ex); }
  _rlsBOpenVers[ver]=true; delete _rlsBClosedOps[_rlsOperator(ver)];
  _rlsSave(); rlsBRenderTree(); if(typeof showToast==='function')showToast('버전 추가됨: '+ver);
}

// ── 사업자 그룹 우클릭 메뉴 ──
function rlsBOpMenu(e,op){
  const custom=_rlsBCustomOps().indexOf(op)>=0;
  const items=[{icon:'ti-folder-plus',label:'이 그룹에 버전 추가',fn:function(){ rlsBAddVer(op); }}];
  if(custom) items.push({icon:'ti-pencil',label:'그룹 이름 수정',fn:function(){ rlsBRenameOp(op); }});
  items.push('-');
  items.push({icon:'ti-trash',label:custom?'그룹 삭제':'그룹 삭제(버전 포함)',color:'#c0392b',fn:function(){ rlsBDelOp(op); }});
  _rlsBMenu(e,items);
}
function rlsBRenameOp(op){
  const list=_rlsBCustomOps(); const i=list.indexOf(op);
  if(i<0){ if(typeof showToast==='function')showToast('버전명에서 자동 추출된 그룹은 이름을 바꿀 수 없습니다'); return; }
  const nm=prompt('그룹 이름 수정:',op); if(!nm||!nm.trim()||nm.trim()===op) return;
  list[i]=nm.trim(); _rlsBSaveCustomOps(list);
  rlsBRenderTree(); if(typeof showToast==='function')showToast('수정됨');
}
function rlsBDelOp(op){
  const pk=_rlsProjKey||'';
  const vers=_rlsBVers().filter(function(v){ return _rlsOperator(v)===op; });
  if(vers.length){
    if(!confirm('"'+op+'" 그룹의 버전 '+vers.length+'개와 이슈 데이터가 모두 삭제됩니다. 진행할까요?')) return;
    vers.forEach(function(v){ delete _rlsStore[pk+'@@'+v]; delete _rlsBOpenVers[v]; if(_rlsBSelVer===v)_rlsBSelVer=''; _rlsBAliasRemoveLocal(v); });
    _rlsBSetExtraVers(_rlsBExtraVers().filter(function(v){ return _rlsOperator(v)!==op; }));
    _rlsSave();
  }
  const list=_rlsBCustomOps(); const ci=list.indexOf(op);
  if(ci>=0){ list.splice(ci,1); _rlsBSaveCustomOps(list); }
  rlsBRenderTree(); if(typeof showToast==='function')showToast('그룹 삭제됨');
}

// ── 버전 우클릭 메뉴 ──
function rlsBVerMenu(e,ver){
  _rlsBMenu(e,[
    {icon:'ti-pencil',label:'이름 수정',fn:function(){ rlsBRenameVer(ver); }},
    {icon:'ti-copy',label:'복사',fn:function(){ rlsBCopyVer(ver); }},
    {icon:'ti-refresh',label:'이 버전만 Sync',fn:function(){ if(typeof rlsSyncVer==='function') rlsSyncVer(_rlsBJiraName(ver)); }},
    '-',
    {icon:'ti-trash',label:'삭제',color:'#c0392b',fn:function(){ rlsBDelVer(ver); }}
  ]);
}
// 이름 변경 공통 처리: 저장 키·펼침/선택 상태·수동추가 목록·드래그 순서까지 이관
function _rlsBApplyRename(ver,nn){
  const pk=_rlsProjKey||'';
  _rlsStore[pk+'@@'+nn]=_rlsStore[pk+'@@'+ver]||{}; delete _rlsStore[pk+'@@'+ver];
  if(_rlsBOpenVers[ver]){ delete _rlsBOpenVers[ver]; _rlsBOpenVers[nn]=true; }
  if(_rlsBSelVer===ver) _rlsBSelVer=nn;
  if(_rlsVerName===ver) _rlsVerName=nn;
  _rlsBSetExtraVers(_rlsBExtraVers().map(function(v){ return v===ver?nn:v; }));
  try{ const s=JSON.parse(localStorage.getItem('utop_rlsb_verorder')||'{}'); const a=s[pk]||[]; const i=a.indexOf(ver); if(i>=0){ a[i]=nn; s[pk]=a; localStorage.setItem('utop_rlsb_verorder',JSON.stringify(s)); } }catch(e){}
  // 별칭 갱신: Jira 원래 이름 → 최신 로컬 이름 (체인 유지 — Sync가 원래 그룹에 재생성하지 않도록)
  try{
    const am=_rlsBAlias(); let chained=false;
    Object.keys(am).forEach(function(k){ if(am[k]===ver){ am[k]=nn; chained=true; } });
    if(!chained) am[ver]=nn;   // ver 자체가 Jira 원래 이름일 수 있음
    Object.keys(am).forEach(function(k){ if(am[k]===k) delete am[k]; });   // 원래 이름으로 되돌아오면 정리
    _rlsBSaveAlias(am);
  }catch(e){}
  _rlsSave();
}
function rlsBRenameVer(ver){
  const nv=prompt('버전 이름 수정:',ver); if(!nv||!nv.trim()||nv.trim()===ver) return;
  const nn=nv.trim(); const pk=_rlsProjKey||'';
  if(_rlsStore[pk+'@@'+nn]&&Object.keys(_rlsStore[pk+'@@'+nn]).length){ if(typeof showToast==='function')showToast('같은 이름의 버전이 이미 있습니다'); return; }
  _rlsBApplyRename(ver,nn);
  rlsBRenderTree(); if(typeof showToast==='function')showToast('이름 수정됨');
}
// 다른 사업자 그룹으로 이동: 버전명의 사업자 코드를 대상 그룹 코드로 교체 → 새 이름 반환('' = 실패)
function _rlsBRenameForOp(ver,top){
  const rev={'LGU+':'LGU'};   // 표시명→버전명 코드
  const code=rev[top]||top;
  let nn;
  if(top==='공통'){
    // 사업자 마커 제거: "(LGU_E5724RL) R1" → "(E5724RL) R1", "(KT) R1" → "R1"
    nn=ver.replace(/\(([A-Za-z가-힣]+)_/,'(').replace(/^\(([A-Za-z가-힣]+)\)\s*/,'').trim()||ver;
  } else if(/\(([A-Za-z가-힣]+)[_)]/.test(ver)){
    nn=ver.replace(/\(([A-Za-z가-힣]+)([_)])/,'('+code+'$2');   // 기존 코드 교체
  } else {
    nn='('+code+') '+ver;   // 마커 없으면 접두
  }
  if(nn===ver) return ver;
  const pk=_rlsProjKey||'';
  if(_rlsStore[pk+'@@'+nn]&&Object.keys(_rlsStore[pk+'@@'+nn]).length){ if(typeof showToast==='function')showToast('대상 그룹에 같은 이름의 버전이 이미 있습니다: '+nn); return ''; }
  _rlsBApplyRename(ver,nn);
  return nn;
}
function rlsBCopyVer(ver){
  const pk=_rlsProjKey||'';
  let nn=ver+' (복사)'; let n=2;
  while(_rlsStore[pk+'@@'+nn]) nn=ver+' (복사'+(n++)+')';
  try{ _rlsStore[pk+'@@'+nn]=JSON.parse(JSON.stringify(_rlsStore[pk+'@@'+ver]||{})); }catch(e){ _rlsStore[pk+'@@'+nn]={}; }
  if(!Object.keys(_rlsStore[pk+'@@'+nn]).length){ const ex=_rlsBExtraVers(); if(ex.indexOf(nn)<0){ ex.push(nn); _rlsBSetExtraVers(ex); } }
  _rlsSave(); rlsBRenderTree(); if(typeof showToast==='function')showToast('복사됨: '+nn);
}
function rlsBDelVer(ver){
  const pk=_rlsProjKey||'';
  const n=Object.keys(_rlsStore[pk+'@@'+ver]||{}).length;
  if(!confirm('"'+ver+'" 버전을 삭제할까요?'+(n?' (이슈 '+n+'개·작성한 TC/Step 포함)':''))) return;
  delete _rlsStore[pk+'@@'+ver];
  delete _rlsBOpenVers[ver];
  if(_rlsBSelVer===ver)_rlsBSelVer='';
  if(_rlsVerName===ver)_rlsVerName='';
  _rlsBSetExtraVers(_rlsBExtraVers().filter(function(v){ return v!==ver; }));
  _rlsBAliasRemoveLocal(ver);   // 삭제된 버전의 이동 별칭 정리 (이후 Sync는 원래 이름으로 생성)
  _rlsSave(); rlsBRenderTree(); if(typeof showToast==='function')showToast('삭제됨');
}

// ── 버전 사용자 지정 순서 (드래그 이동, 프로젝트별 localStorage 저장) ──
function _rlsBOrderedVers(vers){
  let ord=[];
  try{ ord=(JSON.parse(localStorage.getItem('utop_rlsb_verorder')||'{}')[_rlsProjKey||''])||[]; }catch(e){}
  if(!ord.length) return vers;
  const pos={}; ord.forEach(function(v,i){ pos[v]=i; });
  return vers.slice().sort(function(a,b){
    const pa=(a in pos)?pos[a]:1e9, pb=(b in pos)?pos[b]:1e9;
    if(pa!==pb) return pa-pb;
    return String(b).localeCompare(String(a),undefined,{numeric:true});   // 미지정분은 기본(최신 우선)
  });
}
function _rlsBSaveVerOrder(arr){
  try{
    const store=JSON.parse(localStorage.getItem('utop_rlsb_verorder')||'{}');
    store[_rlsProjKey||'']=arr;
    localStorage.setItem('utop_rlsb_verorder',JSON.stringify(store));
  }catch(e){}
}
var _rlsBDragVer='';
function rlsBVerDragStart(ev,ver){
  _rlsBDragVer=ver;
  try{ ev.dataTransfer.setData('text/plain',ver); ev.dataTransfer.effectAllowed='move'; }catch(e){}
}
function rlsBVerDrop(ev,targetVer){
  ev.preventDefault(); ev.stopPropagation();
  const src=_rlsBDragVer; _rlsBDragVer='';
  if(!src||src===targetVer) return;
  const sop=_rlsOperator(src), top=_rlsOperator(targetVer);
  let moved=src;
  if(sop!==top){
    // 다른 사업자 그룹으로 이동: 버전명의 사업자 코드를 교체해 소속 변경
    moved=_rlsBRenameForOp(src,top);
    if(!moved) return;   // 이름 충돌 등
  }
  // 현재 표시 순서 기준 재배열: 타깃 위/아래(마우스 위치)로 삽입 → 전체 순서 저장
  const vers=_rlsBOrderedVers(_rlsBVers()).filter(function(v){ return v!==moved; });
  let ti=vers.indexOf(targetVer);
  if(ti<0){ vers.push(moved); }
  else{
    let after=false;
    try{ const r=ev.currentTarget.getBoundingClientRect(); after=ev.clientY>r.top+r.height/2; }catch(e){}
    vers.splice(after?ti+1:ti,0,moved);
  }
  _rlsBSaveVerOrder(vers);
  rlsBRenderTree();
  if(typeof showToast==='function')showToast(sop!==top?('"'+top+'" 그룹으로 이동됨: '+moved):'버전 순서 이동됨');
}

// ── 전체 펼치기/닫기: 그룹은 항상 펼침 유지, 버전 폴더만 일괄 토글 ──
function rlsBExpandAll(open){
  _rlsBClosedOps={};
  if(open){ _rlsBVers().forEach(function(v){ _rlsBOpenVers[v]=true; }); }
  else { _rlsBOpenVers={}; }
  rlsBRenderTree();
}

// ── 사업자 그룹 접기/펴기 ──
function rlsBToggleOp(op){
  if(_rlsBClosedOps[op]){ delete _rlsBClosedOps[op]; }
  else { _rlsBClosedOps[op]=true; }
  rlsBRenderTree();
}

// ── 버전 접기/펴기 (체브론 전용) ──
function rlsBToggleVer(ver){
  if(_rlsBOpenVers[ver]){ delete _rlsBOpenVers[ver]; }
  else { _rlsBOpenVers[ver]=true; }
  rlsBRenderTree();
}

// ── 버전 행 클릭 = 선택 (같은 버전 재클릭 = 해제) — 보고서 범위: 그 버전 전체 ──
function rlsBSelectVerRow(ver){
  _rlsBSelVer=(_rlsBSelVer===ver)?'':ver;
  _rlsBSelOp=''; _rlsSelIssue=''; _rlsSelTC='';
  rlsBRenderTree(); rlsBRenderCol3B();
}

// ── 사업자 그룹 행 클릭 = 선택 (재클릭 = 해제) — 보고서 범위: 하위 버전 전체 ──
function rlsBSelectOpRow(op){
  _rlsBSelOp=(_rlsBSelOp===op)?'':op;
  _rlsBSelVer=''; _rlsSelIssue=''; _rlsSelTC='';
  rlsBRenderTree(); rlsBRenderCol3B();
}

// ── Beta 버전 선택 (호환용 — rlsLoadVersions 복원 시 사용) ──
function rlsBSelectVer(ver){
  _rlsBSelVer=ver; _rlsBOpenVers[ver]=true; _rlsSelIssue=''; _rlsSelTC='';
  rlsBRenderTree(); rlsBRenderCol3B();
}

// ── Beta 이슈 선택 → 우측 TC·Step 패널 — 보고서 범위: 이 이슈만 ──
function rlsBSelectIssue(key){
  _rlsSelIssue=key; _rlsSelTC='';
  _rlsBSelOp=''; _rlsBSelVer='';
  // 이 이슈가 속한 버전을 현재 작업 버전으로 동기화 — TC 추가/저장(_rlsIssueData)이
  // 드롭다운의 다른 버전에 제목 없는 빈 항목을 만드는 문제 방지
  try{
    const pk=_rlsProjKey||'';
    const v=_rlsBVers().find(function(vv){ return (_rlsStore[pk+'@@'+vv]||{})[key]; });
    if(v&&_rlsVerName!==v){ _rlsVerName=v; const vs=document.getElementById('rls-ver'); if(vs) vs.value=_rlsBJiraName(v); }
  }catch(e){}
  rlsBRenderTree(); rlsBRenderCol3B();
}

// ── Beta 우측: 기존 TC·Step 패널 재사용 ──
function rlsBRenderCol3B(){ rlsRenderCol3(); }

// ── 호환: rlsBRenderCol1/2 는 트리로 대체 ──
function rlsBRenderCol1(){ rlsBRenderTree(); }
function rlsBRenderCol2(){ rlsBRenderTree(); }

// ── 이슈 판정: TC 중 하나라도 Pass면 Pass ──
function _rlsIssueVerdict(d){
  const tcs=d.tcs||[];
  if(!tcs.length) return '';
  if(tcs.some(function(t){return _rlsTCVerdict(t)==='Pass';})) return 'Pass';
  if(tcs.some(function(t){return _rlsTCVerdict(t)==='Fail';})) return 'Fail';
  return '';
}
async function _rlsRenderStats(el){
  el.innerHTML='<div style="color:var(--text3);padding:26px;">불러오는 중…</div>';
  try{ await _rlsLoad(); }catch(e){}
  const store=_rlsStore||{};
  const keys=Object.keys(store).filter(function(k){ return store[k] && Object.keys(store[k]).length; });
  const recs=keys.map(function(k){ const i=k.indexOf('@@'); const proj=(i>=0?k.slice(0,i):k)||'(기타)'; const ver=(i>=0?k.slice(i+2):'')||'-'; const t=_rlsVerTC(proj,ver); return {proj:proj,ver:ver,op:_rlsOperator(ver),issues:t.issues,done:t.done,tcN:t.tcN,pass:t.pass,fail:t.fail,pend:t.pend}; });
  recs.sort(function(a,b){ return a.op.localeCompare(b.op)||a.proj.localeCompare(b.proj)||String(b.ver).localeCompare(String(a.ver),undefined,{numeric:true}); });
  window._rlsStatsRecs=recs;
  // 프로젝트 키 → 프로젝트명 매핑 로드 (트리·표에 이름 표시 — 최초 1회만 Jira 호출 후 캐시)
  if(!window._rlsProjNameMap){ try{ const pd=await (await fetch('/api/jira/projects')).json(); if(pd&&pd.ok){ const m0={}; (pd.projects||[]).forEach(function(p){ m0[p.key]=p.name||p.key; }); window._rlsProjNameMap=m0; } }catch(e){} }
  _rlsStatsRenderLayout(el, recs);
}
// 우측 데이터 영역 HTML — 메모리 캐시(window._rlsStatsRecs, _rlsStore)만 사용. 트리 선택 시 서버/Jira 재호출 없음
function _rlsStatsDataHtml(){
  const store=_rlsStore||{};
  const recs=window._rlsStatsRecs||[];
  const pn=function(k){ return (window._rlsProjNameMap&&window._rlsProjNameMap[k])||k; };
  // 트리 선택 필터 — 선택한 사업자/모델/버전 기준으로 카드·분포·표 반영 (트리는 전체 유지)
  const S=_rlsStatsTreeSel||{proj:'',op:'',ver:''};
  const fRecs=recs.filter(function(r){ return (!S.op||r.op===S.op)&&(!S.proj||r.proj===S.proj)&&(!S.ver||r.ver===S.ver); });
  const grpMap={};
  fRecs.forEach(function(r){ const gk=r.op+''+r.proj; const g=(grpMap[gk]=grpMap[gk]||{op:r.op,proj:r.proj,rel:0,relDone:0,issues:0,tcN:0,pass:0,fail:0,pend:0}); g.rel++; if(r.issues>0&&r.done>=r.issues) g.relDone++; g.issues+=r.issues; g.tcN+=r.tcN; g.pass+=r.pass; g.fail+=r.fail; g.pend+=r.pend; });
  const grps=Object.keys(grpMap).map(function(k){return grpMap[k];}).sort(function(a,b){ return a.op.localeCompare(b.op)||a.proj.localeCompare(b.proj); });
  const opSet={},pjSet={}; let gRel=fRecs.length,gRelDone=0,gIss=0,gTc=0,gPass=0,gFail=0;
  fRecs.forEach(function(r){ opSet[r.op]=1; pjSet[r.proj]=1; if(r.issues>0&&r.done>=r.issues)gRelDone++; gIss+=r.issues; gTc+=r.tcN; gPass+=r.pass; gFail+=r.fail; });
  const passRate=_rlsPr(gPass,gFail);
  const typeMap={},statusMap={},assigneeMap={};
  Object.keys(store).forEach(function(sk){
    const _i2=sk.indexOf('@@'); const _p2=_i2>=0?sk.slice(0,_i2):sk; const _v2=_i2>=0?sk.slice(_i2+2):'';
    if(S.proj&&_p2!==S.proj) return; if(S.ver&&_v2!==S.ver) return; if(S.op&&_rlsOperator(_v2)!==S.op) return;   // 선택 필터
    const m=store[sk]||{};
    Object.keys(m).forEach(function(ik){
      const d=m[ik]||{};
      const cl=_rlsClassifyType(d.type||'');
      const tlbl=cl==='df'?'Defect':cl==='dev'?'개발요청':cl==='cr'?'CR':cl==='os'?'OS':'기타';
      typeMap[tlbl]=(typeMap[tlbl]||0)+1;
      const slbl=d.statusCat==='done'?'완료(Done)':d.statusCat==='indeterminate'?'진행중':'미착수';
      statusMap[slbl]=(statusMap[slbl]||0)+1;
      if(d.assignee){ assigneeMap[d.assignee]=(assigneeMap[d.assignee]||0)+1; }
    });
  });
  const totalIss=Object.values(typeMap).reduce(function(s,v){return s+v;},0)||1;
  const totalSt=Object.values(statusMap).reduce(function(s,v){return s+v;},0)||1;
  const card=function(lbl,val,col,sub){
    return '<div style="flex:1;min-width:108px;background:#fff;border:1px solid var(--border);border-radius:12px;padding:13px 15px;">'
      +'<div style="font-size:11px;color:var(--text3);font-weight:600;margin-bottom:7px;">'+lbl+'</div>'
      +'<div style="font-size:24px;font-weight:800;color:'+(col||'var(--text)')+';line-height:1;">'+val+'</div>'
      +(sub?'<div style="font-size:10.5px;color:var(--text3);margin-top:4px;">'+sub+'</div>':'')
      +'</div>';
  };
  const secHd=function(icon,title){
    return '<div style="display:flex;align-items:center;gap:7px;font-size:13px;font-weight:800;margin:20px 0 8px;color:var(--text);">'
      +'<i class="ti '+icon+'" style="font-size:15px;color:#667085;"></i>'+title+'</div>';
  };
  const hbar=function(label,cnt,total,col){
    const pct=Math.round(cnt/total*100);
    return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">'
      +'<div style="width:90px;font-size:12px;font-weight:600;color:var(--text2);white-space:nowrap;flex-shrink:0;">'+_rlsEsc(label)+'</div>'
      +'<div style="flex:1;height:16px;background:#f2f4f7;border-radius:8px;overflow:hidden;">'
        +'<div style="height:100%;width:'+pct+'%;background:'+col+';border-radius:8px;"></div>'
      +'</div>'
      +'<div style="width:36px;font-size:12px;font-weight:700;color:'+col+';text-align:right;flex-shrink:0;">'+pct+'%</div>'
      +'<div style="width:32px;font-size:11px;color:var(--text3);text-align:right;flex-shrink:0;">'+cnt+'건</div>'
    +'</div>';
  };
  const typeOrder=[['Defect','#d92d20'],['개발요청','#e07000'],['CR','#6938ef'],['OS','#079455'],['기타','#98a2b3']];
  let typeBars=''; typeOrder.forEach(function(t){ if(typeMap[t[0]]) typeBars+=hbar(t[0],typeMap[t[0]],totalIss,t[1]); });
  if(!typeBars) typeBars='<div style="color:var(--text3);font-size:12px;">데이터 없음</div>';
  const stOrder=[['완료(Done)','#12b76a'],['진행중','#175cd3'],['미착수','#98a2b3']];
  let stBars=''; stOrder.forEach(function(s){ if(statusMap[s[0]]) stBars+=hbar(s[0],statusMap[s[0]],totalSt,s[1]); });
  if(!stBars) stBars='<div style="color:var(--text3);font-size:12px;">데이터 없음</div>';
  const assignees=Object.keys(assigneeMap).sort(function(a,b){return assigneeMap[b]-assigneeMap[a];}).slice(0,15);
  const maxA=assignees.length?assigneeMap[assignees[0]]:1;
  let aRows=''; assignees.forEach(function(a){
    const cnt=assigneeMap[a];
    const pct=Math.round(cnt/maxA*100);
    aRows+='<tr style="border-bottom:1px solid #f2f4f7;">'
      +'<td style="padding:7px 12px;font-size:12.5px;font-weight:600;">'+_rlsEsc(a)+'</td>'
      +'<td style="padding:7px 12px;width:55%;"><div style="height:13px;background:#f2f4f7;border-radius:6px;overflow:hidden;"><div style="height:100%;width:'+pct+'%;background:#2d6fd4;border-radius:6px;"></div></div></td>'
      +'<td style="padding:7px 12px;font-size:12px;font-weight:700;color:#2d6fd4;text-align:right;">'+cnt+'건</td>'
    +'</tr>';
  });
  if(!aRows) aRows='<tr><td colspan="3" style="padding:24px;text-align:center;color:var(--text3);font-size:12px;">데이터 없음</td></tr>';
  const tblHd='<tr style="background:#f4f5f7;color:var(--text2);font-size:11px;">';
  let g1=''; grps.forEach(function(g){ g1+='<tr style="border-bottom:1px solid #eef0f4;">'
    +'<td style="padding:8px 12px;font-weight:700;">'+_rlsEsc(g.op)+'</td>'
    +'<td style="padding:8px 12px;font-weight:800;color:#2d6fd4;" title="'+_rlsEsc(g.proj)+'">'+_rlsEsc(pn(g.proj))+'</td>'
    +'<td style="padding:8px 10px;text-align:center;font-weight:700;">'+g.rel+'</td>'
    +'<td style="padding:8px 10px;text-align:center;color:#12b76a;font-weight:700;">'+g.relDone+'<span style="color:var(--text3);font-weight:400;">/'+g.rel+'</span></td>'
    +'<td style="padding:8px 10px;text-align:center;">'+g.issues+'</td>'
    +'<td style="padding:8px 10px;text-align:center;font-weight:700;">'+g.tcN+'</td>'
    +'<td style="padding:8px 10px;text-align:center;color:#12b76a;font-weight:700;">'+g.pass+'</td>'
    +'<td style="padding:8px 10px;text-align:center;color:#f04438;font-weight:700;">'+g.fail+'</td>'
    +'<td style="padding:8px 12px;min-width:130px;">'+(g.pass+g.fail?_rlsBar(_rlsPr(g.pass,g.fail),'#12b76a'):'<span style="color:var(--text3);font-size:11px;">-</span>')+'</td>'
    +'</tr>'; });
  if(!g1) g1='<tr><td colspan="9" style="padding:34px;text-align:center;color:var(--text3);">저장된 릴리스 데이터가 없습니다 — "시험 현황"에서 Sync 후 표시됩니다</td></tr>';
  let g2=''; fRecs.forEach(function(r){ g2+='<tr style="border-bottom:1px solid #eef0f4;">'
    +'<td style="padding:8px 12px;">'+_rlsEsc(r.op)+'</td>'
    +'<td style="padding:8px 12px;color:#2d6fd4;font-weight:700;" title="'+_rlsEsc(r.proj)+'">'+_rlsEsc(pn(r.proj))+'</td>'
    +'<td style="padding:8px 12px;font-family:ui-monospace,monospace;font-size:11.5px;">'+_rlsEsc(r.ver)+'</td>'
    +'<td style="padding:8px 10px;text-align:center;">'+_rlsRelBadge(r)+'</td>'
    +'<td style="padding:8px 10px;text-align:center;">'+r.issues+'</td>'
    +'<td style="padding:8px 10px;text-align:center;font-weight:700;">'+r.tcN+'</td>'
    +'<td style="padding:8px 10px;text-align:center;color:#12b76a;">'+r.pass+'</td>'
    +'<td style="padding:8px 10px;text-align:center;color:#f04438;">'+r.fail+'</td>'
    +'<td style="padding:8px 12px;min-width:120px;">'+(r.pass+r.fail?_rlsBar(_rlsPr(r.pass,r.fail),'#2d6fd4'):'<span style="color:var(--text3);font-size:11px;">-</span>')+'</td>'
    +'</tr>'; });
  if(!g2) g2='<tr><td colspan="9" style="padding:34px;text-align:center;color:var(--text3);">데이터 없음</td></tr>';
  // 2단 레이아웃: 1열(트리) + 2열(데이터)
  const dataHtml=
    '<div style="display:flex;gap:11px;margin-bottom:14px;flex-wrap:wrap;">'
      +card('사업자',Object.keys(opSet).length)
      +card('제품군(모델)',Object.keys(pjSet).length)
      +card('릴리즈(버전)',gRel)
      +card('배포완료',gRelDone+'<span style="font-size:14px;color:var(--text3);">/'+gRel+'</span>','#12b76a')
      +card('총 이슈',gIss)
      +card('총 TC',gTc)
      +card('합격율',passRate+'%','#2d6fd4',gPass+'합격 / '+gFail+'불합격')
    +'</div>'
    +secHd('ti-layout-grid','이슈 현황 분포')
    +'<div style="display:flex;gap:14px;margin-bottom:14px;flex-wrap:wrap;">'
      +'<div style="flex:1;min-width:220px;background:#fff;border:1px solid var(--border);border-radius:12px;padding:14px 16px;">'
        +'<div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:12px;"><i class="ti ti-tag" style="color:#667085;margin-right:4px;"></i>이슈 유형별</div>'
        +typeBars
      +'</div>'
      +'<div style="flex:1;min-width:220px;background:#fff;border:1px solid var(--border);border-radius:12px;padding:14px 16px;">'
        +'<div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:12px;"><i class="ti ti-loader" style="color:#667085;margin-right:4px;"></i>이슈 상태별</div>'
        +stBars
      +'</div>'
      +'<div style="flex:2;min-width:260px;background:#fff;border:1px solid var(--border);border-radius:12px;padding:14px 16px;overflow:hidden;">'
        +'<div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:8px;"><i class="ti ti-user-check" style="color:#667085;margin-right:4px;"></i>담당자별 이슈 수 <span style="font-weight:400;color:var(--text3);">(상위 15명)</span></div>'
        +'<table style="width:100%;border-collapse:collapse;">'+aRows+'</table>'
      +'</div>'
    +'</div>'
    +secHd('ti-building','제품군(모델)별 요약')
    +'<div style="background:#fff;border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:14px;"><table style="width:100%;border-collapse:collapse;font-size:12.5px;">'
    +'<thead>'+tblHd+'<th style="padding:9px 12px;text-align:left;">사업자</th><th style="padding:9px 12px;text-align:left;">제품군(모델)</th><th style="padding:9px 10px;">릴리즈</th><th style="padding:9px 10px;">배포완료</th><th style="padding:9px 10px;">이슈</th><th style="padding:9px 10px;">TC</th><th style="padding:9px 10px;">합격</th><th style="padding:9px 10px;">불합격</th><th style="padding:9px 12px;text-align:left;">합격율</th></tr></thead>'
    +'<tbody>'+g1+'</tbody></table></div>'
    +secHd('ti-versions','버전별 상세')
    +'<div style="background:#fff;border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:24px;"><table style="width:100%;border-collapse:collapse;font-size:12.5px;">'
    +'<thead>'+tblHd+'<th style="padding:9px 12px;text-align:left;">사업자</th><th style="padding:9px 12px;text-align:left;">제품군(모델)</th><th style="padding:9px 12px;text-align:left;">버전명</th><th style="padding:9px 10px;">배포</th><th style="padding:9px 10px;">이슈</th><th style="padding:9px 10px;">TC</th><th style="padding:9px 10px;">합격</th><th style="padding:9px 10px;">불합격</th><th style="padding:9px 12px;text-align:left;">합격율</th></tr></thead>'
    +'<tbody>'+g2+'</tbody></table></div>';
  return dataHtml;
}
// 레이아웃(트리+데이터) 최초 1회 렌더 — 이후 트리 선택은 트리 하이라이트·우측 데이터만 부분 갱신
function _rlsStatsRenderLayout(el, recs){
  const treeHtml=_rlsStatsTreeHtml(recs);
  // 저장된 트리 폭 복원
  var _stTreeW=280; try{ _stTreeW=parseInt(localStorage.getItem('utop_rls_stats_tree_w')||'280',10)||280; }catch(e){}
  el.innerHTML=
    '<div style="display:flex;height:100%;min-height:0;box-sizing:border-box;">'
      // 1열: 트리
      +'<div id="rls-stats-tree-col" style="flex:0 0 '+_stTreeW+'px;min-width:180px;border-right:1px solid var(--border);background:#fff;display:flex;flex-direction:column;overflow:hidden;">'
        +'<div style="padding:10px 10px 7px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:6px;flex-shrink:0;">'
          +'<i class="ti ti-binary-tree-2" style="color:#2d6fd4;font-size:14px;"></i>'
          +'<span style="font-size:12px;font-weight:700;color:var(--text2);">프로젝트 트리</span>'
        +'</div>'
        +'<div id="rls-stats-tree-body" style="flex:1;overflow-y:auto;padding:6px 4px;">'+treeHtml+'</div>'
      +'</div>'
      // 드래그 레일
      +'<div id="rls-stats-rail" onmousedown="_rlsStatsRailDrag(event)" title="드래그로 폭 조절" style="width:6px;flex-shrink:0;cursor:col-resize;background:transparent;transition:background .15s;position:relative;" onmouseenter="this.style.background=\'var(--border)\'" onmouseleave="this.style.background=\'transparent\'">'
        +'<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:4px;height:40px;border-radius:2px;background:var(--border);opacity:0.6;"></div>'
      +'</div>'
      // 2열: 데이터
      +'<div id="rls-stats-data-col" style="flex:1;min-width:0;overflow-y:auto;padding:18px 22px;box-sizing:border-box;">'
        +_rlsStatsDataHtml()
      +'</div>'
    +'</div>';
}
async function renderReleaseSummary(){
  const el=document.getElementById('release-summary-body'); if(!el) return;
  if(!document.getElementById('rls-jira-style')){ const st=document.createElement('style'); st.id='rls-jira-style'; st.textContent='.rls-jira{font-size:13.5px;line-height:1.7;color:#172b4d;word-break:break-word;}.rls-jira h1,.rls-jira h2,.rls-jira h3,.rls-jira h4{font-weight:800;margin:9px 0 4px;color:#091e42;line-height:1.3;}.rls-jira h1{font-size:17px;}.rls-jira h2{font-size:15px;}.rls-jira h3{font-size:13.5px;}.rls-jira h4{font-size:12.5px;}.rls-jira p{margin:5px 0;}.rls-jira ul,.rls-jira ol{margin:5px 0;padding-left:22px;}.rls-jira li{margin:2px 0;}.rls-jira img{max-width:100%;height:auto;border-radius:4px;margin:5px 0;border:1px solid #dfe1e6;}.rls-jira pre,.rls-jira .code,.rls-jira .preformatted{background:#f4f5f7;border:1px solid #dfe1e6;border-radius:5px;padding:8px 10px;overflow:auto;font-family:ui-monospace,Consolas,monospace;font-size:12.5px;line-height:1.55;white-space:pre;}.rls-jira code{background:#f4f5f7;border-radius:3px;padding:1px 4px;font-family:ui-monospace,monospace;font-size:12.5px;}.rls-jira table{border-collapse:collapse;margin:7px 0;width:auto;}.rls-jira td,.rls-jira th{border:1px solid #dfe1e6;padding:6px 10px;font-size:12.5px;vertical-align:top;}.rls-jira th,.rls-jira .confluenceTh{background:#f4f5f7;font-weight:700;text-align:left;}.rls-jira blockquote,.rls-jira .quote{border-left:3px solid #c1c7d0;margin:6px 0;padding:3px 12px;color:#5e6c84;}.rls-jira a{color:#0052cc;text-decoration:none;}.rls-jira a:hover{text-decoration:underline;}.rls-jira .panel{border:1px solid #dfe1e6;border-radius:5px;padding:9px 11px;margin:6px 0;}.rls-jira .panelHeader{font-weight:700;margin:-9px -11px 8px;padding:6px 11px;background:#f4f5f7;border-bottom:1px solid #dfe1e6;}.rls-jira hr{border:none;border-top:1px solid #dfe1e6;margin:8px 0;}.rls-jira .code pre,.rls-jira .preformatted pre,.rls-jira .codeContent pre{border:none;background:transparent;padding:0;margin:0;}.rls-jira .panelContent{padding:0;}.rls-jira p:first-child{margin-top:0;}.rls-jira p:last-child{margin-bottom:0;}'; document.head.appendChild(st); }
  if(!window._rlsSubView){ try{ window._rlsSubView=localStorage.getItem('utop_rls_subview')||'stats'; }catch(e){ window._rlsSubView='stats'; } }
  if(window._rlsSubView==='status'){ window._rlsSubView='status-beta'; try{ localStorage.setItem('utop_rls_subview','status-beta'); }catch(e){} }   // 구 Coverage 페이지 제거 — 저장된 진입 상태를 신규(구 Beta)로 이관
  if(window._rlsSubView==='stats'){ return _rlsRenderStats(el); }   // Jira Issue Report
  if(window._rlsSubView==='status-beta'){ return _rlsRenderBeta(el); }  // Jira Issue Coverage β
  el.innerHTML='<div style="color:var(--text3);padding:26px;">불러오는 중…</div>';
  try{ _rlsCfg=await (await fetch('/api/jira/config')).json(); }catch(e){ _rlsCfg={}; }
  _rlsCfg=_rlsCfg||{};
  if(!_rlsCfg.url||!_rlsCfg.token){
    el.innerHTML='<div style="max-width:560px;margin:60px auto;text-align:center;color:var(--text3);padding:0 20px;"><i class="ti ti-clipboard-text" style="font-size:48px;color:#2d6fd4;"></i><h2 style="margin:16px 0 8px;color:var(--text);font-size:19px;">Release Summary</h2><p style="font-size:13px;line-height:1.7;">Jira 버전(릴리스) 배포 현황을 가져오려면 먼저 Jira 연동 설정이 필요합니다.</p><button onclick="showPage(\'sys-jira\')" style="margin-top:10px;font-size:13px;font-weight:700;padding:9px 18px;border-radius:8px;border:none;background:#2684ff;color:#fff;cursor:pointer;"><i class="ti ti-settings"></i> Jira 연동 설정으로</button></div>';
    return;
  }
  await _rlsLoad();
  _rlsLoadFolders();   // 폴더 접힘/펼침 마지막 상태 복원
  const inSt='font-size:13px;padding:8px 11px;border:1px solid var(--border);border-radius:8px;outline:none;box-sizing:border-box;';
  el.innerHTML=
    '<div style="display:flex;flex-direction:column;height:100%;box-sizing:border-box;">'+
      '<div style="padding:7px 14px;border-bottom:1px solid var(--border);background:#fff;flex-shrink:0;display:flex;align-items:center;gap:10px;flex-wrap:nowrap;min-width:0;">'+
        '<i class="ti ti-clipboard-text" style="font-size:18px;color:#2d6fd4;flex-shrink:0;"></i>'+
        '<span style="font-size:15px;font-weight:800;white-space:nowrap;flex-shrink:0;">Jira Issue Coverage</span>'+
        '<select id="rls-proj" onchange="rlsLoadVersions()" style="'+inSt+'cursor:pointer;min-width:120px;flex:1;"><option value="">로드 중…</option></select>'+
        '<select id="rls-ver" onchange="rlsVerChange()" style="'+inSt+'cursor:pointer;min-width:160px;flex:2;"><option value="">— 프로젝트 선택 —</option></select>'+
        '<button onclick="rlsFetch()" style="font-size:13px;font-weight:700;padding:7px 14px;border-radius:8px;border:none;background:#2d6fd4;color:#fff;cursor:pointer;white-space:nowrap;flex-shrink:0;"><i class="ti ti-refresh"></i> Sync</button>'+
        '<input id="rls-search" oninput="rlsRenderCol1()" placeholder="이슈 검색…" style="'+inSt+'min-width:100px;flex:1;max-width:220px;">'+
        '<button onclick="rlsReport()" style="font-size:12px;font-weight:700;padding:7px 12px;border-radius:8px;border:1px solid #0ea5e9;background:#fff;color:#0284b5;cursor:pointer;white-space:nowrap;flex-shrink:0;"><i class="ti ti-file-text"></i> 보고서</button>'+
      '</div>'+
      '<div style="flex:1;min-height:0;display:flex;padding:10px;gap:6px;background:var(--bg);">'+
        _rlsColHtml(1)+
        '<div id="rls-rail12" onmousedown="_rlsRailDrag12(event)" onclick="event.stopPropagation()" title="드래그로 폭 조절" style="width:8px;flex-shrink:0;cursor:col-resize;border-radius:3px;background:transparent;transition:background .15s;" onmouseenter="this.style.background=\'var(--border)\'" onmouseleave="this.style.background=\'transparent\'"></div>'+
        _rlsColHtml(3)+
      '</div>'+
    '</div>';
  await _rlsLoadProjects();
  rlsRenderCol1(); rlsRenderCol3();
}
async function _rlsLoadProjects(){
  const sel=document.getElementById('rls-proj'); if(!sel) return;
  let pre=''; try{ pre=localStorage.getItem('utop_rls_proj')||''; }catch(e){}
  if(!pre) pre=_rlsCfg.default_project||'';
  sel.innerHTML='<option value="">로드 중…</option>';
  try{
    const d=await (await fetch('/api/jira/projects')).json();
    if(!d.ok){ sel.innerHTML='<option value="">실패: '+String(d.error||'').slice(0,60)+'</option>'; return; }
    const favs=(_rlsCfg&&_rlsCfg.fav_projects)||[];
    _rlsProjects=(d.projects||[]);
    let list=(favs.length?(d.projects||[]).filter(p=>favs.indexOf(p.key)>=0):(d.projects||[]).slice());
    list.sort((a,b)=>String(a.key).localeCompare(String(b.key),undefined,{numeric:true}));
    sel.innerHTML='<option value="">(프로젝트 선택)</option>'+list.map(p=>'<option value="'+p.key+'"'+(pre===p.key?' selected':'')+'>'+p.key+' · '+String(p.name).replace(/</g,'&lt;')+'</option>').join('');
    if(pre && list.some(p=>p.key===pre)){ await rlsLoadVersions(); }
  }catch(e){ sel.innerHTML='<option value="">오류: '+e.message+'</option>'; }
}
async function rlsLoadVersions(){
  const psel=document.getElementById('rls-proj'); const vsel=document.getElementById('rls-ver');
  const key=psel?psel.value:''; if(!vsel) return;
  if(!key){ vsel.innerHTML='<option value="">— 프로젝트 선택 —</option>'; return; }
  try{ localStorage.setItem('utop_rls_proj',key); }catch(e){}
  vsel.innerHTML='<option value="">버전 로드 중…</option>';
  try{
    const d=await (await fetch('/api/jira/versions?project='+encodeURIComponent(key))).json();
    if(!d.ok){ vsel.innerHTML='<option value="">실패: '+String(d.error||'').slice(0,50)+'</option>'; return; }
    let vs=(d.versions||[]).filter(v=>!v.archived); vs.reverse();
    _rlsVers=vs;
    if(!vs.length){ vsel.innerHTML='<option value="">(이 프로젝트에 버전 없음)</option>'; return; }
    let _pv=''; try{ _pv=localStorage.getItem('utop_rls_ver')||''; }catch(e){}
    vsel.innerHTML='<option value="">— 버전 선택 —</option>'+vs.map(function(v){ const _tc=_rlsVerTypeCounts(key, v.name); const _cnt=_tc.total?('   [OS '+_tc.os+'·개발Defect '+_tc.dev+'·CR '+_tc.cr+'·Defect '+_tc.df+']'):''; return '<option value="'+String(v.name).replace(/"/g,'&quot;')+'"'+(_pv===v.name?' selected':'')+'>'+String(v.name).replace(/</g,'&lt;')+(v.released?' ✓':'')+(v.releaseDate?(' · '+v.releaseDate):'')+_cnt+'</option>'; }).join('');
    _rlsProjKey=key;   // 프로젝트 선택 즉시 반영 → 기존 sync된 버전 폴더들 자동 표시
    if(_pv && vs.some(function(v){return v.name===_pv;})){
      // Beta 모드: 저장된 버전을 1열 선택 버전으로도 자동 복원
      if(window._rlsSubView==='status-beta') _rlsBSelVer=_pv;
      rlsVerChange(false);  // false = _rlsBSelVer 리셋 안 함
    }
    else { _rlsVerName=''; _rlsSelIssue=''; _rlsSelTC=''; if(vsel)vsel.value=''; rlsRenderCol1(); }
  }catch(e){ vsel.innerHTML='<option value="">오류: '+e.message+'</option>'; }
}
// 현재 릴리스(프로젝트@@버전)의 저장된 이슈 목록 (utop에 복사된 스냅샷)
function _rlsIssueList(){ const rk=_rlsRelKey(); const m=_rlsStore[rk]||{}; return Object.keys(m).map(function(k){ const o=m[k]||{}; o.key=o.key||k; return o; }).sort(function(a,b){ return String(a.key).localeCompare(String(b.key),undefined,{numeric:true}); }); }
// 버전 선택 변경 → 저장본 표시(라이브 fetch 아님)
function rlsVerChange(resetBVer){
  const psel=document.getElementById('rls-proj'); const vsel=document.getElementById('rls-ver');
  _rlsProjKey=psel?psel.value:''; _rlsVerName=vsel?vsel.value:''; _rlsSelIssue=''; _rlsSelTC='';
  try{ if(_rlsVerName)localStorage.setItem('utop_rls_ver',_rlsVerName); }catch(e){}
  if(window._rlsSubView==='status-beta'){
    if(resetBVer!==false) _rlsBSelVer='';  // 수동 변경 시만 리셋; 자동복원은 false 전달
    rlsBRenderCol1(); rlsBRenderCol2(); rlsBRenderCol3B();
  } else { rlsRenderCol1(); rlsRenderCol3(); }
}
// Sync = Jira에서 가져와 저장본 갱신(증분 upsert, 수동추가·TC데이터 보존)
async function rlsFetch(){
  const psel=document.getElementById('rls-proj'); const vsel=document.getElementById('rls-ver');
  const key=psel?psel.value:''; const ver=vsel?vsel.value:'';
  if(!key||!ver){ if(typeof showToast==='function')showToast('프로젝트와 버전을 선택하세요'); return; }
  _rlsProjKey=key; try{ localStorage.setItem('utop_rls_ver',ver); }catch(e){}
  // Beta에서 이동/이름변경된 버전 별칭: Jira 원래 이름으로 조회하되 저장은 로컬(변경된) 이름으로
  let jiraVer=ver, localVer=ver;
  try{
    const am=(typeof _rlsBAlias==='function')?_rlsBAlias():{};
    if(am[ver]){ localVer=am[ver]; }
    else{ const j=Object.keys(am).find(function(k){ return am[k]===ver; }); if(j) jiraVer=j; }
  }catch(e){}
  _rlsVerName=localVer;
  if(typeof showToast==='function')showToast('Jira Sync 중…');
  const jql='project = "'+key+'" AND fixVersion = "'+String(jiraVer).replace(/"/g,'\\"')+'" ORDER BY status ASC, issuetype ASC';
  const fields='summary,status,issuetype,assignee,reporter,priority,resolution,customfield_10302,customfield_10303';
  try{
    const d=await (await fetch('/api/jira/search-all?jql='+encodeURIComponent(jql)+'&fields='+encodeURIComponent(fields))).json();
    if(!d.ok){ if(typeof showToast==='function')showToast('Sync 실패: '+String(d.error||'').slice(0,80)); rlsRenderCol1(); rlsRenderCol3(); return; }
    const arr=d.issues||[]; const rk=_rlsRelKey(); _rlsStore[rk]=_rlsStore[rk]||{};
    let added=0, upd=0;
    arr.forEach(function(it){ const f=it.fields||{}; const ex=_rlsStore[rk][it.key]; const e=ex||{tcs:[]}; if(ex)upd++; else added++;
      e.key=it.key; e.summary=f.summary||''; e.type=(f.issuetype&&f.issuetype.name)||''; e.status=(f.status&&f.status.name)||''; e.statusCat=(f.status&&f.status.statusCategory&&f.status.statusCategory.key)||''; e.priority=(f.priority&&f.priority.name)||''; e.resolution=(f.resolution&&f.resolution.name)||''; e.issuePhase=(f.customfield_10302&&(f.customfield_10302.value||f.customfield_10302))||''; e.problemType=(f.customfield_10303&&(f.customfield_10303.value||f.customfield_10303))||''; e.assignee=(f.assignee&&f.assignee.displayName)||''; e.reporter=(f.reporter&&f.reporter.displayName)||''; e.created=(f.created||'').slice(0,10); e.source=e.source||'jira'; e.tcs=e.tcs||[]; _rlsStore[rk][it.key]=e; });
    _rlsSave();
    if(window._rlsSubView==='status-beta'){ rlsBRenderCol1(); rlsBRenderCol2(); rlsBRenderCol3B(); } else { rlsRenderCol1(); rlsRenderCol3(); }
    if(typeof showToast==='function')showToast('Sync 완료 — 신규 '+added+' · 갱신 '+upd+' (utop 저장)');
  }catch(e){ if(typeof showToast==='function')showToast('요청 오류: '+e.message); if(window._rlsSubView==='status-beta'){ rlsBRenderCol1(); rlsBRenderCol2(); rlsBRenderCol3B(); } else { rlsRenderCol1(); rlsRenderCol3(); } }
}
// 우클릭 컨텍스트 메뉴 (이슈 추가/삭제)
function rlsCtxMenu(e, key){
  e.preventDefault(); e.stopPropagation();
  let m=document.getElementById('rls-ctx'); if(m)m.remove();
  m=document.createElement('div'); m.id='rls-ctx'; m.style.cssText='position:fixed;z-index:100080;background:#fff;border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.18);padding:4px;font-size:12.5px;min-width:170px;';
  m.style.left=Math.min(e.clientX, window.innerWidth-190)+'px'; m.style.top=Math.min(e.clientY, window.innerHeight-110)+'px';
  const item=function(icon,label,col,fn){ const b=document.createElement('div'); b.style.cssText='padding:8px 11px;border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:8px;color:'+(col||'#2a2f3a')+';'; b.innerHTML='<i class="ti '+icon+'"></i> '+label; b.onmouseenter=function(){b.style.background='#f0f4f9';}; b.onmouseleave=function(){b.style.background='';}; b.onclick=function(){ m.remove(); fn(); }; return b; };
  m.appendChild(item('ti-plus','Jira 이슈 추가 (키 입력)','#2d6fd4',function(){ rlsAddIssuePrompt(); }));
  if(key){ const _k=String(key).replace(/['"\\]/g,''); m.appendChild(item('ti-trash','이슈 삭제 — '+_k,'#c0392b',function(){ rlsDelIssue(_k); })); }
  document.body.appendChild(m);
  setTimeout(function(){ document.addEventListener('mousedown', _rlsCtxClose); },0);
}
function _rlsCtxClose(ev){ const m=document.getElementById('rls-ctx'); if(m&&!m.contains(ev.target))m.remove(); document.removeEventListener('mousedown',_rlsCtxClose); }
async function rlsAddIssuePrompt(){
  if(!_rlsProjKey||!_rlsVerName){ if(typeof showToast==='function')showToast('프로젝트·버전을 먼저 선택하세요'); return; }
  const inp=prompt('추가할 Jira 이슈 키 (예: '+_rlsProjKey+'-1234):'); if(!inp)return; const key=inp.trim().toUpperCase(); if(!key)return;
  const rk=_rlsRelKey(); _rlsStore[rk]=_rlsStore[rk]||{};
  if(_rlsStore[rk][key]){ if(typeof showToast==='function')showToast('이미 있는 이슈: '+key); _rlsSelIssue=key; rlsRenderCol1(); return; }
  if(typeof showToast==='function')showToast('Jira에서 '+key+' 조회 중…');
  try{ const d=await (await fetch('/api/jira/issue/'+encodeURIComponent(key))).json();
    if(d&&d.ok){ const f=d.fields||{}; const rf=d.renderedFields||{};
      _rlsStore[rk][key]={key:key, summary:f.summary||'', type:(f.issuetype&&f.issuetype.name)||'', status:(f.status&&f.status.name)||'', statusCat:(f.status&&f.status.statusCategory&&f.status.statusCategory.key)||'', priority:(f.priority&&f.priority.name)||'', assignee:(f.assignee&&f.assignee.displayName)||'', reporter:(f.reporter&&f.reporter.displayName)||'', created:(f.created||'').slice(0,10), source:'manual', tcs:[]};
      _rlsDetail[key]={description:f.description||'',descHtml:(rf.description||''),comments:((f.comment&&f.comment.comments)||[]),commentsHtml:((rf.comment&&rf.comment.comments)||[]),attachments:(f.attachment||[])};
    } else { _rlsStore[rk][key]={key:key, summary:'(수동 추가 — Jira 조회 실패)', type:'', status:'', statusCat:'', source:'manual', tcs:[]}; if(typeof showToast==='function')showToast('Jira 조회 실패 — 빈 항목 추가: '+String((d&&d.error)||'').slice(0,60)); }
  }catch(e){ _rlsStore[rk][key]={key:key, summary:'(수동 추가)', type:'', status:'', statusCat:'', source:'manual', tcs:[]}; }
  _rlsSelIssue=key; _rlsSave(); rlsRenderCol1();
}
function rlsDelIssue(key){ if(!confirm(key+' 이슈를 Release Summary에서 삭제할까요? (작성한 TC·Step도 함께 삭제)'))return; const rk=_rlsRelKey(); if(_rlsStore[rk])delete _rlsStore[rk][key]; if(_rlsSelIssue===key){_rlsSelIssue='';_rlsSelTC='';} _rlsSave(); rlsRenderCol1(); rlsRenderCol3(); }
// ── 1열: 버전 폴더 + 이슈 행 + 유형 필터 ──
function rlsRenderCol1(){
  const el=document.getElementById('rls-col1'); if(!el) return;
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const jq=s=>String(s==null?'':s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const tf=_rlsTypeFilter;
  // 사업자 목록 추출
  const allVers=_rlsProjVers();
  const opSet2={}; allVers.forEach(function(v){ opSet2[_rlsOperator(v)]=1; });
  const opList=Object.keys(opSet2).sort();
  const inSt2='font-size:12px;padding:2px 6px;border:1px solid var(--border);border-radius:6px;background:#fff;color:var(--text2);cursor:pointer;height:22px;';
  // 이슈유형 멀티드롭다운 레이블
  const tfTypes=[{k:'df',l:'Defect'},{k:'dev',l:'개발 Defect'},{k:'cr',l:'CR'},{k:'os',l:'OS Release(개발)'}];
  const tfLabel=(tf.size===0)?'이슈유형 전체':tfTypes.filter(function(t){return tf.has(t.k);}).map(function(t){return t.l;}).join(', ');
  // 헤더 1행: 타이틀 + 사업자 드롭다운 + 이슈유형 멀티드롭다운 + 버튼
  let h='<div style="padding:5px 6px 4px 10px;border-bottom:1px solid var(--border);background:#fff;flex-shrink:0;display:flex;align-items:center;gap:5px;flex-wrap:nowrap;">'
    +'<span style="font-size:13px;font-weight:800;color:var(--text2);white-space:nowrap;flex-shrink:0;"><i class="ti ti-folders" style="color:var(--blue);font-size:15px;"></i> 버전·이슈</span>'
    +'<span style="flex:1;"></span>'
    // 사업자 드롭다운
    +'<select onchange="rlsSetOpFilter(this.value)" style="'+inSt2+'">'
      +'<option value="" '+((!_rlsOpFilter)?'selected':'')+'>사업자 전체</option>'
      +opList.map(function(op){ return '<option value="'+op+'" '+(_rlsOpFilter===op?'selected':'')+'>'+op+'</option>'; }).join('')
    +'</select>'
    // 이슈유형 커스텀 멀티드롭다운 버튼
    +'<div style="position:relative;flex-shrink:0;">'
      +'<button onclick="rlsToggleTypeDD(event)" style="height:22px;padding:0 8px;font-size:12px;border:1px solid '+(tf.size>0?'#6938ef':'var(--border)')+';border-radius:6px;background:'+(tf.size>0?'#f4f3ff':'#fff')+';color:'+(tf.size>0?'#6938ef':'var(--text2)')+';cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:4px;">'
        +tfLabel+' <i class="ti ti-chevron-down" style="font-size:10px;"></i>'
      +'</button>'
    +'</div>'
    +'<button onclick="rlsExpandAll(true)" title="전체 펼치기" style="height:22px;padding:0 7px;border-radius:5px;border:1px solid var(--border);background:#fff;color:var(--text3);cursor:pointer;font-size:11px;font-weight:700;white-space:nowrap;flex-shrink:0;">전체 +</button>'
    +'<button onclick="rlsExpandAll(false)" title="전체 닫기" style="height:22px;padding:0 7px;border-radius:5px;border:1px solid var(--border);background:#fff;color:var(--text3);cursor:pointer;font-size:11px;font-weight:700;white-space:nowrap;flex-shrink:0;">전체 −</button>'
    +'<button onclick="_rlsColToggle(1)" title="열 접기" style="width:22px;height:22px;border-radius:5px;border:1px solid var(--border);background:#fff;color:var(--text3);cursor:pointer;padding:0;flex-shrink:0;"><i class="ti ti-layout-sidebar-left-collapse" style="font-size:12px;"></i></button>'
  +'</div>';
  h+='<div style="flex:1;overflow:auto;user-select:none;">';
  if(!_rlsProjKey){
    h+='<div style="padding:36px 14px;text-align:center;color:var(--text3);font-size:12px;line-height:1.8;"><i class="ti ti-list-search" style="font-size:24px;color:#c5ccd6;"></i><br>프로젝트를 선택하세요.</div>';
  } else {
    const jbaseCol1=(typeof _rlsCfg!=='undefined'&&_rlsCfg&&_rlsCfg.url)?String(_rlsCfg.url).replace(/\/+$/,''):'';
    const vers=_rlsProjVers();
    if(!vers.length){
      h+='<div style="padding:22px 12px;text-align:center;color:var(--text3);font-size:11.5px;line-height:1.85;"><i class="ti ti-inbox" style="font-size:22px;color:#c5ccd6;"></i><br>Sync 버튼으로 이슈를 불러오세요.</div>';
    } else {
      const filteredVers=_rlsOpFilter?vers.filter(function(v){return _rlsOperator(v)===_rlsOpFilter;}):vers;
      filteredVers.forEach(function(ver){
        const vKey='V@@'+ver;
        const open=!_rlsFolderClosed.has(vKey);
        const allIssues=_rlsIssueListFor(ver);
        const issues=(tf.size>0)?allIssues.filter(function(it){return tf.has(_rlsClassifyType(it.type));}):allIssues;
        const verSel=(_rlsVerName===ver);
        // 버전별 유형 개수
        var cntDf=0,cntDev=0,cntCr=0,cntOs=0;
        allIssues.forEach(function(it){ var cl=_rlsClassifyType(it.type); if(cl==='df')cntDf++; else if(cl==='dev')cntDev++; else if(cl==='cr')cntCr++; else if(cl==='os')cntOs++; });
        const tcTotal=allIssues.reduce(function(s,it){ return s+((_rlsStore[_rlsProjKey+'@@'+ver]||{})[it.key]||{tcs:[]}).tcs.length; },0);
        // 버전 카드 시작
        h+='<div style="margin:8px 8px 0;border-radius:10px;border:1px solid '+(verSel?'#a5b4fc':'#e2e8f0')+';overflow:hidden;box-shadow:'+(verSel?'0 2px 8px rgba(99,102,241,0.18)':'0 1px 3px rgba(0,0,0,0.06)')+';">'
          // 카드 헤더
          +'<div onclick="rlsToggleVerFolder(\''+jq(vKey)+'\',\''+jq(ver)+'\')" style="display:flex;align-items:center;gap:5px;padding:7px 8px;cursor:pointer;background:'+(verSel?'#4338ca':'#475569')+';user-select:none;">'
            +(allIssues.length?'<i class="ti ti-chevron-'+(open?'down':'right')+'" style="font-size:12.5px;color:rgba(255,255,255,0.7);flex-shrink:0;"></i>':'<span style="width:14px;flex-shrink:0;"></span>')
            +'<i class="ti ti-folder'+(open?'-open':'')+'" style="font-size:14px;color:rgba(255,255,255,0.85);flex-shrink:0;"></i>'
            +'<span style="font-size:12.5px;font-weight:700;color:#fff;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="'+esc(ver)+'">'+esc(ver)+'</span>'
            +'<span style="font-size:11px;flex-shrink:0;white-space:nowrap;display:flex;gap:4px;align-items:center;">'
              +(cntDf?'<span style="background:rgba(252,165,165,0.2);color:#fca5a5;font-weight:700;padding:0 5px;border-radius:10px;">D'+cntDf+'</span>':'')
              +(cntDev?'<span style="background:rgba(252,211,77,0.2);color:#fcd34d;font-weight:700;padding:0 5px;border-radius:10px;">개'+cntDev+'</span>':'')
              +(cntCr?'<span style="background:rgba(196,181,253,0.2);color:#c4b5fd;font-weight:700;padding:0 5px;border-radius:10px;">CR'+cntCr+'</span>':'')
              +(cntOs?'<span style="background:rgba(110,231,183,0.2);color:#6ee7b7;font-weight:700;padding:0 5px;border-radius:10px;">OS'+cntOs+'</span>':'')
              +(tcTotal?'<span style="background:rgba(233,213,255,0.2);color:#e9d5ff;font-weight:600;padding:0 5px;border-radius:10px;">TC'+tcTotal+'</span>':'')
            +'</span>'
            +'<button onclick="event.stopPropagation();rlsSyncVer(\''+jq(ver)+'\')" title="Sync" style="height:20px;padding:0 7px;display:flex;align-items:center;gap:2px;border-radius:5px;border:1px solid rgba(255,255,255,0.25);background:rgba(255,255,255,0.12);color:#fff;cursor:pointer;flex-shrink:0;font-size:11px;font-weight:600;white-space:nowrap;"><i class="ti ti-refresh" style="font-size:11px;"></i> Sync</button>'
            +'<button onclick="event.stopPropagation();rlsDelVer(\''+jq(_rlsProjKey)+'\',\''+jq(ver)+'\')" title="버전 삭제" style="height:20px;padding:0 6px;display:flex;align-items:center;border-radius:5px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#fca5a5;cursor:pointer;flex-shrink:0;font-size:11px;"><i class="ti ti-trash"></i></button>'
          +'</div>'
          // 이슈 목록 (펼쳐진 경우)
          +(open ? (function(){
            let ih='';
            if(issues.length){
              issues.forEach(function(it){
                const key=it.key; const sel=(_rlsSelIssue===key && _rlsVerName===ver);
                const detOpen=_rlsDetailOpen.has(key);
                const iv=_rlsIssueVerdictV(key,ver);
                const dotC=iv==='Pass'?'#12b76a':iv==='Fail'?'#f04438':'#c5cbd6';
                const _dd=(_rlsStore[_rlsProjKey+'@@'+ver]||{})[key]||{}; const tcN=(_dd.tcs||[]).length;
                const cl=_rlsClassifyType(it.type); const typeColor=cl==='df'?'#d92d20':cl==='dev'?'#e07000':cl==='cr'?'#6938ef':cl==='os'?'#079455':'#98a2b3';
                const stCol=(it.statusCat==='done')?'#067647':(it.statusCat==='indeterminate')?'#175cd3':'#667085';
                const createdStr=it.created?it.created.slice(0,10):'';
                ih+='<div style="border-top:1px solid #f2f4f7;background:'+(sel?'#eef2ff':'#fff')+';border-left:3px solid '+(sel?'#6366f1':'#fff')+';min-width:0;">'
                  +'<div style="display:flex;align-items:center;gap:4px;padding:5px 6px 5px 10px;min-width:0;">'
                    +'<button onclick="event.stopPropagation();rlsToggleIssueDetail(\''+jq(key)+'\')" title="'+(detOpen?'접기':'Jira 설명')+'" style="width:16px;height:16px;display:flex;align-items:center;justify-content:center;border-radius:3px;border:none;background:transparent;color:'+(detOpen?'#4338ca':'#94a3b8')+';cursor:pointer;flex-shrink:0;padding:0;">'
                      +'<i class="ti ti-chevron-'+(detOpen?'down':'right')+'" style="font-size:12.5px;"></i>'
                    +'</button>'
                    +'<span style="width:10px;height:10px;border-radius:50%;flex-shrink:0;background:'+dotC+';" title="'+(iv||'미평가')+'"></span>'
                    +(jbaseCol1?'<a href="'+jbaseCol1+'/browse/'+encodeURIComponent(key)+'" target="_blank" rel="noopener" onclick="event.stopPropagation();rlsSelectIssueV(\''+jq(key)+'\',\''+jq(ver)+'\')" style="font-size:12px;font-weight:700;color:'+(sel?'#4338ca':'#2d6fd4')+';flex-shrink:0;white-space:nowrap;cursor:pointer;font-family:ui-monospace,monospace;text-decoration:none;" title="Jira에서 열기">'+esc(key)+'</a>':'<span onclick="rlsSelectIssueV(\''+jq(key)+'\',\''+jq(ver)+'\')" style="font-size:12px;font-weight:700;color:'+(sel?'#4338ca':'#2d6fd4')+';flex-shrink:0;white-space:nowrap;cursor:pointer;font-family:ui-monospace,monospace;">'+esc(key)+'</span>')
                    +(it.type?'<span style="font-size:11px;font-weight:600;color:#344054;flex-shrink:0;white-space:nowrap;padding:0 6px;border-radius:20px;background:#f2f4f7;">'+esc(it.type)+'</span>':'')
                    +(it.issuePhase?'<span style="font-size:11px;font-weight:600;color:#344054;flex-shrink:0;white-space:nowrap;padding:0 6px;border-radius:20px;background:#f2f4f7;">'+esc(it.issuePhase)+'</span>':'')
                    +(it.problemType?'<span style="font-size:11px;font-weight:600;color:#344054;flex-shrink:0;white-space:nowrap;padding:0 6px;border-radius:20px;background:#f2f4f7;">'+esc(it.problemType)+'</span>':'')
                    +(it.status?'<span style="font-size:11px;font-weight:700;color:'+stCol+';background:#f2f4f7;border-radius:20px;padding:0 6px;flex-shrink:0;white-space:nowrap;">'+esc(it.status)+'</span>':'')
                    +(it.reporter?'<span style="font-size:11px;color:#667085;flex-shrink:0;white-space:nowrap;background:#f2f4f7;border-radius:5px;padding:1px 6px;"><span style="font-size:10px;color:#98a2b3;">보고자</span> '+esc(it.reporter)+'</span>':'')
                    +(it.assignee?'<span style="font-size:11px;color:#667085;flex-shrink:0;white-space:nowrap;background:#f2f4f7;border-radius:5px;padding:1px 6px;"><span style="font-size:10px;color:#98a2b3;">담당자</span> '+esc(it.assignee)+'</span>':'')
                    +(createdStr?'<span style="font-size:11px;color:#b0b7c3;flex-shrink:0;white-space:nowrap;"><i class="ti ti-calendar" style="font-size:9px;"></i> '+esc(createdStr)+'</span>':'')
                    +'<span style="flex:1;"></span>'
                    +(tcN?'<span style="font-size:11.5px;font-weight:700;color:#6938ef;background:#f4f3ff;border-radius:5px;padding:1px 6px;flex-shrink:0;">TC'+tcN+'</span>':'')
                    +'<button onclick="event.stopPropagation();rlsSelectIssueV(\''+jq(key)+'\',\''+jq(ver)+'\')" title="TC 보기" style="width:16px;height:16px;display:flex;align-items:center;justify-content:center;border-radius:3px;border:1px solid '+(sel?'#2d6fd4':'#e4e7ec')+';background:'+(sel?'#eff6ff':'#fafafa')+';color:'+(sel?'#2d6fd4':'#b0b7c3')+';cursor:pointer;flex-shrink:0;padding:0;">'
                      +'<i class="ti ti-chevron-right" style="font-size:9px;"></i>'
                    +'</button>'
                  +'</div>'
                  +(it.summary?'<div onclick="rlsSelectIssueV(\''+jq(key)+'\',\''+jq(ver)+'\')" data-rls-tip="'+esc(key)+'|'+esc(it.summary)+'|'+esc(it.type||'')+'|'+esc(typeColor)+'" style="font-size:12px;color:#101828;font-weight:700;padding:0 6px 4px 32px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;">'+esc(it.summary)+'</div>':'')
                +'</div>'
                +(detOpen ? _rlsDetailHtml(key) : '');
              });
            } else {
              ih+='<div style="padding:8px 12px;font-size:12px;color:#b0b7c3;">'+(tf.size>0?'해당 유형 없음':'이슈 없음')+'</div>';
            }
            return ih;
          })() : '')
        +'</div>';  // 카드 끝
      });
      h+='<div style="height:10px;"></div>';
    }
  }
  h+='</div>';
  el.innerHTML=h;
  // 이슈 제목 hover 툴팁 연결
  el.querySelectorAll('[data-rls-tip]').forEach(function(span){
    var parts=span.getAttribute('data-rls-tip').split('|');
    _rlsTip(span, parts[0]||'', parts[1]||'', parts[2]||'', parts[3]||'#667085');
  });
}
function rlsSetTypeFilter(f){ if(f==='') _rlsTypeFilter.clear(); else { if(_rlsTypeFilter.has(f)) _rlsTypeFilter.delete(f); else _rlsTypeFilter.add(f); } _rlsSaveTypeFilter(); if(window._rlsSubView==='status-beta'&&typeof rlsBRenderTree==='function'){ rlsBRenderTree(); } else { rlsRenderCol1(); } }
function rlsToggleTypeDD(e){
  e.stopPropagation();
  const existing=document.getElementById('rls-type-dd'); if(existing){ existing.remove(); return; }
  const btn=e.currentTarget; const br=btn.getBoundingClientRect();
  const dd=document.createElement('div'); dd.id='rls-type-dd';
  dd.style.cssText='position:fixed;z-index:99990;background:#fff;border:1px solid #d0d5dd;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.13);padding:6px;min-width:140px;';
  dd.style.left=br.left+'px'; dd.style.top=(br.bottom+4)+'px';
  const types=[{k:'',l:'전체',c:'#667085'},{k:'df',l:'Defect',c:'#d92d20'},{k:'dev',l:'개발 Defect',c:'#e07000'},{k:'cr',l:'CR',c:'#6938ef'},{k:'os',l:'OS Release(개발)',c:'#079455'}];
  types.forEach(function(t){
    const on=(t.k==='')?(_rlsTypeFilter.size===0):_rlsTypeFilter.has(t.k);
    const row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;gap:6px;padding:7px 12px;border-radius:7px;cursor:pointer;font-size:12.5px;font-weight:600;color:'+(on?t.c:'#344054')+';background:'+(on?t.c+'15':'transparent')+';';
    row.innerHTML=(on?'<i class="ti ti-check" style="font-size:11px;color:'+t.c+';flex-shrink:0;"></i>':'<span style="width:11px;flex-shrink:0;"></span>')+t.l;
    row.onmouseenter=function(){ if(!on) row.style.background='#f9fafb'; };
    row.onmouseleave=function(){ if(!on) row.style.background='transparent'; };
    row.onclick=function(e2){ e2.stopPropagation(); rlsSetTypeFilter(t.k); dd.remove(); };
    dd.appendChild(row);
  });
  document.body.appendChild(dd);
  setTimeout(function(){ document.addEventListener('mousedown',function _c(ev){ if(!dd.contains(ev.target)){ dd.remove(); document.removeEventListener('mousedown',_c); } }); },0);
}
function rlsExpandAll(open){ const vers=_rlsProjVers(); vers.forEach(function(ver){ const vKey='V@@'+ver; if(open) _rlsFolderClosed.delete(vKey); else _rlsFolderClosed.add(vKey); }); _rlsSaveFolders(); rlsRenderCol1(); }
function rlsToggleVerFolder(vKey, ver){
  if(_rlsFolderClosed.has(vKey)) _rlsFolderClosed.delete(vKey); else _rlsFolderClosed.add(vKey);
  _rlsSaveFolders();
  if(_rlsVerName!==ver){ _rlsVerName=ver; const vsel=document.getElementById('rls-ver'); if(vsel)vsel.value=ver; try{localStorage.setItem('utop_rls_ver',ver);}catch(e){} }
  rlsRenderCol1();
}
function rlsSelectVer(ver){ _rlsVerName=ver; const vsel=document.getElementById('rls-ver'); if(vsel)vsel.value=ver; try{localStorage.setItem('utop_rls_ver',ver);}catch(e){} _rlsSelIssue=''; _rlsSelTC=''; rlsRenderCol1(); rlsRenderCol3(); }
// ── 2열: 선택 버전의 이슈(Defect) 목록 ──
// ── 2열: 선택 이슈의 Jira 설명 + 댓글 ──
function rlsRenderCol2(){
  const el=document.getElementById('rls-col2'); if(!el) return;
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const jbase=(typeof _rlsCfg!=='undefined'&&_rlsCfg&&_rlsCfg.url)?String(_rlsCfg.url).replace(/\/+$/,''):'';
  const headColor='#00875a';
  // 헤더
  let h='<div style="padding:6px 6px 6px 10px;border-bottom:1px solid var(--border);background:#fff;flex-shrink:0;display:flex;align-items:center;gap:5px;">'
    +'<span style="font-size:13px;font-weight:800;color:var(--text2);white-space:nowrap;"><i class="ti ti-file-description" style="color:'+headColor+';font-size:15px;"></i> Jira 설명</span>'
    +'<span style="flex:1;"></span>'
    +'<button onclick="_rlsColToggle(2)" title="접기" style="width:21px;height:21px;border-radius:5px;border:1px solid var(--border);background:#fff;color:var(--text3);cursor:pointer;padding:0;"><i class="ti ti-layout-sidebar-left-collapse" style="font-size:12px;"></i></button>'
  +'</div>';
  if(!_rlsSelIssue){
    el.innerHTML=h+'<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 14px;text-align:center;color:var(--text3);font-size:12px;line-height:1.8;"><i class="ti ti-arrow-left" style="font-size:22px;color:#c5ccd6;"></i><br>← 이슈를 클릭하면<br>Jira 설명·댓글이 표시됩니다.</div>';
    return;
  }
  // 이슈 메타 행
  const rk=_rlsProjKey+'@@'+_rlsVerName; const it=(_rlsStore[rk]||{})[_rlsSelIssue]||{};
  const iv=_rlsIssueVerdictV(_rlsSelIssue,_rlsVerName);
  const dot=iv==='Pass'?'#12b76a':iv==='Fail'?'#f04438':'#d0d5dd';
  const stCol=(it.statusCat==='done')?'#067647':(it.statusCat==='indeterminate')?'#175cd3':'#98a2b3';
  h+='<div style="flex-shrink:0;padding:7px 10px;border-bottom:1px solid var(--border);background:#f6fdf9;display:flex;align-items:center;gap:7px;min-width:0;">'
    +'<span style="width:9px;height:9px;border-radius:50%;flex-shrink:0;background:'+dot+';"></span>'
    +'<a href="'+jbase+'/browse/'+encodeURIComponent(_rlsSelIssue)+'" target="_blank" rel="noopener" style="font-family:ui-monospace,monospace;font-size:12.5px;font-weight:800;color:#0052cc;flex-shrink:0;text-decoration:underline;text-underline-offset:2px;" onclick="event.stopPropagation()">'+esc(_rlsSelIssue)+'</a>'
    +(it.type?'<span style="font-size:10px;font-weight:600;color:#5e6c84;flex-shrink:0;">'+esc(it.type)+'</span>':'')
    +'<span style="font-size:11.5px;color:#172b4d;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="'+esc(it.summary||'')+'">'+esc(it.summary||'')+'</span>'
    +(it.status?'<span style="font-size:10px;font-weight:600;color:'+stCol+';flex-shrink:0;">'+esc(it.status)+'</span>':'')
  +'</div>';
  h+='<div style="flex:1;overflow:auto;background:var(--bg2);">';
  // 설명·댓글 내용
  const d=_rlsDetail[_rlsSelIssue];
  if(d===undefined){
    h+='<div style="padding:36px 14px;text-align:center;color:var(--text3);font-size:12px;"><i class="ti ti-loader" style="font-size:20px;"></i><br>불러오는 중…</div>';
  } else if(d===null){
    h+='<div style="padding:36px 14px;text-align:center;color:#e23d4d;font-size:12px;"><i class="ti ti-alert-circle" style="font-size:20px;"></i><br>상세를 불러오지 못했습니다.</div>';
  } else {
    const cmts=d.comments||[]; const ch=d.commentsHtml||[]; const atts=d.attachments||[];
    const attMap={}; atts.forEach(function(a){ if(a&&a.filename&&a.content) attMap[a.filename]=a.content; });
    h+='<div style="padding:14px 14px 20px;">';
    // 설명
    h+='<div style="font-size:11px;font-weight:800;color:#00875a;margin-bottom:7px;letter-spacing:0.5px;"><i class="ti ti-align-left"></i> 설명</div>';
    if(d.descHtml && d.descHtml.trim()){
      h+='<div class="rls-jira" style="border:1px solid #b6dece;border-radius:9px;padding:13px 16px;background:#fff;margin-bottom:14px;">'+_rlsJiraHtml(d.descHtml)+'</div>';
    } else {
      const desc=String(d.description||'').trim();
      h+='<div style="font-size:13px;color:#2a3140;line-height:1.7;white-space:pre-wrap;word-break:break-word;border:1px solid #b6dece;border-radius:9px;padding:13px 16px;background:#fff;margin-bottom:14px;">'+(desc?_rlsJiraText(desc,attMap):'<span style="color:var(--text3);">(설명 없음)</span>')+'</div>';
    }
    // 댓글
    h+='<div style="font-size:11px;font-weight:800;color:#00875a;margin-bottom:7px;letter-spacing:0.5px;"><i class="ti ti-message-2"></i> 댓글 '+cmts.length+'</div>';
    if(cmts.length){
      h+=cmts.map(function(c,i){
        const bh=(ch[i]&&ch[i].body)||'';
        const body=bh?_rlsJiraHtml(bh):('<span style="white-space:pre-wrap;word-break:break-word;">'+_rlsJiraText(String(c.body||''),attMap)+'</span>');
        const nm=(c.author&&c.author.displayName)||''; const av=nm?esc(nm.slice(0,1)):'?';
        const created=String(c.created||''); const updated=String(c.updated||'');
        const when=(updated||created).replace('T',' ').slice(0,16)+((updated&&updated!==created)?' · 수정됨':'');
        return '<div style="margin-bottom:13px;">'
          +'<div style="display:flex;align-items:center;gap:7px;margin-bottom:5px;">'
            +'<div style="width:26px;height:26px;border-radius:50%;background:#00875a;color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">'+av+'</div>'
            +'<b style="font-size:12.5px;color:#172b4d;">'+esc(nm)+'</b>'
            +'<span style="font-size:11px;color:var(--text3);">'+esc(when)+'</span>'
          +'</div>'
          +'<div class="rls-jira" style="border:1px solid #dfe1e6;border-radius:8px;padding:10px 14px;background:#fff;margin-left:33px;">'+body+'</div>'
        +'</div>';
      }).join('');
    } else {
      h+='<div style="font-size:11.5px;color:var(--text3);">(댓글 없음)</div>';
    }
    // 첨부 이미지
    const imgs=atts.filter(function(a){ return a&&a.content&&(/^image\//i.test(a.mimeType||'')||/\.(png|jpe?g|gif|bmp|svg)$/i.test(a.filename||'')); });
    if(imgs.length){
      h+='<div style="font-size:11px;font-weight:800;color:#00875a;margin:14px 0 7px;letter-spacing:0.5px;"><i class="ti ti-photo"></i> 첨부 이미지 '+imgs.length+'</div>'
       +'<div style="display:flex;gap:7px;flex-wrap:wrap;">'+imgs.map(function(a){ return _rlsJiraImg(a.content,'width:96px;height:96px;object-fit:cover;border:1px solid var(--border);border-radius:7px;cursor:zoom-in;'); }).join('')+'</div>';
    }
    h+='</div>';
  }
  h+='</div>';
  el.innerHTML=h;
}
function rlsToggleFolder(k){ if(_rlsFolderClosed.has(k))_rlsFolderClosed.delete(k); else _rlsFolderClosed.add(k); _rlsSaveFolders(); rlsRenderCol1(); }
function _rlsSaveFolders(){ try{ localStorage.setItem('utop_rls_folders', JSON.stringify(Array.from(_rlsFolderClosed))); }catch(e){} }   // 폴더 접힘 상태 영속화(마지막 상태 유지)
function _rlsLoadFolders(){ try{ const a=JSON.parse(localStorage.getItem('utop_rls_folders')||'[]'); if(Array.isArray(a)) _rlsFolderClosed=new Set(a); }catch(e){} }
// ── 멀티버전: 이 프로젝트의 모든 버전(스토어+선택) ──
function _rlsProjVers(){ const pref=_rlsProjKey+'@@'; let vers=Object.keys(_rlsStore).filter(function(k){return k.indexOf(pref)===0 && _rlsStore[k] && Object.keys(_rlsStore[k]).length;}).map(function(k){return k.slice(pref.length);}); if(_rlsVerName && vers.indexOf(_rlsVerName)<0) vers.push(_rlsVerName); vers.sort(function(a,b){return String(b).localeCompare(String(a),undefined,{numeric:true});}); return vers; }
function _rlsIssueListFor(ver){ const m=_rlsStore[_rlsProjKey+'@@'+ver]||{}; return Object.keys(m).map(function(k){ const o=m[k]||{}; o.key=o.key||k; return o; }).filter(function(o){ return (o.summary&&String(o.summary).trim()) || o.type || (Array.isArray(o.tcs)&&o.tcs.length); }).sort(function(a,b){ return String(a.key).localeCompare(String(b.key),undefined,{numeric:true}); }); }   // 제목·유형·TC 다 없는 빈 placeholder 숨김
function _rlsIssueVerdictV(key,ver){ const d=(_rlsStore[_rlsProjKey+'@@'+ver]||{})[key]; const tcs=(d&&d.tcs)||[]; if(!tcs.length) return ''; const vs=tcs.map(_rlsTCVerdict); if(vs.some(function(v){return v==='Fail';})) return 'Fail'; if(vs.every(function(v){return v==='Pass';})) return 'Pass'; return ''; }
// 이슈 유형 분류 — OS Release(개발) / 개발 Defect / CR / Defect (정확 구분, 그 외는 '')
function _rlsClassifyType(t){ t=String(t==null?'':t).trim(); if(/OS\s*Release/i.test(t)) return 'os'; if(/개발\s*Defect/i.test(t)) return 'dev'; if(/^CR\b/i.test(t)||/change\s*request/i.test(t)) return 'cr'; if(/^Defect$/i.test(t)||t==='결함') return 'df'; return ''; }
// 버전별 이슈유형 개수 — OS Release(개발)·개발 Defect·CR·Defect
function _rlsVerTypeCounts(projKey,ver){ const m=_rlsStore[projKey+'@@'+ver]||{}; let os=0,dev=0,cr=0,df=0; Object.keys(m).forEach(function(k){ const cl=_rlsClassifyType((m[k]||{}).type); if(cl==='os')os++; else if(cl==='dev')dev++; else if(cl==='cr')cr++; else if(cl==='df')df++; }); return {os:os,dev:dev,cr:cr,df:df,total:Object.keys(m).length}; }
// 이슈 클릭 → 그 이슈의 버전을 현재 버전으로 맞추고 선택(우측 TC만 표시)
function rlsSelectIssueV(key,ver){ if(_rlsVerName!==ver){ _rlsVerName=ver; const vsel=document.getElementById('rls-ver'); if(vsel)vsel.value=ver; try{localStorage.setItem('utop_rls_ver',ver);}catch(e){} _rlsSelIssue=''; } rlsSelectIssue(key); }
function rlsSyncVer(ver){ const vsel=document.getElementById('rls-ver'); if(vsel && ver)vsel.value=ver; _rlsVerName=ver; try{localStorage.setItem('utop_rls_ver',ver);}catch(e){} if(typeof rlsFetch==='function')rlsFetch(); }
function rlsDelVer(projKey, ver){
  var esc2=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');};
  var old=document.getElementById('rls-del-ver-modal'); if(old) old.remove();
  var m=document.createElement('div'); m.id='rls-del-ver-modal';
  m.style.cssText='position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(16,24,40,0.45);backdrop-filter:blur(2px);';
  m.innerHTML='<div style="background:#fff;border-radius:16px;box-shadow:0 20px 60px rgba(16,24,40,0.22);padding:28px 32px;min-width:340px;max-width:420px;text-align:center;">'
    +'<div style="width:48px;height:48px;border-radius:50%;background:#fee4e2;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">'
      +'<i class="ti ti-trash" style="font-size:22px;color:#d92d20;"></i>'
    +'</div>'
    +'<div style="font-size:16px;font-weight:800;color:#101828;margin-bottom:8px;">버전 삭제</div>'
    +'<div style="font-size:13.5px;color:#475467;line-height:1.6;margin-bottom:24px;">'
      +'<b style="color:#d92d20;">'+esc2(ver)+'</b> 버전을 삭제할까요?<br>'
      +'이슈·TC 데이터도 함께 삭제되며<br>복구할 수 없습니다.'
    +'</div>'
    +'<div style="display:flex;gap:10px;">'
      +'<button onclick="document.getElementById(\'rls-del-ver-modal\').remove()" style="flex:1;padding:10px;border-radius:8px;border:1px solid #d0d5dd;background:#fff;color:#344054;font-size:14px;font-weight:600;cursor:pointer;">취소</button>'
      +'<button id="rls-del-ver-confirm" style="flex:1;padding:10px;border-radius:8px;border:none;background:#d92d20;color:#fff;font-size:14px;font-weight:700;cursor:pointer;">삭제</button>'
    +'</div>'
  +'</div>';
  document.body.appendChild(m);
  m.addEventListener('click', function(e){ if(e.target===m) m.remove(); });
  document.getElementById('rls-del-ver-confirm').onclick=function(){
    m.remove();
    const rk=projKey+'@@'+ver; delete _rlsStore[rk];
    if(_rlsVerName===ver){_rlsVerName='';_rlsSelIssue='';_rlsSelTC='';}
    _rlsSave(); rlsRenderCol1(); rlsRenderCol3();
  };
}
// 펼치기(chevron) → 그 이슈의 지라 상세(설명·댓글)를 아래로 토글(선택과 무관)
// Beta 뷰에서는 트리를, 기본 뷰에서는 1열을 다시 그림
function _rlsDetailRerender(){ if(window._rlsSubView==='status-beta'){ if(typeof rlsBRenderTree==='function')rlsBRenderTree(); } else { rlsRenderCol1(); } }
async function rlsToggleIssueDetail(key){ if(_rlsDetailOpen.has(key)){ _rlsDetailOpen.delete(key); _rlsDetailRerender(); return; } _rlsDetailOpen.add(key); _rlsDetailRerender();
  if(_rlsDetail[key]==null){ _rlsDetail[key]=undefined; _rlsDetailRerender();
    try{ const d=await (await fetch('/api/jira/issue/'+encodeURIComponent(key))).json(); if(d&&d.ok){ const f=d.fields||{}; const rf=d.renderedFields||{}; _rlsDetail[key]={description:f.description||'', descHtml:(rf.description||''), comments:((f.comment&&f.comment.comments)||[]), commentsHtml:((rf.comment&&rf.comment.comments)||[]), attachments:(f.attachment||[])}; } else { _rlsDetail[key]=null; if(typeof showToast==='function')showToast('이슈 상세 조회 실패: '+String((d&&d.error)||'').slice(0,80)); } }catch(e){ _rlsDetail[key]=null; }
    _rlsDetailRerender();
  }
}
// ── Jira 댓글 body 생성 공통 ──
function _rlsBuildCommentBody(tcs, now){
  function esc2(s){ return String(s==null?'':s).replace(/\|/g,'\\|').replace(/\r?\n/g,' '); }
  function vMark(v){ return (v==='Pass'||v==='합격'||v==='실행완료')?'(/)':((v==='Fail'||v==='불합격')?'(x)':'(?)'); }
  function vText(v){ return v||'미완료'; }
  const lines=[];
  lines.push('시험 결과 보고 [utop · '+(now||'')+ ']');
  lines.push('');
  lines.push('TC 요약');
  lines.push('||#||TC 명||스텝 수||결과||');
  tcs.forEach(function(tc,i){
    const v=_rlsTCVerdict(tc);
    const steps=Array.isArray(tc.checks)?tc.checks.filter(function(c){return (c.kind||'cli')==='cli';}):tc.steps||[];
    lines.push('|'+(i+1)+'|'+esc2(tc.name||tc.title||tc.tcid||'TC'+(i+1))+'|'+steps.length+'|'+vMark(v)+' '+vText(v)+'|');
  });
  // TC별 상세 — Cycle "Test Procedure Details" 형식: Step 헤더 + 시험 목적/Test Data/Expected Result/Actual Data
  tcs.forEach(function(tc,i){
    const v=_rlsTCVerdict(tc);
    lines.push(''); lines.push('----');
    lines.push('TC'+(i+1)+'. '+esc2(tc.name||tc.title||tc.tcid||'TC'+(i+1))+'   '+vMark(v)+' '+vText(v));
    const isChecks=Array.isArray(tc.checks)&&tc.checks.some(function(c){return (c.kind||'cli')==='cli';});
    const steps=isChecks?tc.checks.filter(function(c){return (c.kind||'cli')==='cli';}):tc.steps||[];
    if(!steps.length){ lines.push('_등록된 스텝 없음_'); return; }
    steps.forEach(function(s,si){
      const sv=isChecks?(s.repeatResult||s.verdict||''):(s.verdict||'');
      const desc=isChecks?(s.desc||''):(s.action||s.name||s.desc||'');
      const data=isChecks?(s.cli||s.cmd||''):(s.cli||s.cmd||'');
      const exp=isChecks?(s.criteria||s.expected||''):(s.expected||s.criteria||'');
      let act=isChecks?(s.output||s.repeatOutput||s.actual||''):(s.actual||'');
      act=String(act||'').replace(/\n*─── 판정 근거 ───[\s\S]*$/,'').replace(/\n*─── 기준 비교 ───[\s\S]*$/,'').replace(/\n*─── 표 검증 ───[\s\S]*$/,'').trim();
      // Details 뷰와 동일한 세로 스택: 회색 라벨 위 · 값 아래 ({color} = Jira 위키 매크로, 굵게 없음)
      const lbl=function(t){ return '{color:#8a93a5}'+t+'{color}'; };
      lines.push('');
      lines.push('Step#'+(si+1)+'  '+vMark(sv)+' '+esc2(vText(sv)));
      lines.push(lbl('시험 목적'));
      lines.push(desc?String(desc).trim():'-');
      lines.push(lbl('TEST DATA'));
      lines.push(data?String(data).trim():'-');   // 배경 없는 일반 텍스트
      lines.push(lbl('EXPECTED RESULT'));
      lines.push(exp?('{color:#00875a}'+String(exp).trim()+'{color}'):'-');
      lines.push(lbl('ACTUAL DATA'));
      if(act){
        lines.push('{noformat}');
        lines.push(act.slice(0,2000));
        lines.push('{noformat}');
      } else lines.push('-');
    });
  });
  return lines.join('\n');
}

// ── Jira 댓글 미리보기 모달 ──
function rlsPreviewResultComment(key, ver, tcid){
  const rk=_rlsProjKey+'@@'+(ver||_rlsVerName);
  const issue=(_rlsStore[rk]||{})[key]||{};
  const allTcs=issue.tcs||[];
  const tcs=tcid?allTcs.filter(function(t){return (t.tcid||t.id)===tcid;}):allTcs;
  if(!tcs.length){ if(typeof showToast==='function')showToast('등록된 TC가 없습니다.'); return; }
  const now=new Date().toISOString().replace('T',' ').slice(0,16);
  const body=_rlsBuildCommentBody(tcs, now);
  const esc=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');};
  // 미리보기 HTML 렌더 (wiki 마크업을 보기 좋게)
  function wikiToHtml(txt){
    var h=esc(txt);
    // noformat 블록/인라인은 먼저 자리표로 보호 (출력에 |·h3. 등이 있어도 표/헤더 변환에 안 휩쓸리게)
    var _nf=[];
    h=h.replace(/\{noformat\}\n([\s\S]*?)\n\{noformat\}/g,function(m,c){ _nf.push({c:c,block:true}); return '@@NF'+(_nf.length-1)+'@@'; });
    h=h.replace(/\{noformat\}(.*?)\{noformat\}/g,function(m,c){ _nf.push({c:c,block:false}); return '@@NF'+(_nf.length-1)+'@@'; });
    // Details 뷰식 라벨 ({color:#8a93a5}라벨{color}) → 대문자 회색 라벨 (12.5px, 굵게 없음)
    h=h.replace(/^\{color:#8a93a5\}(.+?)\{color\}$/mg,'<div style="color:#8a93a5;font-size:12.5px;letter-spacing:0.3px;text-transform:uppercase;margin-top:8px;">$1</div>');
    // {{모노스페이스}} 인라인 코드
    h=h.replace(/\{\{([^}]+)\}\}/g,'<code style="background:#faf9f5;color:#14171d;border:1px solid #e6e2d6;border-radius:4px;padding:1px 6px;font-family:ui-monospace,Consolas,monospace;font-size:12.5px;">$1</code>');
    // {color:#xxx}값{color} → 색상 span (기대결과 녹색 등)
    h=h.replace(/\{color:(#[0-9a-fA-F]{3,8})\}([\s\S]*?)\{color\}/g,'<span style="color:$1;">$2</span>');
    h=h.replace(/^h3\. (.+)$/mg,'<div style="font-size:15px;font-weight:800;color:#101828;margin:14px 0 6px;border-bottom:2px solid #e4e7ec;padding-bottom:4px;">$1</div>');
    h=h.replace(/^h4\. (.+)$/mg,'<div style="font-size:13px;font-weight:700;color:#344054;margin:12px 0 5px;">$1</div>');
    h=h.replace(/^h5\. (.+)$/mg,'<div style="font-size:12.5px;font-weight:800;color:#2d6fd4;margin:10px 0 3px;">$1</div>');
    h=h.replace(/^----$/mg,'<hr style="border:none;border-top:1px solid #f2f4f7;margin:8px 0;">');
    h=h.replace(/^\|\|(.+)\|\|$/mg,function(m,row){ return '<tr style="background:#f8f9fc;">'+row.split('||').map(function(c){return '<th style="padding:5px 10px;border:1px solid #e4e7ec;font-size:12.5px;font-weight:700;color:#344054;white-space:nowrap;">'+c+'</th>';}).join('')+'</tr>'; });
    h=h.replace(/^\|(.+)\|$/mg,function(m,row){
      return '<tr>'+row.split('|').map(function(c){
        var bg=c.indexOf('(\/)&gt;')>=0||c.indexOf('(/)') >=0?'#f0fdf4':c.indexOf('(x)')>=0?'#fff1f2':'';
        var cc=c.replace(/\(\/\)/g,'<span style="color:#067647;font-weight:700;">✓</span>').replace(/\(x\)/g,'<span style="color:#b42318;font-weight:700;">✗</span>').replace(/\(\?\)/g,'<span style="color:#98a2b3;">—</span>');
        return '<td style="padding:5px 10px;border:1px solid #e4e7ec;font-size:12.5px;'+(bg?'background:'+bg+';':'')+' vertical-align:top;">'+cc+'</td>';
      }).join('')+'</tr>';
    });
    h=h.replace(/(<tr>[\s\S]*?<\/tr>)/g,function(m){ return '<table style="border-collapse:collapse;width:100%;margin:4px 0;">'+m+'</table>'; });
    h=h.replace(/\*([^*]+)\*/g,'<b>$1</b>');
    h=h.replace(/_([^_]+)_/g,'<i style="color:var(--text3);">$1</i>');
    h=h.replace(/\n/g,'<br>');
    // noformat 복원: Cycle "Test Procedure Details"의 Actual Data와 동일 색상 (베이지 배경 + 짙은 글자)
    h=h.replace(/@@NF(\d+)@@/g,function(m,i){
      var nf=_nf[+i]; if(!nf) return '';
      return nf.block
        ?'<pre style="background:#faf9f5;color:#2a2f3a;border:1px solid #e6e2d6;padding:7px 10px;border-radius:5px;font-family:ui-monospace,Consolas,monospace;font-size:12.5px;line-height:1.5;white-space:pre-wrap;word-break:break-all;margin:4px 0;">'+nf.c+'</pre>'
        :'<code style="background:#faf9f5;color:#14171d;border:1px solid #e6e2d6;border-radius:4px;padding:1px 6px;font-family:ui-monospace,Consolas,monospace;font-size:12.5px;">'+nf.c+'</code>';
    });
    return h;
  }
  // 모달 생성
  var old=document.getElementById('rls-comment-modal'); if(old) old.remove();
  var overlay=document.createElement('div'); overlay.id='rls-comment-modal';
  overlay.style.cssText='position:fixed;inset:0;z-index:10000;background:rgba(16,24,40,0.45);display:flex;align-items:center;justify-content:center;animation:fadeIn .15s ease;';
  overlay.innerHTML='<style>@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes slideUp{from{transform:translateY(24px);opacity:0}to{transform:translateY(0);opacity:1}}</style>'
    +'<div style="background:#fff;border-radius:16px;box-shadow:0 20px 60px rgba(16,24,40,0.22);width:min(860px,94vw);max-height:84vh;display:flex;flex-direction:column;animation:slideUp .18s ease;">'
      +'<div style="padding:16px 20px;border-bottom:1px solid #e4e7ec;display:flex;align-items:center;gap:10px;flex-shrink:0;">'
        +'<i class="ti ti-message-2-check" style="font-size:18px;color:#2d6fd4;"></i>'
        +'<span style="font-size:14px;font-weight:800;color:#101828;flex:1;">Jira 댓글 미리보기 — <span style="color:#2d6fd4;">'+esc(key)+'</span></span>'
        +'<span style="font-size:11px;color:#98a2b3;">'+esc(now)+'</span>'
        +'<button onclick="document.getElementById(\'rls-comment-modal\').remove()" style="width:28px;height:28px;border:none;background:#f2f4f7;border-radius:8px;cursor:pointer;font-size:16px;color:#667085;display:flex;align-items:center;justify-content:center;">✕</button>'
      +'</div>'
      // 등록 계정 입력 (비우면 기본 설정 계정으로 등록)
      +'<div style="padding:9px 20px;border-bottom:1px solid #e4e7ec;background:#f8f9fc;display:flex;align-items:center;gap:8px;flex-shrink:0;flex-wrap:wrap;">'
        +'<span style="font-size:12.5px;font-weight:700;color:#344054;white-space:nowrap;"><i class="ti ti-user-circle" style="color:#2d6fd4;font-size:14px;"></i> 등록 계정</span>'
        +'<input id="rlscmt-user" autocomplete="off" placeholder="Jira ID" style="font-size:12.5px;padding:6px 10px;border:1px solid #d0d5dd;border-radius:7px;outline:none;width:150px;box-sizing:border-box;">'
        +'<input id="rlscmt-pw" type="password" autocomplete="new-password" placeholder="비밀번호" style="font-size:12.5px;padding:6px 10px;border:1px solid #d0d5dd;border-radius:7px;outline:none;width:150px;box-sizing:border-box;">'
        +'<span style="font-size:11.5px;color:#98a2b3;">비우면 ubiQuoss-TOP 계정으로 등록됩니다 · 입력한 계정은 저장되지 않습니다</span>'
      +'</div>'
      +'<div style="flex:1;overflow:auto;padding:16px 20px;font-family:inherit;font-size:12.5px;line-height:1.6;">'+wikiToHtml(body)+'</div>'
      +'<div style="padding:12px 20px;border-top:1px solid #e4e7ec;display:flex;justify-content:flex-end;gap:8px;flex-shrink:0;">'
        +'<button onclick="document.getElementById(\'rls-comment-modal\').remove()" style="padding:8px 18px;border-radius:8px;border:1px solid #d0d5dd;background:#fff;color:#344054;font-size:13px;font-weight:600;cursor:pointer;">취소</button>'
        +'<button onclick="var _u=(document.getElementById(\'rlscmt-user\')||{}).value||\'\';var _p=(document.getElementById(\'rlscmt-pw\')||{}).value||\'\';document.getElementById(\'rls-comment-modal\').remove();rlsPostResultComment(\''+key.replace(/'/g,"\\'")+'\',(\''+((ver||_rlsVerName)||'').replace(/'/g,"\\'")+'\'),\''+(tcid||'').replace(/'/g,"\\'")+'\',_u,_p);" style="padding:8px 20px;border-radius:8px;border:none;background:#2d6fd4;color:#fff;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px;"><i class="ti ti-send"></i> Jira에 등록</button>'
      +'</div>'
    +'</div>';
  overlay.addEventListener('mousedown', function(e){ if(e.target===overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

// ── Jira 댓글로 시험 결과 등록 (tcid 지정 시 단건, 없으면 전체 · user/pw 지정 시 그 계정으로) ──
async function rlsPostResultComment(key, ver, tcid, user, pw){
  const rk=_rlsProjKey+'@@'+(ver||_rlsVerName);
  const issue=(_rlsStore[rk]||{})[key]||{};
  const allTcs=issue.tcs||[];
  const tcs=tcid?allTcs.filter(function(t){return (t.tcid||t.id)===tcid;}):allTcs;
  if(!tcs.length){ if(typeof showToast==='function')showToast('등록된 TC가 없습니다.'); return; }
  const _ovUser=String(user||'').trim();
  if(_ovUser&&!pw){ if(typeof showToast==='function')showToast('비밀번호를 입력하세요 (계정 지정 등록)'); return; }
  const now=new Date().toISOString().replace('T',' ').slice(0,16);
  const body=_rlsBuildCommentBody(tcs, now);
  try{
    if(typeof showToast==='function')showToast('Jira 댓글 등록 중…'+(_ovUser?(' ('+_ovUser+' 계정)'):''));
    const commentUrl='/api/jira/issue/'+encodeURIComponent(key)+'/comment';
    console.log('[RLS comment url]', commentUrl, 'key=', key);
    const payload={body:body};
    if(_ovUser&&pw){ payload.user=_ovUser; payload.pw=pw; }
    const resp=await fetch(commentUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const d=await resp.json();
    console.log('[RLS comment]', resp.status, d);
    if(d&&d.ok){
      // Jira 응답의 실제 작성자 표시 — 어떤 계정으로 등록됐는지 즉시 확인
      var _who=(d.comment&&d.comment.author&&(d.comment.author.displayName||d.comment.author.name))||'';
      if(typeof showToast==='function')showToast('Jira 댓글 등록 완료: '+key+(_who?(' — 작성자: '+_who):''));
      _rlsDetail[key]=null;
    } else {
      const errMsg=String((d&&d.error)||'알 수 없는 오류');
      console.error('[RLS comment error]', errMsg);
      if(typeof showToast==='function')showToast('등록 실패: '+errMsg.slice(0,200));
    }
  }catch(e){ console.error('[RLS comment exception]',e); if(typeof showToast==='function')showToast('요청 오류: '+e.message); }
}
// ── 이슈 제목 hover 툴팁 (마우스 오른쪽 고정 플로팅) ──
function _rlsTip(el, key, summary, type, typeColor){
  if(!el||!summary) return;
  var esc2=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');};
  function _getTip(){
    var tip=document.getElementById('rls-float-tip');
    if(!tip){
      tip=document.createElement('div'); tip.id='rls-float-tip';
      tip.style.cssText='position:fixed;z-index:99999;pointer-events:none;'
        +'background:#fff;border:1px solid #d0d9f7;border-radius:10px;'
        +'box-shadow:0 6px 24px rgba(16,24,40,0.14);padding:10px 16px;'
        +'max-width:480px;box-sizing:border-box;'
        +'left:-9999px;top:-9999px;visibility:hidden;';
      document.body.appendChild(tip);
    }
    return tip;
  }
  el.addEventListener('mouseenter', function(){
    var tip=_getTip();
    tip.innerHTML=
      '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:4px;">'
        +'<span style="font-size:12px;font-weight:700;color:#2d6fd4;white-space:nowrap;font-family:ui-monospace,monospace;">'+esc2(key)+'</span>'
        +(type?'<span style="font-size:11px;font-weight:700;color:'+typeColor+';padding:1px 8px;border-radius:20px;border:1px solid '+typeColor+';white-space:nowrap;">'+esc2(type)+'</span>':'')
      +'</div>'
      +'<div style="font-size:13px;color:#101828;font-weight:500;line-height:1.55;word-break:break-word;">'+esc2(summary)+'</div>';
    // col3 왼쪽 경계 기준으로 팝업 고정 (Beta는 rlsb-col3)
    var col3=document.getElementById('rls-col3')||document.getElementById('rlsb-col3');
    var r=el.getBoundingClientRect();
    var th=tip.offsetHeight||50;
    var x, y;
    if(col3){
      var cr=col3.getBoundingClientRect();
      x=cr.left+8;  // col3 안쪽 왼쪽에 고정
    } else {
      x=r.right+12;
    }
    y=r.top;
    if(y<4) y=4;
    if(y+th>window.innerHeight-4) y=window.innerHeight-th-4;
    tip.style.left=x+'px'; tip.style.top=y+'px'; tip.style.visibility='visible';
  });
  el.addEventListener('mouseleave', function(){
    var tip=document.getElementById('rls-float-tip');
    if(tip){ tip.style.left='-9999px'; tip.style.top='-9999px'; tip.style.visibility='hidden'; }
  });
}
function _rlsJiraImg(url,style){ return '<img src="/api/jira/attachment?url='+encodeURIComponent(url)+'" style="'+(style||'max-width:100%;border:1px solid var(--border);border-radius:6px;margin:5px 0;display:block;cursor:zoom-in;')+'" onclick="window.open(this.src,\'_blank\')" onerror="this.style.display=\'none\'">'; }
function _rlsJiraText(text, attMap){   // Jira 위키 텍스트 → 이미지(!파일!) 치환 렌더
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  let h=esc(String(text||''));
  h=h.replace(/!([^!|\n]+?\.(?:png|jpe?g|gif|bmp|svg))(\|[^!\n]*)?!/gi, function(m, fname){ const u=attMap[fname]||attMap[String(fname).trim()]; return u?_rlsJiraImg(u):m; });
  return h;
}
function _rlsJiraHtml(html){   // Jira renderedFields HTML → 이미지 src를 인증 프록시로, 상대 링크는 절대+새창으로
  let s=String(html||'');
  s=s.replace(/<script[\s\S]*?<\/script>/gi,'');
  const base=(_rlsCfg.url||'').replace(/\/+$/,'');
  s=s.replace(/(<img\b[^>]*?\bsrc=")([^"]+)(")/gi, function(m,a,u,b){ if(/^data:/i.test(u))return m; let full=u; if(/^\//.test(u))full=base+u; else if(!/^https?:/i.test(u))full=base+'/'+u; return a+'/api/jira/attachment?url='+encodeURIComponent(full)+b; });
  s=s.replace(/(<a\b[^>]*?\bhref=")(\/[^"]*)(")/gi, function(m,a,u,b){ return a+base+u+b+' target="_blank" rel="noopener"'; });
  return s;
}
function _rlsDetailHtml(key){
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const d=_rlsDetail[key];
  const wrap='<div style="margin:4px 8px 8px 30px;border:1px solid #e4e7ec;border-radius:10px;background:#fff;overflow:hidden;box-shadow:0 1px 4px rgba(16,24,40,0.06);">';
  if(d===undefined) return wrap+'<div style="padding:12px 16px;font-size:12px;color:var(--text3);"><i class="ti ti-loader"></i> 불러오는 중…</div></div>';
  if(d===null) return wrap+'<div style="padding:12px 16px;font-size:12px;color:#e23d4d;"><i class="ti ti-alert-circle"></i> 상세를 불러오지 못했습니다.</div></div>';
  const cmts=d.comments||[]; const ch=d.commentsHtml||[]; const atts=d.attachments||[];
  const attMap={}; atts.forEach(function(a){ if(a&&a.filename&&a.content) attMap[a.filename]=a.content; });
  let h=wrap;
  // 설명
  if(d.descHtml && d.descHtml.trim()){
    h+='<div style="padding:12px 16px;border-bottom:'+(cmts.length?'1px solid #f2f4f7':'none')+';">'
      +'<div class="rls-jira" style="font-size:13px;color:#172b4d;line-height:1.6;">'+_rlsJiraHtml(d.descHtml)+'</div>'
    +'</div>';
  } else {
    const desc=String(d.description||'').trim();
    h+='<div style="padding:12px 16px;border-bottom:'+(cmts.length?'1px solid #f2f4f7':'none')+';">'
      +'<div style="font-size:13px;color:#172b4d;line-height:1.6;white-space:pre-wrap;word-break:break-word;">'+(desc?_rlsJiraText(desc,attMap):'<span style="color:var(--text3);">(설명 없음)</span>')+'</div>'
    +'</div>';
  }
  // 댓글
  if(cmts.length){
    h+='<div style="padding:8px 16px 4px;background:#fff;border-top:1px solid #f2f4f7;">'
      +'<div style="font-size:11px;font-weight:700;color:#667085;margin-bottom:8px;"><i class="ti ti-message-2"></i> 댓글 '+cmts.length+'</div>';
    cmts.forEach(function(c,i){
      const bh=(ch[i]&&ch[i].body)||'';
      const body=bh?_rlsJiraHtml(bh):('<span style="white-space:pre-wrap;word-break:break-word;">'+_rlsJiraText(String(c.body||''),attMap)+'</span>');
      const nm=(c.author&&c.author.displayName)||''; const av=nm?esc(nm.slice(0,1)):'?';
      const when=(String(c.updated||c.created||'')).replace('T',' ').slice(0,16);
      h+='<div style="display:flex;gap:8px;margin-bottom:10px;align-items:flex-start;">'
        +'<div style="width:22px;height:22px;border-radius:50%;background:#2d6fd4;color:#fff;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;">'+av+'</div>'
        +'<div style="flex:1;min-width:0;">'
          +'<div style="font-size:11px;color:#667085;margin-bottom:3px;"><b style="color:#344054;">'+esc(nm)+'</b> · '+esc(when)+'</div>'
          +'<div class="rls-jira" style="font-size:12.5px;color:#172b4d;line-height:1.55;">'+body+'</div>'
        +'</div>'
      +'</div>';
    });
    h+='</div>';
  }
  // 첨부 이미지
  const imgs=atts.filter(function(a){ return a&&a.content&&(/^image\//i.test(a.mimeType||'')||/\.(png|jpe?g|gif|bmp|svg)$/i.test(a.filename||'')); });
  if(imgs.length){
    h+='<div style="padding:8px 16px;border-top:1px solid #f2f4f7;display:flex;gap:6px;flex-wrap:wrap;">'
      +imgs.map(function(a){ return _rlsJiraImg(a.content,'width:80px;height:80px;object-fit:cover;border:1px solid var(--border);border-radius:6px;cursor:zoom-in;'); }).join('')
    +'</div>';
  }
  h+='</div>';
  return h;
}
async function rlsSelectIssue(key){
  if(_rlsSelIssue===key){ rlsRenderCol1(); rlsRenderCol3(); return; }
  _rlsSelIssue=key; _rlsSelTC='';
  rlsRenderCol1(); rlsRenderCol3();
  if(_rlsSelIssue && _rlsDetail[key]==null){   // 미로드 → Jira 상세 조회
    _rlsDetail[key]=undefined; rlsRenderCol1();   // 1열에 로딩 표시
    try{ const d=await (await fetch('/api/jira/issue/'+encodeURIComponent(key))).json();
      if(d&&d.ok){ const f=d.fields||{}; const rf=d.renderedFields||{}; _rlsDetail[key]={description:f.description||'', descHtml:(rf.description||''), comments:((f.comment&&f.comment.comments)||[]), commentsHtml:((rf.comment&&rf.comment.comments)||[]), attachments:(f.attachment||[])}; } else { _rlsDetail[key]=null; if(typeof showToast==='function')showToast('이슈 상세 조회 실패: '+String((d&&d.error)||'').slice(0,80)); }
    }catch(e){ _rlsDetail[key]=null; }
    rlsRenderCol1();   // 로드 완료 후 1열 갱신 (인라인 설명 표시)
  }
}
function _rlsTCVerdictSel(tc){ const tv=_rlsTCVerdict(tc); const c=tv==='Pass'?'#00a872':tv==='Fail'?'#e53e5a':'#9aa3b2'; const sel=tc.override?(tc.verdict||''):''; return '<select onchange="rlsSetTCVerdict(\''+tc.id+'\',this.value)" title="수동 판정(스텝 자동집계 덮어쓰기)" style="font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:6px;border:1px solid '+c+';background:'+c+';color:#fff;cursor:pointer;">'+[['','자동'],['Pass','적합'],['Fail','부적합'],['N/A','N/A']].map(function(o){ return '<option value="'+o[0]+'" style="background:#fff;color:#222;" '+(sel===o[0]?'selected':'')+'>'+o[1]+'</option>'; }).join('')+'</select>'; }
// ── 2열: 선택 버전의 이슈(Defect) 목록 — rlsSelectVer 후 호출됨 ──
// ── RS TC 전체 상세(탐색기와 동일한 좌측 레일 UI)를 RS 전용 컨테이너에 임베드 ──
// ── Details 뷰: Cycle "Test Procedure Details"(cbExecHtml)와 동일한 스텝 블록 형식 ──
function _rlsProcDetailsHtml(tc){
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const _lab=function(l,v,color,mono){ return '<div style="font-size:11.5px;line-height:1.5;margin-top:5px;"><div style="font-weight:800;color:var(--text3);font-size:9.5px;letter-spacing:0.3px;text-transform:uppercase;margin-bottom:1px;">'+l+'</div><div style="min-width:0;'+(mono?'font-family:ui-monospace,monospace;':'')+'color:'+(color||'#1c1f27')+';white-space:pre-wrap;word-break:break-word;">'+v+'</div></div>'; };
  const isChecks=Array.isArray(tc.checks)&&tc.checks.some(function(c){return (c.kind||'cli')==='cli';});
  const steps=isChecks?tc.checks.filter(function(c){var k=c.kind||'cli';return k==='cli'||k==='wait'||k==='call';}):(tc.steps||[]);
  if(!steps.length) return '<div style="padding:30px;text-align:center;color:var(--text3);font-size:12px;">절차(스텝)가 없습니다 — Step 탭에서 작성하세요</div>';
  return steps.map(function(s,si){
    const sv=isChecks?(s.repeatResult||''):(s.verdict||'');
    const pass=(sv==='Pass'||sv==='합격'||sv==='실행완료'), fail=(sv==='Fail'||sv==='불합격');
    const sc=pass?'#00a872':fail?'#e53e5a':'#9aa3b2';
    const desc=isChecks?(s.desc||''):(s.action||s.desc||'');
    const cli=isChecks?(s.cli||''):(s.cli||s.cmd||'');
    const crit=isChecks?(s.criteria||''):(s.expected||s.criteria||'');
    let out=isChecks?String(s.output||''):String(s.actual||'');
    out=out.replace(/\n*─── (?:표 검증|기준 비교|판정 근거|Query 영역)[\s\S]*$/,'').replace(/\s+$/,'');
    const _ob=pass?'border:2px solid #00a872;':(fail?'border:2px solid #e53e5a;':'border:1px solid #e6e2d6;');
    const actLbl=isChecks?((s.kind==='wait')?('대기 '+(parseInt(s.waitSec||s.cli)||5)+'초'):(s.action||'CLI')):'수동';
    // Actual Data: Test Procedure Details와 동일 색상 (#faf9f5 배경 · #2a2f3a 글자 · 판정색 테두리)
    const outBox=out?'<span style="font-family:ui-monospace,monospace;display:block;background:#faf9f5;color:#2a2f3a;padding:7px 10px;border-radius:5px;overflow:auto;white-space:pre;line-height:1.5;font-size:12.5px;'+_ob+'">'+esc(out)+'</span>':'<span style="color:#c0c4cc;">(미실행)</span>';
    return '<div style="padding:11px 14px;border-bottom:1px solid #eef0f3;">'
      +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;">'
        +'<span style="font-size:13px;font-weight:800;color:var(--blue);">Step#'+(si+1)+'</span>'
        +'<span style="font-size:10px;color:var(--text3);background:#eef2f7;padding:1px 7px;border-radius:3px;">'+esc(actLbl)+'</span>'
        +'<span style="flex:1;"></span>'
        +'<span style="font-size:10.5px;font-weight:800;color:#fff;background:'+sc+';border-radius:7px;padding:2px 10px;">'+esc(sv||'미실행')+'</span>'
      +'</div>'
      +_lab('시험 목적', desc?esc(desc):'<span style="color:#c0c4cc;font-weight:400;">(미입력)</span>', '#1c1f27')
      +_lab('Test Data', cli?esc(cli):'<span style="color:#c0c4cc;">-</span>', '#14171d', true)
      +_lab('Expected Result', crit?esc(crit):'<span style="color:#c0c4cc;">—</span>', '#00875a')
      +_lab('Actual Data', outBox, '#1c1f27')
    +'</div>';
  }).join('');
}
function _rlsTcDetailHtml(tcid){
  const tc=(typeof tcList!=='undefined')?tcList.find(function(t){return (t.tcid===tcid)||(t.id===tcid);}):null;
  if(!tc||typeof expDetailShell!=='function'||typeof tcTabContent!=='function') return '<div style="padding:24px;color:var(--text3);font-size:12.5px;">TC 상세를 불러올 수 없습니다.</div>';
  const steps=((tc.checks||[]).filter(function(x){return (x.kind||'cli')==='cli';}).length||(tc.steps||[]).length);
  const tab=window['expTcTab_'+tcid]||(steps?'details':'procedure');   // 절차가 있으면 Details(읽기 뷰)를 기본으로
  const rail=[
    {id:'info',icon:'ti-info-circle',label:'Info'},
    {id:'env',icon:'ti-clipboard-text',label:'Environment'},
    {id:'topo',icon:'ti-topology-star',label:'Topology'},
    {id:'traffic',icon:'ti-antenna',label:'Traffic'},
    {id:'details',icon:'ti-list-details',label:'Details',badge:steps||''},
    {id:'procedure',icon:'ti-list-check',label:'Step',badge:steps||''},
    {id:'issue',icon:'ti-bug',label:'Issues'},
    {id:'history',icon:'ti-history',label:'History',badge:(tc.result_history||[]).length||''},
  ];
  const head=(typeof _procHeadBar==='function'&&tab==='procedure')?_procHeadBar(tcid):'';
  return expDetailShell('TC', String(tc.jira_issue_key||''), tc.name||tc.title||'', 'var(--green)', rail, tab,
    rail.map(function(t){return 'rlsSwitchTcTab(\''+tcid+'\',\''+t.id+'\')';}),
    (tab==='details'?_rlsProcDetailsHtml(tc):tcTabContent(tc,tab)),
    (typeof exportTCPDF==='function'?'exportTCPDF(\''+tcid+'\')':''), head,
    (typeof exportTCPPTX==='function'?'exportTCPPTX(\''+tcid+'\')':''), '', '', String(steps?steps+'단계':''), true, true);
}
function rlsRenderTcDetail(tcid){ const el=document.getElementById('rls-tcdetail'); if(!el) return; window._rlsActiveTcid=tcid; var _pSt=0; try{ var _ps=el.querySelector('[data-exp-scroll]'); if(_ps)_pSt=_ps.scrollTop; }catch(e){} el.innerHTML=_rlsTcDetailHtml(tcid); try{ var _ns=el.querySelector('[data-exp-scroll]'); if(_ns&&_pSt)_ns.scrollTop=_pSt; }catch(e){} }
function rlsSwitchTcTab(tcid,tab){ window['expTcTab_'+tcid]=tab; rlsRenderTcDetail(tcid); }
function _rlsStepField(lab,val,tcid,sid,field){ const eq=s=>String(s==null?'':s).replace(/"/g,'&quot;'); return '<div style="margin-bottom:4px;"><div style="font-size:9px;color:var(--text3);font-weight:600;">'+lab+'</div><input value="'+eq(val)+'" onblur="rlsSetStepField(\''+tcid+'\',\''+sid+'\',\''+field+'\',this.value)" style="width:100%;font-size:11.5px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;outline:none;box-sizing:border-box;"></div>'; }
function _rlsStepsHtml(tc){   // 선택 TC의 시험 절차(Step) 그리드 — TC UI 스타일
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const steps=tc.steps||[];
  let h='<div style="background:#faf9ff;border-top:1px solid #ece4fa;" onclick="event.stopPropagation()">';
  h+='<div style="display:flex;align-items:center;gap:7px;padding:7px 12px 7px 30px;border-bottom:1px solid #efe7fb;"><span style="font-size:11px;font-weight:800;color:#7c3aed;"><i class="ti ti-list-numbers"></i> 시험 절차 (Step)</span><span style="flex:1;"></span><button onclick="rlsLLMSteps()" title="이슈 설명·댓글로 Step 초안 생성 (Gemma)" style="font-size:10px;font-weight:700;padding:3px 9px;border-radius:6px;border:1px solid #9d7bff;background:#fff;color:#7c3aed;cursor:pointer;"><i class="ti ti-sparkles"></i> LLM Step</button></div>';
  h+=steps.length?steps.map(function(s,i){ const v=s.verdict||''; const c=v==='Pass'?'#00a872':v==='Fail'?'#e53e5a':'#9aa3b2';
    return '<div style="padding:8px 12px 8px 30px;border-bottom:1px solid #f1ecfa;">'+
      '<div style="display:flex;align-items:center;gap:7px;margin-bottom:5px;"><span style="font-size:11px;font-weight:800;color:#fff;background:#7c3aed;border-radius:5px;padding:1px 8px;">Step '+(i+1)+'</span><span style="flex:1;"></span><select onchange="rlsSetStepVerdict(\''+tc.id+'\',\''+s.id+'\',this.value)" style="font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:6px;border:1px solid '+c+';background:'+c+';color:#fff;cursor:pointer;">'+[['','미판정'],['Pass','적합'],['Fail','부적합'],['N/A','N/A']].map(function(o){ return '<option value="'+o[0]+'" style="background:#fff;color:#222;" '+(v===o[0]?'selected':'')+'>'+o[1]+'</option>'; }).join('')+'</select><button onclick="rlsDelStep(\''+tc.id+'\',\''+s.id+'\')" title="Step 삭제" style="border:none;background:none;color:#c0392b;cursor:pointer;font-size:12px;padding:0;"><i class="ti ti-trash"></i></button></div>'+
      _rlsStepField('동작 (Action)',s.action||'',tc.id,s.id,'action')+
      _rlsStepField('기대결과 (Expected)',s.expected||'',tc.id,s.id,'expected')+
      _rlsStepField('실제결과 (Actual)',s.actual||'',tc.id,s.id,'actual')+
    '</div>';
  }).join(''):'<div style="padding:10px 30px;font-size:11px;color:var(--text3);">스텝이 없습니다. 아래에서 추가하세요.</div>';
  h+='<div style="padding:9px 12px 11px 30px;"><button onclick="rlsAddStep()" style="width:100%;font-size:11.5px;font-weight:700;padding:7px;border-radius:7px;border:1px dashed #7c3aed;background:#fff;color:#7c3aed;cursor:pointer;"><i class="ti ti-plus"></i> Step 추가</button></div>';
  h+='</div>';
  return h;
}
// ── 3열: TC 목록(위) + Step 상세(아래) 통합 ──
function rlsRenderCol3(){
  const el=document.getElementById('rls-col3')||document.getElementById('rlsb-col3'); if(!el) return;
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const jq=s=>String(s==null?'':s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const headColor='#7c3aed';
  // 헤더 (Cycle 스타일)
  let h='<div style="display:flex;flex-direction:column;flex:1;min-height:0;height:100%;">'
    +'<div style="flex-shrink:0;padding:6px 6px 6px 10px;border-bottom:1px solid var(--border);background:#fff;display:flex;align-items:center;gap:5px;">'
    +'<span style="font-size:13px;font-weight:800;color:var(--text2);white-space:nowrap;"><i class="ti ti-list-details" style="color:'+headColor+';font-size:15px;"></i> TC·Step</span>'
    +'<span style="flex:1;"></span>'
    +'</div>';
  if(!_rlsSelIssue){
    el.innerHTML=h+'<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 16px;text-align:center;color:var(--text3);font-size:12px;line-height:1.7;"><i class="ti ti-arrow-left" style="font-size:22px;color:#c5ccd6;"></i><br>← 이슈를 선택하면<br>TC 및 Step이 표시됩니다.</div></div>';
    return;
  }
  _rlsEnsureTcs(_rlsSelIssue);
  const data=_rlsIssueData(_rlsSelIssue); const tcs=data.tcs||[];
  if(tcs.length && !tcs.some(function(t){return (t.tcid||t.id)===_rlsSelTC;})) _rlsSelTC=tcs[0].tcid||tcs[0].id;
  const selTc=tcs.find(function(t){return (t.tcid||t.id)===_rlsSelTC;});
  const _covPass=tcs.filter(function(_t){return _rlsTCVerdict(_t)==='Pass';}).length;
  // TC 서브 헤더
  h+='<div style="flex-shrink:0;padding:5px 10px;border-bottom:1px solid var(--border);background:#faf9ff;display:flex;align-items:center;gap:6px;">'
    +'<span style="font-size:11px;font-weight:800;color:'+headColor+';"><i class="ti ti-clipboard-check"></i> TC</span>'
    +'<span style="font-size:10px;color:#6938ef;background:#f0edff;border-radius:20px;padding:1px 7px;font-weight:700;">'+_covPass+'/'+tcs.length+'</span>'
    +'<span style="flex:1;"></span>'
    +'<button onclick="rlsAddTC()" title="TC 추가" style="width:22px;height:22px;display:flex;align-items:center;justify-content:center;border-radius:6px;border:1px dashed '+headColor+';background:#fff;color:'+headColor+';cursor:pointer;"><i class="ti ti-plus" style="font-size:12px;"></i></button>'
  +'</div>';
  // ── TC 목록 ──
  if(!tcs.length){
    h+='<div style="flex-shrink:0;padding:20px 14px;text-align:center;color:var(--text3);font-size:11.5px;border-bottom:1px solid var(--border);"><i class="ti ti-clipboard-plus" style="font-size:20px;color:#c5ccd6;"></i><br>TC 없음 · + 버튼으로 추가</div>';
  } else {
    h+='<div style="flex-shrink:0;overflow-x:auto;border-bottom:1px solid #d4f1e3;max-height:200px;overflow-y:auto;">';
    tcs.forEach(function(tc){
      const k=tc.tcid||tc.id; const on=(k===_rlsSelTC);
      const tv=_rlsTCVerdict(tc); const tc_c=tv==='Pass'?'#00a872':tv==='Fail'?'#e53e5a':'#9aa3b2';
      const stN=Array.isArray(tc.checks)?tc.checks.filter(function(c){return c&&(c.kind||'cli')==='cli';}).length:(tc.steps||[]).length;
      const creator=tc.created_by||tc.author||tc.owner||'';
      const modifier=tc.updated_by||'';
      const cDate=(tc.created_at||'').slice(0,10);
      const uDate=(tc.updated_at||'').slice(0,10);
      const metaParts=[];
      if(cDate) metaParts.push('<i class="ti ti-calendar-plus" style="font-size:10px;"></i> '+cDate);
      if(creator) metaParts.push('<i class="ti ti-user" style="font-size:10px;"></i> '+esc(creator));
      if(uDate && uDate!==cDate) metaParts.push('<i class="ti ti-calendar-edit" style="font-size:10px;"></i> '+uDate);
      if(modifier && modifier!==creator) metaParts.push('<i class="ti ti-user-edit" style="font-size:10px;"></i> '+esc(modifier));
      h+='<div onclick="rlsSelectTC(\''+k+'\')" style="padding:5px 8px;border-bottom:1px solid #eef0f3;cursor:pointer;background:'+(on?'#f0fff8':'#fff')+';border-left:3px solid '+(on?'#00a872':'transparent')+'">'
        // 1행: TC명 + 스텝수 + 판정 + 수동판정셀렉트 + 버튼
        +'<div style="display:flex;align-items:center;gap:5px;">'
          +'<span style="font-size:12.5px;font-weight:'+(on?'800':'600')+';color:'+(on?'#00875a':'#222')+';flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(tc.name||tc.title||k)+'</span>'
          +(stN?'<span style="font-size:11px;color:#7c3aed;white-space:nowrap;flex-shrink:0;"><i class="ti ti-list-numbers"></i> '+stN+'</span>':'')
          +'<span style="font-size:11px;font-weight:800;color:#fff;background:'+tc_c+';border-radius:8px;padding:1px 7px;flex-shrink:0;">'+(tv==='Pass'?'Pass':tv==='Fail'?'Fail':'미완료')+'</span>'
          +_rlsTCVerdictSel(tc)
          +'<button onclick="event.stopPropagation();rlsPreviewResultComment(\''+jq(_rlsSelIssue)+'\',\''+jq(_rlsVerName)+'\',\''+jq(k)+'\')" title="댓글 미리보기 후 등록" style="height:22px;padding:0 8px;display:flex;align-items:center;gap:3px;border-radius:5px;border:1px solid #2d6fd4;background:#eff6ff;color:#2d6fd4;cursor:pointer;flex-shrink:0;font-size:12px;font-weight:600;white-space:nowrap;"><i class="ti ti-eye" style="font-size:13px;"></i> 미리보기</button>'
          +'<button onclick="event.stopPropagation();rlsDelTC(\''+k+'\')" title="TC 삭제" style="border:none;background:none;color:#c0392b;cursor:pointer;font-size:13px;padding:0;flex-shrink:0;"><i class="ti ti-trash"></i></button>'
        +'</div>'
        // 2행: 작성일·작성자·수정일·수정자
        +(metaParts.length?'<div style="display:flex;align-items:center;gap:8px;margin-top:3px;padding-left:1px;flex-wrap:wrap;">'
          +metaParts.map(function(p){ return '<span style="font-size:10.5px;color:#98a2b3;display:flex;align-items:center;gap:2px;">'+p+'</span>'; }).join('')
        +'</div>':'')
      +'</div>';
    });
    h+='</div>';
  }
  // ── Step 상세 ──
  h+='<div style="flex:1;min-height:0;overflow:auto;">';
  if(!selTc){
    h+='<div style="padding:30px 14px;text-align:center;color:var(--text3);font-size:11.5px;">TC를 선택하면 Step이 표시됩니다.</div>';
  } else if(Array.isArray(selTc.checks) && typeof expDetailShell==='function'){
    h+='<div id="rls-tcdetail" style="height:100%;overflow:hidden;"></div>';
  } else {
    const steps=selTc.steps||[];
    h+='<div style="padding:7px 10px;border-bottom:1px solid var(--border);background:#f0eefc;display:flex;align-items:center;gap:7px;">'
      +'<span style="font-size:11.5px;font-weight:800;color:#7c3aed;"><i class="ti ti-list-numbers"></i> Step</span>'
      +'<span style="flex:1;min-width:0;font-size:10.5px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(selTc.name||selTc.title||'')+'</span>'
      +'<button onclick="rlsLLMSteps()" title="LLM으로 Step 초안 생성" style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px;border:1px solid #9d7bff;background:#fff;color:#7c3aed;cursor:pointer;"><i class="ti ti-sparkles"></i> LLM</button>'
    +'</div>';
    h+=steps.map(function(s,i){ const v=s.verdict||''; const c=v==='Pass'?'#00a872':v==='Fail'?'#e53e5a':'#9aa3b2';
      return '<div style="padding:8px 10px;border-bottom:1px solid #eef0f3;">'
        +'<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;">'
        +'<span style="font-size:10.5px;font-weight:800;color:#7c3aed;white-space:nowrap;">Step '+(i+1)+'</span>'
        +'<span style="flex:1;"></span>'
        +'<select onchange="rlsSetStepVerdict(\''+selTc.id+'\',\''+s.id+'\',this.value)" style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;border:1px solid '+c+';background:'+c+';color:#fff;cursor:pointer;">'+[['','미판정'],['Pass','적합'],['Fail','부적합'],['N/A','N/A']].map(function(o){ return '<option value="'+o[0]+'" style="background:#fff;color:#222;" '+(v===o[0]?'selected':'')+'>'+o[1]+'</option>'; }).join('')+'</select>'
        +'<button onclick="rlsDelStep(\''+selTc.id+'\',\''+s.id+'\')" title="Step 삭제" style="border:none;background:none;color:#c0392b;cursor:pointer;font-size:11px;padding:0;"><i class="ti ti-trash"></i></button>'
        +'</div>'
        +_rlsStepField('동작',s.action||'',selTc.id,s.id,'action')
        +_rlsStepField('기대결과',s.expected||'',selTc.id,s.id,'expected')
        +_rlsStepField('실제결과',s.actual||'',selTc.id,s.id,'actual')
      +'</div>';
    }).join('');
    h+=steps.length?'':'<div style="padding:18px 10px;text-align:center;color:var(--text3);font-size:11.5px;">Step 없음</div>';
    h+='<div style="padding:8px 10px;"><button onclick="rlsAddStep()" style="width:100%;font-size:11.5px;font-weight:700;padding:7px;border-radius:7px;border:1px dashed #7c3aed;background:#fff;color:#7c3aed;cursor:pointer;"><i class="ti ti-plus"></i> Step 추가</button></div>';
  }
  h+='</div></div>';
  el.innerHTML=h;
  window._rlsActiveTcid='';
  if(selTc && Array.isArray(selTc.checks) && typeof rlsRenderTcDetail==='function'){ window._rlsActiveTcid=_rlsSelTC; rlsRenderTcDetail(_rlsSelTC); }
}
function rlsSelectTC(id){ _rlsSelTC=(_rlsSelTC===id)?'':id; rlsRenderCol3(); }
function rlsAddTC(){ if(!_rlsSelIssue)return; const data=_rlsIssueData(_rlsSelIssue); data.tcs=data.tcs||[]; const nm='TC '+(data.tcs.length+1); const tcid='RLS_'+String(_rlsSelIssue).replace(/[^A-Za-z0-9_-]/g,'')+'_'+Date.now()+'_'+Math.floor(Math.random()*1000); const tc={tcid:tcid,id:tcid,name:nm,title:nm,steps:[],source_type:'JIRA_ISSUE',jira_issue_key:_rlsSelIssue,_rlsOnly:true,req_id:'',verdict:'',override:false}; data.tcs.push(tc); if(typeof tcList!=='undefined'&&!tcList.some(function(x){return (x.tcid||x.id)===tcid;}))tcList.push(tc); _rlsSelTC=tcid; _rlsSave(); rlsRenderCol1(); rlsRenderCol3(); }
function rlsDelTC(id){ if(!_rlsSelIssue)return; const data=_rlsIssueData(_rlsSelIssue); data.tcs=(data.tcs||[]).filter(function(t){return (t.tcid||t.id)!==id;}); if(typeof tcList!=='undefined'){ const i=tcList.findIndex(function(x){return (x.tcid||x.id)===id;}); if(i>=0&&tcList[i]&&tcList[i]._rlsOnly) tcList.splice(i,1); } if(_rlsSelTC===id)_rlsSelTC=''; _rlsSave(); rlsRenderCol1(); rlsRenderCol3(); }function rlsSetTCVerdict(id,v){ const tc=(_rlsIssueData(_rlsSelIssue).tcs||[]).find(function(t){return (t.tcid||t.id)===id;}); if(!tc)return; if(v===''){tc.override=false;}else{tc.override=true;tc.verdict=v;} _rlsSave(); rlsRenderCol1(); }
function rlsAddStep(){ if(!_rlsSelTC)return; const tc=(_rlsIssueData(_rlsSelIssue).tcs||[]).find(function(t){return t.id===_rlsSelTC;}); if(!tc)return; tc.steps=tc.steps||[]; tc.steps.push({id:_rlsNewId('st'),action:'',expected:'',actual:'',verdict:''}); _rlsSave(); rlsRenderCol1(); rlsRenderCol3(); }
function rlsDelStep(tcid,sid){ const tc=(_rlsIssueData(_rlsSelIssue).tcs||[]).find(function(t){return t.id===tcid;}); if(!tc)return; tc.steps=(tc.steps||[]).filter(function(s){return s.id!==sid;}); _rlsSave(); rlsRenderCol1(); rlsRenderCol3(); }
function rlsSetStepVerdict(tcid,sid,v){ const tc=(_rlsIssueData(_rlsSelIssue).tcs||[]).find(function(t){return t.id===tcid;}); if(!tc)return; const s=(tc.steps||[]).find(function(x){return x.id===sid;}); if(!s)return; s.verdict=v; _rlsSave(); rlsRenderCol1(); rlsRenderCol3(); }
function rlsSetStepField(tcid,sid,field,val){ const tc=(_rlsIssueData(_rlsSelIssue).tcs||[]).find(function(t){return t.id===tcid;}); if(!tc)return; const s=(tc.steps||[]).find(function(x){return x.id===sid;}); if(!s)return; s[field]=val; _rlsSave(); }
async function rlsLLMSteps(){
  if(!_rlsSelTC){ if(typeof showToast==='function')showToast('TC를 선택하세요'); return; }
  const tc=(_rlsIssueData(_rlsSelIssue).tcs||[]).find(function(t){return t.id===_rlsSelTC;}); if(!tc)return;
  const d=_rlsDetail[_rlsSelIssue]||{}; const isu=_rlsIssueData(_rlsSelIssue)||{};
  const ctx='[이슈 '+_rlsSelIssue+'] '+(isu.summary||'')+'\n[설명]\n'+String(d.description||'').slice(0,1500)+'\n[댓글]\n'+((d.comments||[]).slice(-5).map(function(c){return String(c.body||'');}).join('\n').slice(0,1000));
  const prompt='너는 네트워크 장비 시험 설계자다. 아래 Jira 개선 이슈가 실제로 수정되었는지 검증하는 시험 Step을 한국어로 3~6개 작성해라. 각 Step은 "동작 | 기대결과" 형식 한 줄로, 번호·머리말·설명 없이 줄바꿈으로만 구분.\n\n'+ctx;
  if(typeof showToast==='function')showToast('🤖 LLM Step 생성 중…');
  let out=''; try{ out=await _rlsLLM(prompt); }catch(e){}
  if(!out){ if(typeof showToast==='function')showToast('LLM 응답 없음 (LLM 설정 확인)'); return; }
  const lines=String(out).split(/\r?\n/).map(function(l){return l.replace(/^\s*\d+[.)]\s*/,'').replace(/^[-*]\s*/,'').trim();}).filter(function(l){return l.length>1;});
  tc.steps=tc.steps||[];
  lines.forEach(function(l,i){ const p=l.split('|'); tc.steps.push({id:_rlsNewId('st'+i),action:(p[0]||l).trim(),expected:(p[1]||'').trim(),actual:'',verdict:''}); });
  _rlsSave(); rlsRenderCol1(); rlsRenderCol3();
  if(typeof showToast==='function')showToast('✅ Step '+lines.length+'개 생성');
}
// ── Beta 보고서: 트리 선택 범위(사업자→하위 버전 전체 / 버전→그 버전 전체 / 이슈→그 이슈만) ──
// 데이터 수집 공용: 모달·PDF 양쪽에서 사용
function _rlsBReportData(){
  const pk=_rlsProjKey||'';
  const allVers=_rlsBOrderedVers(_rlsBVers());
  const issuesOf=function(ver){ const m=_rlsStore[pk+'@@'+ver]||{}; return Object.keys(m).map(function(k){ const o=m[k]||{}; o.key=o.key||k; return o; }).sort(function(a,b){ return String(a.key).localeCompare(String(b.key),undefined,{numeric:true}); }); };
  // 범위: 이슈 > 버전 > 사업자 > 전체
  let scopeLabel='전체', pairs=[];
  if(_rlsSelIssue){
    let fv='';
    allVers.some(function(v){ if((_rlsStore[pk+'@@'+v]||{})[_rlsSelIssue]){ fv=v; return true; } return false; });
    if(fv){ const it=(_rlsStore[pk+'@@'+fv]||{})[_rlsSelIssue]; it.key=it.key||_rlsSelIssue; pairs=[{ver:fv,it:it}]; scopeLabel='이슈 '+_rlsSelIssue; }
  } else if(_rlsBSelVer){
    pairs=issuesOf(_rlsBSelVer).map(function(it){ return {ver:_rlsBSelVer,it:it}; });
    scopeLabel='버전 '+_rlsBSelVer;
  } else if(_rlsBSelOp){
    allVers.filter(function(v){ return _rlsOperator(v)===_rlsBSelOp; }).forEach(function(v){ issuesOf(v).forEach(function(it){ pairs.push({ver:v,it:it}); }); });
    scopeLabel='사업자 '+_rlsBSelOp;
  } else {
    allVers.forEach(function(v){ issuesOf(v).forEach(function(it){ pairs.push({ver:v,it:it}); }); });
  }
  // 화면의 이슈유형 필터도 보고서에 반영
  const tfB=_rlsTypeFilter;
  if(tfB.size>0) pairs=pairs.filter(function(p){ return tfB.has(_rlsClassifyType(p.it.type||'')); });
  // 판정·TC 집계 레코드
  let pass=0,fail=0,na=0;
  const recs=pairs.map(function(p){
    const it=p.it;
    const iv=_rlsIssueVerdict(it);
    if(iv==='Pass')pass++; else if(iv==='Fail')fail++; else na++;
    const tcs=it.tcs||[];
    return {ver:p.ver, key:it.key, type:it.type||'', summary:it.summary||'',
      status:it.status||'', reporter:it.reporter||'', assignee:it.assignee||'',
      tcN:tcs.length,
      tp:tcs.filter(function(t){return _rlsTCVerdict(t)==='Pass';}).length,
      tf:tcs.filter(function(t){return _rlsTCVerdict(t)==='Fail';}).length,
      failTcs:tcs.filter(function(t){return _rlsTCVerdict(t)==='Fail';}).map(function(t){return t.name||t.title||t.id||'';}).filter(Boolean),
      tcs:tcs,   // TC 상세 내역 섹션용 원본
      iv:iv};
  });
  const tfTypes={df:'Defect',dev:'개발 Defect',cr:'CR',os:'OS Release(개발)'};
  const filterLabel=tfB.size?Array.from(tfB).map(function(k){return tfTypes[k]||k;}).join(', '):'전체';
  const rate=(pass+fail)?Math.round(pass/(pass+fail)*100):null;
  // 버전별 요약
  const verMap={};
  recs.forEach(function(r){ const s=verMap[r.ver]=verMap[r.ver]||{total:0,pass:0,fail:0,na:0}; s.total++; if(r.iv==='Pass')s.pass++; else if(r.iv==='Fail')s.fail++; else s.na++; });
  // 프로젝트 표시명 (키 · 이름) — 프로젝트 드롭다운의 선택 텍스트에서 추출, 없으면 키만
  let pkLabel=pk;
  try{ const sel=document.getElementById('rls-proj'); const t=sel&&sel.selectedIndex>=0?String(sel.options[sel.selectedIndex].text||'').trim():''; if(t&&t.indexOf(pk)>=0) pkLabel=t; }catch(e){}
  return {pk:pk, pkLabel:pkLabel, scopeLabel:scopeLabel, recs:recs, stats:{total:recs.length,pass:pass,fail:fail,na:na,rate:rate}, verMap:verMap, filterLabel:filterLabel};
}
function _rlsBVerdictBadge(iv, fs){
  const c=iv==='Pass'?'#00875a':iv==='Fail'?'#e53e5a':'#9aa3b2';
  return '<span style="font-size:'+(fs||'12.5px')+';font-weight:800;color:#fff;background:'+c+';border-radius:9px;padding:2px 10px;white-space:nowrap;-webkit-print-color-adjust:exact;print-color-adjust:exact;">'+(iv==='Pass'?'적합':iv==='Fail'?'부적합':'미판정')+'</span>';
}
function rlsBReport(){
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const D=_rlsBReportData();
  if(!D.recs.length){ if(typeof showToast==='function')showToast('보고서 대상 이슈가 없습니다 — 트리에서 사업자/버전/이슈를 선택하거나 Sync 하세요'); return; }
  let m=document.getElementById('rls-report-modal'); if(m)m.remove();
  m=document.createElement('div'); m.id='rls-report-modal'; m.style.cssText='position:fixed;inset:0;z-index:100060;background:rgba(15,22,38,0.55);display:flex;align-items:center;justify-content:center;padding:20px;';
  m.addEventListener('click',function(e){ if(e.target===m)m.remove(); });
  m.innerHTML='<div onclick="event.stopPropagation()" style="width:min(1500px,96vw);height:92vh;background:#fff;border-radius:14px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,0.4);">'+
    '<div style="padding:12px 18px;border-bottom:1px solid var(--border);background:#eef3fb;display:flex;align-items:center;gap:9px;flex-shrink:0;"><i class="ti ti-clipboard-check" style="font-size:19px;color:#2d6fd4;"></i><b style="font-size:15px;">Jira Issue Coverage 보고서</b><span style="font-size:12px;font-weight:700;color:#2d6fd4;background:rgba(45,111,212,0.1);border-radius:12px;padding:2px 10px;">'+esc(D.scopeLabel)+'</span><span style="font-size:11px;color:var(--text3);">PDF 출력 미리보기</span><span style="flex:1;"></span>'+
      '<button onclick="rlsBReportPDF()" style="font-size:12px;font-weight:700;padding:6px 14px;border-radius:7px;border:1px solid #c0392b;background:#fff;color:#c0392b;cursor:pointer;display:flex;align-items:center;gap:4px;"><i class="ti ti-printer"></i> PDF 저장</button>'+
      '<button onclick="document.getElementById(\'rls-report-modal\').remove()" style="width:28px;height:28px;border:none;border-radius:7px;background:#fff;color:var(--text2);cursor:pointer;"><i class="ti ti-x"></i></button></div>'+
    '<iframe id="rlsb-report-frame" style="flex:1;width:100%;border:none;background:#525659;"></iframe>'+
  '</div>';
  document.body.appendChild(m);
  // PDF 인쇄 창과 동일한 문서를 iframe으로 미리보기 (자동 인쇄만 제외)
  try{ document.getElementById('rlsb-report-frame').srcdoc=_rlsBReportDocHtml(D,false); }catch(e){}
}
// ── Beta 보고서 PDF 저장: 표지 + 섹션 구성의 정식 보고서 (A4 가로, 브라우저 "PDF로 저장") ──
function rlsBReportPDF(){
  const D=_rlsBReportData();
  if(!D.recs.length){ if(typeof showToast==='function')showToast('보고서 대상 이슈가 없습니다'); return; }
  const w=window.open('','_blank','width=1200,height=860');
  if(!w){ if(typeof showToast==='function')showToast('팝업이 차단되었습니다 — 팝업 허용 후 다시 시도하세요'); return; }
  w.document.write(_rlsBReportDocHtml(D,true));
  w.document.close();
}
// 보고서 문서 HTML 생성 (모달 미리보기·PDF 인쇄 공용) — autoPrint=true면 열리자마자 인쇄 대화상자
function _rlsBReportDocHtml(D, autoPrint){
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const now=new Date();
  const pad=function(n){ return String(n).padStart(2,'0'); };
  const dateStr=now.getFullYear()+'. '+pad(now.getMonth()+1)+'. '+pad(now.getDate())+'.';
  const nowStr=now.getFullYear()+'-'+pad(now.getMonth()+1)+'-'+pad(now.getDate())+' '+pad(now.getHours())+':'+pad(now.getMinutes());
  const who=(typeof currentUser!=='undefined'&&currentUser&&(currentUser.name||currentUser.username))||'';
  const verKeys=Object.keys(D.verMap);
  let sec=0; const S=function(t){ sec++; return '<h2>'+sec+'. '+t+'</h2>'; };

  // 표지
  const cover=
    '<div class="cover">'
      +'<div class="cv-band"></div>'
      +'<div class="cv-brand">ubiQuoss-TOP · Test Orchestration Platform</div>'
      +'<div class="cv-mid">'
        +'<div class="cv-doc">시험 결과 보고서</div>'
        +'<div class="cv-title">Jira Issue Coverage</div>'
        +'<div class="cv-rule"></div>'
        +'<div class="cv-scope">'+esc(D.pkLabel||D.pk)+'</div>'
        +'<div class="cv-kpis">'
          +'<div><b>'+D.stats.total+'</b><span>개선내역</span></div>'
          +'<div><b class="g">'+D.stats.pass+'</b><span>적합</span></div>'
          +'<div><b class="r">'+D.stats.fail+'</b><span>부적합</span></div>'
          +'<div><b class="p">'+(D.stats.rate==null?'-':D.stats.rate+'%')+'</b><span>적부율</span></div>'
        +'</div>'
      +'</div>'
      +'<table class="cv-info"><tbody>'
        +'<tr><th>작성일</th><td>'+dateStr+'</td><th>작성자</th><td>'+(who?esc(who):'-')+'</td></tr>'
        +'<tr><th>대상 프로젝트</th><td>'+esc(D.pkLabel||D.pk)+'</td><th>보고 범위</th><td>'+esc(D.scopeLabel)+'</td></tr>'
        +'<tr><th>이슈유형</th><td>'+esc(D.filterLabel)+'</td><th>생성 시스템</th><td>utop Jira Issue Coverage (자동 생성)</td></tr>'
      +'</tbody></table>'
    +'</div>';

  // 1. 보고 개요
  const overview=S('보고 개요')
    +'<p class="para">본 보고서는 <b>'+esc(D.pkLabel||D.pk)+'</b> 프로젝트의 <b>'+esc(D.scopeLabel)+'</b> 범위에 대한 Jira 개선 내역(이슈)별 검증 결과를 정리한 문서이다. '
    +'각 이슈에 대해 utop에 등록된 검증 TC의 수행 결과를 집계하여 종합판정하였다.</p>'
    +'<table class="crit"><thead><tr><th style="width:90px;">판정</th><th>기준</th></tr></thead><tbody>'
      +'<tr><td class="c"><span class="badge" style="background:#00875a;">적합</span></td><td>이슈에 연결된 검증 TC가 1개 이상이며 전부 Pass</td></tr>'
      +'<tr><td class="c"><span class="badge" style="background:#e53e5a;">부적합</span></td><td>연결된 검증 TC 중 Fail이 1건 이상</td></tr>'
      +'<tr><td class="c"><span class="badge" style="background:#9aa3b2;">미판정</span></td><td>검증 TC 미작성 또는 결과 미입력</td></tr>'
    +'</tbody></table>';

  // 2. 요약
  const summary=S('시험 결과 요약')
    +'<div class="kpi">'
      +'<div class="kc"><b style="color:#2d6fd4;">'+D.stats.total+'</b><span>개선내역</span></div>'
      +'<div class="kc"><b style="color:#00875a;">'+D.stats.pass+'</b><span>적합</span></div>'
      +'<div class="kc"><b style="color:#e53e5a;">'+D.stats.fail+'</b><span>부적합</span></div>'
      +'<div class="kc"><b style="color:#9aa3b2;">'+D.stats.na+'</b><span>미판정</span></div>'
      +'<div class="kc"><b style="color:#7c3aed;">'+(D.stats.rate==null?'-':D.stats.rate+'%')+'</b><span>적부율</span></div>'
    +'</div>';

  // 3. 버전별 결과 (버전 2개 이상일 때)
  const verSum=(verKeys.length>1)?(S('버전별 결과')+'<table><thead><tr><th>버전</th><th class="c" style="width:80px;">개선내역</th><th class="c" style="width:70px;">적합</th><th class="c" style="width:70px;">부적합</th><th class="c" style="width:70px;">미판정</th><th class="c" style="width:70px;">적부율</th></tr></thead><tbody>'
    +verKeys.map(function(v){ const s=D.verMap[v]; const r=(s.pass+s.fail)?Math.round(s.pass/(s.pass+s.fail)*100)+'%':'-';
      return '<tr><td>'+esc(v)+'</td><td class="c">'+s.total+'</td><td class="c g">'+s.pass+'</td><td class="c r">'+s.fail+'</td><td class="c n">'+s.na+'</td><td class="c p">'+r+'</td></tr>'; }).join('')+'</tbody></table>'):'';

  // 4. 개선 내역 상세
  const rows=D.recs.map(function(r,i){
    const vc=r.iv==='Pass'?'#00875a':r.iv==='Fail'?'#e53e5a':'#9aa3b2';
    return '<tr><td class="c">'+(i+1)+'</td><td class="nw">'+esc(r.ver)+'</td><td class="nw key">'+esc(r.key)+'</td><td class="nw">'+esc(r.type)+'</td><td>'+esc(r.summary)+'</td><td class="nw">'+esc(r.status)+'</td><td class="c nw">'+r.tcN+' (P'+r.tp+'·F'+r.tf+')</td><td class="c"><span class="badge" style="background:'+vc+';">'+(r.iv==='Pass'?'적합':r.iv==='Fail'?'부적합':'미판정')+'</span></td></tr>';
  }).join('');
  const detail=S('개선 내역 상세')
    +'<table><thead><tr><th style="width:32px;" class="c">No</th><th>버전</th><th>이슈</th><th>유형</th><th>개선 내역</th><th style="width:70px;">상태</th><th style="width:84px;" class="c">TC</th><th style="width:64px;" class="c">종합판정</th></tr></thead><tbody>'+rows+'</tbody></table>';

  // 5. 부적합 상세 (있을 때만)
  const fails=D.recs.filter(function(r){ return r.iv==='Fail'; });
  const failSec=fails.length?(S('부적합 상세')
    +'<table><thead><tr><th style="width:32px;" class="c">No</th><th>버전</th><th>이슈</th><th>개선 내역</th><th>Fail TC</th></tr></thead><tbody>'
    +fails.map(function(r,i){ return '<tr><td class="c">'+(i+1)+'</td><td class="nw">'+esc(r.ver)+'</td><td class="nw key">'+esc(r.key)+'</td><td>'+esc(r.summary)+'</td><td class="r">'+esc(r.failTcs.join(', ')||('Fail '+r.tf+'건'))+'</td></tr>'; }).join('')
    +'</tbody></table>'):'';

  // 6. TC 상세 내역 (TC가 등록된 이슈만)
  const vb=function(v){ const c=(v==='Pass'||v==='적합')?'#00875a':(v==='Fail'||v==='부적합')?'#e53e5a':'#9aa3b2'; return '<span class="badge" style="background:'+c+';">'+esc(v||'미실행')+'</span>'; };
  const withTc=D.recs.filter(function(r){ return r.tcs&&r.tcs.length; });
  const tcSec=withTc.length?(S('TC 상세 내역')
    +withTc.map(function(r){
      let h='<div class="tcissue"><span class="key">'+esc(r.key)+'</span> '+esc(r.summary)+' '+vb(r.iv==='Pass'?'적합':r.iv==='Fail'?'부적합':'미판정')+'</div>';
      r.tcs.forEach(function(tc,ti){
        const tv=_rlsTCVerdict(tc);
        h+='<div class="tchead">TC'+(ti+1)+'. '+esc(tc.name||tc.title||tc.tcid||'TC')+' '+vb(tv)+(tc.date?' <span class="tcdate">'+esc(tc.date)+'</span>':'')+'</div>';
        // 스텝: checks(cli 스텝) 우선, 없으면 steps
        const srows=[];
        if(Array.isArray(tc.checks)&&tc.checks.length){
          tc.checks.forEach(function(c){ if((c.kind||'cli')!=='cli')return;
            srows.push({a:c.desc||'', d:c.cli||'', e:c.criteria||'', act:String(c.output||'').replace(/\n[\s\S]*$/,'').slice(0,140), v:c.repeatResult||''}); });
        } else {
          (tc.steps||[]).forEach(function(s){ srows.push({a:s.action||s.desc||'', d:s.cli||s.cmd||'', e:s.expected||s.criteria||'', act:String(s.actual||'').slice(0,140), v:s.verdict||''}); });
        }
        if(srows.length){
          h+='<table><thead><tr><th class="c" style="width:30px;">No</th><th style="width:22%;">시험 내용</th><th style="width:18%;">Test Data</th><th style="width:20%;">기대 결과</th><th>실제 결과</th><th class="c" style="width:56px;">판정</th></tr></thead><tbody>'
            +srows.map(function(s,i){ const vc=(s.v==='Pass'||s.v==='합격')?'g':(s.v==='Fail'||s.v==='불합격')?'r':'n';
              return '<tr><td class="c">'+(i+1)+'</td><td>'+esc(s.a)+'</td><td class="mono">'+esc(s.d)+'</td><td>'+esc(s.e)+'</td><td>'+esc(s.act)+'</td><td class="c '+vc+'">'+esc(s.v||'-')+'</td></tr>'; }).join('')
            +'</tbody></table>';
        } else {
          h+='<p class="para" style="color:#9aa3b2;margin:2px 0 8px;">등록된 스텝이 없습니다.</p>';
        }
      });
      return h;
    }).join('')):'';

  return '<html><head><title>Jira Issue Coverage 시험 결과 보고서 — '+esc(D.pk)+'</title><style>'
    +'@page{size:A4 landscape;margin:12mm;}'
    +'*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}'
    +"body{font-family:'Malgun Gothic','Segoe UI',sans-serif;color:#1c2333;margin:0;padding:0 6px;font-size:12px;}"
    // 표지
    +'.cover{height:182mm;display:flex;flex-direction:column;page-break-after:always;position:relative;}'
    +'.cv-band{height:10px;background:linear-gradient(90deg,#2d6fd4,#7c3aed);border-radius:0 0 4px 4px;}'
    +'.cv-brand{margin-top:14px;font-size:11px;font-weight:700;color:#8a93a5;letter-spacing:1px;}'
    +'.cv-mid{flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;}'
    +'.cv-doc{font-size:15px;font-weight:700;color:#2d6fd4;letter-spacing:6px;margin-bottom:10px;}'
    +'.cv-title{font-size:40px;font-weight:800;color:#16233c;letter-spacing:-0.5px;}'
    +'.cv-rule{width:70px;height:4px;background:#2d6fd4;border-radius:2px;margin:18px auto;}'
    +'.cv-scope{font-size:16px;font-weight:700;color:#3a4254;margin-bottom:26px;}'
    +'.cv-kpis{display:flex;gap:14px;justify-content:center;}'
    +'.cv-kpis>div{min-width:110px;border:1px solid #d8dee8;border-radius:10px;padding:12px 10px;}'
    +'.cv-kpis b{display:block;font-size:24px;color:#2d6fd4;margin-bottom:3px;} .cv-kpis span{font-size:11px;color:#5a6372;font-weight:700;}'
    +'.cv-kpis b.g{color:#00875a;} .cv-kpis b.r{color:#e53e5a;} .cv-kpis b.p{color:#7c3aed;}'
    +'.cv-info{width:100%;border-collapse:collapse;margin-top:auto;}'
    +'.cv-info th{background:#eef2f8;font-size:11px;color:#3a4254;text-align:left;padding:7px 12px;border:1px solid #d8dee8;width:110px;}'
    +'.cv-info td{font-size:12px;font-weight:600;padding:7px 12px;border:1px solid #d8dee8;}'
    // 본문
    +'h2{font-size:14.5px;margin:18px 0 8px;color:#16233c;border-left:4px solid #2d6fd4;padding-left:9px;page-break-after:avoid;}'
    +'.para{font-size:12px;line-height:1.75;color:#2b3446;margin:0 0 10px;}'
    +'.crit td,.crit th{font-size:11.5px;}'
    +'.kpi{display:flex;gap:8px;margin-bottom:6px;} .kc{flex:1;border:1px solid #d8dee8;border-radius:8px;padding:10px 6px;text-align:center;}'
    +'.kc b{display:block;font-size:20px;margin-bottom:2px;} .kc span{font-size:10.5px;color:#5a6372;font-weight:700;}'
    +'table{width:100%;border-collapse:collapse;margin-bottom:8px;page-break-inside:auto;}'
    +'thead{display:table-header-group;} tr{page-break-inside:avoid;}'
    +'th{background:#eef2f8;font-size:11px;color:#3a4254;text-align:left;padding:6px 8px;border:1px solid #d8dee8;}'
    +'td{font-size:11.5px;padding:5px 8px;border:1px solid #e4e8ef;vertical-align:top;}'
    +'tbody tr:nth-child(even){background:#fafbfd;}'
    +'.c{text-align:center;} .nw{white-space:nowrap;} .key{font-family:Consolas,monospace;color:#2684ff;font-weight:700;}'
    +'.g{color:#00875a;font-weight:700;} .r{color:#e53e5a;font-weight:700;} .n{color:#9aa3b2;} .p{color:#7c3aed;font-weight:700;}'
    +'.badge{display:inline-block;color:#fff;font-size:10.5px;font-weight:800;border-radius:9px;padding:2px 10px;}'
    +'.foot{margin-top:16px;font-size:10px;color:#9aa3b2;text-align:right;border-top:1px solid #e4e8ef;padding-top:6px;}'
    // TC 상세 내역
    +'.tcissue{margin:12px 0 4px;padding:7px 10px;background:#eef2f8;border-left:4px solid #2d6fd4;font-size:12.5px;font-weight:700;color:#16233c;page-break-after:avoid;}'
    +'.tchead{margin:7px 0 4px;font-size:12px;font-weight:700;color:#2b3446;page-break-after:avoid;}'
    +'.tcdate{font-size:10px;color:#8a93a5;font-weight:400;}'
    +'.mono{font-family:Consolas,monospace;font-size:10.5px;word-break:break-all;}'
    // 미리보기 전용: A4 가로 용지 시뮬레이션 (인쇄 시에는 body.preview 클래스가 없어 미적용)
    +'body.preview{background:#525659;padding:24px 0;}'
    +'body.preview .ppage{width:1123px;height:794px;background:#fff;margin:0 auto 20px;box-shadow:0 4px 22px rgba(0,0,0,0.4);position:relative;}'
    +'body.preview .pinner{position:absolute;inset:45px;overflow:hidden;}'
    +'body.preview .pinner>h2:first-child{margin-top:0;}'
    +'body.preview .pno{position:absolute;right:16px;bottom:9px;font-size:10px;color:#b8bfca;}'
    +'body.preview #doc-src{position:absolute;visibility:hidden;left:0;top:0;width:1033px;}'
    +'body.preview .cover{height:100%;}'
    +'</style></head><body'+(autoPrint?'':' class="preview"')+'>'
    +(function(){
      const content=cover+overview+summary+verSum+detail+failSec+tcSec
        +'<div class="foot">'+esc(D.pk)+' · '+esc(D.scopeLabel)+' · '+nowStr+(who?' · '+esc(who):'')+' — utop Jira Issue Coverage 자동 생성</div>';
      if(autoPrint){
        return content+'<scr'+'ipt>window.onload=function(){setTimeout(function(){window.print();},450);}<\/scr'+'ipt>';
      }
      // 미리보기: 블록/표 행 단위로 A4 페이지에 나눠 담는 페이지네이터
      return '<div id="doc-src">'+content+'</div><div id="pages"></div>'
        +'<scr'+'ipt>(function(){'
        +'var src=document.getElementById("doc-src"),out=document.getElementById("pages");'
        +'function newPage(){var p=document.createElement("div");p.className="ppage";var n=document.createElement("div");n.className="pinner";p.appendChild(n);out.appendChild(p);return n;}'
        +'var cur=newPage();'
        +'function fits(){return cur.scrollHeight<=cur.clientHeight+1;}'
        +'function shellOf(tb){var s=tb.cloneNode(false);var th=tb.querySelector("thead");if(th)s.appendChild(th.cloneNode(true));s.appendChild(document.createElement("tbody"));return s;}'
        +'var nodes=Array.prototype.slice.call(src.children);'
        +'nodes.forEach(function(node){'
          +'if(node.classList&&node.classList.contains("cover")){if(cur.childNodes.length)cur=newPage();cur.appendChild(node);cur=newPage();return;}'
          +'if(node.tagName==="TABLE"){'
            +'var rows=Array.prototype.slice.call(node.querySelectorAll("tbody tr"));'
            +'var t=shellOf(node);cur.appendChild(t);'
            +'rows.forEach(function(tr){'
              +'t.tBodies[0].appendChild(tr);'
              +'if(!fits()){t.tBodies[0].removeChild(tr);'
                +'if(t.tBodies[0].rows.length===0){var h2=(t.previousElementSibling&&t.previousElementSibling.tagName==="H2")?t.previousElementSibling:null;var shell=t;cur=newPage();if(h2)cur.appendChild(h2);cur.appendChild(shell);}'
                +'else{cur=newPage();t=shellOf(node);cur.appendChild(t);}'
                +'t.tBodies[0].appendChild(tr);}'
            +'});'
            +'return;}'
          +'cur.appendChild(node);'
          +'if(!fits()){cur.removeChild(node);var h2b=(cur.lastElementChild&&cur.lastElementChild.tagName==="H2")?cur.lastElementChild:null;cur=newPage();if(h2b)cur.appendChild(h2b);cur.appendChild(node);}'
        +'});'
        +'src.remove();'
        +'if(out.lastChild&&!out.lastChild.firstChild.childNodes.length)out.lastChild.remove();'
        +'Array.prototype.forEach.call(out.children,function(p,i){var n=document.createElement("div");n.className="pno";n.textContent=(i+1)+" / "+out.children.length;p.appendChild(n);});'
        +'})();<\/scr'+'ipt>';
    })()
    +'</body></html>';
}
function rlsReport(){
  if(window._rlsSubView==='status-beta'){ rlsBReport(); return; }   // Beta: 트리 선택 범위 기반
  const issues=_rlsIssueList();
  if(!issues.length){ if(typeof showToast==='function')showToast('저장된 이슈가 없습니다 (Sync 또는 우클릭 추가)'); return; }
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  let pass=0,fail=0,na=0;
  const rows=issues.map(function(it){ const iv=_rlsIssueVerdict(it.key); if(iv==='Pass')pass++; else if(iv==='Fail')fail++; else na++; const tcs=(_rlsIssueData(it.key).tcs||[]); const tp=tcs.filter(function(t){return _rlsTCVerdict(t)==='Pass';}).length; const tf=tcs.filter(function(t){return _rlsTCVerdict(t)==='Fail';}).length; const c=iv==='Pass'?'#00875a':iv==='Fail'?'#e53e5a':'#9aa3b2';
    return '<tr style="border-bottom:1px solid #eef0f3;"><td style="padding:6px 9px;font-family:ui-monospace,monospace;font-size:11px;color:#2684ff;font-weight:700;white-space:nowrap;">'+esc(it.key)+'</td><td style="padding:6px 9px;font-size:12px;">'+esc(it.summary||'')+'</td><td style="padding:6px 9px;text-align:center;font-size:11px;color:var(--text3);white-space:nowrap;">'+tcs.length+' (P'+tp+'·F'+tf+')</td><td style="padding:6px 9px;text-align:center;white-space:nowrap;"><span style="font-size:10.5px;font-weight:800;color:#fff;background:'+c+';border-radius:8px;padding:2px 9px;">'+(iv==='Pass'?'적합':iv==='Fail'?'부적합':'미판정')+'</span></td></tr>';
  }).join('');
  const total=issues.length; const rate=(pass+fail)?Math.round(pass/(pass+fail)*100):0;
  let m=document.getElementById('rls-report-modal'); if(m)m.remove();
  m=document.createElement('div'); m.id='rls-report-modal'; m.style.cssText='position:fixed;inset:0;z-index:100060;background:rgba(15,22,38,0.5);display:flex;align-items:center;justify-content:center;padding:24px;';
  m.addEventListener('click',function(e){ if(e.target===m)m.remove(); });
  m.innerHTML='<div onclick="event.stopPropagation()" style="width:min(900px,95vw);max-height:88vh;background:#fff;border-radius:14px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,0.4);">'+
    '<div style="padding:14px 18px;border-bottom:1px solid var(--border);background:#eef3fb;display:flex;align-items:center;gap:9px;"><i class="ti ti-clipboard-check" style="font-size:19px;color:#2d6fd4;"></i><b style="font-size:15px;">Release Summary 보고서 — '+esc(_rlsProjKey)+' · '+esc(_rlsVerName)+'</b><span style="flex:1;"></span><button onclick="document.getElementById(\'rls-report-modal\').remove()" style="width:28px;height:28px;border:none;border-radius:7px;background:#fff;color:var(--text2);cursor:pointer;"><i class="ti ti-x"></i></button></div>'+
    '<div style="padding:14px 18px;display:flex;gap:11px;flex-wrap:wrap;border-bottom:1px solid var(--border);">'+
      ['개선내역 '+total,'적합 '+pass,'부적합 '+fail,'미판정 '+na,'적부율 '+((pass+fail)?rate+'%':'-')].map(function(t,i){ const cols=['#2d6fd4','#00875a','#e53e5a','#9aa3b2','#7c3aed']; return '<div style="flex:1;min-width:90px;border:1px solid var(--border);border-radius:10px;padding:10px 12px;text-align:center;"><div style="font-size:18px;font-weight:800;color:'+cols[i]+';">'+t.split(' ')[1]+'</div><div style="font-size:10.5px;color:var(--text3);">'+t.split(' ')[0]+'</div></div>'; }).join('')+
    '</div>'+
    '<div style="flex:1;overflow:auto;padding:0 4px;"><table style="width:100%;border-collapse:collapse;"><thead><tr style="position:sticky;top:0;background:#f5f7fa;">'+['이슈','개선 내역','TC','종합판정'].map(function(t){return '<th style="text-align:left;padding:7px 9px;font-size:11px;font-weight:700;color:#3a4254;border-bottom:1px solid #c4cad3;">'+t+'</th>';}).join('')+'</tr></thead><tbody>'+rows+'</tbody></table></div>'+
  '</div>';
  document.body.appendChild(m);
}
// ── 이슈 등록 모달 (수동 시험 등 어디서나 호출) ──
// TC 스텝 배열을 전역 보관 (submit 시 사용)
var _jiTcSteps=[];
async function jiraIssueOpen(prefill){
  prefill=prefill||{};
  window._jiraIssueImg=prefill.image||'';
  window._jiraOnCreated=(typeof prefill.onCreated==='function')?prefill.onCreated:null;
  _jiTcSteps=Array.isArray(prefill.tcSteps)?prefill.tcSteps:[];
  window._jiPurpose=prefill.purpose||'';
  window._jiPrecondition=prefill.precondition||'';
  window._jiPhenomenon=prefill.phenomenon||'';
  var old=document.getElementById('jira-issue-modal'); if(old)old.remove();
  var cfg={}; try{ cfg=await (await fetch('/api/jira/config')).json(); }catch(e){}
  if(cfg&&cfg.url) _jiraCfg=cfg;   // 전역 설정 캐시 갱신 — 새로고침 직후에도 패널 설정·필드 기본값이 적용되도록 (설정 페이지 방문 없이)
  if(!cfg||!cfg.url||!cfg.token){ if(typeof showToast==='function')showToast('먼저 시스템 → Jira 연동 설정을 완료하세요'); showPage('sys-jira'); return; }
  var esc=function(s){return String(s==null?'':s).replace(/"/g,'&quot;');};
  var escH=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');};
  var inSt='width:100%;font-size:13px;padding:7px 10px;border:1px solid var(--border);border-radius:7px;outline:none;box-sizing:border-box;';
  var taSt=inSt+'resize:vertical;font-family:inherit;line-height:1.55;';
  var secHd=function(t,auto){
    return '<div style="display:flex;align-items:center;gap:6px;padding:6px 11px;background:#f8f9fb;border-bottom:1px solid var(--border);">'
      +'<span style="font-size:12px;font-weight:700;color:#344054;flex:1;">'+t+'</span>'
      +(auto?'<span style="font-size:10px;font-weight:700;background:#d1fae5;color:#065f46;border-radius:3px;padding:1px 6px;display:flex;align-items:center;gap:2px;"><i class="ti ti-robot" style="font-size:10px;"></i> 자동입력</span>':'')
      +'</div>';
  };
  var psec=function(hd,body){ return '<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;">'+hd+body+'</div>'; };
  var autoWrap=function(hint,inner){
    return '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;overflow:hidden;margin:8px;">'
      +'<div style="font-size:10.5px;color:#6b7280;padding:4px 10px;border-bottom:1px solid #d1fae5;display:flex;align-items:center;gap:4px;background:#f0fdf4;"><i class="ti ti-info-circle" style="font-size:11px;color:#059669;"></i> '+hint+'</div>'
      +inner+'</div>';
  };
  // 5. 시험 절차 및 결과 — Step별 목적+TEST DATA+기대결과+실제결과+RCA 통합
  var procResultHtml='';
  if(_jiTcSteps.length){
    var pr='<div style="padding:8px;display:flex;flex-direction:column;gap:8px;">';
    _jiTcSteps.forEach(function(s,i){
      var act=s.action||s.desc||'';
      var cmd=s.cmd||s.cli||'';
      var exp=s.expected||s.criteria||'';
      var out=s.repeatOutput||s.actual||'';
      var vrd=s.repeatResult||s.verdict||'';
      var rca=s.rca||'';
      var isFail=vrd==='Fail'||vrd==='불합격';
      var isPass=vrd==='Pass'||vrd==='합격';
      var vCol=isFail?'#991b1b':isPass?'#065f46':'#6b7280';
      var vBg=isFail?'#fef2f2':isPass?'#f0fdf4':'#f8f9fb';
      var vMark=isFail?'✘ Fail':isPass?'✔ Pass':'—';
      var aBg=isFail?'#fef2f2':isPass?'#f0fdf4':'#fff';
      var aCol=isFail?'#7f1d1d':isPass?'#14532d':'#374151';
      pr+='<div style="border:1px solid #bbf7d0;border-radius:6px;overflow:hidden;background:#fff;">'
        // 헤더: 번호 + 시험목적 + 판정
        +'<div style="display:flex;align-items:stretch;background:#e9fdf0;border-bottom:1px solid #bbf7d0;">'
          +'<div style="width:26px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#065f46;border-right:1px solid #bbf7d0;flex-shrink:0;">'+(i+1)+'</div>'
          +'<div style="flex:1;font-size:12px;color:#1e3a5f;padding:5px 8px;font-weight:600;">'+escH(act||cmd)+'</div>'
          +'<div style="width:70px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:'+vCol+';background:'+vBg+';border-left:1px solid #bbf7d0;flex-shrink:0;">'+vMark+'</div>'
        +'</div>'
        // TEST DATA (CLI)
        +(cmd?'<div style="display:flex;align-items:stretch;border-bottom:1px solid #f0fdf4;">'
          +'<div style="width:80px;font-size:10px;font-weight:700;color:#667085;padding:4px 7px;background:#f9fafb;border-right:1px solid #f2f4f7;flex-shrink:0;display:flex;align-items:center;">TEST DATA</div>'
          +'<div style="flex:1;font-family:ui-monospace,monospace;font-size:11px;color:#1e3a5f;padding:4px 8px;white-space:pre-wrap;word-break:break-all;">'+escH(cmd)+'</div>'
        +'</div>':'')
        // 기대결과
        +'<div style="display:flex;align-items:stretch;border-bottom:1px solid #f0fdf4;">'
          +'<div style="width:80px;font-size:10px;font-weight:700;color:#667085;padding:4px 7px;background:#f9fafb;border-right:1px solid #f2f4f7;flex-shrink:0;display:flex;align-items:center;">기대 결과</div>'
          +'<div style="flex:1;font-size:12px;color:#374151;padding:4px 8px;white-space:pre-wrap;word-break:break-word;">'+escH(exp||'—')+'</div>'
        +'</div>'
        // 실제결과
        +'<div style="display:flex;align-items:stretch;'+(isFail&&rca?'border-bottom:1px solid #fca5a5;':'')+'}">'
          +'<div style="width:80px;font-size:10px;font-weight:700;color:'+(isFail?'#b91c1c':isPass?'#059669':'#667085')+';padding:4px 7px;background:'+aBg+';border-right:1px solid '+(isFail?'#fca5a5':isPass?'#bbf7d0':'#f2f4f7')+';flex-shrink:0;display:flex;align-items:center;">실제 결과</div>'
          +'<div style="flex:1;font-family:ui-monospace,monospace;font-size:11px;color:'+aCol+';padding:4px 8px;background:'+aBg+';white-space:pre-wrap;word-break:break-all;">'+escH(out||'（미실행）')+'</div>'
        +'</div>'
        // RCA (Fail일 때만)
        +(isFail&&rca?'<div style="display:flex;align-items:stretch;">'
          +'<div style="width:80px;font-size:10px;font-weight:700;color:#b91c1c;padding:4px 7px;background:#fff5f6;border-right:1px solid #fca5a5;flex-shrink:0;display:flex;align-items:center;">RCA</div>'
          +'<div style="flex:1;font-size:11px;color:#7f1d1d;padding:4px 8px;background:#fff5f6;white-space:pre-wrap;word-break:break-word;">'+escH(rca)+'</div>'
        +'</div>':'')
      +'</div>';
    });
    pr+='</div>';
    procResultHtml=autoWrap('TC Procedure Details 절차·결과가 자동으로 채워집니다', pr);
  } else {
    procResultHtml='<div style="padding:8px 10px;"><textarea id="ji-p3" rows="5" oninput="jiraLivePreview()" placeholder="시험 절차 및 결과를 입력하세요" style="'+taSt+'"></textarea></div>';
  }
  // Kernel Log
  var logHtml='';
  if(_jiTcSteps.length){
    var logLines=[];
    _jiTcSteps.forEach(function(s){
      var cmd=s.cmd||s.cli||''; var out=s.repeatOutput||s.actual||'';
      if(cmd){ logLines.push('# '+cmd); if(out) logLines.push(out); logLines.push(''); }
    });
    if(logLines.length){
      logHtml=autoWrap('TC 실행 중 콘솔 출력이 자동으로 채워집니다',
        '<div style="font-family:ui-monospace,monospace;font-size:11px;padding:8px 10px;white-space:pre-wrap;word-break:break-all;color:#1e3a5f;line-height:1.5;max-height:120px;overflow-y:auto;">'+escH(logLines.join('\n'))+'</div>');
    }
  }
  if(!logHtml) logHtml='<div style="padding:8px 10px;"><textarea id="ji-p7" rows="3" oninput="jiraLivePreview()" placeholder="Kernel Log / Syslog 출력" style="'+taSt+'font-family:ui-monospace,monospace;font-size:11.5px;"></textarea></div>';

  var m=document.createElement('div'); m.id='jira-issue-modal';
  m.style.cssText='position:fixed;inset:0;background:rgba(15,20,30,0.5);z-index:100003;';
  var navH=(document.querySelector('.topnav-bar')||{}).offsetHeight||52;
  var mw=Math.min(1400, window.innerWidth-16), mh=window.innerHeight-navH;
  var mx=Math.round((window.innerWidth-mw)/2);
  m.innerHTML='<div id="jira-issue-panel" style="position:fixed;left:'+mx+'px;top:'+navH+'px;width:'+mw+'px;height:'+mh+'px;background:#fff;border-radius:0 0 10px 10px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 8px 40px rgba(0,0,0,0.35);will-change:transform;">'
    +'<div id="jira-issue-drag" style="padding:12px 20px;border-bottom:1px solid var(--border);background:linear-gradient(135deg,#2684ff,#0052cc);color:#fff;display:flex;align-items:center;gap:10px;flex-shrink:0;cursor:move;user-select:none;">'
      +'<i class="ti ti-brand-jira" style="font-size:20px;"></i>'
      +'<b style="font-size:15px;flex:1;">Jira 이슈 등록</b>'
      +'<button onclick="document.getElementById(\'jira-issue-modal\').remove()" style="width:28px;height:28px;border-radius:7px;border:none;background:rgba(255,255,255,0.2);color:#fff;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;"><i class="ti ti-x"></i></button>'
    +'</div>'
    +'<div style="display:flex;flex:1;overflow:hidden;">'
      // 왼쪽 폼
      +'<div style="width:50%;border-right:2px solid #e4e7ec;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:9px;box-sizing:border-box;">'
        +'<div style="display:flex;gap:9px;">'
          +'<div style="flex:1;"><div style="font-size:11px;font-weight:700;color:#667085;margin-bottom:3px;">프로젝트</div><select id="ji-proj" onchange="jiraLoadIssueTypes(this.value,\'ji-itype\');jiraLivePreview()" style="'+inSt+'cursor:pointer;"><option value="">로드 중…</option></select></div>'
          +'<div style="flex:1;"><div style="font-size:11px;font-weight:700;color:#667085;margin-bottom:3px;">이슈유형</div><select id="ji-itype" onchange="jiraLoadFields();jiraApplyPanelVisibility();jiraLivePreview()" style="'+inSt+'cursor:pointer;"><option value="">—</option></select></div>'
        +'</div>'
        +'<div><div style="font-size:11px;font-weight:700;color:#667085;margin-bottom:3px;">제목 <span style="color:#e23d4d;">*</span></div><input id="ji-summary" value="'+esc(prefill.summary||'')+'" oninput="jiraLivePreview()" placeholder="이슈 제목" style="'+inSt+'"></div>'
        // 1. 관련 근거
        +'<div id="ji-sec-p_ref">'+psec(secHd('1. 관련 근거', !!prefill.phenomenon),
          prefill.phenomenon
            ?autoWrap('사이클·시험 항목 정보가 자동으로 채워집니다','<div style="padding:6px 10px;font-size:12.5px;color:#1e3a5f;white-space:pre-wrap;line-height:1.6;">'+escH(prefill.phenomenon)+'</div>')
            :'<div style="padding:8px 10px;"><textarea id="ji-p1" rows="2" oninput="jiraLivePreview()" placeholder="관련 사이클 / 시험 항목" style="'+taSt+'">'+escH(prefill.phenomenon||'')+'</textarea></div>')+'</div>'
        // 2. 목적
        +'<div id="ji-sec-p_obj">'+psec(secHd('2. 목적', !!prefill.purpose),
          prefill.purpose
            ?autoWrap('TC 목적이 자동으로 채워집니다','<div style="padding:6px 10px;font-size:12.5px;color:#1e3a5f;white-space:pre-wrap;line-height:1.6;">'+escH(prefill.purpose)+'</div>')
            :'<div style="padding:8px 10px;"><textarea id="ji-p-purpose" rows="2" oninput="jiraLivePreview()" placeholder="시험 목적" style="'+taSt+'"></textarea></div>')+'</div>'
        // 3. 사전 준비 조건
        +'<div id="ji-sec-p_pre">'+psec(secHd('3. 사전 준비 조건', !!prefill.precondition),
          prefill.precondition
            ?autoWrap('TC 사전 준비 조건이 자동으로 채워집니다','<div style="padding:6px 10px;font-size:12.5px;color:#1e3a5f;white-space:pre-wrap;line-height:1.6;">'+escH(prefill.precondition)+'</div>')
            :'<div style="padding:8px 10px;"><textarea id="ji-p-precond" rows="2" oninput="jiraLivePreview()" placeholder="사전 준비 조건" style="'+taSt+'"></textarea></div>')+'</div>'
        // 4. 시험 구성도 — Topology(topo2) 장비 배치·결선 텍스트 자동입력 + 구성도 이미지
        +'<div id="ji-sec-p_topo">'+psec(secHd('4. 시험 구성도', !!(prefill.image||prefill.topoText)),
          (prefill.image
            ?'<div style="padding:8px 10px;display:flex;align-items:center;gap:10px;"><img src="'+esc(prefill.image)+'" style="width:80px;height:52px;object-fit:contain;border:1px solid var(--border);border-radius:5px;background:#f8f9fb;flex-shrink:0;"><label style="display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--text2);cursor:pointer;"><input type="checkbox" id="ji-img" checked onchange="jiraLivePreview()"> <span>구성도(PNG) 이슈 본문 첨부</span></label></div>'
            :'')
          +'<div style="padding:'+(prefill.image?'0 10px 8px':'8px 10px')+';">'
            +(prefill.topoText?'<div style="font-size:10.5px;color:#059669;margin-bottom:4px;"><i class="ti ti-robot" style="font-size:10px;"></i> TC Topology의 장비 배치·결선 정보가 자동으로 채워졌습니다 (수정 가능)</div>':'')
            +'<textarea id="ji-p2" rows="'+(prefill.topoText?6:2)+'" oninput="jiraLivePreview()" placeholder="구성도 설명 또는 파일명" style="'+taSt+(prefill.topoText?'font-family:ui-monospace,monospace;font-size:11.5px;':'')+'">'+escH(prefill.topoText||'')+'</textarea>'
          +'</div>')+'</div>'
        // 5. 시험 절차 및 결과
        +'<div id="ji-sec-p_proc">'+psec(secHd('5. 시험 절차 및 결과', _jiTcSteps.length>0), procResultHtml)+'</div>'
        // 6. Kernel Log
        +'<div id="ji-sec-p_log">'+psec(secHd('6. Kernel Log & Syslog', _jiTcSteps.length>0), logHtml)+'</div>'
        +'<div id="ji-dynfields" style="display:flex;flex-direction:column;gap:9px;"></div>'
        +'<div><div style="font-size:11px;font-weight:700;color:#667085;margin-bottom:3px;">라벨 (쉼표 구분)</div><input id="ji-labels" value="'+esc((prefill.labels||['utop']).join(','))+'" oninput="jiraLivePreview()" style="'+inSt+'"></div>'
        +'<div id="ji-result" style="font-size:12.5px;"></div>'
      +'</div>'
      // 오른쪽 미리보기
      +'<div style="width:50%;overflow-y:auto;padding:16px 20px;box-sizing:border-box;background:#fff;">'
        +'<div style="font-size:10px;font-weight:700;color:#94a3b8;letter-spacing:0.07em;text-transform:uppercase;margin-bottom:12px;display:flex;align-items:center;gap:4px;"><i class="ti ti-eye" style="font-size:11px;color:#2684ff;"></i> Jira 이슈 미리보기</div>'
        +'<div id="ji-preview-panel"></div>'
      +'</div>'
    +'</div>'
    +'<div style="padding:10px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;flex-shrink:0;background:#fff;">'
      +'<button onclick="document.getElementById(\'jira-issue-modal\').remove()" style="font-size:13px;padding:8px 18px;border-radius:8px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;font-weight:600;">취소</button>'
      +'<button id="ji-submit" onclick="jiraIssueSubmit()" style="font-size:13px;padding:8px 22px;border-radius:8px;border:none;background:#2684ff;color:#fff;cursor:pointer;font-weight:700;display:flex;align-items:center;gap:6px;"><i class="ti ti-send"></i> 이슈 생성</button>'
    +'</div>'
  +'</div>';
  document.body.appendChild(m);
  // 동적 필드 select: 이미 선택된 옵션을 다시 선택하면 선택 취소(빈 값) — 토글식
  (function(){
    m.addEventListener('mousedown',function(e){
      var s=e.target;
      // 다른 곳을 클릭하면 열림 추적 초기화 (드롭다운을 밖 클릭으로 닫은 경우 오동작 방지)
      try{ m.querySelectorAll('#ji-dynfields select').forEach(function(x){ if(x!==s) x._jiClk=false; }); }catch(_e){}
      if(s&&s.tagName==='SELECT'&&s.closest&&s.closest('#ji-dynfields')){ s._jiPv=s.value; }
    },true);
    m.addEventListener('click',function(e){
      var s=e.target;
      if(!s||s.tagName!=='SELECT'||!s.closest||!s.closest('#ji-dynfields')) return;
      s._jiClk=!s._jiClk;   // 1번째 클릭=드롭다운 열기, 2번째 클릭=옵션 선택
      if(!s._jiClk && s.value!=='' && s.value===s._jiPv){
        s.value='';   // 같은 옵션 재선택 → 취소
        try{ s.dispatchEvent(new Event('change',{bubbles:true})); }catch(_e){}
        if(typeof jiraLivePreview==='function') jiraLivePreview();
        if(typeof showToast==='function') showToast('선택 취소됨');
      }
    },true);
    m.addEventListener('keydown',function(e){ var s=e.target; if(s&&s.tagName==='SELECT'&&e.key==='Escape') s._jiClk=false; },true);
    m.addEventListener('focusout',function(e){ var s=e.target; if(s&&s.tagName==='SELECT') s._jiClk=false; },true);
  })();
  (function(){
    var drag=document.getElementById('jira-issue-drag');
    var panel=document.getElementById('jira-issue-panel');
    if(!drag||!panel) return;
    var tx=0,ty=0,sx=0,sy=0,dragging=false;
    drag.addEventListener('mousedown',function(e){
      if(e.target.tagName==='BUTTON'||e.target.tagName==='I') return;
      e.preventDefault(); dragging=true; sx=e.clientX-tx; sy=e.clientY-ty;
      document.addEventListener('mousemove',onMove,{passive:true});
      document.addEventListener('mouseup',onUp);
    });
    function onMove(e){ if(!dragging)return; tx=e.clientX-sx; ty=e.clientY-sy; panel.style.transform='translate('+tx+'px,'+ty+'px)'; }
    function onUp(){ dragging=false; document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp); }
  })();
  await jiraLoadProjects('ji-proj', prefill.project||cfg.default_project, prefill.issuetype||cfg.default_issuetype);
  jiraLivePreview();
}
// ── 담당자 선택: 포커스 시 전체 사용자 목록(추천 + 전체), 입력 시 이름·메일·ID 일치 필터 ──
var _jiUserT=null;
var _jiUsersCache={proj:null,users:null,loading:false};
async function _jiUsersLoad(){
  var proj=(typeof _jrGV==='function'?_jrGV('ji-proj'):'')||'';
  if(_jiUsersCache.users&&_jiUsersCache.proj===proj) return _jiUsersCache.users;
  if(_jiUsersCache.loading) return _jiUsersCache.users||[];
  _jiUsersCache.loading=true;
  try{
    var d=await (await fetch('/api/jira/user-search?project='+encodeURIComponent(proj)+'&limit=200')).json();
    _jiUsersCache={proj:proj,users:(d&&d.users)||[],loading:false};
  }catch(e){ _jiUsersCache.loading=false; }
  return _jiUsersCache.users||[];
}
function jiAssigneeOpen(inp){ _jiAssigneeRender(inp, String(inp.value||'').trim()); }
function jiAssigneeSearch(inp){
  clearTimeout(_jiUserT);
  _jiUserT=setTimeout(function(){ _jiAssigneeRender(inp, String(inp.value||'').trim()); }, 200);
}
async function _jiAssigneeRender(inp, q){
  var users=await _jiUsersLoad();
  // 전체 목록 로드 실패 시 서버 검색 폴백
  if((!users||!users.length)&&q.length>=2){
    try{ var d=await (await fetch('/api/jira/user-search?q='+encodeURIComponent(q))).json(); users=(d&&d.users)||[]; }catch(e){}
  }
  var old=document.getElementById('ji-assignee-dd'); if(old)old.remove();
  if(!document.body.contains(inp)||document.activeElement!==inp) return;
  var esc2=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');};
  var ql=String(q||'').toLowerCase();
  var list=ql?users.filter(function(u){
    return String(u.displayName||'').toLowerCase().indexOf(ql)>=0
      || String(u.email||'').toLowerCase().indexOf(ql)>=0
      || String(u.name||'').toLowerCase().indexOf(ql)>=0;
  }):users;
  // 입력칸 부모에 absolute로 부착 → 폼 스크롤 시 input을 따라 움직임 (화면 고정 아님)
  var host=inp.parentElement||document.body;
  try{ if(getComputedStyle(host).position==='static') host.style.position='relative'; }catch(e){}
  var dd=document.createElement('div'); dd.id='ji-assignee-dd';
  dd.style.cssText='position:absolute;z-index:100010;left:0;right:0;top:'+(inp.offsetTop+inp.offsetHeight+2)+'px;background:#fff;border:1px solid #c8cdd6;border-radius:8px;box-shadow:0 8px 26px rgba(0,0,0,0.18);max-height:340px;overflow-y:auto;';
  var secHd=function(t){ var h=document.createElement('div'); h.style.cssText='padding:4px 12px;font-size:11px;font-weight:700;color:#5a6372;background:#eef0f4;border-bottom:1px solid #e2e6ec;position:sticky;top:0;'; h.textContent=t; return h; };
  var avatar=function(u){ var ch=String(u.displayName||u.name||'?').charAt(0); var cols=['#2d6fd4','#7c3aed','#00875a','#e8820c','#0d9488','#c0392b']; var ci=(String(u.name||'').split('').reduce(function(s,c){return s+c.charCodeAt(0);},0))%cols.length; return '<span style="width:20px;height:20px;border-radius:50%;background:'+cols[ci]+';color:#fff;font-size:10.5px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">'+esc2(ch)+'</span>'; };
  var row=function(html, fn, sel){
    var it=document.createElement('div');
    it.style.cssText='padding:6px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;font-size:12.5px;'+(sel?'background:#eef3fb;':'');
    it.innerHTML=html;
    it.onmouseenter=function(){ it.style.background='#f0f4fa'; };
    it.onmouseleave=function(){ it.style.background=sel?'#eef3fb':'#fff'; };
    it.addEventListener('mousedown',function(e){ e.preventDefault(); fn(); });
    return it;
  };
  var pick=function(u){
    inp.value=u?u.name:''; inp.title=u?((u.displayName||'')+(u.email?' <'+u.email+'>':'')):'';
    dd.remove();
    if(typeof jiraLivePreview==='function')jiraLivePreview();
  };
  var userLabel=function(u){ return avatar(u)+'<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#172b4d;"><b>'+esc2(u.displayName||u.name)+'</b>'+(u.email?' - '+esc2(u.email):'')+' ('+esc2(u.name)+')</span>'; };
  // 추천 (검색어 없을 때만)
  if(!ql){
    dd.appendChild(secHd('추천'));
    var cfgUser=(typeof _jiraCfg!=='undefined'&&_jiraCfg&&_jiraCfg.user)||'';
    var mine=users.find(function(u){ return u.name===cfgUser; });
    if(mine) dd.appendChild(row(userLabel(mine), function(){ pick(mine); }, String(inp.value||'').trim()===mine.name));
    dd.appendChild(row('<i class="ti ti-user-question" style="color:#98a2b3;font-size:16px;flex-shrink:0;"></i><span style="color:#344054;">자동 (프로젝트 기본 담당자)</span>', function(){ pick(null); }, false));
    var hint=document.createElement('div');
    hint.style.cssText='padding:5px 12px;font-size:11px;color:#98a2b3;font-style:italic;border-bottom:1px solid #f0f1f3;';
    hint.textContent='사용자를 찾으려면 이름·메일·ID 입력을 시작하세요.';
    dd.appendChild(hint);
  }
  // 전체/검색 결과
  dd.appendChild(secHd(ql?('검색 결과 '+list.length+'명'):('전체 사용자 '+list.length+'명')));
  if(!list.length){
    var em=document.createElement('div'); em.style.cssText='padding:9px 12px;font-size:12px;color:#98a2b3;'; em.textContent='일치하는 사용자가 없습니다'; dd.appendChild(em);
  } else {
    var cur=String(inp.value||'').trim();
    list.slice(0,200).forEach(function(u){ dd.appendChild(row(userLabel(u), function(){ pick(u); }, cur===u.name)); });
  }
  host.appendChild(dd);
}

async function jiraLoadFields(){
  var box=document.getElementById('ji-dynfields'); if(!box)return;
  var proj=_jrGV('ji-proj'), itype=_jrGV('ji-itype');
  if(!proj||!itype){ box.innerHTML=''; return; }
  box.innerHTML='<div style="font-size:12px;color:var(--text3);"><i class="ti ti-loader"></i> 필드 불러오는 중…</div>';
  try{
    var d=await (await fetch('/api/jira/createmeta?project='+encodeURIComponent(proj)+'&issuetype='+encodeURIComponent(itype))).json();
    if(!d.ok){ box.innerHTML='<div style="font-size:12px;color:#e23d4d;">필드 로드 실패: '+String(d.error||'').slice(0,90)+'</div>'; return; }
    var skip={project:1,issuetype:1,summary:1,description:1,attachment:1,issuelinks:1,labels:1};
    var flds=d.fields.filter(function(f){ return !skip[f.id]; });
    flds.sort(function(a,b){ return (b.required?1:0)-(a.required?1:0); });
    var inSt='width:100%;font-size:13px;padding:8px 10px;border:1px solid var(--border);border-radius:7px;outline:none;box-sizing:border-box;';
    var html=flds.map(function(f){
      var fid='jif-'+f.id;
      var lab='<div style="font-size:12px;font-weight:600;margin-bottom:4px;color:'+(f.required?'#c0414f':'var(--text3)')+';">'+String(f.name||f.id).replace(/</g,'&lt;')+(f.required?' *':'')+'</div>';
      var isArr=(f.type==='array'); var inp;
      if(f.options && f.options.length){
        var opts=f.options.map(function(o){ return '<option value="'+o.id+'">'+String(o.name).replace(/</g,'&lt;')+'</option>'; }).join('');
        if(isArr){ inp='<select id="'+fid+'" multiple size="'+Math.min(5,Math.max(2,f.options.length))+'" style="'+inSt+'cursor:pointer;">'+opts+'</select>'; }
        else{ inp='<select id="'+fid+'" style="'+inSt+'cursor:pointer;"><option value="">(선택)</option>'+opts+'</select>'; }
      } else if(f.type==='date'||f.items==='date'){ inp='<input id="'+fid+'" type="date" style="'+inSt+'">'; }
      else if(f.type==='user'){ inp='<input id="'+fid+'" placeholder="사용자 ID (예: itest)" style="'+inSt+'">'; }
      else if(f.custom && /textarea/.test(f.custom)){ inp='<textarea id="'+fid+'" style="'+inSt+'min-height:56px;resize:vertical;font-family:inherit;"></textarea>'; }
      else { inp='<input id="'+fid+'" style="'+inSt+'">'; }
      var evAttr=' oninput="jiraLivePreview()" onchange="jiraLivePreview()"';
      return '<div data-fid="'+f.id+'" data-ftype="'+f.type+'" data-freq="'+(f.required?1:0)+'" data-fhasopt="'+(f.options?1:0)+'" data-fname="'+String(f.name||f.id).replace(/"/g,'&quot;')+'">'+lab+inp.replace(/^(<\w+)/,'$1'+evAttr)+(isArr&&f.options?'<div style="font-size:10.5px;color:var(--text3);margin-top:2px;">Ctrl/Shift로 다중 선택</div>':'')+'</div>';
    }).join('');
    box.innerHTML='<div style="border-top:1px dashed var(--border);padding-top:11px;font-size:12.5px;font-weight:800;color:var(--text2);">Jira 필드 ('+flds.length+'개) <span style="font-weight:500;color:#c0414f;font-size:11px;">· * 필수</span></div>'+html;
    // 담당자(assignee): createmeta에 없으면 수동 입력 필드 추가, 있으면 위치만 조정 — 구성 요소 바로 아래 배치
    try{
      var aEl=box.querySelector('[data-fid="assignee"]');
      if(!aEl){
        aEl=document.createElement('div');
        aEl.setAttribute('data-fid','assignee'); aEl.setAttribute('data-ftype','user');
        aEl.setAttribute('data-freq','0'); aEl.setAttribute('data-fhasopt','0'); aEl.setAttribute('data-fname','담당자');
        aEl.innerHTML='<div style="font-size:12px;font-weight:600;margin-bottom:4px;color:var(--text3);">담당자</div>'
          +'<input id="jif-assignee" autocomplete="off" onfocus="jiAssigneeOpen(this)" oninput="jiraLivePreview();jiAssigneeSearch(this)" onblur="setTimeout(function(){var d=document.getElementById(\'ji-assignee-dd\');if(d)d.remove();},180)" placeholder="이름·메일·ID 입력 시 사용자 검색 — 비우면 자동 할당" style="'+inSt+'">'
          +'<div id="jif-assignee-hint" style="font-size:10.5px;color:var(--text3);margin-top:3px;">구성요소를 선택하면 담당자가 자동 지정됩니다 (변경 가능)</div>';
      } else {
        // createmeta가 만든 담당자 입력에도 검색 자동완성 연결
        var aIn=aEl.querySelector('input');
        if(aIn){ aIn.setAttribute('autocomplete','off'); aIn.setAttribute('onfocus','jiAssigneeOpen(this)'); aIn.setAttribute('oninput','jiraLivePreview();jiAssigneeSearch(this)'); aIn.setAttribute('onblur','setTimeout(function(){var d=document.getElementById(\'ji-assignee-dd\');if(d)d.remove();},180)'); aIn.placeholder='이름·메일·ID 입력 시 사용자 검색 — 비우면 자동 할당'; }
      }
      var compEl=box.querySelector('[data-fid="components"]');
      if(compEl) compEl.insertAdjacentElement('afterend', aEl);
      else box.appendChild(aEl);
    }catch(e){}
    // 구성요소 → 담당자 자동 지정 (Jira 컴포넌트 리드: SW=SW부서 PM, HW=HW부서 PM 등)
    try{
      window._jiCompLead={};
      fetch('/api/jira/components?project='+encodeURIComponent(proj)).then(function(r){return r.json();}).then(function(cd){
        ((cd&&cd.components)||[]).forEach(function(c){ if(c.id) window._jiCompLead[String(c.id)]={name:c.lead||'',display:c.leadDisplay||'',comp:c.name||''}; });
      }).catch(function(){});
      var compSel=document.getElementById('jif-components');
      if(compSel&&!compSel._jiLeadBound){
        compSel._jiLeadBound=true;
        compSel.addEventListener('change',function(){
          var v=this.multiple?((Array.prototype.slice.call(this.selectedOptions).map(function(o){return o.value;})[0])||''):this.value;
          var info=v&&window._jiCompLead&&window._jiCompLead[String(v)];
          var a=document.getElementById('jif-assignee');
          if(a&&info&&info.name){
            a.value=info.name; a.title=info.display||info.name;
            if(typeof showToast==='function')showToast('담당자 자동 지정: '+(info.display||info.name)+' — '+info.comp+' (변경 가능)');
            if(typeof jiraLivePreview==='function')jiraLivePreview();
          } else if(a&&v&&info&&!info.name){
            if(typeof showToast==='function')showToast('이 구성요소에 지정된 담당자(컴포넌트 리드)가 없습니다');
          }
        });
      }
    }catch(e){}
    // 저장된 기본값 자동 적용
    try{
      var _pt=(_jiraCfg&&_jiraCfg.panel_templates)||{};
      var _pp=_pt[proj]||{};
      var _itypeL=itype.toLowerCase();
      var _isCR=(_itypeL.indexOf('cr')>=0||_itypeL.indexOf('change')>=0);
      var _ptType=_isCR?'cr':'defect';
      var _defs=(_pp[_ptType]&&_pp[_ptType].field_defaults)||{};
      Object.keys(_defs).forEach(function(fid){
        var el=document.getElementById('jif-'+fid); if(!el||!_defs[fid]) return;
        if(el.tagName==='SELECT'){ Array.prototype.forEach.call(el.options,function(o){ if(o.value===String(_defs[fid])||o.text===String(_defs[fid])) o.selected=true; }); }
        else { el.value=_defs[fid]; }
      });
    }catch(e){}
    jiraLivePreview();
  }catch(e){ box.innerHTML='<div style="font-size:12px;color:#e23d4d;">오류: '+e.message+'</div>'; }
}
// ── 실제 Jira에 등록되는 설명(위키 마크업) 생성 — 미리보기와 제출이 같은 본문을 사용 ──
function _jiBuildDesc(useImg, gv){
  gv=gv||function(id){ var el=document.getElementById(id); return el?el.value:''; };
  var descParts=[];
  // 1. 현상 (자동입력된 관련 근거 포함)
  var p1=window._jiPhenomenon||gv('ji-p1');
  descParts.push('{panel:title=1. 현상}\n'+(p1||'（내용 없음）')+'\n{panel}');
  // 2. 시험구성도
  var p2=gv('ji-p2');
  var p2body=useImg?'!구성도.png|thumbnail!\n'+(p2||''):(p2||'망 구성도 그림 파일 캡쳐 작성');
  descParts.push('{panel:title=2. 시험구성도}\n'+p2body+'\n{panel}');
  // 3. 시험절차 및 결과 — 절차·CLI·CLI 결과·판정을 스텝 블록 하나로 통합 (별도 시험절차 패널 제거)
  var p4body='';
  if(_jiTcSteps.length){
    var blocks4=[];
    _jiTcSteps.forEach(function(s,i){
      var act0=s.action||s.desc||'';
      var cmd=s.cmd||s.cli||'';
      var exp=s.expected||s.criteria||'';
      var out=s.repeatOutput||s.actual||'';
      var vrd=s.repeatResult||s.verdict||'';
      var mark=(vrd==='Pass'||vrd==='합격')?'(/) Pass':((vrd==='Fail'||vrd==='불합격')?'(x) Fail':'(?) 미실행');
      var L=[];
      L.push((i+1)+') '+(act0||cmd)+'   '+mark);
      if(cmd){ L.push('{color:#8a93a5}TEST DATA{color}'); L.push(cmd); }
      L.push('{color:#8a93a5}기대 결과{color}');
      L.push(exp?('{color:#00875a}'+exp+'{color}'):'—');
      L.push('{color:#8a93a5}실제 결과{color}');
      if(String(out).trim()){ L.push('{noformat}'); L.push(String(out).slice(0,3000)); L.push('{noformat}'); }
      else L.push('（미실행）');
      if(s.rca&&(vrd==='Fail'||vrd==='불합격')){ L.push('{color:#c0392b}RCA: '+String(s.rca).replace(/\r?\n/g,' ')+'{color}'); }
      blocks4.push(L.join('\n'));
    });
    p4body=blocks4.join('\n----\n');
  } else { p4body=[gv('ji-p3'),gv('ji-result-ta')].filter(function(x){return String(x||'').trim();}).join('\n\n'); }
  descParts.push('{panel:title=3. 시험절차 및 결과}\n'+p4body+'\n{panel}');
  // 4. Configuration File
  var p5=gv('ji-p5');
  descParts.push('{panel:title=4. Configuration File(Config File)}\n'+(p5?'{code:java}\n'+p5+'\n{code}':'（해당 없음）')+'\n{panel}');
  // 5. Core File
  descParts.push('{panel:title=5. Core File(Upload Core file)}\n（해당 없음）\n{panel}');
  // 6. Kernel Log & Syslog — 기본 (해당 없음). Fail 시 running-config 조회 결과는 txt 첨부(자동 등록)로 별도 제공
  var p7v=gv('ji-p7');
  descParts.push('{panel:title=6. Kernel Log & Syslog 조회}\n'+(String(p7v||'').trim()?('{code:java}\n'+p7v+'\n{code}'):'（해당 없음）')+'\n{panel}');
  return descParts.join('\n\n');
}

function _jiraWikiToHtml(txt){
  if(!txt) return '';
  var escH=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');};
  var lines=String(txt).split('\n');
  var out=[]; var inNf=false; var nfBuf=[];
  var inTbl=false; var inCode=false; var codeBuf=[];
  var preHtml=function(buf){ return '<pre style="background:#f4f5f7;border:1px solid #dfe1e6;border-radius:4px;padding:10px 12px;font-size:12px;overflow-x:auto;white-space:pre-wrap;line-height:1.5;margin:8px 0;">'+buf.map(escH).join('\n')+'</pre>'; };
  for(var i=0;i<lines.length;i++){
    var ln=lines[i];
    // noformat 블록
    if(/^\{noformat[^}]*\}/.test(ln)&&!inCode&&!inNf){ inNf=true; nfBuf=[]; continue; }
    if(inNf){ if(ln.trim()==='{noformat}'){ out.push(preHtml(nfBuf)); inNf=false; nfBuf=[]; } else { nfBuf.push(ln); } continue; }
    // {code} 블록 (한 줄 인라인 / 여러 줄)
    var mCi=ln.match(/^\{code[^}]*\}([\s\S]*)\{code\}$/);
    if(mCi&&!inCode){ out.push(preHtml([mCi[1]])); continue; }
    if(/^\{code[^}]*\}/.test(ln)&&!inCode){ inCode=true; codeBuf=[]; continue; }
    if(inCode){ if(ln.trim()==='{code}'){ out.push(preHtml(codeBuf)); inCode=false; codeBuf=[]; } else { codeBuf.push(ln); } continue; }
    // {panel:title=…} / {panel} — Jira 패널 (실제 등록 화면과 동일한 박스)
    var mp=ln.match(/^\{panel:title=([^}]*)\}$/);
    if(mp){ if(inTbl){out.push('</table>');inTbl=false;} out.push('<div style="border:1px solid #dfe1e6;border-radius:6px;overflow:hidden;margin:10px 0;"><div style="padding:7px 12px;background:#f4f5f7;border-bottom:1px solid #dfe1e6;font-size:12.5px;font-weight:700;color:#344054;">'+escH(mp[1])+'</div><div style="padding:9px 12px;">'); continue; }
    if(/^\{panel\}$/.test(ln.trim())){ if(inTbl){out.push('</table>');inTbl=false;} out.push('</div></div>'); continue; }
    // 제목
    if(/^h1\. /.test(ln)){ out.push('<div style="font-size:22px;font-weight:800;color:#172b4d;margin:16px 0 8px;border-bottom:2px solid #dfe1e6;padding-bottom:6px;">'+escH(ln.slice(4))+'</div>'); continue; }
    if(/^h2\. /.test(ln)){ out.push('<div style="font-size:18px;font-weight:700;color:#172b4d;margin:14px 0 6px;border-bottom:1px solid #dfe1e6;padding-bottom:4px;">'+escH(ln.slice(4))+'</div>'); continue; }
    if(/^h3\. /.test(ln)){ out.push('<div style="font-size:15px;font-weight:800;color:#172b4d;margin:14px 0 6px;border-bottom:2px solid #dfe1e6;padding-bottom:4px;">'+escH(ln.slice(4))+'</div>'); continue; }
    if(/^h4\. /.test(ln)){ out.push('<div style="font-size:13px;font-weight:700;color:#344054;margin:12px 0 5px;">'+escH(ln.slice(4))+'</div>'); continue; }
    // 구분선
    if(/^----$/.test(ln.trim())){ out.push('<hr style="border:none;border-top:1px solid #dfe1e6;margin:10px 0;">'); continue; }
    // 테이블 행
    if(/^\|/.test(ln)){
      if(!inTbl){ out.push('<table style="border-collapse:collapse;width:100%;margin:8px 0;font-size:12.5px;">'); inTbl=true; }
      var isHeader=/^\|\|/.test(ln);
      var cells=ln.replace(/^\|+|\|+$/g,'').split(isHeader?'||':'|');
      var tr='<tr>'+ cells.map(function(c){
        var inner=c.trim();
        // {noformat} 인라인 처리
        inner=inner.replace(/\{noformat[^}]*\}([\s\S]*?)\{noformat\}/g,function(_,code){ return '<code style="font-family:monospace;background:#f4f5f7;padding:1px 4px;border-radius:3px;font-size:11px;">'+escH(code.trim())+'</code>'; });
        var tdSt='padding:5px 10px;border:1px solid #dfe1e6;'+(isHeader?'background:#f4f5f7;font-weight:700;color:#344054;':'color:#172b4d;');
        return (isHeader?'<th style="'+tdSt+'">':'<td style="'+tdSt+'">')+(inner||'&nbsp;')+(isHeader?'</th>':'</td>');
      }).join('')+'</tr>';
      out.push(tr); continue;
    } else if(inTbl){ out.push('</table>'); inTbl=false; }
    // 빈 줄
    if(!ln.trim()){ out.push('<div style="height:6px;"></div>'); continue; }
    // 인라인 마크업 처리
    var s=escH(ln);
    s=s.replace(/\*([^*]+)\*/g,'<b>$1</b>');
    s=s.replace(/_([^_]+)_/g,'<i>$1</i>');
    s=s.replace(/\(\/\)/g,'<span style="color:#00875a;font-weight:700;">✔</span>');
    s=s.replace(/\(x\)/g,'<span style="color:#de350b;font-weight:700;">✘</span>');
    s=s.replace(/\(\?\)/g,'<span style="color:#ff991f;font-weight:700;">?</span>');
    s=s.replace(/\{color:(#[0-9a-fA-F]{3,8})\}([\s\S]*?)\{color\}/g,'<span style="color:$1;">$2</span>');
    out.push('<div style="font-size:13px;color:#172b4d;line-height:1.7;">'+s+'</div>');
  }
  if(inTbl) out.push('</table>');
  if(inNf && nfBuf.length) out.push(preHtml(nfBuf));
  if(inCode && codeBuf.length) out.push(preHtml(codeBuf));
  return out.join('');
}
function jiraLivePreview(){
  var panel=document.getElementById('ji-preview-panel'); if(!panel) return;
  var escH=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');};
  var selText=function(id){ var el=document.getElementById(id); if(!el)return ''; if(el.options&&el.selectedIndex>=0) return el.options[el.selectedIndex].text||''; return el.value||''; };
  var gv=function(id){ var el=document.getElementById(id); return el?el.value:''; };
  var proj=selText('ji-proj'), itype=selText('ji-itype'), summary=_jrGV('ji-summary');
  var imgChk=document.getElementById('ji-img');
  var labels=(gv('ji-labels')||'').split(',').map(function(s){return s.trim();}).filter(Boolean);
  var dynRows=[];
  Array.prototype.forEach.call(document.querySelectorAll('#ji-dynfields [data-fid]'), function(w){
    var fname=w.getAttribute('data-fname')||w.getAttribute('data-fid');
    var fid=w.getAttribute('data-fid'), req=w.getAttribute('data-freq')==='1';
    var el=document.getElementById('jif-'+fid); if(!el) return;
    var val='';
    if(el.multiple){ val=Array.prototype.slice.call(el.selectedOptions).map(function(o){return o.text;}).join(', '); }
    else { val=el.options?((el.selectedIndex>=0&&el.options[el.selectedIndex])?el.options[el.selectedIndex].text:''):el.value; }
    if(val||req) dynRows.push({label:fname,val:val||'—',req:req});
  });
  var itLower=(itype||'').toLowerCase();
  var itColor=itLower.indexOf('defect')>=0||itLower.indexOf('bug')>=0?'#e23d4d':itLower.indexOf('cr')>=0?'#6938ef':itLower.indexOf('os')>=0?'#079455':'#2684ff';
  var itIcon=itLower.indexOf('defect')>=0||itLower.indexOf('bug')>=0?'ti-bug':'ti-circle-plus';
  // 실제 등록되는 위키 마크업 그대로 렌더 — 미리보기 = 등록 결과
  var useImgP=!!(window._jiraIssueImg&&imgChk&&imgChk.checked);
  var descHtml='';
  try{
    descHtml=_jiraWikiToHtml(_jiBuildDesc(useImgP, gv));
    // 구성도 이미지 토큰을 실제 썸네일로 치환 (등록 시 첨부되는 이미지)
    if(useImgP) descHtml=descHtml.split('!구성도.png|thumbnail!').join('<img src="'+escH(window._jiraIssueImg)+'" style="max-width:240px;max-height:150px;object-fit:contain;border:1px solid #dfe1e6;border-radius:4px;background:#f8f9fb;display:block;margin:4px 0;">');
  }catch(e){ descHtml='<div style="color:#e23d4d;font-size:12px;">미리보기 오류: '+escH(e.message)+'</div>'; }
  var sideField=function(label,val){
    return '<div style="padding:6px 0;border-bottom:1px solid #f2f4f7;">'
      +'<div style="font-size:10.5px;color:#8590a2;font-weight:600;margin-bottom:2px;">'+escH(label)+'</div>'
      +'<div style="font-size:12.5px;color:#172b4d;">'+escH(val||'—')+'</div>'
      +'</div>';
  };
  var html=
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">'
      +'<span style="display:flex;align-items:center;gap:4px;font-size:11.5px;font-weight:700;color:'+itColor+';background:'+itColor+'18;border-radius:4px;padding:3px 8px;"><i class="ti '+itIcon+'" style="font-size:11.5px;"></i> '+escH(itype||'이슈유형 선택')+'</span>'
      +'<span style="font-size:10.5px;font-weight:700;background:#dbeafe;color:#1d4ed8;border-radius:4px;padding:2px 7px;">등록 예정</span>'
    +'</div>'
    +'<div style="font-size:11px;color:#5e6c84;margin-bottom:5px;"><i class="ti ti-layout-grid" style="font-size:11px;"></i> '+escH(proj||'프로젝트 선택')+'</div>'
    +'<div style="font-size:18px;font-weight:700;color:#172b4d;line-height:1.3;margin-bottom:14px;word-break:break-word;">'+(escH(summary)||'<span style="color:#b0b7c3;font-weight:400;font-size:15px;">제목을 입력하세요</span>')+'</div>'
    +descHtml
    +'<hr style="border:none;border-top:1px solid #e4e7ec;margin:4px 0 10px;">'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 16px;">';
  dynRows.forEach(function(r){ html+='<div>'+sideField(r.label,r.val)+'</div>'; });
  if(labels.length) html+='<div>'+sideField('라벨',labels.join(', '))+'</div>';
  html+='</div>';
  panel.innerHTML=html;
}
async function jiraIssueSubmit(){
  var rEl=document.getElementById('ji-result'); var btn=document.getElementById('ji-submit');
  var proj=_jrGV('ji-proj'), itype=_jrGV('ji-itype'), summary=_jrGV('ji-summary');
  if(!proj||!itype){ if(rEl)rEl.innerHTML='<span style="color:#e23d4d;">프로젝트·이슈유형을 선택하세요</span>'; return; }
  if(!summary){ if(rEl)rEl.innerHTML='<span style="color:#e23d4d;">제목을 입력하세요</span>'; return; }
  var labels=(_jrGV('ji-labels')||'').split(',').map(function(s){return s.trim();}).filter(Boolean);
  var img=window._jiraIssueImg||'';
  var imgChk=document.getElementById('ji-img');
  var useImg=!!(img && imgChk && imgChk.checked);
  var gv=function(id){ var el=document.getElementById(id); return el?el.value:''; };
  var desc=_jiBuildDesc(useImg, gv);   // 미리보기와 동일한 본문 생성 함수 사용
  // 동적 Jira 필드 수집 + 필수 검증
  var dynFields={}, missing=[];
  Array.prototype.forEach.call(document.querySelectorAll('#ji-dynfields [data-fid]'), function(w){
    var fid=w.getAttribute('data-fid'), ftype=w.getAttribute('data-ftype');
    var req=w.getAttribute('data-freq')==='1', hasopt=w.getAttribute('data-fhasopt')==='1';
    var el=document.getElementById('jif-'+fid); if(!el) return;
    var val;
    if(el.multiple){ var s=Array.prototype.slice.call(el.selectedOptions).map(function(o){return o.value;}).filter(Boolean); if(s.length) val=s.map(function(v){return {id:v};}); }
    else if(ftype==='array' && hasopt){ if(el.value) val=[{id:el.value}]; }
    else if(hasopt){ if(el.value) val={id:el.value}; }
    else if(ftype==='user'){ if(el.value.trim()) val={name:el.value.trim()}; }
    else { if(String(el.value).trim()) val=String(el.value).trim(); }
    if(val===undefined){ if(req) missing.push(w.getAttribute('data-fname')); }
    else { dynFields[fid]=val; }
  });
  if(missing.length){ if(rEl)rEl.innerHTML='<span style="color:#e23d4d;"><i class="ti ti-alert-triangle"></i> 필수 필드: '+missing.join(', ')+'</span>'; return; }
  if(btn){ btn.disabled=true; btn.style.opacity='0.6'; btn.innerHTML='<i class="ti ti-loader"></i> 생성 중…'; }
  try{
    var r=await fetch('/api/jira/issue',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:proj,issuetype:itype,summary:summary,description:desc,labels:labels,fields:dynFields})});
    var d=await r.json();
    if(d.ok){
      if(useImg){
        if(rEl)rEl.innerHTML='<span style="color:var(--text2);"><i class="ti ti-loader"></i> 구성도 첨부 중…</span>';
        try{ var ar=await fetch('/api/jira/issue/'+d.key+'/attach',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:'구성도.png',data:img})}); var ad=await ar.json(); if(!ad.ok){ if(typeof showToast==='function')showToast('구성도 첨부 실패: '+String(ad.error||'').slice(0,60)); } }catch(ae){}
      }
      if(rEl)rEl.innerHTML='<span style="color:#00a872;font-weight:700;"><i class="ti ti-circle-check"></i> 생성됨: <a href="'+d.url+'" target="_blank" style="color:#2684ff;">'+d.key+'</a>'+(useImg?' · 구성도 첨부':'')+'</span>'+((d.dropped&&d.dropped.length)?'<span style="color:var(--text3);font-size:11.5px;"> · 미지원 필드 제외: '+d.dropped.join(', ')+'</span>':'');
      if(typeof showToast==='function')showToast('Jira 이슈 생성: '+d.key);
      try{ if(window._jiraOnCreated) window._jiraOnCreated(d.key, d.url); }catch(ce){}
      setTimeout(function(){ var mm=document.getElementById('jira-issue-modal'); if(mm)mm.remove(); }, 1400);
    }
    else{ if(rEl)rEl.innerHTML='<span style="color:#e23d4d;"><i class="ti ti-circle-x"></i> 실패: '+String(d.error||'').replace(/</g,'&lt;')+'</span>'; }
  }catch(e){ if(rEl)rEl.innerHTML='<span style="color:#e23d4d;">요청 오류: '+e.message+'</span>'; }
  if(btn){ btn.disabled=false; btn.style.opacity='1'; btn.innerHTML='<i class="ti ti-send"></i> 이슈 생성'; }
}
