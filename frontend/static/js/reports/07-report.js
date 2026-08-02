function renderReport(){
  const body=document.getElementById('report-body'); if(!body) return;
  if(typeof Chart==='undefined'){ body.innerHTML='<div style="padding:50px;text-align:center;color:var(--text3);"><i class="ti ti-loader"></i> 차트 라이브러리 로딩 중… 잠시 후 다시 시도하세요</div>'; setTimeout(renderReport,800); return; }
  const F=window._rptF=window._rptF||{proj:'',model:'',vgroup:'',ver:'',severity:'',verdict:'',req:''};
  const all=_rptCollect();
  const sevs=[...new Set(all.map(x=>x.severity).filter(Boolean))].map(s=>({v:s,l:s}));
  const reqs=[...new Set(all.map(x=>x.req_id).filter(Boolean))].map(r=>{ const rq=reqList.find(x=>x.id===r); return {v:r,l:(rq&&rq.reqid)||r}; });
  const items=_rptFiltered();
  const stats=cycleCalcStats(items);
  const reqCnt=new Set(items.map(it=>it.req_id).filter(Boolean)).size;
  const sel=(id,label,opts)=>'<div style="display:flex;flex-direction:column;gap:3px;"><span style="font-size:10px;color:var(--text3);font-weight:600;">'+label+'</span><select onchange="_rptSet(\''+id+'\',this.value)" style="font-size:12px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;min-width:130px;outline:none;"><option value="">전체</option>'+opts.map(o=>'<option value="'+o.v+'"'+(F[id]===o.v?' selected':'')+'>'+o.l+'</option>').join('')+'</select></div>';
  // 계층 캐스케이딩 옵션 (상위 선택에 따라 하위 좁힘)
  const _hopt=(arr)=>[...new Set(arr.filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true})).map(v=>({v:v,l:v}));
  const projOpts=_hopt(all.map(x=>x._folder));
  const modelOpts=F.proj?_hopt(all.filter(x=>x._folder===F.proj).map(x=>x._model)):[];
  const vgroupOpts=(F.proj&&F.model)?_hopt(all.filter(x=>x._folder===F.proj&&x._model===F.model).map(x=>x._vgroup)):[];
  const verOpts=(F.proj&&F.model&&F.vgroup)?_hopt(all.filter(x=>x._folder===F.proj&&x._model===F.model&&x._vgroup===F.vgroup).map(x=>x._version)):[];
  const selH=(id,label,opts,dis)=>'<div style="display:flex;flex-direction:column;gap:3px;"><span style="font-size:10px;color:'+(dis?'#c2c6cf':'var(--text3)')+';font-weight:600;">'+label+'</span><select '+(dis?'disabled ':'')+'onchange="_rptSetH(\''+id+'\',this.value)" style="font-size:12px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;min-width:118px;outline:none;'+(dis?'background:#f1f2f5;color:#b0b4bd;':'')+'"><option value="">전체</option>'+opts.map(o=>'<option value="'+_bdEsc(o.v)+'"'+(F[id]===o.v?' selected':'')+'>'+_bdEsc(o.l)+'</option>').join('')+'</select></div>';
  const filterBar='<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;padding:12px 14px;background:#fff;border:1px solid var(--border);border-radius:10px;margin-bottom:14px;">'
    +'<i class="ti ti-filter" style="font-size:17px;color:var(--blue);align-self:center;margin-bottom:5px;"></i>'
    +selH('proj','프로젝트',projOpts)+selH('model','모델',modelOpts,!F.proj)+selH('vgroup','버전그룹',vgroupOpts,!(F.proj&&F.model))+selH('ver','버전',verOpts,!(F.proj&&F.model&&F.vgroup))
    +'<span style="width:1px;align-self:stretch;background:var(--border);margin:2px 2px;"></span>'
    +sel('severity','심각도',sevs)+sel('req','REQ',reqs)
    +sel('verdict','결과',[{v:'pass',l:'합격'},{v:'fail',l:'불합격'},{v:'pending',l:'예정'},{v:'exclude',l:'제외'}])
    +'<div style="flex:1;"></div>'
    +'<button onclick="window._rptF={proj:\'\',model:\'\',vgroup:\'\',ver:\'\',severity:\'\',verdict:\'\',req:\'\'};renderReport()" style="font-size:11px;padding:6px 12px;border-radius:6px;border:1px solid var(--border);background:#fff;color:var(--text3);cursor:pointer;align-self:center;margin-bottom:2px;">필터 초기화</button>'
    +'<span style="font-size:12px;color:var(--text3);font-weight:600;align-self:center;margin-bottom:6px;">대상 '+items.length+'건</span>'
  +'</div>';
  const kpi=(label,val,color)=>'<div style="flex:1 1 0;min-width:0;background:#fff;border:1px solid var(--border);border-radius:10px;padding:10px 12px;display:flex;align-items:baseline;justify-content:center;gap:7px;"><span class="rpt-kpi-value" style="font-size:21px;font-weight:800;color:'+color+';white-space:nowrap;">'+val+'</span><span class="rpt-kpi-label" style="font-size:11.5px;color:var(--text3);font-weight:700;white-space:nowrap;">'+label+'</span></div>';
  const kpiRow='<div style="display:flex;gap:12px;align-items:center;margin-bottom:14px;">'
    +'<div style="flex:1;display:flex;gap:10px;flex-wrap:nowrap;">'
    +kpi('요구사항',reqCnt,'#2d6fd4')+kpi('전체 TC',stats.total,'var(--text)')+kpi('합격',stats.pass,'#00a872')+kpi('불합격',stats.fail,'#e53e5a')
    +kpi('예정',stats.pending,'#9aa0b8')+kpi('제외',stats.exclude,'#c9923e')+kpi('진행률',stats.progress+'%','var(--blue)')
    +'</div>'
    +'<div style="display:flex;gap:8px;align-items:center;flex-shrink:0;">'
      +'<button onclick="reportExportExcel()" style="font-size:12px;padding:9px 15px;border-radius:8px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;font-weight:600;white-space:nowrap;"><i class="ti ti-file-spreadsheet" style="color:#1d6f42;"></i> Excel</button>'
      +'<button onclick="reportExportPDF()" style="font-size:12px;padding:9px 15px;border-radius:8px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;font-weight:600;white-space:nowrap;"><i class="ti ti-printer" style="color:var(--red);"></i> PDF</button>'
    +'</div>'
  +'</div>';
  const cardC=(title,cid,h)=>'<div style="background:#fff;border:1px solid var(--border);border-radius:10px;padding:14px;"><div style="font-size:12.5px;font-weight:700;margin-bottom:10px;">'+title+'</div><div style="height:'+(h||220)+'px;position:relative;"><canvas id="'+cid+'"></canvas></div></div>';
  const grid='<div style="display:grid;grid-template-columns:1fr;gap:14px;">'
    +cardC('🍩 진행률 (합격/불합격/예정/제외)','rptDonut')+cardC('📊 심각도별 합·불','rptSev')
    +cardC('📚 REQ별 커버리지','rptReq',260)+cardC('📊 모델·버전별 합격률','rptModel',260)
    +cardC('📈 시간대별 진행 추이','rptTime')+cardC('🐞 불합격(결함) 분포','rptDefect')
  +'</div>';
  const rollup=
    _rptRollupCard('🗂 제품군 전체 요약', _rptGroupRows(items, function(it){return it._folder;}))
    +_rptRollupCard('💻 모델명 전체 요약', _rptGroupRows(items, function(it){return it._model;}))
    +_rptRollupCard('🏷 버전별 현황 요약', _rptGroupRows(items, function(it){return (it._model&&it._model!=='-'?it._model+' · ':'')+(it._version||'(버전없음)');}));
  if(!items.length){ body.innerHTML=filterBar+'<div style="padding:50px;text-align:center;color:var(--text3);"><i class="ti ti-chart-bar" style="font-size:40px;opacity:0.25;display:block;margin-bottom:12px;"></i>사이클 실행 데이터가 없습니다. Test Cycle에서 TC를 실행하면 집계됩니다.</div>'; return; }
  body.innerHTML=kpiRow+filterBar+_rptHierHtml()+rollup+grid;
  _rptDraw(items);
  _rptDrawHier();
}
function _rptDestroy(){ Object.values(_rptCharts).forEach(c=>{ try{c.destroy();}catch(e){} }); _rptCharts={}; }
function _rptDraw(items){
  _rptDestroy();
  const C=id=>{ const el=document.getElementById(id); return el?el.getContext('2d'):null; };
  const co={responsive:true,maintainAspectRatio:false};
  const stats=cycleCalcStats(items);
  if(C('rptDonut')) _rptCharts.donut=new Chart(C('rptDonut'),{type:'doughnut',data:{labels:['합격','불합격','예정','제외'],datasets:[{data:[stats.pass,stats.fail,stats.pending,stats.exclude],backgroundColor:['#00a872','#e53e5a','#c4c9d4','#c9923e']}]},options:Object.assign({plugins:{legend:{position:'right'}}},co)});
  const sevs=[...new Set(items.map(x=>x.severity||'미지정'))];
  if(C('rptSev')) _rptCharts.sev=new Chart(C('rptSev'),{type:'bar',data:{labels:sevs,datasets:[{label:'합격',data:sevs.map(s=>cycleCalcStats(items.filter(x=>(x.severity||'미지정')===s)).pass),backgroundColor:'#00a872'},{label:'불합격',data:sevs.map(s=>cycleCalcStats(items.filter(x=>(x.severity||'미지정')===s)).fail),backgroundColor:'#e53e5a'}]},options:Object.assign({scales:{x:{stacked:true},y:{stacked:true,beginAtZero:true}}},co)});
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
  const dsev=[...new Set(fail.map(x=>x.severity||'미지정'))];
  if(C('rptDefect')) _rptCharts.defect=new Chart(C('rptDefect'),{type:'bar',data:{labels:dsev.length?dsev:['없음'],datasets:[{label:'불합격 건수',data:dsev.length?dsev.map(s=>fail.filter(x=>(x.severity||'미지정')===s).length):[0],backgroundColor:'#e8820c'}]},options:Object.assign({scales:{y:{beginAtZero:true}}},co)});
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
function reportExportPDF(){
  const ids=['rptDonut','rptSev','rptReq','rptModel','rptTime','rptDefect'];
  const titles={rptDonut:'진행률',rptSev:'심각도별 합·불',rptReq:'REQ 커버리지',rptModel:'모델·버전 합격률',rptTime:'시간대별 추이',rptDefect:'결함 분포'};
  const imgs=ids.map(id=>{ const el=document.getElementById(id); let src=''; if(el){ try{src=el.toDataURL('image/png');}catch(e){} } return {id,src}; });
  const items=_rptFiltered(); const stats=cycleCalcStats(items);
  const fail=items.filter(it=>_rptVerdict(it)==='fail');
  const failRows=fail.map(it=>{ const sum=String(it.llm_summary||'').replace(/\[\[빨강\]\]/g,'').replace(/\[\[\/빨강\]\]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;'); return '<tr><td>'+(it.tcid||'')+'</td><td>'+String(it.name||'').replace(/</g,'&lt;')+'</td><td>'+(it.severity||'')+'</td><td>'+(it._grp||'')+'</td><td style="font-size:10px;color:#555;">'+sum.slice(0,220)+'</td></tr>'; }).join('');
  const chartHtml=imgs.map(im=>im.src?'<div class="ch"><div class="cht">'+titles[im.id]+'</div><img src="'+im.src+'"></div>':'').join('');
  const w=window.open('','_blank'); if(!w){ showToast('팝업 차단을 해제하세요'); return; }
  w.document.write('<html><head><meta charset="utf-8"><title>시험결과 보고서</title><style>body{font-family:"Malgun Gothic",AppleGothic,sans-serif;padding:28px;color:#222;}h1{font-size:22px;margin:0;}h2{font-size:15px;border-bottom:2px solid #2d6fd4;padding-bottom:5px;margin-top:22px;}.kpi{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0;}.kc{border:1px solid #ddd;border-radius:8px;padding:9px 16px;font-size:12px;color:#666;}.kc b{font-size:21px;display:block;color:#222;}.charts{display:grid;grid-template-columns:1fr 1fr;gap:12px;}.ch{border:1px solid #eee;border-radius:8px;padding:10px;}.cht{font-size:12px;font-weight:700;margin-bottom:6px;}.ch img{width:100%;}table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px;}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top;}th{background:#f4f5f7;}</style></head><body>'
    +'<h1>📊 시험결과 보고서</h1><div style="color:#888;font-size:12px;margin-top:3px;">Ubiquoss-TOP · 생성 '+_nowStr()+'</div>'
    +'<h2>요약</h2><div class="kpi"><div class="kc">전체<b>'+stats.total+'</b></div><div class="kc" style="color:#00a872;">합격<b>'+stats.pass+'</b></div><div class="kc" style="color:#e53e5a;">불합격<b>'+stats.fail+'</b></div><div class="kc">예정<b>'+stats.pending+'</b></div><div class="kc">제외<b>'+stats.exclude+'</b></div><div class="kc" style="color:#2d6fd4;">진행률<b>'+stats.progress+'%</b></div></div>'
    +'<h2>차트</h2><div class="charts">'+chartHtml+'</div>'
    +'<h2>불합격 상세 ('+fail.length+'건)</h2>'+(failRows?'<table><thead><tr><th>TC ID</th><th>시험명</th><th>심각도</th><th>모델</th><th>LLM 요약</th></tr></thead><tbody>'+failRows+'</tbody></table>':'<div style="color:#888;font-size:12px;">불합격 없음</div>')
    +'<scr'+'ipt>window.onload=function(){setTimeout(function(){window.print();},450);}<\/scr'+'ipt></body></html>');
  w.document.close();
}
function resultVerdict(v){ const m=resultMeta(v); return m?m.verdict:(v==='Pass'?'pass':v==='Fail'?'fail':'exclude'); }
function resultColor(v){ const m=resultMeta(v); return m?m.color:'#999'; }
// 결과 입력 버튼 묶음 (onsetTpl 안의 __VAL__ 자리에 결과값 치환)
function cycleResultBtns(onsetTpl, current){
  return '<div style="display:flex;gap:3px;flex-wrap:wrap;">'+resultStatuses().map(st=>{
    const on=current===st.value;
    return '<button onclick="event.stopPropagation();'+onsetTpl.split('__VAL__').join(st.value)+'" style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:3px;border:1px solid '+(on?st.color:'#ddd')+';background:'+(on?st.color:'#fff')+';color:'+(on?'#fff':'#666')+';cursor:pointer;white-space:nowrap;">'+st.value+'</button>';
  }).join('')+'</div>';
}

function cycleItemStatus(steps){
  // 자동 판정은 수동(manual) 스텝을 제외한 CLI/계측기 스텝만으로 집계 (수동은 사람이 별도로 입력)
  const auto=(steps||[]).filter(x=>!(x.manual||x.action==='수동'));
  if(!auto.length) return (steps&&steps.length)?'제외':'UNEXECUTED';   // 전부 수동 스텝뿐이면 자동 판정 대상 없음 → 제외 (스텝 자체가 없으면 예정)
  if(auto.length===1) return auto[0].result||'UNEXECUTED';
  if(auto.some(x=>resultVerdict(x.result)==='fail')) return 'Fail';   // Fail 하나라도 → Fail
  if(auto.some(x=>resultVerdict(x.result)==='pass')) return 'Pass';   // Fail 없고 Pass 있으면 → Pass (제외 섞여도)
  const mixed=auto.find(x=>x.result&&resultVerdict(x.result)!=='pass');   // Pass·Fail 없음 → 제외/미구현 등
  return mixed?mixed.result:'UNEXECUTED';
}
function cycleCalcStats(items){
  const total=items.length;
  if(!total) return {total:0,pass:0,fail:0,pending:0,exclude:0,inScope:0,notrun:0,progress:0,passRate:0,failRate:0,notStarted:true};
  // 항목 판정: fail > pass > exclude > pending (제외 섞여도 Pass 있으면 Pass, Fail 있으면 Fail)
  const verdictOf=it=>{ const steps=it.steps||[]; const all=steps.filter(x=>!(x.manual||x.action==='수동'));   // 수동 스텝은 자동 판정 집계에서 제외
    if(!all.length) return steps.length?'exclude':'pending';   // 전부 수동 스텝뿐이면 자동 판정 대상 없음 → 제외 (스텝 자체가 없으면 예정)
    const done=all.filter(x=>x.result&&resultMeta(x.result)); // 유효 결과 입력된 스텝만
    if(done.some(x=>resultVerdict(x.result)==='fail')) return 'fail';   // Fail 하나라도 → fail
    if(done.length<all.length) return 'pending'; // 일부입력 = 예정
    if(done.some(x=>resultVerdict(x.result)==='pass')) return 'pass';   // Fail 없고 Pass 있으면 → pass (제외보다 우선)
    if(done.some(x=>resultVerdict(x.result)==='exclude')) return 'exclude';   // Pass 없고 제외만 → exclude
    return 'pending'; };
  let pass=0,fail=0,pending=0,exclude=0;
  items.forEach(it=>{ const v=verdictOf(it); if(v==='pass')pass++; else if(v==='fail')fail++; else if(v==='exclude')exclude++; else pending++; });
  const inScope=pass+fail+pending; const done=pass+fail; // 진행율 분모 = 제외 뺀 대상
  return {total,pass,fail,pending,exclude,inScope,notrun:pending,
    progress: inScope?Math.round(done/inScope*100):0,
    passRate: inScope?Math.round(pass/inScope*100):0,   // inScope 기준 (제외 제거)
    failRate: inScope?Math.round(fail/inScope*100):0,
    notStarted: done===0 };
}

function cycleMiniBar(s){
  if(!s.inScope) return '<span style="font-size:10px;color:#ccc;">'+(s.total?'전부 제외':'TC 0')+'</span>';
  return '<div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">'+
    '<div style="width:50px;height:5px;border-radius:3px;background:#e0e0e0;overflow:hidden;display:flex;">'+
      '<div style="width:'+s.passRate+'%;background:#00a872;"></div>'+
      '<div style="width:'+s.failRate+'%;background:#e53e5a;"></div>'+
    '</div>'+
    '<span style="font-size:10px;color:'+(s.notStarted?'#aaa':'var(--text3)')+';white-space:nowrap;">'+(s.notStarted?'미진행':(s.pass+s.fail)+'/'+s.inScope)+'</span>'+
  '</div>';
}

function cycleAddFolder(){
  const name=prompt('프로젝트명:');
  if(!name) return;
  cycleFolderList.push({id:'cf-'+Date.now(),name:name.trim(),order:cycleFolderList.length});
  saveCycleFolders();
  cycleMxFillSelects();
  cycleRenderMatrix();
}

function cycleRenderTree(){
  const wrap=document.getElementById('cycle-tree');
  if(!wrap) return;
  const cycles=cycleSelFolderId?cycleList.filter(c=>c.folder_id===cycleSelFolderId):cycleList;
  if(!cycles.length){
    wrap.innerHTML='<div style="padding:20px;text-align:center;font-size:12px;color:var(--text3);">사이클 없음<br><button onclick="openNewCycle()" style="margin-top:8px;font-size:11px;padding:3px 10px;border-radius:5px;border:1px solid rgba(45,111,212,0.3);background:rgba(45,111,212,0.08);color:var(--blue);cursor:pointer;"><i class="ti ti-plus"></i> 새 사이클</button></div>';
    return;
  }
  const byModel={};
  cycles.forEach(c=>{
    const m=c.model||'미지정';
    if(!byModel[m]) byModel[m]={};
    const g=c.version_group||'기본';
    if(!byModel[m][g]) byModel[m][g]=[];
    byModel[m][g].push(c);
  });
  wrap.innerHTML=Object.entries(byModel).map(([model,groups])=>{
    const s=cycleCalcStats(Object.values(groups).flat().flatMap(c=>c.items||[]));
    const open=window['ct_m_'+model]!==false;
    const mSel=window['_cycleSelModel']===model&&!cycleSelCycleId&&!window['_cycleSelGrp'];
    return '<div style="border-bottom:1px solid #eee;">'+
      '<div style="padding:9px 10px;display:flex;align-items:center;gap:4px;background:'+(mSel?'rgba(45,111,212,0.06)':'#f4f5f7')+';">'+
        // 접기 버튼 (왼쪽) — 모델 레벨: 44×44, 아이콘 28px
        '<button onclick="ctToggle(\'m\',\''+model+'\')" title="모델 폴더 펼치기/접기" style="width:44px;height:44px;border:none;background:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;border-radius:8px;" onmouseenter="this.style.background=\'#e0e0e0\'" onmouseleave="this.style.background=\'none\'">'+
          '<i class="ti ti-chevron-right" style="font-size:28px;color:var(--blue);transition:transform 0.15s;'+(open?'transform:rotate(90deg)':'')+';" id="ct-arr-m-'+model+'"></i>'+
        '</button>'+
        // 클릭 영역 (통계 표시)
        '<div onclick="cycleSelModel(\''+model+'\')" style="flex:1;display:flex;align-items:center;gap:6px;cursor:pointer;padding:2px 4px;border-radius:5px;" onmouseenter="this.style.background=\'rgba(45,111,212,0.06)\'" onmouseleave="this.style.background=\'\'">'+
          '<i class="ti ti-device-desktop-analytics" style="font-size:18px;color:var(--blue);flex-shrink:0;"></i>'+
          '<span style="font-size:8px;font-weight:700;color:#fff;background:var(--blue);border-radius:3px;padding:1px 5px;flex-shrink:0;letter-spacing:0.3px;">모델</span>'+
          '<span style="font-size:14px;font-weight:800;flex:1;color:'+(mSel?'var(--blue)':'var(--text)')+';">'+model+'</span>'+
          cycleMiniBar(s)+
        '</div>'+
      '</div>'+
      '<div id="ct-body-m-'+model+'" style="'+(open?'':'display:none;')+'">'+
        Object.entries(groups).map(([grp,gCycles])=>{
          const gs=cycleCalcStats(gCycles.flatMap(c=>c.items||[]));
          const gopen=window['ct_g_'+model+grp]!==false;
          const gSel=window['_cycleSelGrp']===model+'__'+grp&&!cycleSelCycleId;
          return '<div>'+
            '<div style="padding:7px 10px 7px 24px;display:flex;align-items:center;gap:4px;background:'+(gSel?'rgba(45,111,212,0.04)':'')+';">'+
              // 접기 버튼 — 그룹 레벨: 40×40, 아이콘 24px
              '<button onclick="ctToggle(\'g\',\''+model+grp+'\')" title="그룹 폴더 펼치기/접기" style="width:40px;height:40px;border:none;background:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;border-radius:8px;" onmouseenter="this.style.background=\'#e0e0e0\'" onmouseleave="this.style.background=\'none\'">'+
                '<i class="ti ti-chevron-right" style="font-size:24px;color:var(--text2);transition:transform 0.15s;'+(gopen?'transform:rotate(90deg)':'')+';" id="ct-arr-g-'+model+grp+'"></i>'+
              '</button>'+
              // 클릭 영역
              '<div onclick="cycleSelGroup(\''+model+'\',\''+grp+'\')" style="flex:1;display:flex;align-items:center;gap:5px;cursor:pointer;padding:2px 4px;border-radius:5px;" onmouseenter="this.style.background=\'rgba(45,111,212,0.05)\'" onmouseleave="this.style.background=\'\'">'+
                '<i class="ti ti-versions" style="font-size:15px;color:'+(gSel?'var(--blue)':'#9d7bff')+';flex-shrink:0;"></i>'+
                '<span style="font-size:8px;font-weight:700;color:#9d7bff;background:rgba(157,123,255,0.14);border-radius:3px;padding:1px 5px;flex-shrink:0;">그룹</span>'+
                '<span style="font-size:12.5px;font-weight:600;flex:1;color:'+(gSel?'var(--blue)':'var(--text2)')+';">'+grp+'</span>'+
                cycleMiniBar(gs)+
              '</div>'+
              // 그룹 삭제 버튼
              '<button onclick="cycleDeleteGroup(\''+model+'\',\''+grp+'\')" title="그룹 삭제" style="margin-left:4px;font-size:11px;padding:2px 7px;border-radius:4px;border:1px solid rgba(229,62,90,0.3);background:rgba(229,62,90,0.06);color:var(--red);cursor:pointer;flex-shrink:0;white-space:nowrap;" onmouseenter="this.style.background=\'var(--red)\';this.style.color=\'#fff\'" onmouseleave="this.style.background=\'rgba(229,62,90,0.06)\';this.style.color=\'var(--red)\'"><i class="ti ti-trash"></i></button>'+
            '</div>'+
            '<div id="ct-body-g-'+model+grp+'" style="'+(gopen?'':'display:none;')+'">'+
              gCycles.map(c=>cycleTreeItem(c)).join('')+
            '</div>'+
          '</div>';
        }).join('')+
      '</div>'+
    '</div>';
  }).join('');
}

function cycleTreeItem(c){
  const s=cycleCalcStats(c.items||[]);
  const sel=cycleSelCycleId===c.id;
  const bg=sel?'rgba(45,111,212,0.06)':'';
  return '<div style="display:flex;align-items:center;border-bottom:1px solid #f5f5f5;padding-left:44px;">'+
    '<div onclick="cycleSelectCycle(\''+c.id+'\')" style="flex:1;padding:7px 8px;cursor:pointer;display:flex;align-items:center;gap:6px;border-left:3px solid '+(sel?'var(--blue)':'transparent')+';background:'+bg+';" onmouseenter="this.style.background=\'#f0f4ff\'" onmouseleave="this.style.background=\''+bg+'\'">'+
      '<i class="ti ti-tag" style="font-size:13px;color:'+(sel?'var(--blue)':'var(--green)')+';flex-shrink:0;"></i>'+
      '<span style="font-size:8px;font-weight:700;color:var(--green);background:rgba(0,168,114,0.12);border-radius:3px;padding:1px 5px;flex-shrink:0;">버전</span>'+
      '<span style="font-size:12px;font-weight:500;flex:1;color:'+(sel?'var(--blue)':'var(--text)')+';">'+(c.version||c.id)+'</span>'+
      cycleMiniBar(s)+
    '</div>'+
    '<button onclick="event.stopPropagation();cloneCycle(\''+c.id+'\',event)" title="복제 (재시험: TC 유지, 결과 초기화)" style="margin:4px 0 4px 4px;font-size:11px;padding:2px 7px;border-radius:4px;border:1px solid rgba(45,111,212,0.3);background:rgba(45,111,212,0.06);color:var(--blue);cursor:pointer;flex-shrink:0;white-space:nowrap;" onmouseenter="this.style.background=\'var(--blue)\';this.style.color=\'#fff\'" onmouseleave="this.style.background=\'rgba(45,111,212,0.06)\';this.style.color=\'var(--blue)\'"><i class="ti ti-copy"></i></button>'+
    '<button onclick="cycleDeleteConfirm(\''+c.id+'\')" title="삭제" style="margin:4px 8px;font-size:11px;padding:2px 7px;border-radius:4px;border:1px solid rgba(229,62,90,0.3);background:rgba(229,62,90,0.06);color:var(--red);cursor:pointer;flex-shrink:0;white-space:nowrap;" onmouseenter="this.style.background=\'var(--red)\';this.style.color=\'#fff\'" onmouseleave="this.style.background=\'rgba(229,62,90,0.06)\';this.style.color=\'var(--red)\'"><i class="ti ti-trash"></i></button>'+
  '</div>';
}
// 사이클 복제 (재시험 회차 — TC 목록·판정기준 유지, 결과 초기화)
async function cloneCycle(cycleId, ev){
  if(ev) ev.stopPropagation();
  const c=cycleList.find(x=>x.id===cycleId); if(!c) return;
  const newVer=prompt('재시험할 새 버전명 입력:', c.version||''); if(newVer===null) return;
  const copy=JSON.parse(JSON.stringify(c));
  copy.id='cycle-'+Date.now();
  copy.version=(newVer.trim()||c.version||'');
  copy.created_at=new Date().toISOString().slice(0,10);
  (copy.items||[]).forEach(it=>(it.steps||[]).forEach(s=>{ s.result=''; delete s.date; }));
  cycleList.unshift(copy);
  await saveCycle(copy);
  cycleRenderTree();
  cycleSelectCycle(copy.id);
  showToast('사이클 복제 완료 (TC 유지 · 결과 초기화)');
}

// 모델 선택 (접기 없이 통계만)
function cycleSelModel(model){
  window['_cycleSelModel']=model;
  window['_cycleSelGrp']=null;
  cycleSelCycleId=null;
  const t=document.getElementById('cycle-tbl-title');
  if(t) t.textContent=model+' — 전체 현황';
  const cycles=cycleSelFolderId?cycleList.filter(c=>c.folder_id===cycleSelFolderId):cycleList;
  cycleRenderDashboard(cycles.filter(c=>c.model===model), model);
  cycleRenderTree();
}

// 버전그룹 선택 (접기 없이 통계만)
function cycleSelGroup(model, grp){
  window['_cycleSelModel']=model;
  window['_cycleSelGrp']=model+'__'+grp;
  cycleSelCycleId=null;
  const t=document.getElementById('cycle-tbl-title');
  if(t) t.textContent=model+' / '+grp+' — 전체 현황';
  const cycles=cycleSelFolderId?cycleList.filter(c=>c.folder_id===cycleSelFolderId):cycleList;
  cycleRenderDashboard(cycles.filter(c=>c.model===model&&c.version_group===grp), model+' / '+grp);
  cycleRenderTree();
}

function ctToggle(type,key){
  const k='ct_'+type+'_'+key;
  window[k]=window[k]===false?true:false;
  const arr=document.getElementById('ct-arr-'+type+'-'+key);
  const body=document.getElementById('ct-body-'+type+'-'+key);
  if(arr) arr.style.transform=window[k]===false?'':'rotate(90deg)';
  if(body) body.style.display=window[k]===false?'none':'';
}

// 모델 헤더 클릭 → 모델 전체 대시보드

// 대시보드: 여러 사이클 집계 표시
function cycleRenderDashboard(cycles, title){
  const body=document.getElementById('cycle-exec-body');
  const prog=document.getElementById('cycle-tbl-prog');
  if(!body) return;
  if(prog) prog.style.display='none';

  // 전체 집계
  const allItems=cycles.flatMap(c=>c.items||[]);
  const s=cycleCalcStats(allItems);

  // 버전별 집계
  const versionRows=cycles.map(c=>{
    const vs=cycleCalcStats(c.items||[]);
    return {version:c.version,id:c.id,...vs};
  });

  // TC별 Pass/Fail 집계 (버전 횡단)
  const tcMap={};
  cycles.forEach(c=>{
    (c.items||[]).forEach(item=>{
      const steps=item.steps||[];
      const result=steps.length?steps.every(x=>x.result==='Pass')?'Pass':steps.some(x=>x.result==='Fail')?'Fail':'UNEXECUTED':'UNEXECUTED';
      if(!tcMap[item.tcid]) tcMap[item.tcid]={tcid:item.tcid,name:item.name||'',pass:0,fail:0,notrun:0,total:0};
      tcMap[item.tcid].total++;
      if(result==='Pass') tcMap[item.tcid].pass++;
      else if(result==='Fail') tcMap[item.tcid].fail++;
      else tcMap[item.tcid].notrun++;
    });
  });

  const badge={'Pass':'background:#00a872;color:#fff;','Fail':'background:#e53e5a;color:#fff;','WIP':'background:#f5b731;color:#fff;','UNEXECUTED':'background:#aaa;color:#fff;'};

  body.innerHTML=
    // 전체 통계 카드
    '<div style="padding:16px;display:flex;flex-direction:column;gap:16px;">'+
      // 헤더
      '<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:linear-gradient(135deg,rgba(45,111,212,0.08),rgba(45,111,212,0.03));border-radius:10px;border:1px solid rgba(45,111,212,0.12);">'+
        '<i class="ti ti-chart-bar" style="font-size:24px;color:var(--blue);"></i>'+
        '<div style="flex:1;">'+
          '<div style="font-size:15px;font-weight:700;color:var(--text);">'+title+'</div>'+
          '<div style="font-size:12px;color:var(--text3);">'+cycles.length+'개 버전 / TC '+allItems.length+'개</div>'+
        '</div>'+
        '<div style="display:flex;gap:20px;align-items:center;">'+
          '<div style="text-align:center;"><div style="font-size:22px;font-weight:800;color:#00a872;">'+s.pass+'</div><div style="font-size:12px;font-weight:600;color:#00a872;">'+s.passRate+'%</div><div style="font-size:11px;color:var(--text3);">Pass</div></div>'+
          '<div style="text-align:center;"><div style="font-size:22px;font-weight:800;color:#e53e5a;">'+s.fail+'</div><div style="font-size:12px;font-weight:600;color:#e53e5a;">'+s.failRate+'%</div><div style="font-size:11px;color:var(--text3);">Fail</div></div>'+
          '<div style="text-align:center;"><div style="font-size:22px;font-weight:800;color:#aaa;">'+s.notrun+'</div><div style="font-size:12px;font-weight:600;color:#aaa;">'+(100-s.passRate-s.failRate)+'%</div><div style="font-size:11px;color:var(--text3);">예정</div></div>'+
          '<div style="text-align:center;"><div style="font-size:22px;font-weight:800;color:var(--blue);">'+s.progress+'%</div><div style="font-size:12px;font-weight:600;color:var(--blue);">'+s.pass+'/'+s.total+'</div><div style="font-size:11px;color:var(--text3);">진행</div></div>'+
        '</div>'+
      '</div>'+
      // 진행률 바
      '<div style="padding:0;">'+
        '<div style="height:12px;border-radius:6px;background:#f0f0f0;overflow:hidden;display:flex;margin-bottom:6px;">'+
          '<div style="width:'+s.passRate+'%;background:#00a872;transition:width 0.5s;"></div>'+
          '<div style="width:'+s.failRate+'%;background:#e53e5a;transition:width 0.5s;"></div>'+
        '</div>'+
        '<div style="display:flex;gap:16px;font-size:11px;color:var(--text3);">'+
          '<span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#00a872;margin-right:4px;"></span>합격 '+s.passRate+'%</span>'+
          '<span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#e53e5a;margin-right:4px;"></span>불합격 '+s.failRate+'%</span>'+
          '<span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ddd;margin-right:4px;"></span>예정 '+(100-s.passRate-s.failRate)+'%</span>'+
        '</div>'+
      '</div>'+
      // 버전별 현황 테이블
      '<div>'+
        '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:8px;">📋 버전별 현황</div>'+
        '<table style="width:100%;border-collapse:collapse;font-size:13px;">'+
          '<thead><tr style="background:#f4f5f7;border-bottom:2px solid var(--border);">'+
            '<th style="padding:8px 14px;text-align:left;font-size:11px;font-weight:700;color:#666;">버전</th>'+
            '<th style="padding:8px 14px;text-align:center;font-size:11px;font-weight:700;color:#666;">전체</th>'+
            '<th style="padding:8px 14px;text-align:center;font-size:11px;font-weight:700;color:#00a872;">Pass</th>'+
            '<th style="padding:8px 14px;text-align:center;font-size:11px;font-weight:700;color:#e53e5a;">Fail</th>'+
            '<th style="padding:8px 14px;text-align:center;font-size:11px;font-weight:700;color:#aaa;">미실행</th>'+
            '<th style="padding:8px 14px;text-align:left;font-size:11px;font-weight:700;color:#666;">진행률</th>'+
          '</tr></thead>'+
          '<tbody>'+
          versionRows.map((v,i)=>{
            const isOpen=window['dashVer_'+v.id];
            const cycle=cycleList.find(c=>c.id===v.id);
            const items=cycle?cycle.items||[]:[];
            const badge={'Pass':'background:#00a872;color:#fff;','Fail':'background:#e53e5a;color:#fff;','WIP':'background:#f5b731;color:#fff;','UNEXECUTED':'background:#aaa;color:#fff;'};
            const label={'Pass':'PASS','Fail':'FAIL','WIP':'WIP','UNEXECUTED':'UNEXECUTED'};
            const rowBg=i%2===0?'#fff':'#fafbfc';
            const tcRows=isOpen?items.map((item,idx)=>{
              const steps=item.steps||[];
              const result=steps.length?steps.every(x=>x.result==='Pass')?'Pass':steps.some(x=>x.result==='Fail')?'Fail':'UNEXECUTED':'UNEXECUTED';
              const isPass=result==='Pass';const isFail=result==='Fail';
              const stepOpen=window['dashStep_'+v.id+'_'+idx];
              const stepRows=stepOpen&&steps.length?steps.map((s,si)=>{
                const sPass=s.result==='Pass';const sFail=s.result==='Fail';const sWIP=s.result==='WIP';
                return '<tr style="background:'+(sFail?'rgba(229,62,90,0.04)':sPass?'rgba(0,168,114,0.02)':'#f8f9fb')+';border-bottom:1px solid #f0f0f0;">'+
                  '<td style="padding:0;" colspan="2"></td>'+
                  '<td colspan="3" style="padding:5px 14px 5px 40px;font-size:12px;color:var(--text2);">'+
                    '<div style="display:flex;align-items:center;gap:8px;">'+
                      '<span style="font-size:11px;font-weight:700;color:var(--blue);min-width:50px;">Step '+(si+1)+'</span>'+
                      '<span style="flex:1;">'+(s.criteria||s.desc||'판정기준')+'</span>'+
                      '<div style="display:flex;gap:3px;flex-shrink:0;">'+
                        '<button onclick="event.stopPropagation();cycleDashSetStep(\''+v.id+'\','+idx+','+si+',\'Pass\')" style="font-size:10px;font-weight:700;padding:1px 7px;border-radius:3px;border:1px solid '+(sPass?'#00a872':'#ddd')+';background:'+(sPass?'#00a872':'#fff')+';color:'+(sPass?'#fff':'#666')+';cursor:pointer;">Pass</button>'+
                        '<button onclick="event.stopPropagation();cycleDashSetStep(\''+v.id+'\','+idx+','+si+',\'Fail\')" style="font-size:10px;font-weight:700;padding:1px 7px;border-radius:3px;border:1px solid '+(sFail?'#e53e5a':'#ddd')+';background:'+(sFail?'#e53e5a':'#fff')+';color:'+(sFail?'#fff':'#666')+';cursor:pointer;">Fail</button>'+
                        '<button onclick="event.stopPropagation();cycleDashSetStep(\''+v.id+'\','+idx+','+si+',\'WIP\')" style="font-size:10px;padding:1px 7px;border-radius:3px;border:1px solid '+(sWIP?'#f5b731':'#ddd')+';background:'+(sWIP?'#f5b731':'#fff')+';color:'+(sWIP?'#fff':'#666')+';cursor:pointer;">WIP</button>'+
                      '</div>'+
                    '</div>'+
                  '</td>'+
                  '<td></td>'+
                '</tr>';
              }).join(''):'';
              return '<tr onclick="window[\'dashStep_'+v.id+'_'+idx+'\']=!window[\'dashStep_'+v.id+'_'+idx+'\'];cycleDashRefresh()" style="border-bottom:1px solid '+(stepOpen?'transparent':'#f0f0f0')+';background:#fafffe;cursor:pointer;" onmouseenter="this.style.background=\'#f0f4ff\'" onmouseleave="this.style.background=\'#fafffe\'">'+
                '<td style="padding:7px 14px 7px 28px;" colspan="2">'+
                  '<div style="display:flex;align-items:center;gap:5px;">'+
                    '<i class="ti ti-chevron-right" style="font-size:10px;color:var(--text3);transition:transform 0.15s;'+(stepOpen?'transform:rotate(90deg)':'')+'"></i>'+
                    '<span style="font-family:monospace;font-size:11px;color:#2d6fd4;font-weight:700;">'+item.tcid+'</span>'+
                    '<span style="font-size:12px;color:var(--text2);">'+(item.name||'')+'</span>'+
                  '</div>'+
                '</td>'+
                '<td style="padding:7px 14px;text-align:center;"><span style="'+badge[result]+'padding:2px 8px;border-radius:3px;font-size:10px;font-weight:700;">'+label[result]+'</span></td>'+
                '<td style="padding:7px 14px;" onclick="event.stopPropagation()">'+
                  (steps.length===0?
                    '<div style="display:flex;gap:3px;">'+
                      '<button onclick="cycleDashSetDirect(\''+v.id+'\','+idx+',\'Pass\')" style="font-size:10px;font-weight:700;padding:1px 7px;border-radius:3px;border:1px solid '+(isPass?'#00a872':'#ddd')+';background:'+(isPass?'#00a872':'#fff')+';color:'+(isPass?'#fff':'#666')+';cursor:pointer;">Pass</button>'+
                      '<button onclick="cycleDashSetDirect(\''+v.id+'\','+idx+',\'Fail\')" style="font-size:10px;font-weight:700;padding:1px 7px;border-radius:3px;border:1px solid '+(isFail?'#e53e5a':'#ddd')+';background:'+(isFail?'#e53e5a':'#fff')+';color:'+(isFail?'#fff':'#666')+';cursor:pointer;">Fail</button>'+
                    '</div>':
                    '<span style="font-size:10px;color:var(--text3);">Step '+steps.length+'개</span>'
                  )+
                '</td>'+
                '<td></td>'+
              '</tr>'+stepRows;
            }).join(''):'';
            return '<tr onclick="window[\'dashVer_'+v.id+'\']=!window[\'dashVer_'+v.id+'\'];cycleDashRefresh()" style="border-bottom:1px solid '+(isOpen?'transparent':'#f0f0f0')+';background:'+rowBg+';cursor:pointer;" onmouseenter="this.style.background=\'#f0f4ff\'" onmouseleave="this.style.background=\''+rowBg+'\'">'+
              '<td style="padding:8px 14px;font-size:12px;font-weight:600;color:var(--blue);">'+
                '<div style="display:flex;align-items:center;gap:5px;">'+
                  '<i class="ti ti-chevron-right" style="font-size:11px;color:var(--text3);transition:transform 0.15s;'+(isOpen?'transform:rotate(90deg)':'')+'"></i>'+
                  v.version+
                '</div>'+
              '</td>'+
              '<td style="padding:8px 14px;text-align:center;font-weight:700;">'+v.total+'</td>'+
              '<td style="padding:8px 14px;text-align:center;font-weight:700;color:#00a872;">'+v.pass+'</td>'+
              '<td style="padding:8px 14px;text-align:center;font-weight:700;color:#e53e5a;">'+v.fail+'</td>'+
              '<td style="padding:8px 14px;text-align:center;color:#aaa;">'+v.notrun+'</td>'+
              '<td style="padding:8px 14px;">'+
                '<div style="display:flex;align-items:center;gap:6px;">'+
                  '<div style="flex:1;height:6px;border-radius:3px;background:#f0f0f0;overflow:hidden;display:flex;max-width:120px;">'+
                    '<div style="width:'+v.passRate+'%;background:#00a872;"></div>'+
                    '<div style="width:'+v.failRate+'%;background:#e53e5a;"></div>'+
                  '</div>'+
                  '<span style="font-size:11px;color:var(--text3);white-space:nowrap;">'+v.progress+'%</span>'+
                '</div>'+
              '</td>'+
            '</tr>'+tcRows;
          }).join('')+
          '</tbody>'+
        '</table>'+
      '</div>'+
    '</div>';
}

function cycleSelectCycle(cycleId){
  cycleSelCycleId=cycleId;
  const cycle=cycleList.find(c=>c.id===cycleId);
  if(!cycle){ try{cycleRenderTree();}catch(e){} return; }
  const t=document.getElementById('cycle-tbl-title');
  const sub=document.getElementById('cycle-tbl-sub');
  if(t) t.textContent=cycle.model+' / '+cycle.version_group+' / '+cycle.version;
  if(sub) sub.textContent=cycle.created_at||'';
  try{ cycleRenderExecTable(); }catch(e){ console.error('cycleRenderExecTable 오류:',e); const b=document.getElementById('cycle-exec-body'); if(b) b.innerHTML='<div style="padding:40px;text-align:center;color:var(--red);font-size:13px;">결과 표시 오류: '+(e.message||e)+'</div>'; }
  try{ cycleRenderTree(); }catch(e){ console.error('cycleRenderTree 오류:',e); }
}

// ── AI 요약 모달: 저장된 ai_summary 표시 + 재생성 ──
function _cycleAIModal(title, inner){
  let ov=document.getElementById('cycle-ai-modal'); if(ov)ov.remove();
  ov=document.createElement('div'); ov.id='cycle-ai-modal';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:9000;display:flex;align-items:center;justify-content:center;';
  ov.onclick=function(e){ if(e.target===ov) ov.remove(); };
  ov.innerHTML='<div style="width:1200px;max-width:96vw;max-height:92vh;background:#fff;border-radius:16px;box-shadow:0 12px 48px rgba(0,0,0,0.25);display:flex;flex-direction:column;overflow:hidden;">'
    +'<div style="padding:16px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;background:linear-gradient(135deg,rgba(124,58,237,0.07),transparent);">'
      +'<i class="ti ti-sparkles" style="color:#7c3aed;font-size:22px;"></i><b style="font-size:18px;">'+title+'</b>'
      +'<span style="flex:1;"></span><button onclick="document.getElementById(\'cycle-ai-modal\').remove()" style="border:none;background:transparent;cursor:pointer;color:var(--text3);font-size:22px;"><i class="ti ti-x"></i></button>'
    +'</div>'
    +'<div id="cycle-ai-modal-body" style="flex:1;overflow-y:auto;padding:22px 28px;font-size:15px;">'+inner+'</div>'
  +'</div>';
  document.body.appendChild(ov);
}
// AI 요약 전용 마크다운 렌더러 — 제목·불릿·번호 계층을 일정한 크기·들여쓰기로 정돈
function _cycleAIFmt(t){
  var esc=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');};
  var inline=function(s){
    s=esc(s);
    s=s.replace(/`([^`]+)`/g,'<code style="font-family:ui-monospace,monospace;font-size:13.5px;background:#f4f5f7;border:1px solid #e5e8ee;border-radius:4px;padding:1px 6px;white-space:pre-wrap;">$1</code>');
    s=s.replace(/\*\*([^*]+)\*\*/g,'<b style="color:#1c2030;">$1</b>');
    return s;
  };
  var lines=String(t||'').replace(/\r/g,'').split('\n');
  var out=[]; var first=true;
  lines.forEach(function(ln){
    var s=ln.trim();
    if(!s) return;
    var mH=s.match(/^(#{1,4})\s+(.*)$/);
    var isBoldHdr=/^\*\*[^*]+\*\*:?$/.test(s);
    if(mH||isBoldHdr){
      var txt=mH?mH[2]:s.replace(/^\*\*|\*\*:?$/g,'');
      var lvl=mH?mH[1].length:2;
      if(first&&lvl<=1){   // 첫 대제목 → 문서 타이틀
        out.push('<div style="font-size:20px;font-weight:800;color:#1c2030;padding-bottom:11px;margin-bottom:6px;border-bottom:2px solid #ede9fe;">'+inline(txt)+'</div>');
      } else {
        out.push('<div style="display:flex;align-items:center;gap:10px;margin:20px 0 10px;"><span style="width:5px;height:18px;border-radius:3px;background:#7c3aed;flex-shrink:0;"></span><span style="font-size:17px;font-weight:800;color:#1c2030;">'+inline(txt)+'</span></div>');
      }
      first=false; return;
    }
    first=false;
    var mNum=s.match(/^(\d+)[.)]\s+(.*)$/);
    if(mNum){
      out.push('<div style="display:flex;align-items:baseline;gap:10px;margin:13px 0 6px 4px;"><span style="flex-shrink:0;min-width:24px;height:24px;border-radius:50%;background:#ede9fe;color:#6d28d9;font-size:13px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;">'+mNum[1]+'</span><span style="font-size:15.5px;font-weight:700;color:#1c2030;line-height:1.6;">'+inline(mNum[2])+'</span></div>');
      return;
    }
    var mB=ln.match(/^(\s*)[-*•●○]\s+(.*)$/);
    if(mB){
      var depth=Math.min(3, Math.floor(mB[1].length/2));
      out.push('<div style="display:flex;gap:9px;align-items:baseline;padding-left:'+(16+depth*22)+'px;margin:4px 0;"><span style="color:'+(depth?'#c3b5ee':'#7c3aed')+';flex-shrink:0;font-size:10px;line-height:2.2;">●</span><span style="flex:1;font-size:15px;color:#344054;line-height:1.7;">'+inline(mB[2])+'</span></div>');
      return;
    }
    out.push('<div style="font-size:15px;color:#344054;line-height:1.75;margin:5px 0 5px 4px;">'+inline(s)+'</div>');
  });
  return '<div>'+out.join('')+'</div>';
}
async function cycleAISummary(cycleId, regen){
  const cycle=cycleList.find(c=>c.id===cycleId);
  const _fmt=(t)=>{ try{ return _cycleAIFmt(t); }catch(e){ return '<pre style="white-space:pre-wrap;font-family:inherit;">'+String(t).replace(/</g,'&lt;')+'</pre>'; } };
  const foot=(sm)=>'<div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--border);display:flex;align-items:center;gap:10px;">'
    +'<span style="font-size:13px;color:var(--text3);">'+(sm?('생성 '+(sm.at||'')+(sm.model?' · '+sm.model:'')):'')+'</span><span style="flex:1;"></span>'
    +'<button onclick="cycleAISummary(\''+cycleId+'\',true)" style="font-size:14px;padding:8px 16px;border-radius:7px;border:1px solid #7c3aed;background:#fff;color:#7c3aed;cursor:pointer;font-weight:600;"><i class="ti ti-refresh" style="font-size:15px;"></i> 재생성</button></div>';
  if(!regen && cycle && cycle.ai_summary && cycle.ai_summary.text){
    _cycleAIModal('AI Cycle 요약', _fmt(cycle.ai_summary.text)+foot(cycle.ai_summary)); return;
  }
  _cycleAIModal('AI Cycle 요약', '<div style="padding:40px;text-align:center;color:var(--text3);"><i class="ti ti-loader spin" style="font-size:30px;"></i><div style="margin-top:14px;font-size:15px;">Gemma가 실행 결과를 분석하는 중…</div></div>');
  try{
    const d=await (await fetch('/api/cycle/'+encodeURIComponent(cycleId)+'/summarize',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json();
    const body=document.getElementById('cycle-ai-modal-body'); if(!body) return;
    if(!d.ok){ body.innerHTML='<div style="color:var(--red);font-size:13px;"><i class="ti ti-alert-circle"></i> '+String(d.error||'요약 실패').replace(/</g,'&lt;')+'</div>'; return; }
    if(cycle) cycle.ai_summary=d.summary;
    body.innerHTML=_fmt(d.summary.text)+foot(d.summary);
  }catch(e){ const body=document.getElementById('cycle-ai-modal-body'); if(body) body.innerHTML='<div style="color:var(--red);font-size:13px;">요청 오류: '+e.message+'</div>'; }
}
// ── Fail → Jira 자동 등록 ──
async function cycleAutoJira(cycleId){
  const cycle=cycleList.find(c=>c.id===cycleId); if(!cycle) return;
  const fails=(cycle.items||[]).filter(it=>{ const v=String(it.result||it.status||'').toUpperCase(); return v==='FAIL'||resultVerdict(cycleItemStatus(it.steps||[]))==='fail'; });
  if(!fails.length){ showToast('Fail 항목이 없습니다'); return; }
  let defProj=''; try{ defProj=localStorage.getItem('utop_rls_proj')||''; }catch(e){}
  const project=prompt('Jira 프로젝트 키 (Fail '+fails.length+'건을 이슈로 등록):', defProj);
  if(!project||!project.trim()) return;
  const itype=prompt('이슈 유형:', 'Bug'); if(itype===null) return;
  uiConfirm({title:'Fail → Jira 등록', icon:'ti-bug', confirmText:'진행', msg:_bdEsc(project.trim())+' 프로젝트에 Fail '+fails.length+'건을 AI가 작성해 등록합니다. 진행할까요?', onConfirm:async function(){
    showToast('AI가 이슈를 작성해 등록 중… ('+fails.length+'건, 수십 초 걸릴 수 있음)');
    try{
      const d=await (await fetch('/api/cycle/'+encodeURIComponent(cycleId)+'/auto-jira',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({project:project.trim(), issuetype:(itype||'Bug').trim()||'Bug'})})).json();
      if(!d.ok){ showToast('등록 실패: '+String(d.error||'').slice(0,120)); return; }
      const rows=(d.issues||[]).map(r=>'<div style="padding:7px 4px;border-bottom:1px solid #f0f1f3;display:flex;align-items:center;gap:8px;font-size:12.5px;">'
        +(r.ok?'<i class="ti ti-circle-check" style="color:#12b76a;"></i>':'<i class="ti ti-alert-circle" style="color:#e53e5a;"></i>')
        +'<span style="font-family:ui-monospace,monospace;color:var(--text3);">'+String(r.tcid||'').replace(/</g,'&lt;')+'</span>'
        +'<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+String(r.summary||'').replace(/</g,'&lt;')+'</span>'
        +(r.key?('<a href="'+String(r.url||'').replace(/"/g,'&quot;')+'" target="_blank" style="font-weight:800;color:#0052cc;text-decoration:none;">'+r.key+'</a>'):('<span style="font-size:11px;color:#e53e5a;">'+String(r.error||'').slice(0,60).replace(/</g,'&lt;')+'</span>'))
      +'</div>').join('');
      _cycleAIModal('Fail → Jira 등록 결과', rows||'<div style="color:var(--text3);">등록된 이슈가 없습니다.</div>');
    }catch(e){ showToast('요청 오류: '+e.message); }
  }});
}
function cycleRenderExecTable(){
  const body=document.getElementById('cycle-exec-body');
  const prog=document.getElementById('cycle-tbl-prog');
  if(!body) return;
  if(!cycleSelCycleId){
    body.innerHTML='<div style="padding:80px;text-align:center;color:var(--text3);"><i class="ti ti-clipboard-list" style="font-size:48px;display:block;margin-bottom:16px;opacity:0.2;"></i><div style="font-size:15px;font-weight:600;">Test Cycle을 선택하세요</div></div>';
    return;
  }
  const cycle=cycleList.find(c=>c.id===cycleSelCycleId);
  if(!cycle){ body.innerHTML=''; return; }
  const items=cycle.items||[];
  const s=cycleCalcStats(items);
  if(prog){
    prog.style.display='flex';
    const bar=document.getElementById('cycle-tbl-bar');
    const stat=document.getElementById('cycle-tbl-stat');
    if(bar) bar.innerHTML='<div style="width:'+s.passRate+'%;background:#00a872;"></div><div style="width:'+s.failRate+'%;background:#e53e5a;"></div>';
    if(stat) stat.innerHTML='전체 <b>'+s.total+'</b> | <span style="color:#00a872;">Pass <b>'+s.pass+'</b></span> | <span style="color:#e53e5a;">Fail <b>'+s.fail+'</b></span> | 예정 <b>'+s.notrun+'</b>'+(s.exclude?' | <span style="color:#aaa;">제외 <b>'+s.exclude+'</b></span>':'')+' | 진행 <b>'+(s.notStarted?'<span style="color:#aaa;">미진행(0%)</span>':s.progress+'%')+'</b>';
  }
  const fStatus=document.getElementById('cycle-exec-filter')?.value||'';
  const fSearch=(document.getElementById('cycle-exec-search')?.value||'').toLowerCase();
  const withResult=items.map((item,idx)=>{
    const steps=item.steps||[];
    const result=cycleItemStatus(steps);
    // tcList에서 severity/priority 보완
    const fullTC=tcList.find(t=>t.tcid===item.tcid)||{};
    const severity=item.severity||fullTC.severity||'';
    const priority=item.priority||fullTC.priority||'';
    return {...item,_result:result,_idx:idx,severity,priority};
  });
  let filtered=withResult;
  if(fStatus) filtered=filtered.filter(it=>it._result===fStatus);
  if(fSearch) filtered=filtered.filter(it=>(it.tcid||'').toLowerCase().includes(fSearch)||(it.name||'').toLowerCase().includes(fSearch));
  // REQ별 그룹 정렬
  filtered=filtered.slice().sort((a,b)=>(String(a.req_id||'').localeCompare(String(b.req_id||'')))||(String(a.tcid||'').localeCompare(String(b.tcid||''))));
  // 요구사항 커버리지(이 사이클): 전체 REQ 중 모든 TC가 통과한 REQ 비율
  const _reqIds=[...new Set(items.map(it=>it.req_id).filter(Boolean))];
  const _reqPassed=_reqIds.filter(rid=>{ const its=items.filter(it=>it.req_id===rid); return its.length&&its.every(it=>resultVerdict(cycleItemStatus(it.steps||[]))==='pass'); }).length;
  const _reqCovPct=_reqIds.length?Math.round(_reqPassed/_reqIds.length*100):0;
  const cnt=document.getElementById('cycle-tbl-cnt');
  if(cnt) cnt.textContent='1-'+filtered.length+' of '+items.length;
  const badge={'Pass':'background:#00a872;color:#fff;','Fail':'background:#e53e5a;color:#fff;','WIP':'background:#f5b731;color:#fff;','Blocked':'background:#e8820c;color:#fff;','UNEXECUTED':'background:#aaa;color:#fff;'};
  const label={'Pass':'PASS','Fail':'FAIL','WIP':'WIP','Blocked':'BLOCKED','UNEXECUTED':'UNEXECUTED'};
  if(!filtered.length){ body.innerHTML='<div style="padding:40px;text-align:center;color:var(--text3);"><div style="margin-bottom:14px;font-size:13px;">'+(items.length?'필터 결과 없음':'이 사이클에 TC가 없습니다')+'</div><button onclick="cycleAddTCOpen(\''+cycleSelCycleId+'\')" style="font-size:13px;padding:8px 18px;border-radius:7px;border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:700;"><i class="ti ti-plus"></i> TC 추가</button></div>'; return; }
  body.innerHTML=
    '<div style="padding:8px 14px;background:linear-gradient(135deg,rgba(45,111,212,0.07),transparent);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;flex-wrap:wrap;">'+
      '<i class="ti ti-list-check" style="font-size:16px;color:var(--blue);"></i>'+
      '<span style="font-size:12px;font-weight:700;color:var(--text);">요구사항 대비 진행</span>'+
      '<span style="font-size:12px;color:var(--text3);">REQ '+_reqIds.length+'개 · TC '+items.length+'개</span>'+
      '<span style="display:flex;align-items:center;gap:4px;padding:3px 8px;border:1px solid var(--border);border-radius:7px;background:#fff;"><i class="ti ti-plug-connected" style="color:var(--green);font-size:14px;"></i><span style="font-size:11px;color:var(--text3);font-weight:600;">세션</span><select onchange="cycleSetSession(this.value)" title="이 사이클의 기본 접속 장비 (TC별 세션이 우선)" style="font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:5px;outline:none;"><option value="">(TC별 세션)</option>'+(typeof labList!=="undefined"?labList:[]).map(l=>'<option value="'+l.id+'"'+(cycle.sessionLabId===l.id?" selected":"")+'>'+(l.name||"(이름없음)")+(l.ip?" · "+l.ip:"")+'</option>').join('')+'</select></span>'+
      '<div style="flex:1;"></div>'+
      '<span style="font-size:11px;color:var(--text3);">REQ 통과 '+_reqPassed+'/'+_reqIds.length+'</span>'+
      '<span style="font-size:15px;font-weight:800;color:var(--blue);">'+_reqCovPct+'%</span>'+
      '<button onclick="cycleAddTCOpen(\''+cycleSelCycleId+'\')" style="font-size:11px;padding:5px 12px;border-radius:6px;border:1px solid var(--blue);background:#fff;color:var(--blue);cursor:pointer;font-weight:600;display:flex;align-items:center;gap:4px;margin-left:8px;"><i class="ti ti-plus" style="font-size:13px;"></i> TC 추가</button>'+
      '<button onclick="cycleAISummary(\''+cycleSelCycleId+'\')" title="Gemma로 이 Cycle 결과 요약·Fail 분석 (완료 시 자동 생성분 표시)" style="font-size:11px;padding:5px 12px;border-radius:6px;border:1px solid #7c3aed;background:'+(cycle.ai_summary?'rgba(124,58,237,0.08)':'#fff')+';color:#7c3aed;cursor:pointer;font-weight:600;display:flex;align-items:center;gap:4px;"><i class="ti ti-sparkles" style="font-size:13px;"></i> AI 요약'+(cycle.ai_summary?' ●':'')+'</button>'+
      (s.fail?'<button onclick="cycleAutoJira(\''+cycleSelCycleId+'\')" title="Fail 항목을 Gemma가 이슈로 작성해 Jira에 일괄 등록" style="font-size:11px;padding:5px 12px;border-radius:6px;border:1px solid #e53e5a;background:#fff;color:#e53e5a;cursor:pointer;font-weight:600;display:flex;align-items:center;gap:4px;"><i class="ti ti-bug" style="font-size:13px;"></i> Fail→Jira ('+s.fail+')</button>':'')+
    '</div>'+
    '<table style="width:100%;border-collapse:collapse;">'+
    '<thead><tr style="background:#f4f5f7;position:sticky;top:0;z-index:1;border-bottom:2px solid var(--border);">'+
      '<th style="padding:9px 14px;text-align:left;font-size:11px;font-weight:700;color:#666;white-space:nowrap;">TC ID</th>'+
      '<th style="padding:9px 14px;text-align:left;font-size:11px;font-weight:700;color:#666;">Summary</th>'+
      '<th style="padding:9px 14px;text-align:left;font-size:11px;font-weight:700;color:#666;white-space:nowrap;">Severity</th>'+
      '<th style="padding:9px 14px;text-align:left;font-size:11px;font-weight:700;color:#666;white-space:nowrap;">Priority</th>'+
      '<th style="padding:9px 14px;text-align:left;font-size:11px;font-weight:700;color:#666;white-space:nowrap;">Status</th>'+
      '<th style="padding:9px 14px;text-align:left;font-size:11px;font-weight:700;color:#666;white-space:nowrap;">결과 입력</th>'+
    '</tr></thead><tbody>'+
    filtered.map((item,i)=>{
      const isFail=item._result==='Fail';
      const isPass=item._result==='Pass';
      const isWIP=item._result==='WIP';
      const _ftc=tcList.find(t=>t.tcid===item.tcid)||{};
      const steps=(item.steps&&item.steps.length)?item.steps:_checksToSteps(_ftc, cycle&&cycle.model);
      const isOpen=window['cycleExecOpen_'+cycleSelCycleId+'_'+item._idx];
      const rowBg=isFail?'rgba(229,62,90,0.02)':i%2===0?'#fff':'#fafbfc';

      // Step 행들 (판정 표 checks 스냅샷 기준)
      const _ltc=tcList.find(x=>x.tcid===item.tcid);
      const _liveDescs=(_ltc&&Array.isArray(_ltc.checks))?_ltc.checks.filter((c,i)=>{const k=c.kind||'cli'; if(k!=='cli'&&k!=='wait'&&k!=='call'&&k!=='manual'&&k!=='message') return false; if(_isMtrAct(c.action)) return true; const em=(typeof _effModelOfStep==='function')?_effModelOfStep(_ltc.checks,i):'공통'; return !(cycle&&cycle.model&&em!=='공통'&&!_modelGroupMatch(em,cycle.model));}).map(c=>c.desc||c.text||''):[];
      const stepRows=isOpen&&steps.length?steps.map((s,si)=>{
        const sPass=s.result==='Pass';const sFail=s.result==='Fail';const sWIP=s.result==='WIP';
        const _isMtr=_isMtrAct(s.action);
        const _sDesc=s.desc||_liveDescs[si]||(_isMtr?('계측기 '+s.action):'');
        const _typeLabel={contains:'출력 포함',notcontains:'출력 없음',line:'라인 확인'}[s.type]||'';
        const rs={cli:s.cli||'',criteria:s.criteria||s.desc||''};
        return '<tr style="background:'+(sFail?'rgba(229,62,90,0.04)':sPass?'rgba(0,168,114,0.03)':'#f8f9fb')+';border-bottom:1px solid #f0f0f0;">'+
          '<td style="padding:0;"></td>'+
          '<td colspan="4" style="padding:8px 14px 8px 32px;">'+
            '<div style="display:flex;flex-direction:column;gap:5px;">'+
              '<div style="display:flex;align-items:center;gap:8px;margin-bottom:1px;"><span style="font-size:12.5px;font-weight:800;color:var(--blue);">Step#'+(si+1)+'</span>'+(_isMtr?'<span style="font-size:10px;font-weight:800;color:#b5651d;background:#fff3e6;border:1px solid #f0c896;border-radius:4px;padding:1px 7px;"><i class="ti ti-wave-square" style="font-size:10px;"></i> '+String(s.action).replace(/</g,"&lt;")+'</span>':'')+'<select onchange="cycleSetStepModel(\''+cycleSelCycleId+'\','+item._idx+','+si+',this.value)" title="장비(모델) 오버라이드 — 이 사이클에만 적용" style="font-size:10px;color:#7c3aed;background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.28);border-radius:3px;padding:1px 5px;font-weight:600;cursor:pointer;"><option value="공통"'+(((s.model||'공통')==='공통')?' selected':'')+'>공통</option>'+((typeof labList!=='undefined'?labList:[]).map(l=>l.name).filter(Boolean).map(nm=>'<option'+(((s.model||'공통')===nm)?' selected':'')+'>'+String(nm).replace(/</g,'&lt;')+'</option>').join(''))+'</select>'+(_typeLabel?'<span style="font-size:10px;color:var(--text3);background:#eef2f7;padding:1px 7px;border-radius:3px;">'+_typeLabel+'</span>':'')+'<span style="flex:1;"></span>'+(s.executed_at?'<span style="font-size:10px;color:var(--text3);white-space:nowrap;"><i class="ti ti-clock" style="font-size:11px;vertical-align:middle;"></i> '+s.executed_at+'</span>':'')+'</div>'+
              '<div style="display:flex;gap:8px;font-size:11.5px;line-height:1.5;"><span style="flex:0 0 112px;font-weight:700;color:var(--text3);">시험 목적</span><span style="flex:1;min-width:0;color:#1c1f27;font-weight:600;white-space:pre-wrap;word-break:break-word;">'+(_sDesc?String(_sDesc).replace(/&/g,'&amp;').replace(/</g,'&lt;'):'<span style="color:#c0c4cc;font-weight:400;">(미입력)</span>')+'</span></div>'+
              '<div style="display:flex;gap:8px;font-size:11.5px;line-height:1.5;"><span style="flex:0 0 112px;font-weight:700;color:var(--text3);">Test Data</span><span style="flex:1;min-width:0;font-family:ui-monospace,monospace;color:#1c1f27;white-space:pre-wrap;word-break:break-word;">'+(rs.cli?String(rs.cli).replace(/&/g,'&amp;').replace(/</g,'&lt;'):'<span style="color:#c0c4cc;font-family:inherit;">-</span>')+'</span></div>'+
              '<div style="display:flex;gap:8px;font-size:11.5px;line-height:1.5;"><span style="flex:0 0 112px;font-weight:700;color:var(--text3);">Expected Result</span><span style="flex:1;min-width:0;color:#00875a;font-weight:600;white-space:pre-wrap;word-break:break-word;">'+(rs.criteria?String(rs.criteria).replace(/&/g,'&amp;').replace(/</g,'&lt;'):'<span style="color:#c0c4cc;font-weight:400;">(미입력)</span>')+'</span></div>'+
              '<div style="display:flex;gap:8px;font-size:11.5px;line-height:1.5;"><span style="flex:0 0 112px;font-weight:700;color:var(--text3);">Actual Data</span><span style="flex:1;min-width:0;">'+(s.output&&s.output.trim()?(s.output.indexOf('⏳')>=0?'<span style="color:var(--text3);">'+s.output+'</span>':'<span style="font-family:ui-monospace,monospace;display:block;background:#0f1117;color:#cdd6f4;padding:6px 9px;border-radius:4px;overflow:auto;white-space:pre;line-height:1.45;">'+String(s.output).replace(/&/g,"&amp;").replace(/</g,"&lt;")+'</span>'):'<span style="color:#c0c4cc;">(미실행)</span>')+'</span></div>'+
            '</div>'+
          '</td>'+
          '<td style="padding:6px 14px;white-space:nowrap;">'+
            (s.manual?'<span title="수동 스텝 — 직접 확인 후 결과를 선택하세요" style="font-size:10px;padding:3px 9px;border-radius:4px;border:1px solid #c48a00;background:rgba(196,138,0,0.08);color:#c48a00;font-weight:700;margin-right:6px;white-space:nowrap;"><i class="ti ti-hand-click"></i> 수동</span>':'<button onclick="cycleRunStep(\''+cycleSelCycleId+'\','+item._idx+','+si+')" title="이 스텝 실행" style="font-size:10px;padding:3px 9px;border-radius:4px;border:1px solid var(--green);background:rgba(0,168,114,0.08);color:var(--green);cursor:pointer;font-weight:700;margin-right:6px;"><i class="ti ti-player-play"></i></button>')+
            cycleResultBtns('cycleSetStepInline(\''+cycleSelCycleId+'\','+item._idx+','+si+',\'__VAL__\')', s.result)+
          '</td>'+
        '</tr>';
      }).join(''):'';

      // Step 없는 TC의 직접 결과 버튼
      const directBtns=steps.length===0?
        cycleResultBtns('cycleSetDirectResult(\''+cycleSelCycleId+'\','+item._idx+',\'__VAL__\')', item._result):
        '<span style="font-size:11px;color:var(--text3);">Step '+steps.length+'개</span>';

      // Cycle 커스텀 필드 행
      const cfFields=(customFields['cycle']||[]).filter(f=>f.active!==false);
      const cfRow=isOpen&&cfFields.length?
        '<tr style="background:#fafffe;border-bottom:1px solid #f0f0f0;">'+
          '<td colspan="2" style="padding:8px 14px 8px 32px;">'+
            renderCustomFieldsForTarget('cycle', item, (fid,val)=>saveCycleItemCustomField(cycleSelCycleId,item._idx,fid,val))+
          '</td>'+
          '<td colspan="4"></td>'+
        '</tr>':'';

      const summaryRow=(isOpen&&item.llm_summary)?'<tr style="background:linear-gradient(135deg,rgba(157,123,255,0.07),transparent);border-bottom:1px solid #f0f0f0;"><td style="padding:0;"></td><td colspan="5" style="padding:10px 14px 12px 32px;"><div style="display:flex;align-items:flex-start;gap:9px;"><i class="ti ti-sparkles" style="font-size:17px;color:#9d7bff;flex-shrink:0;margin-top:1px;"></i><div style="flex:1;min-width:0;"><div style="font-size:11px;font-weight:700;color:#7c3aed;margin-bottom:4px;">✨ LLM Summary of Actual Results</div><div style="font-size:12px;color:var(--text);white-space:pre-wrap;line-height:1.7;">'+(String(item.llm_summary).indexOf('⏳')>=0?item.llm_summary:_fmtSummary(item.llm_summary))+'</div></div></div></td></tr>':'';

      // REQ 그룹 헤더 (정렬된 목록에서 req_id가 바뀌는 첫 행 앞에 삽입)
      let reqHdr='';
      if(i===0||filtered[i-1].req_id!==item.req_id){
        const _r=reqList.find(x=>x.id===item.req_id);
        const _rits=filtered.filter(x=>x.req_id===item.req_id);
        const _rs=cycleCalcStats(_rits);
        reqHdr='<tr style="background:#eaf0fb;border-top:2px solid rgba(45,111,212,0.25);"><td colspan="6" style="padding:8px 14px;">'
          +'<div style="display:flex;align-items:center;gap:10px;">'
          +'<i class="ti ti-file-description" style="font-size:15px;color:var(--blue);flex-shrink:0;"></i>'
          +'<span style="font-family:monospace;font-size:12px;font-weight:700;color:var(--blue);flex-shrink:0;">'+(_r?_r.reqid:(item.req_id||'REQ 미지정'))+'</span>'
          +'<span style="font-size:12px;color:var(--text2);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+(_r?(_r.title||''):'')+'</span>'
          +'<span style="font-size:11px;color:var(--text3);flex-shrink:0;">TC '+_rs.total+'</span>'
          +'<div style="width:90px;height:7px;border-radius:4px;background:#dde3ec;overflow:hidden;display:flex;flex-shrink:0;"><div style="width:'+_rs.passRate+'%;background:#00a872;"></div><div style="width:'+_rs.failRate+'%;background:#e53e5a;"></div></div>'
          +'<span style="font-size:11px;font-weight:700;color:var(--blue);flex-shrink:0;min-width:34px;text-align:right;">'+_rs.progress+'%</span>'
          +'</div></td></tr>';
      }

      return reqHdr+'<tr onclick="cycleToggleSteps(\''+cycleSelCycleId+'\','+item._idx+')" style="border-bottom:1px solid '+(isOpen?'transparent':'#f0f0f0')+';background:'+rowBg+';cursor:pointer;" onmouseenter="this.style.background=\'#f0f4ff\'" onmouseleave="this.style.background=\''+rowBg+'\'">'+
        '<td style="padding:9px 14px;white-space:nowrap;">'+
          '<div style="display:flex;align-items:center;gap:5px;">'+
            '<i class="ti ti-chevron-right" style="font-size:11px;color:var(--text3);transition:transform 0.15s;'+(isOpen?'transform:rotate(90deg)':'')+'"></i>'+
            '<span style="font-family:monospace;font-size:12px;color:#2d6fd4;font-weight:700;">'+item.tcid+'</span>'+
          '</div>'+
        '</td>'+
        '<td style="padding:9px 14px;font-size:13px;color:var(--text);">'+(item.name||'')+'</td>'+
        '<td style="padding:9px 14px;white-space:nowrap;">'+(item.severity?'<span style="font-size:11px;padding:2px 8px;border-radius:3px;border:1px solid currentColor;font-weight:600;color:'+(item.severity==='Critical'?'var(--red)':item.severity==='Major'?'#e8820c':item.severity==='Normal'?'var(--blue)':item.severity==='Minor'?'var(--green)':'var(--text3)')+'">'+item.severity+'</span>':'<span style="color:#ccc;">-</span>')+'</td>'+
        '<td style="padding:9px 14px;white-space:nowrap;">'+(item.priority?'<span style="font-size:11px;padding:2px 8px;border-radius:3px;background:#f5f5f5;font-weight:600;color:'+(item.priority==='Very High'?'var(--red)':item.priority==='High'?'#e8820c':item.priority==='Medium'?'var(--blue)':'var(--green)')+'">'+item.priority+'</span>':'<span style="color:#ccc;">-</span>')+'</td>'+
        '<td style="padding:6px 14px;white-space:nowrap;"><span style="background:'+(item._result==='UNEXECUTED'?'#aaa':resultColor(item._result))+';color:#fff;padding:3px 10px;border-radius:3px;font-size:11px;font-weight:700;min-width:80px;text-align:center;display:inline-block;">'+(item._result==='UNEXECUTED'?'미실행':item._result)+'</span></td>'+
        '<td style="padding:6px 14px;white-space:nowrap;" onclick="event.stopPropagation()"><button onclick="cycleOpenTCLive(\''+cycleSelCycleId+'\','+item._idx+')" title="실제 TC 절차 화면에서 라이브 실행 (표·Response·Console 그대로)" style="font-size:10px;padding:3px 11px;border-radius:4px;border:1px solid #2d6fd4;background:rgba(45,111,212,0.12);color:#2d6fd4;cursor:pointer;font-weight:700;margin-right:8px;"><i class="ti ti-player-play-filled"></i> 라이브</button><button onclick="cycleRunItem(\''+cycleSelCycleId+'\','+item._idx+')" title="항목 전체 실행 (Netmiko)" style="font-size:10px;padding:3px 11px;border-radius:4px;border:1px solid var(--green);background:rgba(0,168,114,0.1);color:var(--green);cursor:pointer;font-weight:700;margin-right:8px;"><i class="ti ti-player-play"></i> 실행</button><button onclick="cycleLlmSummary(\''+cycleSelCycleId+'\','+item._idx+')" title="실행 결과 LLM 요약" style="font-size:10px;padding:3px 10px;border-radius:4px;border:1px solid #9d7bff;background:rgba(157,123,255,0.12);color:#7c3aed;cursor:pointer;font-weight:700;margin-right:8px;"><i class="ti ti-sparkles"></i> 요약</button>'+directBtns+'<i class="ti ti-trash" title="이 TC를 사이클에서 제거" onclick="cycleRemoveItem(\''+cycleSelCycleId+'\','+item._idx+')" style="font-size:13px;color:#ddd;cursor:pointer;margin-left:16px;" onmouseenter="this.style.color=\'var(--red)\'" onmouseleave="this.style.color=\'#ddd\'"></i></td>'+
      '</tr>'+stepRows+summaryRow+cfRow;
    }).join('')+'</tbody></table>';
}

// TC 행 클릭 → Step 펼침/접힘
function cycleToggleSteps(cycleId, itemIdx){
  const key='cycleExecOpen_'+cycleId+'_'+itemIdx;
  window[key]=!window[key];
  cycleRenderExecTable();
}

// 사이클에서 TC 항목 제거
function cycleRemoveItem(cycleId, itemIdx){
  const cycle=cycleList.find(c=>c.id===cycleId); if(!cycle) return;
  const it=(cycle.items||[])[itemIdx]; if(!it) return;
  uiConfirm({title:'항목 제거', icon:'ti-trash', danger:true, confirmText:'제거', msg:'"'+_bdEsc(it.tcid||'')+'" 항목을 이 사이클에서 제거하시겠습니까?<br><span style="color:var(--text3);font-size:12px;">(입력된 결과도 함께 삭제됩니다)</span>', onConfirm:async function(){
    cycle.items.splice(itemIdx,1);
    await saveCycle(cycle);
    cycleRenderExecTable();
    try{ cycleRenderTree(); }catch(e){}
    showToast('TC를 사이클에서 제거했습니다');
  }});
}

// 사이클에 TC 추가 — 모달 열기
function cycleAddTCOpen(cycleId){
  const cycle=cycleList.find(c=>c.id===cycleId); if(!cycle) return;
  const existing=new Set((cycle.items||[]).map(it=>it.tcid));
  const avail=tcList.filter(t=>!existing.has(t.tcid));
  const byReq={};
  avail.forEach(t=>{ const k=t.req_id||'_none'; (byReq[k]=byReq[k]||[]).push(t); });
  let listHtml='';
  Object.keys(byReq).forEach(rid=>{
    const r=reqList.find(x=>x.id===rid);
    listHtml+='<div style="margin-top:10px;"><div style="font-size:11px;font-weight:700;color:var(--blue);font-family:monospace;margin-bottom:3px;display:flex;align-items:center;gap:6px;"><label style="display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="checkbox" onclick="this.closest(\'div\').parentNode.querySelectorAll(\'.cyc-addtc-chk\').forEach(c=>c.checked=this.checked)" style="width:13px;height:13px;accent-color:var(--blue);">'+(r?r.reqid:'REQ 미지정')+'</label> <span style="color:var(--text3);font-weight:400;">'+(r?(r.title||''):'')+'</span></div>';
    if(byReq[rid].filter(t=>_checksToSteps(t,cycle.model).length>0).length===0){ listHtml+='<div style="font-size:10.5px;color:#b45309;background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;padding:5px 9px;margin:3px 0 5px;line-height:1.5;"><i class="ti ti-alert-triangle"></i> 이 모델(<b>'+cycle.model+'</b>)로 작성된 스텝이 있는 TC가 없습니다 — TC에서 <b>모델 그룹</b>(또는 공통 스텝)을 먼저 작성하세요.</div>'; }
    byReq[rid].forEach(t=>{
      const _cnt=_checksToSteps(t, cycle.model).length; const _dis=(_cnt===0);
      listHtml+='<label style="display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:5px;font-size:12px;'+(_dis?'opacity:0.45;cursor:not-allowed;':'cursor:pointer;')+'" title="'+(_dis?(cycle.model+' 모델 그룹(또는 공통) 스텝이 없어 선택할 수 없습니다 — TC에서 먼저 작성하세요'):'')+'"'+(_dis?'':' onmouseenter="this.style.background=\'#f4f6fb\'" onmouseleave="this.style.background=\'\'"')+'>'+(_dis?'<span style="width:14px;flex-shrink:0;"></span>':'<input type="checkbox" class="cyc-addtc-chk" value="'+t.tcid+'" style="width:14px;height:14px;accent-color:var(--blue);">')+'<span style="font-family:monospace;font-size:11px;color:#2d6fd4;font-weight:700;">'+t.tcid+'</span><span style="flex:1;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+(t.name||'')+'</span>'+(_dis?'<span style="font-size:10px;color:var(--red);flex-shrink:0;white-space:nowrap;"><i class="ti ti-ban"></i> '+cycle.model+' 스텝 없음</span>':'<span style="font-size:10px;color:var(--text3);flex-shrink:0;">Step '+_cnt+'</span>')+'</label>';
    });
    listHtml+='</div>';
  });
  if(!avail.length) listHtml='<div style="padding:34px;text-align:center;color:var(--text3);font-size:13px;">추가할 수 있는 TC가 없습니다 (모든 TC가 이미 포함됨)</div>';
  const modal=document.createElement('div');
  modal.className='modal-overlay';
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:9999;';
  modal.innerHTML='<div style="background:#fff;border-radius:12px;width:580px;max-width:92vw;max-height:82vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,0.25);">'
    +'<div style="padding:14px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;"><i class="ti ti-clipboard-plus" style="color:var(--blue);font-size:18px;"></i><span style="font-size:15px;font-weight:700;">사이클에 TC 추가</span><span style="font-size:11px;color:var(--text3);margin-left:4px;">'+cycle.model+' / '+cycle.version+'</span></div>'
    +'<div style="padding:8px 16px;flex:1;overflow-y:auto;">'+listHtml+'</div>'
    +'<div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;"><button onclick="this.closest(\'.modal-overlay\').remove()" style="font-size:13px;padding:7px 16px;border-radius:7px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;">취소</button><button onclick="cycleAddTCSubmit(\''+cycleId+'\',this)" style="font-size:13px;padding:7px 18px;border-radius:7px;border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:700;"><i class="ti ti-plus"></i> 추가</button></div>'
    +'</div>';
  document.body.appendChild(modal);
}

// 선택한 TC들을 사이클 항목으로 추가
// TC의 판정 표(checks) → 사이클 스텝 스냅샷 (checks 없으면 옛 steps 폴백)
// 스텝의 유효 모델 = 위쪽 가장 가까운 Model 그룹 헤더 (없으면 공통)
function _effModelOfStep(checks, idx){
  for(let i=idx;i>=0;i--){ if((checks[i].kind||'cli')==='model') return checks[i].modelName||'공통'; }
  return '공통';
}
// 계측기(N2X 등) 액션 — DUT 모델과 무관한 공용 장비 → 모델 필터 우회(항상 포함)
function _isMtrAct(a){ return !!(a && /Traffic|ARP|계측|REST/i.test(a)); }
// 사이클 스텝 결과 정규화: 계측기 '실행완료'→Pass, 계측기·대기 실행흔적(출력/시각) 있으면 Pass (예정·제외로 잘못 잡히는 문제 해결)
function _cbNormResult(result, action, output, execAt){ if(result==='실행완료') return 'Pass'; if(result) return result; if((_isMtrAct(action)||action==='대기') && (execAt || (output && String(output).trim()))) return 'Pass'; return ''; }
// 모델/모델그룹 매칭 — 정확 일치 OR 한쪽이 다른쪽 그룹 소속 OR 같은 그룹
function _modelGroupMatch(em, mf){
  if(!mf || em==='공통' || em===mf) return true;
  try{ var ml=(typeof modelList!=='undefined')?modelList:[];
    // 모델명에서 접미사 벗기기 — _1/_2 (중복 방지) 또는 (5.55) 같은 버전 표기 → 원본 모델명으로 매칭 시도
    var _strip=function(s){ s=String(s||'').trim(); var a=s.replace(/_\d+$/,''); var b=s.replace(/\s*\([^)]*\)\s*$/,''); var c=b.replace(/_\d+$/,''); return [s,a,b,c]; };
    var _findName=function(n){ var cands=_strip(n); for(var i=0;i<cands.length;i++){ var mm=ml.find(function(m){return String(m.name||'').trim()===cands[i];}); if(mm) return mm; } return null; };
    var emM=_findName(em), mfM=_findName(mf);
    var emG=emM?emM.group:'';
    var mfG=mfM?mfM.group:'';
    if(emG&&emG===mf) return true;          // em(모델)이 그룹 mf 소속
    if(mfG&&mfG===em) return true;          // mf(모델)이 그룹 em 소속 (em=그룹명)
    if(emG&&mfG&&emG===mfG) return true;    // 같은 그룹
  }catch(e){}
  return false;
}
function _checksToSteps(tc, modelFilter){
  const checks=(tc&&Array.isArray(tc.checks))?tc.checks:[];
  if(checks.length){
    // 이 TC의 모델그룹 헤더 목록 + modelFilter가 가리키는 '단일 타깃 그룹' 결정 (그룹명 직접일치 → 모델→그룹 해석)
    const groups=[]; checks.forEach(c=>{ if((c.kind||'cli')==='model'){ const g=String(c.modelName||'').trim(); if(g&&g!=='공통'&&groups.indexOf(g)<0)groups.push(g); } });
    let tg='';
    if(modelFilter && groups.length){
      if(groups.indexOf(modelFilter)>=0) tg=modelFilter;
      else { for(let gi=0; gi<groups.length; gi++){ if(_modelGroupMatch(groups[gi], modelFilter)){ tg=groups[gi]; break; } } }
    }
    const _J=function(x){ return x!=null?JSON.parse(JSON.stringify(x)):undefined; };
    const _ind=c=>Math.max(0,parseInt(c.indent)||0);
    // 다음 IF 스텝을 찾아 criteria/expected에 병합. Tests의 판정 방식이 IF 스텝으로 옮겨간 이후에도 사이클 UI에 판정기준·기대값이 보이도록.
    const _nextIfInfo=function(i){
      var L=Math.max(0, parseInt(checks[i].indent)||0);
      for(var j=i+1; j<checks.length; j++){
        var nc=checks[j]; var nk=nc.kind||'cli'; var nl=Math.max(0, parseInt(nc.indent)||0);
        // 같은 들여쓰기 or 더 깊은 것만 이 CLI의 판정 대상. 더 얕은 곳으로 나가면 종료.
        if(nl<L) break;
        if(nk==='cli'||nk==='wait'||nk==='call'||nk==='manual'||nk==='message') break;   // 다른 실행 스텝 만나면 이 CLI의 판정 아님
        if(nk==='model'||nk==='proc'||nk==='group') break;
        if(nk==='if'){
          var _cond=String(nc.condition||'').trim();
          var _trueMsg=String(nc.trueMsg||'').trim();
          var _falseMsg=String(nc.falseMsg||'').trim();
          return {cond:_cond, trueMsg:_trueMsg, falseMsg:_falseMsg};
        }
      }
      return null;
    };
    const _leaf=function(c,i,loopVars){ const k=c.kind||'cli'; const _mtr=_isMtrAct(c.action); const em=_effModelOfStep(checks,i);
      // message 스텝은 원본 TC의 text 필드를 desc에 저장하고 action='메시지'로 마킹 → 사이클 렌더링·매칭에서 구분됨
      var _act=(k==='wait'?'대기':k==='call'?'호출':k==='manual'?'수동':k==='message'?'메시지':(c.action||'CLI'));
      var _desc=(k==='message'?String(c.text||''):(c.desc||''));
      var _crit=c.criteria||'';
      var _exp=c.expected||'';
      var _type=c.type||'contains';
      // CLI/SNMP 스텝이고 자체 criteria 없으면 뒤이어 오는 IF 스텝의 condition/trueMsg 를 판정기준·기대값으로 병합.
      // IF의 판정은 조건식(&&/||/==/<= 등) 이라 사이클 UI의 substring 재판정으로는 검증 불가 → type='expr' 로 세팅해서
      // 사이클이 자체 재판정을 건너뛰고 저장된 result(IF 브리지가 세팅한 verdict)를 그대로 사용하도록.
      if(k==='cli' && !_crit){
        var _if=_nextIfInfo(i);
        if(_if){
          if(_if.cond){ _crit=_if.cond; _type='expr'; }
          if(!_exp && _if.trueMsg) _exp=_if.trueMsg;
        }
      }
      return {action:_act, cli:c.cli||'', criteria:_crit, type:_type, excludeLines:c.excludeLines||'', query:c.query||'', critMode:c.critMode||'', excMode:c.excMode||'', model:(_mtr?'공통':em), desc:_desc, result:'', output:'', date:'', waitSec:c.waitSec||0, manual:(k==='manual'?true:undefined), expected:_exp, expected_img:c.expected_img||'', expected_img_w:c.expected_img_w||0, expected_img_h:c.expected_img_h||0,
        queries:_J(Array.isArray(c.queries)?c.queries:undefined), queryVar:c.queryVar||'', extracts:_J(Array.isArray(c.extracts)?c.extracts:undefined), extractVar:c.extractVar||'', extractRule:c.extractRule||'', colVars:_J(c.colVars), colNames:_J(c.colNames), baseline:c.baseline||'',
        _loopVars:(loopVars&&Object.keys(loopVars).length?Object.assign({},loopVars):undefined), _em:em, _mtr:_mtr, _k:k}; };
    // loop-aware 전개: for/count 반복은 body를 펼치고 반복변수($i)를 각 스텝에 태그 → 사이클도 TC처럼 $i 반복
    const build=function(useTg){
      const expand=function(startIdx, endIdx, loopVars){ const res=[]; let i=startIdx;
        while(i<endIdx){ const c=checks[i]; const k=c.kind||'cli'; const L=_ind(c);
          if(k==='loop'||k==='group'){
            let j=i+1; while(j<endIdx && _ind(checks[j])>L) j++;   // body = 더 깊게 들여쓴 스텝들
            const lm=c.loopMode||'count';
            if(lm==='for'){ const fv=String(c.loopVar||'i').trim()||'i'; let f=parseFloat(c.forFrom), t=parseFloat(c.forTo), s=parseFloat(c.forStep); if(isNaN(f))f=1; if(isNaN(t))t=f; if(isNaN(s)||!s)s=1;
              for(let v=f; (s>0?v<=t:v>=t); v+=s){ const lv=Object.assign({}, loopVars); lv[fv]=v; const _b=expand(i+1,j,lv); for(let bi=0;bi<_b.length;bi++)res.push(_b[bi]); if(res.length>8000)break; } }
            else if(lm==='count'){ const cnt=Math.max(1,parseInt(c.loopCount)||2); for(let n=0;n<cnt;n++){ const _b=expand(i+1,j,loopVars); for(let bi=0;bi<_b.length;bi++)res.push(_b[bi]); if(res.length>8000)break; } }
            else { const _b=expand(i+1,j,loopVars); for(let bi=0;bi<_b.length;bi++)res.push(_b[bi]); }   // until/infinite: body 1회(사이클에선 반복조건 미평가)
            i=j; continue;
          }
          if(k==='cli'||k==='wait'||k==='call'||k==='manual'||k==='message'){ const _mtr=_isMtrAct(c.action); const em=_effModelOfStep(checks,i);
            if(!(useTg && !_mtr && k!=='wait' && k!=='call' && k!=='manual' && k!=='message' && tg && em!=='공통' && em!==tg)){ var st=_leaf(c,i,loopVars); delete st._em; delete st._mtr; delete st._k; res.push(st); } }
          i++;
        }
        return res; };
      return expand(0, checks.length, {});
    };
    let out=build(true);
    if(!out.length && !tg) out=build(false);   // 타깃 그룹을 못 정했을 때만 전체 폴백
    return out;
  }
  return ((tc&&tc.steps)||[]).map(s=>({cli:s.cli||'', criteria:s.criteria||s.desc||'', desc:s.desc||'', result:'', date:''}));
}
async function cycleAddTCSubmit(cycleId, btn){
  if(typeof loadDeviceData==='function' && (typeof modelList==='undefined'||!modelList||!modelList.length)){ try{ await loadDeviceData(); }catch(e){} }   // 모델→그룹 해석용 modelList 보장
  const cycle=cycleList.find(c=>c.id===cycleId); if(!cycle) return;
  const modal=btn.closest('.modal-overlay');
  const checked=[...modal.querySelectorAll('.cyc-addtc-chk:checked')].map(c=>c.value);
  if(!checked.length){ showToast('추가할 TC를 선택하세요'); return; }
  cycle.items=cycle.items||[];
  let _added=0;
  checked.forEach(tcid=>{
    const t=tcList.find(x=>x.tcid===tcid); if(!t) return;
    const steps=_checksToSteps(t, cycle.model);
    const devs=_tcTargetDevices(t);
    if(devs.length){   // 대상 장비가 있으면 장비당 사이클 항목 1개씩 자동 생성
      devs.forEach(function(d){
        let _st; try{ _st=JSON.parse(JSON.stringify(steps)); }catch(e){ _st=steps; }
        cycle.items.push({tcid:t.tcid, name:(t.name||t.tcid)+' · '+d.name, req_id:t.req_id||'', severity:t.severity||'', priority:t.priority||'', devId:d.id, devName:d.name, steps:_st});
        _added++;
      });
    } else {
      cycle.items.push({tcid:t.tcid, name:t.name||'', req_id:t.req_id||'', severity:t.severity||'', priority:t.priority||'', steps});
      _added++;
    }
  });
  await saveCycle(cycle);
  modal.remove();
  cycleRenderExecTable();
  try{ cycleRenderTree(); }catch(e){}
  showToast(checked.length+'개 TC → '+_added+'개 항목 추가 (대상 장비별 자동 분리)');
}

// Step 인라인 결과 저장
async function cycleSetStepInline(cycleId, itemIdx, stepIdx, result){
  const cycle=cycleList.find(c=>c.id===cycleId);
  if(!cycle||!cycle.items[itemIdx]) return;
  const item=cycle.items[itemIdx];
  if(!item.steps||!item.steps.length){ const t=tcList.find(x=>x.tcid===item.tcid); item.steps=_checksToSteps(t||{}, cycle.model); }
  if(!item.steps[stepIdx]) return;
  item.steps[stepIdx].result=result;
  item.steps[stepIdx].date=new Date().toISOString().slice(0,10);
  item.steps[stepIdx].executed_at=_nowStr();
  await saveCycle(cycle);
  cycleRenderTree();
  cycleRenderExecTable();
}
// 사이클 스텝 장비(모델) 오버라이드 — item.steps 복사본만 변경(TC 원본 불변)
async function cycleSetStepModel(cycleId, itemIdx, stepIdx, model){
  const cycle=cycleList.find(c=>c.id===cycleId); if(!cycle||!cycle.items[itemIdx]) return;
  const item=cycle.items[itemIdx];
  if(!item.steps||!item.steps.length){ const t=tcList.find(x=>x.tcid===item.tcid); item.steps=_checksToSteps(t||{}, cycle.model); }
  if(!item.steps[stepIdx]) return;
  item.steps[stepIdx].model=model;
  await saveCycle(cycle);
  cycleRenderExecTable();
  showToast('Step '+(stepIdx+1)+' 장비 → '+model+' (이 사이클에만 적용)');
}
function _nowStr(){ const d=new Date(); const p=n=>String(n).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds()); }
// 자동 판정: 조회결과 vs 판정기준(타입별) → Pass/Fail
// 표(고정폭 CLI 출력) 라인별 검증: "컬럼=값 [필터컬럼=필터값]" (필터값 *=비어있지않음, 콤마=목록)
function _judgeTable(output, criteria){
  const lines=String(output||'').split(/\r?\n/);
  let sepIdx=-1;
  for(let i=0;i<lines.length;i++){ if(/-{3,}/.test(lines[i]) && /^[\s-]+$/.test(lines[i])){ sepIdx=i; break; } }
  if(sepIdx<1) return {pass:false, checked:0, fails:[], detail:'표 구분선(---)을 찾지 못했습니다'};
  const ranges=[]; let m; const re=/-+/g; const sep=lines[sepIdx];
  while((m=re.exec(sep))){ ranges.push([m.index, m.index+m[0].length]); }
  if(!ranges.length) return {pass:false, checked:0, fails:[], detail:'컬럼 인식 실패'};
  const cell=(line,idx)=>{ const r=ranges[idx]; if(!r) return ''; const end=(idx===ranges.length-1)?Math.max(line.length,r[1]):r[1]; return String(line||'').slice(r[0],end).trim(); };
  const cols=ranges.map((r,i)=>cell(lines[sepIdx-1]||'',i));
  const colIdx=name=>cols.findIndex(c=>c.toLowerCase()===String(name).toLowerCase());
  const parseToks=s=>String(s||'').trim().split(/\s+/).filter(Boolean).map(t=>{ const neq=t.indexOf('!=')>=0; const p=t.split(neq?'!=':'='); return {col:(p[0]||'').trim(), val:(p[1]||'').trim(), neq:neq}; });
  let filters, checks;
  if(String(criteria||'').indexOf('=>')>=0){ const parts=String(criteria).split('=>'); filters=parseToks(parts[0]); checks=parseToks(parts.slice(1).join('=>')); } // [필터] => [검증들]
  else { const toks=parseToks(criteria); checks=toks.slice(0,1); filters=toks.slice(1); } // 기존: 첫 컬럼=검증, 나머지=필터
  if(!checks.length||!checks[0].col) return {pass:false, checked:0, fails:[], detail:'형식: 컬럼=값 [필터]  또는  [필터] => 컬럼1=값 컬럼2=값   (예: Port=Gi0/1,Gi0/2 => Status=connected Vlan=210)'};
  for(const cc of checks.concat(filters)){ if(cc.col && colIdx(cc.col)<0) return {pass:false, checked:0, fails:[], detail:'컬럼 "'+cc.col+'" 없음 · 인식된 컬럼: '+cols.filter(Boolean).join(', ')}; }
  const matchVal=(cv,v)=> v==='*'? cv!=='' : (v.indexOf(',')>=0? v.split(',').map(x=>x.trim().toLowerCase()).indexOf(cv.toLowerCase())>=0 : cv.toLowerCase()===v.toLowerCase());
  let checked=0; const fails=[];
  for(let i=sepIdx+1;i<lines.length;i++){ const ln=lines[i]; if(!ln.trim()) continue; if(/#\s*$/.test(ln)||(/[#>]\s*\S/.test(ln.trim().slice(-40))&&/^[\w.-]+[#>]/.test(ln.trim()))) continue;
    let ok=true; for(const f of filters){ const fi=colIdx(f.col); if(fi<0){ok=false;break;} let r=matchVal(cell(ln,fi),f.val); if(f.neq)r=!r; if(!r){ok=false;break;} }
    if(!ok) continue; checked++;
    const rowName=cell(ln,0)||('행'+i);
    for(const ck of checks){ const cv=cell(ln,colIdx(ck.col)); let p=matchVal(cv,ck.val); if(ck.neq)p=!p; if(!p){ fails.push(rowName+'→'+ck.col+(ck.neq?'≠':'=')+(cv||'(빈값)')); break; } }
  }
  if(checked===0) return {pass:false, checked:0, fails:[], detail:'조건에 맞는 데이터 행이 없습니다 (필터를 확인하세요)'};
  const pass=fails.length===0; const chkDesc=checks.map(c=>c.col+(c.neq?'≠':'=')+c.val).join(' & ');
  return {pass:pass, checked:checked, fails:fails, detail:pass?('✅ '+checked+'행 모두 '+chkDesc):('❌ '+fails.length+'/'+checked+'행 불합격: '+fails.slice(0,10).join('  |  ')+(fails.length>10?(' 외 '+(fails.length-10)):''))};
}
// 기준(baseline) 전체 비교: 라인·필드 단위로 비교, 하나라도 다르면 불합격 (시각/프롬프트 줄은 자동 제외)
function _judgeDiff(output, baseline, exclude){
  if(!baseline||!String(baseline).trim()) return {pass:false, diffs:[], detail:'기준(baseline)이 없습니다 — Expected Result의 [기준 캡처]로 저장하세요'};
  const _parts=String(exclude||'').split(/[,\n]/).map(s=>s.trim()).filter(Boolean);
  const _exNums=new Set(); const _exSubs=[];
  _parts.forEach(p=>{ const m=p.match(/^#(\d+)$/); if(m) _exNums.add(parseInt(m[1])); else _exSubs.push(p); });
  const skip=l=>{ const t=String(l).trim(); if(!t) return true; if(_exSubs.some(s=>String(l).indexOf(s)>=0)) return true; if(/^[\w.\-]+[#>]/.test(t)) return true; if(/\b(19|20)\d\d\b/.test(t)&&/(KST|KSR|UTC|GMT|JST|Mon|Tue|Wed|Thu|Fri|Sat|Sun|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(t)) return true; if(/\b\d{1,2}:\d{2}:\d{2}\b/.test(t)) return true; if(t.indexOf('─── 기준 비교 ───')>=0||t.indexOf('─── 표 검증 ───')>=0) return true; return false; };
  const norm=s=>String(s||'').split(/\r?\n/).filter((l,i)=>!_exNums.has(i+1)&&!skip(l)).map(l=>l.replace(/\s+/g,' ').trim());
  const a=norm(baseline), b=norm(output); const diffs=[]; const max=Math.max(a.length,b.length);
  for(let i=0;i<max;i++){ if((a[i]||'')!==(b[i]||'')) diffs.push('#'+(i+1)+' 기준[「'+String(a[i]||'(없음)').slice(0,44)+'」] ≠ 결과[「'+String(b[i]||'(없음)').slice(0,44)+'」]'); }
  const pass=diffs.length===0;
  return {pass:pass, diffs:diffs, detail:pass?('✅ 기준과 완전 일치 ('+a.length+'줄 비교)'):('❌ '+diffs.length+'줄 불일치\n'+diffs.slice(0,12).join('\n')+(diffs.length>12?('\n… 외 '+(diffs.length-12)+'줄'):''))};
}
// 행 지정 파서: "1,5" / "1-3" / "2-"(2~끝) / "-"·"*"(전체) → 1-based 행번호 배열
function _parseLineSpec(spec, total){
  const set=new Set(); spec=String(spec||'').trim();
  if(!spec||spec==='*'||spec==='-'){ for(let i=1;i<=total;i++) set.add(i); return [...set]; }
  spec.split(',').forEach(part=>{ part=part.trim(); if(!part) return;
    const m=part.match(/^(\d+)\s*-\s*(\d*)$/);
    if(m){ const a=parseInt(m[1])||1; const b=m[2]?parseInt(m[2]):total; for(let i=a;i<=b&&i<=total;i++){ if(i>=1) set.add(i); } }
    else { const n=parseInt(part); if(n>=1&&n<=total) set.add(n); }
  });
  return [...set].sort((x,y)=>x-y);
}
// 제외 라인: "Uptime, Last change, #3" → 해당 문구 포함 라인 또는 #N(행번호) 제거
function _applyExclude(output, ex){
  if(!ex||!String(ex).trim()) return output||'';
  const nums=new Set(); const subs=[];
  String(ex).split(/[,\n]/).map(s=>s.trim()).filter(Boolean).forEach(p=>{ const m=p.match(/^#(\d+)$/); if(m) nums.add(parseInt(m[1])); else subs.push(p); });
  return String(output||'').split(/\r?\n/).filter((l,i)=> !nums.has(i+1) && !subs.some(s=>l.indexOf(s)>=0)).join('\n');
}
function _judgeReason(output, criteria, type, exclude, verdict){
  type=type||'contains';
  if(type==='none') return 'ℹ 판정 없음 (조회만)';
  if(type==='expr'||type==='diff'||type==='table') return '';
  if(!criteria||!criteria.trim()) return '⚠ 판정 기준(Expected) 미입력';
  const out=_applyExclude(output||'', exclude); const crit=criteria.trim();
  // _judgeCheck 와 동일: Query 로 잘려나간 결과 or 원본 어느 쪽에 있으면 있음으로 판단
  const _hasEither=function(text){ return out.indexOf(text)>=0; };
  if(type==='contains_all'){ const toks=criteria.split(/\r?\n/).map(s=>s.trim()).filter(Boolean); const missing=toks.filter(t=>!_hasEither(t)); return missing.length?('❌ 누락 '+missing.length+'/'+toks.length+': '+missing.map(m=>'「'+String(m).slice(0,40)+'」').join(', ')):('✅ 기준 '+toks.length+'개 모두 포함'); }
  if(type==='notcontains'){ const ln=out.split(/\r?\n/).find(l=>l.indexOf(crit)>=0); return ln?('❌ 있으면 안 되는 "'+crit+'" 발견 → '+ln.trim()):('✅ "'+crit+'" 없음 (정상)'); }
  if(type==='line'){ const i=crit.indexOf(':'); const key=(i>=0?crit.slice(0,i):crit).trim(); const val=(i>=0?crit.slice(i+1):'').trim(); const line=out.split(/\r?\n/).find(l=>l.indexOf(key)>=0); if(!line) return '❌ "'+key+'" 항목 줄을 못 찾음'; return (!val||line.indexOf(val)>=0)?('✅ 일치 → '+line.trim()):('❌ "'+key+'" 줄에 "'+val+'" 없음 → '+line.trim()); }
  if(type==='lines'){ return verdict==='Pass'?'✅ 지정 행 조건 충족':'❌ 지정 행 조건 불충족'; }
  // contains (기본)
  const ln=out.split(/\r?\n/).find(l=>l.indexOf(crit)>=0);
  return ln?('✅ "'+crit+'" 찾음 → '+ln.trim()):('❌ "'+crit+'" 가 출력에 없음');
}
// Query(판정 영역): Response에서 특정 영역만 골라 판정 대상으로 사용
//  · /정규식/플래그  → 매칭 부분(캡처그룹 1 우선) 추출   · 시작..끝 → 두 마커 줄 사이(포함)   · 일반문구 → 그 문구 포함 줄만
function _applyQuery(text, query){
  const q=String(query==null?'':query).trim(); const src=String(text==null?'':text);
  if(!q) return src;
  const rm=q.match(/^\/(.*)\/([gimsuy]*)$/);
  if(rm){
    try{ const fl=rm[2].indexOf('g')>=0?rm[2]:(rm[2]+'g'); const re=new RegExp(rm[1],fl); const outs=[]; let m, guard=0;
      while((m=re.exec(src))&&guard++<100000){ outs.push(m[1]!=null?m[1]:m[0]); if(m.index===re.lastIndex) re.lastIndex++; }
      return outs.join('\n');
    }catch(e){ return src; }
  }
  if(q.indexOf('..')>=0){
    const pi=q.indexOf('..'); const a=q.slice(0,pi).trim(), b=q.slice(pi+2).trim();
    const lines=src.split(/\r?\n/);
    const an=a.match(/^#(\d+)$/), bn=b.match(/^#(\d+)$/);
    if(an&&bn){ let s=parseInt(an[1])-1, e=parseInt(bn[1])-1; if(e<s){const t=s;s=e;e=t;} s=Math.max(0,s); e=Math.min(lines.length-1,e); return lines.slice(s,e+1).join('\n'); }   // 줄번호 범위(#N..#M) — 드래그 영역 정확 캡처
    let s=-1,e=-1;
    for(let i=0;i<lines.length;i++){ if(s<0){ if(a&&lines[i].indexOf(a)>=0) s=i; } else if(b&&lines[i].indexOf(b)>=0){ e=i; break; } }
    if(s>=0){ if(e<0) e=lines.length-1; return lines.slice(s,e+1).join('\n'); }
    return '';
  }
  return src.split(/\r?\n/).filter(l=>l.indexOf(q)>=0).join('\n');
}
function _judgeCheck(output, criteria, type, exclude, query){
  const _qout=_applyQuery(output||'', query);   // Query로 판정 영역 한정
  if(type==='none'||type==='expr') return '';
  if(type==='diff') return '';
  if(type==='table') return _judgeTable(_qout,criteria).pass?'Pass':'Fail';
  if(!criteria||!criteria.trim()) return '';
  const out=_applyExclude(_qout, exclude);
  // ★ '문구 검증' 등에서 Query 로 잘려나간 부분(예: 정규식 캡처만 남은 값)에는 원본에 있던 접두어·접미어가 없음.
  //   → contains/contains_all/notcontains/line 은 필터 결과에 없을 때 원본 output 에서도 검사해 fallback.
  //   (원본에 있으면 판정 통과 — 사용자가 화면에서 본 그대로 검색되는 것이 직관적)
  const _rawOut=_applyExclude(String(output||''), exclude);
  const _has=function(text, tok){ return String(text||'').indexOf(tok)>=0; };
  const _hasEither=function(tok){ return _has(out, tok) || _has(_rawOut, tok); };
  if(type==='lines'){
    const i=criteria.indexOf(':'); const spec=(i>=0?criteria.slice(0,i):criteria).trim(); const val=(i>=0?criteria.slice(i+1):'').trim();
    const lines=out.split(/\r?\n/); const idxs=_parseLineSpec(spec, lines.length);
    if(!idxs.length) return 'Fail';
    const ok=idxs.every(n=>{ const ln=lines[n-1]||''; return val?(ln.indexOf(val)>=0):(ln.trim()!==''); });
    return ok?'Pass':'Fail';
  }
  if(type==='contains_all'){
    const toks=criteria.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    if(!toks.length) return '';
    return toks.every(t=>_hasEither(t))?'Pass':'Fail';
  }
  if(type==='line'){
    const i=criteria.indexOf(':'); const key=(i>=0?criteria.slice(0,i):criteria).trim(); const val=(i>=0?criteria.slice(i+1):'').trim();
    const line=out.split(/\r?\n/).find(l=>l.indexOf(key)>=0) || _rawOut.split(/\r?\n/).find(l=>l.indexOf(key)>=0);
    return (line&&(!val||line.indexOf(val)>=0))?'Pass':'Fail';
  } else if(type==='notcontains'){
    // notcontains 는 Query 필터·원본 모두에 없어야 통과 (안전 방향으로 엄격 유지)
    return (_has(out, criteria.trim()) || _has(_rawOut, criteria.trim()))?'Fail':'Pass';
  }
  return _hasEither(criteria.trim())?'Pass':'Fail';
}
// TC의 모델그룹 헤더에 지정된 대상 장비 목록 [{id,name}] (중복 제거).
// model 지정 시: 그룹 모델명이 일치하면 그 그룹 전체, 아니면 장비명/모델이 일치하는 장비만.
function _tcTargetDevices(tc, model){
  const out=[]; const seen={}; const mf=model?String(model).trim():'';
  ((tc&&tc.checks)||[]).forEach(function(c){
    if((c.kind||'cli')==='model' && Array.isArray(c.devices)){
      const groupMatch = mf && String(c.modelName||'').trim()===mf;
      c.devices.forEach(function(id){ if(!id||seen[id]) return;
        const l=(typeof labList!=='undefined'?labList:[]).find(function(x){return x.id===id;});
        const devMatch = l && (String(l.name||'').trim()===mf || String(l.model||'').trim()===mf);
        if(!mf || groupMatch || devMatch){ seen[id]=1; out.push({id:id, name:(l&&(l.name||l.ip))||id}); }
      });
    }
  });
  return out;
}
// TC의 (장비 → 모델) 쌍 목록. ① 모델그룹 대상 장비 우선, ② 없으면 세션 바 장비(세션 추가로 등록한 시험).
function _tcDeviceModelPairs(tc){
  const out=[]; const seen={};
  ((tc&&tc.checks)||[]).forEach(function(c){
    if((c.kind||'cli')==='model' && Array.isArray(c.devices) && c.devices.length){
      const gm=String(c.modelName||'').trim();
      c.devices.forEach(function(id){ if(!id||seen[id]) return; seen[id]=1;
        const l=(typeof labList!=='undefined'?labList:[]).find(function(x){return x.id===id;});
        const model=(gm && gm!=='공통')?gm:((l&&l.model)||(l&&l.name)||id);
        out.push({devId:id, devName:(l&&(l.name||l.ip))||id, model:model});
      });
    }
  });
  if(out.length) return out;   // 대상 장비가 있으면 그대로
  // 대상 장비 없음 → 세션 바 장비(세션 추가로 등록한 장비) 사용
  const sids=(Array.isArray(tc&&tc.sessions)&&tc.sessions.length)?tc.sessions:((tc&&tc.sessionLabId)?[tc.sessionLabId]:[]);
  sids.forEach(function(id){ if(!id||seen[id]) return; seen[id]=1;
    const l=(typeof labList!=='undefined'?labList:[]).find(function(x){return x.id===id;});
    out.push({devId:id, devName:(l&&(l.name||l.ip))||id, model:((l&&l.model)||(l&&l.name)||id)});
  });
  return out;
}
function _cycleStepLab(tc, s, cycle, devId){
  if(devId){ const l=labList.find(x=>x.id===devId); if(l) return l; }   // 사이클 항목의 대상 장비 우선
  if(s.model&&s.model!=='공통'){ const l=labList.find(x=>x.name===s.model); if(l) return l; }
  const ids=_tcSessIds(tc||{}); if(ids.length){ const l=labList.find(x=>x.id===ids[0]); if(l) return l; }
  if(cycle&&cycle.sessionLabId){ const l=labList.find(x=>x.id===cycle.sessionLabId); if(l) return l; }
  return null;
}
async function cycleSetSession(labId){
  const cycle=cycleList.find(c=>c.id===cycleSelCycleId); if(!cycle) return;
  cycle.sessionLabId=labId||''; await saveCycle(cycle); cycleRenderExecTable();
  showToast(labId?('사이클 세션 장비: '+((labList.find(x=>x.id===labId)||{}).name||'')):'TC별 세션 사용');
}
async function cycleRunStep(cycleId, itemIdx, stepIdx){
  const cycle=cycleList.find(c=>c.id===cycleId); if(!cycle||!cycle.items[itemIdx]) return;
  const item=cycle.items[itemIdx];
  if(!item.steps||!item.steps.length){ const t=tcList.find(x=>x.tcid===item.tcid); item.steps=_checksToSteps(t||{}, cycle.model); }
  const s=item.steps[stepIdx]; if(!s) return;
  if(!(s.cli||'').trim()){ showToast('CLI가 없는 스텝입니다'); return; }
  const tc=tcList.find(x=>x.tcid===item.tcid)||{};
  const l=_cycleStepLab(tc,s,cycle,item.devId);
  if(!l||!l.ip){ showToast('접속 장비가 없습니다 — 상단 [세션]에서 Lab 장비를 선택하세요'); return; }
  s.output='⏳ 실행 중...'; cycleRenderExecTable();
  try{
    const r=await fetch('/api/run-cli',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host:l.ip,port:l.port,protocol:l.protocol,username:l.username,password:l.password,secret:l.secret,device_type:l.device_type,commands:[s.cli]})});
    const d=await r.json();
    if(d.ok&&d.outputs&&d.outputs[0]){ s.output=d.outputs[0].output; s.executed_at=d.outputs[0].at||_nowStr(); const v=_judgeCheck(s.output,s.criteria,s.type,s.excludeLines,s.query); if(v) s.result=v; l.status='연결됨'; }
    else { s.output='[실행 실패] '+(d.error||''); s.executed_at=_nowStr(); l.status='실패'; }
  }catch(e){ s.output='[요청 오류] '+e.message; s.executed_at=_nowStr(); }
  s.date=new Date().toISOString().slice(0,10);
  await saveCycle(cycle); await saveDeviceData(); cycleRenderTree(); cycleRenderExecTable();
}
async function cycleRunItem(cycleId, itemIdx){
  const cycle=cycleList.find(c=>c.id===cycleId); if(!cycle||!cycle.items[itemIdx]) return;
  const item=cycle.items[itemIdx];
  if(!item.steps||!item.steps.length){ const t=tcList.find(x=>x.tcid===item.tcid); item.steps=_checksToSteps(t||{}, cycle.model); }
  const tc=tcList.find(x=>x.tcid===item.tcid)||{};
  const groups={};
  item.steps.forEach((s)=>{ if(!(s.cli||'').trim()) return; const l=_cycleStepLab(tc,s,cycle,item.devId); if(l&&l.ip){ (groups[l.id]=groups[l.id]||{lab:l,items:[]}).items.push(s); } });
  if(!Object.keys(groups).length){ showToast('접속 장비가 없습니다 — 상단 [세션]에서 Lab 장비를 선택하세요'); return; }
  showToast('항목 실행 중...');
  for(const gid of Object.keys(groups)){
    const g=groups[gid], l=g.lab; const cmds=g.items.map(s=>s.cli);
    try{
      const r=await fetch('/api/run-cli',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host:l.ip,port:l.port,protocol:l.protocol,username:l.username,password:l.password,secret:l.secret,device_type:l.device_type,commands:cmds})});
      const d=await r.json();
      if(d.ok&&Array.isArray(d.outputs)){ g.items.forEach((s,idx)=>{ const o=d.outputs[idx]||{}; s.output=o.output||''; const v=_judgeCheck(s.output,s.criteria,s.type,s.excludeLines,s.query); if(v) s.result=v; s.date=new Date().toISOString().slice(0,10); s.executed_at=o.at||_nowStr(); }); l.status='연결됨'; }
      else { g.items.forEach(s=>s.output='[실행 실패] '+(d.error||'')); l.status='실패'; }
    }catch(e){ g.items.forEach(s=>s.output='[요청 오류] '+e.message); }
  }
  await saveCycle(cycle); await saveDeviceData(); cycleRenderTree(); cycleRenderExecTable();
  const _manN=item.steps.filter(s=>s.manual).length;
  showToast('✅ 항목 실행 완료 (자동 판정)'+(_manN?' — 수동 스텝 '+_manN+'개는 직접 결과를 선택하세요':'')+' — LLM 요약 생성 중...');
  try{ await cycleLlmSummary(cycleId, itemIdx); }catch(e){}
}
// ── 사이클 라이브 실행 (실제 TC 절차 화면으로 이동, 모델 스코프, 결과 사이클 반영) ──
let _cycleLiveCtx=null;
function cycleOpenTCLive(cycleId, itemIdx){
  const cycle=cycleList.find(c=>c.id===cycleId); if(!cycle||!cycle.items[itemIdx]) return;
  const item=cycle.items[itemIdx]; const tc=tcList.find(x=>x.tcid===item.tcid);
  if(!tc){ showToast('원본 TC를 찾을 수 없습니다'); return; }
  try{ (tc.checks||[]).forEach(c=>{ if((c.kind||'cli')==='model'){ _modelCol[c.id]=(String(c.modelName||'')!==String(cycle.model||'')); } }); }catch(e){} // 이 모델 외 그룹 접기
  _cycleLiveCtx={cycleId:cycleId, itemIdx:itemIdx, tcid:tc.tcid, model:cycle.model||''};
  showPage('explorer'); try{ expSelectTC(tc.tcid); }catch(e){}
  showToast('라이브 실행: '+tc.tcid+'  ('+(cycle.model||'')+' 모델) — 전체 실행하면 결과가 사이클에 반영됩니다');
}
async function cycleSyncFromTC(){
  if(!_cycleLiveCtx) return;
  const cycle=cycleList.find(c=>c.id===_cycleLiveCtx.cycleId); if(!cycle||!cycle.items[_cycleLiveCtx.itemIdx]) return;
  const tc=tcList.find(x=>x.tcid===_cycleLiveCtx.tcid); if(!tc) return;
  const item=cycle.items[_cycleLiveCtx.itemIdx]; const checks=tc.checks||[]; const steps=[];
  checks.forEach((c,i)=>{ const k=c.kind||'cli'; if(k!=='cli'&&k!=='wait'&&k!=='call'&&k!=='manual'&&k!=='message') return; const _mtr=_isMtrAct(c.action); const em=_effModelOfStep(checks,i); if(!_mtr && cycle.model && em!=='공통' && !_modelGroupMatch(em,cycle.model)) return;
    steps.push({action:(k==='wait'?'대기':k==='call'?'호출':k==='manual'?'수동':k==='message'?'메시지':(c.action||'CLI')), cli:c.cli||'', criteria:c.criteria||'', type:c.type||'contains', excludeLines:c.excludeLines||'', query:c.query||'', model:(_mtr?'공통':em), desc:(k==='message'?(c.text||''):(c.desc||'')), result:_cbNormResult(c.repeatResult||'', (k==='wait'?'대기':k==='message'?'메시지':(c.action||'')), c.output, c.executed_at), output:String(c.output||''), date:(c.executed_at?String(c.executed_at).slice(0,10):''), executed_at:c.executed_at||'', waitSec:c.waitSec||0, manual:(k==='manual'?true:undefined), n2xStats:c.n2xStats||null, n2xNames:c.n2xNames||null, n2xElapsed:c.n2xElapsed||0}); });
  item.steps=steps;
  await saveCycle(cycle); try{ cycleRenderTree(); }catch(e){}
  showToast('✅ 사이클에 결과 반영됨: '+_cycleLiveCtx.tcid+' ('+steps.filter(s=>s.result).length+'/'+steps.length+' 판정)');
}
function cycleBackFromLive(){ const cid=_cycleLiveCtx&&_cycleLiveCtx.cycleId; _cycleLiveCtx=null; if(cid) cycleSelCycleId=cid; showPage('cycle'); try{ cycleRenderExecTable(); }catch(e){} }
function _fmtSummary(t){
  let s=String(t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');
  s=s.replace(/\[\[빨강\]\]([\s\S]*?)\[\[\/빨강\]\]/g,'<span style="color:#e53e5a;font-weight:700;">$1</span>');
  s=s.replace(/(^|\n)(\s*적합\s*:)/g,'$1<b style="color:#00a872;">$2</b>');
  s=s.replace(/(^|\n)(\s*실패\s*:)/g,'$1<b style="color:#e53e5a;">$2</b>');
  return s;
}
async function cycleLlmSummary(cycleId, itemIdx){
  const cycle=cycleList.find(c=>c.id===cycleId); if(!cycle||!cycle.items[itemIdx]) return;
  const item=cycle.items[itemIdx];
  const steps=(item.steps&&item.steps.length)?item.steps:_checksToSteps(tcList.find(x=>x.tcid===item.tcid)||{}, cycle&&cycle.model);
  const ran=steps.filter(s=>s.output&&String(s.output).trim()&&String(s.output).indexOf('⏳')<0);
  if(!ran.length){ showToast('먼저 [실행]으로 결과를 가져오세요'); return; }
  const lines=steps.map((s,i)=>'[Step '+(i+1)+'] CLI: '+(s.cli||'-')+'\n판정기준: '+(s.criteria||'-')+' ('+(s.type||'')+')\n결과: '+(s.result||'미실행')+'\n출력:\n'+String(s.output||'').slice(0,1500)).join('\n\n');
  const prompt='당신은 유비쿼스 네트워크 장비 시험 QA 전문가입니다. 아래 시험 항목의 실제 실행 결과를 바탕으로 한국어로 매우 간결하게 요약하세요.\n\nTC: '+item.tcid+' / '+(item.name||'')+'\n\n'+lines+'\n\n반드시 아래 두 줄 형식으로만 작성:\n적합: (합격 항목들의 사유를 한 줄로 간단히)\n실패: (불합격 항목들의 사유를 한 줄로 간단히. 핵심 실패 이슈(장애 원인/수치)는 [[빨강]]...[[/빨강]] 로 감싸기)\n\n불합격이 없으면 "실패: 없음" 으로. 마크다운 기호(#,*,-) 쓰지 말 것.';
  item.llm_summary='⏳ 요약 생성 중...'; cycleRenderExecTable();
  try{
    const chatLLMs=(typeof llmList!=='undefined'?llmList:[]).filter(l=>l.uses&&l.uses.includes('chat')&&l.status==='active');
    const llm=chatLLMs[0]||null; let reply='';
    if(!llm||llm.type==='claude'){
      const res=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:prompt,history:[]})});
      reply=(await res.json()).reply;
    } else {
      const res=await fetch('/api/chat/local',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:llm.endpoint,model:llm.model,messages:[{role:'user',content:prompt}],max_tokens:llm.max_tokens||1024,context_size:llm.context_size||262144,temperature:0.3,apikey:llm.apikey||''})});
      reply=(await res.json()).reply;
    }
    item.llm_summary=(reply||'').trim()||'(빈 응답)';
  }catch(e){ item.llm_summary='[요약 오류] '+e.message; }
  await saveCycle(cycle); cycleRenderExecTable();
}

// Step 없는 TC 직접 결과 설정
async function cycleSetDirectResult(cycleId, itemIdx, result){
  const cycle=cycleList.find(c=>c.id===cycleId);
  if(!cycle||!cycle.items[itemIdx]) return;
  const item=cycle.items[itemIdx];
  // steps가 없으면 가상 step 하나 생성
  if(!item.steps||item.steps.length===0){
    item.steps=[{criteria:'최종 결과',result:'',date:''}];
  }
  // 모든 step을 같은 결과로
  item.steps.forEach(s=>{ s.result=result; s.date=new Date().toISOString().slice(0,10); });
  await saveCycle(cycle);
  cycleRenderTree();
  cycleRenderExecTable();
}

function cycleOpenExec(cycleId,itemIdx){
  const cycle=cycleList.find(c=>c.id===cycleId);
  if(!cycle) return;
  const item=cycle.items[itemIdx];
  if(!item) return;
  const steps=item.steps||[];
  const result=steps.length?steps.every(x=>x.result==='Pass')?'Pass':steps.some(x=>x.result==='Fail')?'Fail':'UNEXECUTED':'UNEXECUTED';
  const resBadge={'Pass':'background:#00a872;color:#fff;','Fail':'background:#e53e5a;color:#fff;','UNEXECUTED':'background:#aaa;color:#fff;'};
  let modal=document.getElementById('modal-cycle-exec');
  if(modal) modal.remove();
  modal=document.createElement('div');
  modal.id='modal-cycle-exec';
  modal.className='modal-overlay';
  modal.style.display='flex';
  modal.innerHTML=
    '<div class="modal" style="width:620px;border-radius:10px;padding:0;max-height:85vh;display:flex;flex-direction:column;">'+
      '<div style="padding:14px 20px;border-bottom:1px solid var(--border);background:#f4f5f7;display:flex;align-items:center;gap:10px;flex-shrink:0;">'+
        '<i class="ti ti-clipboard-check" style="font-size:16px;color:var(--blue);"></i>'+
        '<div style="flex:1;"><div style="font-size:14px;font-weight:700;">'+item.tcid+'</div><div style="font-size:12px;color:var(--text3);">'+(item.name||'')+'</div></div>'+
        '<span style="font-size:11px;font-weight:700;padding:3px 12px;border-radius:3px;'+resBadge[result]+'">'+result+'</span>'+
        '<button onclick="this.closest(\'.modal-overlay\').remove()" style="width:28px;height:28px;border-radius:6px;border:1px solid var(--border);background:#fff;color:var(--text3);cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;"><i class="ti ti-x"></i></button>'+
      '</div>'+
      '<div style="flex:1;overflow-y:auto;">'+
        '<table style="width:100%;border-collapse:collapse;">'+
        '<thead><tr style="background:#f8f9fb;border-bottom:2px solid var(--border);">'+
          '<th style="padding:8px 14px;text-align:center;font-size:11px;font-weight:700;color:#666;white-space:nowrap;">#</th>'+
          '<th style="padding:8px 14px;text-align:left;font-size:11px;font-weight:700;color:#666;">판정 기준</th>'+
          '<th style="padding:8px 14px;text-align:center;font-size:11px;font-weight:700;color:#666;white-space:nowrap;">Status</th>'+
        '</tr></thead><tbody>'+
        (steps.length?steps.map((s,si)=>{
          const isPass=s.result==='Pass';const isFail=s.result==='Fail';
          return '<tr style="border-bottom:1px solid #f0f0f0;background:'+(isFail?'rgba(229,62,90,0.04)':'')+'">'+
            '<td style="padding:10px 14px;font-size:12px;font-weight:700;color:var(--blue);text-align:center;white-space:nowrap;">'+(si+1)+'</td>'+
            '<td style="padding:10px 14px;font-size:13px;color:var(--text);">'+(s.criteria||s.desc||'기준 없음')+'</td>'+
            '<td style="padding:10px 14px;text-align:center;white-space:nowrap;">'+
              '<div style="display:flex;gap:4px;justify-content:center;">'+
                '<button onclick="cycleSetStep(\''+cycleId+'\','+itemIdx+','+si+',\'Pass\')" style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:3px;border:1px solid '+(isPass?'#00a872':'#ddd')+';background:'+(isPass?'#00a872':'#fff')+';color:'+(isPass?'#fff':'#666')+';cursor:pointer;">Pass</button>'+
                '<button onclick="cycleSetStep(\''+cycleId+'\','+itemIdx+','+si+',\'Fail\')" style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:3px;border:1px solid '+(isFail?'#e53e5a':'#ddd')+';background:'+(isFail?'#e53e5a':'#fff')+';color:'+(isFail?'#fff':'#666')+';cursor:pointer;">Fail</button>'+
                '<button onclick="cycleSetStep(\''+cycleId+'\','+itemIdx+','+si+',\'WIP\')" style="font-size:11px;padding:3px 8px;border-radius:3px;border:1px solid #ddd;background:#fff;color:#666;cursor:pointer;">WIP</button>'+
              '</div>'+
            '</td>'+
          '</tr>';
        }).join(''):'<tr><td colspan="3" style="padding:30px;text-align:center;color:var(--text3);">Step이 없습니다</td></tr>')+
        '</tbody></table>'+
      '</div>'+
      '<div style="padding:10px 20px;border-top:1px solid var(--border);background:#fafbfc;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">'+
        '<span style="font-size:11px;color:var(--text3);">'+cycle.model+' / '+cycle.version_group+' / '+cycle.version+'</span>'+
        '<button onclick="this.closest(\'.modal-overlay\').remove()" style="font-size:13px;padding:6px 20px;border-radius:7px;border:1.5px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;">닫기</button>'+
      '</div>'+
    '</div>';
  document.body.appendChild(modal);
}

async function cycleSetStep(cycleId,itemIdx,stepIdx,result){
  const cycle=cycleList.find(c=>c.id===cycleId);
  if(!cycle||!cycle.items[itemIdx]) return;
  const item=cycle.items[itemIdx];
  if(!item.steps||!item.steps[stepIdx]) return;
  item.steps[stepIdx].result=result;
  item.steps[stepIdx].date=new Date().toISOString().slice(0,10);
  await saveCycle(cycle);
  document.getElementById('modal-cycle-exec')?.remove();
  cycleOpenExec(cycleId,itemIdx);
  cycleRenderTree();
  cycleRenderExecTable();
}

function cycleDeleteConfirm(cycleId){
  uiConfirm({title:'사이클 삭제', icon:'ti-trash', danger:true, confirmText:'삭제', msg:'이 사이클을 삭제하시겠습니까?', onConfirm:async function(){
    try{ await fetch('/api/cycle/'+encodeURIComponent(cycleId),{method:'DELETE'}); }catch(e){}
    cycleList=cycleList.filter(c=>c.id!==cycleId);
    if(cycleSelCycleId===cycleId){ cycleSelCycleId=null; const b=document.getElementById('cycle-exec-body');if(b)b.innerHTML=''; }
    cycleRenderTree();
    showToast('사이클이 삭제되었습니다');
  }});
}

function cycleDeleteGroup(model, grp){
  const targets=cycleList.filter(c=>c.model===model&&c.version_group===grp);
  if(!targets.length) return;
  uiConfirm({title:'버전그룹 삭제', icon:'ti-trash', danger:true, confirmText:'삭제', msg:'"'+_bdEsc(grp)+'" 버전그룹과 하위 버전 '+targets.length+'개를 모두 삭제하시겠습니까?', onConfirm:async function(){
    for(const c of targets){
      try{ await fetch('/api/cycle/'+encodeURIComponent(c.id),{method:'DELETE'}); }catch(e){}
    }
    cycleList=cycleList.filter(c=>!(c.model===model&&c.version_group===grp));
    if(targets.some(c=>c.id===cycleSelCycleId)){ cycleSelCycleId=null; const b=document.getElementById('cycle-exec-body');if(b)b.innerHTML=''; }
    cycleRenderTree();
    showToast(grp+' 버전그룹 삭제 완료 ('+targets.length+'개)');
  }});
}
// 대시보드 새로고침 (현재 표시된 대시보드 재렌더)
function cycleDashRefresh(){
  const title=document.getElementById('cycle-tbl-title')?.textContent||'';
  if(window['_cycleSelGrp']){
    const [model,grp]=window['_cycleSelGrp'].split('__');
    const cycles=cycleSelFolderId?cycleList.filter(c=>c.folder_id===cycleSelFolderId):cycleList;
    cycleRenderDashboard(cycles.filter(c=>c.model===model&&c.version_group===grp), title);
  } else if(window['_cycleSelModel']&&!cycleSelCycleId){
    const model=window['_cycleSelModel'];
    const cycles=cycleSelFolderId?cycleList.filter(c=>c.folder_id===cycleSelFolderId):cycleList;
    cycleRenderDashboard(cycles.filter(c=>c.model===model), title);
  }
}

async function cycleDashSetStep(cycleId, itemIdx, stepIdx, result){
  const cycle=cycleList.find(c=>c.id===cycleId);
  if(!cycle||!cycle.items[itemIdx]) return;
  const item=cycle.items[itemIdx];
  if(!item.steps||!item.steps[stepIdx]) return;
  item.steps[stepIdx].result=result;
  item.steps[stepIdx].date=new Date().toISOString().slice(0,10);
  await saveCycle(cycle);
  cycleDashRefresh();
  cycleRenderTree();
}

async function cycleDashSetDirect(cycleId, itemIdx, result){
  const cycle=cycleList.find(c=>c.id===cycleId);
  if(!cycle||!cycle.items[itemIdx]) return;
  const item=cycle.items[itemIdx];
  if(!item.steps||item.steps.length===0) item.steps=[{criteria:'최종 결과',result:'',date:''}];
  item.steps.forEach(s=>{s.result=result;s.date=new Date().toISOString().slice(0,10);});
  await saveCycle(cycle);
  cycleDashRefresh();
  cycleRenderTree();
}

// ══════════════ 사이클 매트릭스 (프로젝트·제품군·모델명 → TC×모델) ══════════════
let cycleMxGroup='', cycleMxModel='';
function cycleMxFillSelects(){
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const ps=document.getElementById('cycle-project-sel');
  if(ps) ps.innerHTML='<option value="">전체 프로젝트</option>'+cycleFolderList.map(f=>`<option value="${f.id}" ${f.id===cycleSelFolderId?'selected':''}>${esc(f.name)}</option>`).join('');
  const roles=[...new Set((deviceList||[]).map(d=>d.role).filter(Boolean))];
  const gs=document.getElementById('cmx-group');
  if(gs) gs.innerHTML='<option value="">전체 제품군</option>'+roles.map(r=>`<option value="${esc(r)}" ${r===cycleMxGroup?'selected':''}>${esc(r)}</option>`).join('');
  const models=[...new Set((deviceList||[]).filter(d=>!cycleMxGroup||d.role===cycleMxGroup).map(d=>d.name).filter(Boolean))];
  const ms=document.getElementById('cmx-model');
  if(ms) ms.innerHTML='<option value="">전체 모델</option>'+models.map(m=>`<option value="${esc(m)}" ${m===cycleMxModel?'selected':''}>${esc(m)}</option>`).join('');
}function cycleRenderMatrix(){
  const body=document.getElementById('cycle-matrix'); if(!body) return;
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const cycles=cycleList.filter(c=> cycleSelFolderId? c.folder_id===cycleSelFolderId : true);
  if(!cycles.length){ body.innerHTML='<div style="padding:70px;text-align:center;color:var(--text3);"><i class="ti ti-clipboard-list" style="font-size:46px;opacity:0.2;display:block;margin-bottom:14px;"></i><div style="font-size:15px;font-weight:600;">사이클이 없습니다</div><div style="font-size:13px;margin-top:6px;">[+ 새 사이클]로 모델별 사이클을 만드세요</div></div>'; return; }
  const devByModel=m=>(deviceList||[]).find(d=>d.name===m);
  let models=[...new Set(cycles.map(c=>c.model).filter(Boolean))];
  if(cycleMxGroup) models=models.filter(m=>{ const d=devByModel(m); return d&&d.role===cycleMxGroup; });
  if(cycleMxModel) models=models.filter(m=>m===cycleMxModel);
  models.sort();
  const tcMap={}; cycles.forEach(c=>(c.items||[]).forEach(it=>{ const k=it.tcid||it.name||''; if(k&&!tcMap[k]) tcMap[k]={tcid:it.tcid||'',name:it.name||k,key:k}; }));
  const tcs=Object.values(tcMap);
  if(!models.length){ body.innerHTML='<div style="padding:70px;text-align:center;color:var(--text3);">선택한 조건(제품군/모델)에 해당하는 사이클 모델이 없습니다.</div>'; return; }
  const cByModel={}; cycles.forEach(c=>{ if(c.model) cByModel[c.model]=c; });
  const modStat={}; models.forEach(m=>{ const c=cByModel[m]; modStat[m]=cycleCalcStats((c&&c.items)||[]); });
  const cellOf=(tc,model)=>{ const c=cByModel[model]; if(!c) return null; const it=(c.items||[]).find(x=>(x.tcid||x.name)===tc.key); if(!it) return null; return {st:cycleItemStatus(it.steps),cycle:c}; };
  let head='<tr><th style="position:sticky;left:0;top:0;z-index:4;background:#e9edf2;padding:10px 12px;text-align:left;font-size:11px;color:var(--text3);border-bottom:2px solid #cfd4dc;border-right:2px solid #cdd3db;min-width:250px;">TC \\ 모델</th>';
  models.forEach(m=>{ const s=modStat[m]; const d=devByModel(m); head+=`<th style="position:sticky;top:0;z-index:3;background:#e9edf2;padding:8px 10px;text-align:center;border-bottom:2px solid #cfd4dc;border-right:1px solid #dfe3e8;min-width:100px;cursor:pointer;" onclick="cycleMxOpen('${cByModel[m]?cByModel[m].id:''}')"><div style="font-size:12.5px;font-weight:800;color:var(--text);">${esc(m)}</div><div style="font-size:9px;color:var(--text3);font-weight:700;">${d?esc(d.role):'<span style="color:#e8820c">미등록</span>'}</div><div style="font-size:10px;margin-top:3px;">${s.inScope?(`<b style="color:#00a872;">${s.pass}</b> / <b style="color:#e53e5a;">${s.fail}</b> / ${s.inScope}`):'<span style="color:#bbb;">미진행</span>'}</div></th>`; });
  head+='</tr>';
  let rows='';
  tcs.forEach(tc=>{
    rows+=`<tr><td style="position:sticky;left:0;z-index:2;background:#fff;padding:7px 12px;border-bottom:1px solid #eef0f3;border-right:2px solid #cdd3db;"><div style="font-family:monospace;font-size:10px;color:var(--blue);font-weight:700;">${esc(tc.tcid)}</div><div style="font-size:12px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px;">${esc(tc.name)}</div></td>`;
    models.forEach(m=>{ const cv=cellOf(tc,m);
      if(!cv){ rows+='<td style="text-align:center;color:#ccc;border-bottom:1px solid #eef0f3;border-right:1px solid #f0f2f5;font-size:12px;">—</td>'; return; }
      const oc=`onclick="cycleMxOpen('${cv.cycle.id}')" style="text-align:center;border-bottom:1px solid #eef0f3;border-right:1px solid #f0f2f5;cursor:pointer;"`;
      if(cv.st==='UNEXECUTED'){ rows+=`<td ${oc}><span style="font-size:10px;color:#aab2c0;">미실행</span></td>`; return; }
      const mt=resultMeta(cv.st); const col=(mt&&mt.color)||'#888';
      rows+=`<td ${oc}><span style="display:inline-block;min-width:46px;font-size:10.5px;font-weight:700;color:#fff;background:${col};border-radius:11px;padding:2px 8px;">${esc(cv.st)}</span></td>`;
    });
    rows+='</tr>';
  });
  body.innerHTML=`<table style="border-collapse:collapse;font-size:12px;width:max-content;min-width:100%;"><thead>${head}</thead><tbody>${rows}</tbody></table>
    <div style="padding:12px 18px;font-size:11.5px;color:var(--text3);"><i class="ti ti-info-circle"></i> 행=TC · 열=모델(제품군) · 셀=최신 판정. 셀/열 머리글 클릭 → 해당 사이클 실행표. (TC ${tcs.length} × 모델 ${models.length})</div>`;
}
function cycleMxOpen(cycleId){
  if(!cycleId){ showToast('이 모델의 사이클이 없습니다'); return; }
  const c=cycleList.find(x=>x.id===cycleId); if(!c){ showToast('사이클을 찾을 수 없습니다'); return; }
  cycleOpenExecModal(c);
}
function cycleOpenExecModal(c){
  document.getElementById('modal-cycle-exec')?.remove();
  const m=document.createElement('div'); m.id='modal-cycle-exec'; m.className='modal-overlay'; m.style.display='flex';
  m.innerHTML='<div class="modal" style="width:94vw;max-width:1200px;height:88vh;border-radius:12px;padding:0;display:flex;flex-direction:column;">'
    +'<div style="padding:12px 20px;border-bottom:1px solid var(--border);background:#f4f5f7;display:flex;align-items:center;gap:10px;flex-shrink:0;"><i class="ti ti-clipboard-list" style="color:var(--blue);"></i><b style="font-size:15px;">'+(c.name||c.model||'')+'</b><span style="font-size:12px;color:var(--text3);">'+(c.model||'')+(c.version?(' · '+c.version):'')+'</span><span style="flex:1;"></span>'
    +'<select id="cycle-exec-filter" onchange="cycleRenderExecTable()" style="font-size:12px;padding:4px 8px;border:1px solid var(--border);border-radius:5px;outline:none;"><option value="">전체</option><option value="Pass">Pass</option><option value="Fail">Fail</option><option value="UNEXECUTED">미실행</option></select>'
    +'<input id="cycle-exec-search" placeholder="TC 검색..." oninput="cycleRenderExecTable()" style="font-size:12px;padding:4px 8px;border:1px solid var(--border);border-radius:5px;outline:none;width:120px;">'
    +'<button onclick="document.getElementById(\'modal-cycle-exec\').remove();cycleRenderMatrix();" style="font-size:13px;padding:5px 12px;border:1px solid var(--border);border-radius:6px;background:#fff;cursor:pointer;">닫기</button></div>'
    +'<div style="flex:1;overflow-y:auto;background:#fff;" id="cycle-exec-body"></div></div>';
  document.body.appendChild(m);
  cycleSelCycleId=c.id;
  try{ cycleRenderExecTable(); }catch(e){ document.getElementById('cycle-exec-body').innerHTML='<div style="padding:40px;color:var(--red);">실행표 렌더 오류: '+e.message+'</div>'; }
}
// ══════════════ 사이클 5열 캐스케이딩 보드 (프로젝트>모델>버전그룹>버전>항목) ══════════════
let cbSel={mgroup:'',model:'',vgroup:'',version:'',project:''};   // mgroup=모델그룹, model=모델명 (4단계: 모델그룹▸모델▸버전그룹▸버전)
let cbStatFilter='';   // Test Execution 통계 박스 클릭 → 상태별 필터 ('' = 전체)
let cbItemSearch='';   // Test Execution TC 검색
let cbItemReqs=new Set();   // 선택 REQ(멀티) — 실시간 저장/복원
try{ const _ir=JSON.parse(localStorage.getItem('utop_cbitemreqs')||'[]'); if(Array.isArray(_ir))cbItemReqs=new Set(_ir); }catch(_e){}
let cbReqTreeClosed=new Set(); try{ const _rt=JSON.parse(localStorage.getItem('utop_cbreqtree')||'[]'); if(Array.isArray(_rt))cbReqTreeClosed=new Set(_rt); }catch(_e){}   // 닫힌 폴더(기본 전체 펼침)
let cbReqPanelOpen=false; try{ cbReqPanelOpen=localStorage.getItem('utop_cbreqpanel')==='1'; }catch(_e){}   // REQ 폴더 패널 펼침(기본 접힘)
let _cbRefTab='proc';   // Test Procedure Details 세로 레일 활성 탭 (proc/info/env/topo/traffic/issue/history)
let cbSelItem=null;
let cbItemSel=new Set();
let cbReqCollapsed=new Set();   // col2에서 접힌 REQ 그룹 id
function cbToggleReq(rid){ if(cbReqCollapsed.has(rid)) cbReqCollapsed.delete(rid); else cbReqCollapsed.add(rid); try{ localStorage.setItem('utop_cbreqcol', JSON.stringify(Array.from(cbReqCollapsed))); }catch(e){}   /* 접기 상태 유지 */ const c2=document.getElementById('cb-col2body'); if(c2)c2.innerHTML=cbCol2Html(); }
function cbSaveSel(){ try{ localStorage.setItem('utop_cbsel', JSON.stringify(cbSel)); localStorage.setItem('utop_cbselitem', cbSelItem||''); }catch(e){} }
function cbLoadSel(){ try{ const s=JSON.parse(localStorage.getItem('utop_cbsel')||'null'); if(s&&typeof s==='object'){ cbSel.mgroup=s.mgroup||''; cbSel.model=s.model||''; cbSel.vgroup=s.vgroup||''; cbSel.version=s.version||''; } const si=localStorage.getItem('utop_cbselitem')||''; cbSelItem=si||null; const rc=JSON.parse(localStorage.getItem('utop_cbreqcol')||'[]'); if(Array.isArray(rc)) cbReqCollapsed=new Set(rc); const sc=JSON.parse(localStorage.getItem('utop_cbcollapse')||'null'); if(sc&&typeof sc==='object'){ cbCollapse.tree=!!sc.tree; cbCollapse.exec=!!sc.exec; } }catch(e){} }   // 접기 상태 복원
let cbFilter={project:'',model:'',vgroup:'',version:''};
let cbColW={tree:300,exec:820,detail:840,project:148,model:128,vgroup:144,version:200};
let cbTreeOpen=new Set();
let cbCollapse={tree:false,exec:false};
let cbTreeSortDir=1; // 1 오름차순, -1 내림차순
let cbHideDone=false; // 트리: 완료 사이클 숨기고 진행중·예정만 표시
// 사이클 진행상태: 예정(미시작) / 진행중 / 완료(전부 판정)
function _cbCyStatus(cy){ const st=cycleCalcStats((cy&&cy.items)||[]); if(!st.total) return 'planned'; if(st.pending<=0) return 'done'; if(st.pending>=st.total) return 'planned'; return 'progress'; }
function _cbCyShow(cy){ return !cbHideDone || _cbCyStatus(cy)!=='done'; }
function cbToggleHideDone(){ cbHideDone=!cbHideDone; renderCycleBoard(); }
function cbTreeSortToggle(){ cbTreeSortDir=-cbTreeSortDir; renderCycleBoard(); }
const CB_COLOR={project:'#2d6fd4',model:'#00a872',vgroup:'#7c3aed',version:'#e8820c'};
function _cbHandle2(which){ return '<div onmousedown="cbResize2(event,\''+which+'\')" title="드래그로 폭 조절" style="width:5px;flex-shrink:0;cursor:col-resize;background:var(--border);opacity:0.4;" onmouseenter="this.style.opacity=\'1\';this.style.background=\'var(--blue)\'" onmouseleave="this.style.opacity=\'0.4\';this.style.background=\'var(--border)\'"></div>'; }
function cbResize2(e,which){ e.preventDefault(); e.stopPropagation(); const id=which==='tree'?'cb-col-tree':(which==='detail'?'cb-col-3':'cb-col-2'); const dir=(which==='detail')?-1:1; const startX=e.clientX, startW=cbColW[which]||300;
  const ov=document.createElement('div'); ov.className='cb-resize-ov'; ov.style.cssText='position:fixed;inset:0;z-index:99999;cursor:col-resize;'; document.body.appendChild(ov); const _pu=document.body.style.userSelect; document.body.style.userSelect='none';
  function mv(ev){ cbColW[which]=Math.max(160,startW+dir*(ev.clientX-startX)); const col=document.getElementById(id); if(col){col.style.flex='0 0 '+cbColW[which]+'px';col.style.width=cbColW[which]+'px';} }
  function up(){ document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up); window.removeEventListener('mouseup',up); window.removeEventListener('blur',up); try{ document.querySelectorAll('.cb-resize-ov').forEach(function(o){ if(o.parentNode)o.parentNode.removeChild(o); }); }catch(_e){ if(ov.parentNode)ov.parentNode.removeChild(ov); } document.body.style.userSelect=_pu||''; }
  document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up); window.addEventListener('mouseup',up); window.addEventListener('blur',up); }
function cbToggleCollapse(which){ cbCollapse[which]=!cbCollapse[which]; try{ localStorage.setItem('utop_cbcollapse',JSON.stringify(cbCollapse)); }catch(e){} renderCycleBoard(); }   // 접기 상태 영속(상시 접기)
function cbTreeExpandAll(open){ cbTreeOpen=new Set(); if(open){ (cycleList||[]).forEach(function(c){ const mg=_cycMGroup(c), m=c.model||'(미지정)', g=c.version_group||'(미분류)'; cbTreeOpen.add('mg@@'+mg); cbTreeOpen.add('m@@'+mg+'@@'+m); cbTreeOpen.add('g@@'+mg+'@@'+m+'@@'+g); }); } const t=document.getElementById('cb-tree'); if(t)t.innerHTML=cbTreeHtml(); }
function cbResize(e,level){
  e.preventDefault();
  const startX=e.clientX, startW=cbColW[level]||200;
  function mv(ev){ cbColW[level]=Math.max(120,startW+(ev.clientX-startX)); const col=document.getElementById('cb-col-'+level); if(col){ col.style.flex='0 0 '+cbColW[level]+'px'; col.style.width=cbColW[level]+'px'; } }
  function up(){ document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up); }
  document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up);
}
function _cbCycles(upto){
  return cycleList.filter(c=>
    (upto<1||!cbSel.project||c.folder_id===cbSel.project)&&
    (upto<2||!cbSel.model||c.model===cbSel.model)&&
    (upto<3||!cbSel.vgroup||(c.version_group||'(미분류)')===cbSel.vgroup)&&
    (upto<4||!cbSel.version||c.version===cbSel.version));
}
function cbCurrentCycle(){ return cycleList.find(c=>(!cbSel.mgroup||_cycMGroup(c)===cbSel.mgroup)&&(!cbSel.model||c.model===cbSel.model)&&(!cbSel.vgroup||(c.version_group||'(미분류)')===cbSel.vgroup)&&c.version===cbSel.version); }
function cbMatchCycles(){ return cycleList.filter(c=>(!cbSel.mgroup||_cycMGroup(c)===cbSel.mgroup)&&(!cbSel.model||c.model===cbSel.model)&&(!cbSel.vgroup||(c.version_group||'(미분류)')===cbSel.vgroup)&&(!cbSel.version||c.version===cbSel.version)); }
function cbFlatItems(){ const out=[]; cbMatchCycles().forEach(function(cy){ (cy.items||[]).forEach(function(it,ii){ out.push({cy:cy,it:it,ii:ii,key:cy.id+'@@'+ii}); }); }); return out; }
function cbResolve(key){ const p=String(key||'').split('@@'); const cy=cycleList.find(c=>c.id===p[0]); const ii=parseInt(p[1]); return {cy:cy,it:cy?(cy.items||[])[ii]:null,ii:ii}; }
function cbRows(level){
  if(level==='project'){ return cycleFolderList.map(f=>({key:f.id,label:f.name,sel:cbSel.project===f.id,sub:cycleList.filter(c=>c.folder_id===f.id).length})); }
  if(level==='model'){ const cs=_cbCycles(1); return [...new Set(cs.map(c=>c.model).filter(Boolean))].map(m=>({key:m,label:m,sel:cbSel.model===m,sub:cs.filter(c=>c.model===m).length})); }
  if(level==='vgroup'){ const cs=_cbCycles(2); return [...new Set(cs.map(c=>c.version_group||'(미분류)'))].map(g=>({key:g,label:g,sel:cbSel.vgroup===g,sub:cs.filter(c=>(c.version_group||'(미분류)')===g).length})); }
  if(level==='version'){ const cs=_cbCycles(3); return [...new Set(cs.map(c=>c.version).filter(Boolean))].map(v=>{ const cy=cs.find(c=>c.version===v); const st=cy?cycleCalcStats(cy.items||[]):null; return {key:v,label:v,sel:cbSel.version===v,stat:st}; }); }
  return [];
}
// ── 2열 상단 브레드크럼 드롭다운 (프로젝트 › 릴리즈 › 사이클) — 트리와 별개로 빠른 선택 ──
function cbBcPick(level,val){ try{ if(cbItemSel&&cbItemSel.clear)cbItemSel.clear(); }catch(_e){} cbSelItem=null;
  if(level==='model'){ cbSel.mgroup=''; cbSel.model=val; cbSel.vgroup=''; cbSel.version=''; }
  else if(level==='vgroup'){ cbSel.vgroup=val; cbSel.version=''; }
  else if(level==='version'){ cbSel.version=val; }
  if(typeof cbSaveSel==='function') cbSaveSel();
  renderCycleBoard();
}
function cbSetCycleMeta(field,val){ const cy=cbCurrentCycle(); if(!cy) return; cy[field]=(val||'').trim(); try{ if(typeof saveCycle==='function') saveCycle(cy); }catch(e){} }   // 담당자/기간 인라인 저장(포커스 유지 위해 재렌더 안 함)
function _cbBar(st){
  if(!st||!st.inScope) return '<span style="font-size:9px;color:#bbb;white-space:nowrap;">미진행</span>';
  return '<div style="display:flex;align-items:center;gap:4px;flex-shrink:0;"><div style="width:48px;height:6px;border-radius:3px;background:#e0e0e0;overflow:hidden;display:flex;"><div style="width:'+st.passRate+'%;background:#00a872;"></div><div style="width:'+st.failRate+'%;background:#e53e5a;"></div></div><span style="font-size:9px;color:var(--text3);white-space:nowrap;">'+st.pass+'/'+st.inScope+'</span></div>';
}
function cbListHtml(level){
  const color=CB_COLOR[level]; const f=cbFilter[level]||'';
  const rows=cbRows(level).filter(r=>!f||String(r.label).toLowerCase().includes(f));
  if(!rows.length) return '<div style="padding:18px;text-align:center;color:var(--text3);font-size:11px;">없음</div>';
  return rows.map(r=>{
    const right=(level==='version')?_cbBar(r.stat):'<span style="font-size:9px;color:#fff;background:'+color+';border-radius:8px;padding:1px 6px;font-weight:700;">'+_bdEsc(r.sub)+'</span>';
    return '<div onclick="cbPick(\''+level+'\',this.dataset.k)" data-k="'+_bdEsc(r.key)+'" style="padding:8px 11px;border-bottom:1px solid #eef0f3;cursor:pointer;display:flex;align-items:center;gap:7px;background:'+(r.sel?'rgba(45,111,212,0.08)':'')+';border-left:3px solid '+(r.sel?color:'transparent')+';"><span style="flex:1;min-width:0;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:'+(r.sel?'700':'500')+';color:var(--text);">'+_bdEsc(r.label)+'</span>'+right+'</div>';
  }).join('');
}
function cbRenderList(level){ const el=document.getElementById('cb-list-'+level); if(el) el.innerHTML=cbListHtml(level); }function cbItemsHtml(){
  const cycles=cbMatchCycles();
  if(!cycles.length) return '<div style="padding:40px;text-align:center;color:var(--text3);font-size:13px;">조건에 맞는 사이클이 없습니다.<br>상단에서 프로젝트/모델/버전을 선택하거나 [생성]하세요.</div>';
  const flat=cbFlatItems();
  if(!flat.length) return '<div style="padding:40px;text-align:center;color:var(--text3);font-size:13px;">항목(TC)이 없습니다.</div>';
  const multi=(cycles.length>1)||!cbSel.version;
  const allItems=flat.map(f=>f.it);
  const reqCnt=new Set(allItems.map(it=>it.req_id).filter(Boolean)).size; const st=cycleCalcStats(allItems);
  const label=cbSel.version?cbSel.version:(cbSel.model?(cbSel.model+' · 전버전'):(cbSel.project?'프로젝트 전체':'전체'));
  const summary='<div style="padding:8px 12px;border-bottom:1px solid var(--border);background:#faf9fe;display:flex;align-items:center;gap:12px;flex-wrap:wrap;position:sticky;top:0;z-index:2;font-size:11.5px;">'+
    '<span style="font-weight:800;color:var(--text2);"><i class="ti ti-versions" style="color:#e8820c;"></i> '+_bdEsc(label)+'</span>'+
    '<span style="color:#2d6fd4;font-weight:700;">요구사항 '+reqCnt+'</span>'+
    '<span style="color:#00875a;font-weight:700;">TC '+flat.length+'</span>'+
    (multi?'<span style="color:var(--text3);">· 사이클 '+cycles.length+'</span>':'')+
    '<span style="flex:1;"></span>'+
    '<span style="color:#00a872;font-weight:700;">합격 '+st.pass+'</span><span style="color:#e53e5a;font-weight:700;">불합격 '+st.fail+'</span><span style="color:var(--text3);">미실행 '+st.pending+'</span>'+
  '</div>';
  const STAT=[['예정','#9aa0b8'],['PASS','#00a872'],['FAIL','#e53e5a'],['미구현','#e8820c'],['미지원','#7c3aed'],['제외','#888888']];
  const statusOf=function(it){ const s=cycleItemStatus(it.steps); if(!s||s==='UNEXECUTED')return '예정'; if(s==='미구현')return '미구현'; if(s==='미지원')return '미지원'; const v=resultVerdict(s); if(v==='pass')return 'PASS'; if(v==='fail')return 'FAIL'; return '제외'; };
  const th='padding:6px 4px;text-align:center;font-size:10px;font-weight:800;border:1px solid #d7dbe2;white-space:nowrap;background:#eef1f5;';
  const allSel=flat.length>0&&flat.every(f=>cbItemSel.has(f.key));
  const head='<tr><th style="'+th+'width:26px;"><input type="checkbox" '+(allSel?'checked':'')+' onclick="cbToggleAllItems(this.checked)"></th>'+(multi?'<th style="'+th+'text-align:left;">모델</th><th style="'+th+'text-align:left;">버전</th>':'')+'<th style="'+th+'text-align:left;">요구사항</th><th style="'+th+'text-align:left;">TC</th><th style="'+th+'text-align:left;width:120px;">결과</th></tr>';
  const rows=flat.map(function(f){
    const it=f.it; const r=reqList.find(x=>x.id===it.req_id); const cur=statusOf(it); const td='padding:5px 7px;border:1px solid #eef0f3;';
    const curColor=(STAT.find(s=>s[0]===cur)||['','#888'])[1];
    const cells='<td style="'+td+'"><select onclick="event.stopPropagation()" onchange="cbSetItemStatus(\''+f.key+'\',this.value)" style="font-size:11px;padding:4px 9px;border:1px solid #cfd4dc;border-radius:8px;background:#fff;outline:none;cursor:pointer;color:'+curColor+';font-weight:700;min-width:90px;">'+STAT.map(s=>'<option value="'+s[0]+'"'+(cur===s[0]?' selected':'')+'>'+s[0]+'</option>').join('')+'</select></td>';
    const selRow=(cbSelItem===f.key); const chk=cbItemSel.has(f.key);
    const mv=multi?('<td style="'+td+'font-size:10.5px;color:var(--text2);white-space:nowrap;">'+_bdEsc(f.cy.model||'')+'</td><td style="'+td+'font-size:10.5px;color:#e8820c;font-weight:700;white-space:nowrap;">'+_bdEsc(f.cy.version||'')+'</td>'):'';
    return '<tr style="'+(selRow?'background:rgba(45,111,212,0.07);':'')+'">'+
      '<td style="'+td+'text-align:center;border-left:3px solid '+(selRow?'#2d6fd4':'transparent')+';"><input type="checkbox" '+(chk?'checked':'')+' onclick="event.stopPropagation();cbToggleItemSel(\''+f.key+'\',this.checked)"></td>'+
      mv+
      '<td onclick="cbSelectItem(\''+f.key+'\')" style="'+td+'cursor:pointer;white-space:nowrap;"><span style="font-family:monospace;font-size:9.5px;color:#2d6fd4;font-weight:700;">'+_bdEsc(r?(r.reqid||''):'-')+'</span> <span style="font-size:11.5px;color:var(--text2);">'+_bdEsc(r?(r.title||''):'')+'</span></td>'+
      '<td style="'+td+'cursor:pointer;white-space:nowrap;"><span onclick="event.stopPropagation();cbOpenTcPopup(\''+_bdEsc(it.tcid||'')+'\');" title="클릭: TC 편집" style="font-family:monospace;font-size:9px;color:#2d6fd4;font-weight:700;cursor:pointer;text-decoration:underline;text-underline-offset:2px;">'+_bdEsc(it.tcid||'')+'</span> <span onclick="cbSelectItem(\''+f.key+'\')" style="font-size:11.5px;color:var(--text);font-weight:'+(selRow?'700':'500')+';cursor:pointer;">'+_bdEsc(it.name||'')+'</span></td>'+
      cells+'</tr>';
  }).join('');
  return summary+'<table style="width:100%;border-collapse:collapse;"><thead style="position:sticky;top:36px;z-index:1;">'+head+'</thead><tbody>'+rows+'</tbody></table>';
}
async function cbSetItemStatus(key, statusKey){
  const o=cbResolve(key); if(!o.it) return;
  const val={'예정':'','PASS':'Pass','FAIL':'Fail','미구현':'미구현','미지원':'미지원','제외':'제외'}[statusKey];
  const today=new Date().toISOString().slice(0,10);
  o.it.steps=Array.isArray(o.it.steps)?o.it.steps:[];
  if(o.it.steps.length) o.it.steps.forEach(s=>{ s.result=val; s.date=val?today:''; });
  else o.it.steps=[{cli:'',criteria:'',type:'contains',model:'공통',result:val,output:'',date:val?today:''}];
  // 수동 판정 → 실행자=현재 계정, 자동실행 아님
  try{ var _mu=(typeof currentUser!=='undefined'&&currentUser&&(currentUser.name||currentUser.username))||''; if(val){ if(_mu)o.it.executed_by=_mu; o.it.executed_at=(typeof _nowStr==='function'?_nowStr():new Date().toISOString().slice(0,16).replace('T',' ')); o.it.executed_auto=false; } }catch(_e){}
  await saveCycle(o.cy); cbRefreshItems(); cbLogStep((o.it.name||o.it.tcid||''), '수동 판정', val||statusKey, 'manual', {tcid:o.it.tcid, model:o.cy&&o.cy.model, version:o.cy&&o.cy.version}); _cbCheckComplete(o.cy);
}
function cbToggleItemSel(key,checked){ if(checked)cbItemSel.add(key); else cbItemSel.delete(key); cbRefreshItems(); }
function cbToggleAllItems(checked){ cbItemSel.clear(); if(checked){ cbFlatItems().forEach(f=>cbItemSel.add(f.key)); } cbRefreshItems(); }
async function cbBulkStatus(statusKey){
  if(!cbItemSel.size) return;
  const val={'예정':'','PASS':'Pass','FAIL':'Fail','미구현':'미구현','미지원':'미지원','제외':'제외'}[statusKey];
  const today=new Date().toISOString().slice(0,10); const touched=new Set();
  cbItemSel.forEach(function(key){ const o=cbResolve(key); if(!o.it) return; o.it.steps=Array.isArray(o.it.steps)?o.it.steps:[]; if(o.it.steps.length) o.it.steps.forEach(s=>{s.result=val;s.date=val?today:'';}); else o.it.steps=[{cli:'',criteria:'',type:'contains',model:'공통',result:val,output:'',date:val?today:''}]; touched.add(o.cy); });
  for(const cy of touched){ await saveCycle(cy); }
  cbItemSel.forEach(function(key){ const o=cbResolve(key); if(o.it) cbLogStep((o.it.name||o.it.tcid||''),'수동 판정(일괄)',val||statusKey,'manual',{tcid:o.it.tcid, model:o.cy&&o.cy.model, version:o.cy&&o.cy.version}); });
  touched.forEach(function(cy){ _cbCheckComplete(cy); });
  cbRefreshItems(); showToast(cbItemSel.size+'개 TC '+statusKey+' 처리');
}
function cbDelTC(){
  let keys=Array.from(cbItemSel); if(!keys.length&&cbSelItem) keys=[cbSelItem];
  if(!keys.length){showToast('삭제할 TC를 체크하세요');return;}
  uiConfirm({title:'TC 삭제', icon:'ti-trash', danger:true, confirmText:'삭제', msg:keys.length+'개 TC를 삭제할까요?', onConfirm:async function(){
    const byCy={}; keys.forEach(k=>{ const p=String(k).split('@@'); (byCy[p[0]]=byCy[p[0]]||[]).push(parseInt(p[1])); });
    const touched=[];
    Object.keys(byCy).forEach(cid=>{ const cy=cycleList.find(c=>c.id===cid); if(!cy) return; const del=new Set(byCy[cid]); cy.items=(cy.items||[]).filter((it,i)=>!del.has(i)); touched.push(cy); });
    for(const cy of touched){ await saveCycle(cy); }
    cbItemSel.clear(); cbSelItem=null; cbRefreshItems(); showToast('삭제됨 ('+keys.length+'개)');
  }});
}function atReqList(){
  const wrap=document.getElementById('at-req-list'); if(!wrap)return; const e=_bdEsc;
  const f=(document.getElementById('at-req-filter')&&document.getElementById('at-req-filter').value||'').toLowerCase();
  let reqs=(reqList||[]).slice();
  if(f) reqs=reqs.filter(r=>(r.reqid||'').toLowerCase().includes(f)||(r.title||'').toLowerCase().includes(f));
  wrap.innerHTML=reqs.map(function(r){
    const tcs=tcList.filter(t=>t.req_id===r.id); const addable=tcs.filter(t=>!window._atHave.has(t.tcid||t.id));
    const allSel=addable.length>0&&addable.every(t=>window._atSel.has(t.tcid||t.id)); const someSel=addable.some(t=>window._atSel.has(t.tcid||t.id));
    const view=window._atView===r.id;
    return '<div onclick="atReqView(\''+r.id+'\')" style="display:flex;align-items:center;gap:7px;padding:7px 11px;border-bottom:1px solid #eef0f3;cursor:pointer;background:'+(view?'rgba(45,111,212,0.08)':'')+';border-left:3px solid '+(view?'#2d6fd4':'transparent')+';"><input type="checkbox" '+(allSel?'checked':'')+' '+(addable.length?'':'disabled')+' onclick="event.stopPropagation();atReqCheck(\''+r.id+'\',this.checked)"><div style="flex:1;min-width:0;"><div style="font-size:10px;color:#2d6fd4;font-weight:700;">'+e(r.reqid||'')+'</div><div style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+e(r.title||'')+'</div></div><span style="font-size:9px;font-weight:700;color:'+(someSel?'#00875a':'var(--text3)')+';background:'+(someSel?'rgba(0,168,114,0.1)':'#eef0f3')+';border-radius:8px;padding:1px 6px;flex-shrink:0;">추가 '+(addable.length?('+'+addable.length):'0')+'</span></div>';
  }).join('')||'<div style="padding:24px;text-align:center;color:var(--text3);font-size:12px;">요구사항 없음</div>';
}
function atReqView(id){ window._atView=id; atReqList(); atTcList(); }
function atReqCheck(id,checked){ tcList.filter(t=>t.req_id===id&&!window._atHave.has(t.tcid||t.id)).forEach(function(t){ const k=t.tcid||t.id; if(checked)window._atSel.add(k); else window._atSel.delete(k); }); atReqList(); atTcList(); atSum(); }
function atTcList(){
  const wrap=document.getElementById('at-tc-list'); if(!wrap)return; const e=_bdEsc;
  const f=(document.getElementById('at-tc-filter')&&document.getElementById('at-tc-filter').value||'').toLowerCase();
  let tcs, hdr;
  if(f){ tcs=tcList.filter(t=>(t.tcid||'').toLowerCase().includes(f)||(t.name||'').toLowerCase().includes(f)); hdr='<i class="ti ti-search"></i> "'+e(f)+'" — '+tcs.length+'건 (전체 REQ)'; }
  else if(window._atView){ const r=reqList.find(x=>x.id===window._atView); tcs=tcList.filter(t=>t.req_id===window._atView); hdr=e(r?((r.reqid||'')+' · '+(r.title||'')):''); }
  else { wrap.innerHTML='<div style="padding:30px 16px;text-align:center;color:var(--text3);font-size:12px;"><i class="ti ti-arrow-left" style="font-size:24px;opacity:0.3;display:block;margin-bottom:8px;"></i>왼쪽 REQ를 클릭하거나<br>위 <b>TC 검색</b>으로 찾으세요</div>'; return; }
  wrap.innerHTML='<div style="padding:5px 11px;font-size:11px;color:#2d6fd4;font-weight:700;background:#f6f9ff;border-bottom:1px solid #e3ecfb;">'+hdr+'</div>'+
    (tcs.length?tcs.map(function(t){ const k=t.tcid||t.id; const have=window._atHave.has(k); const on=window._atSel.has(k); const ids=(k||'').replace(/^U-REQ-SYS-/i,'');
      if(have) return '<label style="display:flex;align-items:center;gap:8px;padding:7px 11px;border-bottom:1px solid #eef0f3;background:#eef9f2;cursor:default;"><input type="checkbox" checked disabled><i class="ti ti-circle-check-filled" style="color:#00a872;font-size:14px;flex-shrink:0;"></i><span style="font-size:10.5px;color:#00875a;font-weight:700;flex-shrink:0;">'+e(ids)+'</span><span style="flex:1;min-width:0;font-size:12px;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+e(t.name||'')+'</span><span style="font-size:9px;color:#fff;background:#00a872;border-radius:8px;padding:1px 8px;font-weight:700;flex-shrink:0;">포함됨</span></label>';
      return '<label style="display:flex;align-items:center;gap:8px;padding:7px 11px;border-bottom:1px solid #eef0f3;cursor:pointer;background:'+(on?'#f0f6ff':'')+';"><input type="checkbox" '+(on?'checked':'')+' onchange="atTcCheck(\''+e(k)+'\',this.checked)"><span style="font-size:10.5px;color:#2d6fd4;font-weight:700;flex-shrink:0;">'+e(ids)+'</span><span style="flex:1;min-width:0;font-size:12px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+e(t.name||'')+'</span></label>';
    }).join(''):'<div style="padding:24px;text-align:center;color:var(--text3);font-size:12px;">이 요구사항의 TC 없음</div>');
}
function atTcCheck(k,checked){ if(checked)window._atSel.add(k); else window._atSel.delete(k); atReqList(); atTcList(); atSum(); }
function atSum(){ const el=document.getElementById('at-sum'); if(!el)return; el.innerHTML='추가 선택: <span style="color:#00875a;font-weight:800;">TC '+window._atSel.size+'</span>'; }
async function atSubmit(){
  const cy=cycleList.find(c=>c.id===window._atCycle); if(!cy){showToast('사이클을 찾을 수 없습니다');return;}
  const ids=[...window._atSel]; if(!ids.length){showToast('추가할 TC를 선택하세요');return;}
  cy.items=cy.items||[];
  ids.forEach(function(k){ const t=tcList.find(x=>(x.tcid||x.id)===k); if(!t)return; if((cy.items||[]).some(it=>it.tcid===(t.tcid||t.id)))return; cy.items.push({tcid:t.tcid||t.id,name:t.name||'',req_id:t.req_id||'',severity:t.severity||'',priority:t.priority||'',steps:_checksToSteps(t, cy.model)}); });
  await saveCycle(cy); const md=document.getElementById('modal-cb-addtc'); if(md)md.remove(); cbRefreshItems(); showToast('TC '+ids.length+'개 추가');
}
function openEditCycle(){
  const cy=cbCurrentCycle(); if(!cy){showToast('버전을 선택하세요');return;}
  const e=_bdEsc; const old=document.getElementById('modal-edit-cycle'); if(old)old.remove();
  const m=document.createElement('div'); m.id='modal-edit-cycle'; m.className='modal-overlay'; m.style.display='flex';
  const folderOpts=cycleFolderList.map(f=>'<option value="'+f.id+'" '+(f.id===cy.folder_id?'selected':'')+'>'+e(f.name)+'</option>').join('');
  const modelOpts=[...new Set([...(deviceList||[]).map(d=>d.name),...(cycleList||[]).map(c=>c.model)].filter(Boolean))].map(x=>'<option>'+e(x)+'</option>').join('');
  const groupOpts=[...new Set((cycleList||[]).map(c=>c.version_group).filter(Boolean))].map(g=>'<option>'+e(g)+'</option>').join('');
  const fld='width:100%;font-size:13px;padding:8px 10px;border:1.5px solid var(--border);border-radius:7px;background:#fff;outline:none;box-sizing:border-box;';
  m.innerHTML='<div class="modal" style="width:470px;max-width:94vw;border-radius:12px;padding:0;display:flex;flex-direction:column;">'+
    '<div style="padding:14px 22px;border-bottom:1px solid var(--border);background:#f4f5f7;display:flex;align-items:center;gap:10px;"><i class="ti ti-edit" style="color:var(--blue);font-size:17px;"></i><b style="font-size:15px;">사이클 수정</b><span style="font-size:11px;color:var(--text3);">TC '+((cy.items||[]).length)+'개 유지</span><span style="flex:1;"></span><button onclick="document.getElementById(\'modal-edit-cycle\').remove()" style="width:28px;height:28px;border-radius:6px;border:1px solid var(--border);background:#fff;cursor:pointer;"><i class="ti ti-x"></i></button></div>'+
    '<div style="padding:18px 22px;display:flex;flex-direction:column;gap:13px;">'+
      '<div><label style="font-size:11px;color:var(--text3);font-weight:700;display:block;margin-bottom:5px;">프로젝트</label><select id="ec-folder" style="'+fld+'">'+folderOpts+'</select></div>'+
      '<div><label style="font-size:11px;color:var(--text3);font-weight:700;display:block;margin-bottom:5px;">모델명</label><input id="ec-model" list="ec-model-dl" value="'+e(cy.model||'')+'" style="'+fld+'"><datalist id="ec-model-dl">'+modelOpts+'</datalist></div>'+
      '<div><label style="font-size:11px;color:var(--text3);font-weight:700;display:block;margin-bottom:5px;">버전 그룹</label><input id="ec-group" list="ec-group-dl" value="'+e(cy.version_group||'')+'" style="'+fld+'"><datalist id="ec-group-dl">'+groupOpts+'</datalist></div>'+
      '<div><label style="font-size:11px;color:var(--text3);font-weight:700;display:block;margin-bottom:5px;">버전명</label><input id="ec-version" value="'+e(cy.version||'')+'" style="'+fld+'"></div>'+
    '</div>'+
    '<div style="padding:12px 22px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;"><button onclick="document.getElementById(\'modal-edit-cycle\').remove()" style="font-size:13px;padding:8px 18px;border:1.5px solid var(--border);border-radius:7px;background:#fff;cursor:pointer;">취소</button><button onclick="ecSubmit(\''+cy.id+'\')" style="font-size:13px;padding:8px 22px;border:none;border-radius:7px;background:var(--blue);color:#fff;font-weight:700;cursor:pointer;"><i class="ti ti-check"></i> 저장</button></div>'+
  '</div>';
  document.body.appendChild(m);
}
async function ecSubmit(id){
  const cy=cycleList.find(c=>c.id===id); if(!cy)return;
  const folderId=document.getElementById('ec-folder').value;
  const model=(document.getElementById('ec-model').value||'').trim();
  const group=(document.getElementById('ec-group').value||'').trim();
  const version=(document.getElementById('ec-version').value||'').trim();
  if(!folderId){showToast('프로젝트를 선택하세요');return;}
  if(!model||!group||!version){showToast('모델·버전그룹·버전명을 입력하세요');return;}
  cy.folder_id=folderId; cy.model=model; cy.version_group=group; cy.version=version;
  await saveCycle(cy);
  cbSel.project=folderId; cbSel.model=model; cbSel.vgroup=group; cbSel.version=version; cbSaveSel();
  cbTreeOpen.add('p@@'+folderId); cbTreeOpen.add('m@@'+folderId+'@@'+model); cbTreeOpen.add('g@@'+folderId+'@@'+model+'@@'+group);
  const md=document.getElementById('modal-edit-cycle'); if(md)md.remove();
  renderCycleBoard(); showToast('사이클 수정 완료');
}
function cbCycleDetail(){
  const cy=cbCurrentCycle(); if(!cy){showToast('버전을 선택하세요');return;}
  const e=_bdEsc; const old=document.getElementById('modal-cycle-detail'); if(old)old.remove();
  const m=document.createElement('div'); m.id='modal-cycle-detail'; m.className='modal-overlay'; m.style.display='flex';
  m.addEventListener('click',function(ev){ if(ev.target===m)m.remove(); });
  const fld='width:100%;font-size:13px;padding:8px 10px;border:1.5px solid var(--border);border-radius:7px;background:#fff;outline:none;box-sizing:border-box;';
  const lab='font-size:11px;color:var(--text3);font-weight:700;display:block;margin-bottom:4px;';
  const statusOpts=['계획','진행중','완료','보류','중단'].map(s=>'<option'+((cy.status===s)?' selected':'')+'>'+s+'</option>').join('');
  m.innerHTML='<div onclick="event.stopPropagation()" style="width:560px;max-width:94vw;max-height:90vh;background:#fff;border-radius:14px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.4);">'
    +'<div style="padding:14px 20px;border-bottom:1px solid var(--border);background:#f4f6fa;display:flex;align-items:center;gap:9px;"><i class="ti ti-clipboard-text" style="font-size:19px;color:var(--blue);"></i><div><div style="font-size:15px;font-weight:800;">사이클 세부 내역</div><div style="font-size:11px;color:var(--text3);">'+e((cy.model||'')+' · '+(cy.version||''))+'</div></div><span style="flex:1;"></span><i class="ti ti-x" onclick="document.getElementById(\'modal-cycle-detail\').remove()" style="cursor:pointer;font-size:18px;color:var(--text3);"></i></div>'
    +'<div style="flex:1;overflow:auto;padding:18px 20px;display:flex;flex-direction:column;gap:13px;">'
      +'<div><label style="'+lab+'">설명 (Description)</label><textarea id="cd-desc" rows="3" style="'+fld+'resize:vertical;" placeholder="이 사이클(버전)의 시험 목적·범위">'+e(cy.description||'')+'</textarea></div>'
      +'<div style="display:flex;gap:12px;"><div style="flex:1;"><label style="'+lab+'">담당자 (Owner)</label><input id="cd-owner" value="'+e(cy.owner||'')+'" style="'+fld+'"></div><div style="flex:1;"><label style="'+lab+'">상태 (Status)</label><select id="cd-status" style="'+fld+'">'+statusOpts+'</select></div></div>'
      +'<div style="display:flex;gap:12px;"><div style="flex:1;"><label style="'+lab+'">계획 시작일</label><input type="date" id="cd-start" value="'+e(cy.planned_start||'')+'" style="'+fld+'"></div><div style="flex:1;"><label style="'+lab+'">계획 종료일</label><input type="date" id="cd-end" value="'+e(cy.planned_end||'')+'" style="'+fld+'"></div></div>'
      +'<div><label style="'+lab+'">시험 환경 (Environment)</label><input id="cd-env" value="'+e(cy.env||'')+'" placeholder="예: Lab #2 · 실장비 E5010-24C" style="'+fld+'"></div>'
      +'<div><label style="'+lab+'">비고 (Note)</label><textarea id="cd-note" rows="2" style="'+fld+'resize:vertical;">'+e(cy.note||'')+'</textarea></div>'
    +'</div>'
    +'<div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;background:#fafbfc;"><button onclick="document.getElementById(\'modal-cycle-detail\').remove()" style="font-size:13px;padding:8px 18px;border-radius:8px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;">취소</button><button onclick="cbSaveCycleDetail()" style="font-size:13px;padding:8px 22px;border-radius:8px;border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:700;"><i class="ti ti-check"></i> 저장</button></div>'
  +'</div>';
  document.body.appendChild(m);
}
async function cbSaveCycleDetail(){
  const cy=cbCurrentCycle(); if(!cy)return;
  const g=function(id){const el=document.getElementById(id);return el?el.value:'';};
  cy.description=g('cd-desc'); cy.owner=g('cd-owner'); cy.status=g('cd-status'); cy.planned_start=g('cd-start'); cy.planned_end=g('cd-end'); cy.env=g('cd-env'); cy.note=g('cd-note');
  await saveCycle(cy); const m=document.getElementById('modal-cycle-detail'); if(m)m.remove(); renderCycleBoard(); showToast('세부 내역 저장됨');
}
async function _cbLLMSummary(promptText){
  const llm=(typeof llmList!=='undefined'?llmList:[]).find(x=>x.id===(typeof selLlmId!=='undefined'?selLlmId:''))||(typeof llmList!=='undefined'?llmList:[])[0];
  if(!llm) return '';
  try{
    const r=await fetch('/api/llm/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({llm_id:llm.id,message:promptText,stream:true})});
    if(!r.ok) return ''; const reader=r.body.getReader(); const dec=new TextDecoder(); let out='';
    while(true){ const x=await reader.read(); if(x.done)break; out+=dec.decode(x.value); }
    return out.trim();
  }catch(e){ return ''; }
}
async function cbCycleReport(){
  const cy=cbCurrentCycle(); if(!cy){showToast('버전을 선택하세요');return;}
  const items=cy.items||[]; const stats=cycleCalcStats(items);
  const fails=items.filter(function(it){ return resultVerdict(cycleItemStatus(it.steps))==='fail'; }).map(function(it){return it.name||it.tcid;});
  const msg='다음 네트워크 장비 시험 사이클 결과를 한국어로 5~7줄로 요약해줘. 합격률, 약점(주요 불합격 항목), 권고사항 위주로 간결하게.\n\n사이클: '+(cy.model||'')+' '+(cy.version||'')+'\n전체 '+stats.total+'건, 합격 '+stats.pass+', 불합격 '+stats.fail+', 제외 '+stats.exclude+', 진행률 '+stats.progress+'%\n불합격 항목: '+(fails.slice(0,30).join(', ')||'없음');
  showToast('🤖 AI 요약 생성 중…');
  const summary=await _cbLLMSummary(msg);
  _cbOpenCycleReportPDF(cy, stats, items, summary);
}
function _cbOpenCycleReportPDF(cy, stats, items, summary){
  const e=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');};
  const tdS='border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top;';
  const thS=tdS+'background:#f4f5f7;font-weight:700;';
  const h2S='font-size:15px;border-bottom:2px solid #2d6fd4;padding-bottom:5px;margin-top:22px;';
  const kcS='border:1px solid #ddd;border-radius:8px;padding:9px 16px;font-size:12px;color:#666;';
  const bS='font-size:21px;display:block;color:#222;';
  const rows=items.map(function(it){ const st=_cbItemStatusKey(it); const c={'PASS':'#00a872','FAIL':'#e53e5a','미구현':'#e8820c','미지원':'#7c3aed','제외':'#888','예정':'#9aa0b8'}[st]||'#888'; const r=reqList.find(x=>x.id===it.req_id); return '<tr><td style="'+tdS+'">'+e(it.tcid||'')+'</td><td style="'+tdS+'">'+e(it.name||'')+'</td><td style="'+tdS+'">'+e(r?(r.title||r.name||''):'')+'</td><td style="'+tdS+'color:'+c+';font-weight:700;">'+st+'</td></tr>'; }).join('');
  const sumHtml=summary?('<h2 style="'+h2S+'">🤖 AI 종합 요약</h2><div style="background:#f6f9ff;border:1px solid #d6e4fb;border-radius:8px;padding:13px 15px;font-size:13px;line-height:1.75;color:#1c2b45;">'+e(summary).replace(/\n/g,'<br>')+'</div>'):'<div style="font-size:11px;color:#999;margin-top:8px;">(LLM 미설정 또는 요약 생성 실패 — 시스템 → LLM 설정 확인)</div>';
  const html=''
    +'<h1 style="font-size:22px;margin:0;">📋 시험 결과 보고서</h1><div style="font-size:12px;color:#555;margin-top:6px;line-height:1.8;"><b style="font-size:14px;color:#1a2030;">'+e((cy.model||'')+' · '+(cy.version||''))+'</b>'+(cy.owner?(' &nbsp;|&nbsp; 담당 '+e(cy.owner)):'')+(cy.status?(' &nbsp;|&nbsp; 상태 '+e(cy.status)):'')+(cy.planned_start?('<br>계획 기간: '+e(cy.planned_start)+' ~ '+e(cy.planned_end||'')):'')+(cy.env?('<br>환경: '+e(cy.env)):'')+(cy.description?('<br>설명: '+e(cy.description)):'')+'<br>생성: '+_nowStr()+'</div>'
    +'<h2 style="'+h2S+'">결과 요약</h2><div style="display:flex;gap:10px;margin:12px 0;flex-wrap:wrap;"><div style="'+kcS+'">전체<b style="'+bS+'">'+stats.total+'</b></div><div style="'+kcS+'color:#00a872;">합격<b style="'+bS+'">'+stats.pass+'</b></div><div style="'+kcS+'color:#e53e5a;">불합격<b style="'+bS+'">'+stats.fail+'</b></div><div style="'+kcS+'">제외<b style="'+bS+'">'+stats.exclude+'</b></div><div style="'+kcS+'color:#2d6fd4;">진행률<b style="'+bS+'">'+stats.progress+'%</b></div></div>'
    +sumHtml
    +'<h2 style="'+h2S+'">시험 항목 ('+items.length+'건)</h2><table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px;"><thead><tr><th style="'+thS+'">TC ID</th><th style="'+thS+'">시험명</th><th style="'+thS+'">요구사항</th><th style="'+thS+'">결과</th></tr></thead><tbody>'+rows+'</tbody></table>';
  if(typeof pdfPreview==='function'){ pdfPreview(html, (cy.model||'')+' '+(cy.version||'')+' 시험 결과 보고서'); }
  else { const w=window.open('','_blank'); if(w){ w.document.write('<html><head><meta charset="utf-8"></head><body style="font-family:Malgun Gothic,sans-serif;padding:30px;">'+html+'</body></html>'); w.document.close(); } }
}
function _loadPptxLib(){
  return new Promise(function(res,rej){
    if(window.PptxGenJS){ res(window.PptxGenJS); return; }
    const s=document.createElement('script'); s.src='https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js';
    s.onload=function(){ res(window.PptxGenJS); }; s.onerror=function(){ rej(new Error('PPTX 라이브러리 로드 실패 (인터넷 연결 필요)')); };
    document.head.appendChild(s);
  });
}
async function cbCycleReportPPTX(){
  const cy=cbCurrentCycle(); if(!cy){showToast('버전을 선택하세요');return;}
  const items=cy.items||[]; const stats=cycleCalcStats(items);
  const fails=items.filter(function(it){ return resultVerdict(cycleItemStatus(it.steps))==='fail'; }).map(function(it){return it.name||it.tcid;});
  showToast('🤖 AI 요약 생성 중… (미리보기 준비)');
  let summary=''; try{ summary=await _cbLLMSummary('다음 네트워크 장비 시험 사이클 결과를 한국어 5~7줄로 요약(합격률·약점·권고).\n사이클: '+(cy.model||'')+' '+(cy.version||'')+'\n전체 '+stats.total+', 합격 '+stats.pass+', 불합격 '+stats.fail+', 제외 '+stats.exclude+', 진행률 '+stats.progress+'%\n불합격: '+(fails.slice(0,30).join(', ')||'없음')); }catch(e){}
  window._cyPptData={cy:cy,items:items,stats:stats,summary:summary};
  _cyPptPreview(); return;
}
function _lguTcData(tc){
  var steps=[];
  if(Array.isArray(tc.checks)&&tc.checks.length){ steps=tc.checks.filter(function(c){var k=c.kind||'cli';return k==='cli'||k==='wait';}).map(function(c){var _w=(c.kind==='wait');return {desc:_w?('대기 '+(parseInt(c.waitSec)||5)+'초'):(c.desc||''),cli:_w?'':(c.cli||''),result:c.repeatResult||c.result||'',output:c.output||''};}); }
  else if(Array.isArray(tc.steps)) steps=tc.steps.map(function(s){return {desc:s.desc||'',cli:s.cli||s.input||'',result:s.result||'',output:s.output||''};});
  var req=(typeof reqList!=='undefined'?reqList:[]).find(function(x){return x.id===tc.req_id||x.reqid===tc.req_id;});
  var cf=function(l){ return (typeof cfV==='function')?cfV('tc',tc,l):''; };
  var methodBlocks=steps.length?steps.map(function(s,i){ var t=(i+1)+'. '+(s.desc||s.cli||'-'); return { text:t, estLines:Math.max(1,Math.ceil((t.length||1)/70)) }; }):[{text:'(시험 절차 없음)',estLines:1}];
  var method=methodBlocks.map(function(b){return b.text;}).join('\n');
  // 결과: 스텝별 블록(텍스트 + 예상 줄수) — 긴 TC를 슬라이드로 나누기 위해 블록 단위로 보관
  var CPL=118;   // 결과 셀 폭(약 7in, 9pt)에서 한 줄에 들어가는 대략 글자수
  var resultBlocks=steps.length?steps.map(function(s,i){
    var r='Step '+(i+1)+'. '+(s.desc||s.cli||''); if(s.result)r+='  ['+s.result+']'; if(s.cli)r+='\n$ '+s.cli; var o=(s.output||'').trim(); if(o)r+='\n'+o;
    // 예상 줄수: 각 물리적 줄을 CPL로 나눠 wrap 반영 + 블록 간 여백 1줄
    var lines=r.split('\n').reduce(function(acc,ln){ return acc+Math.max(1,Math.ceil((ln.length||1)/CPL)); },0);
    return { text:r, estLines:lines+1 };
  }):[{ text:'시험 결과 데이터 없음 — 시험 실행 후 출력됩니다.', estLines:1 }];
  var result=resultBlocks.map(function(b){return b.text;}).join('\n\n');
  var meter=(typeof _lguMeterText==='function')?_lguMeterText(tc):'';
  var n2xSnaps=[]; (Array.isArray(tc.checks)?tc.checks:[]).forEach(function(c){ if(Array.isArray(c.n2xStats)&&c.n2xStats.length){ n2xSnaps.push({stats:c.n2xStats,names:c.n2xNames||[],elapsed:c.n2xElapsed||0,label:c.desc||c.action||'측정 결과'}); } });
  return { tcid: cf('TC_ID')||tc.tcid||'', reqid: cf('REQ ID')||cf('REQID')||(req?(req.reqid||req.id||''):''), item: cf('시험항목')||tc.name||'', spec: tc.object||tc.precondition||(req?(req.overview||req.title||''):'')||'', method:method, methodBlocks:methodBlocks, result:result, resultBlocks:resultBlocks, steps:steps, remark: cf('비고')||cf('특이사항')||'', meter:meter, n2xSnaps:n2xSnaps };
}
// 결과 블록을 슬라이드당 최대 줄수(maxLines)에 맞춰 여러 슬라이스로 분할 (긴 TC → 여러 page2 슬라이드)
// 반환: [[block,block,...], [block,...], ...] — 각 배열이 한 슬라이드 분량
function _lguPaginateResult(blocks, maxLines){
  var slices=[], cur=[], curLines=0;
  (blocks||[]).forEach(function(b){
    var bl=b.estLines||1;
    // 한 블록이 통째로 한 슬라이드보다 크면 단독 슬라이드로(그 안에선 잘릴 수 있음 — 최선)
    if(bl>maxLines){ if(cur.length){ slices.push(cur); cur=[]; curLines=0; } slices.push([b]); return; }
    if(curLines+bl>maxLines && cur.length){ slices.push(cur); cur=[]; curLines=0; }
    cur.push(b); curLines+=bl;
  });
  if(cur.length) slices.push(cur);
  if(!slices.length) slices.push([{text:'',estLines:1}]);
  return slices;
}
var _LGU_RESULT_MAXLINES=24;   // page2 결과 셀에 들어가는 대략 줄수(비고행까지 슬라이드 안에 들어오도록 여유)
var _LGU_METHOD_MAXLINES=11;   // page1 시험방법 셀(약 1.85in, 9.5pt)에 들어가는 대략 줄수
function _cyPptPreview(){
  var d=window._cyPptData; if(!d)return; var cy=d.cy, items=d.items, e=_bdEsc;
  var old=document.getElementById('cyppt-preview'); if(old)old.remove();
  // 16:9 슬라이드 박스: 실제 PPTX 13.333×7.5in을 96px/in로 → 1280×720px, 미리보기 폭(약 936px)에 맞춰 scale
  var SLW=1280, SLH=720, WRAPW=1400, SC=WRAPW/SLW;   // 미리보기 슬라이드 폭 확대(1240→1400, SC≈1.09 실물보다 크게)
  // 슬라이드 HTML을 먼저 배열로 수집 → 정확한 총 개수 계산 후 페이지 번호 배지 부착
  var _slides=[];
  if(items.length){ items.forEach(function(it){ var tc=(tcList||[]).find(function(x){return (x.tcid||x.id)===(it.tcid||it.id);})||it;
    if(typeof buildTCLGUPdfHtml!=='function'){ _slides.push('<div style="color:#c0392b;padding:14px;">LG U+ 양식 함수 미로드 — Ctrl+Shift+R</div>'); return; }
    var dd=(typeof _lguTcData==='function')?_lguTcData(tc):null;
    var mSlices=(dd&&dd.methodBlocks)?_lguPaginateResult(dd.methodBlocks,_LGU_METHOD_MAXLINES):[[0]];
    var _mf=0; mSlices.forEach(function(sl){ var _c=sl.length; _slides.push(buildTCLGUPdfHtml(tc,{only:'page1',methodRange:[_mf,_mf+_c]})); _mf+=_c; });
    var slices=(dd&&dd.resultBlocks)?_lguPaginateResult(dd.resultBlocks,_LGU_RESULT_MAXLINES):[[0]];
    var _from=0;
    slices.forEach(function(sl){ var _cnt=sl.length; _slides.push(buildTCLGUPdfHtml(tc,{only:'page2',resultRange:[_from,_from+_cnt]})); _from+=_cnt; });
  }); }
  var _total=_slides.length;
  var _slideBox=function(inner,pageNo){
    var badge='<div class="cyppt-pageno" data-pg="'+pageNo+'" style="position:absolute;top:8px;right:10px;z-index:5;font-size:12px;font-weight:800;color:#fff;background:rgba(28,34,52,0.72);border-radius:20px;padding:3px 11px;font-family:ui-monospace,monospace;">'+pageNo+' / '+_total+'</div>';
    return '<div class="cyppt-slide" data-pg="'+pageNo+'" style="width:'+Math.round(SLW*SC)+'px;height:'+Math.round(SLH*SC)+'px;margin:0 auto 16px;background:#fff;border:1px solid #b9c2d0;box-shadow:0 2px 10px rgba(0,0,0,0.12);overflow:hidden;position:relative;">'+badge+'<div style="width:'+SLW+'px;height:'+SLH+'px;transform:scale('+SC+');transform-origin:top left;overflow:hidden;padding:24px 30px;box-sizing:border-box;">'+inner+'</div></div>';
  };
  var body='';
  if(_total){ _slides.forEach(function(html,i){ body+=_slideBox(html,i+1); }); }
  else body='<div style="padding:40px;text-align:center;color:#9aa0b8;">사이클에 시험 항목이 없습니다.</div>';
  var m=document.createElement('div'); m.id='cyppt-preview'; m.style.cssText='position:fixed;inset:0;z-index:100070;background:rgba(15,22,38,0.55);display:flex;align-items:center;justify-content:center;';
  m.innerHTML='<div id="cyppt-box" style="width:1480px;max-width:98vw;height:95vh;background:#eef1f5;border-radius:12px;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,0.4);overflow:hidden;"><div onmousedown="_cbPopDrag(event,\'cyppt-box\')" title="드래그하여 이동" style="padding:12px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;background:#fff;flex-shrink:0;cursor:move;"><i class="ti ti-arrows-move" style="font-size:14px;color:#c0392b;opacity:0.5;"></i><i class="ti ti-file-type-ppt" style="color:#c0392b;font-size:18px;"></i><b style="font-size:14px;flex:1;">고객사 PPTX 결과서 미리보기 — '+e(cy.model||'')+' '+e(cy.version||'')+' · '+items.length+'건</b><span id="cyppt-pageind" style="font-size:12.5px;font-weight:800;color:#2d3a55;background:#eef1f5;border-radius:20px;padding:5px 14px;font-family:ui-monospace,monospace;white-space:nowrap;">1 / '+_total+' 슬라이드</span><button onclick="_cyPptSave()" style="font-size:12.5px;font-weight:700;padding:7px 16px;border-radius:7px;border:none;background:#c0392b;color:#fff;cursor:pointer;"><i class="ti ti-download"></i> PPTX 저장</button><button onclick="document.getElementById(\'cyppt-preview\').remove()" style="width:30px;height:30px;border:none;border-radius:7px;background:#eef1f5;cursor:pointer;margin-left:4px;"><i class="ti ti-x"></i></button></div><div style="flex:1;overflow:auto;padding:18px 22px;">'+body+'</div></div>';
  document.body.appendChild(m);
  m.addEventListener('click',function(ev){ if(ev.target===m) m.remove(); });
  // 스크롤 위치에 따라 헤더의 현재 페이지 실시간 갱신
  try{
    var _scroller=m.querySelector('#cyppt-box > div:last-child');
    var _ind=m.querySelector('#cyppt-pageind');
    if(_scroller && _ind && _total){
      var _upd=function(){ var sl=_scroller.querySelectorAll('.cyppt-slide'); var mid=_scroller.scrollTop+_scroller.clientHeight/2; var cur=1;
        for(var i=0;i<sl.length;i++){ if(sl[i].offsetTop<=mid) cur=i+1; else break; }
        _ind.textContent=cur+' / '+_total+' 슬라이드'; };
      _scroller.addEventListener('scroll',function(){ if(_scroller._raf)return; _scroller._raf=requestAnimationFrame(function(){ _scroller._raf=0; _upd(); }); });
      _upd();
    }
  }catch(e){}
}
// CLI 출력을 SecureCRT식 터미널 화면 캡처(검은 배경·고정폭)로 canvas 렌더 → PNG dataURL 반환
// 반환: {data, w, h}(인치) 또는 null
function _cliToTermPng(text){
  try{
    var t=String(text||'').replace(/\r/g,''); if(!t.trim()) return null;
    var lines=t.split('\n');
    var FS=13, LH=17, PAD=10;                 // 폰트/줄높이/여백(px) — 2배 스케일로 그림
    var SC=2;
    // 실제 렌더 폭을 측정해 캔버스 폭 결정(한글=2배폭 등 정확 반영, slice로 안 자름)
    var meas=document.createElement('canvas').getContext('2d');
    meas.font=FS+'px Consolas, "D2Coding", monospace';
    var maxw=0; lines.forEach(function(l){ var w=meas.measureText(l).width; if(w>maxw)maxw=w; });
    var MAXW=1180;                             // 가로 상한(px) — 슬라이드 본문 폭 근사
    if(maxw>MAXW)maxw=MAXW;
    var W=Math.max(320, Math.ceil(maxw)+PAD*2);
    var H=lines.length*LH+PAD*2;
    var c=document.createElement('canvas'); c.width=W*SC; c.height=H*SC;
    var ctx=c.getContext('2d'); ctx.scale(SC,SC);
    ctx.fillStyle='#f5f6f8'; ctx.fillRect(0,0,W,H);               // 연회색 배경(문서 톤)
    ctx.strokeStyle='#d8dce3'; ctx.lineWidth=1; ctx.strokeRect(0.5,0.5,W-1,H-1);   // 얇은 테두리
    ctx.font=FS+'px Consolas, "D2Coding", monospace'; ctx.textBaseline='top';
    lines.forEach(function(l,i){
      // 프롬프트/명령 줄(#,>,$ 로 시작하거나 포함)은 파랑 강조, 나머지는 검은 글자
      var cmd=/^[\w\-.]*[#>$]\s/.test(l)||/^\$ /.test(l);
      ctx.fillStyle=cmd?'#1a56b8':'#1c2030';
      ctx.fillText(l, PAD, PAD+i*LH);          // slice 제거 — 텍스트 안 잘림
    });
    return { data:c.toDataURL('image/png'), w:W/96, h:H/96 };    // px→인치(96dpi)
  }catch(e){ return null; }
}
// N2X 통계 표(_n2xStatsHtml)를 그대로 이미지(PNG)로 캡처 → PPTX에 삽입. 미리보기와 폼 일치.
// 반환: {data,w,h(인치)} 또는 null
async function _n2xStatsToPng(stats,names,elapsed){
  try{
    if(!(Array.isArray(stats)&&stats.length)||typeof _n2xStatsHtml!=='function'||typeof _svgToPng!=='function') return null;
    var html=_n2xStatsHtml(stats,names,elapsed,{pdf:true});
    // 실제 폭·높이 측정을 위해 화면 밖에 잠깐 렌더
    var holder=document.createElement('div');
    holder.style.cssText='position:fixed;left:-99999px;top:0;display:inline-block;background:#fff;padding:6px;font-family:\'Malgun Gothic\',AppleGothic,sans-serif;';
    holder.innerHTML=html;
    document.body.appendChild(holder);
    var W=Math.min(1180,Math.ceil(holder.scrollWidth)), H=Math.ceil(holder.scrollHeight);
    if(W<40||H<20){ document.body.removeChild(holder); return null; }
    // foreignObject 안에 그대로 넣어 SVG → PNG
    var xhtml='<div xmlns="http://www.w3.org/1999/xhtml" style="display:inline-block;background:#fff;font-family:\'Malgun Gothic\',AppleGothic,sans-serif;">'+html+'</div>';
    document.body.removeChild(holder);
    var svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+'"><foreignObject width="100%" height="100%">'+xhtml+'</foreignObject></svg>';
    var png=await _svgToPng(svg,W,H);
    if(!png) return null;
    return { data:png, w:W/96, h:H/96 };
  }catch(e){ return null; }
}
// 시험 결과 슬라이드(들) — 스텝별 제목/명령은 텍스트, CLI 출력은 터미널 캡처 이미지. 넘치면 새 슬라이드.
// steps: [{title, cli, term:{data,w,h}|null}]  · 반환 슬라이드 수는 내부에서 자동 분할
function _lguResultSlides(p, d, steps, startNo){
  var YEL='FCFCC6', BDc='111111', BD={type:'solid',color:BDc,pt:1}, LX=0.4167, no=startNo;
  var TOP=1.5, BOTTOM=6.85, W=12.5;           // 본문 영역(헤더 아래 ~ 푸터 위)
  function newSlide(tag){
    var s=p.addSlide();
    s.addText('시험 결과',{x:LX+0.05,y:0.16,w:4,h:0.55,fontSize:25,bold:true,color:BDc,charSpacing:2});
    s.addText([{text:'LG U',options:{color:'A50034',bold:true,fontSize:24}},{text:'+',options:{color:'E6007E',bold:true,fontSize:15}}],{x:5.0,y:0.2,w:3.3,h:0.5,align:'center'});
    s.addShape('line',{x:LX,y:0.83,w:W,h:0,line:{color:BDc,width:2.5}});
    s.addShape('line',{x:LX,y:0.89,w:W,h:0,line:{color:BDc,width:1}});
    var cell=function(t,o){ return {text:String(t==null?'':t),options:Object.assign({border:BD,valign:'middle',fontSize:10.5,color:BDc,margin:4,fontFace:'맑은 고딕'},o||{})}; };
    var hdr=[cell('TC_ID',{fill:YEL,bold:true,align:'center'}),cell(d.tcid,{bold:true,align:'center'}),cell('REQ ID',{fill:YEL,bold:true,align:'center',fontSize:9.5}),cell(d.reqid,{align:'center',bold:true}),cell('시험항목',{fill:YEL,bold:true,align:'center'}),cell(d.item,{bold:true})];
    s.addTable([hdr,[cell('시험 결과'+(tag||''),{fill:YEL,bold:true,align:'center',colspan:6})]],{x:LX,y:1.0,colW:[0.75,2.875,0.75,1.875,1.0,5.25],rowH:[0.45,0.34],border:BD,valign:'middle',autoPage:false});
    s.addShape('line',{x:LX,y:6.95,w:W,h:0,line:{color:BDc,width:2.5}});
    s.addShape('line',{x:LX,y:7.01,w:W,h:0,line:{color:BDc,width:1}});
    s.addText(String(no++),{x:LX+11.3,y:7.12,w:1.1,h:0.3,fontSize:11,align:'right',color:BDc});
    return s;
  }
  var pages=1; var s=null; var y=TOP; var idx=0, total=steps.length;
  // 슬라이드 수 사전 계산(태그용)은 생략하고 진행하며 붙임 — 여러 장이면 (i/n) 대신 (i)만
  function ensure(need){ if(!s || y+need>BOTTOM){ s=newSlide(pages>1||idx>0?(' (계속)'):''); if(idx>0)pages++; y=TOP; } }
  if(!total){ s=newSlide(''); s.addText('시험 결과 데이터 없음 — 시험 실행 후 출력됩니다.',{x:LX+0.1,y:TOP,w:W-0.2,h:0.4,fontSize:11,color:'888888'}); return no; }
  steps.forEach(function(st){ idx++;
    var titleH=0.28, cliH=st.cli?0.24:0, imgH=st.term?Math.min(st.term.h,4.2):0.22, gap=0.12;
    var blockH=titleH+cliH+imgH+gap;
    ensure(Math.min(blockH,BOTTOM-TOP));
    s.addText(st.title,{x:LX+0.1,y:y,w:W-0.2,h:titleH,fontSize:11,bold:true,color:BDc}); y+=titleH;
    if(st.cli){ s.addText('$ '+st.cli,{x:LX+0.15,y:y,w:W-0.3,h:cliH,fontSize:9.5,color:'00733A',fontFace:'Consolas'}); y+=cliH; }
    if(st.term){ var iw=Math.min(st.term.w,W-0.3); var ih=st.term.h*(iw/st.term.w); if(ih>4.2){ ih=4.2; iw=st.term.w*(ih/st.term.h); }
      // 남은 높이보다 크면 새 슬라이드
      if(y+ih>BOTTOM){ s=newSlide(' (계속)'); y=TOP; }
      s.addImage({data:st.term.data,x:LX+0.15,y:y,w:iw,h:ih}); y+=ih;
    } else { s.addText('(미실행)',{x:LX+0.15,y:y,w:2,h:0.22,fontSize:9,color:'C0C4CC'}); y+=0.22; }
    y+=gap;
  });
  return no;
}
async function _cyPptSave(){
  var d=window._cyPptData; if(!d){showToast('미리보기 데이터가 없습니다');return;} var cy=d.cy, stats=d.stats, items=d.items, summary=d.summary;
  showToast('PPTX 생성 중…');
  let Pptx; try{ Pptx=await _loadPptxLib(); }catch(e){ showToast(e.message); return; }
  var p=new Pptx(); p.layout='LAYOUT_WIDE';
  var no=1;
  if(items.length){ for(var _i=0;_i<items.length;_i++){ var it=items[_i]; var tc=(tcList||[]).find(function(x){return (x.tcid||x.id)===(it.tcid||it.id);})||it; var dd=_lguTcData(tc); var _img=null;
    try{ if(tc.topo_image)_img=tc.topo_image; else if(tc.topo2&&Array.isArray(tc.topo2.nodes)&&tc.topo2.nodes.length&&typeof _shTopoBuildSvg==='function'){ var _sv=_shTopoBuildSvg(tc.topo2); if(_sv&&typeof _svgToPng==='function')_img=await _svgToPng(_sv.svg,_sv.w,_sv.h); } else if(tc.topo2&&tc.topo2.bgImage)_img=tc.topo2.bgImage; }catch(e){}
    // page1: 시험 방법이 길면 여러 슬라이드로 분할 (구성도·이미지는 첫 장에만)
    var _mSlices=_lguPaginateResult(dd.methodBlocks,_LGU_METHOD_MAXLINES);
    for(var _mi=0;_mi<_mSlices.length;_mi++){
      var _ddm=Object.assign({},dd,{ method:_mSlices[_mi].map(function(b){return b.text;}).join('\n'),
        _pageTag:(_mSlices.length>1?(' ('+(_mi+1)+'/'+_mSlices.length+')'):'') });
      _lguPptSlide(p,_ddm,1,no++,(_mi===0?_img:null));
    }
    // page2: 시험 결과 — CLI 출력을 SecureCRT식 터미널 캡처 이미지로. 이미지 높이 기준 자동 슬라이드 분할.
    var _rsteps=[];
    for(var _si=0;_si<(dd.steps||[]).length;_si++){ var s=dd.steps[_si];
      var title='Step '+(_si+1)+'. '+(s.desc||s.cli||'')+(s.result?('  ['+s.result+']'):'');
      var _termImg=null;
      // 계측기 통계(n2xStats) → 미리보기와 동일한 N2X 통계 표를 이미지로 캡처
      if(Array.isArray(s.n2xStats)&&s.n2xStats.length&&typeof _n2xStatsToPng==='function'){
        try{ _termImg=await _n2xStatsToPng(s.n2xStats,s.n2xNames,s.n2xElapsed); }catch(e){}
      }
      if(!_termImg){ var _o=(s.output||'').trim(); _termImg=_o?_cliToTermPng(_o):null; }
      _rsteps.push({ title:title, cli:s.cli||'', term:_termImg });
    }
    no=_lguResultSlides(p, dd, _rsteps, no);
  } }
  else { _lguPptSlide(p,{tcid:'',reqid:'',item:'(시험 항목 없음)',spec:'',method:'',result:'',remark:''},1,1); }
  try{ await p.writeFile({fileName:((cy.model||'cycle')+'_'+(cy.version||'')+'_시험결과서.pptx')}); showToast('✅ PPTX 생성 완료 ('+(no-1)+'슬라이드)'); var pm=document.getElementById('cyppt-preview'); if(pm)pm.remove(); }catch(e){ showToast('PPTX 저장 오류: '+e.message); }
}
function _lguPptSlide(p, d, page, pageNo, topoImg){
  var YEL='FCFCC6', BDc='111111', BD={type:'solid',color:BDc,pt:1};
  var s=p.addSlide();
  var LX=0.4167;   // 표·선 좌측 x (슬라이드 폭 13.333 − 표폭 12.5 = 0.833, /2 → 좌우 여백 동일 = 슬라이드 가운데 정렬)
  s.addText('시험절차',{x:LX+0.05,y:0.16,w:4,h:0.55,fontSize:25,bold:true,color:'111111',charSpacing:2});
  s.addText([{text:'LG U',options:{color:'A50034',bold:true,fontSize:24}},{text:'+',options:{color:'E6007E',bold:true,fontSize:15}}],{x:5.0,y:0.2,w:3.3,h:0.5,align:'center'});
  s.addShape('line',{x:LX,y:0.83,w:12.5,h:0,line:{color:BDc,width:2.5}});
  s.addShape('line',{x:LX,y:0.89,w:12.5,h:0,line:{color:BDc,width:1}});
  var cell=function(t,o){ return {text:String(t==null?'':t), options:Object.assign({border:BD,valign:'middle',fontSize:10.5,color:'111111',margin:4,fontFace:'맑은 고딕'},o||{})}; };
  var hdr=[cell('TC_ID',{fill:YEL,bold:true,align:'center'}),cell(d.tcid,{bold:true,align:'center'}),cell('REQ ID',{fill:YEL,bold:true,align:'center',fontSize:9.5}),cell(d.reqid,{align:'center',bold:true}),cell('시험항목',{fill:YEL,bold:true,align:'center'}),cell(d.item,{bold:true})];
  var rows, rowH;
  if(page===1){
    rows=[hdr,
      [cell('시험 규격',{fill:YEL,bold:true,align:'center',colspan:4}),cell('시험 구성도 및 준비사항',{fill:YEL,bold:true,align:'center',colspan:2})],
      [cell(d.spec||'(미작성)',{colspan:4,valign:'top'}),cell(topoImg?'':'(구성도 없음)',{colspan:2,valign:'bottom',color:'444444',fontSize:8})],
      [cell('시험 방법'+(d._pageTag||''),{fill:YEL,bold:true,align:'center',colspan:4}),cell('시험 결과',{fill:YEL,bold:true,align:'center',colspan:2})],
      [cell(d.method,{colspan:4,valign:'top',fontSize:9.5}),cell('시험 결과 참고 (다음장)',{colspan:2,align:'center',valign:'middle',bold:true})],
      [cell('비고\n(특이사항)',{fill:YEL,bold:true,align:'center',colspan:2}),cell(d.remark,{colspan:4,valign:'top'})]];
    rowH=[0.45,0.34,2.35,0.34,1.85,0.5];
  } else {
    rows=[hdr,
      [cell('시험 결과'+(d._pageTag||''),{fill:YEL,bold:true,align:'center',colspan:6})],
      [cell((d.n2xSnaps&&d.n2xSnaps.length)?'':d.result,{colspan:6,valign:'top',fontSize:9})],
      [cell('비고\n(특이사항)',{fill:YEL,bold:true,align:'center',colspan:2}),cell(d.remark,{colspan:4,valign:'top'})]];
    rowH=[0.45,0.34,4.6,0.5];
  }
  s.addTable(rows,{x:LX,y:1.0,colW:[0.75,2.875,0.75,1.875,1.0,5.25],rowH:rowH,border:BD,valign:'middle',autoPage:false});
  if(page===1&&topoImg){ try{
    // 구성도 셀 = 우측 2열(결과 50%). 셀 폭·높이 안에 contain으로 맞춰 잘림 방지.
    var _cellX=LX+6.25, _cellW=6.05, _cellY=1.5, _cellH=2.2;   // 규격행(rowH 2.35) 안쪽
    var _io=(String(topoImg).indexOf('data:')===0)?{data:topoImg}:{path:topoImg};
    _io.x=_cellX;_io.y=_cellY;_io.w=_cellW;_io.h=_cellH;_io.sizing={type:'contain',w:_cellW,h:_cellH}; s.addImage(_io);
  }catch(e){} }   // 시험 구성도 이미지 (우측 셀 안에 맞춤)
  if(page!==1 && d.n2xSnaps && d.n2xSnaps.length){ var _yy=1.92; d.n2xSnaps.forEach(function(sn){ try{ s.addText('▸ '+(sn.label||''),{x:LX+0.1,y:_yy,w:11.6,h:0.22,fontSize:8.5,bold:true,color:'2D6FD4'}); _yy+=0.28; _yy+=_lguPptN2xTable(s,sn,LX+0.1,_yy,11.5)+0.2; }catch(e){} }); }   // N2X 측정 결과를 pptx 표로 오버레이(미리보기 격자표와 일치)
  s.addShape('line',{x:LX,y:7.02,w:12.5,h:0,line:{color:BDc,width:2.5}});
  s.addShape('line',{x:LX,y:7.08,w:12.5,h:0,line:{color:BDc,width:1}});
  s.addText(String(pageNo||''),{x:LX+11.3,y:7.12,w:1.1,h:0.3,fontSize:11,align:'right',color:'111111'});
}
function _lguPptN2xTable(s, snap, x, y, w){
  var arr=(snap&&snap.stats)||[], names=(snap&&snap.names)||[];
  var num=function(v){var n=parseFloat(v);return isNaN(n)?0:n;};
  var BD={type:'solid',color:'c2cad8',pt:0.5};
  var hdr=['Stream','Tx Pkts','Rx Pkts','Tx Oct','Rx Oct','Tx Mb/s','Rx Mb/s','Loss','Lat(us)','SeqErr'];
  var c=function(t,o){return {text:String(t==null?'':t),options:Object.assign({border:BD,fontSize:7,valign:'middle',align:'right',color:'333333',margin:[2,6,2,6],fontFace:'맑은 고딕'},o||{})};};
  var rows=[hdr.map(function(h,i){return c(h,{fill:'eef2f7',bold:true,align:i===0?'left':'right',color:'46506a'});})];
  var sm={tx:0,rx:0,to:0,ro:0,tt:0,rt:0,ls:0,lt:0,se:0};
  arr.forEach(function(x2,i){ sm.tx+=num(x2.tx);sm.rx+=num(x2.rx);sm.to+=num(x2.txOct);sm.ro+=num(x2.rxOct);sm.tt+=num(x2.txTput);sm.rt+=num(x2.rxTput);sm.ls+=num(x2.loss);sm.lt+=num(x2.latency);sm.se+=num(x2.misorder);
    rows.push([c(names[i]||('#'+(i+1)),{align:'left',color:'1c2230',bold:true}),c(x2.tx),c(x2.rx),c(x2.txOct),c(x2.rxOct),c(x2.txTput),c(x2.rxTput),c(x2.loss,{color:num(x2.loss)>0?'c0392b':'333333',bold:num(x2.loss)>0}),c(x2.latency),c(x2.misorder)]); });
  rows.push([c('합계',{align:'left',bold:true,fill:'e6ebf4',color:'1c2230'}),c(sm.tx,{bold:true,color:'1c2230'}),c(sm.rx,{bold:true,color:'1c2230'}),c(sm.to,{bold:true,color:'1c2230'}),c(sm.ro,{bold:true,color:'1c2230'}),c(sm.tt.toFixed(3),{bold:true,color:'1c2230'}),c(sm.rt.toFixed(3),{bold:true,color:'1c2230'}),c(sm.ls,{bold:true,color:sm.ls>0?'c0392b':'1c2230'}),c(arr.length?(sm.lt/arr.length).toFixed(2):'0',{bold:true,color:'1c2230'}),c(sm.se,{bold:true,color:sm.se>0?'c0392b':'1c2230'})]);
  var rh=0.2;
  try{ s.addTable(rows,{x:x,y:y,w:w,colW:[1.45,1.2,1.2,1.45,1.45,1.05,1.05,0.8,0.95,0.9],rowH:rh,border:BD,valign:'middle',autoPage:false}); }catch(e){}
  return rows.length*rh;
}
function openEditCycleTC(){
  const cy=cbCurrentCycle(); if(!cy){showToast('버전을 선택하세요');return;}
  if(typeof openNewCycle==='function'){ openNewCycle(null, cy); }   // 인페이지 모달(수정 모드) — 안정 우선
}
// 별도 창으로 띄우기(다른 모니터용) — 버튼/메뉴에서 호출
function openEditCycleTCWindow(){
  const cy=cbCurrentCycle(); if(!cy){showToast('버전을 선택하세요');return;}
  try{
    var url=location.origin+location.pathname+'?cycleEdit='+encodeURIComponent(cy.id);
    var w=window.open(url, 'cyEdit_'+cy.id, 'width=1600,height=1000,resizable=yes,scrollbars=yes');
    if(w){ try{ w.focus(); }catch(e){} var _md=document.getElementById('modal-new-cycle'); if(_md)_md.remove(); showToast('새 창으로 열었습니다 — 창을 다른 모니터로 옮기세요'); return; }   // 새 창 성공 → 인페이지 모달 닫기
    showToast('팝업 차단됨 — 주소창의 팝업차단 아이콘에서 이 사이트 허용 후 다시 누르세요');
  }catch(e){ showToast('새 창 열기 실패'); }
  window._ncTcSel=new Set((cy.items||[]).map(it=>it.tcid)); window._ncReqView=null; window._ncEditCycleId=cy.id;
  const e=_bdEsc; const old=document.getElementById('modal-new-cycle'); if(old)old.remove();
  const fld='width:100%;font-size:12.5px;padding:7px 10px;border:1.5px solid var(--border);border-radius:7px;background:#fff;outline:none;box-sizing:border-box;';
  const folderOpts=cycleFolderList.map(f=>'<option value="'+f.id+'" '+(f.id===cy.folder_id?'selected':'')+'>'+e(f.name)+'</option>').join('');
  const modelOpts=[...new Set([...(deviceList||[]).map(d=>d.name),...(cycleList||[]).map(c=>c.model)].filter(Boolean))].map(x=>'<option>'+e(x)+'</option>').join('');
  const groupOpts=[...new Set((cycleList||[]).map(c=>c.version_group).filter(Boolean))].map(g=>'<option>'+e(g)+'</option>').join('');
  const mgrpOpts=((typeof groupList!=='undefined'?groupList:[])||[]).map(function(g){var n=(g&&g.name)||g;return n?'<option>'+e(n)+'</option>':'';}).join('');
  const modal=document.createElement('div'); modal.id='modal-new-cycle'; modal.className='modal-overlay'; modal.style.display='flex';
  modal.innerHTML=
    '<div class="modal" style="width:99vw;max-width:1920px;height:92vh;border-radius:14px;padding:0;display:flex;flex-direction:column;overflow:hidden;">'+
      '<div style="padding:13px 22px;border-bottom:1px solid var(--border);background:#f4f5f7;display:flex;align-items:center;gap:10px;flex-shrink:0;"><i class="ti ti-edit" style="font-size:18px;color:var(--blue);"></i><span style="font-size:16px;font-weight:800;">사이클 수정</span><span style="flex:1;"></span><button onclick="document.getElementById(\'modal-new-cycle\').remove()" style="width:28px;height:28px;border-radius:6px;border:1px solid var(--border);background:#fff;color:var(--text3);cursor:pointer;"><i class="ti ti-x"></i></button></div>'+
      '<div style="padding:11px 22px;border-bottom:1px solid var(--border);background:#fafbfc;flex-shrink:0;display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;">'+
        '<div style="flex:1;min-width:120px;"><label style="font-size:11px;color:var(--text3);font-weight:700;display:block;margin-bottom:4px;">프로젝트</label><select id="ec-folder" style="'+fld+'">'+folderOpts+'</select></div>'+
        '<div style="flex:1;min-width:120px;"><label style="font-size:11px;color:var(--text3);font-weight:700;display:block;margin-bottom:4px;">모델명</label><input id="ec-model" list="ec-model-dl" value="'+e(cy.model||'')+'" style="'+fld+'"><datalist id="ec-model-dl">'+modelOpts+'</datalist></div>'+
        '<div style="flex:1;min-width:110px;"><label style="font-size:11px;color:var(--text3);font-weight:700;display:block;margin-bottom:4px;">버전 그룹</label><input id="ec-group" list="ec-group-dl" value="'+e(cy.version_group||'')+'" style="'+fld+'"><datalist id="ec-group-dl">'+groupOpts+'</datalist></div>'+
        '<div style="flex:1;min-width:110px;"><label style="font-size:11px;color:var(--text3);font-weight:700;display:block;margin-bottom:4px;">버전명</label><input id="ec-version" value="'+e(cy.version||'')+'" style="'+fld+'"></div>'+
      '</div>'+
      '<div style="padding:7px 22px;background:#fff8ec;border-bottom:1px solid #f0e2c4;font-size:11px;color:#8a6d3b;flex-shrink:0;"><i class="ti ti-info-circle"></i> 아래에서 TC 추가/제거 · <b>체크 해제 시 해당 TC와 결과가 제거</b>됩니다.</div>'+
      '<div style="flex:1;display:flex;overflow:hidden;min-height:0;">'+
        '<div style="width:19%;min-width:180px;border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;">'+
          '<div style="padding:7px 12px;border-bottom:1px solid var(--border);background:#eef3ff;display:flex;align-items:center;gap:6px;flex-shrink:0;"><i class="ti ti-file-text" style="color:#2d6fd4;"></i><span style="font-size:12px;font-weight:800;color:#2d6fd4;">요구사항 (REQ)</span></div>'+
          '<div style="padding:6px 10px;border-bottom:1px solid #f0f0f0;flex-shrink:0;"><input id="nc-req-filter" oninput="nc2ReqList()" placeholder="🔍 REQ 검색…" style="width:100%;box-sizing:border-box;font-size:12px;padding:5px 9px;border:1px solid var(--border);border-radius:6px;outline:none;"></div>'+
          '<div id="nc-req-fp" style="flex-shrink:0;">'+nc2FilterPanel('req')+'</div>'+
          '<div style="flex:1;overflow:auto;" id="nc-req-list"></div>'+
        '</div>'+
        '<div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">'+
          '<div style="padding:7px 12px;border-bottom:1px solid var(--border);background:#edfff6;display:flex;align-items:center;gap:6px;flex-shrink:0;flex-wrap:wrap;"><i class="ti ti-clipboard-check" style="color:#00a872;"></i><span style="font-size:12px;font-weight:800;color:#00875a;">시험항목 (TC)</span><span style="flex:1;"></span>'+
            '<button onclick="nc2AddShown(true)" title="보이는 TC를 배정" style="font-size:10.5px;padding:4px 12px;border-radius:6px;border:none;background:#00a872;color:#fff;cursor:pointer;font-weight:800;"><i class="ti ti-arrow-right" style="font-size:12px;"></i> 배정</button>'+
            '<button onclick="nc2AddShown(false)" title="보이는 TC를 배정 해제" style="font-size:10.5px;padding:4px 11px;border-radius:6px;border:1px solid #e8a3ad;background:#fff;color:#e53e5a;cursor:pointer;font-weight:700;"><i class="ti ti-arrow-left" style="font-size:12px;"></i> 해제</button>'+
            '<span style="width:1px;height:15px;background:var(--border);"></span>'+
            '<button onclick="nc2SelectAll(true)" title="모든 TC 배정" style="font-size:10px;padding:4px 8px;border-radius:6px;border:1px solid #00a87255;background:#fff;color:#00875a;cursor:pointer;font-weight:700;">전체</button>'+
            '<button onclick="nc2SelectAll(false)" title="모두 해제" style="font-size:10px;padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:#fff;color:var(--text3);cursor:pointer;">해제</button>'+
            '<button onclick="var f=document.getElementById(\'nc-tc-flt\');if(f)f.style.display=(f.style.display===\'none\'?\'\':\'none\');" title="필터 펼치기/접기" style="font-size:10px;padding:4px 9px;border-radius:6px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;"><i class="ti ti-filter" style="font-size:12px;"></i> 필터</button></div>'+
          '<div style="padding:7px 10px;border-bottom:1px solid #f0f0f0;flex-shrink:0;"><input id="nc-tc-filter" oninput="nc2TcList()" placeholder="🔍 TC 검색" style="width:100%;box-sizing:border-box;font-size:12px;padding:6px 10px;border:1px solid var(--border);border-radius:7px;outline:none;"></div>'+
          '<div id="nc-tc-flt" style="display:none;flex-shrink:0;">'+
            '<div style="padding:6px 10px;border-bottom:1px solid #f0f0f0;display:flex;gap:6px;align-items:center;flex-wrap:wrap;background:#fbfcfe;">'+
              '<select id="nc-tcf-mgroup" onchange="nc2TcfGrpChange()" title="모델그룹 필터" style="font-size:11px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;background:#fff;outline:none;cursor:pointer;max-width:140px;"><option value="">모델그룹·전체</option>'+mgrpOpts+'</select>'+
              '<select id="nc-tcf-model" onchange="nc2TcList()" title="모델 필터 (비대상은 빗금)" style="font-size:11px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;background:#fff;outline:none;cursor:pointer;max-width:140px;"><option value="">모델·전체</option>'+modelOpts+'</select>'+
            '</div>'+
            '<div id="nc-tc-fp">'+nc2FilterPanel('tc')+'</div>'+
          '</div>'+
          '<div style="flex:1;overflow:auto;" id="nc-tc-list"></div>'+
        '</div>'+
        '<div style="width:44%;min-width:360px;border-left:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;background:#fcfdff;">'+
          '<div style="padding:7px 12px;border-bottom:1px solid var(--border);background:#eaf6ff;display:flex;align-items:center;gap:6px;flex-shrink:0;"><i class="ti ti-clipboard-list" style="color:#2d6fd4;"></i><span style="font-size:12px;font-weight:800;color:#1c5fb0;">배정된 항목</span><span id="nc-asg-cnt" style="font-size:11px;font-weight:800;color:#fff;background:#2d6fd4;border-radius:9px;padding:1px 8px;">0</span><span style="flex:1;"></span><button onclick="nc2ClearAssigned()" title="전체 비우기" style="font-size:10px;padding:2px 9px;border-radius:5px;border:1px solid var(--border);background:#fff;color:var(--text3);cursor:pointer;">비우기</button></div>'+
          '<div style="flex:1;overflow:auto;" id="nc-assigned-list"></div>'+
        '</div>'+
      '</div>'+
      '<div style="padding:11px 22px;border-top:1px solid var(--border);display:flex;align-items:center;gap:10px;flex-shrink:0;background:#fafbfc;"><span id="nc-sum" style="font-size:12.5px;color:var(--text2);font-weight:700;flex:1;"></span><button onclick="document.getElementById(\'modal-new-cycle\').remove()" style="font-size:13px;padding:8px 18px;border-radius:7px;border:1.5px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;">취소</button><button onclick="nc2SubmitEdit()" style="font-size:13px;padding:8px 22px;border-radius:7px;border:none;background:#00a872;color:#fff;cursor:pointer;font-weight:700;"><i class="ti ti-check"></i> 저장</button></div>'+
    '</div>';
  document.body.appendChild(modal);
  nc2ReqList(); nc2TcList(); nc2Sum();
}
async function nc2SubmitEdit(){
  const cy=cycleList.find(c=>c.id===window._ncEditCycleId); if(!cy){showToast('사이클을 찾을 수 없습니다');return;}
  const _gv=function(id){ var el=document.getElementById(id); return el?String(el.value||'').trim():''; };
  const folderId=cy.folder_id;
  const model=_gv('nc-model')||cy.model;
  const group=_gv('nc-group')||cy.version_group;
  const version=_gv('nc-version')||cy.version;
  const assignee=_gv('nc-assignee');
  const startDate=(document.getElementById('nc-start')&&document.getElementById('nc-start').value)||'';
  const endDate=(document.getElementById('nc-end')&&document.getElementById('nc-end').value)||'';
  const mailSend=(typeof _ncMailSend!=='undefined')?!!_ncMailSend:false;
  if(!model||!group||!version){showToast('모델·버전그룹·버전명을 입력하세요');return;}
  const sel=window._ncTcSel||new Set();
  const removed=(cy.items||[]).filter(it=>!sel.has(it.tcid)).length;
  const _doApply=async function(){
    cy.items=(cy.items||[]).filter(it=>sel.has(it.tcid));
    var _tia=(typeof window!=='undefined'&&window._ncTcAssignee)||{};   // 항목별 담당자 맵
    var _ia=function(k){ return _tia[k]||assignee||''; };
    cy.items.forEach(function(it){ var a=_ia(it.tcid); if(a)it.assignee=a; });   // 항목별 담당자 반영(없으면 일괄값)
    const have=new Set(cy.items.map(it=>it.tcid));
    [...sel].forEach(function(k){ if(have.has(k))return; const t=tcList.find(x=>(x.tcid||x.id)===k); if(!t)return; cy.items.push({tcid:t.tcid||t.id,name:t.name||'',req_id:t.req_id||'',severity:t.severity||'',priority:t.priority||'',assignee:_ia(t.tcid||t.id),steps:_checksToSteps(t, cy.model)}); });
    cy.folder_id=folderId; cy.model=model; cy.version_group=group; cy.version=version; cy.assignee=assignee; cy.start_date=startDate; cy.end_date=endDate; cy.mail_send=mailSend;
    await saveCycle(cy);
    cbSel.model=model; cbSel.vgroup=group; cbSel.version=version; cbSaveSel();
    const md=document.getElementById('modal-new-cycle'); if(md)md.remove(); cbSelItem=null; renderCycleBoard(); showToast('사이클 수정 완료 (TC '+cy.items.length+'개)');
    if(typeof window!=='undefined'&&window._ncWinMode){ try{ window.close(); }catch(e){} }   // 별도 창이면 저장 후 닫기
    if(typeof _ncMaybeSendMail==='function') _ncMaybeSendMail(assignee, group, version, 1);
  };
  if(removed>0){ uiConfirm({title:'TC 제거 확인', icon:'ti-alert-triangle', danger:true, confirmText:'계속', msg:removed+'개 TC가 제거됩니다(결과 포함). 계속할까요?', onConfirm:_doApply}); return; }
  await _doApply();
}
let _cbRunning=null, _cbRunKey=null, _cbRunStep=-1;   // 자동실행 중인 항목 key·스텝 인덱스 (실시간 강조용)
function cbMilestoneHtml(){
  const cy=cbCurrentCycle();
  let items=(cy&&Array.isArray(cy.items))?cy.items:[];
  if(!items.length){ try{ items=cbFlatItems().map(f=>cbResolve(f.key).it).filter(Boolean); }catch(e){} }
  const byDate={};
  items.forEach(function(it){ (it.steps||[]).forEach(function(s){ if(s.date){ const o=byDate[s.date]||(byDate[s.date]={p:0,f:0,t:0}); o.t++; if(s.result==='Pass')o.p++; else if(s.result==='Fail')o.f++; } }); });
  const dates=Object.keys(byDate).sort();
  const totalSteps=items.reduce(function(a,it){return a+((it.steps||[]).length);},0);
  if(!dates.length) return '<div style="padding:44px 20px;text-align:center;color:var(--text3);font-size:13px;"><i class="ti ti-calendar-stats" style="font-size:30px;color:#c48a00;"></i><br><br>아직 실행 이력이 없습니다.<br>시험을 실행하면 일자별 진행이 여기에 쌓입니다.</div>';
  let cum=0; const totalDone=dates.reduce(function(a,d){return a+byDate[d].t;},0);
  const rows=dates.map(function(d){ const x=byDate[d]; cum+=x.t; const pct=totalSteps?Math.round(cum/totalSteps*100):0;
    return '<div style="display:flex;align-items:center;gap:12px;padding:9px 16px;border-bottom:1px solid #eef0f3;">'
      +'<span style="font-size:12.5px;font-weight:800;color:#475063;min-width:96px;font-family:Consolas,monospace;">'+d+'</span>'
      +'<div style="flex:1;height:16px;background:#eef1f5;border-radius:8px;overflow:hidden;"><div style="height:100%;width:'+pct+'%;background:linear-gradient(90deg,#00a872,#19c98a);"></div></div>'
      +'<span style="font-size:12px;font-weight:800;color:#00875a;min-width:44px;text-align:right;">'+pct+'%</span>'
      +'<span style="font-size:11.5px;color:var(--text2);min-width:120px;text-align:right;">+'+x.t+'건 <span style="color:#00a872;font-weight:700;">✓'+x.p+'</span> <span style="color:#e53e5a;font-weight:700;">✕'+x.f+'</span></span>'
      +'</div>';
  }).join('');
  const avg=totalDone/dates.length; const remain=totalSteps-totalDone; const daysLeft=(avg>0&&remain>0)?Math.ceil(remain/avg):0;
  const overallPct=totalSteps?Math.round(totalDone/totalSteps*100):0;
  const fc=(remain>0&&avg>0)?(' · 📉 현재 속도면 약 <b style="color:#c48a00;">'+daysLeft+'일</b> 더'):(remain<=0?' · ✅ 완료':'');
  return '<div style="padding:14px 18px;border-bottom:2px solid var(--border);background:linear-gradient(135deg,rgba(196,138,0,0.08),transparent);">'
    +'<div style="font-size:15px;font-weight:800;color:#1a2030;"><i class="ti ti-flag-3" style="color:#c48a00;"></i> '+(cy?_bdEsc((cy.model||'')+' · '+(cy.version||cy.vgroup||'')):'전체')+'</div>'
    +'<div style="font-size:12px;color:var(--text2);margin-top:6px;">총 '+totalSteps+'스텝 · <b style="color:#00875a;">'+totalDone+' 완료('+overallPct+'%)</b> · 남은 '+remain+fc+'</div>'
    +'</div>'
    +'<div style="font-size:11px;font-weight:800;color:var(--text3);padding:9px 16px 4px;letter-spacing:0.3px;">📅 일자별 누적 진행</div>'
    +rows;
}function cbCloseMilestone(){ const m=document.getElementById('cb-ms-modal'); if(m) m.remove(); }
let cbLogEntries=[]; try{ cbLogEntries=JSON.parse(localStorage.getItem('utop_cb_log')||'[]')||[]; }catch(_e){ cbLogEntries=[]; }   // 시험 로그(영구 유지): {t,mode,name,cli,result,tcid,model,version,tester}
let cbLogTester=''; let cbLogFilter='';  // 시험 로그 필터(판정자 / 자유검색)
let cbLogMGroup='', cbLogModel='', cbLogVGroup='', cbLogVersion='', cbLogResult='', cbLogMode='';  // 컬럼 필터: 제품군·제품명·버전그룹·버전명·결과·실행구분
function _cbLogSave(){ try{ localStorage.setItem('utop_cb_log', JSON.stringify(cbLogEntries.slice(-500))); }catch(_e){} }
function _logVgroup(en){   // 버전그룹: 엔트리에 없으면 cycleList에서 model+version으로 찾음
  if(en&&en.version_group) return en.version_group;
  if(typeof cycleList==='undefined'||!cycleList) return '';
  var cy=cycleList.find(function(c){ return c.model===(en&&en.model)&&c.version===(en&&en.version); });
  return (cy&&cy.version_group)||'';
}
function _cbLogRow(en){
  const cmap={'Pass':'#00a872','Fail':'#e53e5a','미구현':'#e8820c','미지원':'#7c3aed','제외':'#888'};
  const col=cmap[en.result]||'#9aa0b8';
  const lab=(en.result==='Pass')?'PASS':(en.result==='Fail')?'FAIL':(en.result||'…');
  const isM=(en.mode==='manual');
  const modeBadge='<span style="font-size:9.5px;font-weight:800;color:#fff;background:'+(isM?'#e8820c':'#2d6fd4')+';border-radius:4px;padding:2px 7px;">'+(isM?'수동':'자동')+'</span>';
  const _ei=cbLogEntries.indexOf(en); const _hasSteps=!!(en.steps&&en.steps.length);
  const stepChip=en.step
    ?'<span title="실행 스텝 순서" style="font-size:10px;font-weight:800;color:#fff;background:#5a4bd6;border-radius:4px;padding:2px 6px;">S'+en.step+(en.stepTotal?'/'+en.stepTotal:'')+'</span>'
    :(_hasSteps
      ?'<span title="클릭: 스텝 펼치기/접기" style="cursor:pointer;font-size:10px;font-weight:800;color:#5a4bd6;background:#efecfb;border-radius:5px;padding:2px 8px;display:inline-flex;align-items:center;gap:2px;"><i class="ti ti-chevron-'+(en._open?'down':'right')+'" style="font-size:12px;"></i>'+en.stepTotal+'스텝</span>'
      :(en.stepTotal?'<span title="스텝 수" style="font-size:10px;font-weight:800;color:#5a4bd6;background:#efecfb;border-radius:5px;padding:2px 7px;">'+en.stepTotal+'스텝</span>':''));
  const tester=en.tester?_bdEsc(en.tester):'<span style="color:#c8cdd6;">–</span>';
  const modelCell=en.model?_bdEsc(en.model):'<span style="color:#c8cdd6;">–</span>';
  const _mg=(typeof _cycMGroup==='function')?_cycMGroup({model:en.model}):''; const mgCell=(_mg&&_mg!==en.model&&_mg!=='(미분류)')?_bdEsc(_mg):'<span style="color:#c8cdd6;">–</span>';   // 제품군 = 모델그룹
  const _vg=_logVgroup(en); const vgCell=_vg?_bdEsc(_vg):'<span style="color:#c8cdd6;">–</span>';   // 버전그룹
  const verCell=en.version?_bdEsc(en.version):'<span style="color:#c8cdd6;">–</span>';
  const _tid=String(en.tcid||'').replace(/['"\\]/g,'');
  const tcid=en.tcid?'<span onclick="event.stopPropagation();cbOpenTcPopup(\''+_tid+'\')" title="'+_bdEsc(en.tcid)+' (클릭: 상세)" style="font-family:Consolas,monospace;font-size:11.5px;font-weight:700;color:#2d6fd4;cursor:pointer;text-decoration:underline;text-underline-offset:2px;">'+_bdEsc(String(en.tcid).replace(/^U-REQ-SYS-/i,''))+'</span>':'<span style="color:#c8cdd6;">–</span>';
  const _td='padding:5px 9px;border-bottom:1px solid #f0f2f6;font-size:12.5px;white-space:nowrap;vertical-align:middle;';
  const nameCell=_bdEsc(en.name||'')+(en.cli?'<span style="color:#9aa3b2;font-weight:400;"> · '+_bdEsc(String(en.cli).split(/\r?\n/)[0]).slice(0,90)+'</span>':'');
  return '<tr'+(_hasSteps?' onclick="cbLogToggle('+_ei+')" style="cursor:pointer;"':'')+' title="실행 '+(en.t||'')+'">'+
    '<td style="'+_td+'overflow:hidden;text-overflow:ellipsis;color:#7c3aed;font-weight:700;">'+mgCell+'</td>'+
    '<td style="'+_td+'overflow:hidden;text-overflow:ellipsis;color:#2d6fd4;font-weight:600;">'+modelCell+'</td>'+
    '<td style="'+_td+'overflow:hidden;text-overflow:ellipsis;color:#7c5cd6;font-weight:600;">'+vgCell+'</td>'+
    '<td style="'+_td+'overflow:hidden;text-overflow:ellipsis;color:#3a4150;">'+verCell+'</td>'+
    '<td style="'+_td+'overflow:hidden;text-overflow:ellipsis;">'+tcid+'</td>'+
    '<td style="'+_td+'overflow:hidden;text-overflow:ellipsis;color:#1a2030;font-weight:600;">'+nameCell+'</td>'+
    '<td style="'+_td+'text-align:center;">'+(stepChip||'<span style="color:#c8cdd6;">–</span>')+'</td>'+
    '<td style="'+_td+'text-align:center;"><span style="font-size:11px;font-weight:800;color:#fff;background:'+col+';border-radius:8px;padding:2px 9px;">'+_bdEsc(lab)+'</span></td>'+
    '<td style="'+_td+'text-align:center;">'+modeBadge+'</td>'+
    '<td style="'+_td+'color:#5a6172;overflow:hidden;text-overflow:ellipsis;">'+tester+'</td>'+
  '</tr>'+_cbLogStepsRow(en);
}
// TC 로그 행 아래에 스텝 실행결과를 인라인(들여쓰기 목록)으로 표시
function cbLogToggle(i){ const e=cbLogEntries[i]; if(!e) return; e._open=!e._open; const ex=document.getElementById('cb-exec'); if(ex)ex.innerHTML=cbLogHtml(); }
function _cbLogStepsRow(en){
  if(!en.steps||!en.steps.length||!en._open) return '';
  const cmap={'Pass':'#00a872','Fail':'#e53e5a','미구현':'#e8820c','미지원':'#7c3aed','제외':'#888'};
  const _bg='background:#fbfaff;border-bottom:1px solid #eef0f6;';
  const _e='<td style="'+_bg+'"></td>';   // 빈 셀(컬럼 정렬용)
  const rows=en.steps.map(function(s){ const sc=cmap[s.result]||'#9aa3af'; const sl=s.result||'–';
    const lbl='<span style="color:#aab0bd;font-family:Consolas,monospace;margin-right:7px;">'+s.n+'.</span><span style="color:#444b58;">'+_bdEsc(s.label||'')+'</span>';
    const badge='<span style="font-size:9.5px;font-weight:800;color:#fff;background:'+sc+';border-radius:7px;padding:1px 8px;">'+_bdEsc(sl)+'</span>';
    return '<tr>'+_e+_e+_e+_e+_e
      +'<td style="'+_bg+'padding:2px 9px;font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+lbl+'</td>'   // TC 제목 열
      +_e   // 스텝 열
      +'<td style="'+_bg+'padding:2px 9px;text-align:center;">'+badge+'</td>'   // 결과 열
      +_e+_e   // 실행구분·시험자 열
      +'</tr>';
  }).join('');
  return rows;
}
function cbLogHtml(){
  if(!cbLogEntries.length) return '<div style="padding:28px 14px;text-align:center;color:var(--text3);font-size:12px;line-height:1.7;"><i class="ti ti-player-play" style="color:#00a872;font-size:20px;"></i><br>자동 실행 또는 수동 판정 시<br>시험 로그가 여기에 쌓입니다</div>';
  const q=(cbLogFilter||'').toLowerCase().trim();
  let ents=cbLogEntries;
  if(cbLogTester) ents=ents.filter(e=>(e.tester||'')===cbLogTester);
  if(cbLogMGroup) ents=ents.filter(e=>((typeof _cycMGroup==='function')?_cycMGroup({model:e.model}):(e.model||''))===cbLogMGroup);
  if(cbLogModel) ents=ents.filter(e=>(e.model||'')===cbLogModel);
  if(cbLogVGroup) ents=ents.filter(e=>_logVgroup(e)===cbLogVGroup);
  if(cbLogVersion) ents=ents.filter(e=>(e.version||'')===cbLogVersion);
  if(cbLogResult) ents=ents.filter(e=>(e.result||'')===cbLogResult);
  if(cbLogMode) ents=ents.filter(e=>(e.mode==='manual'?'수동':'자동')===cbLogMode);
  if(q) ents=ents.filter(e=>[e.tester,e.name,e.tcid,e.result,e.model,e.version,e.cli].some(v=>String(v||'').toLowerCase().includes(q)));
  if(!ents.length) return '<div style="padding:26px 14px;text-align:center;color:var(--text3);font-size:12px;line-height:1.7;"><i class="ti ti-search-off" style="font-size:20px;opacity:0.4;"></i><br>필터에 맞는 기록이 없습니다<br><span style="font-size:10.5px;">'+(cbLogTester?'판정자 <b>'+_bdEsc(cbLogTester)+'</b> ':'')+(q?'· "'+_bdEsc(cbLogFilter)+'"':'')+'</span></div>';
  const _th='padding:6px 9px;background:#f0eefc;border-bottom:1.5px solid #d9d2f0;font-size:11px;font-weight:800;color:#6b5bb5;text-align:left;position:sticky;top:0;z-index:1;white-space:nowrap;';
  const _cols=[['제품군','left'],['제품명','left'],['버전그룹','left'],['버전명','left'],['TC ID','left'],['TC 제목','left'],['스텝','center'],['결과','center'],['실행 구분','center'],['시험자','left']];
  return '<table style="width:100%;border-collapse:collapse;table-layout:fixed;">'+
    '<colgroup><col style="width:130px"><col style="width:90px"><col style="width:104px"><col style="width:148px"><col style="width:150px"><col style="min-width:360px"><col style="width:80px"><col style="width:68px"><col style="width:84px"><col style="width:90px"></colgroup>'+
    '<thead><tr>'+_cols.map(function(c){return '<th style="'+_th+'text-align:'+c[1]+';">'+c[0]+'</th>';}).join('')+'</tr></thead>'+
    '<tbody id="cb-steplog">'+ents.slice().reverse().map(_cbLogRow).join('')+'</tbody></table>';
}
function _cbLogFilterBar(){
  const _mgOf=function(e){ var g=(typeof _cycMGroup==='function')?_cycMGroup({model:e.model}):''; return (g&&g!==e.model&&g!=='(미분류)')?g:''; };
  // 트리 캐스케이드: 상위 선택(제품군▸제품명▸버전그룹▸버전명)을 통과한 엔트리에서만 하위 옵션 산출
  const base=function(level){ return cbLogEntries.filter(function(e){
    if(level==='mg') return true;
    if(cbLogMGroup && _mgOf(e)!==cbLogMGroup) return false;
    if(level==='model') return true;
    if(cbLogModel && (e.model||'')!==cbLogModel) return false;
    if(level==='vg') return true;
    if(cbLogVGroup && _logVgroup(e)!==cbLogVGroup) return false;
    if(level==='ver') return true;
    if(cbLogVersion && (e.version||'')!==cbLogVersion) return false;
    return true;
  }); };
  const uniq=function(arr,fn){ return Array.from(new Set(arr.map(fn).filter(Boolean))).sort(); };
  const mgroups=uniq(base('mg'),_mgOf);
  const models=uniq(base('model'),function(e){ return e.model; });
  const vgroups=uniq(base('vg'),function(e){ return _logVgroup(e); });
  const versions=uniq(base('ver'),function(e){ return e.version; });
  const attr=base('attr');
  const results=uniq(attr,function(e){ return e.result; });
  const testers=uniq(attr,function(e){ return e.tester; });
  const sel=function(val,ph,arr,setter,col){ const on=!!val; const o='<option value="">'+ph+'</option>'+arr.map(function(x){ return '<option value="'+_bdEsc(x)+'"'+(val===x?' selected':'')+'>'+_bdEsc(x)+'</option>'; }).join(''); return '<select onchange="'+setter+'(this.value)" title="'+ph+' 필터" style="font-size:11px;padding:3px 6px;border:1px solid '+(on?col:'var(--border)')+';border-radius:5px;background:'+(on?col+'18':'#fff')+';color:'+(on?col:'var(--text2)')+';cursor:pointer;font-weight:'+(on?'700':'400')+';max-width:118px;">'+o+'</select>'; };
  const active=(cbLogTester||cbLogFilter||cbLogMGroup||cbLogModel||cbLogVGroup||cbLogVersion||cbLogResult||cbLogMode);
  return '<div style="display:flex;align-items:center;gap:5px;padding:6px 10px;border-bottom:1px solid var(--border);background:#faf9fe;flex-shrink:0;flex-wrap:wrap;">'+
    '<i class="ti ti-filter" style="font-size:13px;color:#7c3aed;flex-shrink:0;"></i>'+
    sel(cbLogMGroup,'제품군',mgroups,'cbLogSetMGroup','#2d6fd4')+
    '<i class="ti ti-chevron-right" style="font-size:11px;color:#c5cbd6;"></i>'+
    sel(cbLogModel,'제품명',models,'cbLogSetModel','#2d6fd4')+
    '<i class="ti ti-chevron-right" style="font-size:11px;color:#c5cbd6;"></i>'+
    sel(cbLogVGroup,'버전그룹',vgroups,'cbLogSetVGroup','#7c5cd6')+
    '<i class="ti ti-chevron-right" style="font-size:11px;color:#c5cbd6;"></i>'+
    sel(cbLogVersion,'버전명',versions,'cbLogSetVersion','#0d9488')+
    '<span style="width:1px;height:18px;background:#dfe2ea;margin:0 2px;"></span>'+
    sel(cbLogResult,'결과',results,'cbLogSetResult','#e53e5a')+
    sel(cbLogMode,'실행구분',['자동','수동'],'cbLogSetMode','#e8820c')+
    sel(cbLogTester,'시험자',testers,'cbLogSetTester','#7c3aed')+
    '<input id="cb-log-search" value="'+_bdEsc(cbLogFilter)+'" oninput="cbLogSetFilter(this.value)" placeholder="TC·결과·명령 검색…" style="flex:1;min-width:120px;margin-left:auto;font-size:11px;padding:4px 8px;border:1px solid var(--border);border-radius:5px;outline:none;">'+
    '<button onclick="cbLogClearFilter()" title="필터 해제" style="width:22px;height:22px;border-radius:5px;border:1px solid var(--border);background:#fff;color:'+(active?'var(--red)':'var(--text3)')+';cursor:pointer;padding:0;flex-shrink:0;"><i class="ti ti-x" style="font-size:11px;"></i></button>'+
  '</div>';
}
function _cbLogReDrop(){ const fb=document.getElementById('cb-log-filterbar'); if(fb)fb.outerHTML=_cbLogFilterBarWrap(); const ex=document.getElementById('cb-exec'); if(ex)ex.innerHTML=cbLogHtml(); }
function cbLogSetTester(v){ cbLogTester=v; _cbLogReDrop(); }
function cbLogSetMGroup(v){ cbLogMGroup=v; cbLogModel=''; cbLogVGroup=''; cbLogVersion=''; _cbLogReDrop(); }   // 트리: 상위 변경 시 하위 초기화
function cbLogSetModel(v){ cbLogModel=v; cbLogVGroup=''; cbLogVersion=''; _cbLogReDrop(); }
function cbLogSetVGroup(v){ cbLogVGroup=v; cbLogVersion=''; _cbLogReDrop(); }
function cbLogSetVersion(v){ cbLogVersion=v; _cbLogReDrop(); }
function cbLogSetResult(v){ cbLogResult=v; _cbLogReDrop(); }
function cbLogSetMode(v){ cbLogMode=v; _cbLogReDrop(); }
function cbLogSetFilter(v){ cbLogFilter=v; const ex=document.getElementById('cb-exec'); if(ex)ex.innerHTML=cbLogHtml(); }
function cbLogClearFilter(){ cbLogTester=''; cbLogFilter=''; cbLogMGroup=''; cbLogModel=''; cbLogVGroup=''; cbLogVersion=''; cbLogResult=''; cbLogMode=''; const fb=document.getElementById('cb-log-filterbar'); if(fb)fb.outerHTML=_cbLogFilterBarWrap(); const ex=document.getElementById('cb-exec'); if(ex)ex.innerHTML=cbLogHtml(); }
function _cbLogFilterBarWrap(){ return '<div id="cb-log-filterbar">'+_cbLogFilterBar()+'</div>'; }
// 시험 로그에서 TC ID 클릭 → 해당 TC UI 팝업
function _cbTcPopupClose(){
  // 순서 중요: modal 을 제거하기 전에 팝업 안 #e3-detail 노드를 원위치로 되돌려야 함.
  // (m.remove() 가 먼저 실행되면 그 안의 자식 노드까지 함께 사라져 3열 복원 불가)
  try{
    var _det=document.getElementById('e3-detail');
    var _ph=document.getElementById('e3-detail-orig-placeholder');
    if(_det && _ph && _ph.parentNode){
      // 노드 이동 (같은 노드 → 리스너·TinyMCE 상태 그대로 유지됨)
      _ph.parentNode.insertBefore(_det, _ph);
      _ph.parentNode.removeChild(_ph);
      // 옮길 때 저장했던 style 복원
      if(_det._cbSavedStyle!==undefined){
        if(_det._cbSavedStyle) _det.setAttribute('style', _det._cbSavedStyle);
        else _det.removeAttribute('style');
        delete _det._cbSavedStyle;
      }
    }
  }catch(_e){}
  // 이제 modal 제거 (안에 e3-detail 이 남아있어도 이미 옮겨졌으므로 안전)
  const m=document.getElementById('cb-tc-modal'); if(m) m.remove();
  const st=document.getElementById('cb-tc-modal-style'); if(st) st.remove();
  // 키보드 단축키 리스너 정리
  if(window._cbTcNavKeyHandler){ try{ document.removeEventListener('keydown', window._cbTcNavKeyHandler, true); }catch(e){} window._cbTcNavKeyHandler=null; }
  // e3SelTc 를 원래 값으로 복원 + 3열 재렌더
  try{
    if(typeof window._cbSavedE3Sel!=='undefined'){
      if(typeof e3SelTc!=='undefined') e3SelTc=window._cbSavedE3Sel;
      delete window._cbSavedE3Sel;
    }
    if(typeof e3SelTc!=='undefined' && e3SelTc && typeof e3RenderDetail==='function') e3RenderDetail(e3SelTc);
  }catch(_e){}
  // 팝업 닫힐 때 사이클 뷰 갱신 (TC 수정 내용 반영)
  try{ if(typeof cbRefreshItems==='function') cbRefreshItems(); }catch(e){}
  try{ const dt=document.getElementById('cb-detail'); if(dt&&typeof cbExecHtml==='function') dt.innerHTML=cbExecHtml(); }catch(e){}
  try{ if(typeof e3RebuildTcBody==='function') e3RebuildTcBody(); }catch(_e){}
  try{ if(typeof e3bRenderDetail==='function' && typeof e3bSelTc!=='undefined' && e3bSelTc) e3bRenderDetail(e3bSelTc); }catch(_e){}
  window._cbTcPopupTid=null;
}
async function cbOpenTcPopup(tcid){
  if(!tcid) return;
  let m=document.getElementById('cb-tc-modal'); if(m) m.remove();
  let mSt=document.getElementById('cb-tc-modal-style'); if(mSt) mSt.remove();
  // 팝업 내부 전체 pointer-events 강제 활성화 CSS
  mSt=document.createElement('style'); mSt.id='cb-tc-modal-style';
  mSt.textContent='#cb-tc-modal-inner,#cb-tc-modal-inner *{pointer-events:auto !important;}#cb-tc-modal-bg{pointer-events:auto;}';
  document.head.appendChild(mSt);
  // 팝업 네비게이션 컨텍스트 결정
  // 1) Cycle Test Execution: 현재 사이클(cbCurrentCycle)의 items 를 순회
  // 2) Coverage(원본/Beta): 현재 활성 페이지에서 마지막으로 렌더한 TC 순서(e3FlatTcOrder / e3bFlatTcOrder) 를 순회
  var _cy=(typeof cbCurrentCycle==='function')?cbCurrentCycle():null;
  var _cyItems=(_cy&&Array.isArray(_cy.items))?_cy.items.filter(function(it){return it&&it.tcid;}):[];
  if(!_cyItems.length){
    // Coverage 화면에서 열렸다면 그 화면의 TC 순서로 fallback
    var _active=(document.querySelector('.page.active')||{}).id||'';
    var _flat=(_active==='page-explorer3-beta' && typeof e3bFlatTcOrder!=='undefined')?e3bFlatTcOrder
             :(_active==='page-explorer3' && typeof e3FlatTcOrder!=='undefined')?e3FlatTcOrder:null;
    if(_flat && _flat.length){ _cyItems=_flat.map(function(x){return {tcid:x};}); }
  }
  var _cyIdx=_cyItems.findIndex(function(it){return it.tcid===tcid;});
  var _prevTcid=(_cyIdx>0)?_cyItems[_cyIdx-1].tcid:'';
  var _nextTcid=(_cyIdx>=0&&_cyIdx<_cyItems.length-1)?_cyItems[_cyIdx+1].tcid:'';
  var _navInfo=(_cyItems.length&&_cyIdx>=0)?((_cyIdx+1)+' / '+_cyItems.length):'';
  var _navBtn=function(id,ic,title,tid){
    var _disabled=!tid;
    return '<button id="'+id+'" '+(_disabled?'disabled':'onclick="cbOpenTcPopup(\''+_bdEsc(tid)+'\')"')+' title="'+title+'" style="width:26px;height:26px;border-radius:7px;border:1px solid '+(_disabled?'#e6e8ee':'var(--border)')+';background:'+(_disabled?'#f5f6f8':'#fff')+';color:'+(_disabled?'#c8cdd6':'var(--text2)')+';cursor:'+(_disabled?'not-allowed':'pointer')+';padding:0;display:inline-flex;align-items:center;justify-content:center;"><i class="ti '+ic+'" style="font-size:15px;"></i></button>';
  };
  var _navHtml=_cyItems.length?('<div style="display:inline-flex;align-items:center;gap:4px;margin-right:6px;">'
    +_navBtn('cb-tc-prev','ti-chevron-left','이전 항목 (←)',_prevTcid)
    +(_navInfo?'<span style="font-size:11px;color:var(--text3);font-weight:600;padding:0 6px;white-space:nowrap;">'+_navInfo+'</span>':'')
    +_navBtn('cb-tc-next','ti-chevron-right','다음 항목 (→)',_nextTcid)
    +'</div>'):'';
  m=document.createElement('div'); m.id='cb-tc-modal';
  m.style.cssText='position:fixed;inset:0;z-index:200000;display:flex;align-items:center;justify-content:center;padding:6px 8px;pointer-events:none;';
  var mBg=document.createElement('div'); mBg.id='cb-tc-modal-bg'; mBg.style.cssText='position:absolute;inset:0;background:rgba(0,0,0,0.45);cursor:default;';
  mBg.onclick=function(){ _cbTcPopupClose(); };
  m.appendChild(mBg);
  var mInner=document.createElement('div'); mInner.id='cb-tc-modal-inner';
  mInner.style.cssText='position:relative;width:min(2200px,99vw);height:96vh;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,0.45);display:flex;flex-direction:column;z-index:1;';
  mInner.innerHTML=
    '<div style="display:flex;align-items:center;gap:9px;padding:10px 14px;border-bottom:1px solid var(--border);background:#f0f6ff;flex-shrink:0;"><i class="ti ti-clipboard-text" style="color:#2d6fd4;font-size:22px;"></i><b id="cb-tc-modal-req" style="font-size:20px;color:#1a2236;letter-spacing:0.2px;">'+_bdEsc(tcid)+'</b><span id="cb-tc-modal-name" style="font-size:14px;color:var(--text2);font-weight:500;"></span><span style="font-size:11px;font-weight:800;color:#fff;background:#2d6fd4;border-radius:8px;padding:3px 10px;margin-left:4px;flex-shrink:0;"><i class="ti ti-pencil" style="font-size:12px;"></i> 편집 가능</span><span style="flex:1;"></span>'+_navHtml+'<button onclick="_cbTcPopupClose()" style="width:26px;height:26px;border-radius:7px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;padding:0;"><i class="ti ti-x" style="font-size:15px;"></i></button></div>'
    +'<div id="cb-tc-modal-body" style="flex:1;overflow:auto;background:#fff;"><div style="padding:50px;text-align:center;color:var(--text3);font-size:13px;"><i class="ti ti-loader-2" style="font-size:22px;"></i><br><br>TC 불러오는 중…</div></div>';
  m.appendChild(mInner);
  document.body.appendChild(m);
  let fullTC=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid));
  try{
    const r=await fetch('/api/tc/'+_tcUrl(tcid));
    if(r.ok){ const data=await r.json(); if(data&&(data.tcid||data.id)){ const idx=tcList.findIndex(t=>t.tcid===tcid||t.id===tcid); const merged={...(fullTC||{}),...data}; if(idx>=0)tcList[idx]=merged; else tcList.push(merged); fullTC=tcList.find(t=>t.tcid===tcid||t.id===tcid); } }
  }catch(e){}
  const body=document.getElementById('cb-tc-modal-body'); if(!body) return;
  if(!fullTC){ body.innerHTML='<div style="padding:50px;text-align:center;color:var(--text3);font-size:13px;"><i class="ti ti-alert-circle" style="font-size:24px;color:#e8820c;"></i><br><br>TC를 찾을 수 없습니다<br><b style="font-family:Consolas,monospace;">'+_bdEsc(tcid)+'</b></div>'; return; }
  // 팝업 헤더 = 연결된 REQ 이름만 표시(요구사항 제목). 매칭 실패 시 빈칸.
  try{
    const reqHead=document.getElementById('cb-tc-modal-req');
    if(reqHead){
      const _rid=fullTC.req_id||'';
      const _rq=_rid?(typeof reqList!=='undefined'?reqList:[]).find(function(r){return r&&(r.id===_rid||r.reqid===_rid);}):null;
      reqHead.textContent=_rq?(_rq.title||_rq.reqid||''):'';
    }
  }catch(_e){}
  // TC 이름(subtitle) 은 헤더에서 숨김
  const nm=document.getElementById('cb-tc-modal-name');
  if(nm){ nm.textContent=''; nm.style.display='none'; }
  // 팝업 안 상세는 3열과 완전히 동일한 동작을 위해 e3RenderDetail 결과 DOM 을 팝업 body 로 "이동"시킨다.
  // (innerHTML 재구성 대신 실제 노드를 이동하므로 TinyMCE·우클릭·이벤트 리스너까지 그대로 유지된다.)
  var _tid=(fullTC.tcid||fullTC.id);
  window._cbTcPopupTid=_tid;
  // 3열 상세가 있으면 원래 있던 자리와 selTc 를 백업 후 이 tcid 로 세팅
  try{
    if(typeof window._cbSavedE3Sel==='undefined') window._cbSavedE3Sel=(typeof e3SelTc!=='undefined')?e3SelTc:null;
    if(typeof e3SelTc!=='undefined') e3SelTc=_tid;
    if(typeof e3TcTab==='undefined') { try{ window.e3TcTab={}; }catch(_e){} }
    if(typeof e3TcTab!=='undefined' && !e3TcTab[_tid]) e3TcTab[_tid]='procedure';
  }catch(_e){}
  // hidden 대신 DOM 이동 방식 — 3열의 #e3-detail 노드 자체를 팝업 body 로 옮긴다.
  // element id 는 원래 있던 하나만 살아있으므로 중복 없음(팝업 액션이 3열에 영향 없음).
  // 팝업 닫힐 때 원래 위치로 되돌린다. 원래 자리엔 자리표시자(placeholder)를 남겨 위치 기억.
  body.innerHTML='';
  var _e3Orig=document.getElementById('e3-detail');
  if(_e3Orig){
    // 자리표시자 삽입
    var _ph=document.createElement('div');
    _ph.id='e3-detail-orig-placeholder';
    _ph.style.cssText='flex:1;display:none;min-height:0;';
    _e3Orig.parentNode.insertBefore(_ph, _e3Orig);
    // 노드 이동 (같은 노드를 옮김 → 안에 있던 리스너·TinyMCE·상태 그대로)
    body.appendChild(_e3Orig);
    // 팝업 안에서 잘 보이도록 스타일 조정
    _e3Orig._cbSavedStyle=_e3Orig.getAttribute('style')||'';
    _e3Orig.style.cssText='flex:1;display:flex;flex-direction:column;min-height:0;overflow:hidden;height:100%;';
  } else {
    // 3열 페이지에 진입한 적 없어 #e3-detail 이 아예 없는 경우 → 새로 만들기
    var _newDetail=document.createElement('div');
    _newDetail.id='e3-detail';
    _newDetail.style.cssText='flex:1;display:flex;flex-direction:column;min-height:0;overflow:hidden;height:100%;';
    body.appendChild(_newDetail);
  }
  // 3열 렌더 함수 호출 → #e3-detail 을 이 tcid 로 채움
  try{ if(typeof e3RenderDetail==='function') e3RenderDetail(_tid); }catch(_e){}
  try{ if(typeof _tcManExpImgObserveAll==='function') _tcManExpImgObserveAll(); }catch(_e){}
  // 편집 시 Coverage 표 재렌더 (실시간 반영)
  try{
    if(!body._cbSyncOn){
      body._cbSyncOn=true;
      var _syncT=null;
      var _sync=function(){ clearTimeout(_syncT); _syncT=setTimeout(function(){
        try{ if(typeof e3RebuildTcBody==='function') e3RebuildTcBody(); }catch(_e){}
      }, 200); };
      body.addEventListener('input', _sync, true);
      body.addEventListener('change', _sync, true);
      body.addEventListener('blur', _sync, true);
    }
  }catch(_e){}
  // 키보드 단축키: ← 이전 항목 / → 다음 항목 / Esc 닫기
  // 입력·편집 중(INPUT/TEXTAREA/contentEditable) 인 요소에서는 무시 → 텍스트 편집 방해 방지
  if(window._cbTcNavKeyHandler){ try{ document.removeEventListener('keydown', window._cbTcNavKeyHandler, true); }catch(e){} }
  window._cbTcNavKeyHandler=function(ev){
    if(!document.getElementById('cb-tc-modal')) return;
    var _ae=document.activeElement;
    if(_ae && (_ae.tagName==='INPUT'||_ae.tagName==='TEXTAREA'||_ae.isContentEditable||_ae.tagName==='SELECT')) return;
    if(ev.key==='ArrowLeft'){ var _p=document.getElementById('cb-tc-prev'); if(_p && !_p.disabled){ ev.preventDefault(); _p.click(); } }
    else if(ev.key==='ArrowRight'){ var _n=document.getElementById('cb-tc-next'); if(_n && !_n.disabled){ ev.preventDefault(); _n.click(); } }
    else if(ev.key==='Escape'){ ev.preventDefault(); _cbTcPopupClose(); }
  };
  document.addEventListener('keydown', window._cbTcNavKeyHandler, true);
}
function cbLogClear(){
  let m=document.getElementById('cb-log-clear-confirm'); if(m)m.remove();
  m=document.createElement('div'); m.id='cb-log-clear-confirm'; m.className='modal-overlay'; m.style.display='flex';
  m.addEventListener('click',function(e){ if(e.target===m)m.remove(); });
  m.innerHTML='<div onclick="event.stopPropagation()" style="width:380px;max-width:92vw;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.4);">'
    +'<div style="padding:16px 20px;background:linear-gradient(135deg,#e8820c,#f0a93a);color:#fff;display:flex;align-items:center;gap:11px;"><i class="ti ti-trash" style="font-size:24px;"></i><div><div style="font-size:16px;font-weight:800;">시험 로그 지우기</div><div style="font-size:11.5px;opacity:0.92;">현재 '+cbLogEntries.length+'개 기록</div></div></div>'
    +'<div style="padding:18px 20px;font-size:13px;color:var(--text);line-height:1.6;">시험 로그를 모두 삭제합니다.<div style="font-size:11.5px;color:var(--text3);margin-top:6px;"><i class="ti ti-alert-triangle"></i> 삭제된 로그는 복구할 수 없습니다.</div></div>'
    +'<div style="padding:0 20px 18px;display:flex;gap:8px;justify-content:flex-end;"><button onclick="document.getElementById(\'cb-log-clear-confirm\').remove()" style="font-size:13px;padding:8px 18px;border-radius:8px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;">취소</button><button onclick="_cbLogClearDo()" style="font-size:13px;padding:8px 22px;border-radius:8px;border:none;background:#e53e5a;color:#fff;cursor:pointer;font-weight:700;"><i class="ti ti-trash"></i> 모두 삭제</button></div>'
  +'</div>';
  document.body.appendChild(m);
}
function _cbLogClearDo(){ cbLogEntries=[]; _cbLogSave(); const ex=document.getElementById('cb-exec'); if(ex)ex.innerHTML=cbLogHtml(); const m=document.getElementById('cb-log-clear-confirm'); if(m)m.remove(); showToast('시험 로그를 지웠습니다'); }
function _cbTester(){ return (typeof currentUser!=='undefined'&&currentUser&&(currentUser.name||currentUser.username))||''; }
function cbLogStep(tcName, cli, result, mode, meta){
  meta=meta||{};
  const _d=new Date(), _p=function(n){return String(n).padStart(2,'0');};
  const en={t:_p(_d.getMonth()+1)+'/'+_p(_d.getDate())+' '+_p(_d.getHours())+':'+_p(_d.getMinutes())+':'+_p(_d.getSeconds()), mode:mode, name:tcName||'', cli:cli||'', result:result, tcid:meta.tcid||'', model:meta.model||'', version:meta.version||'', tester:(meta.tester||_cbTester()), step:meta.step||0, stepTotal:meta.stepTotal||0};
  cbLogEntries.push(en); _cbLogSave();
  if(cbLogTester||cbLogFilter){ const ex=document.getElementById('cb-exec'); if(ex)ex.innerHTML=cbLogHtml(); const fb=document.getElementById('cb-log-filterbar'); if(fb)fb.outerHTML=_cbLogFilterBarWrap(); }
  else {
    let b=document.getElementById('cb-steplog');
    if(b){ b.insertAdjacentHTML('afterbegin', _cbLogRow(en)); }
    else { const ex=document.getElementById('cb-exec'); if(ex) ex.innerHTML=cbLogHtml(); }   // 첫 기록/표 미생성 시 전체 렌더
  }
  if(mode==='manual'){ const _c={'Pass':'#19c98a','Fail':'#ff6b6b'}[result]||'#9aa3af'; const _l=(result==='Pass')?'PASS':(result==='Fail')?'FAIL':(result||''); cbRunBanner(_cbDot(_c)+' 수동 판정 — '+_bdEsc(tcName||'')+' <b>'+_bdEsc(_l)+'</b>', true, 1500); }
}
// 시험 이력: TC 단위 1건 기록 (스텝 실행결과는 entry.steps 로 인라인 표시)
function cbLogRun(it, cy, steps){
  const _d=new Date(), _p=function(n){return String(n).padStart(2,'0');};
  let _ov=(typeof _cbItemStatusKey==='function')?_cbItemStatusKey(it):''; if(_ov==='PASS')_ov='Pass'; else if(_ov==='FAIL')_ov='Fail';
  const _ss=(steps||[]).map(function(s,i){
    let lbl;
    if(s.action==='대기') lbl='대기 '+(parseInt(s.waitSec||s.cli)||5)+'초';
    else if(s.cli) lbl=((s.action&&s.action!=='CLI')?(s.action+' '):'')+String(s.cli).split(/\r?\n/)[0];
    else lbl=(s.action||'스텝');
    return {n:i+1, label:lbl, result:s.result||''};
  });
  const en={t:_p(_d.getMonth()+1)+'/'+_p(_d.getDate())+' '+_p(_d.getHours())+':'+_p(_d.getMinutes())+':'+_p(_d.getSeconds()), mode:'auto', name:it.name||'', cli:'', result:_ov, tcid:it.tcid||'', model:(cy&&cy.model)||'', version:(cy&&cy.version)||'', tester:_cbTester(), step:0, stepTotal:_ss.length, steps:_ss};
  cbLogEntries.push(en); _cbLogSave();
  const ex=document.getElementById('cb-exec'); if(ex) ex.innerHTML=cbLogHtml();   // 팝업 열려 있으면 갱신
}
function _cbDot(c){ return '<span style="width:9px;height:9px;border-radius:50%;background:'+c+';display:inline-block;flex-shrink:0;"></span>'; }
function cbRunBanner(html, blink, autoClearMs){
  const slot=document.getElementById('topbar-tc-progress'); if(!slot) return;
  if(slot._ct){ clearTimeout(slot._ct); slot._ct=null; }
  slot.innerHTML='<div style="display:inline-flex;align-items:center;gap:8px;padding:5px 16px;border-radius:20px;background:#1e2330;color:#fff;font-size:12.5px;font-weight:700;box-shadow:0 3px 14px rgba(0,0,0,0.28);max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;'+(blink?'animation:llm-blink 0.85s ease-in-out infinite;':'')+'">'+html+'</div>';
  if(autoClearMs) slot._ct=setTimeout(function(){ slot.innerHTML=''; }, autoClearMs);
}let _cbPendingKeys=[];
function cbConfirmAutoRun(keys){
  _cbPendingKeys=keys; let m=document.getElementById('cb-run-confirm'); if(m)m.remove();
  m=document.createElement('div'); m.id='cb-run-confirm'; m.className='modal-overlay'; m.style.display='flex';
  m.addEventListener('click',function(e){ if(e.target===m)m.remove(); });
  m.innerHTML='<div onclick="event.stopPropagation()" style="width:400px;max-width:92vw;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.4);">'
    +'<div style="padding:16px 20px;background:linear-gradient(135deg,#2d6fd4,#4f8ae8);color:#fff;display:flex;align-items:center;gap:11px;"><i class="ti ti-player-play" style="font-size:24px;"></i><div><div style="font-size:16px;font-weight:800;">Test Cycle 자동 실행</div><div style="font-size:11.5px;opacity:0.92;">모델별 등록 장비로 순차 실행</div></div></div>'
    +'<div style="padding:18px 20px;font-size:13px;color:var(--text);line-height:1.6;"><b style="color:#2d6fd4;font-size:19px;">'+keys.length+'개</b> TC를 자동 실행합니다.<div style="font-size:11.5px;color:var(--text3);margin-top:6px;"><i class="ti ti-info-circle"></i> 진행 상태는 상단 중앙에 표시되고, 결과는 시험 로그에 기록됩니다.</div></div>'
    +'<div style="padding:0 20px 18px;display:flex;gap:8px;justify-content:flex-end;"><button onclick="document.getElementById(\'cb-run-confirm\').remove()" style="font-size:13px;padding:8px 18px;border-radius:8px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;">취소</button><button onclick="document.getElementById(\'cb-run-confirm\').remove();_cbAutoRunGo(_cbPendingKeys)" style="font-size:13px;padding:8px 22px;border-radius:8px;border:none;background:#2d6fd4;color:#fff;cursor:pointer;font-weight:700;"><i class="ti ti-player-play"></i> 실행</button></div>'
  +'</div>';
  document.body.appendChild(m);
}
// 사이클 자동실행용 계측기 스텝 실행 (TC meterCfg 사용) — 04 TC Step 실행 로직 이식
async function _cbRunMeterStep(sp, it, cy){
  const tc=tcList.find(t=>(t.tcid||t.id)===it.tcid); const cfg=tc&&tc.meterCfg; const act=sp.action||'';
  sp.date=new Date().toISOString().slice(0,10); sp.executed_at=_nowStr();
  if(act.indexOf('조회')<0){ sp.n2xStats=null; sp.n2xNames=null; sp.n2xElapsed=0; }   // 통계는 'Traffic 조회'에서만 — 인가/정지 스텝엔 표시 안 함
  if(!cfg||!Array.isArray(cfg.streams)||!cfg.streams.length){ sp.output='⚠ 계측기 설정이 없습니다 — TC 트래픽 탭/스튜디오에서 스트림을 정의하세요.'; sp.result='Fail'; return; }
  const isN2X=/n2x|ixia/i.test(String((cfg.vendor||'')+' '+(cfg.model||'')));
  let d;
  try{
    if(isN2X){
      const _post=function(u,b){ return fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}).then(function(r){return r.json();}); };
      const server=(cfg.chassis||'210.1.2.248'); const label=(cfg.n2xLabel||'2');
      if(act==='Traffic Connect'){ d=await (await fetch('/api/n2x/probe?server='+encodeURIComponent(server)+'&label='+encodeURIComponent(label))).json(); if(d&&d.ok){ const _pz=(typeof _n2xStreamPorts==='function')?_n2xStreamPorts(cfg):[]; const _rl=[]; for(let _q=0;_q<_pz.length;_q++){ let rr=null; try{ rr=await _post('/api/n2x/reserve',{server:server,label:label,module:_pz[_q].module,ports:[_pz[_q].port]}); }catch(e){ rr={ok:false,error:e.message}; } _rl.push((rr&&rr.ok?'✔ ':'✖ ')+_pz[_q].module+'/'+_pz[_q].port+(rr&&rr.ok?' 예약됨':' 실패')); } d.text='N2X 세션 연결됨 (서버 '+server+' · label '+label+')'+(_pz.length?('\n'+_rl.join('\n')):''); } }
      else if(act==='ARP Send'){ d={ok:true,text:'N2X: ARP는 Traffic Start 시 자동 처리됩니다.'}; }
      else if(act==='Traffic Start'){ const _ns=(typeof _meterToN2xStreams==='function')?_meterToN2xStreams(cfg):[]; d=await _post('/api/n2x/traffic/start',{server:server,label:label,dur:'0',streams:_ns}); if(d&&d.ok){ cfg._tStart=Date.now(); cfg._tStop=0; d.text='N2X 트래픽 시작 ('+_ns.length+' 스트림)'; } }
      else if(act==='Traffic Stop'){ d=await _post('/api/n2x/traffic/stop',{server:server,label:label}); if(d&&d.ok){ cfg._tStop=Date.now(); d.text='N2X 트래픽 정지 (통계는 [Traffic 조회]로 확인)'; } }
      else if(act==='Traffic Disconnect'){ d=await _post('/api/n2x/traffic/clear',{server:server,label:label}); if(d&&d.ok)d.text='N2X 구성/연결 해제'; }
      else { d=await _post('/api/n2x/traffic/stat',{server:server,label:label}); if(d&&d.ok){ const _enm=(cfg.streams||[]).filter(function(_s){return _s.enabled!==false;}).map(function(_s){return _s.name||'';}); const _el=cfg._tStart?(((cfg._tStop||Date.now())-cfg._tStart)/1000):0; sp.n2xStats=d.streams||[]; sp.n2xNames=_enm; sp.n2xElapsed=_el; d.text=(typeof _n2xStatsText==='function')?_n2xStatsText(d.streams||[],_enm,_el):'N2X 통계 조회됨'; } }
    } else {
      if(act==='Traffic Connect'){ const r=await fetch('/api/stc/conncheck',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chassis:cfg.chassis,restPort:cfg.restPort})}); d=await r.json(); if(d&&d.ok)d.text='STC 섀시 연결 확인됨 ('+(cfg.chassis||'')+')'; }
      else { const _actMap={'ARP Send':'arp','Traffic Start':'start','Traffic Stop':'stop','Traffic 조회':'query','Traffic Disconnect':'stop'}; const r=await fetch('/api/stc/meter/'+(_actMap[act]||'query'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cfg:cfg})}); d=await r.json(); }
    }
    if(d&&d.ok){
      sp.output=d.text||(act+' 완료');
      const _mcrit=String(sp.criteria||'').trim();
      if(_mcrit && ['diff','expr','stepcmp'].indexOf(sp.type||'')<0){ const _v=_cbJudgeStep(sp); sp.result=_v||'Pass'; }
      else { sp.result='Pass'; }   // 기준 없음/복합형 → 실행 성공=Pass (필요 시 수동 조정)
    } else { sp.output='[계측기 오류] '+((d&&d.error)||'알 수 없음'); sp.result='Fail'; }
  }catch(e){ sp.output='[요청 오류] '+e.message; sp.result='Fail'; }
}
function _cbJudgeStep(sp){
  const out=String(sp.output||''); if(!out.trim()) return ''; const crit=sp.criteria||''; const type=sp.type||'contains';
  try{ if(type==='table') return ((typeof _judgeTable==='function')?(_judgeTable((typeof _applyQuery==='function')?_applyQuery(out,sp.query):out,crit).pass?'Pass':'Fail'):''); if(type==='diff'||type==='expr'||type==='stepcmp') return ''; return (typeof _judgeCheck==='function')?_judgeCheck(out,crit,type,sp.excludeLines,sp.query):''; }catch(e){ return ''; }
}
// 사이클 스텝 판정 — TC 실행과 100% 동일: Query·추출 변수 추출 + _subVars 치환 + 식(expr)/표(table)/diff
function _cbJudgeStep(sp, out, tcid){
  try{
    // 변수 추출 설정 소스 = 원본 TC의 매칭 체크(스텝 스냅샷엔 없을 수 있어 TC에서 가져옴 → TC와 동일)
    var _chk=sp; try{ var _tc=(typeof _tcById==='function')?_tcById(tcid):null; if(_tc&&Array.isArray(_tc.checks)){ var _f=_tc.checks.find(function(c){ return (c.kind||'cli')!=='model' && (c.action||'CLI')===(sp.action||'CLI') && String(c.cli||'')===String(sp.cli||''); }); if(_f)_chk=_f; } }catch(_e){}
    // 1) Query 변수 추출 (${var1} 등 — TC 실행과 동일: _extractStepQueries)
    try{ if(typeof _extractStepQueries==='function') _extractStepQueries(tcid, _chk, out); }catch(_e){}
    // 2) 추출 변수(extract) 추출
    try{ if(typeof _stepExtracts==='function' && typeof _varSetAuto==='function' && typeof _extractVar==='function' && typeof _subVars==='function'){
      _stepExtracts(_chk).forEach(function(e){ if(e&&e.var) _varSetAuto(tcid, e.var, _extractVar(out, _subVars(e.rule, tcid))); });
    } }catch(_e){}
    var tp=sp.type||'contains';
    var crit=(typeof _subVars==='function')?_subVars(sp.criteria||'', tcid):(sp.criteria||'');
    if(tp==='expr'){ return (typeof _evalCond==='function' && _evalCond(sp.criteria, tcid))?'Pass':'Fail'; }
    if(tp==='table'){ var _q=(typeof _applyQuery==='function')?_applyQuery(out, sp.query):out; return (typeof _judgeTable==='function' && _judgeTable(_q, crit).pass)?'Pass':'Fail'; }
    if(tp==='diff'){ return (typeof _judgeDiff==='function' && _judgeDiff(out, (sp.baseline||_chk.baseline), sp.excludeLines).pass)?'Pass':'Fail'; }
    return (typeof _judgeCheck==='function')?(_judgeCheck(out, crit, tp, sp.excludeLines, sp.query)||''):'';
  }catch(e){ return (typeof _judgeCheck==='function')?(_judgeCheck(out, sp.criteria, sp.type||'contains', sp.excludeLines, sp.query)||''):''; }
}
async function cbAutoRun(){
  let keys=Array.from(cbItemSel); if(!keys.length) keys=cbFlatItems().map(f=>f.key);
  if(!keys.length){showToast('실행할 항목이 없습니다');return;}
  cbConfirmAutoRun(keys);
}
async function _cbAutoRunGo(keys, _isResume){
  _cbRunCycleIds=[...new Set(keys.map(function(k){ return String(k||'').split('@@')[0]; }).filter(Boolean))];   // 이번 실행 대상 사이클 id (메모리)
  _cbRunAllKeys=keys.slice();   // 이번 실행 대상 key
  if(!_isResume){ _cbRunDoneKeys=[]; }   // 새 실행이면 완료목록 초기화 (재개면 기존 유지 → 이미 끝난 TC 재실행 방지)
  _cbRunActive=true;   // 실행 시작 즉시 활성 (스텝 단위 _cbRunning 이전에 오버레이 뜨도록)
  _cbRunAbort=false;   // 이번 실행 시작: 중지 플래그 리셋
  try{ if(typeof aiBusy==='function') aiBusy(true,'작업 중'); }catch(e){}   // 탑메뉴 배지 ON
  _cbRunSaveState();   // 실행 시작 즉시 저장(새로고침 재개 대비)
  _cbRunOverlaySync();
  cbRunBanner(_cbDot('#ff5b5b')+' 자동 실행 시작… (총 '+keys.length+'개)', true);
  _cbRunNotify('start',{done:0,total:keys.length});   // 다른 접속자에게 실행 시작 중계
  window._cbAJCtx=undefined; window._cbAJResults=[];   // TC별 Fail 즉시 이슈 등록: 컨텍스트·결과 초기화
  const touched=new Set(); let noDev=0, _done=0;
  try{ const _ex=document.getElementById('cb-exec'); if(_ex && !document.getElementById('cb-steplog')) _ex.innerHTML=cbLogHtml(); }catch(_e){}
  for(const key of keys){
    if(window._cbRunAbort){ try{ _cbRunAbort=false; }catch(_ae){} break; }   // 사용자 중지 요청 → 남은 사이클 아이템 스킵
    const o=cbResolve(key); if(!o.it) continue;
    // 예전 사이클 호환: TC엔 대기(sleep) 스텝이 있는데 항목엔 빠졌으면 TC 절차로 재동기화 (실행 결과는 매칭해 보존)
    try{
      const _tcF=tcList.find(t=>(t.tcid||t.id)===o.it.tcid);
      if(_tcF && typeof _checksToSteps==='function'){
        const _fresh=_checksToSteps(_tcF, o.cy&&o.cy.model);   // 모델 필터 적용
        const _freshHasWait=_fresh.some(function(s){return s.action==='대기';});
        const _itemHasWait=(o.it.steps||[]).some(function(s){return s.action==='대기';});
        if(_freshHasWait && !_itemHasWait && _fresh.length){
          const _old=(o.it.steps||[]).slice();
          // 대기 스텝만 보강. 매칭된 스텝은 항목의 판정 기준(사용자가 '현재 TC로 업데이트'한 값)을 그대로 보존 → tcList로 덮어쓰지 않음
          o.it.steps=_fresh.map(function(s){ const m=_old.find(function(x){return (x.action||'')===(s.action||'') && (x.cli||'')===(s.cli||'');});
            if(!m) return s;   // 새로 추가된 스텝(대기 등)만 fresh 사용
            return Object.assign({}, s, {cli:(m.cli!=null?m.cli:s.cli), criteria:(m.criteria!=null?m.criteria:s.criteria), type:(m.type||s.type), query:(m.query!=null?m.query:s.query), excludeLines:(m.excludeLines!=null?m.excludeLines:s.excludeLines), critMode:(m.critMode||s.critMode), excMode:(m.excMode||s.excMode), result:m.result||'', output:m.output||'', date:m.date||'', n2xStats:m.n2xStats||null, n2xNames:m.n2xNames||null, n2xElapsed:m.n2xElapsed||0});
          });
        }
      }
    }catch(_e){}
    cbSelItem=key; _cbRunKey=key; _cbRunStep=-1;   // 실행 중인 TC를 자동 선택 → 3열이 따라감
    try{ const _dt0=document.getElementById('cb-detail'); if(_dt0)_dt0.innerHTML=cbExecHtml(); const _c20=document.getElementById('cb-col2body'); if(_c20)_c20.innerHTML=cbCol2Html(); const _t0=document.getElementById('cb-tree'); if(_t0)_t0.innerHTML=cbTreeHtml(); }catch(_e){}   // ★ TC 전환 즉시 Test Procedure Details(우측)·중앙·트리를 이 TC로 갱신 → 실행 TC에 맞춰 유지
    try{ var _eu=(typeof currentUser!=='undefined'&&currentUser&&(currentUser.name||currentUser.username))||''; if(_eu){ o.it.executed_by=_eu; o.it.executed_at=(typeof _nowStr==='function'?_nowStr():new Date().toISOString().slice(0,16).replace('T',' ')); } o.it.executed_auto=true; }catch(_e){}   // 실행자 자동기록 + 자동실행 표식
    _done++; cbRunBanner(_cbDot('#ff5b5b')+' AI Test Cycle Running — '+_bdEsc(o.it.name||o.it.tcid||'')+' ('+_done+'/'+keys.length+')', true);
    _cbRunProgSet(_done, keys.length, o.it.name||o.it.tcid||'');   // 오버레이 진행률: 총 N중 M (xx%)
    _cbRunNotify('tc',{name:o.it.name||o.it.tcid||'', done:_done, total:keys.length});   // 진행 상태 중계
    // 실행 장비 탐색: 모델명 등록장비 → TC의 Session Open(랩) → 모델명 랩
    let dev=(deviceList||[]).find(d=>d.name===o.cy.model&&d.ip);
    if(!dev){ const _tc=tcList.find(t=>(t.tcid||t.id)===o.it.tcid); const _co=_tc&&(_tc.checks||[]).find(c=>(c.kind||'')==='connect'&&c.model&&c.model!=='공통'); const _lab=_co?((typeof labList!=='undefined'?labList:[]).find(x=>x.name===_co.model&&x.ip)):null; if(_lab) dev={ip:_lab.ip,port:_lab.port,protocol:_lab.protocol,username:_lab.username,password:_lab.password,secret:_lab.secret,device_type:_lab.device_type}; }
    if(!dev){ dev=(typeof labList!=='undefined'?labList:[]).find(l=>l.name===o.cy.model&&l.ip); }
    try{ if(typeof _procVars!=='undefined' && o.it.tcid){ _procVars[o.it.tcid]={}; } }catch(_e){}   // 이 TC 실행 변수 초기화(이전 실행 누수 방지)
    // ── Cycle 실행을 Tests의 tcCheckRunAll 에 위임 (통합 엔진) ──────────────────
    // Tests가 지원하는 모든 기능(IF/switch/for/Command/재접속/Completion Wait/멈춤/중지/message 등)이
    // 사이클에서도 그대로 작동. 실행이 끝난 뒤 TC 스텝(c.output·c.repeatResult)을 사이클 아이템에 반영.
    // 실패해도 아래 기존 순차 엔진으로 폴백 실행.
    try{
      var _srcTc=(typeof _cbResolveTcForItem==='function')?_cbResolveTcForItem(o.it, o.cy):tcList.find(function(t){return (t.tcid||t.id)===o.it.tcid;});
      if(_srcTc && typeof tcCheckRunAll==='function' && Array.isArray(_srcTc.checks) && _srcTc.checks.length){
        var _srcTcid=_srcTc.tcid||_srcTc.id;
        // Cycle 라이브 컨텍스트 세팅 — tcCheckRunAll 안에서 이 사이클/모델 필터가 적용됨.
        _cycleLiveCtx={cycleId:(o.cy&&o.cy.id)||'', itemIdx:((o.cy&&o.cy.items||[]).indexOf(o.it)), tcid:_srcTcid, model:(o.cy&&o.cy.model)||''};
        // ckid → 사이클 스텝 인덱스 매핑 캐시 (실행 강조 브리지에서 O(1) 조회)
        try{ _cbCkidMap=_cbBuildCkidMap(o.it, _srcTc, (o.cy&&o.cy.model)||''); _cbRunStep=-1; }catch(_be){ _cbCkidMap=null; }
        try{ if(typeof aiBusy==='function') aiBusy(true,'Cycle 실행 중'); }catch(_e){}
        cbRunBanner(_cbDot('#ff5b5b')+' '+_bdEsc(o.it.name||o.it.tcid||'')+' · Tests 통합 엔진으로 실행 중… (TC '+_done+'/'+keys.length+')', true);
        // tcCheckRunAll 은 자동 세션 오픈 + 재접속 + 세션 종료까지 모두 처리.
        // 실행 로그 History는 TC 편집기 쪽에 남고 사이클에는 결과만 반영됨.
        try{ await tcCheckRunAll(_srcTcid); }
        catch(_re){ try{ console.error('[Cycle→Tests] tcCheckRunAll 오류, 폴백 실행으로 진행:', _re); }catch(_le){} }
        _cycleLiveCtx=null; _cbCkidMap=null;
        // 실행 결과를 사이클 아이템 스텝에 매핑: (cli,desc) 매칭으로 output/repeatResult 반영.
        try{ if(typeof _cbAutoSyncItem==='function') _cbAutoSyncItem(o.it, o.cy); }catch(_se){}
        // 진행 렌더링·저장
        _cbRunning=null;
        try{ if(typeof cbLogRun==='function') cbLogRun(o.it, o.cy, o.it.steps||[]); }catch(_e){}
        touched.add(o.cy);
        if(_cbRunDoneKeys.indexOf(key)<0) _cbRunDoneKeys.push(key);
        try{ await saveCycle(o.cy); }catch(_e){}
        try{
          if(typeof _cbItemStatusKey==='function' && _cbItemStatusKey(o.it)==='FAIL'){
            if(window._cbAJCtx===undefined) window._cbAJCtx=(await _cbAutoJiraCtx())||null;
            if(window._cbAJCtx){
              try{ cbRunBanner(_cbDot('#e8820c')+' Fail → Jira 이슈 자동 등록 중… ('+_bdEsc(o.it.tcid||'')+')', true); }catch(_e){}
              var _aj=await _cbAutoJiraOne(o.cy, o.it, window._cbAJCtx);
              if(_aj&&_aj.dirty){ try{ await saveCycle(o.cy); }catch(_e){} }
              if(_aj&&_aj.result){ (window._cbAJResults=window._cbAJResults||[]).push(_aj.result); if(_aj.result.ok&&typeof showToast==='function') showToast('Jira 이슈 자동 등록: '+_aj.result.key+' ('+(o.it.tcid||'')+')'); }
            }
          }
        }catch(_e){}
        _cbRunSaveState();
        try{ var _ei=document.getElementById('cb-items'); if(_ei)_ei.innerHTML=cbItemsHtml(); }catch(_e){}
        try{ var _ep=document.getElementById('cb-progress'); if(_ep)_ep.innerHTML=cbCycleProgressHtml(); }catch(_e){}
        try{ var _ed=document.getElementById('cb-detail'); if(_ed)_ed.innerHTML=cbExecHtml(); }catch(_e){}
        continue;   // 이 아이템은 통합 엔진으로 완료 → 아래 기존 순차 루프 스킵
      }
    }catch(_ute){ try{ console.error('[Cycle→Tests] 위임 실패, 폴백:', _ute); }catch(_le){} _cycleLiveCtx=null; }
    let _hadCliNoDev=false;
    const _prog=function(){ try{ _cbRunSaveState(); }catch(_e){}   // 실행 위치(사이클/항목/스텝) 저장 → 새로고침 후 강조 복원
      try{ const _pp=document.getElementById('cb-progress'); if(_pp)_pp.innerHTML=cbCycleProgressHtml(); const _ee=document.getElementById('cb-items'); if(_ee)_ee.innerHTML=cbItemsHtml(); const _c2=document.getElementById('cb-col2body'); if(_c2)_c2.innerHTML=cbCol2Html();
      const _dt=document.getElementById('cb-detail'); if(_dt){ var _stp=_dt.scrollTop; _dt.innerHTML=cbExecHtml(); _dt.scrollTop=_stp; setTimeout(_cbScrollToRunStep, 30); }   // 재렌더 → 스크롤 위치 보존 → 다음 tick에 자동 스크롤로 실행 스텝을 중앙 근처로
    }catch(_e){} };
    const _stArr=(o.it.steps||[]); for(let _six=0;_six<_stArr.length;_six++){ const sp=_stArr[_six]; _cbRunStep=_six;
      try{ if(sp._loopVars && typeof _procVars!=='undefined' && o.it.tcid){ _procVars[o.it.tcid]=_procVars[o.it.tcid]||{}; for(var _lk in sp._loopVars){ if(Object.prototype.hasOwnProperty.call(sp._loopVars,_lk)) _procVars[o.it.tcid][_lk]=sp._loopVars[_lk]; } } }catch(_e){}   // for문 반복변수($i 등) 바인딩 → TC와 동일하게 치환
      try{ cbRunBanner(_cbDot('#ff5b5b')+' '+_bdEsc(o.it.name||o.it.tcid||'')+' · <b>Step '+(_six+1)+'/'+_stArr.length+'</b> 실행 중… (TC '+_done+'/'+keys.length+')', true); }catch(_e){}
      const _act=sp.action||'';
      if(sp.manual||_act==='수동'){ sp.output='⏭ 수동 시험 항목 — 자동 실행에서 제외(직접 결과 입력 필요)'; _prog(); continue; }   // 수동 스텝: 자동 실행 대상 아님 → 건너뜀(판정도 미포함)
      if(_isMtrAct(_act)){   // 계측기 스텝: TC meterCfg로 N2X/STC 실행 (DUT 불필요)
        _cbRunning={tcid:o.it.tcid, cli:_act}; _prog();
        try{ await _cbRunMeterStep(sp,o.it,o.cy); }catch(e){ sp.result='Fail'; sp.output='[계측기 오류] '+e.message; }
        _prog(); continue;
      }
      if(_act==='대기'){   // 대기(Sleep): waitSec 초만큼 실제 대기 (트래픽 누적 시간 확보, 기본 5초 = TC 기본값)
        const _sec=parseInt(sp.waitSec||sp.cli||0,10)||5;
        sp.result='Pass'; sp.date=new Date().toISOString().slice(0,10); sp.executed_at=_nowStr();
        sp.output='⏳ 대기 중… 남은 '+_sec+'초 / 총 '+_sec+'초';
        _cbRunning={tcid:o.it.tcid, cli:'대기 '+_sec+'초'}; _prog();   // 전체 렌더는 시작에 1회만 (매초 재렌더 깜빡임 방지)
        for(let _rem=_sec; _rem>0; _rem--){   // 카운트다운: 해당 출력 요소 + 배너만 경량 갱신
          const _txt='⏳ 대기 중… 남은 '+_rem+'초 / 총 '+_sec+'초'; sp.output=_txt;
          const _co=document.getElementById('cb-runstep-out'); if(_co){ _co.textContent=_txt; } else { _prog(); }
          try{ cbRunBanner(_cbDot('#e8820c')+' 대기 중… 남은 '+_rem+'초 / 총 '+_sec+'초', true); }catch(_e){}
          await new Promise(function(r){ setTimeout(r,1000); });
        }
        sp.output='⏱ 대기 '+_sec+'초 완료';
        _cbRunning={tcid:o.it.tcid, cli:'대기 '+_sec+'초'}; _prog(); continue;   // 종료 시 1회 렌더
      }
      if(_act.indexOf('SNMP')===0){   // SNMP 스텝: TC와 동일하게 /api/snmp-get·snmp-set 으로 실행
        const _tc=tcList.find(t=>(t.tcid||t.id)===o.it.tcid);
        const _chk=_tc&&(_tc.checks||[]).find(function(c){ return (c.action||'CLI')===sp.action && String(c.cli||'')===String(sp.cli||''); });
        const _l=(_tc&&_chk&&typeof _checkLab==='function')?_checkLab(_tc,_chk):null;
        const _cliSub=(typeof _subVars==='function')?_subVars(sp.cli||'',o.it.tcid).trim():String(sp.cli||'').trim();
        const _isSet=(sp.action==='SNMP Set') || ((sp.action==='SNMP Private'||sp.action==='SNMP Public') && /\]\s*$/.test(_cliSub));   // OID [값] = SET
        if(!_l||!_l.ip){ sp.result='Fail'; sp.output='[SNMP] 대상 장비(IP)를 찾을 수 없습니다 — TC 세션/장비 확인'; sp.date=new Date().toISOString().slice(0,10); sp.executed_at=_nowStr(); _prog(); continue; }
        const ver=_l.snmp_ver||'v2c';
        _cbRunning={tcid:o.it.tcid, cli:'SNMP '+_cliSub}; _prog();
        if(_isSet){   // ── SNMP SET (TC와 동일: [값]·타입 파싱 → /api/snmp-set, RW community) ──
          if(!_cliSub){ sp.result='Fail'; sp.output='[SNMP SET] OID와 값을 입력하세요 (예: .1.3.6.1.2.1.1.4.0 [test])'; sp.date=new Date().toISOString().slice(0,10); sp.executed_at=_nowStr(); _prog(); continue; }
          const _bm=_cliSub.match(/^([\s\S]*?)\[([\s\S]*)\]\s*$/); let oid, val;
          if(_bm){ oid=_bm[1].trim().replace(/\s+/g,''); val=_bm[2]; }
          else { const _sp=_cliSub.search(/\s/); oid=(_sp<0?_cliSub:_cliSub.slice(0,_sp)).trim(); val=(_sp<0?'':_cliSub.slice(_sp+1)).trim(); }
          if(/::/.test(val)){ const _vm=val.match(/^\S+\s+([\s\S]+)$/); if(_vm) val=_vm[1].trim(); }   // [MIB-name 값] → 값만
          let _vtype=''; { const _tm=String(val).match(/^\s*(i|u|c|g|t|s|a|x|hex|int|uint|unsigned|gauge|gauge32|counter|counter32|ticks|timeticks|integer|ip|ipaddress)\s*:\s*([\s\S]*)$/i); if(_tm){ _vtype=_tm[1].toLowerCase(); val=_tm[2].trim(); } }
          const commW=(_l.snmp_private&&_l.snmp_private.trim())||'private';
          try{
            const r=await fetch('/api/snmp-set',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host:_l.ip,oid:oid,value:val,community:commW,version:ver,type:_vtype})});
            const d=await r.json();
            sp.output=d.ok?(d.output||'[SNMP SET OK] '+oid+' = '+val):('[SNMP SET 오류] '+(d.error||''));
            const _v=_cbJudgeStep(sp, sp.output, o.it.tcid);
            sp.result=(!d.ok)?'Fail':(_v||'실행완료'); sp.date=new Date().toISOString().slice(0,10); sp.executed_at=_nowStr();
          }catch(e){ sp.result='Fail'; sp.output='[SNMP SET 요청 오류] '+e.message; }
          _prog(); continue;
        }
        // ── SNMP GET (RO/RW 조회) ──
        const oid=_cliSub;
        if(!oid){ sp.result='Fail'; sp.output='[SNMP] OID 없음'; sp.date=new Date().toISOString().slice(0,10); sp.executed_at=_nowStr(); _prog(); continue; }
        const _isPriv=(sp.action==='SNMP Private');
        const _pubComm=(_l.snmp_public&&_l.snmp_public.trim())||((typeof snmpData!=='undefined'&&snmpData&&snmpData.communities&&snmpData.communities[0]&&snmpData.communities[0].community)||'public');
        const comm=_isPriv?(_l.snmp_private||''):_pubComm;
        try{
          const r=await fetch('/api/snmp-get',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host:_l.ip,oid:oid,community:comm,version:ver})});
          const d=await r.json();
          sp.output=d.ok?((d.output||'(빈 응답)')+(d.mode==='walk'?('\n— (WALK '+(d.count||0)+'행: 테이블 OID 자동 조회)'):'')):('[SNMP 오류] '+(d.error||''));
          const _v=_cbJudgeStep(sp, sp.output, o.it.tcid);   // TC와 동일 판정(변수·식·표)
          sp.result=(!d.ok)?'Fail':(_v||'Pass'); sp.date=new Date().toISOString().slice(0,10); sp.executed_at=_nowStr();
        }catch(e){ sp.result='Fail'; sp.output='[SNMP 요청 오류] '+e.message; }
        _prog(); continue;
      }
      if(!sp.cli){ continue; }
      if(!dev){ _hadCliNoDev=true; continue; }
      const _cliRun=(typeof _subVars==='function')?_subVars(sp.cli, o.it.tcid):sp.cli;   // ${var}·$i(for문)·#N.colM 치환 → TC 실행과 동일
      _cbRunning={tcid:o.it.tcid, cli:_cliRun}; try{ const _pr=document.getElementById('cb-progress'); if(_pr)_pr.innerHTML=cbCycleProgressHtml(); }catch(_e){}
      try{
        const r=await fetch('/api/run-cli',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host:dev.ip,port:dev.port||23,protocol:dev.protocol||'telnet',username:dev.username||'',password:dev.password||'',secret:dev.secret||'',device_type:dev.device_type||'',commands:[_cliRun]})});
        const d=await r.json(); const out=(d.ok&&d.outputs&&d.outputs[0])?d.outputs[0].output:'';
        sp.output=out; const v=_cbJudgeStep(sp, out, o.it.tcid); sp.result=v||(d.ok?'Pass':'Fail'); sp.date=new Date().toISOString().slice(0,10); sp.executed_at=_nowStr();   // TC와 동일 판정(변수·식·표)
      }catch(e){ sp.result='Fail'; sp.output='[오류] '+e.message; }
      _prog();
    }
    try{ cbLogRun(o.it, o.cy, _stArr); }catch(_e){}   // 시험 이력: TC 단위 1건(스텝 결과는 인라인)
    if(_hadCliNoDev) noDev++;   // CLI 스텝이 있는데 DUT 장비를 못 찾은 경우만 건너뜀 집계
    touched.add(o.cy);
    if(_cbRunDoneKeys.indexOf(key)<0) _cbRunDoneKeys.push(key);   // ★ 이 TC 실행 완료로 명시 기록 (재개 시 건너뜀 판정 기준)
    try{ await saveCycle(o.cy); }catch(_e){}   // ★ TC 완료 즉시 서버 저장 → 새로고침해도 진행분·강조 유지
    // ★ TC 종료 즉시: FAIL이면 이 TC의 Jira 이슈를 바로 자동 등록 (다음 TC 시작 전 — CLI 세션 경합 없음)
    try{
      if(_cbItemStatusKey(o.it)==='FAIL'){
        if(window._cbAJCtx===undefined) window._cbAJCtx=(await _cbAutoJiraCtx())||null;   // 최초 1회만 로드 (실패 시 null=이번 실행 동안 비활성)
        if(window._cbAJCtx){
          try{ cbRunBanner(_cbDot('#e8820c')+' Fail → Jira 이슈 자동 등록 중… ('+_bdEsc(o.it.tcid||'')+')', true); }catch(_e){}
          const _aj=await _cbAutoJiraOne(o.cy, o.it, window._cbAJCtx);
          if(_aj&&_aj.dirty){ try{ await saveCycle(o.cy); }catch(_e){} }
          if(_aj&&_aj.result){ (window._cbAJResults=window._cbAJResults||[]).push(_aj.result); if(_aj.result.ok&&typeof showToast==='function') showToast('Jira 이슈 자동 등록: '+_aj.result.key+' ('+(o.it.tcid||'')+')'); }
        }
      }
    }catch(_e){}
    _cbRunSaveState();   // 완료목록·실행위치 저장
    const e=document.getElementById('cb-items'); if(e)e.innerHTML=cbItemsHtml();
    const _p2=document.getElementById('cb-progress'); if(_p2)_p2.innerHTML=cbCycleProgressHtml();
  }
  _cbRunning=null; _cbRunKey=null; _cbRunStep=-1;
  for(const cy of touched){ await saveCycle(cy); }
  cbRefreshItems(); try{ const _pf=document.getElementById('cb-progress'); if(_pf)_pf.innerHTML=cbCycleProgressHtml(); }catch(_e){}
  touched.forEach(function(cy){ _cbCheckComplete(cy); });
  cbRunBanner('✅ AI Test Cycle Completed ('+keys.length+')', false, 3500);
  _cbRunNotify('done',{done:keys.length,total:keys.length});   // 실행 완료 중계
  let _sp=0,_sf=0,_so=0; keys.forEach(function(k){ const o=cbResolve(k); if(!o.it)return; const st=_cbItemStatusKey(o.it); if(st==='PASS')_sp++; else if(st==='FAIL')_sf++; else _so++; });
  cbShowRunSummary({total:keys.length,pass:_sp,fail:_sf,other:_so,noDev:noDev});
  try{ _cbAJShowResults(window._cbAJResults||[]); window._cbAJResults=[]; }catch(e){}   // TC별 즉시 등록 결과 요약 모달
  try{ _cbAutoJiraFails(Array.from(touched)); }catch(e){}   // 안전망: 남은/실패 Fail 재점검 (살아있는 이슈 연결 항목은 건너뜀)
  _cbRunActive=false; _cbRunCycleIds=[]; _cbRunAllKeys=[]; _cbRunDoneKeys=[];   // 실행 완료 → 대상 해제
  try{ if(typeof aiBusy==='function') aiBusy(false); }catch(e){}   // 탑메뉴 배지 OFF
  _cbRunClearState();   // 저장된 실행 지점 삭제 → 완료 후 강조/스텝 복원·재개 안 함
  _cbResumeBannerShown=false; if(typeof _cbRunResumeBannerHide==='function') _cbRunResumeBannerHide();   // 배너 가드 리셋 + 숨김
  _cbRunOverlayHide();
}
// ── 자동 실행 완료 → Fail 항목을 장비명(모델) 매칭 Jira 프로젝트에 자동 이슈 등록 ──
// 우선순위·사업자·이슈분류·구성요소 등은 "Jira 프로젝트 패널 설정"의 이슈유형·필드 기본값(field_defaults)을 그대로 적용.
function _cbJiraProjForModel(projs, model){
  var m=String(model||'').trim().toLowerCase(); if(!m) return null;
  return projs.find(function(p){ return String(p.key||'').toLowerCase()===m || String(p.name||'').toLowerCase()===m; })
    || projs.find(function(p){ return String(p.name||'').toLowerCase().indexOf(m)>=0; })
    || projs.find(function(p){ var n=String(p.name||'').toLowerCase(); return n.length>=4 && m.indexOf(n)>=0; })
    || null;
}
// 수동 이슈 등록 팝업과 동일한 패널 본문(_jiBuildDesc)을 사이클 항목 데이터로 생성
function _cbFailIssueDesc(cy, it, useImg, topoText){
  var prevSteps=(typeof _jiTcSteps!=='undefined')?_jiTcSteps:[]; var prevPh=window._jiPhenomenon;
  try{
    _jiTcSteps=(it.steps||[]).filter(function(s){return s&&(s.cli||s.desc);}).map(function(s){ return {action:s.desc||'', cmd:s.cli||'', expected:s.criteria||'', repeatOutput:s.output||'', repeatResult:s.result||'', rca:s.rca||''}; });
    // TC ID → utop 해당 TC 딥링크 (Jira wiki [텍스트|URL] 하이퍼링크)
    var _base=''; try{ _base=location.origin+location.pathname; }catch(e){}
    var _tid=String(it.tcid||'');
    var _tlink=(_base&&_tid)?('['+_tid+'|'+_base+'#tc='+encodeURIComponent(_tid)+']'):_tid;
    window._jiPhenomenon='Test Cycle 자동 실행(Automation) 중 Fail 발생\n모델: '+(cy.model||'')+' / 버전: '+(cy.version||'')+(cy.version_group?(' · '+cy.version_group):'')+'\nTC: '+_tlink+' '+(it.name||'');
    // ji-p2(시험구성도)만 Topology 텍스트 주입 — useImg=true면 본문에 !구성도.png|thumbnail! 참조 포함
    return (typeof _jiBuildDesc==='function')?_jiBuildDesc(!!useImg, function(id){ return id==='ji-p2'?(topoText||''):''; }):'';
  } finally { _jiTcSteps=prevSteps; window._jiPhenomenon=prevPh; }
}
// 사이클 항목의 DUT 장비 (자동 실행과 동일한 탐색 순서: 모델명 등록장비 → TC Session Open 랩 → 모델명 랩)
function _cbDutForItem(cy, it){
  var dev=(deviceList||[]).find(function(d){return d.name===cy.model&&d.ip;});
  if(!dev&&it){ var _tc=(tcList||[]).find(function(t){return (t.tcid||t.id)===it.tcid;}); var _co=_tc&&(_tc.checks||[]).find(function(c){return (c.kind||'')==='connect'&&c.model&&c.model!=='공통';}); var _lab=_co?((typeof labList!=='undefined'?labList:[]).find(function(x){return x.name===_co.model&&x.ip;})):null; if(_lab) dev=_lab; }
  if(!dev){ dev=(typeof labList!=='undefined'?labList:[]).find(function(l){return l.name===cy.model&&l.ip;}); }
  return dev||null;
}
// 공용 컨텍스트: Jira 설정·프로젝트 목록·createmeta 캐시 (실행 1회당 1번 로드)
async function _cbAutoJiraCtx(){
  var cfg=null; try{ cfg=await (await fetch('/api/jira/config')).json(); }catch(e){}
  if(!cfg||!cfg.url) return null;   // Jira 미연동
  var projs=[]; try{ var pd=await (await fetch('/api/jira/projects')).json(); if(pd&&pd.ok) projs=pd.projects||[]; }catch(e){}
  if(!projs.length) return null;
  return {cfg:cfg, projs:projs, metaCache:{}};
}
// FAIL 항목 1건 자동 등록. 반환: null(살아있는 이슈 존재·변경 없음) 또는 {result:{...}|null, dirty:bool}
async function _cbAutoJiraOne(cy, it, ctx){
  var cfg=ctx.cfg, projs=ctx.projs, metaCache=ctx.metaCache;
  var dirty=false;
  // 기존 자동 등록·연결 이슈가 Jira에 아직 존재하면 건너뜀. 삭제된(404) 이슈는 마커·연결 정리 후 재등록
  var _known=[]; if(it.auto_jira&&it.auto_jira.key)_known.push(it.auto_jira.key);
  (Array.isArray(it.issues)?it.issues:[]).forEach(function(x){ if(x&&x.key&&_known.indexOf(x.key)<0)_known.push(x.key); });
  var _alive=false;
  for(var ki=0;ki<_known.length;ki++){
    var _kk=_known[ki]; var _ex=true;
    try{
      var _ed=await (await fetch('/api/jira/issue/'+encodeURIComponent(_kk))).json();
      if(_ed&&_ed.ok) _ex=true;
      else _ex=!/^404/.test(String((_ed&&_ed.error)||''));   // 404(삭제됨)만 부재 처리 — 네트워크/권한 오류는 존재로 간주(중복 방지 우선)
    }catch(e){ _ex=true; }
    if(_ex){ _alive=true; }
    else{
      if(it.auto_jira&&it.auto_jira.key===_kk) delete it.auto_jira;
      if(Array.isArray(it.issues)) it.issues=it.issues.filter(function(x){return !(x&&x.key===_kk);});
      dirty=true;
    }
  }
  if(_alive) return dirty?{result:null,dirty:true}:null;   // 살아있는 연결 이슈가 하나라도 있으면 재등록 안 함
  // 1순위: 패널 설정의 이슈 키 매핑(auto_models에 이 모델을 지정한 프로젝트) → 2순위: 장비명↔프로젝트명 자동 매칭
  var proj=null;
  try{
    var _pts=cfg.panel_templates||{}; var _mLow=String(cy.model||'').trim().toLowerCase();
    if(_mLow){ for(var _pk in _pts){ var _am=_pts[_pk]&&_pts[_pk].auto_models; if(!_am) continue; var _arr=Array.isArray(_am)?_am:String(_am).split(','); if(_arr.some(function(x){return String(x||'').trim().toLowerCase()===_mLow;})){ proj=projs.find(function(p){return p.key===_pk;})||{key:_pk,name:_pk}; break; } } }
  }catch(e){}
  if(!proj) proj=_cbJiraProjForModel(projs, cy.model);
  if(!proj) return {result:{tcid:it.tcid, summary:'['+(cy.model||'')+'] 장비명과 일치하는 Jira 프로젝트 없음 — 패널 설정의 이슈 키 매핑으로 지정 가능', ok:false, error:'프로젝트 미매칭'}, dirty:dirty};
  // Fail 자동 이슈 등록 — 프로젝트별 on/off (기본 OFF, Jira Integration › Jira 프로젝트 패널 설정에서 켬)
  var _projCfg=((cfg.panel_templates||{})[proj.key])||{};
  if(_projCfg.auto_jira!==true) return dirty?{result:null,dirty:true}:null;
  var tpl=_projCfg.defect||{};
  var itype=tpl.issuetype||'Bug';
  var defaults=tpl.field_defaults||{};
  var mkey=proj.key+'@@'+itype; var metaFields=metaCache[mkey];
  if(!metaFields){ metaFields=[]; try{ var md=await (await fetch('/api/jira/createmeta?project='+encodeURIComponent(proj.key)+'&issuetype='+encodeURIComponent(itype))).json(); if(md&&md.ok) metaFields=md.fields||[]; }catch(e){} metaCache[mkey]=metaFields; }
  // 패널 설정 기본값 → 이슈 필드 (수동 팝업 제출과 동일한 타입 매핑)
  var dyn={};
  Object.keys(defaults).forEach(function(fid){
    var v=defaults[fid]; if(v===''||v==null) return;
    var f=metaFields.find(function(x){return x.id===fid;});
    if(f&&f.options&&f.options.length) dyn[fid]=(f.type==='array')?[{id:String(v)}]:{id:String(v)};
    else if(f&&f.type==='user') dyn[fid]={name:String(v)};
    else dyn[fid]=String(v);
  });
  var summary='['+(cy.model||'')+'/'+(cy.version||'')+'] '+(it.tcid||'')+' '+(it.name||'')+' 시험 Fail';
  // Fail 장비 show running-config 선조회 — 본문(6. Kernel Log)에 첨부 링크를 넣기 위해 등록 전에 확보 (원본 그대로, 절단 없음)
  var cfgTxt='', cfgFn='';
  try{
    var dut=_cbDutForItem(cy, it);
    if(dut&&dut.ip){
      var rr=await fetch('/api/run-cli',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host:dut.ip,port:dut.port||23,protocol:dut.protocol||'telnet',username:dut.username||'',password:dut.password||'',secret:dut.secret||'',device_type:dut.device_type||'',commands:['show running-config']})});
      var rd=await rr.json();
      cfgTxt=(rd&&rd.ok&&rd.outputs&&rd.outputs[0])?String(rd.outputs[0].output||''):'';
    }
  }catch(e){}
  if(cfgTxt.trim()) cfgFn=String(it.tcid||'TC').replace(/[\\/:*?"<>|]/g,'_')+'_running-config.txt';
  // Topology 구성도 이미지·텍스트 (수동 등록과 동일한 소스)
  var _tp={img:'',text:''}; try{ _tp=_cbTopoForTc(it.tcid||''); }catch(e){}
  var useImg=!!_tp.img;
  var desc=''; try{ desc=_cbFailIssueDesc(cy,it,useImg,_tp.text); }catch(e){ desc=''; }
  if(cfgFn) desc=desc.split('{panel:title=6. Kernel Log & Syslog 조회}\n（해당 없음）').join('{panel:title=6. Kernel Log & Syslog 조회}\n[^'+cfgFn+'] — Fail 장비 show running-config 전체 출력(첨부 파일)');
  desc+='\n\n----\n자동 등록: utop Test Cycle 자동 실행 ('+(cy.version||'')+')';
  try{
    var r=await fetch('/api/jira/issue',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:proj.key, issuetype:itype, summary:summary, description:desc, labels:['utop-auto'], fields:dyn})});
    var d=await r.json();
    if(d&&d.ok){
      it.auto_jira={key:d.key,url:d.url,at:(typeof _nowStr==='function'?_nowStr():'')};
      // Test Procedure Details의 이슈 연결(수동 등록과 동일한 it.issues)에 추가 + 즉시 화면 반영
      it.issues=Array.isArray(it.issues)?it.issues:[];
      if(!it.issues.some(function(x){return x&&x.key===d.key;})) it.issues.push({key:d.key, summary:summary.slice(0,120), url:d.url, status:'Open'});
      try{ cbRefreshItems(); }catch(e2){}
      // 구성도 이미지 첨부 (본문 2.시험구성도의 !구성도.png|thumbnail! 참조 대상)
      try{ if(useImg) await fetch('/api/jira/issue/'+encodeURIComponent(d.key)+'/attach',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:'구성도.png', data:_tp.img})}); }catch(ae){}
      // running-config 원본 txt 첨부 (6. Kernel Log 패널의 [^파일] 링크 대상)
      try{ if(cfgFn){ var b64=btoa(unescape(encodeURIComponent(cfgTxt))); await fetch('/api/jira/issue/'+encodeURIComponent(d.key)+'/attach',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:cfgFn, data:b64, mime:'text/plain'})}); } }catch(ae){}
      return {result:{tcid:it.tcid, summary:summary, ok:true, key:d.key, url:d.url}, dirty:true};
    }
    return {result:{tcid:it.tcid, summary:summary, ok:false, error:String((d&&d.error)||'')}, dirty:dirty};
  }catch(e){ return {result:{tcid:it.tcid, summary:summary, ok:false, error:e.message}, dirty:dirty}; }
}
// 등록 결과 요약 모달
function _cbAJShowResults(results){
  results=(results||[]).filter(Boolean);
  if(!results.length) return;
  var okN=results.filter(function(r){return r.ok;}).length;
  var rows=results.map(function(r){ return '<div style="padding:7px 4px;border-bottom:1px solid #f0f1f3;display:flex;align-items:center;gap:8px;font-size:12.5px;">'
    +(r.ok?'<i class="ti ti-circle-check" style="color:#12b76a;"></i>':'<i class="ti ti-alert-circle" style="color:#e53e5a;"></i>')
    +'<span style="font-family:ui-monospace,monospace;color:var(--text3);">'+_bdEsc(r.tcid||'')+'</span>'
    +'<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+_bdEsc(r.summary||'')+'</span>'
    +(r.key?('<a href="'+String(r.url||'').replace(/"/g,'&quot;')+'" target="_blank" style="font-weight:800;color:#0052cc;text-decoration:none;">'+_bdEsc(r.key)+'</a>'):('<span style="font-size:11px;color:#e53e5a;">'+_bdEsc(String(r.error||'').slice(0,60))+'</span>'))
    +'</div>'; }).join('');
  if(typeof _cycleAIModal==='function') _cycleAIModal('Fail → Jira 자동 등록 ('+okN+'/'+results.length+'건 성공)', rows);
  showToast('Fail 자동 이슈 등록: '+okN+'/'+results.length+'건');
}
// 일괄 점검(안전망): 사이클들의 FAIL 항목 전부 — TC별 즉시 등록에서 누락·실패한 건만 새로 등록됨
async function _cbAutoJiraFails(cys){
  try{
    cys=(cys||[]).filter(Boolean); if(!cys.length) return;
    var jobs=[];
    cys.forEach(function(cy){ (cy.items||[]).forEach(function(it){ try{ if(_cbItemStatusKey(it)==='FAIL') jobs.push({cy:cy,it:it}); }catch(e){} }); });
    if(!jobs.length) return;
    var ctx=await _cbAutoJiraCtx(); if(!ctx) return;
    var results=[]; var _dirty=new Set();
    for(var i=0;i<jobs.length;i++){
      var r1=await _cbAutoJiraOne(jobs[i].cy, jobs[i].it, ctx);
      if(!r1) continue;
      if(r1.dirty) _dirty.add(jobs[i].cy);
      if(r1.result) results.push(r1.result);
    }
    for(const c2 of _dirty){ try{ await saveCycle(c2); }catch(e){} }   // 등록 키·이슈 연결·정리분 저장
    try{ if(_dirty.size && typeof loadCycleData==='function') await loadCycleData(); }catch(e){}   // 서버 상태 재동기화
    try{ cbRefreshItems(); }catch(e){}
    _cbAJShowResults(results);
  }catch(e){ try{ console.warn('[cb-auto-jira]', e); }catch(_e){} }
}
// ── 사이클 자동 실행 상태 (메모리). 새로고침 시 초기화 ──
let _cbRunCycleIds=[], _cbRunActive=false, _cbRunAllKeys=[], _cbRunDoneKeys=[];
var _cbRunAbort=false;   // 사용자가 사이클 실행 중 중지 요청 → 다음 아이템으로 넘어가지 않도록 플래그

// ── 자동 실행 진행 상태를 다른 접속자에게 중계 (서버 → WebSocket broadcast) ──
function _cbRunNotify(evt, extra){
  try{
    const body=Object.assign({evt:evt, ids:(_cbRunCycleIds||[]).slice(), key:_cbRunKey||'',
      user:(typeof currentUser!=='undefined'&&currentUser&&(currentUser.name||currentUser.username))||''}, extra||{});
    fetch('/api/cycle-run-progress',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      .then(function(r){ if(!r.ok) console.warn('[cb-run-notify] HTTP '+r.status+' — 백엔드 재시작이 필요할 수 있습니다 (/api/cycle-run-progress)'); })
      .catch(function(e){ console.warn('[cb-run-notify]', e); });
  }catch(e){}
}

// ── 다른 사용자의 자동 실행 진행 상태 수신 (01-core.js handleWS → cb_run_progress) ──
let _cbRemote=null, _cbRemoteRefT=null;
function cbRemoteRunOnWS(m){
  // 대시보드는 자기 자신 실행이든 다른 사용자 실행이든 모두 표시 (self skip 전에 처리)
  try{ if(typeof dashboardOnCycleRunProgress==='function') dashboardOnCycleRunProgress(m); }catch(_e){}
  if(_cbRunActive) return;   // 내가 실행 주체면 내 로컬 상태가 우선 (자기 브로드캐스트 무시)
  if(m.evt==='done'){
    _cbRemote=null;
    try{ cbRunBanner('✅ '+(m.user?_bdEsc(m.user)+' 님의 ':'')+'Test Cycle 실행 완료 ('+(m.total||0)+')', false, 3500); }catch(e){}
    try{ _cbRunOverlaySync(); }catch(e){}
    _cbRemoteRefresh(true);
    return;
  }
  var _prev=_cbRemote||{};
  _cbRemote={ids:Array.isArray(m.ids)?m.ids:[], key:m.key||_prev.key||'', user:m.user||_prev.user||'', ts:Date.now(),
    stepIdx:(m.stepIdx!=null?m.stepIdx:_prev.stepIdx), stepCnt:(m.stepCnt!=null?m.stepCnt:_prev.stepCnt),
    stepName:m.stepName||_prev.stepName||'', stepAction:m.stepAction||_prev.stepAction||'', stepOutput:m.stepOutput||_prev.stepOutput||''};
  try{ console.log('[cb_run_progress 수신]', m.evt, m.user||'', (m.done||0)+'/'+(m.total||0), m.name||'', (m.stepIdx!=null?'step '+(m.stepIdx+1)+'/'+m.stepCnt:'')); }catch(e){}
  var _bnStep=(_cbRemote.stepIdx!=null)?(' · <span style="opacity:0.9;">Step '+(_cbRemote.stepIdx+1)+'/'+(_cbRemote.stepCnt||'?')+' '+_bdEsc((_cbRemote.stepName||'').slice(0,50))+'</span>'):'';
  try{ cbRunBanner(_cbDot('#ff5b5b')+' '+(m.user?'<b>'+_bdEsc(m.user)+'</b> 님이 ':'')+'Test Cycle 자동 실행 중'+(m.name?' — '+_bdEsc(m.name):'')+' ('+(m.done||0)+'/'+(m.total||0)+')'+_bnStep, true); }catch(e){}
  try{ _cbRunOverlaySync(); }catch(e){}
  try{ if(typeof _cbRunProgSet==='function') _cbRunProgSet(m.done||0, m.total||0, m.name||''); }catch(e){}
  // 원격 실행 스텝 강조: 현재 화면이 그 사이클/아이템 열려있으면 스텝 인덱스와 output 을 즉시 반영
  if(m.evt==='step' || m.evt==='waitTick'){ _cbRemoteApplyStep(); }
  // TC 전환(evt='tc') 시엔 사이클 아이템도 자동 선택 → Test Procedure Details 렌더
  if(m.evt==='tc' && m.key){
    try{
      if(_cbRemoteIsCurTarget()){
        cbSelItem=m.key; _cbRunKey=m.key; _cbRunStep=-1;
        var _dt=document.getElementById('cb-detail'); if(_dt) _dt.innerHTML=cbExecHtml();
        var _c2=document.getElementById('cb-col2body'); if(_c2) _c2.innerHTML=cbCol2Html();
      }
    }catch(_te){}
  }
  _cbRemoteRefresh(false);
}
// 원격 스텝 진행: 현재 화면이 그 아이템을 열어놓았으면 output 갱신 + 하이라이트 이동
function _cbRemoteApplyStep(){
  try{
    if(!_cbRemote || _cbRemote.stepIdx==null) return;
    if(!_cbRemoteIsCurTarget()) return;
    // 시청자가 아이템을 아직 안 열어놓았어도 자동으로 실행 중 아이템 선택
    if(_cbRemote.key && cbSelItem!==_cbRemote.key){ cbSelItem=_cbRemote.key; _cbRunKey=_cbRemote.key; }
    if(!cbSelItem) return;
    var o=cbResolve(cbSelItem); if(!o||!o.it) return;
    var _steps=o.it.steps||[]; var i=_cbRemote.stepIdx;
    if(i>=0 && i<_steps.length){
      if(_cbRemote.stepOutput) _steps[i].output=_cbRemote.stepOutput;
      if(_cbRemote.stepName && (_steps[i].action||'')==='메시지' && !_steps[i].output) _steps[i].output=_cbRemote.stepName;
      _cbRunStep=i;
      var _dt=document.getElementById('cb-detail'); if(_dt){ var _stp=_dt.scrollTop; _dt.innerHTML=cbExecHtml(); _dt.scrollTop=_stp; setTimeout(_cbScrollToRunStep, 30); }
      // 좌측 아이템 리스트도 실행 아이템으로 강조
      try{ var _ei=document.getElementById('cb-items'); if(_ei) _ei.innerHTML=cbItemsHtml(); }catch(_ie){}
    }
  }catch(_e){}
}
function _cbRemoteIsCurTarget(){
  try{
    if(!_cbRemote||!(_cbRemote.ids||[]).length) return false;
    // 1) 현재 선택된 사이클(필터로 특정된 하나) 이 실행 대상이면 target
    const cy=(typeof cbCurrentCycle==='function')?cbCurrentCycle():null;
    if(cy&&cy.id&&_cbRemote.ids.indexOf(cy.id)>=0) return true;
    // 2) cycle 페이지가 활성화돼 있으면 (필터로 사이클 특정 안 됐어도) 오버레이 표시 — 시청자가 어떤 사이클 열어놔도 진행 알림
    const pg=document.getElementById('page-cycle');
    if(pg && pg.classList.contains('active')) return true;
    return false;
  }catch(e){ return false; }
}
// 수신자 화면 갱신: 사이클 데이터 재로드 + 보드가 열려 있으면 트리·중앙 재렌더 (디바운스)
function _cbRemoteRefresh(final){
  clearTimeout(_cbRemoteRefT);
  _cbRemoteRefT=setTimeout(async function(){
    try{
      if(typeof loadCycleData==='function') await loadCycleData();
      const pg=document.getElementById('page-cycle');
      if(pg&&pg.classList.contains('active')&&!_cbRunActive){
        const _t0=document.getElementById('cb-tree'); if(_t0&&typeof cbTreeHtml==='function')_t0.innerHTML=cbTreeHtml();
        const _c2=document.getElementById('cb-col2body'); if(_c2&&typeof cbCol2Html==='function')_c2.innerHTML=cbCol2Html();
        if(final){ const _dt=document.getElementById('cb-detail'); if(_dt&&typeof cbExecHtml==='function')_dt.innerHTML=cbExecHtml(); }
        try{ _cbRunOverlaySync(); }catch(e){}
      }
    }catch(e){}
  }, final?300:1500);
}
// 원격 중지 요청 수신 — 실행 주체(내가 실행자)면 내 사이클을 중지, 시청자는 배너만 갱신.
function cbRemoteStopOnWS(m){
  try{
    var _who=(m&&m.user)?_bdEsc(m.user):'다른 사용자';
    if(_cbRunActive){
      // 나에게 도착한 중지 요청 → 내 실행 중단
      try{ cbRunBanner('⏹ '+_who+' 님이 Test Cycle 중지 요청 — 현재 스텝 종료 후 정지', false, 3500); }catch(e){}
      try{
        // 사이클 abort 플래그 + 현재 TC 실행 중지 (tcCheckRunStop 은 사이클 abort 도 세팅)
        _cbRunAbort=true; _cbRunActive=false;
        if(_cycleLiveCtx && _cycleLiveCtx.tcid && typeof tcCheckRunStop==='function'){
          tcCheckRunStop(_cycleLiveCtx.tcid);
        }
        if(typeof _cbRunClearState==='function') _cbRunClearState();
        if(typeof _cbRunOverlayHide==='function') _cbRunOverlayHide();
      }catch(_se){}
    } else {
      try{ cbRunBanner('⏹ '+_who+' 님이 Test Cycle 중지 요청함', false, 3500); }catch(e){}
      try{ _cbRemote=null; _cbRunOverlayHide(); }catch(_e){}
    }
  }catch(_e){}
}
// 시청자가 실행 중인 사이클을 원격 중지 요청 — 서버에 POST → 서버가 실행자에게 WS 브로드캐스트 → 실행자 브라우저가 자동 정지.
async function cbRemoteStopRequest(){
  if(!_cbRemote){ if(typeof showToast==='function') showToast('진행 중인 원격 실행이 없습니다'); return; }
  var _who=_cbRemote.user||'실행자';
  if(!confirm(_who+' 님이 진행 중인 Test Cycle 을 원격으로 중지할까요?\n(현재 스텝은 종료된 뒤 정지됩니다)')) return;
  try{
    var r=await fetch('/api/cycle-run-stop?token='+encodeURIComponent(typeof authToken!=='undefined'?authToken:''),{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({reason:'viewer requested'})
    });
    if(r.ok){ if(typeof showToast==='function') showToast('⏹ 중지 요청 전송됨'); }
    else { if(typeof showToast==='function') showToast('중지 요청 실패: HTTP '+r.status); }
  }catch(e){ if(typeof showToast==='function') showToast('중지 요청 오류: '+e.message); }
}
// 새로고침 복원: 서버에 저장된 마지막 실행 진행 상태(GET /api/cycle-run-progress)를 가져와 배너·오버레이 재표시
async function _cbRemoteRestore(){
  try{
    if(_cbRunActive||_cbRemote) return;
    const r=await fetch('/api/cycle-run-progress'); if(!r.ok) return;
    const d=await r.json(); const st=d&&d.state;
    if(!st||!st.evt||st.evt==='done') return;
    const me=(typeof currentUser!=='undefined'&&currentUser&&(currentUser.name||currentUser.username))||'';
    if(me&&st.user===me) return;   // 내 실행은 로컬 재개 로직(utop_cb_runpos)이 담당
    cbRemoteRunOnWS(st);
  }catch(e){}
}
setTimeout(function(){ try{ _cbRemoteRestore(); }catch(e){} }, 1500);   // 부팅 직후 1회 (currentUser 로드 대기)
let _cbResumeBannerShown=false;   // 부팅(전체 새로고침) 후 "이어서 실행" 배너를 1회만 표시하기 위한 가드 (SPA 나갔다 복귀 시 재트리거 방지)
// 실행 상태 저장(전체 keys + 완료 keys + 실행위치) → 새로고침 후 강조·스텝 복원 + 미완료 TC부터 자동 재개
function _cbRunSaveState(){ try{ if(_cbRunActive || _cbRunKey!=null){
  var _intr=(_cbRunActive && _cbRunKey!=null && _cbRunDoneKeys.indexOf(_cbRunKey)<0)?_cbRunKey:null;   // 실행 중(부분 실행)이라 아직 완료 안 된 TC = 중단 TC 후보
  localStorage.setItem('utop_cb_runpos',JSON.stringify({key:_cbRunKey,step:_cbRunStep,ids:_cbRunCycleIds,keys:_cbRunAllKeys,done:_cbRunDoneKeys,interrupted:_intr,active:!!_cbRunActive}));
} }catch(e){} }
function _cbRunClearState(){ try{ localStorage.removeItem('utop_cb_runpos'); }catch(e){} }
function _cbRunGetState(){ try{ const s=localStorage.getItem('utop_cb_runpos'); return s?JSON.parse(s):null; }catch(e){ return null; } }
// 새로고침 후 1회: 저장된 실행 지점을 메모리로 복원(강조·스텝 표시).
function _cbRunRestore(){
  if(_cbRunActive) return;   // 실제 실행 중이면 복원 불필요
  const st=_cbRunGetState(); if(!st||st.key==null) return;
  const o=(typeof cbResolve==='function')?cbResolve(st.key):null;
  if(!o||!o.it||!o.cy){ _cbRunClearState(); return; }   // 사이클/항목이 사라졌으면 복원 취소
  _cbRunKey=st.key; _cbRunStep=(st.step!=null?st.step:-1); _cbRunCycleIds=Array.isArray(st.ids)?st.ids:[st.key.split('@@')[0]]; _cbRunAllKeys=Array.isArray(st.keys)?st.keys:[st.key]; _cbRunDoneKeys=Array.isArray(st.done)?st.done:[];
  cbSelItem=_cbRunKey;   // 강조 조건(cbSelItem===_cbRunKey)에 맞춤
  // 트리 선택을 실행 사이클로 맞춰 강조/스텝이 상세 패널에 보이도록
  try{ const cy=o.cy; cbSel.project=''; cbSel.mgroup=(typeof _cycMGroup==='function'?_cycMGroup(cy):(cy.model||'')); cbSel.model=cy.model||''; cbSel.vgroup=cy.version_group||'(미분류)'; cbSel.version=cy.version||'';
    if(cbSel.mgroup){ cbTreeOpen.add('mg@@'+cbSel.mgroup); cbTreeOpen.add('m@@'+cbSel.mgroup+'@@'+cbSel.model); if(cbSel.vgroup) cbTreeOpen.add('g@@'+cbSel.mgroup+'@@'+cbSel.model+'@@'+cbSel.vgroup); }
  }catch(e){}
}
// 남은(미완료) TC key 목록 계산 (완료 기록 없는 TC만)
function _cbResumeRemain(st){
  const keys=Array.isArray(st.keys)?st.keys:(st.key?[st.key]:[]);
  const done=Array.isArray(st.done)?st.done:[];
  return keys.filter(function(k){ if(done.indexOf(k)>=0) return false; const o=(typeof cbResolve==='function')?cbResolve(k):null; return !!(o&&o.it); });
}
// 이어실행 대상 = 미완료 TC 전체(중단된 아이템 포함) — 실행 중 새로고침 되면 그 아이템 처음부터 재실행됨.
// 계측기/SNMP 재실행 위험은 있지만, 사용자가 원하는 "중단 아이템부터 이어서 실행" 을 우선.
function _cbResumeUnstarted(st){ return _cbResumeRemain(st); }
// 새로고침으로 중단된 실행 → 사이클은 계속 진행하되 false-FAIL은 막는다:
//  · 미착수 TC(한 번도 안 돈 것)는 상태 오염이 없으므로 자동으로 이어서 실행 → 사이클 계속 진행
//  · 이미 완료된 TC는 재실행 안 함(done-key, 서버 저장됨)
//  · 중단 순간 부분 실행 중이던 TC 1개만 격리(자동 재실행 금지) → 계측기/SNMP/설정 재실행 FAIL 방지.
//    그 1개는 사용자가 계측기·장비 상태 확인 후 [이 TC 다시 실행] 버튼으로만 재개.
// SPA 내 페이지 이동(나갔다 복귀)에서는 _cbRunActive 가드로 절대 트리거되지 않는다.
function _cbRunResume(){
  if(_cbRunActive) return;                 // 메모리 루프 생존(정상 SPA) → 아무 것도 안 함
  if(_cbResumeBannerShown) return;         // 부팅 후 1회만
  const st=_cbRunGetState();
  if(!st||!st.active){ _cbRunResumeBannerHide(); return; }
  const unstarted=_cbResumeUnstarted(st);  // 미착수 TC (자동 계속 안전)
  const intr=st.interrupted||null;         // 부분 실행된 중단 TC 1개
  const hasIntr=!!(intr && (function(){ var o=cbResolve(intr); return o&&o.it; })());
  if(!unstarted.length && !hasIntr){ _cbRunClearState(); return; }   // 남은 게 없으면 종료
  _cbResumeBannerShown=true;
  _cbRunDoneKeys=(Array.isArray(st.done)?st.done:[]).slice();
  _cbRunAllKeys=(Array.isArray(st.keys)?st.keys:[]).slice();
  if(unstarted.length){
    // ★ 미완료 TC(중단 아이템 포함) 자동으로 이어서 실행 → 중단된 아이템은 그 아이템의 처음 스텝부터 다시.
    _cbRunResumeBannerShow(unstarted.length, hasIntr?intr:null);
    if(typeof _cbAutoRunGo==='function') _cbAutoRunGo(unstarted, true);
  }
}
// 중단 TC 1개만 사용자 동의 하에 재개 (계측기/장비 상태 확인 후). 그 TC는 처음 Step부터 다시 실행됨.
function _cbRunResumeInterrupted(){
  if(_cbRunActive) return;
  const st=_cbRunGetState(); const intr=st&&st.interrupted; if(!intr){ _cbRunResumeBannerHide(); return; }
  const o=cbResolve(intr); if(!o||!o.it){ _cbRunResumeBannerHide(); return; }
  _cbRunResumeBannerHide();
  _cbRunDoneKeys=(st&&Array.isArray(st.done)?st.done:[]).slice(); _cbRunAllKeys=(st&&Array.isArray(st.keys)?st.keys:[]).slice();
  const _i=_cbRunDoneKeys.indexOf(intr); if(_i>=0) _cbRunDoneKeys.splice(_i,1);   // done 마킹 해제 → 이 TC를 실제 실행
  if(typeof _cbAutoRunGo==='function') _cbAutoRunGo([intr], true);
}
// 재개 안내 배너: 미착수 TC는 자동 진행 중임을 알리고, 중단 TC 1개는 수동 재실행 버튼 제공
function _cbRunResumeBannerShow(unstartedCount, interruptedKey){
  const host=document.getElementById('cb-col-2'); if(!host) return;
  if(getComputedStyle(host).position==='static') host.style.position='relative';
  _cbRunResumeBannerHide();
  let msg='', btn='';
  const _intrName=(function(){ try{ if(!interruptedKey)return ''; const o=cbResolve(interruptedKey); return (o&&o.it)?(o.it.name||o.it.tcid||''):''; }catch(e){ return ''; } })();
  if(unstartedCount>0){
    msg='새로고침으로 중단됐던 시험을 <b>미실행 '+unstartedCount+'개</b>부터 자동으로 이어서 실행합니다.';
    if(interruptedKey) msg+=' 진행 중이던 TC(<b>'+_bdEsc(_intrName)+'</b>)는 계측기·장비 상태 확인이 필요해 자동 실행에서 제외했습니다. 상태 확인 후 [이 TC 다시 실행]을 누르세요.';
  } else if(interruptedKey){
    msg='진행 중이던 TC(<b>'+_bdEsc(_intrName)+'</b>)가 남아 있습니다. 계측기·장비 상태를 확인한 뒤 [이 TC 다시 실행]을 누르세요. <b>처음 Step부터 다시 실행</b>됩니다.';
  }
  if(interruptedKey) btn='<button id="cb-resume-intr" style="padding:6px 15px;border:0;border-radius:6px;background:#2d6fd4;color:#fff;font-weight:700;cursor:pointer;white-space:nowrap;"><i class="ti ti-player-play"></i> 이 TC 다시 실행</button>';
  const b=document.createElement('div'); b.id='cb-resume-banner';
  b.style.cssText='position:absolute;left:0;right:0;top:0;z-index:55;margin:0;padding:10px 14px;border-bottom:1px solid #e6c200;background:#fff8dc;display:flex;align-items:center;gap:12px;font-size:12.5px;color:#5a4b00;box-shadow:0 2px 6px rgba(0,0,0,0.08);';
  b.innerHTML='<i class="ti ti-alert-triangle" style="font-size:16px;color:#c79a00;flex-shrink:0;"></i>'
    +'<span style="flex:1;line-height:1.5;">'+msg+'</span>'+btn
    +'<button id="cb-resume-cancel" style="padding:6px 12px;border:1px solid var(--border);border-radius:6px;background:#fff;color:var(--text2);cursor:pointer;white-space:nowrap;">닫기</button>';
  host.insertBefore(b, host.firstChild);
  const gi=document.getElementById('cb-resume-intr'); if(gi) gi.onclick=function(){ if(typeof _cbRunResumeInterrupted==='function') _cbRunResumeInterrupted(); };
  const cx=document.getElementById('cb-resume-cancel'); if(cx) cx.onclick=function(){ _cbRunResumeBannerHide(); };
}
function _cbRunResumeBannerHide(){ const b=document.getElementById('cb-resume-banner'); if(b) b.remove(); }
// 지금 실행 루프가 돌고 있고(_cbRunActive) + 현재 보고 있는 사이클이 이번 실행 대상인지
function _cbCurCycleIsRunTarget(){ try{ if(!_cbRunCycleIds.length) return false; const cy=(typeof cbCurrentCycle==='function')?cbCurrentCycle():null; return !!(cy&&cy.id&&_cbRunCycleIds.indexOf(cy.id)>=0); }catch(e){ return false; } }
// ── 자동 실행 중 오버레이: Test Execution(cb-col-2)만 흐리게 + "진행 중" (다른 상호작용 차단, 글로우/빨간강조 없음) ──
function _cbRunOverlayShow(){
  const host=document.getElementById('cb-col-2'); if(!host) return;
  if(getComputedStyle(host).position==='static') host.style.position='relative';
  if(document.getElementById('cb-run-overlay')) return;
  if(!document.getElementById('cb-run-overlay-css')){
    const st=document.createElement('style'); st.id='cb-run-overlay-css';
    st.textContent='@keyframes cbRunSpin{to{transform:rotate(360deg);}}';
    (document.head||document.body).appendChild(st);
  }
  const ov=document.createElement('div'); ov.id='cb-run-overlay';
  ov.style.cssText='position:absolute;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(240,243,248,0.55);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);cursor:progress;';
  ov.addEventListener('click',function(e){ var t=e.target; if(t && (t.tagName==='BUTTON' || (t.closest && t.closest('button')))) return; e.stopPropagation(); e.preventDefault(); },true);
  ov.addEventListener('contextmenu',function(e){ e.preventDefault(); });
  // 시청자(내가 실행자 아닐 때)에겐 원격 중지 버튼 노출 → 서버 API로 실행자 브라우저에 stop 신호 전송
  var _isViewer=(!_cbRunActive && _cbRemote);
  var _runnerName=(_cbRemote&&_cbRemote.user)?_bdEsc(_cbRemote.user):'';
  var _stopBtn=_isViewer?('<button onclick="cbRemoteStopRequest()" title="이 사이클 실행을 원격으로 중지 요청" style="margin-top:6px;background:#e53e5a;color:#fff;border:none;border-radius:9px;padding:9px 18px;font-size:13px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:6px;"><i class="ti ti-player-stop-filled" style="font-size:14px;"></i> 원격 중지</button>'):'';
  ov.innerHTML='<div style="display:flex;flex-direction:column;align-items:center;gap:18px;padding:44px 68px;border-radius:20px;background:#fff;border:1px solid var(--border);box-shadow:0 12px 44px rgba(0,0,0,0.18);">'
    +'<div style="position:relative;width:76px;height:76px;">'
      +'<div style="position:absolute;inset:0;border-radius:50%;border:6px solid #e6e0ff;border-top-color:#7c5cff;animation:cbRunSpin 0.9s linear infinite;"></div>'
      +'<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#7c5cff;"><i class="ti ti-sparkles" style="font-size:30px;"></i></div>'
    +'</div>'
    +'<div style="font-size:23px;font-weight:800;color:#2d3a55;letter-spacing:-0.3px;">AI Test Cycle Running…</div>'
    +(_runnerName?('<div style="font-size:12px;color:var(--text3);margin-top:-8px;">실행자: <b style="color:#2d3a55;">'+_runnerName+'</b></div>'):'')
    +'<div id="cb-run-progress" style="width:340px;">'+_cbRunProgHtml()+'</div>'
    +_stopBtn
  +'</div>';
  // 오버레이 자체는 조작 잠금이지만, 원격 중지 버튼 클릭은 통과해야 함
  ov.addEventListener('click', function(e){
    var t=e.target;
    if(t && (t.tagName==='BUTTON' || (t.closest && t.closest('button')))) return;   // 버튼 클릭은 허용
  }, false);
  host.appendChild(ov);
}
// 진행률 상태 (전역): 오버레이가 다시 그려져도 유지
var _cbRunProgDone=0, _cbRunProgTotal=0, _cbRunProgName='';
function _cbRunProgHtml(){
  var total=_cbRunProgTotal||0, done=_cbRunProgDone||0;
  var pct=total?Math.round(done/total*100):0;
  return '<div style="font-size:15px;font-weight:700;color:#2d3a55;text-align:center;margin-bottom:10px;">총 '+total+'항목 중 <span style="color:#7c5cff;">'+done+'항목</span> 진행 <span style="color:#7c5cff;">('+pct+'%)</span></div>'
    +'<div style="height:10px;border-radius:6px;background:#e6e0ff;overflow:hidden;"><div style="height:100%;width:'+pct+'%;background:linear-gradient(90deg,#7c5cff,#4f8ae8);border-radius:6px;transition:width .3s;"></div></div>'
    +(_cbRunProgName?'<div style="font-size:12px;color:var(--text3);text-align:center;margin-top:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><i class="ti ti-player-play" style="font-size:12px;"></i> '+_bdEsc(_cbRunProgName)+'</div>':'');
}
// 진행률 갱신: 루프에서 호출. 오버레이의 진행 영역만 다시 그림(오버레이 재생성 안 함)
function _cbRunProgSet(done, total, name){
  _cbRunProgDone=done||0; _cbRunProgTotal=total||0; if(name!=null)_cbRunProgName=name;
  var box=document.getElementById('cb-run-progress'); if(box) box.innerHTML=_cbRunProgHtml();
}
function _cbRunOverlayHide(){ const ov=document.getElementById('cb-run-overlay'); if(ov) ov.remove(); }
// 보드 재렌더 후: 실행 루프가 돌고 있고 + 지금 보는 사이클이 실행 대상일 때만 "진행 중" 표시.
// (다른 버전으로 이동하면 숨김 / 새로고침 시 _cbRunning·_cbRunCycleIds 초기화 → 안 뜸)
function _cbRunOverlaySync(){
  // 실행자·시청자 모두: 현재 화면 사이클이 실행 대상이면 "AI Test Cycle Running…" 오버레이 표시
  if((_cbRunActive && _cbCurCycleIsRunTarget()) || (typeof _cbRemoteIsCurTarget==='function' && _cbRemoteIsCurTarget())) _cbRunOverlayShow();
  else _cbRunOverlayHide();
}
let _cbDoneLogged=new Set();
function _cbCheckComplete(cy){
  if(!cy) return;
  const st=cycleCalcStats(cy.items||[]);
  if(st.inScope>0 && st.progress>=100){
    if(!_cbDoneLogged.has(cy.id)){ _cbDoneLogged.add(cy.id);
      cbLogStep('🏁 '+((cy.model?cy.model+' · ':'')+(cy.version||''))+' — 시험 완료', '합격 '+st.pass+' · 불합격 '+st.fail+' · 제외 '+st.exclude+' (100%)', (st.fail===0?'Pass':'Fail'), 'auto');
    }
  } else { _cbDoneLogged.delete(cy.id); }
}
function cbShowRunSummary(s){
  let m=document.getElementById('cb-run-summary'); if(m)m.remove();
  m=document.createElement('div'); m.id='cb-run-summary'; m.className='modal-overlay'; m.style.display='flex';
  m.addEventListener('click',function(e){ if(e.target===m)m.remove(); });
  const rate=s.total?Math.round(s.pass/s.total*100):0;
  const ok=s.fail===0;
  m.innerHTML='<div onclick="event.stopPropagation()" style="width:430px;max-width:92vw;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.4);">'
    +'<div style="padding:16px 20px;background:linear-gradient(135deg,'+(ok?'#00a872,#19c98a':'#e8820c,#f0a93a')+');color:#fff;display:flex;align-items:center;gap:11px;"><i class="ti '+(ok?'ti-circle-check':'ti-alert-triangle')+'" style="font-size:26px;"></i><div><div style="font-size:16px;font-weight:800;">AI Test Cycle Completed</div><div style="font-size:13.5px;font-weight:700;opacity:0.97;margin-top:2px;">Total '+s.total+' TC · Pass rate '+rate+'%</div></div></div>'
    +'<div style="padding:18px 20px;display:flex;gap:10px;">'
      +'<div style="flex:1;text-align:center;background:#eafaf2;border-radius:10px;padding:13px 6px;"><div style="font-size:25px;font-weight:800;color:#00a872;line-height:1;">'+s.pass+'</div><div style="font-size:11px;color:#00875a;font-weight:700;margin-top:5px;">PASS</div></div>'
      +'<div style="flex:1;text-align:center;background:#fdecee;border-radius:10px;padding:13px 6px;"><div style="font-size:25px;font-weight:800;color:#e53e5a;line-height:1;">'+s.fail+'</div><div style="font-size:11px;color:#e53e5a;font-weight:700;margin-top:5px;">FAIL</div></div>'
      +'<div style="flex:1;text-align:center;background:#f1f3f6;border-radius:10px;padding:13px 6px;"><div style="font-size:25px;font-weight:800;color:#8a92a0;line-height:1;">'+s.other+'</div><div style="font-size:11px;color:#8a92a0;font-weight:700;margin-top:5px;">Excl.</div></div>'
    +'</div>'
    +(s.noDev?'<div style="margin:0 20px 6px;padding:8px 11px;background:#fff7e6;border-radius:8px;font-size:11.5px;color:#b5730a;"><i class="ti ti-alert-triangle"></i> '+s.noDev+' model(s) skipped — no registered device</div>':'')
    +'<div style="padding:8px 20px 18px;display:flex;gap:8px;justify-content:flex-end;"><button onclick="cbShowRunLog()" style="font-size:12.5px;padding:8px 16px;border-radius:8px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;font-weight:600;"><i class="ti ti-terminal-2"></i> View Log</button><button onclick="document.getElementById(\'cb-run-summary\').remove()" style="font-size:13px;padding:8px 22px;border-radius:8px;border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:700;">OK</button></div>'
  +'</div>';
  document.body.appendChild(m);
}
// 'View Log': 팝업 닫고 3열(Test Procedure Details)을 History(이력) 탭으로 전환
function cbShowRunLog(){
  var pop=document.getElementById('cb-run-summary'); if(pop)pop.remove();
  try{
    if(typeof cbSetDetailTab==='function'){ cbSetDetailTab('history'); }   // 3열을 이력 탭으로
    else { _cbRefTab='history'; var dt=document.getElementById('cb-detail'); if(dt)dt.innerHTML=cbExecHtml(); }
    var host=document.getElementById('cb-col-3')||document.getElementById('cb-detail');
    if(host) host.scrollIntoView({behavior:'smooth',block:'nearest'});
  }catch(e){ try{ showToast('이력 화면을 열 수 없습니다'); }catch(_){} }
}
function _stepStatusKey(result){ if(!result)return '예정'; if(result==='미구현'||result==='미지원'||result==='제외')return result; const v=resultVerdict(result); if(v==='pass')return 'PASS'; if(v==='fail')return 'FAIL'; return '제외'; }
// Actual Data에서 판정기준 토큰을 결과색(Pass=초록/Fail=빨강)으로 강조
function _cbHlOut(output, toks, verdict){
  let h=_bdEsc(output);
  if(!toks||!toks.length||!verdict) return h;
  const bg=verdict==='fail'?'rgba(229,62,90,0.28)':'rgba(0,168,114,0.32)';
  const fg=verdict==='fail'?'#a01f33':'#04543a';
  const raw=String(output||'');
  toks.filter(Boolean).slice().sort(function(a,b){return String(b).length-String(a).length;}).forEach(function(t){
    let target=String(t);
    if(raw.indexOf(target)<0){ // 판정기준이 출력에 정확히 없으면(=Fail 유발) 가장 가까운 부분을 강조
      let best=''; for(var len=target.length-1; len>=3; len--){ var p=target.slice(0,len); if(raw.indexOf(p)>=0){ best=p; break; } }
      if(!best){ for(var s=1; s<=target.length-3; s++){ var q=target.slice(s); if(q.length>=3 && raw.indexOf(q)>=0){ best=q; break; } } }
      target=best;
    }
    if(!target) return; const et=_bdEsc(target); if(!String(et).trim()) return;
    try{ const re=new RegExp(String(et).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'); h=h.replace(re,'<span style="background:'+bg+';color:'+fg+';font-weight:700;border-radius:2px;">$&</span>'); }catch(e){} });
  return h;
}
function cbToggleRefTab(t){ _cbRefTab=(_cbRefTab===t)?'':t; const dt=document.getElementById('cb-detail'); if(dt)dt.innerHTML=cbExecHtml(); const cb=document.getElementById('cb-exec'); if(cb&&!dt)cb.innerHTML=cbExecHtml(); }
function cbSetDetailTab(t){ _cbRefTab=t||'proc'; const dt=document.getElementById('cb-detail'); if(dt)dt.innerHTML=cbExecHtml(); }   // 세로 레일 탭 선택
// Test Procedure Details 렌더 창 (창 크기): 접속·화면 이동 시 50 리셋, 사용자가 [더 보기] 눌러 확장
var _cbExecLimit=50; var _cbExecShowAll=false;
function cbExecMore(add){ _cbExecLimit+=(parseInt(add,10)||50); var dt=document.getElementById('cb-detail'); if(dt) dt.innerHTML=cbExecHtml(); }
function cbExecShowAll(){ _cbExecShowAll=true; var dt=document.getElementById('cb-detail'); if(dt) dt.innerHTML=cbExecHtml(); setTimeout(function(){ _cbExecShowAll=false; }, 100); }
// 스텝별 부분 갱신 — 실행 진행 이벤트마다 전체 재렌더 대신 바뀐 스텝만 outerHTML 교체.
// 매우 큰 실행(for 1000회 등)에서 성능 저하 없이 진행 상태 실시간 반영.
// prevOi: 이전 실행 스텝 (강조 해제 위해). curOi: 현재 실행 스텝. 각각 -1 이면 스킵.
function _cbUpdateStep(oi){
  try{
    if(oi==null || oi<0) return false;
    if(cbSelItem==null) return false;
    var el=document.querySelector('#cb-detail [data-cbstep="'+oi+'"]');
    if(!el) return false;
    // 해당 스텝을 찾기 위해 window._cbCurSteps (마지막 cbExecHtml 실행 시 캐시) 사용.
    // 없으면 전체 재렌더 필요 → false 반환하여 상위에서 fallback.
    var _steps=window._cbCurSteps, _fn=window._cbRenderOneStepClosure;
    if(!_steps||!_fn) return false;
    var _p=null, _si=-1;
    for(var i=0;i<_steps.length;i++){ if(_steps[i].oi===oi){ _p=_steps[i]; _si=i; break; } }
    if(!_p) return false;
    // 클로저는 sp를 참조로 갖고 있으므로 사이클 아이템의 최신 스텝 데이터로 다시 만들어 넘김
    var o=cbResolve(cbSelItem); if(!o||!o.it) return false;
    var _sp=(o.it.steps||[])[oi]; if(_sp) _p.sp=_sp;
    var _html=_fn(_p, _si);
    var _tmp=document.createElement('div'); _tmp.innerHTML=_html;
    var _fresh=_tmp.firstElementChild;
    if(!_fresh) return false;
    el.replaceWith(_fresh);
    return true;
  }catch(e){ return false; }
}
// 실행 스텝 이동: 이전 스텝 강조 해제 + 새 스텝 강조 (전체 재렌더 없이)
function _cbMoveRunStep(prevOi, curOi){
  var _ok1=(prevOi!=null && prevOi>=0)?_cbUpdateStep(prevOi):true;
  var _ok2=(curOi!=null && curOi>=0)?_cbUpdateStep(curOi):true;
  return _ok1 && _ok2;
}
// TC 참고 읽기전용 렌더 — 편집 위젯/init 없이 텍스트·이미지·요약만 (수정은 TC 관리 화면에서)
function _cbRefView(tc, tab){
  if(!tc) return ''; const e=_bdEsc; const _none='<div style="color:var(--text3);font-size:12px;padding:4px 2px;">내용 없음</div>';
  if(tab==='env'){
    const obj=String(tc.object_html||tc.object||'').trim(); const pre=String(tc.precondition_html||tc.precondition||'').trim();
    return '<div style="margin-bottom:12px;"><div style="font-size:11px;color:var(--text3);font-weight:700;margin-bottom:4px;">목적 (Object)</div><div style="font-size:12.5px;color:var(--text);line-height:1.55;word-break:break-word;">'+(obj||'<span style="color:var(--text3);">-</span>')+'</div></div>'+
      '<div><div style="font-size:11px;color:var(--text3);font-weight:700;margin-bottom:4px;">사전조건 (Pre-Condition)</div><div style="font-size:12.5px;color:var(--text);line-height:1.55;word-break:break-word;">'+(pre||'<span style="color:var(--text3);">-</span>')+'</div></div>';
  }
  if(tab==='topo'){
    const _tid=tc.tcid||tc.id||'';
    if(typeof renderTCTopo2==='function'){   // TC 원본 구성도 다이어그램 재사용 (읽기전용)
      setTimeout(function(){ try{ if(typeof loadDeviceData==='function'){ loadDeviceData().then(function(){ if(typeof tcTopo2Refresh==='function')tcTopo2Refresh(_tid); }).catch(function(){ if(typeof tcTopo2Refresh==='function')tcTopo2Refresh(_tid); }); } else if(typeof tcTopo2Refresh==='function'){ tcTopo2Refresh(_tid); } }catch(e3){} },120);
      return '<div style="pointer-events:none;">'+renderTCTopo2(_tid)+'</div>';
    }
    const img=String(tc.topo_image||'').trim();
    return img?('<img src="'+e(img)+'" style="max-width:100%;border:1px solid var(--border);border-radius:6px;display:block;">'):'<div style="color:var(--text3);font-size:12px;padding:4px 2px;">구성도 이미지 없음 (TC 관리 화면에서 작성)</div>';
  }
  if(tab==='traffic'){
    const cfg=tc.meterCfg||tc.traffic||null; const streams=(cfg&&Array.isArray(cfg.streams))?cfg.streams:[];
    if(!cfg||(!streams.length && !cfg.vendor && !cfg.model && !cfg.chassis)) return '<div style="color:var(--text3);font-size:12px;padding:4px 2px;">트래픽 설정 없음</div>';
    let h='<div style="font-size:12px;color:var(--text2);line-height:1.7;margin-bottom:10px;display:flex;flex-wrap:wrap;gap:6px 18px;">';
    if(cfg.vendor||cfg.model)h+='<span><b style="color:var(--text3);font-weight:700;">계측기</b> '+e((cfg.vendor||'')+' '+(cfg.model||'')).trim()+'</span>';
    if(cfg.chassis)h+='<span><b style="color:var(--text3);font-weight:700;">서버/섀시</b> '+e(String(cfg.chassis))+'</span>';
    if(cfg.ports&&cfg.ports.length)h+='<span><b style="color:var(--text3);font-weight:700;">포트</b> '+e((cfg.ports||[]).join(', '))+'</span>';
    h+='<span><b style="color:var(--text3);font-weight:700;">스트림</b> '+streams.length+'개</span></div>';
    if(!streams.length) return h;
    const th='padding:6px 9px;font-size:11px;font-weight:800;color:#5a6376;background:#eef1f5;border-bottom:1px solid #d7dce3;text-align:left;white-space:nowrap;';
    const tdc='padding:4px 9px;border-bottom:1px solid #eef0f4;font-size:11.5px;color:#2a2f3a;white-space:nowrap;';
    const COLS=['활성','SRC Port','DST Port','Stream Name','CNT','Packet','L2 Source','L2 Destination','L3 Source','L3 Destination','Gateway'];
    h+='<div style="overflow-x:auto;border:1px solid var(--border);border-radius:8px;"><table style="border-collapse:collapse;width:100%;min-width:900px;"><thead><tr>'+COLS.map(function(c){return '<th style="'+th+'">'+c+'</th>';}).join('')+'</tr></thead><tbody>';
    streams.forEach(function(s){
      const _pkt=e(String(s.packetType||s.proto||'').toUpperCase()+(s.minByte||s.frame?(' / '+(s.minByte||s.frame)+'B'):''));
      h+='<tr>'
        +'<td style="'+tdc+'text-align:center;">'+(s.enabled!==false?'<i class="ti ti-circle-check-filled" style="color:#00a872;font-size:13px;"></i>':'<i class="ti ti-circle-x" style="color:#c0c4cc;font-size:13px;"></i>')+'</td>'
        +'<td style="'+tdc+'">'+e(String(s.src||''))+'</td>'
        +'<td style="'+tdc+'">'+e(String(s.dst||''))+'</td>'
        +'<td style="'+tdc+'font-weight:700;color:#1c2030;">'+e(String(s.name||''))+'</td>'
        +'<td style="'+tdc+'text-align:center;">'+e(String(s.count||s.frameCnt||''))+'</td>'
        +'<td style="'+tdc+'">'+_pkt+'</td>'
        +'<td style="'+tdc+'font-family:ui-monospace,monospace;">'+e(String(s.srcMac||''))+'</td>'
        +'<td style="'+tdc+'font-family:ui-monospace,monospace;">'+e(String(s.dstMac||''))+'</td>'
        +'<td style="'+tdc+'">'+e(String(s.srcIp||''))+'</td>'
        +'<td style="'+tdc+'">'+e(String(s.dstIp||''))+'</td>'
        +'<td style="'+tdc+'">'+e(String(s.gw||''))+'</td>'
        +'</tr>';
    });
    h+='</tbody></table></div>';
    return h;
  }
  const fmt=function(d){ if(!d)return '-'; try{ var dt=new Date(d); return isNaN(dt.getTime())?String(d):dt.toLocaleString('ko-KR'); }catch(e2){ return String(d); } };
  let h='<div style="font-size:12.5px;color:var(--text);line-height:1.8;">';
  h+='<div><b style="color:var(--text3);font-weight:700;">생성</b> : '+e(fmt(tc.created_at))+'</div>';
  h+='<div><b style="color:var(--text3);font-weight:700;">수정</b> : '+e(fmt(tc.updated_at))+'</div>';
  if(tc.severity)h+='<div><b style="color:var(--text3);font-weight:700;">심각도</b> : '+e(String(tc.severity))+'</div>';
  if(tc.type)h+='<div><b style="color:var(--text3);font-weight:700;">유형</b> : '+e(String(tc.type))+'</div>';
  h+='</div>';
  // 커스텀 필드: TC 관리 화면과 동일한 라벨·필드형식으로 렌더 (읽기전용 — 편집 불가)
  if(typeof renderCustomFieldsForTarget==='function'){
    try{ const _cfH=renderCustomFieldsForTarget('tc', tc, function(){}); if(_cfH) h+='<div style="pointer-events:none;">'+_cfH+'</div>'; }catch(e3){}
  } else {
    const _cfDefs=(typeof customFields!=='undefined'&&Array.isArray(customFields.tc))?customFields.tc:[];
    const _cfLabel=function(k){ const d=_cfDefs.find(function(f){return f.id===k;}); return (d&&(d.label||d.name))||k; };
    const cf=tc.custom_fields||{}; let cfh=''; Object.keys(cf).forEach(function(k){ const v=cf[k]; if(v!=null&&v!=='')cfh+='<div><b style="color:var(--text3);font-weight:700;">'+e(_cfLabel(k))+'</b> : '+e(Array.isArray(v)?v.join(', '):(typeof v==='object'?JSON.stringify(v):String(v)))+'</div>'; });
    if(cfh) h+='<div style="font-size:12.5px;color:var(--text);line-height:1.8;">'+cfh+'</div>';
  }
  return h;
}
// Test Procedure Details 상단 TC 참고 패널 — 정보/환경/구성도/트래픽 (TC 관리 탭 재사용)
function cbExpImgView(src){
  const m=document.createElement('div'); m.id='_cbexpimgmodal'; m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.62);z-index:12000;display:flex;align-items:center;justify-content:center;padding:30px;';
  m.onclick=function(e){ if(e.target===m) m.remove(); };
  m.innerHTML='<div style="background:#fff;border-radius:12px;max-width:860px;width:100%;max-height:90vh;overflow:auto;padding:18px;box-sizing:border-box;"><div style="display:flex;justify-content:flex-end;margin-bottom:10px;"><button onclick="document.getElementById(\'_cbexpimgmodal\').remove()" style="font-size:12px;padding:6px 12px;border-radius:6px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;">닫기</button></div><img src="'+src+'" style="max-width:100%;display:block;border-radius:8px;"></div>';
  document.body.appendChild(m);
}
function cbExecHtml(inline){
  if(!cbSelItem) return '<div style="padding:40px 20px;text-align:center;color:var(--text3);font-size:13px;"><i class="ti ti-list-details" style="font-size:38px;opacity:0.2;display:block;margin-bottom:12px;"></i>가운데에서 TC를 클릭하면<br>시험 세부 절차가 표시됩니다</div>';
  const o=cbResolve(cbSelItem); if(!o.it) return '<div style="padding:40px;text-align:center;color:var(--text3);">TC를 다시 선택하세요</div>';
  // 사이클 목록은 메타로 로드됨 → 상세 필요할 때 개별 로드 (한 번만)
  try{
    if(o.cy && !o.cy._full && !o.cy._loadingFull && typeof loadCycleFull==='function'){
      o.cy._loadingFull=true;
      loadCycleFull(o.cy.id).then(function(){ o.cy._loadingFull=false; try{ var _dt=document.getElementById('cb-detail'); if(_dt) _dt.innerHTML=cbExecHtml(); }catch(_e){} }).catch(function(){ o.cy._loadingFull=false; });
    }
    // 원본 TC 도 checks 필요 → auto sync 를 위해 lazy load
    if(o.it && o.it.tcid && typeof loadTCFull==='function'){
      var _tc0=tcList.find(function(t){return (t.tcid||t.id)===o.it.tcid;});
      if(!_tc0 || !Array.isArray(_tc0.checks)){
        if(_tc0 && !_tc0._loadingFull){
          _tc0._loadingFull=true;
          loadTCFull(o.it.tcid).then(function(){ _tc0._loadingFull=false; try{ var _dt2=document.getElementById('cb-detail'); if(_dt2) _dt2.innerHTML=cbExecHtml(); }catch(_e){} }).catch(function(){ _tc0._loadingFull=false; });
        }
      }
    }
  }catch(_le){}
  // 자동 sync: 최신 TC 절차로 조용히 갱신 (이미 최신이면 no-op, 결과는 (cli,desc) 매칭으로 유지, 참조 tcid도 재바인딩)
  try{ if(typeof _cbAutoSyncItem==='function') _cbAutoSyncItem(o.it, o.cy); }catch(_ase){}
  const it=o.it; const cur=_cbItemStatusKey(it);
  // 최신 TC 참조: tcid 우선, 없거나 비었으면 name 기반 후보 검색
  const _ftc=(typeof _cbResolveTcForItem==='function')?_cbResolveTcForItem(it, o.cy):tcList.find(t=>(t.tcid||t.id)===it.tcid);
  const _freshAll=_ftc?_checksToSteps(_ftc, o.cy&&o.cy.model):[];
  const _inclAct=function(a,sp){ if(sp&&sp.manual) return true; if(!a) return true; if(a==='메시지') return true; return _isMtrAct(a)||a==='CLI'||a==='Ping'||a==='대기'||a==='호출'||a==='수동'||a.indexOf('SNMP')>=0; }; // 명령·SNMP·계측기·Ping·대기·호출·수동·메시지
  const _src=(it.steps&&it.steps.length)?it.steps:_freshAll;   // 저장된 스텝 없으면 현재 TC 절차로 폴백
  const steps=[]; _src.forEach(function(sp,i){ const fr=_freshAll[i]||{}; const act=sp.action||fr.action||''; if(!_inclAct(act,sp)) return;
    // 빈 스텝 필터: action=CLI인데 cli/desc/expected 모두 비어있으면 렌더 스킵 (옛 사이클의 잘못 저장된 message 흔적 제거)
    var _emptyCli=(act==='CLI'||act==='') && !(sp.cli||sp.desc||sp.expected||fr.cli||fr.desc||fr.expected);
    if(_emptyCli) return;
    steps.push({sp:sp,fr:fr,oi:i}); });
  const quick=['예정','PASS','FAIL','미구현','미지원','제외'].map(r=>'<button onclick="cbSetItemStatus(\''+cbSelItem+'\',\''+r+'\')" style="font-size:10.5px;padding:3px 10px;border-radius:5px;border:1px solid var(--border);background:'+(cur===r?'#2d6fd4':'#fff')+';color:'+(cur===r?'#fff':'var(--text2)')+';cursor:pointer;font-weight:'+(cur===r?'700':'500')+';">'+r+'</button>').join('');
  const head='<div style="padding:11px 14px;border-bottom:1px solid var(--border);background:#fff;flex-shrink:0;z-index:1;display:flex;align-items:flex-start;gap:10px;"><div style="flex:1;min-width:0;"><div style="font-size:12.5px;color:var(--blue);font-weight:700;">'+_bdEsc(it.tcid||'')+(o.cy?(' · '+_bdEsc(o.cy.model||'')+' · '+_bdEsc(o.cy.version||'')):'')+'</div><div style="font-size:18px;font-weight:800;color:var(--text);margin-top:2px;">'+_bdEsc(it.name||'')+'</div></div><button onclick="cbAddIssue()" title="이번 시험 결함을 Jira에 새 이슈로 생성(push)" style="flex-shrink:0;font-size:11px;padding:6px 12px;border-radius:6px;border:1px solid #c0392b66;background:#fff;color:#c0392b;cursor:pointer;font-weight:700;white-space:nowrap;"><i class="ti ti-bug" style="font-size:12px;"></i> 이슈 생성(Jira)</button><div style="display:none;"><span style="font-size:10.5px;color:var(--text3);">TC 전체:</span>'+quick+'</div></div>';
  const STAT2=['예정','PASS','FAIL','미구현','미지원','제외'];
  const typeLabel=function(t){ const x=(typeof PROC_CHECK_TYPES!=='undefined')?PROC_CHECK_TYPES.find(e=>e[0]===(t||'contains')):null; return x?x[1]:(t||''); };
  const thb='padding:6px 8px;text-align:left;font-size:10px;font-weight:800;color:#5a6072;background:#eef1f5;border-bottom:1px solid #cfd4dc;white-space:nowrap;';
  const _lab=function(l,v,color,mono){ return '<div style="font-size:11.5px;line-height:1.5;margin-top:5px;"><div style="font-weight:800;color:var(--text3);font-size:9.5px;letter-spacing:0.3px;text-transform:uppercase;margin-bottom:1px;">'+l+'</div><div style="min-width:0;'+(mono?'font-family:ui-monospace,monospace;':'')+'color:'+(color||'#1c1f27')+';white-space:pre-wrap;word-break:break-word;">'+v+'</div></div>'; };   // 세로 스택(라벨 위·값 아래) → 값이 전체 폭 사용
  // 단일 스텝 렌더 함수 — steps.map 안 로직을 함수로 분리 → 부분 갱신(_cbUpdateStep)에서도 재사용.
  var _renderOne=function(p, si){ const sp=p.sp, fr=p.fr, oi=p.oi; const skey=_stepStatusKey(sp.result);
    const sc={'예정':'#9aa0b8','PASS':'#00a872','FAIL':'#e53e5a','미구현':'#e8820c','미지원':'#7c3aed','제외':'#888'}[skey]||'#888';
    const sel='<select onchange="cbSetStepStatus(\''+cbSelItem+'\','+oi+',this.value)" style="font-size:10.5px;padding:3px 8px;border:1px solid '+sc+';border-radius:7px;background:'+sc+';outline:none;cursor:pointer;color:#fff;font-weight:800;">'+STAT2.map(x=>'<option style="background:#fff;color:#222;" '+(skey===x?'selected':'')+'>'+x+'</option>').join('')+'</select>';
    const _desc=sp.desc||fr.desc||'';
    const _exp=sp.expected||fr.expected||''; const _expImg=sp.expected_img||fr.expected_img||'';
    const _expImgW=parseInt(sp.expected_img_w||fr.expected_img_w)||700, _expImgH=parseInt(sp.expected_img_h||fr.expected_img_h)||500;
    const _cli=sp.cli||fr.cli||''; const _crit=sp.criteria||fr.criteria||''; const _type=sp.type||fr.type||'contains';
    const _excL=sp.excludeLines||fr.excludeLines||''; const _cm=sp.critMode||fr.critMode||''; const _exm=sp.excMode||fr.excMode||''; const _res=sp.result||'';
    let _v='';   // 현재 판정기준으로 실시간 재판정 → 색/강조/RCA (저장된 result가 옛 기준이어도 정확히)
    if(String(sp.output||'').trim()){
      if(_crit||_type==='table'){ try{ let _lv=''; if(_type==='table') _lv=(_judgeTable(_applyQuery(String(sp.output||''),sp.query),_crit).pass?'Pass':'Fail'); else if(_type==='diff'||_type==='expr') _lv=''; else _lv=_judgeCheck(String(sp.output||''),_crit,_type,_excL,sp.query); if(_lv==='Pass')_v='pass'; else if(_lv==='Fail')_v='fail'; }catch(e){} }
      else if(String(_excL||'').trim()){ _v='pass'; }   // 판정기준 없이 '제외'만 설정된 스텝 → 통과(Pass)
    }
    // expr 타입(IF condition 병합)은 자체 재판정 대신 저장된 result(IF 브리지가 세팅한 verdict)로 색 강조
    if(!_v && _type==='expr' && sp.result){
      if(sp.result==='Pass') _v='pass'; else if(sp.result==='Fail') _v='fail';
    }
    const _ob=_v==='pass'?'border:2px solid #00a872;':(_v==='fail'?'border:2px solid #e53e5a;':'border:1px solid #e6e2d6;');
    // expr 타입은 실행 후 치환된 verdictMsg 를 토큰 추출용으로 우선 사용 (원문 ${var...} 로는 output에서 매칭 불가)
    const _critForToks=(_type==='expr' && sp.verdictMsg) ? String(sp.verdictMsg) : _crit;
    const _critToks=(typeof _critTokens==='function')?_critTokens({type:_type,criteria:_critForToks}):[];
    // Actual Data 에는 장비 결과(CLI)만 — '─── 표 검증/기준 비교/판정 근거 ───' 이하 부가 섹션 제거
    const _cliOut=String(sp.output||'').replace(/^\s*\[알림\][^\n]*\n?/mg,'').replace(/\n*─── (?:표 검증|기준 비교|판정 근거) ───[\s\S]*$/,'').replace(/\s+$/,'');
    const _outBody=(_v&&_critToks.length)?_cbHlOut(_cliOut,_critToks,_v):_bdEsc(_cliOut);
    const _run=(cbSelItem===_cbRunKey&&oi===_cbRunStep);   // _out에서 참조하므로 먼저 선언 (const TDZ 방지)
    const _isQueryStep=(String(sp.action||fr.action||'').indexOf('조회')>=0);
    const _out=(_isQueryStep&&sp.n2xStats&&Array.isArray(sp.n2xStats)&&sp.n2xStats.length&&typeof _n2xStatsHtml==='function')?_n2xStatsHtml(sp.n2xStats,sp.n2xNames,sp.n2xElapsed):((_cliOut&&_cliOut.trim())?(_cliOut.indexOf('⏳')>=0?'<span '+(_run?'id="cb-runstep-out" ':'')+'style="color:var(--text3);">'+_bdEsc(_cliOut)+'</span>':'<span style="font-family:ui-monospace,monospace;display:block;background:#faf9f5;color:#2a2f3a;padding:7px 10px;border-radius:5px;overflow:auto;white-space:pre;line-height:1.5;font-size:12.5px;'+_ob+'">'+_outBody+'</span>'):'<span style="color:#c0c4cc;">(미실행)</span>');
    let _rca=''; if(_v==='fail' && _type!=='table' && _type!=='diff' && _type!=='expr'){ let _rs=''; try{ _rs=(typeof _failDetail==='function')?_failDetail({type:_type,criteria:_crit,excludeLines:_excL,output:String(sp.output||''),repeatResult:'Fail'}, String(sp.output||'').split(/\r?\n/), null):''; }catch(e){} if(!_rs){ try{ _rs=_judgeReason(String(sp.output||''),_crit,_type,_excL,'Fail'); }catch(e){} } _rca='<div style="margin-top:5px;font-size:11px;color:#a01f33;background:#fff5f6;border:1px solid #f3c6cf;border-radius:6px;padding:5px 9px;line-height:1.5;white-space:normal;word-break:break-word;overflow-wrap:anywhere;"><b style="color:#e53e5a;">RCA:</b> '+_bdEsc(String(_rs||'판정기준 불충족').slice(0,180))+'</div>'; }
    const _actRaw=sp.action||fr.action||'CLI'; const _actLbl=(_actRaw==='대기')?('대기 '+(parseInt(sp.waitSec||fr.waitSec||sp.cli)||5)+'초'):_actRaw;   // TC처럼 sleep 시간 표기
    // 메시지 스텝: 라벨성이라 4필드 레이아웃 대신 한 줄 심플 표시 (내용은 output 우선 → 없으면 desc). 판정/RCA 없음.
    if(_actRaw==='메시지'){
      var _msgSrc=String(sp.output||sp.desc||'').trim() || '(메시지)';
      // for 반복 회차별 loopVars(예: {i:5}) 로 ${i}/$i 치환 → 사이클 UI에서도 회차값이 보이도록.
      // output 이 이미 있으면(실행 완료 후) 그대로 사용. 실행 전에는 desc 를 loopVars 로 치환.
      var _msgTxt=_msgSrc;
      try{
        if(!sp.output && sp._loopVars && typeof sp._loopVars==='object'){
          _msgTxt=_msgSrc.replace(/\$\{([\w가-힣]+)\}/g, function(_m,k){ return (k in sp._loopVars)?String(sp._loopVars[k]):('${'+k+'}'); })
                          .replace(/\$([A-Za-z_][\w가-힣]*)/g, function(_m,k){ return (k in sp._loopVars)?String(sp._loopVars[k]):('$'+k); });
        }
      }catch(_ce){}
      return '<div data-cbstep="'+oi+'" '+(_run?'id="cb-runstep" ':'')+'style="padding:9px 14px;border-bottom:1px solid #eef0f3;background:'+(_run?'#fff8e1':'#f5f9ff')+';'+(_run?'box-shadow:inset 4px 0 0 #e8820c, 0 0 0 2px rgba(232,130,12,0.35);border-radius:6px;animation:cbRunPulse 2s ease-in-out infinite;':'border-left:3px solid #0891b2;')+';display:flex;align-items:center;gap:9px;">'
        +'<span style="font-size:13px;font-weight:800;color:var(--blue);flex-shrink:0;">Step#'+(si+1)+'</span>'
        +'<i class="ti ti-messages" style="font-size:15px;color:#0891b2;flex-shrink:0;"></i>'
        +'<span style="font-size:12.5px;font-weight:700;color:#1c1f27;flex:1;min-width:0;white-space:pre-wrap;line-height:1.55;">'+_bdEsc(_msgTxt)+'</span>'
        +(_run?'<span style="font-size:9.5px;font-weight:800;color:#fff;background:#e8820c;border-radius:8px;padding:1px 8px;flex-shrink:0;"><i class="ti ti-player-play-filled" style="font-size:9px;"></i> 실행 중</span>':'')
        +'</div>';
    }
    return '<div data-cbstep="'+oi+'" '+(_run?'id="cb-runstep" ':'')+'style="padding:11px 14px;border-bottom:1px solid #eef0f3;'+(_run?'background:#fff8e1;box-shadow:inset 4px 0 0 #e8820c, 0 0 0 2px rgba(232,130,12,0.35);border-radius:6px;animation:cbRunPulse 2s ease-in-out infinite;':'')+'">'+
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;"><span style="font-size:13px;font-weight:800;color:var(--blue);">Step#'+(si+1)+'</span><span style="font-size:10px;color:var(--text3);background:#eef2f7;padding:1px 7px;border-radius:3px;">'+_bdEsc(_actLbl)+'</span>'+(_run?'<span style="font-size:9.5px;font-weight:800;color:#fff;background:#e8820c;border-radius:8px;padding:1px 8px;"><i class="ti ti-player-play-filled" style="font-size:9px;"></i> 실행 중</span>':'')+'<span style="flex:1;"></span>'+sel+'</div>'+
      _lab('시험 목적', _desc?(sp.manual?('<b>'+_bdEsc(_desc)+'</b>'):_bdEsc(_desc)):'<span style="color:#c0c4cc;font-weight:400;">(미입력)</span>', '#1c1f27')+
      _lab('Test Data', _cli?_bdEsc(_cli):'<span style="color:#c0c4cc;">-</span>', '#14171d', true)+
      _lab('Expected Result', (_crit||_excL||_exp||_expImg)?((_expImg?('<img src="'+_expImg+'" style="width:'+_expImgW+'px;height:'+_expImgH+'px;max-width:100%;object-fit:contain;border-radius:5px;border:1px solid var(--border);display:block;margin-bottom:4px;cursor:zoom-in;background:#f8f9fb;" onclick="cbExpImgView(this.src)">'):'')+(_exp?_bdEsc(_exp):'')+(_cm?'<span style="font-size:9px;font-weight:800;color:#2d6fd4;background:#eaf2ff;border:1px solid #cdddf5;border-radius:4px;padding:1px 5px;margin-right:5px;">'+_bdEsc(_cm)+'</span>':'')+(_crit?(_bdEsc(sp.verdictMsg||_crit)+'<span style="color:var(--text3);font-size:10px;"> ('+_bdEsc(typeLabel(_type))+')</span>'):'')+(_excL?'<div style="color:#c0392b;font-size:10.5px;margin-top:3px;"><i class="ti ti-ban"></i> '+_bdEsc(_exm||'제외')+': '+_bdEsc(_excL)+'</div>':'')):'<span style="color:#c0c4cc;">—</span>', '#00875a')+
      _lab('Actual Data', _out+_rca, '#1c1f27')+
    '</div>';
  };
  // 외부 부분 갱신용으로 노출 — cbExecHtml 실행 시점의 클로저 유지
  window._cbRenderOneStepClosure=_renderOne;
  window._cbCurSteps=steps;
  // 렌더 창 (창 크기): 접속·화면 이동 시 50 → 사용자가 [더 보기] 누르면 확장.
  // 실행 중이면 실행 스텝(_cbRunStep) 이 창 안에 포함되도록 창 위치 조정.
  var _limit=(typeof _cbExecLimit==='number'&&_cbExecLimit>0)?_cbExecLimit:50;
  var _rows='';
  if(steps.length<=_limit || _cbExecShowAll){
    _rows=steps.length?steps.map(function(p,si){ return _renderOne(p,si); }).join(''):'<div style="padding:30px;text-align:center;color:var(--text3);font-size:12px;">절차(스텝)가 없습니다</div>';
  } else {
    // 실행 중이면 현재 스텝 주변으로 창 이동, 아니면 처음부터 _limit 개
    var _center=-1;
    if(cbSelItem===_cbRunKey && _cbRunStep>=0){
      for(var _si=0;_si<steps.length;_si++){ if(steps[_si].oi===_cbRunStep){ _center=_si; break; } }
    }
    var _from=0, _to=Math.min(steps.length, _limit);
    if(_center>=_to){
      // 실행 스텝이 창 밖 → 실행 스텝 기준으로 창 이동 (앞 10 / 뒤 나머지)
      _from=Math.max(0, _center-10);
      _to=Math.min(steps.length, _from+_limit);
    }
    var _slice=steps.slice(_from,_to);
    var _hiddenBefore=_from, _hiddenAfter=steps.length-_to;
    var _tesc=String(cbSelItem||'').replace(/\\/g,"\\\\").replace(/'/g,"\\'");
    var _notice=function(cnt, dir){
      if(!cnt) return '';
      return '<div style="padding:9px 12px;background:#f7f8fa;border-bottom:1px solid #eef0f3;text-align:center;font-size:11.5px;color:var(--text3);">'
        +(dir==='before'?'↑ 위쪽 ':'↓ 아래쪽 ')+'<b style="color:#7c3aed;">'+cnt+'</b>개 스텝 숨김'
        +' <button onclick="cbExecMore(50)" style="margin-left:8px;font-size:11px;padding:2px 10px;border:1px solid #cfd6e8;border-radius:6px;background:#fff;color:#2d6fd4;cursor:pointer;font-weight:700;">50개 더 보기</button>'
        +' <button onclick="cbExecShowAll()" style="margin-left:4px;font-size:11px;padding:2px 10px;border:1px solid #cfd6e8;border-radius:6px;background:#fff;color:#7c3aed;cursor:pointer;font-weight:700;">전체('+steps.length+')</button>'
        +'</div>';
    };
    _rows=_notice(_hiddenBefore,'before')+_slice.map(function(p,i){ return _renderOne(p, _from+i); }).join('')+_notice(_hiddenAfter,'after');
  }
  const rows=_rows;
  const _asRunBanner='<div style="padding:7px 14px;background:#fbfaf4;border-bottom:1px solid #efe9d6;display:flex;align-items:center;gap:8px;font-size:11px;color:#8a6d3b;"><i class="ti ti-clock-pin"></i> 절차·결과는 <b>실행 당시(as-run) 스냅샷</b>입니다<span style="flex:1;"></span><button onclick="cbUpdateItemFromTC(\''+cbSelItem+'\')" title="현재 TC 최신 절차로 갱신 (결과는 같은 위치 스텝에 한해 유지)" style="font-size:10.5px;padding:3px 11px;border-radius:6px;border:1px solid #2d6fd4;background:#fff;color:#2d6fd4;cursor:pointer;font-weight:700;"><i class="ti ti-refresh" style="font-size:12px;"></i> 현재 TC로 업데이트</button></div>';
  const _dt=_cbRefTab||'proc';
  const _issA=((_ftc&&_ftc.issue_list)||(it.issues)||[]); const _issO=_issA.filter(function(x){return !/clos|reject|resolv|done|fixed|완료|해결/i.test(String(x.status||''));}).length; const _hisN=((_ftc&&_ftc.result_history)||[]).length;
  const _railDefs=[['info','Info','ti-info-circle',''],['env','Environment','ti-clipboard-text',''],['topo','Topology','ti-topology-star',''],['traffic','Traffic','ti-antenna',''],['proc','Step','ti-list-check',(steps.length||'')],['issue','Issues','ti-bug',(_issA.length?(_issO+'/'+_issA.length):'')],['history','History','ti-history',(_hisN||'')]];
  const _rail=_railDefs.map(function(t){ const on=_dt===t[0]; return '<button onclick="cbSetDetailTab(\''+t[0]+'\')" title="'+t[1]+'" style="position:relative;display:inline-flex;align-items:center;gap:6px;padding:9px 14px;border:none;border-bottom:2.5px solid '+(on?'#7c3aed':'transparent')+';background:transparent;color:'+(on?'#7c3aed':'var(--text3)')+';cursor:pointer;font-weight:'+(on?'800':'600')+';font-size:13px;white-space:nowrap;flex-shrink:0;"><i class="ti '+t[2]+'" style="font-size:17px;"></i><span>'+t[1]+'</span>'+((t[3]!==''&&t[3]!=null)?'<span style="font-size:9px;font-weight:800;color:#fff;background:'+((t[0]==='issue'&&_issO)?'#c0392b':'#7c3aed')+';border-radius:8px;padding:1px 6px;min-width:15px;text-align:center;">'+t[3]+'</span>':'')+'</button>'; }).join('');
  let _content='';
  if(_dt==='issue') _content=cbTcRefHtml(_ftc,'issue')+cbIssuesHtml();
  else if(_dt==='history') _content=cbTcRefHtml(_ftc,'history');
  else if(_dt==='info') _content='<div style="padding:12px 16px;">'+_cbRefView(_ftc,_dt)+'</div>';
  else if(_dt==='env'||_dt==='topo'||_dt==='traffic'){   // TC 원본 탭 렌더러를 그대로 재사용 (읽기전용)
    let _rc=''; try{ _rc=(_ftc&&typeof tcTabContent==='function')?tcTabContent(_ftc,_dt):_cbRefView(_ftc,_dt); }catch(e4){ _rc=_cbRefView(_ftc,_dt); }
    _content='<div style="padding:8px 14px;"><div style="font-size:10.5px;color:var(--text3);font-weight:700;margin-bottom:6px;"><i class="ti ti-book-2" style="font-size:12px;"></i> TC 원본 · 읽기전용</div><div style="pointer-events:none;">'+_rc+'</div></div>';
  }
  else _content=_asRunBanner+'<div>'+rows+'</div>';
  return (inline?'':head)+'<div style="flex:1;min-height:0;display:flex;flex-direction:column;"><div style="display:flex;align-items:center;gap:1px;padding:0 12px;border-bottom:1px solid var(--border);background:#faf9fe;overflow-x:auto;flex-shrink:0;">'+_rail+'</div><div style="flex:1;min-width:0;overflow:auto;">'+_content+'</div></div>';
}
// Zephyr식: 사이클 항목 절차를 현재 TC 최신 버전으로 업데이트 (결과는 같은 위치 스텝에 한해 유지)
// 사이클 아이템의 실제 원본 TC 찾기 — tcid 우선, 없으면/비어있으면 name+model로 후보 검색.
// 자동 sync 등 read-only 조회용. 사용자 확인 없이 후보 하나를 선택할 수 있게 한다.
// TC checks id → 사이클 아이템 steps 인덱스 매핑 캐시
// 사이클 실행 시작 시 계산되고, 브리지 호출에서 즉시 참조 (O(1))
var _cbCkidMap=null;
function _cbBuildCkidMap(it, srcTc, cyModel){
  var map={};
  if(!srcTc || !Array.isArray(srcTc.checks) || !it) return map;
  var checks=srcTc.checks;
  var steps=it.steps||[];
  // _checksToSteps 는 for 를 사전 전개. 그 결과와 checks의 대응관계를 만들어야 함.
  // expand loop 재구현 : checks[i]가 사이클 steps 에서 어느 인덱스(들)를 차지하는지 배열로 저장.
  var _ind=function(c){return Math.max(0,parseInt(c.indent)||0);};
  var _J=function(x){ return x!=null?JSON.parse(JSON.stringify(x)):undefined; };
  var _sigOf=function(s){ return String(s.cli||'')+'|'+String(s.desc||'')+'|'+String(s.waitSec||0)+'|'+String(s.action||''); };
  var _sigOfChk=function(c){
    var k=c.kind||'cli';
    var _act=(k==='wait'?'대기':k==='call'?'호출':k==='manual'?'수동':k==='message'?'메시지':(c.action||'CLI'));
    var _desc=(k==='message'?String(c.text||''):(c.desc||''));
    return String(c.cli||'')+'|'+_desc+'|'+String(c.waitSec||0)+'|'+_act;
  };
  // 순차 매칭: 사이클 steps 를 순회하며 checks 안에서 다음 매칭을 찾음
  var _ckToSteps={};   // ckid → [stepIdx, stepIdx, ...] (for 전개 대응)
  var _chIdxOfStep=[]; // stepIdx → ckid
  var _chSeq=[];   // 원본 checks 를 for 전개 순으로 나열: [ckid, ...]
  // expand 재구현 (07-report의 _checksToSteps 와 동일 로직)
  var _mtrOf=function(a){ try{ return _isMtrAct(a); }catch(e){ return false; } };
  var _emOf=function(i){ try{ return _effModelOfStep(checks,i); }catch(e){ return '공통'; } };
  var _mfBase=String(cyModel||'').replace(/_\d+$/,'');
  // 사이클 라이브 필터 규칙: 모델그룹 필터 통과한 스텝만 사이클 steps 에 들어감
  var _keep=function(i, useTg, tg){
    var c=checks[i]; var k=c.kind||'cli'; var _mtr=_mtrOf(c.action); var em=_emOf(i);
    if(k!=='cli'&&k!=='wait'&&k!=='call'&&k!=='manual'&&k!=='message') return false;
    if(useTg && !_mtr && k!=='wait' && k!=='call' && k!=='manual' && k!=='message' && tg && em!=='공통' && em!==tg) return false;
    return true;
  };
  // 그룹 헤더 목록 → tg 결정
  var groups=[]; checks.forEach(function(c){ if((c.kind||'cli')==='model'){ var g=String(c.modelName||'').trim(); if(g&&g!=='공통'&&groups.indexOf(g)<0)groups.push(g); } });
  var tg='';
  if(cyModel && groups.length){
    if(groups.indexOf(cyModel)>=0) tg=cyModel;
    else if(typeof _modelGroupMatch==='function'){
      for(var gi=0; gi<groups.length; gi++){ if(_modelGroupMatch(groups[gi], cyModel)){ tg=groups[gi]; break; } }
      if(!tg && _mfBase!==cyModel){ for(var gj=0; gj<groups.length; gj++){ if(_modelGroupMatch(groups[gj], _mfBase)){ tg=groups[gj]; break; } } }
    }
  }
  var _pushSeq=function(startIdx, endIdx){
    var i=startIdx;
    while(i<endIdx){
      var c=checks[i]; var k=c.kind||'cli'; var L=_ind(c);
      if(k==='loop'||k==='group'){
        var j=i+1; while(j<endIdx && _ind(checks[j])>L) j++;
        var lm=c.loopMode||'count';
        if(lm==='for'){
          var fv=String(c.loopVar||'i').trim()||'i';
          var f=parseFloat(c.forFrom), t=parseFloat(c.forTo), s=parseFloat(c.forStep);
          if(isNaN(f))f=1; if(isNaN(t))t=f; if(isNaN(s)||!s)s=1;
          for(var v=f; (s>0?v<=t:v>=t); v+=s){ _pushSeq(i+1, j); if(_chSeq.length>8000)break; }
        } else if(lm==='count'){
          var cnt=Math.max(1,parseInt(c.loopCount)||2);
          for(var n=0;n<cnt;n++){ _pushSeq(i+1, j); if(_chSeq.length>8000)break; }
        } else { _pushSeq(i+1, j); }
        i=j; continue;
      }
      if(_keep(i, true, tg)){ _chSeq.push(c.id); }
      else if(_keep(i, false, '')){ /* useTg=false 폴백 시 사용 */ }
      i++;
    }
  };
  _pushSeq(0, checks.length);
  // fallback: 필터에서 걸리면 useTg=false 로 재시도
  if(!_chSeq.length){
    var _pushSeq2=function(startIdx, endIdx){
      var i=startIdx;
      while(i<endIdx){
        var c=checks[i]; var k=c.kind||'cli'; var L=_ind(c);
        if(k==='loop'||k==='group'){
          var j=i+1; while(j<endIdx && _ind(checks[j])>L) j++;
          var lm=c.loopMode||'count';
          if(lm==='for'){
            var f=parseFloat(c.forFrom), t=parseFloat(c.forTo), s=parseFloat(c.forStep);
            if(isNaN(f))f=1; if(isNaN(t))t=f; if(isNaN(s)||!s)s=1;
            for(var v=f; (s>0?v<=t:v>=t); v+=s){ _pushSeq2(i+1, j); if(_chSeq.length>8000)break; }
          } else if(lm==='count'){
            var cnt=Math.max(1,parseInt(c.loopCount)||2);
            for(var n=0;n<cnt;n++){ _pushSeq2(i+1, j); if(_chSeq.length>8000)break; }
          } else { _pushSeq2(i+1, j); }
          i=j; continue;
        }
        if(_keep(i, false, '')) _chSeq.push(c.id);
        i++;
      }
    };
    _pushSeq2(0, checks.length);
  }
  // 이제 _chSeq[stepIdx] = ckid 매핑 완성 (사이클 steps 인덱스와 1:1 대응)
  for(var i=0;i<_chSeq.length;i++){
    var _cid=_chSeq[i];
    if(!map[_cid]) map[_cid]=[];
    map[_cid].push(i);
  }
  return map;
}
// ckid → 사이클 스텝 인덱스 찾기. 여러 개면 아직 실행 안 한 다음 인덱스 우선.
function _cbFindStepIdxByCkid(ckid){
  if(!_cbCkidMap || !_cbCkidMap[ckid]) return -1;
  var arr=_cbCkidMap[ckid];
  // 현재 _cbRunStep 이후 첫 매칭
  for(var i=0;i<arr.length;i++){ if(arr[i]>=Math.max(0,_cbRunStep)) return arr[i]; }
  return arr[arr.length-1];
}
// 실행 중 스텝 자동 스크롤 헬퍼 — 항상 컨테이너 중앙 근처로 이동.
// 사용자가 직접 스크롤 조작 중이면 5초간 자동 스크롤 일시 정지.
var _cbAutoScrollOff=false; var _cbAutoScrollResumeAt=0;
function _cbUserScrolling(){ _cbAutoScrollOff=true; _cbAutoScrollResumeAt=Date.now()+5000; }
function _cbAutoScrollOn(){ if(Date.now()>=_cbAutoScrollResumeAt) _cbAutoScrollOff=false; return !_cbAutoScrollOff; }
function _cbScrollToRunStep(){
  try{
    if(!_cbAutoScrollOn()) return;
    var _rs=document.getElementById('cb-runstep'); if(!_rs) return;
    var _dt=document.getElementById('cb-detail'); if(!_dt) return;
    // 스크롤 컨테이너를 정확히 잡기 위해 실제 스크롤 조상 탐색
    var _sc=_rs.parentElement;
    while(_sc && _sc!==document.body){
      var _cs=getComputedStyle(_sc); var _sy=_cs.overflowY;
      if((_sy==='auto'||_sy==='scroll') && _sc.scrollHeight>_sc.clientHeight) break;
      _sc=_sc.parentElement;
    }
    if(!_sc||_sc===document.body) _sc=_dt;
    // 컨테이너 안에서 스텝의 상대 오프셋 계산 → 컨테이너 중앙 지점에 오도록
    var _rRect=_rs.getBoundingClientRect();
    var _cRect=_sc.getBoundingClientRect();
    // 실행 스텝을 컨테이너 상단 근처(top 오프셋 100px)에 배치 — 아래 스텝(다음 진행)들이 보이도록
    var _targetOffset=100;
    var _delta=(_rRect.top - _cRect.top) - _targetOffset;
    if(Math.abs(_delta)<8) return;   // 이미 목표 위치 근처면 스킵
    try{ _sc.scrollBy({top:_delta, behavior:'smooth'}); }catch(_be){ _sc.scrollTop+=_delta; }
  }catch(_e){}
}
// 사용자 수동 스크롤 감지 (한 번만 바인딩)
if(!window._cbScrollBound){ window._cbScrollBound=true;
  document.addEventListener('wheel', function(e){ var t=e.target; if(t&&t.closest && t.closest('#cb-detail')) _cbUserScrolling(); }, {passive:true, capture:true});
  document.addEventListener('touchmove', function(e){ var t=e.target; if(t&&t.closest && t.closest('#cb-detail')) _cbUserScrolling(); }, {passive:true, capture:true});
}
// pulse 애니메이션 CSS 주입
if(!window._cbRunPulseCSS){ window._cbRunPulseCSS=true;
  var _st=document.createElement('style');
  _st.textContent='@keyframes cbRunPulse{0%,100%{box-shadow:inset 4px 0 0 #e8820c, 0 0 0 2px rgba(232,130,12,0.35);}50%{box-shadow:inset 4px 0 0 #e8820c, 0 0 0 4px rgba(232,130,12,0.15);}}';
  document.head.appendChild(_st);
}
// Tests 대기 스텝의 초 카운트다운을 사이클 UI에 반영 — cbExecHtml의 Actual Data 영역만 경량 갱신.
// 사이클 아이템 스텝의 output 을 갱신하고, 첫 진입 시 실행 중 강조도 이 스텝으로 이동.
function _cbBridgeWaitTick(ckid, remain, total){
  try{
    if(!_cycleLiveCtx || !_cbRunKey) return;
    var o=cbResolve(_cbRunKey); if(!o||!o.it) return;
    var _idx=_cbFindStepIdxByCkid(ckid); if(_idx<0) return;
    var _steps=o.it.steps||[]; if(!_steps[_idx]) return;
    var _txt=remain>0?('⏳ 대기 중… 남은 '+remain+'초 / 총 '+total+'초'):('⏱ 대기 '+total+'초 완료');
    _steps[_idx].output=_txt;
    _steps[_idx].result=(remain>0?'':'Pass');
    if(_cbRunStep!==_idx){
      var _prev=_cbRunStep;
      _cbRunStep=_idx;
      var _ok=_cbMoveRunStep(_prev, _idx);
      if(!_ok){ try{ var _dt=document.getElementById('cb-detail'); if(_dt){ var _stp=_dt.scrollTop; _dt.innerHTML=cbExecHtml(); _dt.scrollTop=_stp; } }catch(_re){} }
      setTimeout(_cbScrollToRunStep, 30);
      try{ _cbRunNotify('step',{ stepIdx:_idx, stepCnt:_steps.length, stepName:'대기 '+total+'초', stepAction:'대기', stepOutput:_txt }); }catch(_ne){}
    } else {
      // 매초 카운트다운: 대기 스텝의 output 텍스트 요소만 갱신 (전체 재렌더 X)
      try{ var _co=document.getElementById('cb-runstep-out'); if(_co) _co.textContent=_txt; else _cbUpdateStep(_idx); }catch(_re){}
      try{ if(remain<=0 || remain%5===0){ _cbRunNotify('waitTick',{ stepIdx:_idx, stepCnt:_steps.length, stepOutput:_txt }); } }catch(_ne){}
    }
    try{ cbRunBanner(_cbDot('#e8820c')+' 대기 중… 남은 '+remain+'초 / 총 '+total+'초', true); }catch(_e){}
  }catch(_e){}
}
// IF 스텝의 판정 결과(Pass/Fail)를 그 앞 CLI 스텝의 사이클 스텝에 반영.
// (Tests에서는 판정이 IF에 있지만 사이클 UI는 CLI 스텝에 결과 뱃지를 표시)
function _cbBridgeIfResult(prevCkid, verdict, msg){
  try{
    if(!_cycleLiveCtx || !prevCkid || !_cbRunKey) return;
    if(!_cbCkidMap || !_cbCkidMap[prevCkid]) return;
    var o=cbResolve(_cbRunKey); if(!o||!o.it) return;
    var _steps=o.it.steps||[];
    // prevCkid 의 인덱스 배열에서 이미 실행된 회차(즉 _cbRunStep 이하 마지막) 를 골라 결과 세팅
    var arr=_cbCkidMap[prevCkid];
    var _idx=-1;
    for(var i=arr.length-1;i>=0;i--){ if(arr[i]<=_cbRunStep){ _idx=arr[i]; break; } }
    if(_idx<0) _idx=arr[0];
    if(_steps[_idx]){
      _steps[_idx].result=verdict;
      _steps[_idx].executed_at=_nowStr();
      if(msg) _steps[_idx].verdictMsg=String(msg||'');
    }
    // 부분 갱신 (판정 뱃지·색상 반영)
    if(!_cbUpdateStep(_idx)){ try{ var _dt=document.getElementById('cb-detail'); if(_dt){ var _stp=_dt.scrollTop; _dt.innerHTML=cbExecHtml(); _dt.scrollTop=_stp; } }catch(_re){} }
  }catch(_e){}
}
// message 스텝: 각 회차별 치환값을 사이클 스텝의 output에 저장 + 실행 강조.
// for 100회면 100개의 사이클 스텝이 각자 다른 output 을 갖는다.
function _cbBridgeMessage(ckid, msgText){
  try{
    if(!_cycleLiveCtx || !ckid || !_cbRunKey) return;
    var _idx=_cbFindStepIdxByCkid(ckid); if(_idx<0) return;
    var o=cbResolve(_cbRunKey); if(!o||!o.it) return;
    var _steps=o.it.steps||[];
    if(_steps[_idx]){ _steps[_idx].output=String(msgText||''); _steps[_idx].result='info'; _steps[_idx].executed_at=_nowStr(); }
    if(_cbRunStep!==_idx){
      var _prev=_cbRunStep;
      _cbRunStep=_idx;
      if(!_cbMoveRunStep(_prev, _idx)){ try{ var _dt=document.getElementById('cb-detail'); if(_dt){ var _stp=_dt.scrollTop; _dt.innerHTML=cbExecHtml(); _dt.scrollTop=_stp; } }catch(_re){} }
      setTimeout(_cbScrollToRunStep, 30);
    } else {
      // 같은 스텝이면 output만 갱신
      _cbUpdateStep(_idx);
    }
    // 시청자에게도 브로드캐스트
    try{ _cbRunNotify('step',{ stepIdx:_idx, stepCnt:_steps.length, stepName:String(msgText||'').slice(0,120), stepAction:'메시지', stepOutput:String(msgText||'') }); }catch(_ne){}
  }catch(_e){}
}
// Tests 통합 엔진 실행 중 현재 스텝(TC checks id)을 사이클 UI의 실행 강조로 매핑.
function _cbBridgeRunStep(ckid){
  try{
    if(!_cycleLiveCtx || !ckid || !_cbRunKey) return;
    var _idx=_cbFindStepIdxByCkid(ckid); if(_idx<0) return;
    if(_cbRunStep===_idx) return;
    var _prev=_cbRunStep;
    _cbRunStep=_idx;
    // 부분 갱신 시도 (이전 강조 해제 + 새 강조). 실패 시 전체 재렌더로 폴백.
    var _partial=_cbMoveRunStep(_prev, _idx);
    if(!_partial){ try{ var _dt=document.getElementById('cb-detail'); if(_dt){ var _stp=_dt.scrollTop; _dt.innerHTML=cbExecHtml(); _dt.scrollTop=_stp; } }catch(_re){} }
    setTimeout(_cbScrollToRunStep, 30);
    // 다른 접속자에게도 진행 스텝 알림 (스텝 시작 시점만 pub)
    try{
      var o=cbResolve(_cbRunKey); if(o&&o.it){
        var _sp=(o.it.steps||[])[_idx]||{};
        _cbRunNotify('step',{ stepIdx:_idx, stepCnt:(o.it.steps||[]).length, stepName:String(_sp.desc||_sp.cli||'').slice(0,80), stepAction:String(_sp.action||'') });
      }
    }catch(_ne){}
  }catch(_e){}
}
function _cbResolveTcForItem(it, cy){
  if(!it) return null;
  var tc=tcList.find(function(t){return (t.tcid||t.id)===it.tcid;});
  var _tcHasChecks=!!(tc && Array.isArray(tc.checks) && tc.checks.length);
  // 같은 name 후보 (자기 자신 포함) 중 가장 풍부한(=for/if 포함 or checks 최대) TC 선택.
  // 사용자가 이름 같은 여러 TC를 만들고 실제 편집은 하나에만 집중하는 워크플로 지원.
  var _cands=tcList.filter(function(t){ return (t.name||'')===(it.name||'') && Array.isArray(t.checks) && t.checks.length>0; });
  if(!_cands.length) return tc||null;
  // 원본 tc가 후보에 있으면 후보 중 하나. 아니면 이름 매치만.
  // 우선순위: (1) 모델 필터 적용 시 스텝 생성 결과 있는 것, (2) for/if/loop 스텝 포함 개수, (3) checks 총 개수
  var _cyMdl=cy&&cy.model||'';
  var _score=function(t){
    var _s=(typeof _checksToSteps==='function')?_checksToSteps(t, _cyMdl):[];
    var _flowN=(t.checks||[]).filter(function(c){var k=c.kind||'cli';return k==='loop'||k==='if'||k==='switch';}).length;
    return {t:t, stepCnt:(_s?_s.length:0), flowN:_flowN, chkCnt:(t.checks||[]).length};
  };
  var _ranked=_cands.map(_score).sort(function(a,b){
    if(a.stepCnt!==b.stepCnt) return b.stepCnt-a.stepCnt;
    if(a.flowN!==b.flowN) return b.flowN-a.flowN;
    return b.chkCnt-a.chkCnt;
  });
  var _best=_ranked[0].t;
  // 원본 tc도 checks 있고 스텝 카운트가 최고와 같으면 원본 유지 (참조 재바인딩 회피)
  if(_tcHasChecks){
    var _origScore=_score(tc);
    if(_origScore.stepCnt===_ranked[0].stepCnt && _origScore.flowN===_ranked[0].flowN && _origScore.chkCnt===_ranked[0].chkCnt) return tc;
  }
  return _best;
}
// 사이클 아이템 열람 시 최신 TC 절차로 조용히 동기화 — 실행 결과(output/result)는 (cli,desc) 매칭으로 유지.
// 메모리(in-memory)만 갱신하고 saveCycle 은 호출하지 않음. 사용자가 명시적으로 스텝 상태를
// 변경(cbSetStepStatus 등)할 때 saveCycle 이 호출되며 그 시점에 fresh 결과도 함께 영속됨.
// (예전 여기서 saveCycle 호출 시 사용자가 편집한 result 가 (cli|desc) 매칭 실패로 리셋되어
//  Ctrl+Shift+R 이후 사라지는 문제 발생 → 자동 저장 제거)
function _cbAutoSyncItem(it, cy){
  if(!it) return;
  var tc=_cbResolveTcForItem(it, cy); if(!tc||!Array.isArray(tc.checks)||!tc.checks.length) return;
  // 모델 필터 적용해서 fresh 생성 → 만약 모델 필터에 걸려 0개면, 필터 없이 재시도 (모델 매핑 불일치 방어)
  var fresh=(typeof _checksToSteps==='function')?_checksToSteps(tc, cy&&cy.model):[];
  if(!fresh || !fresh.length){
    fresh=(typeof _checksToSteps==='function')?_checksToSteps(tc, ''):[];
  }
  if(!fresh||!fresh.length) return;
  // 이미 최신인지: fresh 스텝의 (cli,desc) 시퀀스와 it.steps 시퀀스가 일치하면 skip
  var _sig=function(arr){ return (arr||[]).map(function(s){return String(s.cli||'')+'|'+String(s.desc||'');}).join('\n'); };
  if(_sig(it.steps)===_sig(fresh)) return;
  // 결과 유지 매칭 (cli,desc → 옛 결과)
  var _oldMap={}; (it.steps||[]).forEach(function(s){ var _k=String(s.cli||'')+'||'+String(s.desc||''); if(!_oldMap[_k]) _oldMap[_k]=s; });
  var _rcMap={}; (tc.checks||[]).filter(function(c){var k=c.kind||'cli';return k==='cli'||k==='wait'||k==='call'||k==='manual'||k==='message';}).forEach(function(c){ var _k=String(c.cli||'')+'||'+String(c.desc||c.text||''); if(!_rcMap[_k]) _rcMap[_k]={out:c.output||'', at:c.executed_at||'', res:c.repeatResult||''}; });
  it.steps=fresh.map(function(s){
    var _k=String(s.cli||'')+'||'+String(s.desc||'');
    var ov=_oldMap[_k]||{}; var rc=_rcMap[_k]||{};
    // 메시지 스텝: 원본 output(마지막 회차 치환값)을 모든 회차에 복사하면 안 됨 → output 을 원문(desc)으로 두고 실행 시 브리지가 회차별로 채움
    if((s.action||'')==='메시지'){
      return Object.assign({}, s, {result:'', output:'', date:'', executed_at:''});
    }
    var _out=rc.out||ov.output||'';
    var _at=rc.at||ov.executed_at||ov.date||'';
    var _res=rc.res||ov.result||'';
    return Object.assign({}, s, {
      result:_cbNormResult(_res, s.action, _out, _at),
      output:_out,
      date:(_at?String(_at).slice(0,10):''),
      executed_at:_at||'',
      verdictMsg:(ov.verdictMsg||'')   // 이전에 저장된 IF 판정식 치환값(예: "1 GB == 1 GB && ...") 유지
    });
  });
  // 참조 재바인딩 (tcid 갱신) — in-memory 만. saveCycle 은 사용자 편집 시점에 위임.
  if((tc.tcid||tc.id) && (tc.tcid||tc.id)!==it.tcid) it.tcid=tc.tcid||tc.id;
  if(tc.name) it.name=tc.name;
}
function cbUpdateItemFromTC(key){
  const o=cbResolve(key); if(!o||!o.it||!o.cy) return;
  var tc=tcList.find(function(t){return (t.tcid||t.id)===o.it.tcid;});
  // 원본 tcid로 못 찾거나 그 TC가 빈껍데기(checks 없음) 인데 사이클엔 스텝이 있으면 잘못된 참조 가능성 → 이름으로 후보 찾기.
  var _tcEmpty=!tc||!Array.isArray(tc.checks)||!tc.checks.length;
  var _hasSteps=Array.isArray(o.it.steps)&&o.it.steps.length>0;
  if(_tcEmpty){
    var _cands=tcList.filter(function(t){ return (t.name||'')===(o.it.name||'') && Array.isArray(t.checks) && t.checks.length>0; });
    if(_cands.length===1){
      var _nt=_cands[0];
      uiConfirm({title:'TC 참조 재연결', icon:'ti-link', msg:'등록된 tcid ('+(o.it.tcid||'-')+') 의 절차가 비어있습니다.<br>같은 이름의 다른 TC로 재연결할까요?<br><br><b style="color:var(--blue);">'+((_nt.tcid||_nt.id)||'')+'</b> · '+((_nt.checks||[]).length)+'단계<br><span style="color:var(--text3);font-size:12px;">('+(_nt.name||'')+')</span>', confirmText:'재연결 후 업데이트', onConfirm:function(){ o.it.tcid=_nt.tcid||_nt.id; _cbDoUpdateItemFromTC(o,_nt); }});
      return;
    }
    if(_cands.length>1){
      var _list=_cands.map(function(t){ return '<div style="padding:5px 8px;border-radius:6px;background:#fafbfc;margin:4px 0;cursor:pointer;font-size:11.5px;" onclick="_cbReconnectTcAndUpdate(\''+key.replace(/\\/g,"\\\\").replace(/'/g,"\\'")+'\',\''+(t.tcid||t.id).replace(/\\/g,"\\\\").replace(/'/g,"\\'")+'\')"><b>'+(t.tcid||t.id)+'</b> · '+((t.checks||[]).length)+'단계</div>'; }).join('');
      uiConfirm({title:'TC 참조 재연결', icon:'ti-link', msg:'같은 이름의 TC가 여러 개 있습니다. 하나를 선택하세요:<br>'+_list, confirmText:'취소', onConfirm:function(){}});
      return;
    }
    if(!tc){ if(typeof showToast==='function')showToast('원본 TC를 찾을 수 없습니다 (tcid='+(o.it.tcid||'-')+')'); return; }
    if(!_hasSteps){ if(typeof showToast==='function')showToast('원본 TC의 절차가 비어있습니다'); return; }
  }
  uiConfirm({title:'현재 TC로 업데이트', icon:'ti-refresh', msg:'이 항목의 절차·실행 결과를 현재 TC 최신 버전으로 업데이트할까요?<br><span style="color:var(--text3);font-size:12px;">(TC Step 의 실행 결과(Actual Data)가 함께 반영됩니다)</span>', confirmText:'업데이트', onConfirm:function(){ _cbDoUpdateItemFromTC(o,tc); }});
}
// 다중 후보 선택 시 호출 — 재연결 후 업데이트
function _cbReconnectTcAndUpdate(key, newTcid){
  var o=cbResolve(key); if(!o||!o.it||!o.cy) return;
  var tc=tcList.find(function(t){return (t.tcid||t.id)===newTcid;}); if(!tc) return;
  o.it.tcid=newTcid;
  try{ var _m=document.getElementById('ui-confirm'); if(_m) _m.remove(); }catch(_e){}
  _cbDoUpdateItemFromTC(o,tc);
}
async function _cbDoUpdateItemFromTC(o,tc){
  // 현재 TC 절차 → 사이클용 스텝 리스트로 변환 (for 루프 전개, 모델 필터 적용 → 생성 시점과 동일 규칙).
  const fresh=(typeof _checksToSteps==='function')?_checksToSteps(tc, o.cy&&o.cy.model):[];
  // 결과(output/repeatResult) 유지 정책:
  // fresh 는 for 전개된 배열이라 tc.checks 인덱스와 다르다 → 인덱스 매칭이 아니라 cli+desc 조합으로 매칭.
  // 실제 실행 결과가 TC Step 에 남아 있으면 같은 (cli,desc) 스텝에 복원, 없으면 기존 사이클 결과를 같은 (cli,desc)에 붙임.
  const _rcAll=(tc.checks||[]).filter(function(c){var k=c.kind||'cli';return k==='cli'||k==='wait'||k==='call'||k==='manual'||k==='message';});
  var _rcMap={};   // key = cli|desc → 첫 매칭
  _rcAll.forEach(function(c){ var _key=String(c.cli||'')+'||'+String(c.desc||c.text||''); if(!_rcMap[_key]) _rcMap[_key]={out:c.output||'', at:c.executed_at||'', res:c.repeatResult||'', n2x:c.n2xStats||null, n2xn:c.n2xNames||null, n2xe:c.n2xElapsed||0}; });
  const old=o.it.steps||[];
  var _oldMap={};
  old.forEach(function(s){ var _key=String(s.cli||'')+'||'+String(s.desc||''); if(!_oldMap[_key]) _oldMap[_key]={out:s.output||'', at:s.date||'', res:s.result||'', n2x:s.n2xStats||null, n2xn:s.n2xNames||null, n2xe:s.n2xElapsed||0}; });
  o.it.steps=fresh.map(function(s){
    var _key=String(s.cli||'')+'||'+String(s.desc||'');
    var rc=_rcMap[_key]||{}; var ov=_oldMap[_key]||{};
    var _out=rc.out||ov.out||'';
    var _at=rc.at||ov.at||'';
    var _res=rc.res||ov.res||'';
    return Object.assign({}, s, {
      result:_cbNormResult(_res, s.action, _out, _at),
      output:_out,
      date:(_at?String(_at).slice(0,10):''),
      executed_at:_at||'',
      n2xStats:(rc.n2x||ov.n2x||null),
      n2xNames:(rc.n2xn||ov.n2xn||null),
      n2xElapsed:(rc.n2xe||ov.n2xe||0)
    });
  });
  o.it.name=tc.name||o.it.name;
  try{ await saveCycle(o.cy); }catch(e){}
  const c2=document.getElementById('cb-col2body'); if(c2)c2.innerHTML=cbCol2Html();
  const dt=document.getElementById('cb-detail'); if(dt) dt.innerHTML=(typeof cbExecHtml==='function')?cbExecHtml():dt.innerHTML;
  if(typeof cbRefreshItems==='function') cbRefreshItems();
  if(typeof showToast==='function') showToast('현재 TC 절차로 업데이트됨 ('+fresh.length+'단계)');
}
// 사이클 인라인: 원본 TC에 등록된 이슈(issue_list)·시험 이력(result_history) 읽기전용 표시
function cbTcRefHtml(tc, which){
  if(!tc) return '';
  const e=_bdEsc; const iss=tc.issue_list||[]; const his=tc.result_history||[];
  const _opn=iss.filter(function(x){ return !/clos|reject|resolv|done|fixed|완료|해결/i.test(String(x.status||'')); }).length;   // 미해결(close·reject=해결)
  const _th='padding:5px 8px;text-align:left;font-size:10px;font-weight:600;color:#888;';
  const _td='padding:5px 8px;font-size:11.5px;';
  let h=''; if(which!=='history'){ h+='<div style="border-top:9px solid #f2f3f5;padding:10px 14px;">'
    +'<div style="font-size:12.5px;font-weight:800;color:var(--text2);margin-bottom:8px;display:flex;align-items:center;gap:6px;"><i class="ti ti-bug" style="color:#c0392b;"></i> TC 등록 이슈 <span style="font-size:9.5px;color:var(--text3);font-weight:600;">(현재 TC 기준 · live)</span> <span title="미해결 '+_opn+' / 전체 '+iss.length+' (close·reject 는 해결)" style="font-size:10px;color:#fff;background:'+(iss.length?(_opn?'#c0392b':'#00875a'):'#b9c0cc')+';border-radius:8px;padding:1px 7px;">'+_opn+'/'+iss.length+'</span><span style="flex:1;"></span><button onclick="cbAddIssue()" title="이번 시험 결함을 Jira에 새 이슈로 생성(push)" style="font-size:10.5px;padding:4px 11px;border-radius:6px;border:1px solid #c0392b66;background:#fff;color:#c0392b;cursor:pointer;font-weight:700;"><i class="ti ti-bug" style="font-size:11px;"></i> 이슈 생성(Jira)</button></div>';
  h+=iss.length?('<table style="width:100%;border-collapse:collapse;"><thead><tr style="background:#f8f9fb;"><th style="'+_th+'">Key</th><th style="'+_th+'">Type</th><th style="'+_th+'">Status</th><th style="'+_th+'">Summary</th></tr></thead><tbody>'+iss.map(function(x){ return '<tr><td style="'+_td+'font-family:monospace;color:#2684ff;font-weight:700;">'+(x.url?'<a href="'+e(x.url)+'" target="_blank" style="color:#2684ff;text-decoration:none;">'+e(x.key||'')+'</a>':e(x.key||''))+'</td><td style="'+_td+'">'+e(x.issue_type||x.type||'')+'</td><td style="'+_td+'">'+e(x.status||'')+'</td><td style="'+_td+'">'+e(x.summary||'')+'</td></tr>'; }).join('')+'</tbody></table>'):'<div style="font-size:11.5px;color:var(--text3);">등록된 이슈 없음</div>';
  h+='</div>'; } if(which!=='issue'){ h+='<div style="border-top:1px solid var(--border);padding:10px 14px;">'
    +'<div style="font-size:12.5px;font-weight:800;color:var(--text2);margin-bottom:8px;display:flex;align-items:center;gap:6px;"><i class="ti ti-history" style="color:#2d6fd4;"></i> TC 시험 이력 <span style="font-size:9.5px;color:var(--text3);font-weight:600;">(현재 TC 기준 · live)</span> <span style="font-size:10px;color:#fff;background:'+(his.length?'#2d6fd4':'#b9c0cc')+';border-radius:8px;padding:1px 7px;">'+his.length+'</span></div>';
  h+=his.length?('<table style="width:100%;border-collapse:collapse;"><thead><tr style="background:#f8f9fb;"><th style="'+_th+'">Summary</th><th style="'+_th+'">결과</th><th style="'+_th+'">실행일/실행자</th></tr></thead><tbody>'+his.map(function(x){ var pass=x.result==='Pass'; return '<tr><td style="'+_td+'">'+e(x.summary||'')+'</td><td style="'+_td+'"><span style="font-size:10px;padding:1px 8px;border-radius:8px;font-weight:600;background:'+(pass?'rgba(0,168,114,0.1)':'rgba(229,62,90,0.1)')+';color:'+(pass?'var(--green)':'var(--red)')+';">'+e(x.result||'-')+'</span></td><td style="'+_td+'color:var(--text3);">'+e(x.date||'')+(x.executor?(' ('+e(x.executor)+')'):'')+'</td></tr>'; }).join('')+'</tbody></table>'):'<div style="font-size:11.5px;color:var(--text3);">시험 이력 없음</div>';
  h+='</div>'; }
  return h;
}
function cbIssuesHtml(){
  if(!cbSelItem) return '';
  const o=cbResolve(cbSelItem); if(!o.it) return '';
  const e=_bdEsc; const issues=o.it.issues||[];
  const rows=issues.length?issues.map(function(iss,idx){
    const stc=/done|완료|closed|resolved|해결/i.test(iss.status||'')?'#00a872':/progress|진행/i.test(iss.status||'')?'#2d6fd4':'#e8820c';
    return '<div style="display:flex;align-items:center;gap:9px;padding:9px 14px;border-bottom:1px solid #eef0f3;">'+
      '<i class="ti ti-brand-jira" style="color:#2684ff;font-size:17px;flex-shrink:0;"></i>'+
      (iss.url?('<a href="'+e(iss.url)+'" target="_blank" style="font-family:monospace;font-size:11.5px;color:#2684ff;font-weight:800;text-decoration:none;flex-shrink:0;">'+e(iss.key||'')+'</a>'):('<span style="font-family:monospace;font-size:11.5px;color:#2684ff;font-weight:800;flex-shrink:0;">'+e(iss.key||'')+'</span>'))+
      '<span style="flex:1;min-width:0;font-size:12px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+e(iss.summary||'')+'</span>'+
      (iss.status?('<span style="font-size:9.5px;font-weight:700;color:#fff;background:'+stc+';border-radius:8px;padding:1px 9px;flex-shrink:0;">'+e(iss.status)+'</span>'):'')+
      '<button onclick="cbEditIssue('+idx+')" title="수정" style="width:21px;height:21px;border-radius:5px;border:1px solid var(--border);background:#fff;color:var(--text3);cursor:pointer;padding:0;flex-shrink:0;"><i class="ti ti-edit" style="font-size:11px;"></i></button>'+
      '<button onclick="cbDelIssue('+idx+')" title="연결 해제" style="width:21px;height:21px;border-radius:5px;border:1px solid #f0c2cb;background:#fff;color:var(--red);cursor:pointer;padding:0;flex-shrink:0;"><i class="ti ti-x" style="font-size:11px;"></i></button>'+
    '</div>';
  }).join(''):'<div style="padding:18px;text-align:center;color:var(--text3);font-size:12px;">연결된 이슈가 없습니다 · [이슈 연결]로 추가</div>';
  return '<div style="border-top:9px solid #f2f3f5;">'+
    '<div style="padding:10px 14px;background:#fafbfc;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;position:sticky;top:0;"><i class="ti ti-brand-jira" style="color:#2684ff;font-size:16px;"></i><span style="font-size:12.5px;font-weight:800;color:var(--text2);">Jira 이슈 연결</span><span style="font-size:10px;color:#fff;background:'+(issues.length?'#2684ff':'#b9c0cc')+';border-radius:8px;padding:1px 7px;font-weight:700;">'+issues.length+'</span><span style="flex:1;"></span><button onclick="cbLinkIssue()" title="기존 Jira 이슈를 검색·키 입력하여 연결" style="font-size:11px;padding:5px 12px;border-radius:6px;border:1px solid #2684ff66;background:#fff;color:#2684ff;cursor:pointer;font-weight:700;"><i class="ti ti-search"></i> 기존 이슈 연결</button></div>'+
    rows+'</div>';
}
// ── TC Topology(topo2)를 캔버스에 그려 PNG dataURL 생성 (Jira 이슈 구성도 첨부용) ──
function _cbRrPath(g,x,y,w,h,r){ g.beginPath(); g.moveTo(x+r,y); g.arcTo(x+w,y,x+w,y+h,r); g.arcTo(x+w,y+h,x,y+h,r); g.arcTo(x,y+h,x,y,r); g.arcTo(x,y,x+w,y,r); g.closePath(); }
function _cbTopo2ToPng(tc){
  try{
    var t2=tc&&tc.topo2; if(!t2||!Array.isArray(t2.nodes)||!t2.nodes.length) return '';
    var nodes=t2.nodes, links=Array.isArray(t2.links)?t2.links:[];
    var NW=182,NH=86,GX=38,GY=46;
    // 자동 배치 (Topology 화면 tcTopo2Inner와 동일 규칙)
    var order=['계측기','L3 스위치','L2 스위치','OLT','ONT','PC/서버','Cloud','기타'];
    var rk=function(r){ var i=order.indexOf(r); return i<0?99:i; };
    var tiers={}; nodes.forEach(function(n){ var k=rk(n.role); (tiers[k]=tiers[k]||[]).push(n); });
    var auto={}; Object.keys(tiers).map(Number).sort(function(a,b){return a-b;}).forEach(function(k,ti){ tiers[k].forEach(function(n,ci){ auto[n.id]={x:ci*(NW+GX)+30,y:ti*(NH+GY)+12}; }); });
    var maxX=0,maxY=0,pos={};
    nodes.forEach(function(n){ var p=(typeof n.x==='number'&&typeof n.y==='number')?{x:n.x,y:n.y}:(auto[n.id]||{x:30,y:12}); pos[n.id]=p; maxX=Math.max(maxX,p.x+NW); maxY=Math.max(maxY,p.y+NH); });
    var W=maxX+30, H=maxY+30, S=2;   // 2배 스케일 → 선명한 PNG
    var cv=document.createElement('canvas'); cv.width=W*S; cv.height=H*S;
    var g=cv.getContext('2d'); g.scale(S,S);
    g.fillStyle='#ffffff'; g.fillRect(0,0,W,H);
    var colOf=function(n){ try{ return (typeof DEVICE_ROLE_COLORS!=='undefined'&&DEVICE_ROLE_COLORS[n.role])||'#888'; }catch(e){ return '#888'; } };
    // 결선 (포트 라벨 포함)
    links.forEach(function(lk){
      var a=pos[lk.a],b=pos[lk.b]; if(!a||!b) return;
      var ax=a.x+NW/2, ay=a.y+NH/2, bx=b.x+NW/2, by=b.y+NH/2;
      var lg=false;
      try{ var na=nodes.find(function(x){return x.id===lk.a;}), nb=nodes.find(function(x){return x.id===lk.b;});
        lg=!!((na&&(na.logical||[]).some(function(l){return l.name===lk.ap;}))||(nb&&(nb.logical||[]).some(function(l){return l.name===lk.bp;}))); }catch(e){}
      var lc=lg?'#7c3aed':'#2d6fd4';
      g.strokeStyle=lc; g.lineWidth=lg?4:2; g.globalAlpha=0.65;
      g.beginPath(); g.moveTo(ax,ay); g.lineTo(bx,by); g.stroke(); g.globalAlpha=1;
      var lbl=(lk.ap||'')+' ↔ '+(lk.bp||''); var mx=(ax+bx)/2,my=(ay+by)/2;
      g.font='700 11px ui-monospace,monospace'; var lw=g.measureText(lbl).width+14;
      g.fillStyle='#fff'; g.strokeStyle=lc; g.lineWidth=1.2;
      _cbRrPath(g,mx-lw/2,my-10,lw,20,6); g.fill(); g.stroke();
      g.fillStyle=lc; g.textAlign='center'; g.textBaseline='middle'; g.fillText(lbl,mx,my+0.5);
      g.textBaseline='alphabetic';
    });
    // 장비 노드 카드
    nodes.forEach(function(n,i){
      var p=pos[n.id], c=colOf(n);
      g.fillStyle='#fff'; g.strokeStyle=c; g.lineWidth=1.5;
      _cbRrPath(g,p.x,p.y,NW,NH,9); g.fill(); g.stroke();
      g.fillStyle=c; g.fillRect(p.x+1,p.y,NW-2,3);
      g.textAlign='left';
      g.fillStyle=c; g.font='800 11px sans-serif'; g.fillText('#'+(i+1),p.x+9,p.y+18);
      g.fillStyle='#1c1f27'; g.font='700 13px sans-serif'; g.fillText(String(n.model||'').slice(0,20),p.x+9,p.y+40);
      g.fillStyle='#667085'; g.font='11px sans-serif'; g.fillText(String(n.role||''),p.x+9,p.y+57);
      if(n.ip){ g.fillStyle='#2d6fd4'; g.font='11px ui-monospace,monospace'; g.fillText(String(n.ip),p.x+9,p.y+74); }
    });
    return cv.toDataURL('image/png');
  }catch(e){ return ''; }
}
// TC의 Topology 구성도 PNG + 텍스트([장비 배치]/[결선]/[로지컬]) — 수동·자동 이슈 등록 공용
function _cbTopoForTc(tcid){
  var fullTC=null;
  try{ if(typeof tcList!=='undefined'&&Array.isArray(tcList)) fullTC=tcList.find(function(t){return (t.tcid===tcid)||(t.id===tcid);}); }catch(e){}
  var img='';
  try{ var cv=document.getElementById('topo-canvas-tc-'+tcid); if(cv&&cv.toDataURL) img=cv.toDataURL('image/png'); }catch(e){}
  if(!img&&fullTC) img=fullTC.topo_image||'';
  var topoText='';
  try{
    var t2=fullTC&&fullTC.topo2;
    if(t2){
      if(!img&&t2.bgImage) img=t2.bgImage;
      var nds=Array.isArray(t2.nodes)?t2.nodes:[], lks=Array.isArray(t2.links)?t2.links:[];
      if(nds.length){
        topoText='[장비 배치]\n'+nds.map(function(n,i){ return '#'+(i+1)+' '+(n.role?('['+n.role+'] '):'')+(n.model||'')+(n.ip?(' ('+n.ip+')'):''); }).join('\n');
        if(lks.length){
          var byId={}; nds.forEach(function(n,i){ byId[n.id]={n:n,no:i+1}; });
          topoText+='\n\n[결선]\n'+lks.map(function(lk){ var a=byId[lk.a],b=byId[lk.b];
            return '#'+(a?a.no:'?')+' '+(a?(a.n.model||''):'')+' '+(lk.ap||'')+' ↔ #'+(b?b.no:'?')+' '+(b?(b.n.model||''):'')+' '+(lk.bp||''); }).join('\n');
        }
        var lgs=[]; nds.forEach(function(n){ (n.logical||[]).forEach(function(l){ lgs.push((n.model||'')+' '+(l.name||'')+(l.type?(' ['+l.type+']'):'')); }); });
        if(lgs.length) topoText+='\n\n[로지컬 인터페이스]\n'+lgs.join('\n');
      }
    }
  }catch(e){}
  if(!img){ try{ img=_cbTopo2ToPng(fullTC); }catch(e){} }   // 이미지 없으면 다이어그램을 캔버스로 그려 PNG 생성
  return {img:img||'', text:topoText, tc:fullTC};
}
function cbAddIssue(){
  const o=cbResolve(cbSelItem); if(!o.it){showToast('TC를 먼저 선택하세요');return;}
  if(typeof jiraIssueOpen!=='function'){ if(typeof showToast==='function')showToast('Jira 모듈 로드 오류 — 새로고침'); return; }
  const it=o.it, cy=o.cy||{};
  const tcid=it.tcid||it.id||'';
  var fullTC=null;
  try{ if(typeof tcList!=='undefined'&&Array.isArray(tcList)) fullTC=tcList.find(function(t){return (t.tcid===tcid)||(t.id===tcid);}); }catch(e){}
  const title=it.name||(fullTC&&(fullTC.title||fullTC.name))||tcid||'TC';
  // 구성도 PNG + Topology 텍스트 (공용 헬퍼)
  var _tp0=_cbTopoForTc(tcid); var img=_tp0.img, topoText=_tp0.text;
  // TC 스텝 배열 조합 — cbExecHtml과 동일한 로직으로 Test Procedure Details 내용 그대로 반영
  var tcSteps=[];
  try{
    var _inclAct2=function(a){ if(!a) return true; return a.indexOf('Traffic')>=0||a.indexOf('ARP')>=0||a.indexOf('REST')>=0||a.indexOf('Ping')>=0||a==='CLI'||a==='SNMP'||a.indexOf('SNMP')>=0||a==='대기'||a==='호출'||a==='계측기'; };
    var _freshAll2=fullTC?(_checksToSteps?_checksToSteps(fullTC):(fullTC.checks||fullTC.steps||[])):[];
    var _itSteps=(it.steps&&it.steps.length)?it.steps:[];
    // cbExecHtml처럼: 사이클 실행 스냅샷 우선, 없으면 TC 원본
    var _src=_itSteps.length?_itSteps:_freshAll2;
    _src.forEach(function(sp,i){
      if(!sp) return;
      var fr=(_itSteps.length&&_freshAll2[i])||{};
      var act=sp.action||fr.action||sp.cli||fr.cli||'CLI';
      if(!_inclAct2(act)) return;
      var vrd=sp.result||sp.repeatResult||sp.verdict||'';
      if(/^pass$/i.test(vrd)) vrd='Pass';
      else if(/^fail$/i.test(vrd)) vrd='Fail';
      tcSteps.push({
        cmd:   sp.cli||fr.cli||sp.cmd||fr.cmd||'',
        action: sp.desc||fr.desc||act,
        expected: sp.criteria||fr.criteria||sp.expected||fr.expected||'',
        repeatOutput: String(sp.output||sp.repeatOutput||sp.actual||'').replace(/\n*─── (?:표 검증|기준 비교|판정 근거) ───[\s\S]*$/,'').replace(/\s+$/,''),
        repeatResult: vrd,
        rca: (function(){ try{ if(vrd!=='Fail') return ''; var _rs=''; try{ _rs=(typeof _failDetail==='function')?_failDetail({type:sp.type||fr.type||'contains',criteria:sp.criteria||fr.criteria||sp.expected||fr.expected||'',excludeLines:sp.excludeLines||fr.excludeLines||'',output:String(sp.output||''),repeatResult:'Fail'},String(sp.output||'').split(/\r?\n/),null):''; }catch(e){} if(!_rs){ try{ _rs=(typeof _judgeReason==='function')?_judgeReason(String(sp.output||''),sp.criteria||fr.criteria||'',sp.type||fr.type||'contains',sp.excludeLines||fr.excludeLines||'','Fail'):''; }catch(e){} } return String(_rs||'').slice(0,200); }catch(e){ return ''; } })()
      });
    });
  }catch(e){}
  var ctx='[Cycle '+(cy.name||cy.id||'')+(cy.model?(' · '+cy.model):'')+(cy.version?(' · '+cy.version):'')+']\n'+it.name;
  var purpose=(fullTC&&(fullTC.object_md||fullTC.object||fullTC.overview||fullTC.purpose))||'';
  var precondition=(fullTC&&(fullTC.precondition_md||fullTC.precondition))||'';
  jiraIssueOpen({
    summary:(title+' — 결함').slice(0,200),
    phenomenon: ctx,
    purpose: purpose,
    precondition: precondition,
    image: img,
    topoText: topoText,
    tcSteps: tcSteps,
    labels:['utop','cycle'],
    onCreated:function(key,url){
      o.it.issues=Array.isArray(o.it.issues)?o.it.issues:[];
      o.it.issues.push({key:key,summary:(title+' — 결함').slice(0,120),url:url,status:'Open'});
      saveCycle(o.cy); cbRefreshItems();
    }
  });
}
function cbEditIssue(idx){
  const o=cbResolve(cbSelItem); if(!o.it||!Array.isArray(o.it.issues)||!o.it.issues[idx])return;
  const iss=o.it.issues[idx];
  const key=prompt('Jira 이슈 키',iss.key||''); if(key===null)return;
  const summary=prompt('이슈 제목/요약',iss.summary||''); if(summary===null)return;
  const url=prompt('Jira URL',iss.url||''); if(url===null)return;
  const status=prompt('상태',iss.status||''); if(status===null)return;
  o.it.issues[idx]={key:key.trim(),summary:summary.trim(),url:url.trim(),status:status.trim()};
  saveCycle(o.cy); cbRefreshItems();
}
function cbDelIssue(idx){
  const o=cbResolve(cbSelItem); if(!o.it||!Array.isArray(o.it.issues))return;
  uiConfirm({title:'이슈 연결 해제', icon:'ti-unlink', danger:true, confirmText:'해제', msg:'이 이슈 연결을 해제할까요?', onConfirm:function(){
    o.it.issues.splice(idx,1); saveCycle(o.cy); cbRefreshItems();
  }});
}
// 기존 Jira 이슈를 키로 연결 (검색 UI는 추후 확장 — 우선 키/요약/URL 입력)
function cbLinkIssue(){
  const o=cbResolve(cbSelItem); if(!o.it){ if(typeof showToast==='function')showToast('TC를 먼저 선택하세요'); return; }
  const key=prompt('연결할 기존 Jira 이슈 키 (예: PROJ-123)',''); if(key===null) return; if(!key.trim()){ if(typeof showToast==='function')showToast('이슈 키를 입력하세요'); return; }
  const summary=prompt('이슈 제목/요약 (선택)',''); if(summary===null) return;
  const url=prompt('Jira URL (선택)',''); if(url===null) return;
  const status=prompt('상태 (선택)',''); if(status===null) return;
  o.it.issues=Array.isArray(o.it.issues)?o.it.issues:[];
  o.it.issues.push({key:key.trim(), summary:(summary||'').trim(), url:(url||'').trim(), status:(status||'').trim()});
  saveCycle(o.cy); cbRefreshItems(); if(typeof showToast==='function')showToast('기존 이슈 연결됨: '+key.trim());
}
var _cbSelectDebounce=null;
var _cbLastSelectKey=null;
async function cbSelectItem(key){
  // ★ 같은 TC 를 짧은 시간(300ms) 안에 여러 번 클릭하면 무시 (실수·더블클릭·연타)
  //   실제 토글 동작(선택 해제) 은 그대로 지원하지만 렌더링만 스킵.
  var _now=Date.now();
  if(_cbLastSelectKey===key && _cbSelectDebounce && (_now-_cbSelectDebounce)<300){
    _cbSelectDebounce=_now;
    return;
  }
  _cbLastSelectKey=key; _cbSelectDebounce=_now;

  cbSelItem=(cbSelItem===key?null:key);
  // 다른 TC 로 전환 시 "전체보기" 로 확장된 상태(_cbExecLimit) 를 기본값(50) 으로 리셋
  try{ if(typeof _cbExecLimit!=='undefined') _cbExecLimit=50; if(typeof _cbExecShowAll!=='undefined') _cbExecShowAll=false; }catch(_e){}
  // 선택된 TC의 풀 데이터(이슈·시험 이력)를 서버에서 로드해 tcList에 반영
  if(cbSelItem){ try{ const o=cbResolve(cbSelItem); const tcid=o&&o.it&&o.it.tcid; if(tcid){ const r=await fetch('/api/tc/'+_tcUrl(tcid)); if(r.ok){ const d=await r.json(); if(d&&(d.tcid||d.id)){ const i=tcList.findIndex(t=>(t.tcid||t.id)===tcid); if(i>=0) tcList[i]={...tcList[i],...d}; else tcList.push(d); } } } }catch(e){} }
  try{ localStorage.setItem('utop_cbselitem', cbSelItem||''); }catch(e){}   // 새로고침 후에도 선택 유지
  const c2=document.getElementById('cb-col2body'); if(c2)c2.innerHTML=cbCol2Html();
  const dt=document.getElementById('cb-detail'); if(dt)dt.innerHTML=cbExecHtml();
}
async function cbSetStepStatus(key,si,statusKey){ const o=cbResolve(key); if(!o.it)return; if(!Array.isArray(o.it.steps)||!o.it.steps.length){ const _t=tcList.find(x=>(x.tcid||x.id)===o.it.tcid); o.it.steps=(typeof _checksToSteps==='function')?_checksToSteps(_t||{}):[]; } if(!o.it.steps[si])return; const val={'예정':'','PASS':'Pass','FAIL':'Fail','미구현':'미구현','미지원':'미지원','제외':'제외'}[statusKey]; o.it.steps[si].result=val; o.it.steps[si].date=val?new Date().toISOString().slice(0,10):''; await saveCycle(o.cy); const c2=document.getElementById('cb-col2body'); if(c2)c2.innerHTML=cbCol2Html(); const dt=document.getElementById('cb-detail'); if(dt)dt.innerHTML=cbExecHtml(); { const _s=o.it.steps[si]; cbLogStep((o.it.name||o.it.tcid||'')+' · Step'+(si+1), (_s.cli||_s.action||''), val||statusKey, 'manual', {tcid:o.it.tcid, model:o.cy&&o.cy.model, version:o.cy&&o.cy.version}); } _cbCheckComplete(o.cy); }
function cbRefreshItems(){ const t=document.getElementById('cb-tree'); if(t)t.innerHTML=cbTreeHtml(); const c2=document.getElementById('cb-col2body'); if(c2)c2.innerHTML=cbCol2Html(); const dt=document.getElementById('cb-detail'); if(dt)dt.innerHTML=cbExecHtml(); const ft=document.getElementById('cb-col2foot'); if(ft)ft.innerHTML=cbCol2FootHtml(); }
function _cbPopDrag(e, id){   // 헤더 드래그로 팝업 이동 (transform 누적 — 위치/margin 변경 없어 클릭 시 튐 없음)
  if(e.target.closest&&(e.target.closest('button')||e.target.closest('input')||e.target.closest('select'))) return;
  const d=document.getElementById(id); if(!d) return;
  let bx=0, by=0; const mt=String(d.style.transform||'').match(/translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px/);
  if(mt){ bx=parseFloat(mt[1])||0; by=parseFloat(mt[2])||0; }
  const sx=e.clientX, sy=e.clientY;
  const mv=function(ev){ d.style.transform='translate('+(bx+ev.clientX-sx)+'px,'+(by+ev.clientY-sy)+'px)'; };
  const up=function(){ document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up); };
  document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up);
  e.preventDefault();
}
async function cbHistoryPopup(){
  if(typeof loadDeviceData==='function' && (typeof modelList==='undefined'||!modelList||!modelList.length)){ try{ await loadDeviceData(); }catch(e){} }   // 모델→제품군(그룹) 해석용 modelList 보장
  let m=document.getElementById('cb-hist-pop'); if(m)m.remove();
  m=document.createElement('div'); m.id='cb-hist-pop'; m.className='modal-overlay'; m.style.display='flex';
  m.addEventListener('click',function(e){ if(e.target===m)m.remove(); });
  m.innerHTML='<div id="cb-hist-dialog" onclick="event.stopPropagation()" style="width:1700px;max-width:98vw;height:86vh;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.4);display:flex;flex-direction:column;">'+
    '<div onmousedown="_cbPopDrag(event,\'cb-hist-dialog\')" style="padding:11px 16px;border-bottom:1px solid var(--border);background:#f0eefc;display:flex;align-items:center;gap:8px;cursor:move;" title="드래그하여 이동"><i class="ti ti-arrows-move" style="font-size:14px;color:#7c3aed;opacity:0.55;"></i><i class="ti ti-history" style="font-size:17px;color:#7c3aed;"></i><span style="font-size:14px;font-weight:800;color:#7c3aed;">Test History Result · 시험 이력</span><span style="flex:1;"></span>'+
      '<button onclick="cbLogClear()" title="시험 로그 지우기" style="font-size:11px;padding:4px 11px;border-radius:6px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;font-weight:600;"><i class="ti ti-trash" style="font-size:12px;"></i> 지우기</button>'+
      '<button onclick="document.getElementById(\'cb-hist-pop\').remove()" style="font-size:11px;padding:4px 13px;border-radius:6px;border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:700;">닫기</button>'+
    '</div>'+
    _cbLogFilterBarWrap()+
    '<div style="flex:1;overflow:auto;" id="cb-exec">'+cbLogHtml()+'</div>'+
  '</div>';
  document.body.appendChild(m);
}
function cbTreeToggle(k){ if(cbTreeOpen.has(k))cbTreeOpen.delete(k); else cbTreeOpen.add(k); const t=document.getElementById('cb-tree'); if(t)t.innerHTML=cbTreeHtml(); }
function cbTreeSelect(level,p,m,g,v){   // p=모델그룹, m=모델명, g=버전그룹, v=버전
  cbSel.project=''; cbSel.mgroup=(p||''); cbSel.model=(level==='mgroup')?'':(m||''); cbSel.vgroup=(level==='mgroup'||level==='model')?'':(g||''); cbSel.version=(level==='version')?(v||''):'';
  cbSelItem=null; cbItemSel.clear(); cbStatFilter='';
  // 다른 사이클/모델/그룹 선택 시 "전체보기" 확장 상태 리셋 → 다음 렌더는 기본 50개 슬림 뷰
  try{ if(typeof _cbExecLimit!=='undefined') _cbExecLimit=50; if(typeof _cbExecShowAll!=='undefined') _cbExecShowAll=false; }catch(_e){}
  // 클릭은 선택만 — 접기/펴기는 '>' 캐럿으로만. 조상 경로만 열림 유지(자기 노드는 안 폄)
  if(p&&level!=='mgroup'){ cbTreeOpen.add('mg@@'+p); if(m&&level!=='model'){ cbTreeOpen.add('m@@'+p+'@@'+m); if(g&&level!=='vgroup') cbTreeOpen.add('g@@'+p+'@@'+m+'@@'+g); } }
  cbSaveSel(); renderCycleBoard();
  // 사이클(버전) 선택 시 주소창에 공유 URL(#cycle=ID) — TC 딥링크처럼
  try{ if(level==='version'){ var _cy=(typeof cbCurrentCycle==='function')?cbCurrentCycle():null; if(_cy&&_cy.id) history.replaceState(null,'',location.pathname+location.search+'#cycle='+encodeURIComponent(_cy.id)); } else if(location.hash.indexOf('cycle=')>=0){ history.replaceState(null,'',location.pathname+location.search); } }catch(e){}
}
// #cycle=ID 딥링크 → 그 사이클 선택 (보드 로드 후 호출)
function cbApplyCycleHash(){
  try{ var m=(location.hash||'').match(/[#&]cycle=([^&]+)/); if(!m)return; var id=decodeURIComponent(m[1]);
    var cy=(typeof cycleList!=='undefined'?cycleList:[]).find(function(c){return c.id===id;}); if(!cy)return;
    cbSel.project=''; cbSel.mgroup=(typeof _cycMGroup==='function'?_cycMGroup(cy):''); cbSel.model=cy.model||''; cbSel.vgroup=cy.version_group||'(미분류)'; cbSel.version=cy.version||'';
    if(cbSel.mgroup){ cbTreeOpen.add('mg@@'+cbSel.mgroup); if(cbSel.model){ cbTreeOpen.add('m@@'+cbSel.mgroup+'@@'+cbSel.model); if(cbSel.vgroup)cbTreeOpen.add('g@@'+cbSel.mgroup+'@@'+cbSel.model+'@@'+cbSel.vgroup); } }
    cbSaveSel(); if(typeof renderCycleBoard==='function') renderCycleBoard();
  }catch(e){}
}
function cbTreeDblEdit(level,p,m,g,v){   // 버전(사이클) 더블클릭 → 우클릭 '사이클 수정'과 동일한 인페이지 팝업
  if(level!=='version')return;
  cbSel.project=''; cbSel.mgroup=p||''; cbSel.model=m||''; cbSel.vgroup=g||''; cbSel.version=v||''; cbSaveSel();
  if(typeof openEditCycleTC==='function') openEditCycleTC();   // 우클릭 메뉴와 동일한 팝업(모달)
}
function cbNodeAct(act,level,p,m,g,v){ cbSel.project=''; cbSel.mgroup=p||''; cbSel.model=m||''; cbSel.vgroup=g||''; cbSel.version=v||''; if(act==='title'){ cbSaveSel(); openEditCycle(); } else if(act==='tc'){ cbSaveSel(); openEditCycleTC(); } else if(act==='edit'){ if(level==='version'){ cbSaveSel(); openEditCycleTC(); } else cbEdit(level); } else if(act==='run'){ cbSaveSel(); cbAutoRun(); } else if(act==='detail'){ cbSaveSel(); cbCycleDetail(); } else if(act==='report'){ cbSaveSel(); cbCycleReport(); } else if(act==='pptx'){ cbSaveSel(); cbCycleReportPPTX(); } else if(act==='newcycle'){ cbSaveSel(); if(level==='vgroup'){ cbNewEmptyCycleDialog(p,m,g); } else if(typeof openNewCycle==='function'){ openNewCycle({mgroup:p,model:m,vgroup:g}); } } else if(act==='del')cbDel(level); }
// 버전그룹 노드 → 버전명만 입력하는 작은 창 → 빈 사이클 생성 (항목은 이후 수정에서 추가)
function cbNewEmptyCycleDialog(mgroup, model, vgroup){
  var e=_bdEsc; var old=document.getElementById('cb-vername-modal'); if(old)old.remove();
  window._cbVerNameCtx={mgroup:mgroup||'',model:model||'',vgroup:vgroup||''};
  try{ document.querySelectorAll('.cb-resize-ov').forEach(function(o){ if(o.parentNode)o.parentNode.removeChild(o); }); }catch(_e){}
  var m=document.createElement('div'); m.id='cb-vername-modal'; m.className='modal-overlay'; m.style.display='flex'; m.style.zIndex='100050';
  m.innerHTML='<div class="modal" style="width:430px;max-width:92vw;border-radius:13px;padding:0;overflow:hidden;">'+
    '<div style="padding:13px 18px;border-bottom:1px solid var(--border);background:#f4f5f7;display:flex;align-items:center;gap:9px;"><i class="ti ti-plus" style="color:var(--blue);font-size:17px;"></i><span style="font-size:15px;font-weight:800;">사이클(버전) 생성</span></div>'+
    '<div style="padding:16px 18px;">'+
      '<div style="font-size:11.5px;color:var(--text3);margin-bottom:11px;line-height:1.55;"><b style="color:#2d6fd4;">'+e(mgroup||'')+(model?(' · '+e(model)):'')+'</b> / 버전그룹 <b style="color:#7c3aed;">'+e(vgroup)+'</b><br>버전명을 입력하면 <b>빈 사이클</b>이 생성됩니다. TC 항목은 생성 후 <b>우클릭 → 수정</b>에서 추가하세요.</div>'+
      '<label style="font-size:11px;color:var(--text3);font-weight:700;display:block;margin-bottom:4px;">버전명 *</label>'+
      '<input id="cb-vername-input" placeholder="예: R242_20260610" onkeydown="if(event.key===\'Enter\')cbVerNameConfirm()" style="width:100%;box-sizing:border-box;font-size:13px;padding:8px 11px;border:1.5px solid var(--border);border-radius:8px;outline:none;">'+
    '</div>'+
    '<div style="padding:11px 18px;border-top:1px solid var(--border);background:#fafbfc;display:flex;gap:8px;justify-content:flex-end;"><button onclick="document.getElementById(\'cb-vername-modal\').remove()" style="font-size:13px;padding:7px 16px;border-radius:7px;border:1.5px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;">취소</button><button onclick="cbVerNameConfirm()" style="font-size:13px;padding:7px 20px;border-radius:7px;border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:700;"><i class="ti ti-plus"></i> 생성</button></div>'+
  '</div>';
  document.body.appendChild(m);
  setTimeout(function(){ var i=document.getElementById('cb-vername-input'); if(i)i.focus(); },30);
}
function cbVerNameConfirm(){ var c=window._cbVerNameCtx||{}; var inp=document.getElementById('cb-vername-input'); var v=inp?String(inp.value||'').trim():''; if(!v){ showToast('버전명을 입력하세요'); return; } var md=document.getElementById('cb-vername-modal'); if(md)md.remove(); cbDoCreateEmptyCycle(c.mgroup,c.model,c.vgroup,v); }
async function cbDoCreateEmptyCycle(mgroup, model, vgroup, version){
  version=String(version||'').trim(); if(!version)return;
  var folderId=(cbSel&&cbSel.project)||(typeof cycleSelFolderId!=='undefined'&&cycleSelFolderId)||(((typeof cycleFolderList!=='undefined'&&cycleFolderList[0])||{}).id)||'';
  if(!folderId){ var _nf={id:'cf-'+Date.now(),name:mgroup||model||'기본 프로젝트'}; cycleFolderList=cycleFolderList||[]; cycleFolderList.push(_nf); try{ await saveCycleFolders(); }catch(e){} folderId=_nf.id; }
  if(cycleList.some(function(c){return c.model===model && (c.version_group||'(미분류)')===vgroup && c.version===version;})){ showToast('이미 있는 버전입니다'); return; }
  var cycle={id:'cycle-'+Date.now(), model:model, version_group:vgroup, version:version, folder_id:folderId, assignee:'', start_date:'', end_date:'', mail_send:false, created_at:new Date().toISOString().slice(0,10), items:[]};
  cycleList.push(cycle); await saveCycle(cycle);
  var _mg=mgroup||((typeof _cycMGroup==='function')?_cycMGroup(cycle):model);
  cbSel.mgroup=mgroup||''; cbSel.model=model; cbSel.vgroup=vgroup; cbSel.version=version; cbSaveSel();
  try{ cbTreeOpen.add('mg@@'+_mg); cbTreeOpen.add('m@@'+_mg+'@@'+model); cbTreeOpen.add('g@@'+_mg+'@@'+model+'@@'+vgroup); }catch(e){}
  renderCycleBoard(); showToast('빈 사이클 생성: '+version+' — 우클릭 → 수정에서 TC를 추가하세요');
}
function cbAddProject(){ cycleAddFolder(); setTimeout(renderCycleBoard,60); }
// Cycle Color 설정의 폴더 아이콘 반영 (ti-folder 는 open 상태에 따라 -open 접미 자동)
function _cbFolderIc(open){
  var fi=(typeof ccIcon==='function')?ccIcon('folder'):{ic:'ti-folder'};
  return (fi.ic==='ti-folder')?(fi.ic+(open?'-open':'')):fi.ic;
}
function _cbFolderColor(){
  var fi=(typeof ccIcon==='function')?ccIcon('folder'):{color:''};
  return fi.color||'';
}
function _cbTreeRow(pathLast,level,p,m,g,v,label,color,icon,hasChild,openKey,sel,rightHtml,hoverId){
  const e=_bdEsc; const pa="'"+e(p)+"','"+e(m)+"','"+e(g)+"','"+e(v)+"'";
  // 폴더 펼치기/접기 화살표 — Requirements & Test Coverage 1열 폴더 버튼과 동일 스펙(22×22, 아이콘 18px)
  const _opened=cbTreeOpen.has(openKey);
  const chev=hasChild?('<i class="ti ti-chevron-right" onclick="event.stopPropagation();cbTreeToggle(\''+openKey+'\')" title="펼치기/접기" style="font-size:18px;flex-shrink:0;color:var(--text3);transition:transform 0.15s;cursor:pointer;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;border-radius:5px;'+(_opened?'transform:rotate(90deg)':'')+'"></i>'):'<span style="width:22px;flex-shrink:0;"></span>';
  const btn=function(act,ic,col,tip){ return '<button onclick="event.stopPropagation();cbNodeAct(\''+act+'\',\''+level+'\','+pa+')" title="'+tip+'" style="width:18px;height:18px;border-radius:4px;border:1px solid '+col+'55;background:#fff;color:'+col+';cursor:pointer;padding:0;display:inline-flex;align-items:center;justify-content:center;"><i class="ti '+ic+'" style="font-size:10px;"></i></button>'; };
  const hov=hoverId?(' onmousemove="_msTipFor(event,\''+e(hoverId)+'\')" onmouseleave="_msTipHide()"'):''; const ttl=hoverId?(level==='version'?' title="더블클릭: 사이클 수정"':''):' title="우클릭: 수정·생성·삭제 · 더블클릭: 수정"';
  const dbl=(level==='version')?(' ondblclick="cbTreeDblEdit(\''+level+'\','+pa+')"'):'';   // 버전(사이클) 더블클릭 → 수정 화면
  // Cycle Color 설정 (레벨별 key: mgroup→ctMgroup, model→ctModel, vgroup→ctVgroup, version→ctVersion)
  var _ccKey=level==='mgroup'?'ctMgroup':(level==='model'?'ctModel':(level==='vgroup'?'ctVgroup':(level==='version'?'ctVersion':'')));
  var _lblC=(_ccKey && typeof ccColor==='function')?ccColor(_ccKey):'var(--text)';
  var _lblFS=(_ccKey && typeof ccFS==='function')?ccFS(_ccKey):'12px';
  var _lblFW=(_ccKey && typeof ccFW==='function')?ccFW(_ccKey):(sel?'700':'500');
  if(sel && _lblFW==='400') _lblFW='700';   // 선택 시 강조 유지
  var _lblFF=(_ccKey && typeof ccFFStyle==='function')?ccFFStyle(_ccKey):'';
  // 아이콘: Cycle Color 에서 지정한 아이콘·색이 있으면 우선. 없으면 기존 매개변수 사용.
  var _ccIc=null; if(_ccKey && typeof ccIcon==='function'){ try{ _ccIc=ccIcon(_ccKey); }catch(_e){} }
  var _iconClass=(_ccIc && _ccIc.ic)?_ccIc.ic:icon;
  var _isFolder=String(_iconClass||'').indexOf('ti-folder')===0;
  var _iconColor=(_ccIc && _ccIc.color)?_ccIc.color:(_isFolder?(_cbFolderColor()||color):color);
  var _iconSize=(_ccIc && _ccIc.size)?_ccIc.size:16;
  return '<div onclick="cbTreeSelect(\''+level+'\','+pa+')"'+dbl+' oncontextmenu="cbTreeCtx(event,\''+level+'\','+pa+')"'+ttl+hov+' style="display:flex;align-items:center;gap:4px;padding:5px 6px 5px 4px;cursor:pointer;background:'+(sel?'rgba(45,111,212,0.1)':'')+';border-left:3px solid '+(sel?color:'transparent')+';">'+
    (function(){var gg=(typeof expGuides==='function'?expGuides(pathLast):'');return gg?'<span style="display:flex;gap:6px;align-self:stretch;flex-shrink:0;margin:-5px 0;">'+gg+'</span>':'';})()+
    chev+'<i class="ti '+_iconClass+'" style="font-size:'+_iconSize+'px;color:'+_iconColor+';flex-shrink:0;"></i>'+
    '<span style="flex:1;min-width:0;font-size:'+_lblFS+';font-weight:'+_lblFW+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:'+_lblC+';'+_lblFF+'">'+e(label)+'</span>'+
    (rightHtml||'')+
  '</div>';
}
function _cycMGroup(c){ if(!c)return '(미분류)'; var m=(typeof modelList!=='undefined'?modelList:[]).find(function(x){return x.name===c.model;}); return (m&&m.group)||c.model||'(미분류)'; }   // 사이클 → 모델그룹(없으면 모델명)
// 모델(mg·m) 아래 버전그룹 ▸ 버전 행 (baseLv부터 들여쓰기)
function _cbVgRows(mg, m, mCyc, baseLv, basePath){
  basePath=basePath||[];
  let h=''; const _cbS=function(arr){ return arr.slice().sort(function(a,b){ return cbTreeSortDir*String(a).localeCompare(String(b),undefined,{numeric:true}); }); };
  const groups=_cbS([...new Set(mCyc.map(c=>c.version_group||'(미분류)'))]);
  groups.forEach(function(g, gi){
    const gPath=basePath.concat(gi===groups.length-1);
    const gcyc=mCyc.filter(c=>(c.version_group||'(미분류)')===g); const gk='g@@'+mg+'@@'+m+'@@'+g;
    const versions=_cbS([...new Set(gcyc.map(c=>c.version).filter(Boolean))]);
    h+=_cbTreeRow(gPath,'vgroup',mg,m,g,'',g,CB_COLOR.vgroup,_cbFolderIc(cbTreeOpen.has(gk)),versions.length>0,gk,cbSel.mgroup===mg&&cbSel.model===m&&cbSel.vgroup===g&&!cbSel.version);
    if(cbTreeOpen.has(gk)){
      versions.forEach(function(v, vi){
        const vPath=gPath.concat(vi===versions.length-1);
        const cyv=gcyc.find(c=>c.version===v);
        h+=_cbTreeRow(vPath,'version',mg,m,g,v,v,CB_COLOR.version,'ti-tag',false,'',cbSel.mgroup===mg&&cbSel.model===m&&cbSel.vgroup===g&&cbSel.version===v,'','');   // 진행률 바(rightHtml)·hover 툴팁(hoverId) 제거
      });
    }
  });
  return h;
}
function cbTreeHtml(){
  let h=''; const _cbS=function(arr){ return arr.slice().sort(function(a,b){ return cbTreeSortDir*String(a).localeCompare(String(b),undefined,{numeric:true}); }); };
  const mgMap={}; (cycleList||[]).forEach(function(c){ if(!_cbCyShow(c))return; const mg=_cycMGroup(c); (mgMap[mg]=mgMap[mg]||[]).push(c); });
  const mgs=_cbS(Object.keys(mgMap));
  mgs.forEach(function(mg){
    const mgCyc=mgMap[mg]; const models=_cbS([...new Set(mgCyc.map(c=>c.model||'(미지정)'))]);
    if(models.length<=1){
      // 단일 모델: 모델그룹 · 모델명을 한 줄에 연이어 출력 (model 레벨로 선택/동작)
      const m=models[0]||'(미지정)'; const mk='m@@'+mg+'@@'+m;
      h+=_cbTreeRow([],'model',mg,m,'','',mg+'  ·  '+m,CB_COLOR.project,_cbFolderIc(cbTreeOpen.has(mk)),mgCyc.length>0,mk,cbSel.mgroup===mg&&cbSel.model===m&&!cbSel.vgroup);
      if(cbTreeOpen.has(mk)) h+=_cbVgRows(mg,m,mgCyc,1,[]);
    } else {
      // 다중 모델: 모델그룹 ▸ 모델 ▸ 버전그룹 ▸ 버전
      const mgk='mg@@'+mg;
      h+=_cbTreeRow([],'mgroup',mg,'','','',mg,CB_COLOR.project,_cbFolderIc(cbTreeOpen.has(mgk)),true,mgk,cbSel.mgroup===mg&&!cbSel.model);
      if(cbTreeOpen.has(mgk)){
        models.forEach(function(m, mi){
          const mLast=(mi===models.length-1);
          const mCyc=mgCyc.filter(c=>(c.model||'(미지정)')===m); const mk='m@@'+mg+'@@'+m;
          h+=_cbTreeRow([mLast],'model',mg,m,'','',m,CB_COLOR.model,'ti-device-desktop',mCyc.length>0,mk,cbSel.mgroup===mg&&cbSel.model===m&&!cbSel.vgroup);
          if(cbTreeOpen.has(mk)) h+=_cbVgRows(mg,m,mCyc,2,[mLast]);
        });
      }
    }
  });
  if(h) return h;
  if(cbHideDone) return '<div style="padding:24px 12px;text-align:center;color:var(--text3);font-size:11.5px;"><i class="ti ti-checkbox" style="font-size:22px;opacity:0.4;display:block;margin-bottom:8px;"></i>진행중·예정 사이클이 없습니다.<br><span style="font-size:10.5px;">필터를 끄면 완료 사이클이 보입니다.</span></div>';
  return '<div style="padding:24px 12px;text-align:center;color:var(--text3);font-size:11.5px;">사이클이 없습니다.<br>오른쪽 위 [+ 새 사이클]로 추가하세요.</div>';
}function _cbItemStatusKey(it){ const s=cycleItemStatus(it.steps); if(!s||s==='UNEXECUTED')return '예정'; if(s==='미구현'||s==='미지원'||s==='제외')return s; const v=resultVerdict(s); if(v==='pass')return 'PASS'; if(v==='fail')return 'FAIL'; return '제외'; }
function cbCol2ProgressHtml(){
  const cycles=cbMatchCycles();
  if(!cycles.length) return '<div style="padding:30px 16px;text-align:center;color:var(--text3);font-size:12px;">트리에서 모델그룹/<br>버전그룹을 선택하면<br>시험 진행 현황이 표시됩니다</div>';
  const all=[]; cycles.forEach(c=>(c.items||[]).forEach(it=>all.push(it)));
  const st=cycleCalcStats(all); const reqCnt=new Set(all.map(it=>it.req_id).filter(Boolean)).size;
  const bar=function(s){ return '<div style="height:7px;border-radius:4px;background:#e6e8ec;overflow:hidden;display:flex;"><div style="width:'+s.passRate+'%;background:#00a872;"></div><div style="width:'+s.failRate+'%;background:#e53e5a;"></div></div>'; };
  const overall='<div style="padding:10px 12px;border-bottom:1px solid var(--border);background:#faf9fe;"><div style="font-size:12px;font-weight:800;color:var(--text2);margin-bottom:6px;"><i class="ti ti-chart-bar" style="color:#7c3aed;"></i> 시험 진행 현황</div><div style="display:flex;gap:9px;font-size:11px;flex-wrap:wrap;margin-bottom:6px;"><span style="color:var(--text3);">사이클 <b style="color:var(--text);">'+cycles.length+'</b></span><span style="color:#2d6fd4;">요구사항 '+reqCnt+'</span><span style="color:#00875a;">TC '+all.length+'</span><span style="color:#00a872;font-weight:700;">합격 '+st.pass+'</span><span style="color:#e53e5a;font-weight:700;">불합격 '+st.fail+'</span><span style="color:var(--text3);">미실행 '+st.pending+'</span></div>'+bar(st)+'<div style="text-align:right;font-size:10px;color:var(--text3);margin-top:3px;">진행률 '+st.progress+'%</div></div>';
  const rows=cycles.map(function(c){ const s=cycleCalcStats(c.items||[]);
    return '<div onclick="cbTreeSelect(\'version\',\''+_bdEsc(_cycMGroup(c))+'\',\''+_bdEsc(c.model||'')+'\',\''+_bdEsc(c.version_group||'(미분류)')+'\',\''+_bdEsc(c.version||'')+'\')" ondblclick="cbTreeDblEdit(\'version\',\''+_bdEsc(_cycMGroup(c))+'\',\''+_bdEsc(c.model||'')+'\',\''+_bdEsc(c.version_group||'(미분류)')+'\',\''+_bdEsc(c.version||'')+'\')" title="더블클릭: 사이클 수정" style="padding:9px 12px;border-bottom:1px solid #eef0f3;cursor:pointer;" onmouseenter="this.style.background=\'#f6f8fa\'" onmouseleave="this.style.background=\'\'">'+
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;"><span style="font-size:9.5px;color:#00875a;font-weight:700;">'+_bdEsc(c.model||'')+'</span><i class="ti ti-tag" style="font-size:11px;color:#e8820c;"></i><span style="font-size:12.5px;font-weight:700;color:var(--text);">'+_bdEsc(c.version||'')+'</span><span style="flex:1;"></span><span style="font-size:10px;color:var(--text3);">'+(s.pass+s.fail)+'/'+s.inScope+'</span></div>'+
      bar(s)+
      '<div style="display:flex;gap:8px;font-size:9.5px;margin-top:4px;"><span style="color:#00a872;">합격 '+s.pass+'</span><span style="color:#e53e5a;">불합격 '+s.fail+'</span><span style="color:var(--text3);">미실행 '+s.pending+'</span><span style="flex:1;"></span><span style="color:#7c3aed;font-weight:700;">'+s.progress+'%</span></div>'+
    '</div>';
  }).join('');
  return overall+rows;
}
function cbSetStatFilter(k){ cbStatFilter=(cbStatFilter===k)?'':k; const c2=document.getElementById('cb-col2body'); if(c2)c2.innerHTML=cbCol2Html(); }
function _cbRender2(){ const c=document.getElementById('cb-col2body'); if(c)c.innerHTML=cbCol2Html(); }
function _cbSaveReqs(){ try{ localStorage.setItem('utop_cbitemreqs',JSON.stringify(Array.from(cbItemReqs))); }catch(e){} }
function cbToggleItemReq(rid){ if(cbItemReqs.has(rid))cbItemReqs.delete(rid); else cbItemReqs.add(rid); _cbSaveReqs(); _cbRenderReqPanel(); _cbRender2(); }
function cbClearReqs(){ cbItemReqs.clear(); _cbSaveReqs(); _cbRenderReqPanel(); _cbRender2(); }
function cbToggleFolderReqs(fid){ const desc=new Set([fid]); var add=true; while(add){ add=false; reqFolders.forEach(function(f){ if(f.parent&&desc.has(f.parent)&&!desc.has(f.id)){desc.add(f.id);add=true;} }); } const rids=new Set(); (reqList||[]).forEach(function(rq){ if(!rq||!rq.id)return; const ff=rq.folder||'__none__'; if(desc.has(ff))rids.add(rq.id); }); const cy=cbCurrentCycle(); (cy&&cy.items||[]).forEach(function(it){ const r=it.req_id||'(미지정)'; if(desc.has('__none__')&&!(reqList||[]).find(function(x){return x.id===r;}))rids.add(r); }); if(!rids.size)return; const allOn=Array.from(rids).every(function(r){return cbItemReqs.has(r);}); rids.forEach(function(r){ if(allOn)cbItemReqs.delete(r); else cbItemReqs.add(r); }); _cbSaveReqs(); _cbRenderReqPanel(); _cbRender2(); }
function cbReqTreeToggle(fid){ if(cbReqTreeClosed.has(fid))cbReqTreeClosed.delete(fid); else cbReqTreeClosed.add(fid); try{ localStorage.setItem('utop_cbreqtree',JSON.stringify([...cbReqTreeClosed])); }catch(e){} _cbRenderReqPanel(); }
function cbReqTreeExpandAll(){ cbReqTreeClosed.clear(); try{ localStorage.setItem('utop_cbreqtree','[]'); }catch(e){} _cbRenderReqPanel(); }
function cbReqTreeCollapseAll(){ (reqFolders||[]).forEach(function(f){ if(f&&f.id)cbReqTreeClosed.add(f.id); }); cbReqTreeClosed.add('__none__'); try{ localStorage.setItem('utop_cbreqtree',JSON.stringify([...cbReqTreeClosed])); }catch(e){} _cbRenderReqPanel(); }
function cbSetItemSearch(v){ cbItemSearch=v; _cbRender2(); const inp=document.getElementById('cb-item-search'); if(inp){ inp.focus(); try{ inp.setSelectionRange(inp.value.length,inp.value.length); }catch(e){} } }
function cbClearItemFilter(){ cbItemReqs.clear(); cbItemSearch=''; cbItemCfFilter={}; _cbSaveReqs(); _cbRenderReqPanel(); _cbRender2(); }
// 폴더 트리 ↔ Test Execution 사이의 REQ 폴더 패널 (클릭형, 기본 접힘)
function _cbReqTreeHtml(){
  const cy=cbCurrentCycle(); const items=(cy&&cy.items)||[];
  const reqCount={}; items.forEach(function(it){ const r=it.req_id||'(미지정)'; reqCount[r]=(reqCount[r]||0)+1; });
  // 폴더 트리: reqList 전체 기준 (사이클에 TC 없는 REQ도 표시) — 개수는 사이클 항목 기준
  const folderReqs={}; const used=new Set(); const reqIds=[];
  (reqList||[]).forEach(function(rq){ const rid=rq.id; if(!rid||reqIds.indexOf(rid)>=0)return; reqIds.push(rid); const fid=rq.folder||'__none__'; (folderReqs[fid]=folderReqs[fid]||[]).push(rid); var cur=fid,g=0; while(cur&&cur!=='__none__'&&g++<40){ used.add(cur); var f=reqFolders.find(function(x){return x.id===cur;}); cur=f?f.parent:null; } if(fid==='__none__')used.add('__none__'); });
  items.forEach(function(it){ const r=it.req_id||'(미지정)'; if(reqIds.indexOf(r)<0){ reqIds.push(r); (folderReqs['__none__']=folderReqs['__none__']||[]).push(r); used.add('__none__'); } });
  const _es=function(s){return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");};
  const _descReqs=function(fid){ const desc=new Set([fid]); var add=true; while(add){ add=false; reqFolders.forEach(function(f){ if(f.parent&&desc.has(f.parent)&&!desc.has(f.id)){desc.add(f.id);add=true;} }); } const out=[]; reqIds.forEach(function(rid){ const rq=reqList.find(function(x){return x.id===rid;}); const ff=(rq&&rq.folder)||'__none__'; if(desc.has(ff))out.push(rid); }); return out; };
  const _ck=function(on){ return '<span style="width:15px;height:15px;border-radius:4px;border:1.5px solid '+(on?'#7c3aed':'#c5cbd6')+';background:'+(on?'#7c3aed':'#fff')+';flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;margin-top:1px;">'+(on?'<i class="ti ti-check" style="font-size:11px;color:#fff;"></i>':'')+'</span>'; };
  const _gd=function(pl){ var gg=(typeof expGuides==='function'?expGuides(pl):''); return gg?'<span style="display:flex;gap:6px;align-self:stretch;flex-shrink:0;margin:-5px 0;">'+gg+'</span>':''; };
  const _reqRow=function(rid,depth,pathLast){ pathLast=pathLast||[]; const rq=reqList.find(function(x){return x.id===rid;}); var lbl=(rq&&(rq.reqid||rq.title))?(((rq.reqid||'')+(rq.title?(' · '+rq.title):'')).trim()):(rid==='(미지정)'?'(미지정)':rid); lbl=_bdEsc(String(lbl).replace(/^U-REQ-SYS-/,'')); const on=cbItemReqs.has(rid); const _c=reqCount[rid]||0; return '<div onclick="cbToggleItemReq(\''+_es(rid)+'\')" title="'+lbl+'" style="display:flex;align-items:flex-start;gap:6px;padding:5px 8px 5px 7px;border-radius:6px;cursor:pointer;font-size:12px;color:'+(_c?'var(--text)':'#9099a8')+';'+(on?'background:rgba(124,58,237,0.12);font-weight:700;':'')+'">'+_gd(pathLast)+_ck(on)+'<i class="ti ti-file-text" style="font-size:14px;color:'+(_c?'#2d6fd4':'#b6bdc9')+';flex-shrink:0;margin-top:1px;"></i><span style="flex:1;min-width:0;white-space:normal;word-break:break-word;line-height:1.35;">'+lbl+'</span><span style="font-size:10px;font-weight:800;color:'+(on?'#fff':(_c?'#7c3aed':'#aab0bd'))+';background:'+(on?'#7c3aed':(_c?'rgba(124,58,237,0.1)':'#eef0f3'))+';border-radius:8px;padding:1px 6px;flex-shrink:0;margin-top:1px;">'+_c+'</span></div>'; };
  const _fRender=function(fid,depth,pathLast){ pathLast=pathLast||[]; const f=reqFolders.find(function(x){return x.id===fid;}); const fname=fid==='__none__'?'(폴더 없음)':(f?f.name:'(미분류)'); const open=!cbReqTreeClosed.has(fid); const subs=reqFolders.filter(function(x){return x.parent===fid&&used.has(x.id);}).sort(function(a,b){return (a.order||0)-(b.order||0);}); const myReqs=(folderReqs[fid]||[]); const dr=_descReqs(fid); const allOn=dr.length>0&&dr.every(function(r){return cbItemReqs.has(r);}); var h='<div style="display:flex;align-items:center;gap:5px;padding:5px 8px 5px 7px;font-size:12px;font-weight:700;color:#564a7e;">'+_gd(pathLast)+'<i class="ti ti-chevron-'+(open?'down':'right')+'" onclick="event.stopPropagation();cbReqTreeToggle(\''+_es(fid)+'\')" style="font-size:12px;color:#a99ed0;flex-shrink:0;cursor:pointer;"></i><span onclick="event.stopPropagation();cbToggleFolderReqs(\''+_es(fid)+'\')" title="폴더 전체 선택/해제" style="cursor:pointer;display:inline-flex;">'+_ck(allOn)+'</span><i class="ti ti-folder'+(open?'-open':'')+'" style="font-size:15px;color:#e8a83c;flex-shrink:0;"></i><span onclick="cbReqTreeToggle(\''+_es(fid)+'\')" style="flex:1;min-width:0;white-space:normal;word-break:break-word;line-height:1.3;cursor:pointer;">'+_bdEsc(fname)+'</span></div>'; if(open){ var _nS=subs.length, _nR=myReqs.length; subs.forEach(function(sf,si){ h+=_fRender(sf.id,depth+1,pathLast.concat((si===_nS-1)&&(_nR===0))); }); myReqs.forEach(function(rid,ri){ h+=_reqRow(rid,depth+1,pathLast.concat(ri===_nR-1)); }); } return h; };
  const onAll=!cbItemReqs.size;
  var tree='<div onclick="cbClearReqs()" title="전체 REQ (선택 해제)" style="display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:6px;cursor:pointer;font-size:12px;color:var(--text);'+(onAll?'background:rgba(124,58,237,0.14);border-left:3px solid #7c3aed;font-weight:700;':'')+'"><i class="ti ti-stack-2" style="font-size:15px;color:#475063;flex-shrink:0;"></i><span style="flex:1;">전체</span><span style="font-size:10px;font-weight:800;color:'+(onAll?'#fff':'#7c3aed')+';background:'+(onAll?'#7c3aed':'rgba(124,58,237,0.1)')+';border-radius:8px;padding:1px 6px;">'+items.length+'</span></div>';
  // RTC(Requirements & Test Coverage) 폴더 트리와 동일: 실제 루트(parent 없음)만 order 정렬로 미러링
  // — 사이클에서는 폴더 구조를 바꾸지 않음. 부모 삭제된 고아 폴더('(미분류)' 가짜 루트)는 RTC와 똑같이 표시하지 않음.
  const renderRoots=reqFolders.filter(function(f){ return !f.parent && used.has(f.id); }).sort(function(a,b){ return (a.order||0)-(b.order||0); }).map(function(f){ return f.id; });
  renderRoots.forEach(function(fid){ tree+=_fRender(fid,0); });
  return tree;
}
// REQ 선택 팝업 (① REQ 선택 버튼 → 팝업 → REQ 클릭 시 해당 TC만 출력)
function cbReqPopupHtml(){
  return '<div onclick="if(event.target===this)cbReqPopupClose()" style="position:fixed;inset:0;z-index:100000;background:rgba(20,28,48,0.32);display:flex;align-items:center;justify-content:center;">'
    +'<div style="width:540px;max-width:94vw;max-height:84vh;background:#fff;border-radius:13px;box-shadow:0 20px 60px rgba(0,0,0,0.3);display:flex;flex-direction:column;overflow:hidden;">'
    +'<div style="padding:11px 16px;border-bottom:1px solid var(--border);background:#f3eefe;display:flex;align-items:center;gap:7px;flex-shrink:0;"><i class="ti ti-folders" style="font-size:17px;color:#7c3aed;"></i><span style="font-size:14px;font-weight:800;color:#7c3aed;">REQ 선택 — 해당 TC만 표시</span><span style="flex:1;"></span>'
      +'<button onclick="cbReqTreeExpandAll()" title="전체 펼치기" style="width:24px;height:24px;border-radius:6px;border:1px solid #d9d2f0;background:#fff;color:#7c3aed;cursor:pointer;padding:0;"><i class="ti ti-chevrons-down" style="font-size:14px;"></i></button>'
      +'<button onclick="cbReqTreeCollapseAll()" title="전체 접기" style="width:24px;height:24px;border-radius:6px;border:1px solid #d9d2f0;background:#fff;color:#7c3aed;cursor:pointer;padding:0;"><i class="ti ti-chevrons-up" style="font-size:14px;"></i></button>'
      +'<button onclick="cbClearReqs()" title="전체 REQ(선택 해제)" style="font-size:11px;padding:4px 11px;border-radius:6px;border:1px solid #d9d2f0;background:#fff;color:#7c3aed;cursor:pointer;font-weight:700;">전체 해제</button>'
      +'<button onclick="cbReqPopupClose()" style="width:26px;height:26px;border-radius:6px;border:1px solid var(--border);background:#fff;color:var(--text3);cursor:pointer;"><i class="ti ti-x"></i></button></div>'
    +'<div id="cb-reqpopup-body" style="flex:1;overflow:auto;padding:8px;">'+_cbReqTreeHtml()+'</div>'
    +'<div style="padding:9px 16px;border-top:1px solid var(--border);background:#fafbfc;display:flex;align-items:center;gap:8px;flex-shrink:0;"><span style="flex:1;font-size:11.5px;color:var(--text3);">REQ를 클릭하면 즉시 적용됩니다 (다중 선택 가능)</span><button onclick="cbReqPopupClose()" style="font-size:12px;padding:6px 20px;border-radius:7px;border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:700;">닫기</button></div>'
    +'</div></div>';
}
function cbReqPopupOpen(){ var ex=document.getElementById('cb-reqpopup'); if(ex){ ex.remove(); return; } var d=document.createElement('div'); d.id='cb-reqpopup'; d.innerHTML=cbReqPopupHtml(); document.body.appendChild(d); }
function cbReqPopupClose(){ var d=document.getElementById('cb-reqpopup'); if(d)d.remove(); }
function _cbRenderReqPanel(){ var b=document.getElementById('cb-reqpopup-body'); if(b)b.innerHTML=_cbReqTreeHtml(); }   // 팝업 본문 갱신(기존 호출처 호환)// 호환
// ── ② 커스텀필드 필터 (소스 TC의 custom_fields 기준으로 사이클 항목 필터) ──
var cbItemCfFilter={};
function _cbItemCfPass(it){ var keys=Object.keys(cbItemCfFilter); if(!keys.length)return true; var t=(typeof tcList!=='undefined'?tcList:[]).find(function(x){return (x.tcid||x.id)===it.tcid;}); var cf=(t&&t.custom_fields)||it.custom_fields||{}; for(var i=0;i<keys.length;i++){ var fid=keys[i], val=cbItemCfFilter[fid]; if(!val)continue; var v=String(cf[fid]||''); if(!(v===val||v.split(',').map(function(s){return s.trim();}).indexOf(val)>=0))return false; } return true; }
function cbItemCfPanelHtml(){
  var fields=(((typeof customFields!=='undefined'&&customFields)?customFields.tc:[])||[]).filter(function(f){return f.active!==false&&f.useInCycle!==false&&(f.type==='Select'||f.type==='MultiSelect');});
  if(!fields.length) return '';
  var e=_bdEsc; return fields.map(function(f){ var cur=cbItemCfFilter[f.id]||'';
    var opts='<option value="">'+e(f.label)+': 전체</option>'+((f.options||[]).map(function(o){var ov=(typeof cfOptValue==='function')?cfOptValue(o):(o&&o.value!=null?o.value:o);return '<option value="'+e(ov)+'" '+(cur===ov?'selected':'')+'>'+e(ov)+'</option>';}).join(''));
    return '<select onchange="cbItemSetCf(\''+e(f.id)+'\',this.value)" title="'+e(f.label)+' 필터" style="font-size:10.5px;padding:3px 6px;border:1px solid '+(cur?'#2d6fd4':'var(--border)')+';border-radius:6px;background:'+(cur?'#eef3ff':'#fff')+';outline:none;cursor:pointer;color:'+(cur?'#2d6fd4':'var(--text2)')+';font-weight:'+(cur?'700':'400')+';max-width:130px;">'+opts+'</select>'; }).join('');
}
function cbItemSetCf(fid,val){ if(val)cbItemCfFilter[fid]=val; else delete cbItemCfFilter[fid]; _cbRender2(); }
function cbItemClearCf(){ cbItemCfFilter={}; _cbRender2(); }
function cbCol2FootHtml(){   // col2 하단바: 선택 REQ/TC 카운트 + 일괄 판정 + 선택 삭제 (REQ/TC UI식)
  if(!cbSel.version) return '';
  const cy=cbCurrentCycle(); if(!cy) return '';
  const items=cy.items||[]; const n=cbItemSel.size;
  const reqN=new Set([...cbItemSel].map(function(k){ const p=String(k).split('@@'); const it=items[parseInt(p[1],10)]; return it?it.req_id:null; }).filter(Boolean)).size;
  const bulk = n?(['PASS','FAIL','미실행','미구현','미지원','제외'].map(function(r){ const sk=r==='미실행'?'예정':r; const cc=r==='PASS'?'#00a872':r==='FAIL'?'#e53e5a':'#888'; return '<button onclick="cbBulkStatus(\''+sk+'\')" style="font-size:10px;padding:3px 9px;border-radius:5px;border:1px solid '+cc+'55;background:#fff;color:'+cc+';cursor:pointer;font-weight:700;">'+r+'</button>'; }).join('')+'<button onclick="cbItemSel.clear();cbRefreshItems();" style="font-size:10px;padding:3px 8px;border-radius:5px;border:1px solid var(--border);background:#fff;color:var(--text3);cursor:pointer;">선택해제</button>'):'';
  const del = '<button onclick="cbDelTC()" title="선택 TC 삭제" style="font-size:11px;padding:5px 12px;border-radius:6px;border:1px solid rgba(229,62,90,0.5);background:'+(n?'#fff':'#f3f4f6')+';color:'+(n?'var(--red)':'#b9bcc4')+';cursor:'+(n?'pointer':'default')+';font-weight:700;"'+(n?'':' disabled')+'><i class="ti ti-trash"></i> 선택 삭제</button>';
  return '<div style="padding:8px 12px;border-top:1px solid var(--border);background:#f7f9fb;display:flex;align-items:center;gap:7px;flex-wrap:wrap;"><span style="font-size:12px;font-weight:700;color:var(--text2);">선택 <span style="color:#2d6fd4;">REQ '+reqN+'</span> · <span style="color:#00875a;">TC '+n+'</span></span>'+bulk+'<span style="flex:1;"></span>'+del+'</div>';
}
function cbCol2Html(){
  if(!cbSel.version) return cbCol2ProgressHtml();
  const cy=cbCurrentCycle(); const items=(cy&&cy.items)||[];
  if(!items.length) return '<div style="padding:30px 16px;text-align:center;color:var(--text3);font-size:12px;">항목 없음<br>상단 [+]로 TC 추가</div>';
  const n=cbItemSel.size;
  const _cnt={total:items.length,PASS:0,FAIL:0,'미지원':0,'미구현':0,'제외':0,'예정':0};
  items.forEach(function(it){ const k=_cbItemStatusKey(it); if(_cnt[k]!==undefined)_cnt[k]++; });
  const _pct=function(v){ return _cnt.total?Math.round(v/_cnt.total*100):0; };
  const _box=function(lab,val,col,pct,key){ const _act=(cbStatFilter===(key||'')); return '<div onclick="cbSetStatFilter(\''+(key||'')+'\')" title="클릭: 이 상태로 필터" style="flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:8px 8px 7px;background:'+(_act?col:'#fff')+';border:1px solid '+(_act?col:'#e2e7ee')+';border-top:3px solid '+col+';border-radius:7px;cursor:pointer;white-space:nowrap;overflow:hidden;">'
    +'<span style="font-size:20px;font-weight:800;color:'+(_act?'#fff':col)+';line-height:1;">'+val+'</span>'
    +'<span style="display:flex;align-items:baseline;gap:5px;"><span style="font-size:12px;font-weight:800;color:'+(_act?'#fff':'var(--text2)')+';letter-spacing:-0.2px;">'+lab+'</span>'+(pct!=null?'<span style="font-size:10.5px;font-weight:700;color:'+(_act?'#fff':col)+';opacity:0.8;">'+pct+'%</span>':'')+'</span>'
  +'</div>'; };
  const sumBar='<div style="display:flex;align-items:stretch;gap:6px;padding:6px 13px;background:#fff;border-bottom:1px solid var(--border);flex-shrink:0;">'+_box('총항목',_cnt.total,'#475063',_pct(_cnt.total),'')+_box('Pass',_cnt.PASS,'#00a872',_pct(_cnt.PASS),'PASS')+_box('Fail',_cnt.FAIL,'#e53e5a',_pct(_cnt.FAIL),'FAIL')+_box('미지원',_cnt['미지원'],'#7c3aed',_pct(_cnt['미지원']),'미지원')+_box('미구현',_cnt['미구현'],'#e8820c',_pct(_cnt['미구현']),'미구현')+_box('제외',_cnt['제외'],'#888',_pct(_cnt['제외']),'제외')+_box('미실행',_cnt['예정'],'#9aa0b8',_pct(_cnt['예정']),'예정')+'</div>';
  const bulk=n?('<div style="padding:6px 10px;background:#eaf3ff;border-bottom:1px solid #cfe0f5;display:flex;align-items:center;gap:4px;flex-wrap:wrap;"><span style="font-size:10.5px;font-weight:700;color:#2d6fd4;">'+n+'개</span>'+['PASS','FAIL','미실행','미구현','미지원','제외'].map(function(r){ const sk=r==='미실행'?'예정':r; const cc=r==='PASS'?'#00a872':r==='FAIL'?'#e53e5a':'#888'; return '<button onclick="cbBulkStatus(\''+sk+'\')" style="font-size:10px;padding:2px 8px;border-radius:5px;border:1px solid '+cc+'55;background:#fff;color:'+cc+';cursor:pointer;font-weight:700;">'+r+'</button>'; }).join('')+'<button onclick="cbItemSel.clear();cbRefreshItems();" style="font-size:10px;padding:2px 7px;border-radius:5px;border:1px solid var(--border);background:#fff;color:var(--text3);cursor:pointer;">해제</button></div>'):'';
  const STAT2=['예정','PASS','FAIL','미구현','미지원','제외'];
  const allSel=items.length>0&&items.every((it,ii)=>cbItemSel.has(cy.id+'@@'+ii));
  const th='padding:3px 5px;text-align:left;font-size:10.5px;font-weight:800;color:#475063;background:#eef1f5;border-bottom:1px solid #cfd4dc;white-space:nowrap;letter-spacing:0.2px;';
  const _thc=th+'text-align:center;';
  const head='<tr><th style="'+th+'width:24px;text-align:center;"><input type="checkbox" '+(allSel?'checked':'')+' onclick="cbToggleAllItems(this.checked)"></th><th style="'+th+'width:138px;">TC ID</th><th style="'+th+'">TC Summary</th><th style="'+_thc+'width:42px;">버그</th><th style="'+_thc+'width:46px;">할당자</th><th style="'+_thc+'width:46px;">실행자</th><th style="'+_thc+'width:116px;">실행날짜</th><th style="'+th+'width:74px;">결과</th></tr>';
  const _userDl='<datalist id="cb-user-dl">'+(((typeof _usersList!=='undefined'&&_usersList)||[]).map(function(u){return '<option value="'+_bdEsc(u.name||u.username||'')+'">';}).join(''))+'</datalist>';
  // REQ-TC 폴더 그룹핑: 요구사항별 폴더 헤더 → 그 아래 시험항목 (상세는 3열에 표시)
  const _byReq={}, _reqOrder=[];
  const _q=(cbItemSearch||'').toLowerCase().trim();
  items.forEach(function(it,ii){ if(cbStatFilter && _cbItemStatusKey(it)!==cbStatFilter) return;
    if(cbItemReqs.size && !cbItemReqs.has(it.req_id||'(미지정)')) return;   // REQ 선택 시 해당 REQ의 TC만 출력
    if(typeof _cbItemCfPass==='function' && !_cbItemCfPass(it)) return;   // ② 커스텀필드 필터
    if(_q){ const _rq2=reqList.find(x=>x.id===(it.req_id||'')); const _hay=((it.tcid||'')+' '+(it.name||'')+' '+(it.req_id||'')+' '+((_rq2&&(_rq2.reqid||_rq2.title))||'')).toLowerCase(); if(_hay.indexOf(_q)<0) return; }
    const rid=it.req_id||'(미지정)'; if(!_byReq[rid]){ _byReq[rid]=[]; _reqOrder.push(rid); } _byReq[rid].push(ii); });
  let rows='';
  _reqOrder.forEach(function(rid){
    const grp=_byReq[rid]; const rq=reqList.find(x=>x.id===rid); const rname=rq?(rq.title||rq.name||rq.summary||''):'';
    const _col=cbReqCollapsed.has(rid); const _ridJs=String(rid).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    rows+='<tr style="background:#eaf2fb;cursor:pointer;" onclick="cbToggleReq(\''+_ridJs+'\')" title="클릭: 접기/펼치기"><td colspan="8" style="padding:6px 11px;border-top:1px solid #cfddf0;border-bottom:1px solid #cfddf0;"><i class="ti '+(_col?'ti-chevron-right':'ti-chevron-down')+'" style="font-size:13px;color:#2d6fd4;vertical-align:-1px;"></i> <i class="ti '+(_col?'ti-folder':'ti-folder-open')+'" style="font-size:13px;color:#2d6fd4;"></i> <span style="font-size:11px;font-weight:800;color:#2d6fd4;">'+_bdEsc(rid==='(미지정)'?'요구사항 미지정':((rq&&rq.reqid)||rid))+'</span>'+(rname?'<span style="font-size:11px;color:var(--text2);margin-left:6px;font-weight:600;">/ '+_bdEsc(rname)+'</span>':'')+'<span style="font-size:10px;color:var(--text3);margin-left:7px;">('+grp.length+')</span></td></tr>';
    if(_col) return;   // 접힌 그룹은 TC 행 생략
    grp.forEach(function(ii){ const it=items[ii]; const key=cy.id+'@@'+ii; const curk=_cbItemStatusKey(it); const sel=cbSelItem===key; const chk=cbItemSel.has(key); const td='padding:1px 5px;border-bottom:1px solid #eef0f3;font-size:12px;color:#2a2f3a;line-height:1.3;'; const _tdc=td+'text-align:center;';
      const _ft=tcList.find(x=>(x.tcid||x.id)===it.tcid); const _isA=((_ft&&_ft.issue_list)||it.issues||[]); const _iN=_isA.length; const _iOpen=_isA.filter(function(x){ return !/clos|reject|resolv|done|fixed|완료|해결/i.test(String(x.status||'')); }).length; const _hN=((_ft&&_ft.result_history)||[]).length;
      const _stN=(it.steps&&it.steps.length)?it.steps.length:((_ft&&typeof _checksToSteps==='function')?_checksToSteps(_ft).length:0);
      const _dash='<span style="color:#cdd2da;">–</span>';
      const _bugCell=_iN?('<span title="미해결 '+_iOpen+' / 전체 '+_iN+' (close·reject 는 해결)" style="font-size:10px;font-weight:800;color:'+(_iOpen?'#c0392b':'#00875a')+';background:'+(_iOpen?'rgba(192,57,43,0.1)':'rgba(0,168,114,0.12)')+';border-radius:8px;padding:1px 7px;">'+_iOpen+'/'+_iN+'</span>'):_dash;
      const _hisCell=_hN?('<span style="font-size:11px;font-weight:700;color:#2d6fd4;">'+_hN+'</span>'):_dash;
      const _stCell=_stN?('<span style="font-size:11px;font-weight:700;color:#5a4bd6;">'+_stN+'</span>'):_dash;
      const _asg=(it.assignee||'').split(',').map(function(s){return s.trim();}).filter(Boolean);
      const _asgCell=_asg.length?('<div title="할당자 '+_bdEsc(_asg.join(', '))+'" style="display:inline-flex;align-items:center;gap:2px;justify-content:center;">'+_cbAvatar(_asg[0],18)+(_asg.length>1?'<span style="font-size:9px;font-weight:800;color:#5a6172;background:#eceef2;border-radius:9px;padding:1px 5px;">+'+(_asg.length-1)+'</span>':'')+'</div>'):_dash;   // 읽기전용(TC 생성 시 할당)
      const _creator=((_ft&&(_ft.author||_ft.owner||_ft.created_by))||it.created_by||'');
      const _crCell=_creator?('<div title="생성자 '+_bdEsc(_creator)+'" style="display:inline-flex;justify-content:center;">'+_cbAvatar(_creator,22)+'</div>'):_dash;
      const _exCell=(it.executed_auto
        ? '<div title="AI 자동 실행 (Step 자동실행)'+(it.executed_at?(' · '+_bdEsc(it.executed_at)):'')+'" style="display:inline-flex;justify-content:center;"><span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,#7c5cff,#4f8ae8);color:#fff;flex-shrink:0;box-shadow:0 1px 4px rgba(90,75,214,0.35);"><i class="ti ti-sparkles" style="font-size:14px;"></i></span></div>'
        : (it.executed_by?('<div title="실행자 '+_bdEsc(it.executed_by)+(it.executed_at?(' · '+_bdEsc(it.executed_at)):'')+'" style="display:inline-flex;justify-content:center;">'+_cbAvatar(it.executed_by,18)+'</div>'):_dash));
      const _dtCell=it.executed_at?('<span title="'+_bdEsc(it.executed_at)+'" style="font-size:10.5px;color:#5a6172;white-space:nowrap;">'+_bdEsc(String(it.executed_at).slice(0,16))+'</span>'):_dash;   // 초 제외(YYYY-MM-DD HH:MM)
      const sc={'예정':'#9aa0b8','PASS':'#00a872','FAIL':'#e53e5a','미구현':'#e8820c','미지원':'#7c3aed','제외':'#888'}[curk]||'#888';
      const dd='<select onclick="event.stopPropagation()" oncontextmenu="cbCtxMenu(event,'+ii+')" title="우클릭: 아래로/전체 채우기" onchange="cbSetItemStatus(\''+key+'\',this.value)" style="font-size:10.5px;padding:3px 6px;border:1px solid '+sc+';border-radius:7px;background:'+sc+';outline:none;cursor:pointer;color:#fff;font-weight:800;width:100%;box-sizing:border-box;">'+STAT2.map(x=>'<option style="background:#fff;color:#222;" '+(curk===x?'selected':'')+'>'+x+'</option>').join('')+'</select>';
      const _run=(key===_cbRunKey);
      rows+='<tr class="cbrow" style="cursor:pointer;background:'+(_run?'#fff3c4':(sel?'rgba(0,168,114,0.15)':'#ffffff'))+';">'+
        '<td style="'+td+'text-align:center;border-left:3px solid '+(_run?'#e8820c':(sel?'#00a872':'transparent'))+';">'+(_run?'<i class="ti ti-player-play-filled" style="font-size:10px;color:#e8820c;"></i>':'<input type="checkbox" '+(chk?'checked':'')+' onclick="event.stopPropagation();cbToggleItemSel(\''+key+'\',this.checked)">')+'</td>'+
        '<td onclick="event.stopPropagation();cbOpenTcPopup(\''+_bdEsc(it.tcid||'')+'\')" title="클릭: TC 편집" style="'+td+'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;"><span style="font-size:11px;color:#2d6fd4;font-weight:700;text-decoration:underline;text-underline-offset:2px;">'+_bdEsc((it.tcid||'').replace(/^U-REQ-SYS-/i,''))+'</span></td>'+
        '<td onclick="cbSelectItem(\''+key+'\')" title="클릭: 시험 절차 확인" style="'+td+'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;"><span style="font-size:12.5px;color:#171c28;font-weight:'+(sel?'800':'600')+';">'+_bdEsc(it.name||'')+'</span></td>'+
        '<td style="'+_tdc+'">'+_bugCell+'</td>'+
        '<td style="'+_tdc+'">'+_asgCell+'</td>'+
        '<td style="'+_tdc+'">'+_exCell+'</td>'+
        '<td style="'+_tdc+'">'+_dtCell+'</td>'+
        '<td style="'+td+'" oncontextmenu="cbCtxMenu(event,'+ii+')">'+dd+'</td>'+
      '</tr>';
    });
  });
  if(!rows) rows='<tr><td colspan="9" style="padding:24px;text-align:center;color:var(--text3);font-size:12px;">'+(cbStatFilter?('"'+(cbStatFilter==='예정'?'미실행':cbStatFilter)+'" 상태 항목 없음 — [총항목] 클릭 시 전체')+'':'항목 없음')+'</td></tr>';
  const _exers=[...new Set(items.map(function(it){return it.executed_by;}).filter(Boolean))];
  const _lastRun=items.map(function(it){return it.executed_at;}).filter(Boolean).sort().pop()||'';
  const _mfs='font-size:11.5px;padding:4px 8px;border:1px solid var(--border);border-radius:7px;outline:none;height:28px;box-sizing:border-box;';
  const cyMeta='<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 13px;background:#fff;border-bottom:1px solid #eef0f4;flex-shrink:0;">'
    +'<i class="ti ti-user" style="font-size:14px;color:#2d6fd4;"></i><span style="font-size:11px;color:var(--text3);font-weight:800;">담당자</span><input list="cb-user-dl" value="'+_bdEsc(cy.assignee||'')+'" placeholder="담당자" onchange="cbSetCycleMeta(\'assignee\',this.value)" style="'+_mfs+'width:130px;">'
    +'<i class="ti ti-calendar" style="font-size:14px;color:#00a872;margin-left:10px;"></i><span style="font-size:11px;color:var(--text3);font-weight:800;">기간</span><input type="date" value="'+_bdEsc(cy.start_date||'')+'" onchange="cbSetCycleMeta(\'start_date\',this.value)" style="'+_mfs+'" title="시작일"><span style="color:var(--text3);">~</span><input type="date" value="'+_bdEsc(cy.end_date||'')+'" onchange="cbSetCycleMeta(\'end_date\',this.value)" style="'+_mfs+'" title="종료일">'
    +'<i class="ti ti-player-play" style="font-size:14px;color:#e8820c;margin-left:10px;"></i><span style="font-size:11px;color:var(--text3);font-weight:800;">실행자</span><span style="font-size:12px;color:var(--text);font-weight:700;">'+(_exers.length?_bdEsc(_exers.join(', ')):'-')+'</span>'+(_lastRun?(' <span style="font-size:10.5px;color:var(--text3);">('+_bdEsc(_lastRun)+')</span>'):'')
    +'</div>';
  const _fAct=(cbItemReqs.size||cbItemSearch);
  let _reqChip=''; if(cbItemReqs.size){ let _cl; if(cbItemReqs.size===1){ const _r0=Array.from(cbItemReqs)[0]; const _crq=reqList.find(x=>x.id===_r0); _cl=_bdEsc(String((_crq&&(_crq.reqid||_crq.title))||_r0).replace(/^U-REQ-SYS-/,'')); } else { _cl='REQ '+cbItemReqs.size+'개'; } _reqChip='<span title="REQ 필터" style="font-size:10.5px;font-weight:800;color:#7c3aed;background:rgba(124,58,237,0.1);border-radius:7px;padding:2px 4px 2px 8px;white-space:nowrap;flex-shrink:0;display:inline-flex;align-items:center;gap:3px;max-width:220px;overflow:hidden;"><i class="ti ti-folder" style="font-size:11px;"></i><span style="overflow:hidden;text-overflow:ellipsis;">'+_cl+'</span><i class="ti ti-x" onclick="cbClearReqs()" style="font-size:12px;cursor:pointer;"></i></span>'; }
  const _cfHtml=(typeof cbItemCfPanelHtml==='function')?cbItemCfPanelHtml():'';
  const _cfAct=Object.keys(cbItemCfFilter||{}).length;
  const filterBar='<div style="display:flex;align-items:center;gap:6px;padding:6px 13px;background:#fff;border-bottom:1px solid #eef0f4;flex-shrink:0;flex-wrap:wrap;">'
    // ① REQ 선택 버튼 (→ 팝업) + 선택 REQ chip
    +'<button onclick="cbReqPopupOpen()" title="REQ 폴더에서 선택 → 해당 TC만 표시" style="font-size:11px;font-weight:700;padding:5px 11px;border-radius:7px;border:1px solid '+(cbItemReqs.size?'#7c3aed':'#d9d2f0')+';background:'+(cbItemReqs.size?'#7c3aed':'#faf7ff')+';color:'+(cbItemReqs.size?'#fff':'#7c3aed')+';cursor:pointer;display:inline-flex;align-items:center;gap:5px;flex-shrink:0;"><i class="ti ti-folders" style="font-size:13px;"></i> REQ 선택'+(cbItemReqs.size?(' ('+cbItemReqs.size+')'):'')+'</button>'
    +_reqChip
    // ② 커스텀필드 필터
    +(_cfHtml?('<span style="width:1px;height:18px;background:var(--border);flex-shrink:0;"></span>'+_cfHtml+(_cfAct?'<button onclick="cbItemClearCf()" title="커스텀필드 필터 해제" style="font-size:10px;color:var(--blue);background:none;border:none;cursor:pointer;flex-shrink:0;">초기화</button>':'')):'')
    // ③ 검색
    +'<span style="width:1px;height:18px;background:var(--border);flex-shrink:0;"></span><i class="ti ti-search" style="font-size:13px;color:var(--text3);flex-shrink:0;"></i>'
    +'<input id="cb-item-search" value="'+_bdEsc(cbItemSearch)+'" oninput="cbSetItemSearch(this.value)" placeholder="TC ID·제목 검색…" style="flex:1;min-width:120px;font-size:11px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;outline:none;">'
    +'<button onclick="cbClearItemFilter()" title="필터 전체 해제" style="width:22px;height:22px;border-radius:5px;border:1px solid var(--border);background:#fff;color:'+((_fAct||_cfAct)?'var(--red)':'var(--text3)')+';cursor:pointer;padding:0;flex-shrink:0;"><i class="ti ti-x" style="font-size:11px;"></i></button>'
    +'</div>';
  return _userDl+sumBar+filterBar+'<table style="width:100%;border-collapse:collapse;table-layout:fixed;"><thead style="position:sticky;top:0;z-index:1;">'+head+'</thead><tbody>'+rows+'</tbody></table>';
}// 이니셜 아바타(이름→색상 일관) — 호버(title)로 이름 표시
function _cbAvatar(name,size){ name=String(name||'').trim(); if(!name) return ''; size=size||22; const ch=name.charAt(0).toUpperCase(); const cols=['#2d6fd4','#00a872','#e8820c','#7c3aed','#e53e5a','#0d9488','#c2410c','#0ea5e9']; let h=0; for(let i=0;i<name.length;i++) h=(h*31+name.charCodeAt(i))>>>0; const col=cols[h%cols.length]; return '<span title="'+_bdEsc(name)+'" style="display:inline-flex;align-items:center;justify-content:center;width:'+size+'px;height:'+size+'px;border-radius:50%;background:'+col+';color:#fff;font-size:'+Math.round(size*0.46)+'px;font-weight:800;flex-shrink:0;">'+_bdEsc(ch)+'</span>'; }function _cbApplyRange(ii,from,to){
  const cy=cbCurrentCycle(); if(!cy)return; const items=cy.items||[]; const src=items[ii]; if(!src)return;
  const sk=_cbItemStatusKey(src); const val={'예정':'','PASS':'Pass','FAIL':'Fail','미구현':'미구현','미지원':'미지원','제외':'제외'}[sk];
  const today=new Date().toISOString().slice(0,10); let cnt=0;
  for(let j=from;j<to;j++){ const it=items[j]; if(!it)continue; it.steps=Array.isArray(it.steps)?it.steps:[]; if(it.steps.length) it.steps.forEach(s=>{s.result=val;s.date=val?today:'';}); else it.steps=[{cli:'',criteria:'',type:'contains',model:'공통',result:val,output:'',date:val?today:''}]; cnt++; cbLogStep((it.name||it.tcid||''),'수동 판정(채우기)',val||sk,'manual',{tcid:it.tcid, model:cy.model, version:cy.version}); }
  saveCycle(cy); cbRefreshItems(); _cbCheckComplete(cy); showToast(cnt+'개 행에 "'+sk+'" 적용');
}
function cbFillDown(ii){ const cy=cbCurrentCycle(); if(!cy)return; _cbApplyRange(ii,ii,(cy.items||[]).length); }
function cbFillAll(ii){ const cy=cbCurrentCycle(); if(!cy)return; _cbApplyRange(ii,0,(cy.items||[]).length); }
function cbCloseCtx(){ const m=document.getElementById('cb-ctxmenu'); if(m)m.remove(); }
function cbCtxMenu(e,ii){
  e.preventDefault(); e.stopPropagation(); cbCloseCtx();
  const m=document.createElement('div'); m.id='cb-ctxmenu';
  m.style.cssText='position:fixed;z-index:100001;background:#fff;border:1px solid #d0d5dd;border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,0.18);padding:4px;font-size:12.5px;min-width:182px;';
  m.style.left=Math.min(e.clientX,window.innerWidth-200)+'px';
  m.style.top=Math.min(e.clientY,window.innerHeight-90)+'px';
  m.innerHTML=
    '<div onclick="cbCloseCtx();cbFillDown('+ii+')" style="padding:8px 12px;border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:9px;color:var(--text);" onmouseenter="this.style.background=\'#f0f4ff\'" onmouseleave="this.style.background=\'\'"><i class="ti ti-arrow-bar-to-down" style="color:#2d6fd4;font-size:15px;"></i> 이 값을 아래로 채우기</div>'+
    '<div onclick="cbCloseCtx();cbFillAll('+ii+')" style="padding:8px 12px;border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:9px;color:var(--text);" onmouseenter="this.style.background=\'#f0f4ff\'" onmouseleave="this.style.background=\'\'"><i class="ti ti-arrows-vertical" style="color:#7c3aed;font-size:15px;"></i> 전체 채우기</div>';
  document.body.appendChild(m);
  setTimeout(function(){ document.addEventListener('click',cbCloseCtx,{once:true}); },10);
}
function cbTreeCtx(e,level,p,m,g,v){
  e.preventDefault(); e.stopPropagation(); cbCloseCtx();
  const items=[];
  if(level==='version'){
    items.push(['ti-edit','#2d6fd4','사이클 수정 (항목·제목)','tc']);
    items.push(['ti-clipboard-text','#7c3aed','세부 내역 (Details)','detail']);
    items.push(['ti-file-text','#0ea5e9','보고서 출력 (AI 요약 PDF)','report']);
    items.push(['ti-file-type-ppt','#c0392b','PPTX 출력 (AI 요약)','pptx']);
    items.push(['','','','sep']);   // ── 구분선: 실수 클릭 방지 위해 자동 실행 분리 ──
    items.push(['ti-player-play','#00a872','Test Cycle 자동 실행 (Automation)','run']);
    items.push(['','','','sep']);
    items.push(['ti-trash','#e53e5a','사이클 삭제','del']);
  } else if(level==='vgroup'){
    items.push(['ti-plus','#00a872','＋ 사이클 생성 (이 버전그룹에)','newcycle']);
    items.push(['ti-edit','#2d6fd4','버전그룹 이름 수정','edit']);
    items.push(['ti-trash','#e53e5a','버전그룹 삭제 (사이클 전체)','del']);
  } else if(level==='model'){
    items.push(['ti-plus','#00a872','＋ 버전그룹 추가 (사이클 생성)','newcycle']);
    items.push(['ti-edit','#2d6fd4','모델명 수정','edit']);
    items.push(['ti-trash','#e53e5a','모델 삭제 (사이클 전체)','del']);
  } else if(level==='mgroup'){
    items.push(['ti-plus','#00a872','＋ 모델 추가 (사이클 생성)','newcycle']);
    items.push(['ti-trash','#e53e5a','모델그룹 사이클 전체 삭제','del']);
  } else { return; }
  const e2=_bdEsc;
  const box=document.createElement('div'); box.id='cb-ctxmenu';
  box.style.cssText='position:fixed;z-index:100001;background:#fff;border:1px solid #d0d5dd;border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,0.18);padding:4px;font-size:12.5px;min-width:172px;';
  box.style.left=Math.min(e.clientX+70,window.innerWidth-210)+'px';   // 커서보다 오른쪽으로 배치(트리 가림 방지)
  box.style.top=Math.min(e.clientY,window.innerHeight-(items.length*38+12))+'px';
  box.innerHTML=items.map(function(it){ if(it[3]==='sep'){ return '<div style="height:1px;background:#e6e9ef;margin:4px 8px;"></div>'; } return '<div onclick="cbCloseCtx();cbNodeAct(\''+it[3]+'\',\''+level+'\',\''+e2(p)+'\',\''+e2(m)+'\',\''+e2(g)+'\',\''+e2(v)+'\')" style="padding:8px 12px;border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:9px;color:var(--text);" onmouseenter="this.style.background=\'#f0f4ff\'" onmouseleave="this.style.background=\'\'"><i class="ti '+it[0]+'" style="color:'+it[1]+';font-size:15px;"></i> '+it[2]+'</div>'; }).join('');
  document.body.appendChild(box);
  setTimeout(function(){ document.addEventListener('click',cbCloseCtx,{once:true}); },10);
}
// Folder Tree 빈 영역 우클릭 → 프로젝트 생성 (노드 위 우클릭은 cbTreeCtx가 stopPropagation 처리)// 모델그룹 추가 (사이클 트리에서 바로) — groupList 에 등록, 사이클 생성 시 모델 그룹 드롭다운에 나타남
function cbAddModelGroupDialog(){
  var e=_bdEsc; var old=document.getElementById('cb-mgrp-modal'); if(old)old.remove();
  var venOpts=((typeof vendorList!=='undefined'?vendorList:[])||[]).map(function(v){var n=(v&&v.name)||v;return n?'<option>'+e(n)+'</option>':'';}).join('');
  var fst='width:100%;font-size:13px;padding:8px 11px;border:1.5px solid var(--border);border-radius:8px;background:#fff;outline:none;box-sizing:border-box;';
  var lab='font-size:11px;color:var(--text3);font-weight:700;display:block;margin-bottom:4px;';
  try{ document.querySelectorAll('.cb-resize-ov').forEach(function(o){ if(o.parentNode)o.parentNode.removeChild(o); }); }catch(_e){}   // 잔존 리사이즈 오버레이 제거(입력 가림 방지)
  var m=document.createElement('div'); m.id='cb-mgrp-modal'; m.className='modal-overlay'; m.style.display='flex'; m.style.zIndex='100050';
  m.innerHTML='<div class="modal" style="width:450px;max-width:92vw;border-radius:13px;padding:0;overflow:hidden;">'+
    '<div style="padding:13px 18px;border-bottom:1px solid var(--border);background:#f4f5f7;display:flex;align-items:center;gap:9px;"><i class="ti ti-layers-subtract" style="color:#00a872;font-size:17px;"></i><span style="font-size:15px;font-weight:800;">모델그룹 추가</span></div>'+
    '<div style="padding:16px 18px;display:flex;flex-direction:column;gap:11px;">'+
      '<div style="font-size:11px;color:var(--text3);line-height:1.5;">벤더·제품군을 고르고 모델그룹명을 입력하세요. 장비 등록 데이터에 추가되어 사이클 생성 시 <b>모델 그룹</b> 드롭다운에 나타납니다.</div>'+
      '<div><label style="'+lab+'">벤더</label><select id="cb-mgrp-ven" onchange="cbMgrpFamFill();cbMgrpNameFill()" style="'+fst+'cursor:pointer;"><option value="">선택</option>'+venOpts+'</select></div>'+
      '<div><label style="'+lab+'">제품군</label><select id="cb-mgrp-fam" onchange="cbMgrpNameFill()" style="'+fst+'cursor:pointer;"></select></div>'+
      '<div><label style="'+lab+'">모델그룹명 *</label><select id="cb-mgrp-name" onchange="cbMgrpNameSel()" style="'+fst+'cursor:pointer;"></select><input id="cb-mgrp-name-new" placeholder="새 모델그룹명 입력 (예: E5724RL)" onkeydown="if(event.key===\'Enter\')cbMgrpConfirm()" style="'+fst+'margin-top:7px;display:none;"></div>'+
    '</div>'+
    '<div style="padding:11px 18px;border-top:1px solid var(--border);background:#fafbfc;display:flex;gap:8px;justify-content:flex-end;"><button onclick="document.getElementById(\'cb-mgrp-modal\').remove()" style="font-size:13px;padding:7px 16px;border-radius:7px;border:1.5px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;">취소</button><button onclick="cbMgrpConfirm()" style="font-size:13px;padding:7px 20px;border-radius:7px;border:none;background:#00a872;color:#fff;cursor:pointer;font-weight:700;"><i class="ti ti-plus"></i> 추가</button></div>'+
  '</div>';
  document.body.appendChild(m); cbMgrpFamFill(); cbMgrpNameFill();
}
function cbMgrpFamFill(){ var ALLOW=['L2','L3','OLT']; var sel=document.getElementById('cb-mgrp-fam'); if(sel) sel.innerHTML=ALLOW.map(function(n){return '<option>'+_bdEsc(n)+'</option>';}).join(''); }   // 제품군은 L2/L3/OLT 만(모듈·서버·샤시 등 제외, 중복 제거)
// 모델그룹명 select: 등록된 모델그룹(groupList)을 제품군처럼 드롭다운으로. 벤더·제품군 선택 시 좁힘(없으면 전체) + '새 모델그룹 직접 입력'
function cbMgrpNameFill(){ var ven=(document.getElementById('cb-mgrp-ven')||{}).value||''; var fam=(document.getElementById('cb-mgrp-fam')||{}).value||'';
  var all=((typeof groupList!=='undefined'?groupList:[])||[]);
  var names=all.filter(function(g){ return (!ven||g.vendor===ven) && (!fam||g.family===fam); }).map(function(g){return (g&&g.name)||g;}).filter(Boolean);
  if(!names.length) names=all.map(function(g){return (g&&g.name)||g;}).filter(Boolean);
  names=names.filter(function(n,i){return names.indexOf(n)===i;}).sort();
  var sel=document.getElementById('cb-mgrp-name'); if(sel) sel.innerHTML='<option value="">선택</option>'+names.map(function(n){return '<option>'+_bdEsc(n)+'</option>';}).join('')+'<option value="__NEW__">➕ 새 모델그룹 직접 입력…</option>';
  cbMgrpNameSel(); }
function cbMgrpNameSel(){ var sel=document.getElementById('cb-mgrp-name'); var inp=document.getElementById('cb-mgrp-name-new'); if(!sel||!inp)return; var isNew=(sel.value==='__NEW__'); inp.style.display=isNew?'block':'none'; if(isNew) setTimeout(function(){try{inp.focus();}catch(e){}},10); }
async function cbMgrpConfirm(){
  var ven=(document.getElementById('cb-mgrp-ven')||{}).value||'';
  var fam=(document.getElementById('cb-mgrp-fam')||{}).value||'';
  var _selv=(document.getElementById('cb-mgrp-name')||{}).value||'';
  var name=String(_selv==='__NEW__'?((document.getElementById('cb-mgrp-name-new')||{}).value||''):_selv).trim();
  if(!name){ showToast('모델그룹명을 입력하세요'); return; }
  if(typeof groupList==='undefined'){ showToast('장비 데이터를 먼저 로드하세요'); return; }
  if((groupList||[]).some(function(g){return g.vendor===ven&&g.family===fam&&g.name===name;})){
    // 이미 등록된 그룹 = 오류 아님 — 바로 사이클 생성에서 선택 가능하므로 닫고 안내
    var md0=document.getElementById('cb-mgrp-modal'); if(md0)md0.remove();
    showToast('"'+name+'" 은(는) 이미 등록되어 있습니다 — 새 사이클 생성의 모델그룹 드롭다운에서 바로 선택하세요');
    return;
  }
  groupList=groupList||[]; groupList.push({id:'grp-'+Date.now(), name:name, vendor:ven, family:fam});
  if(typeof saveDeviceData==='function'){ try{ await saveDeviceData(); }catch(e){} }
  var md=document.getElementById('cb-mgrp-modal'); if(md)md.remove();
  showToast('모델그룹 추가됨: '+name+' — 사이클 생성 시 선택할 수 있습니다');
}
function cbCycleProgressHtml(){
  const cy=(typeof cbCurrentCycle==='function')?cbCurrentCycle():null;
  if(!cy) return '<div style="padding:34px 16px;text-align:center;color:var(--text3);font-size:12.5px;line-height:1.7;"><i class="ti ti-chart-donut" style="font-size:34px;opacity:0.2;display:block;margin-bottom:10px;"></i>트리에서 <b>사이클(버전)</b>을<br>선택하면 진행 현황이<br>표시됩니다</div>';
  const items=cy.items||[]; const st=cycleCalcStats(items);
  const total=st.inScope||items.length||0; const done=(st.pass||0)+(st.fail||0); const pct=total?Math.round(done/total*100):0;
  const pP=st.passRate||0, fP=st.failRate||0;
  const running=!!_cbRunning;
  let h='<div style="padding:14px 14px 16px;">';
  h+='<div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:2px;text-align:center;">'+_bdEsc(cy.model||'')+' · '+_bdEsc(cy.version||'')+'</div>';
  h+='<div style="font-size:11px;color:var(--text3);margin-bottom:10px;text-align:center;">'+(running?'<span style="color:#2d6fd4;font-weight:800;"><i class="ti ti-loader-2 cbspin"></i> 실행 중...</span>':('TC '+items.length+'개 · 스텝 '+total))+'</div>';
  // 도넛 차트
  h+='<div style="width:132px;height:132px;border-radius:50%;background:conic-gradient(#00a872 0 '+pP+'%, #e53e5a '+pP+'% '+(pP+fP)+'%, #e6e8ec '+(pP+fP)+'% 100%);display:flex;align-items:center;justify-content:center;margin:6px auto 14px;box-shadow:0 2px 8px rgba(30,40,80,0.08);"><div style="width:94px;height:94px;border-radius:50%;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;"><span style="font-size:26px;font-weight:800;color:'+(pct>=100?'#00a872':'#2d6fd4')+';line-height:1;">'+pct+'<span style="font-size:13px;">%</span></span><span style="font-size:10px;color:var(--text3);margin-top:2px;">'+done+' / '+total+' 스텝</span></div></div>';
  // 범례
  const lg=function(c,t,n){ return '<span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:700;color:'+c+';"><span style="width:10px;height:10px;border-radius:3px;background:'+c+';"></span>'+t+' '+n+'</span>'; };
  h+='<div style="display:flex;justify-content:center;gap:13px;flex-wrap:wrap;margin-bottom:14px;">'+lg('#00a872','합격',st.pass||0)+lg('#e53e5a','불합격',st.fail||0)+lg('#9aa0b8','미실행',Math.max(0,total-done))+'</div>';
  h+='<div style="font-size:11px;font-weight:800;color:var(--text3);margin-bottom:7px;border-bottom:1px solid #eef0f3;padding-bottom:5px;">TC별 진행</div>';
  items.forEach(function(it){ const isR=(_cbRunning&&_cbRunning.tcid===it.tcid); const s=cycleCalcStats([it]); const itTot=s.inScope||(it.steps||[]).length||0; const itDone=(s.pass||0)+(s.fail||0); const k=(typeof _cbItemStatusKey==='function')?_cbItemStatusKey(it):''; const kc={'PASS':'#00a872','FAIL':'#e53e5a'}[k]||'#9aa0b8';
    h+='<div style="padding:8px 9px;border-radius:8px;margin-bottom:5px;'+(isR?'background:#eaf3ff;border:1px solid #bcd2f5;box-shadow:0 1px 4px rgba(45,111,212,0.12);':'border-bottom:1px solid #f3f4f7;')+'">'
      +'<div style="display:flex;align-items:center;gap:6px;font-size:11.5px;margin-bottom:4px;">'
      +(isR?'<i class="ti ti-loader-2 cbspin" style="color:#2d6fd4;font-size:14px;flex-shrink:0;"></i>':'<span style="width:8px;height:8px;border-radius:50%;background:'+kc+';flex-shrink:0;"></span>')
      +'<span style="font-family:monospace;color:#2d6fd4;font-weight:700;flex-shrink:0;">'+_bdEsc(it.tcid||'')+'</span>'
      +'<span style="flex:1;min-width:0;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+_bdEsc(it.name||'')+'</span>'
      +(isR?'<span style="font-size:10px;color:#2d6fd4;font-weight:800;white-space:nowrap;flex-shrink:0;">실행 중...</span>':'<span style="font-size:10px;color:var(--text3);flex-shrink:0;">'+itDone+'/'+itTot+'</span>')
      +'</div>'
      +'<div style="height:6px;border-radius:3px;background:#e9ebef;overflow:hidden;display:flex;"><div style="width:'+(s.passRate||0)+'%;background:#00a872;"></div><div style="width:'+(s.failRate||0)+'%;background:#e53e5a;"></div></div>'
      +(isR&&_cbRunning.cli?'<div style="font-size:9.5px;color:#2d6fd4;font-family:ui-monospace,monospace;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">$ '+_bdEsc(_cbRunning.cli)+'</div>':'')
      +'</div>';
  });
  h+='</div>'; return h;
}
// ══════════════ 마일스톤 (Test Planning / 시험 일정) ══════════════
let _msView='half';     // 'half'(오전·오후) | 'day' | 'week' | 'month' | 'quarter' | 'year'
let _msAnchorISO=null;     // 기준일 ISO(yyyy-mm-dd), null=오늘
let _msFilter='';
let _msSelCy=null;
let _msW1=420;
let _msSyncing=false;
let _msCollapse=new Set();   // 접힌 노드 키(프로젝트/모델/버전그룹). 기본 펼침
const _MS_FUTURE=12;         // 달력 끝에 항상 표시할 미래 개월 수(오늘 기준 계속 이어짐)
let _msFrom=null, _msTo=null; // 보고 싶은 기간 필터(지정 시 자동범위 대신 사용)
function _isoLocal(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function _msToday(){ return _isoLocal(new Date()); }
function _msAnchor(){ return _msAnchorISO||_msToday(); }
function _msDateAdd(iso,days){ const d=new Date(iso+'T00:00:00'); d.setDate(d.getDate()+days); return _isoLocal(d); }
function _msDateDiff(a,b){ return Math.round((new Date(b+'T00:00:00')-new Date(a+'T00:00:00'))/86400000); }function _msCyName(cy){ return cy.name || ((cy.model?cy.model+' ':'')+(cy.version||'(버전)')); }function _msCycleSpan(cy){
  if(cy.planned_start){ const ps=cy.planned_start, pe=cy.planned_end||cy.planned_start; const ex=(cy.items||[]).some(it=>(it.steps||[]).some(s=>s.date)); return {start:(ps<=pe?ps:pe),end:(pe>=ps?pe:ps),executed:ex,planned:true}; }
  let mn=null,mx=null; (cy.items||[]).forEach(it=>(it.steps||[]).forEach(s=>{ if(s.date){ if(!mn||s.date<mn)mn=s.date; if(!mx||s.date>mx)mx=s.date; } }));
  if(!mn){ const c=String(cy.created_at||cy.updated_at||cy.created||'').slice(0,10)||_msToday(); return {start:c,end:c,executed:false}; }
  return {start:mn,end:mx,executed:true};
}const _MSBG={project:'var(--ms-b1)',model:'var(--ms-b2)',vgroup:'var(--ms-b3)',version:'var(--bg2)'};
function _msRows(){
  const q=_msFilter.toLowerCase();
  const match=function(cy){ return !q || _msCyName(cy).toLowerCase().includes(q)||String(cy.version||'').toLowerCase().includes(q)||String(cy.model||'').toLowerCase().includes(q)||String(cy.version_group||'').toLowerCase().includes(q); };
  const sortStr=function(a,b){ return String(a).localeCompare(String(b),undefined,{numeric:true}); };
  const rows=[]; const col=_msCollapse;
  const folders=cycleFolderList.slice().sort(function(a,b){ return sortStr(a.name||'',b.name||''); });
  folders.forEach(function(f){
    const cyc=cycleList.filter(c=>c.folder_id===f.id && match(c));
    if(!cyc.length) return;
    const pk='p@@'+f.id, pOpen=!col.has(pk);
    rows.push({type:'project',depth:0,label:f.name||'(프로젝트)',color:CB_COLOR.project,icon:'ti-folder',key:pk,open:pOpen});
    if(!pOpen) return;
    [...new Set(cyc.map(c=>c.model||'(모델없음)'))].sort(sortStr).forEach(function(m){
      const mcyc=cyc.filter(c=>(c.model||'(모델없음)')===m);
      const mk='m@@'+f.id+'@@'+m, mOpen=!col.has(mk);
      rows.push({type:'model',depth:1,label:m,color:CB_COLOR.model,icon:'ti-device-desktop',key:mk,open:mOpen});
      if(!mOpen) return;
      [...new Set(mcyc.map(c=>c.version_group||'(미분류)'))].sort(sortStr).forEach(function(g){
        const gcyc=mcyc.filter(c=>(c.version_group||'(미분류)')===g);
        const gk='g@@'+f.id+'@@'+m+'@@'+g, gOpen=!col.has(gk);
        rows.push({type:'vgroup',depth:2,label:g,color:CB_COLOR.vgroup,icon:'ti-versions',key:gk,open:gOpen});
        if(!gOpen) return;
        gcyc.slice().sort(function(a,b){ return sortStr(a.version||'',b.version||''); }).forEach(function(cy){
          rows.push({type:'version',depth:3,cy:cy,label:cy.version||_msCyName(cy)});
        });
      });
    });
  });
  return rows;
}
function _msToggle(key){ if(_msCollapse.has(key))_msCollapse.delete(key); else _msCollapse.add(key); const lr=document.getElementById('ms-list-rows'); if(lr)lr.innerHTML=_msListRowsHtml(); const gr=document.getElementById('ms-gantt-rows'); if(gr)gr.innerHTML=_msGanttRowsHtml(); }
function _msExpandAll(open){
  if(open){ _msCollapse=new Set(); }
  else { _msCollapse=new Set(); cycleFolderList.forEach(function(f){ const cyc=cycleList.filter(c=>c.folder_id===f.id); if(!cyc.length)return; _msCollapse.add('p@@'+f.id); [...new Set(cyc.map(c=>c.model||'(모델없음)'))].forEach(function(m){ const mc=cyc.filter(c=>(c.model||'(모델없음)')===m); _msCollapse.add('m@@'+f.id+'@@'+m); [...new Set(mc.map(c=>c.version_group||'(미분류)'))].forEach(function(g){ _msCollapse.add('g@@'+f.id+'@@'+m+'@@'+g); }); }); }); }
  const lr=document.getElementById('ms-list-rows'); if(lr)lr.innerHTML=_msListRowsHtml(); const gr=document.getElementById('ms-gantt-rows'); if(gr)gr.innerHTML=_msGanttRowsHtml();
}
function _msBar(st,w){ const p=st&&st.inScope?st.passRate:0, f=st&&st.inScope?st.failRate:0; return '<div style="width:'+w+'px;flex:0 0 '+w+'px;height:9px;border-radius:5px;background:#e6e8ec;overflow:hidden;display:flex;"><div style="width:'+p+'%;background:#33b27b;"></div><div style="width:'+f+'%;background:#e5544b;"></div></div>'; }
function _msTip(e,html,pinRight){ let t=document.getElementById('ms-tip'); if(!t){ t=document.createElement('div'); t.id='ms-tip'; t.style.cssText='position:fixed;z-index:9999;background:#1e2330;color:#fff;font-size:13.5px;line-height:1.7;padding:11px 15px;border-radius:9px;box-shadow:0 6px 20px rgba(0,0,0,0.35);pointer-events:none;white-space:nowrap;'; document.body.appendChild(t); } t.innerHTML=html; t.style.display='block'; if(pinRight){ var _c2=document.getElementById('cb-col-2'); var _ct=document.getElementById('cb-col-tree'); var _trb=document.getElementById('cb-tree'); var _rx=_c2?_c2.getBoundingClientRect().left:(_ct?_ct.getBoundingClientRect().right:(_trb?_trb.getBoundingClientRect().right:300)); var _rr=(e&&e.currentTarget&&e.currentTarget.getBoundingClientRect)?e.currentTarget.getBoundingClientRect():null; var _ry=_rr?_rr.top:(e.clientY-8); t.style.left=Math.min(_rx+8, window.innerWidth-t.offsetWidth-8)+'px'; t.style.top=Math.min(Math.max(_ry-2,10), window.innerHeight-t.offsetHeight-12)+'px'; } else { t.style.left=Math.min(e.clientX+90, window.innerWidth-t.offsetWidth-12)+'px'; t.style.top=Math.min(e.clientY+14, window.innerHeight-t.offsetHeight-12)+'px'; } }   // 커서보다 더 오른쪽(+90)
function _msTipHide(){ const t=document.getElementById('ms-tip'); if(t)t.style.display='none'; }function _msCyTipHtml(cy){ const st=cycleCalcStats(cy.items||[]); const sp=_msCycleSpan(cy); return '<b style="font-size:14.5px;">'+_bdEsc(_msCyName(cy))+'</b><br><span style="color:#5fd0a0;">● Pass</span> '+st.pass+' / '+(st.inScope?st.passRate:0)+'%<br><span style="color:#f08a82;">● Fail</span> '+st.fail+' / '+(st.inScope?st.failRate:0)+'%<br><span style="color:#9aa3b2;">항목 '+st.total+'개 · 진행률 '+st.progress+'%</span><br><span style="color:#9aa3b2;">'+(sp.executed?(sp.start+(sp.start!==sp.end?' ~ '+sp.end:'')):'미실행')+'</span>'; }
function _msTipFor(e,id){ const cy=cycleList.find(c=>c.id===id); if(!cy) return; _msTip(e,_msCyTipHtml(cy)); }   // 목록: 커서 오른쪽
function _msTipBar(e,id){ const cy=cycleList.find(c=>c.id===id); if(!cy) return; var t=document.getElementById('ms-tip'); if(!t){ t=document.createElement('div'); t.id='ms-tip'; t.style.cssText='position:fixed;z-index:9999;background:#1e2330;color:#fff;font-size:13.5px;line-height:1.7;padding:11px 15px;border-radius:9px;box-shadow:0 6px 20px rgba(0,0,0,0.35);pointer-events:none;white-space:nowrap;'; document.body.appendChild(t); } t.innerHTML=_msCyTipHtml(cy); t.style.display='block';
  // 무조건 커서 오른쪽(+150). 오른쪽 공간 부족하면 그때만 커서 왼쪽으로
  var lx=e.clientX+150; if(lx+t.offsetWidth+10>window.innerWidth){ lx=e.clientX-t.offsetWidth-20; if(lx<8)lx=8; }
  var ty=e.clientY+12; if(ty+t.offsetHeight+12>window.innerHeight) ty=window.innerHeight-t.offsetHeight-12;
  t.style.left=lx+'px'; t.style.top=Math.max(ty,10)+'px'; }   // 간트 바: 커서 오른쪽 고정
function _msPpd(){ return _msView==='half'?60:(_msView==='day'?30:(_msView==='week'?14:(_msView==='month'?6:(_msView==='quarter'?2.4:1)))); }
function _msRange(){
  const today=_msToday();
  let mn=null,mx=null;
  cycleList.forEach(function(cy){ const sp=_msCycleSpan(cy); if(sp&&sp.start&&/^\d{4}-\d{2}-\d{2}$/.test(sp.start)){ if(!mn||sp.start<mn)mn=sp.start; } if(sp&&sp.end&&/^\d{4}-\d{2}-\d{2}$/.test(sp.end)){ if(!mx||sp.end>mx)mx=sp.end; } });
  if(!mn||!mx){ mn=today; mx=today; }
  if(today<mn) mn=today; if(today>mx) mx=today;
  let sIso=mn, eIso;
  try{ const _de=new Date(mx+'T00:00:00'); eIso=_isoLocal(new Date(_de.getFullYear(),_de.getMonth()+1+_MS_FUTURE,0)); }catch(e){ eIso=mx; }
  if(_msFrom&&/^\d{4}-\d{2}-\d{2}$/.test(_msFrom)) sIso=_msFrom;
  if(_msTo&&/^\d{4}-\d{2}-\d{2}$/.test(_msTo)) eIso=_msTo;
  if(sIso>eIso){ const _x=sIso; sIso=eIso; eIso=_x; }
  try{
    const ds=new Date(sIso+'T00:00:00'), de=new Date(eIso+'T00:00:00');
    if(isNaN(ds.getTime())||isNaN(de.getTime())) throw new Error('invalid');
    return {start:_isoLocal(new Date(ds.getFullYear(),ds.getMonth(),1)), end:_isoLocal(new Date(de.getFullYear(),de.getMonth()+1,0))};
  }catch(e){
    // 폴백: 오늘 기준 좌우 1달
    const now=new Date(); const y=now.getFullYear(), m=now.getMonth();
    return {start:_isoLocal(new Date(y,m-1,1)), end:_isoLocal(new Date(y,m+2,0))};
  }
}
function _msRangeLabel(){ const r=_msRange(); const a=r.start.slice(0,7).replace('-','.'), b=r.end.slice(0,7).replace('-','.'); return a===b?a:(a+' ~ '+b); }
function _msListRowsHtml(){
  const rows=_msRows(); if(!rows.length) return '<div style="padding:30px 14px;text-align:center;color:var(--text3);font-size:12px;">표시할 사이클이 없습니다.</div>';
  // 트리 가이드 라인(pathLast) — depth 기반 preorder로 "각 조상이 마지막 자식인지" 계산
  const _n=rows.length, _last=new Array(_n);
  for(var _i=0;_i<_n;_i++){ var _d=rows[_i].depth; var _L=true; for(var _j=_i+1;_j<_n;_j++){ if(rows[_j].depth<_d)break; if(rows[_j].depth===_d){_L=false;break;} } _last[_i]=_L; }
  var _stk=[]; var _pof=new Array(_n);
  for(var _k=0;_k<_n;_k++){ var _dk=rows[_k].depth; _stk[_dk]=_last[_k]; _stk.length=_dk+1; _pof[_k]=_stk.slice(1,_dk+1); }
  const _g=function(ix){ var gg=(typeof expGuides==='function')?expGuides(_pof[ix]):''; return gg?'<span style="display:flex;gap:6px;align-self:stretch;flex-shrink:0;margin:-5px 0;">'+gg+'</span>':''; };
  return rows.map(function(r, idx){
    if(r.type!=='version'){
      const caret=r.open?'ti-chevron-down':'ti-chevron-right';
      return '<div onclick="_msToggle(\''+_bdEsc(r.key)+'\')" style="height:30px;display:flex;align-items:center;gap:5px;padding:0 8px 0 4px;border-bottom:1px solid #eef0f3;background:'+_MSBG[r.type]+';cursor:pointer;user-select:none;">'+_g(idx)+'<i class="ti '+caret+'" style="color:#9aa3b2;font-size:13px;flex-shrink:0;"></i><i class="ti '+r.icon+'" style="color:'+r.color+';font-size:14px;flex-shrink:0;"></i><span style="font-size:'+(r.type==='project'?'12.5':'11.5')+'px;font-weight:'+(r.type==='project'?'800':'700')+';color:#3a4150;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+_bdEsc(r.label)+'</span></div>';
    }
    const cy=r.cy; const st=cycleCalcStats(cy.items||[]); const sel=_msSelCy===cy.id;
    return '<div onclick="_msSelect(\''+cy.id+'\')" onmousemove="_msTipFor(event,\''+cy.id+'\')" onmouseleave="_msTipHide()" style="height:30px;display:flex;align-items:center;gap:7px;padding:0 8px 0 4px;border-bottom:1px solid #eef0f3;cursor:pointer;background:'+(sel?'#eaf3ff':'#fff')+';">'+_g(idx)+'<i class="ti ti-tag" style="color:'+CB_COLOR.version+';font-size:12px;flex-shrink:0;"></i><span style="flex:1;min-width:0;font-size:12px;color:#2a2f3a;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+_bdEsc(r.label)+'</span>'+_msBar(st,100)+'</div>';
  }).join('');
}
function _msMonthBand(start,end,ppd,lh){ let mb=''; let cur=new Date(start+'T00:00:00'); const endD=new Date(end+'T00:00:00');
  while(cur<=endD){ const y=cur.getFullYear(), m=cur.getMonth(); const mS=_isoLocal(new Date(y,m,1)); const mEd=new Date(y,m+1,0); const mE=mEd>endD?end:_isoLocal(mEd); const w=(_msDateDiff(mS,mE)+1)*ppd; const yr=m===0?'2px solid #9aa3b2':'2px solid #cdd4de';
    mb+='<div style="width:'+w+'px;flex:0 0 '+w+'px;box-sizing:border-box;border-right:'+yr+';text-align:center;font-size:11px;font-weight:800;color:#3a4150;line-height:'+lh+'px;background:#eef2f7;overflow:hidden;">'+(m===0?y+'.':'')+String(m+1).padStart(2,'0')+'</div>'; cur=new Date(y,m+1,1); }
  return mb; }
function _msYearBand(start,end,ppd,lh){ let yb=''; const sy=new Date(start+'T00:00:00').getFullYear(), ey=new Date(end+'T00:00:00').getFullYear();
  for(let y=sy;y<=ey;y++){ const yS=(y===sy)?start:_isoLocal(new Date(y,0,1)); const yEd=new Date(y,11,31); const yE=(y===ey)?end:_isoLocal(yEd); const w=(_msDateDiff(yS,yE)+1)*ppd;
    yb+='<div style="width:'+w+'px;flex:0 0 '+w+'px;box-sizing:border-box;border-right:2px solid #9aa3b2;text-align:center;font-size:11.5px;font-weight:800;color:#3a4150;line-height:'+lh+'px;background:#eef2f7;overflow:hidden;">'+y+'년</div>'; }
  return yb; }
function _msQuarterBand(start,end,ppd){ let qb=''; const sD=new Date(start+'T00:00:00'); let cur=new Date(sD.getFullYear(), Math.floor(sD.getMonth()/3)*3, 1); const endD=new Date(end+'T00:00:00');
  while(cur<=endD){ const qy=cur.getFullYear(), qm=cur.getMonth(); const qS=(_isoLocal(cur)<start)?start:_isoLocal(cur); const qEd=new Date(qy,qm+3,0); const qE=(qEd>endD)?end:_isoLocal(qEd); const w=(_msDateDiff(qS,qE)+1)*ppd; const qn=Math.floor(qm/3)+1; const bd=qm===0?'2px solid #9aa3b2':'1px solid #c8cfda';
    qb+='<div style="width:'+w+'px;flex:0 0 '+w+'px;box-sizing:border-box;text-align:center;border-right:'+bd+';font-size:9.5px;font-weight:700;color:#5a6271;line-height:24px;">'+qy+' Q'+qn+'</div>'; cur=new Date(qy,qm+3,1); }
  return qb; }
function _msGanttHeadHtml(){
  const rg=_msRange(); const ppd=_msPpd(); const start=rg.start, end=rg.end;
  const total=_msDateDiff(start,end)+1; const track=total*ppd; const today=_msToday(); const W=['일','월','화','수','목','금','토'];
  let topH=22, top='', bot='', hasBot=true;
  if(_msView==='half'){ top=_msMonthBand(start,end,ppd,22);
    for(let i=0;i<total;i++){ const iso=_msDateAdd(start,i); const d=new Date(iso+'T00:00:00'); const dow=d.getDay(); const isT=iso===today; const wkc=dow===0?'#e5544b':(dow===6?'#2d6fd4':'#8a92a0');
      bot+='<div style="width:'+ppd+'px;flex:0 0 '+ppd+'px;box-sizing:border-box;border-right:1px solid #dfe3ea;'+(isT?'background:#fff7e6;':'')+'"><div style="height:11px;line-height:11px;text-align:center;font-size:8.5px;font-weight:700;color:'+(isT?'#e8820c':wkc)+';">'+(d.getMonth()+1)+'/'+d.getDate()+'</div><div style="display:flex;height:13px;"><div style="flex:1;text-align:center;font-size:7.5px;color:#9aa3b2;border-right:1px solid #eef0f3;line-height:13px;">오전</div><div style="flex:1;text-align:center;font-size:7.5px;color:#9aa3b2;line-height:13px;">오후</div></div></div>'; } }
  else if(_msView==='day'){ top=_msMonthBand(start,end,ppd,22);
    for(let i=0;i<total;i++){ const iso=_msDateAdd(start,i); const d=new Date(iso+'T00:00:00'); const dow=d.getDay(); const isT=iso===today; const wkc=dow===0?'#e5544b':(dow===6?'#2d6fd4':'#8a92a0');
      bot+='<div style="width:'+ppd+'px;flex:0 0 '+ppd+'px;box-sizing:border-box;text-align:center;border-right:1px solid #e7eaef;'+(isT?'background:#fff7e6;':'')+'"><div style="font-size:8.5px;color:'+wkc+';line-height:11px;">'+W[dow]+'</div><div style="font-size:10px;font-weight:700;color:'+(isT?'#e8820c':'#3a4150')+';line-height:12px;">'+d.getDate()+'</div></div>'; } }
  else if(_msView==='week'){ top=_msMonthBand(start,end,ppd,22);
    let i=0; while(i<total){ const iso=_msDateAdd(start,i); const d=new Date(iso+'T00:00:00'); const dow=d.getDay(); const span=Math.min(7-dow,total-i); const w=span*ppd; const isT=(today>=iso&&today<=_msDateAdd(iso,span-1));
      bot+='<div style="width:'+w+'px;flex:0 0 '+w+'px;box-sizing:border-box;text-align:center;border-right:1px solid #dfe3ea;font-size:11px;font-weight:700;color:'+(isT?'#e8820c':'#3a4150')+';line-height:24px;'+(isT?'background:#fff7e6;':'')+'">'+(d.getMonth()+1)+'/'+d.getDate()+'</div>'; i+=span; } }
  else if(_msView==='month'){ top=_msMonthBand(start,end,ppd,46); topH=46; hasBot=false; }
  else if(_msView==='quarter'){ top=_msYearBand(start,end,ppd,22); bot=_msQuarterBand(start,end,ppd); }
  else { top=_msYearBand(start,end,ppd,46); topH=46; hasBot=false; }
  return '<div style="position:sticky;top:0;z-index:5;width:'+track+'px;background:#f4f6fa;border-bottom:1px solid var(--border);"><div style="display:flex;height:'+topH+'px;">'+top+'</div>'+(hasBot?'<div style="display:flex;height:24px;">'+bot+'</div>':'')+'</div>';
}
function _msGanttRowsHtml(){
  const rows=_msRows(); const rg=_msRange(); const ppd=_msPpd(); const start=rg.start; const total=_msDateDiff(start,rg.end)+1; const track=total*ppd; const today=_msToday();
  const gstep=Math.max(2, _msView==='half'?ppd/2:_msView==='day'?ppd:(_msView==='week'||_msView==='month')?ppd*7:(_msView==='quarter'?ppd*30.4:ppd*91));
  const grid='repeating-linear-gradient(to right, transparent 0, transparent '+(gstep-1)+'px, var(--ms-grid) '+(gstep-1)+'px, var(--ms-grid) '+gstep+'px)';
  const PAL=['#2d9d8f','#e8920c','#3fa34d','#2d6fd4','#7c3aed','#0ea5b7','#c0497b','#d4793b'];
  if(!rows.length) return '<div style="padding:30px;color:var(--text3);font-size:12px;">표시할 사이클이 없습니다.</div>';
  const tx=_msDateDiff(start,today)*ppd; const todayLine=(tx>=0&&tx<=track)?'<div style="position:absolute;left:'+tx+'px;top:0;bottom:0;width:2px;background:rgba(232,130,12,0.55);z-index:4;"></div>':'';
  // 년/분기 경계 구분선
  let bounds=''; let bc=new Date(start+'T00:00:00'); bc=new Date(bc.getFullYear(),bc.getMonth(),1); const bEnd=new Date(rg.end+'T00:00:00');
  while(bc<=bEnd){ const iso=_isoLocal(bc); if(iso>start){ const x=_msDateDiff(start,iso)*ppd; const m=bc.getMonth();
      if(m===0) bounds+='<div style="position:absolute;left:'+x+'px;top:0;bottom:0;width:2px;background:#8a93a3;z-index:3;"></div>';
      else if(m%3===0) bounds+='<div style="position:absolute;left:'+x+'px;top:0;bottom:0;width:1px;background:#c2cad6;z-index:2;"></div>'; }
    bc=new Date(bc.getFullYear(),bc.getMonth()+1,1); }
  let vi=0;
  const body=rows.map(function(r){
    if(r.type!=='version'){ return '<div style="height:30px;width:'+track+'px;border-bottom:1px solid var(--ms-grid);background-color:'+_MSBG[r.type]+';background-image:'+grid+' !important;"></div>'; }
    const cy=r.cy; const sp=_msCycleSpan(cy); const sel=_msSelCy===cy.id; const idx=vi++; let bar='';
    const s=_msDateDiff(start,sp.start), e=_msDateDiff(start,sp.end);
    if(e>=0 && s<=total-1){ const s0=Math.max(0,s), e0=Math.min(total-1,e); const left=s0*ppd; const w=Math.max(6,(e0-s0+1)*ppd-1); const col=sp.executed?PAL[idx%PAL.length]:'#9aa3af'; const showName=w>=46;
      bar='<div onclick="_msSelect(\''+cy.id+'\')" onmousemove="_msTipBar(event,\''+cy.id+'\')" onmouseleave="_msTipHide()" style="position:absolute;left:'+left+'px;top:5px;height:20px;width:'+w+'px;border-radius:4px;background:'+col+';box-shadow:0 1px 3px rgba(0,0,0,0.18);display:flex;align-items:center;padding:0 6px;cursor:pointer;overflow:hidden;'+(sel?'outline:2px solid #1a2030;':'')+'">'+(showName?'<span style="font-size:10px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 1px rgba(0,0,0,0.25);">'+_bdEsc(_msCyName(cy))+'</span>':'')+'</div>';
    }
    return '<div style="position:relative;height:30px;width:'+track+'px;border-bottom:1px solid var(--ms-grid);background-color:'+(sel?'var(--ms-sel)':'var(--bg2)')+';background-image:'+grid+' !important;">'+bar+'</div>';
  }).join('');
  return '<div style="position:relative;width:'+track+'px;">'+bounds+todayLine+body+'</div>';
}
function _msSync(src){ if(_msSyncing) return; _msSyncing=true; const l=document.getElementById('ms-list-body'), g=document.getElementById('ms-gantt-scroll'); if(l&&g){ if(src==='gantt') l.scrollTop=g.scrollTop; else g.scrollTop=l.scrollTop; } _msSyncing=false; }
function _msSetView(v){ _msView=v; renderMilestonePage(); }
function _msSetPeriod(which,v){ if(which==='from')_msFrom=v||null; else _msTo=v||null; renderMilestonePage(); }
function _msClearPeriod(){ _msFrom=null; _msTo=null; renderMilestonePage(); }
function _msNav(dir){ const g=document.getElementById('ms-gantt-scroll'); if(g) g.scrollLeft += dir*Math.max(220, g.clientWidth*0.7); }
function _msTodayJump(){ const g=document.getElementById('ms-gantt-scroll'); if(!g) return; const rg=_msRange(); const tx=_msDateDiff(rg.start,_msToday())*_msPpd(); g.scrollLeft=Math.max(0, tx - g.clientWidth/2); }
function _msAutoScroll(){ const g=document.getElementById('ms-gantt-scroll'); if(!g) return; if(_msFrom){ g.scrollLeft=0; } else { _msTodayJump(); } }
function _msSetFilter(v){ _msFilter=v; const lr=document.getElementById('ms-list-rows'); if(lr)lr.innerHTML=_msListRowsHtml(); const gr=document.getElementById('ms-gantt-rows'); if(gr)gr.innerHTML=_msGanttRowsHtml(); _msRenderStatus(); }
function _msSelect(id){ _msSelCy=(_msSelCy===id?null:id); const lr=document.getElementById('ms-list-rows'); if(lr)lr.innerHTML=_msListRowsHtml(); const gr=document.getElementById('ms-gantt-rows'); if(gr)gr.innerHTML=_msGanttRowsHtml(); }
function _msResize(e){ e.preventDefault(); const sx=e.clientX, sw=_msW1; function mv(ev){ _msW1=Math.max(220,Math.min(560,sw+(ev.clientX-sx))); const c=document.getElementById('ms-col1'); if(c){c.style.flex='0 0 '+_msW1+'px';c.style.width=_msW1+'px';} } function up(){document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);} document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up); }
function _msRenderStatus(){
  const el=document.getElementById('ms-status'); if(!el) return;
  const q=_msFilter.toLowerCase();
  const cycles=cycleList.filter(function(cy){ return !q || _msCyName(cy).toLowerCase().includes(q)||String(cy.version||'').toLowerCase().includes(q)||String(cy.model||'').toLowerCase().includes(q)||String(cy.version_group||'').toLowerCase().includes(q); });
  const all=[]; cycles.forEach(c=>(c.items||[]).forEach(it=>all.push(it)));
  const st=cycleCalcStats(all); const tot=st.total||0;
  const pP=tot?st.pass/tot*100:0, pF=tot?st.fail/tot*100:0, pE=tot?st.exclude/tot*100:0;
  el.innerHTML=
    '<span><i class="ti ti-tag" style="font-size:11px;color:#e8820c;"></i> 버전 <b style="color:var(--text2);">'+cycles.length+'</b></span>'+
    '<span style="color:#00875a;font-weight:600;">TC <b>'+tot+'</b></span>'+
    '<span style="color:#00a872;font-weight:600;">합격 '+st.pass+'</span>'+
    '<span style="color:#e53e5a;font-weight:600;">불합격 '+st.fail+'</span>'+
    '<span style="color:#9aa3af;font-weight:600;">제외 '+st.exclude+'</span>'+
    '<span style="color:var(--text3);">미실행 '+st.pending+'</span>'+
    '<span style="flex:1;"></span>'+
    '<span style="display:inline-flex;width:130px;height:8px;border-radius:4px;overflow:hidden;background:#e6e8ec;"><span style="width:'+pP+'%;background:#00a872;"></span><span style="width:'+pF+'%;background:#e53e5a;"></span><span style="width:'+pE+'%;background:#9aa3af;"></span></span>'+
    '<span style="color:#7c3aed;font-weight:700;">진행률 '+st.progress+'%</span>';
}
