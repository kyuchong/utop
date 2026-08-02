// 안전장치: 떠 있는 모달 오버레이를 배경 클릭 / ESC 로 닫기.
// (간헐 버그) 어떤 모달의 .modal-overlay(전체화면·z1200 어두운 배경)가 닫히지 않고 남으면 그 아래의
// 「새 사이클」 등 버튼 클릭이 오버레이에 가로채져 안 먹힘 → 새로고침해야 했던 문제를 근본 차단.
if(typeof window!=='undefined' && !window._ovSafetyInit){
  window._ovSafetyInit=true;
  var _ovSkip=function(el){ return !!(el&&el.id&&(el.id==='ui-prompt'||el.id==='login-gate')); };   // 자체 생명주기 관리 모달 제외
  document.addEventListener('mousedown', function(e){
    var ov=e.target;
    if(ov && ov.classList && ov.classList.contains('modal-overlay') && !_ovSkip(ov)){
      if(ov.querySelector('input,select,textarea')) return;   // 입력 폼은 배경클릭으로 닫지 않음(데이터 보호) — ESC/취소 사용
      ov.remove();
    }
  }, true);
  document.addEventListener('keydown', function(e){
    if(e.key!=='Escape') return;
    var ovs=document.querySelectorAll('.modal-overlay');
    for(var i=ovs.length-1;i>=0;i--){ var ov=ovs[i]; if(((ov.style&&ov.style.display)||'')!=='none' && !_ovSkip(ov)){ ov.remove(); return; } }   // 맨 위 오버레이 1개만 닫기
  });
  // 컬럼 리사이즈 드래그 오버레이(.cb-resize-ov)가 mouseup 유실(창 밖 release 등)로 남으면 클릭을 가로채 버튼 누름 위치가 밀림.
  // 버튼을 안 누른 채(e.buttons===0) 마우스가 움직이면 = 드래그가 끝난 상태 → 잔존 오버레이 즉시 제거.
  document.addEventListener('mousemove', function(e){ if(e.buttons===0){ var rs=document.getElementsByClassName('cb-resize-ov'); while(rs.length){ if(rs[0].parentNode){ rs[0].parentNode.removeChild(rs[0]); } else { break; } } } }, true);
}
function renderMilestonePage(){
  const board=document.getElementById('ms-board'); if(!board) return;
  _msRenderStatus();
  const vbtn=function(v,lab){ const on=_msView===v; return '<button onclick="_msSetView(\''+v+'\')" style="font-size:11.5px;padding:5px 13px;border:1px solid '+(on?'#2d6fd4':'var(--border)')+';border-left:none;background:'+(on?'#2d6fd4':'#fff')+';color:'+(on?'#fff':'var(--text2)')+';cursor:pointer;font-weight:700;">'+lab+'</button>'; };
  board.innerHTML=
    '<div style="height:46px;display:flex;align-items:center;gap:8px;padding:0 14px;border-bottom:1px solid var(--border);background:var(--bg3);flex-shrink:0;">'+
      '<b style="font-size:14px;font-weight:800;color:#2a2f3a;white-space:nowrap;">'+_msRangeLabel()+'</b>'+
      '<span style="flex:1;"></span>'+
      '<span style="font-size:11px;color:var(--text3);white-space:nowrap;">기간</span>'+
      '<input type="date" id="ms-from" value="'+(_msFrom||'')+'" onchange="_msSetPeriod(\'from\',this.value)" style="font-size:11px;padding:3px 5px;border:1px solid var(--border);border-radius:5px;color:var(--text2);">'+
      '<span style="color:var(--text3);">~</span>'+
      '<input type="date" id="ms-to" value="'+(_msTo||'')+'" onchange="_msSetPeriod(\'to\',this.value)" style="font-size:11px;padding:3px 5px;border:1px solid var(--border);border-radius:5px;color:var(--text2);">'+
      ((_msFrom||_msTo)?'<button onclick="_msClearPeriod()" title="기간 해제" style="width:24px;height:24px;border-radius:5px;border:1px solid var(--border);background:#fff;color:var(--red);cursor:pointer;padding:0;flex-shrink:0;"><i class="ti ti-x" style="font-size:12px;"></i></button>':'')+
      '<button onclick="_msTodayJump()" style="font-size:11.5px;padding:5px 11px;border-radius:6px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;font-weight:700;white-space:nowrap;"><i class="ti ti-calendar-event"></i> 오늘</button>'+
      '<div style="display:flex;border-radius:6px;overflow:hidden;flex-shrink:0;">'+'<button onclick="_msSetView(\'half\')" style="font-size:11.5px;padding:5px 11px;border:1px solid '+(_msView==='half'?'#2d6fd4':'var(--border)')+';background:'+(_msView==='half'?'#2d6fd4':'#fff')+';color:'+(_msView==='half'?'#fff':'var(--text2)')+';cursor:pointer;font-weight:700;white-space:nowrap;">오전·오후</button>'+vbtn('day','일')+vbtn('week','주')+vbtn('month','월')+vbtn('quarter','분기')+vbtn('year','년')+'</div>'+
      '<button onclick="_msNav(-1)" style="width:28px;height:28px;border-radius:6px;border:1px solid var(--border);background:#fff;cursor:pointer;color:var(--text2);"><i class="ti ti-chevron-left"></i></button>'+
      '<button onclick="_msNav(1)" style="width:28px;height:28px;border-radius:6px;border:1px solid var(--border);background:#fff;cursor:pointer;color:var(--text2);"><i class="ti ti-chevron-right"></i></button>'+
    '</div>'+
    '<div style="flex:1;display:flex;overflow:hidden;">'+
      '<div id="ms-col1" style="flex:0 0 '+_msW1+'px;width:'+_msW1+'px;display:flex;flex-direction:column;border-right:1px solid var(--border);background:#fff;overflow:hidden;">'+
        '<div id="ms-list-body" style="flex:1;overflow-y:auto;overflow-x:hidden;" onscroll="_msSync(\'list\')">'+
          '<div style="position:sticky;top:0;z-index:5;height:46px;box-sizing:border-box;display:flex;align-items:center;gap:7px;padding:0 10px;background:#fff;border-bottom:1px solid var(--border);">'+
            '<i class="ti ti-list-check" style="color:#00875a;font-size:15px;"></i><span style="font-size:12.5px;font-weight:800;color:var(--text2);white-space:nowrap;">실행 사이클</span>'+
            '<button onclick="_msExpandAll(true)" title="전체 펼치기" style="width:21px;height:21px;border-radius:5px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;padding:0;flex-shrink:0;"><i class="ti ti-chevrons-down" style="font-size:11px;"></i></button>'+
            '<button onclick="_msExpandAll(false)" title="전체 접기" style="width:21px;height:21px;border-radius:5px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;padding:0;flex-shrink:0;"><i class="ti ti-chevrons-up" style="font-size:11px;"></i></button>'+
            '<input id="ms-filter" oninput="_msSetFilter(this.value)" value="'+_bdEsc(_msFilter)+'" placeholder="검색…" style="flex:1;min-width:0;font-size:11.5px;padding:4px 8px;border:1px solid var(--border);border-radius:5px;outline:none;">'+
          '</div>'+
          '<div id="ms-list-rows">'+_msListRowsHtml()+'</div>'+
        '</div>'+
      '</div>'+
      '<div onmousedown="_msResize(event)" title="드래그로 폭 조절" style="width:5px;flex-shrink:0;cursor:col-resize;background:var(--border);opacity:0.4;" onmouseenter="this.style.opacity=\'1\';this.style.background=\'var(--blue)\'" onmouseleave="this.style.opacity=\'0.4\';this.style.background=\'var(--border)\'"></div>'+
      '<div style="flex:1;min-width:0;display:flex;flex-direction:column;background:#fff;overflow:hidden;">'+
        '<div id="ms-gantt-scroll" style="flex:1;overflow:auto;" onscroll="_msSync(\'gantt\')">'+
          _msGanttHeadHtml()+'<div id="ms-gantt-rows">'+_msGanttRowsHtml()+'</div>'+
        '</div>'+
      '</div>'+
    '</div>';
  setTimeout(_msAutoScroll,0);
}
function cbRenderStatus(){
  const el=document.getElementById('cycle-status'); if(!el) return;
  const cycles=(typeof cbMatchCycles==='function')?cbMatchCycles():[];
  const all=[]; cycles.forEach(c=>(c.items||[]).forEach(it=>all.push(it)));
  const st=cycleCalcStats(all); const tot=st.total||0;
  const pP=tot?st.pass/tot*100:0, pF=tot?st.fail/tot*100:0, pE=tot?st.exclude/tot*100:0;
  el.innerHTML=
    '<span><i class="ti ti-rotate-clockwise" style="font-size:11px;color:#2d6fd4;"></i> 사이클 <b style="color:var(--text2);">'+cycles.length+'</b></span>'+
    '<span style="color:#00875a;font-weight:600;">TC <b>'+tot+'</b></span>'+
    '<span style="color:#00a872;font-weight:600;">합격 '+st.pass+'</span>'+
    '<span style="color:#e53e5a;font-weight:600;">불합격 '+st.fail+'</span>'+
    '<span style="color:#9aa3af;font-weight:600;">제외 '+st.exclude+'</span>'+
    '<span style="color:var(--text3);">미실행 '+st.pending+'</span>'+
    '<span style="flex:1;"></span>'+
    '<span style="display:inline-flex;width:130px;height:8px;border-radius:4px;overflow:hidden;background:#e6e8ec;"><span style="width:'+pP+'%;background:#00a872;"></span><span style="width:'+pF+'%;background:#e53e5a;"></span><span style="width:'+pE+'%;background:#9aa3af;"></span></span>'+
    '<span style="color:#7c3aed;font-weight:700;">진행률 '+st.progress+'%</span>';
}
// 마지막 렌더링 시점의 상태 시그니처 — 같은 상태로 다시 호출되면 렌더링 스킵.
// force=true 로 부르면 무조건 재렌더링.
var _cbLastRenderSig=null;
function _cbCurrentSig(){
  try{
    // 선택·필터·목록 mtime·접기 상태를 문자열로 합쳐 시그니처 생성
    var cyCount=(typeof cycleList!=='undefined'&&cycleList)?cycleList.length:0;
    var cyMax=0;
    if(cyCount){
      for(var i=0;i<cycleList.length;i++){ var t=cycleList[i]._updated_at_pg||''; if(t>cyMax) cyMax=t; }
    }
    var tcCount=(typeof tcList!=='undefined'&&tcList)?tcList.length:0;
    var parts=[
      cbSel.project||'', cbSel.mgroup||'', cbSel.model||'', cbSel.vgroup||'', cbSel.version||'',
      cbSelItem||'', cbStatFilter||'', cbItemSearch||'',
      cbHideDone?'1':'0',
      cbCollapse.tree?'1':'0', cbCollapse.exec?'1':'0',
      cbTreeSortDir||1,
      cyCount+':'+cyMax, tcCount+'',
      // 접기 상태
      Array.from(cbTreeOpen||[]).sort().join('|'),
      Array.from(cbReqCollapsed||[]).sort().join('|'),
      // 컬럼 너비
      (cbColW.tree||0)+'x'+(cbColW.exec||0)+'x'+(cbColW.detail||0),
      // 실행 창 (더보기)
      (typeof _cbExecLimit!=='undefined'?_cbExecLimit:50)+'',
    ];
    return parts.join('§');
  }catch(_e){ return String(Math.random()); }   // 실패 시 강제 재렌더
}

// ============================================================================
// Cycle Test Execution 도킹 시스템 — 3열(Cycle Tree · Test Execution · Test Procedure Details)
// 헤더 드래그로 4방향 도킹 + 사용자별 layout 저장. 원본 explorer3 도킹 시스템과 동일 구조.
// 상태: _cbDockLayout 트리 (leaf.id = 1(tree) / 2(mid) / 3(detail))
// ============================================================================
function _cbLayoutKey(){
  var u='';
  try{ if(typeof currentUser!=='undefined'&&currentUser) u=currentUser.name||currentUser.username||''; }catch(_e){}
  return 'utop_cb_dock_layout::'+(u||'anon');
}
function _cbDefaultLayout(){
  // 기본: 3열 row (tree 20% | mid 45% | detail 35%)
  return {type:'row', children:[
    {type:'leaf', id:1, size:20},
    {type:'leaf', id:2, size:45},
    {type:'leaf', id:3, size:35}
  ]};
}
var _cbDockLayout=null;
function _cbLoadLayout(){
  try{ var s=localStorage.getItem(_cbLayoutKey()); if(s){ var o=JSON.parse(s); if(o&&(o.type==='row'||o.type==='col'||o.type==='leaf')) return o; } }catch(_e){}
  return _cbDefaultLayout();
}
function _cbSaveLayout(){ try{ localStorage.setItem(_cbLayoutKey(), JSON.stringify(_cbDockLayout)); }catch(_e){} }
function cbResetDockLayout(){
  try{ localStorage.removeItem(_cbLayoutKey()); }catch(_e){}
  _cbDockLayout=_cbDefaultLayout(); _cbSaveLayout(); renderCycleBoard(true);
  if(typeof showToast==='function') showToast('Cycle 레이아웃을 기본값으로 복원했습니다');
}
// 트리 조작 유틸 — explorer3 와 동일 로직
function _cbFindLeaf(node, id, parent, idx){
  if(!node) return null;
  if(node.type==='leaf'){ return node.id===id?{node:node,parent:parent,idx:idx}:null; }
  var ch=node.children||[];
  for(var i=0;i<ch.length;i++){ var r=_cbFindLeaf(ch[i], id, node, i); if(r) return r; }
  return null;
}
function _cbRemoveLeaf(root, id){
  function walk(node, parent, idx){
    if(node.type==='leaf'){ if(node.id===id){ if(parent){ parent.children.splice(idx,1); return true; } return true; } return false; }
    var ch=node.children||[];
    for(var i=0;i<ch.length;i++){ if(walk(ch[i], node, i)) return true; }
    return false;
  }
  walk(root, null, -1);
  function normalize(node){ if(!node||node.type==='leaf') return node; node.children=(node.children||[]).map(normalize); if(node.children.length===1) return node.children[0]; return node; }
  return normalize(root);
}
function _cbRedistribute(children){
  if(!children||!children.length) return;
  var per=Math.floor(100/children.length); var rem=100-per*children.length;
  children.forEach(function(c,i){ c.size=per+(i===0?rem:0); });
}
function _cbInsertBeside(root, targetId, srcLeaf, side){
  var loc=_cbFindLeaf(root, targetId, null, -1); if(!loc) return root;
  var wantAxis=(side==='left'||side==='right')?'row':'col';
  var wantAfter=(side==='right'||side==='bottom');
  var newLeaf={type:'leaf', id:srcLeaf.id, size:50};
  var target=loc.node; target.size=50;
  if(loc.parent && loc.parent.type===wantAxis){
    var _ch=loc.parent.children;
    var _pos=wantAfter?(loc.idx+1):loc.idx;
    _ch.splice(_pos,0,newLeaf); _cbRedistribute(_ch);
    return root;
  }
  var container={type:wantAxis, children: wantAfter?[target,newLeaf]:[newLeaf,target]};
  _cbRedistribute(container.children);
  if(loc.parent){ loc.parent.children[loc.idx]=container; return root; }
  return container;
}
function _cbMoveLeaf(root, sourceId, targetId, side){
  if(sourceId===targetId) return root;
  var srcLoc=_cbFindLeaf(root, sourceId, null, -1); if(!srcLoc) return root;
  var srcLeaf={type:'leaf', id:sourceId, size:srcLoc.node.size||30};
  var newRoot=_cbRemoveLeaf(root, sourceId); if(!newRoot) newRoot=srcLeaf;
  if(_cbFindLeaf(newRoot, targetId, null, -1)) return _cbInsertBeside(newRoot, targetId, srcLeaf, side);
  var _wantAxis=(side==='left'||side==='right')?'row':'col';
  var _after=(side==='right'||side==='bottom');
  if(newRoot.type===_wantAxis){ _after?newRoot.children.push(srcLeaf):newRoot.children.unshift(srcLeaf); _cbRedistribute(newRoot.children); return newRoot; }
  var _c={type:_wantAxis, children:_after?[newRoot,srcLeaf]:[srcLeaf,newRoot]}; _cbRedistribute(_c.children);
  return _c;
}
// 각 카드 렌더 헬퍼는 renderCycleBoard 안 원래 HTML 그대로 사용 (_cbRenderCard 안에서)
function _cbRenderTree(node, cards){
  if(!node) return '';
  if(node.type==='leaf'){ return cards[node.id]||''; }
  var dir=node.type==='row'?'row':'column';
  var h='<div class="cb-dock-container" style="display:flex;flex-direction:'+dir+';flex:1 1 auto;width:100%;height:100%;min-width:0;min-height:0;gap:6px;">';
  (node.children||[]).forEach(function(ch,i){
    var sz=Math.max(5, ch.size||(100/node.children.length));
    h+='<div class="cb-dock-slot" data-slot-idx="'+i+'" style="flex:1 1 '+sz+'%;display:flex;flex-direction:column;min-width:0;min-height:0;position:relative;">'+_cbRenderTree(ch,cards)+'</div>';
    if(i<node.children.length-1){
      var isRow=(dir==='row');
      h+='<div class="cb-dock-resizer" data-axis="'+(isRow?'x':'y')+'" onmousedown="_cbDockResizeStart(event,this)" title="드래그로 크기 조절" style="'
        +(isRow?'width:8px;cursor:col-resize;':'height:8px;cursor:row-resize;')
        +'background:linear-gradient(to '+(isRow?'right':'bottom')+', transparent 0%, #d4dae4 25%, #d4dae4 75%, transparent 100%);display:flex;align-items:center;justify-content:center;transition:background 0.15s;flex-shrink:0;"'
        +' onmouseenter="this.style.background=\'linear-gradient(to '+(isRow?'right':'bottom')+', transparent 0%, var(--blue) 25%, var(--blue) 75%, transparent 100%)\'"'
        +' onmouseleave="this.style.background=\'linear-gradient(to '+(isRow?'right':'bottom')+', transparent 0%, #d4dae4 25%, #d4dae4 75%, transparent 100%)\'">'
        +'<div style="'+(isRow?'width:3px;height:32px;':'width:32px;height:3px;')+'background:#b8bfcc;border-radius:2px;pointer-events:none;box-shadow:0 0 0 1px rgba(255,255,255,0.6);"></div>'
        +'</div>';
    }
  });
  h+='</div>';
  return h;
}
// 리사이저
function _cbDockResizeStart(ev, handle){
  ev.preventDefault(); ev.stopPropagation();
  var prev=handle.previousElementSibling, next=handle.nextElementSibling; if(!prev||!next) return;
  var axis=handle.getAttribute('data-axis');
  var parent=handle.parentNode;
  var rect=parent.getBoundingClientRect();
  var startPos=(axis==='x')?ev.clientX:ev.clientY;
  var startPrev=(axis==='x')?prev.getBoundingClientRect().width:prev.getBoundingClientRect().height;
  var startNext=(axis==='x')?next.getBoundingClientRect().width:next.getBoundingClientRect().height;
  var total=(axis==='x')?rect.width:rect.height;
  var MIN=100;
  var ov=document.createElement('div'); ov.id='cb-resize-ov';
  ov.style.cssText='position:fixed;inset:0;z-index:99999;cursor:'+(axis==='x'?'col-resize':'row-resize')+';';
  document.body.appendChild(ov);
  var _pu=document.body.style.userSelect; document.body.style.userSelect='none';
  function mv(e){
    var d=(axis==='x')?(e.clientX-startPos):(e.clientY-startPos);
    var nPrev=Math.max(MIN, Math.min(total-MIN, startPrev+d));
    var nNext=startPrev+startNext-nPrev;
    prev.style.flex='1 1 '+((nPrev/total)*100)+'%'; next.style.flex='1 1 '+((nNext/total)*100)+'%';
  }
  function up(){
    document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up);
    var _ov=document.getElementById('cb-resize-ov'); if(_ov&&_ov.parentNode) _ov.parentNode.removeChild(_ov);
    document.body.style.userSelect=_pu||'';
    try{ _cbApplySizesFromDom(); }catch(_e){}
    try{ _cbSaveLayout(); }catch(_e){}
  }
  document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up);
}
function _cbApplySizesFromDom(){
  function walk(node, container){
    if(!node||node.type==='leaf') return;
    var slots=Array.from(container.children).filter(function(c){return c.classList.contains('cb-dock-slot');});
    var total=(node.type==='row')?container.getBoundingClientRect().width:container.getBoundingClientRect().height;
    (node.children||[]).forEach(function(ch,i){
      var sl=slots[i]; if(!sl) return;
      var r=(node.type==='row')?sl.getBoundingClientRect().width:sl.getBoundingClientRect().height;
      ch.size=Math.max(5, (r/total)*100);
      if(ch.type!=='leaf'){ var inner=sl.querySelector('.cb-dock-container'); if(inner) walk(ch, inner); }
    });
  }
  var root=document.getElementById('cycle-board'); if(!root) return;
  if(_cbDockLayout.type==='leaf') return;
  // board → wrapper div → .cb-dock-container 구조. wrapper 안까지 찾음.
  var topContainer=root.querySelector('.cb-dock-container'); if(!topContainer) return;
  walk(_cbDockLayout, topContainer);
}
// 도킹 드래그
var _cbDragSrc=null; var _cbDragOverlay=null;
function _cbDockDragStart(ev, id){
  _cbDragSrc=id;
  try{ ev.dataTransfer.effectAllowed='move'; ev.dataTransfer.setData('text/plain','cb-'+id); }catch(_e){}
  try{ var el=ev.currentTarget; setTimeout(function(){ if(el&&el.style){ el.style.opacity='0.35'; el.style.filter='saturate(0.6)'; el._cbOn=true; } },0); }catch(_e){}
}
function _cbDockDragEnd(){
  try{ [1,2,3].forEach(function(id){ var m={1:'cb-col-tree',2:'cb-col-2',3:'cb-col-3'}; var c=document.getElementById(m[id]); if(c&&c._cbOn){ c.style.opacity=''; c.style.filter=''; c._cbOn=false; } }); }catch(_e){}
  _cbDragSrc=null; _cbHideOverlay();
}
function _cbDockDragOver(ev, targetId){
  if(_cbDragSrc==null||_cbDragSrc===targetId) return;
  ev.preventDefault();
  try{ ev.dataTransfer.dropEffect='move'; }catch(_e){}
  var card=ev.currentTarget;
  var r=card.getBoundingClientRect();
  var x=(ev.clientX-r.left)/r.width, y=(ev.clientY-r.top)/r.height;
  var side; if(Math.abs(x-0.5)>Math.abs(y-0.5)) side=(x<0.5)?'left':'right'; else side=(y<0.5)?'top':'bottom';
  _cbShowOverlay(card, side); card._cbSide=side;
}
function _cbDockDragLeave(ev){
  var rt=ev.relatedTarget; if(rt && ev.currentTarget.contains(rt)) return;
  _cbHideOverlay();
}
function _cbDockDrop(ev, targetId){
  ev.preventDefault();
  var side=ev.currentTarget._cbSide||'right'; _cbHideOverlay();
  var src=_cbDragSrc; _cbDragSrc=null;
  if(src==null||src===targetId) return;
  _cbApplySizesFromDom();
  _cbDockLayout=_cbMoveLeaf(_cbDockLayout, src, targetId, side);
  _cbSaveLayout(); renderCycleBoard(true);
}
function _cbShowOverlay(card, side){
  if(!_cbDragOverlay){
    _cbDragOverlay=document.createElement('div'); _cbDragOverlay.id='cb-dock-overlay';
    _cbDragOverlay.style.cssText='position:absolute;pointer-events:none;z-index:1000;width:0;height:0;left:0;top:0;';
    var _dr=document.getElementById('cycle-board')||document.body; _dr.appendChild(_cbDragOverlay);
  }
  var targetId=parseInt(card.getAttribute('data-leaf'));
  if(!targetId||!_cbDragSrc||_cbDragSrc===targetId){ _cbHideOverlay(); return; }
  var simTree=JSON.parse(JSON.stringify(_cbDockLayout));
  var newTree=_cbMoveLeaf(simTree, _cbDragSrc, targetId, side);
  // 캔버스 좌표 = 실제 dock-container 위치. board 안 wrapper 내부의 최상위 컨테이너 사용.
  var root=document.getElementById('cycle-board'); if(!root){ _cbHideOverlay(); return; }
  var topContainer=root.querySelector('.cb-dock-container');
  var _refEl=topContainer||root;
  var rr=_refEl.getBoundingClientRect();
  var _gap=6;
  var canvas={left:rr.left, top:rr.top, width:rr.width, height:rr.height};
  var boxes=[];
  function walk(node, box){
    if(!node) return;
    if(node.type==='leaf'){ boxes.push({id:node.id, box:box, isSrc:(node.id===_cbDragSrc)}); return; }
    var ch=node.children||[]; if(!ch.length) return;
    var isRow=(node.type==='row');
    var total=isRow?box.width:box.height;
    var innerTotal=total-_gap*(ch.length-1);
    var sumSz=0; ch.forEach(function(c){ sumSz+=(c.size||(100/ch.length)); }); if(sumSz<=0) sumSz=100;
    var cursor=isRow?box.left:box.top;
    ch.forEach(function(c){ var sz=(c.size||(100/ch.length))/sumSz; var span=Math.max(20, innerTotal*sz);
      var childBox=isRow?{left:cursor,top:box.top,width:span,height:box.height}:{left:box.left,top:cursor,width:box.width,height:span};
      walk(c, childBox); cursor+=span+_gap;
    });
  }
  walk(newTree, canvas);
  var _names={1:'Cycle Tree', 2:'Cycle Execution', 3:'Test Procedure Details'};
  var _colors={1:'#2d6fd4', 2:'#00875a', 3:'#7c3aed'};
  var _bgs={1:'rgba(45,111,212,0.18)', 2:'rgba(0,135,90,0.18)', 3:'rgba(124,58,237,0.18)'};
  _cbDragOverlay.style.display='block';
  var html='';
  boxes.forEach(function(b){
    var isSrc=b.isSrc;
    var border=isSrc?('2.5px solid '+_colors[b.id]):'2px dashed rgba(120,130,145,0.65)';
    var bg=isSrc?_bgs[b.id]:'rgba(255,255,255,0.55)';
    var shadow=isSrc?('box-shadow:0 0 0 3px '+_bgs[b.id]+';'):'';
    html+='<div style="position:fixed;left:'+b.box.left+'px;top:'+b.box.top+'px;width:'+b.box.width+'px;height:'+b.box.height+'px;border-radius:12px;background:'+bg+';border:'+border+';'+shadow
      +'display:flex;align-items:center;justify-content:center;font-size:'+(isSrc?'15px':'13px')+';font-weight:'+(isSrc?'900':'700')+';color:'+_colors[b.id]+';text-shadow:0 1px 6px rgba(255,255,255,0.95);transition:all 0.12s ease;box-sizing:border-box;pointer-events:none;">'+_names[b.id]+'</div>';
  });
  _cbDragOverlay.innerHTML=html;
}
function _cbHideOverlay(){
  if(_cbDragOverlay){ try{ _cbDragOverlay.style.display='none'; _cbDragOverlay.style.pointerEvents='none'; _cbDragOverlay.innerHTML=''; }catch(_e){} }
  try{ var _ro=document.getElementById('cb-resize-ov'); if(_ro&&_ro.parentNode) _ro.parentNode.removeChild(_ro); }catch(_e){}
}

function renderCycleBoard(force){
  var _perfT0=performance.now();
  const board=document.getElementById('cycle-board'); if(!board){ return; }
  cbRenderStatus();
  try{ if(typeof _cbRemoteRestore==='function') _cbRemoteRestore(); }catch(e){}   // 새로고침 후 진행 중 실행 상태 복원
  // 재진입 최적화: DOM 이 이미 그려져 있고 상태 변경이 없으면 렌더링 자체 스킵 → 즉시 표시
  if(!force){
    var _sig=_cbCurrentSig();
    if(_cbLastRenderSig===_sig && board.children.length>0){
      // 상태 동일 + DOM 이미 존재 → 스킵. 오버레이·포커스만 재적용.
      try{ if(typeof _cbRunOverlaySync==='function') _cbRunOverlaySync(); }catch(_e){}
      setTimeout(_cbFocusUI, 20);
      console.log('[renderCycleBoard] SKIP (unchanged sig) '+(performance.now()-_perfT0).toFixed(1)+'ms');
      return;
    }
    console.log('[renderCycleBoard] RENDER — sig 다름\n  prev: '+String(_cbLastRenderSig||'').slice(0,120)+'\n  now : '+String(_sig).slice(0,120));
    _cbLastRenderSig=_sig;
  } else {
    console.log('[renderCycleBoard] RENDER (force)');
    _cbLastRenderSig=null;   // force 렌더링 후 다음 자동 스킵 판정을 위해 초기화 (아래에서 다시 세팅)
  }
  var _perfTStart=performance.now();
  const tw=cbColW.tree||300, ew=cbColW.exec||820, dw=cbColW.detail||640;
  const tcBtns=cbSel.version?(
    '<button onclick="cbDelTC()" title="선택 TC 삭제" style="width:22px;height:22px;border-radius:5px;border:1px solid rgba(229,62,90,0.4);background:#fff;color:var(--red);cursor:pointer;padding:0;"><i class="ti ti-trash" style="font-size:11px;"></i></button>'
  ):'';
  const treeCol=cbCollapse.tree
    ? '<div onclick="cbToggleCollapse(\'tree\')" title="프로젝트 트리 펼치기" style="width:30px;flex-shrink:0;background:#fff;border:1px solid var(--border);border-radius:12px;box-shadow:0 2px 10px rgba(40,50,90,0.06);cursor:pointer;display:flex;flex-direction:column;align-items:center;padding-top:10px;gap:10px;"><i class="ti ti-layout-sidebar-left-expand" style="color:var(--blue);font-size:18px;"></i><span style="writing-mode:vertical-rl;font-size:10.5px;color:var(--text2);font-weight:700;letter-spacing:1px;">프로젝트 트리</span></div>'
    : '<div id="cb-col-tree" data-leaf="1" onclick="_cbSetFocus(\'tree\')" style="display:flex;flex-direction:column;background:#fff;border:1px solid var(--border);border-radius:12px;box-shadow:0 2px 10px rgba(40,50,90,0.06);overflow:hidden;user-select:none;height:100%;width:100%;min-width:0;min-height:0;">'+
        '<div style="padding:8px 11px 6px;border-bottom:1px solid var(--border);background:#fff;display:flex;align-items:center;gap:5px;min-height:38px;box-sizing:border-box;"><span style="font-size:15px;font-weight:800;color:var(--blue);white-space:nowrap;display:inline-flex;align-items:center;gap:4px;"><i class="ti ti-folders"></i> Cycle Tree</span><span style="flex:1;"></span>'+
          '<button onclick="cbToggleCollapse(\'tree\')" title="트리 접기" style="width:32px;height:32px;border-radius:7px;border:1px solid #d6dce6;background:#fff;color:var(--text3);cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="ti ti-layout-sidebar-left-collapse" style="font-size:20px;"></i></button>'+
        '</div>'+
        '<div style="display:flex;align-items:center;gap:6px;padding:5px 8px;border-bottom:1px solid var(--border);background:#fff;flex-shrink:0;flex-wrap:wrap;">'+
          '<button onclick="cbToggleHideDone()" title="완료된 사이클을 숨기고 진행중·예정만 표시" style="font-size:10.5px;padding:3px 10px;border-radius:12px;border:1px solid '+(cbHideDone?'#7c3aed':'var(--border)')+';background:'+(cbHideDone?'#7c3aed':'#fff')+';color:'+(cbHideDone?'#fff':'var(--text2)')+';cursor:pointer;font-weight:700;white-space:nowrap;"><i class="ti ti-progress" style="font-size:11px;"></i> 진행중·예정만</button>'+
          '<span style="font-size:9.5px;color:'+(cbHideDone?'#7c3aed':'var(--text3)')+';font-weight:'+(cbHideDone?'700':'400')+';">'+(cbHideDone?'완료 숨김 중':'전체 표시')+'</span>'+
          '<span style="flex:1;"></span>'+
          '<button onclick="openNewCycle({})" title="새 사이클 생성 — 제품군·모델그룹·모델명·버전그룹·버전 입력" style="height:32px;border-radius:7px;border:1px solid #2d6fd455;background:#fff;color:#2d6fd4;cursor:pointer;padding:0 10px;font-size:12px;font-weight:700;white-space:nowrap;display:inline-flex;align-items:center;gap:4px;"><i class="ti ti-plus" style="font-size:14px;"></i>사이클</button>'+
          '<button onclick="cbTreeSortToggle()" title="이름 정렬 ('+(cbTreeSortDir>0?'오름차순':'내림차순')+')" style="width:32px;height:32px;border-radius:7px;border:1px solid #d6dce6;background:#fff;color:'+(cbTreeSortDir>0?'#2d6fd4':'#e8820c')+';cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="ti '+(cbTreeSortDir>0?'ti-sort-ascending':'ti-sort-descending')+'" style="font-size:20px;"></i></button>'+
          '<button onclick="cbTreeExpandAll(true)" title="전체 펼치기" style="width:32px;height:32px;border-radius:7px;border:1px solid #d6dce6;background:#fff;color:var(--text2);cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="ti ti-chevrons-down" style="font-size:20px;"></i></button>'+
          '<button onclick="cbTreeExpandAll(false)" title="전체 접기" style="width:32px;height:32px;border-radius:7px;border:1px solid #d6dce6;background:#fff;color:var(--text2);cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="ti ti-chevrons-up" style="font-size:20px;"></i></button>'+
        '</div>'+
        '<div style="flex:1;overflow:auto;" id="cb-tree"><div style="padding:30px 20px;text-align:center;color:var(--text3);font-size:12px;"><i class="ti ti-loader-2 spin" style="font-size:22px;color:#2d6fd4;"></i></div></div>'+
      '</div>';   // 도킹 리사이저는 _cbRenderTree 안에서 자동 삽입 → 옛 _cbHandle2 리사이저 제거
  const execCol=cbCollapse.exec
    ? '<div onclick="cbToggleCollapse(\'exec\')" title="시험 세부 펼치기" style="width:30px;flex-shrink:0;background:#fff;border:1px solid var(--border);border-radius:12px;box-shadow:0 2px 10px rgba(40,50,90,0.06);cursor:pointer;display:flex;flex-direction:column;align-items:center;padding-top:10px;gap:10px;"><i class="ti ti-layout-sidebar-right-expand" style="color:#7c3aed;font-size:18px;"></i><span style="writing-mode:vertical-rl;font-size:10.5px;color:#7c3aed;font-weight:700;letter-spacing:1px;">시험 세부 내역</span></div>'
    : '<div id="cb-col-3" style="flex:0 0 '+ew+'px;width:'+ew+'px;min-width:0;display:flex;flex-direction:column;background:#fff;overflow:hidden;">'+
        '<div style="padding:6px 8px 6px 10px;border-bottom:1px solid var(--border);background:#fff;display:flex;align-items:center;gap:6px;"><span style="font-size:13px;font-weight:800;color:#7c3aed;"><i class="ti ti-list-details" style="font-size:15px;"></i> 시험 세부 내역</span><span style="flex:1;"></span><button onclick="cbToggleCollapse(\'exec\')" title="접기" style="width:21px;height:21px;border-radius:5px;border:1px solid var(--border);background:#fff;color:var(--text3);cursor:pointer;padding:0;"><i class="ti ti-layout-sidebar-right-collapse" style="font-size:12px;"></i></button></div>'+
        '<div style="flex:1;overflow:auto;" id="cb-exec">'+cbExecHtml()+'</div>'+
      '</div>';
  // 도킹 시스템 — 각 카드 HTML 을 cards[1/2/3] 에 담고 _cbRenderTree 로 조립.
  // 카드 자체는 원래 카드 구조 그대로. 각 카드에 data-leaf 속성 부여 + 헤더에 draggable 부착.
  if(!_cbDockLayout) _cbDockLayout=_cbLoadLayout();
  // 도킹 오버레이 잔재 정리
  try{ _cbDragSrc=null; _cbHideOverlay(); }catch(_e){}
  // Card 1: Cycle Tree (기존 treeCol) — data-leaf=1 부여
  var _card1=treeCol;  // treeCol 자체에 이미 data-leaf="1" 부여됨
  // Card 2: Test Execution
  var _card2='<div id="cb-col-2" data-leaf="2" onclick="_cbSetFocus(\'mid\')" style="display:flex;flex-direction:column;background:var(--bg2);border:1px solid var(--border);border-radius:12px;box-shadow:0 2px 10px rgba(40,50,90,0.06);overflow:hidden;height:100%;width:100%;min-width:0;min-height:0;">'+
      (function(){
        var _bs='font-size:11px;padding:0 11px;border-radius:6px;border:1px solid #2d6fd4;background:#fff;color:#2d6fd4;cursor:pointer;font-weight:700;height:26px;line-height:1;display:inline-flex;align-items:center;gap:4px;';
        var _is='font-size:13px;line-height:1;display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;';
        return '<div style="padding:8px 11px 6px;border-bottom:1px solid var(--border);background:#fff;font-size:15px;font-weight:800;color:#00875a;display:flex;align-items:center;gap:6px;flex-wrap:wrap;cursor:grab;min-height:38px;box-sizing:border-box;" class="cb-dock-hdr">'
          +'<i class="ti ti-clipboard-check"></i> Cycle Execution<span style="flex:1;"></span>'
          +'<button onclick="cbAISummary()" title="선택한 버전 Cycle 결과를 Gemma가 요약·Fail 분석 (서버 저장·재생성 가능)" style="'+_bs+'"><i class="ti ti-sparkles" style="'+_is+'"></i>AI 요약</button>'
          +'<button onclick="cbCycleReport()" title="이 버전 시험 보고서 (AI 요약 PDF)" style="'+_bs+'"><i class="ti ti-file-text" style="'+_is+'"></i>보고서</button>'
          +'<button onclick="cbCycleReportPPTX()" title="이 버전 시험 보고서 (AI 요약 PPTX)" style="'+_bs+'"><i class="ti ti-slideshow" style="'+_is+'"></i>PPTX</button>'
          +'<button onclick="cycleOpenMatrix()" title="매트릭스 보기" style="'+_bs+'"><i class="ti ti-table" style="'+_is+'"></i>매트릭스</button>'
          +'<button onclick="cbHistoryPopup()" title="시험 이력 결과 (팝업)" style="'+_bs+'"><i class="ti ti-history" style="'+_is+'"></i>이력</button>'
        +'</div>';
      })()+
      '<div style="flex:1;overflow:auto;" id="cb-col2body"><div style="padding:30px 20px;text-align:center;color:var(--text3);font-size:12px;"><i class="ti ti-loader-2 spin" style="font-size:22px;color:#2d6fd4;"></i></div></div>'+
      '<div id="cb-col2foot" style="flex-shrink:0;"></div>'+
    '</div>';
  // Card 3: Test Procedure Details
  var _card3='<div id="cb-col-3" data-leaf="3" onclick="_cbSetFocus(\'detail\')" style="display:flex;flex-direction:column;background:#fff;border:1px solid var(--border);border-radius:12px;box-shadow:0 2px 10px rgba(40,50,90,0.06);overflow:hidden;height:100%;width:100%;min-width:0;min-height:0;">'+
      '<div style="padding:8px 11px 6px;border-bottom:1px solid var(--border);background:#fff;font-size:15px;font-weight:800;color:#7c3aed;display:flex;align-items:center;gap:6px;flex-wrap:wrap;cursor:grab;min-height:38px;box-sizing:border-box;" class="cb-dock-hdr"><i class="ti ti-list-details"></i> Test Procedure Details</div>'+
      '<div style="flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;" id="cb-detail"><div style="padding:30px 20px;text-align:center;color:var(--text3);font-size:12px;"><i class="ti ti-loader-2 spin" style="font-size:22px;color:#7c3aed;"></i></div></div>'+
    '</div>';
  var _cards={1:_card1, 2:_card2, 3:_card3};
  // 도킹 트리로 조립
  board.innerHTML='<div style="display:flex;height:100%;width:100%;">'+_cbRenderTree(_cbDockLayout, _cards)+'</div>';
  // 각 카드 헤더에 draggable + drop 이벤트 부착
  try{
    [1,2,3].forEach(function(id){
      var m={1:'cb-col-tree',2:'cb-col-2',3:'cb-col-3'};
      var card=document.getElementById(m[id]); if(!card) return;
      var hdr=card.firstElementChild; if(!hdr) return;
      hdr.setAttribute('draggable','true');
      hdr.style.cursor='grab';
      hdr.title=(hdr.title?hdr.title+' · ':'')+'헤더를 다른 카드로 드래그하면 상/하/좌/우로 도킹';
      hdr.addEventListener('dragstart', function(ev){ _cbDockDragStart(ev, id); });
      hdr.addEventListener('dragend', _cbDockDragEnd);
      card.addEventListener('dragover', function(ev){ _cbDockDragOver(ev, id); });
      card.addEventListener('dragleave', function(ev){ _cbDockDragLeave(ev, id); });
      card.addEventListener('drop', function(ev){ _cbDockDrop(ev, id); });
    });
  }catch(_e){}
  // ★ 점진적 렌더링: 무거운 컴포넌트를 각 frame 에 나눠 채움 → 사용자는 스켈레톤 즉시 봄, 각 영역 순차 나타남 (렉 없음)
  var _myTk=(++_cbRenderToken);
  requestAnimationFrame(function(){
    if(_myTk!==_cbRenderToken) return;
    var _pt1=performance.now();
    try{ var _tE=document.getElementById('cb-tree'); if(_tE) _tE.innerHTML=cbTreeHtml(); }catch(_e){}
    console.log('  ⤷ cbTreeHtml+DOM: '+(performance.now()-_pt1).toFixed(0)+'ms');
    requestAnimationFrame(function(){
      if(_myTk!==_cbRenderToken) return;
      var _pt2=performance.now();
      try{ var _c2=document.getElementById('cb-col2body'); if(_c2) _c2.innerHTML=cbCol2Html(); }catch(_e){}
      try{ var _cf=document.getElementById('cb-col2foot'); if(_cf) _cf.innerHTML=cbCol2FootHtml(); }catch(_e){}
      console.log('  ⤷ cbCol2Html+Foot+DOM: '+(performance.now()-_pt2).toFixed(0)+'ms');
      requestAnimationFrame(function(){
        if(_myTk!==_cbRenderToken) return;
        var _pt3=performance.now();
        try{ var _dt=document.getElementById('cb-detail'); if(_dt) _dt.innerHTML=cbExecHtml(); }catch(_e){}
        console.log('  ⤷ cbExecHtml+DOM: '+(performance.now()-_pt3).toFixed(0)+'ms');
        try{ if(typeof _cbRunOverlaySync==='function') _cbRunOverlaySync(); }catch(_e){}
        try{ _cbLastRenderSig=_cbCurrentSig(); }catch(_e){}
        console.log('[renderCycleBoard] DONE '+(performance.now()-_perfT0).toFixed(0)+'ms (start→last rAF)');
      });
    });
  });
  setTimeout(_cbFocusUI, 20);
}
var _cbRenderToken=0;   // 점진적 렌더링 취소 토큰 (renderCycleBoard 여러 번 호출 시 이전 chunk 중단)
// ── 보드에서 현재 선택 버전 Cycle의 AI 요약 / Fail→Jira (구현은 07-report.js cycleAISummary/cycleAutoJira) ──
function cbAISummary(){ const cy=(typeof cbCurrentCycle==='function')?cbCurrentCycle():null; if(!cy){ showToast('버전을 선택하세요'); return; } cycleAISummary(cy.id); }
function cbAutoJira(){ const cy=(typeof cbCurrentCycle==='function')?cbCurrentCycle():null; if(!cy){ showToast('버전을 선택하세요'); return; } cycleAutoJira(cy.id); }
// ===== 사이클 페이지 열 포커스 강조 =====
var _cbFocus='tree';
function _cbFocusUI(){
  var cols={tree:'cb-col-tree',mid:'cb-col-2',detail:'cb-col-3'};
  var borders={tree:'2px solid #7c3aed',mid:'2px solid #00875a',detail:'2px solid #2d6fd4'};
  var shadows={tree:'0 0 0 3px rgba(124,58,237,0.18),0 4px 18px rgba(124,58,237,0.14)',mid:'0 0 0 3px rgba(0,135,90,0.18),0 4px 18px rgba(0,135,90,0.14)',detail:'0 0 0 3px rgba(45,111,212,0.18),0 4px 18px rgba(45,111,212,0.14)'};
  ['tree','mid','detail'].forEach(function(k){
    var el=document.getElementById(cols[k]); if(!el) return;
    if(_cbFocus===k){ el.style.border=borders[k]; el.style.boxShadow=shadows[k]; }
    else { el.style.border='1px solid var(--border)'; el.style.boxShadow='0 2px 10px rgba(40,50,90,0.06)'; }
  });
}
function _cbSetFocus(k){ _cbFocus=k; _cbFocusUI(); }
function cbPick(level,val){
  cbSelItem=null; cbItemSel.clear();
  if(level==='project'){ cbSel.project=(cbSel.project===val?'':val); cbSel.model='';cbSel.vgroup='';cbSel.version=''; }
  else if(level==='model'){ cbSel.model=(cbSel.model===val?'':val); cbSel.vgroup='';cbSel.version=''; }
  else if(level==='vgroup'){ cbSel.vgroup=(cbSel.vgroup===val?'':val); cbSel.version=''; }
  else if(level==='version'){ cbSel.version=(cbSel.version===val?'':val); }
  cbSaveSel();
  renderCycleBoard();
}
function cbSetFilter(level,v){ cbFilter[level]=(v||'').toLowerCase(); cbRenderList(level); }function cbAdd(level){
  if(level==='project'){ cycleAddFolder(); setTimeout(renderCycleBoard,60); return; }
  if(cbSel.project) cycleSelFolderId=cbSel.project;
  openNewCycle();
}
async function cbEdit(level){
  if(level==='project'){ if(!cbSel.project){showToast('프로젝트를 선택하세요');return;} const f=cycleFolderList.find(x=>x.id===cbSel.project); if(!f) return; const nm=prompt('프로젝트명 수정:',f.name); if(!nm||!nm.trim()||nm.trim()===f.name) return; f.name=nm.trim(); await saveCycleFolders(); renderCycleBoard(); showToast('수정됨'); return; }
  let targets=[], cur='';
  if(level==='model'){ if(!cbSel.model){showToast('모델을 선택하세요');return;} cur=cbSel.model; targets=cycleList.filter(c=>(!cbSel.mgroup||_cycMGroup(c)===cbSel.mgroup)&&c.model===cbSel.model); }
  else if(level==='vgroup'){ if(!cbSel.vgroup){showToast('버전그룹을 선택하세요');return;} cur=cbSel.vgroup; targets=cycleList.filter(c=>(!cbSel.mgroup||_cycMGroup(c)===cbSel.mgroup)&&(!cbSel.model||c.model===cbSel.model)&&(c.version_group||'(미분류)')===cbSel.vgroup); }
  else if(level==='version'){ if(!cbSel.version){showToast('버전을 선택하세요');return;} cur=cbSel.version; const cy=cbCurrentCycle(); targets=cy?[cy]:[]; }
  if(!targets.length){showToast('수정할 대상이 없습니다');return;}
  const nm=prompt('이름 수정:',cur); if(!nm||!nm.trim()||nm.trim()===cur) return; const nv=nm.trim();
  for(const c of targets){ if(level==='model')c.model=nv; else if(level==='vgroup')c.version_group=nv; else if(level==='version')c.version=nv; await saveCycle(c); }
  if(level==='model')cbSel.model=nv; else if(level==='vgroup')cbSel.vgroup=nv; else if(level==='version')cbSel.version=nv;
  renderCycleBoard(); showToast('수정됨 ('+targets.length+'개)');
}
async function cbDel(level){
  let targets=[];
  if(level==='project'){ if(!cbSel.project){showToast('프로젝트를 선택하세요');return;} const f=cycleFolderList.find(x=>x.id===cbSel.project); targets=cycleList.filter(c=>c.folder_id===cbSel.project); if(!confirm('프로젝트 "'+((f&&f.name)||'')+'"'+(targets.length?(' + 사이클 '+targets.length+'개'):'')+'를 삭제할까요?')) return; cycleFolderList=cycleFolderList.filter(x=>x.id!==cbSel.project); await saveCycleFolders(); }
  else if(level==='mgroup'){ if(!cbSel.mgroup){showToast('모델그룹을 선택하세요');return;} targets=cycleList.filter(c=>_cycMGroup(c)===cbSel.mgroup); if(!targets.length){showToast('삭제할 사이클이 없습니다');return;} if(!confirm('모델그룹 "'+cbSel.mgroup+'" 사이클 '+targets.length+'개를 삭제할까요?')) return; }
  else if(level==='model'){ if(!cbSel.model){showToast('모델을 선택하세요');return;} targets=cycleList.filter(c=>(!cbSel.mgroup||_cycMGroup(c)===cbSel.mgroup)&&c.model===cbSel.model); if(!targets.length){showToast('삭제할 사이클이 없습니다');return;} if(!confirm('모델 "'+cbSel.model+'" 사이클 '+targets.length+'개를 삭제할까요?')) return; }
  else if(level==='vgroup'){ if(!cbSel.vgroup){showToast('버전그룹을 선택하세요');return;} targets=cycleList.filter(c=>(!cbSel.mgroup||_cycMGroup(c)===cbSel.mgroup)&&(!cbSel.model||c.model===cbSel.model)&&(c.version_group||'(미분류)')===cbSel.vgroup); if(!targets.length){showToast('삭제할 사이클이 없습니다');return;} if(!confirm('버전그룹 "'+cbSel.vgroup+'" 사이클 '+targets.length+'개를 삭제할까요?')) return; }
  else if(level==='version'){ const cy=cbCurrentCycle(); if(!cy){showToast('버전을 선택하세요');return;} targets=[cy]; if(!confirm('버전 "'+cbSel.version+'" 사이클을 삭제할까요?')) return; }
  for(const c of targets){ try{ await fetch('/api/cycle/'+encodeURIComponent(c.id),{method:'DELETE'}); }catch(e){} }
  const delIds=new Set(targets.map(c=>c.id)); cycleList=cycleList.filter(c=>!delIds.has(c.id));
  if(level==='mgroup'){ cbSel.mgroup='';cbSel.model='';cbSel.vgroup=''; } if(level==='model') cbSel.model=''; if(level==='vgroup') cbSel.vgroup=''; cbSel.version='';
  renderCycleBoard(); showToast('삭제됨 ('+targets.length+'개)');
}
function cycleOpenMatrix(){
  document.getElementById('modal-cycle-mx')?.remove();
  const m=document.createElement('div'); m.id='modal-cycle-mx'; m.className='modal-overlay'; m.style.display='flex';
  m.innerHTML='<div class="modal" style="width:94vw;max-width:1200px;height:86vh;border-radius:12px;padding:0;display:flex;flex-direction:column;"><div style="padding:12px 20px;border-bottom:1px solid var(--border);background:#f4f5f7;display:flex;align-items:center;gap:10px;"><i class="ti ti-table" style="color:var(--blue);"></i><b style="font-size:15px;">TC × 모델 매트릭스</b><span style="flex:1;"></span><button onclick="document.getElementById(\'modal-cycle-mx\').remove()" style="font-size:13px;padding:5px 12px;border:1px solid var(--border);border-radius:6px;background:#fff;cursor:pointer;">닫기</button></div><div style="flex:1;overflow:auto;" id="cycle-matrix"></div></div>';
  document.body.appendChild(m);
  cycleSelFolderId=null; cycleMxGroup=''; cycleMxModel='';   // 매트릭스는 기본 전체(모든 프로젝트·모델) — 팝업 내 셀렉트로 좁힘
  cycleRenderMatrix();
}
async function initCyclePage(){
  var _t0=performance.now();
  // ★ 3개 fetch 순차 대기 대신 병렬 (customFields·cycle·devices 는 서로 독립)
  await Promise.all([
    loadCustomFields().catch(function(){}),
    loadCycleData().catch(function(){}),
    loadDeviceData().catch(function(){}),
  ]);
  console.log('[initCyclePage] fetch '+(performance.now()-_t0).toFixed(0)+'ms');
  cbLoadSel();   // cbSel(모델그룹·모델·버전그룹·버전) + cbSelItem 복원
  // ★ 부팅 후 첫 진입: cbSelItem(TC 선택) 초기화 → cbExecHtml 200ms 소거.
  //   사용자가 TC 클릭할 때만 상세 렌더링됨. 사이클 선택(cbSel.version) 은 유지 → 트리는 열림.
  //   같은 세션 안에서 페이지 재진입 시엔 유지되도록 sessionStorage 마커 사용.
  try{
    if(!sessionStorage.getItem('utop_cycle_visited')){
      cbSelItem=null;
      try{ localStorage.removeItem('utop_cbselitem'); }catch(_e){}
      sessionStorage.setItem('utop_cycle_visited','1');
    }
  }catch(_e){}
  try{ if(typeof _cbRunRestore==='function') _cbRunRestore(); }catch(e){}   // 새로고침 후 마지막 실행 지점(강조·스텝) 복원
  // 저장된 버전 선택이 현재 사이클에 없으면 해제
  if(cbSel.version && (typeof cbCurrentCycle==='function') && !cbCurrentCycle()) cbSel.version='';
  cbItemSel.clear();
  // col2 항목 선택 유효성 검증 (사이클/항목이 사라졌으면 해제)
  try{ if(cbSelItem){ const _o=(typeof cbResolve==='function')?cbResolve(cbSelItem):null; if(!_o||!_o.it) cbSelItem=null; } }catch(e){ cbSelItem=null; }
  // 트리 펼침 경로 복원 (4단계: 모델그룹 ▸ 모델 ▸ 버전그룹)
  if(cbSel.mgroup){ cbTreeOpen.add('mg@@'+cbSel.mgroup); if(cbSel.model){ cbTreeOpen.add('m@@'+cbSel.mgroup+'@@'+cbSel.model); if(cbSel.vgroup) cbTreeOpen.add('g@@'+cbSel.mgroup+'@@'+cbSel.model+'@@'+cbSel.vgroup); } }
  renderCycleBoard();
  try{ if(typeof _cbRunResume==='function') _cbRunResume(); }catch(e){}   // 중단 실행(브라우저 러너): 미착수 자동 계속 + 중단 TC 1개 격리
  // 페이지 진입 시 다른 사용자의 진행 중인 실행 상태 pull → 오버레이/배너 즉시 표시 (부팅 이후 진입 케이스)
  try{ if(typeof _cbRemoteRestore==='function') _cbRemoteRestore(); }catch(e){}
}
// ══════════════ 실행 보드 (1열 요구사항 · 2열 시험항목 · 3열 실행&결과) ══════════════
let boardProject='', boardModel='', boardVerGroup='', boardVer='', boardReqId='', boardTcId='';
function _bdEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }
function boardCycle(){ return cycleList.find(c=> (!boardProject||c.folder_id===boardProject) && (!boardModel||c.model===boardModel) && (!boardVer||c.version===boardVer)); }
function boardFillTop(){
  const fp=document.getElementById('bd-project'); if(fp) fp.innerHTML='<option value="">전체</option>'+cycleFolderList.map(f=>`<option value="${f.id}" ${f.id===boardProject?'selected':''}>${_bdEsc(f.name)}</option>`).join('');
  const cyc=cycleList.filter(c=>!boardProject||c.folder_id===boardProject);
  let models=[...new Set(cyc.map(c=>c.model).filter(Boolean))];
  if(!models.length) models=[...new Set((deviceList||[]).map(d=>d.name).filter(Boolean))];
  const fm=document.getElementById('bd-model'); if(fm) fm.innerHTML='<option value="">전체</option>'+models.map(m=>`<option value="${_bdEsc(m)}" ${m===boardModel?'selected':''}>${_bdEsc(m)}</option>`).join('');
  const cyc2=cyc.filter(c=>!boardModel||c.model===boardModel);
  const groups=[...new Set(cyc2.map(c=>c.version_group||'(미분류)').filter(Boolean))];
  const fg=document.getElementById('bd-vgroup'); if(fg) fg.innerHTML='<option value="">전체</option>'+groups.map(g=>`<option value="${_bdEsc(g)}" ${g===boardVerGroup?'selected':''}>${_bdEsc(g)}</option>`).join('');
  const cyc3=cyc2.filter(c=>!boardVerGroup||(c.version_group||'(미분류)')===boardVerGroup);
  const vers=[...new Set(cyc3.map(c=>c.version).filter(Boolean))];
  const fv=document.getElementById('bd-version'); if(fv) fv.innerHTML='<option value="">전체</option>'+vers.map(v=>`<option value="${_bdEsc(v)}" ${v===boardVer?'selected':''}>${_bdEsc(v)}</option>`).join('');
}
function boardOnChange(which){
  if(which==='project'){ boardProject=document.getElementById('bd-project').value; boardModel='';boardVerGroup='';boardVer=''; }
  else if(which==='model'){ boardModel=document.getElementById('bd-model').value; boardVerGroup='';boardVer=''; }
  else if(which==='vgroup'){ boardVerGroup=document.getElementById('bd-vgroup').value; boardVer=''; }
  else if(which==='version'){ boardVer=document.getElementById('bd-version').value; }
  boardFillTop(); boardRender();
}
function boardRender(){ boardRenderReq(); boardRenderTc(); boardRenderExec(); boardUpdateCtx(); }
function boardUpdateCtx(){
  const el=document.getElementById('bd-ctx'); if(!el) return;
  const c=boardCycle();
  el.innerHTML = c ? ('<i class="ti ti-link" style="color:#00a872;"></i> 사이클 <b>'+_bdEsc(c.name||c.model||'')+'</b> 결과 연동') : '<i class="ti ti-link-off" style="color:#bbb;"></i> 매칭 사이클 없음 (절차만 표시)';
}
function boardReqVerdict(reqId){
  const c=boardCycle(); const tcs=tcList.filter(t=>t.req_id===reqId); if(!tcs.length) return null;
  let pass=0,fail=0; const total=tcs.length;
  if(c){ tcs.forEach(t=>{ const it=(c.items||[]).find(x=>(x.tcid||x.name)===(t.tcid||t.name)); if(it){ const v=resultVerdict(cycleItemStatus(it.steps)); if(v==='pass')pass++; else if(v==='fail')fail++; } }); }
  return {total,pass,fail};
}
function boardRenderReq(){
  const col=document.getElementById('bd-col-req'); if(!col) return;
  const reqs=(reqList||[]).slice();
  const rc=document.getElementById('bd-req-cnt'); if(rc) rc.textContent=reqs.length;
  if(!reqs.length){ col.innerHTML='<div style="padding:30px;text-align:center;color:var(--text3);font-size:12px;">요구사항이 없습니다</div>'; return; }
  col.innerHTML=reqs.map(r=>{ const sel=r.id===boardReqId; const v=boardReqVerdict(r.id);
    const badge=v?`<span style="font-size:9px;font-weight:700;color:#fff;background:${v.fail?'#e53e5a':v.pass?'#00a872':'#bbb'};border-radius:8px;padding:1px 6px;">${v.pass}/${v.total}</span>`:'';
    return `<div onclick="boardSelReq('${r.id}')" style="padding:9px 12px;border-bottom:1px solid #eef0f3;cursor:pointer;background:${sel?'rgba(45,111,212,0.1)':'transparent'};border-left:3px solid ${sel?'#2d6fd4':'transparent'};"><div style="display:flex;align-items:center;gap:6px;"><span style="font-family:monospace;font-size:10px;color:#2d6fd4;font-weight:700;">${_bdEsc(r.reqid||r.id)}</span><span style="flex:1;"></span>${badge}</div><div style="font-size:12.5px;color:var(--text);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_bdEsc(r.title||r.name||'(제목 없음)')}</div></div>`;
  }).join('');
}
function boardSelReq(id){ boardReqId=id; boardTcId=''; boardRenderReq(); boardRenderTc(); boardRenderExec(); }
function boardRenderTc(){
  const col=document.getElementById('bd-col-tc'); if(!col) return;
  const cntEl=document.getElementById('bd-tc-cnt');
  if(!boardReqId){ if(cntEl)cntEl.textContent=''; col.innerHTML='<div style="padding:30px;text-align:center;color:var(--text3);font-size:12px;">← 요구사항을 선택하세요</div>'; return; }
  const tcs=tcList.filter(t=>t.req_id===boardReqId); if(cntEl)cntEl.textContent=tcs.length;
  const c=boardCycle();
  if(!tcs.length){ col.innerHTML='<div style="padding:30px;text-align:center;color:var(--text3);font-size:12px;">이 요구사항의 TC가 없습니다</div>'; return; }
  col.innerHTML=tcs.map(t=>{ const sel=(t.tcid||t.id)===boardTcId;
    let badge='<span style="font-size:9px;color:#aab2c0;">미실행</span>';
    if(c){ const it=(c.items||[]).find(x=>(x.tcid||x.name)===(t.tcid||t.name)); if(it){ const s=cycleItemStatus(it.steps); if(s!=='UNEXECUTED'){ const mt=resultMeta(s); badge=`<span style="font-size:9px;font-weight:700;color:#fff;background:${(mt&&mt.color)||'#888'};border-radius:8px;padding:1px 7px;">${_bdEsc(s)}</span>`; } } }
    return `<div onclick="boardSelTc('${t.tcid||t.id}')" style="padding:9px 12px;border-bottom:1px solid #e3e7ec;cursor:pointer;background:${sel?'rgba(0,168,114,0.12)':'#fff'};border-left:3px solid ${sel?'#00a872':'transparent'};"><div style="display:flex;align-items:center;gap:6px;"><span style="font-family:monospace;font-size:9.5px;color:#00875a;font-weight:700;">${_bdEsc(t.tcid||t.id)}</span><span style="flex:1;"></span>${badge}</div><div style="font-size:12.5px;color:var(--text);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_bdEsc(t.name||'(이름 없음)')}</div></div>`;
  }).join('');
}
function boardSelTc(tcid){ boardTcId=tcid; boardRenderTc(); boardRenderExec(); }
// Cycle Execution 3열 헤더 = Requirements & Coverage 상세와 동일 스펙(expDetailShell)
var _cbExecTab={};   // tcid → 현재 탭
function _cbExecSwitchTab(tcid,tab){ _cbExecTab[tcid]=tab; boardRenderExec(); }
function boardRenderExec(){
  const col=document.getElementById('bd-col-exec'); if(!col) return;
  if(!boardTcId){ col.innerHTML='<div style="padding:50px;text-align:center;color:var(--text3);"><i class="ti ti-player-play" style="font-size:40px;opacity:0.2;display:block;margin-bottom:12px;"></i><div style="font-size:14px;">시험항목(TC)을 선택하면<br>시험 절차와 실행·결과가 표시됩니다</div></div>'; return; }
  const tc=tcList.find(t=>(t.tcid===boardTcId)||(t.id===boardTcId));
  if(!tc){ col.innerHTML='<div style="padding:30px;color:var(--red);">TC를 찾을 수 없습니다</div>'; return; }
  var tcid=(tc.tcid||tc.id);
  var tab=_cbExecTab[tcid]||'procedure';
  var steps=((tc.checks||[]).filter(function(x){return (x.kind||'cli')==='cli';}).length||tc._cli_count||tc._checks_count||(tc.steps||[]).length);
  var _histN=0;
  try{
    if(typeof _runHistoryLoaded!=='undefined' && !_runHistoryLoaded[tcid] && typeof _loadRunHistoryFromServer==='function'){ _loadRunHistoryFromServer(tcid); }
    if(typeof _runHistory!=='undefined' && Array.isArray(_runHistory[tcid])) _histN=_runHistory[tcid].length;
  }catch(_e){}
  var _cycN=0;
  try{
    if(typeof cycleList!=='undefined'&&Array.isArray(cycleList)){
      cycleList.forEach(function(cy){ if((cy.items||[]).some(function(it){return (it.tcid===tcid)||(it.id===tcid);})) _cycN++; });
    }
  }catch(_e){}
  var rail=[ {id:'info',icon:'ti-info-circle',label:'Info'}, {id:'env',icon:'ti-clipboard-text',label:'Environment'}, {id:'topo',icon:'ti-topology-star',label:'Topology'}, {id:'traffic',icon:'ti-antenna',label:'Traffic'}, {id:'procedure',icon:'ti-list-check',label:'Step',badge:steps||''}, {id:'issue',icon:'ti-bug',label:'Issues'}, {id:'history',icon:'ti-history',label:'History',badge:_histN||''}, {id:'cycle',icon:'ti-recycle',label:'Cycle Result',badge:_cycN||''} ];
  var idText=(typeof expDispId==='function'?expDispId(tc.tcid):tc.tcid);
  var onclicks=rail.map(function(t){return '_cbExecSwitchTab(\''+tcid+'\',\''+t.id+'\')';});
  col.innerHTML=expDetailShell('TC', idText, tc.name||'', 'var(--green)', rail, tab, onclicks,
    tcTabContent(tc,tab),
    'exportTCPDF(\''+tc.tcid+'\')',
    (typeof _procHeadBar==='function'?_procHeadBar(tcid):''),
    'exportTCPPTX(\''+tc.tcid+'\')',
    'shareTcMail(\''+tc.tcid+'\')',
    'expCopyLink(\'tc\',\''+tc.tcid+'\')',
    '', true, false, '');
  if(typeof _tcManExpImgObserveAll==='function') _tcManExpImgObserveAll();
}
async function initBoardPage(){
  await loadREQData(); await loadTCData(); await loadCycleData(); await loadDeviceData();
  boardFillTop(); boardRender();
  if(typeof cbApplyCycleHash==='function') cbApplyCycleHash();   // #cycle=ID 공유 URL 복원
  _ncAutoOpenEdit();   // ?cycleEdit=ID(별도 창)면 수정 다이얼로그 자동 오픈
}
// 별도 창에서 ?cycleEdit=<사이클id> 로 열렸을 때 → 그 사이클 수정 다이얼로그 자동 오픈 (앱은 그대로, 그 위에 모달)
function _ncAutoOpenEdit(){
  try{
    var cid=new URLSearchParams(location.search).get('cycleEdit'); if(!cid)return;
    var cy=(cycleList||[]).find(function(c){return c.id===cid;}); if(!cy)return;
    window._ncWinMode=true; try{ document.title='사이클 수정 — '+(cy.version||''); }catch(e){}
    // 창모드 전용: 앱 배경(상단바·사이드·보드) 감추고 수정 다이얼로그만 보이게 (id로 스코프 → 일반 화면 영향 없음)
    try{ if(!document.getElementById('nc-winmode-style')){ var st=document.createElement('style'); st.id='nc-winmode-style'; st.textContent='#topnav,#utop-subnav,#cycle-board,#page-board>*:not(#modal-new-cycle),.top-nav,header{visibility:hidden!important;} #page-board{padding:0!important;} body{overflow:hidden!important;background:#141a2b!important;} #modal-new-cycle{visibility:visible!important;}'; document.head.appendChild(st); } }catch(e){}
    cbSel.project=''; cbSel.mgroup=(typeof _cycMGroup==='function'?_cycMGroup(cy):''); cbSel.model=cy.model||''; cbSel.vgroup=cy.version_group||'(미분류)'; cbSel.version=cy.version||''; if(typeof cbSaveSel==='function')cbSaveSel();
    setTimeout(function(){ if(typeof openNewCycle==='function') openNewCycle(null, cy); },200);
  }catch(e){}
}

function nc2CloseDialog(){ var m=document.getElementById('modal-new-cycle'); if(m)m.remove(); if(typeof window!=='undefined'&&window._ncWinMode){ try{ window.close(); }catch(e){} } }   // 닫기 — 별도 창이면 창도 닫음
function openNewCycle(preset, editCy){
  // preset = {mgroup, model, vgroup} — 버전그룹 노드 우클릭 시 자동 지정. editCy = 수정 대상 사이클(있으면 수정 모드, UI 동일)
  var _edit=editCy||null;
  if(!_edit && !preset && cbSel && (cbSel.mgroup||cbSel.model)) preset={mgroup:cbSel.mgroup, model:cbSel.model, vgroup:cbSel.vgroup};
  let modal=document.getElementById('modal-new-cycle');
  if(modal) modal.remove();
  modal=document.createElement('div');
  modal.id='modal-new-cycle';
  modal.className='modal-overlay';
  modal.style.display='flex';   // 오버레이는 기본(중앙정렬) — 위치 안 건드림
  window._ncTcSel=_edit?new Set((_edit.items||[]).map(function(it){return it.tcid;})):new Set();   // 배정된 항목(실제 사이클 항목)
  window._ncTcPick=new Set();   // 선택(체크)만 된 항목 — [배정] 눌러야 _ncTcSel로 이동
  window._ncReqView=null; window._ncFolderView=null;
  window._ncTcAssignee={}; window._ncEditCycleId=_edit?_edit.id:null;
  _ncMailSend=_edit?!!_edit.mail_send:false;
  const e=_bdEsc;
  const folderOpts=cycleFolderList.map(f=>'<option value="'+f.id+'" '+(f.id===cycleSelFolderId?'selected':'')+'>'+e(f.name)+'</option>').join('');
  // 모델 필터 = 실제 모델(장비명·사이클 모델)만 — 모델그룹은 별도 필터(nc-tcf-mgroup)에서만 처리
  const modelOpts=[...new Set([...(deviceList||[]).map(d=>d.name),...(cycleList||[]).map(c=>c.model)].filter(Boolean))].map(m=>'<option>'+e(m)+'</option>').join('');
  const groupOpts=[...new Set((cycleList||[]).map(c=>c.version_group).filter(Boolean))].map(g=>'<option>'+e(g)+'</option>').join('');
  const famOpts='<option>L2</option><option>L3</option><option>OLT</option>';   // 제품군 고정
  const mgrpOpts=((typeof groupList!=='undefined'?groupList:[])||[]).map(function(g){var n=(g&&g.name)||g;return n?'<option>'+e(n)+'</option>':'';}).join('');
  const venFiltOpts=[...new Set(((typeof vendorList!=='undefined'?vendorList:[])||[]).map(function(v){return (v&&v.name)||v;}).filter(Boolean))].map(function(n){return '<option>'+e(n)+'</option>';}).join('');
  // 담당자 = 조직도(회사·부서·팀)별로 묶은 가입 계정 드롭다운
  var _ncByOrg={}, _ncOrgOrder=[]; (((typeof _usersList!=='undefined'&&_usersList)||[]).forEach(function(u){ var nm=(u&&(u.name||u.username))||''; if(!nm)return; var grp=[u.company,u.dept,u.team].filter(Boolean).join(' · ')||'(미지정)'; if(!_ncByOrg[grp]){_ncByOrg[grp]=[];_ncOrgOrder.push(grp);} _ncByOrg[grp].push(nm); }));
  const userOpts='<option value="">담당자 선택</option>'+_ncOrgOrder.sort().map(function(grp){ return '<optgroup label="'+e(grp)+'">'+_ncByOrg[grp].map(function(nm){return '<option>'+e(nm)+'</option>';}).join('')+'</optgroup>'; }).join('');
  const fld='width:100%;font-size:13px;padding:7px 10px;border:1.5px solid var(--border);border-radius:7px;background:#fff;outline:none;box-sizing:border-box;';
  modal.innerHTML=
    '<div id="nc-modal-box" style="position:fixed!important;left:0!important;top:0!important;right:0!important;bottom:0!important;width:auto!important;max-width:none!important;height:auto!important;max-height:none!important;border-radius:0!important;min-width:0!important;margin:0!important;padding:0!important;background:var(--bg2);box-shadow:0 12px 48px rgba(0,0,0,0.4);display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;z-index:1201;">'+
      '<div style="padding:13px 22px;border-bottom:1px solid var(--border);background:#f4f5f7;display:flex;align-items:center;gap:10px;flex-shrink:0;user-select:none;"><i class="ti '+(_edit?'ti-edit':'ti-plus')+'" style="font-size:18px;color:var(--blue);"></i><span style="font-size:16px;font-weight:800;">'+(_edit?'사이클 수정':'새 사이클 생성')+'</span><span style="flex:1;"></span>'+'<button onclick="nc2CloseDialog()" style="width:28px;height:28px;border-radius:6px;border:1px solid var(--border);background:#fff;color:var(--text3);cursor:pointer;"><i class="ti ti-x"></i></button></div>'+
      '<div id="nc-meta-row" style="padding:12px 22px;border-bottom:1px solid var(--border);background:#fafbfc;flex-shrink:0;display:'+(_edit?'none':'flex')+';gap:12px;align-items:flex-end;flex-wrap:wrap;">'+
        ''+
        '<div style="flex:1;min-width:105px;"><label style="font-size:11px;color:var(--text3);font-weight:700;display:block;margin-bottom:4px;">제품군</label><select id="nc-family" onchange="nc2FamChange()" style="'+fld+'cursor:pointer;"><option value="">선택</option>'+famOpts+'</select></div>'+
        '<div style="flex:1;min-width:120px;"><label style="font-size:11px;color:var(--text3);font-weight:700;display:block;margin-bottom:4px;">모델 그룹</label><select id="nc-mgroup" onchange="nc2GrpChange()" style="'+fld+'cursor:pointer;"><option value="">선택</option>'+mgrpOpts+'</select></div>'+
        '<div style="flex:1;min-width:170px;position:relative;"><label style="font-size:11px;color:var(--text3);font-weight:700;display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">모델명(제품명) *</label><input type="hidden" id="nc-model" onchange="nc2ModelChange()"><div id="nc-model-trig" onclick="nc2ModelDropToggle(event)" title="장비 선택 (이름 · IP)" style="width:100%;'+fld+'cursor:pointer;display:flex;align-items:center;gap:6px;"><span id="nc-model-trig-t" style="flex:1;min-width:0;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">모델그룹 선택 후 장비 선택</span><i class="ti ti-chevron-down" style="font-size:13px;color:var(--text3);flex-shrink:0;"></i></div><div id="nc-model-drop" style="display:none;position:absolute;left:0;right:0;top:100%;z-index:50;max-height:340px;overflow:auto;background:#fff;border:1.5px solid var(--blue);border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,0.18);margin-top:2px;"></div><div id="nc-model-note" style="font-size:10.5px;color:#7c3aed;margin-top:3px;line-height:1.4;"></div></div>'+
        '<div style="flex:1;min-width:120px;"><label style="font-size:11px;color:var(--text3);font-weight:700;display:block;margin-bottom:4px;">버전 그룹 *</label><input id="nc-group" list="nc-group-dl" value="'+e(_edit?(_edit.version_group||''):((cbSel&&cbSel.vgroup&&cbSel.vgroup!=='(미분류)')?cbSel.vgroup:''))+'" placeholder="예: R242" style="'+fld+'"><datalist id="nc-group-dl">'+groupOpts+'</datalist></div>'+
        '<div style="flex:1;min-width:120px;"><label style="font-size:11px;color:var(--text3);font-weight:700;display:block;margin-bottom:4px;">버전명 * (입력)</label><input id="nc-version" value="'+e(_edit?(_edit.version||''):'')+'" placeholder="예: R242_20260610" style="'+fld+'"></div>'+
      '</div>'+
      '<div style="flex:1;display:flex;overflow:hidden;min-height:0;padding:12px;gap:12px;background:var(--bg);">'+
        '<div style="width:19%;min-width:180px;background:#fff;border:1px solid var(--border);border-radius:12px;box-shadow:0 2px 10px rgba(40,50,90,0.06);display:flex;flex-direction:column;overflow:hidden;">'+
          '<div style="min-height:42px;box-sizing:border-box;padding:7px 12px;border-bottom:1px solid var(--border);background:#fff;display:flex;align-items:center;gap:6px;flex-shrink:0;border-radius:12px 12px 0 0;"><i class="ti ti-file-text" style="color:#2d6fd4;"></i><span style="font-size:12px;font-weight:800;color:#2d6fd4;">요구사항 (REQ)</span></div>'+
          '<div style="padding:6px 10px;border-bottom:1px solid #f0f0f0;flex-shrink:0;"><input id="nc-req-filter" oninput="nc2ReqList()" placeholder="🔍 REQ 검색…" style="width:100%;box-sizing:border-box;font-size:12px;padding:5px 9px;border:1px solid var(--border);border-radius:6px;outline:none;"></div>'+
          '<div id="nc-req-fp" style="flex-shrink:0;">'+nc2FilterPanel('req')+'</div>'+
          '<div style="flex:1;overflow:auto;" id="nc-req-list"></div>'+
        '</div>'+
        '<div style="flex:1;display:flex;flex-direction:column;overflow:hidden;background:#fff;border:1px solid var(--border);border-radius:12px;box-shadow:0 2px 10px rgba(40,50,90,0.06);">'+
          '<div style="min-height:42px;box-sizing:border-box;padding:7px 12px;border-bottom:1px solid var(--border);background:#fff;display:flex;align-items:center;gap:6px;flex-shrink:0;flex-wrap:wrap;border-radius:12px 12px 0 0;"><i class="ti ti-clipboard-check" style="color:#00a872;"></i><span style="font-size:12px;font-weight:800;color:#00875a;">시험항목 (TC)</span><span style="flex:1;"></span>'+
            '<button onclick="nc2AddShown(true)" title="보이는 TC를 배정" style="font-size:10.5px;padding:4px 12px;border-radius:6px;border:none;background:#00a872;color:#fff;cursor:pointer;font-weight:800;"><i class="ti ti-arrow-right" style="font-size:12px;"></i> 배정</button>'+
            '<button onclick="nc2AddShown(false)" title="보이는 TC를 배정 해제" style="font-size:10.5px;padding:4px 11px;border-radius:6px;border:1px solid #e8a3ad;background:#fff;color:#e53e5a;cursor:pointer;font-weight:700;"><i class="ti ti-arrow-left" style="font-size:12px;"></i> 해제</button>'+
            '<span style="width:1px;height:15px;background:var(--border);"></span>'+
            '<button onclick="nc2SelectAll(true)" title="모든 TC 배정" style="font-size:10px;padding:4px 8px;border-radius:6px;border:1px solid #00a87255;background:#fff;color:#00875a;cursor:pointer;font-weight:700;">전체</button>'+
            '<button onclick="nc2SelectAll(false)" title="모두 해제" style="font-size:10px;padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:#fff;color:var(--text3);cursor:pointer;">해제</button>'+
            '<button onclick="var f=document.getElementById(\'nc-tc-flt\');if(f)f.style.display=(f.style.display===\'none\'?\'\':\'none\');" title="필터 펼치기/접기" style="font-size:10px;padding:4px 9px;border-radius:6px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;"><i class="ti ti-filter" style="font-size:12px;"></i> 필터</button></div>'+
          '<div id="nc-tc-flt" style="flex-shrink:0;">'+
            '<div style="padding:6px 10px;border-bottom:1px solid #f0f0f0;display:flex;gap:6px;align-items:center;flex-wrap:wrap;background:#fff;">'+
              '<select id="nc-tcf-vendor" onchange="nc2TcfVenChange()" title="벤더 필터" style="font-size:11px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;background:#fff;outline:none;cursor:pointer;max-width:120px;"><option value="">벤더·전체</option>'+venFiltOpts+'</select>'+
              '<select id="nc-tcf-family" onchange="nc2TcfFamChange()" title="제품군 필터" style="font-size:11px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;background:#fff;outline:none;cursor:pointer;max-width:100px;"><option value="">제품군·전체</option><option>L2</option><option>L3</option><option>OLT</option></select>'+
              '<select id="nc-tcf-mgroup" onchange="nc2TcfGrpChange()" title="모델그룹 필터" style="font-size:11px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;background:#fff;outline:none;cursor:pointer;max-width:140px;"><option value="">모델그룹·전체</option>'+mgrpOpts+'</select>'+
              '<select id="nc-tcf-model" onchange="nc2TcList()" title="모델 필터 (비대상은 빗금)" style="font-size:11px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;background:#fff;outline:none;cursor:pointer;max-width:140px;"><option value="">모델·전체</option>'+modelOpts+'</select>'+
            '</div>'+
            '<div id="nc-tc-fp">'+nc2FilterPanel('tc')+'</div>'+
          '</div>'+
          '<div style="padding:7px 10px;border-bottom:1px solid #f0f0f0;flex-shrink:0;"><input id="nc-tc-filter" oninput="nc2TcList()" placeholder="🔍 TC 검색" style="width:100%;box-sizing:border-box;font-size:12px;padding:6px 10px;border:1px solid var(--border);border-radius:7px;outline:none;"></div>'+
          '<div style="flex:1;overflow:auto;" id="nc-tc-list"></div>'+
        '</div>'+
        '<div style="width:44%;min-width:360px;display:flex;flex-direction:column;overflow:hidden;background:#fff;border:1px solid var(--border);border-radius:12px;box-shadow:0 2px 10px rgba(40,50,90,0.06);">'+
          '<div style="min-height:42px;box-sizing:border-box;padding:7px 12px;border-bottom:1px solid var(--border);background:#fff;display:flex;align-items:center;gap:6px;flex-shrink:0;flex-wrap:wrap;border-radius:12px 12px 0 0;"><i class="ti ti-clipboard-list" style="color:#2d6fd4;"></i><span style="font-size:12px;font-weight:800;color:#1c5fb0;">배정된 항목</span><span id="nc-asg-cnt" style="font-size:11px;font-weight:800;color:#fff;background:#2d6fd4;border-radius:9px;padding:1px 8px;">0</span><span style="flex:1;"></span>'+
            '<span style="position:relative;display:inline-flex;align-items:center;"><input type="hidden" id="nc-assignee"><button id="nc-asg-trig" type="button" onclick="nc2AsgToggle(event)" title="전체 항목에 담당자 일괄 지정 (개별은 항목 칩 클릭)" style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;padding:4px 11px;border-radius:7px;border:1px solid #cdddf5;background:#eef4ff;color:#2d6fd4;cursor:pointer;white-space:nowrap;"><i class="ti ti-users" id="nc-asg-trig-ic" style="font-size:13px;"></i><span id="nc-asg-trig-t">담당자 일괄</span></button><div id="nc-asg-panel" style="display:none;position:absolute;top:100%;right:0;z-index:60;width:300px;margin-top:3px;background:#fff;border:1px solid var(--border);border-radius:9px;box-shadow:0 10px 30px rgba(20,30,60,0.18);overflow:hidden;"></div></span>'+
            '<button id="nc-mail-btn" onclick="nc2ToggleMail()" title="담당자에게 사이클 생성 메일 발송 여부" style="font-size:11px;font-weight:700;padding:4px 11px;border-radius:7px;border:1px solid #cdddf5;background:#fff;color:#2d6fd4;cursor:pointer;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;"><i class="ti ti-mail" style="font-size:13px;"></i> 메일 발송</button>'+
            '<button onclick="nc2MailPreview()" title="담당자에게 보낼 메일 미리보기" style="font-size:11px;font-weight:700;padding:4px 11px;border-radius:7px;border:1px solid #cdddf5;background:#fff;color:#2d6fd4;cursor:pointer;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;"><i class="ti ti-eye" style="font-size:13px;"></i> 미리보기</button>'+
            '<span style="font-size:10px;color:var(--text3);font-weight:700;margin-left:4px;">기간</span><input type="date" id="nc-start" value="'+e(_edit?(_edit.start_date||''):'')+'" title="시작일" style="font-size:10.5px;padding:3px 5px;border:1px solid var(--border);border-radius:5px;outline:none;"><span style="color:var(--text3);font-size:11px;">~</span><input type="date" id="nc-end" value="'+e(_edit?(_edit.end_date||''):'')+'" title="종료일" style="font-size:10.5px;padding:3px 5px;border:1px solid var(--border);border-radius:5px;outline:none;">'+
            '<button onclick="nc2ClearAssigned()" title="전체 비우기" style="font-size:10px;padding:2px 9px;border-radius:5px;border:1px solid var(--border);background:#fff;color:var(--text3);cursor:pointer;">비우기</button></div>'+
          '<datalist id="nc-assignee-dl">'+(((typeof _usersList!=='undefined'&&_usersList)||[]).map(function(u){return '<option value="'+_bdEsc(u.name||u.username||'')+'">';}).join(''))+'</datalist>'+
          '<div style="flex:1;overflow:auto;" id="nc-assigned-list"></div>'+
        '</div>'+
      '</div>'+
      '<div style="padding:11px 22px;border-top:1px solid var(--border);display:flex;align-items:center;gap:10px;flex-shrink:0;background:#fafbfc;"><span id="nc-sum" style="font-size:12.5px;color:var(--text2);font-weight:700;flex:1;"></span><button onclick="nc2CloseDialog()" style="font-size:13px;padding:8px 18px;border-radius:7px;border:1.5px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;">취소</button><button onclick="nc2Submit()" style="font-size:13px;padding:8px 22px;border-radius:7px;border:none;background:'+(_edit?'#00a872':'var(--blue)')+';color:#fff;cursor:pointer;font-weight:700;"><i class="ti '+(_edit?'ti-check':'ti-plus')+'"></i> '+(_edit?'저장':'사이클 생성')+'</button></div>'+
    '</div>';
  document.body.appendChild(modal);
  nc2ReqList(); nc2TcList(); nc2Sum();
  _ncFillAssignees(_edit?(_edit.assignee||''):'', _edit);   // 담당자 = 조직(부서)별 + 항목별 (필요시 사용자 로드)
  // 트리 노드에서 생성 시: 노드가 정한 단계(모델그룹/장비/버전그룹)만 자동 채우고 잠금 → 나머지는 사용자가 입력
  //  · mgroup 노드 → 모델그룹만 고정(모델·버전그룹·버전 입력)
  //  · model 노드  → 모델그룹+장비 고정(버전그룹·버전 입력)
  //  · vgroup 노드 → 모델그룹+장비+버전그룹 고정(버전명만 입력)
  if(preset && preset.mgroup){
    try{
      var _hide=function(el){ if(el&&el.parentElement) el.parentElement.style.display='none'; };   // 필드 컨테이너 숨김
      var mg=document.getElementById('nc-mgroup'); if(mg){ mg.value=preset.mgroup; }
      if(typeof nc2GrpChange==='function') nc2GrpChange();
      if(preset.model){ if(typeof nc2ModelPickDev==='function') nc2ModelPickDev(preset.model); }   // 장비 지정(없으면 드롭다운 열린 채 사용자 선택)
      var gp=document.getElementById('nc-group'); var hasVg=(preset.vgroup && preset.vgroup!=='(미분류)');
      if(gp && hasVg) gp.value=preset.vgroup;
      // 노드에서 정해진 항목은 숨김(제품군·모델그룹은 항상; 모델명·버전그룹은 지정됐을 때만)
      _hide(document.getElementById('nc-family'));
      _hide(mg);
      if(preset.model) _hide(document.getElementById('nc-model'));
      if(hasVg) _hide(gp);
      // 포커스: 모델 미지정→모델명, 버전그룹 미지정→버전그룹, 둘 다 지정→버전명
      var _focusId=!preset.model?'nc-model-trig':(!hasVg?'nc-group':'nc-version');
      setTimeout(function(){ try{ var f=document.getElementById(_focusId); if(f&&f.focus)f.focus(); }catch(e){} },30);
    }catch(e){}
  }
  // 수정 모드: 기존 사이클 값으로 채움 (모델그룹·장비·담당자·메일버튼) — 생성 UI와 동일하게
  if(_edit){
    try{
      var _mg2=(typeof _cycMGroup==='function')?_cycMGroup(_edit):'';
      var mg2=document.getElementById('nc-mgroup'); if(mg2 && _mg2){ mg2.value=_mg2; }
      if(typeof nc2GrpChange==='function') nc2GrpChange();
      if(_edit.model && typeof nc2ModelPickDev==='function') nc2ModelPickDev(_edit.model);
      var asg=document.getElementById('nc-assignee'); if(asg && _edit.assignee){ asg.value=_edit.assignee; }
      if(_ncMailSend){ var mb=document.getElementById('nc-mail-btn'); if(mb){ mb.style.background='#2d6fd4'; mb.style.color='#fff'; mb.innerHTML='<i class="ti ti-mail-check" style="font-size:12px;"></i> 메일 발송 ON'; } }
      if(typeof nc2ModelDropClose==='function') nc2ModelDropClose();
    }catch(e){}
  }
}
function nc2FilterPanel(target){
  const fields=((customFields&&customFields[target])||[]).filter(f=>f.active!==false&&f.useInCycle!==false&&(f.type==='Select'||f.type==='MultiSelect'));
  if(!fields.length) return '';
  const store=target==='req'?expReqFilter:expTcFilter;
  return '<div style="display:flex;gap:5px;flex-wrap:wrap;padding:5px 10px;border-bottom:1px solid #f0f0f0;background:#fff;align-items:center;"><i class="ti ti-filter" style="font-size:11px;color:var(--text3);"></i>'+fields.map(function(f){
    const cur=store[f.id]||'';
    const opts='<option value="">'+_bdEsc(f.label)+': 전체</option>'+(f.options||[]).map(function(o){const ov=cfOptValue(o);return '<option value="'+_bdEsc(ov)+'" '+(cur===ov?'selected':'')+'>'+_bdEsc(ov)+'</option>';}).join('');
    return '<select onchange="nc2SetFilter(\''+target+'\',\''+f.id+'\',this.value)" style="font-size:10.5px;padding:3px 6px;border:1px solid '+(cur?'#2d6fd4':'var(--border)')+';border-radius:6px;background:'+(cur?'#eef3ff':'#fff')+';outline:none;cursor:pointer;color:'+(cur?'#2d6fd4':'var(--text2)')+';font-weight:'+(cur?'700':'400')+';">'+opts+'</select>';
  }).join('')+(Object.keys(store).length?'<button onclick="nc2ClearFilter(\''+target+'\')" style="font-size:10px;color:var(--blue);background:none;border:none;cursor:pointer;">초기화</button>':'')+'</div>';
}
function nc2SetFilter(target,fid,val){ const s=target==='req'?expReqFilter:expTcFilter; if(val) s[fid]=val; else delete s[fid]; nc2RefreshFilters(); }
function nc2ClearFilter(target){ if(target==='req')expReqFilter={}; else expTcFilter={}; nc2RefreshFilters(); }
function nc2RefreshFilters(){ const rp=document.getElementById('nc-req-fp'); if(rp)rp.innerHTML=nc2FilterPanel('req'); const tp=document.getElementById('nc-tc-fp'); if(tp)tp.innerHTML=nc2FilterPanel('tc'); nc2ReqList(); nc2TcList(); nc2Sum(); }
function nc2ReqList(){
  const wrap=document.getElementById('nc-req-list'); if(!wrap)return; const e=_bdEsc;
  const f=(document.getElementById('nc-req-filter')&&document.getElementById('nc-req-filter').value||'').toLowerCase();
  const passReq=function(r){ return expReqPassFilter(r) && (!f || (r.reqid||'').toLowerCase().includes(f) || (r.title||'').toLowerCase().includes(f)); };
  const reqRow=function(r,depth){
    const tcs=tcList.filter(function(t){return t.req_id===r.id;}); const cnt=tcs.length;
    const allSel=cnt>0&&tcs.every(function(t){return window._ncTcSel.has(t.tcid||t.id);}); const someSel=tcs.some(function(t){return window._ncTcSel.has(t.tcid||t.id);});
    const view=window._ncReqView===r.id;
    return '<div onclick="nc2ReqView(\''+r.id+'\')" style="display:flex;align-items:center;gap:6px;padding:5px 8px;padding-left:'+(10+depth*14)+'px;border-bottom:1px solid #f2f4f7;cursor:pointer;background:'+(view?'rgba(45,111,212,0.08)':(someSel?'rgba(0,168,114,0.06)':''))+';border-left:3px solid '+(view?'#2d6fd4':(someSel?'#00a872':'transparent'))+';"><i class="ti ti-file-description" style="font-size:13px;color:'+(someSel?'#00875a':'var(--text3)')+';flex-shrink:0;"></i><span style="flex:1;min-width:0;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+e(r.title||r.reqid||'')+'</span><span style="font-size:9px;font-weight:700;color:'+(someSel?'#00875a':'var(--text3)')+';background:'+(someSel?'rgba(0,168,114,0.1)':'#eef0f3')+';border-radius:8px;padding:1px 6px;flex-shrink:0;">TC '+cnt+'</span></div>';
  };
  const descFids=function(id){ var r=[id]; (reqFolders||[]).filter(function(c){return c.parent===id;}).forEach(function(c){r=r.concat(descFids(c.id));}); return r; };
  const folderHtml=function(fo,depth){
    const fids=descFids(fo.id);
    const subReqs=(reqList||[]).filter(function(r){return fids.indexOf(r.folder)>=0 && passReq(r);});
    if(f && !subReqs.length && (fo.name||'').toLowerCase().indexOf(f)<0) return '';
    const childF=(reqFolders||[]).filter(function(c){return c.parent===fo.id;}).sort(function(a,b){return (a.order||0)-(b.order||0);});
    const directReqs=(reqList||[]).filter(function(r){return r.folder===fo.id && passReq(r);});
    const open=(f?true:!window['ncF_'+fo.id+'_cl']);
    const tcTotal=subReqs.reduce(function(s,r){return s+tcList.filter(function(t){return t.req_id===r.id;}).length;},0);
    const fview=window._ncFolderView===fo.id;
    return '<div>'+
      '<div title="클릭 → 이 폴더 하위 모든 TC 보기" style="display:flex;align-items:center;gap:5px;padding:5px 8px;padding-left:'+(8+depth*14)+'px;cursor:pointer;background:'+(fview?'rgba(45,111,212,0.10)':'')+';border-left:3px solid '+(fview?'#2d6fd4':'transparent')+';" onclick="nc2FolderView(\''+fo.id+'\')">'+
        ((childF.length||directReqs.length)?'<i class="ti ti-chevron-'+(open?'down':'right')+'" onclick="event.stopPropagation();window[\'ncF_'+fo.id+'_cl\']='+(open?'true':'false')+';nc2ReqList()" title="펼치기/접기" style="font-size:13px;color:var(--text3);flex-shrink:0;cursor:pointer;padding:2px;margin:-2px;"></i>':'<span style="width:13px;flex-shrink:0;"></span>')+
        (function(){ var _fi=(typeof ccIcon==='function')?ccIcon('folder'):{ic:'ti-folder',color:'var(--blue)'}; var _openIc=(_fi.ic==='ti-folder')?(_fi.ic+(open?'-open':'')):_fi.ic; return '<i class="ti '+_openIc+'" style="font-size:14px;color:'+_fi.color+';flex-shrink:0;"></i>'; })()+
        '<span style="font-size:12.5px;font-weight:700;color:var(--blue);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+e(fo.name||'')+'</span>'+
        (tcTotal?'<span style="font-size:9px;color:#2d6fd4;font-weight:700;background:rgba(45,111,212,0.08);padding:1px 5px;border-radius:4px;flex-shrink:0;">TC'+tcTotal+'</span>':'')+
      '</div>'+
      (open?('<div>'+childF.map(function(c){return folderHtml(c,depth+1);}).join('')+directReqs.map(function(r){return reqRow(r,depth+1);}).join('')+'</div>'):'')+
    '</div>';
  };
  const roots=(reqFolders||[]).filter(function(x){return !x.parent;}).sort(function(a,b){return (a.order||0)-(b.order||0);});
  // orphan(삭제된 폴더 참조) REQ 는 Coverage 화면과 동일하게 숨김 — 유령 항목 방지
  var html=roots.map(function(fo){return folderHtml(fo,0);}).join('');
  wrap.innerHTML=html||'<div style="padding:24px;text-align:center;color:var(--text3);font-size:12px;">요구사항 없음</div>';
}
function nc2ReqView(id){ window._ncReqView=id; window._ncFolderView=null; nc2ReqList(); nc2TcList(); }
function nc2FolderView(fid){ window._ncFolderView=fid; window._ncReqView=null; nc2ReqList(); nc2TcList(); }   // 폴더 클릭 → 하위 모든 TC 표시
function _ncDescFids(id){ var r=[id]; (reqFolders||[]).filter(function(c){return c.parent===id;}).forEach(function(c){r=r.concat(_ncDescFids(c.id));}); return r; }// REQ 하위 전체 TC 토글 (모델 필터 없음)
function nc2TcList(){
  const wrap=document.getElementById('nc-tc-list'); if(!wrap)return; const e=_bdEsc;
  const f=(document.getElementById('nc-tc-filter')&&document.getElementById('nc-tc-filter').value||'').toLowerCase();
  let tcs, hdr;
  if(f){ tcs=tcList.filter(t=>expTcPassFilter(t)&&((t.tcid||'').toLowerCase().includes(f)||(t.name||'').toLowerCase().includes(f))); hdr='<i class="ti ti-search"></i> "'+e(f)+'" — '+tcs.length+'건 (전체 REQ)'; }
  else if(window._ncReqView){ const r=reqList.find(x=>x.id===window._ncReqView); tcs=tcList.filter(t=>t.req_id===window._ncReqView&&expTcPassFilter(t)); hdr=e(r?((r.reqid||'')+' · '+(r.title||'')):''); }
  else if(window._ncFolderView){ var _fids=_ncDescFids(window._ncFolderView); var _ridset={}; (reqList||[]).forEach(function(r){ if(_fids.indexOf(r.folder)>=0)_ridset[r.id]=1; }); tcs=tcList.filter(function(t){return _ridset[t.req_id]&&expTcPassFilter(t);}); var _fo=(reqFolders||[]).find(function(x){return x.id===window._ncFolderView;}); hdr='<i class="ti ti-folder"></i> '+e(_fo?_fo.name:'')+' 하위 전체 — '+tcs.length+'건'; }
  else if(Object.keys(expTcFilter).length){ tcs=tcList.filter(expTcPassFilter); hdr='<i class="ti ti-filter"></i> 필터 적용 — '+tcs.length+'건 (전체 REQ)'; }
  else { wrap.innerHTML='<div style="padding:30px 16px;text-align:center;color:var(--text3);font-size:12px;"><i class="ti ti-arrow-left" style="font-size:24px;opacity:0.3;display:block;margin-bottom:8px;"></i>왼쪽 REQ를 클릭하거나<br>위 <b>TC 필터</b>로 검색하세요<br><span style="font-size:11px;">(또는 [전체 선택]으로 전체 포함)</span></div>'; return; }
  // 모델명 선택 시 TC 필터링 제거 — 모델은 사이클 생성에만 사용, 목록은 그대로 표시
  wrap.innerHTML='<div style="padding:5px 11px;font-size:11px;color:#2d6fd4;font-weight:700;background:#f6f9ff;border-bottom:1px solid #e3ecfb;position:sticky;top:0;">'+hdr+'</div>'+
    (tcs.length?tcs.map(function(t){ const k=t.tcid||t.id; const assigned=window._ncTcSel.has(k); const picked=(window._ncTcPick&&window._ncTcPick.has(k)); const ids=(k||'').replace(/^U-REQ-SYS-/i,'');
      const _iN=(t.issue_list||[]).length; const _hN=(t.result_history||[]).length;
      const _badges=(_iN?'<span title="이슈 '+_iN+'건" style="flex-shrink:0;font-size:9.5px;font-weight:700;color:#c0392b;background:rgba(192,57,43,0.1);border-radius:8px;padding:1px 6px;display:inline-flex;align-items:center;gap:2px;"><i class="ti ti-bug" style="font-size:11px;"></i>'+_iN+'</span>':'')+(_hN?'<span title="시험 이력 '+_hN+'건" style="flex-shrink:0;font-size:9.5px;font-weight:700;color:#2d6fd4;background:rgba(45,111,212,0.1);border-radius:8px;padding:1px 6px;display:inline-flex;align-items:center;gap:2px;"><i class="ti ti-history" style="font-size:11px;"></i>'+_hN+'</span>':'')+(assigned?'<span title="이미 배정됨" style="flex-shrink:0;font-size:9px;font-weight:800;color:#fff;background:#00a872;border-radius:8px;padding:1px 7px;">배정됨</span>':'');
      const _fm=(typeof _ncTcFilterMatch==='function')?_ncTcFilterMatch(t):true;
      // 음영(필터 비대상) = 클릭·선택 불가
      if(!_fm){
        return '<div title="모델/모델그룹 필터 비대상 — 선택 불가" style="display:flex;align-items:center;gap:8px;padding:7px 11px;border-bottom:1px solid #eef0f3;cursor:not-allowed;opacity:0.5;background:repeating-linear-gradient(45deg,#e9edf2,#e9edf2 5px,#f6f8fb 5px,#f6f8fb 10px);"><i class="ti ti-ban" style="font-size:14px;color:#c5cbd6;flex-shrink:0;"></i><span style="font-size:10.5px;color:#9aa1ad;font-weight:700;flex-shrink:0;">'+e(ids)+'</span><span style="flex:1;min-width:0;font-size:12px;color:#9aa1ad;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+e(t.name||'')+'</span></div>';
      }
      const _ic=picked?'ti-square-check-filled':'ti-square';
      const _icCol=picked?'#2d6fd4':'#c5cbd6';
      const _bg=picked?'#eef4ff':(assigned?'#f2fbf6':'');
      return '<div title="클릭 → 선택/해제 ([배정] 눌러야 실제 배정)" onclick="nc2TcCheck(\''+e(k)+'\','+(picked?'false':'true')+')" style="display:flex;align-items:center;gap:8px;padding:7px 11px;border-bottom:1px solid #eef0f3;cursor:pointer;background:'+_bg+';"><i class="ti '+_ic+'" style="font-size:15px;color:'+_icCol+';flex-shrink:0;"></i><span style="font-size:10.5px;color:#00875a;font-weight:700;flex-shrink:0;">'+e(ids)+'</span><span style="flex:1;min-width:0;font-size:12px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+e(t.name||'')+'</span>'+_badges+'</div>';
    }).join(''):'<div style="padding:24px;text-align:center;color:var(--text3);font-size:12px;">이 요구사항의 TC 없음</div>');
}
// TC 클릭 = '선택'(_ncTcPick) 토글만. 실제 배정은 [배정] 버튼(nc2AddShown)에서.
function nc2TcCheck(k,checked){
  var t=(tcList||[]).find(function(x){return (x.tcid||x.id)===k;});
  if(t && typeof _ncTcFilterMatch==='function' && !_ncTcFilterMatch(t)) return;   // 음영(필터 비대상) 선택 차단
  window._ncTcPick=window._ncTcPick||new Set();
  if(checked)window._ncTcPick.add(k); else window._ncTcPick.delete(k);
  nc2TcList();
}
// [전체]/[해제]: 보이는 TC를 '선택'(_ncTcPick) 전체 토글 (배정 아님). 음영 제외.
function nc2SelectAll(on){
  window._ncTcPick=window._ncTcPick||new Set();
  if(on){ _ncShownTcs().forEach(function(k){ var t=(tcList||[]).find(function(x){return (x.tcid||x.id)===k;}); if(!(t&&typeof _ncTcFilterMatch==='function'&&!_ncTcFilterMatch(t))) window._ncTcPick.add(k); }); }
  else { window._ncTcPick.clear(); }
  nc2TcList();
}
// 현재 화면에 '보이는' TC 목록(nc2TcList와 동일 필터) — 추가/삭제(배정/해제) 대상
function _ncShownTcs(){
  const f=(document.getElementById('nc-tc-filter')&&document.getElementById('nc-tc-filter').value||'').toLowerCase();
  let tcs=[];
  if(f){ tcs=tcList.filter(t=>expTcPassFilter(t)&&((t.tcid||'').toLowerCase().includes(f)||(t.name||'').toLowerCase().includes(f))); }
  else if(window._ncReqView){ tcs=tcList.filter(t=>t.req_id===window._ncReqView&&expTcPassFilter(t)); }
  else if(window._ncFolderView){ var _fids=_ncDescFids(window._ncFolderView); var _ridset={}; (reqList||[]).forEach(function(r){ if(_fids.indexOf(r.folder)>=0)_ridset[r.id]=1; }); tcs=tcList.filter(function(t){return _ridset[t.req_id]&&expTcPassFilter(t);}); }
  else if(Object.keys(expTcFilter||{}).length){ tcs=tcList.filter(expTcPassFilter); }
  return tcs.map(t=>t.tcid||t.id);
}
// Zephyr식 배정/해제: 보이는 TC를 사이클에 추가(Assign) / 삭제(Unassign)
// [배정]/[해제]: 선택(_ncTcPick)된 TC를 배정/해제. 선택이 없으면 보이는 TC 전체 대상(편의).
function nc2AddShown(add){
  var pick=[...(window._ncTcPick||[])];
  var ks=pick.length?pick:_ncShownTcs();
  // 음영(필터 비대상) 제외
  ks=ks.filter(function(k){ var t=(tcList||[]).find(function(x){return (x.tcid||x.id)===k;}); return !(t&&typeof _ncTcFilterMatch==='function'&&!_ncTcFilterMatch(t)); });
  if(!ks.length){ if(typeof showToast==='function')showToast(add?'배정할 TC를 먼저 선택(체크)하세요':'해제할 TC를 먼저 선택하세요'); return; }
  ks.forEach(function(k){ if(add)window._ncTcSel.add(k); else window._ncTcSel.delete(k); });
  if(window._ncTcPick) window._ncTcPick.clear();   // 배정 후 선택 초기화
  nc2ReqList(); nc2TcList(); nc2Sum(); if(typeof showToast==='function')showToast((add?'➕ ':'➖ ')+ks.length+'개 TC '+(add?'배정':'해제'));
}
// ── 사이클 모델 = TC 모델그룹 매칭 ──
function nc2CurModel(){ var el=document.getElementById('nc-model'); return el?String(el.value||'').trim():''; }
function _tcModelGroups(tc){ var s=[]; (tc&&tc.checks||[]).forEach(function(c){ if((c.kind||'cli')==='model'){ var mn=String(c.modelName||'').trim(); if(mn&&mn!=='공통'&&s.indexOf(mn)<0) s.push(mn); } }); return s; }
// 매칭 토큰 = 모델그룹 이름 + 대상 장비의 이름·모델 (사용자가 장비명으로 지정해도 인식)
function _tcModelTokens(tc){ var s=new Set(); (tc&&tc.checks||[]).forEach(function(c){ if((c.kind||'cli')==='model'){ var mn=String(c.modelName||'').trim(); if(mn&&mn!=='공통') s.add(mn); (Array.isArray(c.devices)?c.devices:[]).forEach(function(id){ var l=(typeof labList!=='undefined'?labList:[]).find(function(x){return x.id===id;}); if(l){ if(l.name)s.add(String(l.name).trim()); if(l.model)s.add(String(l.model).trim()); } }); } }); return [...s]; }
function _tcHasModelGroup(tc, model){ if(!model) return true; var toks=_tcModelTokens(tc); var wanted=String(model).split(',').map(function(s){return s.trim();}).filter(Boolean); if(!wanted.length) return true; return wanted.some(function(m){ return toks.indexOf(m)>=0; }); }   // 모델그룹명 또는 대상 장비명/모델 중 하나라도 보유하면 표시
// 시험항목(TC) 필터: 모델그룹/모델 select 기준 매칭 (비대상은 빗금/음영)
function _ncTcFilterMatch(t){
  var vn=(document.getElementById('nc-tcf-vendor')||{}).value||'';
  var fam=(document.getElementById('nc-tcf-family')||{}).value||'';
  var mg=(document.getElementById('nc-tcf-mgroup')||{}).value||'';
  var md=(document.getElementById('nc-tcf-model')||{}).value||'';
  // 벤더 필터: TC가 참조하는 모델/그룹의 벤더가 선택 벤더와 일치해야 함
  if(vn){ var toks0=(typeof _tcModelTokens==='function')?_tcModelTokens(t):[]; var ml0=(typeof modelList!=='undefined')?modelList:[]; var gl0=(typeof groupList!=='undefined'?groupList:[])||[];
    var vok=toks0.some(function(tk){ var mm=ml0.find(function(x){return x.name===tk;}); if(mm&&mm.vendor===vn)return true; var gg=gl0.find(function(g){return (g&&g.name)===tk;}); return gg&&gg.vendor===vn; });
    if(!vok) return false;
  }
  // 제품군 필터(L2/L3/OLT): TC 참조 모델/그룹의 제품군(role/family)이 일치해야 함
  if(fam){ var toksF=(typeof _tcModelTokens==='function')?_tcModelTokens(t):[]; var mlF=(typeof modelList!=='undefined')?modelList:[]; var glF=(typeof groupList!=='undefined'?groupList:[])||[];
    var _famOf=function(s){ var r=String(s||'').toUpperCase(); if(r.indexOf('L3')>=0)return 'L3'; if(r.indexOf('OLT')>=0)return 'OLT'; if(r.indexOf('L2')>=0)return 'L2'; return ''; };
    var fok=toksF.some(function(tk){ var mm=mlF.find(function(x){return x.name===tk;}); if(mm&&(_famOf(mm.role)===fam||_famOf(mm.family)===fam))return true; var gg=glF.find(function(g){return (g&&g.name)===tk;}); return gg&&_famOf(gg.family)===fam; });
    if(!fok) return false;
  }
  if(!mg && !md) return true;
  if(md && _tcHasModelGroup(t, md)) return true;
  if(mg){ var toks=(typeof _tcModelTokens==='function')?_tcModelTokens(t):[]; var ml=(typeof modelList!=='undefined')?modelList:[]; if(toks.some(function(tk){ if(tk===mg)return true; var mm=ml.find(function(x){return x.name===tk;}); return mm&&mm.group===mg; })) return true; }
  return false;
}
// TC 필터: 모델그룹 선택 시 모델 select를 그 그룹 소속 장비로 한정
function nc2TcfGrpChange(){
  var mg=(document.getElementById('nc-tcf-mgroup')||{}).value||'';
  var sel=document.getElementById('nc-tcf-model');
  if(sel){ var ml=(typeof modelList!=='undefined')?modelList:[]; var seen={}, names=[];
    ((typeof deviceList!=='undefined'?deviceList:[])||[]).forEach(function(d){ if(!d||!d.name)return; var _mn=String((d.model||d.name)||'').trim(); var m=ml.find(function(x){return String(x.name||'').trim()===_mn;}); var dg=(m&&m.group)||''; if(mg && dg!==mg)return; var nm=String(d.name).trim(); if(seen[nm])return; seen[nm]=1; names.push(nm); });
    names.sort(function(a,b){return String(a).localeCompare(String(b),undefined,{numeric:true});});
    sel.innerHTML='<option value="">모델·전체</option>'+names.map(function(n){return '<option>'+_bdEsc(n)+'</option>';}).join('');
  }
  nc2TcList();
}
// TC 필터: 벤더 선택 시 → 벤더+제품군 기준으로 모델그룹·모델 갱신(nc2TcfFamChange에 위임)
function nc2TcfVenChange(){ nc2TcfFamChange(); }
// TC 필터: 제품군(L2/L3/OLT) 선택 시 → 그 제품군의 모델그룹·모델만 (선택된 벤더도 함께 반영)
function nc2TcfFamChange(){
  var vn=(document.getElementById('nc-tcf-vendor')||{}).value||'';
  var fam=(document.getElementById('nc-tcf-family')||{}).value||'';
  var _famOf=function(s){ var r=String(s||'').toUpperCase(); if(r.indexOf('L3')>=0)return 'L3'; if(r.indexOf('OLT')>=0)return 'OLT'; if(r.indexOf('L2')>=0)return 'L2'; return ''; };
  var gl=(typeof groupList!=='undefined'?groupList:[])||[]; var ml=(typeof modelList!=='undefined')?modelList:[];
  var gsel=document.getElementById('nc-tcf-mgroup');
  if(gsel){ var grps=gl.filter(function(g){ if(!g)return false; if(vn && g.vendor!==vn)return false; if(fam && _famOf(g.family)!==fam)return false; return true; }).map(function(g){return g.name||g;}).filter(Boolean); grps=[...new Set(grps)];
    gsel.innerHTML='<option value="">모델그룹·전체</option>'+grps.map(function(n){return '<option>'+_bdEsc(n)+'</option>';}).join('');
  }
  var msel=document.getElementById('nc-tcf-model');
  if(msel){ var seen={}, names=[];
    ((typeof deviceList!=='undefined'?deviceList:[])||[]).forEach(function(d){ if(!d||!d.name)return; var _mn=String((d.model||d.name)||'').trim(); var mm=ml.find(function(x){return String(x.name||'').trim()===_mn;});
      if(vn && mm && mm.vendor && mm.vendor!==vn)return;
      if(fam){ var f=(mm&&(_famOf(mm.role)||_famOf(mm.family)))||_famOf(d.role); if(f!==fam)return; }
      var nm=String(d.name).trim(); if(seen[nm])return; seen[nm]=1; names.push(nm);
    });
    names.sort(function(a,b){return String(a).localeCompare(String(b),undefined,{numeric:true});});
    msel.innerHTML='<option value="">모델·전체</option>'+names.map(function(n){return '<option>'+_bdEsc(n)+'</option>';}).join('');
  }
  nc2TcList();
}
function _allTcModelGroups(){ var s=new Set(); (tcList||[]).forEach(function(t){ _tcModelGroups(t).forEach(function(m){ s.add(m); }); }); return [...s]; }
// 모델 변경 시 — 해당 모델그룹 없는 TC는 선택 해제 + 목록 재필터
function nc2ModelChange(){ nc2ReqList(); nc2TcList(); nc2Sum(); }   // 모델 선택 = 폴더 이름 지정용 (TC 선택/목록 필터링 안 함)
// ── 모델 선택 드롭다운 (타이핑 없이 체크박스로 여러 모델 선택) ──
function _nc2AvailModels(){
  var fam=(document.getElementById('nc-family')||{}).value||'';
  var grp=(document.getElementById('nc-mgroup')||{}).value||'';
  var ml=(typeof modelList!=='undefined')?modelList:[];
  if(fam||grp){   // 제품군/모델그룹 선택 시 → 해당하는 등록 장비만
    var sf=new Set();
    (typeof deviceList!=='undefined'?deviceList:[]).forEach(function(d){ if(!d||!d.name)return; var _mn=String((d.model||d.name)||'').trim(); var m=ml.find(function(x){return String(x.name||'').trim()===_mn;}); var df=(m&&m.family)||d.family||''; var dg=(m&&m.group)||''; if(fam&&df!==fam)return; if(grp&&dg!==grp)return; sf.add(String(d.name).trim()); });
    return [...sf].filter(Boolean);
  }
  var s=new Set();
  if(typeof _allTcModelGroups==='function') _allTcModelGroups().forEach(function(m){ if(m)s.add(String(m).trim()); });
  (tcList||[]).forEach(function(t){ (typeof _tcModelTokens==='function'?_tcModelTokens(t):[]).forEach(function(m){ if(m)s.add(String(m).trim()); }); });
  (typeof deviceList!=='undefined'?deviceList:[]).forEach(function(d){ if(d&&d.name)s.add(String(d.name).trim()); });
  (cycleList||[]).forEach(function(c){ if(c.model)s.add(String(c.model).trim()); });
  return [...s].filter(Boolean);
}
function nc2FamChange(){
  var fam=(document.getElementById('nc-family')||{}).value||'';
  var mg=document.getElementById('nc-mgroup');
  if(mg){ var grps=[...new Set(((typeof groupList!=='undefined'?groupList:[])||[]).filter(function(g){ return !fam || (g&&g.family)===fam; }).map(function(g){return (g&&g.name)||g;}).filter(Boolean))]; mg.innerHTML='<option value="">선택</option>'+grps.map(function(n){return '<option>'+_bdEsc(n)+'</option>';}).join(''); }
  nc2GrpChange();
}
function nc2GrpChange(){
  var grp=(document.getElementById('nc-mgroup')||{}).value||'';
  var hid=document.getElementById('nc-model'); if(hid)hid.value='';
  nc2ModelTrigText('');
  nc2ModelBuild();
  if(grp){ nc2ModelDropOpen(); }   // 모델그룹 선택 시 모델명 드롭다운 자동 열기
  if(typeof nc2ModelChange==='function')nc2ModelChange();
}
// ── 모델명 커스텀 드롭다운 (이름 좌측 | IP 우측 정렬, deviceList 실시간) ──
function _nc2ModelDevs(){   // 현재 제품군/모델그룹 필터에 맞는 장비 (이름·IP) — deviceList 실시간
  var grp=(document.getElementById('nc-mgroup')||{}).value||'';
  var fam=(document.getElementById('nc-family')||{}).value||'';
  var ml=(typeof modelList!=='undefined')?modelList:[]; var seen={}, devs=[];
  ((typeof deviceList!=='undefined'?deviceList:[])||[]).forEach(function(d){ if(!d||!d.name)return; var _mn=String((d.model||d.name)||'').trim(); var _b1=_mn.replace(/_\d+$/,''); var _b2=_mn.replace(/\s*\([^)]*\)\s*$/,''); var _b3=_b2.replace(/_\d+$/,''); var m=ml.find(function(x){var xn=String(x.name||'').trim(); return xn===_mn||xn===_b1||xn===_b2||xn===_b3;}); var dg=(m&&m.group)||''; var df=(m&&m.family)||d.family||''; if(grp){ if(dg!==grp)return; } else if(fam){ if(df!==fam)return; } var nm=String(d.name).trim(); if(seen[nm])return; seen[nm]=1; var _ip=String(d.ip||d.mgmt_ip||d.host||'').trim(); if(!_ip){ var _l=(typeof labList!=='undefined'?labList:[]).find(function(x){return x&&x.name===nm&&x.ip;}); if(_l)_ip=String(_l.ip).trim(); } var _zone=String(d.lab||'').trim(); if(!_zone && (d.rack_id||d.rack_name)){ var _rk=(typeof labRacks!=='undefined'?labRacks:[]).find(function(r){return r.id===d.rack_id||r.name===d.rack_name;}); _zone=String((_rk&&(_rk.label||_rk.name))||d.rack_name||'').trim(); } devs.push({name:nm, ip:_ip, zone:_zone}); });   // 접미사(_1/_2, (5.55) 등) 붙은 장비도 modelList 매칭
  devs.sort(function(a,b){return String(a.name).localeCompare(String(b.name),undefined,{numeric:true});});
  return devs;
}
function nc2ModelBuild(){
  var drop=document.getElementById('nc-model-drop'); if(!drop)return;
  var grp=(document.getElementById('nc-mgroup')||{}).value||'', fam=(document.getElementById('nc-family')||{}).value||'';
  var devs=_nc2ModelDevs(); var e=_bdEsc; var cur=(document.getElementById('nc-model')||{}).value||'';
  drop.innerHTML = devs.length ? devs.map(function(d){ var on=(d.name===cur); return '<div onclick="nc2ModelPickDev(\''+e(d.name)+'\')" style="display:flex;align-items:center;gap:10px;padding:7px 11px;border-bottom:1px solid #f0f2f5;cursor:pointer;background:'+(on?'#eef3ff':'#fff')+';" onmouseenter="this.style.background=\'#f5f8ff\'" onmouseleave="this.style.background=\''+(on?'#eef3ff':'#fff')+'\'"><span style="flex:1;min-width:0;font-size:12.5px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:'+(on?'700':'500')+';">'+e(d.name)+'</span>'+(d.zone?'<span title="Rack View 구역" style="flex-shrink:0;font-size:10px;font-weight:800;color:#fff;background:#0e7490;border-radius:8px;padding:1px 7px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+e(d.zone)+'</span>':'')+'<span style="flex-shrink:0;font-size:11.5px;color:'+(d.ip?'#2d6fd4':'#c0c4cc')+';font-family:ui-monospace,monospace;font-weight:600;min-width:96px;text-align:right;">'+(d.ip?e(d.ip):'IP 없음')+'</span></div>'; }).join('') : '<div style="padding:14px;text-align:center;color:var(--text3);font-size:12px;">'+(grp||fam?'해당 장비 없음':'모델그룹을 먼저 선택하세요')+'</div>';
}
function nc2ModelTrigText(name){ var t=document.getElementById('nc-model-trig-t'); if(!t)return; if(name){ t.textContent=name; t.style.color='var(--text)'; } else { t.textContent='모델그룹 선택 후 장비 선택'; t.style.color='var(--text3)'; } }
function nc2ModelPickDev(name){ var hid=document.getElementById('nc-model'); if(hid)hid.value=name; nc2ModelTrigText(name); nc2ModelDropClose(); if(typeof nc2ModelChange==='function')nc2ModelChange(); }
function nc2ModelDropToggle(ev){ if(ev){ev.stopPropagation();} var drop=document.getElementById('nc-model-drop'); if(!drop)return; if(drop.style.display==='none'||!drop.style.display){ nc2ModelDropOpen(); } else { nc2ModelDropClose(); } }
function nc2ModelDropOpen(){ var drop=document.getElementById('nc-model-drop'); if(!drop)return; nc2ModelBuild(); drop.style.display='block'; setTimeout(function(){ document.addEventListener('mousedown',_nc2ModelDocClose,true); },0); }
function nc2ModelDropClose(){ var drop=document.getElementById('nc-model-drop'); if(drop)drop.style.display='none'; document.removeEventListener('mousedown',_nc2ModelDocClose,true); }
function _nc2ModelDocClose(ev){ var wrap=document.getElementById('nc-model-drop'), trig=document.getElementById('nc-model-trig'); if(wrap && !wrap.contains(ev.target) && trig && !trig.contains(ev.target)){ nc2ModelDropClose(); } }
function nc2CurModelSet(){ return new Set(nc2CurModel().split(',').map(function(s){return s.trim();}).filter(Boolean)); }
function _nc2SelTcModels(){ var t2=new Set(); [...(window._ncTcSel||[])].forEach(function(k){ var t=(tcList||[]).find(function(x){return (x.tcid||x.id)===k;}); if(t&&typeof _tcModelTokens==='function') _tcModelTokens(t).forEach(function(m){ if(m)t2.add(String(m).trim()); }); }); return t2; }function nc2ModelPanelRender(){
  var p=document.getElementById('nc-model-panel'); if(!p)return; var e=_bdEsc;
  var inp=document.getElementById('nc-model'); var v=inp?String(inp.value||''):''; var lt=v.split(',').pop().trim().toLowerCase();
  var selToks=_nc2SelTcModels();
  var avail=_nc2AvailModels();
  if(lt) avail=avail.filter(function(m){ return String(m).toLowerCase().indexOf(lt)>=0; });   // 입력 일치(부분 포함)
  avail.sort(function(a,b){ if(lt){ var pa=String(a).toLowerCase().indexOf(lt)===0?0:1, pb=String(b).toLowerCase().indexOf(lt)===0?0:1; if(pa!==pb)return pa-pb; } var sa=selToks.has(a)?0:1, sb=selToks.has(b)?0:1; return sa-sb||String(a).localeCompare(b,undefined,{numeric:true}); });   // 접두어 일치 우선
  var rows=avail.length?avail.map(function(m){ var hot=selToks.has(m); var ms=String(m).replace(/[\\\x27"]/g,''); return '<div onclick="nc2ModelPick(\''+ms+'\')" style="display:flex;align-items:center;gap:8px;padding:6px 9px;border-radius:6px;cursor:pointer;font-size:12.5px;'+(hot?'background:#faf7ff;':'')+'" onmouseenter="this.style.background=\'#eef3ff\'" onmouseleave="this.style.background=\''+(hot?'#faf7ff':'')+'\'"><i class="ti ti-router" style="font-size:14px;color:#2d6fd4;flex-shrink:0;"></i><span style="flex:1;">'+e(m)+(hot?' <span style="font-size:9px;color:#7c3aed;font-weight:700;">선택TC</span>':'')+'</span></div>'; }).join(''):'<div style="padding:12px;text-align:center;color:var(--text3);font-size:12px;">'+(lt?('"'+e(lt)+'" 일치 장비 없음 — 직접 입력 가능'):'장비 없음')+'</div>';
  p.innerHTML=rows;
}
// 타이핑 시 일치 장비 드롭다운 표시 (필터링은 선택/blur 시에만 — 부분입력으로 TC가 사라지지 않게)
function _ncModelDocClose(ev){ var p=document.getElementById('nc-model-panel'); if(!p){ document.removeEventListener('mousedown',_ncModelDocClose,true); return; } var inp=document.getElementById('nc-model'), btn=document.getElementById('nc-model-btn'); if((p.contains&&p.contains(ev.target))||(inp&&inp.contains(ev.target))||(btn&&btn.contains(ev.target))) return; p.style.display='none'; document.removeEventListener('mousedown',_ncModelDocClose,true); }   // 바깥 클릭 시 드롭다운 닫기
function _ncModelPanelOpen(){ var p=document.getElementById('nc-model-panel'); if(!p)return; nc2ModelPanelRender(); p.style.display='block'; document.removeEventListener('mousedown',_ncModelDocClose,true); document.addEventListener('mousedown',_ncModelDocClose,true); }// 드롭다운에서 클릭 → 마지막 토큰을 선택값으로 교체
function nc2ModelPick(m){ var el=document.getElementById('nc-model'); if(!el)return; var parts=String(el.value).split(','); parts[parts.length-1]=(parts.length>1?' ':'')+m; el.value=parts.join(','); var p=document.getElementById('nc-model-panel'); if(p)p.style.display='none'; document.removeEventListener('mousedown',_ncModelDocClose,true); nc2ModelChange(); }// ── "TC 대상 장비 그대로" 모드 ──
function nc2AutoNote(){
  var note=document.getElementById('nc-model-note'); if(!note)return;
  var on=!!(document.getElementById('nc-autodev')&&document.getElementById('nc-autodev').checked);
  if(!on){ note.innerHTML=''; return; }
  var byModel={}; var devTot=0;
  [...(window._ncTcSel||[])].forEach(function(k){ var t=(tcList||[]).find(function(x){return (x.tcid||x.id)===k;}); if(!t)return;
    var pairs=(typeof _tcDeviceModelPairs==='function')?_tcDeviceModelPairs(t):[];
    pairs.forEach(function(pr){ (byModel[pr.model]=byModel[pr.model]||new Set()).add(pr.devId); devTot++; });
  });
  var mks=Object.keys(byModel);
  if(![...(window._ncTcSel||[])].length){ note.innerHTML='<span style="color:#8a8f9c;">TC를 선택하면 그 TC의 장비(대상 장비·없으면 세션)로 자동 생성됩니다.</span>'; return; }
  if(!mks.length){ note.innerHTML='<span style="color:#c47d00;">⚠ 선택한 TC에 대상 장비·세션 장비가 모두 없습니다 — 체크 해제 후 모델 직접 입력</span>'; return; }
  note.innerHTML='✓ TC 장비 그대로 → <b>'+mks.length+'개 모델 · 항목 '+devTot+'개</b> 자동 생성<br><span style="color:#8a8f9c;">'+mks.map(function(m){return _bdEsc(m)+'('+byModel[m].size+'대)';}).join(', ')+'</span>';
}
function nc2Sum(){ const el=document.getElementById('nc-sum'); if(el){ const reqN=new Set([...window._ncTcSel].map(function(k){ const t=tcList.find(x=>(x.tcid||x.id)===k); return t?t.req_id:null; }).filter(Boolean)).size; el.innerHTML='선택: <span style="color:#2d6fd4;">요구사항 '+reqN+'</span> · <span style="color:#00875a;">TC '+window._ncTcSel.size+'</span>'; } if(typeof nc2AutoNote==='function') nc2AutoNote(); nc2AssignedList(); }
// 배정된 항목(Zephyr 실행 목록) 패널 — _ncTcSel 을 목록으로, 개별 X 제거
function nc2AssignedList(){ var wrap=document.getElementById('nc-assigned-list'); var cntEl=document.getElementById('nc-asg-cnt'); if(!wrap)return; var e=_bdEsc; var ks=[...(window._ncTcSel||[])]; if(cntEl)cntEl.textContent=ks.length;
  if(!ks.length){ wrap.innerHTML='<div style="padding:24px 14px;text-align:center;color:var(--text3);font-size:11.5px;line-height:1.6;"><i class="ti ti-clipboard-off" style="font-size:22px;opacity:0.3;display:block;margin-bottom:6px;"></i>배정된 TC 없음<br>가운데 목록에서 <b style="color:#00875a;">＋추가</b> 하세요</div>'; return; }
  // REQ별 그룹
  var byReq={}, order=[]; ks.forEach(function(k){ var t=(tcList||[]).find(function(x){return (x.tcid||x.id)===k;}); var rid=(t&&t.req_id)||'(미지정)'; if(!byReq[rid]){byReq[rid]=[];order.push(rid);} byReq[rid].push({k:k,t:t}); });
  var html=''; order.forEach(function(rid){ var rq=(reqList||[]).find(function(x){return x.id===rid;}); var rn=rq?((rq.reqid||'')+(rq.title?(' '+rq.title):'')):(rid==='(미지정)'?'미지정':rid);
    html+='<div style="padding:4px 10px 3px;font-size:10px;font-weight:800;color:#2d6fd4;background:#f3f8ff;border-bottom:1px solid #e6eefb;position:sticky;top:0;">'+e(String(rn).replace(/^U-REQ-SYS-/,''))+' <span style="color:#9aa1ad;font-weight:600;">('+byReq[rid].length+')</span></div>';
    byReq[rid].forEach(function(o){ var ids=(o.k||'').replace(/^U-REQ-SYS-/i,''); var _asg=(window._ncTcAssignee&&window._ncTcAssignee[o.k])||'';   // 항목(TC)별 담당자
      var ek=e(o.k).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      var _asgChip=_asg?('<span onclick="event.stopPropagation();nc2AsgItemToggle(event,\''+ek+'\')" title="담당자: '+e(_asg)+' (클릭하여 변경)" style="flex-shrink:0;cursor:pointer;display:inline-flex;align-items:center;gap:4px;background:#eef4ff;border:1px solid #cdddf5;border-radius:10px;padding:1px 7px 1px 2px;">'+_ncAvatar(_asg,16)+'<span style="font-size:10px;color:#2d6fd4;font-weight:700;max-width:64px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+e(_asg)+'</span></span>')
        :('<span onclick="event.stopPropagation();nc2AsgItemToggle(event,\''+ek+'\')" title="담당자 지정" style="flex-shrink:0;cursor:pointer;font-size:9.5px;font-weight:700;color:#7a8190;background:#f1f2f5;border:1px solid #e1e4ea;border-radius:9px;padding:1px 8px;display:inline-flex;align-items:center;gap:3px;"><i class="ti ti-user-plus" style="font-size:11px;"></i>지정</span>');
      html+='<div style="display:flex;align-items:center;gap:6px;padding:5px 9px 5px 11px;border-bottom:1px solid #f0f2f5;font-size:11.5px;"><span style="font-size:10px;color:#00875a;font-weight:700;flex-shrink:0;">'+e(ids)+'</span><span style="flex:1;min-width:0;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+e((o.t&&o.t.name)||'')+'</span>'+_asgChip+'<i class="ti ti-x" onclick="nc2RemoveAssigned(\''+e(o.k)+'\')" title="배정 해제" style="font-size:13px;color:#c0788a;cursor:pointer;flex-shrink:0;"></i></div>'; });
  }); wrap.innerHTML=html;
}
// 메일 미리보기: 담당자별로 묶어 각 담당자에게 갈 메일을 미리 확인 (백엔드 preview 모드)
async function nc2MailPreview(){
  var gv=function(id){ var el=document.getElementById(id); return el?String(el.value||''):''; };
  var ks=window._ncTcSel?[].concat([...window._ncTcSel]):[];
  if(!ks.length){ showToast('배정된 TC가 없습니다'); return; }
  // 담당자별 그룹 (항목별 담당자 → 없으면 일괄값)
  var common=(document.getElementById('nc-assignee')||{}).value||'';
  var byAsg={}, order=[];
  ks.forEach(function(k){ var t=(tcList||[]).find(function(x){return (x.tcid||x.id)===k;}); var a=((window._ncTcAssignee&&window._ncTcAssignee[k])||common||''); if(!a)return; if(!byAsg[a]){byAsg[a]=[];order.push(a);} byAsg[a].push({id:k, name:(t&&t.name)||'', req:(t&&t.req_id)||''}); });
  if(!order.length){ showToast('담당자를 먼저 지정하세요 (항목 칩 또는 담당자 일괄)'); return; }
  showToast('미리보기 생성 중…');
  var previews=[];
  for(var i=0;i<order.length;i++){ var a=order[i];
    try{ var d=await userApi('POST','/api/notify/cycle',{preview:true, assignee:a, version_group:gv('nc-group'), version:gv('nc-version'), count:byAsg[a].length, model:gv('nc-model'), start:gv('nc-start'), end:gv('nc-end'), items:byAsg[a]});
      previews.push({assignee:a, to:d.to||'', subject:d.subject||'', html:d.html||'', n:byAsg[a].length}); }
    catch(e){ previews.push({assignee:a, err:(e.message||'오류'), n:byAsg[a].length}); }
  }
  _nc2ShowMailPreview(previews);
}
function _nc2ShowMailPreview(previews){
  var e=_bdEsc; var old=document.getElementById('nc-mailprev-modal'); if(old)old.remove();
  var tabs=previews.map(function(p,i){ return '<button onclick="_nc2MailPrevTab('+i+')" data-mpi="'+i+'" class="nc-mp-tab" style="font-size:11.5px;font-weight:700;padding:6px 13px;border:1px solid var(--border);border-bottom:none;border-radius:8px 8px 0 0;background:'+(i===0?'#fff':'#f1f3f7')+';color:'+(i===0?'#2d6fd4':'var(--text2)')+';cursor:pointer;margin-right:3px;">'+e(p.assignee)+(p.to?'':' ⚠')+' <span style="font-size:9.5px;color:#00875a;">'+p.n+'건</span></button>'; }).join('');
  var panes=previews.map(function(p,i){ var body=p.err?('<div style="padding:24px;color:#c0392b;font-size:13px;">⚠ '+e(p.err)+'</div>'):('<div style="font-size:12px;color:var(--text3);margin-bottom:8px;">받는사람: <b style="color:var(--text)">'+e(p.to||'(이메일 없음)')+'</b> · 제목: <b style="color:var(--text)">'+e(p.subject)+'</b></div><div style="border:1px solid var(--border);border-radius:9px;overflow:auto;background:#f7f8fa;padding:14px;">'+(p.html||'')+'</div>'); return '<div class="nc-mp-pane" data-mpi="'+i+'" style="display:'+(i===0?'block':'none')+';">'+body+'</div>'; }).join('');
  var m=document.createElement('div'); m.id='nc-mailprev-modal'; m.className='modal-overlay'; m.style.display='flex'; m.style.zIndex='100060';
  m.innerHTML='<div class="modal" style="width:1040px;max-width:96vw;height:96vh;max-height:96vh;border-radius:13px;padding:0;display:flex;flex-direction:column;overflow:hidden;">'+
    '<div style="padding:13px 18px;border-bottom:1px solid var(--border);background:#f4f5f7;display:flex;align-items:center;gap:9px;flex-shrink:0;"><i class="ti ti-mail-share" style="color:#2d6fd4;font-size:17px;"></i><span style="font-size:15px;font-weight:800;">메일 미리보기 ('+previews.length+'명)</span><span style="flex:1;"></span><button onclick="document.getElementById(\'nc-mailprev-modal\').remove()" style="width:28px;height:28px;border-radius:6px;border:1px solid var(--border);background:#fff;color:var(--text3);cursor:pointer;"><i class="ti ti-x"></i></button></div>'+
    '<div style="padding:11px 18px 0;flex-shrink:0;background:#fafbfc;border-bottom:1px solid var(--border);"><div style="display:flex;flex-wrap:wrap;">'+tabs+'</div></div>'+
    '<div style="flex:1;overflow:auto;padding:16px 18px;">'+panes+'</div>'+
    '<div style="padding:11px 18px;border-top:1px solid var(--border);background:#fafbfc;display:flex;align-items:center;gap:8px;flex-shrink:0;"><span style="flex:1;font-size:11.5px;color:var(--text3);">실제 발송은 저장 시 <b>메일 발송 ON</b>이면 담당자별로 전송됩니다.</span><button onclick="document.getElementById(\'nc-mailprev-modal\').remove()" style="font-size:13px;padding:7px 18px;border-radius:7px;border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:700;">닫기</button></div>'+
  '</div>';
  document.body.appendChild(m);
}
function _nc2MailPrevTab(i){ document.querySelectorAll('#nc-mailprev-modal .nc-mp-pane').forEach(function(el){ el.style.display=(String(el.getAttribute('data-mpi'))===String(i))?'block':'none'; }); document.querySelectorAll('#nc-mailprev-modal .nc-mp-tab').forEach(function(b){ var on=(String(b.getAttribute('data-mpi'))===String(i)); b.style.background=on?'#fff':'#f1f3f7'; b.style.color=on?'#2d6fd4':'var(--text2)'; }); }
var _ncMailSend=false;   // 메일 발송 여부(생성 시 담당자에게 알림)
function nc2ToggleMail(){ _ncMailSend=!_ncMailSend; var b=document.getElementById('nc-mail-btn'); if(b){ b.style.background=_ncMailSend?'#2d6fd4':'#fff'; b.style.color=_ncMailSend?'#fff':'#2d6fd4'; b.style.borderColor=_ncMailSend?'#2d6fd4':'#cdddf5'; b.innerHTML='<i class="ti ti-mail'+(_ncMailSend?'-check':'')+'" style="font-size:13px;"></i> 메일 발송'+(_ncMailSend?' ON':''); } }
// 담당자 = 현대적 커스텀 드롭다운(검색·부서 그룹·아바타). 가입 계정 미로드면 서버에서 로드
async function _ncFillAssignees(cur, editCy){
  try{ if((typeof _usersList==='undefined'||!_usersList||!_usersList.length) && typeof userApi==='function'){ var d=await userApi('GET','/api/users'); if(d&&d.users) _usersList=d.users; } }catch(e){}
  window._ncTcAssignee=window._ncTcAssignee||{};
  // 수정 모드: 기존 사이클 항목의 개별 담당자를 로드
  if(editCy && Array.isArray(editCy.items)){ editCy.items.forEach(function(it){ var k=it.tcid; if(k && it.assignee) window._ncTcAssignee[k]=it.assignee; }); }
  var hid=document.getElementById('nc-assignee'); if(hid)hid.value=cur||'';
  nc2AsgTrigText(cur||''); _ncAsgTarget='__ALL__';
  if(typeof nc2AssignedList==='function')nc2AssignedList();
}
function _ncAvatar(name,size){ name=String(name||'').trim(); if(!name)return ''; size=size||20; var ch=name.charAt(0).toUpperCase(); var cols=['#2d6fd4','#00a872','#e8820c','#7c3aed','#e53e5a','#0d9488','#c2410c','#0ea5e9']; var h=0; for(var i=0;i<name.length;i++)h=(h*31+name.charCodeAt(i))>>>0; var col=cols[h%cols.length]; return '<span style="display:inline-flex;align-items:center;justify-content:center;width:'+size+'px;height:'+size+'px;border-radius:50%;background:'+col+';color:#fff;font-size:'+Math.round(size*0.46)+'px;font-weight:800;flex-shrink:0;">'+_bdEsc(ch)+'</span>'; }
function nc2AsgTrigText(name){ var t=document.getElementById('nc-asg-trig-t'); var b=document.getElementById('nc-asg-trig'); var ic=document.getElementById('nc-asg-trig-ic'); if(!t)return;
  t.textContent='담당자 할당';   // 버튼 라벨은 항상 '담당자 할당' 고정 (선택값은 항목 칩에 표시)
  if(name){ if(ic)ic.className='ti ti-users'; if(b){ b.style.background='#eef4ff'; b.style.color='#2d6fd4'; b.style.borderColor='#cdddf5'; b.title='담당자 일괄 지정: '+name+' (클릭하여 변경)'; } }
  else { if(ic)ic.className='ti ti-users'; if(b){ b.style.background='#eef4ff'; b.style.color='#2d6fd4'; b.style.borderColor='#cdddf5'; b.title='담당자 일괄 지정 (가입 계정 · 부서별)'; } } }
var _ncAsgSel={company:'',dept:'',team:''};   // 담당자 드릴다운 선택 상태
function nc2AsgOrgPick(level,val){ if(level==='company'){_ncAsgSel.company=val;_ncAsgSel.dept='';_ncAsgSel.team='';} else if(level==='dept'){_ncAsgSel.dept=val;_ncAsgSel.team='';} else if(level==='team'){_ncAsgSel.team=val;}
  var q=(document.getElementById('nc-asg-search')||{}).value||'';   // 조직 필터 변경 시 검색어 유지
  nc2AsgPanelRender(q);
  var s=document.getElementById('nc-asg-search'); if(s){ try{ s.focus(); s.setSelectionRange(s.value.length,s.value.length); }catch(e){} } }
// 조직(회사→부서→팀) 먼저 선택 → 좁혀진 인원만 표시 (100명도 단계로 좁혀 스크롤 최소화)
function nc2AsgPanelRender(q){
  var p=document.getElementById('nc-asg-panel'); if(!p)return; var e=_bdEsc; q=String(q||'').toLowerCase().trim();
  var cur=(_ncAsgTarget&&_ncAsgTarget!=='__ALL__'&&window._ncTcAssignee)?(window._ncTcAssignee[_ncAsgTarget]||''):((document.getElementById('nc-assignee')||{}).value||'');   // 타깃(전체/특정TC)의 현재 담당자
  var users=((typeof _usersList!=='undefined'&&_usersList)||[]).filter(function(u){return u&&(u.name||u.username);});
  var uniq=function(arr){var s={},o=[];arr.forEach(function(x){x=x||'';if(!s[x]){s[x]=1;o.push(x);}});return o.sort();};
  // 단계별 옵션(상위 선택으로 좁힘)
  var companies=uniq(users.map(function(u){return u.company||'';}).filter(Boolean));
  var depts=uniq(users.filter(function(u){return !_ncAsgSel.company||u.company===_ncAsgSel.company;}).map(function(u){return u.dept||'';}).filter(Boolean));
  var teams=uniq(users.filter(function(u){return (!_ncAsgSel.company||u.company===_ncAsgSel.company)&&(!_ncAsgSel.dept||u.dept===_ncAsgSel.dept);}).map(function(u){return u.team||'';}).filter(Boolean));
  var selStyle='font-size:13px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:#fff;outline:none;cursor:pointer;flex:1;min-width:0;font-weight:600;';
  var opt=function(list,curv,ph){ return '<option value="">'+ph+'</option>'+list.map(function(x){return '<option'+(curv===x?' selected':'')+'>'+e(x)+'</option>';}).join(''); };
  var _tgtLabel=(_ncAsgTarget==='__ALL__')?'전체 항목 일괄 지정':('항목 '+e(String(_ncAsgTarget||'').replace(/^U-REQ-SYS-/i,'')));
  var bar='<div style="padding:6px 9px 5px;border-bottom:1px solid #e6eefb;background:#eef4ff;font-size:10.5px;font-weight:800;color:#2d6fd4;display:flex;align-items:center;gap:5px;"><i class="ti '+(_ncAsgTarget==='__ALL__'?'ti-users':'ti-user')+'" style="font-size:13px;"></i>'+_tgtLabel+'</div>'
    +'<div style="padding:7px 9px;border-bottom:1px solid #eef0f4;background:#fafbfd;display:flex;flex-direction:column;gap:5px;">'
    +'<div style="display:flex;gap:5px;">'
    +(companies.length?'<select onchange="nc2AsgOrgPick(\'company\',this.value)" title="회사" style="'+selStyle+'">'+opt(companies,_ncAsgSel.company,'회사·전체')+'</select>':'')
    +'<select onchange="nc2AsgOrgPick(\'dept\',this.value)" title="부서" style="'+selStyle+'">'+opt(depts,_ncAsgSel.dept,'부서·전체')+'</select>'
    +(teams.length?'<select onchange="nc2AsgOrgPick(\'team\',this.value)" title="팀" style="'+selStyle+'">'+opt(teams,_ncAsgSel.team,'팀·전체')+'</select>':'')
    +'</div>'
    +'<input id="nc-asg-search" oninput="nc2AsgListRender(this.value)" value="'+e(q)+'" placeholder="🔍 이름 검색" style="width:100%;box-sizing:border-box;font-size:13px;padding:7px 9px;border:1px solid var(--border);border-radius:6px;outline:none;"></div>';
  // 인원 리스트는 별도 컨테이너에만 렌더 → 검색 입력 시 이 영역만 갱신(검색창 유지 = 포커스 안 풀림)
  p.innerHTML=bar+'<div id="nc-asg-hint"></div><div id="nc-asg-list" style="max-height:300px;overflow:auto;"></div>';
  nc2AsgListRender(q);
}
// 검색어(q)로 인원 목록만 다시 그림 — 검색 input 요소는 그대로 두어 포커스 유지
function nc2AsgListRender(q){
  var listEl=document.getElementById('nc-asg-list'); if(!listEl)return; var e=_bdEsc; q=String(q||'').toLowerCase().trim();
  var cur=(_ncAsgTarget&&_ncAsgTarget!=='__ALL__'&&window._ncTcAssignee)?(window._ncTcAssignee[_ncAsgTarget]||''):((document.getElementById('nc-assignee')||{}).value||'');
  var users=((typeof _usersList!=='undefined'&&_usersList)||[]).filter(function(u){return u&&(u.name||u.username);});
  var list=users.filter(function(u){ if(_ncAsgSel.company&&u.company!==_ncAsgSel.company)return false; if(_ncAsgSel.dept&&(u.dept||'')!==_ncAsgSel.dept)return false; if(_ncAsgSel.team&&(u.team||'')!==_ncAsgSel.team)return false; var nm=(u.name||u.username||''); if(q&&nm.toLowerCase().indexOf(q)<0)return false; return true; });
  var hintEl=document.getElementById('nc-asg-hint');
  if(hintEl) hintEl.innerHTML=(!_ncAsgSel.company&&!_ncAsgSel.dept&&!q)?('<div style="padding:6px 11px;font-size:10px;color:var(--text3);background:#fff8ec;border-bottom:1px solid #f0e2c4;"><i class="ti ti-info-circle"></i> 부서를 먼저 선택하면 인원이 좁혀집니다 ('+list.length+'명)</div>'):'';
  var body='<div onclick="nc2AsgPick(\'\')" style="padding:6px 11px;font-size:11.5px;color:var(--text3);cursor:pointer;border-bottom:1px solid #f3f4f7;" onmouseenter="this.style.background=\'#f5f8ff\'" onmouseleave="this.style.background=\'#fff\'"><i class="ti ti-user-off" style="font-size:12px;"></i> 담당자 없음</div>';
  if(!list.length){ body+='<div style="padding:16px;text-align:center;color:var(--text3);font-size:11.5px;">'+(users.length?'해당 인원 없음':'등록된 계정 없음')+'</div>'; }
  else { body+=list.map(function(u){ var nm=(u.name||u.username); var on=(nm===cur); var sub=[u.dept,u.team,u.position].filter(Boolean).join(' · '); return '<div onclick="nc2AsgPick(\''+e(nm).replace(/\\/g,'\\\\').replace(/'/g,"\\'")+'\')" style="display:flex;align-items:center;gap:8px;padding:6px 11px;cursor:pointer;background:'+(on?'#eef3ff':'#fff')+';" onmouseenter="this.style.background=\'#f5f8ff\'" onmouseleave="this.style.background=\''+(on?'#eef3ff':'#fff')+'\'">'+_ncAvatar(nm,22)+'<span style="flex:1;min-width:0;"><div style="font-size:12px;font-weight:'+(on?'800':'600')+';color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+e(nm)+'</div>'+(sub?('<div style="font-size:9.5px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+e(sub)+'</div>'):'')+'</span>'+(on?'<i class="ti ti-check" style="font-size:13px;color:#2d6fd4;"></i>':'')+'</div>'; }).join(''); }
  listEl.innerHTML=body;
}
var _ncAsgTarget='__ALL__';   // 담당자 패널 타깃: '__ALL__'(전체 일괄) 또는 특정 tcid(항목별)
function _nc2AsgOpen(){ var p=document.getElementById('nc-asg-panel'); if(!p)return; _ncAsgSel={company:'',dept:'',team:''}; nc2AsgPanelRender(''); p.style.display='block'; setTimeout(function(){ document.addEventListener('mousedown',_nc2AsgDocClose,true); },10); }
function nc2AsgToggle(ev){ if(ev){try{ev.stopPropagation();}catch(e){}} var p=document.getElementById('nc-asg-panel'); if(!p)return; var open=(p.style.display!=='none'&&p.style.display!==''); if(open && _ncAsgTarget==='__ALL__'){ p.style.display='none'; document.removeEventListener('mousedown',_nc2AsgDocClose,true); } else { _ncAsgTarget='__ALL__'; _nc2AsgOpen(); } }
function nc2AsgItemToggle(ev,tcid){ if(ev){try{ev.stopPropagation();}catch(e){}} var p=document.getElementById('nc-asg-panel'); if(!p)return; var open=(p.style.display!=='none'&&p.style.display!=='');
  // 패널을 클릭한 칩 근처로 이동
  if(open && _ncAsgTarget===tcid){ p.style.display='none'; document.removeEventListener('mousedown',_nc2AsgDocClose,true); return; }
  _ncAsgTarget=tcid; _nc2AsgOpen(); }
function _nc2AsgDocClose(ev){ var p=document.getElementById('nc-asg-panel'); var t=document.getElementById('nc-asg-trig'); if(!p)return; if((p.contains&&p.contains(ev.target))||(t&&t.contains&&t.contains(ev.target)))return; p.style.display='none'; document.removeEventListener('mousedown',_nc2AsgDocClose,true); }
function nc2AsgPick(name){
  if(_ncAsgTarget==='__ALL__'){ var hid=document.getElementById('nc-assignee'); if(hid)hid.value=name||''; nc2AsgTrigText(name||''); window._ncTcAssignee=window._ncTcAssignee||{}; (window._ncTcSel?[].concat([...window._ncTcSel]):[]).forEach(function(k){ if(name)window._ncTcAssignee[k]=name; else delete window._ncTcAssignee[k]; }); }   // 전체 일괄
  else { window._ncTcAssignee=window._ncTcAssignee||{}; if(name)window._ncTcAssignee[_ncAsgTarget]=name; else delete window._ncTcAssignee[_ncAsgTarget]; }   // 항목별
  var p=document.getElementById('nc-asg-panel'); if(p)p.style.display='none'; document.removeEventListener('mousedown',_nc2AsgDocClose,true);
  if(typeof nc2AssignedList==='function')nc2AssignedList(); }
function nc2RemoveAssigned(k){ if(window._ncTcSel)window._ncTcSel.delete(k); nc2ReqList(); nc2TcList(); nc2Sum(); }
function nc2ClearAssigned(){ window._ncTcSel=new Set(); nc2ReqList(); nc2TcList(); nc2Sum(); }
// 모달 헤더 드래그로 창 이동 (범용)
let _mdlDrag=null;
function modalDragStart(e, boxId){
  if(e.target.closest('button')||e.target.closest('input')||e.target.closest('select')) return;
  const box=document.getElementById(boxId); if(!box) return;
  const m=(box.style.transform||'').match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
  _mdlDrag={sx:e.clientX,sy:e.clientY,ox:(m?parseFloat(m[1]):0),oy:(m?parseFloat(m[2]):0),box:box};
  document.addEventListener('mousemove',modalDragMove);
  document.addEventListener('mouseup',modalDragEnd);
  e.preventDefault();
}
function modalDragMove(e){ if(!_mdlDrag)return; _mdlDrag.box.style.transform='translate('+(_mdlDrag.ox+(e.clientX-_mdlDrag.sx))+'px,'+(_mdlDrag.oy+(e.clientY-_mdlDrag.sy))+'px)'; }
function modalDragEnd(){ _mdlDrag=null; document.removeEventListener('mousemove',modalDragMove); document.removeEventListener('mouseup',modalDragEnd); }
async function nc2Submit(){
  if(window._ncEditCycleId){ return nc2SubmitEdit(); }   // 수정 모드 → 기존 사이클 업데이트(생성/수정 UI 동일, 동작만 분기)
  if(typeof loadDeviceData==='function' && (typeof modelList==='undefined'||!modelList||!modelList.length)){ try{ await loadDeviceData(); }catch(e){} }   // 모델→그룹 해석용 modelList 보장(모델그룹 필터 정확)
  let folderId=(document.getElementById('nc-folder')&&document.getElementById('nc-folder').value)||(typeof cbSel!=='undefined'&&cbSel&&cbSel.project)||(typeof cycleSelFolderId!=='undefined'&&cycleSelFolderId)||(((typeof cycleFolderList!=='undefined'&&cycleFolderList[0])||{}).id)||'';   // 프로젝트 드롭다운 제거 → 트리 선택/첫 프로젝트 자동 사용
  const modelRaw=(document.getElementById('nc-model')&&document.getElementById('nc-model').value||'').trim();
  const group=(document.getElementById('nc-group')&&document.getElementById('nc-group').value||'').trim();
  const version=(document.getElementById('nc-version')&&document.getElementById('nc-version').value||'').trim();
  const assignee=(document.getElementById('nc-assignee')&&document.getElementById('nc-assignee').value||'').trim();
  const startDate=(document.getElementById('nc-start')&&document.getElementById('nc-start').value)||'';
  const endDate=(document.getElementById('nc-end')&&document.getElementById('nc-end').value)||'';
  const autoDev=!!(document.getElementById('nc-autodev')&&document.getElementById('nc-autodev').checked);
  if(!folderId){ var _gn=(document.getElementById('nc-mgroup')&&document.getElementById('nc-mgroup').value)||(document.getElementById('nc-family')&&document.getElementById('nc-family').value)||modelRaw||'기본 프로젝트'; var _nf={id:'cf-'+Date.now()+'-'+Math.floor(Math.random()*1000),name:_gn}; cycleFolderList=cycleFolderList||[]; cycleFolderList.push(_nf); try{ await saveCycleFolders(); }catch(e){} folderId=_nf.id; }   // 프로젝트 없으면 모델그룹 기준 폴더 자동 생성
  const ids=[...window._ncTcSel];
  if(!ids.length){showToast('TC를 1개 이상 선택하세요');return;}
  // ── 모드 A: TC의 대상 장비 그대로 사용 (모델 자동 — 더/덜 어긋남 없음) ──
  if(autoDev){
    if(!group||!version){showToast('버전그룹·버전명을 입력하세요');return;}
    const byModel={}; let anyDev=false;
    ids.forEach(function(k){ const t=tcList.find(x=>(x.tcid||x.id)===k); if(!t)return;
      const pairs=(typeof _tcDeviceModelPairs==='function')?_tcDeviceModelPairs(t):[];
      if(pairs.length){ anyDev=true; pairs.forEach(function(pr){ (byModel[pr.model]=byModel[pr.model]||[]).push({t:t,devId:pr.devId,devName:pr.devName}); }); }
      else { (byModel['공통']=byModel['공통']||[]).push({t:t,devId:'',devName:''}); }
    });
    if(!anyDev){ showToast('선택한 TC에 대상 장비·세션 장비가 없습니다 — 「TC 장비 그대로」 체크 해제 후 모델 직접 입력, 또는 TC에서 대상 장비/세션을 지정하세요'); return; }
    let madeC=0, madeI=0; const mks=Object.keys(byModel);
    for(let mi=0; mi<mks.length; mi++){ const model=mks[mi]; const recs=byModel[model]; const items=[];
      recs.forEach(function(rc){ const flt=(model==='공통'?'':model);
        // 원본 TC가 빈껍데기(checks=0)면 같은 이름의 실제 절차가 있는 TC를 찾아 대체
        var _src=rc.t;
        if(!Array.isArray(_src.checks)||!_src.checks.length){
          var _alt=tcList.find(function(x){ return (x.name||'')===(rc.t.name||'') && Array.isArray(x.checks) && x.checks.length>0 && (x.tcid||x.id)!==(rc.t.tcid||rc.t.id); });
          if(_alt) _src=_alt;
        }
        let st; try{st=JSON.parse(JSON.stringify(_checksToSteps(_src, flt)));}catch(e){st=_checksToSteps(_src, flt);}
        // 모델 필터에 걸려 스텝 0개가 되면 필터 없이 전체 TC 절차로 폴백 (모델 매핑 불일치·suffix 방어)
        if(!st||!st.length){ try{ st=JSON.parse(JSON.stringify(_checksToSteps(_src, ''))); }catch(e){ st=_checksToSteps(_src, ''); } }
        const it={tcid:rc.t.tcid||rc.t.id, name:(rc.t.name||rc.t.tcid||'')+(rc.devName?(' · '+rc.devName):''), req_id:rc.t.req_id||'', severity:rc.t.severity||'', priority:rc.t.priority||'', assignee:((window._ncTcAssignee&&window._ncTcAssignee[rc.t.tcid||rc.t.id])||assignee||''), steps:st};   // 항목별 담당자(없으면 일괄값)
        if(rc.devId){ it.devId=rc.devId; it.devName=rc.devName; }
        items.push(it); });
      const cycle={id:'cycle-'+Date.now()+'-'+mi, model:model, version_group:group, version:version, folder_id:folderId, assignee:assignee, start_date:startDate, end_date:endDate, mail_send:_ncMailSend, created_at:new Date().toISOString().slice(0,10), items:items};
      cycleList.push(cycle); await saveCycle(cycle); madeC++; madeI+=items.length;
    }
    document.getElementById('modal-new-cycle')&&document.getElementById('modal-new-cycle').remove();
    if(folderId) cycleSelFolderId=folderId;
    if(typeof renderCycleBoard==='function') renderCycleBoard();
    showToast('사이클 '+madeC+'개 · 항목 '+madeI+'개 생성 (TC 대상 장비 그대로)');
    _ncMaybeSendMail(assignee, group, version, madeC);
    return;
  }
  if(!modelRaw||!group||!version){showToast('모델명·버전그룹·버전명을 입력하세요');return;}
  // 모델명을 쉼표로 여러 개 → 모델별 사이클 자동 생성 (대상 장비 있으면 장비당 항목)
  const models=[...new Set(modelRaw.split(',').map(s=>s.trim()).filter(Boolean))];
  let madeC=0, madeI=0;
  for(let mi=0; mi<models.length; mi++){
    const model=models[mi]; const items=[];
    ids.forEach(function(k){ const t=tcList.find(x=>(x.tcid||x.id)===k); if(!t)return;
      // 원본 TC가 빈껍데기(checks=0)면 같은 이름의 실제 절차가 있는 TC를 찾아 대체
      var _src=t;
      if(!Array.isArray(_src.checks)||!_src.checks.length){
        var _alt=tcList.find(function(x){ return (x.name||'')===(t.name||'') && Array.isArray(x.checks) && x.checks.length>0 && (x.tcid||x.id)!==(t.tcid||t.id); });
        if(_alt) _src=_alt;
      }
      var steps=_checksToSteps(_src, model);
      if(!steps||!steps.length){ steps=_checksToSteps(_src, ''); }   // 모델 필터에 걸리면 필터 없이 전체 TC 절차로 폴백
      const devs=(typeof _tcTargetDevices==='function')?_tcTargetDevices(t, model):[];
      var _ia=((window._ncTcAssignee&&window._ncTcAssignee[t.tcid||t.id])||assignee||'');   // 항목별 담당자(없으면 일괄값)
      if(devs.length){ devs.forEach(function(d){ let st; try{st=JSON.parse(JSON.stringify(steps));}catch(e){st=steps;} items.push({tcid:t.tcid||t.id,name:(t.name||t.tcid||'')+' · '+d.name,req_id:t.req_id||'',severity:t.severity||'',priority:t.priority||'',assignee:_ia,devId:d.id,devName:d.name,steps:st}); }); }
      else { items.push({tcid:t.tcid||t.id,name:t.name||'',req_id:t.req_id||'',severity:t.severity||'',priority:t.priority||'',assignee:_ia,steps:steps}); }
    });
    const cycle={id:'cycle-'+Date.now()+'-'+mi,model,version_group:group,version,folder_id:folderId,assignee:assignee,start_date:startDate,end_date:endDate,mail_send:_ncMailSend,created_at:new Date().toISOString().slice(0,10),items};
    cycleList.push(cycle); await saveCycle(cycle); madeC++; madeI+=items.length;
  }
  document.getElementById('modal-new-cycle')&&document.getElementById('modal-new-cycle').remove();
  if(folderId) cycleSelFolderId=folderId;
  if(typeof renderCycleBoard==='function') renderCycleBoard();
  showToast('사이클 '+madeC+'개 생성'+(madeC>1?' (모델별)':'')+' · 항목 '+madeI+'개');
  _ncMaybeSendMail(assignee, group, version, madeC);
}
// 메일 발송 토글 ON → 미리보기와 동일하게 담당자별로 묶어 각자 자기 항목만 발송(/api/notify/cycle)
async function _ncMaybeSendMail(assignee, group, version, madeC){
  if(!_ncMailSend) return;
  var gv=function(id){ var el=document.getElementById(id); return el?String(el.value||''):''; };
  // 담당자별 그룹 (항목별 담당자 → 없으면 일괄값)
  var ks=window._ncTcSel?[].concat([...window._ncTcSel]):[];
  var byAsg={}, order=[];
  ks.forEach(function(k){ var t=(tcList||[]).find(function(x){return (x.tcid||x.id)===k;}); var a=((window._ncTcAssignee&&window._ncTcAssignee[k])||assignee||''); if(!a)return; if(!byAsg[a]){byAsg[a]=[];order.push(a);} byAsg[a].push({id:k, name:(t&&t.name)||'', req:(t&&t.req_id)||''}); });
  if(!order.length){ showToast('메일 발송: 담당자가 지정된 항목이 없어 건너뜀'); return; }
  var ok=0, fail=[];
  for(var i=0;i<order.length;i++){ var a=order[i];
    try{ await userApi('POST','/api/notify/cycle',{assignee:a, version_group:group, version:version, count:byAsg[a].length, model:gv('nc-model'), start:gv('nc-start'), end:gv('nc-end'), items:byAsg[a]}); ok++; }
    catch(e){ fail.push(a+'('+(e.message||'오류')+')'); }
  }
  if(ok) showToast('📧 담당자 '+ok+'명에게 메일 발송됨'+(fail.length?(' · 실패 '+fail.length):''));
  if(fail.length) showToast('메일 발송 실패: '+fail.join(', '));
}

// ── NC 트리: REQ 폴더 트리 ──
function ncRenderTree(){
  const wrap=document.getElementById('nc-tree');
  if(!wrap) return;
  const search=(document.getElementById('nc-req-search')?.value||'').toLowerCase();
  const roots=reqFolders.filter(f=>!f.parent).sort((a,b)=>(a.order||0)-(b.order||0));
  wrap.innerHTML=roots.length?roots.map(f=>ncFolderHtml(f,0,search)).join(''):'<div style="padding:20px;text-align:center;font-size:12px;color:var(--text3);">REQ 폴더 없음</div>';
  ncUpdateCount();
}

function ncFolderHtml(f,depth,search){
  const getAllFids=(id)=>{const r=[id];reqFolders.filter(c=>c.parent===id).forEach(c=>r.push(...getAllFids(c.id)));return r;};
  const allFids=getAllFids(f.id);
  const allReqs=reqList.filter(r=>allFids.includes(r.folder));
  const directReqs=reqList.filter(r=>r.folder===f.id);
  const children=reqFolders.filter(c=>c.parent===f.id).sort((a,b)=>(a.order||0)-(b.order||0));
  if(search&&!allReqs.some(r=>(r.reqid||'').toLowerCase().includes(search)||(r.title||'').toLowerCase().includes(search))&&!(f.name||'').toLowerCase().includes(search)) return '';
  const open=!window['ncFolder_'+f.id+'_closed'];
  const indent=depth*14;
  const tcTotal=allReqs.reduce((s,r)=>s+(r.tc||[]).length,0);
  return '<div>'+
    '<div onclick="ncSelectFolder(\''+f.id+'\')" style="display:flex;align-items:center;gap:5px;padding:6px 6px;padding-left:'+(8+indent)+'px;border-radius:5px;cursor:pointer;" onmouseenter="this.style.background=\'#f0f4ff\'" onmouseleave="this.style.background=\'\'">'+
      (children.length||directReqs.length?'<i class="ti ti-chevron-right" style="font-size:11px;color:var(--text3);transition:transform 0.15s;'+(open?'transform:rotate(90deg)':'')+';flex-shrink:0;" onclick="event.stopPropagation();window[\'ncFolder_'+f.id+'_closed\']=open;ncRenderTree()"></i>':'<span style="width:14px;flex-shrink:0;"></span>')+
      '<input type="checkbox" class="nc-folder-chk" data-fid="'+f.id+'" onchange="ncFolderCheck(\''+f.id+'\',this.checked)" onclick="event.stopPropagation()" style="flex-shrink:0;">'+
      (function(){ var _fi=(typeof ccIcon==='function')?ccIcon('folder'):{ic:'ti-folder',color:'var(--blue)'}; var _openIc=(_fi.ic==='ti-folder')?(_fi.ic+(open?'-open':'')):_fi.ic; return '<i class="ti '+_openIc+'" style="font-size:15px;color:'+_fi.color+';flex-shrink:0;"></i>'; })()+
      '<span style="font-size:13px;font-weight:700;color:var(--blue);flex:1;">'+f.name+'</span>'+
      (tcTotal?'<span style="font-size:10px;color:var(--blue);font-weight:700;background:rgba(45,111,212,0.08);padding:1px 5px;border-radius:4px;">TC'+tcTotal+'</span>':'')+
    '</div>'+
    '<div style="'+(open?'':'display:none;')+'">'+
      children.map(c=>ncFolderHtml(c,depth+1,search)).join('')+
      directReqs.map(r=>ncReqHtml(r,depth+1,search)).join('')+
    '</div>'+
  '</div>';
}

function ncReqHtml(r,depth,search){
  const refs=r.tc||[];
  if(search&&!((r.reqid||'').toLowerCase().includes(search)||(r.title||'').toLowerCase().includes(search))) return '';
  const indent=depth*14;
  return '<div onclick="ncSelectREQ(\''+r.id+'\')" id="nc-req-row-'+r.id+'" style="display:flex;align-items:center;gap:5px;padding:6px 8px;padding-left:'+(8+indent)+'px;border-radius:5px;cursor:pointer;" onmouseenter="this.style.background=\'#f0fff8\'" onmouseleave="this.style.background=window[\'ncSelReq\']==\''+r.id+'\'?\'rgba(0,168,114,0.08)\':\'\'"  >'+
    '<input type="checkbox" class="nc-req-chk" data-rid="'+r.id+'" onchange="ncReqCheck(\''+r.id+'\',this.checked);event.stopPropagation();" style="flex-shrink:0;">'+
    '<i class="ti ti-file-description" style="font-size:13px;color:var(--text3);flex-shrink:0;"></i>'+
    '<span style="font-family:monospace;font-size:11px;color:var(--blue);font-weight:700;flex-shrink:0;">'+r.reqid+'</span>'+
    '<span style="font-size:12px;color:var(--text2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+r.title+'</span>'+
    (refs.length?'<span style="font-size:10px;color:var(--green);font-weight:700;background:rgba(0,168,114,0.08);padding:1px 5px;border-radius:4px;flex-shrink:0;">TC'+refs.length+'</span>':'')+
  '</div>';
}

function ncSelectFolder(fid){
  window['ncSelReq']=null;window['ncSelFolder']=fid;
  document.querySelectorAll('[id^="nc-req-row-"]').forEach(el=>el.style.background='');
  const getAllFids=(id)=>{const r=[id];reqFolders.filter(c=>c.parent===id).forEach(c=>r.push(...getAllFids(c.id)));return r;};
  ncRenderTCPanelMulti(reqList.filter(r=>getAllFids(fid).includes(r.folder)));
}

function ncSelectREQ(reqId){
  window['ncSelReq']=reqId;
  document.querySelectorAll('[id^="nc-req-row-"]').forEach(el=>el.style.background='');
  const row=document.getElementById('nc-req-row-'+reqId);
  if(row) row.style.background='rgba(0,168,114,0.08)';
  ncRenderTCPanel(reqId);
}

function ncGetTCFilters(){ return {search:(document.getElementById('nc-tc-search')?.value||'').toLowerCase(),sev:document.getElementById('nc-tc-filter-sev')?.value||'',status:document.getElementById('nc-tc-filter-status')?.value||''}; }

function ncFilterTCItem(t,fullTC,f){
  if(f.search&&!(t.tcid||'').toLowerCase().includes(f.search)&&!(t.name||fullTC.name||'').toLowerCase().includes(f.search)) return false;
  if(f.sev&&fullTC.severity!==f.sev) return false;
  if(f.status&&fullTC.status!==f.status) return false;
  return true;
}

function ncTCItemHtml(t,reqId){
  const tcid=t.tcid||t.id||'';
  const fullTC=tcList.find(x=>x.tcid===tcid)||t;
  const stepCnt=(fullTC.steps||[]).length;
  const sevColor={'Critical':'var(--red)','Major':'#e8820c','Normal':'var(--blue)','Minor':'var(--green)','Cosmetic':'var(--text3)'};
  return '<label style="display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:5px;cursor:pointer;" onmouseenter="this.style.background=\'#f0fff8\'" onmouseleave="this.style.background=\'\'">'+
    '<input type="checkbox" class="nc-tc-chk" data-tcid="'+tcid+'" data-rid="'+reqId+'" checked onchange="ncUpdateCount()">'+
    '<i class="ti ti-clipboard-check" style="font-size:13px;color:var(--green);flex-shrink:0;"></i>'+
    '<div style="flex:1;min-width:0;">'+
      '<div style="font-family:monospace;font-size:11px;color:var(--blue);font-weight:700;">'+tcid+'</div>'+
      '<div style="font-size:12px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+(t.name||fullTC.name||'')+'</div>'+
    '</div>'+
    (fullTC.severity?'<span style="font-size:10px;padding:1px 5px;border-radius:4px;border:1px solid currentColor;color:'+(sevColor[fullTC.severity]||'#aaa')+';flex-shrink:0;">'+fullTC.severity+'</span>':'')+
    (stepCnt?'<span style="font-size:10px;color:var(--text3);flex-shrink:0;">Step '+stepCnt+'</span>':'')+
  '</label>';
}

function ncRenderTCPanel(reqId){
  const panel=document.getElementById('nc-tc-panel');
  if(!panel) return;
  const r=reqList.find(x=>x.id===reqId);
  if(!r){panel.innerHTML='<div style="padding:30px;text-align:center;color:var(--text3);">REQ를 선택하세요</div>';return;}
  const refs=r.tc||[];
  if(!refs.length){panel.innerHTML='<div style="padding:30px;text-align:center;color:var(--text3);font-size:12px;">'+r.reqid+'<br>연결된 TC 없음</div>';return;}
  const f=ncGetTCFilters();
  const filtered=refs.filter(t=>ncFilterTCItem(t,tcList.find(x=>x.tcid===(t.tcid||t.id))||t,f));
  panel.innerHTML='<div style="padding:5px 10px;font-size:11px;color:var(--text3);border-bottom:1px solid #f0f0f0;font-weight:600;background:#f8f9fb;border-radius:5px;margin-bottom:2px;">'+r.reqid+' — '+r.title+'</div>'+
    (filtered.length?filtered.map(t=>ncTCItemHtml(t,reqId)).join(''):'<div style="padding:20px;text-align:center;font-size:12px;color:var(--text3);">필터 결과 없음</div>');
  ncUpdateCount();
}

function ncRenderTCPanelMulti(reqs){
  const panel=document.getElementById('nc-tc-panel');
  if(!panel) return;
  const f=ncGetTCFilters();
  let html='';
  reqs.forEach(r=>{
    const refs=r.tc||[];
    if(!refs.length) return;
    const filtered=refs.filter(t=>ncFilterTCItem(t,tcList.find(x=>x.tcid===(t.tcid||t.id))||t,f));
    if(!filtered.length) return;
    html+='<div style="padding:5px 10px;font-size:11px;color:var(--text3);background:#f8f9fb;margin:4px 2px 2px;font-weight:600;border-radius:5px;">'+r.reqid+' — '+r.title+'</div>'+filtered.map(t=>ncTCItemHtml(t,r.id)).join('');
  });
  panel.innerHTML=html||'<div style="padding:40px;text-align:center;color:var(--text3);font-size:13px;">TC 없음</div>';
  ncUpdateCount();
}

function ncFolderCheck(fid,checked){
  const getAllFids=(id)=>{const r=[id];reqFolders.filter(c=>c.parent===id).forEach(c=>r.push(...getAllFids(c.id)));return r;};
  const rids=reqList.filter(r=>getAllFids(fid).includes(r.folder)).map(r=>r.id);
  document.querySelectorAll('.nc-tc-chk').forEach(c=>{if(rids.includes(c.dataset.rid))c.checked=checked;});
  ncUpdateCount();
}

function ncReqCheck(reqId,checked){
  document.querySelectorAll('.nc-tc-chk[data-rid="'+reqId+'"]').forEach(c=>c.checked=checked);
  ncUpdateCount();
}

function ncUpdateCount(){
  const cnt=document.querySelectorAll('.nc-tc-chk:checked').length;
  const total=document.querySelectorAll('.nc-tc-chk').length;
  const el=document.getElementById('nc-sel-count');
  if(el) el.textContent='선택: '+cnt+'/'+total+'개';
}
// ═══════════════ 사용자 인증 / 로그인 게이트 ═══════════════
let currentUser=null;
let authToken=localStorage.getItem('utop_token')||'';
const ROLE_COLORS={'관리자':'#3f5b8b','담당':'#7c3aed','팀장':'#0ea5e9','팀원':'#00a872'};
let _LOGIN_DISABLED=false; // 로그인 활성화 (임시 비활성화하려면 true)
async function authInit(){
  if(_LOGIN_DISABLED){ currentUser={username:'admin',name:'관리자',role:'관리자'}; try{ updateUserBar(); applyRoleGates(); }catch(e){} return true; }
  authToken=localStorage.getItem('utop_token')||'';
  if(authToken){
    try{
      const r=await fetch('/api/me?token='+encodeURIComponent(authToken));
      if(r.ok){ const d=await r.json(); currentUser=d.user; updateUserBar(); applyRoleGates(); startSessionWatch(); return true; }
    }catch(e){}
  }
  currentUser=null; authToken=''; localStorage.removeItem('utop_token'); showLoginGate(); return false;
}
// 세션 감시: 동일 id가 다른 곳에서 로그인하면 서버가 이 토큰을 무효화 → 감지 후 재로그인 유도 (계정당 1세션)
let _sessWatch=null;
function startSessionWatch(){
  if(_LOGIN_DISABLED) return;
  if(_sessWatch){ clearInterval(_sessWatch); }
  _sessWatch=setInterval(async function(){
    if(!authToken) return;
    try{
      const r=await fetch('/api/me?token='+encodeURIComponent(authToken));
      if(!r.ok){
        clearInterval(_sessWatch); _sessWatch=null;
        authToken=''; currentUser=null; localStorage.removeItem('utop_token');
        showLoginGate('다른 위치에서 로그인되어 현재 세션이 종료되었습니다.');
      }
    }catch(e){}
  }, 20000);
}
function showLoginGate(msg){
  let g=document.getElementById('login-gate');
  if(!g){ g=document.createElement('div'); g.id='login-gate'; document.body.appendChild(g); }
  g.style.cssText='position:fixed;inset:0;z-index:100000;background:linear-gradient(135deg,#1a2236 0%,#0f1626 100%);display:flex;align-items:center;justify-content:center;';
  const _lu=(localStorage.getItem('utop_last_user')||'').replace(/"/g,'&quot;');
  const _save=localStorage.getItem('utop_save_pw')==='1';
  let _pw=''; try{ if(_save) _pw=decodeURIComponent(escape(atob(localStorage.getItem('utop_saved_pw')||''))); }catch(_){ _pw=''; }
  const _pwv=_pw.replace(/"/g,'&quot;');
  g.innerHTML=`<div style="width:362px;background:#fff;border-radius:16px;padding:34px 32px;box-shadow:0 22px 64px rgba(0,0,0,0.45);">
    ${_gateBrandHtml()}
    <div style="font-size:12px;font-weight:700;color:#5a6072;margin-bottom:5px;">아이디</div>
    <input id="login-user" value="${_lu}" onkeydown="if(event.key==='Enter')document.getElementById('login-pw').focus()" placeholder="아이디 입력" style="width:100%;box-sizing:border-box;padding:11px 13px;border:1px solid #d0d5dd;border-radius:9px;font-size:14px;font-weight:700;color:#1a2236;margin-bottom:14px;outline:none;">
    <div style="font-size:12px;font-weight:700;color:#5a6072;margin-bottom:5px;">비밀번호</div>
    <input id="login-pw" type="password" value="${_pwv}" onkeydown="if(event.key==='Enter')doLogin()" placeholder="비밀번호" style="width:100%;box-sizing:border-box;padding:11px 13px;border:1px solid #d0d5dd;border-radius:9px;font-size:14px;font-weight:700;color:#1a2236;margin-bottom:6px;outline:none;">
    <div id="login-err" style="font-size:12px;color:#e53e5a;min-height:18px;margin-bottom:8px;">${msg||''}</div>
    <label style="display:flex;align-items:center;gap:7px;font-size:12px;color:#5a6072;margin-bottom:12px;cursor:pointer;user-select:none;"><input type="checkbox" id="login-save" ${_save?'checked':''} style="width:15px;height:15px;cursor:pointer;accent-color:#2d6fd4;"> 아이디·비밀번호 저장</label>
    <button onclick="doLogin()" style="width:100%;padding:12px;border:none;border-radius:9px;background:#2d6fd4;color:#fff;font-size:15px;font-weight:700;cursor:pointer;">로그인</button>
    <div style="text-align:center;margin-top:14px;font-size:12px;color:#8a93a5;">계정이 없으신가요? <a onclick="showSignupGate()" style="color:#2d6fd4;font-weight:700;cursor:pointer;">회원가입 신청</a></div>
  </div>`;
  _gateApplyBrand();
  setTimeout(()=>{ const el=document.getElementById(_lu?'login-pw':'login-user'); if(el) el.focus(); },60);
}
// 조직 옵션: 회사 ▸ 소속담당 ▸ 소속팀 (계층) + 직책·보직(평면)
var ORG_TREE = { companies: [], position: [], duty: [] };
function orgCompanyNames(){ return (ORG_TREE.companies||[]).map(function(c){return c.name;}); }
function orgDeptNames(company){ var c=(ORG_TREE.companies||[]).find(function(x){return x.name===company;}); return c?(c.depts||[]).map(function(d){return d.name;}):[]; }
function orgTeamNames(company,dept){ var c=(ORG_TREE.companies||[]).find(function(x){return x.name===company;}); if(!c)return []; var d=(c.depts||[]).find(function(x){return x.name===dept;}); return d?(d.teams||[]):[]; }
// 일반 select 생성 (sel 현재값, 목록에 없으면 추가). attrs 예: onchange
function orgSel(id, opts, sel, style, attrs, ph){
  var list=(opts||[]).slice(); if(sel && list.indexOf(sel)<0) list.unshift(sel);
  return '<select '+(id?('id="'+id+'" '):'')+(attrs||'')+' style="'+(style||'')+'cursor:pointer;"><option value="">'+(ph||'선택')+'</option>'+
    list.map(function(o){ var e=String(o).replace(/</g,'&lt;'); return '<option'+(sel===o?' selected':'')+'>'+e+'</option>'; }).join('')+'</select>';
}
// 종속 드롭다운 갱신: prefix(su/nu)의 company→dept→team
function orgCascade(prefix, level){
  var comp=(document.getElementById(prefix+'-company')||{}).value||'';
  var deptSel=document.getElementById(prefix+'-dept'); var teamSel=document.getElementById(prefix+'-team');
  var mk=function(arr,ph){ return '<option value="">'+ph+'</option>'+(arr||[]).map(function(o){return '<option>'+String(o).replace(/</g,'&lt;')+'</option>';}).join(''); };
  if(level==='company'){ if(deptSel)deptSel.innerHTML=mk(orgDeptNames(comp),'소속담당 선택'); if(teamSel)teamSel.innerHTML=mk([],'소속팀 선택'); }
  else if(level==='dept'){ var dept=(deptSel||{}).value||''; if(teamSel)teamSel.innerHTML=mk(orgTeamNames(comp,dept),'소속팀 선택'); }
}
async function loadOrgOptions(){
  try{ const d=await (await fetch('/api/org-options')).json(); if(d&&d.ok){ ORG_TREE.companies=Array.isArray(d.companies)?d.companies:[]; ORG_TREE.position=Array.isArray(d.position)?d.position:[]; ORG_TREE.duty=Array.isArray(d.duty)?d.duty:[]; } }catch(e){}
  return ORG_TREE;
}
try{ loadOrgOptions(); }catch(e){}   // 앱 로드 시 서버 조직 옵션 반영
async function showSignupGate(msg){
  try{ await loadOrgOptions(); }catch(e){}
  let g=document.getElementById('login-gate');
  if(!g){ g=document.createElement('div'); g.id='login-gate'; document.body.appendChild(g); }
  g.style.cssText='position:fixed;inset:0;z-index:100000;background:linear-gradient(135deg,#1a2236 0%,#0f1626 100%);display:flex;align-items:center;justify-content:center;';
  const fld='width:100%;box-sizing:border-box;padding:11px 13px;border:1px solid #d0d5dd;border-radius:9px;font-size:14px;font-weight:700;color:#1a2236;margin-bottom:11px;outline:none;';
  g.innerHTML=`<div style="width:362px;background:#fff;border-radius:16px;padding:30px 32px;box-shadow:0 22px 64px rgba(0,0,0,0.45);">
    ${_gateBrandHtml(18)}
    <div style="text-align:center;margin-bottom:20px;"><div style="font-size:18px;font-weight:800;color:#2d6fd4;">회원가입 신청</div><div style="font-size:11.5px;color:#8a93a5;margin-top:4px;">가입 신청 후 관리자 승인이 완료되면 로그인할 수 있습니다</div></div>
    <input id="su-user" placeholder="아이디" style="${fld}">
    ${orgSel('su-company', orgCompanyNames(), '', fld, `onchange="orgCascade('su','company')"`, '회사 선택')}
    ${orgSel('su-dept', [], '', fld, `onchange="orgCascade('su','dept')"`, '소속담당 선택')}
    ${orgSel('su-team', [], '', fld, '', '소속팀 선택')}
    ${orgSel('su-position', ORG_TREE.position, '', fld, '', '직책 선택')}
    ${orgSel('su-duty', ORG_TREE.duty, '', fld, '', '보직 선택')}
    <input id="su-name" placeholder="이름 (예: 홍길동)" style="${fld}">
    <input id="su-email" placeholder="회사 이메일 (예: aaa@ubiquoss.com)" style="${fld}">
    <input id="su-pw" type="password" placeholder="비밀번호" style="${fld}">
    <input id="su-pw2" type="password" onkeydown="if(event.key==='Enter')doSignup()" placeholder="비밀번호 확인" style="${fld}">
    <div id="su-err" style="font-size:12px;color:#e53e5a;min-height:18px;margin-bottom:6px;">${msg||''}</div>
    <button onclick="doSignup()" style="width:100%;padding:12px;border:none;border-radius:9px;background:#00a872;color:#fff;font-size:15px;font-weight:700;cursor:pointer;">가입 신청</button>
    <div style="text-align:center;margin-top:14px;font-size:12px;color:#8a93a5;"><a onclick="showLoginGate()" style="color:#2d6fd4;font-weight:700;cursor:pointer;">← 로그인으로 돌아가기</a></div>
  </div>`;
  _gateApplyBrand();
  setTimeout(()=>{ const el=document.getElementById('su-user'); if(el)el.focus(); },60);
}
// 로그인·회원가입 게이트 브랜드(로고+스타일 브랜드명) — 접속 후 헤더와 동일. 기본 'ubi[Q]uoss-TOP'
function _gateBrandHtml(nameSize){
  var nm = (typeof _brandNameHtml==='function') ? _brandNameHtml('ubi[Q]uoss-TOP','#e53e5a') : 'ubi<span style="color:#e53e5a;font-weight:900;font-size:1.18em;">Q</span>uoss-TOP';
  var fs = nameSize ? (nameSize+'px') : '28px';
  return '<div style="text-align:center;margin-bottom:22px;">'
    +'<img id="gate-logo" src="" alt="" style="display:none;max-height:56px;max-width:200px;margin:0 auto 10px;object-fit:contain;">'
    +'<div id="gate-name" style="font-size:'+fs+';font-weight:800;color:#1a2236;letter-spacing:0.3px;line-height:1.1;">'+nm+'</div>'
    +'<div style="font-size:11.5px;color:#8a93a5;margin-top:5px;">Ubiquoss Test Orchestration Platform</div></div>';
}
async function _gateApplyBrand(){
  try{ const d=await (await fetch('/api/branding')).json();
    const img=document.getElementById('gate-logo'); if(img&&d&&d.logo){ img.src=d.logo; img.style.display='block'; }
    const nm=document.getElementById('gate-name'); if(nm&&d&&d.name_text&&typeof _brandNameHtml==='function'){ nm.innerHTML=_brandNameHtml(d.name_text,d.name_accent_color); if(d.name_color)nm.style.color=d.name_color; if(d.name_font)nm.style.fontFamily=d.name_font; }
  }catch(e){}
}
async function doSignup(){
  const gv=id=>(document.getElementById(id)?.value||'').trim();
  const u=gv('su-user'), nm=gv('su-name'), em=gv('su-email');
  const company=gv('su-company'), dept=gv('su-dept'), team=gv('su-team'), position=gv('su-position'), duty=gv('su-duty');   // 회사·소속담당·소속팀·직책·보직
  const pw=document.getElementById('su-pw')?.value||'', pw2=document.getElementById('su-pw2')?.value||'';
  const err=document.getElementById('su-err');
  if(!u){ if(err)err.textContent='아이디를 입력하세요'; return; }
  if(!company){ if(err)err.textContent='회사를 선택하세요'; return; }
  if(!dept){ if(err)err.textContent='소속담당을 선택하세요'; return; }
  if(!team){ if(err)err.textContent='소속팀을 선택하세요'; return; }
  if(!position){ if(err)err.textContent='직책을 선택하세요'; return; }
  if(!em){ if(err)err.textContent='이메일을 입력하세요'; return; }
  if(!/@ubiquoss\.com$/i.test(em)){ if(err)err.textContent='@ubiquoss.com 이메일만 가입할 수 있습니다'; return; }
  if(!pw){ if(err)err.textContent='비밀번호를 입력하세요'; return; }
  if(pw!==pw2){ if(err)err.textContent='비밀번호가 일치하지 않습니다'; return; }
  try{
    const r=await fetch('/api/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,name:nm,email:em,password:pw,company:company,dept:dept,team:team,position:position,duty:duty})});
    if(!r.ok){ const d=await r.json().catch(()=>({})); if(err)err.textContent=(d&&d.detail)||'가입 신청 실패'; return; }
    showLoginGate('✅ 가입 신청이 접수되었습니다. 관리자 승인 후 로그인하실 수 있습니다.');
  }catch(e){ if(err)err.textContent='서버 연결 오류'; }
}
function hideLoginGate(){ const g=document.getElementById('login-gate'); if(g) g.remove(); }
async function doLogin(){
  const u=(document.getElementById('login-user')?.value||'').trim();
  const p=document.getElementById('login-pw')?.value||'';
  const err=document.getElementById('login-err');
  if(!u){ if(err)err.textContent='아이디를 입력하세요'; return; }
  try{
    const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
    if(!r.ok){ const d=await r.json().catch(()=>({})); if(err)err.textContent=(d&&d.detail)||'로그인 실패'; return; }
    const d=await r.json();
    authToken=d.token; currentUser=d.user; localStorage.setItem('utop_token',authToken);
    try{
      localStorage.setItem('utop_last_user', u);
      if(document.getElementById('login-save')?.checked){ localStorage.setItem('utop_save_pw','1'); localStorage.setItem('utop_saved_pw', btoa(unescape(encodeURIComponent(p)))); }
      else { localStorage.setItem('utop_save_pw',''); localStorage.removeItem('utop_saved_pw'); }
    }catch(_){}
    hideLoginGate(); updateUserBar(); applyRoleGates(); startSessionWatch();
    showToast('환영합니다, '+(currentUser.name||currentUser.username)+'님 ('+currentUser.role+')');
  }catch(e){ if(err)err.textContent='서버 연결 오류'; }
}
// ── 비밀번호 변경 모달 ──
// 현재 비밀번호 검증 → 새 비밀번호 저장(백엔드 /api/me/change-password) → 서버가 이 사용자 모든 세션 종료 → 프론트 로그아웃 처리
function openChangePassword(){
  const ex=document.getElementById('modal-changepw'); if(ex)ex.remove();
  const m=document.createElement('div'); m.id='modal-changepw';
  m.style.cssText='position:fixed;inset:0;z-index:100002;background:rgba(15,20,35,0.55);display:flex;align-items:center;justify-content:center;';
  m.onclick=function(e){ if(e.target===m) m.remove(); };
  m.onkeydown=function(e){ if(e.key==='Escape') m.remove(); };
  var _in=function(id, ph){ return '<div style="margin-bottom:10px;"><input id="'+id+'" type="password" autocomplete="new-password" placeholder="'+ph+'" style="width:100%;box-sizing:border-box;padding:11px 13px;border:1px solid #d0d5dd;border-radius:9px;font-size:13.5px;outline:none;"></div>'; };
  m.innerHTML='<div style="background:#fff;width:380px;max-width:92vw;border-radius:16px;padding:24px 22px 18px;box-shadow:0 22px 64px rgba(0,0,0,0.4);">'
    +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;"><div style="width:38px;height:38px;border-radius:50%;background:rgba(45,111,212,0.1);display:flex;align-items:center;justify-content:center;"><i class="ti ti-key" style="font-size:19px;color:#2d6fd4;"></i></div><div><div style="font-size:15px;font-weight:800;color:#1a2236;">비밀번호 변경</div><div style="font-size:11.5px;color:#8a93a5;">변경 후 자동으로 로그아웃됩니다.</div></div></div>'
    +_in('cpw-cur','현재 비밀번호')
    +_in('cpw-new','새 비밀번호 (4자 이상)')
    +_in('cpw-new2','새 비밀번호 재확인')
    +'<div id="cpw-err" style="min-height:18px;font-size:11.5px;color:#e53e5a;font-weight:600;margin:2px 2px 8px;"></div>'
    +'<div style="display:flex;gap:8px;">'
      +'<button onclick="document.getElementById(\'modal-changepw\').remove()" style="flex:1;padding:11px;border-radius:10px;border:1px solid #d0d5dd;background:#fff;color:#5a6072;font-size:13.5px;font-weight:700;cursor:pointer;">취소</button>'
      +'<button id="cpw-ok" onclick="doChangePassword()" style="flex:1;padding:11px;border-radius:10px;border:none;background:#2d6fd4;color:#fff;font-size:13.5px;font-weight:700;cursor:pointer;">변경</button>'
    +'</div></div>';
  document.body.appendChild(m);
  // Enter 로 다음 필드 이동 / 마지막에서 확인
  ['cpw-cur','cpw-new','cpw-new2'].forEach(function(id, i, arr){
    var el=document.getElementById(id);
    el.addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); if(i<arr.length-1){ var _n=document.getElementById(arr[i+1]); if(_n)_n.focus(); } else { doChangePassword(); } } });
  });
  setTimeout(function(){ var f=document.getElementById('cpw-cur'); if(f)f.focus(); }, 50);
}
async function doChangePassword(){
  var _err=document.getElementById('cpw-err');
  var _set=function(msg){ if(_err)_err.textContent=msg||''; };
  var _cur=(document.getElementById('cpw-cur')||{}).value||'';
  var _new=(document.getElementById('cpw-new')||{}).value||'';
  var _new2=(document.getElementById('cpw-new2')||{}).value||'';
  if(!_cur||!_new||!_new2){ _set('모든 필드를 입력하세요'); return; }
  if(_new.length<4){ _set('새 비밀번호는 4자 이상이어야 합니다'); return; }
  if(_new!==_new2){ _set('새 비밀번호가 서로 다릅니다'); return; }
  if(_new===_cur){ _set('새 비밀번호가 현재 비밀번호와 같습니다'); return; }
  _set('');
  var btn=document.getElementById('cpw-ok'); if(btn){ btn.disabled=true; btn.textContent='변경 중…'; btn.style.opacity='0.7'; }
  try{
    var r=await fetch('/api/me/change-password?token='+encodeURIComponent(authToken||''),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({current_password:_cur, new_password:_new})});
    var d=null; try{ d=await r.json(); }catch(_je){}
    if(!r.ok){ _set((d&&d.detail)||('요청 실패 ('+r.status+')')); if(btn){ btn.disabled=false; btn.textContent='변경'; btn.style.opacity=''; } return; }
    // 성공 → 모달 닫고 로그아웃 처리 (서버 세션은 이미 삭제됨)
    var m=document.getElementById('modal-changepw'); if(m)m.remove();
    try{ if(typeof _sessWatch!=='undefined'&&_sessWatch){ clearInterval(_sessWatch); _sessWatch=null; } }catch(_e){}
    authToken=''; currentUser=null; try{ localStorage.removeItem('utop_token'); }catch(_e){}
    if(typeof showLoginGate==='function') showLoginGate('비밀번호가 변경되었습니다. 새 비밀번호로 다시 로그인하세요.');
  }catch(e){ _set('요청 오류: '+e.message); if(btn){ btn.disabled=false; btn.textContent='변경'; btn.style.opacity=''; } }
}
function doLogout(){
  // 모던 확인 모달 (네이티브 confirm 대체)
  const ex=document.getElementById('logout-confirm'); if(ex)ex.remove();
  const m=document.createElement('div'); m.id='logout-confirm';
  m.style.cssText='position:fixed;inset:0;z-index:100002;background:rgba(15,20,35,0.55);display:flex;align-items:center;justify-content:center;';
  m.onclick=function(e){ if(e.target===m) m.remove(); };
  m.onkeydown=function(e){ if(e.key==='Escape') m.remove(); };
  const _nm=(currentUser&&(currentUser.name||currentUser.username))||'';
  m.innerHTML='<div style="background:#fff;width:340px;max-width:92vw;border-radius:16px;padding:26px 24px 20px;box-shadow:0 22px 64px rgba(0,0,0,0.4);text-align:center;animation:none;">'
    +'<div style="width:54px;height:54px;border-radius:50%;background:rgba(229,62,90,0.1);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;"><i class="ti ti-logout" style="font-size:26px;color:#e53e5a;"></i></div>'
    +'<div style="font-size:16px;font-weight:800;color:#1a2236;margin-bottom:6px;">로그아웃</div>'
    +'<div style="font-size:12.5px;color:#8a93a5;margin-bottom:20px;line-height:1.6;">'+(_nm?('<b style="color:#5a6072;">'+_bdEsc(_nm)+'</b>님, '):'')+'현재 세션을 종료하고<br>로그인 화면으로 돌아갑니다.</div>'
    +'<div style="display:flex;gap:9px;">'
      +'<button onclick="document.getElementById(\'logout-confirm\').remove()" style="flex:1;padding:11px;border-radius:10px;border:1px solid #d0d5dd;background:#fff;color:#5a6072;font-size:13.5px;font-weight:700;cursor:pointer;">취소</button>'
      +'<button id="logout-confirm-ok" onclick="doLogoutConfirm()" style="flex:1;padding:11px;border-radius:10px;border:none;background:#e53e5a;color:#fff;font-size:13.5px;font-weight:700;cursor:pointer;">로그아웃</button>'
    +'</div></div>';
  document.body.appendChild(m);
  setTimeout(function(){ const b=document.getElementById('logout-confirm-ok'); if(b)b.focus(); },50);
}
async function doLogoutConfirm(){
  const m=document.getElementById('logout-confirm'); if(m)m.remove();
  try{ await fetch('/api/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:authToken})}); }catch(e){}
  try{ if(typeof _sessWatch!=='undefined'&&_sessWatch){ clearInterval(_sessWatch); _sessWatch=null; } }catch(e){}
  authToken=''; currentUser=null; localStorage.removeItem('utop_token');
  showLoginGate('로그아웃되었습니다.');
}
function updateUserBar(){
  const el=document.getElementById('user-bar'); if(!el) return;
  if(!currentUser){ el.innerHTML=''; return; }
  const col=ROLE_COLORS[currentUser.role]||'#5a6072';
  el.innerHTML=`<div id="notif-bell" onclick="notifToggle()" title="알림" style="position:relative;z-index:1;cursor:pointer;display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:8px;margin-right:2px;"><i class="ti ti-bell" style="font-size:18px;color:var(--text2);"></i><span id="notif-badge" style="display:none;position:absolute;top:1px;right:1px;min-width:16px;height:16px;padding:0 4px;border-radius:9px;background:#e53e5a;color:#fff;font-size:9.5px;font-weight:800;align-items:center;justify-content:center;box-sizing:border-box;line-height:1;">0</span></div><div class="acct-wrap" style="position:relative;"><div class="acct-trigger" onclick="acctToggle(event)" title="계정 메뉴"><span style="display:inline-flex;align-items:center;gap:7px;">${_avatarHtml(currentUser,22)}<span style="font-weight:700;font-size:12.5px;">${currentUser.name||currentUser.username}</span></span><span style="font-size:10px;font-weight:800;letter-spacing:0.2px;color:${col};background:color-mix(in srgb, ${col} 13%, #fff);border:1px solid color-mix(in srgb, ${col} 26%, #fff);border-radius:20px;padding:2px 9px;">${currentUser.role}</span><i class="ti ti-chevron-down" style="font-size:14px;color:var(--text3);"></i></div><div class="acct-menu" id="dd-acct"><div class="acct-head">${_avatarHtml(currentUser,34)}<div style="min-width:0;"><div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${currentUser.name||currentUser.username}</div><div style="font-size:11px;color:var(--text3);">${currentUser.username} · ${currentUser.role}</div></div></div><div class="dd-item" onclick="acctClose();openMyProfile()"><i class="ti ti-user-circle"></i> 프로필 설정</div><div class="dd-item" onclick="acctClose();setMyAvatar()"><i class="ti ti-photo"></i> 아바타 변경</div><div class="dd-item" onclick="acctClose();openChangePassword()"><i class="ti ti-key"></i> 비밀번호 변경</div><div class="acct-sep"></div><div class="dd-item acct-danger" onclick="acctClose();doLogout()"><i class="ti ti-logout"></i> 로그아웃</div></div></div>`;
  try{ if(typeof notifLoad==='function'){ notifLoad(); if(!window._notifPoll){ window._notifPoll=setInterval(function(){ if(typeof notifLoad==='function')notifLoad(); }, 60000); } } }catch(e){}
}
// 계정 드롭다운(프로필·아바타·로그아웃) 토글
function acctToggle(ev){ if(ev&&ev.stopPropagation)ev.stopPropagation(); var m=document.getElementById('dd-acct'); if(!m)return; if(m.classList.contains('show')){ acctClose(); return; } m.classList.add('show'); setTimeout(function(){ document.addEventListener('click',acctClose); },0); }
function acctClose(){ var m=document.getElementById('dd-acct'); if(m)m.classList.remove('show'); document.removeEventListener('click',acctClose); }
// ── 아바타 ──
function _avatarHtml(u, size){
  size=size||24;
  var av=(u&&u.avatar)||'';
  if(av) return '<img src="'+av+'" style="width:'+size+'px;height:'+size+'px;border-radius:50%;object-fit:cover;flex-shrink:0;vertical-align:middle;">';
  var nm=(u&&(u.name||u.username))||''; var ch=nm?String(nm).trim().charAt(0).toUpperCase():'?';
  var col=(typeof ROLE_COLORS!=='undefined'&&u&&ROLE_COLORS[u.role])||'#5a6072';
  return '<span style="width:'+size+'px;height:'+size+'px;border-radius:50%;background:'+col+';color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:'+Math.round(size*0.5)+'px;font-weight:800;flex-shrink:0;vertical-align:middle;">'+ch+'</span>';
}
function setMyAvatar(){
  if(!currentUser){ return; }
  var inp=document.createElement('input'); inp.type='file'; inp.accept='image/*';
  inp.onchange=function(){
    var f=inp.files&&inp.files[0]; if(!f)return;
    var fr=new FileReader();
    fr.onload=function(){ var img=new Image(); img.onload=async function(){
      var s=Math.min(img.width,img.height);
      var cv=document.createElement('canvas'); cv.width=128; cv.height=128;
      cv.getContext('2d').drawImage(img,(img.width-s)/2,(img.height-s)/2,s,s,0,0,128,128);
      var dataUrl; try{ dataUrl=cv.toDataURL('image/jpeg',0.85); }catch(e){ dataUrl=fr.result; }
      try{ var d=await userApi('POST','/api/me/avatar',{avatar:dataUrl}); if(d&&d.user){ currentUser=d.user; } else { currentUser.avatar=dataUrl; } updateUserBar(); if(document.getElementById('my-profile-modal')) openMyProfile(); if(typeof showToast==='function')showToast('아바타 변경됨'); }
      catch(e){ if(typeof showToast==='function')showToast('아바타 저장 실패: '+((e&&e.message)||e)); }
    }; img.onerror=function(){ if(typeof showToast==='function')showToast('이미지를 읽을 수 없습니다'); }; img.src=fr.result; };
    fr.readAsDataURL(f);
  };
  inp.click();
}
function _profRow(k,v){ return '<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);"><span style="width:66px;color:var(--text3);flex-shrink:0;">'+k+'</span><span style="font-weight:600;color:var(--text);word-break:break-all;">'+v+'</span></div>'; }
function openMyProfile(){
  if(!currentUser) return;
  var u=currentUser; var esc=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');};
  var old=document.getElementById('my-profile-modal'); if(old)old.remove();
  var m=document.createElement('div'); m.id='my-profile-modal';
  m.style.cssText='position:fixed;inset:0;background:rgba(20,16,40,0.5);z-index:12600;display:flex;align-items:center;justify-content:center;padding:24px;';
  m.innerHTML='<div style="background:#fff;border-radius:16px;max-width:420px;width:100%;overflow:hidden;box-shadow:0 20px 60px rgba(40,20,90,0.4);">'
    +'<div style="padding:18px 22px;background:linear-gradient(135deg,#2d6fd4,#9d7bff);color:#fff;display:flex;align-items:center;gap:9px;"><i class="ti ti-user-circle" style="font-size:20px;"></i><b style="font-size:16px;flex:1;">프로필 설정</b><i class="ti ti-x" onclick="document.getElementById(\'my-profile-modal\').remove()" style="cursor:pointer;font-size:20px;opacity:0.9;"></i></div>'
    +'<div style="padding:22px;">'
      +'<div style="display:flex;flex-direction:column;align-items:center;gap:11px;margin-bottom:18px;">'
        +'<div id="my-prof-avatar">'+_avatarHtml(u,88)+'</div>'
        +'<div style="display:flex;gap:8px;"><button onclick="setMyAvatar()" style="font-size:12.5px;font-weight:700;padding:7px 15px;border:1px solid #2d6fd4;border-radius:8px;background:#fff;color:#2d6fd4;cursor:pointer;"><i class="ti ti-camera"></i> 사진 변경</button>'+(u.avatar?'<button onclick="removeMyAvatar()" style="font-size:12.5px;padding:7px 13px;border:1px solid var(--border);border-radius:8px;background:#fff;color:var(--text3);cursor:pointer;">기본으로</button>':'')+'</div>'
      +'</div>'
      +'<div style="font-size:13px;">'
        +_profRow('아이디',esc(u.username))
        +_profRow('이름',esc(u.name||''))
        +_profRow('이메일',esc(u.email||'-'))
        +_profRow('소속',esc([u.company,u.dept,u.team].filter(Boolean).join(' ▸ ')||'-'))
        +_profRow('역할',esc(u.role||''))
      +'</div>'
      +'<div style="font-size:11px;color:var(--text3);margin-top:12px;"><i class="ti ti-info-circle"></i> 이름·이메일·소속 변경은 관리자(시스템 ▸ 사용자)에 문의하세요.</div>'
    +'</div></div>';
  m.addEventListener('click',function(e){ if(e.target===m)m.remove(); });
  document.body.appendChild(m);
}
async function removeMyAvatar(){
  try{ var d=await userApi('POST','/api/me/avatar',{avatar:''}); if(d&&d.user){ currentUser=d.user; } else { currentUser.avatar=''; } updateUserBar(); if(document.getElementById('my-profile-modal')) openMyProfile(); if(typeof showToast==='function')showToast('기본 아바타로 변경'); }
  catch(e){ if(typeof showToast==='function')showToast('실패: '+((e&&e.message)||e)); }
}
function isAdmin(){ return !!(currentUser&&currentUser.role==='관리자'); }
// ── 역할 기반 페이지 권한(RBAC): 페이지×역할 = none(접근불가)/read(읽기)/exec(실행) ──
let _perms={};
const _RBAC_PAGES=[
  {p:'dashboard',t:'Dashboard'},
  {p:'explorer',t:'Requirements & Test Coverage'},
  {p:'milestone',t:'Milestone (Test Planning)'},
  {p:'cycle',t:'Test Cycle'},
  {p:'report',t:'Test Report'},
  {p:'ixia-traffic',t:'IXIA N2X 트래픽 시험'},
  {p:'stc-traffic',t:'STC 트래픽 시험'},
  {p:'snmp',t:'SNMP OID Management'},
  {p:'release-summary',t:'Release Summary'},
  {p:'issue-sync',t:'Issue Sync'},
  {p:'itms-rack',t:'Rack View · Lab(보기)'},
  {p:'itms-rack-edit',t:'Rack View · 설정(편집)'},
  {p:'device-reg',t:'장비 등록'},
  {p:'chat',t:'AI 채팅'},
  {p:'board',t:'게시판/요청'},
  {p:'sys-users',t:'사용자 관리'},
  {p:'sys-perms',t:'권한 관리'}
];
async function loadPerms(){ try{ const d=await (await fetch('/api/permissions')).json(); _perms=(d&&d.perms)||{}; }catch(e){ _perms={}; } }
function _pageLevel(page){ if(isAdmin()) return 'exec'; const role=(currentUser&&currentUser.role)||'팀원'; const r=(_perms&&_perms[role])||{}; const v=r[page]; return (v==='none'||v==='read'||v==='exec')?v:'exec'; }   // 미설정 = 전체(기본 허용 — 관리자가 제한 설정 전까지 안 막힘)
function canAccess(page){ return _pageLevel(page)!=='none'; }
function canExec(page){ return _pageLevel(page)==='exec'; }
function _rbacDenied(name){ try{ showToast('🔒 이 페이지에 접근 권한이 없습니다'+(currentUser&&currentUser.role?(' ('+currentUser.role+')'):'')); }catch(e){} }
function applyPagePerms(){ try{
  // 관리자는 무조건 모든 메뉴 표시 (권한 필터 자체를 건너뜀). 다른 역할일 때만 canAccess 로 판단.
  if(typeof isAdmin==='function' && isAdmin()){
    document.querySelectorAll('.nav-item,.dd-item').forEach(function(el){
      // 이전에 다른 사유로 숨겨진 게 아니라면 표시 (data-admin-only 는 applyRoleGates 가 별도 처리)
      if(!el.hasAttribute('data-admin-only')) el.style.display='';
    });
    return;
  }
  document.querySelectorAll('.nav-item,.dd-item').forEach(function(el){
    const oc=el.getAttribute('onclick')||''; let pg='';
    const sm=oc.match(/showPage\(['"]([^'"]+)['"]\)/);
    if(sm)pg=sm[1]; else if(/rlsShowSub/.test(oc))pg='release-summary'; else if(/openItmsView/.test(oc))pg='itms-rack';
    if(pg&&_RBAC_PAGES.some(function(x){return x.p===pg;})) el.style.display=canAccess(pg)?'':'none';
  });
}catch(e){} }
function applyRoleGates(){ document.querySelectorAll('[data-admin-only]').forEach(e=>{ e.style.display=isAdmin()?'':'none'; }); if(!window._permsLoaded){ window._permsLoaded=true; loadPerms().then(function(){ applyPagePerms(); }); } else { applyPagePerms(); } }
// ── 동시 접속 제어 (Presence + 편집 제어권) — 같은 페이지 2명+ 시 1명만 편집, 나머지 보기 전용 ──
let _collab={page:null,users:[],controller:null};
function _collabUser(){ return (typeof currentUser!=='undefined'&&currentUser&&(currentUser.name||currentUser.username))||'guest'; }
function _collabEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;'); }
function collabSend(page){ try{ if(typeof ws!=='undefined'&&ws&&ws.readyState===1){ ws.send(JSON.stringify({type:'presence',user:_collabUser(),page:page})); } }catch(e){} }
function collabEnter(page){ window._curCollabPage=page; window._collabRO=false; if(typeof _pageApplyRO==='function')_pageApplyRO(page); var b=document.getElementById('collab-bar'); if(b)b.style.display='none'; collabSend(page); }function collabOnPresence(msg){
  if(!msg||msg.page!==window._curCollabPage) return;
  _collab={page:msg.page,users:msg.users||[],controller:msg.controller||null};
  var me=_collabUser(); var users=_collab.users||[]; var multi=users.length>=2;
  window._collabRO=false;   // 데이터는 락 없음 — 모두 편집 가능, 접속자만 표시(어제 합의)
  collabRenderBar(multi,users.filter(function(u){return u!==me;}));
  if(typeof _pageApplyRO==='function') _pageApplyRO(window._curCollabPage);
}
function _collabColor(name){ var s=String(name||''),h=0,i; for(i=0;i<s.length;i++){ h=(h*31+s.charCodeAt(i))>>>0; } return 'hsl('+(h%360)+',58%,50%)'; }
function _collabAvatar(name,me){
  var ini=(String(name||'?').trim().charAt(0)||'?').toUpperCase();
  return '<span title="'+_collabEsc(name)+(me?' (나)':'')+'" style="display:inline-flex;align-items:center;justify-content:center;width:25px;height:25px;border-radius:50%;background:'+(me?'#3b82f6':_collabColor(name))+';color:#fff;font-size:11px;font-weight:800;border:2px solid #283447;margin-left:-8px;flex-shrink:0;">'+_collabEsc(ini)+'</span>';
}
function collabRenderBar(multi,others){
  var bar=document.getElementById('collab-bar');
  if(!bar){ bar=document.createElement('div'); bar.id='collab-bar'; var _st=document.querySelector('.topnav-bar .top-nav-status'); if(_st&&_st.parentNode){ _st.parentNode.insertBefore(bar,_st); } else { document.body.appendChild(bar); } }
  if(!multi){ bar.style.display='none'; return; }
  // 제어권/보기전용 없음 — 겹친 아바타 + 인원수만 표시
  var me=_collabUser(), all=(_collab.users||[]).slice();
  all.sort(function(a,b){ return a===me?-1:(b===me?1:0); });
  var max=5, shown=all.slice(0,max), extra=all.length-shown.length;
  var av=shown.map(function(u){ return _collabAvatar(u,u===me); }).join('');
  if(extra>0){ av+='<span style="display:inline-flex;align-items:center;justify-content:center;min-width:25px;height:25px;padding:0 5px;border-radius:50%;background:#5b6b85;color:#fff;font-size:10.5px;font-weight:800;border:2px solid #283447;margin-left:-8px;flex-shrink:0;">+'+extra+'</span>'; }
  bar.className='collab-present';
  bar.innerHTML='<span style="display:inline-flex;align-items:center;padding-left:8px;">'+av+'</span><span style="margin-left:9px;font-weight:700;white-space:nowrap;color:var(--text2);">'+all.length+'명 접속 중</span>';
  bar.title=all.map(function(u){return u+(u===me?' (나)':'');}).join(', ');
  bar.style.display='flex';
}
// ── 사용자 관리 페이지 ──
let _usersList=[]; let _userRoles=['관리자','담당','팀장','팀원'];
async function userApi(method,url,bodyObj){
  const opt={method,headers:{'Content-Type':'application/json'}}; if(bodyObj) opt.body=JSON.stringify(bodyObj);
  const sep=url.indexOf('?')>=0?'&':'?';
  const r=await fetch(url+sep+'token='+encodeURIComponent(authToken),opt);
  if(!r.ok){ const d=await r.json().catch(()=>({})); throw new Error((d&&d.detail)||('오류 '+r.status)); }
  return r.json();
}
