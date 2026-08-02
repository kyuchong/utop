function updateCrumb(name){
  const el=document.getElementById('topbar-crumb'); if(!el) return;
  let c=_CRUMB[name]||['Ubiquoss-TOP',''];
  if(name==='release-summary'){ c=['Release Summary',(window._rlsSubView==='stats')?'Jira Issue Report':'시험 현황']; }   // 릴리즈 섬머리: 서브뷰에 따라
  const grp=c[0], pg=c[1];
  // 메뉴바(좌측 네비)와 동일한 아이콘 — 탑메뉴(그룹) / 서브메뉴(현재 페이지)
  const _GRPI={'Dashboard':'ti-layout-dashboard','AI Assistant':'ti-sparkles','Test Workflow':'ti-file-check','Release Summary':'ti-clipboard-text','Issue Sync':'ti-refresh','Rack View':'ti-server-2','Device Management':'ti-server','시스템':'ti-settings'};
  const _SUBI={chat:'ti-message-circle',explorer:'ti-layout-columns',tm:'ti-layout-columns',explorer3:'ti-columns-3','explorer3-beta':'ti-columns-3',milestone:'ti-flag-3',cycle:'ti-rotate-clockwise',report:'ti-chart-bar',board:'ti-layout-kanban',req:'ti-file-text',tc:'ti-clipboard-check','itms-rack':'ti-layout-grid','device-reg':'ti-server-cog','device-reg-beta':'ti-binary-tree-2',model:'ti-versions',linecard:'ti-cpu',vendor:'ti-building-store',meters:'ti-antenna','stc-traffic':'ti-activity-heartbeat',snmp:'ti-binary-tree','sys-custom':'ti-table-options','sys-theme':'ti-palette','sys-users':'ti-users','sys-export':'ti-download','sys-import':'ti-upload','sys-version':'ti-versions','sys-config':'ti-adjustments',manual:'ti-book-2',llm:'ti-brain','ixia-traffic':'ti-wave-sine','issue-sync':'ti-refresh',bbs:'ti-message-2','sys-mail':'ti-mail-cog','sys-perms':'ti-shield-lock','sys-org':'ti-sitemap','sys-jira':'ti-brand-jira','sys-jira-panel':'ti-layout-columns','sys-ai':'ti-bulb','ai-stat':'ti-chart-bar','ai-config':'ti-adjustments','sys-help':'ti-help-circle','sys-prompt':'ti-message-code','global-params':'ti-variable'};
  const gi=_GRPI[grp]||'ti-folder-filled';
  let si=_SUBI[name]||''; if(name==='release-summary') si=(window._rlsSubView==='stats')?'ti-chart-pie':'ti-clipboard-list';
  // 글자 크기·굵기는 서브메뉴(dd-item ≈12.5px) 기준
  el.innerHTML='<i class="ti '+gi+'" style="font-size:15px;color:var(--blue);"></i>'
    +'<span style="font-weight:800;color:var(--text);font-size:14px;">'+grp+'</span>'
    +(pg?'<i class="ti ti-chevron-right" style="font-size:15px;color:var(--text3);"></i>'
        +(si?'<i class="ti '+si+'" style="font-size:15px;color:var(--text3);"></i>':'')
        +'<span style="color:var(--text);font-weight:800;font-size:14px;">'+pg+'</span>':'');
}
function _pageApplyRO(name){ try{ var el=document.getElementById('page-'+(name||window._curPage)); if(!el) return; el.classList.toggle('utop-ro', !!(window._rbacRO||window._collabRO)); var rb=document.getElementById('rbac-ro-bar'); if(rb) rb.style.display='none'; }catch(e){} }   // 페이지 읽기전용 = RBAC 실행불가 OR 동시접속 보기전용 (배너 문구는 표시하지 않음)
async function showPage(name){
  if(name==='tm') name='explorer'; // Requirements & Test Coverage = explorer로 통합
  if(name==='device-reg') name='device-reg-beta'; // 구 Device Registration 통합
  if(name==='jira-ai') name='jira-ai-beta';  // 구 지식 검색 통합
  if(typeof canAccess==='function'){ var _acc=canAccess(name); if(name==='itms-rack') _acc=canAccess('itms-rack')||canAccess('itms-rack-edit'); if(!_acc){ if(typeof _rbacDenied==='function') _rbacDenied(name); return; } }   // RBAC: 접근 권한 없으면 차단 (Rack View는 Lab/설정 중 하나라도)
  try{ sessionStorage.setItem('utop_last_page', name); localStorage.setItem('utop_last_page', name); }catch(e){} // 탭별 유지(session) + 새 탭 기본(local)
  // TC 절차 실행 하단 바(⏹ 시험 절차 실행 중): 다른 페이지로 이동하면 자동 정리 (실제 실행되지 않는 컨텍스트에서 잔여 UI 방지)
  try{ if(name!=='explorer' && name!=='explorer3' && name!=='explorer3-beta' && name!=='cycle'){ var _sb=document.getElementById('tc-runstop-bar'); if(_sb) _sb.remove(); var _rb=document.getElementById('tc-resume-bar'); if(_rb) _rb.remove(); } }catch(_sbe){}
  // 실행 로그·Cycle 스텝 렌더 창 크기 리셋 (페이지 전환 후 다시 오면 최근 50개만 렌더 → 초기 로딩 렉 방지)
  try{ if(typeof _execLogLimit!=='undefined') _execLogLimit=50; }catch(_e){}
  try{ if(typeof _cbExecLimit!=='undefined') _cbExecLimit=50; }catch(_e){}
  try{ if(typeof _cbExecShowAll!=='undefined') _cbExecShowAll=false; }catch(_e){}
  // Cycle 페이지 재진입 시 옛 "전체보기" DOM 이 잠깐 보이는 문제 해결:
  // renderCycleBoard 호출 전에 detail 영역을 즉시 재렌더 → 리셋된 _cbExecLimit=50 기준 슬림 뷰가 바로 표시됨.
  if(name==='cycle'){
    try{ var _dt=document.getElementById('cb-detail'); if(_dt && typeof cbExecHtml==='function') _dt.innerHTML=cbExecHtml(); }catch(_e){}
    try{ var _tc=document.getElementById('cb-tree'); if(_tc && typeof cbTreeHtml==='function') _tc.innerHTML=cbTreeHtml(); }catch(_e){}
  }
  // explorer가 아닌 페이지로 이동하면 딥링크 해시(#req=/#tc=) 제거 → 새로고침 시 그 페이지로 복원(REQ/TC 강제이동 방지)
  try{ if(name!=='explorer' && /[#&](req|tc)=/.test(location.hash||'')){ history.replaceState(null,'',location.pathname+location.search); window._deepLinkNav=true; } }catch(e){}
  const subnav=document.getElementById('utop-subnav');
  const testMgmtPages=['tm','req','tc','explorer','explorer3','explorer3-beta','board','global-params'];
  const sysPages=['llm','sys-custom','sys-theme','sys-mail','sys-prompt','sys-users','sys-perms','sys-org','sys-export','sys-import','sys-version','sys-config','sys-jira','sys-jira-panel','manual','sys-help'];
  if(subnav){
    subnav.style.display='none';  // 서브탭 비활성화
    ['tm','cycle','report'].forEach(p=>{
      const el=document.getElementById('subnav-'+p);
      if(el) el.classList.toggle('active',p===name||(p==='tm'&&['req','tc'].includes(name)));
    });
  }
  document.querySelectorAll('.page').forEach(p=>{
    if(p.id==='page-device-reg-beta') return;   // 자체 상단 패딩 사용 — 지우지 않음
    p.style.paddingTop='';  // 서브탭 없으므로 여백 제거
  });
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('page-'+name)?.classList.add('active');
  try{ var _rk=name; if(name==='itms-rack' && typeof _rackEdit!=='undefined') _rk=(_rackEdit?'itms-rack-edit':'itms-rack'); window._rbacRO=(typeof canExec==='function' && !canExec(_rk)); window._curPage=name; if(typeof _pageApplyRO==='function')_pageApplyRO(name); if(typeof collabEnter==='function') collabEnter(name); }catch(e){}   // RBAC 읽기전용 + 동시접속 제어 진입
  // 페이지가 소속된 상단 메뉴 하나만 활성화 (없는 nav-<name>이 nav-tm으로 잘못 fallback되는 문제 방지)
  let navId;
  if(name==='chat'||name==='llm'||name==='manual'||name==='sys-ai'||name==='ai-stat'||name==='ai-config'||name==='jira-ai'||name==='jira-ai-beta'||name==='sys-jira-search'||name==='knowledge-src') navId='nav-chat';
  else if(testMgmtPages.includes(name)||name==='sys-custom'||name==='snmp'||name==='stc-traffic'||name==='ixia-traffic'||name==='req-v2'||name==='cov-v2'||name==='tests-color') navId='nav-tm';
  else if(name==='cycle'||name==='milestone') navId='nav-cycle';
  else if(name==='report' || name==='reports-color') navId='nav-release-summary';
  else if(name==='release-summary'||name==='issue-sync'||name==='sys-jira'||name==='sys-jira-panel') navId='nav-jira';
  else if(sysPages.includes(name)) navId='nav-sys';
  else if(name==='itms-rack'||name==='resource'||name==='devices'||name==='meters'||name==='device-reg'||name==='device-reg-beta'||name==='vendor'||name==='model'||name==='linecard'||name==='lab') navId='nav-itms';
  else navId='nav-'+name;
  document.getElementById(navId)?.classList.add('active');
  updateCrumb(name);
  // AI fab(플로팅)은 딱 3개 화면에서만 노출: Requirements & Test Coverage(explorer3) · Test Execution(cycle) · Test Report(report)
  try{
    const _fab=document.getElementById('ai-fab');
    const _fabOn=(name==='explorer3'||name==='explorer3-beta'||name==='explorer'||name==='cycle'||name==='report');
    if(_fab) _fab.style.display=_fabOn?'flex':'none';
    if(!_fabOn){ ['ai-fab-panel','pg-ai-fab-pop','rpt-ai-fab-pop'].forEach(function(id){ const _p=document.getElementById(id); if(_p){ if(id==='ai-fab-panel') _p.style.display='none'; else _p.remove(); } }); }
    if(typeof _fabPageApply==='function') _fabPageApply(name);   // 페이지별 AI fab 모드 전환 (Report=청록 / Tests=주황 / Cycle=핑크)
  }catch(e){}
  if(name==='sys-theme'){ if(typeof _e3LoadUiOptions==='function'){ _e3LoadUiOptions(function(){ renderThemeSettings(); }); } else { renderThemeSettings(); } }
  if(name==='tests-color' && typeof renderTestsColor==='function'){ if(typeof _e3LoadUiOptions==='function'){ _e3LoadUiOptions(function(){ renderTestsColor(); }); } else { renderTestsColor(); } }
  if(name==='cycle-color' && typeof renderCycleColor==='function'){ if(typeof _e3LoadUiOptions==='function'){ _e3LoadUiOptions(function(){ renderCycleColor(); }); } else { renderCycleColor(); } }
  if(name==='reports-color' && typeof renderReportsColor==='function'){ if(typeof _e3LoadUiOptions==='function'){ _e3LoadUiOptions(function(){ renderReportsColor(); }); } else { renderReportsColor(); } }
  if(name==='sys-perms' && typeof renderPermsAdmin==='function') renderPermsAdmin();
  if(name==='dashboard') renderDashboard();
  if(name==='resource'){ try{ if(typeof loadResourceData==='function') await loadResourceData(); if(typeof renderResourcePage==='function') renderResourcePage(); }catch(e){} }
  if(name==='device-reg'){ await loadDeviceData(); if(typeof loadRacks==='function'){ try{ await loadRacks(); }catch(e){} } renderDeviceReg(); }   // Lab 목록 최신화 → Lab 칩 자동 반영
  if(name==='device-reg-beta'){ await loadDeviceData(); if(typeof loadRacks==='function'){ try{ await loadRacks(); }catch(e){} } if(typeof renderDeviceRegBeta==='function') renderDeviceRegBeta(); }
  if(name==='vendor'){ await loadDeviceData(); renderVendorReg(); }
  if(name==='model'){ await loadDeviceData(); renderModelReg(); }
  if(name==='linecard'){ await loadDeviceData(); renderCardReg(); }
  if(name==='lab'){ await loadDeviceData(); renderLabReg(); }
  if(name==='itms-rack'){ await loadDeviceData(); await loadRacks(); renderRackPage(); }
  if(name==='stc-traffic'){ renderStcTraffic(); }
  if(name==='ixia-traffic'){ renderIxiaTraffic(); }
  if(name==='req-v2'){ if(typeof renderReqV2==='function') renderReqV2(); }
  if(name==='cov-v2'){ if(typeof renderCovV2==='function') renderCovV2(); }
  if(name==='meters') renderMeterTree();
  if(name==='snmp'){ await loadDeviceData(); renderSnmp(); }
  if(name==='sys-users'){ renderUsers(); }
  if(name==='sys-org'){ if(typeof renderOrgConfig==='function') renderOrgConfig(); }
  if(name==='sys-ai'){ if(typeof renderAILearn==='function') renderAILearn(); }
  if(name==='ai-stat'){ if(typeof renderAIStats==='function') renderAIStats(); }
  if(name==='bbs'){ await bbsLoad(); bbsRender(); }
  if(name==='sys-help'){ if(typeof helpInit==='function') await helpInit(); }
  if(name==='llm'){ Promise.all([loadLLMsFromServer(), (typeof loadDifyAssistants==='function'?loadDifyAssistants():Promise.resolve())]).then(()=>{renderLLMTree(); if(typeof _llmRestoreView==='function') _llmRestoreView(); else if(typeof llmModelTab==='function')llmModelTab('chat');}); }
  if(name==='ai-config'){ if(typeof renderAiConfig==='function') renderAiConfig(); }
  if(name==='sys-jira'){ if(typeof renderJiraConfig==='function') renderJiraConfig(); }
  if(name==='sys-jira-search'){ if(typeof renderJiraSearchCfg==='function') renderJiraSearchCfg(); }
  if(name==='knowledge-src'){ if(typeof renderKnowledgeSrc==='function') renderKnowledgeSrc(); }
  if(name==='sys-jira-panel'){ if(typeof renderJiraPanelPage==='function') renderJiraPanelPage(); }
  if(name==='sys-mail'){ if(typeof renderMailConfig==='function') renderMailConfig(); }
  if(name==='issue-sync'){ if(typeof renderIssueSync==='function') renderIssueSync(); }
  if(name==='jira-ai'||name==='jira-ai-beta'){ if(typeof renderJiraAi==='function') renderJiraAi('jira-ai-beta-body'); }   // jira-ai 는 옛 URL 호환 → jira-ai-beta 로 매핑
  if(name==='release-summary'){ if(typeof renderReleaseSummary==='function') renderReleaseSummary(); }
  if(name==='manual'){ await loadManuals(); renderManuals(); }
  if(name==='req'){
    await Promise.all([loadREQData().catch(function(){}), loadTCData().catch(function(){})]);
    req2RenderTree();
    const lastFolder=sessionStorage.getItem('utop_last_req_folder');
    if(lastFolder&&reqFolders.find(f=>f.id===lastFolder)){
      req2SelectFolder(lastFolder);
      const lastReqId=sessionStorage.getItem('utop_last_req_id');
      if(lastReqId&&reqList.find(r=>r.id===lastReqId)){
        req2ExpandedIds.add('req-'+lastReqId);
        const lastTab=sessionStorage.getItem('utop_last_req_tab')||'details';
        window['req2ActiveTab_'+lastReqId]=lastTab;
        setTimeout(()=>{
          req2Render();
          if(lastTab==='scenario') setTimeout(()=>req2InitTiny(lastReqId), 300);
          else if(lastTab==='impl') setTimeout(()=>req2InitTinyImpl(lastReqId), 300);
        },100);
      }
    }
  }
  if(name==='tc'){
    await Promise.all([loadREQData().catch(function(){}), loadTCData().catch(function(){})]);
    renderTCReqTree();
  }
  if(name==='cycle'){
    // ★ REQ/TC/Cycle/CustomFields/Devices 5개를 모두 한 번에 병렬 fetch → 최대 시간(약 270ms) 하나만 대기.
    //   initCyclePage 안에서 중복 호출해도 loadXxx 는 inflight promise 재사용으로 재-fetch 안 함.
    await Promise.all([
      loadREQData().catch(function(){}),
      loadTCData().catch(function(){}),
      (typeof loadCycleData==='function'?loadCycleData().catch(function(){}):Promise.resolve()),
      loadCustomFields().catch(function(){}),
      (typeof loadDeviceData==='function'?loadDeviceData().catch(function(){}):Promise.resolve()),
    ]);
    await initCyclePage();
  }
  if(name==='milestone'){
    await Promise.all([
      loadREQData().catch(function(){}),
      loadTCData().catch(function(){}),
      (typeof loadCycleData==='function'?loadCycleData().catch(function(){}):Promise.resolve()),
    ]);
    renderMilestonePage();
  }
  if(name==='board'){ await initBoardPage(); }
  if(name==='todo'){
    // 관리자 전용 페이지 — 비관리자는 dashboard 로 리다이렉트
    if(typeof isAdmin==='function' && !isAdmin()){ return showPage('dashboard'); }
    if(typeof renderTodoPage==='function') renderTodoPage();
  }
  if(name==='report'){
    await Promise.all([
      loadREQData().catch(function(){}),
      loadTCData().catch(function(){}),
      (typeof loadCycleData==='function'?loadCycleData().catch(function(){}):Promise.resolve()),
      loadCustomFields().catch(function(){}),
    ]);
    renderReport();
  }
  if(name==='results') loadResults();
  if(name==='templates') renderTemplates();
  if(name==='chat') await chatInit();
  if(name==='explorer'){
    await Promise.all([
      loadREQData().catch(function(){}),
      loadTCData().catch(function(){}),
      (typeof loadCycleData==='function'?loadCycleData().catch(function(){}):Promise.resolve()),
      loadCustomFields().catch(function(){}),
    ]);
    expLoadState();
    renderExplorer();
    // 정렬/필터 UI 동기화
    const ss=document.getElementById('exp-sort'); if(ss) ss.value=expSort;
    const ts=document.getElementById('exp-tc-sort'); if(ts) ts.value=expTcSort;
    const sd=document.getElementById('exp-sort-dir'); if(sd) sd.textContent=expSortDir>0?'↑':'↓';
    const tsd=document.getElementById('exp-tc-sort-dir'); if(tsd) tsd.textContent=expTcSortDir>0?'↑':'↓';
    // 마지막 선택 상세 복원
    if(expSel&&expSel.type==='req'&&reqList.find(r=>r.id===expSel.id)) expRenderREQDetail(expSel.id);
    else if(expSel&&expSel.type==='tc'&&tcList.find(t=>t.tcid===expSel.id)) expRenderTCDetail(expSel.id);
    else if(expSel&&expSel.type==='folder'&&reqFolders.find(f=>f.id===expSel.id)) expRenderFolderDetail(expSel.id);
  }
  if(name==='explorer3'){
    // 데이터가 이미 로드돼 있으면 API 왕복(await)을 기다리지 않고 먼저 그린다 → 첫 화면 지연 제거.
    var _hasData=(typeof reqList!=='undefined' && reqList && reqList.length>0);
    if(_hasData){ if(typeof expLoadState==='function') expLoadState(); renderExplorer3(); }
    await Promise.all([
      loadREQData().catch(function(){}),
      loadTCData().catch(function(){}),
      (typeof loadCycleData==='function'?loadCycleData().catch(function(){}):Promise.resolve()),
      loadCustomFields().catch(function(){}),
    ]);
    if(typeof expLoadState==='function') expLoadState();
    renderExplorer3();
  }
  if(name==='explorer3-beta'){
    // 데이터가 이미 로드돼 있으면 API 왕복(await)을 기다리지 않고 먼저 그린다 → 첫 화면 지연 제거.
    // 그 뒤 캐시 만료·강제 갱신 등이 있으면 완료 후 한 번 더 렌더.
    var _hasData=(typeof reqList!=='undefined' && reqList && reqList.length>0);
    if(_hasData){ if(typeof expLoadState==='function') expLoadState(); if(typeof renderExplorer3Beta==='function') renderExplorer3Beta(); }
    await Promise.all([
      loadREQData().catch(function(){}),
      loadTCData().catch(function(){}),
      (typeof loadCycleData==='function'?loadCycleData().catch(function(){}):Promise.resolve()),
      loadCustomFields().catch(function(){}),
    ]);
    if(typeof expLoadState==='function') expLoadState();
    if(typeof renderExplorer3Beta==='function') renderExplorer3Beta();
  }
  if(name==='sys-custom') initSysCustom();
  if(name==='sys-prompt') initSysPrompt();
  if(name==='global-params'){ if(typeof renderGlobalParams==='function') renderGlobalParams(); }
}

// ══════════════════════════════════════════
// 탐색기 (Explorer) — 폴더▸REQ▸TC 통합 트리 + SquashTM식 세로 레일 상세
// ══════════════════════════════════════════
let expView='all';          // all | req | tc
let expSearch='';
// ══ 페이지 전용 AI FAB — 페이지 데이터 기반 LLM(제마) 챗. 색으로 구분: Tests 주황 / Cycle 초록 / Jira 파랑 (Report 청록은 10-myreport) ══
var _PGFAB={
  tests:{ pages:['explorer3','explorer3-beta','explorer','tm','req','tc','global-params','snmp','ixia-traffic','stc-traffic'], title:'Tests Assistant', sub:'요구사항, 커버리지, 절차에 관련된 답변을 할 수 있습니다.', c1:'#e8820c', c2:'#fbbf24', sh:'rgba(232,130,12,0.45)', ctx:function(q){ return _pgCtxTests(q); },
    refresh:async function(){ try{ if(typeof loadREQData==='function') await loadREQData(true); }catch(e){} try{ if(typeof loadTCData==='function') await loadTCData(true); }catch(e){} } },
  cycle:{ pages:['cycle','milestone'], title:'Cycle Assistant', c1:'#db2777', c2:'#f472b6', sh:'rgba(219,39,119,0.45)', ctx:function(q){ return _pgCtxCycle(q); },
    refresh:async function(){ try{ if(typeof loadCycleData==='function') await loadCycleData(); }catch(e){} } },
  jira:{ pages:['release-summary','issue-sync','sys-jira','sys-jira-search','sys-jira-panel'], title:'Jira AI', c1:'#0052cc', c2:'#4c9aff', sh:'rgba(0,82,204,0.45)', ctx:function(){ return _pgCtxJira(); },
    refresh:async function(){ try{ if(typeof _rlsLoad==='function') await _rlsLoad(); }catch(e){} },
    ex:['버전별 이슈 수 알려줘','미해결 이슈 알려줘','TC 연결 안 된 이슈 있어?','담당자별 이슈 현황은?'] }
};
function _pgFabKey(name){ for(var k in _PGFAB){ if(_PGFAB[k].pages.indexOf(name)>=0) return k; } return ''; }
// fab 모드 단일 디스패처 — 원본 스타일은 최초 1회 저장, 페이지 이동 시 항상 여기서 결정
function _fabSet(cfg){
  var fab=document.getElementById('ai-fab'); if(!fab) return;
  if(!window._fabOrig) window._fabOrig={bg:fab.style.background, sh:fab.style.boxShadow, title:fab.title, oc:fab.onclick};
  var o=window._fabOrig;
  if(!cfg){ fab.style.background=o.bg; fab.style.boxShadow=o.sh; fab.title=o.title; fab.onclick=o.oc; return; }
  fab.style.background='linear-gradient(135deg,'+cfg.c1+','+cfg.c2+')';
  fab.style.boxShadow='0 6px 20px '+cfg.sh;
  fab.title=cfg.title;
  fab.onclick=cfg.click;
}
function _fabPageApply(name){
  try{ var pp=document.getElementById('pg-ai-fab-pop'); if(pp){ pp.remove(); if(typeof _fabShow==='function')_fabShow(true); } }catch(e){}
  try{ var rp=document.getElementById('rpt-ai-fab-pop'); if(rp&&name!=='report'){ rp.remove(); if(typeof _fabShow==='function')_fabShow(true); } }catch(e){}
  if(name==='report'){ _fabSet({c1:'#0d9488',c2:'#2dd4bf',sh:'rgba(13,148,136,0.45)',title:'Test Report Assistant 질문 — 답이 탐색 그래프·결과에 반영됩니다',click:function(e){ if(e&&e.stopPropagation)e.stopPropagation(); if(typeof _rptFabToggle==='function')_rptFabToggle(); }}); return; }
  // fab은 딱 3개 화면만 활성: Requirements & Test Coverage(explorer3) / Test Execution(cycle)
  var key=(name==='explorer3'||name==='explorer3-beta'||name==='explorer')?'tests':(name==='cycle'?'cycle':'');
  if(key){ var c=_PGFAB[key]; _fabSet({c1:c.c1,c2:c.c2,sh:c.sh,title:c.title+' — 이 페이지 데이터 기반 질문',click:(function(k){ return function(e){ if(e&&e.stopPropagation)e.stopPropagation(); _pgFabToggle(k); }; })(key)}); return; }
  _fabSet(null);
}
// ai-fab 팝업 상단 기준 — topnav-bar 바로 아래부터 화면 끝까지 (화면 밀림 없이 오버레이)
function _fabPopTop(){ try{ var n=document.querySelector('.topnav-bar'); if(n){ var r=n.getBoundingClientRect(); if(r.height>0&&r.bottom>0) return Math.round(r.bottom); } }catch(e){} return 0; }
function _fabShow(v){ var f=document.getElementById('ai-fab'); if(f) f.style.display=v?'flex':'none'; }
function _pgFabClose(){ var p=document.getElementById('pg-ai-fab-pop'); if(p)p.remove(); _fabShow(true); }
// 좌로 확대 — 3단계 순환: 기본 → 중간 → 최대 → 기본
var _PGFAB_WIDTHS=['760px','1100px','96vw'];   // 0:기본, 1:중간, 2:최대
function _pgFabToggleWide(){
  var p=document.getElementById('pg-ai-fab-pop'); if(!p) return;
  var cur=parseInt(p.dataset._widx||'0',10); if(isNaN(cur)) cur=0;
  var next=(cur+1)%_PGFAB_WIDTHS.length;
  p.style.width=_PGFAB_WIDTHS[next];
  p.dataset._widx=String(next);
  // 아이콘: 0/1 단계는 좌로(확대 가능), 2 단계(최대)에선 우로(원복)
  try{
    var _btn=p.querySelector('button[onclick="_pgFabToggleWide()"] i');
    if(_btn) _btn.className='ti '+(next===2?'ti-arrow-bar-to-right':'ti-arrow-bar-to-left');
  }catch(_e){}
}
function _pgFabToggle(key){
  var p=document.getElementById('pg-ai-fab-pop'); if(p){ _pgFabClose(); return; }
  var cfg=_PGFAB[key]; if(!cfg) return;
  p=document.createElement('div'); p.id='pg-ai-fab-pop';
  p.style.cssText='position:fixed;right:0;top:'+_fabPopTop()+'px;bottom:0;width:760px;max-width:95vw;background:#fff;border-left:1px solid var(--border);border-top:1px solid var(--border);box-shadow:-10px 0 30px rgba(0,0,0,0.14);z-index:11600;display:flex;flex-direction:column;overflow:hidden;';
  // 헤더 액션 버튼 — 현대적 원형 배경 + 크기 2배 (36×36, 아이콘 20px)
  var _hdrBtn=function(icon,title,onclick){
    return '<button onclick="'+onclick+'" title="'+title+'" style="width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;border:none;background:rgba(255,255,255,0.16);color:#fff;border-radius:10px;cursor:pointer;transition:background 0.15s,transform 0.1s;padding:0;" onmouseenter="this.style.background=\'rgba(255,255,255,0.28)\'" onmouseleave="this.style.background=\'rgba(255,255,255,0.16)\'" onmousedown="this.style.transform=\'scale(0.94)\'" onmouseup="this.style.transform=\'\'"><i class="ti '+icon+'" style="font-size:20px;"></i></button>';
  };
  p.innerHTML='<div style="padding:10px 14px;background:linear-gradient(135deg,'+cfg.c1+','+cfg.c2+');color:#fff;display:flex;align-items:center;gap:8px;flex-shrink:0;">'
      +'<i class="ti ti-message-chatbot" style="font-size:19px;"></i><b style="font-size:17px;">'+cfg.title+'</b><span style="font-size:15px;opacity:0.85;">'+(cfg.sub||'이 페이지 데이터 기반 답변')+'</span><span style="flex:1;"></span>'
      +'<div style="display:flex;align-items:center;gap:6px;">'
        +_hdrBtn('ti-arrow-bar-to-left','좌로 화면 확대 · 다시 클릭 시 원복','_pgFabToggleWide()')
        +_hdrBtn('ti-broom','대화 비우기','_pgChatClear(\''+key+'\')')
        +_hdrBtn('ti-square-rounded-x','닫기','_pgFabClose()')
      +'</div>'
    +'</div>'
    +'<div id="pg-fab-msgs" style="flex:1;min-height:0;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:8px;background:#f7f8fb;"></div>'
    +'<div style="padding:9px 12px;border-top:1px solid var(--border);display:flex;gap:7px;flex-shrink:0;background:#fff;">'
      +'<input id="pg-fab-q" name="pg-fab-q-'+Date.now()+'" placeholder="질문 입력 (Enter 전송)" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-form-type="other" onkeydown="if(event.key===\'Enter\')_pgFabSend(\''+key+'\',this.value)" style="flex:1;font-size:13.5px;padding:10px 12px;border:1.5px solid var(--border);border-radius:9px;outline:none;">'
      +'<button onclick="_pgFabSend(\''+key+'\',document.getElementById(\'pg-fab-q\').value)" title="전송" style="width:40px;border:none;border-radius:9px;background:'+cfg.c1+';color:#fff;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;"><i class="ti ti-send"></i></button></div>';
  document.body.appendChild(p);
  _fabShow(false);   // 팝업이 열리는 동안 fab 숨김
  _pgFabMsgs(key);
  // 페이지 AI 설정(오프닝·추천질문·안내문) 로드 후 재렌더 — 첫 진입 시 _pageAiCfg 비어있으면 오프닝/추천이 안 뜨는 문제 방지
  try{
    if(typeof _pgAiCfgGet==='function'){
      _pgAiCfgGet().then(function(cf){
        var pa=(cf&&cf[key])||{};
        var ph=(pa.placeholder||'').trim();
        var i=document.getElementById('pg-fab-q'); if(i&&ph) i.placeholder=ph;
        // 오프닝/추천 질문을 다시 그리기 — 대화가 이미 시작된 경우엔 _pgFabMsgs 내부에서 자동 skip
        _pgFabMsgs(key);
      });
    }
  }catch(e){}
  setTimeout(function(){ var i=document.getElementById('pg-fab-q'); if(i)i.focus(); },30);
}
// 대화 영속화 — 새로고침·페이지 이동 시에도 유지. 지우기 버튼으로만 초기화.
var _PGCHAT_LS='utop_pg_chat_v1';
function _pgChatLoad(){
  if(window._pgChat) return window._pgChat;
  try{
    var raw=localStorage.getItem(_PGCHAT_LS);
    window._pgChat=raw?JSON.parse(raw):{};
    if(!window._pgChat||typeof window._pgChat!=='object') window._pgChat={};
  }catch(e){ window._pgChat={}; }
  return window._pgChat;
}
function _pgChatSave(key){
  try{
    var all=window._pgChat||{};
    // 저장 시 로딩/HITL 임시 메시지 제외
    var out={};
    Object.keys(all).forEach(function(k){
      out[k]=(all[k]||[]).filter(function(m){ return m && !m.loading && !m.hitlPick && !m.cycHitl; });
    });
    localStorage.setItem(_PGCHAT_LS, JSON.stringify(out));
  }catch(e){}
}
function _pgChatClear(key){
  window._pgChat=window._pgChat||{};
  window._pgChat[key]=[];
  _pgChatSave(key);
  _pgFabMsgs(key);
}
// 스트리밍 중 특정 AI 메시지 bubble 만 부분 갱신 (전체 재렌더 회피 → 텍스트가 실시간으로 흘러가 보임)
function _pgFabMsgPatch(key, mi, html){
  var box=document.getElementById('pg-fab-msgs'); if(!box) return false;
  var b=box.querySelector('.ai-fab-bubble[data-msgi="'+mi+'"]'); if(!b) return false;
  b.innerHTML=html;
  // 사용자가 위로 스크롤 안 했으면 하단 유지
  var atBottom=(box.scrollHeight-box.scrollTop-box.clientHeight)<40;
  if(atBottom) box.scrollTop=box.scrollHeight;
  return true;
}
function _pgFabMsgs(key){
  var box=document.getElementById('pg-fab-msgs'); if(!box) return;
  var cfg=_PGFAB[key]; if(!cfg) return;
  var e=function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;'); };
  _pgChatLoad(); var ms=window._pgChat[key]=window._pgChat[key]||[];
  var h='';
  if(!ms.length){
    // 오프닝 멘트·추천 질문: AI Assistant › LLM 설정(Tests AI/Cycle AI)에서 입력한 값만 사용 — 하드코딩 기본값 없음(비우면 안 보임)
    var _pa=((window._pageAiCfg||{})[key])||{}; var _gr=(_pa.greeting||'').trim(); var _qk=(_pa.quick||[]).filter(Boolean);
    if(_gr) h+='<div style="font-size:14px;color:var(--text);padding:10px 6px 2px;line-height:1.7;">'+((typeof formatMsg==='function')?formatMsg(_gr):e(_gr).replace(/\n/g,'<br>'))+'</div>';
    if(_qk.length){
      h+='<div style="font-size:12px;color:var(--text3);font-weight:700;padding:8px 6px 0;">추천 질문</div>'
       +_qk.map(function(x){ var xe=x.replace(/'/g,"\\'"); return '<button onclick="_pgFabSend(\''+key+'\',\''+xe+'\')" style="display:flex;align-items:center;gap:11px;width:100%;box-sizing:border-box;text-align:left;font-size:13.5px;font-weight:600;padding:13px 15px;border:1px solid var(--border);border-radius:11px;background:#fff;color:var(--text);cursor:pointer;" onmouseenter="this.style.borderColor=\''+cfg.c1+'\'" onmouseleave="this.style.borderColor=\'var(--border)\'"><i class="ti ti-message-2-question" style="color:'+cfg.c1+';font-size:17px;flex-shrink:0;"></i><span style="flex:1;min-width:0;">'+e(x)+'</span><i class="ti ti-arrow-right" style="color:var(--text3);font-size:16px;flex-shrink:0;"></i></button>'; }).join('');
    }
  }
  var _ab=function(icon,title,fn,color){ return '<button onclick="'+fn+'" title="'+title+'" style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border:none;border-radius:5px;background:transparent;color:'+(color||'#8a92a6')+';cursor:pointer;padding:0;" onmouseenter="this.style.background=\'#f0f2f5\'" onmouseleave="this.style.background=\'transparent\'"><i class="ti '+icon+'" style="font-size:14px;"></i></button>'; };
  ms.forEach(function(m, mi){
    if(m.role==='user') {
      // 사용자 질문: 편집·삭제 액션
      h+='<div class="pg-fab-row" data-mi="'+mi+'" style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;">'
        +'<div class="pg-fab-msg-user" style="max-width:85%;background:'+cfg.c1+';color:#fff;border-radius:12px 12px 3px 12px;padding:10px 14px;font-size:15px;line-height:1.65;white-space:pre-wrap;word-break:break-word;">'+e(m.text)+'</div>'
        +'<div style="display:flex;gap:1px;">'
          +_ab('ti-pencil','수정','_pgFabEditUser(\''+key+'\','+mi+')')
          +_ab('ti-trash','삭제','_pgFabDelMsg(\''+key+'\','+mi+')')
        +'</div>'
      +'</div>';
    } else if(m.hitlPick || m.cycHitl || m.loading){
      // HITL 카드나 로딩 메시지는 액션 없음
      h+='<div class="ai-fab-bubble" data-msgi="'+mi+'" style="flex-shrink:0;align-self:flex-start;max-width:98%;background:transparent;border:none;border-radius:0;padding:6px 4px;font-size:15px;line-height:1.7;color:var(--text);word-break:break-word;overflow:hidden;">'+(m.html||e(m.text))+'</div>';
    } else {
      // AI 답변: 복사·좋아요·별로·재실행
      h+='<div class="pg-fab-row" data-mi="'+mi+'" style="display:flex;flex-direction:column;align-items:flex-start;gap:3px;">'
        +'<div class="ai-fab-bubble" data-msgi="'+mi+'" style="max-width:98%;background:transparent;border:none;border-radius:0;padding:6px 4px;font-size:15px;line-height:1.7;color:var(--text);word-break:break-word;overflow:hidden;">'+(m.html||e(m.text))+'</div>'
        +'<div style="display:flex;gap:1px;padding-left:4px;">'
          +_ab('ti-copy','복사','_pgFabCopyMsg(\''+key+'\','+mi+')')
          +_ab('ti-thumb-up','좋아요','_pgFabRate(\''+key+'\','+mi+',1)','#00a872')
          +_ab('ti-thumb-down','별로','_pgFabRate(\''+key+'\','+mi+',-1)','#e53e5a')
          +_ab('ti-refresh','다시 답변','_pgFabRegen(\''+key+'\','+mi+')')
        +'</div>'
      +'</div>';
    }
  });
  box.innerHTML=h; box.scrollTop=box.scrollHeight;
  _pgChatSave(key);
}
// 메시지 액션 헬퍼들
function _pgFabCopyMsg(key, mi){
  var ms=(window._pgChat||{})[key]||[]; var m=ms[mi]; if(!m) return;
  var txt='';
  // html 이 있으면 innerText 로 변환
  if(m.html){ var _tmp=document.createElement('div'); _tmp.innerHTML=m.html; txt=_tmp.innerText||_tmp.textContent||''; }
  else txt=String(m.text||'');
  try{ navigator.clipboard.writeText(txt); if(typeof showToast==='function')showToast('복사됨'); }
  catch(e){ var ta=document.createElement('textarea'); ta.value=txt; document.body.appendChild(ta); ta.select(); try{document.execCommand('copy');}catch(_){} ta.remove(); if(typeof showToast==='function')showToast('복사됨'); }
}
function _pgFabEditUser(key, mi){
  var ms=(window._pgChat||{})[key]||[]; var m=ms[mi]; if(!m||m.role!=='user') return;
  var inp=document.getElementById('pg-fab-q'); if(!inp) return;
  inp.value=m.text||''; inp.focus();
  try{ inp.setSelectionRange(inp.value.length, inp.value.length); }catch(_){}
}
function _pgFabDelMsg(key, mi){
  if(!confirm('이 메시지를 삭제할까요?')) return;
  var ms=(window._pgChat||{})[key]||[]; if(mi<0||mi>=ms.length) return;
  // 사용자 메시지 삭제 시 바로 다음의 AI 답변도 함께 삭제
  var removeN=1;
  if(ms[mi] && ms[mi].role==='user' && ms[mi+1] && ms[mi+1].role==='ai') removeN=2;
  ms.splice(mi, removeN);
  _pgFabMsgs(key);
}
function _pgFabRate(key, mi, v){
  var ms=(window._pgChat||{})[key]||[]; var m=ms[mi]; if(!m) return;
  m.rating=(m.rating===v)?0:v;   // 같은 값 재클릭 시 해제
  _pgFabMsgs(key);
  if(typeof showToast==='function') showToast(v>0?'👍 좋아요':(v<0?'👎 별로':'평가 해제'));
  // 서버 피드백 전송 (엔드포인트 있으면)
  try{
    var _q=''; for(var i=mi-1;i>=0;i--){ if(ms[i]&&ms[i].role==='user'){ _q=ms[i].text||''; break; } }
    fetch('/api/ai/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      thumb:v, question:_q, answer:(m.text||(m.html||'').replace(/<[^>]+>/g,'')).slice(0,2000), source:'pg-fab:'+key
    })}).catch(function(){});
  }catch(_e){}
}
async function _pgFabRegen(key, mi){
  var ms=(window._pgChat||{})[key]||[]; if(mi<0||mi>=ms.length) return;
  var m=ms[mi]; if(!m||m.role!=='ai') return;
  // 직전 사용자 질문 찾기
  var _q=''; for(var i=mi-1;i>=0;i--){ if(ms[i]&&ms[i].role==='user'){ _q=ms[i].text||''; break; } }
  if(!_q){ if(typeof showToast==='function')showToast('다시 답변할 질문이 없습니다'); return; }
  // 이 AI 메시지 이후는 삭제, 이 메시지도 삭제 → _pgFabSend 재실행
  ms.splice(mi);   // mi 이후 모두 삭제 (사용자 질문은 유지되어 있음)
  // 사용자 질문은 이미 ms 에 있으니 그대로 다시 send 하면 중복. 사용자 질문도 지우고 재전송
  if(ms.length && ms[ms.length-1].role==='user' && ms[ms.length-1].text===_q) ms.pop();
  _pgFabMsgs(key);
  window._pgHitlChosen=true;   // HITL 재요청 방지 (같은 질문)
  await _pgFabSend(key, _q);
}
// 로딩 HTML — 현재 단계 한 줄만 표시(문구가 read→think→write로 바뀜)
function _fabLoadingHtml(cfg, phase){
  var steps={read:['데이터 읽는 중','ti-database-search'],think:['컨텍스트 분석 중','ti-brain'],write:['답변 생성 중','ti-writing']};
  var s=steps[phase]||steps.read;
  var col=(cfg&&cfg.c1)||'#0d9488';
  var dots='<span class="fab-typing"><span></span><span></span><span></span></span>';
  return '<div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:'+col+';padding:2px 0;">'
    +'<i class="ti '+s[1]+' spin" style="font-size:16px;flex-shrink:0;"></i><span>'+s[0]+' '+dots+'</span></div>';
}
// Tests AI 생성 규약 — 사용자가 생성을 요청한 경우에만 답변 끝에 utop-create JSON 블록 출력
var _PGFAB_CREATE_RULE='\n\n[생성 규약] 사용자가 REQ/TC/절차(Step)의 "생성·추가·만들기"를 명시적으로 요청한 경우에만, 답변 본문 마지막에 아래 형식의 코드블록을 정확히 1개 출력한다:\n'
 +'```utop-create\n{"reqs":[{"name":"REQ 제목","desc":"설명(선택)"}],"tcs":[{"req":"연결할 REQ (기존 REQID/제목 또는 위 reqs의 name)","name":"TC 제목","purpose":"시험 목적(선택)","modelGroup":"모델그룹명","sessionDevices":["장비 id"],"steps":[{"desc":"스텝 설명","cli":"CLI 명령","type":"contains","criteria":"기대 결과 문자열"}]}]}\n```\n'
 +'- JSON은 유효해야 하며 주석·후행쉼표 금지. 생성 요청이 아니면 이 블록을 절대 출력하지 않는다.\n'
 +'- 현재 화면 데이터의 기존 REQ/TC와 중복되지 않게, 기존 명명 규칙·판정기준 형식을 따른다.\n'
 +'- [CLI 정확성] cli는 지어내지 말고, 위 [현재 화면 데이터]의 기존 TC Step에 있는 실제 CLI와 "생성 참조"를 근거로 작성한다. 시험 목적에 맞는 명령을 쓴다(예: 온도 조회면 온도 관련 명령이지 system 조회가 아니다). 근거가 없으면 그 스텝을 비우거나 desc만 쓰고 cli는 빈 문자열로 둔다.\n'
 +'- [모델그룹/세션] 사용자가 시험 장비(모델명)를 지정하면: "생성 참조"의 "등록 모델(모델명→모델그룹)"에서 그 모델이 속한 모델그룹을 찾아 modelGroup에 넣고, "등록 장비"에서 해당 모델의 장비 id를 찾아 sessionDevices 배열에 넣는다. 못 찾으면 두 필드를 생략한다.\n'
 +'- type은 contains|equals|regex 중 하나. 생성만 요청받은 항목만 넣는다(REQ만 요청 시 tcs는 빈 배열).';
// HITL: 비교/차이 질문 감지 → 여러 TC 후보가 있으면 체크박스 팝업으로 사용자에게 선택 요청.
// 반환: Promise<TC[]|null>. null=취소, []=비교 아님/후보 없음(스킵), TC 배열=선택된 것들.
function _pgFabHitlPickTcs(q){
  return new Promise(function(resolve){
    try{
      // 1) 비교 의도 감지
      var _qs=String(q||''); var _kw=/비교|차이|어떤.*다른|뭐가.*다른|무엇이.*다른|compare|difference|다른\s*점|어떻게\s*다른/i;
      if(!_kw.test(_qs)){ resolve([]); return; }
      // 2) TC 후보 수집: 질문 안 언급된 tcid/이름 우선, 없으면 최근/전체
      var tcs=(typeof tcList!=='undefined'?tcList:[])||[];
      if(!tcs.length){ resolve([]); return; }
      var _esc=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');};
      var _mentions=[];
      tcs.forEach(function(t){
        var _id=String(t.tcid||t.id||''); var _nm=String(t.name||'');
        if(_id && _qs.indexOf(_id)>=0) _mentions.push(t);
        else if(_nm && _nm.length>=2 && _qs.indexOf(_nm)>=0) _mentions.push(t);
      });
      // 언급된 게 2개 이상이면 사용자가 이미 지목 → HITL 생략
      if(_mentions.length>=2){ resolve([]); return; }
      // 후보 선정: 언급된 것 + 최근 업데이트 순 25개
      var _cands=_mentions.slice();
      var _rest=tcs.filter(function(t){return _cands.indexOf(t)<0;})
        .sort(function(a,b){return String(b.updated_at||b.created_at||'').localeCompare(String(a.updated_at||a.created_at||''));})
        .slice(0, 25);
      _cands=_cands.concat(_rest);
      if(_cands.length<2){ resolve([]); return; }
      // 3) 모달 팝업
      var ov=document.createElement('div');
      ov.style.cssText='position:fixed;inset:0;background:rgba(15,20,35,0.55);z-index:12500;display:flex;align-items:center;justify-content:center;';
      var picked={};
      // 미리 언급된 TC 는 자동 체크
      _mentions.forEach(function(t){ picked[t.tcid||t.id]=1; });
      var _rowHtml=_cands.map(function(t,i){
        var _tid=t.tcid||t.id||''; var _dispId=(typeof expDispId==='function'?expDispId(_tid):_tid);
        var _checked=picked[_tid]?' checked':'';
        return '<label class="hitl-row" style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid #eef1f5;cursor:pointer;" onmouseenter="this.style.background=\'#f5f8ff\'" onmouseleave="this.style.background=\'\'">'
          +'<input type="checkbox" class="hitl-cb" data-tid="'+_esc(_tid)+'" data-idx="'+i+'"'+_checked+' style="width:16px;height:16px;cursor:pointer;flex-shrink:0;">'
          +'<span style="font-size:11px;font-weight:700;color:#2d6fd4;font-family:ui-monospace,monospace;flex-shrink:0;min-width:120px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="'+_esc(_tid)+'">'+_esc(_dispId)+'</span>'
          +'<span style="font-size:13px;color:var(--text);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="'+_esc(t.name||'')+'">'+_esc(t.name||'')+'</span>'
          +'</label>';
      }).join('');
      ov.innerHTML='<div style="background:#fff;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.3);width:640px;max-width:94vw;max-height:82vh;display:flex;flex-direction:column;overflow:hidden;">'
        +'<div style="padding:16px 20px 8px;">'
        +'<div style="font-size:15px;font-weight:800;color:#1c2033;display:flex;align-items:center;gap:8px;"><i class="ti ti-git-compare" style="color:#e8820c;font-size:18px;"></i>비교할 시험항목 선택</div>'
        +'<div style="font-size:11.5px;color:var(--text3);margin-top:4px;line-height:1.5;">비교 대상을 2개 이상 체크한 뒤 <b>비교</b> 를 눌러주세요. 원래 질문에 자동으로 첨부됩니다.</div>'
        +'<div style="margin-top:8px;padding:8px 10px;background:#faf8ff;border-left:3px solid #7c3aed;border-radius:4px;font-size:12px;color:#4a1f9e;">"'+_esc(_qs.length>140?_qs.slice(0,140)+'…':_qs)+'"</div>'
        +'<div style="margin-top:10px;position:relative;"><i class="ti ti-search" style="position:absolute;left:9px;top:50%;transform:translateY(-50%);color:var(--text3);font-size:14px;"></i><input id="hitl-q" placeholder="TC 이름/ID 검색…" style="width:100%;padding:7px 10px 7px 30px;font-size:12.5px;border:1px solid var(--border);border-radius:7px;outline:none;box-sizing:border-box;"></div>'
        +'</div>'
        +'<div id="hitl-list" style="flex:1;overflow:auto;border-top:1px solid #eef0f3;">'+_rowHtml+'</div>'
        +'<div style="display:flex;align-items:center;gap:10px;padding:12px 20px;border-top:1px solid #eef0f3;background:#fafbfc;">'
        +'<span id="hitl-cnt" style="font-size:12px;color:var(--text3);">선택 <b id="hitl-cnt-n" style="color:#2d6fd4;">0</b>개</span>'
        +'<span style="flex:1;"></span>'
        +'<button id="hitl-cancel" style="font-size:13px;padding:8px 18px;border-radius:8px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;font-weight:600;">취소</button>'
        +'<button id="hitl-skip" title="이번은 비교 안 함 — 원래 질문 그대로 진행" style="font-size:13px;padding:8px 18px;border-radius:8px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;font-weight:600;">건너뛰기</button>'
        +'<button id="hitl-ok" style="font-size:13px;padding:8px 22px;border-radius:8px;border:none;background:#e8820c;color:#fff;cursor:pointer;font-weight:800;">비교</button>'
        +'</div></div>';
      document.body.appendChild(ov);
      var _updateCnt=function(){
        var n=ov.querySelectorAll('.hitl-cb:checked').length;
        var el=ov.querySelector('#hitl-cnt-n'); if(el) el.textContent=n;
        var okBtn=ov.querySelector('#hitl-ok'); if(okBtn){ okBtn.disabled=(n<2); okBtn.style.opacity=(n<2?'0.5':'1'); okBtn.style.cursor=(n<2?'not-allowed':'pointer'); }
      };
      var _close=function(){ try{ov.remove();}catch(e){} };
      ov.onclick=function(e){ if(e.target===ov){ _close(); resolve(null); } };
      ov.querySelector('#hitl-cancel').onclick=function(){ _close(); resolve(null); };
      ov.querySelector('#hitl-skip').onclick=function(){ _close(); resolve([]); window._pgHitlChosen=true; /* 다음 요청부터 다시 감지 */ };
      ov.querySelector('#hitl-ok').onclick=function(){
        var sel=[]; Array.prototype.forEach.call(ov.querySelectorAll('.hitl-cb:checked'),function(cb){
          var _idx=parseInt(cb.getAttribute('data-idx'),10);
          if(!isNaN(_idx) && _cands[_idx]) sel.push(_cands[_idx]);
        });
        if(sel.length<2) return;
        _close(); resolve(sel);
      };
      ov.querySelector('#hitl-list').addEventListener('change', function(ev){ if(ev.target && ev.target.classList && ev.target.classList.contains('hitl-cb')) _updateCnt(); });
      // 검색 필터
      var qi=ov.querySelector('#hitl-q');
      if(qi){ qi.oninput=function(){
        var v=String(qi.value||'').trim().toLowerCase();
        Array.prototype.forEach.call(ov.querySelectorAll('#hitl-list .hitl-row'), function(row){
          var t=row.textContent.toLowerCase();
          row.style.display=(!v || t.indexOf(v)>=0)?'flex':'none';
        });
      }; setTimeout(function(){ qi.focus(); }, 60); }
      _updateCnt();
    }catch(_e){ resolve([]); }
  });
}

// HITL 필요 여부 판별 — 비교/차이 키워드 감지 + 질문 안 TC 지목 개수 확인
function _pgFabHitlNeed(q){
  var out={need:false, mentioned:[]};
  var _qs=String(q||''); if(!_qs.trim()) return out;
  var _kw=/비교|차이|어떤.*다른|뭐가.*다른|무엇이.*다른|compare|difference|다른\s*점|어떻게\s*다른|차이점|공통점/i;
  if(!_kw.test(_qs)) return out;
  var tcs=(typeof tcList!=='undefined'?tcList:[])||[];
  var _mentions=[];
  tcs.forEach(function(t){
    var _id=String(t.tcid||t.id||''); var _nm=String(t.name||'');
    if(_id && _qs.indexOf(_id)>=0){ _mentions.push(t); return; }
    if(_nm && _nm.length>=3 && _qs.indexOf(_nm)>=0){ _mentions.push(t); }
  });
  out.mentioned=_mentions;
  // 질문에 이미 2개 이상 TC 를 지목했으면 HITL 불필요 → 바로 답변
  out.need=(_mentions.length<2);
  return out;
}
// ═══════════════════════════════════════════════
// Cycle FAB HITL — "사이클 생성/실행" 의도 감지 → 부족한 정보만 되묻는 카드
// 상태: window._pgCycHitlState[id]={intent:'create'|'run', origQ, mgroup, model, vgroup, version, tcs:[], reqOpen:{}, active:'mgroup'}
// ═══════════════════════════════════════════════
window._pgCycHitlState=window._pgCycHitlState||{};
// 질문에서 의도 감지 — 사이클 생성 or 실행
function _pgCycFabIntent(q){
  var t=String(q||'');
  var _create=/(사이클|cycle).*(만들|생성|추가|만드|create|make|add)/i.test(t) || /(만들|생성|추가|만드|create|make|add).*(사이클|cycle)/i.test(t);
  var _run=/(사이클|cycle).*(실행|돌려|시작|start|run|execute)/i.test(t) || /(실행|돌려|시작|start|run|execute).*(사이클|cycle)/i.test(t);
  if(_create) return 'create';
  if(_run) return 'run';
  return '';
}
// 카드 상태 초기화 — 질문에 이미 있는 값(모델명·버전) 은 자동 추출해 해당 단계 스킵
function _pgCycHitlInit(id, q, intent){
  var _mdlAll=(typeof modelList!=='undefined'?modelList:[])||[];
  var _cycs=(typeof cycleList!=='undefined'?cycleList:[])||[];
  var _st={intent:intent, origQ:q, mgroup:'', model:'', vgroup:'', version:'', tcs:[], reqOpen:{}, active:'mgroup'};
  // 질문에서 모델 토큰(E5724RL, U9532H 등) 감지 → 모델 확정
  var _tok=(String(q).match(/\b[A-Za-z]{1,3}\d{3,5}[A-Za-z0-9-]*\b/g)||[]);
  for(var i=0;i<_tok.length;i++){
    var _mm=_mdlAll.find(function(x){return String(x.name||'').toUpperCase()===_tok[i].toUpperCase();});
    if(_mm){ _st.model=_mm.name; _st.mgroup=_mm.group||''; break; }
  }
  // 사이클 목록에서 이미 사용된 값도 감지 (버전그룹·버전명)
  _cycs.forEach(function(c){
    if(!_st.vgroup && c.version_group && q.indexOf(c.version_group)>=0) _st.vgroup=c.version_group;
    if(!_st.version && c.version && q.indexOf(c.version)>=0) _st.version=c.version;
  });
  // 다음 미확정 단계로 active 설정
  _st.active=_pgCycHitlNextStep(_st);
  window._pgCycHitlState[id]=_st;
  return _st;
}
// 미확정 단계 다음 반환 (mgroup → model → vgroup → version → tc[생성] → done)
function _pgCycHitlNextStep(st){
  if(!st.mgroup) return 'mgroup';
  if(!st.model) return 'model';
  if(!st.vgroup) return 'vgroup';
  if(!st.version) return 'version';
  if(st.intent==='create' && (!st.tcs||!st.tcs.length)) return 'tc';
  return 'done';
}
// 사용 가능한 모델그룹·모델·버전그룹 옵션 계산
function _pgCycHitlOpts(st){
  var _mdlAll=(typeof modelList!=='undefined'?modelList:[])||[];
  var _cycs=(typeof cycleList!=='undefined'?cycleList:[])||[];
  // 모델그룹 후보: modelList 의 group 필드 + cycleList 에서 추출한 그룹
  var _mgs=[]; var _mgSet={};
  _mdlAll.forEach(function(m){ var g=String(m.group||'').trim(); if(g&&!_mgSet[g]){ _mgSet[g]=1; _mgs.push(g); } });
  _cycs.forEach(function(c){
    var _m=_mdlAll.find(function(x){return x.name===c.model;}); var g=(_m&&_m.group)||c.model||'';
    if(g&&!_mgSet[g]){ _mgSet[g]=1; _mgs.push(g); }
  });
  _mgs.sort();
  // 모델 후보: 선택된 모델그룹의 모델들
  var _mds=_mdlAll.filter(function(m){ return !st.mgroup || String(m.group||'').trim()===st.mgroup; }).map(function(m){return m.name;}).filter(Boolean);
  _mds=Array.from(new Set(_mds)).sort();
  // 버전그룹 후보: cycleList 중 같은 모델의 version_group
  var _vgs=Array.from(new Set(_cycs.filter(function(c){ return !st.model || c.model===st.model; }).map(function(c){return c.version_group||'(미분류)';}).filter(Boolean))).sort();
  return {mgroups:_mgs, models:_mds, vgroups:_vgs};
}
// HITL 카드 HTML — 단계별 옵션 표시. 확정 버튼 상태는 모든 필수 단계가 채워졌을 때만 활성
function _pgCycHitlCardHtml(id){
  var st=window._pgCycHitlState[id]; if(!st) return '';
  var opts=_pgCycHitlOpts(st);
  var esc=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');};
  var _pill=function(label,cur,active){
    var _c=active?'#db2777':(cur?'#00875a':'#8890a4');
    var _bg=active?'#fce7f3':(cur?'#e6f7ef':'#eef1f5');
    return '<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:800;padding:3px 10px;border-radius:12px;background:'+_bg+';color:'+_c+';">'+esc(label)+(cur?': <span style="color:#1a2236;">'+esc(cur)+'</span>':'')+'</span>';
  };
  // 진행 표시(칩) — 완료된 단계는 값 표시, 현재 단계는 하이라이트
  var _steps=[
    {k:'mgroup', label:'모델그룹'}, {k:'model', label:'모델명'},
    {k:'vgroup', label:'버전그룹'}, {k:'version', label:'버전명'}
  ];
  if(st.intent==='create') _steps.push({k:'tc', label:'TC 선택'});
  var _stepBar=_steps.map(function(s){ return _pill(s.label, st[s.k]||(s.k==='tc'?((st.tcs&&st.tcs.length)?(st.tcs.length+'개'):''):''), st.active===s.k); }).join(' ');
  // 헤더
  var _hdr='<div style="background:linear-gradient(135deg,#db2777,#f472b6);padding:10px 14px;color:#fff;font-weight:800;display:flex;align-items:center;gap:8px;"><i class="ti ti-recycle" style="font-size:16px;"></i>사이클 '+(st.intent==='create'?'생성':'실행')+' — 부족한 항목을 선택해 주세요<span style="flex:1;"></span><span style="font-size:10px;font-weight:800;background:rgba(255,255,255,0.28);border-radius:10px;padding:3px 9px;letter-spacing:0.5px;">HITL</span></div>';
  // 각 단계 UI (현재 active 만 자세히 표시)
  var _body='';
  if(st.active==='mgroup'){
    _body+='<div style="padding:12px 14px;">';
    _body+='<div style="font-size:12.5px;font-weight:700;color:var(--text);margin-bottom:8px;">모델그룹을 선택하세요</div>';
    _body+='<div style="display:flex;flex-wrap:wrap;gap:6px;max-height:180px;overflow-y:auto;">';
    (opts.mgroups.length?opts.mgroups:['(등록된 모델그룹 없음)']).forEach(function(g){
      _body+='<button '+(opts.mgroups.length?'onclick="_pgCycHitlPick(\''+id+'\',\'mgroup\',\''+esc(g).replace(/\\'/g,"\\\\'")+'\')"':'')+' style="font-size:11.5px;font-weight:700;padding:6px 12px;border-radius:8px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;">'+esc(g)+'</button>';
    });
    _body+='</div></div>';
  } else if(st.active==='model'){
    _body+='<div style="padding:12px 14px;">';
    _body+='<div style="font-size:12.5px;font-weight:700;color:var(--text);margin-bottom:8px;">모델명 선택 <span style="font-size:10.5px;color:var(--text3);font-weight:600;margin-left:6px;">('+esc(st.mgroup)+' 그룹)</span></div>';
    _body+='<div style="display:flex;flex-wrap:wrap;gap:6px;max-height:180px;overflow-y:auto;">';
    (opts.models.length?opts.models:['(그룹 소속 모델 없음)']).forEach(function(m){
      _body+='<button '+(opts.models.length?'onclick="_pgCycHitlPick(\''+id+'\',\'model\',\''+esc(m).replace(/\\'/g,"\\\\'")+'\')"':'')+' style="font-size:11.5px;font-weight:700;padding:6px 12px;border-radius:8px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;">'+esc(m)+'</button>';
    });
    _body+='</div></div>';
  } else if(st.active==='vgroup'){
    _body+='<div style="padding:12px 14px;">';
    _body+='<div style="font-size:12.5px;font-weight:700;color:var(--text);margin-bottom:8px;">버전그룹 선택 <span style="font-size:10.5px;color:var(--text3);font-weight:600;margin-left:6px;">(기존 목록 또는 직접 입력)</span></div>';
    _body+='<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">';
    opts.vgroups.forEach(function(g){
      _body+='<button onclick="_pgCycHitlPick(\''+id+'\',\'vgroup\',\''+esc(g).replace(/\\'/g,"\\\\'")+'\')" style="font-size:11.5px;font-weight:700;padding:6px 12px;border-radius:8px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;">'+esc(g)+'</button>';
    });
    _body+='</div>';
    _body+='<div style="display:flex;gap:6px;"><input id="cyc-vg-input-'+id+'" placeholder="새 버전그룹명 직접 입력 (예: R100)" style="flex:1;font-size:12px;padding:7px 10px;border:1px solid var(--border);border-radius:7px;outline:none;"><button onclick="_pgCycHitlPickInput(\''+id+'\',\'vgroup\',\'cyc-vg-input-'+id+'\')" style="font-size:11.5px;font-weight:800;padding:7px 14px;border-radius:7px;border:none;background:#db2777;color:#fff;cursor:pointer;">사용</button></div>';
    _body+='</div>';
  } else if(st.active==='version'){
    _body+='<div style="padding:12px 14px;">';
    _body+='<div style="font-size:12.5px;font-weight:700;color:var(--text);margin-bottom:8px;">버전명 직접 입력 <span style="font-size:10.5px;color:var(--text3);font-weight:600;margin-left:6px;">('+esc(st.vgroup)+' 그룹)</span></div>';
    _body+='<div style="display:flex;gap:6px;"><input id="cyc-ver-input-'+id+'" placeholder="버전명 (예: R101_2026_07_23)" style="flex:1;font-size:12px;padding:7px 10px;border:1px solid var(--border);border-radius:7px;outline:none;" onkeydown="if(event.key===\'Enter\'){event.preventDefault();_pgCycHitlPickInput(\''+id+'\',\'version\',\'cyc-ver-input-'+id+'\');}"><button onclick="_pgCycHitlPickInput(\''+id+'\',\'version\',\'cyc-ver-input-'+id+'\')" style="font-size:11.5px;font-weight:800;padding:7px 14px;border-radius:7px;border:none;background:#db2777;color:#fff;cursor:pointer;">사용</button></div>';
    _body+='</div>';
  } else if(st.active==='tc'){
    // REQ 별 TC 트리 (모델그룹 관련 TC만 필터)
    _body+='<div style="padding:12px 14px;">';
    _body+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><div style="font-size:12.5px;font-weight:700;color:var(--text);">TC 선택 <span style="font-size:10.5px;color:var(--text3);font-weight:600;margin-left:6px;">('+(st.tcs.length)+'개 선택됨)</span></div><span style="flex:1;"></span><button onclick="_pgCycHitlTcAll(\''+id+'\',true)" style="font-size:10.5px;font-weight:700;padding:4px 9px;border-radius:6px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;">전체선택</button><button onclick="_pgCycHitlTcAll(\''+id+'\',false)" style="font-size:10.5px;font-weight:700;padding:4px 9px;border-radius:6px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;">전체해제</button></div>';
    _body+='<div style="max-height:300px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:8px 10px;background:#fafbfc;">'+_pgCycHitlTcTreeHtml(id)+'</div>';
    _body+='</div>';
  }
  // 진행 표시 + 확정 버튼
  var _canDone=(_pgCycHitlNextStep(st)==='done');
  var _submitLbl=(st.intent==='create')?'생성':'실행';
  var _submitIc=(st.intent==='create')?'ti-plus':'ti-player-play-filled';
  var _footer='<div style="padding:10px 14px;border-top:1px solid var(--border);background:#fafbfc;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'
    +'<div style="display:flex;flex-wrap:wrap;gap:5px;">'+_stepBar+'</div>'
    +'<span style="flex:1;"></span>'
    +'<button onclick="_pgCycHitlCancel(\''+id+'\')" style="font-size:11.5px;padding:6px 14px;border-radius:7px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;">취소</button>'
    +'<button onclick="_pgCycHitlSubmit(\''+id+'\')" '+(_canDone?'':'disabled')+' style="font-size:12px;font-weight:800;padding:7px 16px;border-radius:7px;border:none;background:'+(_canDone?'#db2777':'#f5a3ca')+';color:#fff;cursor:'+(_canDone?'pointer':'not-allowed')+';display:inline-flex;align-items:center;gap:5px;"><i class="ti '+_submitIc+'"></i> '+_submitLbl+'</button>'
    +'</div>';
  return '<div style="background:#fff;border:1px solid #f9a8d4;border-radius:9px;overflow:hidden;box-shadow:0 3px 10px rgba(219,39,119,0.14);">'+_hdr+_body+_footer+'</div>';
}
// REQ 별 TC 트리 HTML — 모델그룹 소속 관련 TC만 노출
function _pgCycHitlTcTreeHtml(id){
  var st=window._pgCycHitlState[id]; if(!st) return '';
  var esc=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');};
  var _tcs=(typeof tcList!=='undefined'?tcList:[])||[];
  var _reqs=(typeof reqList!=='undefined'?reqList:[])||[];
  // 이 모델·모델그룹과 연관된 TC만 (연결 없는 TC는 필터 걸리지 않으니 노출)
  var _tcByReq={};
  _tcs.forEach(function(t){
    var _rid=t.req_id||'_orphan'; (_tcByReq[_rid]=_tcByReq[_rid]||[]).push(t);
  });
  var _sel={}; (st.tcs||[]).forEach(function(k){_sel[k]=1;});
  var h='';
  // REQ 별 그룹핑 (REQ 소속 없으면 '기타' 그룹)
  var _reqOrder=_reqs.slice(0);
  var _hasOrph=(_tcByReq['_orphan']||[]).length>0;
  _reqOrder.forEach(function(r){
    var _rid=r.id; var _list=_tcByReq[_rid]||[]; if(!_list.length) return;
    var _open=st.reqOpen[_rid]!==false;   // 기본 펼침
    // REQ 전체 선택 상태
    var _allSel=_list.every(function(t){return _sel[t.tcid||t.id];});
    var _someSel=_list.some(function(t){return _sel[t.tcid||t.id];});
    h+='<div style="margin-bottom:6px;">'
      +'<div style="display:flex;align-items:center;gap:6px;padding:5px 4px;border-radius:5px;cursor:pointer;background:'+(_someSel?'rgba(219,39,119,0.06)':'transparent')+';" onclick="_pgCycHitlReqToggle(\''+id+'\',\''+_rid+'\')">'
      +'<i class="ti ti-caret-'+(_open?'down':'right')+'-filled" style="font-size:12px;color:var(--text3);"></i>'
      +'<input type="checkbox" '+(_allSel?'checked':(_someSel?'checked':''))+' onclick="event.stopPropagation();_pgCycHitlReqSelAll(\''+id+'\',\''+_rid+'\',this.checked)" style="width:14px;height:14px;cursor:pointer;">'
      +'<i class="ti ti-file-text" style="font-size:13px;color:#2d6fd4;"></i>'
      +'<span style="font-size:11.5px;font-weight:800;color:#2d6fd4;font-family:monospace;flex-shrink:0;">'+esc(r.reqid||'')+'</span>'
      +'<span style="font-size:12px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(r.title||'')+'</span>'
      +'<span style="font-size:10px;font-weight:800;color:#00875a;background:rgba(0,168,114,0.1);border-radius:8px;padding:1px 7px;flex-shrink:0;">'+_list.length+'개</span>'
      +'</div>';
    if(_open){
      h+='<div style="padding:2px 4px 4px 24px;">';
      _list.forEach(function(t){
        var _tk=t.tcid||t.id; var _on=!!_sel[_tk];
        h+='<label style="display:flex;align-items:center;gap:6px;padding:3px 6px;border-radius:4px;cursor:pointer;" onmouseenter="this.style.background=\'rgba(0,0,0,0.03)\'" onmouseleave="this.style.background=\'\'">'
          +'<input type="checkbox" '+(_on?'checked':'')+' onchange="_pgCycHitlTcToggle(\''+id+'\',\''+esc(_tk).replace(/\\'/g,"\\\\'")+'\',this.checked)" style="width:13px;height:13px;cursor:pointer;">'
          +'<span style="font-size:11px;font-weight:700;color:#2d6fd4;font-family:monospace;">'+esc(_tk.replace(/^U-REQ-SYS-/i,''))+'</span>'
          +'<span style="font-size:11.5px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(t.name||'')+'</span>'
          +'</label>';
      });
      h+='</div>';
    }
    h+='</div>';
  });
  if(_hasOrph){
    // 기타 (REQ 미연결) TC 는 표시 안 함 (신뢰도 낮음)
  }
  return h||'<div style="padding:20px;text-align:center;color:var(--text3);font-size:11.5px;">등록된 REQ/TC 가 없습니다</div>';
}
// 선택 액션 헬퍼들
function _pgCycHitlPick(id, key, val){
  var st=window._pgCycHitlState[id]; if(!st) return;
  st[key]=val;
  // 모델그룹 바뀌면 하위 값 리셋
  if(key==='mgroup'){ st.model=''; st.vgroup=''; st.version=''; st.tcs=[]; }
  if(key==='model'){ st.vgroup=''; st.version=''; st.tcs=[]; }
  if(key==='vgroup'){ st.version=''; }
  st.active=_pgCycHitlNextStep(st);
  _pgCycHitlRefresh(id);
}
function _pgCycHitlPickInput(id, key, inputId){
  var el=document.getElementById(inputId); if(!el) return;
  var v=(el.value||'').trim(); if(!v){ if(typeof showToast==='function')showToast('값을 입력하세요'); return; }
  _pgCycHitlPick(id, key, v);
}
function _pgCycHitlReqToggle(id, rid){
  var st=window._pgCycHitlState[id]; if(!st) return;
  st.reqOpen[rid]=(st.reqOpen[rid]===false)?true:false;
  _pgCycHitlRefresh(id);
}
function _pgCycHitlReqSelAll(id, rid, on){
  var st=window._pgCycHitlState[id]; if(!st) return;
  var _tcs=(typeof tcList!=='undefined'?tcList:[])||[];
  var _list=_tcs.filter(function(t){return t.req_id===rid;});
  var _cur=new Set(st.tcs||[]);
  _list.forEach(function(t){ var _k=t.tcid||t.id; if(on) _cur.add(_k); else _cur.delete(_k); });
  st.tcs=Array.from(_cur);
  st.active=_pgCycHitlNextStep(st);
  _pgCycHitlRefresh(id);
}
function _pgCycHitlTcToggle(id, tcid, on){
  var st=window._pgCycHitlState[id]; if(!st) return;
  var _cur=new Set(st.tcs||[]);
  if(on) _cur.add(tcid); else _cur.delete(tcid);
  st.tcs=Array.from(_cur);
  st.active=_pgCycHitlNextStep(st);
  _pgCycHitlRefresh(id);
}
function _pgCycHitlTcAll(id, on){
  var st=window._pgCycHitlState[id]; if(!st) return;
  var _tcs=(typeof tcList!=='undefined'?tcList:[])||[];
  if(on){ st.tcs=_tcs.filter(function(t){return t.req_id;}).map(function(t){return t.tcid||t.id;}); }
  else st.tcs=[];
  st.active=_pgCycHitlNextStep(st);
  _pgCycHitlRefresh(id);
}
// 카드 재렌더 (해당 메시지의 html 만 교체)
function _pgCycHitlRefresh(id){
  try{
    var _ms=(window._pgChat&&window._pgChat.cycle)||[];
    for(var i=0;i<_ms.length;i++){ if(_ms[i].cycHitlId===id){ _ms[i].html=_pgCycHitlCardHtml(id); break; } }
    if(typeof _pgFabMsgs==='function') _pgFabMsgs('cycle');
  }catch(_e){}
}
function _pgCycHitlCancel(id){
  var _ms=(window._pgChat&&window._pgChat.cycle)||[];
  for(var i=_ms.length-1;i>=0;i--){ if(_ms[i].cycHitlId===id){ _ms.splice(i,1); break; } }
  delete window._pgCycHitlState[id];
  _ms.push({role:'ai', text:'취소했어요.'});
  if(typeof _pgFabMsgs==='function') _pgFabMsgs('cycle');
}
// 최종 실행 — 생성 or 실행 분기
async function _pgCycHitlSubmit(id){
  var st=window._pgCycHitlState[id]; if(!st) return;
  if(_pgCycHitlNextStep(st)!=='done'){ if(typeof showToast==='function')showToast('아직 부족한 항목이 있어요'); return; }
  var _ms=(window._pgChat&&window._pgChat.cycle)||[];
  // 카드 자리에 결과 요약 넣기
  for(var i=_ms.length-1;i>=0;i--){ if(_ms[i].cycHitlId===id){ _ms.splice(i,1); break; } }
  if(st.intent==='create'){
    _ms.push({role:'ai', text:'사이클 생성 중… ('+st.mgroup+' · '+st.model+' · '+st.vgroup+' · '+st.version+', TC '+st.tcs.length+'개)'});
    if(typeof _pgFabMsgs==='function') _pgFabMsgs('cycle');
    try{
      var _tcs=(typeof tcList!=='undefined'?tcList:[])||[];
      var _folderId=(typeof cycleSelFolderId!=='undefined'&&cycleSelFolderId)||(((typeof cycleFolderList!=='undefined'&&cycleFolderList[0])||{}).id)||'';
      if(!_folderId){ var _nf={id:'cf-'+Date.now()+'-'+Math.floor(Math.random()*1000),name:st.mgroup||st.model||'기본 프로젝트'}; if(typeof cycleFolderList!=='undefined'){ cycleFolderList=cycleFolderList||[]; cycleFolderList.push(_nf); } try{ if(typeof saveCycleFolders==='function') await saveCycleFolders(); }catch(_){} _folderId=_nf.id; }
      var _items=st.tcs.map(function(_k){
        var _t=_tcs.find(function(x){return (x.tcid||x.id)===_k;});
        if(!_t) return null;
        var _st_arr=[]; try{ if(typeof _checksToSteps==='function') _st_arr=JSON.parse(JSON.stringify(_checksToSteps(_t, st.model))); }catch(_){}
        if(!_st_arr||!_st_arr.length){ try{ if(typeof _checksToSteps==='function') _st_arr=JSON.parse(JSON.stringify(_checksToSteps(_t, ''))); }catch(_){}}
        return {tcid:_t.tcid||_t.id, name:_t.name||_t.tcid||'', req_id:_t.req_id||'', severity:_t.severity||'', priority:_t.priority||'', steps:_st_arr||[]};
      }).filter(Boolean);
      var _cyc={id:'cycle-'+Date.now(), model:st.model, version_group:st.vgroup, version:st.version, folder_id:_folderId, created_at:new Date().toISOString().slice(0,10), items:_items};
      if(typeof cycleList!=='undefined') cycleList.push(_cyc);
      if(typeof saveCycle==='function') await saveCycle(_cyc);
      _ms.push({role:'ai', text:'✅ 사이클 생성 완료: '+st.model+' · '+st.vgroup+' · '+st.version+' (TC '+_items.length+'개)'});
      try{ if(typeof renderCycleBoard==='function') renderCycleBoard(); }catch(_){}
    }catch(e){ _ms.push({role:'ai', text:'⚠ 사이클 생성 실패: '+(e&&e.message||e)}); }
  } else {
    // 실행: 조건 매칭 사이클 찾기 → 없으면 안내, 있으면 첫 매칭 실행
    var _cycs=(typeof cycleList!=='undefined'?cycleList:[])||[];
    var _mdlAll=(typeof modelList!=='undefined'?modelList:[])||[];
    var _match=_cycs.filter(function(c){
      var _cg=(function(){ var _m=_mdlAll.find(function(x){return x.name===c.model;}); return (_m&&_m.group)||c.model||''; })();
      return _cg===st.mgroup && c.model===st.model && (c.version_group||'(미분류)')===st.vgroup && c.version===st.version;
    });
    if(!_match.length){
      _ms.push({role:'ai', text:'⚠ 조건에 맞는 사이클을 찾지 못했습니다: '+st.model+' · '+st.vgroup+' · '+st.version});
    } else {
      var _tgt=_match[0];
      // Cycle 페이지의 선택 상태를 이 사이클로 전환하고 실행 트리거
      try{
        if(typeof cbSel!=='undefined'){
          cbSel.mgroup=st.mgroup; cbSel.model=st.model; cbSel.vgroup=st.vgroup; cbSel.version=st.version;
        }
        if(typeof renderCycleBoard==='function') renderCycleBoard();
        _ms.push({role:'ai', text:'▶ 사이클 실행 준비: '+_tgt.model+' · '+_tgt.version+' — 화면 상단 [전체 실행] 버튼으로 시작하거나 절차 실행을 확인하세요.'});
      }catch(e){ _ms.push({role:'ai', text:'⚠ 실행 전환 실패: '+(e&&e.message||e)}); }
    }
  }
  delete window._pgCycHitlState[id];
  if(typeof _pgFabMsgs==='function') _pgFabMsgs('cycle');
}

// HITL 인라인 카드 HTML — 3단계 탭 (① REQ+TC 선택 → ② 추가 질문). 이미지 참조 스타일(보라 밑줄 탭).
// 상태는 window._pgHitlState[hitlId]={active, tcs:[], extra:'', reqOpen:{}} 로 관리
window._pgHitlState=window._pgHitlState||{};
// 폴더 경로 (예: "U-REQ-SYS-HW > System Spec") 반환
function _pgFabFolderPath(folderId){
  try{
    var folders=(typeof reqFolders!=='undefined'&&Array.isArray(reqFolders))?reqFolders:[];
    var byId={}; folders.forEach(function(f){ byId[f.id]=f; });
    var cur=byId[folderId]; if(!cur) return '';
    var parts=[]; var g=0;
    while(cur && g<20){ parts.unshift(cur.name||''); cur=cur.parent?byId[cur.parent]:null; g++; }
    return parts.filter(Boolean).join(' › ');
  }catch(_e){ return ''; }
}
function _pgFabHitlCardHtml(hitlId, q, mentions, key){
  var e=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');};
  var tcs=(typeof tcList!=='undefined'?tcList:[])||[];
  var reqs=(typeof reqList!=='undefined'?reqList:[])||[];
  var folders=(typeof reqFolders!=='undefined'&&Array.isArray(reqFolders))?reqFolders:[];
  // 상태 초기화 (한 번만)
  var st=window._pgHitlState[hitlId];
  if(!st){
    st={tcs:[], query:q, key:key, search:'', open:{}, openReq:{}, openGrp:{}, view:'group'};
    if(mentions && mentions.length){
      mentions.forEach(function(t){
        var _tid=t.tcid||t.id||''; if(_tid) st.tcs.push(_tid);
        // 언급된 TC 의 상위 폴더·REQ 자동 펼침
        if(t.req_id) st.openReq[t.req_id]=true;
        var _r=reqs.find(function(x){return x.id===t.req_id;});
        var cur=_r?_r.folder:null;
        while(cur){ st.open[cur]=true; var _fp=folders.find(function(x){return x.id===cur;}); cur=_fp?_fp.parent:null; }
      });
    }
    window._pgHitlState[hitlId]=st;
  }
  if(!st.view) st.view='group';   // 기본: 그룹 뷰
  var canSubmit=(st.tcs.length>=2);
  var _q=String(st.search||'').trim().toLowerCase();
  // 검색어 있으면 모든 노드 자동 펼침용 별도 처리
  var _forceOpen=!!_q;
  // 폴더별 REQ, REQ별 TC 매핑
  var reqsByFolder={}; reqs.forEach(function(r){ var _f=r.folder||'_'; if(!reqsByFolder[_f]) reqsByFolder[_f]=[]; reqsByFolder[_f].push(r); });
  var tcsByReq={}; tcs.forEach(function(t){ var _rid=t.req_id||'_'; if(!tcsByReq[_rid]) tcsByReq[_rid]=[]; tcsByReq[_rid].push(t); });
  // 검색 필터: TC 이름/id 매칭
  var tcMatch=function(t){ if(!_q) return true; return ((t.tcid||t.id||'')+' '+(t.name||'')).toLowerCase().indexOf(_q)>=0; };
  var reqHasMatch=function(r){ var _tcs=tcsByReq[r.id]||[]; if(_q && ((r.reqid||'')+' '+(r.title||'')).toLowerCase().indexOf(_q)>=0) return true; return _tcs.some(tcMatch); };
  var folderHasMatch=function(fid){
    var _reqs=(reqsByFolder[fid]||[]);
    if(_reqs.some(reqHasMatch)) return true;
    var _children=folders.filter(function(f){return f.parent===fid;});
    return _children.some(function(f){return folderHasMatch(f.id);});
  };
  // 트리 렌더 (재귀)
  var _rowsHtml='';
  var _anyRendered=false;
  function _renderFolder(fid, depth){
    var _f=folders.find(function(x){return x.id===fid;});
    if(!_f) return;
    if(!folderHasMatch(fid)) return;
    _anyRendered=true;
    var _open=_forceOpen || st.open[fid]===true;
    var _children=folders.filter(function(x){return x.parent===fid;}).sort(function(a,b){return (a.order||0)-(b.order||0);});
    var _reqsHere=(reqsByFolder[fid]||[]).filter(reqHasMatch);
    var _pl=(6+depth*14)+'px';
    // 폴더 헤더
    _rowsHtml+='<div onclick="_pgFabHitlToggleFolder(\''+hitlId+'\',\''+e(fid)+'\')" style="display:flex;align-items:center;gap:5px;padding:4px 8px;padding-left:'+_pl+';cursor:pointer;font-size:12px;font-weight:600;color:#c98a1e;user-select:none;" onmouseenter="this.style.background=\'rgba(232,168,60,0.08)\'" onmouseleave="this.style.background=\'\'">'
      +'<i class="ti ti-chevron-'+(_open?'down':'right')+'" style="font-size:11px;color:#9ca3af;flex-shrink:0;"></i>'
      +'<i class="ti ti-folder'+(_open?'-open':'')+'" style="font-size:13px;color:#e8a83c;flex-shrink:0;"></i>'
      +'<span style="flex:1;min-width:0;word-break:break-all;">'+e(_f.name||'')+'</span>'
    +'</div>';
    if(_open){
      _children.forEach(function(c){ _renderFolder(c.id, depth+1); });
      // 좌측 트리와 동일한 정렬 (기본: reqid 오름차순, e3SortReqs 있으면 사용)
      var _sortedReqs;
      try{ _sortedReqs=(typeof e3SortReqs==='function')?e3SortReqs(_reqsHere):_reqsHere.slice().sort(function(a,b){return String(a.reqid||'').localeCompare(String(b.reqid||''));}); }
      catch(_e){ _sortedReqs=_reqsHere.slice().sort(function(a,b){return String(a.reqid||'').localeCompare(String(b.reqid||''));}); }
      _sortedReqs.forEach(function(r){ _renderReq(r, depth+1); });
    }
  }
  function _renderReq(r, depth){
    var _rid=r.id||''; var _tcs=(tcsByReq[_rid]||[]).filter(tcMatch);
    if(!_tcs.length && !( _q && ((r.reqid||'')+' '+(r.title||'')).toLowerCase().indexOf(_q)>=0)) return;
    _anyRendered=true;
    var _open=_forceOpen || st.openReq[_rid]===true;
    var _pl=(6+depth*14)+'px';
    var _chk=_tcs.filter(function(t){return st.tcs.indexOf(t.tcid||t.id)>=0;}).length;
    // REQ 헤더
    _rowsHtml+='<div onclick="_pgFabHitlToggleReq(\''+hitlId+'\',\''+e(_rid)+'\')" style="display:flex;align-items:center;gap:5px;padding:4px 8px;padding-left:'+_pl+';cursor:pointer;font-size:12px;user-select:none;" onmouseenter="this.style.background=\'rgba(45,111,212,0.05)\'" onmouseleave="this.style.background=\'\'">'
      +'<i class="ti ti-chevron-'+(_open?'down':'right')+'" style="font-size:11px;color:#9ca3af;flex-shrink:0;"></i>'
      +'<i class="ti ti-file-text" style="font-size:13px;color:#2d6fd4;flex-shrink:0;"></i>'
      +'<span style="flex:1;min-width:0;color:#1c2033;font-weight:600;word-break:break-all;">'+e(r.title||r.reqid||'')+'</span>'
      +(r.reqid?('<span style="font-size:10px;font-family:ui-monospace,monospace;color:#6b3fc4;font-weight:700;flex-shrink:0;">'+e(r.reqid)+'</span>'):'')
      +'<span style="font-size:10px;color:'+(_chk?'#e8820c':'#6b7280')+';font-weight:'+(_chk?'800':'600')+';flex-shrink:0;background:'+(_chk?'#fff8ec':'#f5f6f8')+';border-radius:8px;padding:1px 7px;">'+(_chk?(_chk+'/'+_tcs.length):('TC '+_tcs.length))+'</span>'
    +'</div>';
    if(_open){
      _tcs.forEach(function(t){
        var _tid=t.tcid||t.id||''; var on=(st.tcs.indexOf(_tid)>=0);
        var _tpl=(6+(depth+1)*14)+'px';
        _rowsHtml+='<div onclick="_pgFabHitlToggleTc(\''+hitlId+'\',\''+e(_tid)+'\')" style="display:flex;align-items:center;gap:8px;padding:5px 8px;padding-left:'+_tpl+';cursor:pointer;font-size:12px;background:'+(on?'#fff8ec':'transparent')+';" onmouseenter="this.style.background=\'#fffaf0\'" onmouseleave="this.style.background=\''+(on?'#fff8ec':'transparent')+'\'">'
          +'<span style="width:14px;height:14px;border-radius:3px;border:1.5px solid '+(on?'#e8820c':'#c3cbd8')+';background:'+(on?'#e8820c':'#fff')+';display:flex;align-items:center;justify-content:center;flex-shrink:0;">'+(on?'<i class="ti ti-check" style="font-size:10px;color:#fff;"></i>':'')+'</span>'
          +'<i class="ti ti-clipboard-check" style="font-size:12px;color:#7c3aed;flex-shrink:0;"></i>'
          +'<span style="flex:1;min-width:0;color:#1c2033;word-break:break-all;">'+e(t.name||_tid)+'</span>'
        +'</div>';
      });
    }
  }
  if(st.view==='tree'){
    // 루트 폴더부터 순회 (트리 뷰)
    folders.filter(function(f){return !f.parent;}).sort(function(a,b){return (a.order||0)-(b.order||0);}).forEach(function(f){ _renderFolder(f.id, 0); });
    var _orphanReqs=(reqsByFolder['_']||[]).slice();
    try{ _orphanReqs=(typeof e3SortReqs==='function')?e3SortReqs(_orphanReqs):_orphanReqs.sort(function(a,b){return String(a.reqid||'').localeCompare(String(b.reqid||''));}); }
    catch(_e){ _orphanReqs.sort(function(a,b){return String(a.reqid||'').localeCompare(String(b.reqid||''));}); }
    _orphanReqs.forEach(function(r){ _renderReq(r, 0); });
  } else {
    // 그룹 뷰 — 같은 base 제목끼리 묶어서 표시 (모델·버전·접미어 제거)
    var _norm=function(name){
      var s=String(name||'').trim();
      // 흔한 모델·버전 토큰 제거 (괄호/버전/모델명)
      s=s.replace(/\(.*?\)/g,' ');
      s=s.replace(/\bv?\d+(?:\.\d+){1,3}\b/gi,' ');
      s=s.replace(/\b[uU]\d{3,5}[A-Za-z]{0,3}\b/g,' ');
      s=s.replace(/\bE\d{3,5}[A-Za-z]{0,3}\b/g,' ');
      s=s.replace(/[-_/#]+/g,' ');
      s=s.replace(/\s+/g,' ').trim();
      // 앞 5단어 정도만 사용 → 더 잘 묶임
      var parts=s.split(' ').filter(Boolean);
      if(parts.length>6) parts=parts.slice(0,6);
      return parts.join(' ').toLowerCase();
    };
    // 검색 필터 적용
    var _tcAll=tcs.filter(tcMatch);
    var groups={};
    _tcAll.forEach(function(t){
      var _base=_norm(t.name||'')||'(제목없음)';
      if(!groups[_base]) groups[_base]={ name:t.name||'', items:[] };
      groups[_base].items.push(t);
    });
    var _gkeys=Object.keys(groups).sort(function(a,b){ return groups[b].items.length-groups[a].items.length; });
    // 단일 항목 그룹은 하단에 몰아서 (같은 항목이 있는 그룹부터 먼저 노출)
    var _multi=_gkeys.filter(function(k){ return groups[k].items.length>1; });
    var _single=_gkeys.filter(function(k){ return groups[k].items.length===1; });
    var _finalKeys=_multi.concat(_single);
    _finalKeys.forEach(function(gk){
      var g=groups[gk]; if(!g||!g.items.length) return;
      _anyRendered=true;
      var _open=_forceOpen || st.openGrp[gk]===true;   // 기본 접힘 (검색 시에만 자동 펼침)
      var _chk=g.items.filter(function(t){return st.tcs.indexOf(t.tcid||t.id)>=0;}).length;
      var _title=g.name||gk;
      // 그룹 헤더
      _rowsHtml+='<div onclick="_pgFabHitlToggleGrp(\''+hitlId+'\',\''+e(gk).replace(/'/g,"\\'")+'\')" style="display:flex;align-items:center;gap:6px;padding:6px 10px;cursor:pointer;font-size:12.5px;font-weight:700;color:#1c2033;background:'+(_chk?'#fff8ec':'#f5f6f8')+';border-top:1px solid #e5e7eb;user-select:none;">'
        +'<i class="ti ti-chevron-'+(_open?'down':'right')+'" style="font-size:11px;color:#9ca3af;flex-shrink:0;"></i>'
        +'<i class="ti ti-layers-subtract" style="font-size:13px;color:#e8820c;flex-shrink:0;"></i>'
        +'<span style="flex:1;min-width:0;word-break:break-all;">'+e(_title)+'</span>'
        +'<span style="font-size:10px;color:'+(_chk?'#e8820c':'#6b7280')+';font-weight:'+(_chk?'800':'600')+';flex-shrink:0;background:#fff;border:1px solid '+(_chk?'#f5d5a3':'#e5e7eb')+';border-radius:8px;padding:1px 8px;">'+(_chk?(_chk+'/'+g.items.length):(g.items.length+'개'))+'</span>'
      +'</div>';
      if(_open){
        g.items.forEach(function(t){
          var _tid=t.tcid||t.id||''; var on=(st.tcs.indexOf(_tid)>=0);
          var _r2=reqs.find(function(x){return x.id===t.req_id;});
          var _reqLabel=_r2?(_r2.reqid||_r2.title||''):'';
          var _folderName='';
          if(_r2 && _r2.folder){ var _fp=folders.find(function(f){return f.id===_r2.folder;}); if(_fp) _folderName=_fp.name||''; }
          _rowsHtml+='<div onclick="_pgFabHitlToggleTc(\''+hitlId+'\',\''+e(_tid)+'\')" style="display:flex;align-items:center;gap:8px;padding:6px 10px 6px 30px;cursor:pointer;font-size:12px;background:'+(on?'#fff8ec':'#fff')+';border-bottom:1px solid #f5f6f8;" onmouseenter="this.style.background=\'#fffaf0\'" onmouseleave="this.style.background=\''+(on?'#fff8ec':'#fff')+'\'">'
            +'<span style="width:14px;height:14px;border-radius:3px;border:1.5px solid '+(on?'#e8820c':'#c3cbd8')+';background:'+(on?'#e8820c':'#fff')+';display:flex;align-items:center;justify-content:center;flex-shrink:0;">'+(on?'<i class="ti ti-check" style="font-size:10px;color:#fff;"></i>':'')+'</span>'
            +'<i class="ti ti-clipboard-check" style="font-size:12px;color:#7c3aed;flex-shrink:0;"></i>'
            +'<span style="flex:1;min-width:0;color:#1c2033;word-break:break-all;">'+e(t.name||_tid)+'</span>'
            +(_reqLabel?('<span style="font-size:10px;color:#6b3fc4;font-family:ui-monospace,monospace;font-weight:700;flex-shrink:0;background:#f3ecff;border-radius:6px;padding:1px 6px;">'+e(_reqLabel)+'</span>'):'')
            +(_folderName?('<span style="font-size:10px;color:#c98a1e;flex-shrink:0;">'+e(_folderName)+'</span>'):'')
          +'</div>';
        });
      }
    });
  }
  if(!_anyRendered) _rowsHtml='<div style="font-size:12px;color:#6b7280;padding:20px;text-align:center;">검색 결과가 없습니다.</div>';
  var selN=st.tcs.length;
  // 카드 전체
  return '<div id="'+hitlId+'" class="hitl-card" style="border:1px solid #f5d5a3;border-radius:10px;background:#fff;overflow:hidden;box-shadow:0 2px 8px rgba(232,130,12,0.1);">'
    // 오렌지 헤더
    +'<div style="padding:11px 14px;background:linear-gradient(135deg,#e8820c,#fbbf24);color:#fff;display:flex;align-items:center;gap:8px;">'
      +'<i class="ti ti-git-compare" style="font-size:16px;"></i>'
      +'<b style="font-size:13.5px;flex:1;">비교할 시험항목을 선택해주세요</b>'
      +'<span style="font-size:10px;font-weight:800;background:rgba(255,255,255,0.28);border-radius:10px;padding:3px 9px;letter-spacing:0.5px;">HITL</span>'
    +'</div>'
    // 안내문 배너
    +'<div style="padding:9px 14px;font-size:11.5px;color:#5c4700;background:#fff8ec;border-bottom:1px solid #f5e2c0;">2개 이상 체크한 뒤 <b>비교하기</b> 를 눌러주세요. TC ID/제목을 질문에 직접 넣으면 이 단계를 건너뜁니다.</div>'
    // 뷰 전환 탭 (그룹 / 트리)
    +'<div style="display:flex;gap:6px;padding:8px 12px 0;">'
      +'<button onclick="_pgFabHitlSetView(\''+hitlId+'\',\'group\')" style="font-size:11.5px;padding:5px 12px;border-radius:6px;border:1px solid '+(st.view==='group'?'#e8820c':'#e5e7eb')+';background:'+(st.view==='group'?'#e8820c':'#fff')+';color:'+(st.view==='group'?'#fff':'#4b5563')+';cursor:pointer;font-weight:700;display:inline-flex;align-items:center;gap:4px;"><i class="ti ti-layers-subtract" style="font-size:12px;"></i> 같은 항목 그룹</button>'
      +'<button onclick="_pgFabHitlSetView(\''+hitlId+'\',\'tree\')" style="font-size:11.5px;padding:5px 12px;border-radius:6px;border:1px solid '+(st.view==='tree'?'#e8820c':'#e5e7eb')+';background:'+(st.view==='tree'?'#e8820c':'#fff')+';color:'+(st.view==='tree'?'#fff':'#4b5563')+';cursor:pointer;font-weight:700;display:inline-flex;align-items:center;gap:4px;"><i class="ti ti-folder-tree" style="font-size:12px;"></i> 폴더 트리</button>'
    +'</div>'
    // 검색창
    +'<div style="padding:10px 12px 6px;position:relative;">'
      +'<i class="ti ti-search" style="position:absolute;left:20px;top:50%;transform:translateY(-50%);font-size:13px;color:#9ca3af;"></i>'
      +'<input value="'+e(st.search||'')+'" oninput="(window._pgHitlState[\''+hitlId+'\']||{}).search=this.value;_pgFabHitlRerender(\''+hitlId+'\')" placeholder="TC 검색…" style="width:100%;padding:7px 10px 7px 30px;font-size:12px;border:1px solid #e5e7eb;border-radius:8px;outline:none;box-sizing:border-box;background:#fff;">'
    +'</div>'
    // 리스트
    +'<div style="max-height:380px;overflow:auto;padding:0 0 4px;">'+_rowsHtml+'</div>'
    // 하단 액션 바
    +'<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-top:1px solid #f5e2c0;background:#fafbfc;">'
      +'<span style="font-size:11.5px;color:#4b5563;flex-shrink:0;">선택 <b style="color:#e8820c;">'+selN+'</b>개</span>'
      +'<span style="flex:1;"></span>'
      +'<button onclick="_pgFabHitlCancel(\''+hitlId+'\',\''+key+'\')" style="font-size:11.5px;padding:6px 14px;border-radius:7px;border:1px solid #e5e7eb;background:#fff;color:#4b5563;cursor:pointer;font-weight:600;">취소</button>'
      +'<button onclick="_pgFabHitlSkip(\''+hitlId+'\',\''+key+'\')" title="비교 안 하고 원래 질문 그대로 진행" style="font-size:11.5px;padding:6px 14px;border-radius:7px;border:1px solid #e5e7eb;background:#fff;color:#4b5563;cursor:pointer;font-weight:600;">건너뛰기</button>'
      +'<button onclick="_pgFabHitlConfirm(\''+hitlId+'\',\''+key+'\')" '+(canSubmit?'':'disabled')+' style="font-size:12px;padding:7px 18px;border-radius:7px;border:none;background:'+(canSubmit?'#e8820c':'#f5d5a3')+';color:#fff;cursor:'+(canSubmit?'pointer':'not-allowed')+';font-weight:800;display:inline-flex;align-items:center;gap:5px;"><i class="ti ti-git-compare" style="font-size:12px;"></i> 비교하기</button>'
    +'</div>'
    +'</div>';
}
// 탭 클릭 (남겨둠 — 이전 호환용, 사용 안 됨)
function _pgFabHitlTab(hitlId, i){
  var st=window._pgHitlState[hitlId]; if(!st) return;
  st.active=i; _pgFabHitlRerender(hitlId);
}
// 폴더 아코디언 토글
function _pgFabHitlToggleFolder(hitlId, fid){
  var st=window._pgHitlState[hitlId]; if(!st) return;
  st.open=st.open||{};
  st.open[fid]=!st.open[fid];
  _pgFabHitlRerender(hitlId);
}
// REQ 아코디언 토글 (기본: 접힘)
function _pgFabHitlToggleReq(hitlId, rid){
  var st=window._pgHitlState[hitlId]; if(!st) return;
  st.openReq=st.openReq||{};
  st.openReq[rid]=!st.openReq[rid];
  _pgFabHitlRerender(hitlId);
}
// 그룹 뷰 아코디언 토글
function _pgFabHitlToggleGrp(hitlId, gk){
  var st=window._pgHitlState[hitlId]; if(!st) return;
  st.openGrp=st.openGrp||{};
  st.openGrp[gk]=!st.openGrp[gk];
  _pgFabHitlRerender(hitlId);
}
// 뷰 전환 (그룹 / 트리)
function _pgFabHitlSetView(hitlId, v){
  var st=window._pgHitlState[hitlId]; if(!st) return;
  st.view=v;
  _pgFabHitlRerender(hitlId);
}
// TC 토글
function _pgFabHitlToggleTc(hitlId, tid){
  var st=window._pgHitlState[hitlId]; if(!st) return;
  var _i=st.tcs.indexOf(tid);
  if(_i>=0) st.tcs.splice(_i,1); else st.tcs.push(tid);
  _pgFabHitlRerender(hitlId);
}
// 카드 재렌더 (DOM 교체)
function _pgFabHitlRerender(hitlId){
  var st=window._pgHitlState[hitlId]; if(!st) return;
  var ms=(window._pgChat||{})[st.key]||[];
  var idx=ms.findIndex(function(m){return m && m.hitlId===hitlId;});
  if(idx<0) return;
  ms[idx].html=_pgFabHitlCardHtml(hitlId, st.query, [], st.key);   // mentions 는 상태에 이미 반영됨
  _pgFabMsgs(st.key);
}
function _pgFabHitlCancel(hitlId, key){
  var ms=(window._pgChat||{})[key]||[];
  // 카드 메시지 + 직전 사용자 질문 메시지 제거
  var idx=ms.findIndex(function(m){return m && m.hitlId===hitlId;});
  if(idx>=0){ ms.splice(idx,1); if(idx>0 && ms[idx-1] && ms[idx-1].role==='user') ms.splice(idx-1,1); }
  if(window._pgHitlState) delete window._pgHitlState[hitlId];
  _pgFabMsgs(key);
}
async function _pgFabHitlSkip(hitlId, key){
  var ms=(window._pgChat||{})[key]||[];
  var idx=ms.findIndex(function(m){return m && m.hitlId===hitlId;});
  if(idx<0) return;
  var _q=ms[idx].hitlQuery||'';
  ms.splice(idx,1);   // HITL 카드 제거
  // 앞의 사용자 질문 메시지도 이미 있으니 그대로 두고, 원래 질문으로 다시 send (HITL 재감지 방지)
  // 이미 push 된 user 메시지가 있으니 중복 방지 flag 세팅 후 재진입
  window._pgHitlChosen=true;
  await _pgFabSend(key, _q);
}
async function _pgFabHitlConfirm(hitlId, key){
  var ms=(window._pgChat||{})[key]||[];
  var idx=ms.findIndex(function(m){return m && m.hitlId===hitlId;});
  if(idx<0) return;
  var st=(window._pgHitlState||{})[hitlId];
  if(!st){ if(typeof showToast==='function') showToast('상태를 찾지 못했습니다'); return; }
  if(!st.tcs || st.tcs.length<2){ if(typeof showToast==='function') showToast('비교할 TC 를 2개 이상 선택하세요'); st.active=0; _pgFabHitlRerender(hitlId); return; }
  var _q=st.query||'';
  var tcs=(typeof tcList!=='undefined'?tcList:[])||[];
  var _picked=st.tcs.map(function(tid){var t=tcs.find(function(x){return (x.tcid||x.id)===tid;}); return t?((t.tcid||t.id)+' ('+(t.name||'')+')'):tid;});
  ms[idx]={role:'ai', html:'<div style="font-size:12px;color:#4a1f9e;background:#f7f3ff;border:1px solid #d9c9f7;border-radius:8px;padding:8px 12px;">'
    +'<i class="ti ti-git-compare" style="color:#7c3aed;"></i> <b>비교 대상 확정</b> — '
    +_picked.map(function(s){return '<span style="background:#fff;border:1px solid #d9c9f7;border-radius:6px;padding:1px 7px;font-size:11px;margin:2px;display:inline-block;color:#4a1f9e;">'+String(s).replace(/</g,'&lt;')+'</span>';}).join('')
    +'</div>'};
  _pgFabMsgs(key);
  window._pgHitlChosen=true;
  delete window._pgHitlState[hitlId];
  var _extra=(st.extra||'').trim();
  var _augmented=_q+'\n\n[비교 대상 TC — 사용자가 선택함]: '+_picked.join(', ')
    + (_extra?('\n[사용자 추가 지시]: '+_extra):'\n각 TC 의 CLI 명령, 판정 기준, 스텝 개수, 목적 등을 표 형태로 비교하고 주요 차이점을 요약해 주세요.');
  await _pgFabSend(key, _augmented);
}

async function _pgFabSend(key,q){
  q=String(q||'').trim(); if(!q) return;
  var cfg=_PGFAB[key]; if(!cfg) return;
  var inp=document.getElementById('pg-fab-q'); if(inp) inp.value='';
  _pgChatLoad(); var ms=window._pgChat[key]=window._pgChat[key]||[];
  // HITL: Tests 페이지 + 비교/차이 질문 감지 → 질문에 TC 지목 없으면 채팅창 안에 인라인 REQ/TC 선택 카드 표시
  if(key==='tests' && !window._pgHitlChosen){
    try{
      var _needPick=_pgFabHitlNeed(q);   // {need:bool, mentioned:[TC]}
      if(_needPick && _needPick.need){
        ms.push({role:'user', text:q});
        // 인라인 HITL 카드 (system 메시지) 삽입 → _pgFabMsgs 렌더 시 특수 HTML
        var _hitlId='hitl-'+Date.now();
        ms.push({role:'ai', hitlPick:true, hitlId:_hitlId, hitlQuery:q, hitlMentions:_needPick.mentioned||[], html:_pgFabHitlCardHtml(_hitlId, q, _needPick.mentioned||[], key)});
        _pgFabMsgs(key);
        return;   // 사용자가 선택 후 확정 버튼 클릭 시 _pgFabHitlConfirm 이 호출되며 다시 _pgFabSend 재진입
      }
    }catch(_he){}
  }
  // HITL: Cycle 페이지 + "사이클 생성/실행" 의도 감지 → 부족한 항목만 되묻는 카드 표시
  if(key==='cycle' && !window._pgCycHitlChosen){
    try{
      var _cycIntent=_pgCycFabIntent(q);   // 'create'|'run'|''
      if(_cycIntent){
        ms.push({role:'user', text:q});
        var _cycHitlId='cyc-'+Date.now();
        var _st=_pgCycHitlInit(_cycHitlId, q, _cycIntent);
        ms.push({role:'ai', cycHitl:true, cycHitlId:_cycHitlId, html:_pgCycHitlCardHtml(_cycHitlId)});
        _pgFabMsgs(key);
        return;
      }
    }catch(_ce){ try{ console.warn('[cyc-hitl] err', _ce); }catch(_){} }
  }
  window._pgHitlChosen=false;
  window._pgCycHitlChosen=false;
  ms.push({role:'user',text:q});
  var aiMsg={role:'ai',html:_fabLoadingHtml(cfg,'read'),loading:true};
  ms.push(aiMsg);
  _pgFabMsgs(key);
  var setPhase=function(p){ if(aiMsg.loading){ aiMsg.html=_fabLoadingHtml(cfg,p); _pgFabMsgs(key); } };
  try{ if(cfg.refresh) await cfg.refresh(); }catch(e){}   // 질문 시점 최신 데이터 재로드
  setPhase('think');
  var ctx=''; try{ ctx=(await Promise.resolve(cfg.ctx(q)))||''; }catch(e){}   // 질문 전달 → 관련 데이터 선별
  var pai={}; try{ var _c=(typeof _pgAiCfgGet==='function')?await _pgAiCfgGet():{}; pai=(_c&&_c[key])||{}; }catch(e){}
  var _defP=''; try{ if(typeof _pageAiDefPrompt==='function') _defP=_pageAiDefPrompt(key); }catch(e){}
  var sysP=(pai.prompt&&String(pai.prompt).trim())||_defP||('너는 utop '+cfg.title+' 어시스턴트다. 아래 현재 화면의 최신 데이터만 근거로 한국어로 간결하게(필요하면 목록으로) 답하라. 데이터에 없는 내용은 추측하지 말고 없다고 말하라.');
  if(key==='tests') sysP+=_PGFAB_CREATE_RULE;   // Tests AI: REQ/TC/Step 생성 규약 (저장 프롬프트와 무관하게 항상 적용)
  var prompt='[현재 화면 데이터]\n'+ctx+'\n\n[질문]\n'+q;
  setPhase('write');
  // 스트리밍 답변
  var llm=null; try{ llm=pai.llm_id?(await _rptLLMById(pai.llm_id)):(await _rptGemma()); }catch(e){}
  var full='', started=false;
  // 첫 청크에는 loading 을 false 로 전환하며 전체 재렌더 1회 (bubble 스타일 세팅),
  // 이후 청크에는 해당 bubble 만 innerHTML 교체 → 실시간 타자 효과
  var aiMi=ms.length-1;   // 방금 push 한 aiMsg 의 인덱스
  var _firstChunk=true;
  var render=function(){
    aiMsg.loading=false;
    aiMsg.html=((typeof formatMsg==='function')?formatMsg(full):String(full).replace(/</g,'&lt;').replace(/\n/g,'<br>'))+'<span class="fab-caret">▍</span>';
    if(_firstChunk){ _firstChunk=false; _pgFabMsgs(key); }
    else if(!_pgFabMsgPatch(key, aiMi, aiMsg.html)){ _pgFabMsgs(key); }   // bubble 못 찾으면 폴백
  };
  try{
    if(llm&&llm.endpoint&&typeof _streamSSE==='function'){
      var payload={endpoint:llm.endpoint, model:llm.model, messages:[{role:'system',content:sysP},{role:'user',content:prompt}], max_tokens:2400, context_size:llm.context_size||262144, temperature:0.4, apikey:llm.apikey||'', stream:true};
      await _streamSSE('/api/chat/local/stream', payload, function(t){ full+=t; started=true; render(); }, null);
    }
    if(!started){ // 스트리밍 실패/미지원 → 한번에 폴백
      var ans=(typeof _rptLLMChat==='function')?await _rptLLMChat(prompt,2400,0.4,{llmId:pai.llm_id||'',system:sysP}):''; full=ans||''; started=!!ans;
    }
  }catch(e){ if(!started){ try{ var ans2=(typeof _rptLLMChat==='function')?await _rptLLMChat(prompt,2400,0.4,{llmId:pai.llm_id||'',system:sysP}):''; full=ans2||''; started=!!ans2; }catch(_e){} } }
  aiMsg.loading=false;
  if(started){
    var _shown=full;
    var _card='';
    if(key==='tests'){
      // 생성 블록(utop-create JSON) 감지 → 미리보기 카드 (적용 전 데이터 변경 없음)
      var _cm=full.match(/```utop-create\s*([\s\S]*?)```/);
      if(_cm){
        _shown=full.replace(_cm[0],'').trim();
        var _payload=null; try{ _payload=JSON.parse(_cm[1]); }catch(e){}
        if(_payload&&(((_payload.reqs||[]).length)||((_payload.tcs||[]).length))){
          window._pgCreatePending={p:_payload,msg:aiMsg,key:key,text:_shown};
          _card=_pgCreateCardHtml(_payload);
        } else {
          _card='<div style="margin-top:10px;font-size:12px;color:#c0392b;">⚠ 생성 블록 형식 오류 — 같은 요청을 다시 시도해 주세요</div>';
        }
      }
    }
    aiMsg.html=((typeof formatMsg==='function')?formatMsg(_shown):String(_shown).replace(/</g,'&lt;').replace(/\n/g,'<br>'))+_card;
  }
  else { aiMsg.html=''; aiMsg.text='답변 생성에 실패했어요. LLM 서버 상태를 확인해 주세요.'; }
  _pgFabMsgs(key);
}
// ── Tests AI 생성 파이프라인: 미리보기 카드 → [적용] 시 REQ/TC/Step 실제 생성 ──
function _pgCreateCardHtml(p){
  var esc=function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;'); };
  var nR=(p.reqs||[]).length, nT=(p.tcs||[]).length;
  var nS=(p.tcs||[]).reduce(function(s,t){ return s+(((t||{}).steps)||[]).length; },0);
  var lines=[];
  (p.reqs||[]).forEach(function(r){ lines.push('<div style="padding:2px 0;"><i class="ti ti-file-text" style="color:#7c3aed;"></i> <b>REQ</b> '+esc((r||{}).name||'')+'</div>'); });
  (p.tcs||[]).forEach(function(t){ t=t||{}; var mg=t.modelGroup?(' · 모델그룹: '+esc(t.modelGroup)):''; var sd=(t.sessionDevices&&t.sessionDevices.length)?' · 세션 연결':''; lines.push('<div style="padding:2px 0;"><i class="ti ti-clipboard-check" style="color:#00875a;"></i> <b>TC</b> '+esc(t.name||'')+' <span style="color:var(--text3);">· Step '+((t.steps)||[]).length+'개 · REQ: '+esc(t.req||'-')+mg+sd+'</span></div>'); });
  return '<div style="margin-top:12px;border:1.5px solid #e8820c;background:#fff8ef;border-radius:12px;padding:12px 14px;">'
    +'<div style="font-size:13px;font-weight:800;color:#b5730f;margin-bottom:8px;"><i class="ti ti-clipboard-plus"></i> 생성 미리보기 — REQ '+nR+'개 · TC '+nT+'개 · Step '+nS+'개</div>'
    +'<div style="max-height:190px;overflow:auto;font-size:12.5px;color:var(--text);line-height:1.6;margin-bottom:10px;">'+lines.join('')+'</div>'
    +'<div style="display:flex;gap:8px;align-items:center;">'
      +'<button onclick="_pgCreateApply()" style="font-size:12.5px;font-weight:800;padding:8px 18px;border:none;border-radius:8px;background:#e8820c;color:#fff;cursor:pointer;"><i class="ti ti-check"></i> 적용 (실제 생성)</button>'
      +'<button onclick="_pgCreateCancel()" style="font-size:12.5px;font-weight:600;padding:8px 14px;border:1px solid var(--border);border-radius:8px;background:#fff;color:var(--text2);cursor:pointer;">취소</button>'
      +'<span style="font-size:11px;color:var(--text3);">적용 전에는 데이터가 변경되지 않습니다</span>'
    +'</div>'
  +'</div>';
}
function _pgCreateCancel(){
  var pd=window._pgCreatePending; window._pgCreatePending=null;
  if(pd&&pd.msg){ pd.msg.html=((typeof formatMsg==='function')?formatMsg(pd.text||''):'')+'<div style="margin-top:8px;font-size:12px;color:var(--text3);">생성이 취소되었습니다</div>'; _pgFabMsgs(pd.key); }
}
async function _pgCreateApply(){
  var pd=window._pgCreatePending; if(!pd||!pd.p) return;
  window._pgCreatePending=null;
  var p=pd.p; var made={req:0,tc:0,step:0}; var errs=[];
  var esc=function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;'); };
  try{
    // 대상 폴더: 현재 선택 REQ의 폴더 → 없으면 첫 폴더
    var _selRId=(typeof e3SelReq!=='undefined'&&e3SelReq)?e3SelReq:((typeof e3bSelReq!=='undefined'&&e3bSelReq)?e3bSelReq:null);
    var _selR=_selRId?(reqList||[]).find(function(r){ return r.id===_selRId; }):null;
    var folderId=(_selR&&_selR.folder)||(((typeof reqFolders!=='undefined'&&reqFolders&&reqFolders[0])||{}).id)||'';
    var _mkReqId=function(fid){
      var frs=(reqList||[]).filter(function(r){ return r.folder===fid; });
      var base=(typeof getFolderPath==='function')?getFolderPath(fid):((((typeof reqFolders!=='undefined'?reqFolders:[])||[]).find(function(f){ return f.id===fid; })||{}).name||'REQ');
      var autoId=base+'-001';
      if(frs.length){ var lastId=frs[frs.length-1].reqid||''; var m=lastId.match(/^(.*-)(\d+)$/); autoId=m?(m[1]+String(parseInt(m[2])+1).padStart(m[2].length,'0')):(lastId+'-001'); }
      return autoId;
    };
    var nameMap={};
    // ① REQ 생성 (동일 제목 있으면 기존 재사용 — 중복 방지)
    for(var i=0;i<(p.reqs||[]).length;i++){
      var rq=p.reqs[i]||{}; var title=String(rq.name||rq.title||'').trim(); if(!title) continue;
      var dup=(reqList||[]).find(function(r){ return String(r.title||'').trim()===title; });
      if(dup){ nameMap[title]=dup; continue; }
      var now=new Date().toISOString();
      var r={id:'req-'+Date.now()+'-'+i,reqid:_mkReqId(folderId),title:title,folder:folderId,status:'Draft',priority:'Medium',scenarios:'[]',tc:[],products:[],custom_fields:{},created_at:now,updated_at:now.slice(0,10)};
      if(rq.desc) r.desc=String(rq.desc);
      reqList.push(r); await saveOneREQ(r); nameMap[title]=r; made.req++;
    }
    // ② TC 생성 + REQ 커버리지 연결 + Step 주입
    for(var j=0;j<(p.tcs||[]).length;j++){
      var t=p.tcs[j]||{}; var tname=String(t.name||'').trim(); if(!tname) continue;
      var rKey=String(t.req||'').trim();
      var r2=nameMap[rKey]||(reqList||[]).find(function(r){ return r.id===rKey||r.reqid===rKey||String(r.title||'').trim()===rKey; });
      if(!r2){ errs.push('TC "'+tname+'": 연결할 REQ "'+rKey+'"를 찾지 못함'); continue; }
      var _b=(r2.reqid||'REQ').replace(/-\d{3}$/,'')+'-TC-';
      var _s=(typeof _nextSeqFor==='function')?_nextSeqFor(_b,'','tc'):1; var tcid;
      do{ tcid=_b+((typeof _pad3==='function')?_pad3(_s):String(_s).padStart(3,'0')); _s++; }while((tcList||[]).some(function(x){ return x.tcid===tcid; }));
      var now2=new Date().toISOString();
      var tc={tcid:tcid,name:tname,status:'대기',req_id:r2.id,type:'Function',kind:'자체',severity:'Normal',steps:[],custom_fields:{},created_by:((typeof currentUser!=='undefined'&&currentUser&&(currentUser.name||currentUser.username))||'AI'),created_at:now2,updated_at:now2};
      if(t.purpose) tc.object=String(t.purpose);
      tc.checks=[];
      // 모델그룹 지정 시: 모델감지(Switch) 헤더 추가 → 첫 CLI 스텝에 devId 지정(세션) → 이후 스텝은 자동 상속(↑ 표시)
      var _grp=String(t.modelGroup||'').trim();
      if(_grp){
        // 실제 등록된 모델그룹만 인정 (없으면 무시)
        var _grpOk=(typeof groupList!=='undefined'&&groupList)?groupList.some(function(g){ return g.name===_grp; }):true;
        if(_grpOk) tc.checks.push({id:'ck'+Date.now()+Math.floor(Math.random()*1000000)+'m', kind:'model', model:_grp, modelName:_grp, indent:0});
        else _grp='';
      }
      // 세션 장비 id (모델그룹 미인식 시에도 후보가 있으면 사용)
      var _sessDevId=''; (t.sessionDevices||[]).some(function(did){ did=String(did||'').trim(); if(did&&(labList||[]).some(function(l){ return l.id===did; })){ _sessDevId=did; return true; } return false; });
      (t.steps||[]).forEach(function(s,si){
        if(!s) return;
        var _row={id:'ck'+Date.now()+Math.floor(Math.random()*1000000)+si, kind:'cli', action:'CLI', indent:(_grp?1:0),
          desc:String(s.desc||''), cli:String(s.cli||''),
          type:(['contains','equals','regex'].indexOf(String(s.type||''))>=0?String(s.type):'contains'), criteria:String(s.criteria||'')};
        if(si===0&&_sessDevId) _row.devId=_sessDevId;   // 첫 스텝에만 지정 → 이후 스텝은 UI가 자동 상속(↑ 표시)
        tc.checks.push(_row);
        made.step++;
      });
      tcList.push(tc); await saveTCFile(tc);
      if(!Array.isArray(r2.tc)) r2.tc=[];
      r2.tc.push({tcid:tcid,name:tc.name,status:tc.status});
      await saveOneREQ(r2); made.tc++;
    }
  }catch(e){ errs.push((e&&e.message)||String(e)); }
  // 화면 갱신
  try{ if(typeof renderExplorer==='function') renderExplorer(); }catch(e){}
  try{ if(typeof renderExplorer3==='function') renderExplorer3(); }catch(e){}
  var res='<div style="margin-top:12px;border:1.5px solid #a8e0c8;background:#eefaf4;border-radius:12px;padding:11px 14px;font-size:12.5px;color:#0a7a52;font-weight:700;">'
    +'✅ 생성 완료 — REQ '+made.req+'개 · TC '+made.tc+'개 · Step '+made.step+'개'
    +(errs.length?('<div style="margin-top:5px;color:#c0392b;font-weight:600;">'+errs.map(function(x){ return '⚠ '+esc(x); }).join('<br>')+'</div>'):'')
  +'</div>';
  if(pd.msg){ pd.msg.html=((typeof formatMsg==='function')?formatMsg(pd.text||''):'')+res; _pgFabMsgs(pd.key); }
  if(typeof showToast==='function') showToast('생성 완료 — REQ '+made.req+' · TC '+made.tc+' · Step '+made.step);
}
// ── Requirements & Test Coverage 컨텍스트 빌더 ──
// 매 호출마다 라이브 전역 상태(reqList/tcList/tc.checks)를 새로 읽어 LLM 컨텍스트로 직렬화.
// 하드코딩 없음 · 편집 즉시 반영(tcCheckSave가 in-place 수정) · 토큰 예산 초과 시 상세→요약 자동 축약.
var _RTC_BUDGET=24000;   // 컨텍스트 문자 예산 상한 (초과 시 Step 상세를 요약으로 축약)
function _rtcReqOf(t,reqs){ if(!t||t.req_id==null) return null; return reqs.find(function(r){ return r.id===t.req_id||r.reqid===t.req_id; })||null; }
// 조건(IF/cli condition) 문자열화 — conds[]={l,op,r} 우선, 없으면 raw condition
function _rtcCondStr(c){
  try{
    if(Array.isArray(c.conds)&&c.conds.length){ var j=(c.condJoin==='or')?' || ':' && '; return c.conds.map(function(x){ return ((x.l||'')+' '+(x.op||'==')+' '+(x.r||'')).trim(); }).filter(Boolean).join(j); }
  }catch(e){}
  return String(c.condition||'').trim();
}
// 한 Step(check) → 사람이 읽는 한 줄(+옵션 상세). detailed=false면 핵심만.
function _rtcStepLine(c,idx,detailed){
  var k=c.kind||'cli'; var ind=(parseInt(c.indent)||0); var pad='  '+Array((ind)+1).join('  ');
  var no=pad+'- Step '+(idx+1)+' ['+k+']';
  var parts=[];
  if(k==='model'){ parts.push('모델감지: '+(c.modelName||c.model||'-')); if(Array.isArray(c.devices)&&c.devices.length) parts.push('대상 '+c.devices.length+'대'); }
  else if(k==='if'){ var cs=_rtcCondStr(c); parts.push('IF ('+(cs||'조건없음')+')'+(c.result?' → '+c.result:'')); if(Array.isArray(c.elifs)&&c.elifs.length&&detailed){ c.elifs.forEach(function(e,ei){ parts.push('ELIF'+(ei+1)+' ('+(e.condition||'')+')'+(e.result?' → '+e.result:'')); }); } }
  else if(k==='switch'){ parts.push('SWITCH (위 모델감지 값으로 분기)'); if(c.caseValue) parts.push('case='+c.caseValue); }
  else if(k==='loop'){ parts.push('LOOP '+(c.loopMode||'count')+(c.loopVar?(' $'+c.loopVar):'')+(c.loopCount?(' x'+c.loopCount):'')); }
  else if(k==='connect'){ parts.push('세션 연결'+(c.session?(' ['+c.session+']'):'')); }
  else if(k==='disconnect'){ parts.push('세션 종료'); }
  else if(k==='wait'){ parts.push('대기'+(c.waitSec?(' '+c.waitSec+'s'):'')); }
  else if(k==='comment'){ parts.push('주석: '+String(c.desc||c.text||'').slice(0,120)); }
  else { // cli
    if(c.desc) parts.push('설명: '+String(c.desc).replace(/\s+/g,' ').slice(0,120));
    if(c.cli) parts.push('CLI: '+String(c.cli).replace(/\r?\n/g,' ⏎ ').slice(0,220));
    var cnd=_rtcCondStr(c); if(cnd) parts.push('조건: '+cnd.slice(0,120));
    if(c.criteria) parts.push('판정기준: '+String(c.criteria).replace(/\s+/g,' ').slice(0,160));
    var qs=Array.isArray(c.queries)?c.queries:(c.query?[{q:c.query,var:c.queryVar}]:[]);
    if(qs.length){ parts.push('추출변수: '+qs.map(function(q){ return (q.var||'?')+'←('+String(q.q||'').slice(0,60)+')'; }).join(', ')); }
    if(c.extractVar) parts.push('추출: $'+c.extractVar);
    if((parseInt(c.repeat)||1)>1) parts.push('반복 '+c.repeat+'회');
  }
  return no+' '+parts.join(' | ');
}
// TC 하나 → Step 상세 블록
function _rtcTcDetail(t,reqs){
  var rq=_rtcReqOf(t,reqs);
  var head='- TC '+(t.tcid||t.id)+' "'+(t.name||'')+'"'+(rq?(' · REQ '+(rq.reqid||rq.id)):' · REQ 미연결')+(t.purpose||t.desc?(' · 목적: '+String(t.purpose||t.desc).slice(0,100)):'');
  var chs=(t.checks||[]);
  var lines=chs.map(function(c,i){ return _rtcStepLine(c,i,true); });
  return head+'\n'+lines.join('\n');
}
// 전체 구조 요약(항상 포함) — REQ·TC·매핑 + step kind 흐름 개요
function _rtcOverview(reqs,tcs){
  var L=[];
  L.push('[개요] REQ '+reqs.length+'개 · TC '+tcs.length+'개 · 총 Step '+tcs.reduce(function(s,t){return s+((t.checks||[]).length);},0)+'개');
  L.push('');
  L.push('## Requirements ('+reqs.length+')');
  reqs.forEach(function(r){ var linked=tcs.filter(function(t){return t.req_id===r.id||t.req_id===r.reqid;}); L.push('- '+(r.reqid||r.id)+' | '+(r.title||'')+' | 상태 '+(r.status||'-')+' | 중요도 '+(r.priority||'-')+' | 연결 TC '+linked.length+'개'+(linked.length?(' ('+linked.map(function(t){return t.tcid||t.id;}).slice(0,12).join(', ')+')'):' → 커버리지 없음')); });
  L.push('');
  L.push('## Test Cases ('+tcs.length+')  [각 TC: kind 흐름 요약]');
  tcs.forEach(function(t){
    var rq=_rtcReqOf(t,reqs); var chs=(t.checks||[]);
    var kinds={}; chs.forEach(function(c){ var k=c.kind||'cli'; kinds[k]=(kinds[k]||0)+1; });
    var flow=Object.keys(kinds).map(function(k){return k+':'+kinds[k];}).join(', ');
    L.push('- '+(t.tcid||t.id)+' "'+(t.name||'')+'"'+(rq?(' ← REQ '+(rq.reqid||rq.id)):' ← 미연결')+' | Step '+chs.length+'개 ['+flow+']');
  });
  return L.join('\n');
}
// 질문과 매칭되는 TC 선별(ID/이름/CLI 텍스트 키워드) — 대소문자·구분자 무시
function _rtcMatchTcs(q,tcs,reqs){
  var s=String(q||'').toLowerCase(); if(!s) return [];
  var toks=s.split(/[\s,]+/).filter(function(x){return x.length>=2;});
  var scored=tcs.map(function(t){
    var hay=((t.tcid||'')+' '+(t.id||'')+' '+(t.name||'')+' '+(t.purpose||t.desc||'')).toLowerCase();
    var rq=_rtcReqOf(t,reqs); if(rq) hay+=' '+((rq.reqid||'')+' '+(rq.title||'')).toLowerCase();
    (t.checks||[]).forEach(function(c){ hay+=' '+String(c.cli||'').toLowerCase()+' '+String(c.desc||'').toLowerCase()+' '+String(c.modelName||'').toLowerCase(); });
    var sc=0; toks.forEach(function(tk){ if(hay.indexOf(tk)>=0) sc++; });
    // ID 정확 매칭 가중
    if(s.indexOf(String(t.tcid||'').toLowerCase())>=0 && t.tcid) sc+=5;
    return {t:t,sc:sc};
  }).filter(function(x){return x.sc>0;}).sort(function(a,b){return b.sc-a.sc;});
  return scored.map(function(x){return x.t;});
}
// 전체/전수 스캔 의도 질문인지 (전체·모든·전수·목록·요약·중복·누락·커버리지·설계 등)
function _rtcIsBroad(q){ return /전체|모든|전수|다\s*알려|목록|리스트|요약|중복|누락|커버리지|없는|설계|효율|개선|찾아|비교|리뷰|검토|정리|현황/.test(String(q||'')); }
// ── 메인: R&TC 라이브 컨텍스트 문자열 생성 ──
function buildRtcContext(q){
  try{
    var reqs=((typeof reqList!=='undefined'?reqList:[])||[]).slice();
    var tcs=((typeof tcList!=='undefined'?tcList:[])||[]).slice();
    var out=['[Requirements & Test Coverage Context] (실시간 페이지 상태)'];
    out.push(_rtcOverview(reqs,tcs));
    out.push('');
    // 상세 대상 TC 선정: 질문 매칭 우선, broad 질문/매칭 없으면 예산 내에서 채움
    var matched=_rtcMatchTcs(q,tcs,reqs);
    var broad=_rtcIsBroad(q);
    var detailTcs;
    if(matched.length && !broad) detailTcs=matched;              // 특정 TC 질문 → 매칭 TC 상세
    else if(matched.length && broad) detailTcs=matched.concat(tcs.filter(function(t){return matched.indexOf(t)<0;})); // 매칭 우선 + 나머지
    else detailTcs=tcs;                                          // 매칭 없음/전체 질문 → 전체 순서대로
    out.push('## Test Cases & Steps (상세)');
    var body=[]; var used=out.join('\n').length; var truncated=0;
    for(var i=0;i<detailTcs.length;i++){
      var block=_rtcTcDetail(detailTcs[i],reqs);
      if(used+block.length>_RTC_BUDGET){ truncated=detailTcs.length-i; break; }
      body.push(block); used+=block.length+1;
    }
    out.push(body.join('\n\n'));
    if(truncated>0) out.push('\n[알림] 토큰 예산으로 TC '+truncated+'개의 Step 상세는 생략됨 — 위 "Test Cases" 구조 요약에는 전부 포함. 특정 TC를 지목하면 그 상세를 제공함.');
    // ── 생성용 참조: 모델그룹·등록 모델·세션 장비 (장비명→모델그룹→세션 매핑, CLI는 아래 예시·기존 Step을 근거로) ──
    try{
      var groups=(typeof groupList!=='undefined'&&groupList)?groupList.map(function(g){return g.name;}).filter(Boolean):[];
      var models=(typeof modelList!=='undefined'&&modelList)?modelList:[];
      var labs=(typeof labList!=='undefined'&&labList)?labList:[];
      out.push('\n## 생성 참조 (REQ/TC 생성 시 사용)');
      if(groups.length) out.push('- 모델그룹: '+groups.join(', '));
      if(models.length){
        // 모델 → 소속 그룹 매핑 (장비명으로 모델그룹 찾기용)
        out.push('- 등록 모델(모델명→모델그룹): '+models.slice(0,80).map(function(m){ return (m.name||'')+'→'+(m.group||'(미지정)'); }).filter(function(x){return x.indexOf('→')>0;}).join(', '));
      }
      if(labs.length){
        // 세션 장비: id·모델·이름·IP·프로토콜 (장비 지정 시 세션 연결용)
        out.push('- 등록 장비(세션 후보) [id | 모델 | 이름 | IP | 프로토콜]:');
        labs.slice(0,60).forEach(function(l){ out.push('  · '+(l.id||'')+' | '+(l.model||'-')+' | '+(l.name||'-')+' | '+(l.ip||'-')+' | '+(l.protocol||'-')); });
      }
    }catch(e){}
    return out.join('\n');
  }catch(e){ return '[R&TC 컨텍스트 생성 오류] '+(e&&e.message||e); }
}
// Tests 컨텍스트: R&TC 페이지에서는 라이브 Req/TC/Step 전지식 컨텍스트, 그 외엔 목록 요약
async function _pgCtxTests(q){
  // DB 전환 후 tcList 는 meta 만 로드된 상태 → t.checks 가 없어 LLM 이 Step 인식 못 함.
  // 컨텍스트 빌드 전에 관련 TC 상세(checks) 를 loadTCFull 로 강제 로드.
  try{
    var tcs=(typeof tcList!=='undefined'?tcList:[])||[];
    if(typeof loadTCFull==='function' && tcs.length){
      // 1) 질문에서 명시적으로 지목된 TC 우선 (tcid/이름 매치)
      var _qs=String(q||'');
      var _priority=[];
      tcs.forEach(function(t){
        var _id=String(t.tcid||t.id||''); var _nm=String(t.name||'');
        if((_id && _qs.indexOf(_id)>=0) || (_nm && _nm.length>=2 && _qs.indexOf(_nm)>=0)) _priority.push(t);
      });
      // 2) 전체 TC 중 checks 아직 없는 것들 — 우선순위 먼저, 그 다음 나머지
      var _need=_priority.filter(function(t){return !Array.isArray(t.checks);})
        .concat(tcs.filter(function(t){return _priority.indexOf(t)<0 && !Array.isArray(t.checks);}));
      // 3) 예산: 최대 40개까지 (컨텍스트 예산 24KB 고려)
      var _budget=Math.min(_need.length, 40);
      var _batch=_need.slice(0, _budget);
      if(_batch.length){
        // 동시 6개씩 배치로 loadTCFull — 서버 부하 방지
        var _chunkSize=6;
        for(var _i=0;_i<_batch.length;_i+=_chunkSize){
          var _chunk=_batch.slice(_i,_i+_chunkSize);
          await Promise.all(_chunk.map(function(t){ return loadTCFull(t.tcid||t.id, false, true).catch(function(){}); }));
        }
      }
    }
    return buildRtcContext(q);
  } catch(e){
    var L=[]; var reqs=(typeof reqList!=='undefined'?reqList:[])||[]; var tcs2=(typeof tcList!=='undefined'?tcList:[])||[];
    L.push('[Tests 개요] REQ '+reqs.length+'개 · TC '+tcs2.length+'개');
    return L.join('\n');
  }
}
// 실시간 실행 상태: 서버 저장 상태(GET /api/cycle-run-progress) → 폴백: 내 실행/WS 수신 원격 실행
async function _pgCycleLive(){
  var st=null;
  try{ var r=await fetch('/api/cycle-run-progress'); if(r.ok){ var d=await r.json(); if(d&&d.ok) st=d.state||null; } }catch(e){}
  try{ if(!st&&typeof _cbRunActive!=='undefined'&&_cbRunActive){ st={user:(typeof currentUser!=='undefined'&&currentUser&&(currentUser.name||currentUser.username))||'(나)', ids:(typeof _cbRunCycleIds!=='undefined'?_cbRunCycleIds:[]), evt:'tc'}; } }catch(e){}
  try{ if(!st&&typeof _cbRemote!=='undefined'&&_cbRemote&&(_cbRemote.ids||[]).length&&(Date.now()-(_cbRemote.ts||0))<30*60*1000){ st={user:_cbRemote.user, ids:_cbRemote.ids, evt:'tc'}; } }catch(e){}
  if(st&&st.evt&&st.evt!=='done'){
    var vers=[];
    try{ (st.ids||[]).forEach(function(id){ var c=((typeof cycleList!=='undefined'?cycleList:[])||[]).find(function(x){return x.id===id;}); if(c) vers.push((c.model||'')+' '+(c.version||'')); }); }catch(e){}
    return '[실시간 실행 상태] 지금 '+(st.user?('사용자 "'+st.user+'" 가 '):'')+'Test Cycle 자동 실행을 진행 중입니다.'+(vers.length?(' 대상: '+vers.join(', ')+'.'):'')+(st.total?(' 진행률 '+(st.done||0)+'/'+st.total+(st.name?(' · 현재 TC: '+st.name):'')):'');
  }
  return '[실시간 실행 상태] 현재 진행 중인 자동 실행(시험)은 없습니다.';
}
// ── Cycle > Test Execution 컨텍스트 빌더 ──
// 매 전송마다 라이브 cycleList(item/step 실행결과 in-place 반영)를 새로 읽어 직렬화.
// 하드코딩·고정캐시 없음. 결과 필드: step.result(판정)·output(실제응답/로그)·criteria(기대값)·type(비교).
// 로그(output) 최대 64KB → Fail·선택 step은 넉넉히, Pass step은 짧게 절단(토큰 초과 방지).
var _CYC_BUDGET=28000;   // 컨텍스트 문자 예산 상한
function _cycItemVerdict(it){ try{ if(typeof _cbItemStatusKey==='function') return String(_cbItemStatusKey(it)||'').toUpperCase(); }catch(e){} try{ if(typeof cycleItemStatus==='function') return String(cycleItemStatus(it.steps||[])||'').toUpperCase(); }catch(e){} return '?'; }
function _cycStepVerdict(s){ return String(s&&s.result||'').trim()||'미실행'; }
// 로그(output) 절단: Fail/강조 step은 tailKeep자, Pass는 headKeep자
function _cycTrimLog(out,emphasized){
  var s=String(out==null?'':out).replace(/\r/g,''); if(!s.trim()) return '';
  var head=emphasized?900:140;
  if(s.length<=head) return s.replace(/\n+/g,' ⏎ ');
  if(emphasized){ // 실패 지점 중심: 뒤쪽(에러가 보통 끝) 우선 + 앞부분
    var tail=s.slice(-700); var pre=s.slice(0,300);
    return (pre+' … [중략] … '+tail).replace(/\n+/g,' ⏎ ');
  }
  return (s.slice(0,head)+' …').replace(/\n+/g,' ⏎ ');
}
// step 한 줄 직렬화. emphasized=true면 output/criteria 상세.
function _cycStepLine(s,idx,emphasized){
  var k=s.type||s.kind||'cli'; var ind=(parseInt(s.indent)||0); var pad='  '+Array(ind+1).join('  ');
  var v=_cycStepVerdict(s);
  var parts=['판정='+v];
  if(s.action&&s.action!=='CLI') parts.push('종류='+s.action);
  if(s.desc) parts.push('설명: '+String(s.desc).replace(/\s+/g,' ').slice(0,100));
  if(s.cli) parts.push('CLI: '+String(s.cli).replace(/\r?\n/g,' ⏎ ').slice(0,180));
  if(s.criteria) parts.push('기대(criteria): '+String(s.criteria).replace(/\s+/g,' ').slice(0,140));
  var cndParts=[]; if(Array.isArray(s.conds)&&s.conds.length){ cndParts=s.conds.map(function(x){return ((x.l||'')+' '+(x.op||'==')+' '+(x.r||'')).trim();}).filter(Boolean); }
  var cnd=cndParts.length?cndParts.join(s.condJoin==='or'?' || ':' && '):String(s.condition||'').trim();
  if(cnd) parts.push('조건: '+cnd.slice(0,120));
  if(s.loopMode) parts.push('LOOP '+s.loopMode+(s.loopVar?(' $'+s.loopVar):''));
  var qs=Array.isArray(s.queries)?s.queries:(s.query?[{q:s.query,var:s.queryVar}]:[]); if(qs.length) parts.push('추출: '+qs.map(function(q){return q.var||'?';}).join(','));
  var log=_cycTrimLog(s.output, emphasized||v==='Fail');
  if(log) parts.push('실제응답(output): '+log);
  return pad+'- Step '+(idx+1)+' ['+k+']'+(s.model?(' @'+s.model):'')+' '+parts.join(' | ');
}
// TC(item) 상세 블록. detailSteps=false면 Step 요약만.
function _cycItemDetail(it,detailSteps){
  var v=_cycItemVerdict(it);
  var head='- TC '+(it.tcid||'')+' "'+(it.name||'')+'" · 판정='+v+(it.devName?(' · 장비 '+it.devName):'')+(it.req_id?(' · REQ '+it.req_id):'')+(it.executed_at?(' · 실행 '+it.executed_at):' · 미실행')+(it.severity?(' · 심각도 '+it.severity):'');
  var steps=(it.steps||[]);
  if(!detailSteps){
    var kc={}; steps.forEach(function(s){var r=_cycStepVerdict(s);kc[r]=(kc[r]||0)+1;});
    return head+' | Step '+steps.length+'개 ['+Object.keys(kc).map(function(k){return k+':'+kc[k];}).join(', ')+']';
  }
  var lines=steps.map(function(s,i){ var emp=(v==='FAIL')||(_cycStepVerdict(s)==='Fail'); return _cycStepLine(s,i,emp); });
  return head+'\n'+lines.join('\n');
}
// 대상 cycle 선택: 선택된/실행중 우선, 없으면 최근
function _cycTargetCycles(){
  var all=((typeof cycleList!=='undefined'?cycleList:[])||[]);
  var picked=[];
  try{ var ids=(typeof _cbRunCycleIds!=='undefined'&&_cbRunCycleIds)||[]; ids.forEach(function(id){ var c=all.find(function(x){return x.id===id;}); if(c&&picked.indexOf(c)<0)picked.push(c); }); }catch(e){}
  try{ var selId=(typeof cycleSelCycleId!=='undefined'&&cycleSelCycleId)||''; if(selId){ var c2=all.find(function(x){return x.id===selId;}); if(c2&&picked.indexOf(c2)<0)picked.push(c2); } }catch(e){}
  try{ if(typeof cbCurrentCycle==='function'){ var cc=cbCurrentCycle(); if(cc&&picked.indexOf(cc)<0)picked.push(cc); } }catch(e){}
  return {focus:picked, all:all};
}
function _cycIsBroad(q){ return /전체|모든|전수|다\s*알려|목록|리스트|요약|현황|중복|누락|재실행|추천|개선|비교|찾아|정리|몇\s*개/.test(String(q||'')); }
// 질문 매칭 TC (tcid/name/cli/criteria/output/장비)
function _cycMatchItems(q,items){
  var s=String(q||'').toLowerCase(); if(!s) return [];
  var toks=s.split(/[\s,]+/).filter(function(x){return x.length>=2;});
  return items.map(function(it){
    var hay=((it.tcid||'')+' '+(it.name||'')+' '+(it.devName||'')+' '+(it.req_id||'')).toLowerCase();
    (it.steps||[]).forEach(function(s2){ hay+=' '+String(s2.cli||'').toLowerCase()+' '+String(s2.desc||'').toLowerCase()+' '+String(s2.criteria||'').toLowerCase()+' '+String(s2.model||'').toLowerCase(); });
    var sc=0; toks.forEach(function(t){ if(hay.indexOf(t)>=0)sc++; });
    if(it.tcid&&s.indexOf(String(it.tcid).toLowerCase())>=0) sc+=5;
    return {it:it,sc:sc};
  }).filter(function(x){return x.sc>0;}).sort(function(a,b){return b.sc-a.sc;}).map(function(x){return x.it;});
}
// ── 메인: Cycle Test Execution 라이브 컨텍스트 ──
async function buildCycleContext(q){
  try{
    // 원격(다른 사용자) 실행 감지 시 최신화
    try{ if((_cycIsBroad(q)||/진행|실행\s*중|방금|실시간/.test(String(q||'')))&&typeof loadCycleData==='function'){ await loadCycleData(); } }catch(e){}
    var live=''; try{ live=await _pgCycleLive(); }catch(e){}
    var tgt=_cycTargetCycles();
    var focusCys=tgt.focus.length?tgt.focus:tgt.all.slice(-1);   // 선택/실행중 없으면 가장 최근 1개
    var out=['[Cycle Test Execution Context] (실시간 실행 상태)'];
    out.push(live);
    // 전체 Summary(항상)
    var allItems=[]; tgt.all.forEach(function(c){ (c.items||[]).forEach(function(it){ allItems.push(it); }); });
    try{ var st=(typeof cycleCalcStats==='function')?cycleCalcStats(allItems):null; if(st) out.push('[전체 집계] 사이클 '+tgt.all.length+'개 · TC '+st.total+' (합격 '+st.pass+' / 불합격 '+st.fail+' / 예정 '+st.pending+' / 제외 '+st.exclude+') · 진행률 '+st.progress+'%'); }catch(e){}
    // 포커스 사이클 개요
    out.push('');
    out.push('## 포커스 사이클 (선택/실행중 우선)');
    focusCys.forEach(function(c){
      var its=(c.items||[]);
      var sc=(typeof cycleCalcStats==='function')?cycleCalcStats(its):null;
      out.push('- '+(c.model||'-')+' / '+(c.version_group||'-')+' / '+(c.version||'-')+' [id '+c.id+'] · TC '+its.length+(sc?(' (합격 '+sc.pass+' / 불합격 '+sc.fail+' / 예정 '+sc.pending+')'):'')+(c.start_date?(' · '+c.start_date+'~'+(c.end_date||'')):''));
    });
    // 실패 TC 목록(항상 — 실패 분석 핵심)
    var failItems=[]; tgt.all.forEach(function(c){ (c.items||[]).forEach(function(it){ if(_cycItemVerdict(it)==='FAIL') failItems.push(it); }); });
    if(failItems.length){ out.push(''); out.push('## 불합격 TC ('+failItems.length+'개)'); failItems.slice(0,40).forEach(function(it){ var fs=(it.steps||[]).filter(function(s){return _cycStepVerdict(s)==='Fail';}); out.push('- '+(it.tcid||'')+' "'+(it.name||'')+'"'+(it.devName?(' @'+it.devName):'')+' · 실패 Step '+fs.length+'개'+(fs.length?(' (Step '+fs.map(function(s){return (it.steps.indexOf(s)+1);}).slice(0,8).join(',')+')'):'')); }); }
    // 상세 대상 선정: 질문 매칭 → 포커스 사이클 전체 → 실패 우선
    var pool=[]; focusCys.forEach(function(c){ (c.items||[]).forEach(function(it){ pool.push(it); }); });
    var matched=_cycMatchItems(q,allItems);
    var broad=_cycIsBroad(q);
    var detailItems;
    if(matched.length&&!broad) detailItems=matched;
    else { // 실패 우선 + 포커스 나머지
      var failFirst=pool.filter(function(it){return _cycItemVerdict(it)==='FAIL';});
      var rest=pool.filter(function(it){return failFirst.indexOf(it)<0;});
      detailItems=matched.concat(failFirst.filter(function(it){return matched.indexOf(it)<0;})).concat(rest.filter(function(it){return matched.indexOf(it)<0&&failFirst.indexOf(it)<0;}));
    }
    out.push('');
    out.push('## TC & Step 상세 (실행 결과 포함)');
    var body=[]; var used=out.join('\n').length; var truncated=0;
    for(var i=0;i<detailItems.length;i++){
      var block=_cycItemDetail(detailItems[i],true);
      if(used+block.length>_CYC_BUDGET){ truncated=detailItems.length-i; break; }
      body.push(block); used+=block.length+2;
    }
    out.push(body.join('\n\n'));
    if(truncated>0) out.push('\n[알림] 토큰 예산으로 TC '+truncated+'개 Step 상세 생략 — 위 집계·불합격 목록엔 포함. 특정 TC 지목 시 상세 제공.');
    return out.join('\n');
  }catch(e){ return '[Cycle 컨텍스트 생성 오류] '+(e&&e.message||e); }
}
// Cycle 컨텍스트: Test Execution 라이브 전지식(실패 분석·Step 결과 포함)
async function _pgCtxCycle(q){
  try{ return await buildCycleContext(q); }
  catch(e){
    var L=[]; try{ L.push(await _pgCycleLive()); }catch(_e){}
    return L.join('\n');
  }
}
// Jira 컨텍스트: Issue Coverage 저장 데이터 (프로젝트@@버전 → 이슈들)
function _pgCtxJira(){
  var L=[];
  try{
    var st=(typeof _rlsStore!=='undefined'&&_rlsStore)||{};
    var keys=Object.keys(st);
    if(!keys.length){ L.push('[Jira Issue Coverage] 로드된 이슈 데이터 없음 — Jira Issue Coverage 화면을 먼저 열면 데이터가 채워집니다.'); }
    else{
      L.push('[Jira Issue Coverage — 프로젝트/버전 '+keys.length+'개]');
      keys.slice(0,40).forEach(function(k){
        var issues=st[k]||{}; var iks=Object.keys(issues); var open=0,tcn=0;
        iks.forEach(function(ik){ var o=issues[ik]||{}; if(!/done|closed|resolved|완료/i.test(String(o.statusCat||o.status||''))) open++; tcn+=((o.tcs||[]).length); });
        L.push('- '+k.replace('@@',' / ')+' : 이슈 '+iks.length+'건 (미해결 '+open+') · 연결 TC '+tcn+'개');
      });
      // 전체 이슈 기준 집계 — 아래 이슈 목록은 샘플이므로 개수 질문은 반드시 이 집계를 사용
      var _asg={}, _typ={}, _stt={}, _tot=0;
      keys.forEach(function(k){ var issues=st[k]||{}; Object.keys(issues).forEach(function(ik){ var o=issues[ik]||{}; _tot++;
        if(o.assignee) _asg[o.assignee]=(_asg[o.assignee]||0)+1;
        var t=o.type||'기타'; _typ[t]=(_typ[t]||0)+1;
        var s=o.statusCat==='done'?'완료':(o.statusCat==='indeterminate'?'진행중':'미착수'); _stt[s]=(_stt[s]||0)+1;
      }); });
      var _fmtMap=function(m){ return Object.keys(m).sort(function(a,b){return m[b]-m[a];}).map(function(x){return x+' '+m[x]+'건';}).join(', ')||'-'; };
      L.push('[전체 이슈 집계 — 총 '+_tot+'건 (모든 이슈 기준)]');
      L.push('- 담당자별: '+_fmtMap(_asg));
      L.push('- 유형별: '+_fmtMap(_typ));
      L.push('- 상태별: '+_fmtMap(_stt));
      L.push('[중요] 아래 "이슈 목록"은 일부 샘플(최대 40건)이다. 담당자별/유형별/상태별 개수 등 집계 질문에는 목록을 직접 세지 말고 반드시 위 [전체 이슈 집계] 숫자를 그대로 사용하라.');
      var cnt=0; L.push('[이슈 목록(최대 40 — 샘플)]');
      keys.some(function(k){ var issues=st[k]||{}; return Object.keys(issues).some(function(ik){ if(cnt>=40) return true; var o=issues[ik]||{}; if(!(o.summary||o.type||(o.tcs||[]).length)) return false; L.push('- '+ik+' ['+(o.type||'-')+' / '+(o.status||'-')+'] '+(o.summary||'')+' · 보고자 '+(o.reporter||'-')+' · 담당 '+(o.assignee||'-')+' · 연결 TC '+((o.tcs||[]).length)+'개'); cnt++; return false; }); });
    }
  }catch(e){}
  return L.join('\n').slice(0,7000);
}
let expSel={type:null,id:null};
let expExpanded=new Set();   // 'f-<folderId>', 'r-<reqId>'

let expSort='reqid', expSortDir=1;
function expSetSort(v){ expSort=v; renderExplorer(); }
function expToggleSortDir(){ expSortDir*=-1; const b=document.getElementById('exp-sort-dir'); if(b) b.textContent=expSortDir>0?'↑':'↓'; renderExplorer(); }
function expSortReqs(arr){
  return arr.slice().sort((a,b)=>{
    let va,vb;
    if(expSort==='title'){ va=a.title||''; vb=b.title||''; }
    else if(expSort==='status'){ va=a.status||''; vb=b.status||''; }
    else if(expSort==='updated'){ va=a.updated_at||a.created_at||''; vb=b.updated_at||b.created_at||''; }
    else { va=a.reqid||''; vb=b.reqid||''; }
    return (''+va).localeCompare(''+vb)*expSortDir;
  });
}
// 탐색기 드래그 이동
let _expDrag=null;  // {type:'req'|'folder'|'tc'|'tc-multi', id|ids}
let _expBatch=false;  // 다중 이동 중엔 항목별 렌더/토스트를 묶고 마지막에 한 번만 처리
function _expRender(){ if(!_expBatch) renderExplorer(); }
function _expToast(m){ if(!_expBatch) showToast(m); }
// 드래그 중 커서를 따라오는 칩(잡고 옮기는 동작이 보이도록). dataTransfer.setDragImage용 임시 요소를 만들고 캡처 후 제거.
function _expSetDragImage(e,label,color,icon){
  try{
    if(!e||!e.dataTransfer||!e.dataTransfer.setDragImage) return;
    const g=document.createElement('div');
    g.innerHTML=(icon?('<span style="font-size:13px;line-height:1;">'+icon+'</span>'):'')+'<span>'+String(label==null?'':label).replace(/[<>&]/g,'')+'</span>';
    g.style.cssText='position:absolute;left:-9999px;top:-9999px;z-index:99999;display:inline-flex;align-items:center;gap:6px;max-width:280px;overflow:hidden;text-overflow:ellipsis;padding:6px 12px;border-radius:9px;background:'+(color||'#2d6fd4')+';color:#fff;font-size:12px;font-weight:700;font-family:inherit;white-space:nowrap;box-shadow:0 8px 22px rgba(0,0,0,0.28);pointer-events:none;';
    document.body.appendChild(g);
    e.dataTransfer.setDragImage(g,16,18);
    setTimeout(function(){ try{ g.remove(); }catch(_){} },0);
  }catch(_){}
}
function expDragStart(e,reqId){ _expDrag={type:'req',id:reqId}; e.dataTransfer.effectAllowed='move'; try{e.dataTransfer.setData('text/plain',reqId);}catch(_){} var _r=reqList.find(x=>x.id===reqId); _expSetDragImage(e,'REQ '+((_r&&(_r.reqid||_r.title))||''),'#2d6fd4','📋'); }
function expTcDragStart(e,tcid){ e.stopPropagation(); if(typeof expSelTc!=='undefined'&&expSelTc&&expSelTc.size>1&&expSelTc.has(tcid)){ _expDrag={type:'tc-multi',ids:[...expSelTc]}; } else { _expDrag={type:'tc',id:tcid}; } e.dataTransfer.effectAllowed='move'; try{e.dataTransfer.setData('text/plain',tcid);}catch(_){} if(_expDrag.type==='tc-multi'){ _expSetDragImage(e,'TC '+_expDrag.ids.length+'개 이동','#00a872','📄'); } else { var _t=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); _expSetDragImage(e,'TC '+((_t&&(_t.name||_t.tcid))||tcid),'#00a872','📄'); } }
function expFolderDragStart(e,fid){ e.stopPropagation(); _expDrag={type:'folder',id:fid}; e.dataTransfer.effectAllowed='move'; try{e.dataTransfer.setData('text/plain',fid);}catch(_){} var _f=reqFolders.find(x=>x.id===fid); _expSetDragImage(e,((_f&&_f.name)||'폴더'),'#e8a83c','📁'); }
function expDropOnFolder(e,fid){ e.preventDefault(); e.stopPropagation(); e.currentTarget.style.background=''; const d=_expDrag; _expDrag=null; if(!d) return; if(d.type==='tc-multi') expMoveTCsToFolder(d.ids,fid); else if(d.type==='tc') expMoveTCToFolder(d.id,fid); else if(d.type==='req') expMoveREQToFolder(d.id,fid); else expMoveFolder(d.id,fid); }
function expDropOnRoot(e){ e.preventDefault(); const d=_expDrag; _expDrag=null; if(d&&d.type==='folder'){ const f=reqFolders.find(x=>x.id===d.id); if(f&&f.parent!==null){ f.parent=null; expSaveFolders(); renderExplorer(); showToast('최상위로 이동했습니다'); } } }
async function expMoveFolder(fid,targetFid){
  if(fid===targetFid) return;
  let p=targetFid; while(p){ if(p===fid){ showToast('자기 하위 폴더로는 이동할 수 없습니다'); return; } const pf=reqFolders.find(f=>f.id===p); p=pf?pf.parent:null; }
  const f=reqFolders.find(x=>x.id===fid); if(!f||f.parent===targetFid) return;
  f.parent=targetFid; f.order=reqFolders.filter(x=>x.parent===targetFid).length;
  expExpanded.add('f-'+targetFid);
  expSaveFolders();
  // 이동한 폴더(및 하위) 안의 모든 REQ/TC ID를 새 경로 기준으로 재생성
  const fids=(typeof expFolderDescendantIds==='function')?expFolderDescendantIds(fid):[fid];
  let cnt=0;
  for(const r of reqList.filter(x=>fids.indexOf(x.folder)>=0)){
    try{ const ch=await expReassignIdsByFolder(r,r.folder); if(ch){ await saveOneREQ(r); cnt++; } }catch(e){}
  }
  renderExplorer();
  showToast('폴더 이동'+(cnt?(' · REQ '+cnt+'개 ID 폴더기준 자동변경'):''));
}
function expFolderDropBetween(e, beforeFid){
  e.preventDefault(); e.stopPropagation();
  const d=_expDrag; _expDrag=null;
  if(!d||d.type!=='folder') return;
  const before=reqFolders.find(f=>f.id===beforeFid); if(!before) return;
  const dragged=reqFolders.find(f=>f.id===d.id); if(!dragged||dragged.id===beforeFid) return;
  // 순환 방지: before(또는 그 상위)가 dragged면 금지
  let p=before.parent; while(p){ if(p===dragged.id){ showToast('자기 하위로는 이동할 수 없습니다'); return; } const pf=reqFolders.find(f=>f.id===p); p=pf?pf.parent:null; }
  const newParent=before.parent;
  dragged.parent=newParent;
  const siblings=reqFolders.filter(f=>f.parent===newParent&&f.id!==dragged.id).sort((a,b)=>(a.order||0)-(b.order||0));
  const result=[];
  siblings.forEach(s=>{ if(s.id===beforeFid) result.push(dragged); result.push(s); });
  if(!result.includes(dragged)) result.push(dragged);
  result.forEach((f,i)=>f.order=i);
  expSaveFolders(); renderExplorer();
  showToast('폴더 순서를 변경했습니다');
}
function expFolderPath(fid){ const parts=[]; let cur=reqFolders.find(f=>f.id===fid); let g=0; while(cur&&g<60){ parts.unshift((cur.name||'').trim()); cur=cur.parent?reqFolders.find(f=>f.id===cur.parent):null; g++; } return parts.filter(Boolean).join('-'); }
function _reEsc(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
function _pad3(n){ const s=''+n; return s.length>=3?s:('000'+s).slice(-3); }
function _allTcIds(){ var s=new Set(); try{ ((typeof tcList!=='undefined'&&tcList)||[]).forEach(function(t){ if(t&&t.tcid) s.add(String(t.tcid)); }); }catch(e){} try{ ((typeof reqList!=='undefined'&&reqList)||[]).forEach(function(r){ ((r&&r.tc)||[]).forEach(function(t){ if(t&&t.tcid) s.add(String(t.tcid)); }); }); }catch(e){} return s; }   // tcList + 모든 REQ의 tc 목록 = 전역 TC ID 집합(중복 방지 기준)
function _uniqueTcId(base){ var ids=_allTcIds(); base=String(base||'TC').trim()||'TC'; if(!ids.has(base)) return base; var m=base.match(/^(.*?)(\d+)\s*$/); var pre=m?m[1]:(base+'-'); var n=m?parseInt(m[2],10):0; var w=m?m[2].length:3; var cand; do{ n++; cand=pre+String(n).padStart(w,'0'); }while(ids.has(cand)); return cand; }   // 중복이면 끝 숫자 +1 해서 전역 유일 ID 반환
function _nextSeqFor(prefix,sep,kind){ const re=new RegExp('^'+_reEsc(prefix)+sep+'(\\d+)$'); let n=0; const src=(kind==='tc')?Array.from(_allTcIds()):((reqList||[]).map(function(x){return x.reqid;})); src.forEach(function(id){ const m=String(id||'').match(re); if(m){ const v=parseInt(m[1],10); if(v>n)n=v; } }); return n+1; }   // tc는 전역 ID 집합 기준으로 최대 시퀀스 산출
// 이동 이력 기억: 항목이 특정 폴더경로(prefix) 아래에서 가졌던 reqid/tcid를 _idMemo[prefix]에 저장 → 그 경로로 돌아오면 같은 번호 복원
function _memoSet(obj,key,val){ if(!obj||!key||!val) return; if(!obj._idMemo||typeof obj._idMemo!=='object') obj._idMemo={}; obj._idMemo[key]=val; }
function _memoGet(obj,key){ const m=obj&&obj._idMemo; return (m&&typeof m==='object')?m[key]:undefined; }
// 기억한 id가 지금 대상 prefix 패턴과 맞고 아직 아무도 안 쓰면(비어 있으면) 복원용으로 채택, 아니면 null
function _memoUsable(remembered,prefix,kind,selfObj,listAll){
  if(!remembered||!prefix) return null;
  const re=new RegExp('^'+_reEsc(prefix)+(kind==='tc'?'-TC-':'-')+'\\d+$');
  if(!re.test(remembered)) return null;
  const taken=listAll.some(x=>x!==selfObj && String((kind==='tc'?x.tcid:x.reqid)||'')===remembered);
  return taken?null:remembered;
}
async function expReassignIdsByFolder(r,targetFid){
  const prefix=expFolderPath(targetFid); if(!prefix) return false;
  const myTcs=tcList.filter(t=>t.req_id===r.id); let changed=false;
  const reqRe=new RegExp('^'+_reEsc(prefix)+'-\\d+$');
  if(!reqRe.test(r.reqid||'')){
    const oldReqid=r.reqid;
    if(oldReqid){ _memoSet(r,oldReqid.replace(/-\d+$/,''),oldReqid); }   // 떠나는 경로의 reqid 기억
    let newReqid=_memoUsable(_memoGet(r,prefix),prefix,'req',r,reqList);   // 돌아온 경우 복원
    if(!newReqid){ let s=_nextSeqFor(prefix,'-','req'); do{ newReqid=prefix+'-'+_pad3(s); s++; }while(reqList.some(x=>x!==r&&x.reqid===newReqid)); }
    r.reqid=newReqid;
    if(oldReqid&&oldReqid!==newReqid){ try{ await deleteOneREQ(oldReqid); }catch(e){} }
    changed=true;
  }
  const tcRe=new RegExp('^'+_reEsc(prefix)+'-TC-\\d+$');
  let ts=_nextSeqFor(prefix,'-TC-','tc');
  for(const tc of myTcs){
    if(tcRe.test(tc.tcid||'')) continue;
    const oldTcid=tc.tcid;
    if(oldTcid){ _memoSet(tc,oldTcid.replace(/-TC-\d+$/,''),oldTcid); }   // 떠나는 경로의 tcid 기억
    let newTcid=_memoUsable(_memoGet(tc,prefix),prefix,'tc',tc,tcList);    // 돌아온 경우 복원
    if(!newTcid){ do{ newTcid=prefix+'-TC-'+_pad3(ts); ts++; }while(tcList.some(x=>x!==tc&&x.tcid===newTcid)); }
    // ★ CRITICAL: meta 만 로드된 tc(checks 없음) 를 그대로 saveTCFile 하면 서버에 빈 checks 로 저장 → 스텝 전멸.
    // 반드시 loadTCFull 로 checks 를 먼저 로드한 뒤 tcid 를 재작성.
    if(!Array.isArray(tc.checks)){
      try{ await loadTCFull(oldTcid, true, true); }catch(_e){}
    }
    tc.tcid=newTcid; tc.id=newTcid;
    try{ await saveTCFile(tc); }catch(e){}
    // Cycle.items 의 옛 tcid → 새 tcid 갱신 후 저장 → 그 다음 옛 TC 삭제 (서버 _clean_cycle_refs 는 이미 옛 참조 없어 no-op)
    if(oldTcid&&oldTcid!==newTcid){
      try{
        if(typeof cycleList!=='undefined' && Array.isArray(cycleList)){
          for(const cy of cycleList){
            if(!cy || !Array.isArray(cy.items)) continue;
            let touched=false;
            cy.items.forEach(function(it){ if(it && it.tcid===oldTcid){ it.tcid=newTcid; touched=true; } });
            if(touched && typeof saveCycle==='function'){ try{ await saveCycle(cy); }catch(_e){} }
          }
        }
      }catch(_e){}
      try{ await deleteTCFile(oldTcid); }catch(e){}
    }
    changed=true;
  }
  return changed;
}
// REQ 아래 모든 TC ID를 폴더경로(prefix)-TC-NNN 으로 재정렬 — 이동/임포트로 접두어가 안 맞는 stale TC 일괄 교정 + 중복 해소
async function expNormalizeReqTcIds(reqId, silent){
  const r=reqList.find(x=>(x.id===reqId)||(x.reqid===reqId)); if(!r){ if(!silent)_expToast('REQ를 찾을 수 없습니다'); return false; }
  const prefix=expFolderPath(r.folder);
  if(!prefix){ if(!silent)_expToast('이 REQ는 폴더 경로가 없어 기준 prefix를 만들 수 없습니다 (폴더로 이동 후 시도)'); return false; }
  const tcRe=new RegExp('^'+_reEsc(prefix)+'-TC-\\d+$');
  const mine=tcList.filter(t=>t.req_id===r.id);
  const bad=mine.filter(t=>!tcRe.test(t.tcid||''));
  if(!bad.length){ if(!silent)_expToast('이미 모든 TC ID가 경로기준입니다 ('+prefix+'-TC-…)'); return false; }
  let ts=_nextSeqFor(prefix,'-TC-','tc');
  for(const tc of bad){
    const oldTcid=tc.tcid;
    if(oldTcid){ _memoSet(tc,oldTcid.replace(/-TC-\d+$/,''),oldTcid); }
    let nt=_memoUsable(_memoGet(tc,prefix),prefix,'tc',tc,tcList);
    if(!nt){ do{ nt=prefix+'-TC-'+_pad3(ts); ts++; }while(tcList.some(x=>x!==tc&&x.tcid===nt)); }
    tc.tcid=nt; tc.id=nt;
    if(Array.isArray(r.tc)){ const ref=r.tc.find(x=>x.tcid===oldTcid); if(ref){ ref.tcid=nt; ref.name=tc.name; } else if(!r.tc.some(x=>x.tcid===nt)) r.tc.push({tcid:nt,name:tc.name,status:tc.status}); }
    try{ await saveTCFile(tc); }catch(e){}
    if(oldTcid&&oldTcid!==nt){ try{ await deleteTCFile(oldTcid); }catch(e){} }
  }
  try{ await saveOneREQ(r); }catch(e){}
  renderExplorer();
  _expToast('TC '+bad.length+'개 ID를 경로기준('+prefix+'-TC-…)으로 재정렬했습니다');
  return true;
}
async function expMoveREQToFolder(reqId,targetFid){
  const r=reqList.find(x=>x.id===reqId);
  if(!r||r.folder===targetFid) return false;
  r.folder=targetFid; r.updated_at=new Date().toISOString().slice(0,10);
  expExpanded.add('f-'+targetFid);
  const renamed=await expReassignIdsByFolder(r,targetFid);
  await saveOneREQ(r);
  _expRender();
  const fname=(reqFolders.find(f=>f.id===targetFid)||{}).name||'폴더';
  _expToast('"'+(r.reqid||'')+'"를 '+fname+'(으)로 이동'+(renamed?' · ID 폴더기준 자동변경됨':''));
  return true;
}
// TC를 다른 REQ 위로 드롭 → 그 REQ로 재배치(복제 없음). 핵심 reparent 프리미티브.
async function expMoveTCToReq(tcid,targetReqId){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid));
  if(!tc){ _expToast('TC를 찾을 수 없습니다'); return false; }
  const target=reqList.find(x=>x.id===targetReqId);
  if(!target){ _expToast('대상 요구사항을 찾을 수 없습니다'); return false; }
  if(tc.req_id===target.id){ _expToast('이미 해당 REQ에 있습니다'); return false; }
  const oldReq=reqList.find(x=>x.id===tc.req_id);
  const oldTcid=tc.tcid;
  // 1) 옛 REQ의 tc 참조배열에서 제거(재생성 전 tcid 기준)
  if(oldReq&&Array.isArray(oldReq.tc)) oldReq.tc=oldReq.tc.filter(ref=>ref.tcid!==oldTcid && ref.tcid!==tcid);
  // 떠나는 경로(현재 tcid의 prefix)에서 쓰던 번호 기억 → 나중에 그 경로로 돌아오면 복원
  if(oldTcid){ _memoSet(tc,oldTcid.replace(/-TC-\d+$/,''),oldTcid); }
  // 2) 대상 REQ로 재부모 + tcid를 대상 REQ의 폴더 경로 기준으로 재생성(이전에 쓰던 번호가 비어 있으면 그대로 복원)
  tc.req_id=target.id;
  const prefix=expFolderPath(target.folder);
  if(prefix){
    const tcRe=new RegExp('^'+_reEsc(prefix)+'-TC-\\d+$');
    if(!tcRe.test(tc.tcid||'')){
      let nt=_memoUsable(_memoGet(tc,prefix),prefix,'tc',tc,tcList);
      if(!nt){ let ts=_nextSeqFor(prefix,'-TC-','tc'); do{ nt=prefix+'-TC-'+_pad3(ts); ts++; }while(tcList.some(x=>x!==tc&&x.tcid===nt)); }
      tc.tcid=nt; tc.id=nt;
    }
  }
  // 3) 대상 REQ 참조배열에 추가(재생성된 tcid 기준)
  if(!Array.isArray(target.tc)) target.tc=[];
  if(!target.tc.some(ref=>ref.tcid===tc.tcid)) target.tc.push({tcid:tc.tcid,name:tc.name,status:tc.status});
  tc.updated_at=new Date().toISOString().slice(0,10);
  // 4) 영속화: 새 TC 저장 → (이름 바뀌면) 옛 파일 삭제 → 양쪽 REQ 저장
  try{ await saveTCFile(tc); }catch(e){}
  if(oldTcid && oldTcid!==tc.tcid){ try{ await deleteTCFile(oldTcid); }catch(e){} }
  try{ await saveOneREQ(target); }catch(e){}
  if(oldReq){ try{ await saveOneREQ(oldReq); }catch(e){} }
  expExpanded.add('r-'+target.id);
  if(target.folder) expExpanded.add('f-'+target.folder);
  _expRender();
  _expToast('"'+(tc.tcid||'')+'" TC를 '+(target.reqid||target.title||'REQ')+'(으)로 이동');
  return true;
}
// TC를 폴더로 드롭 → 복제 없이 그 폴더의 '기존 REQ'로 재배치(형제 TC·부모 REQ는 그대로)
async function expMoveTCToFolder(tcid,targetFid){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid));
  if(!tc){ _expToast('TC를 찾을 수 없습니다'); return false; }
  const oldReq=reqList.find(x=>x.id===tc.req_id);
  if(!oldReq){ _expToast('TC의 상위 요구사항을 찾을 수 없어 이동할 수 없습니다'); return false; }
  if(oldReq.folder===targetFid){ _expToast('이미 해당 폴더에 있습니다'); return false; }
  // 부모 REQ에 TC가 하나뿐이면 그 REQ를 통째로 폴더 이동(복제 아님 · 기존 REQ가 그대로 옮겨감)
  const siblings=tcList.filter(t=>t.req_id===oldReq.id);
  if(siblings.length<=1){ return await expMoveREQToFolder(oldReq.id,targetFid); }
  // 형제가 있으면: 대상 폴더의 '기존' REQ로 재배치(REQ 신규 생성/복제 안 함)
  const inFolder=reqList.filter(x=>x.folder===targetFid);
  if(!inFolder.length){
    _expToast('대상 폴더에 REQ가 없습니다 · TC는 REQ 위에 드롭하거나 REQ가 있는 폴더로 옮기세요');
    return false;
  }
  const fpath=expFolderPath(targetFid);
  const host=(fpath&&inFolder.find(x=>String(x.reqid||'').replace(/-\d+$/,'')===fpath))||inFolder[0];
  return await expMoveTCToReq(tc.tcid,host.id);
}
// REQ 행을 TC 드롭 타깃으로 동작시키는 보조 핸들러(단일/다중 TC 드래그에 반응, 그 외엔 무시)
function expReqDragOver(e,el){ if(_expDrag&&(_expDrag.type==='tc'||_expDrag.type==='tc-multi')){ e.preventDefault(); e.stopPropagation(); el.style.background='rgba(0,168,114,0.18)'; } }
function expDropOnReq(e,reqId){ if(!(_expDrag&&(_expDrag.type==='tc'||_expDrag.type==='tc-multi'))) return; e.preventDefault(); e.stopPropagation(); const d=_expDrag; _expDrag=null; if(d.type==='tc-multi') expMoveTCsToReq(d.ids,reqId); else expMoveTCToReq(d.id,reqId); }
// 체크박스로 다중 선택한 TC를 한 번에 이동(항목별 렌더/토스트는 배치로 묶고 마지막에 한 번만 + 선택 해제)
async function expMoveTCsToFolder(ids,targetFid){
  _expBatch=true; let n=0;
  for(const id of (ids||[])){ try{ if(await expMoveTCToFolder(id,targetFid)) n++; }catch(e){} }
  _expBatch=false;
  if(typeof expSelTc!=='undefined'&&expSelTc) expSelTc.clear();
  renderExplorer(); try{ expUpdateBulkBar(); }catch(e){}
  showToast(n?('TC '+n+'개를 이동했습니다'):'이동된 TC가 없습니다');
}
async function expMoveTCsToReq(ids,targetReqId){
  _expBatch=true; let n=0;
  for(const id of (ids||[])){ try{ if(await expMoveTCToReq(id,targetReqId)) n++; }catch(e){} }
  _expBatch=false;
  if(typeof expSelTc!=='undefined'&&expSelTc) expSelTc.clear();
  renderExplorer(); try{ expUpdateBulkBar(); }catch(e){}
  showToast(n?('TC '+n+'개를 이동했습니다'):'이동된 TC가 없습니다');
}
// 필터 (REQ/TC, 커스텀 필드 기반)
let expReqFilter={}, expTcFilter={}, expReqFilterOpen=false, expTcFilterOpen=false;
function expReqPassFilter(r){ for(const fid in expReqFilter){ const val=expReqFilter[fid]; if(!val) continue; const v=(r.custom_fields||{})[fid]||''; if(!(v===val||v.split(',').includes(val))) return false; } return true; }
function expTcPassFilter(t){ for(const fid in expTcFilter){ const val=expTcFilter[fid]; if(!val) continue; const v=(t.custom_fields||{})[fid]||''; if(!(v===val||v.split(',').includes(val))) return false; } return true; }
function expTcShown(t){ return expTcMatch(t)&&expTcPassFilter(t); }
function expToggleFilter(target){ if(target==='req') expReqFilterOpen=!expReqFilterOpen; else expTcFilterOpen=!expTcFilterOpen; renderExplorer(); }
function expSetFilter(target,fid,val){ const s=target==='req'?expReqFilter:expTcFilter; if(val) s[fid]=val; else delete s[fid]; renderExplorer(); }
function expClearFilter(target){ if(target==='req') expReqFilter={}; else expTcFilter={}; renderExplorer(); }
function expFilterPanelHtml(target){
  const fields=((customFields&&customFields[target])||[]).filter(f=>f.active!==false&&(f.type==='Select'||f.type==='MultiSelect'));
  const store=target==='req'?expReqFilter:expTcFilter;
  if(!fields.length) return '<div style="font-size:11px;color:var(--text3);">필터 가능한 선택형 필드가 없습니다 (시스템→커스텀 필드)</div>';
  return fields.map(f=>{
    const cur=store[f.id]||'';
    const opts='<option value="">전체</option>'+(f.options||[]).map(o=>{const ov=cfOptValue(o);return '<option value="'+ov+'" '+(cur===ov?'selected':'')+'>'+ov+'</option>';}).join('');
    return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;"><span style="font-size:10px;color:var(--text3);width:58px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+f.label+'</span><select onchange="expSetFilter(\''+target+'\',\''+f.id+'\',this.value)" style="flex:1;font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:5px;background:#fff;outline:none;">'+opts+'</select></div>';
  }).join('')+(Object.keys(store).length?'<div style="text-align:right;margin-top:2px;"><button onclick="expClearFilter(\''+target+'\')" style="font-size:10px;color:var(--blue);background:none;border:none;cursor:pointer;">필터 초기화</button></div>':'');
}
// TC 정렬
let expTcSort='tcid', expTcSortDir=1;
function expSetTcSort(v){ expTcSort=v; renderExplorer(); }
function expToggleTcSortDir(){ expTcSortDir*=-1; const b=document.getElementById('exp-tc-sort-dir'); if(b) b.textContent=expTcSortDir>0?'↑':'↓'; renderExplorer(); }
function expSortTcs(arr){
  return arr.slice().sort((a,b)=>{
    let va,vb;
    if(expTcSort==='name'){ va=a.name||''; vb=b.name||''; }
    else if(expTcSort==='status'){ va=a.status||''; vb=b.status||''; }
    else { va=a.tcid||''; vb=b.tcid||''; }
    return (''+va).localeCompare(''+vb)*expTcSortDir;
  });
}
// 폴더/REQ/TC 생성·삭제
// 예쁜 입력 모달 (네이티브 prompt 대체) — 입력값 문자열 반환, 취소 시 null
function uiPrompt(opts){
  opts=opts||{};
  const title=opts.title||'입력', label=opts.label||'', value=opts.value||'', placeholder=opts.placeholder||'';
  const okText=opts.okText||'확인', cancelText=opts.cancelText||'취소', icon=opts.icon||'ti-pencil-plus';
  const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  return new Promise(resolve=>{
    const overlay=document.createElement('div');
    overlay.style.cssText='position:fixed;inset:0;background:rgba(15,20,35,0.45);z-index:11000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(1px);';
    overlay.innerHTML=
      '<div style="background:#fff;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,0.3);width:430px;max-width:92vw;overflow:hidden;">'
        +'<div style="padding:18px 22px 0;">'
          +'<div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:14px;display:flex;align-items:center;gap:8px;"><i class="ti '+icon+'" style="color:var(--blue);font-size:20px;"></i>'+esc(title)+'</div>'
          +(label?'<div style="font-size:12px;color:var(--text3);font-weight:600;margin-bottom:6px;">'+esc(label)+'</div>':'')
          +(opts.multiline
             ?('<textarea id="ui-prompt-input" rows="'+(opts.rows||8)+'" placeholder="'+esc(placeholder)+'" style="width:100%;font-size:13px;padding:11px 13px;border:1.5px solid var(--border);border-radius:9px;outline:none;box-sizing:border-box;color:var(--text);background:var(--bg2);resize:vertical;font-family:inherit;line-height:1.6;">'+esc(value)+'</textarea>'
                +'<div style="font-size:11px;color:var(--text3);margin-top:5px;">한 줄에 하나씩 입력 · Ctrl+Enter로 생성</div>')
             :('<input id="ui-prompt-input" type="text" value="'+esc(value)+'" placeholder="'+esc(placeholder)+'" style="width:100%;font-size:14px;padding:11px 13px;border:1.5px solid var(--border);border-radius:9px;outline:none;box-sizing:border-box;color:var(--text);" />'))
        +'</div>'
        +'<div style="display:flex;justify-content:flex-end;gap:8px;padding:16px 22px 18px;">'
          +'<button id="ui-prompt-cancel" style="font-size:13px;padding:8px 18px;border-radius:8px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;font-weight:600;">'+esc(cancelText)+'</button>'
          +'<button id="ui-prompt-ok" style="font-size:13px;padding:8px 22px;border-radius:8px;border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:700;">'+esc(okText)+'</button>'
        +'</div>'
      +'</div>';
    document.body.appendChild(overlay);
    const input=overlay.querySelector('#ui-prompt-input');
    const close=(val)=>{ try{overlay.remove();}catch(e){} if(val!=null&&typeof opts.onConfirm==='function'){ try{opts.onConfirm(val);}catch(e){} } resolve(val); };
    overlay.querySelector('#ui-prompt-ok').onclick=()=>close(input.value);
    overlay.querySelector('#ui-prompt-cancel').onclick=()=>close(null);
    overlay.onclick=(e)=>{ if(e.target===overlay) close(null); };
    input.onfocus=()=>{ input.style.borderColor='var(--blue)'; };
    input.onblur=()=>{ input.style.borderColor='var(--border)'; };
    input.onkeydown=(e)=>{ if(e.key==='Enter'&&(!opts.multiline||e.ctrlKey||e.metaKey)){ e.preventDefault(); close(input.value); } else if(e.key==='Escape'){ e.preventDefault(); close(null); } };
    setTimeout(()=>{ input.focus(); input.select(); },30);
  });
}
async function expSaveFolders(){ try{ await fetch('/api/folders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({folders:reqFolders})}); }catch(e){} }
async function expAddFolder(parentId){
  const name=await uiPrompt({title:parentId?'하위 폴더 추가':'폴더 추가', label:'폴더 이름', placeholder:'폴더 이름 입력', icon:'ti-folder-plus'}); if(!name||!name.trim()) return;
  reqFolders.push({id:'rf-'+Date.now(),name:name.trim(),parent:parentId||null,color:'blue',order:reqFolders.filter(f=>f.parent===(parentId||null)).length});
  if(parentId) expExpanded.add('f-'+parentId);
  expSaveFolders(); renderExplorer();
}
async function expRenameFolder(fid){
  const f=reqFolders.find(x=>x.id===fid); if(!f) return;
  const name=await uiPrompt({title:'폴더 이름 변경', label:'폴더 이름', value:f.name, icon:'ti-pencil'}); if(!name||!name.trim()) return;
  f.name=name.trim(); expSaveFolders(); renderExplorer();
}// 2열 상세 헤더 제목 인라인 저장
function expSaveDetailTitle(text){
  const v=(text||'').trim();
  // 대상 판별: expSel(원본 explorer) 우선, 없으면 3열(e3SelTc/e3SelReq) 또는 Beta(e3bSelTc/e3bSelReq), 팝업(_cbTcPopupTid)
  let _type=null, _id=null;
  if(typeof expSel!=='undefined' && expSel && expSel.type){ _type=expSel.type; _id=expSel.id; }
  else if(typeof window._cbTcPopupTid==='string' && window._cbTcPopupTid){ _type='tc'; _id=window._cbTcPopupTid; }
  else if(typeof e3SelTc!=='undefined' && e3SelTc){ _type='tc'; _id=e3SelTc; }
  else if(typeof e3bSelTc!=='undefined' && e3bSelTc){ _type='tc'; _id=e3bSelTc; }
  else if(typeof e3SelReq!=='undefined' && e3SelReq){ _type='req'; _id=e3SelReq; }
  else if(typeof e3bSelReq!=='undefined' && e3bSelReq){ _type='req'; _id=e3bSelReq; }
  if(!_type||!_id) return;
  if(_type==='req'){
    const r=reqList.find(x=>x.id===_id);
    if(r&&r.title!==v){
      r.title=v;
      r.updated_at=new Date().toISOString().slice(0,10);
      saveOneREQ(r);
      try{ if(typeof renderExplorer==='function') renderExplorer(); }catch(_e){}
      try{ if(typeof renderExplorer3==='function') renderExplorer3(); }catch(_e){}
      try{ if(typeof renderExplorer3Beta==='function') renderExplorer3Beta(); }catch(_e){}
    }
  } else if(_type==='tc'){
    const tc=tcList.find(t=>(t.tcid===_id)||(t.id===_id));
    if(tc&&tc.name!==v){
      tc.name=v;
      saveTCFile(tc);
      const r=reqList.find(x=>x.id===tc.req_id);
      if(r&&Array.isArray(r.tc)){ const ref=r.tc.find(x=>x.tcid===_id); if(ref){ ref.name=v; saveOneREQ(r); } }
      try{ if(typeof renderExplorer==='function') renderExplorer(); }catch(_e){}
      try{ if(typeof e3RebuildTcBody==='function') e3RebuildTcBody(); }catch(_e){}
      try{ if(typeof e3bRebuildTcBody==='function') e3bRebuildTcBody(); }catch(_e){}
    }
  }
}
// 트리 제목 더블클릭 → 상세 열고 제목에 포커스
function expEditTitleFromTree(type,id){
  if(type==='req') expSelectREQ(id); else expSelectTC(id);
  setTimeout(()=>{ const el=document.getElementById('exp-detail-title'); if(el){ el.focus(); try{ const rng=document.createRange(); rng.selectNodeContents(el); const s=getSelection(); s.removeAllRanges(); s.addRange(rng); }catch(_){} } },80);
}
async function expDeleteFolder(fid){
  if(reqFolders.some(f=>f.parent===fid)){ alert('하위 폴더가 있어 삭제할 수 없습니다. 먼저 하위 폴더를 정리하세요.'); return; }
  const reqs=reqList.filter(r=>r.folder===fid);
  if(!confirm('이 폴더를 삭제할까요?'+(reqs.length?'\n폴더 안 REQ '+reqs.length+'개와 연결 TC도 함께 삭제됩니다.':''))) return;
  for(const r of reqs){
    for(const t of tcList.filter(x=>x.req_id===r.id)) await deleteTCFile(t.tcid);
    for(const ref of (r.tc||[])) await deleteTCFile(ref.tcid);
    tcList=tcList.filter(x=>x.req_id!==r.id);
    await deleteOneREQ(r.reqid); reqList=reqList.filter(x=>x.id!==r.id);
  }
  reqFolders=reqFolders.filter(f=>f.id!==fid);
  await expSaveFolders();
  if(expSel.type==='req'&&reqs.some(r=>r.id===expSel.id)){ expSel={type:null,id:null}; const d=document.getElementById('exp-detail'); if(d) d.innerHTML=expEmptyDetail(); }
  renderExplorer();
}
async function expAddREQ(folderId){
  const folderReqs=reqList.filter(r=>r.folder===folderId);
  let base=(typeof getFolderPath==='function')?getFolderPath(folderId):((reqFolders.find(f=>f.id===folderId)||{}).name||'REQ');
  let autoId=base+'-001';
  if(folderReqs.length){ const lastId=folderReqs[folderReqs.length-1].reqid||''; const m=lastId.match(/^(.*-)(\d+)$/); autoId=m?(m[1]+String(parseInt(m[2])+1).padStart(m[2].length,'0')):(lastId+'-001'); }
  const title=await uiPrompt({title:'REQ 추가', label:'REQ 제목(Summary)', placeholder:'예: 시스템 정보 조회', icon:'ti-file-plus'}); if(title===null) return;
  const now=new Date().toISOString();
  const r={id:'req-'+Date.now(),reqid:autoId,title:(title||'').trim()||'(제목 없음)',folder:folderId,status:'Draft',priority:'Medium',scenarios:'[]',tc:[],products:[],custom_fields:{},created_at:now,updated_at:now.slice(0,10)};
  reqList.push(r);
  await saveOneREQ(r);
  expExpanded.add('f-'+folderId);
  renderExplorer(); expSelectREQ(r.id);
}
function expAddTC(reqId){
  const r=reqList.find(x=>x.id===reqId); if(!r) return;
  const esc=s=>String(s==null?'':s).replace(/"/g,'&quot;').replace(/</g,'&lt;');
  const cfTc=(typeof customFields!=='undefined'&&customFields.tc)||[];
  const findCf=lbl=>cfTc.find(f=>(f.label||'').trim()===lbl&&f.active!==false&&(f.type==='Select'||f.type==='MultiSelect'));
  const stField=findCf('상태'), tyField=findCf('타입'), sevField=findCf('심각도'), occField=findCf('발생구분');
  const optsOf=(field,fb)=>field?((field.options||[]).map(o=>cfOptValue(o)).filter(Boolean)):fb;
  const statusOpts=optsOf(stField,['대기','진행중','완료','보류']);
  const typeOpts=optsOf(tyField,['Protocol','Function','Performance','Security','Management','Maintenance']);
  const sevOpts=optsOf(sevField,['Critical','Major','Normal','Minor']);
  const occOpts=occField?optsOf(occField,[]):[];
  const pick=(opts,pref)=>opts.indexOf(pref)>=0?pref:(opts[0]||'');
  const statusDef=pick(statusOpts,'대기'), typeDef=pick(typeOpts,'Function'), sevDef=pick(sevOpts,'Normal');
  // 모델그룹/모델명 — 등록된 device-catalog(modelList/groupList) 사용. 필수 선택.
  const _mList=(typeof modelList!=='undefined'&&Array.isArray(modelList))?modelList:[];
  const _gList=(typeof groupList!=='undefined'&&Array.isArray(groupList))?groupList:[];
  const _groupNames=(function(){
    // groupList 우선, 없으면 modelList 의 group 필드에서 유니크 추출
    var out=(_gList||[]).map(function(g){ return (typeof g==='string')?g:(g.name||g.group||g.id||''); }).filter(Boolean);
    if(!out.length){
      var s=new Set();
      _mList.forEach(function(m){ if(m&&m.group) s.add(m.group); });
      out=Array.from(s);
    }
    return out.sort();
  })();
  const selHtml=(id,opts,def)=>'<select id="'+id+'" style="width:100%;font-size:13px;padding:8px 10px;border:1.5px solid var(--border);border-radius:7px;background:var(--bg2);color:var(--text);outline:none;box-sizing:border-box;">'+opts.map(o=>'<option'+(o===def?' selected':'')+'>'+esc(o)+'</option>').join('')+'</select>';
  const fld=(lab,inner,req)=>'<div><div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:4px;">'+lab+(req?' <span style="color:var(--red);">*</span>':'')+'</div>'+inner+'</div>';
  const mgSel='<select id="eatc-mg" style="width:100%;font-size:13px;padding:8px 10px;border:1.5px solid var(--border);border-radius:7px;background:var(--bg2);color:var(--text);outline:none;box-sizing:border-box;"><option value="">— 선택 —</option>'+_groupNames.map(function(g){ return '<option>'+esc(g)+'</option>'; }).join('')+'</select>';
  const mSel='<select id="eatc-model" disabled style="width:100%;font-size:13px;padding:8px 10px;border:1.5px solid var(--border);border-radius:7px;background:var(--bg2);color:var(--text);outline:none;box-sizing:border-box;opacity:0.55;"><option value="">— 모델그룹 먼저 선택 —</option></select>';
  const ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(15,20,35,0.45);z-index:11000;display:flex;align-items:center;justify-content:center;';
  ov.innerHTML='<div style="background:var(--bg2);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,0.3);width:520px;max-width:94vw;overflow:hidden;">'
    +'<div style="padding:16px 20px 0;">'
      +'<div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:14px;display:flex;align-items:center;gap:8px;"><i class="ti ti-clipboard-plus" style="color:var(--green);font-size:20px;"></i>TC 추가</div>'
      +fld('TC 제목','<input id="eatc-name" placeholder="예: 시스템 정보 조회 정상 동작 확인" style="width:100%;font-size:14px;padding:9px 11px;border:1.5px solid var(--border);border-radius:7px;background:var(--bg2);color:var(--text);outline:none;box-sizing:border-box;">')
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px;">'
        +fld('모델그룹',mgSel,true)
        +fld('모델명',mSel,true)
        +fld('상태',selHtml('eatc-status',statusOpts,statusDef))
        +fld('타입',selHtml('eatc-type',typeOpts,typeDef))
        +fld('심각도',selHtml('eatc-sev',sevOpts,sevDef))
        +(occOpts.length?fld('발생구분',selHtml('eatc-occ',occOpts,occOpts[0]||'')):'')
      +'</div>'
      +'<div id="eatc-err" style="display:none;font-size:11.5px;color:var(--red);font-weight:600;margin-top:10px;"></div>'
    +'</div>'
    +'<div style="display:flex;justify-content:flex-end;gap:8px;padding:16px 20px 18px;">'
      +'<button id="eatc-cancel" style="font-size:13px;padding:8px 18px;border-radius:8px;border:1px solid var(--border);background:var(--bg2);color:var(--text2);cursor:pointer;font-weight:600;">취소</button>'
      +'<button id="eatc-ok" style="font-size:13px;padding:8px 22px;border-radius:8px;border:none;background:var(--green);color:#fff;cursor:pointer;font-weight:700;">생성</button>'
    +'</div></div>';
  document.body.appendChild(ov);
  const close=()=>{ try{ov.remove();}catch(e){} };
  ov.onclick=e=>{ if(e.target===ov) close(); };
  ov.querySelector('#eatc-cancel').onclick=close;
  const gv=id=>{ const el=ov.querySelector('#'+id); return el?el.value:''; };
  // 모델그룹 선택 → 모델명 옵션 갱신 (해당 그룹에 속한 모델만)
  const mgEl=ov.querySelector('#eatc-mg'), mEl=ov.querySelector('#eatc-model');
  const refreshModels=()=>{
    const g=mgEl.value;
    if(!g){ mEl.innerHTML='<option value="">— 모델그룹 먼저 선택 —</option>'; mEl.disabled=true; mEl.style.opacity='0.55'; return; }
    const _ms=_mList.filter(m=>m&&m.group===g).map(m=>m.name).filter(Boolean).sort();
    mEl.innerHTML='<option value="">— 선택 —</option>'+_ms.map(n=>'<option>'+esc(n)+'</option>').join('');
    mEl.disabled=false; mEl.style.opacity='1';
  };
  mgEl.addEventListener('change',refreshModels);
  ov.querySelector('#eatc-name').addEventListener('keydown',e=>{ if(e.key==='Enter') ov.querySelector('#eatc-ok').click(); });
  setTimeout(()=>{ const n=ov.querySelector('#eatc-name'); if(n) n.focus(); },30);
  const showErr=msg=>{ const e=ov.querySelector('#eatc-err'); if(!e) return; if(msg){ e.textContent=msg; e.style.display='block'; } else { e.style.display='none'; } };
  var _creating=false;   // ★ 연타 방지 플래그 — 첫 클릭 처리 중이면 이후 클릭 무시
  ov.querySelector('#eatc-ok').onclick=async()=>{
    if(_creating) return;   // 이미 생성 중 (버튼 연타·Enter 연타·중복 이벤트 방지)
    const mg=gv('eatc-mg'), mdl=gv('eatc-model');
    if(!mg){ showErr('모델그룹을 선택하세요.'); mgEl.focus(); return; }
    if(!mdl){ showErr('모델명을 선택하세요.'); mEl.focus(); return; }
    showErr('');
    _creating=true;
    const okBtn=ov.querySelector('#eatc-ok');
    if(okBtn){ okBtn.disabled=true; okBtn.style.opacity='0.6'; okBtn.style.cursor='wait'; okBtn.innerHTML='<i class="ti ti-loader-2 spin" style="font-size:13px;"></i> 생성 중…'; }
    try{
      const name=(gv('eatc-name')||'').trim()||'(제목 없음)';
      const _b=(r.reqid||'REQ').replace(/-\d{3}$/,'')+'-TC-';
      // 이 REQ 에 이미 붙어 있는 TC 중 같은 prefix 의 최대 번호 → +1 로 시퀀스 결정.
      // (전역 카운트로 하면 예전 다른 REQ 의 TC 도 세서 001 이 아니라 002 로 나오는 문제 → REQ 로컬 카운트로 변경)
      const _re=new RegExp('^'+_b.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(\\d+)$');
      let _sMax=0;
      // 이 REQ 의 tcList 항목
      tcList.filter(x=>x.req_id===r.id).forEach(x=>{ var m=String(x.tcid||'').match(_re); if(m){ var v=parseInt(m[1],10); if(v>_sMax) _sMax=v; } });
      // REQ 의 tc 참조 목록
      (r.tc||[]).forEach(x=>{ var m=String(x.tcid||'').match(_re); if(m){ var v=parseInt(m[1],10); if(v>_sMax) _sMax=v; } });
      let _s=_sMax+1; let tcid;
      // 전역 유일 보장 (다른 REQ 에 같은 id 가 있으면 계속 +1)
      do{ tcid=_b+_pad3(_s); _s++; }while(tcList.some(x=>x.tcid===tcid));
      const stV=gv('eatc-status'), tyV=gv('eatc-type'), sev=gv('eatc-sev');
      const tc={tcid,name,status:stV||'대기',req_id:r.id,type:tyV||'Function',kind:'자체',severity:sev,modelGroup:mg,model:mdl,steps:[],custom_fields:{},created_by:((typeof currentUser!=='undefined'&&currentUser&&(currentUser.name||currentUser.username))||'admin'),created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
      if(stField&&stV) tc.custom_fields[stField.id]=stV;
      if(tyField&&tyV) tc.custom_fields[tyField.id]=tyV;
      if(sevField&&sev) tc.custom_fields[sevField.id]=sev;
      if(occField){ const occ=gv('eatc-occ'); if(occ) tc.custom_fields[occField.id]=occ; }
      tcList.push(tc);
      await saveTCFile(tc);
      if(!Array.isArray(r.tc)) r.tc=[];
      r.tc.push({tcid,name:tc.name,status:tc.status});
      await saveOneREQ(r);
      close();
      expExpanded.add('r-'+r.id);
      renderExplorer(); expSelectTC(tcid);
      if(typeof renderExplorer3==='function') renderExplorer3();
    } catch(e){
      _creating=false;
      if(okBtn){ okBtn.disabled=false; okBtn.style.opacity=''; okBtn.style.cursor='pointer'; okBtn.innerHTML='생성'; }
      if(typeof showToast==='function') showToast('TC 생성 실패: '+(e&&e.message?e.message:''));
    }
  };
}
async function _expBulkCreateReqs(folderId, text){
  const titles=String(text||'').split('\n').map(s=>s.trim()).filter(Boolean);
  if(!titles.length){ showToast('생성할 내용이 없습니다'); return 0; }
  const base=(typeof getFolderPath==='function'?getFolderPath(folderId):'')||expFolderPath(folderId)||'REQ';
  const now=new Date().toISOString(); let s=_nextSeqFor(base,'-','req');
  for(let i=0;i<titles.length;i++){
    let rid; do{ rid=base+'-'+_pad3(s); s++; }while(reqList.some(x=>x.reqid===rid));
    const r={id:'req-'+Date.now()+'-'+i, reqid:rid, title:titles[i], folder:folderId, status:'Draft', priority:'Medium', scenarios:'[]', tc:[], products:[], custom_fields:{}, created_at:now, updated_at:now.slice(0,10)};
    reqList.push(r); try{ await saveOneREQ(r); }catch(e){}
  }
  expExpanded.add('f-'+folderId); renderExplorer(); showToast('REQ '+titles.length+'개 생성'); return titles.length;
}
async function expBulkAddREQ(folderId){
  const txt=await uiPrompt({title:'REQ 일괄 생성', label:'한 줄에 하나씩 REQ 제목 (줄마다 1개 생성, ID 자동)', placeholder:'로그인 기능\n비밀번호 재설정\n세션 타임아웃', multiline:true, okText:'생성', icon:'ti-files'}); if(txt===null) return;
  await _expBulkCreateReqs(folderId, txt);
}
function expBulkReqDialog(){
  const folders=(reqFolders||[]);
  if(!folders.length){ showToast('먼저 폴더를 만드세요'); return; }
  const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  const opt=folders.map(f=>'<option value="'+f.id+'">'+esc((typeof getFolderPath==='function'?getFolderPath(f.id):f.name)||f.name)+'</option>').join('');
  const ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(15,20,35,0.45);z-index:11000;display:flex;align-items:center;justify-content:center;';
  ov.innerHTML='<div style="background:var(--bg2);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,0.3);width:500px;max-width:92vw;overflow:hidden;">'
    +'<div style="padding:18px 22px 0;">'
      +'<div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:14px;display:flex;align-items:center;gap:8px;"><i class="ti ti-files" style="color:var(--blue);font-size:20px;"></i>REQ 일괄 생성</div>'
      +'<div style="font-size:12px;color:var(--text3);font-weight:600;margin-bottom:6px;">폴더</div>'
      +'<select id="ebr-folder" style="width:100%;font-size:13px;padding:9px 11px;border:1.5px solid var(--border);border-radius:9px;background:var(--bg2);color:var(--text);outline:none;margin-bottom:12px;">'+opt+'</select>'
      +'<div style="font-size:12px;color:var(--text3);font-weight:600;margin-bottom:6px;">한 줄에 하나씩 REQ 제목 (줄마다 1개 생성, ID 자동)</div>'
      +'<textarea id="ebr-text" rows="9" placeholder="로그인 기능\n비밀번호 재설정\n세션 타임아웃" style="width:100%;font-size:13px;padding:11px 13px;border:1.5px solid var(--border);border-radius:9px;outline:none;box-sizing:border-box;color:var(--text);background:var(--bg2);resize:vertical;font-family:inherit;line-height:1.6;"></textarea>'
    +'</div>'
    +'<div style="display:flex;justify-content:flex-end;gap:8px;padding:16px 22px 18px;">'
      +'<button id="ebr-cancel" style="font-size:13px;padding:8px 18px;border-radius:8px;border:1px solid var(--border);background:var(--bg2);color:var(--text2);cursor:pointer;font-weight:600;">취소</button>'
      +'<button id="ebr-ok" style="font-size:13px;padding:8px 22px;border-radius:8px;border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:700;">생성</button>'
    +'</div></div>';
  document.body.appendChild(ov);
  const close=()=>{ try{ov.remove();}catch(e){} };
  ov.onclick=e=>{ if(e.target===ov) close(); };
  ov.querySelector('#ebr-cancel').onclick=close;
  const sel=ov.querySelector('#ebr-folder'); if(typeof expSel!=='undefined'&&expSel&&expSel.type==='folder'){ try{ sel.value=expSel.id; }catch(e){} }
  ov.querySelector('#ebr-ok').onclick=async()=>{ const fid=sel.value; const lines=ov.querySelector('#ebr-text').value; close(); await _expBulkCreateReqs(fid, lines); };
  setTimeout(()=>{ const t=ov.querySelector('#ebr-text'); if(t) t.focus(); },30);
}
async function expBulkAddTC(reqId){
  const r=reqList.find(x=>x.id===reqId); if(!r) return;
  const txt=await uiPrompt({title:'TC 일괄 생성', label:'한 줄에 하나씩 TC 제목 (줄마다 1개 생성, ID 자동)', placeholder:'정상 동작 확인\n경계값 확인\n예외 처리 확인', multiline:true, okText:'생성', icon:'ti-files'}); if(txt===null) return;
  const names=String(txt).split('\n').map(s=>s.trim()).filter(Boolean);
  if(!names.length){ showToast('생성할 내용이 없습니다'); return; }
  const prefix=expFolderPath(r.folder)||String(r.reqid||'REQ').replace(/-\d{3}$/,''); let s=_nextSeqFor(prefix,'-TC-','tc');
  if(!Array.isArray(r.tc)) r.tc=[];
  for(let i=0;i<names.length;i++){
    let tid; do{ tid=prefix+'-TC-'+_pad3(s); s++; }while(tcList.some(x=>x.tcid===tid));
    const tc={tcid:tid,id:tid,name:names[i],status:'대기',req_id:r.id,type:'Function',kind:'자체',steps:[],custom_fields:{},created_by:((typeof currentUser!=='undefined'&&currentUser&&(currentUser.name||currentUser.username))||'admin'),created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
    tcList.push(tc); try{ await saveTCFile(tc); }catch(e){}
    r.tc.push({tcid:tid,name:tc.name,status:'대기'});
  }
  try{ await saveOneREQ(r); }catch(e){}
  // req_updated broadcast 로 loadREQData 가 실행되면 방금 push 한 로컬 reqList 원소가 교체되어 새 tc 참조가 유실될 수 있음 → meta 재로드로 tcList 도 서버 최신 반영
  try{ if(typeof invalidateTCDataCache==='function') invalidateTCDataCache(); }catch(e){}
  try{ if(typeof loadTCData==='function') await loadTCData(true); }catch(e){}
  expExpanded.add('r-'+r.id); renderExplorer(); showToast('TC '+names.length+'개 생성');
  if(typeof renderExplorer3==='function') renderExplorer3();
}
async function expDeleteREQ(reqId){
  const r=reqList.find(x=>x.id===reqId); if(!r) return;
  if(!confirm('REQ "'+(r.reqid||'')+'"를 삭제할까요?'+(((r.tc||[]).length||tcList.some(t=>t.req_id===r.id))?'\n연결 TC도 함께 삭제됩니다.':''))) return;
  for(const t of tcList.filter(x=>x.req_id===r.id)) await deleteTCFile(t.tcid);
  for(const ref of (r.tc||[])) await deleteTCFile(ref.tcid);
  tcList=tcList.filter(x=>x.req_id!==r.id);
  await deleteOneREQ(r.reqid); reqList=reqList.filter(x=>x.id!==r.id);
  if(expSel.type==='req'&&expSel.id===reqId){ expSel={type:null,id:null}; const d=document.getElementById('exp-detail'); if(d) d.innerHTML=expEmptyDetail(); }
  renderExplorer();
}
async function expDeleteTC(tcid, skipConfirm){
  const _do=async function(){
    const tc=tcList.find(t=>t.tcid===tcid);
    await deleteTCFile(tcid);
    tcList=tcList.filter(t=>t.tcid!==tcid);
    if(tc){ const r=reqList.find(x=>x.id===tc.req_id); if(r&&Array.isArray(r.tc)){ r.tc=r.tc.filter(ref=>ref.tcid!==tcid); await saveOneREQ(r); } }
    if(expSel.type==='tc'&&expSel.id===tcid){ expSel={type:null,id:null}; const d=document.getElementById('exp-detail'); if(d) d.innerHTML=expEmptyDetail(); }
    // bulk 삭제 중이면 각 iteration 렌더 스킵 (e3BulkDeleteTcs 가 끝난 뒤 1회만 렌더)
    if(!window._expBulkSkipRender){
      renderExplorer();
      if(typeof renderExplorer3==='function') renderExplorer3();
    }
  };
  // 두 번째 인자 skipConfirm=true 면 확인창 없이 바로 실행 (일괄 삭제에서 이미 한 번 확인 받았을 때)
  if(skipConfirm){ await _do(); return; }
  if(typeof uiConfirm==='function'){
    uiConfirm({title:'TC 삭제', msg:'<b>'+tcid+'</b>를 삭제할까요?', icon:'ti-trash', danger:true, confirmText:'삭제', onConfirm:_do});
  } else {
    if(!confirm('TC "'+tcid+'"를 삭제할까요?')) return;
    await _do();
  }
}
async function expCloneTC(tcid){
  const tc=tcList.find(t=>t.tcid===tcid); if(!tc){ showToast('TC를 찾을 수 없습니다'); return; }
  const base=String(tc.tcid||'TC'); let n=2, suggest;
  do{ suggest=base+'-Copy'+n; n++; }while(tcList.some(t=>t.tcid===suggest)&&n<1000);
  const inputId=await uiPrompt({title:'TC 복제', label:'새 TC ID (직접 수정 가능)', value:suggest, icon:'ti-copy'});
  if(inputId===null) return;
  const newId=(inputId||'').trim()||suggest;
  if(tcList.some(t=>t.tcid===newId)){ showToast('이미 존재하는 TC ID입니다'); return; }
  const copy=JSON.parse(JSON.stringify(tc));
  copy.tcid=newId; copy.id=newId; copy.name=(tc.name||'')+' (복사본)';
  (copy.checks||[]).forEach(c=>{ c.id='ck'+Date.now()+'_'+Math.floor(Math.random()*1000000); c.output=''; c.repeatResult=''; delete c.executed_at; });
  copy.status='대기'; copy.result_history=[]; copy.issue_list=[];
  tcList.push(copy);
  const r=reqList.find(x=>x.id===tc.req_id);
  if(r){ r.tc=[...(r.tc||[]), copy]; try{ await saveOneREQ(r); }catch(e){} }
  await saveTCFile(copy);
  renderExplorer();
  try{ expSelectTC(newId); }catch(e){}
  showToast('TC 복제됨: '+newId+' (이름 변경 가능)');
}
// TC ID(tcid) 직접 수정 — tcid는 파일명·전역 조인 키이므로 단순 편집이 아닌 rename 마이그레이션으로 처리
async function tcRenameId(tcid){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc){ showToast('TC를 찾을 수 없습니다'); return; }
  const oldId=tc.tcid||tc.id;
  const input=await uiPrompt({title:'TC ID 수정', label:'새 TC ID (참조·이력도 함께 변경됩니다)', value:oldId, icon:'ti-pencil'});
  if(input===null) return;
  const newId=(input||'').trim();
  if(!newId){ showToast('TC ID를 입력하세요'); return; }
  if(newId===oldId) return;
  if(/[\\/:*?"<>|]/.test(newId)){ showToast('TC ID에 사용할 수 없는 문자가 있습니다 ( \\ / : * ? " < > | )'); return; }
  if(tcList.some(t=>t!==tc&&((t.tcid===newId)||(t.id===newId)))){ showToast('이미 존재하는 TC ID입니다'); return; }
  // 1) TC 본체: 새 키로 저장 후 옛 파일 삭제
  tc.tcid=newId; tc.id=newId;
  try{ await saveTCFile(tc); }catch(e){}
  try{ await deleteTCFile(oldId); }catch(e){}
  // 2) 부모 REQ의 tc[] 참조 갱신
  const r=reqList.find(x=>x.id===tc.req_id);
  // r.tc는 별도 ref({tcid,name,status})이거나 tcList와 동일 객체 참조일 수 있으므로 둘 다 처리하고 항상 재저장
  if(r&&Array.isArray(r.tc)){ r.tc.forEach(x=>{ if(x===tc||x.tcid===oldId) x.tcid=newId; }); try{ await saveOneREQ(r); }catch(e){} }
  // 3) 다른 TC들의 호출(call) 참조 callTcid 갱신
  let callFixed=0;
  for(const otc of tcList){
    if(otc===tc) continue; let changed=false;
    (otc.checks||[]).forEach(c=>{ if(c&&c.callTcid===oldId){ c.callTcid=newId; changed=true; } });
    if(changed){ try{ await saveTCFile(otc); }catch(e){} callFixed++; }
  }
  // 4) 과거 Cycle 항목 tcid 갱신 (리포트/배지 조인 유지)
  let cycFixed=0;
  if(typeof cycleList!=='undefined'&&Array.isArray(cycleList)&&typeof saveCycle==='function'){
    for(const cy of cycleList){
      let changed=false;
      (cy.items||[]).forEach(it=>{ if(it&&it.tcid===oldId){ it.tcid=newId; changed=true; } });
      if(changed){ try{ await saveCycle(cy); }catch(e){} cycFixed++; }
    }
  }
  // 5) 선택 상태 갱신
  try{ if(typeof expSel!=='undefined'&&expSel.type==='tc'&&expSel.id===oldId) expSel.id=newId; }catch(e){}
  try{ if(typeof tcSelTcId!=='undefined'&&tcSelTcId===oldId) tcSelTcId=newId; }catch(e){}
  try{ if(typeof boardTcId!=='undefined'&&boardTcId===oldId) boardTcId=newId; }catch(e){}
  // 6) 재렌더
  ['renderExplorer','renderTCReqTree','tcRenderTCList','renderDashboard'].forEach(fn=>{ try{ if(typeof window[fn]==='function') window[fn](); }catch(e){} });
  try{ expSelectTC(newId); }catch(e){}
  showToast('TC ID 변경: '+oldId+' → '+newId+(callFixed?(' · 호출 '+callFixed):'')+(cycFixed?(' · 사이클 '+cycFixed):''));
}
async function expCloneREQ(reqId){
  const r=reqList.find(x=>x.id===reqId); if(!r){ showToast('REQ를 찾을 수 없습니다'); return; }
  const base=String(r.reqid||'REQ'); let n=2, suggest;
  do{ suggest=base+'-Copy'+n; n++; }while(reqList.some(x=>x.reqid===suggest)&&n<1000);
  const inputId=await uiPrompt({title:'REQ 복제', label:'새 REQ ID (직접 수정 · 하위 TC도 함께 복제)', value:suggest, icon:'ti-copy'});
  if(inputId===null) return;
  const newReqId=(inputId||'').trim()||suggest;
  if(reqList.some(x=>x.reqid===newReqId)){ showToast('이미 존재하는 REQ ID입니다'); return; }
  const copy=JSON.parse(JSON.stringify(r));
  copy.id='req-'+Date.now(); copy.reqid=newReqId; copy.title=(r.title||'')+' (복사본)';
  const oldBase=base.replace(/[-_]?\d+$/,''); const newBase=newReqId.replace(/[-_]?\d+$/,'');
  const newTcs=[];
  (r.tc||[]).forEach(function(tc){
    const c=JSON.parse(JSON.stringify(tc));
    let ntid=String(tc.tcid||'TC');
    if(oldBase && ntid.indexOf(oldBase)===0){ ntid=newBase+ntid.slice(oldBase.length); }
    let k=ntid, m=2; while(tcList.some(t=>t.tcid===k)||newTcs.some(t=>t.tcid===k)){ k=ntid+'-Copy'+m; m++; }
    c.tcid=k; c.id=k; c.req_id=copy.id;
    (c.checks||[]).forEach(ch=>{ ch.id='ck'+Date.now()+'_'+Math.floor(Math.random()*1000000); ch.output=''; ch.repeatResult=''; delete ch.executed_at; });
    c.status='대기'; c.result_history=[]; c.issue_list=[];
    newTcs.push(c);
  });
  copy.tc=newTcs;
  reqList.push(copy);
  newTcs.forEach(t=>tcList.push(t));
  try{ await saveOneREQ(copy); }catch(e){}
  for(const t of newTcs){ try{ await saveTCFile(t); }catch(e){} }
  renderExplorer();
  try{ expSelectREQ(copy.id); }catch(e){}
  showToast('REQ 복제됨: '+newReqId+' (TC '+newTcs.length+'개 포함)');
}
// 다중 선택 + 일괄 삭제
let expSelReq=new Set(), expSelTc=new Set(), expSelFolder=new Set();
let expSelAnchor=null, expFlatOrder=[];   // Shift 범위선택용: 마지막 클릭 앵커 + 화면 표시 순서
function expClearSel(){ expSelReq.clear(); expSelTc.clear(); expSelFolder.clear(); expSelAnchor=null; renderExplorer(); }
function expIsSel(type,id){ return type==='folder'?expSelFolder.has(id):(type==='req'?expSelReq.has(id):expSelTc.has(id)); }
// 한 항목 선택/해제 (폴더→하위, REQ→TC 카스케이드) — 재렌더 없이 Set만 갱신
function _expSetSel(type,id,on){
  if(type==='folder'){ const fids=expCollectFolderTree(id); fids.forEach(function(fid){ if(on)expSelFolder.add(fid); else expSelFolder.delete(fid); }); reqList.filter(function(r){return fids.includes(r.folder);}).forEach(function(r){ if(on)expSelReq.add(r.id); else expSelReq.delete(r.id); tcList.filter(function(t){return t.req_id===r.id;}).forEach(function(t){ if(on)expSelTc.add(t.tcid); else expSelTc.delete(t.tcid); }); }); }
  else if(type==='req'){ if(on)expSelReq.add(id); else expSelReq.delete(id); tcList.filter(function(t){return t.req_id===id;}).forEach(function(t){ if(on)expSelTc.add(t.tcid); else expSelTc.delete(t.tcid); }); }
  else { if(on)expSelTc.add(id); else expSelTc.delete(id); }
}
// 통합 토글: Shift=앵커~현재 범위선택 / Ctrl·일반=토글 + 앵커 갱신
function expToggleSel(type,id,ev,checked){
  if(ev&&ev.shiftKey&&expSelAnchor){
    const a=expFlatOrder.findIndex(function(x){return x.type===expSelAnchor.type&&x.id===expSelAnchor.id;});
    const b=expFlatOrder.findIndex(function(x){return x.type===type&&x.id===id;});
    if(a>=0&&b>=0){ const lo=Math.min(a,b),hi=Math.max(a,b); for(let i=lo;i<=hi;i++) _expSetSel(expFlatOrder[i].type,expFlatOrder[i].id,true); renderExplorer(); expUpdateBulkBar(); return; }
  }
  const on=(checked===true||checked===false)?checked:!expIsSel(type,id);
  _expSetSel(type,id,on); expSelAnchor={type:type,id:id};
  renderExplorer(); expUpdateBulkBar();
}
// 행 클릭: Ctrl/Shift면 선택, 아니면 기존 열기
function expRowClick(type,id,ev){
  if(ev&&(ev.ctrlKey||ev.metaKey||ev.shiftKey)){ ev.preventDefault(); ev.stopPropagation(); expToggleSel(type,id,ev); return; }
  if(type==='folder') expSelectFolder(id); else if(type==='req') expSelectREQ(id); else expSelectTC(id);
}
function expBulkPDF(){
  const seen=new Set(); const reqOrder=[];
  const addReq=id=>{ if(!seen.has(id)){ seen.add(id); reqOrder.push(id); } };
  [...expSelReq].forEach(addReq);
  [...expSelFolder].forEach(fid=>expCollectFolderTree(fid).forEach(f=>reqList.filter(r=>r.folder===f).forEach(r=>addReq(r.id))));
  const tcOnly=[...expSelTc].filter(tcid=>{ const tc=tcList.find(t=>t.tcid===tcid); return tc&&!seen.has(tc.req_id); });
  if(!reqOrder.length&&!tcOnly.length){ showToast('선택된 항목이 없습니다'); return; }
  const area=document.getElementById('pdf-print-area'); if(!area) return;
  const now=new Date().toLocaleDateString('ko-KR');
  const _custItems=reqOrder.map(id=>reqList.find(x=>x.id===id)).filter(Boolean);
  const _cust=(typeof _commonCustomer==='function')?_commonCustomer(_custItems,'req'):'';
  const _allTcs=[]; reqOrder.forEach(id=>{ const r=reqList.find(x=>x.id===id); if(r) tcList.filter(t=>t.req_id===r.id||t.req_id===r.reqid).forEach(t=>_allTcs.push(t)); }); tcOnly.forEach(tid=>{ const tc=tcList.find(t=>t.tcid===tid); if(tc) _allTcs.push(tc); });
  const build=m=>{ const _brand=(typeof _docBrand==='function')?_docBrand(m,_cust):'Ubiquoss-TOP · Ubiquoss Test Orchestration Platform';
    let html='<div class="pdf-cover"><div class="pdf-logo">'+_brand+'</div><div class="pdf-title">REQ / TC 명세서</div><div class="pdf-meta"><span class="pdf-badge approved">REQ '+reqOrder.length+' · TC '+tcOnly.length+'</span><span style="font-size:11px;color:#9aa0b8;">출력일: '+now+'</span></div></div>';
    reqOrder.forEach(id=>{ const r=reqList.find(x=>x.id===id); if(!r) return; const tcs=tcList.filter(t=>t.req_id===r.id||t.req_id===r.reqid); let scs=[]; try{scs=JSON.parse(r.scenarios||'[]');if(!Array.isArray(scs))scs=[];}catch(e){} html+='<div class="pdf-page-break"></div>'+buildReqPdfHtml(r,tcs,scs,false); });
    tcOnly.forEach(tcid=>{ const tc=tcList.find(t=>t.tcid===tcid); if(!tc) return; html+='<div class="pdf-page-break"></div>'+buildTCPdfHtml(tc,false); });
    if(m!=='고객사'&&typeof _checklistSection==='function') html+=_checklistSection(_allTcs);
    return html; };
  const _pm=(typeof _pdfMode!=='undefined')?_pdfMode:'고객사';
  pdfPreview(build(_pm), 'REQ / TC 명세서 (REQ '+reqOrder.length+' · TC '+tcOnly.length+')', build);
}
function expUpdateBulkBar(){
  const bar=document.getElementById('exp-bulk-bar'); if(!bar) return;
  const n=expSelReq.size+expSelTc.size+expSelFolder.size;
  if(n>0){ bar.style.display='flex'; const c=document.getElementById('exp-bulk-count'); if(c) c.textContent='폴더 '+expSelFolder.size+' · REQ '+expSelReq.size+' · TC '+expSelTc.size+' 선택됨'; }
  else bar.style.display='none';
}
function expCollectFolderTree(fid){ const out=[fid]; reqFolders.filter(f=>f.parent===fid).forEach(c=>out.push(...expCollectFolderTree(c.id))); return out; }
async function expBulkDelete(){
  const reqIds=new Set(expSelReq), tcIds=new Set(expSelTc);
  // 선택 폴더 + 그 하위 폴더 전부, 그리고 그 안의 REQ도 삭제 대상에 포함
  const allFolderIds=new Set();
  [...expSelFolder].forEach(fid=>expCollectFolderTree(fid).forEach(id=>allFolderIds.add(id)));
  reqList.forEach(r=>{ if(allFolderIds.has(r.folder)) reqIds.add(r.id); });
  if(!reqIds.size&&!tcIds.size&&!allFolderIds.size) return;
  if(!confirm('선택 항목을 삭제할까요?\n폴더 '+allFolderIds.size+'개 · REQ '+reqIds.size+'개 · TC '+tcIds.size+'개\n(폴더/REQ 삭제 시 하위 항목도 함께 삭제됩니다)')) return;
  for(const id of reqIds){
    const r=reqList.find(x=>x.id===id); if(!r) continue;
    for(const t of tcList.filter(x=>x.req_id===r.id)) await deleteTCFile(t.tcid);
    for(const ref of (r.tc||[])) await deleteTCFile(ref.tcid);
    tcList=tcList.filter(x=>x.req_id!==r.id);
    await deleteOneREQ(r.reqid); reqList=reqList.filter(x=>x.id!==r.id);
  }
  for(const tcid of tcIds){
    const tc=tcList.find(t=>t.tcid===tcid); if(!tc) continue; // 이미 REQ와 함께 삭제됐으면 skip
    await deleteTCFile(tcid);
    tcList=tcList.filter(t=>t.tcid!==tcid);
    const r=reqList.find(x=>x.id===tc.req_id);
    if(r&&Array.isArray(r.tc)){ r.tc=r.tc.filter(ref=>ref.tcid!==tcid); await saveOneREQ(r); }
  }
  if(allFolderIds.size){ reqFolders=reqFolders.filter(f=>!allFolderIds.has(f.id)); await expSaveFolders(); }
  expSelReq.clear(); expSelTc.clear(); expSelFolder.clear();
  expSel={type:null,id:null}; const d=document.getElementById('exp-detail'); if(d) d.innerHTML=expEmptyDetail();
  renderExplorer();
  showToast('삭제 완료');
}
function expOnSearch(v){ expSearch=(v||'').trim().toLowerCase(); renderExplorer(); }
function _expSyncViewBtns(){
  const map={all:['exp-view-all','#475569'],req:['exp-view-req','#2d6fd4'],tc:['exp-view-tc','#00a872']};
  Object.keys(map).forEach(function(k){ const id=map[k][0],col=map[k][1]; const b=document.getElementById(id); if(!b) return; const on=(expView===k); b.style.background=on?col:'#fff'; b.style.color=on?'#fff':col; b.style.border='1.5px solid '+col; });
  const sel=document.getElementById('exp-view-sel'); if(sel&&sel.value!==expView) sel.value=expView;   // 보기 모드 드롭다운 동기화
}
function expSetView(v){ expView=v; _expSyncViewBtns(); renderExplorer(); }
// 아이콘 툴바: 필터/정렬 바 토글 + 생성 메뉴 (기능 유지, 1행 압축)
function expToggleFilterBar(){ const b=document.getElementById('exp-filter-bar'); if(!b)return; const on=(b.style.display==='none'||!b.style.display); b.style.display=on?'block':'none'; const btn=document.getElementById('exp-filter-btn'); if(btn){ btn.style.background=on?'#2d6fd4':'#fff'; btn.style.color=on?'#fff':'#2d6fd4'; } }
function expToggleSortBar(){ const b=document.getElementById('exp-sort-bar'); if(!b)return; const on=(b.style.display==='none'||!b.style.display); b.style.display=on?'block':'none'; const btn=document.getElementById('exp-sort-btn'); if(btn){ btn.style.background=on?'#7c3aed':'#fff'; btn.style.color=on?'#fff':'#7c3aed'; } }
function expToggleCreateMenu(ev){ if(ev&&ev.stopPropagation)ev.stopPropagation(); const m=document.getElementById('exp-create-menu'); if(!m)return; m.style.display=(m.style.display==='none'||!m.style.display)?'block':'none'; }
// 탐색기 상태 저장/복원 (새로고침해도 펼침·선택·정렬·필터 유지)
function expSaveState(){
  try{ localStorage.setItem('utop_explorer_state', JSON.stringify({
    expanded:[...expExpanded], sel:expSel, view:expView,
    sort:expSort, sortDir:expSortDir, tcSort:expTcSort, tcSortDir:expTcSortDir,
    reqFilter:expReqFilter, tcFilter:expTcFilter
  })); }catch(e){}
}
function expLoadState(){
  try{
    const s=JSON.parse(localStorage.getItem('utop_explorer_state')||'{}');
    if(Array.isArray(s.expanded)) expExpanded=new Set(s.expanded);
    if(s.sel) expSel=s.sel;
    if(s.view) expView=s.view;
    if(s.sort) expSort=s.sort;
    if(typeof s.sortDir==='number') expSortDir=s.sortDir;
    if(s.tcSort) expTcSort=s.tcSort;
    if(typeof s.tcSortDir==='number') expTcSortDir=s.tcSortDir;
    if(s.reqFilter&&typeof s.reqFilter==='object') expReqFilter=s.reqFilter;
    if(s.tcFilter&&typeof s.tcFilter==='object') expTcFilter=s.tcFilter;
  }catch(e){}
}
function expToggle(key){ if(expExpanded.has(key)) expExpanded.delete(key); else expExpanded.add(key); renderExplorer(); }

function expTcMatch(t){ if(!expSearch) return true; return ((t.tcid||'').toLowerCase().includes(expSearch))||((t.name||'').toLowerCase().includes(expSearch)); }
function expReqSelfMatch(r){ if(!expSearch) return true; return ((r.reqid||'').toLowerCase().includes(expSearch))||((r.title||'').toLowerCase().includes(expSearch)); }
function expReqTCs(r){ return tcList.filter(t=>t.req_id===r.id); }
// 화면 표시용 ID — 앞 2개 세그먼트(예: KT-REQ / LGU-REQ / U-REQ) 제외 (실제 데이터는 변경하지 않음)
function expDispId(id){ id=String(id||''); const m=id.match(/^[^-]+-[^-]+-(.+)$/); return m?m[1]:id; }
function expReqVisible(r){
  if(!expReqPassFilter(r)) return false;
  if(expView==='tc'){ return expReqTCs(r).some(expTcShown); }   // TC만 보기: TC 없는 REQ 숨김
  if(expReqSelfMatch(r)) return true;
  if(expView!=='req' && expReqTCs(r).some(expTcShown)) return true;
  return false;
}
function expFolderVisible(f){
  // 검색·필터가 없으면 빈 폴더도 표시 (그래야 새로 만든 폴더가 보임)
  const filtering=!!expSearch||Object.keys(expReqFilter).length>0||Object.keys(expTcFilter).length>0;
  if(!filtering) return true;
  if(reqList.filter(r=>r.folder===f.id).some(expReqVisible)) return true;
  if(reqFolders.filter(c=>c.parent===f.id).some(expFolderVisible)) return true;
  return false;
}

function renderExplorer(){
  try{ _expSyncViewBtns(); }catch(e){}
  // exp* CRUD 액션이 데이터 변경 후 renderExplorer()를 부르므로, 현재 활성 화면이
  // explorer3/explorer3-beta(Req&Coverage)라면 그 화면을 갱신한다.
  // page-explorer3 / page-explorer3-beta div는 SPA 특성상 항상 DOM에 있으므로 '현재 활성 화면'인지로만 판단.
  var _e3=document.getElementById('page-explorer3');
  if(_e3 && _e3.classList.contains('active')){ try{ if(typeof renderExplorer3==='function') renderExplorer3(); }catch(e){} return; }
  var _e3b=document.getElementById('page-explorer3-beta');
  if(_e3b && _e3b.classList.contains('active')){ try{ if(typeof renderExplorer3Beta==='function') renderExplorer3Beta(); }catch(e){} return; }
  const tree=document.getElementById('exp-tree');
  if(!tree){
    return;
  }
  ['all','req','tc'].forEach(v=>{
    const b=document.getElementById('exp-view-'+v);
    if(b){ const on=expView===v; b.style.opacity=on?'1':'0.42'; b.style.boxShadow=on?'inset 0 0 0 2px rgba(255,255,255,0.6)':'none'; }
  });
  // 필터 패널 + 버튼 상태
  [['req',expReqFilterOpen,expReqFilter,'#2d6fd4'],['tc',expTcFilterOpen,expTcFilter,'#00a872']].forEach(([tg,opn,store,col])=>{
    const panel=document.getElementById('exp-'+tg+'-filter');
    if(panel){ panel.style.display=opn?'block':'none'; panel.innerHTML=opn?expFilterPanelHtml(tg):''; }
    const btn=document.getElementById('exp-'+tg+'-filter-btn');
    if(btn){ const on=Object.keys(store).length>0||opn; btn.style.background=on?col:'#fff'; btn.style.color=on?'#fff':col; btn.style.borderColor=col; }
  });
  const roots=reqFolders.filter(f=>!f.parent).sort((a,b)=>(a.order||0)-(b.order||0)).filter(expFolderVisible);
  expFlatOrder=[];   // 렌더 순서 기록 시작 (Shift 범위선택용)
  tree.innerHTML = roots.map(f=>expFolderHtml(f,0,[])).join('') || '<div style="padding:24px;text-align:center;color:var(--text3);font-size:13px;">표시할 항목이 없습니다</div>';
  // 빈 여백 우클릭 → 현재 경로(선택 항목) 기준 생성 메뉴 (폴더/REQ/TC 행은 각자 stopPropagation 처리)
  tree.oncontextmenu=function(e){ if(e.target&&e.target.closest&&e.target.closest('.exp-row')) return; expEmptyMenu(e); };
  const _sf=document.getElementById('exp-stat-folder'); if(_sf) _sf.textContent=reqFolders.length;
  const _sr=document.getElementById('exp-stat-req'); if(_sr) _sr.textContent=reqList.length;
  const _st=document.getElementById('exp-stat-tc'); if(_st) _st.textContent=tcList.length;
  expUpdateBulkBar();
  expSaveState();
}

// ── 휴지통(삭제 복원) ──
async function expTrashOpen(){
  let items=[];
  try{ const r=await fetch('/api/trash'); const d=await r.json(); items=d.items||[]; }catch(e){ if(typeof showToast==='function')showToast('휴지통 로드 실패'); return; }
  _expTrashClose();
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  const ov=document.createElement('div'); ov.id='exp-trash-ov';
  ov.style.cssText='position:fixed;inset:0;background:rgba(20,25,40,0.45);z-index:100000;display:flex;align-items:center;justify-content:center;';
  ov.onclick=function(e){ if(e.target===ov) _expTrashClose(); };
  const rows=items.length?items.map(function(it){
    const kc=(it.kind==='req')?'#2d6fd4':'#00a872'; const kl=(it.kind==='req')?'REQ':'TC';
    return '<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid #eef0f4;">'
      +'<span style="font-size:10px;font-weight:800;color:#fff;background:'+kc+';border-radius:7px;padding:2px 8px;flex-shrink:0;">'+kl+'</span>'
      +'<div style="flex:1;min-width:0;"><div style="font-size:12.5px;font-weight:600;color:#1c1f27;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(it.name||it.id)+'</div><div style="font-size:10.5px;color:#8a93a5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(it.id)+' · 삭제 '+esc((it.deleted_at||'').replace("T"," "))+(it.tc_count?(' · TC '+it.tc_count+'개 포함'):'')+'</div></div>'
      +'<button onclick="expTrashRestore(\''+it.trash_id+'\')" style="font-size:11.5px;font-weight:700;padding:5px 12px;border-radius:7px;border:1px solid #00a872;background:rgba(0,168,114,0.08);color:#00875a;cursor:pointer;flex-shrink:0;"><i class="ti ti-restore"></i> 복원</button>'
      +'<button onclick="expTrashPurge(\''+it.trash_id+'\')" title="영구 삭제" style="font-size:11.5px;padding:5px 9px;border-radius:7px;border:1px solid #f0c2cb;background:#fff;color:#c0392b;cursor:pointer;flex-shrink:0;"><i class="ti ti-trash-x"></i></button>'
    +'</div>';
  }).join(''):'<div style="padding:40px;text-align:center;color:#8a93a5;font-size:13px;"><i class="ti ti-trash-off" style="font-size:32px;opacity:0.3;display:block;margin-bottom:8px;"></i>휴지통이 비어 있습니다</div>';
  ov.innerHTML='<div style="background:#fff;border-radius:14px;width:580px;max-width:92vw;max-height:82vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.3);overflow:hidden;">'
    +'<div style="display:flex;align-items:center;gap:9px;padding:14px 18px;border-bottom:1px solid #eef0f4;"><i class="ti ti-trash" style="color:#64748b;font-size:19px;"></i><span style="font-size:15px;font-weight:800;color:#1a2236;">휴지통 — 삭제한 REQ/TC 복원</span><span style="flex:1;"></span><i class="ti ti-x" onclick="_expTrashClose()" style="cursor:pointer;font-size:20px;color:#8a93a5;"></i></div>'
    +'<div style="flex:1;overflow-y:auto;">'+rows+'</div>'
    +'<div style="padding:9px 16px;border-top:1px solid #eef0f4;font-size:11px;color:#8a93a5;">REQ 복원 시 딸린 TC까지 함께 되살아납니다. 영구 삭제는 되돌릴 수 없습니다.</div>'
  +'</div>';
  document.body.appendChild(ov);
}
function _expTrashClose(){ const o=document.getElementById('exp-trash-ov'); if(o) o.remove(); }
async function expTrashRestore(tid){
  try{ const r=await fetch('/api/trash/restore/'+encodeURIComponent(tid),{method:'POST'}); const d=await r.json(); if(!d||!d.success){ if(typeof showToast==='function')showToast('복원 실패'); return; } }catch(e){ if(typeof showToast==='function')showToast('복원 오류: '+e.message); return; }
  try{ if(typeof loadREQData==='function') await loadREQData(true); }catch(e){}
  try{ if(typeof loadTCData==='function') await loadTCData(true); }catch(e){}
  if(typeof renderExplorer==='function') renderExplorer();
  if(typeof showToast==='function')showToast('✅ 복원 완료');
  expTrashOpen();
}
async function expTrashPurge(tid){
  if(!confirm('이 항목을 휴지통에서 영구 삭제할까요? (되돌릴 수 없습니다)')) return;
  try{ await fetch('/api/trash/'+encodeURIComponent(tid),{method:'DELETE'}); }catch(e){}
  expTrashOpen();
}
// 트리 세로 가이드 선 (실선 + 엘보 ├ └) — pathLast[j]=조상 j가 마지막 자식인지
function expGuides(pathLast){
  if(!pathLast||!pathLast.length) return '';
  var C='#d2d7de', h='';
  for(var j=0;j<pathLast.length;j++){
    var isLast=pathLast[j], conn=(j===pathLast.length-1);
    if(!conn){
      h+= isLast ? '<span style="flex:0 0 16px;align-self:stretch;"></span>'
        : '<span style="flex:0 0 16px;align-self:stretch;position:relative;"><span style="position:absolute;left:8px;top:0;bottom:0;border-left:1px solid '+C+';"></span></span>';
    } else {
      var top='<span style="position:absolute;left:8px;top:0;height:50%;border-left:1px solid '+C+';"></span>';
      var bot= isLast ? '' : '<span style="position:absolute;left:8px;top:50%;bottom:0;border-left:1px solid '+C+';"></span>';
      var tick='<span style="position:absolute;left:8px;top:50%;width:6px;border-top:1px solid '+C+';"></span>';
      h+='<span style="flex:0 0 16px;align-self:stretch;position:relative;">'+top+bot+tick+'</span>';
    }
  }
  return h;
}
function expFolderHtml(f,depth,pathLast){
  pathLast=pathLast||[];
  const childFolders=reqFolders.filter(c=>c.parent===f.id).sort((a,b)=>(a.order||0)-(b.order||0)).filter(expFolderVisible);
  const reqs=expSortReqs(reqList.filter(r=>r.folder===f.id).filter(expReqVisible));
  const open=expExpanded.has('f-'+f.id)||!!expSearch||expView==='tc';
  const indent=depth*14;
  expFlatOrder.push({type:'folder',id:f.id});
  // 개수 배지는 하위 폴더 전체를 합산 (상위 폴더에도 누적 표기)
  const _aggIds=new Set(expFolderDescendantIds(f.id));
  const folderReqs=reqList.filter(r=>_aggIds.has(r.folder));
  const reqCnt=folderReqs.length;
  const tcCnt=folderReqs.reduce((s,rr)=>s+expReqTCs(rr).length,0);
  const hasChildren=childFolders.length||reqs.length;
  const fsel=(typeof expSel!=='undefined'&&expSel&&expSel.type==='folder'&&expSel.id===f.id);
  const fbg=fsel?'rgba(232,168,60,0.16)':'';
  const row='<div class="exp-row" draggable="true" ondragstart="expFolderDragStart(event,\''+f.id+'\')" onclick="expRowClick(\'folder\',\''+f.id+'\',event)" oncontextmenu="expFolderMenu(event,\''+f.id+'\')" ondragover="event.preventDefault();event.stopPropagation();this.style.background=\'rgba(45,111,212,0.15)\'" ondragleave="this.style.background=\''+fbg+'\'" ondrop="expDropOnFolder(event,\''+f.id+'\')" title="클릭: 폴더 내용 보기 · 우클릭: 메뉴 · 드래그: 이동" style="display:flex;align-items:center;gap:6px;padding:0 8px;min-height:24px;border-radius:6px;cursor:pointer;font-size:11px;color:var(--text2);background:'+fbg+';" onmouseenter="this.style.background=\'rgba(0,0,0,0.03)\'" onmouseleave="this.style.background=\''+fbg+'\'">'
    +expGuides(pathLast)
    /* 체크박스 제거 — 다중선택은 Ctrl/Shift+클릭 */
    +(hasChildren?'<i class="ti ti-chevron-right" onclick="event.stopPropagation();expToggle(\'f-'+f.id+'\')" title="펼치기/접기" style="font-size:12px;flex-shrink:0;color:var(--text3);transition:transform 0.15s;cursor:pointer;'+(open?'transform:rotate(90deg)':'')+'"></i>':'<span style="width:12px;flex-shrink:0;"></span>')
    +'<i class="ti ti-folder'+(open?'-open':'')+'" style="font-size:16px;color:#e8a83c;flex-shrink:0;"></i>'
    +'<span ondblclick="event.stopPropagation();expRenameFolder(\''+f.id+'\')" title="더블클릭으로 이름 변경" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;">'+f.name+'</span>'
    +'<span style="display:flex;gap:4px;flex-shrink:0;align-items:center;">'
      +(reqCnt?'<span style="font-size:10px;font-weight:700;color:#c98a1e;background:rgba(232,168,60,0.16);border-radius:8px;padding:1px 7px;">REQ '+reqCnt+'</span>':'')
      +(tcCnt?'<span style="font-size:10px;font-weight:700;color:var(--blue);background:rgba(45,111,212,0.1);border-radius:8px;padding:1px 7px;">TC '+tcCnt+'</span>':'')
    +'</span>'
    +'</div>';
  let child='';
  if(open){
    const kids=[];
    childFolders.forEach(c=>kids.push({k:'f',o:c}));
    if(expView==='tc'){ reqs.forEach(r=>expSortTcs(expReqTCs(r).filter(expTcShown)).forEach(t=>kids.push({k:'t',o:t}))); }
    else { reqs.forEach(r=>kids.push({k:'r',o:r})); }
    child=kids.map((it,i)=>{ const cpl=pathLast.concat(i===kids.length-1); return it.k==='f'?expFolderHtml(it.o,depth+1,cpl):(it.k==='r'?expReqHtml(it.o,depth+1,cpl):expTcHtml(it.o,depth+1,cpl)); }).join('');
  }
  const dropZone='<div ondragover="event.preventDefault();event.stopPropagation();this.style.height=\'12px\';this.style.background=\'var(--blue)\';" ondragleave="this.style.height=\'5px\';this.style.background=\'transparent\';" ondrop="expFolderDropBetween(event,\''+f.id+'\');this.style.height=\'2px\';this.style.background=\'transparent\';" style="height:2px;border-radius:3px;margin:0 6px 0 '+(8+pathLast.length*16)+'px;transition:all 0.1s;"></div>';
  return '<div>'+dropZone+row+child+'</div>';
}

function expReqHtml(r,depth,pathLast){
  pathLast=pathLast||[];
  const tcs=expSortTcs(expReqTCs(r).filter(expTcShown));
  const showTC=expView!=='req';
  const open=showTC&&(expExpanded.has('r-'+r.id)||expView==='tc'||!!expSearch);
  const sel=expSel.type==='req'&&expSel.id===r.id;
  const indent=depth*14;
  expFlatOrder.push({type:'req',id:r.id});
  const hasTC=showTC&&tcs.length;
  const msel=(typeof expSelReq!=='undefined'&&expSelReq.has(r.id));   // 다중선택(Ctrl/Shift)
  const bg=sel?'rgba(45,111,212,0.12)':(msel?'rgba(45,111,212,0.16)':'');
  const row='<div class="exp-row"'+(sel?' id="exp-sel-row"':'')+' draggable="true" ondragstart="expDragStart(event,\''+r.id+'\')" oncontextmenu="expReqMenu(event,\''+r.id+'\')" ondragover="expReqDragOver(event,this)" ondragleave="this.style.background=\''+bg+'\'" ondrop="expDropOnReq(event,\''+r.id+'\')" title="클릭: 열기 · Ctrl/Shift+클릭: 다중선택 · 우클릭: 메뉴 · 드래그: 이동" style="display:flex;align-items:center;gap:6px;padding:0 8px;min-height:24px;border-radius:6px;background:'+bg+';font-size:11px;'+(msel?'box-shadow:inset 2px 0 0 var(--blue);':'')+'">'
    +expGuides(pathLast)
    /* 체크박스 제거 — 다중선택은 Ctrl/Shift+클릭 */
    +(hasTC?'<i class="ti ti-chevron-right" onclick="event.stopPropagation();expToggle(\'r-'+r.id+'\')" style="font-size:12px;flex-shrink:0;cursor:pointer;color:var(--text3);transition:transform 0.15s;'+(open?'transform:rotate(90deg)':'')+'"></i>':'<span style="width:12px;flex-shrink:0;"></span>')
    +'<span onclick="expRowClick(\'req\',\''+r.id+'\',event)" style="flex:1;display:flex;align-items:center;gap:8px;min-width:0;cursor:pointer;">'
      +'<span style="font-family:monospace;font-size:11px;font-weight:600;color:var(--text3);white-space:nowrap;flex-shrink:0;">'+expDispId(r.reqid)+'</span>'
      +'<span ondblclick="event.stopPropagation();expEditTitleFromTree(\'req\',\''+r.id+'\')" title="더블클릭으로 제목 수정" style="font-size:12px;font-weight:600;color:var(--blue);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+(r.title||'')+'</span>'
    +'</span>'
    +(showTC?'<span style="font-size:10px;font-weight:700;color:var(--blue);background:rgba(45,111,212,0.1);border-radius:8px;padding:1px 7px;flex-shrink:0;">TC '+expReqTCs(r).length+'</span>':'')
    +'</div>';
  const child=open?tcs.map((t,i)=>expTcHtml(t,depth+1,pathLast.concat(i===tcs.length-1))).join(''):'';
  return '<div>'+row+child+'</div>';
}

function expTcHtml(t,depth,pathLast){
  pathLast=pathLast||[];
  const sel=expSel.type==='tc'&&expSel.id===t.tcid;
  const indent=depth*14;
  expFlatOrder.push({type:'tc',id:t.tcid});
  const steps=((t.checks||[]).filter(c=>(c.kind||'cli')==='cli').length)||(t.steps||[]).length;
  const _it=(t.issue_list||[]).length; const _io=(t.issue_list||[]).filter(function(x){return !/clos|reject|resolv|done|fixed|완료|해결/i.test(String(x.status||''));}).length;   // 버그 미해결/전체
  const msel=(typeof expSelTc!=='undefined'&&expSelTc.has(t.tcid));   // 다중선택(Ctrl/Shift)
  const bg=sel?'rgba(0,168,114,0.14)':(msel?'rgba(0,168,114,0.16)':'');
  return '<div class="exp-row"'+(sel?' id="exp-sel-row"':'')+' draggable="true" ondragstart="expTcDragStart(event,\''+t.tcid+'\')" onclick="expRowClick(\'tc\',\''+t.tcid+'\',event)" oncontextmenu="expTcMenu(event,\''+t.tcid+'\')" title="클릭: 열기 · Ctrl/Shift+클릭: 다중선택 · 우클릭: 메뉴 · 드래그: 이동" style="display:flex;align-items:center;gap:6px;padding:0 8px;min-height:24px;border-radius:6px;cursor:pointer;font-size:11px;background:'+bg+';'+(msel?'box-shadow:inset 2px 0 0 var(--green);':'')+'">'
    +expGuides(pathLast)
    /* 체크박스 제거 — 다중선택은 Ctrl/Shift+클릭 */
    +'<span style="flex:1;display:flex;flex-direction:column;min-width:0;line-height:1.25;">'
      +'<span style="font-family:monospace;font-size:9px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="'+String(t.tcid||'').replace(/"/g,'&quot;')+'">'+(t.tcid||'')+'</span>'
      +'<span ondblclick="event.stopPropagation();expEditTitleFromTree(\'tc\',\''+t.tcid+'\')" title="더블클릭으로 제목 수정" style="font-size:12px;font-weight:600;color:var(--green);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+(t.name||'')+'</span>'
    +'</span>'
    +(_it?'<span title="미해결 '+_io+' / 전체 '+_it+' (close·reject=해결)" style="font-size:10px;font-weight:700;color:#fff;background:'+(_io?'#c0392b':'#00875a')+';border-radius:8px;padding:1px 6px;flex-shrink:0;display:inline-flex;align-items:center;gap:2px;"><i class="ti ti-bug" style="font-size:10px;"></i>'+_io+'/'+_it+'</span>':'')
    +'<span style="font-size:10px;font-weight:700;color:var(--green);background:rgba(0,168,114,0.12);border-radius:8px;padding:1px 7px;flex-shrink:0;">'+steps+' step</span>'
    +'</div>';
}

function _expFolderAncestors(folderId){ const ids=[]; let cur=(reqFolders||[]).find(f=>f.id===folderId); let g=0; while(cur&&g++<60){ ids.push(cur.id); cur=cur.parent?(reqFolders||[]).find(f=>f.id===cur.parent):null; } return ids; }
function expRevealReq(id){ const r=(reqList||[]).find(x=>x.id===id); if(!r)return; _expFolderAncestors(r.folder).forEach(fid=>expExpanded.add('f-'+fid)); }
function expRevealTc(tcid){ const r=(reqList||[]).find(x=>(x.tc||[]).some(ref=>ref.tcid===tcid)); if(!r)return; _expFolderAncestors(r.folder).forEach(fid=>expExpanded.add('f-'+fid)); expExpanded.add('r-'+r.id); }
function _expScrollSelIntoView(){ setTimeout(function(){ const el=document.getElementById('exp-sel-row'); if(el&&el.scrollIntoView){ try{ el.scrollIntoView({block:'center',behavior:'smooth'}); }catch(e){ el.scrollIntoView(); } } },140); }
function _expSetHash(type,id){ try{ history.replaceState(null,'',location.pathname+'#'+type+'='+encodeURIComponent(id)); }catch(e){ try{ location.hash=type+'='+encodeURIComponent(id); }catch(_){} } }
function _expClearHash(){ try{ if(location.hash) history.replaceState(null,'',location.pathname+location.search); }catch(e){} }
function expSelectREQ(id){ expSel={type:'req',id}; _expSetHash('req',id); expRevealReq(id); renderExplorer(); expRenderREQDetail(id); _expScrollSelIntoView(); setTimeout(function(){ try{ expNormalizeReqTcIds(id,true); }catch(e){} },60); }   // REQ 열면 그 REQ의 TC ID를 경로기준으로 자동 정리(접두어 불일치 stale TC 교정)
function expSelectTC(tcid){ expSel={type:'tc',id:tcid}; _expSetHash('tc',tcid); expRevealTc(tcid); renderExplorer(); expRenderTCDetail(tcid); _expScrollSelIntoView(); }
function expSelectFolder(id){ expExpanded.add('f-'+id); expSel={type:'folder',id}; _expClearHash(); renderExplorer(); expRenderFolderDetail(id); }
// ── REQ/TC 바로가기 링크 공유 ──
function expCopyLink(type,id){
  const url=location.origin+location.pathname+'#'+type+'='+encodeURIComponent(id);
  const kind=(type==='req'?'REQ':'TC');
  const old=document.getElementById('exp-link-pop'); if(old)old.remove();
  const m=document.createElement('div'); m.id='exp-link-pop'; m.className='modal-overlay'; m.style.display='flex';
  m.innerHTML='<div class="modal" style="width:540px;max-width:94vw;border-radius:12px;overflow:hidden;">'
    +'<div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;background:var(--bg2);"><i class="ti ti-link" style="color:#2d6fd4;"></i><b style="font-size:14px;flex:1;">'+kind+' 바로가기 링크 공유</b><button onclick="document.getElementById(\'exp-link-pop\').remove()" style="width:26px;height:26px;border:none;border-radius:6px;background:var(--bg3);cursor:pointer;"><i class="ti ti-x"></i></button></div>'
    +'<div style="padding:18px;">'
      +'<div style="font-size:12.5px;color:var(--text2);margin-bottom:11px;line-height:1.5;">아래 링크를 복사해 <b>메일·메신저·메모</b>로 전달하세요. 받는 사람이 열면 로그인 후 <b>이 '+kind+'로 바로 이동</b>합니다.</div>'
      +'<div style="display:flex;gap:8px;">'
        +'<input id="exp-link-url" readonly value="'+url.replace(/"/g,'&quot;')+'" onclick="this.select()" style="flex:1;font-size:13px;font-family:monospace;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg3);color:var(--text);outline:none;">'
        +'<button onclick="_expLinkCopyBtn()" style="font-size:13px;font-weight:700;padding:10px 18px;border:none;border-radius:8px;background:#2d6fd4;color:#fff;cursor:pointer;white-space:nowrap;"><i class="ti ti-copy"></i> 복사</button>'
      +'</div>'
      +'<div id="exp-link-msg" style="font-size:12px;color:#00875a;margin-top:10px;min-height:16px;font-weight:600;"></div>'
    +'</div></div>';
  document.body.appendChild(m); m.addEventListener('click',function(e){ if(e.target===m)m.remove(); });
  const inp=document.getElementById('exp-link-url'); if(inp){ inp.focus(); inp.select(); }
}
function _expLinkCopyBtn(){
  const inp=document.getElementById('exp-link-url'); if(!inp)return; const url=inp.value; const msg=document.getElementById('exp-link-msg');
  const done=()=>{ if(msg)msg.textContent='✅ 복사되었습니다 — 붙여넣어 공유하세요'; };
  const fb=()=>{ try{ inp.focus(); inp.select(); document.execCommand('copy'); done(); }catch(e){ if(msg){ msg.style.color='#e53e5a'; msg.textContent='자동 복사 실패 — 위 주소를 직접 선택해 복사하세요'; } } };
  if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(url).then(done,fb); } else fb();
}
function _deepLinkTarget(){ const h=location.hash||''; let m=h.match(/[#&]req=([^&]+)/); if(m) return {type:'req',id:decodeURIComponent(m[1])}; m=h.match(/[#&]tc=([^&]+)/); if(m) return {type:'tc',id:decodeURIComponent(m[1])}; return null; }
function _deepLinkExists(t){ try{ if(t.type==='req') return (typeof reqList!=='undefined')&&reqList.some(r=>r.id===t.id); return (typeof tcList!=='undefined')&&tcList.some(x=>(x.tcid===t.id)||(x.id===t.id)); }catch(e){ return false; } }
let _deepLinkTries=0;
function applyDeepLink(){
  const t=_deepLinkTarget(); if(!t) return;
  if(typeof e3bSelReq!=='undefined'){   // e3b(현재 사용 중인 Requirements & Test Coverage 화면)로 통일 — explorer(구버전)는 더 이상 진입 대상 아님
    if(t.type==='tc' && e3bSelTc===t.id) return;   // 이미 그 TC 선택됨(자기 주소 갱신) → 무시
    if(t.type==='req' && e3bSelReq===t.id && !e3bSelTc) return;
    if(document.getElementById('login-gate')){ if(_deepLinkTries++<120){ setTimeout(applyDeepLink,300); } return; }   // 로그인 대기
    if(!window._deepLinkNav){ window._deepLinkNav=true; try{ if(typeof showPage==='function') showPage('explorer3'); }catch(e){} }   // 진입 = REQ/TC 데이터 로드 트리거 (1회) — Beta 페이지 제거 후 원본으로 이동
    if(!_deepLinkExists(t)){ if(_deepLinkTries++<60){ setTimeout(applyDeepLink,300); return; } }                     // 데이터 로딩 대기(최대 ~18s)
    _deepLinkTries=0;
    setTimeout(function(){
      try{
        if(t.type==='req'){ if(typeof e3bPickReq==='function') e3bPickReq(t.id); }
        else {
          var tc=(typeof tcList!=='undefined'?tcList:[]).find(function(x){return (x.tcid===t.id)||(x.id===t.id);});
          if(tc&&tc.req_id&&typeof e3bPickReq==='function') e3bPickReq(tc.req_id);
          if(typeof e3bPickTc==='function') e3bPickTc(t.id);
        }
      }catch(e){}
    },150);
    return;
  }
  if(typeof expSel!=='undefined' && expSel && expSel.type===t.type && String(expSel.id)===String(t.id)) return;   // 이미 그 항목 선택됨(자기 주소 갱신) → 무시
  if(document.getElementById('login-gate')){ if(_deepLinkTries++<120){ setTimeout(applyDeepLink,300); } return; }   // 로그인 대기
  if(!window._deepLinkNav){ window._deepLinkNav=true; try{ if(typeof showPage==='function') showPage('explorer'); }catch(e){} }   // 탐색기 진입 = REQ/TC 데이터 로드 트리거 (1회)
  if(!_deepLinkExists(t)){ if(_deepLinkTries++<60){ setTimeout(applyDeepLink,300); return; } }                     // 데이터 로딩 대기(최대 ~18s)
  _deepLinkTries=0;
  setTimeout(function(){ try{ if(t.type==='req'){ if(typeof expSelectREQ==='function') expSelectREQ(t.id); } else { if(typeof expSelectTC==='function') expSelectTC(t.id); } }catch(e){} },150);
}
window.addEventListener('hashchange', function(){ _deepLinkTries=0; window._deepLinkNav=false; applyDeepLink(); });
window.addEventListener('load', function(){ setTimeout(applyDeepLink, 500); });
function expEmptyDetail(){ return '<div style="flex:1;display:flex;align-items:center;justify-content:center;height:100%;color:var(--text3);font-size:14px;">왼쪽 트리에서 폴더·REQ·TC를 선택하세요</div>'; }

// ── 우클릭 컨텍스트 메뉴 ──
function expCloseCtxMenu(){ const m=document.getElementById('exp-ctx-menu'); if(m) m.remove(); }
function expShowCtxMenu(e, items){
  e.preventDefault(); e.stopPropagation();
  expCloseCtxMenu();
  const real=items.filter(it=>!it.sep);
  const m=document.createElement('div');
  m.id='exp-ctx-menu';
  m.style.cssText='position:fixed;z-index:10000;background:#fff;border:1px solid var(--border);border-radius:9px;box-shadow:0 8px 28px rgba(0,0,0,0.2);padding:5px;min-width:178px;font-size:13px;';
  m.innerHTML=items.map(it=> it.sep
    ?'<div style="height:1px;background:var(--border);margin:4px 8px;"></div>'
    :'<div class="exp-ctx-item" style="display:flex;align-items:center;gap:9px;padding:7px 12px;border-radius:6px;cursor:pointer;color:'+(it.danger?'var(--red)':'var(--text)')+';" onmouseenter="this.style.background=\''+(it.danger?'rgba(229,62,90,0.09)':'var(--bg3)')+'\'" onmouseleave="this.style.background=\'\'"><i class="ti '+it.icon+'" style="font-size:16px;flex-shrink:0;"></i>'+it.label+'</div>'
  ).join('');
  document.body.appendChild(m);
  const mw=m.offsetWidth, mh=m.offsetHeight;
  let x=e.clientX, y=e.clientY;
  if(x+mw>window.innerWidth) x=window.innerWidth-mw-8;
  if(y+mh>window.innerHeight) y=window.innerHeight-mh-8;
  m.style.left=Math.max(6,x)+'px'; m.style.top=Math.max(6,y)+'px';
  Array.from(m.querySelectorAll('.exp-ctx-item')).forEach((el,i)=>{
    el.onclick=(ev)=>{ ev.stopPropagation(); expCloseCtxMenu(); try{ real[i].onclick(); }catch(err){} };
  });
}
document.addEventListener('click', expCloseCtxMenu);
document.addEventListener('scroll', expCloseCtxMenu, true);

function expFolderMenu(e, fid){
  expShowCtxMenu(e, [
    {label:'폴더 열기', icon:'ti-folder-open', onclick:()=>expSelectFolder(fid)},
    {label:'REQ 추가', icon:'ti-file-plus', onclick:()=>expAddREQ(fid)},
    {label:'REQ 일괄 생성', icon:'ti-files', onclick:()=>expBulkAddREQ(fid)},
    {label:'하위 폴더 추가', icon:'ti-folder-plus', onclick:()=>expAddFolder(fid)},
    {label:'이름 변경', icon:'ti-pencil', onclick:()=>expRenameFolder(fid)},
    {sep:true},
    {label:'폴더 삭제', icon:'ti-trash', danger:true, onclick:()=>expDeleteFolder(fid)},
  ]);
}
function expReqMenu(e, reqId){
  expShowCtxMenu(e, [
    {label:'REQ 열기', icon:'ti-file-text', onclick:()=>expSelectREQ(reqId)},
    {label:'TC 추가', icon:'ti-clipboard-plus', onclick:()=>expAddTC(reqId)},
    {label:'TC 일괄 생성', icon:'ti-files', onclick:()=>expBulkAddTC(reqId)},
    {label:'이름 변경', icon:'ti-pencil', onclick:()=>expEditTitleFromTree('req',reqId)},
    {label:'TC ID 경로기준 재정렬', icon:'ti-list-numbers', onclick:()=>expNormalizeReqTcIds(reqId)},
    {label:'REQ 복제 (Clone)', icon:'ti-copy', onclick:()=>expCloneREQ(reqId)},
    {sep:true},
    {label:'REQ 삭제', icon:'ti-trash', danger:true, onclick:()=>expDeleteREQ(reqId)},
  ]);
}
// 트리 빈 여백 우클릭 → 현재 선택 항목(경로) 기준으로 생성
function expEmptyMenu(e){
  let folderId=null, reqId=null, label='(루트)';
  try{
    if(typeof expSel!=='undefined'&&expSel){
      if(expSel.type==='folder'){ folderId=expSel.id; }
      else if(expSel.type==='req'){ const r=reqList.find(x=>x.id===expSel.id||x.reqid===expSel.id); if(r){ folderId=r.folder; reqId=r.id; } }
      else if(expSel.type==='tc'){ const t=tcList.find(x=>(x.tcid===expSel.id)||(x.id===expSel.id)); if(t){ const r=reqList.find(rr=>rr.id===t.req_id)||reqList.find(rr=>(rr.tc||[]).some(tt=>(tt.tcid||tt.id)===(t.tcid||t.id))); if(r){ folderId=r.folder; reqId=r.id; } } }
    }
  }catch(_){}
  if(!folderId){ const root=reqFolders.find(f=>!f.parent); if(root) folderId=root.id; }
  const fobj=reqFolders.find(f=>f.id===folderId); if(fobj) label=fobj.name;
  const items=[];
  if(reqId){ const rr=reqList.find(x=>x.id===reqId); items.push({label:'TC 추가 → '+((rr&&(rr.reqid||rr.title))||'REQ'), icon:'ti-clipboard-plus', onclick:()=>expAddTC(reqId)}); }
  items.push({label:'REQ 추가 → '+label, icon:'ti-file-plus', onclick:()=>expAddREQ(folderId)});
  items.push({label:'REQ 일괄 생성', icon:'ti-files', onclick:()=>expBulkAddREQ(folderId)});
  items.push({sep:true});
  items.push({label:'하위 폴더 추가 → '+label, icon:'ti-folder-plus', onclick:()=>expAddFolder(folderId)});
  expShowCtxMenu(e, items);
}
function expTcMenu(e, tcid){
  expShowCtxMenu(e, [
    {label:'TC 열기', icon:'ti-checkbox', onclick:()=>expSelectTC(tcid)},
    {label:'이름 변경', icon:'ti-pencil', onclick:()=>expEditTitleFromTree('tc',tcid)},
    {label:'TC ID 수정', icon:'ti-id', onclick:()=>tcRenameId(tcid)},
    {label:'TC 복제 (Clone)', icon:'ti-copy', onclick:()=>expCloneTC(tcid)},
    {sep:true},
    {label:'TC 삭제', icon:'ti-trash', danger:true, onclick:()=>expDeleteTC(tcid)},
  ]);
}

// 폴더 + 모든 하위 폴더 id 수집
function expFolderDescendantIds(fid){
  const out=[fid];
  reqFolders.filter(c=>c.parent===fid).forEach(c=>{ out.push.apply(out, expFolderDescendantIds(c.id)); });
  return out;
}

// 폴더 클릭 시 2열에 REQ → TC 목록 표시
function expRenderFolderDetail(folderId){
  const f=reqFolders.find(x=>x.id===folderId);
  const wrap=document.getElementById('exp-detail');
  if(!f||!wrap){ if(wrap) wrap.innerHTML=expEmptyDetail(); return; }
  const COL='#e8a83c';
  const fids=expFolderDescendantIds(folderId);
  const reqs=expSortReqs(reqList.filter(r=>fids.includes(r.folder)));
  const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  let totalTC=0;
  const reqCell=r=>'<td onclick="expSelectREQ(\''+r.id+'\')" rowspan="@RS@" style="padding:8px 12px;border-bottom:1px solid #eef0f3;border-right:1px solid #eef0f3;vertical-align:top;cursor:pointer;@RBG@" onmouseenter="this.style.background=\'rgba(45,111,212,0.06)\'" onmouseleave="this.style.background=\'@RBGV@\'">'
    +'<div style="font-family:monospace;font-size:13px;font-weight:700;color:var(--text2);white-space:nowrap;">'+esc(expDispId(r.reqid))+'</div></td>'
    +'<td onclick="expSelectREQ(\''+r.id+'\')" rowspan="@RS@" style="padding:8px 12px;border-bottom:1px solid #eef0f3;border-right:1px solid #eef0f3;vertical-align:top;cursor:pointer;font-size:12px;color:var(--blue);font-weight:600;white-space:nowrap;@RBG@" onmouseenter="this.style.background=\'rgba(45,111,212,0.06)\'" onmouseleave="this.style.background=\'@RBGV@\'">'+esc(r.title)+'</td>';
  const rows=reqs.map(r=>{
    const tcs=expSortTcs(expReqTCs(r));
    totalTC+=tcs.length;
    const rs=Math.max(1,tcs.length);
    const rbg=''; // 기본 흰색
    const rc=reqCell(r).replace(/@RS@/g,rs).replace(/@RBG@/g,rbg?('background:'+rbg+';'):'').replace(/@RBGV@/g,rbg||'');
    if(!tcs.length){
      return '<tr>'+rc+'<td style="padding:8px 12px;border-bottom:1px solid #eef0f3;border-right:1px solid #eef0f3;font-size:13px;color:var(--text3);">-</td>'
        +'<td style="padding:8px 12px;border-bottom:1px solid #eef0f3;font-size:13px;color:var(--text3);">연결된 TC 없음</td></tr>';
    }
    return tcs.map((t,i)=>{
      const tcCells='<td onclick="expSelectTC(\''+t.tcid+'\')" style="padding:8px 12px;border-bottom:1px solid #eef0f3;border-right:1px solid #eef0f3;vertical-align:top;cursor:pointer;" onmouseenter="this.parentNode.style.background=\'rgba(0,168,114,0.06)\'" onmouseleave="this.parentNode.style.background=\'\'">'
          +'<div style="font-family:monospace;font-size:13px;font-weight:600;color:var(--text2);white-space:nowrap;">'+esc(expDispId(t.tcid))+'</div></td>'
        +'<td onclick="expSelectTC(\''+t.tcid+'\')" style="padding:8px 12px;border-bottom:1px solid #eef0f3;vertical-align:top;cursor:pointer;font-size:12px;color:var(--green);font-weight:600;white-space:nowrap;" onmouseenter="this.parentNode.style.background=\'rgba(0,168,114,0.06)\'" onmouseleave="this.parentNode.style.background=\'\'">'+esc(t.name)+'</td>';
      return '<tr>'+(i===0?rc:'')+tcCells+'</tr>';
    }).join('');
  }).join('');
  const table=reqs.length?(
    '<table style="width:auto;table-layout:auto;border-collapse:collapse;border:1px solid #eef0f3;font-size:13px;">'
    +'<thead><tr style="background:#fafbfc;">'
      +'<th style="padding:9px 12px;text-align:left;font-size:13px;font-weight:700;color:var(--text3);border-bottom:2px solid var(--border);border-right:1px solid #eef0f3;white-space:nowrap;">REQ ID</th>'
      +'<th style="padding:9px 12px;text-align:left;font-size:13px;font-weight:700;color:var(--text3);border-bottom:2px solid var(--border);border-right:1px solid #eef0f3;white-space:nowrap;">REQ Summary</th>'
      +'<th style="padding:9px 12px;text-align:left;font-size:13px;font-weight:700;color:var(--text3);border-bottom:2px solid var(--border);border-right:1px solid #eef0f3;white-space:nowrap;">TC ID</th>'
      +'<th style="padding:9px 12px;text-align:left;font-size:13px;font-weight:700;color:var(--text3);border-bottom:2px solid var(--border);white-space:nowrap;">TC Summary</th>'
    +'</tr></thead><tbody>'+rows+'</tbody></table>'
  ):'<div style="padding:48px;text-align:center;color:var(--text3);font-size:14px;"><i class="ti ti-folder-off" style="font-size:38px;opacity:0.3;display:block;margin-bottom:12px;"></i>이 폴더에 REQ가 없습니다.</div>';

  wrap.innerHTML='<div style="display:flex;flex-direction:column;height:100%;width:100%;background:#fff;">'
    +'<div style="padding:14px 22px;border-bottom:1px solid var(--border);background:#fff;flex-shrink:0;">'
      +'<span style="font-size:10px;font-weight:700;color:#fff;background:'+COL+';border-radius:4px;padding:1px 7px;">폴더</span>'
      +'<div style="display:flex;align-items:center;gap:10px;margin-top:6px;">'
        +'<i class="ti ti-folder-open" style="font-size:22px;color:'+COL+';"></i>'
        +'<span style="font-size:18px;font-weight:700;color:var(--text);">'+esc(f.name)+'</span>'
      +'</div>'
      +'<div style="margin-top:6px;font-size:12px;color:var(--text3);">REQ '+reqs.length+'개 · TC '+totalTC+'개</div>'
    +'</div>'
    +'<div style="flex:1;overflow:auto;min-width:0;"><div style="padding:16px 22px;display:inline-block;min-width:100%;box-sizing:border-box;">'+table+'</div></div>'
  +'</div>';
}

function expToggleTree(show){ const col=document.getElementById('exp-tree-col'); if(!col) return; if(show){ col.style.display=''; if(!col.style.width||col.style.width==='0px') col.style.width='700px'; } else { col.style.display='none'; } }
function expDetailShell(kind, idText, name, color, rail, curTab, onclicks, contentHtml, pdfJs, headExtra, pptxJs, shareJs, linkJs, footerExtra, noTree, noHead, collapseJs){
  const tabsHtml=rail.map((t,i)=>'<button onclick="'+onclicks[i]+'" title="'+t.label+'" style="position:relative;display:inline-flex;align-items:center;gap:5px;padding:9px 12px;cursor:pointer;border:none;background:transparent;border-bottom:2.5px solid '+(curTab===t.id?color:'transparent')+';color:'+(curTab===t.id?color:'var(--text3)')+';font-size:13px;font-weight:'+(curTab===t.id?'800':'600')+';white-space:nowrap;" onmouseenter="if(this.style.borderBottomColor===\'transparent\')this.style.color=\'var(--text2)\'" onmouseleave="if(this.style.borderBottomColor===\'transparent\')this.style.color=\'var(--text3)\'">'
    +'<i class="ti '+t.icon+'" style="font-size:17px;"></i><span>'+t.label+'</span>'
    +((t.badge!==undefined&&t.badge!==null&&t.badge!=='')?'<span style="font-size:9px;font-weight:800;background:'+color+';color:#fff;border-radius:8px;padding:1px 5px;min-width:14px;height:14px;line-height:12px;text-align:center;margin-left:-1px;">'+t.badge+'</span>':'')
    +'</button>').join('');
  const treeBtns=noTree?'':'<div style="display:flex;align-items:center;gap:4px;padding-right:10px;margin-right:4px;border-right:1px solid var(--border);flex-shrink:0;align-self:stretch;padding-top:4px;padding-bottom:5px;">'
    +'<button onclick="expToggleTree(false)" title="좌측 트리 접기" style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;border:1px solid var(--border);border-radius:6px;background:#fff;color:var(--text2);cursor:pointer;font-size:14px;" onmouseenter="this.style.background=\'var(--bg3)\'" onmouseleave="this.style.background=\'#fff\'"><i class="ti ti-layout-sidebar-left-collapse"></i></button>'
    +'<button onclick="expToggleTree(true)" title="좌측 트리 펼치기" style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;border:1px solid var(--border);border-radius:6px;background:#fff;color:var(--text2);cursor:pointer;font-size:14px;" onmouseenter="this.style.background=\'var(--bg3)\'" onmouseleave="this.style.background=\'#fff\'"><i class="ti ti-layout-sidebar-left-expand"></i></button>'
    +'</div>';
  const tabBar='<div style="display:flex;align-items:center;gap:1px;padding:0 14px;background:#fafbfc;border-bottom:1px solid var(--border);flex-shrink:0;overflow-x:auto;">'+treeBtns+tabsHtml+'</div>';
  return '<div style="display:flex;flex-direction:column;height:100%;width:100%;">'
      +(noHead?'':'<div class="e3-detail-hdr" style="padding:14px 22px 14px '+(collapseJs?'64px':'22px')+';border-bottom:1px solid var(--border);background:#fff;flex-shrink:0;position:relative;">'
        +'<span style="font-size:10px;font-weight:700;color:#fff;background:'+color+';border-radius:4px;padding:1px 7px;">'+kind+'</span>'
        // TC/REQ ID — 드래그 선택 + Ctrl+C 복사만 허용, 수정 불가.
        // draggable="false" 로 부모 헤더의 도킹 드래그를 자식으로 전파되지 않게 하고,
        // mousedown/dragstart/selectstart 를 모두 stopPropagation 으로 잡아 텍스트 선택이 확실히 되도록 함.
        +'<span title="드래그로 선택 · Ctrl+C 복사" draggable="false" onmousedown="event.stopPropagation()" ondragstart="event.stopPropagation();event.preventDefault();return false;" onselectstart="event.stopPropagation()" style="font-family:monospace;font-size:12px;font-weight:700;color:'+color+';margin-left:8px;user-select:text !important;-webkit-user-select:text !important;-moz-user-select:text !important;cursor:text;">'+idText+'</span>'
        +'<div id="exp-detail-title" contenteditable="true" title="클릭해서 제목 수정 (Enter로 저장)" onfocus="this.style.borderColor=\'var(--blue)\';this.style.background=\'#fff\'" onblur="this.style.borderColor=\'transparent\';this.style.background=\'transparent\';expSaveDetailTitle(this.innerText)" onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur();}" style="font-size:18px;font-weight:700;color:var(--text);margin-top:4px;outline:none;border:1px solid transparent;border-radius:5px;padding:2px 6px;">'+(name||'')+'</div>'
        // 열 접기 버튼(chevrons-right)만 왼쪽 상단으로 분리 배치. 화살표도 왼쪽 방향으로 (chevrons-left).
        +(collapseJs?'<div style="position:absolute;top:12px;left:22px;display:flex;align-items:center;gap:8px;">'
          +'<button onclick="'+collapseJs+'" title="상세 열 접기" style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:7px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;" onmouseenter="this.style.borderColor=\'#e8820c\';this.style.color=\'#e8820c\';" onmouseleave="this.style.borderColor=\'var(--border)\';this.style.color=\'var(--text2)\';"><i class="ti ti-chevrons-right" style="font-size:16px;"></i></button>'
        +'</div>':'')
        // 우측 상단 링크/PPTX/PDF 버튼 제거(사용자 요청 · 2026-07-24) — 필요 시 다른 경로로 접근 가능
        /* 상세 헤더 공유 버튼 제거 — PDF 미리보기의 [공유]로 일원화 */
        +(headExtra?'<div style="position:absolute;top:13px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:30px;max-width:60%;">'+headExtra+'</div>':'')
      +'</div>')
      +tabBar
      +'<div data-exp-scroll="1" style="flex:1;overflow-y:auto;min-width:0;"><div style="padding:16px 22px;">'+contentHtml+'</div></div>'
      +''   /* 하단 상태바 제거 (사용자 요청) */
  +'</div>';
}

function expRenderREQDetail(reqid){
  const r=reqList.find(x=>x.id===reqid);
  const wrap=document.getElementById('exp-detail');
  if(!r||!wrap){ if(wrap) wrap.innerHTML=expEmptyDetail(); return; }
  const tcCount=expReqTCs(r).length;
  const tab=window['expReqTab_'+reqid]||'tc';
  const rail=[
    {id:'details',icon:'ti-info-circle',label:'Info'},
    {id:'scenario',icon:'ti-file-text',label:'Description'},
    {id:'impl',icon:'ti-code',label:'Implementation'},
    {id:'tc',icon:'ti-clipboard-check',label:'TC',badge:tcCount||''},
    {id:'issues',icon:'ti-bug',label:'Issues'},
  ];
  wrap.innerHTML=expDetailShell('REQ', expDispId(r.reqid), r.title||'', 'var(--blue)', rail, tab,
    rail.map(t=>'expSwitchReqTab(\''+reqid+'\',\''+t.id+'\')'),
    req2TabContent(r,tab), 'exportReqPDF(\''+r.id+'\')', '', '', 'shareReqMail(\''+r.id+'\')', 'expCopyLink(\'req\',\''+r.id+'\')');
  if(tab==='scenario'){
    req2DestroyTiny(r.id);
    setTimeout(()=>req2InitTiny(r.id),160);
    const topo=document.getElementById('req2-sc-topo-'+r.id);
    if(topo){ topo.innerHTML=renderTopoEditor(r); setTimeout(()=>topoDrawioInit(r.id),220); }
  } else if(tab==='impl'){
    req2DestroyTiny(r.id);
    setTimeout(()=>req2InitTinyImpl(r.id),160);
  }
}
function expSwitchReqTab(reqid,tab){ window['expReqTab_'+reqid]=tab; expRenderREQDetail(reqid); }

function expRenderTCDetail(tcid){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid));
  const wrap=document.getElementById('exp-detail');
  if(!tc||!wrap){ if(wrap) wrap.innerHTML=expEmptyDetail(); return; }
  // 사이클 탭 배지/내용용: 사이클 목록이 아직 없으면 1회 백그라운드 로드 후 재렌더
  if(!window._expCycLoaded && typeof loadCycleData==='function' && (typeof cycleList==='undefined'||!Array.isArray(cycleList)||!cycleList.length)){
    window._expCycLoaded=true; loadCycleData().then(()=>expRenderTCDetail(tcid)).catch(()=>{});
  }
  const steps=((tc.checks||[]).filter(x=>(x.kind||'cli')==='cli').length||(tc.steps||[]).length);
  const tab=window['expTcTab_'+tcid]||'procedure';
  const rail=[
    {id:'info',icon:'ti-info-circle',label:'Info'},
    {id:'env',icon:'ti-clipboard-text',label:'Environment'},
    {id:'topo',icon:'ti-topology-star',label:'Topology'},
    {id:'traffic',icon:'ti-antenna',label:'Traffic'},
    {id:'procedure',icon:'ti-list-check',label:'Step',badge:steps||''},
    {id:'issue',icon:'ti-bug',label:'Issues',badge:((tc.issue_list||[]).length?((tc.issue_list||[]).filter(function(x){return !/clos|reject|resolv|done|fixed|완료|해결/i.test(String(x.status||''));}).length+'/'+(tc.issue_list||[]).length):'')},
    {id:'history',icon:'ti-history',label:'History',badge:(tc.result_history||[]).length||''},
    {id:'cycle',icon:'ti-recycle',label:'Cycle',badge:((typeof cycleList!=='undefined'&&Array.isArray(cycleList))?cycleList.filter(cy=>(cy.items||[]).some(it=>(it.tcid===(tc.tcid||tc.id))||(it.id===(tc.tcid||tc.id)))).length:0)||''},
  ];
  var _fh=(tc.result_history&&tc.result_history[0])||null;
  var _tcFoot=(steps?steps+'단계':'')+(tc.status?(' · 상태 '+tc.status):'')+(_fh?(' · 최근 '+(_fh.result||'')+' '+String(_fh.date||'').slice(0,10)):'');
  // 재렌더 전 스크롤 위치 저장(맨 위로 튐 방지) — 바깥 data-exp-scroll + 안쪽 절차 테이블 .stepTbl 2겹
  var _pScs=wrap.querySelectorAll('[data-exp-scroll], .stepTbl'); var _pTops=[]; _pScs.forEach(function(el){ _pTops.push(el.scrollTop); });
  wrap.innerHTML=expDetailShell('TC', expDispId(tc.tcid), tc.name||'', 'var(--green)', rail, tab,
    rail.map(t=>'expSwitchTcTab(\''+tcid+'\',\''+t.id+'\')'),
    tcTabContent(tc,tab), 'exportTCPDF(\''+tc.tcid+'\')', _procHeadBar(tcid), 'exportTCPPTX(\''+tc.tcid+'\')', 'shareTcMail(\''+tc.tcid+'\')', 'expCopyLink(\'tc\',\''+tc.tcid+'\')', _tcFoot);
  try{ var _nScs=wrap.querySelectorAll('[data-exp-scroll], .stepTbl'); _nScs.forEach(function(el,i){ if(_pTops[i]) el.scrollTop=_pTops[i]; }); }catch(e){}   // 스크롤 복원
  // env 탭은 tcTabContent 내부(tcTabEnv)에서 draw.io 자동 초기화됨
}
async function expSwitchTcTab(tcid,tab){
  window['expTcTab_'+tcid]=tab;
  // 사이클 탭: 사이클 목록이 아직 로드 안 됐으면 불러오기 (이 TC가 포함된 사이클 역조회용)
  if(tab==='cycle'){ try{ if(typeof loadCycleData==='function' && !(typeof cycleList!=='undefined' && cycleList && cycleList.length)) await loadCycleData(); }catch(e){} }
  // 이력·이슈 탭은 서버에서 최신 TC 데이터를 다시 읽어 반영 (전체 실행 결과/이슈 즉시 표시)
  if(tab==='history'||tab==='issue'){
    try{ const r=await fetch('/api/tc/'+_tcUrl(tcid)); if(r.ok){ const d=await r.json(); if(d&&(d.tcid||d.id)){ const i=tcList.findIndex(t=>(t.tcid===tcid)||(t.id===tcid)); if(i>=0) tcList[i]={...tcList[i],...d}; else tcList.push(d); } } }catch(e){}
  }
  expRenderTCDetail(tcid);
}

// 탐색기 1열 폭 드래그 조절
let _expResize=false;
function expResizeStart(e){ _expResize=true; document.body.style.cursor='col-resize'; document.body.style.userSelect='none'; e.preventDefault(); }
document.addEventListener('mousemove',e=>{ if(!_expResize) return; const col=document.getElementById('exp-tree-col'); if(!col) return; const left=col.getBoundingClientRect().left; let w=e.clientX-left; w=Math.max(280,Math.min(820,w)); col.style.width=w+'px'; });
document.addEventListener('mouseup',()=>{ if(_expResize){ _expResize=false; document.body.style.cursor=''; document.body.style.userSelect=''; } });

// ══ Test Suite & Execution (Zephyr Enterprise 스타일) ══
let cycleList=[], cycleFolderList=[], cycleSelFolderId=null, cycleSelCycleId=null;

var _cycleDataLoadedAt=0;
const CYCLE_DATA_CACHE_MS=4000;
var _cycleDataInflight=null;
function invalidateCycleDataCache(){ _cycleDataLoadedAt=0; }
async function loadCycleData(force){
  if(!force && _cycleDataLoadedAt && (Date.now()-_cycleDataLoadedAt)<CYCLE_DATA_CACHE_MS) return;
  // ★ 진행 중 요청 있으면 재사용 — 페이지 초기화 훅 여러 곳에서 병렬 호출해도 API 1회만 실행됨
  if(!force && _cycleDataInflight) return _cycleDataInflight;
  _cycleDataInflight=(async function(){
    try{ const r=await fetch('/api/cycle?meta=1', {cache:'no-store'});const d=await r.json();cycleList=d.cycles||[]; }catch(e){ cycleList=[]; }
    try{ const r=await fetch('/api/cycle-folders');const d=await r.json();cycleFolderList=d.folders||[]; }catch(e){ cycleFolderList=[]; }
    _cycleDataLoadedAt=Date.now();
    // 백그라운드 프리페치
    try{ setTimeout(_cycleStartPrefetch, 800); }catch(_e){}
  })().finally(function(){ _cycleDataInflight=null; });
  return _cycleDataInflight;
}
// 개별 사이클 상세(items의 각 step full 포함) 로드 후 cycleList 요소를 교체.
// 진행 중 요청은 promise 재사용으로 중복 fetch 방지.
var _cycleLoadingPromise={};
window.loadCycleFull=async function(cyid, force){
  var _c=(cycleList||[]).find(function(x){return x.id===cyid;});
  if(_c && _c._full && !force) return _c;
  if(_cycleLoadingPromise[cyid] && !force) return _cycleLoadingPromise[cyid];
  var _p=(async function(){
    try{
      var r=await fetch('/api/cycle/'+encodeURIComponent(cyid));
      if(!r.ok) return _c||null;
      var full=await r.json();
      if(_c){ Object.assign(_c, full); _c._full=true; }
      else { full._full=true; cycleList.push(full); _c=full; }
      return _c;
    }catch(e){ return _c||null; }
    finally{ delete _cycleLoadingPromise[cyid]; }
  })();
  _cycleLoadingPromise[cyid]=_p;
  return _p;
};
// 백그라운드 프리페치: cycle 도 idle 시간에 상세를 미리 로드 → 사이클 클릭 시 즉시 표시
var _cyclePrefetchStarted=false;
function _cycleStartPrefetch(){
  if(_cyclePrefetchStarted) return; _cyclePrefetchStarted=true;
  var _idle=window.requestIdleCallback||function(cb){ return setTimeout(function(){ cb({timeRemaining:function(){return 30;},didTimeout:false}); }, 200); };
  var _queue=[];
  var _fill=function(){ _queue=(cycleList||[]).filter(function(c){return c && c.id && !c._full;}).map(function(c){return c.id;}); };
  _fill();
  var _step=function(deadline){
    var _batch=[];
    while(_queue.length && _batch.length<1 && (!deadline || deadline.timeRemaining()>5)){
      _batch.push(_queue.shift());
    }
    if(!_batch.length){
      if(_queue.length===0) return;
      _idle(_step); return;
    }
    Promise.all(_batch.map(function(cyid){ return loadCycleFull(cyid).catch(function(){}); }))
      .then(function(){
        if(_queue.length===0) return;   // 완료 후 재확인 없이 종료
        _idle(_step);
      });
  };
  _idle(_step);
}
async function saveCycleFolders(){ try{ await fetch('/api/cycle-folders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({folders:cycleFolderList})}); }catch(e){} }
async function saveCycle(c){ try{ await fetch('/api/cycle/'+encodeURIComponent(c.id),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(c)}); }catch(e){} }

// ── 시험 결과 상태 (커스텀: value/color/verdict) ──
const DEFAULT_RESULT_STATUSES=[
  {value:'Pass',color:'#00a872',verdict:'pass'},
  {value:'Fail',color:'#e53e5a',verdict:'fail'},
  {value:'WIP',color:'#f5b731',verdict:'exclude'},
  {value:'Blocked',color:'#e8820c',verdict:'exclude'},
  {value:'진행불가',color:'#999999',verdict:'exclude'},
];
function resultStatuses(){ const r=(typeof customFields!=='undefined'&&Array.isArray(customFields.result))?customFields.result:null; return (r&&r.length)?r:DEFAULT_RESULT_STATUSES; }
function resultMeta(v){ return resultStatuses().find(s=>s.value===v)||null; }
// ══════════════ Test Report (실시간 대시보드) ══════════════
let _rptCharts={};
function _rptCollect(){ const out=[]; (cycleList||[]).forEach(c=>{ const _f=(typeof cycleFolderList!=='undefined'?cycleFolderList:[]).find(x=>x.id===c.folder_id); (c.items||[]).forEach(it=>{ out.push(Object.assign({},it,{_cycle:c.name||c.id||'',_cycleId:c.id,_folder:(_f&&_f.name)||'(미분류)',_model:c.model||'-',_vgroup:c.version_group||'(미분류)',_version:c.version||'',_grp:(c.model||'-')+(c.version?(' '+c.version):'')})); }); }); return out; }
function _rptGroupRows(items, keyFn){ const map={}; items.forEach(function(it){ const k=keyFn(it)||'(기타)'; (map[k]=map[k]||[]).push(it); }); return Object.keys(map).sort(function(a,b){return String(a).localeCompare(String(b),undefined,{numeric:true});}).map(function(k){ return {label:k, stats:cycleCalcStats(map[k])}; }); }
function _rptRollupCard(title, rows){
  const bar=function(s){ return '<div style="flex:1;min-width:80px;height:9px;border-radius:5px;background:#e6e8ec;overflow:hidden;display:flex;"><div style="width:'+s.passRate+'%;background:#00a872;"></div><div style="width:'+s.failRate+'%;background:#e53e5a;"></div></div>'; };
  const body=rows.map(function(r){ const s=r.stats;
    return '<div style="display:flex;align-items:center;gap:10px;padding:7px 12px;border-bottom:1px solid #eef0f3;font-size:12px;">'
      +'<span class="rpt-roll-cell" style="flex:0 0 160px;font-weight:700;color:#2a2f3a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+_bdEsc(r.label)+'</span>'
      +bar(s)
      +'<span style="flex:0 0 42px;text-align:right;font-weight:800;color:#7c3aed;">'+s.progress+'%</span>'
      +'<span style="flex:0 0 158px;text-align:right;font-size:11px;color:var(--text2);">TC '+s.total+' · <span style="color:#00a872;font-weight:700;">✓'+s.pass+'</span> <span style="color:#e53e5a;font-weight:700;">✕'+s.fail+'</span> <span style="color:#9aa3af;">제외'+s.exclude+'</span></span>'
      +'</div>';
  }).join('')||'<div style="padding:16px;color:var(--text3);font-size:12px;">데이터 없음</div>';
  return '<div style="background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:14px;"><div class="rpt-roll-head" style="font-size:12.5px;font-weight:800;padding:10px 12px;background:#f4f6fa;border-bottom:1px solid var(--border);color:#3a4150;">'+title+'</div>'+body+'</div>'; }
function _rptVerdict(it){ const s=cycleItemStatus(it.steps||[]); if(s==='UNEXECUTED') return 'pending'; return resultVerdict(s)||'pending'; }
function _rptItemDate(it){ const st=(it.steps||[]).map(s=>s.executed_at||s.date).filter(Boolean).sort(); return st.length?String(st[st.length-1]).slice(0,10):''; }
function _rptFiltered(){ const F=window._rptF||{}; return _rptCollect().filter(it=>{ if(F.proj&&it._folder!==F.proj)return false; if(F.model&&it._model!==F.model)return false; if(F.vgroup&&it._vgroup!==F.vgroup)return false; if(F.ver&&it._version!==F.ver)return false; if(F.severity&&(it.severity||'')!==F.severity)return false; if(F.req&&it.req_id!==F.req)return false; if(F.verdict&&_rptVerdict(it)!==F.verdict)return false; return true; }); }
function _rptSet(k,v){ window._rptF=window._rptF||{}; window._rptF[k]=v; renderReport(); }
// 계층 필터(프로젝트→모델→버전그룹→버전): 상위 변경 시 하위 초기화
function _rptSetH(level,val){ const F=window._rptF=window._rptF||{}; F[level]=val; if(level==='proj'){F.model='';F.vgroup='';F.ver='';} else if(level==='model'){F.vgroup='';F.ver='';} else if(level==='vgroup'){F.ver='';} renderReport(); }
// 선택된 각 레벨 = 도넛 1개 (해당 레벨까지 좁힌 items)
function _rptHierLevels(){
  const F=window._rptF||{}; const all=_rptCollect(); const out=[];
  if(F.proj){ out.push({label:'프로젝트', val:F.proj, depth:0, items:all.filter(it=>it._folder===F.proj)}); }
  if(F.proj&&F.model){ out.push({label:'모델', val:F.model, depth:1, items:all.filter(it=>it._folder===F.proj&&it._model===F.model)}); }
  if(F.proj&&F.model&&F.vgroup){ out.push({label:'버전그룹', val:F.vgroup, depth:2, items:all.filter(it=>it._folder===F.proj&&it._model===F.model&&it._vgroup===F.vgroup)}); }
  if(F.proj&&F.model&&F.vgroup&&F.ver){ out.push({label:'버전', val:F.ver, depth:3, items:all.filter(it=>it._folder===F.proj&&it._model===F.model&&it._vgroup===F.vgroup&&it._version===F.ver)}); }
  return out;
}
function _rptHierHtml(){
  const levels=_rptHierLevels();
  const inner = levels.length ? levels.map(function(lv,i){ const s=cycleCalcStats(lv.items);
    return '<div style="display:flex;align-items:center;gap:14px;padding:11px 14px 11px '+(14+lv.depth*24)+'px;border-bottom:1px solid #eef0f3;">'
      +(lv.depth?'<span style="color:#c2cad6;font-size:14px;margin-left:-16px;">└</span>':'')
      +'<div style="width:84px;height:84px;flex-shrink:0;position:relative;"><canvas id="rptHier'+i+'"></canvas></div>'
      +'<div style="min-width:0;">'
        +'<div style="font-size:10px;color:var(--text3);font-weight:700;">'+lv.label+'</div>'
        +'<div style="font-size:14px;font-weight:800;color:#2a2f3a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+_bdEsc(lv.val)+'</div>'
        +'<div style="font-size:11.5px;color:var(--text2);margin-top:3px;">TC '+s.total+' · <span style="color:#00a872;font-weight:700;">합격 '+s.pass+'</span> · <span style="color:#e53e5a;font-weight:700;">불합격 '+s.fail+'</span> · <span style="color:#9aa0b8;">예정 '+s.pending+'</span> · <span style="color:#c9923e;">제외 '+s.exclude+'</span> · <b style="color:#7c3aed;">'+s.progress+'%</b></div>'
      +'</div>'
    +'</div>';
  }).join('') : '<div style="padding:18px 14px;color:var(--text3);font-size:12px;">상단에서 <b>프로젝트</b>부터 선택하면 레벨별 진행 도넛이 표시됩니다.</div>';
  return '<div style="background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:14px;"><div style="font-size:12.5px;font-weight:800;padding:10px 12px;background:#f4f6fa;border-bottom:1px solid var(--border);color:#3a4150;">🍩 계층별 진행 도넛 (프로젝트 → 모델 → 버전그룹 → 버전)</div>'+inner+'</div>';
}
function _rptDrawHier(){
  const levels=_rptHierLevels();
  levels.forEach(function(lv,i){ const el=document.getElementById('rptHier'+i); if(!el)return; const s=cycleCalcStats(lv.items);
    _rptCharts['hier'+i]=new Chart(el.getContext('2d'),{type:'doughnut',data:{labels:['합격','불합격','예정','제외'],datasets:[{data:[s.pass,s.fail,s.pending,s.exclude],backgroundColor:['#00a872','#e53e5a','#c4c9d4','#c9923e'],borderWidth:1}]},options:{responsive:true,maintainAspectRatio:false,cutout:'60%',plugins:{legend:{display:false},tooltip:{enabled:true}}}});
  });
}
