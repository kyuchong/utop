function tcRenderTCList(reqsOverride){
  const wrap=document.getElementById('tc3-list');
  if(!wrap) return;
  const t3title=document.getElementById('tc3-title');

  // tcid로 풀 데이터 찾기 (tcList 우선, 없으면 ref)
  const getFullTC=(ref, reqId)=>{
    const full=tcList.find(t=>t.tcid===ref.tcid||t.id===ref.tcid);
    if(full) return {...ref,...full, req_id:full.req_id||reqId};
    return {...ref, req_id:reqId};
  };

  // TC 소스 결정
  let baseTCs=[];
  if(tcSelReqId){
    const r=reqList.find(x=>x.id===tcSelReqId);
    if(!r){ wrap.innerHTML=''; return; }
    const fromList=tcList.filter(t=>t.req_id===r.id||t.req_id===r.reqid);
    const fromRefs=(r.tc||[]).map(ref=>getFullTC(ref, r.id));
    const seen=new Set();
    baseTCs=[...fromList,...fromRefs].filter(t=>{const k=t.tcid||t.id||'';if(!k||seen.has(k))return false;seen.add(k);return true;});
    if(t3title) t3title.textContent=r.reqid+' TC';
  } else if(reqsOverride){
    const seen=new Set();
    reqsOverride.forEach(r=>{
      const fromList=tcList.filter(t=>t.req_id===r.id||t.req_id===r.reqid);
      const fromRefs=(r.tc||[]).map(ref=>getFullTC(ref, r.id));
      [...fromList,...fromRefs].forEach(t=>{
        const k=t.tcid||t.id||'';
        if(k&&!seen.has(k)){seen.add(k);baseTCs.push(t);}
      });
    });
    if(t3title) t3title.textContent='TC 전체';
  } else if(tcSelFolderId){
    const fids=tcFolderMode==='all'?tcGetAllFolderIds(tcSelFolderId):[tcSelFolderId];
    const reqs=reqList.filter(r=>fids.includes(r.folder));
    const seen=new Set();
    reqs.forEach(r=>{
      const fromList=tcList.filter(t=>t.req_id===r.id||t.req_id===r.reqid);
      const fromRefs=(r.tc||[]).map(ref=>getFullTC(ref, r.id));
      [...fromList,...fromRefs].forEach(t=>{
        const k=t.tcid||t.id||'';
        if(k&&!seen.has(k)){seen.add(k);baseTCs.push(t);}
      });
    });
    if(t3title) t3title.textContent='TC 전체';
  } else {
    wrap.innerHTML='<div style="padding:30px;text-align:center;color:var(--text3);font-size:13px;">폴더를 선택하세요</div>';
    return;
  }

  // 3열 필터 적용
  const search=(document.getElementById('tc3-search')?.value||'').toLowerCase();
  const fSev=document.getElementById('tc3-filter-severity')?.value||'';
  const fStatus=document.getElementById('tc3-filter-status')?.value||'';
  const fProduct=document.getElementById('tc3-filter-product')?.value||'';
  let tcs=[...baseTCs];
  if(search) tcs=tcs.filter(t=>(t.tcid||'').toLowerCase().includes(search)||(t.name||'').toLowerCase().includes(search));
  if(fSev) tcs=tcs.filter(t=>t.severity===fSev);
  if(fStatus) tcs=tcs.filter(t=>t.status===fStatus);
  if(fProduct) tcs=tcs.filter(t=>(t.products||[]).includes(fProduct));

  const cntEl=document.getElementById('tc3-count');
  if(cntEl) cntEl.textContent=tcs.length+'개';
  const sevColor={'Critical':'var(--red)','Major':'#e8820c','Normal':'var(--blue)','Minor':'var(--green)','Cosmetic':'var(--text3)'};

  if(!tcs.length){
    wrap.innerHTML='<div style="padding:30px;text-align:center;color:var(--text3);font-size:13px;">TC가 없습니다'+(tcSelReqId?'<br><button onclick="tcAddNewTC(\''+tcSelReqId+'\')" style="margin-top:8px;font-size:12px;padding:5px 12px;border-radius:6px;border:1.5px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;"><i class="ti ti-plus"></i> TC 추가</button>':'')+'</div>';
    return;
  }
  wrap.innerHTML=tcs.map(t=>{
    const tcid=t.tcid||t.id||'';
    const isOpen=tcSelTcId===tcid;
    const linkedReq=reqList.find(r=>r.id===t.req_id);
    // 풀 TC 데이터 (tcList에서 찾기)
    const fullTC=tcList.find(x=>(x.tcid===tcid)||(x.id===tcid))||t;
    return '<div id="tc3-item-'+tcid+'">'+
      '<div onclick="tcToggleTCDetail(\''+tcid+'\')" style="display:flex;align-items:flex-start;gap:8px;padding:11px 14px;border-bottom:1px solid #f0f0f0;cursor:pointer;background:'+(isOpen?'rgba(45,111,212,0.05)':'')+';border-left:3px solid '+(isOpen?'var(--blue)':'transparent')+';">'+
        '<i class="ti ti-chevron-right" style="font-size:13px;color:'+(isOpen?'var(--blue)':'var(--text3)')+';flex-shrink:0;margin-top:4px;transition:transform 0.15s;'+(isOpen?'transform:rotate(90deg)':'')+'"></i>'+
        '<div style="flex:1;min-width:0;">'+
          '<div style="font-family:monospace;font-size:11px;color:var(--blue);font-weight:700;margin-bottom:3px;display:flex;align-items:center;gap:5px;"><span>'+tcid+'</span><i class="ti ti-pencil" title="TC ID 수정" onclick="event.stopPropagation();tcRenameId(\''+tcid+'\')" style="font-size:12px;color:var(--text3);cursor:pointer;opacity:.6;"></i></div>'+
          '<div style="display:flex;align-items:flex-start;gap:8px;">'+
            '<div style="flex:1;font-size:13px;color:var(--text);line-height:1.5;word-break:break-word;">'+(t.name||'')+'</div>'+
            '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0;min-width:60px;">'+
              (t.severity?'<span style="font-size:11px;padding:2px 7px;border-radius:5px;color:'+(sevColor[t.severity]||'#aaa')+';font-weight:600;border:1px solid currentColor;white-space:nowrap;">'+t.severity+'</span>':'')+
              (t.status?'<span style="font-size:11px;padding:2px 7px;border-radius:5px;background:#f5f5f5;color:var(--text3);white-space:nowrap;">'+t.status+'</span>':'')+
            '</div>'+
          '</div>'+
        '</div>'+
      '</div>'+
      '<div id="tc3-detail-'+tcid+'" style="'+(isOpen?'':'display:none;')+'border-bottom:2px solid rgba(45,111,212,0.12);background:#fafbfc;">'+
        (isOpen?tcBuildDetail(fullTC):'')+
      '</div>'+
    '</div>';
  }).join('');
}
async function tcToggleTCDetail(tcid){
  if(tcSelTcId===tcid){ tcSelTcId=null; tcRenderTCList(null); return; }
  tcSelTcId=tcid;

  // tcList에서 풀 데이터 찾기
  let fullTC=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid));

  // 서버에서 로드 시도
  try{
    const r=await fetch('/api/tc/'+_tcUrl(tcid));
    if(r.ok){
      const data=await r.json();
      if(data&&(data.tcid||data.id)){
        const idx=tcList.findIndex(t=>t.tcid===tcid||t.id===tcid);
        const merged={...(fullTC||{}), ...data};
        if(idx>=0) tcList[idx]=merged; else tcList.push(merged);
        fullTC=tcList.find(t=>t.tcid===tcid||t.id===tcid);
      }
    } else if(r.status===404&&fullTC){
      // TC 파일 없음 → 기본값으로 파일 생성
      const base={
        ...fullTC,
        tcid: fullTC.tcid||tcid,
        status: fullTC.status||'대기',
        severity: fullTC.severity||'Normal',
        products: fullTC.products||[],
        steps: fullTC.steps||[],
        issue_list: fullTC.issue_list||[],
        result_history: fullTC.result_history||[],
        traffic: fullTC.traffic||{},
        object: fullTC.object||'',
        precondition: fullTC.precondition||'',
        created_at: fullTC.created_at||new Date().toISOString().slice(0,10),
        updated_at: new Date().toISOString().slice(0,10),
      };
      await saveTCFile(base);
      const idx=tcList.findIndex(t=>t.tcid===tcid||t.id===tcid);
      if(idx>=0) tcList[idx]=base; else tcList.push(base);
      fullTC=base;
    }
  }catch(e){ console.warn('TC 로드 실패:', tcid, e); }

  tcRenderTCList(null);
}

function tcBuildDetail(tc){
  const tcid=tc.tcid||tc.id||'';
  const curTab=window['tcActiveTab_'+tcid]||'info';
  const steps=tc.steps||[];
  const tabs=[
    {id:'info',label:'Information',icon:'ti-info-circle'},
    
    {id:'env',label:'Test Environments',icon:'ti-topology-star'},
    {id:'traffic',label:'Traffic Generator',icon:'ti-antenna'},
    {id:'procedure',label:'시험 절차',icon:'ti-list-check',badge:(function(){
      // checks 배열이 실제 로드돼 있으면 그 결과(0 포함)를 신뢰. 배열 자체가 없을 때만 서버 메타 fallback.
      if(Array.isArray(tc.checks)) return tc.checks.filter(x=>(x.kind||'cli')==='cli').length;
      if(typeof tc._cli_count==='number') return tc._cli_count;
      if(typeof tc._checks_count==='number') return tc._checks_count;
      return steps.length;
    })()},
    {id:'issue',label:'Issue Tracker',icon:'ti-bug'},
    {id:'history',label:'Test Result History',icon:'ti-history',badge:(function(){
      // 상단 History 탭 배지 = 실제 서버 이력(_runHistory[tcid]) 개수와 동일.
      // 미로드 상태면 서버에서 지연 로드 → 완료 후 _forceRerenderHistory 로 재렌더.
      try{
        if(typeof _runHistoryLoaded!=='undefined' && !_runHistoryLoaded[tcid] && typeof _loadRunHistoryFromServer==='function'){
          _loadRunHistoryFromServer(tcid);
        }
        var _rh=(typeof _runHistory!=='undefined'&&_runHistory&&Array.isArray(_runHistory[tcid]))?_runHistory[tcid]:null;
        if(_rh) return _rh.length||0;
      }catch(_e){}
      return 0;
    })()},
    {id:'cycle',label:'Cycle Result',icon:'ti-recycle',badge:(function(){
      // 이 TC 가 포함된 사이클 개수
      try{
        if(typeof cycleList!=='undefined'&&Array.isArray(cycleList)){
          var n=0; cycleList.forEach(function(cy){ if((cy.items||[]).some(function(it){return (it.tcid===tcid)||(it.id===tcid);})) n++; });
          return n;
        }
      }catch(_e){}
      return 0;
    })()},
  ];
  const tabBar=tabs.map(t=>'<div onclick="tcSwitchTab(\''+tcid+'\',\''+t.id+'\')" style="padding:8px 14px;font-size:12.5px;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0;border-bottom:2px solid '+(curTab===t.id?'var(--blue)':'transparent')+';color:'+(curTab===t.id?'var(--blue)':'var(--text2)')+';">'+t.label+(t.badge?'<span style="font-size:10px;padding:1px 5px;border-radius:6px;background:rgba(45,111,212,0.1);color:var(--blue);margin-left:4px;">'+t.badge+'</span>':'')+'</div>').join('');
  return '<div style="display:flex;overflow-x:auto;border-bottom:1px solid var(--border);background:#fafbfc;">'+tabBar+'</div>'+
    '<div style="padding:14px 16px;background:#fff;" id="tc3-tabcontent-'+tcid+'">'+tcTabContent(tc,curTab)+'</div>';
}

function tcSwitchTab(tcid, tab){
  window['tcActiveTab_'+tcid]=tab;
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid));
  if(!tc) return;
  const detailWrap=document.getElementById('tc3-detail-'+tcid);
  if(detailWrap) detailWrap.innerHTML=tcBuildDetail(tc);
  if(typeof _tcManExpImgObserveAll==='function') _tcManExpImgObserveAll();
}

function tcTabContent(tc, tab){
  if(tab==='info') return tcTabInfo(tc);
  if(tab==='env') return tcTabEnv(tc);
  if(tab==='topo') return tcTabTopo(tc);
  if(tab==='traffic') return tcTabTraffic(tc);
  if(tab==='procedure') return tcTabProcedure(tc);
  if(tab==='issue') return tcTabIssue(tc);
  if(tab==='history') return tcTabHistory(tc);
  if(tab==='cycle') return tcTabCycleHistory(tc);
  return tcTabInfo(tc);
}
// Cycle Result — 이 TC 가 사이클에서 실행된 이력. 어떤 사이클(프로젝트/제품군), 어떤 버전에서 언제, Pass/Fail 등을 표로 표시.
function tcTabCycleHistory(tc){
  const tcid=tc.tcid||tc.id||'';
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const cl=(typeof cycleList!=='undefined'&&Array.isArray(cycleList))?cycleList:[];
  const rows=[];
  cl.forEach(cy=>{ const it=(cy.items||[]).find(x=>(x.tcid===tcid)||(x.id===tcid)); if(it) rows.push({cy:cy,it:it}); });
  if(!rows.length) return '<div style="padding:24px;text-align:center;color:var(--text3);font-size:13px;"><i class="ti ti-recycle" style="font-size:22px;display:block;margin-bottom:8px;color:#c5cdd8;"></i>이 TC가 포함된 사이클이 없습니다.<div style="font-size:11px;margin-top:5px;">Cycle에서 이 TC를 사이클에 담아 실행하면 여기에 이력이 쌓입니다.</div></div>';
  // 최신 실행일 기준 내림차순 정렬
  rows.forEach(r=>{ var d=''; (r.it.steps||[]).forEach(s=>{ if(s.date&&String(s.date)>d) d=String(s.date); }); r._last=d||r.cy.created_at||''; });
  rows.sort((a,b)=>String(b._last||'').localeCompare(String(a._last||'')));
  const th='padding:8px 11px;background:#eef2f8;border-bottom:1px solid #d4dce8;font-size:11px;color:#5a6072;text-align:left;font-weight:800;white-space:nowrap;';
  const td='padding:8px 11px;border-bottom:1px solid #f0f2f5;font-size:12.5px;vertical-align:middle;';
  let h='<div style="font-size:12.5px;font-weight:700;margin-bottom:10px;color:var(--text2);"><i class="ti ti-recycle" style="color:#2d6fd4;"></i> 이 TC가 포함된 사이클 '+rows.length+'건</div>';
  h+='<table style="width:100%;border-collapse:collapse;"><thead><tr>'+['프로젝트','모델(제품군)','버전그룹','버전','진행','결과','Pass/Fail','최근 실행','실행자'].map(t=>'<th style="'+th+'">'+t+'</th>').join('')+'</tr></thead><tbody>';
  rows.forEach(r=>{
    const cy=r.cy, it=r.it;
    const cliSteps=(it.steps||[]).filter(s=>(s.cli||s.criteria||s.result));
    const pass=(it.steps||[]).filter(s=>s.result==='Pass').length;
    const fail=(it.steps||[]).filter(s=>s.result==='Fail').length;
    const ran=pass+fail;
    const st=fail>0?'Fail':(ran>0&&ran>=cliSteps.length?'Pass':(ran>0?'진행중':'예정'));
    const stColor=st==='Fail'?'#e53e5a':st==='Pass'?'#00a872':st==='진행중'?'#2d6fd4':'#8a909c';
    const _proj=(typeof cycleFolderList!=='undefined'&&Array.isArray(cycleFolderList))?cycleFolderList.find(f=>f.id===cy.folder_id):null;
    const _projName=(_proj&&_proj.name)?esc(_proj.name):'<span style="color:var(--text3);">-</span>';
    const _model=esc(cy.model||'-');
    const _vg=cy.version_group?esc(cy.version_group):'<span style="color:var(--text3);">-</span>';
    const _ver=cy.version?('<span style="font-family:monospace;font-weight:800;color:#7c3aed;background:rgba(124,58,237,0.12);border-radius:5px;padding:2px 8px;">'+esc(cy.version)+'</span>'):'<span style="color:var(--text3);">-</span>';
    const execr=esc(it.owner||cy.owner||'-');
    h+='<tr onmouseenter="this.style.background=\'#f8fafd\'" onmouseleave="this.style.background=\'\'">'
      +'<td style="'+td+'font-weight:700;color:#1c2030;">'+_projName+'</td>'
      +'<td style="'+td+'color:#3b4256;">'+_model+'</td>'
      +'<td style="'+td+'color:var(--text2);">'+_vg+'</td>'
      +'<td style="'+td+'">'+_ver+'</td>'
      +'<td style="'+td+'text-align:center;color:var(--text2);">'+ran+'/'+cliSteps.length+'</td>'
      +'<td style="'+td+'"><span style="font-size:11px;font-weight:800;color:'+stColor+';background:'+stColor+'1a;border-radius:6px;padding:2px 9px;">'+st+'</span></td>'
      +'<td style="'+td+'font-size:11.5px;"><span style="color:#00a872;font-weight:700;">'+pass+'</span> / <span style="color:#e53e5a;font-weight:700;">'+fail+'</span></td>'
      +'<td style="'+td+'font-size:11px;color:var(--text2);white-space:nowrap;">'+(esc(r._last)||'-')+'</td>'
      +'<td style="'+td+'font-size:11px;color:var(--text2);white-space:nowrap;">'+execr+'</td>'
      +'</tr>';
  });
  h+='</tbody></table>';
  return h;
}

function tcTabInfo(tc){
  const tcid=tc.tcid||tc.id||'';
  const fmtDate=d=>{if(!d)return'-';const dt=new Date(d);return isNaN(dt)?d:dt.toLocaleDateString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).replace(/\. /g,'/').replace('.','');};
  const _esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const creator=tc.created_by||tc.author||tc.owner||'–';
  const modifier=tc.updated_by||'–';
  const who=(nm,date)=>'<span style="font-size:12px;color:var(--text);font-weight:600;">'+_esc(nm)+'</span><span style="font-size:11px;color:var(--text3);margin-left:8px;">'+fmtDate(date)+'</span>';
  const row=(label,content)=>'<div style="display:flex;align-items:flex-start;padding:9px 0;border-bottom:1px solid #f5f5f5;"><div style="width:130px;flex-shrink:0;font-size:13px;color:#aaa;padding-top:2px;">'+label+'</div><div style="flex:1;">'+content+'</div></div>';
  // 모델그룹 · 모델명 — TC 추가 팝업과 동일한 소스(modelList/groupList). 편집 시 saveTCFieldById 로 저장.
  const _mList=(typeof modelList!=='undefined'&&Array.isArray(modelList))?modelList:[];
  const _gList=(typeof groupList!=='undefined'&&Array.isArray(groupList))?groupList:[];
  const _groupNames=(function(){
    var out=(_gList||[]).map(function(g){ return (typeof g==='string')?g:(g.name||g.group||g.id||''); }).filter(Boolean);
    if(!out.length){ var s=new Set(); _mList.forEach(function(m){ if(m&&m.group) s.add(m.group); }); out=Array.from(s); }
    return out.sort();
  })();
  const curMg=tc.modelGroup||'';
  const curModel=tc.model||'';
  const modelsInGroup=curMg?_mList.filter(m=>m&&m.group===curMg).map(m=>m.name).filter(Boolean).sort():[];
  const _selStyle='font-size:12px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);color:var(--text);outline:none;min-width:180px;';
  const mgSelId='tcinfo-mg-'+tcid, mSelId='tcinfo-m-'+tcid;
  const mgSel='<select id="'+mgSelId+'" onchange="_tcInfoMgChange(\''+_esc(tcid)+'\',this.value)" style="'+_selStyle+'">'
    +'<option value=""'+(curMg?'':' selected')+'>— 미지정 —</option>'
    +_groupNames.map(function(g){ return '<option'+(g===curMg?' selected':'')+'>'+_esc(g)+'</option>'; }).join('')+'</select>';
  const mSel='<select id="'+mSelId+'" onchange="_tcInfoModelChange(\''+_esc(tcid)+'\',this.value)"'+(curMg?'':' disabled')+' style="'+_selStyle+(curMg?'':';opacity:0.55')+'">'
    +'<option value=""'+(curModel?'':' selected')+'>'+(curMg?'— 선택 —':'— 모델그룹 먼저 선택 —')+'</option>'
    +modelsInGroup.map(function(n){ return '<option'+(n===curModel?' selected':'')+'>'+_esc(n)+'</option>'; }).join('')+'</select>';
  const cfHtml=renderCustomFieldsForTarget('tc', tc, (fid,val)=>saveTCCustomField(tcid,fid,val));
  return '<div style="padding:2px 0;">'+
    row('생성자','<span style="font-size:12px;color:var(--text);font-weight:600;">'+_esc(creator)+'</span>')+
    row('변경자','<span style="font-size:12px;color:var(--text);font-weight:600;">'+_esc(modifier)+'</span>')+
    row('생성일','<span style="font-size:12px;color:var(--text2);">'+fmtDate(tc.created_at)+'</span>')+
    row('변경일','<span style="font-size:12px;color:var(--text2);">'+fmtDate(tc.updated_at)+'</span>')+
    row('모델그룹',mgSel)+
    row('모델명',mSel)+
    cfHtml+
    '</div>';
}
// 모델그룹 변경 → 저장 + 모델명 옵션 갱신 (하위 모델 없으면 tc.model 도 비움)
async function _tcInfoMgChange(tcid,val){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc) return;
  tc.modelGroup=val||'';
  // 그룹 바뀌면 기존 모델명이 새 그룹에 없으면 비움
  const _mList=(typeof modelList!=='undefined'&&Array.isArray(modelList))?modelList:[];
  const _ms=val?_mList.filter(m=>m&&m.group===val).map(m=>m.name):[];
  if(tc.model && _ms.indexOf(tc.model)<0) tc.model='';
  tc.updated_at=new Date().toISOString().slice(0,10);
  try{ await saveTCFile(tc); }catch(_e){}
  // 모델명 셀렉트만 갱신 (전체 재렌더 시 편집중 셀 blur 부작용 방지 위해 국소 갱신)
  const mSel=document.getElementById('tcinfo-m-'+tcid);
  if(mSel){
    const _esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
    mSel.disabled=!val; mSel.style.opacity=val?'1':'0.55';
    mSel.innerHTML='<option value=""'+(tc.model?'':' selected')+'>'+(val?'— 선택 —':'— 모델그룹 먼저 선택 —')+'</option>'
      +_ms.sort().map(function(n){ return '<option'+(n===tc.model?' selected':'')+'>'+_esc(n)+'</option>'; }).join('');
  }
  // Step 세션 드롭다운이 모델그룹에 따라 필터되므로 스텝 그리드 재렌더
  try{ tcProcRefresh(tcid); }catch(_e){}
}
async function _tcInfoModelChange(tcid,val){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc) return;
  tc.model=val||'';
  tc.updated_at=new Date().toISOString().slice(0,10);
  try{ await saveTCFile(tc); }catch(_e){}
  try{ tcProcRefresh(tcid); }catch(_e){}
}

function tcTabEnv(tc){
  const tcid=tc.tcid||tc.id||'';
  setTimeout(()=>{ initTCTiny(tcid,'object'); initTCTiny(tcid,'precondition'); },140);  // 목적·사전조건 TinyMCE
  return '<div style="display:flex;flex-direction:column;gap:12px;">'+
    '<div><div style="display:flex;align-items:center;margin-bottom:4px;"><span style="font-size:12px;color:#aaa;flex:1;">Object <span style="color:#7a7f95;">(목적)</span></span><button onclick="tcLLMGen(\''+tcid+'\',\'object\')" style="font-size:10px;padding:2px 8px;border-radius:5px;border:1px solid rgba(157,123,255,0.35);background:rgba(157,123,255,0.08);color:#9d7bff;cursor:pointer;"><i class="ti ti-sparkles"></i> LLM</button></div><div id="tc-tiny-object-'+tcid+'" style="width:100%;"></div></div>'+
    '<div><div style="display:flex;align-items:center;margin-bottom:4px;"><span style="font-size:12px;color:#aaa;flex:1;">Pre-Condition <span style="color:#7a7f95;">(사전 준비 조건)</span></span><button onclick="tcLLMGen(\''+tcid+'\',\'precondition\')" style="font-size:10px;padding:2px 8px;border-radius:5px;border:1px solid rgba(157,123,255,0.35);background:rgba(157,123,255,0.08);color:#9d7bff;cursor:pointer;"><i class="ti ti-sparkles"></i> LLM</button></div><div id="tc-tiny-precondition-'+tcid+'" style="width:100%;"></div></div>'+
    '</div>';
}
function tcTabTopo(tc){
  const tcid=tc.tcid||tc.id||'';
  setTimeout(()=>{ loadDeviceData().then(()=>tcTopo2Refresh(tcid)); },120);  // 장비 카탈로그 로드 후 구성도 갱신
  return '<div><div style="font-size:12px;color:#aaa;margin-bottom:6px;">Test Diagram <span style="color:#7a7f95;">(시험 구성도 — 등록 장비 배치 + 결선)</span></div>'+renderTCTopo2(tcid)+'</div>';
}

function tcTabTraffic(tc){
  const tcid=tc.tcid||tc.id||'';
  _tcMeterInit(tc);
  setTimeout(function(){ if(typeof loadDeviceData==='function'){ loadDeviceData().then(function(){ tcMeterRenderStreams(tcid); }).catch(function(){ tcMeterRenderStreams(tcid); }); } else { tcMeterRenderStreams(tcid); } },60);
  var ports=(tc.meterCfg.ports||[]).join(',');
  return '<div style="display:flex;flex-direction:column;min-height:520px;">'+
    '<div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:12px;">'+
      '<i class="ti ti-router" style="font-size:18px;color:#7c3aed;"></i><b style="font-size:14px;">계측기 트래픽 스튜디오</b>'+
      '<span style="flex:1;"></span>'+
      '<button onclick="tcMeterConnect(\''+tcid+'\')" title="연결 + 시험포트 예약 확인" style="font-size:11px;font-weight:700;padding:6px 11px;border-radius:6px;border:1px solid #00a872;background:#fff;color:#00875a;cursor:pointer;"><i class="ti ti-plug-connected"></i> 연결</button>'+
      '<button onclick="tcMeterConnect(\''+tcid+'\',true)" title="잠긴 포트를 강제 점유 (잠금 세션에서 해제 후 예약)" style="font-size:11px;font-weight:700;padding:6px 11px;border-radius:6px;border:1px solid #e08a00;background:#fff;color:#c47a00;cursor:pointer;"><i class="ti ti-lock-open"></i> 강제</button>'+
      '<button onclick="tcMeterArp(\''+tcid+'\')" title="모든 스트림 Dst_Mac = Gateway MAC" style="font-size:11px;font-weight:700;padding:6px 11px;border-radius:6px;border:1px solid #7c3aed;background:#fff;color:#7c3aed;cursor:pointer;"><i class="ti ti-route"></i> ARP</button>'+
      '<button onclick="tcMeterCfgOpen(\''+tcid+'\')" title="큰 창으로 편집" style="font-size:11px;font-weight:700;padding:6px 11px;border-radius:6px;border:1px solid var(--border);background:#fff;color:#5a6376;cursor:pointer;"><i class="ti ti-maximize"></i> 확대</button>'+
    '</div>'+
    '<div id="tcm-conn-tab" style="margin-bottom:10px;"></div>'+
    '<div id="tcm-body-tab" style="flex:1;"></div>'+
  '</div>';
}

let _procCatLoaded=false;
let _ckCollapsed={};
let _modelCol={}; // Model 그룹 접힘 상태 (id→true=접힘)
function tcModelToggle(tcid,id){ _modelCol[id]=!_modelCol[id]; tcProcRefresh(tcid); }
let _blkCol={}; // IF/반복 블록 접힘 상태 (id→true=접힘)
function tcBlkToggle(tcid,id){ _blkCol[id]=!_blkCol[id]; tcProcRefresh(tcid); }
// 공통(맨 위 모델 미지정) 섹션에 모델명을 지정 → 최상단에 Model 헤더 삽입
async function tcModelSetCommon(tcid,value){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc||!Array.isArray(tc.checks)) return;
  if(!value||value==='공통') return; // 공통 유지
  tc.checks.unshift({id:'ck'+Date.now()+Math.floor(Math.random()*1000),kind:'model',modelName:value,indent:0});
  await saveTCFile(tc); tcProcRefresh(tcid);
}
// 모델 그룹 삭제 (헤더 + 하위 스텝 블록)
async function tcModelDel(tcid,id){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc||!Array.isArray(tc.checks)) return;
  const arr=tc.checks; const i=arr.findIndex(x=>x.id===id); if(i<0) return;
  _tcSnapshot(tcid);
  let j=i+1; while(j<arr.length && arr[j].kind!=='model') j++;
  const cnt=j-i-1;
  if(cnt>0 && !confirm('이 모델 그룹과 하위 스텝 '+cnt+'개를 삭제할까요?')) return;
  arr.splice(i, j-i);
  await saveTCFile(tc); tcProcRefresh(tcid);
}
// 모델그룹(헤더+스텝 전체) 복사 → 바로 아래에 새 그룹 생성(모델 미지정)
async function tcModelGroupCopy(tcid,id){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc||!Array.isArray(tc.checks)) return;
  const arr=tc.checks; const i=arr.findIndex(x=>x.id===id); if(i<0||arr[i].kind!=='model'){ if(typeof showToast==='function')showToast('모델그룹이 아닙니다'); return; }
  let j=i+1; while(j<arr.length && arr[j].kind!=='model') j++;
  const clone=arr.slice(i,j).map(function(c,idx){ var cc=JSON.parse(JSON.stringify(c)); cc.id='ck'+Date.now()+'_'+idx+'_'+Math.floor(Math.random()*100000); return cc; });
  clone[0].modelName=''; clone[0].model='';   // 새 그룹은 모델 미지정 → 사용자가 선택
  Array.prototype.splice.apply(arr,[j,0].concat(clone));
  await saveTCFile(tc); tcProcRefresh(tcid);
  if(typeof showToast==='function')showToast('모델그룹 복사됨 ('+(clone.length-1)+'스텝) — 새 그룹의 모델을 선택하세요');
}
// 이 모델 블록의 마지막 스텝 삭제
async function tcModelDelStep(tcid,id){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc||!Array.isArray(tc.checks)) return;
  const arr=tc.checks; const i=arr.findIndex(x=>x.id===id); if(i<0) return;
  let j=i+1; while(j<arr.length && arr[j].kind!=='model') j++;
  if(j-1<=i){ showToast('이 모델에 삭제할 스텝이 없습니다'); return; }
  arr.splice(j-1,1);
  await saveTCFile(tc); tcProcRefresh(tcid);
}function tcCkToggle(id){
  const open=_ckCollapsed[id]===false; _ckCollapsed[id]=open?true:false; // 기본 접힘, false만 펼침
  const nowOpen=_ckCollapsed[id]===false;
  const b=document.getElementById('ckbody-'+id), ic=document.getElementById('ckchev-'+id);
  if(b) b.style.display=nowOpen?'':'none';
  if(ic) ic.className='ti ti-chevron-'+(nowOpen?'down':'right');
}
function tcProcRefresh(tcid){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc) return;
  window._lastProcTcid=tcid;   // Step Ctrl+C/V 대상 추적
  // 전체 TC 를 초기 로드하므로 lazy loading 트리거 제거. checks 없으면 그냥 빈 배열로 렌더.
  if(!Array.isArray(tc.checks)) tc.checks=[];
  _varsRestore(tcid);
  // 스텝 실행 중(백그라운드) tcProcRefresh가 자주 호출되는데, 그 순간 사용자가 Test Step/Test Data
  // 셀을 편집하고 있으면 그 셀의 DOM은 건드리지 않는다(재렌더 자체를 스킵). 인위적으로 focus()를
  // 재호출해 포커스/커서를 복원하는 방식은 브라우저가 매번 그 요소로 스크롤을 맞추려 들어
  // 휠 스크롤이 안 먹거나 화면이 깜빡이는 부작용이 있었음 — 편집 중엔 아예 손대지 않는 게 근본 해결.
  // 편집 값은 onblur(tcCheckSave)에서 이미 저장되고, 그 저장이 다시 tcProcRefresh를 부르므로
  // 편집이 끝나는 순간(포커스가 셀을 벗어나는 순간) 최신 상태로 정상 반영된다.
  var _editing=false;
  try{
    var _ae=document.activeElement;
    if(_ae&&_ae.isContentEditable&&(_ae.dataset.descid||_ae.dataset.cliid)) _editing=true;
  }catch(e){}
  if(typeof _critViewRefresh==='function') _critViewRefresh();
  if(!_editing){
    const w3=document.getElementById('tc3-tabcontent-'+tcid); if(w3) w3.innerHTML=tcTabContent(tc,'procedure');
    const wt=document.getElementById('tmt-tabcontent-'+tcid); if(wt) wt.innerHTML=tcTabContent(tc,'procedure');
  }
  if(!_editing&&typeof expSel!=='undefined'&&expSel&&expSel.type==='tc'&&expSel.id===tcid&&typeof expRenderTCDetail==='function') expRenderTCDetail(tcid);
  else if(!_editing&&typeof window!=='undefined'&&window._rlsActiveTcid&&window._rlsActiveTcid===tcid&&typeof rlsRenderTcDetail==='function'){ try{ rlsRenderTcDetail(tcid); }catch(e){} }
  try{ if(!_editing&&typeof e3SelTc!=='undefined'&&e3SelTc===tcid&&typeof e3RenderDetail==='function'){ var _e3d=document.getElementById('e3-detail'); if(_e3d) e3RenderDetail(tcid); } }catch(e){}
  try{ if(!_editing&&typeof e3bTcInlineOpen!=='undefined'&&e3bTcInlineOpen===tcid&&typeof e3bTcInlineHtml==='function'){
    var _e3bw=document.getElementById('e3b-tc-inline-'+tcid);
    if(_e3bw){
      var _e3btd=_e3bw.querySelector('td');
      if(_e3btd){
        // 인라인 안에는 스크롤 컨테이너가 2겹(바깥 탭 영역 overflow-y + 안쪽 절차 테이블 .stepTbl overflow)
        // 있어 각각 위치를 기억해뒀다가 재렌더 후 복원.
        var _e3bScs=_e3btd.querySelectorAll('[style*="overflow-y"], .stepTbl');
        var _e3bScTops=[]; _e3bScs.forEach(function(el,i){ _e3bScTops.push(el.scrollTop); });
        _e3btd.innerHTML=e3bTcInlineHtml(tcid);
        var _e3bScs2=_e3btd.querySelectorAll('[style*="overflow-y"], .stepTbl');
        _e3bScs2.forEach(function(el,i){ if(_e3bScTops[i]) el.scrollTop=_e3bScTops[i]; });
      }
    }
  } }catch(e){}
  const _lg=document.getElementById('exec-log-body-'+tcid); if(_lg) _lg.scrollTop=_lg.scrollHeight;
  if(!_editing) _tcApplyPendFocus();   // Tab 등으로 예약된 셀 포커스 이동을 재렌더 후 적용(#2: Test Step→Tab→Test Data)
  if(typeof _tcManExpImgObserveAll==='function') _tcManExpImgObserveAll();   // 수동 스텝 Expected Result 이미지 리사이즈 감시 등록
  if(typeof _tcSyncStopBar==='function') _tcSyncStopBar();   // 실행 중 하단 stopbar 표시/숨김 자동 판단 (다른 TC 이동 시 잔재 방지)
}
const PROC_CHECK_TYPES=[['contains','출력 포함 (있으면 합격)'],['contains_all','모두 포함 (선택 줄·문구 전부)'],['notcontains','출력 없음 (있으면 불합격)'],['none','판정 안함 (조회만)']];
// Step 번호 카운트 대상: CLI / SNMP(전 종류) / 계측기 / Ping 만
const _CNT_ACT={'CLI':1,'모델 감지':1,'SNMP':1,'SNMP Public':1,'SNMP Private':1,'SNMP Set':1,'SNMP Trap':1,'SNMP 수동':1,'계측기':1,'Traffic Connect':1,'ARP Send':1,'Traffic Start':1,'Traffic Stop':1,'Traffic 조회':1,'Traffic Disconnect':1,'Ping':1};
function _isCountStep(c){ if(!c) return false; const k=c.kind||'cli'; if(k==='wait'||k==='connect'||k==='disconnect'||k==='call'||k==='manual') return true; return k==='cli'&&!!_CNT_ACT[c.action||'CLI']; }
function _ensureStepCss(){ if(document.getElementById('tc-step-style')) return; const s=document.createElement('style'); s.id='tc-step-style'; s.textContent='tr.stp-bp>td{background:#fff3cd !important;} tr.stp-bp{box-shadow:inset 4px 0 0 #f0b000 !important;} tr.stp-sk>td{background:#eceef1 !important;} tr.stp-sk{box-shadow:inset 4px 0 0 #aeb2bb !important;opacity:0.66;} tr.stp-sel>td{background:rgba(0,168,114,0.14) !important;} .stepTbl .descedit,.stepTbl input,.stepTbl textarea,.stepTbl [contenteditable="true"]{-webkit-user-select:text !important;user-select:text !important;} .stepTbl tbody td{vertical-align:middle;padding-top:1px !important;padding-bottom:1px !important;} .stepTbl tbody td .descedit{white-space:nowrap !important;overflow:hidden !important;text-overflow:ellipsis !important;line-height:1.32 !important;font-size:12.5px !important;font-weight:400 !important;color:#23272f !important;} .stepTbl tbody td .descedit[data-cliid]{color:#23272f !important;font-family:inherit !important;} .stepTbl tbody td select,.stepTbl tbody td input,.stepTbl tbody td span{font-size:12.5px !important;font-weight:400 !important;font-family:inherit !important;} .stepTbl tbody td .descedit.multiln{white-space:pre-wrap !important;overflow:visible !important;text-overflow:clip !important;word-break:break-word !important;line-height:1.4 !important;} .stepTbl thead th{font-size:12.5px !important;padding-top:3px !important;padding-bottom:3px !important;} @keyframes tcblink{0%,100%{background-color:#fff;color:#00a872;}50%{background-color:#00a872;color:#fff;}} .tcblink{animation:tcblink 0.8s ease-in-out infinite !important;}'; (document.head||document.body).appendChild(s); }
function tcTabProcedure(tc){
  const tcid=tc.tcid||tc.id||'';
  // 전체 TC 초기 로드로 전환 — lazy loading 제거. checks 없으면 빈 배열로 즉시 렌더.
  if(!Array.isArray(tc.checks)) tc.checks=[];
  _varsRestore(tcid);
  if(!_procCatLoaded&&(typeof deviceList==='undefined'||!deviceList.length)&&(typeof modelList==='undefined'||!modelList.length)){ _procCatLoaded=true; setTimeout(()=>{ loadDeviceData().then(()=>tcProcRefresh(tcid)); },20); }
  const allModels=[...new Set([].concat((typeof modelList!=='undefined'?modelList:[]).map(m=>m.name),(typeof deviceList!=='undefined'?deviceList:[]).map(d=>d.name)).filter(Boolean))];
  const modelChoices=['공통'].concat(labList.map(l=>l.name).filter(Boolean));
  const checks=tc.checks||[];
  _seqSel=_seqSel||{};
  if(checks.length&&!checks.find(c=>c.id===_seqSel[tcid])) _seqSel[tcid]=checks[0].id;
  const selId=_seqSel[tcid];
  const _seqCard=(c,i)=>{
    if((c.kind||'cli')==='wait'){ return '<div style="border:1px solid var(--border);border-radius:8px;padding:12px;background:#fff;"><div style="font-size:13px;font-weight:800;margin-bottom:10px;"><i class="ti ti-clock" style="color:#e8820c;"></i> 대기 스텝 #'+(i+1)+'</div><div style="font-size:11px;color:var(--text3);font-weight:600;margin-bottom:4px;">대기 시간(초)</div><input type="number" min="0" value="'+(parseInt(c.waitSec)||5)+'" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'waitSec\',this.value)" style="width:130px;font-size:14px;padding:8px 10px;border:1px solid var(--border);border-radius:7px;"><div style="font-size:11px;color:var(--text3);margin-top:9px;">전체 실행 시 이 지점에서 지정 시간만큼 대기합니다 (설정 반영·안정화).</div></div>'; }
    if((c.kind||'cli')==='group'){ return '<div style="border:1px solid var(--border);border-radius:8px;padding:12px;background:#fff;"><div style="font-size:13px;font-weight:800;margin-bottom:10px;"><i class="ti ti-folder" style="color:#7c3aed;"></i> 그룹 #'+(i+1)+'</div><div style="font-size:11px;color:var(--text3);font-weight:600;margin-bottom:4px;">그룹명</div><input value="'+(c.label||'').replace(/"/g,'&quot;')+'" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'label\',this.value)" placeholder="예: 환경 확인" style="width:100%;font-size:14px;padding:8px 10px;border:1px solid var(--border);border-radius:7px;box-sizing:border-box;"><div style="font-size:11px;color:var(--text3);margin-top:9px;">시퀀스를 구분하는 라벨입니다.</div></div>'; }
    if((c.kind||'cli')==='loop'){ return '<div style="border:1px solid var(--border);border-radius:8px;padding:12px;background:#fff;"><div style="font-size:13px;font-weight:800;margin-bottom:10px;"><i class="ti ti-repeat" style="color:#7c3aed;"></i> 반복 (Loop)</div><div style="font-size:11px;color:var(--text3);font-weight:600;margin-bottom:4px;">반복 횟수</div><input type="number" min="1" value="'+(parseInt(c.loopCount)||2)+'" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'loopCount\',this.value)" style="width:100px;font-size:14px;padding:8px 10px;border:1px solid var(--border);border-radius:7px;"> 회<div style="font-size:11px;color:var(--text3);margin-top:9px;line-height:1.5;">이 반복 안의 단계들을 N회 반복 실행합니다. <b>이 반복을 선택한 상태에서</b> [+ 명령] 등을 누르면 반복 안에 추가됩니다.</div></div>'; }
    if((c.kind||'cli')==='call'){
      const opts='<option value="">(절차 선택)</option>'+tcList.filter(t=>(t.tcid||t.id)!==(tc.tcid||tc.id)).map(t=>'<option value="'+t.tcid+'"'+(c.callTcid===t.tcid?' selected':'')+'>'+t.tcid+' · '+String(t.name||'').replace(/"/g,'&quot;')+'</option>').join('');
      const tgt=tcList.find(t=>t.tcid===c.callTcid);
      return '<div style="border:1px solid var(--border);border-radius:8px;padding:12px;background:#fff;">'
        +'<div style="font-size:13px;font-weight:800;margin-bottom:10px;"><i class="ti ti-subtask" style="color:#2d6fd4;"></i> 절차 호출 #'+(i+1)+'</div>'
        +'<div style="font-size:11px;color:var(--text3);font-weight:600;margin-bottom:4px;">대상 절차 (TC)</div>'
        +'<select onchange="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'callTcid\',this.value)" style="width:100%;font-size:13px;padding:7px 9px;border:1px solid var(--border);border-radius:7px;margin-bottom:10px;box-sizing:border-box;">'+opts+'</select>'
        +'<div style="font-size:11px;color:var(--text3);font-weight:600;margin-bottom:4px;">파라미터 (변수 전달)</div>'
        +'<input value="'+(c.callParams||'').replace(/"/g,'&quot;')+'" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'callParams\',this.value)" placeholder="예: host=${ip}, vlan=10" style="width:100%;font-size:12px;font-family:ui-monospace,monospace;padding:7px 9px;border:1px solid var(--border);border-radius:7px;box-sizing:border-box;margin-bottom:10px;">'
        +'<button onclick="tcCheckRun(\''+tcid+'\',\''+c.id+'\')" style="font-size:12px;padding:7px 16px;border-radius:6px;border:1px solid #2d6fd4;background:rgba(45,111,212,0.08);color:#2d6fd4;cursor:pointer;font-weight:700;"><i class="ti ti-player-play"></i> 절차 실행</button>'
        +(tgt?'<div style="font-size:10px;color:var(--text3);margin-top:8px;line-height:1.5;">'+tgt.tcid+'의 시퀀스('+((tgt.checks||[]).length)+'스텝)를 현재 변수 컨텍스트로 실행합니다. 파라미터는 변수로 주입되고, 절차의 추출 변수는 반환됩니다.</div>':'')
        +(c.output?'<div style="margin-top:10px;font-family:ui-monospace,monospace;font-size:11px;background:#0f1117;color:#cdd6f4;padding:8px 10px;border-radius:6px;white-space:pre-wrap;">'+_stripNoticeLines(String(c.output)).replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</div>':'')
      +'</div>';
    }
    const mSel='<select onchange="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'model\',this.value)" style="font-size:11px;padding:5px 4px;border:1px solid var(--border);border-radius:5px;flex-shrink:0;width:96px;">'+modelChoices.map(x=>'<option'+(((c.model||'공통')===x)?' selected':'')+'>'+x+'</option>').join('')+'</select>';
    const cliIn='<input id="cli-'+c.id+'" value="'+(c.cli||'').replace(/"/g,'&quot;')+'" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'cli\',this.value)" oncontextmenu="event.preventDefault();gpVarPick(this,\''+tcid+'\',\''+c.id+'\',\'cli\')" placeholder="show system" style="flex:1;min-width:90px;font-size:11px;font-family:monospace;padding:6px 7px;border:1px solid var(--border);border-radius:5px;background:#1e1e2e;color:#a6e3a1;outline:none;box-sizing:border-box;">';
    const ph=(c.type==='line')?'Flash Memory Size : 1 GB':(c.type==='lines')?'1,5 : UP':(c.type==='notcontains')?'있으면 불합격할 문구 (예: FAIL)':'찾을 문구 (예: Version)';
    const critIn=((c.type||'contains')==='contains_all')
      ?('<textarea id="crit-'+c.id+'" data-gp-crit="'+c.id+'" data-gp-tcid="'+tcid+'" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'criteria\',this.value)" placeholder="한 줄에 기준 하나씩" rows="1" style="flex:1.4;min-width:120px;font-size:11px;font-family:monospace;padding:6px 7px;border:1px solid var(--border);border-radius:5px;outline:none;box-sizing:border-box;resize:vertical;white-space:pre;">'+(c.criteria||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</textarea>')
      :('<input id="crit-'+c.id+'" data-gp-crit="'+c.id+'" data-gp-tcid="'+tcid+'" value="'+(c.criteria||'').replace(/"/g,'&quot;')+'" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'criteria\',this.value)" placeholder="'+ph+'" style="flex:1.4;min-width:120px;font-size:11px;padding:6px 7px;border:1px solid var(--border);border-radius:5px;outline:none;box-sizing:border-box;">');
    const tSel='<select onchange="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'type\',this.value)" style="font-size:11px;padding:5px 4px;border:1px solid var(--border);border-radius:5px;flex-shrink:0;width:160px;">'+PROC_CHECK_TYPES.map(t=>'<option value="'+t[0]+'"'+(((c.type||'contains')===t[0])?' selected':'')+'>'+t[1]+'</option>').join('')+'</select>';
    const del='<i class="ti ti-trash" onclick="tcCheckDel(\''+tcid+'\',\''+c.id+'\')" style="color:#ccc;cursor:pointer;font-size:14px;flex-shrink:0;" onmouseenter="this.style.color=\'var(--red)\'" onmouseleave="this.style.color=\'#ccc\'"></i>';
    const execBtn='<button onclick="tcCheckRun(\''+tcid+'\',\''+c.id+'\')" title="CLI 실행해 조회 결과 가져오기" style="font-size:11px;padding:6px 12px;border-radius:5px;border:1px solid var(--green);background:rgba(0,168,114,0.08);color:var(--green);cursor:pointer;font-weight:600;flex-shrink:0;white-space:nowrap;"><i class="ti ti-terminal-2"></i> 조회</button>';
    const out=_stripNoticeLines(c.output||''); const outEsc=out.replace(/&/g,'&amp;').replace(/</g,'&lt;');
    const outArea='<textarea id="ckout-'+c.id+'" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'output\',this.value)" placeholder="실행(조회) 결과를 붙여넣으세요" style="width:100%;font-size:11px;font-family:monospace;padding:6px 8px;border:1px solid var(--border);border-radius:5px;background:#0f1117;color:#cdd6f4;outline:none;resize:vertical;min-height:50px;box-sizing:border-box;line-height:1.4;">'+outEsc+'</textarea>';
    const lines=out.split(/\r?\n/).filter(l=>l.trim());
    const lineList=lines.length?'<div style="margin-top:5px;max-height:150px;overflow-y:auto;border:1px solid #2a2f3a;border-radius:5px;background:#0f1117;">'+lines.slice(0,300).map(l=>'<div onclick="tcCheckSetCrit(\''+tcid+'\',\''+c.id+'\',this.dataset.l)" data-l="'+l.replace(/"/g,'&quot;')+'" style="font-size:10.5px;font-family:ui-monospace,monospace;color:#cdd6f4;padding:3px 9px;border-bottom:1px solid #1b2029;cursor:pointer;white-space:pre;overflow:hidden;text-overflow:ellipsis;" onmouseenter="this.style.background=\'rgba(0,168,114,0.18)\';this.style.color=\'#fff\'" onmouseleave="this.style.background=\'\';this.style.color=\'#cdd6f4\'" title="클릭 → 판정기준에 입력">'+l.replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</div>').join('')+'</div>':'';
    const repN=parseInt(c.repeat)||1;
    const repCtl='<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:7px;font-size:11px;color:var(--text3);background:rgba(124,58,237,0.04);border:1px dashed rgba(124,58,237,0.25);border-radius:6px;padding:5px 8px;">'
      +'<i class="ti ti-repeat" style="font-size:14px;color:#7c3aed;"></i><span style="font-weight:700;color:#7c3aed;">반복</span>'
      +'<input type="number" min="1" value="'+repN+'" onchange="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'repeat\',this.value)" style="width:46px;font-size:11px;padding:3px 5px;border:1px solid var(--border);border-radius:5px;">회'
      +(repN>1?('<span style="color:#ccc;">|</span>간격<input type="number" min="0" value="'+(parseInt(c.interval)||1)+'" onchange="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'interval\',this.value)" style="width:42px;font-size:11px;padding:3px 5px;border:1px solid var(--border);border-radius:5px;">초<span style="color:#ccc;">|</span>판정<select onchange="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'repeatMode\',this.value)" style="font-size:11px;padding:3px 5px;border:1px solid var(--border);border-radius:5px;">'+[['everytime','매회 합격'],['mofn','N중 M회'],['stable','안정(동일)'],['counter','카운터 비교']].map(x=>'<option value="'+x[0]+'"'+((c.repeatMode||'everytime')===x[0]?' selected':'')+'>'+x[1]+'</option>').join('')+'</select>'+((c.repeatMode==='mofn')?('M<input type="number" min="1" value="'+(parseInt(c.mofn)||repN)+'" onchange="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'mofn\',this.value)" style="width:38px;font-size:11px;padding:3px 5px;border:1px solid var(--border);border-radius:5px;">'):'')):'<span style="color:#bbb;">(1 = 반복 없음)</span>')
    +'</div>';
    const varRow='<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:7px;font-size:11px;color:var(--text3);background:rgba(45,111,212,0.04);border:1px dashed rgba(45,111,212,0.25);border-radius:6px;padding:5px 8px;">'
      +'<i class="ti ti-variable" style="font-size:14px;color:#2d6fd4;"></i><span style="font-weight:700;color:#2d6fd4;">변수</span>'
      +'<input value="'+(c.extractVar||'').replace(/"/g,'&quot;')+'" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'extractVar\',this.value)" placeholder="변수명 (예: serial)" style="width:118px;font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:5px;">'
      +'<span style="color:#ccc;">=</span>'
      +'<input value="'+(c.extractRule||'').replace(/"/g,'&quot;')+'" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'extractRule\',this.value)" placeholder="키 또는 정규식 (예: Serial  /  Serial\\s*:\\s*(\\S+))" style="flex:1;min-width:150px;font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:5px;">'
      +'<span style="color:#bbb;font-size:10px;white-space:nowrap;">CLI·판정에 ${변수명} 사용</span>'
    +'</div>';
    const condRow='<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:7px;font-size:11px;color:var(--text3);background:rgba(232,130,12,0.05);border:1px dashed rgba(232,130,12,0.3);border-radius:6px;padding:5px 8px;">'
      +'<i class="ti ti-arrows-split-2" style="font-size:14px;color:#e8820c;"></i><span style="font-weight:700;color:#e8820c;">조건</span>'
      +'<input value="'+(c.condition||'').replace(/"/g,'&quot;')+'" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'condition\',this.value)" placeholder="비우면 항상 실행 (예: ${serial} != 빈값  /  ${ver} contains 2.6)" style="flex:1;min-width:170px;font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:5px;">'
      +'<span style="color:#bbb;font-size:10px;white-space:nowrap;">거짓이면 건너뜀</span>'
    +'</div>';
    const _imgs=Array.isArray(c.images)?c.images:[];
    const imgSection='<div style="margin-top:7px;">'
      +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:'+(_imgs.length?'6px':'0')+';">'
        +'<button onclick="tcStepImgAdd(\''+tcid+'\',\''+c.id+'\')" style="font-size:11px;padding:5px 11px;border-radius:6px;border:1px solid #c9b6f0;background:rgba(124,58,237,0.06);color:#7c3aed;cursor:pointer;font-weight:700;white-space:nowrap;"><i class="ti ti-photo-plus"></i> 이미지(OCR) 첨부</button>'
        +(_imgs.length?'<span style="font-size:10.5px;color:var(--text3);">'+_imgs.length+'장 · 학습 시 OCR 텍스트로 함께 저장됩니다</span>':'<span style="font-size:10.5px;color:#bbb;">시험 결과 스크린샷 첨부 → OCR 인식해 학습에 포함</span>')
      +'</div>'
      +(_imgs.length?('<div style="display:flex;flex-wrap:wrap;gap:7px;">'+_imgs.map(function(im,ii){return '<div style="border:1px solid var(--border);border-radius:7px;padding:5px;background:#fff;width:130px;box-sizing:border-box;">'
          +'<img src="'+(im.thumb||'')+'" style="width:118px;height:70px;object-fit:cover;border-radius:4px;cursor:pointer;display:block;" onclick="tcStepImgView(\''+tcid+'\',\''+c.id+'\','+ii+')" title="클릭 → 크게 보기 / OCR 텍스트 편집">'
          +'<div style="font-size:9px;color:var(--text3);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+String(im.name||'이미지').replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</div>'
          +'<div style="display:flex;align-items:center;justify-content:space-between;"><span style="font-size:9px;color:'+(im.text?'#7c3aed':'#bbb')+';">'+(im.text?('📷 '+String(im.text).replace(/\s+/g,'').length+'자'):'텍스트없음')+'</span><i class="ti ti-trash" onclick="tcStepImgDel(\''+tcid+'\',\''+c.id+'\','+ii+')" style="cursor:pointer;color:#c0c6d0;font-size:13px;" title="삭제"></i></div>'
        +'</div>';}).join('')+'</div>'):'')
    +'</div>';
    return '<div style="border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:8px;background:#fafbfc;">'+
      '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:7px;">'+
        '<span style="font-size:11px;color:var(--blue);font-weight:800;flex-shrink:0;">#'+(i+1)+'</span>'+
        '<span style="font-size:10px;color:var(--text3);flex-shrink:0;">모델</span>'+mSel+
        cliIn+execBtn+
        '<span style="font-size:10px;color:#00a872;font-weight:700;flex-shrink:0;">판정</span>'+critIn+
        '<span style="font-size:10px;color:var(--text3);flex-shrink:0;">타입</span>'+tSel+del+
      '</div>'+
      repCtl+
      varRow+
      condRow+
      '<div>'+
        '<div onclick="tcCkToggle(\''+c.id+'\')" style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12.5px;font-weight:700;color:var(--text2);background:#eef2f7;border:1px solid var(--border);border-radius:8px;padding:9px 12px;margin-bottom:5px;user-select:none;" onmouseenter="this.style.background=\'#e4e9f0\'" onmouseleave="this.style.background=\'#eef2f7\'">'+
          '<i id="ckchev-'+c.id+'" class="ti ti-chevron-'+(_ckCollapsed[c.id]===false?'down':'right')+'" style="font-size:18px;color:var(--text3);"></i>'+
          '<i class="ti ti-terminal-2" style="font-size:16px;color:var(--green);"></i>'+
          '조회 결과'+(out.trim()?' <span style="color:var(--green);">('+lines.length+'줄)</span>':' <span style="color:#bbb;font-weight:400;">(비어있음)</span>')+'<span style="flex:1;"></span>'+(out.trim()?'<button onclick="event.stopPropagation();tcCheckClearOut(\''+tcid+'\',\''+c.id+'\')" style="font-size:10px;padding:2px 9px;border-radius:5px;border:1px solid var(--border);background:#fff;color:var(--text3);cursor:pointer;margin-right:8px;">✕ 지우기</button>':'')+'<span style="color:var(--text3);font-size:11px;font-weight:600;">'+(_ckCollapsed[c.id]===false?'▾ 접기':'▸ 펼치기')+' · 줄 클릭→판정기준</span>'+
        '</div>'+
        '<div id="ckbody-'+c.id+'" style="'+(_ckCollapsed[c.id]===false?'':'display:none;')+'">'+(out.trim()?lineList:outArea)+'</div>'+
      '</div>'+
      '</div>';
  };
  // ── 세션 바 (Lab 장비 다중 세션) ──
  const _sessIds=(Array.isArray(tc.sessions)&&tc.sessions.length)?tc.sessions:(tc.sessionLabId?[tc.sessionLabId]:[]);
  const _sessCard=(labId,si)=>{ const l=labList.find(x=>x.id===labId)||null; const st=(l&&l.status)||'미확인'; const stc=st==='연결됨'?'#00a872':st==='실패'?'#e53e5a':st==='확인중'?'#f5b731':'#9aa0b8';
    return '<div oncontextmenu="event.preventDefault();tcSessConnMenu(event,\''+tcid+'\',\''+labId+'\')" title="우클릭 → 접속(콘솔)" style="display:flex;align-items:center;gap:6px;padding:4px 8px;border:1px solid var(--border);border-left:3px solid '+stc+';border-radius:8px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.05);min-width:150px;">'
      +'<span style="font-size:11px;font-weight:800;color:#2d6fd4;background:rgba(45,111,212,0.12);border-radius:6px;padding:2px 6px;flex-shrink:0;">S'+(si+1)+'</span>'
      +'<div style="min-width:0;flex:1;display:flex;flex-direction:column;line-height:1.3;">'
        +'<div style="display:flex;align-items:center;gap:2px;"><select onchange="tcSessionPick(\''+tcid+'\','+si+',this.value)" title="클릭하여 장비 선택" style="font-size:12.5px;font-weight:700;border:none;background:none;outline:none;cursor:pointer;color:var(--blue);padding:0;max-width:130px;appearance:none;-webkit-appearance:none;">'+(labList.length?'':'<option>(장비 없음)</option>')+labList.map(x=>'<option value="'+x.id+'"'+(x.id===labId?' selected':'')+'>'+(x.name||'(이름없음)')+'</option>').join('')+'</select><i class="ti ti-chevron-down" style="font-size:13px;color:var(--blue);pointer-events:none;flex-shrink:0;"></i></div>'
        +(function(){ var _p=String((l&&l.protocol)||'telnet').toLowerCase(); var _pc=_p==='ssh'?'#2d6fd4':_p==='telnet'?'#e8820c':_p==='snmp'?'#00a872':'#7c3aed'; return '<span style="font-size:9px;font-weight:800;color:'+_pc+';background:'+_pc+'18;border-radius:4px;padding:1px 5px;letter-spacing:.03em;flex-shrink:0;font-family:ui-monospace,monospace;">'+_p.toUpperCase()+'</span><span style="font-size:9.5px;color:var(--text3);font-family:ui-monospace,monospace;"> '+((l&&l.ip)||'IP 미설정')+'</span>'; })()
      +'</div>'
      +((l&&((l.role==='계측기')||(l.group==='계측기')||/spirent|stc|ixia/i.test(String(l.model||'')+' '+String(l.name||''))))?'<button onclick="event.stopPropagation();tcMeterCfgOpen(\''+tcid+'\')" title="계측기 트래픽 설정 (스트림)" style="width:23px;height:23px;border-radius:6px;border:1px solid #7c3aed;background:rgba(124,58,237,0.08);color:#7c3aed;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="ti ti-settings" style="font-size:13px;"></i></button>':'')
      +'<button onclick="tcSessionTestOne(\''+tcid+'\',\''+labId+'\')" title="연결 테스트" style="width:23px;height:23px;border-radius:6px;border:1px solid var(--green);background:rgba(0,168,114,0.08);color:var(--green);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="ti ti-bolt" style="font-size:13px;"></i></button>'
      +'<i class="ti ti-x" onclick="tcSessionRemove(\''+tcid+'\','+si+')" title="세션 제거" style="color:#ccc;cursor:pointer;font-size:15px;flex-shrink:0;" onmouseenter="this.style.color=\'var(--red)\'" onmouseleave="this.style.color=\'#ccc\'"></i>'
    +'</div>'; };
  const _sbCol=!!_sessBarCol[tcid];
  const sessionBar='<div style="border:1px solid var(--border);border-radius:10px;padding:11px 13px;margin-bottom:12px;background:linear-gradient(135deg,rgba(0,168,114,0.06),transparent);">'
    +'<div style="display:flex;align-items:center;gap:8px;'+((!_sbCol&&_sessIds.length)?'margin-bottom:9px;':'')+'"><i onclick="tcSessBarToggle(\''+tcid+'\')" title="접기/펴기" class="ti ti-caret-'+(_sbCol?'right':'down')+'-filled" style="cursor:pointer;font-size:15px;color:var(--green);flex-shrink:0;"></i><i class="ti ti-plug-connected" style="color:var(--green);font-size:17px;"></i><b style="font-size:12.5px;">세션 · 접속 장비</b><span style="font-size:11px;font-weight:600;color:var(--green);background:rgba(0,168,114,0.1);border-radius:8px;padding:1px 7px;">'+_sessIds.length+'</span><span style="flex:1;"></span><button onclick="tcSessAddPopup(\''+tcid+'\')" title="장비를 선택해 세션 추가" style="font-size:11px;padding:6px 12px;border-radius:6px;border:1px solid var(--green);background:#fff;color:var(--green);cursor:pointer;font-weight:700;"><i class="ti ti-plus"></i> 세션 추가 (장비 선택)</button></div>'
    +(_sbCol?'':(_sessIds.length?('<div style="display:flex;flex-wrap:wrap;gap:8px;">'+_sessIds.map((id,si)=>_sessCard(id,si)).join('')+'</div>'):(labList.length?'<div style="font-size:11px;color:var(--text3);padding:2px 0;"><i class="ti ti-arrow-up-right" style="font-size:12px;"></i> 세션 추가로 접속 장비를 연결하세요</div>':'<div style="font-size:11px;color:#c48a00;padding:2px 0;">Device Management → Device Registration에서 장비를 먼저 등록하세요</div>')))
  +'</div>';
  const _legacy=(tc.steps||[]).filter(s=>(s.device||s.cli||s.criteria||s.intent));
  const legacyHtml=_legacy.length?('<div style="margin-top:16px;border-top:1px dashed var(--border);padding-top:12px;"><div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:8px;"><i class="ti ti-history"></i> 기존 절차 (수기 '+_legacy.length+'개) <span style="font-size:10px;color:var(--text3);font-weight:400;">— 참고용(안전하게 보존됨). 위 판정 표로 옮기면 자동 판정됩니다</span></div>'+_legacy.map((s,i)=>'<div style="border:1px solid var(--border);border-radius:6px;padding:8px 10px;margin-bottom:6px;background:#fff;font-size:11px;line-height:1.5;"><b style="color:var(--blue);">#'+(i+1)+'</b> '+String(s.intent||s.device||'').replace(/</g,"&lt;")+(s.cli?'<div style="font-family:monospace;color:#a6e3a1;background:#1e1e2e;padding:3px 7px;border-radius:4px;margin-top:4px;">'+String(s.cli).replace(/</g,"&lt;")+'</div>':'')+(s.criteria?'<div style="color:var(--text2);margin-top:3px;">✓ '+String(s.criteria).replace(/</g,"&lt;")+'</div>':'')+'</div>').join('')+'</div>'):'';
  const _pv=_procVars[tcid]||{}; const _pvk=Object.keys(_pv);
  const varsBar='';   // 조건4: 변수 표시는 Response 패널의 변수 패널(_respVarPanel)로 이동
  const bb='border-bottom:1px solid #e1e4e9;border-right:1px solid #e7eaee;';
  const th=(t,al)=>'<th style="padding:6px 9px;text-align:'+(al||'left')+';font-size:12px;font-weight:700;color:#3a4254;background:#eef1f5;border-bottom:1px solid #c4cad3;border-right:1px solid #d7dbe2;">'+t+'</th>';
  const _indStep=16;
  const indPx=d=>(6+d*_indStep);
  let _maxDepth=0; { let _gi=0; (tc.checks||[]).forEach(c=>{ if((c.kind||'cli')==='group') _gi=1; const eff=_gi+(parseInt(c.indent)||0); if(eff>_maxDepth)_maxDepth=eff; }); }
  const _actW=140; // 모든 TC 동일 Action 폭(고정, Action 열=_actW-50=90px)
  const drag=c=>'<span draggable="true" ondragstart="tcSeqDrag(event,\''+c.id+'\')" style="cursor:grab;color:#d3d8e0;margin-right:5px;font-size:12px;">⠿</span>';
  const delI=c=>'';
  const numC=n=>'<td style="padding:2px 7px;text-align:left;font-size:10px;color:#8a909c;font-weight:700;white-space:nowrap;'+bb+'">'+(n||'')+'</td>';
  _ensureStepCss();
  const drop=c=>{ const _sl=(typeof _stepSel!=='undefined'&&Array.isArray((_stepSel||{})[tcid])&&_stepSel[tcid].indexOf(c.id)>=0); const _cls=((c.breakpoint?'stp-bp':(c.skip?'stp-sk':''))+(_sl?' stp-sel':'')).trim(); return ' data-sid="'+c.id+'"'+(_cls?' class="'+_cls+'"':'')+' ondragover="event.preventDefault()" ondrop="tcSeqDrop(event,\''+tcid+'\',\''+c.id+'\')"'; };
  let rowsHtml=''; let ind=0; let n=0; let _counters=[]; const _segs=[]; let _segMeta={id:null,model:'공통',isCommon:true}; let _curProcCollapsed=null; let _collapseId=null, _collapseIndent=0;
  // IF/반복 블록 접기 캐럿 (누르면 자식 단계 접힘 — 행 선택 안 함)
  const _blkCaret=cc=>'<i onclick="event.stopPropagation();tcBlkToggle(\''+tcid+'\',\''+cc.id+'\')" title="접기/펴기" class="ti ti-caret-'+(_blkCol[cc.id]?'right':'down')+'-filled" style="cursor:pointer;font-size:14px;color:#5c6bc0;flex-shrink:0;"></i>'+(_blkCol[cc.id]?'<span style="font-size:9px;color:var(--text3);font-style:italic;">접힘</span>':'');
  checks.forEach((c)=>{
    const k=c.kind||'cli'; n++;
    let nLabel=''; if(_isCountStep(c)){ const _lvl=Math.max(0,parseInt(c.indent)||0); _counters[_lvl]=(_counters[_lvl]||0)+1; _counters.length=_lvl+1; nLabel=_counters.map(x=>x||1).join('.'); }
    const _cIndent=Math.max(0,parseInt(c.indent)||0);
    if(_collapseId!=null){ if(_cIndent>_collapseIndent){ return; } _collapseId=null; }   // 접힌 IF/반복의 자식 행은 숨김(번호는 위에서 이미 매김 → 펼쳐도 동일)
    const sel=(typeof _stepSel!=='undefined'&&Array.isArray((_stepSel||{})[tcid])&&_stepSel[tcid].indexOf(c.id)>=0);
    const _bp=!!c.breakpoint; const _sk=!!c.skip; // 조건1 Breakpoint / 조건2 Skip
    const _exDone=!!(c.executed_at||c.repeatResult); // 실행 완료 여부 → 동그라미 색
    const _rr=c.repeatResult; // Pass/Fail
    const _circFill=(sel||_exDone)?'-filled':'';
    const _circCol=_sk?'#b0b4bc':(_rr==='Pass'?'#00a872':_rr==='Fail'?'#e53e5a':(_exDone?'#00a872':(sel?'#e0a800':'#cfd4de'))); // 스킵=회/합격=녹/불합격=적/완료=녹/선택=골드/미진행=회
    const _runCol=_rr==='Fail'?'#e53e5a':_exDone?'#00a872':'#2d6fd4';
    const _RUNNABLE={cli:1,connect:1,disconnect:1,call:1};
    const _runTd='<td style="text-align:center;padding:1px 2px;'+bb+'border-right:1px solid #eef0f3;'+(sel?'background:rgba(45,111,212,0.16);':'')+'">'+(_RUNNABLE[k]?'<button onclick="event.stopPropagation();tcCheckRun(\''+tcid+'\',\''+c.id+'\')" title="실행" style="font-size:11px;padding:2px 6px;border-radius:5px;border:1px solid '+_runCol+';background:'+(_exDone&&_rr!=='Fail'?'rgba(0,168,114,0.10)':'#fff')+';color:'+_runCol+';cursor:pointer;"><i class="ti ti-player-play"></i></button>':'')+'</td>';
    const _statTd='<td onclick="tcStepSelect(\''+tcid+'\',\''+c.id+'\',event)" title="'+(_exDone?'실행 완료':'미진행')+' · 클릭하여 선택" style="text-align:center;cursor:pointer;'+bb+'border-right:1px solid #dfe3e8;'+(sel?'background:rgba(45,111,212,0.16);':'')+'"><i class="ti ti-circle'+_circFill+'" style="font-size:13px;color:'+_circCol+';vertical-align:middle;"></i></td>';
    const _bpDot=_bp?'<i class="ti ti-point-filled" title="Breakpoint (여기서 멈춤)" style="color:#e53e5a;font-size:10px;margin-right:1px;vertical-align:middle;"></i>':'';
    const _nLab=_sk?('<span style="text-decoration:line-through;color:#aeb2bb;" title="Skip (건너뜀)">'+nLabel+'</span>'):nLabel;
    const _ndrag='onmousedown="tcStepDragStart(event,\''+tcid+'\',\''+c.id+'\')" onmouseenter="tcStepDragOver(\''+tcid+'\',\''+c.id+'\')"';
    // iTest식: 번호 왼쪽 상태 마크 — Skip(회색)·Breakpoint(갈색원)·오류/실패(빨간X)·설정있음(연필)
    const _isErr=(_rr==='Fail')||/^\s*\[(오류|ERROR|요청|실행 실패)/.test(String(c.output||''));
    const _hasCfg=(k==='cli')&&(((parseInt(c.repeat)||1)>1)||c.extractVar||c.condition||c.criteria||c.query||c.excludeLines||(Array.isArray(c.extracts)&&c.extracts.length));
    const _leftMark=_sk?'<i class="ti ti-ban" title="Skip — 건너뜀" style="color:#aeb2bb;font-size:11px;flex-shrink:0;"></i>':(_bp?'<i class="ti ti-point-filled" title="Breakpoint — 여기서 멈춤" style="color:#b45309;font-size:12px;flex-shrink:0;"></i>':(_isErr?'<i class="ti ti-circle-x-filled" title="오류/실패" style="color:#e53e5a;font-size:12px;flex-shrink:0;"></i>':(_hasCfg?'<i class="ti ti-pencil" title="이 스텝에 판정·추출·조건 등 설정 있음" style="color:#16a34a;font-size:11px;flex-shrink:0;"></i>':'')));
    const _numTd='<td '+_ndrag+' title="드래그로 여러 스텝 선택 · Shift/Ctrl 클릭 · 우클릭=Breakpoint/Skip" style="padding:0 5px;text-align:center;cursor:pointer;user-select:none;'+(sel?'background:rgba(45,111,212,0.16);':'')+bb+'"><span style="display:inline-flex;align-items:center;justify-content:center;gap:3px;">'+_leftMark+('<span title="'+(_exDone?'실행 완료':'미진행')+'" style="font-family:ui-monospace,monospace;font-size:10.5px;font-weight:700;color:'+((_circCol==='#cfd4de')?'#9aa1ad':_circCol)+';'+(_sk?'text-decoration:line-through;opacity:0.7;':'')+'">'+(nLabel||'·')+'</span>')+'</span></td>';
    const _descTd=(k==='cli')?('<td style="padding:2px 5px;'+bb+'"><div contenteditable="true" onclick="event.stopPropagation();_tcCellSelStep(\''+tcid+'\',\''+c.id+'\',event)" onbeforeinput="_tcNoEnterBreak(event)" onkeydown="var k=event.key,el=this;if(k===\'Tab\'&&!event.shiftKey){event.preventDefault();_tcFocusAfter(\''+tcid+'\',\''+c.id+'\',\'cli\');el.blur();}else if(k===\'Enter\'&&!event.shiftKey){event.preventDefault();el.blur();}else if(k===\'ArrowDown\'){if(_caretAtEnd(el)){event.preventDefault();tcCellNav(\''+tcid+'\',\''+c.id+'\',\'desc\',1);}}else if(k===\'ArrowUp\'){if(_caretAtStart(el)){event.preventDefault();tcCellNav(\''+tcid+'\',\''+c.id+'\',\'desc\',-1);}}" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'desc\',this.innerText.trim())" title="'+(c.desc||'').replace(/"/g,'&quot;')+'" data-descid="'+c.id+'" data-ph="＋ Test Step" class="descedit" style="width:100%;font-size:12px;color:#1c2030;font-weight:600;padding:2px 6px;outline:none;white-space:pre-wrap;overflow:hidden;text-overflow:ellipsis;line-height:1.7;min-height:0;">'+(c.desc||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</div></td>'):('<td onclick="tcStepSelect(\''+tcid+'\',\''+c.id+'\',event)" style="cursor:pointer;'+bb+'"></td>');
    const _chkTd='<td onclick="tcStepSelect(\''+tcid+'\',\''+c.id+'\',event)" title="'+(_exDone?'실행 완료':'미진행')+' · 클릭하여 선택" style="padding:0;'+bb+'border-left:4px solid '+_circCol+';cursor:pointer;'+(sel?'background:rgba(45,111,212,0.16);':'')+'"></td>';
    // iTest처럼 [상태 아이콘]·[Step 번호]·[접기 ˅] 세 칸 분리
    const _iconTd='<td '+_ndrag+' title="상태(오류·설정·Breakpoint·Skip)" style="padding:0 1px;text-align:center;cursor:pointer;user-select:none;'+(sel?'background:rgba(45,111,212,0.16);':'')+bb+'">'+(_leftMark||'')+'</td>';
    const _numTd2='<td '+_ndrag+' title="드래그=여러 선택 · Shift/Ctrl 클릭 · 우클릭=Breakpoint/Skip" style="padding:0 3px;text-align:center;cursor:pointer;user-select:none;'+(sel?'background:rgba(45,111,212,0.16);':'')+bb+'"><span title="'+(_exDone?'실행 완료':'미진행')+'" style="font-family:ui-monospace,monospace;font-size:10.5px;font-weight:700;color:'+((_circCol==='#cfd4de')?'#9aa1ad':_circCol)+';'+(_sk?'text-decoration:line-through;opacity:0.7;':'')+'">'+(nLabel||'·')+'</span></td>';
    const _collapseTd='<td style="padding:0 1px;text-align:center;'+(sel?'background:rgba(45,111,212,0.16);':'')+bb+'">'+(((k==='if'||k==='loop'))?('<i onclick="event.stopPropagation();tcBlkToggle(\''+tcid+'\',\''+c.id+'\')" title="접기/펴기" class="ti ti-caret-'+(_blkCol[c.id]?'right':'down')+'-filled" style="cursor:pointer;font-size:14px;color:#5c6bc0;"></i>'):((k==='cli')?('<i onclick="event.stopPropagation();tcStepDetailToggle(\''+tcid+'\',\''+c.id+'\')" title="이 스텝 세부내역(판정·결과) 펴기/접기" class="ti ti-caret-'+((typeof _respStepId!=='undefined'&&_respStepId[tcid]===c.id)?'down':'right')+'-filled" style="cursor:pointer;font-size:14px;color:#5c6bc0;"></i>'):''))+'</td>';
    const _numCell=_iconTd+_numTd2+_collapseTd;
    const _selDot='<i class="ti ti-circle'+_circFill+'" onclick="event.stopPropagation();tcStepSelect(\''+tcid+'\',\''+c.id+'\',event)" title="'+(_exDone?'실행 완료':'미진행')+' · 클릭하여 선택" style="font-size:13px;color:'+_circCol+';cursor:pointer;vertical-align:middle;margin-right:3px;"></i>';
    const _selHead=(ic,col,lab)=>'<span onclick="event.stopPropagation();tcStepSelect(\''+tcid+'\',\''+c.id+'\',event)" title="'+(_exDone?'실행 완료':'미진행')+' · 클릭하여 선택" style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;vertical-align:middle;">'+(ic?'<i class="ti '+ic+'" style="color:'+col+';font-size:14px;"></i>':'')+(lab?'<span style="font-size:12.5px;color:var(--text2);font-weight:600;">'+lab+'</span>':'')+'</span>';
    if(_curProcCollapsed && k!=='proc' && k!=='model'){ return; } // 접힌 Procedure의 하위 스텝 숨김
    if(k==='model'){ ind=0; _counters.length=0; _curProcCollapsed=null; _segs.push(Object.assign({},_segMeta,{rows:rowsHtml})); _segMeta={id:c.id,model:(c.modelName||''),isCommon:false}; rowsHtml=''; return; }
    if(k==='group'){ ind=1;
      rowsHtml+='<tr'+drop(c)+' style="background:'+(sel?'rgba(45,111,212,0.16)':'rgba(124,58,237,0.07)')+';">'+_numCell+'<td colspan="6" style="padding:7px 9px 7px '+indPx(parseInt(c.indent)||0)+'px;'+bb+'">'+_selHead('ti-folder','#7c3aed','')+' <input value="'+(c.label||'').replace(/"/g,'&quot;')+'" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'label\',this.value)" placeholder="단계 이름 (예: Step5 Interface 확인)" style="font-size:12.5px;font-weight:700;color:#7c3aed;border:none;background:none;outline:none;width:88%;"></td></tr>'; return; }
    if(k==='wait'){
      const _wRun=String(c.output||'').indexOf('대기')>=0 && String(c.output||'').indexOf('...')>=0;
      const _wDone=!!c.executed_at && !_wRun;
      const _wCol=_wRun?'#e8820c':(_wDone?'#e8820c':'#9aa1ad'); const _wTxt=_wRun?'대기중…':(_wDone?'완료':'미실행');
      rowsHtml+='<tr'+drop(c)+(sel?' style="background:rgba(45,111,212,0.16);"':'')+'>'+_numCell+'<td style="padding:6px 6px 6px '+indPx(ind+(parseInt(c.indent)||0))+'px;white-space:nowrap;'+bb+'">'+_selHead('ti-clock','#e8820c','대기 (Sleep)')+'</td><td colspan="4" style="padding:5px 6px;'+bb+'"><input type="number" min="0" value="'+(parseInt(c.waitSec)||5)+'" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'waitSec\',this.value)" style="width:60px;font-size:12px;padding:4px 6px;border:none;background:transparent;outline:none;"> 초</td><td id="stcell-'+c.id+'" style="padding:3px 3px;text-align:center;'+bb+'"><span style="display:inline-flex;align-items:center;gap:5px;white-space:nowrap;font-size:11px;font-weight:700;color:'+_wCol+';"><span style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:'+_wCol+';"></span>'+_wTxt+'</span></td></tr>'; return; }
    if(k==='manual'){
      const _mr=c.repeatResult;
      const _mCol=_mr==='Pass'?'#00a872':_mr==='Fail'?'#e53e5a':_mr==='N/A'?'#9aa1ad':'#c48a00';
      const _mSelRes='<select onclick="event.stopPropagation()" onchange="tcManualSetResult(\''+tcid+'\',\''+c.id+'\',this.value)" style="font-size:11px;font-weight:800;border:1px solid '+_mCol+';border-radius:6px;padding:3px 8px;background:'+_mCol+'14;color:'+_mCol+';cursor:pointer;outline:none;">'+['','Pass','Fail','N/A'].map(function(v){return '<option value="'+v+'"'+((_mr||'')===v?' selected':'')+'>'+(v?({'Pass':'✅ Pass','Fail':'❌ Fail','N/A':'– N/A'})[v]:'( 결과 선택 )')+'</option>';}).join('')+'</select>';
      const _mDesc='<div contenteditable="true" onclick="event.stopPropagation()" onbeforeinput="_tcNoEnterBreak(event)" onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();this.blur();}" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'desc\',this.innerText.trim())" data-ph="＋ 수행 방법 (예: 전면 LED 점등 상태를 육안으로 확인)" style="width:100%;font-size:12px;color:#1c2030;font-weight:600;padding:2px 6px;outline:none;white-space:pre-wrap;line-height:1.6;">'+(c.desc||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</div>';
      const _mNote='<div contenteditable="true" onclick="event.stopPropagation()" onbeforeinput="_tcNoEnterBreak(event)" onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();this.blur();}" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'output\',this.innerText.trim())" data-ph="확인 결과 · 비고" style="width:100%;font-size:11.5px;color:var(--text2);padding:2px 6px;outline:none;white-space:pre-wrap;line-height:1.6;">'+(c.output||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</div>';
      const _mImgW=parseInt(c.expected_img_w)||220, _mImgH=parseInt(c.expected_img_h)||140;
      const _mExpImg=c.expected_img?('<div class="tcManExpImgBox" data-tcid="'+tcid+'" data-ckid="'+c.id+'" onclick="event.stopPropagation()" style="position:relative;width:'+_mImgW+'px;height:'+_mImgH+'px;max-width:100%;overflow:visible;border-radius:5px;border:1px solid var(--border);margin-bottom:4px;">'
        +'<img src="'+c.expected_img+'" onclick="tcManualExpImgView(\''+tcid+'\',\''+c.id+'\')" title="테두리를 드래그해 가로/세로/모서리 크기 조절 · 클릭하여 크게 보기" style="width:100%;height:100%;object-fit:contain;cursor:zoom-in;display:block;background:#f8f9fb;border-radius:5px;">'
        +'<div class="tcManExpImgH" data-dir="e" onmousedown="tcManualExpImgResizeStart(event,\''+tcid+'\',\''+c.id+'\',\'e\')" style="position:absolute;top:0;right:-4px;width:8px;height:100%;cursor:ew-resize;"></div>'
        +'<div class="tcManExpImgH" data-dir="s" onmousedown="tcManualExpImgResizeStart(event,\''+tcid+'\',\''+c.id+'\',\'s\')" style="position:absolute;left:0;bottom:-4px;width:100%;height:8px;cursor:ns-resize;"></div>'
        +'<div class="tcManExpImgH" data-dir="se" onmousedown="tcManualExpImgResizeStart(event,\''+tcid+'\',\''+c.id+'\',\'se\')" style="position:absolute;right:-4px;bottom:-4px;width:13px;height:13px;cursor:nwse-resize;"></div>'
        +'</div>'):'';
      const _mExp='<div>'+_mExpImg+'<div contenteditable="true" onclick="event.stopPropagation()" onpaste="tcManualExpImgPaste(event,\''+tcid+'\',\''+c.id+'\')" onbeforeinput="_tcNoEnterBreak(event)" onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();this.blur();}" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'expected\',this.innerText.trim())" data-ph="＋ Expected Result (이미지 붙여넣기 가능)" style="width:100%;font-size:11.5px;color:#475063;padding:2px 6px;outline:none;white-space:pre-wrap;line-height:1.6;">'+(c.expected||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</div></div>';
      rowsHtml+='<tr'+drop(c)+' style="background:'+(sel?'rgba(45,111,212,0.16)':'rgba(196,138,0,0.06)')+';">'+_numCell
        +'<td style="padding:1px 4px;'+bb+'">'+_selHead('ti-hand-click','#c48a00','수동')+'</td>'
        +'<td style="padding:1px 3px;'+bb+'"></td>'
        +'<td style="padding:0 4px;'+bb+'">'+_mDesc+'</td>'
        +'<td style="padding:0 4px;'+bb+'">'+_mNote+'</td>'
        +'<td style="padding:0 4px;'+bb+'">'+_mExp+'</td>'
        +'<td style="padding:3px 6px;text-align:center;'+bb+'">'+_mSelRes+'</td></tr>'; return;
    }
    if(k==='connect'||k==='disconnect'){
      const isOpen=k==='connect'; const col=isOpen?'#0ea5e9':'#64748b';
      const icon=''; const lab=isOpen?'Session Open':'Session Closed';
      const mSel='<select onchange="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'session\',this.value)" style="font-size:11.5px;font-family:inherit;padding:2px 4px;border:none;background:transparent;outline:none;color:'+col+';font-weight:700;cursor:pointer;"><option value="">(세션 선택)</option>'+_sessIds.map((id,si)=>{const _sl=labList.find(x=>x.id===id);return '<option value="'+si+'"'+(String(c.session||'')===String(si)?' selected':'')+'>S'+(si+1)+(_sl?(' · '+String(_sl.name||'').replace(/</g,'&lt;')):'')+'</option>';}).join('')+'</select>';
      rowsHtml+='<tr'+drop(c)+' style="background:'+(sel?'rgba(45,111,212,0.16)':(isOpen?'rgba(14,165,233,0.07)':'rgba(100,116,139,0.07)'))+';">'+_numCell+'<td style="padding:1px 4px;'+bb+'">'+_actSelFull(tcid,c)+'</td><td colspan="5" style="padding:5px 6px;'+bb+'">'+mSel+'</td></tr>'; return;
    }
    if(k==='call'){ const _lprocs=(tc.checks||[]).filter(x=>(x.kind)==='proc'&&(x.name||'').trim()); const opts='<option value="">(호출 대상 선택)</option>'+(_lprocs.length?('<optgroup label="이 TC 프로시저">'+_lprocs.map(p=>'<option value="P:'+String(p.name||'').replace(/"/g,'&quot;')+'"'+(c.callProc===p.name?' selected':'')+'>▸ '+String(p.name||'').replace(/</g,'&lt;')+'</option>').join('')+'</optgroup>'):'')+'<optgroup label="다른 TC">'+tcList.filter(t=>(t.tcid||t.id)!==(tc.tcid||tc.id)).map(t=>'<option value="T:'+t.tcid+'"'+(c.callTcid===t.tcid?' selected':'')+'>'+t.tcid+'</option>').join('')+'</optgroup>';
      rowsHtml+='<tr'+drop(c)+(sel?' style="background:rgba(45,111,212,0.16);"':'')+'>'+_numCell+'<td style="padding:1px 4px;'+bb+'">'+_actSelFull(tcid,c)+'</td><td colspan="5" style="padding:5px 6px;'+bb+'"><select onchange="tcCallPick(\''+tcid+'\',\''+c.id+'\',this.value)" style="font-size:11.5px;padding:4px 4px;border:none;background:transparent;outline:none;width:45%;">'+opts+'</select> <input value="'+(c.callParams||'').replace(/"/g,'&quot;')+'" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'callParams\',this.value)" placeholder="파라미터 host=${ip}" style="font-size:11px;font-family:ui-monospace,monospace;padding:4px 6px;border:none;background:transparent;outline:none;width:50%;box-sizing:border-box;"></td></tr>'; return; }
    if(k==='loop'){
      const lm=c.loopMode||'count';
      const modeSel='<select onchange="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'loopMode\',this.value)" style="font-size:11px;border:none;background:transparent;outline:none;color:#7c3aed;font-weight:700;cursor:pointer;">'+[['count','횟수'],['for','For (변수 $)'],['infinite','지속'],['until','중단조건']].map(m=>'<option value="'+m[0]+'"'+(lm===m[0]?' selected':'')+'>'+m[1]+'</option>').join('')+'</select>';
      const _ni='font-size:11px;border:none;background:transparent;outline:none;border-bottom:1px solid #c9a6f0;text-align:center;';
      const detail=(lm==='for')
        ?('<span style="font-size:12px;color:#7c3aed;font-weight:800;">$</span><input value="'+String(c.loopVar||'i').replace(/"/g,'&quot;')+'" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'loopVar\',this.value)" placeholder="i" title="반복 변수명 — 명령에서 $이름 으로 사용 (예: gi0/$'+String(c.loopVar||'i')+')" style="width:38px;'+_ni+'font-weight:700;color:#7c3aed;"><span style="color:var(--text3);font-size:11px;">=</span><input type="number" value="'+(c.forFrom!=null&&c.forFrom!==''?c.forFrom:1)+'" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'forFrom\',this.value)" title="시작값" style="width:44px;'+_ni+'"><span style="color:var(--text3);font-size:12px;">→</span><input type="number" value="'+(c.forTo!=null&&c.forTo!==''?c.forTo:10)+'" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'forTo\',this.value)" title="끝값(포함)" style="width:44px;'+_ni+'"><span style="color:var(--text3);font-size:10.5px;">step</span><input type="number" value="'+(c.forStep!=null&&c.forStep!==''?c.forStep:1)+'" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'forStep\',this.value)" title="증가값" style="width:40px;'+_ni+'">')
        :(lm==='count')?('<input type="number" min="1" value="'+(parseInt(c.loopCount)||2)+'" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'loopCount\',this.value)" style="width:46px;'+_ni+'"> 회'):('<input value="'+String(c.loopBreak||'').replace(/"/g,'&quot;')+'" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'loopBreak\',this.value)" placeholder="'+(lm==='infinite'?'중단 조건(선택)':'중단 조건')+' 예: ${x}==done" style="font-size:11px;border:none;background:transparent;outline:none;border-bottom:1px dashed #c9a6f0;width:230px;">');
      const _hint=(lm==='for')?('— 들여쓴 단계에서 <b style="color:#7c3aed;">$'+String(c.loopVar||'i')+'</b> 사용 (예: gi0/$'+String(c.loopVar||'i')+')'):'— 아래 들여쓴 단계 반복';
      rowsHtml+='<tr'+drop(c)+' style="background:'+(sel?'rgba(45,111,212,0.16)':'rgba(124,58,237,0.06)')+';">'+_numCell+'<td colspan="6" style="padding:5px 6px 5px '+indPx(ind+(parseInt(c.indent)||0))+'px;'+bb+'"><div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">'+_selHead('ti-repeat','#7c3aed','반복')+'&nbsp;'+modeSel+detail+'<span style="font-size:10px;color:var(--text3);">'+_hint+'</span></div></td></tr>'; if(_blkCol[c.id]){_collapseId=c.id;_collapseIndent=_cIndent;} return;
    }
    if(k==='switch'){
      const cases=Array.isArray(c.cases)?c.cases:[];
      var _swGrp=''; try{ var _swTc=_tcById(tcid); var _swAr=(_swTc&&_swTc.checks)||[]; var _swIx=_swAr.findIndex(function(x){return x.id===c.id;}); for(var _swJ=_swIx-1;_swJ>=0;_swJ--){ if((_swAr[_swJ].kind||'cli')==='model'){ _swGrp=String(_swAr[_swJ].modelName||'').trim(); break; } } }catch(_e){}
      var _swMods=(_swGrp&&_swGrp!=='공통'&&typeof modelList!=='undefined')?modelList.filter(function(m){return m.group===_swGrp;}).map(function(m){return m.name;}):[];
      var _swEsc=function(x){return String(x==null?'':x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');};
      const caseRows=cases.map(function(cs,ci){
        var whenCtl=_swMods.length
          ? '<select onchange="tcSwitchSet(\''+tcid+'\',\''+c.id+'\','+ci+',\'when\',this.value)" title="'+_swGrp+' 그룹 모델" style="font-size:11px;border:none;border-bottom:1px solid #f0b8c0;background:transparent;outline:none;color:#1c2230;font-weight:600;cursor:pointer;"><option value="" style="color:#5a6376;background:#fff;">(모델 선택)</option>'+((cs.when&&_swMods.indexOf(cs.when)<0)?('<option selected style="color:#1c2230;background:#fff;">'+_swEsc(cs.when)+'</option>'):'')+_swMods.map(function(m){return '<option'+(m===cs.when?' selected':'')+' style="color:#1c2230;background:#fff;">'+_swEsc(m)+'</option>';}).join('')+'</select>'
          : '<input value="'+_swEsc(cs.when)+'" onblur="tcSwitchSet(\''+tcid+'\',\''+c.id+'\','+ci+',\'when\',this.value)" placeholder="값" style="width:80px;border:none;border-bottom:1px solid #f0b8c0;background:transparent;outline:none;">';
        return '<div style="display:flex;align-items:center;gap:4px;font-size:11px;margin-left:20px;"><span style="color:var(--text3);">when</span>'+whenCtl+'<span style="color:var(--text3);">→</span><input value="'+_swEsc(cs.goto)+'" onblur="tcSwitchSet(\''+tcid+'\',\''+c.id+'\','+ci+',\'goto\',this.value)" placeholder="단계 예 2 / 2.1" style="width:96px;border:none;border-bottom:1px solid #f0b8c0;background:transparent;outline:none;"> <i class="ti ti-x" onclick="tcSwitchDel(\''+tcid+'\',\''+c.id+'\','+ci+')" style="font-size:11px;color:#ccc;cursor:pointer;"></i></div>';
      }).join('');
      rowsHtml+='<tr'+drop(c)+' style="background:'+(sel?'rgba(45,111,212,0.16)':'rgba(229,62,90,0.05)')+';">'+_numCell+'<td colspan="6" style="padding:5px 6px 5px '+indPx(ind+(parseInt(c.indent)||0))+'px;'+bb+'"><div style="display:flex;flex-direction:column;gap:3px;"><div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">'+_selHead('ti-arrows-split-2','#e53e5a','Switch')+'&nbsp;<input id="swexpr-'+c.id+'" value="'+String(c.switchExpr||'').replace(/"/g,'&quot;')+'" oncontextmenu="tcSwitchVarMenu(event,\''+tcid+'\',\''+c.id+'\');return false;" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'switchExpr\',this.value)" placeholder="평가식/변수 (우클릭=변수)" title="우클릭 → 설정한 변수 선택 삽입" style="font-size:11px;border:none;border-bottom:1px solid #f0b8c0;background:transparent;outline:none;width:160px;"><button onclick="tcSwitchAdd(\''+tcid+'\',\''+c.id+'\')" style="font-size:10px;padding:1px 7px;border:1px solid #f0b8c0;border-radius:4px;background:#fff;color:#e53e5a;cursor:pointer;">+case</button></div>'+caseRows+_switchElseHtml(tcid,c)+'</div></td></tr>'; return;
    }
    if(k==='if'){
      var _ifv=c.repeatResult; var _ifBadge=(_ifv==='Pass'||_ifv==='Fail')?(' <span style="font-size:10px;font-weight:800;border-radius:5px;padding:1px 7px;'+(_ifv==='Pass'?'background:#e6f7ec;color:#16804a;':'background:#fdecec;color:#c0392b;')+'">'+(_ifv==='Pass'?'합격':'불합격')+'</span>'):'';
      var _ifSel=function(fld,dv){ var val=c[fld]||dv; var o=function(v,t){return '<option value="'+v+'"'+(val===v?' selected':'')+'>'+t+'</option>';}; return '<select onclick="event.stopPropagation()" onchange="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\''+fld+'\',this.value)" style="font-size:10.5px;border:1px solid #d8dee8;border-radius:5px;padding:1px 4px;background:#fff;cursor:pointer;flex-shrink:0;">'+o('Pass','✅ Pass')+o('Fail','❌ Fail')+o('info','• 정보')+o('Variable','🔧 Variable')+o('Command','▶ Command')+'</select>'; };
      var _ifMsg=function(fld,ph){ var _rf=(fld==='trueMsg')?(c.trueResult||'Pass'):(fld==='falseMsg')?(c.falseResult||'Fail'):''; var _phCmd=(_rf==='Command')?'CLI 명령 — 예: show system  · 여러 줄은 Enter로 구분, ${var} 사용 가능':ph; return '<input value="'+String(c[fld]||'').replace(/"/g,'&quot;')+'" data-iffld="'+c.id+'::'+fld+'" oncontextmenu="tcIfVarMenu(event,\''+tcid+'\',\''+c.id+'\',\''+fld+'\',false)" onclick="event.stopPropagation()" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\''+fld+'\',this.value)" placeholder="'+_phCmd+'" title="'+(_rf==='Command'?'실행할 CLI (현 IF의 대상 장비 세션에서 실행)':'우클릭=변수 삽입')+'" style="flex:1;min-width:120px;font-size:11px;border:none;border-bottom:1px solid #e3e7ee;background:'+(_rf==='Command'?'#fff9ec':'transparent')+';outline:none;'+(_rf==='Command'?'font-family:Consolas,monospace;color:#a15c00;':'')+'">'; };
      var _ifElSel=function(k,prop,val){ var o=function(v,t){return '<option value="'+v+'"'+((val||(prop==='falseResult'?'Fail':'Pass'))===v?' selected':'')+'>'+t+'</option>';}; return '<select onclick="event.stopPropagation()" onchange="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'elif'+k+'.'+prop+'\',this.value)" style="font-size:10.5px;border:1px solid #d8dee8;border-radius:5px;padding:1px 4px;background:#fff;cursor:pointer;flex-shrink:0;">'+o('Pass','✅ Pass')+o('Fail','❌ Fail')+o('info','• 정보')+o('Variable','🔧 Variable')+o('Command','▶ Command')+'</select>'; };
      var _ifElInp=function(k,prop,val,ph){ var f='elif'+k+'.'+prop; var _e=(Array.isArray(c.elifs)?c.elifs:[])[k]||{}; var _rf=(prop==='trueMsg')?_elifTR(_e):''; var _phCmd=(_rf==='Command')?'CLI 명령 — 예: show system  · 여러 줄은 Enter로 구분, ${var} 사용 가능':ph; return '<input value="'+String(val||'').replace(/"/g,'&quot;')+'" data-iffld="'+c.id+'::'+f+'" oncontextmenu="tcIfVarMenu(event,\''+tcid+'\',\''+c.id+'\',\''+f+'\',true)" onclick="event.stopPropagation()" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\''+f+'\',this.value)" placeholder="'+_phCmd+'" title="'+(_rf==='Command'?'실행할 CLI':'우클릭=변수 삽입')+'" style="font-size:11px;border:none;border-bottom:1px solid #e3e7ee;background:'+(_rf==='Command'?'#fff9ec':'transparent')+';outline:none;flex:1;min-width:100px;'+(_rf==='Command'?'font-family:Consolas,monospace;color:#a15c00;':'')+'">'; };
      var _elifHtml=(Array.isArray(c.elifs)?c.elifs:[]).map(function(e,k){
        return '<div style="margin:4px 0 0 26px;border-left:2px solid #e4d7fb;padding-left:8px;">'
          +'<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;"><span style="font-size:10.5px;font-weight:800;color:#7c3aed;flex-shrink:0;">ELIF'+(k+1)+'</span><span style="font-size:10px;color:var(--text3);">조건</span>'+_ifBuilder(tcid,c,k)+'<i class="ti ti-x" onclick="tcIfDelElif(\''+tcid+'\',\''+c.id+'\','+k+')" title="이 ELIF 삭제" style="font-size:13px;color:#b9818f;cursor:pointer;flex-shrink:0;margin-left:auto;"></i></div>'
          +'<div style="display:flex;align-items:center;gap:6px;margin-top:3px;"><span style="font-size:10.5px;font-weight:800;color:#16804a;flex-shrink:0;">True ▸</span>'+_ifElSel(k,'trueResult',_elifTR(e))+_ifElInp(k,'trueMsg',_elifTM(e),'참일 때 문구/대입')+'</div>'
          +'</div>'; }).join('')
        +'<div style="margin:3px 0 0 26px;"><button onclick="event.stopPropagation();tcIfAddElif(\''+tcid+'\',\''+c.id+'\')" title="ELIF 분기 추가" style="font-size:10px;padding:1px 9px;border:1px dashed #c9b6f0;border-radius:5px;background:#fff;color:#7c3aed;cursor:pointer;font-weight:700;">＋ ELIF</button></div>';
      rowsHtml+='<tr'+drop(c)+' style="background:'+(sel?'rgba(45,111,212,0.16)':'rgba(8,145,178,0.06)')+';">'+_numCell+'<td colspan="5" style="padding:5px 6px 5px '+indPx(ind+(parseInt(c.indent)||0))+'px;'+bb+'">'
        +'<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">'+_selHead('ti-arrows-split','#0891b2','IF')+'&nbsp;<span style="font-size:11px;color:var(--text3);">조건</span>'+_ifBuilder(tcid,c)+'</div>'
        +(_blkCol[c.id]?'':('<div style="display:flex;align-items:center;gap:6px;margin:4px 0 0 26px;"><span style="font-size:10.5px;font-weight:800;color:#16804a;flex-shrink:0;">True ▸</span>'+_ifSel('trueResult','Pass')+_ifMsg('trueMsg','참일 때 문구 — 예: ${query1} 일치 → Pass')+'</div>'
        +_elifHtml
        +'<div style="display:flex;align-items:center;gap:6px;margin:3px 0 0 26px;"><span style="font-size:10.5px;font-weight:800;color:#c0392b;flex-shrink:0;">False ▸</span>'+_ifSel('falseResult','Fail')+_ifMsg('falseMsg','거짓일 때 문구 — 예: ${query1} 불일치 → Fail')+'</div>'))
        +'</td><td style="text-align:center;vertical-align:middle;'+bb+'">'+_stCellInner(c,false)+'</td></tr>'; if(_blkCol[c.id]){_collapseId=c.id;_collapseIndent=_cIndent;} return;
    }
    if(k==='else'){
      rowsHtml+='<tr'+drop(c)+' style="background:'+(sel?'rgba(45,111,212,0.16)':'rgba(8,145,178,0.06)')+';">'+_numCell+'<td colspan="6" style="padding:5px 6px 5px '+indPx(ind+(parseInt(c.indent)||0))+'px;'+bb+'"><div style="display:flex;align-items:center;gap:6px;">'+_selHead('ti-corner-down-right','#0891b2','ELSE')+'<span style="font-size:10px;color:var(--text3);">바로 위 IF가 거짓일 때 → 아래 들여쓴 단계 실행</span></div></td></tr>'; return;
    }
    if(k==='comment'){
      rowsHtml+='<tr'+drop(c)+(sel?' style="background:rgba(45,111,212,0.16);"':' style="background:rgba(224,168,0,0.05);"')+'>'+_numCell+'<td colspan="6" style="padding:4px 6px 4px '+indPx(ind+(parseInt(c.indent)||0))+'px;'+bb+'"><div style="display:flex;align-items:center;gap:5px;">'+_selHead('ti-message-2','#d99a00','')+'<input value="'+(c.text||'').replace(/"/g,'&quot;')+'" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'text\',this.value)" placeholder="// 주석 — 이 아래에 명령을 두세요" style="flex:1;min-width:0;font-size:11.5px;font-style:italic;color:#8a6d12;font-weight:600;padding:3px 6px;border:none;background:transparent;outline:none;">'+delI(c)+'</div></td></tr>'; return; }
    if(k==='message'){
      // 메시지: 주석과 UI 구조는 유사하지만 색·아이콘·플레이스홀더가 다르고 실행/사이클 로그에 남는다(변수 치환).
      rowsHtml+='<tr'+drop(c)+(sel?' style="background:rgba(45,111,212,0.16);"':' style="background:rgba(8,145,178,0.06);"')+'>'+_numCell+'<td colspan="6" style="padding:4px 6px 4px '+indPx(ind+(parseInt(c.indent)||0))+'px;'+bb+'"><div style="display:flex;align-items:center;gap:5px;">'+_selHead('ti-messages','#0891b2','')+'<input value="'+(c.text||'').replace(/"/g,'&quot;')+'" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'text\',this.value)" placeholder="💬 메시지 — 변수 사용 가능: ${i}, ${var1}. 실행/사이클 로그에 남음" style="flex:1;min-width:0;font-size:11.5px;color:#075985;font-weight:700;padding:3px 6px;border:none;background:transparent;outline:none;">'+delI(c)+'</div></td></tr>'; return; }
    if(k==='proc'){ ind=0; _counters.length=0; const _pcol=(_procCol[c.id]===undefined)?true:_procCol[c.id];
      rowsHtml+='<tr'+drop(c)+' style="background:rgba(13,148,136,0.10);">'+_numCell+'<td colspan="6" style="padding:8px 10px;'+bb+'border-top:2px solid #0d9488;"><div style="display:flex;align-items:center;gap:7px;"><i onclick="event.stopPropagation();tcProcToggle(\''+tcid+'\',\''+c.id+'\')" class="ti ti-caret-'+(_pcol?'right':'down')+'-filled" style="cursor:pointer;font-size:15px;color:#0d9488;flex-shrink:0;"></i><span style="font-size:10.5px;font-weight:800;color:#0d9488;letter-spacing:0.5px;background:rgba(13,148,136,0.14);border-radius:5px;padding:2px 7px;">PROCEDURE</span><input value="'+(c.name||'').replace(/"/g,'&quot;')+'" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'name\',this.value)" placeholder="프로시저 이름 (예: Session_Open)" style="font-size:13px;font-weight:700;color:#0d9488;border:none;background:none;outline:none;flex:1;min-width:0;">'+(_pcol?'<span style="font-size:11px;color:var(--text3);font-style:italic;">▸ 접힘</span>':'')+'</div></td></tr>';
      _curProcCollapsed=_pcol?c.id:null; return; }
    // CLI: 명령 행 + 판정 행 (iTest command → analyze)
    const mSel='<select onchange="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'model\',this.value)" style="width:100%;font-size:11px;padding:3px 2px;border:none;border-radius:0;background:transparent;outline:none;">'+modelChoices.map(x=>'<option'+(((c.model||'공통')===x)?' selected':'')+'>'+x+'</option>').join('')+'</select>';
    const cliIn='<input value="'+(c.cli||'').replace(/"/g,'&quot;')+'" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'cli\',this.value)" placeholder="show system" style="width:100%;font-size:11.5px;font-family:ui-monospace,monospace;padding:4px 7px;border:none;border-radius:0;background:transparent;color:'+(_sk?'#aeb2bb':'var(--text)')+';'+(_sk?'text-decoration:line-through;':'')+'outline:none;box-sizing:border-box;">';
    const ph=(c.type==='line')?'예: Flash Memory : 1 GB':(c.type==='lines')?'행지정 : 문구  예) 1,5 : UP  /  2- : (빈값=존재만)':(c.type==='expr')?'예: ${SN1} == ${SN2}   (==, !=, >, <, 포함)':(c.type==='table')?'예) Port=Gi0/1,Gi0/2 => Status=connected Vlan=210':(c.type==='notcontains')?'있으면 불합격 (예: FAIL)':'찾을 문구 (예: Version)';
      const critIn=((c.type||'contains')==='contains_all')
        ?('<textarea data-gp-crit="'+c.id+'" data-gp-tcid="'+tcid+'" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'criteria\',this.value)" placeholder="한 줄에 기준 하나씩" rows="1" style="width:100%;font-size:11.5px;font-family:ui-monospace,monospace;padding:4px 7px;border:none;border-radius:0;background:transparent;outline:none;box-sizing:border-box;resize:vertical;white-space:pre;">'+(c.criteria||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</textarea>')
        :('<input data-gp-crit="'+c.id+'" data-gp-tcid="'+tcid+'" value="'+(c.criteria||'').replace(/"/g,'&quot;')+'" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'criteria\',this.value)" placeholder="'+ph+'" style="width:100%;font-size:11.5px;padding:4px 7px;border:none;border-radius:0;background:transparent;outline:none;box-sizing:border-box;">');
    const tSel='<select onmousedown="event.stopPropagation()" onclick="event.stopPropagation()" onchange="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'type\',this.value)" style="font-size:12px;font-weight:700;font-family:inherit;padding:3px 6px;min-width:128px;border:1px solid #c3c9d4;border-radius:5px;background:#fff;outline:none;margin-right:2px;color:#0d1320;cursor:pointer;">'+PROC_CHECK_TYPES.map(t=>'<option value="'+t[0]+'"'+(((c.type||'contains')===t[0])?' selected':'')+'>'+t[1]+'</option>').join('')+'</select>';
    const dotc=c.repeatResult==='Pass'?'#00a872':c.repeatResult==='Fail'?'#e53e5a':'#d5d9e0';
    const advOn=!!_ckAdv[c.id]; const advCount=((parseInt(c.repeat)||1)>1?1:0)+(c.extractVar?1:0)+(c.condition?1:0)+(c.excludeLines?1:0);
    const open=!!_stepOpen[c.id];
    const _cli1=((c.cli||'').split(/\r?\n/)[0]||'(명령 없음)');
    const _actOpts=[['CLI','CLI'],['Variable','Variable'],['모델 감지','모델 감지'],['DIFF','DIFF'],['SNMP Public','SNMP(RO)'],['SNMP Private','SNMP(RW)'],['SNMP Set','SNMP(Set)'],['SNMP Trap','SNMP(Trap)'],['SNMP 수동','SNMP(수동)'],['계측기','계측기'],['Traffic Connect','Traffic Connect'],['ARP Send','ARP Send'],['Traffic Start','Traffic Start'],['Traffic Stop','Traffic Stop'],['Traffic 조회','Traffic 조회'],['Traffic Disconnect','Traffic Disconnect'],['Ping','Ping'],['REST','REST']];
    const _curAct=(c.action==='SNMP')?'SNMP Public':(c.action||'CLI');
    const actSel='<select onmousedown="event.stopPropagation()" onclick="event.stopPropagation()" onchange="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'action\',this.value)" title="Action" style="width:auto;max-width:100%;font-size:13px;font-family:inherit;padding:2px 2px;border:none;border-radius:0;background:transparent;cursor:pointer;outline:none;font-weight:600;color:#1c1f27;">'+_actOpts.map(o=>'<option value="'+o[0]+'"'+((_curAct===o[0])?' selected':'')+'>'+o[1]+'</option>').join('')+'</select>';
    const mSelInline='<select onchange="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'model\',this.value)" title="Session(모델)" style="width:100%;font-size:11px;font-family:inherit;padding:2px 2px;border:none;border-radius:0;background:transparent;cursor:pointer;outline:none;font-weight:600;color:#1c1f27;">'+modelChoices.map(x=>'<option'+(((c.model||'공통')===x)?' selected':'')+'>'+x+'</option>').join('')+'</select>';
    const _tgl='onclick="event.stopPropagation();tcStepToggle(\''+tcid+'\',\''+c.id+'\')"';
    let _tdInner; const _act=c.action||'CLI';
    if(_act!=='Variable' && !String(c.desc||'').trim()){ _tdInner='<span onclick="event.stopPropagation()" title="Test Steps(설명)를 먼저 입력해야 Test Data를 입력할 수 있습니다" style="color:#b9a7d6;font-size:11px;font-style:italic;padding:0 7px;cursor:not-allowed;white-space:nowrap;">← Test Steps 먼저 입력</span>'; }   // Variable은 설명 불필요 → 가드 건너뜀
    else if(_act==='SNMP Public'||_act==='SNMP Private'||_act==='SNMP Trap'){
      if(!snmpData&&typeof loadSnmp==='function'){ try{loadSnmp();}catch(e){} }
      const _allo=(snmpData&&snmpData.oids)?snmpData.oids:[];
      const _os=_allo.filter(o=>_act==='SNMP Trap'?o.access==='trap':_act==='SNMP Private'?o.access==='private':(o.access!=='private'&&o.access!=='trap'));
      if(_act==='SNMP Trap'){
        const _selOid=_os.find(o=>o.oid===c.cli)||_allo.find(o=>o.oid===c.cli);
        _tdInner='<select onmousedown="event.stopPropagation()" onclick="event.stopPropagation()" onchange="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'cli\',this.value)" title="'+(_selOid?(String(_selOid.name||'')+' — '+String(_selOid.desc||'')+' ('+_selOid.oid+')').replace(/"/g,'&quot;'):_act+' OID 선택')+'" style="width:100%;font-size:11px;font-family:inherit;padding:2px 6px;border:none;background:transparent;color:#1c1f27;font-weight:600;outline:none;cursor:pointer;"><option value="">('+_act+' OID 선택)</option>'+_os.map(o=>'<option value="'+String(o.oid||'').replace(/"/g,'&quot;')+'"'+(c.cli===o.oid?' selected':'')+'>'+String(o.name||'').replace(/</g,'&lt;')+(o.desc?(' — '+String(o.desc).replace(/</g,'&lt;')):'')+'  ['+String(o.oid||'').replace(/</g,'&lt;')+']</option>').join('')+'</select>';
      } else {   // RO/RW: 수동 입력 + 등록 OID 자동완성(datalist). RW는 "OID [값]" 입력 시 SET(쓰기 community 자동)
        const _dlid='snmpdl-'+c.id, _rw=(_act==='SNMP Private');
        const _ph=(_rw?'OID 입력/선택 · SET은  OID [값]  (예: .1.3.6.1.2.1.1.4.0 [MIB-2::system.sysContact.0 새값])':'OID 입력 또는 선택 (예: 1.3.6.1.2.1.1.5.0)');
        _tdInner='<div onclick="event.stopPropagation()" style="display:flex;align-items:center;gap:6px;width:100%;">'
          +'<input list="'+_dlid+'" value="'+(String(c.cli||'').replace(/"/g,'&quot;'))+'" onmousedown="event.stopPropagation()" onclick="event.stopPropagation()" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'cli\',this.value)" placeholder="'+_ph.replace(/"/g,'&quot;')+'" style="flex:1;min-width:0;font-size:11px;font-family:ui-monospace,monospace;padding:2px 7px;border:none;background:transparent;color:#1c1f27;font-weight:600;outline:none;box-sizing:border-box;">'
          +'<datalist id="'+_dlid+'">'+_os.map(o=>'<option value="'+String(o.oid||'').replace(/"/g,'&quot;')+'">'+String(o.name||'').replace(/</g,'&lt;')+(o.desc?(' — '+String(o.desc).replace(/</g,'&lt;')):'')+'</option>').join('')+'</datalist>'
          +(_rw?'<span title="RW: OID 뒤에 [값] 붙이면 SET (쓰기 community 자동 사용)" style="font-size:9px;font-weight:800;color:#e8820c;background:rgba(232,130,12,0.12);padding:2px 6px;border-radius:5px;white-space:nowrap;flex-shrink:0;">SET</span>':'')
          +'</div>';
      }
    } else if(_act==='SNMP 수동'){
      if(typeof snmpData!=='undefined'&&!snmpData&&typeof loadSnmp==='function'){ try{loadSnmp();}catch(e){} }
      const _mo=((typeof snmpData!=='undefined'&&snmpData&&snmpData.oids)||[]).find(o=>String(o.oid||'').trim()===String(c.cli||'').trim());
      _tdInner='<div onclick="event.stopPropagation()" style="display:flex;align-items:center;gap:8px;width:100%;"><input value="'+(String(c.cli||'').replace(/"/g,'&quot;'))+'" onmousedown="event.stopPropagation()" onclick="event.stopPropagation()" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'cli\',this.value)" placeholder="OID 직접 입력 (예: 1.3.6.1.2.1.1.5.0)" style="flex:1;min-width:0;font-size:11px;font-family:inherit;padding:2px 7px;border:none;background:transparent;color:#1c1f27;font-weight:600;outline:none;box-sizing:border-box;">'+(_mo?'<span style="font-size:11px;color:#7c3aed;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex-shrink:1;"><i class="ti ti-info-circle" style="font-size:11px;"></i> '+String(_mo.name||'').replace(/</g,'&lt;')+(_mo.desc?(' — '+String(_mo.desc).replace(/</g,'&lt;')):'')+'</span>':'')+'</div>';
    } else if(_act==='Variable'){
      _tdInner='<div contenteditable="true" onclick="event.stopPropagation()" oncontextmenu="tcVarMenuTD(event,\''+tcid+'\',\''+c.id+'\')" onpaste="tcStepPaste(\''+tcid+'\',\''+c.id+'\',event)" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'cli\',this.innerText.trim())" data-cliid="'+c.id+'" data-ph="수식/대입: ${var1}=1 · #1.col1(\'$i\')=1000 · ${t}=${a}+${b} · 값[e1000->1G] (여러 줄·우클릭=변수)" class="descedit multiln" style="width:100%;font-size:12px;font-family:ui-monospace,monospace;color:#7c3aed;font-weight:700;padding:3px 7px;outline:none;white-space:pre-wrap;word-break:break-word;line-height:1.7;">'+(String(c.cli||'')).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</div>';
    } else if((typeof _isMtrAct==='function'&&_isMtrAct(_act)) || _act==='대기' || _act==='Ping'){
      // 계측기(Traffic/ARP/계측/REST)·대기(Sleep)·Ping = CLI 명령이 아님 → Test Data 없음
      _tdInner='<span onclick="event.stopPropagation()" style="color:#c8cdd6;font-size:11.5px;padding:0 7px;">—</span>';
    } else {
      const _isMulti=String(c.cli||'').indexOf('\n')>=0;   // 여러 명령(줄바꿈) → 줄별로 표시(멀티라인), 단일이면 한 줄 압축
      _tdInner='<div contenteditable="true" onclick="event.stopPropagation();_tcCellSelStep(\''+tcid+'\',\''+c.id+'\',event)" oncontextmenu="tcVarMenuTD(event,\''+tcid+'\',\''+c.id+'\')" onbeforeinput="_tcNoEnterBreak(event)" onkeydown="var k=event.key,el=this;if(k===\'Enter\'&&!event.shiftKey){event.preventDefault();el.blur();}else if(k===\'ArrowDown\'){if(_caretAtEnd(el)){event.preventDefault();tcCellNav(\''+tcid+'\',\''+c.id+'\',\'cli\',1);}}else if(k===\'ArrowUp\'){if(_caretAtStart(el)){event.preventDefault();tcCellNav(\''+tcid+'\',\''+c.id+'\',\'cli\',-1);}}" onpaste="tcStepPaste(\''+tcid+'\',\''+c.id+'\',event)" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'cli\',this.innerText.trim())" title="'+(String(c.cli||'')).replace(/"/g,'&quot;')+'" data-cliid="'+c.id+'" data-ph="show system  (Shift+Enter = 여러 줄 = 여러 명령)" class="descedit'+(_isMulti?' multiln':'')+'" style="width:100%;font-size:12px;font-family:ui-monospace,monospace;color:#1c1f27;font-weight:600;padding:3px 7px;outline:none;'+(_isMulti?'white-space:pre-wrap;overflow:visible;word-break:break-word;':'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;')+'line-height:1.7;min-height:0;">'+(String(c.cli||'')).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</div>';
    }
    const _expTd='<td style="padding:0 4px;'+bb+'"><div contenteditable="true" onclick="event.stopPropagation()" onbeforeinput="_tcNoEnterBreak(event)" onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();this.blur();}" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'expected\',this.innerText.trim())" data-ph="＋ Expected Result (Shift+Enter = 줄바꿈)" class="descedit" style="width:100%;font-size:12px;color:#475063;padding:2px 6px;outline:none;white-space:pre-wrap;overflow:hidden;text-overflow:ellipsis;line-height:1.7;min-height:0;">'+(c.expected||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</div></td>';
    rowsHtml+='<tr'+drop(c)+' onclick="tcStepSelect(\''+tcid+'\',\''+c.id+'\',event)" style="'+(sel?'background:rgba(45,111,212,0.16);':(_sk?'background:#eef0f2;':(open?'background:#f6f8fc;':'')))+(_sk?'color:#9aa1ad;':'')+'cursor:pointer;">'+_numCell
      +'<td onclick="tcStepSelect(\''+tcid+'\',\''+c.id+'\',event)" title="클릭하여 스텝 선택" style="padding:1px 4px 1px '+indPx(ind+(parseInt(c.indent)||0))+'px;cursor:pointer;'+bb+'"><div style="display:flex;align-items:center;gap:5px;"><span style="flex:1;min-width:0;">'+_actSelFull(tcid,c)+'</span></div></td>'
      +((c.action==='Variable')
        ? ('<td colspan="3" onclick="_tcFocusCell(this,event)" style="padding:0 4px;'+bb+'">'+_tdInner+'</td>'+_expTd)   // Variable: Session+Test Data+Test Step 한 칸 병합
        : ('<td style="padding:1px 3px;text-align:center;'+bb+'">'+(((k==='cli')||(k==='connect')||(k==='disconnect'))?_devSelCell(tcid,c):'')+'</td>'
          +_descTd
          +'<td onclick="_tcFocusCell(this,event)" style="padding:0 4px;'+bb+'">'+_tdInner+'</td>'
          +_expTd))
      +'<td id="stcell-'+c.id+'" onclick="tcStepSelect(\''+tcid+'\',\''+c.id+'\',event)" title="상태 (클릭 → 상세: 판정·RCA)" style="padding:3px 0px;text-align:center;'+bb+'cursor:pointer;">'+_stCellInner(c,false)+'</td>'
      +'</tr>';
    if((advOn||_advAlways) && c.action!=='Variable'){   // Variable은 판정·반복·조건 불필요 → 고급 행 숨김
      const repN=parseInt(c.repeat)||1;
      const repCtl='<span style="display:inline-flex;align-items:center;gap:4px;margin-right:14px;"><i class="ti ti-repeat" style="color:#7c3aed;"></i>반복<input type="number" min="1" value="'+repN+'" onchange="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'repeat\',this.value)" style="width:42px;font-size:11px;padding:2px 4px;border:1px solid var(--border);border-radius:4px;">회'+(repN>1?(' 간격<input type="number" min="0" value="'+(parseInt(c.interval)||1)+'" onchange="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'interval\',this.value)" style="width:38px;font-size:11px;padding:2px 4px;border:1px solid var(--border);border-radius:4px;">초 <select onchange="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'repeatMode\',this.value)" style="font-size:11px;padding:2px 4px;border:1px solid var(--border);border-radius:4px;">'+[['everytime','매회 합격'],['mofn','N중 M회'],['stable','안정(동일)'],['counter','카운터 비교']].map(x=>'<option value="'+x[0]+'"'+((c.repeatMode||'everytime')===x[0]?' selected':'')+'>'+x[1]+'</option>').join('')+'</select>'):'')+'</span>';
      const varR='<span style="display:inline-flex;align-items:center;gap:4px;margin-right:14px;"><i class="ti ti-variable" style="color:#2d6fd4;"></i>변수<input value="'+(c.extractVar||'').replace(/"/g,'&quot;')+'" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'extractVar\',this.value)" placeholder="이름" style="width:78px;font-size:11px;padding:2px 5px;border:1px solid var(--border);border-radius:4px;">=<input value="'+(c.extractRule||'').replace(/"/g,'&quot;')+'" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'extractRule\',this.value)" placeholder="키/정규식" style="width:120px;font-size:11px;padding:2px 5px;border:1px solid var(--border);border-radius:4px;"></span>';
      const condR='<span style="display:inline-flex;align-items:center;gap:4px;margin-right:14px;"><i class="ti ti-arrows-split-2" style="color:#e8820c;"></i>조건<input value="'+(c.condition||'').replace(/"/g,'&quot;')+'" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'condition\',this.value)" placeholder="예: ${serial} != 빈값" style="width:180px;font-size:11px;padding:2px 5px;border:1px solid var(--border);border-radius:4px;"></span>';
      const excR='<span style="display:inline-flex;align-items:center;gap:4px;" title="판정 전 제외할 라인 — 문구 또는 #행번호 (쉼표 구분). 기준 비교·라인 판정에 적용">'+'<i class="ti ti-eraser" style="color:#64748b;"></i>제외라인<input value="'+(c.excludeLines||'').replace(/"/g,'&quot;')+'" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'excludeLines\',this.value)" placeholder="예: Uptime, Last change, #3" style="width:200px;font-size:11px;padding:2px 5px;border:1px solid var(--border);border-radius:4px;"></span>';
      rowsHtml+='<tr style="background:#faf9ff;">'+numC('')+'<td style="'+bb+'"></td><td colspan="5" style="padding:6px 9px 9px '+indPx(ind+1)+'px;font-size:11px;color:var(--text3);'+bb+'">'+repCtl+varR+condR+excR+'</td></tr>';
    }
    if((c.kind||'cli')==='cli' && typeof _respStepId!=='undefined' && _respStepId[tcid]===c.id){
      rowsHtml+='<tr><td colspan="9" style="padding:0;background:#fbfcfe;border:1px solid #e1e4e9;border-left:3px solid #b9c6dd;">'+_stepDetailPanel(tcid,true)+'</td></tr>';
    }
    // (스텝별 인라인 상세: 선택된 스텝 바로 아래에 Properties/Response/Expected/RCA)
  });
  _segs.push(Object.assign({},_segMeta,{rows:rowsHtml}));
  // 모델별 접이식 섹션 렌더
  const _colg='<colgroup><col style="width:22px;"><col style="width:40px;"><col style="width:20px;"><col style="width:'+(_actW-50)+'px;"><col style="width:95px;"><col style="width:240px;"><col style="width:240px;"><col style="width:200px;"><col style="width:90px;"></colgroup>';
  const _thRes=function(t,al){ return '<th style="padding:6px 9px;text-align:'+(al||'left')+';font-size:12px;font-weight:700;color:#3a4254;background:#eef1f5;border-bottom:1px solid #c4cad3;border-right:1px solid #d7dbe2;white-space:nowrap;">'+t+'</th>'; };
  const _thead='<thead><tr>'+_thRes('','center')+_thRes('','center')+_thRes('','center')+_thRes('Action','')+_thRes('Session','')+_thRes('Test Step','')+_thRes('Test Data','')+_thRes('Expected Result','')+_thRes('상태','')+'</tr></thead>';
  const _mkTable=rows=>'<div class="stepTbl" style="border:1px solid #cfd4dc;overflow-x:auto;overflow-y:visible;"><table oncontextmenu="tcStepCtxMenu(event,\''+tcid+'\')" onkeydown="tcGridKey(event)" style="width:100%;border-collapse:collapse;table-layout:auto;">'+_colg+_thead+'<tbody>'+rows+'</tbody></table></div>';
  let tableHtml='';
  if(!checks.length){ tableHtml=_mkTable('<tr><td colspan="9" style="padding:26px;text-align:center;color:var(--text3);font-size:12px;">스텝이 없습니다. 표에서 <b>우클릭 → Step</b> 으로 시작하세요.</td></tr>'); }
  else { _segs.forEach(s=>{
    if(s.isCommon && !String(s.rows).trim()) return; // 공통 비었으면 생략
    const _cid=s.isCommon?('__common_'+tcid):s.id; const _col=!!_modelCol[_cid];
    const _caret='<span onclick="event.stopPropagation();tcModelToggle(\''+tcid+'\',\''+_cid+'\')" title="'+(_col?'펼치기':'접기')+' — 이 그룹 스텝 접기/펴기" style="cursor:pointer;display:inline-flex;align-items:center;justify-content:center;width:100%;"><i class="ti ti-caret-'+(_col?'right':'down')+'-filled" style="font-size:14px;color:#5c6bc0;"></i></span>';
    let _hdr;
    if(s.isCommon){
      const _cmopts=['공통'].concat((typeof groupList!=='undefined'?groupList.map(function(g){return g.name;}):[]).filter(Boolean).sort(function(a,b){return String(a).localeCompare(String(b),undefined,{numeric:true,sensitivity:'base'});}));
      const _csel='<select onchange="tcModelSetCommon(\''+tcid+'\',this.value)" title="모델명을 지정하면 이 스텝들이 그 모델 그룹이 됩니다" style="font-size:14px;font-weight:700;color:#3949ab;border:none;background:transparent;outline:none;cursor:pointer;">'+_cmopts.map(o=>'<option'+(o==='공통'?' selected':'')+' style="color:#1c2230;background:#fff;">'+o+'</option>').join('')+'</select>';
      _hdr='<div style="display:flex;align-items:center;gap:10px;padding:5px 8px;">'+_csel+'</div>';
    } else {
      const _mopts=(typeof groupList!=='undefined'?groupList.map(function(g){return g.name;}):[]).filter(Boolean).sort(function(a,b){return String(a).localeCompare(String(b),undefined,{numeric:true,sensitivity:'base'});});
      const _mcur=s.model||''; const _has=_mopts.indexOf(_mcur)>=0;
      const _msel='<select onchange="tcCheckSave(\''+tcid+'\',\''+s.id+'\',\'modelName\',this.value)" title="모델그룹을 지정하면 이 스텝들이 그 그룹 섹션이 됩니다" style="font-size:14px;font-weight:700;color:#3949ab;border:none;background:transparent;outline:none;cursor:pointer;"><option value=""'+(_mcur?'':' selected')+' style="color:#5a6376;background:#fff;">(모델그룹 선택)</option>'+(_has?'':(_mcur?'<option selected style="color:#1c2230;background:#fff;">'+_mcur+'</option>':''))+_mopts.map(o=>'<option'+(o===_mcur?' selected':'')+' style="color:#1c2230;background:#fff;">'+o+'</option>').join('')+'</select>';
      const _gmods=(typeof modelList!=='undefined'&&_mcur&&_mcur!=='공통')?modelList.filter(function(m){return m.group===_mcur;}).map(function(m){return m.name;}):[];
      _hdr='<div style="display:flex;align-items:center;gap:5px;padding:5px 8px;flex-wrap:wrap;">'+_msel
        +'<button class="ptbtn" style="margin-left:8px;font-size:9.5px;padding:2px 6px;font-weight:700;color:#00875a;" onclick="tcCheckAddModel(\''+tcid+'\',\''+s.id+'\')" title="이 모델 섹션 맨 아래에 스텝 추가"><i class="ti ti-plus"></i> 스텝</button>'
        +'<button class="ptbtn" style="font-size:9.5px;padding:2px 6px;font-weight:700;" onclick="tcModelDelStep(\''+tcid+'\',\''+s.id+'\')" title="이 모델의 마지막 스텝 삭제"><i class="ti ti-minus"></i> 스텝</button>'
        +'<button class="ptbtn" style="font-size:9.5px;padding:2px 6px;font-weight:700;color:#2d6fd4;border-color:#bcd2f5;margin-left:6px;" onclick="tcModelGroupCopy(\''+tcid+'\',\''+s.id+'\')" title="이 모델그룹(헤더+스텝 전체)을 복사 → 바로 아래에 새 그룹 생성, 모델만 바꾸면 됨"><i class="ti ti-copy"></i> 복사</button>'
        +'<span style="flex:1;"></span>'
        +'<button class="ptbtn'+((_runActive&&_runActive.tcid===tcid&&_runActive.headerId===s.id)?' tcblink':'')+'" style="font-size:11px;font-weight:800;color:#00875a;border-color:#a8e0c8;" onclick="tcModelGroupRun(\''+tcid+'\',\''+s.id+'\')" title="이 모델그룹(+공통·세션)만 Step 실행"><i class="ti ti-player-play-filled"></i> Step 실행</button>'
        +'<button class="ptbtn" style="font-size:11px;font-weight:700;color:var(--red);border-color:#f0c2cb;" onclick="tcModelDel(\''+tcid+'\',\''+s.id+'\')" title="이 모델 그룹 삭제 (헤더+스텝)"><i class="ti ti-trash"></i> 삭제</button>'
        +'</div>'
        +'';   // (그룹 모델 표시줄 제거)
    }
    const _bodyRows=String(s.rows).trim()?s.rows:'<tr><td colspan="9" style="padding:14px;text-align:center;color:var(--text3);font-size:11.5px;">이 모델에 스텝이 없습니다 — 우클릭 → Step 또는 [+ 스텝]</td></tr>';
    // 모델 그룹 헤더 행(파란 바: 모델셀렉트 + 스텝 추가/삭제/복사 + Step 실행/삭제) 은 표시하지 않는다.
    // 하위 스텝(_bodyRows)은 그대로 유지 → 사용자 요구: "빨간 표시 부분만 제거, Step 유지".
    // 공통 섹션은 원래도 헤더 없이 스텝만 표시되었으므로 동일하게 처리.
    tableHtml+='<div style="margin-bottom:14px;">'+_mkTable(_bodyRows)+'</div>';
  }); }
  const addBtn2=(k,lab,col)=>'<button onclick="tcCheckAdd(\''+tcid+'\',\''+k+'\',true)" style="font-size:11px;padding:6px 11px;border-radius:6px;border:1px solid '+col+';background:#fff;color:'+col+';cursor:pointer;font-weight:600;margin:0 5px 5px 0;"><i class="ti ti-plus"></i> '+lab+'</button>';
  // 선택 스텝의 유효 모델 (이동 버튼 아래 표시)
  const _selStepId=(typeof _respStepId!=='undefined'&&_respStepId[tcid])||((_stepSel&&_stepSel[tcid]&&_stepSel[tcid].length)?_stepSel[tcid][_stepSel[tcid].length-1]:null);
  const _selIdx=_selStepId?checks.findIndex(x=>x.id===_selStepId):-1;
  const _curModel=(_selIdx>=0&&typeof _effModelOfStep==='function')?_effModelOfStep(checks,_selIdx):'';
  const _cycBanner=(typeof _cycleLiveCtx!=='undefined'&&_cycleLiveCtx&&_cycleLiveCtx.tcid===(tc.tcid||tc.id))?('<div style="display:flex;align-items:center;gap:10px;background:#eef6ff;border:1px solid #bcd2f5;border-radius:9px;padding:8px 13px;margin-bottom:10px;flex-wrap:wrap;"><i class="ti ti-recycle" style="color:#2d6fd4;font-size:16px;"></i><span style="font-size:12.5px;font-weight:800;color:#2d6fd4;">사이클 라이브 실행</span><span style="font-size:11px;color:var(--text3);">모델 <b>'+(_cycleLiveCtx.model||'')+'</b> · 전체 실행하면 결과가 사이클에 자동 반영됩니다</span><span style="flex:1;"></span><button class="ptbtn" style="font-size:11px;font-weight:700;color:#2d6fd4;border-color:#bcd2f5;" onclick="cycleSyncFromTC()"><i class="ti ti-refresh"></i> 결과 반영</button><button class="ptbtn" style="font-size:11px;font-weight:700;" onclick="cycleBackFromLive()"><i class="ti ti-arrow-back-up"></i> 사이클로</button></div>'):'';
  return '<div>'+
    _cycBanner+
    sessionBar+
    '<div class="tc-steptoolbar" style="display:flex;align-items:center;gap:6px;margin-bottom:10px;flex-wrap:wrap;">'+
      '<span style="font-size:14px;font-weight:700;">시험 절차<span title="검증 스텝(명령) 수" style="font-size:11px;font-weight:600;padding:1px 7px;border-radius:8px;background:rgba(45,111,212,0.1);color:var(--blue);">'+checks.filter(x=>(x.kind||'cli')==='cli').length+'</span><span style="font-size:10px;color:var(--text3);font-weight:400;margin-left:4px;">/ 전체 '+checks.length+'</span></span>'+
      '<div class="ptgrp" style="margin-left:8px;">'+
        '<button class="ptbtn" onclick="tcStepMoveSel(\''+tcid+'\',-1)" title="선택 스텝 위로"><i class="ti ti-chevron-up"></i></button>'+
        '<button class="ptbtn" onclick="tcStepMoveSel(\''+tcid+'\',1)" title="선택 스텝 아래로"><i class="ti ti-chevron-down"></i></button>'+
        '<button class="ptbtn" onclick="tcStepIndentSel(\''+tcid+'\',-1)" title="선택 스텝 내어쓰기"><i class="ti ti-chevron-left"></i></button>'+
        '<button class="ptbtn" onclick="tcStepIndentSel(\''+tcid+'\',1)" title="선택 스텝 들여쓰기"><i class="ti ti-chevron-right"></i></button>'+
      '</div>'+
      '<div class="ptgrp">'+
        '<button class="ptbtn" onclick="tcStepsExpandAll(\''+tcid+'\')" title="전체 펼치기"><i class="ti ti-chevrons-down"></i> 펼치기</button>'+
        '<button class="ptbtn" onclick="tcStepsCollapseAll(\''+tcid+'\')" title="전체 접기"><i class="ti ti-chevrons-up"></i> 접기</button>'+
      '</div>'+
      // "+ 모델그룹" / "프로시저" 버튼은 제거 — 시험절차 툴바에서 노출하지 않음(내부 로직은 유지).
      '<span style="flex:1;"></span>'+
      '<button class="ptbtn lt-toggle-btn" data-tcid="'+tcid+'" onclick="toggleLiveTerm(\''+tcid+'\')" title="실행 시 라이브 터미널 팝업 켜기/끄기" style="'+(_liveTermOn?'color:#0d9488;border-color:#9ad9d0;':'color:var(--text3);')+'"><i class="ti ti-terminal-2"></i> 터미널 라이브 '+(_liveTermOn?'ON':'OFF')+'</button>'+
      '<button class="ptbtn'+((_runActive&&_runActive.tcid===tcid&&_runActive.headerId==null)?' tcblink':'')+'" onclick="tcCheckRunAll(\''+tcid+'\')" style="background:#fff;color:#00a872;border:1px solid #00a872;font-weight:700;"><i class="ti ti-player-play-filled"></i> Step 전체 실행</button>'+
      ((_runActive&&_runActive.tcid===tcid)?('<button class="ptbtn" onclick="tcCheckRunPause(\''+tcid+'\')" title="일시정지 — 현재 스텝 종료 후 멈춤, ▶계속으로 이어서 진행" style="background:#fff;color:#e8820c;border:1px solid #e8820c;font-weight:700;"><i class="ti ti-player-pause-filled"></i> 멈춤</button><button class="ptbtn" onclick="tcCheckRunStop(\''+tcid+'\')" title="실행 중지 — 현재 스텝 종료 후 정지 (재개 불가)" style="background:#fff;color:#e53e5a;border:1px solid #e53e5a;font-weight:700;"><i class="ti ti-player-stop-filled"></i> 중지</button>'):'')+
      (_runPause[tcid]?('<button class="ptbtn" onclick="tcCheckRunResume(\''+tcid+'\')" title="멈춘 지점부터 이어서 진행" style="background:#fff;color:#2d6fd4;border:1px solid #2d6fd4;font-weight:700;"><i class="ti ti-player-play-filled"></i> 계속</button>'):'')+
      // 통합 AI 기능 버튼 — 클릭 시 팝오버 메뉴로 [AI 절차 생성] / [LLM 학습] 선택
      '<button class="ptbtn" onclick="tcAiMenuOpen(event,\''+tcid+'\')" title="AI 기능 — AI 절차 생성 · LLM 학습" style="color:#7c3aed;border-color:#c9b6f0;"><i class="ti ti-sparkles"></i> AI <i class="ti ti-chevron-down" style="font-size:11px;margin-left:2px;"></i></button>'+
      '<button class="ptbtn" onclick="tcOpenSnapshots(\''+tcid+'\')" title="스텝이 사라지거나 잘못 저장됐을 때 이전 자동 백업으로 복구 (최근 20개 유지)" style="color:#e8820c;border-color:#f2caa1;"><i class="ti ti-history"></i> 복구</button>'+
    '</div>'+
    _procProgBanner(tcid)+
    varsBar+
    tableHtml+
    _procBottomArea(tcid)+
    legacyHtml+
    '</div>';
}
let _seqSel={}; let _procLayout=((typeof localStorage!=='undefined'&&localStorage.getItem('utop_proc_layout'))||'stc');
let _ckAdv={};
let _advAlways=false; // 모든 스텝의 고급(반복·변수·조건) 상시 표시
// 전역 IDLE Interval 은 제거됨 (스텝별 c.cmdDelay 만 사용). 기본값은 _TC_STEP_DEFAULT_IDLE.
// 텔넷/SSH 접속 재시도 (리부팅 등 → N회·간격마다 재접속)
let _connRetry=parseInt(localStorage.getItem('utop_conn_retry')); if(isNaN(_connRetry)) _connRetry=10;
let _connRetryInt=parseInt(localStorage.getItem('utop_conn_retry_int')); if(isNaN(_connRetryInt)) _connRetryInt=30;
function tcSetConnRetry(v){ let n=parseInt(v); if(isNaN(n)||n<0) n=0; if(n>100) n=100; _connRetry=n; try{ localStorage.setItem('utop_conn_retry',String(n)); }catch(e){} }
function tcSetConnRetryInt(v){ let n=parseInt(v); if(isNaN(n)||n<1) n=1; if(n>600) n=600; _connRetryInt=n; try{ localStorage.setItem('utop_conn_retry_int',String(n)); }catch(e){} }
let _bulkRun=false; // 전체 실행 중: 스텝마다 저장/장비저장 생략 → 끝에 1회 (속도↑)
// ── 하단 탭(Response/Console) ──
let _procBottomTab={}; // tcid → 'response'|'console'
let _respStepId={};    // tcid → Response 탭에 보일 스텝 id
let _stepDetailTab={}; // tcid → 'properties'|'response'|'expect'|'rca' (스텝 클릭 시 4탭 상세 패널)
function tcSetStepTab(tcid,k){ _stepDetailTab[tcid]=k; tcProcRefresh(tcid); }
// ── 스텝 표 열 폭 드래그 리사이즈 (전역 저장) ──
let _tcColW=null; try{ const _w0=localStorage.getItem('utop_tc_colw'); if(_w0) _tcColW=JSON.parse(_w0); }catch(e){ _tcColW=null; }
let _tcResize=null;function tcColResizeMove(ev){
  if(!_tcResize) return;
  let w=_tcResize.startW+(ev.clientX-_tcResize.startX); if(w<40)w=40;
  _tcResize.lastW=w;
  document.querySelectorAll('.stepTbl colgroup').forEach(function(cg){ const col=cg.children[_tcResize.idx]; if(col) col.style.width=w+'px'; });
}
function tcColResizeEnd(){
  document.removeEventListener('mousemove',tcColResizeMove);
  document.removeEventListener('mouseup',tcColResizeEnd);
  document.body.style.cursor='';
  if(_tcResize){
    const tr=document.querySelector('.stepTbl thead tr');
    if(tr){ const ws=[]; tr.querySelectorAll('th').forEach(function(th){ ws.push(Math.max(40,Math.round(th.getBoundingClientRect().width))); }); if(ws.length===6){ _tcColW=ws; try{ localStorage.setItem('utop_tc_colw',JSON.stringify(ws)); }catch(e){} } }
  }
  _tcResize=null;
}
let _respSel={}; let _respAnchor={};
let _pendingSub={};      // tcid → 텍스트 드래그로 선택한 문구 (문구로 검증/제외)
let _critViewTcid=null;  // "기준 보기" 팝업이 보고 있는 tcid (null=닫힘)
// 저장된 판정 기준에 해당하는 줄(active=시드용) / 무시되는 줄(excluded=취소선용)을 실제 판정 엔진과 동일 규칙으로 계산
function _critLineSet(c, lines){
  const active=new Set(), excluded=new Set();
  const exNums=new Set(), exSubs=[];
  String(c.excludeLines||'').split(/[,\n]/).map(s=>s.trim()).filter(Boolean).forEach(p=>{ const m=p.match(/^#(\d+)$/); if(m) exNums.add(parseInt(m[1])); else exSubs.push(p); });
  const type=c.type||'contains';
  const isExSub=l=>exSubs.some(s=>String(l).indexOf(s)>=0);
  const skipDiff=l=>{ const t=String(l).trim(); if(!t) return true; if(isExSub(l)) return true; if(/^[\w.\-]+[#>]/.test(t)) return true; if(/\b(19|20)\d\d\b/.test(t)&&/(KST|KSR|UTC|GMT|JST|Mon|Tue|Wed|Thu|Fri|Sat|Sun|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(t)) return true; if(/\b\d{1,2}:\d{2}:\d{2}\b/.test(t)) return true; return false; };
  if(type==='diff'){
    if(c.baseline){ lines.forEach((l,idx)=>{ const n=idx+1; if(!String(l).trim()) return; if(exNums.has(n)||skipDiff(l)) excluded.add(n); else active.add(n); }); }
  } else if(type==='lines'){
    const i=String(c.criteria||'').indexOf(':'); const spec=(i>=0?String(c.criteria).slice(0,i):String(c.criteria||'')).trim();
    const keptOrig=[]; lines.forEach((l,idx)=>{ const n=idx+1; if(exNums.has(n)||isExSub(l)){ excluded.add(n); } else { keptOrig.push(n); } });
    _parseLineSpec(spec, keptOrig.length).forEach(pos=>{ const n=keptOrig[pos-1]; if(n!=null) active.add(n); });
  } else if(type==='contains_all'){
    const toks=String(c.criteria||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    lines.forEach((l,idx)=>{ const n=idx+1; if(exNums.has(n)||isExSub(l)){ excluded.add(n); return; } if(toks.some(t=>String(l).indexOf(t)>=0)) active.add(n); });
  } else if(type==='line'||type==='contains'||type==='notcontains'){
    const crit0=String(c.criteria||''); const crit=(type==='line')?(crit0.indexOf(':')>=0?crit0.slice(0,crit0.indexOf(':')):crit0).trim():crit0.trim();
    lines.forEach((l,idx)=>{ const n=idx+1; if(exNums.has(n)||isExSub(l)){ excluded.add(n); return; } if(crit && String(l).indexOf(crit)>=0) active.add(n); });
  }
  return {active:active, excluded:excluded};
}
// 변수 값 조회: 휘발 캐시(_procVars) 우선, 없으면 영속(tc.varVals) — 표시가 사라지지 않도록 (조건1)
function _varVal(tcid,name){ name=String(name||'').trim(); const pv=_procVars[tcid]||{}; if(pv[name]!=null) return pv[name]; const tc=_tcById(tcid); return (tc&&tc.varVals)?tc.varVals[name]:undefined; }
// 줄에서 판정기준 토큰(문구)에 해당하는 '부분'만 초록 강조 (조건2)
// 이미 들어간 <span> 태그 속성은 건드리지 않고 '텍스트' 부분에만 정규식 치환 (하이라이트 중첩 깨짐 방지)
function _hlSafeReplace(html, re, repl){ return String(html).replace(/<[^>]*>|[^<]+/g, function(seg){ return seg.charAt(0)==='<' ? seg : seg.replace(re, repl); }); }
function _hlTokens(line, toks){
  var src=String(line==null?'':line).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  var ranges=[];   // 모든 토큰의 매치 구간 수집 → 병합 → 한 번만 칠함 (중첩 span 방지)
  (toks||[]).filter(Boolean).forEach(function(t){
    var et=String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;'); if(!et) return;
    try{ var re=new RegExp(et.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'); var m; while((m=re.exec(src))){ if(!m[0]){ re.lastIndex++; continue; } ranges.push([m.index, m.index+m[0].length]); } }catch(e){}
  });
  if(!ranges.length) return src;
  ranges.sort(function(a,b){return a[0]-b[0]||a[1]-b[1];});
  var merged=[]; ranges.forEach(function(r){ var last=merged[merged.length-1]; if(last && r[0]<=last[1]){ if(r[1]>last[1]) last[1]=r[1]; } else merged.push([r[0],r[1]]); });
  var out='', pos=0;
  merged.forEach(function(r){ out+=src.slice(pos,r[0])+'<span style="background:rgba(0,168,114,0.34);color:#04543a;font-weight:700;border-radius:2px;">'+src.slice(r[0],r[1])+'</span>'; pos=r[1]; });
  return out+src.slice(pos);
}
// 드래그로 선택 중인 문구를 노란색으로 강조 (어디를 드래그했는지 보이도록, 조건2)
// exactStart 가 주어지면 원본 텍스트의 그 오프셋에 있는 매치 딱 1건만 하이라이트
// (같은 값이 다른 위치에 있어도 안 번짐 — 사용자가 실제 드래그한 자리만).
function _hlPending(html, sub, exactStart){
  if(!sub) return html; const es=String(sub).replace(/&/g,'&amp;').replace(/</g,'&lt;'); if(!es.trim()) return html;
  // exactStart 있으면: 원본 텍스트(태그 없는) 오프셋 기준으로 그 자리 딱 1건만 감쌈
  if(typeof exactStart==='number' && exactStart>=0){
    try{
      // html 을 태그/텍스트 세그먼트로 나누며 원본 텍스트 오프셋 누적 → exactStart 지점의 문자열만 대체
      var rawPos=0, out='', wrap='<span style="background:#ffe066;color:#5c4700;border-radius:2px;box-shadow:0 0 0 1px #e0aa00;">';
      var segRe=/<[^>]*>|[^<]+/g, m, done=false;
      while((m=segRe.exec(String(html)))){
        var seg=m[0];
        if(seg.charAt(0)==='<'){ out+=seg; continue; }
        if(done){ out+=seg; continue; }
        // seg 안의 raw 오프셋 = rawPos ~ rawPos+seg.length
        var segEnd=rawPos+seg.length;
        if(exactStart>=rawPos && (exactStart+es.length)<=segEnd){
          var rel=exactStart-rawPos;
          if(seg.substr(rel, es.length)===es){
            out+=seg.slice(0,rel)+wrap+es+'</span>'+seg.slice(rel+es.length);
            done=true;
          } else {
            out+=seg;
          }
        } else {
          out+=seg;
        }
        rawPos=segEnd;
      }
      return out;
    }catch(e){ /* fall through to global 방식 */ }
  }
  // 오프셋 없으면 기존 동작 (전체 매치 강조)
  try{ const re=new RegExp(es.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'); return _hlSafeReplace(html,re,'<span style="background:#ffe066;color:#5c4700;border-radius:2px;box-shadow:0 0 0 1px #e0aa00;">$&</span>'); }catch(e){ return html; }
}
function _critTokens(c){ const tp=c.type||'contains'; const cr=String(c.criteria||'');
  if(tp==='contains_all') return cr.split(/\r?\n/).map(function(s){return s.trim();}).filter(Boolean);
  if(tp==='contains') return [cr.trim()].filter(Boolean);
  if(tp==='line'){ const k=(cr.indexOf(':')>=0?cr.slice(0,cr.indexOf(':')):cr).trim(); const v=(cr.indexOf(':')>=0?cr.slice(cr.indexOf(':')+1):'').trim(); return [k,v].filter(Boolean); }
  if(tp==='expr'){
    // IF 조건식(예: "${var6} == 1 GB && ${var5} == E4320-24P" 또는 실행 후 치환된 "1 GB == 1 GB && E4320-24P == E4320-24P")
    // "&&" / "||" 로 분리 후 == 비교인 경우 우변(비교 대상값)을 하이라이트 토큰으로 뽑음. ${var...} 원문은 output에 없으니 제외.
    var _out=[]; var _seen={}; var _clauses=cr.split(/\s*(?:&&|\|\||\band\b|\bor\b)\s*/i);
    _clauses.forEach(function(cl){
      var _m=cl.match(/^(.+?)\s*(===|==|!=|<=|>=|<|>)\s*(.+)$/);
      if(_m){
        var _lhs=_m[1].trim().replace(/^["']|["']$/g,'');
        var _rhs=_m[3].trim().replace(/^["']|["']$/g,'');
        [_lhs,_rhs].forEach(function(v){ if(v && !/^\$\{?[\w가-힣]+\}?$/.test(v) && !_seen[v]){ _seen[v]=1; _out.push(v); } });   // ${var...} 원문 제외
      } else {
        var _t=cl.trim(); if(_t && !/^\$\{?[\w가-힣]+\}?$/.test(_t) && !_seen[_t]){ _seen[_t]=1; _out.push(_t); }
      }
    });
    return _out;
  }
  return [];
}
// 조건1: Fail 사유를 '판정기준(기대) vs 장비 조회값' 으로 세세하게 (같은 항목의 실제 조회값과 비교)
function _failDetail(c, shown, tcid){
  const tp=c.type||'contains'; const arr=shown||[]; const out=arr.join('\n');
  const _val=function(line){ const m=String(line).match(/[:=]\s*(.+)$/); return m?m[1].trim():String(line).trim(); };
  if(tp==='contains_all'||tp==='contains'){
    const toks=(tp==='contains_all'?String(c.criteria||'').split(/\r?\n/):[String(c.criteria||'')]).map(function(s){return s.trim();}).filter(Boolean);
    const lines=[];
    toks.forEach(function(t){
      if(out.indexOf(t)>=0) return;
      const m=t.match(/^(.*?)\s*[:=]\s*(.+)$/);
      if(m){ const key=m[1].trim(), expVal=m[2].trim(); const actLine=arr.find(function(l){return l.indexOf(key)>=0;});
        if(actLine) lines.push('• ['+key+'] 기대 「'+expVal+'」  ≠  조회 「'+_val(actLine)+'」');
        else lines.push('• ['+key+'] 항목을 조회 결과에서 찾지 못함 (기대 「'+expVal+'」)');
      } else { lines.push('• 「'+t+'」 — 조회 결과에 이 값이 없음'); }
    });
    return lines.length?('판정기준과 장비 조회값 비교 — 불일치 '+lines.length+'건:\n'+lines.join('\n')):'판정기준 불충족';
  }
  if(tp==='line'){ const cr=String(c.criteria||''); const ci=cr.indexOf(':'); const key=(ci>=0?cr.slice(0,ci):cr).trim(); const expVal=(ci>=0?cr.slice(ci+1):'').trim(); const actLine=arr.find(function(l){return l.indexOf(key)>=0;}); if(!actLine) return '['+key+'] 항목을 조회 결과에서 찾지 못함'; return '['+key+'] 기대 「'+expVal+'」  ≠  조회 「'+_val(actLine)+'」'; }
  if(tp==='expr'){ const gn=_goldenVar(c); if(gn){ const gold=_varVal(tcid,gn); const live=_extractVar(out, _subVars(_extractRuleFor(c,gn),tcid)); return '변수 ${'+gn+'} 비교 — 불일치:\n• 기대(저장값) 「'+String(gold==null?'':gold)+'」\n• 장비 조회값 「'+String(live)+'」'; } return '식 평가 거짓: '+_subVars(c.criteria,tcid); }
  if(tp==='notcontains'){ const cr=String(c.criteria||'').trim(); const ln=arr.find(function(l){return l.indexOf(cr)>=0;}); return ln?('있으면 안 되는 「'+cr+'」 가 조회됨 → '+String(ln).trim()):'기준 불충족'; }
  if(tp==='table'){ try{ return _judgeTable(out, _subVars(c.criteria,tcid)).detail; }catch(e){ return '표 검증 불충족'; } }
  if(tp==='diff'){ return _judgeDiff(out, c.baseline, c.excludeLines).detail; }
  return _judgeReason(out, _subVars(c.criteria,tcid), tp, c.excludeLines, 'Fail')||'판정기준 불충족';
}
// 방법 A: 표 컬럼 클릭 → 모든 행이 그 컬럼=값(최빈값) 검사 (table 타입)// 표 검증 팝업: CLI 결과 표를 보여주고, 클릭한 셀의 컬럼=값을 판정기준으로
var _tblVerify=null;
function _tblVerifyClose(){ _tblVerify=null; const ov=document.getElementById('tc-tbl-verify'); if(ov) ov.remove(); }
function tcTableVerify(tcid){
  const tc=_tcById(tcid); const c=tc&&(tc.checks||[]).find(x=>x.id===_respStepId[tcid]); if(!c){ showToast('먼저 스텝을 선택하세요'); return; }
  const shown=_respShownLines(c); const t=_tableCols(shown.join('\n')); if(!t){ showToast('표(--- 구분선)를 인식하지 못했습니다'); return; }
  _tblVerify={tcid:tcid, id:c.id};
  const exo=document.getElementById('tc-tbl-verify'); if(exo) exo.remove();
  const esc=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');};
  const data=t.lines.slice(t.sep+1).filter(function(l){return l.trim();});
  // ★ 자동 생성 안 함 — 헤더를 '클릭한 열만' col 변수로 추가/제거(토글). 기존 colVars는 유지.
  c.colVars=c.colVars||{}; c.colNames=c.colNames||{};
  const _cn=t.headers.map(function(h,i){return 'col'+(i+1);});   // colN = 그 열의 위치(col1=1열, col2=2열 …)
  let html='<div style="width:min(960px,96vw);max-height:88vh;overflow:auto;background:#fff;border-radius:14px;box-shadow:0 24px 64px rgba(0,0,0,0.4);padding:18px 20px;">';
  html+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;"><i class="ti ti-table-options" style="color:#2d6fd4;font-size:18px;"></i><span style="font-size:15px;font-weight:800;color:#1a2236;">표에서 기준 값 선택 — 헤더 클릭 = col 변수 추가/제거</span><span style="flex:1;"></span><i class="ti ti-x" onclick="_tblVerifyClose()" style="cursor:pointer;font-size:20px;color:#8a93a5;"></i></div>';
  html+='<div style="font-size:12px;color:var(--text3);margin-bottom:10px;line-height:1.65;"><b>헤더를 클릭</b>하면 그 열만 <b style="color:#7c3aed;font-family:ui-monospace,monospace;">colN</b> 변수로 추가됩니다(다시 클릭 = 제거). <b style="color:#2d6fd4;">colN의 N = 그 열 위치</b>(예: 값이 3번째 열이면 <b style="color:#7c3aed;font-family:ui-monospace,monospace;">col3</b>). IF·For에서 <b style="color:#7c3aed;font-family:ui-monospace,monospace;">col3(\'$i\')</b> 처럼 사용 — 행 1~'+data.length+'.</div>';
  html+='<table style="border-collapse:collapse;font-family:ui-monospace,monospace;font-size:12px;width:100%;"><thead><tr>';
  html+='<th style="padding:4px 8px;border-bottom:2px solid #c4cad3;background:#f1f3f7;color:#9aa1ad;font-size:10px;font-weight:700;">행</th>';
  t.headers.forEach(function(h,ci){ var _on=!!c.colVars[_cn[ci]]; html+='<th data-tcol="'+ci+'" onclick="tcTableColPick('+ci+')" title="클릭 → '+_cn[ci]+' 추가/제거" style="text-align:left;padding:5px 10px;border-bottom:2px solid '+(_on?'#16804a':'#c4cad3')+';background:'+(_on?'rgba(22,128,74,0.14)':'#eef4ff')+';color:#1c2230;white-space:nowrap;cursor:pointer;" onmouseenter="_tblHoverCol('+ci+',1)" onmouseleave="_tblHoverCol('+ci+',0)">'+esc(h||'-')+'<br><span style="font-size:10px;color:'+(_on?'#16804a':'#2d6fd4')+';font-weight:800;font-family:ui-monospace,monospace;">'+(_on?'✓ ':'')+_cn[ci]+'</span> <span style="font-size:9px;color:'+(_on?'#16804a':'#b6bdc9')+';">'+(_on?'(제거하려면 클릭)':'(클릭=추가)')+'</span></th>'; });
  html+='</tr></thead><tbody>';
  data.forEach(function(row,ri){ html+='<tr><td style="padding:3px 8px;border-bottom:1px solid #eef0f4;color:#9aa1ad;font-size:10px;text-align:right;">'+(ri+1)+'</td>'; t.headers.forEach(function(h,ci){ const cv=t.cell(row,ci); html+='<td data-tcol="'+ci+'" style="padding:3px 10px;border-bottom:1px solid #eef0f4;white-space:nowrap;color:#1c2230;">'+esc(cv||' ')+'</td>'; }); html+='</tr>'; });
  html+='</tbody></table></div>';
  const ov=document.createElement('div'); ov.id='tc-tbl-verify';
  ov.style.cssText='position:fixed;inset:0;z-index:100007;background:rgba(15,22,38,0.55);display:flex;align-items:center;justify-content:center;';
  ov.innerHTML=html;
  ov.addEventListener('mousedown',function(e){ ov._downBg=(e.target===ov); });
  ov.onclick=function(e){ if(e.target===ov && ov._downBg) _tblVerifyClose(); };
  document.body.appendChild(ov);
}
async function tcTableColPick(ci){
  const st=_tblVerify; if(!st) return; const tc=_tcById(st.tcid); const c=tc&&(tc.checks||[]).find(x=>x.id===st.id); if(!c) return;
  const shown=_respShownLines(c); const t=_tableCols(shown.join('\n')); if(!t){ showToast('표 인식 실패'); return; }
  const data=t.lines.slice(t.sep+1).filter(function(l){return l.trim();});
  const key='col'+(ci+1); c.colVars=c.colVars||{}; c.colNames=c.colNames||{};
  if(c.colVars[key]){ delete c.colVars[key]; delete c.colNames[key]; showToast(key+' 제거됨'); }   // 토글: 이미 col이면 제거
  else { c.colVars[key]=data.map(function(row){ return t.cell(row,ci); }); c.colNames[key]=String(t.headers[ci]||'').trim()||('열'+(ci+1)); var v0=c.colVars[key][0]!=null?c.colVars[key][0]:''; showToast('['+(t.headers[ci]||'')+'] → '+key+' 추가  예: '+key+"('1')="+v0); }
  try{ await saveTCFile(tc); }catch(e){}
  _respStepId=_respStepId||{}; _respStepId[st.tcid]=st.id;   // 재오픈 대상 스텝 고정(재렌더로 틀어짐 방지)
  tcTableVerify(st.tcid);   // 팝업 다시 그려 ✓ 강조 갱신
  try{ tcProcRefresh(st.tcid); }catch(e){}   // 스텝 목록 변수표시 갱신(팝업은 위에서 이미 재오픈)
}
// 팝업 헤더 마우스오버 → 그 컬럼(헤더+모든 행 셀)을 강조 (어떤 값들이 colN 변수가 되는지 표시)
function _tblHoverCol(ci,on){
  try{ document.querySelectorAll('#tc-tbl-verify [data-tcol="'+ci+'"]').forEach(function(el){ var th=(el.tagName==='TH'); el.style.background=on?'rgba(45,111,212,0.18)':(th?'#eef4ff':''); el.style.outline=on?'2px solid rgba(45,111,212,0.55)':''; el.style.outlineOffset=on?'-2px':''; }); }catch(e){}
}
// Fail 발생 '지점' 줄 집합 (CLI 결과에서 빨간 강조용)
function _failLineSet(c, shown, tcid){
  const set=new Set(); if(!c||c.repeatResult!=='Fail') return set; const tp=c.type||'contains'; const arr=shown||[]; const out=arr.join('\n');
  if(tp==='table'){ const t=_tableCols(out); if(!t) return set; let r; try{ r=_judgeTable(out, _subVars(c.criteria,tcid)); }catch(e){ return set; }
    ((r&&r.fails)||[]).forEach(function(f){ const rn=String(f).split('→')[0].trim(); if(!rn) return; const idx=arr.findIndex(function(l){return String(l).trim().split(/\s+/)[0]===rn;}); if(idx>=0) set.add(idx+1); }); return set; }
  if(tp==='notcontains'){ const cr=String(c.criteria||'').trim(); arr.forEach(function(l,i){ if(cr&&l.indexOf(cr)>=0) set.add(i+1); }); return set; }
  if(tp==='contains_all'||tp==='contains'||tp==='line'){ _critTokens(c).forEach(function(t){ const m=String(t).match(/^(.*?)\s*[:=]\s*(.+)$/); if(m){ const key=m[1].trim(), exp=m[2].trim(); const idx=arr.findIndex(function(l){return l.indexOf(key)>=0;}); if(idx>=0 && String(arr[idx]).indexOf(exp)<0) set.add(idx+1); } }); return set; }
  return set;
}
// 표 검증: 지정 컬럼(ci)의 셀 값만 강조 — 기대값 일치=초록(Pass), 불일치=빨강(Fail)
// Response 표: 모든 컬럼 셀을 박스로 강조 (각 셀 = colN('행') 변수) — 변수로 잡히는 부분 표시
function _hlTableAllCells(line, t, rowNum){
  var esc=function(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');};
  var s=String(line); var out=''; var pos=0;
  var _rs=(t.lineRanges)?t.lineRanges(s):t.ranges;   // SNMP 등 가변폭은 줄별 셀 위치
  for(var ci=0;ci<_rs.length;ci++){
    var r=_rs[ci]; var end=(t.lineRanges)?r[1]:((ci===_rs.length-1)?Math.max(s.length,r[1]):r[1]);
    if(r[0]>pos){ out+=esc(s.slice(pos,r[0])); pos=r[0]; }
    var seg=s.slice(r[0],end); var ti=seg.search(/\S/);
    if(ti>=0){ var te=seg.length; while(te>ti && /\s/.test(seg.charAt(te-1))) te--;
      out+=esc(seg.slice(0,ti))+'<span title="'+(((t.colNames&&t.colNames[ci])||('col'+(ci+1)))+'(\''+rowNum+'\')')+'" style="background:rgba(45,111,212,0.10);outline:1px solid rgba(45,111,212,0.45);border-radius:2px;">'+esc(seg.slice(ti,te))+'</span>'+esc(seg.slice(te));
    } else { out+=esc(seg); }
    pos=end;
  }
  if(pos<s.length) out+=esc(s.slice(pos));
  return out;
}
function _hlTableLine(line, t, ci, expVal){
  const esc=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');};
  const _rs=(t.lineRanges)?t.lineRanges(String(line)):t.ranges; const r=_rs[ci]; if(!r) return esc(line);
  const last=(ci===_rs.length-1); const end=(t.lineRanges)?r[1]:(last?Math.max(String(line).length, r[1]):r[1]);
  const segRaw=String(line).slice(r[0], end); const cv=segRaw.trim(); if(!cv) return esc(line);
  const cvStart=segRaw.indexOf(cv); const ev=String(expVal||'').trim().toLowerCase(); const cvl=cv.toLowerCase();
  const match=(ev==='*')?(cv!==''):((ev.indexOf(',')>=0)?(ev.split(',').map(function(x){return x.trim();}).indexOf(cvl)>=0):(cvl===ev));
  const color=match?'#04543a':'#a01f33'; const bg=match?'rgba(0,168,114,0.32)':'rgba(229,62,90,0.28)';
  const pre=esc(String(line).slice(0,r[0])+segRaw.slice(0,cvStart));
  const mid='<span style="background:'+bg+';color:'+color+';font-weight:700;border-radius:2px;padding:0 1px;">'+esc(cv)+'</span>';
  const post=esc(segRaw.slice(cvStart+cv.length)+String(line).slice(end));
  return pre+mid+post;
}
// TC별 변수 패널 접힘 상태 — {tcid: false=접힘, 그 외/undefined=펼침}. tcVarPanelToggle(6355)에서 갱신.
// 이 변수가 선언 안 돼 있어서 변수 1개 이상 가진 TC 인라인이 렌더 시 ReferenceError로 열리지 않던 버그(부팅 시험 TC 등) 수정.
var _varPanelOpen = _varPanelOpen || {};
// ── 조건1·2·3·5: Expected Result 셀 (줄바꿈 표시 + 변수 우클릭) ──
function _respVarPanel(tcid){
  const tc=_tcById(tcid); const pv=_procVars[tcid]||{};
  // 현재 스텝이 정의하는 변수만 라이브로 집계(추출 변수 + ${var}= 대입) → 삭제된 스텝의 잔류 변수 제외
  const all={}; const _live={};
  if(tc){ (tc.checks||[]).forEach(function(c){
    try{ _stepExtracts(c).forEach(function(e){ if(e&&e.var)_live[e.var]=1; }); }catch(_e){}
    var _t=[c.desc,c.cli,c.formula,c.action,c.assign].filter(Boolean).join('\n');
    var _re=/\$\{\s*([A-Za-z_]\w*)\s*\}\s*=/g, _mm; while((_mm=_re.exec(_t))){ _live[_mm[1]]=1; }
    // for/loop 스텝의 반복 변수(c.loopVar, 기본 'i')도 라이브 처리 — 실행 중 _procVars에 세팅되므로
    // 잔류 정리(delete pv[k])에서 지워지면 자식 스텝에서 ${i} 치환이 안 됨.
    if((c.kind||'cli')==='loop' && (c.loopMode||'')==='for'){
      var _lv=String(c.loopVar||'i').trim(); if(_lv) _live[_lv]=1;
    }
  }); }
  const _isMan=function(k){ try{ return (typeof _varIsManual==='function')&&_varIsManual(tc,k); }catch(e){ return false; } };
  // Query 변수(c.queries[].var)는 스텝 실행 결과에서 추출되는 값 저장소 → 잔류분 정리 대상에서 반드시 제외.
  // 이걸 안 하면 드래그로 Query 지정 → _procVars[tcid][varN]=값 저장됐다가, 다음 tcProcRefresh(스텝 접기·펴기 등)에서
  // _live에 못 잡혀 delete pv[k] 되어 값이 사라지고 Query 패널이 (미실행)으로 표시되는 버그.
  const _qset=_tcQueryVarSet(tc);
  Object.keys(_live).forEach(function(k){ all[k]=1; });
  Object.keys(pv).forEach(function(k){ if(_live[k]||_isMan(k)||_qset[k]) all[k]=1; else delete pv[k]; });   // 잔류분(현재 스텝이 정의 안 함·골든 아님·Query 아님)만 캐시에서 정리
  if(tc&&tc.varVals) Object.keys(tc.varVals).forEach(function(k){ if(_live[k]||_isMan(k)) all[k]=1; });   // 골든(수동) 변수는 유지
  Object.keys(_qset).forEach(function(k){ delete all[k]; });   // Query 변수는 변수 목록에서 빼고 Query 패널에서만 관리(#4)
  const names=Object.keys(all); if(!names.length) return '';
  const open=_varPanelOpen[tcid]!==false;
  // 동시 실행: 장비 칩 선택 시 그 장비의 변수 값 표시 (전역 last-write 대신)
  var _di=(typeof _respDevSel!=='undefined'&&_respDevSel&&_respDevSel[tcid]!=null)?_respDevSel[tcid]:-2;
  var _dvars=(_di>=0 && window._procVarsDev && window._procVarsDev[tcid] && window._procVarsDev[tcid][_di])?window._procVarsDev[tcid][_di]:null;
  var _dname=''; if(_dvars){ try{ var _st=(tc.checks||[]).find(function(c){return Array.isArray(c.devResults)&&c.devResults[_di];}); if(_st) _dname=_st.devResults[_di].dev||''; }catch(e){} }
  const _devHint=_dvars?(' <span style="font-size:9.5px;color:#c2410c;font-weight:700;">· 장비 ['+String(_dname).replace(/&/g,'&amp;').replace(/</g,'&lt;')+'] 기준</span>'):'';
  const head='<div onclick="tcVarPanelToggle(\''+tcid+'\')" style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:11px;font-weight:800;color:#2d6fd4;"><i class="ti ti-caret-'+(open?'down':'right')+'-filled" style="font-size:13px;"></i><i class="ti ti-variable"></i> 변수 ('+names.length+')'+_devHint+'<span style="flex:1;"></span><span style="font-size:10px;color:var(--text3);font-weight:500;">우클릭=수정/삭제</span></div>';
  if(!open) return '<div style="margin:0 0 8px;border:1px solid rgba(45,111,212,0.22);border-radius:7px;padding:6px 9px;background:rgba(45,111,212,0.05);">'+head+'</div>';
  const rows=names.map(function(n){ const v=(_dvars&&Object.prototype.hasOwnProperty.call(_dvars,n))?_dvars[n]:_varVal(tcid,n); const man=_varIsManual(tc,n);
    return '<div oncontextmenu="event.preventDefault();event.stopPropagation();tcVarChipMenu(event,\''+tcid+'\',\''+String(n).replace(/[\\\\\x27]/g,'')+'\');return false;" style="display:flex;align-items:center;gap:7px;font-size:11.5px;padding:3px 7px;border-radius:5px;background:#fff;border:1px solid #e6eaf2;">'
      +'<span style="font-family:ui-monospace,monospace;color:#7c3aed;font-weight:800;flex-shrink:0;">${'+n+'}</span>'+(man?'<span style="font-size:8.5px;color:#c026d3;border:1px solid #e9c6f0;border-radius:3px;padding:0 3px;flex-shrink:0;">골든</span>':'')
      +'<span style="color:var(--text3);flex-shrink:0;">=</span><span onclick="tcVarView(\''+tcid+'\',\''+String(n).replace(/[\\\\\x27]/g,'')+'\')" title="클릭=값 보기/편집" style="cursor:pointer;flex:1;min-width:0;font-family:ui-monospace,monospace;color:var(--text);font-weight:600;white-space:pre-wrap;word-break:break-all;">'+String(v==null?'(미추출)':v).replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</span>'
      +'<i class="ti ti-pencil" onclick="tcVarView(\''+tcid+'\',\''+String(n).replace(/[\\\\\x27]/g,'')+'\')" title="수정" style="cursor:pointer;color:#2d6fd4;font-size:13px;flex-shrink:0;"></i>'
      +'<i class="ti ti-trash" onclick="tcVarDelete(\''+tcid+'\',\''+String(n).replace(/[\\\\\x27]/g,'')+'\')" title="삭제" style="cursor:pointer;color:#c0392b;font-size:13px;flex-shrink:0;"></i></div>';
  }).join('');
  return '<div style="margin:0 0 8px;border:1px solid rgba(45,111,212,0.22);border-radius:7px;padding:6px 9px;background:rgba(45,111,212,0.05);">'+head+'<div style="display:flex;flex-direction:column;gap:4px;margin-top:6px;">'+rows+'</div></div>';
}
// 표시용: 마커 제거 + 끝 빈줄 제거한 원본 줄 배열 (줄번호는 판정 엔진과 동일하게 1부터)
// [알림] 계열 프리픽스 제거 — 저장된 옛 output(백엔드가 [알림] 붙였던 시절)에도 적용
function _stripNoticeLines(s){ return String(s||'').replace(/^\s*\[알림\][^\n]*\n?/mg,''); }
function _respShownLines(c){
  const clean=String((c&&c.output)||'').replace(/^\s*\[알림\][^\n]*\n?/mg,'').replace(/\n*─── 기준 비교 ───[\s\S]*$/,'').replace(/\n*─── 표 검증 ───[\s\S]*$/,'').replace(/\n*─── 판정 근거 ───[\s\S]*$/,'').replace(/\n*─── Query 영역[\s\S]*$/,'');
  const raw=clean.split(/\r?\n/); let last=raw.length; while(last>0 && !String(raw[last-1]).trim()) last--;
  return raw.slice(0,Math.min(last,500));
}
function _respRefresh(tcid){ const el=document.getElementById('tc-resp-body-'+tcid); if(el){ el.innerHTML=_respBody(tcid); } else { tcProcRefresh(tcid); } if(typeof _critViewRefresh==='function') _critViewRefresh(); }
let _respDevSel={};   // {tcid: 선택 장비 index (-1=전체)} — 다중장비 결과 보기
function tcRespDevPick(tcid, idx){ _respDevSel=_respDevSel||{}; _respDevSel[tcid]=idx; _respRefresh(tcid); }
// ── Test Data 우클릭 → 변수 메뉴 (추가 / 목록·값 보기 / 삽입) ──
function _tcQueryVarSet(tc){ var s={}; ((tc&&tc.checks)||[]).forEach(function(c){ (Array.isArray(c.queries)?c.queries:(c.query?[{q:c.query,var:c.queryVar||'var1'}]:[])).forEach(function(q){ if(q&&q.var) s[String(q.var).trim()]=1; }); }); return s; }   // 이 TC의 모든 Query 변수명 집합
function _tcAllVars(tcid){ const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid));
  // 현재 스텝이 정의하는 변수만 라이브 집계(query·추출·${var}= 대입) → 삭제된 스텝/다른 TC의 잔류 변수 제외
  var live={};
  ((tc&&tc.checks)||[]).forEach(function(c){
    (Array.isArray(c.queries)?c.queries:[]).forEach(function(q){ if(q&&q.var)live[q.var]=1; });
    if(c.queryVar)live[c.queryVar]=1; if(c.extractVar)live[c.extractVar]=1;
    (Array.isArray(c.extracts)?c.extracts:[]).forEach(function(ex){ if(ex&&ex.var)live[ex.var]=1; });
    try{ if(typeof _stepExtracts==='function')_stepExtracts(c).forEach(function(e){ if(e&&e.var)live[e.var]=1; }); }catch(_e){}
    var _t=[c.desc,c.cli,c.formula,c.action,c.assign].filter(Boolean).join('\n');
    var _re=/\$\{\s*([A-Za-z_]\w*)\s*\}\s*=/g, _mm; while((_mm=_re.exec(_t))){ live[_mm[1]]=1; }
  });
  var pv=(typeof _procVars!=='undefined'&&_procVars[tcid])||{}; var vv=(tc&&tc.varVals)||{};
  var _isMan=function(k){ try{ return (typeof _varIsManual==='function')?_varIsManual(tc,k):(tc&&tc.varManual&&tc.varManual[k]); }catch(e){ return false; } };
  var out={};
  Object.keys(live).forEach(function(k){ out[k]=(pv[k]!=null?pv[k]:(vv[k]!=null?vv[k]:'')); });
  Object.keys(vv).forEach(function(k){ if(_isMan(k)&&out[k]==null)out[k]=vv[k]; });   // 골든(수동) 변수 유지
  Object.keys(pv).forEach(function(k){ if(_isMan(k)&&out[k]==null)out[k]=pv[k]; });
  return out;
}   // 선언된 변수(실행 전 포함) → IF/삽입 가능, 잔류분은 제외
function tcVarMenuTD(ev, tcid, id){
  ev.preventDefault(); ev.stopPropagation(); tcVarMenuClose();
  const vars=_tcAllVars(tcid); const names=Object.keys(vars);
  const esc=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');};
  const it=function(ic,col,lab,oc){ return '<div onmousedown="event.preventDefault()" onclick="tcVarMenuClose();'+oc+'" style="padding:8px 14px;font-size:12.5px;font-weight:600;color:#1c1f27;cursor:pointer;display:flex;align-items:center;gap:8px;white-space:nowrap;" onmouseenter="this.style.background=\'#eef4ff\'" onmouseleave="this.style.background=\'#fff\'"><i class="ti '+ic+'" style="font-size:15px;color:'+col+';"></i>'+lab+'</div>'; };
  let html=it('ti-variable-plus','#7c3aed','변수 추가','tcVarAddManual(\''+tcid+'\')')+it('ti-list-details','#2d6fd4','변수 목록·값 보기','tcVarListPopup(\''+tcid+'\')');
  if(names.length){ html+='<div style="height:1px;background:#eef0f4;margin:4px 0;"></div><div style="padding:3px 14px 4px;font-size:10px;font-weight:800;color:#9aa1ad;">변수 삽입 (클릭 → ${변수})</div>'
    +names.map(function(n){ return '<div onmousedown="event.preventDefault()" onclick="tcVarMenuClose();tcVarInsert(\''+tcid+'\',\''+id+'\',\''+String(n).replace(/[\\\\\x27]/g,'')+'\')" style="padding:6px 14px;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:14px;" onmouseenter="this.style.background=\'#f3eefe\'" onmouseleave="this.style.background=\'#fff\'"><span style="font-family:ui-monospace,monospace;color:#7c3aed;font-weight:700;">${'+esc(n)+'}</span><span style="color:var(--text3);font-size:11px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(vars[n])+'</span></div>'; }).join(''); }
  // ── GP 변수 열기 버튼 ──
  html+='<div style="height:1px;background:#eef0f4;margin:4px 0;"></div>'
    +it('ti-variable','#7c3aed','Global Parameters 선택…','tcGpVarPopup(\''+tcid+'\',\''+id+'\')');
  const m=document.createElement('div'); m.id='tc-var-menu'; m.style.cssText='position:fixed;z-index:100002;background:#fff;border:1px solid #d2d7e0;border-radius:9px;box-shadow:0 10px 32px rgba(30,40,80,0.22);padding:4px 0;font-family:inherit;min-width:210px;max-height:62vh;overflow:auto;'; m.innerHTML=html;
  document.body.appendChild(m);
  let x=ev.clientX,y=ev.clientY; if(x+230>window.innerWidth)x=Math.max(8,window.innerWidth-240); if(y+320>window.innerHeight)y=Math.max(8,window.innerHeight-330); m.style.left=x+'px'; m.style.top=y+'px';
  setTimeout(function(){document.addEventListener('click',tcVarMenuClose);},0);
}
// ── 판정기준 우클릭 변수 메뉴 ──
function tcVarMenuCrit(ev, tcid, id){
  ev.preventDefault(); ev.stopPropagation(); tcVarMenuClose();
  const vars=_tcAllVars(tcid); const names=Object.keys(vars);
  const esc=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');};
  const it=function(ic,col,lab,oc){ return '<div onmousedown="event.preventDefault()" onclick="tcVarMenuClose();'+oc+'" style="padding:8px 14px;font-size:12.5px;font-weight:600;color:#1c1f27;cursor:pointer;display:flex;align-items:center;gap:8px;white-space:nowrap;" onmouseenter="this.style.background=\'#eef4ff\'" onmouseleave="this.style.background=\'#fff\'"><i class="ti '+ic+'" style="font-size:15px;color:'+col+';"></i>'+lab+'</div>'; };
  let html='';
  if(names.length){ html+='<div style="padding:3px 14px 4px;font-size:10px;font-weight:800;color:#9aa1ad;">변수 삽입 (클릭 → ${변수})</div>'
    +names.map(function(n){ return '<div onmousedown="event.preventDefault()" onclick="tcVarMenuClose();tcVarInsertCritEl(\''+tcid+'\',\''+id+'\',\''+String(n).replace(/[\\\\\x27]/g,'')+'\')" style="padding:6px 14px;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:14px;" onmouseenter="this.style.background=\'#f3eefe\'" onmouseleave="this.style.background=\'#fff\'"><span style="font-family:ui-monospace,monospace;color:#7c3aed;font-weight:700;">${'+esc(n)+'}</span><span style="color:var(--text3);font-size:11px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(vars[n])+'</span></div>'; }).join('');
    html+='<div style="height:1px;background:#eef0f4;margin:4px 0;"></div>';
  }
  html+=it('ti-variable','#7c3aed','Global Parameters 선택…','tcGpVarPopupCrit(\''+tcid+'\',\''+id+'\')');
  const m=document.createElement('div'); m.id='tc-var-menu'; m.style.cssText='position:fixed;z-index:100002;background:#fff;border:1px solid #d2d7e0;border-radius:9px;box-shadow:0 10px 32px rgba(30,40,80,0.22);padding:4px 0;font-family:inherit;min-width:210px;max-height:62vh;overflow:auto;'; m.innerHTML=html;
  document.body.appendChild(m);
  let x=ev.clientX,y=ev.clientY; if(x+230>window.innerWidth)x=Math.max(8,window.innerWidth-240); if(y+320>window.innerHeight)y=Math.max(8,window.innerHeight-330); m.style.left=x+'px'; m.style.top=y+'px';
  setTimeout(function(){document.addEventListener('click',tcVarMenuClose);},0);
}
function tcVarInsertCritEl(tcid, id, varname){
  var ins='${'+varname+'}';
  var el=document.querySelector('[data-gp-crit="'+id+'"]');
  if(el){ var s=el.selectionStart||0,e2=el.selectionEnd||0; el.focus(); el.value=el.value.slice(0,s)+ins+el.value.slice(e2); el.setSelectionRange(s+ins.length,s+ins.length); tcCheckSave(tcid,id,'criteria',el.value); }
  else { var _tc=tcList.find(function(t){return t.tcid===tcid||t.id===tcid;}); var _cc=_tc&&(_tc.checks||[]).find(function(x){return x.id===id;}); if(_cc){_cc.criteria=String(_cc.criteria||'')+ins;tcCheckSave(tcid,id,'criteria',_cc.criteria);} }
}

// ── Query 우클릭 변수 메뉴 ──
function tcVarMenuQuery(ev, tcid, id){
  ev.preventDefault(); ev.stopPropagation(); tcVarMenuClose();
  const vars=_tcAllVars(tcid); const names=Object.keys(vars);
  const esc=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');};
  const it=function(ic,col,lab,oc){ return '<div onmousedown="event.preventDefault()" onclick="tcVarMenuClose();'+oc+'" style="padding:8px 14px;font-size:12.5px;font-weight:600;color:#1c1f27;cursor:pointer;display:flex;align-items:center;gap:8px;white-space:nowrap;" onmouseenter="this.style.background=\'#eef4ff\'" onmouseleave="this.style.background=\'#fff\'"><i class="ti '+ic+'" style="font-size:15px;color:'+col+';"></i>'+lab+'</div>'; };
  let html='';
  if(names.length){ html+='<div style="padding:3px 14px 4px;font-size:10px;font-weight:800;color:#9aa1ad;">변수 삽입 (클릭 → ${변수})</div>'
    +names.map(function(n){ return '<div onmousedown="event.preventDefault()" onclick="tcVarMenuClose();tcVarInsertQueryEl(\''+tcid+'\',\''+id+'\',\''+String(n).replace(/[\\\\\x27]/g,'')+'\')" style="padding:6px 14px;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:14px;" onmouseenter="this.style.background=\'#f3eefe\'" onmouseleave="this.style.background=\'#fff\'"><span style="font-family:ui-monospace,monospace;color:#7c3aed;font-weight:700;">${'+esc(n)+'}</span><span style="color:var(--text3);font-size:11px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(vars[n])+'</span></div>'; }).join('');
    html+='<div style="height:1px;background:#eef0f4;margin:4px 0;"></div>';
  }
  html+=it('ti-variable','#7c3aed','Global Parameters 선택…','tcGpVarPopupQuery(\''+tcid+'\',\''+id+'\')');
  const m=document.createElement('div'); m.id='tc-var-menu'; m.style.cssText='position:fixed;z-index:100002;background:#fff;border:1px solid #d2d7e0;border-radius:9px;box-shadow:0 10px 32px rgba(30,40,80,0.22);padding:4px 0;font-family:inherit;min-width:210px;max-height:62vh;overflow:auto;'; m.innerHTML=html;
  document.body.appendChild(m);
  let x=ev.clientX,y=ev.clientY; if(x+230>window.innerWidth)x=Math.max(8,window.innerWidth-240); if(y+320>window.innerHeight)y=Math.max(8,window.innerHeight-330); m.style.left=x+'px'; m.style.top=y+'px';
  setTimeout(function(){document.addEventListener('click',tcVarMenuClose);},0);
}
function tcVarInsertQueryEl(tcid, id, varname){
  var ins='${'+varname+'}';
  var el=document.querySelector('[data-gp-query="'+id+'"]');
  if(el){ var s=el.selectionStart||0,e2=el.selectionEnd||0; el.focus(); el.value=el.value.slice(0,s)+ins+el.value.slice(e2); el.setSelectionRange(s+ins.length,s+ins.length); tcCheckSave(tcid,id,'query',el.value); }
  else { var _tc=tcList.find(function(t){return t.tcid===tcid||t.id===tcid;}); var _cc=_tc&&(_tc.checks||[]).find(function(x){return x.id===id;}); if(_cc){_cc.query=String(_cc.query||'')+ins;tcCheckSave(tcid,id,'query',_cc.query);} }
}

function tcGpVarInsertTD(tcid,id,name,model){
  // name: "varname", model: "E5724RL"|"__global__"
  // 삽입 텍스트: [E5724RL/varname] 또는 [전역/varname]
  var prefix=(model&&model!=='__global__')?(model+'/'):('전역/');
  var ins='['+prefix+name+']';
  var el=document.querySelector('[data-cliid="'+id+'"]');
  if(!el){
    var _tc=tcList.find(function(t){return t.tcid===tcid||t.id===tcid;}); var _cc=_tc&&(_tc.checks||[]).find(function(x){return x.id===id;});
    if(_cc){ _cc.cli=String(_cc.cli||'')+ins; tcCheckSave(tcid,id,'cli',_cc.cli); }
    return;
  }
  el.focus();
  var ok=false; try{ ok=document.execCommand('insertText',false,ins); }catch(e){}
  if(!ok){ el.textContent=(el.textContent||'')+ins; }
  tcCheckSave(tcid,id,'cli',(el.innerText||el.textContent||'').trim());
  if(typeof showToast==='function') showToast('GP 변수 '+ins+' 삽입');
}

// ── GP 변수 삽입 — 판정기준(criteria) input용 ──
function tcGpVarInsertCrit(tcid, cid, name, model){
  var prefix=(model&&model!=='__global__')?(model+'/'):('전역/');
  var ins='['+prefix+name+']';
  var el=document.getElementById('crit-'+cid);
  if(el){
    var s=el.selectionStart||0, e2=el.selectionEnd||0;
    el.focus();
    el.value=el.value.slice(0,s)+ins+el.value.slice(e2);
    el.setSelectionRange(s+ins.length, s+ins.length);
    tcCheckSave(tcid, cid, 'criteria', el.value);
  } else {
    var _tc=tcList.find(function(t){return t.tcid===tcid||t.id===tcid;});
    var _cc=_tc&&(_tc.checks||[]).find(function(x){return x.id===cid;});
    if(_cc){ _cc.criteria=String(_cc.criteria||'')+ins; tcCheckSave(tcid,cid,'criteria',_cc.criteria); }
  }
  if(typeof showToast==='function') showToast('GP 변수 '+ins+' 삽입');
}

// ── GP 변수 삽입 — Query input용 ──
function tcGpVarInsertQuery(tcid, cid, name, model){
  var prefix=(model&&model!=='__global__')?(model+'/'):('전역/');
  var ins='['+prefix+name+']';
  var el=document.querySelector('[data-gp-query="'+cid+'"]');
  if(el){
    var s=el.selectionStart||0, e2=el.selectionEnd||0;
    el.focus();
    el.value=el.value.slice(0,s)+ins+el.value.slice(e2);
    el.setSelectionRange(s+ins.length, s+ins.length);
    tcCheckSave(tcid, cid, 'query', el.value);
  } else {
    var _tc=tcList.find(function(t){return t.tcid===tcid||t.id===tcid;});
    var _cc=_tc&&(_tc.checks||[]).find(function(x){return x.id===cid;});
    if(_cc){ _cc.query=String(_cc.query||'')+ins; tcCheckSave(tcid,cid,'query',_cc.query); }
  }
  if(typeof showToast==='function') showToast('GP 변수 '+ins+' 삽입');
}

// ── GP 변수 팝업 — Query input용 (팝업 공유 함수 사용) ──
// ── GP 팝업 공통 빌더 ─────────────────────────────────────────────
function _tcGpPopOpen(title, onTreeClick, onParamClick) {
  tcVarMenuClose();
  var old = document.getElementById('tc-gp-popup'); if (old) old.remove();
  if (typeof _gpData === 'undefined') { alert('Global Parameters가 로드되지 않았습니다.'); return null; }

  var overlay = document.createElement('div');
  overlay.id = 'tc-gp-popup';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:200010;pointer-events:none;';

  var box = document.createElement('div');
  var bw = Math.min(1440, window.innerWidth - 40), bh = window.innerHeight - 40;
  box.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:'+bw+'px;height:'+bh+'px;'
    + 'background:var(--bg);border:1px solid var(--border);border-radius:10px;'
    + 'box-shadow:0 8px 32px rgba(0,0,0,0.18);display:flex;flex-direction:column;overflow:hidden;'
    + 'font-family:inherit;pointer-events:all;';

  box.innerHTML =
    '<div id="tc-gp-hdr" style="display:flex;align-items:center;gap:8px;padding:10px 14px;'
    + 'border-bottom:1px solid var(--border);flex-shrink:0;user-select:none;background:var(--bg2);border-radius:10px 10px 0 0;">'
    +   '<i class="ti ti-variable" style="color:var(--blue);font-size:16px;pointer-events:none;flex-shrink:0;"></i>'
    +   '<span style="font-size:13px;font-weight:700;color:var(--text);flex:1;pointer-events:none;">Global Parameters 선택'+(title?' <span style="font-size:11px;font-weight:500;color:var(--text3);">— '+title+'</span>':'')+'</span>'
    +   '<kbd style="font-size:10px;color:var(--text3);background:var(--bg3);border:1px solid var(--border);border-radius:3px;padding:1px 5px;pointer-events:none;">ESC</kbd>'
    +   '<i class="ti ti-x" onclick="document.getElementById(\'tc-gp-popup\').remove()" style="cursor:pointer;color:var(--text3);font-size:16px;margin-left:4px;" onmouseenter="this.style.color=\'#ef4444\'" onmouseleave="this.style.color=\'var(--text3)\'"></i>'
    + '</div>'
    + '<div style="display:flex;flex:1;overflow:hidden;">'
    +   '<div id="tc-gp-tree" style="width:210px;flex-shrink:0;border-right:1px solid var(--border);overflow-y:auto;padding:6px 0;background:var(--bg2);"></div>'
    +   '<div id="tc-gp-params" style="flex:1;overflow-y:auto;"></div>'
    + '</div>';

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // (팝업 드래그 이동 비활성화 — 항상 화면 중앙 고정)

  // ESC 닫기
  function _gpEsc(e){ if (e.key === 'Escape'){ var p = document.getElementById('tc-gp-popup'); if (p){ p.remove(); document.removeEventListener('keydown', _gpEsc); } } }
  document.addEventListener('keydown', _gpEsc);

  // Global Parameters 최신본 로드 → 팝업이 열려 있으면 트리·파라미터 다시 그림 (실시간 반영)
  try{
    if (typeof gpLoad === 'function') gpLoad().then(function(){
      var p = document.getElementById('tc-gp-popup'); if (!p) return;
      try{
        if (window._gpPopRedraw){
          eval(window._gpPopRedraw.tree);
          eval(window._gpPopRedraw.params.replace('__MID__', (typeof _gpPopSel!=='undefined'&&_gpPopSel)||'__global__'));
        }
      }catch(e){}
    });
  }catch(e){}

  return box;
}

// 공통 트리 렌더
function _tcGpPopDrawTreeCommon(treeEl, redrawTree, redrawParams) {
  if (!treeEl || typeof _gpData === 'undefined') return;
  // 최신 데이터 로드 후 다시 그릴 수 있도록 마지막 redraw 저장 (_tcGpPopOpen의 gpLoad 갱신용)
  window._gpPopRedraw = { tree: redrawTree, params: redrawParams };
  var folders = Array.isArray(_gpData['__gp_folders__']) ? _gpData['__gp_folders__'] : [];
  var inFolder = {}, allModels = [], skip = {'__global__':1,'__gp_folders__':1};
  folders.forEach(function(f){ (f.models||[]).forEach(function(m){ inFolder[m] = f.id; }); });
  // Global Parameters 페이지와 동일: 사용자가 추가한 모델만 표시 (장비 모델 자동 병합 안 함)
  Object.keys(_gpData).forEach(function(k){ if (!skip[k] && allModels.indexOf(k)<0) allModels.push(k); });
  allModels.sort();

  function row(mid, label, depth) {
    var active = _gpPopSel === mid;
    var cnt = Array.isArray(_gpData[mid]) ? _gpData[mid].filter(function(r){ return r.name; }).length : 0;
    var badge = cnt ? '<span style="font-size:10px;color:var(--blue);background:var(--bg3);border-radius:8px;padding:1px 6px;margin-left:auto;font-weight:700;">'+cnt+'</span>' : '';
    var actSt = active ? 'background:var(--bg);border-right:2px solid var(--blue);color:var(--blue);font-weight:700;' : 'border-right:2px solid transparent;color:var(--text);font-weight:500;';
    var js = 'onclick="_gpPopSel=\''+mid+'\';'+redrawTree+';'+redrawParams.replace('__MID__', mid)+'"';
    return '<div '+js+' style="display:flex;align-items:center;gap:6px;padding:6px 10px 6px '+(10+depth*14)+'px;cursor:pointer;font-size:12px;white-space:nowrap;'+actSt+'" '
      + 'onmouseenter="if(\''+mid+'\'!==_gpPopSel)this.style.background=\'var(--bg3)\'" '
      + 'onmouseleave="if(\''+mid+'\'!==_gpPopSel)this.style.background=\'\'">'
      + label + badge + '</div>';
  }

  var h = row('__global__', '🌐 전역 (Global)', 0)
    + '<div style="height:1px;background:var(--border);margin:4px 8px;"></div>';

  folders.forEach(function(f){
    var fmods = (f.models||[]).filter(function(m){ return allModels.indexOf(m)>=0 || _gpData[m]; });
    var fCnt = fmods.reduce(function(s,m){ return s + (Array.isArray(_gpData[m]) ? _gpData[m].filter(function(r){return r.name;}).length : 0); }, 0);
    var fbadge = fCnt ? '<span style="font-size:10px;color:var(--blue);background:var(--bg3);border-radius:8px;padding:1px 6px;margin-left:auto;font-weight:700;">'+fCnt+'</span>' : '';
    h += '<div style="padding:5px 10px;font-size:11px;font-weight:700;color:var(--text3);display:flex;align-items:center;gap:4px;">📁 '+_he(f.name)+fbadge+'</div>';
    fmods.forEach(function(m){ h += row(m, '📄 ' + m, 1); });
  });

  var rootModels = allModels.filter(function(m){ return !inFolder[m]; });
  if (rootModels.length) h += '<div style="height:1px;background:var(--border);margin:4px 8px;"></div>';
  rootModels.forEach(function(m){ h += row(m, '📁 ' + m, 0); });

  treeEl.innerHTML = h;
}

// 공통 파라미터 패널 렌더
// GP 팝업 내 그룹 접힘 상태 (모델키 → {그룹명: bool})
var _gpPopGrpCol = {};

function _gpPopGrpToggle(mid, grp) {
  if (!_gpPopGrpCol[mid]) _gpPopGrpCol[mid] = {};
  _gpPopGrpCol[mid][grp] = !_gpPopGrpCol[mid][grp];
  // 해당 그룹 rows 토글 (DOM 직접 조작)
  var rows = document.querySelectorAll('[data-gp-pop-grp="' + mid + '::' + grp.replace(/"/g, '') + '"]');
  var hdr  = document.querySelector('[data-gp-pop-hdr="' + mid + '::' + grp.replace(/"/g, '') + '"]');
  var col  = _gpPopGrpCol[mid][grp];
  rows.forEach(function(r){ r.style.display = col ? 'none' : 'grid'; });
  if (hdr) {
    var arrow = hdr.querySelector('.gp-pop-arrow');
    if (arrow) arrow.textContent = col ? '▶' : '▼';
  }
}

function _tcGpPopDrawParamsCommon(paramsEl, mid, insertFn) {
  if (!paramsEl) return;
  var esc = function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); };
  var pick = function(m){ return (typeof _gpData !== 'undefined' && Array.isArray(_gpData[m])) ? _gpData[m].filter(function(r){ return r.name; }) : []; };

  // 전역(Global) 선택 시: 전역 + 모든 모델 파라미터 표시 (Global Parameters 페이지의 전역 화면과 동일)
  var sections;
  if (mid === '__global__') {
    sections = [];
    if (pick('__global__').length) sections.push('__global__');
    var skip = {'__global__':1,'__gp_folders__':1};
    Object.keys(_gpData || {}).filter(function(k){ return !skip[k] && pick(k).length; }).sort()
      .forEach(function(k){ sections.push(k); });
  } else {
    sections = pick(mid).length ? [mid] : [];
  }

  if (!sections.length) {
    paramsEl.innerHTML = '<div style="padding:40px 16px;text-align:center;">'
      + '<div style="font-size:28px;margin-bottom:8px;">📭</div>'
      + '<div style="font-size:12px;color:var(--text3);">등록된 파라미터가 없습니다.</div></div>';
    return;
  }

  // 컬럼 헤더 (sticky)
  var h = '<div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:2px solid var(--border);background:var(--bg2);position:sticky;top:0;z-index:2;">'
    + '<div style="padding:6px 14px;font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.5px;">변수명</div>'
    + '<div style="padding:6px 14px;font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.5px;border-left:1px solid var(--border);">현재 값</div>'
    + '</div>';

  var multiModel = sections.length > 1 || mid === '__global__';

  sections.forEach(function(m, si){
    var rows = pick(m);
    var modelLabel = m === '__global__' ? '전역' : m;
    if (!_gpPopGrpCol[m]) _gpPopGrpCol[m] = {};

    // 전역 뷰: 모델 헤더 표시
    if (multiModel) {
      h += '<div style="display:flex;align-items:center;gap:7px;padding:7px 12px;background:var(--bg3);'
        + (si>0?'border-top:2px solid var(--border);':'') + 'border-bottom:1px solid var(--border);">'
        + '<span style="font-size:13px;line-height:1;">' + (m==='__global__'?'🌐':'📁') + '</span>'
        + '<span style="font-size:12.5px;font-weight:700;color:var(--text);flex:1;">' + esc(modelLabel) + '</span>'
        + '<span style="font-size:10px;color:var(--text3);background:var(--bg2);padding:1px 8px;border-radius:8px;font-weight:600;">' + rows.length + '개</span>'
        + '</div>';
    }

    // 그룹별 분류
    var grouped = {}, groupOrder = [];
    rows.forEach(function(p){
      var g = p.group || ''; if (grouped[g] === undefined){ grouped[g] = []; groupOrder.push(g); }
      grouped[g].push(p);
    });
    var multiGroup = groupOrder.length > 1 || (groupOrder.length === 1 && groupOrder[0] !== '');

    groupOrder.forEach(function(grp, gi){
      var items = grouped[grp];
      var col = !!_gpPopGrpCol[m][grp]; // 접힘 여부
      var grpKey = esc(m) + '::' + esc(grp);
      var topBorder = (gi > 0 && !multiModel) ? 'border-top:2px solid var(--border);' : '';

      // 그룹 섹션 헤더 (그룹이 있을 때만, 클릭으로 접기)
      if (multiGroup) {
        h += '<div data-gp-pop-hdr="' + grpKey + '" '
          + 'onclick="_gpPopGrpToggle(\'' + esc(m) + '\',\'' + esc(grp) + '\')" '
          + 'style="display:flex;align-items:center;gap:7px;padding:6px 12px' + (multiModel?' 6px 22px':'') + ';background:var(--bg2);'
          + 'border-bottom:1px solid var(--border);' + topBorder + 'cursor:pointer;user-select:none;" '
          + 'onmouseenter="this.style.background=\'var(--bg3)\'" onmouseleave="this.style.background=\'var(--bg2)\'">  '
          + '<span class="gp-pop-arrow" style="font-size:10px;color:var(--text3);width:12px;text-align:center;flex-shrink:0;">' + (col ? '▶' : '▼') + '</span>'
          + '<span style="font-size:13px;line-height:1;flex-shrink:0;">📁</span>'
          + '<span style="font-size:12px;font-weight:700;color:var(--text);flex:1;">' + esc(grp || '기본 그룹') + '</span>'
          + '<span style="font-size:10px;color:var(--text3);background:var(--bg3);padding:1px 8px;border-radius:8px;font-weight:600;">' + items.length + '개</span>'
          + '</div>';
      }

      // 파라미터 행
      items.forEach(function(p){
        var ins_name = String(p.name).replace(/[\\\x27]/g, '');
        var mid_esc  = String(m).replace(/[\\\x27]/g, '');
        var disp_val = esc(String(p.value||''));
        var indentL  = (multiGroup||multiModel) ? '24px' : '14px';
        h += '<div data-gp-pop-grp="' + grpKey + '" '
          + 'onclick="'+insertFn.replace('__NAME__', ins_name).replace('__MID__', mid_esc)+';document.getElementById(\'tc-gp-popup\').remove();" '
          + 'style="display:' + (col ? 'none' : 'grid') + ';grid-template-columns:1fr 1fr;cursor:pointer;border-bottom:1px solid var(--border);" '
          + 'onmouseenter="this.style.background=\'var(--bg2)\'" onmouseleave="this.style.background=\'\'">'
          + '<div style="padding:7px 14px 7px ' + indentL + ';display:flex;align-items:center;min-width:0;">'
          +   '<span style="font-size:12px;font-weight:700;color:#101828;font-family:ui-monospace,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'
          +     '[' + esc(modelLabel) + '/' + esc(p.name) + ']</span>'
          + '</div>'
          + '<div style="padding:7px 14px;display:flex;align-items:center;border-left:1px solid var(--border);min-width:0;">'
          +   '<span style="font-size:12px;color:#101828;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'
          +     (disp_val || '<span style="color:var(--border);">—</span>') + '</span>'
          + '</div>'
          + '</div>';
      });
    });
  });

  paramsEl.innerHTML = h;
}

function tcGpVarPopupQuery(tcid, cid){
  var box = _tcGpPopOpen('Query');
  if (!box) return;
  _gpPopSel = '__global__';
  _tcGpPopDrawTreeQ(tcid, cid);
  _tcGpPopDrawParamsQ(tcid, cid, '__global__');
}

function _tcGpPopDrawTreeQ(tcid, cid){
  _tcGpPopDrawTreeCommon(
    document.getElementById('tc-gp-tree'),
    '_tcGpPopDrawTreeQ(\''+tcid+'\',\''+cid+'\')',
    '_tcGpPopDrawParamsQ(\''+tcid+'\',\''+cid+'\',\'__MID__\')'
  );
}

function _tcGpPopDrawParamsQ(tcid, cid, mid){
  _tcGpPopDrawParamsCommon(
    document.getElementById('tc-gp-params'),
    mid,
    'tcGpVarInsertQuery(\''+tcid+'\',\''+cid+'\',\'__NAME__\',\'__MID__\')'
  );
}

// ── GP 변수 팝업 — 판정기준(criteria) input용 ──
function tcGpVarPopupCrit(tcid, cid){
  var box = _tcGpPopOpen('판정기준');
  if (!box) return;
  _gpPopSel = '__global__';
  _tcGpPopDrawTreeCrit(tcid, cid);
  _tcGpPopDrawParamsCrit(tcid, cid, '__global__');
}

function _tcGpPopDrawTreeCrit(tcid, cid){
  _tcGpPopDrawTreeCommon(
    document.getElementById('tc-gp-tree'),
    '_tcGpPopDrawTreeCrit(\''+tcid+'\',\''+cid+'\')',
    '_tcGpPopDrawParamsCrit(\''+tcid+'\',\''+cid+'\',\'__MID__\')'
  );
}

function _tcGpPopDrawParamsCrit(tcid, cid, mid){
  _tcGpPopDrawParamsCommon(
    document.getElementById('tc-gp-params'),
    mid,
    'tcGpVarInsertCrit(\''+tcid+'\',\''+cid+'\',\'__NAME__\',\'__MID__\')'
  );
}

// ── GP 변수 선택 팝업 (Test Data용) ──
var _gpPopSel=null; // 현재 선택된 모델/전역 키
function tcGpVarPopup(tcid, cid){
  var box = _tcGpPopOpen('Test Data');
  if (!box) return;
  _gpPopSel = '__global__';
  _tcGpPopDrawTree(tcid, cid);
  _tcGpPopDrawParams(tcid, cid, '__global__');
}

function _tcGpPopDrawTree(tcid, cid){
  _tcGpPopDrawTreeCommon(
    document.getElementById('tc-gp-tree'),
    '_tcGpPopDrawTree(\''+tcid+'\',\''+cid+'\')',
    '_tcGpPopDrawParams(\''+tcid+'\',\''+cid+'\',\'__MID__\')'
  );
}

function _tcGpPopDrawParams(tcid, cid, mid){
  _tcGpPopDrawParamsCommon(
    document.getElementById('tc-gp-params'),
    mid,
    'tcGpVarInsertTD(\''+tcid+'\',\''+cid+'\',\'__NAME__\',\'__MID__\')'
  );
}

function tcVarInsert(tcid,id,name){ var el=document.querySelector('[data-cliid="'+id+'"]'); var ins='${'+name+'}'; if(!el){ if(typeof showToast==='function')showToast('변수 '+ins+' — Test Data 셀을 찾을 수 없습니다'); return; } el.focus(); try{ var r=document.createRange(); r.selectNodeContents(el); r.collapse(false); var s=window.getSelection(); s.removeAllRanges(); s.addRange(r); }catch(e){} var ok=false; try{ ok=document.execCommand('insertText',false,ins); }catch(e){} if(!ok){ el.textContent=(el.textContent||'')+ins; } tcCheckSave(tcid,id,'cli',(el.innerText||el.textContent||'').trim()); if(typeof showToast==='function')showToast('Test Data에 '+ins+' 삽입'); }
// IF 조건/True·False 문구 입력에 변수(·비교연산자) 삽입 — field: condition|trueMsg|falseMsg
function tcIfVarMenu(ev, tcid, id, field, withOps){
  if(ev){ try{ ev.preventDefault(); ev.stopPropagation(); }catch(e){} }
  tcVarMenuClose(); field=field||'condition';
  var vars=_tcAllVars(tcid); var names=Object.keys(vars);
  var esc=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');};
  var html='';
  if(withOps){ html+='<div style="padding:6px 14px 4px;font-size:10px;font-weight:800;color:#9aa1ad;">비교 연산자</div>'+'<div style="display:flex;gap:5px;flex-wrap:wrap;padding:0 12px 7px;">'+['==','!=','contains','>','<','>=','<='].map(function(op){ return '<span onmousedown="event.preventDefault()" onclick="tcVarMenuClose();tcIfFldInsert(\''+tcid+'\',\''+id+'\',\''+field+'\',\' '+op+' \')" style="font-family:ui-monospace,monospace;font-size:11.5px;background:#eef4ff;color:#2d6fd4;border-radius:5px;padding:2px 8px;cursor:pointer;font-weight:700;">'+op+'</span>'; }).join('')+'</div><div style="height:1px;background:#eef0f4;margin:2px 0;"></div>'; }
  if(!names.length){ html+='<div style="padding:8px 14px;font-size:12px;color:var(--text3);">변수 없음 — Query/추출로 변수를 먼저 만드세요</div>'; }
  else { html+='<div style="padding:5px 14px 4px;font-size:10px;font-weight:800;color:#9aa1ad;">변수 삽입 (클릭 → ${변수})</div>'+names.map(function(n){ var nn=String(n).replace(/[\\\\\x27]/g,''); return '<div onmousedown="event.preventDefault()" onclick="tcVarMenuClose();tcIfFldInsert(\''+tcid+'\',\''+id+'\',\''+field+'\',\'${'+nn+'}\')" style="padding:6px 14px;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:14px;" onmouseenter="this.style.background=\'#f3eefe\'" onmouseleave="this.style.background=\'#fff\'"><span style="font-family:ui-monospace,monospace;color:#7c3aed;font-weight:700;">${'+esc(n)+'}</span><span style="color:var(--text3);font-size:11px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+(vars[n]?('= '+esc(vars[n])):'(미추출)')+'</span></div>'; }).join(''); }
  // 표 컬럼 변수(스텝별 #N.colM) — interface status / SNMP 결과 구분 (Switch 메뉴와 동일)
  try{ var _tcc=_tcById(tcid); var _cs=((_tcc&&_tcc.checks)||[]).filter(function(x){return x&&x.colVars&&Object.keys(x.colVars).length;});
    if(_cs.length){ html+='<div style="font-size:10px;font-weight:700;color:#2d6fd4;padding:7px 14px 3px;border-top:1px solid #eef0f4;margin-top:3px;">표 컬럼 (스텝별) · 클릭 → #N.colM(\'$i\') 삽입</div>';
      _cs.forEach(function(st,si){ var _sn=_colStepLbl(_tcc,st,si); var cmd=String(st.cli||st.action||'').split(/\r?\n/)[0].slice(0,30); var cols=Object.keys(st.colVars).filter(function(k){return /^col\d+$/.test(k);}).sort(function(a,b){return parseInt(a.slice(3))-parseInt(b.slice(3));});
        html+='<div style="font-size:10px;color:#9aa1ad;padding:3px 14px 1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:290px;">#'+_sn+'  '+esc(cmd)+'</div><div style="display:flex;flex-wrap:wrap;gap:3px;padding:0 12px 4px;">'+cols.map(function(ck){ var ref='#'+_sn+'.'+ck; var hn=(st.colNames&&st.colNames[ck])?String(st.colNames[ck]):''; var first=(Array.isArray(st.colVars[ck])&&st.colVars[ck][0]!=null)?String(st.colVars[ck][0]).slice(0,12):''; return '<span onmousedown="event.preventDefault()" onclick="tcIfColPick(\''+tcid+'\',\''+id+'\',\''+field+'\',\''+ref+'\')" title="클릭 → '+ref+'(\'$i\') 삽입 (예: '+esc(first)+')" style="font-family:ui-monospace,monospace;font-size:11px;font-weight:700;color:#2d6fd4;background:#eef4ff;border:1px solid #cdddf5;border-radius:5px;padding:1px 7px;cursor:pointer;">'+ref+(hn?'<span style="font-family:inherit;color:#5a6478;font-weight:600;margin-left:3px;">'+esc(hn)+'</span>':'')+'</span>'; }).join('')+'</div>'; }); } }catch(_ec){}
  // ── GP 변수 열기 버튼 ──
  if(typeof _gpData!=='undefined'){
    var _gpHasAny=false;
    ['__global__'].concat(Object.keys(_gpData).filter(function(k){return k!=='__global__'&&k!=='__gp_folders__';})).forEach(function(mid){
      if(Array.isArray(_gpData[mid])&&_gpData[mid].some(function(r){return r.name;})) _gpHasAny=true;
    });
    if(_gpHasAny){
      html+='<div style="height:1px;background:#eef0f4;margin:4px 0;"></div>'
        +'<div onmousedown="event.preventDefault()" onclick="tcVarMenuClose();tcGpVarPopupIf(\''+tcid+'\',\''+id+'\',\''+field+'\')" style="padding:8px 14px;font-size:12.5px;font-weight:600;color:#1c1f27;cursor:pointer;display:flex;align-items:center;gap:8px;white-space:nowrap;" onmouseenter="this.style.background=\'#f5f3ff\'" onmouseleave="this.style.background=\'#fff\'"><i class="ti ti-variable" style="font-size:15px;color:#7c3aed;"></i> Global Parameters 선택…</div>';
    }
  }
  var m=document.createElement('div'); m.id='tc-var-menu'; m.style.cssText='position:fixed;z-index:100004;background:#fff;border:1px solid #d2d7e0;border-radius:9px;box-shadow:0 10px 32px rgba(30,40,80,0.22);padding:4px 0;font-family:inherit;min-width:230px;max-height:62vh;overflow:auto;'; m.innerHTML=html; document.body.appendChild(m);
  var x=ev.clientX||120,y=ev.clientY||120; if(x+250>window.innerWidth)x=Math.max(8,window.innerWidth-260); if(y+340>window.innerHeight)y=Math.max(8,window.innerHeight-350); m.style.left=x+'px'; m.style.top=y+'px';
  setTimeout(function(){document.addEventListener('click',tcVarMenuClose);},0);
}

// GP 변수 팝업 — IF 조건 필드용
function tcGpVarPopupIf(tcid, cid, field){
  var box = _tcGpPopOpen('IF 조건');
  if (!box) return;
  _gpPopSel = '__global__';
  _tcGpPopDrawTreeIf(tcid, cid, field);
  _tcGpPopDrawParamsIf(tcid, cid, field, '__global__');
}

function _tcGpPopDrawTreeIf(tcid, cid, field){
  _tcGpPopDrawTreeCommon(
    document.getElementById('tc-gp-tree'),
    '_tcGpPopDrawTreeIf(\''+tcid+'\',\''+cid+'\',\''+field+'\')',
    '_tcGpPopDrawParamsIf(\''+tcid+'\',\''+cid+'\',\''+field+'\',\'__MID__\')'
  );
}

function _tcGpPopDrawParamsIf(tcid, cid, field, mid){
  _tcGpPopDrawParamsCommon(
    document.getElementById('tc-gp-params'),
    mid,
    'tcGpIfInsert(\''+tcid+'\',\''+cid+'\',\''+field+'\',\'__NAME__\',\'__MID__\')'
  );
}

function tcGpIfInsert(tcid, cid, field, name, model){
  var prefix=(model&&model!=='__global__')?(model+'/'):('전역/');
  var ins='['+prefix+name+']';
  tcIfFldInsert(tcid, cid, field, ins);
}

function tcIfFldInsert(tcid,id,field,frag){
  var el=document.querySelector('[data-iffld="'+id+'::'+field+'"]');
  if(el){ var v=el.value||''; var p=(typeof el.selectionStart==='number')?el.selectionStart:v.length; var q=(typeof el.selectionEnd==='number')?el.selectionEnd:p; el.value=v.slice(0,p)+frag+v.slice(q); var np=p+frag.length; try{ el.focus(); el.setSelectionRange(np,np); }catch(e){} tcCheckSave(tcid,id,field,el.value); }
  else { var tc=tcList.find(function(t){return (t.tcid===tcid)||(t.id===tcid);}); var c=(tc&&tc.checks||[]).find(function(x){return x.id===id;}); tcCheckSave(tcid,id,field,((c&&c[field])||'')+frag); }
}
function tcIfColPick(tcid,id,field,ref){ tcVarMenuClose(); tcIfFldInsert(tcid,id,field,ref+"('$i')"); }   // 표 컬럼 #N.colM 을 IF식에 #N.colM('$i')로 삽입
// ── 가이드형 비교 빌더 (코드 몰라도 누구나: [변수▾][연산자▾][변수/값▾]) ──
function _cleanVarRefs(s){ return String(s==null?'':s).replace(/\$\{\s*(\w+)\s*\}/g,'${$1}'); }   // ${ query1 } → ${query1} (중괄호 안 여백 제거)
function _parseCmp(s){ s=String(s||'').trim(); var m=s.match(/^([\s\S]*?)\s*(==|!=|>=|<=|>|<|contains|포함)\s*([\s\S]*)$/); if(m){ var op=m[2]; if(op==='contains')op='포함'; return {l:_cleanVarRefs((m[1]||'').trim()), op:op, r:_cleanVarRefs((m[3]||'').trim())}; } return {l:_cleanVarRefs(s), op:'==', r:''}; }
function _ifConds(c){ if(!Array.isArray(c.conds)){ var raw=String(c.condition||'').trim(); if(raw){ var jn=(raw.indexOf('||')>=0&&raw.indexOf('&&')<0)?'or':'and'; c.conds=raw.split(jn==='or'?/\s*\|\|\s*/:/\s*&&\s*/).map(_parseCmp); if(!c.condJoin)c.condJoin=jn; } else c.conds=[{l:'',op:'==',r:''}]; } if(!Array.isArray(c.conds)||!c.conds.length) c.conds=[{l:'',op:'==',r:''}]; if(!c.condJoin)c.condJoin='and'; return c.conds; }
function _ifCondStr(c){ var cs=_ifConds(c); var j=(c.condJoin==='or')?' || ':' && '; return cs.map(function(x){ return ((x.l||'')+' '+(x.op||'==')+' '+(x.r||'')).trim(); }).filter(Boolean).join(j); }
function _ifFind(tcid,id){ var tc=tcList.find(function(t){return (t.tcid===tcid)||(t.id===tcid);}); if(!tc)return null; return (tc.checks||[]).find(function(x){return x.id===id;})||null; }
// IF/ELIF 공용 조건 대상: ek 지정 시 c.elifs[ek], 아니면 IF 본체 c
function _ifTarget(tcid,id,ek){ var c=_ifFind(tcid,id); if(!c)return null; if(ek!=null&&ek!==''&&ek>=0){ c.elifs=Array.isArray(c.elifs)?c.elifs:[]; if(!c.elifs[ek])c.elifs[ek]={condition:'',result:'Pass',msg:''}; return c.elifs[ek]; } return c; }
function _ifTargetSave(tcid,id,ek,t){ t.condition=_ifCondStr(t); if(ek!=null&&ek!==''&&ek>=0){ var tc=_tcById(tcid); if(tc){ try{ saveTCFile(tc); }catch(e){} } tcProcRefresh(tcid); } else { tcCheckSave(tcid,id,'condition',t.condition); } }
function tcIfBuild(tcid,id,idx,part,val,ek){ var t=_ifTarget(tcid,id,ek); if(!t)return; var cs=_ifConds(t); if(!cs[idx])return; cs[idx][part]=_cleanVarRefs(String(val==null?'':val).trim()); _ifTargetSave(tcid,id,ek,t); }
function tcIfAddCond(tcid,id,ek){ var t=_ifTarget(tcid,id,ek); if(!t)return; _ifConds(t).push({l:'',op:'==',r:''}); _ifTargetSave(tcid,id,ek,t); }
function tcIfAddElif(tcid,id){ var c=_ifFind(tcid,id); if(!c)return; c.elifs=Array.isArray(c.elifs)?c.elifs:[]; c.elifs.push({condition:'',conds:[{l:'',op:'==',r:''}],condJoin:'and',trueResult:'Pass',trueMsg:'',falseResult:'Fail',falseMsg:''}); var tc=_tcById(tcid); if(tc){ try{ saveTCFile(tc); }catch(e){} } tcProcRefresh(tcid); }
function tcIfDelElif(tcid,id,k){ var c=_ifFind(tcid,id); if(!c||!Array.isArray(c.elifs))return; c.elifs.splice(k,1); var tc=_tcById(tcid); if(tc){ try{ saveTCFile(tc); }catch(e){} } tcProcRefresh(tcid); }
function tcIfDelCond(tcid,id,idx,ek){ var t=_ifTarget(tcid,id,ek); if(!t)return; var cs=_ifConds(t); if(cs.length<=1)return; cs.splice(idx,1); _ifTargetSave(tcid,id,ek,t); }
function tcIfSetJoin(tcid,id,j,ek){ var t=_ifTarget(tcid,id,ek); if(!t)return; t.condJoin=(j==='or')?'or':'and'; _ifConds(t); _ifTargetSave(tcid,id,ek,t); }
function tcIfVarPick(ev,tcid,id,idx,part,ek){ ev.preventDefault(); ev.stopPropagation(); var ex=document.getElementById('if-varmenu'); if(ex)ex.remove(); var _ek=(ek!=null&&ek!=='')?(','+ek):''; var vars=_tcAllVars(tcid); var names=Object.keys(vars); var e2=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');}; var m=document.createElement('div'); m.id='if-varmenu'; m.style.cssText='position:fixed;z-index:100002;background:#fff;border:1px solid #d2d7e0;border-radius:9px;box-shadow:0 12px 34px rgba(30,40,80,0.24);padding:5px;min-width:200px;max-height:300px;overflow:auto;'; if(!names.length){ m.innerHTML='<div style="padding:11px 13px;font-size:11.5px;color:#9aa1ad;">변수 없음<br><span style="font-size:10.5px;">Response에서 줄 선택 → <b style="color:#6b3fc4;">Query 영역</b> 으로 생성</span></div>'; } else { m.innerHTML='<div style="padding:4px 11px 6px;font-size:10px;font-weight:800;color:#9aa1ad;letter-spacing:.4px;">변수 선택</div>'+names.map(function(v){ var val=vars[v]; var has=(val!=null&&String(val).trim()!==''); return '<div onmousedown="event.preventDefault()" onclick="tcIfPickVar(\''+tcid+'\',\''+id+'\','+idx+',\''+part+'\',\''+e2(v)+'\''+_ek+')" style="display:flex;align-items:center;gap:7px;padding:6px 11px;border-radius:6px;cursor:pointer;white-space:nowrap;" onmouseenter="this.style.background=\'#f3eeff\'" onmouseleave="this.style.background=\'#fff\'"><span style="font-family:ui-monospace,monospace;font-weight:800;color:#6b3fc4;">${'+e2(v)+'}</span>'+(has?('<span style="color:#9aa3b2;">=</span><span style="font-family:ui-monospace,monospace;color:#1c7a4a;max-width:150px;overflow:hidden;text-overflow:ellipsis;">'+e2(String(val).slice(0,26))+'</span>'):'<span style="font-size:10px;color:#c0a000;">(미실행)</span>')+'</div>'; }).join(''); }
  try{ var _tcc=_tcById(tcid); var _cs=((_tcc&&_tcc.checks)||[]).filter(function(x){return x&&x.colVars&&Object.keys(x.colVars).length;});
    if(_cs.length){ var _ch='<div style="padding:6px 11px 3px;font-size:10px;font-weight:800;color:#2d6fd4;border-top:1px solid #eef0f4;margin-top:3px;">표 컬럼 (스텝별) · 클릭 → #N.colM(\'$i\')</div>';
      _cs.forEach(function(st,si){ var _sn=_colStepLbl(_tcc,st,si); var cmd=String(st.cli||st.action||'').split(/\r?\n/)[0].slice(0,26); var cols=Object.keys(st.colVars).filter(function(k){return /^col\d+$/.test(k);}).sort(function(a,b){return parseInt(a.slice(3))-parseInt(b.slice(3));});
        _ch+='<div style="font-size:10px;color:#9aa1ad;padding:2px 11px 1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:250px;">#'+_sn+' '+e2(cmd)+'</div><div style="display:flex;flex-wrap:wrap;gap:3px;padding:0 9px 4px;">'+cols.map(function(ck){ var ref='#'+_sn+'.'+ck; var hn=(st.colNames&&st.colNames[ck])?String(st.colNames[ck]):''; return '<span onmousedown="event.preventDefault()" onclick="tcIfPickCol(\''+tcid+'\',\''+id+'\','+idx+',\''+part+'\',\''+ref+'\''+_ek+')" style="font-family:ui-monospace,monospace;font-size:11px;font-weight:700;color:#2d6fd4;background:#eef4ff;border:1px solid #cdddf5;border-radius:5px;padding:1px 7px;cursor:pointer;">'+ref+(hn?'<span style="font-family:inherit;color:#5a6478;font-weight:600;margin-left:3px;">'+e2(hn)+'</span>':'')+'</span>'; }).join('')+'</div>'; });
      m.innerHTML+=_ch; } }catch(_e){}
  document.body.appendChild(m); var r=ev.currentTarget.getBoundingClientRect(); var x=Math.min(r.left,window.innerWidth-216); var y=r.bottom+4; if(y+300>window.innerHeight) y=Math.max(8,r.top-304); m.style.left=Math.max(8,x)+'px'; m.style.top=y+'px'; setTimeout(function(){ document.addEventListener('click',function _c(){ var mm=document.getElementById('if-varmenu'); if(mm)mm.remove(); document.removeEventListener('click',_c); }); },0); }
function tcIfPickVar(tcid,id,idx,part,v,ek){ var ex=document.getElementById('if-varmenu'); if(ex)ex.remove(); tcIfBuild(tcid,id,idx,part,'${'+v+'}',ek); }
function tcIfPickCol(tcid,id,idx,part,ref,ek){ var ex=document.getElementById('if-varmenu'); if(ex)ex.remove(); tcIfBuild(tcid,id,idx,part,ref+"('$i')",ek); }   // 표 컬럼 #N.colM 을 IF/ELIF 조건칸에 #N.colM('$i')로 삽입
function _ifBuilder(tcid, c, ek){
  var tgt=(ek!=null&&ek!=='')?_ifTarget(tcid,c.id,ek):c; if(!tgt)tgt=c;
  var ekA=(ek!=null&&ek!=='')?(','+ek):'';
  var conds=_ifConds(tgt); var join=tgt.condJoin||'and';
  var ops=[['==','＝ 같다'],['!=','≠ 다르다'],['포함','⊃ 포함'],['>','＞ 크다'],['<','＜ 작다'],['>=','≥ 이상'],['<=','≤ 이하']];
  var esc=function(s){return String(s==null?'':s).replace(/"/g,'&quot;');};
  var inSt='font-size:12px;border:1px solid #9fd8e4;border-radius:6px 0 0 6px;border-right:none;padding:3px 7px;background:#fff;width:116px;flex-shrink:0;';
  var pickBtn=function(idx,part){ return '<button onclick="tcIfVarPick(event,\''+tcid+'\',\''+c.id+'\','+idx+',\''+part+'\''+ekA+')" title="생성된 변수 선택" style="font-size:11px;border:1px solid #9fd8e4;border-left:none;border-radius:0 6px 6px 0;background:#eef9fc;color:#0891b2;cursor:pointer;padding:3px 6px;flex-shrink:0;font-weight:800;">▾</button>'; };
  var _ifFld='elif'+(ek!=null&&ek!==''?ek:'')+'.cond'; // GP 삽입 시 field 식별용 (tcIfFldInsert 경유)
  var field=function(idx,part,val,ph){ return '<span style="display:inline-flex;align-items:center;flex-shrink:0;"><input data-ifbld="'+c.id+'" data-ifbld-idx="'+idx+'" data-ifbld-part="'+part+'"'+(ek!=null&&ek!==''?' data-ifbld-ek="'+ek+'"':'')+' data-ifbld-tcid="'+tcid+'" value="'+esc(val)+'" onclick="event.stopPropagation()" oncontextmenu="event.preventDefault();event.stopPropagation();tcIfBldVarMenu(event,\''+tcid+'\',\''+c.id+'\','+idx+',\''+part+'\''+(ek!=null&&ek!==''?(','+ek):'')+');" onchange="tcIfBuild(\''+tcid+'\',\''+c.id+'\','+idx+',\''+part+'\',this.value'+ekA+')" placeholder="'+ph+'" style="'+inSt+'">'+pickBtn(idx,part)+'</span>'; };
  var opSel=function(idx,op){ return '<select onclick="event.stopPropagation()" onchange="tcIfBuild(\''+tcid+'\',\''+c.id+'\','+idx+',\'op\',this.value'+ekA+')" title="비교 연산자" style="font-size:12px;border:1px solid #9fd8e4;border-radius:6px;padding:3px 4px;margin:0 3px;background:#eef9fc;color:#0891b2;font-weight:700;cursor:pointer;flex-shrink:0;">'+ops.map(function(o){return '<option value="'+o[0]+'"'+((op||'==')===o[0]?' selected':'')+'>'+o[1]+'</option>';}).join('')+'</select>'; };
  var joinSel='<select onclick="event.stopPropagation()" onchange="tcIfSetJoin(\''+tcid+'\',\''+c.id+'\',this.value'+ekA+')" title="조건 결합" style="font-size:10.5px;border:1px solid #c9b6f0;border-radius:6px;padding:2px 5px;margin:2px 4px;background:#f6f1fe;color:#7c3aed;font-weight:800;cursor:pointer;flex-shrink:0;"><option value="and"'+(join==='and'?' selected':'')+'>그리고(AND)</option><option value="or"'+(join==='or'?' selected':'')+'>또는(OR)</option></select>';
  var rows=conds.map(function(cd,idx){
    var del=(conds.length>1)?'<i class="ti ti-x" onclick="event.stopPropagation();tcIfDelCond(\''+tcid+'\',\''+c.id+'\','+idx+ekA+')" title="이 조건 삭제" style="font-size:13px;color:#b9818f;cursor:pointer;flex-shrink:0;margin-left:2px;"></i>':'';
    return (idx>0?('<span style="flex-basis:100%;height:0;"></span>'+joinSel):'')+field(idx,'l',cd.l||'','▾ 변수/값')+opSel(idx,cd.op)+field(idx,'r',cd.r||'','▾ 변수/값')+del;
  }).join('');
  var addBtn='<button onclick="event.stopPropagation();tcIfAddCond(\''+tcid+'\',\''+c.id+'\''+ekA+')" title="조건 추가 (AND/OR로 여러 비교)" style="font-size:10.5px;padding:2px 9px;border:1px dashed #9fd8e4;border-radius:6px;background:#fff;color:#0891b2;cursor:pointer;flex-shrink:0;font-weight:700;margin-left:3px;">＋ 조건</button>';
  return '<span style="display:inline-flex;align-items:center;gap:3px;flex-wrap:wrap;vertical-align:middle;">'+rows+addBtn+'</span>';
}
// ── IF 조건 input 우클릭 변수 메뉴 ──
function tcIfBldVarMenu(ev, tcid, cid, idx, part, ek){
  ev.preventDefault(); ev.stopPropagation(); tcVarMenuClose();
  var vars=_tcAllVars(tcid); var names=Object.keys(vars);
  var esc=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');};
  var it=function(ic,col,lab,oc){ return '<div onmousedown="event.preventDefault()" onclick="tcVarMenuClose();'+oc+'" style="padding:8px 14px;font-size:12.5px;font-weight:600;color:#1c1f27;cursor:pointer;display:flex;align-items:center;gap:8px;white-space:nowrap;" onmouseenter="this.style.background=\'#eef4ff\'" onmouseleave="this.style.background=\'#fff\'"><i class="ti '+ic+'" style="font-size:15px;color:'+col+';"></i>'+lab+'</div>'; };
  var ekArg=(ek!=null&&ek!==undefined&&String(ek)!=='')?String(ek):'null';
  var html='';
  if(names.length){
    html+='<div style="padding:3px 14px 4px;font-size:10px;font-weight:800;color:#9aa1ad;">변수 삽입 (클릭 → ${변수})</div>'
      +names.map(function(n){ var nn=String(n).replace(/[\\\\\x27]/g,''); return '<div onmousedown="event.preventDefault()" onclick="tcVarMenuClose();tcIfBld(\''+tcid+'\',\''+cid+'\','+idx+',\''+part+'\',\'${'+nn+'\'}\',' +ekArg+')" style="padding:6px 14px;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:14px;" onmouseenter="this.style.background=\'#f3eefe\'" onmouseleave="this.style.background=\'#fff\'"><span style="font-family:ui-monospace,monospace;color:#7c3aed;font-weight:700;">${'+esc(n)+'}</span><span style="color:var(--text3);font-size:11px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+(vars[n]?('= '+esc(vars[n])):'(미추출)')+'</span></div>'; }).join('');
    html+='<div style="height:1px;background:#eef0f4;margin:4px 0;"></div>';
  }
  if(typeof _gpData!=='undefined'){
    html+=it('ti-variable','#7c3aed','Global Parameters 선택…','tcGpVarPopupIfBld(\''+tcid+'\',\''+cid+'\','+idx+',\''+part+'\','+ekArg+')');
  }
  if(!html){ html='<div style="padding:10px 14px;font-size:12px;color:var(--text3);">변수 없음</div>'; }
  var m=document.createElement('div'); m.id='tc-var-menu';
  m.style.cssText='position:fixed;z-index:100005;background:#fff;border:1px solid #d2d7e0;border-radius:9px;box-shadow:0 10px 32px rgba(30,40,80,0.22);padding:4px 0;font-family:inherit;min-width:210px;max-height:62vh;overflow:auto;';
  m.innerHTML=html; document.body.appendChild(m);
  var x=ev.clientX,y=ev.clientY; if(x+230>window.innerWidth)x=Math.max(8,window.innerWidth-240); if(y+320>window.innerHeight)y=Math.max(8,window.innerHeight-330); m.style.left=x+'px'; m.style.top=y+'px';
  setTimeout(function(){document.addEventListener('click',tcVarMenuClose);},0);
}
function tcIfBld(tcid, cid, idx, part, val, ek){
  var sel='[data-ifbld="'+cid+'"][data-ifbld-idx="'+idx+'"][data-ifbld-part="'+part+'"]';
  if(ek!=null&&ek!==undefined&&String(ek)!=='') sel+='[data-ifbld-ek="'+String(ek)+'"]';
  var el=document.querySelector(sel); if(el) el.value=val;
  if(ek!=null&&ek!==undefined&&String(ek)!=='') tcIfBuild(tcid,cid,idx,part,val,ek);
  else tcIfBuild(tcid,cid,idx,part,val);
}
function tcGpVarPopupIfBld(tcid, cid, idx, part, ek){
  var box = _tcGpPopOpen('IF 조건 빌더');
  if (!box) return;
  _gpPopSel = '__global__';
  _tcGpPopDrawTreeIfBld(tcid, cid, idx, part, ek);
  _tcGpPopDrawParamsIfBld(tcid, cid, idx, part, ek, '__global__');
}
function _tcGpPopDrawTreeIfBld(tcid, cid, idx, part, ek){
  var ekArg = (ek!=null&&ek!==undefined&&String(ek)!=='') ? String(ek) : 'null';
  _tcGpPopDrawTreeCommon(
    document.getElementById('tc-gp-tree'),
    '_tcGpPopDrawTreeIfBld(\''+tcid+'\',\''+cid+'\','+idx+',\''+part+'\','+ekArg+')',
    '_tcGpPopDrawParamsIfBld(\''+tcid+'\',\''+cid+'\','+idx+',\''+part+'\','+ekArg+',\'__MID__\')'
  );
}
function _tcGpPopDrawParamsIfBld(tcid, cid, idx, part, ek, mid){
  var ekArg = (ek!=null&&ek!==undefined&&String(ek)!=='') ? String(ek) : 'null';
  _tcGpPopDrawParamsCommon(
    document.getElementById('tc-gp-params'),
    mid,
    'tcGpIfBldInsert(\''+tcid+'\',\''+cid+'\','+idx+',\''+part+'\','+ekArg+',\'__NAME__\',\'__MID__\')'
  );
}
function tcGpIfBldInsert(tcid,cid,idx,part,ek,name,model){
  var prefix=(model&&model!=='__global__')?(model+'/'):('전역/'); var ins='['+prefix+name+']';
  var sel='[data-ifbld="'+cid+'"][data-ifbld-idx="'+idx+'"][data-ifbld-part="'+part+'"]';
  if(ek!=null&&ek!==undefined&&String(ek)!=='') sel+='[data-ifbld-ek="'+String(ek)+'"]';
  var el=document.querySelector(sel); if(el){ el.value=ins; }
  if(ek!=null&&ek!==undefined&&String(ek)!=='') tcIfBuild(tcid,cid,idx,part,ins,ek);
  else tcIfBuild(tcid,cid,idx,part,ins);
}

// ── 스텝 값 비교 (변수·IF·${} 없이: 이 출력의 항목 = 다른 스텝의 항목) ──
function _outLabels(out){ var labels=[],seen={}; String(out||'').split(/\r?\n/).forEach(function(ln){ var m=String(ln).match(/^\s*([A-Za-z][\w .\/()\-]*?)\s*:\s*\S/); if(m){ var lb=m[1].trim(); if(lb&&!seen[lb]){ seen[lb]=1; labels.push(lb); } } }); return labels; }
function _extractByLabel(out,label){ if(!label) return ''; try{ var re=new RegExp('^\\s*'+_reEsc(label)+'\\s*:\\s*(.+?)\\s*$','m'); var m=String(out||'').match(re); return m?m[1].trim():''; }catch(e){ return ''; } }
function _judgeStepCmp(tcid,c,rawOut){ var tc=_tcById(tcid); var checks=(tc&&tc.checks)||[]; var a=_extractByLabel(rawOut,c.cmpField); var other=checks.find(function(x){return x.id===c.cmpStep;}); var b=other?_extractByLabel(other.output,c.cmpStep2Field):''; var op=c.cmpOp||'=='; var ok; if(op==='!=') ok=(a!==b); else if(op==='포함') ok=(!!a&&!!b&&(a.indexOf(b)>=0||b.indexOf(a)>=0)); else ok=(a!==''&&a===b); return {pass:ok,a:a,b:b}; }
function tcStepCmpSet(tcid,id,part,val){ var tc=_tcById(tcid); if(!tc)return; var c=(tc.checks||[]).find(function(x){return x.id===id;}); if(!c)return; var map={field:'cmpField',op:'cmpOp',step:'cmpStep',field2:'cmpStep2Field'}; if(!map[part])return; c[map[part]]=val; c.type='stepcmp'; try{ _reJudge(c,tcid); }catch(e){} saveTCFile(tc); tcProcRefresh(tcid); }
function _stepCmpBuilder(tcid,c){ var tc=_tcById(tcid); var checks=(tc&&tc.checks)||[]; var esc=function(s){return String(s==null?'':s).replace(/"/g,'&quot;').replace(/</g,'&lt;');}; var lbl=function(x){ return (String(x.desc||'').trim())||((String(x.cli||'').split(/\r?\n/)[0]))||x.action||x.id; }; var sel=function(onch,opts,cur,ph){ return '<select onchange="'+onch+'" style="font-size:12px;padding:5px 8px;border:1px solid #9ad9c4;border-radius:6px;background:#fff;cursor:pointer;max-width:230px;"><option value="">'+ph+'</option>'+opts.map(function(o){return '<option value="'+esc(o.v)+'"'+(String(cur||'')===String(o.v)?' selected':'')+'>'+esc(o.t)+'</option>';}).join('')+'</select>'; }; var myLabels=_outLabels(c.output); var others=checks.filter(function(x){return x.id!==c.id&&(x.kind||'cli')==='cli';}); var other=checks.find(function(x){return x.id===c.cmpStep;}); var otherLabels=other?_outLabels(other.output):[]; var cb='tcStepCmpSet(\''+tcid+'\',\''+c.id+'\','; var opOpts=[{v:'==',t:'＝ 같다'},{v:'!=',t:'≠ 다르다'},{v:'포함',t:'⊃ 포함'}]; var html='<div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;font-size:12px;line-height:2;"><span style="color:#00673f;font-weight:700;">이 출력의</span>'+sel(cb+'\'field\',this.value)',myLabels.map(function(l){return {v:l,t:l};}),c.cmpField,'항목 ▾')+sel(cb+'\'op\',this.value)',opOpts,c.cmpOp||'==','비교')+'<span style="color:#00673f;font-weight:700;">다른 스텝</span>'+sel(cb+'\'step\',this.value)',others.map(function(x){return {v:x.id,t:lbl(x)};}),c.cmpStep,'스텝 ▾')+'<span style="color:#00673f;">의</span>'+sel(cb+'\'field2\',this.value)',otherLabels.map(function(l){return {v:l,t:l};}),c.cmpStep2Field,'항목 ▾')+'<span style="color:var(--text3);font-size:11px;">→ 같으면 ✅ 합격</span></div>'; if(!myLabels.length) html+='<div style="font-size:11px;color:#c0392b;margin-top:6px;">※ 이 스텝을 먼저 <b>▶조회</b>하면 [항목]이 자동으로 채워집니다.</div>'; if(c.cmpStep&&!otherLabels.length) html+='<div style="font-size:11px;color:#c0392b;margin-top:4px;">※ 비교 대상 스텝도 먼저 조회하세요.</div>'; if((c.repeatResult)&&c.cmpField&&c.cmpStep){ var jr=_judgeStepCmp(tcid,c,c.output); html+='<div style="font-size:11px;margin-top:7px;color:'+(jr.pass?'#00673f':'#a01f33')+';background:'+(jr.pass?'#f0fbf6':'#fff5f6')+';border:1px solid '+(jr.pass?'#bfe3d2':'#f3c6cf')+';border-radius:7px;padding:6px 10px;">'+(jr.pass?'✅ 합격':'❌ 불합격')+' — 내 값 [<b>'+esc(jr.a||'(없음)')+'</b>] '+(c.cmpOp||'==')+' 대상 값 [<b>'+esc(jr.b||'(없음)')+'</b>]</div>'; } return html; }
async function tcVarAddManual(tcid){
  let name=''; try{ name=await uiPrompt({title:'변수 추가',label:'변수 이름 (영문/숫자/_)',value:'',icon:'ti-variable-plus'}); }catch(e){}
  if(name==null) return; name=String(name).trim().replace(/[^\w]/g,''); if(!name){ if(typeof showToast==='function')showToast('변수 이름이 비어있거나 형식이 올바르지 않습니다'); return; }
  let val=''; try{ val=await uiPrompt({title:'변수 값',label:'${'+name+'} 의 값',value:'',icon:'ti-edit'}); }catch(e){}
  _varSetUser(tcid,name,val==null?'':String(val),true); const tc=_tcById(tcid); if(tc){ try{ await saveTCFile(tc); }catch(e){} } tcProcRefresh(tcid); if(typeof showToast==='function')showToast('변수 ${'+name+'} = '+(val||'(빈값)'));
}
function tcVarListPopup(tcid){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); const vars=_tcAllVars(tcid); const names=Object.keys(vars);
  const esc=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');};
  const old=document.getElementById('tc-varlist-ov'); if(old)old.remove();
  const ov=document.createElement('div'); ov.id='tc-varlist-ov'; ov.style.cssText='position:fixed;inset:0;background:rgba(15,20,35,0.5);z-index:12001;display:flex;align-items:center;justify-content:center;padding:24px;'; ov.onclick=function(e){ if(e.target===ov)ov.remove(); };
  const rows=names.length?names.map(function(n){ const mn=tc&&tc.varManual&&tc.varManual[n]; const tag=mn?'<span style="font-size:9px;color:#e8820c;font-weight:800;margin-left:5px;">수동</span>':(/^query\d+$/.test(n)?'<span style="font-size:9px;color:#2d6fd4;font-weight:800;margin-left:5px;">Query</span>':'<span style="font-size:9px;color:#00875a;font-weight:800;margin-left:5px;">자동</span>'); return '<tr><td style="padding:9px 12px;border-bottom:1px solid var(--border);font-family:ui-monospace,monospace;color:#7c3aed;font-weight:700;white-space:nowrap;">${'+esc(n)+'}'+tag+'</td><td style="padding:9px 12px;border-bottom:1px solid var(--border);font-family:ui-monospace,monospace;color:#1c2030;word-break:break-all;">'+(esc(vars[n])||'<span style="color:var(--text3);">(빈값)</span>')+'</td><td style="padding:9px 8px;border-bottom:1px solid var(--border);text-align:center;width:34px;"><i class="ti ti-trash" onclick="tcVarDelete(\''+tcid+'\',\''+String(n).replace(/[\\\\\x27]/g,'')+'\');var o=document.getElementById(\'tc-varlist-ov\');if(o)o.remove();tcVarListPopup(\''+tcid+'\');" style="cursor:pointer;color:#c0392b;font-size:15px;" title="변수 삭제"></i></td></tr>'; }).join(''):'<tr><td colspan="3" style="padding:26px;text-align:center;color:var(--text3);font-size:12.5px;">변수가 없습니다 — Query 지정 또는 「변수 추가」로 만드세요.</td></tr>';
  ov.innerHTML='<div style="background:#fff;border-radius:14px;width:580px;max-width:94vw;max-height:80vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.3);"><div style="padding:14px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;"><i class="ti ti-variable" style="color:#7c3aed;font-size:18px;"></i><b style="font-size:14px;flex:1;">변수 목록 · 값 ('+names.length+')</b><button onclick="var o=document.getElementById(\'tc-varlist-ov\');if(o)o.remove();tcVarAddManual(\''+tcid+'\');" style="font-size:12px;font-weight:700;padding:6px 12px;border:1px solid #c9b6f0;border-radius:7px;background:rgba(124,58,237,0.07);color:#7c3aed;cursor:pointer;"><i class="ti ti-plus"></i> 변수 추가</button><i class="ti ti-x" onclick="var o=document.getElementById(\'tc-varlist-ov\');if(o)o.remove();" style="cursor:pointer;font-size:18px;color:#9aa1ad;margin-left:4px;"></i></div><div style="flex:1;overflow:auto;"><table style="width:100%;border-collapse:collapse;font-size:12.5px;"><thead><tr style="background:var(--bg3);position:sticky;top:0;"><th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--text3);">변수</th><th style="padding:8px 12px;text-align:left;font-size:11px;color:var(--text3);">현재 값</th><th style="width:34px;"></th></tr></thead><tbody>'+rows+'</tbody></table></div><div style="padding:9px 20px;border-top:1px solid var(--border);font-size:11px;color:var(--text3);"><b>Query</b>=Query로 추출 · <b>자동</b>=출력 추출 · <b>수동</b>=직접 입력 · 명령에서 <span style="font-family:ui-monospace,monospace;color:#7c3aed;">${변수}</span> 로 사용</div></div>';
  document.body.appendChild(ov);
}
// "기준 보기" 편집 팝업 — Response 패널과 동일 UI, 양방향 실시간 동기화function _critViewRefresh(){ if(_critViewTcid==null) return; const b=document.getElementById('tc-crit-view-body'); if(b) b.innerHTML=_respBody(_critViewTcid); else _critViewTcid=null; }
function _critViewClose(){ _critViewTcid=null; const ov=document.getElementById('tc-crit-view'); if(ov) ov.remove(); }
function tcRespLineToggle(tcid,n,ev){
  _respSel[tcid]=Array.isArray(_respSel[tcid])?_respSel[tcid]:[]; const arr=_respSel[tcid];
  if(ev&&ev.shiftKey&&_respAnchor[tcid]){ const lo=Math.min(_respAnchor[tcid],n),hi=Math.max(_respAnchor[tcid],n); for(let i=lo;i<=hi;i++){ if(arr.indexOf(i)<0) arr.push(i); } }
  else { const k=arr.indexOf(n); if(k>=0) arr.splice(k,1); else arr.push(n); _respAnchor[tcid]=n; }
  _respRefresh(tcid);
}
function tcRespSelClear(tcid){ _respSel[tcid]=[]; _respRefresh(tcid); }
function tcRespSelAll(tcid){ const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); const c=tc&&(tc.checks||[]).find(x=>x.id===_respStepId[tcid]); if(!c) return; _respSel[tcid]=_respShownLines(c).map((l,i)=>i+1); _respRefresh(tcid); }
// 드래그로 선택한 문구를 보관 → "문구로 검증"/"문구 제외" 버튼 노출
function tcRespSubSel(tcid){ try{ const s=window.getSelection(); const t=s?String(s.toString()):''; if(!t||!t.trim()) return; try{ window._rspSpan=window._rspSpan||{}; window._rspSpan[tcid]=_selLineSpan(); window._rspSelD=window._rspSelD||{}; window._rspSelD[tcid]=_rspSelDetail(); }catch(e){} /* 드래그 시점에 줄범위+정확오프셋 저장 — 버튼 클릭 후엔 선택이 사라지므로 */ if(window._queryPick===tcid){ tcRespToQueryRegion(tcid); return; } if(t.trim().length<=400){ _pendingSub[tcid]=t.trim(); _respRefresh(tcid); } }catch(e){} }
// 출력에서 드래그한 '값'을 Query로 지정 — 'Label : Value' 면 라벨 위치 기반(장비 달라도 그 자리 값), 아니면 문구/구간// 드래그한 줄범위 안의 줄인지(미리보기 강조를 그 줄에만 — 같은 값이 다른 줄에 있어도 안 번짐)
function _rspSubInLine(tcid,n){ try{ var sp=(window._rspSpan||{})[tcid]; if(!sp) return true; return n>=sp[0]&&n<=sp[1]; }catch(e){ return true; } }
// 현재 드래그 선택이 걸친 출력 줄 범위 [시작줄, 끝줄] (data-ln 기반) — 줄 중간에서 시작/끝나도 그 줄 전체
function _selLineSpan(){
  try{ const s=window.getSelection(); if(!s||!s.rangeCount) return null; const r=s.getRangeAt(0); if(r.collapsed) return null;
    const findLn=function(node){ let el=(node&&node.nodeType===3)?node.parentNode:node; while(el&&el!==document.body){ if(el.getAttribute&&el.getAttribute('data-ln')!=null) return parseInt(el.getAttribute('data-ln'),10); el=el.parentNode; } return null; };
    let a=findLn(r.startContainer), b=findLn(r.endContainer);
    if(a==null&&b==null) return null; if(a==null)a=b; if(b==null)b=a;
    return [Math.min(a,b), Math.max(a,b)];
  }catch(e){ return null; }
}
// Selection API로 드래그한 '정확한 위치'(줄번호 + 그 줄 안 문자 오프셋 + 텍스트) — indexOf 재탐색 없이 그 자리 그대로
function _rspSelDetail(){
  try{ var s=window.getSelection(); if(!s||!s.rangeCount) return null; var r=s.getRangeAt(0); if(r.collapsed) return null;
    var txt=String(s.toString()); if(!txt||!txt.trim()) return null;
    var lineEl=function(node){ var el=(node&&node.nodeType===3)?node.parentNode:node; while(el&&el!==document.body){ if(el.getAttribute&&el.getAttribute('data-ln')!=null) return el; el=el.parentNode; } return null; };
    var le=lineEl(r.startContainer); if(!le) return null;
    var ln=parseInt(le.getAttribute('data-ln'),10); if(isNaN(ln)) return null;
    var off=_textOffsetInEl(le, r.startContainer, r.startOffset); if(off<0) return null;
    return {line:ln, start:off, end:off+txt.length, text:txt};
  }catch(e){ return null; }
}
// root(줄 div) 안에서 (node,nodeOffset)까지의 텍스트 문자 수 — 하이라이트 span 안이라도 정확
function _textOffsetInEl(root, node, nodeOffset){
  try{ var count=0, found=false;
    var walk=function(n){ if(found)return; if(n===node){ if(n.nodeType===3){ count+=nodeOffset; } else { for(var j=0;j<nodeOffset&&j<n.childNodes.length;j++){ count+=(n.childNodes[j].textContent||'').length; } } found=true; return; } if(n.nodeType===3){ count+=(n.nodeValue||'').length; return; } for(var i=0;i<n.childNodes.length;i++){ walk(n.childNodes[i]); if(found)return; } };
    walk(root); return found?count:-1;
  }catch(e){ return -1; }
}
// 드래그한 '영역(줄범위)'을 Query 판정영역으로 — 줄번호(#N..#M)로 저장해 영역 전체가 정확히 잡힘 (부분 선택 버그 해결)
async function tcRespToQueryRegion(tcid){
  const tc=_tcById(tcid);
  if(!tc){ window._queryPick=null; if(typeof showToast==='function')showToast('TC 를 찾을 수 없습니다'); return; }
  _respStepId=_respStepId||{};
  var c=(tc.checks||[]).find(x=>x.id===_respStepId[tcid]);
  // ★ _respStepId 미설정 (전체 실행 후 어느 스텝도 안 펼친 상태) → selection 이 tc-resp-lines-<tcid> 안에 있으면 그 응답이 어느 스텝인지 유추
  // Response 컨테이너 자체는 스텝 id 를 안 담아서 selection 만으로는 확정 불가 → 대신 실행 결과 있는 스텝 중 마지막 실행/포커스 스텝을 폴백
  if(!c){
    try{
      var _sel0=window.getSelection?window.getSelection():null;
      var _selTxt=_sel0?String(_sel0.toString()):'';
      if(_selTxt.trim()){
        // 실행 결과가 있는 스텝 중, 그 출력에 드래그 문자열이 포함된 스텝을 선택 (가장 최근 실행 우선)
        var _cand=(tc.checks||[]).filter(function(x){ return (x.kind||'cli')==='cli' && x.output && String(x.output).indexOf(_selTxt.trim().split('\n')[0])>=0; });
        if(_cand.length){
          // executed_at 이 있으면 그것 기준으로 정렬 (가장 최근)
          _cand.sort(function(a,b){ return String(b.executed_at||'').localeCompare(String(a.executed_at||'')); });
          c=_cand[0]; _respStepId[tcid]=c.id;
        }
      }
    }catch(_e){}
  }
  if(!c){ window._queryPick=null; if(typeof showToast==='function')showToast('❗ 먼저 대상 스텝의 화살표(▶) 를 눌러 Response 를 펼친 뒤 그 안에서 드래그해 주세요'); return; }
  // ★ Selection API 정확 오프셋 우선: 드래그한 '그 줄·그 자리'를 indexOf 재탐색 없이 그대로 사용
  var _d=null; try{ _d=_rspSelDetail(); }catch(e){} if(!_d){ try{ _d=(window._rspSelD||{})[tcid]||null; }catch(e){} }
  let sel=''; try{ sel=String(window.getSelection?window.getSelection().toString():''); }catch(e){}
  if(_d&&_d.text) sel=_d.text;
  if(!sel.trim()) sel=String(_pendingSub[tcid]||'');
  if(!sel.trim()){ if(typeof showToast==='function')showToast('출력에서 판정영역을 드래그하세요'); return; }
  var _span=null; try{ _span=_selLineSpan(); }catch(e){} if(!_span){ try{ _span=(window._rspSpan||{})[tcid]||null; }catch(e){} }
  var _ln=_d?_d.line:((_span&&_span[0]===_span[1])?_span[0]:0);
  const q=_queryFromValue(_respShownLines(c), sel, _ln, _d?_d.start:undefined, true);   // 줄번호 + 정확 시작오프셋 + literal(드래그 그대로, 라벨:값 추출 안 함)
  if(!q){ if(typeof showToast==='function')showToast('영역을 인식하지 못했습니다 — 드래그한 문자열이 이 스텝 출력에 있는지 확인하세요'); return; }
  const nm=_addStepQuery(tc,c,q); _pendingSub[tcid]=''; window._queryPick=null;
  // 드래그로 저장된 Range 좌표(라인번호, 오프셋)를 마지막 Query 에 첨부 → 하이라이트가 그 자리만 표시
  try{
    var _qs=_stepQueries(c); var _last=_qs[_qs.length-1];
    if(_last && _d && typeof _d.line==='number' && typeof _d.start==='number'){
      _last.line=_d.line; _last.start=_d.start; _last.end=_d.end||(_d.start+String(sel).length); _last.val=String(sel);
    }
  }catch(_pe){}
  try{ _extractStepQueries(tcid, c, _respShownLines(c).join('\n')); }catch(_e){}   // 정의 즉시 현재 출력에서 값 추출(모델 감지 포함 모든 스텝)
  try{ if(window.getSelection) window.getSelection().removeAllRanges(); }catch(e){}
  _reJudge(c,tcid); await saveTCFile(tc); _respRefresh(tcid); tcProcRefresh(tcid);
  if(typeof showToast==='function')showToast('🎯 Query 판정영역 ${'+nm+'} = 드래그 영역만 ('+String(sel).replace(/\n/g,' ').trim().slice(0,30)+')');
}
// 드래그한 '값'을 변수로 생성 — 'Label : Value' 면 라벨 위치 기반(장비 달라도 그 자리 값), ${변수}로 IF/Switch에서 재사용
async function tcRespToVar(tcid){
  const tc=_tcById(tcid); const c=tc&&(tc.checks||[]).find(x=>x.id===_respStepId[tcid]); if(!c) return;
  let sel=''; try{ sel=String(window.getSelection?window.getSelection().toString():''); }catch(e){} if(!sel.trim()) sel=String(_pendingSub[tcid]||'');
  if(!sel.trim()){ if(typeof showToast==='function')showToast('출력에서 값을 드래그하세요'); return; }
  const _one=(String(sel).split('\n')[0]||'').trim()||sel;
  const q=_queryFromValue(_respShownLines(c), _one);
  if(!q){ if(typeof showToast==='function')showToast('값을 인식하지 못했습니다'); return; }
  const rm=String(q).match(/^\/(.*)\/[a-z]*$/); const rule=rm?rm[1]:q;   // /body/flags → 추출 규칙(정규식 body) — Query 아닌 '변수'(c.extracts)로
  const nm=_nextExtractVar(tc); _stepAddExtract(c, nm, rule);
  const val=String(_extractVar(_respShownLines(c).join('\n'), rule)||'').trim();
  if(!_varIsManual(tc,nm)) _varSetUser(tcid,nm,val,false);
  _pendingSub[tcid]='';
  try{ if(window.getSelection) window.getSelection().removeAllRanges(); }catch(e){}
  await saveTCFile(tc); _respRefresh(tcid); tcProcRefresh(tcid);
  if(typeof showToast==='function')showToast('✓ 변수 ${'+nm+'} = '+String(val).slice(0,26)+' (IF/Switch에서 사용)');
}
// 결과 한 줄을 클릭 1번으로 변수 생성 (그 줄이 'Label : Value' 면 값 위치 기준, 아니면 그 줄 값)
async function tcRespLineToVar(tcid,n){
  const tc=_tcById(tcid); const c=tc&&(tc.checks||[]).find(x=>x.id===_respStepId[tcid]); if(!c){ if(typeof showToast==='function')showToast('스텝을 먼저 펼치세요'); return; }
  const shown=_respShownLines(c); const ln=String(shown[n-1]||''); if(!ln.trim()){ if(typeof showToast==='function')showToast('빈 줄입니다'); return; }
  const _lv=_splitLabelVal(ln.trim()); const val=_lv?_lv.val:ln.trim();   // '=' / ':' 자동 분리(SNMP '::' 안전)
  const q=_queryFromValue(shown, ln.trim(), n); if(!q){ if(typeof showToast==='function')showToast('이 줄에서 값을 찾지 못했습니다'); return; }
  const _nm=_addStepQuery(tc,c,q);
  _reJudge(c,tcid); await saveTCFile(tc); tcProcRefresh(tcid);
  if(typeof showToast==='function')showToast('✓ 변수 '+_nm+' 생성 — '+String(val).slice(0,30)+' (IF에서 ▾로 선택)');
}
// 판정 기준 초기화 (F-2: extracts 배열까지 제거해야 재추출 안 됨)
async function tcRespResetCrit(tcid){
  const tc=_tcById(tcid); const c=tc&&(tc.checks||[]).find(x=>x.id===_respStepId[tcid]); if(!c) return;
  c.type='contains'; c.criteria=''; c.excludeLines=''; delete c.baseline; c.repeatResult=''; delete c.critMode;
  try{ delete c.critLines; delete c.critDev; delete c.critModel; }catch(e){}
  delete c.extracts; try{ delete c.extractVar; delete c.extractRule; }catch(e){ c.extractVar=''; c.extractRule=''; }
  _respSel[tcid]=undefined; await saveTCFile(tc); _respRefresh(tcid); tcProcRefresh(tcid);
  showToast('판정 기준 초기화 (타입·기준·제외·추출 변수 모두 해제)');
}
// "이 결과가 정상" — 현재 출력을 정상으로 저장. 선택 줄만/기존 기준 보존/전체 diff
async function tcStepMarkOK(tcid,id){
  const tc=_tcById(tcid); if(!tc) return; const c=(tc.checks||[]).find(x=>x.id===id); if(!c) return;
  const shown=_respShownLines(c); if(!shown.length){ showToast('먼저 ▶조회로 결과를 받으세요'); return; }
  const sel=(_respSel[tcid]||[]).slice().sort((a,b)=>a-b);
  c.repeatResult='Pass';
  if(sel.length){                                  // 선택한 줄만 기준
    c.type='diff'; c.baseline=shown.join('\n'); const ex=[]; shown.forEach((l,i)=>{ const n=i+1; if(sel.indexOf(n)<0) ex.push('#'+n); }); c.excludeLines=ex.join(', ');
    showToast('정상 결과 저장 — 선택 '+sel.length+'줄만 기준비교');
  } else if((c.type||'')==='diff' || c.type==='lines' || (c.criteria&&String(c.criteria).trim())){  // 기존 기준 보존 (전부 체크 방지)
    if((c.type||'')==='diff') c.baseline=shown.join('\n');
    showToast('정상 결과 저장 — 기존 판정 기준 유지');
  } else {                                          // 기준 없음 → 전체 diff
    c.type='diff'; c.baseline=shown.join('\n'); c.excludeLines='';
    showToast('정상 결과 저장 — 전체 줄 기준비교로 설정');
  }
  _respSel[tcid]=undefined; await saveTCFile(tc); tcProcRefresh(tcid);
}
async function tcRespApply(tcid,mode){
  const tc=_tcById(tcid); const c=tc&&(tc.checks||[]).find(x=>x.id===_respStepId[tcid]); if(!c) return;
  const sel=(_respSel[tcid]||[]).slice().sort((a,b)=>a-b);
  const shown=_respShownLines(c);
  if(mode==='allDiff'){ const contents=shown.filter(l=>String(l).trim()!==''); c.type='contains_all'; c.criteria=contents.join('\n'); c.excludeLines=''; showToast('전체 '+contents.length+'줄 내용을 판정기준으로 설정'); }
  else if(mode==='containsText'){ const t=String(_pendingSub[tcid]||'').trim(); if(!t){ showToast('먼저 결과에서 문구를 드래그 선택하세요'); return; } let toks=((c.type||'')==='contains_all'?String(c.criteria||'').split(/\r?\n/):[]).map(s=>s.trim()).filter(Boolean); if(toks.indexOf(t)<0) toks.push(t); c.type='contains_all'; c.criteria=toks.join('\n'); c.excludeLines=''; c.critFromRaw=true; /* 문구 검증은 Query 필터 무시하고 원본 output 에서 검색 (Query 로 값만 추출된 결과와 별개) */ _pendingSub[tcid]=''; showToast('"'+t.slice(0,24)+'" 검증 추가 (총 '+toks.length+'개)'); }
  else if(mode==='excludeText'){ const t=String(_pendingSub[tcid]||'').trim(); if(!t){ showToast('먼저 결과에서 문구를 드래그 선택하세요'); return; } const ex=String(c.excludeLines||'').split(/[,\n]/).map(s=>s.trim()).filter(Boolean); if(ex.indexOf(t)<0) ex.push(t); c.excludeLines=ex.join(', '); _pendingSub[tcid]=''; c.excMode='문구 제외'; showToast('"'+t.slice(0,24)+'" 포함 줄을 제외에 추가'); }
  else if(mode==='query'){ if(!sel.length){ showToast('출력에서 판정할 줄(영역)을 먼저 선택하세요'); return; } const contents=sel.map(n=>shown[n-1]).filter(l=>l!=null&&String(l).trim()!==''); if(!contents.length){ showToast('빈 줄입니다'); return; } let q; if(contents.length===1){ const ln=String(contents[0]); const ci=ln.indexOf(':'); if(ci>0){ const lb=ln.slice(0,ci).trim(), vl=ln.slice(ci+1).trim(); q=(lb&&vl)?('/'+_reEsc(lb)+'\\s*:\\s*(.+?)\\s*$/m'):ln.trim(); } else { q=ln.trim(); } } else { q=String(contents[0]).trim()+'..'+String(contents[contents.length-1]).trim(); } const _qnm=_addStepQuery(tc,c,q); showToast('🎯 Query→변수 '+_qnm+' : '+q.slice(0,36)); }   // 선택 줄 → 라벨 위치 기반 Query + 변수(추가)
  else {
    if(!sel.length){ showToast('줄을 먼저 선택하세요'); return; }
    if(mode==='lineOne'){ if(sel.length!==1){ showToast('라인 선택은 한 줄만 — 여러 줄은 [멀티 선택]'); return; } const t=String(shown[sel[0]-1]==null?'':shown[sel[0]-1]).trim(); if(!t){ showToast('빈 줄입니다'); return; } c.type='contains'; c.criteria=t; c.excludeLines=''; showToast('1줄 판정기준: 「'+t.slice(0,28)+'」'); }
    else if(mode==='lines'){ const contents=sel.map(n=>shown[n-1]).filter(l=>l!=null&&String(l).trim()!==''); c.type='contains_all'; c.criteria=contents.join('\n'); c.excludeLines=''; showToast('선택 '+contents.length+'줄 내용을 판정기준으로 설정'); }
    else if(mode==='exclude'){ const ex=String(c.excludeLines||'').split(/\n/).map(s=>s.trim()).filter(Boolean); sel.forEach(n=>{ const ln=String(shown[n-1]||'').trim(); if(ln && ex.indexOf(ln)<0) ex.push(ln); }); c.excludeLines=ex.join('\n'); c.excMode=(sel.length===1?'라인 제외':'멀티 제외'); showToast('선택 '+sel.length+'줄 내용을 제외에 추가'); }
    else if(mode==='onlyDiff'){ const contents=sel.map(n=>shown[n-1]).filter(l=>l!=null&&String(l).trim()!==''); c.type='contains_all'; c.criteria=contents.join('\n'); c.excludeLines=''; showToast('선택 '+contents.length+'줄 내용을 판정기준으로 설정'); }
  }
  // [자동 재기준] 줄 위치 기반 기준은 선택한 줄번호 + 기준장비를 저장 → 다른 장비로 재실행 시 같은 줄 위치로 새 결과에서 재도출
  if(mode==='lines'||mode==='onlyDiff'||mode==='lineOne'){ c.critLines=sel.slice(); c.critModel=String(((typeof _procVars!=='undefined'&&_procVars[tcid])||{}).model||''); try{ const _l=_checkLab(tc,c); c.critDev=String((_l&&(_l.id||_l.name||_l.ip))||''); }catch(e){ c.critDev=''; } }
  else if(mode==='containsText'||mode==='excludeText'||mode==='allDiff'||mode==='query'){ try{ delete c.critLines; delete c.critDev; delete c.critModel; }catch(e){ c.critLines=null; } }
  const _cm={lineOne:'라인 선택',lines:'멀티 선택',onlyDiff:'멀티 선택',allDiff:'전체 비교',containsText:'문구 검증'}; if(_cm[mode]) c.critMode=_cm[mode];
  _reJudge(c,tcid);   // 조건8: 판정기준 변경 즉시 재판정 (실시간 Pass/Fail)
  if(mode==='exclude'||mode==='allDiff'||mode==='containsText'||mode==='excludeText') _respSel[tcid]=undefined; // 시드 재발동 (lines/onlyDiff는 선택 유지)
  await saveTCFile(tc); tcProcRefresh(tcid);
}
// (구) 줄선택 변수추출 tcRespToVar 제거 — 드래그版(위 1181)으로 일원화. 줄선택 변수는 tcVarCreate / tcRespLineToVar 사용
// 선택한 테이블 행의 특정 컬럼을 변수로 추출
async function tcRespToVarCol(tcid,col){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); const c=tc&&(tc.checks||[]).find(x=>x.id===_respStepId[tcid]); if(!c) return;
  const sel=(_respSel[tcid]||[]); if(sel.length!==1){ showToast('테이블 행을 1개만 선택하세요'); return; }
  const ln=_respShownLines(c)[sel[0]-1]||''; const rowKey=((ln.trim().match(/^(\S+)/)||[])[1])||'';
  if(!rowKey){ showToast('행 키를 인식하지 못했습니다'); return; }
  const rule=rowKey+' || '+col;
  const name=(rowKey+'_'+col).replace(/[^A-Za-z0-9_]+/g,'_').replace(/^_+|_+$/g,'')||'var';
  _stepAddExtract(c, name, rule);
  const val=_extractVar(_respShownLines(c).join('\n'), rule);
  if(!_varIsManual(tc,name)) _varSetUser(tcid,name,val,false);
  _respSel[tcid]=[]; _procBottomTab[tcid]='props';
  await saveTCFile(tc); tcProcRefresh(tcid);
  showToast('변수 추출 → '+rowKey+' 행의 ['+col+'] = '+val+'  (변수명: '+name+')');
}
// ── PART C: 변수 생성 팝업 (출력에서 선택 → 여러 개 추가) ──
var _varCreate=null;
function tcVarCreate(tcid){
  const tc=_tcById(tcid); const c=tc&&(tc.checks||[]).find(x=>x.id===_respStepId[tcid]); if(!c){ showToast('먼저 스텝을 선택/실행하세요'); return; }
  const shown=_respShownLines(c); if(!shown.length){ showToast('출력이 있어야 변수를 만들 수 있습니다 — ▶로 실행하세요'); return; }
  const sel=(Array.isArray(_respSel[tcid])?_respSel[tcid]:[]).slice().sort((a,b)=>a-b);
  let mode='lines', name='';
  if(sel.length===1){ const ln=shown[sel[0]-1]||''; const m=ln.match(/^(.*?)\s*[:=]/); if(m&&m[1].trim()){ mode='value'; name=m[1].trim().replace(/[^A-Za-z0-9_]+/g,'_').replace(/^_+|_+$/g,''); } }
  _varCreate={tcid:tcid, id:c.id, sel:sel, mode:mode, name:name, regex:''};
  const exo=document.getElementById('tc-var-create'); if(exo) exo.remove();
  const ov=document.createElement('div'); ov.id='tc-var-create';
  ov.style.cssText='position:fixed;inset:0;z-index:100003;background:rgba(15,22,38,0.55);display:flex;align-items:center;justify-content:center;';
  ov.innerHTML='<div id="vc-box" style="width:min(720px,94vw);max-height:90vh;overflow:auto;background:#fff;border-radius:14px;box-shadow:0 24px 64px rgba(0,0,0,0.4);padding:18px 20px;"></div>';
  ov.addEventListener('mousedown', function(e){ ov._downBg=(e.target===ov); });
  ov.onclick=function(e){ if(e.target===ov && ov._downBg) _varCreateClose(); };
  document.body.appendChild(ov);
  _varCreateRender();
}
function _varCreateClose(){ const tcid=_varCreate?_varCreate.tcid:null; _varCreate=null; const ov=document.getElementById('tc-var-create'); if(ov) ov.remove(); if(tcid) tcProcRefresh(tcid); }
function _varCreateToggle(n){ const st=_varCreate; if(!st) return; const k=st.sel.indexOf(n); if(k>=0) st.sel.splice(k,1); else st.sel.push(n); st.sel.sort((a,b)=>a-b); _varCreateRender(); }
function _varCreateSetMode(m){ const st=_varCreate; if(!st) return; st.mode=m; _varCreateRender(); }
function _varCreateRule(){
  const st=_varCreate; if(!st) return '';
  if(st.mode==='regex') return String(st.regex||'');
  const tc=_tcById(st.tcid); const c=tc&&(tc.checks||[]).find(x=>x.id===st.id); const shown=c?_respShownLines(c):[]; const sel=st.sel.slice().sort((a,b)=>a-b);
  if(st.mode==='value'){ const ln=sel.length?(shown[sel[0]-1]||''):''; const m=ln.match(/^(.*?)\s*[:=]/); return (m&&m[1].trim())?m[1].trim():((ln.trim().split(/\s+/)[0])||''); }
  if(!sel.length) return '';                 // lines: 빈 선택 → 전체
  return '#lines:'+sel.join(',');
}
function _varCreatePreview(){ const st=_varCreate; if(!st) return; const el=document.getElementById('vc-preview'); if(!el) return; const tc=_tcById(st.tcid); const c=tc&&(tc.checks||[]).find(x=>x.id===st.id); const out=c?_respShownLines(c).join('\n'):''; let v=''; try{ v=_extractVar(out, _varCreateRule()); }catch(e){ v='(규칙 오류)'; } el.textContent=(v===''?'(빈 값)':v); }
function _varCreateRender(){
  const st=_varCreate; if(!st) return; const box=document.getElementById('vc-box'); if(!box) return;
  const tc=_tcById(st.tcid); const c=tc&&(tc.checks||[]).find(x=>x.id===st.id); if(!c){ _varCreateClose(); return; }
  const shown=_respShownLines(c);
  const lines=shown.map((l,i)=>{ const n=i+1; const on=st.sel.indexOf(n)>=0; return '<div onclick="_varCreateToggle('+n+')" style="display:flex;gap:8px;cursor:pointer;padding:1px 8px;font-family:ui-monospace,monospace;font-size:12px;line-height:1.6;white-space:pre;'+(on?'background:rgba(124,58,237,0.13);':'')+'"><span style="color:#aeb6c8;min-width:24px;text-align:right;user-select:none;">'+n+'</span><span style="color:#11182b;">'+(String(l).replace(/&/g,'&amp;').replace(/</g,'&lt;')||' ')+'</span></div>'; }).join('');
  const radio=(m,lab)=>'<label style="display:inline-flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;margin-right:14px;"><input type="radio" name="vcmode" '+(st.mode===m?'checked':'')+' onclick="_varCreateSetMode(\''+m+'\')">'+lab+'</label>';
  const modeRow=radio('lines','선택한 줄 전체')+radio('value','항목 값 (콜론 뒤)')+radio('regex','정규식');
  const regBox=st.mode==='regex'?('<input id="vc-regex" value="'+String(st.regex||'').replace(/"/g,'&quot;')+'" oninput="_varCreate.regex=this.value;_varCreatePreview()" placeholder="예: Serial\\s*:\\s*(\\S+)" style="width:100%;margin-top:6px;font-size:12px;font-family:ui-monospace,monospace;padding:6px 8px;border:1px solid #cdd6e6;border-radius:6px;box-sizing:border-box;">'):'';
  const exarr=_stepExtracts(c);
  const exList=exarr.length?('<div style="display:flex;flex-direction:column;gap:5px;margin-top:6px;">'+exarr.map(e=>'<div style="display:flex;align-items:center;gap:8px;font-size:12px;background:#f7f5ff;border:1px solid #e6def7;border-radius:6px;padding:4px 9px;"><span style="font-family:ui-monospace,monospace;color:#7c3aed;font-weight:800;">${'+e.var+'}</span><span style="color:var(--text3);font-size:11px;flex:1;font-family:ui-monospace,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+String(e.rule||'(전체)').replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</span><i class="ti ti-x" onclick="_varCreateDel(\''+String(e.var).replace(/[\\\\\x27]/g,'')+'\')" title="삭제" style="cursor:pointer;color:#c0392b;"></i></div>').join('')+'</div>'):'<div style="font-size:11.5px;color:var(--text3);margin-top:4px;">아직 추출 변수가 없습니다.</div>';
  box.innerHTML='<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;"><i class="ti ti-variable-plus" style="color:#7c3aed;font-size:18px;"></i><span style="font-size:15px;font-weight:800;color:#1a2236;">변수 생성</span><span style="flex:1;"></span><i class="ti ti-x" onclick="_varCreateClose()" style="cursor:pointer;font-size:20px;color:#8a93a5;"></i></div>'
    +'<div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:4px;">① 출력에서 줄 선택 (클릭 토글 · 정규식 방식이면 선택 무관)</div>'
    +'<div style="border:1px solid #e3e7ef;border-radius:8px;max-height:32vh;overflow:auto;background:#fafbff;padding:3px 0;margin-bottom:12px;">'+lines+'</div>'
    +'<div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:4px;">② 추출 방식</div>'
    +'<div style="margin-bottom:'+(st.mode==='regex'?'2px':'12px')+';">'+modeRow+'</div>'+regBox+(st.mode==='regex'?'<div style="height:10px;"></div>':'')
    +'<div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:4px;">③ 변수명 · 미리보기</div>'
    +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;"><input id="vc-name" value="'+String(st.name||'').replace(/"/g,'&quot;')+'" oninput="_varCreate.name=this.value" placeholder="예: serial" style="width:180px;font-size:13px;font-family:ui-monospace,monospace;padding:7px 9px;border:1px solid #cdd6e6;border-radius:6px;"><span style="font-size:11px;color:var(--text3);">→</span><span id="vc-preview" style="font-size:12px;font-family:ui-monospace,monospace;color:#00875a;font-weight:700;background:#f0fbf6;border:1px solid #cfe8db;border-radius:5px;padding:3px 8px;flex:1;white-space:pre;overflow:hidden;text-overflow:ellipsis;"></span></div>'
    +'<div style="display:flex;gap:8px;margin:10px 0 14px;"><button onclick="_varCreateAdd()" style="font-size:13px;font-weight:700;padding:8px 18px;border:none;border-radius:8px;background:#7c3aed;color:#fff;cursor:pointer;"><i class="ti ti-plus"></i> 변수 추가</button><span style="flex:1;"></span><button onclick="_varCreateClose()" style="font-size:12px;padding:8px 16px;border:1px solid var(--border);border-radius:8px;background:#fff;color:var(--text2);cursor:pointer;">닫기</button></div>'
    +'<div style="font-size:11px;font-weight:700;color:var(--text3);border-top:1px solid #eef0f4;padding-top:9px;">이 스텝의 추출 변수 ('+exarr.length+')</div>'+exList;
  _varCreatePreview();
}
function _varCreateAdd(){
  const st=_varCreate; if(!st) return; const tc=_tcById(st.tcid); const c=tc&&(tc.checks||[]).find(x=>x.id===st.id); if(!c) return;
  const rule=_varCreateRule();
  let name=String(st.name||'').replace(/[^A-Za-z0-9_]+/g,'_').replace(/^_+|_+$/g,'');
  if(!name){ if(st.mode==='value'){ name=String(rule||'').replace(/[^A-Za-z0-9_]+/g,'_').replace(/^_+|_+$/g,''); } else if(st.sel.length){ name='line'+st.sel[0]; } }
  if(!name){ showToast('변수명을 입력하세요'); return; }
  if(st.mode==='regex' && !String(st.regex||'').trim()){ showToast('정규식을 입력하세요'); return; }
  if(st.mode==='lines' && !st.sel.length){ showToast('줄을 선택하거나 다른 방식을 고르세요'); return; }
  const val=_extractVar(_respShownLines(c).join('\n'), rule);
  const wasManual=_varIsManual(tc,name);
  _stepAddExtract(c, name, rule);              // F-5: 추가/갱신(덮어쓰기 금지)
  if(wasManual){ showToast('변수 '+name+' 정의 갱신 — 수동(골든) 값/플래그 보존'); }
  else { _varSetUser(st.tcid, name, val, false); showToast('변수 '+name+' = '+val); }
  st.name=''; saveTCFile(tc).then(function(){ _varCreateRender(); tcProcRefresh(st.tcid); });
}
function _varCreateDel(name){ const st=_varCreate; if(!st) return; const tc=_tcById(st.tcid); const c=tc&&(tc.checks||[]).find(x=>x.id===st.id); if(!c) return; _stepDelExtract(c, name); saveTCFile(tc).then(function(){ _varCreateRender(); tcProcRefresh(st.tcid); }); }
// ── PART B-8: 변수 비교 메뉴 ──
function tcVarMenuClose(){ const m=document.getElementById('tc-var-menu'); if(m) m.remove(); document.removeEventListener('click', tcVarMenuClose); }async function tcVarSetCrit(tcid,id,name){ const tc=_tcById(tcid); const c=tc&&(tc.checks||[]).find(x=>x.id===id); if(!c) return; const _v=_varVal(tcid,name); if(tc&&_v!=null){ tc.varVals=tc.varVals||{}; if(tc.varVals[name]==null) tc.varVals[name]=_v; _procVars[tcid]=_procVars[tcid]||{}; if(_procVars[tcid][name]==null) _procVars[tcid][name]=_v; } c.type='expr'; c.criteria='${'+name+'}'; c.excludeLines=''; _reJudge(c,tcid); await saveTCFile(tc); tcProcRefresh(tcid); showToast('판정기준 = 변수 ${'+name+'}'); }
async function tcVarClearCrit(tcid,id){ const tc=_tcById(tcid); const c=tc&&(tc.checks||[]).find(x=>x.id===id); if(!c) return; c.criteria=''; c.type='contains'; c.excludeLines=''; delete c.critMode; _reJudge(c,tcid); await saveTCFile(tc); tcProcRefresh(tcid); showToast('변수 비교 해제'); }
// Query(판정영역)에 해당하는 줄번호 Set — 출력 하이라이트용 (_applyQuery 와 동일 규칙)
function _queryLineSet(lines, query){
  const set=new Set(); const q=String(query||'').trim(); if(!q||!Array.isArray(lines)) return set;
  const rm=q.match(/^\/(.*)\/([gimsuy]*)$/);
  if(rm){ try{ const re=new RegExp(rm[1], rm[2].replace(/g/g,'')); lines.forEach(function(l,i){ try{ if(re.test(String(l))) set.add(i+1); }catch(e){} }); }catch(e){} return set; }
  if(q.indexOf('..')>=0){ const pi=q.indexOf('..'); const a=q.slice(0,pi).trim(), b=q.slice(pi+2).trim(); const an=a.match(/^#(\d+)$/), bn=b.match(/^#(\d+)$/); if(an&&bn){ let s=parseInt(an[1])-1, e=parseInt(bn[1])-1; if(e<s){const t=s;s=e;e=t;} s=Math.max(0,s); e=Math.min(lines.length-1,e); for(let i=s;i<=e;i++) set.add(i+1); return set; } let s=-1,e=-1; for(let i=0;i<lines.length;i++){ if(s<0){ if(a&&String(lines[i]).indexOf(a)>=0) s=i; } else if(b&&String(lines[i]).indexOf(b)>=0){ e=i; break; } } if(s>=0){ if(e<0)e=lines.length-1; for(let i=s;i<=e;i++) set.add(i+1); } return set; }
  lines.forEach(function(l,i){ if(String(l).indexOf(q)>=0) set.add(i+1); }); return set;
}
function _reEsc(s){ return String(s||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
// 한 줄에서 Query에 매칭되는 '값' 부분(하이라이트 대상)을 반환 — 정규식=캡처값, 문구=그 문구, 구간(..)= '' (전체라인 별도 처리)
function _queryLineMatch(line, query){
  const q=String(query||'').trim(); if(!q) return ''; const L=String(line==null?'':line);
  const rm=q.match(/^\/(.*)\/([gimsuy]*)$/);
  if(rm){ try{ const re=new RegExp(rm[1], rm[2].replace(/g/g,'')); const m=re.exec(L); if(m) return String(m[1]!=null?m[1]:m[0]); }catch(e){} return ''; }
  if(q.indexOf('..')>=0) return '';
  return L.indexOf(q)>=0 ? q : '';
}
// 'Label SEP Value' 한 줄을 라벨/값으로 분리 — '='(SNMP/MIB) 우선, 그다음 ':'(라벨엔 ':' 불가 → '::' 자동 회피)
function _splitLabelVal(line){
  var s=String(line==null?'':line).replace(/\s+$/,'');
  var em=s.match(/^(.*\S)\s*=\s*(\S.*)$/);     // 예) SNMPv2-MIB::sysDescr.0 = E5724RL → 값 'E5724RL'
  if(em) return {label:em[1].trim(), val:em[2].trim(), sep:'\\s*=\\s*'};
  var cm=s.match(/^([^:]*\S)\s*:\s*(\S.*)$/);   // 예) Model Name : E5724RL → 값 'E5724RL' ('::' 는 라벨에 ':' 포함이라 매칭 안 됨)
  if(cm) return {label:cm[1].trim(), val:cm[2].trim(), sep:'\\s*:\\s*'};
  return null;
}
// 드래그한 텍스트의 캡처 패턴 — 단일 토큰이면 \S+(그 자리 값), 여러 단어면 정확 일치
function _genPattern(s){   // 드래그 값 → '영역 패턴': 숫자 묶음→\d+, 공백 묶음→\s+, 나머지는 그대로(escape). 값이 바뀌어도 같은 영역을 다시 캡처
  s=String(s==null?'':s); var out='', i=0;
  while(i<s.length){ var c=s[i];
    if(c>='0'&&c<='9'){ while(i<s.length&&s[i]>='0'&&s[i]<='9')i++; out+='\\d+'; continue; }
    if(/\s/.test(c)){ while(i<s.length&&/\s/.test(s[i]))i++; out+='\\s+'; continue; }
    out+=_reEsc(c); i++;
  }
  return out||'\\S+';
}
function _litPat(s){ return String(s==null?'':s).trim().split(/\s+/).map(_reEsc).join('\\s+'); }   // 드래그한 그대로(숫자도 리터럴, 공백만 \s+) → 'fan-tray 1' 이 'fan-tray 2' 를 안 잡음// 드래그/선택한 '값' 또는 '줄 전체'로 Query 생성 — 'Label SEP Value' 면 라벨 위치 기반 정규식(장비 달라도 그 자리 값 추출), 아니면 문구/구간
function _queryFromValue(shown, sel, lineNo, exactStart, literal){
  const s=String(sel||'').replace(/\r/g,'').trim(); if(!s) return '';
  if(s.indexOf('\n')<0){
    // ★ 대상 줄 찾기: lineNo 우선, 없으면 s가 든 첫 줄 (lineNo 유무와 무관하게 '위치 기반'을 1순위로 → 라벨오인 분기 차단)
    var _tl=null, _exact=(typeof exactStart==='number'&&exactStart>=0);
    if(lineNo && shown && shown[lineNo-1]!=null){ var _cand=String(shown[lineNo-1]); if(_exact ? (_cand.substr(exactStart,s.length)===s) : (_cand.indexOf(s)>=0)){ _tl=_cand; } }
    if(_tl==null){ _exact=false; if(lineNo && shown && shown[lineNo-1]!=null && String(shown[lineNo-1]).indexOf(s)>=0){ _tl=String(shown[lineNo-1]); } else { for(var _k=0;_k<(shown||[]).length;_k++){ var _ln=String(shown[_k]==null?'':shown[_k]); if(_ln.indexOf(s)>=0){ _tl=_ln; break; } } } }
    if(_tl!=null){
      // 줄 전체 선택: 드래그(literal)면 그 줄 '그대로' 캡처(라벨:값 추출 안 함). 줄클릭(literal=false)만 라벨:값이면 값 추출
      if(_tl.trim()===s){ if(!literal){ var _lv=_splitLabelVal(_tl); if(_lv && _lv.label && _lv.label.trim()) return '/'+_reEsc(_lv.label)+_lv.sep+'(.+?)\\s*$/m'; } return '/^\\s*('+_litPat(s)+')\\s*$/m'; }
      var _pT=_exact?exactStart:_tl.indexOf(s);   // ★ 정확 오프셋이 있으면 그 자리(같은 글자가 줄에 여러 번 있어도 드래그한 위치)
      // ★ 캡처는 기본적으로 '드래그한 그대로'(리터럴, 공백만 \s+) → 'fan-tray 1'이 'fan-tray 2'를 안 잡음.
      // 다만 드래그 값이 '순수 숫자'(예: uptime의 '1 mins'에서 '1')면 시간이 지나면 값이 바뀌는 수치일
      // 가능성이 높으므로 캡처를 \d+ 로 일반화 → '10', '38' 등으로 변해도 그 자리 값 캡처.
      // 앞/뒷부분(_anc/_suf)으로 그 줄·그 자리는 여전히 유일하게 고정됨.
      // _genPattern('')는 폴백 \S+ 를 주는데 이를 앵커로 쓰면 \S+가 앞을 먹어 엉뚱한 자리(16:08→08:39)를 잡으므로 폴백류는 앵커 무효 처리
      var _bad=function(a){ return !a||a==='\\s+'||a==='\\s*'||a==='\\S+'; };
      // ★ 드래그한 부분만 정확히 캡처 — 숫자여도 \d+ 로 일반화 하지 않음 (전엔 '219' 드래그 시 뒤 '308' 까지 먹어 '21930' 이 됨)
      var _cap=_litPat(s);
      var _pre=_tl.slice(0,_pT); var _preFull=_tl.slice(0,_pT);   // 앞 전체(원본 유지)
      var _suf=_tl.slice(_pT+s.length);                            // 뒤 전체
      var _anc=_genPattern(_preFull.slice(-24)); var _sa=_genPattern(_suf.slice(0,24));

      // 헬퍼: 정규식이 shown 전체에서 매치되는 줄 수 (multiline 각 줄 검사)
      var _cntLines=function(pat){
        var re=null; try{ re=new RegExp(pat); }catch(_e){ return 0; }
        var n=0;
        for(var i=0;i<shown.length;i++){
          re.lastIndex=0;
          try{ if(re.test(String(shown[i]))) n++; }catch(_e){}
        }
        return n;
      };

      // 1) 앞뒤 앵커 동시 조합 (가장 특이) → shown 전체에서 매치 줄 수 검증
      var _cands=[];
      if(!_bad(_anc) && !_bad(_sa)) _cands.push(_anc+'('+_cap+')'+_sa);
      if(!_bad(_anc))               _cands.push(_anc+'('+_cap+')');
      if(!_bad(_sa))                _cands.push('('+_cap+')'+_sa);
      for(var _ci=0;_ci<_cands.length;_ci++){
        if(_cntLines(_cands[_ci])===1) return '/'+_cands[_ci]+'/m';
      }

      // 2) 여전히 여러 줄 매치 → 이 줄의 앞부분 전체를 리터럴 앵커로 (섹션 헤더 앞까지 안 봐도 됨. 이 줄 자체가 unique 하기 충분).
      //    라인 시작에서 드래그된 경우 (_pre='') 는 이 줄의 뒷부분(_suf) 리터럴을 뒤에 붙여 유일화.
      var _mkLit=function(str){ return _reEsc(String(str||'')).replace(/\\ /g,'\\s+'); };
      if(_preFull && _preFull.trim()){
        var _preEsc=_mkLit(_preFull);
        var _t1=_preEsc+'\\s*('+_cap+')';
        if(_cntLines(_t1)===1) return '/'+_t1+'/m';
      }
      if(_suf && _suf.trim()){
        var _sufEsc=_mkLit(_suf.slice(0,60));   // 뒤 60자 정도면 대부분 unique
        var _t2='('+_cap+')\\s*'+_sufEsc;
        if(_cntLines(_t2)===1) return '/'+_t2+'/m';
      }
      // 앞+뒤 둘 다 붙이기
      if(_preFull && _suf){
        var _t3=_mkLit(_preFull)+'\\s*('+_cap+')\\s*'+_mkLit(_suf.slice(0,60));
        if(_cntLines(_t3)===1) return '/'+_t3+'/m';
      }

      // 3) 그래도 안 되면 줄 통째로 리터럴 매치 (line-start/end 앵커)
      //    — 두 줄이 완전 동일 내용이면 어쩔 수 없지만 화면상 안 흔한 경우.
      var _wholeLine='^'+_mkLit(_tl)+'$';
      if(_cntLines(_wholeLine)>=1) return '/'+_wholeLine+'/m';

      // 4) 최후 fallback — 첫 후보 (여러 줄이라도)
      return _cands[0]?('/'+_cands[0]+'/m'):('/('+_cap+')/m');
    }
    if(!literal){ var m2=_splitLabelVal(s); if(m2 && m2.val){ return '/'+_reEsc(m2.label)+m2.sep+'(.+?)\\s*$/m'; } }   // s가 어느 줄에도 없을 때만 라벨:값 분해(줄클릭만)
    return s;   // 출력에 없으면 그대로 (포함 검색)
  }
  var lines=s.split('\n').map(function(x){return x.trim();}).filter(Boolean);
  return lines.length>=2 ? (lines[0]+'..'+lines[lines.length-1]) : (lines[0]||s);
}
// ── Query 변수(여러 개) 모델 — c.queries=[{q,var}] (구 단일 c.query/c.queryVar 자동 이관) ──
function _stepQueries(c){ if(!Array.isArray(c.queries)){ c.queries = (c.query? [{q:c.query, var:(c.queryVar||'query1')}] : []); } c.queries.forEach(function(qq){ if(qq&&qq.var!=null) qq.var=String(qq.var).trim(); }); return c.queries; }   // 변수명 공백 제거(저장값 정리)
function _querySync0(c){ const qs=c.queries||[]; if(qs.length){ c.query=qs[0].q; c.queryVar=qs[0].var; } else { delete c.query; delete c.queryVar; } }   // 구 코드 호환: 첫 query를 c.query/c.queryVar에 미러
function _allQueryVars(tc){ const s={}; ((tc&&tc.checks)||[]).forEach(function(x){ if(!x) return; if(x.queryVar) s[String(x.queryVar).trim()]=1; (Array.isArray(x.queries)?x.queries:[]).forEach(function(q){ if(q&&q.var) s[String(q.var).trim()]=1; }); }); return s; }   // c.queryVar(구) + c.queries(신) 모두 스캔 — 번호 충돌 방지
// Switch 평가식/변수 입력칸 우클릭 → 설정한 변수 선택 삽입
function tcSwitchVarMenu(ev, tcid, cid){
  try{ ev.preventDefault(); ev.stopPropagation(); }catch(e){}
  var tc=_tcById(tcid); if(!tc) return;
  var vars={}; ['model','modelGroup'].forEach(function(v){ vars[v]=1; });
  try{ Object.keys(_allQueryVars(tc)||{}).forEach(function(v){ if(v)vars[v]=1; }); }catch(e){}
  try{ Object.keys(_tcAllVars(tcid)).forEach(function(v){ if(v)vars[v]=1; }); }catch(e){}   // 현재 스텝이 정의한 변수만(잔류 제외)
  var list=Object.keys(vars).filter(Boolean).sort();
  var old=document.getElementById('sw-var-menu'); if(old)old.remove();
  var m=document.createElement('div'); m.id='sw-var-menu';
  m.style.cssText='position:fixed;z-index:100090;left:'+(ev.clientX||100)+'px;top:'+(ev.clientY||100)+'px;background:#fff;border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(20,40,80,0.20);padding:5px;min-width:170px;max-height:300px;overflow:auto;';
  var pv=(typeof _procVars!=='undefined'&&_procVars[tcid])||{};
  var rows=list.length?list.map(function(v){ var val=(pv[v]!=null)?pv[v]:((tc.varVals&&tc.varVals[v]!=null)?tc.varVals[v]:''); var vs=String(v).replace(/[\\'"]/g,''); return '<div onclick="tcSwitchVarPick(\''+tcid+'\',\''+cid+'\',\''+vs+'\')" style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:5px 8px;border-radius:6px;cursor:pointer;font-size:12px;" onmouseenter="this.style.background=\'#eef3ff\'" onmouseleave="this.style.background=\'\'"><span style="font-family:monospace;color:#7c3aed;font-weight:700;">${'+_bdEsc(v)+'}</span>'+((val!==''&&val!=null)?'<span style="font-size:10px;color:var(--text3);max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">= '+_bdEsc(String(val))+'</span>':'')+'</div>'; }).join(''):'<div style="padding:9px 10px;color:var(--text3);font-size:11.5px;text-align:center;">설정된 변수 없음<br>(모델 감지·Query로 변수 생성)</div>';
  var _cs=(tc.checks||[]).filter(function(x){return x&&x.colVars&&Object.keys(x.colVars).length;});
  var colRows='';
  if(_cs.length){ colRows='<div style="font-size:10px;font-weight:700;color:#2d6fd4;padding:6px 8px 4px;border-top:1px solid #eef0f4;margin-top:4px;">표 컬럼 (스텝별) · 클릭 → #N.colM(\'$i\') 삽입 · For는 $i, 단일행은 행번호</div>';
    _cs.forEach(function(st,si){ var _sn=_colStepLbl(tc,st,si); var cmd=String(st.cli||st.action||'').split(/\r?\n/)[0].slice(0,30); var cols=Object.keys(st.colVars).filter(function(k){return /^col\d+$/.test(k);}).sort(function(a,b){return parseInt(a.slice(3))-parseInt(b.slice(3));});
      colRows+='<div style="font-size:10px;color:#9aa1ad;padding:4px 8px 1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:250px;">#'+_sn+'  '+_bdEsc(cmd)+'</div><div style="display:flex;flex-wrap:wrap;gap:3px;padding:0 8px 4px;">'+cols.map(function(ck){ var ref='#'+_sn+'.'+ck; var hn=(st.colNames&&st.colNames[ck])?String(st.colNames[ck]):''; var first=(Array.isArray(st.colVars[ck])&&st.colVars[ck][0]!=null)?String(st.colVars[ck][0]).slice(0,12):''; return '<span onclick="tcSwitchColPick(\''+tcid+'\',\''+cid+'\',\''+ref+'\')" title="클릭 → '+ref+' 삽입 (예: '+_bdEsc(first)+')" style="font-family:monospace;font-size:11px;font-weight:700;color:#2d6fd4;background:#eef4ff;border:1px solid #cdddf5;border-radius:5px;padding:1px 7px;cursor:pointer;">'+ref+(hn?'<span style="font-family:inherit;color:#5a6478;font-weight:600;margin-left:3px;">'+_bdEsc(hn)+'</span>':'')+'</span>'; }).join('')+'</div>'; }); }
  m.innerHTML='<div style="font-size:10px;font-weight:700;color:#7c3aed;padding:3px 8px 5px;border-bottom:1px solid #eef0f4;margin-bottom:3px;">변수 선택 → 삽입</div>'+rows+colRows;
  document.body.appendChild(m);
  var r=m.getBoundingClientRect(); if(r.right>window.innerWidth) m.style.left=Math.max(6,window.innerWidth-r.width-8)+'px'; if(r.bottom>window.innerHeight) m.style.top=Math.max(6,window.innerHeight-r.height-8)+'px';
  setTimeout(function(){ var close=function(e){ var mm=document.getElementById('sw-var-menu'); if(mm&&!mm.contains(e.target)){ mm.remove(); document.removeEventListener('mousedown',close,true); } }; document.addEventListener('mousedown',close,true); },0);
}
function tcSwitchVarPick(tcid,cid,v){
  var menu=document.getElementById('sw-var-menu'); if(menu)menu.remove();
  var tc=_tcById(tcid); var c=tc&&(tc.checks||[]).find(function(x){return x.id===cid;}); if(!c)return;
  var inp=document.getElementById('swexpr-'+cid); var ins='${'+v+'}';
  if(inp){ var s=inp.selectionStart, e2=inp.selectionEnd; var val=inp.value||''; if(typeof s==='number'&&s>=0){ inp.value=val.slice(0,s)+ins+val.slice(e2); var pos=s+ins.length; try{ inp.focus(); inp.setSelectionRange(pos,pos); }catch(_){} } else { inp.value=val+ins; } c.switchExpr=inp.value; }
  else { c.switchExpr=String(c.switchExpr||'')+ins; }
  tcCheckSave(tcid,cid,'switchExpr',c.switchExpr);
}
function tcSwitchColPick(tcid,cid,ref){   // 표 컬럼 #N.colM 을 IF/Switch 식에 #N.colM('$i') 로 삽입 (For 순차 비교용)
  var menu=document.getElementById('sw-var-menu'); if(menu)menu.remove();
  var tc=_tcById(tcid); var c=tc&&(tc.checks||[]).find(function(x){return x.id===cid;}); if(!c)return;
  var inp=document.getElementById('swexpr-'+cid); var ins=ref+"('$i')";
  if(inp){ var s=inp.selectionStart, e2=inp.selectionEnd; var val=inp.value||''; if(typeof s==='number'&&s>=0){ inp.value=val.slice(0,s)+ins+val.slice(e2); var pos=s+ins.length; try{ inp.focus(); inp.setSelectionRange(pos,pos); }catch(_){} } else { inp.value=val+ins; } c.switchExpr=inp.value; }
  else { c.switchExpr=String(c.switchExpr||'')+ins; }
  tcCheckSave(tcid,cid,'switchExpr',c.switchExpr);
}
function _nextQueryVar(tc){ const used=_allQueryVars(tc); let n=1; while(used['var'+n]||used['query'+n]) n++; return 'var'+n; }   // 생성 변수명은 var1, var2 … (기존 query 번호와도 겹치지 않게)
function _nextExtractVar(tc){ const used={}; ((tc&&tc.checks)||[]).forEach(function(x){ _stepExtracts(x).forEach(function(e){ if(e&&e.var)used[e.var]=1; }); }); try{ Object.keys(_allQueryVars(tc)||{}).forEach(function(k){used[k]=1;}); }catch(e){} let n=1; while(used['var'+n]||used['query'+n]) n++; return 'var'+n; }   // 추출 변수명(query 변수·추출 변수 모두 회피)
function _addStepQuery(tc,c,q){ const qs=_stepQueries(c); const nm=_nextQueryVar(tc); qs.push({q:q, var:nm}); _querySync0(c); return nm; }   // 새 query를 '추가'(덮어쓰지 않음)
function _extractStepQueries(tcid, c, src){ _stepQueries(c).forEach(function(_q){ if(_q&&_q.q&&_q.var){ try{ var _nv=String((typeof _applyQuery==='function'?_applyQuery(src,_q.q):'')||'').replace(/\s+$/,'').trim(); var _old=_varVal(tcid,_q.var); if(_nv!==''||_old==null||_old===''){ _varSetAuto(tcid, _q.var, _nv); } }catch(e){} } }); }   // 실행 출력(src)에서 각 Query 값을 변수로 추출(SNMP·Ping·Trap·CLI 공통) — 재추출이 빈값이면 이전 값 유지(Query=영역 지정, 사라지지 않게)
// Query 변수 패널 — 각 query를 ${이름}=값 칩으로, 이름 인라인 변경/삭제
function _queryVarPanel(tcid,c){
  const qs=_stepQueries(c); if(!qs.length) return '';
  const pv=_procVars[tcid]||{};
  return '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:8px;background:#faf8ff;border:1px solid #d9c9f7;border-radius:8px;padding:6px 10px;">'
    +'<span style="font-size:11px;font-weight:800;color:#6b3fc4;white-space:nowrap;"><i class="ti ti-crop"></i> Query 변수 '+qs.length+'개</span>'
    +qs.map(function(q,i){ const val=pv[q.var]; const has=(val!=null&&String(val).trim()!==''); const vstr=has?String(val).slice(0,28):'(미실행)';
      return '<span style="display:inline-flex;align-items:center;gap:3px;background:#fff;border:1px solid #d9c9f7;border-radius:11px;padding:2px 5px 2px 8px;font-size:10.5px;"><span style="color:#7c3aed;font-weight:700;">${</span><input value="'+String(q.var).trim().replace(/"/g,'&quot;')+'" onchange="tcQueryRename(\''+tcid+'\',\''+c.id+'\','+i+',this.value)" onkeydown="if(event.key===\'Enter\')this.blur()" title="변수 이름 변경 (클릭)" style="width:'+Math.max(4,String(q.var).trim().length)+'ch;border:none;border-bottom:1px dashed #c9b6ef;background:transparent;outline:none;font-size:10.5px;font-weight:700;color:#6b3fc4;font-family:ui-monospace,monospace;padding:0;">'
        +'<span style="color:#7c3aed;font-weight:700;">}</span><span style="color:#9aa3b2;">=</span><input value="'+String(val==null?'':val).replace(/"/g,'&quot;')+'" onchange="tcQueryValSet(\''+tcid+'\',\''+String(q.var).trim()+'\',this.value)" onkeydown="if(event.key===\'Enter\')this.blur()" placeholder="(미실행)" title="값 직접 수정 — 변수처럼 사용됨" style="width:118px;border:none;border-bottom:1px dashed #b8c0cc;background:transparent;outline:none;font-size:10.5px;color:#1c7a4a;font-weight:600;font-family:ui-monospace,monospace;padding:0;">'+'<i class="ti ti-x" onclick="tcQueryDel(\''+tcid+'\',\''+c.id+'\','+i+')" title="이 Query 삭제" style="font-size:12px;color:#b9818f;cursor:pointer;margin-left:2px;"></i></span>';
    }).join('')
    +'<span style="font-size:9.5px;color:var(--text3);margin-left:2px;">줄 선택 → <b style="color:#6b3fc4;">Query 영역</b> 으로 추가</span></div>';
}
async function tcQueryRename(tcid,id,idx,name){ const tc=_tcById(tcid); const c=tc&&(tc.checks||[]).find(x=>x.id===id); if(!c) return; const qs=_stepQueries(c); if(!qs[idx]) return; const old=qs[idx].var; name=String(name||'').trim().replace(/[^\w가-힣]/g,'_'); if(!name) name=old; if(name!==old && _allQueryVars(tc)[name]){ if(typeof showToast==='function')showToast('이미 쓰는 이름입니다: '+name); name=old; } qs[idx].var=name; _querySync0(c);
  if(name!==old){   // ${옛이름} 참조를 IF/Switch 식·case 조건·gotoElse·기준·명령 등 전체에서 새 이름으로 갱신
    try{ const _re=new RegExp('\\$\\{\\s*'+old.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*\\}','g'); const _nv='${'+name+'}';
      (tc.checks||[]).forEach(function(x){ if(!x)return; ['switchExpr','criteria','cli','query','excludeLines','callParams'].forEach(function(f){ if(typeof x[f]==='string' && x[f].indexOf('${')>=0) x[f]=x[f].replace(_re,_nv); }); if(Array.isArray(x.cases)) x.cases.forEach(function(cs){ if(cs&&typeof cs.when==='string'&&cs.when.indexOf('${')>=0) cs.when=cs.when.replace(_re,_nv); }); if(typeof x.gotoElse==='string'&&x.gotoElse.indexOf('${')>=0) x.gotoElse=x.gotoElse.replace(_re,_nv); });
    }catch(e){}
  }
  try{ if(name!==old){ const pv=_procVars[tcid]; if(pv&&pv[old]!=null){ pv[name]=pv[old]; delete pv[old]; } if(tc.varVals&&tc.varVals[old]!=null){ tc.varVals[name]=tc.varVals[old]; delete tc.varVals[old]; } } }catch(e){} await saveTCFile(tc); _respRefresh(tcid); tcProcRefresh(tcid); }
async function tcQueryDel(tcid,id,idx){ const tc=_tcById(tcid); const c=tc&&(tc.checks||[]).find(x=>x.id===id); if(!c) return; const qs=_stepQueries(c); const rm=qs[idx]; if(!rm) return; qs.splice(idx,1); _querySync0(c); try{ if(_procVars[tcid]) delete _procVars[tcid][rm.var]; if(tc.varVals) delete tc.varVals[rm.var]; }catch(e){} await saveTCFile(tc); _respRefresh(tcid); tcProcRefresh(tcid); }
async function tcQueryValSet(tcid, varName, value){ varName=String(varName||'').trim(); if(!varName) return; const tc=_tcById(tcid); const v=String(value==null?'':value); _procVars[tcid]=_procVars[tcid]||{}; _procVars[tcid][varName]=v; if(tc){ tc.varVals=tc.varVals||{}; tc.varVals[varName]=v; try{ await saveTCFile(tc); }catch(e){} } _respRefresh(tcid); }   // Query 값 직접 수정 → 변수처럼 사용·치환
// 수식(대입): 문구 안의 "${var} = 값" 을 실행 시 변수에 대입 (예: ${var1} = OK → var1 값을 OK로). 여러 줄/세미콜론 구분
function _tcRunAssign(raw, tcid){ if(!raw || String(raw).indexOf('=')<0) return false; var any=false;
  // 대입 LHS 인덱스 해석(숫자·$i·산술). all 은 대입 대상 아님
  var _ix=function(idxRaw){ var ss=_subVars(String(idxRaw),tcid).trim(); var n; if(/^[\d\s+\-*/().]+$/.test(ss)){ try{ n=Math.round(Function('return('+ss+')')()); }catch(e){ n=parseInt(ss,10); } } else n=parseInt(ss,10); return isNaN(n)?-1:n; };
  String(raw).split(/[\n;]+/).forEach(function(line){ line=String(line);
    // ① ${var} = 수식
    var m=line.match(/^\s*\$\{\s*([\w가-힣]+)\s*\}\s*=\s*(.+?)\s*$/);
    if(m){ var vn=m[1]; var rv=_tcEvalRHS(String(m[2]).trim(), tcid); _procVars[tcid]=_procVars[tcid]||{}; _procVars[tcid][vn]=rv; var tc=_tcById(tcid); if(tc){ tc.varVals=tc.varVals||{}; tc.varVals[vn]=rv; } any=true; return; }
    // ② #N.colM('idx') = 값  (해당 스텝 표 컬럼 셀 치환 → 이후 그 셀 참조가 새 값)
    var mc=line.match(/^\s*#\s*([\d.]+?)\s*\.\s*col(\d+)\s*\(\s*['"]?\s*([^'")]+?)\s*['"]?\s*\)\s*=\s*(.+?)\s*$/);   // 라벨 점 포함(#2 · #.2 · #1.2)
    if(mc){ var tc2=_tcById(tcid); var checks2=(tc2&&tc2.checks)||[]; var cs=checks2.filter(function(x){return x&&x.colVars&&Object.keys(x.colVars).length;});
      var _lbls2=(typeof _stepLabels==='function')?_stepLabels(checks2):[]; var _nm=function(x){return String(x==null?'':x).replace(/^\.+|\.+$/g,'');}; var _ns2=_nm(mc[1]);
      var st=null; for(var li2=0;li2<checks2.length;li2++){ if(_nm(_lbls2[li2])===_ns2 && checks2[li2]&&checks2[li2].colVars){ st=checks2[li2]; break; } }
      if(!st && /^\d+$/.test(_ns2)) st=cs[parseInt(_ns2,10)-1];
      if(st){ var arr=st.colVars['col'+mc[2]]; if(Array.isArray(arr)){ var iv=_ix(mc[3]); if(iv>=1){ arr[iv-1]=_tcEvalRHS(String(mc[4]).trim(),tcid); any=true; } } } return; }
    // ③ colN('idx') = 값  (현재/병합 스텝)
    var mc2=line.match(/^\s*col(\d*)\s*\(\s*['"]?\s*([^'")]+?)\s*['"]?\s*\)\s*=\s*(.+?)\s*$/);
    if(mc2){ var ck=_tcColChk; var cv=(ck&&ck.colVars)||null; if(!cv){ var t3=_tcById(tcid); cv={}; if(t3&&Array.isArray(t3.checks))t3.checks.forEach(function(x){ if(x&&x.colVars)Object.assign(cv,x.colVars); }); }
      var arr2=cv&&cv['col'+(mc2[1]||'1')]; if(Array.isArray(arr2)){ var iv2=_ix(mc2[2]); if(iv2>=1){ arr2[iv2-1]=_tcEvalRHS(String(mc2[3]).trim(),tcid); any=true; } } return; }
  });
  return any; }
// Query 값 부분을 보라색으로 강조 (이미 escape 된 html 안에서).
// arg 가 객체 {val, start} 이면 Range API 로 저장된 정확한 오프셋(start)만 사용해 그 자리 val 길이 만큼 감쌈.
// arg 가 객체 {val, q, line} 이면 원본 라인에 정규식 매치해 오프셋 계산 후 그 자리 감쌈.
// arg 가 문자열이면 라인 안 모든 위치에 하이라이트 (하위 호환).
function _hlQuery(html, arg){
  var sub, qraw, lineRaw, xStart;
  if(arg && typeof arg==='object'){ sub=arg.val; qraw=arg.q; lineRaw=arg.line; xStart=arg.start; }
  else { sub=arg; qraw=''; }
  if(!sub && !qraw) return html;
  var wrap='<span style="background:rgba(124,58,237,0.28);color:#4a1f9e;font-weight:800;border-radius:3px;box-shadow:0 0 0 1px #b794f4;">';
  // 0) exactStart 가 있으면 그 오프셋 그대로 사용 (Range API 로 저장된 정확 위치 → 중복 값 있어도 그 자리 확정)
  if(typeof xStart==='number' && xStart>=0 && sub){
    try{
      var out0='', segRe0=/<[^>]*>|[^<]+/g, m0, rawPos0=0, done0=false;
      while((m0=segRe0.exec(String(html)))){
        var seg0=m0[0];
        if(seg0.charAt(0)==='<'){ out0+=seg0; continue; }
        if(done0){ out0+=seg0; continue; }
        var segEnd0=rawPos0+seg0.length;
        if(xStart>=rawPos0 && (xStart+sub.length)<=segEnd0){
          var rel0=xStart-rawPos0;
          if(seg0.substr(rel0, sub.length)===sub){
            out0+=seg0.slice(0,rel0)+wrap+sub+'</span>'+seg0.slice(rel0+sub.length);
            done0=true;
          } else out0+=seg0;
        } else out0+=seg0;
        rawPos0=segEnd0;
      }
      return out0;
    }catch(_e0){}
  }
  // 1) 정규식+원본 라인이 있으면: 원본 라인에서 매치 위치 계산 → html 세그먼트에서 그 자리 감쌈
  if(qraw && lineRaw!=null){
    try{
      var rm=String(qraw).match(/^\/(.*)\/([gimsuy]*)$/);
      var reBody, reFlags='';
      if(rm){ reBody=rm[1]; reFlags=rm[2].replace(/g/g,''); }
      else { reBody=String(qraw).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
      var re=new RegExp(reBody, reFlags);
      var mm=re.exec(String(lineRaw));
      if(mm){
        var target, targetStart;
        if(mm[1]!=null && mm[1]!==''){
          var relInside=mm[0].indexOf(mm[1]);
          targetStart=mm.index + (relInside>=0?relInside:0);
          target=mm[1];
        } else { targetStart=mm.index; target=mm[0]; }
        var out='', segRe=/<[^>]*>|[^<]+/g, m3, rawPos=0, done=false;
        while((m3=segRe.exec(String(html)))){
          var seg=m3[0];
          if(seg.charAt(0)==='<'){ out+=seg; continue; }
          if(done){ out+=seg; continue; }
          var segEnd=rawPos+seg.length;
          if(targetStart>=rawPos && (targetStart+target.length)<=segEnd){
            var rel=targetStart-rawPos;
            if(seg.substr(rel, target.length)===target){
              out+=seg.slice(0,rel)+wrap+target+'</span>'+seg.slice(rel+target.length);
              done=true;
            } else out+=seg;
          } else out+=seg;
          rawPos=segEnd;
        }
        return out;
      }
      return html;
    }catch(_e){}
  }
  // 2) 정규식이 없거나 실패 → 구 방식(문자열 전체 매치)로 폴백
  if(!sub) return html;
  var es=String(sub).replace(/&/g,'&amp;').replace(/</g,'&lt;'); if(!es.trim()) return html;
  try{ var re2=new RegExp(es.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'); return _hlSafeReplace(html,re2,'<span style="background:rgba(124,58,237,0.28);color:#4a1f9e;font-weight:800;border-radius:3px;box-shadow:0 0 0 1px #b794f4;">$&</span>'); }catch(e){ return html; }
}
function _respBody(tcid){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc) return '';
  const sid=_respStepId[tcid]; const c=(tc.checks||[]).find(x=>x.id===sid);
  if(!c) return '<div style="padding:28px;text-align:center;color:var(--text3);font-size:12.5px;">스텝을 클릭하거나 <i class="ti ti-player-play" style="color:var(--green);"></i> 로 실행하면, 그 세션의 <b>조회 결과</b>가 여기에 표시됩니다.</div>';
  if(c && Array.isArray(c.n2xStats)){ var _mnm=((c.cli||'').split(/\r?\n/)[0]||(c.action||'Traffic 조회')); var _mdot=c.repeatResult==='Pass'?'#00a872':c.repeatResult==='Fail'?'#e53e5a':'#9aa1ad'; return '<div style="padding:2px;"><div style="display:flex;align-items:center;gap:8px;margin-bottom:9px;"><span style="width:9px;height:9px;border-radius:50%;background:'+_mdot+';flex-shrink:0;"></span><span style="font-size:13px;font-weight:800;color:#1c2230;"><i class="ti ti-chart-bar" style="color:#7c3aed;"></i> '+_bdEsc(_mnm)+'</span><span style="font-size:11px;color:var(--text3);">N2X 측정 결과</span>'+(c.executed_at?'<span style="font-size:10.5px;color:var(--text3);margin-left:auto;">'+_bdEsc(c.executed_at)+'</span>':'')+'</div>'+_n2xStatsHtml(c.n2xStats,c.n2xNames,c.n2xElapsed)+'</div>'; }
  const _lbl=(function(){ const a=tc.checks||[]; return _stepLabels(a)[a.findIndex(x=>x.id===sid)]||''; })();
  const hdrName=((c.cli||'').split(/\r?\n/)[0]||(c.action||'CLI'));
  // 다중장비 결과: 장비별 출력(devResults) 저장됨 → 장비 선택 칩 + 선택 장비 출력 (기본 전체)
  const _dr=(Array.isArray(c.devResults)&&c.devResults.length>1)?c.devResults:null;
  let _selDev=_dr?(_respDevSel[tcid]==null?-1:_respDevSel[tcid]):-2;
  if(_dr&&_selDev>=_dr.length) _selDev=-1;
  const _dispC=(_dr&&_selDev>=0)?Object.assign({},c,{output:_dr[_selDev].output,repeatResult:_dr[_selDev].result}):c;
  const out=String(_dispC.output||'');
  const shown=_respShownLines(_dispC);
  const crit=_critLineSet(c, shown);
  if(_respSel[tcid]===undefined && crit.active.size && (c.type||'')!=='contains' && (c.type||'')!=='notcontains') _respSel[tcid]=[...crit.active].sort((a,b)=>a-b); // 시드: 저장된 기준 줄을 체크 상태로 시작
  const sel=Array.isArray(_respSel[tcid])?_respSel[tcid]:[];
  const _qLines=new Set(); _stepQueries(c).forEach(function(_q){ if(_q&&_q.q){ try{ _queryLineSet(shown,_q.q).forEach(function(n){ _qLines.add(n); }); }catch(e){} } });   // 모든 Query 영역 줄번호 합집합 (정규식 앵커로만 판정 → 드래그한 그 라인만 정확히 표시)
  // 줄 스타일: 예전엔 height:22px 고정이었지만 긴 줄이 세로로 wrap 되어야 하니 min-height 로 완화.
  // gutter(줄번호) 와 textBlk(내용) 이 같은 인덱스끼리 세로 정렬돼야 하므로 두 컬럼 다 같은 min-height 유지.
  const _lhS='line-height:22px;min-height:22px;font-size:13px;font-family:Consolas,\'Cascadia Mono\',\'D2Coding\',\'Courier New\',monospace;box-sizing:border-box;';
  const _gutter='<div style="user-select:none;-webkit-user-select:none;flex-shrink:0;position:sticky;left:0;z-index:1;border-right:1px solid #dfe4f2;background:#eef2f8;padding:4px 0;">'+shown.map((l,i)=>{ const n=i+1; const on=sel.indexOf(n)>=0; const qr=_qLines.has(n); return '<div onclick="tcRespLineToggle(\''+tcid+'\','+n+',event)" title="줄 선택/해제 (판정용)" style="display:flex;align-items:center;gap:5px;cursor:pointer;padding:0 8px;'+_lhS+(on?'background:rgba(0,168,114,0.18);':(qr?'background:rgba(124,58,237,0.16);':''))+'"><span style="color:'+(qr?'#7c3aed':'#aeb6c8')+';min-width:22px;text-align:right;font-weight:'+(qr?'800':'400')+';">'+n+'</span><i class="ti '+(on?'ti-square-check-filled" style="color:#00a872;font-size:13px;':(qr?'ti-crop" style="color:#7c3aed;font-size:12px;':'ti-square" style="color:#cfd6e4;font-size:13px;'))+'"></i></div>'; }).join('')+'</div>';
  const _critToks=_critTokens(c); const _psub=String(_pendingSub[tcid]||'').trim();
  const _failLines=_failLineSet(c, shown, tcid);
  const _tbl=((c.type||'')==='table')?_tableCols(shown.join('\n')):null;
  let _tblCi=-1, _tblExp='';
  if(_tbl){ const _m=(String(c.criteria||'').trim().split(/\s+/)[0]||''); const _eq=_m.indexOf('='); const _col=(_eq>=0?_m.slice(0,_eq):_m).trim(); _tblExp=(_eq>=0?_m.slice(_eq+1):'').trim(); _tblCi=_tbl.headers.findIndex(function(h){return String(h).toLowerCase()===_col.toLowerCase();}); }
  const _colHiTbl=(!_tbl && c && c.colVars && Object.keys(c.colVars).length)?_tableCols(shown.join('\n')):null; let _colRow=0;   // 이 스텝의 colN 변수 → 데이터 셀 박스 강조
  // 드래그 상세정보 (줄번호 + 그 줄 안 정확 오프셋) — 있으면 그 자리 딱 1건만 노란 강조 (같은 값 중복 방지)
  var _psubDet=null; try{ _psubDet=(window._rspSelD||{})[tcid]||null; }catch(_e){}
  const _textBlk='<div onmouseup="tcRespSubSel(\''+tcid+'\')" style="flex:1;padding:4px 0;user-select:text;-webkit-user-select:text;cursor:text;">'+shown.map(function(l,i){ const n=i+1; const on=sel.indexOf(n)>=0; const exd=crit.excluded.has(n)&&!on; const fl=_failLines.has(n); const qr=_qLines.has(n); var _qms=[]; _stepQueries(c).forEach(function(_q){ if(_q&&_q.q){ try{ var _qm=_queryLineMatch(l,_q.q); if(_qm){ /* Range 좌표 저장돼 있으면 그 라인에서만 하이라이트 */ if(typeof _q.line==='number' && typeof _q.start==='number' && _q.line===n){ _qms.push({val:_q.val||_qm, start:_q.start}); } else if(_q.line==null){ _qms.push({q:_q.q, val:_qm, line:String(l==null?'':l)}); } } }catch(e){} } }); const qm=(_qms[0]&&_qms[0].val)||''; const qFull=!!(c.query&&String(c.query).indexOf('..')>=0&&!/^\//.test(String(c.query).trim())); const isTbl=!!(_tbl && _tblCi>=0 && i>_tbl.sep && String(l).trim()); const bg=(qFull&&qr)?('background:rgba(124,58,237,0.13);border-left:3px solid #7c3aed;'):(_qms.length?'border-left:3px solid #7c3aed;':(isTbl?'border-left:3px solid transparent;':(fl?'background:rgba(229,62,90,0.16);border-left:3px solid #e53e5a;':(on?'background:rgba(0,168,114,0.06);border-left:3px solid #00a872;':'border-left:3px solid transparent;')))); const tx=isTbl?'color:#11182b;':(exd?'color:#b3b9c4;text-decoration:line-through;':(fl?'color:#a01f33;font-weight:600;':'color:#11182b;')); let _h=isTbl?_hlTableLine(String(l),_tbl,_tblCi,_tblExp):(exd?(String(l).replace(/&/g,'&amp;').replace(/</g,'&lt;')):(_critToks.length?_hlTokens(String(l),_critToks):(String(l).replace(/&/g,'&amp;').replace(/</g,'&lt;')))); if(_psub&&!exd&&!isTbl&&_rspSubInLine(tcid,n)){ /* 드래그 상세정보가 있고 이 줄이 그 줄이면 오프셋 기반으로 그 자리만 강조. 아니면 안 함(다른 줄엔 절대 안 번짐). */ var _off=(_psubDet && _psubDet.line===n)?_psubDet.start:-1; if(_psubDet){ if(_psubDet.line===n) _h=_hlPending(_h,_psub,_off); } else { _h=_hlPending(_h,_psub); } } if(_qms.length&&!exd&&!isTbl){ _qms.forEach(function(_qm){ _h=_hlQuery(_h,_qm); }); } var _kv=null; /* 기본 보라색 값 하이라이트 제거 */ if(_kv){ var _e=function(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');}; _h=_e(_kv[1]+_kv[2])+'<span onclick="event.stopPropagation();tcRespLineToVar(\''+tcid+'\','+n+')" title="클릭 → 이 값을 변수로 만들기" style="background:rgba(124,58,237,0.12);border-bottom:1px dashed #a98ce8;border-radius:3px;padding:0 3px;cursor:pointer;">'+_e(_kv[3])+'</span>'; } if(_colHiTbl && i>_colHiTbl.sep && String(l).trim()){ _colRow++; _h=_hlTableAllCells(String(l),_colHiTbl,_colRow); } return '<div data-ln="'+n+'" style="'+_lhS+'white-space:pre-wrap;word-break:break-word;padding:0 11px;'+bg+tx+'">'+(_h||' ')+'</div>'; }).join('')+'</div>';
  const _qpk=(window._queryPick===tcid);
  const lineList='<div id="tc-resp-lines-'+tcid+'" style="display:flex;overflow:auto;border:'+(_qpk?'2px solid #7c3aed':'1px solid #dfe4f2')+';border-radius:8px;background:'+(_qpk?'#fbf9ff':'#f6f8fc')+';max-height:48vh;'+(_qpk?'box-shadow:0 0 0 3px rgba(124,58,237,0.15);':'')+'">'+_gutter+_textBlk+'</div>';
  const _rtbl=_tableCols(shown.join('\n'));
  const _colPick=(sel.length===1&&_rtbl)?('<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;width:100%;margin-top:5px;border-top:1px dashed #bfe3d2;padding-top:6px;"><span style="font-size:10px;color:#00673f;font-weight:700;"><i class="ti ti-variable"></i> 이 행에서 변수로 추출할 컬럼:</span>'+_rtbl.headers.map(h=>h?('<button class="ptbtn" style="font-size:10.5px;padding:0 9px;height:26px;color:#7c3aed;border-color:#d9c6f0;" onclick="tcRespToVarCol(\''+tcid+'\',\''+String(h).replace(/[\\\\\x27]/g,'')+'\')">'+h+'</button>'):'').join('')+'</div>'):'';
  const _tblBar=_rtbl?('<div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:8px;background:#f4f8ff;border:1px solid #cdddf5;border-radius:8px;padding:6px 10px;font-size:11px;"><span style="font-weight:800;color:#2d6fd4;white-space:nowrap;"><i class="ti ti-table-options"></i> 표 검증 (모든 행)</span><button class="ptbtn" style="font-size:11px;font-weight:700;color:#2d6fd4;border-color:#bcd2f5;" onclick="tcTableVerify(\''+tcid+'\')"><i class="ti ti-click"></i> 표에서 기준 값 선택</button><span style="color:var(--text3);">셀(예: connected / a-1000) 클릭 → 컬럼=값</span></div>'):'';
  const _exCount=[...crit.excluded].filter(n=>sel.indexOf(n)<0).length;
  const _legend='<div style="font-size:10.5px;color:#6b7385;margin-top:6px;display:flex;gap:14px;flex-wrap:wrap;align-items:center;"><span><span style="display:inline-block;width:11px;height:11px;background:rgba(0,168,114,0.5);border-radius:2px;vertical-align:-1px;"></span> 초록(체크) = 판정 기준으로 쓸 줄 ('+sel.length+'줄)</span><span><span style="text-decoration:line-through;color:#b3b9c4;">취소선</span> = 무시 '+_exCount+'줄</span>'+(_qLines.size?('<span><span style="display:inline-block;width:11px;height:11px;background:rgba(124,58,237,0.45);border-radius:2px;vertical-align:-1px;"></span> <b style="color:#7c3aed;">보라 = Query 판정영역(값)</b> '+_qLines.size+'곳</span>'):'')+'</div>';
  const _subOn=!!(_pendingSub[tcid]&&String(_pendingSub[tcid]).trim());
  const _subBtns=_subOn?('<span style="width:1px;height:18px;background:#cfe3d6;"></span><span style="font-size:10.5px;font-weight:700;color:#5c4700;background:#ffe066;border:1px solid #e0aa00;border-radius:5px;padding:2px 8px;max-width:230px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><i class="ti ti-text-caret"></i> 선택: 「'+String(_pendingSub[tcid]).slice(0,40).replace(/&/g,'&amp;').replace(/</g,'&lt;')+'」</span><button class="ptbtn" style="font-size:11px;font-weight:700;color:#00875a;border-color:#bfe3d2;" onclick="tcRespApply(\''+tcid+'\',\'containsText\')" title="이 문구가 출력에 있으면 합격">문구 검증</button><button class="ptbtn" style="font-size:11px;font-weight:700;color:#6b3fc4;border-color:#d9c9f7;" onclick="tcRespToQueryRegion(\''+tcid+'\')" title="드래그한 영역만 Query 판정값으로 추출(줄 전체 아님)"><i class="ti ti-crop"></i> Query 영역</button><button class="ptbtn" style="font-size:11px;font-weight:700;color:#2d6fd4;border-color:#bcd2f5;" onclick="tcRespToVar(\''+tcid+'\')" title="드래그한 값을 ${변수}로 생성 — IF/Switch에서 재사용"><i class="ti ti-variable"></i> 변수 생성</button>'):'';
  const actBar=('<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap;background:#f0fbf6;border:1px solid #bfe3d2;border-radius:8px;padding:6px 10px;"><span style="font-size:11px;font-weight:800;color:'+(sel.length?'#00673f':'#9aa1ad')+';white-space:nowrap;"><i class="ti ti-list-check"></i> '+(sel.length?(sel.length+'줄 선택'):'줄 클릭 → 선택 (Shift=범위)')+'</span><span style="width:3px;"></span><button class="ptbtn" style="font-size:11px;font-weight:700;color:#00875a;" onclick="tcRespApply(\''+tcid+'\',\'lines\')" title="선택한 여러 줄을 모두 판정기준으로 (모두 출력에 있어야 합격)">멀티 선택</button>'+_subBtns+'<span style="flex:1;"></span><button class="ptbtn" style="font-size:11px;" onclick="tcRespSelAll(\''+tcid+'\')">전체</button><button class="ptbtn" style="font-size:11px;" onclick="tcRespSelClear(\''+tcid+'\')">해제</button><button class="ptbtn" style="font-size:11px;color:#c0392b;border-color:#ecc9c9;" onclick="tcRespResetCrit(\''+tcid+'\')" title="판정 타입·기준·제외·추출 변수 모두 해제">기준 초기화</button>'+_colPick+'</div>');
  // 장비별 결과 선택 칩 (다중장비 실행 시)
  const _devBar=_dr?('<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap;background:#fff7ef;border:1px solid #f0d2b0;border-radius:8px;padding:6px 10px;"><span style="font-size:11px;font-weight:800;color:#b5651d;white-space:nowrap;"><i class="ti ti-devices"></i> 장비별 결과 '+_dr.length+'대:</span><button class="ptbtn" style="font-size:10.5px;font-weight:700;'+(_selDev<0?'background:#64748b;color:#fff;border-color:#64748b;':'color:#64748b;')+'" onclick="tcRespDevPick(\''+tcid+'\',-1)">전체</button>'+_dr.map(function(r,ix){ var on=(_selDev===ix); return '<button class="ptbtn" style="font-size:10.5px;font-weight:700;'+(on?'background:#e8893a;color:#fff;border-color:#e8893a;':'color:#b5651d;border-color:#f0d2b0;')+'" onclick="tcRespDevPick(\''+tcid+'\','+ix+')">'+(r.result==='Pass'?'✅ ':r.result==='Fail'?'❌ ':'')+String(r.dev).replace(/</g,'&lt;')+'</button>'; }).join('')+'</div>'):'';
  const dot=_dispC.repeatResult==='Pass'?'#00a872':_dispC.repeatResult==='Fail'?'#e53e5a':'#9aa1ad';
  let _failReason='';
  if(_dispC.repeatResult==='Fail' && out.trim()){
    let reason=''; try{ reason=_failDetail(_dispC, shown, tcid); }catch(e){ reason='판정기준 불충족'; }
    const _re=String(reason).replace(/&/g,'&amp;').replace(/</g,'&lt;');
    const _cmd=String((c.cli||'').split(/\r?\n/)[0]||c.action||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');
    _failReason='<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px;background:#fff5f6;border:1px solid #f3c6cf;border-radius:8px;padding:8px 11px;"><i class="ti ti-alert-triangle" style="color:#e53e5a;font-size:15px;margin-top:1px;flex-shrink:0;"></i><div style="font-size:11.5px;color:#a01f33;line-height:1.55;min-width:0;"><b>FAIL — 판정기준과 다른 값이 조회됨</b>'+(_cmd?'<div style="font-family:ui-monospace,monospace;font-size:10.5px;color:#7a1726;margin-top:2px;opacity:0.85;"><i class="ti ti-terminal-2" style="font-size:11px;"></i> '+_cmd+'</div>':'')+'<div style="margin-top:3px;white-space:pre-wrap;word-break:break-all;color:#7a1726;">'+_re+'</div></div></div>';
  }
  const _ptype=c.type||'contains'; const _baseN=c.baseline?String(c.baseline).split(/\r?\n/).filter(function(l){return l.trim();}).length:0;
  const _typeSel='<select onchange="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'type\',this.value)" style="font-size:11px;padding:4px 7px;border:1px solid #bfe3d2;border-radius:6px;background:#fff;font-weight:600;color:#00673f;">'+PROC_CHECK_TYPES.map(function(t){return '<option value="'+t[0]+'"'+(_ptype===t[0]?' selected':'')+'>'+t[1]+'</option>';}).join('')+'</select>';
  const _critField=(_ptype==='none'?'<span style="font-size:11px;color:var(--text3);">판정 없음 (조회만)</span>':(_ptype==='contains_all'?('<textarea data-gp-crit="'+c.id+'" data-gp-tcid="'+tcid+'" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'criteria\',this.value)" placeholder="한 줄에 기준 하나씩 — 모두 포함되어야 합격" rows="'+Math.min(6,Math.max(2,(String(c.criteria||'').split(/\r?\n/).length)))+'" style="flex:1;min-width:180px;font-size:11.5px;font-family:ui-monospace,monospace;padding:5px 9px;border:1px solid #cdd6e6;border-radius:6px;outline:none;box-sizing:border-box;resize:vertical;white-space:pre;">'+(c.criteria||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</textarea>'):('<input data-gp-crit="'+c.id+'" data-gp-tcid="'+tcid+'" value="'+(c.criteria||'').replace(/"/g,'&quot;')+'" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'criteria\',this.value)" placeholder="찾을 문구 / 기준값 — 또는 아래 줄 선택 → 검증" style="flex:1;min-width:180px;font-size:11.5px;padding:5px 9px;border:1px solid #cdd6e6;border-radius:6px;outline:none;box-sizing:border-box;">')));
  const _critBlock='<div style="display:flex;align-items:center;gap:8px;margin-bottom:9px;flex-wrap:wrap;background:#f6fbf8;border:1px solid #bfe3d2;border-radius:8px;padding:8px 11px;"><span style="font-size:11px;font-weight:800;color:#00673f;white-space:nowrap;"><i class="ti ti-checks"></i> 판정</span>'+_typeSel+_critField+'</div>';
  // Query(판정영역): Response에서 판정할 특정 영역만 한정
  const _qv=String(c.query||'').replace(/"/g,'&quot;'); let _qprev='';
  if(c.query&&out.trim()){ try{ const _sc=_applyQuery(shown.join('\n'), c.query); const _cnt=_sc.split(/\r?\n/).filter(l=>l.trim()).length; const _qvName=c.queryVar?('<b style="color:#2d6fd4;font-family:ui-monospace,monospace;">${'+c.queryVar+'}</b> = '):''; _qprev='<div style="margin:-2px 0 9px;font-size:10.5px;color:#6b3fc4;background:#f7f3ff;border:1px dashed #d9c9f7;border-radius:7px;padding:6px 10px;line-height:1.5;"><b>→ 판정 대상 영역 ('+_cnt+'곳):</b> '+_qvName+'<span style="font-family:ui-monospace,monospace;color:#3a2a5a;white-space:pre-wrap;word-break:break-all;">'+((String(_sc).slice(0,300).replace(/&/g,'&amp;').replace(/</g,'&lt;'))||'(매칭 없음 — 빈 영역)')+(String(_sc).length>300?' …':'')+'</span></div>'; }catch(e){ _qprev=''; } }
  const _queryBar='<div style="display:flex;align-items:center;gap:8px;margin-bottom:'+(_qprev?'4px':'9px')+';flex-wrap:wrap;background:#faf8ff;border:1px solid #d9c9f7;border-radius:8px;padding:7px 11px;"><span style="font-size:11px;font-weight:800;color:#6b3fc4;white-space:nowrap;" title="Response에서 판정할 영역만 한정 — 비우면 전체 출력으로 판정"><i class="ti ti-crop"></i> Query(판정영역)</span><input data-gp-query="'+c.id+'" data-gp-tcid="'+tcid+'" value="'+_qv+'" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'query\',this.value)" placeholder="예: Temperature  ·  /Temp\\s*:\\s*(\\S+)/  ·  BEGIN..END   (비우면 전체)" style="flex:1;min-width:200px;font-size:11.5px;padding:5px 9px;border:1px solid #cdbdf0;border-radius:6px;outline:none;box-sizing:border-box;background:#fff;">'+'<button class="ptbtn" style="font-size:10.5px;font-weight:700;color:'+(window._queryPick===tcid?'#fff':'#6b3fc4')+';border-color:#d9c9f7;'+(window._queryPick===tcid?'background:#7c3aed;':'')+'" onclick="window._queryPick=(window._queryPick===\''+tcid+'\'?null:\''+tcid+'\');if(typeof showToast===\'function\')showToast(window._queryPick?\'⬇ 아래 출력에서 판정할 영역을 드래그하세요\':\'영역 지정 취소\');tcProcRefresh(\''+tcid+'\');" title="클릭 후 아래 출력에서 드래그하면 그 영역이 Query로 지정됩니다"><i class="ti ti-pointer"></i> '+(window._queryPick===tcid?'드래그하세요':'드래그 지정')+'</button>'+(c.query?('<button class="ptbtn" style="font-size:10.5px;color:#6b3fc4;border-color:#d9c9f7;" onclick="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'query\',\'\')" title="Query 해제">해제</button>'):'')+'</div>';
  return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;"><span style="font-size:11px;font-weight:800;color:#fff;background:var(--blue);border-radius:6px;padding:2px 8px;">스텝 '+_lbl+'</span><span style="font-size:12px;font-weight:600;color:var(--text2);font-family:ui-monospace,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:320px;">'+String(hdrName).replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</span><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:'+dot+';"></span><span style="font-size:11px;color:var(--text3);">'+shown.length+'줄</span><span style="flex:1;"></span><button onclick="tcCheckClearOut(\''+tcid+'\',\''+c.id+'\')" title="결과 지우기" style="font-size:11px;padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:#fff;color:var(--text3);cursor:pointer;">✕</button></div>'+_devBar+(out.trim()?(_failReason+actBar+_critBlock+_queryVarPanel(tcid,c)+_tblBar+_respVarPanel(tcid)+lineList+_legend):(_critBlock+_queryVarPanel(tcid,c)+_respVarPanel(tcid)+'<div style="padding:22px;text-align:center;color:var(--text3);font-size:12.5px;border:1px dashed var(--border);border-radius:8px;background:#fafbfc;"><i class="ti ti-player-play" style="color:var(--green);"></i> 아직 실행 결과가 없습니다 — ▶로 실행하면 출력이 여기에 표시됩니다</div>'));
}
let _stepPropOpen=true;function _procBottomArea(tcid){
  return '<div style="margin-top:18px;">'+_procBottomTabs(tcid)+'</div>';
}
function _procBottomTabs(tcid){
  // 하단은 Console(현재 실행 로그)만 표시. History 는 상단 Issue 옆 History 탭으로 통합됨.
  _procBottomTab[tcid]='console';
  var _tab1='<div style="padding:8px 16px;font-size:12.5px;font-weight:700;color:var(--blue);border-bottom:2px solid var(--blue);display:flex;align-items:center;gap:6px;"><i class="ti ti-bell"></i>Console</div>';
  var _body=_execLog(tcid);
  return '<div>'+
    '<div style="display:flex;align-items:center;gap:2px;border-bottom:1px solid var(--border);margin-bottom:12px;">'+_tab1+'</div>'+
    '<div id="tc-console-body-'+tcid+'">'+_body+'</div>'+
  '</div>';
}
function tcBottomTabSet(tcid, t){ _procBottomTab[tcid]=t; try{ tcProcRefresh(tcid); }catch(e){} }
// 스텝 클릭 시 테이블 바로 아래에 뜨는 4탭 상세 패널 (Properties / Response / Expected Result / Root Cause Analysis)
function _stepDetailPanel(tcid, _spInline){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc) return '';
  const c=(tc.checks||[]).find(x=>x.id===_respStepId[tcid]);
  let tab=_stepDetailTab[tcid]||'response'; if(tab==='expect') tab='response';   // Expected Result 탭 제거 → Response로 통합
  const tb=(k,ic,lab)=>'<div onclick="tcSetStepTab(\''+tcid+'\',\''+k+'\')" style="padding:8px 16px;font-size:12.5px;font-weight:700;cursor:pointer;border-bottom:2px solid '+(tab===k?'var(--blue)':'transparent')+';color:'+(tab===k?'var(--blue)':'var(--text3)')+';display:flex;align-items:center;gap:6px;"><i class="ti '+ic+'"></i>'+lab+'</div>';
  const _imgN=(c&&Array.isArray(c.images))?c.images.length:0;
  const bar='<div style="display:flex;align-items:center;gap:2px;border-bottom:1px solid var(--border);margin-bottom:12px;flex-wrap:wrap;">'+tb('properties','ti-plug-connected','Properties')+tb('response','ti-file-text','Response')+tb('images','ti-photo','이미지(OCR)'+(_imgN?(' ('+_imgN+')'):''))+tb('rca','ti-stethoscope','Root Cause Analysis')+'</div>';
  if(!c){ return _spInline?'':'<div style="margin-top:18px;border:1px solid var(--border);border-radius:10px;padding:14px 16px;background:#fff;">'+bar+'<div style="padding:26px;text-align:center;color:var(--text3);font-size:12.5px;">스텝을 클릭하면 상세(Properties · Response · 판정 · RCA)가 여기에 표시됩니다.</div></div>'; }
  let body;
  if(tab==='properties') body=_telnetSshSect(tcid,c)+_stepCompWaitSect(tcid,c);
  else if(tab==='expect') body=_expectTab(tcid,c);
  else if(tab==='images') body=_imgTab(tcid,c);
  else if(tab==='rca') body=_rcaTab(tcid,c);
  else body='<div id="tc-resp-body-'+tcid+'">'+_respBody(tcid)+'</div>';
  if(_spInline){ return '<div style="padding:10px 14px 14px;">'+bar+'<div>'+body+'</div></div>'; }
  return '<div style="margin-top:18px;border:1px solid var(--border);border-radius:10px;padding:14px 16px;background:#fff;">'+bar+'<div>'+body+'</div></div>';
}
// 이미지(OCR) 탭 = 스텝에 시험결과 스크린샷 첨부 → OCR/비전 인식 → 학습 포함
function _imgTab(tcid,c){
  if(!c) return '<div style="padding:20px;color:var(--text3);font-size:12px;">스텝을 선택하세요.</div>';
  const _imgs=Array.isArray(c.images)?c.images:[];
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  return '<div style="padding:8px 2px;">'
    +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;">'
      +'<button onclick="tcStepImgAdd(\''+tcid+'\',\''+c.id+'\')" style="font-size:12px;padding:7px 14px;border-radius:7px;border:1px solid #c9b6f0;background:rgba(124,58,237,0.07);color:#7c3aed;cursor:pointer;font-weight:700;"><i class="ti ti-photo-plus"></i> 이미지(OCR) 첨부</button>'
      +'<span style="font-size:11.5px;color:var(--text3);">시험 결과 스크린샷을 붙이면 OCR/AI비전으로 글자를 인식해 <b>🧠 LLM 학습</b> 시 함께 저장됩니다.</span>'
    +'</div>'
    +(_imgs.length?('<div style="display:flex;flex-wrap:wrap;gap:10px;">'+_imgs.map(function(im,ii){return '<div style="border:1px solid var(--border);border-radius:9px;padding:8px;background:#fff;width:200px;box-sizing:border-box;">'
        +'<img src="'+(im.thumb||'')+'" style="width:184px;height:108px;object-fit:cover;border-radius:6px;cursor:pointer;display:block;" onclick="tcStepImgView(\''+tcid+'\',\''+c.id+'\','+ii+')" title="클릭 → 크게 보기 / OCR 텍스트 편집">'
        +'<div style="font-size:10px;color:var(--text3);margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(im.name||'이미지')+'</div>'
        +'<div style="display:flex;align-items:center;justify-content:space-between;margin-top:2px;"><span style="font-size:10.5px;color:'+(im.text?'#7c3aed':'#bbb')+';font-weight:700;">'+(im.text?('📷 OCR '+String(im.text).replace(/\s+/g,'').length+'자'):'텍스트 없음')+'</span><i class="ti ti-trash" onclick="tcStepImgDel(\''+tcid+'\',\''+c.id+'\','+ii+')" style="cursor:pointer;color:#c0c6d0;font-size:15px;" title="삭제"></i></div>'
      +'</div>';}).join('')+'</div>'):'<div style="padding:30px;text-align:center;color:var(--text3);border:2px dashed var(--border);border-radius:10px;font-size:12px;"><i class="ti ti-photo-off" style="font-size:28px;opacity:0.3;display:block;margin-bottom:8px;"></i>첨부된 이미지가 없습니다.</div>')
  +'</div>';
}
// Properties 탭 = Telnet/SSH 설정 (스텝별 IDLE Interval + 접속 재시도).
// IDLE Interval 은 스텝별로만 지정 — c.cmdDelay 필드. 값 없으면 기본 100ms(iTest 관례).
// 저장은 saveTCFile 로 스텝 객체에 저장 → 서버·DB 유지.
var _TC_STEP_DEFAULT_IDLE=100;   // 스텝에 cmdDelay 미지정 시 사용되는 기본값(ms)
function _telnetSshSect(tcid, c){
  const sect=(ic,col,title,inner)=>'<div style="flex:1 1 260px;min-width:220px;max-width:460px;"><div style="font-size:10px;font-weight:800;color:#3a4254;margin-bottom:7px;display:flex;align-items:center;gap:5px;border-bottom:1px solid #eef0f4;padding-bottom:4px;letter-spacing:.2px;"><i class="ti '+ic+'" style="color:'+col+';font-size:12px;"></i>'+title+'</div><div style="display:flex;flex-direction:column;gap:8px;">'+inner+'</div></div>';
  const _delays=[0,50,100,200,300,500,1000];
  const _hasStep=(c && c.cmdDelay!==undefined && c.cmdDelay!==null && c.cmdDelay!=='');
  const _stepVal=_hasStep?parseInt(c.cmdDelay):null;
  const _effective=_hasStep?_stepVal:_TC_STEP_DEFAULT_IDLE;
  const _hasD=_delays.indexOf(_effective)>=0;
  const stepOpts=_delays.map(d=>'<option value="'+d+'"'+(d===_effective?' selected':'')+'>'+d+' ms'+(d===100?' · 기본':'')+'</option>').join('')
    +(!_hasD?('<option value="'+_effective+'" selected>'+_effective+' ms (사용자)</option>'):'');
  const stepSel=c?('<select onchange="_tcStepCmdDelaySave(\''+tcid+'\',\''+c.id+'\',this.value)" style="font-size:12px;font-weight:700;color:var(--blue);padding:5px 28px 5px 11px;border:1px solid #cdd6e6;border-radius:8px;background:linear-gradient(#ffffff,#f5f8ff);cursor:pointer;outline:none;-webkit-appearance:none;-moz-appearance:none;appearance:none;box-shadow:0 1px 2px rgba(30,40,80,0.05);">'+stepOpts+'</select>'):'';
  const stepRow=c?('<div><div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 11px;border:1px solid #d3e0f5;border-radius:9px;background:#f3f7ff;"><span style="font-size:11.5px;font-weight:700;color:var(--blue);">IDLE Interval <span style="color:var(--text3);font-weight:500;font-size:10.5px;">(Millisec)</span></span><span style="position:relative;display:inline-flex;align-items:center;">'+stepSel+'<i class="ti ti-chevron-down" style="position:absolute;right:11px;font-size:13px;color:#8a92a6;pointer-events:none;"></i></span></div><div style="font-size:10px;color:var(--text3);margin-top:5px;">이 스텝의 각 CLI 사이 대기 (iTest 기본 100ms)</div></div>'):'';
  const retryRow='<div><div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 11px;border:1px solid #e6eaf2;border-radius:9px;background:#fafbfe;"><span style="font-size:11.5px;font-weight:600;color:var(--text2);">접속 재시도 <span style="color:var(--text3);font-weight:500;font-size:10.5px;">(Retry)</span></span><span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--text2);"><input type="number" min="0" max="100" value="'+_connRetry+'" onchange="tcSetConnRetry(this.value)" style="width:48px;font-size:12px;font-weight:700;color:var(--blue);padding:6px 7px;border:1px solid #cdd6e6;border-radius:7px;text-align:right;outline:none;">회<span style="color:var(--text3);margin:0 2px;">·</span>간격<input type="number" min="1" max="600" value="'+_connRetryInt+'" onchange="tcSetConnRetryInt(this.value)" style="width:54px;font-size:12px;font-weight:700;color:var(--blue);padding:6px 7px;border:1px solid #cdd6e6;border-radius:7px;text-align:right;outline:none;">초</span></div><div style="font-size:10px;color:var(--text3);margin-top:5px;">Session Open 실패 시(리부팅 등) 간격마다 N회까지 재접속 시도 (0 = 재시도 없음)</div></div>';
  return '<div style="padding:8px 2px 4px;display:flex;flex-wrap:wrap;gap:16px 26px;align-items:flex-start;">'+sect('ti-plug-connected','#0784b5','Telnet/SSH 설정',stepRow+retryRow)+'</div>';
}
// 스텝별 IDLE Interval 저장 — 값을 스텝의 cmdDelay 필드에 저장.
async function _tcStepCmdDelaySave(tcid, sid, v){
  const tc=(typeof tcList!=='undefined')?tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)):null;
  if(!tc||!Array.isArray(tc.checks)) return;
  const c=tc.checks.find(x=>x.id===sid); if(!c) return;
  const n=parseInt(v);
  if(isNaN(n)||n<0){ c.cmdDelay=_TC_STEP_DEFAULT_IDLE; }
  else { c.cmdDelay=n; }
  try{ await saveTCFile(tc); }catch(_e){}
  try{ tcProcRefresh(tcid); }catch(_e){}
}
// 이 스텝의 유효 IDLE Interval — 스텝값 있으면 그거, 없으면 기본(100ms).
function _tcStepCmdDelay(c){
  if(c && c.cmdDelay!==undefined && c.cmdDelay!==null && c.cmdDelay!==''){ var n=parseInt(c.cmdDelay); if(!isNaN(n)&&n>=0) return n; }
  return _TC_STEP_DEFAULT_IDLE;
}
// Properties 탭 = 스텝별 "Completion Wait" 섹션 (프롬프트 대기)
// 스텝 실행 완료 후 지정 시간(초)만큼 대기한 뒤 다음 스텝으로 진행. reload 뒤에 "[y/n]" 프롬프트가
// 잠깐 뜨는 장비에서 다음 Step(y)이 늦게 도착해 [y/n]이 취소되는 문제 해결용.
function _stepCompWaitSect(tcid, c){
  if(!c) return '';   // 스텝 선택 안 됐으면 표시 안 함
  var sv='tcCheckSave(\''+tcid+'\',\''+c.id+'\',';
  var onState=!!c.compWaitOn;
  var secVal=(c.compWait==null||c.compWait==='')?'':String(c.compWait);
  var toggleColor=onState?'#00a872':'#c5cbd6';
  var toggleBg=onState?'#e6f7ef':'#fff';
  var toggle='<button onclick="'+sv+'\'compWaitOn\','+(onState?'false':'true')+')" title="On/Off" style="display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;padding:5px 11px;border:1.5px solid '+toggleColor+';border-radius:14px;background:'+toggleBg+';color:'+toggleColor+';cursor:pointer;"><i class="ti '+(onState?'ti-toggle-right-filled':'ti-toggle-left')+'" style="font-size:15px;"></i>'+(onState?'On':'Off')+'</button>';
  var secInput='<input type="number" min="0" max="600" step="1" value="'+secVal+'" onchange="'+sv+'\'compWait\',this.value)" placeholder="0" style="width:64px;font-size:12px;font-weight:700;color:var(--blue);padding:6px 7px;border:1px solid #cdd6e6;border-radius:7px;text-align:right;outline:none;'+(onState?'':'background:#f7f8fa;color:#8a92a6;')+'">';
  var row='<div><div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 11px;border:1px solid #e6eaf2;border-radius:9px;background:#fafbfe;"><span style="font-size:11.5px;font-weight:600;color:var(--text2);">Completion time has expired <span style="color:var(--text3);font-weight:500;font-size:10.5px;">(sec)</span></span><span style="display:inline-flex;align-items:center;gap:8px;">'+secInput+'<span style="color:var(--text3);">초</span>'+toggle+'</span></div><div style="font-size:10px;color:var(--text3);margin-top:5px;">이 스텝 실행 완료 후 지정 시간만큼 대기한 뒤 다음 스텝 진행. reload 뒤 [y/n] 프롬프트를 다음 스텝(y)이 놓치지 않도록 대기 없이 진입할 때 사용(0초 = 다음 스텝 즉시).</div></div>';
  var sect='<div style="flex:1 1 260px;min-width:220px;max-width:440px;"><div style="font-size:10px;font-weight:800;color:#3a4254;margin-bottom:7px;display:flex;align-items:center;gap:5px;border-bottom:1px solid #eef0f4;padding-bottom:4px;letter-spacing:.2px;"><i class="ti ti-hourglass" style="color:#7c3aed;font-size:12px;"></i>이 스텝 완료 대기 (Completion Wait)</div><div style="display:flex;flex-direction:column;gap:8px;">'+row+'</div></div>';
  return '<div style="padding:0 2px 8px;display:flex;flex-wrap:wrap;gap:16px 26px;align-items:flex-start;margin-top:-4px;">'+sect+'</div>';
}
// Expected Result 탭 = 판정기준(어떤 기준을 잡았는지) + Fail 조건
function _expectTab(tcid,c){
  if(!c) return '';
  if((c.kind||'cli')!=='cli'){ return '<div style="padding:20px;color:var(--text3);font-size:12px;">이 단계 유형은 판정(Expected) 설정이 없습니다.</div>'; }
  const sv=f=>'tcCheckSave(\''+tcid+'\',\''+c.id+'\',\''+f+'\',this.value)';
  const _ptype=c.type||'contains';
  const typeSel='<select onchange="'+sv('type')+'" style="font-size:12px;padding:6px 9px;border:1px solid #bfe3d2;border-radius:6px;background:#fff;font-weight:600;color:#00673f;">'+PROC_CHECK_TYPES.map(t=>'<option value="'+t[0]+'"'+(_ptype===t[0]?' selected':'')+'>'+t[1]+'</option>').join('')+'</select>';
  const critEditor=(_ptype==='stepcmp')?_stepCmpBuilder(tcid,c):_expCell(tcid,c);
  const excEditor='<input value="'+(c.excludeLines||'').replace(/"/g,'&quot;')+'" onblur="'+sv('excludeLines')+'" placeholder="판정 전 제외할 라인 — 문구 또는 #행번호 (쉼표 구분)" style="width:100%;font-size:12px;padding:6px 9px;border:1px solid var(--border);border-radius:6px;box-sizing:border-box;">';
  const queryEditor='<input data-gp-query="'+c.id+'" data-gp-tcid="'+tcid+'" value="'+(c.query||'').replace(/"/g,'&quot;')+'" onblur="'+sv('query')+'" placeholder="판정할 영역만 한정 — 예: Temperature · /Temp\\s*:\\s*(\\S+)/ · BEGIN..END (비우면 전체)" style="width:100%;font-size:12px;padding:6px 9px;border:1px solid #cdbdf0;border-radius:6px;box-sizing:border-box;background:#faf8ff;">';
  let queryPrev=''; if(c.query&&String(c.output||'').trim()){ try{ const _sc=_applyQuery(_respShownLines(c).join('\n'), c.query); queryPrev='<div style="margin-top:5px;font-size:11px;color:#6b3fc4;background:#f7f3ff;border:1px dashed #d9c9f7;border-radius:7px;padding:7px 10px;line-height:1.5;"><b>→ 판정 대상 영역 ('+_sc.split(/\r?\n/).filter(l=>l.trim()).length+'줄):</b> <span style="font-family:ui-monospace,monospace;color:#3a2a5a;white-space:pre-wrap;word-break:break-all;">'+((String(_sc).slice(0,400).replace(/&/g,'&amp;').replace(/</g,'&lt;'))||'(매칭 없음 — 빈 영역)')+(String(_sc).length>400?' …':'')+'</span></div>'; }catch(e){} }
  const _expl=({contains:'출력에 기준 문구가 있으면 합격 · 없으면 Fail',contains_all:'기준의 모든 줄/문구가 출력에 전부 있으면 합격 · 하나라도 없으면 Fail',notcontains:'기준 문구가 출력에 없으면 합격 · 있으면 Fail',line:'지정 항목(키:값)이 출력 라인에서 일치하면 합격 · 없거나 값이 다르면 Fail',lines:'지정한 행이 조건을 만족하면 합격 · 아니면 Fail',table:'표의 지정 컬럼=값 이 모든 행에서 일치하면 합격 · 한 행이라도 다르면 Fail',diff:'캡처한 기준과 조회 결과가 (제외 라인 빼고) 완전히 같으면 합격 · 다르면 Fail',expr:'변수 식이 참이면 합격 (예: ${a}==${b})',none:'판정하지 않음 (조회만)'})[_ptype]||'';
  let fail=''; const out=String(c.output||'');
  if(c.repeatResult==='Fail' && out.trim()){
    let reason=''; try{ reason=_failDetail(c, _respShownLines(c), tcid); }catch(e){ reason='판정기준 불충족'; }
    fail='<div style="display:flex;align-items:flex-start;gap:8px;margin-top:14px;background:#fff5f6;border:1px solid #f3c6cf;border-radius:8px;padding:9px 12px;"><i class="ti ti-alert-triangle" style="color:#e53e5a;font-size:15px;margin-top:1px;flex-shrink:0;"></i><div style="font-size:11.5px;color:#a01f33;line-height:1.55;min-width:0;"><b>현재 Fail — 판정기준과 다른 값이 조회됨</b><div style="margin-top:3px;white-space:pre-wrap;word-break:break-all;color:#7a1726;">'+String(reason).replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</div></div></div>';
  } else if(c.repeatResult==='Pass'){
    fail='<div style="margin-top:14px;background:#f0fbf6;border:1px solid #bfe3d2;border-radius:8px;padding:9px 12px;font-size:11.5px;color:#00673f;"><i class="ti ti-circle-check"></i> 현재 합격 — 판정기준 충족</div>';
  }
  return '<div style="padding:6px 2px;max-width:760px;">'
    +'<div style="font-size:10px;font-weight:800;color:#3a4254;margin-bottom:6px;"><i class="ti ti-checks" style="color:#00a872;"></i> 판정 타입</div>'+typeSel
    +'<div style="font-size:10px;font-weight:800;color:#3a4254;margin:16px 0 6px;"><i class="ti ti-target" style="color:#2d6fd4;"></i> 판정기준 (Expected)</div><div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;background:#f6fbf8;border:1px solid #bfe3d2;border-radius:8px;padding:9px 11px;">'+critEditor+'</div>'
    +(_ptype==='stepcmp'?'':('<div style="font-size:10px;font-weight:800;color:#3a4254;margin:16px 0 6px;"><i class="ti ti-crop" style="color:#7c3aed;"></i> 판정 영역 (Query) <span style="font-weight:600;color:var(--text3);">— Response에서 판정할 부분만 한정</span></div>'+queryEditor+queryPrev
    +'<div style="font-size:10px;font-weight:800;color:#3a4254;margin:16px 0 6px;"><i class="ti ti-eraser" style="color:#64748b;"></i> 제외 라인</div>'+excEditor))
    +(_expl?('<div style="font-size:11.5px;color:var(--text2);margin-top:14px;line-height:1.6;background:#f7f9fc;border:1px solid #eef0f4;border-radius:7px;padding:9px 12px;"><b style="color:#3a4254;">합격/Fail 조건:</b> '+_expl+'</div>'):'')
    +fail
    +'</div>';
}
// Root Cause Analysis 탭 = Test Cycle 의 RCA(Fail 원인) 파이프라인을 이 스텝(check)에 그대로 적용
function _rcaTab(tcid,c){
  if(!c) return '';
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const _crit=c.criteria||''; const _type=c.type||'contains'; const _excL=c.excludeLines||''; const out=String(c.output||'');
  if(!out.trim()) return '<div style="padding:26px;text-align:center;color:var(--text3);font-size:12.5px;border:1px dashed var(--border);border-radius:8px;background:#fafbfc;"><i class="ti ti-player-play" style="color:var(--green);"></i> 미실행 — ▶로 실행하면 Fail 원인(RCA)이 여기에 표시됩니다.</div>';
  // c.output 끝에 붙은 '─── 판정 근거 ───' 등(판정기준 텍스트 포함)을 떼어낸 장비 원시출력만 판정/표시에 사용
  const _cliOut=out.replace(/\n*─── (?:표 검증|기준 비교|판정 근거) ───[\s\S]*$/,'').replace(/\n*─── Query 영역[\s\S]*$/,'').replace(/\s+$/,'');
  let _v='';
  // 실행 시 확정된 결과(c.repeatResult)를 우선 신뢰 → Response/Expected Result와 일치
  if(c.repeatResult==='Pass')_v='pass'; else if(c.repeatResult==='Fail')_v='fail';
  if(!_v && (_crit||_type==='table')){ try{ let _lv=''; if(_type==='table') _lv=(_judgeTable(_applyQuery(_cliOut,c.query),_crit).pass?'Pass':'Fail'); else if(_type==='diff'||_type==='expr') _lv=''; else _lv=_judgeCheck(_cliOut,_crit,_type,_excL,c.query); if(_lv==='Pass')_v='pass'; else if(_lv==='Fail')_v='fail'; }catch(e){} }
  else if(!_v && String(_excL||'').trim()){ _v='pass'; }
  const _critToks=(typeof _critTokens==='function')?_critTokens({type:_type,criteria:_crit}):[];
  const _ob=_v==='pass'?'border:2px solid #00a872;':(_v==='fail'?'border:2px solid #e53e5a;':'border:1px solid #e6e2d6;');
  const _outBody=(_v&&_critToks.length&&typeof _cbHlOut==='function')?_cbHlOut(_cliOut,_critToks,_v):esc(_cliOut);
  const outHtml='<span style="font-family:ui-monospace,monospace;display:block;background:#faf9f5;color:#2a2f3a;padding:8px 11px;border-radius:6px;overflow:auto;white-space:pre;line-height:1.45;font-size:11.5px;'+_ob+'">'+_outBody+'</span>';
  let head='';
  if(_v==='fail'){
    let _rs='';
    if(_type==='table'){ try{ _rs=_judgeTable(_cliOut,_crit).detail||''; }catch(e){} }
    else { try{ _rs=_failDetail({type:_type,criteria:_crit,excludeLines:_excL,output:_cliOut,repeatResult:'Fail'}, _cliOut.split(/\r?\n/), tcid); }catch(e){} if(!_rs){ try{ _rs=_judgeReason(_cliOut,_crit,_type,_excL,'Fail'); }catch(e){} } }
    head='<div style="font-size:11.5px;color:#a01f33;background:#fff5f6;border:1px solid #f3c6cf;border-radius:8px;padding:9px 12px;margin-bottom:10px;line-height:1.55;white-space:pre-wrap;word-break:break-word;"><b style="color:#e53e5a;"><i class="ti ti-alert-triangle"></i> RCA — Fail 원인:</b><br>'+esc(String(_rs||'판정기준 불충족'))+'</div>';
  } else if(_v==='pass'){
    head='<div style="font-size:11.5px;color:#00673f;background:#f0fbf6;border:1px solid #bfe3d2;border-radius:8px;padding:9px 12px;margin-bottom:10px;"><i class="ti ti-circle-check"></i> 합격 — 판정기준 충족 (Fail 원인 없음)</div>';
  } else {
    head='<div style="font-size:11.5px;color:var(--text3);background:#f7f9fc;border:1px solid #eef0f4;border-radius:8px;padding:9px 12px;margin-bottom:10px;">판정 타입(\''+esc(_type)+'\')이 자동 RCA 대상이 아닙니다 — 조회 결과만 표시.</div>';
  }
  return '<div style="padding:6px 2px;max-width:840px;"><div style="font-size:10px;font-weight:800;color:#3a4254;margin-bottom:7px;"><i class="ti ti-stethoscope" style="color:#e53e5a;"></i> Root Cause Analysis</div>'+head+'<div style="font-size:10px;font-weight:700;color:var(--text3);margin:4px 0 5px;">Actual Data (조회 결과)</div>'+outHtml+'</div>';
}
// ── 스텝 표 우클릭 → 단계 추가 하위메뉴 ──
function tcStepCtxClose(){ const m=document.getElementById('tc-step-ctx'); if(m) m.remove(); document.removeEventListener('mousedown', _tcStepCtxOutside); }
function _tcStepCtxOutside(e){ const m=document.getElementById('tc-step-ctx'); if(!m||m.contains(e.target)) return; tcStepCtxClose(); }

// GP 변수 삽입 — 스텝 우클릭 메뉴에서 호출 (input이 없을 수 있어 위치 기반으로 처리)
function tcStepGpPick(px, py, tcid, sid, field){
  field = field||'cli';
  var inp = document.getElementById(field+'-'+sid);
  // input을 찾지 못하면 커서 위치에 드롭다운만 띄우고 삽입 위치는 끝으로
  var selStart = inp ? inp.selectionStart : 0;
  var selEnd   = inp ? inp.selectionEnd   : 0;

  var old = document.getElementById('gp-var-drop'); if(old) old.remove();
  if(typeof _gpData==='undefined'){ alert('Global Parameters가 로드되지 않았습니다.'); return; }
  var vars=[];
  ['__global__'].concat(Object.keys(_gpData).filter(function(k){ return k!=='__global__'&&k!=='__gp_folders__'; })).forEach(function(mid){
    var rows=Array.isArray(_gpData[mid])?_gpData[mid]:[];
    rows.forEach(function(p){ if(p.name) vars.push({name:p.name,value:p.value,group:p.group||'',model:mid}); });
  });
  if(!vars.length){ alert('등록된 Global Parameter가 없습니다.\nTests → Global Parameters에서 먼저 등록하세요.'); return; }

  var drop=document.createElement('div'); drop.id='gp-var-drop';
  drop.style.cssText='position:fixed;z-index:200000;background:#fff;border:1px solid #d1d5db;border-radius:8px;'
    +'box-shadow:0 6px 24px rgba(0,0,0,0.13);min-width:300px;max-height:360px;overflow-y:auto;';
  var html='<div style="padding:7px 12px;font-size:11px;font-weight:700;color:#7c3aed;border-bottom:1px solid #f0f0f0;'
    +'display:flex;align-items:center;gap:6px;background:#faf5ff;border-radius:8px 8px 0 0;">'
    +'<i class="ti ti-variable"></i> Global Parameter 삽입</div>';
  var grouped={};
  vars.forEach(function(v){
    var key=(v.model==='__global__'?'🌐 전역':'📁 '+v.model)+(v.group?' / '+v.group:'');
    if(!grouped[key]) grouped[key]=[];
    grouped[key].push(v);
  });
  Object.keys(grouped).forEach(function(grpKey){
    html+='<div style="padding:4px 12px;font-size:10.5px;font-weight:700;color:#9ca3af;background:#f9fafb;border-bottom:1px solid #f0f0f0;">'+grpKey+'</div>';
    grouped[grpKey].forEach(function(v){
      var _val=(typeof _he==='function'?_he(String(v.value||'')):String(v.value||''));
      html+='<div class="gp-item" data-name="'+v.name+'" '
        +'style="padding:7px 14px;cursor:pointer;display:flex;align-items:center;gap:8px;border-bottom:1px solid #f9fafb;" '
        +'onmouseover="this.style.background=\'#f5f3ff\'" onmouseout="this.style.background=\'#fff\'">'
        +'<code style="font-size:12.5px;font-weight:700;color:#7c3aed;flex-shrink:0;">${'+v.name+'}</code>'
        +'<span style="font-size:11px;color:#6b7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">'+_val+'</span>'
        +'</div>';
    });
  });
  drop.innerHTML=html;
  drop.style.top =Math.min(py, window.innerHeight-380)+'px';
  drop.style.left=Math.min(px, window.innerWidth -320)+'px';
  document.body.appendChild(drop);

  drop.querySelectorAll('.gp-item').forEach(function(item){
    item.addEventListener('mousedown', function(e){
      e.preventDefault();
      var ins='${'+this.dataset.name+'}';
      drop.remove();
      if(inp){
        inp.focus();
        inp.setSelectionRange(selStart, selEnd);
        var val=inp.value;
        inp.value=val.slice(0,selStart)+ins+val.slice(selEnd);
        var pos=selStart+ins.length;
        inp.setSelectionRange(pos,pos);
        tcCheckSave(tcid, sid, field, inp.value);
      } else {
        var _tc=tcList.find(function(t){ return t.tcid===tcid||t.id===tcid; });
        var _cc=_tc&&(_tc.checks||[]).find(function(x){ return x.id===sid; });
        if(_cc){ var cur=String(_cc[field]||''); _cc[field]=cur+ins; tcCheckSave(tcid,sid,field,_cc[field]); }
      }
    });
  });
  setTimeout(function(){
    document.addEventListener('mousedown', function _gpClose(e){
      var d=document.getElementById('gp-var-drop'); if(!d) return document.removeEventListener('mousedown',_gpClose);
      if(!d.contains(e.target)){ d.remove(); document.removeEventListener('mousedown',_gpClose); }
    });
  }, 0);
}
// 제어(IF/For/While) 추가 — 스텝 선택 상태면 그 스텝 안/뒤로 인라인, 선택 없으면 맨 아래 일반 스텝으로 생성
function tcCtrlAdd(tcid, kind){ const sel=Array.isArray(_stepSel[tcid])?_stepSel[tcid]:[]; tcCheckAdd(tcid, kind, sel.length===0); }
function tcStepCtxMenu(ev, tcid){
  ev.preventDefault(); ev.stopPropagation();
  // 판정기준 input 우클릭 → GP 팝업
  var _tgt=ev.target;
  var _gpCritEl=_tgt&&_tgt.closest&&_tgt.closest('[data-gp-crit]');
  if(_gpCritEl){ tcVarMenuCrit(ev, _gpCritEl.getAttribute('data-gp-tcid')||tcid, _gpCritEl.getAttribute('data-gp-crit')); return; }
  var _gpQueryEl=_tgt&&_tgt.closest&&_tgt.closest('[data-gp-query]');
  if(_gpQueryEl){ tcVarMenuQuery(ev, _gpQueryEl.getAttribute('data-gp-tcid')||tcid, _gpQueryEl.getAttribute('data-gp-query')); return; }
  tcStepCtxClose();
  let sid=''; try{ const tr=ev.target.closest('tr[data-sid]'); if(tr) sid=tr.getAttribute('data-sid')||''; }catch(e){}
  let isCli=false; if(sid){ const _tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); const _cc=_tc&&(_tc.checks||[]).find(x=>x.id===sid); if(_cc) isCli=((_cc.kind||'cli')==='cli'); }
  const addItems=[['cli','Command','#00875a','ti-terminal-2'],['manual','수동','#c48a00','ti-hand-click'],['connect','Session Open','#0ea5e9','ti-plug-connected'],['wait','대기','#e8820c','ti-clock'],['switch','Switch','#e53e5a','ti-arrows-split-2'],['group','단계','#7c3aed','ti-folder'],['call','호출','#0784b5','ti-subtask'],['comment','주석','#d99a00','ti-message-2'],['message','메시지','#0891b2','ti-messages'],['disconnect','Session Closed','#64748b','ti-plug-connected-x']];
  const _anchorJs=sid?('_stepSel[\''+tcid+'\']=[\''+sid+'\'];'):'';
  const sub=addItems.map(it=>'<div onmousedown="event.preventDefault()" onclick="tcStepCtxClose();'+_anchorJs+'tcCheckAdd(\''+tcid+'\',\''+it[0]+'\')" style="padding:7px 16px 7px 13px;font-size:12.5px;color:#1c1f27;cursor:pointer;display:flex;align-items:center;gap:8px;white-space:nowrap;" onmouseenter="this.style.background=\'#eef4ff\'" onmouseleave="this.style.background=\'#fff\'"><i class="ti '+it[3]+'" style="font-size:14px;color:'+it[2]+';"></i>'+it[1]+'</div>').join('');
  // 고급 옵션(제어) 서브메뉴 — While문 / For문 / IF문 (+Step식 hover 펼침)
  const ctrlItems=[['if','IF문 (조건)','#0891b2','ti-arrows-split'],['loopfor','For문 (변수 $i)','#7c3aed','ti-variable'],['loopwhile','While문 (중단조건)','#7c3aed','ti-rotate-clockwise']];
  const ctrlSub=ctrlItems.map(it=>'<div onmousedown="event.preventDefault()" onclick="tcStepCtxClose();tcCtrlAdd(\''+tcid+'\',\''+it[0]+'\')" style="padding:7px 16px 7px 13px;font-size:12.5px;color:#1c1f27;cursor:pointer;display:flex;align-items:center;gap:8px;white-space:nowrap;" onmouseenter="this.style.background=\'#f3eeff\'" onmouseleave="this.style.background=\'#fff\'"><i class="ti '+it[3]+'" style="font-size:14px;color:'+it[2]+';"></i>'+it[1]+'</div>').join('');
  const ctrlMenu='<div style="position:relative;padding:8px 14px;font-size:12.5px;font-weight:600;color:#1c1f27;cursor:default;display:flex;align-items:center;gap:8px;white-space:nowrap;" onmouseenter="this.querySelector(\'.tc-ctx-sub\').style.display=\'block\'" onmouseleave="this.querySelector(\'.tc-ctx-sub\').style.display=\'none\'"><i class="ti ti-adjustments" style="color:#7c3aed;font-size:15px;"></i> 고급 옵션 (제어) <i class="ti ti-chevron-right" style="margin-left:auto;font-size:14px;color:#9aa1ad;"></i><div class="tc-ctx-sub" style="display:none;position:absolute;left:100%;top:-5px;background:#fff;border:1px solid #d2d7e0;border-radius:9px;box-shadow:0 10px 32px rgba(30,40,80,0.22);padding:4px 0;min-width:180px;"><div style="padding:5px 14px 6px;font-size:10px;font-weight:800;color:#9aa1ad;letter-spacing:.5px;">제어 · 반복 · 조건</div>'+ctrlSub+'</div></div>';
  const item=(ic,col,lab,oc)=>'<div onmousedown="event.preventDefault()" onclick="tcStepCtxClose();'+oc+'" style="padding:8px 14px;font-size:12.5px;font-weight:600;color:#1c1f27;cursor:pointer;display:flex;align-items:center;gap:8px;white-space:nowrap;" onmouseenter="this.style.background=\'#eef4ff\'" onmouseleave="this.style.background=\'#fff\'"><i class="ti '+ic+'" style="font-size:15px;color:'+col+';"></i>'+lab+'</div>';
  const sep='<div style="height:1px;background:#eef0f4;margin:4px 0;"></div>';
  let html='<div style="position:relative;padding:8px 14px;min-width:170px;font-size:12.5px;font-weight:700;color:#1c1f27;cursor:default;display:flex;align-items:center;gap:8px;white-space:nowrap;" onmouseenter="this.querySelector(\'.tc-ctx-sub\').style.display=\'block\'" onmouseleave="this.querySelector(\'.tc-ctx-sub\').style.display=\'none\'"><i class="ti ti-plus" style="color:#2d6fd4;font-size:15px;"></i> Step <i class="ti ti-chevron-right" style="margin-left:auto;font-size:14px;color:#9aa1ad;"></i><div class="tc-ctx-sub" style="display:none;position:absolute;left:100%;top:-5px;background:#fff;border:1px solid #d2d7e0;border-radius:9px;box-shadow:0 10px 32px rgba(30,40,80,0.22);padding:4px 0;min-width:150px;"><div style="padding:5px 14px 6px;font-size:10px;font-weight:800;color:#9aa1ad;letter-spacing:.5px;">Add</div>'+sub+'</div></div>';
  if(!sid && _stepClip && _stepClip.steps && _stepClip.steps.length){ html+=sep+item('ti-clipboard-plus','#0d9488','Step 붙여넣기 ('+_stepClip.steps.length+'개, Ctrl+V)','_stepClipPaste(\''+tcid+'\')'); }   // 빈 TC(스텝 없음)에서도 우클릭 붙여넣기
  if(sid){ html+=sep;
    const _cc2=(tcList.find(t=>(t.tcid===tcid)||(t.id===tcid))||{}).checks||[]; const _cs=_cc2.find(x=>x.id===sid)||{};
    const _selN=_stepSelIds(tcid).length; const _sfx=(_selN>1?(' ('+_selN+'개)'):'');
    if(isCli){ html+=item('ti-variable','#7c3aed','Global Parameters 선택…','tcGpVarPopup(\''+tcid+'\',\''+sid+'\')'); }
    html+=item('ti-point-filled',(_cs.breakpoint?'#e53e5a':'#9aa1ad'),(_cs.breakpoint?'Breakpoint 해제':'Toggle Breakpoint')+_sfx,'tcStepToggleBp(\''+tcid+'\',\''+sid+'\')')+item('ti-player-skip-forward-filled',(_cs.skip?'#e8820c':'#9aa1ad'),(_cs.skip?'UnSkip (스킵 해제)':'Skip (건너뛰기)')+_sfx,'tcStepToggleSkip(\''+tcid+'\',\''+sid+'\')')+sep;
    html+=ctrlMenu+sep;   // 고급 옵션(제어) → While·For·IF (+Step식 서브메뉴, 모든 스텝)
    html+=item('ti-clipboard-copy','#2d6fd4','Step 복사 (Ctrl+C)'+_sfx,'_stepClipCopy(\''+tcid+'\',\''+sid+'\')')+((_stepClip&&_stepClip.steps&&_stepClip.steps.length)?item('ti-clipboard-plus','#0d9488','Step 붙여넣기 ('+_stepClip.steps.length+'개, Ctrl+V)','_stepClipPaste(\''+tcid+'\')'):'')+item('ti-trash','#e53e5a','Step Delete','tcCheckDel(\''+tcid+'\',\''+sid+'\')'); }
  const m=document.createElement('div'); m.id='tc-step-ctx';
  // z-index 는 팝업 modal(200000) 보다 위에 오도록 300001. 문서 body 에 append.
  m.style.cssText='position:fixed;z-index:300001;background:#fff;border:1px solid #d2d7e0;border-radius:9px;box-shadow:0 10px 32px rgba(30,40,80,0.22);padding:4px 0;font-family:inherit;min-width:160px;';
  m.innerHTML=html;
  document.body.appendChild(m);
  let x=ev.clientX, y=ev.clientY; const mw=170;
  if(x+mw+150>window.innerWidth) x=Math.max(8, window.innerWidth-mw-160);
  if(y+340>window.innerHeight) y=Math.max(8, window.innerHeight-340);
  m.style.left=x+'px'; m.style.top=y+'px';
  setTimeout(()=>document.addEventListener('mousedown', _tcStepCtxOutside), 0);
}
function tcStepToggleBp(tcid,sid){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc) return; const checks=tc.checks||[];
  let ids=_stepSelIds(tcid); if(!ids.length||ids.indexOf(sid)<0) ids=[sid];
  const turnOn=ids.some(id=>{ const c=checks.find(x=>x.id===id); return c&&!c.breakpoint; });
  ids.forEach(id=>{ const c=checks.find(x=>x.id===id); if(c){ if(turnOn) c.breakpoint=true; else delete c.breakpoint; } });
  saveTCFile(tc); tcProcRefresh(tcid); showToast(turnOn?('⏸ Breakpoint 설정 ('+ids.length+'개)'):'Breakpoint 해제');
}
function tcStepToggleSkip(tcid,sid){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc) return; const checks=tc.checks||[];
  let ids=_stepSelIds(tcid); if(!ids.length||ids.indexOf(sid)<0) ids=[sid];
  const turnOn=ids.some(id=>{ const c=checks.find(x=>x.id===id); return c&&!c.skip; });
  ids.forEach(id=>{ const c=checks.find(x=>x.id===id); if(c){ if(turnOn) c.skip=true; else delete c.skip; } });
  saveTCFile(tc); tcProcRefresh(tcid); showToast(turnOn?('⤼ Skip 설정 ('+ids.length+'개)'):'Skip 해제');
}let _stepOpen={};
function tcStepToggle(tcid,id){ _stepOpen[id]=!_stepOpen[id]; tcProcRefresh(tcid); }
async function tcStepMove(tcid,id,dir){ const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc||!Array.isArray(tc.checks)) return; const a=tc.checks; const i=a.findIndex(c=>c.id===id); const j=i+dir; if(i<0||j<0||j>=a.length) return; _tcSnapshot(tcid); const t=a[i]; a[i]=a[j]; a[j]=t; await saveTCFile(tc); tcProcRefresh(tcid); }function tcStepPaste(tcid,id,ev){
  // 붙여넣기는 한 스텝에 plain text 그대로(여러 줄=한 스텝 여러 명령), 자동 분배 안 함.
  // execCommand('insertText')는 브라우저별로 개행이 유실되는 경우가 있어 Range API로 직접 삽입.
  try{
    const txt=((ev.clipboardData||window.clipboardData).getData('text'))||'';
    ev.preventDefault();
    const sel=window.getSelection(); if(!sel||!sel.rangeCount) return;
    const range=sel.getRangeAt(0); range.deleteContents();
    const lines=txt.split(/\r\n|\r|\n/);
    const frag=document.createDocumentFragment(); let lastNode=null;
    lines.forEach(function(line,i){ if(i>0) frag.appendChild(document.createElement('br')); lastNode=document.createTextNode(line); frag.appendChild(lastNode); });
    range.insertNode(frag);
    if(lastNode){ const r2=document.createRange(); r2.setStartAfter(lastNode); r2.collapse(true); sel.removeAllRanges(); sel.addRange(r2); }
  }catch(e){}
}
async function tcStepDistribute(tcid,id,lines,replaceFirst){ const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc||!Array.isArray(tc.checks)) return; const i=tc.checks.findIndex(x=>x.id===id); if(i<0) return; const c=tc.checks[i]; let s=0; if(replaceFirst||!String(c.cli||'').trim()){ c.cli=lines[0]; s=1; } const news=lines.slice(s).map((ln,k)=>({id:'ck'+Date.now()+Math.floor(Math.random()*100000)+k, kind:'cli', model:c.model||'공통', action:c.action||'CLI', cli:ln, criteria:'', type:c.type||'none', indent:c.indent||0, parent:c.parent})); tc.checks.splice(i+1,0,...news); await saveTCFile(tc); tcProcRefresh(tcid); showToast(lines.length+'줄을 각 스텝으로 분배했습니다'); }
async function tcStepCapture(tcid,id){ const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc) return; const c=(tc.checks||[]).find(x=>x.id===id); if(!c) return; const out=String(c.output||'').replace(/\n*─── 기준 비교 ───[\s\S]*$/,'').replace(/\n*─── 표 검증 ───[\s\S]*$/,'').replace(/\n*─── 판정 근거 ───[\s\S]*$/,'').replace(/\n*─── Query 영역[\s\S]*$/,'').replace(/^⏳[\s\S]*$/,'').trim(); if(!out){ showToast('먼저 ▶조회로 결과를 받은 뒤 [기준 캡처]하세요'); return; } c.baseline=out; await saveTCFile(tc); tcProcRefresh(tcid); showToast('기준 캡처됨 ('+out.split(/\r?\n/).filter(l=>l.trim()).length+'줄) — 이후 실행 시 전체 비교'); }
// 원클릭: 지금 결과를 '정상'으로 저장 + 자동 전체비교 설정 (누구나 사용)
// 기준 캡처(baseline) 해제 — diff 기준 제거
async function tcStepClearBaseline(tcid,id){ const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc) return; const c=(tc.checks||[]).find(x=>x.id===id); if(!c) return; delete c.baseline; if((c.type||'')==='diff') c.type='contains'; await saveTCFile(tc); tcProcRefresh(tcid); showToast('기준 캡처 해제 — 판정 타입을 일반(포함)으로 되돌림'); }
function tcStepsExpandAll(tcid){ const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc) return; _stepOpen=_stepOpen||{}; (tc.checks||[]).forEach(c=>{ _stepOpen[c.id]=true; var k=c.kind||'cli'; if(k==='model')_modelCol[c.id]=false; else if(k==='proc')_procCol[c.id]=false; else if(k==='if'||k==='loop')_blkCol[c.id]=false; }); _modelCol['__common_'+tcid]=false; tcProcRefresh(tcid); }
function tcStepsCollapseAll(tcid){ const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc) return; _stepOpen=_stepOpen||{}; (tc.checks||[]).forEach(c=>{ _stepOpen[c.id]=false; var k=c.kind||'cli'; if(k==='model')_modelCol[c.id]=true; else if(k==='proc')_procCol[c.id]=true; else if(k==='if'||k==='loop')_blkCol[c.id]=true; }); _modelCol['__common_'+tcid]=true; tcProcRefresh(tcid); }
// ── Step Ctrl+C / Ctrl+V (스텝 복사·붙여넣기) ──
let _stepClip=null;   // { steps:[deep clone...] }
function _activeProcTcid(){
  // 현재 보고 있는 TC를 우선 (복사/붙여넣기/삭제/undo 모두 현재 화면 TC 대상) — 다른 TC의 stale 선택으로 빗나가지 않게
  var cur=window._lastProcTcid;
  // 1) 대시보드 절차탭: _lastProcTcid의 실제 뷰가 떠 있으면 그게 현재 TC
  if(cur && (document.getElementById('tc3-tabcontent-'+cur)||document.getElementById('tmt-tabcontent-'+cur))) return cur;
  // 2) Req&Coverage 3열(explorer3)이 활성이면 그 화면에서 보고 있는 TC (stale expSel보다 우선)
  var _p3=document.getElementById('page-explorer3');
  if(_p3&&_p3.classList.contains('active')&&typeof e3SelTc!=='undefined'&&e3SelTc) return e3SelTc;
  var _p3b=document.getElementById('page-explorer3-beta');
  if(_p3b&&_p3b.classList.contains('active')&&typeof e3bSelTc!=='undefined'&&e3bSelTc) return e3bSelTc;
  // 2.5) 구 탐색기(page-explorer)가 활성일 때만 expSel 신뢰 — 딥링크 복원 등으로 남은 stale 값 배제
  var _pe=document.getElementById('page-explorer');
  if(_pe&&_pe.classList.contains('active')&&typeof expSel!=='undefined'&&expSel&&expSel.type==='tc'&&expSel.id) return expSel.id;
  // 3) 그 외: 선택된 스텝이 있는 TC
  for(const k in (_stepSel||{})){ if(Array.isArray(_stepSel[k])&&_stepSel[k].length) return k; }
  return cur||null;
}
// 스텝 절차 화면이 떠 있는지 — 대시보드 절차탭 / 구 탐색기(expSel) / Req&Coverage 3열(e3SelTc, Step탭)
function _procViewOn(tcid){
  if(document.getElementById('tc3-tabcontent-'+tcid)||document.getElementById('tmt-tabcontent-'+tcid)) return true;
  var pe=document.getElementById('page-explorer');
  if(pe&&pe.classList.contains('active')&&typeof expSel!=='undefined'&&expSel&&expSel.type==='tc'&&expSel.id===tcid) return true;
  var p3=document.getElementById('page-explorer3');
  if(p3&&p3.classList.contains('active')&&typeof e3SelTc!=='undefined'&&e3SelTc===tcid&&((typeof e3TcTab!=='undefined'&&e3TcTab[tcid])||'procedure')==='procedure') return true;
  var p3b=document.getElementById('page-explorer3-beta');
  if(p3b&&p3b.classList.contains('active')&&typeof e3bTcInlineOpen!=='undefined'&&e3bTcInlineOpen===tcid&&((typeof e3bTcTab!=='undefined'&&e3bTcTab[tcid])||'procedure')==='procedure') return true;
  return false;
}
function _stepClipCopy(tcid, sid){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc) return false;
  let ids=_stepSelIds(tcid);
  if(sid&&(!ids.length||ids.indexOf(sid)<0)){ _stepSel=_stepSel||{}; _stepSel[tcid]=[sid]; ids=[sid]; }   // 우클릭한 스텝이 선택에 없으면 그것만
  if(!ids.length) return false;
  const sel=(tc.checks||[]).filter(c=>ids.indexOf(c.id)>=0);   // 원본 순서 유지
  if(!sel.length) return false;
  _stepClip={ steps: sel.map(c=>JSON.parse(JSON.stringify(c))) };
  if(typeof showToast==='function') showToast('📋 '+_stepClip.steps.length+'개 스텝 복사 — Ctrl+V로 붙여넣기');
  return true;
}
async function _stepClipPaste(tcid){
  if(!_stepClip||!_stepClip.steps||!_stepClip.steps.length) return false;
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc) return false;
  if(!Array.isArray(tc.checks)) tc.checks=[];   // 스텝 없는 TC(새 TC는 checks 미존재)에도 붙여넣기 가능
  const ids=_stepSelIds(tcid);
  let pos=tc.checks.length;   // 기본: 맨 아래
  if(ids.length){ const last=ids[ids.length-1]; const i=tc.checks.findIndex(c=>c.id===last); if(i>=0) pos=i+1; }   // 선택 스텝 바로 아래
  const fresh=_stepClip.steps.map((s,k)=>{ const n=JSON.parse(JSON.stringify(s)); n.id='ck'+Date.now()+Math.floor(Math.random()*100000)+k; delete n.output; delete n.repeatResult; delete n.executed_at; delete n.baseline; return n; });
  _tcSnapshot(tcid);
  tc.checks.splice(pos,0,...fresh);
  _stepSel=_stepSel||{}; _stepSel[tcid]=fresh.map(c=>c.id);   // 붙여넣은 스텝 선택
  await saveTCFile(tc); tcProcRefresh(tcid);
  if(typeof showToast==='function') showToast('📌 '+fresh.length+'개 스텝 붙여넣기');
  return true;
}
// ── Step Undo (Ctrl+Z) / Redo (Ctrl+Y) / 선택 삭제 (Ctrl+Del) ──
let _undoStack={};   // {tcid:[JSON(checks), ...]} — 변경 직전 스냅샷
let _redoStack={};   // {tcid:[JSON(checks), ...]} — undo 직전 상태 (새 변경 발생 시 무효화)
function _tcSnapshot(tcid){ const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc||!Array.isArray(tc.checks)) return; _undoStack=_undoStack||{}; _undoStack[tcid]=_undoStack[tcid]||[]; try{ _undoStack[tcid].push(JSON.stringify(tc.checks)); }catch(e){ return; } if(_undoStack[tcid].length>40) _undoStack[tcid].shift(); _redoStack=_redoStack||{}; _redoStack[tcid]=[]; }
async function tcUndo(tcid){ const st=(_undoStack||{})[tcid]; if(!st||!st.length){ if(typeof showToast==='function')showToast('되돌릴 변경이 없습니다'); return; } const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc) return; let snap; try{ snap=JSON.parse(st.pop()); }catch(e){ return; } _redoStack=_redoStack||{}; _redoStack[tcid]=_redoStack[tcid]||[]; try{ _redoStack[tcid].push(JSON.stringify(tc.checks||[])); }catch(e){} tc.checks=snap; _stepSel=_stepSel||{}; _stepSel[tcid]=[]; await saveTCFile(tc); tcProcRefresh(tcid); if(typeof showToast==='function')showToast('↶ 되돌림 (Ctrl+Z) · 남은 '+st.length+'단계'); }
async function tcRedo(tcid){ const st=(_redoStack||{})[tcid]; if(!st||!st.length){ if(typeof showToast==='function')showToast('다시 실행할 변경이 없습니다'); return; } const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc) return; let snap; try{ snap=JSON.parse(st.pop()); }catch(e){ return; } _undoStack=_undoStack||{}; _undoStack[tcid]=_undoStack[tcid]||[]; try{ _undoStack[tcid].push(JSON.stringify(tc.checks||[])); }catch(e){} tc.checks=snap; _stepSel=_stepSel||{}; _stepSel[tcid]=[]; await saveTCFile(tc); tcProcRefresh(tcid); if(typeof showToast==='function')showToast('↷ 다시 실행 (Ctrl+Y) · 남은 '+st.length+'단계'); }
async function tcStepsDeleteSel(tcid){ const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc||!Array.isArray(tc.checks)) return; const ids=_stepSelIds(tcid); if(!ids.length){ if(typeof showToast==='function')showToast('삭제할 스텝을 선택하세요 (● 클릭)'); return; } _tcSnapshot(tcid); const set=new Set(ids); tc.checks=tc.checks.filter(c=>!set.has(c.id)); _stepSel=_stepSel||{}; _stepSel[tcid]=[]; await saveTCFile(tc); tcProcRefresh(tcid); if(typeof showToast==='function')showToast('🗑 '+ids.length+'개 스텝 삭제 (Ctrl+Z로 복구)'); }
if(!window._stepClipInit){ window._stepClipInit=true;
  document.addEventListener('keydown', function(e){
    if(!(e.ctrlKey||e.metaKey)) return;
    const k=(e.key||'').toLowerCase(); if(k!=='c'&&k!=='v'&&k!=='z'&&k!=='y'&&k!=='delete') return;
    // 입력/편집 중이면 브라우저 기본(텍스트 복붙·텍스트 undo)으로 — 스텝 단축키 가로채지 않음
    const ae=document.activeElement;
    if(ae){ const tn=(ae.tagName||'').toLowerCase(); if(tn==='input'||tn==='textarea'||tn==='select'||ae.isContentEditable) return; }
    // 텍스트를 드래그 선택한 상태면 복사는 기본 동작
    const selTxt=(window.getSelection&&String(window.getSelection()))||'';
    if(k==='c'&&selTxt.trim()) return;
    const tcid=_activeProcTcid(); if(!tcid) return;
    // 절차 화면이 떠 있을 때만
    if(!_procViewOn(tcid)) return;
    if(k==='c'){ if(_stepClipCopy(tcid)) e.preventDefault(); }
    else if(k==='v'){ if(_stepClip&&_stepClip.steps&&_stepClip.steps.length){ e.preventDefault(); _stepClipPaste(tcid); } }
    else if(k==='z'){ e.preventDefault(); if(e.shiftKey) tcRedo(tcid); else tcUndo(tcid); }   // Ctrl+Z: 되돌리기 · Ctrl+Shift+Z: 다시 실행
    else if(k==='y'){ e.preventDefault(); tcRedo(tcid); }                  // Ctrl+Y: 다시 실행
    else if(k==='delete'){ e.preventDefault(); tcStepsDeleteSel(tcid); }   // Ctrl+Del: 선택 스텝 삭제
  }, true);
}
let _stepSel={};
function _stepSelIds(tcid){ return Array.isArray((_stepSel||{})[tcid])?_stepSel[tcid]:[]; }
let _stepAnchor={};
// Test Step에서 Enter → 그 스텝을 선택 상태로 유지하고 편집 종료 (이후 방향키로 이동)
function tcStepEnterSelect(tcid,id,el){ _stepSel=_stepSel||{}; _stepSel[tcid]=[id]; _stepAnchor=_stepAnchor||{}; _stepAnchor[tcid]=id; window._lastProcTcid=tcid; try{ if(el&&el.blur)el.blur(); }catch(e){} tcProcRefresh(tcid); setTimeout(function(){ var r=document.querySelector('[data-sid="'+id+'"]'); if(r&&r.scrollIntoView)r.scrollIntoView({block:'nearest'}); },10); }
// 방향키 ↑↓ → 선택된 스텝(파란 강조)을 위/아래로 이동 (셀 편집 중이 아닐 때만)
if(!window._stepArrowInit){ window._stepArrowInit=true;
  document.addEventListener('keydown', function(e){
    if(e.key!=='ArrowUp'&&e.key!=='ArrowDown') return;
    if(e.ctrlKey||e.metaKey||e.altKey) return;
    var ae=document.activeElement;
    if(ae){ var tn=(ae.tagName||'').toLowerCase(); if(tn==='input'||tn==='textarea'||tn==='select'||ae.isContentEditable) return; }   // 셀 편집 중이면 셀 네비게이션이 처리
    var tcid=(typeof _activeProcTcid==='function')?_activeProcTcid():null; if(!tcid) return;
    if(!_procViewOn(tcid)) return;
    var tc=tcList.find(function(t){return (t.tcid===tcid)||(t.id===tcid);}); if(!tc||!Array.isArray(tc.checks)) return;
    var ids=_stepSelIds(tcid); if(!ids.length) return;
    var cur=ids[ids.length-1]; var checks=tc.checks; var idx=checks.findIndex(function(c){return c.id===cur;}); if(idx<0) return;
    var dir=(e.key==='ArrowDown')?1:-1; var ni=idx+dir;
    while(ni>=0&&ni<checks.length){ var kk=checks[ni].kind||'cli'; if(kk!=='model'&&kk!=='proc') break; ni+=dir; }   // 섹션 헤더(model/proc) 건너뜀
    if(ni<0||ni>=checks.length) return;
    e.preventDefault();
    _stepSel=_stepSel||{}; _stepSel[tcid]=[checks[ni].id]; _stepAnchor=_stepAnchor||{}; _stepAnchor[tcid]=checks[ni].id;
    tcProcRefresh(tcid);
    setTimeout(function(){ var el2=document.querySelector('[data-sid="'+checks[ni].id+'"]'); if(el2&&el2.scrollIntoView)el2.scrollIntoView({block:'nearest'}); },10);
  }, true);
}
// Ctrl+↑/↓ = 선택 스텝 위·아래 이동, Ctrl+←/→ = 들여쓰기 −/+
// contentEditable 셀 클릭 시: 편집 커서는 유지하되 스텝을 자동 선택 상태로 두어 좌측 ● 하이라이트가 이 스텝으로 이동한다.
// Ctrl/Shift 클릭은 기존 다중선택 로직에 그대로 위임.
function _tcCellSelStep(tcid, id, ev){
  try{
    if(ev && (ev.shiftKey||ev.ctrlKey||ev.metaKey)){ tcStepSelect(tcid, id, ev); return; }
    _stepSel=_stepSel||{}; var cur=_stepSel[tcid]||[];
    if(cur.length!==1 || cur[0]!==id){
      _stepSel[tcid]=[id]; _seqSel=_seqSel||{}; _seqSel[tcid]=id;
      // 편집 커서를 잃지 않도록 refresh 대신 좌측 열의 배경만 갱신 (전체 refresh 시 caret 이 날아감)
      var _rows=document.querySelectorAll('[data-sid]');
      _rows.forEach(function(el){ var sid=el.getAttribute('data-sid'); var _selr=(sid===id); el.style.background=_selr?'rgba(45,111,212,0.10)':''; });
    }
    // 클릭한 셀의 <td>에 활성 표시(테두리) — 스프레드시트식 셀 커서
    if(ev && ev.currentTarget){ _tcCellActivate(ev.currentTarget); }
  }catch(_e){}
}
// 활성 셀 시각화 — contentEditable 자식 요소를 받아 부모 <td> 에 tc-cell-active 클래스 부여
function _tcCellActivate(node){
  try{
    var td=node; while(td && td.tagName && td.tagName.toLowerCase()!=='td') td=td.parentElement;
    if(!td) return;
    document.querySelectorAll('td.tc-cell-active').forEach(function(x){ if(x!==td) x.classList.remove('tc-cell-active'); });
    td.classList.add('tc-cell-active');
  }catch(_e){}
}
// contentEditable 셀 focusout(blur) 시 활성 표시 유지: blur만으로는 지우지 않음 — 다음 셀 focusin에서 자동 교체.
// 다만 refresh(tcProcRefresh)로 DOM 재생성되면 클래스가 사라지므로 문제 없음.
if(!window._tcCellFocusInit){ window._tcCellFocusInit=true;
  document.addEventListener('focusin', function(e){
    var el=e.target; if(!el||!el.isContentEditable) return;
    // TC 절차 그리드의 스텝 행(data-sid) 안 셀만 대상 — 다른 화면의 contentEditable 은 건드리지 않음
    try{ if(!el.closest('tr[data-sid]')) return; }catch(_ce){ return; }
    _tcCellActivate(el);
  }, true);
}
// CSS 주입 — 활성 셀에 파란 테두리 (스프레드시트식 셀 커서). 한 번만.
if(!window._tcCellActiveCSS){ window._tcCellActiveCSS=true;
  var _st=document.createElement('style');
  _st.textContent='td.tc-cell-active{outline:2px solid #2d6fd4 !important;outline-offset:-2px;background:rgba(45,111,212,0.06);position:relative;z-index:2;}';
  document.head.appendChild(_st);
}
if(!window._stepCtrlNavInit){ window._stepCtrlNavInit=true;
  document.addEventListener('keydown', function(e){
    if(!(e.ctrlKey||e.metaKey)||e.altKey) return;
    if(e.key!=='ArrowUp'&&e.key!=='ArrowDown'&&e.key!=='ArrowLeft'&&e.key!=='ArrowRight') return;
    var ae=document.activeElement;
    // input/textarea/select 는 편집 우선(내부 조작 여지 큼) — 스텝 이동 스킵.
    // contentEditable(Test Step/CLI 셀)은 Ctrl+방향키로 스텝 이동 허용 — 이 경우 현재 편집을 blur(자동 저장) 하고 이동.
    if(ae){ var tn=(ae.tagName||'').toLowerCase(); if(tn==='input'||tn==='textarea'||tn==='select') return; }
    var tcid=(typeof _activeProcTcid==='function')?_activeProcTcid():null; if(!tcid) return;
    if(!_procViewOn(tcid)) return;
    var tc=tcList.find(function(t){return (t.tcid===tcid)||(t.id===tcid);}); if(!tc||!Array.isArray(tc.checks)) return;
    // 절차 그리드가 활성이면 Coverage(explorer3-beta) TC 이동 리스너로 넘기지 않는다 —
    // 그리드 안에서의 Ctrl+방향키가 Coverage로 새서 좌측 목록의 TC가 바뀌는 문제 방지.
    e.preventDefault(); e.stopPropagation(); if(e.stopImmediatePropagation) e.stopImmediatePropagation();
    // contentEditable 안에서 Ctrl+방향키 → 현재 셀에 대응하는 스텝을 자동으로 선택(선택 없으면) → 편집 blur → 이동
    if(ae && ae.isContentEditable){
      var _sid='';
      try{ var _tr=ae.closest && ae.closest('tr[data-sid]'); if(_tr) _sid=_tr.getAttribute('data-sid')||''; }catch(_ce){}
      if(!_sid && ae.getAttribute){ _sid=ae.getAttribute('data-cliid')||ae.getAttribute('data-descid')||''; }
      if(_sid){
        var _ss=_stepSelIds(tcid);
        if(!_ss.length || _ss.indexOf(_sid)<0){ _stepSel=_stepSel||{}; _stepSel[tcid]=[_sid]; _seqSel=_seqSel||{}; _seqSel[tcid]=_sid; }
      }
      try{ ae.blur(); }catch(_be){}
    }
    var ids=_stepSelIds(tcid); if(!ids.length) return;   // 선택된 스텝 없으면 이동만 스킵(이벤트는 이미 삼킴)
    if(e.key==='ArrowUp') tcStepMoveSel(tcid,-1);
    else if(e.key==='ArrowDown') tcStepMoveSel(tcid,1);
    else if(e.key==='ArrowRight') tcStepIndentSel(tcid,1);
    else if(e.key==='ArrowLeft') tcStepIndentSel(tcid,-1);
  }, true);
}
async function tcStepMoveSel(tcid,dir){
  var tc=tcList.find(function(t){return (t.tcid===tcid)||(t.id===tcid);}); if(!tc||!Array.isArray(tc.checks))return;
  var ids=_stepSelIds(tcid); if(!ids.length)return; var a=tc.checks;
  var cur=ids[ids.length-1]; var idx=a.findIndex(function(c){return c.id===cur;}); if(idx<0)return;
  var ni=idx+dir;
  while(ni>=0&&ni<a.length){ var kk=a[ni].kind||'cli'; if(kk!=='model'&&kk!=='proc') break; ni+=dir; }   // 섹션 헤더(model/proc) 건너뜀
  if(ni<0||ni>=a.length)return;
  _tcSnapshot(tcid);
  var t=a[idx]; a[idx]=a[ni]; a[ni]=t;
  await saveTCFile(tc); tcProcRefresh(tcid);
  setTimeout(function(){ var el=document.querySelector('[data-sid="'+cur+'"]'); if(el&&el.scrollIntoView)el.scrollIntoView({block:'nearest'}); },10);
}
async function tcStepIndentSel(tcid,delta){
  var tc=tcList.find(function(t){return (t.tcid===tcid)||(t.id===tcid);}); if(!tc||!Array.isArray(tc.checks))return;
  var ids=_stepSelIds(tcid); if(!ids.length)return;
  _tcSnapshot(tcid); var any=false;
  ids.forEach(function(id){ var c=tc.checks.find(function(x){return x.id===id;}); if(c){ var ov=(parseInt(c.indent,10)||0); var v=ov+delta; if(v<0)v=0; if(v>10)v=10; if(v!==ov){ c.indent=v; any=true; } } });
  if(any){ await saveTCFile(tc); tcProcRefresh(tcid); }
  else if(typeof showToast==='function'){ showToast(delta<0?'더 이상 내어쓸 수 없음':'더 이상 들여쓸 수 없음'); }
}
// Test Data 셀(여백 포함) 클릭 → 안의 입력칸으로 즉시 포커스 + 행 선택(재렌더) 차단 → '한 번 더 눌러야' 문제 해결
function _tcFocusCell(td, ev){ try{ if(ev){ ev.stopPropagation(); } var el=td.querySelector('input,textarea,[contenteditable="true"]'); if(el && el!==document.activeElement){ el.focus(); if(el.isContentEditable){ try{ var r=document.createRange(); r.selectNodeContents(el); r.collapse(false); var s=window.getSelection(); s.removeAllRanges(); s.addRange(r); }catch(e){} } } }catch(e){} }
function tcStepSelect(tcid,id,ev){
  // 셀(Test Steps/Test Data/Expected) 안에서 텍스트를 드래그 선택 중이면 행 선택으로 가로채지 않음 → 선택 해제 방지
  try{ if(ev && !ev.shiftKey && !ev.ctrlKey && !ev.metaKey && window.getSelection){ const _s=String(window.getSelection()||''); if(_s.trim().length>0){ const _ae=document.activeElement; if(_ae && (_ae.isContentEditable || _ae.tagName==='INPUT' || _ae.tagName==='TEXTAREA')) return; } } }catch(e){}
  if(ev&&ev.shiftKey){ try{ev.preventDefault();}catch(e){} try{const s=window.getSelection&&window.getSelection(); if(s)s.removeAllRanges();}catch(e){} }
  _stepSel=_stepSel||{};
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); const checks=(tc&&tc.checks)||[];
  const shift=!!(ev&&ev.shiftKey); const ctrl=!!(ev&&(ev.ctrlKey||ev.metaKey));
  if(shift && _stepAnchor[tcid]){
    const ai=checks.findIndex(c=>c.id===_stepAnchor[tcid]); const bi=checks.findIndex(c=>c.id===id);
    if(ai>=0&&bi>=0){ const lo=Math.min(ai,bi),hi=Math.max(ai,bi); _stepSel[tcid]=checks.slice(lo,hi+1).map(c=>c.id); }
    else { _stepSel[tcid]=[id]; _stepAnchor[tcid]=id; }
  } else if(ctrl){
    const a=Array.isArray(_stepSel[tcid])?_stepSel[tcid]:(_stepSel[tcid]=[]); const i=a.indexOf(id); if(i>=0)a.splice(i,1); else a.push(id); _stepAnchor[tcid]=id;
  } else {
    // 조건2: 이미 단독 선택된 같은 스텝을 다시 누르면 선택 해제(토글)
    if(Array.isArray(_stepSel[tcid]) && _stepSel[tcid].length===1 && _stepSel[tcid][0]===id){ _stepSel[tcid]=[]; }
    else { _stepSel[tcid]=[id]; }
    _stepAnchor[tcid]=id;
  }
  tcProcRefresh(tcid);   // 번호/행 클릭 = 라인 선택(강조)만 — 상세 패널은 펼침 ˅ 버튼으로 토글
}
// 펼침 ˅ 버튼 = 그 스텝의 세부내역(상세 패널) 인라인 펴기/접기 (선택과 독립)
function tcStepDetailToggle(tcid,id){ _respStepId=_respStepId||{}; if(_respStepId[tcid]===id){ _respStepId[tcid]=''; } else { _respSel[tcid]=undefined; _pendingSub[tcid]=''; _respStepId[tcid]=id; _stepDetailTab[tcid]=_stepDetailTab[tcid]||'response'; } tcProcRefresh(tcid); }
let _stepDrag=null; // 조건3: 번호 드래그 선택
function tcStepDragStart(ev,tcid,id){
  if(ev && ev.button!==0){ // 우클릭/가운데 클릭: 선택 변경 없이 컨텍스트 메뉴 — 다중 선택 유지(일괄 Skip/Breakpoint)
    if(_stepSelIds(tcid).indexOf(id)<0){ tcStepSelect(tcid,id,null); } // 선택 밖을 우클릭하면 그 스텝만
    return;
  }
  if(ev&&(ev.shiftKey||ev.ctrlKey||ev.metaKey)){ tcStepSelect(tcid,id,ev); return; } // Shift/Ctrl 클릭은 기존 동작
  if(ev) try{ev.preventDefault();}catch(e){}
  _stepDrag={tcid:tcid, from:id};
  tcStepSelect(tcid,id,null); // 단일 선택 + 부가 처리(응답 탭 등) — 드래그 시작점
  document.addEventListener('mouseup', tcStepDragEnd);
}
function tcStepDragOver(tcid,id){
  if(!_stepDrag||_stepDrag.tcid!==tcid) return;
  if(_stepDrag.from===id) return; // 같은 스텝(리렌더 후 mouseenter/미세 이동) = 드래그 아님 → 클릭 토글 보존
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); const checks=(tc&&tc.checks)||[];
  const ai=checks.findIndex(c=>c.id===_stepDrag.from); const bi=checks.findIndex(c=>c.id===id);
  if(ai<0||bi<0) return;
  const lo=Math.min(ai,bi),hi=Math.max(ai,bi); const ids=checks.slice(lo,hi+1).map(c=>c.id);
  _stepSel[tcid]=ids; _stepAnchor[tcid]=_stepDrag.from; _tcDragPaint(ids);
}
function _tcDragPaint(ids){ try{ document.querySelectorAll('tr[data-sid]').forEach(tr=>{ const on=ids.indexOf(tr.getAttribute('data-sid'))>=0; tr.style.outline=on?'2px solid #2d6fd4':''; tr.style.outlineOffset=on?'-2px':''; tr.querySelectorAll('td').forEach(td=>{ if(on){ td.style.setProperty('background','rgba(45,111,212,0.34)','important'); } else { td.style.removeProperty('background'); } }); }); }catch(e){} } // 드래그 강조는 Skip/Breakpoint 색보다 우선(!important)
function tcStepDragEnd(){ const d=_stepDrag; _stepDrag=null; document.removeEventListener('mouseup', tcStepDragEnd); if(d) tcProcRefresh(d.tcid); }
function tcStepMoveSel(tcid,dir){ const ids=_stepSelIds(tcid); if(ids.length!==1){ showToast('이동은 스텝 1개만 선택하세요'); return; } tcStepMove(tcid,ids[0],dir); }
async function tcSwitchSet(tcid,id,ci,field,val){ const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc) return; const c=(tc.checks||[]).find(x=>x.id===id); if(!c||!Array.isArray(c.cases)||!c.cases[ci]) return; c.cases[ci][field]=val; await saveTCFile(tc); }
async function tcSwitchAdd(tcid,id){ const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc) return; const c=(tc.checks||[]).find(x=>x.id===id); if(!c) return; c.cases=Array.isArray(c.cases)?c.cases:[]; c.cases.push({when:'',goto:''}); await saveTCFile(tc); tcProcRefresh(tcid); }
function _switchElseHtml(tcid,c){
  var end=(String(c.gotoElse||'').trim()==='__END__');
  var inner = end
    ? '<span style="color:#e53e5a;font-weight:700;">🛑 시험 종료</span><i class="ti ti-x" onclick="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'gotoElse\',\'\')" title="취소(단계 점프로)" style="font-size:12px;color:#ccc;cursor:pointer;margin-left:4px;"></i>'
    : '<input value="'+String(c.gotoElse||'').replace(/"/g,'&quot;')+'" onblur="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'gotoElse\',this.value)" placeholder="단계(선택)" style="width:96px;border:none;border-bottom:1px dashed #f0b8c0;background:transparent;outline:none;"><button onclick="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'gotoElse\',\'__END__\')" title="일치 case 없으면 시험 종료" style="font-size:10px;padding:1px 6px;border:1px solid #f0b8c0;border-radius:4px;background:#fff;color:#e53e5a;cursor:pointer;margin-left:3px;">🛑 종료</button>';
  return '<div style="display:flex;align-items:center;gap:4px;font-size:11px;margin-left:20px;"><span style="color:var(--text3);">else →</span>'+inner+'</div>';
}
async function tcSwitchDel(tcid,id,ci){ const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc) return; const c=(tc.checks||[]).find(x=>x.id===id); if(!c||!Array.isArray(c.cases)) return; c.cases.splice(ci,1); await saveTCFile(tc); tcProcRefresh(tcid); }
async function tcStepIndentSel(tcid,dir){ const ids=_stepSelIds(tcid); if(!ids.length){ showToast('스텝을 먼저 선택하세요 (● 클릭)'); return; } const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc) return; (tc.checks||[]).forEach(c=>{ if(ids.indexOf(c.id)>=0) c.indent=Math.max(0,Math.min(4,(parseInt(c.indent)||0)+dir)); }); await saveTCFile(tc); tcProcRefresh(tcid); }function _cloneCheck(c){ const nc=JSON.parse(JSON.stringify(c)); nc.id='ck'+Date.now()+Math.floor(Math.random()*1000000); nc.output=''; nc.repeatResult=''; delete nc.executed_at; return nc; }// 아래로 채우기: 이 스텝 값을 아래의 CLI 스텝들에 복사 (mode: 'all'=전체 / 'crit'=판정만 / 'cli'=명령만)async function tcStepsCopySel(tcid){ const ids=_stepSelIds(tcid); if(!ids.length){ showToast('복사할 스텝을 선택하세요 (● 클릭)'); return; } const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc) return; const out=[]; (tc.checks||[]).forEach(c=>{ out.push(c); if(ids.indexOf(c.id)>=0) out.push(_cloneCheck(c)); }); tc.checks=out; _stepSel[tcid]=[]; await saveTCFile(tc); tcProcRefresh(tcid); showToast(ids.length+'개 스텝 복사됨'); }function tcSeqSelect(tcid,id){ _seqSel=_seqSel||{}; _seqSel[tcid]=id; tcProcRefresh(tcid); }function tcCkToggle2(tcid,id){ _ckCollapsed[id]=(_ckCollapsed[id]===true)?false:true; tcProcRefresh(tcid); }
let _runLog={};
let _runElapsed={};
function _logRec(tcid,e){ _runLog=_runLog||{}; (_runLog[tcid]=_runLog[tcid]||[]).push(e); try{ _logAppend(tcid); }catch(_){} }
function _logLiveUpdate(tcid){
  // 같은 tcid 의 Console 컨테이너가 여러 위치(3열 상세 + 팝업)에 존재할 수 있으므로 모두 갱신
  var els=document.querySelectorAll('[id="tc-console-body-'+tcid+'"]');
  var html=_execLog(tcid);
  els.forEach(function(el){ el.innerHTML=html; el.scrollTop=el.scrollHeight; });
}
// 상단 진행 상태 배너: 단계 · 합격/불합격 : 장비명 (실행 중 깜빡임 + 총 소요)
function _procProgBanner(tcid){
  const e=(_runElapsed&&_runElapsed[tcid])?_runElapsed[tcid]:null;
  const running=!!(e&&e.start&&e.sec==null);
  if(!running) return '';
  return ''; // 상단 배너 미사용 — 진행 표시는 헤더(_procRunningHead)로 이동
}
// TC 상세 헤더(제목 우측)에 표시할 진행 상태: 실행 중 블링크 / 완료 시 요약
function _procRunningHead(tcid){
  const e=(_runElapsed&&_runElapsed[tcid])?_runElapsed[tcid]:null;
  if(!e||!e.start) return '';
  const log=(_runLog&&Array.isArray(_runLog[tcid]))?_runLog[tcid]:[];
  let pass=0,fail=0; log.forEach(x=>{ if(x.status==='Pass')pass++; else if(x.status==='Fail')fail++; });
  if(e.sec==null) return '<span class="llm-running" style="color:#e53e5a;font-size:13px;background:rgba(229,62,90,0.08);border:1px solid rgba(229,62,90,0.3);border-radius:8px;padding:5px 14px;font-weight:700;"><i class="ti ti-player-play-filled" style="font-size:12px;"></i> 전체 실행 중…</span>';
  return '<span style="display:flex;align-items:center;gap:10px;font-size:12.5px;font-weight:700;"><span style="color:#2d6fd4;"><i class="ti ti-clock"></i> '+e.sec.toFixed(1)+'초</span><span style="color:#00875a;">합격 '+pass+'</span><span style="color:#d12d49;">불합격 '+fail+'</span></span>';
}
// ② 헤더 토스트 슬롯: 최근 실행 단계 결과를 토스트 칩으로// 헤더 진행바: ① 실행중표시 + ② 토스트표시
function _procHeadBar(tcid){
  return '';   // ②③ 헤더 진행바 미사용 — 진행/PASS/FAIL은 상태 열(스텝별)로 표시
}
// 상태 열(스텝별) 셀 — 진행중 / 합격 / 불합격 / 미실행
function _stCellInner(c, running){
  // running 파라미터 명시적으로 true 이거나, 지금 실행 중인 스텝 id 와 일치하면 진행중 표시
  // (tcProcRefresh 로 그리드가 재렌더되어도 진행중 상태가 유지되도록)
  if(running || (c && c.id && window._tcCurExecCkid===c.id)) return '<span style="display:inline-flex;align-items:center;gap:3px;white-space:nowrap;font-size:10px;font-weight:700;color:#2d6fd4;"><i class="ti ti-loader-2 spin" style="font-size:11px;"></i> 진행중</span>';
  var r=c&&c.repeatResult; var _ran=(r==='실행완료'||r==='실행'||r==='완료'); var col=r==='Pass'?'#00a872':r==='Fail'?'#e53e5a':_ran?'#16a34a':'#9aa1ad';
  return '<span style="display:inline-flex;align-items:center;gap:3px;white-space:nowrap;font-size:10px;font-weight:700;color:'+col+';"><span style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:'+col+';"></span>'+(r==='Pass'?'합격':r==='Fail'?'불합격':_ran?'실행완료':'미실행')+'</span>';
}
function _stCellRunning(ckid){ window._tcCurExecCkid=ckid; var el=document.getElementById('stcell-'+ckid); if(el) el.innerHTML=_stCellInner(null,true); try{ if(typeof _cbBridgeRunStep==='function' && typeof _cycleLiveCtx!=='undefined' && _cycleLiveCtx) _cbBridgeRunStep(ckid); }catch(_be){} }
function _stCellDone(tcid,ckid){ if(window._tcCurExecCkid===ckid) window._tcCurExecCkid=null; var el=document.getElementById('stcell-'+ckid); if(!el)return; var tc=tcList.find(function(t){return (t.tcid===tcid)||(t.id===tcid);}); var c=tc&&(tc.checks||[]).find(function(x){return x.id===ckid;}); if(c) el.innerHTML=_stCellInner(c,false); }
function _logRowHtml(e, ri){
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const kind=e.kind||'cli';
  const ic=kind==='comment'?{x:'💬',c:'#b07d00'}:kind==='group'?{x:'📁',c:'#6d28d9'}:(kind==='loop'||kind==='loopit')?{x:'🔁',c:'#6d28d9'}:kind==='switch'?{x:'🔀',c:'#c2334d'}:kind==='wait'?{x:'⏱',c:'#c2690a'}:kind==='call'?{x:'↪',c:'#0784b5'}:{x:'›',c:'#00875a'};
  const sv=e.status==='Pass'?{t:'합격',c:'#00875a'}:e.status==='Fail'?{t:'불합격',c:'#d12d49'}:e.status==='running'?{t:'실행중',c:'#c2690a'}:e.status==='skip'?{t:'건너뜀',c:'#7a808f'}:e.status==='info'?{t:'',c:''}:{t:'완료',c:'#4a5060'};
  const rowbg=e.status==='Fail'?'background:rgba(229,62,90,0.07);':kind==='comment'?'background:rgba(224,168,0,0.06);':(kind==='group'||kind==='loop')?'background:rgba(124,58,237,0.05);':(kind==='loopit'||kind==='switch')?'background:#eef1f8;':((ri%2)?'background:#f3f5f9;':'background:#ffffff;');
  let out='';
  if(e.output&&kind!=='comment'){ const lines=String(e.output).split(/\r?\n/).filter(l=>l.trim()).slice(0,1000); if(lines.length) out='<tr><td style="border-bottom:1px solid #eef0f3;"></td><td colspan="3" style="padding:2px 9px 6px 22px;border-bottom:1px solid #eef0f3;"><div style="font-family:Consolas,\'Cascadia Mono\',\'D2Coding\',\'Courier New\',monospace;font-size:13px;font-weight:500;letter-spacing:0.1px;background:#f6f8fc;color:#11182b;border:1px solid #e6eaf2;padding:7px 10px;border-radius:5px;white-space:pre-wrap;line-height:1.55;">'+lines.map(esc).join('\n')+'</div></td></tr>'; }
  var protoBadge='';
  if(e.proto&&kind==='cli'){ var _pc=e.proto==='TELNET'?'#c2690a':'#2d6fd4'; protoBadge='<span style="font-size:9.5px;font-weight:700;color:'+_pc+';background:'+_pc+'18;border:1px solid '+_pc+'44;border-radius:4px;padding:1px 5px;margin-right:4px;letter-spacing:0.3px;">'+e.proto+'</span>'; }
  return '<tr style="'+rowbg+'border-bottom:1px solid #eef0f3;">'
    +'<td style="padding:3px 9px;font-family:ui-monospace,monospace;font-size:11px;color:#1d2128;font-weight:600;white-space:nowrap;">'+(e.t||'')+'</td>'
    +'<td style="padding:3px 6px;font-size:11px;color:#10131a;font-weight:800;text-align:center;white-space:nowrap;">'+esc(e.label||'')+'</td>'
    +'<td style="padding:2px 9px;font-family:inherit;font-size:11px;color:#10131a;font-weight:500;max-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+protoBadge+'<span style="color:'+ic.c+';font-weight:700;">'+ic.x+'</span> <span style="font-family:inherit;">'+esc(e.name||'')+'</span>'+(e.criteria?'<span style="color:#3f4654;font-size:10.5px;"> · '+esc(e.criteria)+'</span>':'')+'</td>'
    +'<td style="padding:3px 9px;text-align:center;white-space:nowrap;">'+(sv.t?'<span style="font-size:10.5px;font-weight:700;color:'+sv.c+';background:'+sv.c+'1f;padding:2px 9px;border-radius:10px;">'+sv.t+'</span>':'')+'</td>'
  +'</tr>'+out;
}
function _logAppend(tcid){
  const log=(_runLog&&_runLog[tcid])||[]; if(!log.length) return;
  // 3열 + 팝업 등 여러 위치에 같은 tcid 의 tbody 가 있을 수 있음 → 모두 갱신
  const tbs=document.querySelectorAll('[id="tc-log-tbody-'+tcid+'"]');
  if(!tbs.length){ _logLiveUpdate(tcid); return; }
  const ri=log.length-1;
  const rowHtml=_logRowHtml(log[ri], ri);
  tbs.forEach(function(tb){ tb.insertAdjacentHTML('beforeend', rowHtml); });
  let pass=0,fail=0; log.forEach(x=>{ if(x.status==='Pass')pass++; else if(x.status==='Fail')fail++; });
  document.querySelectorAll('[id="tc-log-cnt-'+tcid+'"]').forEach(function(el){ el.textContent=log.length+'건'; });
  document.querySelectorAll('[id="tc-log-pass-'+tcid+'"]').forEach(function(el){ el.textContent='합격 '+pass; });
  document.querySelectorAll('[id="tc-log-fail-'+tcid+'"]').forEach(function(el){ el.textContent='불합격 '+fail; });
  document.querySelectorAll('[id="tc-console-body-'+tcid+'"]').forEach(function(body){ body.scrollTop=body.scrollHeight; });
}
// 실행 로그 렌더 창(창 크기): 접속·화면 이동 시마다 50 로 리셋, 사용자가 [더 보기] 눌러 확장 (전역 변수, tcid별로 관리 X — 화면 이동 시 자동 리셋)
var _execLogLimit=50;
// 실행 로그 상태 필터 (tcid별): '' = 전체, 'Pass' = 합격만, 'Fail' = 불합격만
var _execLogFilter={};
function tcExecLogMore(tcid, add){ _execLogLimit+=(parseInt(add,10)||50); var el=document.getElementById('tc-console-body-'+tcid); if(el){ el.innerHTML=_execLog(tcid); el.scrollTop=el.scrollHeight; } }
function tcExecLogAll(tcid){ _execLogLimit=999999; var el=document.getElementById('tc-console-body-'+tcid); if(el) el.innerHTML=_execLog(tcid); }
// 합격/불합격 뱃지 클릭 → 필터 토글. 같은 값 재클릭 시 해제.
function tcExecLogToggleFilter(tcid, kind){
  var cur=_execLogFilter[tcid]||'';
  _execLogFilter[tcid]=(cur===kind?'':kind);
  var el=document.getElementById('tc-console-body-'+tcid);
  if(el) el.innerHTML=_execLog(tcid);
}
function _execLog(tcid){
  const log=(_runLog&&Array.isArray(_runLog[tcid]))?_runLog[tcid]:[];
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  let pass=0,fail=0; log.forEach(e=>{ if(e.status==='Pass')pass++; else if(e.status==='Fail')fail++; });
  const _tesc=String(tcid).replace(/\\/g,"\\\\").replace(/'/g,"\\'");
  // 필터 뱃지: 활성 상태면 배경/외곽선 강조 + × 표시
  const _flt=_execLogFilter[tcid]||'';
  const _passActive=(_flt==='Pass');
  const _failActive=(_flt==='Fail');
  const _passStyle='cursor:pointer;font-size:11px;font-weight:700;padding:2px 9px;border-radius:12px;border:1.5px solid #00875a;'+(_passActive?'background:#00875a;color:#fff;':'background:#fff;color:#00875a;');
  const _failStyle='cursor:pointer;font-size:11px;font-weight:700;padding:2px 9px;border-radius:12px;border:1.5px solid #d12d49;'+(_failActive?'background:#d12d49;color:#fff;':'background:#fff;color:#d12d49;');
  const _passSpan='<span id="tc-log-pass-'+tcid+'" onclick="tcExecLogToggleFilter(\''+_tesc+'\',\'Pass\')" title="합격만 보기 (다시 클릭 해제)" style="'+_passStyle+'">합격 '+pass+(_passActive?' ×':'')+'</span>';
  const _failSpan='<span id="tc-log-fail-'+tcid+'" onclick="tcExecLogToggleFilter(\''+_tesc+'\',\'Fail\')" title="불합격만 보기 (다시 클릭 해제)" style="'+_failStyle+'">불합격 '+fail+(_failActive?' ×':'')+'</span>';
  const head='<div style="display:flex;align-items:center;gap:8px;background:#eef1f5;padding:7px 12px;border-bottom:1px solid #cfd4dc;"><i class="ti ti-bell" style="color:var(--blue);"></i><b style="font-size:12px;color:var(--text);">실행 로그</b><span id="tc-log-cnt-'+tcid+'" style="font-size:10px;color:var(--text3);">'+log.length+'건'+(_flt?(' · '+_flt+' 필터중'):'')+'</span>'+((_runElapsed&&_runElapsed[tcid]&&_runElapsed[tcid].sec!=null)?'<span style="font-size:11px;color:#2d6fd4;font-weight:700;background:rgba(45,111,212,0.12);border-radius:8px;padding:2px 9px;"><i class="ti ti-clock" style="font-size:12px;vertical-align:middle;"></i> 총 소요 '+_runElapsed[tcid].sec.toFixed(1)+'초</span>':'')+'<span style="flex:1;"></span>'+_passSpan+_failSpan+(log.length?('<button onclick="tcCheckClearLog(\''+_tesc+'\')" title="현재 Console 로그 지우기 (History에 저장된 실행 기록은 유지)" style="background:#fff;color:#6b7280;border:1px solid #cfd4dc;border-radius:6px;padding:2px 8px;font-size:10.5px;font-weight:600;cursor:pointer;"><i class="ti ti-trash" style="font-size:11px;vertical-align:middle;"></i> 지우기</button>'):'')+'</div>';
  if(!log.length) return '<div style="border:1px solid #cfd4dc;border-radius:9px;overflow:hidden;">'+head+'<div style="padding:22px;text-align:center;color:var(--text3);font-size:12px;">[전체 실행] 하면 <b>모든 스텝 과정</b>(주석·단계·반복·명령·결과)이 시간순으로 기록됩니다.</div></div>';
  // ★ 필터 적용: Pass/Fail 만 표시하도록 원본 log 배열 자르기
  const _filtered=_flt?log.filter(function(e){return e && e.status===_flt;}):log;
  if(!_filtered.length){
    return '<div style="border:1px solid #cfd4dc;border-radius:9px;overflow:hidden;">'+head
      +'<div style="padding:22px;text-align:center;color:var(--text3);font-size:12px;">'+_flt+' 상태의 로그가 없습니다. <span onclick="tcExecLogToggleFilter(\''+_tesc+'\',\''+_flt+'\')" style="color:var(--blue);cursor:pointer;text-decoration:underline;">필터 해제</span></div></div>';
  }
  // 최근 _execLogLimit 개만 렌더 (뒤에서부터). 이전 로그는 [더 보기] 버튼으로 확장.
  const _total=_filtered.length;
  const _from=Math.max(0, _total - _execLogLimit);
  const _hidden=_from;
  const _more=(_hidden>0)?('<div style="padding:9px 12px;background:#fafbfc;border-bottom:1px solid #eef0f3;text-align:center;font-size:11.5px;color:var(--text3);">↑ 이전 <b style="color:#2d6fd4;">'+_hidden+'</b>건 숨김 <button onclick="tcExecLogMore(\''+_tesc+'\',50)" style="margin-left:8px;font-size:11px;padding:2px 10px;border:1px solid #cfd6e8;border-radius:6px;background:#fff;color:#2d6fd4;cursor:pointer;font-weight:700;">50개 더 보기</button>'+(_hidden>50?(' <button onclick="tcExecLogAll(\''+_tesc+'\')" style="margin-left:4px;font-size:11px;padding:2px 10px;border:1px solid #cfd6e8;border-radius:6px;background:#fff;color:#7c3aed;cursor:pointer;font-weight:700;">전체('+_total+')</button>'):'')+'</div>'):'';
  const _slice=_filtered.slice(_from);
  const rows=_slice.map((e,ri)=>_logRowHtml(e,_from+ri)).join('');
  return '<div style="border:1px solid #cfd4dc;border-radius:9px;overflow:hidden;">'+head+_more
    +'<div id="exec-log-body-'+tcid+'" style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;table-layout:fixed;"><colgroup><col style="width:74px;"><col style="width:44px;"><col><col style="width:74px;"></colgroup>'
    +'<thead><tr style="position:sticky;top:0;background:#fafbfc;z-index:1;"><th style="padding:4px 9px;text-align:left;font-size:10.5px;font-weight:700;color:#363b47;border-bottom:1px solid #c4cad3;">시각</th><th style="padding:4px 6px;font-size:10.5px;font-weight:700;color:#363b47;border-bottom:1px solid #c4cad3;">단계</th><th style="padding:4px 9px;text-align:left;font-size:10.5px;font-weight:700;color:#363b47;border-bottom:1px solid #c4cad3;">내용</th><th style="padding:4px 9px;font-size:10.5px;font-weight:700;color:#363b47;border-bottom:1px solid #c4cad3;">결과</th></tr></thead>'
    +'<tbody id="tc-log-tbody-'+tcid+'">'+rows+'</tbody></table></div></div>';
}
// ── History (실행 스냅샷) ──────────────────────────────────────────────
// _runHistory[tcid] = [{at, sec, pass, fail, log:[...], aborted, user}], 최근 실행이 배열 앞쪽.
// 서버 저장으로 전환 → 모든 사용자가 공유. 최초 조회 시 서버에서 로드하여 캐시.
let _runHistory={};
let _runHistoryLoaded={};   // tcid → true (서버 로드 완료 여부)
let _runHistoryOpen={};
async function _loadRunHistoryFromServer(tcid){
  if(_runHistoryLoaded[tcid]) return;
  _runHistoryLoaded[tcid]=true;   // 중복 요청 방지 (즉시 세팅)
  try{
    // cache:'no-store' — 브라우저 캐시 강제 우회. 삭제 직후 재fetch 가 옛 캐시를 되돌리는 상황 방지.
    var r=await fetch('/api/tc/'+_tcUrl(tcid)+'/run-history',{cache:'no-store'});
    if(r.ok){
      var d=await r.json();
      if(d&&d.ok){
        _runHistory[tcid]=d.history||[];
        // 상단 History 탭 배지("3") 와 body 를 모두 갱신 — 상세 카드(tc3-detail-*)를 통째로 재렌더.
        try{ if(typeof _forceRerenderHistory==='function') _forceRerenderHistory(tcid); }catch(_re){}
      } else {
        _runHistoryLoaded[tcid]=false;   // 실패 시 다음 호출에 재시도
      }
    } else {
      _runHistoryLoaded[tcid]=false;
    }
  }catch(_e){ _runHistoryLoaded[tcid]=false; }
}
function _saveRunHistory(tcid){ /* 서버 저장으로 대체 — 개별 항목은 POST 시 서버가 반영 */ }
function _tcRefreshHistoryPane(tcid){
  // History 는 상단 Issue 옆 탭으로 이동됨. 활성 중이면 그 바디만 즉시 재렌더, 아니면 전체 재렌더로 배지도 갱신.
  try{
    var _topH=document.getElementById('tc3-tabcontent-'+tcid);
    if(_topH && window['tcActiveTab_'+tcid]==='history' && typeof _execHistory==='function'){
      _topH.innerHTML='<div>'+_execHistory(tcid)+'</div>';
    }
    // 하단 Console 은 History 갱신과 무관 — 편집중 blur 부작용 피하려 건드리지 않음.
    if(typeof tcProcRefresh==='function') tcProcRefresh(tcid);
  }catch(_e){}
}
// 자신이 방금 삭제한 항목에 대한 WS 자기-에코를 스킵 → 서버 재fetch 경합으로 옛 데이터 되살아나는 버그 방지
var _tcHistSelfDel={};
async function tcRunHistoryClear(tcid){
  if(!(_runHistory&&_runHistory[tcid]&&_runHistory[tcid].length)){ showToast('삭제할 History가 없습니다'); return; }
  var ok=(typeof utopConfirm==='function')
    ? await utopConfirm({title:'이 TC의 실행 History 전체를 삭제할까요?',message:'모든 사용자에게 반영됩니다. 되돌릴 수 없어요.',confirmText:'전체 삭제',tone:'danger',icon:'ti-history'})
    : confirm('이 TC의 실행 History 전체를 삭제할까요? (모든 사용자에게 반영됩니다)');
  if(!ok) return;
  _tcHistSelfDel[tcid]=Date.now();
  _runHistory[tcid]=[];
  _forceRerenderHistory(tcid);   // 즉시 반영 (모든 컨테이너)
  try{
    var r=await fetch('/api/tc/'+_tcUrl(tcid)+'/run-history?idx=-1',{method:'DELETE'});
    if(!r.ok) throw new Error('HTTP '+r.status);
  }catch(_e){
    // 서버 삭제 실패 → 다음 재로드에서 회복. 사용자에겐 소프트 알림.
    if(typeof showToast==='function') showToast('삭제 요청 실패 — 서버 상태 확인 필요');
    delete _tcHistSelfDel[tcid];
    _runHistoryLoaded[tcid]=false; await _loadRunHistoryFromServer(tcid);
    return;
  }
  showToast('🗑 History 삭제됨');
  _forceRerenderHistory(tcid);
  setTimeout(function(){ delete _tcHistSelfDel[tcid]; }, 3000);   // 자기 에코 무시 창 3초
}
async function tcRunHistoryDel(tcid, idx){
  if(!(_runHistory&&_runHistory[tcid]&&_runHistory[tcid][idx])) return;
  _tcHistSelfDel[tcid]=Date.now();
  _runHistory[tcid].splice(idx,1);
  // 서버 완료 대기 없이 즉시 화면에 반영. 자기-에코 WS 는 _tcHistSelfDel 창으로 스킵.
  _forceRerenderHistory(tcid);
  try{
    var r=await fetch('/api/tc/'+_tcUrl(tcid)+'/run-history?idx='+idx,{method:'DELETE'});
    if(!r.ok) throw new Error('HTTP '+r.status);
  }catch(_e){
    if(typeof showToast==='function') showToast('삭제 요청 실패 — 서버 상태 확인 필요');
    delete _tcHistSelfDel[tcid];
    _runHistoryLoaded[tcid]=false; await _loadRunHistoryFromServer(tcid);
    return;
  }
  _forceRerenderHistory(tcid);
  setTimeout(function(){ delete _tcHistSelfDel[tcid]; }, 3000);
}
// History 화면 강제 재렌더 — 상단 Issue 옆 History 탭 body 와 카운트 배지("3") 모두 갱신.
// 배지는 tcBuildDetail 안 tabs 배열에서 _runHistory[tcid].length 로 매번 재계산되므로,
// tc3-detail-* 컨테이너(=상세 카드 전체=탭바+body) 을 그대로 재렌더하면 배지가 새 개수로 반영된다.
function _forceRerenderHistory(tcid){
  try{
    var _tc=(typeof tcList!=='undefined'&&Array.isArray(tcList))?tcList.find(function(t){return (t.tcid===tcid)||(t.id===tcid);}):null;
    // 3열 상세 컨테이너 (#e3-detail) — 팝업이 열려있으면 팝업 body 안, 아니면 3열 페이지 안. 어느쪽이든 e3RenderDetail 호출.
    var _e3d=document.getElementById('e3-detail');
    if(_e3d){
      // 팝업에서 열려있는 경우엔 그 tcid 로 (window._cbTcPopupTid), 아니면 현재 e3SelTc.
      var _tid=(typeof window._cbTcPopupTid==='string'&&window._cbTcPopupTid)?window._cbTcPopupTid:tcid;
      try{ if(typeof e3RenderDetail==='function') e3RenderDetail(_tid); }catch(_e){}
    }
    // Beta 3열 상세
    var _ebd=document.getElementById('e3b-detail');
    if(_ebd){ try{ if(typeof e3bRenderDetail==='function' && typeof e3bSelTc!=='undefined' && e3bSelTc===tcid) e3bRenderDetail(tcid); }catch(_e){} }
    // 예전 tc3-detail-* 컨테이너 (tcList 카드 형태) — 아직 남아있으면 tcBuildDetail 로 재렌더
    var _all=document.querySelectorAll('[id="tc3-detail-'+tcid+'"]');
    if(_all && _all.length && _tc){
      for(var i=0;i<_all.length;i++){
        var el=_all[i];
        // #e3-detail 안(이미 위에서 처리됨)이나 팝업 body 안(#e3-detail 로 재사용) 이면 건너뜀
        if(el.closest && (el.closest('#e3-detail') || el.closest('#cb-tc-modal-body'))) continue;
        try{ if(typeof tcBuildDetail==='function') el.innerHTML=tcBuildDetail(_tc); }catch(_e){}
      }
    }
  }catch(_e){}
}
function tcRunHistoryToggle(tcid, idx){ var k=tcid+'::'+idx; _runHistoryOpen[k]=!_runHistoryOpen[k]; try{ tcProcRefresh(tcid); }catch(e){} }
function tcRunHistoryRestore(tcid, idx){ if(!(_runHistory&&_runHistory[tcid]&&_runHistory[tcid][idx])) return; var h=_runHistory[tcid][idx]; _runLog[tcid]=(h.log||[]).slice(); _runElapsed[tcid]={start:Date.now()-((h.sec||0)*1000), sec:h.sec||0}; _procBottomTab[tcid]='console'; showToast('↩ Console에 복원됨 — '+h.at); try{ tcProcRefresh(tcid); }catch(e){} }
// WebSocket 알림 수신: 다른 사용자가 실행 이력을 추가/삭제하면 서버에서 새로 fetch (변경 감지 즉시 반영)
// 단, 자기 자신이 방금 삭제한 것에 대한 에코(_tcHistSelfDel 창 3초)는 스킵 → 삭제→서버fetch 경합으로 옛 데이터 되살아나는 버그 방지
window.tcRunHistoryOnWS=async function(m){
  if(!m||!m.tcid) return;
  if(m.type==='tc_run_history_delete' && _tcHistSelfDel && _tcHistSelfDel[m.tcid]) return;
  _runHistoryLoaded[m.tcid]=false;
  await _loadRunHistoryFromServer(m.tcid);
};
// History 항목을 HTML 리포트로 다운로드 — 새 파일 열면 결과가 스텝별로 정리된 페이지가 뜸.
function tcRunHistoryDownload(tcid, idx){
  try{
    var h=(_runHistory&&_runHistory[tcid]&&_runHistory[tcid][idx])||null;
    if(!h){ if(typeof showToast==='function')showToast('이력을 찾을 수 없습니다'); return; }
    var tc=tcList.find(function(t){return (t.tcid||t.id)===tcid;});
    var _e=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');};
    var _tcName=(tc&&tc.name)||tcid;
    var _pass=h.pass||0, _fail=h.fail||0, _all=(h.log||[]).length;
    var _rows=(h.log||[]).map(function(e){
      var _st=String(e.status||'');
      var _stCol=_st==='Pass'?'#00a872':_st==='Fail'?'#e53e5a':_st==='skip'?'#94a3b8':_st==='완료'?'#2d6fd4':'#6b7280';
      var _stBg=_st==='Pass'?'#e6f7ec':_st==='Fail'?'#fdecec':_st==='skip'?'#f1f4f8':_st==='완료'?'#e7f0fd':'#f4f5f7';
      var _stLbl=_st==='Pass'?'합격':_st==='Fail'?'불합격':_st;
      return '<tr>'
        +'<td style="padding:6px 10px;color:#6b7280;font-family:ui-monospace,monospace;font-size:11.5px;white-space:nowrap;">'+_e(e.t||'')+'</td>'
        +'<td style="padding:6px 10px;color:#6b7280;font-family:ui-monospace,monospace;font-size:11.5px;text-align:center;white-space:nowrap;">'+_e(e.label||'')+'</td>'
        +'<td style="padding:6px 10px;color:#1c2030;font-size:12.5px;">'+_e(e.name||'')+(e.criteria?('<div style="color:#6b7280;font-size:11px;margin-top:2px;">기준: '+_e(e.criteria)+'</div>'):'')+'</td>'
        +'<td style="padding:6px 10px;white-space:nowrap;"><span style="font-size:11px;font-weight:700;color:'+_stCol+';background:'+_stBg+';border-radius:8px;padding:2px 10px;">'+(_stLbl||'-')+'</span></td>'
        +'</tr>'
        +(e.output?('<tr><td colspan="4" style="padding:0 10px 10px 45px;"><pre style="background:#0f1117;color:#cdd6f4;padding:9px 12px;border-radius:7px;font-size:11.5px;line-height:1.5;overflow-x:auto;margin:0;white-space:pre-wrap;">'+_e(e.output)+'</pre></td></tr>'):'');
    }).join('');
    var _html='<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>실행 리포트 · '+_e(_tcName)+' · '+_e(h.at||'')+'</title>'
      +'<style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans KR",sans-serif;background:#f8f9fb;color:#1c2030;padding:24px;}'
      +'.wrap{max-width:1100px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.06);overflow:hidden;}'
      +'.head{padding:22px 28px;border-bottom:1px solid #eef1f5;background:linear-gradient(135deg,#2d6fd4,#4f8ae8);color:#fff;}'
      +'.head h1{margin:0 0 6px;font-size:19px;font-weight:800;}'
      +'.head .sub{font-size:12.5px;opacity:0.92;}'
      +'.meta{display:flex;flex-wrap:wrap;gap:14px;padding:16px 28px;background:#fafbfc;border-bottom:1px solid #eef1f5;font-size:12.5px;color:#5a6072;}'
      +'.meta b{color:#1c2030;font-weight:700;}'
      +'.badge{display:inline-block;padding:3px 12px;border-radius:12px;font-weight:800;font-size:11.5px;}'
      +'.badge-pass{background:#e6f7ec;color:#00875a;} .badge-fail{background:#fdecec;color:#c0392b;} .badge-total{background:#eef1f5;color:#3a4254;}'
      +'table{width:100%;border-collapse:collapse;} thead th{position:sticky;top:0;background:#eef1f5;color:#3a4254;font-size:11px;font-weight:800;padding:8px 10px;text-align:left;border-bottom:1px solid #c4cad3;}'
      +'tbody tr{border-bottom:1px solid #eef0f3;} tbody tr:hover{background:#fafbfc;}'
      +'.foot{padding:12px 28px;text-align:center;font-size:11px;color:#8a93a5;border-top:1px solid #eef1f5;}'
      +'</style></head><body><div class="wrap">'
      +'<div class="head"><h1>'+_e(_tcName)+'</h1><div class="sub">시험 절차 실행 리포트</div></div>'
      +'<div class="meta">'
        +'<div><b>TC ID</b> : '+_e(tcid)+'</div>'
        +'<div><b>실행일시</b> : '+_e(h.at||'')+'</div>'
        +(h.user?('<div><b>실행자</b> : '+_e(h.user)+'</div>'):'')
        +'<div><b>소요시간</b> : '+((h.sec||0).toFixed(1))+'초</div>'
        +'<div><span class="badge badge-pass">합격 '+_pass+'</span></div>'
        +'<div><span class="badge badge-fail">불합격 '+_fail+'</span></div>'
        +'<div><span class="badge badge-total">전체 '+_all+'</span></div>'
        +(h.aborted?'<div><span class="badge" style="background:rgba(232,130,12,0.15);color:#a15c00;">⏹ 중단</span></div>':'')
      +'</div>'
      +'<table><thead><tr><th style="width:80px;">시각</th><th style="width:50px;text-align:center;">단계</th><th>내용</th><th style="width:80px;">결과</th></tr></thead><tbody>'+_rows+'</tbody></table>'
      +'<div class="foot">생성 : '+_e(_nowStr())+' · ubiQuoss-TOP</div>'
      +'</div></body></html>';
    var _blob=new Blob([_html],{type:'text/html;charset=utf-8'});
    var _url=URL.createObjectURL(_blob);
    var _fname='TC-Report_'+String(tcid).replace(/[^\w\-.]+/g,'_')+'_'+String(h.at||'').replace(/[^\w\-]+/g,'-')+'.html';
    var _a=document.createElement('a'); _a.href=_url; _a.download=_fname; document.body.appendChild(_a); _a.click(); document.body.removeChild(_a);
    setTimeout(function(){ URL.revokeObjectURL(_url); }, 3000);
    if(typeof showToast==='function') showToast('HTML 리포트 다운로드됨');
  }catch(e){ if(typeof showToast==='function') showToast('다운로드 오류: '+e.message); }
}
function _execHistory(tcid){
  // 서버에서 최초 1회 로드 (비동기, 완료 후 tcProcRefresh로 재렌더)
  if(!_runHistoryLoaded[tcid]) _loadRunHistoryFromServer(tcid);
  var arr=(_runHistory&&Array.isArray(_runHistory[tcid]))?_runHistory[tcid]:[];
  var _tesc=String(tcid).replace(/\\/g,"\\\\").replace(/'/g,"\\'");
  var head='<div style="display:flex;align-items:center;gap:8px;background:#eef1f5;padding:7px 12px;border-bottom:1px solid #cfd4dc;"><i class="ti ti-history" style="color:var(--blue);"></i><b style="font-size:12px;color:var(--text);">실행 History</b><span style="font-size:10px;color:var(--text3);">'+arr.length+'건</span><span style="flex:1;"></span>'+(arr.length?('<button onclick="tcRunHistoryClear(\''+_tesc+'\')" title="History 전체 삭제" style="background:#fff;color:#6b7280;border:1px solid #cfd4dc;border-radius:6px;padding:2px 8px;font-size:10.5px;font-weight:600;cursor:pointer;"><i class="ti ti-trash" style="font-size:11px;vertical-align:middle;"></i> 전체 삭제</button>'):'')+'</div>';
  if(!arr.length) return '<div style="border:1px solid #cfd4dc;border-radius:9px;overflow:hidden;">'+head+'<div style="padding:22px;text-align:center;color:var(--text3);font-size:12px;">시험 절차 실행이 종료되면 그 실행 로그가 여기에 자동으로 저장됩니다.<br>과거 실행 결과를 이곳에서 비교·검토할 수 있어요.</div></div>';
  var rows=arr.map(function(h, ix){
    var k=tcid+'::'+ix, open=!!_runHistoryOpen[k];
    var st=(h.fail>0)?'#e53e5a':(h.pass>0?'#00a872':'#94a3b8');
    var mn=Math.floor((h.sec||0)/60), sc=Math.round((h.sec||0)%60);
    var when=String(h.at||''); var whens=when.length>19?when.slice(0,19):when;
    var summary='<div onclick="tcRunHistoryToggle(\''+_tesc+'\','+ix+')" style="cursor:pointer;padding:8px 12px;border-bottom:1px solid #eef1f5;display:flex;align-items:center;gap:12px;background:'+(open?'#f5f8fd':'#fff')+';">'
      +'<i class="ti ti-caret-'+(open?'down':'right')+'-filled" style="font-size:13px;color:#5c6bc0;"></i>'
      +'<span style="width:8px;height:8px;border-radius:50%;background:'+st+';flex-shrink:0;"></span>'
      +'<span style="font-size:12px;color:var(--text);font-weight:700;min-width:135px;">'+whens+'</span>'
      +'<span style="font-size:11px;color:#00875a;font-weight:700;">합격 '+h.pass+'</span>'
      +'<span style="font-size:11px;color:#d12d49;font-weight:700;">불합격 '+h.fail+'</span>'
      +'<span style="font-size:11px;color:var(--text3);">'+(h.log?h.log.length:0)+'건</span>'
      +'<span style="font-size:11px;color:#2d6fd4;font-weight:700;background:rgba(45,111,212,0.12);border-radius:8px;padding:2px 9px;"><i class="ti ti-clock" style="font-size:12px;vertical-align:middle;"></i> '+((h.sec||0).toFixed(1))+'초</span>'
      +(h.aborted?'<span style="font-size:10px;color:#e8820c;font-weight:800;background:rgba(232,130,12,0.12);border-radius:6px;padding:1px 7px;">⏹ 중단</span>':'')
      +(h.user?('<span title="실행자" style="font-size:10.5px;color:var(--text3);background:#eef1f5;border-radius:8px;padding:1px 8px;"><i class="ti ti-user" style="font-size:11px;"></i> '+String(h.user).replace(/</g,'&lt;')+'</span>'):'')
      +'<span style="flex:1;"></span>'
      +'<button onclick="event.stopPropagation();tcRunHistoryDownload(\''+_tesc+'\','+ix+')" title="이 실행 결과를 HTML 리포트로 다운로드" style="background:#fff;color:#00875a;border:1px solid #cfe6d6;border-radius:6px;padding:2px 8px;font-size:10.5px;font-weight:600;cursor:pointer;"><i class="ti ti-download" style="font-size:11px;"></i> HTML</button>'
      +'<button onclick="event.stopPropagation();tcRunHistoryRestore(\''+_tesc+'\','+ix+')" title="이 실행 로그를 Console에 복원(보기 편의)" style="background:#fff;color:#2d6fd4;border:1px solid #cfd6e8;border-radius:6px;padding:2px 8px;font-size:10.5px;font-weight:600;cursor:pointer;"><i class="ti ti-arrow-back-up" style="font-size:11px;"></i> Console로</button>'
      +'<button onclick="event.stopPropagation();tcRunHistoryDel(\''+_tesc+'\','+ix+')" title="이 실행 기록 삭제" style="background:#fff;color:#e53e5a;border:1px solid #f2c5cd;border-radius:6px;padding:2px 6px;font-size:10.5px;font-weight:600;cursor:pointer;"><i class="ti ti-x" style="font-size:11px;"></i></button>'
      +'</div>';
    if(!open) return summary;
    var logs=(h.log||[]).map(function(e,ri){ try{ return _logRowHtml(e,ri); }catch(_lhe){ return ''; } }).join('');
    var body='<div style="background:#fafbfc;padding:0 12px 12px 12px;border-bottom:1px solid #eef1f5;">'
      +'<div style="overflow-x:auto;max-height:520px;overflow-y:auto;border:1px solid #dde2ea;border-radius:7px;background:#fff;margin-top:6px;">'
      +'<table style="width:100%;border-collapse:collapse;table-layout:fixed;"><colgroup><col style="width:74px;"><col style="width:44px;"><col><col style="width:74px;"></colgroup>'
      +'<thead><tr style="position:sticky;top:0;background:#fafbfc;z-index:1;"><th style="padding:4px 9px;text-align:left;font-size:10.5px;font-weight:700;color:#363b47;border-bottom:1px solid #c4cad3;">시각</th><th style="padding:4px 6px;font-size:10.5px;font-weight:700;color:#363b47;border-bottom:1px solid #c4cad3;">단계</th><th style="padding:4px 9px;text-align:left;font-size:10.5px;font-weight:700;color:#363b47;border-bottom:1px solid #c4cad3;">내용</th><th style="padding:4px 9px;font-size:10.5px;font-weight:700;color:#363b47;border-bottom:1px solid #c4cad3;">결과</th></tr></thead>'
      +'<tbody>'+logs+'</tbody></table></div></div>';
    return summary+body;
  }).join('');
  return '<div style="border:1px solid #cfd4dc;border-radius:9px;overflow:hidden;">'+head+'<div style="max-height:640px;overflow-y:auto;">'+rows+'</div></div>';
}
function _stcStatus(c){ const r=c.repeatResult; const col=r==='Pass'?'#00a872':r==='Fail'?'#e53e5a':'#d5d9e0'; const t=c.executed_at?('<span style="font-size:9px;color:#b8bdc8;margin-left:6px;">'+String(c.executed_at).slice(11)+'</span>'):''; return '<span title="'+(r||'미실행')+'" style="display:inline-block;width:9px;height:9px;border-radius:50%;background:'+col+';flex-shrink:0;"></span>'+t; }
function _stcRow(tcid,c,depth,seld){
  const k=c.kind||'cli'; const isC=(k==='group'||k==='loop');
  const ic=k==='loop'?{i:'ti-repeat',c:'#7c3aed'}:k==='group'?{i:'ti-folder',c:'#7c3aed'}:k==='wait'?{i:'ti-clock',c:'#e8820c'}:k==='call'?{i:'ti-subtask',c:'#0ea5e9'}:k==='connect'?{i:'ti-plug-connected',c:'#0ea5e9'}:k==='disconnect'?{i:'ti-plug-connected-x',c:'#64748b'}:{i:'ti-terminal-2',c:'#00a872'};
  const nm=k==='loop'?('반복 ×'+(parseInt(c.loopCount)||2)):k==='group'?(c.label||'그룹'):k==='wait'?('대기 '+(parseInt(c.waitSec)||5)+'초'):k==='call'?('호출: '+(((tcList.find(t=>t.tcid===c.callTcid))||{}).name||c.callTcid||'(미선택)')):k==='connect'?('Session Open ('+(c.model||'공통')+')'):k==='disconnect'?('Session Closed ('+(c.model||'공통')+')'):((c.cli||'').split(/\r?\n/)[0]||'(명령 없음)');
  const chev=isC?('<i onclick="event.stopPropagation();tcCkToggle2(\''+tcid+'\',\''+c.id+'\')" class="ti ti-chevron-'+(_ckCollapsed[c.id]===true?'right':'down')+'" style="cursor:pointer;color:var(--text3);font-size:14px;width:14px;flex-shrink:0;"></i>'):'<span style="display:inline-block;width:14px;flex-shrink:0;"></span>';
  return '<div draggable="true" ondragstart="tcSeqDrag(event,\''+c.id+'\')" ondragover="event.preventDefault()" ondrop="tcSeqDrop(event,\''+tcid+'\',\''+c.id+'\')" onclick="tcSeqSelect(\''+tcid+'\',\''+c.id+'\')" style="display:flex;align-items:center;gap:7px;padding:6px 9px 6px '+(8+depth*20)+'px;cursor:pointer;border-bottom:1px solid #f2f4f7;background:'+(seld?'rgba(45,111,212,0.1)':isC?'rgba(124,58,237,0.045)':'transparent')+';">'
    +'<span style="color:#d3d8e0;cursor:grab;font-size:11px;flex-shrink:0;">⠿</span>'+chev
    +'<i class="ti '+ic.i+'" style="color:'+ic.c+';font-size:15px;flex-shrink:0;"></i>'
    +'<span style="flex:1;min-width:0;font-size:12px;'+(isC?'font-weight:700;color:#5b3ea8;':'font-family:ui-monospace,monospace;color:var(--text);')+'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+String(nm).replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</span>'
    +(isC?'':_stcStatus(c))
    +'<i class="ti ti-trash" onclick="event.stopPropagation();tcCheckDel(\''+tcid+'\',\''+c.id+'\')" style="font-size:12px;color:#dde1e7;cursor:pointer;flex-shrink:0;" onmouseenter="this.style.color=\'var(--red)\'" onmouseleave="this.style.color=\'#dde1e7\'"></i>'
  +'</div>';
}
function _stcRender(tcid,checks,parentId,depth,selId){
  let h='';
  checks.filter(c=> parentId? (c.parent===parentId) : (!c.parent||!checks.find(x=>x.id===c.parent))).forEach(c=>{
    h+=_stcRow(tcid,c,depth,c.id===selId);
    if((c.kind==='group'||c.kind==='loop') && _ckCollapsed[c.id]!==true){ h+=_stcRender(tcid,checks,c.id,depth+1,selId); }
  });
  return h;
}
function _sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function _numIf(x){ x=String(x==null?'':x).trim(); if(x===''||!/^-?\d+(\.\d+)?$/.test(x)) return null; return parseFloat(x); }   // 순수 숫자 문자열만 Number로
function _calcExpr(x){   // 안전한 사칙연산: 숫자·+ - * / % ( ) 만 허용 → 계산값, 아니면 null (코드 주입 차단)
  x=String(x==null?'':x).trim();
  if(!x || !/[+\-*/%]/.test(x)) return null;            // 연산자 없으면 계산 불필요(순수 숫자/문자)
  if(!/^[\d\s.+\-*/()%]+$/.test(x)) return null;         // 숫자·연산자·괄호·공백 외 문자 있으면 계산 안 함
  try{ var r=Function('"use strict";return ('+x+');')(); return (typeof r==='number'&&isFinite(r))?r:null; }catch(e){ return null; }
}
function _evalOneCmp(s){
  s=String(s||'').trim(); if(!s) return true;
  const m=s.match(/^(.*?)\s*(==|!=|>=|<=|>|<|contains|포함)\s*(.*)$/);
  if(m){ let a=m[1].trim().replace(/^["']|["']$/g,''), op=m[2], b=m[3].trim().replace(/^["']|["']$/g,'');
    if(b==='빈값'||b==='empty') b='';
    const _ca=_calcExpr(a); if(_ca!=null) a=String(_ca);   // 양변이 사칙연산식이면 계산값으로 치환
    const _cb=_calcExpr(b); if(_cb!=null) b=String(_cb);
    if(op==='contains'||op==='포함') return a.indexOf(b)>=0;
    if(op==='=='||op==='!='){ const pa=_numIf(a),pb=_numIf(b); const eq=(pa!=null&&pb!=null)?(pa===pb):(a===b); return op==='=='?eq:!eq; }   // 둘 다 숫자면 수치 동등, 아니면 문자 동등(기존 호환)
    const na=parseFloat(a),nb=parseFloat(b); if(!isNaN(na)&&!isNaN(nb)){ if(op==='>')return na>nb; if(op==='<')return na<nb; if(op==='>=')return na>=nb; if(op==='<=')return na<=nb; }
    return false;
  }
  return !!s.trim() && s.indexOf('${')<0;
}
function _evalCond(cond,tcid){
  cond=String(cond||'').trim(); if(!cond) return true;
  const s=_subVars(cond,tcid);
  if(/\s\|\|\s/.test(s)) return s.split(/\s*\|\|\s*/).some(_evalOneCmp);   // 또는(OR) — 하나라도 참
  if(/\s&&\s/.test(s))  return s.split(/\s*&&\s*/).every(_evalOneCmp);     // 그리고(AND) — 모두 참
  return _evalOneCmp(s);
}
// IF 분기 선택(elif 포함): IF 참→true, 아니면 elif 순서대로 첫 참, 모두 거짓→false. {result,raw(문구),branch,label}
function _elifTR(e){ return (e&&e.trueResult!=null)?e.trueResult:(e&&e.result!=null?e.result:'Pass'); }   // 구버전(result/msg) 호환
function _elifTM(e){ return (e&&e.trueMsg!=null)?e.trueMsg:(e&&e.msg!=null?e.msg:''); }
function _evalIfBranch(c, tcid, pre){ pre=(typeof pre==='function')?pre:function(x){return x;};
  try{ if(_evalCond(pre(c.condition||''), tcid)) return {result:(c.trueResult||'Pass'), raw:(c.trueMsg||''), branch:'true', label:'참(True)'}; }catch(e){}
  var es=Array.isArray(c.elifs)?c.elifs:[];
  for(var k=0;k<es.length;k++){ var e=es[k]||{}; try{ if(_evalCond(pre(e.condition||''), tcid)) return {result:(_elifTR(e)||'Pass'), raw:(_elifTM(e)||''), branch:'elif'+k, label:'ELIF'+(k+1)+' 참'}; }catch(_){} }
  // IF·ELIF 모두 거짓 → IF의 False(=최종 else)
  return {result:(c.falseResult||'Fail'), raw:(c.falseMsg||''), branch:'false', label:'거짓(False)'};
}let _seqDragId=null;
function tcSeqDrag(e,id){ _seqDragId=id; try{e.dataTransfer.effectAllowed='move';}catch(_){} }
async function tcSeqDrop(e,tcid,targetId){ e.preventDefault(); const dragId=_seqDragId; _seqDragId=null; if(!dragId||dragId===targetId) return; const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc||!Array.isArray(tc.checks)) return; const from=tc.checks.findIndex(x=>x.id===dragId), to=tc.checks.findIndex(x=>x.id===targetId); if(from<0||to<0) return; const it=tc.checks.splice(from,1)[0]; tc.checks.splice(to,0,it); await saveTCFile(tc); tcProcRefresh(tcid); }
async function tcCheckAdd(tcid, kind, atEnd){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc) return;
  if(!Array.isArray(tc.checks)) tc.checks=[];
  _tcSnapshot(tcid);
  kind=kind||'cli';
  const id='ck'+Date.now()+Math.floor(Math.random()*1000);
  _seqSel=_seqSel||{}; _stepSel=_stepSel||{};
  // 앵커: 선택된 스텝(마지막) → 그 바로 아래·같은 레벨로 추가
  const sids=Array.isArray(_stepSel[tcid])?_stepSel[tcid]:[];
  const anchorId=(atEnd||!sids.length)?null:sids[sids.length-1]; // atEnd(+ 스텝/모델그룹/프로시저 버튼)=맨 아래에 생성
  const ai=anchorId?tc.checks.findIndex(x=>x.id===anchorId):-1;
  let anchorIndent=(ai>=0)?(parseInt(tc.checks[ai].indent)||0):0;
  // IF/ELSE 헤더 바로 아래에 추가하면 그 블록의 자식으로 (한 단계 들여쓰기)
  if(ai>=0){ var _ak=tc.checks[ai].kind||'cli'; if(_ak==='if'||_ak==='else'){ anchorIndent=anchorIndent+1; } }
  let nc;
  if(kind==='wait') nc={id,kind:'wait',waitSec:5};
  else if(kind==='connect') nc={id,kind:'connect',model:'공통'};
  else if(kind==='disconnect') nc={id,kind:'disconnect',model:'공통'};
  else if(kind==='model') nc={id,kind:'model',modelName:''};
  else if(kind==='group') nc={id,kind:'group',label:''};
  else if(kind==='loop') nc={id,kind:'loop',loopMode:'count',loopCount:2,loopBreak:''};
  else if(kind==='loopfor') nc={id,kind:'loop',loopMode:'for',loopVar:'i',forFrom:1,forTo:10,forStep:1,loopCount:2,loopBreak:''};
  else if(kind==='loopwhile') nc={id,kind:'loop',loopMode:'until',loopCount:100,loopBreak:''};   // While = 중단조건 충족까지 반복
  else if(kind==='if') nc={id,kind:'if',condition:'',conds:[{l:'',op:'==',r:''}],condJoin:'and',trueResult:'Pass',trueMsg:'',falseResult:'Fail',falseMsg:'',elifs:[]};
  else if(kind==='else') nc={id,kind:'else'};
  else if(kind==='call') nc={id,kind:'call',callTcid:'',callParams:''};
  else if(kind==='comment') nc={id,kind:'comment',text:''};
  else if(kind==='message') nc={id,kind:'message',text:''};   // 메시지: 실행/사이클 로그에 남는 노트 (주석과 달리 변수 치환 + Cycle 반영)
  else if(kind==='proc') nc={id,kind:'proc',name:''};
  else if(kind==='switch') nc={id,kind:'switch',switchExpr:'',cases:[{when:'',goto:''}],gotoElse:''};
  else if(kind==='manual') nc={id,kind:'manual',desc:'',output:''};
  else { nc={id,kind:'cli',model:'공통',cli:'',criteria:'',type:'contains'}; } // 새 CLI 스텝은 빈 값 (이전엔 마지막 스텝 cli를 복사하던 버그)
  nc.indent=anchorIndent;
  if(ai>=0) tc.checks.splice(ai+1,0,nc); else tc.checks.push(nc);
  _seqSel[tcid]=id; _stepSel[tcid]=[id];
  await saveTCFile(tc); tcProcRefresh(tcid);
}
// 모델 그룹 "+ 스텝": 해당 모델 섹션의 맨 아래에 추가 (기존엔 헤더 바로 아래=섹션 맨 위에 생기던 문제)
async function tcCheckAddModel(tcid, modelId){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc||!Array.isArray(tc.checks)) return;
  _tcSnapshot(tcid);
  const checks=tc.checks; const mi=checks.findIndex(x=>x.id===modelId);
  if(mi<0){ return tcCheckAdd(tcid,'cli',true); }
  let end=checks.length;
  for(let i=mi+1;i<checks.length;i++){ if((checks[i].kind)==='model'){ end=i; break; } } // 다음 모델 그룹 직전 = 이 섹션의 끝
  // 선택된 스텝이 이 모델 섹션 안에 있으면 그 바로 아래에 생성 (없으면 섹션 끝)
  const _sel=(_stepSel&&Array.isArray(_stepSel[tcid])&&_stepSel[tcid].length)?_stepSel[tcid][_stepSel[tcid].length-1]:null;
  let pos=end;
  if(_sel){ const si=checks.findIndex(x=>x.id===_sel); if(si>mi && si<end) pos=si+1; }
  const id='ck'+Date.now()+Math.floor(Math.random()*1000);
  const nc={id,kind:'cli',model:'공통',cli:'',criteria:'',type:'contains',indent:(parseInt(checks[mi].indent)||0)};
  checks.splice(pos,0,nc);
  _seqSel=_seqSel||{}; _stepSel=_stepSel||{}; _stepSel[tcid]=[id];
  await saveTCFile(tc); tcProcRefresh(tcid);
}
// Zephyr식 하단 인라인 추가행 — 목적/명령/예상결과 입력 후 ⊕ 또는 Enter
// contenteditable에서 Enter(Shift 없이) 시 줄바꿈 삽입을 확실히 막기 위한 공용 핸들러.
// 일부 Chromium 버전은 keydown의 preventDefault보다 beforeinput(insertParagraph/insertLineBreak)이
// 먼저 줄바꿈을 삽입해버리는 경우가 있어 beforeinput에서도 동일하게 차단해야 함.
// Enter=blur/이동, Shift+Enter=줄바꿈. 문제: beforeinput(InputEvent)에는 shiftKey 프로퍼티가 없어
// beforeinput에서 shiftKey를 검사하면 항상 undefined → Shift+Enter 삽입도 함께 preventDefault되어
// 사용자가 Shift+Enter를 눌러도 아무 일도 안 일어남. 해결: 직전 keydown의 Shift 상태를 짧게 기억.
var _tcShiftBreakAt=0;
try{ document.addEventListener('keydown', function(ev){ if(ev.key==='Enter' && ev.shiftKey) _tcShiftBreakAt=Date.now(); }, true); }catch(_e){}
function _tcNoEnterBreak(ev){
  if(ev.shiftKey) return;
  if(ev.type==='beforeinput'){
    if(ev.inputType==='insertParagraph'||ev.inputType==='insertLineBreak'){
      if(Date.now()-_tcShiftBreakAt<400) return;   // 방금 Shift+Enter 눌린 경우: 줄바꿈 허용
      ev.preventDefault();
    }
    return;
  }
  if(ev.key==='Enter'){ ev.preventDefault(); }
}
function tcCellNav(tcid,id,field,dir){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc) return;
  const checks=tc.checks||[]; const idx=checks.findIndex(x=>x.id===id); if(idx<0) return;
  const attr=field==='cli'?'data-cliid':'data-descid';
  for(let i=idx+dir;i>=0&&i<checks.length;i+=dir){ if((checks[i].kind||'cli')==='cli'){ const el=document.querySelector('['+attr+'="'+checks[i].id+'"]'); if(el){ el.focus(); try{ const r=document.createRange(); r.selectNodeContents(el); r.collapse(false); const s=window.getSelection(); s.removeAllRanges(); s.addRange(r); }catch(e){} } return; } }
}// 같은 스텝(행)의 다른 칸으로 포커스 이동 — field: 'cli'(Test Data) / 'desc'(Test Step)
function tcCellTo(tcid,id,field){ const attr=field==='cli'?'data-cliid':'data-descid'; const el=document.querySelector('['+attr+'="'+id+'"]'); if(el){ el.focus(); try{ const r=document.createRange(); r.selectNodeContents(el); r.collapse(false); const s=window.getSelection(); s.removeAllRanges(); s.addRange(r); }catch(e){} } }
// 재렌더 후 셀 포커스 예약/적용 — Test Step 입력 후 Tab 시 desc 저장(재렌더)으로 Test Data가 편집가능해진 뒤에 포커스해야 함
var _tcPendFocus=null;
function _tcFocusAfter(tcid,id,field){ _tcPendFocus={id:String(id),field:field}; }
function _tcApplyPendFocus(){ if(!_tcPendFocus) return; var p=_tcPendFocus; _tcPendFocus=null; try{ var attr=(p.field==='cli')?'data-cliid':'data-descid'; var el=document.querySelector('['+attr+'="'+p.id+'"]'); if(el&&el.getAttribute&&el.getAttribute('contenteditable')==='true'){ el.focus(); var r=document.createRange(); r.selectNodeContents(el); r.collapse(false); var s=window.getSelection(); s.removeAllRanges(); s.addRange(r); } }catch(e){} }
// Test Data에서 Enter → 다음 스텝의 Test Step으로. 마지막이면 새 스텝 생성 후 그 Test Step에 포커스 (연속 입력)
async function tcCliEnter(tcid,id){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc||!Array.isArray(tc.checks)) return;
  const checks=tc.checks; const idx=checks.findIndex(x=>x.id===id); if(idx<0) return;
  for(let i=idx+1;i<checks.length;i++){ if((checks[i].kind||'cli')==='cli'){ tcCellTo(tcid, checks[i].id, 'desc'); return; } }
  _tcSnapshot(tcid);
  const nid='ck'+Date.now()+Math.floor(Math.random()*100000);
  const cur=checks[idx]||{};
  checks.splice(idx+1,0,{id:nid,kind:'cli',model:cur.model||'공통',cli:'',criteria:'',type:cur.type||'contains',indent:parseInt(cur.indent)||0});
  await saveTCFile(tc); tcProcRefresh(tcid);
  setTimeout(function(){ tcCellTo(tcid, nid, 'desc'); }, 30);
}
function _caretAtStart(el){ if(el.tagName==='INPUT') return (el.selectionStart||0)===0; if(el.tagName==='SELECT') return true; try{ const s=window.getSelection(); if(!s.rangeCount) return true; const r=s.getRangeAt(0).cloneRange(); r.selectNodeContents(el); r.setEnd(s.getRangeAt(0).startContainer, s.getRangeAt(0).startOffset); return r.toString().length===0; }catch(e){ return true; } }
function _caretAtEnd(el){ if(el.tagName==='INPUT') return (el.selectionStart||0)>=el.value.length; if(el.tagName==='SELECT') return true; try{ const s=window.getSelection(); if(!s.rangeCount) return true; const r=s.getRangeAt(0).cloneRange(); r.selectNodeContents(el); r.setStart(s.getRangeAt(0).endContainer, s.getRangeAt(0).endOffset); return r.toString().length===0; }catch(e){ return true; } }
function tcGridKey(ev){
  const cell=ev.target; if(!cell||!cell.closest) return; const tbl=cell.closest('.stepTbl'); if(!tbl) return;
  if(!cell.matches('select,input,[contenteditable="true"]')) return;
  const k=ev.key; let dir=0;
  if(k==='Tab'){ dir=ev.shiftKey?-1:1; }
  else if(k==='ArrowRight'){ if(!_caretAtEnd(cell)) return; dir=1; }
  else if(k==='ArrowLeft'){ if(!_caretAtStart(cell)) return; dir=-1; }
  else return;
  const f=Array.from(tbl.querySelectorAll('select,input,[contenteditable="true"]')); const idx=f.indexOf(cell); if(idx<0) return;
  const next=f[idx+dir]; if(!next) return;
  ev.preventDefault(); next.focus(); try{ if(next.select){next.select();} else if(next.getAttribute&&next.getAttribute('contenteditable')==='true'){ const r=document.createRange(); r.selectNodeContents(next); r.collapse(false); const s=window.getSelection(); s.removeAllRanges(); s.addRange(r); } }catch(e){}
}
function tcCallPick(tcid,id,val){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc) return; const c=(tc.checks||[]).find(x=>x.id===id); if(!c) return;
  if(val&&val.indexOf('P:')===0){ c.callProc=val.slice(2); c.callTcid=''; }
  else if(val&&val.indexOf('T:')===0){ c.callTcid=val.slice(2); c.callProc=''; }
  else { c.callProc=''; c.callTcid=''; }
  saveTCFile(tc).then(()=>tcProcRefresh(tcid));
}
async function tcCheckSave(tcid,id,field,value){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc||!Array.isArray(tc.checks)) return;
  const c=tc.checks.find(x=>x.id===id); if(!c) return;
  var _em=String(field||'').match(/^elif(\d+)\.(\w+)$/);   // elifK.prop → c.elifs[K][prop] 라우팅(elif 분기 입력)
  if(_em){ c.elifs=Array.isArray(c.elifs)?c.elifs:[]; var _ek=parseInt(_em[1],10); c.elifs[_ek]=c.elifs[_ek]||{condition:'',result:'Pass',msg:''}; c.elifs[_ek][_em[2]]=value; try{ await saveTCFile(tc); }catch(e){} tcProcRefresh(tcid); return; }
  if(String(c[field]==null?'':c[field])!==String(value==null?'':value)) _tcSnapshot(tcid);   // Ctrl+Z: 값이 실제로 바뀔 때만 스냅샷
  c[field]=value;
  if(field==='query'){ const _qs=_stepQueries(c); if(value){ if(_qs.length){ _qs[0].q=value; if(!_qs[0].var)_qs[0].var=_nextQueryVar(tc); } else { _qs.push({q:value,var:_nextQueryVar(tc)}); } } else { if(_qs.length>1) _qs.splice(0,1); else c.queries=[]; } _querySync0(c); }   // 구 단일 query 편집 → c.queries[0] 동기화. 빈 값이면 첫번째만 삭제(나머지 Query 는 유지)
  if(field==='extractVar'||field==='extractRule'){   // F-6: 레거시 추출 편집을 extracts 배열에 반영
    if(Array.isArray(c.extracts)&&c.extracts.length){
      if(field==='extractVar'){ if(String(value||'').trim()) c.extracts[0].var=String(value).trim(); else c.extracts.shift(); }
      else c.extracts[0].rule=String(value==null?'':value);
    }
    _stepSyncLegacy(c);
  }
  if(field==='criteria'||field==='type'||field==='excludeLines') _reJudge(c,tcid);   // 값/타입/제외 변경 시 즉시 재판정
  await saveTCFile(tc);
  if(field==='type'||field==='output'||field==='repeat'||field==='repeatMode'||field==='action'||field==='cli'||field==='loopMode'||field==='loopVar'||field==='forFrom'||field==='forTo'||field==='forStep'||field==='query'||field==='condition'||field==='extractVar'||field==='extractRule'||field==='criteria'||field==='excludeLines'||field==='desc'||field==='modelName'||field==='devId'||field==='gotoElse'||field==='compWait'||field==='compWaitOn') tcProcRefresh(tcid); // 타입/Action/OID/추출/기준/제외/For/Query/IF조건/모델그룹/대상장비/Switch else/CompletionWait/Test Steps 등 실시간 갱신
}
async function tcCheckDel(tcid,id){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc||!Array.isArray(tc.checks)) return;
  _tcSnapshot(tcid);
  // 드래그/다중 선택 후 삭제: 선택에 이 스텝이 포함돼 있으면 선택 전체 삭제
  const selIds=(typeof _stepSelIds==='function')?_stepSelIds(tcid):[];
  const ids=(selIds.length>1 && selIds.indexOf(id)>=0)?selIds.slice():[id];
  tc.checks=tc.checks.filter(x=>ids.indexOf(x.id)<0);
  try{ if(typeof _stepSel!=='undefined'&&_stepSel) _stepSel[tcid]=[]; }catch(e){}
  await saveTCFile(tc); tcProcRefresh(tcid);
}
async function tcCheckSetCrit(tcid,id,val){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc||!Array.isArray(tc.checks)) return;
  const c=tc.checks.find(x=>x.id===id); if(!c) return;
  c.criteria=(val||'').trim(); await saveTCFile(tc); tcProcRefresh(tcid);
}
async function tcCheckClearOut(tcid,id){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc||!Array.isArray(tc.checks)) return;
  const c=tc.checks.find(x=>x.id===id); if(!c) return;
  c.output=''; await saveTCFile(tc); tcProcRefresh(tcid);
}
// 수동(Manual) 스텝 — 사람이 직접 확인 후 결과 선택
async function tcManualSetResult(tcid,id,val){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc||!Array.isArray(tc.checks)) return;
  const c=tc.checks.find(x=>x.id===id); if(!c) return;
  c.repeatResult=val||''; c.executed_at=val?_nowStr():'';
  const _lbl=(function(){ const a=tc.checks||[]; return _stepLabels(a)[a.findIndex(x=>x.id===id)]||''; })();
  if(val) _logRec(tcid,{t:_nowStr().slice(11),label:_lbl,kind:'cli',name:'수동 확인: '+((c.desc||'').split(/\r?\n/)[0]||'(수행 방법 미입력)'),status:val,output:c.output||''});
  await saveTCFile(tc); tcProcRefresh(tcid);
}
function _checkLab(tc, check, _forceId){
  // 다중장비 실행: 인자(_forceId, 병렬용)·전역(_tcForceDevId, 순차용) 우선 — 그 장비로 강제
  var _ff=_forceId||window._tcForceDevId;
  if(_ff){ var _fl=labList.find(function(x){return x.id===_ff;}); if(_fl) return _fl; }
  // 스텝별 대상 장비(devId) 직접 지정 — 자동 세션의 1순위 기준
  if(check.devId){ var _dd=labList.find(function(x){return x.id===check.devId;}); if(_dd) return _dd; }
  // iTest식 Session(S1~Sn) 명시 지정 우선
  if(check.session!=null && check.session!==''){ try{ const ids=_tcSessIds(tc||{}); const sid=ids[parseInt(check.session)]; const l=labList.find(x=>x.id===sid); if(l) return l; }catch(e){} }
  if(check.model && check.model!=='공통'){ const l=labList.find(x=>x.name===check.model); if(l) return l; }
  // 계측기(N2X/STC/IXIA) 여부 판정 — Telnet/SSH 세션 스텝은 계측기를 상속하면 안 됨(telnet 서비스가 없음)
  var _isMeter=function(d){ return d && /계측|spirent|ixia|n2x|stc/i.test(String((d.role||'')+' '+(d.vendor||'')+' '+(d.model||'')+' '+(d.name||''))); };
  var _skipMeter=((check.kind||'')==='connect'||(check.kind||'')==='disconnect');
  // iTest식: 위쪽 가장 가까운 Session Open(connect)의 장비 상속
  const _arr=(tc&&tc.checks)||[]; const _idx=_arr.findIndex(x=>x.id===check.id);
  // 자동 세션: 위쪽 가장 가까운 스텝의 대상 장비(devId) 상속 — 장비를 한 번만 지정하면 됨
  // Telnet/SSH Open/Close 스텝은 계측기를 상속하지 않고 CLI 장비만 상속 (계측기는 telnet 불가)
  if(_idx>=0){ for(let i=_idx-1;i>=0;i--){ if(_arr[i].devId){ const l=labList.find(x=>x.id===_arr[i].devId); if(l){ if(_skipMeter&&_isMeter(l)) continue; return l; } } } }
  if(_idx>=0){ for(let i=_idx-1;i>=0;i--){ if((_arr[i].kind||'cli')==='connect'){ const pm=_arr[i].model; if(pm&&pm!=='공통'){ const l=labList.find(x=>x.name===pm); if(l){ if(_skipMeter&&_isMeter(l)) continue; return l; } } break; } } }
  // TC 세션 → IP 있는 첫 장비 순 폴백 (Telnet/SSH 스텝은 계측기 제외)
  try{ const ids=_tcSessIds(tc||{}); if(ids.length){ for(var _si=0;_si<ids.length;_si++){ const l=labList.find(x=>x.id===ids[_si]); if(l){ if(_skipMeter&&_isMeter(l)) continue; return l; } } } }catch(e){}
  const withIp=labList.filter(function(x){ return x&&x.ip && (!_skipMeter || !_isMeter(x)); }); if(withIp.length) return withIp[0];
  return _skipMeter ? (labList.find(function(x){return x&&!_isMeter(x);})||null) : (labList[0]||null);
}
// 세션 미선택 감지 시 전체 실행 중단 요청 — 다음 스텝으로 진행하지 않고 로그에 중단 메시지 남김
function _tcAbortByMissingSession(tcid){
  try{
    _runAbort=_runAbort||{}; _runAbort[tcid]=true;
    _runPause=_runPause||{}; _runPause[tcid]=null;
    _bpStepOver=_bpStepOver||{}; _bpStepOver[tcid]=false;
    _logRec(tcid,{t:_nowStr().slice(11),kind:'group',name:'⏹ 세션 미선택 — 시험 절차 중단',status:'info'});
    if(typeof _tcResumeBar==='function') _tcResumeBar(tcid,false);
    if(typeof _tcRunStopBar==='function') _tcRunStopBar(tcid,false);
  }catch(_e){}
}
// 이 스텝에 세션(대상 장비) 이 "명시적으로" 지정되어 있는지 판정.
// 강제 지정(_forceId/_tcForceDevId), 스텝의 devId/session/model, 상위 스텝 상속(devId/connect) 만 명시로 간주.
// TC 세션 바 첫 장비나 labList 첫 장비 폴백은 "미지정" 으로 취급 → 실행 차단 대상.
function _checkHasExplicitSession(tc, check, _forceId){
  if(_forceId||window._tcForceDevId) return true;
  if(!check) return false;
  if(check.devId) return true;
  if(check.session!=null && check.session!=='') return true;
  if(check.model && check.model!=='공통') return true;
  var _arr=(tc&&tc.checks)||[]; var _idx=_arr.findIndex(function(x){return x.id===check.id;});
  if(_idx>=0){
    for(var i=_idx-1;i>=0;i--){ if(_arr[i].devId) return true; }
    for(var j=_idx-1;j>=0;j--){ if((_arr[j].kind||'cli')==='connect'){ var pm=_arr[j].model; if(pm&&pm!=='공통') return true; break; } }
  }
  return false;
}
// ── 변수 추출·재사용 (iTest query→variable) ──
let _procVars={};
let _tcColChk=null;   // colN('행') 해석용 현재 스텝(check) — 그 스텝의 c.colVars 우선 (스텝별 col1,2 분리)
function _subVars(text,tcid,chk){ const v=_procVars[tcid]||{}; var s=String(text==null?'':text);
  s=s.replace(/\$\{\s*(\w+)\s*\}/g, function(m,k){ return v[k]!=null?String(v[k]):m; });   // ${name} 중괄호 — 임의 이름 (프로시저 변수 우선)
  // $name(중괄호 없음): 정의된 변수만(긴 이름 우선) 매칭, 뒤가 영숫자만 아니면 OK → $i_downlink 의 $i 치환(_downlink 보존)·다중 변수 OK
  try{ var _ks=Object.keys(v).filter(Boolean).sort(function(a,b){return b.length-a.length;});
    if(_ks.length){ var _re=new RegExp('\\$('+_ks.map(function(k){return k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}).join('|')+')(?![A-Za-z0-9])','g');
      s=s.replace(_re, function(m,k){ return v[k]!=null?String(v[k]):m; }); } }catch(_ev){}
  // 스텝 지정 컬럼: #N.colM('행') → N = '보이는 스텝 번호'(.15 → #15). 그 스텝의 M열 행값. (없으면 colVar-스텝 인덱스 폴백)
  try{ var _t2=_tcById(tcid); if(_t2&&Array.isArray(_t2.checks)){ var _cs=_t2.checks.filter(function(x){return x&&x.colVars&&Object.keys(x.colVars).length;});
    if(_cs.length){ var _lbls=(typeof _stepLabels==='function')?_stepLabels(_t2.checks):[]; var _norm=function(x){return String(x==null?'':x).replace(/^\.+|\.+$/g,'');};
      s=s.replace(/#\s*([\d.]+?)\s*\.\s*col(\d+)\s*\(\s*['"]?\s*([^'")]+?)\s*['"]?\s*\)/g, function(mm,sn,cn,idx){   // 라벨은 점 포함(#2 · #.2 · #1.2 모두)
        var _ns=_norm(sn); var st=null;
        for(var li=0; li<_t2.checks.length; li++){ if(_norm(_lbls[li])===_ns && _t2.checks[li]&&_t2.checks[li].colVars){ st=_t2.checks[li]; break; } }   // 라벨이 N인 스텝(점 무시 비교)
        if(!st && /^\d+$/.test(_ns)) st=_cs[parseInt(_ns,10)-1];   // 단일번호면 colVar-스텝 N번째 폴백
        if(!st)return mm; var cell=_colCell(st.colVars['col'+cn], idx); return cell!=null?cell:mm; }); }
  } }catch(_e2){}
  // 표 컬럼 인덱스 접근: colN('행') (행 1-based). 우선 이 스텝(chk/_tcColChk).colVars → 없으면 모든 스텝 colVars 병합(이전 호환)
  try{ var _ck=chk||_tcColChk; var cv=(_ck&&_ck.colVars)||null;
    if(!cv){ var _tc=_tcById(tcid); cv={}; if(_tc&&_tc.colVars)Object.assign(cv,_tc.colVars); if(_tc&&Array.isArray(_tc.checks))_tc.checks.forEach(function(x){ if(x&&x.colVars)Object.assign(cv,x.colVars); }); if(!Object.keys(cv).length)cv=null; }
    if(cv){ s=s.replace(/(^|[^.\w#])col(\d*)\s*\(\s*['"]?\s*([^'")]+?)\s*['"]?\s*\)/g, function(mm,pre,n,idx){ var cell=_colCell(cv['col'+(n||'1')], idx); return cell!=null?(pre+cell):mm; }); } }catch(e){}   // 앞이 '.'·'#'·영숫자면(=#N.colM의 일부) 가로채지 않음 → '#2.' 잔류 방지
  // Global Parameters fallback: 아직 ${VAR} 남아있으면 GP에서 치환
  if(s.indexOf('${')>=0 && typeof _gpSubstitute==='function'){
    var _mdl=''; try{ var _pv=_procVars[tcid]||{}; _mdl=String(_pv.model||_pv.MODEL||''); }catch(_e3){}
    s=_gpSubstitute(s,_mdl);
  }
  // [model/varname] 또는 [전역/varname] 형식 GP 치환
  if(s.indexOf('[')>=0 && typeof _gpData!=='undefined'){
    s=s.replace(/\[([^\]/\]]+)\/([^\]]+)\]/g, function(m, modelPart, varName){
      modelPart=modelPart.trim(); varName=varName.trim();
      var mid=(modelPart==='전역')?'__global__':modelPart;
      var rows=Array.isArray(_gpData[mid])?_gpData[mid]:[];
      // 전역에 없으면 글로벌도 병합 탐색
      var p=rows.find(function(r){return r.name===varName;});
      if(!p && mid!=='__global__'){
        var gr=Array.isArray(_gpData['__global__'])?_gpData['__global__']:[];
        p=gr.find(function(r){return r.name===varName;});
      }
      return (p&&p.value!=null)?String(p.value):m;
    });
  }
  return s; } // ${name}/$name 치환 + colN('행') 표 컬럼 접근 — 미정의는 원문 유지
// 표 컬럼 셀 접근: 인덱스(숫자·산술 '$i-2'·'all') 해석. all → 모든 값 줄바꿈 결합
// colVar 스텝의 '보이는 스텝 번호'(라벨, 예 .15→15). picker가 #<라벨>.colM 을 만들도록
function _colStepLbl(tc, st, fb){ try{ var checks=(tc&&tc.checks)||[]; var lbls=(typeof _stepLabels==='function')?_stepLabels(checks):[]; var ix=checks.indexOf(st); if(ix>=0&&lbls[ix])return lbls[ix]; }catch(e){} return String((fb==null?0:fb)+1); }
function _colCell(arr, idxStr){ if(!Array.isArray(arr)) return null; var s=String(idxStr==null?'':idxStr).trim();
  if(/^all$/i.test(s)) return arr.filter(function(x){return x!=null&&x!=='';}).map(String).join('\n');
  var n; if(/^[\d\s+\-*/().]+$/.test(s)){ try{ n=Math.round(Function('return('+s+')')()); }catch(e){ n=parseInt(s,10); } } else { n=parseInt(s,10); }
  if(isNaN(n)) return null; return arr[n-1]!=null?String(arr[n-1]):null;
}
// 대입/수식 RHS 평가: 변수·col 치환 → [산술] → [from->to] 치환 → 순수 산술 계산
function _tcEvalRHS(raw, tcid, chk){ var s=_subVars(String(raw==null?'':raw), tcid, chk);
  s=s.replace(/\[\s*([\d\s+\-*/().]+?)\s*\]/g, function(m,e){ try{ var r=Function('return('+e+')')(); return isFinite(r)?String(r):m; }catch(_){ return m; } });   // [3-2]→1
  s=s.replace(/(\S*?)\[\s*([^\]]*?)\s*->\s*([^\]]*?)\s*\]/g, function(m,pre,from,to){ return from?pre.split(from).join(to):pre; });   // val[e1000->1G]→치환(대괄호)
  // 대괄호 없는 'A -> B': 좌변값 A 를 B 로 매핑(A가 B를 포함하면 B만 추출, 아니면 B로). 예: "switchport mode access -> switchport" → "switchport"
  if(s.indexOf('[')<0){ var am=s.match(/^([\s\S]+?)\s*->\s*([\s\S]*)$/); if(am){ var _L=am[1].trim(), _R=am[2].trim(); s=(_R||_L); } }
  var t=s.trim(); if(/^[\d\s+\-*/().]+$/.test(t) && /[-+*/]/.test(t)){ try{ var rr=Function('return('+t+')')(); if(typeof rr==='number'&&isFinite(rr)) return String(rr); }catch(e){} }   // ${a}+${b}
  return s;
}
// 고정폭 테이블 파싱: --- 구분선으로 컬럼 범위·헤더 인식
// 헤더 줄을 '2칸 이상 공백' 기준으로 컬럼 분리 → [시작,끝] 범위 배열 (단어 내 단일공백 'TCP SYN'은 유지)
function _colsFromHeader(line){
  line=String(line||''); var cols=[]; var pos=0; var parts=line.split(/(\s{2,})/);
  for(var i=0;i<parts.length;i++){ var p=parts[i]; if(i%2===0 && p.trim()) cols.push({start:pos,text:p.trim()}); pos+=p.length; }
  return cols.map(function(c,i){ return [c.start,(i+1<cols.length)?cols[i+1].start:99999]; });
}
// 구분선(---) 없는 표: 헤더(2칸 공백으로 컬럼 분리) + 아래 줄들이 그 컬럼에 정렬되면 표로 인식
function _tableColsNoSep(lines){
  const idxs=[]; for(let i=0;i<lines.length;i++){ if(String(lines[i]).trim()) idxs.push(i); }
  if(idxs.length<2) return null;
  for(let h=0; h<Math.min(idxs.length,5); h++){
    const hidx=idxs[h]; const hc=_colsFromHeader(lines[hidx]); if(hc.length<2) continue;
    const dataIdx=idxs.filter(function(i){return i>hidx;}); if(!dataIdx.length) continue;
    const ok=dataIdx.filter(function(i){ const ln=lines[i]; let f=0; for(let k=0;k<hc.length;k++){ if(String(ln).slice(hc[k][0],hc[k][1]).trim()!=='') f++; } return f>=2; });   // 2개 이상 컬럼에 값 있는 줄
    if(ok.length>=Math.max(1, Math.floor(dataIdx.length*0.5))){   // 데이터 줄 절반 이상 정렬 → 표
      const ranges=hc;
      const cell=(line,idx)=>{ const r=ranges[idx]; if(!r) return ''; const end=(idx===ranges.length-1)?Math.max(String(line||'').length,r[1]):r[1]; return String(line||'').slice(r[0],end).trim(); };
      const headers=ranges.map((r,i)=>cell(lines[hidx],i));
      return {sep:hidx, ranges:ranges, headers:headers, lines:lines, cell:cell, noSep:true};
    }
  }
  return null;
}
// SNMP 출력(OID = Type: Value)을 표로 인식 — 줄마다 OID/Type/Value 셀 위치를 직접 계산(고정폭 아님)
function _tableColsSNMP(lines){
  const oidRe=/^[A-Za-z0-9][A-Za-z0-9._:\-\/]*$/;
  const parse=function(ln){ ln=String(ln||''); const eq=ln.indexOf('='); if(eq<=0) return null;
    const oidRaw=ln.slice(0,eq); const oid=oidRaw.trim(); if(!oid||/\s/.test(oid)||!/[.:]/.test(oid)||!oidRe.test(oid)) return null;
    const oS=oidRaw.search(/\S/); const oE=oS+oid.length; const valOff=eq+1; const after=ln.slice(valOff);
    const tm=after.match(/^(\s*)([A-Za-z][A-Za-z0-9\-]*)(\s*:\s*)([\s\S]*)$/);
    if(tm){ const type=tm[2]; const tS=valOff+tm[1].length; const tE=tS+type.length; const vOff=valOff+tm[1].length+tm[2].length+tm[3].length; const vrest=ln.slice(vOff); const vlead=(vrest.search(/\S/)>=0?vrest.search(/\S/):0); const val=vrest.trim(); const vS=vOff+vlead; const vE=vS+val.length; return {oid:oid,type:type,val:val,ranges:[[oS,oE],[tS,tE],[vS,vE]]}; }
    const alead=(after.search(/\S/)>=0?after.search(/\S/):0); const val=after.trim(); const vS=valOff+alead; const vE=vS+val.length; return {oid:oid,type:'',val:val,ranges:[[oS,oE],[vS,vE]]};
  };
  const content=lines.filter(function(l){return String(l).trim();}); if(!content.length) return null;
  let match=0,typed=0; content.forEach(function(l){ const p=parse(l); if(p){ match++; if(p.type)typed++; } });
  if(match < Math.max(1, Math.ceil(content.length*0.6))) return null;   // 60%↑가 OID=값 형태여야 SNMP 표
  const has3 = typed >= Math.ceil(match*0.5);
  const headers = has3?['OID','Type','Value']:['OID','Value'];
  const dataLines = content.filter(function(l){ return parse(l); });
  const cell=function(line,idx){ const p=parse(line); if(!p) return idx===0?String(line||'').trim():''; const arr=has3?[p.oid,p.type,p.val]:[p.oid,p.val]; return arr[idx]!=null?arr[idx]:''; };
  const lineRanges=function(line){ const p=parse(line); return p?p.ranges:[]; };
  const ranges = headers.map(function(h,i){return [i,i+1];});
  return {sep:-1, ranges:ranges, headers:headers, lines:dataLines, cell:cell, snmp:true, lineRanges:lineRanges};
}
function _tableCols(output){
  const lines=String(output||'').split(/\r?\n/); let sep=-1;
  for(let i=0;i<lines.length;i++){ if(/^[\s|+\-]+$/.test(lines[i]) && /-{3,}/.test(lines[i])){ sep=i; break; } }   // 구분선: 공백·하이픈(·|·+)만 + 하이픈 3개↑
  if(sep<1) return _tableColsNoSep(lines) || _tableColsSNMP(lines);   // 구분선 없어도: 헤더+정렬 표 → SNMP(OID=값) 표
  let ranges=[]; let m; const re=/-+/g; while((m=re.exec(lines[sep]))){ ranges.push([m.index,m.index+m[0].length]); }
  if(!ranges.length) return null;
  // 구분선이 '연결'(한 덩어리)이라 컬럼이 1개로만 잡히는데 헤더는 여러 컬럼이면 → 헤더 단어 위치로 컬럼 분리(연속 ----- 표 지원)
  const _hc=_colsFromHeader(lines[sep-1]||'');
  if(_hc.length>=2 && ranges.length<_hc.length) ranges=_hc;
  const cell=(line,idx)=>{ const r=ranges[idx]; if(!r) return ''; const end=(idx===ranges.length-1)?Math.max(String(line||'').length,r[1]):r[1]; return String(line||'').slice(r[0],end).trim(); };
  const headers=ranges.map((r,i)=>cell(lines[sep-1]||'',i));
  return {sep:sep,ranges:ranges,headers:headers,lines:lines,cell:cell};
}
function _extractTableCell(output, rowKey, col){
  const t=_tableCols(output); if(!t) return '';
  const data=t.lines.slice(t.sep+1);
  let row=data.find(l=>t.cell(l,0)===rowKey); if(!row) row=data.find(l=>l.indexOf(rowKey)>=0); if(!row) return ''; // 첫 컬럼 정확일치 우선
  let ci=/^#\d+$/.test(col)?(parseInt(col.slice(1))-1):t.headers.findIndex(h=>h.toLowerCase()===String(col).toLowerCase());
  if(ci<0||ci>=t.ranges.length) return '';
  return t.cell(row,ci);
}
function _extractVar(output,rule){
  if(!rule||!String(rule).trim()) return String(output||'').trim(); // 규칙 비우면 결과 전체
  rule=String(rule).trim(); const out=String(output||'');
  // 여러 줄 추출: "#lines:3,4,7" → 해당 1-based 줄들을 \n 으로 결합
  const _ml=rule.match(/^#lines?\s*:\s*(.+)$/i); if(_ml){ const _ls=out.split(/\r?\n/); return _parseLineSpec(_ml[1], _ls.length).map(function(n){ return _ls[n-1]==null?'':_ls[n-1]; }).join('\n'); }
  // 테이블 컬럼 추출: "행키 || 컬럼명" 또는 "행키 || #N"
  const mt=rule.match(/^(.*?)\s*\|\|\s*(.+)$/); if(mt){ return _extractTableCell(out, mt[1].trim(), mt[2].trim()); }
  if(/[()\\\[\]+*?^$|]/.test(rule)){ try{ const re=new RegExp(rule,'m'); const m=out.match(re); if(m) return (m[1]!=null?m[1]:m[0]); }catch(e){} }
  const line=out.split(/\r?\n/).find(l=>l.indexOf(rule)>=0); if(!line) return '';
  const after=line.slice(line.indexOf(rule)+rule.length); const m2=after.match(/^\s*[:=]\s*(.+?)\s*$/); if(m2) return m2[1]; return String(line).trim();
}
// ── 변수 다중 추출 / 골든 / 영속화 (multi-var, tc.varVals/tc.varManual) ──
function _tcById(tcid){ return tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); }
function _stepExtracts(c){
  if(!c) return [];
  if(Array.isArray(c.extracts)) return c.extracts.filter(e=>e&&String(e.var||'').trim()).map(e=>({var:String(e.var).trim(), rule:String(e.rule==null?'':e.rule)}));
  if(c.extractVar && String(c.extractVar).trim()) return [{var:String(c.extractVar).trim(), rule:String(c.extractRule==null?'':c.extractRule)}];
  return [];   // 순수 함수: 읽기 시 c를 변형하지 않음
}
function _extractRuleFor(c,name){ name=String(name||'').trim(); const e=_stepExtracts(c).find(x=>x.var===name); return e?e.rule:''; }
function _stepSyncLegacy(c){ const l=_stepExtracts(c); if(l.length){ c.extractVar=l[0].var; c.extractRule=l[0].rule; } else { try{ delete c.extractVar; delete c.extractRule; }catch(e){ c.extractVar=''; c.extractRule=''; } } }
function _stepExtractsArr(c){ if(!Array.isArray(c.extracts)){ c.extracts=[]; if(c.extractVar && String(c.extractVar).trim()) c.extracts.push({var:String(c.extractVar).trim(), rule:String(c.extractRule==null?'':c.extractRule)}); } return c.extracts; }
function _stepAddExtract(c,name,rule){ name=String(name||'').trim(); if(!c||!name) return; const arr=_stepExtractsArr(c); const ex=arr.find(e=>String(e.var||'').trim()===name); if(ex) ex.rule=String(rule==null?'':rule); else arr.push({var:name, rule:String(rule==null?'':rule)}); _stepSyncLegacy(c); }
function _stepDelExtract(c,name){ name=String(name||'').trim(); if(!c) return; const arr=_stepExtractsArr(c); c.extracts=arr.filter(e=>String(e.var||'').trim()!==name); _stepSyncLegacy(c); }
function _varIsManual(tc,name){ return !!(tc&&tc.varManual&&tc.varManual[String(name||'').trim()]); }
function _varsRestore(tcid){ if(_procVars[tcid]!==undefined) return; const tc=_tcById(tcid); if(tc&&tc.varVals) _procVars[tcid]=Object.assign({}, tc.varVals); }
function _varSetAuto(tcid,name,value){ name=String(name||'').trim(); if(!name) return; const tc=_tcById(tcid); if(_varIsManual(tc,name)) return; _procVars[tcid]=_procVars[tcid]||{}; _procVars[tcid][name]=value; if(tc){ tc.varVals=tc.varVals||{}; tc.varVals[name]=value; } }
function _varSetUser(tcid,name,value,manual){ name=String(name||'').trim(); if(!name) return; const tc=_tcById(tcid); _procVars[tcid]=_procVars[tcid]||{}; _procVars[tcid][name]=value; if(tc){ tc.varVals=tc.varVals||{}; tc.varVals[name]=value; tc.varManual=tc.varManual||{}; if(manual) tc.varManual[name]=true; else delete tc.varManual[name]; } }
async function tcVarsClear(tcid){ _procVars[tcid]={}; const tc=_tcById(tcid); if(tc){ tc.varVals={}; tc.varManual={}; await saveTCFile(tc); } _respRefresh(tcid); tcProcRefresh(tcid); }
// 골든 변수: criteria가 ${name} 한 개이고 그 변수를 이 스텝이 추출하면 골든 후보 (규칙 비어도 인정 — F-1)
function _goldenVar(c){ if((c.type||'')!=='expr') return null; const m=String(c.criteria||'').match(/^\s*\$\{(\w+)\}\s*$/); if(!m) return null; const e=_stepExtracts(c).find(x=>x.var===m[1]); return e?m[1]:null; }
// 저장된 출력으로 즉시 재판정 (값/타입 변경 시) — 출력은 그대로, repeatResult만 갱신
function _reJudge(c,tcid){
  if(!c) return;
  _tcColChk=c;   // 이 스텝 기준으로 colN('행') 해석(스텝별 col1,2)
  const tp=c.type||'contains';
  if(tp==='expr'){
    const gn=_goldenVar(c);
    if(gn && _varIsManual(_tcById(tcid),gn)){
      const live=_extractVar(_respShownLines(c).join('\n'), _subVars(_extractRuleFor(c,gn),tcid));
      const gold=(_procVars[tcid]||{})[gn];
      c.repeatResult=(String(gold!=null?gold:'').trim()!=='' && String(live)===String(gold))?'Pass':'Fail';
    } else {
      c.repeatResult=_evalCond(c.criteria,tcid)?'Pass':'Fail';
    }
    return;
  }
  if(tp==='stepcmp'){ if(!String(c.output||'').trim()){ c.repeatResult=''; return; } var jr=_judgeStepCmp(tcid,c,c.output); c.repeatResult=jr.pass?'Pass':'Fail'; return; }
  if(tp==='none'){ c.repeatResult=''; return; }
  if(!String(c.output||'').trim()) return;        // 실행 결과 없으면 판정 유지
  const out=_respShownLines(c).join('\n');
  if(tp==='diff'){ const dv=_judgeDiff(out, c.baseline, c.excludeLines); c.repeatResult=dv.pass?'Pass':'Fail'; return; }
  if(tp==='table'){ c.repeatResult=_judgeTable(_applyQuery(out,c.query), _subVars(c.criteria,tcid)).pass?'Pass':'Fail'; return; }
  c.repeatResult=_judgeCheck(out, _subVars(c.criteria,tcid), tp, c.excludeLines, c.query)||'';
}
// 반복 판정: 회차별 출력 배열을 모드별로 판정
function _repeatVerdict(iters, criteria, type, mode, m, exclude, query){
  const outs=iters.map(it=>it.output||'');
  const n=outs.length;
  const per=outs.map(o=>_judgeCheck(o,criteria,type,exclude,query)||'-');
  const passN=per.filter(v=>v==='Pass').length;
  if(mode==='mofn'){ const need=parseInt(m)||n; return {pass:passN>=need, detail:passN+'/'+n+' 합격 (기준 '+need+'회 이상)', per}; }
  if(mode==='stable'){ const first=outs[0]; const same=outs.every(o=>o===first); return {pass:same&&n>1, detail:(same?('전 '+n+'회 출력 동일'):'회차 간 출력 변화 감지'), per}; }
  if(mode==='counter'){
    const key=((criteria||'').split(':')[0]||'').trim();
    const nums=outs.map(o=>{ const line=o.split(/\r?\n/).find(l=>l.indexOf(key)>=0)||''; const all=line.match(/\d[\d,]*/g); return all?parseInt(all[all.length-1].replace(/,/g,'')):null; });
    const valid=nums.filter(x=>x!=null);
    if(valid.length<2) return {pass:false, detail:'카운터 값 추출 실패 (키: "'+key+'")', per, nums};
    const inc=nums[nums.length-1]>nums[0];
    return {pass:!inc, detail:'카운터("'+key+'") '+nums.join(' → ')+(inc?' · 증가 → 불합격':' · 증가 없음 → 합격'), per, nums};
  }
  return {pass:passN===n&&n>0, detail:passN+'/'+n+' 합격 (전회 합격 필요)', per};
}
// 호출(call): 다른 절차(TC)의 단계들을 현재 컨텍스트(변수·로그)로 실행
async function _runCalled(callerTcid, calledTc, params, depth, seen){
  if(depth>6 || !calledTc) return;
  if(params){ String(params).split(/[,\n]/).forEach(p=>{ const i=p.indexOf('='); if(i>0){ const k=p.slice(0,i).trim(); const v=_subVars(p.slice(i+1).trim(),callerTcid); if(k){ _procVars[callerTcid]=_procVars[callerTcid]||{}; _procVars[callerTcid][k]=v; } } }); }
  var _ccArr=(calledTc.checks||[]);
  for(var _ii=0;_ii<_ccArr.length;_ii++){
    var cc=_ccArr[_ii];
    const k=cc.kind||'cli';
    if(k==='comment'){ _logRec(callerTcid,{t:_nowStr().slice(11),kind:'comment',name:cc.text||'(주석)',status:'info'}); continue; }
    if(k==='group'){ _logRec(callerTcid,{t:_nowStr().slice(11),kind:'group',name:cc.label||'단계',status:'info'}); continue; }
    if(k==='model'){ continue; }
    if(k==='loop'||k==='switch'){ continue; } // v1: 호출 절차 내부 제어문은 건너뜀
    if(k==='call'){ const sub=tcList.find(t=>t.tcid===cc.callTcid); if(sub && !seen.has(sub.tcid)){ const ns=new Set(seen); ns.add(sub.tcid); _logRec(callerTcid,{t:_nowStr().slice(11),kind:'group',name:'↪ 호출: '+sub.tcid,status:'info'}); await _runCalled(callerTcid, sub, cc.callParams, depth+1, ns); } continue; }
    await tcCheckRun(callerTcid, cc.id, cc);
    // 스텝 사이 대기 — 다음 스텝의 IDLE Interval(스텝별 · 없으면 전역)
    var _nxc=_ccArr[_ii+1]; var _dlyc=_nxc?_tcStepCmdDelay(_nxc):_TC_STEP_DEFAULT_IDLE;
    if(_dlyc>0) await _sleep(_dlyc);
  }
}
// iTest식 세션 상태: tcid → Set(열린 세션키). Session Open이 실행된 세션에서만 CLI 허용 (순서 기반)
let _procSessOpen={};
let _autoSess={};   // 자동 세션: 실행 중 자동으로 연 세션 키 집합(tcid별) → 절차 종료 시 자동 close
let _sessBarCol={};   // 세션·접속 장비 바 접힘 상태(tcid별)
var _sessPop={tcid:'',lab:'',vendor:'',family:'',group:'',status:'',q:''};   // 세션 추가 팝업 필터 상태
let _procCol={}; // Procedure 헤더 접힘 상태 (id → true)
function tcProcToggle(tcid,id){ const cur=(_procCol[id]===undefined)?true:_procCol[id]; _procCol[id]=!cur; tcProcRefresh(tcid); }
function _sessKey(l){ return l ? (l.id || (l.ip+':'+(l.port||''))) : ''; }
function _isSessOpen(tcid,l){ const s=_procSessOpen[tcid]; return !!(s && s.has(_sessKey(l))); }
// 자동 세션: 세션이 없으면 Device 관리 계정으로 자동 open (Session Open 스텝 불필요)
async function _ensureSess(tcid,l){
  if(!l||!l.ip) return {ok:false,error:'장비 IP 없음 — Device 관리에서 등록'};
  const _p=String(l.protocol||'telnet').toLowerCase();
  if(_p==='snmp'||_p==='rest') return {ok:false,error:'['+_p.toUpperCase()+'] 프로토콜은 CLI 세션을 지원하지 않습니다. 스텝 Action을 SNMP/REST로 변경하거나 장비 프로토콜을 확인하세요.'};
  if(_isSessOpen(tcid,l)) return {ok:true};
  // Properties의 "접속 재시도"(_connRetry회 × _connRetryInt초 간격) 적용:
  // reload 뒤 재부팅 중이면 장비가 telnet/ssh를 안 받으므로 첫 시도 실패 후 간격만큼 대기하며 재시도.
  // _connRetry=0 이면 재시도 없음(딱 1회만 시도).
  const _tryOnce=async function(){
    try{
      const r=await fetch('/api/session-open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host:l.ip,port:l.port,protocol:_p,username:l.username,password:l.password,secret:l.secret,device_type:l.device_type,fast:true})});
      const d=await r.json();
      if(d&&d.ok){
        _procSessOpen[tcid]=_procSessOpen[tcid]||new Set(); _procSessOpen[tcid].add(_sessKey(l));
        _autoSess[tcid]=_autoSess[tcid]||new Set(); _autoSess[tcid].add(_sessKey(l));
        return {ok:true,auto:true};
      }
      return {ok:false,error:(d&&d.error)||'세션 열기 실패'};
    }catch(e){ return {ok:false,error:e.message}; }
  };
  var _maxRetry=(typeof _connRetry==='number'&&_connRetry>=0)?_connRetry:0;
  var _iv=(typeof _connRetryInt==='number'&&_connRetryInt>0)?_connRetryInt:30;
  var _last;
  for(var _i=0; _i<=_maxRetry; _i++){
    _last=await _tryOnce();
    if(_last.ok) return _last;
    if(_i<_maxRetry){
      // 다음 시도 전 진행 로그 (라이브 로그에 표시 — 사용자가 대기 중임을 인지)
      try{ _logRec(tcid,{t:_nowStr().slice(11),kind:'group',name:'⏳ 세션 재시도 대기 '+_iv+'s ('+(_i+1)+'/'+_maxRetry+') · '+(l.name||l.ip)+' · '+(_last.error||''),status:'info'}); }catch(_e){}
      await _sleep(_iv*1000);
    }
  }
  return _last||{ok:false,error:'세션 열기 실패'};
}
// 절차 종료 시 자동으로 연 세션 일괄 close (수동 Session Open 으로 연 것은 유지)
async function _closeAutoSess(tcid){ const set=_autoSess[tcid]; if(!set||!set.size) return; for(const k of Array.from(set)){ const l=labList.find(x=>_sessKey(x)===k); if(l&&l.ip){ try{ await fetch('/api/session-close',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host:l.ip,port:l.port,protocol:l.protocol})}); }catch(e){} } if(_procSessOpen[tcid]) _procSessOpen[tcid].delete(k); } set.clear(); }
// 스텝 행 "대상 장비" 드롭다운 — Device 관리 등록 장비(장비명 · IP), 비우면 위 스텝 장비 상속
function _devSelCell(tcid,c){
  var tc=_tcById(tcid); var arr=(tc&&tc.checks)||[]; var ix=arr.findIndex(function(x){return x.id===c.id;});
  var q=function(s){return String(s==null?'':s).replace(/"/g,'&quot;');}; var t=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');};
  var act=String(c.action||'CLI');
  var isMeter=(['Traffic Connect','ARP Send','Traffic Start','Traffic Stop','Traffic 조회','Traffic Disconnect','계측기','REST'].indexOf(act)>=0);
  var isMeterDev=function(d){ return /계측|spirent|ixia|n2x|stc/i.test(String((d&&d.role)||'')+' '+String((d&&d.vendor)||'')+' '+String((d&&d.model)||'')+' '+String((d&&d.name)||'')); };
  var devGroup=function(d){ var mn=String((d&&(d.model||d.name))||'').trim(); var mnBase1=mn.replace(/_\d+$/,''); var mnBase2=mn.replace(/\s*\([^)]*\)\s*$/,''); var mnBase3=mnBase2.replace(/_\d+$/,''); var m=(typeof modelList!=='undefined'?modelList:[]).find(function(x){var xn=String(x.name||'').trim(); return xn===mn||xn===mnBase1||xn===mnBase2||xn===mnBase3;}); return m?String(m.group||''):''; };   // model 미입력 장비는 이름으로 모델 매칭. 접미사(_2, _3...) 및 괄호 접미사(버전 등) 벗겨서도 시도
  var seen={}; var sessOpts=[], devOpts=[];
  var mk=function(did,pfx){ if(!did||seen[did])return null; var d=(labList||[]).find(function(x){return x.id===did;}); if(!d)return null; seen[did]=1; return {id:did,label:(pfx||'')+((d.model||d.name)||did)+(d.ip?(' · '+d.ip):'')}; };
  if(isMeter){ (labList||[]).forEach(function(d){ if(d&&isMeterDev(d)){ var o=mk(d.id,''); if(o)devOpts.push(o); } }); }
  else {
    var sessIds=(typeof _tcSessIds==='function')?_tcSessIds(tc):((tc&&tc.sessions)||[]);
    sessIds.forEach(function(did,i){ var o=mk(did,'S'+(i+1)+' · '); if(o)sessOpts.push(o); });
    // 모델그룹/모델은 TC Info 값(tc.modelGroup, tc.model) 사용 — 스텝 위 model 헤더 대신.
    var grp=String((tc&&tc.modelGroup)||'').trim();
    var mdl=String((tc&&tc.model)||'').trim();
    if(grp && grp!=='공통'){
      (labList||[]).forEach(function(d){
        if(!d||!d.ip) return;
        if(devGroup(d)!==grp) return;
        // 모델명까지 지정돼 있으면 그 모델 장비만
        if(mdl){
          var dm=String((d.model||d.name)||'').trim();
          if(dm!==mdl && dm.replace(/_\d+$/,'')!==mdl && dm.replace(/\s*\([^)]*\)\s*$/,'')!==mdl) return;
        }
        var o=mk(d.id,''); if(o)devOpts.push(o);
      });
    }
  }
  if(!sessOpts.length && !devOpts.length) return '<span style="font-size:9px;color:#c0c6d0;" title="'+(isMeter?'계측기 장비를 Device 관리에 등록하세요':'세션 바 지정 또는 TC Info 에서 모델그룹/모델 선택 후 해당 장비를 Device 관리에 등록하세요')+'">—</span>';
  var cur=String(c.devId||'');
  var inh=''; if(!cur && !isMeter){ for(var k=ix-1;k>=0;k--){ if(arr[k].devId){ var d2=(labList||[]).find(function(x){return x.id===arr[k].devId;}); if(d2){ inh=d2.model||d2.name; break; } } } }
  var oh=function(o){return '<option value="'+o.id+'"'+(cur===o.id?' selected':'')+' title="'+q(o.label)+'" style="color:#1c2230;background:#fff;font-weight:600;">'+t(o.label)+'</option>';};
  var body='<option value="" style="color:#9aa1ad;background:#fff;">'+(inh?('↑ '+t(inh)+' (상속)'):'(장비 선택 안 함)')+'</option>'+sessOpts.map(oh).join('')+((sessOpts.length&&devOpts.length)?'<option disabled style="color:#9aa1ad;background:#fff;">──────────</option>':'')+devOpts.map(oh).join('');
  return '<select onmousedown="event.stopPropagation()" onclick="event.stopPropagation()" onchange="tcCheckSave(\''+tcid+'\',\''+c.id+'\',\'devId\',this.value)" title="'+(isMeter?'계측기 선택':'세션/장비 (세션바 + TC Info 모델그룹/모델)')+'" style="width:100%;min-width:170px;max-width:260px;font-size:11.5px;border:none;background:transparent;outline:none;cursor:pointer;color:'+(cur?'#2d6fd4':'#5a6376')+';font-weight:700;">'+body+'</select>';
}
// ── iTest식 라이브 터미널 팝업 (가벼움 — 스텝마다 transcript 흘려보냄) ──
let _liveTermOn=(typeof localStorage!=='undefined'&&localStorage.getItem('utop_liveterm')==='1');
let _consoleDev=null; let _consoleHist=[]; let _consoleHistIdx=0;   // 세션 장비 우클릭 → 접속(인터랙티브 콘솔)
function toggleLiveTerm(tcid){
  _liveTermOn=!_liveTermOn;
  try{localStorage.setItem('utop_liveterm',_liveTermOn?'1':'0');}catch(e){}
  if(!_liveTermOn){ liveTermHide(); return; }   // liveTermHide 안에서 라벨/상태 갱신됨
  liveTermShow();
  // ON 으로 켤 때 라벨 즉시 갱신
  try{
    document.querySelectorAll('.lt-toggle-btn').forEach(function(btn){
      btn.style.color='#0d9488';
      btn.style.borderColor='#9ad9d0';
      btn.innerHTML='<i class="ti ti-terminal-2"></i> 터미널 라이브 ON';
    });
  }catch(e){}
}
function _liveTermEl(){
  let el=document.getElementById('live-term'); if(el) return el;
  el=document.createElement('div'); el.id='live-term';
  // 커스텀 8방향 리사이즈 (아래 리사이즈 핸들 코드로 처리). resize:none 으로 브라우저 기본 그립 끔.
  el.style.cssText='position:fixed;right:22px;bottom:22px;width:900px;max-width:96vw;height:70vh;min-width:360px;min-height:200px;max-height:96vh;background:#0b0e14;border:1px solid #2a3040;border-radius:10px;box-shadow:0 16px 48px rgba(0,0,0,0.55);z-index:9000;display:none;flex-direction:column;overflow:hidden;resize:none;box-sizing:border-box;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;';
  el.innerHTML='<div id="live-term-head" style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#151a26;border-bottom:1px solid #2a3040;flex-shrink:0;user-select:none;">'
    +'<i class="ti ti-terminal-2" style="color:#19c98a;font-size:16px;"></i><span style="font-size:12.5px;font-weight:700;color:#e8eaf0;">라이브 터미널</span>'
    +'<span id="live-term-dev" style="font-size:11px;color:#6b7385;"></span><span style="flex:1;"></span>'
    +'<i class="ti ti-eraser" title="지우기" onclick="liveTermClear()" style="color:#8b93a7;cursor:pointer;font-size:15px;"></i>'
    +'<i class="ti ti-minus" title="최소화" onclick="liveTermToggleMin()" style="color:#8b93a7;cursor:pointer;font-size:15px;"></i>'
    +'<i class="ti ti-x" title="닫기" onclick="liveTermHide()" style="color:#8b93a7;cursor:pointer;font-size:15px;"></i></div>'
    +'<div id="live-term-body" style="flex:1;overflow-y:auto;padding:12px 15px;font-size:13.5px;line-height:1.55;color:#c8d0e0;white-space:pre-wrap;word-break:break-word;background:#0b0e14;"></div>'
    +'<div id="live-term-inbar" style="display:none;align-items:center;gap:8px;padding:8px 12px;background:#0f1320;border-top:1px solid #2a3040;flex-shrink:0;"><span id="live-term-prompt" style="color:#19c98a;font-size:13px;font-weight:700;flex-shrink:0;">#</span><input id="live-term-input" placeholder="명령 입력 후 Enter (↑/↓ 히스토리)" autocomplete="off" spellcheck="false" onkeydown="tcConsoleKey(event)" style="flex:1;background:transparent;border:none;outline:none;color:#e8eaf0;font-family:inherit;font-size:13.5px;"></div>'
    // 8방향 리사이즈 핸들 (4모서리는 자유 방향, 4면은 해당 축만)
    +'<div class="lt-rs" data-dir="n"  style="position:absolute;top:0;left:8px;right:8px;height:6px;cursor:ns-resize;z-index:9999;"></div>'
    +'<div class="lt-rs" data-dir="s"  style="position:absolute;bottom:0;left:8px;right:8px;height:6px;cursor:ns-resize;z-index:9999;"></div>'
    +'<div class="lt-rs" data-dir="w"  style="position:absolute;left:0;top:8px;bottom:8px;width:6px;cursor:ew-resize;z-index:9999;"></div>'
    +'<div class="lt-rs" data-dir="e"  style="position:absolute;right:0;top:8px;bottom:8px;width:6px;cursor:ew-resize;z-index:9999;"></div>'
    +'<div class="lt-rs" data-dir="nw" style="position:absolute;top:0;left:0;width:12px;height:12px;cursor:nwse-resize;z-index:10000;"></div>'
    +'<div class="lt-rs" data-dir="ne" style="position:absolute;top:0;right:0;width:12px;height:12px;cursor:nesw-resize;z-index:10000;"></div>'
    +'<div class="lt-rs" data-dir="sw" style="position:absolute;bottom:0;left:0;width:12px;height:12px;cursor:nesw-resize;z-index:10000;"></div>'
    +'<div class="lt-rs" data-dir="se" style="position:absolute;bottom:0;right:0;width:14px;height:14px;cursor:nwse-resize;z-index:10000;"></div>';
  document.body.appendChild(el);
  // 커스텀 8방향 리사이즈 (offsetLeft/Top base + scale 보정 델타식)
  (function(){
    var MIN_W=360, MIN_H=200;
    var handles=el.querySelectorAll('.lt-rs');
    var active=false, dir='', sx=0, sy=0, sw=0, sh=0, sl=0, st=0, scale=1;
    handles.forEach(function(h){
      h.addEventListener('mousedown', function(e){
        e.preventDefault(); e.stopPropagation();
        if(typeof el._liveTermEnsureLTP==='function') el._liveTermEnsureLTP();
        dir=h.getAttribute('data-dir');
        // base 는 offsetLeft/Top (rect 와 100px 오차나는 좌표계 회피)
        sl=el.offsetLeft; st=el.offsetTop;
        sw=el.offsetWidth; sh=el.offsetHeight;
        sx=e.clientX; sy=e.clientY;
        // scale 보정 (조상 transform:scale 있으면 rect.width != offsetWidth)
        var _r=el.getBoundingClientRect();
        scale=(_r.width>0 && el.offsetWidth>0) ? (_r.width/el.offsetWidth) : 1;
        console.log('[LT] resize start dir=',dir,'base=',sl,st,sw,'x',sh,'scale=',scale.toFixed(4));
        active=true; document.body.style.userSelect='none'; document.body.style.cursor=getComputedStyle(h).cursor;
      });
    });
    document.addEventListener('mousemove', function(e){
      if(!active) return;
      var dx=(e.clientX-sx)/scale, dy=(e.clientY-sy)/scale;
      var newW=sw, newH=sh, newL=sl, newT=st;
      if(dir.indexOf('e')>=0){ newW=Math.max(MIN_W, sw+dx); }
      if(dir.indexOf('s')>=0){ newH=Math.max(MIN_H, sh+dy); }
      if(dir.indexOf('w')>=0){
        var _w=Math.max(MIN_W, sw-dx);
        newL=sl+(sw-_w); newW=_w;
      }
      if(dir.indexOf('n')>=0){
        var _h=Math.max(MIN_H, sh-dy);
        newT=st+(sh-_h); newH=_h;
      }
      el.style.left=newL+'px'; el.style.top=newT+'px';
      el.style.width=newW+'px'; el.style.height=newH+'px';
    });
    document.addEventListener('mouseup', function(){
      if(active){ active=false; document.body.style.userSelect=''; document.body.style.cursor=''; }
    });
  })();
  // 헤더 잡고 이동 — offsetLeft/Top base + 델타식 + scale 보정
  (function(){
    var head=el.querySelector('#live-term-head');
    var active=false, sx=0, sy=0, baseL=0, baseT=0, scale=1;
    head.style.cursor='move';
    function _normalizeInset(){
      // 좌표계 전환: inset/right/bottom → 명시적 left/top (offsetLeft 기준). 크기는 유지.
      var l=el.offsetLeft, t=el.offsetTop;
      el.style.inset='';
      el.style.right='auto';
      el.style.bottom='auto';
      el.style.left=l+'px';
      el.style.top=t+'px';
    }
    head.addEventListener('mousedown', function(e){
      if(e.button!==0) return;
      if(e.target.closest('.ti')) return;
      if(e.target.closest && e.target.closest('.lt-rs')) return;
      // 팝업 가장자리 8px 이내는 리사이즈 우선
      var r0=el.getBoundingClientRect();
      var EDGE=8;
      if(e.clientY-r0.top<EDGE || r0.bottom-e.clientY<EDGE
         || e.clientX-r0.left<EDGE || r0.right-e.clientX<EDGE) return;
      _normalizeInset();
      // base 를 offsetLeft/Top 으로 (rect 와 100px 오차 회피)
      baseL=el.offsetLeft; baseT=el.offsetTop;
      sx=e.clientX; sy=e.clientY;
      // scale 보정 계수
      var _r=el.getBoundingClientRect();
      scale=(_r.width>0 && el.offsetWidth>0) ? (_r.width/el.offsetWidth) : 1;
      console.log('[LT] drag start base=',baseL,baseT,'scale=',scale.toFixed(4),
                  'offsetParent=', el.offsetParent && el.offsetParent.tagName);
      active=true;
      document.body.style.userSelect='none';
      e.preventDefault();
    });
    document.addEventListener('mousemove', function(e){
      if(!active) return;
      var w=el.offsetWidth;
      var vw=window.innerWidth, vh=window.innerHeight;
      var nx=baseL+(e.clientX-sx)/scale;
      var ny=baseT+(e.clientY-sy)/scale;
      nx=Math.max(-w+80, Math.min(vw-80, nx));
      ny=Math.max(0, Math.min(vh-40, ny));
      el.style.left=nx+'px';
      el.style.top=ny+'px';
    });
    document.addEventListener('mouseup', function(){
      if(!active) return;
      active=false;
      document.body.style.userSelect='';
    });
    el._liveTermEnsureLTP=_normalizeInset;
  })();
  return el;
}
function liveTermShow(dev){ const el=_liveTermEl(); el.style.display='flex'; const d=document.getElementById('live-term-dev'); if(d) d.textContent=dev?('· '+dev):''; const bar=document.getElementById('live-term-inbar'); if(bar) bar.style.display='none'; }
function liveTermHide(){
  const el=document.getElementById('live-term'); if(el) el.style.display='none';
  _consoleDev=null;
  const bar=document.getElementById('live-term-inbar'); if(bar) bar.style.display='none';
  // X 로 닫으면 토글 상태도 OFF 로 동기화
  _liveTermOn=false;
  try{ localStorage.setItem('utop_liveterm','0'); }catch(e){}
  // 현재 화면에 그려진 모든 라이브 터미널 토글 버튼을 직접 OFF 표기로 교체 (재렌더 없이 확실)
  try{
    document.querySelectorAll('.lt-toggle-btn').forEach(function(btn){
      btn.style.color='var(--text3)';
      btn.style.borderColor='';
      btn.innerHTML='<i class="ti ti-terminal-2"></i> 터미널 라이브 OFF';
    });
  }catch(e){}
}
function liveTermClear(){ _ltQueue=[]; _ltPlaying=false; const b=document.getElementById('live-term-body'); if(b) b.textContent=''; }
function liveTermToggleMin(){ const el=document.getElementById('live-term'); if(!el) return; const b=document.getElementById('live-term-body'); const inbar=document.getElementById('live-term-inbar');
  if(el.dataset.min==='1'){
    // 최소화 해제 → 이전 크기 복원
    b.style.display='block'; if(inbar) inbar.style.display=inbar.dataset.prev==='flex'?'flex':'none';
    el.style.height=el.dataset.prevH||'70vh';
    el.style.minHeight=el.dataset.prevMinH||'200px';
    el.style.resize='both'; el.dataset.min='0';
  } else {
    // 현재 높이·min-height 기억 → 헤더만 남기고 접기
    el.dataset.prevH=el.style.height||'70vh';
    el.dataset.prevMinH=el.style.minHeight||'200px';
    if(inbar) inbar.dataset.prev=inbar.style.display;
    b.style.display='none'; if(inbar) inbar.style.display='none';
    // min-height 를 0 으로 해제해야 헤더 높이까지 실제로 줄어듬
    el.style.minHeight='0';
    el.style.height='auto';
    el.style.resize='none'; el.dataset.min='1';
  }
}
let _ltQueue=[]; let _ltPlaying=false;
function liveTermAppend(text, cls){
  if(text==null||text==='') return;
  const el=document.getElementById('live-term'); if(!el||el.style.display==='none') return;
  String(text).replace(/\n+$/,'').split('\n').forEach(line=>_ltQueue.push({line:line,cls:cls}));
  _ltPlay();
}
function _ltPlay(){
  if(_ltPlaying) return; _ltPlaying=true;
  const step=()=>{
    if(!_ltQueue.length){ _ltPlaying=false; return; }
    const b=document.getElementById('live-term-body');
    // 큐가 많이 쌓이면 빠르게, 적으면 느리게(흐르듯)
    const burst=_ltQueue.length>80?4:(_ltQueue.length>30?2:1);
    for(let i=0;i<burst&&_ltQueue.length;i++){ const it=_ltQueue.shift(); if(b){ const span=document.createElement('span'); if(it.cls==='cmd'){ span.style.color='#19c98a'; span.style.fontWeight='700'; } else if(it.cls==='sys'){ span.style.color='#6b7385'; } span.textContent=it.line+'\n'; b.appendChild(span); } }
    if(b) b.scrollTop=b.scrollHeight;
    setTimeout(step, _ltQueue.length>80?6:26);
  };
  step();
}
// ── 라이브 터미널이 화면에 떠 있는지(스트리밍 표시 대상이 있는지) ──
function _liveTermVisible(){ const el=document.getElementById('live-term'); return !!(el && el.style.display!=='none'); }
// ── 스텝 실행 중 백엔드에서 WebSocket 으로 밀어주는 CLI chunk 를 라이브 터미널에만 append ──
//    (실행 로그·판정은 스텝 완료 후 최종 outputs 기반이라 이 이벤트 무시)
window._tcCliLiveExpect=window._tcCliLiveExpect||{};   // live_key -> true (현재 스트리밍 대상)
function tcCliLiveOnWS(msg){
  try{
    if(!msg || !msg.chunk) return;
    if(!_liveTermVisible()) return;
    if(msg.live_key && !window._tcCliLiveExpect[msg.live_key]) return;
    liveTermAppend(String(msg.chunk).replace(/\r/g,''));
  }catch(e){}
}
// ── cli 출력을 SSE로 받아 라이브 터미널에 '실시간' 표시 + 판정용 출력 누적 (블로킹 run-cli 대체) ──
async function _runCliStreamToLive(l, cmds){
  const outs=[]; let idx=-1, errMsg='';
  try{
    const resp=await fetch('/api/run-cli-stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host:l.ip,port:l.port,protocol:l.protocol,username:l.username,password:l.password,secret:l.secret,device_type:l.device_type,commands:cmds,require_session:true})});
    if(!resp.ok||!resp.body){ return {ok:false,error:'스트리밍 실패 ('+((resp&&resp.status)||'')+')'}; }
    const reader=resp.body.getReader(); const dec=new TextDecoder(); let sb='';
    while(true){ const rd=await reader.read(); if(rd.done)break; sb+=dec.decode(rd.value,{stream:true}); let i;
      while((i=sb.indexOf('\n\n'))>=0){ const evt=sb.slice(0,i); sb=sb.slice(i+2);
        if(evt.indexOf('data: ')!==0) continue; let o; try{ o=JSON.parse(evt.slice(6)); }catch(e){ continue; }
        if(o.cmd!=null){ idx++; outs.push(''); try{ liveTermAppend('$ '+o.cmd,'cmd'); }catch(e){} }
        else if(o.o!=null){ if(idx<0){ idx=0; outs.push(''); } outs[idx]+=o.o; try{ liveTermAppend(o.o); }catch(e){} }
        else if(o.err){ errMsg=o.err; try{ liveTermAppend('[오류] '+o.err,'sys'); }catch(e){} }
      }
    }
    if(errMsg) return {ok:false,error:errMsg};
    return {ok:true, outputs: outs.map(function(s){ return {output:String(s).replace(/[\s\r\n]+$/,'')}; })};
  }catch(e){ return {ok:false,error:e.message}; }
}
// ── 세션 장비 우클릭 → 접속(인터랙티브 콘솔, SecureCRT식) ──
function tcSessConnMenu(ev, tcid, labId){
  try{ ev.preventDefault(); ev.stopPropagation(); }catch(e){}
  _tcConnMenuClose();
  const m=document.createElement('div'); m.id='tc-conn-menu';
  m.style.cssText='position:fixed;z-index:9999;background:#fff;border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.18);padding:5px;min-width:174px;font-size:12.5px;';
  const item=(ic,lab,col,js)=>'<div onclick="_tcConnMenuClose();'+js+'" onmouseenter="this.style.background=\'#f0f4fa\'" onmouseleave="this.style.background=\'transparent\'" style="display:flex;align-items:center;gap:9px;padding:8px 11px;border-radius:6px;cursor:pointer;color:'+(col||'var(--text)')+';"><i class="ti '+ic+'" style="font-size:15px;"></i>'+lab+'</div>';
  m.innerHTML=item('ti-terminal-2','접속 (콘솔 열기)','#0d9488','tcConsoleOpen(\''+tcid+'\',\''+labId+'\')')
    +item('ti-bolt','연결 테스트','#00875a','tcSessionTestOne(\''+tcid+'\',\''+labId+'\')');
  document.body.appendChild(m);
  m.style.left=Math.min(ev.clientX,(window.innerWidth-192))+'px';
  m.style.top=Math.min(ev.clientY,(window.innerHeight-104))+'px';
  setTimeout(function(){ document.addEventListener('click',_tcConnMenuClose,{once:true}); },0);
}
function _tcConnMenuClose(){ const m=document.getElementById('tc-conn-menu'); if(m) m.remove(); }
function tcConsoleOpen(tcid, labId){
  const l=(typeof labList!=='undefined'?labList:[]).find(x=>x.id===labId); if(!l){ showToast('장비를 찾을 수 없습니다'); return; }
  if(!l.ip){ showToast('IP가 없습니다 — Device Registration에서 입력하세요'); return; }
  _consoleDev={ host:l.ip, port:l.port, protocol:l.protocol, username:l.username, password:l.password, secret:l.secret, device_type:l.device_type, name:(l.name||l.ip) };
  _consoleHist=[]; _consoleHistIdx=0;
  liveTermShow(l.name||l.ip);
  liveTermClear();
  const bar=document.getElementById('live-term-inbar'); if(bar) bar.style.display='flex';
  const pr=document.getElementById('live-term-prompt'); if(pr) pr.textContent=(l.name||l.ip)+'#';
  liveTermAppend('── 접속: '+(l.name||l.ip)+'  ['+((l.protocol||'telnet'))+' · '+l.ip+(l.port?(':'+l.port):'')+'] ──','sys');
  const inp=document.getElementById('live-term-input'); if(inp){ inp.disabled=true; inp.value=''; }
  tcConsoleConnect();
}
async function tcConsoleConnect(){
  if(!_consoleDev) return; const d=_consoleDev;
  liveTermAppend('연결 중...','sys');
  try{
    const r=await fetch('/api/run-cli',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host:d.host,port:d.port,protocol:d.protocol,username:d.username,password:d.password,secret:d.secret,device_type:d.device_type,commands:['']})});
    const j=await r.json();
    if(j.ok){ const t=(j.transcript&&j.transcript.trim())?j.transcript.trim():''; if(t) liveTermAppend(t); liveTermAppend('── 연결됨 · 명령을 입력하세요 ──','sys'); const inp=document.getElementById('live-term-input'); if(inp){ inp.disabled=false; setTimeout(function(){ try{inp.focus();}catch(e){} },60); } }
    else liveTermAppend('[연결 실패] '+(j.error||''),'sys');
  }catch(e){ liveTermAppend('[요청 오류] '+e.message,'sys'); }
}
function tcConsoleKey(ev){
  if(ev.key==='Enter'){ ev.preventDefault(); const inp=ev.target; const v=(inp.value||''); inp.value=''; if(v.trim()!==''){ _consoleHist.push(v); if(_consoleHist.length>200)_consoleHist.shift(); } _consoleHistIdx=_consoleHist.length; tcConsoleSend(v); }
  else if(ev.key==='ArrowUp'){ ev.preventDefault(); if(_consoleHistIdx>0){ _consoleHistIdx--; ev.target.value=_consoleHist[_consoleHistIdx]||''; } }
  else if(ev.key==='ArrowDown'){ ev.preventDefault(); if(_consoleHistIdx<_consoleHist.length-1){ _consoleHistIdx++; ev.target.value=_consoleHist[_consoleHistIdx]||''; } else { _consoleHistIdx=_consoleHist.length; ev.target.value=''; } }
}
async function tcConsoleSend(cmd){
  if(!_consoleDev) return; const d=_consoleDev;
  liveTermAppend('# '+cmd,'cmd');
  const inp=document.getElementById('live-term-input'); if(inp) inp.disabled=true;
  try{
    const resp=await fetch('/api/run-cli-stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host:d.host,port:d.port,protocol:d.protocol,username:d.username,password:d.password,secret:d.secret,device_type:d.device_type,commands:[cmd]})});
    if(!resp.ok||!resp.body){ liveTermAppend('[오류] 스트리밍 실패','sys'); }
    else{
      const reader=resp.body.getReader(); const dec=new TextDecoder(); let sb='', any=false;
      while(true){ const rd=await reader.read(); if(rd.done)break; sb+=dec.decode(rd.value,{stream:true}); let i;
        while((i=sb.indexOf('\n\n'))>=0){ const evt=sb.slice(0,i); sb=sb.slice(i+2); if(evt.indexOf('data: ')!==0) continue; let o; try{ o=JSON.parse(evt.slice(6)); }catch(e){ continue; } if(o.o!=null){ liveTermAppend(o.o); any=true; } else if(o.err){ liveTermAppend('[오류] '+o.err,'sys'); } }
      }
      if(!any) liveTermAppend('(출력 없음)');
    }
  }catch(e){ liveTermAppend('[요청 오류] '+e.message,'sys'); }
  if(inp){ inp.disabled=false; setTimeout(function(){ try{inp.focus();}catch(e){} },30); }
}
// ── 통합 Action 드롭다운 (스텝 타입 선택 → kind 자동 변환) ──
const _STEP_TYPE_MAP={
  'Command':{kind:'cli',action:'CLI'},'Call':{kind:'call'},'Session Open':{kind:'connect',proto:'telnet'},'Session Closed':{kind:'disconnect',proto:'telnet'},
  'Telnet Open':{kind:'connect',proto:'telnet'},'Telnet Close':{kind:'disconnect',proto:'telnet'},'SSH Open':{kind:'connect',proto:'ssh'},'SSH Closed':{kind:'disconnect',proto:'ssh'},
  'DIFF':{kind:'cli',action:'DIFF'},'SNMP(RO)':{kind:'cli',action:'SNMP Public'},'SNMP(RW)':{kind:'cli',action:'SNMP Private'},'SNMP(Set)':{kind:'cli',action:'SNMP Set'},
  'SNMP(Trap)':{kind:'cli',action:'SNMP Trap'},'SNMP(수동)':{kind:'cli',action:'SNMP 수동'},
  '계측기':{kind:'cli',action:'계측기'},'Ping':{kind:'cli',action:'Ping'},'REST':{kind:'cli',action:'REST'},'모델 감지':{kind:'cli',action:'모델 감지'},
  'Traffic Connect':{kind:'cli',action:'Traffic Connect'},'ARP Send':{kind:'cli',action:'ARP Send'},'Traffic Start':{kind:'cli',action:'Traffic Start'},'Traffic Stop':{kind:'cli',action:'Traffic Stop'},'Traffic 조회':{kind:'cli',action:'Traffic 조회'},'Traffic Disconnect':{kind:'cli',action:'Traffic Disconnect'},
  'Variable':{kind:'cli',action:'Variable'},
  '대기':{kind:'wait'},'반복':{kind:'loop'},'Switch':{kind:'switch'},'단계':{kind:'group'},'주석':{kind:'comment'},'수동':{kind:'manual'}
};
const _STEP_TYPE_OPTS=['Command','Variable','모델 감지','Call','Telnet Open','Telnet Close','SSH Open','SSH Closed','DIFF','SNMP(RO)','SNMP(RW)','SNMP(Set)','SNMP(Trap)','SNMP(수동)','계측기','Traffic Connect','ARP Send','Traffic Start','Traffic Stop','Traffic 조회','Traffic Disconnect','Ping','REST','수동','대기','반복','Switch','단계','주석'];
// Action 드롭다운 그룹: 장비 기능 / 계측기 기능 / 제어·흐름 (모든 옵션 포함)
const _STEP_TYPE_GROUPS=[
  ['📟 장비',['Command','모델 감지','Telnet Open','Telnet Close','SSH Open','SSH Closed','DIFF','SNMP(RO)','SNMP(RW)','SNMP(Set)','SNMP(Trap)','SNMP(수동)','Ping']],
  ['📡 계측기',['Traffic Connect','ARP Send','Traffic Start','Traffic Stop','Traffic 조회','Traffic Disconnect','REST']],
  ['🖐 수동',['수동']],
  ['🔀 제어 · 흐름',['Call','Variable','대기','반복','Switch','단계','주석']]
];
function _stepType(c){ const k=c.kind||'cli';
  if(k==='connect')return (c.proto==='ssh')?'SSH Open':'Telnet Open'; if(k==='disconnect')return (c.proto==='ssh')?'SSH Closed':'Telnet Close'; if(k==='call')return 'Call';
  if(k==='wait')return '대기'; if(k==='loop')return '반복'; if(k==='switch')return 'Switch'; if(k==='group')return '단계'; if(k==='comment')return '주석'; if(k==='manual')return '수동';
  return ({'DIFF':'DIFF','모델 감지':'모델 감지','SNMP Public':'SNMP(RO)','SNMP Private':'SNMP(RW)','SNMP Set':'SNMP(Set)','SNMP Trap':'SNMP(Trap)','SNMP 수동':'SNMP(수동)','계측기':'계측기','Ping':'Ping','REST':'REST','Variable':'Variable','Traffic Connect':'Traffic Connect','ARP Send':'ARP Send','Traffic Start':'Traffic Start','Traffic Stop':'Traffic Stop','Traffic 조회':'Traffic 조회','Traffic Disconnect':'Traffic Disconnect'})[c.action||'CLI']||'Command';
}
function tcStepSetType(tcid,id,type){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc) return; const c=(tc.checks||[]).find(x=>x.id===id); if(!c) return;
  const m=_STEP_TYPE_MAP[type]; if(!m) return; c.kind=m.kind;
  if(m.action!==undefined) c.action=m.action;
  if(m.proto!==undefined) c.proto=m.proto;
  if(m.kind==='wait'&&!c.waitSec) c.waitSec=5;
  if(m.kind==='loop'&&!c.loopMode){ c.loopMode='count'; c.loopCount=2; }
  if(m.kind==='switch'&&!Array.isArray(c.cases)){ c.cases=[{when:'',goto:''}]; }
  saveTCFile(tc).then(()=>tcProcRefresh(tcid));
}
function _actSelFull(tcid,c){ const cur=_stepType(c);
  return '<select onmousedown="event.stopPropagation()" onclick="event.stopPropagation()" onchange="tcStepSetType(\''+tcid+'\',\''+c.id+'\',this.value)" title="스텝 타입 선택" style="width:100%;max-width:100%;font-size:12px;font-family:inherit;padding:2px 2px;border:none;background:transparent;cursor:pointer;outline:none;font-weight:400;color:#0d6efd;">'+_STEP_TYPE_GROUPS.map(function(g){return '<optgroup label="'+g[0]+'">'+g[1].map(function(o){return '<option value="'+o+'"'+(cur===o?' selected':'')+'>'+o+'</option>';}).join('')+'</optgroup>';}).join('')+'</select>';
}
function _meterToN2xStreams(cfg){ return (cfg.streams||[]).filter(function(s){return s.enabled!==false;}).map(function(s){ var a=String(s.src||'').split('/'); var b=String(s.dst||'').split('/'); var p=String(s.l4proto||'udp').toLowerCase(); if(p!=='tcp'&&p!=='udp'&&p!=='icmp')p='udp';
  var _fr=parseInt(s.minByte,10)||64; var _ld=parseFloat(s.load); if(isNaN(_ld))_ld=1000; var _u=String(s.unit||'fps').toLowerCase(); var _ovh=(_fr+20)*8; var _pps;   // 단위→pps (프레임+preamble8+IFG12=L1 라인레이트 기준)
  if(_u.indexOf('mbps')>=0) _pps=Math.round(_ld*1e6/_ovh);
  else if(_u.indexOf('bps')>=0) _pps=Math.round(_ld/_ovh);
  else if(_u.indexOf('percent')>=0||_u.indexOf('%')>=0) _pps=Math.round((_ld/100)*(1e9/_ovh));
  else _pps=Math.round(_ld);
  if(!(_pps>0))_pps=1;
  return {txMod:a[0]||'', txPort:a[1]||'1', rxMod:b[0]||'', rxPort:b[1]||'2', proto:p, frame:String(s.minByte||'64'), pps:String(_pps), npkt:String(s.frameCnt||'0'), srcMac:s.srcMac||'', dstMac:s.dstMac||'', srcIp:s.srcIp||'', dstIp:s.dstIp||''}; }); }
function _n2xToStats(arr){ var out=[]; (arr||[]).forEach(function(x){ var idx=(x.idx!=null)?x.idx:out.length; out[idx]={txPkts:x.tx,rxPkts:x.rx,txOct:((x.txOct!=null&&x.txOct!=='-')?x.txOct:'-'),rxOct:((x.rxOct!=null&&x.rxOct!=='-')?x.rxOct:'-'),txTput:((x.txTput!=null&&x.txTput!=='-')?x.txTput:'-'),rxTput:((x.rxTput!=null&&x.rxTput!=='-')?x.rxTput:'-'),loss:x.loss,latency:x.latency,seqErr:x.misorder}; }); return out; }
// N2X 통계 → 진짜 HTML 격자표 (응답 패널·스튜디오 측정결과와 동일한 모양)
function _n2xFmtElapsed(sec){ sec=Math.max(0,Math.round(sec||0)); var h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60; var p=function(n){return (n<10?'0':'')+n;}; return p(h)+':'+p(m)+':'+p(s); }
function _n2xStatsHtml(arr,names,elapsed,opts){
  var pdf=!!(opts&&opts.pdf); var _FS=pdf?'7.5px':'12px', _HFS=pdf?'7.5px':'11.5px', _PAD=pdf?'2px 4px':'5px 11px', _HPAD=pdf?'3px 4px':'7px 11px';
  if(!arr||!arr.length) return '<div style="padding:18px;text-align:center;color:var(--text3);font-size:12.5px;border:1px dashed var(--border);border-radius:8px;">N2X 통계 없음 — [Traffic 조회] 실행 후 표시됩니다.</div>';
  var e=_bdEsc; var num=function(v){ var n=parseFloat(v); return isNaN(n)?0:n; };
  var dv=function(v){ return (v!=null&&v!=='-'&&v!=='')?e(String(v)):'—'; };
  // 표: 스트림=행, 지표=열 (원복) — 헤더를 단어별 줄바꿈으로 좁게 + 여백 축소
  var MCOL=['Stream','Tx<br>Test<br>Packets','Rx<br>Test<br>Packets','Tx<br>Test<br>Octets','Rx<br>Test<br>Octets','Tx<br>Throughput<br>(Mb/s)','Rx<br>Throughput<br>(Mb/s)','Rx<br>Packet<br>Loss','Avg<br>Latency<br>(us)','Sequence<br>Errors'];
  var _PAD2=pdf?'2px 3px':'4px 6px', _HPAD2=pdf?'2px 3px':'4px 6px';
  var thS='padding:'+_HPAD2+';font-size:'+_HFS+';font-weight:800;color:#46506a;background:#eef2f7;border-right:1px solid #dde3ec;border-bottom:2px solid #cdd5e3;text-align:center;vertical-align:bottom;line-height:1.25;white-space:nowrap;';
  var mth='<tr>'+MCOL.map(function(h,i){return '<th style="'+thS+(i===0?'text-align:left;':'')+'">'+h+'</th>';}).join('')+'</tr>';
  var cell=function(v,al,o){ o=o||{}; return '<td style="padding:'+_PAD2+';font-size:'+_FS+';border-right:1px solid #e6eaf1;border-bottom:1px solid #eef0f4;white-space:nowrap;font-family:ui-monospace,monospace;text-align:'+(al||'right')+';color:'+(o.color||'#42495a')+';'+(o.bold?'font-weight:800;':'')+(o.bg?'background:'+o.bg+';':'')+'">'+v+'</td>'; };
  var s={tx:0,rx:0,txO:0,rxO:0,txT:0,rxT:0,loss:0,lat:0,seq:0};
  var rows=arr.map(function(x,i){
    var nm=(names&&names[i])?names[i]:('#'+(((x.idx!=null)?x.idx:i)+1));
    s.tx+=num(x.tx);s.rx+=num(x.rx);s.txO+=num(x.txOct);s.rxO+=num(x.rxOct);s.txT+=num(x.txTput);s.rxT+=num(x.rxTput);s.loss+=num(x.loss);s.lat+=num(x.latency);s.seq+=num(x.misorder);
    var lb=num(x.loss)>0, sb=num(x.misorder)>0;
    return '<tr style="background:'+(i%2?'#fafbfd':'#fff')+';">'
      +cell(e(String(nm)),'left',{color:'#1c2230',bold:true})
      +cell(dv(x.tx))+cell(dv(x.rx))+cell(dv(x.txOct))+cell(dv(x.rxOct))
      +cell(dv(x.txTput))+cell(dv(x.rxTput))
      +cell(dv(x.loss),'right',lb?{color:'#c0392b',bold:true,bg:'rgba(192,57,43,0.08)'}:null)
      +cell(dv(x.latency))
      +cell(dv(x.misorder),'right',sb?{color:'#c0392b',bold:true,bg:'rgba(192,57,43,0.08)'}:null)
      +'</tr>';
  }).join('');
  var B={bold:true,color:'#1c2230'};
  var tot='<tr style="border-top:2px solid #c4cde0;">'
    +cell('합계','left',{color:'#1c2230',bold:true,bg:'#e6ebf4'})
    +cell(String(s.tx),'right',B)+cell(String(s.rx),'right',B)
    +cell(s.txO?String(s.txO):'—','right',B)+cell(s.rxO?String(s.rxO):'—','right',B)
    +cell(s.txT?s.txT.toFixed(3):'—','right',B)+cell(s.rxT?s.rxT.toFixed(3):'—','right',B)
    +cell(String(s.loss),'right',{bold:true,color:s.loss>0?'#c0392b':'#1c2230',bg:s.loss>0?'rgba(192,57,43,0.08)':null})
    +cell(arr.length?(s.lat/arr.length).toFixed(2):'—','right',B)
    +cell(String(s.seq),'right',{bold:true,color:s.seq>0?'#c0392b':'#1c2230',bg:s.seq>0?'rgba(192,57,43,0.08)':null})
    +'</tr>';
  var cf=function(n){ return String(n).replace(/\B(?=(\d{3})+(?!\d))/g,','); };
  var lb2=s.loss>0||s.seq>0;
  var _el=(elapsed&&elapsed>0)?elapsed:((s.txT>0)?(s.txO*8/(s.txT*1e6)):0);
  // 요약: 가로 나열 → 세로 행 스택
  var pill='display:inline-block;border-radius:7px;padding:5px 11px;font-size:'+(pdf?'8px':'12px')+';white-space:nowrap;';
  var sumLine='<div style="display:flex;flex-direction:column;align-items:flex-start;gap:'+(pdf?'4px':'5px')+';margin-top:'+(pdf?'6px':'9px')+';">'
    +'<span style="'+pill+'background:#eef6ff;border:1px solid #bcd9f5;"><b style="color:#1f5fb0;">⏱ 트래픽 인가 시간</b> : <b>'+_n2xFmtElapsed(_el)+'</b>'+(_el?(' ('+_el.toFixed(1)+'초)'):'')+'</span>'
    +'<span style="'+pill+'background:#eef2f8;border:1px solid #d7dce6;"><b style="color:#2d6fd4;">Tx Sum</b> : '+cf(s.tx)+' pkts · '+cf(s.txO)+' oct · <b>'+(s.txT?s.txT.toFixed(3):'0')+'</b> Mb/s</span>'
    +'<span style="'+pill+'background:#eef2f8;border:1px solid #d7dce6;"><b style="color:#00875a;">Rx Sum</b> : '+cf(s.rx)+' pkts · '+cf(s.rxO)+' oct · <b>'+(s.rxT?s.rxT.toFixed(3):'0')+'</b> Mb/s</span>'
    +'<span style="'+pill+'background:'+(lb2?'#fdecec':'#edf9f2')+';border:1px solid '+(lb2?'#f0c2c2':'#bfe3d2')+';color:'+(lb2?'#c0392b':'#00875a')+';font-weight:800;">Loss : '+cf(s.loss)+(s.seq?(' · Seq Err '+cf(s.seq)):'')+'</span>'
    +'</div>';
  return '<div style="'+(pdf?'border:1px solid #cdd5e3;border-radius:6px;display:inline-block;max-width:100%;overflow-x:auto;':'overflow-x:auto;border:1px solid #cdd5e3;border-radius:9px;box-shadow:0 1px 3px rgba(0,0,0,0.06);')+'"><table style="border-collapse:collapse;width:max-content;'+(pdf?'':'min-width:100%;')+'background:#fff;"><thead>'+mth+'</thead><tbody>'+rows+'</tbody></table></div>'+sumLine;   // pdf: 자연 폭(억지로 100% 안늘림) · 화면: 폭 채움
}
function _n2xStatsText(arr,names,elapsed){ if(!arr||!arr.length)return 'N2X 통계 없음 (트래픽 시작 후 [Traffic 조회]로 조회하세요)';
  var d=function(v){ return (v!=null&&v!=='-'&&v!=='')?String(v):'-'; };
  var cols=[
    {h:'Stream',      al:'l', f:function(x){var i=(x.idx!=null)?x.idx:0; return (names&&names[i])?String(names[i]):('#'+(i+1));}},
    {h:'Tx Packets',  al:'r', f:function(x){return String(x.tx);}},
    {h:'Rx Packets',  al:'r', f:function(x){return String(x.rx);}},
    {h:'Tx Octets',   al:'r', f:function(x){return d(x.txOct);}},
    {h:'Rx Octets',   al:'r', f:function(x){return d(x.rxOct);}},
    {h:'Tx Mb/s',     al:'r', f:function(x){return d(x.txTput);}},
    {h:'Rx Mb/s',     al:'r', f:function(x){return d(x.rxTput);}},
    {h:'Rx Loss',     al:'r', f:function(x){return String(x.loss);}},
    {h:'Avg Lat(us)', al:'r', f:function(x){return String(x.latency);}},
    {h:'Seq Err',     al:'r', f:function(x){return String(x.misorder);}}
  ];
  var num=function(v){ var n=parseFloat(v); return isNaN(n)?0:n; };
  var dataRows=arr.map(function(x){ return cols.map(function(c){return c.f(x);}); });
  var s={tx:0,rx:0,txO:0,rxO:0,txT:0,rxT:0,loss:0,lat:0,seq:0};
  arr.forEach(function(x){ s.tx+=num(x.tx);s.rx+=num(x.rx);s.txO+=num(x.txOct);s.rxO+=num(x.rxOct);s.txT+=num(x.txTput);s.rxT+=num(x.rxTput);s.loss+=num(x.loss);s.lat+=num(x.latency);s.seq+=num(x.misorder); });
  var tot=['합계', String(s.tx), String(s.rx), s.txO?String(s.txO):'-', s.rxO?String(s.rxO):'-', s.txT?s.txT.toFixed(3):'-', s.rxT?s.rxT.toFixed(3):'-', String(s.loss), arr.length?(s.lat/arr.length).toFixed(2):'-', String(s.seq)];
  var allR=[cols.map(function(c){return c.h;})].concat(dataRows,[tot]);
  var w=cols.map(function(c,i){ var mx=0; allR.forEach(function(r){ if(String(r[i]).length>mx)mx=String(r[i]).length; }); return mx; });
  var pad=function(v,n,al){ var x=String(v); while(x.length<n){ if(al==='l')x+=' '; else x=' '+x; } return x; };
  var rowH=function(cells){ return ' '+cells.map(function(v,i){return pad(v,w[i],cols[i].al);}).join('   '); };
  var sep=' '+w.map(function(n){return new Array(n+1).join('-');}).join('---');
  var _el=(elapsed&&elapsed>0)?elapsed:((s.txT>0)?(s.txO*8/(s.txT*1e6)):0);
  var _hd=' 트래픽 인가 시간 : '+_n2xFmtElapsed(_el)+(_el?('  ('+_el.toFixed(1)+'초)'):'')+'\n';
  return _hd+rowH(cols.map(function(c){return c.h;}))+'\n'+sep+'\n'+dataRows.map(rowH).join('\n')+'\n'+sep+'\n'+rowH(tot);
}
function _n2xStreamPorts(cfg){ var seen={},out=[]; (cfg.streams||[]).filter(function(s){return s.enabled!==false;}).forEach(function(s){ [s.src,s.dst].forEach(function(p){ var a=String(p||'').split('/'); if(a[0]&&a[1]){ var k=a[0]+'/'+a[1]; if(!seen[k]){ seen[k]=1; out.push({module:a[0],port:a[1]}); } } }); }); return out; }
var _tcSingleRunLock={};
async function tcCheckRun(tcid,id,_co,_forceId){
  // 개별 스텝 실행 락: 이미 이 TC 에서 다른 스텝이 백엔드 실행 중이면 새 요청 거부.
  // (같은 세션에 여러 요청 밀어넣으면 netmiko 순차 처리로 뒤 스텝이 무한 대기 상태로 보임)
  var _needUnlock=false;
  if(!_co && !_bulkRun){
    if(_tcSingleRunLock[tcid]){
      try{ showToast('먼저 진행 중인 스텝이 완료된 뒤 실행하세요'); }catch(_e){}
      return;
    }
    _tcSingleRunLock[tcid]=id; _needUnlock=true;
  }
  try{
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc) return;
  const c=_co||(tc.checks||[]).find(x=>x.id===id); if(!c) return;
  _tcColChk=c;   // 이 스텝 기준으로 colN('행') 해석(스텝별 col1,2)
  if(!_co && c.devResults){ delete c.devResults; if(_respDevSel) _respDevSel[tcid]=undefined; }   // 단일 실행 → 다중장비 결과(장비 칩) 초기화
  if(!_co&&!_bulkRun){ if(_respStepId[tcid]!==id){ _respSel[tcid]=undefined; _pendingSub[tcid]=''; } _respStepId[tcid]=id; _stepDetailTab[tcid]=_stepDetailTab[tcid]||'response'; } // 단일 실행만 Response 상세 표시 (전체 실행 중엔 Console)
  const kind=c.kind||'cli';
  const _lbl=_co?'':(function(){ const a=tc.checks||[]; return _stepLabels(a)[a.findIndex(x=>x.id===id)]||''; })();
  if(kind==='group'||kind==='model'){ return; }
  if(kind==='manual'){ return; }   // 수동 스텝 — 자동 실행 대상 아님(사람이 직접 결과 선택)
  if((c.action||'')==='Variable'){   // 변수/수식 스텝 — 장비 연결 없이 대입·수식만 실행
    var _vraw=String(c.cli||c.formula||'');
    // '=' 없는 줄은 맨 앞 ${var}/#N.colM/colN 을 대상으로 재대입 (예: "${i} - 24" → "${i} = ${i} - 24")
    var _norm=_vraw.split(/[\n;]+/).map(function(ln){ var s=String(ln).trim(); if(!s)return ''; if(s.indexOf('=')>=0)return s; var m=s.match(/^(\$\{\s*[\w가-힣]+\s*\}|#\d+\s*\.\s*col\d+\s*\([^)]*\)|col\d*\s*\([^)]*\))/); return m?(m[1]+' = '+s):s; }).filter(Boolean).join('\n');
    try{ _tcRunAssign(_norm, tcid); }catch(e){}
    var _vp=_procVars[tcid]||{};
    var _vshown=_norm.split(/[\n;]+/).map(function(ln){ var s=String(ln).trim(); if(!s)return ''; var mm=s.match(/^\$\{\s*([\w가-힣]+)\s*\}\s*=/); if(mm)return '${'+mm[1]+'} = '+(_vp[mm[1]]!=null?_vp[mm[1]]:''); var mc=s.match(/^(#?\d*\s*\.?\s*col\d*\s*\([^)]*\))\s*=/); if(mc)return mc[1]+' = '+_subVars(mc[1],tcid); return s; }).filter(Boolean);
    c.output='🔧 변수/수식 실행\n'+(_vshown.join('\n')||'(대입 없음)'); c.repeatResult='실행완료'; c.executed_at=_nowStr();
    _logRec(tcid,{t:_nowStr().slice(11),label:_lbl,kind:'cli',name:'변수/수식: '+(_vraw.split(/\r?\n/)[0]||'').slice(0,40),status:'완료',output:c.output});
    if(!_bulkRun){ await saveTCFile(tc); tcProcRefresh(tcid); } else { _logLiveUpdate(tcid); }
    return;
  }
  if(kind==='call'){
    const sub=tcList.find(t=>t.tcid===c.callTcid);
    if(!sub){ showToast('호출 대상 절차를 선택하세요'); return; }
    _runLog[tcid]=_runLog[tcid]||[];
    _logRec(tcid,{t:_nowStr().slice(11),label:_lbl,kind:'group',name:'↪ 호출: '+sub.tcid+(sub.name?(' · '+sub.name):''),status:'info'});
    if(!_co&&!_bulkRun) _procBottomTab[tcid]='console';
    await _runCalled(tcid, sub, c.callParams, 0, new Set([(tc.tcid||tc.id), sub.tcid]));
    if(!_co) tcProcRefresh(tcid);
    return;
  }
  if(kind==='wait'){ const ws=parseInt(c.waitSec)||5; c.output='⏱ 대기 '+ws+'초...'; c.repeatResult=''; tcProcRefresh(tcid); try{ if(typeof _cbBridgeWaitTick==='function' && typeof _cycleLiveCtx!=='undefined' && _cycleLiveCtx) _cbBridgeWaitTick(c.id, ws, ws); }catch(_be){} for(var _wc=ws;_wc>0;_wc--){ if(_tcRunAbortRequested(tcid)){ c.output='⏱ 대기 중단됨 ('+ws+'초 중 '+(ws-_wc)+'초 경과)'; c.executed_at=_nowStr(); _logRec(tcid,{t:_nowStr().slice(11),label:_lbl,kind:'wait',name:'대기 중단됨',status:'skip'}); if(!_bulkRun){ await saveTCFile(tc); tcProcRefresh(tcid); } return; } try{ var _wcell=document.getElementById('stcell-'+c.id); if(_wcell) _wcell.innerHTML='<span style="display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:800;color:#e8820c;white-space:nowrap;"><i class="ti ti-clock"></i> '+_wc+'초'+(ws>1?(' / '+ws+'초'):'')+'</span>'; }catch(e){} try{ if(typeof _cbBridgeWaitTick==='function' && typeof _cycleLiveCtx!=='undefined' && _cycleLiveCtx) _cbBridgeWaitTick(c.id, _wc, ws); }catch(_be){} await _sleep(1000); } c.output='⏱ 대기 '+ws+'초 완료'; c.executed_at=_nowStr(); _logRec(tcid,{t:_nowStr().slice(11),label:_lbl,kind:'wait',name:'대기 '+ws+'초',status:'완료'}); await saveTCFile(tc); tcProcRefresh(tcid); try{ if(typeof _cbBridgeWaitTick==='function' && typeof _cycleLiveCtx!=='undefined' && _cycleLiveCtx) _cbBridgeWaitTick(c.id, 0, ws); }catch(_be){} return; }
  if(kind==='if'){   // IF 단일 실행(▶) — 조건 평가 → Pass/Fail 기록(적부에 포함)
    const _br=_evalIfBranch(c, tcid);
    const _res=_br.result;
    const _branchRaw=_br.raw;
    if(_res==='Command'){
      var _cmdText=_subVars(String(_branchRaw||''), tcid);
      var _cmds=_cmdText.split(/\r?\n/).map(function(x){return x.trim();}).filter(Boolean);
      var _outText='', _cmdOk=false;
      if(!_cmds.length){ _outText='(Command 지정 안 됨)'; }
      else {
        var _l=null; try{ _l=_checkLab(tc, c, _forceId); }catch(_le){}
        if(!_l||!_l.ip){ _outText='[Command 실행 실패] 대상 장비 없음 — 상단 스텝의 대상 장비/세션 확인'; }
        else {
          var _essr={ok:true};
          try{ _essr=await _ensureSess(tcid,_l); }catch(_ese){ _essr={ok:false,error:_ese.message}; }
          if(!_essr||!_essr.ok){ _outText='[Command 실행 실패] 세션 연결 실패: '+((_essr&&_essr.error)||'')+' ('+(_l.name||_l.ip)+')'; }
          else {
            try{
              var _rc=await fetch('/api/run-cli',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host:_l.ip,port:_l.port,protocol:_l.protocol,username:_l.username,password:_l.password,secret:_l.secret,device_type:_l.device_type,commands:_cmds,repeat:1,interval:1,cmd_delay:_tcStepCmdDelay(c),require_session:true})});
              var _dc=await _rc.json();
              if(_dc && _dc.no_session){
                try{ if(_procSessOpen[tcid]) _procSessOpen[tcid].delete(_sessKey(_l)); }catch(_e){}
                var _es3=await _ensureSess(tcid,_l);
                if(_es3&&_es3.ok){
                  var _rc2=await fetch('/api/run-cli',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host:_l.ip,port:_l.port,protocol:_l.protocol,username:_l.username,password:_l.password,secret:_l.secret,device_type:_l.device_type,commands:_cmds,repeat:1,interval:1,cmd_delay:_tcStepCmdDelay(c),require_session:true})});
                  _dc=await _rc2.json();
                }
              }
              if(_dc && _dc.ok && Array.isArray(_dc.outputs)){ _outText=_dc.outputs.map(function(o){return o.output;}).join('\n'); _cmdOk=true; }
              else { _outText='[Command 실행 실패] '+((_dc&&_dc.error)||''); }
            }catch(_re){ _outText='[Command 요청 오류] '+_re.message; }
          }
        }
      }
      c.repeatResult=_cmdOk?'info':'Fail';
      c.output='IF: '+_subVars(c.condition||'',tcid)+'  →  '+_br.label+'\n▶ Command:\n'+_cmdText+'\n\n'+_outText;
      c.executed_at=_nowStr();
      _logRec(tcid,{t:_nowStr().slice(11),label:_lbl,kind:'cli',name:'IF ('+_subVars(c.condition||'',tcid)+') → '+_br.label+' · ▶ '+(_cmds[0]||'(빈 Command)'),status:(_cmdOk?'완료':'Fail'),criteria:c.condition||'',output:c.output});
      _ckCollapsed[id]=false; if(!_bulkRun){ await saveTCFile(tc); tcProcRefresh(tcid); } else { _logLiveUpdate(tcid); }
      return;
    }
    try{ _tcRunAssign(_branchRaw, tcid); }catch(e){}   // ${var}=값/col 대입(수식)
    const _msg=_subVars(_branchRaw, tcid);
    c.repeatResult=(_res==='Pass'||_res==='Fail')?_res:'실행완료';
    c.output='IF: '+_subVars(c.condition||'',tcid)+'  →  '+_br.label+(_msg?('\n'+_msg):'');
    c.executed_at=_nowStr();
    _logRec(tcid,{t:_nowStr().slice(11),label:_lbl,kind:'cli',name:'IF ('+_subVars(c.condition||'',tcid)+') → '+_br.label+(_msg?(' · '+_msg):''),status:c.repeatResult,criteria:c.condition||'',output:c.output});
    _ckCollapsed[id]=false; if(!_bulkRun){ await saveTCFile(tc); tcProcRefresh(tcid); } else { _logLiveUpdate(tcid); }
    return;
  }
  if(kind==='connect'||kind==='disconnect'){
    let l=_checkLab(tc,c,_forceId);
    // 최종 안전장치: 저장된 devId 자체가 계측기더라도 Telnet/SSH 은 안 됨
    // → CLI 장비를 찾아 재배치(자동 재상속). 실패 시 명확한 에러.
    const _isMeterL=function(d){ return d && /계측|spirent|ixia|n2x|stc/i.test(String((d.role||'')+' '+(d.vendor||'')+' '+(d.model||'')+' '+(d.name||''))); };
    if(_isMeterL(l)){
      const _arr=(tc&&tc.checks)||[]; const _ix=_arr.findIndex(function(x){return x.id===c.id;}); let _alt=null;
      for(let _i=_ix-1;_i>=0;_i--){ if(_arr[_i].devId){ const _dd=labList.find(function(x){return x.id===_arr[_i].devId;}); if(_dd && !_isMeterL(_dd)){ _alt=_dd; break; } } }
      if(!_alt){
        try{ const _sids=_tcSessIds(tc||{}); for(let _si=0;_si<_sids.length;_si++){ const _sd=labList.find(function(x){return x.id===_sids[_si];}); if(_sd && !_isMeterL(_sd)){ _alt=_sd; break; } } }catch(e){}
      }
      if(!_alt){ _alt=(labList||[]).find(function(x){return x && x.ip && !_isMeterL(x);})||null; }
      if(_alt){
        console.warn('[Telnet Open guard] devId 가 계측기("'+(l.name||'')+'") → CLI 장비("'+(_alt.name||'')+'")로 자동 대체');
        l=_alt;
      }
    }
    if(!l||!l.ip){ showToast('대상 세션 장비(IP)를 세션 바에 추가/선택하세요'); return; }
    const _cl=_stepType(c);   // Telnet Open/Close · SSH Open/Closed 라벨
    // 여전히 계측기이면(대체 실패) 명확한 에러
    if(_isMeterL(l)){
      c.output='[스텝 사용 불가] 계측기 장비("'+(l.name||l.ip)+'")는 '+_cl+' 스텝을 지원하지 않습니다.\n'
        +'  · N2X : Tcl API 사용 — Traffic Connect/Start/Stop 스텝으로 제어\n'
        +'  · STC : REST API 사용 — Traffic Connect 스텝으로 제어\n'
        +'세션 스텝(Telnet/SSH Open/Close) 은 스위치·라우터 등 CLI 장비 전용입니다.\n'
        +'스텝 Session 컬럼에서 CLI 장비(스위치 등)를 선택하세요.';
      c.repeatResult='Fail'; c.executed_at=_nowStr();
      _logRec(tcid,{t:_nowStr().slice(11),label:_lbl,kind:'group',name:_cl+' ('+(l.name||l.ip)+') — 계측기는 이 스텝 불가',status:'Fail',output:c.output,dev:(l.name||l.ip)});
      await saveTCFile(tc); tcProcRefresh(tcid); return;
    }
    if(/\.\./.test(String(l.ip))||/^\.|\.$/.test(String(l.ip).trim())){ c.output='[IP 형식 오류] "'+l.ip+'" — '+(l.name||'')+' 의 IP에 점(.)이 잘못되었습니다(빈 자리). Device Management에서 IP를 수정하세요.'; c.repeatResult='Fail'; c.executed_at=_nowStr(); _logRec(tcid,{t:_nowStr().slice(11),label:_lbl,kind:'group',name:_cl+' ('+(l.name||l.ip)+') — IP 형식 오류',status:'Fail',output:c.output,dev:(l.name||l.ip)}); await saveTCFile(tc); tcProcRefresh(tcid); return; }
    const url=kind==='connect'?'/api/session-open':'/api/session-close';
    c.output=(kind==='connect'?'⏳ 세션 여는 중...':'⏳ 세션 닫는 중...')+' ('+(l.name||'')+' · '+l.ip+')'; c.repeatResult=''; tcProcRefresh(tcid);
    var _topen=Date.now(); try{ liveTermAppend('\n── '+_cl+' ('+(l.name||l.ip)+') — '+(kind==='connect'?'접속 중...':'종료 중...'),'sys'); }catch(e){}
    try{
      const _samep=(!c.proto)||(c.proto===String(l.protocol||'telnet').toLowerCase());   // 스텝이 강제한 프로토콜(telnet/ssh) 우선 — 바꾸면 포트는 기본값(22/23), device_type도 맞춤
      const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host:l.ip,port:(_samep?l.port:''),protocol:(c.proto||l.protocol),username:l.username,password:l.password,secret:l.secret,device_type:(c.proto?(c.proto==='ssh'?'cisco_ios':'cisco_ios_telnet'):l.device_type),fast:true})});
      const d=await r.json();
      var _open_el=((Date.now()-_topen)/1000).toFixed(1);
      var _brk=(d&&d.t_connect!=null)?(' · 접속 '+d.t_connect+'s/enable '+d.t_enable+'s/프롬프트 '+d.t_prompt+'s'):'';
      if(kind==='connect') c.output=d.ok?('✅ 세션 열림 ('+_open_el+'초'+_brk+')'+(d.prompt?(' — '+d.prompt):'')):('[세션 오류] '+(d.error||''));
      else c.output=d.ok?'✅ 세션 닫힘':('[세션 오류] '+(d.error||''));
      c.repeatResult=d.ok?'실행완료':'Fail'; c.executed_at=_nowStr();   // 세션 열기/닫기는 판정 아님 → 성공 시 '실행완료'(합격 X)
      if(d.ok){ _procSessOpen[tcid]=_procSessOpen[tcid]||new Set(); if(kind==='connect') _procSessOpen[tcid].add(_sessKey(l)); else _procSessOpen[tcid].delete(_sessKey(l)); }
      _logRec(tcid,{t:_nowStr().slice(11),label:_lbl,kind:'group',name:_cl+' ('+(l.name||l.ip)+')',status:(d.ok?'완료':'Fail'),output:c.output,dev:(l.name||l.ip)});
      try{ if(kind==='connect'&&d.ok){ liveTermAppend('\n── '+_cl+' ('+(l.name||l.ip)+') 로그인 과정 ──','sys'); if(d.login_log) liveTermAppend(String(d.login_log).replace(/\s+$/,'')); liveTermAppend('✅ 접속 완료 — 총 '+_open_el+'초'+_brk,'sys'); } else if(kind==='disconnect'&&d.ok){ liveTermAppend('\n── '+_cl+' ('+(l.name||l.ip)+') — '+_open_el+'초 ──','sys'); } }catch(e){}
      if(kind==='connect'&&d.ok&&d.login_log&&String(d.login_log).trim()){ _logRec(tcid,{t:_nowStr().slice(11),label:_lbl,kind:'cli',name:'🔑 로그인 과정 (id/pw)',status:'info',output:d.login_log,dev:(l.name||l.ip)}); }
    }catch(e){ c.output='[요청 오류] '+e.message; c.repeatResult='Fail'; }
    _ckCollapsed[id]=false; await saveTCFile(tc); tcProcRefresh(tcid); return;
  }
  if(c.condition && !_evalCond(c.condition,tcid)){ c.output='⏭ 조건 불충족으로 건너뜀: '+c.condition; c.repeatResult=''; _logRec(tcid,{t:_nowStr().slice(11),label:_lbl,kind:'cli',name:(c.cli||'').split(/\r?\n/)[0]||'명령',status:'skip',criteria:'조건: '+c.condition}); await saveTCFile(tc); tcProcRefresh(tcid); return; }
  if((c.type||'')==='expr' && !(c.cli&&String(c.cli).trim())){ const ok=_evalCond(c.criteria,tcid); const ev=_subVars(c.criteria,tcid); c.repeatResult=ok?'Pass':'Fail'; c.output='식 평가:  '+ev+'   →  '+(ok?'참 (Pass)':'거짓 (Fail)'); c.executed_at=_nowStr(); _logRec(tcid,{t:_nowStr().slice(11),label:_lbl,kind:'cli',name:'식 '+(c.criteria||''),status:c.repeatResult,criteria:c.criteria||'',output:c.output}); _ckCollapsed[id]=false; await saveTCFile(tc); tcProcRefresh(tcid); return; }
  if(['Traffic Connect','ARP Send','Traffic Start','Traffic Stop','Traffic 조회','Traffic Disconnect'].indexOf(c.action||'')>=0){
    const cfg=tc.meterCfg||null;
    if(!cfg||!Array.isArray(cfg.streams)||!cfg.streams.length){ c.output='⚠ 계측기 설정이 없습니다 — 트래픽 탭/⚙ 스튜디오에서 스트림을 정의하세요.'; c.repeatResult='Fail'; c.executed_at=_nowStr(); await saveTCFile(tc); tcProcRefresh(tcid); return; }
    const isN2X=/n2x|ixia/i.test(String((cfg.vendor||'')+' '+(cfg.model||'')));
    c.output='⏳ '+c.action+(isN2X?' · N2X':' · STC')+' 실행 중...'; c.repeatResult=''; tcProcRefresh(tcid);
    try{
      let d;
      if(isN2X){
        const _post=function(u,b){ return fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}).then(function(r){return r.json();}); };
        const server=(cfg.chassis||'210.1.2.248'); const label=(cfg.n2xLabel||'utop');
        if(c.action==='Traffic Connect'){
          // 세션 확인은 ping (즉시).
          d=await (await fetch('/api/n2x/ping?server='+encodeURIComponent(server)+'&label='+encodeURIComponent(label))).json();
          if(d&&d.ok){
            var _pz=_n2xStreamPorts(cfg);
            // 포트 예약은 배치 API 로 한 번에 (데몬 파이프는 단일이라 프론트 병렬 fetch 는 IO race 유발).
            // 서버에서 순차 처리하지만 각 명령이 10초 timeout 이라 총 시간은 짧게 유지됨.
            var _rl=[];
            if(_pz.length){
              try{
                var _br=await _post('/api/n2x/reserve-batch',{server:server,label:label,targets:_pz.map(function(_p){return {module:_p.module,port:_p.port};})});
                if(_br && !_br.ok && _br.error){
                  _rl.push('✖ 배치 요청 실패: '+_br.error);
                } else {
                  var _map={};
                  ((_br&&_br.results)||[]).forEach(function(x){ _map[x.module+'/'+x.port]=x; });
                  _pz.forEach(function(_p){
                    var x=_map[_p.module+'/'+_p.port];
                    if(x&&x.ok){
                      if(x.already_mine) _rl.push('✔ '+_p.module+'/'+_p.port+' 예약됨 (기존 유지)');
                      else _rl.push('✔ '+_p.module+'/'+_p.port+' 예약됨');
                    } else {
                      _rl.push('✖ '+_p.module+'/'+_p.port+' 실패: '+((x&&x.error)||'응답 없음'));
                    }
                  });
                }
              }catch(e){ _rl.push('✖ 배치 요청 실패: '+e.message); }
            }
            d.text='N2X 세션 연결됨 (서버 '+server+' · label '+label+')\n'+(_pz.length?('— 포트 예약 결과 —\n'+_rl.join('\n')):'예약할 포트 없음 — 시험포트/스트림 SRC·DST Port를 4106/1 형식으로 지정하세요');
          }
        }
        else if(c.action==='ARP Send'){ d={ok:true,text:'N2X: ARP는 Traffic Start 시 자동 처리됩니다.'}; }
        else if(c.action==='Traffic Start'){ var _ns=_meterToN2xStreams(cfg); d=await _post('/api/n2x/traffic/start',{server:server,label:label,dur:'0',streams:_ns}); if(d&&d.ok){ tc.meterCfg._tStart=Date.now(); tc.meterCfg._tStop=0; d.text='N2X 트래픽 시작 ('+_ns.length+' 스트림)'; } }
        else if(c.action==='Traffic Stop'){ d=await _post('/api/n2x/traffic/stop',{server:server,label:label}); if(d&&d.ok){ tc.meterCfg._tStop=Date.now(); d.text='N2X 트래픽 정지 (통계는 [Traffic 조회]로 확인)'; } }
        else if(c.action==='Traffic Disconnect'){ d=await _post('/api/n2x/traffic/clear',{server:server,label:label}); if(d&&d.ok)d.text='N2X 구성/연결 해제'; }
        else { d=await _post('/api/n2x/traffic/stat',{server:server,label:label}); if(d&&d.ok){ var _enm=(cfg.streams||[]).filter(function(_s){return _s.enabled!==false;}).map(function(_s){return _s.name||'';}); var _el=tc.meterCfg._tStart?(((tc.meterCfg._tStop||Date.now())-tc.meterCfg._tStart)/1000):0; tc.meterCfg.stats=_n2xToStats(d.streams||[]); c.n2xStats=d.streams||[]; c.n2xNames=_enm; c.n2xElapsed=_el; d.text=_n2xStatsText(d.streams||[], _enm, _el); } }
      } else {
        if(c.action==='Traffic Connect'){ const r=await fetch('/api/stc/conncheck',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chassis:cfg.chassis,restPort:cfg.restPort})}); d=await r.json(); if(d&&d.ok)d.text='STC 섀시 연결 확인됨 ('+(cfg.chassis||'')+')'; }
        else { const _actMap={'ARP Send':'arp','Traffic Start':'start','Traffic Stop':'stop','Traffic 조회':'query','Traffic Disconnect':'stop'};
          const r=await fetch('/api/stc/meter/'+_actMap[c.action],{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cfg:cfg})});
          d=await r.json(); }
      }
      if(d&&d.ok){
        c.output=d.text||(c.action+' 완료');
        var _mcrit=String(c.criteria||'').trim();
        if(_mcrit||['diff','table','expr','stepcmp'].indexOf(c.type||'')>=0){ _reJudge(c,tcid); if(!c.repeatResult)c.repeatResult='실행완료'; }   // 시작/멈춤/조회 모두 판정 기준 적용(CLI와 동일)
        else { c.repeatResult='실행완료'; }
      } else { c.output='[계측기 오류] '+((d&&d.error)||'알 수 없음'); c.repeatResult='Fail'; }
    }catch(e){ c.output='[요청 오류] '+e.message; c.repeatResult='Fail'; }
    c.executed_at=_nowStr();
    _logRec(tcid,{t:_nowStr().slice(11),label:_lbl,kind:'cli',name:c.action,status:c.repeatResult||'info',output:c.output});
    _ckCollapsed[id]=false; await saveTCFile(tc); tcProcRefresh(tcid); return;
  }
  if((c.action||'')==='SNMP Trap'){
    const oid=_subVars(c.cli||'',tcid).trim();
    if(!oid){ showToast('Trap OID를 선택하세요'); return; }
    c.output='⏳ Trap 대기: '+oid+'\n(수신 시 varbind를 판정기준과 비교 · 기준 미입력이면 내용만 기록 후 보류)'; c.repeatResult=''; tcProcRefresh(tcid);
    try{
      const r=await fetch('/api/snmp-trap/wait',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({oid:oid,timeout:Math.max(3,parseInt(c.waitSec)||15)})});
      const d=await r.json();
      const crit=_subVars(c.criteria,tcid); const hasCrit=!!(crit&&crit.trim());
      if(d&&d.ok&&d.trap){
        const vb=(d.trap.varbinds||[]).map(v=>v.oid+' = '+v.value).join('\n');
        c.output='📨 Trap 수신: '+(d.trap.oid||oid)+(d.trap.from?(' (from '+d.trap.from+')'):'')+'\n'+vb;
        if(hasCrit){ c.repeatResult=_judgeCheck(c.output,crit,c.type||'contains',c.excludeLines,c.query)||''; }
        else { c.repeatResult=''; c.output+='\n— 판정 보류 (기준값 미입력: trap 내용만 기록)'; }
      } else {
        c.output='⏱ Trap 미수신(timeout) — '+((d&&d.error)||'수신기 동작·장비 trap 전송 설정을 확인하세요');
        c.repeatResult=hasCrit?'Fail':'';
        if(!hasCrit) c.output+='\n— 판정 보류 (기준값 미입력)';
      }
      c.executed_at=_nowStr();
      _extractStepQueries(tcid, c, c.output);   // Trap 출력도 Query 값 추출
      _logRec(tcid,{t:_nowStr().slice(11),label:_lbl,kind:'cli',name:'Trap '+oid,status:(c.repeatResult||'info'),criteria:c.criteria||'',output:c.output});
    }catch(e){ c.output='[요청 오류] '+e.message+'  (trap 수신기 미구현/미실행)'; c.repeatResult='Fail'; }
    _ckCollapsed[id]=false; await saveTCFile(tc); tcProcRefresh(tcid); return;
  }
  if((c.action||'')==='SNMP Set' || (((c.action||'')==='SNMP Private'||(c.action||'')==='SNMP Public') && /\]\s*$/.test(_subVars(c.cli||'',tcid)))){   // SNMP SET: "OID [값]". RW·RO 무관하게 [값] 형식이면 SET(쓰기 community=snmp_private 자동)
    const _l=_checkLab(tc,c);
    const _setFail=function(msg){ c.output=msg; c.repeatResult='Fail'; c.executed_at=_nowStr(); _logRec(tcid,{t:_nowStr().slice(11),label:_lbl,kind:'cli',name:'SNMP SET',status:'Fail',criteria:c.criteria||'',output:c.output,dev:((_l&&(_l.name||_l.ip))||'')}); _ckCollapsed[id]=false; if(_bulkRun){ _logLiveUpdate(tcid); } else { showToast(msg); saveTCFile(tc); tcProcRefresh(tcid); } };   // 가드 실패도 로그·Fail로 남겨 '무시하고 진행' 방지
    if(!_l||!_l.ip){ _setFail('[SNMP SET] 대상 장비(IP) 없음 — 스텝의 대상 장비를 지정하세요'); return; }
    const _raw=_subVars(c.cli||'',tcid).trim();
    if(!_raw){ _setFail('[SNMP SET] OID와 값을 입력하세요 (예: .1.3.6.1.2.1.1.4.0 [test])'); return; }
    const _bm=_raw.match(/^([\s\S]*?)\[([\s\S]*)\]\s*$/);   // OID [값] — 대괄호 안이 값
    let oid, val;
    if(_bm){ oid=_bm[1].trim().replace(/\s+/g,''); val=_bm[2]; }
    else { const _sp=_raw.search(/\s/); oid=(_sp<0?_raw:_raw.slice(0,_sp)).trim(); val=(_sp<0?'':_raw.slice(_sp+1)).trim(); }   // 폴백: 띄어쓰기 구분
    if(/::/.test(val)){ const _vm=val.match(/^\S+\s+([\s\S]+)$/); if(_vm) val=_vm[1].trim(); }   // iTest식 [MIB-name 값] (예: MIB-2::system.sysContact.0 새값) → MIB 이름 떼고 값만 SET
    let _vtype='';   // 타입 지정: [u:40]·[i:40]·[s:hello]·[x:DEADBEEF] → 백엔드에 type 전달(미지정 시 백엔드가 Integer→Unsigned 자동 재시도)
    { const _tm=String(val).match(/^\s*(i|u|c|g|t|s|a|x|hex|int|uint|unsigned|gauge|gauge32|counter|counter32|ticks|timeticks|integer|ip|ipaddress)\s*:\s*([\s\S]*)$/i); if(_tm){ _vtype=_tm[1].toLowerCase(); val=_tm[2].trim(); } }
    if(!oid){ _setFail('[SNMP SET] OID를 입력하세요 (예: .1.3.6.1.2.1.1.4.0 [test])'); return; }
    if(!_bm && !val){ _setFail('[SNMP SET] 바꿀 값을 [ ] 안에 입력하세요 (예: '+oid+' [test])'); return; }
    if(typeof snmpData!=='undefined'&&!snmpData&&typeof loadSnmp==='function'){ try{loadSnmp();}catch(e){} }
    const comm=(_l.snmp_private&&_l.snmp_private.trim())||'private';   // RW 쓰기 community: 등록값 우선, 미등록 시 관례적 'private'(대다수 장비 RW community명) 자동 사용
    const ver=_l.snmp_ver||'v2c';
    c.output='⏳ SNMP set '+oid+' = '+val+' @ '+_l.ip+' ...'; c.repeatResult=''; if(!_bulkRun) tcProcRefresh(tcid);
    try{
      const r=await fetch('/api/snmp-set',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host:_l.ip,oid:oid,value:val,community:comm,version:ver,type:_vtype})});
      const d=await r.json();
      c.output=d.ok?(d.output||'[SNMP SET OK] '+oid+' = '+val):('[SNMP SET 오류] '+(d.error||'')+(/(noaccess|no access|authorizationerror)/i.test(String(d.error||''))?'\n→ 이 community에 쓰기(RW) 권한이 없습니다. SNMP Private 값과 장비의 community 권한(RW)을 확인하세요.':''));
      const crit=_subVars(c.criteria,tcid);
      c.repeatResult=(!d.ok)?'Fail':(_judgeCheck(c.output,crit,c.type||'contains',c.excludeLines,c.query)||'실행완료');
      c.executed_at=_nowStr();
      _extractStepQueries(tcid, c, c.output);
      _logRec(tcid,{t:_nowStr().slice(11),label:_lbl,kind:'cli',name:'SNMP SET '+oid+' = '+val,status:(c.repeatResult||'완료'),criteria:c.criteria||'',output:c.output,dev:((_l&&(_l.name||_l.ip))||'')});
      showToast((c.repeatResult==='Pass'?'✅ ':c.repeatResult==='Fail'?'❌ ':'')+'SNMP SET '+oid);
    }catch(e){ c.output='[요청 오류] '+e.message; c.repeatResult='Fail'; }
    _ckCollapsed[id]=false; if(_bulkRun){ _logLiveUpdate(tcid); } else { await saveTCFile(tc); tcProcRefresh(tcid); } return;
  }
  if((c.action||'CLI').indexOf('SNMP')===0){
    const _l=_checkLab(tc,c);
    if(!_l||!_l.ip){ showToast('SNMP 대상 장비(IP)를 세션에 추가하세요'); return; }
    const oid=_subVars(c.cli||'',tcid).trim().replace(/\s*\[[^\]]*\]\s*$/,'').trim();   // GET은 끝의 [값] 무시(혹시 붙어와도 OID로 안 보냄)
    if(!oid){ showToast('OID를 선택/입력하세요'); return; }
    const _isPriv=c.action==='SNMP Private';
    if(typeof snmpData!=='undefined'&&!snmpData&&typeof loadSnmp==='function'){ try{loadSnmp();}catch(e){} }
    const _pubComm=(_l.snmp_public&&_l.snmp_public.trim())||((typeof snmpData!=='undefined'&&snmpData&&snmpData.communities&&snmpData.communities[0]&&snmpData.communities[0].community)||'public');
    const comm=_isPriv?(_l.snmp_private||''):_pubComm;
    const ver=_l.snmp_ver||'v2c';
    if(_isPriv&&!comm){ showToast((_l.name||'장비')+'의 SNMP Private community가 없습니다 (Device Registration)'); return; }
    c.output='⏳ SNMP get '+oid+' @ '+_l.ip+' ...'; c.repeatResult=''; tcProcRefresh(tcid);
    try{
      const r=await fetch('/api/snmp-get',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host:_l.ip,oid:oid,community:comm,version:ver})});
      const d=await r.json();
      c.output=d.ok?(d.output||'(빈 응답)')+(d.mode==='walk'?('\n— (WALK '+(d.count||0)+'행: 테이블 OID 자동 조회)'):''):('[SNMP 오류] '+(d.error||''));
      const crit=_subVars(c.criteria,tcid);
      // 백엔드 오류(No Such Instance 등 ok:false)는 기준과 무관하게 Fail — 오류값이 우연히 기준에 매칭되어 합격되는 것 방지
      // 판정기준 없으면 합격(X) → '실행완료'(조회만). 기준 있으면 판정. (CLI 경로와 동일 규칙)
      c.repeatResult=(!d.ok)?'Fail':(_judgeCheck(c.output,crit,c.type||'contains',c.excludeLines,c.query)||'실행완료');
      c.executed_at=_nowStr();
      _extractStepQueries(tcid, c, c.output);   // SNMP 출력도 Query 값 추출(var2…)
      _logRec(tcid,{t:_nowStr().slice(11),label:_lbl,kind:'cli',name:'SNMP '+oid,status:(c.repeatResult||'완료'),criteria:c.criteria||'',output:c.output,dev:((_l&&(_l.name||_l.ip))||'')});
      showToast((c.repeatResult==='Pass'?'✅ ':c.repeatResult==='Fail'?'❌ ':'')+'SNMP '+oid);
    }catch(e){ c.output='[요청 오류] '+e.message; c.repeatResult='Fail'; }
    _ckCollapsed[id]=false; await saveTCFile(tc); tcProcRefresh(tcid); return;
  }
  if((c.action||'CLI')==='Ping'){
    let host=_subVars(c.cli||'',tcid).split(/\r?\n/)[0].trim();
    if(!host){ const _l=_checkLab(tc,c); host=(_l&&_l.ip)||''; }
    if(!host){ showToast('Ping 대상 IP를 Test Data에 입력하거나 세션을 추가하세요'); return; }
    c.output='⏳ ping '+host+' ...'; c.repeatResult=''; tcProcRefresh(tcid);
    try{
      const r=await fetch('/api/ping',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host:host,count:4})});
      const d=await r.json();
      c.output=d.ok?(d.output||'(빈 응답)'):('[Ping 오류] '+(d.error||''));
      const crit=_subVars(c.criteria,tcid);
      // 판정기준 없으면 합격(X): 살아있으면 '실행완료'(조회만), 응답없음만 'Fail'. 기준 있으면 판정.
      c.repeatResult = (crit&&crit.trim()) ? (_judgeCheck(c.output,crit,c.type||'contains',c.excludeLines,c.query)||'실행완료') : (d.alive?'실행완료':'Fail');
      c.executed_at=_nowStr();
      _extractStepQueries(tcid, c, c.output);   // Ping 출력도 Query 값 추출
      _logRec(tcid,{t:_nowStr().slice(11),label:_lbl,kind:'cli',name:'ping '+host,status:(c.repeatResult||'완료'),criteria:c.criteria||'',output:c.output,dev:host});
      showToast((c.repeatResult==='Pass'?'✅ ':c.repeatResult==='Fail'?'❌ ':'')+'ping '+host);
    }catch(e){ c.output='[요청 오류] '+e.message; c.repeatResult='Fail'; }
    _ckCollapsed[id]=false; await saveTCFile(tc); tcProcRefresh(tcid); return;
  }
  if((c.action||'')==='모델 감지'){
    const l=_checkLab(tc,c,_forceId);
    if(!l||!l.ip){ c.output='[모델 감지] 대상 장비(IP) 없음 — 스텝의 대상 장비를 지정하세요 (Device 관리).'; c.repeatResult='Fail'; c.executed_at=_nowStr(); _logRec(tcid,{t:_nowStr().slice(11),label:_lbl,kind:'cli',name:'모델 감지',status:'Fail',output:c.output}); _ckCollapsed[id]=false; if(_bulkRun){ _logLiveUpdate(tcid); } else { await saveTCFile(tc); tcProcRefresh(tcid); } return; }
    const _mcmd=(_subVars(c.cli,tcid).trim())||'show system';
    const _mrule=(_extractRuleFor(c,'model'))||(c.modelRule&&String(c.modelRule).trim())||'Model Name';
    c.output='⏳ 모델 감지 중... ('+(l.name||l.ip)+' · '+_mcmd+')'; if(!_bulkRun) tcProcRefresh(tcid);
    const _es=await _ensureSess(tcid,l);
    if(!_es.ok){ c.output='[모델 감지] 세션 연결 실패: '+(_es.error||'')+' ('+(l.name||l.ip)+')'; c.repeatResult='Fail'; c.executed_at=_nowStr(); _logRec(tcid,{t:_nowStr().slice(11),label:_lbl,kind:'cli',name:'모델 감지',status:'Fail',output:c.output}); _ckCollapsed[id]=false; if(_bulkRun){ _logLiveUpdate(tcid); } else { await saveTCFile(tc); tcProcRefresh(tcid); } return; }
    try{
      const r=await fetch('/api/run-cli',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host:l.ip,port:l.port,protocol:l.protocol,username:l.username,password:l.password,secret:l.secret,device_type:l.device_type,commands:[_mcmd],repeat:1,interval:1,cmd_delay:_tcStepCmdDelay(c),require_session:true})});
      const d=await r.json();
      const _raw=(d&&d.ok&&Array.isArray(d.outputs)&&d.outputs[0])?(d.outputs[0].output||''):((d&&d.error)?('[오류] '+d.error):'');
      const _mv=String(_extractVar(_raw,_mrule)||'').trim();
      if(_mv){ _varSetUser(tcid,'model',_mv,false); var _mg=((modelList||[]).find(function(x){return x.name===_mv;})||{}).group||''; if(_mg)_varSetUser(tcid,'modelGroup',_mg,false); c.output='✅ 감지된 모델: '+_mv+(_mg?(' (모델그룹: '+_mg+')'):'')+'   →  ${model}'+(_mg?' · ${modelGroup}':'')+' 설정\nSwitch 예: ${model} 또는 ${modelGroup} 로 분기\n\n'+_raw; c.repeatResult='실행완료'; }
      else { c.output='⚠ 모델 추출 실패 (규칙: "'+_mrule+'") — 명령/규칙을 확인하세요.\n\n'+_raw; c.repeatResult='Fail'; }
      try{ const _src=_respShownLines(c).join('\n'); _extractStepQueries(tcid, c, _src); _stepExtracts(c).forEach(function(e){ if(e&&e.var&&e.var!=='model'&&e.var!=='modelGroup') _varSetAuto(tcid, e.var, _extractVar(_src, _subVars(e.rule,tcid))); }); }catch(_qe){}   // 모델 감지 출력에도 Query·추출 변수 적용(누락 버그)
      c.executed_at=_nowStr();
      _logRec(tcid,{t:_nowStr().slice(11),label:_lbl,kind:'cli',name:'모델 감지 → '+(_mv||'실패'),status:(_mv?'완료':'Fail'),criteria:'${model} = '+_mrule,output:c.output,dev:(l.name||l.ip)});
    }catch(e){ c.output='[요청 오류] '+e.message; c.repeatResult='Fail'; }
    _ckCollapsed[id]=false; if(_bulkRun){ _logLiveUpdate(tcid); } else { await saveTCFile(tc); tcProcRefresh(tcid); }
    return;
  }
  if(!c.cli||!c.cli.trim()){ showToast('CLI를 먼저 입력하세요'); return; }
  // 세션 미선택 방지 — 명시적으로 세션/장비가 지정되지 않았으면 실행 차단 + 로그에 표시
  if(!_checkHasExplicitSession(tc, c, _forceId)){
    c.output='⚠ 세션 먼저 선택하세요 — 이 스텝의 Session 열에서 장비를 선택하거나, 상단 세션 바에 장비를 추가하세요.';
    c.repeatResult='Fail'; c.executed_at=_nowStr();
    _logRec(tcid,{t:_nowStr().slice(11),label:_lbl,kind:'cli',name:(c.cli||'').split(/\r?\n/)[0]||'명령',status:'Fail',criteria:'세션 미선택',output:c.output});
    _tcAbortByMissingSession(tcid);   // 전체 실행 흐름도 중단 (다음 스텝으로 진행 안 함)
    _ckCollapsed[id]=false;
    if(_bulkRun){ _logLiveUpdate(tcid); } else { await saveTCFile(tc); tcProcRefresh(tcid); }
    if(typeof showToast==='function') showToast('세션 먼저 선택하세요');
    return;
  }
  const l=_checkLab(tc,c,_forceId);
  if(!l){ showToast('세션(접속 장비)을 먼저 추가하세요'); return; }
  if(!l.ip){ showToast((l.name||'장비')+' IP가 없습니다 — Device Registration에서 입력'); return; }
  const _act4=(c.action||'CLI');
  if((_act4==='CLI'||_act4==='DIFF') && !_isSessOpen(tcid,l)){
    c.output='⏳ 세션 자동 연결 중... ('+(l.name||l.ip)+')'; if(!_bulkRun) tcProcRefresh(tcid);
    const _es=await _ensureSess(tcid,l);
    if(!_es.ok){
      c.output='[세션 자동연결 실패] '+(_es.error||'')+' ('+(l.name||l.ip)+')\nDevice 관리에서 IP·계정·프로토콜을 확인하세요.'; c.repeatResult='Fail'; c.executed_at=_nowStr();
      _logRec(tcid,{t:_nowStr().slice(11),label:_lbl,kind:'cli',name:(c.cli||'').split(/\r?\n/)[0]||'명령',status:'Fail',criteria:'세션 자동연결 실패',output:c.output});
      _ckCollapsed[id]=false; if(_bulkRun){ _logLiveUpdate(tcid); } else { await saveTCFile(tc); tcProcRefresh(tcid); }
      return;
    }
  }
  const repN=parseInt(c.repeat)||1; const intv=parseInt(c.interval)||1;
  c.output='⏳ 실행 중...'+(repN>1?(' (반복 '+repN+'회 · '+intv+'초)'):'')+' ('+(l.name||'')+' · '+l.ip+')'; if(!_bulkRun) tcProcRefresh(tcid);
  try{
    const subCli=_subVars(c.cli,tcid);
    const cmds=subCli.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    let d, _didStream=false;
    if(repN<=1 && _liveTermVisible()){           // 라이브 터미널이 떠 있는 단일 실행 → 실시간 스트리밍 표시
      d=await _runCliStreamToLive(l,cmds); _didStream=!!(d&&d.ok);
    }else{
      // Completion Wait On: 프롬프트/[y/n] 대기 없이 명령 write만 하고 지정 초 동안 응답 수집.
      // 세션은 열린 채로 두어(장비의 [y/n] 대기 상태 그대로 유지) 다음 스텝의 y가 [y/n]: 위치에 바로 이어짐.
      const _compOn=!!c.compWaitOn;
      const _compSec=parseInt(c.compWait,10);
      const _wait_only=(_compOn && !isNaN(_compSec) && _compSec>0) ? _compSec : 0;
      // 라이브 터미널이 떠 있으면 백엔드가 이 스텝의 명령 chunk 를 WS(cli-live) 로 실시간 push 하도록 live_key 부여
      var _liveKey=_liveTermVisible() ? ('tc:'+tcid+':'+(c.id||id||'')+':'+(l.id||l.ip||'')+':'+Date.now()) : '';
      if(_liveKey){ try{ window._tcCliLiveExpect[_liveKey]=true; }catch(_e){} }
      const _reqBody=JSON.stringify({host:l.ip,port:l.port,protocol:l.protocol,username:l.username,password:l.password,secret:l.secret,device_type:l.device_type,commands:cmds,repeat:repN,interval:intv,cmd_delay:_tcStepCmdDelay(c),require_session:true,wait_only_sec:_wait_only,live_key:_liveKey});
      // AbortController 등록 → tcCheckRunStop 이 이 fetch 를 즉시 취소 (Netmiko 25초 timeout 대기 회피)
      window._runAbortCtrl=window._runAbortCtrl||{};
      var _ac=(typeof AbortController!=='undefined')?new AbortController():null;
      window._runAbortCtrl[tcid]=_ac;
      let r;
      try{ r=await fetch('/api/run-cli',{method:'POST',headers:{'Content-Type':'application/json'},body:_reqBody,signal:_ac?_ac.signal:undefined}); }
      catch(_fe){
        if(_fe && _fe.name==='AbortError'){ d={ok:false, aborted:true, error:'사용자 중단'}; }
        else throw _fe;
      }
      if(r) d=await r.json();
      try{ if(window._runAbortCtrl && window._runAbortCtrl[tcid]===_ac) delete window._runAbortCtrl[tcid]; }catch(_ce){}
      if(_liveKey){ try{ delete window._tcCliLiveExpect[_liveKey]; }catch(_e){} }
      // no_session 폴백: 백엔드 자동 재접속도 실패 → 프론트 세션 상태 리셋 후 _ensureSess 재시도(접속 재시도 N회×간격 적용) → 성공 시 명령 재실행 (사용자 로그에는 알림 노이즈 없이 조용히 처리)
      if(d && d.no_session){
        try{ if(_procSessOpen[tcid]) _procSessOpen[tcid].delete(_sessKey(l)); }catch(_e){}
        const _es2=await _ensureSess(tcid,l);
        if(_es2 && _es2.ok){
          const r2=await fetch('/api/run-cli',{method:'POST',headers:{'Content-Type':'application/json'},body:_reqBody});
          d=await r2.json();
        } else {
          d={ok:false, error:'세션 재접속 실패: '+((_es2&&_es2.error)||'')};
        }
      }
    }
    if(d.ok&&Array.isArray(d.outputs)&&d.outputs.length){
      let rawOut='';
      if(repN>1){
        const f=d.outputs[0]; const baseIters=f.iterations||[{output:f.output,at:f.at}];
        const iters=baseIters.map((_,k)=>({ output:d.outputs.map(o=>(o.iterations&&o.iterations[k]?o.iterations[k].output:o.output)).join('\n'), at:(f.iterations&&f.iterations[k]?f.iterations[k].at:'') }));
        let v;
        if((c.type||'')==='expr'){                                // F-3: expr는 회차별 직접 판정 (_judgeCheck는 expr에 '' 반환 → 항상 Fail)
          const _gn=_goldenVar(c);
          const per=iters.map(function(it){ const o=it.output||'';
            if(_gn && _varIsManual(tc,_gn)){ const _live=_extractVar(o, _subVars(_extractRuleFor(c,_gn),tcid)); const _gold=(_procVars[tcid]||{})[_gn]; return (String(_gold!=null?_gold:'').trim()!=='' && String(_live)===String(_gold))?'Pass':'Fail'; }
            _stepExtracts(c).forEach(e=> _varSetAuto(tcid,e.var,_extractVar(o,_subVars(e.rule,tcid)))); return _evalCond(c.criteria,tcid)?'Pass':'Fail'; });
          const _n=per.length, _pn=per.filter(x=>x==='Pass').length, _mode=c.repeatMode||'everytime';
          const _pass=(_mode==='mofn')?(_pn>=(parseInt(c.mofn)||_n)):(_pn===_n&&_n>0);
          v={pass:_pass, detail:_pn+'/'+_n+' 합격', per:per};
        } else { v=_repeatVerdict(iters,_subVars(c.criteria,tcid),c.type||'contains',c.repeatMode||'everytime',c.mofn,c.excludeLines,c.query); }
        c.repeatResult=v.pass?'Pass':'Fail';
        const head=(v.pass?'✅ 합격':'❌ 불합격')+' · '+(c.repeatMode||'everytime')+' · '+v.detail;
        c.output=head+'\n\n'+iters.map((it,k)=>'─── 회차 '+(k+1)+(it.at?(' '+it.at):'')+(v.per&&v.per[k]&&v.per[k]!=='-'?(' ['+v.per[k]+']'):'')+' ───\n'+it.output).join('\n\n');
        rawOut=iters.length?iters[iters.length-1].output:'';
        showToast((v.pass?'✅ 합격':'❌ 불합격')+' · '+(l.name||'')+' 반복 '+repN+'회');
      } else {
        c.output=d.outputs.map(o=>o.output).join('\n'); rawOut=c.output;
        // [자동 재기준] 줄 위치 기반 기준인데 감지 모델(${model}) 또는 장비가 기준 잡을 때와 달라지면 → 같은 줄 위치로 새 결과에서 기준 재도출 (이전 모델 기준 Fail 방지)
        try{ if(Array.isArray(c.critLines)&&c.critLines.length){
          const _cd=String((l&&(l.id||l.name||l.ip))||'');
          const _cm=String((((typeof _procVars!=='undefined'&&_procVars[tcid])||{}).model) || ((tc&&tc.varVals&&tc.varVals.model)||'') || '');
          const _ol=String(rawOut||'').split(/\r?\n/);
          const _nc=c.critLines.map(function(n){return _ol[n-1]==null?'':_ol[n-1];}).filter(function(x){return String(x).trim()!=='';});
          const _modelChg=!!(c.critModel&&_cm&&_cm!==c.critModel);
          const _devChg=!!(c.critDev&&_cd&&_cd!==c.critDev);
          const _toks=String(c.criteria||'').split(/\r?\n/).map(function(s){return s.trim();}).filter(Boolean);
          const _fails=_toks.length && !_toks.every(function(t){return String(rawOut||'').indexOf(t)>=0;});   // 현재 기준이 새 출력에 안 맞음(= 다른 모델 값)
          // 모델/장비가 바뀌었거나(게이트), 게이트가 안 잡혀도 현재 기준이 새 출력에 '안 맞으면'(다른 모델 값) → 선택 줄 위치로 자동 재도출
          if(_nc.length && (_modelChg || _devChg || _fails)){ c.criteria=_nc.join('\n'); c.critDev=_cd; c.critModel=_cm; if(typeof showToast==='function')showToast('🔁 '+(_cm||(l&&l.name)||_cd)+' 결과로 판정기준 자동 변환 (선택 줄 위치 유지)'); }
          else { if(_cd&&!c.critDev)c.critDev=_cd; if(_cm&&!c.critModel)c.critModel=_cm; }
        } }catch(_e){}
        if((c.type||'')==='stepcmp'){
          var _jc=_judgeStepCmp(tcid,c,rawOut); c.repeatResult=_jc.pass?'Pass':'Fail';
          c.output=rawOut+'\n\n─── 스텝 값 비교 ───\n내 값 ['+_jc.a+'] '+(c.cmpOp||'==')+' 대상 값 ['+_jc.b+'] → '+(_jc.pass?'일치 (Pass)':'불일치 (Fail)');
          showToast((_jc.pass?'✅ 합격':'❌ 불합격')+' · 스텝 값 비교');
        } else if((c.type||'')==='expr'){
          const _gn=_goldenVar(c); let _ok, _rsn;
          if(_gn && _varIsManual(tc,_gn)){                       // 골든 비교: 출력 재추출 vs 저장 골든
            const _live=_extractVar(rawOut, _subVars(_extractRuleFor(c,_gn),tcid));
            const _gold=(_procVars[tcid]||{})[_gn];
            _ok=(String(_gold!=null?_gold:'').trim()!=='' && String(_live)===String(_gold));
            _rsn='변수 ${'+_gn+'}(저장 골든) vs 출력 재추출 비교 → '+(_ok?'일치 (Pass)':'불일치 (Fail)')+'\n[골든] '+String(_gold==null?'':_gold)+'\n[출력] '+String(_live);
          } else {                                               // 식 평가 (모든 변수 먼저 추출)
            _stepExtracts(c).forEach(e=> _varSetAuto(tcid, e.var, _extractVar(rawOut, _subVars(e.rule,tcid))));
            _ok=_evalCond(c.criteria,tcid); _rsn='식 평가: '+_subVars(c.criteria,tcid)+'  →  '+(_ok?'참 (Pass)':'거짓 (Fail)');
          }
          c.repeatResult=_ok?'Pass':'Fail';
          c.output=rawOut+'\n\n─── 판정 근거 ───\n'+_rsn;   // 장비 출력 유지
          showToast((_ok?'✅ 합격':'❌ 불합격')+' · '+(l.name||''));
        } else {
          const v=_judgeCheck(rawOut,_subVars(c.criteria,tcid),c.type||'contains',c.excludeLines,c.query);
          c.repeatResult=v||'실행완료';   // 판정기준 없으면(none/빈 기준) 초록 '실행완료' 표시 (미실행 X)
          try{ const _tp=c.type||'contains'; if(_tp!=='diff'&&_tp!=='table'){ const _rsn=_judgeReason(_applyQuery(rawOut,c.query),_subVars(c.criteria,tcid),_tp,c.excludeLines,v); if(_rsn) c.output=rawOut+'\n\n─── 판정 근거 ───\n'+_rsn; } }catch(e){}
          if((c.type)==='table'){ c.output=rawOut+'\n\n─── 표 검증 ───\n'+_judgeTable(_applyQuery(rawOut,c.query),_subVars(c.criteria,tcid)).detail.replace(/\s*\|\s*/g,'\n  '); }
          if((c.type)==='diff'){ const _dv=_judgeDiff(rawOut,c.baseline,c.excludeLines); c.repeatResult=_dv.pass?'Pass':'Fail'; c.output=rawOut+'\n\n─── 기준 비교 ───\n'+_dv.detail; }
          showToast((v?(v==='Pass'?'✅ 합격':'❌ 불합격'):'완료')+' · '+(l.name||''));
        }
      }
      l.status='연결됨'; c.executed_at=_nowStr();
      _extractStepQueries(tcid, c, rawOut);   // 각 Query 값 → 변수(query1·query2…) 자동 저장
      // 콘솔/라이브 표시: 명령 1줄 + (에코 제거된) 출력만 — transcript는 보낸 글자+장비 echo를 둘 다 기록해 명령이 두 번 보임
      const _cleanOut=(Array.isArray(d.outputs)&&d.outputs.length)
        ? (repN<=1
            ? cmds.map(function(cmd,i){ const o=d.outputs[i]; const oo=(o&&o.output!=null)?String(o.output).replace(/[\s\r\n]+$/,''):''; return cmd+(oo?('\n'+oo):''); }).join('\n')
            : (cmds.join('\n')+'\n'+rawOut))
        : (rawOut||'');
      var _proto=((l&&String(l.protocol||'').toUpperCase())||'SSH');
      _logRec(tcid,{t:_nowStr().slice(11),label:_lbl,kind:'cli',name:_subVars(c.cli,tcid).split(/\r?\n/)[0]||'명령',status:(c.repeatResult||'완료'),criteria:c.criteria||'',output:_cleanOut,dev:((l&&(l.name||l.ip))||''),proto:_proto});
      try{ if(!_didStream) liveTermAppend(_cleanOut||('$ '+_subVars(c.cli,tcid)+'\n'+rawOut)); }catch(e){}
      _stepExtracts(c).forEach(function(e){ const val=_extractVar(rawOut, _subVars(e.rule,tcid)); _varSetAuto(tcid, e.var, val); if(val && !_varIsManual(tc,e.var)){ showToast('변수 '+e.var+' = '+val); _logRec(tcid,{t:_nowStr().slice(11),label:_lbl,kind:'group',name:'변수 '+e.var+' = '+val,status:'info'}); } });
    }
    else { c.output='[실행 실패] '+(d.error||'응답 없음'); l.status='실패'; _logRec(tcid,{t:_nowStr().slice(11),label:_lbl,kind:'cli',name:_subVars(c.cli,tcid).split(/\r?\n/)[0]||'명령',status:'Fail',criteria:'실행 실패',output:c.output}); showToast('❌ 실행 실패: '+(d.error||'')); }
  }catch(e){ c.output='[요청 오류] '+e.message; _logRec(tcid,{t:_nowStr().slice(11),label:_lbl,kind:'cli',name:(c.cli||'').split(/\r?\n/)[0]||'명령',status:'Fail',criteria:'요청 오류',output:e.message}); showToast('요청 오류: '+e.message); }
  _ckCollapsed[id]=false; // 실행 결과는 펼쳐서 보여줌
  if(_bulkRun){ _logLiveUpdate(tcid); } else { await saveTCFile(tc); await saveDeviceData(); tcProcRefresh(tcid); }
  }finally{ if(_needUnlock) delete _tcSingleRunLock[tcid]; }
}
async function _runLocalProc(tcid, procName){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc) return;
  const items=tc.checks||[]; let start=-1;
  for(let i=0;i<items.length;i++){ if((items[i].kind)==='proc' && String(items[i].name||'').trim()===String(procName||'').trim()){ start=i+1; break; } }
  if(start<0){ _logRec(tcid,{t:_nowStr().slice(11),kind:'group',name:'⚠ 프로시저 없음: '+procName,status:'skip'}); return; }
  for(let i=start;i<items.length;i++){ const c=items[i]; const k=c.kind||'cli'; if(k==='proc') break; if(k==='group'||k==='model') continue;
    try{ var _dt=String(c.desc||'').trim(); if(_dt && /(\$\{[\w가-힣]+\})|(\$[A-Za-z_]\w*)/.test(_dt)){ _logRec(tcid,{t:_nowStr().slice(11),kind:'group',name:'📝 '+_subVars(_dt,tcid,c),status:'info'}); } }catch(_de){}
    await tcCheckRun(tcid, c.id);
    // 스텝 사이 대기 — 다음 스텝의 IDLE Interval(스텝별 · 없으면 전역) 값을 그대로 사용.
    var _nx=items[i+1]; var _dly=_nx?_tcStepCmdDelay(_nx):_TC_STEP_DEFAULT_IDLE;
    if(_dly>0) await _sleep(_dly);
  }
}
let _runPause={}; let _bpStepOver={};            // Breakpoint 멈춤 상태 / 멈춘 스텝 1회 통과
let _runAbort={};                                 // 사용자 요청 즉시 중단 플래그 (실행 루프에서 검사)
let _runPauseReq={};                              // 사용자 요청 일시정지 플래그 (다음 스텝 시작 전 정지, 재개 가능)
function _tcRunAbortRequested(tcid){ return !!_runAbort[tcid]; }
function _tcRunPauseRequested(tcid){ return !!_runPauseReq[tcid]; }
function _tcResumeBar(tcid,show,msg){
  let b=document.getElementById('tc-resume-bar');
  if(!show){ if(b)b.remove(); return; }
  if(!b){ b=document.createElement('div'); b.id='tc-resume-bar'; document.body.appendChild(b); }
  b.style.cssText='position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:100000;background:#1c2030;color:#fff;border-radius:11px;box-shadow:0 10px 30px rgba(0,0,0,0.34);padding:10px 15px;display:flex;align-items:center;gap:11px;font-size:13px;font-weight:600;';
  b.innerHTML='<i class="ti ti-player-pause-filled" style="color:#e8820c;font-size:17px;"></i><span>'+(msg||'Breakpoint에서 멈춤')+'</span><button onclick="tcCheckRunResume(\''+tcid+'\')" style="background:#2d6fd4;color:#fff;border:none;border-radius:7px;padding:6px 15px;font-weight:700;cursor:pointer;font-size:13px;"><i class="ti ti-player-play-filled"></i> 계속</button><button onclick="tcCheckRunStop(\''+tcid+'\')" style="background:#e53e5a;color:#fff;border:none;border-radius:7px;padding:6px 13px;font-weight:700;cursor:pointer;font-size:13px;"><i class="ti ti-player-stop-filled"></i> 중단</button>';
}
async function tcCheckRunResume(tcid){
  if(!_runPause[tcid]){ showToast('멈춘 시험이 없습니다'); return; }
  _tcResumeBar(tcid,false); _bpStepOver[tcid]=true; await tcCheckRunAll(tcid, true);
}
function tcCheckRunStop(tcid){ _runAbort[tcid]=true; _runPause[tcid]=null; _bpStepOver[tcid]=false; _tcResumeBar(tcid,false); _tcRunStopBar(tcid,false); try{ _logRec(tcid,{t:_nowStr().slice(11),kind:'group',name:'⏹ 사용자 요청 — 시험 절차 중단',status:'info'}); }catch(_e){} showToast('⏹ 시험 중단 요청 — 현재 스텝 종료 후 정지'); try{ tcProcRefresh(tcid); }catch(e){}
  // ★ 진행 중인 CLI fetch 를 즉시 취소 → 서버 응답 대기(최대 25초) 로 인해 중단이 안 먹히던 문제 해결
  try{ var _ac=(window._runAbortCtrl||{})[tcid]; if(_ac && typeof _ac.abort==='function') _ac.abort(); }catch(_ae){}
  // 사이클 실행 중이면 사이클 전체도 중단 — 다음 아이템으로 넘어가지 않도록
  try{ if(typeof _cbRunActive!=='undefined' && _cbRunActive){ _cbRunActive=false; _cbRunAbort=true; if(typeof _cbRunClearState==='function') _cbRunClearState(); if(typeof _cbRunOverlayHide==='function') _cbRunOverlayHide(); if(typeof cbRunBanner==='function') cbRunBanner('⏹ 사용자 요청 — Test Cycle 중지', false, 2500); if(typeof _cbRunNotify==='function') _cbRunNotify('done',{done:0,total:0}); } }catch(_ce){}
}
// ⏸ 일시정지 요청: 다음 스텝 시작 전에 실행 루프가 감지하여 정지 (현재 스텝은 완료).
// 재개는 tcCheckRunResume 또는 하단 ▶계속 버튼 — _procVars/_procSessOpen/stack(for 루프 카운터) 유지된 채 다음 스텝부터 이어서.
function tcCheckRunPause(tcid){ _runPauseReq[tcid]=true; showToast('⏸ 일시정지 요청 — 현재 스텝 종료 후 멈춤'); try{ _logRec(tcid,{t:_nowStr().slice(11),kind:'group',name:'⏸ 사용자 요청 — 일시정지 대기',status:'info'}); }catch(_e){} try{ tcProcRefresh(tcid); }catch(e){} }
// 실행 로그 지우기 — 누적된 이전 실행 기록 전체 삭제 (진행 중 실행에는 영향 없음, 이후 이어지는 로그만 남음).
function tcCheckClearLog(tcid){ if(!(_runLog&&_runLog[tcid]&&_runLog[tcid].length)){ showToast('지울 로그가 없습니다'); return; } if(!confirm('실행 로그 전체를 지울까요?')) return; _runLog[tcid]=[]; _runElapsed[tcid]=null; showToast('🗑 실행 로그 지움'); try{ tcProcRefresh(tcid); }catch(e){} }
// 실행 중(멈춤 아님) 화면 하단에 표시되는 ⏹ 중단 바 — 진행 중인 반복/대기 도중에도 사용자가 즉시 중단 요청 가능.
// stopbar 자동 관리: _runActive 있고 (show 요청 or 현재 화면이 그 TC) 이면 표시.
// 다른 TC/페이지로 이동한 상태에서는 자동 숨김 (사용자가 다른 스텝 이동해도 잔재로 남지 않게).
function _tcRunStopBar(tcid, show){
  var b=document.getElementById('tc-runstop-bar');
  if(!show || !_runActive){ if(b) b.remove(); return; }
  var _actTcid=_runActive.tcid;
  // 현재 화면이 실행 중 TC 가 아니면 stopbar 안 띄움 (다른 TC 편집 중 잔재 방지)
  var _curTcid=(typeof _activeProcTcid==='function')?_activeProcTcid():null;
  if(_curTcid && _actTcid && _curTcid!==_actTcid){ if(b) b.remove(); return; }
  if(!b){ b=document.createElement('div'); b.id='tc-runstop-bar'; document.body.appendChild(b); }
  b.style.cssText='position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:100000;background:#1c2030;color:#fff;border-radius:11px;box-shadow:0 10px 30px rgba(0,0,0,0.34);padding:9px 15px;display:flex;align-items:center;gap:11px;font-size:13px;font-weight:600;';
  var _tesc=String(_actTcid||tcid||'').replace(/\\/g,"\\\\").replace(/'/g,"\\'");
  b.innerHTML='<i class="ti ti-player-play-filled" style="color:#00a872;font-size:16px;"></i><span>시험 절차 실행 중</span><button onclick="tcCheckRunPause(\''+_tesc+'\')" title="현재 스텝 종료 후 멈춤 (재개 가능)" style="background:#e8820c;color:#fff;border:none;border-radius:7px;padding:6px 13px;font-weight:700;cursor:pointer;font-size:13px;"><i class="ti ti-player-pause-filled"></i> 멈춤</button><button onclick="tcCheckRunStop(\''+_tesc+'\')" title="현재 스텝 종료 후 중지 (재개 불가)" style="background:#e53e5a;color:#fff;border:none;border-radius:7px;padding:6px 13px;font-weight:700;cursor:pointer;font-size:13px;"><i class="ti ti-player-stop-filled"></i> 중지</button>';
}
// 화면 갱신 시 stopbar 상태 재판단 — tcProcRefresh 종료부에서 호출.
// 사용자 정책: stopbar 는 실행 중인 그 TC 페이지에서만 보이고, 다른 TC/스텝으로 이동하면 사라짐.
function _tcSyncStopBar(){
  try{
    if(!_runActive){ var b=document.getElementById('tc-runstop-bar'); if(b) b.remove(); return; }
    _tcRunStopBar(_runActive.tcid, true);   // 안에서 현재 화면 TC 매칭 여부 재확인
  }catch(_e){}
}
var _runStepWL={};   // {tcid: Set(실행할 cli step id)} — 모델그룹 단위 실행 시 위치 기반 화이트리스트
var _runActive=null; // {tcid, headerId|null} — 실행 중 버튼 블링크용 (headerId=null이면 전체 실행)
async function tcModelGroupRun(tcid, headerId){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc) return;
  const arr=tc.checks||[];
  const hi=arr.findIndex(function(x){return x.id===headerId;});
  if(hi<0||(arr[hi].kind||'cli')!=='model'){ showToast('모델그룹 헤더를 찾을 수 없습니다'); return; }
  // 이 그룹의 물리적 끝(다음 model 헤더 직전)
  var hj=hi+1; while(hj<arr.length && (arr[hj].kind||'cli')!=='model') hj++;
  // 화이트리스트 = 공통영역 + 이 그룹(hi<i<hj) 의 모든 스텝(connect/cli/disconnect 포함)
  var wl=new Set(); var curCommon=true;
  for(var i=0;i<arr.length;i++){ var c=arr[i], k=c.kind||'cli';
    if(k==='model'){ var mn=String(c.modelName||'').trim(); curCommon=(!mn||mn==='공통'); continue; }
    if(curCommon || (i>hi && i<hj)) wl.add(c.id);
  }
  var _isExec=function(c){ var k=c.kind||'cli'; return k!=='model'&&k!=='group'&&k!=='comment'&&k!=='message'&&k!=='proc'; };   // message는 라벨성이라 실행 카운트에는 넣지 않음(Cycle 결과 진행률 왜곡 방지)
  var execAll=arr.filter(_isExec).length;
  var execWl=arr.filter(function(c){return wl.has(c.id)&&_isExec(c);}).length;
  _runStepWL=_runStepWL||{}; _runStepWL[tcid]=wl;
  _runActive={tcid:tcid, headerId:headerId};   // 이 그룹 버튼 블링크
  try{ await tcCheckRunAll(tcid); }
  finally{ _runStepWL[tcid]=null; window._tcForceDevId=null; }
}
async function tcCheckRunAll(tcid, _resume, _devOpt){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc) return;
  const items=tc.checks||[];
  if(!items.length){ showToast('실행할 단계가 없습니다'); return; }
  let pc=0, guard=0, stack=[]; var ifState={}; var _swExit=null;   // ifState[indent]=직전 IF 결과; _swExit=Switch 매칭 블록 끝→영역끝 점프
  if(_resume && _runPause[tcid]){
    pc=_runPause[tcid].pc||0; stack=_runPause[tcid].stack||[]; // Breakpoint 재개: 멈춘 위치부터
  } else {
    (function(){ const _tc=_tcById(tcid); const _keep={}; if(_tc&&_tc.varManual&&_tc.varVals){ Object.keys(_tc.varManual).forEach(function(k){ if(_tc.varVals[k]!=null) _keep[k]=_tc.varVals[k]; }); } /* Query 변수 값도 보존 — 실행 중 재추출이 빈값이어도 이전 값 살아있게 (Query 는 영역 지정 목적) */ try{ var _qs=(typeof _tcQueryVarSet==='function' && _tc)?_tcQueryVarSet(_tc):{}; var _prevPv=_procVars[tcid]||{}; Object.keys(_qs).forEach(function(k){ if(_prevPv[k]!=null) _keep[k]=_prevPv[k]; else if(_tc && _tc.varVals && _tc.varVals[k]!=null) _keep[k]=_tc.varVals[k]; }); }catch(_qe){} _procVars[tcid]=_keep; })(); // B-7: 수동(골든) + Query 변수는 RunAll 리셋에서 보존
    if(!(_devOpt&&_devOpt.devLoop)){
      // 새 실행 시작 → 실행 로그 초기화 (이전 실행은 History 탭 스냅샷으로 저장됨).
      _runLog[tcid]=[]; _runElapsed[tcid]={start:Date.now(),sec:null};
    }
    _procSessOpen[tcid]=new Set(); // 세션 상태는 장비마다 초기화
  }
  if(_devOpt&&_devOpt.devName){ _logRec(tcid,{t:_nowStr().slice(11),kind:'group',name:'━━ 대상 장비 '+(_devOpt.devIdx+1)+'/'+_devOpt.devTotal+' : '+_devOpt.devName+' ━━',status:'info'}); }
  _runPause[tcid]=null;
  _runAbort[tcid]=false;   // 이번 실행 시작: 중단 플래그 리셋 (이전 중단 요청 잔재 제거)
  _runPauseReq[tcid]=false;   // 일시정지 요청도 리셋 (재개도 이 경로로 진입)
  try{ if(_liveTermOn){ liveTermShow(tc.tcid||tc.id); if(!_resume) liveTermClear(); } }catch(e){}
  _suppressToast=true; // 실행 중 코너 토스트 끄기 (헤더 ②로만)
  _bulkRun=true; // 스텝마다 저장/장비저장 생략
  if(!_runActive||_runActive.tcid!==tcid) _runActive={tcid:tcid, headerId:null}; // 직접 전체 실행 → 전체 버튼 블링크 (그룹 실행은 tcModelGroupRun이 이미 설정)
  _procBottomTab[tcid]='console'; // 전체 실행 중엔 Console(실시간 진행)
  tcProcRefresh(tcid);
  _tcRunStopBar(tcid,true);   // 실행 중: 하단에 ⏹ 중단 바 표시
  const ind=i=>Math.max(0,parseInt(items[i].indent)||0);
  const bodyEnd=i=>{ const L=ind(i); let j=i+1; while(j<items.length&&ind(j)>L)j++; return j; };
  const labels=_stepLabels(items);
  const idxByLabel=lbl=>{ const k=labels.indexOf(String(lbl||'').trim()); return k; };
  while((pc<items.length||stack.length) && guard++<200000){
    // 완료된 루프 처리 (반복 또는 종료) — 본문이 끝에 있어도 반복되도록
    while(stack.length && pc>=stack[stack.length-1].end){
      const fr=stack[stack.length-1]; fr.it++;
      let cont=false;
      if(fr.mode==='for'){ fr.cur=Math.round((fr.cur+fr.step)*1e6)/1e6; cont=(fr.step>0?(fr.cur<=fr.to):(fr.cur>=fr.to))&&fr.it<100000; if(cont){ _procVars[tcid]=_procVars[tcid]||{}; _procVars[tcid][fr.var]=fr.cur; } }
      else if(fr.mode==='count') cont=fr.it<fr.cnt;
      else if(fr.mode==='until') cont=!(fr.brk&&_evalCond(fr.brk,tcid))&&fr.it<10000;
      else if(fr.mode==='infinite') cont=!(fr.brk&&_evalCond(fr.brk,tcid))&&fr.it<1000;
      // 회차 헤더(loopit) 로그는 표시하지 않음 — 스텝만 연속으로 나열 (사용자 요청)
      if(cont){ pc=fr.start+1; } else { stack.pop(); }
    }
    if(_swExit && pc>=_swExit.at){ var _swT=_swExit.to; _swExit=null; if(_swT>pc) pc=_swT; continue; }   // Switch: 매칭 case 블록 끝 → switch 영역 끝으로(나머지 case 건너뜀)
    if(pc>=items.length) break;
    if(_tcRunAbortRequested(tcid)){ _logRec(tcid,{t:_nowStr().slice(11),kind:'group',name:'⏹ 시험 절차 중단됨 (사용자 요청)',status:'info'}); break; }   // 사용자 중단 요청 — 이번 스텝 실행 전 즉시 종료
    if(_tcRunPauseRequested(tcid)){   // 사용자 일시정지 요청 — 상태(stack/pc) 저장 후 대기, ▶계속으로 재개
      _runPauseReq[tcid]=false;
      _runPause[tcid]={pc:pc, stack:stack};
      _logRec(tcid,{t:_nowStr().slice(11),label:labels[pc],kind:'group',name:'⏸ 일시정지 — '+(labels[pc]||'')+' 진입 전 멈춤 (▶계속 / ⏹중단)',status:'info'});
      _suppressToast=false; _bulkRun=false; _runActive=null; _tcRunStopBar(tcid,false); tcProcRefresh(tcid); _tcResumeBar(tcid,true,'⏸ 일시정지 — ▶계속 으로 이어서 진행');
      showToast('⏸ 일시정지 — ▶계속 누르면 다음 스텝부터 이어서 진행');
      return;
    }
    const c=items[pc]; const k=c.kind||'cli';
    if(c.breakpoint && !_bpStepOver[tcid] && k!=='comment' && k!=='message' && k!=='group' && k!=='model'){ // 조건1: Breakpoint — 이 스텝 실행 전 멈춤
      _runPause[tcid]={pc:pc, stack:stack};
      _logRec(tcid,{t:_nowStr().slice(11),label:labels[pc],kind:'group',name:'⏸ Breakpoint — '+(labels[pc]||'')+' 에서 멈춤 (▶계속 / ⏹중단)',status:'info'});
      _suppressToast=false; _bulkRun=false; _runActive=null; tcProcRefresh(tcid); _tcResumeBar(tcid,true);
      showToast('⏸ Breakpoint: '+(labels[pc]||'')+' 에서 멈춤 — ▶계속 누르면 이어서 진행');
      return;
    }
    _bpStepOver[tcid]=false;
    if(c.skip){ _logRec(tcid,{t:_nowStr().slice(11),label:labels[pc],kind:'group',name:'⤼ Skip — '+(labels[pc]||'')+' 건너뜀',status:'skip'}); pc++; continue; } // 조건2: Skip — 건너뛰고 다음 스텝
    if(_cycleLiveCtx&&_cycleLiveCtx.tcid===tcid&&_cycleLiveCtx.model){
      // 라이브: 이 모델·공통만 실행. 그룹명 직접 일치 실패 시 modelList 를 통해 모델→그룹 해석 (suffix _1/_2 대응).
      const _em=_effModelOfStep(items,pc);
      if(_em!=='공통' && _em!==_cycleLiveCtx.model){
        var _mm=false;
        try{ _mm=(typeof _modelGroupMatch==='function')?_modelGroupMatch(_em, _cycleLiveCtx.model):false; }catch(_mme){}
        if(!_mm){
          // 최후 폴백: 사이클 모델(suffix 제거)이 그룹 소속 모델인지 재확인
          try{
            var _mfBase=String(_cycleLiveCtx.model||'').replace(/_\d+$/,'');
            if(_mfBase && _mfBase!==_cycleLiveCtx.model){
              _mm=(typeof _modelGroupMatch==='function')?_modelGroupMatch(_em, _mfBase):false;
            }
          }catch(_mbe){}
        }
        if(!_mm){ pc++; continue; }
      }
    } // 라이브: 이 모델·공통만 실행 (그룹 매칭 폴백 포함)
    if(_runStepWL&&_runStepWL[tcid]&&!_runStepWL[tcid].has(c.id)&&k!=='model'&&k!=='group'&&k!=='comment'&&k!=='message'&&k!=='loop'&&k!=='if'&&k!=='else'&&k!=='switch'&&k!=='proc'){ pc++; continue; } // 모델그룹 단위 실행: 화이트리스트(공통+이 그룹) 밖의 cli·connect·disconnect 등 전부 건너뜀. comment/message/loop/if/else/switch는 제어 흐름이라 항상 통과(안 그러면 for/if가 스킵되어 반복/분기 안 됨).
    if(k==='manual'&&!c.repeatResult){ // 수동 스텝 — 결과 미입력이면 여기서 멈춰 사용자 확인 대기
      _runPause[tcid]={pc:pc, stack:stack};
      _logRec(tcid,{t:_nowStr().slice(11),label:labels[pc],kind:'group',name:'🖐 수동 확인 대기 — '+((c.desc||'').split(/\r?\n/)[0]||'(수행 방법 미입력)')+' 에서 멈춤 (결과 선택 후 ▶계속)',status:'info'});
      _suppressToast=false; _bulkRun=false; _runActive=null; tcProcRefresh(tcid); _tcResumeBar(tcid,true,'🖐 수동 확인 대기 — 결과 선택 후 계속');
      showToast('🖐 수동 스텝 — 결과를 선택한 뒤 ▶계속을 누르세요');
      return;
    }
    if(k==='manual'){ _logRec(tcid,{t:_nowStr().slice(11),label:labels[pc],kind:'cli',name:'수동 확인: '+((c.desc||'').split(/\r?\n/)[0]||'(수행 방법 미입력)'),status:c.repeatResult,output:c.output||''}); pc++; continue; }
    if(k==='comment'){ _logRec(tcid,{t:_nowStr().slice(11),label:labels[pc],kind:'comment',name:c.text||'(주석)',status:'info'}); pc++; continue; }
    if(k==='message'){
      // 메시지: 변수($i, ${var} 등) 치환 후 실행 로그에 남기고, output/executed_at도 세팅해
      // Cycle 동기화(cycleSyncFromTC 등)에서 이 스텝이 반영되게 한다.
      var _msubs=''; try{ _msubs=_subVars(String(c.text||''), tcid, c); }catch(_me){ _msubs=String(c.text||''); }
      _logRec(tcid,{t:_nowStr().slice(11),label:labels[pc],kind:'group',name:'💬 '+(_msubs||'(메시지)'),status:'info'});
      c.output=_msubs; c.executed_at=_nowStr(); c.repeatResult='info';
      // 사이클 라이브: 브리지 훅으로 이 회차의 치환값을 사이클 스텝에 전달
      try{ if(typeof _cbBridgeMessage==='function' && typeof _cycleLiveCtx!=='undefined' && _cycleLiveCtx) _cbBridgeMessage(c.id, _msubs); }catch(_me2){}
      pc++; continue;
    }
    if(k==='group'){ _logRec(tcid,{t:_nowStr().slice(11),label:labels[pc],kind:'group',name:c.label||'단계',status:'info'}); pc++; continue; }
    if(k==='model'){ if(_runStepWL&&_runStepWL[tcid]){ var _hasWL=false; for(var _mj=pc+1;_mj<items.length&&(items[_mj].kind||'cli')!=='model';_mj++){ if(_runStepWL[tcid].has(items[_mj].id)){ _hasWL=true; break; } } if(!_hasWL){ pc++; continue; } } _logRec(tcid,{t:_nowStr().slice(11),label:labels[pc],kind:'group',name:'■ Model: '+(c.modelName||'공통'),status:'info'}); pc++; continue; }
    if(k==='proc'){ break; } // Main = 첫 Procedure 헤더 전까지. Sub 프로시저는 call로만 실행
    if(k==='loop'){ const end=bodyEnd(pc); if(end<=pc+1){ pc=end; continue; }
      if((c.loopMode||'count')==='for'){ // For: $변수 = from → to (step), 들여쓴 단계 반복
        const fv=(String(c.loopVar||'i').trim()||'i'); const _f=parseFloat(c.forFrom), _t=parseFloat(c.forTo), _s=parseFloat(c.forStep);
        const from=isNaN(_f)?1:_f, to=isNaN(_t)?1:_t; let step=(isNaN(_s)||_s===0)?1:_s;
        const valid=(step>0?(from<=to):(from>=to));
        if(!valid){ _logRec(tcid,{t:_nowStr().slice(11),label:labels[pc],kind:'loop',name:'반복(For) 범위 없음 ($'+fv+' '+from+'→'+to+' step '+step+') — 건너뜀',status:'info'}); pc=end; continue; }
        _procVars[tcid]=_procVars[tcid]||{}; _procVars[tcid][fv]=from;
        _logRec(tcid,{t:_nowStr().slice(11),label:labels[pc],kind:'loop',name:'반복 시작 (For $'+fv+' = '+from+' → '+to+' step '+step+')',status:'info'});
        // 회차 헤더(loopit) 로그 제거 — 스텝만 연속 나열
        stack.push({start:pc,end:end,mode:'for',var:fv,cur:from,to:to,step:step,it:0}); pc++; continue;
      }
      _logRec(tcid,{t:_nowStr().slice(11),label:labels[pc],kind:'loop',name:'반복 시작 ('+(c.loopMode==='infinite'?'지속':c.loopMode==='until'?'중단조건':(Math.max(1,parseInt(c.loopCount)||2)+'회'))+')',status:'info'}); stack.push({start:pc,end:end,mode:c.loopMode||'count',cnt:Math.max(1,parseInt(c.loopCount)||2),it:0,brk:c.loopBreak||''}); pc++; continue; }
    if(k==='switch'){ var _sd=_switchDecide(items,c,function(s){return _subVars(s,tcid);},idxByLabel,bodyEnd,pc);
      if(_sd.mode==='end'){ _logRec(tcid,{t:_nowStr().slice(11),label:labels[pc],kind:'switch',name:'Switch ['+_sd.val+'] → else: 🛑 시험 종료',status:'info'}); pc=items.length; continue; }
      if(_sd.mode==='jump'){ _logRec(tcid,{t:_nowStr().slice(11),label:labels[pc],kind:'switch',name:'Switch ['+_sd.val+'] → '+(labels[_sd.target]||'')+' 블록 실행',status:'info'}); pc=_sd.target; _swExit={at:bodyEnd(_sd.target),to:_sd.swEnd}; continue; }
      _logRec(tcid,{t:_nowStr().slice(11),label:labels[pc],kind:'switch',name:'Switch ['+_sd.val+'] → 일치 case 없음(건너뜀)',status:'info'}); pc=_sd.swEnd; continue; }
    if(k==='if'){ var _ie=bodyEnd(pc), _il=ind(pc); var _br=_evalIfBranch(c,tcid); var _pass=(_br.branch!=='false'); ifState[_il]=_pass;
      var _res=_br.result; var _branchRaw=_br.raw;
      // Command 결과: raw는 실행할 CLI. 대입/치환 스킵하고 CLI 실행 결과를 output/log에 표시.
      if(_res==='Command'){
        var _cmdText=_subVars(String(_branchRaw||''), tcid);
        var _cmds=_cmdText.split(/\r?\n/).map(function(x){return x.trim();}).filter(Boolean);
        var _outText='', _cmdOk=false, _cmdErr='';
        if(!_cmds.length){ _outText='(Command 지정 안 됨)'; }
        else {
          var _l=null; try{ _l=_checkLab(tc, c); }catch(_le){}
          if(!_l||!_l.ip){ _outText='[Command 실행 실패] 대상 장비 없음 — 상단 스텝의 대상 장비/세션 확인'; }
          else {
            var _essr={ok:true};
            try{ _essr=await _ensureSess(tcid,_l); }catch(_ese){ _essr={ok:false,error:_ese.message}; }
            if(!_essr||!_essr.ok){ _outText='[Command 실행 실패] 세션 연결 실패: '+((_essr&&_essr.error)||'')+' ('+(_l.name||_l.ip)+')'; }
            else {
              try{
                var _rc=await fetch('/api/run-cli',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host:_l.ip,port:_l.port,protocol:_l.protocol,username:_l.username,password:_l.password,secret:_l.secret,device_type:_l.device_type,commands:_cmds,repeat:1,interval:1,cmd_delay:_tcStepCmdDelay(c),require_session:true})});
                var _dc=await _rc.json();
                // no_session 폴백: 백엔드 자동 재접속 실패한 경우 프론트에서 세션 재열기 후 재시도
                if(_dc && _dc.no_session){
                  try{ if(_procSessOpen[tcid]) _procSessOpen[tcid].delete(_sessKey(_l)); }catch(_e){}
                  var _es3=await _ensureSess(tcid,_l);
                  if(_es3&&_es3.ok){
                    var _rc2=await fetch('/api/run-cli',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host:_l.ip,port:_l.port,protocol:_l.protocol,username:_l.username,password:_l.password,secret:_l.secret,device_type:_l.device_type,commands:_cmds,repeat:1,interval:1,cmd_delay:_tcStepCmdDelay(c),require_session:true})});
                    _dc=await _rc2.json();
                  }
                }
                if(_dc && _dc.ok && Array.isArray(_dc.outputs)){
                  _outText=_dc.outputs.map(function(o){return o.output;}).join('\n'); _cmdOk=true;
                } else {
                  _outText='[Command 실행 실패] '+((_dc&&_dc.error)||''); _cmdErr=(_dc&&_dc.error)||'';
                }
              }catch(_re){ _outText='[Command 요청 오류] '+_re.message; _cmdErr=_re.message; }
            }
          }
        }
        c.repeatResult=_cmdOk?'info':'Fail'; c.output='IF: '+_subVars(c.condition||'',tcid)+'  →  '+_br.label+'\n▶ Command:\n'+_cmdText+'\n\n'+_outText; c.executed_at=_nowStr();
        _logRec(tcid,{t:_nowStr().slice(11),label:labels[pc],kind:'cli',name:'IF ('+_subVars(c.condition||'',tcid)+') → '+_br.label+' · ▶ '+(_cmds[0]||'(빈 Command)'),status:(_cmdOk?'완료':'Fail'),criteria:c.condition||'',output:c.output,dev:((_checkLab(tc,c)||{}).name||(_checkLab(tc,c)||{}).ip||'')});
        pc=_pass?(pc+1):_ie; continue;
      }
      try{ _tcRunAssign(_branchRaw, tcid); }catch(e){} var _msg=_subVars(_branchRaw, tcid); var _vres=(_res==='Pass'||_res==='Fail')?_res:'';   // 문구의 ${var}=값/col 은 실행 시 대입(수식)
      var _condSub=_subVars(c.condition||'', tcid);   // 판정식의 변수 치환값(예: "1 GB == 1 GB && E4320-24P == E4320-24P")
      c.repeatResult=_vres; c.output='IF: '+_condSub+'  →  '+_br.label+(_msg?('\n'+_msg):''); c.executed_at=_nowStr();
      _logRec(tcid,{t:_nowStr().slice(11),label:labels[pc],kind:'cli',name:'IF ('+_condSub+') → '+_br.label+(_msg?(' · '+_msg):''),status:_vres||'info',criteria:c.condition||'',output:c.output});
      // 사이클 라이브: IF 판정을 앞선 CLI 스텝(같은 판정 대상)의 사이클 스텝에 결과로 전파. 판정식은 실제 실행값으로 치환된 것 전달.
      try{ if(_vres && typeof _cbBridgeIfResult==='function' && typeof _cycleLiveCtx!=='undefined' && _cycleLiveCtx){ var _prevCk=null; var _il2=ind(pc); for(var _pj=pc-1;_pj>=0;_pj--){ var _pk=items[_pj].kind||'cli'; if(_pk==='cli'||_pk==='wait'||_pk==='call'||_pk==='manual'||_pk==='message'){ _prevCk=items[_pj].id; break; } if(_pk==='if'||_pk==='switch'||_pk==='else') continue; if(ind(_pj)<_il2) break; } if(_prevCk) _cbBridgeIfResult(_prevCk, _vres, _condSub); } }catch(_bri){}
      pc=_pass?(pc+1):_ie; continue; }
    if(k==='else'){ var _ee=bodyEnd(pc), _el=ind(pc); if(ifState[_el]===false){ _logRec(tcid,{t:_nowStr().slice(11),label:labels[pc],kind:'group',name:'ELSE · 실행 (위 IF 거짓)',status:'info'}); pc++; } else { pc=_ee; } continue; }
    if(k==='call'){ if(c.callProc){ _logRec(tcid,{t:_nowStr().slice(11),label:labels[pc],kind:'group',name:'↪ 프로시저 호출: '+c.callProc,status:'info'}); await _runLocalProc(tcid,c.callProc); pc++; continue; } const sub=tcList.find(t=>t.tcid===c.callTcid); if(sub){ _logRec(tcid,{t:_nowStr().slice(11),label:labels[pc],kind:'group',name:'↪ 호출: '+sub.tcid+(sub.name?(' · '+sub.name):''),status:'info'}); await _runCalled(tcid, sub, c.callParams, 0, new Set([(tc.tcid||tc.id), sub.tcid])); } else { _logRec(tcid,{t:_nowStr().slice(11),label:labels[pc],kind:'group',name:'호출 대상 절차 없음('+(c.callTcid||'미선택')+')',status:'skip'}); } pc++; continue; }
    // Test Step 셀(c.desc)에 변수($i, ${var} 등)가 포함돼 있으면 실행 로그에 회차별로 치환값 표시.
    // for 반복 안에서 '$i회 시험 진행 중' 같은 라벨이 회차마다 '1회 시험 진행 중', '2회...' 로 보임.
    try{
      var _dtxt=String(c.desc||'').trim();
      if(_dtxt && /(\$\{[\w가-힣]+\})|(\$[A-Za-z_]\w*)/.test(_dtxt)){
        var _dsub=_subVars(_dtxt, tcid, c);
        _logRec(tcid,{t:_nowStr().slice(11),label:labels[pc],kind:'group',name:'📝 '+_dsub,status:'info'});
      }
    }catch(_de){}
    _stCellRunning(c.id); await tcCheckRun(tcid,c.id); _stCellDone(tcid,c.id);
    // Completion Wait는 tcCheckRun 안(백엔드 run-cli)에서 wait_only_sec 로 처리됨 → 여기서 별도 sleep 없음.
    pc++;
  }
  try{ await _closeAutoSess(tcid); }catch(e){}   // 자동으로 연 세션 일괄 close (Session Close 스텝 불필요)
  if(_runElapsed[tcid]&&_runElapsed[tcid].start){ _runElapsed[tcid].sec=(Date.now()-_runElapsed[tcid].start)/1000; }
  // History 스냅샷: 이번 실행의 로그 전체를 시간·요약과 함께 서버에 저장 → 모든 사용자가 실시간 공유.
  try{
    if(Array.isArray(_runLog[tcid]) && _runLog[tcid].length){
      var _hp=0,_hf=0; _runLog[tcid].forEach(function(e){ if(e.status==='Pass')_hp++; else if(e.status==='Fail')_hf++; });
      var _entry={
        at:_nowStr(),
        sec:(_runElapsed[tcid]&&_runElapsed[tcid].sec)||0,
        pass:_hp, fail:_hf,
        log:_runLog[tcid].slice(),
        aborted:!!_runAbort[tcid]
      };
      // 즉시 로컬 반영 (렌더링 지연 방지)
      _runHistory=_runHistory||{}; _runHistory[tcid]=_runHistory[tcid]||[];
      _runHistory[tcid].unshift(_entry);
      if(_runHistory[tcid].length>100) _runHistory[tcid]=_runHistory[tcid].slice(0,100);
      // 서버 저장 (WS로 다른 사용자에게도 전파됨)
      try{
        fetch('/api/tc/'+_tcUrl(tcid)+'/run-history?token='+encodeURIComponent(typeof authToken!=='undefined'?authToken:''),{
          method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(_entry)
        }).catch(function(){});
      }catch(_pe){}
    }
  }catch(_hse){}
  _suppressToast=false; // 실행 종료 → 토스트 복구 (완료는 헤더 ①에 표시)
  _bulkRun=false;
  _runActive=null;   // 실행 종료 → 버튼 블링크 해제
  _tcRunStopBar(tcid,false);   // 실행 중단 바 제거
  _runAbort[tcid]=false;   // 중단 플래그 정리
  _runPauseReq[tcid]=false;   // 일시정지 요청 플래그 정리
  // 실행된(=화이트리스트) 스텝만 집계 — 실행 안 한 다른 그룹/잔여 스텝(show system 등) 제외
  var _wlOk=function(c){ return !(_runStepWL&&_runStepWL[tcid]) || _runStepWL[tcid].has(c.id); };
  // 다중장비 반복 중에는 마지막 장비에서만 1회 요약 (장비마다 중복 출력 방지)
  if(!_devOpt || _devOpt.last){
  // 실행 이력은 이제 서버 통합 저장(/api/tc/{id}/run-history)만 사용. tc.result_history 는 더 이상 갱신하지 않음.
  // 조건9: 실패 스텝 사유 요약 (판정기준 기준으로 왜 Fail 인지) → Console
  try{
    const _labs=_stepLabels(items);
    const _fails=[]; items.forEach(function(c,i){ if((c.kind||'cli')==='cli' && c.repeatResult==='Fail' && _wlOk(c)) _fails.push({c:c, lbl:_labs[i]||''}); });
    if(_fails.length){
      _logRec(tcid,{t:_nowStr().slice(11),kind:'group',name:'❌ 실패 '+_fails.length+'건 — 판정 사유',status:'Fail'});
      _fails.forEach(function(f){ const c=f.c; let reason='';
        try{ reason=_failDetail(c, _respShownLines(c), tcid); }catch(e){ reason='(사유 계산 오류)'; }
        _logRec(tcid,{t:_nowStr().slice(11),kind:'cli',name:'스텝 '+f.lbl+' · '+((c.cli||'').split(/\r?\n/)[0]||c.action||'명령'),status:'Fail',criteria:String(c.criteria||'').replace(/\n/g,' / '),output:reason});
      });
    }
  }catch(e){}
  } // ← 다중장비 요약 1회 가드
  try{ await saveTCFile(tc); await saveDeviceData(); }catch(e){} // 결과 1회 저장
  tcProcRefresh(tcid);
  try{ if(typeof _cycleLiveCtx!=='undefined'&&_cycleLiveCtx&&_cycleLiveCtx.tcid===tcid) await cycleSyncFromTC(); }catch(e){} // 사이클 라이브 → 결과 자동 반영
}
function _stepLabels(items){ const cnt=[]; return (items||[]).map(c=>{ if((c.kind||'cli')==='model'){ cnt.length=0; return ''; } if(!_isCountStep(c)) return ''; const L=Math.max(0,parseInt(c.indent)||0); cnt[L]=(cnt[L]||0)+1; cnt.length=L+1; return cnt.map(x=>x||1).join('.'); }); }// Switch: 매칭 case 블록만 실행 결정. 반환 {mode:'jump'|'end'|'skip', target, swEnd, val}. sub=단항 변수치환 함수.
function _switchDecide(items,c,sub,idxByLabel,bodyEnd,pc){
  var sval=String(sub(String(c.switchExpr||''))).trim();
  var cs=Array.isArray(c.cases)?c.cases:[];
  var swEnd=pc+1; cs.forEach(function(x){ var gi=idxByLabel(x.goto); if(gi>=0){ var be=bodyEnd(gi); if(be>swEnd)swEnd=be; } });
  var ge=String(c.gotoElse||'').trim();
  if(ge && ge!=='__END__' && ge!=='종료'){ var egi=idxByLabel(ge); if(egi>=0){ var ebe=bodyEnd(egi); if(ebe>swEnd)swEnd=ebe; } }
  for(var i=0;i<cs.length;i++){ if(String(sub(String(cs[i].when||''))).trim()===sval){ var ti=idxByLabel(cs[i].goto); return (ti>=0)?{mode:'jump',target:ti,swEnd:swEnd,val:sval}:{mode:'skip',swEnd:swEnd,val:sval}; } }
  if(ge==='__END__'||ge==='종료') return {mode:'end',val:sval};
  if(ge){ var ei=idxByLabel(ge); if(ei>=0) return {mode:'jump',target:ei,swEnd:swEnd,val:sval}; }
  return {mode:'skip',swEnd:swEnd,val:sval};
}
function _tcSessIds(tc){ return ((Array.isArray(tc.sessions)&&tc.sessions.length)?tc.sessions:(tc.sessionLabId?[tc.sessionLabId]:[])).slice(); }async function tcSessionAddDev(tcid, labId){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc) return;
  if(!labList.length){ try{ await loadDeviceData(); }catch(e){} }
  const l=labList.find(x=>x.id===labId); if(!l){ showToast('장비를 찾을 수 없습니다'); return; }
  const s=_tcSessIds(tc); s.push(labId); tc.sessions=s; delete tc.sessionLabId;
  await saveTCFile(tc); tcProcRefresh(tcid); showToast('세션 S'+s.length+' = '+((l.group?l.group+'·':'')+(l.model||l.name||'장비'))+' 추가됨');
}
async function tcSessionPick(tcid,idx,labId){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc) return;
  const s=_tcSessIds(tc); s[idx]=labId; tc.sessions=s; delete tc.sessionLabId;
  await saveTCFile(tc); tcProcRefresh(tcid);
}
// ── 세션 바: 접기/펴기 + "세션 추가" 장비 선택 팝업(벤더·제품군·모델그룹·모델명 필터, S1·S2 누적) ──
function tcSessBarToggle(tcid){ _sessBarCol[tcid]=!_sessBarCol[tcid]; tcProcRefresh(tcid); }
function _sessDevVendor(d){ return String((d&&d.vendor)||''); }
function _sessDevLab(d){ return String((d&&d.lab)||''); }
function _sessDevOn(d){ return String((d&&d.status)||'')==='연결됨'; }
function _sessDevStatus(d){ return String((d&&d.status)||'미확인'); }
function _sessDevFamily(d){ if(d&&d.family) return String(d.family); var m=(modelList||[]).find(function(x){return x.name===(d&&d.model);}); return m?String(m.family||''):''; }
function _sessDevGroup(d){ var mn=String((d&&(d.model||d.name))||'').trim(); var mnBase1=mn.replace(/_\d+$/,''); var mnBase2=mn.replace(/\s*\([^)]*\)\s*$/,''); var mnBase3=mnBase2.replace(/_\d+$/,''); var m=(modelList||[]).find(function(x){var xn=String(x.name||'').trim(); return xn===mn||xn===mnBase1||xn===mnBase2||xn===mnBase3;}); return m?String(m.group||''):''; }   // model 미입력 장비는 이름으로 모델 매칭. 접미사(_2, _3...) 및 괄호 접미사 (버전 등) 벗겨서도 시도 → 사용자가 (5.55) 처럼 이름 지어도 그룹 매칭
function _sessDevModel(d){ return String((d&&(d.model||d.name))||''); }
function tcSessAddPopup(tcid){ _sessPop={tcid:tcid,lab:'',vendor:'',family:'',group:'',status:'',q:''}; var ov=document.getElementById('sessPopOv'); if(!ov){ ov=document.createElement('div'); ov.id='sessPopOv'; document.body.appendChild(ov); } ov.style.cssText='position:fixed;inset:0;background:rgba(20,24,33,0.45);z-index:300000;display:flex;align-items:center;justify-content:center;'; ov.onclick=function(e){ if(e.target===ov) tcSessPopClose(); }; _sessPopRender(); }
function tcSessPopClose(){ var ov=document.getElementById('sessPopOv'); if(ov) ov.remove(); }
function _sessPopSet(k,v){ _sessPop[k]=v; if(k==='lab'){ _sessPop.vendor=''; _sessPop.family=''; _sessPop.group=''; } else if(k==='vendor'){ _sessPop.family=''; _sessPop.group=''; } else if(k==='family'){ _sessPop.group=''; } _sessPopRender(); }
async function tcSessPopAdd(devId){ if(!_sessPop.tcid) return; await tcSessionAddDev(_sessPop.tcid, devId); _sessPopRender(); }
function _sessPopList(){ var devs=(labList||[]).filter(function(d){return d&&(d.model||d.name);}); var byL=devs.filter(function(d){return !_sessPop.lab||_sessDevLab(d)===_sessPop.lab;}); var byV=byL.filter(function(d){return !_sessPop.vendor||_sessDevVendor(d)===_sessPop.vendor;}); var byF=byV.filter(function(d){return !_sessPop.family||_sessDevFamily(d)===_sessPop.family;}); var q=String(_sessPop.q||'').toLowerCase(); var rows=byF.filter(function(d){return (!_sessPop.group||_sessDevGroup(d)===_sessPop.group)&&(!_sessPop.status||_sessDevStatus(d)===_sessPop.status)&&(!q||(_sessDevModel(d)+' '+((d&&d.name)||'')+' '+((d&&d.ip)||'')).toLowerCase().indexOf(q)>=0);}); return {devs:devs,byL:byL,byV:byV,byF:byF,rows:rows}; }
function _sessPopRowsHtml(rows){ var esc=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');}; return rows.map(function(d){ var noip=!(d&&d.ip); var on=_sessDevOn(d); var stb='<span style="font-size:10.5px;font-weight:700;padding:2px 9px;border-radius:9px;white-space:nowrap;'+(on?'color:#00875a;background:rgba(0,168,114,0.13);':'color:#8a909c;background:#eef0f4;')+'">'+(on?'● 연결됨':'○ '+esc((d&&d.status)||'미확인'))+'</span>'; return '<tr style="border-bottom:1px solid #eef0f4;'+(noip?'opacity:0.55;':'')+'"><td style="padding:6px 11px;font-size:12.5px;">'+esc(_sessDevVendor(d))+'</td><td style="padding:6px 11px;font-size:12.5px;">'+esc(_sessDevFamily(d))+'</td><td style="padding:6px 11px;font-size:12.5px;">'+esc(_sessDevGroup(d))+'</td><td style="padding:6px 11px;font-size:12.5px;font-weight:700;color:#1c2230;">'+esc(_sessDevModel(d))+'</td><td style="padding:6px 11px;font-size:12.5px;font-family:ui-monospace,monospace;"><b style="color:#1c2230;">'+esc((d&&d.name)||'')+'</b>'+((d&&d.ip)?'<span style="color:#6b7280;"> · '+esc(d.ip)+'</span>':'<span style="color:#c48a00;"> · (IP 없음)</span>')+'</td><td style="padding:6px 11px;text-align:center;">'+stb+'</td><td style="padding:5px 11px;text-align:right;"><button onclick="tcSessPopAdd(\''+(d&&d.id)+'\')" style="font-size:11.5px;font-weight:700;padding:5px 13px;border-radius:6px;border:1px solid var(--green);background:var(--green);color:#fff;cursor:pointer;white-space:nowrap;">＋ 추가</button></td></tr>'; }).join('')||'<tr><td colspan="7" style="padding:20px;text-align:center;color:#9aa1ad;font-size:12.5px;">조건에 맞는 장비가 없습니다</td></tr>'; }
function _sessPopBodyUpdate(){ var b=document.getElementById('sessPopBody'); if(!b) return; var L=_sessPopList(); b.innerHTML=_sessPopRowsHtml(L.rows); var c=document.getElementById('sessPopCnt'); if(c) c.textContent=L.rows.length+'개'; }
function _sessPopRender(){ var ov=document.getElementById('sessPopOv'); if(!ov) return; var esc=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');}; var tc=tcList.find(function(t){return (t.tcid===_sessPop.tcid)||(t.id===_sessPop.tcid);}); var L=_sessPopList();
  var optsOf=function(arr,fn){ var o=[]; arr.forEach(function(d){var v=fn(d); if(v&&o.indexOf(v)<0)o.push(v);}); o.sort(); return o; };
  var labs=optsOf(L.devs,_sessDevLab), vendors=optsOf(L.byL,_sessDevVendor), fams=optsOf(L.byV,_sessDevFamily), grps=optsOf(L.byF,_sessDevGroup), statuses=optsOf(L.devs,_sessDevStatus);
  var sel=function(label,key,opts,cur){ return '<div style="display:flex;flex-direction:column;gap:3px;"><span style="font-size:10.5px;color:#8a909c;font-weight:700;">'+label+'</span><select onchange="_sessPopSet(\''+key+'\',this.value)" style="font-size:12px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;min-width:120px;"><option value="">전체</option>'+opts.map(function(o){return '<option value="'+esc(o)+'"'+(cur===o?' selected':'')+'>'+esc(o)+'</option>';}).join('')+'</select></div>'; };
  var th=function(t){return '<th style="position:sticky;top:0;background:#eef1f5;padding:6px 9px;text-align:left;font-size:11.5px;font-weight:700;color:#3a4254;border-bottom:1px solid #c4cad3;white-space:nowrap;">'+t+'</th>';};
  var nSess=((tc&&Array.isArray(tc.sessions))?tc.sessions.length:0);
  ov.innerHTML='<div onclick="event.stopPropagation()" style="background:#fff;border-radius:12px;width:min(1120px,96vw);max-height:88vh;display:flex;flex-direction:column;box-shadow:0 18px 60px rgba(0,0,0,0.3);overflow:hidden;">'
    +'<div style="display:flex;align-items:center;gap:9px;padding:13px 17px;border-bottom:1px solid var(--border);"><i class="ti ti-plug-connected" style="color:var(--green);font-size:18px;"></i><b style="font-size:14px;">세션 추가 — 접속 장비 선택</b><span style="font-size:11px;font-weight:700;color:var(--green);background:rgba(0,168,114,0.1);border-radius:8px;padding:2px 9px;">현재 '+nSess+'세션</span><span style="flex:1;"></span><i onclick="tcSessPopClose()" class="ti ti-x" style="cursor:pointer;font-size:20px;color:#9aa1ad;"></i></div>'
    +'<div style="display:flex;gap:11px;align-items:flex-end;flex-wrap:wrap;padding:12px 17px;border-bottom:1px solid var(--border);background:#fafbfc;">'+sel('Lab','lab',labs,_sessPop.lab)+sel('벤더','vendor',vendors,_sessPop.vendor)+sel('제품군','family',fams,_sessPop.family)+sel('모델그룹','group',grps,_sessPop.group)+'<div style="display:flex;flex-direction:column;gap:3px;flex:1;min-width:140px;"><span style="font-size:10.5px;color:#8a909c;font-weight:700;">검색 (모델·이름·IP)</span><input value="'+esc(_sessPop.q)+'" oninput="_sessPop.q=this.value;_sessPopBodyUpdate();" placeholder="예: E5010" style="font-size:12px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;"></div>'+sel('상태','status',statuses,_sessPop.status)+'<span id="sessPopCnt" style="font-size:11px;color:#8a909c;align-self:center;font-weight:700;">'+L.rows.length+'개</span></div>'
    +'<div style="overflow:auto;flex:1;"><table style="border-collapse:collapse;width:100%;"><thead><tr>'+th('벤더')+th('제품군')+th('모델그룹')+th('모델명')+th('장비 · IP')+th('상태')+th('')+'</tr></thead><tbody id="sessPopBody">'+_sessPopRowsHtml(L.rows)+'</tbody></table></div>'
    +'<div style="padding:9px 17px;border-top:1px solid var(--border);display:flex;align-items:center;gap:8px;"><span style="font-size:11px;color:#8a909c;"><i class="ti ti-info-circle"></i> ＋추가 = S1·S2…로 계속 쌓임(같은 장비 중복 가능). 닫지 말고 여러 개 추가하세요.</span><span style="flex:1;"></span><button onclick="tcSessPopClose()" style="font-size:12px;font-weight:700;padding:7px 16px;border-radius:7px;border:1px solid var(--border);background:#fff;color:#5a6376;cursor:pointer;">닫기</button></div>'
  +'</div>'; }
async function tcSessionRemove(tcid,idx){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc) return;
  const s=_tcSessIds(tc); s.splice(idx,1); tc.sessions=s; delete tc.sessionLabId;
  await saveTCFile(tc); tcProcRefresh(tcid);
}
async function tcSessionTestOne(tcid,labId){
  const l=labList.find(x=>x.id===labId); if(!l){ showToast('장비를 찾을 수 없습니다'); return; }
  if(!l.ip){ showToast('IP가 없습니다 — Device Registration에서 입력하세요'); return; }
  l.status='확인중'; tcProcRefresh(tcid);
  try{
    const r=await fetch('/api/lab-test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host:l.ip,port:l.port,protocol:l.protocol,username:l.username,password:l.password,secret:l.secret,device_type:l.device_type})});
    const d=await r.json(); l.status=d.ok?'연결됨':'실패';
    showToast(d.ok?('✅ '+(l.name||'장비')+' 연결 성공'+(d.prompt?' · '+d.prompt:'')):('❌ '+(l.name||'장비')+' 연결 실패: '+(d.error||'')));
  }catch(e){ l.status='실패'; showToast('요청 오류: '+e.message); }
  await saveDeviceData(); tcProcRefresh(tcid);
}

function tcTabIssue(tc){
  const tcid=tc.tcid||tc.id||'';
  const issues=tc.issue_list||[];
  const _opn=issues.filter(function(x){ return !/clos|reject|resolv|done|fixed|완료|해결/i.test(String(x.status||'')); }).length;   // 미해결(close·reject=해결)
  const _ish='font-size:12.5px;padding:5px 7px;border:1px solid var(--border);border-radius:5px;outline:none;box-sizing:border-box;background:#fff;color:var(--text);width:100%;';
  const _typeOpts=['Bug','Task','Story','Improvement','Epic','Sub-task'];
  const _statOpts=['Open','In Progress','In Review','Resolved','Done','Closed','Reopened'];
  const _esc=s=>String(s==null?'':s).replace(/"/g,'&quot;');
  const rows=issues.map((iss,i)=>'<tr>'
    +'<td style="padding:5px 8px;"><input value="'+_esc(iss.product)+'" placeholder="제품" onchange="tcIssueSet(\''+tcid+'\','+i+',\'product\',this.value)" style="'+_ish+'"></td>'
    +'<td style="padding:5px 8px;"><input value="'+_esc(iss.key)+'" placeholder="KEY-123" onchange="tcIssueSet(\''+tcid+'\','+i+',\'key\',this.value)" style="'+_ish+'font-family:monospace;color:var(--blue);font-weight:700;"></td>'
    +'<td style="padding:5px 8px;"><select onchange="tcIssueSet(\''+tcid+'\','+i+',\'issue_type\',this.value)" style="'+_ish+'cursor:pointer;">'+_typeOpts.map(o=>'<option'+((iss.issue_type||'Bug')===o?' selected':'')+'>'+o+'</option>').join('')+'</select></td>'
    +'<td style="padding:5px 8px;"><select onchange="tcIssueSet(\''+tcid+'\','+i+',\'status\',this.value)" style="'+_ish+'cursor:pointer;">'+_statOpts.map(o=>'<option'+((iss.status||'Open')===o?' selected':'')+'>'+o+'</option>').join('')+'</select></td>'
    +'<td style="padding:5px 8px;"><input value="'+_esc(iss.summary)+'" placeholder="요약" onchange="tcIssueSet(\''+tcid+'\','+i+',\'summary\',this.value)" style="'+_ish+'"></td>'
    +'<td style="padding:5px 8px;"><input value="'+_esc(iss.assignee)+'" placeholder="담당자" onchange="tcIssueSet(\''+tcid+'\','+i+',\'assignee\',this.value)" style="'+_ish+'"></td>'
    +'<td style="padding:5px 8px;"><input value="'+_esc(iss.reporter)+'" placeholder="보고자" onchange="tcIssueSet(\''+tcid+'\','+i+',\'reporter\',this.value)" style="'+_ish+'"></td>'
    +'<td style="padding:5px 8px;"><input type="date" value="'+_esc(iss.created)+'" onchange="tcIssueSet(\''+tcid+'\','+i+',\'created\',this.value)" style="'+_ish+'"></td>'
    +'<td style="padding:5px 8px;text-align:center;"><button onclick="tcDeleteIssue(\''+tcid+'\','+i+')" style="background:none;border:none;cursor:pointer;color:var(--text3);" onmouseenter="this.style.color=\'var(--red)\'" onmouseleave="this.style.color=\'var(--text3)\'"><i class="ti ti-x"></i></button></td>'
    +'</tr>').join('');
  return '<div><div style="display:flex;align-items:center;margin-bottom:10px;"><span style="font-size:13px;font-weight:700;">Issue Tracker</span>'+(issues.length?'<span title="close·reject 는 해결" style="margin-left:8px;font-size:10.5px;font-weight:700;color:#fff;background:'+(_opn?'#c0392b':'#00875a')+';border-radius:8px;padding:1px 8px;">미해결 '+_opn+' / 전체 '+issues.length+'</span>':'')+'<button onclick="tcAddIssue(\''+tcid+'\')" style="margin-left:auto;font-size:11px;padding:4px 12px;border-radius:5px;border:1.5px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;"><i class="ti ti-plus"></i> 추가</button></div><div style="border:1px solid var(--border);border-radius:6px;overflow:hidden;overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:#f8f9fb;"><th style="padding:7px 10px;text-align:left;font-size:10px;font-weight:600;color:#bbb;white-space:nowrap;">Product</th><th style="padding:7px 10px;text-align:left;font-size:10px;font-weight:600;color:#bbb;">Key</th><th style="padding:7px 10px;text-align:left;font-size:10px;font-weight:600;color:#bbb;">Type</th><th style="padding:7px 10px;text-align:left;font-size:10px;font-weight:600;color:#bbb;">Status</th><th style="padding:7px 10px;text-align:left;font-size:10px;font-weight:600;color:#bbb;">Summary</th><th style="padding:7px 10px;text-align:left;font-size:10px;font-weight:600;color:#bbb;">담당자</th><th style="padding:7px 10px;text-align:left;font-size:10px;font-weight:600;color:#bbb;">보고자</th><th style="padding:7px 10px;text-align:left;font-size:10px;font-weight:600;color:#bbb;">등록일</th><th style="width:28px;"></th></tr></thead><tbody>'+(rows||'<tr><td colspan="9" style="padding:16px;text-align:center;color:var(--text3);font-size:12px;">Issue 없음</td></tr>')+'</tbody></table></div></div>';
}

function tcTabHistory(tc){
  // Console 옆 History와 동일한 UI(=_execHistory) 재사용:
  // 각 실행 결과 요약을 클릭하면 인라인으로 실행 로그(시각/단계/내용/결과) 테이블이 펼쳐진다.
  var tcid=(tc&&(tc.tcid||tc.id))||'';
  if(!tcid) return '<div style="padding:22px;text-align:center;color:var(--text3);font-size:12px;">TC ID 없음</div>';
  try{ return '<div>'+_execHistory(tcid)+'</div>'; }
  catch(_e){ return '<div style="padding:22px;text-align:center;color:var(--text3);font-size:12px;">이력 로드 실패</div>'; }
}

// saveTCFieldById - tcid 기반으로 수정
async function saveTCFieldById(tcid, field, value){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid));
  if(!tc) return;
  tc[field]=value;
  tc.updated_at=new Date().toISOString().slice(0,10);
  await saveTCFile(tc);
}// 모델 오버라이드 (스텝별 인라인)
// 스텝을 특정 모델 기준으로 resolve (오버라이드 필드별 상속)
function tcAddIssue(tcid){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid));
  if(!tc) return;
  if(typeof jiraIssueOpen!=='function'){ if(typeof showToast==='function')showToast('Jira 모듈 로드 오류 — 새로고침'); return; }
  // 구성도 PNG
  var img='';
  try{ var cv=document.getElementById('topo-canvas-tc-'+tcid); if(cv&&cv.toDataURL) img=cv.toDataURL('image/png'); }catch(e){}
  if(!img) img=tc.topo_image||'';
  // TC 스텝 배열 → tcSteps (CLI checks + manual steps 통합)
  var tcSteps=[];
  try{
    // CLI checks (자동 실행 결과 포함)
    (tc.checks||[]).forEach(function(s){
      if(!s) return;
      tcSteps.push({
        cmd: s.cmd||s.cli||'',
        action: s.cmd||s.cli||'',
        expected: s.expected||s.criteria||'',
        repeatOutput: s.repeatOutput||'',
        repeatResult: s.repeatResult||''
      });
    });
    // manual steps
    (tc.steps||[]).forEach(function(s){
      if(!s) return;
      tcSteps.push({
        cmd: '',
        action: s.action||s.intent||'',
        expected: s.expected||s.criteria||'',
        repeatOutput: s.actual||s.repeatOutput||'',
        repeatResult: s.verdict||s.repeatResult||''
      });
    });
  }catch(e){}
  // 현상: TC overview/purpose/precondition
  var phenomenon=[tc.overview,tc.purpose,tc.precondition].filter(Boolean).join('\n');
  jiraIssueOpen({
    summary:((tc.title||tc.name||tc.tcid||'TC')+' — 결함').slice(0,200),
    phenomenon: phenomenon,
    image: img,
    tcSteps: tcSteps,
    labels:['utop','tc'],
    onCreated:function(key,url){
      if(!tc.issue_list) tc.issue_list=[];
      tc.issue_list.push({key:key,product:'',issue_type:'Bug',status:'Open',summary:'',assignee:'',reporter:'',created:new Date().toISOString().slice(0,10),url:url});
      saveTCFile(tc);
      var d=document.getElementById('tc3-detail-'+tcid);
      if(d) d.innerHTML=tcBuildDetail(tc);
    }
  });
}
async function tcDeleteIssue(tcid, idx){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid));
  if(!tc||!tc.issue_list) return;
  tc.issue_list.splice(idx,1);
  await saveTCFile(tc);
  const d=document.getElementById('tc3-detail-'+tcid);
  if(d) d.innerHTML=tcBuildDetail(tc);
}
async function tcIssueSet(tcid, idx, field, value){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid));
  if(!tc||!tc.issue_list||!tc.issue_list[idx]) return;
  tc.issue_list[idx][field]=value;
  await saveTCFile(tc);
}
// tcShowTCDetail, tcRenderDetail, tcSelectTC 더미 (호환)
function tcShowTCDetail(tc){}
function tcRenderDetail(reqId){}
function tcSelectTC(tcId,reqId){}


// ── 페이지 전환 ──
// ══ Test Management 통합 페이지 ══

// ── 커스텀 필드 필터 동적 생성 ──
function tmRenderCFFilters(){
  const reqWrap=document.getElementById('tm-req-filters');
  if(reqWrap){
    reqWrap.querySelectorAll('.cf-filter').forEach(el=>el.remove());
    (customFields.req||[]).filter(f=>f.active!==false&&f.show_filter===true&&(f.type==='Select'||f.type==='MultiSelect')).forEach(f=>{
      const sel=document.createElement('select');
      sel.id='tm-req-cf-'+f.id;sel.className='cf-filter';
      sel.style.cssText='flex:1;min-width:80px;font-size:11px;padding:3px 4px;border:1px solid var(--border);border-radius:5px;background:#fff;outline:none;';
      sel.onchange=()=>tmRenderREQ();
      sel.innerHTML='<option value="">'+f.label+' 전체</option>'+(f.options||[]).map(o=>{const ov=cfOptValue(o);const oc=cfOptColor(o);return '<option value="'+ov+'" style="color:'+oc+'">'+ov+'</option>';}).join('');
      reqWrap.appendChild(sel);
    });
  }
  const tcWrap=document.getElementById('tm-tc-filters');
  if(tcWrap){
    tcWrap.querySelectorAll('.cf-filter').forEach(el=>el.remove());
    (customFields.tc||[]).filter(f=>f.active!==false&&f.show_filter===true&&(f.type==='Select'||f.type==='MultiSelect')).forEach(f=>{
      const sel=document.createElement('select');
      sel.id='tm-tc-cf-'+f.id;sel.className='cf-filter';
      sel.style.cssText='flex:1;min-width:80px;font-size:11px;padding:3px 4px;border:1px solid var(--border);border-radius:5px;background:#fff;outline:none;';
      sel.onchange=()=>tmRenderTC();
      sel.innerHTML='<option value="">'+f.label+' 전체</option>'+(f.options||[]).map(o=>{const ov=cfOptValue(o);const oc=cfOptColor(o);return '<option value="'+ov+'" style="color:'+oc+'">'+ov+'</option>';}).join('');
      tcWrap.appendChild(sel);
    });
  }
}
function cfGetOptColor(f, val){
  if(!f.options||!val) return null;
  const opt=f.options.find(o=>cfOptValue(o)===val);
  return opt?cfOptColor(opt):null;
}

function getCFBadges(target, dataObj){
  const fields=(customFields[target]||[]).filter(f=>f.active!==false);
  if(!fields.length) return '';
  const cfData=dataObj.custom_fields||{};
  return fields.map(f=>{
    const val=cfData[f.id];if(!val) return '';
    if(f.type==='Checkbox'&&val!=='true') return '';
    const display=f.type==='Checkbox'?'✓ '+f.label:(val.length>12?val.slice(0,12)+'…':val);
    const optColor=cfGetOptColor(f,val);
    const color=optColor||{'Text':'#666','Number':'var(--blue)','Select':'var(--green)','MultiSelect':'#9d7bff','Date':'#e8820c','Checkbox':'var(--green)','URL':'var(--blue)','Textarea':'#666'}[f.type]||'#666';
    return '<span style="font-size:10px;padding:1px 6px;border-radius:4px;border:1px solid '+color+';color:'+color+';background:rgba(0,0,0,0.03);white-space:nowrap;" title="'+f.label+': '+val+'">'+f.label+': '+display+'</span>';
  }).join('');
}
function getREQCFFilters(){
  const r={};
  (customFields.req||[]).filter(f=>f.active!==false&&(f.type==='Select'||f.type==='MultiSelect')).forEach(f=>{
    const el=document.getElementById('tm-req-cf-'+f.id);if(el&&el.value) r[f.id]=el.value;
  });return r;
}
function getTCCFFilters(){
  const r={};
  (customFields.tc||[]).filter(f=>f.active!==false&&(f.type==='Select'||f.type==='MultiSelect')).forEach(f=>{
    const el=document.getElementById('tm-tc-cf-'+f.id);if(el&&el.value) r[f.id]=el.value;
  });return r;
}

// ══ 시스템: 커스텀 필드 ══
let customFields={req:[],tc:[],cycle:[]};
const CF_TYPES=['Text','Number','Select','MultiSelect','Date','Checkbox','URL','Textarea'];
const CF_TYPE_ICONS={'Text':'ti-forms','Number':'ti-123','Select':'ti-list','MultiSelect':'ti-checks','Date':'ti-calendar','Checkbox':'ti-checkbox','URL':'ti-link','Textarea':'ti-align-left'};

var _customFieldsInflight=null;
var _customFieldsLoaded=false;   // 서버에서 실제로 로드했는지 (초기 {req:[],tc:[],cycle:[]} 값과 구분)
async function loadCustomFields(force){
  if(!force && _customFieldsLoaded) return;
  if(_customFieldsInflight) return _customFieldsInflight;
  _customFieldsInflight=(async function(){
    try{
      const r=await fetch('/api/custom-fields');
      if(r.ok){ customFields=await r.json(); _customFieldsLoaded=true; }
    }catch(e){}
  })().finally(function(){ _customFieldsInflight=null; });
  return _customFieldsInflight;
}
async function saveCustomFields(){
  try{
    const r=await fetch('/api/custom-fields',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(customFields)});
    if(!r.ok) showToast('저장 실패: '+r.status);
  }catch(e){ showToast('저장 오류: '+e.message); }
}

// ══ Device Registration (장비 등록) ══
let deviceList=[];
let vendorList=[];
let modelList=[];
let cardList=[];
let labList=[];
let _cardDraftGroups=[];
let _cardEditId=null;
let _topo2Mode='box';
let _topo2Drag=null;
let _venEditIdx=-1;
let _modEditIdx=-1;
let _venSelIdx=-1;   // 머지된 Model/Vendor 페이지에서 선택된 벤더 인덱스(-1=없음, -2=(미지정) 그룹)
let familyList=[];   // 제품군(벤더 하위): {id,name,vendor=벤더명}
let _famSel='';      // 선택된 제품군명 ('' = 없음, '__UN__' = (미지정) 그룹)
let _famEditId='';   // 제품군 인라인 수정 대상 id
let groupList=[];    // 모델그룹(제품군 하위): {id,name,vendor,family} — TC 1개로 그룹 내 여러 모델 실행용
let _grpSel='';      // 선택된 모델그룹명 ('' = 없음, '__UNG__' = (미지정) 그룹)
let _grpEditId='';   // 모델그룹 인라인 수정 대상 id
let _modSel='';      // 머지 페이지에서 선택된 모델 id (오른쪽 하드웨어 상세)
let _modMode='view'; // 모델 상세 패널 모드: 'view'(추가된 인터페이스만) | 'edit'(추가 폼)
let _modRegInit=false; // 머지 페이지 기본 선택(UBIQUOSS·L2·E5924RL) 1회 적용 플래그
let _devEditId=null;
let _devDraftSub=[];
let _devDraftUp=[];
const DEVICE_ROLES=['L2 스위치','L3 스위치','OLT','ONT','CPE','HGW','계측기','PC/서버','Cloud','기타'];
const DEVICE_IF_TYPES=['Ethernet','PON','Copper'];
const DEVICE_IF_SPEEDS=['100M','500M','1G','2.5G','5G','10G','25G','50G','100G','400G'];
const DEVICE_ROLE_COLORS={'L2 스위치':'#2d6fd4','L3 스위치':'#7c3aed','OLT':'#00a872','ONT':'#0ea5e9','CPE':'#d6336c','HGW':'#f08c00','계측기':'#e8820c','PC/서버':'#5a6080','Cloud':'#06b6d4','기타':'#888'};
let _devSelId=null;
let _devSelGroup=null;
function _devDraft(g){ return g==='up'?_devDraftUp:_devDraftSub; }
var _deviceDataInflight=null, _deviceDataLoadedAt=0;
async function loadDeviceData(force){
  if(!force && _deviceDataLoadedAt && (Date.now()-_deviceDataLoadedAt)<4000) return;
  if(!force && _deviceDataInflight) return _deviceDataInflight;
  _deviceDataInflight=(async function(){
  try{ const r=await fetch('/api/device-catalog'); if(r.ok){ const d=await r.json(); deviceList=Array.isArray(d)?d:(d.devices||[]); vendorList=(d&&d.vendors)||[]; modelList=(d&&d.models)||[]; cardList=(d&&d.cards)||[]; familyList=(d&&d.families)||[]; groupList=(d&&d.groups)||[];
    // 기존 Lab 접속정보 → deviceList 통합 (이름 매칭, 없으면 신규 추가, 데이터 보존)
    const oldLabs=(d&&d.labs)||[]; let migrated=false;
    oldLabs.forEach(l=>{ if(!l||!(l.name||l.ip)) return; let dev=deviceList.find(x=>x.name===l.name);
      if(!dev){ dev={id:l.id||('dev-'+Date.now()+'-'+Math.floor(Math.random()*100000)), name:l.name||'', role:l.role||'L2 스위치', vendor:l.vendor||'', subscriber_ifs:[], uplink_ifs:[]}; deviceList.push(dev); migrated=true; }
      if(l.ip&&!dev.ip){ dev.ip=l.ip; dev.protocol=l.protocol||'telnet'; dev.username=l.username||''; dev.password=l.password||''; dev.secret=l.secret||''; dev.device_type=l.device_type||(l.protocol==='ssh'?'cisco_ios':'cisco_ios_telnet'); dev.status=l.status||'미확인'; migrated=true; } });
    labList=deviceList; // 통합: 세션·실행이 deviceList를 그대로 사용
    if(typeof updateStatusBar==='function') updateStatusBar();   // 헤더 '장비 N/M 연결' = 등록 장비 기준
    if(migrated) await saveDeviceData();
  } }catch(e){}
    _deviceDataLoadedAt=Date.now();
  })().finally(function(){ _deviceDataInflight=null; });
  return _deviceDataInflight;
}
async function saveDeviceData(){
  // 안전장치 1: loadDeviceData 아직 완료 안 됐거나 deviceList 가 비정상적으로 비어있으면 저장 거부
  if(!_deviceDataLoadedAt){ console.warn('[saveDeviceData] loadDeviceData 미완료 — 저장 skip (유실 방지)'); return; }
  if(!Array.isArray(deviceList) || deviceList.length===0){
    // 서버에 이전 데이터가 있으면 빈 상태로 저장하면 안 됨. 사용자가 명시적으로 모두 삭제한 경우가 아니면 skip.
    console.warn('[saveDeviceData] deviceList 비어있음 — 저장 skip (유실 방지). 수동 삭제 후 저장이 필요하면 페이지 새로고침 후 다시 시도.');
    return;
  }
  try{
    const r=await fetch('/api/device-catalog',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({devices:deviceList, vendors:vendorList, models:modelList, cards:cardList, families:familyList, groups:groupList, labs:[]})});
    if(!r.ok){ showToast('저장 실패: '+r.status); return; }
    // 서버 안전장치가 급감 감지로 거부한 경우
    try{
      const dd=await r.json();
      if(dd && dd.ok===false){
        showToast('⚠ '+(dd.error||'저장이 거부되었습니다'));
        console.error('[saveDeviceData] 서버 거부:', dd);
        // 서버 최신 상태 다시 로드 → 로컬 상태 복구
        try{ if(typeof loadDeviceData==='function'){ _deviceDataLoadedAt=0; await loadDeviceData(true); if(typeof renderDeviceRegBeta==='function') renderDeviceRegBeta(); } }catch(_e){}
      }
    }catch(_je){}
  }catch(e){ showToast('저장 오류: '+e.message); }
}
// ── Device Registration (실장비 접속정보, Device Registration과 별개) ──
function renderLabReg(){
  const el=document.getElementById('lab-body'); if(!el) return;
  const protos=['telnet','ssh','snmp','rest','tcl'];
  const _needCred=function(p){ return p==='telnet'||p==='ssh'; };
  const rows=labList.map(l=>{
    const st=l.status||'미확인';
    const stColor=st==='연결됨'?'#00a872':st==='실패'?'#e53e5a':st==='확인중'?'#f5b731':'#999';
    const proto=l.protocol||'telnet';
    const needC=_needCred(proto);
    const protoColor=proto==='telnet'?'#e8820c':proto==='ssh'?'#2d6fd4':proto==='snmp'?'#00a872':'#7c3aed';
    const protoSel='<select onchange="labSave(\''+l.id+'\',\'protocol\',this.value);renderLabReg();" style="font-size:12px;padding:5px 6px;border:1px solid var(--border);border-radius:5px;font-weight:700;color:'+protoColor+';">'+protos.map(p=>'<option'+((proto===p?' selected':'')+' value="'+p+'" style="color:#333;font-weight:400;">'+p.toUpperCase()+'</option>')).join('')+'</select>';
    return '<tr style="border-top:1px solid var(--border);">'+
      '<td style="padding:6px 10px;"><input value="'+(l.name||'').replace(/"/g,'&quot;')+'" onblur="labSave(\''+l.id+'\',\'name\',this.value)" placeholder="QA_MAIN_L3" style="width:100%;min-width:120px;font-size:12px;padding:5px 7px;border:1px solid var(--border);border-radius:5px;outline:none;box-sizing:border-box;"></td>'+
      '<td style="padding:6px 10px;"><input value="'+(l.ip||'').replace(/"/g,'&quot;')+'" onblur="labSave(\''+l.id+'\',\'ip\',this.value)" placeholder="220.1.1.236" style="width:130px;font-size:12px;font-family:monospace;padding:5px 7px;border:1px solid var(--border);border-radius:5px;outline:none;box-sizing:border-box;"></td>'+
      '<td style="padding:6px 10px;">'+protoSel+'</td>'+
      '<td style="padding:6px 10px;">'+(needC?'<input value="'+(l.username||'').replace(/"/g,'&quot;')+'" onblur="labSave(\''+l.id+'\',\'username\',this.value)" placeholder="root" style="width:84px;font-size:12px;padding:5px 7px;border:1px solid var(--border);border-radius:5px;outline:none;">':'<span style="font-size:11px;color:var(--text3);">—</span>')+'</td>'+
      '<td style="padding:6px 10px;">'+(needC?'<input type="password" value="'+(l.password||'').replace(/"/g,'&quot;')+'" onblur="labSave(\''+l.id+'\',\'password\',this.value)" placeholder="****" style="width:84px;font-size:12px;padding:5px 7px;border:1px solid var(--border);border-radius:5px;outline:none;">':'<span style="font-size:11px;color:var(--text3);">—</span>')+'</td>'+
      '<td style="padding:6px 10px;">'+(needC?'<input type="password" value="'+(l.secret||'').replace(/"/g,'&quot;')+'" onblur="labSave(\''+l.id+'\',\'secret\',this.value)" placeholder="(선택)" style="width:84px;font-size:12px;padding:5px 7px;border:1px solid var(--border);border-radius:5px;outline:none;">':'<span style="font-size:11px;color:var(--text3);">—</span>')+'</td>'+
      '<td style="padding:6px 10px;white-space:nowrap;"><span style="font-size:11px;font-weight:700;color:'+stColor+';"><i class="ti ti-circle-filled" style="font-size:8px;vertical-align:middle;"></i> '+st+'</span>'+(needC?' <button onclick="labTest(\''+l.id+'\')" style="font-size:10px;padding:3px 9px;border-radius:5px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;margin-left:4px;">테스트</button>':'')+'</td>'+
      '<td style="padding:6px 8px;text-align:center;"><i class="ti ti-trash" onclick="labDelete(\''+l.id+'\')" style="color:#ccc;cursor:pointer;" onmouseenter="this.style.color=\'var(--red)\'" onmouseleave="this.style.color=\'#ccc\'"></i></td>'+
    '</tr>';
  }).join('');
  el.innerHTML='<div style="max-width:none;">'+
    '<div style="display:flex;align-items:center;margin-bottom:16px;"><i class="ti ti-server-cog" style="font-size:24px;color:var(--blue);margin-right:10px;"></i><div style="flex:1;"><div style="font-size:18px;font-weight:700;">Device Registration</div><div style="font-size:12px;color:var(--text3);">실장비 접속 정보 등록 (IP·계정·Enable) — TC 절차 세션에서 이 장비로 접속합니다</div></div><button onclick="labAdd()" style="font-size:13px;padding:7px 16px;border-radius:7px;border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:600;"><i class="ti ti-plus"></i> 장비 추가</button></div>'+
    '<div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;"><table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:#f8f9fb;"><th style="padding:9px 10px;text-align:left;font-size:11px;color:var(--text3);">장비명</th><th style="padding:9px 10px;text-align:left;font-size:11px;color:var(--text3);">IP</th><th style="padding:9px 10px;text-align:left;font-size:11px;color:var(--text3);">프로토콜</th><th style="padding:9px 10px;text-align:left;font-size:11px;color:var(--text3);">ID</th><th style="padding:9px 10px;text-align:left;font-size:11px;color:var(--text3);">PW</th><th style="padding:9px 10px;text-align:left;font-size:11px;color:var(--text3);">Enable PW</th><th style="padding:9px 10px;text-align:left;font-size:11px;color:var(--text3);">상태</th><th style="width:30px;"></th></tr></thead><tbody>'+(rows||'<tr><td colspan="8" style="padding:24px;text-align:center;color:var(--text3);">등록된 장비가 없습니다. <b>[장비 추가]</b>로 시작하세요.</td></tr>')+'</tbody></table></div>'+
    '</div>';
}
// 장비 추가 — 팝업에서 접속정보 설정 후 추가
function labAdd(){
  const old=document.getElementById('lab-dev-add-modal'); if(old)old.remove();
  const protos=['telnet','ssh','snmp','rest','tcl'];
  const _lb=function(t){ return '<label style="font-size:11.5px;font-weight:700;color:var(--text3);display:block;margin-bottom:5px;">'+t+'</label>'; };
  const _in='style="width:100%;font-size:13px;padding:9px 11px;border:1.5px solid var(--border);border-radius:8px;outline:none;box-sizing:border-box;"';
  const m=document.createElement('div'); m.id='lab-dev-add-modal'; m.className='modal-overlay'; m.style.display='flex';
  m.innerHTML='<div class="modal" style="width:480px;max-width:94vw;border-radius:14px;padding:0;overflow:hidden;">'+
    '<div style="padding:18px 22px;background:linear-gradient(135deg,#2d6fd4,#5a94e8);color:#fff;display:flex;align-items:center;gap:11px;"><div style="width:40px;height:40px;border-radius:11px;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;"><i class="ti ti-server-cog" style="font-size:21px;"></i></div><div><div style="font-size:16px;font-weight:800;">장비 추가</div><div style="font-size:11.5px;opacity:0.85;">실장비 접속 정보를 입력 후 추가하세요</div></div></div>'+
    '<div style="padding:20px 22px;display:flex;flex-direction:column;gap:13px;">'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'+
        '<div>'+_lb('장비명 <span style="color:var(--red);">*</span>')+'<input id="ldev-name" onkeydown="if(event.key===\'Enter\')labAddDevSubmit()" placeholder="QA_MAIN_L3" '+_in+'></div>'+
        '<div>'+_lb('IP')+'<input id="ldev-ip" onkeydown="if(event.key===\'Enter\')labAddDevSubmit()" placeholder="220.1.1.236" style="width:100%;font-size:13px;font-family:monospace;padding:9px 11px;border:1.5px solid var(--border);border-radius:8px;outline:none;box-sizing:border-box;"></div>'+
      '</div>'+
      '<div>'+_lb('프로토콜')+'<select id="ldev-proto" onchange="labAddProtoChg()" style="width:100%;font-size:13px;padding:9px 10px;border:1.5px solid var(--border);border-radius:8px;outline:none;box-sizing:border-box;font-weight:700;">'+protos.map(function(p){return '<option value="'+p+'">'+p.toUpperCase()+'</option>';}).join('')+'</select></div>'+
      '<div id="ldev-creds" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">'+
        '<div>'+_lb('ID')+'<input id="ldev-user" value="root" onkeydown="if(event.key===\'Enter\')labAddDevSubmit()" placeholder="root" '+_in+'></div>'+
        '<div>'+_lb('PW')+'<input id="ldev-pw" type="password" onkeydown="if(event.key===\'Enter\')labAddDevSubmit()" placeholder="****" '+_in+'></div>'+
        '<div>'+_lb('Enable PW')+'<input id="ldev-secret" type="password" onkeydown="if(event.key===\'Enter\')labAddDevSubmit()" placeholder="(선택)" '+_in+'></div>'+
      '</div>'+
    '</div>'+
    '<div style="padding:0 22px 20px;display:flex;gap:9px;justify-content:flex-end;"><button onclick="document.getElementById(\'lab-dev-add-modal\').remove()" style="font-size:13px;padding:9px 18px;border-radius:9px;border:1.5px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;font-weight:600;">취소</button><button onclick="labAddDevSubmit()" style="font-size:13px;padding:9px 22px;border-radius:9px;border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:700;"><i class="ti ti-plus"></i> 추가</button></div>'+
  '</div>';
  document.body.appendChild(m); setTimeout(function(){const i=document.getElementById('ldev-name');if(i)i.focus();},50);
}
function labAddProtoChg(){ const p=((document.getElementById('ldev-proto')||{}).value)||'telnet'; const c=document.getElementById('ldev-creds'); if(c) c.style.display=(p==='telnet'||p==='ssh')?'grid':'none'; }
async function labAddDevSubmit(){
  const g=function(id){ const el=document.getElementById(id); return el?(el.value||''):''; };
  const name=g('ldev-name').trim();
  if(!name){ const i=document.getElementById('ldev-name'); if(i){ i.style.borderColor='var(--red)'; i.focus(); } return; }
  const proto=(g('ldev-proto')||'telnet');
  const dt=(proto==='ssh')?'cisco_ios':(proto==='telnet')?'cisco_ios_telnet':proto;
  labList.push({id:'lab'+Date.now(), name:name, ip:g('ldev-ip').trim(), protocol:proto, username:g('ldev-user').trim(), password:g('ldev-pw'), secret:g('ldev-secret'), device_type:dt, status:'미확인'});
  await saveDeviceData();
  const m=document.getElementById('lab-dev-add-modal'); if(m)m.remove();
  renderLabReg(); showToast('"'+name+'" 추가됨');
}
async function labSave(id,field,value){
  const l=labList.find(x=>x.id===id); if(!l) return; l[field]=value;
  if(field==='protocol'){
    if(value==='ssh') l.device_type='cisco_ios';
    else if(value==='telnet') l.device_type='cisco_ios_telnet';
    else l.device_type=value; // snmp/rest/tcl → device_type에 그대로 저장
  }
  await saveDeviceData();
}
function labDelete(id){
  uiConfirm({title:'Lab 장비 삭제', icon:'ti-trash', danger:true, confirmText:'삭제', msg:'이 Lab 장비를 삭제합니다.<br><span style="font-size:11.5px;color:var(--text3);"><i class="ti ti-alert-triangle"></i> 삭제 후 복구할 수 없습니다.</span>', onConfirm:async function(){ labList=labList.filter(x=>x.id!==id); await saveDeviceData(); renderLabReg(); showToast('삭제됨'); }});
}
async function labTest(id){
  const l=labList.find(x=>x.id===id); if(!l) return;
  if(!l.ip){ showToast('IP를 먼저 입력하세요'); return; }
  l.status='확인중'; renderLabReg();
  try{
    const r=await fetch('/api/lab-test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host:l.ip,port:l.port,protocol:l.protocol,username:l.username,password:l.password,secret:l.secret,device_type:l.device_type})});
    const d=await r.json();
    l.status=d.ok?'연결됨':'실패';
    showToast(d.ok?('연결 성공'+(d.prompt?' · '+d.prompt:'')):('연결 실패: '+(d.error||'')));
  }catch(e){ l.status='실패'; showToast('요청 오류: '+e.message); }
  await saveDeviceData(); renderLabReg();
}
function deviceRoleBadge(role){ const c=DEVICE_ROLE_COLORS[role]||'#888'; return '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:'+c+'22;color:'+c+';">'+(role||'기타')+'</span>'; }
var _devTblFilter={};   // (미사용) 구 컬럼 필터
var _devTblSearch='';   // 전체 컬럼 검색어(부분일치)
var _devKind='device';   // 'device'=장비(CLI) | 'instrument'=계측기 — 섹션 탭
var _devLabSel='';       // 장비 Lab 분류 선택 ('' = 전체, '__none__' = 미배치, 그 외 = Lab명)
function _isInstrument(d){ return !!d && d.role==='계측기'; }
function devKindSet(k){ _devKind=(['device','instrument','summary'].indexOf(k)>=0?k:'device'); _devLabSel=''; _devTblPage=1; renderDeviceTable(); }
function devLabSel(v){ _devLabSel=v||''; _devTblPage=1; renderDeviceTable(); }
var _devSort='', _devSort2='', _devSort3='', _devSort4='';
function _devSortSave(){ try{ localStorage.setItem('utop_dev_sort', JSON.stringify([_devSort,_devSort2,_devSort3,_devSort4])); }catch(e){} }
try{ var _ds=JSON.parse(localStorage.getItem('utop_dev_sort')||'[]'); if(Array.isArray(_ds)){ _devSort=_ds[0]||''; _devSort2=_ds[1]||''; _devSort3=_ds[2]||''; _devSort4=_ds[3]||''; } }catch(e){}
function devSortSet(v){ _devSort=v||''; if(!_devSort){_devSort2='';_devSort3='';_devSort4='';} _devSortSave(); _devTblPage=1; renderDeviceTable(); }
function devSort2Set(v){ _devSort2=v||''; if(!_devSort2){_devSort3='';_devSort4='';} _devSortSave(); _devTblPage=1; renderDeviceTable(); }
function devSort3Set(v){ _devSort3=v||''; if(!_devSort3){_devSort4='';} _devSortSave(); _devTblPage=1; renderDeviceTable(); }
function devSort4Set(v){ _devSort4=v||''; _devSortSave(); _devTblPage=1; renderDeviceTable(); }
function _devSortSel(fn,cur,firstLabel){
  var L=[['',firstLabel],['name','모델명'],['role','제품군'],['vendor','Vendor'],['lab','Lab'],['ip','IP'],['status','상태'],['serial','시리얼']];
  return '<select onchange="'+fn+'(this.value)" style="font-size:12px;padding:5px 8px;border:1.5px solid var(--border);border-radius:8px;outline:none;cursor:pointer;">'+L.map(function(o){return '<option value="'+o[0]+'"'+(cur===o[0]?' selected':'')+'>'+o[1]+'</option>';}).join('')+'</select>';
}
function _devTabBar(){
  var k=_devKind, ci=0; (deviceList||[]).forEach(function(d){ if(_isInstrument(d))ci++; }); var cd=(deviceList||[]).length-ci;
  var tab=function(val,label,icon,cnt){ var on=(k===val); return '<button onclick="devKindSet(\''+val+'\')" style="font-size:13px;font-weight:800;padding:8px 16px;border:none;border-bottom:3px solid '+(on?'#2d6fd4':'transparent')+';background:transparent;color:'+(on?'#2d6fd4':'var(--text3)')+';cursor:pointer;margin-bottom:-2px;"><i class="ti '+icon+'"></i> '+label+(cnt!=null?' <span style="font-size:11px;">'+cnt+'</span>':'')+'</button>'; };
  return '<div style="display:flex;gap:6px;margin-bottom:12px;border-bottom:2px solid var(--border);">'+tab('summary','Summary','ti-chart-bar',null)+tab('device','장비','ti-server-2',cd)+tab('instrument','계측기','ti-device-desktop-analytics',ci)+'</div>';
}
function _devSummaryView(list,noTab){
  var devs=list||deviceList||[];
  var cntAll=devs.length, cntInst=devs.filter(_isInstrument).length, cntDev=cntAll-cntInst;
  var cntConn=devs.filter(function(d){return d.status==='연결됨'||d.status==='connected';}).length;
  var grp=function(field){ var m={}; devs.forEach(function(d){ var v=String(d[field]==null?'':d[field]).trim()||'(미지정)'; m[v]=(m[v]||0)+1; }); return Object.keys(m).map(function(x){return [x,m[x]];}).sort(function(a,b){return b[1]-a[1];}); };
  var grpModel=function(){ var m={}; devs.forEach(function(d){ var v=String(d.name||'').trim().replace(/_\d+$/,'')||'(미지정)'; m[v]=(m[v]||0)+1; }); return Object.keys(m).map(function(x){return [x,m[x]];}).sort(function(a,b){return b[1]-a[1];}); };
  var bar=function(title,icon,data,color){
    var max=data.reduce(function(s,x){return Math.max(s,x[1]);},0)||1;
    var rows=data.map(function(x){ var pct=Math.max(3,Math.round(x[1]/max*100)); return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;"><div style="width:130px;font-size:12px;color:var(--text2);text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0;" title="'+String(x[0]).replace(/"/g,'&quot;')+'">'+String(x[0]).replace(/</g,'&lt;')+'</div><div style="flex:1;background:var(--bg3);border-radius:5px;height:18px;overflow:hidden;"><div style="width:'+pct+'%;height:100%;background:'+color+';border-radius:5px;"></div></div><div style="width:40px;font-size:12.5px;font-weight:800;color:'+color+';text-align:right;flex-shrink:0;">'+x[1]+'</div></div>'; }).join('');
    return '<div style="border:1px solid var(--border);border-radius:12px;padding:16px 18px;background:#fff;"><div style="font-size:13px;font-weight:800;color:var(--text);margin-bottom:13px;"><i class="ti '+icon+'" style="color:'+color+';"></i> '+title+' <span style="font-size:11px;color:var(--text3);font-weight:600;">('+data.length+'종)</span></div>'+(rows||'<div style="color:var(--text3);font-size:12px;">데이터 없음</div>')+'</div>';
  };
  var card=function(label,val,color){ return '<div style="flex:1;min-width:130px;border:1px solid var(--border);border-radius:12px;padding:15px 18px;background:#fff;"><div style="font-size:12px;color:var(--text3);font-weight:700;">'+label+'</div><div style="font-size:26px;font-weight:800;color:'+color+';margin-top:3px;">'+val+'</div></div>'; };
  return '<div style="padding:16px 20px;">'
    +(noTab?'':_devTabBar())
    +'<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">'+card('전체',cntAll,'#1c2942')+card('장비',cntDev,'#2d6fd4')+card('계측기',cntInst,'#e8820c')+card('연결됨',cntConn,'#00a872')+'</div>'
    +'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px;">'
      +bar('제품군(L2/L3/OLT/ONT/CPE/HGW…)별 수량','ti-category',grp('role'),'#2d6fd4')
      +bar('모델명별 제품 수량','ti-versions',grpModel(),'#7c3aed')
      +bar('Lab별 수량','ti-building',grp('lab'),'#00a872')
      +bar('Vendor별 수량','ti-building-store',grp('vendor'),'#e8820c')
    +'</div>'
  +'</div>';
}
var _devTblPage=1;          // 현재 페이지(1-base)
var _devTblPageSize=50;     // 페이지당 출력 개수(숫자, 또는 'all')
var _devTblSel={};          // 다중 선택(체크박스): 장비 id -> true
function devTblSelToggle(id,on){ if(on)_devTblSel[id]=true; else delete _devTblSel[id]; _devTblSyncSelBtn(); }
function devTblSelAll(on){ (window._devTblShownIds||[]).forEach(function(id){ if(on)_devTblSel[id]=true; else delete _devTblSel[id]; }); renderDeviceTable(); }
function _devTblSyncSelBtn(){ var n=Object.keys(_devTblSel).filter(function(k){return _devTblSel[k];}).length; var b=document.getElementById('dev-del-sel'); if(b){ b.innerHTML='<i class="ti ti-trash" style="font-size:13px;"></i> 선택 삭제'+(n?(' ('+n+')'):''); b.disabled=!n; b.style.background=n?'#c0414f':'#e3b6bd'; b.style.cursor=n?'pointer':'default'; } }
function devTblDelSelected(){ var ids=Object.keys(_devTblSel).filter(function(k){return _devTblSel[k];}); if(!ids.length){ showToast('선택된 항목이 없습니다'); return; } if(!confirm(ids.length+'개를 삭제할까요?'))return; var s={}; ids.forEach(function(x){s[x]=1;}); deviceList=deviceList.filter(function(d){ return !s[d.id]; }); _devTblSel={}; saveDeviceData(); renderDeviceTable(); }
function devRegToggle(v){ renderDeviceReg(); }   // 표 단일화 — 토글 비활성(호환용)
function devTblFilterSet(f,v){ _devTblFilter[f]=v; _devTblPage=1; renderDeviceTable(); }
function devTblSearchSet(v){ _devTblSearch=v; _devTblPage=1; renderDeviceTable(); var el=document.getElementById('dev-search'); if(el){ el.focus(); try{ var L=el.value.length; el.setSelectionRange(L,L); }catch(e){} } }
function _devFltClose(){ var m=document.getElementById('dev-flt-menu'); if(m) m.remove(); }
function devFltOpen(ev, field){
  ev.preventDefault(); ev.stopPropagation(); _devFltClose();
  var ins=(_devKind==='instrument'); var s={}, vals=[];
  deviceList.forEach(function(d){ if(_isInstrument(d)!==ins)return; var v=String(d[field]==null?'':d[field]); if(v!==''&&!s[v]){ s[v]=1; vals.push(v); } });
  vals.sort(function(a,b){return String(a).localeCompare(String(b),undefined,{numeric:true});});
  var cur=String(_devTblFilter[field]||'');
  var m=document.createElement('div'); m.id='dev-flt-menu';
  m.style.cssText='position:fixed;z-index:10000;background:#fff;border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.18);padding:4px;min-width:130px;max-width:340px;max-height:340px;overflow:auto;font-size:12px;';
  var item=function(val,label){ var on=(cur===val); return '<div data-v="'+String(val).replace(/"/g,'&quot;')+'" onclick="devTblFilterSet(\''+field+'\',this.getAttribute(\'data-v\'));_devFltClose();" onmouseenter="this.style.background=\'#f0f4fa\'" onmouseleave="this.style.background=\'transparent\'" style="padding:6px 10px;border-radius:5px;cursor:pointer;white-space:nowrap;'+(on?'background:#eaf2ff;color:#2d6fd4;font-weight:700;':'color:var(--text);')+'">'+(on?'<i class="ti ti-check" style="font-size:12px;"></i> ':'<span style="display:inline-block;width:14px;"></span>')+String(label).replace(/</g,'&lt;')+'</div>'; };
  m.innerHTML=item('','(전체)')+vals.map(function(v){return item(v,v);}).join('');
  document.body.appendChild(m);
  var tgt=ev.currentTarget||ev.target; var r=(tgt&&tgt.getBoundingClientRect)?tgt.getBoundingClientRect():{left:ev.clientX,bottom:ev.clientY,top:ev.clientY};
  var L=Math.min(r.left, window.innerWidth-m.offsetWidth-8); if(L<6)L=6;
  var T=r.bottom+2; if(T+m.offsetHeight>window.innerHeight-8) T=Math.max(6, r.top-m.offsetHeight-2);
  m.style.left=L+'px'; m.style.top=T+'px';
  setTimeout(function(){ document.addEventListener('click', _devFltClose, {once:true}); },0);
}
function devTblPageSizeSet(v){ _devTblPageSize=(v==='all'?'all':(parseInt(v,10)||20)); _devTblPage=1; renderDeviceTable(); }
function devTblGoPage(p){ _devTblPage=p; renderDeviceTable(); }
function renderDeviceReg(){ var tr=document.getElementById('device-reg-tree'); if(tr)tr.style.display='none'; renderDeviceTable(); }
var _devRegView=(typeof _devRegView!=='undefined')?_devRegView:'table';   // 표 단일화 — 토글 비활성(호환용 기본값)
function renderDeviceTree(){
  const el=document.getElementById('device-reg-tree'); if(!el) return;
  let h='<div style="padding:12px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;flex-shrink:0;">'
    +'<i class="ti ti-server" style="color:var(--blue);font-size:16px;"></i><span style="font-size:14px;font-weight:700;flex:1;">장비 목록</span>'
    +'<button onclick="devRegToggle(\''+(_devRegView==='table'?'form':'table')+'\')" title="상세/표 전환" style="font-size:11px;font-weight:700;padding:5px 10px;border-radius:7px;border:1px solid '+(_devRegView==='table'?'#7c3aed':'var(--border)')+';background:'+(_devRegView==='table'?'#7c3aed':'#fff')+';color:'+(_devRegView==='table'?'#fff':'var(--text2)')+';cursor:pointer;margin-right:4px;"><i class="ti ti-table" style="font-size:12px;"></i> '+(_devRegView==='table'?'상세':'표 등록')+'</button>'
    +'<button onclick="deviceOpenModal(null)" title="장비 추가" style="width:28px;height:28px;border-radius:7px;border:1px solid var(--border);background:#fff;color:var(--blue);cursor:pointer;font-size:17px;line-height:1;display:flex;align-items:center;justify-content:center;">+</button>'
    +'</div><div style="flex:1;overflow-y:auto;padding:8px;">';
  if(!deviceList.length){
    h+='<div style="padding:34px 10px;text-align:center;color:var(--text3);font-size:12px;line-height:1.7;">등록된 장비가 없습니다.<br><b>+</b> 로 추가하세요.</div>';
  } else {
    const byRole={}; deviceList.forEach(d=>{ const k=d.role||'기타'; (byRole[k]=byRole[k]||[]).push(d); });
    DEVICE_ROLES.forEach(role=>{
      const list=byRole[role]; if(!list||!list.length) return;
      const c=DEVICE_ROLE_COLORS[role]||'#888';
      const gsel=_devSelGroup===role&&!_devSelId;
      h+='<div style="margin-bottom:10px;"><div onclick="deviceSelectGroup(\''+role+'\')" title="클릭: 모델 목록 표로 보기" style="display:flex;align-items:center;gap:6px;padding:5px 6px;font-size:12px;font-weight:700;color:'+c+';cursor:pointer;border-radius:6px;background:'+(gsel?c+'18':'transparent')+';"><i class="ti ti-layout-grid" style="font-size:13px;"></i>'+role+'<span style="color:var(--text3);font-weight:400;margin-left:2px;">'+list.length+'</span></div>';
      list.forEach(d=>{
        const sel=_devSelId===d.id;
        h+='<div onclick="deviceSelect(\''+d.id+'\')" style="display:flex;align-items:center;gap:8px;padding:5px 8px 5px 22px;border-radius:6px;cursor:pointer;font-size:13px;background:'+(sel?'rgba(45,111,212,0.1)':'transparent')+';" onmouseenter="if(this.style.background!==\'rgba(45, 111, 212, 0.1)\')this.style.background=\'rgba(0,0,0,0.03)\'" onmouseleave="if(\''+(sel?'1':'')+'\'!==\'1\')this.style.background=\'transparent\'">'
          +'<span style="width:7px;height:7px;border-radius:50%;background:'+c+';flex-shrink:0;"></span>'
          +'<span style="flex:1;color:'+(sel?'var(--blue)':'var(--text)')+';font-weight:'+(sel?'700':'500')+';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+(d.name||'(모델명 없음)')+'</span>'
          +'</div>';
      });
      h+='</div>';
    });
  }
  h+='</div>';
  el.innerHTML=h;
}
function deviceSelect(id){ _devSelId=id; _devSelGroup=null; renderDeviceReg(); }
function deviceSelectGroup(role){ _devSelGroup=role; _devSelId=null; renderDeviceReg(); }
function deviceModelPick(name){ const m=modelList.find(x=>x.name===name); if(m&&m.vendor){ const ve=document.getElementById('dev-vendor'); if(ve) ve.value=m.vendor; } }
async function deviceTestForm(){
  const gv=k=>{ const el=document.getElementById(k); return el?(el.value||''):''; };
  const ip=gv('dev-ip').trim(); if(!ip){ showToast('IP를 먼저 입력하세요'); return; }
  const protocol=gv('dev-protocol')||'telnet';
  const badge=document.getElementById('dev-status-badge'); if(badge){ badge.textContent='확인중'; badge.style.background='rgba(245,183,49,0.18)'; badge.style.color='#b8860b'; }
  if(protocol==='rest'){
    // STC/계측기: telnet 아닌 REST 방식으로 연결 확인(섀시 = IP, REST 서버 = localhost:8888)
    try{
      const r=await fetch('/api/stc/conncheck',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chassis:ip,restIp:'localhost',restPort:(parseInt(gv('dev-port'),10)||8888)})});
      const dd=await r.json();
      if(badge){ badge.textContent=dd.ok?'연결됨':'실패'; badge.style.background=dd.ok?'rgba(0,168,114,0.12)':'rgba(229,62,90,0.12)'; badge.style.color=dd.ok?'#00a872':'#e53e5a'; }
      showToast(dd.ok?('STC 연결 성공'+(dd.model?(' · '+dd.model):'')):('STC 연결 실패: '+(dd.error||'')+' — 섀시 IP·REST 서버 확인'));
    }catch(e){ if(badge){ badge.textContent='실패'; badge.style.color='#e53e5a'; } showToast('요청 오류: '+e.message); }
    return;
  }
  try{
    const r=await fetch('/api/lab-test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host:ip,protocol,username:gv('dev-username').trim(),password:gv('dev-password'),secret:gv('dev-secret'),device_type:(protocol==='ssh'?'cisco_ios':'cisco_ios_telnet')})});
    const dd=await r.json();
    if(badge){ badge.textContent=dd.ok?'연결됨':'실패'; badge.style.background=dd.ok?'rgba(0,168,114,0.12)':'rgba(229,62,90,0.12)'; badge.style.color=dd.ok?'#00a872':'#e53e5a'; }
    showToast(dd.ok?('연결 성공'+(dd.prompt?' · '+dd.prompt:'')):('연결 실패: '+(dd.error||'')));
  }catch(e){ if(badge){ badge.textContent='실패'; badge.style.color='#e53e5a'; } showToast('요청 오류: '+e.message); }
}
async function deviceTest(id){
  const d=deviceList.find(x=>x.id===id); if(!d) return;
  if(!d.ip){ showToast('IP를 먼저 입력하세요 ([수정])'); return; }
  var _refresh=function(){ if(typeof renderDeviceTable==='function') renderDeviceTable(); else renderDeviceDetail(); };
  d.status='확인중'; _refresh();
  if((d.protocol||'')==='rest'){
    try{
      const r=await fetch('/api/stc/conncheck',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chassis:d.ip,restIp:'localhost',restPort:(parseInt(d.port,10)||8888)})});
      const dd=await r.json();
      d.status=dd.ok?'연결됨':'실패';
      showToast(dd.ok?('STC 연결 성공'+(dd.model?(' · '+dd.model):'')):('STC 연결 실패: '+(dd.error||'')+' — 섀시 IP·REST 서버 확인'));
    }catch(e){ d.status='실패'; showToast('요청 오류: '+e.message); }
    await saveDeviceData(); _refresh(); return;
  }
  try{
    const r=await fetch('/api/lab-test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host:d.ip,port:d.port,protocol:d.protocol,username:d.username,password:d.password,secret:d.secret,device_type:d.device_type})});
    const dd=await r.json();
    d.status=dd.ok?'연결됨':'실패';
    showToast(dd.ok?('연결 성공'+(dd.prompt?' · '+dd.prompt:'')):('연결 실패: '+(dd.error||'')));
  }catch(e){ d.status='실패'; showToast('요청 오류: '+e.message); }
  await saveDeviceData(); _refresh();
}
function renderDeviceDetail(){
  const el=document.getElementById('device-reg-detail'); if(!el) return;
  if(_devSelGroup && !_devSelId){
    const list=deviceList.filter(x=>(x.role||'기타')===_devSelGroup);
    const ifCell=arr=>{ arr=arr||[]; if(!arr.length) return '<span style="color:#bbb;">-</span>'; const show=arr.slice(0,8).map(p=>p.name).join(', '); return '<span style="font-family:monospace;font-size:11px;">'+show+(arr.length>8?' …':'')+'</span> <span style="color:var(--text3);font-size:10px;">('+arr.length+')</span>'; };
    el.innerHTML='<div style="padding:22px 28px;">'
      +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">'+deviceRoleBadge(_devSelGroup)+'<span style="font-size:18px;font-weight:800;color:var(--text);">'+_devSelGroup+'</span><span style="font-size:12px;color:var(--text3);">'+list.length+'개 모델</span><div style="flex:1;"></div><button onclick="deviceOpenModal(null)" style="font-size:12px;padding:6px 14px;border-radius:7px;border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:700;"><i class="ti ti-plus"></i> 장비 추가</button></div>'
      +'<div style="overflow-x:auto;border:1px solid var(--border);border-radius:10px;"><table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:#f4f5f7;">'
        +'<th style="padding:9px 12px;text-align:left;font-weight:700;color:#666;white-space:nowrap;">모델명</th><th style="padding:9px 12px;text-align:left;font-weight:700;color:#666;white-space:nowrap;">벤더</th><th style="padding:9px 12px;text-align:left;font-weight:700;color:#00a872;">가입자 인터페이스</th><th style="padding:9px 12px;text-align:left;font-weight:700;color:#2d6fd4;">업링크 인터페이스</th><th style="padding:9px 12px;width:60px;"></th></tr></thead><tbody>'
        +(list.length?list.map(d=>'<tr style="border-top:1px solid #f0f0f0;cursor:pointer;" onclick="deviceSelect(\''+d.id+'\')" onmouseenter="this.style.background=\'#f8f9fb\'" onmouseleave="this.style.background=\'\'"><td style="padding:8px 12px;font-weight:700;color:var(--blue);white-space:nowrap;">'+(d.name||'')+'</td><td style="padding:8px 12px;color:var(--text2);white-space:nowrap;">'+(d.vendor||'-')+'</td><td style="padding:8px 12px;">'+ifCell(d.subscriber_ifs)+'</td><td style="padding:8px 12px;">'+ifCell(d.uplink_ifs)+'</td><td style="padding:8px 12px;text-align:right;white-space:nowrap;"><i class="ti ti-edit" onclick="event.stopPropagation();deviceOpenModal(\''+d.id+'\')" style="color:var(--text3);cursor:pointer;margin-right:8px;"></i><i class="ti ti-trash" onclick="event.stopPropagation();deviceDelete(\''+d.id+'\')" style="color:var(--text3);cursor:pointer;"></i></td></tr>').join(''):'<tr><td colspan="5" style="padding:24px;text-align:center;color:var(--text3);">이 그룹에 모델이 없습니다</td></tr>')
      +'</tbody></table></div></div>';
    return;
  }
  const d=deviceList.find(x=>x.id===_devSelId);
  if(!d){ el.innerHTML='<div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--text3);font-size:14px;gap:10px;"><i class="ti ti-arrow-left" style="font-size:32px;opacity:0.3;"></i>왼쪽에서 모델을 선택하세요</div>'; return; }
  const sub=d.subscriber_ifs||[]; const up=d.uplink_ifs||[];
  const ifTable=(arr,color,label)=>'<div style="margin-top:16px;"><div style="font-size:13px;font-weight:700;color:'+color+';margin-bottom:7px;display:flex;align-items:center;gap:6px;"><i class="ti ti-plug"></i> '+label+' <span style="color:var(--text3);font-weight:400;font-size:12px;">'+arr.length+'개</span></div>'
    +(arr.length?'<div style="display:flex;flex-wrap:wrap;gap:6px;">'+arr.map(p=>'<span style="font-size:12px;font-family:monospace;padding:4px 10px;border-radius:6px;background:'+color+'14;color:'+color+';border:1px solid '+color+'33;">'+p.name+((p.speed||p.type)?'<span style="opacity:0.6;"> ·'+(p.speed||p.type)+'</span>':'')+'</span>').join('')+'</div>':'<span style="font-size:12px;color:#bbb;">없음</span>')
    +'</div>';
  el.innerHTML='<div style="padding:24px 30px;max-width:820px;">'
    +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">'+deviceRoleBadge(d.role)
      +'<span style="font-size:22px;font-weight:800;color:var(--text);">'+(d.name||'')+'</span>'
      +'<div style="flex:1;"></div>'
      +'<button onclick="deviceOpenModal(\''+d.id+'\')" style="font-size:12px;padding:7px 15px;border-radius:7px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;font-weight:600;"><i class="ti ti-edit"></i> 수정</button>'
      +'<button onclick="deviceDelete(\''+d.id+'\')" style="font-size:12px;padding:7px 15px;border-radius:7px;border:1px solid rgba(229,62,90,0.4);background:rgba(229,62,90,0.06);color:var(--red);cursor:pointer;font-weight:600;"><i class="ti ti-trash"></i> 삭제</button>'
    +'</div>'
    +'<div style="font-size:13px;color:var(--text3);padding-bottom:14px;border-bottom:1px solid var(--border);">벤더: <b style="color:var(--text2);">'+(d.vendor||'-')+'</b></div>'
    +'<div style="margin-top:14px;padding:12px 14px;background:#f8faf9;border:1px solid var(--border);border-radius:10px;">'
      +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:'+(d.ip?'8px':'0')+';"><i class="ti ti-plug-connected" style="color:var(--green);"></i><span style="font-size:13px;font-weight:700;">접속 정보</span>'
        +'<span style="font-size:11px;padding:2px 9px;border-radius:10px;background:'+(d.status==='연결됨'?'rgba(0,168,114,0.12)':d.status==='실패'?'rgba(229,62,90,0.12)':'#eee')+';color:'+(d.status==='연결됨'?'#00a872':d.status==='실패'?'#e53e5a':'#999')+';font-weight:700;">● '+(d.status||'미확인')+'</span>'
        +'<div style="flex:1;"></div>'
        +(d.ip?'<button onclick="deviceTest(\''+d.id+'\')" style="font-size:11px;padding:5px 13px;border-radius:6px;border:1px solid var(--green);background:#fff;color:var(--green);cursor:pointer;font-weight:700;"><i class="ti ti-plug"></i> 연결 테스트</button>':'<span style="font-size:11px;color:#c48a00;">IP 미입력 — [수정]에서 접속정보 입력</span>')
      +'</div>'
      +(d.ip?'<div style="font-size:12px;color:var(--text2);display:flex;gap:18px;flex-wrap:wrap;"><span><b style="color:var(--text3);">IP</b> <span style="font-family:monospace;">'+d.ip+'</span></span><span><b style="color:var(--text3);">프로토콜</b> '+(d.protocol||'telnet')+'</span><span><b style="color:var(--text3);">ID</b> '+(d.username||'-')+'</span><span><b style="color:var(--text3);">Enable PW</b> '+(d.secret?'●●●':'-')+'</span></div>':'')
    +'</div>'
    +ifTable(sub,'#00a872','가입자 인터페이스 (Access/PON)')
    +ifTable(up,'#2d6fd4','업링크 인터페이스 (Uplink)')
    +'</div>';
}
function deviceOpenModal(id){
  const d=id?deviceList.find(x=>x.id===id):null;
  _devEditId=id||null;
  _devDraftSub=d?JSON.parse(JSON.stringify(d.subscriber_ifs||[])):[];
  _devDraftUp=d?JSON.parse(JSON.stringify(d.uplink_ifs||[])):[];
  const roleOpts=DEVICE_ROLES.map(r=>'<option value="'+r+'" '+((d&&d.role===r)?'selected':'')+'>'+r+'</option>').join('');
  const typeOpts=DEVICE_IF_TYPES.map(t=>'<option>'+t+'</option>').join('');
  const speedOpts=DEVICE_IF_SPEEDS.map(t=>'<option'+(t==='10G'?' selected':'')+'>'+t+'</option>').join('');
  const protoOpts=['telnet','ssh','snmp','rest','tcl'].map(p=>'<option'+(((d&&d.protocol)||'telnet')===p?' selected':'')+'>'+p+'</option>').join('');
  const cardOpts='<option value="">(라인카드 선택)</option>'+cardList.map(c=>'<option value="'+c.id+'">'+c.name+' · '+cardCompo(c)+'</option>').join('');
  const vendorDL='<datalist id="dev-vendor-dl">'+[...new Set([...vendorList.map(v=>v.name),...deviceList.map(x=>x.vendor)].filter(Boolean))].map(v=>'<option value="'+v+'"></option>').join('')+'</datalist>';
  const modelDL='<datalist id="dev-model-dl">'+[...new Set([...modelList.map(m=>m.name),...deviceList.map(x=>x.name)].filter(Boolean))].map(v=>'<option value="'+v+'"></option>').join('')+'</datalist>';
  const ifSection=(g,label,color)=>'<div style="margin-top:10px;"><div style="font-size:11px;font-weight:700;color:'+color+';margin-bottom:6px;display:flex;align-items:center;gap:5px;"><i class="ti ti-plug"></i> '+label+' <span id="dev-if-cnt-'+g+'" style="color:var(--text3);font-weight:600;"></span><span style="flex:1;"></span><button type="button" onclick="deviceClearIf(\''+g+'\')" style="font-size:10px;padding:2px 9px;border-radius:5px;border:1px solid var(--border);background:#fff;color:var(--text3);cursor:pointer;">전체 삭제</button></div>'
    +'<div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin-bottom:8px;padding:8px 10px;background:'+color+'12;border:1px solid '+color+'33;border-radius:8px;font-size:11px;"><i class="ti ti-cpu" style="color:'+color+';font-size:14px;"></i> <b style="color:'+color+';">라인카드 배치</b> 접두어<input id="dev-card-pre-'+g+'" placeholder="te" title="gi/te 등 인터페이스 타입 접두어" style="width:38px;font-size:12px;padding:4px 5px;border:1px solid var(--border);border-radius:5px;outline:none;"> 슬롯<input id="dev-card-slot-'+g+'" placeholder="0" style="width:38px;font-size:12px;padding:4px 6px;border:1px solid var(--border);border-radius:5px;outline:none;"><select id="dev-card-sel-'+g+'" style="font-size:12px;padding:4px 6px;border:1px solid var(--border);border-radius:5px;outline:none;max-width:240px;">'+cardOpts+'</select><button onclick="deviceAddCardSlot(\''+g+'\')" style="font-size:11px;padding:5px 11px;border-radius:5px;border:1px solid '+color+';background:#fff;color:'+color+';cursor:pointer;font-weight:600;">슬롯 추가</button></div>'
    +'<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-end;margin-bottom:8px;padding:9px;background:#f8f9fb;border-radius:8px;">'
      +'<div><div style="font-size:10px;color:var(--text3);margin-bottom:2px;">접두어</div><input id="dev-if-pre-'+g+'" placeholder="te" title="gi/te 등 인터페이스 타입" style="width:44px;font-size:12px;padding:5px 6px;border:1px solid var(--border);border-radius:5px;outline:none;"></div>'
      +'<div><div style="font-size:10px;color:var(--text3);margin-bottom:2px;">포트명</div><input id="dev-if-name-'+g+'" placeholder="0/1" onkeydown="if(event.key===\'Enter\')deviceAddIf(\''+g+'\')" style="width:80px;font-size:12px;padding:5px 8px;border:1px solid var(--border);border-radius:5px;outline:none;"></div>'
      +'<div><div style="font-size:10px;color:var(--text3);margin-bottom:2px;">타입</div><select id="dev-if-type-'+g+'" style="width:86px;font-size:12px;padding:5px 6px;border:1px solid var(--border);border-radius:5px;outline:none;">'+typeOpts+'</select></div>'
      +'<div><div style="font-size:10px;color:var(--text3);margin-bottom:2px;">속도</div><select id="dev-if-speed-'+g+'" style="width:72px;font-size:12px;padding:5px 6px;border:1px solid var(--border);border-radius:5px;outline:none;">'+speedOpts+'</select></div>'
      +'<button onclick="deviceAddIf(\''+g+'\')" style="font-size:12px;padding:6px 10px;border-radius:6px;border:1px solid var(--blue);background:#fff;color:var(--blue);cursor:pointer;font-weight:600;">+ 추가</button>'
      +'<div style="width:1px;height:28px;background:var(--border);margin:0 2px;"></div>'
      +'<div><div style="font-size:10px;color:var(--text3);margin-bottom:2px;">범위 (접두어 + 시작~끝)</div><div style="display:flex;gap:3px;align-items:center;"><input id="dev-rg-pre-'+g+'" placeholder="te0/" title="gi/te 등 인터페이스 타입 + 슬롯 접두어 (예: te0/ → te0/1~te0/24)" style="width:56px;font-size:12px;padding:5px 6px;border:1px solid var(--border);border-radius:5px;outline:none;"><input id="dev-rg-s-'+g+'" type="number" placeholder="1" style="width:40px;font-size:12px;padding:5px 4px;border:1px solid var(--border);border-radius:5px;outline:none;"><span style="color:var(--text3);">~</span><input id="dev-rg-e-'+g+'" type="number" placeholder="24" style="width:40px;font-size:12px;padding:5px 4px;border:1px solid var(--border);border-radius:5px;outline:none;"><button onclick="deviceAddIfRange(\''+g+'\')" style="font-size:12px;padding:6px 9px;border-radius:6px;border:1px solid var(--green);background:#fff;color:var(--green);cursor:pointer;font-weight:600;">범위</button></div></div>'
    +'</div>'
    +'<div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin-bottom:8px;font-size:11px;color:var(--text3);"><i class="ti ti-stack-2" style="color:'+color+';font-size:13px;"></i> 슬롯형 일괄: 접두어<input id="dev-sl-pre-'+g+'" placeholder="te" title="gi/te 등" style="width:34px;font-size:12px;padding:4px 4px;border:1px solid var(--border);border-radius:5px;outline:none;"> 슬롯 <input id="dev-sl-ss-'+g+'" type="number" placeholder="0" style="width:38px;font-size:12px;padding:4px 5px;border:1px solid var(--border);border-radius:5px;outline:none;">~<input id="dev-sl-se-'+g+'" type="number" placeholder="4" style="width:38px;font-size:12px;padding:4px 5px;border:1px solid var(--border);border-radius:5px;outline:none;"> / 포트 <input id="dev-sl-ps-'+g+'" type="number" placeholder="1" style="width:38px;font-size:12px;padding:4px 5px;border:1px solid var(--border);border-radius:5px;outline:none;">~<input id="dev-sl-pe-'+g+'" type="number" placeholder="24" style="width:38px;font-size:12px;padding:4px 5px;border:1px solid var(--border);border-radius:5px;outline:none;"> <button onclick="deviceAddIfSlot(\''+g+'\')" style="font-size:11px;padding:5px 9px;border-radius:5px;border:1px solid '+color+';background:#fff;color:'+color+';cursor:pointer;font-weight:600;">슬롯/포트 추가</button></div>'
    +'<div id="dev-if-list-'+g+'" style="display:flex;flex-wrap:wrap;gap:5px;"></div>'
  +'</div>';
  const modal=document.createElement('div');
  modal.className='modal-overlay'; modal.id='device-modal';
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:9999;';
  modal.innerHTML='<div style="background:#fff;border-radius:12px;width:1160px;max-width:97vw;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,0.25);">'
    +'<div style="padding:14px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;"><i class="ti ti-server" style="color:var(--blue);font-size:18px;"></i><span style="font-size:15px;font-weight:700;">Device Registration'+(id?' (수정)':'')+'</span></div>'
    +'<div style="padding:16px 20px;flex:1;overflow-y:auto;">'
      +'<div style="display:grid;grid-template-columns:1.1fr 1fr 1.3fr 1.2fr 0.8fr 0.9fr 0.9fr 1fr 1.3fr;gap:8px;margin-bottom:16px;align-items:end;">'
        +'<div><div style="font-size:10px;font-weight:700;color:var(--text3);margin-bottom:3px;">벤더</div><input id="dev-vendor" list="dev-vendor-dl" value="'+(d?(d.vendor||''):'')+'" placeholder="Ubiquoss" style="width:100%;font-size:12px;padding:7px 8px;border:1.5px solid var(--border);border-radius:6px;outline:none;box-sizing:border-box;">'+vendorDL+'</div>'
        +'<div><div style="font-size:10px;font-weight:700;color:var(--text3);margin-bottom:3px;">제품군 *</div><select id="dev-role" style="width:100%;font-size:12px;padding:7px 6px;border:1.5px solid var(--border);border-radius:6px;outline:none;box-sizing:border-box;">'+roleOpts+'</select></div>'
        +'<div><div style="font-size:10px;font-weight:700;color:var(--text3);margin-bottom:3px;">모델명 *</div><input id="dev-name" list="dev-model-dl" oninput="deviceModelPick(this.value)" value="'+(d?(d.name||''):'')+'" placeholder="U9024A-10G" style="width:100%;font-size:12px;padding:7px 8px;border:1.5px solid var(--border);border-radius:6px;outline:none;box-sizing:border-box;">'+modelDL+'</div>'
        +'<div><div style="font-size:10px;font-weight:700;color:var(--text3);margin-bottom:3px;">IP</div><input id="dev-ip" value="'+(d?(d.ip||''):'')+'" placeholder="220.1.1.236" style="width:100%;font-size:12px;font-family:monospace;padding:7px 8px;border:1.5px solid var(--border);border-radius:6px;outline:none;box-sizing:border-box;"></div>'
        +'<div><div style="font-size:10px;font-weight:700;color:var(--text3);margin-bottom:3px;">방식</div><select id="dev-protocol" onchange="var r=document.getElementById(\'dev-snmp-row\');if(r)r.style.display=this.value===\'snmp\'?\'flex\':\'none\';" style="width:100%;font-size:12px;padding:7px 4px;border:1.5px solid var(--border);border-radius:6px;box-sizing:border-box;">'+protoOpts+'</select></div>'
        +'<div><div style="font-size:10px;font-weight:700;color:var(--text3);margin-bottom:3px;">ID</div><input id="dev-username" value="'+(d?(d.username||''):'root')+'" placeholder="root" style="width:100%;font-size:12px;padding:7px 8px;border:1.5px solid var(--border);border-radius:6px;outline:none;box-sizing:border-box;"></div>'
        +'<div><div style="font-size:10px;font-weight:700;color:var(--text3);margin-bottom:3px;">PW</div><input id="dev-password" type="password" value="'+(d?(d.password||'').replace(/"/g,"&quot;"):'')+'" style="width:100%;font-size:12px;padding:7px 8px;border:1.5px solid var(--border);border-radius:6px;outline:none;box-sizing:border-box;"></div>'
        +'<div><div style="font-size:10px;font-weight:700;color:var(--text3);margin-bottom:3px;">Enable PW</div><input id="dev-secret" type="password" value="'+(d?(d.secret||'').replace(/"/g,"&quot;"):'')+'" placeholder="(선택)" style="width:100%;font-size:12px;padding:7px 8px;border:1.5px solid var(--border);border-radius:6px;outline:none;box-sizing:border-box;"></div>'
        +'<div><div style="font-size:10px;font-weight:700;color:var(--text3);margin-bottom:3px;">상태</div><div style="display:flex;gap:5px;align-items:center;"><span id="dev-status-badge" style="font-size:10px;padding:6px 7px;border-radius:6px;background:'+(d&&d.status==='연결됨'?'rgba(0,168,114,0.12)':d&&d.status==='실패'?'rgba(229,62,90,0.12)':'#eee')+';color:'+(d&&d.status==='연결됨'?'#00a872':d&&d.status==='실패'?'#e53e5a':'#999')+';font-weight:700;white-space:nowrap;">'+((d&&d.status)||'미확인')+'</span><button onclick="deviceTestForm()" title="입력값으로 연결 테스트" style="font-size:10px;padding:6px 9px;border-radius:6px;border:1px solid var(--green);background:#fff;color:var(--green);cursor:pointer;font-weight:700;white-space:nowrap;"><i class="ti ti-plug"></i> 테스트</button></div></div>'
      +'</div>'
      +'<div id="dev-snmp-row" style="display:'+(((d&&d.protocol)==='snmp')?'flex':'none')+';gap:10px;margin-bottom:14px;align-items:end;padding:11px 13px;background:#f3faf6;border:1px solid #bfe6d2;border-radius:9px;">'
        +'<div style="font-size:11.5px;font-weight:700;color:#00875a;align-self:center;white-space:nowrap;"><i class="ti ti-key"></i> SNMP</div>'
        +'<div style="flex:1;"><div style="font-size:10px;font-weight:700;color:var(--text3);margin-bottom:3px;"><i class="ti ti-lock-open" style="color:#00a872;"></i> Public (읽기 RO)</div><input id="dev-snmp-public" value="'+(d?(d.snmp_public||'public').replace(/"/g,"&quot;"):'public')+'" style="width:100%;font-size:12px;font-family:monospace;padding:7px 8px;border:1.5px solid var(--border);border-radius:6px;outline:none;box-sizing:border-box;"></div>'
        +'<div style="flex:1;"><div style="font-size:10px;font-weight:700;color:var(--text3);margin-bottom:3px;"><i class="ti ti-lock" style="color:#e53e5a;"></i> Private (쓰기 RW)</div><input id="dev-snmp-private" type="password" value="'+(d?(d.snmp_private||'').replace(/"/g,"&quot;"):'')+'" placeholder="(장비별 쓰기 community)" style="width:100%;font-size:12px;font-family:monospace;padding:7px 8px;border:1.5px solid var(--border);border-radius:6px;outline:none;box-sizing:border-box;"></div>'
        +'<div style="flex:0.5;"><div style="font-size:10px;font-weight:700;color:var(--text3);margin-bottom:3px;">버전</div><select id="dev-snmp-ver" style="width:100%;font-size:12px;padding:7px 4px;border:1.5px solid var(--border);border-radius:6px;box-sizing:border-box;">'+['v1','v2c','v3'].map(v=>'<option'+(((d&&d.snmp_ver)||'v2c')===v?' selected':'')+'>'+v+'</option>').join('')+'</select></div>'
      +'</div>'
      +'<div style="display:flex;gap:10px;margin-bottom:14px;align-items:end;padding:11px 13px;background:#fef7ed;border:1px solid #f0d9b5;border-radius:9px;flex-wrap:wrap;">'
        +'<div style="font-size:11.5px;font-weight:700;color:#b5730f;align-self:center;white-space:nowrap;"><i class="ti ti-server-2"></i> 랙 정보 (Rack View)</div>'
        +'<div style="width:84px;"><div style="font-size:10px;font-weight:700;color:var(--text3);margin-bottom:3px;">U 크기</div><input id="dev-rack-u" type="number" min="1" value="'+((d&&d.rack_units)||1)+'" style="width:100%;font-size:12px;padding:7px 8px;border:1.5px solid var(--border);border-radius:6px;outline:none;box-sizing:border-box;"></div>'
        +'<div style="width:96px;"><div style="font-size:10px;font-weight:700;color:var(--text3);margin-bottom:3px;">무게 (kg)</div><input id="dev-weight" type="number" step="0.1" value="'+((d&&d.weight)||'')+'" placeholder="0" style="width:100%;font-size:12px;padding:7px 8px;border:1.5px solid var(--border);border-radius:6px;outline:none;box-sizing:border-box;"></div>'
        +'<div style="width:110px;"><div style="font-size:10px;font-weight:700;color:var(--text3);margin-bottom:3px;">소비전력 (W)</div><input id="dev-power" type="number" value="'+((d&&d.power)||'')+'" placeholder="0" style="width:100%;font-size:12px;padding:7px 8px;border:1.5px solid var(--border);border-radius:6px;outline:none;box-sizing:border-box;"></div>'
        +'<div style="flex:1;min-width:120px;"><div style="font-size:10px;font-weight:700;color:var(--text3);margin-bottom:3px;">랙 이름</div><input id="dev-rack-name" value="'+(d?(d.rack_name||"").replace(/"/g,"&quot;"):"")+'" placeholder="Rack-A" style="width:100%;font-size:12px;padding:7px 8px;border:1.5px solid var(--border);border-radius:6px;outline:none;box-sizing:border-box;"></div>'
        +'<div style="width:104px;"><div style="font-size:10px;font-weight:700;color:var(--text3);margin-bottom:3px;">시작 U 위치</div><input id="dev-rack-pos" type="number" min="1" value="'+((d&&d.rack_pos)||'')+'" placeholder="예: 10" style="width:100%;font-size:12px;padding:7px 8px;border:1.5px solid var(--border);border-radius:6px;outline:none;box-sizing:border-box;"></div>'
      +'</div>'
      +'<div style="border-top:1px solid var(--border);padding-top:12px;"><div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:8px;display:flex;align-items:center;gap:6px;"><i class="ti ti-plug" style="color:var(--blue);"></i> 인터페이스(포트)</div>'
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;">'+ifSection('sub','가입자 인터페이스 (Access/PON)','#00a872')+ifSection('up','업링크 인터페이스 (Uplink)','#2d6fd4')+'</div>'
      +'</div>'
    +'</div>'
    +'<div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;"><button onclick="this.closest(\'.modal-overlay\').remove()" style="font-size:13px;padding:8px 16px;border-radius:7px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;">취소</button><button onclick="deviceSubmit()" style="font-size:13px;padding:8px 20px;border-radius:7px;border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:700;">저장</button></div>'
    +'</div>';
  document.body.appendChild(modal);
  deviceRenderIfList('sub'); deviceRenderIfList('up');
}
function deviceRenderIfList(g){
  const el=document.getElementById('dev-if-list-'+g); if(!el) return;
  const arr=_devDraft(g);
  const _cnt=document.getElementById('dev-if-cnt-'+g); if(_cnt) _cnt.textContent=arr.length?'· '+arr.length+'포트':'';
  if(!arr.length){ el.innerHTML='<span style="font-size:11px;color:#bbb;">포트를 추가하세요</span>'; return; }
  el.innerHTML=arr.map((p,i)=>'<span style="font-size:11px;font-family:monospace;padding:3px 8px;border-radius:5px;background:#eef2f7;color:#46506a;display:inline-flex;align-items:center;gap:5px;">'+p.name+((p.speed||p.type)?'<span style="color:#9aab;">·'+(p.speed||p.type)+'</span>':'')+'<i class="ti ti-x" onclick="deviceRemoveIf(\''+g+'\','+i+')" style="cursor:pointer;color:#c44;font-size:12px;"></i></span>').join('');
}
function deviceAddIf(g){
  const ne=document.getElementById('dev-if-name-'+g); const n=(ne.value||'').trim();
  const pre=((document.getElementById('dev-if-pre-'+g)||{}).value||'').trim();
  const t=document.getElementById('dev-if-type-'+g).value||''; const sp=(document.getElementById('dev-if-speed-'+g)||{}).value||''; const arr=_devDraft(g);
  if(!n){ showToast('포트명을 입력하세요'); return; }
  const nm=pre+n;
  if(arr.some(p=>p.name===nm)){ showToast('이미 있는 포트명입니다'); return; }
  arr.push({name:nm,type:t,speed:sp}); ne.value=''; ne.focus();
  deviceRenderIfList(g);
}
function deviceAddIfRange(g){
  const pre=(document.getElementById('dev-rg-pre-'+g).value||'');
  const s=parseInt(document.getElementById('dev-rg-s-'+g).value,10);
  const e=parseInt(document.getElementById('dev-rg-e-'+g).value,10);
  const t=document.getElementById('dev-if-type-'+g).value||''; const sp=(document.getElementById('dev-if-speed-'+g)||{}).value||''; const arr=_devDraft(g);
  if(isNaN(s)||isNaN(e)||e<s){ showToast('범위를 확인하세요 (시작 ≤ 끝)'); return; }
  if(e-s>256){ showToast('한 번에 256개까지'); return; }
  let added=0;
  for(let i=s;i<=e;i++){ const nm=pre+i; if(!arr.some(p=>p.name===nm)){ arr.push({name:nm,type:t,speed:sp}); added++; } }
  deviceRenderIfList(g);
  showToast(added+'개 포트 추가');
}
function deviceRemoveIf(g,i){ _devDraft(g).splice(i,1); deviceRenderIfList(g); }
function deviceClearIf(g){ const a=_devDraft(g); if(!a.length) return; if(!confirm((g==='up'?'업링크':'가입자')+' 포트를 모두 지우시겠습니까?')) return; a.length=0; deviceRenderIfList(g); }
function deviceAddCardSlot(g){
  const pre=((document.getElementById('dev-card-pre-'+g)||{}).value||'').trim();
  const slot=(document.getElementById('dev-card-slot-'+g).value||'').trim();
  const cardId=document.getElementById('dev-card-sel-'+g).value;
  const card=cardList.find(c=>c.id===cardId);
  if(!slot){ showToast('슬롯 번호를 입력하세요'); return; }
  if(!card){ showToast('라인카드를 선택하세요'); return; }
  const arr=_devDraft(g);
  let port=1, added=0;
  (card.groups||[]).forEach(grp=>{ for(let k=0;k<(+grp.count||0);k++){ const nm=pre+slot+'/'+port; if(!arr.some(x=>x.name===nm)){ arr.push({name:nm,type:'',speed:grp.speed}); added++; } port++; } });
  deviceRenderIfList(g);
  showToast('슬롯 '+slot+' = '+card.name+' → '+added+'포트 추가');
}
function deviceAddIfSlot(g){
  const gv=k=>{ const el=document.getElementById(k); return el?parseInt(el.value,10):NaN; };
  const ss=gv('dev-sl-ss-'+g), se=gv('dev-sl-se-'+g), ps=gv('dev-sl-ps-'+g), pe=gv('dev-sl-pe-'+g);
  const t=document.getElementById('dev-if-type-'+g).value||''; const sp=(document.getElementById('dev-if-speed-'+g)||{}).value||''; const arr=_devDraft(g);
  const pre=((document.getElementById('dev-sl-pre-'+g)||{}).value||'').trim();
  if([ss,se,ps,pe].some(v=>isNaN(v))||se<ss||pe<ps){ showToast('슬롯/포트 범위를 확인하세요'); return; }
  if((se-ss+1)*(pe-ps+1)>2048){ showToast('한 번에 2048개까지'); return; }
  let added=0;
  for(let s=ss;s<=se;s++){ for(let p=ps;p<=pe;p++){ const nm=pre+s+'/'+p; if(!arr.some(x=>x.name===nm)){ arr.push({name:nm,type:t,speed:sp}); added++; } } }
  deviceRenderIfList(g);
  showToast(added+'개 추가 (슬롯 '+ss+'~'+se+' × 포트 '+ps+'~'+pe+')');
}
async function deviceSubmit(){
  const name=(document.getElementById('dev-name').value||'').trim();
  const role=document.getElementById('dev-role').value||'기타';
  const vendor=(document.getElementById('dev-vendor').value||'').trim();
  if(!name){ showToast('장비명을 입력하세요'); return; }
  const gv=k=>{ const el=document.getElementById(k); return el?(el.value||''):''; };
  const protocol=gv('dev-protocol')||'telnet';
  const conn={ ip:gv('dev-ip').trim(), protocol, username:gv('dev-username').trim(), password:gv('dev-password'), secret:gv('dev-secret'), snmp_public:gv('dev-snmp-public').trim(), snmp_private:gv('dev-snmp-private'), snmp_ver:gv('dev-snmp-ver')||'v2c', device_type:(protocol==='ssh'?'cisco_ios':'cisco_ios_telnet') };
  const rack={ rack_units:parseInt(gv('dev-rack-u'),10)||1, weight:parseFloat(gv('dev-weight'))||0, power:parseFloat(gv('dev-power'))||0, rack_name:gv('dev-rack-name').trim(), rack_pos:parseInt(gv('dev-rack-pos'),10)||0 };
  if(_devEditId){
    const d=deviceList.find(x=>x.id===_devEditId);
    if(d){ d.name=name; d.role=role; d.vendor=vendor; d.subscriber_ifs=_devDraftSub; d.uplink_ifs=_devDraftUp; Object.assign(d,conn,rack); }
    _devSelId=_devEditId;
  } else {
    const nid='dev-'+Date.now();
    deviceList.push(Object.assign({id:nid, name, role, vendor, subscriber_ifs:_devDraftSub, uplink_ifs:_devDraftUp, status:'미확인'}, conn, rack));
    _devSelId=nid;
  }
  await saveDeviceData();
  document.getElementById('device-modal')?.remove();
  renderDeviceReg();
  showToast('저장되었습니다');
}
async function deviceDelete(id){
  const d=deviceList.find(x=>x.id===id); if(!d) return;
  if(!confirm('"'+(d.name||'')+'" 장비를 삭제하시겠습니까?')) return;
  deviceList=deviceList.filter(x=>x.id!==id);
  if(_devSelId===id) _devSelId=null;
  await saveDeviceData();
  renderDeviceReg();
  showToast('삭제되었습니다');
}

// ══════════ 계측기(STC) 트래픽 config 에디터 (TC 세션) ══════════
var _tcMeterCur=null;
function _tcm(tcid){ return tcList.find(function(t){return (t.tcid===tcid)||(t.id===tcid);}); }
function _tcMeterDev(tc){
  var ids=(typeof _tcSessIds==='function')?_tcSessIds(tc):((tc.sessions)||[]);
  for(var i=0;i<ids.length;i++){ var l=labList.find(function(x){return x.id===ids[i];}); if(l&&((l.role==='계측기')||(l.group==='계측기')||/spirent|stc|ixia/i.test(String(l.model||'')+' '+String(l.name||'')))) return l; }
  return null;
}
function _meterNewStream(n,a,b){ return {name:'Stream_'+(n||1),count:'1',src:a||'1/1',dst:b||'1/2',enabled:true,packetType:'IPv4/Ethernet',srcMac:'00:00:00:00:00:01',dstMac:'00:00:00:00:00:02',vlan:'',prio:'0',etherType:'0x0800',srcMacMod:'고정',srcMacCnt:'1',srcMacStep:'1',dstMacMod:'고정',dstMacCnt:'1',dstMacStep:'1',srcIpMod:'고정',srcIpCnt:'1',srcIpStep:'1',dstIpMod:'고정',dstIpCnt:'1',dstIpStep:'1',srcPortMod:'고정',srcPortCnt:'1',srcPortStep:'1',dstPortMod:'고정',dstPortCnt:'1',dstPortStep:'1',srcMacTo:'00:00:00:00:00:01',dstMacTo:'00:00:00:00:00:02',srcIpTo:'1.1.1.1',dstIpTo:'2.1.1.1',srcPortTo:'',dstPortTo:'',vlanMod:'고정',vlanStep:'1',vlanTo:'',srcIp:'1.1.1.1',dstIp:'2.1.1.1',gw:'1.1.1.254',dscp:'0',ttl:'64',fragment:'없음',ipv6Src:'',ipv6Dst:'',l4proto:'TCP',srcPort:'',dstPort:'',direction:'단방향',frameType:'Ethernet II',minByte:'64',maxByte:'1518',byteType:'Fixed',load:'10',unit:'Mbps',frameCnt:'0',burst:'1',gap:'0',advProto:'none',bgpLocalAs:'65000',bgpPeerAs:'65001',bgpRouterId:'1.1.1.1',bgpPeerIp:'',bgpHold:'180',bgpKeepalive:'60',bgpRoutes:'10',bgpPrefix:'100.1.0.0/24',ospfArea:'0.0.0.0',ospfRouterId:'1.1.1.1',ospfHello:'10',ospfDead:'40',ospfNetType:'Broadcast',ospfRoutes:'10',ospfCost:'1',bgpEn:false,ospfEn:false,pimEn:false,pimMode:'Sparse',pimRp:'',pimGroup:'224.1.1.1',pimHello:'30',pimJp:'60',igmpEn:false,igmpVer:'v2',igmpGroup:'224.1.1.1',igmpSrc:'',igmpQuery:'125',igmpRobust:'2'}; }
var _tcmSel=0, _tcmTab='l2', _tcmExp={}; var _tcmSaveTimer=null; var _tcmAcc={info:true,streams:true,meas:false}; var _tcmLayer={}; var _tcmChk={};
function _tcmFill(base,html){ [base,base+'-tab'].forEach(function(id){ var w=document.getElementById(id); if(w)w.innerHTML=html; }); }
function _tcMeterInit(tc){
  if(!tc.meterCfg||typeof tc.meterCfg!=='object') tc.meterCfg={};
  var dev=_tcMeterDev(tc); var tf=tc.traffic||{};
  if(!tc.meterCfg.chassis) tc.meterCfg.chassis=(dev&&dev.ip)||tf.ip||'192.168.5.100';
  if(!tc.meterCfg.restPort) tc.meterCfg.restPort=(dev&&dev.port)||8888;
  if(!Array.isArray(tc.meterCfg.ports)||!tc.meterCfg.ports.length){ var pr=tf.port?String(tf.port).split(',').map(function(x){return x.trim();}).filter(Boolean):null; tc.meterCfg.ports=(pr&&pr.length)?pr:['1/1','1/2']; }
  if(!Array.isArray(tc.meterCfg.streams)||!tc.meterCfg.streams.length){ var s=_meterNewStream(1,tc.meterCfg.ports[0],tc.meterCfg.ports[1]||tc.meterCfg.ports[0]); if(tf.src_mac)s.srcMac=tf.src_mac; if(tf.dst_mac)s.dstMac=tf.dst_mac; if(tf.src_ip)s.srcIp=tf.src_ip; if(tf.dst_ip)s.dstIp=tf.dst_ip; if(tf.gateway)s.gw=tf.gateway; if(tf.dscp)s.dscp=tf.dscp; tc.meterCfg.streams=[s]; }
  if(tc.meterCfg.n2xLabel==null) tc.meterCfg.n2xLabel='utop';
  var _pp=tc.meterCfg.ports||['1/1','1/2']; (tc.meterCfg.streams||[]).forEach(function(st){ if(_pp.indexOf(st.src)<0)st.src=_pp[0]; if(_pp.indexOf(st.dst)<0)st.dst=_pp[1]||_pp[0]; });
}
function _tcMeterSave(tcid){ if(_tcmSaveTimer)clearTimeout(_tcmSaveTimer); _tcmSaveTimer=setTimeout(function(){ var tc=_tcm(tcid); if(tc&&typeof saveTCFile==='function')saveTCFile(tc).catch(function(){}); },600); }function _tcMeterDevList(){ var out=[],seen={}; var add=function(arr){ if(!Array.isArray(arr))return; arr.forEach(function(d){ if(!d)return; var ismt=(typeof _isMeterDev==='function')?_isMeterDev(d):(d.role==='계측기'||d.group==='계측기'); if(!ismt)return; var k=d.id||(String(d.name||'')+'|'+String(d.ip||'')); if(seen[k])return; seen[k]=1; out.push(d); }); }; add((typeof deviceList!=='undefined')?deviceList:null); add((typeof labList!=='undefined')?labList:null); return out; }
function tcMeterDevPick(tcid,devId){ var tc=_tcm(tcid); if(!tc)return; if(!tc.meterCfg)tc.meterCfg={}; tc.meterCfg.deviceId=devId||''; var d=null,L=_tcMeterDevList(); for(var i=0;i<L.length;i++){ if(L[i].id===devId){ d=L[i]; break; } } if(d){ tc.meterCfg.vendor=d.vendor||''; tc.meterCfg.model=d.model||d.name||''; if(d.ip)tc.meterCfg.chassis=d.ip; if(d.port)tc.meterCfg.restPort=d.port; tc.meterCfg.devStatus=d.status||'미확인'; } _tcMeterSave(tcid); _tcmRenderStudio(tcid); if(typeof showToast==='function'&&d)showToast('계측기 불러옴: '+((d.vendor?d.vendor+' · ':'')+(d.model||d.name||''))); }function _tcmPktBadge(p){ var c=(p&&p.indexOf('IPv6')>=0)?['#0a7','#e7faf2']:((p&&p.indexOf('BGP')>=0)?['#a60','#fff3e0']:((p&&p.indexOf('ARP')>=0)?['#777','#eef0f3']:['#2d6fd4','#eaf2ff'])); return '<span style="font-size:9px;font-weight:800;color:'+c[0]+';background:'+c[1]+';border-radius:6px;padding:1px 6px;white-space:nowrap;flex-shrink:0;">'+_bdEsc(p||'IPv4')+'</span>'; }
function _tcmProtoChips(s){ if(!s)return ''; var P=[['bgpEn','BGP','#a05a00','#fff3e0'],['ospfEn','OSPF','#1d6b3a','#e7faf2'],['pimEn','PIM','#2d6fd4','#eaf2ff'],['igmpEn','IGMP','#7c3aed','#f3eefe']]; var o=''; for(var k=0;k<P.length;k++){ if(s[P[k][0]])o+='<span style="font-size:9px;font-weight:800;color:'+P[k][2]+';background:'+P[k][3]+';border-radius:5px;padding:1px 6px;white-space:nowrap;">'+P[k][1]+'</span>'; } return o; }
function tcMeterCfgOpen(tcid){
  var tc=_tcm(tcid); if(!tc)return;
  _tcMeterInit(tc);
  _tcMeterCur=tcid; _tcmSel=Math.min(_tcmSel, tc.meterCfg.streams.length-1); if(_tcmSel<0)_tcmSel=0;
  var ov=document.getElementById('tc-meter-ov'); if(ov)ov.remove();
  ov=document.createElement('div'); ov.id='tc-meter-ov';
  ov.style.cssText='position:fixed;inset:0;background:rgba(15,22,38,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;';
  ov.onclick=function(e){ if(e.target===ov) tcMeterCfgClose(); };
  ov.innerHTML='<div style="background:#fff;width:min(1120px,97vw);height:88vh;border-radius:14px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,0.35);">'+
    '<div style="padding:12px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;background:linear-gradient(135deg,#faf8ff,#f1ebfd);flex-shrink:0;">'+
      '<i class="ti ti-router" style="font-size:19px;color:#7c3aed;"></i><span style="font-size:15px;font-weight:800;">계측기 트래픽 스튜디오</span>'+
      '<span style="font-size:11px;font-family:ui-monospace,monospace;color:var(--text3);background:#fff;border:1px solid #e0d6f5;border-radius:6px;padding:2px 8px;"><i class="ti ti-plug"></i> '+_bdEsc(tc.meterCfg.chassis)+' · REST '+_bdEsc(String(tc.meterCfg.restPort))+'</span>'+
      '<span style="flex:1;"></span>'+
      '<button onclick="tcMeterConnect(\''+tcid+'\')" title="연결 + 시험포트 예약 확인" style="font-size:11.5px;font-weight:700;padding:6px 12px;border-radius:7px;border:1px solid #00a872;background:#fff;color:#00875a;cursor:pointer;"><i class="ti ti-plug-connected"></i> 연결</button>'+
      '<button onclick="tcMeterConnect(\''+tcid+'\',true)" title="잠긴 포트를 강제 점유 (잠금 세션에서 해제 후 예약)" style="font-size:11.5px;font-weight:700;padding:6px 12px;border-radius:7px;border:1px solid #e08a00;background:#fff;color:#c47a00;cursor:pointer;"><i class="ti ti-lock-open"></i> 강제</button>'+
      '<button onclick="tcMeterArp(\''+tcid+'\')" title="모든 스트림 Dst_Mac = Gateway MAC" style="font-size:11.5px;font-weight:700;padding:6px 12px;border-radius:7px;border:1px solid #7c3aed;background:#fff;color:#7c3aed;cursor:pointer;"><i class="ti ti-route"></i> ARP 해석</button>'+
      '<button onclick="tcMeterCfgSave(\''+tcid+'\')" style="font-size:12px;font-weight:800;padding:6px 16px;border-radius:7px;border:none;background:#00a872;color:#fff;cursor:pointer;"><i class="ti ti-device-floppy"></i> 저장</button>'+
      '<button onclick="tcMeterCfgClose()" title="닫기" style="border:none;background:transparent;cursor:pointer;font-size:20px;color:var(--text3);"><i class="ti ti-x"></i></button>'+
    '</div>'+
    '<div id="tcm-conn" style="padding:0 18px;flex-shrink:0;"></div>'+
    '<div id="tcm-body" style="flex:1;overflow:auto;padding:14px 18px;min-height:0;"></div>'+
  '</div>';
  document.body.appendChild(ov);
  tcMeterRenderStreams(tcid);
}
function tcMeterCfgClose(){ var ov=document.getElementById('tc-meter-ov'); if(ov)ov.remove(); }
function tcMeterPortsSet(tcid,v){ var tc=_tcm(tcid); if(!tc)return; var pp=String(v).split(',').map(function(x){return x.trim();}).filter(Boolean); if(!pp.length)pp=['1/1','1/2']; tc.meterCfg.ports=pp; (tc.meterCfg.streams||[]).forEach(function(s){ if(pp.indexOf(s.src)<0)s.src=pp[0]; if(pp.indexOf(s.dst)<0)s.dst=pp[1]||pp[0]; }); tcMeterRenderStreams(tcid); _tcMeterSave(tcid); }
function _meterPortOpts(ports,sel){ return ports.map(function(p){return '<option'+(p===sel?' selected':'')+'>'+p+'</option>';}).join(''); }
function tcMeterRenderStreams(tcid){ _tcmRenderStudio(tcid); }
function _tcmRenderStudio(tcid){
  var tc=_tcm(tcid); if(!tc)return; var mc=tc.meterCfg||{}; var ports=mc.ports||['1/1','1/2'];
  var esc=function(v){ return String(v==null?'':v).replace(/"/g,'&quot;'); };
  var lblS='font-size:12.5px;color:var(--text3);font-weight:700;margin-bottom:3px;';
  var inpS='width:100%;box-sizing:border-box;font-size:12.5px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;outline:none;';
  var fInp=function(i,s,f,label,wd){ return '<div style="min-width:'+(wd||110)+'px;"><div style="'+lblS+'">'+label+'</div><input value="'+esc(s[f])+'" data-mf="'+i+'-'+f+'" oninput="tcMeterFieldInput(this,\''+tcid+'\','+i+',\''+f+'\')" style="'+inpS+'"></div>'; };
  var fSel=function(i,s,f,label,opts,wd){ var o=opts.map(function(x){return '<option'+(String(s[f])===x?' selected':'')+'>'+x+'</option>';}).join(''); return '<div style="min-width:'+(wd||110)+'px;"><div style="'+lblS+'">'+label+'</div><select data-mf="'+i+'-'+f+'" onchange="tcMeterStreamSet(\''+tcid+'\','+i+',\''+f+'\',this.value)" style="'+inpS+'cursor:pointer;background:#fff;">'+o+'</select></div>'; };
  var fPsel=function(i,s,f,label){ return '<div style="min-width:120px;"><div style="'+lblS+'">'+label+'</div><select data-mf="'+i+'-'+f+'" onchange="tcMeterStreamSet(\''+tcid+'\','+i+',\''+f+'\',this.value)" style="'+inpS+'cursor:pointer;background:#fff;">'+_meterPortOpts(ports,s[f])+'</select></div>'; };
  var rw=function(h){ return '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">'+h+'</div>'; };
  var fMac=function(i,s,f,label,wd){ return '<div style="min-width:'+(wd||130)+'px;"><div style="'+lblS+'">'+label+'</div><input value="'+esc(s[f])+'" maxlength="17" data-mf="'+i+'-'+f+'" oninput="tcMeterMacInput(this,\''+tcid+'\','+i+',\''+f+'\')" style="'+inpS+'font-family:ui-monospace,monospace;"></div>'; };
  var fGrp=function(i,s,f,label,kind,wd){ var mod=s[f+'Mod']||'고정'; var seq=(mod==='증가'||mod==='감소'); var rnd=(mod==='랜덤'); var rng=(seq||rnd);
    if(seq){ var _n=(parseInt(s[f+'Step'],10)||0); var _st=(_n>0?_n-1:0)*(mod==='감소'?-1:1); s[f+'To']=_tcmIncr(s[f],_st); } else if(rnd&&!s[f+'To'])s[f+'To']=s[f];
    var mono=(kind==='mac'||kind==='ip')?'font-family:ui-monospace,monospace;':''; var mlen=(kind==='mac')?'maxlength="17" ':''; var hdlr=(kind==='mac')?'tcMeterMacInput':'tcMeterFieldInput';
    var ms=['고정','증가','감소','랜덤'].map(function(x){return '<option'+(mod===x?' selected':'')+'>'+x+'</option>';}).join('');
    var sub='font-size:10px;color:var(--text3);font-weight:700;margin-bottom:2px;';
    var col=function(lbl,inner,w){ return '<div style="'+(w?'width:'+w+'px;flex-shrink:0;':'flex:1;min-width:96px;')+'">'+(lbl?'<div style="'+sub+'">'+lbl+'</div>':'')+inner+'</div>'; };
    var fromIn='<input value="'+esc(s[f])+'" '+mlen+'data-mf="'+i+'-'+f+'" oninput="'+hdlr+'(this,\''+tcid+'\','+i+',\''+f+'\')'+(seq?';_tcmRecalcTo(\''+tcid+'\','+i+',\''+f+'\')':'')+'" style="'+inpS+mono+'">';
    var toIn=seq?('<input value="'+esc(s[f+'To'])+'" data-mf="'+i+'-'+f+'To" readonly title="From+Step 자동" style="'+inpS+mono+'background:#eef0f4;color:#5a6376;">'):('<input value="'+esc(s[f+'To'])+'" '+mlen+'data-mf="'+i+'-'+f+'To" oninput="'+hdlr+'(this,\''+tcid+'\','+i+',\''+f+'To\')" style="'+inpS+mono+'">');
    var stepIn='<input value="'+esc(s[f+'Step'])+'" data-mf="'+i+'-'+f+'Step" oninput="tcMeterFieldInput(this,\''+tcid+'\','+i+',\''+f+'Step\');_tcmRecalcTo(\''+tcid+'\','+i+',\''+f+'\')" style="'+inpS+'">';
    var modIn='<select data-mf="'+i+'-'+f+'Mod" onchange="tcMeterStreamSet(\''+tcid+'\','+i+',\''+f+'Mod\',this.value)" style="'+inpS+'cursor:pointer;background:#fff;">'+ms+'</select>';
    var cols=col(rng?'From':'',fromIn,rng?138:0)+(rng?col('To'+(seq?'(자동)':''),toIn,138):'')+(seq?col('Step',stepIn,58):'')+col('모드',modIn,80);
    return '<div style="border:1px solid #e7e2f3;border-radius:8px;padding:8px 9px;min-width:'+(rng?460:(wd||200))+'px;background:#fbfaff;"><div style="'+lblS+'">'+label+'</div><div style="display:flex;gap:7px;align-items:flex-end;">'+cols+'</div></div>'; };
  var ciB='font-size:12.5px;padding:4px 6px;box-sizing:border-box;outline:none;border-radius:4px;border:1px solid #e3e7ef;background:#fff;width:100%;';
  var tStop='onclick="event.stopPropagation();" onblur="this.style.borderColor=\'#e3e7ef\';"';
  var tFoc=function(i){ return 'onmousedown="tcMeterCellMouse(event,\''+tcid+'\','+i+')" onfocus="this.style.borderColor=\'#7c3aed\';tcMeterCellFocus(\''+tcid+'\','+i+',this)"'; };
  var tIn=function(i,s,f,w){ return '<input value="'+esc(s[f])+'" data-mf="'+i+'-'+f+'" '+tStop+' '+tFoc(i)+' oncontextmenu="tcMeterFillMenu(event,\''+tcid+'\','+i+',\''+f+'\')" oninput="tcMeterFieldInput(this,\''+tcid+'\','+i+',\''+f+'\')" onkeydown="tcMeterCellKey(event,this)" style="'+ciB+(w?'min-width:'+w+'px;':'')+'">'; };
  var tMac=function(i,s,f){ return '<input value="'+esc(s[f])+'" maxlength="17" data-mf="'+i+'-'+f+'" '+tStop+' '+tFoc(i)+' oncontextmenu="tcMeterFillMenu(event,\''+tcid+'\','+i+',\''+f+'\')" oninput="tcMeterMacInput(this,\''+tcid+'\','+i+',\''+f+'\')" onkeydown="tcMeterCellKey(event,this)" style="'+ciB+'min-width:140px;font-family:ui-monospace,monospace;">'; };
  var tSelP=function(i,s,f){ return '<select data-mf="'+i+'-'+f+'" '+tStop+' '+tFoc(i)+' oncontextmenu="tcMeterFillMenu(event,\''+tcid+'\','+i+',\''+f+'\')" onchange="tcMeterStreamSet(\''+tcid+'\','+i+',\''+f+'\',this.value)" style="'+ciB+'cursor:pointer;min-width:54px;">'+_meterPortOpts(ports,s[f])+'</select>'; };
  var tPkt=function(i,s){ var o=['IPv4/Ethernet','IPv6/Ethernet','BGP','ARP'].map(function(x){return '<option'+(s.packetType===x?' selected':'')+'>'+x+'</option>';}).join(''); return '<select data-mf="'+i+'-packetType" '+tStop+' '+tFoc(i)+' oncontextmenu="tcMeterFillMenu(event,\''+tcid+'\','+i+',\'packetType\')" onchange="tcMeterStreamSet(\''+tcid+'\','+i+',\'packetType\',this.value)" style="'+ciB+'cursor:pointer;min-width:122px;font-weight:700;color:#2d6fd4;">'+o+'</select>'; };
  var accSec=function(key,title,icon,open,body,right,afterTitle){ return '<div style="border:1px solid var(--border);border-radius:11px;overflow:hidden;margin-bottom:12px;background:#fff;">'+'<div onclick="tcMeterAccToggle(\''+tcid+'\',\''+key+'\')" style="display:flex;align-items:center;gap:8px;padding:9px 14px;cursor:pointer;background:linear-gradient(135deg,#faf8ff,#f3eefe);user-select:none;flex-wrap:wrap;"><i class="ti ti-chevron-'+(open?'down':'right')+'" style="font-size:16px;color:#7c3aed;"></i><i class="ti '+icon+'" style="font-size:15px;color:#7c3aed;"></i><b style="font-size:13px;color:#3a2a5e;">'+title+'</b>'+(afterTitle?'<span onclick="event.stopPropagation();" style="display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;margin-left:8px;">'+afterTitle+'</span>':'')+'<span style="flex:1;min-width:10px;"></span>'+(right||'')+'</div>'+(open?'<div style="padding:14px;">'+body+'</div>':'')+'</div>'; };
  var devs=_tcMeterDevList(); var cur=mc.deviceId||''; var dsel=null;
  for(var di=0;di<devs.length;di++){ if(devs[di].id===cur){ dsel=devs[di]; break; } }
  var devOpts='<option value="">(직접 입력 — 미선택)</option>'+devs.map(function(x){ var nm=(x.vendor?x.vendor+' · ':'')+(x.model||x.name||'(이름없음)')+(x.ip?(' · '+x.ip):''); return '<option value="'+x.id+'"'+(x.id===cur?' selected':'')+'>'+_bdEsc(nm)+'</option>'; }).join('');
  var st=(dsel&&dsel.status)||mc.devStatus||'미확인'; var stc=(st==='연결됨')?'#00a872':((st==='실패')?'#e53e5a':((st==='확인중')?'#f5b731':'#9aa0b8'));
  var roS='width:100%;box-sizing:border-box;font-size:12.5px;font-weight:700;padding:6px 9px;border:1px solid #e7e2f3;border-radius:6px;background:#f6f4fb;color:#1c2230;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
  var infoFld=function(label,val,field,mono){ var v=esc(val); if(dsel) return '<div style="min-width:130px;"><div style="'+lblS+'">'+label+'</div><div style="'+roS+(mono?'font-family:ui-monospace,monospace;':'')+'" title="'+v+'">'+_bdEsc(String(val||'-'))+'</div></div>'; return '<div style="min-width:130px;"><div style="'+lblS+'">'+label+'</div><input value="'+v+'" onchange="tcMeterInfoSet(\''+tcid+'\',\''+field+'\',this.value)" style="'+inpS+(mono?'font-family:ui-monospace,monospace;':'')+'"></div>'; };
  var infoBody=rw('<div style="width:300px;flex-shrink:0;"><div style="'+lblS+'">계측기 타입 (Device 관리)</div><select onchange="tcMeterDevPick(\''+tcid+'\',this.value)" style="'+inpS+'cursor:pointer;background:#fff;font-weight:700;color:#5b2db0;">'+devOpts+'</select></div>'
    +((/n2x|ixia/i.test(String((mc.vendor||'')+' '+(mc.model||''))))?('<div style="min-width:110px;"><div style="'+lblS+'">N2X 계정(label)</div><input value="'+esc(mc.n2xLabel||'utop')+'" onchange="tcMeterInfoSet(\''+tcid+'\',\'n2xLabel\',this.value)" style="'+inpS+'font-weight:700;color:#5b2db0;"></div>'):'')
    +'<div style="min-width:180px;flex:1;"><div style="'+lblS+'">시험 포트 (쉼표, 예: 4106/1,4106/2)</div><input value="'+esc((mc.ports||[]).join(','))+'" onblur="tcMeterPortsSet(\''+tcid+'\',this.value)" style="'+inpS+'font-family:ui-monospace,monospace;"></div>'
    +'<div style="min-width:80px;"><div style="'+lblS+'">연결 상태</div><div style="font-size:12px;font-weight:800;color:'+stc+';padding:5px 0;">● '+_bdEsc(st)+'</div></div>');
  var infoSec=accSec('info','기본 정보','ti-info-circle',(_tcmAcc.info!==false),infoBody,'');
  var LAYERS=[['l2','L2 Ethernet'],['l3','L3 IP'],['l4','L4 포트'],['traffic','트래픽'],['adv','고급 프로토콜']];
  var layerBody=function(i,s,layer){
    if(layer==='l2') return rw(fGrp(i,s,'srcMac','L2 Source MAC','mac',280)+fGrp(i,s,'dstMac','L2 Destination MAC','mac',280))+rw(fGrp(i,s,'vlan','VLAN ID','num',200)+fInp(i,s,'prio','Priority(802.1p)',110)+fSel(i,s,'etherType','Ether-Type',['0x0800','0x86DD','0x8100','0x0806'],110));
    if(layer==='l3') return rw(fGrp(i,s,'srcIp','L3 Source IP','ip',250)+fGrp(i,s,'dstIp','L3 Destination IP','ip',250))+rw(fInp(i,s,'gw','Gateway',120)+fInp(i,s,'dscp','DSCP',70)+fInp(i,s,'ttl','TTL',70)+fSel(i,s,'fragment','Fragment',['없음','DF','MF'],90))+'<div style="font-size:10px;color:#7c3aed;font-weight:800;margin:6px 0;">IPv6 확장</div>'+rw(fInp(i,s,'ipv6Src','IPv6 Src',150)+fInp(i,s,'ipv6Dst','IPv6 Dst',150));
    if(layer==='phy') return rw(fPsel(i,s,'src','Source 물리 포트')+fPsel(i,s,'dst','Destination 물리 포트')+fSel(i,s,'direction','방향',['단방향','양방향'],90)+fSel(i,s,'frameType','Frame 타입',['Ethernet II','802.3','SNAP'],110)+fSel(i,s,'packetType','Packet',['IPv4/Ethernet','IPv6/Ethernet','BGP','ARP'],130));
    if(layer==='l4') return rw(fSel(i,s,'l4proto','Protocol',['TCP','UDP','ICMP','없음'],120))+rw(fGrp(i,s,'srcPort','Source Port','num',220)+fGrp(i,s,'dstPort','Destination Port','num',220));
    if(layer==='traffic') return rw(fInp(i,s,'minByte','Byte (min)',85)+fInp(i,s,'maxByte','Byte (max)',85)+fSel(i,s,'byteType','Byte 패턴',['Fixed','Increment','Decrement','Random'],110)+fInp(i,s,'load','Load',75)+fSel(i,s,'unit','단위',['Percent(%)','Mbps','bps','Frames/sec(fps)'],120))+rw(fInp(i,s,'frameCnt','Frame 수 (0=무한)',120)+fInp(i,s,'burst','Burst 크기',95)+fInp(i,s,'gap','Gap (us)',85));
    var pen=function(field,plabel){ return '<label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:#00875a;cursor:pointer;margin-bottom:11px;"><input type="checkbox" '+(s[field]?'checked':'')+' onchange="tcMeterStreamSet(\''+tcid+'\','+i+',\''+field+'\',this.checked?1:0)" style="width:15px;height:15px;accent-color:#00a872;"> '+plabel+'</label>'; };
    if(layer==='bgp') return pen('bgpEn','BGP 활성화')+rw(fInp(i,s,'bgpLocalAs','Local AS',100)+fInp(i,s,'bgpPeerAs','Peer AS',100)+fInp(i,s,'bgpRouterId','Router ID',120)+fInp(i,s,'bgpPeerIp','Peer IP',120))+rw(fInp(i,s,'bgpHold','Hold(s)',90)+fInp(i,s,'bgpKeepalive','Keepalive(s)',105)+fInp(i,s,'bgpRoutes','광고 경로 수',110)+fInp(i,s,'bgpPrefix','Prefix',150));
    if(layer==='ospf') return pen('ospfEn','OSPF 활성화')+rw(fInp(i,s,'ospfArea','Area ID',110)+fInp(i,s,'ospfRouterId','Router ID',120)+fSel(i,s,'ospfNetType','네트워크 타입',['Broadcast','Point-to-Point','NBMA'],150))+rw(fInp(i,s,'ospfHello','Hello(s)',90)+fInp(i,s,'ospfDead','Dead(s)',90)+fInp(i,s,'ospfCost','Cost',80)+fInp(i,s,'ospfRoutes','광고 LSA 수',110));
    if(layer==='pim') return pen('pimEn','PIM 활성화')+rw(fSel(i,s,'pimMode','모드',['Sparse','Dense','Sparse-Dense'],120)+fInp(i,s,'pimRp','RP 주소',120)+fInp(i,s,'pimGroup','그룹 주소',120)+fInp(i,s,'pimHello','Hello(s)',90)+fInp(i,s,'pimJp','Join/Prune(s)',105));
    if(layer==='igmp') return pen('igmpEn','IGMP 활성화')+rw(fSel(i,s,'igmpVer','버전',['v2','v3','v1'],85)+fInp(i,s,'igmpGroup','그룹 주소',125)+fInp(i,s,'igmpSrc','소스 주소(v3)',125)+fInp(i,s,'igmpQuery','Query Interval(s)',125)+fInp(i,s,'igmpRobust','Robustness',95));
    return '';
  };
  var streams=mc.streams||[];
  if(_tcmSel>=streams.length)_tcmSel=streams.length-1; if(_tcmSel<0)_tcmSel=0;
  var btn='font-size:11px;font-weight:700;padding:5px 11px;border-radius:6px;cursor:pointer;';
  var chkIdx=[]; for(var ck=0;ck<streams.length;ck++){ if(_tcmChk[ck])chkIdx.push(ck); } var allChk=(streams.length>0&&chkIdx.length===streams.length);
  var streamActs='<button onclick="tcMeterAddStream(\''+tcid+'\')" style="'+btn+'border:1px solid #2d6fd4;background:#fff;color:#2d6fd4;"><i class="ti ti-plus"></i> 추가</button>'
    +'<button onclick="tcMeterCopyStream(\''+tcid+'\')" style="'+btn+'border:1px solid var(--border);background:#fff;color:#5a6376;"><i class="ti ti-copy"></i> 복사</button>'
    +'<button onclick="tcMeterRmStream(\''+tcid+'\')" style="'+btn+'border:1px solid #ecc9c9;background:#fff;color:#c0392b;"><i class="ti ti-trash"></i> 삭제</button>'
    +(chkIdx.length?'<span style="font-size:12px;font-weight:700;color:#7c3aed;background:#f3eefe;border-radius:7px;padding:3px 9px;">'+chkIdx.length+'개 선택</span>':'');
  var COLS=['SRC Port','DST Port','Stream Name','Stream.CNT','L2 Source','L2 Destination','L3 Source','L3 Destination','Gateway'];
  var thS='padding:6px 9px;font-size:12.5px;font-weight:800;color:#5a6376;background:#eef1f5;border-bottom:1px solid #d7dce3;text-align:left;white-space:nowrap;';
  var COLW={'Stream Name':230,'Stream.CNT':50,'SRC Port':92,'DST Port':92,'L2 Source':140,'L2 Destination':140};
  var thead='<tr><th style="'+thS+'width:32px;text-align:center;"><input type="checkbox" '+(allChk?'checked':'')+' onclick="tcMeterChkAll(\''+tcid+'\',this.checked)" title="전체 선택" style="width:15px;height:15px;cursor:pointer;accent-color:#7c3aed;"></th><th style="'+thS+'width:46px;text-align:center;">활성</th>'+COLS.map(function(h){ var w=COLW[h]; return '<th style="'+thS+(w?'width:'+w+'px;':'')+'">'+h+'</th>'; }).join('')+'</tr>';
  var trows=streams.map(function(s,i){ var on=(i===_tcmSel); var ckd=!!_tcmChk[i]; var tdS='padding:3px 5px;border-bottom:1px solid '+(on?'#9cc0ff':'#eef0f4')+';white-space:nowrap;vertical-align:middle;'+(on?'background:#d6e4ff;':(ckd?'background:#f7f4fd;':''));
    return '<tr onclick="tcMeterRowClick(event,\''+tcid+'\','+i+')" style="cursor:pointer;">'
      +'<td style="'+tdS+'text-align:center;'+(on?'box-shadow:inset 3px 0 0 #2d6fd4;':'')+'"><input type="checkbox" '+(ckd?'checked':'')+' onclick="event.stopPropagation();tcMeterChkToggle(\''+tcid+'\','+i+',this.checked)" style="width:15px;height:15px;cursor:pointer;accent-color:#7c3aed;"></td>'
      +'<td style="'+tdS+'text-align:center;"><input type="checkbox" '+(s.enabled!==false?'checked':'')+' onclick="event.stopPropagation();tcMeterStreamSet(\''+tcid+'\','+i+',\'enabled\',this.checked?1:0)" title="활성/비활성" style="width:16px;height:16px;cursor:pointer;accent-color:#00a872;"></td>'
      +'<td style="'+tdS+'">'+tSelP(i,s,'src')+'</td>'
      +'<td style="'+tdS+'">'+tSelP(i,s,'dst')+'</td>'
      +'<td style="'+tdS+'">'+tIn(i,s,'name',110)+'</td>'
      +'<td style="'+tdS+'">'+tIn(i,s,'count',34)+'</td>'
      +'<td style="'+tdS+'">'+tMac(i,s,'srcMac')+'</td>'
      +'<td style="'+tdS+'">'+tMac(i,s,'dstMac')+'</td>'
      +'<td style="'+tdS+'">'+tIn(i,s,'srcIp',72)+'</td>'
      +'<td style="'+tdS+'">'+tIn(i,s,'dstIp',72)+'</td>'
      +'<td style="'+tdS+'">'+tIn(i,s,'gw',78)+'</td>'
      +'</tr>';
  }).join('')||'<tr><td colspan="11" style="padding:14px;text-align:center;color:var(--text3);font-size:12.5px;">스트림이 없습니다. <b>추가</b>를 누르세요.</td></tr>';
  var table='<div style="overflow-x:auto;border:1px solid var(--border);border-radius:9px;"><table style="border-collapse:collapse;width:100%;min-width:960px;"><thead>'+thead+'</thead><tbody>'+trows+'</tbody></table></div><div style="font-size:11px;color:var(--text3);margin-top:5px;">행 클릭=선택 · <b>Ctrl+클릭=행 추가선택 · Shift+클릭=범위선택</b>(또는 체크박스) · 셀 수정=실시간 · Enter·↑↓←→=셀 이동 · 셀 우클릭=선택행 채우기/증가 · 활성 열=on/off</div>';
  var s=streams[_tcmSel]; var editor='';
  if(s){ var si=_tcmSel;
    var ETABS=[['phy','물리 포트 매핑'],['traffic','Traffic Load'],['l2','L2 Ethernet'],['l3','L3 IP'],['l4','L4 / 포트'],['pim','PIM'],['igmp','IGMP'],['ospf','OSPF'],['bgp','BGP']];
    var etabs='<div style="display:flex;gap:2px;border-bottom:1px solid var(--border);margin-bottom:13px;flex-wrap:wrap;">'+ETABS.map(function(t){ var onT=(_tcmTab===t[0]); var dot=s[t[0]+'En']?'<span style="color:#00a872;font-size:9px;vertical-align:middle;">● </span>':''; return '<div onclick="tcMeterSetTab(\''+tcid+'\',\''+t[0]+'\')" style="padding:7px 13px;font-size:12.5px;font-weight:700;cursor:pointer;border-bottom:2px solid '+(onT?'#7c3aed':'transparent')+';color:'+(onT?'#7c3aed':'var(--text3)')+';">'+dot+t[1]+'</div>'; }).join('')+'</div>';
    editor='<div style="border:1px solid #e3d9f7;border-radius:10px;padding:13px 15px;margin-top:13px;background:#fcfbff;">'
      +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;"><span style="width:9px;height:9px;border-radius:50%;background:'+((s.enabled===false)?'#cbd2dc':'#00a872')+';"></span><b data-edname="'+si+'" style="font-size:13px;color:#1c2230;">'+_bdEsc(s.name||('Stream_'+(si+1)))+'</b>'+_tcmPktBadge(s.packetType)+'<span style="font-size:12.5px;color:var(--text3);margin-left:2px;">— 속성 편집</span><span style="flex:1;"></span><span style="display:inline-flex;gap:3px;">'+_tcmProtoChips(s)+'</span></div>'
      +etabs+layerBody(si,s,_tcmTab)
      +'</div>';
  }
  var streamsBody=table+editor;
  var streamsSec=accSec('streams','스트림','ti-stack-2',(_tcmAcc.streams!==false),streamsBody,'<span style="font-size:12.5px;color:var(--text3);font-weight:700;">'+streams.length+'개</span>',streamActs);
  // ===== 측정 결과 (N2X Setup Measurements → Streams) =====
  var isN2X=/n2x|ixia/i.test(String(mc.vendor||'')+' '+String(mc.model||'')+' '+String((dsel&&dsel.vendor)||'')+' '+String((dsel&&dsel.model)||''));
  var stats=mc.stats||[]; var measBody;
  if(!isN2X){ measBody='<div style="color:var(--text3);font-size:12.5px;padding:14px;background:#fafbff;border:1px dashed var(--border);border-radius:8px;line-height:1.6;">측정 결과(Setup Measurements → Streams)는 <b>IXIA N2X</b> 계측기 전용입니다. 위 <b>기본 정보</b>에서 N2X 장비를 선택하면 표시됩니다.</div>'; }
  else {
    var MCOL=['Stream','Tx Test<br>Packets','Rx Test<br>Packets','Tx Test<br>Octets','Rx Test<br>Octets','Tx Throughput<br>(Mb/s)','Rx Throughput<br>(Mb/s)','Rx Packet<br>Loss','Avg Latency<br>(us)','Sequence<br>Errors'];
    var mth='<tr>'+MCOL.map(function(h){return '<th style="'+thS+'text-align:center;vertical-align:bottom;line-height:1.3;">'+h+'</th>';}).join('')+'</tr>';
    var mc2=function(v){ return '<td style="padding:5px 9px;font-size:12.5px;border-bottom:1px solid #eef0f4;white-space:nowrap;font-family:ui-monospace,monospace;color:#4a5266;text-align:right;">'+((v==null||v==='')?'—':_bdEsc(String(v)))+'</td>'; };
    var mrows=streams.map(function(s,i){ var stt=stats[i]||{}; var lbl=(s.src||'?')+'→'+(s.dst||'?')+', '+(s.name||('stream'+(i+1)));
      return '<tr><td style="padding:5px 9px;font-size:12.5px;border-bottom:1px solid #eef0f4;white-space:nowrap;font-family:ui-monospace,monospace;color:#1c2230;">'+_bdEsc(lbl)+'</td>'+mc2(stt.txPkts)+mc2(stt.rxPkts)+mc2(stt.txOct)+mc2(stt.rxOct)+mc2(stt.txTput)+mc2(stt.rxTput)+mc2(stt.loss)+mc2(stt.latency)+mc2(stt.seqErr)+'</tr>';
    }).join('')||'<tr><td colspan="10" style="padding:14px;text-align:center;color:var(--text3);font-size:12.5px;">스트림 없음</td></tr>';
    measBody='<div style="display:flex;align-items:center;gap:9px;margin-bottom:9px;"><button onclick="tcMeterMeasure(\''+tcid+'\')" style="font-size:12px;font-weight:700;padding:6px 13px;border-radius:6px;border:1px solid #00a872;background:#00a872;color:#fff;cursor:pointer;"><i class="ti ti-refresh"></i> 측정 조회</button>'+(mc.statsTime?'<span style="font-size:11px;color:var(--text3);">조회: '+_bdEsc(mc.statsTime)+'</span>':'<span style="font-size:11px;color:var(--text3);">[측정 조회]로 N2X Setup Measurements 값을 가져옵니다 (Tcl/REST 연동)</span>')+'</div>'
      +'<div style="overflow-x:auto;border:1px solid var(--border);border-radius:9px;"><table style="border-collapse:collapse;width:max-content;min-width:100%;"><thead>'+mth+'</thead><tbody>'+mrows+'</tbody></table></div>';
  }
  var measSec=accSec('meas','측정 결과 (N2X)','ti-chart-bar',(_tcmAcc.meas!==false),measBody,'');
  _tcmFill('tcm-body',infoSec+streamsSec+measSec);
}
function tcMeterMeasure(tcid){ var tc=_tcm(tcid); if(!tc)return; _tcmAcc.meas=true; tcMeterRenderStreams(tcid); if(typeof showToast==='function')showToast('N2X 측정 조회 — Tcl/REST 백엔드 연동 후 실제값이 표시됩니다'); }
// (구 _tcmRenderList/_tcmRenderEditor 제거 — 아코디언 단일 렌더 _tcmRenderStudio 로 대체됨)
function tcMeterStreamSet(tcid,i,f,v){ var tc=_tcm(tcid); if(!tc||!tc.meterCfg.streams[i])return; var nv=(v===1?true:(v===0?false:v)); tc.meterCfg.streams[i][f]=nv; _tcmMirror(i,f,nv); if(typeof f==='string'&&f.slice(-3)==='Mod'&&nv==='고정'){ var _b=f.slice(0,-3); tc.meterCfg.streams[i][_b+'To']=tc.meterCfg.streams[i][_b]; } if(f==='packetType'||f==='enabled'||f==='advProto'||(typeof f==='string'&&f.slice(-3)==='Mod')){ _tcmRenderStudio(tcid); } _tcMeterSave(tcid); }
function _tcmMirror(i,f,val){ var els=document.querySelectorAll('[data-mf="'+i+'-'+f+'"]'); for(var k=0;k<els.length;k++){ if(String(els[k].value)!==String(val))els[k].value=val; } if(f==='name'){ var nm=document.querySelectorAll('[data-edname="'+i+'"]'); for(var q=0;q<nm.length;q++)nm[q].textContent=val; } }
function tcMeterFieldInput(el,tcid,i,f){ var tc=_tcm(tcid); if(!tc||!tc.meterCfg.streams[i])return; tc.meterCfg.streams[i][f]=el.value; _tcmMirror(i,f,el.value); _tcMeterSave(tcid); }
function _tcmRecalcTo(tcid,i,f){ var tc=_tcm(tcid); if(!tc||!tc.meterCfg.streams[i])return; var st=tc.meterCfg.streams[i]; var mod=st[f+'Mod']; if(mod!=='증가'&&mod!=='감소')return; var _n=(parseInt(st[f+'Step'],10)||0); var step=(_n>0?_n-1:0)*(mod==='감소'?-1:1); var to=(typeof _tcmIncr==='function')?_tcmIncr(st[f],step):st[f]; st[f+'To']=to; _tcmMirror(i,f+'To',to); _tcMeterSave(tcid); }
function tcMeterCellFocus(tcid,i,el){ if(_tcmSel===i)return; _tcmSel=i; var mf=el&&el.getAttribute&&el.getAttribute('data-mf'); _tcmRenderStudio(tcid); if(mf){ var nx=document.querySelector('[data-mf="'+mf+'"]'); if(nx){ try{ nx.focus(); if(nx.select)nx.select(); }catch(e){} } } }
function _tcmRowSelect(tcid,i,ev){ if(ev&&(ev.ctrlKey||ev.metaKey)){ if(_tcmChk[i])delete _tcmChk[i]; else _tcmChk[i]=true; _tcmRenderStudio(tcid); return true; } if(ev&&ev.shiftKey){ var a=Math.min(_tcmSel,i),b=Math.max(_tcmSel,i); for(var k=a;k<=b;k++)_tcmChk[k]=true; _tcmRenderStudio(tcid); return true; } return false; }
function tcMeterCellMouse(ev,tcid,i){ if(ev.ctrlKey||ev.metaKey||ev.shiftKey){ ev.preventDefault(); ev.stopPropagation(); _tcmRowSelect(tcid,i,ev); } }
function tcMeterRowClick(ev,tcid,i){ if(_tcmRowSelect(tcid,i,ev))return; tcMeterSelStream(tcid,i); }
function tcMeterCellKey(ev,el){ var k=ev.key; if(['Enter','ArrowDown','ArrowUp','ArrowLeft','ArrowRight'].indexOf(k)<0)return; var mf=el.getAttribute('data-mf'); if(!mf)return; var d=mf.indexOf('-'); if(d<0)return; var i=parseInt(mf.slice(0,d),10); var f=mf.slice(d+1);
  var COLF=['src','dst','name','count','srcMac','dstMac','srcIp','dstIp','gw']; var ci=COLF.indexOf(f);
  if(k==='ArrowLeft'&&(el.selectionStart!==0||el.selectionEnd!==0))return;
  if(k==='ArrowRight'&&el.value&&el.selectionStart!==el.value.length)return;
  var ti=i, tf=f;
  if(k==='Enter'||k==='ArrowDown')ti=i+1; else if(k==='ArrowUp')ti=i-1;
  else if(k==='ArrowLeft'){ if(ci<=0)return; tf=COLF[ci-1]; } else if(k==='ArrowRight'){ if(ci<0||ci>=COLF.length-1)return; tf=COLF[ci+1]; }
  if(ti<0)return; var nx=document.querySelector('[data-mf="'+ti+'-'+tf+'"]'); if(nx){ ev.preventDefault(); nx.focus(); if(nx.select)try{nx.select();}catch(e){} } }
function tcMeterSelStream(tcid,i){ _tcmSel=i; _tcmRenderStudio(tcid); }
function tcMeterSetTab(tcid,t){ _tcmTab=t; _tcmRenderStudio(tcid); }
function tcMeterChkToggle(tcid,i,checked){ if(checked)_tcmChk[i]=true; else delete _tcmChk[i]; _tcmRenderStudio(tcid); }
function tcMeterChkAll(tcid,checked){ var tc=_tcm(tcid); if(!tc)return; _tcmChk={}; if(checked)(tc.meterCfg.streams||[]).forEach(function(s,i){ _tcmChk[i]=true; }); _tcmRenderStudio(tcid); }
function _tcmChkIdx(arr){ var out=[]; for(var k=0;k<arr.length;k++){ if(_tcmChk[k])out.push(k); } return out; }function _tcmMacFmt(v){ var h=String(v).replace(/[^0-9a-fA-F]/g,'').slice(0,12); var o=[]; for(var i=0;i<h.length;i+=2)o.push(h.slice(i,i+2)); return o.join(':'); }
function tcMeterMacInput(el,tcid,i,f){ var pos=el.selectionStart; var atEnd=(pos===el.value.length);
  if(atEnd){ el.value=_tcmMacFmt(el.value); try{ el.setSelectionRange(el.value.length,el.value.length); }catch(e){} }
  else { var cl=el.value.replace(/[^0-9a-fA-F:]/g,''); if(cl!==el.value){ var dp=el.value.length-cl.length; el.value=cl; try{ el.setSelectionRange(Math.max(0,pos-dp),Math.max(0,pos-dp)); }catch(e){} } }
  var tc=_tcm(tcid); if(tc&&tc.meterCfg&&tc.meterCfg.streams[i]){ tc.meterCfg.streams[i][f]=el.value; _tcmMirror(i,f,el.value); _tcMeterSave(tcid); } }
function _tcMeterCloseFillMenu(){ var m=document.getElementById('tcm-fill-menu'); if(m)m.remove(); }
function _tcmIncr(v,step){ v=String(v==null?'':v);
  if(/^[0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5}$/.test(v)){ var num=parseInt(v.replace(/:/g,''),16)+step; if(num<0)num=0; var h=('000000000000'+num.toString(16)).slice(-12); var o=[]; for(var a=0;a<12;a+=2)o.push(h.slice(a,a+2)); return o.join(':'); }
  if(/^\d{1,3}(\.\d{1,3}){3}$/.test(v)){ var p=v.split('.').map(Number); var ipn=(((p[0]<<24)>>>0)+(p[1]<<16)+(p[2]<<8)+p[3]+step)>>>0; return [(ipn>>>24)&255,(ipn>>>16)&255,(ipn>>>8)&255,ipn&255].join('.'); }
  var pm=v.match(/^(\d+)\/(\d+)$/); if(pm){ var pp=parseInt(pm[2],10)+step; if(pp<0)pp=0; return pm[1]+'/'+pp; }
  var tm=v.match(/^(.*?)(\d+)$/); if(tm){ var w=tm[2].length, nn=parseInt(tm[2],10)+step; if(nn<0)nn=0; var s=String(nn); while(s.length<w)s='0'+s; return tm[1]+s; }
  return v;
}
function tcMeterFillMenu(ev,tcid,i,f){ ev.preventDefault(); ev.stopPropagation(); _tcMeterCloseFillMenu();
  var m=document.createElement('div'); m.id='tcm-fill-menu';
  m.style.cssText='position:fixed;z-index:100001;background:#fff;border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.18);padding:4px;font-size:12.5px;';
  var it='padding:8px 12px;cursor:pointer;border-radius:6px;display:flex;align-items:center;gap:8px;white-space:nowrap;';
  m.innerHTML='<div onclick="tcMeterFillDown(\''+tcid+'\','+i+',\''+f+'\')" style="'+it+'" onmouseenter="this.style.background=\'#f3eefe\'" onmouseleave="this.style.background=\'transparent\'"><i class="ti ti-arrow-bar-to-down" style="color:#7c3aed;"></i> 이 값을 아래로 채우기</div>'
    +'<div onclick="tcMeterFillIncr(\''+tcid+'\','+i+',\''+f+'\')" style="'+it+'" onmouseenter="this.style.background=\'#f3eefe\'" onmouseleave="this.style.background=\'transparent\'"><i class="ti ti-sort-ascending-2" style="color:#7c3aed;"></i> 이 값을 증가시키기 (아래로 +1)</div>';
  document.body.appendChild(m);
  var mw=m.offsetWidth, mh=m.offsetHeight;
  var r=(ev.target&&ev.target.getBoundingClientRect)?ev.target.getBoundingClientRect():null;
  var x,y;
  if(r){ x=r.right+5; y=r.top; if(x+mw>window.innerWidth-8)x=Math.max(8,r.left-mw-5); }
  else { x=ev.clientX+6; y=ev.clientY; if(x+mw>window.innerWidth-8)x=Math.max(8,ev.clientX-mw-6); }
  if(y+mh>window.innerHeight-8)y=Math.max(8,window.innerHeight-mh-8);
  m.style.left=x+'px'; m.style.top=y+'px';
  setTimeout(function(){ document.addEventListener('click',_tcMeterCloseFillMenu,{once:true}); document.addEventListener('contextmenu',_tcMeterCloseFillMenu,{once:true}); },0);
}
function tcMeterFillDown(tcid,i,f){ _tcMeterCloseFillMenu(); var tc=_tcm(tcid); if(!tc)return; var arr=tc.meterCfg.streams||[]; var sel=_tcmChkIdx(arr); var n=0,v;
  if(sel.length){ v=arr[sel[0]][f]; for(var a=0;a<sel.length;a++){ arr[sel[a]][f]=v; n++; } }
  else { if(!arr[i])return; v=arr[i][f]; for(var k=i+1;k<arr.length;k++){ arr[k][f]=v; n++; } }
  tcMeterRenderStreams(tcid); _tcMeterSave(tcid); if(typeof showToast==='function')showToast('아래로 채움: '+n+'개'+(sel.length?' (선택)':'')); }
function tcMeterFillIncr(tcid,i,f){ _tcMeterCloseFillMenu(); var tc=_tcm(tcid); if(!tc)return; var arr=tc.meterCfg.streams||[]; var sel=_tcmChkIdx(arr); var n=0,base;
  if(sel.length){ base=arr[sel[0]][f]; for(var a=0;a<sel.length;a++){ arr[sel[a]][f]=_tcmIncr(base,a); n++; } }
  else { if(!arr[i])return; base=arr[i][f]; for(var k=i+1;k<arr.length;k++){ arr[k][f]=_tcmIncr(base,k-i); n++; } }
  tcMeterRenderStreams(tcid); _tcMeterSave(tcid); if(typeof showToast==='function')showToast('증가 채움: '+n+'개'+(sel.length?' (선택)':'')); }
function tcMeterAccToggle(tcid,key){ _tcmAcc[key]=(_tcmAcc[key]===false); _tcmRenderStudio(tcid); }function tcMeterInfoSet(tcid,f,v){ var tc=_tcm(tcid); if(!tc)return; if(!tc.meterCfg)tc.meterCfg={}; tc.meterCfg[f]=String(v); _tcMeterSave(tcid); }function tcMeterCopyStream(tcid,i){ var tc=_tcm(tcid); if(!tc)return; var arr=tc.meterCfg.streams; var sel=_tcmChkIdx(arr); if(sel.length){ var cps=sel.map(function(k){ var c=JSON.parse(JSON.stringify(arr[k])); c.name=(arr[k].name||'Stream')+'_copy'; return c; }); for(var q=0;q<cps.length;q++)arr.push(cps[q]); _tcmChk={}; tcMeterRenderStreams(tcid); _tcMeterSave(tcid); if(typeof showToast==='function')showToast('복사: '+cps.length+'개'); return; } if(i==null)i=_tcmSel; var s=arr[i]; if(!s)return; var c=JSON.parse(JSON.stringify(s)); c.name=(s.name||'Stream')+'_copy'; arr.splice(i+1,0,c); _tcmSel=i+1; tcMeterRenderStreams(tcid); _tcMeterSave(tcid); if(typeof showToast==='function')showToast('스트림 복사: '+c.name); }
function tcMeterAddStream(tcid){ var tc=_tcm(tcid); if(!tc)return; var p=tc.meterCfg.ports||['1/1','1/2']; tc.meterCfg.streams.push(_meterNewStream(tc.meterCfg.streams.length+1,p[0],p[1]||p[0])); _tcmSel=tc.meterCfg.streams.length-1; tcMeterRenderStreams(tcid); _tcMeterSave(tcid); }
function tcMeterRmStream(tcid,i){ var tc=_tcm(tcid); if(!tc)return; var arr=tc.meterCfg.streams; var sel=_tcmChkIdx(arr); if(sel.length){ if(arr.length-sel.length<1){ if(typeof showToast==='function')showToast('최소 1개 스트림은 남겨야 합니다'); return; } sel.sort(function(a,b){return b-a;}).forEach(function(k){ arr.splice(k,1); }); _tcmChk={}; _tcmSel=Math.max(0,Math.min(_tcmSel,arr.length-1)); tcMeterRenderStreams(tcid); _tcMeterSave(tcid); if(typeof showToast==='function')showToast('삭제: '+sel.length+'개'); return; } if(i==null||i<0)i=_tcmSel; if(arr.length<=1){ if(typeof showToast==='function')showToast('스트림이 1개라 삭제할 수 없습니다'); return; } arr.splice(i,1); _tcmSel=Math.max(0,Math.min(_tcmSel,arr.length-1)); tcMeterRenderStreams(tcid); _tcMeterSave(tcid); }
function _meterGwMac(gw){ var o=String(gw||'0.0.0.1').split('.'); function h(x){return ('0'+(parseInt(x||'0',10)%256).toString(16)).slice(-2);} return '00:00:00:'+h(o[1])+':'+h(o[2])+':'+h(o[3]); }
function tcMeterArp(tcid){ var tc=_tcm(tcid); if(!tc)return; (tc.meterCfg.streams||[]).forEach(function(s){ s.dstMac=_meterGwMac(s.gw); }); tcMeterRenderStreams(tcid); _tcMeterSave(tcid); if(typeof showToast==='function')showToast('ARP 해석: 모든 스트림 Dst_Mac = Gateway MAC'); }
function _n2xFetch(url,opts,ms){ var ac=(typeof AbortController!=='undefined')?new AbortController():null; var to=ac?setTimeout(function(){try{ac.abort();}catch(e){}}, ms||60000):0; opts=opts||{}; if(ac)opts.signal=ac.signal; return fetch(url,opts).then(function(r){clearTimeout(to);return r;},function(e){clearTimeout(to);throw ((e&&e.name==='AbortError')?new Error('시간 초과('+Math.round((ms||60000)/1000)+'s) — 데몬 응답 없음'):e);}); }
async function tcMeterConnect(tcid,force){ var tc=_tcm(tcid); if(!tc)return; var cfg=tc.meterCfg||{}; var isN2X=/n2x|ixia/i.test(String((cfg.vendor||'')+' '+(cfg.model||''))); var box=function(h){ _tcmFill('tcm-conn','<div style="font-size:12px;padding:9px 12px;border:1px solid #e3d9f7;border-radius:9px;background:#fbfaff;line-height:1.7;font-family:ui-monospace,monospace;">'+h+'</div>'); }; box('⏳ '+(force?'강제 ':'')+'연결/예약 확인 중...');
  try{
    if(isN2X){ var server=cfg.chassis||'210.1.2.248', label=cfg.n2xLabel||'utop';
      var pr=await (await _n2xFetch('/api/n2x/ping?server='+encodeURIComponent(server)+'&label='+encodeURIComponent(label),{},55000)).json();
      if(!pr||!pr.ok){ box('<b style="color:#e53e5a;">✖ N2X 연결 실패</b> · '+_bdEsc(String((pr&&pr.error)||'응답 없음'))); return; }
      var pz=_n2xStreamPorts(cfg); var rows=[];
      for(var q=0;q<pz.length;q++){ var rr=null; try{ rr=await (await _n2xFetch('/api/n2x/reserve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({server:server,label:label,module:pz[q].module,ports:[pz[q].port],force:!!force})},75000)).json(); }catch(e){ rr={ok:false,error:e.message}; } rows.push((rr&&rr.ok?'<span style="color:#00a872;">✔</span> ':'<span style="color:#e53e5a;">✖</span> ')+pz[q].module+'/'+pz[q].port+(rr&&rr.ok?' 예약됨':' <b style="color:#e53e5a;">실패: '+_bdEsc(String((rr&&(rr.error||rr.text))||'응답 없음'))+'</b>')); }
      box('<b style="color:#00a872;">● N2X 연결됨</b> ('+_bdEsc(server)+' · label '+_bdEsc(label)+')<br>'+(pz.length?('— 포트 예약 —<br>'+rows.join('<br>')):'예약할 포트 없음 — 스트림 SRC/DST Port를 4106/1 형식으로 지정하세요'));
    } else { var cc=await (await fetch('/api/stc/conncheck',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chassis:cfg.chassis,restPort:cfg.restPort})})).json(); box((cc&&cc.ok)?('<b style="color:#00a872;">● STC 연결 확인됨</b> ('+_bdEsc(cfg.chassis||'')+')'):('<b style="color:#e53e5a;">✖ STC 연결 실패</b> · '+_bdEsc(String((cc&&cc.error)||'응답 없음')))); }
  }catch(e){ box('<b style="color:#e53e5a;">✖ 요청 오류</b> · '+_bdEsc(e.message)); }
}
function tcMeterCfgSave(tcid){
  var tc=_tcm(tcid); if(!tc)return;
  var ch=document.getElementById('tcm-chassis'); if(ch)tc.meterCfg.chassis=ch.value.trim();
  if(typeof saveTCFile==='function'){ saveTCFile(tc).then(function(){ if(typeof showToast==='function')showToast('계측기 설정 저장됨'); }).catch(function(){}); }
  tcMeterCfgClose();
}

// ══════════ 장비 등록 — 엑셀 표(간편 등록) ══════════
function renderDeviceTable(){
  var el=document.getElementById('device-reg-detail'); if(!el)return;
  var _tr=document.getElementById('device-reg-tree'); if(_tr)_tr.style.display='none';   // 트리 제거(전체폭)
  if(_devKind==='summary'){ el.innerHTML=_devSummaryView(); return; }   // Summary 탭 = 차트 요약
  var roleOpts=function(sel){ return DEVICE_ROLES.map(function(r){return '<option'+(sel===r?' selected':'')+'>'+r+'</option>';}).join(''); };
  var protoOpts=function(sel){ return ['telnet','ssh','snmp','rest','tcl'].map(function(p){return '<option value="'+p+'"'+(sel===p?' selected':'')+'>'+p.toUpperCase()+'</option>';}).join(''); };
  var assetOpts=function(sel){ return ['','BMT','자산이관','자산구매','무상임대'].map(function(a){return '<option value="'+a+'"'+(sel===a?' selected':'')+'>'+(a||'-')+'</option>';}).join(''); };
  var deptOpts=function(sel){ return ['','PA1','PA2','QA'].map(function(a){return '<option value="'+a+'"'+(sel===a?' selected':'')+'>'+(a||'-')+'</option>';}).join(''); };
  // Vendor 목록 = 등록된 벤더(vendorList) + 표에 이미 쓰인 벤더 보강
  var venNames=(typeof vendorList!=='undefined'&&vendorList)?vendorList.map(function(v){return (v&&v.name)||v;}).filter(Boolean):[];
  deviceList.forEach(function(d){ if(d.vendor && venNames.indexOf(d.vendor)<0) venNames.push(d.vendor); });
  var vendorOpts=function(sel){ return '<option value="">(선택)</option>'+venNames.map(function(v){return '<option'+(sel===v?' selected':'')+'>'+String(v).replace(/</g,'&lt;')+'</option>';}).join(''); };
  // 모델명 목록 = 등록된 모델(modelList) + 표에 이미 쓰인 모델 보강
  var mdlNames=(typeof modelList!=='undefined'&&modelList)?modelList.map(function(m){return (m&&m.name)||m;}).filter(Boolean):[];
  deviceList.forEach(function(d){ if(d.name && mdlNames.indexOf(d.name)<0) mdlNames.push(d.name); });
  var modelOpts=function(sel){ return '<option value="">(선택)</option>'+mdlNames.map(function(v){return '<option'+(sel===v?' selected':'')+'>'+String(v).replace(/</g,'&lt;')+'</option>';}).join(''); };
  // Lab 목록 = ITMS(랙)에 등록된 Lab(labLabs) + 표에 이미 쓰인 Lab 보강. labLabs 미로딩 시 1회 로드 후 재렌더.
  if((typeof labLabs==='undefined'||!labLabs||!labLabs.length) && typeof loadRacks==='function' && !window._devLabsTried){ window._devLabsTried=true; try{ Promise.resolve(loadRacks()).then(function(){ renderDeviceTable(); }); }catch(e){} }
  var _labNames=(typeof labLabs!=='undefined'&&labLabs)?labLabs.map(function(l){return (l&&l.name)||l;}).filter(Boolean):[];
  deviceList.forEach(function(d){ if(d.lab && _labNames.indexOf(d.lab)<0) _labNames.push(d.lab); });
  var labOpts=function(sel){ return '<option value="">(선택)</option>'+_labNames.map(function(v){return '<option'+(sel===v?' selected':'')+'>'+String(v).replace(/</g,'&lt;')+'</option>';}).join(''); };
  var _isInst=(_devKind==='instrument');
  // 섹션별 카운트(탭 배지)
  var _cntInst=0; deviceList.forEach(function(d){ if(_isInstrument(d))_cntInst++; }); var _cntDev=deviceList.length-_cntInst;
  // 장비 Lab별 실장 현황 칩
  var _labCnt={}, _noLabCnt=0; deviceList.forEach(function(d){ if(_isInstrument(d))return; var lb=String(d.lab||'').trim(); if(lb){_labCnt[lb]=(_labCnt[lb]||0)+1;} else _noLabCnt++; });
  var _labOrder=(typeof labLabs!=='undefined'&&labLabs)?labLabs.map(function(l){return (l&&l.name)||l;}).filter(Boolean):[];
  Object.keys(_labCnt).forEach(function(lb){ if(_labOrder.indexOf(lb)<0) _labOrder.push(lb); });
  var _labChip=function(label,val,cnt,active){ return '<button onclick="devLabSel(\''+String(val).replace(/\\/g,'\\\\').replace(/'/g,"\\'")+'\')" title="'+String(label).replace(/"/g,'&quot;')+' '+cnt+'대" style="font-size:12px;font-weight:700;padding:5px 12px;border-radius:16px;border:1px solid '+(active?'#2d6fd4':'var(--border)')+';background:'+(active?'#2d6fd4':'#fff')+';color:'+(active?'#fff':'var(--text2)')+';cursor:pointer;white-space:nowrap;">'+String(label).replace(/</g,'&lt;')+' <b style="'+(active?'':'color:#2d6fd4;')+'">'+cnt+'</b></button>'; };
  var _labChips='<div style="display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin-bottom:12px;"><span style="font-size:11.5px;font-weight:800;color:var(--text3);"><i class="ti ti-building"></i> Lab별 실장:</span>'
    +_labChip('전체','',_cntDev,_devLabSel==='')
    +_labOrder.map(function(lb){ return _labChip(lb,lb,_labCnt[lb]||0,_devLabSel===lb); }).join('')
    +(_noLabCnt?_labChip('미배치','__none__',_noLabCnt,_devLabSel==='__none__'):'')
    +'</div>';
  var COLS=_isInst
    ? [['',34,null],['No.',36,null],['Vendor',110,'vendor'],['제품군',92,'role'],['모델',150,'name'],['Lab',90,'lab'],['서버 IP',120,null],['연결방식',66,null],['계정',96,null],['U',30,null],['전력(W)',48,null],['MAC',94,null],['시리얼',72,null],['자산여부',70,'asset'],['관리부서',62,'dept'],['상태',86,null],['비고',180,null]]
    : [['',34,null],['No.',36,null],['Vendor',78,'vendor'],['제품군',76,'role'],['모델명',108,'name'],['Lab',70,'lab'],['IP',86,null],['연결방식',62,null],['상태',52,null],['ID',56,null],['PW',56,null],['Enable',60,null],['U',30,null],['전력(W)',48,null],['시리얼',72,null],['MAC',94,null],['자산여부',70,'asset'],['관리부서',62,'dept'],['비고',150,null]];
  function tin(i,f,t){ var dv=deviceList[i][f]; return '<td oncontextmenu="devTblCtx(event,'+i+',\''+f+'\')"><input '+(t==='pw'?'type="password" ':(t==='num'?'type="number" ':''))+'value="'+String(dv==null?'':dv).replace(/"/g,'&quot;')+'" onchange="devTblSet('+i+',\''+f+'\',this.value)" onkeydown="devTblNav(event,this)"></td>'; }
  function tsel(i,f,opts){ return '<td oncontextmenu="devTblCtx(event,'+i+',\''+f+'\')"><select onchange="devTblSet('+i+',\''+f+'\',this.value)" onkeydown="devTblNav(event,this)">'+opts+'</select></td>'; }
  var _distinct=function(field){ var s={}, out=[]; deviceList.forEach(function(d){ if(_isInstrument(d)!==_isInst)return; var v=String(d[field]==null?'':d[field]); if(v!==''&&!s[v]){ s[v]=1; out.push(v); } }); out.sort(function(a,b){return String(a).localeCompare(String(b),undefined,{numeric:true});}); return out; };
  var head='<tr>'+COLS.map(function(c,ci){ var _f=c[2]; var _inner; if(ci===0){ _inner='<input type="checkbox" onchange="devTblSelAll(this.checked)" title="현재 표시 전체 선택" style="cursor:pointer;">'; } else if(_f){ var _cur=String(_devTblFilter[_f]||''); var _active=(_cur!==''); _inner='<div onclick="devFltOpen(event,\''+_f+'\')" title="'+_f+' 필터 (머리글 클릭)'+(_active?(': '+String(_cur).replace(/"/g,'&quot;')):'')+'" style="display:flex;align-items:center;justify-content:center;gap:4px;white-space:nowrap;cursor:pointer;padding:3px 2px;">'+c[0]+'<i class="ti ti-caret-down-filled" style="font-size:15px;color:'+(_active?'#ffd84d':'#fff')+';"></i></div>'; } else { _inner=c[0]; } return '<th style="width:'+c[1]+'px;">'+_inner+'</th>'; }).join('')+'</tr>';
  // 1) 필터 통과 인덱스 수집
  var _filtIdx=[];
  deviceList.forEach(function(d,i){
    if(_devTblSearch){ var _q=String(_devTblSearch).toLowerCase(); var _hay=[d.hostname,d.name,d.vendor,d.role,d.lab,d.ip,d.protocol,d.username,d.serial,d.mac,d.status,d.asset,d.dept,d.note,d.port].map(function(x){return String(x==null?'':x);}).join(' ').toLowerCase(); if(_hay.indexOf(_q)<0) return; }
    for(var _ff in _devTblFilter){ var _fv=String(_devTblFilter[_ff]==null?'':_devTblFilter[_ff]); if(_fv!=='' && String(d[_ff]==null?'':d[_ff])!==_fv){ return; } }
    if(_isInstrument(d)!==_isInst) return;   // 섹션(장비/계측기) 분리
    if(!_isInst && _devLabSel){ if(_devLabSel==='__none__'){ if(String(d.lab||'').trim()) return; } else if(String(d.lab||'').trim()!==_devLabSel){ return; } }   // Lab별 분류
    _filtIdx.push(i);
  });
  if(_devSort){ var _cmpF=function(da,db,f){ return String(da[f]==null?'':da[f]).localeCompare(String(db[f]==null?'':db[f]),undefined,{numeric:true,sensitivity:'base'}); }; var _sk=[_devSort,_devSort2,_devSort3,_devSort4].filter(Boolean); _filtIdx.sort(function(a,b){ for(var _k=0;_k<_sk.length;_k++){ var r=_cmpF(deviceList[a],deviceList[b],_sk[_k]); if(r!==0)return r; } return 0; }); }   // 다단 정렬(1~4순위)
  window._devTblShownIds=_filtIdx.map(function(i){return deviceList[i].id;});  // 전체선택 대상
  var _devSelN=Object.keys(_devTblSel).filter(function(k){return _devTblSel[k];}).length;
  var shown=_filtIdx.length;
  // 2) 페이지 계산
  var _ps=(_devTblPageSize==='all')?(shown||1):_devTblPageSize;
  var _totalPages=Math.max(1,Math.ceil(shown/_ps));
  if(_devTblPage>_totalPages)_devTblPage=_totalPages; if(_devTblPage<1)_devTblPage=1;
  var _startN=(_devTblPageSize==='all')?0:(_devTblPage-1)*_ps;
  var _pageIdx=(_devTblPageSize==='all')?_filtIdx:_filtIdx.slice(_startN,_startN+_ps);
  // 3) 현재 페이지 행 생성
  var rows=_pageIdx.map(function(i,vi){
    var d=deviceList[i]; var rowNo=_startN+vi+1;
    var stMap={'연결됨':['#0a7a52','#e7f6ef','연결됨'],'connected':['#0a7a52','#e7f6ef','연결됨'],'실패':['#c0414f','#fdeeef','실패'],'확인중':['#b8860b','#fff7e6','확인중']};
    var st=stMap[d.status]||['#8a93a4','#f0f2f5','미확인'];
    var _stBadge='<td style="text-align:center;"><span style="font-size:10px;font-weight:800;color:'+st[0]+';background:'+st[1]+';border-radius:10px;padding:2px 8px;white-space:nowrap;">'+st[2]+'</span></td>';
    var _testBtn='<td style="text-align:center;"><button class="dtbl-btn" onclick="deviceTest(\''+d.id+'\')">확인</button></td>';
    var _connOk=(d.status==='연결됨'||d.status==='connected'); var _connChk=(d.status==='확인중');
    var _connCol=_connChk?'#b8860b':(_connOk?'#0a7a52':'#8a93a4'); var _connBg=_connChk?'#fff7e6':(_connOk?'#e7f6ef':'#f3f4f6');
    var _connTxt=_connChk?'확인중':(_connOk?'활성':'비활성');
    var _connTd='<td style="text-align:center;"><button onclick="deviceTest(\''+d.id+'\')" title="클릭 → 연결 확인(활성 시 녹색)" style="font-size:10.5px;font-weight:800;color:'+_connCol+';background:'+_connBg+';border:1px solid '+_connCol+'55;border-radius:11px;padding:3px 13px;cursor:pointer;white-space:nowrap;">'+_connTxt+'</button></td>';
    var _chkTd='<td style="text-align:center;"><input type="checkbox" '+(_devTblSel[d.id]?'checked':'')+' onchange="devTblSelToggle(\''+d.id+'\',this.checked)" style="cursor:pointer;"></td>';
    var _rowNoTd='<td style="text-align:center;color:#8a93a4;font-size:10.5px;font-weight:700;background:#f7f9fc;">'+rowNo+'</td>';
    if(_isInst){
      return '<tr>'+_chkTd+_rowNoTd+
        tsel(i,'vendor',vendorOpts(d.vendor))+tsel(i,'role',roleOpts(d.role))+tsel(i,'name',modelOpts(d.name))+tsel(i,'lab',labOpts(d.lab))+
        tin(i,'ip','')+tsel(i,'protocol',protoOpts(d.protocol))+tin(i,'username','')+
        tin(i,'rack_units','num')+tin(i,'power','num')+tin(i,'mac','')+tin(i,'serial','')+tsel(i,'asset',assetOpts(d.asset))+tsel(i,'dept',deptOpts(d.dept))+
        _connTd+tin(i,'note','')+
      '</tr>';
    }
    return '<tr>'+_chkTd+_rowNoTd+
      tsel(i,'vendor',vendorOpts(d.vendor))+tsel(i,'role',roleOpts(d.role))+tsel(i,'name',modelOpts(d.name))+tsel(i,'lab',labOpts(d.lab))+
      tin(i,'ip','')+tsel(i,'protocol',protoOpts(d.protocol))+_connTd+
      tin(i,'username','')+tin(i,'password','')+tin(i,'secret','')+
      tin(i,'rack_units','num')+tin(i,'power','num')+tin(i,'serial','')+tin(i,'mac','')+
      tsel(i,'asset',assetOpts(d.asset))+tsel(i,'dept',deptOpts(d.dept))+tin(i,'note','')+
    '</tr>';
  }).join('');
  var _vlist=[]; deviceList.forEach(function(d){ if(d.vendor && _vlist.indexOf(d.vendor)<0) _vlist.push(d.vendor); });
  var vFilt='<option value="">전체 Vendor</option>'+_vlist.map(function(v){return '<option'+(_devTblFilter.vendor===v?' selected':'')+'>'+String(v).replace(/</g,'&lt;')+'</option>';}).join('');
  var rFilt='<option value="">전체 제품군</option>'+DEVICE_ROLES.map(function(r){return '<option'+(_devTblFilter.role===r?' selected':'')+'>'+r+'</option>';}).join('');
  var _mlist=[]; deviceList.forEach(function(d){ if(d.name && _mlist.indexOf(d.name)<0) _mlist.push(d.name); });
  var mFilt='<option value="">전체 모델명</option>'+_mlist.map(function(v){return '<option'+(_devTblFilter.name===v?' selected':'')+'>'+String(v).replace(/</g,'&lt;')+'</option>';}).join('');
  var aFilt='<option value="">전체 자산여부</option>'+['BMT','자산이관','자산구매','무상임대'].map(function(v){return '<option'+(_devTblFilter.asset===v?' selected':'')+'>'+v+'</option>';}).join('');
  var filtered=!!_devTblSearch || Object.keys(_devTblFilter).some(function(k){return String(_devTblFilter[k]||'').trim();});
  // 페이지 컨트롤(표 우측 아래)
  var _psSel='<select class="dtbl-sel" style="padding:4px 7px;font-size:11.5px;" onchange="devTblPageSizeSet(this.value)">'+
    [10,20,50,100].map(function(n){return '<option value="'+n+'"'+(_devTblPageSize===n?' selected':'')+'>'+n+'개</option>';}).join('')+
    '<option value="all"'+(_devTblPageSize==='all'?' selected':'')+'>전체</option></select>';
  var _from=shown?(_startN+1):0, _to=_startN+_pageIdx.length;
  var _pgBtn=function(label,p,dis){ return '<button '+(dis?'disabled':'')+' onclick="devTblGoPage('+p+')" style="font-size:11px;padding:5px 9px;border:1px solid var(--border);border-radius:7px;background:'+(dis?'#f3f4f6':'#fff')+';color:'+(dis?'#bbb':'var(--text2)')+';cursor:'+(dis?'default':'pointer')+';">'+label+'</button>'; };
  var _pager='<div style="display:flex;align-items:center;justify-content:flex-end;gap:7px;font-size:11.5px;color:var(--text3);flex-wrap:wrap;">'+
    '<span>페이지당</span>'+_psSel+
    '<span style="margin:0 4px;">'+_from+'–'+_to+' / 총 <b style="color:var(--text2);">'+shown+'</b>개</span>'+
    _pgBtn('«',1,_devTblPage<=1)+_pgBtn('‹ 이전',_devTblPage-1,_devTblPage<=1)+
    '<span style="font-weight:700;color:var(--text2);padding:0 4px;">'+_devTblPage+' / '+_totalPages+'</span>'+
    _pgBtn('다음 ›',_devTblPage+1,_devTblPage>=_totalPages)+_pgBtn('»',_totalPages,_devTblPage>=_totalPages)+
    '</div>';
  el.innerHTML=
    '<style>'+
    '.dtbl-page{padding:16px 20px;}'+
    '.dtbl-bar{display:flex;align-items:center;gap:9px;margin-bottom:12px;flex-wrap:wrap;}'+
    '.dtbl-sel{font-size:12px;padding:6px 9px;border:1.5px solid var(--border);border-radius:8px;background:#fff;cursor:pointer;outline:none;}'+
    '.dtbl-card{border:1px solid #e1e6ee;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(20,30,60,0.04);}'+
    '.dtbl-scroll{overflow-x:auto;overflow-y:visible;}'+
    '.dtbl{border-collapse:separate;border-spacing:0;width:100%;table-layout:fixed;}'+
    '.dtbl th{position:sticky;top:0;z-index:2;background:#2d6fd4;color:#fff;font-weight:800;font-size:12px;padding:8px 5px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-right:1px solid rgba(255,255,255,0.18);border-bottom:2px solid #1e4f9c;}'+
    '.dtbl td{border-bottom:1px solid #eef1f5;padding:0;overflow:hidden;}'+
    '.dtbl tbody tr:nth-child(even){background:#fafbfd;}'+
    '.dtbl tbody tr:hover{background:#eef4ff;}'+
    '.dtbl .dtbl-del{position:sticky;right:0;background:#fff;box-shadow:-3px 0 6px rgba(20,30,60,0.06);}'+
    '.dtbl th.dtbl-del{background:#2d6fd4;z-index:3;}'+
    '.dtbl tbody tr:nth-child(even) .dtbl-del{background:#fafbfd;}'+
    '.dtbl tbody tr:hover .dtbl-del{background:#eef4ff;}'+
    '.dtbl input,.dtbl select{width:100%;border:none;background:transparent;font-size:12.5px;padding:4px 3px;outline:none;box-sizing:border-box;color:#1c2230;font-family:inherit;}'+
    '.dtbl select{cursor:pointer;}'+
    '.dtbl input[type=number]{-moz-appearance:textfield;}'+
    '.dtbl input[type=number]::-webkit-outer-spin-button,.dtbl input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;}'+
    '.dtbl input:focus,.dtbl select:focus{background:#fff;box-shadow:inset 0 0 0 2px #2d6fd4;border-radius:4px;}'+
    '.dtbl-btn{font-size:10.5px;font-weight:700;padding:4px 10px;border:1px solid #2d6fd4;border-radius:6px;background:#fff;color:#2d6fd4;cursor:pointer;white-space:nowrap;}'+
    '.dtbl-btn:hover{background:#2d6fd4;color:#fff;}'+
    /* ── 다크모드 보정 ── */
    'body.dark .dtbl-sel{background:var(--bg2);color:var(--text);}'+
    'body.dark .dtbl-card{border-color:var(--border);box-shadow:none;}'+
    'body.dark .dtbl td{border-bottom-color:var(--border);}'+
    'body.dark .dtbl tbody tr{background:var(--bg2);}'+
    'body.dark .dtbl tbody tr:nth-child(even){background:var(--bg3);}'+
    'body.dark .dtbl tbody tr:hover{background:rgba(45,111,212,0.22);}'+
    'body.dark .dtbl .dtbl-del{background:var(--bg2);box-shadow:-3px 0 6px rgba(0,0,0,0.35);}'+
    'body.dark .dtbl tbody tr:nth-child(even) .dtbl-del{background:var(--bg3);}'+
    'body.dark .dtbl tbody tr:hover .dtbl-del{background:rgba(45,111,212,0.22);}'+
    'body.dark .dtbl input,body.dark .dtbl select{color:var(--text);}'+
    'body.dark .dtbl input:focus,body.dark .dtbl select:focus{background:var(--bg3);}'+
    'body.dark .dtbl-btn{background:var(--bg2);color:var(--blue);}'+
    'body.dark .dtbl-btn:hover{background:var(--blue);color:#fff;}'+
    'body.dark #page-device-reg [style*="background:#f7f9fc"]{background:var(--bg3)!important;}'+
    'body.dark #page-device-reg [style*="background:#eef3ff"]{background:rgba(45,111,212,0.22)!important;}'+
    '</style>'+
    '<div class="dtbl-page">'+
      _devTabBar()+
      (_isInst?'':_labChips)+
      '<div class="dtbl-bar">'+
        '<i class="ti '+(_isInst?'ti-device-desktop-analytics':'ti-server-2')+'" style="font-size:19px;color:#2d6fd4;"></i><b style="font-size:15px;">'+(_isInst?'계측기 관리':'장비 · 자산 관리')+'</b>'+
        '<span style="font-size:11px;font-weight:700;color:#2d6fd4;background:#eef3ff;border-radius:9px;padding:2px 10px;">'+(_isInst?_cntInst:_cntDev)+'대'+(filtered?(' · 표시 '+shown):'')+'</span>'+
        '<button onclick="devTblRowAdd()" style="font-size:12px;font-weight:800;padding:6px 14px;border-radius:8px;border:none;background:#2d6fd4;color:#fff;cursor:pointer;"><i class="ti ti-plus" style="font-size:13px;"></i> '+(_isInst?'계측기 추가':'장비 추가')+'</button>'+
        '<button id="dev-del-sel" onclick="devTblDelSelected()" '+(_devSelN?'':'disabled')+' style="font-size:12px;font-weight:800;padding:6px 14px;border-radius:8px;border:none;background:'+(_devSelN?'#c0414f':'#e3b6bd')+';color:#fff;cursor:'+(_devSelN?'pointer':'default')+';"><i class="ti ti-trash" style="font-size:13px;"></i> 선택 삭제'+(_devSelN?(' ('+_devSelN+')'):'')+'</button>'+
        '<button onclick="devExportExcel()" title="현재 탭(장비/계측기) 목록을 엑셀(CSV)로 다운로드" style="font-size:12px;font-weight:800;padding:6px 14px;border-radius:8px;border:1px solid #1d6f42;background:#fff;color:#1d6f42;cursor:pointer;"><i class="ti ti-file-spreadsheet" style="font-size:13px;"></i> 엑셀</button>'+
        (_isInst?'':'<button onclick="devNormalizeNames()" title="등록 모델 기준으로 이름 정리: (PF#1)/(형상) 등 꼬리표를 떼고 같은 모델은 _1,_2 + model 필드 연결" style="font-size:12px;font-weight:800;padding:6px 14px;border-radius:8px;border:1px solid #7c3aed;background:#fff;color:#7c3aed;cursor:pointer;"><i class="ti ti-wand" style="font-size:13px;"></i> 이름 정규화</button>')+
        '<span style="width:6px;"></span>'+
        '<i class="ti ti-arrows-sort" style="color:var(--text3);font-size:15px;"></i><span style="font-size:10.5px;color:var(--text3);font-weight:700;">정렬</span>'+
        _devSortSel('devSortSet',_devSort,'등록순')+
        (_devSort?('<i class="ti ti-chevron-right" style="color:var(--text3);font-size:13px;"></i>'+_devSortSel('devSort2Set',_devSort2,'2순위 없음')):'')+
        (_devSort&&_devSort2?('<i class="ti ti-chevron-right" style="color:var(--text3);font-size:13px;"></i>'+_devSortSel('devSort3Set',_devSort3,'3순위 없음')):'')+
        (_devSort&&_devSort2&&_devSort3?('<i class="ti ti-chevron-right" style="color:var(--text3);font-size:13px;"></i>'+_devSortSel('devSort4Set',_devSort4,'4순위 없음')):'')+
        '<i class="ti ti-search" style="color:var(--text3);font-size:15px;"></i><input id="dev-search" value="'+String(_devTblSearch||'').replace(/"/g,'&quot;')+'" oninput="devTblSearchSet(this.value)" placeholder="검색 (전체 컬럼)" style="font-size:12px;padding:6px 11px;border:1.5px solid var(--border);border-radius:8px;outline:none;width:230px;">'+
        (filtered?'<button onclick="_devTblFilter={};devTblSearchSet(\'\')" style="font-size:11px;padding:6px 10px;border:1px solid var(--border);border-radius:7px;background:#fff;color:var(--text3);cursor:pointer;">초기화</button>':'')+
        '<span style="flex:1;"></span>'+
        '<span style="font-size:11px;color:var(--text3);"><i class="ti ti-mouse"></i> 셀 <b>우클릭</b> → 아래로 증가/복사</span>'+
      '</div>'+
      '<div class="dtbl-card"><div class="dtbl-scroll"><table class="dtbl"><thead>'+head+'</thead><tbody>'+(shown?rows:'<tr><td colspan="'+COLS.length+'" style="padding:34px;text-align:center;color:var(--text3);font-size:12.5px;">'+(_isInst?'계측기가 없습니다. <b>계측기 추가</b>로 시작하세요.':'장비가 없습니다. <b>장비 추가</b>로 시작하세요.')+'</td></tr>')+'</tbody></table></div></div>'+
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-top:9px;">'+
        '<div style="flex:1;min-width:260px;font-size:11px;color:var(--text3);line-height:1.6;">계측기(STC)는 <b>연결방식 rest</b> · IP=섀시. 등록하면 TC 세션 추가에 바로 뜹니다. 우클릭 <b>아래로 증가</b>: IP/MAC/시리얼 자동 증가, 그 외는 복사. <span style="color:#c48a00;"><i class="ti ti-clock"></i> 계측기는 연결 확인 시 약 <b>10~20초</b> 소요 예상.</span></div>'+
        _pager+
      '</div>'+
    '</div>';
}
function devTblSet(i,f,v){ if(!deviceList[i])return; if(f==='rack_units'||f==='power'||f==='weight'||f==='rack_pos'){ v=(v===''||v==null)?0:(parseFloat(v)||0); }
  var _suffixed=false;
  if(f==='name' && String(v).trim()){   // 동일 장비명이면 _1, _2… 자동 부여
    var taken={}; deviceList.forEach(function(d,j){ if(j!==i && d.name) taken[String(d.name)]=1; });
    if(taken[v]){ var base=v,n=1; while(taken[base+'_'+n])n++; v=base+'_'+n; _suffixed=true; }
  }
  deviceList[i][f]=v; if(f==='protocol'){ deviceList[i].device_type=(v==='ssh'?'cisco_ios':'cisco_ios_telnet'); } saveDeviceData();
  if(_suffixed){ renderDeviceTable(); if(typeof showToast==='function')showToast('동일 장비명이 있어 자동으로 "'+v+'" 로 지정했습니다'); }
}
function devExportExcel(){
  var inst=(_devKind==='instrument');
  var rows=(deviceList||[]).filter(function(d){ return _isInstrument(d)===inst; });
  if(!rows.length){ if(typeof showToast==='function')showToast('내보낼 항목이 없습니다'); return; }
  var cols=inst
    ? [['Vendor','vendor'],['제품군','role'],['모델','name'],['Lab','lab'],['서버 IP','ip'],['연결방식','protocol'],['계정','username'],['U','rack_units'],['전력(W)','power'],['MAC','mac'],['시리얼','serial'],['자산여부','asset'],['관리부서','dept'],['상태','status'],['비고','note']]
    : [['Vendor','vendor'],['제품군','role'],['모델명','name'],['Lab','lab'],['IP','ip'],['연결방식','protocol'],['상태','status'],['ID','username'],['시리얼','serial'],['MAC','mac'],['U','rack_units'],['전력(W)','power'],['자산여부','asset'],['관리부서','dept'],['비고','note']];
  var ce=function(v){ v=String(v==null?'':v); return /[",\n]/.test(v)?('"'+v.replace(/"/g,'""')+'"'):v; };
  var csv=cols.map(function(c){return ce(c[0]);}).join(',')+'\n'+rows.map(function(d){ return cols.map(function(c){ return ce(d[c[1]]); }).join(','); }).join('\n');
  var blob=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8;'});
  var fn=(inst?'계측기':'장비')+'_목록_'+((typeof _nowStr==='function'?_nowStr():'').replace(/[^0-9]/g,'').slice(0,12)||'export')+'.csv';
  var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=fn; document.body.appendChild(a); a.click(); setTimeout(function(){ a.remove(); URL.revokeObjectURL(a.href); },100);
  if(typeof showToast==='function')showToast('엑셀(CSV) 다운로드: '+rows.length+'건');
}
// 엑셀식 키보드 이동: Enter=입력+아래, 방향키=상하좌우 셀 이동
function devTblNav(ev,el){
  var k=ev.key;
  if(k!=='Enter'&&k!=='ArrowDown'&&k!=='ArrowUp'&&k!=='ArrowLeft'&&k!=='ArrowRight') return;
  // 텍스트 입력은 캐럿이 끝/처음에 있을 때만 좌우키로 셀 이동(아니면 캐럿 이동)
  if((k==='ArrowLeft'||k==='ArrowRight')&&el.tagName==='INPUT'){
    var atStart=true, atEnd=true;
    try{ atStart=(el.selectionStart===0&&el.selectionEnd===0); atEnd=(el.selectionStart===el.value.length&&el.selectionEnd===el.value.length); }catch(e){}
    if(k==='ArrowLeft'&&!atStart) return;
    if(k==='ArrowRight'&&!atEnd) return;
  }
  var list=Array.prototype.slice.call(document.querySelectorAll('.dtbl input,.dtbl select'));
  var idx=list.indexOf(el); if(idx<0) return;
  var fr=document.querySelector('.dtbl tbody tr');
  var ncol=fr?fr.querySelectorAll('input,select').length:1; if(ncol<1)ncol=1;
  var t=idx;
  if(k==='Enter'||k==='ArrowDown') t=idx+ncol;
  else if(k==='ArrowUp') t=idx-ncol;
  else if(k==='ArrowRight') t=idx+1;
  else if(k==='ArrowLeft') t=idx-1;
  ev.preventDefault();
  if(t<0||t>=list.length) return;
  var tg=list[t]; tg.focus();
  if(tg.tagName==='INPUT'&&tg.type!=='number'&&tg.type!=='password'){ try{ tg.select(); }catch(e){} }
}
// 장비/계측기 추가 — 팝업에서 설정 후 추가
function devTblRowAdd(){
  var _ins=(_devKind==='instrument');
  var old=document.getElementById('dev-add-modal'); if(old)old.remove();
  // Vendor/모델/Lab 후보 목록 (등록된 것 + 표에 이미 쓰인 것)
  var ven=(typeof vendorList!=='undefined'&&vendorList)?vendorList.map(function(v){return (v&&v.name)||v;}).filter(Boolean):[];
  deviceList.forEach(function(d){ if(d.vendor&&ven.indexOf(d.vendor)<0)ven.push(d.vendor); });
  var mdl=(typeof modelList!=='undefined'&&modelList)?modelList.map(function(m){return (m&&m.name)||m;}).filter(Boolean):[];
  deviceList.forEach(function(d){ if(d.name&&mdl.indexOf(d.name)<0)mdl.push(d.name); });
  var labs=(typeof labLabs!=='undefined'&&labLabs)?labLabs.map(function(l){return (l&&l.name)||l;}).filter(Boolean):[];
  deviceList.forEach(function(d){ if(d.lab&&labs.indexOf(d.lab)<0)labs.push(d.lab); });
  var _lb=function(t){ return '<label style="font-size:12px;font-weight:700;color:var(--text3);display:block;margin-bottom:6px;">'+t+'</label>'; };
  var _fx='onfocus="this.style.borderColor=\'#2d6fd4\';this.style.boxShadow=\'0 0 0 3px rgba(45,111,212,0.12)\'" onblur="this.style.borderColor=\'var(--border)\';this.style.boxShadow=\'none\'"';
  var _in='style="width:100%;font-size:13.5px;padding:10px 12px;border:1.5px solid var(--border);border-radius:9px;outline:none;box-sizing:border-box;transition:border-color .12s,box-shadow .12s;" '+_fx;
  // 드롭다운: 기본 화살표 제거 + 커스텀 화살표(SVG)·포커스 하이라이트 — 입력창과 통일된 디자인
  var _arrow='url(\'data:image/svg+xml;utf8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%228%22 viewBox=%220 0 12 8%22%3E%3Cpath d=%22M1 1l5 5 5-5%22 stroke=%22%238a93a4%22 stroke-width=%222%22 fill=%22none%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22/%3E%3C/svg%3E\') no-repeat right 13px center';
  var _se='style="width:100%;font-size:13.5px;padding:10px 34px 10px 12px;border:1.5px solid var(--border);border-radius:9px;outline:none;box-sizing:border-box;background:#fff '+_arrow+';appearance:none;-webkit-appearance:none;-moz-appearance:none;font-weight:700;color:var(--text);cursor:pointer;transition:border-color .12s,box-shadow .12s;" '+_fx;
  var _ent='onkeydown="if(event.key===\'Enter\')devAddSubmit()"';
  window._daddLists={ven:ven,mdl:mdl,lab:labs};
  // 모델 → 제품군 매핑 (모델 등록의 role 우선, 표에 쓰인 장비의 role 보강) — 제품군 선택 시 모델명 필터용
  var _mrole={};
  (typeof modelList!=='undefined'&&modelList?modelList:[]).forEach(function(m){ if(m&&m.name&&_mrole[m.name]==null) _mrole[m.name]=m.role||''; });
  deviceList.forEach(function(d){ if(d.name&&(_mrole[d.name]==null||_mrole[d.name]==='')) _mrole[d.name]=d.role||''; });
  window._daddMdlRole=_mrole;
  // 커스텀 콤보박스(Vendor·모델명·Lab): datalist 기본 UI 대체 — 입력창과 통일된 디자인 + 타이핑 필터·자유입력
  var _combo=function(id,key,ph,extra){
    return '<div style="position:relative;">'
      +'<input id="'+id+'" '+(extra||'')+' placeholder="'+ph+'" autocomplete="off" '
        +'style="width:100%;font-size:13.5px;padding:10px 34px 10px 12px;border:1.5px solid var(--border);border-radius:9px;outline:none;box-sizing:border-box;transition:border-color .12s,box-shadow .12s;" '
        +'oninput="_daddDD(\''+id+'\',\''+key+'\')" '
        +'onfocus="this.style.borderColor=\'#2d6fd4\';this.style.boxShadow=\'0 0 0 3px rgba(45,111,212,0.12)\';_daddDD(\''+id+'\',\''+key+'\',true)" '
        +'onblur="this.style.borderColor=\'var(--border)\';this.style.boxShadow=\'none\';(function(_i){setTimeout(function(){var _d=document.getElementById(_i);if(_d)_d.style.display=\'none\';},140);})(\''+id+'-dd\')" '
        +_ent+'>'
      +'<i class="ti ti-chevron-down" onmousedown="event.preventDefault();_daddToggle(\''+id+'\',\''+key+'\')" style="position:absolute;right:11px;top:50%;transform:translateY(-50%);font-size:14px;color:#8a93a4;cursor:pointer;"></i>'
      +'<div id="'+id+'-dd" style="position:absolute;left:0;right:0;top:calc(100% + 4px);background:#fff;border:1px solid var(--border);border-radius:9px;box-shadow:0 10px 26px rgba(20,30,60,0.16);max-height:210px;overflow:auto;z-index:60;display:none;"></div>'
    +'</div>';
  };
  var roleSel='<select id="dadd-role" onchange="_daddRoleChg()" '+_se+'>'+DEVICE_ROLES.filter(function(r){return r!=='계측기';}).map(function(r){return '<option'+(r==='기타'?' selected':'')+'>'+r+'</option>';}).join('')+'</select>';
  var protoSel='<select id="dadd-proto" onchange="devAddProtoChg()" '+_se+'>'+['telnet','ssh','snmp','rest','tcl'].map(function(p){return '<option value="'+p+'"'+(p===(_ins?'tcl':'telnet')?' selected':'')+'>'+p.toUpperCase()+'</option>';}).join('')+'</select>';
  var assetSel='<select id="dadd-asset" '+_se+'>'+['','BMT','자산이관','자산구매','무상임대'].map(function(a){return '<option value="'+a+'">'+(a||'(선택)')+'</option>';}).join('')+'</select>';
  var deptSel='<select id="dadd-dept" '+_se+'>'+['','PA1','PA2','QA'].map(function(a){return '<option value="'+a+'">'+(a||'(선택)')+'</option>';}).join('')+'</select>';
  var _labDef=(_devLabSel&&_devLabSel!=='__none__')?_devLabSel:'';
  var body=_ins
    ? ('<div style="display:grid;grid-template-columns:1fr 1fr;gap:13px 14px;">'+
        '<div>'+_lb('Vendor')+_combo('dadd-vendor','ven','Spirent')+'</div>'+
        '<div>'+_lb('모델 <span style="color:var(--red);">*</span>')+_combo('dadd-name','mdl','TestCenter')+'</div>'+
        '<div>'+_lb('Lab')+_combo('dadd-lab','lab','(선택)','value="'+_labDef.replace(/"/g,'&quot;')+'"')+'</div>'+
        '<div>'+_lb('서버 IP')+'<input id="dadd-ip" placeholder="210.1.2.248" style="width:100%;font-size:13.5px;font-family:ui-monospace,monospace;padding:10px 12px;border:1.5px solid var(--border);border-radius:9px;outline:none;box-sizing:border-box;transition:border-color .12s,box-shadow .12s;" '+_fx+' '+_ent+'></div>'+
        '<div>'+_lb('연결방식')+protoSel+'</div>'+
        '<div>'+_lb('계정')+'<input id="dadd-user" placeholder="(선택)" '+_in+' '+_ent+'></div>'+
        '<div>'+_lb('자산여부')+assetSel+'</div>'+
        '<div>'+_lb('관리부서')+deptSel+'</div>'+
      '</div>')
    : ('<div style="display:grid;grid-template-columns:1fr 1fr;gap:13px 14px;">'+
        '<div>'+_lb('Vendor')+_combo('dadd-vendor','ven','유비쿼스')+'</div>'+
        '<div>'+_lb('제품군')+roleSel+'</div>'+
        '<div>'+_lb('모델명 <span style="color:var(--red);">*</span>')+_combo('dadd-name','mdl','E7500')+'</div>'+
        '<div>'+_lb('Lab')+_combo('dadd-lab','lab','(선택)','value="'+_labDef.replace(/"/g,'&quot;')+'"')+'</div>'+
        '<div>'+_lb('IP')+'<input id="dadd-ip" placeholder="220.1.1.236" style="width:100%;font-size:13.5px;font-family:ui-monospace,monospace;padding:10px 12px;border:1.5px solid var(--border);border-radius:9px;outline:none;box-sizing:border-box;transition:border-color .12s,box-shadow .12s;" '+_fx+' '+_ent+'></div>'+
        '<div>'+_lb('연결방식')+protoSel+'</div>'+
        '<div>'+_lb('자산여부')+assetSel+'</div>'+
        '<div>'+_lb('관리부서')+deptSel+'</div>'+
      '</div>'+
      '<div id="dadd-creds" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:13px 14px;margin-top:14px;">'+
        '<div>'+_lb('ID')+'<input id="dadd-user" value="root" placeholder="root" '+_in+' '+_ent+'></div>'+
        '<div>'+_lb('PW')+'<input id="dadd-pw" type="password" placeholder="****" '+_in+' '+_ent+'></div>'+
        '<div>'+_lb('Enable PW')+'<input id="dadd-secret" type="password" placeholder="(선택)" '+_in+' '+_ent+'></div>'+
      '</div>');
  var m=document.createElement('div'); m.id='dev-add-modal'; m.className='modal-overlay'; m.style.display='flex';
  m.innerHTML='<div class="modal" style="width:680px;max-width:94vw;border-radius:14px;padding:0;overflow:hidden;">'+
    '<div style="padding:19px 26px;background:linear-gradient(135deg,#2d6fd4,#5a94e8);color:#fff;display:flex;align-items:center;gap:11px;"><div style="width:40px;height:40px;border-radius:11px;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;"><i class="ti '+(_ins?'ti-antenna':'ti-server-cog')+'" style="font-size:21px;"></i></div><div><div style="font-size:16px;font-weight:800;">'+(_ins?'계측기 추가':'장비 추가')+'</div><div style="font-size:11.5px;opacity:0.85;">'+(_ins?'계측기 정보를 입력 후 추가하세요':'장비 정보를 입력 후 추가하세요 — 나머지 항목은 표에서 수정 가능')+'</div></div></div>'+
    '<div style="padding:24px 26px;">'+body+'</div>'+
    '<div style="padding:0 26px 22px;display:flex;gap:9px;justify-content:flex-end;"><button onclick="document.getElementById(\'dev-add-modal\').remove()" style="font-size:13px;padding:9px 18px;border-radius:9px;border:1.5px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;font-weight:600;">취소</button><button onclick="devAddSubmit()" style="font-size:13px;padding:9px 22px;border-radius:9px;border:none;background:#2d6fd4;color:#fff;cursor:pointer;font-weight:700;"><i class="ti ti-plus"></i> 추가</button></div>'+
  '</div>';
  document.body.appendChild(m);   // 자동 포커스 없음 — 콤보(모델명)에 포커스되면 드롭다운이 바로 열려 산만함
}
function devAddProtoChg(){ var p=((document.getElementById('dadd-proto')||{}).value)||''; var c=document.getElementById('dadd-creds'); if(c)c.style.display=(p==='telnet'||p==='ssh')?'grid':'none'; }
// ── 장비 추가 콤보박스 드롭다운 (Vendor·모델명·Lab) ──
function _daddDD(id,key,showAll){
  var inp=document.getElementById(id); var dd=document.getElementById(id+'-dd'); if(!inp||!dd) return;
  var esc=function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); };
  var q=showAll?'':String(inp.value||'').trim().toLowerCase();
  var arr=(window._daddLists&&window._daddLists[key])||[];
  // 모델명: 선택된 제품군(장비) 또는 계측기 탭이면 해당 제품군 모델만
  if(key==='mdl'){
    var _rSel=document.getElementById('dadd-role');
    var _role=_rSel?String(_rSel.value||''):((typeof _devKind!=='undefined'&&_devKind==='instrument')?'계측기':'');
    if(_role){
      var _mr=window._daddMdlRole||{};
      arr=arr.filter(function(v){ return (_mr[v]||'')===_role; });
    }
  }
  var hits=arr.filter(function(v){ return !q||String(v).toLowerCase().indexOf(q)>=0; });
  if(!hits.length){
    if(key==='mdl'&&showAll){ dd.innerHTML='<div style="padding:10px 13px;font-size:12px;color:var(--text3);">이 제품군에 등록된 모델이 없습니다 — 직접 입력하세요</div>'; dd.style.display='block'; return; }
    dd.style.display='none'; dd.innerHTML=''; return;
  }
  dd.innerHTML=hits.slice(0,80).map(function(v){
    return '<div onmousedown="event.preventDefault();_daddPick(\''+id+'\',this)" data-v="'+esc(v)+'" style="padding:9px 13px;font-size:13px;font-weight:600;color:var(--text);cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" onmouseenter="this.style.background=\'#eef4ff\'" onmouseleave="this.style.background=\'\'">'+esc(v)+'</div>';
  }).join('');
  dd.style.display='block';
}
function _daddPick(id,el){ var inp=document.getElementById(id); if(inp) inp.value=el.getAttribute('data-v')||''; var dd=document.getElementById(id+'-dd'); if(dd)dd.style.display='none'; }
function _daddToggle(id,key){
  var dd=document.getElementById(id+'-dd');
  if(dd&&dd.style.display==='block'){ dd.style.display='none'; return; }
  var i=document.getElementById(id); if(i)i.focus();
  _daddDD(id,key,true);
}
// ══════════ Device Registration (Beta) — 3열: ①분류 트리(구역·벤더·제품군) ②장비 목록 ③상세 편집 ══════════
var _drbSel='';      // 선택 장비 id
var _drbSearch='';
var _drbKind='device';   // 'summary' | 'device' | 'instrument'
var _drbNode={vendor:'',role:''};   // 1열 트리 선택 — 벤더 / 벤더+제품군 ('' = 전체)
var _drbLab='';                      // 2열 구역(Lab) 칩 필터 ('' = 전체)
var _drbMdl='';                      // 2열 모델 그룹 필터 ('' = 전체)
var _drbSt='';                       // 2열 연결 상태 필터 ('' = 전체)
var _drbVOpen={};                    // 벤더 노드 펼침 상태 (기본: 펼침)
function _drbEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }
// 마지막 화면 상태 저장·복원 (브라우저별 = 사용자별) — 새로고침해도 보던 곳 유지
function _drbSaveState(){ try{ localStorage.setItem('utop_drb_state', JSON.stringify({k:_drbKind,n:_drbNode,l:_drbLab,m:_drbMdl,s:_drbSt,sel:_drbSel,vo:_drbVOpen})); }catch(e){} }
function _drbLoadState(){
  if(window._drbStateLoaded) return; window._drbStateLoaded=true;
  try{
    var s=JSON.parse(localStorage.getItem('utop_drb_state')||'null'); if(!s) return;
    if(['summary','device','instrument'].indexOf(s.k)>=0) _drbKind=s.k;
    if(s.n&&typeof s.n==='object') _drbNode={vendor:String(s.n.vendor||''),role:String(s.n.role||'')};
    _drbLab=String(s.l||''); _drbMdl=String(s.m||''); _drbSt=String(s.s||''); _drbSel=String(s.sel||'');
    if(s.vo&&typeof s.vo==='object') _drbVOpen=s.vo;
  }catch(e){}
}
function _drbKindSet(k){
  _drbKind=(['summary','device','instrument'].indexOf(k)>=0)?k:'device';
  _drbNode={vendor:'',role:''}; _drbLab=''; _drbMdl=''; _drbSt='';
  var d=(deviceList||[]).find(function(x){ return x.id===_drbSel; });
  if(d){ var isInst=(d.role==='계측기'); if(_drbKind==='summary'||(_drbKind==='instrument')!==isInst) _drbSel=''; }
  _drbSaveState();
  renderDeviceRegBeta();
}
async function _drbAdd(){ _devKind=(_drbKind==='instrument')?'instrument':'device'; try{ await loadDeviceData(); }catch(e){} devTblRowAdd(); }   // 모달 열기 직전 최신 모델/벤더 목록 재조회(다른 화면에서 방금 추가한 모델그룹·모델 즉시 반영)
function _drbKindDevs(){ if(_drbKind==='summary') return (deviceList||[]).slice(); var inst=(_drbKind==='instrument'); return (deviceList||[]).filter(function(d){ return inst===(d&&d.role==='계측기'); }); }
function _drbNodeSet(i){ var n=(window._drbNodes||[])[i]; _drbNode=n?{vendor:n.vendor||'',role:n.role||''}:{vendor:'',role:''}; _drbSaveState(); renderDeviceRegBeta(); }
function _drbVToggle(i){ var n=(window._drbNodes||[])[i]; if(!n) return; var k='V:'+n.vendor; _drbVOpen[k]=(_drbVOpen[k]!==false)?false:true; _drbSaveState(); renderDeviceRegBeta(); }
function _drbLabSet(i){ var v=(window._drbLabVals||[])[i]; _drbLab=(v!=null&&_drbLab!==v)?v:''; _drbSaveState(); renderDeviceRegBeta(); }
function _drbMdlSet(v){ _drbMdl=String(v||''); _drbSaveState(); renderDeviceRegBeta(); }
// 검색 입력 — 재렌더 후 입력창 포커스·커서 복원 (한 글자마다 포커스 풀리던 문제)
function _drbSearchInput(v){
  _drbSearch=String(v||'');
  renderDeviceRegBeta();
  var i=document.getElementById('drb-search');
  if(i){ i.focus(); var l=i.value.length; try{ i.setSelectionRange(l,l); }catch(e){} }
}
// 컬럼 클릭 포커스 강조 — explorer3(_e3FocusUI)와 동일한 문법 (1열 보라 / 2열 초록 / 3열 파랑)
function _drbFocusSet(n){
  window._drbFocus=n;
  var cols={1:'drb-cat',2:'drb-tree',3:'drb-detail'};
  var borders={1:'2px solid #7c3aed',2:'2px solid #00875a',3:'2px solid #2d6fd4'};
  var shadows={1:'0 0 0 3px rgba(124,58,237,0.18),0 4px 18px rgba(124,58,237,0.14)',2:'0 0 0 3px rgba(0,135,90,0.18),0 4px 18px rgba(0,135,90,0.14)',3:'0 0 0 3px rgba(45,111,212,0.18),0 4px 18px rgba(45,111,212,0.14)'};
  [1,2,3].forEach(function(i){
    var el=document.getElementById(cols[i]); if(!el) return;
    if(i===n){ el.style.border=borders[i]; el.style.boxShadow=shadows[i]; }
    else { el.style.border='1px solid var(--border)'; el.style.boxShadow='0 2px 10px rgba(40,50,90,0.06)'; }
  });
}
function _drbStSet(v){ _drbSt=String(v||''); _drbSaveState(); renderDeviceRegBeta(); }
function _drbStMatch(d,st){
  var s=String(d.status||'');
  if(st==='연결됨') return s==='연결됨'||s==='connected';
  if(st==='미연결') return s==='실패';
  if(st==='확인중') return s==='확인중';
  if(st==='미확인') return !s||s==='미확인';
  return true;
}
// ── 1열: 벤더 > 제품군 트리 — '>' 인라인 접기/펴기, 라벨 클릭=해당 범위 전체 선택 ──
function _drbRenderCat(){
  var el=document.getElementById('drb-cat'); if(!el) return;
  var esc=_drbEsc;
  var _cntDev=0,_cntInst=0; (deviceList||[]).forEach(function(d){ if(d&&d.role==='계측기')_cntInst++; else _cntDev++; });
  var tab=function(k,label,cnt){ var on=(_drbKind===k);
    return '<button onclick="_drbKindSet(\''+k+'\')" style="flex:1;font-size:11.5px;font-weight:'+(on?'800':'600')+';padding:4px 2px;border:none;border-radius:8px;cursor:pointer;background:'+(on?'#fff':'transparent')+';color:'+(on?'#1a4fa0':'var(--text3)')+';'+(on?'box-shadow:0 1px 3px rgba(30,40,70,0.12);':'')+'white-space:nowrap;">'+label+(cnt!=null?' <span style="font-size:10px;color:'+(on?'#2d6fd4':'var(--text3)')+';">'+cnt+'</span>':'')+'</button>'; };
  var h='<div style="padding:12px 12px 10px;border-bottom:1px solid var(--border);flex-shrink:0;">'
    +'<div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;"><i class="ti ti-server-cog" style="color:#2d6fd4;font-size:16px;"></i><b style="font-size:13.5px;">Device Registration</b></div>'
    +'<div style="display:flex;gap:3px;background:#eef1f6;border-radius:10px;padding:3px;">'+tab('summary','Summary')+tab('device','장비',_cntDev)+tab('instrument','계측기',_cntInst)+'</div>'
    +'</div>';
  var devs=_drbKindDevs();
  // 벤더 → 제품군 트리 구성
  var vOrder=[]; var byV={};
  devs.forEach(function(d){ var v=String(d.vendor||'').trim()||'(벤더 미지정)'; if(!byV[v]){ byV[v]={n:0,roles:{},ro:[]}; vOrder.push(v); } byV[v].n++;
    var r=String(d.role||'기타'); if(!byV[v].roles[r]){ byV[v].roles[r]=0; byV[v].ro.push(r); } byV[v].roles[r]++; });
  // 벤더 고정 순서: UBIQUOSS → Dasan → CISCO → IXIA → Spirent → ALLRADIO → 그 외(가나다) → 미지정
  var _vPri=['UBIQUOSS','DASAN','CISCO','IXIA','SPIRENT','ALLRADIO'];
  var _vRank=function(v){ if(v==='(벤더 미지정)') return 9999; var i=_vPri.indexOf(String(v).trim().toUpperCase()); return i>=0?i:100; };
  vOrder.sort(function(a,b){ var ra=_vRank(a),rb=_vRank(b); if(ra!==rb) return ra-rb; return a.localeCompare(b,undefined,{numeric:true}); });
  window._drbNodes=[];
  var nIdx=function(n){ window._drbNodes.push(n); return window._drbNodes.length-1; };
  var allOn=(!_drbNode.vendor);
  h+='<div style="flex:1;overflow-y:auto;padding:8px;">'
    +'<div onclick="_drbNodeSet(-1)" style="display:flex;align-items:center;gap:7px;padding:8px 10px;border-radius:9px;cursor:pointer;font-size:12.5px;font-weight:'+(allOn?'800':'600')+';'+(allOn?'background:#e8f0fe;color:#1a4fa0;':'color:var(--text2);')+'" '+(allOn?'':'onmouseenter="this.style.background=\'#f5f7fb\'" onmouseleave="this.style.background=\'\'"')+'><i class="ti ti-list" style="font-size:14px;"></i>전체<span style="flex:1;"></span><span style="font-size:10.5px;color:var(--text3);">'+devs.length+'</span></div>';
  // 전체 제품군별 개수 요약 (L2 스위치 N · L3 스위치 N · OLT N …) — 장비 탭에서만 (Summary는 3열 차트가 담당)
  if(_drbKind==='device'&&devs.length){
    var _rc={}; var _rcOrd=[];
    devs.forEach(function(d){ var r=String(d.role||'기타'); if(_rc[r]==null){ _rc[r]=0; _rcOrd.push(r); } _rc[r]++; });
    _rcOrd.sort(function(a,b){ return _rc[b]-_rc[a]||a.localeCompare(b); });
    h+='<div style="display:flex;flex-wrap:wrap;gap:4px;padding:2px 10px 8px 30px;">'
      +_rcOrd.map(function(r){ return '<span style="font-size:10px;font-weight:700;color:var(--text2);background:#f1f3f8;border:1px solid #e5e9f0;border-radius:9px;padding:2px 8px;white-space:nowrap;">'+esc(r)+' <b style="color:#2d6fd4;">'+_rc[r]+'</b></span>'; }).join('')
      +'</div>';
  }
  vOrder.forEach(function(v){
    var open=(_drbVOpen['V:'+v]!==false);
    var onV=(_drbNode.vendor===v&&!_drbNode.role);
    var iV=nIdx({vendor:v,role:''});
    h+='<div oncontextmenu="_drbCtx(event,\'node\','+iV+')" style="display:flex;align-items:center;gap:4px;padding:7px 8px;border-radius:9px;'+(onV?'background:#e8f0fe;':'')+'" '+(onV?'':'onmouseenter="this.style.background=\'#f5f7fb\'" onmouseleave="this.style.background=\'\'"')+'>'
      +'<i class="ti ti-chevron-'+(open?'down':'right')+'" onclick="event.stopPropagation();_drbVToggle('+iV+')" title="'+(open?'접기':'펴기')+'" style="font-size:12px;color:var(--text3);cursor:pointer;flex-shrink:0;width:16px;text-align:center;"></i>'
      +'<div onclick="_drbNodeSet('+iV+')" style="flex:1;min-width:0;display:flex;align-items:center;gap:6px;cursor:pointer;">'
        +'<i class="ti ti-building-store" style="font-size:14px;color:#0d9488;flex-shrink:0;"></i>'
        +'<span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12.5px;font-weight:'+(onV?'800':'700')+';color:'+(onV?'#1a4fa0':'var(--text)')+';">'+esc(v)+'</span>'
        +'<span style="font-size:10.5px;color:var(--text3);">'+byV[v].n+'</span>'
      +'</div></div>';
    if(!open) return;
    byV[v].ro.sort();
    byV[v].ro.forEach(function(r){
      var onR=(_drbNode.vendor===v&&_drbNode.role===r);
      var iR=nIdx({vendor:v,role:r});
      h+='<div onclick="_drbNodeSet('+iR+')" oncontextmenu="_drbCtx(event,\'node\','+iR+')" style="display:flex;align-items:center;gap:6px;padding:6px 8px 6px 34px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:'+(onR?'800':'600')+';'+(onR?'background:#e8f0fe;color:#1a4fa0;':'color:var(--text2);')+'" '+(onR?'':'onmouseenter="this.style.background=\'#f5f7fb\'" onmouseleave="this.style.background=\'\'"')+'>'
        +'<i class="ti ti-category-2" style="font-size:12px;color:#7c3aed;flex-shrink:0;"></i>'
        +'<span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(r)+'</span>'
        +'<span style="font-size:10.5px;color:var(--text3);">'+byV[v].roles[r]+'</span></div>';
    });
  });
  h+='</div>';
  el.innerHTML=h;
}
// ── 2열: 모델(장비) 카드 목록 — 구역(Lab) 칩 필터 + 검색 + 추가 ──
function renderDeviceRegBeta(){
  _drbLoadState();   // 마지막 화면 상태 복원(최초 1회)
  _drbApplyW();   // 저장된 컬럼 폭 복원
  _drbRenderCat();
  var tr=document.getElementById('drb-tree'); if(!tr) return;
  var esc=_drbEsc;
  if(_drbKind==='summary'){
    // Summary: 2열 = 구역(Lab) 선택 목록 — 1열 트리 범위 안의 구역별 분포, 선택 시 3열 요약이 그 구역 기준
    var sBase=_drbKindDevs().filter(function(d){
      if(_drbNode.vendor){ var v=String(d.vendor||'').trim()||'(벤더 미지정)'; if(v!==_drbNode.vendor) return false; }
      if(_drbNode.role){ if(String(d.role||'기타')!==_drbNode.role) return false; }
      return true;
    });
    var sCnt={}; var sOrder=[];
    sBase.forEach(function(d){ var lb=String(d.lab||'').trim()||'(미지정)'; if(sCnt[lb]==null){ sCnt[lb]=0; sOrder.push(lb); } sCnt[lb]++; });
    sOrder.sort(function(a,b){ if(a==='(미지정)')return 1; if(b==='(미지정)')return -1; return a.localeCompare(b,undefined,{numeric:true}); });
    window._drbLabVals=[];
    var sIdx=function(v){ window._drbLabVals.push(v); return window._drbLabVals.length-1; };
    if(_drbLab&&sOrder.indexOf(_drbLab)<0) _drbLab='';
    var sCrumb=_drbNode.vendor?(_drbEsc(_drbNode.vendor)+(_drbNode.role?(' <i class="ti ti-chevron-right" style="font-size:10px;"></i> '+_drbEsc(_drbNode.role)):'')):'전체';
    var sh='<div style="padding:12px 12px 10px;border-bottom:1px solid var(--border);flex-shrink:0;">'
      +'<div style="font-size:12.5px;font-weight:800;color:var(--text);display:flex;align-items:center;gap:6px;"><i class="ti ti-chart-bar" style="color:#2d6fd4;font-size:15px;"></i>구역 선택 <span style="font-size:10.5px;color:var(--text3);font-weight:600;">— 3열 요약 범위</span></div>'
      +'<div style="margin-top:7px;font-size:11px;color:var(--text3);font-weight:700;display:flex;align-items:center;gap:5px;"><i class="ti ti-folder" style="font-size:12px;color:#e8a13c;"></i>'+sCrumb+' <span style="color:#2d6fd4;">'+sBase.length+'대</span></div>'
      +'</div><div style="flex:1;overflow-y:auto;padding:8px;">';
    var sAllOn=(!_drbLab);
    sh+='<div onclick="_drbLabSet(-1)" style="display:flex;align-items:center;gap:8px;padding:9px 11px;border-radius:9px;cursor:pointer;font-size:12.5px;font-weight:'+(sAllOn?'800':'600')+';margin-bottom:2px;'+(sAllOn?'background:#e8f0fe;color:#1a4fa0;':'color:var(--text2);')+'" '+(sAllOn?'':'onmouseenter="this.style.background=\'#f5f7fb\'" onmouseleave="this.style.background=\'\'"')+'><i class="ti ti-list" style="font-size:14px;"></i>전체<span style="flex:1;"></span><span style="font-size:10.5px;color:var(--text3);">'+sBase.length+'</span></div>';
    sOrder.forEach(function(lb){
      var on=(_drbLab===lb); var i=sIdx(lb);
      sh+='<div onclick="_drbLabSet('+i+')" style="display:flex;align-items:center;gap:8px;padding:9px 11px;border-radius:9px;cursor:pointer;font-size:12.5px;font-weight:'+(on?'800':'600')+';margin-bottom:2px;'+(on?'background:#e8f0fe;color:#1a4fa0;':'color:var(--text);')+'" '+(on?'':'onmouseenter="this.style.background=\'#f5f7fb\'" onmouseleave="this.style.background=\'\'"')+'>'
        +'<i class="ti ti-building" style="font-size:13px;color:#e8820c;flex-shrink:0;"></i>'
        +'<span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(lb)+'</span>'
        +'<span style="font-size:10.5px;color:var(--text3);">'+sCnt[lb]+'</span></div>';
    });
    sh+='</div>';
    tr.innerHTML=sh; _drbDetail(); return;
  }
  var q=String(_drbSearch||'').trim().toLowerCase();
  var base=_drbKindDevs().filter(function(d){
    if(_drbNode.vendor){ var v=String(d.vendor||'').trim()||'(벤더 미지정)'; if(v!==_drbNode.vendor) return false; }
    if(_drbNode.role){ if(String(d.role||'기타')!==_drbNode.role) return false; }
    return true;
  });
  // 구역(Lab) 칩 — 현재 트리 범위 안의 Lab 분포
  var labCnt={}; var labOrder=[];
  base.forEach(function(d){ var lb=String(d.lab||'').trim()||'(미지정)'; if(labCnt[lb]==null){ labCnt[lb]=0; labOrder.push(lb); } labCnt[lb]++; });
  labOrder.sort(function(a,b){ if(a==='(미지정)')return 1; if(b==='(미지정)')return -1; return a.localeCompare(b,undefined,{numeric:true}); });
  window._drbLabVals=[];
  var lIdx=function(v){ window._drbLabVals.push(v); return window._drbLabVals.length-1; };
  if(_drbLab&&labOrder.indexOf(_drbLab)<0) _drbLab='';
  var chip=function(label,v,cnt){ var on=(v===null)?(!_drbLab):(_drbLab===v);
    return '<button onclick="_drbLabSet('+(v===null?-1:lIdx(v))+')" style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:13px;border:1px solid '+(on?'#2d6fd4':'var(--border)')+';background:'+(on?'#2d6fd4':'#fff')+';color:'+(on?'#fff':'var(--text2)')+';cursor:pointer;white-space:nowrap;">'+_drbEsc(label)+(cnt!=null?' <b style="'+(on?'':'color:#2d6fd4;')+'">'+cnt+'</b>':'')+'</button>'; };
  // 모델 그룹 필터 — Model/Vendor Registration의 모델그룹(m.group) 기준.
  // 장비의 모델명(model 필드 우선, 복제 접미사 _N 제거)을 모델 등록과 매칭 → 소속 그룹. 미등록/그룹 없음=(미지정)
  var _m2g={}; (typeof modelList!=='undefined'&&modelList?modelList:[]).forEach(function(m){ if(m&&m.name) _m2g[m.name]=String(m.group||'').trim(); });
  var _mdlGrpOf=function(d){
    var mn=String(d.model||'').trim()||String(d.name||'').trim();
    // 접미사 벗겨서 순차 매칭: 원본 → _\d+ 벗김 → 괄호 벗김 → 둘 다 벗김
    var cands=[mn, mn.replace(/_\d+$/,''), mn.replace(/\s*\([^)]*\)\s*$/,''), mn.replace(/\s*\([^)]*\)\s*$/,'').replace(/_\d+$/,'')];
    var g=null;
    for(var i=0;i<cands.length;i++){ if(cands[i] && _m2g[cands[i]]!=null){ g=_m2g[cands[i]]; break; } }
    return (g==null||g==='')?'(미지정)':g;
  };
  var mdlSet={}; var mdlList=[];
  base.forEach(function(d){ var g=_mdlGrpOf(d); if(mdlSet[g]==null){ mdlSet[g]=0; mdlList.push(g); } mdlSet[g]++; });
  mdlList.sort(function(a,b){ if(a==='(미지정)')return 1; if(b==='(미지정)')return -1; return a.localeCompare(b,undefined,{numeric:true}); });
  if(_drbMdl&&mdlList.indexOf(_drbMdl)<0) _drbMdl='';
  var devs=base
    .filter(function(d){ if(!_drbLab) return true; var lb=String(d.lab||'').trim()||'(미지정)'; return lb===_drbLab; })
    .filter(function(d){ if(!_drbMdl) return true; return _mdlGrpOf(d)===_drbMdl; })
    .filter(function(d){ return _drbStMatch(d,_drbSt); })
    .filter(function(d){ if(!q) return true; var hay=[d.name,d.vendor,d.role,d.lab,d.ip,d.serial].map(function(x){return String(x==null?'':x);}).join(' ').toLowerCase(); return hay.indexOf(q)>=0; })
    .sort(function(a,b){ return String(a.name||'').localeCompare(String(b.name||''),undefined,{numeric:true}); });
  var _crumb=_drbNode.vendor?(_drbEsc(_drbNode.vendor)+(_drbNode.role?(' <i class="ti ti-chevron-right" style="font-size:10px;"></i> '+_drbEsc(_drbNode.role)):'')):'전체';
  var h='<div style="padding:12px 12px 10px;border-bottom:1px solid var(--border);flex-shrink:0;">'
    +'<button onclick="_drbAdd()" style="width:100%;font-size:13px;font-weight:800;padding:10px;border:none;border-radius:9px;background:#2d6fd4;color:#fff;cursor:pointer;margin-bottom:9px;box-shadow:0 2px 8px rgba(45,111,212,0.25);"><i class="ti ti-plus"></i> '+(_drbKind==='instrument'?'계측기 추가':'장비 추가')+'</button>'
    +'<input id="drb-search" placeholder="검색 — 모델·IP·구역·시리얼…" value="'+esc(_drbSearch)+'" oninput="_drbSearchInput(this.value)" style="width:100%;font-size:12.5px;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;outline:none;box-sizing:border-box;">'
    +'<div style="margin-top:9px;display:flex;flex-wrap:wrap;gap:5px;align-items:center;"><span style="font-size:10px;font-weight:800;color:var(--text3);flex-shrink:0;"><i class="ti ti-building"></i> 구역:</span>'+chip('전체',null,base.length)+labOrder.map(function(lb){ return chip(lb,lb,labCnt[lb]); }).join('')+'</div>'
    +'<div style="margin-top:8px;display:flex;gap:6px;">'
      +'<select onchange="_drbMdlSet(this.value)" style="flex:1;min-width:0;font-size:11.5px;font-weight:700;padding:6px 8px;border:1.5px solid var(--border);border-radius:8px;outline:none;background:#fff;color:var(--text2);cursor:pointer;"><option value="">모델 그룹: 전체</option>'+mdlList.map(function(n){ return '<option value="'+esc(n)+'"'+(_drbMdl===n?' selected':'')+'>'+esc(n)+'</option>'; }).join('')+'</select>'
      +'<select onchange="_drbStSet(this.value)" style="flex:1;min-width:0;font-size:11.5px;font-weight:700;padding:6px 8px;border:1.5px solid var(--border);border-radius:8px;outline:none;background:#fff;color:var(--text2);cursor:pointer;"><option value="">연결 상태: 전체</option>'+['연결됨','미연결','확인중','미확인'].map(function(s){ return '<option value="'+s+'"'+(_drbSt===s?' selected':'')+'>'+s+'</option>'; }).join('')+'</select>'
    +'</div>'
    +'<div style="margin-top:8px;font-size:11px;color:var(--text3);font-weight:700;display:flex;align-items:center;gap:5px;"><i class="ti ti-folder" style="font-size:12px;color:#e8a13c;"></i>'+_crumb+' <span style="color:#2d6fd4;">'+devs.length+'대</span></div>'
    +'</div><div style="flex:1;overflow-y:auto;padding:8px;">';
  if(!devs.length){ h+='<div style="padding:26px 10px;text-align:center;color:var(--text3);font-size:12px;">'+(q||_drbNode.vendor||_drbLab?'조건에 맞는 장비가 없습니다':(_drbKind==='instrument'?'계측기가 없습니다.':'장비가 없습니다.')+'<br>위의 <b>추가</b> 버튼으로 시작하세요.')+'</div>'; }
  // 카드형 목록
  devs.forEach(function(d){
    var on=(_drbSel===d.id);
    var c=(d.status==='연결됨'||d.status==='connected')?'#16c60c':(d.status==='실패'?'#ff4d4f':(d.status==='확인중'?'#f5b301':'#9aa3b2'));
    var stTxt=(d.status==='연결됨'||d.status==='connected')?'연결됨':(d.status==='실패'?'미연결':(d.status==='확인중'?'확인중':'미확인'));
    var _proto=String(d.protocol||'').toUpperCase();
    var _pb=_proto==='TELNET'?['TELNET','#16a34a']:(_proto==='SSH'?['SSH','#2d6fd4']:(_proto?[_proto,'#8a93a4']:null));   // 접속방식 배지 (TELNET=녹색/SSH=파랑/기타=회색)
    var _mdl=d.model||d.name||d.ip||('장비#'+String(d.id||'').slice(-4));
    var _mgrp=_mdlGrpOf(d); if(_mgrp==='(미지정)') _mgrp='';
    h+='<div onclick="_drbPick(\''+d.id+'\')" oncontextmenu="_drbCtx(event,\'dev\',\''+d.id+'\')" style="display:flex;align-items:center;gap:8px;border:1.5px solid '+(on?'#2d6fd4':'#e9ecf2')+';border-radius:9px;background:'+(on?'#f3f7ff':'#fff')+';padding:5px 12px;margin-bottom:3px;cursor:pointer;box-shadow:0 1px 3px rgba(30,40,70,0.06);white-space:nowrap;overflow:hidden;" '+(on?'':'onmouseenter="this.style.borderColor=\'#b9cef0\'" onmouseleave="this.style.borderColor=\'#e9ecf2\'"')+'>'
      +'<span style="width:9px;height:9px;border-radius:50%;background:'+c+';flex-shrink:0;box-shadow:0 0 0 3px '+c+'22;"></span>'
      +'<span style="flex-shrink:0;font-size:12px;font-weight:700;color:var(--text2);max-width:90px;overflow:hidden;text-overflow:ellipsis;">'+esc(d.vendor||'-')+'</span>'
      +'<span style="flex-shrink:0;color:var(--text3);">·</span>'
      +'<span style="flex-shrink:0;font-size:12px;font-weight:700;color:var(--text2);max-width:90px;overflow:hidden;text-overflow:ellipsis;">'+esc(d.role||'기타')+'</span>'
      +(_mgrp?('<span style="flex-shrink:0;font-size:9.5px;font-weight:800;color:#7c3aed;background:rgba(124,58,237,0.1);border-radius:8px;padding:1px 7px;white-space:nowrap;">'+esc(_mgrp)+'</span>'):'')
      +'<span style="flex:1;min-width:60px;font-size:13.5px;font-weight:800;color:'+(on?'#1a4fa0':'var(--text)')+';overflow:hidden;text-overflow:ellipsis;">'+esc(_mdl)+'</span>'
      +(d.ip?('<span style="flex-shrink:0;font-size:13px;font-weight:600;color:var(--text2);">'+esc(d.ip)+'</span>'):'<span style="flex-shrink:0;font-size:12px;color:var(--text3);">IP 미설정</span>')
      +(_pb?'<span style="flex-shrink:0;font-size:9px;font-weight:800;color:'+_pb[1]+';background:'+_pb[1]+'1a;border:1px solid '+_pb[1]+'44;border-radius:8px;padding:1px 7px;line-height:14px;letter-spacing:.04em;">'+_pb[0]+'</span>':'')
      +'<span style="flex-shrink:0;font-size:10px;font-weight:800;color:'+c+';min-width:34px;">'+stTxt+'</span>'
      +(d.lab?('<span style="flex-shrink:0;font-size:10.5px;font-weight:700;color:#b5730f;background:#fff5e6;border-radius:9px;padding:1px 7px;">'+esc(d.lab)+'</span>'):'')
    +'</div>';
  });
  h+='</div>';
  tr.innerHTML=h;
  _drbDetail();
}
function _drbPick(id){ _drbSel=id; _drbSaveState(); renderDeviceRegBeta(); }
// ── 우클릭 컨텍스트 메뉴 (트리 노드: 이름 수정·그룹 삭제 / 장비 카드: 수정·삭제) ──
function _drbCtxClose(){ var m=document.getElementById('drb-ctx'); if(m)m.remove(); }
function _drbCtx(ev,type,i){
  if(_drbKind==='summary') return;   // Summary는 조회 전용 — 우클릭 메뉴 없음
  ev.preventDefault(); ev.stopPropagation(); _drbCtxClose();
  var m=document.createElement('div'); m.id='drb-ctx';
  m.style.cssText='position:fixed;z-index:100000;background:#fff;border:1px solid var(--border);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,0.18);padding:5px;min-width:160px;';
  var item=function(icon,label,fn,danger){ return '<div onclick="_drbCtxClose();'+fn+'" style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:7px;cursor:pointer;font-size:12.5px;font-weight:600;color:'+(danger?'var(--red)':'var(--text)')+';" onmouseenter="this.style.background=\''+(danger?'#fdf0f2':'#f2f5fa')+'\'" onmouseleave="this.style.background=\'\'"><i class="ti '+icon+'" style="font-size:14px;"></i>'+label+'</div>'; };
  if(type==='dev'){
    m.innerHTML=item('ti-edit','수정','_drbPick(\''+i+'\')')+item('ti-copy','복사 (IP+1)','_drbDevCopy(\''+i+'\')')+item('ti-trash','삭제','_drbDevDel(\''+i+'\')',true);
  } else {
    var n=(window._drbNodes||[])[i]; if(!n) return;
    m.innerHTML=item('ti-edit',(n.role?'제품군명 수정':'벤더명 수정'),'_drbNodeEdit('+i+')')+item('ti-trash','그룹 장비 삭제','_drbNodeDel('+i+')',true);
  }
  document.body.appendChild(m);
  var x=ev.clientX,y=ev.clientY; var r=m.getBoundingClientRect();
  if(x+r.width>window.innerWidth-8)x=window.innerWidth-r.width-8;
  if(y+r.height>window.innerHeight-8)y=window.innerHeight-r.height-8;
  m.style.left=x+'px'; m.style.top=y+'px';
  setTimeout(function(){ document.addEventListener('click',_drbCtxClose,{once:true}); },0);
}
function _drbNodeDevs(n){
  return _drbKindDevs().filter(function(d){
    var v=String(d.vendor||'').trim()||'(벤더 미지정)';
    if(v!==n.vendor) return false;
    if(n.role&&String(d.role||'기타')!==n.role) return false;
    return true;
  });
}
function _drbNodeEdit(i){
  var n=(window._drbNodes||[])[i]; if(!n) return;
  var targets=_drbNodeDevs(n); if(!targets.length) return;
  if(n.role){
    uiPrompt({title:'제품군명 수정', label:'"'+n.vendor+' › '+n.role+'" 장비 '+targets.length+'대의 제품군', value:n.role, icon:'ti-category-2', onConfirm:async function(v){
      v=String(v||'').trim(); if(!v||v===n.role) return;
      targets.forEach(function(d){ d.role=v; });
      await saveDeviceData(); renderDeviceRegBeta(); if(typeof showToast==='function') showToast('제품군 변경: '+n.role+' → '+v+' ('+targets.length+'대)');
    }});
  } else {
    uiPrompt({title:'벤더명 수정', label:'"'+n.vendor+'" 장비 '+targets.length+'대의 벤더', value:(n.vendor==='(벤더 미지정)'?'':n.vendor), icon:'ti-building-store', onConfirm:async function(v){
      v=String(v||'').trim(); if(!v||v===n.vendor) return;
      targets.forEach(function(d){ d.vendor=v; });
      await saveDeviceData(); renderDeviceRegBeta(); if(typeof showToast==='function') showToast('벤더 변경: '+n.vendor+' → '+v+' ('+targets.length+'대)');
    }});
  }
}
function _drbNodeDel(i){
  var n=(window._drbNodes||[])[i]; if(!n) return;
  var targets=_drbNodeDevs(n); if(!targets.length) return;
  var ids={}; targets.forEach(function(d){ ids[d.id]=1; });
  var label=n.vendor+(n.role?(' › '+n.role):'');
  uiConfirm({title:'그룹 장비 삭제', icon:'ti-trash', danger:true, confirmText:'삭제', msg:'<b>'+_drbEsc(label)+'</b> 의 장비 <b>'+targets.length+'대</b>를 모두 삭제합니다.<br><span style="font-size:11.5px;color:var(--text3);"><i class="ti ti-alert-triangle"></i> 삭제 후 복구할 수 없습니다.</span>', onConfirm:async function(){
    deviceList=deviceList.filter(function(d){ return !ids[d.id]; });
    if(ids[_drbSel]) _drbSel='';
    await saveDeviceData(); renderDeviceRegBeta(); if(typeof showToast==='function') showToast(targets.length+'대 삭제됨');
  }});
}
function _drbDevDel(id){
  var d=(deviceList||[]).find(function(x){ return x.id===id; }); if(!d) return;
  uiConfirm({title:'장비 삭제', icon:'ti-trash', danger:true, confirmText:'삭제', msg:'<b>'+_drbEsc(d.name||d.ip||'장비')+'</b> 를 삭제합니다.<br><span style="font-size:11.5px;color:var(--text3);"><i class="ti ti-alert-triangle"></i> 삭제 후 복구할 수 없습니다.</span>', onConfirm:async function(){
    deviceList=deviceList.filter(function(x){ return x.id!==id; });
    if(_drbSel===id) _drbSel='';
    await saveDeviceData(); renderDeviceRegBeta(); if(typeof showToast==='function') showToast('삭제됨');
  }});
}
async function _drbDevCopy(id){
  var d=(deviceList||[]).find(function(x){ return x.id===id; }); if(!d) return;
  var copy=JSON.parse(JSON.stringify(d));
  copy.id='dev-'+Date.now()+'-'+Math.floor(Math.random()*1000);
  // IP 를 뒤 옥텟 1씩 증가시켜 이미 쓰이지 않는 첫 값 찾기
  var usedIps={}; (deviceList||[]).forEach(function(x){ if(x&&x.ip) usedIps[String(x.ip).trim()]=1; });
  if(d.ip && /^\d{1,3}(\.\d{1,3}){3}$/.test(String(d.ip).trim())){
    var _step=1, _tryIp;
    do{ _tryIp=_devIncVal(d.ip,_step); _step++; }while(usedIps[_tryIp] && _step<1000);
    copy.ip=_tryIp;
  }
  // name 뒤에도 자동 접미사 (충돌 안 나게)
  var baseName=String(d.name||'device').replace(/_\d+$/,'').replace(/\s*\(\d+\)\s*$/,'');
  var usedNames={}; (deviceList||[]).forEach(function(x){ if(x&&x.name) usedNames[String(x.name).trim()]=1; });
  var _n=1, _tryName;
  do{ _tryName=baseName+'_'+_n; _n++; }while(usedNames[_tryName] && _n<1000);
  copy.name=_tryName;
  // 연결 상태·시리얼 초기화 (원본과 혼동 방지)
  copy.status='미확인';
  if('serial' in copy) copy.serial='';
  if('mac' in copy) copy.mac='';
  // 원본 바로 뒤에 삽입
  var idx=deviceList.findIndex(function(x){return x.id===id;});
  if(idx>=0) deviceList.splice(idx+1,0,copy); else deviceList.push(copy);
  _drbSel=copy.id;
  await saveDeviceData(); renderDeviceRegBeta();
  if(typeof showToast==='function') showToast('복사됨: '+copy.name+(copy.ip?(' · '+copy.ip):''));
}
// ── 컬럼 폭 드래그 조절 (레일) — localStorage에 저장·복원 ──
function _drbApplyW(){
  try{
    [1,2].forEach(function(i){
      var w=parseInt(localStorage.getItem('utop_drb_w'+i),10);
      var el=document.getElementById(i===1?'drb-cat':'drb-tree');
      if(el&&w>=170&&w<=800) el.style.width=w+'px';
    });
  }catch(e){}
}
function _drbRailDrag(e,which){
  e.preventDefault();
  var el=document.getElementById(which===1?'drb-cat':'drb-tree'); if(!el) return;
  var startX=e.clientX, startW=el.getBoundingClientRect().width;
  var move=function(ev){ var w=Math.max(170,Math.min(800,Math.round(startW+(ev.clientX-startX)))); el.style.width=w+'px'; };
  var up=function(){
    document.removeEventListener('mousemove',move); document.removeEventListener('mouseup',up);
    document.body.style.cursor=''; document.body.style.userSelect='';
    try{ localStorage.setItem('utop_drb_w'+which, String(parseInt(el.style.width,10)||'')); }catch(err){}
  };
  document.addEventListener('mousemove',move); document.addEventListener('mouseup',up);
  document.body.style.cursor='col-resize'; document.body.style.userSelect='none';
}
function _drbDetail(){
  var dt=document.getElementById('drb-detail'); if(!dt) return;
  var esc=_drbEsc;
  if(_drbKind==='summary'){
    // 선택 범위(1열 벤더/제품군 ∩ 2열 구역) 기준 요약 — 기본값 전체
    var sList=_drbKindDevs().filter(function(d){
      if(_drbNode.vendor){ var v=String(d.vendor||'').trim()||'(벤더 미지정)'; if(v!==_drbNode.vendor) return false; }
      if(_drbNode.role){ if(String(d.role||'기타')!==_drbNode.role) return false; }
      if(_drbLab){ var lb=String(d.lab||'').trim()||'(미지정)'; if(lb!==_drbLab) return false; }
      return true;
    });
    var sTitle=(_drbNode.vendor?(_drbEsc(_drbNode.vendor)+(_drbNode.role?(' › '+_drbEsc(_drbNode.role)):'')):'전체')+(_drbLab?(' · '+_drbEsc(_drbLab)):'');
    dt.innerHTML='<div style="padding:14px 20px 0;display:flex;align-items:center;gap:8px;"><i class="ti ti-chart-bar" style="font-size:18px;color:#2d6fd4;"></i><span style="font-size:15px;font-weight:800;">Summary</span><span style="font-size:12px;color:var(--text3);font-weight:700;">'+sTitle+' · '+sList.length+'대</span></div>'
      +((typeof _devSummaryView==='function')?_devSummaryView(sList,true):'<div style="color:var(--text3);padding:20px;">Summary 없음</div>');
    return;
  }
  var d=(deviceList||[]).find(function(x){ return x.id===_drbSel; });
  if(!d){
    dt.innerHTML='<div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--text3);"><i class="ti ti-server-cog" style="font-size:44px;color:#c9d4e4;"></i><div style="font-size:13px;">왼쪽 목록에서 '+(_drbKind==='instrument'?'계측기':'장비')+'를 선택하거나 <b>+ 추가</b> 버튼으로 등록하세요</div></div>';
    return;
  }
  var inSt='flex:1;min-width:0;font-size:13px;padding:9px 11px;border:1.5px solid var(--border);border-radius:8px;outline:none;box-sizing:border-box;background:#fff;';
  var seSt=inSt+'cursor:pointer;font-weight:700;';
  var lb=function(t){ return '<div style="flex-shrink:0;width:88px;font-size:11.5px;font-weight:700;color:var(--text3);">'+t+'</div>'; };
  var fi=function(label,id,val,ph,type){ return '<div style="display:flex;align-items:center;gap:8px;">'+lb(label)+'<input id="'+id+'" '+(type?('type="'+type+'" '):'')+'value="'+esc(val)+'" placeholder="'+(ph||'')+'" style="'+inSt+'"></div>'; };
  var sel=function(label,id,opts,cur){ return '<div style="display:flex;align-items:center;gap:8px;">'+lb(label)+'<select id="'+id+'" style="'+seSt+'">'+opts.map(function(o){ return '<option value="'+esc(o)+'"'+(String(cur||'')===o?' selected':'')+'>'+(o||'(선택)')+'</option>'; }).join('')+'</select></div>'; };
  // 목록에서 고르되 없는 값은 "직접입력..."으로 자유 입력 — Vendor/Lab처럼 마스터 목록은 있지만 새 값도 등록해야 하는 필드용
  var selFree=function(label,id,opts,cur,ph){
    var curV=String(cur||'');
    var isFree=curV&&opts.indexOf(curV)<0;
    var optsAttr=esc(JSON.stringify(opts));
    if(isFree) return '<div style="display:flex;align-items:center;gap:8px;">'+lb(label)+'<input id="'+id+'" data-selfree-opts="'+optsAttr+'" data-selfree-label="'+esc(label)+'" value="'+esc(curV)+'" placeholder="'+(ph||'')+'" style="'+inSt+'">'
      +'<button type="button" onclick="_drbSelFreeToggle(\''+id+'\',true)" title="목록에서 선택" style="flex-shrink:0;width:30px;height:34px;border:1.5px solid var(--border);border-radius:8px;background:#fff;color:var(--text2);cursor:pointer;"><i class="ti ti-list" style="font-size:13px;"></i></button></div>';
    return '<div style="display:flex;align-items:center;gap:8px;">'+lb(label)+'<select id="'+id+'" data-selfree-opts="'+optsAttr+'" data-selfree-label="'+esc(label)+'" onchange="if(this.value===\'__free__\')_drbSelFreeToggle(\''+id+'\')" style="'+seSt+'">'
      +'<option value=""'+(!curV?' selected':'')+'>(선택)</option>'
      +opts.map(function(o){ return '<option value="'+esc(o)+'"'+(curV===o?' selected':'')+'>'+esc(o)+'</option>'; }).join('')
      +'<option value="__free__">+ 직접입력…</option>'
      +'</select></div>';
  };
  var st=d.status||'미확인';
  var stC=(st==='연결됨'||st==='connected')?'#0a7a52':(st==='실패'?'#c0414f':(st==='확인중'?'#b8860b':'#8a93a4'));
  var sec=function(icon,title,inner,cols){ return '<div style="background:#fff;border:1px solid var(--border);border-radius:12px;padding:16px 18px;margin-bottom:14px;">'
    +'<div style="font-size:12.5px;font-weight:800;color:var(--text2);margin-bottom:12px;display:flex;align-items:center;gap:7px;"><i class="ti '+icon+'" style="color:#2d6fd4;font-size:15px;"></i>'+title+'</div>'
    +'<div style="display:grid;grid-template-columns:repeat('+(cols||3)+',1fr);gap:12px 20px;">'+inner+'</div></div>'; };
  var roles=DEVICE_ROLES.slice();
  var venOpts=Array.from(new Set([].concat(
    (typeof vendorList!=='undefined'&&vendorList?vendorList.map(function(v){return (v&&v.name)||v;}):[]),
    (deviceList||[]).map(function(x){return x.vendor;})
  ).filter(Boolean))).sort(function(a,b){return String(a).localeCompare(String(b));});
  var labOpts=Array.from(new Set((deviceList||[]).map(function(x){return String(x.lab||'').trim();}).filter(Boolean)))
    .sort(function(a,b){return String(a).localeCompare(String(b),undefined,{numeric:true});});
  dt.innerHTML='<div style="max-width:980px;padding:18px 24px;">'
    +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">'
      +'<i class="ti '+(d.role==='계측기'?'ti-antenna':'ti-server')+'" style="font-size:22px;color:#2d6fd4;"></i>'
      +'<div style="flex:1;min-width:0;"><div style="font-size:17px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(d.name||'(모델명 없음)')+'</div>'
      +'<div style="font-size:11.5px;color:var(--text3);">'+esc(d.vendor||'-')+' · '+esc(d.role||'기타')+(d.lab?(' · '+esc(d.lab)):'')+'</div></div>'
      +'<span style="font-size:11.5px;font-weight:800;color:'+stC+';"><i class="ti ti-circle-filled" style="font-size:8px;vertical-align:middle;"></i> '+esc(st)+'</span>'
      +'<button onclick="_drbTest(\''+d.id+'\')" style="font-size:12px;font-weight:700;padding:8px 14px;border-radius:8px;border:1.5px solid #2d6fd4;background:#fff;color:#2d6fd4;cursor:pointer;"><i class="ti ti-plug"></i> 연결 확인</button>'
      +'<button onclick="_drbSave()" style="font-size:12.5px;font-weight:800;padding:8px 18px;border-radius:8px;border:none;background:#2d6fd4;color:#fff;cursor:pointer;"><i class="ti ti-device-floppy"></i> 저장</button>'
      +'<button onclick="_drbDelete()" title="장비 삭제" style="width:34px;height:34px;border-radius:8px;border:1px solid #f0c2cb;background:#fff;color:var(--red);cursor:pointer;"><i class="ti ti-trash" style="font-size:14px;"></i></button>'
    +'</div>'
    +sec('ti-id','기본 정보',
      selFree('Vendor','drb-vendor',venOpts,d.vendor||'','유비쿼스')
      +sel('제품군','drb-role',roles,d.role||'기타')
      +fi('모델명','drb-name',d.name||'','E7500')
      +selFree('Lab','drb-lab',labOpts,d.lab||'','7F-D구역')
      +sel('자산여부','drb-asset',['','BMT','자산이관','자산구매','무상임대'],d.asset||'')
      +sel('관리부서','drb-dept',['','PA1','PA2','QA'],d.dept||''))
    +sec('ti-plug-connected','접속 정보',
      fi('IP','drb-ip',d.ip||'','220.1.1.236')
      +sel('연결방식','drb-proto',['telnet','ssh','snmp','rest','tcl'],(d.protocol||'telnet'))
      +fi('Port','drb-port',d.port||'','(기본)')
      +fi('ID','drb-user',d.username||'','root')
      +fi('PW','drb-pw',d.password||'','****','password')
      +fi('Enable PW','drb-secret',d.secret||'','(선택)','password'))
    +sec('ti-box','실장·자산',
      fi('U (높이)','drb-ru',d.rack_units||'','1')
      +fi('전력(W)','drb-power',d.power||'','')
      +fi('시리얼','drb-serial',d.serial||'','')
      +fi('MAC','drb-mac',d.mac||'','')
      +('<div style="grid-column:span 3;display:flex;align-items:center;gap:8px;">'+lb('비고')+'<textarea id="drb-note" rows="1" style="'+inSt+'resize:none;font-family:inherit;line-height:normal;height:37px;min-height:37px;">'+esc(d.note||'')+'</textarea></div>'))
    +_drbPortsSec(d)
    +'<div style="font-size:11px;color:var(--text3);">연결 확인은 <b>저장된 값</b>으로 수행됩니다 — 접속 정보를 바꿨으면 먼저 저장하세요.</div>'
  +'</div>';
  if(_drbPortsCan(d)) _drbPortsFetch(d.id);
}
// selFree 필드(Vendor/Lab)의 select↔input 전환. toBack=true면 입력창→드롭다운으로 되돌림(값이 목록에 없으면 다시 자유입력으로)
function _drbSelFreeToggle(id, toBack){
  var el=document.getElementById(id); if(!el) return;
  var wrap=el.closest('div'); if(!wrap) return;
  var opts=[]; try{ opts=JSON.parse(el.dataset.selfreeOpts||'[]'); }catch(e){}
  var label=el.dataset.selfreeLabel||'';
  var esc=_drbEsc;
  var inSt='flex:1;min-width:0;font-size:13px;padding:9px 11px;border:1.5px solid var(--border);border-radius:8px;outline:none;box-sizing:border-box;background:#fff;';
  var seSt=inSt+'cursor:pointer;font-weight:700;';
  var lbHtml='<div style="flex-shrink:0;width:88px;font-size:11.5px;font-weight:700;color:var(--text3);">'+esc(label)+'</div>';
  var optsAttr=esc(JSON.stringify(opts));
  if(toBack){
    var curV=String(el.value||'');
    if(curV&&opts.indexOf(curV)<0){ el.focus(); return; }   // 여전히 목록에 없는 값이면 전환하지 않음
    wrap.innerHTML=lbHtml+'<select id="'+id+'" data-selfree-opts="'+optsAttr+'" data-selfree-label="'+esc(label)+'" onchange="if(this.value===\'__free__\')_drbSelFreeToggle(\''+id+'\')" style="'+seSt+'">'
      +'<option value=""'+(!curV?' selected':'')+'>(선택)</option>'
      +opts.map(function(o){ return '<option value="'+esc(o)+'"'+(curV===o?' selected':'')+'>'+esc(o)+'</option>'; }).join('')
      +'<option value="__free__">+ 직접입력…</option>';
  } else {
    wrap.innerHTML=lbHtml+'<input id="'+id+'" data-selfree-opts="'+optsAttr+'" data-selfree-label="'+esc(label)+'" value="" style="'+inSt+'">'
      +'<button type="button" onclick="_drbSelFreeToggle(\''+id+'\',true)" title="목록에서 선택" style="flex-shrink:0;width:30px;height:34px;border:1.5px solid var(--border);border-radius:8px;background:#fff;color:var(--text2);cursor:pointer;"><i class="ti ti-list" style="font-size:13px;"></i></button>';
    var inp=document.getElementById(id); if(inp) inp.focus();
  }
}
// ── 3열: 인터페이스 형상 (show interface status) — Rack 호버와 동일 파이프라인, 라이트 테마 전면판 ──
function _drbPortsCan(d){ var p=String((d&&d.protocol)||'').toLowerCase(); return !!(d&&d.ip&&(p==='telnet'||p==='ssh')); }
function _drbPortsSec(d){
  var can=_drbPortsCan(d);
  return '<div style="background:#fff;border:1px solid var(--border);border-radius:12px;padding:16px 18px;margin-bottom:14px;">'
    +'<div style="font-size:12.5px;font-weight:800;color:var(--text2);margin-bottom:10px;display:flex;align-items:center;gap:7px;"><i class="ti ti-topology-bus" style="color:#2d6fd4;font-size:15px;"></i>인터페이스 형상 <span style="font-weight:600;color:var(--text3);font-size:11px;">(show interface status · 저장된 접속 정보로 조회)</span><span style="flex:1;"></span>'
      +(can?'<button onclick="_drbPortsFetch(\''+d.id+'\',true)" title="다시 조회" style="width:24px;height:24px;border:1px solid var(--border);border-radius:6px;background:#fff;color:var(--text2);cursor:pointer;padding:0;"><i class="ti ti-refresh" style="font-size:12px;"></i></button>':'')
    +'</div>'
    +'<div id="drb-ports" style="font-size:12px;color:var(--text3);">'+(can?'<span class="ring-spin" style="width:12px;height:12px;border-width:2px;display:inline-block;vertical-align:-2px;"></span> 장비에서 조회 중…':'telnet/ssh + IP가 설정된 장비에서만 지원됩니다')+'</div>'
  +'</div>';
}
function _drbPortsCache(){ if(typeof _rackPortCache!=='undefined') return _rackPortCache; window._drbPC=window._drbPC||{}; return window._drbPC; }
async function _drbPortsFetch(id,force){
  var d=(deviceList||[]).find(function(x){ return x.id===id; }); if(!d||!_drbPortsCan(d)) return;
  var cache=_drbPortsCache();
  var c=cache[d.id]; var now=Date.now();
  if(!force&&c&&(now-c.ts)<(c.err?20000:60000)){ _drbPortsPaint(d.id,c); return; }
  var box=document.getElementById('drb-ports');
  if(box) box.innerHTML='<span class="ring-spin" style="width:12px;height:12px;border-width:2px;display:inline-block;vertical-align:-2px;"></span> 장비에서 조회 중…';
  var body={host:d.ip,ip:d.ip,port:d.port||0,protocol:d.protocol,username:d.username||'',password:d.password||'',secret:d.secret||'',device_type:d.device_type||((d.protocol||'')==='ssh'?'cisco_ios':'cisco_ios_telnet'),commands:['show interface status'],tail_wait:0.3};
  try{
    var r=await fetch('/api/run-cli',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    var j=await r.json();
    var out=(j&&j.outputs&&j.outputs[0]&&j.outputs[0].output)||'';
    var ports=(j&&j.ok&&typeof _rackPortsParse==='function')?_rackPortsParse(out):[];
    var ent={ts:Date.now(),ports:ports,err:(j&&j.ok)?'':String((j&&j.error)||'조회 실패')};
    if(!ent.ports.length&&!ent.err) ent.err='인터페이스 상태를 해석하지 못했습니다';
    cache[d.id]=ent; _drbPortsPaint(d.id,ent);
  }catch(e){ var ent2={ts:Date.now(),ports:[],err:(e&&e.message)||'요청 오류'}; cache[d.id]=ent2; _drbPortsPaint(d.id,ent2); }
}
// 포트 타입 분류 — MGMT·Console=노랑 / Giga=하늘 / TenGi=흰색 / Tpon=빨강
function _drbPortType(n){
  var s=String(n||'').toLowerCase();
  if(/mgmt|mgm|con(sole)?/.test(s)) return 'mgmt';
  if(/^(tp|tpon|pon|epon|gpon)/.test(s)) return 'tpon';
  if(/^(te|ten|xg|xe|tw|hu|fo)/.test(s)) return 'tengi';
  return 'giga';
}
function _drbPortsPaint(id,ent){
  if(_drbSel!==id) return;
  var box=document.getElementById('drb-ports'); if(!box) return;
  var esc=_drbEsc;
  if(ent.err){ box.innerHTML='<span style="color:var(--text3);">⚠ '+esc(ent.err)+'</span>'; return; }
  var up=0; ent.ports.forEach(function(p){ if(p.st==='up')up++; });
  // 타입별 버킷 (출력 순서 유지) — MGMT → Giga → TenGi → Tpon 순 배치 (타입은 배치 순서에만 사용)
  var buckets={mgmt:[],giga:[],tengi:[],tpon:[]};
  ent.ports.forEach(function(p){ buckets[_drbPortType(p.n)].push(p); });
  // 셀: 연결 상태 색 (초록=connected / 빨강=down) + 번호
  var cell=function(p){
    if(!p) return '<span style="width:34px;height:30px;"></span>';
    var num=(String(p.n).match(/(\d+)\s*$/)||[])[1]||'·';
    var upC=(p.st==='up');
    return '<span title="'+esc(p.n)+' — '+(upC?'connected':'down')+'" style="width:34px;height:30px;border-radius:4px;display:flex;align-items:center;justify-content:center;background:'+(upC?'#2ee06a':'#ff5a61')+';border:1.5px solid '+(upC?'#1da851':'#cc3a40')+';box-sizing:border-box;box-shadow:inset 0 -2px 0 rgba(0,0,0,0.22);">'
      +'<span style="font-size:11.5px;font-weight:800;color:'+(upC?'#04350f':'#4a0d10')+';line-height:1;">'+esc(num)+'</span>'
    +'</span>';
  };
  // 2단(홀수 위/짝수 아래) — 4열(=8포트)마다 그룹 간격
  var twoRow=function(list){
    if(!list.length) return '';
    var cols=[]; for(var i=0;i<list.length;i+=2){ cols.push([list[i],list[i+1]||null]); }
    return cols.map(function(c,ci){ return '<span style="display:flex;flex-direction:column;gap:3px;'+((ci%4===3&&ci<cols.length-1)?'margin-right:14px;':'')+'">'+cell(c[0])+cell(c[1])+'</span>'; }).join('');
  };
  // 슬롯별 세로 열 — 슬래시 앞 숫자가 슬롯 (te1/1, tp2/3 …). 열=프리픽스+슬롯, 포트가 아래로 (OLT 실장 형태)
  var slotCols=function(list){
    if(!list.length) return '';
    var bySlot={}; var order=[]; var loose=[];
    list.forEach(function(p){
      var m=String(p.n).match(/^(.*?)(\d+)\/(\d+)$/);
      if(m){ var k=m[1]+m[2]; if(!bySlot[k]){ bySlot[k]={pre:m[1],slot:parseInt(m[2],10)||0,list:[]}; order.push(k); } bySlot[k].list.push(p); }
      else loose.push(p);
    });
    order.sort(function(a,b){ var A=bySlot[a],B=bySlot[b]; return (A.slot-B.slot)||A.pre.localeCompare(B.pre); });   // 슬롯 번호순
    order.forEach(function(k){ bySlot[k].list.sort(function(x,y){ var nx=parseInt((String(x.n).match(/(\d+)\s*$/)||[])[1],10)||0, ny=parseInt((String(y.n).match(/(\d+)\s*$/)||[])[1],10)||0; return nx-ny; }); });
    var looseHtml=loose.length?('<span style="display:flex;flex-direction:column;gap:3px;align-items:center;"><span style="font-size:9.5px;font-weight:800;color:#aeb8c6;">&nbsp;</span>'+loose.map(function(p){ return cell(p); }).join('')+'</span>'):'';
    var cols=order.map(function(k){
      return '<span style="display:flex;flex-direction:column;gap:3px;align-items:center;">'
        +'<span style="font-size:9.5px;font-weight:800;color:#aeb8c6;letter-spacing:.03em;">'+esc(k)+'</span>'
        +bySlot[k].list.map(function(p){ return cell(p); }).join('')
      +'</span>';
    }).join('');
    return '<span style="display:flex;gap:8px;align-items:flex-start;">'+looseHtml+cols+'</span>';
  };
  // 하나의 전면판 패널 — 어두운 장비 섀시 느낌, 섹션 사이 간격만 (블록 분리 없음)
  var _dv=(deviceList||[]).find(function(x){ return x.id===id; });
  var isOLT=/olt/i.test(String((_dv&&_dv.role)||''));
  var sections=[];
  if(isOLT){
    // OLT: 모든 인터페이스(te·epr·tp…)를 슬롯 기준 세로 배치
    sections.push(slotCols(ent.ports));
  } else {
    if(buckets.mgmt.length)  sections.push(twoRow(buckets.mgmt));
    if(buckets.giga.length)  sections.push(twoRow(buckets.giga));
    if(buckets.tengi.length) sections.push(twoRow(buckets.tengi));
    if(buckets.tpon.length)  sections.push(slotCols(buckets.tpon));
  }
  var plate='<div style="display:flex;align-items:flex-start;gap:20px;flex-wrap:wrap;background:#262b33;border:1px solid #14171c;border-radius:10px;padding:14px 16px;box-shadow:inset 0 1px 0 rgba(255,255,255,0.06);width:fit-content;max-width:100%;">'
    +sections.map(function(s){ return '<span style="display:flex;gap:3px;align-items:flex-start;">'+s+'</span>'; }).join('')
  +'</div>';
  box.innerHTML=plate
    +'<div style="display:flex;align-items:center;gap:14px;margin-top:8px;font-size:11px;color:var(--text3);font-weight:600;flex-wrap:wrap;">'
      +'<span><span style="display:inline-block;width:11px;height:11px;border-radius:3px;background:#2ee06a;vertical-align:-1px;"></span> connected '+up+'</span>'
      +'<span><span style="display:inline-block;width:11px;height:11px;border-radius:3px;background:#ff5a61;vertical-align:-1px;"></span> down '+(ent.ports.length-up)+'</span>'
      +'<span>전체 '+ent.ports.length+'포트</span>'
    +'</div>';
}
async function _drbSave(){
  var d=(deviceList||[]).find(function(x){ return x.id===_drbSel; }); if(!d) return;
  var g=function(id){ var el=document.getElementById(id); var v=el?el.value:''; return v==='__free__'?'':v; };
  d.vendor=String(g('drb-vendor')).trim(); d.role=g('drb-role')||'기타'; d.name=String(g('drb-name')).trim(); d.lab=String(g('drb-lab')).trim();
  d.asset=g('drb-asset'); d.dept=g('drb-dept');
  d.ip=String(g('drb-ip')).trim(); d.protocol=g('drb-proto')||'telnet'; d.port=String(g('drb-port')).trim();
  d.username=String(g('drb-user')).trim(); d.password=g('drb-pw'); d.secret=g('drb-secret');
  d.rack_units=parseInt(g('drb-ru'),10)||d.rack_units||1; d.power=String(g('drb-power')).trim(); d.serial=String(g('drb-serial')).trim(); d.mac=String(g('drb-mac')).trim(); d.note=g('drb-note');
  d.device_type=(d.protocol==='ssh')?'cisco_ios':(d.protocol==='telnet')?'cisco_ios_telnet':d.protocol;
  await saveDeviceData();
  renderDeviceRegBeta();
  if(typeof showToast==='function') showToast('"'+(d.name||'장비')+'" 저장됨');
}
function _drbDelete(){
  var d=(deviceList||[]).find(function(x){ return x.id===_drbSel; }); if(!d) return;
  uiConfirm({title:'장비 삭제', icon:'ti-trash', danger:true, confirmText:'삭제', msg:'<b>'+_drbEsc(d.name||d.ip||'장비')+'</b> 를 삭제합니다.<br><span style="font-size:11.5px;color:var(--text3);"><i class="ti ti-alert-triangle"></i> 삭제 후 복구할 수 없습니다.</span>', onConfirm:async function(){ deviceList=deviceList.filter(function(x){ return x.id!==_drbSel; }); _drbSel=''; await saveDeviceData(); renderDeviceRegBeta(); if(typeof showToast==='function') showToast('삭제됨'); }});
}
async function _drbTest(id){
  var d=(deviceList||[]).find(function(x){ return x.id===id; }); if(!d) return;
  if(!d.ip){ if(typeof showToast==='function') showToast('IP를 먼저 입력하고 저장하세요'); return; }
  d.status='확인중'; renderDeviceRegBeta();
  try{
    var r=await fetch('/api/lab-test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host:d.ip,port:d.port,protocol:d.protocol,username:d.username,password:d.password,secret:d.secret,device_type:d.device_type||((d.protocol||'')==='ssh'?'cisco_ios':'cisco_ios_telnet')})});
    var j=await r.json();
    d.status=(j&&j.ok)?'연결됨':'실패';
    if(typeof showToast==='function') showToast((j&&j.ok)?('연결 성공'+(j.prompt?' · '+j.prompt:'')):('연결 실패: '+((j&&j.error)||'')));
  }catch(e){ d.status='실패'; if(typeof showToast==='function') showToast('요청 오류: '+e.message); }
  await saveDeviceData();
  renderDeviceRegBeta();
}
// 제품군 변경 시: 현재 모델명이 새 제품군 소속이 아니면 비움 + 열린 드롭다운 갱신
function _daddRoleChg(){
  var r=String(((document.getElementById('dadd-role'))||{}).value||'');
  var inp=document.getElementById('dadd-name'); if(!inp) return;
  var v=String(inp.value||'').trim();
  if(v&&r){ var mr=window._daddMdlRole||{}; if((mr[v]||'')!==r) inp.value=''; }
  var dd=document.getElementById('dadd-name-dd');
  if(dd&&dd.style.display==='block') _daddDD('dadd-name','mdl',true);
}
async function devAddSubmit(){
  var g=function(id){ var el=document.getElementById(id); return el?(el.value||''):''; };
  var name=g('dadd-name').trim();
  if(!name){ var i=document.getElementById('dadd-name'); if(i){ i.style.borderColor='var(--red)'; i.focus(); } return; }
  var _taken={}; (deviceList||[]).forEach(function(d){ if(d.name)_taken[String(d.name)]=1; });
  if(_taken[name]){ var _base=name, _n=1; while(_taken[_base+'_'+_n])_n++; name=_base+'_'+_n; }
  var _ins=(_devKind==='instrument');
  var proto=g('dadd-proto')||(_ins?'tcl':'telnet');
  // Beta(page-device-reg-beta)에서 왼쪽 트리/모델그룹 필터를 잡고 "장비 추가"를 누른 경우,
  // 그 컨텍스트를 저장 값에 자동 반영한다. 그래야 세션 팝업의 모델그룹 필터(_sessDevGroup)에서
  // 방금 추가한 장비가 걸린다. (dadd-* 필드가 비어있을 때만 채움 — 사용자가 폼에 명시 입력한 값은 존중.)
  var _isBeta=false;
  try{ var _pgB=document.getElementById('page-device-reg-beta'); _isBeta=!!(_pgB&&_pgB.classList.contains('active')); }catch(e){}
  var _role  = g('dadd-role');
  var _vendor= g('dadd-vendor').trim();
  var _model = '';   // 기존 폼에 dadd-model 필드가 없으므로 기본은 빈값
  if(_isBeta){
    if(!_role   && typeof _drbNode!=='undefined' && _drbNode && _drbNode.role)   _role=_drbNode.role;
    if(!_vendor && typeof _drbNode!=='undefined' && _drbNode && _drbNode.vendor) _vendor=_drbNode.vendor;
    // 모델그룹 필터(_drbMdl)가 걸려있고 modelList에 그 그룹에 속한 모델이 있으면 그 중 하나를 자동 선택.
    // (사용자가 "L2 스위치" 등 특정 그룹을 잡고 추가한 것이므로 그 그룹으로 분류되어야 세션 팝업에서 보임)
    try{
      if(typeof _drbMdl!=='undefined' && _drbMdl && _drbMdl!=='(미지정)' && typeof modelList!=='undefined' && Array.isArray(modelList)){
        // vendor가 지정돼있으면 그 벤더 안에서 우선 찾음, 없으면 그룹만 매칭
        var _cand=modelList.filter(function(m){ return m && String(m.group||'').trim()===_drbMdl; });
        if(_vendor){ var _cv=_cand.filter(function(m){ return String(m.vendor||'').trim()===_vendor; }); if(_cv.length) _cand=_cv; }
        if(_cand.length) _model=String(_cand[0].name||'');
      }
    }catch(e){}
  }
  deviceList.push(_ins
    ? {id:'dev-'+Date.now(),name:name,hostname:'',role:'계측기',vendor:_vendor,lab:g('dadd-lab').trim(),ip:g('dadd-ip').trim(),protocol:proto,username:g('dadd-user').trim(),port:'',asset:g('dadd-asset'),dept:g('dadd-dept'),status:'미확인'}
    : {id:'dev-'+Date.now(),name:name,hostname:'',lab:g('dadd-lab').trim(),role:_role||'기타',vendor:_vendor,model:_model,ip:g('dadd-ip').trim(),protocol:proto,username:g('dadd-user').trim(),password:g('dadd-pw'),secret:g('dadd-secret'),asset:g('dadd-asset'),dept:g('dadd-dept'),status:'미확인'});
  await saveDeviceData();
  var m=document.getElementById('dev-add-modal'); if(m)m.remove();
  _devTblPage=999999;   // 마지막 페이지로 이동 → 방금 추가한 행이 보이게
  renderDeviceTable(); showToast('"'+name+'" 추가됨');
  // Beta(트리형) 페이지가 활성일 때: 방금 추가한 장비를 선택하고 트리 갱신
  try{ var _pgB=document.getElementById('page-device-reg-beta'); if(_pgB&&_pgB.classList.contains('active')&&typeof renderDeviceRegBeta==='function'){ _drbSel=deviceList[deviceList.length-1].id; renderDeviceRegBeta(); } }catch(e){}
}
function devTblRowDel(i){ if(!deviceList[i])return; if(!confirm('이 행(장비)을 삭제할까요?'))return; deviceList.splice(i,1); saveDeviceData(); renderDeviceTable(); }
// AI 통합 메뉴 — AI 절차 생성 / LLM 학습 을 팝오버로 선택
function tcAiMenuOpen(ev, tcid){
  if(ev){ ev.stopPropagation(); ev.preventDefault(); }
  // 기존 팝업 제거
  var old=document.getElementById('tc-ai-menu-pop'); if(old) old.remove();
  var m=document.createElement('div'); m.id='tc-ai-menu-pop';
  m.style.cssText='position:fixed;z-index:100001;background:#fff;border:1px solid var(--border);border-radius:10px;box-shadow:0 10px 30px rgba(20,30,60,0.2);padding:6px;min-width:220px;font-size:12.5px;';
  var _esc=String(tcid).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  m.innerHTML=''
    +'<div onclick="_tcAiMenuPick(\''+_esc+'\',\'gen\')" class="tc-ai-item" style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:7px;cursor:pointer;" onmouseenter="this.style.background=\'#f4f0ff\'" onmouseleave="this.style.background=\'transparent\'">'
      +'<i class="ti ti-sparkles" style="font-size:16px;color:#9d7bff;flex-shrink:0;"></i>'
      +'<div style="flex:1;"><div style="font-weight:700;color:var(--text);">AI 절차 생성</div><div style="font-size:10.5px;color:var(--text3);margin-top:1px;">시험 목적으로 CLI 절차를 AI 로 자동 생성</div></div>'
    +'</div>'
    +'<div onclick="_tcAiMenuPick(\''+_esc+'\',\'learn\')" class="tc-ai-item" style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:7px;cursor:pointer;" onmouseenter="this.style.background=\'#f4f0ff\'" onmouseleave="this.style.background=\'transparent\'">'
      +'<i class="ti ti-brain" style="font-size:16px;color:#7c3aed;flex-shrink:0;"></i>'
      +'<div style="flex:1;"><div style="font-weight:700;color:var(--text);">LLM 학습</div><div style="font-size:10.5px;color:var(--text3);margin-top:1px;">이 절차를 검증된 예시로 학습 데이터에 저장</div></div>'
    +'</div>';
  document.body.appendChild(m);
  // 버튼 아래에 배치 (viewport 경계 안 넘도록 보정)
  var btn=ev&&ev.currentTarget;
  var r=btn?btn.getBoundingClientRect():null;
  var mw=m.offsetWidth||220, mh=m.offsetHeight||100;
  var x=r?Math.min(window.innerWidth-mw-8, Math.max(8, r.left)):(ev?ev.clientX:100);
  var y=r?Math.min(window.innerHeight-mh-8, r.bottom+4):(ev?ev.clientY:100);
  m.style.left=x+'px'; m.style.top=y+'px';
  // 바깥 클릭 시 닫기
  setTimeout(function(){
    document.addEventListener('mousedown', function _out(e){
      if(m.contains(e.target)) return;
      try{ m.remove(); }catch(_e){}
      document.removeEventListener('mousedown', _out);
    });
  }, 0);
}
function _tcAiMenuPick(tcid, kind){
  var m=document.getElementById('tc-ai-menu-pop'); if(m) try{ m.remove(); }catch(_e){}
  if(kind==='gen'){ if(typeof tcAIGenSteps==='function') tcAIGenSteps(tcid); }
  else if(kind==='learn'){ if(typeof tcLearnSave==='function') tcLearnSave(tcid); }
}
// ── AI 절차 생성 (S2): 시험 목적 → /api/llm/generate (RAG 학습 예시 few-shot) → cli 스텝 추가 ──
async function tcAIGenSteps(tcid){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc){ if(typeof showToast==='function')showToast('TC를 찾을 수 없습니다'); return; }
  const _md=String(tc.object||tc.overview||'').replace(/<[^>]+>/g,' ').replace(/[#*`>]/g,'').replace(/\s+/g,' ').trim();
  const purpose=prompt('시험 목적을 입력하세요 (AI가 CLI 절차를 생성합니다):', _md.slice(0,200)||tc.name||'');
  if(!purpose||!purpose.trim()) return;
  if(typeof showToast==='function')showToast('AI 절차 생성 중… (학습 예시 참조)');
  try{
    const r=await fetch('/api/llm/generate',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({purpose:purpose.trim(), model:tc.model||((tc.models||[])[0])||'', role:tc.role||''})});
    const d=await r.json();
    if(!d.ok){ if(typeof showToast==='function')showToast('생성 실패: '+String(d.error||'').slice(0,120)); return; }
    const steps=d.steps||[];
    if(!steps.length){ if(typeof showToast==='function')showToast('생성된 절차가 없습니다'); return; }
    tc.checks=tc.checks||[];
    steps.forEach(function(s,i){
      tc.checks.push({id:'ck'+Date.now()+Math.floor(Math.random()*1000000)+i, kind:'cli', action:'CLI',
        desc:s.desc||'', cli:s.cli||'', type:s.type||'contains', criteria:s.criteria||''});
    });
    await saveTCFile(tc); tcProcRefresh(tcid);
    if(typeof showToast==='function')showToast('✅ AI 절차 '+steps.length+'개 생성 (예시 '+(d.used_examples||0)+'건 참조)');
  }catch(e){ if(typeof showToast==='function')showToast('요청 오류: '+e.message); }
}
// ── Env 탭 LLM 버튼 (목적/사전조건 생성): 로컬 LLM + RAG 근거 → toast-ui 에디터에 반영 ──
async function tcLLMGen(tcid, field){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc){ if(typeof showToast==='function')showToast('TC를 찾을 수 없습니다'); return; }
  const r=(typeof reqList!=='undefined'?reqList:[]).find(x=>x.id===tc.req_id)||{};
  const lbl=field==='object'?'목적(Object)':'사전조건(Pre-Condition)';
  const llm=(typeof llmList!=='undefined'?llmList:[]).find(x=>x.status==='active'&&x.type!=='claude'&&x.endpoint)||(typeof llmList!=='undefined'?llmList:[]).find(x=>x.status==='active');
  if(!llm){ if(typeof showToast==='function')showToast('등록된 LLM이 없습니다 (AI Assistant ▸ LLM 설정)'); return; }
  if(typeof showToast==='function')showToast(lbl+' 생성 중…');
  try{
    // RAG 근거: 유사 TC·REQ·매뉴얼 검색
    let ragCtx='';
    try{
      const rr=await fetch('/api/rag/search',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({query:(tc.name||'')+' '+(r.title||''),top_k:3,confluence:false,min_score:0.2})});
      const rd=await rr.json();
      ragCtx=((rd&&rd.hits)||[]).map((h,i)=>'('+(i+1)+') '+String(h.text||'').slice(0,400)).join('\n');
    }catch(e){}
    const ask=field==='object'
      ?'이 TC의 시험 목적을 2~4문장 Markdown으로 작성하라. 무엇을(기능/성능) 어떤 조건에서 검증하는지 명확히.'
      :'이 TC의 사전조건(시험 전 장비 상태·구성·연결)을 Markdown 목록으로 작성하라. 각 항목은 준비 가능한 구체적 상태로.';
    const prompt='TC: '+(tc.tcid||'')+' / '+(tc.name||'')+'\nREQ: '+(r.title||'')+'\nREQ 개요: '+String(r.overview||'').replace(/<[^>]+>/g,' ').slice(0,400)
      +(ragCtx?('\n[유사 사내 자료]\n'+ragCtx):'')+'\n\n'+ask+' 결과 텍스트만 출력(설명·코드펜스 금지).';
    const res=await fetch('/api/chat/local',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({endpoint:llm.endpoint,model:llm.model,messages:[{role:'user',content:prompt}],
        max_tokens:llm.max_tokens||1024,context_size:llm.context_size||262144,temperature:0.3,apikey:llm.apikey||''})});
    const reply=String(((await res.json())||{}).reply||'').trim();
    if(!reply){ if(typeof showToast==='function')showToast('LLM 응답이 없습니다'); return; }
    const ed=window['_tcMd_'+field+'_'+tcid];
    if(ed&&ed.setMarkdown){ ed.setMarkdown(reply); }   // change 훅이 자동 저장
    else if(typeof saveTCTinyFieldMd==='function'){ await saveTCTinyFieldMd(tcid, field, reply, ''); }
    if(typeof showToast==='function')showToast('✅ '+lbl+' 생성 완료');
  }catch(e){ if(typeof showToast==='function')showToast('요청 오류: '+e.message); }
}
// 이 TC의 절차를 "검증된 정상 절차"로 학습(저장) — LLM 절차 생성의 few-shot 데이터로 누적
async function tcLearnSave(tcid){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc){ if(typeof showToast==='function')showToast('TC를 찾을 수 없습니다'); return; }
  const _rawOut=function(c){ return String(c.output||'').replace(/\n*─── 기준 비교 ───[\s\S]*$/,'').replace(/\n*─── 표 검증 ───[\s\S]*$/,'').replace(/\n*─── 판정 근거 ───[\s\S]*$/,'').replace(/\n*─── Query 영역[\s\S]*$/,'').trim().slice(0,3000); };
  const checks=tc.checks||[];
  const _eff=(typeof _effModelOfStep==='function')?_effModelOfStep:function(arr,i){ for(var j=i;j>=0;j--){ if((arr[j].kind||'cli')==='model') return arr[j].modelName||'공통'; } return '공통'; };
  // cli 스텝 + 효과 모델(모델그룹) 수집
  const cliSteps=[];
  checks.forEach(function(c,i){ if((c.kind||'cli')!=='cli') return; if(!(String(c.cli||'').trim()||String(c.desc||'').trim())) return;
    var em=_eff(checks,i);
    cliSteps.push({ eff:em, step:{desc:String(c.desc||'').trim(),cli:String(c.cli||'').trim(),type:c.type||'contains',criteria:String(c.criteria||''),model:em,output:_rawOut(c),result:c.result||'',imageText:(Array.isArray(c.images)?c.images.map(im=>im.text).filter(Boolean).join('\n').slice(0,4000):'')} });
  });
  if(!cliSteps.length){ if(typeof showToast==='function')showToast('학습할 CLI 스텝이 없습니다'); return; }
  const _mInfo=function(name){ var d=(typeof modelList!=='undefined'?modelList:[]).find(function(x){return x.name===name;})||(typeof deviceList!=='undefined'?deviceList:[]).find(function(x){return x.name===name||x.model===name;}); return d?{role:d.role||'',vendor:d.vendor||''}:{role:'',vendor:''}; };
  const groupModels=[...new Set(cliSteps.map(function(x){return x.eff;}).filter(function(m){return m&&m!=='공통';}))];
  var entries=[];
  if(!groupModels.length){
    // 모델그룹 없음 → 세션 모델 기준 1건
    var sids=(Array.isArray(tc.sessions)&&tc.sessions.length)?tc.sessions:(tc.sessionLabId?[tc.sessionLabId]:[]);
    var sm=sids.map(function(sid){ var l=(typeof labList!=='undefined'?labList:[]).find(function(x){return x.id===sid;}); return l?String(l.name||l.model||'').trim():''; }).filter(Boolean);
    var inf0=sm.length?_mInfo(sm[0]):{role:'',vendor:''};
    entries.push({models:sm.length?sm:['공통'],role:inf0.role,vendor:inf0.vendor,steps:cliSteps.map(function(x){return x.step;})});
  } else {
    groupModels.forEach(function(m){
      var steps=cliSteps.filter(function(x){return x.eff==='공통'||x.eff===m;}).map(function(x){return x.step;});
      var inf=_mInfo(m);
      entries.push({models:[m],role:inf.role,vendor:inf.vendor,steps:steps});
    });
  }
  _tcLearnPending={tcid:(tc.tcid||tc.id||''), name:(tc.name||''), entries:entries};
  _tcLearnModalShow();
}
let _tcLearnPending=null;
function _tcLearnModalShow(){
  const p=_tcLearnPending; if(!p)return;
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const old=document.getElementById('tc-learn-modal'); if(old)old.remove();
  const m=document.createElement('div'); m.id='tc-learn-modal';
  m.style.cssText='position:fixed;inset:0;background:rgba(20,16,40,0.45);backdrop-filter:blur(2px);z-index:12000;display:flex;align-items:center;justify-content:center;padding:24px;';
  const cards=p.entries.map(function(e){
    const sp=(e.steps||[]).slice(0,4).map(function(s){return '<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><span style="color:#7c3aed;">•</span> '+esc(s.desc||s.cli||'(스텝)')+(s.imageText?' <span style="color:#7c3aed;">📷</span>':'')+'</div>';}).join('')+((e.steps||[]).length>4?('<div style="color:var(--text3);">… 외 '+((e.steps||[]).length-4)+'개</div>'):'');
    return '<div style="border:1px solid #e7defb;border-radius:12px;padding:12px 14px;background:#fff;">'
      +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;flex-wrap:wrap;"><span style="font-size:12px;font-weight:800;color:#fff;background:linear-gradient(135deg,#7c3aed,#9d7bff);border-radius:8px;padding:3px 11px;">'+esc(e.models.join(' / ')||'공통')+'</span><span style="font-size:11.5px;color:var(--text3);font-weight:700;">'+(e.steps||[]).length+' 스텝</span>'+(e.role?('<span style="font-size:11px;color:var(--text3);">· '+esc(e.role)+'</span>'):'')+'</div>'
      +'<div style="font-size:11.5px;color:var(--text2);line-height:1.75;font-family:ui-monospace,monospace;">'+sp+'</div>'
    +'</div>';
  }).join('');
  m.innerHTML='<div style="background:#fff;border-radius:18px;max-width:560px;width:100%;max-height:86vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 70px rgba(40,20,90,0.4);">'
    +'<div style="padding:20px 22px 16px;background:linear-gradient(135deg,#faf7ff,#f1ecff);border-bottom:1px solid #e7defb;">'
      +'<div style="display:flex;align-items:center;gap:11px;"><div style="width:44px;height:44px;border-radius:13px;background:linear-gradient(135deg,#7c3aed,#9d7bff);display:flex;align-items:center;justify-content:center;box-shadow:0 6px 16px rgba(124,58,237,0.45);"><i class="ti ti-brain" style="color:#fff;font-size:24px;"></i></div>'
        +'<div style="flex:1;min-width:0;"><div style="font-size:17px;font-weight:800;color:#2a1b52;">LLM 학습</div><div style="font-size:12px;color:#6b5b95;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(p.name)+'</div></div>'
        +'<i class="ti ti-x" onclick="document.getElementById(\'tc-learn-modal\').remove()" style="cursor:pointer;font-size:22px;color:#9a8cc0;"></i></div>'
      +'<div style="font-size:12.5px;color:#5c4d85;margin-top:13px;line-height:1.55;">검증된 정상 절차를 <b style="color:#7c3aed;">모델그룹별 '+p.entries.length+'개 항목</b>으로 학습합니다.<br><span style="color:#8a7bb5;font-size:11.5px;">공통 스텝은 각 그룹에 포함되며, AI 절차생성·자연어 조회의 근거 데이터로 사용됩니다.</span></div>'
    +'</div>'
    +'<div style="flex:1;overflow:auto;padding:16px 22px;display:flex;flex-direction:column;gap:10px;background:#faf9fc;">'+cards+'</div>'
    +'<div style="padding:14px 22px;border-top:1px solid #ece7f6;display:flex;gap:10px;justify-content:flex-end;background:#fff;">'
      +'<button onclick="document.getElementById(\'tc-learn-modal\').remove()" style="font-size:13px;font-weight:700;padding:10px 20px;border-radius:11px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;">취소</button>'
      +'<button id="tc-learn-go" onclick="_tcLearnCommit()" style="font-size:13px;font-weight:800;padding:10px 24px;border-radius:11px;border:none;background:linear-gradient(135deg,#7c3aed,#9d7bff);color:#fff;cursor:pointer;box-shadow:0 6px 16px rgba(124,58,237,0.4);"><i class="ti ti-brain"></i> 학습하기</button>'
    +'</div>'
  +'</div>';
  m.addEventListener('click',function(e){ if(e.target===m)m.remove(); });
  document.body.appendChild(m);
}
async function _tcLearnCommit(){
  const p=_tcLearnPending; if(!p)return;
  const go=document.getElementById('tc-learn-go'); if(go){ go.disabled=true; go.innerHTML='<i class="ti ti-loader-2 spin"></i> 학습 중…'; go.style.opacity='0.8'; }
  const by=(typeof currentUser!=='undefined'&&currentUser)?(currentUser.name||currentUser.username||''):'';
  var ok=0;
  for(const e of p.entries){
    try{ await userApi('POST','/api/learn/procedure',{tcid:p.tcid,title:p.name,models:e.models,role:e.role,vendor:e.vendor,steps:e.steps,by:by}); ok++; }
    catch(err){ if(typeof showToast==='function')showToast('학습 실패('+e.models.join(',')+'): '+((err&&err.message)||err)); }
  }
  const md=document.getElementById('tc-learn-modal'); if(md)md.remove();
  _tcLearnPending=null;
  if(ok&&typeof showToast==='function')showToast('🧠 모델그룹별 학습 완료 — '+ok+'개 항목 저장');
}
// 학습된 절차 목록 보기(확인/삭제)
async function tcLearnList(){
  let items=[]; try{ const d=await (await fetch('/api/learn/procedures?limit=300')).json(); items=(d&&d.items)||[]; }catch(e){}
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const old=document.getElementById('learn-list-modal'); if(old)old.remove();
  const m=document.createElement('div'); m.id='learn-list-modal'; m.className='modal-overlay'; m.style.display='flex';
  const rows=items.length?items.map(function(it){ return '<div style="border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:8px;background:#fff;"><div style="display:flex;align-items:center;gap:8px;"><b style="font-size:13.5px;flex:1;color:var(--text);">'+esc(it.title||'(제목없음)')+'</b><span style="font-size:11px;color:#7c3aed;font-weight:600;">'+esc((it.models||[]).join(', '))+'</span><i class="ti ti-trash" onclick="tcLearnDel(\''+it.id+'\')" title="삭제" style="cursor:pointer;color:#b6c0cf;font-size:15px;" onmouseenter="this.style.color=\'#e53e5a\'" onmouseleave="this.style.color=\'#b6c0cf\'"></i></div><div style="font-size:11px;color:var(--text3);margin-top:3px;">'+esc(it.role||'')+(it.role?' · ':'')+'스텝 '+((it.steps||[]).length)+'개 · '+esc(it.by||'')+' · '+esc(it.at||'')+'</div><div style="font-size:11.5px;color:var(--text2);margin-top:6px;font-family:monospace;line-height:1.5;background:var(--bg3);border-radius:6px;padding:6px 8px;max-height:130px;overflow:auto;">'+((it.steps||[]).map(function(s){return (s.desc?('• '+esc(s.desc)+'<br>'):'')+'$ '+esc(s.cli||'(명령 없음)')+(s.criteria?('   ['+esc(s.type)+' "'+esc(s.criteria)+'"]'):'');}).join('<br>')||'(스텝 없음)')+'</div></div>'; }).join(''):'<div style="padding:36px;text-align:center;color:var(--text3);">학습된 절차가 없습니다. TC에서 <b>LLM 학습</b>으로 저장하세요.</div>';
  m.innerHTML='<div class="modal" style="width:740px;max-width:95vw;max-height:85vh;display:flex;flex-direction:column;border-radius:12px;overflow:hidden;"><div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;background:var(--bg2);"><i class="ti ti-brain" style="color:#7c3aed;"></i><b style="font-size:15px;flex:1;">LLM 학습 데이터 ('+items.length+'건)</b><button onclick="document.getElementById(\'learn-list-modal\').remove()" style="width:26px;height:26px;border:none;border-radius:6px;background:var(--bg3);cursor:pointer;"><i class="ti ti-x"></i></button></div><div style="flex:1;overflow:auto;padding:16px 18px;">'+rows+'</div></div>';
  document.body.appendChild(m); m.addEventListener('click',function(e){ if(e.target===m)m.remove(); });
}
async function tcLearnDel(id){ if(!confirm('이 학습 항목을 삭제할까요?'))return; try{ await userApi('DELETE','/api/learn/procedure/'+encodeURIComponent(id)); tcLearnList(); }catch(e){ if(typeof showToast==='function')showToast(e.message); } }
// ── 시험절차 스텝 이미지(OCR) ──
function _imgThumb(file,maxW,maxH){
  return new Promise(function(res,rej){
    const fr=new FileReader();
    fr.onload=function(){ const img=new Image(); img.onload=function(){ var w=img.width,h=img.height; var sc=Math.min(maxW/w,maxH/h,1); var cw=Math.max(1,Math.round(w*sc)),ch=Math.max(1,Math.round(h*sc)); var cv=document.createElement('canvas'); cv.width=cw;cv.height=ch; cv.getContext('2d').drawImage(img,0,0,cw,ch); try{res(cv.toDataURL('image/jpeg',0.82));}catch(e){res(fr.result);} }; img.onerror=function(){res(fr.result);}; img.src=fr.result; };
    fr.onerror=rej; fr.readAsDataURL(file);
  });
}
async function tcStepImgAdd(tcid,ckid){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc)return;
  const c=(tc.checks||[]).find(x=>x.id===ckid); if(!c)return;
  const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*'; inp.multiple=true;
  inp.onchange=async function(){
    const files=Array.from(inp.files||[]); if(!files.length)return;
    if(!Array.isArray(c.images)) c.images=[];
    const hasVision=(typeof _pickVisionLLM==='function')&&!!_pickVisionLLM();
    let okN=0, txtN=0;
    for(let fi=0;fi<files.length;fi++){ const f=files[fi];
      try{
        if(typeof showToast==='function')showToast('이미지 인식 중… ('+(fi+1)+'/'+files.length+') · '+(hasVision?'AI비전(gemma)':'OCR'));
        const thumb=await _imgThumb(f,560,360);
        let text='';
        try{
          if(hasVision && typeof _visionExtractBlob==='function'){ text=await _visionExtractBlob(f); }   // gemma 멀티모달 우선 (폐쇄망에서도 동작)
          else if(typeof _ocrImage==='function'){ text=await _ocrImage(f); }
        }catch(e1){
          try{ if(typeof _ocrImage==='function') text=await _ocrImage(f); }catch(e2){ text=''; }   // 비전 실패 → Tesseract OCR 폴백
        }
        text=String(text||'').trim();
        c.images.push({name:f.name||'image', thumb:thumb, text:text.slice(0,4000)});
        if(text) txtN++; okN++;
        await saveTCFile(tc); tcProcRefresh(tcid);
      }catch(e){ if(typeof showToast==='function')showToast('이미지 처리 실패: '+((e&&e.message)||e)); }
    }
    if(typeof showToast==='function'){
      if(txtN) showToast('📷 이미지 '+okN+'장 첨부 · '+txtN+'장 글자 인식 완료');
      else showToast('📷 이미지 '+okN+'장 첨부 — 자동 인식 0자. 썸네일 클릭 → OCR 텍스트 직접 입력 가능 (비전 모델 미선택·미지원 또는 OCR 로딩 실패)');
    }
  };
  inp.click();
}
// 수동 스텝 Expected Result 칸에 이미지 붙여넣기(Ctrl+V) — 자동 리사이즈 후 단일 썸네일로 저장
function tcManualExpImgPaste(ev,tcid,ckid){
  const items=(ev.clipboardData&&ev.clipboardData.items)||[];
  let blob=null; for(let i=0;i<items.length;i++){ if((items[i].type||'').indexOf('image')===0){ blob=items[i].getAsFile(); break; } }
  if(!blob) return;   // 이미지 아니면 기본 텍스트 붙여넣기 그대로 진행
  ev.preventDefault();
  _imgThumb(blob,1920,1440).then(function(dataUrl){
    const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc)return;
    const c=(tc.checks||[]).find(x=>x.id===ckid); if(!c)return;
    c.expected_img=dataUrl;
    saveTCFile(tc); tcProcRefresh(tcid);
  });
}
function tcManualExpImgDel(tcid,ckid){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc)return;
  const c=(tc.checks||[]).find(x=>x.id===ckid); if(!c)return;
  delete c.expected_img; delete c.expected_img_w; delete c.expected_img_h; saveTCFile(tc); tcProcRefresh(tcid);
}
// 이미지 컨테이너 가장자리(우측=가로만·하단=세로만·모서리=둘 다) 드래그로 크기 조절
// (CSS resize:both는 모서리 핸들 하나만 제공해 가로/세로를 독립적으로 조절할 수 없어 직접 구현)
function tcManualExpImgResizeStart(ev,tcid,ckid,dir){
  ev.preventDefault(); ev.stopPropagation();
  const box=ev.currentTarget.parentElement; if(!box) return;
  const startX=ev.clientX, startY=ev.clientY, startW=box.offsetWidth, startH=box.offsetHeight;
  const onMove=function(e){
    if(dir==='e'||dir==='se') box.style.width=Math.max(60,startW+(e.clientX-startX))+'px';
    if(dir==='s'||dir==='se') box.style.height=Math.max(40,startH+(e.clientY-startY))+'px';
  };
  const onUp=function(){ document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp); };
  document.addEventListener('mousemove',onMove); document.addEventListener('mouseup',onUp);
}
// 이미지 컨테이너(.tcManExpImgBox) 크기 변화를 ResizeObserver로 감지해 저장(위 드래그 및 향후 확장 모두 커버)
var _tcManExpImgRO=null, _tcManExpImgSaveT={};
function _tcManExpImgObserveAll(){
  if(typeof ResizeObserver==='undefined') return;
  if(!_tcManExpImgRO){
    _tcManExpImgRO=new ResizeObserver(function(entries){
      entries.forEach(function(en){
        var box=en.target; var tcid=box.dataset.tcid, ckid=box.dataset.ckid; if(!tcid||!ckid) return;
        var w=Math.round(box.offsetWidth), h=Math.round(box.offsetHeight);
        var key=tcid+'::'+ckid;
        clearTimeout(_tcManExpImgSaveT[key]);
        _tcManExpImgSaveT[key]=setTimeout(function(){ _tcManExpImgSave(tcid,ckid,w,h); },400);   // 드래그 중 연속 발화 → 디바운스 후 1회 저장
      });
    });
  }
  document.querySelectorAll('.tcManExpImgBox').forEach(function(el){ _tcManExpImgRO.observe(el); });
}
function _tcManExpImgSave(tcid,ckid,w,h){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc)return;
  const c=(tc.checks||[]).find(x=>x.id===ckid); if(!c)return;
  if(w===(parseInt(c.expected_img_w)||220)&&h===(parseInt(c.expected_img_h)||140)) return;   // 변화 없으면 저장 생략
  c.expected_img_w=w; c.expected_img_h=h; saveTCFile(tc);
  if(typeof showToast==='function') showToast('이미지 크기 저장됨');
}
function tcManualExpImgView(tcid,ckid){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc)return;
  const c=(tc.checks||[]).find(x=>x.id===ckid); if(!c||!c.expected_img)return;
  const m=document.createElement('div'); m.id='_manexpimgmodal'; m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.62);z-index:12000;display:flex;align-items:center;justify-content:center;padding:30px;';
  m.onclick=function(e){ if(e.target===m) m.remove(); };
  m.innerHTML='<div style="background:#fff;border-radius:12px;max-width:860px;width:100%;max-height:90vh;overflow:auto;padding:18px;box-sizing:border-box;">'
    +'<div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:10px;">'
    +'<button onclick="tcManualExpImgDel(\''+tcid+'\',\''+ckid+'\');document.getElementById(\'_manexpimgmodal\').remove();" style="font-size:12px;padding:6px 12px;border-radius:6px;border:1px solid var(--red);background:#fff;color:var(--red);cursor:pointer;font-weight:700;"><i class="ti ti-trash"></i> 삭제</button>'
    +'<button onclick="document.getElementById(\'_manexpimgmodal\').remove()" style="font-size:12px;padding:6px 12px;border-radius:6px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;">닫기</button>'
    +'</div><img src="'+c.expected_img+'" style="max-width:100%;display:block;border-radius:8px;">'
    +'</div>';
  document.body.appendChild(m);
}
async function tcStepImgDel(tcid,ckid,idx){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc)return;
  const c=(tc.checks||[]).find(x=>x.id===ckid); if(!c||!Array.isArray(c.images))return;
  c.images.splice(idx,1); await saveTCFile(tc); tcProcRefresh(tcid);
}
function tcStepImgView(tcid,ckid,idx){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc)return;
  const c=(tc.checks||[]).find(x=>x.id===ckid); if(!c||!Array.isArray(c.images))return;
  const im=c.images[idx]; if(!im)return;
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const m=document.createElement('div'); m.id='_stepimgmodal'; m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.62);z-index:12000;display:flex;align-items:center;justify-content:center;padding:30px;';
  m.innerHTML='<div style="background:#fff;border-radius:12px;max-width:860px;width:100%;max-height:90vh;overflow:auto;padding:18px;box-sizing:border-box;">'
    +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;"><b style="flex:1;font-size:14px;">'+esc(im.name||'이미지')+'</b><i class="ti ti-x" onclick="document.getElementById(\'_stepimgmodal\').remove()" style="cursor:pointer;font-size:20px;color:var(--text3);"></i></div>'
    +'<img src="'+(im.thumb||'')+'" style="max-width:100%;border-radius:8px;border:1px solid var(--border);display:block;">'
    +'<div style="font-size:12px;font-weight:700;color:#7c3aed;margin:12px 0 5px;"><i class="ti ti-text-recognition"></i> OCR 인식 텍스트 (수정 가능 — 학습에 이 텍스트가 반영됨)</div>'
    +'<textarea id="_stepimgtxt" style="width:100%;min-height:170px;font-size:12px;font-family:monospace;padding:9px;border:1px solid var(--border);border-radius:7px;box-sizing:border-box;line-height:1.5;">'+esc(im.text||'')+'</textarea>'
    +'<div style="text-align:right;margin-top:8px;"><button onclick="tcStepImgSaveText(\''+tcid+'\',\''+ckid+'\','+idx+')" style="font-size:12px;font-weight:700;padding:7px 16px;border:none;border-radius:7px;background:#7c3aed;color:#fff;cursor:pointer;">텍스트 저장</button></div>'
  +'</div>';
  m.addEventListener('click',e=>{if(e.target===m)m.remove();});
  document.body.appendChild(m);
}
async function tcStepImgSaveText(tcid,ckid,idx){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc)return;
  const c=(tc.checks||[]).find(x=>x.id===ckid); if(!c||!Array.isArray(c.images)||!c.images[idx])return;
  const ta=document.getElementById('_stepimgtxt'); if(ta) c.images[idx].text=String(ta.value||'').slice(0,4000);
  await saveTCFile(tc); const m=document.getElementById('_stepimgmodal'); if(m)m.remove();
  tcProcRefresh(tcid); if(typeof showToast==='function')showToast('OCR 텍스트 저장됨');
}
// ── 시험절차 학습/조회 페이지 (AI Assistant 메뉴) ──
let _aiAskAnswer='';
async function renderAILearn(){
  const body=document.getElementById('ai-learn-body'); if(!body)return;
  body.innerHTML='<div style="color:var(--text3);padding:20px;">불러오는 중…</div>';
  let items=[]; try{ const d=await (await fetch('/api/learn/procedures?limit=500')).json(); items=(d&&d.items)||[]; }catch(e){}
  window._aiLearnItems=items; _aiLearnRender('');
}
function _aiStepTable(steps,esc){
  if(!steps||!steps.length) return '<div style="font-size:11.5px;color:var(--text3);padding:6px 2px;">스텝 없음</div>';
  return '<table style="width:100%;border-collapse:collapse;font-size:11.5px;table-layout:fixed;"><thead><tr style="background:var(--bg3);color:var(--text3);">'
    +'<th style="padding:4px 7px;text-align:left;width:26px;">#</th><th style="padding:4px 7px;text-align:left;width:23%;">시험 설명</th><th style="padding:4px 7px;text-align:left;width:20%;">CLI</th><th style="padding:4px 7px;text-align:left;width:52px;">판정</th><th style="padding:4px 7px;text-align:left;width:17%;">기준</th><th style="padding:4px 7px;text-align:left;">정상출력</th></tr></thead><tbody>'
    +steps.map(function(s,i){ var o=String(s.output||''),itx=String(s.imageText||''); return '<tr style="border-top:1px solid var(--border);vertical-align:top;">'
      +'<td style="padding:4px 7px;color:var(--text3);">'+(i+1)+'</td>'
      +'<td style="padding:4px 7px;font-weight:600;word-break:break-all;">'+esc(s.desc||'')+'</td>'
      +'<td style="padding:4px 7px;font-family:monospace;color:#1c2942;word-break:break-all;">'+esc(s.cli||'')+'</td>'
      +'<td style="padding:4px 7px;color:var(--text3);">'+esc(s.type||'')+'</td>'
      +'<td style="padding:4px 7px;color:#7c3aed;word-break:break-all;">'+esc(s.criteria||'')+'</td>'
      +'<td style="padding:4px 7px;color:#8a96a6;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="'+esc(o.slice(0,500))+'">'+(o?(esc(o.replace(/\s+/g,' ').slice(0,70))+(o.length>70?'…':'')):'<span style="color:#cdd3dc;">(미실행)</span>')+(itx?(' <span title="'+esc(itx.slice(0,600))+'" style="color:#7c3aed;cursor:help;">📷'+itx.replace(/\s+/g,'').length+'</span>'):'')+'</td></tr>'; }).join('')
    +'</tbody></table>';
}
function _aiLearnRender(q){
  const body=document.getElementById('ai-learn-body'); if(!body)return;
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const items=window._aiLearnItems||[]; q=(q||'').toLowerCase().trim();
  const shown=q?items.filter(function(it){ return ((it.title||'')+' '+((it.models||[]).join(' '))+' '+(it.role||'')+' '+((it.steps||[]).map(function(s){return (s.desc||'')+' '+(s.cli||'');}).join(' '))).toLowerCase().indexOf(q)>=0; }):items;
  // 제품군(role) ▸ 시험항목 으로 그룹핑
  const groups={}; shown.forEach(function(it){ var r=it.role||'(제품군 미지정)'; (groups[r]=groups[r]||[]).push(it); });
  const itemCard=function(it){ return '<div style="border:1px solid var(--border);border-radius:10px;margin-bottom:8px;background:#fff;overflow:hidden;">'
    +'<div style="display:flex;align-items:center;gap:8px;padding:9px 13px;background:var(--bg2);border-bottom:1px solid var(--border);">'
      +'<i class="ti ti-clipboard-check" style="color:#7c3aed;"></i><b style="font-size:13.5px;flex:1;color:var(--text);">'+esc(it.title||'(제목없음)')+'</b>'
      +'<span style="font-size:11px;font-weight:700;color:#7c3aed;background:rgba(124,58,237,0.1);border-radius:8px;padding:2px 9px;">'+esc((it.models||[]).join(', ')||'-')+'</span>'
      +'<span style="font-size:10.5px;color:var(--text3);">스텝 '+((it.steps||[]).length)+' · '+esc(it.by||'')+' · '+esc(it.at||'')+'</span>'
      +'<i class="ti ti-trash" onclick="aiLearnDel(\''+it.id+'\')" title="삭제" style="cursor:pointer;color:#b6c0cf;font-size:15px;" onmouseenter="this.style.color=\'#e53e5a\'" onmouseleave="this.style.color=\'#b6c0cf\'"></i></div>'
    +'<div style="padding:6px 10px 9px;overflow-x:auto;">'+_aiStepTable(it.steps,esc)+'</div></div>'; };
  const browse=shown.length?Object.keys(groups).sort(function(a,b){return String(a).localeCompare(String(b),undefined,{numeric:true});}).map(function(r){
      return '<div style="margin-bottom:18px;"><div style="font-size:13px;font-weight:800;color:#2d6fd4;margin-bottom:8px;border-left:3px solid #2d6fd4;padding-left:8px;"><i class="ti ti-category"></i> '+esc(r)+' <span style="font-size:11px;color:var(--text3);font-weight:600;">('+groups[r].length+')</span></div>'+groups[r].map(itemCard).join('')+'</div>';
    }).join(''):'<div style="padding:40px;text-align:center;color:var(--text3);border:2px dashed var(--border);border-radius:12px;"><i class="ti ti-bulb-off" style="font-size:34px;opacity:0.3;display:block;margin-bottom:10px;"></i>'+(q?'검색 결과가 없습니다.':'학습된 절차가 없습니다.<br>Test Workflow → TC → <b>🧠 LLM 학습</b> 으로 검증된 절차를 저장하세요.')+'</div>';
  body.innerHTML='<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;"><i class="ti ti-brain" style="font-size:24px;color:#7c3aed;"></i><span style="font-size:20px;font-weight:700;">시험절차 학습/조회</span><span style="font-size:12px;color:var(--text3);">총 '+items.length+'건</span></div>'
    +'<div style="max-width:none;border:1px solid #d9caf5;border-radius:12px;padding:14px 16px;background:linear-gradient(135deg,#faf7ff,#f3eeff);margin-bottom:18px;">'
      +'<div style="font-size:12.5px;font-weight:800;color:#7c3aed;margin-bottom:8px;"><i class="ti ti-message-chatbot"></i> 자연어 조회 — 학습된 시험을 물어보세요</div>'
      +'<div style="display:flex;gap:8px;"><input id="ai-ask-q" onkeydown="if(event.key===\'Enter\')aiLearnAsk()" placeholder="예: 메모리 관련 시험 뭐 있어? / E5010-24C L2 시험 절차 알려줘" style="flex:1;font-size:13px;padding:9px 12px;border:1px solid #c9b6f0;border-radius:8px;outline:none;"><button onclick="aiLearnAsk()" style="font-size:13px;font-weight:700;padding:9px 18px;border:none;border-radius:8px;background:#7c3aed;color:#fff;cursor:pointer;"><i class="ti ti-send"></i> 조회</button></div>'
      +'<div id="ai-ask-result" style="margin-top:10px;">'+(_aiAskAnswer||'')+'</div>'
    +'</div>'
    +'<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;max-width:none;"><i class="ti ti-search" style="color:var(--text3);"></i><input id="ai-learn-q" value="'+esc(q)+'" oninput="_aiLearnRender(this.value)" placeholder="목록 필터(제목·모델·설명·명령)…" style="flex:1;font-size:13px;padding:8px 11px;border:1px solid var(--border);border-radius:8px;outline:none;"><button onclick="renderAILearn()" style="font-size:12px;font-weight:700;padding:8px 13px;border:1px solid var(--border);border-radius:8px;background:#fff;color:var(--text2);cursor:pointer;"><i class="ti ti-refresh"></i> 새로고침</button></div>'
    +'<div style="max-width:none;">'+browse+'</div>';
  if(q){ const el=document.getElementById('ai-learn-q'); if(el){ el.focus(); try{ el.setSelectionRange(el.value.length,el.value.length); }catch(_){} } }
}
async function aiLearnAsk(){
  const q=((document.getElementById('ai-ask-q')||{}).value||'').trim();
  const res=document.getElementById('ai-ask-result'); if(!q){ if(res)res.innerHTML=''; _aiAskAnswer=''; return; }
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  if(res)res.innerHTML='<div style="color:#7c3aed;font-size:12.5px;padding:6px;"><i class="ti ti-loader-2"></i> 학습 데이터 검색 + gemma 답변 생성 중…</div>';
  try{
    const dd=await userApi('POST','/api/llm/ask',{query:q});
    if(!dd.ok){ _aiAskAnswer='<div style="color:#e53e5a;font-size:12.5px;padding:6px;">조회 실패: '+esc(dd.error||'')+'</div>'; if(res)res.innerHTML=_aiAskAnswer; return; }
    const ans='<div style="background:#fff;border:1px solid var(--border);border-radius:9px;padding:12px 14px;font-size:13px;line-height:1.65;white-space:pre-wrap;color:var(--text);">'+esc(dd.answer||'(답변 없음)')+'</div>';
    const cited=(dd.matched||[]).length?('<div style="font-size:11px;color:var(--text3);margin-top:8px;"><i class="ti ti-link"></i> 근거 학습항목: '+(dd.matched||[]).map(function(it){return esc(it.title||'')+' ('+esc((it.models||[]).join(','))+')';}).join(' · ')+'</div>'):'';
    _aiAskAnswer=ans+cited; if(res)res.innerHTML=_aiAskAnswer;
  }catch(e){ _aiAskAnswer='<div style="color:#e53e5a;padding:6px;">오류: '+esc(e.message)+'</div>'; if(res)res.innerHTML=_aiAskAnswer; }
}
async function aiLearnDel(id){ if(!confirm('이 학습 항목을 삭제할까요?'))return; try{ await userApi('DELETE','/api/learn/procedure/'+encodeURIComponent(id)); _aiAskAnswer=''; renderAILearn(); }catch(e){ if(typeof showToast==='function')showToast(e.message); } }
// 자연어 → 시험 절차 생성 모달

// ── ITMS Rack 배치 ──
let labRacks=[]; let labLabs=[]; let _rackLab=''; let rackBlanks=[]; let rackBlankTypes=[]; let rackToolTypes=[]; let _rackEdit=false;
const DEFAULT_BLANKS=[{label:'민자',units:1},{label:'민자',units:2},{label:'민자',units:4},{label:'가로홀',units:1},{label:'가로홀',units:2},{label:'가로홀',units:4}];
function _blankBg(label){ return '#e4e8ee'; }
function _toolGuess(name){
  var s=String(name||'').toLowerCase();
  var M=[
    [/pdu|전원|power|콘센트/,'ti-plug','#e8820c'],
    [/ups|배터리|battery/,'ti-battery-2','#3fa34d'],
    [/패치|patch|odf|광\s*분배|분배함/,'ti-layout-grid','#0ea5e9'],
    [/트레이|tray/,'ti-layout-distribute-horizontal','#8a6d3b'],
    [/케이블|cable|정리/,'ti-line-dashed','#64748b'],
    [/kvm/,'ti-keyboard','#7c3aed'],
    [/콘솔|console|시리얼|serial/,'ti-terminal-2','#00a872'],
    [/계측|meter|analyzer|분석/,'ti-device-analytics','#2d6fd4'],
    [/트래픽|traffic|generator|생성기/,'ti-antenna','#c0497b'],
    [/광|fiber|optic/,'ti-topology-star-3','#0784b5'],
    [/선반|shelf|받침/,'ti-layout-board-split','#8a6d3b'],
    [/모니터|monitor|디스플레이|display/,'ti-device-desktop','#475569'],
    [/서버|server/,'ti-server-2','#2563eb'],
    [/스위치|switch/,'ti-switch-3','#0891b2'],
    [/라우터|router|게이트웨이|gateway/,'ti-router','#16a34a'],
    [/방화벽|firewall|보안|security/,'ti-shield-half','#dc2626'],
    [/팬|fan|쿨링|냉각|cooling/,'ti-propeller','#0ea5e9'],
    [/카메라|camera|cctv/,'ti-camera','#475569'],
    [/전화|phone|voip/,'ti-phone','#0284c7'],
    [/스토리지|storage|nas|disk/,'ti-database','#7c3aed']
  ];
  for(var i=0;i<M.length;i++){ if(M[i][0].test(s)) return {icon:M[i][1],color:M[i][2]}; }
  return {icon:'ti-tools',color:'#0ea5e9'};
}const DEFAULT_TOOLS=[{label:'PDU (전원분배)',units:1,icon:'ti-plug',color:'#e8820c'},{label:'패치 패널',units:1,icon:'ti-layout-grid',color:'#0ea5e9'},{label:'케이블 정리',units:1,icon:'ti-line-dashed',color:'#64748b'},{label:'케이블 트레이',units:1,icon:'ti-layout-distribute-horizontal',color:'#8a6d3b'},{label:'KVM 스위치',units:1,icon:'ti-keyboard',color:'#7c3aed'},{label:'콘솔 서버',units:1,icon:'ti-terminal-2',color:'#00a872'},{label:'계측기',units:2,icon:'ti-device-analytics',color:'#2d6fd4'},{label:'트래픽 생성기',units:2,icon:'ti-antenna',color:'#c0497b'},{label:'광 분배함(ODF)',units:1,icon:'ti-topology-star-3',color:'#0784b5'},{label:'선반 (Shelf)',units:1,icon:'ti-layout-board-split',color:'#8a6d3b'},{label:'UPS',units:3,icon:'ti-battery-2',color:'#3fa34d'},{label:'모니터',units:1,icon:'ti-device-desktop',color:'#475569'}];
let _racksLoaded=false;   // 서버 재시작 등으로 fetch 실패 시 빈 배열을 그대로 saveRacks()해 데이터를 날리는 것을 막는 안전장치
async function loadRacks(){
  try{
    const r=await fetch('/api/racks'); const d=await r.json();
    labRacks=(d&&d.racks)||[]; labLabs=(d&&d.labs)||[]; rackBlanks=(d&&d.blanks)||[];
    rackBlankTypes=(d&&d.blankTypes&&d.blankTypes.length)?d.blankTypes:DEFAULT_BLANKS.slice();
    rackToolTypes=(d&&d.toolTypes&&d.toolTypes.length)?d.toolTypes:DEFAULT_TOOLS.slice();
    _racksLoaded=true;
  }catch(e){
    // 로드 실패(서버 재시작 중 등)는 "데이터가 없다"는 뜻이 아니므로 기존 값을 그대로 둔다.
    if(typeof showToast==='function')showToast('랙 데이터를 불러오지 못했습니다 — 잠시 후 다시 시도하세요');
  }
  if(!_rackLab||!labLabs.some(l=>l.id===_rackLab)) _rackLab=labLabs.length?labLabs[0].id:'';
}
async function saveRacks(){
  if(!_racksLoaded){ if(typeof showToast==='function')showToast('랙 데이터 로드 전이라 저장을 건너뛰었습니다 — 새로고침 후 다시 시도하세요'); return; }
  try{ await fetch('/api/racks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({labs:labLabs,racks:labRacks,blanks:rackBlanks,blankTypes:rackBlankTypes,toolTypes:rackToolTypes})}); }catch(e){}
}
function toolTypeDel(i){ rackToolTypes.splice(i,1); saveRacks(); renderRackPage(); }
function toolTypeEditU(i){ const t=rackToolTypes[i]; if(!t)return; const lbl=t.label; uiPrompt({title:'도구 U 변경', label:lbl+' 높이(U)', value:String(t.units||1), icon:'ti-tools', onConfirm:function(v){ const u=parseInt(v,10); if(!u||u<1)return; const tt=rackToolTypes[i]; const tgt=(tt&&tt.label===lbl)?tt:(rackToolTypes.find(function(x){return x.label===lbl;})||t); tgt.units=u; let upd=0; (rackBlanks||[]).forEach(function(b){ if(b.label===lbl){ b.units=u; upd++; } }); saveRacks(); renderRackPage(); showToast(lbl+' '+u+'U로 변경'+(upd?(' (배치 '+upd+'개 반영)'):'')); }}); }
function toolTypeEditColor(i){
  var t=rackToolTypes[i]; if(!t)return; var lbl=t.label;
  var PRESET=['#e8820c','#3fa34d','#0ea5e9','#2d6fd4','#7c3aed','#c0497b','#00a872','#dc2626','#0891b2','#16a34a','#475569','#8a6d3b','#64748b','#0284c7'];
  var old=document.getElementById('tool-color-modal'); if(old)old.remove();
  var m=document.createElement('div'); m.id='tool-color-modal';
  m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:100001;display:flex;align-items:center;justify-content:center;';
  var chips=PRESET.map(function(c){ var on=String(t.color||'').toLowerCase()===c.toLowerCase(); return '<button onclick="toolTypeSetColor('+i+',\''+c+'\')" title="'+c+'" style="width:30px;height:30px;border-radius:7px;border:2px solid '+(on?'#111':'#fff')+';background:'+c+';cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.2);"></button>'; }).join('');
  m.innerHTML='<div style="background:#fff;width:min(360px,94vw);border-radius:14px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.3);">'+
    '<div style="padding:14px 18px;border-bottom:1px solid var(--border);background:var(--bg3);display:flex;align-items:center;gap:9px;"><i class="ti '+(t.icon||'ti-tools')+'" style="color:'+(t.color||'#0ea5e9')+';font-size:18px;"></i><b style="font-size:15px;">'+_bdEsc(lbl)+' — 색상 변경</b><span style="flex:1;"></span><button onclick="document.getElementById(\'tool-color-modal\').remove()" style="width:26px;height:26px;border-radius:6px;border:1px solid var(--border);background:#fff;cursor:pointer;"><i class="ti ti-x"></i></button></div>'+
    '<div style="padding:18px;display:flex;flex-wrap:wrap;gap:10px;justify-content:center;">'+chips+'</div>'+
    '<div style="padding:0 18px 16px;display:flex;align-items:center;gap:10px;justify-content:center;"><span style="font-size:12px;color:var(--text3);">직접 선택</span><input type="color" value="'+(t.color||'#0ea5e9')+'" onchange="toolTypeSetColor('+i+',this.value)" style="width:48px;height:32px;border:1px solid var(--border);border-radius:7px;cursor:pointer;background:#fff;"></div>'+
  '</div>';
  document.body.appendChild(m);
}
function toolTypeSetColor(i,c){
  var t=rackToolTypes[i]; if(!t)return; var lbl=t.label; t.color=c;
  var upd=0; (rackBlanks||[]).forEach(function(b){ if(b.label===lbl){ b.color=c; upd++; } });
  saveRacks(); var m=document.getElementById('tool-color-modal'); if(m)m.remove(); renderRackPage(); if(typeof showToast==='function')showToast(lbl+' 색상 변경'+(upd?(' (배치 '+upd+'개 반영)'):''));
}
function blankTypeEditColor(i){
  var t=rackBlankTypes[i]; if(!t)return; var lbl=t.label;
  var PRESET=['#e8820c','#3fa34d','#0ea5e9','#2d6fd4','#7c3aed','#c0497b','#00a872','#dc2626','#0891b2','#16a34a','#475569','#8a6d3b','#64748b','#0284c7'];
  var old=document.getElementById('tool-color-modal'); if(old)old.remove();
  var m=document.createElement('div'); m.id='tool-color-modal';
  m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:100001;display:flex;align-items:center;justify-content:center;';
  var chips=PRESET.map(function(c){ var on=String(t.color||'').toLowerCase()===c.toLowerCase(); return '<button onclick="blankTypeSetColor('+i+',\''+c+'\')" title="'+c+'" style="width:30px;height:30px;border-radius:7px;border:2px solid '+(on?'#111':'#fff')+';background:'+c+';cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.2);"></button>'; }).join('');
  m.innerHTML='<div style="background:#fff;width:min(360px,94vw);border-radius:14px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.3);">'+
    '<div style="padding:14px 18px;border-bottom:1px solid var(--border);background:var(--bg3);display:flex;align-items:center;gap:9px;"><i class="ti ti-rectangle" style="color:'+(t.color||'#64748b')+';font-size:18px;"></i><b style="font-size:15px;">'+_bdEsc(lbl)+' — 색상 변경</b><span style="flex:1;"></span><button onclick="document.getElementById(\'tool-color-modal\').remove()" style="width:26px;height:26px;border-radius:6px;border:1px solid var(--border);background:#fff;cursor:pointer;"><i class="ti ti-x"></i></button></div>'+
    '<div style="padding:18px;display:flex;flex-wrap:wrap;gap:10px;justify-content:center;">'+chips+'</div>'+
    '<div style="padding:0 18px 16px;display:flex;align-items:center;gap:10px;justify-content:center;"><span style="font-size:12px;color:var(--text3);">직접 선택</span><input type="color" value="'+(t.color||'#64748b')+'" onchange="blankTypeSetColor('+i+',this.value)" style="width:48px;height:32px;border:1px solid var(--border);border-radius:7px;cursor:pointer;background:#fff;"></div>'+
  '</div>';
  document.body.appendChild(m);
}
function blankTypeSetColor(i,c){
  var t=rackBlankTypes[i]; if(!t)return; var lbl=t.label; t.color=c;
  var upd=0; (rackBlanks||[]).forEach(function(b){ if(b.label===lbl){ b.color=c; upd++; } });
  saveRacks(); var m=document.getElementById('tool-color-modal'); if(m)m.remove(); renderRackPage(); if(typeof showToast==='function')showToast(lbl+' 색상 변경'+(upd?(' (배치 '+upd+'개 반영)'):''));
}
function devRackColorPick(devId){
  var d=(deviceList||[]).find(function(x){return x.id===devId;}); if(!d)return; var lbl=(d.name||d.ip||'장비');
  var PRESET=['#e8820c','#3fa34d','#0ea5e9','#2d6fd4','#7c3aed','#c0497b','#00a872','#dc2626','#0891b2','#16a34a','#475569','#8a6d3b','#64748b','#0284c7'];
  var old=document.getElementById('tool-color-modal'); if(old)old.remove();
  var m=document.createElement('div'); m.id='tool-color-modal';
  m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:100001;display:flex;align-items:center;justify-content:center;';
  var chips=PRESET.map(function(c){ var on=String(d.rack_color||'').toLowerCase()===c.toLowerCase(); return '<button onclick="devRackColorSet(\''+devId+'\',\''+c+'\')" title="'+c+'" style="width:30px;height:30px;border-radius:7px;border:2px solid '+(on?'#111':'#fff')+';background:'+c+';cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.2);"></button>'; }).join('');
  m.innerHTML='<div style="background:#fff;width:min(380px,94vw);border-radius:14px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.3);">'+
    '<div style="padding:14px 18px;border-bottom:1px solid var(--border);background:var(--bg3);display:flex;align-items:center;gap:9px;"><i class="ti ti-server" style="color:'+(d.rack_color||'#2d6fd4')+';font-size:18px;"></i><b style="font-size:15px;">'+_bdEsc(lbl)+' — 랙 배치 색상</b><span style="flex:1;"></span><button onclick="document.getElementById(\'tool-color-modal\').remove()" style="width:26px;height:26px;border-radius:6px;border:1px solid var(--border);background:#fff;cursor:pointer;"><i class="ti ti-x"></i></button></div>'+
    '<div style="padding:18px;display:flex;flex-wrap:wrap;gap:10px;justify-content:center;">'+chips+'</div>'+
    '<div style="padding:0 18px 16px;display:flex;align-items:center;gap:10px;justify-content:center;flex-wrap:wrap;"><span style="font-size:12px;color:var(--text3);">직접 선택</span><input type="color" value="'+(d.rack_color||'#2d6fd4')+'" onchange="devRackColorSet(\''+devId+'\',this.value)" style="width:48px;height:32px;border:1px solid var(--border);border-radius:7px;cursor:pointer;background:#fff;"><button onclick="devRackColorSet(\''+devId+'\',\'\')" title="상태(연결) 색으로 되돌림" style="font-size:12px;padding:7px 12px;border-radius:7px;border:1px solid var(--border);background:#fff;color:var(--text3);cursor:pointer;">기본(상태색)</button></div>'+
  '</div>';
  document.body.appendChild(m);
}
function devRackColorSet(devId,c){
  var d=(deviceList||[]).find(function(x){return x.id===devId;}); if(!d)return;
  if(c) d.rack_color=c; else delete d.rack_color;
  if(typeof saveDeviceData==='function') saveDeviceData();
  var m=document.getElementById('tool-color-modal'); if(m)m.remove(); renderRackPage(); if(typeof showToast==='function')showToast((d.name||'장비')+(c?' 랙 색상 변경':' 기본 상태색으로'));
}
function toolTypeAdd(){ uiPrompt({title:'도구 추가', label:'도구 이름', value:'', icon:'ti-tools', placeholder:'예: 광 패치, 서버, PDU', onConfirm:function(nm){ nm=(nm||'').trim(); if(!nm)return; uiPrompt({title:'도구 높이', label:'"'+nm+'" 높이(U)', value:'1', icon:'ti-server-2', onConfirm:function(v){ const u=parseInt(v,10)||1; var _g=_toolGuess(nm); rackToolTypes.push({label:nm,units:u,icon:_g.icon,color:_g.color}); saveRacks(); renderRackPage(); showToast('도구 추가됨'); }}); }}); }
function labAddPrompt(){
  const old=document.getElementById('lab-add-modal'); if(old)old.remove();
  const m=document.createElement('div'); m.id='lab-add-modal'; m.className='modal-overlay'; m.style.display='flex';
  m.innerHTML='<div class="modal" style="width:420px;max-width:94vw;border-radius:14px;padding:0;overflow:hidden;">'+
    '<div style="padding:18px 22px;background:linear-gradient(135deg,#7c3aed,#9d5cf0);color:#fff;display:flex;align-items:center;gap:11px;"><div style="width:40px;height:40px;border-radius:11px;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;"><i class="ti ti-building" style="font-size:21px;"></i></div><div><div style="font-size:16px;font-weight:800;">새 Lab 추가</div><div style="font-size:11.5px;opacity:0.85;">시험실/공간 단위로 랙을 묶습니다</div></div></div>'+
    '<div style="padding:20px 22px;"><label style="font-size:11.5px;font-weight:700;color:var(--text3);display:block;margin-bottom:6px;">Lab 이름</label><input id="lab-add-name" onkeydown="if(event.key===\'Enter\')labAddSubmit()" placeholder="예: 1층 시험실, NMS Lab" style="width:100%;font-size:14px;padding:11px 13px;border:1.5px solid var(--border);border-radius:9px;outline:none;box-sizing:border-box;"></div>'+
    '<div style="padding:0 22px 20px;display:flex;gap:9px;justify-content:flex-end;"><button onclick="document.getElementById(\'lab-add-modal\').remove()" style="font-size:13px;padding:9px 18px;border-radius:9px;border:1.5px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;font-weight:600;">취소</button><button onclick="labAddSubmit()" style="font-size:13px;padding:9px 22px;border-radius:9px;border:none;background:#7c3aed;color:#fff;cursor:pointer;font-weight:700;"><i class="ti ti-plus"></i> Lab 생성</button></div>'+
  '</div>';
  document.body.appendChild(m); setTimeout(function(){const i=document.getElementById('lab-add-name');if(i)i.focus();},50);
}
function labAddSubmit(){ const i=document.getElementById('lab-add-name'); const name=(i&&i.value||'').trim(); if(!name){ if(i)i.style.borderColor='var(--red)'; return; } const id='lab-'+Date.now(); labLabs.push({id,name}); _rackLab=id; saveRacks(); const m=document.getElementById('lab-add-modal'); if(m)m.remove(); renderRackPage(); showToast('Lab 추가됨'); }function labDel(id){ const l=labLabs.find(x=>x.id===id); if(!l)return; const rks=labRacks.filter(r=>r.lab_id===id); if(!confirm('"'+l.name+'" Lab과 소속 랙 '+rks.length+'개를 삭제할까요? (배치 장비는 미배치)'))return; const rkNames=new Set(rks.map(r=>r.name)); (deviceList||[]).forEach(d=>{ if(rkNames.has(d.rack_name)){ d.rack_name=''; d.rack_pos=0; } }); labRacks=labRacks.filter(r=>r.lab_id!==id); labLabs=labLabs.filter(x=>x.id!==id); if(_rackLab===id)_rackLab=labLabs.length?labLabs[0].id:''; saveRacks(); saveDeviceData(); renderRackPage(); }
function labPick(id){ _rackLab=id; renderRackPage(); }
let _rackSlide=false; let _rackSlideTimer=null;
function _rackSlideMs(){ const el=document.getElementById('rack-slide-sec'); let s=el?parseFloat(el.value):5; if(!isFinite(s)||s<1)s=5; return Math.round(s*1000); }
function rackSlideStop(){ if(_rackSlideTimer){ clearInterval(_rackSlideTimer); _rackSlideTimer=null; } }
function rackSlideNext(){ const pg=document.getElementById('page-itms-rack'); if(!pg||!pg.classList.contains('active')||_rackEdit||labLabs.length<2){ rackSlideStop(); _rackSlide=false; return; } const i=labLabs.findIndex(function(l){return l.id===_rackLab;}); _rackLab=labLabs[(i+1)%labLabs.length].id; renderRackPage(); }
function rackSlideToggle(){ _rackSlide=!_rackSlide; rackSlideStop(); if(_rackSlide){ _rackSlideTimer=setInterval(rackSlideNext, _rackSlideMs()); } renderRackPage(); }
function rackSlideRestart(){ if(_rackSlide){ rackSlideStop(); _rackSlideTimer=setInterval(rackSlideNext, _rackSlideMs()); } }


// ── 좀비정리 오삭제 복원(로그인후 렌더 의존) ──
function _expCell(tcid,c){
  const id=c.id; const type=c.type||'contains';
  const escA=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  const escT=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  if(type==='none'){ return '<span style="font-size:11px;color:var(--text3);">판정 없음 (조회만 · 우클릭=변수)</span>'; }
  const vm=String(c.criteria||'').match(/^\s*\$\{(\w+)\}\s*$/);
  if(type==='expr' && vm){
    const name=vm[1]; const val=_varVal(tcid,name); const man=_varIsManual(_tcById(tcid),name);
    const valHtml=(val!=null&&String(val).trim()!=='')?('<span onclick="event.stopPropagation();tcVarView(\''+tcid+'\',\''+name+'\')" title="클릭=값 보기/편집" style="cursor:pointer;font-weight:700;color:#0d1320;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+escT(String(val).replace(/\n/g,' ⏎ '))+'</span>'):'<span style="color:#c0392b;font-size:10.5px;">(값 없음 — 실행/입력 필요)</span>';
    return '<div style="display:flex;align-items:center;gap:6px;background:#f7f5ff;border:1px solid #e0d6f5;border-radius:6px;padding:3px 8px;width:100%;box-sizing:border-box;"><i class="ti ti-variable" style="color:#7c3aed;font-size:13px;flex-shrink:0;"></i><span style="font-family:ui-monospace,monospace;color:#7c3aed;font-weight:800;font-size:11px;flex-shrink:0;">'+name+'</span>'+(man?'<span style="font-size:8.5px;color:#c026d3;border:1px solid #e9c6f0;border-radius:3px;padding:0 3px;flex-shrink:0;">골든</span>':'')+'<span style="color:var(--text3);flex-shrink:0;">=</span>'+valHtml+'<i class="ti ti-x" onclick="event.stopPropagation();tcVarClearCrit(\''+tcid+'\',\''+id+'\')" title="변수 비교 해제" style="font-size:12px;color:#c0392b;cursor:pointer;margin-left:auto;flex-shrink:0;"></i></div>';
  }
  const crit=String(c.criteria||'');
  if(!crit.trim() && String(c.excludeLines||'').trim()) return '';   // 제외만 설정 시 판정기준 input 숨김 (제외 배지만 표시)
  const _modeLbl=c.critMode?('<span style="font-size:9.5px;font-weight:800;color:#2d6fd4;background:#eaf2ff;border:1px solid #cdddf5;border-radius:5px;padding:2px 6px;white-space:nowrap;flex-shrink:0;">'+escT(c.critMode)+'</span><span style="color:var(--text3);flex-shrink:0;font-weight:700;">:</span>'):'';
  const multi=(type==='contains_all')||crit.indexOf('\n')>=0;
  if(multi){
    const rows=Math.min(24, Math.max(1, crit.split(/\n/).filter(function(l){return l.trim();}).length));
    return _modeLbl+'<textarea onclick="event.stopPropagation()" oninput="this.style.height=\'auto\';this.style.height=this.scrollHeight+\'px\'" onfocus="this.style.height=\'auto\';this.style.height=this.scrollHeight+\'px\'" onblur="tcStepSetExpect(\''+tcid+'\',\''+id+'\',this.value)" rows="'+rows+'" placeholder="여러 줄 = 모두 포함되어야 합격 · 우클릭=변수" style="flex:1;min-width:150px;font-size:11.5px;font-family:ui-monospace,monospace;padding:3px 9px;border:1px solid #c3c9d4;border-radius:5px;background:#fff;color:#0d1320;font-weight:600;outline:none;box-sizing:border-box;resize:none;white-space:pre;overflow-x:auto;overflow-y:hidden;line-height:1.45;">'+escT(crit)+'</textarea>';
  }
  return _modeLbl+'<input onclick="event.stopPropagation()" value="'+escA(crit)+'" onblur="tcStepSetExpect(\''+tcid+'\',\''+id+'\',this.value)" placeholder="이 값이 있으면 합격 (예: E5010-24C) · 우클릭=변수" style="flex:1;min-width:140px;font-size:12px;font-family:inherit;padding:5px 9px;border:1px solid #c3c9d4;border-radius:5px;background:#fff;color:#0d1320;font-weight:700;outline:none;box-sizing:border-box;">';
}

function devNormalizeNames(){
  var models=(typeof modelList!=='undefined'?modelList:[]).map(function(m){return String(m.name||'');}).filter(Boolean).sort(function(a,b){return b.length-a.length;});  // 긴 이름 우선(prefix 최장매칭)
  var baseOf=function(d){ if(d.model&&String(d.model).trim())return String(d.model).trim(); var nm=String(d.name||''); for(var k=0;k<models.length;k++){ if(nm===models[k]||nm.indexOf(models[k])===0)return models[k]; } return nm.replace(/\s*\([^)]*\)\s*$/,'').replace(/_\d+$/,'').trim()||nm; };
  var targets=(deviceList||[]).filter(function(d){return !_isInstrument(d);});
  var groups={}; targets.forEach(function(d){ var b=baseOf(d)||'(미지정)'; (groups[b]=groups[b]||[]).push(d); });
  var plan=[];
  Object.keys(groups).forEach(function(b){
    groups[b].sort(function(x,y){return (y.name===b?1:0)-(x.name===b?1:0);});   // 이미 base인 장비를 첫번째로
    groups[b].forEach(function(d,i){ var nn=(i===0)?b:(b+'_'+i); if(d.name!==nn||d.model!==b) plan.push({d:d,oldName:d.name,newName:nn,base:b}); });
  });
  if(!plan.length){ if(typeof showToast==='function')showToast('정규화할 항목이 없습니다 (이미 정리됨)'); return; }
  var sample=plan.slice(0,8).map(function(p){return '· '+(p.oldName||'(빈값)')+'  →  '+p.newName;}).join('\n');
  if(!confirm(plan.length+'개 장비를 정규화합니다.\n등록 모델 기준 base 추출 → 같은 모델은 _1,_2 + model 필드 채움.\n\n예시:\n'+sample+(plan.length>8?'\n…':'')+'\n\n진행할까요? (되돌리기 없음)')) return;
  plan.forEach(function(p){ p.d.model=p.base; p.d.name=p.newName; });
  saveDeviceData(); renderDeviceTable(); if(typeof showToast==='function')showToast(plan.length+'개 정규화 완료');
}

function devTblCtx(ev,i,f){ ev.preventDefault(); devTblCtxClose();
  var m=document.createElement('div'); m.id='dev-tbl-ctx';
  m.style.cssText='position:fixed;left:'+ev.clientX+'px;top:'+ev.clientY+'px;background:#fff;border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,0.2);z-index:99999;font-size:12.5px;overflow:hidden;min-width:185px;';
  var it=function(label,fn){ return '<div onclick="'+fn+';devTblCtxClose();" style="padding:8px 14px;cursor:pointer;white-space:nowrap;" onmouseenter="this.style.background=\'#eef3ff\'" onmouseleave="this.style.background=\'#fff\'">'+label+'</div>'; };
  m.innerHTML=it('📋 셀 복사','devTblCellCopy('+i+',\''+f+'\')')+it('📥 붙여넣기','devTblCellPaste('+i+',\''+f+'\')')+'<div style="border-top:1px solid var(--border);"></div>'+it('⬇ 아래로 증가 채우기','devTblFillInc('+i+',\''+f+'\')')+it('⬇ 아래로 복사','devTblFillCopy('+i+',\''+f+'\')')+'<div style="border-top:1px solid var(--border);"></div>'+it('⎘ 이 행 복사(아래에)','devTblRowCopy('+i+')')+it('＋ 행 추가','devTblRowAdd()')+it('🗑 행 삭제','devTblRowDel('+i+')');
  document.body.appendChild(m);
  setTimeout(function(){ document.addEventListener('mousedown',function _h(e){ var box=document.getElementById('dev-tbl-ctx'); if(!box){document.removeEventListener('mousedown',_h);return;} if(e.target&&e.target.closest&&e.target.closest('#dev-tbl-ctx'))return; devTblCtxClose(); document.removeEventListener('mousedown',_h); }); },0);
}

function tcVarChipMenu(ev,tcid,name){
  if(ev){ try{ ev.preventDefault(); ev.stopPropagation(); }catch(e){} }
  tcVarChipMenuClose();
  const m=document.createElement('div'); m.id='tc-varchip-menu';
  m.style.cssText='position:fixed;z-index:100006;background:#fff;border:1px solid #d2d7e0;border-radius:9px;box-shadow:0 10px 32px rgba(30,40,80,0.22);padding:4px 0;min-width:150px;font-family:inherit;';
  const item=(ic,col,lab,oc)=>'<div onmousedown="event.preventDefault()" onclick="tcVarChipMenuClose();'+oc+'" style="padding:7px 14px;font-size:12.5px;color:#1c1f27;cursor:pointer;display:flex;align-items:center;gap:8px;white-space:nowrap;" onmouseenter="this.style.background=\'#f4f0ff\'" onmouseleave="this.style.background=\'#fff\'"><i class="ti '+ic+'" style="color:'+col+';font-size:14px;"></i>'+lab+'</div>';
  m.innerHTML='<div style="padding:5px 14px;font-size:10px;font-weight:800;color:#9aa1ad;font-family:ui-monospace,monospace;">${'+name+'}</div>'+item('ti-pencil','#2d6fd4','값 수정','tcVarView(\''+tcid+'\',\''+name+'\')')+item('ti-variable','#7c3aed','판정기준으로 사용','tcVarSetCrit(\''+tcid+'\',\''+(_respStepId[tcid]||'')+'\',\''+name+'\')')+item('ti-trash','#c0392b','변수 삭제','tcVarDelete(\''+tcid+'\',\''+name+'\')');
  document.body.appendChild(m);
  let x=(ev&&ev.clientX)||120, y=(ev&&ev.clientY)||120; if(x+160>window.innerWidth)x=Math.max(8,window.innerWidth-170); if(y+120>window.innerHeight)y=Math.max(8,window.innerHeight-130);
  m.style.left=x+'px'; m.style.top=y+'px';
  setTimeout(function(){ document.addEventListener('click',tcVarChipMenuClose); },0);
}

function tcVarDelete(tcid,name){
  const tc=_tcById(tcid); if(!tc) return; name=String(name||'').trim();
  if(_procVars[tcid]) delete _procVars[tcid][name];
  if(tc.varVals) delete tc.varVals[name];
  if(tc.varManual) delete tc.varManual[name];
  (tc.checks||[]).forEach(function(c){ _stepDelExtract(c,name); });
  saveTCFile(tc).then(function(){ _respRefresh(tcid); tcProcRefresh(tcid); });
  showToast('변수 '+name+' 삭제');
}

function tcVarPanelToggle(tcid){ const open=_varPanelOpen[tcid]!==false; _varPanelOpen[tcid]=!open; _respRefresh(tcid); }

function tcVarView(tcid,name){
  const tc=_tcById(tcid); const cur=_varVal(tcid,name); const man=_varIsManual(tc,name);
  const exo=document.getElementById('tc-var-view'); if(exo) exo.remove();
  const v=String(cur==null?'':cur);
  const ov=document.createElement('div'); ov.id='tc-var-view';
  ov.style.cssText='position:fixed;inset:0;z-index:100005;background:rgba(15,22,38,0.55);display:flex;align-items:center;justify-content:center;';
  ov.innerHTML='<div style="width:min(560px,94vw);background:#fff;border-radius:14px;box-shadow:0 24px 64px rgba(0,0,0,0.4);padding:18px 20px;">'
    +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;"><i class="ti ti-variable" style="color:#7c3aed;font-size:18px;"></i><span style="font-family:ui-monospace,monospace;font-size:15px;font-weight:800;color:#7c3aed;">${'+name+'}</span>'+(man?'<span style="font-size:9px;color:#c026d3;border:1px solid #e9c6f0;border-radius:4px;padding:0 5px;">수동(골든)</span>':'<span style="font-size:9px;color:#0784b5;border:1px solid #bcdcec;border-radius:4px;padding:0 5px;">자동 추출</span>')+'<span style="flex:1;"></span><span style="font-size:11px;color:var(--text3);">'+v.split(/\n/).length+'줄 · '+v.length+'자</span><i class="ti ti-x" onclick="_tcVarViewClose()" style="cursor:pointer;font-size:20px;color:#8a93a5;margin-left:8px;"></i></div>'
    +'<textarea id="tc-var-view-ta" style="width:100%;min-height:140px;font-size:13px;font-family:ui-monospace,monospace;padding:10px;border:1px solid #cdd6e6;border-radius:8px;box-sizing:border-box;resize:vertical;white-space:pre;">'+v.replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</textarea>'
    +'<div style="display:flex;gap:8px;margin-top:12px;align-items:center;"><button onclick="tcVarViewSave(\''+tcid+'\',\''+name+'\')" style="font-size:13px;font-weight:700;padding:9px 18px;border:none;border-radius:8px;background:#7c3aed;color:#fff;cursor:pointer;">저장 (수동 골든)</button><span style="font-size:10.5px;color:var(--text3);">저장하면 이후 실행에서 이 값과 비교합니다</span><span style="flex:1;"></span><button onclick="_tcVarViewClose()" style="font-size:12px;padding:9px 16px;border:1px solid var(--border);border-radius:8px;background:#fff;cursor:pointer;">닫기</button></div></div>';
  ov.addEventListener('mousedown',function(e){ ov._downBg=(e.target===ov); });
  ov.onclick=function(e){ if(e.target===ov && ov._downBg) _tcVarViewClose(); };
  document.body.appendChild(ov);
  setTimeout(function(){ const t=document.getElementById('tc-var-view-ta'); if(t) t.focus(); },40);
}


// ── 좀비정리 오삭제 복원 R1 ──
function tcVarChipMenuClose(){ const m=document.getElementById('tc-varchip-menu'); if(m) m.remove(); document.removeEventListener('click',tcVarChipMenuClose); }

async function tcVarViewSave(tcid,name){
  const t=document.getElementById('tc-var-view-ta'); if(!t) return;
  _varSetUser(tcid,name,t.value,true);
  const tc=_tcById(tcid); if(tc){ (tc.checks||[]).forEach(function(c){ if((c.type||'')==='expr'&&_goldenVar(c)===name) _reJudge(c,tcid); }); await saveTCFile(tc); }
  _tcVarViewClose(); tcProcRefresh(tcid); showToast('변수 '+name+' 저장 (수동 골든)');
}

function devTblCellPaste(i,f){ if(!deviceList[i])return; if(!(navigator.clipboard&&navigator.clipboard.readText)){ showToast('붙여넣기 미지원 — 셀 클릭 후 Ctrl+V'); return; } navigator.clipboard.readText().then(function(t){ t=String(t).replace(/[\r\n]+$/,''); devTblSet(i,f,t); renderDeviceTable(); showToast('붙여넣기: '+(t||'(빈값)')); },function(){ showToast('붙여넣기 실패 — 권한 거부. 셀 클릭 후 Ctrl+V 사용'); }); }

function devTblCellCopy(i,f){ var v=String((deviceList[i]||{})[f]==null?'':(deviceList[i]||{})[f]); if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(v).then(function(){showToast('복사됨: '+(v||'(빈값)'));},function(){showToast('복사 실패');}); } else { showToast('클립보드 복사 미지원'); } }

function devTblRowCopy(i){ if(!deviceList[i])return; var d=JSON.parse(JSON.stringify(deviceList[i])); d.id='dev-'+Date.now()+'-'+Math.floor(Math.random()*1000); deviceList.splice(i+1,0,d); saveDeviceData(); renderDeviceTable(); }

function devTblFillInc(i,f){ var base=(deviceList[i]||{})[f]||''; for(var k=i+1;k<deviceList.length;k++){ deviceList[k][f]=_devIncVal(base,k-i); if(f==='protocol')deviceList[k].device_type=(deviceList[k].protocol==='ssh'?'cisco_ios':'cisco_ios_telnet'); } saveDeviceData(); renderDeviceTable(); }

async function tcStepSetExpect(tcid,id,value){
  const tc=_tcById(tcid); const c=tc&&(tc.checks||[]).find(x=>x.id===id); if(!c) return;
  c.criteria=String(value==null?'':value);
  if(/\$\{[A-Za-z0-9_]+\}/.test(c.criteria)){ c.type='expr'; }
  else if(c.criteria.indexOf('\n')>=0){ c.type='contains_all'; }
  else if(['contains_all','contains','line','notcontains','table'].indexOf(c.type||'')<0){ c.type='contains'; }
  _reJudge(c,tcid); await saveTCFile(tc); tcProcRefresh(tcid);
}

function _tcVarViewClose(){ const ov=document.getElementById('tc-var-view'); if(ov) ov.remove(); }

function devTblCtxClose(){ var e=document.getElementById('dev-tbl-ctx'); if(e)e.remove(); }

function devTblFillCopy(i,f){ var base=(deviceList[i]||{})[f]||''; for(var k=i+1;k<deviceList.length;k++){ deviceList[k][f]=base; if(f==='protocol')deviceList[k].device_type=(base==='ssh'?'cisco_ios':'cisco_ios_telnet'); } saveDeviceData(); renderDeviceTable(); }


// ── TC 스텝 자동 백업(스냅샷) 복구 ─────────────────────────────
async function tcOpenSnapshots(tcid){
  var ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(15,20,35,0.5);z-index:12000;display:flex;align-items:center;justify-content:center;';
  ov.innerHTML='<div style="background:var(--bg2);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,0.3);width:820px;max-width:96vw;max-height:82vh;display:flex;flex-direction:column;overflow:hidden;">'
    +'<div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;">'
      +'<i class="ti ti-history" style="color:#e8820c;font-size:20px;"></i>'
      +'<b style="font-size:15px;">스텝 자동 백업 · 복구</b>'
      +'<span style="color:var(--text3);font-size:12px;">'+tcid+'</span>'
      +'<span style="flex:1;"></span>'
      +'<button id="snap-close" style="border:none;background:transparent;color:var(--text3);font-size:20px;cursor:pointer;padding:0 4px;">×</button>'
    +'</div>'
    +'<div style="padding:10px 16px;background:#fff8ec;border-bottom:1px solid #f5e2c0;color:#8a5c14;font-size:12px;">저장 시 이전 스텝이 자동 백업됩니다. 아래에서 시점을 선택해 미리보기 후 복구하세요. (최근 20개 유지)</div>'
    +'<div id="snap-body" style="flex:1;overflow:auto;display:flex;">'
      +'<div id="snap-list" style="width:280px;border-right:1px solid var(--border);overflow-y:auto;background:#fafbfc;"></div>'
      +'<div id="snap-preview" style="flex:1;overflow:auto;padding:12px 14px;font-size:12px;color:var(--text2);">← 왼쪽에서 시점을 선택하세요</div>'
    +'</div></div>';
  document.body.appendChild(ov);
  var close=function(){ try{ ov.remove(); }catch(e){} };
  ov.onclick=function(e){ if(e.target===ov) close(); };
  ov.querySelector('#snap-close').onclick=close;

  var listEl=ov.querySelector('#snap-list');
  var previewEl=ov.querySelector('#snap-preview');
  listEl.innerHTML='<div style="padding:20px;color:var(--text3);text-align:center;font-size:12px;">로드 중…</div>';
  var items=[];
  try{
    var r=await fetch('/api/tc/'+_tcUrl(tcid)+'/snapshots');
    if(r.ok){ var d=await r.json(); items=(d&&d.items)||[]; }
  }catch(e){}
  if(!items.length){
    listEl.innerHTML='<div style="padding:20px;color:var(--text3);text-align:center;font-size:12px;line-height:1.6;">아직 자동 백업이 없습니다.<br><span style="font-size:11px;">저장(수정) 시 이전 스텝이 백업됩니다.</span></div>';
    return;
  }
  var _fmtSnapTime=function(name){
    var m=String(name||'').match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
    if(!m) return name;
    return m[1]+'-'+m[2]+'-'+m[3]+' '+m[4]+':'+m[5]+':'+m[6];
  };
  listEl.innerHTML=items.map(function(it,i){
    return '<div class="snap-item" data-name="'+it.name+'" style="padding:11px 14px;border-bottom:1px solid #eef0f3;cursor:pointer;font-size:12.5px;">'
      +'<div style="font-weight:700;color:var(--text);">'+_fmtSnapTime(it.name)+'</div>'
      +'<div style="color:var(--text3);font-size:11px;margin-top:2px;">'+Math.round((it.size||0)/1024)+' KB'+(i===0?' · 가장 최근':'')+'</div>'
      +'</div>';
  }).join('');
  Array.prototype.forEach.call(listEl.querySelectorAll('.snap-item'), function(el){
    el.onclick=async function(){
      Array.prototype.forEach.call(listEl.querySelectorAll('.snap-item'), function(x){ x.style.background=''; });
      el.style.background='#eef2ff';
      var nm=el.getAttribute('data-name');
      previewEl.innerHTML='<div style="color:var(--text3);padding:10px;">불러오는 중…</div>';
      try{
        var rr=await fetch('/api/tc/'+_tcUrl(tcid)+'/snapshots/'+encodeURIComponent(nm));
        if(!rr.ok) throw new Error('불러오기 실패');
        var dd=await rr.json();
        var data=(dd&&dd.data)||{};
        var checks=Array.isArray(data.checks)?data.checks:[];
        var rows=checks.slice(0, 200).map(function(c,i){
          var lbl=(String(c.cli||'').split('\n')[0]||c.action||c.kind||'').slice(0,120);
          var res=c.repeatResult||'';
          var resColor=(res==='Pass'?'#00a872':(res==='Fail'?'#e53e5a':(res==='skip'?'#8a93a5':'#8a93a5')));
          return '<tr style="border-bottom:1px solid #eef0f3;">'
            +'<td style="padding:5px 8px;color:var(--text3);width:36px;text-align:right;">'+(i+1)+'</td>'
            +'<td style="padding:5px 8px;color:var(--text2);width:70px;">'+(c.kind||'cli')+'</td>'
            +'<td style="padding:5px 8px;color:var(--text);">'+_esc(lbl)+'</td>'
            +'<td style="padding:5px 8px;color:'+resColor+';font-weight:700;width:60px;">'+_esc(res)+'</td>'
            +'</tr>';
        }).join('');
        previewEl.innerHTML=''
          +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">'
          +'<b style="font-size:13px;">스텝 '+checks.length+'개</b>'
          +'<span style="flex:1;"></span>'
          +'<button id="snap-restore" style="padding:7px 16px;border-radius:8px;border:none;background:#00a872;color:#fff;font-weight:700;cursor:pointer;font-size:12.5px;"><i class="ti ti-restore"></i> 이 시점으로 복구</button>'
          +'</div>'
          +'<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;">'
          +'<table style="width:100%;border-collapse:collapse;font-size:11.5px;"><tbody>'+rows+'</tbody></table>'
          +'</div>'
          +(checks.length>200?'<div style="text-align:center;color:var(--text3);font-size:11px;padding:6px;">… 아래 '+(checks.length-200)+'개 생략 (복구 시 전체 반영)</div>':'');
        var restoreBtn=previewEl.querySelector('#snap-restore');
        if(restoreBtn){
          restoreBtn.onclick=async function(){
            if(!confirm('이 시점('+_fmtSnapTime(nm)+')으로 복구할까요?\n현재 스텝은 자동 백업된 후 이 시점의 스텝으로 교체됩니다.')) return;
            restoreBtn.disabled=true; restoreBtn.style.opacity='0.6'; restoreBtn.innerHTML='<i class="ti ti-loader-2 spin"></i> 복구 중…';
            try{
              var pr=await fetch('/api/tc/'+_tcUrl(tcid)+'/snapshots/'+encodeURIComponent(nm)+'/restore',{method:'POST'});
              if(!pr.ok) throw new Error('복구 실패');
              // 로컬 tcList 도 새 값으로 갱신
              var pj=await pr.json();
              var _t=tcList.find(function(x){return (x.tcid||x.id)===tcid;});
              if(_t && pj && pj.data) Object.assign(_t, pj.data);
              close();
              if(typeof tcProcRefresh==='function') tcProcRefresh(tcid);
              if(typeof showToast==='function') showToast('✅ 스텝이 '+_fmtSnapTime(nm)+' 시점으로 복구되었습니다');
            }catch(e){
              restoreBtn.disabled=false; restoreBtn.style.opacity=''; restoreBtn.innerHTML='<i class="ti ti-restore"></i> 이 시점으로 복구';
              if(typeof showToast==='function') showToast('❌ 복구 실패: '+(e&&e.message?e.message:e));
            }
          };
        }
      }catch(e){ previewEl.innerHTML='<div style="color:#e53e5a;padding:10px;">불러오기 실패: '+String(e&&e.message?e.message:e)+'</div>'; }
    };
  });
  // 첫 항목 자동 선택
  var first=listEl.querySelector('.snap-item');
  if(first) first.click();
}
function _esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── 좀비정리 오삭제 복원 R2 ──
function _devIncVal(v,n){ v=String(v==null?'':v);
  if(/^\d{1,3}(\.\d{1,3}){3}$/.test(v)){ var p=v.split('.').map(Number); var x=(((p[0]*256+p[1])*256+p[2])*256+p[3])+n; if(x<0)x=0; return [Math.floor(x/16777216)%256,Math.floor(x/65536)%256,Math.floor(x/256)%256,x%256].join('.'); }
  if(/^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/.test(v)){ var num=0; v.split(':').forEach(function(h){num=num*256+parseInt(h,16);}); num+=n; if(num<0)num=0; var out=[]; for(var k=0;k<6;k++){ out.unshift(('0'+(num%256).toString(16)).slice(-2)); num=Math.floor(num/256);} return out.join(':'); }
  var m=v.match(/^(.*?)(\d+)(\D*)$/); if(m){ var num2=parseInt(m[2],10)+n; if(num2<0)num2=0; var s=String(num2); while(s.length<m[2].length)s='0'+s; return m[1]+s+m[3]; }
  return v;
}
