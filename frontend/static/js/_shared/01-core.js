let tmSelFolderId=null, tmFolderMode='single', tmSelReqId=null, tmSelTcId=null;
let tmSelReqIds=new Set(), tmSelTcIds=new Set();
let tmCol1Visible=true, tmCol2Visible=true, tmCol3Visible=true;
const API='';
let devices=[], procedures=[], templates=[], chatHistory=[];
let selDevId=null, selProcId=null, selTplId=null;
let ws=null;

// tcid 안에 슬래시(/) 가 포함된 경우 그대로 URL 에 넣으면 FastAPI 라우팅이 경로 세그먼트로 잘라 404.
// encodeURIComponent 도 슬래시를 그대로 두므로, 슬래시만 sentinel(__U2F__)로 치환해서 URL 에 실음.
// 서버(_tc_id_norm)가 sentinel 을 슬래시로 복원. 백슬래시(\)는 sentinel(__U5C__)로 동일 처리.
function _tcUrl(tcid){
  var s=String(tcid==null?'':tcid);
  s=s.replace(/\\/g,'__U5C__').replace(/\//g,'__U2F__');
  return encodeURIComponent(s);
}

// ── WebSocket ──
function initWS(){
  const proto=location.protocol==='https:'?'wss':'ws';
  ws=new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen=()=>{
    document.getElementById('ws-dot').style.background='var(--green)';
    document.getElementById('ws-label').textContent='WebSocket 연결됨';
  };
  ws.onclose=()=>{
    document.getElementById('ws-dot').style.background='var(--red)';
    document.getElementById('ws-label').textContent='WebSocket 끊김';
    setTimeout(initWS,3000);
  };
  ws.onmessage=(e)=>handleWS(JSON.parse(e.data));
}
function handleWS(msg){
  if(msg.type==='presence'){ if(typeof collabOnPresence==='function') collabOnPresence(msg); return; }
  if(msg.type==='board_update'){ if(typeof bbsRefreshList==='function') bbsRefreshList(); return; }
  if(msg.type==='todo_updated'){ if(typeof _todoOnWsUpdate==='function') _todoOnWsUpdate(); return; }   // TO-DO 실시간 동기화
  if(msg.type==='chat_update'){ if(typeof chatPoll==='function') chatPoll(); return; }
  if(msg.type==='stc_start'||msg.type==='stc_line'||msg.type==='stc_done'){ if(typeof stcOnWS==='function') stcOnWS(msg); return; }
  if(msg.type==='cb_run_progress'){ if(typeof cbRemoteRunOnWS==='function') cbRemoteRunOnWS(msg); return; }   // 다른 사용자의 Cycle 자동 실행 진행 상태
  if(msg.type==='cb_run_stop_request'){ if(typeof cbRemoteStopOnWS==='function') cbRemoteStopOnWS(msg); return; }   // 원격 중지 요청 (실행자에게 도착)
  if(msg.type==='tc_run_history_new'||msg.type==='tc_run_history_delete'){ if(typeof tcRunHistoryOnWS==='function') tcRunHistoryOnWS(msg); return; }   // TC 실행 History 서버 저장 알림
  if(msg.type==='cli-live'){ if(typeof tcCliLiveOnWS==='function') tcCliLiveOnWS(msg); return; }   // 스텝 실행 중 CLI chunk 실시간 표시 (라이브 터미널만; 실행 로그는 완료 후)
  if(msg.type==='force_reload'){ _forceReloadOnWS(msg); return; }   // 관리자 트리거: 전체 사용자 강제 새로고침
  if(msg.type==='tc_updated'||msg.type==='tc_deleted'||msg.type==='cycle_updated'||msg.type==='cycle_deleted'||msg.type==='req_updated'||msg.type==='req_deleted'){
    if(typeof dataChangedOnWS==='function') dataChangedOnWS(msg); return;
  }   // 다른 사용자의 TC/Cycle/REQ 변경 알림 → 캐시 무효화 + 필요 시 재로드
  if(msg.type==='device_status'){
    const d=devices.find(x=>x.id===msg.id);
    if(d){d.status=msg.status;renderDeviceTree();updateStatusBar();}
  }
  if(msg.type==='step_start') updateRunStep(msg.seq,msg.name,'run');
  if(msg.type==='step_done') updateRunStep(msg.seq,msg.name,msg.status.toLowerCase(),msg.output);
  if(msg.type==='run_done'){
    document.getElementById('run-btn').innerHTML='<i class="ti ti-player-play"></i> 실행';
    document.getElementById('run-btn').disabled=false;
    loadResults();
  }
}

// ── 관리자 트리거: 전체 사용자 즉시 새로고침 ──
function _forceReloadOnWS(msg){
  try{ location.reload(); }catch(e){}
}

// ── 페이지 ──
// ── 장비 ──
async function loadDevices(){
  const r=await fetch('/api/devices');
  devices=(await r.json()).devices;
  renderDeviceTree(); updateStatusBar();
}
function renderDeviceTree(){
  const groups={};
  devices.forEach(d=>{if(!groups[d.group])groups[d.group]=[];groups[d.group].push(d);});
  const icons={'스위치':'ti-layout-grid','OLT':'ti-antenna','계측기':'ti-device-analytics'};
  let html='';
  for(const[group,list]of Object.entries(groups)){
    const gid='g_'+group.replace(/\//g,'_');
    html+=`<div class="tree-group">
      <div class="tree-parent" onclick="toggleTree('${gid}')">
        <i class="ti ${icons[group]||'ti-folder'}" style="font-size:14px"></i>
        <span style="flex:1">${group}</span>
        <i class="ti ti-chevron-right tree-arrow open" id="arr_${gid}"></i>
      </div>
      <div class="tree-children open" id="${gid}">`;
    list.forEach(d=>{
      const sc=d.status==='connected'?'g':d.status==='disconnected'?'r':'u';
      html+=`<div class="tree-child${d.id===selDevId?' sel':''}" onclick="selectDevice('${d.id}')">
        <div class="cdot ${sc}"></div>${d.model}</div>`;
    });
    html+=`</div></div>`;
  }
  document.getElementById('device-tree').innerHTML=html;
}
function selectDevice(id){
  selDevId=id;
  const d=devices.find(x=>x.id===id);
  if(!d)return;
  renderDeviceTree();
  const sc=d.status==='connected'?'on':d.status==='disconnected'?'off':'uk';
  const sl=d.status==='connected'?'● 연결됨':d.status==='disconnected'?'● 미연결':'● 미확인';
  const connBtn=d.status==='connected'
    ?`<button class="btn primary" onclick="openTerminal('${d.id}')"><i class="ti ti-terminal"></i> 터미널</button>`
    :`<button class="btn primary" onclick="connectDevice('${d.id}')"><i class="ti ti-plug"></i> 연결 시도</button>`;
  document.getElementById('device-detail-title').textContent=d.model+' 상세';
  document.getElementById('device-detail').innerHTML=`
    <div style="padding:4px;">
      <div class="dc">
        <div class="dt"><i class="ti ti-server-2" style="color:var(--blue)"></i>${d.model}</div>
        <div class="dr"><span class="dk">제품군</span><span class="dv">${d.group}</span></div>
        <div class="dr"><span class="dk">IP 주소</span><span class="dv">${d.ip}</span></div>
        <div class="dr"><span class="dk">프로토콜</span><span class="dv">${d.protocol} : ${d.port}</span></div>
        <div class="dr"><span class="dk">사용자명</span><span class="dv">${d.username||'-'}</span></div>
        <div class="dr"><span class="dk">설명</span><span class="dv">${d.description||'-'}</span></div>
        <div class="dr"><span class="dk">연결 상태</span><span class="dv"><span class="sbadge ${sc}">${sl}</span></span></div>
      </div>
      <div class="btn-row">
        ${connBtn}
        <button class="btn warn" onclick="openEditDevice('${d.id}')"><i class="ti ti-edit"></i> 수정</button>
        <button class="btn danger" onclick="deleteDevice('${d.id}')"><i class="ti ti-trash"></i> 삭제</button>
      </div>
      <div id="terminal-area"></div>
    </div>`;
}
function openEditDevice(id){
  const d=devices.find(x=>x.id===id);
  if(!d)return;
  document.getElementById('de-id').value=d.id;
  document.getElementById('de-group').value=d.group;
  document.getElementById('de-model').value=d.model;
  document.getElementById('de-ip').value=d.ip;
  document.getElementById('de-proto').value=d.protocol;
  document.getElementById('de-port').value=d.port;
  document.getElementById('de-user').value=d.username||'';
  document.getElementById('de-pass').value=d.password||'';
  document.getElementById('de-desc').value=d.description||'';
  openModal('modal-device-edit');
}
async function submitDevice(isEdit){
  const pfx=isEdit?'de':'da';
  const body={
    group:document.getElementById(pfx+'-group').value,
    model:document.getElementById(pfx+'-model').value,
    ip:document.getElementById(pfx+'-ip').value,
    protocol:document.getElementById(pfx+'-proto').value,
    port:parseInt(document.getElementById(pfx+'-port').value),
    username:document.getElementById(pfx+'-user').value,
    password:document.getElementById(pfx+'-pass').value,
    description:document.getElementById(pfx+'-desc').value
  };
  if(isEdit){
    const id=document.getElementById('de-id').value;
    await fetch('/api/devices/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    closeModal('modal-device-edit');
  } else {
    await fetch('/api/devices',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    closeModal('modal-device-add');
  }
  await loadDevices();
  if(selDevId) selectDevice(selDevId);
}
async function connectDevice(id){
  const btn=event.currentTarget;
  btn.innerHTML='<i class="ti ti-loader spin"></i> 연결 중...';
  btn.disabled=true;
  const r=await fetch('/api/devices/'+id+'/connect',{method:'POST'});
  const data=await r.json();
  const d=devices.find(x=>x.id===id);
  if(d) d.status=data.status;
  selectDevice(id); updateStatusBar();
}
function openTerminal(id){
  const area=document.getElementById('terminal-area');
  if(!area)return;
  area.innerHTML=`<div style="margin-top:10px;">
    <div class="fl">명령어 입력</div>
    <div style="display:flex;gap:6px;margin-top:4px;">
      <input class="fi" id="term-cmd" placeholder="show version" style="flex:1" onkeydown="if(event.key==='Enter')runCmd('${id}')">
      <button class="btn primary" onclick="runCmd('${id}')"><i class="ti ti-terminal"></i> 실행</button>
    </div>
    <div class="terminal" id="term-out">[터미널 준비됨]\n</div></div>`;
}
async function runCmd(id){
  const cmd=document.getElementById('term-cmd').value.trim();
  if(!cmd)return;
  const out=document.getElementById('term-out');
  out.textContent+=`\n$ ${cmd}\n`;
  const r=await fetch('/api/devices/'+id+'/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({command:cmd})});
  const data=await r.json();
  out.textContent+=data.output+'\n';
  out.scrollTop=out.scrollHeight;
}
async function deleteDevice(id){
  if(!confirm('장비를 삭제하시겠습니까?'))return;
  await fetch('/api/devices/'+id,{method:'DELETE'});
  selDevId=null;
  document.getElementById('device-detail').innerHTML='<div class="detail-empty"><i class="ti ti-server-off"></i><span>장비를 선택하세요</span></div>';
  await loadDevices();
}
function updateStatusBar(){
  const el=document.getElementById('stat-conn'); if(!el) return;
  // 등록 장비 기준: 새 deviceList(장비만, 계측기/tcl 제외) · 한글 상태 '연결됨'. 없으면 구 devices로 폴백.
  let list=[];
  if(typeof deviceList!=='undefined' && Array.isArray(deviceList) && deviceList.length){
    list=deviceList.filter(d=>!(d && (d.role==='계측기' || String(d.protocol||'').toLowerCase()==='tcl')));
  } else if(typeof devices!=='undefined' && Array.isArray(devices)){
    list=devices;
  }
  const c=list.filter(d=>d&&(d.status==='연결됨'||d.status==='connected')).length;
  el.textContent=`장비 ${c}/${list.length} 연결`;
}

// ── 시험 절차 ──
async function loadProcedures(){
  const r=await fetch('/api/procedures');
  procedures=(await r.json()).procedures;
  renderProcTree();
}
function renderProcTree(){
  const groups={};
  procedures.forEach(p=>{if(!groups[p.group])groups[p.group]=[];groups[p.group].push(p);});
  const icons={'스위치':'ti-layout-grid','OLT':'ti-antenna','계측기':'ti-device-analytics'};
  let html='';
  for(const[group,list]of Object.entries(groups)){
    const gid='pg_'+group.replace(/\//g,'_');
    html+=`<div class="tree-group">
      <div class="tree-parent" onclick="toggleTree('${gid}')">
        <i class="ti ${icons[group]||'ti-folder'}" style="font-size:14px"></i>
        <span style="flex:1">${group}</span>
        <i class="ti ti-chevron-right tree-arrow open" id="arr_${gid}"></i>
      </div>
      <div class="tree-children open" id="${gid}">`;
    list.forEach(p=>{
      html+=`<div class="tree-child${p.id===selProcId?' sel':''}" onclick="selectProc('${p.id}')">
        <i class="ti ti-file-description" style="font-size:13px;color:var(--text3)"></i>${p.model} · ${p.name}</div>`;
    });
    html+=`</div></div>`;
  }
  document.getElementById('proc-tree').innerHTML=html;
}
function selectProc(id){
  selProcId=id;
  const p=procedures.find(x=>x.id===id);
  if(!p)return;
  renderProcTree();
  document.getElementById('proc-detail-title').textContent=p.name;
  const stepsHtml=p.steps.map(s=>`
    <div class="step-row">
      <div class="step-num">${s.seq}</div>
      <div class="step-name">${s.name}</div>
      <div class="step-type">${s.type}</div>
      ${s.command?`<span style="font-size:11px;color:var(--text3);font-family:monospace">${s.command.substring(0,30)}${s.command.length>30?'...':''}</span>`:''}
    </div>`).join('');
  document.getElementById('proc-detail').innerHTML=`
    <div style="padding:4px;">
      <div class="dc">
        <div class="dt"><i class="ti ti-clipboard-list" style="color:var(--blue)"></i>${p.name}</div>
        <div class="dr"><span class="dk">대상 장비</span><span class="dv">${p.group} / ${p.model}</span></div>
        <div class="dr"><span class="dk">설명</span><span class="dv">${p.description||'-'}</span></div>
        <div class="dr"><span class="dk">단계 수</span><span class="dv">${p.steps.length} steps</span></div>
      </div>
      <div class="section-title">시험 단계</div>
      <div class="step-list">${stepsHtml}</div>
      <div class="btn-row">
        <button class="btn primary" onclick="showPage('run');loadRunSelect('${p.id}')"><i class="ti ti-player-play"></i> 실행</button>
        <button class="btn warn" onclick="openProcForm('${p.id}')"><i class="ti ti-edit"></i> 수정</button>
        <button class="btn success" onclick="saveAsTplFromProc('${p.id}')"><i class="ti ti-template"></i> 템플릿 저장</button>
        <button class="btn danger" onclick="deleteProc('${p.id}')"><i class="ti ti-trash"></i> 삭제</button>
      </div>
    </div>`;
}

// 절차 등록/수정 폼
function openProcForm(id){
  const p=id?procedures.find(x=>x.id===id):null;
  document.getElementById('proc-modal-title').innerHTML=p
    ?'<i class="ti ti-edit"></i> 절차 수정'
    :'<i class="ti ti-plus"></i> 절차 등록';
  document.getElementById('pm-id').value=p?p.id:'';
  document.getElementById('pm-group').value=p?p.group:'스위치';
  document.getElementById('pm-model').value=p?p.model:'';
  document.getElementById('pm-name').value=p?p.name:'';
  document.getElementById('pm-desc').value=p?p.description:'';
  const container=document.getElementById('pm-steps');
  container.innerHTML='';
  const steps=p?p.steps:[{seq:1,name:'',type:'CLI',command:''}];
  steps.forEach(s=>addStepRow(s));
  openModal('modal-proc');
}
function addStepRow(s){
  const container=document.getElementById('pm-steps');
  const n=container.children.length+1;
  const div=document.createElement('div');
  div.className='edit-step-row';
  div.innerHTML=`
    <div class="step-num">${n}</div>
    <input class="fi sm" style="flex:2;" placeholder="단계 설명" value="${s?s.name:''}">
    <select class="fs" style="width:80px;padding:5px 6px;font-size:11px;">
      ${['CLI','TCL','API','검증','리포트'].map(t=>`<option${s&&s.type===t?' selected':''}>${t}</option>`).join('')}
    </select>
    <input class="fi sm" style="flex:2;" placeholder="명령어(선택)" value="${s?s.command:''}">
    <button class="btn danger" style="padding:3px 7px;" onclick="this.parentElement.remove();renumberSteps()"><i class="ti ti-x"></i></button>`;
  container.appendChild(div);
}
function renumberSteps(){
  document.querySelectorAll('#pm-steps .edit-step-row').forEach((row,i)=>{
    row.querySelector('.step-num').textContent=i+1;
  });
}
async function submitProc(){
  const id=document.getElementById('pm-id').value;
  const steps=Array.from(document.querySelectorAll('#pm-steps .edit-step-row')).map((r,i)=>{
    const inputs=r.querySelectorAll('input');
    return{seq:i+1,name:inputs[0].value,type:r.querySelector('select').value,command:inputs[1].value};
  });
  const body={
    group:document.getElementById('pm-group').value,
    model:document.getElementById('pm-model').value,
    name:document.getElementById('pm-name').value,
    description:document.getElementById('pm-desc').value,
    steps
  };
  if(id){
    await fetch('/api/procedures/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  } else {
    await fetch('/api/procedures',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  }
  closeModal('modal-proc');
  await loadProcedures();
  if(selProcId) selectProc(selProcId);
}
async function deleteProc(id){
  if(!confirm('절차를 삭제하시겠습니까?'))return;
  await fetch('/api/procedures/'+id,{method:'DELETE'});
  selProcId=null;
  document.getElementById('proc-detail').innerHTML='<div class="detail-empty"><i class="ti ti-clipboard-list"></i><span>절차를 선택하세요</span></div>';
  await loadProcedures();
}

// ── 템플릿 ──
function loadTemplates(){
  try{ templates=JSON.parse(localStorage.getItem('nettest_templates')||'[]'); }
  catch(e){ templates=[]; }
}
function saveTemplates(){
  localStorage.setItem('nettest_templates',JSON.stringify(templates));
}
async function saveAsTplFromProc(id){
  const p=procedures.find(x=>x.id===id);
  if(!p)return;
  const name=prompt('템플릿 이름:', p.name+' 템플릿');
  if(!name)return;
  const tpl={id:'tpl_'+Date.now(),name,base_group:p.group,base_model:p.model,description:p.description,steps:p.steps,created:new Date().toISOString()};
  templates.push(tpl);
  saveTemplates();
  alert(`템플릿 "${name}" 저장 완료!`);
  renderTemplates();
}
function saveAsTemplate(){
  const steps=Array.from(document.querySelectorAll('#pm-steps .edit-step-row')).map((r,i)=>{
    const inputs=r.querySelectorAll('input');
    return{seq:i+1,name:inputs[0].value,type:r.querySelector('select').value,command:inputs[1].value};
  });
  const name=document.getElementById('pm-name').value||'새 템플릿';
  const tpl={
    id:'tpl_'+Date.now(),
    name:name+' 템플릿',
    base_group:document.getElementById('pm-group').value,
    base_model:document.getElementById('pm-model').value,
    description:document.getElementById('pm-desc').value,
    steps,
    created:new Date().toISOString()
  };
  templates.push(tpl);
  saveTemplates();
  alert(`템플릿 "${tpl.name}" 저장 완료!`);
  renderTemplates();
}
function renderTemplates(){
  loadTemplates();
  const list=document.getElementById('tpl-list');
  if(!templates.length){
    list.innerHTML='<div class="detail-empty" style="margin-top:40px;"><i class="ti ti-template"></i><span style="font-size:12px;">저장된 템플릿이 없습니다</span><span style="font-size:11px;color:var(--text3);">절차 상세에서 템플릿 저장</span></div>';
    return;
  }
  list.innerHTML=templates.map(t=>`
    <div class="tree-child${t.id===selTplId?' sel':''}" onclick="selectTemplate('${t.id}')" style="flex-direction:column;align-items:flex-start;padding:8px 10px;margin-bottom:2px;background:var(--bg3);border-radius:6px;border:1px solid var(--border);">
      <div style="display:flex;align-items:center;gap:6px;width:100%;">
        <i class="ti ti-template" style="font-size:13px;color:var(--text3)"></i>
        <span style="flex:1;font-size:12px;color:var(--text)">${t.name}</span>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:2px;padding-left:19px;">${t.base_group} / ${t.base_model} · ${t.steps.length}steps</div>
    </div>`).join('');
}
function selectTemplate(id){
  selTplId=id;
  const t=templates.find(x=>x.id===id);
  if(!t)return;
  renderTemplates();
  document.getElementById('tpl-detail-title').textContent=t.name;
  const stepsHtml=t.steps.map(s=>`
    <div class="step-row">
      <div class="step-num">${s.seq}</div>
      <div class="step-name">${s.name}</div>
      <div class="step-type">${s.type}</div>
    </div>`).join('');
  document.getElementById('tpl-detail').innerHTML=`
    <div style="padding:4px;">
      <div class="dc">
        <div class="dt"><i class="ti ti-template" style="color:#9d7bff"></i>${t.name}</div>
        <div class="dr"><span class="dk">기준 장비</span><span class="dv">${t.base_group} / ${t.base_model}</span></div>
        <div class="dr"><span class="dk">설명</span><span class="dv">${t.description||'-'}</span></div>
        <div class="dr"><span class="dk">단계 수</span><span class="dv">${t.steps.length} steps</span></div>
        <div class="dr"><span class="dk">저장일시</span><span class="dv">${new Date(t.created).toLocaleString('ko-KR')}</span></div>
      </div>
      <div class="section-title">단계 목록</div>
      <div class="step-list">${stepsHtml}</div>
      <div class="btn-row">
        <button class="btn primary" onclick="openTplApply('${t.id}')"><i class="ti ti-plus"></i> 이 템플릿으로 절차 생성</button>
        <button class="btn danger" onclick="deleteTemplate('${t.id}')"><i class="ti ti-trash"></i> 삭제</button>
      </div>
    </div>`;
}
function openTplApply(id){
  const t=templates.find(x=>x.id===id);
  if(!t)return;
  document.getElementById('ta-group').value=t.base_group;
  document.getElementById('ta-model').value='';
  document.getElementById('ta-name').value=t.name.replace(' 템플릿','');
  document.getElementById('tpl-apply-name').textContent=`템플릿: ${t.name}`;
  document.getElementById('modal-tpl-apply').dataset.tplId=id;
  openModal('modal-tpl-apply');
}
async function submitTplApply(){
  const id=document.getElementById('modal-tpl-apply').dataset.tplId;
  const t=templates.find(x=>x.id===id);
  if(!t)return;
  const body={
    group:document.getElementById('ta-group').value,
    model:document.getElementById('ta-model').value,
    name:document.getElementById('ta-name').value,
    description:t.description,
    steps:t.steps
  };
  await fetch('/api/procedures',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  closeModal('modal-tpl-apply');
  await loadProcedures();
  showPage('procedures');
  alert('절차가 생성되었습니다!');
}
function deleteTemplate(id){
  if(!confirm('템플릿을 삭제하시겠습니까?'))return;
  templates=templates.filter(x=>x.id!==id);
  saveTemplates();
  selTplId=null;
  document.getElementById('tpl-detail').innerHTML='<div class="detail-empty"><i class="ti ti-template"></i><span>템플릿을 선택하세요</span></div>';
  renderTemplates();
}

// ── 시험 실행 ──
function loadRunSelect(selectId){
  const sel=document.getElementById('run-select');
  sel.innerHTML=procedures.map(p=>`<option value="${p.id}"${p.id===selectId?' selected':''}>${p.group} / ${p.model} - ${p.name}</option>`).join('');
}
function updateRunStep(seq,name,status,output){
  const el=document.getElementById(`run-step-${seq}`);
  if(!el)return;
  const icon=status==='run'?'<i class="ti ti-loader spin"></i>':status==='pass'?'<i class="ti ti-check" style="color:var(--green)"></i>':'<i class="ti ti-x" style="color:var(--red)"></i>';
  const badge=status==='run'?'<span class="step-status run">실행중</span>':status==='pass'?'<span class="step-status pass">PASS</span>':'<span class="step-status fail">FAIL</span>';
  el.querySelector('.step-icon').innerHTML=icon;
  el.querySelector('.step-badge').innerHTML=badge;
  if(output){
    let outEl=document.getElementById(`run-out-${seq}`);
    if(!outEl){
      outEl=document.createElement('div');
      outEl.id=`run-out-${seq}`;
      outEl.className='terminal';
      outEl.style.fontSize='11px';outEl.style.maxHeight='80px';
      el.insertAdjacentElement('afterend',outEl);
    }
    outEl.textContent=output;
  }
}
async function runProcedure(){
  const id=document.getElementById('run-select').value;
  if(!id)return;
  const proc=procedures.find(p=>p.id===id);
  const logDiv=document.getElementById('run-log');
  const stepsDiv=document.getElementById('run-steps');
  logDiv.style.display='block';
  stepsDiv.innerHTML=proc.steps.map(s=>`
    <div id="run-step-${s.seq}" style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border);">
      <div class="step-num">${s.seq}</div>
      <div style="flex:1;font-size:12px;">${s.name}</div>
      <div class="step-type">${s.type}</div>
      <span class="step-icon" style="font-size:14px;color:var(--text3)"><i class="ti ti-clock"></i></span>
      <span class="step-badge"></span>
    </div>`).join('');
  document.getElementById('run-btn').innerHTML='<i class="ti ti-loader spin"></i> 실행중...';
  document.getElementById('run-btn').disabled=true;
  await fetch('/api/run/'+id,{method:'POST'});
}

// ── 결과 ──
async function loadResults(){
  const r=await fetch('/api/results');
  const data=await r.json();
  const list=document.getElementById('result-list');
  if(!data.results.length){list.innerHTML='<div class="detail-empty"><i class="ti ti-chart-bar"></i><span>결과 없음</span></div>';return;}
  list.innerHTML=data.results.map(res=>`
    <div class="result-card" onclick='showResult(${JSON.stringify(res).replace(/'/g,"&#39;")})'>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
        <div style="font-size:13px;font-weight:600;">${res.proc_name}</div>
        <span class="overall-badge ${res.overall==='PASS'?'pass':'fail'}">${res.overall}</span>
      </div>
      <div style="font-size:11px;color:var(--text3);">${res.model} · ${new Date(res.timestamp).toLocaleString('ko-KR')}</div>
    </div>`).join('');
}
function showResult(res){
  const stepsHtml=res.steps.map(s=>`
    <div class="step-row">
      <div class="step-num">${s.seq}</div>
      <div class="step-name">${s.name}</div>
      <div class="step-type">${s.type}</div>
      <span class="step-status ${s.status==='PASS'?'pass':'fail'}">${s.status}</span>
    </div>`).join('');
  document.getElementById('result-detail').innerHTML=`
    <div style="padding:4px;">
      <div class="dc">
        <div class="dt"><i class="ti ti-chart-bar" style="color:var(--blue)"></i>${res.proc_name}</div>
        <div class="dr"><span class="dk">대상 장비</span><span class="dv">${res.model}</span></div>
        <div class="dr"><span class="dk">실행 시간</span><span class="dv">${new Date(res.timestamp).toLocaleString('ko-KR')}</span></div>
        <div class="dr"><span class="dk">최종 결과</span><span class="dv"><span class="sbadge ${res.overall==='PASS'?'on':'off'}">${res.overall}</span></span></div>
      </div>
      <div class="step-list">${stepsHtml}</div>
    </div>`;
}

// ── Claude 채팅 ──
// ── 채팅 파일 첨부 / 이미지 붙여넣기 (Dify 지식 어시스턴트) ──
let _chatFile=null;
function chatPickFile(){ const i=document.getElementById('chat-file-input'); if(i){ i.value=''; i.click(); } }
function chatFileChosen(input){ const f=input&&input.files&&input.files[0]; if(f){ _chatFile=f; chatRenderFileChip(); } }
function chatPaste(e){
  try{
    const items=(e.clipboardData&&e.clipboardData.items)||[];
    for(let i=0;i<items.length;i++){
      const it=items[i];
      if(it.kind==='file' && (it.type||'').indexOf('image/')===0){
        const f=it.getAsFile();
        if(f){ e.preventDefault(); _chatFile=f; chatRenderFileChip(); return; }
      }
    }
  }catch(err){}
}
function chatClearFile(){ _chatFile=null; chatRenderFileChip(); }
function chatRenderFileChip(){
  const el=document.getElementById('chat-file-chip'); if(!el) return;
  const sess=(typeof chatCur==='function')?chatCur():null;
  if(_chatFile){
    const isImg=(_chatFile.type||'').indexOf('image/')===0; let thumb='';
    if(isImg){ try{ thumb='<img src="'+URL.createObjectURL(_chatFile)+'" style="width:32px;height:32px;object-fit:cover;border-radius:5px;flex-shrink:0;">'; }catch(e){} }
    el.style.display='block';
    el.innerHTML='<span style="display:inline-flex;align-items:center;gap:8px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:5px 9px;max-width:100%;">'
      +(thumb||'<i class="ti ti-file" style="font-size:16px;color:var(--text2);"></i>')
      +'<span style="font-size:12px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px;">'+String(_chatFile.name||'첨부파일').replace(/</g,'&lt;')+'</span>'
      +'<i class="ti ti-x" onclick="chatClearFile()" title="제거" style="font-size:14px;color:var(--text3);cursor:pointer;flex-shrink:0;"></i></span>';
    return;
  }
  if(sess && sess.difyFile && sess.difyFile.id){
    el.style.display='block';
    el.innerHTML='<span style="display:inline-flex;align-items:center;gap:8px;background:rgba(45,111,212,0.08);border:1px solid var(--border);border-radius:8px;padding:5px 9px;max-width:100%;">'
      +'<i class="ti ti-paperclip" style="font-size:15px;color:var(--blue);"></i>'
      +'<span style="font-size:12px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:170px;">'+String(sess.difyFile.name||'첨부파일').replace(/</g,'&lt;')+'</span>'
      +'<span style="font-size:11px;color:var(--text3);flex-shrink:0;">· 이 대화에 첨부됨</span>'
      +'<i class="ti ti-x" onclick="chatClearConvFile()" title="첨부 해제" style="font-size:14px;color:var(--text3);cursor:pointer;flex-shrink:0;"></i></span>';
    return;
  }
  el.style.display='none'; el.innerHTML='';
}
function chatClearConvFile(){ const s=(typeof chatCur==='function')?chatCur():null; if(s){ try{ delete s.difyFile; }catch(e){ s.difyFile=null; } try{ chatSaveSessions(); }catch(e){} } chatRenderFileChip(); }
function chatAttHtml(file){
  const isImg=(file.type||'').indexOf('image/')===0; let url='';
  try{ url=URL.createObjectURL(file); }catch(e){}
  if(isImg && url) return '<div style="margin-top:6px;"><img src="'+url+'" style="max-width:220px;max-height:170px;border-radius:8px;display:block;"></div>';
  return '<div style="margin-top:6px;display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--text3);"><i class="ti ti-paperclip"></i> '+String(file.name||'첨부파일').replace(/</g,'&lt;')+'</div>';
}
// 큰 이미지는 업로드 전에 축소/재인코딩(JPEG)해 Dify 크기제한(413) 회피
function _chatShrinkImage(file, maxDim, quality){
  return new Promise(function(resolve){
    try{
      if((file.type||'').indexOf('image/')!==0){ resolve(file); return; }
      const url=URL.createObjectURL(file);
      const img=new Image();
      img.onload=function(){
        const w=img.naturalWidth||img.width, h=img.naturalHeight||img.height;
        const scale=Math.min(1, (maxDim||1600)/Math.max(w||1,h||1));
        const nw=Math.max(1,Math.round((w||1)*scale)), nh=Math.max(1,Math.round((h||1)*scale));
        try{
          const cv=document.createElement('canvas'); cv.width=nw; cv.height=nh;
          cv.getContext('2d').drawImage(img,0,0,nw,nh);
          URL.revokeObjectURL(url);
          cv.toBlob(function(blob){
            if(!blob){ resolve(file); return; }
            resolve(new File([blob], String(file.name||'image').replace(/\.[^.]+$/,'')+'.jpg', {type:'image/jpeg'}));
          },'image/jpeg', quality||0.82);
        }catch(e){ URL.revokeObjectURL(url); resolve(file); }
      };
      img.onerror=function(){ URL.revokeObjectURL(url); resolve(file); };
      img.src=url;
    }catch(e){ resolve(file); }
  });
}
async function sendChat(){
  const input=document.getElementById('chat-input');
  let msg=input.value.trim();
  if(!msg && !_chatFile) return;
  const selId=document.getElementById('chat-model-select')?.value;
  const isDify=!!(selId && selId.indexOf('dify:')===0);
  const difyAsst=isDify?selId.slice(5):'';
  if(_chatFile && !isDify){ showToast('파일 첨부는 지식 어시스턴트(Dify)에서만 지원됩니다 — 모델을 바꿔주세요.'); return; }
  if(!msg && _chatFile) msg='첨부한 파일을 확인해 주세요.';
  const _file=_chatFile; chatClearFile();
  input.value='';
  const _ub=appendMsg('user','나',msg);
  if(_file){ const _um=_ub&&_ub.querySelector('.msg'); if(_um){ _um.insertAdjacentHTML('beforeend', chatAttHtml(_file)); } }
  chatHistory.push({role:'user',content:msg});
  // 보내는 즉시 현재 대화의 최근시각·제목 갱신 → 기록 목록 실시간 반영(최상단 이동)
  try{ const _cs=(typeof chatCur==='function')?chatCur():null; if(_cs){ _cs.updated=Date.now(); if(!_cs.title||_cs.title==='새 채팅'){ _cs.title=(msg||'').slice(0,30)||_cs.title; } chatSaveSessions(); chatRenderSidebar(); } }catch(e){}

  const _difyNames={specs:'검증 지식 Assistant',qag:'QAG 프로젝트 이력',trouble:'Troubleshooting'};
  const llm=llmList.find(x=>x.id===selId);
  const aiName=isDify?(_difyNames[difyAsst]||'Assistant'):(llm?llm.name:'AI');
  const loading=appendMsg('ai',aiName,'<i class="ti ti-loader spin"></i>');
  const msgEl=loading.querySelector('.msg');

  // 시스템 프롬프트
  const sysPrompt=`당신은 Ubiquoss-TOP(Ubiquoss Test Orchestration Platform)의 AI 어시스턴트입니다.
유비쿼스 네트워크 장비(스위치, OLT) 시험 자동화를 지원합니다.
주요 역할: 장비 CLI 명령어 안내, REQ/TC 분석, 시험 시나리오 작성, 트러블슈팅.
CLI 명령어는 코드 블록으로 표시하세요. 한국어로 답변하세요.`;

  _chatStreaming=true;
  try{
    if(isDify){
      // Dify ChatFlow 스트리밍 (API 키/URL 은 서버 보관, conversation_id 로 맥락 유지)
      const sess=(typeof chatCur==='function')?chatCur():null;
      if(sess && !sess.difyConv) sess.difyConv={};
      const convId=(sess&&sess.difyConv&&sess.difyConv[difyAsst])||'';
      const _user=(typeof currentUser!=='undefined'&&currentUser&&currentUser.username)||'utop-user';
      let fullText=''; msgEl.innerHTML='';
      // 새 파일을 붙였으면 업로드 후 '이 대화의 파일'로 등록. 이후 질문은 재업로드 없이 이 파일을 계속 사용.
      let difyFiles=[], uploadOk=true;
      if(_file){
        msgEl.innerHTML='<i class="ti ti-loader spin"></i> 파일 업로드 중…';
        try{
          let _up=_file;
          if((_file.type||'').indexOf('image/')===0 && _file.size>700*1024){
            try{ const _s=await _chatShrinkImage(_file,1600,0.82); if(_s && _s.size && _s.size<_file.size) _up=_s; }catch(_e){}
          }
          const fd=new FormData(); fd.append('assistant',difyAsst); fd.append('user',_user); fd.append('file',_up,_up.name||'upload');
          const ur=await fetch('/api/dify/upload',{method:'POST',body:fd}); const uj=await ur.json();
          if(uj&&uj.ok&&uj.id){ if(sess){ sess.difyFile={id:uj.id,type:uj.type||'document',name:uj.name||_up.name||(_file.name||'file')}; } }
          else { uploadOk=false; msgEl.innerHTML='<span style="color:var(--red);">파일 업로드 실패: '+String((uj&&uj.error)||('HTTP '+ur.status)).replace(/</g,'&lt;')+'</span>'; }
        }catch(upErr){ uploadOk=false; msgEl.innerHTML='<span style="color:var(--red);">파일 업로드 실패: '+upErr.message+'</span>'; }
      }
      // 이 대화에 붙은 파일이 있으면 매 질문마다 함께 전송(워크플로우 log_file 유지 → 재업로드 불필요)
      if(sess && sess.difyFile && sess.difyFile.id){ difyFiles=[{upload_file_id:sess.difyFile.id, type:sess.difyFile.type||'document'}]; }
      if(uploadOk){
      msgEl.innerHTML='';
      const r=await fetch('/api/dify/chat',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({assistant:difyAsst,query:msg,conversation_id:convId,user:_user,files:difyFiles})});
      if(!r.ok) throw new Error('HTTP '+r.status);
      const reader=r.body.getReader(); const decoder=new TextDecoder(); let buf='';
      while(true){
        const {done,value}=await reader.read(); if(done) break;
        buf+=decoder.decode(value,{stream:true});
        const parts=buf.split('\n'); buf=parts.pop();
        for(const line of parts){
          if(!line.startsWith('data: ')) continue;
          const dataStr=line.slice(6);
          if(dataStr==='[DONE]') continue;
          try{
            const chunk=JSON.parse(dataStr);
            if(chunk.text){ fullText+=chunk.text; msgEl.innerHTML=formatMsg(fullText); const c=document.getElementById('chat-msgs'); if(c)c.scrollTop=c.scrollHeight; }
            else if(chunk.conv && sess){ if(!sess.difyConv) sess.difyConv={}; sess.difyConv[difyAsst]=chunk.conv; }
          }catch(e){}
        }
      }
      if(!fullText){ msgEl.innerHTML='<span style="color:var(--text3);">(응답 없음)</span>'; }
      }
      chatHistory.push({role:'assistant',content:fullText});
    }
    else if(!llm || llm.type==='claude'){
      // Claude API (서버 경유)
      const r=await fetch('/api/chat',{method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({message:msg,history:chatHistory})});
      const data=await r.json();
      msgEl.innerHTML=formatMsg(data.reply);
      chatHistory.push({role:'assistant',content:data.reply});
    } else {
      // 로컬 LLM 스트리밍 시도 → 실패 시 일반 응답 fallback
      // RAG 컨텍스트 주입: 매뉴얼·TC·REQ 색인 검색 → 시스템 프롬프트에 근거 첨부 (window._chatRagOn=false로 끔)
      let ragCtx='';
      if(window._chatRagOn!==false){
        try{
          msgEl.innerHTML='<i class="ti ti-loader spin"></i> <span style="font-size:11px;color:var(--text3);">지식 검색 중…</span>';
          const rr=await fetch('/api/rag/search',{method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({query:msg,top_k:4,confluence:false,min_score:0.2})});
          const rd=await rr.json();
          const rhits=(rd&&rd.hits)||[];
          if(rhits.length){
            ragCtx='\n\n[사내 지식 검색 결과 — 질문과 관련 있으면 근거로 활용하고 출처(문서명)를 언급하세요. 관련 없으면 무시하세요.]\n'
              +rhits.map((h,i)=>'('+(i+1)+') ['+(h.source||'manual')+' · '+String(h.name||'').slice(0,60)+'] '+String(h.text||'').slice(0,500)).join('\n');
          }
        }catch(e){}
      }
      const messages=[
        {role:'system',content:(llm.system_prompt||sysPrompt)+ragCtx},
        ...chatHistory.slice(-10).map(h=>({role:h.role,content:h.content}))
      ];
      const payload={
        endpoint:llm.endpoint,
        model:llm.model,
        messages,
        max_tokens:llm.max_tokens||4096,
        context_size:llm.context_size||262144,
        temperature:llm.temperature??0.7,
        apikey:llm.apikey||''
      };
      let fullText='';
      msgEl.innerHTML='';

      try{
        // 스트리밍 시도
        const r=await fetch('/api/chat/local/stream',{method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify(payload)});
        if(!r.ok) throw new Error(`stream ${r.status}`);
        const reader=r.body.getReader();
        const decoder=new TextDecoder();
        while(true){
          const {done,value}=await reader.read();
          if(done) break;
          const lines=decoder.decode(value).split('\n');
          for(const line of lines){
            if(line.startsWith('data: ')){
              const data=line.slice(6);
              if(data==='[DONE]') break;
              try{
                const chunk=JSON.parse(data);
                if(chunk.text){
                  fullText+=chunk.text;
                  msgEl.innerHTML=formatMsg(fullText);
                  const c=document.getElementById('chat-msgs');
                  c.scrollTop=c.scrollHeight;
                }
              }catch(e){}
            }
          }
        }
      } catch(streamErr){
        // 스트리밍 실패 → 일반 응답으로 fallback
        console.log('스트리밍 실패, 일반 응답으로 전환:', streamErr.message);
        msgEl.innerHTML='<i class="ti ti-loader spin"></i>';
        const r2=await fetch('/api/chat/local',{method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify(payload)});
        if(!r2.ok) throw new Error(`HTTP ${r2.status}`, {cause: streamErr});
        const data=await r2.json();
        fullText=data.reply||'응답을 받지 못했습니다.';
        msgEl.innerHTML=formatMsg(fullText);
      }
      chatHistory.push({role:'assistant',content:fullText});
    }
  } catch(e){
    msgEl.innerHTML=`<span style="color:var(--red);">오류: ${e.message}</span>`;
  } finally{ _chatStreaming=false; }
  // 세션 저장 + 첫 메시지로 제목 자동 설정
  const _s=(typeof chatCur==='function')?chatCur():null;
  if(_s){ _s.updated=Date.now(); _s.llmId=document.getElementById('chat-model-select')?.value||_s.llmId; if(!_s.title||_s.title==='새 채팅'){ const fu=_s.messages.find(m=>m.role==='user'); if(fu) _s.title=fu.content.slice(0,30); } chatSaveSessions(); chatRenderSidebar(); try{ chatRenderFileChip(); }catch(e){} }
}
function appendMsg(role,label,text){
  const div=document.createElement('div');
  div.className='msg-block '+(role==='user'?'user':'ai');
  const _av=role==='user'
    ? (typeof _avatarHtml==='function'?_avatarHtml(typeof currentUser!=='undefined'?currentUser:null,20):'')
    : '<span style="width:20px;height:20px;border-radius:50%;background:linear-gradient(135deg,#2d6fd4,#9d7bff);display:inline-flex;align-items:center;justify-content:center;color:#fff;flex-shrink:0;"><i class="ti ti-sparkles" style="font-size:12px;"></i></span>';
  div.innerHTML=`<div class="msg-label" style="display:flex;align-items:center;gap:6px;justify-content:${role==='user'?'flex-end':'flex-start'};">${_av}<span>${label}</span></div><div class="msg ${role}">${formatMsg(text)}</div>`;
  const c=document.getElementById('chat-msgs');
  c.appendChild(div);
  c.scrollTop=c.scrollHeight;
  return div;
}
// LLM이 LaTeX 문법으로 낸 화살표·기호($\rightarrow$ 등)를 유니코드로 치환 (marked가 처리 못 함)
function _deLatex(s){
  s=String(s==null?'':s);
  // 1) 인라인 수식 래퍼를 먼저 벗김 — 단, 백슬래시(=LaTeX 명령)를 포함한 것만 (통화 $100 보존)
  s=s.replace(/\$([^$\n]{0,120}?)\$/g, function(m,inner){ return (inner.indexOf('\\')>=0)? inner : m; });
  s=s.replace(/\\\(([\s\S]*?)\\\)/g, '$1').replace(/\\\[([\s\S]*?)\\\]/g, '$1');
  // 2) LaTeX 명령 → 유니코드
  var map={'\\\\rightarrow':'→','\\\\Rightarrow':'⇒','\\\\to\\b':'→','\\\\longrightarrow':'⟶','\\\\leftarrow':'←','\\\\Leftarrow':'⇐','\\\\leftrightarrow':'↔','\\\\Leftrightarrow':'⇔','\\\\uparrow':'↑','\\\\downarrow':'↓','\\\\times':'×','\\\\div':'÷','\\\\pm':'±','\\\\leq':'≤','\\\\geq':'≥','\\\\neq':'≠','\\\\approx':'≈','\\\\cdot':'·','\\\\ldots':'…','\\\\dots':'…','\\\\bullet':'•','\\\\checkmark':'✓'};
  for(var k in map){ s=s.replace(new RegExp(k,'g'), map[k]); }
  // 3) 남은 수식 잔재 정리: \text{..} → 내용, 나머지 백슬래시 명령의 백슬래시 제거
  s=s.replace(/\\text\{([^}]*)\}/g,'$1').replace(/\\mathrm\{([^}]*)\}/g,'$1');
  return s;
}
function formatMsg(text){
  text=_deLatex(text);
  if(typeof marked === 'undefined') {
    // fallback
    return text.replace(/```([\s\S]*?)```/g,'<code style="display:block;white-space:pre;background:var(--bg4);padding:8px;border-radius:4px;margin:4px 0;font-size:11px;color:var(--green);">$1</code>')
               .replace(/`([^`]+)`/g,'<code style="background:var(--bg4);padding:1px 4px;border-radius:3px;color:var(--green);">$1</code>');
  }
  marked.setOptions({
    breaks: true,
    gfm: true,
  });
  return marked.parse(text||'');
}
function chatKeydown(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat();}}
// ── 채팅 세션(다중 대화 기록) ──
let chatSessions=[], chatCurId=null;
function _chatUser(){ try{ return (typeof currentUser!=='undefined'&&currentUser&&currentUser.username)||'default'; }catch(e){ return 'default'; } }
function _chatTok(){ try{ return localStorage.getItem('utop_token')||''; }catch(e){ return ''; } }
// 표시 필터: 관리자는 전체, 일반 사용자는 본인(user==나) 채팅만 (백엔드 필터의 이중 보완)
function _chatVisible(arr){ try{ if(typeof isAdmin==='function' && isAdmin()) return arr||[]; }catch(e){} const me=_chatUser(); return (arr||[]).filter(function(s){ return s && s.user===me; }); }
let _chatStreaming=false;
async function chatLoadSessions(){
  try{
    const r=await fetch('/api/chat-sessions?token='+encodeURIComponent(_chatTok()));
    const d=await r.json();
    let arr=(d&&Array.isArray(d.sessions))?d.sessions:[];
    if(!arr.length){
      // 서버에 기록이 없으면 이 브라우저 localStorage 기록을 1회 서버로 이관
      try{ const local=JSON.parse(localStorage.getItem('utop_chat_sessions')||'[]');
        if(Array.isArray(local)&&local.length){ local.forEach(s=>{ if(s&&!s.user) s.user=_chatUser(); });
          try{ fetch('/api/chat-sessions?token='+encodeURIComponent(_chatTok()),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessions:local})}); }catch(e){}
          arr=local; }
      }catch(e){}
    }
    chatSessions=_chatVisible(Array.isArray(arr)?arr:[]);
  }catch(e){
    try{ chatSessions=JSON.parse(localStorage.getItem('utop_chat_sessions')||'[]'); if(!Array.isArray(chatSessions)) chatSessions=[]; }catch(_){ chatSessions=[]; }
  }
}
let _chatSaveTimer=null;
function chatSaveSessions(){
  try{ localStorage.setItem('utop_chat_sessions',JSON.stringify(chatSessions)); }catch(e){}
  const s=(typeof chatCur==='function')?chatCur():null; if(!s) return;
  if(s&&!s.user) s.user=_chatUser();   // 소유자 보장 (분리/관리자 열람 기준)
  if(!s.messages||!s.messages.length) return; // 빈 새 채팅은 서버에 저장 안 함(기록에 안 쌓이고 남에게도 안 보임)
  if(_chatSaveTimer) clearTimeout(_chatSaveTimer);
  _chatSaveTimer=setTimeout(function(){
    try{ fetch('/api/chat-sessions?token='+encodeURIComponent(_chatTok()),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:s})}); }catch(e){}
  }, 400);
}
// 실시간 공유: 서버 기록을 주기적으로 가져와 병합. 활성 대화는 스트리밍/전송직후 보호.
async function chatPoll(){
  if(_chatStreaming) return;
  if(!document.getElementById('chat-session-list')) return;
  try{
    const r=await fetch('/api/chat-sessions?token='+encodeURIComponent(_chatTok())); const d=await r.json();
    let server=_chatVisible((d&&Array.isArray(d.sessions))?d.sessions:[]);
    const localActive=chatSessions.find(s=>s.id===chatCurId);
    if(localActive && !server.some(s=>s.id===chatCurId)){ server=[localActive].concat(server); }
    // 로컬 활성 대화가 서버보다 최신(방금 전송, 업서트 지연)이면 로컬 보존
    if(localActive){ const srv=server.find(s=>s.id===chatCurId); if(srv && (localActive.messages||[]).length>(srv.messages||[]).length){ srv.messages=localActive.messages; srv.title=localActive.title||srv.title; srv.updated=Math.max(srv.updated||0,localActive.updated||0); srv.llmId=localActive.llmId||srv.llmId; if(localActive.difyConv)srv.difyConv=localActive.difyConv; if(localActive.difyFile)srv.difyFile=localActive.difyFile; } }
    chatSessions=server;
    const cur=chatSessions.find(s=>s.id===chatCurId);
    if(cur){ const oldLen=(chatHistory||[]).length, newLen=(cur.messages||[]).length; chatHistory=cur.messages||[]; if(newLen!==oldLen) chatRenderMessages(); }
    try{ localStorage.setItem('utop_chat_sessions',JSON.stringify(chatSessions)); }catch(e){}
    chatRenderSidebar();
  }catch(e){}
}
function chatCur(){ return chatSessions.find(s=>s.id===chatCurId); }
async function chatInit(){
  renderChatModelSelect();
  _chatStartTick();
  await chatLoadSessions();
  chatRenderSidebar();
  // 기본값: 항상 '새 채팅'으로 시작(기존 대화는 기록 목록에서 클릭해 열람)
  chatNewSession();
}
function chatNewSession(){
  const s={id:'chat-'+Date.now(), title:'새 채팅', llmId:(document.getElementById('chat-model-select')?.value)||'', messages:[], updated:Date.now(), user:_chatUser()};
  chatSessions.unshift(s);
  chatCurId=s.id; chatHistory=s.messages;
  chatSaveSessions(); chatRenderSidebar(); chatRenderMessages();
  _chatFile=null; try{ chatRenderFileChip(); }catch(e){} try{ chatRenderDifyModels(); }catch(e){}
  document.getElementById('chat-input')?.focus();
}
function chatSelectSession(id){
  const s=chatSessions.find(x=>x.id===id); if(!s) return;
  chatCurId=id; chatHistory=s.messages;
  const sel=document.getElementById('chat-model-select');
  if(sel&&s.llmId&&[...sel.options].some(o=>o.value===s.llmId)) sel.value=s.llmId;
  chatRenderSidebar(); chatRenderMessages();
  _chatFile=null; try{ chatRenderFileChip(); }catch(e){} try{ chatRenderDifyModels(); }catch(e){}
}
function chatDeleteSession(id,ev){
  if(ev) ev.stopPropagation();
  const _t=chatSessions.find(s=>s.id===id);
  const _empty=!_t||!_t.messages||!_t.messages.length;
  if(_empty){ _chatDoDelete(id,true); return; }   // 빈 대화는 확인 없이
  const _title=(_t&&_t.title)||'이 대화';
  if(typeof uiConfirm==='function'){ uiConfirm({title:'대화 삭제', msg:'<b>'+String(_title).replace(/</g,'&lt;')+'</b> 대화를 삭제할까요?', icon:'ti-trash', danger:true, confirmText:'삭제', onConfirm:function(){ _chatDoDelete(id,false); }}); }
  else { if(confirm('이 대화를 삭제할까요?')) _chatDoDelete(id,false); }
}
function _chatDoDelete(id,empty){
  chatSessions=chatSessions.filter(s=>s.id!==id);
  if(!empty){ try{ fetch('/api/chat-sessions/delete?token='+encodeURIComponent(_chatTok()),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id})}); }catch(e){} }
  chatSaveSessions();
  if(chatCurId===id){ chatNewSession(); return; }   // 활성 대화 삭제 시 새 채팅
  chatRenderSidebar();
}
function _chatTs(s){ return (s&&s.updated)||parseInt(String((s&&s.id)||'').replace(/[^0-9]/g,''),10)||0; }
function _chatAgo(ts){
  if(!ts) return '';
  const s=Math.floor((Date.now()-ts)/1000);
  if(s<10) return '방금';
  if(s<60) return s+'s';
  const m=Math.floor(s/60); if(m<60) return m+'m';
  const h=Math.floor(m/60); if(h<24) return h+'h';
  const d=Math.floor(h/24); if(d<7) return d+'d';
  const w=Math.floor(d/7); if(w<5) return w+'w';
  const mo=Math.floor(d/30); return mo<12?mo+'mo':Math.floor(d/365)+'y';
}
let _chatTickStarted=false;
function _chatStartTick(){
  if(_chatTickStarted) return; _chatTickStarted=true;
  setInterval(function(){
    const pg=document.getElementById('page-chat');
    if(pg && pg.classList.contains('active')){ try{ chatPoll(); }catch(e){} }
  }, 5000);
}
function chatRenderSidebar(){
  const list=document.getElementById('chat-session-list'); if(!list) return;
  const me=_chatUser();
  window._chatSelIds=window._chatSelIds||new Set();
  // 최근 사용(updated) 내림차순으로 정렬 → 방금 대화한 항목이 맨 위로
  const sorted=chatSessions.slice().sort((a,b)=>_chatTs(b)-_chatTs(a));
  const _canDel=function(s){ const mine=(s.user||'')===me; return mine||(typeof isAdmin==='function'&&isAdmin()); };
  // 유효하지 않은 선택 정리
  window._chatSelIds.forEach(function(id){ if(!chatSessions.find(x=>x.id===id)) window._chatSelIds.delete(id); });
  const selN=window._chatSelIds.size;
  const bulkBar=selN?('<div style="display:flex;align-items:center;gap:7px;padding:7px 10px;margin-bottom:6px;background:rgba(229,62,90,0.08);border:1px solid rgba(229,62,90,0.25);border-radius:8px;">'
    +'<span style="font-size:12.5px;font-weight:800;color:#c0392b;flex:1;">'+selN+'개 선택</span>'
    +'<button onclick="event.stopPropagation();chatBulkDelete()" style="font-size:11.5px;font-weight:700;padding:4px 11px;border-radius:6px;border:1px solid #e53e5a;background:#e53e5a;color:#fff;cursor:pointer;"><i class="ti ti-trash" style="font-size:12px;"></i> 선택 삭제</button>'
    +'<button onclick="event.stopPropagation();chatSelClear()" style="font-size:11.5px;padding:4px 9px;border-radius:6px;border:1px solid var(--border);background:#fff;color:var(--text3);cursor:pointer;">해제</button></div>'):'';
  list.innerHTML=bulkBar+(sorted.map(s=>{
    const active=s.id===chatCurId;
    const ago=_chatAgo(_chatTs(s));
    const mine=(s.user||'')===me;
    const who=(s.user&&!mine)?String(s.user).replace(/</g,'&lt;'):'';
    const del=_canDel(s);
    const checked=window._chatSelIds.has(s.id);
    return '<div onclick="chatSelectSession(\''+s.id+'\')" style="display:flex;align-items:center;gap:6px;padding:9px 10px;border-radius:7px;cursor:pointer;font-size:14.5px;margin-bottom:2px;'+(active?'background:rgba(45,111,212,0.1);color:var(--blue);font-weight:600;':(checked?'background:rgba(229,62,90,0.06);':'color:var(--text2);'))+'">'
      +(del?'<input type="checkbox" '+(checked?'checked':'')+' onclick="event.stopPropagation();chatSelToggle(\''+s.id+'\',this.checked)" title="선택" style="width:14px;height:14px;flex-shrink:0;cursor:pointer;accent-color:#e53e5a;">':'<span style="width:14px;flex-shrink:0;"></span>')
      +'<i class="ti ti-message-2" style="font-size:16px;flex-shrink:0;color:'+(who?'var(--purple,#7c5cbf)':'inherit')+';"></i>'
      +'<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+((s.title||'새 채팅').replace(/</g,'&lt;'))+'</span>'
      +((who||ago)?'<span title="'+(who?('작성자 '+who+' · '):'')+'마지막 사용" style="font-size:11px;color:var(--text3);flex-shrink:0;font-weight:500;white-space:nowrap;">'+(who?(who+' · '):'')+ago+'</span>':'')
      +(del?'<i class="ti ti-trash" onclick="chatDeleteSession(\''+s.id+'\',event)" title="삭제" style="font-size:16px;color:var(--text3);flex-shrink:0;" onmouseenter="this.style.color=\'var(--red)\'" onmouseleave="this.style.color=\'var(--text3)\'"></i>':'')
      +'</div>';
  }).join('')||'<div style="font-size:13.5px;color:var(--text3);padding:10px;text-align:center;">대화 없음</div>');
}
function chatSelToggle(id,on){ window._chatSelIds=window._chatSelIds||new Set(); if(on)window._chatSelIds.add(id); else window._chatSelIds.delete(id); chatRenderSidebar(); }
function chatSelClear(){ window._chatSelIds=new Set(); chatRenderSidebar(); }
function chatBulkDelete(){
  const ids=[...(window._chatSelIds||[])]; if(!ids.length) return;
  const _do=function(){ ids.forEach(function(id){ const s=chatSessions.find(x=>x.id===id); const empty=!s||!s.messages||!s.messages.length; chatSessions=chatSessions.filter(x=>x.id!==id); if(!empty){ try{ fetch('/api/chat-sessions/delete?token='+encodeURIComponent(_chatTok()),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id})}); }catch(e){} } }); window._chatSelIds=new Set(); chatSaveSessions(); if(ids.indexOf(chatCurId)>=0){ chatNewSession(); } else { chatRenderSidebar(); } };
  if(typeof uiConfirm==='function'){ uiConfirm({title:'대화 일괄 삭제', msg:'선택한 <b>'+ids.length+'개</b> 대화를 삭제할까요?', icon:'ti-trash', danger:true, confirmText:'삭제', onConfirm:_do}); }
  else { if(confirm(ids.length+'개 대화를 삭제할까요?')) _do(); }
}
// 탑메뉴 AI Assistant '작업 중' 배지 on/off (자동실행·LLM 호출 등에서 호출)
function aiBusy(on, text){
  var b=document.getElementById('ai-busy-badge'); if(!b) return;
  if(on){ if(text){ var _t=b.childNodes[b.childNodes.length-1]; if(_t&&_t.nodeType===3)_t.nodeValue=String(text); } b.classList.add('on'); b.style.display='inline-flex'; }
  else { b.classList.remove('on'); b.style.display='none'; }
}
// 내 대화 기록 전체 삭제 (관리자는 전부, 일반 사용자는 본인 것만)
function chatDeleteAll(){
  const me=_chatUser(); const admin=(typeof isAdmin==='function'&&isAdmin());
  const targets=chatSessions.filter(s=>admin||((s.user||'')===me));
  if(!targets.length){ if(typeof showToast==='function')showToast('삭제할 대화가 없습니다'); return; }
  const _do=function(){
    const ids=targets.map(s=>s.id); const idset=new Set(ids);
    targets.forEach(function(s){ const empty=!s||!s.messages||!s.messages.length; if(!empty){ try{ fetch('/api/chat-sessions/delete?token='+encodeURIComponent(_chatTok()),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:s.id})}); }catch(e){} } });
    chatSessions=chatSessions.filter(s=>!idset.has(s.id));
    window._chatSelIds=new Set(); chatSaveSessions();
    if(idset.has(chatCurId)){ chatNewSession(); } else { chatRenderSidebar(); }
    if(typeof showToast==='function')showToast('🗑 '+ids.length+'개 대화 삭제됨');
  };
  if(typeof uiConfirm==='function'){ uiConfirm({title:'대화 전체 삭제', msg:(admin?'모든':'내')+' 대화 기록 <b>'+targets.length+'개</b>를 전부 삭제할까요?<br><span style="font-size:11.5px;color:#c0392b;">되돌릴 수 없습니다.</span>', icon:'ti-trash', danger:true, confirmText:'전체 삭제', onConfirm:_do}); }
  else { if(confirm(targets.length+'개 대화를 전부 삭제할까요?')) _do(); }
}
// ── AI 채팅 오프닝 멘트·입력창 안내문 (LLM 항목별 설정 — 선택된 LLM의 값 사용) ──
const _CHAT_GREETING_DEF='안녕하세요! Ubiquoss-TOP AI 어시스턴트입니다. 🔧\n\n장비 설정, REQ/TC 조회, 시험 시나리오 등 무엇이든 물어보세요.';
const _CHAT_PLACEHOLDER_DEF='장비 설정 방법, 시험 시나리오, 트러블슈팅 등... (이미지는 붙여넣기 가능)';
function _chatSelCfg(){ const sel=document.getElementById('chat-model-select'); const id=sel?sel.value:''; if(!id) return null; if(id.indexOf('dify:')===0){ const did=id.slice(5); return (typeof difyList!=='undefined'?difyList:[]).find(x=>x.id===did)||null; } return (typeof llmList!=='undefined'?llmList:[]).find(x=>x.id===id)||null; }
function chatGreeting(){ const l=_chatSelCfg(); const v=l&&l.greeting; return (v!=null&&String(v).trim()!=='')?v:_CHAT_GREETING_DEF; }
function chatPlaceholder(){ const l=_chatSelCfg(); const v=l&&l.placeholder; return (v!=null&&String(v).trim()!=='')?v:_CHAT_PLACEHOLDER_DEF; }
function applyChatPlaceholder(){ const i=document.getElementById('chat-input'); if(i) i.placeholder=chatPlaceholder(); }
function chatRenderMessages(){
  const c=document.getElementById('chat-msgs'); if(!c) return;
  applyChatPlaceholder();
  const s=chatCur();
  if(!s||!s.messages.length){
    c.innerHTML='<div class="msg-block"><div class="msg-label">AI</div><div class="msg ai">'+formatMsg(chatGreeting())+'</div></div>';
    return;
  }
  c.innerHTML=s.messages.map(m=>'<div class="msg-block '+(m.role==='user'?'user':'ai')+'"><div class="msg-label">'+(m.role==='user'?'나':'AI')+'</div><div class="msg '+(m.role==='user'?'user':'ai')+'">'+formatMsg(m.content)+'</div></div>').join('');
  c.scrollTop=c.scrollHeight;
}

// ── LLM 관리 ──
let llmList = [];
let selLlmId = null;

function loadLLMs(){
  const saved=localStorage.getItem('utop_llms');
  llmList=saved?JSON.parse(saved):[];
}
function saveLLMs(){
  localStorage.setItem('utop_llms',JSON.stringify(llmList));
}
async function loadLLMsFromServer(){
  try{
    const r=await fetch('/api/llms');
    const data=await r.json();
    llmList=data.llms||[];
    // localStorage도 동기화
    localStorage.setItem('utop_llms',JSON.stringify(llmList));
  } catch(e){
    // 서버 실패 시 localStorage fallback
    loadLLMs();
  }
}
function renderLLMTree(){
  const tree=document.getElementById('llm-tree'); if(!tree) return;
  let html='';
  if(!llmList.length){
    html+='<div class="detail-empty" style="margin:22px 0 6px;"><i class="ti ti-brain"></i><span style="font-size:12px;">등록된 LLM 없음</span></div>';
  } else {
    html+=llmList.map(l=>{
      const sel=l.id===selLlmId;
      const active=l.status==='active';
      const tc=l.type==='claude'?'#d97706':'#2d6fd4';
      return '<div draggable="true" ondragstart="llmDragStart(event,\''+l.id+'\')" ondragover="llmDragOver(event)" ondrop="llmDrop(event,\''+l.id+'\')" ondragend="llmDragEnd(event)" onclick="selectLLM(\''+l.id+'\')" style="display:flex;align-items:center;gap:8px;padding:9px 10px;margin:3px 6px;border-radius:9px;cursor:pointer;border:1px solid '+(sel?'var(--blue)':'transparent')+';background:'+(sel?'rgba(45,111,212,0.08)':'transparent')+';transition:background 0.12s;">'
        +'<i class="ti ti-grip-vertical" style="font-size:16px;color:#c4cad6;cursor:grab;flex-shrink:0;" title="드래그로 순서 이동"></i>'
        +'<div style="width:30px;height:30px;border-radius:8px;background:'+tc+'1a;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="ti ti-brain" style="font-size:16px;color:'+tc+';"></i></div>'
        +'<div style="flex:1;min-width:0;"><div style="font-size:14.5px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+(l.name||'(이름없음)')+'</div><div style="font-size:11px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+(l.model||l.type||'')+'</div></div>'
        +'<span title="'+(active?'활성':'비활성')+'" style="width:8px;height:8px;border-radius:50%;background:'+(active?'#00a872':'#ccc')+';flex-shrink:0;"></span>'
      +'</div>';
    }).join('');
  }
  // 지식 어시스턴트(Dify)는 여기(Chat LLM 목록)에서 제거 — Reports AI 오른쪽 상단 탭으로 이동됨
  tree.innerHTML=html;
  // Reports AI 오른쪽 동적 Dify 탭을 목록과 동기화
  if(typeof _llmRenderDifyTabs==='function') _llmRenderDifyTabs();
}
// Dify 어시스턴트 편집 폼 HTML (재사용) — Chat LLM 목록 상세, Dify 전용 탭 양쪽에서 사용
function _difyFormHtml(a){
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;');
  const inSt='width:100%;font-size:13.5px;padding:8px 11px;border:1px solid var(--border);border-radius:7px;outline:none;box-sizing:border-box;background:var(--bg2);color:var(--text);';
  const frow=(lab,inner,hint)=>'<div style="margin-bottom:13px;"><div style="font-size:12px;color:var(--text3);font-weight:600;margin-bottom:4px;">'+lab+'</div>'+inner+(hint?'<div style="font-size:10.5px;color:var(--text3);margin-top:3px;">'+hint+'</div>':'')+'</div>';
  const _type=(a.type==='llm')?'llm':'dify';
  const isLlm=_type==='llm';
  // 일반형(llm) LLM 선택 옵션 — Chat LLM 목록에서
  const _llms=(typeof llmList!=='undefined'&&Array.isArray(llmList))?llmList:[];
  const llmOpts='<option value=""'+(!a.llm_id?' selected':'')+'>기본(제마 자동)</option>'+_llms.map(function(l){ var id=l.id||l.name; return '<option value="'+esc(id)+'"'+(String(a.llm_id||'')===String(id)?' selected':'')+'>'+esc(l.name||l.model||id)+(l.model?(' · '+esc(l.model)):'')+'</option>'; }).join('');
  const kindBadge=isLlm?'<span style="font-size:11px;color:#0d9488;font-weight:800;">일반 어시스턴트 · LLM + 프롬프트</span>':'<span style="font-size:11px;color:#7c3aed;font-weight:800;">지식 어시스턴트 · Dify ChatFlow</span>';
  const accent=isLlm?'#0d9488':'#7c3aed';
  // 타입별 필드 — 시스템 프롬프트는 별도 우측 카드로 렌더 (여기서는 제외)
  const llmFields=isLlm?(
      frow('사용 LLM','<select id="dify-f-llmid" style="'+inSt+'cursor:pointer;">'+llmOpts+'</select>','Chat LLM 탭에 등록된 모델 중 선택. 미지정 시 기본(제마) 사용.')
    +frow('사내 지식검색(RAG)','<label style="display:inline-flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;"><input type="checkbox" id="dify-f-rag" onchange="_difyRagSrcToggle()" '+(a.rag?'checked':'')+' style="width:16px;height:16px;accent-color:#0d9488;"> 질문 시 지식 소스를 검색해 근거로 활용</label>','켜면 아래에서 고른 지식 소스를 검색해 답변 근거로 삼습니다.')
    +'<div id="dify-f-ragsrc" style="display:'+(a.rag?'block':'none')+';margin:-6px 0 13px;">'+_difyRagSourceRows(a.rag_sources)+'</div>'
  ):(
      frow('Dify 엔드포인트 (Base URL)','<input id="dify-f-endpoint" value="'+esc(a.endpoint)+'" placeholder="http://host:port/v1" style="'+inSt+'font-family:ui-monospace,monospace;">','/chat-messages·/files/upload 앞의 Base URL')
    +frow('API Key','<div style="display:flex;gap:6px;"><input id="dify-f-key" type="password" autocomplete="new-password" value="'+esc(a.key||'')+'" placeholder="app-xxxxxxxx" style="'+inSt+'font-family:ui-monospace,monospace;flex:1;"><button type="button" onclick="difyToggleKey(this)" title="키 보기/숨기기" style="flex-shrink:0;width:42px;border:1px solid var(--border);border-radius:7px;background:var(--bg2);color:var(--text3);cursor:pointer;"><i class="ti ti-eye"></i></button></div>','앱(App) API 키 — 눈 아이콘으로 표시/숨김. 저장 시 서버에 보관됩니다.')
    +frow('파일 입력 변수 (선택)','<input id="dify-f-filevar" value="'+esc(a.file_var)+'" placeholder="예: log_file" style="'+inSt+'">','ChatFlow Start 노드의 File 변수명. 비우면 첨부를 message files로 전달.')
  );
  // Confluence 체크 상태 (우측 카드 표시 조건)
  var _confOn=false;
  try{
    var _rs=Array.isArray(a.rag_sources)?a.rag_sources:[];
    var _c=_rs.find(function(x){ return x && x.source==='confluence'; });
    _confOn=!!(a.rag && (_c?_c.enabled:false));
  }catch(_ce){}
  // 좌측: 기본 편집 폼
  var mainCol='<input type="hidden" id="dify-f-type" value="'+_type+'">'
    +'<div style="display:flex;align-items:center;gap:13px;margin-bottom:18px;">'
      +'<div style="width:46px;height:46px;border-radius:12px;background:'+accent+'24;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="ti '+(a.icon||(isLlm?'ti-message-chatbot':'ti-sparkles'))+'" style="font-size:25px;color:'+accent+';"></i></div>'
      +'<div style="flex:1;min-width:0;">'+kindBadge+'<div style="font-size:17px;font-weight:800;color:var(--text);">'+esc(a.name)+'</div></div>'
    +'</div>'
    +frow('이름','<input id="dify-f-name" value="'+esc(a.name)+'" placeholder="어시스턴트 이름" style="'+inSt+'">')
    +llmFields
    +frow('오프닝 멘트 (마크다운)','<textarea id="dify-f-greeting" placeholder="비우면 기본 인사말" style="'+inSt+'min-height:70px;resize:vertical;line-height:1.6;font-family:inherit;">'+esc(a.greeting||'')+'</textarea>','지식 검색에서 이 어시스턴트 선택 시 첫 인사말 (마크다운 지원)')
    +frow('입력창 안내문','<textarea id="dify-f-placeholder" placeholder="비우면 기본 안내문" style="'+inSt+'min-height:44px;resize:vertical;font-family:inherit;">'+esc(a.placeholder||'')+'</textarea>','입력창 placeholder 문구')
    +frow('지식 검색 노출 그룹','<select id="dify-f-kbgroup" style="'+inSt+'cursor:pointer;">'
      +(function(){ var g=a.kb_group||'external'; var opts=[['','노출 안 함 (숨김)'],['general','일반 검색'],['kb','UTOP 내부 검색'],['jira','로컬 지식 툴'],['external','외부 지식 툴']]; return opts.map(function(o){ return '<option value="'+o[0]+'"'+(g===o[0]?' selected':'')+'>'+o[1]+'</option>'; }).join(''); })()
      +'</select>','지식 검색 페이지 상단 어느 그룹의 드롭다운에 이 어시스턴트를 노출할지 선택합니다. "노출 안 함"이면 숨겨집니다.')
    +'<input type="hidden" id="dify-f-public" value="'+((a.kb_group||'external')?'1':'0')+'">'
    +'<div style="display:flex;gap:8px;margin-top:6px;">'
      +'<button onclick="difySave(\''+a.id+'\')" style="font-size:12.5px;padding:9px 18px;border-radius:8px;border:none;background:#00a872;color:#fff;cursor:pointer;font-weight:700;"><i class="ti ti-device-floppy"></i> 저장</button>'
      +'<button onclick="difyDelete(\''+a.id+'\')" style="font-size:12.5px;padding:9px 18px;border-radius:8px;border:1px solid rgba(229,62,90,0.4);background:rgba(229,62,90,0.06);color:var(--red);cursor:pointer;font-weight:600;"><i class="ti ti-trash"></i> 삭제</button>'
    +'</div>'
    +'<div style="font-size:11px;color:var(--text3);margin-top:14px;line-height:1.5;border-top:1px solid var(--border);padding-top:12px;"><i class="ti ti-shield-lock" style="color:#00a872;"></i> 공개로 설정하면 <b>지식 검색</b> 페이지의 어시스턴트 선택기에 나타납니다.</div>';
  // 우측: 시스템 프롬프트 (헤더 없이 라벨 + textarea) + (Confluence 켜져 있을 때만) Confluence 연동 카드
  var promptCard=isLlm?('<div>'
      +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">'
        +'<i class="ti ti-file-text" style="font-size:15px;color:'+accent+';"></i>'
        +'<span style="font-size:13px;font-weight:800;color:var(--text);">시스템 프롬프트</span>'
        +'<span style="font-size:11px;color:var(--text3);">— 이 어시스턴트의 역할·어조·규칙</span>'
        +'<span style="flex:1;"></span>'
        +'<button type="button" onclick="_difyPromptReset()" title="비우기" style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg2);color:var(--text2);cursor:pointer;"><i class="ti ti-refresh" style="font-size:12px;"></i> 비우기</button>'
      +'</div>'
      +'<textarea id="dify-f-prompt" placeholder="이 어시스턴트의 역할·어조·규칙을 자유롭게 작성하세요." style="width:100%;font-size:13px;padding:11px 13px;border:1px solid var(--border);border-radius:10px;outline:none;box-sizing:border-box;background:var(--bg2);color:var(--text);min-height:520px;resize:vertical;line-height:1.65;font-family:inherit;">'+esc(a.prompt||'')+'</textarea>'
      +'<div style="font-size:10.5px;color:var(--text3);margin-top:5px;line-height:1.5;">질문 앞에 이 프롬프트가 붙습니다. RAG 사용 시 검색된 지식이 함께 주입됩니다.</div>'
    +'</div>'):'';
  var confCardHtml='';
  try{ confCardHtml=(typeof _difyConfluenceCard==='function')?_difyConfluenceCard():''; }catch(_ee){}
  var rightCol=isLlm?(promptCard
      +'<div id="dify-f-confluence-card" style="margin-top:14px;display:'+(_confOn?'block':'none')+';">'+confCardHtml+'</div>'
    ):'';
  if(isLlm){
    // 좌: 기본 폼(560), 우: 시스템 프롬프트 카드 (고정폭 780)
    return '<div style="padding:18px 22px;display:grid;grid-template-columns:560px 780px;gap:24px;align-items:start;">'
      +'<div style="min-width:0;">'+mainCol+'</div>'
      +'<div style="min-width:0;">'+rightCol+'</div>'
    +'</div>';
  }
  return '<div style="padding:18px 22px;max-width:640px;">'+mainCol+'</div>';
}
function _difyPromptReset(){ var t=document.getElementById('dify-f-prompt'); if(t) t.value=''; }
// Confluence 연동 설정 카드 HTML — 어시스턴트 편집에서 Confluence 소스 켠 경우 우측에 표시
function _difyConfluenceCard(){
  var esc=function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;'); };
  var cc=(window._confluenceCfg&&typeof window._confluenceCfg==='object')?window._confluenceCfg:{};
  var scopes=Array.isArray(window._ksrcScopes)?window._ksrcScopes:[];
  var setOn=!!cc.base_url;
  var defDepth=(cc.default_depth!=null?String(cc.default_depth):'3');
  var scopeRows=scopes.length
    ? scopes.map(function(sc,i){
        var _dirty=sc._dirty?' <span style="font-size:10px;font-weight:800;color:#e8820c;background:#fff3e0;border:1px solid #f0c98a;border-radius:8px;padding:2px 8px;">저장 안 됨</span>':'';
        var _pageName=sc.parent_title||sc.label||'';
        return '<div style="border:1px solid '+(sc._dirty?'#f0c98a':'var(--border)')+';border-radius:8px;background:'+(sc.enabled?'var(--bg2)':'var(--bg3)')+';margin-bottom:8px;padding:11px 13px;">'
          +'<div style="display:flex;align-items:center;gap:9px;">'
            +'<input type="checkbox" '+(sc.enabled?'checked':'')+' onchange="_confLocalSet('+i+',\'enabled\',this.checked)" style="width:16px;height:16px;accent-color:#0d9488;flex-shrink:0;">'
            +'<i class="ti ti-folder-open" style="font-size:16px;color:#0d9488;flex-shrink:0;"></i>'
            +'<input value="'+esc(_pageName)+'" placeholder="페이지 트리 이름 (예: knowledge-based space, AI주간업무)" oninput="_confLocalSetPageName('+i+',this.value)" style="flex:1;min-width:0;font-size:13.5px;font-weight:600;padding:7px 10px;border:1px solid var(--border);border-radius:7px;background:var(--bg2);color:var(--text);outline:none;">'
            +_dirty
            +'<button type="button" onclick="_confScopeDel('+i+')" title="삭제" style="width:30px;height:30px;border:1px solid rgba(229,62,90,0.35);border-radius:6px;background:#fff;color:var(--red);cursor:pointer;padding:0;flex-shrink:0;"><i class="ti ti-trash" style="font-size:14px;"></i></button>'
          +'</div>'
          +'<div style="margin-top:5px;padding-left:32px;font-size:11.5px;color:var(--text3);">Confluence 에서 이 이름의 페이지 및 하위 전체가 검색 대상 (space=<b>'+esc(cc.space_key||'kb')+'</b>)</div>'
        +'</div>';
      }).join('')
    : '<div style="font-size:13px;color:var(--text3);padding:8px 2px;">등록된 페이지가 없습니다. 아래 <b>페이지 추가</b> 로 등록하세요.</div>';
  return '<div>'
    +'<div style="display:flex;align-items:center;gap:9px;margin-bottom:7px;">'
      +'<i class="ti ti-brand-confluence" style="font-size:17px;color:#0d9488;"></i>'
      +'<span style="font-size:14.5px;font-weight:800;color:var(--text);">Confluence 연동</span>'
      +'<span style="font-size:12.5px;color:var(--text3);">— 제품스펙·디버깅·주간업무 문서 검색 범위</span>'
      +'<span style="flex:1;"></span>'
      +'<span style="font-size:12px;font-weight:700;padding:4px 12px;border-radius:20px;background:'+(setOn?'rgba(13,148,136,0.12)':'var(--bg3)')+';color:'+(setOn?'#0d9488':'var(--text3)')+';border:1px solid '+(setOn?'rgba(13,148,136,0.35)':'var(--border)')+';">'+(setOn?'접속 설정됨':'미설정')+'</span>'
    +'</div>'
    +'<div style="padding:16px 18px;border:1px solid var(--border);border-radius:10px;background:var(--bg2);">'
      +'<div style="font-size:13px;color:var(--text3);margin-bottom:12px;line-height:1.55;">Confluence 페이지 트리 <b>이름</b> 만 입력하세요. 해당 페이지와 하위 전체가 검색 대상이 됩니다. (접속 정보·space 는 <b>RAG Data</b> 에서 관리)</div>'
      +'<div style="font-size:13px;font-weight:700;color:var(--text2);margin:8px 0 7px;"><i class="ti ti-target" style="font-size:15px;color:#0d9488;"></i> 검색할 페이지 <span style="color:var(--text3);font-weight:400;">('+scopes.length+'개)</span></div>'
      +'<div id="conf-scope-list">'+scopeRows+'</div>'
      +'<div style="display:flex;gap:8px;margin-top:14px;align-items:center;">'
        +'<button type="button" onclick="_confScopeAdd()" style="font-size:13px;font-weight:700;padding:9px 15px;border:1px dashed var(--border);border-radius:7px;background:var(--bg2);color:#0d9488;cursor:pointer;"><i class="ti ti-plus" style="font-size:14px;"></i> 페이지 추가</button>'
        +'<span style="flex:1;font-size:11.5px;color:var(--text3);">편집 후 좌측 하단 <b style="color:#00875a;">저장</b> 버튼을 누르면 어시스턴트와 함께 저장됩니다.</span>'
        +'<button type="button" onclick="showPage(\'manual\')" style="font-size:13px;font-weight:700;padding:9px 15px;border:1px solid var(--border);border-radius:7px;background:#fff;color:var(--text2);cursor:pointer;"><i class="ti ti-external-link" style="font-size:14px;"></i> RAG Data</button>'
      +'</div>'
    +'</div>'
  +'</div>';
}
// Confluence 카드 UX 헬퍼
function _difyRefreshConfCard(){
  var box=document.getElementById('dify-f-confluence-card'); if(!box) return;
  try{ box.innerHTML=_difyConfluenceCard(); }catch(e){}
}
// ── 로컬 편집 (저장 하지 않음, 화면만 갱신) ─────────
function _confLocalSet(i, field, val){
  if(!window._ksrcScopes||!window._ksrcScopes[i]) return;
  window._ksrcScopes[i][field]=val;
  window._ksrcScopes[i]._dirty=true;
  // 사용자 편집 중이므로 재렌더는 하지 않음 (input 포커스 유지). "저장" 클릭 시 재렌더.
}
// 페이지 트리 이름 입력 — parent_title + label 동시 설정, url/page_id 는 비움 (이름 기반 검색)
function _confLocalSetPageName(i, name){
  if(!window._ksrcScopes||!window._ksrcScopes[i]) return;
  var s=window._ksrcScopes[i];
  s.parent_title=String(name||'').trim();
  s.label=s.parent_title;
  s.url=''; s.page_id='';
  s._dirty=true;
}
function _confLocalSetUrl(i, urlStr){
  if(!window._ksrcScopes||!window._ksrcScopes[i]) return;
  var s=window._ksrcScopes[i]; s.url=String(urlStr||'').trim(); s._dirty=true;
  s.space_key=''; s.parent_title=''; s.page_id='';
  if(!s.url) return;
  try{
    var u=new URL(s.url);
    if(!window._confluenceCfg) window._confluenceCfg={};
    if(!window._confluenceCfg.base_url) window._confluenceCfg.base_url=u.origin;
    if(u.pathname.indexOf('/pages/viewpage.action')>=0){
      var pid=u.searchParams.get('pageId'); if(pid) s.page_id=pid;
    } else {
      var m=u.pathname.match(/\/display\/([^/]+)(?:\/(.+))?/i);
      if(m){ s.space_key=decodeURIComponent(m[1]); if(m[2]) s.parent_title=decodeURIComponent(m[2]).replace(/\+/g,' '); }
    }
    if(!s.label){ s.label=s.parent_title||s.space_key||(s.page_id?('pageId='+s.page_id):''); }
  }catch(_e){}
}
// ── Confluence 전체 저장 (명시적 "저장" 버튼 클릭 시) ─
async function _confSaveAll(showMsg){
  try{
    var cc=window._confluenceCfg||{};
    var payload={
      base_url: cc.base_url||'',
      default_depth: (cc.default_depth!=null?parseInt(cc.default_depth)||3:3),
      scopes: (window._ksrcScopes||[]).map(function(s){
        return {
          enabled: !!s.enabled,
          label: s.label||'',
          url: s.url||'',
          space_key: s.space_key||'',
          parent_title: s.parent_title||'',
          page_id: s.page_id||'',
          depth: (s.depth!=null?parseInt(s.depth)||null:null),
        };
      }).filter(function(s){ return s.url||s.page_id||s.parent_title||s.space_key; }),   // 식별자 없는 빈 draft 는 저장 payload 에서 제외
    };
    // 관리자 토큰 필요 — userApi 사용 (token 쿼리스트링)
    if(typeof userApi==='function'){
      await userApi('POST','/api/confluence/config',payload);
    } else {
      var _tk=(typeof authToken!=='undefined'&&authToken)?('?token='+encodeURIComponent(authToken)):'';
      var _r=await fetch('/api/confluence/config'+_tk,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      if(!_r.ok){ throw new Error('저장 실패 '+_r.status); }
    }
    // 서버가 정리한 값을 재조회 → 로컬 캐시 동기화 (단, 아직 서버 저장 대상이 아닌 draft 는 유지)
    try{
      var _rr=await (await fetch('/api/confluence/config')).json();
      if(_rr){
        window._confluenceCfg=Object.assign({}, cc, _rr);
        var _serverScopes=Array.isArray(_rr.scopes)?_rr.scopes:[];
        var _drafts=(window._ksrcScopes||[]).filter(function(s){ return s && !(s.url||s.page_id||s.parent_title||s.space_key); });
        window._ksrcScopes=_serverScopes.concat(_drafts);
      }
    }catch(_e){}
    if(showMsg!==false && typeof showToast==='function') showToast('Confluence 설정 저장됨');
    if(typeof _difyRefreshConfCard==='function') _difyRefreshConfCard();
    return true;
  }catch(e){
    if(typeof showToast==='function') showToast('저장 실패: '+(e&&e.message||e));
    return false;
  }
}
async function _confSaveField(field, val){
  if(!window._confluenceCfg) window._confluenceCfg={};
  window._confluenceCfg[field]=val;
  // 필드 하나 편집 → 전체 저장
  await _confSaveAll(false);
}
function _confScopeAdd(){
  window._ksrcScopes=window._ksrcScopes||[];
  // 빈 scope — 사용자가 페이지 이름 입력하면 parent_title 채워짐
  window._ksrcScopes.push({enabled:true, label:'', parent_title:'', space_key:'', url:'', page_id:'', _draft:true});
  _difyRefreshConfCard();
}
function _confScopeDel(i){
  if(!window._ksrcScopes || i<0 || i>=window._ksrcScopes.length) return;
  if(!confirm('이 범위를 삭제할까요?')) return;
  window._ksrcScopes.splice(i,1);
  try{ if(typeof _ksrcSaveScopes==='function') _ksrcSaveScopes(); }catch(e){}
  _difyRefreshConfCard();
}
// URL 붙여넣기 → base_url / space_key / parent_title / page_id 자동 파싱
function _confScopeSetUrl(i, urlStr){
  if(!window._ksrcScopes || !window._ksrcScopes[i]) return;
  var s=window._ksrcScopes[i];
  s.url=String(urlStr||'').trim();
  // 초기화
  s.space_key=''; s.parent_title=''; s.page_id='';
  if(s.url) delete s._draft;   // URL 있으면 draft 해제 (서버 저장 대상)
  if(!s.url){ try{ if(typeof _ksrcSaveScopes==='function') _ksrcSaveScopes(); }catch(e){} _difyRefreshConfCard(); return; }
  try{
    var u=new URL(s.url);
    // base_url 자동 추출 (아직 base_url 없거나 다르면 갱신)
    var _origin=u.origin;
    if(!window._confluenceCfg) window._confluenceCfg={};
    if(!window._confluenceCfg.base_url) window._confluenceCfg.base_url=_origin;
    // 패턴 1: /pages/viewpage.action?pageId=NNN
    if(u.pathname.indexOf('/pages/viewpage.action')>=0){
      var pid=u.searchParams.get('pageId');
      if(pid) s.page_id=pid;
    }
    // 패턴 2: /display/<space>/<Title+with+plus>
    else {
      var m=u.pathname.match(/\/display\/([^/]+)(?:\/(.+))?/i);
      if(m){
        s.space_key=decodeURIComponent(m[1]);
        if(m[2]) s.parent_title=decodeURIComponent(m[2]).replace(/\+/g,' ');
      }
    }
    // label 이 비어있으면 URL 로부터 자동 생성
    if(!s.label){
      if(s.parent_title) s.label=s.parent_title;
      else if(s.space_key) s.label=s.space_key;
      else if(s.page_id) s.label='pageId='+s.page_id;
    }
  }catch(e){
    if(typeof showToast==='function') showToast('URL 파싱 실패: '+(e&&e.message||e));
  }
  try{ if(typeof _ksrcSaveScopes==='function') _ksrcSaveScopes(); }catch(e){}
  _difyRefreshConfCard();
}
// 지식 소스 3종(TC 세부절차 / 매뉴얼·문서 RAG / Confluence) 활성화+우선순위 UI.
// window._difyRagSrcState에 편집 중인 배열을 들고 있다가 저장(difySave) 시 그대로 전송.
var _DIFY_RAG_SRC_LABEL={tc:'TC 항목 세부 절차 저장',manual:'메뉴얼 및 문서',confluence:'Confluence 문서(제품스펙·디버깅방법·주간업무 등)'};
var _DIFY_RAG_SRC_DESC={tc:'시험절차 학습/조회에 등록된 검증된 Step(설명·CLI·판정기준)',manual:'RAG Data에 등록된 매뉴얼·제품스펙 문서 발췌',confluence:'System › AI Assistant › Jira Search 설정의 Confluence 연동(라이브 조회)'};
function _difyRagSourceRows(rag_sources, defaultOn){
  var order=['tc','manual','confluence'];
  var on=defaultOn||['manual'];   // 저장된 값이 없을 때(신규) 기본 활성 소스 — 어시스턴트=manual만, kb모드 호출 시 ['tc','manual']로 지정
  var byId={}; (Array.isArray(rag_sources)?rag_sources:[]).forEach(function(x){ if(x&&x.source) byId[x.source]=x; });
  // 저장된 우선순위(priority) 오름차순으로 표시 순서 결정, 없으면 기본순(tc→manual→confluence)
  var list=order.map(function(src,i){ var st=byId[src]; return {source:src, enabled:st?!!st.enabled:(on.indexOf(src)>=0), priority:st?(st.priority!=null?st.priority:i):i}; });
  list.sort(function(a,b){ return a.priority-b.priority; });
  window._difyRagSrcState=list;
  return _difyRagSourceHtml();
}
function _difyRagSourceHtml(){
  var list=window._difyRagSrcState||[];
  var esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;');
  return '<div style="border:1px solid var(--border);border-radius:9px;overflow:hidden;">'
    +list.map(function(x,i){
      return '<div style="display:flex;align-items:center;gap:9px;padding:9px 11px;'+(i<list.length-1?'border-bottom:1px solid var(--border);':'')+'background:'+(x.enabled?'var(--bg2)':'var(--bg3)')+';">'
        +'<span style="font-size:11px;font-weight:800;color:var(--text3);width:16px;text-align:center;flex-shrink:0;">'+(i+1)+'</span>'
        +'<label style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;cursor:pointer;">'
          +'<input type="checkbox" '+(x.enabled?'checked':'')+' onchange="_difyRagSrcSet('+i+',this.checked)" style="width:15px;height:15px;accent-color:#0d9488;flex-shrink:0;">'
          +'<span style="min-width:0;"><span style="display:block;font-size:12.5px;font-weight:700;color:var(--text);">'+esc(_DIFY_RAG_SRC_LABEL[x.source]||x.source)+'</span><span style="display:block;font-size:10.5px;color:var(--text3);">'+esc(_DIFY_RAG_SRC_DESC[x.source]||'')+'</span></span>'
        +'</label>'
        +'<div style="display:flex;flex-direction:column;gap:1px;flex-shrink:0;">'
          +'<button type="button" onclick="_difyRagSrcMove('+i+',-1)" '+(i===0?'disabled':'')+' style="width:20px;height:16px;border:1px solid var(--border);border-radius:4px 4px 0 0;background:var(--bg2);color:var(--text2);cursor:'+(i===0?'default':'pointer')+';opacity:'+(i===0?'0.35':'1')+';font-size:10px;line-height:1;"><i class="ti ti-chevron-up"></i></button>'
          +'<button type="button" onclick="_difyRagSrcMove('+i+',1)" '+(i===list.length-1?'disabled':'')+' style="width:20px;height:16px;border:1px solid var(--border);border-top:none;border-radius:0 0 4px 4px;background:var(--bg2);color:var(--text2);cursor:'+(i===list.length-1?'default':'pointer')+';opacity:'+(i===list.length-1?'0.35':'1')+';font-size:10px;line-height:1;"><i class="ti ti-chevron-down"></i></button>'
        +'</div>'
      +'</div>';
    }).join('')
    +'</div><div style="font-size:10.5px;color:var(--text3);margin-top:5px;">체크한 소스만 검색되며, 위에 있을수록(①→) 먼저 검색되어 우선순위가 높습니다.</div>';
}
function _difyRagSrcToggle(){
  var el=document.getElementById('dify-f-ragsrc'); var on=(document.getElementById('dify-f-rag')||{}).checked;
  if(el) el.style.display=on?'block':'none';
  // RAG OFF 면 Confluence 카드도 숨김. ON 이면 현재 Confluence 활성 여부에 따라.
  var cc=document.getElementById('dify-f-confluence-card');
  if(cc){
    var confOn=false;
    try{ var st=(window._difyRagSrcState||[]).find(function(x){return x.source==='confluence';}); confOn=!!(st&&st.enabled); }catch(e){}
    cc.style.display=(on&&confOn)?'block':'none';
  }
}
function _difyRagSrcSet(i,checked){
  if(window._difyRagSrcState&&window._difyRagSrcState[i]) window._difyRagSrcState[i].enabled=checked;
  // Confluence 체크 시 우측 Confluence 카드 표시/숨김 동기화 (일반 어시스턴트 편집)
  try{
    var src=window._difyRagSrcState&&window._difyRagSrcState[i]&&window._difyRagSrcState[i].source;
    if(src==='confluence'){
      var box=document.getElementById('dify-f-confluence-card');
      if(box) box.style.display=checked?'block':'none';
    }
  }catch(e){}
}
// 소스 목록 컨테이너 — 어시스턴트 편집(dify-f-ragsrc)과 지식 검색 AI 설정(pgai-ragsrc-jira_ai) 양쪽에서 재사용되므로
// 실제로 DOM에 있는 쪽을 찾아 갱신
function _difyRagSrcWrap(){ return document.getElementById('dify-f-ragsrc')||document.getElementById('pgai-ragsrc-jira_ai'); }
function _difyRagSrcMove(i,dir){
  var list=window._difyRagSrcState; if(!list) return;
  var j=i+dir; if(j<0||j>=list.length) return;
  var tmp=list[i]; list[i]=list[j]; list[j]=tmp;
  var wrap=_difyRagSrcWrap(); if(wrap) wrap.innerHTML=_difyRagSourceHtml();
}
// 키 포함 상세를 받아 최신 a 반환 (관리 화면 전용)
async function _difyFull(id){
  let a=difyList.find(x=>x.id===id)||{id:id};
  try{
    const _r=await fetch('/api/dify/assistants/'+encodeURIComponent(id));
    const _full=await _r.json();
    if(_full&&_full.id){
      // detail 응답에 rag_sources 가 없으면(구 서버) 로컬 캐시 유지
      const _prev=a.rag_sources;
      a=Object.assign({},a,_full);
      if(!Array.isArray(_full.rag_sources) && Array.isArray(_prev)) a.rag_sources=_prev;
    }
  }catch(e){}
  return a;
}
// Chat LLM 탭의 왼쪽 목록에서 Dify 항목 클릭 시 (기존 동작 — llm-detail 우측에 폼)
async function selectDify(id){
  selLlmId='dify:'+id;
  window._llmMTab='dify:'+id;   // 상단 동적 탭 하이라이트 동기화
  if(!difyList.find(x=>x.id===id)){ return; }
  renderLLMTree();
  // Dify 전용 탭이 있으면 그쪽으로 콘텐츠 전환 (Chat LLM 목록과 공유되지 않도록)
  if(document.getElementById('llm-tab-dify')){ if(typeof llmModelTab==='function') llmModelTab('dify:'+id); return; }
  const a=await _difyFull(id);
  try{ await _difyPreloadConfluence(); }catch(e){}
  const t=document.getElementById('llm-detail-title'); if(t) t.textContent=a.name||'지식 어시스턴트';
  const d=document.getElementById('llm-detail'); if(d) d.innerHTML=_difyFormHtml(a);
}
// Dify 전용 탭(왼쪽 LLM 목록 없이 편집 폼만) 렌더
async function renderDifyTab(id){
  const box=document.getElementById('llm-tab-dify'); if(!box) return;
  box.innerHTML='<div style="padding:40px;text-align:center;color:var(--text3);"><span class="ring-spin" style="width:18px;height:18px;border-width:2px;"></span> 불러오는 중…</div>';
  const a=await _difyFull(id);
  try{ await _difyPreloadConfluence(); }catch(e){}
  box.innerHTML=_difyFormHtml(a);
}
// Confluence 카드 채울 데이터 사전 로드 (접속 정보 + 지식 소스 범위)
async function _difyPreloadConfluence(){
  try{ var cc=await (await fetch('/api/confluence/config')).json(); window._confluenceCfg=cc||{}; }catch(e){ window._confluenceCfg={}; }
  try{ var ks=await (await fetch('/api/knowledge-sources')).json(); window._ksrcScopes=(ks&&ks.confluence_scopes)||[]; }catch(e){ window._ksrcScopes=window._ksrcScopes||[]; }
}
// '+' 클릭 → 어시스턴트 종류 선택 시트 → _difyCreate(type)
function difyAddNew(){
  var old=document.getElementById('dify-add-sheet'); if(old){ old.remove(); return; }
  var ov=document.createElement('div'); ov.id='dify-add-sheet';
  ov.style.cssText='position:fixed;inset:0;z-index:12000;background:rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;';
  ov.onclick=function(e){ if(e.target===ov) ov.remove(); };
  ov.innerHTML='<div style="background:var(--bg2,#fff);border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.3);width:440px;max-width:94vw;padding:22px 24px;">'
    +'<div style="font-size:16px;font-weight:800;color:var(--text);margin-bottom:4px;">어시스턴트 추가</div>'
    +'<div style="font-size:12px;color:var(--text3);margin-bottom:18px;">만들 어시스턴트 종류를 선택하세요.</div>'
    +'<div style="display:flex;flex-direction:column;gap:10px;">'
      +'<button onclick="_difyCreate(\'llm\')" style="display:flex;align-items:center;gap:12px;text-align:left;width:100%;padding:14px 16px;border:1.5px solid #b6e5df;border-radius:12px;background:#f0faf8;cursor:pointer;">'
        +'<i class="ti ti-message-chatbot" style="font-size:24px;color:#0d9488;flex-shrink:0;"></i>'
        +'<span style="flex:1;"><span style="display:block;font-size:14px;font-weight:800;color:var(--text);">일반 어시스턴트</span><span style="display:block;font-size:11.5px;color:var(--text3);margin-top:2px;">LLM + 내가 쓴 시스템 프롬프트 (선택적으로 사내 지식검색 RAG)</span></span></button>'
      +'<button onclick="_difyCreate(\'dify\')" style="display:flex;align-items:center;gap:12px;text-align:left;width:100%;padding:14px 16px;border:1.5px solid #ddd0f7;border-radius:12px;background:#faf7ff;cursor:pointer;">'
        +'<i class="ti ti-sparkles" style="font-size:24px;color:#7c3aed;flex-shrink:0;"></i>'
        +'<span style="flex:1;"><span style="display:block;font-size:14px;font-weight:800;color:var(--text);">지식 어시스턴트 (Dify)</span><span style="display:block;font-size:11.5px;color:var(--text3);margin-top:2px;">외부 Dify ChatFlow 연동 (엔드포인트·API 키)</span></span></button>'
    +'</div>'
    +'<div style="text-align:right;margin-top:16px;"><button onclick="document.getElementById(\'dify-add-sheet\').remove()" style="font-size:12.5px;padding:7px 16px;border-radius:8px;border:1px solid var(--border);background:var(--bg2);color:var(--text2);cursor:pointer;">취소</button></div>'
    +'</div>';
  document.body.appendChild(ov);
}
// 실제 생성 (type: 'llm'|'dify')
async function _difyCreate(type){
  var sh=document.getElementById('dify-add-sheet'); if(sh) sh.remove();
  try{
    const r=await fetch('/api/dify/assistants',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:(type==='llm'?'새 일반 어시스턴트':'새 지식 어시스턴트'),type:type})});
    const d=await r.json();
    if(d&&d.ok){ await loadDifyAssistants(); selectDify(d.id); renderChatModelSelect(); }
    else if(typeof showToast==='function') showToast((d&&d.error)||'추가 실패');
  }catch(e){ if(typeof showToast==='function') showToast('추가 실패: '+e.message); }
}
async function difySave(id){
  const g=fid=>{ const e=document.getElementById(fid); return e?(e.value||'').trim():''; };
  const gv=fid=>{ const e=document.getElementById(fid); return e?e.value:''; };
  const name=g('dify-f-name');
  if(!name){ if(typeof showToast==='function')showToast('이름을 입력하세요'); return; }
  const type=g('dify-f-type')||'dify';
  const kbGroup=gv('dify-f-kbgroup');   // '' | general | kb | jira | external
  const body={name:name, type:type, kb_group:kbGroup, public:(kbGroup!==''), greeting:gv('dify-f-greeting'), placeholder:gv('dify-f-placeholder')};
  if(type==='llm'){
    body.llm_id=gv('dify-f-llmid'); body.prompt=gv('dify-f-prompt'); body.rag=!!(document.getElementById('dify-f-rag')||{}).checked;
    body.rag_sources=(window._difyRagSrcState||[]).map(function(x,i){ return {source:x.source, enabled:!!x.enabled, priority:i}; });
    try{ console.log('[difySave] rag=',body.rag,'rag_sources=',JSON.stringify(body.rag_sources)); }catch(_){}
  } else {
    body.endpoint=g('dify-f-endpoint'); body.file_var=g('dify-f-filevar');
    const key=g('dify-f-key'); if(key) body.key=key;   // 비우면 기존 키 유지
  }
  try{
    const r=await fetch('/api/dify/assistants/'+encodeURIComponent(id),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const d=await r.json();
    if(d&&d.ok){
      if(typeof showToast==='function')showToast('저장됨');
      // Confluence 카드가 렌더되어 있고 편집 내용 있으면 함께 저장 (일반 어시스턴트 + Confluence 소스 활성 시)
      try{
        var _cfBox=document.getElementById('dify-f-confluence-card');
        if(_cfBox && _cfBox.style.display!=='none' && typeof _confSaveAll==='function'){
          await _confSaveAll(false);
        }
      }catch(_ce){}
      // 방금 저장한 값을 로컬 difyList 에 오버라이드 (서버 GET 응답에서 rag_sources 누락되어도 유지되도록)
      try{
        await loadDifyAssistants();
        var _local=difyList.find(function(x){return x.id===id;});
        if(_local){
          if(typeof body.prompt==='string') _local.prompt=body.prompt;
          if(typeof body.rag==='boolean') _local.rag=body.rag;
          if(Array.isArray(body.rag_sources)) _local.rag_sources=body.rag_sources;
        }
      }catch(_e){}
      selectDify(id); renderChatModelSelect();
    }
    else if(typeof showToast==='function') showToast((d&&d.error)||'저장 실패');
  }catch(e){ if(typeof showToast==='function') showToast('저장 실패: '+e.message); }
}
function difyDelete(id){
  const a=difyList.find(x=>x.id===id);
  const doDel=async ()=>{
    try{
      const r=await fetch('/api/dify/assistants/'+encodeURIComponent(id),{method:'DELETE'});
      const d=await r.json();
      if(d&&d.ok){ if(typeof showToast==='function')showToast('삭제됨'); selLlmId=null; await loadDifyAssistants(); renderLLMTree(); const dt=document.getElementById('llm-detail'); if(dt)dt.innerHTML='<div class="detail-empty"><i class="ti ti-brain"></i><span>LLM을 선택하세요</span></div>'; renderChatModelSelect(); if(typeof llmModelTab==='function' && String(window._llmMTab||'').indexOf('dify:')===0) llmModelTab('chat'); }
      else if(typeof showToast==='function') showToast((d&&d.error)||'삭제 실패');
    }catch(e){ if(typeof showToast==='function') showToast('삭제 실패: '+e.message); }
  };
  // uiConfirm 은 콜백(onConfirm) 패턴 — 반환값 없음(과거 await 버그 수정)
  if(typeof uiConfirm==='function'){ uiConfirm({title:'어시스턴트 삭제', icon:'ti-trash', danger:true, confirmText:'삭제', msg:'"'+((a&&a.name)||id)+'" 어시스턴트를 삭제할까요?', onConfirm:doDel}); }
  else if(confirm('삭제할까요?')) doDel();
}
function difyToggleKey(btn){
  const inp=document.getElementById('dify-f-key'); if(!inp)return;
  const ic=btn.querySelector('i');
  if(inp.type==='password'){ inp.type='text'; if(ic)ic.className='ti ti-eye-off'; }
  else { inp.type='password'; if(ic)ic.className='ti ti-eye'; }
}

const _FP_DEFAULTS={
  overview:'아래 정보를 바탕으로 개요를 3~5문장으로 작성하세요. 무엇을(기능/성능)·어떤 장비 등급(L2/L3/OLT)에서·어떤 조건으로 요구/검증하는지 한 문단으로, 시험으로 검증 가능하게 기술하세요. 모호한 표현 금지, 한국어 평문, 기술 용어는 영문 약어(VLAN, LACP, SNMP 등) 사용.',
  scenarios:'아래 요구사항을 검증할 시험 시나리오를 단계적으로 작성하세요. 각 항목은 [선행조건 → 수행 절차 → 기대 결과(판정 기준)] 형식으로, 장비 등급(L2/L3/OLT)과 인터페이스·프로토콜을 구체적으로 명시하세요. 한국어, 영문 약어 사용.',
  precondition:'아래 TC의 시험 목적과 사전조건을 작성하세요. 목적은 무엇을 검증하는지 한 문장으로, 사전조건은 시험 전 갖춰야 할 장비 상태·구성·연결을 항목별로 기술하세요. 한국어, 영문 약어 사용.',
  steps:'아래 TC의 시험 절차를 단계별로 작성하세요. 각 단계는 [수행 동작 / 입력 CLI / 기대 결과(판정 기준)]를 포함하고, 판정 가능한 기준을 명시하세요. 한국어, CLI 명령은 그대로, 영문 약어 사용.'
};
function llmToggleFields(which,on){ const e=document.getElementById('llm-'+which+'-fields'); if(e) e.style.display=on?'block':'none'; }
let _llmDragId=null;
function llmDragStart(e,id){ _llmDragId=id; try{ e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain',id); }catch(_){} }
function llmDragOver(e){ e.preventDefault(); try{ e.dataTransfer.dropEffect='move'; }catch(_){}
  document.querySelectorAll('#llm-tree > div').forEach(d=>d.style.boxShadow='');
  if(e.currentTarget) e.currentTarget.style.boxShadow='inset 0 2px 0 var(--blue)';
}
function llmDragEnd(){ document.querySelectorAll('#llm-tree > div').forEach(d=>d.style.boxShadow=''); _llmDragId=null; }
async function llmDrop(e,targetId){
  e.preventDefault();
  document.querySelectorAll('#llm-tree > div').forEach(d=>d.style.boxShadow='');
  const dragId=_llmDragId; _llmDragId=null;
  if(!dragId||dragId===targetId) return;
  const from=llmList.findIndex(x=>x.id===dragId), to=llmList.findIndex(x=>x.id===targetId);
  if(from<0||to<0) return;
  const it=llmList.splice(from,1)[0]; llmList.splice(to,0,it);
  renderLLMTree();
  if(typeof saveLLMs==='function') saveLLMs();
  try{ await fetch('/api/llms/reorder',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:llmList.map(x=>x.id)})}); }catch(err){}
}
function selectLLM(id){
  selLlmId=id;
  try{ localStorage.setItem('utop_llm_sel', id); localStorage.setItem('utop_llm_tab','chat'); }catch(e){}   // 새로고침 복원용
  const l=llmList.find(x=>x.id===id);
  if(!l) return;
  renderLLMTree();
  const typeColor=l.type==='claude'?'#d97706':'#2d6fd4';
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;');
  const sysP=String(l.system_prompt||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const inSt='width:100%;font-size:13.5px;padding:8px 11px;border:1px solid var(--border);border-radius:7px;outline:none;box-sizing:border-box;';
  const inp=(fid,val,ph,extra)=>'<input id="'+fid+'" value="'+esc(val)+'" placeholder="'+(ph||'')+'" '+(extra||'')+' style="'+inSt+'">';
  const frow=(label,inner)=>'<div><div style="font-size:12px;color:var(--text3);font-weight:600;margin-bottom:4px;">'+label+'</div>'+inner+'</div>';
  const cardSec=(title,icon,inner,grow)=>'<div style="border:1px solid var(--border);border-radius:10px;padding:13px 15px;background:#fff;'+(grow?'flex:1;display:flex;flex-direction:column;min-height:0;':'')+'"><div style="font-size:13px;font-weight:700;color:var(--text2);margin-bottom:9px;display:flex;align-items:center;gap:6px;flex-shrink:0;"><i class="ti '+icon+'" style="color:var(--blue);font-size:15px;"></i>'+title+'</div>'+inner+'</div>';
  const selSt='font-size:12px;padding:6px 9px;border:1px solid var(--border);border-radius:7px;outline:none;background:#fff;cursor:pointer;';
  const typeSel='<select id="llm-f-type" style="'+selSt+'">'+[['local','로컬 LLM (vLLM)'],['claude','Claude API']].map(t=>'<option value="'+t[0]+'"'+(l.type===t[0]?' selected':'')+'>'+t[1]+'</option>').join('')+'</select>';
  const statusSel='<select id="llm-f-status" style="'+selSt+'">'+[['active','● 활성'],['inactive','● 비활성']].map(s=>'<option value="'+s[0]+'"'+((l.status||'inactive')===s[0]?' selected':'')+'>'+s[1]+'</option>').join('')+'</select>';
  const useChk=(u,lab)=>{ const tog=(u==='req'||u==='tc')?(' onchange="llmToggleFields(\''+u+'\',this.checked)"'):''; return '<label style="display:inline-flex;align-items:center;gap:5px;font-size:12.5px;cursor:pointer;margin-right:14px;"><input type="checkbox" id="llm-use-'+u+'"'+((l.uses||[]).includes(u)?' checked':'')+tog+'> '+lab+'</label>'; };
  const _fpEx=['우선순위','상태','고객사','심각도','발생구분','타입','구분','priority','status','severity'];
  const _cf=t=>((typeof customFields!=='undefined'&&customFields[t])||[]).filter(f=>_fpEx.indexOf((f.label||f.name||'').trim())<0).map(f=>({k:'cf_'+f.id,l:f.label||f.name||f.id}));
  const reqFields=[{k:'overview',l:'개요'},{k:'scenarios',l:'요구사항 설명/시나리오'}].concat(_cf('req'));
  const tcFields=[{k:'overview',l:'개요'},{k:'precondition',l:'목적·사전조건'},{k:'steps',l:'시험 절차/판정'}].concat(_cf('tc'));
  const _fp=l.field_prompts||{}; const _fpr=_fp.req||{}; const _fpt=_fp.tc||{};
  const fpCard=(which,fields,vals,color,title,shown)=>'<div id="llm-'+which+'-fields" style="display:'+(shown?'block':'none')+';flex:1;border:1px solid var(--border);border-radius:10px;padding:13px 15px;background:#fff;">'
    +'<div style="font-size:13px;font-weight:700;color:'+color+';margin-bottom:4px;display:flex;align-items:center;gap:6px;"><i class="ti ti-list-details" style="font-size:15px;"></i>'+title+'</div>'
    +'<div style="font-size:11px;color:var(--text3);margin-bottom:9px;">각 필드 작성 시 LLM에 줄 지시문 (비우면 미사용)</div>'
    +fields.map(f=>'<div style="margin-bottom:10px;"><div style="font-size:12px;color:var(--text2);font-weight:600;margin-bottom:4px;">'+f.l+'</div><textarea id="llm-fp-'+which+'-'+f.k+'" placeholder="예: 위 정보를 바탕으로 '+f.l+'를 2~3문장으로 작성" style="width:100%;min-height:118px;font-size:13px;line-height:1.5;padding:8px 10px;border:1px solid var(--border);border-radius:6px;outline:none;box-sizing:border-box;resize:vertical;font-family:inherit;color:var(--text);background:#fff;">'+String(vals[f.k]||_FP_DEFAULTS[f.k]||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</textarea></div>').join('')
  +'</div>';
  document.getElementById('llm-detail-title').textContent=l.name;
  document.getElementById('llm-detail').innerHTML=
    '<div style="padding:0;">'
    +'<div style="display:flex;align-items:center;gap:14px;padding:16px 20px;border-bottom:1px solid var(--border);background:linear-gradient(135deg,'+typeColor+'12,transparent);">'
      +'<div style="width:46px;height:46px;border-radius:12px;background:'+typeColor+'1f;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="ti ti-brain" style="font-size:25px;color:'+typeColor+';"></i></div>'
      +'<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:7px;">'
        +'<input id="llm-f-name" value="'+esc(l.name)+'" placeholder="LLM 이름" style="font-size:17px;font-weight:800;border:1px solid var(--border);border-radius:7px;padding:5px 9px;outline:none;background:#fff;">'
        +'<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">'+typeSel+statusSel+'</div>'
      +'</div>'
    +'</div>'
    +'<div style="padding:16px 20px;">'
      +'<div style="display:grid;grid-template-columns:300px 320px 320px;gap:14px;align-items:start;justify-content:start;">'
        +'<div style="display:flex;flex-direction:column;gap:12px;">'
          +cardSec('연결 정보','ti-plug','<div style="display:flex;flex-direction:column;gap:9px;">'+frow('엔드포인트',inp('llm-f-endpoint',l.endpoint,'http://host:8000/v1'))+frow('모델명',inp('llm-f-model',l.model,'모델 ID'))+frow('API Key',inp('llm-f-apikey',l.apikey,'(없으면 비움)','type="password"'))+'</div>')
          +cardSec('지식 검색 노출','ti-search','<div>'+frow('노출 그룹','<select id="llm-f-kbgroup" style="'+selSt+'width:100%;">'+(function(){ var g=l.kb_group||''; var opts=[['','노출 안 함'],['general','일반 검색'],['kb','UTOP 내부 검색'],['jira','로컬 지식 툴'],['external','외부 지식 툴']]; return opts.map(function(o){ return '<option value="'+o[0]+'"'+(g===o[0]?' selected':'')+'>'+o[1]+'</option>'; }).join(''); })()+'</select>','지식 검색 페이지에서 이 LLM을 어느 그룹 드롭다운에 노출할지. "노출 안 함"이면 숨김(Tests/Cycle/Reports는 기본 숨김).')+'</div>')
          +'<div style="display:flex;flex-direction:column;gap:8px;">'
            +'<button onclick="llmSaveInline(\''+l.id+'\')" style="width:100%;font-size:12.5px;padding:9px 0;border-radius:8px;border:none;background:#00a872;color:#fff;cursor:pointer;font-weight:700;text-align:center;"><i class="ti ti-device-floppy"></i> 저장</button>'
            +'<button onclick="testLLM(\''+l.id+'\')" style="width:100%;font-size:12.5px;padding:9px 0;border-radius:8px;border:1px solid var(--blue);background:#fff;color:var(--blue);cursor:pointer;font-weight:600;text-align:center;"><i class="ti ti-plug"></i> 연결 테스트</button>'
            +'<button onclick="copyLLM(\''+l.id+'\')" style="width:100%;font-size:12.5px;padding:9px 0;border-radius:8px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;font-weight:600;text-align:center;"><i class="ti ti-copy"></i> 복사</button>'
            +'<button onclick="deleteLLM(\''+l.id+'\')" style="width:100%;font-size:12.5px;padding:9px 0;border-radius:8px;border:1px solid rgba(229,62,90,0.4);background:rgba(229,62,90,0.06);color:var(--red);cursor:pointer;font-weight:600;text-align:center;"><i class="ti ti-trash"></i> 삭제</button>'
          +'</div>'
        +'</div>'
        +'<div style="display:flex;flex-direction:column;gap:12px;">'
          +cardSec('파라미터','ti-adjustments-horizontal','<div style="display:flex;flex-direction:column;gap:9px;">'
            +frow('Completion Mode','<select id="llm-f-completion-mode" style="'+selSt+'width:100%;">'+[['chat','Chat'],['completion','Completion']].map(o=>'<option value="'+o[0]+'"'+((l.completion_mode||'chat')===o[0]?' selected':'')+'>'+o[1]+'</option>').join('')+'</select>')
            +frow('Max Tokens',inp('llm-f-tokens',l.max_tokens||4096,'','type="number"'))
            +frow('Context Size',inp('llm-f-context',l.context_size||262144,'','type="number"'))
            +frow('Temperature',inp('llm-f-temp',(l.temperature!=null?l.temperature:0.7),'','type="number" step="0.1" min="0" max="2"'))
            +frow('Top P',inp('llm-f-top-p',(l.top_p!=null?l.top_p:''),'0.0 ~ 1.0 (비우면 기본값)','type="number" step="0.01" min="0" max="1"'))
            +frow('Top K',inp('llm-f-top-k',(l.top_k!=null?l.top_k:''),'예: 50 (비우면 기본값)','type="number" min="0"'))
            +frow('Presence Penalty',inp('llm-f-presence-penalty',(l.presence_penalty!=null?l.presence_penalty:''),'-2.0 ~ 2.0','type="number" step="0.1" min="-2" max="2"'))
            +frow('Frequency Penalty',inp('llm-f-frequency-penalty',(l.frequency_penalty!=null?l.frequency_penalty:''),'-2.0 ~ 2.0','type="number" step="0.1" min="-2" max="2"'))
          +'</div>',true)
        +'</div>'
        +'<div style="display:flex;flex-direction:column;gap:12px;">'
          +cardSec('고급 옵션','ti-settings-2','<div style="display:flex;flex-direction:column;gap:9px;">'
            +frow('Compatibility Mode','<select id="llm-f-compat" style="'+selSt+'width:100%;">'+[['openai','OpenAI compatible'],['vllm','vLLM'],['azure','Azure OpenAI'],['anthropic','Anthropic'],['none','None']].map(o=>'<option value="'+o[0]+'"'+((l.compat_mode||'openai')===o[0]?' selected':'')+'>'+o[1]+'</option>').join('')+'</select>')
            +frow('Thinking Mode','<select id="llm-f-thinking" style="'+selSt+'width:100%;">'+[['none','Only Non-Thinking Mode'],['both','Both'],['thinking','Only Thinking Mode']].map(o=>'<option value="'+o[0]+'"'+((l.thinking_mode||'none')===o[0]?' selected':'')+'>'+o[1]+'</option>').join('')+'</select>')
            +frow('Function Call','<select id="llm-f-function-call" style="'+selSt+'width:100%;">'+[['not_support','Not Support'],['tool_call','Tool Call'],['function_call','Function Call'],['no_call','No Parameter']].map(o=>'<option value="'+o[0]+'"'+((l.function_call_type||'not_support')===o[0]?' selected':'')+'>'+o[1]+'</option>').join('')+'</select>')
            +frow('Stream Function Call','<select id="llm-f-stream-func" style="'+selSt+'width:100%;">'+[['not_support','Not Support'],['support','Support']].map(o=>'<option value="'+o[0]+'"'+((l.stream_function_call||'not_support')===o[0]?' selected':'')+'>'+o[1]+'</option>').join('')+'</select>')
            +frow('Vision Support','<select id="llm-f-vision" style="'+selSt+'width:100%;">'+[['not_support','Not Support'],['support','Support']].map(o=>'<option value="'+o[0]+'"'+((l.vision_support||'not_support')===o[0]?' selected':'')+'>'+o[1]+'</option>').join('')+'</select>')
            +frow('Structured Output','<select id="llm-f-structured-output" style="'+selSt+'width:100%;">'+[['not_support','Not Support'],['support','Support']].map(o=>'<option value="'+o[0]+'"'+((l.structured_output||'not_support')===o[0]?' selected':'')+'>'+o[1]+'</option>').join('')+'</select>')
            +frow('Stream Mode Auth','<select id="llm-f-stream-auth" style="'+selSt+'width:100%;">'+[['not_use','Not Use'],['bearer','Bearer Token'],['basic','Basic Auth']].map(o=>'<option value="'+o[0]+'"'+((l.stream_mode_auth||'not_use')===o[0]?' selected':'')+'>'+o[1]+'</option>').join('')+'</select>')
            +frow('Stream Delimiter',inp('llm-f-stream-delimiter',l.stream_delimiter||'\\n\\n','예: \\n\\n'))
          +'</div>',true)
        +'</div>'
      +'</div>'
      +'<div id="llm-test-result" style="margin-top:14px;"></div>'
    +'</div>'
    +'</div>';
}
async function llmSaveInline(id){
  const gv=k=>{ const e=document.getElementById(k); return e?e.value:''; };
  const _prev=(typeof llmList!=='undefined'?llmList.find(x=>x.id===id):null)||{};
  // '용도' · '시스템 프롬프트(공통)' 섹션은 화면에서 제거됨 → 화면에 없으면 기존 저장값 보존
  const _useEls=['chat','req','tc'].map(u=>document.getElementById('llm-use-'+u)).filter(Boolean);
  const uses=_useEls.length ? _useEls.filter(e=>e.checked).map(e=>e.id.slice('llm-use-'.length)) : (_prev.uses||[]);
  let fp;
  if(document.querySelector('[id^="llm-fp-req-"],[id^="llm-fp-tc-"]')){
    fp={req:{},tc:{}};
    document.querySelectorAll('[id^="llm-fp-req-"]').forEach(e=>{ const k=e.id.slice('llm-fp-req-'.length); if((e.value||'').trim()) fp.req[k]=e.value; });
    document.querySelectorAll('[id^="llm-fp-tc-"]').forEach(e=>{ const k=e.id.slice('llm-fp-tc-'.length); if((e.value||'').trim()) fp.tc[k]=e.value; });
  } else { fp=_prev.field_prompts||{req:{},tc:{}}; }
  const _sysEl=document.getElementById('llm-f-sysprompt');
  const sysPromptVal=_sysEl?_sysEl.value:(_prev.system_prompt||'');
  // 'AI 채팅 화면'(오프닝/안내문) 카드는 페이지 AI 탭으로 이동됨 → 화면에 없으면 기존값 보존
  const _grEl=document.getElementById('llm-f-greeting'); const greetingVal=_grEl?_grEl.value:(_prev.greeting||'');
  const _phEl=document.getElementById('llm-f-placeholder'); const placeholderVal=_phEl?_phEl.value:(_prev.placeholder||'');
  const _pf=k=>{ const v=gv(k); return v===''?null:parseFloat(v); };
  const _kbEl=document.getElementById('llm-f-kbgroup'); const kbGroupVal=_kbEl?_kbEl.value:(_prev.kb_group||'');
  const body={ type:gv('llm-f-type'), name:gv('llm-f-name').trim(), endpoint:gv('llm-f-endpoint').trim(), model:gv('llm-f-model').trim(), apikey:gv('llm-f-apikey'), kb_group:kbGroupVal,
    max_tokens:parseInt(gv('llm-f-tokens'))||4096, context_size:parseInt(gv('llm-f-context'))||262144,
    temperature:parseFloat(gv('llm-f-temp'))||0.7,
    top_p:_pf('llm-f-top-p'), top_k:(gv('llm-f-top-k')===''?null:parseInt(gv('llm-f-top-k'))),
    presence_penalty:_pf('llm-f-presence-penalty'), frequency_penalty:_pf('llm-f-frequency-penalty'),
    completion_mode:gv('llm-f-completion-mode')||'chat',
    compat_mode:gv('llm-f-compat')||'openai',
    thinking_mode:gv('llm-f-thinking')||'none',
    function_call_type:gv('llm-f-function-call')||'not_support',
    stream_function_call:gv('llm-f-stream-func')||'not_support',
    vision_support:gv('llm-f-vision')||'not_support',
    structured_output:gv('llm-f-structured-output')||'not_support',
    stream_mode_auth:gv('llm-f-stream-auth')||'not_use',
    stream_delimiter:gv('llm-f-stream-delimiter')||'\\n\\n',
    system_prompt:sysPromptVal, greeting:greetingVal, placeholder:placeholderVal, uses, status:gv('llm-f-status'), field_prompts:fp };
  if(!body.name){ showToast('이름을 입력하세요'); return; }
  try{
    await fetch('/api/llms/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    await loadLLMsFromServer(); renderLLMTree(); renderChatModelSelect(); selectLLM(id);
    showToast('저장되었습니다');
  }catch(e){ showToast('저장 오류: '+e.message); }
}

async function testLLM(id){
  const l=llmList.find(x=>x.id===id);
  if(!l) return;
  const resultEl=document.getElementById('llm-test-result');
  if(resultEl) resultEl.innerHTML='<div style="margin-top:10px;font-size:13px;color:var(--text2);"><i class="ti ti-loader"></i> 연결 테스트 중... (백엔드 경유)</div>';
  try{
    let reply='';
    if(l.type==='claude'){
      const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'hi',history:[]})});
      reply=((await r.json()).reply)||'';
    } else {
      const r=await fetch('/api/chat/local',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:l.endpoint,model:l.model,apikey:l.apikey||'',messages:[{role:'user',content:'hi'}],max_tokens:10,context_size:l.context_size||4096,temperature:(l.temperature!=null?l.temperature:0.7)})});
      reply=((await r.json()).reply)||'';
    }
    const isErr=!reply || reply.trim().startsWith('[') || reply.includes('오류]') || reply.includes('API 키가 설정되지');
    if(!isErr){
      if(resultEl) resultEl.innerHTML='<div style="margin-top:10px;font-size:13px;color:var(--green);font-weight:600;"><i class="ti ti-circle-check"></i> 연결 성공! <span style="color:var(--text3);font-weight:400;">응답: '+String(reply).slice(0,60).replace(/</g,'&lt;')+'</span></div>';
      l.status='active'; renderLLMTree();
    } else {
      if(resultEl) resultEl.innerHTML='<div style="margin-top:10px;font-size:13px;color:var(--red);line-height:1.5;"><i class="ti ti-circle-x"></i> 연결 실패<div style="margin-top:4px;font-size:11.5px;color:var(--text2);white-space:pre-wrap;background:#fff4f4;border:1px solid rgba(229,62,90,0.25);border-radius:6px;padding:7px 9px;">'+String(reply||'응답 없음').slice(0,300).replace(/</g,'&lt;')+'</div></div>';
    }
  } catch(e){
    if(resultEl) resultEl.innerHTML='<div style="margin-top:10px;font-size:13px;color:var(--red);"><i class="ti ti-circle-x"></i> 연결 실패: '+e.message+'</div>';
  }
}

function llmTypeChange(){
  const type=document.getElementById('la-type').value;
  if(type==='claude'){
    document.getElementById('la-endpoint').value='https://api.anthropic.com';
    document.getElementById('la-model').value='claude-sonnet-4-6';
    document.getElementById('la-name').value='Claude Sonnet';
  } else {
    document.getElementById('la-endpoint').value='http://192.168.x.x:8000/v1';
    document.getElementById('la-model').value='';
    document.getElementById('la-name').value='';
  }
}

async function submitLLM(){
  const uses=[];
  if(document.getElementById('la-use-chat').checked) uses.push('chat');
  if(document.getElementById('la-use-req').checked) uses.push('req');
  if(document.getElementById('la-use-tc').checked) uses.push('tc');
  const body={
    type:document.getElementById('la-type').value,
    name:document.getElementById('la-name').value,
    endpoint:document.getElementById('la-endpoint').value,
    model:document.getElementById('la-model').value,
    apikey:document.getElementById('la-apikey').value,
    max_tokens:parseInt(document.getElementById('la-tokens').value)||4096,
    context_size:parseInt(document.getElementById('la-context').value)||262144,
    temperature:parseFloat(document.getElementById('la-temp').value)||0.7,
    system_prompt:document.getElementById('la-sysprompt').value,
    uses, status:document.getElementById('la-status').value
  };
  const editId=document.getElementById('la-edit-id')?.value;
  if(editId){
    await fetch('/api/llms/'+editId,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  } else {
    await fetch('/api/llms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  }
  closeModal('modal-llm-add');
  await loadLLMsFromServer();
  renderLLMTree();
  renderChatModelSelect();
}

async function copyLLM(id){
  const l=llmList.find(x=>x.id===id); if(!l) return;
  const body={ type:l.type, name:(l.name||'LLM')+' (복사)', endpoint:l.endpoint||'', model:l.model||'', apikey:l.apikey||'', max_tokens:l.max_tokens||4096, context_size:l.context_size||262144, temperature:(l.temperature!=null?l.temperature:0.7), system_prompt:l.system_prompt||'', uses:(l.uses||[]).slice(), status:l.status||'inactive', field_prompts:l.field_prompts||{} };
  try{
    await fetch('/api/llms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    await loadLLMsFromServer(); renderLLMTree(); renderChatModelSelect();
    showToast('LLM "'+body.name+'" 복사 완료');
  }catch(e){ showToast('복사 오류: '+e.message); }
}

async function deleteLLM(id){
  if(!confirm('LLM을 삭제하시겠습니까?')) return;
  await fetch('/api/llms/'+id,{method:'DELETE'});
  await loadLLMsFromServer();
  selLlmId=null;
  document.getElementById('llm-detail').innerHTML='<div class="detail-empty"><i class="ti ti-brain"></i><span>LLM을 선택하세요</span></div>';
  renderLLMTree();
  renderChatModelSelect();
}

// AI 채팅 모델 선택 렌더링
// 지식 어시스턴트(Dify) 목록 — 빠른 선택 박스 + 모델 select 옵션 공통 소스
// Dify 지식 어시스턴트는 LLM 설정에서 관리 — 서버에서 로드(키는 서버 보관, 프론트엔 안 옴). 하드코딩 없음.
let difyList=[];
async function loadDifyAssistants(){
  try{ const r=await fetch('/api/dify/assistants'); const d=await r.json(); difyList=(d&&d.assistants)||[]; }
  catch(e){ difyList=[]; }
}
function _difyModels(){ return difyList.filter(a=>a.public!==false); }  // 공개(public)만 AI 채팅에 노출
function renderChatModelSelect(){
  const sel=document.getElementById('chat-model-select');
  if(!sel) return;
  const prev=sel.value; // 기존 선택 보존
  const chatLLMs=llmList.filter(l=>l.uses&&l.uses.includes('chat')&&l.status==='active');
  let html=chatLLMs.map(l=>`<option value="${l.id}">${l.name}</option>`).join('');
  // Dify ChatFlow 지식 어시스턴트 (백엔드가 키 보관)
  const _dm=_difyModels();
  if(_dm.length) html+='<optgroup label="지식 어시스턴트 (Dify)">'
    +_dm.map(m=>'<option value="dify:'+m.id+'">'+m.name+'</option>').join('')
    +'</optgroup>';
  sel.innerHTML=html;
  // 기본 모델: 검증 지식 Assistant 우선 (없으면 이름에 '검증' 포함 어시스턴트 → 첫 옵션)
  const has=v=>[...sel.options].some(o=>o.value===v);
  let defVal='';
  if(has('dify:specs')) defVal='dify:specs';
  else { const d=_dm.find(m=>/검증/.test(m.name||'')); if(d&&has('dify:'+d.id)) defVal='dify:'+d.id; }
  if(!defVal && sel.options[0]) defVal=sel.options[0].value;
  sel.value=(prev&&has(prev))?prev:defVal;
  try{ chatRenderDifyModels(); }catch(e){}
}
// "채팅 기록" 위 빠른 선택 박스 — 클릭 시 그 모델로 바로 새 대화
function chatRenderDifyModels(){
  const el=document.getElementById('chat-dify-models'); if(!el) return;
  const cur=document.getElementById('chat-model-select')?.value||'';
  el.innerHTML=_difyModels().map(m=>{ const val='dify:'+m.id; const on=cur===val;
    return '<div onclick="chatStartDify(\''+m.id+'\')" style="display:flex;align-items:center;gap:7px;padding:7px 9px;border-radius:7px;cursor:pointer;font-size:14px;margin-bottom:3px;border:1px solid '+(on?'var(--blue)':'var(--border)')+';background:'+(on?'rgba(45,111,212,0.12)':'var(--bg3)')+';color:'+(on?'var(--blue)':'var(--text2)')+';font-weight:'+(on?'700':'500')+';">'
      +'<i class="ti '+(m.icon||'ti-sparkles')+'" style="font-size:17px;flex-shrink:0;"></i>'
      +'<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+m.name+'</span>'
      +(on?'<i class="ti ti-check" style="font-size:16px;flex-shrink:0;"></i>':'')
      +'</div>';
  }).join('');
}
function chatStartDify(asst){
  const sel=document.getElementById('chat-model-select'); const val='dify:'+asst;
  if(sel && [...sel.options].some(o=>o.value===val)) sel.value=val;
  const cur=(typeof chatCur==='function')?chatCur():null;
  if(cur && (!cur.messages || !cur.messages.length)){
    // 비어있는(아직 질문 안 한) 대화면 새로 만들지 않고 모델만 변경
    cur.llmId=val; chatSaveSessions(); chatRenderSidebar();
  } else {
    // 이미 질문한 대화에서 누르면 그때만 새 채팅 생성 후 그 모델로
    chatNewSession();
    const ns=(typeof chatCur==='function')?chatCur():null; if(ns){ ns.llmId=val; chatSaveSessions(); }
  }
  try{ chatRenderDifyModels(); }catch(e){}
  try{ chatRenderMessages(); }catch(e){}
  document.getElementById('chat-input')?.focus();
}
function chatModelChanged(){
  const s=(typeof chatCur==='function')?chatCur():null; const v=document.getElementById('chat-model-select')?.value;
  if(s&&v){ s.llmId=v; chatSaveSessions(); }
  try{ chatRenderDifyModels(); }catch(e){}
  try{ chatRenderMessages(); }catch(e){}
}

// ── 계측기 관리 ──
let selMeterId=null;

function renderMeterTree(){
  const meters=devices.filter(d=>{
    const g=(d.group||'');
    const gu=g.toUpperCase();
    return g==='계측기'||gu==='METER'||gu==='INSTRUMENT';
  });
  if(!meters.length){
    document.getElementById('meter-tree').innerHTML='<div class="detail-empty" style="margin-top:40px;"><i class="ti ti-device-analytics"></i><span style="font-size:12px;">계측기 없음</span></div>';
    return;
  }
  const iconMap={'IXIA N2X':'ti-wave-sine','IXIA IXNETWORKS':'ti-network','SPIRENT TEST CENTER':'ti-activity','SPIRENT STC':'ti-activity'};
  document.getElementById('meter-tree').innerHTML=meters.map(d=>{
    const sc=d.status==='connected'?'g':d.status==='disconnected'?'r':'u';
    const icon=iconMap[(d.model||'').toUpperCase().replace(/\s+/g,' ')]||'ti-device-analytics';
    return `<div class="tree-child${d.id===selMeterId?' sel':''}" onclick="selectMeter('${d.id}')">
      <div class="cdot ${sc}"></div>${d.model}
    </div>`;
  }).join('');
}

function selectMeter(id){
  selMeterId=id;
  const d=devices.find(x=>x.id===id);
  if(!d) return;
  renderMeterTree();
  const isConn=d.status==='connected';
  const sc=isConn?'on':d.status==='disconnected'?'off':'uk';
  const sl=isConn?'● 연결됨':d.status==='disconnected'?'● 미연결':'● 미확인';
  const connBtn=isConn
    ?`<button class="btn primary" onclick="alert('터미널 준비 중')"><i class="ti ti-terminal"></i> 터미널</button>`
    :`<button class="btn primary" onclick="connectDevice('${d.id}')"><i class="ti ti-plug"></i> 연결 시도</button>`;
  document.getElementById('meter-detail-title').textContent=d.model+' 상세';
  document.getElementById('meter-detail').innerHTML=`
    <div style="padding:4px;">
      <div class="dc">
        <div class="dt"><i class="ti ti-device-analytics" style="color:var(--blue)"></i>${d.model}</div>
        <div class="dr"><span class="dk">IP 주소</span><span class="dv">${d.ip}</span></div>
        <div class="dr"><span class="dk">프로토콜</span><span class="dv">${d.protocol} : ${d.port}</span></div>
        <div class="dr"><span class="dk">설명</span><span class="dv">${d.description||'-'}</span></div>
        <div class="dr"><span class="dk">연결 상태</span><span class="dv"><span class="sbadge ${sc}">${sl}</span></span></div>
      </div>
      <div class="btn-row">
        ${connBtn}
        <button class="btn warn" onclick="openEditDevice('${d.id}')"><i class="ti ti-edit"></i> 수정</button>
        <button class="btn danger" onclick="deleteMeter('${d.id}')"><i class="ti ti-trash"></i> 삭제</button>
      </div>
    </div>`;
}

async function deleteMeter(id){
  if(!confirm('계측기를 삭제하시겠습니까?')) return;
  await fetch('/api/devices/'+id,{method:'DELETE'});
  selMeterId=null;
  document.getElementById('meter-detail').innerHTML='<div class="detail-empty"><i class="ti ti-device-analytics"></i><span>계측기를 선택하세요</span></div>';
  await loadDevices();
  renderMeterTree();
}

// ── 계측기 모달 ──
function meterModelChange(){
  const model=document.getElementById('ma-model').value;
  const protoMap={'IXIA N2X':'TCL','IXIA IxNetworks':'REST','Spirent Test Center':'API'};
  const portMap={'IXIA N2X':'8009','IXIA IxNetworks':'11009','Spirent Test Center':'8888'};
  document.getElementById('ma-proto').value=protoMap[model]||'TCL';
  document.getElementById('ma-port').value=portMap[model]||'8009';
}
async function submitMeter(){
  const body={
    group:'계측기',
    model:document.getElementById('ma-model').value,
    ip:document.getElementById('ma-ip').value,
    protocol:document.getElementById('ma-proto').value,
    port:parseInt(document.getElementById('ma-port').value),
    username:'',password:'',
    description:document.getElementById('ma-desc').value
  };
  await fetch('/api/devices',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  closeModal('modal-meter-add');
  await loadDevices();
  renderMeterTree();
}

// ── 폴더 드래그 순서/위치 변경 ──
let reqDragFolderId=null;

function reqFolderDragStart(e,folderId){
  reqDragFolderId=folderId;
  e.dataTransfer.effectAllowed='move';
  setTimeout(()=>{ const el=document.querySelector(`[data-folderid="${folderId}"]`); if(el) el.style.opacity='0.5'; },0);
}

function reqFolderDragOver(e,folderId){
  if(!reqDragFolderId||reqDragFolderId===folderId) return;
  // 자기 자신의 하위 폴더로는 이동 불가
  if(isFolderDescendant(folderId,reqDragFolderId)) return;
  e.preventDefault();
  e.stopPropagation();
  document.querySelectorAll('[data-folderid]').forEach(el=>el.style.outline='');
  const el=document.querySelector(`[data-folderid="${folderId}"]`);
  if(el) el.style.outline='2px solid var(--blue)';
}

function reqFolderDrop(e,targetId){
  e.preventDefault();
  e.stopPropagation();
  document.querySelectorAll('[data-folderid]').forEach(el=>{el.style.outline='';el.style.opacity='';});
  if(!reqDragFolderId||reqDragFolderId===targetId) return;
  if(isFolderDescendant(targetId,reqDragFolderId)) return;

  const drag=reqFolders.find(f=>f.id===reqDragFolderId);
  const target=reqFolders.find(f=>f.id===targetId);
  if(!drag||!target) return;

  // 같은 parent → 순서 변경
  if(drag.parent===target.parent){
    const fromIdx=reqFolders.indexOf(drag);
    const toIdx=reqFolders.indexOf(target);
    reqFolders.splice(fromIdx,1);
    reqFolders.splice(toIdx,0,drag);
  } else {
    // 다른 parent → target 하위로 이동
    drag.parent=targetId;
    reqFolderState['rc-'+targetId]=true; // 대상 폴더 펼침
  }
  saveREQData();
  renderREQTree();
  updateREQFolderSelect();
  reqDragFolderId=null;
}

function isFolderDescendant(folderId, ancestorId){
  const f=reqFolders.find(x=>x.id===folderId);
  if(!f) return false;
  if(f.parent===ancestorId) return true;
  if(f.parent==='root') return false;
  return isFolderDescendant(f.parent,ancestorId);
}

// 폴더명 더블클릭 인라인 편집
function reqFolderDblClick(e,folderId){
  e.stopPropagation();
  const nameEl=document.getElementById('fname-'+folderId);
  if(!nameEl) return;
  nameEl.contentEditable='true';
  nameEl.style.borderBottom='1px solid var(--green)';
  nameEl.style.outline='none';
  nameEl.focus();
  // 커서를 끝으로
  const range=document.createRange();
  const sel=window.getSelection();
  range.selectNodeContents(nameEl);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
  nameEl.onblur=()=>{
    const newName=nameEl.innerText.trim();
    if(newName){
      const f=reqFolders.find(x=>x.id===folderId);
      if(f){ f.name=newName; saveREQData(); updateREQFolderSelect(); }
    }
    nameEl.contentEditable='false';
    nameEl.style.borderBottom='';
  };
  nameEl.onkeydown=(e)=>{
    if(e.key==='Enter'){ e.preventDefault(); nameEl.blur(); }
    if(e.key==='Escape'){ nameEl.contentEditable='false'; nameEl.style.borderBottom=''; }
  };
}

// ── 트리 토글 ──
function toggleTree(id){
  const ch=document.getElementById(id);
  const arr=document.getElementById('arr_'+id);
  if(!ch)return;
  ch.classList.toggle('open');
  if(arr)arr.classList.toggle('open');
}

// ── 모달 ──
function openModal(id){document.getElementById(id).classList.add('open');}
function closeModal(id){document.getElementById(id).classList.remove('open');}
document.querySelectorAll('.modal-bg').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('open');}));

// ── 테마 전환 ──
const _ACCENTS=[
  {key:'blue',  name:'파랑',  light:'#2d6fd4', dark:'#4d8fff'},
  {key:'green', name:'초록',  light:'#00a872', dark:'#00c98d'},
  {key:'violet',name:'보라',  light:'#7c5cff', dark:'#9d7bff'},
  {key:'orange',name:'주황',  light:'#e8833a', dark:'#ff9f4d'},
  {key:'rose',  name:'로즈',  light:'#e0517a', dark:'#ff6f9c'},
  {key:'teal',  name:'청록',  light:'#119aa8', dark:'#28c0d0'},
];
function _effDark(mode){
  if(mode==='dark') return true;
  if(mode==='light') return false;
  return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
}
function _getThemeMode(){
  let m=localStorage.getItem('uta_thememode');
  if(!m){ m=(localStorage.getItem('uta_theme')==='dark')?'dark':'light'; }
  return m;
}
function applyThemeSettings(){
  const mode=_getThemeMode();
  const dark=_effDark(mode);
  document.body.classList.toggle('dark', dark);
  const ak=localStorage.getItem('uta_accent')||'blue';
  const a=_ACCENTS.find(x=>x.key===ak)||_ACCENTS[0];
  document.body.style.setProperty('--blue', dark?a.dark:a.light);
  const ti=document.getElementById('theme-icon'), tt=document.getElementById('theme-text');
  if(ti) ti.className=dark?'ti ti-sun':'ti ti-moon';
  if(tt) tt.textContent=dark?'라이트':'다크';
}
function setThemeMode(mode){
  localStorage.setItem('uta_thememode', mode);
  if(mode!=='system') localStorage.setItem('uta_theme', mode);
  applyThemeSettings(); renderThemeSettings();
}
function setAccent(key){
  localStorage.setItem('uta_accent', key);
  applyThemeSettings(); renderThemeSettings();
}
function toggleTheme(){ setThemeMode(document.body.classList.contains('dark')?'light':'dark'); }
function applyTheme(){ applyThemeSettings(); }
// ── Req & Coverage(3열) 강조 색 설정 섹션 : 03-requirements.js의 e3Accent 상태 재사용 ──
// 4개 항목(폴더명 / REQ ID / REQ 제목 / TC ID)을 프리셋 팔레트 + 커스텀 + 미리보기로 제공.
var _RC_ACCENT_ITEMS=[
  {key:'folder',   label:'폴더명',      sample:function(c,b,f,ff){ return '<span style="color:'+c+';font-weight:'+(b?'700':'400')+';font-size:'+(f||12)+'px;'+(ff?'font-family:'+ff+';':'')+'"><i class="ti ti-folder" style="color:#e8a83c;"></i> 시스템 시험</span>'; }},
  {key:'reqid',    label:'REQ ID',      sample:function(c,b,f,ff){ return '<span style="color:'+c+';font-weight:'+(b?'700':'400')+';font-size:'+(f||11)+'px;'+(ff?('font-family:'+ff+';'):'font-family:monospace;')+'">ENV-001</span>'; }},
  {key:'reqtitle', label:'REQ Summary', sample:function(c,b,f,ff){ return '<span style="color:'+c+';font-weight:'+(b?'700':'400')+';font-size:'+(f||12)+'px;'+(ff?'font-family:'+ff+';':'')+'">시스템 정보 조회</span>'; }},
  {key:'tcid',     label:'TC ID',       sample:function(c,b,f,ff){ return '<span style="color:'+c+';font-weight:'+(b?'700':'400')+';font-size:'+(f||11)+'px;'+(ff?('font-family:'+ff+';'):'font-family:monospace;')+'">ENV-TC-001</span>'; }},
  {key:'tcname',   label:'TC Summary',  sample:function(c,b,f,ff){ return '<span style="color:'+c+';font-weight:'+(b?'700':'400')+';font-size:'+(f||12)+'px;'+(ff?'font-family:'+ff+';':'')+'">시스템 정보 조회 정상 동작</span>'; }},
];
var _RC_ACCENT_PRESETS=['#2d6fd4','#7c3aed','#00875a','#e8820c','#e53e5a','#0ca678','#564a7e','#1a1d2e','#8890a4','#c0392b','#b5730a','#1a52b0'];
function _rcAccentGet(key){ try{ if(typeof e3Accent!=='undefined'&&e3Accent&&(key in e3Accent)) return e3Accent[key]; }catch(e){} var d={folder:'#564a7e',reqid:'#2d6fd4',reqtitle:'#1a1d2e',tcid:'#2d6fd4'}; return d[key]; }
// 테마 페이지에서 색 변경 → e3AccentSet/e3bAccentSet(저장+원본·베타 화면 갱신)을 쓰되, 이 섹션만 다시 그림
// Tests Color 값 변경 시 — 원본(e3Accent/e3Bold/e3FontSize) · Beta(e3bAccent/e3bBold/e3bFontSize) 두 상태를
// localStorage 를 진실의 원천으로 삼아 매번 동기화한 뒤 두 페이지 innerHTML을 즉시 강제 재렌더한다.
// 어느 페이지에 있어도 다음 진입 시 옛 값이 잔상으로 남지 않는다.
function _rcSyncAccentFromLS(){
  try{ var s=localStorage.getItem('utop_e3_accent'); if(!s) return; var o=JSON.parse(s);
    ['folder','reqid','reqtitle','tcid','tcname'].forEach(function(k){ if(o&&o[k]){
      try{ if(typeof e3Accent!=='undefined') e3Accent[k]=o[k]; }catch(e){}
      try{ if(typeof e3bAccent!=='undefined') e3bAccent[k]=o[k]; }catch(e){}
    }});
  }catch(e){}
}
function _rcSyncBoldFromLS(){
  try{ var s=localStorage.getItem('utop_e3_bold'); if(!s) return; var o=JSON.parse(s);
    ['folder','reqid','reqtitle','tcid','tcname'].forEach(function(k){ if(o&&typeof o[k]==='boolean'){
      try{ if(typeof e3Bold!=='undefined') e3Bold[k]=o[k]; }catch(e){}
      try{ if(typeof e3bBold!=='undefined') e3bBold[k]=o[k]; }catch(e){}
    }});
  }catch(e){}
}
function _rcSyncFontSizeFromLS(){
  try{ var s=localStorage.getItem('utop_e3_fontsize'); if(!s) return; var o=JSON.parse(s);
    ['folder','reqid','reqtitle','tcid','tcname'].forEach(function(k){ if(o&&typeof o[k]==='number'){
      try{ if(typeof e3FontSize!=='undefined') e3FontSize[k]=o[k]; }catch(e){}
      try{ if(typeof e3bFontSize!=='undefined') e3bFontSize[k]=o[k]; }catch(e){}
    }});
  }catch(e){}
}
// 원본·Beta 두 상태를 localStorage 값으로 재동기 → 이미 렌더된 요소 색상은 style 태그로 즉시 오버라이드
// (innerHTML 재렌더 대신 CSS 규칙 갱신 — 스크롤 위치·포커스·편집 상태를 잃지 않는다)
function _rcApplyRender(){
  _rcSyncAccentFromLS(); _rcSyncBoldFromLS(); _rcSyncFontSizeFromLS();
  _rcInjectStyleOverride();   // 렌더된 rc-* 클래스 요소의 color/font 즉시 오버라이드
}
// 렌더된 요소 (rc-folder / rc-reqid / rc-reqtitle / rc-tcid / rc-tcname)의 색·굵기·크기·폰트를 즉시 반영
function _rcInjectStyleOverride(){
  var _ac=(typeof _rcAccentGet==='function')?{folder:_rcAccentGet('folder'),reqid:_rcAccentGet('reqid'),reqtitle:_rcAccentGet('reqtitle'),tcid:_rcAccentGet('tcid'),tcname:_rcAccentGet('tcname')}
        :{folder:'#564a7e',reqid:'#2d6fd4',reqtitle:'#1a1d2e',tcid:'#2d6fd4',tcname:'#1a1d2e'};
  var _bd=(typeof _rcBoldGet==='function')?{folder:_rcBoldGet('folder'),reqid:_rcBoldGet('reqid'),reqtitle:_rcBoldGet('reqtitle'),tcid:_rcBoldGet('tcid'),tcname:_rcBoldGet('tcname')}
        :{folder:true,reqid:true,reqtitle:false,tcid:true,tcname:false};
  var _fs=(typeof _rcFontSizeGet==='function')?{folder:_rcFontSizeGet('folder'),reqid:_rcFontSizeGet('reqid'),reqtitle:_rcFontSizeGet('reqtitle'),tcid:_rcFontSizeGet('tcid'),tcname:_rcFontSizeGet('tcname')}
        :{folder:12.5,reqid:11,reqtitle:12.5,tcid:12.5,tcname:12.5};
  var _ff=(typeof _rcFontFamilyGet==='function')?{folder:_rcFontFamilyGet('folder'),reqid:_rcFontFamilyGet('reqid'),reqtitle:_rcFontFamilyGet('reqtitle'),tcid:_rcFontFamilyGet('tcid'),tcname:_rcFontFamilyGet('tcname')}
        :{folder:'',reqid:'',reqtitle:'',tcid:'',tcname:''};
  var css=''
    +'.rc-folder{color:'+_ac.folder+' !important;font-weight:'+(_bd.folder?700:400)+' !important;font-size:'+_fs.folder+'px !important;'+(_ff.folder?('font-family:'+_ff.folder+' !important;'):'')+'}'
    +'.rc-reqid{color:'+_ac.reqid+' !important;font-weight:'+(_bd.reqid?700:400)+' !important;font-size:'+_fs.reqid+'px !important;'+(_ff.reqid?('font-family:'+_ff.reqid+' !important;'):'')+'}'
    +'.rc-reqtitle{color:'+_ac.reqtitle+' !important;font-weight:'+(_bd.reqtitle?700:400)+' !important;font-size:'+_fs.reqtitle+'px !important;'+(_ff.reqtitle?('font-family:'+_ff.reqtitle+' !important;'):'')+'}'
    +'.rc-tcid{color:'+_ac.tcid+' !important;font-weight:'+(_bd.tcid?700:400)+' !important;font-size:'+_fs.tcid+'px !important;'+(_ff.tcid?('font-family:'+_ff.tcid+' !important;'):'')+'}'
    +'.rc-tcname,.rc-tcname>span{color:'+_ac.tcname+' !important;font-weight:'+(_bd.tcname?700:400)+' !important;font-size:'+_fs.tcname+'px !important;'+(_ff.tcname?('font-family:'+_ff.tcname+' !important;'):'')+'}';
  var st=document.getElementById('rc-live-style');
  if(!st){ st=document.createElement('style'); st.id='rc-live-style'; document.head.appendChild(st); }
  st.textContent=css;
}
// 로드 완료 후 반영 — 03-requirements.js 의 e3Accent/e3bAccent 초기화가 끝난 뒤 style 태그를 세팅
// (즉시 실행 시 e3Accent 가 undefined 라 잘못된 값이 들어감 → 실제 반영 실패)
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded', function(){ try{ _rcInjectStyleOverride(); }catch(_){} });
} else {
  setTimeout(function(){ try{ _rcInjectStyleOverride(); }catch(_){} }, 0);
}
function _rcScheduleRender(){ _rcApplyRender(); }
function _rcAccentSet(key,val){
  try{ if(typeof e3Accent!=='undefined'&&(key in e3Accent)){ e3Accent[key]=val; if(typeof e3AccentSave==='function') e3AccentSave(); } }catch(e){}
  try{ if(typeof e3bAccent!=='undefined'&&(key in e3bAccent)){ e3bAccent[key]=val; if(typeof e3bAccentSave==='function') e3bAccentSave(); } }catch(e){}
  _rcApplyRender(); _rcAccentRefresh();
}
function _rcAccentReset(key){
  try{ if(typeof E3_ACCENT_DEF!=='undefined'&&(key in E3_ACCENT_DEF)){ e3Accent[key]=E3_ACCENT_DEF[key]; if(typeof e3AccentSave==='function') e3AccentSave(); } }catch(e){}
  try{ if(typeof E3B_ACCENT_DEF!=='undefined'&&(key in E3B_ACCENT_DEF)){ e3bAccent[key]=E3B_ACCENT_DEF[key]; if(typeof e3bAccentSave==='function') e3bAccentSave(); } }catch(e){}
  _rcApplyRender(); _rcAccentRefresh();
}
function _rcAccentRefresh(){ var box=document.getElementById('rc-accent-box'); if(box) box.innerHTML=_rcAccentRows(); }
// REQ ID / TC ID 표시-숨김 토글 — 원본(e3ShowReqId) 과 Beta(e3bShowReqId) 상태를 동시에 갱신 + 두 페이지 재렌더.
// 기존에는 e3SetShowReqId 만 호출해 Beta 페이지가 새로고침 전에는 반영 안 되던 문제 해결.
// 저장 완료 전에 페이지 이동/재진입 시 GET 이 옛 값을 되돌려 UI 가 원복되던 이슈:
//   → _rcUiOptDirty 창(3초) 안에는 서버 GET 값을 무시하고 로컬 값 유지.
window._rcUiOptDirty=window._rcUiOptDirty||0;
function _rcSetShowReqId(v){
  v=!!v; window._rcUiOptDirty=Date.now();
  try{ if(typeof e3ShowReqId!=='undefined') e3ShowReqId=v; }catch(e){}
  try{ if(typeof e3bShowReqId!=='undefined') e3bShowReqId=v; }catch(e){}
  try{ localStorage.setItem('utop_e3_show_reqid', v?'1':'0'); }catch(e){}
  try{ fetch('/api/ui-options?token='+(typeof authToken!=='undefined'?encodeURIComponent(authToken):''),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({show_req_id:v})}).catch(function(){}); }catch(e){}
  try{ if(typeof renderExplorer3==='function') renderExplorer3(); }catch(e){}
  try{ if(typeof renderExplorer3Beta==='function') renderExplorer3Beta(); }catch(e){}
  if(typeof _rcAccentRefresh==='function') _rcAccentRefresh();
}
function _rcSetShowTcId(v){
  v=!!v; window._rcUiOptDirty=Date.now();
  try{ if(typeof e3ShowTcId!=='undefined') e3ShowTcId=v; }catch(e){}
  try{ if(typeof e3bShowTcId!=='undefined') e3bShowTcId=v; }catch(e){}
  try{ localStorage.setItem('utop_e3_show_tcid', v?'1':'0'); }catch(e){}
  try{ fetch('/api/ui-options?token='+(typeof authToken!=='undefined'?encodeURIComponent(authToken):''),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({show_tc_id:v})}).catch(function(){}); }catch(e){}
  try{ if(typeof renderExplorer3==='function') renderExplorer3(); }catch(e){}
  try{ if(typeof renderExplorer3Beta==='function') renderExplorer3Beta(); }catch(e){}
  if(typeof _rcAccentRefresh==='function') _rcAccentRefresh();
}
// Req&Coverage 굵게(Bold) : 03-requirements.js의 e3Bold 상태 재사용
function _rcBoldGet(key){ try{ if(typeof e3Bold!=='undefined'&&e3Bold&&(key in e3Bold)) return !!e3Bold[key]; }catch(e){} var d={folder:true,reqid:true,reqtitle:false,tcid:true}; return !!d[key]; }
function _rcBoldToggle(key){
  var nv=!_rcBoldGet(key);
  try{ if(typeof e3Bold!=='undefined'&&(key in e3Bold)){ e3Bold[key]=nv; if(typeof e3BoldSave==='function') e3BoldSave(); } }catch(e){}
  try{ if(typeof e3bBold!=='undefined'&&(key in e3bBold)){ e3bBold[key]=nv; if(typeof e3bBoldSave==='function') e3bBoldSave(); } }catch(e){}
  _rcScheduleRender(); _rcAccentRefresh();
}
// Req&Coverage 글씨 크기(Font size) : 03-requirements.js의 e3FontSize 상태 재사용
function _rcFontSizeGet(key){ try{ if(typeof e3FontSize!=='undefined'&&e3FontSize&&(key in e3FontSize)) return e3FontSize[key]; }catch(e){} var d={folder:12.5,reqid:11,reqtitle:12.5,tcid:12.5,tcname:12.5}; return d[key]||12.5; }
function _rcFontSizeSet(key,val){
  var n=parseFloat(val); if(isNaN(n))return; n=Math.max(9,Math.min(20,n));
  try{ if(typeof e3FontSize!=='undefined'&&(key in e3FontSize)){ e3FontSize[key]=n; if(typeof e3FontSizeSave==='function') e3FontSizeSave(); } }catch(e){}
  try{ if(typeof e3bFontSize!=='undefined'&&(key in e3bFontSize)){ e3bFontSize[key]=n; if(typeof e3bFontSizeSave==='function') e3bFontSizeSave(); } }catch(e){}
  _rcScheduleRender(); _rcAccentRefresh();
}
function _rcFontSizeStep(key,delta){ var cur=parseFloat(_rcFontSizeGet(key))||13; var nv=Math.max(9, Math.min(20, cur+delta)); _rcFontSizeSet(key, nv); }
// 폰트 패밀리 (같은 항목별) — localStorage 저장, 즉시 적용
var _RC_FONT_OPTIONS=[
  {label:'',             value:''},   // 기본 — 라벨은 렌더 시 동적 (실제 상속 폰트명 표시)
  {label:'Pretendard',   value:'Pretendard, sans-serif'},
  {label:'Noto Sans KR', value:'"Noto Sans KR", sans-serif'},
  {label:'Malgun Gothic',value:'"Malgun Gothic", sans-serif'},
  {label:'Segoe UI',     value:'"Segoe UI", system-ui, sans-serif'},
  {label:'Nanum Gothic', value:'"Nanum Gothic", sans-serif'},
  {label:'Nanum Myeongjo', value:'"Nanum Myeongjo", serif'},
  {label:'Georgia',      value:'Georgia, serif'},
  {label:'Consolas (모노)', value:'Consolas, monospace'},
];
// 현재 body 가 실제 사용 중인 폰트 첫 항목 반환 (기본값 라벨용)
function _rcDefaultFontName(){
  try{
    var ff=getComputedStyle(document.body).fontFamily||'';
    // 콤마로 첫 폰트, 따옴표·공백 제거
    var first=String(ff).split(',')[0].replace(/["']/g,'').trim();
    return first||'system-ui';
  }catch(e){ return 'system-ui'; }
}
function _rcFontFamilyGet(key){
  try{ return localStorage.getItem('uta_rc_ff_'+key)||''; }catch(e){ return ''; }
}
function _rcFontFamilySet(key,val){
  try{ if(val) localStorage.setItem('uta_rc_ff_'+key, val); else localStorage.removeItem('uta_rc_ff_'+key); }catch(e){}
  _rcApplyFontFamily(key, val);
  _rcScheduleRender();
  _rcAccentRefresh();
}
function _rcApplyFontFamily(key, val){
  // key(folder/reqid/reqtitle/tcid/tcsummary) → CSS var 로 노출, 각 화면 스타일에서 참조.
  try{ document.documentElement.style.setProperty('--rc-ff-'+key, val||''); }catch(e){}
}
// 초기 로드 시 모든 key 의 폰트 적용
function _rcInitFontFamilies(){
  try{ (['folder','reqid','reqtitle','tcid','tcname']).forEach(function(k){ _rcApplyFontFamily(k, _rcFontFamilyGet(k)); }); }catch(e){}
}
try{ _rcInitFontFamilies(); }catch(e){}

// ── 아이콘 커스터마이즈 (폴더 / REQ) ──────────────────
var _RC_ICON_DEF={ folder:{ic:'ti-folder', color:'#e8a83c', size:16}, req:{ic:'ti-file-text', color:'#2d6fd4', size:16} };
var _RC_ICON_PRESETS={
  folder:['ti-folder','ti-folder-open','ti-folders','ti-folder-filled','ti-briefcase','ti-package','ti-box','ti-archive','ti-tag','ti-book','ti-book-2','ti-stack','ti-layout-grid','ti-category','ti-hierarchy','ti-sitemap'],
  req:['ti-file-text','ti-file','ti-file-check','ti-file-info','ti-clipboard','ti-clipboard-text','ti-clipboard-list','ti-clipboard-check','ti-notes','ti-note','ti-list-details','ti-list-check','ti-target','ti-flag','ti-bookmark','ti-star'],
};
function _rcIconGet(kind){
  try{
    var ic=localStorage.getItem('uta_rc_icon_'+kind)||_RC_ICON_DEF[kind].ic;
    var color=localStorage.getItem('uta_rc_iconcolor_'+kind)||_RC_ICON_DEF[kind].color;
    var sizeStr=localStorage.getItem('uta_rc_iconsize_'+kind);
    var size=sizeStr?parseInt(sizeStr,10):_RC_ICON_DEF[kind].size;
    if(!size||isNaN(size)) size=_RC_ICON_DEF[kind].size;
    return {ic:ic, color:color, size:size};
  }catch(e){ return {ic:_RC_ICON_DEF[kind].ic, color:_RC_ICON_DEF[kind].color, size:_RC_ICON_DEF[kind].size}; }
}
function _rcIconSet(kind, ic, color, size){
  try{
    if(ic!=null) localStorage.setItem('uta_rc_icon_'+kind, ic);
    if(color!=null) localStorage.setItem('uta_rc_iconcolor_'+kind, color);
    if(size!=null){
      var s=parseInt(size,10);
      if(!isNaN(s)){ s=Math.max(8,Math.min(48,s)); localStorage.setItem('uta_rc_iconsize_'+kind, String(s)); }
    }
  }catch(e){}
  _rcAccentRefreshAll();
  _rcScheduleRender();   // Explorer3 / Explorer3-Beta 중 활성 페이지만 rAF 1회
  try{ if(typeof renderCycleBoard==='function') renderCycleBoard(true); }catch(e){}
}
function _rcIconReset(kind){
  try{ localStorage.removeItem('uta_rc_icon_'+kind); localStorage.removeItem('uta_rc_iconcolor_'+kind); localStorage.removeItem('uta_rc_iconsize_'+kind); }catch(e){}
  _rcAccentRefreshAll();
  _rcScheduleRender();
  try{ if(typeof renderCycleBoard==='function') renderCycleBoard(true); }catch(e){}
}
function _rcFontSizeReset(key){
  try{ if(typeof E3_FONTSIZE_DEF!=='undefined'&&(key in E3_FONTSIZE_DEF)){ e3FontSize[key]=E3_FONTSIZE_DEF[key]; if(typeof e3FontSizeSave==='function') e3FontSizeSave(); } }catch(e){}
  try{ if(typeof E3B_FONTSIZE_DEF!=='undefined'&&(key in E3B_FONTSIZE_DEF)){ e3bFontSize[key]=E3B_FONTSIZE_DEF[key]; if(typeof e3bFontSizeSave==='function') e3bFontSizeSave(); } }catch(e){}
  _rcScheduleRender(); _rcAccentRefresh();
}
function _rcAccentRows(){
  return _RC_ACCENT_ITEMS.map(function(it){
    var cur=_rcAccentGet(it.key);
    var bold=_rcBoldGet(it.key);
    var fsize=_rcFontSizeGet(it.key);
    var sw=_RC_ACCENT_PRESETS.map(function(c){
      var on=(String(c).toLowerCase()===String(cur).toLowerCase());
      return '<div onclick="_rcAccentSet(\''+it.key+'\',\''+c+'\')" title="'+c+'" style="width:22px;height:22px;border-radius:6px;background:'+c+';cursor:pointer;box-shadow:'+(on?'0 0 0 2px var(--bg2),0 0 0 4px '+c:'inset 0 0 0 1px rgba(0,0,0,0.10)')+';"></div>';
    }).join('');
    var boldBtn='<button onclick="_rcBoldToggle(\''+it.key+'\')" title="글씨 굵게 '+(bold?'해제':'설정')+'" style="display:inline-flex;align-items:center;gap:5px;font-size:11px;padding:5px 11px;border:1px solid '+(bold?'var(--blue)':'var(--border)')+';border-radius:7px;background:'+(bold?'color-mix(in srgb,var(--blue) 12%,var(--bg2))':'var(--bg2)')+';color:'+(bold?'var(--blue)':'var(--text2)')+';cursor:pointer;font-weight:700;flex-shrink:0;"><i class="ti ti-bold" style="font-size:14px;"></i>굵게 '+(bold?'ON':'OFF')+'</button>';
    var sizeCtl='<div title="글씨 크기(px)" style="display:flex;align-items:center;gap:4px;flex-shrink:0;border:1px solid var(--border);border-radius:8px;padding:4px 6px;background:var(--bg2);min-height:34px;">'
      +'<i class="ti ti-text-size" style="font-size:16px;color:var(--text2);margin-right:2px;"></i>'
      +'<button onclick="_rcFontSizeStep(\''+it.key+'\',-0.5)" title="작게" style="width:26px;height:26px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);color:var(--text2);cursor:pointer;font-size:16px;font-weight:800;padding:0;display:flex;align-items:center;justify-content:center;line-height:1;">−</button>'
      +'<input id="rc-fsize-'+it.key+'" type="number" min="9" max="20" step="0.5" value="'+fsize+'" onchange="_rcFontSizeSet(\''+it.key+'\',this.value)" style="width:44px;font-size:14px;font-weight:700;border:none;background:transparent;color:var(--text);outline:none;text-align:center;-moz-appearance:textfield;">'
      +'<button onclick="_rcFontSizeStep(\''+it.key+'\',0.5)" title="크게" style="width:26px;height:26px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);color:var(--text2);cursor:pointer;font-size:16px;font-weight:800;padding:0;display:flex;align-items:center;justify-content:center;line-height:1;">+</button>'
      +'<span style="font-size:11.5px;color:var(--text3);margin-left:2px;">px</span>'
    +'</div>';
    // 폰트 패밀리 드롭다운
    var ff=_rcFontFamilyGet(it.key);
    var _defFn=_rcDefaultFontName();
    var ffOpts=_RC_FONT_OPTIONS.map(function(o){
      var lbl=o.value===''?('기본 · '+_defFn):o.label;
      return '<option value="'+String(o.value).replace(/"/g,'&quot;')+'"'+(o.value===ff?' selected':'')+'>'+lbl+'</option>';
    }).join('');
    var fontCtl='<label title="폰트 종류" style="display:flex;align-items:center;gap:6px;flex-shrink:0;border:1px solid var(--border);border-radius:8px;padding:4px 8px;background:var(--bg2);min-height:34px;">'
      +'<i class="ti ti-typography" style="font-size:15px;color:var(--text2);"></i>'
      +'<select onchange="_rcFontFamilySet(\''+it.key+'\',this.value)" style="font-size:12.5px;font-weight:600;border:none;background:transparent;color:var(--text);outline:none;cursor:pointer;min-width:140px;">'+ffOpts+'</select>'
    +'</label>';
    var visShow=(it.key==='reqid')?(typeof e3ShowReqId!=='undefined'?e3ShowReqId:true):(it.key==='tcid')?(typeof e3ShowTcId!=='undefined'?e3ShowTcId:true):null;
    var visBtn=(visShow!==null)?'<button onclick="'+(it.key==='reqid'?'_rcSetShowReqId(':'_rcSetShowTcId(')+(visShow?'false':'true')+');" title="'+(visShow?'숨기기':'표시하기')+'" style="display:inline-flex;align-items:center;gap:5px;font-size:11px;padding:5px 11px;border:1px solid '+(visShow?'var(--border)':'#e53e5a')+';border-radius:7px;background:'+(visShow?'var(--bg2)':'rgba(229,62,90,0.08)')+';color:'+(visShow?'var(--text2)':'#e53e5a')+';cursor:pointer;font-weight:600;flex-shrink:0;"><i class="ti '+(visShow?'ti-eye':'ti-eye-off')+'" style="font-size:14px;"></i>'+(visShow?'표시':'숨김')+'</button>':'';
    return '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border:1px solid var(--border);border-radius:10px;background:var(--bg2);margin-bottom:8px;flex-wrap:wrap;">'
      +'<div style="width:170px;flex-shrink:0;"><div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:2px;">'+it.label+'</div><div style="font-size:10.5px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+it.sample(cur,bold,fsize,ff)+'</div></div>'
      +'<div style="display:flex;gap:5px;flex-shrink:0;">'+sw+'</div>'
      +'<label style="display:flex;align-items:center;gap:6px;cursor:pointer;flex-shrink:0;"><input type="color" value="'+cur+'" oninput="_rcAccentSet(\''+it.key+'\',this.value)" style="width:30px;height:26px;border:1px solid var(--border);border-radius:6px;padding:0;background:none;cursor:pointer;"><span style="font-size:11px;color:var(--text2);">직접</span></label>'
      +sizeCtl
      +fontCtl
      +boldBtn
      +visBtn
      +'<button onclick="_rcAccentReset(\''+it.key+'\');_rcBoldReset(\''+it.key+'\');_rcFontSizeReset(\''+it.key+'\')" style="font-size:11px;padding:5px 10px;border:1px solid var(--border);border-radius:7px;background:var(--bg2);color:var(--text2);cursor:pointer;font-weight:600;flex-shrink:0;">기본값</button>'
    +'</div>';
  }).join('');
}
function _rcBoldReset(key){
  try{ if(typeof E3_BOLD_DEF!=='undefined'&&(key in E3_BOLD_DEF)){ e3Bold[key]=E3_BOLD_DEF[key]; if(typeof e3BoldSave==='function') e3BoldSave(); } }catch(e){}
  try{ if(typeof E3B_BOLD_DEF!=='undefined'&&(key in E3B_BOLD_DEF)){ e3bBold[key]=E3B_BOLD_DEF[key]; if(typeof e3bBoldSave==='function') e3bBoldSave(); } }catch(e){}
  _rcScheduleRender(); _rcAccentRefresh();
}
function _reqCovAccentSection(){
  return '<div style="font-size:13px;font-weight:700;color:var(--text2);margin-bottom:6px;">Req &amp; Coverage 강조 색</div>'
    +'<div style="font-size:11.5px;color:var(--text3);margin-bottom:13px;">Test Workflow → Req &amp; Coverage (3열) 화면의 항목별 글자 색입니다. 선택 즉시 저장되며 이 브라우저에만 적용됩니다.</div>'
    +'<div id="rc-accent-box" style="max-width:none;margin-bottom:30px;">'+_rcAccentRows()+'</div>';
}
// Tests › Tests Color 페이지 렌더 (기존 강조 색 섹션 + 아이콘 커스터마이즈)
function renderTestsColor(){
  var el=document.getElementById('tests-color-body'); if(!el) return;
  el.innerHTML=_rcIconSection()
    +_reqCovAccentSection()
    +'<div style="padding:14px 16px;background:var(--bg3);border:1px solid var(--border);border-radius:10px;font-size:12.5px;color:var(--text2);display:flex;align-items:center;gap:8px;"><i class="ti ti-info-circle" style="color:var(--blue);font-size:16px;"></i>선택 즉시 저장되어 다음 접속에도 유지됩니다. Tests(Requirements &amp; Coverage) 화면에만 적용됩니다.</div>';
}

// ── Cycle Color (Cycle + Reports 전용) — Tests Color 와 storage 분리 ────
var _CC_ICON_DEF={
  folder:{ic:'ti-folder', color:'#2d6fd4', size:16},
  req:{ic:'ti-file-text', color:'#2d6fd4', size:16},
  ctMgroup:{ic:'ti-folder', color:'#2d6fd4', size:16},
  ctModel:{ic:'ti-device-desktop', color:'#2d6fd4', size:16},
  ctVgroup:{ic:'ti-folder', color:'#e8a83c', size:16},
  ctVersion:{ic:'ti-tag', color:'#e8820c', size:16},
  rptTreeMgroup:{ic:'ti-folder', color:'#2d6fd4', size:14},
  rptTreeModel:{ic:'ti-device-desktop', color:'#00a872', size:14},
  rptTreeVersion:{ic:'ti-tag', color:'#e8820c', size:14},
};
// Cycle Tree · Reports Tree 레벨용 아이콘 프리셋
var _CC_ICON_PRESETS_EXT={
  ctMgroup:['ti-folder','ti-folder-open','ti-folders','ti-briefcase','ti-package','ti-building','ti-server','ti-network','ti-sitemap'],
  ctModel:['ti-device-desktop','ti-device-laptop','ti-server','ti-router','ti-cpu','ti-microchip','ti-devices','ti-box','ti-package'],
  ctVgroup:['ti-folder','ti-folder-open','ti-folders','ti-git-branch','ti-versions','ti-stack','ti-layers-linked','ti-hierarchy'],
  ctVersion:['ti-tag','ti-tags','ti-bookmark','ti-flag','ti-file-check','ti-versions','ti-git-commit','ti-hash','ti-circle-check'],
  rptTreeMgroup:['ti-folder','ti-folder-open','ti-folders','ti-briefcase','ti-package','ti-building','ti-server','ti-network','ti-sitemap'],
  rptTreeModel:['ti-device-desktop','ti-device-laptop','ti-server','ti-router','ti-cpu','ti-microchip','ti-devices','ti-box','ti-package'],
  rptTreeVersion:['ti-tag','ti-tags','ti-bookmark','ti-flag','ti-file-check','ti-versions','ti-git-commit','ti-hash','ti-circle-check'],
};
function _ccIconGet(kind){
  try{
    var ic=localStorage.getItem('uta_cc_icon_'+kind)||_CC_ICON_DEF[kind].ic;
    var color=localStorage.getItem('uta_cc_iconcolor_'+kind)||_CC_ICON_DEF[kind].color;
    var sz=parseFloat(localStorage.getItem('uta_cc_iconsize_'+kind));
    if(isNaN(sz)) sz=_CC_ICON_DEF[kind].size||16;
    return {ic:ic, color:color, size:sz};
  }catch(e){ return {ic:_CC_ICON_DEF[kind].ic, color:_CC_ICON_DEF[kind].color, size:_CC_ICON_DEF[kind].size||16}; }
}
function _ccIconSet(kind, ic, color, size){
  try{
    if(ic!=null) localStorage.setItem('uta_cc_icon_'+kind, ic);
    if(color!=null) localStorage.setItem('uta_cc_iconcolor_'+kind, color);
    if(size!=null){
      var v=parseFloat(size); if(!isNaN(v)){ v=Math.max(8, Math.min(48, v)); localStorage.setItem('uta_cc_iconsize_'+kind, String(v)); }
    }
  }catch(e){}
  _ccRefreshAll();
  try{ if(typeof renderCycleBoard==='function') renderCycleBoard(true); }catch(e){}
  try{ if(typeof renderReleaseSummary==='function') renderReleaseSummary(); }catch(e){}
  try{ if(typeof renderReport==='function' && document.getElementById('page-report')&&document.getElementById('page-report').classList.contains('active')){ renderReport(); } }catch(e){}
}
function _ccIconReset(kind){
  try{ localStorage.removeItem('uta_cc_icon_'+kind); localStorage.removeItem('uta_cc_iconcolor_'+kind); localStorage.removeItem('uta_cc_iconsize_'+kind); }catch(e){}
  _ccRefreshAll();
  try{ if(typeof renderCycleBoard==='function') renderCycleBoard(true); }catch(e){}
  try{ if(typeof renderReleaseSummary==='function') renderReleaseSummary(); }catch(e){}
  try{ if(typeof renderReport==='function' && document.getElementById('page-report')&&document.getElementById('page-report').classList.contains('active')){ renderReport(); } }catch(e){}
}
// Cycle 전용 색상·크기·굵기·폰트 (Test Execution 화면 실제 항목)
// - foldername  : 좌측 REQ 트리 폴더명
// - reqtitle    : 좌측 REQ 트리 REQ 제목
// - tcid        : 중앙 TC 리스트 ID
// - tcname      : 중앙 TC 리스트 이름
// - cycleFolder : 우측 Cycle Board 폴더/모델그룹 이름
// - cycleName   : 우측 Cycle Board 사이클(버전) 이름
// Cycle Theme 전용 항목 (Cycle Tree 4레벨)
var _CC_CYCLE_ITEMS=[
  {key:'ctMgroup',     label:'Cycle Tree · 모델그룹',   sample:function(c,b,f,ff){ return '<span style="color:'+c+';font-weight:'+(b?'700':'500')+';font-size:'+(f||12)+'px;'+(ff?'font-family:'+ff+';':'')+'"><i class="ti ti-folder" style="color:#2d6fd4;"></i> LGU+_E57xxRL · E5724RL</span>'; }},
  {key:'ctModel',      label:'Cycle Tree · 모델',       sample:function(c,b,f,ff){ return '<span style="color:'+c+';font-weight:'+(b?'700':'500')+';font-size:'+(f||12)+'px;'+(ff?'font-family:'+ff+';':'')+'"><i class="ti ti-device-desktop" style="color:#2d6fd4;"></i> E5724RL</span>'; }},
  {key:'ctVgroup',     label:'Cycle Tree · 버전그룹',   sample:function(c,b,f,ff){ return '<span style="color:'+c+';font-weight:'+(b?'700':'500')+';font-size:'+(f||12)+'px;'+(ff?'font-family:'+ff+';':'')+'"><i class="ti ti-folder" style="color:#e8a83c;"></i> R100</span>'; }},
  {key:'ctVersion',    label:'Cycle Tree · 사이클(버전)', sample:function(c,b,f,ff){ return '<span style="color:'+c+';font-weight:'+(b?'700':'500')+';font-size:'+(f||12)+'px;'+(ff?'font-family:'+ff+';':'')+'"><i class="ti ti-tag" style="color:#e8820c;"></i> R101_2026_06_26</span>'; }},
];
// Reports Theme 전용 항목 (Test Report KPI/Rollup + Cycle Tree)
var _CC_REPORTS_ITEMS=[
  // Cycle Tree (Test Report 좌측 스코프 트리)
  {key:'rptTreeMgroup', label:'Cycle Tree · 모델그룹',   sample:function(c,b,f,ff){ return '<span style="color:'+c+';font-weight:'+(b?'700':'500')+';font-size:'+(f||12)+'px;'+(ff?'font-family:'+ff+';':'')+'"><i class="ti ti-folder" style="color:#2d6fd4;"></i> LGU+_E57xxRL</span>'; }},
  {key:'rptTreeModel',  label:'Cycle Tree · 모델',       sample:function(c,b,f,ff){ return '<span style="color:'+c+';font-weight:'+(b?'700':'500')+';font-size:'+(f||12)+'px;'+(ff?'font-family:'+ff+';':'')+'"><i class="ti ti-device-desktop" style="color:#00a872;"></i> E5724RL</span>'; }},
  {key:'rptTreeVersion',label:'Cycle Tree · 버전',       sample:function(c,b,f,ff){ return '<span style="color:'+c+';font-weight:'+(b?'700':'500')+';font-size:'+(f||12)+'px;'+(ff?'font-family:'+ff+';':'')+'"><i class="ti ti-tag" style="color:#e8820c;"></i> R101_2026_06_26</span>'; }},
];
// 통합 배열 (_ccAccentRows 등 기존 함수가 참조) — 저장/불러오기 로직은 이 전체 목록에서 key 로 찾음
var _CC_ITEMS = _CC_CYCLE_ITEMS.concat(_CC_REPORTS_ITEMS);
var _CC_ACCENT_DEF={ctMgroup:'#1a1d2e', ctModel:'#1a1d2e', ctVgroup:'#1a1d2e', ctVersion:'#1a1d2e', rptTreeMgroup:'#1a1d2e', rptTreeModel:'#1a1d2e', rptTreeVersion:'#1a1d2e'};
var _CC_FSIZE_DEF={ctMgroup:12, ctModel:12, ctVgroup:12, ctVersion:12, rptTreeMgroup:12, rptTreeModel:12, rptTreeVersion:12};
function _ccAccentGet(key){ try{ return localStorage.getItem('uta_cc_accent_'+key)||_CC_ACCENT_DEF[key]||'#1a1d2e'; }catch(e){ return _CC_ACCENT_DEF[key]||'#1a1d2e'; } }
function _ccAccentSet(key,val){ try{ localStorage.setItem('uta_cc_accent_'+key, val); }catch(e){} _ccRefreshAll(); _ccPropagate(); }
function _ccAccentReset(key){ try{ localStorage.removeItem('uta_cc_accent_'+key); }catch(e){} _ccRefreshAll(); _ccPropagate(); }
function _ccBoldGet(key){ try{ return localStorage.getItem('uta_cc_bold_'+key)==='1'; }catch(e){ return false; } }
function _ccBoldToggle(key){ try{ localStorage.setItem('uta_cc_bold_'+key, _ccBoldGet(key)?'0':'1'); }catch(e){} _ccRefreshAll(); _ccPropagate(); }
function _ccBoldReset(key){ try{ localStorage.removeItem('uta_cc_bold_'+key); }catch(e){} _ccRefreshAll(); _ccPropagate(); }
function _ccFontSizeGet(key){ try{ var v=parseFloat(localStorage.getItem('uta_cc_fsize_'+key)); return isNaN(v)?(_CC_FSIZE_DEF[key]||12.5):v; }catch(e){ return _CC_FSIZE_DEF[key]||12.5; } }
function _ccFontSizeSet(key,val){ var n=parseFloat(val); if(isNaN(n))return; n=Math.max(9,Math.min(20,n)); try{ localStorage.setItem('uta_cc_fsize_'+key, n); }catch(e){} _ccRefreshAll(); _ccPropagate(); }
function _ccFontSizeStep(key,delta){ var cur=_ccFontSizeGet(key); _ccFontSizeSet(key, cur+delta); }
function _ccFontSizeReset(key){ try{ localStorage.removeItem('uta_cc_fsize_'+key); }catch(e){} _ccRefreshAll(); _ccPropagate(); }
function _ccFontFamilyGet(key){ try{ return localStorage.getItem('uta_cc_ff_'+key)||''; }catch(e){ return ''; } }
function _ccFontFamilySet(key,val){ try{ if(val) localStorage.setItem('uta_cc_ff_'+key, val); else localStorage.removeItem('uta_cc_ff_'+key); }catch(e){} _ccRefreshAll(); _ccPropagate(); }
function _ccPropagate(){
  try{ if(typeof renderCycleBoard==='function') renderCycleBoard(true); }catch(e){}
  try{ if(typeof renderReleaseSummary==='function') renderReleaseSummary(); }catch(e){}
  try{ if(typeof renderReport==='function' && document.getElementById('page-report')&&document.getElementById('page-report').classList.contains('active')){ renderReport(); } }catch(e){}
}
function _ccRefreshAll(){
  var box=document.getElementById('cc-icon-box'); if(box) box.innerHTML=_ccIconRows();
  // Cycle Theme 페이지: cc-accent-box 는 Cycle 항목만 렌더
  var box2=document.getElementById('cc-accent-box'); if(box2) box2.innerHTML=_ccAccentRows(_CC_CYCLE_ITEMS);
  // Reports Theme 페이지: rp-icon-box + rp-accent-box
  var box3=document.getElementById('rp-icon-box'); if(box3) box3.innerHTML=_rpIconRows();
  var box4=document.getElementById('rp-accent-box'); if(box4) box4.innerHTML=_ccAccentRows(_CC_REPORTS_ITEMS);
}
function _ccAccentRows(items){
  var list = items || _CC_ITEMS;
  return list.map(function(it){
    var cur=_ccAccentGet(it.key);
    var bold=_ccBoldGet(it.key);
    var fsize=_ccFontSizeGet(it.key);
    var ff=_ccFontFamilyGet(it.key);
    var _defFn=_rcDefaultFontName();
    var sw=_RC_ACCENT_PRESETS.map(function(c){
      var on=(String(c).toLowerCase()===String(cur).toLowerCase());
      return '<div onclick="_ccAccentSet(\''+it.key+'\',\''+c+'\')" title="'+c+'" style="width:22px;height:22px;border-radius:6px;background:'+c+';cursor:pointer;box-shadow:'+(on?'0 0 0 2px var(--bg2),0 0 0 4px '+c:'inset 0 0 0 1px rgba(0,0,0,0.10)')+';"></div>';
    }).join('');
    var boldBtn='<button onclick="_ccBoldToggle(\''+it.key+'\')" title="글씨 굵게" style="display:inline-flex;align-items:center;gap:5px;font-size:11px;padding:5px 11px;border:1px solid '+(bold?'#e8820c':'var(--border)')+';border-radius:7px;background:'+(bold?'color-mix(in srgb,#e8820c 12%,var(--bg2))':'var(--bg2)')+';color:'+(bold?'#e8820c':'var(--text2)')+';cursor:pointer;font-weight:700;flex-shrink:0;"><i class="ti ti-bold" style="font-size:14px;"></i>굵게 '+(bold?'ON':'OFF')+'</button>';
    var sizeCtl='<div title="글씨 크기(px)" style="display:flex;align-items:center;gap:4px;flex-shrink:0;border:1px solid var(--border);border-radius:8px;padding:4px 6px;background:var(--bg2);min-height:34px;">'
      +'<i class="ti ti-text-size" style="font-size:16px;color:var(--text2);margin-right:2px;"></i>'
      +'<button onclick="_ccFontSizeStep(\''+it.key+'\',-0.5)" title="작게" style="width:26px;height:26px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);color:var(--text2);cursor:pointer;font-size:16px;font-weight:800;padding:0;display:flex;align-items:center;justify-content:center;line-height:1;">−</button>'
      +'<input type="number" min="9" max="20" step="0.5" value="'+fsize+'" onchange="_ccFontSizeSet(\''+it.key+'\',this.value)" style="width:44px;font-size:14px;font-weight:700;border:none;background:transparent;color:var(--text);outline:none;text-align:center;-moz-appearance:textfield;">'
      +'<button onclick="_ccFontSizeStep(\''+it.key+'\',0.5)" title="크게" style="width:26px;height:26px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);color:var(--text2);cursor:pointer;font-size:16px;font-weight:800;padding:0;display:flex;align-items:center;justify-content:center;line-height:1;">+</button>'
      +'<span style="font-size:11.5px;color:var(--text3);margin-left:2px;">px</span>'
    +'</div>';
    var ffOpts=_RC_FONT_OPTIONS.map(function(o){
      var lbl=o.value===''?('기본 · '+_defFn):o.label;
      return '<option value="'+String(o.value).replace(/"/g,'&quot;')+'"'+(o.value===ff?' selected':'')+'>'+lbl+'</option>';
    }).join('');
    var fontCtl='<label title="폰트 종류" style="display:flex;align-items:center;gap:6px;flex-shrink:0;border:1px solid var(--border);border-radius:8px;padding:4px 8px;background:var(--bg2);min-height:34px;">'
      +'<i class="ti ti-typography" style="font-size:15px;color:var(--text2);"></i>'
      +'<select onchange="_ccFontFamilySet(\''+it.key+'\',this.value)" style="font-size:12.5px;font-weight:600;border:none;background:transparent;color:var(--text);outline:none;cursor:pointer;min-width:140px;">'+ffOpts+'</select>'
    +'</label>';
    return '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border:1px solid var(--border);border-radius:10px;background:var(--bg2);margin-bottom:8px;flex-wrap:wrap;">'
      +'<div style="width:170px;flex-shrink:0;"><div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:2px;">'+it.label+'</div><div style="font-size:10.5px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+it.sample(cur,bold,fsize,ff)+'</div></div>'
      +'<div style="display:flex;gap:5px;flex-shrink:0;">'+sw+'</div>'
      +'<label style="display:flex;align-items:center;gap:6px;cursor:pointer;flex-shrink:0;"><input type="color" value="'+cur+'" oninput="_ccAccentSet(\''+it.key+'\',this.value)" style="width:30px;height:26px;border:1px solid var(--border);border-radius:6px;padding:0;background:none;cursor:pointer;"><span style="font-size:11px;color:var(--text2);">직접</span></label>'
      +sizeCtl
      +fontCtl
      +boldBtn
      +'<button onclick="_ccAccentReset(\''+it.key+'\');_ccBoldReset(\''+it.key+'\');_ccFontSizeReset(\''+it.key+'\')" style="font-size:11px;padding:5px 10px;border:1px solid var(--border);border-radius:7px;background:var(--bg2);color:var(--text2);cursor:pointer;font-weight:600;flex-shrink:0;">기본값</button>'
    +'</div>';
  }).join('');
}
function _ccIconRows(){
  return _ccIconRow('ctMgroup','Cycle Tree · 모델그룹','LGU+_E57xxRL · E5724RL')
    +_ccIconRow('ctModel','Cycle Tree · 모델','E5724RL')
    +_ccIconRow('ctVgroup','Cycle Tree · 버전그룹','R100')
    +_ccIconRow('ctVersion','Cycle Tree · 사이클(버전)','R101_2026_06_26');
}
function _ccIconRow(kind, label, sampleText){
  var cur=_ccIconGet(kind);
  var _presets=(_CC_ICON_PRESETS_EXT&&_CC_ICON_PRESETS_EXT[kind])||_RC_ICON_PRESETS[kind]||[];
  var picks=_presets.map(function(ic){
    var on=(ic===cur.ic);
    return '<button onclick="_ccIconSet(\''+kind+'\',\''+ic+'\',null)" title="'+ic+'" style="width:32px;height:32px;border:1px solid '+(on?cur.color:'var(--border)')+';border-radius:7px;background:'+(on?'color-mix(in srgb,'+cur.color+' 12%,var(--bg2))':'var(--bg2)')+';color:'+cur.color+';cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="ti '+ic+'" style="font-size:16px;"></i></button>';
  }).join('');
  var sampleSize=Math.max(10, Math.min(20, cur.size||15));
  return '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border:1px solid var(--border);border-radius:10px;background:var(--bg2);margin-bottom:8px;flex-wrap:wrap;">'
    +'<div style="width:170px;flex-shrink:0;">'
      +'<div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:2px;">'+label+'</div>'
      +'<div style="font-size:11px;color:var(--text3);display:flex;align-items:center;gap:6px;"><i class="ti '+cur.ic+'" style="color:'+cur.color+';font-size:'+sampleSize+'px;"></i><span>'+sampleText+'</span></div>'
    +'</div>'
    +'<div style="display:flex;gap:5px;flex-wrap:wrap;flex:1;min-width:280px;">'+picks+'</div>'
    +'<label title="아이콘 색" style="display:flex;align-items:center;gap:6px;cursor:pointer;flex-shrink:0;">'
      +'<input type="color" value="'+cur.color+'" oninput="_ccIconSet(\''+kind+'\',null,this.value)" style="width:34px;height:30px;border:1px solid var(--border);border-radius:6px;padding:0;background:none;cursor:pointer;">'
      +'<span style="font-size:11.5px;color:var(--text2);">색</span>'
    +'</label>'
    +'<div title="아이콘 크기 (px)" style="display:flex;align-items:center;gap:2px;flex-shrink:0;border:1px solid var(--border);border-radius:7px;background:var(--bg2);padding:2px;">'
      +'<button onclick="_ccIconSet(\''+kind+'\',null,null,'+(cur.size-1)+')" title="크기 -1" style="width:24px;height:26px;border:none;background:transparent;color:var(--text2);cursor:pointer;font-size:14px;font-weight:700;border-radius:5px;" onmouseenter="this.style.background=\'var(--bg3)\'" onmouseleave="this.style.background=\'transparent\'">−</button>'
      +'<input type="number" min="8" max="48" value="'+cur.size+'" oninput="_ccIconSet(\''+kind+'\',null,null,this.value)" style="width:38px;height:26px;text-align:center;border:none;background:transparent;color:var(--text);font-size:12px;font-weight:700;padding:0;outline:none;">'
      +'<button onclick="_ccIconSet(\''+kind+'\',null,null,'+(cur.size+1)+')" title="크기 +1" style="width:24px;height:26px;border:none;background:transparent;color:var(--text2);cursor:pointer;font-size:14px;font-weight:700;border-radius:5px;" onmouseenter="this.style.background=\'var(--bg3)\'" onmouseleave="this.style.background=\'transparent\'">+</button>'
      +'<span style="font-size:10.5px;color:var(--text3);padding:0 4px 0 2px;">px</span>'
    +'</div>'
    +'<button onclick="_ccIconReset(\''+kind+'\')" style="font-size:11.5px;padding:6px 12px;border:1px solid var(--border);border-radius:7px;background:var(--bg2);color:var(--text2);cursor:pointer;font-weight:600;flex-shrink:0;">기본값</button>'
  +'</div>';
}
// Cycle Color 페이지 렌더
function renderCycleColor(){
  var el=document.getElementById('cycle-color-body'); if(!el) return;
  el.innerHTML='<div style="font-size:13px;font-weight:700;color:var(--text2);margin-bottom:6px;">아이콘 (폴더 · 요구사항)</div>'
    +'<div style="font-size:11.5px;color:var(--text3);margin-bottom:13px;">Cycle 화면 아이콘 모양과 색.</div>'
    +'<div id="cc-icon-box" style="margin-bottom:22px;">'+_ccIconRows()+'</div>'
    +'<div style="font-size:13px;font-weight:700;color:var(--text2);margin-bottom:6px;">Cycle 강조 색</div>'
    +'<div style="font-size:11.5px;color:var(--text3);margin-bottom:13px;">Cycle 트리(모델그룹·모델·버전그룹·사이클) 항목별 글자 색·크기·굵기·폰트입니다.</div>'
    +'<div id="cc-accent-box" style="max-width:none;margin-bottom:22px;">'+_ccAccentRows(_CC_CYCLE_ITEMS)+'</div>'
    +'<div style="padding:14px 16px;background:var(--bg3);border:1px solid var(--border);border-radius:10px;font-size:12.5px;color:var(--text2);display:flex;align-items:center;gap:8px;"><i class="ti ti-info-circle" style="color:#e8820c;font-size:16px;"></i>선택 즉시 저장되어 다음 접속에도 유지됩니다. Cycle 화면에만 적용됩니다. (Reports 관련 설정은 Reports Theme 페이지에서 관리)</div>';
}
// Reports Theme 페이지 렌더 — rpt* 항목 (Cycle Tree + KPI/Rollup) 표시
function renderReportsColor(){
  var el=document.getElementById('reports-color-body'); if(!el) return;
  el.innerHTML='<div style="font-size:13px;font-weight:700;color:var(--text2);margin-bottom:6px;">Cycle Tree 아이콘</div>'
    +'<div style="font-size:11.5px;color:var(--text3);margin-bottom:13px;">Test Report 좌측 Cycle Tree (모델그룹·모델·버전) 아이콘 모양·색.</div>'
    +'<div id="rp-icon-box" style="margin-bottom:22px;">'+_rpIconRows()+'</div>'
    +'<div style="font-size:13px;font-weight:700;color:var(--text2);margin-bottom:6px;">텍스트 · KPI · Rollup 강조 색</div>'
    +'<div style="font-size:11.5px;color:var(--text3);margin-bottom:13px;">Cycle Tree 각 레벨 텍스트와 KPI 카드·Rollup 표 항목별 글자 색·크기·굵기·폰트입니다.</div>'
    +'<div id="rp-accent-box" style="max-width:none;margin-bottom:22px;">'+_ccAccentRows(_CC_REPORTS_ITEMS)+'</div>'
    +'<div style="padding:14px 16px;background:var(--bg3);border:1px solid var(--border);border-radius:10px;font-size:12.5px;color:var(--text2);display:flex;align-items:center;gap:8px;"><i class="ti ti-info-circle" style="color:#2d6fd4;font-size:16px;"></i>선택 즉시 저장되어 다음 접속에도 유지됩니다. Test Report 화면에만 적용됩니다.</div>';
}
function _rpIconRows(){
  return _ccIconRow('rptTreeMgroup','Cycle Tree · 모델그룹','LGU+_E57xxRL')
    +_ccIconRow('rptTreeModel','Cycle Tree · 모델','E5724RL')
    +_ccIconRow('rptTreeVersion','Cycle Tree · 버전','R101_2026_06_26');
}
// 외부 화면에서 사용할 style 헬퍼
function ccFF(key){ return _ccFontFamilyGet(key); }
function ccFFStyle(key){ var v=_ccFontFamilyGet(key); return v?('font-family:'+v+';'):''; }
function ccFS(key){ return _ccFontSizeGet(key)+'px'; }
function ccFW(key){ return _ccBoldGet(key)?'700':'400'; }
function ccColor(key){ return _ccAccentGet(key); }
function ccIcon(kind){ return _ccIconGet(kind); }
function _rcIconSection(){
  return '<div style="font-size:13px;font-weight:700;color:var(--text2);margin-bottom:6px;">아이콘 (폴더 · 요구사항)</div>'
    +'<div style="font-size:11.5px;color:var(--text3);margin-bottom:13px;">Req &amp; Coverage 화면에 표시되는 폴더/REQ 아이콘 모양과 색을 바꿉니다.</div>'
    +'<div id="rc-icon-box" style="margin-bottom:22px;">'+_rcIconRows()+'</div>';
}
function _rcIconRows(){
  return _rcIconRow('folder','폴더','시스템 시험')
    +_rcIconRow('req','요구사항','ENV-001 · 시스템 정보 조회');
}
function _rcIconRow(kind, label, sampleText){
  var cur=_rcIconGet(kind);
  var picks=(_RC_ICON_PRESETS[kind]||[]).map(function(ic){
    var on=(ic===cur.ic);
    return '<button onclick="_rcIconSet(\''+kind+'\',\''+ic+'\',null)" title="'+ic+'" style="width:32px;height:32px;border:1px solid '+(on?cur.color:'var(--border)')+';border-radius:7px;background:'+(on?'color-mix(in srgb,'+cur.color+' 12%,var(--bg2))':'var(--bg2)')+';color:'+cur.color+';cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="ti '+ic+'" style="font-size:16px;"></i></button>';
  }).join('');
  var sampleSize=Math.max(10, Math.min(20, cur.size));   // 미리보기용 (아이콘 리스트 셀 안에서 너무 튀지 않도록 축소 표시)
  return '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border:1px solid var(--border);border-radius:10px;background:var(--bg2);margin-bottom:8px;flex-wrap:wrap;">'
    +'<div style="width:170px;flex-shrink:0;">'
      +'<div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:2px;">'+label+'</div>'
      +'<div style="font-size:11px;color:var(--text3);display:flex;align-items:center;gap:6px;"><i class="ti '+cur.ic+'" style="color:'+cur.color+';font-size:'+cur.size+'px;"></i><span>'+sampleText+'</span></div>'
    +'</div>'
    +'<div style="display:flex;gap:5px;flex-wrap:wrap;flex:1;min-width:280px;">'+picks+'</div>'
    +'<label title="아이콘 색" style="display:flex;align-items:center;gap:6px;cursor:pointer;flex-shrink:0;">'
      +'<input type="color" value="'+cur.color+'" oninput="_rcIconSet(\''+kind+'\',null,this.value)" style="width:34px;height:30px;border:1px solid var(--border);border-radius:6px;padding:0;background:none;cursor:pointer;">'
      +'<span style="font-size:11.5px;color:var(--text2);">색</span>'
    +'</label>'
    // 크기 조절 (- / 숫자 / +)
    +'<div title="아이콘 크기 (px)" style="display:flex;align-items:center;gap:2px;flex-shrink:0;border:1px solid var(--border);border-radius:7px;background:var(--bg2);padding:2px;">'
      +'<button onclick="_rcIconSet(\''+kind+'\',null,null,'+(cur.size-1)+')" title="크기 -1" style="width:24px;height:26px;border:none;background:transparent;color:var(--text2);cursor:pointer;font-size:14px;font-weight:700;border-radius:5px;" onmouseenter="this.style.background=\'var(--bg3)\'" onmouseleave="this.style.background=\'transparent\'">−</button>'
      +'<input type="number" min="8" max="48" value="'+cur.size+'" oninput="_rcIconSet(\''+kind+'\',null,null,this.value)" style="width:38px;height:26px;text-align:center;border:none;background:transparent;color:var(--text);font-size:12px;font-weight:700;padding:0;outline:none;">'
      +'<button onclick="_rcIconSet(\''+kind+'\',null,null,'+(cur.size+1)+')" title="크기 +1" style="width:24px;height:26px;border:none;background:transparent;color:var(--text2);cursor:pointer;font-size:14px;font-weight:700;border-radius:5px;" onmouseenter="this.style.background=\'var(--bg3)\'" onmouseleave="this.style.background=\'transparent\'">+</button>'
      +'<span style="font-size:10.5px;color:var(--text3);padding:0 4px 0 2px;">px</span>'
    +'</div>'
    +'<button onclick="_rcIconReset(\''+kind+'\')" style="font-size:11.5px;padding:6px 12px;border:1px solid var(--border);border-radius:7px;background:var(--bg2);color:var(--text2);cursor:pointer;font-weight:600;flex-shrink:0;">기본값</button>'
  +'</div>';
}
function _rcAccentRefreshAll(){ var box=document.getElementById('rc-icon-box'); if(box) box.innerHTML=_rcIconRows(); if(typeof _rcAccentRefresh==='function') _rcAccentRefresh(); }
function renderThemeSettings(){
  const el=document.getElementById('theme-settings-body'); if(!el) return;
  const mode=_getThemeMode();
  const ak=localStorage.getItem('uta_accent')||'blue';
  const dark=document.body.classList.contains('dark');
  const modeBtn=(m,ic,label,desc)=>'<div onclick="setThemeMode(\''+m+'\')" style="flex:1;max-width:140px;cursor:pointer;border:2px solid '+(mode===m?'var(--blue)':'var(--border)')+';background:'+(mode===m?'color-mix(in srgb,var(--blue) 8%,var(--bg2))':'var(--bg2)')+';border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:4px;transition:all .15s;">'
    +'<i class="ti '+ic+'" style="font-size:18px;color:'+(mode===m?'var(--blue)':'var(--text2)')+';"></i>'
    +'<div style="font-size:12px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:4px;">'+label+(mode===m?'<i class="ti ti-circle-check-filled" style="color:var(--blue);font-size:13px;"></i>':'')+'</div>'
    +'<div style="font-size:10.5px;color:var(--text3);">'+desc+'</div></div>';
  const swatch=(a)=>{const c=dark?a.dark:a.light; const sel=ak===a.key; return '<div onclick="setAccent(\''+a.key+'\')" title="'+a.name+'" style="cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:7px;">'
    +'<div style="width:44px;height:44px;border-radius:50%;background:'+c+';border:3px solid '+(sel?'var(--text)':'transparent')+';box-shadow:0 0 0 1px var(--border);display:flex;align-items:center;justify-content:center;transition:all .12s;">'+(sel?'<i class="ti ti-check" style="color:#fff;font-size:19px;"></i>':'')+'</div>'
    +'<div style="font-size:11px;color:'+(sel?'var(--text)':'var(--text3)')+';font-weight:'+(sel?'700':'500')+';">'+a.name+'</div></div>';};
  el.innerHTML='<div style="max-width:none;">'
    +'<div style="font-size:13px;font-weight:700;color:var(--text2);margin-bottom:11px;">화면 모드</div>'
    +'<div style="display:flex;gap:8px;margin-bottom:20px;">'+modeBtn('light','ti-sun','라이트','밝은 흰색 화면')+modeBtn('dark','ti-moon','다크','어두운 화면')+modeBtn('system','ti-device-desktop','시스템','OS 설정을 따라감')+'</div>'
    +'<div style="margin-bottom:24px;padding:14px 16px;background:var(--bg3);border:1px solid var(--border);border-radius:10px;font-size:12.5px;color:var(--text2);display:flex;align-items:center;gap:10px;"><i class="ti ti-palette" style="color:#7c3aed;font-size:18px;"></i><span>Req & Coverage 화면의 <b>글자 색·크기·굵기·폰트</b> 는 이제 상단 메뉴 <b>Tests › Tests Color</b> 페이지에서 설정합니다.</span><a href="#" onclick="showPage(\'tests-color\');return false;" style="margin-left:auto;font-size:12px;font-weight:700;color:#7c3aed;text-decoration:none;padding:5px 12px;border:1px solid #7c3aed;border-radius:7px;">이동 <i class="ti ti-arrow-right" style="font-size:12px;"></i></a></div>'
    +((typeof isAdmin==='function'&&isAdmin())?(
        '<div style="font-size:13px;font-weight:700;color:var(--text2);margin-bottom:12px;">로고 (브랜딩)</div>'
        +'<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:30px;padding:16px;border:1px solid var(--border);border-radius:10px;background:var(--bg2);">'
          +'<div style="width:64px;height:64px;border-radius:10px;border:1px dashed var(--border);background:var(--bg3);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;"><img id="brand-logo-preview" src="" alt="" style="max-width:100%;max-height:100%;object-fit:contain;display:none;"><i id="brand-logo-empty" class="ti ti-photo" style="font-size:26px;color:var(--text3);"></i></div>'
          +'<div style="flex:1;min-width:200px;">'
            +'<div style="font-size:12.5px;color:var(--text2);margin-bottom:8px;">상단 <b>ubiQuoss-TOP</b> 앞에 표시될 로고를 등록합니다. (PNG·JPG·SVG, 3MB 이하)</div>'
            +'<input type="file" id="brand-logo-file" accept="image/*" onchange="brandLogoPick(event)" style="display:none;">'
            +'<button onclick="document.getElementById(\'brand-logo-file\').click()" style="font-size:13px;font-weight:700;padding:8px 16px;border:none;border-radius:8px;background:#2d6fd4;color:#fff;cursor:pointer;margin-right:8px;"><i class="ti ti-upload"></i> 로고 등록</button>'
            +'<button onclick="brandLogoRemove()" style="font-size:13px;font-weight:700;padding:8px 14px;border:1px solid var(--border);border-radius:8px;background:var(--bg2);color:var(--text2);cursor:pointer;"><i class="ti ti-trash"></i> 제거</button>'
          +'</div>'
        +'</div>'
        +'<div style="font-size:13px;font-weight:700;color:var(--text2);margin-bottom:12px;">브랜딩 네임 (상단 제목)</div>'
        +'<div style="margin-bottom:30px;padding:16px;border:1px solid var(--border);border-radius:10px;background:var(--bg2);display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end;">'
          +'<div><div style="font-size:11px;color:var(--text3);margin-bottom:4px;">표시 텍스트 <span style="color:var(--text3);">(강조할 글자는 [ ]로)</span></div><input id="brand-name-text" placeholder="ubi[Q]uoss-TOP" title="강조하고 싶은 글자를 대괄호로 감싸세요. 예: ubi[Q]uoss-TOP → Q만 강조색" style="width:210px;font-size:13px;padding:7px 10px;border:1px solid var(--border);border-radius:7px;outline:none;"></div>'
          +'<div><div style="font-size:11px;color:var(--text3);margin-bottom:4px;">글자 크기</div><input id="brand-name-size" placeholder="예: 18px" style="width:90px;font-size:13px;padding:7px 10px;border:1px solid var(--border);border-radius:7px;outline:none;"></div>'
          +'<div><div style="font-size:11px;color:var(--text3);margin-bottom:4px;">기본 색</div><input type="color" id="brand-name-color" value="#1c2942" style="width:46px;height:36px;border:1px solid var(--border);border-radius:7px;cursor:pointer;background:#fff;padding:2px;"></div>'
          +'<div><div style="font-size:11px;color:var(--text3);margin-bottom:4px;">강조 색 [ ]</div><input type="color" id="brand-name-accent" value="#e53e5a" style="width:46px;height:36px;border:1px solid var(--border);border-radius:7px;cursor:pointer;background:#fff;padding:2px;"></div>'
          +'<div><div style="font-size:11px;color:var(--text3);margin-bottom:4px;">폰트</div><select id="brand-name-font" style="font-size:13px;padding:7px 9px;border:1px solid var(--border);border-radius:7px;cursor:pointer;">'+['','Segoe UI, system-ui, sans-serif','Pretendard, sans-serif','Noto Sans KR, sans-serif','Malgun Gothic, sans-serif','Georgia, serif','Consolas, monospace'].map(function(f){return '<option value="'+f+'">'+(f?f.split(',')[0]:'(기본)')+'</option>';}).join('')+'</select></div>'
          +'<button onclick="_brandSaveName()" style="font-size:13px;font-weight:700;padding:8px 16px;border:none;border-radius:8px;background:#00a872;color:#fff;cursor:pointer;"><i class="ti ti-device-floppy"></i> 적용·저장</button>'
          +'<button onclick="_brandResetName()" style="font-size:13px;font-weight:700;padding:8px 14px;border:1px solid var(--border);border-radius:8px;background:var(--bg2);color:var(--text2);cursor:pointer;">기본값</button>'
        +'</div>'
      ):'')
    +'<div style="padding:14px 16px;background:var(--bg3);border:1px solid var(--border);border-radius:10px;font-size:12.5px;color:var(--text2);display:flex;align-items:center;gap:8px;"><i class="ti ti-info-circle" style="color:var(--blue);font-size:16px;"></i>선택한 모드와 색은 자동 저장되어 다음 접속에도 유지됩니다.</div>'
    +'</div>';
  if(typeof isAdmin==='function'&&isAdmin()) _brandLoadPreview();
}
async function _brandLoadPreview(){
  try{ const d=await (await fetch('/api/branding')).json(); _brandSetPreview(d&&d.logo?d.logo:'');
    const set=(id,v)=>{ const el=document.getElementById(id); if(el&&v) el.value=v; };
    set('brand-name-text',d&&d.name_text); set('brand-name-size',d&&d.name_size); set('brand-name-font',d&&d.name_font);
    const c=document.getElementById('brand-name-color'); if(c&&d&&d.name_color) c.value=d.name_color;
    const ac=document.getElementById('brand-name-accent'); if(ac&&d&&d.name_accent_color) ac.value=d.name_accent_color;
  }catch(e){}
}
function _brandNameHtml(text, accent){
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return esc(text).replace(/\[([^\]]+)\]/g, function(_,m){ return '<span style="color:'+(accent||'#e53e5a')+';font-weight:900;font-size:1.18em;">'+m+'</span>'; });
}
function _applyBrandName(d){ const txt=document.querySelector('.tb-logo-text'); if(!txt)return; if(d.name_text)txt.innerHTML=_brandNameHtml(d.name_text,d.name_accent_color); txt.style.fontSize=d.name_size||''; txt.style.color=d.name_color||''; txt.style.fontFamily=d.name_font||''; }
async function _brandSaveName(){
  const g=id=>(document.getElementById(id)||{}).value||'';
  const payload={name_text:g('brand-name-text').trim(), name_size:g('brand-name-size').trim(), name_color:g('brand-name-color'), name_font:g('brand-name-font'), name_accent_color:g('brand-name-accent')};
  try{ await userApi('POST','/api/branding',payload); _applyBrandName(payload); showToast('✅ 브랜딩 네임이 저장되었습니다'); }
  catch(e){ showToast('저장 실패: '+((e&&e.message)||e)); }
}
async function _brandResetName(){
  try{ await userApi('POST','/api/branding',{name_text:'',name_size:'',name_color:'',name_font:'',name_accent_color:''}); showToast('기본값으로 초기화 — 새로고침합니다'); setTimeout(()=>location.reload(),700); }
  catch(e){ showToast('실패: '+((e&&e.message)||e)); }
}
function _brandSetPreview(src){
  const img=document.getElementById('brand-logo-preview'), em=document.getElementById('brand-logo-empty');
  if(img){ if(src){ img.src=src; img.style.display=''; if(em) em.style.display='none'; } else { img.removeAttribute('src'); img.style.display='none'; if(em) em.style.display=''; } }
}
function brandLogoPick(ev){
  const f=ev.target.files&&ev.target.files[0]; if(!f) return;
  if(f.size>3*1024*1024){ showToast('이미지가 너무 큽니다 (3MB 이하)'); ev.target.value=''; return; }
  const r=new FileReader();
  r.onload=function(){ _brandSave(String(r.result||'')); };
  r.readAsDataURL(f);
  ev.target.value='';
}
async function brandLogoRemove(){
  if(!confirm('등록된 로고를 제거할까요?')) return;
  _brandSave('');
}
async function _brandSave(logo){
  try{
    await userApi('POST','/api/branding/logo',{logo:logo});
    _brandSetPreview(logo);
    const hdr=document.getElementById('tb-logo-img');
    if(hdr){ if(logo){ hdr.src=logo; hdr.style.display=''; } else { hdr.removeAttribute('src'); hdr.style.display='none'; } }
    showToast(logo?'✅ 로고가 등록되었습니다':'로고가 제거되었습니다');
  }catch(e){ showToast('저장 실패: '+((e&&e.message)||e)); }
}

// ── 계측기 대시보드 렌더링 ──
function renderMeterDash(){
  const meters=devices.filter(d=>{
    const g=(d.group||'').toUpperCase();
    const m=(d.model||'').toUpperCase();
    return g==='계측기'||g==='METER'||m.includes('IXIA')||m.includes('SPIRENT')||m.includes('N2X')||m.includes('STC');
  });
  const conn=meters.filter(d=>d.status==='connected').length;
  const disc=meters.length-conn;
  const el=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  el('ms-total',meters.length);
  el('ms-disc',disc);

  // 계측기별 badge 업데이트
  meters.forEach(d=>{
    const m=(d.model||'').toUpperCase();
    const isConn=d.status==='connected';
    let badgeId='';
    if(m.includes('N2X')) badgeId='n2x-badge';
    else if(m.includes('IXNETWORK')||m.includes('IXNETWORKS')) badgeId='ixn-badge';
    else if(m.includes('SPIRENT')||m.includes('STC')) badgeId='stc-badge';
    if(badgeId){
      const badge=document.getElementById(badgeId);
      if(badge){
        badge.textContent=isConn?'● 연결됨':'● 미연결';
        badge.className='mc-conn '+(isConn?'on':'off');
      }
    }
    // IP 업데이트
    let ipId='';
    if(m.includes('N2X')) ipId='n2x-ip';
    else if(m.includes('IXNETWORK')||m.includes('IXNETWORKS')) ipId='ixn-ip';
    else if(m.includes('SPIRENT')||m.includes('STC')) ipId='stc-ip';
    if(ipId){const e=document.getElementById(ipId);if(e)e.textContent=d.ip;}
  });
}

// ── 대시보드 탭 전환 ──
