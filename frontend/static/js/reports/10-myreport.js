/* ===== 재이식: Test Report 분석모듈 (renderReport override + _rpt* 71fn). base 07-report.js 뒤 로드 ===== */
// ════════ 재이식: Test Report 분석 모듈 (MINE → BASE) ════════
// ── Custom-field filter (Test Report) — 시스템>커스텀 필드 값으로 필터 ──
let reportCfFilter={req:{},tc:{}};

function _rptCollect(){ const out=[]; (cycleList||[]).forEach(c=>{ const _mg=(typeof _cycMGroup==='function')?_cycMGroup(c):(c.model||'-'); (c.items||[]).forEach(it=>{ out.push(Object.assign({},it,{_cycle:c.name||c.id||'',_cycleId:c.id,_model:c.model||'-',_version:c.version||'',_mgroup:_mg,_vgroup:c.version_group||'(미분류)',_grp:(c.model||'-')+(c.version?(' '+c.version):'')})); }); }); return out; }

// 항목 판정 — KPI(cycleCalcStats.verdictOf)와 동일 기준: Fail 하나라도 fail / 스텝 일부만 입력 = pending(예정) / 전부 입력 + Pass 있음 = pass
function _rptVerdict(it){
  const all=(it&&it.steps)||[];
  const done=all.filter(function(x){ return x&&x.result&&(typeof resultMeta==='function'?resultMeta(x.result):true); });
  if(done.some(function(x){ return resultVerdict(x.result)==='fail'; })) return 'fail';
  if(!all.length||done.length<all.length) return 'pending';
  if(done.some(function(x){ return resultVerdict(x.result)==='pass'; })) return 'pass';
  if(done.some(function(x){ return resultVerdict(x.result)==='exclude'; })) return 'exclude';
  return 'pending';
}

function _rptItemDate(it){ const st=(it.steps||[]).map(s=>s.executed_at||s.date).filter(Boolean).sort(); return st.length?String(st[st.length-1]).slice(0,10):''; }

function _rptFiltered(){ const F=window._rptF||{}; const RS=window._rptReqSel; return _rptCollect().filter(it=>{ if(!_rptScopeMatch(it))return false; if(F.cycle&&it._cycleId!==F.cycle)return false; if(F.severity&&(it.severity||'')!==F.severity)return false; if(RS&&RS.size&&!RS.has(it.req_id))return false; if(F.verdict&&_rptVerdict(it)!==F.verdict)return false; if(!_rptCfPass(it))return false; return true; }); }
// ── REQ 선택 팝업 (Test Cycle의 REQ 선택 버튼처럼 · 다중 선택 → 해당 REQ만 표시) ──
function _rptReqPopupOpen(){ var ex=document.getElementById('rpt-reqpopup'); if(ex){ ex.remove(); return; } window._rptReqSel=window._rptReqSel||new Set(); var d=document.createElement('div'); d.id='rpt-reqpopup'; d.innerHTML=_rptReqPopupHtml(); document.body.appendChild(d); }
function _rptReqPopupClose(){ var d=document.getElementById('rpt-reqpopup'); if(d)d.remove(); }
function _rptReqPopupHtml(){
  var esc=(typeof _bdEsc==='function')?_bdEsc:(s=>String(s==null?'':s));
  // 현재 리포트 데이터에 존재하는 REQ만 목록 (폴더별 그룹)
  var all=_rptCollect(); var reqIds=[...new Set(all.map(x=>x.req_id).filter(Boolean))];
  var byFolder={}; reqIds.forEach(function(rid){ var rq=(reqList||[]).find(x=>x.id===rid); var fid=(rq&&rq.folder)||'__none__'; var fname=(function(){ var f=(typeof reqFolders!=='undefined'?reqFolders:[]).find(x=>x.id===fid); return f?f.name:'(폴더 없음)'; })(); (byFolder[fname]=byFolder[fname]||[]).push({id:rid,label:rq?((rq.reqid||rq.id)+(rq.title?(' · '+rq.title):'')):rid}); });
  var body=Object.keys(byFolder).sort().map(function(fn){
    return '<div style="margin-bottom:10px;"><div style="font-size:11px;font-weight:800;color:#7c3aed;padding:4px 6px;background:#f3eefe;border-radius:5px;margin-bottom:4px;"><i class="ti ti-folder"></i> '+esc(fn)+'</div>'
      +byFolder[fn].map(function(r){ var on=window._rptReqSel.has(r.id); return '<label style="display:flex;align-items:center;gap:8px;padding:5px 8px;cursor:pointer;border-radius:5px;font-size:12.5px;'+(on?'background:#eef3ff;':'')+'" onmouseenter="this.style.background=\'#f5f8ff\'" onmouseleave="this.style.background=\''+(on?'#eef3ff':'')+'\'"><input type="checkbox" '+(on?'checked':'')+' onchange="_rptReqToggle(\''+esc(r.id).replace(/'/g,"\\'")+'\',this.checked)" style="width:15px;height:15px;cursor:pointer;"><span>'+esc(r.label)+'</span></label>'; }).join('')+'</div>';
  }).join('')||'<div style="padding:30px;text-align:center;color:var(--text3);">표시할 REQ가 없습니다.</div>';
  return '<div onclick="if(event.target===this)_rptReqPopupClose()" style="position:fixed;inset:0;z-index:100080;background:rgba(20,28,48,0.32);display:flex;align-items:center;justify-content:center;">'
    +'<div style="width:540px;max-width:94vw;max-height:84vh;background:#fff;border-radius:13px;box-shadow:0 20px 60px rgba(0,0,0,0.3);display:flex;flex-direction:column;overflow:hidden;">'
    +'<div style="padding:11px 16px;border-bottom:1px solid var(--border);background:#f3eefe;display:flex;align-items:center;gap:7px;flex-shrink:0;"><i class="ti ti-folders" style="font-size:17px;color:#7c3aed;"></i><span style="font-size:14px;font-weight:800;color:#7c3aed;">REQ 선택 — 해당 REQ만 표시</span><span style="flex:1;"></span>'
      +'<button onclick="window._rptReqSel=new Set();renderReport();var d=document.getElementById(\'rpt-reqpopup\');if(d)d.innerHTML=_rptReqPopupHtml();" style="font-size:11px;padding:4px 11px;border-radius:6px;border:1px solid #d9d2f0;background:#fff;color:#7c3aed;cursor:pointer;font-weight:700;">전체 해제</button>'
      +'<button onclick="_rptReqPopupClose()" style="width:26px;height:26px;border-radius:6px;border:1px solid var(--border);background:#fff;color:var(--text3);cursor:pointer;"><i class="ti ti-x"></i></button></div>'
    +'<div style="flex:1;overflow:auto;padding:10px;">'+body+'</div>'
    +'<div style="padding:9px 16px;border-top:1px solid var(--border);background:#fafbfc;display:flex;align-items:center;gap:8px;flex-shrink:0;"><span style="flex:1;font-size:11.5px;color:var(--text3);">REQ 체크 시 즉시 적용 (다중 선택 가능)</span><button onclick="_rptReqPopupClose()" style="font-size:12px;padding:6px 20px;border-radius:7px;border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:700;">닫기</button></div>'
    +'</div></div>';
}
function _rptReqToggle(rid,on){ window._rptReqSel=window._rptReqSel||new Set(); if(on)window._rptReqSel.add(rid); else window._rptReqSel.delete(rid); renderReport(); }
// ── 보고서 / PPTX — Test Report 자체 출력(현재 화면 차트+요약+결과표, 필터·스코프·REQ 반영) ──
function _rptOpenPPTX(){ if(typeof reportExportPPTX==='function') reportExportPPTX(); else showToast('PPTX 함수 미로드'); }   // Test Report 자체 PPTX(차트+요약+결과표)
function _rptOpenReport(){ if(typeof reportExportPDF==='function') reportExportPDF(); else showToast('보고서 함수 미로드'); }   // Test Report 자체 보고서(현재 화면 차트+결과표 PDF)
// ── Cycle Tree 스코프 필터: Cycle Test Execution과 동일 — 모델그룹 ▸ 모델(장비) ▸ 버전 3단 트리 ──
// 스코프 미선택(level 없음)이면 항상 통과 → 기존 리포트 동작 100% 보존.
function _rptScopeMatch(it){ const S=window._rptScope; if(!S||!S.level)return true;
  const c=(cycleList||[]).find(function(x){return x.id===it._cycleId;}); if(!c) return false;
  const cmg=(typeof _cycMGroup==='function')?_cycMGroup(c):(c.model||'-');
  if(S.mgroup&&cmg!==S.mgroup)return false;
  if(S.model&&(c.model||'')!==S.model)return false;
  if(S.version&&(c.version||'')!==S.version)return false;
  return true; }
// 선택한 트리 노드에 매칭되는 사이클 배열
function _rptScopeCycles(mg,m,v){ return (cycleList||[]).filter(function(c){ const cmg=(typeof _cycMGroup==='function')?_cycMGroup(c):(c.model||'-');
  return (!mg||cmg===mg)&&(!m||(c.model||'')===m)&&(!v||c.version===v); }); }
// 노드 우측 미니 진행률 바
function _rptScopeBar(mg,m,v){ const cy=_rptScopeCycles(mg,m,v); const all=[]; cy.forEach(function(c){ (c.items||[]).forEach(function(it){ all.push(it); }); });
  if(!all.length) return '';
  const s=cycleCalcStats(all);
  return '<span style="display:inline-flex;align-items:center;gap:4px;flex-shrink:0;margin-left:4px;">'
    +'<span style="width:34px;height:5px;border-radius:3px;background:#e6e8ec;overflow:hidden;display:inline-flex;"><span style="width:'+s.passRate+'%;background:#00a872;"></span><span style="width:'+s.failRate+'%;background:#e53e5a;"></span></span>'
    +'<span style="font-size:9.5px;color:var(--text3);font-weight:600;">'+(s.pass+s.fail)+'/'+s.inScope+'</span></span>'; }
// 트리 한 행 — 클릭=선택만, '>' 캐럿만 접기/펴기
// Reports Theme 사용자 커스터마이즈 반영: 아이콘·색·폰트·크기·굵기 각 레벨별 override 지원
// pathLast: 각 depth 에서 "이 노드가 그 depth 의 마지막 자식인지" boolean 배열 → expGuides 로 세로 가이드 선 렌더
function _rptScopeRow(level,mg,m,v,label,color,icon,indent,hasChild,openKey,sel,pathLast){
  const e=(typeof _bdEsc==='function')?_bdEsc:(function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');});
  const S=window._rptTreeOpen;
  // Reports Theme 커스터마이즈 키 매핑: level → rptTree*
  const _cckey = level==='mgroup'?'rptTreeMgroup':(level==='model'?'rptTreeModel':(level==='version'?'rptTreeVersion':''));
  let _icColor=color, _icName=icon, _icSize=14, _txtColor='var(--text)', _fs=12, _bold=false, _ff='';
  if(_cckey){
    try{
      if(typeof _ccIconGet==='function'){ const _ig=_ccIconGet(_cckey); if(_ig){ _icColor=_ig.color||color; _icName=_ig.ic||icon; if(_ig.size) _icSize=_ig.size; } }
      if(typeof _ccAccentGet==='function'){ _txtColor=_ccAccentGet(_cckey)||_txtColor; }
      if(typeof _ccFontSizeGet==='function'){ _fs=_ccFontSizeGet(_cckey)||12; }
      if(typeof _ccBoldGet==='function'){ _bold=_ccBoldGet(_cckey); }
      if(typeof _ccFontFamilyGet==='function'){ _ff=_ccFontFamilyGet(_cckey)||''; }
    }catch(_e){}
  }
  const _cOpened=S.has(openKey);
  const chev=hasChild?('<i class="ti ti-chevron-right" onclick="event.stopPropagation();_rptScopeToggle(\''+e(openKey)+'\')" title="펼치기/접기" style="font-size:18px;flex-shrink:0;color:var(--text3);transition:transform 0.15s;cursor:pointer;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;border-radius:5px;'+(_cOpened?'transform:rotate(90deg)':'')+'"></i>'):'<span style="width:22px;flex-shrink:0;"></span>';
  const pa="'"+e(level)+"','"+e(mg)+"','"+e(m)+"','"+e(v)+"'";
  const _fw = sel ? '700' : (_bold?'700':'500');
  const _ffStyle = _ff?('font-family:'+_ff+';'):'';
  var _guides=(typeof expGuides==='function' && pathLast && pathLast.length)?expGuides(pathLast):'';
  var _guideWrap=_guides?('<span style="display:flex;gap:6px;align-self:stretch;flex-shrink:0;margin:-5px 0;">'+_guides+'</span>'):'';
  return '<div onclick="_rptScopeSelect('+pa+')" style="display:flex;align-items:center;gap:4px;padding:5px 6px 5px '+(_guides?4:(4+indent*14))+'px;cursor:pointer;background:'+(sel?'rgba(45,111,212,0.1)':'')+';border-left:3px solid '+(sel?_icColor:'transparent')+';">'
    +_guideWrap
    +chev+'<i class="ti '+_icName+'" style="font-size:'+_icSize+'px;color:'+_icColor+';flex-shrink:0;"></i>'
    +'<span style="flex:1;min-width:0;font-size:'+_fs+'px;font-weight:'+_fw+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:'+_txtColor+';'+_ffStyle+'">'+e(label)+'</span>'
    +_rptScopeBar(mg,m,v)
  +'</div>'; }
// 좌측 트리 전체 HTML: 모델그룹 ▸ 모델(장비) ▸ 버전 (Cycle Test Execution과 동일 기준)
function _rptScopeTreeHtml(){
  const S=window._rptScope||{}; const O=window._rptTreeOpen;
  const dir=(typeof cbTreeSortDir!=='undefined')?cbTreeSortDir:1;
  const _s=function(arr){ return arr.slice().sort(function(a,b){ return dir*String(a).localeCompare(String(b),undefined,{numeric:true}); }); };
  const C={mg:'#2d6fd4', model:'#00a872', ver:'#e8820c'};
  // "전체" 행
  let h='<div onclick="_rptScopeSelect(\'\',\'\',\'\',\'\')" style="display:flex;align-items:center;gap:6px;padding:6px;margin-bottom:4px;cursor:pointer;border-radius:7px;background:'+(!S.level?'rgba(45,111,212,0.1)':'')+';border:1px solid '+(!S.level?'#b9d0f2':'var(--border)')+';">'
    +'<i class="ti ti-stack-2" style="font-size:15px;color:#2d6fd4;"></i><span style="flex:1;font-size:12px;font-weight:'+(!S.level?'700':'600')+';color:var(--text);">전체</span>'+_rptScopeBar('','','')+'</div>';
  // 모델그룹(사이클의 모델 → 모델 등록 데이터의 그룹) 목록
  const mgMap={}; (cycleList||[]).forEach(function(c){ const mg=(typeof _cycMGroup==='function')?_cycMGroup(c):(c.model||'(미분류)'); (mgMap[mg]=mgMap[mg]||[]).push(c); });
  const mgs=_s(Object.keys(mgMap));
  if(!mgs.length) return h+'<div style="padding:20px 8px;text-align:center;color:var(--text3);font-size:11.5px;">사이클이 없습니다.</div>';
  mgs.forEach(function(mg, mgi){
    const mgCyc=mgMap[mg]; const mgk='mg@@'+mg;
    const mgLast=(mgi===mgs.length-1);
    const mgSel=S.level==='mgroup'&&S.mgroup===mg&&!S.model&&!S.version;
    // 최상위(모델그룹)는 가이드 선 없음 — pathLast 는 하위 depth 부터 계산
    h+=_rptScopeRow('mgroup',mg,'','',mg,C.mg,'ti-folder'+(O.has(mgk)?'-open':''),0,mgCyc.length>0,mgk,mgSel,[]);
    if(O.has(mgk)){
      // 모델(장비) 목록 — 그룹 인라인
      const mMap={}; mgCyc.forEach(function(c){ const m=c.model||'(미지정)'; (mMap[m]=mMap[m]||[]).push(c); });
      const mKeys=_s(Object.keys(mMap));
      mKeys.forEach(function(m, mi){
        const mCyc=mMap[m]; const mk='m@@'+mg+'@@'+m;
        const mLast=(mi===mKeys.length-1);
        const mSel=S.level==='model'&&S.mgroup===mg&&S.model===m&&!S.version;
        h+=_rptScopeRow('model',mg,m,'',m,C.model,'ti-device-desktop',1,mCyc.length>0,mk,mSel,[mLast]);
        if(O.has(mk)){
          // 버전 목록 — 모델 인라인
          const vers=_s([...new Set(mCyc.map(function(c){return c.version||'';}).filter(Boolean))]);
          vers.forEach(function(v, vi){
            const vLast=(vi===vers.length-1);
            const vSel=S.level==='version'&&S.mgroup===mg&&S.model===m&&S.version===v;
            h+=_rptScopeRow('version',mg,m,v,v,C.ver,'ti-tag',2,false,'',vSel,[mLast, vLast]);
          });
        }
      });
    }
  });
  return h; }
// 트리 노드 선택 → 스코프 세팅(선택만 — 접기/펴기는 캐럿) + 조상 경로 열림 유지 + 리포트 재렌더
function _rptScopeSelect(level,mg,m,v){
  window._rptScope={ level:level||'', mgroup:mg||'', model:m||'', version:v||'' };
  const O=window._rptTreeOpen=window._rptTreeOpen||new Set();
  if(mg&&level!=='mgroup'){ O.add('mg@@'+mg); if(m&&level!=='model') O.add('m@@'+mg+'@@'+m); }
  renderReport(); }
// 트리 셰브런 펼침/접기 → 트리 DOM만 갱신(전체 리렌더 X)
function _rptScopeToggle(key){
  const O=window._rptTreeOpen=window._rptTreeOpen||new Set();
  O.has(key)?O.delete(key):O.add(key);
  const t=document.getElementById('rpt-scope-tree'); if(t) t.innerHTML=_rptScopeTreeHtml(); }

function _rptSet(k,v){ window._rptF=window._rptF||{}; window._rptF[k]=v; renderReport(); }
// ── Custom-field filter (Test Report) — 시스템>커스텀 필드 값으로 필터 ──

function _rptCfFields(target){ return ((customFields&&customFields[target])||[]).filter(f=>f.active!==false&&(f.type==='Select'||f.type==='MultiSelect')&&['상태','고객사'].indexOf((f.label||'').trim())<0); }

function _rptCfMaster(it){ return tcList.find(t=>t.tcid===it.tcid||t.id===it.tcid)||null; }

function _rptCfMasterReq(it){ return reqList.find(x=>x.id===it.req_id)||null; }

function _rptCfMatchOne(obj,store){ const cf=(obj&&obj.custom_fields)||{}; for(const fid in store){ const val=store[fid]; if(!val) continue; let v=cf[fid]; if(Array.isArray(v)) v=v.filter(Boolean).join(','); v=v||''; if(!(v===val||String(v).split(',').includes(val))) return false; } return true; }

function _rptCfPass(it){ if(!_rptCfMatchOne(_rptCfMaster(it),reportCfFilter.tc)) return false; if(!_rptCfMatchOne(_rptCfMasterReq(it),reportCfFilter.req)) return false; return true; }

function _rptCfSet(target,fid,val){ const s=reportCfFilter[target]; if(val) s[fid]=val; else delete s[fid]; renderReport(); }
// ── 사이클 필터: OLT / L3 / L2 트리(카테고리 → 장비명 → 버전) ──

function _rptCfCells(only){
  let out='';
  ['req','tc'].forEach(function(target){ _rptCfFields(target).forEach(function(f){ if(typeof only==='function' && !only(f)) return;
    const cur=reportCfFilter[target][f.id]||'';
    const opts='<option value="">전체</option>'+(f.options||[]).map(function(o){ const ov=cfOptValue(o); return '<option value="'+_bdEsc(ov)+'"'+(cur===ov?' selected':'')+'>'+_bdEsc(ov)+'</option>'; }).join('');
    out+='<div style="display:flex;flex-direction:column;gap:3px;"><span style="font-size:10px;color:var(--text3);font-weight:600;">'+_bdEsc(f.label||f.id)+'</span><select onchange="_rptCfSet(\''+target+'\',\''+f.id+'\',this.value)" style="font-size:12px;padding:6px 8px;border:1px solid '+(cur?'#2d6fd4':'var(--border)')+';border-radius:6px;min-width:130px;outline:none;background:'+(cur?'#eef3ff':'#fff')+';color:'+(cur?'#2d6fd4':'inherit')+';">'+opts+'</select></div>';
  }); });
  return out;
}


// ══ Test Report 결과 표 (TestRail/Zephyr 스타일) ══

// ── 사이클 필터: OLT / L3 / L2 트리(카테고리 → 장비명 → 버전) ──
function _rptDevCat(model){
  const dev=(typeof devices!=='undefined'?devices:[]).find(function(d){return (d.model||'')===model;});
  const g=((dev&&dev.group)||'').toUpperCase();
  const m=(model||'').toUpperCase();
  if(g==='계측기'||g==='METER'||g==='INSTRUMENT'||/IXIA|SPIRENT|N2X|STC/.test(m)) return null; // 계측기/트래픽 생성기 제외(대시보드와 동일)
  if(g==='OLT'||m.indexOf('OLT')>=0||/^U\d/.test(m)) return 'OLT'; // 유비쿼스 U-시리즈(U9024A, U95xxH 등)=OLT
  if(g==='스위치'||g==='SWITCH'){ if(m.indexOf('L3')>=0||/^E[78]/.test(m)) return 'L3'; return 'L2'; }
  if(m.indexOf('L3')>=0||/^E[78]/.test(m)) return 'L3';
  return 'L2';
}

function _rptCycTreeData(){
  const all=(typeof _rptCollect==='function')?(_rptCollect()||[]):[];
  const ids=[]; const seen={}; all.forEach(function(x){ if(x._cycleId&&!seen[x._cycleId]){ seen[x._cycleId]=1; ids.push(x._cycleId); } });
  const tree={};
  ids.forEach(function(id){ const c=(typeof cycleList!=='undefined'?cycleList:[]).find(function(y){return y.id===id;}); if(!c) return;
    const model=c.model||'-'; const cat=_rptDevCat(model); if(!cat) return;
    const ver=(c.version_group?(c.version_group+' / '):'')+(c.version||'');
    tree[cat]=tree[cat]||{}; tree[cat][model]=tree[cat][model]||[];
    tree[cat][model].push({id:id, label:ver||c.name||id});
  });
  return tree;
}

function _rptCycTreeHtml(){
  const tree=_rptCycTreeData();
  const cats=['OLT','L3','L2']; Object.keys(tree).forEach(function(c){ if(cats.indexOf(c)<0) cats.push(c); });
  const cur=(window._rptF&&window._rptF.cycle)||'';
  const e=function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;'); };
  const catColor={OLT:'#00a872',L3:'#9d7bff',L2:'#2d6fd4'};
  let html='<div onclick="_rptCycPick(\'\')" style="padding:7px 9px;border-radius:6px;cursor:pointer;font-size:12.5px;font-weight:600;color:'+(cur?'var(--text2)':'#2d6fd4')+';background:'+(cur?'transparent':'#eef3ff')+';">전체 사이클</div>';
  let any=false;
  cats.forEach(function(cat){ if(!tree[cat]) return; any=true;
    const models=Object.keys(tree[cat]); const cc=catColor[cat]||'#888';
    html+='<div onclick="_rptCycNodeToggle(this)" style="display:flex;align-items:center;gap:6px;padding:7px 8px;cursor:pointer;font-size:12px;font-weight:700;color:'+cc+';margin-top:2px;"><i class="rpt-cyc-ic ti ti-chevron-down" style="font-size:12px;"></i><i class="ti ti-stack-2" style="font-size:13px;"></i>'+e(cat)+' <span style="color:var(--text3);font-weight:500;font-size:11px;">('+models.length+')</span></div>';
    html+='<div style="display:block;">';
    models.forEach(function(model){ const vers=tree[cat][model]; const _open=vers.some(function(v){return v.id===cur;});
      html+='<div onclick="_rptCycNodeToggle(this)" style="display:flex;align-items:center;gap:6px;padding:5px 8px 5px 18px;cursor:pointer;font-size:12px;font-weight:600;color:var(--text);"><i class="rpt-cyc-ic ti ti-chevron-'+(_open?'down':'right')+'" style="font-size:11px;color:var(--text3);"></i><i class="ti ti-router" style="font-size:12px;color:var(--text3);"></i>'+e(model)+' <span style="color:var(--text3);font-weight:400;font-size:11px;">('+vers.length+')</span></div>';
      html+='<div style="display:'+(_open?'block':'none')+';">';
      vers.forEach(function(v){ const on=(cur===v.id); html+='<div onclick="_rptCycPick(\''+v.id+'\')" style="padding:5px 9px 5px 40px;border-radius:5px;cursor:pointer;font-size:12px;color:'+(on?'#2d6fd4':'var(--text2)')+';font-weight:'+(on?'700':'400')+';background:'+(on?'#eef3ff':'transparent')+';" onmouseenter="if(this.style.background!==\'rgb(238, 243, 255)\')this.style.background=\'var(--bg3)\'" onmouseleave="if(this.style.color!==\'rgb(45, 111, 212)\')this.style.background=\'transparent\'"><i class="ti ti-git-branch" style="font-size:11px;color:var(--text3);margin-right:3px;"></i>'+e(v.label)+'</div>'; });
      html+='</div>';
    });
    html+='</div>';
  });
  if(!any) html+='<div style="padding:14px;text-align:center;color:var(--text3);font-size:12px;">사이클 데이터가 없습니다</div>';
  return html;
}

function _rptCycTreeToggle(ev){
  if(ev&&ev.stopPropagation)ev.stopPropagation();
  if(document.getElementById('rptCycTreePop')){ _rptCycClose(); return; } // 열려있으면 닫기
  const trig=document.getElementById('rptCycTreeBtn'); if(!trig)return;
  const r=trig.getBoundingClientRect();
  const pop=document.createElement('div'); pop.id='rptCycTreePop';
  const maxH=Math.max(180, Math.min(400, window.innerHeight-r.bottom-14));
  pop.style.cssText='position:fixed;z-index:12000;top:'+(r.bottom+3)+'px;left:'+r.left+'px;width:300px;max-height:'+maxH+'px;overflow-y:auto;background:#fff;border:1px solid var(--border);border-radius:8px;box-shadow:0 10px 28px rgba(0,0,0,0.22);padding:5px;';
  pop.innerHTML=_rptCycTreeHtml();
  document.body.appendChild(pop);
  const pr=pop.getBoundingClientRect(); if(pr.right>window.innerWidth-8){ pop.style.left=Math.max(8,window.innerWidth-8-pr.width)+'px'; }
  setTimeout(function(){ const close=function(ev2){ const pp=document.getElementById('rptCycTreePop'); const tb=document.getElementById('rptCycTreeBtn'); if(!pp){ document.removeEventListener('mousedown',close,true); window._rptCycCloseFn=null; return; } if(!pp.contains(ev2.target) && !(tb&&tb.contains(ev2.target))){ _rptCycClose(); } }; window._rptCycCloseFn=close; document.addEventListener('mousedown',close,true); },0);
}

function _rptCycNodeToggle(el){ const body=el.nextElementSibling; if(!body)return; const hide=(body.style.display!=='none'); body.style.display=hide?'none':'block'; const ic=el.querySelector('.rpt-cyc-ic'); if(ic) ic.className='rpt-cyc-ic ti ti-chevron-'+(hide?'right':'down'); }

function _rptCycPick(id){ _rptCycClose(); window._rptF=window._rptF||{cycle:'',severity:'',verdict:'',req:''}; window._rptF.cycle=id; renderReport(); }

function _rptCycClose(){ const p=document.getElementById('rptCycTreePop'); if(p) p.remove(); if(window._rptCycCloseFn){ try{ document.removeEventListener('mousedown',window._rptCycCloseFn,true); }catch(_){} window._rptCycCloseFn=null; } }

// ══ Test Report 결과 표 (TestRail/Zephyr 스타일) ══
function _rptViewToggle(){
  // 탐색 뷰만 사용 — AI 질문은 우측 하단 전용 ai-fab(팝업)으로 하고 결과는 탐색에 반영
  window._rptView='explore';
  return '<div style="display:inline-flex;gap:3px;background:var(--bg3);border:1px solid var(--border);border-radius:9px;padding:3px;margin-bottom:14px;">'
    +'<button style="display:flex;align-items:center;gap:5px;font-size:12px;font-weight:700;padding:6px 14px;border:none;border-radius:7px;background:#fff;color:var(--blue);cursor:default;box-shadow:0 1px 3px rgba(0,0,0,0.12);"><i class="ti ti-adjustments"></i> 탐색</button>'
    +'<span style="display:flex;align-items:center;font-size:11px;color:var(--text3);padding:0 10px;">AI 질문은 우측 하단 <i class="ti ti-message-chatbot" style="color:#0d9488;margin:0 3px;"></i> 버튼으로 — 결과가 이 화면에 반영됩니다</span>'
    +'</div>';
}

function _rptSevField(){ return (((customFields&&customFields.tc)||[]).concat((customFields&&customFields.req)||[])).find(function(f){return (f.label||'').indexOf('심각도')>=0;})||null; }

function _rptSevVal(it){ const f=_rptSevField(); if(f){ const tc=_rptCfMaster(it),rq=_rptCfMasterReq(it); let v=(tc&&tc.custom_fields&&tc.custom_fields[f.id])||(rq&&rq.custom_fields&&rq.custom_fields[f.id])||''; if(Array.isArray(v))v=v.join(','); if(v) return v; } return it.severity||''; }

function _rptSevBadge(it){ const s=_rptSevVal(it); if(!s) return '<span style="color:var(--text3);font-size:11px;">–</span>'; const hi=/높|crit|high|major|p1|s1|긴급|심각/i.test(s), mid=/중|medium|normal|보통|p2|s2/i.test(s); const c=hi?'#e53e5a':(mid?'#e8820c':'#5a8fd6'); return '<span style="font-size:11px;font-weight:600;color:'+c+';background:'+c+'1f;padding:2px 8px;border-radius:5px;white-space:nowrap;">'+_bdEsc(s)+'</span>'; }

function _rptVBadge(v){ const M={pass:['합격','#00a872'],fail:['불합격','#e53e5a'],pending:['예정','#9aa0b8'],exclude:['제외','#c9923e']}; const m=M[v]||M.pending; return '<span style="display:inline-block;font-size:11px;font-weight:700;color:#fff;background:'+m[1]+';padding:3px 11px;border-radius:11px;white-space:nowrap;min-width:48px;text-align:center;letter-spacing:0.3px;">'+m[0]+'</span>'; }

function _rptBar(st,w){ const dn=(st.pass+st.fail+st.pending+st.exclude)||1; const seg=function(n,c){ return n?'<div style="width:'+(n/dn*100)+'%;background:'+c+';"></div>':''; }; return '<span style="display:inline-flex;height:8px;width:'+(w||120)+'px;border-radius:4px;overflow:hidden;background:#e6e9ef;vertical-align:middle;">'+seg(st.pass,'#00a872')+seg(st.fail,'#e53e5a')+seg(st.exclude,'#c9923e')+seg(st.pending,'#d6dae2')+'</span>'; }

function _rptSetSort(key){ if(window._rptSort===key){ window._rptSortDir=-(window._rptSortDir||1); } else { window._rptSort=key; window._rptSortDir=1; } renderReport(); }

function _rptRowToggle(k){ window._rptExpanded=window._rptExpanded||{}; if(window._rptExpanded[k]) delete window._rptExpanded[k]; else window._rptExpanded[k]=1; renderReport(); }

function _rptStepRow(it){
  const steps=it.steps||[];
  if(!steps.length) return '<tr data-exp="1" style="background:#f6f9ff;"><td colspan="6" style="padding:8px 30px;font-size:11px;color:var(--text3);">스텝 정보 없음</td></tr>';
  const c='padding:5px 9px;border-bottom:1px solid #eef0f3;font-size:11px;vertical-align:top;';
  const rows=steps.map(function(s,i){ const v=resultVerdict(s.result); const col={pass:'#00a872',fail:'#e53e5a'}[v]||'#8a92a6';
    return '<tr><td style="'+c+'color:var(--text3);width:26px;">'+(i+1)+'</td><td style="'+c+'font-weight:600;white-space:nowrap;">'+_bdEsc(s.action||'CLI')+'</td><td style="'+c+'font-family:ui-monospace,monospace;color:#2d6fd4;word-break:break-all;">'+_bdEsc(s.cli||s.input||'')+'</td><td style="'+c+'color:var(--text2);">'+_bdEsc(s.criteria||'')+'</td><td style="'+c+'font-weight:700;color:'+col+';white-space:nowrap;">'+_bdEsc(s.result||'–')+'</td></tr>'
      +(s.output?'<tr><td></td><td colspan="4" style="padding:0 9px 6px;"><pre style="margin:0;padding:7px 9px;background:#10131a;color:#cfe3d6;border-radius:5px;font-size:10px;white-space:pre-wrap;max-height:160px;overflow:auto;">'+_bdEsc(String(s.output).slice(0,1500))+'</pre></td></tr>':'');
  }).join('');
  return '<tr data-exp="1" style="background:#f6f9ff;"><td colspan="6" style="padding:6px 14px 12px 30px;"><div style="border:1px solid var(--border);border-radius:7px;overflow:hidden;background:#fff;"><table style="width:100%;border-collapse:collapse;"><thead><tr style="background:#eef2f7;"><th style="'+c+'font-weight:700;">#</th><th style="'+c+'font-weight:700;">동작</th><th style="'+c+'font-weight:700;">CLI</th><th style="'+c+'font-weight:700;">판정기준</th><th style="'+c+'font-weight:700;">결과</th></tr></thead><tbody>'+rows+'</tbody></table></div></td></tr>';
}

function _rptTableHtml(items){
  const sortKey=window._rptSort||'verdict', dir=window._rptSortDir||1, groupBy=window._rptGroup||'';
  window._rptExpanded=window._rptExpanded||{};
  const reqCode=function(it){ const rq=reqList.find(x=>x.id===it.req_id); return (rq&&rq.reqid)||it.req_id||''; };
  const reqTitle=function(it){ const rq=reqList.find(x=>x.id===it.req_id); return (rq&&rq.title)||''; };
  const keyOf=function(it){ return it._cycleId+'@@'+String(it.tcid||it.name||'').replace(/[^\w가-힣\-]/g,'_'); };
  const vOrder={fail:0,pending:1,exclude:2,pass:3};
  const sorted=items.slice().sort(function(a,b){ let x,y;
    if(sortKey==='verdict'){ x=vOrder[_rptVerdict(a)]; y=vOrder[_rptVerdict(b)]; }
    else if(sortKey==='tc'){ x=(a.tcid||a.name||''); y=(b.tcid||b.name||''); }
    else if(sortKey==='sev'){ x=_rptSevVal(a); y=_rptSevVal(b); }
    else if(sortKey==='req'){ x=reqCode(a); y=reqCode(b); }
    else if(sortKey==='cycle'){ x=a._grp||''; y=b._grp||''; }
    else if(sortKey==='date'){ x=_rptItemDate(a); y=_rptItemDate(b); }
    else { x=0; y=0; }
    return (x<y?-1:x>y?1:0)*dir;
  });
  const groupKey=function(it){ if(groupBy==='req') return reqCode(it)||'(REQ 없음)'; if(groupBy==='cycle') return it._grp||'-'; if(groupBy==='sev') return _rptSevVal(it)||'(미지정)'; return ''; };
  const th=function(key,lbl,w){ const on=sortKey===key; return '<th onclick="_rptSetSort(\''+key+'\')" style="padding:9px 10px;text-align:left;font-size:11px;font-weight:700;color:'+(on?'var(--blue)':'var(--text3)')+';cursor:pointer;white-space:nowrap;border-bottom:2px solid var(--border);user-select:none;'+(w?'width:'+w+';':'')+'">'+lbl+(on?' <i class="ti ti-'+(dir>0?'caret-up':'caret-down')+'-filled" style="font-size:10px;"></i>':'')+'</th>'; };
  const rowHtml=function(it){ const v=_rptVerdict(it), k=keyOf(it), exp=window._rptExpanded[k]; const cBar={pass:'#00a872',fail:'#e53e5a',pending:'#c4c9d4',exclude:'#c9923e'}[v]||'#c4c9d4';
    let h='<tr onclick="_rptRowToggle(\''+k+'\')" '+(exp?'data-exp="1"':'')+' style="cursor:pointer;background:'+(exp?'#f6f9ff':'#fff')+';" onmouseenter="if(!this.dataset.exp)this.style.background=document.body.classList.contains(\'dark\')?\'var(--bg3)\':\'#f8fafc\'" onmouseleave="if(!this.dataset.exp)this.style.background=\'\'">'
      +'<td style="padding:6px 10px;border-left:3px solid '+cBar+';border-bottom:1px solid #eef0f3;white-space:nowrap;"><i class="ti ti-chevron-'+(exp?'down':'right')+'" style="font-size:12px;color:var(--text3);vertical-align:middle;margin-right:6px;"></i>'+_rptVBadge(v)+'</td>'
      +'<td style="padding:6px 10px;border-bottom:1px solid #eef0f3;line-height:1.3;"><div style="font-family:ui-monospace,monospace;font-size:10.5px;color:#2d6fd4;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+_bdEsc(String(it.tcid||'').replace(/^U-REQ-SYS-/i,''))+'</div><div style="font-size:12.5px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+_bdEsc(it.name||'')+'</div></td>'
      +'<td style="padding:6px 10px;border-bottom:1px solid #eef0f3;white-space:nowrap;">'+_rptSevBadge(it)+'</td>'
      +'<td style="padding:6px 10px;border-bottom:1px solid #eef0f3;line-height:1.3;"><div style="font-family:ui-monospace,monospace;font-size:11px;color:var(--text2);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+_bdEsc(reqCode(it))+'</div>'+(reqTitle(it)?'<div style="font-size:10.5px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+_bdEsc(reqTitle(it))+'</div>':'')+'</td>'
      +'<td style="padding:6px 10px;border-bottom:1px solid #eef0f3;font-size:11.5px;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+_bdEsc(it._grp||'-')+'</td>'
      +'<td style="padding:6px 10px;border-bottom:1px solid #eef0f3;font-size:11.5px;color:var(--text3);white-space:nowrap;">'+(_rptItemDate(it)||'–')+'</td>'
    +'</tr>';
    if(exp) h+=_rptStepRow(it);
    return h;
  };
  let bodyRows='';
  if(groupBy){
    const groups={}; sorted.forEach(function(it){ const g=groupKey(it); (groups[g]=groups[g]||[]).push(it); });
    Object.keys(groups).sort().forEach(function(g){ const gi=groups[g], st=cycleCalcStats(gi);
      bodyRows+='<tr style="background:var(--bg3);"><td colspan="6" style="padding:8px 12px;border-bottom:1px solid var(--border);"><span style="font-size:12px;font-weight:800;color:var(--text);"><i class="ti ti-folder" style="color:var(--blue);font-size:13px;"></i> '+_bdEsc(g)+'</span> <span style="font-size:10.5px;color:var(--text3);font-weight:600;margin:0 9px;">'+gi.length+'건</span> '+_rptBar(st,120)+' <span style="font-size:10.5px;font-weight:700;margin-left:7px;color:var(--text3);">'+st.progress+'% · <span style="color:#00a872;">'+st.pass+'</span> / <span style="color:#e53e5a;">'+st.fail+'</span></span></td></tr>';
      bodyRows+=gi.map(rowHtml).join('');
    });
  } else { bodyRows=sorted.map(rowHtml).join(''); }
  const st=cycleCalcStats(items);
  const gsel='<select onchange="window._rptGroup=this.value;renderReport()" style="font-size:11.5px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:#fff;outline:none;cursor:pointer;"><option value=""'+(groupBy===''?' selected':'')+'>그룹 없음</option><option value="req"'+(groupBy==='req'?' selected':'')+'>REQ별</option><option value="cycle"'+(groupBy==='cycle'?' selected':'')+'>사이클별</option><option value="sev"'+(groupBy==='sev'?' selected':'')+'>심각도별</option></select>';
  const toolbar='<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;flex-wrap:wrap;">'
    +'<span style="font-size:13px;font-weight:700;color:var(--text);">결과 '+items.length+'건</span>'
    +_rptBar(st,180)
    +'<span style="font-size:14px;font-weight:800;color:var(--text);">'+st.progress+'<span style="font-size:11px;color:var(--text3);font-weight:600;">% 합격</span></span>'
    +'<span style="font-size:11.5px;"><span style="color:#00a872;font-weight:700;">합격 '+st.pass+'</span> · <span style="color:#e53e5a;font-weight:700;">불합격 '+st.fail+'</span> · <span style="color:#8a92a6;">예정 '+st.pending+'</span>'+(st.exclude?' · <span style="color:#c9923e;">제외 '+st.exclude+'</span>':'')+'</span>'
    +'<div style="flex:1;"></div><span style="font-size:11px;color:var(--text3);">그룹</span>'+gsel+'</div>';
  return '<div style="background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden;"><div style="padding:12px 14px 4px;">'+toolbar+'</div><div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;min-width:780px;"><thead style="background:#f7f9fc;"><tr>'+th('verdict','결과','104px')+th('tc','시험항목 (TC)','250px')+th('sev','심각도','90px')+th('req','REQ','232px')+th('cycle','사이클','148px')+th('date','실행일','94px')+'</tr></thead><tbody>'+bodyRows+'</tbody></table></div></div>';
}


// ══ Test Report 분석(드릴다운) 뷰 ══

function _rptDestroy(){ Object.values(_rptCharts).forEach(c=>{ try{c.destroy();}catch(e){} }); _rptCharts={}; }

function _rptDraw(items){
  _rptDestroy();
  const C=id=>{ const el=document.getElementById(id); return el?el.getContext('2d'):null; };
  const co={responsive:true,maintainAspectRatio:false};
  const stats=cycleCalcStats(items);
  if(C('rptDonut')) _rptCharts.donut=new Chart(C('rptDonut'),{type:'doughnut',data:{labels:['합격','불합격','예정','제외'],datasets:[{data:[stats.pass,stats.fail,stats.pending,stats.exclude],backgroundColor:['#00a872','#e53e5a','#c4c9d4','#c9923e']}]},options:Object.assign({plugins:{legend:{position:'right'}}},co)});
  const sevs=[...new Set(items.map(x=>(_rptSevVal(x)||'미지정')))];
  if(C('rptSev')) _rptCharts.sev=new Chart(C('rptSev'),{type:'bar',data:{labels:sevs,datasets:[{label:'합격',data:sevs.map(s=>cycleCalcStats(items.filter(x=>((_rptSevVal(x)||'미지정'))===s)).pass),backgroundColor:'#00a872'},{label:'불합격',data:sevs.map(s=>cycleCalcStats(items.filter(x=>((_rptSevVal(x)||'미지정'))===s)).fail),backgroundColor:'#e53e5a'}]},options:Object.assign({scales:{x:{stacked:true},y:{stacked:true,beginAtZero:true}}},co)});
  const reqs=[...new Set(items.map(x=>x.req_id).filter(Boolean))];
  const reqLabel=reqs.map(r=>{ const rq=reqList.find(x=>x.id===r); return (rq&&rq.reqid)||r; });
  const rs=reqs.map(r=>cycleCalcStats(items.filter(x=>x.req_id===r)));
  if(C('rptReq')) _rptCharts.req=new Chart(C('rptReq'),{type:'bar',data:{labels:reqLabel,datasets:[{label:'합격',data:rs.map(s=>s.pass),backgroundColor:'#00a872'},{label:'불합격',data:rs.map(s=>s.fail),backgroundColor:'#e53e5a'},{label:'예정',data:rs.map(s=>s.pending),backgroundColor:'#c4c9d4'}]},options:Object.assign({indexAxis:'y',scales:{x:{stacked:true,beginAtZero:true},y:{stacked:true}}},co)});
  const grps=[...new Set(items.map(x=>x._grp||'-'))];
  if(C('rptModel')) _rptCharts.model=new Chart(C('rptModel'),{type:'bar',data:{labels:grps,datasets:[{label:'합격률(%)',data:grps.map(g=>{ const s=cycleCalcStats(items.filter(x=>(x._grp||'-')===g)); const dn=s.pass+s.fail; return dn?Math.round(s.pass/dn*100):0; }),backgroundColor:'#2d6fd4'}]},options:Object.assign({scales:{y:{beginAtZero:true,max:100}}},co)});
  const dated=items.map(it=>({d:_rptItemDate(it),v:_rptVerdict(it)})).filter(x=>x.d);
  const days=[...new Set(dated.map(x=>x.d))].sort(); let cp=0,cf=0; const cumP=[],cumF=[];
  days.forEach(d=>{ cp+=dated.filter(x=>x.d===d&&x.v==='pass').length; cf+=dated.filter(x=>x.d===d&&x.v==='fail').length; cumP.push(cp); cumF.push(cf); });
  if(C('rptTime')) _rptCharts.time=new Chart(C('rptTime'),{type:'line',data:{labels:days.length?days:['-'],datasets:[{label:'누적 합격',data:cumP.length?cumP:[0],borderColor:'#00a872',backgroundColor:'rgba(0,168,114,0.1)',fill:true,tension:0.3},{label:'누적 불합격',data:cumF.length?cumF:[0],borderColor:'#e53e5a',backgroundColor:'rgba(229,62,90,0.1)',fill:true,tension:0.3}]},options:Object.assign({scales:{y:{beginAtZero:true}}},co)});
  const fail=items.filter(it=>_rptVerdict(it)==='fail');
  const dsev=[...new Set(fail.map(x=>(_rptSevVal(x)||'미지정')))];
  if(C('rptDefect')) _rptCharts.defect=new Chart(C('rptDefect'),{type:'bar',data:{labels:dsev.length?dsev:['없음'],datasets:[{label:'불합격 건수',data:dsev.length?dsev.map(s=>fail.filter(x=>((_rptSevVal(x)||'미지정'))===s).length):[0],backgroundColor:'#e8820c'}]},options:Object.assign({scales:{y:{beginAtZero:true}}},co)});
}

function _rptDrawAna(items){
  if(typeof Chart==='undefined') return;
  try{ if(_rptCharts.ana){ _rptCharts.ana.destroy(); } }catch(e){}
  const cv=document.getElementById('rptAnaCanvas'); if(!cv) return; const ctx=cv.getContext('2d');
  const co={responsive:true,maintainAspectRatio:false};
  const which=window._rptAnaChart||'donut';
  const setDrill=function(dim,value,label){ window._rptDrill={dim:dim,value:value,label:label}; renderReport(); };
  const onIdx=function(cb){ return function(evt,els){ if(els&&els.length){ cb(els[0].index); } }; };
  let cfg;
  if(which==='sev'){
    const sevs=[...new Set(items.map(x=>_rptSevVal(x)||'미지정'))];
    cfg={type:'bar',data:{labels:sevs,datasets:[{label:'합격',data:sevs.map(s=>cycleCalcStats(items.filter(x=>(_rptSevVal(x)||'미지정')===s)).pass),backgroundColor:'#00a872'},{label:'불합격',data:sevs.map(s=>cycleCalcStats(items.filter(x=>(_rptSevVal(x)||'미지정')===s)).fail),backgroundColor:'#e53e5a'}]},options:Object.assign({scales:{x:{stacked:true},y:{stacked:true,beginAtZero:true}},onClick:onIdx(function(i){ setDrill('sev',sevs[i],sevs[i]); })},co)};
  } else if(which==='req'){
    const reqs=[...new Set(items.map(x=>x.req_id).filter(Boolean))];
    const reqLabel=reqs.map(r=>{ const rq=reqList.find(x=>x.id===r); return (rq&&rq.reqid)||r; });
    const rs=reqs.map(r=>cycleCalcStats(items.filter(x=>x.req_id===r)));
    cfg={type:'bar',data:{labels:reqLabel,datasets:[{label:'합격',data:rs.map(s=>s.pass),backgroundColor:'#00a872'},{label:'불합격',data:rs.map(s=>s.fail),backgroundColor:'#e53e5a'},{label:'예정',data:rs.map(s=>s.pending),backgroundColor:'#c4c9d4'}]},options:Object.assign({indexAxis:'y',scales:{x:{stacked:true,beginAtZero:true},y:{stacked:true}},onClick:onIdx(function(i){ setDrill('req',reqs[i],reqLabel[i]); })},co)};
  } else if(which==='model'){
    const grps=[...new Set(items.map(x=>x._grp||'-'))];
    cfg={type:'bar',data:{labels:grps,datasets:[{label:'합격률(%)',data:grps.map(g=>{ const s=cycleCalcStats(items.filter(x=>(x._grp||'-')===g)); const dn=s.pass+s.fail; return dn?Math.round(s.pass/dn*100):0; }),backgroundColor:'#2d6fd4'}]},options:Object.assign({scales:{y:{beginAtZero:true,max:100}},onClick:onIdx(function(i){ setDrill('model',grps[i],grps[i]); })},co)};
  } else if(which==='time'){
    const dated=items.map(it=>({d:_rptItemDate(it),v:_rptVerdict(it)})).filter(x=>x.d);
    const days=[...new Set(dated.map(x=>x.d))].sort(); let cp=0,cf=0; const cumP=[],cumF=[];
    days.forEach(d=>{ cp+=dated.filter(x=>x.d===d&&x.v==='pass').length; cf+=dated.filter(x=>x.d===d&&x.v==='fail').length; cumP.push(cp); cumF.push(cf); });
    cfg={type:'line',data:{labels:days.length?days:['-'],datasets:[{label:'누적 합격',data:cumP.length?cumP:[0],borderColor:'#00a872',backgroundColor:'rgba(0,168,114,0.1)',fill:true,tension:0.3},{label:'누적 불합격',data:cumF.length?cumF:[0],borderColor:'#e53e5a',backgroundColor:'rgba(229,62,90,0.1)',fill:true,tension:0.3}]},options:Object.assign({scales:{y:{beginAtZero:true}},onClick:onIdx(function(i){ if(days[i]) setDrill('date',days[i],days[i]); })},co)};
  } else if(which==='defect'){
    const fail=items.filter(it=>_rptVerdict(it)==='fail');
    const dsev=[...new Set(fail.map(x=>_rptSevVal(x)||'미지정'))];
    cfg={type:'bar',data:{labels:dsev.length?dsev:['없음'],datasets:[{label:'불합격 건수',data:dsev.length?dsev.map(s=>fail.filter(x=>(_rptSevVal(x)||'미지정')===s).length):[0],backgroundColor:'#e8820c'}]},options:Object.assign({scales:{y:{beginAtZero:true}},onClick:onIdx(function(i){ if(dsev[i]) setDrill('defect',dsev[i],'불합격 · '+dsev[i]); })},co)};
  } else {
    const st=cycleCalcStats(items); const verds=['pass','fail','pending','exclude'], labs=['합격','불합격','예정','제외'];
    cfg={type:'doughnut',data:{labels:labs,datasets:[{data:[st.pass,st.fail,st.pending,st.exclude],backgroundColor:['#00a872','#e53e5a','#c4c9d4','#c9923e']}]},options:Object.assign({plugins:{legend:{position:'right'}},onClick:onIdx(function(i){ setDrill('verdict',verds[i],labs[i]); })},co)};
  }
  _rptCharts.ana=new Chart(ctx,cfg);
}
// 탐색 뷰: 그래프 아래 여백을 채우는 '버전(장비·버전)별 합격/불합격' 차트

function _rptAnaHtml(items, drilled){
  const which=window._rptAnaChart||'donut';
  const charts=[['donut','진행률'],['sev','심각도별'],['model','모델·버전'],['req','REQ별'],['time','시간추이'],['defect','불합격']];
  const sel=charts.map(function(c){ const on=which===c[0]; return '<button onclick="window._rptAnaChart=\''+c[0]+'\';window._rptDrill=null;renderReport()" style="font-size:11.5px;font-weight:'+(on?'700':'500')+';padding:6px 13px;border:1px solid '+(on?'var(--blue)':'var(--border)')+';border-radius:7px;background:'+(on?'#eef3ff':'#fff')+';color:'+(on?'var(--blue)':'var(--text2)')+';cursor:pointer;">'+c[1]+'</button>'; }).join('');
  const cur=charts.find(function(c){return c[0]===which;})||charts[0];
  const d=window._rptDrill;
  const drillTag=d?'<span style="display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;color:var(--blue);background:#eef3ff;border:1px solid var(--blue);border-radius:14px;padding:3px 10px;">드릴: '+_bdEsc(d.label)+' <span onclick="event.stopPropagation();window._rptDrill=null;renderReport()" style="cursor:pointer;font-weight:900;">✕</span></span>':'<span style="font-size:11px;color:var(--text3);font-weight:500;">차트를 클릭하면 해당 결과만 표에 표시됩니다</span>';
  return '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">'+sel+'</div>'
    +'<div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;">'
      +'<div style="flex:1 1 380px;min-width:300px;background:#fff;border:1px solid var(--border);border-radius:10px;padding:14px;"><div style="font-size:12.5px;font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'+cur[1]+' '+drillTag+'</div><div style="height:340px;position:relative;"><canvas id="rptAnaCanvas"></canvas></div></div>'
      +'<div style="flex:2 1 460px;min-width:340px;">'+_rptTableHtml(drilled)+'</div>'
    +'</div>';
}

// ══ Test Report 탐색 뷰 (필터바에서 그래프 선택 → 드릴) ══

// 탐색 뷰: 그래프 아래 여백을 채우는 '버전(장비·버전)별 합격/불합격' 차트
function _rptDrawVer(items){
  if(typeof Chart==='undefined') return;
  try{ if(_rptCharts.ver){ _rptCharts.ver.destroy(); } }catch(e){}
  const cv=document.getElementById('rptVerCanvas'); if(!cv) return; const ctx=cv.getContext('2d');
  const grps=[...new Set(items.map(function(x){return x._grp||'-';}))];
  const rs=grps.map(function(g){ return cycleCalcStats(items.filter(function(x){return (x._grp||'-')===g;})); });
  const setDrill=function(dim,value,label){ window._rptDrill={dim:dim,value:value,label:label}; renderReport(); };
  const cfg={type:'bar',data:{labels:grps,datasets:[
    {label:'합격',data:rs.map(function(s){return s.pass;}),backgroundColor:'#00a872'},
    {label:'불합격',data:rs.map(function(s){return s.fail;}),backgroundColor:'#e53e5a'},
    {label:'예정',data:rs.map(function(s){return s.pending;}),backgroundColor:'#c4c9d4'},
    {label:'제외',data:rs.map(function(s){return s.exclude;}),backgroundColor:'#c9923e'}
  ]},options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',scales:{x:{stacked:true,beginAtZero:true,ticks:{precision:0}},y:{stacked:true}},plugins:{legend:{position:'bottom',labels:{font:{size:10},boxWidth:12,padding:8}}},onClick:function(evt,els){ if(els&&els.length){ const g=grps[els[0].index]; setDrill('model',g,g); } }}};
  _rptCharts.ver=new Chart(ctx,cfg);
}

// ══ Test Report 탐색 뷰 (필터바에서 그래프 선택 → 드릴) ══
function _rptExploreHtml(items, drilled){
  const which=window._rptAnaChart||'donut';
  const charts=[['donut','진행률'],['sev','심각도별'],['model','모델·버전'],['req','REQ별'],['time','시간추이'],['defect','불합격']];
  const opts=charts.map(function(c){ return '<option value="'+c[0]+'"'+(which===c[0]?' selected':'')+'>'+c[1]+'</option>'; }).join('');
  const gsel='<select onchange="window._rptAnaChart=this.value;window._rptDrill=null;renderReport()" style="font-size:12px;padding:6px 10px;border:1px solid var(--blue);border-radius:7px;background:#eef3ff;color:var(--blue);font-weight:700;outline:none;cursor:pointer;">'+opts+'</select>';
  const d=window._rptDrill;
  const drillTag=d?'<span style="display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;color:var(--blue);background:#eef3ff;border:1px solid var(--blue);border-radius:14px;padding:3px 10px;">드릴: '+_bdEsc(d.label)+' <span onclick="event.stopPropagation();window._rptDrill=null;renderReport()" style="cursor:pointer;font-weight:900;">✕</span></span>':'<span style="font-size:11px;color:var(--text3);font-weight:500;">그래프를 선택하고 막대/조각을 클릭하면 해당 결과만 표에 표시됩니다</span>';
  const graphBar='<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:9px 14px;background:#fbfcfe;border:1px solid var(--border);border-radius:10px;margin-bottom:14px;"><i class="ti ti-chart-dots" style="font-size:15px;color:var(--blue);"></i><span style="font-size:11px;color:var(--text3);font-weight:600;">그래프</span>'+gsel+drillTag+'</div>';
  const cur=charts.find(function(c){return c[0]===which;})||charts[0];
  const _verGrps=[...new Set(items.map(function(x){return x._grp||'-';}))];
  return graphBar
    +'<div style="display:flex;gap:14px;align-items:stretch;flex-wrap:wrap;margin-bottom:14px;">'
      +'<div style="flex:1 1 340px;min-width:300px;background:#fff;border:1px solid var(--border);border-radius:10px;padding:14px;"><div style="font-size:12.5px;font-weight:700;margin-bottom:10px;">'+cur[1]+'</div><div style="height:320px;position:relative;"><canvas id="rptAnaCanvas"></canvas></div></div>'
      +'<div style="flex:1 1 340px;min-width:300px;background:#fff;border:1px solid var(--border);border-radius:10px;padding:14px;"><div style="font-size:12.5px;font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:6px;"><i class="ti ti-versions" style="color:var(--blue);font-size:14px;"></i>버전별 합격 · 불합격 <span style="font-size:10.5px;color:var(--text3);font-weight:500;">('+_verGrps.length+'개 · 막대 클릭 시 필터)</span></div><div style="height:320px;position:relative;"><canvas id="rptVerCanvas"></canvas></div></div>'
    +'</div>'
    +'<div>'+_rptTableHtml(drilled)+'</div>';
}

// ══ Test Report 분석(드릴다운) 뷰 ══
function _rptDrillPass(it){ const d=window._rptDrill; if(!d||d.value==null) return true;
  if(d.dim==='verdict') return _rptVerdict(it)===d.value;
  if(d.dim==='sev') return (_rptSevVal(it)||'미지정')===d.value;
  if(d.dim==='model') return (it._grp||'-')===d.value;
  if(d.dim==='req') return it.req_id===d.value;
  if(d.dim==='date') return _rptItemDate(it)===d.value;
  if(d.dim==='defect') return _rptVerdict(it)==='fail' && (_rptSevVal(it)||'미지정')===d.value;
  return true;
}

function renderReport(){
  const _rptRoot=document.getElementById('report-body'); if(!_rptRoot) return;
  if(!window._rptCfLoaded && typeof loadCustomFields==='function'){ window._rptCfLoaded=true; loadCustomFields().then(renderReport); }
  // 모델 등록 데이터 미로드 시 트리 그룹이 모델명으로 폴백(모델명폴더>모델명>버전) → 로드 후 재렌더로 모델그룹>모델명>버전 보장
  if(!window._rptDevLoaded && (typeof modelList==='undefined'||!modelList||!modelList.length) && typeof loadDeviceData==='function'){ window._rptDevLoaded=true; loadDeviceData().then(function(){ renderReport(); }); }
  if(typeof Chart==='undefined'){ _rptRoot.innerHTML='<div style="padding:50px;text-align:center;color:var(--text3);"><i class="ti ti-loader"></i> 차트 라이브러리 로딩 중… 잠시 후 다시 시도하세요</div>'; setTimeout(renderReport,800); return; }
  window._rptScope=window._rptScope||{level:'',mgroup:'',model:'',version:''};
  window._rptTreeOpen=window._rptTreeOpen||new Set();
  // 좌측 Test Cycle 폴더 트리 + 우측 통계 영역(#rpt-main) 2단 레이아웃. 통계 렌더는 우측(body)에만 들어간다.
  _rptRoot.innerHTML='<div style="display:flex;align-items:stretch;gap:0;height:100%;min-height:0;">'
    +'<div id="rpt-scope-tree-col" style="flex:0 0 340px;min-width:280px;border:1px solid var(--border);border-radius:10px;background:#fff;overflow-y:auto;padding:8px 6px;margin-right:14px;box-sizing:border-box;">'
      +'<div style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;padding:4px 6px 8px;color:var(--text2);"><i class="ti ti-binary-tree-2" style="color:#2d6fd4;"></i> Cycle Tree</div>'
      +'<div id="rpt-scope-tree">'+_rptScopeTreeHtml()+'</div>'
    +'</div>'
    +'<div id="rpt-main" style="flex:1;min-width:0;overflow-y:auto;"></div>'
  +'</div>';
  try{ _rptEnsureFab(); }catch(e){}   // Test Report 전용 AI 질문 fab (청록)
  const body=document.getElementById('rpt-main'); if(!body) return;   // 이하 모든 통계 렌더는 우측(#rpt-main)에 들어간다
  const F=window._rptF=window._rptF||{cycle:'',severity:'',verdict:'',req:''};
  const all=_rptCollect();
  const cycles=[...new Set(all.map(x=>x._cycleId))].map(id=>{ const c=cycleList.find(y=>y.id===id); return {v:id,l:c?((c.model||'-')+(c.version_group?(' / '+c.version_group):'')+(c.version?(' / '+c.version):'')):id}; });
  const reqs=[...new Set(all.map(x=>x.req_id).filter(Boolean))].map(r=>{ const rq=reqList.find(x=>x.id===r); return {v:r,l:rq?(rq.reqid?(rq.reqid+(rq.title?(' · '+rq.title):'')):(rq.title||r)):r}; });
  const items=_rptFiltered();
  const stats=cycleCalcStats(items);
  const sel=(id,label,opts)=>'<div style="display:flex;flex-direction:column;gap:3px;"><span style="font-size:10px;color:var(--text3);font-weight:600;">'+label+'</span><select onchange="_rptSet(\''+id+'\',this.value)" style="font-size:12px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;min-width:130px;outline:none;"><option value="">전체</option>'+opts.map(o=>'<option value="'+o.v+'"'+(F[id]===o.v?' selected':'')+'>'+o.l+'</option>').join('')+'</select></div>';
  window._rptReqSel=window._rptReqSel||new Set();
  const _reqBtn='<div style="display:flex;flex-direction:column;gap:3px;"><span style="font-size:10px;color:var(--text3);font-weight:600;">REQ</span>'
    +'<button onclick="_rptReqPopupOpen()" title="REQ 폴더에서 선택 → 해당 REQ만 표시" style="font-size:12px;font-weight:700;padding:6px 12px;border-radius:6px;border:1px solid '+(window._rptReqSel.size?'#7c3aed':'var(--border)')+';background:'+(window._rptReqSel.size?'#7c3aed':'#fff')+';color:'+(window._rptReqSel.size?'#fff':'var(--text2)')+';cursor:pointer;min-width:130px;display:inline-flex;align-items:center;gap:6px;"><i class="ti ti-folders" style="font-size:13px;"></i> REQ 선택'+(window._rptReqSel.size?(' ('+window._rptReqSel.size+')'):'')+'</button></div>';
  const filterBar='<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;padding:12px 14px;background:#fff;border:1px solid var(--border);border-radius:10px;margin-bottom:14px;">'
    +'<i class="ti ti-filter" style="font-size:17px;color:var(--blue);align-self:center;margin-bottom:5px;"></i>'
    +_rptCfCells(function(f){return (f.label||'').indexOf('심각도')>=0;})+_reqBtn
    +sel('verdict','결과',[{v:'pass',l:'합격'},{v:'fail',l:'불합격'},{v:'pending',l:'예정'},{v:'exclude',l:'제외'}])+_rptCfCells(function(f){return (f.label||'').indexOf('심각도')<0;})
    +'<div style="flex:1;"></div>'
    +'<button onclick="_rptOpenReport()" title="PDF 보고서" style="font-size:11.5px;font-weight:700;padding:6px 14px;border-radius:6px;border:1px solid #2d6fd4;background:#fff;color:#2d6fd4;cursor:pointer;align-self:center;margin-bottom:2px;"><i class="ti ti-report"></i> 보고서</button>'
    +'<button onclick="window._rptF={cycle:\'\',severity:\'\',verdict:\'\',req:\'\'};window._rptReqSel=new Set();reportCfFilter={req:{},tc:{}};renderReport()" style="font-size:11px;padding:6px 12px;border-radius:6px;border:1px solid var(--border);background:#fff;color:var(--text3);cursor:pointer;align-self:center;margin-bottom:2px;">필터 초기화</button>'
    +'<span style="font-size:12px;color:var(--text3);font-weight:600;align-self:center;margin-bottom:6px;">대상 '+items.length+'건</span>'
  +'</div>';
  const kpi=(label,val,color)=>'<div style="flex:1;min-width:108px;background:#fff;border:1px solid var(--border);border-radius:10px;padding:12px 14px;"><div style="font-size:11px;color:var(--text3);font-weight:600;margin-bottom:5px;">'+label+'</div><div style="font-size:25px;font-weight:800;color:'+color+';">'+val+'</div></div>';
  const kpiRow='<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px;">'
    +kpi('전체 TC',stats.total,'var(--text)')+kpi('합격',stats.pass,'#00a872')+kpi('불합격',stats.fail,'#e53e5a')
    +kpi('예정',stats.pending,'#9aa0b8')+kpi('제외',stats.exclude,'#c9923e')+kpi('진행률',stats.progress+'%','var(--blue)')
  +'</div>';
  const cardC=function(title,cid,h,gc){ return '<div style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:14px;'+(gc||'')+'"><div style="font-size:12.5px;font-weight:700;margin-bottom:10px;">'+title+'</div><div style="height:'+(h||220)+'px;position:relative;"><canvas id="'+cid+'"></canvas></div></div>'; };
  const _LAY=window._rptLayout||'1';
  const _layTip={'1':'요약→비교→추이→디테일','2':'요약띠+추이+그리드','3':'좌 요약패널+우 차트'};
  const laySw='<div style="display:inline-flex;gap:2px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:2px;margin:0 0 14px 10px;vertical-align:top;">'+['1','2','3'].map(function(n){ return '<button onclick="window._rptLayout=\''+n+'\';renderReport()" title="'+_layTip[n]+'" style="font-size:11px;font-weight:'+(_LAY===n?'700':'500')+';padding:5px 12px;border:none;border-radius:6px;background:'+(_LAY===n?'#fff':'transparent')+';color:'+(_LAY===n?'var(--blue)':'var(--text3)')+';cursor:pointer;">레이아웃 '+n+'</button>'; }).join('')+'</div>';
  const _D=['🍩 진행률 (합격/불합격/예정/제외)','rptDonut'],_S=['📊 심각도별 합·불','rptSev'],_R=['📚 REQ별 커버리지','rptReq'],_M=['📊 모델·버전별 합격률','rptModel'],_T=['📈 시간대별 진행 추이','rptTime'],_F=['🐞 불합격(결함) 분포','rptDefect'];
  let grid;
  if(_LAY==='2'){
    grid='<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">'+cardC(_T[0],_T[1],200,'grid-column:1/-1;')+cardC(_D[0],_D[1],220)+cardC(_S[0],_S[1],220)+cardC(_M[0],_M[1],220)+cardC(_R[0],_R[1],220)+cardC(_F[0],_F[1],220,'grid-column:1/-1;')+'</div>';
  } else if(_LAY==='3'){
    grid='<div style="display:flex;gap:14px;align-items:flex-start;"><div style="flex:0 0 232px;">'+cardC(_D[0],_D[1],300)+'</div><div style="flex:1;min-width:0;display:grid;grid-template-columns:1fr 1fr;gap:14px;">'+cardC(_T[0],_T[1],185,'grid-column:1/-1;')+cardC(_S[0],_S[1],215)+cardC(_M[0],_M[1],215)+cardC(_R[0],_R[1],235,'grid-column:1/-1;')+cardC(_F[0],_F[1],220,'grid-column:1/-1;')+'</div></div>';
  } else {
    grid='<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:14px;">'+cardC(_D[0],_D[1],205,'grid-column:span 2;')+cardC(_T[0],_T[1],205,'grid-column:span 4;')+cardC(_S[0],_S[1],230,'grid-column:span 3;')+cardC(_M[0],_M[1],230,'grid-column:span 3;')+cardC(_R[0],_R[1],260,'grid-column:1/-1;')+cardC(_F[0],_F[1],240,'grid-column:1/-1;')+'</div>';
  }
  const _vt=_rptViewToggle();
  const _rptEmpty='<div style="padding:50px;text-align:center;color:var(--text3);"><i class="ti ti-chart-bar" style="font-size:40px;opacity:0.25;display:block;margin-bottom:12px;"></i>사이클 실행 데이터가 없습니다. Test Cycle에서 TC를 실행하면 집계됩니다.</div>';
  if((window._rptView||'table')==='table'){ body.innerHTML=filterBar+_vt+kpiRow+(items.length?_rptTableHtml(items):_rptEmpty); return; }
  if(window._rptView==='analysis'){ const _dr=items.filter(_rptDrillPass); body.innerHTML=filterBar+_vt+kpiRow+(items.length?_rptAnaHtml(items,_dr):_rptEmpty); if(items.length) _rptDrawAna(items); return; }
  if(window._rptView==='explore'){
    const _de=items.filter(_rptDrillPass);
    // AI 질문(전용 fab) 결과 카드 — 탐색 그래프·결과 아래에 표시, 미해석 시 LLM 파서 호출
    let _aiHtml='', _aiR=null, _aiLLM=false;
    if(window._rptQ){
      _aiR=(window._rptQSpec&&window._rptQSpec._for===window._rptQ)?_rptApplySpec(window._rptQSpec, items):null;
      _aiLLM=(!_aiR&&!window._rptQLoading&&!window._rptQLLMInflight&&window._rptQTried!==window._rptQ);
      if(_aiLLM) window._rptQLoading=true;
      _aiHtml=_rptFabResultHtml(window._rptQ,_aiR);
    }
    body.innerHTML=filterBar+_vt+kpiRow+(items.length?(_rptExploreHtml(items,_de)+_aiHtml):_rptEmpty);
    if(items.length){ _rptDrawAna(items); _rptDrawVer(items); if(_aiR&&!_aiR.empty) setTimeout(function(){ _rptDrawQ(_aiR); },0); }
    if(_aiLLM) _rptAiqLLM(window._rptQ);
    return; }
  if(window._rptView==='aiq'){ const _q=window._rptQ||''; var _hf=false,_ss=0,_se=0,_lv=null; try{ var _ae=document.activeElement; if(_ae&&_ae.id==='rptQInput'){ _hf=true; _ss=_ae.selectionStart; _se=_ae.selectionEnd; _lv=_ae.value; } }catch(_fe){} let _r=(_q&&window._rptQSpec&&window._rptQSpec._for===_q)?_rptApplySpec(window._rptQSpec, items):null; const _willLLM=(_q&&!_r&&!window._rptQLoading&&!window._rptQLLMInflight&&window._rptQTried!==_q); if(_willLLM) window._rptQLoading=true; body.innerHTML=filterBar+_vt+kpiRow+_rptAiqHtml(_q,_r); if(_hf){ try{ var _ni=document.getElementById('rptQInput'); if(_ni){ if(_lv!=null)_ni.value=_lv; _ni.focus(); _ni.setSelectionRange(_ss,_se); } }catch(_re2){} } if(_r&&!_r.empty) setTimeout(function(){ _rptDrawQ(_r); },0); if(_willLLM) _rptAiqLLM(_q); return; }
  body.innerHTML=filterBar+_vt+laySw+kpiRow+grid;
  if(!items.length){ body.innerHTML=filterBar+_vt+_rptEmpty; return; }
  _rptDraw(items);
}

// ══ Test Report 분석 엔진 (질문 → 순위집계 / 값필터 → 결과/그래프) — 챗 어시스턴트 + '질의' 뷰 공용 ══
function _rptDimKey(it, dim){
  if(dim==='req'){ const rq=(typeof reqList!=='undefined'?reqList:[]).find(function(x){return x.id===it.req_id;}); return (rq&&rq.reqid)||it.req_id||'(REQ 없음)'; }
  if(dim==='sev') return (typeof _rptSevVal==='function'?_rptSevVal(it):it.severity)||'미지정';
  if(dim==='cycle') return it._cycle||it._cycleId||'-';
  return it._grp||'-';
}

function _rptNorm(s){ return String(s==null?'':s).toLowerCase().replace(/\s+/g,''); }
// 값 매칭: 라틴 값(High/Low/Pass/Fail…)은 단어 경계로 (flow→Low 같은 부분일치 방지), 한글 값은 공백무시 부분일치

// 값 매칭: 라틴 값(High/Low/Pass/Fail…)은 단어 경계로 (flow→Low 같은 부분일치 방지), 한글 값은 공백무시 부분일치
function _rptValHit(msgLower, msgNorm, value){
  const v=String(value==null?'':value).trim(); if(v.replace(/\s+/g,'').length<2) return false;
  if(/^[\x00-\x7F]+$/.test(v.replace(/\s+/g,''))){
    const esc=v.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s*');
    try{ return new RegExp('(^|[^a-z0-9])'+esc+'($|[^a-z0-9])','i').test(msgLower); }catch(e){ return msgNorm.indexOf(_rptNorm(v))>=0; }
  }
  return msgNorm.indexOf(_rptNorm(v))>=0;
}

function _rptFilterFields(){
  const out=[]; const byLabel={};
  ['tc','req'].forEach(function(cat){ (((typeof customFields!=='undefined'&&customFields)?customFields[cat]:null)||[]).forEach(function(f){ if(f.active!==false && (f.type==='Select'||f.type==='MultiSelect')){ const lab=(f.label||'').trim(); if(!lab) return; const vals=(f.options||[]).map(function(o){ return (typeof cfOptValue==='function'?cfOptValue(o):(typeof o==='string'?o:(o&&o.value)))||''; }).filter(Boolean); if(byLabel[lab]){ byLabel[lab].ids.push(f.id); vals.forEach(function(v){ if(byLabel[lab].values.indexOf(v)<0) byLabel[lab].values.push(v); }); } else { const en={label:lab,id:f.id,ids:[f.id],values:vals}; byLabel[lab]=en; out.push(en); } } }); });
  const rs=(typeof resultStatuses==='function')?(resultStatuses()||[]):[];
  const rvals=rs.map(function(s){return s.value;}).filter(Boolean);
  out.push({label:'결과',id:'__verdict',ids:['__verdict'],values:rvals.length?rvals:['Pass','Fail','예정','제외'],verdict:true});
  return out;
}

function _rptFieldVal(it, fieldLabel){
  if(/^결과$/.test(fieldLabel)) return (typeof _rptVerdict==='function')?_rptVerdict(it):'';
  const f=_rptFilterFields().find(function(x){return x.label===fieldLabel;}); if(!f||f.id==='__verdict') return '';
  const tc=(typeof _rptCfMaster==='function')?_rptCfMaster(it):null, rq=(typeof _rptCfMasterReq==='function')?_rptCfMasterReq(it):null;
  const ids=f.ids||[f.id]; let v='';
  for(var i=0;i<ids.length && !v;i++){ v=(tc&&tc.custom_fields&&tc.custom_fields[ids[i]])||(rq&&rq.custom_fields&&rq.custom_fields[ids[i]])||''; }
  if(Array.isArray(v)) v=v.join(',');
  return v;
}

function _rptWordVerdict(v){ v=String(v==null?'':v).toLowerCase();
  if(/pass|합격|통과/.test(v)) return 'pass';
  if(/fail|불합격|실패/.test(v)) return 'fail';
  if(/예정|미실행|pending/.test(v)) return 'pending';
  if(/제외|미구현|미지원|exclude|blocked|wip/.test(v)) return 'exclude';
  return null;
}

function _rptMatchItem(it, fl){
  if(fl.field==='결과'){
    let want=fl.verdict;
    if(!want){ const m=(typeof resultMeta==='function')?resultMeta(fl.value):null; want=m?m.verdict:_rptWordVerdict(fl.value); }
    return ((typeof _rptVerdict==='function')?_rptVerdict(it):'')===want;
  }
  const v=_rptFieldVal(it, fl.field);
  if(v===fl.value) return true;
  return String(v).split(',').map(function(s){return s.trim();}).indexOf(fl.value)>=0;
}

function _rptApplyFilter(filters, base){
  const items=base||((typeof _rptCollect==='function')?(_rptCollect()||[]):[]);
  const filtered=items.filter(function(it){ return filters.every(function(fl){ return _rptMatchItem(it,fl); }); });
  const bd={pass:0,fail:0,pending:0,exclude:0};
  filtered.forEach(function(it){ const verd=(typeof _rptVerdict==='function')?_rptVerdict(it):'pending'; if(bd[verd]!=null) bd[verd]++; });
  return {mode:'filter',filters:filters,items:filtered,breakdown:bd};
}
// 질문으로 만든 필터를 상단 필터 바(window._rptF.verdict + reportCfFilter)에 반영 — 다른 뷰/표에도 동일 적용

// 질문으로 만든 필터를 상단 필터 바(window._rptF.verdict + reportCfFilter)에 반영 — 다른 뷰/표에도 동일 적용
function _rptSyncTopFilter(filters){
  if(typeof reportCfFilter==='undefined' || !reportCfFilter) return;
  reportCfFilter.req={}; reportCfFilter.tc={};
  window._rptF=window._rptF||{cycle:'',severity:'',verdict:'',req:''};
  window._rptF.verdict='';
  (filters||[]).forEach(function(fl){
    if(fl.field==='결과'){ window._rptF.verdict=fl.verdict||(typeof _rptWordVerdict==='function'?_rptWordVerdict(fl.value):'')||''; return; }
    if(['상태','고객사'].indexOf(String(fl.field).trim())>=0) return; // 상단 바에 표시되지 않는 필드는 동기화 제외(보이지 않는 유령 필터 방지)
    // 같은 라벨이 tc·req 양쪽에 있어도 한 곳에만 기록(_rptCfPass의 AND 의미로 과도하게 좁혀지는 것 방지)
    var done=false;
    ['tc','req'].forEach(function(target){ if(done) return; (((typeof customFields!=='undefined'&&customFields)?customFields[target]:null)||[]).forEach(function(f){ if(!done && (f.label||'').trim()===fl.field && (f.type==='Select'||f.type==='MultiSelect')){ reportCfFilter[target][f.id]=fl.value; done=true; } }); });
  });
}

function _rptRuleFilter(msg){
  const msgLower=String(msg==null?'':msg).toLowerCase();
  const nm=_rptNorm(msg);
  const flds=_rptFilterFields();
  const byField={};
  flds.forEach(function(f){
    const vals=f.values.slice().sort(function(a,b){return _rptNorm(b).length-_rptNorm(a).length;});
    for(var i=0;i<vals.length;i++){ if(_rptValHit(msgLower,nm,vals[i])){ const entry={field:f.label,value:vals[i]}; if(f.verdict) entry.verdict=(typeof resultVerdict==='function')?resultVerdict(vals[i]):undefined; byField[f.label]=entry; break; } }
  });
  if(!byField['결과']){
    const aliases=[['불합격','fail'],['실패','fail'],['합격','pass'],['통과','pass'],['미실행','pending'],['예정','pending'],['제외','exclude'],['미구현','exclude'],['미지원','exclude']];
    for(var k=0;k<aliases.length;k++){ if(nm.indexOf(_rptNorm(aliases[k][0]))>=0){ byField['결과']={field:'결과',value:aliases[k][0],verdict:aliases[k][1]}; break; } }
  }
  const filters=Object.keys(byField).map(function(k){return byField[k];});
  if(!filters.length) return null;
  return _rptApplyFilter(filters);
}

function _rptCompute(dim, metric, ascN, base){
  const dimLabel={grp:'장비·버전',req:'REQ',sev:'심각도',cycle:'사이클'}[dim]||'장비·버전';
  const metricLabel={fail:'불합격',total:'시험',pass:'합격',passRate:'합격률',pending:'예정'}[metric]||'불합격';
  const items=base||((typeof _rptCollect==='function')?(_rptCollect()||[]):[]);
  if(!items.length) return {empty:true};
  const g={};
  items.forEach(function(it){ const k=_rptDimKey(it,dim); const v=(typeof _rptVerdict==='function')?_rptVerdict(it):'pending'; g[k]=g[k]||{total:0,fail:0,pass:0,pending:0,exclude:0}; g[k].total++; if(g[k][v]!=null) g[k][v]++; });
  let rows=Object.keys(g).map(function(k){ const s=g[k]; const dn=s.pass+s.fail; return {k:k,total:s.total,fail:s.fail,pass:s.pass,pending:s.pending,passRate:dn?Math.round(s.pass/dn*100):0}; });
  rows=rows.filter(function(r){ return r.total>0; });
  const v2=function(r){ return metric==='passRate'?r.passRate:(r[metric]||0); };
  rows.sort(function(a,b){ return ascN?(v2(a)-v2(b)):(v2(b)-v2(a)); });
  const top=rows.slice(0,8);
  if(!top.length) return {empty:true};
  return {mode:'rank',dim:dim,metric:metric,dimLabel:dimLabel,metricLabel:metricLabel,ascN:ascN,top:top,unit:(metric==='passRate'?'%':'건')};
}

function _rptAnalyze(msg){
  const m=String(msg||'');
  const hasRank=/가장|제일|최다|최소|순위|랭킹|\btop\b|best|worst/i.test(m);
  if(hasRank){
    let dim='grp'; if(/REQ|요구사항/i.test(m)) dim='req'; else if(/심각도/.test(m)) dim='sev'; else if(/사이클/.test(m)) dim='cycle';
    let metric='fail';
    if(/합격률|통과율|pass\s*rate/i.test(m)) metric='passRate';
    else if(/fail|불합격|실패|결함/i.test(m)) metric='fail';
    else if(/시험|테스트|실행|수행/i.test(m)) metric='total';
    else if(/합격|통과|pass/i.test(m)) metric='pass';
    else if(/미실행|예정/.test(m)) metric='pending';
    const ascN=/낮은|최소|적게|적은|worst/i.test(m);
    return _rptCompute(dim, metric, ascN);
  }
  const fr=_rptRuleFilter(m); if(fr) return fr;
  return null;
}

function _rptApplySpec(spec, base){
  if(!spec) return null;
  if(spec.mode==='filter' && spec.filters && spec.filters.length){ return _rptApplyFilter(spec.filters, base); }
  return _rptCompute(spec.dim||'grp', spec.metric||'fail', spec.direction==='asc', base);
}

// ── 로컬 LLM(제마) 호출 헬퍼: llms 목록에서 gemma('Test WorkFlow') 선택 → /api/chat/local ──
async function _rptGemma(){
  if(window._rptGemmaLLM!==undefined) return window._rptGemmaLLM;
  var list=(typeof llmList!=='undefined'&&Array.isArray(llmList)&&llmList.length)?llmList:null;
  if(!list){ try{ var d=await (await fetch('/api/llms')).json(); list=(d&&(d.llms||d))||[]; }catch(e){ list=[]; } }
  var pick=list.find(function(l){ return String((l&&l.name)||'')==='Test WorkFlow'; })
    ||list.find(function(l){ return /gemma/i.test(String((l&&l.model)||'')+' '+String((l&&l.name)||'')); })
    ||list.find(function(l){ return l&&l.endpoint; })||null;
  window._rptGemmaLLM=pick; return pick;
}
// llm_id로 특정 LLM 선택 (없으면 제마 폴백) — 페이지 AI 설정용
async function _rptLLMById(llmId){
  if(!llmId) return await _rptGemma();
  var list=(typeof llmList!=='undefined'&&Array.isArray(llmList)&&llmList.length)?llmList:null;
  if(!list){ try{ var d=await (await fetch('/api/llms')).json(); list=(d&&(d.llms||d))||[]; }catch(e){ list=[]; } }
  var pick=(list||[]).find(function(l){ return String((l&&(l.id||l.name))||'')===String(llmId); });
  return pick||await _rptGemma();
}
// opt: {llmId, system} — 페이지별 LLM/시스템프롬프트 오버라이드
async function _rptLLMChat(userMsg, maxTok, temp, opt){
  opt=opt||{};
  var llm=opt.llmId?(await _rptLLMById(opt.llmId)):(await _rptGemma()); if(!llm||!llm.endpoint) return '';
  var msgs=[]; if(opt.system) msgs.push({role:'system',content:String(opt.system)}); msgs.push({role:'user',content:String(userMsg||'')});
  var payload={endpoint:llm.endpoint, model:llm.model, messages:msgs, max_tokens:maxTok||1400, context_size:llm.context_size||262144, temperature:(temp==null?0.2:temp), apikey:llm.apikey||''};
  try{ var r=await fetch('/api/chat/local',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); var d=await r.json(); return String((d&&d.reply)||'').trim(); }catch(e){ return ''; }
}
// 페이지 AI 설정(캐시, 60초 TTL) 로드 — {tests|cycle|report:{llm_id,prompt}}
async function _pgAiCfgGet(){
  var now=(new Date()).getTime();
  if(window._pageAiCfg && window._pageAiCfgTs && (now-window._pageAiCfgTs)<60000) return window._pageAiCfg;
  try{ var d=await (await fetch('/api/page-ai')).json(); window._pageAiCfg=(d&&typeof d==='object')?d:{}; window._pageAiCfgTs=now; }catch(e){ if(!window._pageAiCfg)window._pageAiCfg={}; }
  return window._pageAiCfg;
}
async function _rptAiqLLM(q){
  if(window._rptQLLMInflight) return;
  window._rptQLLMInflight=true; window._rptQTried=q; window._rptQLoading=true;
  let spec=null;
  var _pai={}; try{ var _pc=(typeof _pgAiCfgGet==='function')?await _pgAiCfgGet():{}; _pai=(_pc&&_pc.report)||{}; }catch(e){}   // Reports AI에 지정한 LLM으로 그래프 파싱
  try{
    const flds=_rptFilterFields();
    const fldDesc=flds.map(function(f){ return '  · '+f.label+': '+(f.values.join(', ')||'(값없음)'); }).join('\n');
    const rvals=(flds.find(function(x){return x.label==='결과';})||{values:[]}).values.join('/');
    const prompt='너는 네트워크 장비 시험결과 분석 질문 파서다. 질문을 판단해서 어떤 그래프를 그릴지 JSON만 출력해라(설명·코드펜스 없이).\n[필터 가능 필드와 실제 값들]\n'+fldDesc+'\n[순위 분석] dim: grp(장비/모델/버전), req(REQ), sev(심각도), cycle(사이클) / metric: fail(불합격), total(시험횟수), pass(합격), passRate(합격률), pending(예정) / direction: desc, asc\n[차트 종류] chart: barh(가로막대), barv(세로막대), doughnut(도넛), pie(파이), line(선)\n규칙:\n1) 특정 값으로 거르기(예: "Critical 시험","자체항목","우선순위 높은")면 {"mode":"filter","filters":[{"field":"<위 필드명>","value":"<반드시 위 목록의 실제 값 중 하나>"}],"chart":"doughnut","title":"<한 줄 해석>"}. 형용사는 가까운 실제 값으로 매핑(심각도 높은→Blocker·Critical, 낮은→Minor·Cosmetic / 우선순위 높은→Very High·High, 낮은→Low). 결과 value는 '+rvals+' 중 하나.\n2) 순위/최다/최소면 {"mode":"rank","dim":"...","metric":"...","direction":"...","chart":"barh","title":"<한 줄 해석>"}.\nchart는 질문 의도에 맞게 선택(분포·비율→doughnut/pie, 순위·비교→barh/barv, 추세→line). title은 무엇을 어떻게 보여주는지 한국어 한 줄.\n질문: "'+String(q||'')+'"';
    const reply=String((await _rptLLMChat(prompt, 900, 0.1, {llmId:_pai.llm_id||''}))||'');   // Reports AI 지정 LLM(없으면 제마 폴백)으로 질문 파싱
    const mt=reply.match(/\{[\s\S]*\}/);
    if(mt){ const j=JSON.parse(mt[0]); const chart=(['barh','barv','doughnut','pie','line'].indexOf(j.chart)>=0)?j.chart:null; const title=(typeof j.title==='string')?j.title.slice(0,120):'';
      if(j.mode==='filter' && j.filters && j.filters.length){
        const filters=j.filters.filter(function(x){return x&&x.field&&x.value;}).map(function(x){ const o={field:x.field,value:x.value}; if(x.field==='결과'){ const mm=(typeof resultMeta==='function')?resultMeta(x.value):null; o.verdict=mm?mm.verdict:_rptWordVerdict(x.value); } return o; });
        if(filters.length) spec={mode:'filter',filters:filters,chart:chart,title:title};
      }
      if(!spec && (j.mode==='rank'||j.dim||j.metric)){ const dim=(['grp','req','sev','cycle'].indexOf(j.dim)>=0)?j.dim:'grp'; const metric=(['fail','total','pass','passRate','pending'].indexOf(j.metric)>=0)?j.metric:'fail'; spec={mode:'rank',dim:dim,metric:metric,direction:(String(j.direction)==='asc'?'asc':'desc'),chart:chart,title:title}; }
    }
  }catch(e){}
  if(!spec){ try{ const rr=_rptAnalyze(q); if(rr && !rr.empty){ spec=(rr.mode==='filter')?{mode:'filter',filters:rr.filters}:{mode:'rank',dim:rr.dim,metric:rr.metric,direction:rr.ascN?'asc':'desc'}; spec._fallback=true; } }catch(e){} }
  if(spec){ spec._for=q; window._rptQSpec=spec; if(spec.chart && !window._rptQChartType) window._rptQChartType=spec.chart; if(spec.mode==='filter' && typeof _rptSyncTopFilter==='function') _rptSyncTopFilter(spec.filters); }
  window._rptQLoading=false; window._rptQLLMInflight=false;
  if(typeof renderReport==='function') renderReport();   // 해석 완료 → 탐색 뷰의 AI 질문 카드 갱신
}

function _rptAnaVal(r,metric){ return metric==='passRate'?r.passRate:(r[metric]||0); }

function _rptAnaResultHtml(res, cid){
  const e=function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;'); };
  const top=res.top, metric=res.metric, unit=res.unit, best=top[0];
  const ans='<b>'+res.dimLabel+'</b> 중 '+(res.ascN?'가장 적은':'가장 많은')+' <b>'+res.metricLabel+'</b> → <b style="color:'+(metric==='fail'?'#e53e5a':(metric==='passRate'?'#00a872':'#2d6fd4'))+';">'+e(best.k)+'</b> ('+res.metricLabel+' '+_rptAnaVal(best,metric)+unit+(metric!=='total'&&metric!=='passRate'?' / 전체 '+best.total+'건':'')+')';
  const list=top.map(function(r,i){ return '<div style="display:flex;align-items:center;gap:8px;font-size:11.5px;padding:3px 0;border-bottom:1px solid var(--border);"><span style="width:14px;color:var(--text3);">'+(i+1)+'</span><span style="flex:1;font-weight:'+(i===0?'700':'500')+';color:var(--text);">'+e(r.k)+'</span><span style="color:'+(metric==='fail'?'#e53e5a':'var(--text2)')+';font-weight:700;white-space:nowrap;">'+_rptAnaVal(r,metric)+unit+'</span></div>'; }).join('');
  return ans+'<div style="margin-top:7px;">'+list+'</div><div style="height:'+(24+top.length*24)+'px;margin-top:9px;position:relative;"><canvas id="'+cid+'"></canvas></div>';
}

function _rptDrawAnaResult(res, cid){
  if(typeof Chart==='undefined') return; const cv=document.getElementById(cid); if(!cv) return;
  try{ const ex=Chart.getChart?Chart.getChart(cv):null; if(ex) ex.destroy(); }catch(e){}
  const metric=res.metric, top=res.top, unit=res.unit;
  const color=metric==='fail'?'#e53e5a':((metric==='passRate'||metric==='pass')?'#00a872':'#2d6fd4');
  try{ new Chart(cv.getContext('2d'),{type:'bar',data:{labels:top.map(function(r){return r.k;}),datasets:[{label:res.metricLabel+(unit==='%'?'(%)':'(건)'),data:top.map(function(r){return _rptAnaVal(r,metric);}),backgroundColor:color}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,max:metric==='passRate'?100:undefined}}}}); }catch(e){}
}

function _rptDrawBreakdownChart(cid, bd){
  if(typeof Chart==='undefined') return; const cv=document.getElementById(cid); if(!cv) return;
  try{ const ex=Chart.getChart?Chart.getChart(cv):null; if(ex) ex.destroy(); }catch(e){}
  try{ new Chart(cv.getContext('2d'),{type:'doughnut',data:{labels:['합격','불합격','예정','제외'],datasets:[{data:[bd.pass,bd.fail,bd.pending,bd.exclude],backgroundColor:['#00a872','#e53e5a','#c4c9d4','#c9923e'],borderColor:'#fff',borderWidth:1}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{font:{size:10},boxWidth:12,padding:8}}}}}); }catch(e){}
}

function _rptDrawQ(r){
  if(typeof Chart==='undefined') return; const cv=document.getElementById('rptQChart'); if(!cv) return;
  try{ const ex=Chart.getChart?Chart.getChart(cv):null; if(ex) ex.destroy(); }catch(e){}
  const isFilter=(r.mode==='filter');
  const type=window._rptQChartType||(isFilter?'doughnut':'barh');
  let labels, data, bg, click;
  if(isFilter){
    labels=['합격','불합격','예정','제외']; data=[r.breakdown.pass,r.breakdown.fail,r.breakdown.pending,r.breakdown.exclude];
    const vc=['#00a872','#e53e5a','#c4c9d4','#c9923e'];
    bg=(type==='line'?'#2d6fd4':vc); click=null;
  } else {
    const metric=r.metric, base=metric==='fail'?'#e53e5a':((metric==='passRate'||metric==='pass')?'#00a872':'#2d6fd4');
    const sel=window._rptQDrill||r.top[0].k;
    labels=r.top.map(function(t){return t.k;}); data=r.top.map(function(t){return _rptAnaVal(t,metric);});
    bg=r.top.map(function(t){ return t.k===sel?base:base+'59'; });
    click=function(evt,els){ if(els&&els.length){ window._rptQDrill=r.top[els[0].index].k; renderReport(); } };
  }
  const lbl=isFilter?'건수':(r.metricLabel+(r.unit==='%'?'(%)':'(건)'));
  const maxX=(!isFilter&&r.metric==='passRate')?100:undefined;
  let cfg;
  if(type==='doughnut'||type==='pie'){
    const palette=['#2d6fd4','#e53e5a','#00a872','#e8820c','#9d7bff','#15aabf','#fab005','#7048e8'];
    cfg={type:type,data:{labels:labels,datasets:[{data:data,backgroundColor:isFilter?bg:labels.map(function(l,i){return palette[i%palette.length];}),borderColor:'#fff',borderWidth:1}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{font:{size:10},boxWidth:12}}},onClick:click||undefined}};
  } else if(type==='line'){
    cfg={type:'line',data:{labels:labels,datasets:[{label:lbl,data:data,borderColor:isFilter?'#2d6fd4':(Array.isArray(bg)?bg[0]:bg),backgroundColor:'rgba(45,111,212,0.15)',fill:true,tension:0.3,pointRadius:5}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,max:maxX}},onClick:click||undefined}};
  } else {
    const horiz=(type!=='barv');
    cfg={type:'bar',data:{labels:labels,datasets:[{label:lbl,data:data,backgroundColor:bg}]},options:{indexAxis:horiz?'y':'x',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:(horiz?{x:{beginAtZero:true,max:maxX}}:{y:{beginAtZero:true,max:maxX}}),onClick:click||undefined}};
  }
  try{ new Chart(cv.getContext('2d'),cfg); }catch(e){}
}

function _rptAiqAsk(q){ window._rptQ=String(q||'').trim(); window._rptQDrill=null; window._rptQSpec=null; window._rptQLoading=false; window._rptQLLMInflight=false; window._rptQTried=null; window._rptQChartType=null; window._rptView='aiq'; renderReport(); }

function _rptAiqHtml(q, r){
  const e=function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;'); };
  const eq=String(q||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  const examples=['자체항목 시험 알려줘','Critical 심각도 시험','Fail 난 시험 보여줘','가장 많이 Fail 난 장비·버전은?'];
  const exBtns=examples.map(function(x){ const xe=x.replace(/'/g,"\\'"); return '<button onclick="_rptAiqAsk(\''+xe+'\')" style="font-size:11px;padding:5px 11px;border:1px solid var(--border);border-radius:14px;background:#fff;color:var(--text2);cursor:pointer;">'+x+'</button>'; }).join('');
  const inputBar='<div style="display:flex;gap:8px;margin-bottom:10px;"><input id="rptQInput" value="'+eq+'" placeholder="질문 입력 — 예: 자체항목 시험 / Fail 난 시험 / 가장 많이 Fail 난 장비?" onkeydown="if(event.key===\'Enter\')_rptAiqAsk(this.value)" style="flex:1;font-size:13px;padding:9px 13px;border:1px solid var(--border);border-radius:8px;outline:none;user-select:text;"><button onclick="_rptAiqAsk(document.getElementById(\'rptQInput\').value)" style="font-size:13px;padding:9px 20px;border:none;border-radius:8px;background:linear-gradient(135deg,var(--blue),#9d7bff);color:#fff;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:5px;"><i class="ti ti-sparkles"></i> 분석</button></div>';
  const exBar='<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:14px;"><span style="font-size:11px;color:var(--text3);">예시</span>'+exBtns+'</div>';
  let result;
  if(!q){ result='<div style="padding:46px;text-align:center;color:var(--text3);"><i class="ti ti-message-chatbot" style="font-size:42px;opacity:0.22;display:block;margin-bottom:12px;"></i>질문을 입력하거나 예시를 누르면<br>차트와 결과 표가 나옵니다</div>'; }
  else if(!r){ if(window._rptQLoading){ result='<div style="padding:42px;text-align:center;color:var(--text3);"><i class="ti ti-loader-2 spin" style="font-size:34px;color:var(--blue);display:block;margin-bottom:12px;"></i>AI가 질문을 해석하고 있어요…</div>'; } else { result='<div style="padding:34px;text-align:center;color:var(--text3);"><i class="ti ti-help-circle" style="font-size:34px;opacity:0.25;display:block;margin-bottom:10px;"></i>질문을 이해하지 못했어요.<br><span style="font-size:11.5px;">필터 값을 그대로 넣어 보세요 — 예) "자체항목 시험", "Critical 항목", "Fail 난 시험"</span></div>'; } }
  else if(r.empty){ result='<div style="padding:34px;text-align:center;color:var(--text3);">조건에 맞는 시험 데이터가 없어요.</div>'; }
  else {
    const curType=window._rptQChartType||(r.mode==='filter'?'doughnut':'barh');
    const _spec=window._rptQSpec;
    const aiNote=(_spec&&_spec._for===q&&_spec.title)?('<div style="display:flex;align-items:center;gap:6px;font-size:11.5px;color:#7048e8;background:rgba(112,72,232,0.07);border:1px solid rgba(112,72,232,0.18);border-radius:7px;padding:6px 10px;margin-bottom:10px;"><i class="ti ti-sparkles"></i> <b>AI 해석</b> · '+e(_spec.title)+(_spec._fallback?' <span style="color:var(--text3);font-weight:400;">(LLM 응답 불가 → 규칙 기반)</span>':'')+'</div>'):'';
    const typeSel='<select onchange="window._rptQChartType=this.value;renderReport()" style="font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:5px;background:#fff;color:var(--text2);outline:none;cursor:pointer;">'+['barh:가로 막대','barv:세로 막대','doughnut:도넛','pie:파이','line:선'].map(function(o){ const p=o.split(':'); return '<option value="'+p[0]+'"'+(curType===p[0]?' selected':'')+'>'+p[1]+'</option>'; }).join('')+'</select>';
    let ans, tableItems, chTitle, chHeight;
    if(r.mode==='filter'){
      const fl=r.filters.map(function(x){return e(x.field)+'='+e(x.value);}).join(', ');
      ans='<div style="font-size:13px;margin-bottom:11px;"><b style="color:var(--blue);">'+fl+'</b> 조건 시험 <b>'+r.items.length+'건</b> <span style="font-size:11.5px;color:var(--text3);">· <span style="color:#00a872;">합격 '+r.breakdown.pass+'</span> / <span style="color:#e53e5a;">불합격 '+r.breakdown.fail+'</span>'+(r.breakdown.pending?' / 예정 '+r.breakdown.pending:'')+'</span></div>';
      tableItems=r.items; chTitle='합격/불합격 분포'; chHeight=(curType==='doughnut'||curType==='pie')?260:230;
    } else {
      const best=r.top[0], metric=r.metric, unit=r.unit, sel=window._rptQDrill||r.top[0].k;
      const items=(typeof _rptFiltered==='function')?(_rptFiltered()||[]):((typeof _rptCollect==='function')?(_rptCollect()||[]):[]);
      tableItems=items.filter(function(it){ return _rptDimKey(it,r.dim)===sel; });
      ans='<div style="font-size:13px;margin-bottom:11px;"><b>'+r.dimLabel+'</b> 중 '+(r.ascN?'가장 적은':'가장 많은')+' <b>'+r.metricLabel+'</b> → <b style="color:'+(metric==='fail'?'#e53e5a':(metric==='passRate'?'#00a872':'#2d6fd4'))+';">'+e(best.k)+'</b> ('+r.metricLabel+' '+_rptAnaVal(best,metric)+unit+') <span style="font-size:11px;color:var(--text3);">· 막대를 클릭하면 그 '+r.dimLabel+'의 결과가 표에 나와요 (현재: '+e(sel)+')</span></div>';
      chTitle=e(r.dimLabel)+'별 '+e(r.metricLabel); chHeight=(curType==='doughnut'||curType==='pie')?280:(curType==='line'?260:(44+r.top.length*28));
    }
    result=aiNote+ans+'<div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;">'
      +'<div style="flex:1 1 340px;min-width:280px;background:#fff;border:1px solid var(--border);border-radius:10px;padding:14px;"><div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><span style="font-size:12px;font-weight:700;color:var(--text2);">'+chTitle+'</span><span style="flex:1;"></span>'+typeSel+'</div><div style="height:'+chHeight+'px;position:relative;"><canvas id="rptQChart"></canvas></div></div>'
      +'<div style="flex:2 1 460px;min-width:340px;">'+_rptTableHtml(tableItems)+'</div>'
    +'</div>';
  }
  return inputBar+exBar+result;
}
// 특정 장비/모델/버전 진행 현황 질의 ("U9024A-10G 시험 진행 현황 알려줘")

// ══ Test Report 전용 AI FAB — 기존 전역 ai-fab을 이 페이지에서만 모드 전환(청록·질문 팝업), 벗어나면 원복 ══
function _rptFabApply(on){
  // fab 모드 전환은 공용 디스패처(_fabPageApply, 06-nav-misc)로 위임 — 페이지별 모드 간 저장/복원 충돌 방지
  if(on&&typeof _fabPageApply==='function'){ _fabPageApply('report'); try{ var pn=document.getElementById('ai-fab-panel'); if(pn) pn.style.display='none'; }catch(e){} }
}
// renderReport에서 호출 — Test Report 페이지가 활성일 때만 모드 적용
function _rptEnsureFab(){ var pg=document.getElementById('page-report'); if(pg&&pg.classList.contains('active')) _rptFabApply(true); }
function _rptFabClose(){ var p=document.getElementById('rpt-ai-fab-pop'); if(p)p.remove(); if(typeof _fabShow==='function')_fabShow(true); }
function _rptFabToggle(){
  var p=document.getElementById('rpt-ai-fab-pop'); if(p){ _rptFabClose(); return; }
  p=document.createElement('div'); p.id='rpt-ai-fab-pop';
  var _top=(typeof _fabPopTop==='function')?_fabPopTop():0;
  p.style.cssText='position:fixed;right:0;top:'+_top+'px;bottom:0;width:760px;max-width:95vw;background:#fff;border-left:1px solid #99e0d6;border-top:1px solid var(--border);box-shadow:-10px 0 30px rgba(13,148,136,0.16);z-index:11600;display:flex;flex-direction:column;overflow:hidden;';
  p.innerHTML='<div style="padding:10px 14px;background:linear-gradient(135deg,#0d9488,#2dd4bf);color:#fff;display:flex;align-items:center;gap:8px;flex-shrink:0;">'
      +'<i class="ti ti-message-chatbot" style="font-size:19px;"></i><b style="font-size:17px;">Test Report Assistant</b><span style="font-size:15px;opacity:0.85;">답이 탐색 그래프·결과에 반영</span><span style="flex:1;"></span>'
      +'<i class="ti ti-eraser" onclick="window._rptChatMsgs=[];_rptFabMsgs()" title="대화 비우기" style="font-size:16px;cursor:pointer;opacity:0.9;margin-right:6px;"></i>'
      +'<i class="ti ti-x" onclick="_rptFabClose()" title="닫기" style="font-size:17px;cursor:pointer;opacity:0.9;"></i></div>'
    +'<div id="rpt-fab-msgs" style="flex:1;min-height:0;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:8px;background:#f6faf9;"></div>'
    +'<div style="padding:9px 12px;border-top:1px solid #d5efe9;display:flex;gap:7px;flex-shrink:0;background:#fff;">'
      +'<input id="rpt-fab-q" placeholder="질문 입력 — 예: Fail 난 시험 / 가장 많이 Fail 난 장비? (Enter 전송)" onkeydown="if(event.key===\'Enter\')_rptFabSend(this.value)" style="flex:1;font-size:13.5px;padding:10px 12px;border:1.5px solid var(--border);border-radius:9px;outline:none;">'
      +'<button onclick="_rptFabSend(document.getElementById(\'rpt-fab-q\').value)" title="전송" style="width:40px;border:none;border-radius:9px;background:#0d9488;color:#fff;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;"><i class="ti ti-send"></i></button></div>';
  document.body.appendChild(p);
  if(typeof _fabShow==='function')_fabShow(false);   // 팝업이 열리는 동안 fab 숨김
  _rptFabMsgs();
  // 페이지 AI 설정(입력창 안내문)을 placeholder에 반영
  try{ if(typeof _pgAiCfgGet==='function'){ _pgAiCfgGet().then(function(cf){ var pa=(cf&&cf.report)||{}; var ph=(pa.placeholder||'').trim(); var i=document.getElementById('rpt-fab-q'); if(i&&ph) i.placeholder=ph; }); } }catch(e){}
  setTimeout(function(){ var i=document.getElementById('rpt-fab-q'); if(i)i.focus(); },30);
}
// 채팅 말풍선 렌더 (대화 이력은 window._rptChatMsgs — 세션 메모리)
function _rptFabMsgs(){
  var box=document.getElementById('rpt-fab-msgs'); if(!box) return;
  var e=function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;'); };
  var ms=window._rptChatMsgs=window._rptChatMsgs||[];
  var h='';
  if(!ms.length){
    // 오프닝 멘트·추천 질문: AI Assistant › LLM 설정(Reports AI)에서 입력한 값만 사용 — 하드코딩 기본값 없음(비우면 안 보임)
    var _pa=((window._pageAiCfg||{}).report)||{}; var _gr=(_pa.greeting||'').trim(); var _qk=(_pa.quick||[]).filter(Boolean);
    if(_gr) h+='<div style="font-size:14px;color:var(--text);padding:10px 6px 2px;line-height:1.7;">'+((typeof formatMsg==='function')?formatMsg(_gr):e(_gr).replace(/\n/g,'<br>'))+'</div>';
    if(_qk.length){
      h+='<div style="font-size:12px;color:var(--text3);font-weight:700;padding:8px 6px 0;">추천 질문</div>'
       +_qk.map(function(x){ var xe=x.replace(/'/g,"\\'"); return '<button onclick="_rptFabSend(\''+xe+'\')" style="display:flex;align-items:center;gap:11px;width:100%;box-sizing:border-box;text-align:left;font-size:13.5px;font-weight:600;padding:13px 15px;border:1px solid #c8ebe4;border-radius:11px;background:#fff;color:var(--text);cursor:pointer;" onmouseenter="this.style.background=\'#f0faf8\';this.style.borderColor=\'#0d9488\'" onmouseleave="this.style.background=\'#fff\';this.style.borderColor=\'#c8ebe4\'"><i class="ti ti-message-2-question" style="color:#0d9488;font-size:17px;flex-shrink:0;"></i><span style="flex:1;min-width:0;">'+e(x)+'</span><i class="ti ti-arrow-right" style="color:var(--text3);font-size:16px;flex-shrink:0;"></i></button>'; }).join('');
    }
  }
  ms.forEach(function(m){
    if(m.role==='user') h+='<div style="flex-shrink:0;align-self:flex-end;max-width:85%;background:#0d9488;color:#fff;border-radius:12px 12px 3px 12px;padding:9px 13px;font-size:13.5px;line-height:1.6;white-space:pre-wrap;word-break:break-word;">'+e(m.text)+'</div>';
    else h+='<div class="ai-fab-bubble" style="flex-shrink:0;align-self:flex-start;max-width:98%;background:transparent;border:none;border-radius:0;padding:6px 4px;font-size:13.5px;line-height:1.65;color:var(--text);word-break:break-word;overflow:hidden;">'+(m.html||e(m.text))+'</div>';
  });
  box.innerHTML=h;
  box.scrollTop=box.scrollHeight;
}
// 질문에서 모델그룹/장비명/버전 타겟 추출 — Cycle Tree 데이터와 정규화 비교(공백·-·_ 무시), 긴 토큰·깊은 레벨 우선
function _rptFabTarget(q){
  var norm=function(s){ return String(s==null?'':s).toLowerCase().replace(/[\s\-_./]+/g,''); };
  var nq=norm(q); if(nq.length<3) return null;
  var depth={version:3,model:2,mgroup:1}; var best=null;
  (cycleList||[]).forEach(function(c){
    var mg=(typeof _cycMGroup==='function')?_cycMGroup(c):(c.model||''); var m=c.model||''; var v=c.version||'';
    [{level:'version',mg:mg,m:m,v:v,t:v},{level:'model',mg:mg,m:m,v:'',t:m},{level:'mgroup',mg:mg,m:'',v:'',t:mg}].forEach(function(x){
      var nt=norm(x.t); if(!nt||nt.length<3||nq.indexOf(nt)<0) return;
      var sc=nt.length*10+depth[x.level];
      if(!best||sc>best._sc){ x._sc=sc; best=x; }
    });
  });
  return best;
}
// 타겟 → Cycle Tree 선택 상태 적용 (조상 경로 펼침)
function _rptFabApplyScope(t){
  window._rptScope={level:t.level, mgroup:t.mg||'', model:t.m||'', version:t.v||''};
  var O=window._rptTreeOpen=window._rptTreeOpen||new Set();
  if(t.mg&&t.level!=='mgroup'){ O.add('mg@@'+t.mg); if(t.m&&t.level!=='model') O.add('m@@'+t.mg+'@@'+t.m); }
}
function _rptFabTgtLabel(t){ return t.level==='mgroup'?t.mg:(t.level==='model'?t.m:(t.m+' / '+t.v)); }
// 질문 전송: 채팅에 답 + 탐색 뷰 갱신. 엔티티 언급 시 트리 타겟 선택, 미언급 시 전체 기준으로 초기화
async function _rptFabSend(q){
  q=String(q||'').trim(); if(!q) return;
  var inp=document.getElementById('rpt-fab-q'); if(inp) inp.value='';
  var ms=window._rptChatMsgs=window._rptChatMsgs||[];
  var esc=function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;'); };
  ms.push({role:'user',text:q}); _rptFabMsgs();
  try{ if(typeof loadCycleData==='function') await loadCycleData(); }catch(e){}   // 질문 시점 최신 데이터 재로드 — 다른 사용자 실행·변경 실시간 반영
  // 1) 트리 타겟: 질문에 모델그룹/장비명/버전이 있으면 그 노드 선택, 없으면 전체 기준으로 리셋
  var tgt=null; try{ tgt=_rptFabTarget(q); }catch(e){}
  if(tgt) _rptFabApplyScope(tgt);
  else window._rptScope={level:'',mgroup:'',model:'',version:''};
  window._rptDrill=null; window._rptView='explore';
  var scopeNote=tgt?('<div style="font-size:11px;color:#0f766e;margin-bottom:4px;"><i class="ti ti-binary-tree-2"></i> Cycle Tree 선택: <b>'+esc(_rptFabTgtLabel(tgt))+'</b></div>'):'';
  // 2) 질문 상태 초기화 후 규칙 기반 해석
  window._rptQ=q; window._rptQDrill=null; window._rptQSpec=null; window._rptQLoading=false; window._rptQLLMInflight=false; window._rptQTried=null; window._rptQChartType=null;
  var r=null;
  try{ var rr=_rptAnalyze(q); if(rr&&!rr.empty){ window._rptQSpec=(rr.mode==='filter')?{mode:'filter',filters:rr.filters,_for:q}:{mode:'rank',dim:rr.dim,metric:rr.metric,direction:(rr.ascN?'asc':'desc'),_for:q}; window._rptQTried=q; if(rr.mode==='filter'&&typeof _rptSyncTopFilter==='function')_rptSyncTopFilter(rr.filters); r=_rptApplySpec(window._rptQSpec,(typeof _rptFiltered==='function')?_rptFiltered():null); } }catch(e){}
  if(r){ renderReport(); ms.push({role:'ai',html:scopeNote+_rptFabAnswerHtml(q,r)}); _rptFabMsgs(); return; }
  // 3) 규칙 해석 실패 + 타겟 있음("U9532H 시험 결과는?") → 그 범위 요약으로 답변 (LLM 불필요)
  if(tgt){
    window._rptQ='';
    var sst=null; try{ var cy=_rptScopeCycles(tgt.mg,tgt.m,tgt.v); var all=[]; cy.forEach(function(c){ (c.items||[]).forEach(function(it){ all.push(it); }); }); sst=(typeof cycleCalcStats==='function')?cycleCalcStats(all):null; }catch(e){}
    renderReport();
    ms.push({role:'ai',html:scopeNote+'<b style="color:#0f766e;">'+esc(_rptFabTgtLabel(tgt))+'</b> 기준으로 탐색을 전환했어요.'+(sst?('<br>스텝 '+sst.inScope+' · <span style="color:#00a872;">합격 '+sst.pass+' ('+sst.passRate+'%)</span> / <span style="color:#e53e5a;">불합격 '+sst.fail+'</span>'+(sst.inScope-(sst.pass+sst.fail)>0?(' / 미실행 '+(sst.inScope-(sst.pass+sst.fail))):'')):'')+'<br><span style="font-size:11px;color:var(--text3);">탐색 그래프·결과가 이 범위로 반영됐어요.</span>'});
    _rptFabMsgs(); return;
  }
  // 4) LLM 차트 해석 (전체 기준)
  var _teal={c1:'#0d9488'};
  var _mkLoad=function(p){ return (typeof _fabLoadingHtml==='function')?_fabLoadingHtml(_teal,p):'<i class="ti ti-loader-2 spin" style="color:#0d9488;"></i> 처리 중…'; };
  var _rmLoading=function(){ for(var i=ms.length-1;i>=0;i--){ if(ms[i].loading){ ms.splice(i,1); break; } } };
  var loadMsg={role:'ai',html:_mkLoad('think'),loading:true}; ms.push(loadMsg); _rptFabMsgs();
  try{ await _rptAiqLLM(q); }catch(e){}   // 완료 시 내부에서 renderReport() 호출됨
  r=(window._rptQSpec&&window._rptQSpec._for===q)?_rptApplySpec(window._rptQSpec,(typeof _rptFiltered==='function')?_rptFiltered():null):null;
  if(r){ _rmLoading(); ms.push({role:'ai',html:_rptFabAnswerHtml(q,r)}); _rptFabMsgs(); return; }
  // 5) 차트로 만들 수 없는 자유 질문 → 리포트 데이터를 컨텍스트로 LLM이 스트리밍 답변
  window._rptQ='';
  loadMsg.html=_mkLoad('read'); _rptFabMsgs();
  var pai={}; try{ var _c=await _pgAiCfgGet(); pai=(_c&&_c.report)||{}; }catch(e){}
  var sysP=(pai.prompt&&String(pai.prompt).trim())||'너는 utop Test Report 분석 어시스턴트다. 아래 현재 Report 데이터만 근거로 한국어로 간결하게 답하라. 개수·비율은 제공된 집계 수치를 사용하고 목록을 직접 세지 마라. 데이터에 없으면 없다고 말하라.';
  var _ctx=''; try{ _ctx=(typeof buildReportContext==='function')?buildReportContext(q):_rptFabContext(); }catch(e){ try{ _ctx=_rptFabContext(); }catch(_e){} }
  var prompt='[현재 Report 데이터]\n'+_ctx+'\n\n[질문]\n'+String(q||'');
  loadMsg.html=_mkLoad('write'); _rptFabMsgs();
  var llm=null; try{ llm=pai.llm_id?(await _rptLLMById(pai.llm_id)):(await _rptGemma()); }catch(e){}
  var full='', started=false;
  var render=function(){ loadMsg.loading=false; loadMsg.html=((typeof formatMsg==='function')?formatMsg(full):esc(full).replace(/\n/g,'<br>'))+'<span class="fab-caret">▍</span>'; _rptFabMsgs(); };
  try{
    if(llm&&llm.endpoint&&typeof _streamSSE==='function'){
      var payload={endpoint:llm.endpoint, model:llm.model, messages:[{role:'system',content:sysP},{role:'user',content:prompt}], max_tokens:2400, context_size:llm.context_size||262144, temperature:0.4, apikey:llm.apikey||''};
      await _streamSSE('/api/chat/local/stream', payload, function(t){ full+=t; started=true; render(); }, null);
    }
    if(!started){ var ans=await _rptFabLLMAnswer(q); full=ans||''; started=!!ans; }
  }catch(e){ if(!started){ try{ var ans2=await _rptFabLLMAnswer(q); full=ans2||''; started=!!ans2; }catch(_e){} } }
  loadMsg.loading=false;
  if(started){ loadMsg.html=(typeof formatMsg==='function')?formatMsg(full):esc(full).replace(/\n/g,'<br>'); }
  else { loadMsg.html='답변 생성에 실패했어요. 필터 값을 그대로 넣어 보세요 — 예) "자체항목 시험", "Fail 난 시험"'; }
  _rptFabMsgs();
}
// ── Report > Test Report 컨텍스트 빌더 ──
// "선택된 Report" = window._rptScope+필터가 적용된 _rptFiltered() (스코프 없으면 전체가 기본 Report).
// 매 전송마다 새로 읽어 스코프 변경 즉시 반영. Cycle 스텝 직렬화/로그절단(_cycStepLine/_cycTrimLog) 재사용.
var _RPT_BUDGET=28000;   // 컨텍스트 문자 예산 상한
function _rptScopeLabel(){
  var S=window._rptScope||{};
  if(!S.level) return '전체 (Report 미선택 — 전체 시험이 기본 Report)';
  if(S.level==='mgroup') return '모델그룹: '+(S.mgroup||'-');
  if(S.level==='model') return '모델: '+(S.mgroup||'')+' > '+(S.model||'-');
  return '버전: '+(S.mgroup||'')+' > '+(S.model||'')+' > '+(S.version||'-');
}
// step 한 줄 — Cycle의 _cycStepLine 재사용, 없으면 자체 폴백
function _rptStepLine(s,idx,emp){
  if(typeof _cycStepLine==='function') return _cycStepLine(s,idx,emp);
  var v=String(s&&s.result||'').trim()||'미실행'; var p=['판정='+v];
  if(s.cli)p.push('CLI: '+String(s.cli).replace(/\r?\n/g,' ⏎ ').slice(0,180));
  if(s.criteria)p.push('기대: '+String(s.criteria).slice(0,140));
  var out=String(s.output||''); if(out.trim())p.push('실제: '+(out.length>200?out.slice(0,200)+' …':out).replace(/\n/g,' ⏎ '));
  return '  - Step '+(idx+1)+' ['+(s.type||'cli')+'] '+p.join(' | ');
}
function _rptItemBlock(it,detail){
  var v=(typeof _rptVerdict==='function')?_rptVerdict(it):'?';
  var head='- TC '+(it.tcid||'')+' "'+(it.name||'')+'" · 판정='+String(v).toUpperCase()+(it._model?(' · '+it._model):'')+(it._version?(' '+it._version):'')+(it.devName?(' · 장비 '+it.devName):'')+(it.req_id?(' · REQ '+it.req_id):'')+(typeof _rptItemDate==='function'&&_rptItemDate(it)?(' · 실행 '+_rptItemDate(it)):' · 미실행');
  var steps=(it.steps||[]);
  if(!detail){ var kc={}; steps.forEach(function(s){var r=String(s.result||'').trim()||'미실행';kc[r]=(kc[r]||0)+1;}); return head+' | Step '+steps.length+'개 ['+Object.keys(kc).map(function(k){return k+':'+kc[k];}).join(', ')+']'; }
  var lines=steps.map(function(s,i){ var emp=(String(v).toLowerCase()==='fail')||(String(s.result||'').toLowerCase()==='fail'); return _rptStepLine(s,i,emp); });
  return head+'\n'+lines.join('\n');
}
function _rptIsBroad(q){ return /전체|모든|전수|다\s*알려|목록|리스트|요약|현황|커버리지|보고|상급자|결함|이슈|재시험|재실행|원인|개선|비교|찾아|정리|몇\s*개/.test(String(q||'')); }
function _rptMatchItems(q,items){
  var s=String(q||'').toLowerCase(); if(!s) return [];
  var toks=s.split(/[\s,]+/).filter(function(x){return x.length>=2;});
  return items.map(function(it){
    var hay=((it.tcid||'')+' '+(it.name||'')+' '+(it._model||'')+' '+(it._version||'')+' '+(it.devName||'')+' '+(it.req_id||'')).toLowerCase();
    (it.steps||[]).forEach(function(s2){ hay+=' '+String(s2.cli||'').toLowerCase()+' '+String(s2.criteria||'').toLowerCase()+' '+String(s2.desc||'').toLowerCase(); });
    var sc=0; toks.forEach(function(t){ if(hay.indexOf(t)>=0)sc++; });
    if(it.tcid&&s.indexOf(String(it.tcid).toLowerCase())>=0) sc+=5;
    return {it:it,sc:sc};
  }).filter(function(x){return x.sc>0;}).sort(function(a,b){return b.sc-a.sc;}).map(function(x){return x.it;});
}
// ── 메인: 선택된 Report(_rptFiltered) 라이브 컨텍스트 ──
function buildReportContext(q){
  try{
    var items=(typeof _rptFiltered==='function')?(_rptFiltered()||[]):((typeof _rptCollect==='function')?(_rptCollect()||[]):[]);
    var out=['[Test Report Context] (현재 선택된 Report 기준)'];
    out.push('## Page');
    out.push('- 선택 범위(Report): '+_rptScopeLabel());
    try{ var F=window._rptF||{}; var fl=[]; if(F.severity)fl.push('심각도='+F.severity); if(F.verdict)fl.push('결과='+F.verdict); if(F.cycle)fl.push('사이클필터 적용'); if(window._rptReqSel&&window._rptReqSel.size)fl.push('REQ선택 '+window._rptReqSel.size+'개'); if(fl.length)out.push('- 적용 필터: '+fl.join(', ')); }catch(e){}
    // Summary (항상)
    try{ var st=(typeof cycleCalcStats==='function')?cycleCalcStats(items):null; if(st) out.push('\n## Report Summary\n- TC '+st.total+' · 합격 '+st.pass+' / 불합격 '+st.fail+' / 예정 '+st.pending+' / 제외 '+st.exclude+' · 진행률 '+st.progress+'%'+(st.passRate!=null?(' · 합격률 '+st.passRate+'%'):'')); }catch(e){}
    // Requirement 커버리지 (항상, 요약)
    try{
      var reqs=(typeof reqList!=='undefined'?reqList:[])||[];
      if(reqs.length){
        out.push('\n## Requirement Coverage');
        var byReq={}; items.forEach(function(it){ var k=it.req_id||'(미연결)'; (byReq[k]=byReq[k]||[]).push(it); });
        Object.keys(byReq).slice(0,30).forEach(function(rid){
          var r=reqs.find(function(x){return x.id===rid||x.reqid===rid;}); var its=byReq[rid];
          var passed=its.filter(function(it){return (typeof _rptVerdict==='function'?_rptVerdict(it):'')==='pass';}).length;
          var failed=its.filter(function(it){return (typeof _rptVerdict==='function'?_rptVerdict(it):'')==='fail';}).length;
          out.push('- '+((r&&(r.reqid||r.id))||rid)+' '+((r&&r.title)||'')+' : TC '+its.length+' (합격 '+passed+' / 불합격 '+failed+')');
        });
      }
    }catch(e){}
    // Failure Analysis (항상) — 실패 TC + 실패 step의 기대/실제
    var fails=items.filter(function(it){ try{ return _rptVerdict(it)==='fail'; }catch(e){ return false; } });
    if(fails.length){
      out.push('\n## Failure Analysis ('+fails.length+'개 불합격 TC)');
      fails.slice(0,30).forEach(function(it){
        var fs=(it.steps||[]).filter(function(s){return String(s.result||'').toLowerCase()==='fail';});
        out.push('- '+(it.tcid||'')+' "'+(it.name||'')+'"'+(it._model?(' @'+it._model+' '+(it._version||'')):'')+' · 실패 Step '+fs.length+'개');
        fs.slice(0,3).forEach(function(s){ var i=(it.steps||[]).indexOf(s); out.push('    · Step '+(i+1)+' CLI:'+String(s.cli||'').replace(/\r?\n/g,' ⏎ ').slice(0,100)+' | 기대:'+String(s.criteria||'').slice(0,80)+' | 실제:'+(typeof _cycTrimLog==='function'?_cycTrimLog(s.output,true):String(s.output||'').slice(0,300))); });
      });
    }
    // TC & Step 상세 (질문 매칭 → 실패 우선 → 나머지, 예산 내)
    var matched=_rptMatchItems(q,items); var broad=_rptIsBroad(q);
    var detailItems;
    if(matched.length&&!broad) detailItems=matched;
    else { var ff=items.filter(function(it){return _rptVerdict(it)==='fail';}); var rest=items.filter(function(it){return ff.indexOf(it)<0;}); detailItems=matched.concat(ff.filter(function(it){return matched.indexOf(it)<0;})).concat(rest.filter(function(it){return matched.indexOf(it)<0&&ff.indexOf(it)<0;})); }
    out.push('\n## TC & Step 상세');
    var body=[]; var used=out.join('\n').length; var truncated=0;
    for(var i=0;i<detailItems.length;i++){ var block=_rptItemBlock(detailItems[i],true); if(used+block.length>_RPT_BUDGET){ truncated=detailItems.length-i; break; } body.push(block); used+=block.length+2; }
    out.push(body.join('\n\n'));
    if(truncated>0) out.push('\n[알림] 토큰 예산으로 TC '+truncated+'개 Step 상세 생략 — 위 Summary·Failure Analysis엔 포함. 특정 TC 지목 시 상세 제공.');
    return out.join('\n');
  }catch(e){ return '[Report 컨텍스트 생성 오류] '+(e&&e.message||e); }
}
// 자유 질문용 데이터 컨텍스트 — 모델그룹/모델/버전 구조·통계·필터 값·불합격 목록을 LLM에 주입
function _rptFabContext(){
  var lines=[];
  try{
    var all=(typeof _rptCollect==='function')?(_rptCollect()||[]):[];
    var st=(typeof cycleCalcStats==='function')?cycleCalcStats(all):null;
    if(st) lines.push('[전체 통계] TC '+st.total+' · 합격 '+st.pass+' · 불합격 '+st.fail+' · 예정 '+st.pending+' · 제외 '+st.exclude+' · 진행률 '+st.progress+'%');
    var mgMap={};
    (typeof cycleList!=='undefined'?cycleList:[]).forEach(function(c){ var mg=(typeof _cycMGroup==='function')?_cycMGroup(c):(c.model||'-'); mgMap[mg]=mgMap[mg]||{}; var m=c.model||'-'; (mgMap[mg][m]=mgMap[mg][m]||[]).push(c); });
    lines.push('[모델그룹 > 모델(장비) : 버전 목록과 통계]');
    Object.keys(mgMap).sort().forEach(function(mg){
      Object.keys(mgMap[mg]).sort().forEach(function(m){
        var cys=mgMap[mg][m]; var its=[]; cys.forEach(function(c){ (c.items||[]).forEach(function(it){ its.push(it); }); });
        var s2=(typeof cycleCalcStats==='function')?cycleCalcStats(its):null;
        var vers=[...new Set(cys.map(function(c){return c.version||'';}).filter(Boolean))];
        lines.push('- '+mg+' > '+m+' : 버전['+vers.join(', ')+'] · TC '+(s2?s2.total:its.length)+' · 합격 '+(s2?s2.pass:'-')+' · 불합격 '+(s2?s2.fail:'-')+' · 예정 '+(s2?s2.pending:'-'));
      });
    });
    try{ var flds=(typeof _rptFilterFields==='function')?_rptFilterFields():[]; if(flds&&flds.length){ lines.push('[필터 가능 필드와 값]'); flds.forEach(function(f){ lines.push('- '+f.label+': '+(f.values||[]).slice(0,20).join(', ')); }); } }catch(e){}
    var fails=all.filter(function(it){ try{ return _rptVerdict(it)==='fail'; }catch(e){ return false; } }).slice(0,15);
    if(fails.length){ lines.push('[불합격 TC (최대 15건)]'); fails.forEach(function(it){ lines.push('- '+(it.tcid||'')+' '+(it.name||'')+' ('+(it._model||'')+' '+(it._version||'')+')'); }); }
  }catch(e){}
  return lines.join('\n').slice(0,6000);
}
async function _rptFabLLMAnswer(q){
  try{
    var pai={}; try{ var _c=await _pgAiCfgGet(); pai=(_c&&_c.report)||{}; }catch(e){}
    var sysP=(pai.prompt&&String(pai.prompt).trim())||'너는 utop Test Report 분석 어시스턴트다. 아래 현재 리포트의 시험 집계 데이터만 근거로 한국어로 간결하게(필요하면 목록으로) 답하라. 개수·비율은 제공된 집계 수치를 사용하고 목록을 직접 세지 마라. 데이터에 없는 내용은 추측하지 말고 없다고 말하라.';
    var _ctx=''; try{ _ctx=(typeof buildReportContext==='function')?buildReportContext(q):_rptFabContext(); }catch(e){ _ctx=_rptFabContext(); }
    var prompt='[현재 Report 데이터]\n'+_ctx+'\n\n[질문]\n'+String(q||'');
    return await _rptLLMChat(prompt, 2400, 0.4, {llmId:pai.llm_id||'', system:sysP});   // 페이지 AI 설정의 LLM·프롬프트 사용 + max_tokens 확대
  }catch(e){ return ''; }
}
// 채팅 답변 요약 문구
function _rptFabAnswerHtml(q,r){
  var e=function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;'); };
  if(!r) return '질문을 이해하지 못했어요. 필터 값을 그대로 넣어 보세요 — 예) "자체항목 시험", "Fail 난 시험"';
  if(r.empty) return '조건에 맞는 시험 데이터가 없어요.';
  var spec=window._rptQSpec;
  var tail='<br><span style="font-size:11px;color:var(--text3);">탐색 화면 아래 <b>AI 질문</b> 카드에 차트·결과 표가 반영됐어요.</span>';
  var note=(spec&&spec.title)?('<div style="font-size:11px;color:#0f766e;margin-bottom:4px;"><i class="ti ti-sparkles"></i> '+e(spec.title)+'</div>'):'';
  if(r.mode==='filter'){
    var fl=r.filters.map(function(x){return e(x.field)+'='+e(x.value);}).join(', ');
    return note+'<b style="color:var(--blue);">'+fl+'</b> 조건 시험 <b>'+r.items.length+'건</b> — <span style="color:#00a872;">합격 '+r.breakdown.pass+'</span> / <span style="color:#e53e5a;">불합격 '+r.breakdown.fail+'</span>'+(r.breakdown.pending?' / 예정 '+r.breakdown.pending:'')+tail;
  }
  var best=r.top[0];
  return note+'<b>'+e(r.dimLabel)+'</b> 중 '+(r.ascN?'가장 적은':'가장 많은')+' <b>'+e(r.metricLabel)+'</b> → <b style="color:'+(r.metric==='fail'?'#e53e5a':'#0f766e')+';">'+e(best.k)+'</b> ('+_rptAnaVal(best,r.metric)+r.unit+')'+tail;
}
function _rptFabClear(){ window._rptQ=''; window._rptQSpec=null; window._rptQDrill=null; window._rptQLoading=false; renderReport(); }
// 탐색 뷰 하단 AI 질문 결과 카드 (질의 뷰의 결과 렌더를 카드형으로 이식)
function _rptFabResultHtml(q, r){
  const e=function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;'); };
  let inner;
  if(!r){
    inner=window._rptQLoading
      ?'<div style="padding:26px;text-align:center;color:var(--text3);"><i class="ti ti-loader-2 spin" style="font-size:26px;color:#0d9488;display:block;margin-bottom:9px;"></i>AI가 질문을 해석하고 있어요…</div>'
      :'<div style="padding:22px;text-align:center;color:var(--text3);font-size:12px;"><i class="ti ti-help-circle" style="font-size:26px;opacity:0.25;display:block;margin-bottom:8px;"></i>질문을 이해하지 못했어요 — 필터 값을 그대로 넣어 보세요 (예: "자체항목 시험", "Fail 난 시험")</div>';
  } else if(r.empty){
    inner='<div style="padding:22px;text-align:center;color:var(--text3);font-size:12px;">조건에 맞는 시험 데이터가 없어요.</div>';
  } else {
    const curType=window._rptQChartType||(r.mode==='filter'?'doughnut':'barh');
    const _spec=window._rptQSpec;
    const aiNote=(_spec&&_spec._for===q&&_spec.title)?('<div style="display:flex;align-items:center;gap:6px;font-size:11.5px;color:#0f766e;background:rgba(13,148,136,0.07);border:1px solid rgba(13,148,136,0.18);border-radius:7px;padding:6px 10px;margin-bottom:10px;"><i class="ti ti-sparkles"></i> <b>AI 해석</b> · '+e(_spec.title)+(_spec._fallback?' <span style="color:var(--text3);font-weight:400;">(LLM 응답 불가 → 규칙 기반)</span>':'')+'</div>'):'';
    const typeSel='<select onchange="window._rptQChartType=this.value;renderReport()" style="font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:5px;background:#fff;color:var(--text2);outline:none;cursor:pointer;">'+['barh:가로 막대','barv:세로 막대','doughnut:도넛','pie:파이','line:선'].map(function(o){ const p2=o.split(':'); return '<option value="'+p2[0]+'"'+(curType===p2[0]?' selected':'')+'>'+p2[1]+'</option>'; }).join('')+'</select>';
    let ans, tableItems, chTitle, chHeight;
    if(r.mode==='filter'){
      const fl=r.filters.map(function(x){return e(x.field)+'='+e(x.value);}).join(', ');
      ans='<div style="font-size:13px;margin-bottom:11px;"><b style="color:var(--blue);">'+fl+'</b> 조건 시험 <b>'+r.items.length+'건</b> <span style="font-size:11.5px;color:var(--text3);">· <span style="color:#00a872;">합격 '+r.breakdown.pass+'</span> / <span style="color:#e53e5a;">불합격 '+r.breakdown.fail+'</span>'+(r.breakdown.pending?' / 예정 '+r.breakdown.pending:'')+'</span></div>';
      tableItems=r.items; chTitle='합격/불합격 분포'; chHeight=(curType==='doughnut'||curType==='pie')?260:230;
    } else {
      const best=r.top[0], metric=r.metric, unit=r.unit, sel=window._rptQDrill||r.top[0].k;
      const items2=(typeof _rptFiltered==='function')?(_rptFiltered()||[]):[];
      tableItems=items2.filter(function(it){ return _rptDimKey(it,r.dim)===sel; });
      ans='<div style="font-size:13px;margin-bottom:11px;"><b>'+r.dimLabel+'</b> 중 '+(r.ascN?'가장 적은':'가장 많은')+' <b>'+r.metricLabel+'</b> → <b style="color:'+(metric==='fail'?'#e53e5a':(metric==='passRate'?'#00a872':'#2d6fd4'))+';">'+e(best.k)+'</b> ('+r.metricLabel+' '+_rptAnaVal(best,metric)+unit+') <span style="font-size:11px;color:var(--text3);">· 막대를 클릭하면 그 '+r.dimLabel+'의 결과가 표에 나와요 (현재: '+e(sel)+')</span></div>';
      chTitle=e(r.dimLabel)+'별 '+e(r.metricLabel); chHeight=(curType==='doughnut'||curType==='pie')?280:(curType==='line'?260:(44+r.top.length*28));
    }
    inner=aiNote+ans+'<div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;">'
      +'<div style="flex:1 1 340px;min-width:280px;background:#fff;border:1px solid var(--border);border-radius:10px;padding:14px;"><div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><span style="font-size:12px;font-weight:700;color:var(--text2);">'+chTitle+'</span><span style="flex:1;"></span>'+typeSel+'</div><div style="height:'+chHeight+'px;position:relative;"><canvas id="rptQChart"></canvas></div></div>'
      +'<div style="flex:2 1 460px;min-width:340px;">'+_rptTableHtml(tableItems)+'</div>'
    +'</div>';
  }
  return '<div style="margin-top:14px;background:#fff;border:1px solid #b5e3db;border-radius:10px;overflow:hidden;">'
    +'<div style="padding:8px 13px;background:rgba(13,148,136,0.07);border-bottom:1px solid #d5efe9;display:flex;align-items:center;gap:7px;"><i class="ti ti-message-chatbot" style="color:#0d9488;font-size:15px;"></i><span style="font-size:12px;font-weight:800;color:#0f766e;flex-shrink:0;">AI 질문</span><span style="font-size:12px;color:var(--text2);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+e(q)+'</span><button onclick="_rptFabClear()" style="font-size:11px;border:1px solid var(--border);background:#fff;border-radius:6px;padding:2px 9px;cursor:pointer;color:var(--text3);flex-shrink:0;"><i class="ti ti-x" style="font-size:10px;"></i> 해제</button></div>'
    +'<div style="padding:12px 13px;">'+inner+'</div></div>';
}
// 특정 장비/모델/버전 진행 현황 질의 ("U9024A-10G 시험 진행 현황 알려줘")
function _rptStatusQuery(msg){
  const items=(typeof _rptCollect==='function')?(_rptCollect()||[]):[];
  if(!items.length) return null;
  if(!/현황|진행|상태|상황|요약|진척|어디까지|얼마나|진행률|성공률/.test(String(msg||''))) return null; // 현황 의도 키워드가 있을 때만(장비명만으로 오작동 방지)
  const normG=function(s){ return String(s==null?'':s).toLowerCase().replace(/[\s\-_]+/g,''); };
  const nm=normG(msg); if(nm.length<3) return null;
  const cand={};
  items.forEach(function(it){ if(it._grp&&it._grp!=='-')cand[it._grp]=1; if(it._model&&it._model!=='-')cand[it._model]=1; });
  var best=null, bestLen=0;
  Object.keys(cand).forEach(function(c){ const nc=normG(c); if(nc.length>=3 && nm.indexOf(nc)>=0 && nc.length>bestLen){ best=c; bestLen=nc.length; } });
  if(!best) return null;
  const bn=normG(best);
  const sel=items.filter(function(it){ return normG(it._grp)===bn || normG(it._model)===bn; });
  if(!sel.length) return null;
  return {group:best, items:sel};
}

function _rptStatusReply(msg){
  const st=_rptStatusQuery(msg);
  if(!st) return false;
  const e=function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;'); };
  const bd={pass:0,fail:0,pending:0,exclude:0}; st.items.forEach(function(it){ const v=(typeof _rptVerdict==='function')?_rptVerdict(it):'pending'; if(bd[v]!=null)bd[v]++; });
  const total=st.items.length, dn=bd.pass+bd.fail, pr=dn?Math.round(bd.pass/dn*100):0, prog=total?Math.round((total-bd.pending)/total*100):0;
  const cid='aiRptChart-'+(window._aiRptCid=(window._aiRptCid||0)+1);
  const chart='<div style="height:170px;width:240px;max-width:100%;margin-top:9px;position:relative;"><canvas id="'+cid+'"></canvas></div>';
  aiFabAppend('ai','<b style="color:var(--blue);">'+e(st.group)+'</b> 시험 진행 현황<br><span style="font-size:12px;">전체 <b>'+total+'</b>건 · <span style="color:#00a872;">합격 '+bd.pass+'</span> / <span style="color:#e53e5a;">불합격 '+bd.fail+'</span> / 예정 '+bd.pending+' / 제외 '+bd.exclude+'</span><br><span style="font-size:11.5px;color:var(--text3);">합격률 '+pr+'% · 진행률 '+prog+'%</span>'+chart+_rptPdfBtn(msg),{html:true});
  setTimeout(function(){ if(typeof _rptDrawBreakdownChart==='function') _rptDrawBreakdownChart(cid, bd); }, 60);
  return true;
}
// 자유 질의용 데이터 컨텍스트 — LLM에 현재 리포트 집계를 주입해 다양한 질문에 답하게 함

// 자유 질의용 데이터 컨텍스트 — LLM에 현재 리포트 집계를 주입해 다양한 질문에 답하게 함// 챗 답변 아래 'PDF 보고서' 버튼 — 질문 인덱스를 저장해 onclick 이스케이프 회피

// 챗 답변 아래 'PDF 보고서' 버튼 — 질문 인덱스를 저장해 onclick 이스케이프 회피
function _rptPdfBtn(q){
  window._rptChatQ=window._rptChatQ||[];
  const qi=window._rptChatQ.push(String(q==null?'':q))-1;
  return '<div style="margin-top:10px;"><button onclick="_rptChatPdf('+qi+')" style="display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;padding:6px 12px;border:1px solid var(--border);border-radius:7px;background:#fff;color:var(--text2);cursor:pointer;" onmouseenter="this.style.borderColor=\'var(--blue)\';this.style.color=\'var(--blue)\'" onmouseleave="this.style.borderColor=\'var(--border)\';this.style.color=\'var(--text2)\'"><i class="ti ti-printer" style="color:#e53e5a;font-size:14px;"></i> PDF 보고서</button></div>';
}
// 챗 질문을 리포트 뷰로 재현(필터/순위→질의, 현황→탐색 드릴) 후 PDF 인쇄 뷰어 열기

// 챗 질문을 리포트 뷰로 재현(필터/순위→질의, 현황→탐색 드릴) 후 PDF 인쇄 뷰어 열기
function _rptChatPdf(qi){
  const q=(window._rptChatQ||[])[qi]||'';
  try{
    const r=(typeof _rptAnalyze==='function')?_rptAnalyze(q):null;
    if(r && !r.empty){
      window._rptQ=String(q||''); window._rptQDrill=null; window._rptQChartType=null; window._rptQTried=q; window._rptQLoading=false; window._rptQLLMInflight=false;
      window._rptQSpec=(r.mode==='filter')?{mode:'filter',filters:r.filters,_for:q}:{mode:'rank',dim:r.dim,metric:r.metric,direction:(r.ascN?'asc':'desc'),_for:q};
      if(r.mode==='filter' && typeof _rptSyncTopFilter==='function') _rptSyncTopFilter(r.filters);
      window._rptView='explore';
    } else {
      const st=(typeof _rptStatusQuery==='function')?_rptStatusQuery(q):null;
      if(st){ window._rptDrill={dim:'model',value:st.group,label:st.group}; window._rptView='explore'; }
    }
  }catch(e){}
  if(typeof renderReport==='function') renderReport();
  setTimeout(function(){ if(typeof reportExportPDF==='function') reportExportPDF(); }, 500);
}

function reportExportPDF(){
  const titles={rptDonut:'진행률',rptSev:'심각도별 합·불',rptReq:'REQ 커버리지',rptModel:'모델·버전 합격률',rptTime:'시간대별 추이',rptDefect:'결함 분포',rptQChart:'질의 결과 차트'};
  const esc=function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;'); };
  // 현재 화면에 실제로 그려진 차트를 모두 캡처 (대시보드 6종 + 질의 rptQChart 등)
  const seen={}; const imgs=[]; let _cidx=0;
  const grab=function(el,title){ if(!el) return; const key=el.id||('__c'+(_cidx++)); if(seen[key]) return; try{ const src=el.toDataURL('image/png'); if(src&&src.length>300){ imgs.push({title:title,src:src}); seen[key]=1; } }catch(e){} };
  Object.keys(titles).forEach(function(id){ grab(document.getElementById(id), titles[id]); });
  const rb=document.getElementById('report-body');
  if(rb){ Array.prototype.forEach.call(rb.querySelectorAll('canvas'), function(el){ grab(el, (el.id&&titles[el.id])||'차트'); }); }
  const items=_rptFiltered(); const stats=cycleCalcStats(items);
  const vmap={pass:'합격',fail:'불합격',pending:'예정',exclude:'제외'};
  const sp=window._rptQSpec;
  const aiNote=(window._rptView==='aiq'&&window._rptQ)?('<div style="margin:8px 0 0;padding:8px 12px;background:#faf8ff;border:1px solid #e3dafc;border-radius:7px;color:#6b46d8;font-size:12.5px;">🔎 질의: <b>'+esc(window._rptQ)+'</b>'+(sp&&sp.title?('<br><span style="color:#7048e8;">AI 해석: '+esc(sp.title)+'</span>'):'')+'</div>'):'';
  const RES_CAP=500; const capped=items.slice(0,RES_CAP); const resMore=(items.length>RES_CAP);
  const resRows=capped.map(function(it){ const rq=reqList.find(x=>x.id===it.req_id); const v=_rptVerdict(it); const vc={pass:'#00a872',fail:'#e53e5a',pending:'#888',exclude:'#c9923e'}[v]||'#555'; return '<tr><td>'+esc(it._cycle)+'</td><td>'+esc((rq&&rq.reqid)||it.req_id||'')+'</td><td>'+esc(it.tcid||'')+'</td><td>'+esc(it.name||'')+'</td><td>'+esc(_rptSevVal(it)||'')+'</td><td>'+esc(it._grp||'')+'</td><td style="color:'+vc+';font-weight:700;">'+(vmap[v]||v)+'</td><td>'+esc(_rptItemDate(it)||'')+'</td></tr>'; }).join('');
  const fail=items.filter(it=>_rptVerdict(it)==='fail');
  const failRows=fail.map(it=>{ const sum=String(it.llm_summary||'').replace(/\[\[빨강\]\]/g,'').replace(/\[\[\/빨강\]\]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;'); return '<tr><td>'+(it.tcid||'')+'</td><td>'+esc(it.name||'')+'</td><td>'+esc(_rptSevVal(it)||'')+'</td><td>'+(it._grp||'')+'</td><td style="font-size:10px;color:#555;">'+sum.slice(0,220)+'</td></tr>'; }).join('');
  const chartHtml=imgs.length?imgs.map(im=>'<div class="ch"><div class="cht">'+im.title+'</div><img src="'+im.src+'"></div>').join(''):'<div style="color:#888;font-size:12px;">현재 화면에 표시된 차트가 없습니다. (대시보드 또는 질의 화면에서 내보내면 차트가 포함됩니다.)</div>';
  const docHtml='<html><head><meta charset="utf-8"><title>시험결과 보고서</title><style>body{font-family:"Malgun Gothic",AppleGothic,sans-serif;padding:28px;color:#222;margin:0;}h1{font-size:22px;margin:0;}h2{font-size:15px;border-bottom:2px solid #2d6fd4;padding-bottom:5px;margin-top:22px;}.kpi{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0;}.kc{border:1px solid #ddd;border-radius:8px;padding:9px 16px;font-size:12px;color:#666;}.kc b{font-size:21px;display:block;color:#222;}.charts{display:grid;grid-template-columns:1fr 1fr;gap:12px;}.ch{border:1px solid #eee;border-radius:8px;padding:10px;}.cht{font-size:12px;font-weight:700;margin-bottom:6px;}.ch img{width:100%;}table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px;}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top;}th{background:#f4f5f7;}@media print{.charts{grid-template-columns:1fr 1fr;}}</style></head><body>'
    +'<h1>📊 시험결과 보고서</h1><div style="color:#888;font-size:12px;margin-top:3px;">U-TOP · 생성 '+_nowStr()+'</div>'+aiNote
    +'<h2>요약</h2><div class="kpi"><div class="kc">전체<b>'+stats.total+'</b></div><div class="kc" style="color:#00a872;">합격<b>'+stats.pass+'</b></div><div class="kc" style="color:#e53e5a;">불합격<b>'+stats.fail+'</b></div><div class="kc">예정<b>'+stats.pending+'</b></div><div class="kc">제외<b>'+stats.exclude+'</b></div><div class="kc" style="color:#2d6fd4;">진행률<b>'+stats.progress+'%</b></div></div>'
    +'<h2>차트</h2><div class="charts">'+chartHtml+'</div>'
    +'<h2>결과 ('+items.length+'건'+(resMore?' · 상위 '+RES_CAP+'건 표시, 전체는 CSV로 내보내세요':'')+')</h2>'+(resRows?'<table><thead><tr><th>사이클</th><th>REQ</th><th>TC ID</th><th>시험명</th><th>심각도</th><th>모델·버전</th><th>결과</th><th>실행일</th></tr></thead><tbody>'+resRows+'</tbody></table>':'<div style="color:#888;font-size:12px;">대상 없음</div>')
    +'<h2>불합격 상세 ('+fail.length+'건)</h2>'+(failRows?'<table><thead><tr><th>TC ID</th><th>시험명</th><th>심각도</th><th>모델</th><th>LLM 요약</th></tr></thead><tbody>'+failRows+'</tbody></table>':'<div style="color:#888;font-size:12px;">불합격 없음</div>')
    +'</body></html>';
  _rptShowReportModal(docHtml);
}

// 보고서를 새 창이 아니라 페이지 내 모달(iframe)로 표시 — 인쇄 버튼 제공
function _rptShowReportModal(docHtml){
  var old=document.getElementById('rptReportModal'); if(old) old.remove();
  var ov=document.createElement('div'); ov.id='rptReportModal';
  ov.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(20,22,30,.55);display:flex;align-items:center;justify-content:center;padding:24px;';
  ov.innerHTML='<div style="background:#fff;border-radius:12px;width:min(1000px,96vw);height:min(90vh,900px);display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.4);">'
    +'<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid #eee;flex:0 0 auto;">'
    +'<b style="font-size:14px;color:#222;flex:1;">📊 시험결과 보고서</b>'
    +'<button id="rptRepPrint" style="border:1px solid #2d6fd4;background:#2d6fd4;color:#fff;border-radius:7px;padding:6px 14px;font-size:12.5px;cursor:pointer;">🖨 인쇄 / PDF 저장</button>'
    +'<button id="rptRepClose" style="border:1px solid #ddd;background:#fff;color:#555;border-radius:7px;padding:6px 12px;font-size:12.5px;cursor:pointer;">닫기</button>'
    +'</div>'
    +'<iframe id="rptRepFrame" style="flex:1;width:100%;border:0;background:#fff;"></iframe>'
    +'</div>';
  document.body.appendChild(ov);
  var fr=ov.querySelector('#rptRepFrame');
  var fd=fr.contentWindow.document; fd.open(); fd.write(docHtml); fd.close();
  var close=function(){ ov.remove(); };
  ov.querySelector('#rptRepClose').onclick=close;
  ov.addEventListener('mousedown',function(e){ if(e.target===ov) close(); });
  ov.querySelector('#rptRepPrint').onclick=function(){ try{ fr.contentWindow.focus(); fr.contentWindow.print(); }catch(e){ showToast('인쇄 실패'); } };
}

// Test Report 스타일 PPTX — 바로 저장하지 않고 팝업 미리보기 → [PPTX 저장] 버튼으로 생성
// 슬라이드 구성: 1)요약(KPI)  2~)차트 2개씩  n~)결과표(22행/슬라이드)
var _RPT_PPT_PER=22;
function _rptPptCollect(){
  var titles={rptDonut:'진행률',rptSev:'심각도별 합·불',rptReq:'REQ 커버리지',rptModel:'모델·버전 합격률',rptTime:'시간대별 추이',rptDefect:'결함 분포',rptQChart:'질의 결과 차트'};
  var seen={}, imgs=[], _ci=0;
  var grab=function(el,title){ if(!el)return; var key=el.id||('__c'+(_ci++)); if(seen[key])return; try{ var src=el.toDataURL('image/png'); if(src&&src.length>300){ imgs.push({title:title,src:src}); seen[key]=1; } }catch(e){} };
  Object.keys(titles).forEach(function(id){ grab(document.getElementById(id),titles[id]); });
  var rb=document.getElementById('report-body'); if(rb){ Array.prototype.forEach.call(rb.querySelectorAll('canvas'),function(el){ grab(el,(el.id&&titles[el.id])||'차트'); }); }
  var items=_rptFiltered(); var stats=cycleCalcStats(items);
  return { imgs:imgs, items:items, stats:stats };
}
// PPTX 미리보기: 실제 저장될 슬라이드를 16:9 카드로 그려서 팝업 표시
function reportExportPPTX(){
  var ctx=_rptPptCollect();
  if(!ctx.items.length){ showToast('표시할 항목이 없습니다'); return; }
  window._rptPptCtx=ctx;
  _rptShowPptxPreview(ctx);
}
function _rptPptSlideHtml(inner){ return '<div class="pptslide">'+inner+'</div>'; }
function _rptShowPptxPreview(ctx){
  var esc=function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;'); };
  var stats=ctx.stats, imgs=ctx.imgs, items=ctx.items;
  var vmap={pass:'합격',fail:'불합격',pending:'예정',exclude:'제외'};
  var slides=[];
  // 슬라이드 1: 요약
  var kpis=[['전체',stats.total,'#333'],['합격',stats.pass,'#00a872'],['불합격',stats.fail,'#e53e5a'],['예정',stats.pending,'#9aa0b8'],['제외',stats.exclude,'#c9923e'],['진행률',stats.progress+'%','#2d6fd4']];
  var kpiHtml=kpis.map(function(k){ return '<div class="ppkc"><span>'+k[0]+'</span><b style="color:'+k[2]+'">'+k[1]+'</b></div>'; }).join('');
  slides.push(_rptPptSlideHtml('<div class="pptit">시험 결과 보고서</div><div class="ppsub">U-TOP · 생성 '+(typeof _nowStr==='function'?_nowStr():'')+'</div><div class="ppkpi">'+kpiHtml+'</div>'));
  // 차트 슬라이드 (2개씩)
  for(var ci=0;ci<imgs.length;ci+=2){
    var cells='';
    for(var j=0;j<2 && ci+j<imgs.length;j++){ var im=imgs[ci+j]; cells+='<div class="ppchart"><div class="ppct">'+esc(im.title)+'</div><img src="'+im.src+'"></div>'; }
    slides.push(_rptPptSlideHtml('<div class="pphd">차트</div><div class="ppcharts">'+cells+'</div>'));
  }
  // 결과표 슬라이드
  var PER=_RPT_PPT_PER; var pageCnt=Math.max(1,Math.ceil(items.length/PER));
  for(var r=0,pg=1;r<items.length||(r===0&&items.length===0);r+=PER,pg++){
    var rowsH=items.slice(r,r+PER).map(function(it){ var rq=(reqList||[]).find(function(x){return x.id===it.req_id;}); var v=_rptVerdict(it); var vc={pass:'#00a872',fail:'#e53e5a',pending:'#888',exclude:'#c9923e'}[v]||'#555';
      return '<tr><td>'+esc(it._cycle||'')+'</td><td>'+esc((rq&&rq.reqid)||it.req_id||'')+'</td><td>'+esc(it.tcid||'')+'</td><td>'+esc(it.name||'')+'</td><td style="color:'+vc+';font-weight:700">'+(vmap[v]||v)+'</td></tr>'; }).join('');
    slides.push(_rptPptSlideHtml('<div class="pphd">결과 ('+items.length+'건)'+(pageCnt>1?(' '+pg+'/'+pageCnt):'')+'</div><table class="pptbl"><thead><tr><th>사이클</th><th>REQ</th><th>TC ID</th><th>시험명</th><th>결과</th></tr></thead><tbody>'+rowsH+'</tbody></table>'));
    if(items.length===0) break;
  }
  var old=document.getElementById('rptPptModal'); if(old) old.remove();
  var ov=document.createElement('div'); ov.id='rptPptModal';
  ov.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(20,22,30,.55);display:flex;align-items:center;justify-content:center;padding:24px;';
  ov.innerHTML='<div style="background:#eef0f4;border-radius:12px;width:min(1080px,96vw);height:min(92vh,940px);display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.4);">'
    +'<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid #dcdfe6;background:#fff;flex:0 0 auto;">'
    +'<b style="font-size:14px;color:#222;flex:1;">📑 PPTX 미리보기 <span style="color:#888;font-weight:400;font-size:12px;">('+slides.length+' 슬라이드)</span></b>'
    +'<button id="rptPptSave" style="border:1px solid #c0392b;background:#c0392b;color:#fff;border-radius:7px;padding:6px 14px;font-size:12.5px;cursor:pointer;">📥 PPTX 저장</button>'
    +'<button id="rptPptClose" style="border:1px solid #ddd;background:#fff;color:#555;border-radius:7px;padding:6px 12px;font-size:12.5px;cursor:pointer;">닫기</button>'
    +'</div>'
    +'<div id="rptPptScroll" style="flex:1;overflow:auto;padding:20px;">'
    +'<style>'
    +'#rptPptScroll .pptslide{position:relative;width:960px;max-width:100%;aspect-ratio:16/9;background:#fff;margin:0 auto 20px;border:1px solid #d0d4dc;border-radius:6px;box-shadow:0 3px 10px rgba(0,0,0,.12);padding:26px 34px;box-sizing:border-box;overflow:hidden;font-family:"Malgun Gothic",AppleGothic,sans-serif;}'
    +'#rptPptScroll .pptit{font-size:30px;font-weight:800;color:#111;}'
    +'#rptPptScroll .ppsub{font-size:13px;color:#888;margin-top:6px;}'
    +'#rptPptScroll .ppkpi{display:flex;gap:14px;margin-top:34px;flex-wrap:wrap;}'
    +'#rptPptScroll .ppkc{border:1px solid #ddd;border-radius:8px;background:#f7f9fc;padding:14px 8px;width:132px;text-align:center;}'
    +'#rptPptScroll .ppkc span{display:block;font-size:13px;color:#666;margin-bottom:6px;}'
    +'#rptPptScroll .ppkc b{font-size:32px;}'
    +'#rptPptScroll .pphd{font-size:19px;font-weight:700;color:#111;margin-bottom:14px;}'
    +'#rptPptScroll .ppcharts{display:grid;grid-template-columns:1fr 1fr;gap:16px;height:calc(100% - 40px);}'
    +'#rptPptScroll .ppchart{display:flex;flex-direction:column;min-height:0;}'
    +'#rptPptScroll .ppct{font-size:14px;font-weight:700;color:#2d6fd4;margin-bottom:6px;}'
    +'#rptPptScroll .ppchart img{flex:1;min-height:0;object-fit:contain;width:100%;}'
    +'#rptPptScroll .pptbl{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed;}'
    +'#rptPptScroll .pptbl th,#rptPptScroll .pptbl td{border:1px solid #ddd;padding:4px 7px;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
    +'#rptPptScroll .pptbl th{background:#f4f5f7;font-size:11px;}'
    +'#rptPptScroll .pptbl th:nth-child(1),#rptPptScroll .pptbl td:nth-child(1){width:16%;}'
    +'#rptPptScroll .pptbl th:nth-child(2),#rptPptScroll .pptbl td:nth-child(2){width:15%;}'
    +'#rptPptScroll .pptbl th:nth-child(3),#rptPptScroll .pptbl td:nth-child(3){width:18%;}'
    +'#rptPptScroll .pptbl th:nth-child(5),#rptPptScroll .pptbl td:nth-child(5){width:10%;text-align:center;}'
    +'</style>'
    +slides.join('')
    +'</div></div>';
  document.body.appendChild(ov);
  var close=function(){ ov.remove(); };
  ov.querySelector('#rptPptClose').onclick=close;
  ov.addEventListener('mousedown',function(e){ if(e.target===ov) close(); });
  ov.querySelector('#rptPptSave').onclick=function(){ _rptSavePptxFile(); };
}
// 실제 PPTX 파일 생성 (미리보기와 동일 구성)
async function _rptSavePptxFile(){
  var ctx=window._rptPptCtx; if(!ctx||!ctx.items.length){ showToast('표시할 항목이 없습니다'); return; }
  var imgs=ctx.imgs, items=ctx.items, stats=ctx.stats;
  showToast('PPTX 생성 중…');
  var Pptx; try{ Pptx=(typeof _loadPptxLib==='function')?await _loadPptxLib():null; }catch(e){ showToast(e.message); return; }
  if(!Pptx){ showToast('PPTX 라이브러리 로드 실패'); return; }
  var p=new Pptx(); p.layout='LAYOUT_WIDE'; var BDc='111111';
  var vmap={pass:'합격',fail:'불합격',pending:'예정',exclude:'제외'};
  // 슬라이드 1: 요약(KPI)
  var s1=p.addSlide();
  s1.addText('시험 결과 보고서',{x:0.5,y:0.35,w:12.3,h:0.6,fontSize:26,bold:true,color:BDc});
  s1.addText('U-TOP · 생성 '+(typeof _nowStr==='function'?_nowStr():''),{x:0.5,y:1.0,w:12,h:0.3,fontSize:12,color:'888888'});
  var kpis=[['전체',stats.total,'333333'],['합격',stats.pass,'00A872'],['불합격',stats.fail,'E53E5A'],['예정',stats.pending,'9AA0B8'],['제외',stats.exclude,'C9923E'],['진행률',stats.progress+'%','2D6FD4']];
  kpis.forEach(function(k,i){ var x=0.5+i*2.1; s1.addShape('rect',{x:x,y:1.7,w:1.95,h:1.2,fill:{color:'F7F9FC'},line:{color:'DDDDDD',width:1}});
    s1.addText(k[0],{x:x,y:1.85,w:1.95,h:0.3,fontSize:12,align:'center',color:'666666'});
    s1.addText(String(k[1]),{x:x,y:2.15,w:1.95,h:0.6,fontSize:28,bold:true,align:'center',color:k[2]}); });
  // 슬라이드 2~: 차트 (2개씩)
  for(var ci=0;ci<imgs.length;ci+=2){
    var s=p.addSlide(); s.addText('차트',{x:0.5,y:0.3,w:12,h:0.4,fontSize:18,bold:true,color:BDc});
    for(var j=0;j<2 && ci+j<imgs.length;j++){ var im=imgs[ci+j]; var x=0.5+j*6.4;
      s.addText(im.title,{x:x,y:0.95,w:6.0,h:0.3,fontSize:13,bold:true,color:'2D6FD4'});
      try{ s.addImage({data:im.src,x:x,y:1.3,w:6.0,h:4.5,sizing:{type:'contain',w:6.0,h:4.5}}); }catch(e){} }
  }
  // 결과표 슬라이드 (행 많으면 분할)
  var hdr=['사이클','REQ','TC ID','시험명','결과'].map(function(t){ return {text:t,options:{bold:true,fill:'F4F5F7',fontSize:10,color:BDc,border:{type:'solid',color:'CCCCCC',pt:0.5},align:'center'}}; });
  var rows=items.map(function(it){ var rq=(reqList||[]).find(function(x){return x.id===it.req_id;}); var v=_rptVerdict(it); var vc={pass:'00A872',fail:'E53E5A',pending:'888888',exclude:'C9923E'}[v]||'555555';
    return [it._cycle||'',(rq&&rq.reqid)||it.req_id||'',it.tcid||'',it.name||'',(vmap[v]||v)].map(function(t,k){ return {text:String(t),options:{fontSize:9,color:(k===4?vc:BDc),bold:(k===4),border:{type:'solid',color:'DDDDDD',pt:0.5},valign:'middle'}}; }); });
  var PER=_RPT_PPT_PER;
  for(var r=0;r<rows.length;r+=PER){ var st=p.addSlide(); st.addText('결과 ('+items.length+'건)'+(rows.length>PER?(' '+(Math.floor(r/PER)+1)):''),{x:0.5,y:0.3,w:12,h:0.4,fontSize:16,bold:true,color:BDc});
    st.addTable([hdr].concat(rows.slice(r,r+PER)),{x:0.4,y:0.85,w:12.5,colW:[2.2,2.0,2.5,4.3,1.5],border:{type:'solid',color:'DDDDDD',pt:0.5},valign:'middle'}); }
  try{ await p.writeFile({fileName:'시험결과보고서_'+(typeof _nowStr==='function'?_nowStr().replace(/[:\s]/g,''):'')+'.pptx'}); showToast('✅ PPTX 생성 완료'); }catch(e){ showToast('PPTX 저장 오류: '+e.message); }
}
function reportExportExcel(){ _rptExportCSV(); }

function _rptExportCSV(){
  const items=_rptFiltered(); if(!items.length){ showToast('내보낼 데이터가 없습니다'); return; }
  const vmap={pass:'합격',fail:'불합격',pending:'예정',exclude:'제외'};
  const head=['사이클','REQ','TC ID','시험명','심각도','모델','버전','결과','실행일'];
  const rows=items.map(it=>{ const rq=reqList.find(x=>x.id===it.req_id); return [it._cycle,(rq&&rq.reqid)||it.req_id||'',it.tcid||'',it.name||'',it.severity||'',it._model||'',it._version||'',vmap[_rptVerdict(it)]||_rptVerdict(it),_rptItemDate(it)]; });
  const csv=[head].concat(rows).map(r=>r.map(c=>'"'+String(c==null?'':c).replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const blob=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='test-report.csv'; document.body.appendChild(a); a.click(); a.remove();
  showToast('CSV 내보내기 완료 ('+items.length+'건)');
}
