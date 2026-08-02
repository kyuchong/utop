// ═══════════════════════════════════════════════════════════════════════════
// pages-requirements-v2.js  —  2열 신규 페이지 2개 (기존 explorer3 는 건드리지 않음)
//
//   페이지 A  req-v2          Requirements
//     · 1열: REQ 트리 (폴더/REQ ID/Summary + 검색·필터·접기·드래그)
//     · 2열: 세로 레일 [Info / Description / Implementation / TC / Issues]
//            → 각 항목 클릭 시 오른쪽에 기존 REQ 상세 (req2TabContent) 재활용
//
//   페이지 B  cov-v2          Coverage & Test Details
//     · 1열: 표 (REQ ID / REQ Summary / TC ID / TC Summary) + 검색·필터·정렬
//     · 2열: 세로 레일 [Info / Environment / Topology / Traffic / Step / Issues / History / Cycle Result]
//            → 각 항목 클릭 시 오른쪽에 기존 TC 상세 (tcTabContent) 재활용
//
// 원칙:
//   - 기존 explorer3 페이지 코드는 건드리지 않음 (참조·재활용만)
//   - showPage('req-v2') / showPage('cov-v2') 로 진입
//   - 세로 레일 형태: 아이콘 위 / 텍스트 아래
// ═══════════════════════════════════════════════════════════════════════════

// ── 페이지 상태 (사용자별 저장은 아직, 필요 시 localStorage 로 확장) ────
var _rv2SelReq = null;   // 페이지 A 현재 선택 REQ id (explorer3 의 e3SelReq 와 별개)
var _rv2Tab    = "info"; // 페이지 A 현재 레일 항목
var _rv2Search = "";     // 페이지 A 트리 검색어
var _rv2Closed = new Set();  // 페이지 A 접힌 폴더 (explorer3 e3Closed 와 별개)

var _cv2SelTc  = null;   // 페이지 B 현재 선택 TC tcid
var _cv2Tab    = "info"; // 페이지 B 현재 레일 항목
var _cv2Q      = "";     // 페이지 B 검색어
var _cv2Sort   = {col:"tsum", dir:"asc"};    // 페이지 B 정렬 (REQ Summary 컬럼도 제거 → 기본 tsum)
var _cv2ReqSel = new Set();                  // REQ 선택 팝업으로 필터링된 REQ id 집합 (비어있으면 전체)
var _cv2ReqTreeClosed = new Set();           // REQ 선택 팝업 트리에서 접힌 폴더 id

// 페이지 A 1열 폭 (px). 리사이저로 조절 가능.
var _rv2Col1W  = 600;

// 사이드바 상태 (OpenWebUI 스타일 아코디언)
var _rv2SideCollapsed = true;    // 접힘 여부 (기본 접힘 — 새로고침 시 접힌 상태로 시작)
var _rv2SideExpanded  = { tests: true };   // 어느 상위 메뉴가 아코디언으로 펼쳐졌나 (기본: Tests 만)

// 사이드바 메뉴 정의 (기존 index.html 탑메뉴 구조를 그대로 세로 배치)
var _RV2_NAV = [
  {id:'dashboard', label:'Dashboard', icon:'ti-layout-dashboard', page:'dashboard'},
  {id:'tests',     label:'Tests',     icon:'ti-file-check', subs:[
    {label:'Requirements',                    page:'req-v2'},
    {label:'Coverage & Test Details',         page:'cov-v2'},
    {label:'Requirements & Coverage',         page:'explorer3'},
    {label:'Global Parameters',               page:'global-params'},
    {label:'SNMP OID Management',             page:'snmp'},
    {label:'IXIA N2X 트래픽 시험',            page:'ixia-traffic'},
    {label:'STC 트래픽 시험',                 page:'stc-traffic'},
    {label:'Tests Color',                     page:'tests-color'},
  ]},
  {id:'cycle',     label:'Cycle',     icon:'ti-rotate-clockwise', subs:[
    {label:'Test Execution', page:'cycle'},
    {label:'Milestone',      page:'milestone'},
  ]},
  {id:'reports',   label:'Reports',   icon:'ti-clipboard-text', subs:[
    {label:'Test Report', page:'report'},
  ]},
  {id:'jira',      label:'Jira Integration', icon:'ti-brand-jira', subs:[
    {label:'Jira Issue Coverage',   page:'release-summary'},
    {label:'Jira Issue Report',     page:'release-summary'},
    {label:'Issue Sync',            page:'issue-sync'},
    {label:'Jira 연동 설정',        page:'sys-jira'},
    {label:'Jira 프로젝트 패널 설정', page:'sys-jira-panel'},
  ]},
  {id:'resources', label:'Resources', icon:'ti-server', subs:[
    {label:'Rack 배치', page:'itms-rack'},
  ]},
  {id:'ai',        label:'AI Assistant', icon:'ti-sparkles', subs:[
    {label:'지식 검색',             page:'jira-ai-beta'},
    {label:'시험절차 학습/조회',    page:'sys-ai'},
    {label:'RAG Data',              page:'manual'},
    {label:'LLM 설정',              page:'llm'},
    {label:'Jira Search 설정',      page:'sys-jira-search'},
    {label:'지식 소스 설정',        page:'knowledge-src'},
    {label:'AI 피드백·통계',        page:'ai-stat'},
  ]},
  {id:'system',    label:'System',    icon:'ti-settings', subs:[
    {label:'커스텀 필드',           page:'sys-custom'},
    {label:'테마 설정',             page:'sys-theme'},
    {label:'메일(SMTP) 설정',       page:'sys-mail'},
    {label:'사용자 관리',           page:'sys-users'},
    {label:'권한 관리',             page:'sys-perms'},
    {label:'조직 설정',             page:'sys-org'},
    {label:'데이터 내보내기',       page:'sys-export'},
    {label:'데이터 가져오기',       page:'sys-import'},
    {label:'버전 현황',             page:'sys-version'},
    {label:'시스템 설정',           page:'sys-config'},
    {label:'사용 도움말',           page:'sys-help'},
  ]},
  {id:'bbs',       label:'요청사항',  icon:'ti-message-2', page:'bbs'},
  {id:'todo',      label:'TO-DO',     icon:'ti-checkbox', page:'todo'},
];

// ── 세로 레일 정의 ─────────────────────────────────────────────────────
var _RV2_RAIL_REQ = [
  {id:"details", icon:"ti-info-circle",   label:"Info"},
  {id:"scenario", icon:"ti-file-text",     label:"Description"},
  {id:"impl",    icon:"ti-code",          label:"Implementation"},
  {id:"tc",      icon:"ti-clipboard-check", label:"TC"},
  {id:"issues",  icon:"ti-bug",           label:"Issues"},
];

var _CV2_RAIL_TC = [
  {id:"info",     icon:"ti-info-circle",   label:"Info"},
  {id:"env",      icon:"ti-clipboard-text", label:"Environment"},
  {id:"topo",     icon:"ti-topology-star", label:"Topology"},
  {id:"traffic",  icon:"ti-antenna",       label:"Traffic"},
  {id:"procedure",icon:"ti-list-check",    label:"Step"},
  {id:"issue",    icon:"ti-bug",           label:"Issues"},
  {id:"history",  icon:"ti-history",       label:"History"},
  {id:"cycle",    icon:"ti-recycle",       label:"Cycle Result"},
];

// ── 공통 헬퍼: HTML escape ─────────────────────────────────────────────
function _rv2Esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ═══════════════════════════════════════════════════════════════════════════
// 페이지 A: Requirements  (진입: showPage('req-v2'))
// ═══════════════════════════════════════════════════════════════════════════
async function renderReqV2(){
  var page = document.getElementById('page-req-v2');
  if(!page) return;
  // 데이터 로드 (explorer3 와 동일한 소스)
  try{ if(typeof loadREQData==='function') await loadREQData(); }catch(e){}
  try{ if(typeof loadTCData==='function')  await loadTCData();  }catch(e){}
  // 이 페이지에서만 상단 topbar/topnav-bar 숨김
  _rv2HideTopbars();
  _rv2Draw();
}

// 상단 탑바 숨김/복원 — req-v2, cov-v2 두 페이지 공용
function _rv2HideTopbars(pageId){
  pageId = pageId || 'page-req-v2';
  var bars = [document.querySelector('.topbar'), document.querySelector('.topnav-bar')];
  bars.forEach(function(el){ if(el && el.style.display!=='none'){ el.dataset._rv2Prev=el.style.display||''; el.style.display='none'; } });
  // 페이지 활성 감시 — 대상 페이지가 active 클래스 잃으면 topbar 복원
  if(!window._rv2PageObs){
    // 사이드바 있는 두 페이지 모두 감시
    var targets = ['page-req-v2', 'page-cov-v2'].map(function(id){return document.getElementById(id);}).filter(Boolean);
    if(targets.length){
      window._rv2PageObs = new MutationObserver(function(){
        var anyActive = targets.some(function(t){return t.classList.contains('active');});
        if(!anyActive){ _rv2RestoreTopbars(); }
      });
      targets.forEach(function(t){ window._rv2PageObs.observe(t, {attributes:true, attributeFilter:['class']}); });
    }
  }
}
function _rv2RestoreTopbars(){
  var bars = [document.querySelector('.topbar'), document.querySelector('.topnav-bar')];
  bars.forEach(function(el){ if(el){ el.style.display=el.dataset._rv2Prev||''; delete el.dataset._rv2Prev; } });
  if(window._rv2PageObs){ try{ window._rv2PageObs.disconnect(); }catch(e){} window._rv2PageObs=null; }
}

function _rv2Draw(){
  var page = document.getElementById('page-req-v2');
  if(!page) return;
  // 페이지 전체 폰트 · 사이즈 통일 (요청: 맑은 고딕 13px)
  var _fam = "'Malgun Gothic','맑은 고딕',sans-serif";
  page.innerHTML =
    '<div style="flex:1;display:flex;height:100%;width:100%;background:var(--bg);box-sizing:border-box;font-family:'+_fam+';font-size:13px;">'
      // 왼쪽 세로 사이드바 (OpenWebUI 스타일)
      + '<div id="rv2-sidebar" style="flex:0 0 '+(_rv2SideCollapsed?'56px':'240px')+';display:flex;flex-direction:column;background:#fff;border-right:1px solid var(--border);overflow-y:auto;overflow-x:hidden;transition:flex-basis 0.15s;">'
        + _rv2SideHtml()
      + '</div>'
      // 메인 콘텐츠 (기존 3열 구조: REQ 트리 + 세로 레일 + 상세)
      + '<div style="flex:1;display:flex;min-width:0;padding:12px;gap:0;box-sizing:border-box;">'
      + '<div id="rv2-col1" style="flex:0 0 '+_rv2Col1W+'px;display:flex;flex-direction:column;background:#fff;border:1px solid var(--border);border-radius:12px;box-shadow:0 2px 10px rgba(40,50,90,0.06);overflow:hidden;font-family:'+_fam+';font-size:13px;">'
        + _rv2Col1Hdr()
        + '<div id="rv2-tree" style="flex:1;overflow:auto;padding:5px 6px;font-family:'+_fam+';font-size:13px;">' + _rv2TreeHtml() + '</div>'
      + '</div>'
      + '<div id="rv2-resizer" onmousedown="_rv2ResizeStart(event)" title="드래그로 폭 조절" style="flex:0 0 8px;cursor:col-resize;display:flex;align-items:center;justify-content:center;background:linear-gradient(to right, transparent 0%, #d4dae4 25%, #d4dae4 75%, transparent 100%);transition:background 0.15s;" onmouseenter="this.style.background=\'linear-gradient(to right, transparent 0%, var(--blue) 25%, var(--blue) 75%, transparent 100%)\'" onmouseleave="this.style.background=\'linear-gradient(to right, transparent 0%, #d4dae4 25%, #d4dae4 75%, transparent 100%)\'"><div style="width:3px;height:32px;background:#b8bfcc;border-radius:2px;pointer-events:none;box-shadow:0 0 0 1px rgba(255,255,255,0.6);"></div></div>'
      + '<div id="rv2-col2" style="flex:1;display:flex;flex-direction:row;background:#fff;border:1px solid var(--border);border-radius:12px;box-shadow:0 2px 10px rgba(40,50,90,0.06);overflow:hidden;min-width:0;font-family:'+_fam+';font-size:13px;">'
        + _rv2RailHtml()
        + '<div id="rv2-content" style="flex:1;overflow:auto;min-width:0;font-family:'+_fam+';font-size:13px;">' + _rv2ContentHtml() + '</div>'
      + '</div>'
      + '</div>'  // 메인 콘텐츠 (flex:1) 닫기
    + '</div>';
}

// 사이드바 HTML 렌더 (OpenWebUI 스타일: 접이식, 아코디언)
function _rv2SideHtml(){
  var collapsed = _rv2SideCollapsed;
  var curPage = 'req-v2';
  var h = '';
  // 상단: 로고 + 접기 버튼
  h += '<div style="display:flex;align-items:center;padding:12px 14px;gap:8px;border-bottom:1px solid var(--border);flex-shrink:0;">';
  if(!collapsed){
    h += '<span style="flex:1;font-weight:800;font-size:14px;color:var(--text);white-space:nowrap;overflow:hidden;">ubi<span style="color:#e53e5a;font-weight:900;font-size:1.15em;">Q</span>uoss-TOP</span>';
  }
  h += '<button onclick="_rv2SideToggle()" title="'+(collapsed?'펼치기':'접기')+'" style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;color:var(--text2);cursor:pointer;border-radius:6px;" onmouseenter="this.style.background=\'#f0f1f5\'" onmouseleave="this.style.background=\'transparent\'"><i class="ti '+(collapsed?'ti-menu-2':'ti-layout-sidebar-left-collapse')+'" style="font-size:18px;"></i></button>';
  h += '</div>';
  // 메뉴 항목
  h += '<div style="flex:1;overflow-y:auto;overflow-x:hidden;padding:8px 0;">';
  _RV2_NAV.forEach(function(item){
    var isActive = (item.page===curPage) || (item.subs && item.subs.some(function(s){return s.page===curPage;}));
    var isExpanded = !collapsed && !!_rv2SideExpanded[item.id];
    var itemBg = isActive ? '#eef1fb' : 'transparent';
    var itemColor = isActive ? '#7c3aed' : 'var(--text)';
    var onclick = item.subs
      ? '_rv2SideToggleGroup(\''+item.id+'\')'
      : '_rv2SideNav(\''+item.page+'\')';
    h += '<div onclick="'+onclick+'" title="'+_rv2Esc(item.label)+'" style="display:flex;align-items:center;gap:10px;padding:10px '+(collapsed?'14px':'16px')+';cursor:pointer;background:'+itemBg+';color:'+itemColor+';font-size:13px;font-weight:'+(isActive?'700':'500')+';user-select:none;" onmouseenter="if(this.style.background===\'transparent\')this.style.background=\'#f4f5f9\'" onmouseleave="if(this.style.background===\'rgb(244, 245, 249)\')this.style.background=\'transparent\'">'
      + '<i class="ti '+item.icon+'" style="font-size:18px;flex-shrink:0;"></i>';
    if(!collapsed){
      h += '<span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+_rv2Esc(item.label)+'</span>';
      if(item.subs){
        h += '<i class="ti ti-chevron-'+(isExpanded?'down':'right')+'" style="font-size:14px;color:var(--text3);flex-shrink:0;"></i>';
      }
    }
    h += '</div>';
    // 서브메뉴 (펼쳐진 상태 + 접힘 아님)
    if(item.subs && isExpanded && !collapsed){
      item.subs.forEach(function(sub){
        var subActive = (sub.page===curPage);
        var subBg = subActive ? '#eef1fb' : 'transparent';
        var subColor = subActive ? '#7c3aed' : 'var(--text2)';
        h += '<div onclick="_rv2SideNav(\''+sub.page+'\')" title="'+_rv2Esc(sub.label)+'" style="display:flex;align-items:center;padding:7px 16px 7px 50px;cursor:pointer;background:'+subBg+';color:'+subColor+';font-size:13px;font-weight:'+(subActive?'700':'500')+';user-select:none;" onmouseenter="if(this.style.background===\'transparent\')this.style.background=\'#f4f5f9\'" onmouseleave="if(this.style.background===\'rgb(244, 245, 249)\')this.style.background=\'transparent\'">'
          + '<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+_rv2Esc(sub.label)+'</span>'
          + '</div>';
      });
    }
  });
  h += '</div>';
  return h;
}

function _rv2SideToggle(){
  _rv2SideCollapsed = !_rv2SideCollapsed;
  _rv2Draw();
}
function _rv2SideToggleGroup(gid){
  _rv2SideExpanded[gid] = !_rv2SideExpanded[gid];
  var side = document.getElementById('rv2-sidebar'); if(side) side.innerHTML = _rv2SideHtml();
}
function _rv2SideNav(pageId){
  // 다른 페이지로 이동 — topbar 복원은 MutationObserver 가 자동으로 처리
  if(typeof showPage==='function') showPage(pageId);
}

// 리사이저 드래그 — 1열 폭을 조절 (min 200, max 총 폭의 70%)
function _rv2ResizeStart(ev){
  ev.preventDefault(); ev.stopPropagation();
  var col1 = document.getElementById('rv2-col1'); if(!col1) return;
  var page = document.getElementById('page-req-v2'); if(!page) return;
  var startX = ev.clientX;
  var startW = col1.getBoundingClientRect().width;
  var totalW = page.getBoundingClientRect().width;
  var ov = document.createElement('div'); ov.id='rv2-resize-ov';
  ov.style.cssText = 'position:fixed;inset:0;z-index:99999;cursor:col-resize;';
  document.body.appendChild(ov);
  var _pu = document.body.style.userSelect; document.body.style.userSelect='none';
  function mv(e){
    var d = e.clientX - startX;
    var nw = Math.max(200, Math.min(totalW*0.7, startW + d));
    col1.style.flex = '0 0 '+nw+'px';
    _rv2Col1W = nw;
  }
  function up(){
    document.removeEventListener('mousemove', mv);
    document.removeEventListener('mouseup', up);
    var _ov = document.getElementById('rv2-resize-ov'); if(_ov&&_ov.parentNode) _ov.parentNode.removeChild(_ov);
    document.body.style.userSelect = _pu||'';
  }
  document.addEventListener('mousemove', mv);
  document.addEventListener('mouseup', up);
}

function _rv2Col1Hdr(){
  var q = _rv2Esc(_rv2Search);
  return '<div style="flex-shrink:0;padding:8px 10px;border-bottom:1px solid var(--border);background:#fafbfc;display:flex;align-items:center;gap:6px;">'
    + '<i class="ti ti-list-details" style="font-size:16px;color:#7c3aed;"></i>'
    + '<span style="font-size:14px;font-weight:800;color:var(--text);font-family:inherit;">Requirements</span>'
    + '<input type="text" placeholder="검색" value="'+q+'" oninput="_rv2SetSearch(this.value)" style="flex:1;margin-left:auto;font-size:13px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;min-width:0;font-family:inherit;">'
    + '</div>';
}

function _rv2SetSearch(v){ _rv2Search = v||""; var el=document.getElementById('rv2-tree'); if(el) el.innerHTML=_rv2TreeHtml(); }

// 페이지 A 전용 트리 렌더 (explorer3 상태 미오염, 폴더 접기·검색만 지원)
function _rv2TreeHtml(){
  var folders = (typeof reqFolders!=='undefined'?reqFolders:[]) || [];
  var reqs    = (typeof reqList   !=='undefined'?reqList   :[]) || [];
  var q = String(_rv2Search||'').trim().toLowerCase();
  function reqMatch(r){
    if(!q) return true;
    var idish = (r.reqid||r.id||'').toLowerCase();
    var t = (r.title||r.summary||'').toLowerCase();
    return idish.indexOf(q)>=0 || t.indexOf(q)>=0;
  }
  var roots = folders.filter(function(f){return !f.parent;}).sort(function(a,b){return (a.order||0)-(b.order||0);});
  var h = '';
  // 세로 가이드라인: expGuides(pathLast) 재활용. pathLast[j] = 그 depth 에서 마지막 자식인지 boolean.
  function guidesHtml(pathLast){
    return (typeof expGuides==='function' && pathLast && pathLast.length)
      ? '<span style="display:flex;align-self:stretch;flex-shrink:0;margin:-5px 0;">'+expGuides(pathLast)+'</span>'
      : '';
  }
  function walk(f, depth, pathLast){
    var subs = folders.filter(function(x){return x.parent===f.id;}).sort(function(a,b){return (a.order||0)-(b.order||0);});
    var rqs  = reqs.filter(function(r){return r.folder===f.id;}).filter(reqMatch);
    if(q){
      var subHasAny = subs.some(function(s){ return _rv2FolderHasMatch(s, folders, reqs, reqMatch); });
      if(!rqs.length && !subHasAny) return;
    }
    var open = q ? true : !_rv2Closed.has(f.id);
    var _g = guidesHtml(pathLast);
    h += '<div onclick="_rv2ToggleFolder(\''+f.id+'\')" style="display:flex;align-items:center;gap:6px;padding:5px 10px;cursor:pointer;font-size:13px;color:var(--text2);font-weight:600;user-select:none;" onmouseenter="this.style.background=\'#f4f5f9\'" onmouseleave="this.style.background=\'\'">'
        + _g
        + '<i class="ti ti-chevron-'+(open?'down':'right')+'" style="font-size:12px;color:var(--text3);"></i>'
        + '<i class="ti ti-folder'+(open?'-open':'')+'" style="font-size:14px;color:#e8820c;"></i>'
        + '<span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+_rv2Esc(f.name||f.id)+'</span>'
        + '<span style="font-size:9.5px;color:var(--text3);background:#eef0f5;border-radius:8px;padding:1px 6px;">'+rqs.length+'</span>'
      + '</div>';
    if(open){
      // 자식들의 pathLast 계산 위해 childTotal 파악
      var visSubs = q ? subs.filter(function(s){ return _rv2FolderHasMatch(s, folders, reqs, reqMatch); }) : subs;
      var visRqs  = rqs;
      var childTotal = visSubs.length + visRqs.length;
      var childIdx = 0;
      visSubs.forEach(function(s){
        var isLast = (childIdx === childTotal-1);
        walk(s, depth+1, (pathLast||[]).concat(isLast));
        childIdx++;
      });
      visRqs.forEach(function(r){
        var isLast = (childIdx === childTotal-1);
        var _rg = guidesHtml((pathLast||[]).concat(isLast));
        var sel = (_rv2SelReq===r.id);
        h += '<div onclick="_rv2SelectReq(\''+r.id+'\')" title="'+_rv2Esc(r.title||'')+'" style="display:flex;align-items:center;gap:6px;padding:5px 10px;cursor:pointer;font-size:13px;'+(sel?'background:#eef1fb;border-left:3px solid #7c3aed;':'border-left:3px solid transparent;')+'" onmouseenter="if(!this.style.background||this.style.background===\'\')this.style.background=\'#f4f5f9\'" onmouseleave="if(this.style.borderLeftColor!==\'rgb(124, 58, 237)\')this.style.background=\'\'">'
          + _rg
          + '<i class="ti ti-file-text" style="font-size:13px;color:#2d6fd4;"></i>'
          + '<span style="font-size:13px;color:#2d6fd4;font-weight:700;flex-shrink:0;">'+_rv2Esc(r.reqid||r.id)+'</span>'
          + '<span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text);">'+_rv2Esc(r.title||r.summary||'')+'</span>'
        + '</div>';
        childIdx++;
      });
    }
  }
  // 루트 폴더들: 각각의 isLast 계산
  var visRoots = q ? roots.filter(function(f){ return _rv2FolderHasMatch(f, folders, reqs, reqMatch); }) : roots;
  visRoots.forEach(function(f, i){
    walk(f, 0, []);   // 루트는 가이드라인 없음 (depth 0)
  });
  if(!h) h = '<div style="padding:30px 12px;text-align:center;color:var(--text3);font-size:13px;">'+(q?'검색 결과 없음':'요구사항 없음')+'</div>';
  return h;
}

function _rv2FolderHasMatch(f, folders, reqs, matchFn){
  var rqs = reqs.filter(function(r){return r.folder===f.id;}).filter(matchFn);
  if(rqs.length) return true;
  var subs = folders.filter(function(x){return x.parent===f.id;});
  return subs.some(function(s){ return _rv2FolderHasMatch(s, folders, reqs, matchFn); });
}

function _rv2ToggleFolder(fid){
  if(_rv2Closed.has(fid)) _rv2Closed.delete(fid); else _rv2Closed.add(fid);
  var el=document.getElementById('rv2-tree'); if(el) el.innerHTML=_rv2TreeHtml();
}

function _rv2SelectReq(rid){
  _rv2SelReq = rid;
  var t=document.getElementById('rv2-tree'); if(t) t.innerHTML=_rv2TreeHtml();
  var c=document.getElementById('rv2-content'); if(c) c.innerHTML=_rv2ContentHtml();
  var r=document.getElementById('rv2-rail'); if(r) r.innerHTML=_rv2RailInnerHtml();
}

// 세로 레일 (아이콘 위 / 텍스트 아래)
function _rv2RailHtml(){
  return '<div id="rv2-rail" style="flex:0 0 96px;display:flex;flex-direction:column;border-right:1px solid var(--border);background:#fafbfc;">'
    + _rv2RailInnerHtml()
    + '</div>';
}
function _rv2RailInnerHtml(){
  return _RV2_RAIL_REQ.map(function(t){
    var on = (_rv2Tab===t.id);
    var _bg = on ? '#ede9fe' : 'transparent';   // 선택: 연한 보라 (#7c3aed 계열)
    var _bd = on ? '#7c3aed' : 'transparent';
    var _fg = on ? '#7c3aed' : 'var(--text3)';
    var _fw = on ? '800' : '600';
    return '<div data-on="'+(on?'1':'0')+'" onclick="_rv2SwitchTab(\''+t.id+'\')" title="'+t.label+'" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:12px 4px;cursor:pointer;border-left:3px solid '+_bd+';background:'+_bg+';color:'+_fg+';font-size:13px;font-weight:'+_fw+';transition:background 0.1s;" onmouseenter="if(this.dataset.on!==\'1\')this.style.background=\'#f0f1f5\'" onmouseleave="if(this.dataset.on!==\'1\')this.style.background=\'transparent\'">'
      + '<i class="ti '+t.icon+'" style="font-size:19px;"></i>'
      + '<span style="text-align:center;line-height:1.15;">'+t.label+'</span>'
      + '</div>';
  }).join('');
}
function _rv2SwitchTab(tab){
  _rv2Tab = tab;
  var r=document.getElementById('rv2-rail'); if(r) r.innerHTML=_rv2RailInnerHtml();
  var c=document.getElementById('rv2-content'); if(c) c.innerHTML=_rv2ContentHtml();
}

// 2열 오른쪽 컨텐츠
function _rv2ContentHtml(){
  if(!_rv2SelReq){
    return '<div style="padding:60px 40px;text-align:center;color:var(--text3);font-size:13px;">'
      + '<i class="ti ti-arrow-left" style="font-size:26px;opacity:0.35;display:block;margin-bottom:10px;"></i>'
      + '왼쪽에서 요구사항을 선택하세요'
      + '</div>';
  }
  var r = (reqList||[]).find(function(x){return x.id===_rv2SelReq;});
  if(!r){
    return '<div style="padding:60px 40px;text-align:center;color:var(--text3);font-size:13px;">선택한 요구사항을 찾을 수 없습니다</div>';
  }
  // 헤더 (REQ ID + 제목) — 요청: 2열 내 모든 글씨 13px
  var head = '<div style="padding:14px 20px;border-bottom:1px solid var(--border);background:#fff;">'
    + '<span style="font-size:13px;font-weight:700;color:#fff;background:#2d6fd4;border-radius:4px;padding:2px 7px;">REQ</span>'
    + '<span style="font-size:13px;font-weight:700;color:#2d6fd4;margin-left:8px;">'+_rv2Esc(r.reqid||r.id)+'</span>'
    + '<div style="font-size:13px;font-weight:700;color:var(--text);margin-top:6px;">'+_rv2Esc(r.title||r.summary||'')+'</div>'
    + '</div>';
  // 본문 (기존 req2TabContent 재활용)
  var body = '<div style="padding:16px 20px;">';
  try{
    if(typeof req2TabContent==='function'){
      body += req2TabContent(r, _rv2Tab);
    } else {
      body += '<div style="color:var(--text3);">req2TabContent 함수 미로드</div>';
    }
  }catch(e){
    body += '<div style="color:var(--red);">렌더 오류: '+_rv2Esc(e.message)+'</div>';
  }
  body += '</div>';
  return head + body;
}

// ═══════════════════════════════════════════════════════════════════════════
// 페이지 B: Coverage & Test Details  (진입: showPage('cov-v2'))
//   · 사이드바 (req-v2 와 공유)
//   · 1열: 표 (REQ ID / REQ Summary / TC ID / TC Summary) + 검색·정렬
//   · 2열: 세로 레일 (Info/Environment/Topology/Traffic/Step/Issues/History/Cycle Result) + TC 상세
// ═══════════════════════════════════════════════════════════════════════════
var _cv2Col1W = 720;   // cov-v2 1열 초기 폭

async function renderCovV2(){
  var page = document.getElementById('page-cov-v2');
  if(!page) return;
  try{ if(typeof loadREQData==='function') await loadREQData(); }catch(e){}
  try{ if(typeof loadTCData==='function')  await loadTCData();  }catch(e){}
  _rv2HideTopbars('page-cov-v2');
  _cv2Draw();
}

function _cv2Draw(){
  var page = document.getElementById('page-cov-v2');
  if(!page) return;
  var _fam = "'Malgun Gothic','맑은 고딕',sans-serif";
  page.innerHTML =
    '<div style="flex:1;display:flex;height:100%;width:100%;background:var(--bg);box-sizing:border-box;font-family:'+_fam+';font-size:13px;">'
      // 왼쪽 사이드바 (req-v2 와 동일)
      + '<div id="rv2-sidebar" style="flex:0 0 '+(_rv2SideCollapsed?'56px':'240px')+';display:flex;flex-direction:column;background:#fff;border-right:1px solid var(--border);overflow-y:auto;overflow-x:hidden;transition:flex-basis 0.15s;">'
        + _cv2SideHtml()
      + '</div>'
      + '<div style="flex:1;display:flex;min-width:0;padding:12px;gap:0;box-sizing:border-box;">'
        // 1열: 표
        + '<div id="cv2-col1" style="flex:0 0 '+_cv2Col1W+'px;display:flex;flex-direction:column;background:#fff;border:1px solid var(--border);border-radius:12px;box-shadow:0 2px 10px rgba(40,50,90,0.06);overflow:hidden;font-family:'+_fam+';font-size:13px;">'
          + _cv2Col1Hdr()
          + '<div id="cv2-table" style="flex:1;overflow:auto;">' + _cv2TableHtml() + '</div>'
        + '</div>'
        // 리사이저
        + '<div onmousedown="_cv2ResizeStart(event)" title="드래그로 폭 조절" style="flex:0 0 8px;cursor:col-resize;display:flex;align-items:center;justify-content:center;background:linear-gradient(to right, transparent 0%, #d4dae4 25%, #d4dae4 75%, transparent 100%);transition:background 0.15s;" onmouseenter="this.style.background=\'linear-gradient(to right, transparent 0%, var(--blue) 25%, var(--blue) 75%, transparent 100%)\'" onmouseleave="this.style.background=\'linear-gradient(to right, transparent 0%, #d4dae4 25%, #d4dae4 75%, transparent 100%)\'"><div style="width:3px;height:32px;background:#b8bfcc;border-radius:2px;pointer-events:none;box-shadow:0 0 0 1px rgba(255,255,255,0.6);"></div></div>'
        // 2열: 세로 레일 + TC 상세
        + '<div id="cv2-col2" style="flex:1;display:flex;flex-direction:row;background:#fff;border:1px solid var(--border);border-radius:12px;box-shadow:0 2px 10px rgba(40,50,90,0.06);overflow:hidden;min-width:0;font-family:'+_fam+';font-size:13px;">'
          + _cv2RailHtml()
          + '<div id="cv2-content" style="flex:1;overflow:auto;min-width:0;font-family:'+_fam+';font-size:13px;">' + _cv2ContentHtml() + '</div>'
        + '</div>'
      + '</div>'
    + '</div>';
}

// 사이드바 HTML (cov-v2 용) — req-v2 와 거의 동일. 현재 페이지만 다름.
function _cv2SideHtml(){
  var collapsed = _rv2SideCollapsed;
  var curPage = 'cov-v2';
  var h = '';
  h += '<div style="display:flex;align-items:center;padding:12px 14px;gap:8px;border-bottom:1px solid var(--border);flex-shrink:0;">';
  if(!collapsed){
    h += '<span style="flex:1;font-weight:800;font-size:14px;color:var(--text);white-space:nowrap;overflow:hidden;">ubi<span style="color:#e53e5a;font-weight:900;font-size:1.15em;">Q</span>uoss-TOP</span>';
  }
  h += '<button onclick="_cv2SideToggle()" title="'+(collapsed?'펼치기':'접기')+'" style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;color:var(--text2);cursor:pointer;border-radius:6px;" onmouseenter="this.style.background=\'#f0f1f5\'" onmouseleave="this.style.background=\'transparent\'"><i class="ti '+(collapsed?'ti-menu-2':'ti-layout-sidebar-left-collapse')+'" style="font-size:18px;"></i></button>';
  h += '</div>';
  h += '<div style="flex:1;overflow-y:auto;overflow-x:hidden;padding:8px 0;">';
  _RV2_NAV.forEach(function(item){
    var isActive = (item.page===curPage) || (item.subs && item.subs.some(function(s){return s.page===curPage;}));
    var isExpanded = !collapsed && !!_rv2SideExpanded[item.id];
    var itemBg = isActive ? '#eef1fb' : 'transparent';
    var itemColor = isActive ? '#7c3aed' : 'var(--text)';
    var onclick = item.subs
      ? '_cv2SideToggleGroup(\''+item.id+'\')'
      : '_cv2SideNav(\''+item.page+'\')';
    h += '<div onclick="'+onclick+'" title="'+_rv2Esc(item.label)+'" style="display:flex;align-items:center;gap:10px;padding:10px '+(collapsed?'14px':'16px')+';cursor:pointer;background:'+itemBg+';color:'+itemColor+';font-size:13px;font-weight:'+(isActive?'700':'500')+';user-select:none;" onmouseenter="if(this.style.background===\'transparent\')this.style.background=\'#f4f5f9\'" onmouseleave="if(this.style.background===\'rgb(244, 245, 249)\')this.style.background=\'transparent\'">'
      + '<i class="ti '+item.icon+'" style="font-size:18px;flex-shrink:0;"></i>';
    if(!collapsed){
      h += '<span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+_rv2Esc(item.label)+'</span>';
      if(item.subs){
        h += '<i class="ti ti-chevron-'+(isExpanded?'down':'right')+'" style="font-size:14px;color:var(--text3);flex-shrink:0;"></i>';
      }
    }
    h += '</div>';
    if(item.subs && isExpanded && !collapsed){
      item.subs.forEach(function(sub){
        var subActive = (sub.page===curPage);
        var subBg = subActive ? '#eef1fb' : 'transparent';
        var subColor = subActive ? '#7c3aed' : 'var(--text2)';
        h += '<div onclick="_cv2SideNav(\''+sub.page+'\')" title="'+_rv2Esc(sub.label)+'" style="display:flex;align-items:center;padding:7px 16px 7px 50px;cursor:pointer;background:'+subBg+';color:'+subColor+';font-size:13px;font-weight:'+(subActive?'700':'500')+';user-select:none;" onmouseenter="if(this.style.background===\'transparent\')this.style.background=\'#f4f5f9\'" onmouseleave="if(this.style.background===\'rgb(244, 245, 249)\')this.style.background=\'transparent\'">'
          + '<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+_rv2Esc(sub.label)+'</span>'
          + '</div>';
      });
    }
  });
  h += '</div>';
  return h;
}
function _cv2SideToggle(){ _rv2SideCollapsed = !_rv2SideCollapsed; _cv2Draw(); }
function _cv2SideToggleGroup(gid){ _rv2SideExpanded[gid] = !_rv2SideExpanded[gid]; var s=document.getElementById('rv2-sidebar'); if(s) s.innerHTML=_cv2SideHtml(); }
function _cv2SideNav(pageId){ if(typeof showPage==='function') showPage(pageId); }

// 1열 헤더 (Coverage 표 상단: 검색 + 카운트)
function _cv2Col1Hdr(){
  var q = _rv2Esc(_cv2Q);
  var rows = _cv2Rows();
  var reqN = (_cv2ReqSel && _cv2ReqSel.size) || 0;
  var reqBtnColor = reqN ? '#7c3aed' : '#d9d2f0';
  var reqBtnBg    = reqN ? '#7c3aed' : '#faf7ff';
  var reqBtnFg    = reqN ? '#fff'    : '#7c3aed';
  return '<div style="flex-shrink:0;padding:8px 10px;border-bottom:1px solid var(--border);background:#fafbfc;display:flex;flex-direction:column;gap:6px;">'
    // 1행: 제목 + 카운트 + REQ 선택 버튼
    + '<div style="display:flex;align-items:center;gap:6px;">'
      + '<i class="ti ti-clipboard-check" style="font-size:16px;color:#00875a;"></i>'
      + '<span style="font-size:14px;font-weight:800;color:var(--text);font-family:inherit;">Coverage</span>'
      + '<span style="font-size:12px;color:var(--text3);">'+rows.length+'건</span>'
      + '<button onclick="_cv2ReqPopupOpen()" title="REQ 폴더에서 선택 → 해당 TC만 표시" style="margin-left:auto;font-size:12px;font-weight:700;padding:4px 10px;border-radius:6px;border:1px solid '+reqBtnColor+';background:'+reqBtnBg+';color:'+reqBtnFg+';cursor:pointer;display:inline-flex;align-items:center;gap:5px;font-family:inherit;"><i class="ti ti-folders" style="font-size:13px;"></i> REQ 선택'+(reqN?(' ('+reqN+')'):'')+'</button>'
    + '</div>'
    // 2행: 검색 바
    + '<input type="text" placeholder="검색 (REQ/TC 이름·ID)" value="'+q+'" oninput="_cv2SetQ(this.value)" style="width:100%;font-size:13px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;box-sizing:border-box;font-family:inherit;">'
    + '</div>';
}
function _cv2SetQ(v){ _cv2Q=v||''; var t=document.getElementById('cv2-table'); if(t) t.innerHTML=_cv2TableHtml(); var h=document.querySelector('#cv2-col1'); /* 헤더 카운트 재갱신은 col1 전체 재렌더 */ if(h){ var hdr=h.querySelector('div:first-child'); if(hdr) hdr.outerHTML=_cv2Col1Hdr(); } }

// Coverage 행 목록 계산 — REQ 별 TC 만 표시. TC 없는 REQ 는 제외 (빈 행 방지).
// REQ 선택 팝업으로 필터되면 그 REQ 들의 TC 만.
function _cv2Rows(){
  var reqs = (typeof reqList!=='undefined'?reqList:[]) || [];
  var tcs  = (typeof tcList !=='undefined'?tcList :[]) || [];
  // REQ 선택 필터 적용
  if(_cv2ReqSel && _cv2ReqSel.size){
    reqs = reqs.filter(function(r){ return _cv2ReqSel.has(r.id); });
  }
  var rows = [];
  reqs.forEach(function(r){
    var reqid = r.reqid || r.id || '';
    var rsum  = r.title || r.summary || '';
    var reqTcs = tcs.filter(function(t){return t.req_id===r.id;});
    reqTcs.forEach(function(t){
      rows.push({reqid:reqid, rsum:rsum, tcid:t.tcid||t.id||'', tsum:t.name||t.title||'', tc_ref:t.tcid||t.id||''});
    });
  });
  // 검색 필터
  var q = String(_cv2Q||'').trim().toLowerCase();
  if(q){
    rows = rows.filter(function(x){
      return x.reqid.toLowerCase().indexOf(q)>=0 || x.rsum.toLowerCase().indexOf(q)>=0
          || x.tcid.toLowerCase().indexOf(q)>=0 || x.tsum.toLowerCase().indexOf(q)>=0;
    });
  }
  // 정렬
  var col = _cv2Sort.col, dir = _cv2Sort.dir;
  rows.sort(function(a,b){
    var va = String(a[col]||'').toLowerCase(), vb = String(b[col]||'').toLowerCase();
    if(va<vb) return dir==='asc'?-1:1;
    if(va>vb) return dir==='asc'?1:-1;
    return 0;
  });
  return rows;
}

function _cv2TableHtml(){
  var rows = _cv2Rows();
  var th = function(col, label){
    var arrow = (_cv2Sort.col===col) ? (_cv2Sort.dir==='asc'?' ▲':' ▼') : '';
    return '<th onclick="_cv2ToggleSort(\''+col+'\')" style="padding:8px 10px;background:#f4f6fa;border-bottom:1px solid var(--border);text-align:left;font-size:13px;font-weight:700;color:var(--text);cursor:pointer;user-select:none;white-space:nowrap;">'+label+arrow+'</th>';
  };
  var h = '<table style="width:100%;border-collapse:collapse;font-family:inherit;font-size:13px;">'
    + '<thead><tr>'
    + th('tsum',  'TC Summary')
    + '</tr></thead><tbody>';
  if(!rows.length){
    h += '<tr><td style="padding:40px;text-align:center;color:var(--text3);font-size:13px;">'+(_cv2Q?'검색 결과 없음':'데이터 없음')+'</td></tr>';
  }
  rows.forEach(function(x){
    var sel = x.tc_ref && (_cv2SelTc === x.tc_ref);
    var onclick = x.tc_ref ? 'onclick="_cv2SelectTc(\''+x.tc_ref.replace(/'/g,"\\'")+'\')"' : '';
    var cursor = x.tc_ref ? 'cursor:pointer;' : '';
    var bg = sel ? 'background:#eef1fb;' : '';
    h += '<tr '+onclick+' style="border-bottom:1px solid var(--border);'+cursor+bg+'" onmouseenter="if(!this.style.background)this.style.background=\'#f4f5f9\'" onmouseleave="if(this.style.background===\'rgb(244, 245, 249)\')this.style.background=\'\'">'
      + '<td style="padding:7px 10px;font-size:13px;">'+_rv2Esc(x.tsum)+'</td>'
      + '</tr>';
  });
  h += '</tbody></table>';
  return h;
}
function _cv2ToggleSort(col){
  if(_cv2Sort.col===col){ _cv2Sort.dir = (_cv2Sort.dir==='asc'?'desc':'asc'); }
  else { _cv2Sort.col=col; _cv2Sort.dir='asc'; }
  var t=document.getElementById('cv2-table'); if(t) t.innerHTML=_cv2TableHtml();
}
function _cv2SelectTc(tcid){
  _cv2SelTc = tcid;
  var t=document.getElementById('cv2-table'); if(t) t.innerHTML=_cv2TableHtml();
  var c=document.getElementById('cv2-content'); if(c) c.innerHTML=_cv2ContentHtml();
  var r=document.getElementById('cv2-rail'); if(r) r.innerHTML=_cv2RailInnerHtml();
}

// 세로 레일 (아이콘 위/텍스트 아래)
function _cv2RailHtml(){
  return '<div id="cv2-rail" style="flex:0 0 96px;display:flex;flex-direction:column;border-right:1px solid var(--border);background:#fafbfc;">'
    + _cv2RailInnerHtml()
    + '</div>';
}
function _cv2RailInnerHtml(){
  return _CV2_RAIL_TC.map(function(t){
    var on = (_cv2Tab===t.id);
    var _bg = on ? '#ede9fe' : 'transparent';
    var _bd = on ? '#7c3aed' : 'transparent';
    var _fg = on ? '#7c3aed' : 'var(--text3)';
    var _fw = on ? '800' : '600';
    return '<div data-on="'+(on?'1':'0')+'" onclick="_cv2SwitchTab(\''+t.id+'\')" title="'+t.label+'" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:12px 4px;cursor:pointer;border-left:3px solid '+_bd+';background:'+_bg+';color:'+_fg+';font-size:13px;font-weight:'+_fw+';transition:background 0.1s;" onmouseenter="if(this.dataset.on!==\'1\')this.style.background=\'#f0f1f5\'" onmouseleave="if(this.dataset.on!==\'1\')this.style.background=\'transparent\'">'
      + '<i class="ti '+t.icon+'" style="font-size:19px;"></i>'
      + '<span style="text-align:center;line-height:1.15;">'+t.label+'</span>'
      + '</div>';
  }).join('');
}
function _cv2SwitchTab(tab){
  _cv2Tab = tab;
  var r=document.getElementById('cv2-rail'); if(r) r.innerHTML=_cv2RailInnerHtml();
  var c=document.getElementById('cv2-content'); if(c) c.innerHTML=_cv2ContentHtml();
}

// 2열 오른쪽 콘텐츠 (TC 상세)
function _cv2ContentHtml(){
  if(!_cv2SelTc){
    return '<div style="padding:60px 40px;text-align:center;color:var(--text3);font-size:13px;">'
      + '<i class="ti ti-arrow-left" style="font-size:26px;opacity:0.35;display:block;margin-bottom:10px;"></i>'
      + '왼쪽 표에서 TC 를 선택하세요'
      + '</div>';
  }
  var tc = (typeof tcList!=='undefined'?tcList:[]).find(function(x){return (x.tcid||x.id)===_cv2SelTc;});
  if(!tc){
    return '<div style="padding:60px 40px;text-align:center;color:var(--text3);font-size:13px;">선택한 TC 를 찾을 수 없습니다</div>';
  }
  var head = '<div style="padding:14px 20px;border-bottom:1px solid var(--border);background:#fff;">'
    + '<span style="font-size:13px;font-weight:700;color:#fff;background:#00875a;border-radius:4px;padding:2px 7px;">TC</span>'
    + '<span style="font-size:13px;font-weight:700;color:#00875a;margin-left:8px;">'+_rv2Esc(tc.tcid||tc.id)+'</span>'
    + '<div style="font-size:13px;font-weight:700;color:var(--text);margin-top:6px;">'+_rv2Esc(tc.name||tc.title||'')+'</div>'
    + '</div>';
  var body = '<div style="padding:16px 20px;">';
  try{
    if(typeof tcTabContent==='function'){
      body += tcTabContent(tc, _cv2Tab);
    } else {
      body += '<div style="color:var(--text3);">tcTabContent 함수 미로드</div>';
    }
  }catch(e){
    body += '<div style="color:var(--red);">렌더 오류: '+_rv2Esc(e.message)+'</div>';
  }
  body += '</div>';
  return head + body;
}

// 리사이저
function _cv2ResizeStart(ev){
  ev.preventDefault(); ev.stopPropagation();
  var col1 = document.getElementById('cv2-col1'); if(!col1) return;
  var page = document.getElementById('page-cov-v2'); if(!page) return;
  var startX = ev.clientX;
  var startW = col1.getBoundingClientRect().width;
  var totalW = page.getBoundingClientRect().width;
  var ov = document.createElement('div'); ov.id='cv2-resize-ov';
  ov.style.cssText = 'position:fixed;inset:0;z-index:99999;cursor:col-resize;';
  document.body.appendChild(ov);
  var _pu = document.body.style.userSelect; document.body.style.userSelect='none';
  function mv(e){
    var d = e.clientX - startX;
    var nw = Math.max(300, Math.min(totalW*0.8, startW + d));
    col1.style.flex = '0 0 '+nw+'px';
    _cv2Col1W = nw;
  }
  function up(){
    document.removeEventListener('mousemove', mv);
    document.removeEventListener('mouseup', up);
    var _ov = document.getElementById('cv2-resize-ov'); if(_ov&&_ov.parentNode) _ov.parentNode.removeChild(_ov);
    document.body.style.userSelect = _pu||'';
  }
  document.addEventListener('mousemove', mv);
  document.addEventListener('mouseup', up);
}

// ═══════════════════════════════════════════════════════════════════════════
// REQ 선택 팝업 (Coverage 전용) — cbReqPopupOpen 참고, 독립 상태 사용
// ═══════════════════════════════════════════════════════════════════════════
function _cv2ReqPopupOpen(){
  var ex = document.getElementById('cv2-reqpopup'); if(ex){ ex.remove(); return; }
  var d = document.createElement('div'); d.id = 'cv2-reqpopup';
  d.innerHTML = _cv2ReqPopupHtml();
  document.body.appendChild(d);
}
function _cv2ReqPopupClose(){ var d=document.getElementById('cv2-reqpopup'); if(d) d.remove(); }
function _cv2ReqPopupRefresh(){ var b=document.getElementById('cv2-reqpopup-body'); if(b) b.innerHTML=_cv2ReqTreeHtml(); }

function _cv2ReqPopupHtml(){
  var _fam = "'Malgun Gothic','맑은 고딕',sans-serif";
  return '<div onclick="if(event.target===this)_cv2ReqPopupClose()" style="position:fixed;inset:0;z-index:100000;background:rgba(20,28,48,0.32);display:flex;align-items:center;justify-content:center;font-family:'+_fam+';font-size:13px;">'
    + '<div style="width:540px;max-width:94vw;max-height:84vh;background:#fff;border-radius:13px;box-shadow:0 20px 60px rgba(0,0,0,0.3);display:flex;flex-direction:column;overflow:hidden;">'
      + '<div style="padding:11px 16px;border-bottom:1px solid var(--border);background:#f3eefe;display:flex;align-items:center;gap:7px;flex-shrink:0;">'
        + '<i class="ti ti-folders" style="font-size:17px;color:#7c3aed;"></i>'
        + '<span style="font-size:14px;font-weight:800;color:#7c3aed;">REQ 선택 — 해당 TC만 표시</span>'
        + '<span style="flex:1;"></span>'
        + '<button onclick="_cv2ReqTreeExpandAll()" title="전체 펼치기" style="width:24px;height:24px;border-radius:6px;border:1px solid #d9d2f0;background:#fff;color:#7c3aed;cursor:pointer;padding:0;"><i class="ti ti-chevrons-down" style="font-size:14px;"></i></button>'
        + '<button onclick="_cv2ReqTreeCollapseAll()" title="전체 접기" style="width:24px;height:24px;border-radius:6px;border:1px solid #d9d2f0;background:#fff;color:#7c3aed;cursor:pointer;padding:0;"><i class="ti ti-chevrons-up" style="font-size:14px;"></i></button>'
        + '<button onclick="_cv2ClearReqs()" title="전체 REQ (선택 해제)" style="font-size:12px;padding:4px 11px;border-radius:6px;border:1px solid #d9d2f0;background:#fff;color:#7c3aed;cursor:pointer;font-weight:700;">전체 해제</button>'
        + '<button onclick="_cv2ReqPopupClose()" style="width:26px;height:26px;border-radius:6px;border:1px solid var(--border);background:#fff;color:var(--text3);cursor:pointer;"><i class="ti ti-x"></i></button>'
      + '</div>'
      + '<div id="cv2-reqpopup-body" style="flex:1;overflow:auto;padding:8px;">' + _cv2ReqTreeHtml() + '</div>'
      + '<div style="padding:9px 16px;border-top:1px solid var(--border);background:#fafbfc;display:flex;align-items:center;gap:8px;flex-shrink:0;"><span style="flex:1;font-size:12px;color:var(--text3);">REQ를 클릭하면 즉시 적용됩니다 (다중 선택 가능)</span><button onclick="_cv2ReqPopupClose()" style="font-size:13px;padding:6px 20px;border-radius:7px;border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:700;">닫기</button></div>'
    + '</div></div>';
}

function _cv2ReqTreeHtml(){
  var folders = (typeof reqFolders!=='undefined'?reqFolders:[]) || [];
  var reqs    = (typeof reqList   !=='undefined'?reqList   :[]) || [];
  var tcs     = (typeof tcList    !=='undefined'?tcList    :[]) || [];
  var reqTcCnt = {}; tcs.forEach(function(t){ var k=t.req_id||''; reqTcCnt[k]=(reqTcCnt[k]||0)+1; });
  var allSel = (!_cv2ReqSel || !_cv2ReqSel.size);
  var h = '';
  // 상단 "전체" 행
  h += '<div onclick="_cv2ClearReqs()" title="전체 REQ (선택 해제)" style="display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:6px;cursor:pointer;font-size:13px;color:var(--text);'+(allSel?'background:rgba(124,58,237,0.14);border-left:3px solid #7c3aed;font-weight:700;':'')+'">'
    + '<i class="ti ti-stack-2" style="font-size:15px;color:#475063;flex-shrink:0;"></i>'
    + '<span style="flex:1;">전체</span>'
    + '</div>';
  var roots = folders.filter(function(f){return !f.parent;}).sort(function(a,b){return (a.order||0)-(b.order||0);});
  function walk(f, depth){
    var isClosed = _cv2ReqTreeClosed.has(f.id);
    var subs = folders.filter(function(x){return x.parent===f.id;}).sort(function(a,b){return (a.order||0)-(b.order||0);});
    var rqs  = reqs.filter(function(r){return r.folder===f.id;});
    // TC 없는 REQ 는 팝업에서도 제외 (Coverage 표와 일관성)
    rqs = rqs.filter(function(r){ return (reqTcCnt[r.id]||0)>0; });
    // 이 폴더 및 하위에 TC 있는 REQ 없으면 스킵
    var subVis = subs.filter(function(s){ return _cv2FolderHasReqWithTc(s, folders, reqs, reqTcCnt); });
    if(!rqs.length && !subVis.length) return;
    var pad = 8 + depth*14;
    h += '<div onclick="_cv2ReqTreeToggle(\''+f.id+'\')" style="display:flex;align-items:center;gap:6px;padding:6px '+pad+'px;cursor:pointer;font-size:13px;color:var(--text2);font-weight:600;user-select:none;">'
      + '<i class="ti ti-chevron-'+(isClosed?'right':'down')+'" style="font-size:13px;color:var(--text3);"></i>'
      + '<i class="ti ti-folder'+(isClosed?'':'-open')+'" style="font-size:14px;color:#e8820c;"></i>'
      + '<span style="flex:1;">'+_rv2Esc(f.name||f.id)+'</span>'
      + '<span style="font-size:11px;color:var(--text3);background:#eef0f5;border-radius:8px;padding:1px 6px;">'+rqs.length+'</span>'
      + '</div>';
    if(!isClosed){
      subVis.forEach(function(s){ walk(s, depth+1); });
      rqs.forEach(function(r){
        var sel = _cv2ReqSel.has(r.id);
        var pad2 = 8 + (depth+1)*14;
        h += '<div onclick="_cv2ToggleReq(\''+r.id+'\')" style="display:flex;align-items:center;gap:6px;padding:6px '+pad2+'px;cursor:pointer;font-size:13px;'+(sel?'background:rgba(124,58,237,0.14);border-left:3px solid #7c3aed;font-weight:700;':'border-left:3px solid transparent;')+'">'
          + '<i class="ti ti-file-text" style="font-size:13px;color:'+(sel?'#7c3aed':'#2d6fd4')+';"></i>'
          + '<span style="font-size:13px;color:'+(sel?'#7c3aed':'#2d6fd4')+';font-weight:700;flex-shrink:0;">'+_rv2Esc(r.reqid||r.id)+'</span>'
          + '<span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text);">'+_rv2Esc(r.title||r.summary||'')+'</span>'
          + '<span style="font-size:10px;color:var(--text3);background:#eef0f5;border-radius:8px;padding:1px 6px;">'+(reqTcCnt[r.id]||0)+'</span>'
          + '</div>';
      });
    }
  }
  roots.forEach(function(f){ walk(f, 0); });
  return h;
}

function _cv2FolderHasReqWithTc(f, folders, reqs, reqTcCnt){
  var rqs = reqs.filter(function(r){return r.folder===f.id;});
  if(rqs.some(function(r){ return (reqTcCnt[r.id]||0)>0; })) return true;
  var subs = folders.filter(function(x){return x.parent===f.id;});
  return subs.some(function(s){ return _cv2FolderHasReqWithTc(s, folders, reqs, reqTcCnt); });
}

function _cv2ReqTreeToggle(fid){
  if(_cv2ReqTreeClosed.has(fid)) _cv2ReqTreeClosed.delete(fid); else _cv2ReqTreeClosed.add(fid);
  _cv2ReqPopupRefresh();
}
function _cv2ReqTreeExpandAll(){ _cv2ReqTreeClosed.clear(); _cv2ReqPopupRefresh(); }
function _cv2ReqTreeCollapseAll(){ (typeof reqFolders!=='undefined'?reqFolders:[]).forEach(function(f){ if(f&&f.id) _cv2ReqTreeClosed.add(f.id); }); _cv2ReqPopupRefresh(); }

function _cv2ToggleReq(rid){
  if(_cv2ReqSel.has(rid)) _cv2ReqSel.delete(rid); else _cv2ReqSel.add(rid);
  _cv2ReqPopupRefresh();
  _cv2RefreshCoverage();
}
function _cv2ClearReqs(){ _cv2ReqSel.clear(); _cv2ReqPopupRefresh(); _cv2RefreshCoverage(); }

// Coverage 표 · 헤더 재갱신 (팝업 상호작용 후)
function _cv2RefreshCoverage(){
  var col1 = document.getElementById('cv2-col1'); if(!col1) return;
  var hdr = col1.querySelector('div:first-child'); if(hdr) hdr.outerHTML = _cv2Col1Hdr();
  var tbl = document.getElementById('cv2-table'); if(tbl) tbl.innerHTML = _cv2TableHtml();
}
