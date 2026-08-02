// ══════════════════════════════════════════════════════════════════
// Global Parameters
// 저장: { "__global__": [{group,name,value,desc},...], "U9532H": [...] }
// ══════════════════════════════════════════════════════════════════

var _gpData = {};
var _gpSel  = '__global__';

async function gpLoad() {
  try { const r = await fetch('/api/global-params'); _gpData = await r.json(); } catch(e) { _gpData = {}; }
}
async function gpSave() {
  try { await fetch('/api/global-params', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(_gpData) }); } catch(e) {}
}

// ── 진입점 ─────────────────────────────────────────────────────────
async function renderGlobalParams() {
  var el = document.getElementById('global-params-body');
  if (!el) return;
  el.innerHTML = '<div style="padding:32px;font-size:13px;color:var(--text3);">로드 중…</div>';
  try { await gpLoad(); } catch(e) {}
  if (typeof loadDeviceData === 'function') { try { await loadDeviceData(); } catch(e) {} }
  // 기존 데이터가 구 형식(그룹 객체)이면 새 형식(flat 배열)으로 변환
  _gpMigrate();
  _gpBuildUI();
}

// 구 형식 { "그룹": [{name,value,desc}] } → 새 형식 [{group,name,value,desc}]
function _gpMigrate() {
  Object.keys(_gpData).forEach(function(mid) {
    var d = _gpData[mid];
    if (!Array.isArray(d)) {
      var arr = [];
      Object.keys(d).forEach(function(grp) {
        (d[grp]||[]).forEach(function(p) { arr.push({group:grp, name:p.name||'', value:p.value||'', desc:p.desc||''}); });
      });
      _gpData[mid] = arr;
    }
  });
}

function _gpBuildUI() {
  var el = document.getElementById('global-params-body');
  if (!el) return;
  el.innerHTML =
    // 페이지 헤더 — 본문을 아래로 내리고 중앙 래퍼 안에서 좌우 대칭 배치
    '<div style="display:flex;align-items:center;gap:10px;margin:8px 2px 16px;">'
    + '<i class="ti ti-variable" style="font-size:20px;color:var(--blue);"></i>'
    + '<span style="font-size:18px;font-weight:800;color:var(--text);">Global Parameters</span>'
    + '<span style="font-size:12px;color:var(--text3);">TC 스텝의 <code style="background:var(--bg2);padding:1px 5px;border-radius:3px;">${변수명}</code> 치환에 사용되는 공용 변수</span>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:240px 1fr;height:calc(100vh - 215px);border:1px solid var(--border);border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(40,50,90,0.06);">'
    + '<div id="gp-tree" style="border-right:1px solid var(--border);overflow-y:auto;background:var(--bg2);"></div>'
    + '<div id="gp-detail" style="overflow-y:auto;background:var(--bg2);"></div>'
    + '</div>';
  _gpDrawTree();
  _gpDrawDetail();
}

// ── 폴더 헬퍼 ────────────────────────────────────────────────────
// 폴더 목록: _gpData['__gp_folders__'] = [{id,name,models:[]}]
function _gpFolders(){ return Array.isArray(_gpData['__gp_folders__']) ? _gpData['__gp_folders__'] : []; }
function _gpFolderCollapsed(){ try{ return JSON.parse(localStorage.getItem('utop_gp_col')||'{}'); }catch(e){ return {}; } }
function _gpFolderSetCol(fid,v){ try{ var s=_gpFolderCollapsed(); s[fid]=v; localStorage.setItem('utop_gp_col',JSON.stringify(s)); }catch(e){} }

function _gpNewFolder(){
  var name=prompt('폴더 이름:'); if(!name||!name.trim()) return;
  if(!Array.isArray(_gpData['__gp_folders__'])) _gpData['__gp_folders__']=[];
  _gpData['__gp_folders__'].push({id:'gpf'+Date.now(), name:name.trim(), models:[]});
  gpSave().then(function(){ _gpDrawTree(); });
}
function _gpRenameFolder(fid,e){
  e.stopPropagation();
  var f=_gpFolders().find(function(x){return x.id===fid;}); if(!f) return;
  var n=prompt('폴더 이름 변경:', f.name); if(!n||!n.trim()) return;
  f.name=n.trim();
  gpSave().then(function(){ _gpDrawTree(); });
}
function _gpDeleteFolder(fid,e){
  e.stopPropagation();
  if(!confirm('폴더를 삭제합니다.\n폴더 안의 모델 파라미터는 유지됩니다.')) return;
  _gpData['__gp_folders__']=_gpFolders().filter(function(f){return f.id!==fid;});
  if(_gpSel==='__folder__'+fid) _gpSel='__global__';
  gpSave().then(function(){ _gpDrawTree(); _gpDrawDetail(); });
}
function _gpFolderToggle(fid,e){
  e.stopPropagation();
  var col=_gpFolderCollapsed();
  _gpFolderSetCol(fid, !col[fid]);
  _gpDrawTree();
}
var _gpDragMid=null;
function _gpDragStart(e,mid){ _gpDragMid=mid; e.dataTransfer.effectAllowed='move'; e.stopPropagation(); }
function _gpDragOver(e){ e.preventDefault(); e.currentTarget.style.background='#dbeafe'; }
function _gpDragLeave(e){ e.currentTarget.style.background=''; }
function _gpDropOnFolder(e,fid){
  e.preventDefault(); e.currentTarget.style.background='';
  if(!_gpDragMid||_gpDragMid==='__global__') return;
  var folders=_gpFolders();
  // 다른 폴더에서 제거
  folders.forEach(function(f){ f.models=(f.models||[]).filter(function(m){return m!==_gpDragMid;}); });
  var f=folders.find(function(x){return x.id===fid;}); if(!f) return;
  if((f.models||[]).indexOf(_gpDragMid)<0) f.models.push(_gpDragMid);
  _gpDragMid=null;
  gpSave().then(function(){ _gpDrawTree(); });
}
function _gpRemoveFromFolder(fid,mid,e){
  e.stopPropagation();
  var f=_gpFolders().find(function(x){return x.id===fid;}); if(!f) return;
  f.models=(f.models||[]).filter(function(m){return m!==mid;});
  gpSave().then(function(){ _gpDrawTree(); });
}

// ── 좌측 트리 ──────────────────────────────────────────────────────
function _gpDrawTree() {
  var el = document.getElementById('gp-tree');
  if (!el) return;
  var folders = _gpFolders();
  var col = _gpFolderCollapsed();
  var models = _gpModelList();
  // 폴더에 속한 모델
  var inFolder = {};
  folders.forEach(function(f){ (f.models||[]).forEach(function(m){ inFolder[m]=f.id; }); });

  var h = '<div style="padding:10px 12px 4px;display:flex;align-items:center;gap:4px;">'
    + '<span style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:.5px;flex:1;">PARAMETERS</span>'
    + '<button onclick="_gpNewModel()" title="모델 추가 (직접 입력)" style="height:20px;padding:0 7px;border:1px solid var(--border);background:var(--bg);cursor:pointer;color:var(--text2);font-size:10.5px;font-weight:700;border-radius:4px;white-space:nowrap;" onmouseenter="this.style.color=\'#2d6fd4\';this.style.borderColor=\'#2d6fd4\'" onmouseleave="this.style.color=\'var(--text2)\';this.style.borderColor=\'var(--border)\'">＋모델</button>'
    + '</div>';

  h += _gpTreeRow('__global__', '🌐 전역(Global)', _gpSel === '__global__', 0);
  h += '<div style="margin:4px 8px;border-top:1px solid var(--border);"></div>';

  // 폴더 렌더
  folders.forEach(function(f){
    var collapsed = !!col[f.id];
    var fmods = (f.models||[]).filter(function(m){ return models.indexOf(m)>=0; });
    var fCnt = fmods.reduce(function(s,m){ return s+(Array.isArray(_gpData[m])?_gpData[m].filter(function(r){return r.name;}).length:0); },0);
    var badge = fCnt>0 ? '<span style="background:#dbeafe;color:#1d4ed8;font-size:10px;padding:1px 6px;border-radius:8px;font-weight:700;margin-left:auto;">'+fCnt+'</span>' : '<span style="margin-left:auto;"></span>';
    h += '<div ondragover="_gpDragOver(event)" ondragleave="_gpDragLeave(event)" ondrop="_gpDropOnFolder(event,\''+f.id+'\')" style="border-radius:5px;margin:1px 4px;">'
      + '<div style="display:flex;align-items:center;padding:7px 8px;cursor:pointer;font-size:13px;gap:5px;border-radius:5px;" onmouseenter="this.style.background=\'var(--bg3)\'" onmouseleave="this.style.background=\'\'">'
      +   '<span onclick="_gpFolderToggle(\''+f.id+'\',event)" style="font-size:12px;color:var(--text3);flex-shrink:0;width:14px;text-align:center;">'+(collapsed?'▶':'▼')+'</span>'
      +   '<span style="font-size:14px;">📁</span>'
      +   '<span onclick="gpSelModel(\''+f.id+'\')" style="flex:1;overflow:hidden;text-overflow:ellipsis;font-weight:600;color:var(--text);">'+_he(f.name)+'</span>'
      +   badge
      +   '<span onclick="_gpRenameFolder(\''+f.id+'\',event)" title="이름 변경" style="font-size:11px;color:var(--text3);padding:1px 3px;opacity:0;" onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=0">✏️</span>'
      +   '<span onclick="_gpDeleteFolder(\''+f.id+'\',event)" title="폴더 삭제" style="font-size:11px;color:var(--text3);padding:1px 3px;opacity:0;" onmouseenter="this.style.color=\'#ef4444\';this.style.opacity=1" onmouseleave="this.style.color=\'var(--text3)\';this.style.opacity=0">✕</span>'
      + '</div>';
    if(!collapsed){
      fmods.forEach(function(m){
        var rows=Array.isArray(_gpData[m])?_gpData[m]:[];
        var cnt=rows.filter(function(r){return r.name;}).length;
        var active=_gpSel===m;
        var bg=active?'background:#eff6ff;border-right:3px solid var(--blue);font-weight:700;color:var(--blue);':'';
        var badge2=cnt>0?'<span style="background:#dbeafe;color:#1d4ed8;font-size:10px;padding:1px 6px;border-radius:8px;font-weight:700;margin-left:auto;">'+cnt+'</span>':'';
        h += '<div onclick="gpSelModel(\''+m+'\')" draggable="true" ondragstart="_gpDragStart(event,\''+m+'\')" '
          + 'style="display:flex;align-items:center;padding:7px 10px 7px 30px;cursor:pointer;font-size:13px;gap:6px;'+bg+'" '
          + 'onmouseenter="if(\''+m+'\'!==_gpSel)this.style.background=\'var(--bg3)\'" onmouseleave="if(\''+m+'\'!==_gpSel)this.style.background=\'\'">'
          + '📁 '+_he(m)+badge2
          + '<span onclick="_gpRemoveFromFolder(\''+f.id+'\',\''+m+'\',event)" title="폴더에서 제거" style="font-size:10px;color:var(--text3);opacity:0;margin-left:2px;" onmouseenter="this.style.opacity=1;this.style.color=\'#ef4444\'" onmouseleave="this.style.opacity=0;this.style.color=\'var(--text3)\'">✕</span>'
          + '</div>';
      });
    }
    h += '</div>';
  });

  // 폴더에 속하지 않은 모델
  var rootModels = models.filter(function(m){ return !inFolder[m]; });
  rootModels.forEach(function(m){
    h += _gpTreeRow(m, '📁 ' + m, _gpSel === m, 0, true);
  });

  el.innerHTML = h;
}

function _gpTreeRow(id, label, active, indent, draggable) {
  var rows = Array.isArray(_gpData[id]) ? _gpData[id] : [];
  var cnt  = rows.filter(function(r){ return r.name; }).length;
  var bg   = active ? 'background:#eff6ff;border-right:3px solid var(--blue);font-weight:700;color:var(--blue);' : '';
  var badge = cnt > 0 ? '<span style="background:#dbeafe;color:#1d4ed8;font-size:10px;padding:1px 6px;border-radius:8px;font-weight:700;margin-left:auto;">' + cnt + '</span>' : '<span style="margin-left:auto;"></span>';
  var drag = draggable ? ' draggable="true" ondragstart="_gpDragStart(event,\''+id+'\')"' : '';
  // 모델 행(draggable)에는 삭제 ✕ (호버 시 표시)
  var del = draggable ? '<span onclick="_gpDeleteModel(\''+id+'\',event)" title="모델 삭제" class="gp-mdl-del" style="font-size:11px;color:var(--text3);padding:1px 3px;opacity:0;transition:opacity .12s;" onmouseenter="this.style.color=\'#ef4444\'" onmouseleave="this.style.color=\'var(--text3)\'">✕</span>' : '';
  var hoverIn = 'if(\''+id+'\'!==_gpSel)this.style.background=\'var(--bg3)\';var d=this.querySelector(\'.gp-mdl-del\');if(d)d.style.opacity=1;';
  var hoverOut = 'if(\''+id+'\'!==_gpSel)this.style.background=\'\';var d=this.querySelector(\'.gp-mdl-del\');if(d)d.style.opacity=0;';
  return '<div data-mid="' + id + '" onclick="gpSelModel(this.dataset.mid)"' + drag
    + ' style="display:flex;align-items:center;padding:8px 12px;cursor:pointer;font-size:13px;gap:6px;' + bg + '"'
    + ' onmouseenter="' + hoverIn + '" onmouseleave="' + hoverOut + '">'
    + label + badge + del + '</div>';
}

function _gpModelList() {
  // 사용자가 직접 추가한 모델만 표시 (등록 장비 모델 자동 등록 안 함)
  var list = [];
  var skip = {'__global__':1,'__gp_folders__':1};
  Object.keys(_gpData).forEach(function(k){ if(!skip[k] && list.indexOf(k)<0) list.push(k); });
  return list.sort();
}

// 모델 추가 실행 (공통)
function _gpAddModel(name){
  name=String(name||'').trim();
  if(!name){ alert('모델명을 입력하세요.'); return; }
  if(name==='__global__'||name==='__gp_folders__'){ alert('사용할 수 없는 이름입니다.'); return; }
  if(Array.isArray(_gpData[name])){ _gpSel=name; _gpDrawTree(); _gpDrawDetail(); return; }   // 이미 있으면 선택만
  _gpData[name]=[];
  _gpSel=name;
  gpSave().then(function(){ _gpDrawTree(); _gpDrawDetail(); });
}
// 직접 입력으로 추가 (＋모델 버튼)
function _gpNewModel(){
  var name=prompt('추가할 모델명:'); if(name===null) return;
  _gpAddModel(name);
}

// 모델 삭제 (파라미터 포함)
function _gpDeleteModel(mid,e){
  if(e){ e.stopPropagation(); }
  var rows=Array.isArray(_gpData[mid])?_gpData[mid]:[];
  var cnt=rows.filter(function(r){return r.name;}).length;
  if(!confirm('"'+mid+'" 모델을 삭제합니다.'+(cnt?('\n파라미터 '+cnt+'개도 함께 삭제됩니다.'):''))) return;
  delete _gpData[mid];
  _gpFolders().forEach(function(f){ f.models=(f.models||[]).filter(function(m){return m!==mid;}); });
  if(_gpSel===mid) _gpSel='__global__';
  gpSave().then(function(){ _gpDrawTree(); _gpDrawDetail(); });
}

function gpSelModel(id) { _gpSel = id; _gpDrawTree(); _gpDrawDetail(); }

// ── 우측 상세 — 그룹 폴더 인라인 섹션 ───────────────────────────────
var _gpGrpCol = {}; // 그룹 접힘 상태 { "그룹명": true/false }

// ── 우클릭 메뉴 ────────────────────────────────────────────────────
function _gpCtxClose() {
  var m = document.getElementById('gp-ctx-menu');
  if (m) m.remove();
}

function _gpCtxMenu(ev, items) {
  ev.preventDefault(); ev.stopPropagation();
  _gpCtxClose();
  var m = document.createElement('div');
  m.id = 'gp-ctx-menu';
  m.style.cssText = 'position:fixed;z-index:9999;background:var(--bg);border:1px solid var(--border);border-radius:7px;box-shadow:0 4px 16px rgba(0,0,0,.15);padding:4px 0;min-width:160px;font-size:13px;';
  m.style.left = ev.clientX + 'px';
  m.style.top  = ev.clientY + 'px';
  items.forEach(function(item) {
    if (item === '-') {
      var sep = document.createElement('div');
      sep.style.cssText = 'height:1px;background:var(--border);margin:3px 0;';
      m.appendChild(sep);
      return;
    }
    var d = document.createElement('div');
    d.style.cssText = 'padding:6px 14px;cursor:pointer;color:' + (item.danger ? '#ef4444' : 'var(--text)') + ';display:flex;align-items:center;gap:8px;';
    d.innerHTML = (item.icon ? '<span style="width:14px;text-align:center;">' + item.icon + '</span>' : '') + item.label;
    d.onmouseenter = function(){ this.style.background = 'var(--bg2)'; };
    d.onmouseleave = function(){ this.style.background = ''; };
    d.onclick = function(){ _gpCtxClose(); item.action(); };
    m.appendChild(d);
  });
  document.body.appendChild(m);
  // 화면 밖으로 넘어가면 위로
  setTimeout(function(){
    var r = m.getBoundingClientRect();
    if (r.bottom > window.innerHeight) m.style.top = (ev.clientY - r.height) + 'px';
    if (r.right  > window.innerWidth)  m.style.left = (ev.clientX - r.width) + 'px';
  }, 0);
}

document.addEventListener('mousedown', function(e) {
  var m = document.getElementById('gp-ctx-menu');
  if (m && !m.contains(e.target)) _gpCtxClose();
});

// 그룹 헤더 우클릭
function _gpGrpCtx(ev, grp) {
  ev.preventDefault(); ev.stopPropagation();
  _gpCtxMenu(ev, [
    { icon:'✏️', label:'그룹 이름 변경', action: function(){ _gpGrpRenamePrompt(grp); } },
    { icon:'➕', label:'파라미터 추가',  action: function(){ gpAddRow(grp); } },
    '-',
    { icon:'🗑️', label:'그룹 삭제', danger:true, action: function(){ gpDelGroup(grp); } }
  ]);
}

// 파라미터 행 우클릭
function _gpRowCtx(ev, i, grp) {
  ev.preventDefault(); ev.stopPropagation();
  _gpCtxMenu(ev, [
    { icon:'➕', label:'아래에 파라미터 추가', action: function(){ _gpInsertRowAfter(i, grp); } },
    { icon:'⬆️', label:'위로 이동',           action: function(){ _gpMoveRow(i, -1); } },
    { icon:'⬇️', label:'아래로 이동',         action: function(){ _gpMoveRow(i,  1); } },
    '-',
    { icon:'🗑️', label:'삭제', danger:true,   action: function(){ gpDelRow(i); } }
  ]);
}

function _gpDrawDetail() {
  var el = document.getElementById('gp-detail');
  if (!el) return;
  var mid   = _gpSel;
  var rows  = Array.isArray(_gpData[mid]) ? _gpData[mid] : [];
  var title = mid === '__global__' ? '전역(Global)' : mid;

  // 그룹별로 분류 (순서 유지)
  var groupOrder = [], groupMap = {};
  rows.forEach(function(p, i) {
    var g = p.group || '';
    if (groupOrder.indexOf(g) < 0) groupOrder.push(g);
    if (!groupMap[g]) groupMap[g] = [];
    groupMap[g].push({p:p, i:i});
  });
  if (groupOrder.length === 0 && mid !== '__global__') groupOrder.push('');   // 전역은 자체 파라미터 없으면 그룹 박스 미표시

  var h = '<div style="padding:14px 20px 12px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;background:var(--bg2);">'
    + '<div>'
    +   '<div style="font-size:15px;font-weight:700;color:var(--text);">' + _he(title) + '</div>'
    +   '<div style="font-size:11px;color:var(--text3);margin-top:1px;">TC 스텝 cmd·criteria 에서 <code style="background:var(--bg2);padding:1px 5px;border-radius:3px;font-family:monospace;">[' + _he(title) + '/변수명]</code> 또는 <code style="background:var(--bg2);padding:1px 5px;border-radius:3px;font-family:monospace;">${변수명}</code> 으로 사용</div>'
    + '</div>'
    + '<div style="margin-left:auto;display:flex;gap:6px;">'
    +   (mid==='__global__'?'':'<button onclick="gpAddGroup()" style="height:30px;padding:0 12px;background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:6px;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:4px;"><i class="ti ti-folder-plus"></i> 그룹 추가</button>')
    + '</div>'
    + '</div>';

  h += '<div style="padding:14px 20px;">';

  groupOrder.forEach(function(grp) {
    var items = groupMap[grp] || [];
    var collapsed = !!_gpGrpCol[grp];
    var grpLabel = grp || '(기본 그룹)';
    var isDefault = grp === '';
    var grpJs = grp.replace(/\\/g,'\\\\').replace(/'/g,"\\'");

    h += '<div style="margin-bottom:10px;border:1px solid var(--border);border-radius:8px;overflow:hidden;background:var(--bg);box-shadow:0 1px 4px rgba(0,0,0,0.06);">';

    // 그룹 헤더 (우클릭 메뉴 포함)
    h += '<div style="display:flex;align-items:center;gap:8px;padding:7px 12px;background:var(--bg2);cursor:pointer;user-select:none;" '
       + 'onclick="_gpGrpToggle(\'' + grpJs + '\')" '
       + 'oncontextmenu="_gpGrpCtx(event,\'' + grpJs + '\')">'
       + '<span style="font-size:11px;color:var(--text3);width:14px;text-align:center;flex-shrink:0;">' + (collapsed ? '▶' : '▼') + '</span>'
       + '<span style="font-size:14px;">📁</span>';

    if (isDefault) {
      h += '<span style="font-size:13px;font-weight:600;color:var(--text3);font-style:italic;flex:1;">' + _he(grpLabel) + '</span>';
    } else {
      h += '<input data-grp="' + _he(grp) + '" onclick="event.stopPropagation()" '
         + 'value="' + _he(grp) + '" placeholder="그룹명" '
         + 'style="flex:1;font-family:inherit;font-size:13px;font-weight:600;color:var(--text);background:transparent;border:1px solid transparent;border-radius:4px;padding:2px 6px;outline:none;" '
         + 'onfocus="event.stopPropagation();this.style.borderColor=\'var(--blue)\';this.style.background=\'var(--bg)\'" '
         + 'onblur="this.style.borderColor=\'transparent\';this.style.background=\'transparent\';_gpGrpRenameFromInput(this)" '
         + 'onkeydown="if(event.key===\'Enter\')this.blur();event.stopPropagation();">';
    }

    h += '<span style="font-size:11px;color:var(--text3);background:var(--bg3);padding:1px 8px;border-radius:10px;margin-left:4px;">' + items.length + '개</span>'
       + (mid==='__global__'?'':'<button onclick="event.stopPropagation();gpAddRow(\'' + grpJs + '\')" title="이 그룹에 파라미터 추가" '
       + 'style="height:22px;padding:0 8px;background:var(--blue);color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer;margin-left:4px;">+ 추가</button>')
       + '<button onclick="event.stopPropagation();_gpGrpCtx(event,\'' + grpJs + '\')" title="더보기" '
       + 'style="width:22px;height:22px;border:none;background:none;color:var(--text3);cursor:pointer;font-size:14px;border-radius:4px;padding:0;line-height:1;" '
       + 'onmouseenter="this.style.background=\'var(--bg3)\'" onmouseleave="this.style.background=\'none\'">⋯</button>'
       + '</div>';

    // 그룹 내 파라미터 테이블
    if (!collapsed) {
      h += '<div>';
      h += '<div style="display:grid;grid-template-columns:200px 1fr 1fr 28px;border-top:1px solid var(--border);background:var(--bg2);">'
         + '<div style="padding:5px 10px;font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.4px;">변수명</div>'
         + '<div style="padding:5px 10px;font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.4px;border-left:1px solid var(--border);">값</div>'
         + '<div style="padding:5px 10px;font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.4px;border-left:1px solid var(--border);">설명</div>'
         + '<div></div>'
         + '</div>';

      if (items.length === 0) {
        h += '<div style="padding:16px;text-align:center;font-size:12px;color:var(--text3);border-top:1px solid var(--border);">파라미터 없음 — "+ 추가" 버튼을 누르거나 우클릭하세요</div>';
      } else {
        items.forEach(function(item) {
          var p = item.p, i = item.i;
          h += '<div style="display:grid;grid-template-columns:200px 1fr 1fr 28px;border-top:1px solid var(--border);cursor:default;" '
             + 'oncontextmenu="_gpRowCtx(event,' + i + ',\'' + grpJs + '\')"'
             + 'onmouseenter="this.querySelector(\'.gp-del-btn\').style.opacity=\'1\'" '
             + 'onmouseleave="this.querySelector(\'.gp-del-btn\').style.opacity=\'0\'">';

          h += '<div style="padding:4px 8px;display:flex;align-items:center;">'
             + '<input onchange="_gpEdit(' + i + ',\'name\',this.value);gpAutoSave()" value="' + _he(p.name||'') + '" placeholder="VAR_NAME" '
             + 'style="width:100%;box-sizing:border-box;font-family:inherit;font-size:12px;font-weight:600;color:#1e40af;border:none;border-radius:4px;padding:3px 6px;background:transparent;outline:none;" '
             + 'onfocus="this.style.background=\'var(--bg2)\'" onblur="this.style.background=\'transparent\'"></div>';

          h += '<div style="padding:4px 8px;border-left:1px solid var(--border);display:flex;align-items:center;">'
             + '<input onchange="_gpEdit(' + i + ',\'value\',this.value);gpAutoSave()" value="' + _he(p.value||'') + '" placeholder="값 입력" '
             + 'style="width:100%;box-sizing:border-box;font-family:inherit;font-size:12px;border:none;border-radius:4px;padding:3px 6px;background:transparent;outline:none;" '
             + 'onfocus="this.style.background=\'var(--bg2)\'" onblur="this.style.background=\'transparent\'"></div>';

          h += '<div style="padding:4px 8px;border-left:1px solid var(--border);display:flex;align-items:center;">'
             + '<input onchange="_gpEdit(' + i + ',\'desc\',this.value);gpAutoSave()" value="' + _he(p.desc||'') + '" placeholder="설명 (선택)" '
             + 'style="width:100%;box-sizing:border-box;font-family:inherit;font-size:12px;color:#101828;border:none;border-radius:4px;padding:3px 6px;background:transparent;outline:none;" '
             + 'onfocus="this.style.background=\'var(--bg2)\'" onblur="this.style.background=\'transparent\'"></div>';

          h += '<div style="display:flex;align-items:center;justify-content:center;padding:2px;">'
             + '<button class="gp-del-btn" onclick="gpDelRow(' + i + ')" title="삭제" '
             + 'style="width:22px;height:22px;border:none;background:none;color:var(--text3);cursor:pointer;font-size:13px;border-radius:3px;padding:0;opacity:0;transition:opacity .15s;" '
             + 'onmouseenter="this.style.color=\'#ef4444\'" onmouseleave="this.style.color=\'var(--text3)\'">✕</button>'
             + '</div>';

          h += '</div>';
        });
      }
      h += '</div>';
    }
    h += '</div>';
  });

  // 전역(Global) 선택 시: 하위(모델별) 파라미터 전체를 개요로 표시
  if (mid === '__global__') {
    var mdls = _gpModelList().filter(function(m){ return Array.isArray(_gpData[m]) && _gpData[m].some(function(r){ return r.name; }); });
    if (mdls.length) {
      h += '<div style="margin:18px 0 8px;display:flex;align-items:center;gap:8px;">'
        + '<span style="font-size:12px;font-weight:800;color:var(--text2);">모델별 파라미터</span>'
        + '<span style="font-size:11px;color:var(--text3);">(' + mdls.length + '개 모델 · 편집은 좌측에서 모델 선택)</span>'
        + '<span style="flex:1;height:1px;background:var(--border);"></span>'
        + '</div>';
      mdls.forEach(function(m) {
        var rows2 = _gpData[m].filter(function(r){ return r.name; });
        // 모델 내 그룹별 분류 (순서 유지)
        var gOrder = [], gMap = {};
        rows2.forEach(function(p){ var g = p.group || ''; if (gOrder.indexOf(g) < 0) gOrder.push(g); (gMap[g] = gMap[g] || []).push(p); });
        h += '<div style="margin-bottom:10px;border:1px solid var(--border);border-radius:8px;overflow:hidden;background:var(--bg);box-shadow:0 1px 4px rgba(0,0,0,0.06);">'
          + '<div onclick="gpSelModel(\'' + _he(m).replace(/'/g,"\\'") + '\')" title="클릭하면 이 모델 편집 화면으로 이동" '
          + 'style="display:flex;align-items:center;gap:8px;padding:7px 12px;background:var(--bg2);cursor:pointer;user-select:none;" '
          + 'onmouseenter="this.style.background=\'var(--bg3)\'" onmouseleave="this.style.background=\'var(--bg2)\'">'
          +   '<span style="font-size:14px;">📁</span>'
          +   '<span style="font-size:13px;font-weight:600;color:var(--text);flex:1;">' + _he(m) + '</span>'
          +   '<span style="font-size:11px;color:var(--text3);background:var(--bg3);padding:1px 8px;border-radius:10px;">' + rows2.length + '개</span>'
          +   '<span style="font-size:11px;color:var(--blue);">편집 →</span>'
          + '</div>';
        gOrder.forEach(function(g) {
          var ovKey = m + '|' + g;
          var ovCol = !!_gpOvCol[ovKey];
          var ovJs = ovKey.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
          // 그룹 헤더 (모델 아래 인라인, 클릭 = 접기/펴기)
          h += '<div onclick="_gpOvToggle(\'' + _he(ovJs) + '\')" style="display:flex;align-items:center;gap:7px;padding:6px 12px 6px 22px;background:var(--bg2);border-top:1px solid var(--border);cursor:pointer;user-select:none;" '
            + 'onmouseenter="this.style.background=\'var(--bg3)\'" onmouseleave="this.style.background=\'var(--bg2)\'">'
            + '<span style="font-size:11px;color:var(--text3);width:12px;text-align:center;">' + (ovCol?'▶':'▼') + '</span>'
            + '<span style="font-size:12px;">📁</span>'
            + '<span style="font-size:12px;font-weight:600;color:' + (g?'var(--text)':'var(--text3)') + ';' + (g?'':'font-style:italic;') + '">' + _he(g || '(기본 그룹)') + '</span>'
            + '<span style="font-size:10.5px;color:var(--text3);background:var(--bg3);padding:0 7px;border-radius:9px;">' + gMap[g].length + '개</span>'
            + '</div>';
          if (!ovCol) {
            h += '<div style="display:grid;grid-template-columns:200px 1fr 1fr;border-top:1px solid var(--border);background:var(--bg2);">'
              +   '<div style="padding:4px 10px 4px 34px;font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.4px;">변수명</div>'
              +   '<div style="padding:4px 10px;font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.4px;border-left:1px solid var(--border);">값</div>'
              +   '<div style="padding:4px 10px;font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.4px;border-left:1px solid var(--border);">설명</div>'
              + '</div>';
            gMap[g].forEach(function(p) {
              h += '<div style="display:grid;grid-template-columns:200px 1fr 1fr;border-top:1px solid var(--border);">'
                + '<div style="padding:6px 14px 6px 34px;font-size:12px;font-weight:600;color:#1e40af;">' + _he(p.name) + '</div>'
                + '<div style="padding:6px 14px;font-size:12px;color:var(--text);border-left:1px solid var(--border);">' + _he(p.value||'') + '</div>'
                + '<div style="padding:6px 14px;font-size:12px;color:#101828;border-left:1px solid var(--border);">' + _he(p.desc||'') + '</div>'
                + '</div>';
            });
          }
        });
        h += '</div>';
      });
    }
  }

  h += '</div>';
  el.innerHTML = h;
}

function _gpGrpToggle(grp) {
  _gpGrpCol[grp] = !_gpGrpCol[grp];
  _gpDrawDetail();
}

// 전역(Global) 개요의 모델|그룹 접힘 상태
var _gpOvCol = {};
function _gpOvToggle(key) {
  _gpOvCol[key] = !_gpOvCol[key];
  _gpDrawDetail();
}

// input의 data-grp(원본)과 현재 value로 rename
function _gpGrpRenameFromInput(inp) {
  var oldGrp = inp.getAttribute('data-grp');
  var newGrp = inp.value.trim();
  if (newGrp === oldGrp || !newGrp) return;
  _gpGrpRename(oldGrp, newGrp);
}

function _gpGrpRenamePrompt(grp) {
  var n = prompt('그룹 이름 변경:', grp);
  if (n === null) return;
  n = n.trim();
  if (!n || n === grp) return;
  _gpGrpRename(grp, n);
}

function _gpGrpRename(oldGrp, newGrp) {
  newGrp = (newGrp || '').trim();
  if (newGrp === oldGrp || !newGrp) return;
  var rows = Array.isArray(_gpData[_gpSel]) ? _gpData[_gpSel] : [];
  rows.forEach(function(p) { if (p.group === oldGrp) p.group = newGrp; });
  if (_gpGrpCol[oldGrp] !== undefined) { _gpGrpCol[newGrp] = _gpGrpCol[oldGrp]; delete _gpGrpCol[oldGrp]; }
  gpSave().then(function(){ _gpDrawTree(); _gpDrawDetail(); });
}

// ── 행 조작 ────────────────────────────────────────────────────────
function _gpInsertRowAfter(i, grp) {
  if (!Array.isArray(_gpData[_gpSel])) _gpData[_gpSel] = [];
  _gpData[_gpSel].splice(i + 1, 0, {group: grp || '', name:'', value:'', desc:''});
  gpSave().then(function(){ _gpDrawDetail(); });
}

function _gpMoveRow(i, dir) {
  var arr = _gpData[_gpSel];
  if (!Array.isArray(arr)) return;
  var j = i + dir;
  if (j < 0 || j >= arr.length) return;
  var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  gpSave().then(function(){ _gpDrawDetail(); });
}

function gpAddGroup() {
  if (_gpSel === '__global__') { alert('전역(Global)에는 파라미터를 추가할 수 없습니다.\n좌측에서 모델을 선택하세요.'); return; }
  var name = prompt('그룹 이름:');
  if (name === null) return;
  name = name.trim();
  if (!name) { alert('그룹 이름을 입력하세요.'); return; }
  if (!Array.isArray(_gpData[_gpSel])) _gpData[_gpSel] = [];
  _gpData[_gpSel].push({group:name, name:'', value:'', desc:''});
  _gpGrpCol[name] = false;
  gpSave().then(function(){
    _gpDrawDetail();
    setTimeout(function(){
      var ins = document.querySelectorAll('#gp-detail input[placeholder="VAR_NAME"]');
      if (ins.length) ins[ins.length-1].focus();
    }, 60);
  });
}

function gpAddRow(grp) {
  if (_gpSel === '__global__') { alert('전역(Global)에는 파라미터를 추가할 수 없습니다.\n좌측에서 모델을 선택하세요.'); return; }
  if (!Array.isArray(_gpData[_gpSel])) _gpData[_gpSel] = [];
  var g = (typeof grp === 'string') ? grp : '';
  _gpData[_gpSel].push({group:g, name:'', value:'', desc:''});
  if (g) _gpGrpCol[g] = false;
  gpSave().then(function(){
    _gpDrawDetail();
    setTimeout(function(){
      var ins = document.querySelectorAll('#gp-detail input[placeholder="VAR_NAME"]');
      if (ins.length) ins[ins.length-1].focus();
    }, 60);
  });
}

function gpAddRowInGroup(grp) {
  gpAddRow(grp);
}

function gpDelRow(i) {
  if (!Array.isArray(_gpData[_gpSel])) return;
  _gpData[_gpSel].splice(i, 1);
  gpSave().then(function(){ _gpDrawTree(); _gpDrawDetail(); });
}

function gpDelGroup(grp) {
  if (!Array.isArray(_gpData[_gpSel])) return;
  var cnt = _gpData[_gpSel].filter(function(p){ return p.group === grp; }).length;
  if (cnt > 0 && !confirm('그룹 "' + grp + '" 과 파라미터 ' + cnt + '개를 모두 삭제합니다.\n계속하시겠습니까?')) return;
  _gpData[_gpSel] = _gpData[_gpSel].filter(function(p){ return p.group !== grp; });
  gpSave().then(function(){ _gpDrawTree(); _gpDrawDetail(); });
}

function _gpEdit(i, field, val) {
  if (!Array.isArray(_gpData[_gpSel])||!_gpData[_gpSel][i]) return;
  _gpData[_gpSel][i][field] = val;
}

var _gpSaveTimer = null;
function gpAutoSave() {
  clearTimeout(_gpSaveTimer);
  _gpSaveTimer = setTimeout(function(){ gpSave().then(function(){ _gpDrawTree(); }); }, 700);
}

function _he(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── TC 치환 (_subVars 에서 호출) ────────────────────────────────────
function _gpBuildMap(modelId) {
  var map = {};
  var global = Array.isArray(_gpData['__global__']) ? _gpData['__global__'] : [];
  global.forEach(function(p){ if(p.name) map[p.name] = p.value; });
  if (modelId && modelId !== '__global__') {
    var mdl = Array.isArray(_gpData[modelId]) ? _gpData[modelId] : [];
    mdl.forEach(function(p){ if(p.name) map[p.name] = p.value; });
  }
  return map;
}

function _gpSubstitute(text, modelId) {
  if (!text||typeof text!=='string'||text.indexOf('${')<0) return text;
  var map = _gpBuildMap(modelId);
  return text.replace(/\$\{\s*(\w+)\s*\}/g, function(m,k){ return map[k]!=null?String(map[k]):m; });
}

// ── TC 스텝 우클릭 → Global Parameter 삽입 ────────────────────────
async function gpVarPick(inp, tcid, cid, field) {
  // 기존 메뉴 제거
  var old = document.getElementById('gp-var-drop');
  if (old) old.remove();

  // Global Parameters 최신본 로드 — 페이지에서 방금 수정한 내용도 실시간 반영
  try { await gpLoad(); } catch(e) {}

  // 전체 변수 목록 수집 (전역 먼저, 모델별)
  var vars = [];
  ['__global__'].concat(Object.keys(_gpData).filter(function(k){ return k!=='__global__'; })).forEach(function(mid) {
    var rows = Array.isArray(_gpData[mid]) ? _gpData[mid] : [];
    rows.forEach(function(p) {
      if (p.name) vars.push({ name:p.name, value:p.value, group:p.group||'', model:mid });
    });
  });

  if (vars.length === 0) {
    alert('등록된 Global Parameter가 없습니다.\nTests → Global Parameters 에서 먼저 등록하세요.');
    return;
  }

  // 커서 위치 기억
  var selStart = inp.selectionStart;
  var selEnd   = inp.selectionEnd;

  // 컨텍스트 메뉴 생성
  var drop = document.createElement('div');
  drop.id = 'gp-var-drop';
  drop.style.cssText = 'position:fixed;z-index:99999;background:#fff;border:1px solid #d1d5db;border-radius:8px;'
    + 'box-shadow:0 6px 24px rgba(0,0,0,0.13);min-width:300px;max-height:360px;overflow-y:auto;';

  var html = '<div style="padding:7px 12px;font-size:11px;font-weight:700;color:#7c3aed;border-bottom:1px solid #f0f0f0;'
    + 'display:flex;align-items:center;gap:6px;background:#faf5ff;border-radius:8px 8px 0 0;">'
    + '<i class="ti ti-variable"></i> Global Parameter 삽입</div>';

  // 그룹별로 묶어서 표시
  var grouped = {};
  vars.forEach(function(v) {
    var key = (v.model==='__global__' ? '🌐 전역' : '📁 '+v.model) + (v.group ? ' / '+v.group : '');
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(v);
  });

  Object.keys(grouped).forEach(function(grpKey) {
    html += '<div style="padding:4px 12px;font-size:10.5px;font-weight:700;color:#9ca3af;background:#f9fafb;border-bottom:1px solid #f0f0f0;">'
      + grpKey + '</div>';
    grouped[grpKey].forEach(function(v) {
      html += '<div class="gp-item" data-name="' + v.name + '" '
        + 'style="padding:7px 14px;cursor:pointer;display:flex;align-items:center;gap:8px;border-bottom:1px solid #f9fafb;" '
        + 'onmouseover="this.style.background=\'#f5f3ff\'" onmouseout="this.style.background=\'#fff\'">'
        + '<code style="font-size:12.5px;font-weight:700;color:#101828;flex-shrink:0;">${' + v.name + '}</code>'
        + '<span style="font-size:11px;color:#101828;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">' + _he(v.value) + '</span>'
        + '</div>';
    });
  });
  drop.innerHTML = html;

  // 마우스 위치에 표시
  var ex = (window._gpPickX||200), ey = (window._gpPickY||200);
  drop.style.top  = Math.min(ey, window.innerHeight - 380) + 'px';
  drop.style.left = Math.min(ex, window.innerWidth  - 320) + 'px';
  document.body.appendChild(drop);

  // 항목 클릭
  drop.querySelectorAll('.gp-item').forEach(function(item) {
    item.addEventListener('mousedown', function(e) {
      e.preventDefault(); // blur 방지
      var ins = '${' + this.dataset.name + '}';
      inp.focus();
      inp.setSelectionRange(selStart, selEnd);
      var val = inp.value;
      inp.value = val.slice(0, selStart) + ins + val.slice(selEnd);
      var pos = selStart + ins.length;
      inp.setSelectionRange(pos, pos);
      drop.remove();
      tcCheckSave(tcid, cid, field, inp.value);
    });
  });

  // 외부 클릭 시 닫기
  setTimeout(function() {
    document.addEventListener('click', function _close() {
      var d = document.getElementById('gp-var-drop'); if(d) d.remove();
      document.removeEventListener('click', _close);
    });
  }, 100);
}

// contextmenu 이벤트에서 마우스 위치 저장
document.addEventListener('contextmenu', function(e) {
  window._gpPickX = e.clientX;
  window._gpPickY = e.clientY;
});

document.addEventListener('DOMContentLoaded', function(){ gpLoad(); });
