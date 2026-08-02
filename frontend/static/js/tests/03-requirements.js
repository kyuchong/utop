function req2RenderTree(){
  const tree=document.getElementById('req2-folder-tree');
  if(!tree) return;
  // 빈 여백 우클릭 → 현재 선택된 폴더(현재 경로) 기준으로 메뉴 표시 (폴더 아이템 우클릭은 각자 stopPropagation 처리)
  tree.oncontextmenu=function(e){ e.preventDefault(); req2ShowCtx(e, (typeof req2SelFolderId!=='undefined'&&req2SelFolderId)?req2SelFolderId:null, true); };
  if(!reqFolders.length){
    tree.innerHTML='<div class="detail-empty" style="height:120px;"><i class="ti ti-folder"></i><span style="font-size:12.5px;">폴더 없음</span></div>';
    return;
  }
  // 첫 로드 시 루트 폴더 자동 펼침
  if(req2ExpandedIds.size===0){
    reqFolders.filter(f=>!f.parent).forEach(f=>req2ExpandedIds.add(f.id));
  }
  const roots=reqFolders.filter(f=>!f.parent);
  tree.innerHTML=roots.map(f=>req2FolderHtml(f)).join('');
}

function req2FolderHtml(f, depth=0){
  const children=reqFolders.filter(c=>c.parent===f.id).sort((a,b)=>(a.order||0)-(b.order||0));
  const getAllDescendantFolderIds=(fid)=>{
    const ch=reqFolders.filter(c=>c.parent===fid).map(c=>c.id);
    return [fid,...ch.flatMap(getAllDescendantFolderIds)];
  };
  const allFolderIds=getAllDescendantFolderIds(f.id);
  const reqCount=reqList.filter(r=>allFolderIds.includes(r.folder)).length;
  const open=req2ExpandedIds.has(f.id);
  const sel=req2SelFolderId===f.id;
  const dotColor=f.color==='blue'?'var(--blue)':f.color==='green'?'var(--green)':f.color==='red'?'var(--red)':'var(--yellow)';
  const childrenHtml=children.length?`<div class="req2-folder-children" ${open?'':'style="display:none;"'} id="req2-fc-${f.id}">${children.map(c=>req2FolderHtml(c,depth+1)).join('')}</div>`:'';
  const indent=depth*14;
  return `<div class="req2-folder" id="req2-fd-${f.id}">
    <!-- 위 드롭존: 이 폴더 앞에 삽입 -->
    <div style="height:6px;border-radius:2px;margin:1px 0;transition:all 0.12s;"
      ondragover="event.preventDefault();event.stopPropagation();this.style.background='var(--blue)';this.style.height='10px';"
      ondragleave="this.style.background='';this.style.height='6px';"
      ondrop="event.stopPropagation();req2DropBetween(event,'${f.id}','before');this.style.background='';this.style.height='6px';"></div>
    <!-- 폴더 아이템: draggable -->
    <div class="req2-folder-item${sel?' sel':''}" id="req2-fi-${f.id}"
      draggable="true"
      style="padding-left:${10+indent}px;"
      ondragstart="req2DragStart(event,'folder','${f.id}')"
      ondragover="event.preventDefault();event.stopPropagation();req2DragOver(event,'${f.id}')"
      ondragleave="event.stopPropagation();req2DragLeave(event,'${f.id}')"
      ondrop="event.stopPropagation();req2Drop(event,'${f.id}')"
      onclick="req2SelectFolder('${f.id}')"
      oncontextmenu="req2ShowCtx(event,'${f.id}')"
      ondblclick="req2ToggleExpand('${f.id}')">
      <i class="ti ti-grip-vertical" style="font-size:14px;color:var(--text3);cursor:grab;flex-shrink:0;" aria-hidden="true"></i>
      ${children.length
        ?`<i class="ti ti-chevron-right" style="font-size:14px;color:var(--text3);transition:transform 0.15s;cursor:pointer;padding:2px;${open?'transform:rotate(90deg)':''}" id="req2-arr-${f.id}" onclick="event.stopPropagation();req2ToggleExpand('${f.id}')"></i>`
        :'<span style="width:18px;flex-shrink:0;"></span>'}
      <i class="ti ti-folder${open?'-open':''}" style="font-size:17px;color:${dotColor};flex-shrink:0;" id="req2-fi-icon-${f.id}" aria-hidden="true"></i>
      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${f.name}</span>
      <span style="font-size:12.5px;font-weight:600;color:${reqCount>0?'var(--blue)':'var(--text3)'};flex-shrink:0;min-width:20px;text-align:right;">${reqCount>0?reqCount:''}</span>
    </div>
    ${childrenHtml}
  </div>`;
}

function req2ToggleExpand(fid){
  if(req2ExpandedIds.has(fid)){
    req2ExpandedIds.delete(fid);
  } else {
    req2ExpandedIds.add(fid);
  }
  const fc=document.getElementById('req2-fc-'+fid);
  const arr=document.getElementById('req2-arr-'+fid);
  const icon=document.getElementById('req2-fi-icon-'+fid);
  if(fc) fc.style.display=req2ExpandedIds.has(fid)?'':'none';
  if(arr) arr.style.transform=req2ExpandedIds.has(fid)?'rotate(90deg)':'';
  if(icon) icon.className='ti ti-folder'+(req2ExpandedIds.has(fid)?'-open':'')+' ';
}

function req2SelectFolder(fid){
  req2SelFolderId=fid;
  sessionStorage.setItem('utop_last_req_folder', fid);
  req2ExpandedIds.add(fid);
  // 폴더 아이템 선택 표시
  document.querySelectorAll('.req2-folder-item').forEach(el=>el.classList.remove('sel'));
  const fi=document.getElementById('req2-fi-'+fid);
  if(fi) fi.classList.add('sel');
  // 폴더 열기
  const fc=document.getElementById('req2-fc-'+fid);
  if(fc) fc.style.display='';
  const arr=document.getElementById('req2-arr-'+fid);
  if(arr) arr.style.transform='rotate(90deg)';
  const icon=document.getElementById('req2-fi-icon-'+fid);
  if(icon) icon.className='ti ti-folder-open ';
  // 헤더 업데이트
  const folder=reqFolders.find(f=>f.id===fid);
  const reqs=reqList.filter(r=>r.folder===fid);
  const tcCount=reqs.reduce((s,r)=>s+(r.tc||[]).length,0);
  let scCount=0;
  reqs.forEach(r=>{try{const s=JSON.parse(r.scenarios||'[]');scCount+=Array.isArray(s)?s.length:0;}catch(e){}});
  // 하위 폴더 포함 전체 카운트
  const getAllDescFolderIds=(id)=>{const ch=reqFolders.filter(c=>c.parent===id).map(c=>c.id);return[id,...ch.flatMap(getAllDescFolderIds)];};
  const allIds=getAllDescFolderIds(fid);
  const totalReqs=reqList.filter(r=>allIds.includes(r.folder)).length;
  // 빵크럼(상위 폴더 경로) 생성
  const buildBreadcrumb=(id)=>{
    const parts=[];
    let cur=id;
    while(cur){
      const f=reqFolders.find(x=>x.id===cur);
      if(!f) break;
      parts.unshift(f.name);
      cur=f.parent;
    }
    return parts.join(' / ');
  };
  const breadcrumb=buildBreadcrumb(fid);
  const breadcrumbEl=document.getElementById('req2-folder-breadcrumb');
  if(breadcrumbEl) breadcrumbEl.textContent=breadcrumb;
  document.getElementById('req2-folder-stats').innerHTML=
    totalReqs!==reqs.length
      ? `<span style="color:var(--blue);font-weight:700;">REQ ${reqs.length}</span><span style="color:var(--text3);"> · 전체(하위) </span><span style="color:var(--blue);font-weight:700;">${totalReqs}</span><span style="color:var(--text3);"> · SC </span><span style="font-weight:700;">${scCount}</span><span style="color:var(--text3);"> · TC </span><span style="color:var(--blue);font-weight:700;">${tcCount}</span>`
      : `<span style="color:var(--blue);font-weight:700;">REQ ${reqs.length}</span><span style="color:var(--text3);"> · SC </span><span style="font-weight:700;">${scCount}</span><span style="color:var(--text3);"> · TC </span><span style="color:var(--blue);font-weight:700;">${tcCount}</span>`;
  const actions=document.getElementById('req2-main-actions');
  if(actions) actions.style.display='flex';
  req2Render();
}

// ── REQ 테이블 렌더 ──
function req2Render(){
  if(!req2SelFolderId) return;
  const wrap=document.getElementById('req2-table-wrap');
  if(!wrap) return;
  const q=req2SearchQ.toLowerCase();
  const fp=document.getElementById('req2-filter-priority')?.value||'all';
  const fs=document.getElementById('req2-filter-status')?.value||'all';
  // 하위 폴더 포함 모든 폴더 ID 수집
  const getAllDescFolderIds=(id)=>{
    const ch=reqFolders.filter(f=>f.parent===id).map(f=>f.id);
    return [id,...ch.flatMap(getAllDescFolderIds)];
  };
  const allFolderIds=getAllDescFolderIds(req2SelFolderId);
  let reqs=reqList.filter(r=>allFolderIds.includes(r.folder));
  if(q) reqs=reqs.filter(r=>(r.reqid||'').toLowerCase().includes(q)||(r.title||'').toLowerCase().includes(q));
  if(fp!=='all') reqs=reqs.filter(r=>req2Priority(r.priority)===fp);
  if(fs!=='all') reqs=reqs.filter(r=>r.status===fs);
  // 이름순 정렬
  reqs.sort((a,b)=>(a.reqid||'').localeCompare(b.reqid||''));

  if(!reqs.length){
    wrap.innerHTML='<div class="detail-empty" style="height:200px;"><i class="ti ti-clipboard-list"></i><span>REQ가 없습니다<br><small style="color:var(--text3);">상단 REQ 추가 버튼을 눌러 추가하세요</small></span></div>';
    return;
  }

  const rows=reqs.map(r=>{
    let scCount=0;
    try{const s=JSON.parse(r.scenarios||'[]');scCount=Array.isArray(s)?s.length:0;}catch(e){}
    const tcCount=(r.tc||[]).length;
    const expanded=req2ExpandedIds.has('req-'+r.id);
    const prioClass=req2PrioClass(req2Priority(r.priority));
    const staClass=req2StatusClass(r.status);
    const tags=(r.products||[]).map(p=>`<span class="req2-tag on" style="font-size:9px;padding:1px 5px;">${p}</span>`).join('');
    return `
    <tr id="req2-row-${r.id}" class="${expanded?'expanded':''}" style="background:#fff;" draggable="true" ondragstart="req2REQDragStart(event,'${r.id}')" title="드래그로 다른 폴더로 이동">
      <td style="width:32px;text-align:center;padding:7px 4px;">
        <input type="checkbox" ${req2SelIds.has(r.id)?'checked':''} style="cursor:pointer;accent-color:var(--blue);" onclick="event.stopPropagation();req2ToggleSel('${r.id}',this.checked)">
      </td>
      <td style="width:28px;text-align:center;padding:7px 4px;">
        <span onclick="req2ToggleRow('${r.id}')" style="cursor:pointer;color:var(--text3);font-size:12.5px;display:inline-block;transition:transform 0.15s;${expanded?'transform:rotate(90deg);color:var(--blue)':''}">▶</span>
      </td>
      <td style="font-size:11px;font-weight:700;color:var(--blue);white-space:nowrap;cursor:pointer;" onclick="req2ToggleRow('${r.id}')">${r.reqid}</td>
      <td style="max-width:320px;overflow:hidden;" onclick="req2ToggleRow('${r.id}')">
        <div id="req2-title-view-${r.id}"
          style="font-size:12.5px;font-weight:500;color:var(--text);cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
          title="더블클릭으로 제목 수정"
          ondblclick="event.stopPropagation();req2EditTitle('${r.id}')">${r.title}</div>
        <input id="req2-title-edit-${r.id}"
          style="display:none;font-size:12.5px;font-weight:500;width:100%;border:none;border-bottom:2px solid var(--green);background:transparent;outline:none;color:var(--text);padding:1px 2px;"
          onblur="req2SaveTitle('${r.id}',this.value)"
          onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape'){req2CancelTitle('${r.id}');}">
      </td>
      <td><span class="${prioClass}">${req2Priority(r.priority)}</span></td>
      <td><span class="${staClass}">${r.status||'DRAFT'}</span></td>
      <td class="req2-cat-cell" style="font-size:10px;">${tags}</td>
      <td style="text-align:center;font-size:12.5px;color:${scCount>0?'var(--text2)':'var(--text3);font-weight:400'};">${scCount}</td>
      <td style="text-align:center;font-size:12.5px;font-weight:600;color:${tcCount>0?'var(--blue)':'var(--text3);font-weight:400'};">${tcCount}</td>
      <td style="font-size:10px;color:var(--text3);white-space:nowrap;">${r.updated_at||r.created_at||''}</td>
      <td style="width:60px;text-align:center;white-space:nowrap;" onclick="event.stopPropagation()">
        <button onclick="req2OpenMoveREQModal('${r.id}')"
          style="background:none;border:none;cursor:pointer;color:var(--text3);padding:2px 3px;border-radius:4px;"
          onmouseenter="this.style.color='var(--blue)';this.style.background='rgba(45,111,212,0.08)'"
          onmouseleave="this.style.color='var(--text3)';this.style.background='none'"
          title="폴더 이동">
          <i class="ti ti-transfer" style="font-size:12.5px;" aria-hidden="true"></i>
        </button>
        <button onclick="req2DeleteREQ('${r.id}')"
          style="background:none;border:none;cursor:pointer;color:var(--text3);padding:2px 3px;border-radius:4px;"
          onmouseenter="this.style.color='var(--red)';this.style.background='rgba(229,62,90,0.08)'"
          onmouseleave="this.style.color='var(--text3)';this.style.background='none'"
          title="삭제">
          <i class="ti ti-trash" style="font-size:12.5px;" aria-hidden="true"></i>
        </button>
      </td>
    </tr>
    ${expanded?req2DetailHtml(r):''}`;
  }).join('');

  wrap.innerHTML=`
    <table class="req2-table">
      <thead>
        <tr>
          <th style="width:32px;"><input type="checkbox" onclick="req2ToggleAll(this)" style="cursor:pointer;accent-color:var(--blue);"></th>
          <th style="width:28px;"></th>
          <th>REQ ID</th>
          <th>Summary</th>
          <th>Priority</th>
          <th>Status</th>
          <th>Category</th>
          <th style="text-align:center;">SC</th>
          <th style="text-align:center;">TC</th>
          <th>Updated</th>
          <th style="width:32px;"></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <!-- 다중 선택 삭제 바 -->
    <div id="req2-bulk-bar" style="display:${req2SelIds.size>0?'flex':'none'};position:sticky;bottom:0;padding:10px 16px;background:#fff;border-top:2px solid rgba(229,62,90,0.3);align-items:center;gap:10px;box-shadow:0 -2px 8px rgba(0,0,0,0.08);">
      <i class="ti ti-checkbox" style="font-size:16px;color:var(--red);" aria-hidden="true"></i>
      <span style="font-size:12.5px;font-weight:600;color:var(--red);flex:1;" id="req2-sel-count">${req2SelIds.size}개 선택됨</span>
      <button onclick="req2BulkDelete()"
        style="font-size:12.5px;padding:6px 16px;border-radius:6px;border:1px solid rgba(229,62,90,0.5);background:rgba(229,62,90,0.1);color:var(--red);cursor:pointer;font-weight:500;display:flex;align-items:center;gap:5px;">
        <i class="ti ti-trash" aria-hidden="true"></i> 선택 삭제
      </button>
      <button onclick="req2ClearSel()"
        style="font-size:12.5px;padding:6px 12px;border-radius:6px;border:1px solid var(--border);background:var(--bg3);color:var(--text3);cursor:pointer;">
        취소
      </button>
    </div>`;
}

// ── REQ 인라인 상세 (탭) ──
function req2DetailHtml(r){
  const detailId='req2-detail-'+r.id;
  const tabId='req2-tab-'+r.id;
  let scCount=0;
  try{const s=JSON.parse(r.scenarios||'[]');scCount=Array.isArray(s)?s.length:0;}catch(e){}
  const tcCount=(r.tc||[]).length;
  // 현재 활성 탭
  const curTab=window['req2ActiveTab_'+r.id]||'details';
  return `<tr id="${detailId}" class="detail-row" style="background:var(--bg2);">
    <td colspan="11" style="padding:0;border-bottom:2px solid var(--border);">
      <!-- 탭 바 -->
      <div class="req2-tab-bar">
        <div class="req2-tab${curTab==='details'?' active':''}" onclick="req2SwitchTab('${r.id}','details')">
          <i class="ti ti-info-circle" aria-hidden="true"></i> Information
        </div>
        <div class="req2-tab${curTab==='scenario'?' active':''}" onclick="req2SwitchTab('${r.id}','scenario')">
          <i class="ti ti-file-text" aria-hidden="true"></i> Requirement Description
          ${scCount>0?`<span class="req2-tab-badge">${scCount}</span>`:''}
        </div>
        <div class="req2-tab${curTab==='tc'?' active':''}" onclick="req2SwitchTab('${r.id}','tc')">
          <i class="ti ti-clipboard-check" aria-hidden="true"></i> Test Cases Link
          ${tcCount>0?`<span class="req2-tab-badge">${tcCount}</span>`:''}
        </div>
      </div>
      <!-- 탭 콘텐츠 -->
      <div id="req2-tabcontent-${r.id}" class="req2-detail-wrap">
        ${req2TabContent(r, curTab)}
      </div>
    </td>
  </tr>`;
}

function req2TabContent(r, tab){
  if(tab==='details') return req2TabDetails(r);
  if(tab==='scenario') return req2TabScenario(r);
  if(tab==='impl') return req2TabImpl(r);
  if(tab==='tc') return req2TabTC(r);
  if(tab==='issues') return req2TabIssues(r);
  return '';
}
function _implLarge(r){ return false; }  // 항상 WYSIWYG(TinyMCE) 사용 — 플레인 텍스트 폴백 비활성화(사용자 요청). 매우 큰 문서 성능 우려 시 임계값 방식 복원 가능.
function req2SaveImplPlain(reqId,val){ const r=reqList.find(x=>x.id===reqId); if(!r) return; r.implementation=val; r.implementation_html=''; if(typeof saveOneREQ==='function') saveOneREQ(r); }
function req2TabImpl(r){
  const header='<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;"><i class="ti ti-code" style="color:var(--blue);font-size:18px;"></i><b style="font-size:15px;">구현 내용</b><span style="font-size:12.5px;color:var(--text3);">CLI 조회 결과·구현 상세를 입력하면 <b>LLM TC 생성</b> 시 자동으로 반영됩니다.</span>'
    +'<span style="flex:1;"></span>'
    +'<input type="file" accept=".docx" id="req2-impl-file-'+r.id+'" style="display:none;" onchange="req2ImplUploadDocx(\''+r.id+'\',this)">'
    +'<button onclick="document.getElementById(\'req2-impl-file-'+r.id+'\').click()" title="워드(.docx) 파일 내용을 구현 내용으로 등록" style="font-size:12.5px;padding:6px 13px;border-radius:7px;border:1.5px solid var(--blue);background:rgba(45,111,212,0.06);color:var(--blue);cursor:pointer;font-weight:600;display:flex;align-items:center;gap:5px;white-space:nowrap;"><i class="ti ti-file-upload" style="font-size:15px;"></i> 워드 첨부</button>'
    +'<button onclick="req2AddToLearning(\''+r.id+'\')" title="이 REQ 문서(개요·구현내용)를 AI 학습 데이터에 추가" style="font-size:12.5px;padding:6px 13px;border-radius:7px;border:1.5px solid #7c3aed;background:rgba(124,58,237,0.06);color:#7c3aed;cursor:pointer;font-weight:600;display:flex;align-items:center;gap:5px;white-space:nowrap;"><i class="ti ti-book-2" style="font-size:15px;"></i> 이 문서로 학습</button>'
  +'</div>';
  let editor;
  if(_implLarge(r)){
    // 대용량 → 리치 에디터(TinyMCE) 생략, 빠른 텍스트 편집기 사용
    const txt=(r.implementation||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    editor='<div style="font-size:12.5px;color:#c98a1e;margin-bottom:6px;"><i class="ti ti-bolt"></i> 내용이 많아 빠른 텍스트 편집기로 표시합니다 (서식 없음 · 즉시 로딩).</div>'
      +'<textarea id="req2-impl-'+r.id+'" onfocus="this.style.borderColor=\'var(--blue)\'" onblur="this.style.borderColor=\'var(--border)\';req2SaveImplPlain(\''+r.id+'\',this.value)" style="width:100%;min-height:420px;font-family:ui-monospace,monospace;font-size:12.5px;line-height:1.6;padding:12px;border:1.5px solid var(--border);border-radius:10px;background:#fafbfc;color:var(--text);white-space:pre;outline:none;resize:vertical;box-sizing:border-box;">'+txt+'</textarea>';
  } else {
    editor='<div id="req2-impl-'+r.id+'" style="width:100%;"></div>';
  }
  return '<div style="padding:14px;">'+header+editor+'</div>';
}
async function req2ImplUploadDocx(reqId, inp){
  const file=inp&&inp.files&&inp.files[0]; if(!file) return; inp.value='';
  if(!/\.docx$/i.test(file.name)){ alert('.docx 워드 파일만 지원합니다. 구버전 .doc는 워드에서 .docx로 저장 후 업로드하세요.'); return; }
  if(typeof mammoth==='undefined'){ alert('문서 변환 라이브러리 로딩 중입니다. 잠시 후 다시 시도하세요.'); return; }
  const r=reqList.find(x=>x.id===reqId); if(!r) return;
  if(typeof showToast==='function') showToast('📄 '+file.name+' 변환 중…');
  try{
    const buf=await file.arrayBuffer();
    // 이미지: EMF/WMF(웹 미표시 벡터)는 자리표시로, 그 외는 최대 800px·JPEG 리사이즈
    const _imgPh='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="360" height="116"><rect width="100%" height="100%" rx="10" fill="#f1f3f7" stroke="#cdd5e0" stroke-width="2"/><text x="50%" y="45%" text-anchor="middle" font-family="sans-serif" font-size="15" fill="#7a869a">[그림] EMF/벡터 - 웹 미표시</text><text x="50%" y="66%" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#9aa7bd">PNG/JPG로 다시 넣어주세요</text></svg>');
    const _convImg=mammoth.images.imgElement(function(image){
      if(/emf|wmf/i.test(image.contentType||'')) return Promise.resolve({src:_imgPh});
      return image.read('base64').then(function(b64){ return new Promise(function(resolve){
        var im=new Image();
        im.onload=function(){ try{ var mx=800, sc=Math.min(1,mx/(im.width||mx)); var w=Math.round((im.width||mx)*sc), h=Math.round((im.height||mx)*sc); var cv=document.createElement('canvas'); cv.width=w; cv.height=h; cv.getContext('2d').drawImage(im,0,0,w,h); resolve({src:cv.toDataURL('image/jpeg',0.72)}); }catch(e){ resolve({src:'data:'+image.contentType+';base64,'+b64}); } };
        im.onerror=function(){ resolve({src:_imgPh}); };
        im.src='data:'+image.contentType+';base64,'+b64;
      }); });
    });
    const res=await mammoth.convertToHtml({arrayBuffer:buf},{convertImage:_convImg});
    // 워드 제목 스타일(h1~h6) → 일반 단락으로 평탄화(글자크기 통일) + 인라인 스타일 제거. 이미지는 유지.
    let html=(res.value||'').replace(/<(\/?)h[1-6]([^>]*)>/gi,'<$1p$2>').replace(/\sstyle="[^"]*"/gi,'');
    const tmp=document.createElement('div'); tmp.innerHTML=html;
    const text=(tmp.innerText||tmp.textContent||'').replace(/\n{3,}/g,'\n\n').trim();
    if(html.length>3000000){ html=text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\r?\n/g,'<br>'); }   // 초대용량만 텍스트화
    const _m=(typeof _html2md==='function'?_html2md(html):text);
    r.implementation_html=html; r.implementation=text; r.implementation_md=_m;
    if(typeof saveOneREQ==='function') saveOneREQ(r);
    const ed=_tinyEditors[reqId];
    if(ed&&ed.setMarkdown){ ed.setMarkdown(_m); }
    else { const ta=document.getElementById('req2-impl-'+reqId); if(ta) ta.value=(r.implementation||text||''); }
    if(typeof showToast==='function') showToast('✅ '+file.name+' 등록 완료 ('+text.length.toLocaleString()+'자) — 채팅에서 "'+(typeof expDispId==='function'?expDispId(r.reqid):r.reqid)+' TC 생성해줘"');
  }catch(e){ alert('워드 파일 읽기 실패: '+((e&&e.message)||e)); }
}// 터미널/CLI 출력을 정렬 유지한 코드블록(```)으로 붙여넣기 (인라인코드·검은색 깨짐 방지)// 이 REQ 문서(개요·구현내용 마크다운)를 "AI 학습 데이터"에 추가 (이미지 제외 텍스트만)
async function req2AddToLearning(reqId){
  const r=reqList.find(x=>x.id===reqId); if(!r) return;
  var ov=r.overview_md||(typeof _html2md==='function'?_html2md(r.overview_html||r.overview||''):(r.overview||''));
  var impl=r.implementation_md||(typeof _html2md==='function'?_html2md(r.implementation_html||r.implementation||''):(r.implementation||''));
  var parts=['# '+((r.reqid||'')+' '+(r.title||'')).trim()];
  if(ov&&ov.trim()) parts.push('## 개요\n'+ov.trim());
  if(impl&&impl.trim()) parts.push('## 구현내용\n'+impl.trim());
  var text=parts.join('\n\n');
  // 이미지 학습 포함: data:image 추출 → images 배열 + [[IMG:N]] 플레이스홀더 (매뉴얼 형식)
  var _imgs=[];
  text=text.replace(/!\[[^\]]*\]\((data:image[^)]+)\)/g,function(mm,src){ var i=_imgs.length; _imgs.push(src); return '\n[[IMG:'+i+']]\n'; });
  text=text.replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\n{3,}/g,'\n\n').trim();   // 외부 URL 이미지는 제외
  if((!text||text.length<5)&&!_imgs.length){ if(typeof showToast==='function')showToast('학습할 내용이 없습니다 (개요·구현내용을 먼저 작성하세요)'); return; }
  // 이미지 모드 켜짐 시: data:URL → Blob → OCR/비전 인식 → [[IMG:N]] 뒤에 글자 삽입 (실제 학습 반영)
  if(typeof _manualImgMode!=='undefined' && _manualImgMode!=='off' && typeof _imgExtractBlob==='function' && _imgs.length){
    if(typeof showToast==='function')showToast('🔎 이미지 '+_imgs.length+'개 '+(_manualImgMode==='vision'?'AI비전':'OCR')+' 인식 중…');
    for(var _i=0;_i<_imgs.length;_i++){ try{ var _bl=await (await fetch(_imgs[_i])).blob(); var _rt=String(await _imgExtractBlob(_bl)||'').trim(); if(_rt) text=text.replace('[[IMG:'+_i+']]','[[IMG:'+_i+']]\n[이미지 인식] '+_rt); }catch(e){} }
    text=text.replace(/\n{3,}/g,'\n\n').trim();
  }
  var id='man-req-'+String(r.reqid||r.id||'').replace(/[^a-zA-Z0-9_-]/g,'_');
  var m={id:id,name:'REQ · '+((r.reqid||r.id)||''),text:text,chars:text.length,source:'REQ',active:true,created_at:new Date().toISOString().slice(0,10),images:_imgs,folder:''};
  try{
    var res=await fetch('/api/manual/'+encodeURIComponent(id),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(m)});
    if(!res.ok){ if(typeof showToast==='function')showToast('학습 추가 실패 ('+res.status+')'); return; }
    if(typeof loadManuals==='function'){ try{ await loadManuals(); }catch(e){} }
    try{ var pm=document.getElementById('page-manual'); if(pm&&pm.classList.contains('active')&&typeof renderManuals==='function') renderManuals(); }catch(e){}
    if(typeof showToast==='function')showToast('📚 학습 추가됨 ('+text.length.toLocaleString()+'자'+(_imgs.length?(', 이미지 '+_imgs.length+'개'):'')+') — AI ▸ AI 학습 데이터에서 확인');
  }catch(e){ if(typeof showToast==='function')showToast('학습 추가 오류: '+((e&&e.message)||e)); }
}

// ══ TC/REQ 메일 공유 (보고서 빌더 + 다이얼로그 + 발송) ══
function _shEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function _shAttr(s){ return _shEsc(s).replace(/"/g,'&quot;'); }
function _shStripFont(html){ return String(html||'').replace(/font-family\s*:[^;"'}]*;?/gi,'').replace(/\sface\s*=\s*("[^"]*"|'[^']*')/gi,''); }
function buildShareReportHtml(o, sec, opts){
  o=o||{}; sec=sec||{}; opts=opts||{};
  var esc=_shEsc, nl2br=function(s){ return esc(s).replace(/\r?\n/g,'<br>'); };
  var FONT="'Apple SD Gothic Neo','Malgun Gothic','맑은 고딕',Arial,sans-serif";
  var ttl=function(t){ return '<div style="font-size:16px;font-weight:800;color:#1c2942;margin:22px 0 8px;padding-bottom:6px;border-bottom:2px solid #e1eaf7;">'+esc(t)+'</div>'; };
  var rows='';
  if(opts.intro) rows+='<div style="font-size:13px;color:#5a6b85;line-height:1.7;margin-bottom:4px;">'+opts.intro+'</div>';
  if(opts.memo) rows+='<div style="font-size:13px;color:#1c2942;background:#fff8e1;border:1px solid #f0e0a8;border-radius:8px;padding:12px 14px;margin:10px 0 4px;line-height:1.6;"><b>📝 메모</b><br>'+opts.memo+'</div>';
  if(sec.info){
    rows+=ttl('정보');
    rows+='<table style="width:100%;border-collapse:collapse;font-size:13px;">'
      +'<tr><td style="padding:5px 8px;color:#8090ab;width:84px;">ID</td><td style="padding:5px 8px;font-family:ui-monospace,monospace;color:#1c2942;font-weight:700;">'+esc(o.id||'')+'</td></tr>'
      +'<tr><td style="padding:5px 8px;color:#8090ab;">제목</td><td style="padding:5px 8px;color:#1c2942;font-weight:700;">'+esc(o.title||'')+'</td></tr>'
      +'<tr><td style="padding:5px 8px;color:#8090ab;">상태</td><td style="padding:5px 8px;"><span style="display:inline-block;background:#e3f6ec;color:#00875a;font-size:12px;font-weight:700;padding:2px 10px;border-radius:20px;">'+esc(o.status||'')+'</span></td></tr>'
      +(o.author?'<tr><td style="padding:5px 8px;color:#8090ab;">작성자</td><td style="padding:5px 8px;color:#33405a;">'+esc(o.author)+'</td></tr>':'')
      +(o.date?'<tr><td style="padding:5px 8px;color:#8090ab;">날짜</td><td style="padding:5px 8px;color:#33405a;">'+esc(o.date)+'</td></tr>':'')
      +'</table>';
  }
  if(sec.desc && (o.overview||o.description)){
    rows+=ttl('설명');
    if(o.overview) rows+='<div style="font-size:13px;color:#33405a;line-height:1.7;margin-bottom:8px;"><b style="color:#5a6b85;">개요</b><br>'+nl2br(o.overview)+'</div>';
    if(o.description) rows+='<div style="font-size:13px;color:#33405a;line-height:1.7;"><b style="color:#5a6b85;">동작 설명</b><br>'+nl2br(o.description)+'</div>';
  }
  if(sec.impl && (o.implementation_html||o.implementation)){
    rows+=ttl('구현 내용');
    if(o.implementation_html) rows+='<div style="font-size:13px;color:#33405a;line-height:1.7;font-family:'+FONT+';">'+o.implementation_html+'</div>';
    else rows+='<div style="font-size:12.5px;color:#33405a;line-height:1.6;font-family:ui-monospace,monospace;background:#f5f8fd;border:1px solid #e1eaf7;border-radius:8px;padding:12px 14px;white-space:pre-wrap;">'+esc(o.implementation)+'</div>';
  }
  if(sec.scenario && o.scenarios && o.scenarios.length){
    rows+=ttl('동작 시나리오');
    rows+='<ul style="margin:0;padding-left:20px;font-size:13px;color:#33405a;line-height:1.8;">'+o.scenarios.map(function(s){ return '<li><b style="color:#2d6fd4;font-family:ui-monospace,monospace;font-size:12px;">'+esc(s.id||'')+'</b> '+esc(s.desc||''); }).join('')+'</ul>';
  }
  if(sec.tc && o.tcs && o.tcs.length){
    rows+=ttl('연결된 TC ('+o.tcs.length+')');
    rows+='<table style="width:100%;border-collapse:collapse;font-size:12.5px;"><thead><tr style="background:#eef3fb;"><th style="text-align:left;padding:7px 10px;color:#3a4254;border-bottom:1px solid #cfe0f5;">TC ID</th><th style="text-align:left;padding:7px 10px;color:#3a4254;border-bottom:1px solid #cfe0f5;">제목</th><th style="text-align:left;padding:7px 10px;color:#3a4254;border-bottom:1px solid #cfe0f5;">최근 결과</th></tr></thead><tbody>'
      +o.tcs.map(function(t){ var rv=t.result||'미실행'; var sc=(rv==='합격'||rv==='Pass')?'#00875a':(rv==='불합격'||rv==='Fail')?'#d12d49':'#6b7280'; return '<tr><td style="padding:6px 10px;font-family:ui-monospace,monospace;color:#2d6fd4;border-bottom:1px solid #eef0f3;">'+esc(t.id||'')+'</td><td style="padding:6px 10px;color:#1c2942;border-bottom:1px solid #eef0f3;">'+esc(t.title||'')+'</td><td style="padding:6px 10px;color:'+sc+';font-weight:700;border-bottom:1px solid #eef0f3;">'+esc(rv)+'</td></tr>'; }).join('')
      +'</tbody></table>';
  }
  if(sec.purpose && (o.object||o.precondition)){
    rows+=ttl('시험 목적 / 사전조건');
    if(o.object) rows+='<div style="font-size:13px;color:#33405a;line-height:1.7;margin-bottom:8px;"><b style="color:#5a6b85;">목적</b><br>'+nl2br(o.object)+'</div>';
    if(o.precondition) rows+='<div style="font-size:13px;color:#33405a;line-height:1.7;"><b style="color:#5a6b85;">사전조건</b><br>'+nl2br(o.precondition)+'</div>';
  }
  if(sec.topo && (o.topo_image||o.topo2||(o.topo_nodes&&o.topo_nodes.length))){
    rows+=ttl('시험 구성도');
    if(o.topo_image) rows+='<div style="border:1px solid #e1eaf7;border-radius:8px;padding:8px;background:#fff;margin-bottom:8px;text-align:center;"><img src="'+o.topo_image+'" width="360" style="width:360px;max-width:100%;height:auto;display:inline-block;"></div>';
    else if(o.topo2){ var _sv=_shTopoBuildSvg(o.topo2); if(_sv) rows+='<div style="border:1px solid #e1eaf7;border-radius:8px;padding:10px;background:#fafbfd;margin:0 auto 8px;max-width:380px;text-align:center;overflow:auto;">'+_sv.svg+'</div>'; }
    if(o.topo_nodes&&o.topo_nodes.length){
      rows+='<table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:#eef3fb;"><th style="text-align:left;padding:6px 8px;color:#3a4254;border-bottom:1px solid #cfe0f5;">모델</th><th style="text-align:left;padding:6px 8px;color:#3a4254;border-bottom:1px solid #cfe0f5;">역할</th><th style="text-align:left;padding:6px 8px;color:#3a4254;border-bottom:1px solid #cfe0f5;">벤더</th><th style="text-align:left;padding:6px 8px;color:#3a4254;border-bottom:1px solid #cfe0f5;">IP</th></tr></thead><tbody>'
        +o.topo_nodes.map(function(n){ return '<tr><td style="padding:5px 8px;border-bottom:1px solid #eef0f3;color:#1c2942;">'+esc(n.model||'')+'</td><td style="padding:5px 8px;border-bottom:1px solid #eef0f3;color:#33405a;">'+esc(n.role||'')+'</td><td style="padding:5px 8px;border-bottom:1px solid #eef0f3;color:#33405a;">'+esc(n.vendor||'')+'</td><td style="padding:5px 8px;border-bottom:1px solid #eef0f3;font-family:ui-monospace,monospace;color:#2d6fd4;">'+esc(n.ip||'-')+'</td></tr>'; }).join('')
        +'</tbody></table>';
    }
  }
  if(sec.traffic && o.traffic && Object.keys(o.traffic).some(function(k){return o.traffic[k];})){
    rows+=ttl('Traffic Generator');
    var tg=o.traffic; var trow=function(l,v){ return '<tr><td style="padding:5px 8px;color:#8090ab;width:88px;">'+l+'</td><td style="padding:5px 8px;color:#33405a;font-family:ui-monospace,monospace;">'+esc(v||'-')+'</td></tr>'; };
    rows+='<table style="width:100%;border-collapse:collapse;font-size:12.5px;">'+trow('Vendor',tg.vendor)+trow('IP',tg.ip)+trow('Port',tg.port)+trow('Src MAC',tg.src_mac)+trow('Dst MAC',tg.dst_mac)+trow('Src IP',tg.src_ip)+trow('Dst IP',tg.dst_ip)+trow('Gateway',tg.gateway)+'</table>';
  }
  if(sec.steps && o.steps && o.steps.length){
    rows+=ttl('시험 절차 ('+o.steps.length+' Step)');
    rows+='<table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:#eef3fb;">'
      +'<th style="text-align:left;padding:6px 8px;color:#3a4254;border-bottom:1px solid #cfe0f5;width:34px;">#</th>'
      +'<th style="text-align:left;padding:6px 8px;color:#3a4254;border-bottom:1px solid #cfe0f5;">Test Step</th>'
      +'<th style="text-align:left;padding:6px 8px;color:#3a4254;border-bottom:1px solid #cfe0f5;">Test Data</th>'
      +'<th style="text-align:left;padding:6px 8px;color:#3a4254;border-bottom:1px solid #cfe0f5;">Expected Result</th>'
      +'<th style="text-align:left;padding:6px 8px;color:#3a4254;border-bottom:1px solid #cfe0f5;width:52px;">결과</th></tr></thead><tbody>'
      +o.steps.map(function(s,i){ var rc=(s.result==='Pass'||s.result==='합격')?'#00875a':(s.result==='Fail'||s.result==='불합격')?'#d12d49':'#6b7280';
        var _outRow=(s.n2xStats&&typeof _n2xStatsHtml==='function')?'<tr><td colspan="5" style="padding:6px 8px 12px;border-bottom:1px solid #eef0f3;">'+_n2xStatsHtml(s.n2xStats,s.n2xNames,s.n2xElapsed,{pdf:true})+'</td></tr>':((s.output||'').trim()?'<tr><td colspan="5" style="padding:4px 8px 12px;border-bottom:1px solid #eef0f3;"><div style="font-size:10px;color:#8090ab;font-weight:700;margin-bottom:3px;">실행 결과 (Response)</div><pre style="margin:0;white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,monospace;font-size:10px;line-height:1.5;color:#2a2f3e;background:#f7f9fc;border:1px solid #e6e9f0;border-radius:5px;padding:7px 9px;">'+esc((s.output||'').trim())+'</pre></td></tr>':'');
        return '<tr>'
        +'<td style="padding:6px 8px;color:#8090ab;border-bottom:1px solid #eef0f3;vertical-align:top;">'+(i+1)+'</td>'
        +'<td style="padding:6px 8px;color:#1c2942;border-bottom:1px solid #eef0f3;vertical-align:top;white-space:pre-wrap;">'+esc(s.desc||'')+'</td>'
        +'<td style="padding:6px 8px;color:#33405a;font-family:ui-monospace,monospace;border-bottom:1px solid #eef0f3;vertical-align:top;white-space:pre-wrap;">'+esc(s.cli||'')+'</td>'
        +'<td style="padding:6px 8px;color:#33405a;border-bottom:1px solid #eef0f3;vertical-align:top;white-space:pre-wrap;">'+esc(s.criteria||'')+'</td>'
        +'<td style="padding:6px 8px;color:'+rc+';font-weight:700;border-bottom:1px solid #eef0f3;vertical-align:top;">'+esc(s.result||'')+'</td></tr>'+_outRow; }).join('')
      +'</tbody></table>';
  }
  if(sec.issue && o.issues && o.issues.length){
    rows+=ttl('연결된 이슈 ('+o.issues.length+')');
    rows+='<table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:#eef3fb;"><th style="text-align:left;padding:6px 8px;color:#3a4254;border-bottom:1px solid #cfe0f5;">키</th><th style="text-align:left;padding:6px 8px;color:#3a4254;border-bottom:1px solid #cfe0f5;">요약</th><th style="text-align:left;padding:6px 8px;color:#3a4254;border-bottom:1px solid #cfe0f5;">상태</th></tr></thead><tbody>'
      +o.issues.map(function(it){ return '<tr><td style="padding:5px 8px;border-bottom:1px solid #eef0f3;font-family:ui-monospace,monospace;color:#2684ff;font-weight:700;">'+esc(it.key||'')+'</td><td style="padding:5px 8px;border-bottom:1px solid #eef0f3;color:#1c2942;">'+esc(it.summary||'')+'</td><td style="padding:5px 8px;border-bottom:1px solid #eef0f3;color:#33405a;">'+esc(it.status||'-')+'</td></tr>'; }).join('')
      +'</tbody></table>';
  }
  if(sec.history && o.history && o.history.length){
    rows+=ttl('시험 이력 ('+o.history.length+')');
    rows+='<table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:#eef3fb;"><th style="text-align:left;padding:6px 8px;color:#3a4254;border-bottom:1px solid #cfe0f5;">일시</th><th style="text-align:left;padding:6px 8px;color:#3a4254;border-bottom:1px solid #cfe0f5;">결과</th><th style="text-align:left;padding:6px 8px;color:#3a4254;border-bottom:1px solid #cfe0f5;">요약</th><th style="text-align:left;padding:6px 8px;color:#3a4254;border-bottom:1px solid #cfe0f5;">수행자</th></tr></thead><tbody>'
      +o.history.slice(0,30).map(function(h){ var rc=(h.result==='Pass'||h.result==='합격')?'#00875a':(h.result==='Fail'||h.result==='불합격')?'#d12d49':'#6b7280'; return '<tr><td style="padding:5px 8px;border-bottom:1px solid #eef0f3;color:#33405a;white-space:nowrap;">'+esc(h.date||h.at||h.ts||'')+'</td><td style="padding:5px 8px;border-bottom:1px solid #eef0f3;color:'+rc+';font-weight:700;">'+esc(h.result||'')+'</td><td style="padding:5px 8px;border-bottom:1px solid #eef0f3;color:#1c2942;">'+esc(h.summary||'')+'</td><td style="padding:5px 8px;border-bottom:1px solid #eef0f3;color:#33405a;">'+esc(h.executor||h.by||h.user||'')+'</td></tr>'; }).join('')
      +'</tbody></table>';
  }
  if(sec.cycle && o.cycles && o.cycles.length){
    rows+=ttl('사이클 ('+o.cycles.length+')');
    rows+='<table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:#eef3fb;"><th style="text-align:left;padding:6px 8px;color:#3a4254;border-bottom:1px solid #cfe0f5;">사이클</th><th style="text-align:left;padding:6px 8px;color:#3a4254;border-bottom:1px solid #cfe0f5;">모델</th><th style="text-align:left;padding:6px 8px;color:#3a4254;border-bottom:1px solid #cfe0f5;">버전</th><th style="text-align:left;padding:6px 8px;color:#3a4254;border-bottom:1px solid #cfe0f5;">결과</th><th style="text-align:left;padding:6px 8px;color:#3a4254;border-bottom:1px solid #cfe0f5;">일시</th></tr></thead><tbody>'
      +o.cycles.map(function(c){ var rc=(c.result==='Pass'||c.result==='합격')?'#00875a':(c.result==='Fail'||c.result==='불합격')?'#d12d49':'#6b7280'; return '<tr><td style="padding:5px 8px;border-bottom:1px solid #eef0f3;color:#1c2942;">'+esc(c.name||'')+'</td><td style="padding:5px 8px;border-bottom:1px solid #eef0f3;color:#33405a;">'+esc(c.model||'')+'</td><td style="padding:5px 8px;border-bottom:1px solid #eef0f3;color:#33405a;">'+esc(c.version||'')+'</td><td style="padding:5px 8px;border-bottom:1px solid #eef0f3;color:'+rc+';font-weight:700;">'+esc(c.result||'-')+'</td><td style="padding:5px 8px;border-bottom:1px solid #eef0f3;color:#33405a;white-space:nowrap;">'+esc(c.date||'')+'</td></tr>'; }).join('')
      +'</tbody></table>';
  }
  if(opts.outro) rows+='<div style="font-size:12.5px;color:#5a6b85;line-height:1.6;margin-top:20px;padding-top:12px;border-top:1px solid #eef1f6;">'+opts.outro+'</div>';
  var cta='';
  if(opts.appUrl){ var u=String(opts.appUrl).replace(/\/+$/,''); cta='<div style="text-align:center;margin-top:22px;"><a href="'+u+'" target="_blank" style="display:inline-block;background:#2d6fd4;color:#fff;text-decoration:none;font-size:13px;font-weight:700;padding:11px 28px;border-radius:9px;">앱에서 전체 보기 →</a></div>'; }
  return '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#eef1f6;">'
    +'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f6;padding:26px 12px;font-family:\'Apple SD Gothic Neo\',\'Malgun Gothic\',Arial,sans-serif;"><tr><td align="center">'
    +'<table role="presentation" width="780" cellpadding="0" cellspacing="0" style="width:780px;max-width:100%;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 8px 30px rgba(20,40,80,0.10);">'
    +'<tr><td bgcolor="#2d6fd4" style="background-color:#2d6fd4;background:linear-gradient(135deg,#2d6fd4,#1b59bd);padding:22px 28px;"><div style="font-size:13px;color:#cfe0ff;font-weight:700;letter-spacing:0.3px;">'+esc(o.kind||'REQ')+' 공유</div><div style="font-size:19px;font-weight:800;color:#ffffff;margin-top:3px;">'+esc(o.title||'')+'</div></td></tr>'
    +'<tr><td style="padding:18px 28px 28px;font-family:'+FONT+';">'+rows+cta+'</td></tr>'
    +'<tr><td style="background:#f7f9fc;border-top:1px solid #eef1f6;padding:14px 28px;text-align:center;font-size:11px;color:#9aa7bd;">ubiQuoss-TOP · 본 메일은 사용자가 공유 요청하여 발송되었습니다.</td></tr>'
    +'</table></td></tr></table></body></html>';
}
function _reqToShareObj(r){
  var scs=[]; try{ scs=JSON.parse(r.scenarios||'[]'); if(!Array.isArray(scs)) scs=[]; }catch(e){}
  var tcs=(typeof tcList!=='undefined'?tcList:[]).filter(function(t){return t.req_id===r.id;}).map(function(t){ var lr=(Array.isArray(t.result_history)&&t.result_history.length)?(t.result_history[0].result||''):''; return {id:t.tcid||t.id, title:t.name||t.title||t.summary||'', result:lr||'미실행', status:t.status||''}; });
  return {kind:'REQ', id:r.reqid||r.id, title:r.title||'', status:r.status||'',
    author:r.author||r.owner||r.created_by||'', date:r.updated_at||r.created_at||'',
    overview:r.overview||'', description:r.description||'',
    implementation_html:_shStripFont(r.implementation_html), implementation:r.implementation||'',
    scenarios:scs.map(function(s){return {id:s.id||'', desc:s.desc||s.description||''};}), tcs:tcs};
}
var _shareState=null;
async function shareReqMail(reqId){
  const r=reqList.find(x=>x.id===reqId); if(!r){ if(typeof showToast==='function')showToast('REQ를 찾을 수 없습니다'); return; }
  let cfg=null; try{ cfg=await userApi('GET','/api/share-config'); }catch(e){}
  cfg=cfg||{}; var form=cfg.req||{}; const sec=form.sections||{info:true,desc:true,impl:true,scenario:false,tc:true};
  if(cfg.mail_enabled===false){ if(typeof showToast==='function')showToast('메일 발송이 꺼져 있습니다 (시스템 → 메일 설정)'); }
  let users=[]; try{ const d=await userApi('GET','/api/users/mentionable'); users=(d&&d.users)||[]; }catch(e){}
  _shareState={obj:_reqToShareObj(r), sec:sec, form:form, appUrl:cfg.app_url||''};
  _openShareDialog(r.reqid||r.id, sec, users);
}
async function shareTcMail(tcid){
  const tc=(typeof tcList!=='undefined'?tcList:[]).find(function(t){return (t.tcid===tcid)||(t.id===tcid);}); if(!tc){ if(typeof showToast==='function')showToast('TC를 찾을 수 없습니다'); return; }
  let cfg=null; try{ cfg=await userApi('GET','/api/share-config'); }catch(e){}
  cfg=cfg||{}; var form=cfg.tc||{}; const sec=form.sections||{info:true,purpose:true,topo:true,traffic:true,steps:true,issue:true,history:true,cycle:true};
  if(cfg.mail_enabled===false){ if(typeof showToast==='function')showToast('메일 발송이 꺼져 있습니다 (시스템 → 메일 설정)'); }
  let users=[]; try{ const d=await userApi('GET','/api/users/mentionable'); users=(d&&d.users)||[]; }catch(e){}
  var obj=_tcToShareObj(tc);
  if(obj.topo2 && !obj.topo_image){ try{ var sv=_shTopoBuildSvg(obj.topo2); if(sv){ var png=await _svgToPng(sv.svg,sv.w,sv.h); if(png) obj.topo_image=png; } }catch(e){} }
  _shareState={obj:obj, sec:sec, form:form, appUrl:cfg.app_url||''};
  _openShareDialog(tc.tcid||tc.id, sec, users);
}
function _shTopoBuildSvg(t2){
  if(!t2||!Array.isArray(t2.nodes)||!t2.nodes.length) return null;
  var ORD=['계측기','L3 스위치','L2 스위치','OLT','ONT','PC/서버','Cloud','기타'];
  var rkF=function(r){var i=ORD.indexOf(r);return i<0?99:i;};
  var NW=152,NH=56,GX=30,GY=60;
  var tierG={}; t2.nodes.forEach(function(n){var k=rkF(n.role);(tierG[k]=tierG[k]||[]).push(n);});
  var tkeys=Object.keys(tierG).map(Number).sort(function(a,b){return a-b;});
  var autoP={}; tkeys.forEach(function(k,ti){tierG[k].forEach(function(n,ci){autoP[n.id]={x:ci*(NW+GX)+16,y:ti*(NH+GY)+16};});});
  var posM={},mX=0,mY=0;
  t2.nodes.forEach(function(n){var p=(typeof n.x==='number'&&typeof n.y==='number')?{x:n.x,y:n.y}:autoP[n.id]; posM[n.id]=p; mX=Math.max(mX,p.x+NW); mY=Math.max(mY,p.y+NH);});
  var epF=function(cx,cy,hw,hh,tx,ty){var dx=tx-cx,dy=ty-cy;if(!dx&&!dy)return[cx,cy];var sx=dx?hw/Math.abs(dx):1e9,sy=dy?hh/Math.abs(dy):1e9,s=Math.min(sx,sy);return[cx+dx*s,cy+dy*s];};
  var svgLines='';
  (t2.links||[]).forEach(function(l){var pa=posM[l.a],pb=posM[l.b];if(!pa||!pb)return;var ax=pa.x+NW/2,ay=pa.y+NH/2,bx=pb.x+NW/2,by=pb.y+NH/2;var e1=epF(ax,ay,NW/2,NH/2,bx,by),e2=epF(bx,by,NW/2,NH/2,ax,ay);var mx=(e1[0]+e2[0])/2,my=(e1[1]+e2[1])/2;var lbl=(l.ap||'')+' ↔ '+(l.bp||'');var w=lbl.length*5.4+10;svgLines+='<line x1="'+e1[0]+'" y1="'+e1[1]+'" x2="'+e2[0]+'" y2="'+e2[1]+'" stroke="#2d6fd4" stroke-width="1.4"/><rect x="'+(mx-w/2)+'" y="'+(my-7)+'" width="'+w+'" height="14" rx="3" fill="#ffffff" stroke="#2d6fd4" stroke-width="0.6"/><text x="'+mx+'" y="'+(my+3.5)+'" font-size="9" fill="#2d6fd4" text-anchor="middle" font-family="monospace">'+_shEsc(lbl)+'</text>';});
  var svgBoxes='';
  t2.nodes.forEach(function(n){var p=posM[n.id],c=(typeof DEVICE_ROLE_COLORS!=='undefined'&&DEVICE_ROLE_COLORS[n.role])||'#7886a0';svgBoxes+='<g><rect x="'+p.x+'" y="'+p.y+'" width="'+NW+'" height="'+NH+'" rx="7" fill="#ffffff" stroke="'+c+'" stroke-width="1.5"/><rect x="'+p.x+'" y="'+p.y+'" width="'+NW+'" height="3.5" rx="1.5" fill="'+c+'"/><text x="'+(p.x+NW/2)+'" y="'+(p.y+24)+'" font-size="10" font-weight="700" fill="#1a1d2e" text-anchor="middle">'+_shEsc((n.model||'').slice(0,18))+'</text><text x="'+(p.x+NW/2)+'" y="'+(p.y+36)+'" font-size="8" fill="#9aa0b8" text-anchor="middle">'+_shEsc(n.role||'')+'</text><text x="'+(p.x+NW/2)+'" y="'+(p.y+49)+'" font-size="8.5" fill="#2d6fd4" text-anchor="middle" font-family="monospace">'+_shEsc(n.ip||'')+'</text></g>';});
  var W=mX+16,H=mY+16;
  var svg='<svg viewBox="0 0 '+W+' '+H+'" width="'+W+'" height="'+H+'" style="max-width:100%;height:auto;" xmlns="http://www.w3.org/2000/svg"><rect width="'+W+'" height="'+H+'" fill="#fafbfd"/>'+svgLines+svgBoxes+'</svg>';
  return {svg:svg,w:W,h:H};
}
function _svgToPng(svg,w,h){
  return new Promise(function(res){
    try{
      var img=new Image();
      img.onload=function(){ try{ var sc=2; var c=document.createElement('canvas'); c.width=w*sc; c.height=h*sc; var ctx=c.getContext('2d'); ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,c.width,c.height); ctx.drawImage(img,0,0,c.width,c.height); res(c.toDataURL('image/png')); }catch(e){ res(''); } };
      img.onerror=function(){ res(''); };
      img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
    }catch(e){ res(''); }
  });
}
function _tcToShareObj(tc){
  var steps=[];
  if(Array.isArray(tc.checks)&&tc.checks.length){ steps=tc.checks.filter(function(c){return (c.kind||'cli')==='cli';}).map(function(c){return {desc:c.desc||'',intent:c.intent||'',cli:c.cli||c.input||'',criteria:c.criteria||c.expected||'',result:c.repeatResult||c.result||'',output:c.output||'',n2xStats:(Array.isArray(c.n2xStats)&&c.n2xStats.length)?c.n2xStats:null,n2xNames:c.n2xNames||null,n2xElapsed:c.n2xElapsed||0};}); }
  if(!steps.length&&Array.isArray(tc.steps)) steps=tc.steps.map(function(c){return {desc:c.desc||'',intent:c.intent||'',cli:c.cli||c.input||'',criteria:c.criteria||c.expected||'',result:c.result||''};});
  var tf=tc.traffic||{};
  var traffic={vendor:tf.vendor||tc.meter_vendor||'',ip:tf.ip||tc.meter_ip||'',port:tf.port||tc.meter_port||'',src_mac:tf.src_mac||tc.meter_src_mac||'',dst_mac:tf.dst_mac||tc.meter_dst_mac||'',src_ip:tf.src_ip||tc.meter_src_ip||'',dst_ip:tf.dst_ip||tc.meter_dst_ip||'',gateway:tf.gateway||tc.meter_gw||''};
  var nodes=(tc.topo2&&Array.isArray(tc.topo2.nodes))?tc.topo2.nodes:[];
  var cycles=[];
  try{ if(typeof cycleList!=='undefined'&&Array.isArray(cycleList)){ var _tid=tc.tcid||tc.id;
    cycleList.forEach(function(cy){ var it=(cy.items||[]).find(function(x){return (x.tcid===_tid)||(x.id===_tid);}); if(it){ var st=(typeof cycleItemStatus==='function')?cycleItemStatus(it.steps):''; cycles.push({name:cy.name||cy.model||'', model:cy.model||'', version:cy.version||'', result:st||'', date:cy.created_at||''}); } });
  } }catch(e){}
  return {kind:'TC', id:tc.tcid||tc.id, title:tc.name||tc.title||'', status:tc.status||'',
    author:tc.author||tc.owner||'', date:tc.updated_at||tc.created_at||'',
    object:tc.object||'', precondition:tc.precondition||'', steps:steps,
    traffic:traffic, topo_image:tc.topo_image||'', topo_nodes:nodes,
    topo2:(tc.topo2&&Array.isArray(tc.topo2.nodes)&&tc.topo2.nodes.length)?tc.topo2:null,
    issues:tc.issue_list||tc.issues||[], history:tc.result_history||[], cycles:cycles};
}
function _shareSecLabels(sec){ var L={info:'정보',desc:'설명',impl:'구현내용',scenario:'시나리오',tc:'TC',purpose:'시험목적',topo:'구성도',traffic:'트래픽',steps:'시험절차',issue:'이슈',history:'이력',cycle:'사이클'}; return Object.keys(L).filter(function(k){return sec[k];}).map(function(k){return L[k];}).join(' · ')||'(없음)'; }function _shareToggleGroup(gid){ var b=document.getElementById(gid+'-body'),ic=document.getElementById(gid+'-ic'); if(!b)return; var open=(b.style.display==='none'); b.style.display=open?'block':'none'; if(ic) ic.style.transform=open?'rotate(90deg)':'rotate(0)'; }
function _shareToggleGroupAll(gid,on){ document.querySelectorAll('.'+gid+'-m').forEach(function(c){ c.checked=on; }); var b=document.getElementById(gid+'-body'); if(on&&b&&b.style.display==='none') _shareToggleGroup(gid); }
function _memoWys(cmd,val){ var ed=document.getElementById('share-memo-wys'); if(!ed)return; if(document.activeElement!==ed) ed.focus(); try{ document.execCommand(cmd,false,(val===undefined?null:val)); }catch(e){} }
function _memoWysLink(){ var u=prompt('링크 주소(URL)를 입력하세요','https://'); if(!u)return; _memoWys('createLink',u); }
// ── 받는 사람: 담당(1차) → 팀(2차) 필터 + 선택 유지 ──
var _shareUsers=[], _shareSel={};
function _shareInitFilters(){
  var depts=[]; _shareUsers.forEach(function(u){ var d=u.dept||'(미지정)'; if(depts.indexOf(d)<0) depts.push(d); });
  depts.sort(function(a,b){return String(a).localeCompare(String(b),'ko');});
  var ds=document.getElementById('share-f-dept');
  if(ds) ds.innerHTML='<option value="">담당 전체</option>'+depts.map(function(d){return '<option value="'+_shAttr(d)+'">'+_shEsc(d)+'</option>';}).join('');
  _shareDeptChange();
}
function _shareDeptChange(){
  var dept=((document.getElementById('share-f-dept')||{}).value)||'';
  var teams=[]; _shareUsers.forEach(function(u){ if(!dept||(u.dept||'(미지정)')===dept){ var t=u.team||'(미지정)'; if(teams.indexOf(t)<0) teams.push(t); } });
  teams.sort(function(a,b){return String(a).localeCompare(String(b),'ko');});
  var ts=document.getElementById('share-f-team');
  if(ts) ts.innerHTML='<option value="">팀 전체</option>'+teams.map(function(t){return '<option value="'+_shAttr(t)+'">'+_shEsc(t)+'</option>';}).join('');
  _shareRenderRcptList();
}
function _shareFilteredUsers(){
  var dept=((document.getElementById('share-f-dept')||{}).value)||'';
  var team=((document.getElementById('share-f-team')||{}).value)||'';
  return _shareUsers.filter(function(u){
    if(dept&&(u.dept||'(미지정)')!==dept) return false;
    if(team&&(u.team||'(미지정)')!==team) return false;
    return true;
  });
}
function _shareRenderRcptList(){
  var list=document.getElementById('share-rcpt-list'); if(!list) return;
  var us=_shareFilteredUsers();
  list.innerHTML=us.length?us.map(function(u){
    var sub=[u.team,u.email].filter(Boolean).join(' · ');
    return '<label style="display:flex;align-items:center;gap:8px;padding:6px 10px;cursor:pointer;font-size:12.5px;border-bottom:1px solid #f0f0f3;"><input type="checkbox" onclick="_shareSel[this.value]=this.checked;_shareUpdCount();" value="'+_shAttr(u.email)+'"'+(_shareSel[u.email]?' checked':'')+' style="width:15px;height:15px;cursor:pointer;flex-shrink:0;"><b style="flex-shrink:0;">'+_shEsc(u.name||u.username)+'</b><span style="color:var(--text3);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+_shEsc(sub)+'</span></label>';
  }).join(''):'<div style="font-size:12px;color:var(--text3);padding:12px;text-align:center;">해당 조건의 사용자가 없습니다.</div>';
  var allck=document.getElementById('share-sel-all'); if(allck) allck.checked=us.length>0&&us.every(function(u){return _shareSel[u.email];});
  _shareUpdCount();
}
function _shareSelectAllShown(on){ _shareFilteredUsers().forEach(function(u){ _shareSel[u.email]=on; }); _shareRenderRcptList(); }
function _shareUpdCount(){ var n=0; for(var k in _shareSel){ if(_shareSel[k]) n++; } var el=document.getElementById('share-sel-count'); if(el) el.textContent=n?('선택 '+n+'명'):''; }
function _openShareDialog(idLabel, sec, users){
  var old=document.getElementById('share-mail-modal'); if(old) old.remove();
  var m=document.createElement('div'); m.id='share-mail-modal';
  m.style.cssText='position:fixed;inset:0;z-index:100050;background:rgba(15,22,38,0.5);display:flex;align-items:center;justify-content:center;';
  _shareUsers=(users||[]).filter(function(u){return u.email;}); _shareSel={};
  m.innerHTML='<div id="share-mail-box" style="width:560px;max-width:94vw;max-height:88vh;overflow:auto;background:var(--bg2);border-radius:14px;box-shadow:0 24px 64px rgba(0,0,0,0.4);">'
    +'<div onmousedown="modalDragStart(event,\'share-mail-box\')" style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:9px;cursor:move;user-select:none;"><i class="ti ti-mail-share" style="color:#2d6fd4;font-size:19px;"></i><b style="font-size:15px;flex:1;">메일 공유 — '+_shEsc(idLabel)+'</b><button onclick="document.getElementById(\'share-mail-modal\').remove()" style="width:28px;height:28px;border:none;border-radius:7px;background:var(--bg3);cursor:pointer;"><i class="ti ti-x"></i></button></div>'
    +'<div style="padding:16px 18px;">'
      +'<div style="font-size:11.5px;font-weight:700;color:var(--text2);margin-bottom:6px;">받는 사람 <span style="font-weight:400;color:var(--text3);">— 담당 → 팀 필터 후 선택</span></div>'
      +'<div style="display:flex;gap:8px;margin-bottom:8px;">'
        +'<select id="share-f-dept" onchange="_shareDeptChange()" style="flex:1;font-size:12.5px;padding:7px 9px;border:1px solid var(--border);border-radius:7px;cursor:pointer;background:#fff;"></select>'
        +'<select id="share-f-team" onchange="_shareRenderRcptList()" style="flex:1;font-size:12.5px;padding:7px 9px;border:1px solid var(--border);border-radius:7px;cursor:pointer;background:#fff;"></select>'
      +'</div>'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;">'
        +'<label style="font-size:11px;color:var(--text2);cursor:pointer;display:flex;align-items:center;gap:5px;"><input type="checkbox" id="share-sel-all" onclick="_shareSelectAllShown(this.checked)" style="width:14px;height:14px;cursor:pointer;"> 보이는 사람 전체</label>'
        +'<span id="share-sel-count" style="font-size:11px;color:#2d6fd4;font-weight:700;"></span>'
      +'</div>'
      +'<div id="share-rcpt-list" style="max-height:200px;overflow:auto;border:1px solid var(--border);border-radius:8px;margin-bottom:10px;background:#fff;"></div>'
      +'<div style="font-size:11.5px;font-weight:700;color:var(--text2);margin-bottom:6px;">직접 입력 (콤마로 여러 명)</div>'
      +'<input id="share-free-emails" placeholder="예: a@ubiquoss.com, b@ubiquoss.com" style="width:100%;box-sizing:border-box;font-size:13px;padding:9px 11px;border:1px solid var(--border);border-radius:8px;margin-bottom:12px;outline:none;">'
      +'<style>#share-memo-wys:empty:before{content:attr(data-ph);color:#9aa7bd;pointer-events:none;}#share-memo-wys ul,#share-memo-wys ol{padding-left:26px;margin:4px 0;}#share-memo-wys li{margin:2px 0;}#share-memo-wys blockquote{margin:4px 0 4px 18px;padding-left:10px;border-left:2px solid var(--border);}</style>'
      +'<div style="font-size:11.5px;font-weight:700;color:var(--text2);margin-bottom:6px;">메모 (선택) <span style="font-weight:400;color:var(--text3);">— 서식 편집</span></div>'
      +'<div style="display:flex;flex-wrap:wrap;gap:2px;align-items:center;border:1px solid var(--border);border-bottom:none;border-radius:8px 8px 0 0;padding:5px 7px;background:var(--bg3);">'
        +'<button onmousedown="event.preventDefault()" onclick="_memoWys(\'bold\')" title="굵게" style="border:none;background:none;cursor:pointer;padding:3px 8px;border-radius:5px;color:var(--text2);font-weight:800;">B</button>'
        +'<button onmousedown="event.preventDefault()" onclick="_memoWys(\'italic\')" title="기울임" style="border:none;background:none;cursor:pointer;padding:3px 8px;border-radius:5px;color:var(--text2);font-style:italic;">I</button>'
        +'<button onmousedown="event.preventDefault()" onclick="_memoWys(\'underline\')" title="밑줄" style="border:none;background:none;cursor:pointer;padding:3px 8px;border-radius:5px;color:var(--text2);text-decoration:underline;">U</button>'
        +'<select onchange="_memoWys(\'fontSize\',this.value);this.selectedIndex=0" title="글자 크기" style="font-size:11px;padding:3px 4px;border:1px solid var(--border);border-radius:5px;cursor:pointer;background:#fff;color:var(--text2);"><option value="">크기</option><option value="1">아주작게</option><option value="2">작게</option><option value="3">보통</option><option value="5">크게</option><option value="6">아주크게</option></select>'
        +'<span style="width:1px;height:16px;background:var(--border);margin:0 3px;"></span>'
        +'<button onmousedown="event.preventDefault()" onclick="_memoWys(\'insertUnorderedList\')" title="목록" style="border:none;background:none;cursor:pointer;padding:3px 7px;border-radius:5px;color:var(--text2);font-size:14px;"><i class="ti ti-list"></i></button>'
        +'<button onmousedown="event.preventDefault()" onclick="_memoWys(\'insertOrderedList\')" title="번호 목록" style="border:none;background:none;cursor:pointer;padding:3px 7px;border-radius:5px;color:var(--text2);font-size:14px;"><i class="ti ti-list-numbers"></i></button>'
        +'<button onmousedown="event.preventDefault()" onclick="_memoWys(\'indent\')" title="들여쓰기" style="border:none;background:none;cursor:pointer;padding:3px 7px;border-radius:5px;color:var(--text2);font-size:14px;"><i class="ti ti-indent-increase"></i></button>'
        +'<button onmousedown="event.preventDefault()" onclick="_memoWys(\'outdent\')" title="내어쓰기" style="border:none;background:none;cursor:pointer;padding:3px 7px;border-radius:5px;color:var(--text2);font-size:14px;"><i class="ti ti-indent-decrease"></i></button>'
        +'<label title="글자색" style="display:inline-flex;align-items:center;padding:2px 5px;cursor:pointer;"><i class="ti ti-letter-a" style="font-size:14px;color:var(--text2);"></i><input type="color" onchange="_memoWys(\'foreColor\',this.value)" style="width:20px;height:18px;border:none;background:none;cursor:pointer;padding:0;"></label>'
        +'<button onmousedown="event.preventDefault()" onclick="_memoWysLink()" title="링크" style="border:none;background:none;cursor:pointer;padding:3px 7px;border-radius:5px;color:var(--text2);font-size:14px;"><i class="ti ti-link"></i></button>'
        +'<button onmousedown="event.preventDefault()" onclick="_memoWys(\'removeFormat\')" title="서식 지우기" style="border:none;background:none;cursor:pointer;padding:3px 7px;border-radius:5px;color:var(--text2);font-size:14px;"><i class="ti ti-clear-formatting"></i></button>'
      +'</div>'
      +'<div id="share-memo-wys" contenteditable="true" data-ph="받는 사람에게 전할 한마디" style="border:1px solid var(--border);border-radius:0 0 8px 8px;min-height:84px;max-height:200px;overflow:auto;padding:9px 11px;background:#fff;outline:none;font-size:13px;color:#1c2942;line-height:1.6;margin-bottom:8px;"></div>'
      +'<div style="font-size:11px;color:var(--text3);">포함 섹션: <b>'+_shareSecLabels(sec)+'</b> <span>(변경: 시스템 → 메일 설정 → TC·REQ 공유 폼)</span></div>'
    +'</div>'
    +'<div style="padding:12px 18px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;">'
      +'<button onclick="_shareDoPreview()" style="font-size:13px;font-weight:700;padding:9px 16px;border:1px solid #2d6fd4;border-radius:8px;background:#fff;color:#2d6fd4;cursor:pointer;"><i class="ti ti-eye"></i> 미리보기</button>'
      +'<button id="share-send-btn" onclick="_shareDoSend()" style="font-size:13px;font-weight:700;padding:9px 22px;border:none;border-radius:8px;background:#2d6fd4;color:#fff;cursor:pointer;"><i class="ti ti-send"></i> 보내기</button>'
    +'</div>'
  +'</div>';
  document.body.appendChild(m);
  m.addEventListener('click',function(e){ if(e.target===m) m.remove(); });
  _shareInitFilters();
}
function _shareCollectRecipients(){
  var to=[]; for(var k in _shareSel){ if(_shareSel[k]) to.push(k); }
  var free=((document.getElementById('share-free-emails')||{}).value)||'';
  free.split(/[,;\s]+/).forEach(function(e){ e=e.trim(); if(e) to.push(e); });
  return Array.from(new Set(to));
}
function _shareBuildHtml(){
  if(!_shareState) return '';
  var memoEl=document.getElementById('share-memo-wys');
  var memo=memoEl?memoEl.innerHTML:'';
  if(/^(?:\s|&nbsp;|<br\s*\/?>)*$/i.test(memo)) memo='';   // 빈 편집기 정리
  var o=_shareState.obj, f=_shareState.form||{};
  return buildShareReportHtml(o, _shareState.sec, {intro:f.intro||'', outro:f.outro||'', memo:memo, appUrl:_shareState.appUrl||''});
}
function _shareSubject(){
  var o=_shareState.obj, f=_shareState.form||{};
  var tpl=f.subject||'[ubiQuoss-TOP] {id} {title}';
  return tpl.replace(/\{id\}/g,o.id).replace(/\{title\}/g,o.title).replace(/\{status\}/g,o.status);
}
function _shareDoPreview(){ var html=_shareBuildHtml(); if(typeof mailShowPreview==='function') mailShowPreview(html,'메일 공유 미리보기'); else { var w=window.open('','_blank'); if(w){ w.document.write(html); w.document.close(); } } }
async function _shareDoSend(){
  var to=_shareCollectRecipients();
  if(!to.length){ if(typeof showToast==='function')showToast('받는 사람을 선택하거나 입력하세요'); return; }
  var btn=document.getElementById('share-send-btn'); if(btn){ btn.disabled=true; btn.textContent='보내는 중…'; }
  try{
    var d=await userApi('POST','/api/share-mail',{to:to, subject:_shareSubject(), html:_shareBuildHtml()});
    if(typeof showToast==='function')showToast('✅ 공유 메일 발송: '+(((d&&d.sent)||to).join(', ')));
    var m=document.getElementById('share-mail-modal'); if(m) m.remove();
  }catch(e){ if(typeof showToast==='function')showToast('발송 실패: '+((e&&e.message)||e)); if(btn){ btn.disabled=false; btn.innerHTML='<i class="ti ti-send"></i> 보내기'; } }
}

function _whoNow(){ return (typeof currentUser!=='undefined'&&currentUser&&(currentUser.name||currentUser.username))||'admin'; }   // 현재 사용자(생성자·변경자 스탬프)
function req2TabDetails(r){
  const fmtDate=d=>{if(!d)return'-';const dt=new Date(d);return isNaN(dt)?d:dt.toLocaleDateString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).replace(/\. /g,'/').replace('.','')};
  const _esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const creator=r.created_by||r.author||r.owner||'–';
  const modifier=r.updated_by||'–';
  const who=(nm,date)=>`<span style="font-size:12.5px;color:var(--text);font-weight:600;">${_esc(nm)}</span><span style="font-size:11.5px;color:var(--text3);margin-left:8px;">${fmtDate(date)}</span>`;
  const row=(label,content)=>
    '<div style="display:flex;align-items:flex-start;gap:0;padding:10px 0;border-bottom:1px solid #f5f5f5;">'+
    '<div style="width:130px;flex-shrink:0;font-size:12.5px;color:#aaa;padding-top:2px;">'+label+'</div>'+
    '<div style="flex:1;">'+content+'</div>'+
    '</div>';

  return `
    <div style="padding:4px 0;">
      ${row('Confluence URL',`<div contenteditable="true"
        style="font-size:12.5px;color:${r.confluence?'var(--blue)':'var(--text3)'};outline:none;padding:6px 10px;border-radius:6px;border:1.5px solid var(--border);background:#fff;"
        onblur="req2InlineUpdate('${r.id}','confluence',this.innerText)"
        onfocus="this.style.borderColor='var(--blue)';">${r.confluence||'http://wiki.ubiquoss.com/...'}</div>`)}
      ${row('생성자',`<span style="font-size:12.5px;color:var(--text);font-weight:600;">${_esc(creator)}</span>`)}
      ${row('변경자',`<span style="font-size:12.5px;color:var(--text);font-weight:600;">${_esc(modifier)}</span>`)}
      ${row('생성일',`<span style="font-size:12.5px;color:var(--text2);">${fmtDate(r.created_at)}</span>`)}
      ${row('변경일',`<span style="font-size:12.5px;color:var(--text2);">${fmtDate(r.updated_at)}</span>`)}
      ${renderCustomFieldsForTarget('req', r, (fid,val)=>saveREQCustomField(r.id,fid,val))}
    </div>`;
}

// 시나리오 표 행(tbody) HTML 생성 — 전체 탭 재렌더 없이 부분 갱신에 재사용
function req2ScenarioRowsHtml(r){
  let scs=[];
  try{scs=JSON.parse(r.scenarios||'[]');if(!Array.isArray(scs))scs=[];}catch(e){}
  const supportOpts=['필수','선택','개발예정','개발 중'];
  const supportColor={'필수':'var(--blue)','선택':'var(--green)','개발예정':'var(--yellow)','개발 중':'var(--red)'};
  const supportBg={'필수':'rgba(45,111,212,0.1)','선택':'rgba(0,168,114,0.1)','개발예정':'rgba(196,138,0,0.1)','개발 중':'rgba(229,62,90,0.1)'};
  const scRows=scs.map((sc,i)=>{
    const supColor=supportColor[sc.support||'선택']||'var(--border)';
    const supBg=supportBg[sc.support||'선택']||'#fff';
    const supOpts=supportOpts.map(o=>'<option value="'+o+'" '+(((sc.support||'선택')===o)?'selected':'')+'>'+o+'</option>').join('');
    return '<tr style="background:#fff;">'+
      '<td style="padding:2px 12px;border-top:1px solid #f0f1f3;font-size:11px;font-weight:700;color:var(--blue);white-space:nowrap;vertical-align:top;">'+(sc.id||'SC-'+String(i+1).padStart(2,'0'))+'</td>'+
      '<td style="padding:2px 12px;border-top:1px solid #f0f1f3;"><div contenteditable="true" style="font-size:12.5px;color:var(--text);outline:none;padding:2px 6px;border-radius:4px;border:1px solid transparent;line-height:1.45;"'+
        ' onblur="req2SaveScenarioField(\''+r.id+'\','+i+',\'desc\',this.innerText)"'+
        ' onfocus="this.style.borderColor=\'var(--green)\'">'+(sc.desc||'')+'</div></td>'+
      '<td style="padding:2px 12px;border-top:1px solid #f0f1f3;vertical-align:top;"><select onchange="req2SaveScenarioField(\''+r.id+'\','+i+',\'support\',this.value,this)" style="font-size:12.5px;padding:3px 8px;border-radius:20px;border:1.5px solid '+supColor+';background:'+supBg+';color:'+supColor+';outline:none;cursor:pointer;font-weight:600;">'+supOpts+'</select></td>'+
      '<td style="padding:2px 8px;border-top:1px solid #f0f1f3;text-align:center;vertical-align:top;"><button onclick="req2DeleteScenario(\''+r.id+'\','+i+')" style="background:none;border:none;cursor:pointer;color:var(--text3);" onmouseenter="this.style.color=\'var(--red)\'" onmouseleave="this.style.color=\'var(--text3)\'"><i class="ti ti-x" style="font-size:12.5px;"></i></button></td>'+
      '</tr>';
  }).join('');
  return scRows||'<tr><td colspan="4" style="padding:20px;text-align:center;font-size:12.5px;color:var(--text3);">시나리오가 없습니다.</td></tr>';
}

// 시나리오 표만 부분 갱신 (TinyMCE/구성도 재초기화·스크롤 리셋 없이 즉시 반영)
function req2RenderScenarioRows(reqId){
  const r=reqList.find(x=>x.id===reqId);
  if(!r) return;
  let scs=[];
  try{scs=JSON.parse(r.scenarios||'[]');if(!Array.isArray(scs))scs=[];}catch(e){}
  const tbody=document.getElementById('req2-sc-list-'+reqId);
  if(tbody) tbody.innerHTML=req2ScenarioRowsHtml(r);
  const cnt=document.getElementById('req2-sc-count-'+reqId);
  if(cnt) cnt.textContent=scs.length;
}

function req2TabScenario(r){
  let scs=[];
  try{scs=JSON.parse(r.scenarios||'[]');if(!Array.isArray(scs))scs=[];}catch(e){}

  // 개요 (TinyMCE)
  const _ovFp=(function(){ try{ const sel=document.getElementById('chat-model-select')?.value; const L=(typeof llmList!=='undefined'?llmList:[]); let lm=L.find(x=>x.id===sel)||L.find(x=>x.status==='active'&&(x.uses||[]).includes('req'))||L.find(x=>x.status==='active'); return ((lm&&lm.field_prompts&&lm.field_prompts.req&&lm.field_prompts.req.overview)||'').trim(); }catch(e){ return ''; } })();
  const _ovDefault=(_ovFp?(_ovFp+'\n'):'다음 네트워크 요구사항의 개요를 한국어로 작성해주세요.\n')+'REQ ID: '+r.reqid+'\n제목: '+r.title;
  const ovSection=
    '<div style="margin-bottom:16px;">'+
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">'+
    '<div class="req2-field-label" style="margin:0;font-size:12.5px;">설명</div>'+
    '<div style="position:relative;">'+
    ''+
    '<div id="req2-prompt-popover-'+r.id+'-ov" style="display:none;width:420px;background:#fff;border:1.5px solid var(--blue);border-radius:10px;padding:12px;">'+
    '<div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:12px;"><i class="ti ti-sparkles" style="color:#9d7bff;"></i> LLM 프롬프트 편집</div>'+
    '<div style="font-size:10px;color:var(--text3);margin-bottom:6px;">'+(_ovFp?'LLM 설정의 개요 프롬프트가 자동 적용됨 (여기서 1회 수정 가능)':'LLM 설정에 개요 프롬프트가 없어 기본값 사용')+'</div>'+
    '<textarea id="req2-ov-prompt-'+r.id+'" rows="8" style="width:100%;font-size:14px;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;background:#f8f9fb;color:var(--text);outline:none;resize:vertical;line-height:1.8;">'+_ovDefault+'</textarea>'+
    '<div style="display:flex;gap:6px;margin-top:8px;justify-content:flex-end;">'+
    '<button onclick="req2LLMDesc(\''+r.id+'\');req2ClosePrompt()" style="font-size:12.5px;padding:6px 16px;border-radius:6px;border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:600;">생성</button>'+
    '</div></div></div></div>'+
    '<div id="req2-ov-'+r.id+'" style="width:100%;"></div>'+
    '<div id="req2-ov-notice-'+r.id+'" style="font-size:12.5px;color:#9d7bff;margin-top:4px;display:none;"></div>'+
    '</div>';

  // 시나리오 테이블
  const scSection=
    '<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;">'+
    '<div style="padding:10px 14px;background:#f8f9fb;display:flex;align-items:center;justify-content:space-between;">'+
    '<span style="font-size:12.5px;font-weight:700;">구현 및 동작 시나리오 <span id="req2-sc-count-'+r.id+'" style="font-size:12.5px;font-weight:600;padding:2px 8px;border-radius:10px;background:rgba(45,111,212,0.1);color:var(--blue);">'+scs.length+'</span></span>'+
    '<div style="display:flex;gap:6px;align-items:center;position:relative;">'+
    '<button onclick="req2AddScenario(\''+r.id+'\')" style="font-size:12.5px;padding:5px 12px;border-radius:6px;border:1.5px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;display:flex;align-items:center;gap:4px;font-weight:500;white-space:nowrap;"><i class="ti ti-plus"></i> 추가</button>'+
    '<div style="position:relative;">'+
    ''+
    '<div id="req2-prompt-popover-'+r.id+'-sc" style="display:none;width:400px;background:#fff;border:1.5px solid var(--blue);border-radius:10px;padding:12px;">'+
    '<div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:12px;"><i class="ti ti-sparkles" style="color:#9d7bff;"></i> LLM 프롬프트 편집</div>'+
    '<textarea id="req2-sc-prompt-'+r.id+'" rows="8" style="width:100%;font-size:14px;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;background:#f8f9fb;color:var(--text);outline:none;resize:vertical;line-height:1.8;">'+'다음 REQ의 동작 시나리오를 3~5개 생성해주세요.\nREQ ID: '+r.reqid+'\n제목: '+r.title+'\n개요: '+(r.overview||'없음')+'</textarea>'+
    '<div style="display:flex;gap:6px;margin-top:8px;justify-content:flex-end;">'+
    '<button onclick="llmGenScenarios(\''+r.id+'\');req2ClosePrompt()" style="font-size:12.5px;padding:6px 16px;border-radius:6px;border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:600;">생성</button>'+
    '</div></div></div></div></div>'+
    '<table style="width:100%;border-collapse:collapse;">'+
    '<thead><tr>'+
    '<th style="padding:9px 12px;text-align:left;font-size:12.5px;font-weight:600;color:#bbb;width:140px;">ID</th>'+
    '<th style="padding:9px 12px;text-align:left;font-size:12.5px;font-weight:600;color:#bbb;">Summary</th>'+
    '<th style="padding:9px 12px;text-align:left;font-size:12.5px;font-weight:600;color:#bbb;width:110px;">Status</th>'+
    '<th style="width:32px;"></th>'+
    '</tr></thead>'+
    '<tbody id="req2-sc-list-'+r.id+'">'+
    req2ScenarioRowsHtml(r)+
    '</tbody></table></div>';

  return ovSection;  // 구현 및 동작 시나리오 표 제거 (TC로 일원화) — 개요만 표시
}



// ── TC 엑셀형 그리드: 색상 배지 셀 + 우클릭 아래로 채우기 ──
function cfTint(c){
  if(!c) return '#f5f5f5';
  if(c.indexOf('rgb(')===0) return c.replace('rgb(','rgba(').replace(')',', 0.12)');
  if(c[0]==='#'){ let h=c.slice(1); if(h.length===3) h=h.split('').map(x=>x+x).join(''); const r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16); return 'rgba('+r+','+g+','+b+',0.12)'; }
  return '#f5f5f5';
}function tcGridCFCell(tcid,f,value,reqId,idx){
  const v=value||'';
  if(f.type==='Select'){
    const opts=f.options||[];
    const cur=opts.find(o=>cfOptValue(o)===v);
    const col=cur?cfOptColor(cur):'var(--text3)';
    const bg=cur?cfTint(cfOptColor(cur)):'#fff';
    const o='<option value="">-</option>'+opts.map(op=>{const ov=cfOptValue(op);return '<option value="'+ov+'" '+(v===ov?'selected':'')+'>'+ov+'</option>';}).join('');
    return '<select oncontextmenu="tcGridShowCtx(event,\''+reqId+'\',\'cf\',\''+f.id+'\','+idx+',this.value)" onchange="tcGridSetCF(\''+tcid+'\',\''+f.id+'\',this.value,this)" style="font-size:12.5px;padding:2px 8px;border-radius:20px;border:1.5px solid '+col+';background:'+bg+';color:'+col+';outline:none;cursor:pointer;font-weight:600;max-width:150px;">'+o+'</select>';
  }
  if(f.type==='MultiSelect'){
    const opts=f.options||[];
    const sel=(v||'').split(',').filter(Boolean);
    const chips=sel.length?sel.map(sv=>{const o=opts.find(x=>cfOptValue(x)===sv);const oc=o?cfOptColor(o):'var(--text2)';return '<span style="font-size:10px;padding:1px 7px;border-radius:10px;border:1px solid '+oc+';background:'+cfTint(oc)+';color:'+oc+';white-space:nowrap;">'+sv+'</span>';}).join(''):'<span style="font-size:12.5px;color:var(--text3);">—</span>';
    return '<div onclick="event.stopPropagation();tcGridOpenMulti(event,\''+tcid+'\',\''+f.id+'\')" oncontextmenu="tcGridShowCtx(event,\''+reqId+'\',\'cf\',\''+f.id+'\','+idx+',\''+sel.join(',')+'\')" title="클릭해서 선택" style="display:flex;flex-wrap:wrap;gap:3px;align-items:center;cursor:pointer;min-height:22px;max-width:160px;">'+chips+'<i class="ti ti-chevron-down" style="font-size:12.5px;color:var(--text3);margin-left:auto;flex-shrink:0;"></i></div>';
  }
  if(f.type==='Checkbox'){
    return '<input type="checkbox" '+(v==='true'?'checked':'')+' onchange="saveTCCustomField(\''+tcid+'\',\''+f.id+'\',String(this.checked))" style="width:15px;height:15px;cursor:pointer;">';
  }
  const itype=f.type==='Number'?'number':f.type==='Date'?'date':'text';
  const safe=(typeof v==='string')?v.replace(/"/g,'&quot;'):v;
  return '<input type="'+itype+'" value="'+safe+'" oncontextmenu="tcGridShowCtx(event,\''+reqId+'\',\'cf\',\''+f.id+'\','+idx+',this.value)" onblur="saveTCCustomField(\''+tcid+'\',\''+f.id+'\',this.value)" placeholder="'+(f.placeholder||'')+'" style="font-size:12.5px;padding:3px 6px;border:1px solid var(--border);border-radius:4px;outline:none;width:110px;box-sizing:border-box;">';
}
function tcGridSetCF(tcid,fieldId,value,el){
  saveTCCustomField(tcid,fieldId,value);
  const f=(customFields.tc||[]).find(x=>x.id===fieldId)||{};
  const o=(f.options||[]).find(x=>cfOptValue(x)===value);
  const col=o?cfOptColor(o):'var(--text3)';
  el.style.color=col; el.style.borderColor=col; el.style.background=o?cfTint(cfOptColor(o)):'#fff';
}// MultiSelect 셀 클릭 → 팝오버에서 선택
function tcGridBuildMulti(m,tcid,fieldId){
  const f=(customFields.tc||[]).find(x=>x.id===fieldId)||{};
  const tc=tcList.find(t=>t.tcid===tcid)||{};
  const sel=((tc.custom_fields||{})[fieldId]||'').split(',').filter(Boolean);
  m.innerHTML=(f.options||[]).map(o=>{const ov=cfOptValue(o);const oc=cfOptColor(o);const on=sel.includes(ov);return '<span onclick="tcGridMultiPick(\''+tcid+'\',\''+fieldId+'\',\''+ov+'\')" style="font-size:12.5px;padding:3px 10px;border-radius:12px;cursor:pointer;border:1px solid '+(on?oc:'var(--border)')+';background:'+(on?cfTint(oc):'#fff')+';color:'+(on?oc:'var(--text3)')+';">'+(on?'✓ ':'')+ov+'</span>';}).join('')||'<span style="font-size:12.5px;color:var(--text3);">옵션 없음</span>';
}
function tcGridOpenMulti(e,tcid,fieldId){
  e.stopPropagation();
  let m=document.getElementById('tc-grid-multi');
  if(!m){ m=document.createElement('div'); m.id='tc-grid-multi'; m.style.cssText='position:fixed;z-index:9000;background:#fff;border:1px solid var(--border);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.18);padding:8px;display:flex;flex-wrap:wrap;gap:5px;max-width:280px;'; document.body.appendChild(m); document.addEventListener('mousedown',ev=>{ if(m&&!m.contains(ev.target)) m.style.display='none'; }); }
  tcGridBuildMulti(m,tcid,fieldId);
  m.style.display='flex';
  const rect=e.currentTarget.getBoundingClientRect();
  m.style.left=Math.min(rect.left,window.innerWidth-300)+'px'; m.style.top=Math.min(rect.bottom+4,window.innerHeight-120)+'px';
}
function tcGridMultiPick(tcid,fieldId,optValue){
  const tc=tcList.find(t=>t.tcid===tcid); if(!tc) return;
  const cur=((tc.custom_fields||{})[fieldId]||'').split(',').filter(Boolean);
  const i=cur.indexOf(optValue); if(i>=0) cur.splice(i,1); else cur.push(optValue);
  saveTCCustomField(tcid,fieldId,cur.join(','));
  const m=document.getElementById('tc-grid-multi'); if(m&&m.style.display!=='none') tcGridBuildMulti(m,tcid,fieldId);
  if(tc.req_id) tcGridRerender(tc.req_id);
}
let _tcGridCtx={reqId:null,kind:null,fieldId:null,rowIdx:0,value:''};
function tcGridShowCtx(e,reqId,kind,fieldId,rowIdx,value){
  e.preventDefault();
  _tcGridCtx={reqId,kind,fieldId,rowIdx,value};
  let m=document.getElementById('tc-grid-ctx');
  if(!m){ m=document.createElement('div'); m.id='tc-grid-ctx'; m.style.cssText='position:fixed;z-index:9000;background:#fff;border:1px solid var(--border);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.18);padding:4px;font-size:12.5px;'; document.body.appendChild(m); document.addEventListener('mousedown',ev=>{ if(!m.contains(ev.target)) m.style.display='none'; }); }
  m.innerHTML='<div onclick="tcGridFill(true)" style="padding:7px 14px;cursor:pointer;border-radius:5px;white-space:nowrap;color:var(--text);" onmouseenter="this.style.background=\'rgba(45,111,212,0.08)\'" onmouseleave="this.style.background=\'\'"><i class="ti ti-arrow-bar-to-down"></i> 이 값을 아래로 채우기</div>'
    +'<div onclick="tcGridFill(false)" style="padding:7px 14px;cursor:pointer;border-radius:5px;white-space:nowrap;color:var(--text);" onmouseenter="this.style.background=\'rgba(45,111,212,0.08)\'" onmouseleave="this.style.background=\'\'"><i class="ti ti-arrows-down"></i> 전체 채우기</div>';
  m.style.display='block'; m.style.left=Math.min(e.clientX,window.innerWidth-220)+'px'; m.style.top=Math.min(e.clientY,window.innerHeight-90)+'px';
}
function tcGridFill(belowOnly){
  const c=_tcGridCtx; const r=reqList.find(x=>x.id===c.reqId);
  const m=document.getElementById('tc-grid-ctx'); if(m) m.style.display='none';
  if(!r) return;
  const tcs=tcList.filter(t=>t.req_id===r.id);
  tcs.forEach((t,i)=>{
    if(belowOnly && i<=c.rowIdx) return;
    if(c.kind==='name') saveTCField(t.tcid,'name',c.value);
    else if(c.kind==='type'||c.kind==='kind') updateTCField(t.tcid,c.kind,c.value);
    else saveTCCustomField(t.tcid,c.fieldId,c.value);
  });
  tcGridRerender(r.id);
  showToast(belowOnly?'아래로 채웠습니다':'전체 채웠습니다');
}
function tcGridRerender(reqId){
  const exp3=document.getElementById('page-explorer3');
  if(exp3&&exp3.classList.contains('active')){
    // 3열 우측 상세에 이 REQ의 "TC" 탭이 열려 있으면 그 패널 재렌더 (그리드 값 실시간 반영)
    if(typeof e3SelReq!=='undefined'&&e3SelReq===reqId&&typeof e3RenderReqDetail==='function'){ e3RenderReqDetail(reqId); }
    if(typeof e3RebuildTcBody==='function'){ e3RebuildTcBody(); }   // 가운데 TC 목록의 최근 결과·요약도 갱신
    return;
  }
  const exp3b=document.getElementById('page-explorer3-beta');
  if(exp3b&&exp3b.classList.contains('active')){
    if(typeof e3bRebuildTcBody==='function'){ e3bRebuildTcBody(); }
    return;
  }
  const exp=document.getElementById('page-explorer');
  if(exp&&exp.classList.contains('active')&&typeof expRenderREQDetail==='function'){ expRenderREQDetail(reqId); return; }
  if(document.getElementById('req2-tabcontent-'+reqId)&&typeof req2SwitchTab==='function'){ req2SwitchTab(reqId,'tc'); }
}

// TC의 최신 사이클 실행 결과 (가장 최근 created_at 사이클)
function tcLatestResult(tcid){
  let best=null;
  (typeof cycleList!=='undefined'?cycleList:[]).forEach(c=>{
    (c.items||[]).forEach(it=>{
      if(it.tcid===tcid){
        const d=c.created_at||'';
        const status=cycleItemStatus(it.steps||[]);
        if(!best||d>=best.date) best={date:d,status,version:c.version||'',cycleId:c.id};
      }
    });
  });
  return best;
}
function reqCoverage(r){
  const tcs=tcList.filter(t=>t.req_id===r.id);
  let pass=0,fail=0,exec=0;
  tcs.forEach(t=>{ const res=tcLatestResult(t.tcid); if(res&&res.status&&res.status!=='UNEXECUTED'){ exec++; const v=resultVerdict(res.status); if(v==='pass')pass++; else if(v==='fail')fail++; } });
  const total=tcs.length;
  return {total,exec,pass,fail,coverage: total?Math.round(exec/total*100):0, passRate: total?Math.round(pass/total*100):0};
}
function reqResultBadge(status,version){
  if(!status||status==='UNEXECUTED') return '<span style="font-size:10px;color:var(--text3);background:#f0f0f0;padding:2px 8px;border-radius:3px;white-space:nowrap;">미실행</span>';
  return '<span title="'+(version||'')+'" style="font-size:10px;font-weight:700;color:#fff;background:'+resultColor(status)+';padding:2px 8px;border-radius:3px;white-space:nowrap;">'+status+'</span>';
}
function req2TabTC(r){
  const tcs=tcList.filter(t=>t.req_id===r.id);
  const typeMap={'FT':'Function','PT':'Performance','ST':'Maintenance'};
  const typeOpts=['Protocol','Function','Performance','Security','Management','Maintenance'];
  const kindOpts=['자체','장애'];
  const cfs=(customFields&&customFields.tc)?customFields.tc.filter(f=>f.active!==false):[];
  const th=l=>'<th style="padding:7px 5px;text-align:left;font-size:12.5px;font-weight:600;color:#bbb;white-space:nowrap;border-bottom:1px solid var(--border);">'+l+'</th>';
  const headHtml='<tr>'+th('TC ID')+th('Summary')+th('최근 결과')+cfs.map(f=>th(f.label)).join('')+'</tr>';
  const tcRows=tcs.map((t,idx)=>{
    const cf=t.custom_fields||{};
    const td=inner=>'<td style="padding:4px 4px;border-bottom:1px solid #f0f1f3;vertical-align:middle;">'+inner+'</td>';
    const cells=
      '<td style="padding:4px 7px;border-bottom:1px solid #f0f1f3;font-size:11px;font-weight:700;color:var(--blue);white-space:nowrap;vertical-align:middle;">'+t.tcid+'</td>'
      +td('<div contenteditable="true" oncontextmenu="tcGridShowCtx(event,\''+r.id+'\',\'name\',\'\','+idx+',this.innerText)" onblur="saveTCField(\''+t.tcid+'\',\'name\',this.innerText)" onfocus="this.style.borderColor=\'var(--green)\'" style="font-size:12.5px;color:var(--text);outline:none;padding:2px 6px;border-radius:4px;border:1px solid transparent;min-width:140px;">'+(t.name||'')+'</div>')
      +td((()=>{const lr=tcLatestResult(t.tcid);return reqResultBadge(lr&&lr.status,lr&&lr.version);})())
      +cfs.map(f=>td(tcGridCFCell(t.tcid,f,cf[f.id],r.id,idx))).join('');
    return '<tr>'+cells+'</tr>';
  }).join('');
  const tableHtml=tcs.length?
    '<div style="overflow-x:auto;border:1px solid var(--border);border-radius:8px;"><table style="width:100%;border-collapse:collapse;font-size:12.5px;"><thead style="background:#f8f9fb;">'+headHtml+'</thead><tbody>'+tcRows+'</tbody></table></div>'
    +'<div style="font-size:12.5px;color:var(--text3);margin-top:6px;"><i class="ti ti-info-circle" style="font-size:12.5px;"></i> 셀에서 <b>우클릭</b> → "아래로 채우기"로 엑셀처럼 값을 복사할 수 있습니다.</div>'
    :'<div style="font-size:12.5px;color:var(--text3);padding:24px;text-align:center;">연결된 TC가 없습니다. 아래 버튼으로 생성하세요.</div>';
  const cov=reqCoverage(r);
  const covFailRate=cov.total?Math.round(cov.fail/cov.total*100):0;
  const covHtml='<div style="display:flex;align-items:center;gap:16px;padding:10px 16px;margin-bottom:12px;background:linear-gradient(135deg,rgba(45,111,212,0.06),transparent);border:1px solid rgba(45,111,212,0.15);border-radius:10px;">'+
    '<div style="flex:1;min-width:0;"><div style="font-size:10px;color:var(--text3);font-weight:700;letter-spacing:0.5px;">COVERAGE</div>'+
      '<div style="display:flex;align-items:center;gap:8px;margin-top:4px;">'+
        '<div style="flex:1;max-width:200px;height:8px;border-radius:4px;background:#e8e8e8;overflow:hidden;display:flex;"><div style="width:'+cov.passRate+'%;background:#00a872;"></div><div style="width:'+covFailRate+'%;background:#e53e5a;"></div></div>'+
        '<span style="font-size:14px;font-weight:800;color:var(--blue);">'+cov.coverage+'%</span><span style="font-size:12.5px;color:var(--text3);">('+cov.exec+'/'+cov.total+' 실행)</span>'+
      '</div>'+
    '</div>'+
    '<div style="text-align:center;flex-shrink:0;"><div style="font-size:18px;font-weight:800;color:#00a872;line-height:1;">'+cov.pass+'</div><div style="font-size:10px;color:#00a872;font-weight:600;">PASS</div></div>'+
    '<div style="text-align:center;flex-shrink:0;"><div style="font-size:18px;font-weight:800;color:#e53e5a;line-height:1;">'+cov.fail+'</div><div style="font-size:10px;color:#e53e5a;font-weight:600;">FAIL</div></div>'+
    '<div style="text-align:center;flex-shrink:0;"><div style="font-size:18px;font-weight:800;color:#aaa;line-height:1;">'+(cov.total-cov.exec)+'</div><div style="font-size:10px;color:#aaa;font-weight:600;">미실행</div></div>'+
  '</div>';
  return '<div style="padding:10px 0 14px;">'+covHtml+
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">'+
    '<span style="font-size:14px;font-weight:700;color:var(--text);">TC 목록 <span style="font-size:12.5px;color:var(--text3);font-weight:400;">('+tcs.length+'개)</span></span>'+
    '<div style="display:flex;gap:8px;">'+
    '<button onclick="openNewTC4ForREQ(\''+r.id+'\')" style="font-size:12.5px;padding:6px 14px;border-radius:6px;border:1.5px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;display:flex;align-items:center;gap:5px;font-weight:500;"><i class="ti ti-plus"></i> 수동 TC 추가</button>'+
    '<div style="position:relative;">'+
    '<button onclick="req2TogglePrompt(\''+r.id+'\',\'tc\')" style="font-size:12.5px;padding:6px 14px;border-radius:6px;border:1.5px solid rgba(157,123,255,0.35);background:rgba(157,123,255,0.08);color:#9d7bff;cursor:pointer;display:flex;align-items:center;gap:5px;font-weight:500;"><i class="ti ti-sparkles"></i> LLM으로 TC 생성</button>'+
    '<div id="req2-prompt-popover-'+r.id+'-tc" style="display:none;width:400px;background:#fff;border:1.5px solid var(--blue);border-radius:10px;padding:12px;">'+
    '<div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:12px;display:flex;align-items:center;gap:8px;"><i class="ti ti-sparkles" style="color:#9d7bff;font-size:18px;"></i> LLM 프롬프트 편집</div>'+
    '<textarea id="req2-tc-prompt-'+r.id+'" rows="10" style="width:100%;font-size:15px;padding:12px 14px;border:1.5px solid var(--border);border-radius:8px;background:#f8f9fb;color:var(--text);outline:none;resize:vertical;line-height:1.8;" onfocus="this.style.borderColor=\'var(--blue)\'" onblur="this.style.borderColor=\'var(--border)\'">'+'아래 요구사항과 구현 내용을 분석하여 시험 항목(TC)을 빠짐없이 상세히 생성해주세요.\nREQ ID: '+r.reqid+'\n제목: '+r.title+'\n개요: '+(r.overview||'없음')+'\n\n[구현 내용 / CLI 조회 결과]\n'+(r.implementation||'(REQ 상세의 「구현 내용」에 CLI 조회 결과를 입력하면 자동 반영됩니다)')+'</textarea>'+
    '<div style="display:flex;gap:10px;justify-content:flex-end;padding-top:12px;">'+
    '<button onclick="req2LLMGenTC(\''+r.id+'\');req2ClosePrompt()" style="font-size:14px;padding:9px 24px;border-radius:8px;border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:700;display:flex;align-items:center;gap:6px;box-shadow:0 2px 8px rgba(45,111,212,0.3);"><i class="ti ti-sparkles" style="font-size:16px;"></i> 생성</button>'+
    '</div></div></div>'+
    '</div></div>'+tableHtml+'</div>';
}

function req2TabIssues(r){
  const issues=r.issues||[];
  const history=r.issue_history||[];
  const issueRows=issues.map((iss,i)=>
    '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;font-size:12.5px;background:#fff;">'+
    '<i class="ti ti-link" style="color:#0052cc;font-size:16px;"></i>'+
    '<a href="'+(iss.url||'#')+'" target="_blank" style="color:var(--blue);font-family:monospace;font-weight:700;text-decoration:none;">'+iss.key+'</a>'+
    '<span style="color:var(--text2);flex:1;">'+(iss.summary||'')+'</span>'+
    '<span style="font-size:12.5px;padding:2px 8px;border-radius:10px;background:'+(iss.status==='Done'?'rgba(0,168,114,0.1)':'rgba(196,138,0,0.1)')+';color:'+(iss.status==='Done'?'var(--green)':'var(--yellow)')+';">'+(iss.status||'Open')+'</span>'+
    '<button onclick="req2DeleteIssue(\''+r.id+'\','+i+')" style="background:none;border:none;cursor:pointer;color:var(--text3);">x</button>'+
    '</div>'
  ).join('');
  const histRows=history.map(h=>
    '<tr style="background:#fff;">'+
    '<td style="padding:9px 12px;font-size:11px;font-weight:700;color:var(--blue);">'+(h.tcid||'')+'</td>'+
    '<td style="padding:9px 12px;color:var(--text2);">'+(h.summary||'')+'</td>'+
    '<td style="padding:9px 12px;"><span style="font-size:12.5px;padding:2px 8px;border-radius:10px;font-weight:600;background:'+(h.result==='Pass'?'rgba(0,168,114,0.1)':'rgba(229,62,90,0.1)')+';color:'+(h.result==='Pass'?'var(--green)':'var(--red)')+';">'+(h.result||'-')+'</span></td>'+
    '<td style="padding:9px 12px;font-size:12.5px;color:var(--text3);">'+(h.date||'')+' '+(h.executor?'('+h.executor+')':'')+'</td>'+
    '</tr>'
  ).join('');
  const jiraHtml=issues.length?issueRows:'<div style="padding:20px;text-align:center;font-size:12.5px;color:var(--text3);">연결된 JIRA 이슈가 없습니다.</div>';
  const histHtml=history.length?histRows:'<tr><td colspan="4" style="padding:20px;text-align:center;font-size:12.5px;color:var(--text3);">시험 이력이 없습니다.</td></tr>';
  return '<div style="margin-bottom:16px;">'+
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">'+
    '<div style="font-size:12.5px;font-weight:800;color:var(--text);">Issue Tracker</div>'+
    '<button onclick="req2AddIssue(\''+r.id+'\')" style="font-size:12.5px;padding:5px 12px;border-radius:6px;border:1.5px solid var(--border);background:#fff;cursor:pointer;">+ Issue 연결</button>'+
    '</div>'+
    '<div id="req2-issues-'+r.id+'" style="border:1px solid var(--border);border-radius:8px;overflow:hidden;">'+jiraHtml+'</div>'+
    '</div>'+
    '<div>'+
    '<div style="font-size:12.5px;font-weight:800;color:var(--text);margin-bottom:10px;">Requirements Issue History</div>'+
    '<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;">'+
    '<table style="width:100%;border-collapse:collapse;font-size:12.5px;border:none;">'+
    '<thead><tr>'+
    '<th style="padding:9px 12px;text-align:left;font-size:12.5px;font-weight:700;color:var(--text3);">TC ID</th>'+
    '<th style="padding:9px 12px;text-align:left;font-size:12.5px;font-weight:700;color:var(--text3);">TC Summary</th>'+
    '<th style="padding:9px 12px;text-align:left;font-size:12.5px;font-weight:700;color:var(--text3);">결과</th>'+
    '<th style="padding:9px 12px;text-align:left;font-size:12.5px;font-weight:700;color:var(--text3);">실행일 / 실행자</th>'+
    '</tr></thead><tbody>'+histHtml+'</tbody></table>'+
    '</div></div>';
}

async function req2SaveScenarioField(reqId, idx, field, value, selectEl){
  const r=reqList.find(x=>x.id===reqId);
  if(!r) return;
  let scs=[];
  try{scs=JSON.parse(r.scenarios||'[]');if(!Array.isArray(scs))scs=[];}catch(e){}
  if(scs[idx]) scs[idx][field]=value;
  r.scenarios=JSON.stringify(scs);
  await saveOneREQ(r);
  // 지원여부 select 색상 즉시 반영
  if(field==='support'&&selectEl){
    const supportColor={'필수':'var(--blue)','선택':'var(--green)','개발예정':'var(--yellow)','개발 중':'var(--red)'};
    const supportBg={'필수':'rgba(45,111,212,0.1)','선택':'rgba(0,168,114,0.1)','개발예정':'rgba(196,138,0,0.1)','개발 중':'rgba(229,62,90,0.1)'};
    const col=supportColor[value]||'var(--text)';
    const bg=supportBg[value]||'var(--bg3)';
    selectEl.style.color=col;
    selectEl.style.borderColor=col;
    selectEl.style.background=bg;
  }
}

function req2ShowImage(reqId, base64){
  const wrap=document.getElementById('req2-img-'+reqId);
  if(!wrap) return;
  wrap.style.display='block';
  wrap.innerHTML='';
  const container=document.createElement('div');
  container.style.cssText='position:relative;display:inline-block;max-width:100%;padding:8px;';
  const img=document.createElement('img');
  img.src=base64;
  img.style.cssText='max-width:100%;max-height:300px;border-radius:8px;display:block;border:1px solid var(--border);resize:both;overflow:auto;';
  // 삭제 버튼
  const delBtn=document.createElement('button');
  delBtn.innerHTML='<i class="ti ti-trash" style="font-size:14px;"></i>';
  delBtn.title='사진 삭제';
  delBtn.innerHTML='<i class="ti ti-trash" style="font-size:12.5px;"></i> 삭제';
  delBtn.style.cssText='position:absolute;top:10px;right:10px;background:rgba(229,62,90,0.88);color:#fff;border:none;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12.5px;font-weight:500;';
  // 재업로드 버튼
  const replBtn=document.createElement('button');
  replBtn.innerHTML='<i class="ti ti-refresh" style="font-size:14px;"></i> 교체';
  replBtn.innerHTML='<i class="ti ti-refresh" style="font-size:12.5px;"></i> 교체';
  replBtn.style.cssText='position:absolute;top:12px;right:60px;background:rgba(45,111,212,0.9);color:#fff;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:12.5px;';
  replBtn.style.cssText='position:absolute;top:10px;right:70px;background:rgba(45,111,212,0.88);color:#fff;border:none;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12.5px;font-weight:500;';
  container.appendChild(img);
  container.appendChild(delBtn);
  container.appendChild(replBtn);
  wrap.appendChild(container);
}

// Scenario 탭 초기 로드 시 기존 이미지 복원


// ── 탭 전환 ──
function req2SwitchTab(reqId, tab){
  window['req2ActiveTab_'+reqId]=tab;
  sessionStorage.setItem('utop_last_req_tab', tab);
  sessionStorage.setItem('utop_last_req_id', reqId);
  const tabs=document.querySelectorAll('#req2-detail-'+reqId+' .req2-tab');
  tabs.forEach(t=>t.classList.remove('active'));
  const tabNames=['details','scenario','tc','issues'];
  const idx=tabNames.indexOf(tab);
  if(tabs[idx]) tabs[idx].classList.add('active');
  const r=reqList.find(x=>x.id===reqId);
  if(!r) return;
  const content=document.getElementById('req2-tabcontent-'+reqId);
  if(content) content.innerHTML=req2TabContent(r,tab);
  // Requirement Description 탭: TinyMCE 초기화
  if(tab==='scenario'){
    // DOM 렌더 완료 후 TinyMCE 초기화
    req2DestroyTiny(reqId);
    setTimeout(()=>req2InitTiny(reqId), 150);
  } else if(tab==='impl'){
    req2DestroyTiny(reqId);
    setTimeout(()=>req2InitTinyImpl(reqId), 150);
  } else {
    req2DestroyTiny(reqId);
  }
  // Scenario 탭: 구성도 별도 삽입 (백틱 충돌 방지)
  if(tab==='scenario'){
    const topoCanvas=document.getElementById('req2-sc-topo-'+reqId);
    if(topoCanvas){
      topoCanvas.innerHTML=renderTopoEditor(r);
      setTimeout(()=>topoDrawioInit(reqId), 200);
    }
  }
}

// ── 행 펼치기 ──
function req2ToggleRow(reqId){
  const key='req-'+reqId;
  if(req2ExpandedIds.has(key)){
    req2ExpandedIds.delete(key);
    sessionStorage.removeItem('utop_last_req_id');
    req2DestroyTiny(reqId);
  } else {
    req2ExpandedIds.add(key);
    sessionStorage.setItem('utop_last_req_id', reqId);
    sessionStorage.setItem('utop_last_req_tab', window['req2ActiveTab_'+reqId]||'details');
  }
  req2Render();
  // 펼쳐지고 scenario 탭이 기본이면 TinyMCE 즉시 초기화
  if(req2ExpandedIds.has(key)){
    const curTab=window['req2ActiveTab_'+reqId]||'details';
    if(curTab==='scenario'){
      setTimeout(()=>req2InitTiny(reqId), 200);
    } else if(curTab==='impl'){
      setTimeout(()=>req2InitTinyImpl(reqId), 200);
    }
  }
}

// ── 인라인 업데이트 ──
function req2InlineUpdate(reqId, field, value){
  const r=reqList.find(x=>x.id===reqId);
  if(!r) return;
  r[field]=value;
  r.updated_at=new Date().toISOString().slice(0,10); r.updated_by=_whoNow();
  saveOneREQ(r);
  // 우선순위/상태 변경 시 테이블 행 뱃지 즉시 갱신
  if(field==='priority'||field==='status'){
    req2Render();
  }
}

// ── 시나리오 ──
function req2AddScenario(reqId){
  const r=reqList.find(x=>x.id===reqId);
  if(!r) return;
  let scs=[];
  try{scs=JSON.parse(r.scenarios||'[]');if(!Array.isArray(scs))scs=[];}catch(e){}
  const idx=scs.length+1;
  scs.push({id:'SC-'+String(idx).padStart(2,'0'),desc:'',support:'선택'});
  r.scenarios=JSON.stringify(scs);
  saveOneREQ(r);
  // 시나리오 표만 부분 갱신 — 전체 탭 재렌더(TinyMCE/구성도 재초기화·깜박임) 방지
  req2RenderScenarioRows(reqId);
  // 새로 추가된 행으로 스크롤 후 설명 입력 포커스
  const tbody=document.getElementById('req2-sc-list-'+reqId);
  const newRow=tbody&&tbody.lastElementChild;
  if(newRow){
    newRow.scrollIntoView({block:'nearest',behavior:'smooth'});
    const editable=newRow.querySelector('[contenteditable]');
    if(editable) editable.focus();
  }
}

function req2DeleteScenario(reqId, idx){
  const r=reqList.find(x=>x.id===reqId);
  if(!r) return;
  let scs=[];
  try{scs=JSON.parse(r.scenarios||'[]');if(!Array.isArray(scs))scs=[];}catch(e){}
  scs.splice(idx,1);
  r.scenarios=JSON.stringify(scs);
  saveOneREQ(r);
  // 시나리오 표만 부분 갱신 — 전체 탭 재렌더 방지
  req2RenderScenarioRows(reqId);
}

// ── Issues ──
function req2AddIssue(reqId){
  const key=prompt('JIRA 이슈 키를 입력하세요 (예: PROJ-123):');
  if(!key||!key.trim()) return;
  const r=reqList.find(x=>x.id===reqId);
  if(!r) return;
  if(!r.issues) r.issues=[];
  r.issues.push({key:key.trim(), summary:'', status:'Open', url:(window._jiraBase||'https://jira.ubiquoss.com')+'/browse/'+key.trim()});
  saveOneREQ(r);
  req2SwitchTab(reqId,'issues');
}

function req2DeleteIssue(reqId, idx){
  const r=reqList.find(x=>x.id===reqId);
  if(!r||!r.issues) return;
  r.issues.splice(idx,1);
  saveOneREQ(r);
  req2SwitchTab(reqId,'issues');
}

// REQ 제목 인라인 편집
function req2EditTitle(reqId){
  const view=document.getElementById('req2-title-view-'+reqId);
  const edit=document.getElementById('req2-title-edit-'+reqId);
  if(!view||!edit) return;
  const r=reqList.find(x=>x.id===reqId);
  edit.value=r?.title||'';
  view.style.display='none';
  edit.style.display='block';
  edit.focus();
  edit.select();
}
async function req2SaveTitle(reqId, value){
  const view=document.getElementById('req2-title-view-'+reqId);
  const edit=document.getElementById('req2-title-edit-'+reqId);
  const title=value.trim();
  if(!title){ req2CancelTitle(reqId); return; }
  const r=reqList.find(x=>x.id===reqId);
  if(r){
    r.title=title;
    r.updated_at=new Date().toISOString().slice(0,10); r.updated_by=_whoNow();
    await saveOneREQ(r);
  }
  // 즉시 반영
  if(view){ view.textContent=title; view.style.display=''; }
  if(edit) edit.style.display='none';
  // Details 탭 제목 필드 갱신
  const detailSummary=document.querySelector('#req2-tabcontent-'+reqId+' [contenteditable]');
  if(detailSummary&&detailSummary.innerText.trim()!==title) detailSummary.innerText=title;
  // Updated 컬럼 갱신
  const updCell=document.getElementById('req2-upd-'+reqId);
  if(updCell) updCell.textContent=r?.updated_at||'';
  // 트리 카운트는 갱신 불필요, 단 폴더뷰 테이블 통계만 갱신
  req2RenderTree();
}
function req2CancelTitle(reqId){
  const view=document.getElementById('req2-title-view-'+reqId);
  const edit=document.getElementById('req2-title-edit-'+reqId);
  if(view) view.style.display='';
  if(edit) edit.style.display='none';
}

// ══════════════════════════════════════════
function req2ExpandAll(){
  reqFolders.forEach(f=>req2ExpandedIds.add(f.id));
  req2RenderTree();
}
function req2CollapseAll(){
  req2ExpandedIds.clear();
  req2RenderTree();
}

// REQ2 드래그&드롭 - 폴더 순서 변경 + REQ 이동
// ══════════════════════════════════════════
let _drag={type:null, id:null};

function req2DragStart(e, type, id){
  _drag={type, id};
  e.dataTransfer.effectAllowed='move';
  e.dataTransfer.setData('text/plain', id);
  setTimeout(()=>{
    const el=document.getElementById('req2-fi-'+id)||document.getElementById('req2-fd-'+id);
    if(el) el.style.opacity='0.4';
  },0);
}

function req2DragOver(e, targetFid){
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect='move';
  document.querySelectorAll('.req2-folder-item').forEach(el=>el.classList.remove('drag-over'));
  const el=document.getElementById('req2-fi-'+targetFid);
  if(el) el.classList.add('drag-over');
}

function req2DragLeave(e, targetFid){
  const el=document.getElementById('req2-fi-'+targetFid);
  if(el) el.classList.remove('drag-over');
}

async function req2Drop(e, targetFid){
  e.preventDefault();
  e.stopPropagation();
  document.querySelectorAll('.req2-folder-item').forEach(el=>{el.classList.remove('drag-over');el.style.opacity='';});
  if(_drag.type==='folder') await req2DropFolder(_drag.id, targetFid);
  else if(_drag.type==='req') await req2DropREQ(_drag.id, targetFid);
  _drag={type:null, id:null};
}

async function req2DropBetween(e, targetFid, pos){
  e.preventDefault();
  e.stopPropagation();
  document.querySelectorAll('.req2-drop-between').forEach(el=>{el.style.background='';el.style.height='4px';});
  if(!_drag.id||_drag.type!=='folder') return;
  const srcId=_drag.id;
  const srcEl=document.getElementById('req2-fd-'+srcId);
  if(srcEl) srcEl.style.opacity='';
  _drag={type:null,id:null};
  if(srcId===targetFid) return;

  const src=reqFolders.find(f=>f.id===srcId);
  const target=reqFolders.find(f=>f.id===targetFid);
  if(!src||!target) return;

  // 자식 폴더로 이동 방지
  const isDescendant=(pid)=>{
    if(!pid) return false;
    if(pid===srcId) return true;
    const p=reqFolders.find(f=>f.id===pid);
    return p?isDescendant(p.parent):false;
  };
  if(isDescendant(targetFid)) return;

  // 타겟과 같은 레벨로 이동
  const targetParent=target.parent||null;
  src.parent=targetParent;

  // 해당 레벨 siblings 재정렬 (원본 배열 order만 변경)
  const siblings=reqFolders.filter(f=>(f.parent||null)===(targetParent));
  // src 제외하고 target 위치에 삽입
  const withoutSrc=siblings.filter(f=>f.id!==srcId);
  const tgtIdx=withoutSrc.findIndex(f=>f.id===targetFid);
  const insertAt=pos==='before'?tgtIdx:tgtIdx+1;
  withoutSrc.splice(Math.max(0,insertAt),0,src);
  withoutSrc.forEach((f,i)=>{ f.order=i; });

  await req2SaveFolders();
  req2RenderTree();
}

// 폴더 저장 (백업 후 저장)
async function req2SaveFolders(){
  if(!reqFolders||reqFolders.length===0){
    console.warn('폴더 저장 취소: 빈 배열');
    return false;
  }
  try{
    const res=await fetch('/api/folders',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({folders:reqFolders})
    });
    if(!res.ok){ showToast('폴더 저장 실패: '+res.status); return false; }
    // tm 페이지 트리도 항상 갱신
    if(typeof tmRenderFolderTree==='function') tmRenderFolderTree();
    return true;
  }catch(e){ showToast('폴더 저장 오류: '+e.message); return false; }
}

async function req2DropFolder(srcId, targetId){
  if(srcId===targetId) return;
  const src=reqFolders.find(f=>f.id===srcId);
  const target=reqFolders.find(f=>f.id===targetId);
  if(!src||!target){ showToast('폴더를 찾을 수 없습니다.'); return; }

  // 자식 폴더로 이동 방지
  const isDescendant=(pid)=>{
    if(!pid) return false;
    if(pid===srcId) return true;
    const p=reqFolders.find(f=>f.id===pid);
    return p?isDescendant(p.parent):false;
  };
  if(isDescendant(targetId)){ showToast('자식 폴더로 이동할 수 없습니다.'); return; }

  const srcParent=src.parent||null;
  const targetParent=target.parent||null;

  if(srcParent===targetParent){
    // 같은 레벨: order만 변경 (배열 재구성 X)
    const siblings=reqFolders.filter(f=>(f.parent||null)===srcParent);
    const srcIdx=siblings.findIndex(f=>f.id===srcId);
    const tgtIdx=siblings.findIndex(f=>f.id===targetId);
    if(srcIdx<0||tgtIdx<0) return;
    // splice로 순서 변경 (원본 객체 참조 유지)
    siblings.splice(srcIdx,1);
    siblings.splice(tgtIdx,0,src);
    siblings.forEach((f,i)=>{ f.order=i; });
  } else {
    // 다른 레벨: 타겟 폴더의 자식으로 이동
    src.parent=targetId;
    src.order=reqFolders.filter(f=>f.parent===targetId).length;
    req2ExpandedIds.add(targetId);
  }

  const ok=await req2SaveFolders();
  if(ok){
    req2RenderTree();
    if(req2SelFolderId) req2SelectFolder(req2SelFolderId);
  }
}

async function req2DropREQ(reqId, targetFid){
  const r=reqList.find(x=>x.id===reqId);
  if(!r||r.folder===targetFid) return;
  r.folder=targetFid;
  r.updated_at=new Date().toISOString().slice(0,10); r.updated_by=_whoNow();
  await saveOneREQ(r);
  req2RenderTree();
  req2SelectFolder(targetFid);
}

// REQ 행 드래그
function req2REQDragStart(e, reqId){
  _drag={type:'req', id:reqId};
  e.dataTransfer.effectAllowed='move';
  e.dataTransfer.setData('text/plain', reqId);
}

// ── 폴더 상위 이동 모달 ──
function req2OpenMoveFolderModal(fid){
  const f=reqFolders.find(x=>x.id===fid);
  if(!f) return;
  let modal=document.getElementById('modal-req2-move-folder');
  if(modal) modal.remove();
  modal=document.createElement('div');
  modal.id='modal-req2-move-folder';
  modal.className='modal-overlay';
  modal.style.display='flex';
  // 이동 가능한 폴더 목록 (자기 자신 + 자식 제외)
  const getDescendants=(id)=>{
    const children=reqFolders.filter(f=>f.parent===id).map(f=>f.id);
    return [id,...children.flatMap(getDescendants)];
  };
  const excluded=new Set(getDescendants(fid));
  const options=reqFolders.filter(x=>!excluded.has(x.id))
    .map(x=>'<option value="'+x.id+'" '+(x.id===f.parent?'selected':'')+'>'+x.name+'</option>').join('');
  modal.innerHTML=
    '<div class="modal" style="width:380px;">'+
    '<div class="modal-hdr"><i class="ti ti-folder-symlink" style="color:var(--blue);"></i> "'+f.name+'" 상위 폴더 변경'+
    '<i class="ti ti-x" style="cursor:pointer;margin-left:auto;" onclick="this.closest(\'.modal-overlay\').remove()"></i></div>'+
    '<div class="modal-body"><div class="fl">이동할 상위 폴더 선택</div>'+
    '<select class="fi" id="req2-move-folder-target"><option value="">루트 (최상위)</option>'+options+'</select></div>'+
    '<div class="modal-footer"><button class="btn" onclick="this.closest(\'.modal-overlay\').remove()">취소</button>'+
    '<button class="btn primary" onclick="req2MoveFolderSubmit(\''+fid+'\')">이동</button></div></div>';
  document.body.appendChild(modal);
}

async function req2MoveFolderSubmit(fid){
  const sel=document.getElementById('req2-move-folder-target');
  const targetId=(sel?.value&&sel.value!=='')?sel.value:null;
  const f=reqFolders.find(x=>x.id===fid);
  if(!f){ showToast('폴더를 찾을 수 없습니다.'); return; }

  // 자기 자신 또는 자식으로 이동 방지
  const isDescendant=(pid)=>{
    if(!pid) return false;
    if(pid===fid) return true;
    const p=reqFolders.find(x=>x.id===pid);
    return p?isDescendant(p.parent):false;
  };
  if(targetId&&isDescendant(targetId)){ showToast('자식 폴더로 이동할 수 없습니다.'); return; }

  // parent만 변경 (배열 재구성 X)
  f.parent=targetId;
  f.order=reqFolders.filter(x=>(x.parent||null)===(targetId)).length-1;

  const ok=await req2SaveFolders();
  if(ok){
    document.querySelector('.modal-overlay')?.remove();
    if(targetId) req2ExpandedIds.add(targetId);
    req2RenderTree();
    showToast('폴더가 이동되었습니다.');
  }
}

// ── REQ 폴더 이동 모달 (테이블 우클릭 또는 버튼) ──
function req2OpenMoveREQModal(reqId){
  const r=reqList.find(x=>x.id===reqId);
  if(!r) return;
  let modal=document.getElementById('modal-req2-move-req');
  if(modal) modal.remove();
  modal=document.createElement('div');
  modal.id='modal-req2-move-req';
  modal.className='modal-overlay';
  modal.style.display='flex';
  const options=reqFolders.map(f=>'<option value="'+f.id+'" '+(f.id===r.folder?'selected':'')+'>'+f.name+'</option>').join('');
  modal.innerHTML=
    '<div class="modal" style="width:420px;">'+
    '<div class="modal-hdr"><i class="ti ti-transfer" style="color:var(--blue);"></i> REQ 폴더 이동'+
    '<i class="ti ti-x" style="cursor:pointer;margin-left:auto;" onclick="this.closest(\'.modal-overlay\').remove()"></i></div>'+
    '<div class="modal-body" style="display:flex;flex-direction:column;gap:10px;">'+
    '<div><div class="fl">REQ</div><div style="font-size:11px;font-weight:700;color:var(--blue);padding:4px 8px;background:var(--bg3);border-radius:6px;">'+r.reqid+'</div></div>'+
    '<div><div class="fl">이동할 폴더 선택</div><select class="fi" id="req2-move-req-target">'+options+'</select></div>'+
    '</div><div class="modal-footer">'+
    '<button class="btn" onclick="this.closest(\'.modal-overlay\').remove()">취소</button>'+
    '<button class="btn primary" onclick="req2MoveREQSubmit(\''+reqId+'\')">이동</button></div></div>';
  document.body.appendChild(modal);
}

async function req2MoveREQSubmit(reqId){
  const targetFid=document.getElementById('req2-move-req-target')?.value;
  if(!targetFid) return;
  await req2DropREQ(reqId, targetFid);
  document.getElementById('modal-req2-move-req')?.remove();
}

function req2LLMGenTC(reqId){
  // TC 탭 프롬프트 반영
  const promptEl=document.getElementById('req2-tc-prompt-'+reqId);
  if(promptEl){
    // llmGenTC가 req2-sc-prompt를 읽도록 임시 동기화
    const scPrompt=document.getElementById('req2-sc-prompt-'+reqId);
    if(scPrompt) scPrompt.value=promptEl.value;
  }
  llmGenTC(reqId);
}

// ── 폴더 컨텍스트 메뉴 ──
function req2ShowCtx(e, fid, emptyArea){
  e.preventDefault();
  e.stopPropagation();
  req2CtxFolderId=fid;
  const menu=document.getElementById('req2-ctx');
  if(!menu) return;
  // 빈 여백/폴더없음: 폴더 지정 동작(수정·삭제·정렬) 숨기고 생성 옵션만
  const hideFolderOnly=(emptyArea||!fid);
  menu.querySelectorAll('.req2-fonly').forEach(el=>{ el.style.display=hideFolderOnly?'none':''; });
  // 현재 경로 표시 (빈 여백일 때)
  const pathEl=document.getElementById('req2-ctx-path');
  if(pathEl){
    if(emptyArea){ const f=fid?reqFolders.find(x=>x.id===fid):null; pathEl.style.display=''; pathEl.textContent='📁 생성 위치: '+(f?f.name:'(루트)'); }
    else { pathEl.style.display='none'; }
  }
  menu.style.display='block';
  menu.style.left=e.clientX+'px';
  menu.style.top=e.clientY+'px';
}
document.addEventListener('click',()=>{ const m=document.getElementById('req2-ctx'); if(m) m.style.display='none'; });

function req2CtxAction(action){
  const fid=req2CtxFolderId;
  const menu=document.getElementById('req2-ctx');
  if(menu) menu.style.display='none';
  if(action==='add-sub') req2OpenFolderModal(fid,'new');
  else if(action==='add-req'){ req2SelFolderId=fid; req2SelectFolder(fid); req2OpenNewREQ(); }
  else if(action==='rename') req2OpenFolderModal(fid,'rename');
  else if(action==='move-folder') req2OpenMoveFolderModal(fid);
  else if(action==='sort-name-asc') req2SortFolder(fid,'name','asc');
  else if(action==='sort-name-desc') req2SortFolder(fid,'name','desc');
  else if(action==='sort-num-asc') req2SortFolder(fid,'num','asc');
  else if(action==='sort-num-desc') req2SortFolder(fid,'num','desc');
  else if(action==='sort') req2SortFolder(fid,'name','asc');
  else if(action==='delete') req2DeleteFolder(fid);
}

async function req2SortFolder(fid, by='name', dir='asc'){
  // 해당 폴더의 하위 폴더 정렬
  const children=reqFolders.filter(f=>f.parent===fid);

  const extractNum=s=>{
    const m=(s||'').match(/\d+/);
    return m?parseInt(m[0]):0;
  };

  children.sort((a,b)=>{
    let cmp=0;
    if(by==='num'){
      cmp=extractNum(a.name)-extractNum(b.name);
      if(cmp===0) cmp=(a.name||'').localeCompare(b.name||'','ko');
    } else {
      cmp=(a.name||'').localeCompare(b.name||'','ko',{numeric:true,sensitivity:'base'});
    }
    return dir==='desc'?-cmp:cmp;
  });
  children.forEach((f,i)=>f.order=i);

  // REQ도 같은 방식으로 정렬 (선택된 폴더 REQ만)
  const folderReqs=reqList.filter(r=>r.folder===fid);
  folderReqs.sort((a,b)=>{
    let cmp=0;
    if(by==='num'){
      const extractNum2=s=>{const m=(s||'').match(/\d+/);return m?parseInt(m[0]):0;};
      cmp=extractNum2(a.reqid)-extractNum2(b.reqid);
      if(cmp===0) cmp=(a.reqid||'').localeCompare(b.reqid||'','ko');
    } else {
      cmp=(a.reqid||'').localeCompare(b.reqid||'','ko',{numeric:true,sensitivity:'base'});
    }
    return dir==='desc'?-cmp:cmp;
  });

  const dirLabel=dir==='asc'?'오름차순':'내림차순';
  const byLabel=by==='num'?'숫자':'이름';
  await req2SaveFolders();
  req2RenderTree();
  req2Render();
  showToast(byLabel+' '+dirLabel+' 정렬 완료');
}

async function req2DeleteFolder(fid){
  const reqs=reqList.filter(r=>r.folder===fid);
  if(!confirm('폴더를 삭제하시겠습니까?'+(reqs.length>0?'\n연결된 REQ '+reqs.length+'개도 함께 삭제됩니다.':''))) return;
  for(const r of reqs){
    for(const ref of (r.tc||[])){ await deleteTCFile(ref.tcid); tcList=tcList.filter(t=>t.tcid!==ref.tcid); }
    await deleteOneREQ(r.reqid); reqList=reqList.filter(x=>x.id!==r.id);
  }
  reqFolders=reqFolders.filter(f=>f.id!==fid);
  await fetch('/api/folders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({folders:reqFolders})});
  if(req2SelFolderId===fid){ req2SelFolderId=null; document.getElementById('req2-table-wrap').innerHTML='<div class="detail-empty" style="height:200px;"><i class="ti ti-folder-open" style="font-size:40px;"></i><span>왼쪽에서 폴더를 선택하세요</span></div>'; }
  req2RenderTree();
}

// ── 폴더 모달 ──
function req2OpenFolderModal(parentId, mode){
  const fid=mode==='rename'?parentId:null;
  const folder=fid?reqFolders.find(f=>f.id===fid):null;
  let modal=document.getElementById('modal-req2-folder');
  if(modal) modal.remove();
  modal=document.createElement('div');
  modal.id='modal-req2-folder';
  modal.className='modal-overlay';
  modal.style.display='flex';
  const colorBtns=['blue','green','red','yellow'].map(col=>{
    const bg=col==='blue'?'var(--blue)':col==='green'?'var(--green)':col==='red'?'var(--red)':'var(--yellow)';
    const bdr=(folder?.color||'blue')===col?'var(--text)':'transparent';
    const sel=(folder?.color||'blue')===col?' sel':'';
    return '<div onclick="document.querySelectorAll(\'.req2-color-opt\').forEach(x=>x.classList.remove(\'sel\'));this.classList.add(\'sel\');document.getElementById(\'req2-folder-color\').value=\''+col+'\'"'+
      ' class="req2-color-opt'+sel+'"'+
      ' style="width:28px;height:28px;border-radius:50%;background:'+bg+';cursor:pointer;border:3px solid '+bdr+';"></div>';
  }).join('');
  modal.innerHTML=
    '<div class="modal" style="width:380px;">'+
    '<div class="modal-hdr"><i class="ti ti-folder-plus" style="color:var(--blue);"></i> '+(mode==='rename'?'폴더명 수정':'새 폴더 추가')+
    '<i class="ti ti-x" style="cursor:pointer;margin-left:auto;" onclick="this.closest(\'.modal-overlay\').remove()"></i></div>'+
    '<div class="modal-body" style="display:flex;flex-direction:column;gap:10px;">'+
    '<div><div class="fl">폴더명</div><input class="fi" id="req2-folder-name" value="'+(folder?.name||'')+'" placeholder="예: IPv4_L2, QoS, EPON"></div>'+
    '<div><div class="fl">색상</div><div style="display:flex;gap:8px;margin-top:4px;">'+colorBtns+
    '<input type="hidden" id="req2-folder-color" value="'+(folder?.color||'blue')+'"></div></div>'+
    '</div><div class="modal-footer">'+
    '<button class="btn" onclick="this.closest(\'.modal-overlay\').remove()">취소</button>'+
    '<button class="btn primary" onclick="req2SubmitFolder(\''+(parentId||'')+'\',\''+mode+'\',\''+(fid||'')+'\')">저장</button></div></div>';
  document.body.appendChild(modal);
  setTimeout(()=>document.getElementById('req2-folder-name')?.focus(),50);
}

async function req2SubmitFolder(parentId, mode, fid){
  const name=document.getElementById('req2-folder-name')?.value?.trim();
  const color=document.getElementById('req2-folder-color')?.value||'blue';
  if(!name){ alert('폴더명을 입력하세요.'); return; }
  if(mode==='rename'){
    const f=reqFolders.find(x=>x.id===fid);
    if(f){ f.name=name; f.color=color; }
  } else {
    const newId='rf-'+Date.now();
    reqFolders.push({id:newId,name,parent:parentId||null,color,order:reqFolders.filter(f=>f.parent===parentId).length});
    if(parentId) req2ExpandedIds.add(parentId);
  }
  await req2SaveFolders(); // tmRenderFolderTree 자동 호출됨
  document.getElementById('modal-req2-folder')?.remove();
  req2RenderTree();
  tmRenderFolderTree(); // 명시적으로도 호출
}

// ── REQ 추가 모달 ──
function req2OpenNewREQ(){
  if(!req2SelFolderId){ alert('폴더를 먼저 선택하세요.'); return; }
  const folder=reqFolders.find(f=>f.id===req2SelFolderId);
  const folderPath=getFolderPath(req2SelFolderId);
  // 폴더 경로 빵크럼
  const buildBreadcrumb=(id)=>{const parts=[];let cur=id;while(cur){const f=reqFolders.find(x=>x.id===cur);if(!f)break;parts.unshift(f.name);cur=f.parent;}return parts.join(' / ');};
  const breadcrumb=buildBreadcrumb(req2SelFolderId);
  let modal=document.getElementById('modal-req2-new');
  if(modal) modal.remove();
  modal=document.createElement('div');
  modal.id='modal-req2-new';
  modal.className='modal-overlay';
  modal.style.display='flex';
  const catHtml=['공통','L2','L3','OLT','ONT','CPE','HGW','WIFI'].map(p=>
    '<label style="display:inline-flex;align-items:center;font-size:14px;font-weight:500;cursor:pointer;padding:7px 16px;border-radius:20px;border:2px solid var(--border);background:#fff;color:var(--text3);transition:all 0.15s;user-select:none;"'+
    ' onclick="this.classList.toggle(\'on\');const on=this.classList.contains(\'on\');this.style.background=on?\'var(--blue)\':\'#fff\';this.style.color=on?\'#fff\':\'var(--text3)\';this.style.borderColor=on?\'var(--blue)\':\'var(--border)\';this.style.fontWeight=on?\'700\':\'500\';this.style.boxShadow=on?\'0 2px 8px rgba(45,111,212,0.35)\':\'none\';this.querySelector(\'input\').checked=on;">'+
    '<input type="checkbox" value="'+p+'" style="display:none;">'+p+'</label>'
  ).join('');
  modal.innerHTML=
    '<div class="modal" style="width:700px;max-height:90vh;overflow-y:auto;border-radius:12px;padding:0;">'+
    '<div style="padding:20px 24px 16px;border-bottom:2px solid var(--border);background:linear-gradient(135deg,rgba(45,111,212,0.06),rgba(45,111,212,0.02));">'+
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">'+
    '<div style="width:36px;height:36px;border-radius:10px;background:rgba(45,111,212,0.12);display:flex;align-items:center;justify-content:center;"><i class="ti ti-file-plus" style="font-size:20px;color:var(--blue);"></i></div>'+
    '<div><div style="font-size:18px;font-weight:700;color:var(--text);">새 REQ 추가</div>'+
    '<div style="font-size:12.5px;color:var(--text3);margin-top:1px;"><i class="ti ti-folder" style="font-size:12.5px;"></i> '+breadcrumb+'</div></div>'+
    '<button onclick="this.closest(\'.modal-overlay\').remove()" style="margin-left:auto;width:32px;height:32px;border-radius:8px;border:1px solid var(--border);background:var(--bg3);color:var(--text3);cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;"><i class="ti ti-x"></i></button>'+
    '</div></div>'+
    '<div style="padding:20px 24px;display:flex;flex-direction:column;gap:16px;">'+
    '<div><label style="display:block;font-size:12.5px;font-weight:700;color:var(--text2);margin-bottom:6px;">REQ Summary <span style="color:var(--red);">*</span></label>'+
    '<input id="req2-new-title" placeholder="예: VLAN Access 모드 설정 검증" oninput="req2UpdateNewId(this.value,\''+folderPath+'\')"'+
    ' style="width:100%;font-size:15px;font-weight:500;padding:10px 14px;border:2px solid var(--border);border-radius:8px;background:#fff;color:var(--text);outline:none;transition:all 0.15s;"'+
    ' onfocus="this.style.borderColor=\'var(--blue)\';this.style.boxShadow=\'0 0 0 3px rgba(45,111,212,0.1)\'"'+
    ' onblur="this.style.borderColor=\'var(--border)\';this.style.boxShadow=\'\'"></div>'+
    '<div><label style="display:block;font-size:12.5px;font-weight:700;color:var(--text2);margin-bottom:6px;">REQ ID <span style="font-size:12.5px;color:var(--text3);font-weight:400;">(Summary 입력 시 자동생성)</span></label>'+
    '<input id="req2-new-id" value="'+folderPath+'" style="width:100%;font-size:12.5px;padding:9px 14px;border:1.5px solid var(--border);border-radius:8px;background:#f5f6f8;color:var(--text3);outline:none;font-family:monospace;"></div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr 2fr;gap:12px;">'+
    '<div><label style="display:block;font-size:12.5px;font-weight:700;color:var(--text2);margin-bottom:6px;">Priority</label>'+
    '<select id="req2-new-priority" style="width:100%;font-size:14px;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;background:#fff;color:var(--text);outline:none;cursor:pointer;">'+
    '<option>Very High</option><option>High</option><option selected>Medium</option><option>Low</option></select></div>'+
    '<div><label style="display:block;font-size:12.5px;font-weight:700;color:var(--text2);margin-bottom:6px;">Status</label>'+
    '<select id="req2-new-status" style="width:100%;font-size:14px;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;background:#fff;color:var(--text);outline:none;cursor:pointer;">'+
    '<option selected>Draft</option><option>Work in Progress</option><option>Review</option><option>Approved</option><option>Deprecated</option></select></div>'+
    '<div><label style="display:block;font-size:12.5px;font-weight:700;color:var(--text2);margin-bottom:6px;">Confluence URL</label>'+
    '<input id="req2-new-confluence" placeholder="http://wiki.ubiquoss.com/..." style="width:100%;font-size:12.5px;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;background:#fff;color:var(--text);outline:none;"></div></div>'+
    '<div><label style="display:block;font-size:12.5px;font-weight:700;color:var(--text2);margin-bottom:8px;">Category (적용 대상)</label>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap;">'+catHtml+'</div></div>'+
    '<div><label style="display:block;font-size:12.5px;font-weight:700;color:var(--text2);margin-bottom:6px;">Overview (개요)</label>'+
    '<textarea id="req2-new-overview" rows="4" placeholder="요구사항 개요를 입력하세요. (저장 후 LLM으로 자동 생성 가능)"'+
    ' style="width:100%;font-size:12.5px;line-height:1.7;padding:10px 14px;border:1.5px solid var(--border);border-radius:8px;background:#fff;color:var(--text);outline:none;resize:vertical;transition:all 0.15s;"'+
    ' onfocus="this.style.borderColor=\'var(--blue)\';this.style.boxShadow=\'0 0 0 3px rgba(45,111,212,0.08)\'"'+
    ' onblur="this.style.borderColor=\'var(--border)\';this.style.boxShadow=\'\'"></textarea></div>'+
    '</div>'+
    '<div style="padding:14px 24px 20px;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:flex-end;gap:10px;background:#f9fafb;border-radius:0 0 12px 12px;">'+
    '<button onclick="this.closest(\'.modal-overlay\').remove()" style="font-size:14px;padding:9px 20px;border-radius:8px;border:1.5px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;font-weight:500;">취소</button>'+
    '<button onclick="req2SubmitNewREQ()" style="font-size:14px;padding:9px 24px;border-radius:8px;border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:600;display:flex;align-items:center;gap:6px;box-shadow:0 2px 8px rgba(45,111,212,0.3);"><i class="ti ti-check" style="font-size:16px;"></i> 저장</button>'+
    '</div></div>';

  document.body.appendChild(modal);
  setTimeout(()=>document.getElementById('req2-new-title')?.focus(),50);
}

function req2UpdateNewId(title, folderPath){
  // REQ ID는 폴더 경로만 유지 - Summary는 REQ ID에 추가하지 않음
  const el=document.getElementById('req2-new-id');
  if(el) el.value=folderPath;
}

async function req2SubmitNewREQ(){
  const reqid=document.getElementById('req2-new-id')?.value?.trim();
  const title=document.getElementById('req2-new-title')?.value?.trim();
  if(!title){ alert('REQ Summary를 입력하세요.'); return; }
  if(!req2SelFolderId){ alert('폴더가 선택되지 않았습니다.'); return; }
  // 선택된 폴더가 실제로 존재하는지 확인
  const folderExists=reqFolders.find(f=>f.id===req2SelFolderId);
  if(!folderExists){ alert('폴더를 찾을 수 없습니다. 폴더를 다시 선택하세요.'); return; }

  const products=Array.from(document.querySelectorAll('#modal-req2-new input[type=checkbox]:checked')).map(c=>c.value);
  const now=new Date().toISOString().slice(0,10);
  const r={
    id:'req-'+Date.now(),
    reqid: reqid||title,
    title,
    folder: req2SelFolderId,  // 현재 선택된 폴더 ID
    priority: document.getElementById('req2-new-priority')?.value||'Medium',
    status: document.getElementById('req2-new-status')?.value||'Draft',
    products,
    overview: document.getElementById('req2-new-overview')?.value||'',
    confluence: document.getElementById('req2-new-confluence')?.value||'',
    created_at: now, updated_at: now, created_by: _whoNow(), updated_by: _whoNow(),
    tc:[], scenarios:'[]', issues:[]
  };
  console.log('[REQ 생성] folder:', r.folder, 'reqid:', r.reqid);
  reqList.push(r);
  await saveOneREQ(r);
  document.getElementById('modal-req2-new')?.remove();
  req2Render();
  req2RenderTree();
  showToast('REQ가 추가되었습니다.');
}

// ── 삭제 ──
async function req2DeleteREQ(reqId){
  const r=reqList.find(x=>x.id===reqId);
  if(!r) return;
  const tcRefs=r.tc||[];
  if(!confirm('"'+r.reqid+'"를 삭제하시겠습니까?'+(tcRefs.length>0?'\nTC '+tcRefs.length+'개도 함께 삭제됩니다.':''))) return;
  for(const ref of tcRefs){ await deleteTCFile(ref.tcid); tcList=tcList.filter(t=>t.tcid!==ref.tcid); }
  await deleteOneREQ(r.reqid); reqList=reqList.filter(x=>x.id!==reqId);
  req2ExpandedIds.delete('req-'+reqId);
  req2Render(); req2RenderTree();
}

// ── 유틸 ──
function req2Priority(p){ if(!p) return 'Major'; if(p==='MUST') return 'Critical'; if(p==='SHOULD') return 'Major'; if(p==='MAY') return 'Minor'; return p; }
function req2PrioClass(p){ if(p==='Critical') return 'prio-critical'; if(p==='Major') return 'prio-major'; return 'prio-minor'; }
function req2StatusClass(s){ if(s==='APPROVED') return 'status-approved'; if(s==='DEPRECATED') return 'status-deprecated'; return 'status-draft'; }
function req2Search(q){ req2SearchQ=q; req2Render(); }
function req2ExportWord(){ alert('Word 문서 추출 기능 준비 중입니다.'); }
// ── TinyMCE 에디터 ──
const _tinyEditors={};
// Toast UI 에디터 플러그인 배열(로드된 것만) — 글자/배경색, 코드 하이라이트
function _tuiPlugins(){
  var w=window, pg=(w.toastui&&w.toastui.Editor&&w.toastui.Editor.plugin)||{}, P=[];
  var cs=pg.colorSyntax||w.toastuiEditorPluginColorSyntax;
  var ch=pg.codeSyntaxHighlight||w.toastuiEditorPluginCodeSyntaxHighlight;
  if(cs) P.push([cs,{preset:['#e53e5a','#e8820c','#ffbb00','#00a872','#2d6fd4','#7c3aed','#333333','#888888','#ffffff'],useCustomInput:true}]);
  if(ch) P.push(ch);
  return P;
}
// 레거시 HTML → 마크다운 기본 변환(마이그레이션용)
function _html2md(html){
  if(!html) return '';
  if(!/[<][a-zA-Z!\/]/.test(html)) return String(html);   // 태그 거의 없으면 그대로(이미 텍스트/MD)
  var s=String(html);
  // 표(table) → 마크다운 표 (DOM 파싱) — 깨짐 방지
  if(/<table/i.test(s)){ s=s.replace(/<table[\s\S]*?<\/table>/gi,function(tb){ try{ var d=document.createElement('div'); d.innerHTML=tb; var t=d.querySelector('table'); if(!t) return tb; var rows=[].slice.call(t.querySelectorAll('tr')); if(!rows.length) return ''; var out='\n\n'; rows.forEach(function(tr,ri){ var cs=[].slice.call(tr.querySelectorAll('th,td')).map(function(c){ return (c.innerText||c.textContent||'').replace(/\s+/g,' ').replace(/\|/g,'\\|').trim()||' '; }); out+='| '+cs.join(' | ')+' |\n'; if(ri===0) out+='| '+cs.map(function(){return '---';}).join(' | ')+' |\n'; }); return out+'\n'; }catch(e){ return tb; } }); }
  s=s.replace(/<\s*br\s*\/?>/gi,'\n');
  s=s.replace(/<\s*h1[^>]*>/gi,'\n# ').replace(/<\s*h2[^>]*>/gi,'\n## ').replace(/<\s*h3[^>]*>/gi,'\n### ');
  s=s.replace(/<\s*li[^>]*>/gi,'\n- ');
  s=s.replace(/<\/(p|div|h[1-6]|li|tr|ul|ol|blockquote)\s*>/gi,'\n');
  s=s.replace(/<\s*(strong|b)\s*>/gi,'**').replace(/<\/\s*(strong|b)\s*>/gi,'**');
  s=s.replace(/<\s*(em|i)\s*>/gi,'*').replace(/<\/\s*(em|i)\s*>/gi,'*');
  s=s.replace(/<\s*code\s*>/gi,'`').replace(/<\/\s*code\s*>/gi,'`');
  s=s.replace(/<img[^>]*?src=["']([^"']*)["'][^>]*?>/gi,'\n![]($1)\n');   // 이미지 보존: <img>→마크다운 이미지(base64 data URL 포함)
  s=s.replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,'[$2]($1)');
  s=s.replace(/<[^>]+>/g,'');   // 나머지 태그 제거
  s=s.replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
  s=s.replace(/(\*{2,3})([^*\n]+?)(\*{2,3})/g, function(m,a,x,b){ return a+x.trim()+b; });   // 굵게/굵은이탤릭 양끝 공백 제거 → 닫는 ** 앞 공백이면 파싱 안 되는 문제 해결
  s=s.replace(/^[ \t]*\*{2,3}([^*\n]{1,80})\*{2,3}[ \t]*$/gm, '## $1');   // 한 줄 전체가 굵게면 제목(##)으로 — 워드의 굵은 제목을 크게
  return s.replace(/\n{3,}/g,'\n\n').trim();
}
// REQ 개요(overview) 에디터 — Toast UI 마크다운(위지윅+마크다운 토글)
function req2InitTiny(reqId){
  if(!(window.toastui&&toastui.Editor)){ setTimeout(()=>req2InitTiny(reqId),400); return; }
  var box=document.getElementById('req2-ov-'+reqId);
  if(!box) return;
  var r=reqList.find(x=>x.id===reqId);
  try{ if(_tinyEditors[reqId]&&_tinyEditors[reqId].destroy) _tinyEditors[reqId].destroy(); }catch(e){}
  delete _tinyEditors[reqId]; box.innerHTML='';
  var initMd=(r&&r.overview_md)?r.overview_md:_html2md((r&&(r.overview_html||r.overview))||'');
  var ed=new toastui.Editor({ el:box, initialValue:initMd, initialEditType:'wysiwyg', previewStyle:'tab', height:'auto', usageStatistics:false, plugins:_tuiPlugins(),
    hooks:{addImageBlobHook:function(blob,cb){ var fr=new FileReader(); fr.onload=function(){ cb(fr.result,'image'); }; fr.readAsDataURL(blob); }} });
  _tinyEditors[reqId]=ed;
  var _t=null; var _save=function(){ if(!r)return; clearTimeout(_t); _t=setTimeout(function(){ try{ r.overview_md=ed.getMarkdown(); r.overview_html=ed.getHTML(); r.overview=ed.getMarkdown(); }catch(e){} saveOneREQ(r); },700); };
  ed.on('change',_save);
}
function req2DestroyTiny(reqId){
  const ed=_tinyEditors[reqId];
  if(ed){ try{ed.destroy();}catch(e){} delete _tinyEditors[reqId]; }
}
// 구현 내용(impl) 필드용 TinyMCE — 설명(개요) 에디터와 동일 구성
function req2InitTinyImpl(reqId){
  const _r=reqList.find(x=>x.id===reqId);
  if(_r && _implLarge(_r)) return; // 대용량은 빠른 텍스트 편집기 사용 → TinyMCE 초기화 생략
  if(!(window.toastui&&toastui.Editor)){ setTimeout(()=>req2InitTinyImpl(reqId),400); return; }
  var box=document.getElementById('req2-impl-'+reqId); if(!box) return;
  var r=_r;
  try{ if(_tinyEditors[reqId]&&_tinyEditors[reqId].destroy) _tinyEditors[reqId].destroy(); }catch(e){}
  delete _tinyEditors[reqId]; box.innerHTML='';
  var initMd=(r&&r.implementation_md)?r.implementation_md:_html2md((r&&(r.implementation_html||r.implementation))||'');
  var ed=new toastui.Editor({ el:box, initialValue:initMd, initialEditType:'wysiwyg', previewStyle:'tab', height:'auto', usageStatistics:false, plugins:_tuiPlugins(),
    hooks:{addImageBlobHook:function(blob,cb){ var fr=new FileReader(); fr.onload=function(){ cb(fr.result,'image'); }; fr.readAsDataURL(blob); }} });
  _tinyEditors[reqId]=ed;
  var _t=null; var _save=function(){ if(!r)return; clearTimeout(_t); _t=setTimeout(function(){ try{ r.implementation_md=ed.getMarkdown(); r.implementation_html=ed.getHTML(); r.implementation=ed.getMarkdown(); }catch(e){} saveOneREQ(r); },700); };
  ed.on('change',_save);
}
// TC 필드용 TinyMCE (목적/Pre-condition 등)
function initTCTiny(tcid, field){
  if(!(window.toastui&&toastui.Editor)){ setTimeout(()=>initTCTiny(tcid,field),400); return; }
  var elId='tc-tiny-'+field+'-'+tcid;
  var box=document.getElementById(elId); if(!box) return;
  var tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid));
  var key='_tcMd_'+field+'_'+tcid;
  try{ if(window[key]&&window[key].destroy) window[key].destroy(); }catch(e){}
  box.innerHTML='';
  var initMd=(tc&&tc[field+'_md'])?tc[field+'_md']:_html2md((tc&&(tc[field+'_html']||tc[field]))||'');
  var ed=new toastui.Editor({ el:box, initialValue:initMd, initialEditType:'wysiwyg', previewStyle:'tab', height:'auto', usageStatistics:false, plugins:_tuiPlugins(),
    hooks:{addImageBlobHook:function(blob,cb){ var fr=new FileReader(); fr.onload=function(){ cb(fr.result,'image'); }; fr.readAsDataURL(blob); }} });
  window[key]=ed;
  var _t=null; ed.on('change',function(){ clearTimeout(_t); _t=setTimeout(function(){ try{ saveTCTinyFieldMd(tcid, field, ed.getMarkdown(), ed.getHTML()); }catch(e){} },700); });
}async function saveTCTinyFieldMd(tcid, field, md, html){
  const tc=tcList.find(t=>(t.tcid===tcid)||(t.id===tcid)); if(!tc) return;
  tc[field]=md; tc[field+'_md']=md; tc[field+'_html']=html;
  try{ await saveTCFile(tc); }catch(e){}
}
// TC 일괄 편집용 TinyMCE (여러 TC의 Object/Pre-Condition을 한번에 덮어쓰기)
var _e3BulkTiny={};
function e3BulkTinyInit(field){
  if(!(window.toastui&&toastui.Editor)){ setTimeout(()=>e3BulkTinyInit(field),400); return; }
  var box=document.getElementById('e3-bulk-tiny-'+field); if(!box) return;
  try{ if(_e3BulkTiny[field]&&_e3BulkTiny[field].destroy) _e3BulkTiny[field].destroy(); }catch(e){}
  box.innerHTML='';
  var ed=new toastui.Editor({ el:box, initialValue:'', initialEditType:'wysiwyg', previewStyle:'tab', height:'auto', usageStatistics:false, plugins:_tuiPlugins(),
    hooks:{addImageBlobHook:function(blob,cb){ var fr=new FileReader(); fr.onload=function(){ cb(fr.result,'image'); }; fr.readAsDataURL(blob); }} });
  _e3BulkTiny[field]=ed;
}
async function e3BulkApplyField(field){
  var ed=_e3BulkTiny[field]; if(!ed) return;
  var md=ed.getMarkdown(), html=ed.getHTML();
  if(!md||!md.trim()){ if(typeof showToast==='function')showToast('내용을 입력하세요'); return; }
  var ids=Array.from(e3SelTcs); if(!ids.length){ if(typeof showToast==='function')showToast('선택된 TC가 없습니다'); return; }
  var label=field==='object'?'Object':'Pre-Condition';
  if(!confirm('선택된 '+ids.length+'개 TC의 '+label+'을(를) 덮어씁니다. 계속하시겠습니까?')) return;
  for(var i=0;i<ids.length;i++){
    var tc=tcList.find(function(t){return (t.tcid===ids[i])||(t.id===ids[i]);}); if(!tc) continue;
    tc[field]=md; tc[field+'_md']=md; tc[field+'_html']=html;
    try{ await saveTCFile(tc); }catch(e){}
  }
  if(typeof showToast==='function')showToast(label+' — '+ids.length+'개 TC에 적용되었습니다');
}

// 프롬프트 모달 (화면 중앙)
function req2TogglePrompt(reqId, type){
  const popId='req2-prompt-popover-'+reqId+'-'+type;
  const pop=document.getElementById(popId);
  if(!pop) return;
  // 모달 오버레이 생성
  let overlay=document.getElementById('req2-prompt-overlay');
  if(!overlay){
    overlay=document.createElement('div');
    overlay.id='req2-prompt-overlay';
    overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:8000;display:flex;align-items:center;justify-content:center;';
    overlay.onclick=e=>{ if(e.target===overlay) req2ClosePrompt(); };
    document.body.appendChild(overlay);
  }
  overlay.style.display='flex';
  // 팝오버를 overlay 안으로 이동 - flex column 구조로 버튼 항상 하단 고정
  pop.style.cssText='display:flex;flex-direction:column;position:relative;width:860px;max-width:92vw;max-height:82vh;background:#fff;border:2px solid var(--blue);border-radius:16px;box-shadow:0 8px 40px rgba(45,111,212,0.2);overflow:hidden;z-index:8001;';
  overlay.innerHTML='';
  overlay.appendChild(pop);
  // 내부 구조 조정: textarea flex:1, 버튼div 고정
  const hdr=pop.querySelector('div[style*="font-size:16px"]');
  if(hdr){ hdr.style.padding='22px 24px 12px'; hdr.style.flexShrink='0'; hdr.style.borderBottom='1px solid var(--border)'; }
  const ta=pop.querySelector('textarea');
  if(ta){ ta.style.flex='1'; ta.style.margin='0'; ta.style.width='100%'; ta.style.boxSizing='border-box'; ta.style.borderRadius='0'; ta.style.border='none'; ta.style.borderBottom='1px solid var(--border)'; ta.style.padding='16px 24px'; ta.style.resize='none'; }
  const btnDiv=pop.querySelector('div[style*="justify-content:flex-end"]');
  if(btnDiv){ btnDiv.style.cssText='display:flex;gap:10px;justify-content:flex-end;padding:14px 24px;background:#f9fafb;flex-shrink:0;'; }
  window._req2PromptOriginParent=document.getElementById('req2-tabcontent-'+reqId);
  window._req2PromptEl=pop;
}
function req2ClosePrompt(){
  const overlay=document.getElementById('req2-prompt-overlay');
  if(!overlay) return;
  // 팝오버를 숨기고 원래 부모로 복귀
  const pop=overlay.querySelector('[id^="req2-prompt-popover-"]');
  if(pop){
    pop.style.display='none';
    pop.style.cssText='display:none;width:420px;background:#fff;border:1.5px solid var(--blue);border-radius:10px;padding:12px;';
    // 원래 tabcontent 안으로 복귀 (relative div 안)
    const relWrap=pop.previousSibling||pop.parentElement;
    // 팝오버 ID에서 reqId/type 추출
    const m=pop.id.match(/req2-prompt-popover-(.+)-(\w+)$/);
    if(m){
      const [,reqId,type]=m;
      const btn=document.querySelector('button[onclick*="req2TogglePrompt(\''+reqId+'\',\''+type+'\')"]');
      if(btn&&btn.parentElement) btn.parentElement.appendChild(pop);
    }
  }
  overlay.style.display='none';
}

// 8번: 제품군 실시간 토글 - 테이블 Category 셀도 즉시 반영
// 5번: Description + 프롬프트 LLM
async function req2LLMDesc(reqId){
  const r=reqList.find(x=>x.id===reqId);
  if(!r) return;
  const promptEl=document.getElementById('req2-ov-prompt-'+reqId);
  const userPrompt=promptEl?promptEl.value.trim():'';
  const notice=document.getElementById('req2-ov-notice-'+reqId);
  if(notice){notice.style.display='block';notice.textContent='✨ LLM 생성 중...';}
  const selLLMId=document.getElementById('chat-model-select')?.value;
  const llm=llmList.find(x=>x.id===selLLMId);
  const basePrompt='다음 네트워크 요구사항의 상세 설명을 작성해주세요.\nREQ ID: '+r.reqid+'\n제목: '+r.title+'\n';
  const finalPrompt=basePrompt+(userPrompt?'추가 요구사항: '+userPrompt+'\n':'')+'\nJSON으로만 응답: {"overview":"상세 설명 (한국어, 3-5문장, 마크다운 없이)"}';
  try{
    let reply='';
    if(!llm||llm.type==='claude'){
      const res=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:finalPrompt,history:[]})});
      reply=(await res.json()).reply;
    } else {
      const res=await fetch('/api/chat/local',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({endpoint:llm.endpoint,model:llm.model,messages:[{role:'user',content:finalPrompt}],max_tokens:llm.max_tokens||1024,context_size:llm.context_size||262144,temperature:0.3,apikey:llm.apikey||''})});
      reply=(await res.json()).reply;
    }
    const m=reply.match(/\{[\s\S]*\}/);
    const text=m?JSON.parse(m[0]).overview:reply.trim();
    if(text){
      r.overview=text; r.overview_md=text; await saveOneREQ(r);
      const ed=_tinyEditors[reqId];
      if(ed&&ed.setMarkdown){ ed.setMarkdown(text); }
      else if(ed&&ed.setContent){ ed.setContent(text); }
      else{ const el=document.getElementById('req2-ov-'+reqId); if(el) el.value=text; }
      if(notice){notice.textContent='✓ 완료';setTimeout(()=>{notice.style.display='none';},3000);}
    }
  } catch(e){ if(notice){notice.textContent='⚠ 오류: '+e.message;} }
}

// req2InlineUpdate 확장 - products 업데이트
const _origReq2InlineUpdate=window.req2InlineUpdate;// REQ TC탭에서 수동 TC 추가
function openNewTC4ForREQ(reqId){
  const r=reqList.find(x=>x.id===reqId);
  if(!r){ alert('REQ를 찾을 수 없습니다.'); return; }
  // tc4SelReqId 설정 후 TC 추가 모달 호출
  tc4SelReqId=reqId;
  openNewTC4();
}

function req2ToggleSel(id, checked){
  if(checked) req2SelIds.add(id);
  else req2SelIds.delete(id);
  req2UpdateBulkBar();
}
function req2UpdateBulkBar(){
  const bar=document.getElementById('req2-bulk-bar');
  const cnt=document.getElementById('req2-sel-count');
  if(!bar) return;
  if(req2SelIds.size>0){
    bar.style.display='flex';
    if(cnt) cnt.textContent=`${req2SelIds.size}개 선택됨`;
  } else {
    bar.style.display='none';
  }
}
async function req2BulkDelete(){
  const ids=[...req2SelIds];
  if(!ids.length) return;
  const tcTotal=ids.reduce((s,id)=>{const r=reqList.find(x=>x.id===id);return s+(r?.tc||[]).length;},0);
  if(!confirm('REQ '+ids.length+'개를 삭제하시겠습니까?'+(tcTotal>0?'\n연결된 TC '+tcTotal+'개도 함께 삭제됩니다.':''))) return;
  for(const id of ids){
    const r=reqList.find(x=>x.id===id);
    if(!r) continue;
    for(const ref of (r.tc||[])){ await deleteTCFile(ref.tcid); tcList=tcList.filter(t=>t.tcid!==ref.tcid); }
    await deleteOneREQ(r.reqid);
    reqList=reqList.filter(x=>x.id!==id);
  }
  req2SelIds.clear();
  req2RenderTree();
  req2Render();
}
function req2ClearSel(){
  req2SelIds.clear();
  req2Render();
}
function req2ToggleAll(cb){
  const rows=document.querySelectorAll('.req2-table tbody tr:not(.detail-row) input[type=checkbox]');
  rows.forEach(input=>{
    const id=input.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
    if(id){
      input.checked=cb.checked;
      if(cb.checked) req2SelIds.add(id);
      else req2SelIds.delete(id);
    }
  });
  req2UpdateBulkBar();
}

// showPage 시 req2 초기화
const _origShowPage=window.showPage;

function showSubPage(name){ showPage(name); }

// ── 공통 LLM 상태 표시 ──
let _llmOverlayTimer=null;
function llmShowRunning(noticeId, msg){
  // 전역 오버레이 표시
  const overlay=document.getElementById('llm-overlay');
  const msgEl=document.getElementById('llm-overlay-msg');
  if(overlay&&msgEl){ msgEl.textContent=msg||'LLM 처리 중...'; overlay.style.display='block'; }
  // 섹션 헤더 notice도 표시
  const el=document.getElementById(noticeId);
  if(el) el.innerHTML=`<span class="llm-running" style="font-size:10px;"><i class="ti ti-circle-filled" style="font-size:7px;" aria-hidden="true"></i> 처리 중</span>`;
}
function llmShowSuccess(noticeId, msg, autoClear=true){
  // 오버레이 숨기기
  const overlay=document.getElementById('llm-overlay');
  if(overlay) overlay.style.display='none';
  const el=document.getElementById(noticeId);
  if(el){ el.innerHTML=`<span style="font-size:10px;color:var(--green);font-weight:500;">✓ ${msg}</span>`; if(autoClear) setTimeout(()=>{if(el)el.innerHTML='';},3000); }
}
function llmShowError(noticeId, msg){
  const overlay=document.getElementById('llm-overlay');
  if(overlay) overlay.style.display='none';
  const el=document.getElementById(noticeId);
  if(el){ el.innerHTML=`<span style="font-size:10px;color:var(--red);font-weight:500;">✗ ${msg}</span>`; setTimeout(()=>{if(el)el.innerHTML='';},4000); }
}
// ── 개요 LLM 보완 ──
async function llmGenOverview(reqId){
  const r=reqList.find(x=>x.id===reqId);
  if(!r) return;
  const selLLMId=document.getElementById('ai-fab-model')?.value||document.getElementById('chat-model-select')?.value;
  let llm=llmList.find(x=>x.id===selLLMId);
  if(!llm) llm=llmList.find(x=>x.status==='active'&&(x.uses||[]).includes('req'))||llmList.find(x=>x.status==='active');
  const noticeId='req2-ov-notice-'+reqId;
  llmShowRunning(noticeId, 'LLM 개요 생성 중...');
  const notice=document.getElementById(noticeId);
  if(notice) notice.style.display='block';

  const _ufp=((llm&&llm.field_prompts&&llm.field_prompts.req&&llm.field_prompts.req.overview)||'').trim();
  const prompt=_ufp?(_ufp+`\n\nREQ ID: ${r.reqid}\n제목: ${r.title}\n현재 개요: ${r.overview||'없음'}\n\n반드시 JSON으로만 응답: {"overview":"..."}`):`다음 네트워크 요구사항의 개요를 작성해주세요.\nREQ ID: ${r.reqid}\n제목: ${r.title}\n현재 개요: ${r.overview||'없음'}\nJSON으로만 응답: {"overview":"개요 (한국어, 3-5문장, 마크다운 없이)"}`;

  try{
    let reply='';
    if(!llm||llm.type==='claude'){
      const res=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:prompt,history:[]})});
      reply=(await res.json()).reply;
    } else {
      const res=await fetch('/api/chat/local',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({endpoint:llm.endpoint,model:llm.model,messages:[{role:'user',content:prompt}],max_tokens:llm.max_tokens||1024,context_size:llm.context_size||262144,temperature:0.3,apikey:llm.apikey||''})});
      reply=(await res.json()).reply;
    }
    const m=reply.match(/\{[\s\S]*\}/);
    if(m){
      const data=JSON.parse(m[0]);
      if(data.overview){
        r.overview=data.overview; r.overview_md=data.overview;
        await saveOneREQ(r);
        // 새 UI 요소 업데이트 (Toast UI 마크다운 에디터)
        const ed2=_tinyEditors[reqId];
        if(ed2&&ed2.setMarkdown){ ed2.setMarkdown(data.overview); }
        else{ const el=document.getElementById('req2-ov-'+reqId); if(el) el.value=data.overview; }
        llmShowSuccess(noticeId, '개요가 생성되었습니다.');
        setTimeout(()=>{ if(notice) notice.style.display='none'; },3000);
      }
    } else {
      llmShowError(noticeId, '응답 파싱 실패. 다시 시도해주세요.');
    }
  } catch(e){
    llmShowError(noticeId, e.message);
  }
}

// ── 시나리오 LLM 생성 ──
async function llmGenScenarios(reqId){
  const r=reqList.find(x=>x.id===reqId);
  if(!r) return;
  const selLLMId=document.getElementById('ai-fab-model')?.value||document.getElementById('chat-model-select')?.value;
  let llm=llmList.find(x=>x.id===selLLMId);
  if(!llm) llm=llmList.find(x=>x.status==='active'&&(x.uses||[]).includes('req'))||llmList.find(x=>x.status==='active');
  // 새 UI notice (req2 scenario 탭)
  const noticeId='req2-sc-list-notice-'+reqId;
  let noticeEl=document.getElementById(noticeId);
  if(!noticeEl){
    const list=document.getElementById('req2-sc-list-'+reqId);
    if(list){ noticeEl=document.createElement('div'); noticeEl.id=noticeId; noticeEl.style.cssText='font-size:12.5px;color:#9d7bff;padding:8px;'; list.prepend(noticeEl); }
  }
  if(noticeEl) noticeEl.textContent='✨ LLM 시나리오 생성 중...';

  // 7번: 사용자 프롬프트 읽기
  const _scFp=((llm&&llm.field_prompts&&llm.field_prompts.req&&llm.field_prompts.req.scenarios)||'').trim();
  const userPrompt=[_scFp,(document.getElementById('req2-sc-prompt-'+reqId)?.value||'').trim()].filter(Boolean).join('\n');

  const existing=parseScenarios(r.scenarios);
  const existingIdStr=existing.map(s=>s.id).join(', ');
  const reqParts=r.reqid.split('-');
  const reqSeq=reqParts.slice(-1)[0]||'001';
  const reqBase=reqParts.slice(0,-1).join('-');
  const scExampleId=`${reqBase}-SC-0${existing.length+1}-${reqSeq}`;
  const prompt=`다음 REQ의 동작 시나리오를 생성해주세요.\nREQ ID: ${r.reqid}\n제목: ${r.title}\n개요: ${r.overview||'없음'}\n기존 시나리오 ID: ${existingIdStr||'없음'}\nJSON 배열로만 응답: [{"id":"${scExampleId}","desc":"시나리오 설명"}]`;

  try{
    let reply='';
    if(!llm||llm.type==='claude'){
      const res=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:prompt,history:[]})});
      reply=(await res.json()).reply;
    } else {
      const res=await fetch('/api/chat/local',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({endpoint:llm.endpoint,model:llm.model,messages:[{role:'user',content:prompt}],max_tokens:llm.max_tokens||2048,context_size:llm.context_size||262144,temperature:0.3,apikey:llm.apikey||''})});
      reply=(await res.json()).reply;
    }
    const m=reply.match(/\[[\s\S]*\]/);
    if(m){
      const newScs=JSON.parse(m[0]);
      const existingSet=new Set(existing.map(s=>s.id));
      const toAdd=newScs.filter(s=>!existingSet.has(s.id));
      if(toAdd.length===0){
        if(noticeEl) noticeEl.textContent='⚠ 이미 동일한 시나리오가 존재합니다.';
      } else {
        const merged=[...existing,...toAdd];
        r.scenarios=JSON.stringify(merged);
        await saveOneREQ(r);
        // 시나리오 표만 부분 갱신 — 전체 탭 재렌더 방지
        req2RenderScenarioRows(reqId);
        if(noticeEl) noticeEl.textContent=`✓ 시나리오 ${toAdd.length}개 추가됨`;
        setTimeout(()=>{ if(noticeEl) noticeEl.textContent=''; },3000);
      }
    } else {
      if(noticeEl) noticeEl.textContent='⚠ 응답 파싱 실패.';
    }
  } catch(e){
    if(noticeEl) noticeEl.textContent='⚠ '+e.message;
  }
}


// 누적 버퍼에서 최상위 JSON 객체({...})를 완성되는 즉시 추출 (스트리밍 파싱용)
function _extractTopLevelObjects(buf, fromIdx){
  const objs=[]; let depth=0,start=-1,inStr=false,esc=false,last=fromIdx;
  for(let i=fromIdx;i<buf.length;i++){
    const c=buf[i];
    if(inStr){ if(esc)esc=false; else if(c==='\\')esc=true; else if(c==='"')inStr=false; continue; }
    if(c==='"'){ inStr=true; continue; }
    if(c==='{'){ if(depth===0)start=i; depth++; }
    else if(c==='}'){ if(depth>0){ depth--; if(depth===0&&start>=0){ const s=buf.slice(start,i+1); let o=null; try{o=JSON.parse(s);}catch(e){ try{o=JSON.parse(s.replace(/,\s*([\]}])/g,'$1'));}catch(e2){} } if(o)objs.push(o); start=-1; last=i+1; } } }
  }
  return {objs, nextIdx:last};
}
// 명령 없는(판정-only) step을 직전 명령 step의 expected(판정 기준)로 병합
function _isNoCmdInput(inp){
  inp=String(inp||'').trim();
  if(!inp) return true;
  if(/^[-–—.\s]+$/.test(inp)) return true;                 // 대시/점/공백만
  if(/\bn\/?a\b/i.test(inp)) return true;                   // N/A, NA (어디에 있든)
  if(/^(none|null|없음|해당\s*없음|동일|same|판정|확인|검증|결과\s*확인|출력\s*확인)$/i.test(inp)) return true;
  return false;
}
function _mergeNoCmdSteps(steps){
  const out=[];
  (steps||[]).forEach(s=>{
    if(_isNoCmdInput(s&&s.input) && out.length){
      const prev=out[out.length-1];
      const add=String((s&&s.expected)||(s&&s.desc)||'').trim();
      if(add) prev.expected=(String(prev.expected||'').trim()?prev.expected+' / ':'')+add;
    } else {
      out.push(Object.assign({}, s));
    }
  });
  return out;
}
// 기존 TC 데이터 정리: 명령 없는(N/A) 판정 step을 직전 명령 step의 판정기준으로 병합. 변경 시 true
function _normalizeTCChecks(tc){
  let changed=false;
  if(tc&&Array.isArray(tc.checks)){
    const out=[];
    tc.checks.forEach(c=>{
      const isCli=((c&&c.kind)||'cli')==='cli';
      // ★ 실행 결과가 있는 스텝(output/repeatResult/executed_at)은 절대 병합·제거하지 않음 → 실행 후 스텝 사라짐 방지
      const _hasResult = !!(c && (c.output || c.repeatResult || c.executed_at));
      if(isCli && !_hasResult && _isNoCmdInput(c&&c.cli) && out.length && ((out[out.length-1].kind||'cli')==='cli')){
        const prev=out[out.length-1];
        const add=String((c&&c.criteria)||'').trim();
        if(add) prev.criteria=(String(prev.criteria||'').trim()?prev.criteria+' / ':'')+add;
        changed=true;
      } else out.push(c);
    });
    if(changed) tc.checks=out;
  }
  if(tc&&Array.isArray(tc.steps)){
    const merged=_mergeNoCmdSteps(tc.steps);
    if(merged.length!==tc.steps.length){ tc.steps=merged.map(s=>({desc:s.desc||'',input:s.input||'',expected:s.expected||'',result:s.result||''})); changed=true; }
  }
  return changed;
}
// SSE(text/event-stream) 응답을 읽어 data:{text} 청크마다 onText 호출
async function _streamSSE(url, body, onText, signal){
  const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:signal});
  if(!res.ok||!res.body) throw new Error('스트리밍 응답 실패 ('+res.status+')');
  const reader=res.body.getReader(); const dec=new TextDecoder(); let sseBuf='';
  while(true){
    if(signal&&signal.aborted){ try{ reader.cancel(); }catch(e){} throw {name:'AbortError'}; }   // 멈춤 즉시 반영
    const {done,value}=await reader.read();
    if(done) break;
    sseBuf+=dec.decode(value,{stream:true});
    let idx;
    while((idx=sseBuf.indexOf('\n\n'))>=0){
      const evt=sseBuf.slice(0,idx); sseBuf=sseBuf.slice(idx+2);
      const line=evt.split('\n').find(l=>l.startsWith('data: '));
      if(!line) continue;
      const data=line.slice(6);
      if(data.trim()==='[DONE]') return;
      try{ const j=JSON.parse(data); if(j.text) onText(j.text); }catch(e){}
    }
  }
}

async function llmGenTC(reqId){
  const r=reqList.find(x=>x.id===reqId);
  if(!r) return;
  const selLLMId=document.getElementById('ai-fab-model')?.value||document.getElementById('chat-model-select')?.value;
  let llm=llmList.find(x=>x.id===selLLMId);
  if(!llm) llm=llmList.find(x=>x.status==='active'&&x.type!=='claude'&&(x.uses||[]).includes('tc'))||llmList.find(x=>x.status==='active'&&(x.uses||[]).includes('tc'))||llmList.find(x=>x.status==='active'&&x.type!=='claude')||llmList.find(x=>x.status==='active');
  if(!llm){ alert('LLM 관리에서 LLM을 먼저 등록·활성화하세요.'); return; }

  const scText=(()=>{try{const s=JSON.parse(r.scenarios||'[]');return Array.isArray(s)?s.map(x=>x.desc||x.id).join(', '):r.scenarios||'';}catch(e){return r.scenarios||'';}})();
  const _fmt='\n\n[작성 지침] 위 내용의 검증 포인트를 빠짐없이 도출하세요. 조회 결과/요구사항의 각 항목(예: 모델명, 메모리, H/W, S/W 버전 등)마다 개별 TC를 만들고, 정상 확인 케이스와 오류·예외·경계 케이스를 모두 포함해 가능한 상세하고 많이 생성하세요 (최소 5개 이상 권장).\n각 TC에는 시험 절차(steps)를 작성합니다. [절차 규칙] (1) step의 input에는 반드시 실제 CLI 명령/조작을 넣으세요. (2) 명령 없이 출력값만 확인하는 별도 step을 만들지 마세요. 명령 출력에서 특정 값(예: 모델명, 메모리, 버전)을 검증하는 내용은 그 명령 step의 expected(판정 기준)에 작성하세요. (3) 하나의 명령으로 여러 값을 검증하면 expected 한 칸에 모두 명시하세요. (예: show system 한 번 → expected "Model Name : E5010-24C 표시 확인"). input이 N/A·빈값인 step은 만들지 마세요.\n반드시 아래 JSON 배열로만 응답 (설명·마크다운·코드펜스 없이):\n[{"name":"구체적 TC명","type":"FT","precondition":"사전조건","input":"입력 CLI/조작","expected":"기대결과(구체적 값 포함)","pass":"Pass 조건","fail":"Fail 조건","steps":[{"desc":"절차 설명","input":"실제 CLI 명령","expected":"그 명령 출력의 판정 기준(구체적 값)"}]}, ...]';
  const _userTcPrompt=(document.getElementById('req2-tc-prompt-'+reqId)?.value||'').trim();
  let _manualCtx=''; try{ _manualCtx=await getActiveManualText(60000, [r.reqid,r.title,r.overview,r.implementation,scText].filter(Boolean).join(' ')); }catch(e){}
  let _learnCtx=''; try{ if(typeof getRelevantLearnedText==='function') _learnCtx=await getRelevantLearnedText([r.reqid,r.title,r.overview,r.implementation,scText].filter(Boolean).join(' '),8000); }catch(e){}
  try{ if(_learnCtx) console.log('%c[TC생성] 시험절차 학습 '+_learnCtx.length+'자 주입됨','color:#7c3aed;font-weight:bold'); }catch(e){}
  try{ if(_manualCtx) console.log('%c[TC생성] 매뉴얼 발췌 '+_manualCtx.length+'자 주입됨','color:#2d6fd4;font-weight:bold'); console.log(_manualCtx?_manualCtx.slice(0,3000)+(_manualCtx.length>3000?'\n…(이하 생략)':''):'[매뉴얼 미참고]'); }catch(e){}
  const _base=(_userTcPrompt?_userTcPrompt:('다음 요구사항과 구현 내용을 분석하여 TC 목록을 생성해주세요.\nREQ ID: '+r.reqid+'\n제목: '+r.title+'\n개요: '+(r.overview||'')+'\n시나리오: '+scText+(r.implementation?('\n\n[구현 내용 / CLI 조회 결과]\n'+r.implementation):'')));
  const prompt=_base+(_manualCtx?('\n\n[★중요 — 아래는 이 장비(유비쿼스 등)의 실제 매뉴얼입니다. TC의 CLI 명령·문법·프롬프트·출력 형식·판정 값은 반드시 이 매뉴얼에 나온 실제 명령을 근거로 작성하세요. Cisco IOS(예: configure terminal, switchport access vlan, Switch(config)#, GigaX/Y) 등 타사·일반 명령을 임의로 사용하지 마세요. 매뉴얼에 해당 명령이 없으면 매뉴얼의 표기·형식을 따르세요]\n'+_manualCtx):'')+(_learnCtx?('\n\n[★검증된 시험절차 학습 데이터 — 아래는 과거에 사람이 검증·저장한 실제 시험절차입니다. 유사 항목이 있으면 그 CLI 명령·판정 형식·정상출력을 최우선 근거로 삼아 동일한 스타일로 작성하세요]\n'+_learnCtx):'')+_fmt;

  // 진행 상황 표시 — 상단 헤더의 토스트 슬롯(구 메뉴 위치)에 우선 표시, 없으면 고정 토스트 폴백
  const _topSlot=document.getElementById('topbar-tc-progress');
  let noticeWrap, _inlineSlot=false;
  if(_topSlot){ noticeWrap=_topSlot; _inlineSlot=true; }
  else {
    noticeWrap=document.getElementById('llm-tc-progress');
    if(!noticeWrap){ noticeWrap=document.createElement('div'); noticeWrap.id='llm-tc-progress'; document.body.appendChild(noticeWrap); }
    noticeWrap.style.cssText='position:fixed;right:20px;bottom:20px;z-index:9000;background:#fff;border:1.5px solid var(--blue);border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,0.18);padding:11px 15px;font-size:12.5px;color:var(--text);max-width:360px;display:block;';
  }
  const _hideProg=(ms)=>setTimeout(()=>{ try{ if(_inlineSlot) noticeWrap.innerHTML=''; else if(noticeWrap) noticeWrap.style.display='none'; }catch(e){} }, ms);
  // 실시간 추가가 보이도록 차단형 오버레이는 띄우지 않음
  const overlay=document.getElementById('llm-overlay');
  if(overlay) overlay.style.display='none';

  const normalize=s=>(s||'').toLowerCase().trim().replace(/\s+/g,' ');
  const addedNames=new Set((r.tc||[]).map(t=>normalize(t.name)));
  const now=new Date().toISOString().slice(0,10);
  const baseId=r.reqid.replace(/-\d{3}$/,'');
  let added=0, dup=0;

  function addTC(t){
    if(!t||!t.name) return;
    const key=normalize(t.name);
    if(addedNames.has(key)){ dup++; return; }
    addedNames.add(key);
    let _seq=_nextSeqFor(baseId,'-TC-','tc'); let tcid; const _ids=_allTcIds();
    do{ tcid=`${baseId}-TC-${String(_seq).padStart(3,'0')}`; _seq++; }while(_ids.has(tcid));   // 전역(모든 REQ+tcList) 유일 보장
    const rawSteps=_mergeNoCmdSteps(Array.isArray(t.steps)?t.steps:[]);
    const steps=rawSteps.map(s=>({desc:s.desc||'',input:s.input||'',expected:s.expected||'',result:''}));
    // 절차 탭(checks 기반)에서도 보이고 실행되도록 cli/판정 체크로 변환
    const checks=rawSteps.map((s,i)=>({id:'ck'+Date.now()+'-'+i+'-'+Math.floor(Math.random()*10000),kind:'cli',model:'공통',cli:s.input||'',criteria:s.expected||'',type:'contains',indent:0}));
    const full={tcid, id:tcid, name:t.name, type:t.type||'FT', req_id:r.id,
      precondition:t.precondition||'', input:t.input||'', expected:t.expected||'',
      pass:t.pass||'', fail:t.fail||'', steps, checks,
      status:'대기', severity:'Normal', products:[], issue_list:[], result_history:[], traffic:{}, object:'', custom_fields:{}, created_by:_whoNow(), updated_by:_whoNow(), created_at:now, updated_at:now};
    try{ _normalizeTCChecks(full); }catch(e){}
    r.tc=[...(r.tc||[]), full];
    const exIdx=tcList.findIndex(x=>x.tcid===tcid);
    if(exIdx>=0) tcList[exIdx]=full; else tcList.push(full);
    try{ saveTCFile(full); }catch(e){}
    added++;
  }
  function liveNotice(){
    noticeWrap.innerHTML=`<span style="display:inline-flex;align-items:center;gap:8px;background:#2d6fd4;border-radius:20px;padding:6px 18px;font-size:12.5px;font-weight:700;color:#fff;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis;animation:tcpulse 1.3s ease-out infinite;"><i class="ti ti-loader-2" style="font-size:15px;display:inline-block;animation:tcspin 0.9s linear infinite;"></i> TC 실시간 생성 중 — <b style="font-size:15px;">${added}</b>개 추가됨${dup?` (중복 ${dup})`:''}${_manualCtx?' · 📚매뉴얼 참고':''} · ${(llm&&llm.name)||'?'}</span>`;
  }
  function liveRender(){
    liveNotice();
    try{ renderREQTree(); }catch(e){}
    try{ if(typeof renderExplorer==='function') renderExplorer(); }catch(e){}
    try{ if(typeof expSel!=='undefined'&&expSel&&expSel.type==='folder') expRenderFolderDetail(expSel.id); }catch(e){}
  }

  let buf='', consumed=0;
  const onText=(txt)=>{
    buf+=txt;
    const {objs,nextIdx}=_extractTopLevelObjects(buf,consumed);
    consumed=nextIdx;
    if(objs.length){ objs.forEach(addTC); liveRender(); }
  };

  liveNotice();
  try{
    if(!llm||llm.type==='claude'){
      await _streamSSE('/api/chat/stream',{message:prompt,max_tokens:8192},onText);
    } else {
      await _streamSSE('/api/chat/local/stream',{endpoint:llm.endpoint,model:llm.model,
        messages:[{role:'user',content:prompt}],max_tokens:llm.max_tokens||4096,
        context_size:llm.context_size||262144,temperature:0.3,apikey:llm.apikey||''},onText);
    }
    // 마지막 잔여 객체 flush
    { const {objs,nextIdx}=_extractTopLevelObjects(buf,consumed); consumed=nextIdx; if(objs.length){ objs.forEach(addTC); } }
  } catch(streamErr){
    // 스트리밍 실패 시 비스트리밍으로 폴백 (백엔드 미재시작 등)
    try{
      let reply='';
      if(!llm||llm.type==='claude'){
        const res=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:prompt,history:[],max_tokens:8192})});
        reply=(await res.json()).reply;
      } else {
        const res=await fetch('/api/chat/local',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:llm.endpoint,model:llm.model,messages:[{role:'user',content:prompt}],max_tokens:llm.max_tokens||4096,context_size:llm.context_size||262144,temperature:0.3,apikey:llm.apikey||''})});
        reply=(await res.json()).reply;
      }
      const m=String(reply||'').replace(/```json/gi,'').replace(/```/g,'').match(/\[[\s\S]*\]/);
      if(m){ let tcs; try{tcs=JSON.parse(m[0]);}catch(pe){tcs=JSON.parse(m[0].replace(/,\s*([\]}])/g,'$1'));} (Array.isArray(tcs)?tcs:[tcs]).forEach(addTC); }
      else { throw new Error('LLM 응답에서 JSON 배열을 찾지 못했습니다', {cause: streamErr}); }
    }catch(fbErr){
      saveOneREQ(r);
      noticeWrap.innerHTML='<span style="display:inline-flex;align-items:center;gap:7px;background:#e53e5a;border-radius:20px;padding:6px 18px;font-size:12.5px;font-weight:700;color:#fff;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis;box-shadow:0 2px 10px rgba(229,62,90,0.4);"><i class="ti ti-alert-circle" style="font-size:15px;"></i> '+fbErr.message+'</span>';
      _hideProg(6000);
      if(typeof showToast==='function') showToast('❌ TC 생성 오류: '+fbErr.message);
      return;
    }
  }

  saveOneREQ(r);
  if(added===0){
    noticeWrap.innerHTML=`<span style="display:inline-flex;align-items:center;gap:7px;background:#e8820c;border-radius:20px;padding:6px 18px;font-size:12.5px;font-weight:700;color:#fff;white-space:nowrap;box-shadow:0 2px 10px rgba(232,130,12,0.4);"><i class="ti ti-alert-triangle" style="font-size:15px;"></i> 생성된 새 TC 없음${dup?` (중복 ${dup}개 제외)`:''}</span>`;
    _hideProg(4500);
    if(typeof showToast==='function') showToast(dup?('모두 기존 TC와 이름 중복 ('+dup+'개)'):'생성된 TC가 없습니다');
  } else {
    const _manInfo=_manualCtx?(' · 📚 매뉴얼 '+Math.round(_manualCtx.length/1000)+'K자 참고'):' · 매뉴얼 미참고';
    const msg=`TC ${added}개 생성 완료${dup?` (중복 ${dup}개 제외)`:''}`;
    noticeWrap.innerHTML=`<span style="display:inline-flex;align-items:center;gap:7px;background:#00a872;border-radius:20px;padding:6px 18px;font-size:12.5px;font-weight:700;color:#fff;white-space:nowrap;box-shadow:0 2px 10px rgba(0,168,114,0.4);"><i class="ti ti-circle-check" style="font-size:16px;"></i> ${msg} · 절차 포함${_manInfo}</span>`;
    _hideProg(4000);
    if(typeof showToast==='function') showToast('✅ '+msg+' (LLM: '+((llm&&llm.name)||'')+')');
  }
  try{ renderREQTree(); }catch(e){}
  try{ selectREQItem(reqId); }catch(e){}
  try{ if(typeof expRenderREQDetail==='function'&&typeof expSel!=='undefined'&&expSel&&expSel.id===reqId) expRenderREQDetail(reqId); }catch(e){}
  try{ if(typeof renderExplorer==='function') renderExplorer(); }catch(e){}
  try{ if(typeof expSel!=='undefined'&&expSel&&expSel.type==='folder') expRenderFolderDetail(expSel.id); }catch(e){}
}

// 폴더 내 REQ 전체 수집 (하위 포함)
function getReqsInFolder(folderId, recursive=true){
  let reqs=reqList.filter(r=>r.folder===folderId);
  if(recursive){
    reqFolders.filter(f=>f.parent===folderId).forEach(f=>{
      reqs=[...reqs,...getReqsInFolder(f.id,true)];
    });
  }
  return reqs;
}

// 컬럼 정의 (순서/너비 저장)
let reqTableCols=[
  {key:'reqid',   label:'REQ ID',   width:220},
  {key:'priority',label:'우선순위', width:80},
  {key:'status',  label:'상태',     width:90},
  {key:'tc',      label:'TC',       width:50},
];
function saveColLayout(){ localStorage.setItem('utop_req_cols',JSON.stringify(reqTableCols)); }
// 폴더 선택 → REQ 목록 테이블
let selFolderId=null;

// ── 컬럼 리사이즈 ──
let resizeColIdx=-1, resizeStartX=0, resizeStartW=0;function colResizeMove(e){
  if(resizeColIdx<0) return;
  const dx=e.clientX-resizeStartX;
  const newW=Math.max(40,resizeStartW+dx);
  reqTableCols[resizeColIdx].width=newW;
  // 해당 col 태그만 업데이트
  const cols=document.querySelectorAll('#req-tbl col');
  if(cols[resizeColIdx]) cols[resizeColIdx].style.width=newW+'px';
}
function colResizeEnd(){
  resizeColIdx=-1;
  document.removeEventListener('mousemove',colResizeMove);
  document.removeEventListener('mouseup',colResizeEnd);
  saveColLayout();
}

// ── 컬럼 드래그 순서 변경 ──
let dragColIdx=-1, dragOverIdx=-1;// ══════════════════════════════════════════
// TC 관리
// ══════════════════════════════════════════
let tcList=[], selTCReqId=null, selTCId=null;

// TC ID 정규화: U-REQ-SYS-IPv4_L2-VLAN-001 → U-REQ-SYS-IPv4_L2-VLAN-TC-001
let _tcDataLoadedAt=0;
// 캐시는 딱 한 tick(수 백 ms) 만 — 동일 페이지 여러 서브 렌더가 연속 호출할 때만 스킵.
// 페이지 전환·재진입 시엔 항상 API 재요청 → TC 변경(추가/삭제/편집)이 즉시 다음 진입에 반영.
const TC_DATA_CACHE_MS=500;
var _tcDataInflight=null;      // 진행 중인 loadTCData 요청 — 중복 호출 시 이 promise 재사용
function invalidateTCDataCache(){ _tcDataLoadedAt=0; }
async function loadTCData(force){
  if(!force && _tcDataLoadedAt && (Date.now()-_tcDataLoadedAt)<TC_DATA_CACHE_MS) return;
  // ★ 진행 중 요청 있으면 재사용 — 페이지 초기화 훅 여러 곳에서 병렬 호출해도 API 1회만 실행됨
  if(!force && _tcDataInflight) return _tcDataInflight;
  _tcDataInflight=(async function(){
    try{
      // 전체 로드 (checks 포함). 지연 로딩(meta=1 + 클릭 시 loadTCFull) 은 UI 버그 다발로 제거.
      // no-store: 브라우저 HTTP 캐시 무시하고 항상 서버 최신 응답을 받음.
      const r=await fetch('/api/tc', {cache:'no-store'});
      const data=await r.json();
      tcList=data.tcs||[];
    } catch(e){ tcList=[]; }
    _tcDataLoadedAt=Date.now();
    // REQ의 tc 참조 배열도 tcList에 병합 (풀 데이터 없는 경우 보완)
    for(const r of reqList){
      for(const ref of (r.tc||[])){
        if(!ref.tcid) continue;
        const exists=tcList.find(t=>t.tcid===ref.tcid);
        if(!exists){
          tcList.push({...ref, req_id:r.id, status:ref.status||'대기'});
        } else if(!exists.req_id){
          exists.req_id=r.id;
        }
      }
    }
    // 전체 로드이므로 백그라운드 프리페치 불필요
  })().finally(function(){ _tcDataInflight=null; });
  return _tcDataInflight;
}
// 개별 TC 상세(checks 포함)를 서버에서 가져와 tcList 원소에 병합. 이미 checks 있으면 skip.
// 진행 중 요청은 promise 재사용으로 중복 fetch 방지.
var _tcLoadingPromise={};
async function loadTCFull(tcid, force, _skipNormalize){
  // 삭제된 tcid 는 조회 시도 자체 스킵 (404 반복 방지)
  if(typeof _tcIsDeleted==='function' && _tcIsDeleted(tcid)) return null;
  var _t=tcList.find(function(x){return (x.tcid||x.id)===tcid;});
  if(_t && Array.isArray(_t.checks) && !force) return _t;
  if(_tcLoadingPromise[tcid] && !force) return _tcLoadingPromise[tcid];   // 이미 진행 중이면 그 promise 반환 (중복 fetch 방지)
  var _p=(async function(){
    try{
      var r=await fetch('/api/tc/'+_tcUrl(tcid));
      if(r.status===404){
        // 서버에 이미 없음 → 로컬도 정리 + tombstone 등록 (다른 코드가 또 시도해도 위에서 차단)
        if(typeof _tcMarkDeleted==='function') _tcMarkDeleted(tcid);
        if(typeof tcList!=='undefined') tcList=(tcList||[]).filter(function(x){return (x.tcid||x.id)!==tcid;});
        return null;
      }
      if(!r.ok) return _t||null;
      var d=await r.json();
      if(_t){ Object.assign(_t, d); } else { tcList.push(d); _t=d; }
      // 프리페치에서는 normalize 스킵 (사용자가 편집기 진입할 때만 필요) — 무한 저장 루프 방지
      if(!_skipNormalize){
        try{ if(typeof _normalizeTCChecks==='function' && _normalizeTCChecks(_t)) saveTCFile(_t); }catch(e){}
      }
      return _t;
    }catch(e){ return _t||null; }
    finally{ delete _tcLoadingPromise[tcid]; }
  })();
  _tcLoadingPromise[tcid]=_p;
  return _p;
}
// WS 알림 수신: 다른 사용자가 TC/Cycle/REQ 를 저장·삭제하면 여기로 도달 → 캐시 무효화 + 필요시 재로드.
// 편집 중인 셀 보호를 위해 실제 재렌더는 조심스럽게 처리 (내가 그 아이템 편집 중이면 skip).
window.dataChangedOnWS=async function(msg){
  try{
    var _me=(typeof currentUser!=='undefined'&&currentUser)?(currentUser.name||currentUser.username):'';
    if(msg.type==='tc_updated' && msg.tcid){
      var _t=(tcList||[]).find(function(x){return (x.tcid||x.id)===msg.tcid;});
      if(_t){
        // 내가 이 TC 를 편집 중(활성 셀이 이 TC 안)이면 skip
        var _editingHere=false;
        try{ var _ae=document.activeElement; if(_ae && _ae.isContentEditable){ var _tr=_ae.closest && _ae.closest('tr[data-sid]'); if(_tr){ var _host=document.getElementById('tc3-tabcontent-'+msg.tcid)||document.getElementById('tmt-tabcontent-'+msg.tcid); if(_host && _host.contains(_ae)) _editingHere=true; } } }catch(_e){}
        if(_editingHere) return;
        // ★ 내가 실행 중인 TC 는 재로드 skip — 실행 도중 saveTC → 서버 broadcast echo 로 자기 재로드 되어 정규화가 스텝 삭제·화면 리셋하는 문제 방지
        try{
          if(typeof _bulkRun!=='undefined' && _bulkRun && typeof _runActive!=='undefined' && _runActive && _runActive.tcid===msg.tcid) return;
        }catch(_re){}
        // ★ 내가 직전(1.5초 안)에 저장한 tcid 의 broadcast echo → 재로드 skip. 편집 직후 UI 리셋(예: Query 칩 사라짐) 방지.
        try{
          var _js=(window._tcJustSaved||{})[msg.tcid]||0;
          if(_js && (Date.now()-_js)<1500) return;
        }catch(_re){}
        // 캐시 무효화 후 다시 로드 (force=true) — checks 는 삭제하지 않음 (lazy 로직 제거됨: 서버 응답으로 덮어씀)
        _t._loadingFull=false;
        await loadTCFull(msg.tcid, true, true);
        // 화면 갱신 — 지금 이 TC 를 보고 있으면
        try{ if(typeof e3RenderDetail==='function' && typeof e3SelTc!=='undefined' && e3SelTc===msg.tcid) e3RenderDetail(msg.tcid); }catch(_e){}
        try{ if(typeof e3bSetTcBodyHtml==='function' && typeof e3bTcInlineOpen!=='undefined' && e3bTcInlineOpen===msg.tcid) e3bSetTcBodyHtml(); }catch(_e){}
        try{ if(typeof tcProcRefresh==='function' && (document.getElementById('tc3-tabcontent-'+msg.tcid)||document.getElementById('tmt-tabcontent-'+msg.tcid))) tcProcRefresh(msg.tcid); }catch(_e){}
      } else {
        // 새로 추가된 TC — 목록에 없음. meta 다시 로드
        _tcDataLoadedAt=0;
        if(typeof loadTCData==='function') await loadTCData(true);
        try{ if(typeof e3bSetTcBodyHtml==='function') e3bSetTcBodyHtml(); }catch(_e){}
      }
      return;
    }
    if(msg.type==='tc_deleted' && msg.tcid){
      if(typeof _tcMarkDeleted==='function') _tcMarkDeleted(msg.tcid);
      tcList=(tcList||[]).filter(function(x){return (x.tcid||x.id)!==msg.tcid;});
      if(typeof _tcLoadingPromise!=='undefined') delete _tcLoadingPromise[msg.tcid];
      // 사이클 아이템에서 이 tcid 참조도 제거
      if(typeof cycleList!=='undefined'){
        (cycleList||[]).forEach(function(cy){
          if(!cy||!Array.isArray(cy.items)) return;
          cy.items=cy.items.filter(function(it){return it && (it.tcid||it.id)!==msg.tcid;});
        });
      }
      try{ if(typeof e3bSetTcBodyHtml==='function') e3bSetTcBodyHtml(); }catch(_e){}
      try{ if(typeof renderExplorer==='function') renderExplorer(); }catch(_e){}
      try{ if(typeof tcRefreshAll==='function') tcRefreshAll(); }catch(_e){}
      try{ if(typeof renderCycleBoard==='function' && document.getElementById('page-cycle') && document.getElementById('page-cycle').classList.contains('active')) renderCycleBoard(); }catch(_e){}
      return;
    }
    if(msg.type==='cycle_updated' && msg.cycle_id){
      var _cid=msg.cycle_id;
      var _c=(cycleList||[]).find(function(x){return x.id===_cid;});
      if(_c){
        // 내 사이클 실행 중이면 skip (실행자 화면은 실시간 브리지로 이미 갱신)
        if(typeof _cbRunActive!=='undefined' && _cbRunActive && typeof _cbRunKey!=='undefined' && _cbRunKey && String(_cbRunKey).split('@@')[0]===_cid) return;
        // 캐시 무효화 후 재로드
        _c._full=false;
        if(typeof loadCycleFull==='function') await loadCycleFull(_cid, true);
        try{ if(typeof renderCycleBoard==='function' && document.getElementById('page-cycle') && document.getElementById('page-cycle').classList.contains('active')) renderCycleBoard(); }catch(_e){}
        try{ var _dt=document.getElementById('cb-detail'); if(_dt && typeof cbExecHtml==='function') _dt.innerHTML=cbExecHtml(); }catch(_e){}
      } else {
        if(typeof loadCycleData==='function') await loadCycleData();
        try{ if(typeof renderCycleBoard==='function') renderCycleBoard(); }catch(_e){}
      }
      return;
    }
    if(msg.type==='cycle_deleted' && msg.cycle_id){
      cycleList=(cycleList||[]).filter(function(x){return x.id!==msg.cycle_id;});
      try{ if(typeof renderCycleBoard==='function') renderCycleBoard(); }catch(_e){}
      return;
    }
    if(msg.type==='req_updated' || msg.type==='req_deleted'){
      // REQ 는 loadREQData 로 통째로 다시 로드 (양이 적음)
      try{ if(typeof loadREQData==='function') await loadREQData(); }catch(_e){}
      if(msg.type==='req_deleted' && Array.isArray(msg.tcids)){
        msg.tcids.forEach(function(_tid){ tcList=(tcList||[]).filter(function(x){return (x.tcid||x.id)!==_tid;}); });
      }
      try{ if(typeof renderExplorer==='function') renderExplorer(); }catch(_e){}
      try{ if(typeof e3bSetTcBodyHtml==='function') e3bSetTcBodyHtml(); }catch(_e){}
      return;
    }
  }catch(_e){}
};
// 백그라운드 프리페치: meta 로 로드된 TC 를 idle 시간에 몇 개씩 상세 가져와 캐시.
// UI 를 방해하지 않도록 requestIdleCallback (없으면 setTimeout) 사용.
// 사용자가 클릭한 TC 는 이미 loadTCFull 로 우선 로드됨 → 중복 방지 위해 checks 있으면 skip.
var _tcPrefetchStarted=false;
function _tcStartPrefetch(){
  if(_tcPrefetchStarted) return; _tcPrefetchStarted=true;
  var _idle=window.requestIdleCallback||function(cb){ return setTimeout(function(){ cb({timeRemaining:function(){return 30;},didTimeout:false}); }, 200); };
  var _queue=[];
  var _fill=function(){ _queue=(tcList||[]).filter(function(t){return t && (t.tcid||t.id) && !Array.isArray(t.checks);}).map(function(t){return t.tcid||t.id;}); };
  _fill();
  var _step=function(deadline){
    // idle 시간 안에서 여러 TC 를 순차 fetch (동시 2개까지). 시간 다 되면 다음 idle 로.
    var _batch=[];
    while(_queue.length && _batch.length<2 && (!deadline || deadline.timeRemaining()>5)){
      _batch.push(_queue.shift());
    }
    if(!_batch.length){
      if(_queue.length===0) return;   // 모두 로드됨 → 종료
      _idle(_step); return;
    }
    Promise.all(_batch.map(function(tcid){ return loadTCFull(tcid, false, true).catch(function(){}); }))
      .then(function(){
        if(_queue.length===0) return;   // 완료 후 재확인 없이 종료 (재확인 시 무한 재시도 위험)
        _idle(_step);
      });
  };
  _idle(_step);
}

// 내가 방금 저장한 tcid → 시각 기록. dataChangedOnWS 에서 이 tcid 의 broadcast echo 를 skip 하기 위함.
window._tcJustSaved=window._tcJustSaved||{};
async function saveTCFile(tc){
  try{
    // ★ 안전장치: checks 가 배열이 아닌 상태(lazy 미로드 등)로 저장하면 서버 DB 의 checks 를 undefined 로
    //    덮어써서 스텝이 통째로 사라지는 사고 방지. 저장 자체를 취소.
    if(tc && !Array.isArray(tc.checks)){
      try{ console.warn('[saveTCFile] checks 배열 아님 → 저장 취소 (스텝 유실 방지)', tc.tcid||tc.id); }catch(_e){}
      return;
    }
    if(tc){ if(!tc.created_at) tc.created_at=new Date().toISOString(); if(!tc.created_by)tc.created_by=_whoNow(); tc.updated_at=new Date().toISOString(); tc.updated_by=_whoNow(); }
    if(tc && tc._rlsOnly){ if(typeof _rlsSaveTcBack==='function') _rlsSaveTcBack(tc); return; }   // Release Summary 전용 TC → data/tc 가 아니라 release_summary.json 에 저장(TC 관리 목록 미노출)
    if(tc && tc.tcid) window._tcJustSaved[tc.tcid]=Date.now();   // echo 판별용 타임스탬프
    // 서버 저장이 checks 를 반영한 새 _cli_count 를 갖도록 프론트도 즉시 갱신
    // (Coverage 표 배지의 실시간 반영 — 서버 응답을 기다리지 않고 로컬 checks 기준으로 카운트)
    try{
      if(tc && Array.isArray(tc.checks)){
        tc._cli_count=tc.checks.filter(function(x){return (x.kind||'cli')==='cli';}).length;
        tc._checks_count=tc.checks.length;
      }
    }catch(_e){}
    await fetch('/api/tc/'+_tcUrl(tc.tcid),{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(tc)});
    // 저장 후 Coverage 표 배지 즉시 갱신 (원본 3열 + Beta 둘 다)
    try{ if(typeof e3RebuildTcBody==='function') e3RebuildTcBody(); }catch(_e){}
    try{ if(typeof e3bRebuildTcBody==='function') e3bRebuildTcBody(); }catch(_e){}
  } catch(e){}
}

// 삭제된 tcid 를 기억 (세션 단위, 최대 500개). 이 tcid 는 이후 API 조회 자체를 차단해서
// "이미 지워졌는데 어딘가 참조 남아 계속 GET 시도 → 404 반복" 문제를 근본 차단.
var _tcTombstone=(window._tcTombstone=window._tcTombstone||new Set());

function _tcMarkDeleted(tcid){
  if(!tcid) return;
  _tcTombstone.add(String(tcid));
  if(_tcTombstone.size>500){   // 오래된 항목 정리
    var _first=_tcTombstone.values().next().value;
    _tcTombstone.delete(_first);
  }
}

function _tcIsDeleted(tcid){ return _tcTombstone.has(String(tcid||'')); }

async function deleteTCFile(tcid){
  try{ await fetch('/api/tc/'+_tcUrl(tcid),{method:'DELETE'}); }catch(e){}
  _tcMarkDeleted(tcid);
  try{
    if(typeof tcList!=='undefined') tcList=(tcList||[]).filter(function(x){return (x.tcid||x.id)!==tcid;});
    if(typeof _tcLoadingPromise!=='undefined') delete _tcLoadingPromise[tcid];
    // 사이클 아이템에서 이 tcid 참조도 제거 (있다면)
    if(typeof cycleList!=='undefined'){
      (cycleList||[]).forEach(function(cy){
        if(!cy||!Array.isArray(cy.items)) return;
        cy.items=cy.items.filter(function(it){return it && (it.tcid||it.id)!==tcid;});
      });
    }
    if(typeof e3bSetTcBodyHtml==='function') e3bSetTcBodyHtml();
    if(typeof renderExplorer==='function') renderExplorer();
    if(typeof tcRefreshAll==='function') tcRefreshAll();
    if(typeof expRenderTree==='function') expRenderTree();
  }catch(_e){}
}

// ══ TC 페이지 ══
let tcSelFolderId=null, tcSelReqId=null, tcSelTcId=null, tcFolderMode='single'; // single=단일폴더, all=하위전체

// ── 1열: 폴더 트리 ──
function renderTCReqTree(){
  const tree=document.getElementById('tc-folder-tree');
  if(!tree) return;
  const roots=reqFolders.filter(f=>!f.parent).sort((a,b)=>(a.order||0)-(b.order||0));
  tree.innerHTML=roots.map(f=>tcFolderHtml(f,0)).join('');
  if(tcSelFolderId) tcHighlightFolder(tcSelFolderId);
}

// ===== Requirements & Coverage — 3열 베타 (explorer3) : [REQ] | [TC] | [절차] =====
// 열 접기 상태는 localStorage 에서 복원 (새로고침·재접속에도 유지)
var e3SelReq=null, e3SelTc=null, e3SelFolder=null, e3Closed=null;
var e3C1=(function(){ try{ return localStorage.getItem('utop_e3_c1')==='1'; }catch(e){ return false; } })();
var e3C2=(function(){ try{ return localStorage.getItem('utop_e3_c2')==='1'; }catch(e){ return false; } })();
var e3C3=(function(){ try{ return localStorage.getItem('utop_e3_c3')==='1'; }catch(e){ return false; } })();
var e3TcTab={};
// 열 폭 (PC/브라우저별 개인 설정 — localStorage)
// 3열 폭 — 사용자별 저장(currentUser 이름을 키에 포함). 기본값 유지.
var e3W1=180, e3W2=480;
// 컬럼 순서 — 헤더 드래그로 위치 이동. 기본은 [1,2,3] (좌→우). 사용자별 저장.
var e3ColOrder=[1,2,3];
function _e3WidthsKey(){
  var u='';
  try{ if(typeof currentUser!=='undefined'&&currentUser) u=currentUser.name||currentUser.username||''; }catch(_e){}
  return 'utop_e3_widths::'+(u||'anon');
}
function _e3ColOrderKey(){
  var u='';
  try{ if(typeof currentUser!=='undefined'&&currentUser) u=currentUser.name||currentUser.username||''; }catch(_e){}
  return 'utop_e3_colorder::'+(u||'anon');
}
function _e3WidthsLoad(){
  try{
    var s=localStorage.getItem(_e3WidthsKey())||localStorage.getItem('utop_e3_widths');
    if(s){ var o=JSON.parse(s); if(o.w1&&o.w1>80) e3W1=o.w1; if(o.w2&&o.w2>80) e3W2=o.w2; }
  }catch(e){}
  try{
    var s2=localStorage.getItem(_e3ColOrderKey());
    if(s2){ var arr=JSON.parse(s2); if(Array.isArray(arr)&&arr.length===3) e3ColOrder=arr.map(function(x){return parseInt(x);}); }
  }catch(e){}
}
_e3WidthsLoad();
function e3SaveWidths(){
  try{ localStorage.setItem(_e3WidthsKey(), JSON.stringify({w1:e3W1,w2:e3W2})); }catch(e){}
}
function e3SaveColOrder(){
  try{ localStorage.setItem(_e3ColOrderKey(), JSON.stringify(e3ColOrder)); }catch(e){}
}
// 헤더 드래그로 두 컬럼 위치 스왑 — 소스 컬럼(fromN)과 타겟 컬럼(toN) 의 order 배열 위치를 교환.
var _e3HdrDragFrom=null;
function e3HdrDragStart(ev, n){
  _e3HdrDragFrom=n;
  try{ ev.dataTransfer.effectAllowed='move'; ev.dataTransfer.setData('text/plain','col'+n); }catch(_e){}
}
function e3HdrDragOver(ev, n){
  if(_e3HdrDragFrom==null||_e3HdrDragFrom===n) return;
  ev.preventDefault();
  try{ ev.dataTransfer.dropEffect='move'; }catch(_e){}
}
function e3HdrDrop(ev, n){
  ev.preventDefault();
  var from=_e3HdrDragFrom; _e3HdrDragFrom=null;
  if(from==null||from===n) return;
  // e3ColOrder 배열에서 from 과 n 의 위치 교환
  var iFrom=e3ColOrder.indexOf(from), iTo=e3ColOrder.indexOf(n);
  if(iFrom<0||iTo<0) return;
  var tmp=e3ColOrder[iFrom]; e3ColOrder[iFrom]=e3ColOrder[iTo]; e3ColOrder[iTo]=tmp;
  e3SaveColOrder();
  renderExplorer3();
}
function e3HdrDragEnd(){ _e3HdrDragFrom=null; }
// 컬럼 배치 초기화 — 기본 순서(1,2,3) 로 되돌림
function e3ResetColOrder(){
  e3ColOrder=[1,2,3]; e3SaveColOrder(); renderExplorer3();
  if(typeof showToast==='function') showToast('컬럼 배치를 기본 순서로 복원했습니다');
}
// ── 검색/정렬/필터 상태 ──
var e3Search='', e3SortKey='reqid', e3SortDir=1, e3TcSortKey='tcid', e3TcSortDir=1;
var e3FilterStatus='', e3FilterPriority='', e3FilterOpen=false;
// 폴더 하위 전체 ID 수집 (전역 — e3TcListHtml·e3PickFolder 등에서 공용)
function e3DescIds(fid){ var out=[fid]; (reqFolders||[]).filter(function(c){return c.parent===fid;}).forEach(function(c){ out.push.apply(out,e3DescIds(c.id)); }); return out; }
// ── 다중선택 상태 ──
var e3SelReqs=new Set(), e3SelTcs=new Set();
var e3FlatReqOrder=[], e3FlatTcOrder=[], e3SelAnchorReq=null, e3SelAnchorTc=null;
// ── 강조 색상(Accent) : 폴더명 / REQ ID / REQ 제목 / TC ID / TC Summary (브라우저 localStorage 개인 설정) ──
var E3_ACCENT_DEF={folder:'#564a7e', reqid:'#2d6fd4', reqtitle:'#1a1d2e', tcid:'#2d6fd4', tcname:'#1a1d2e'};
var e3Accent=(function(){
  var d={folder:E3_ACCENT_DEF.folder, reqid:E3_ACCENT_DEF.reqid, reqtitle:E3_ACCENT_DEF.reqtitle, tcid:E3_ACCENT_DEF.tcid, tcname:E3_ACCENT_DEF.tcname};
  try{ var s=localStorage.getItem('utop_e3_accent'); if(s){ var o=JSON.parse(s); ['folder','reqid','reqtitle','tcid','tcname'].forEach(function(k){ if(o&&o[k]) d[k]=o[k]; }); } }catch(e){}
  return d;
})();
function e3AccentSave(){ try{ localStorage.setItem('utop_e3_accent', JSON.stringify(e3Accent)); }catch(e){} }
function e3AccentSet(key,val){ if(!(key in e3Accent)) return; e3Accent[key]=val; e3AccentSave(); renderExplorer3(); }
// ── 표시 여부 : REQ ID / TC ID (서버 공용 설정 — 관리자가 변경하면 전체 유저 적용, 서버 없으면 localStorage 폴백) ──
// 사용자별 저장 키 — currentUser 이름을 접미어로. 로그인 전(anon) 값이 있으면 로그인 후에도 개인 값이 우선.
function _e3ShowKey(base){
  var u='';
  try{ if(typeof currentUser!=='undefined'&&currentUser) u=currentUser.name||currentUser.username||''; }catch(_e){}
  return base+'::'+(u||'anon');
}
function _e3ShowLoad(name, def){
  try{
    var v=localStorage.getItem(_e3ShowKey('utop_e3_show_'+name));
    if(v!==null) return v==='1';
    // 하위 호환: 옛 전역 키
    var v2=localStorage.getItem('utop_e3_show_'+name);
    if(v2!==null) return v2==='1';
  }catch(_e){}
  return def;
}
var e3ShowReqId=_e3ShowLoad('reqid', true);
var e3ShowTcId=_e3ShowLoad('tcid', true);
function _e3LoadUiOptions(cb){
  // 사용자별 저장 방식으로 전환 — 서버 GET 은 skip. 순수 localStorage 값만 사용.
  // (기존에는 서버 파일 `data/config/ui_options.json` 을 모든 사용자 공유했었음 → 이제 개인화)
  try{
    e3ShowReqId=_e3ShowLoad('reqid', true);
    e3ShowTcId=_e3ShowLoad('tcid', true);
    if(typeof e3bShowReqId!=='undefined') e3bShowReqId=e3ShowReqId;
    if(typeof e3bShowTcId!=='undefined') e3bShowTcId=e3ShowTcId;
  }catch(_e){}
  if(cb) cb();
}
_e3LoadUiOptions(function(){
  var p=document.getElementById('page-explorer3');
  if(p&&p.classList.contains('active')) renderExplorer3();
  if(typeof _rcAccentRefresh==='function') _rcAccentRefresh();
});
function e3SetShowReqId(v){
  // 사용자별 localStorage 만 저장 (서버 저장 제거 — 개인 설정으로 전환)
  e3ShowReqId=!!v;
  try{ localStorage.setItem(_e3ShowKey('utop_e3_show_reqid'), v?'1':'0'); }catch(e){}
  try{ if(typeof e3bShowReqId!=='undefined') e3bShowReqId=!!v; }catch(_e){}
  renderExplorer3();
  if(typeof _rcAccentRefresh==='function') _rcAccentRefresh();
}
function e3SetShowTcId(v){
  e3ShowTcId=!!v;
  try{ localStorage.setItem(_e3ShowKey('utop_e3_show_tcid'), v?'1':'0'); }catch(e){}
  try{ if(typeof e3bShowTcId!=='undefined') e3bShowTcId=!!v; }catch(_e){}
  renderExplorer3();
  if(typeof _rcAccentRefresh==='function') _rcAccentRefresh();
}
// ── 글씨 굵게(Bold) : 폴더명 / REQ ID / REQ 제목 / TC ID / TC Summary (색상과 같은 localStorage 개인 설정) ──
var E3_BOLD_DEF={folder:true, reqid:true, reqtitle:false, tcid:true, tcname:true};
var e3Bold=(function(){
  var d={folder:E3_BOLD_DEF.folder, reqid:E3_BOLD_DEF.reqid, reqtitle:E3_BOLD_DEF.reqtitle, tcid:E3_BOLD_DEF.tcid, tcname:E3_BOLD_DEF.tcname};
  try{ var s=localStorage.getItem('utop_e3_bold'); if(s){ var o=JSON.parse(s); ['folder','reqid','reqtitle','tcid','tcname'].forEach(function(k){ if(o&&typeof o[k]==='boolean') d[k]=o[k]; }); } }catch(e){}
  // tcname 기본값 상향(v20260724) — 옛 저장값(false)을 새 기본값으로 1회 마이그레이션
  try{
    var _mig=localStorage.getItem('utop_e3_bold_v2');
    if(!_mig){ d.tcname=true; localStorage.setItem('utop_e3_bold', JSON.stringify(d)); localStorage.setItem('utop_e3_bold_v2','1'); }
  }catch(_e){}
  return d;
})();
function e3BoldSave(){ try{ localStorage.setItem('utop_e3_bold', JSON.stringify(e3Bold)); }catch(e){} }
function e3BoldSet(key,val){ if(!(key in e3Bold)) return; e3Bold[key]=!!val; e3BoldSave(); renderExplorer3(); }
function e3BoldReset(key){ if(!(key in E3_BOLD_DEF)) return; e3Bold[key]=E3_BOLD_DEF[key]; e3BoldSave(); renderExplorer3(); }
// 굵기 CSS 값(설정 true면 700, 아니면 400)
function e3FW(key){ return e3Bold[key]?'700':'400'; }
function e3AccentReset(key){ if(!(key in E3_ACCENT_DEF)) return; e3Accent[key]=E3_ACCENT_DEF[key]; e3AccentSave(); renderExplorer3(); }
// ── 글씨 크기(Font size) : 폴더명 / REQ ID / REQ 제목 / TC ID / TC Summary (색상·굵게와 같은 localStorage 개인 설정) ──
var E3_FONTSIZE_DEF={folder:12.5, reqid:11, reqtitle:12.5, tcid:12.5, tcname:14};
var e3FontSize=(function(){
  var d={folder:E3_FONTSIZE_DEF.folder, reqid:E3_FONTSIZE_DEF.reqid, reqtitle:E3_FONTSIZE_DEF.reqtitle, tcid:E3_FONTSIZE_DEF.tcid, tcname:E3_FONTSIZE_DEF.tcname};
  try{ var s=localStorage.getItem('utop_e3_fontsize'); if(s){ var o=JSON.parse(s); ['folder','reqid','reqtitle','tcid','tcname'].forEach(function(k){ if(o&&typeof o[k]==='number') d[k]=o[k]; }); } }catch(e){}
  // tcname 기본값 상향(v20260724) — 옛 저장값(12.5)을 새 기본값(14)으로 1회 마이그레이션
  try{
    var _mig=localStorage.getItem('utop_e3_fontsize_v2');
    if(!_mig){ d.tcname=14; localStorage.setItem('utop_e3_fontsize', JSON.stringify(d)); localStorage.setItem('utop_e3_fontsize_v2','1'); }
  }catch(_e){}
  return d;
})();
function e3FontSizeSave(){ try{ localStorage.setItem('utop_e3_fontsize', JSON.stringify(e3FontSize)); }catch(e){} }
function e3FontSizeSet(key,val){ if(!(key in e3FontSize)) return; var n=parseFloat(val); if(isNaN(n))return; n=Math.max(9,Math.min(20,n)); e3FontSize[key]=n; e3FontSizeSave(); renderExplorer3(); if(typeof _rcAccentRefresh==='function') _rcAccentRefresh(); }
function e3FontSizeReset(key){ if(!(key in E3_FONTSIZE_DEF)) return; e3FontSize[key]=E3_FONTSIZE_DEF[key]; e3FontSizeSave(); renderExplorer3(); if(typeof _rcAccentRefresh==='function') _rcAccentRefresh(); }
// 글씨 크기 CSS 값(px)
function e3FS(key){ return (e3FontSize[key]||E3_FONTSIZE_DEF[key]||12.5)+'px'; }
// 폰트 종류 (테마 설정에서 지정) — 없으면 상속 (font-family: inherit)
function e3FF(key){
  try{ var v=localStorage.getItem('uta_rc_ff_'+key); return v||''; }catch(e){ return ''; }
}
function e3FFStyle(key){ var v=e3FF(key); return v?('font-family:'+v+';'):''; }
function e3FontFamilySet(key,val){ renderExplorer3(); }
// 아이콘 커스터마이즈 헬퍼 (Tests Color 페이지에서 설정)
function e3IconGet(kind){
  try{ var ic=localStorage.getItem('uta_rc_icon_'+kind); var color=localStorage.getItem('uta_rc_iconcolor_'+kind);
    var sizeStr=localStorage.getItem('uta_rc_iconsize_'+kind);
    var size=sizeStr?parseInt(sizeStr,10):16; if(!size||isNaN(size)) size=16;
    if(kind==='folder') return {ic:ic||'ti-folder', color:color||'#e8a83c', size:size};
    if(kind==='req') return {ic:ic||'ti-file-text', color:color||'#2d6fd4', size:size};
  }catch(e){}
  return kind==='folder'?{ic:'ti-folder',color:'#e8a83c',size:16}:{ic:'ti-file-text',color:'#2d6fd4',size:16};
}
// 색상 선택 팝오버 (프리셋 팔레트 + 커스텀 컬러피커 + 기본값 복원)
function e3AccentPopup(e, key, label){
  if(e&&e.stopPropagation)e.stopPropagation();
  var old=document.getElementById('e3-accent-pop'); if(old) old.remove();
  var presets=['#2d6fd4','#7c3aed','#00875a','#e8820c','#e53e5a','#0ca678','#564a7e','#1a1d2e','#8890a4','#c0392b','#b5730a','#1a52b0'];
  var cur=e3Accent[key]||'#000000';
  var p=document.createElement('div');
  p.id='e3-accent-pop';
  p.style.cssText='position:fixed;z-index:10001;background:#fff;border:1px solid var(--border);border-radius:11px;box-shadow:0 10px 34px rgba(20,30,60,0.22);padding:12px;width:236px;font-size:12px;';
  var sw=presets.map(function(c){ var on=(String(c).toLowerCase()===String(cur).toLowerCase()); return '<div onclick="e3AccentSet(\''+key+'\',\''+c+'\');(function(){var x=document.getElementById(\'e3-accent-pop\');if(x)x.remove();})();" title="'+c+'" style="width:26px;height:26px;border-radius:7px;background:'+c+';cursor:pointer;box-shadow:'+(on?'0 0 0 2px #fff,0 0 0 4px '+c:'inset 0 0 0 1px rgba(0,0,0,0.08)')+';"></div>'; }).join('');
  p.innerHTML='<div style="font-weight:800;color:var(--text);margin-bottom:9px;display:flex;align-items:center;gap:6px;"><i class="ti ti-palette" style="color:'+cur+';"></i>'+label+' 색상</div>'
    +'<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:7px;margin-bottom:11px;">'+sw+'</div>'
    +'<div style="display:flex;align-items:center;gap:8px;">'
      +'<label style="display:flex;align-items:center;gap:6px;cursor:pointer;flex:1;"><input type="color" value="'+cur+'" oninput="e3AccentSet(\''+key+'\',this.value)" style="width:30px;height:26px;border:1px solid var(--border);border-radius:6px;padding:0;background:none;cursor:pointer;"><span style="color:var(--text2);">직접 선택</span></label>'
      +'<button onclick="e3AccentReset(\''+key+'\');(function(){var x=document.getElementById(\'e3-accent-pop\');if(x)x.remove();})();" style="font-size:11px;padding:5px 10px;border:1px solid var(--border);border-radius:7px;background:#fff;color:var(--text2);cursor:pointer;font-weight:600;">기본값</button>'
    +'</div>';
  document.body.appendChild(p);
  var mw=p.offsetWidth, mh=p.offsetHeight, x=(e?e.clientX:120), y=(e?e.clientY:120);
  if(x+mw>window.innerWidth) x=window.innerWidth-mw-8;
  if(y+mh>window.innerHeight) y=window.innerHeight-mh-8;
  p.style.left=Math.max(6,x)+'px'; p.style.top=Math.max(6,y+6)+'px';
  setTimeout(function(){ document.addEventListener('click', function _cl(ev){ var pp=document.getElementById('e3-accent-pop'); if(pp && !pp.contains(ev.target)){ pp.remove(); document.removeEventListener('click', _cl); } }); }, 0);
}
// 헤더용 색상 버튼 (현재 색을 점으로 표시)
function e3AccentBtn(key,label){ return '<button onclick="e3AccentPopup(event,\''+key+'\',\''+label+'\')" title="'+label+' 색상 변경" style="width:22px;height:22px;border-radius:5px;border:1px solid #d6dce6;background:#fff;cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;flex-shrink:0;position:relative;"><i class="ti ti-palette" style="font-size:13px;color:'+e3Accent[key]+';"></i></button>'; }
// ── 검색/정렬 조작 ──
function e3OnSearch(v){ e3Search=(v||'').trim().toLowerCase(); e3RebuildReqBody(); }
function e3SetSort(k){ e3SortKey=k; e3RebuildReqBody(); }
function e3ToggleSortDir(){ e3SortDir*=-1; var b=document.getElementById('e3-sort-dir'); if(b)b.textContent=e3SortDir>0?'↑':'↓'; e3RebuildReqBody(); }
function e3SetTcSort(k){ e3TcSortKey=k; e3RebuildTcBody(); }
function e3ToggleTcSortDir(){ e3TcSortDir*=-1; var b=document.getElementById('e3-tcsort-dir'); if(b)b.textContent=e3TcSortDir>0?'↑':'↓'; e3RebuildTcBody(); }
function e3OnFilterStatus(v){ e3FilterStatus=v||''; e3RebuildReqBody(); }
function e3OnFilterPriority(v){ e3FilterPriority=v||''; e3RebuildReqBody(); }
function e3ToggleFilter(){
  e3FilterOpen=!e3FilterOpen;
  var wrap=document.getElementById('e3-filter-wrap');
  var btn=document.getElementById('e3-filter-btn');
  if(wrap) wrap.style.display=e3FilterOpen?'':'none';
  if(btn){ btn.style.background=e3FilterOpen?'rgba(45,111,212,0.10)':'#fff'; btn.style.color=e3FilterOpen?'var(--blue)':'var(--text2)'; btn.style.borderColor=e3FilterOpen?'var(--blue)':'#d6dce6'; }
}
function e3AddRootFolder(){ if(typeof expAddFolder==='function') expAddFolder(null); else if(typeof req2OpenFolderModal==='function') req2OpenFolderModal(null,'new'); }
function e3ReqMatchSearch(r){ if(!e3Search)return true; return (r.reqid||'').toLowerCase().includes(e3Search)||(r.title||'').toLowerCase().includes(e3Search); }
function e3ReqMatch(r){ return e3ReqMatchSearch(r)&&(!e3FilterStatus||r.status===e3FilterStatus)&&(!e3FilterPriority||r.priority===e3FilterPriority); }
function e3TcMatchSearch(t){ if(!e3Search)return true; return (t.tcid||t.id||'').toLowerCase().includes(e3Search)||(t.name||'').toLowerCase().includes(e3Search); }
function e3SortReqs(arr){ return arr.slice().sort(function(a,b){ var va='',vb=''; if(e3SortKey==='title'){va=a.title||'';vb=b.title||'';}else{va=a.reqid||'';vb=b.reqid||'';} return va.localeCompare(vb)*e3SortDir; }); }
function e3SortTcs(arr){ return arr.slice().sort(function(a,b){ var va='',vb=''; if(e3TcSortKey==='name'){va=a.name||'';vb=b.name||'';}else{va=a.tcid||a.id||'';vb=b.tcid||b.id||'';} return va.localeCompare(vb)*e3TcSortDir; }); }
// 부분 갱신 헬퍼 (전체 재렌더 없이 본문만 교체)
function e3RebuildReqBody(){
  // 스크롤 위치 유지 — innerHTML 재세팅 시 scrollTop 이 0 으로 튀는 문제 방지
  var rb=document.getElementById('e3-req-body'); if(!rb) return;
  var _sc=rb.scrollTop||0;
  rb.innerHTML=e3TreeHtml();
  if(_sc) rb.scrollTop=_sc;
}
function e3RebuildTcBody(){
  // 편집 중인 TC Summary 셀 있으면 body 재렌더 스킵 (편집 잃음 방지) — 배지만 갱신
  if(document.querySelector('.e3-tcname-text[contenteditable="true"]')){
    var bd0=document.getElementById('e3-tc-badges'); if(bd0)bd0.outerHTML=e3TcCountBadges();
    return;
  }
  var tb=document.getElementById('e3-tc-body'); if(tb)tb.innerHTML=e3TcListHtml();
  var pg=document.getElementById('e3-tc-pager'); if(pg) pg.innerHTML=e3TcPagerCache||'';
  var bd=document.getElementById('e3-tc-badges'); if(bd)bd.outerHTML=e3TcCountBadges();
  // 툴바 갱신 — 선택 상태에 따라 액션바(New/일괄생성) 또는 선택 툴바(Clone/Edit/삭제/톱니바퀴) 로 대체.
  // _e3TcPanelHdr 이 두 툴바 중 하나만 렌더하므로 e3-tc-actbar / e3-tc-seltoolbar 둘 다 찾아 교체.
  var _selN=(typeof e3SelTcs!=='undefined'&&e3SelTcs)?e3SelTcs.size:0;
  var _cur=document.getElementById('e3-tc-actbar')||document.getElementById('e3-tc-seltoolbar');
  var _next=_selN?_e3TcSelToolbar():_e3TcActionBar();
  if(_cur) _cur.outerHTML=_next;
}
// ── 다중선택 헬퍼 ──
function e3IsSel(type,id){ return type==='tc'?e3SelTcs.has(id):e3SelReqs.has(id); }
function e3ClearSel(){ e3SelReqs.clear(); e3SelTcs.clear(); e3SelAnchorReq=null; e3SelAnchorTc=null; }
function e3ToggleSelReq(id,ev){
  if(ev&&ev.shiftKey&&e3SelAnchorReq){
    var a=e3FlatReqOrder.indexOf(e3SelAnchorReq), b=e3FlatReqOrder.indexOf(id);
    if(a>=0&&b>=0){ var lo=Math.min(a,b),hi=Math.max(a,b); for(var i=lo;i<=hi;i++)e3SelReqs.add(e3FlatReqOrder[i]); e3RebuildReqBody(); return; }
  }
  var on=!e3SelReqs.has(id); if(on)e3SelReqs.add(id); else e3SelReqs.delete(id);
  e3SelAnchorReq=id; e3RebuildReqBody();
}
function e3ToggleSelTc(id,ev){
  if(ev&&ev.shiftKey&&e3SelAnchorTc){
    var a=e3FlatTcOrder.indexOf(e3SelAnchorTc), b=e3FlatTcOrder.indexOf(id);
    if(a>=0&&b>=0){ var lo=Math.min(a,b),hi=Math.max(a,b); for(var i=lo;i<=hi;i++)e3SelTcs.add(e3FlatTcOrder[i]); e3RebuildTcBody(); return; }
  }
  var on=!e3SelTcs.has(id); if(on)e3SelTcs.add(id); else e3SelTcs.delete(id);
  e3SelAnchorTc=id; e3RebuildTcBody();
}
async function e3BulkDeleteReqs(){
  var ids=Array.from(e3SelReqs); if(!ids.length){if(typeof showToast==='function')showToast('선택된 REQ가 없습니다');return;}
  if(!confirm(ids.length+'개 REQ를 삭제하시겠습니까?'))return;
  for(var i=0;i<ids.length;i++){ try{await expDeleteREQ(ids[i],true);}catch(e){} }
  e3SelReqs.clear(); renderExplorer3();
}
async function e3BulkDeleteTcs(){
  var ids=Array.from(e3SelTcs); if(!ids.length){if(typeof showToast==='function')showToast('선택된 TC가 없습니다');return;}
  if(!confirm(ids.length+'개 TC를 삭제하시겠습니까?'))return;
  // 각 expDeleteTC 안의 renderExplorer/renderExplorer3 을 loop 중엔 스킵 (끝난 뒤 1회만) — 대량 삭제 성능·완료 보장
  window._expBulkSkipRender=true;
  try{
    var _promises=ids.map(function(id){ return expDeleteTC(id,true).catch(function(){}); });
    await Promise.all(_promises);
  } finally { window._expBulkSkipRender=false; }
  e3SelTcs.clear();
  try{ if(typeof renderExplorer==='function') renderExplorer(); }catch(_e){}
  renderExplorer3();
}
// TC ID 첫 세그먼트로 통신사 판별: KT / LGU(LGU+) / 그 외(공통=U 등)
function e3TcCarrier(id){ var seg=String(id||'').split('-')[0].toUpperCase(); if(seg==='KT') return 'kt'; if(seg==='LGU'||seg==='LGUPLUS'||seg==='LGU+') return 'lgu'; return 'etc'; }
// 화면 표시용 ID — 통신사/공통 접두어 제거. <통신사>-REQ[-SYS]- 마커까지(포함) 잘라 뒤쪽만 표시.
// 예) U-REQ-SYS-SW-EPON-001 → SW-EPON-001, KT-REQ-SYS-SW-EPON-IOP-001 → SW-EPON-IOP-001,
//     LGUPLUS-REQ-L2-E59xxRL-001 → L2-E59xxRL-001, U-REQ-SYS-SW-ENV-TC-002 → SW-ENV-TC-002
function e3DispId(id){
  var s=String(id||'');
  var m=s.match(/^[^-]+-REQ(?:-SYS)?-(.+)$/); if(m) return m[1];
  // 폴더 경로 통째로 붙은 ID → 프리픽스 + 가장 안쪽 계층 번호만 표시
  var parts=s.split(/-(?=\d+[\d.\-]*\.\s)/);
  if(parts.length>=2){
    var head=parts[0];
    var last=parts[parts.length-1];
    var lm=last.match(/^([\d]+(?:[-.][\d]+)*)\.\s/);
    if(lm) return head+'-'+lm[1];
  }
  return s;
}
// 선택한 REQ의 TC들을 통신사별로 집계해 Total/LGU+/KT 배지 HTML 반환 (Test Cases 헤더용)
function e3TcCountBadges(){
  var rq=(reqList||[]).find(function(x){return x.id===e3SelReq;});
  var tcs=rq?e3ReqTcs(rq):[];
  var total=tcs.length, lgu=0, kt=0;
  tcs.forEach(function(t){ var c=e3TcCarrier(t.tcid||t.id); if(c==='lgu')lgu++; else if(c==='kt')kt++; });
  var badge=function(label,val,col,bg){ return '<span style="display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:800;color:'+col+';background:'+bg+';border-radius:8px;padding:2px 8px;white-space:nowrap;">'+label+'<span style="font-size:11px;">'+val+'</span></span>'; };
  return '<div id="e3-tc-badges" style="display:flex;gap:5px;align-items:center;margin-right:4px;">'
    +badge('Total', total, '#475063', '#eef1f5')
    +badge('LGU+', lgu, '#c0392b', 'rgba(192,57,43,0.10)')
    +badge('KT', kt, '#1a52b0', 'rgba(26,82,176,0.10)')
    +'</div>';
}
// 전체 폴더/REQ 카운트 배지 HTML 반환 (Requirements 헤더용) — Total/LGU+/KT 배지와 동일 스타일
function e3ReqCountBadges(){
  var folders=(reqFolders||[]).length;
  var reqs=(reqList||[]).length;
  var badge=function(ic,label,val,col,bg){ return '<span style="display:inline-flex;align-items:center;gap:4px;font-size:14px;font-weight:800;color:'+col+';background:'+bg+';border-radius:8px;padding:2px 8px;white-space:nowrap;"><i class="ti '+ic+'" style="font-size:14px;"></i>'+label+' <span style="font-size:14px;">'+val+'</span></span>'; };
  return '<div id="e3-req-badges" style="display:flex;gap:5px;align-items:center;flex-wrap:wrap;">'
    +badge('ti-folder','폴더', folders, '#e8a83c', 'transparent')
    +badge('ti-clipboard-text','REQ', reqs, '#7c3aed', 'transparent')
    +'</div>';
}
function e3GW(pl){ var gg=(typeof expGuides==='function')?expGuides(pl):''; return gg?'<span style="display:flex;gap:6px;align-self:stretch;flex-shrink:0;margin:-5px 0;">'+gg+'</span>':''; }
function e3ReqTcs(r){ if(!r)return []; return (typeof expReqTCs==='function')?expReqTCs(r):tcList.filter(function(t){return t.req_id===r.id;}); }
// 검색어로 폴더 또는 하위에 표시할 REQ가 있는지 확인
function e3FolderVisible(f){
  if(!e3Search && !e3FilterStatus && !e3FilterPriority) return true;
  var reqs=reqList.filter(function(r){return r.folder===f.id;});
  if(reqs.some(e3ReqMatch)) return true;
  return reqFolders.filter(function(c){return c.parent===f.id;}).some(e3FolderVisible);
}
// ── e3(Requirements & Test Coverage) 트리 드래그 이동 ─────────
// req2 로직 재사용(req2DragStart/req2Drop/req2DropFolder/req2DropREQ) — 상태를 _drag 로 공유.
function e3DragStart(ev, type, id){
  try{ _drag={type:type, id:id}; ev.dataTransfer.effectAllowed='move'; ev.dataTransfer.setData('text/plain', id);
    var el=(type==='folder')?document.getElementById('e3-fd-'+id):document.getElementById('e3-rq-'+id);
    if(el){
      // 브라우저 기본 드래그 이미지를 커스텀 클론으로 교체 — 잡은 항목이 커서 옆에 명확히 표시됨
      _e3CustomDragImage(ev, el, type);
    }
    setTimeout(function(){
      if(el){
        el.style.opacity='0.35';
        el.style.background='repeating-linear-gradient(45deg,rgba(45,111,212,0.08),rgba(45,111,212,0.08) 6px,rgba(45,111,212,0.16) 6px,rgba(45,111,212,0.16) 12px)';
        el.style.outline='2px dashed #2d6fd4';
        el.style.outlineOffset='-2px';
        el.style.borderRadius='6px';
      }
    },0);
  }catch(e){}
}
// 커스텀 드래그 이미지 — 잡은 항목의 클론을 만들어 커서 옆에 라벨과 함께 표시
function _e3CustomDragImage(ev, srcEl, type){
  try{
    var _wrap=document.createElement('div');
    _wrap.style.cssText='position:absolute;top:-9999px;left:-9999px;background:#fff;border:2px solid #2d6fd4;border-radius:8px;padding:6px 10px;font-size:12.5px;font-weight:700;color:#1a2236;box-shadow:0 8px 24px rgba(45,111,212,0.35);display:flex;align-items:center;gap:8px;white-space:nowrap;max-width:280px;overflow:hidden;';
    var _ic=(type==='folder')?'ti-folder':'ti-file-text';
    var _color=(type==='folder')?'#e8a83c':'#2d6fd4';
    var _lbl=(srcEl.textContent||'').trim().replace(/\s+/g,' ').slice(0,40);
    _wrap.innerHTML='<i class="ti '+_ic+'" style="font-size:16px;color:'+_color+';flex-shrink:0;"></i>'
      +'<span style="overflow:hidden;text-overflow:ellipsis;">'+String(_lbl).replace(/</g,'&lt;')+'</span>'
      +'<span style="font-size:9.5px;font-weight:800;color:#fff;background:#2d6fd4;border-radius:8px;padding:2px 7px;flex-shrink:0;">이동 중</span>';
    document.body.appendChild(_wrap);
    ev.dataTransfer.setDragImage(_wrap, 10, 10);
    // DOM 유지 필요(브라우저가 캡처할 시간) — 다음 프레임에 제거
    setTimeout(function(){ try{ _wrap.remove(); }catch(_){} }, 0);
  }catch(_){}
}
function e3DragOver(ev, targetFid){
  // 도킹 드래그 중이면 폴더/REQ 드롭 로직은 무시(도킹 프리뷰만 표시되도록)
  if(typeof _e3DragSrc!=='undefined' && _e3DragSrc!=null) return;
  ev.preventDefault(); ev.stopPropagation();
  try{ ev.dataTransfer.dropEffect='move'; }catch(e){}
  var _tb=document.getElementById('e3-req-body');
  if(_tb) _e3TryAutoScroll(_tb, ev.clientY);
  if(_drag && _drag.id===targetFid) return;
  var el=document.getElementById('e3-fd-'+targetFid);
  if(el){
    el.style.outline='3px solid #00875a';
    el.style.outlineOffset='-1px';
    el.style.background='rgba(0,135,90,0.15)';
    el.style.borderRadius='6px';
    el.style.boxShadow='0 0 0 3px rgba(0,135,90,0.18)';
  }
  // 드롭 프리뷰 자리표시자 — 타겟 폴더 바로 아래 반투명 라인으로 "여기 배치됨" 표시
  _e3ShowDropPreview(el, 'e3');
}
// 폴더 경로 계산 — "루트 › 부모 › 대상" 형태 breadcrumb 반환
function _e3FolderPath(fid){
  var _f=(reqFolders||[]).find(function(x){return x.id===fid;});
  var _parts=[]; var _guard=0;
  while(_f && _guard++<20){
    _parts.unshift(_f.name||'');
    _f=_f.parent?(reqFolders||[]).find(function(x){return x.id===_f.parent;}):null;
  }
  return _parts.filter(Boolean).join(' › ');
}
// 드롭 위치 툴팁 — 화면 상단에 fixed 로 "어느 하위로 들어감" 경로 표시. Rack 배치 프리뷰 스타일.
function _e3ShowDropPreview(anchor, ns){
  if(!anchor || !_drag || !_drag.id) return;
  var _fid=anchor.id.replace(/^e3b?-fd-/,'');
  var _path=_e3FolderPath(_fid);
  var _srcId=_drag.id;
  var _srcEl=document.getElementById((ns==='e3b'?'e3b-':'e3-')+(_drag.type==='folder'?'fd-':'rq-')+_srcId);
  var _srcLbl=_srcEl?(_srcEl.textContent||'').trim().replace(/\s+/g,' ').slice(0,40):'';
  var _typeIc=(_drag.type==='folder')?'ti-folder':'ti-file-text';
  var _typeColor=(_drag.type==='folder')?'#e8a83c':'#2d6fd4';
  var _tip=document.getElementById('e3-drop-path-tip');
  if(!_tip){
    _tip=document.createElement('div');
    _tip.id='e3-drop-path-tip';
    _tip.style.cssText='position:fixed;top:auto;bottom:24px;left:50%;transform:translateX(-50%);z-index:100000;background:#fff;border:2px solid #00a872;border-radius:10px;padding:9px 16px;font-size:12.5px;font-weight:700;color:#1a2236;box-shadow:0 8px 26px rgba(0,168,114,0.25);display:flex;align-items:center;gap:9px;max-width:min(720px,90vw);pointer-events:none;';
    document.body.appendChild(_tip);
  }
  var _esc=function(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');};
  _tip.innerHTML=''
    +'<i class="ti '+_typeIc+'" style="font-size:16px;color:'+_typeColor+';flex-shrink:0;"></i>'
    +'<span style="font-weight:800;color:#1a2236;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px;">'+_esc(_srcLbl)+'</span>'
    +'<i class="ti ti-arrow-right" style="font-size:15px;color:#00a872;flex-shrink:0;"></i>'
    +'<span style="font-size:11px;font-weight:800;color:#00875a;background:rgba(0,168,114,0.14);border-radius:6px;padding:3px 8px;letter-spacing:0.3px;">여기로 이동</span>'
    +'<i class="ti ti-folder-open" style="font-size:15px;color:#e8a83c;flex-shrink:0;"></i>'
    +'<span style="color:#475063;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;" title="'+_esc(_path)+'">'+_esc(_path)+'</span>';
}
function _e3HideDropPreview(){
  var _t=document.getElementById('e3-drop-path-tip'); if(_t) _t.remove();
}
function e3DragLeave(ev, targetFid){
  var el=document.getElementById('e3-fd-'+targetFid);
  if(el){ el.style.outline=''; el.style.outlineOffset=''; el.style.background=''; el.style.boxShadow=''; }
  _e3HideDropPreview();
}
async function e3Drop(ev, targetFid){
  // 도킹 드래그 중이면 폴더/REQ drop 무시 (도킹 drop 이 처리)
  if(typeof _e3DragSrc!=='undefined' && _e3DragSrc!=null) return;
  ev.preventDefault(); ev.stopPropagation();
  _e3AutoScrollStop();
  _e3HideDropPreview();   // 화면 하단 breadcrumb 툴팁 즉시 제거
  // outline 정리 + opacity 원복
  try{
    var t=document.getElementById('e3-fd-'+targetFid); if(t){ t.style.outline=''; t.style.outlineOffset=''; t.style.background=''; t.style.boxShadow=''; }
    if(_drag && _drag.id){
      var sel=(_drag.type==='folder')?document.getElementById('e3-fd-'+_drag.id):document.getElementById('e3-rq-'+_drag.id);
      if(sel){ sel.style.opacity=''; sel.style.background=''; sel.style.outline=''; sel.style.boxShadow=''; }
    }
  }catch(e){}
  if(!_drag || !_drag.id) return;
  var _srcType=_drag.type, _srcId=_drag.id;
  _drag={type:null, id:null};
  // 낙관적 즉시 갱신 — parent/order 만 먼저 바꾸고 재렌더로 UI 즉시 반영. REQ ID 재조정 등 무거운 작업은 백그라운드 진행.
  try{
    if(_srcType==='folder'){
      var f=reqFolders.find(function(x){return x.id===_srcId;});
      if(f && f.parent!==targetFid){
        // 순환 체크
        var p=targetFid, ok=true, guard=0;
        while(p && guard++<50){ if(p===_srcId){ ok=false; break; } var pf=reqFolders.find(function(x){return x.id===p;}); p=pf?pf.parent:null; }
        if(ok){
          f.parent=targetFid;
          f.order=reqFolders.filter(function(x){return x.parent===targetFid;}).length;
          if(typeof expExpanded!=='undefined' && expExpanded && expExpanded.add) expExpanded.add('f-'+targetFid);
        }
      }
    } else if(_srcType==='req'){
      var r=reqList.find(function(x){return x.id===_srcId;});
      if(r && r.folder!==targetFid){
        r.folder=targetFid;
        if(typeof expExpanded!=='undefined' && expExpanded && expExpanded.add) expExpanded.add('f-'+targetFid);
      }
    }
  }catch(_e){}
  // 즉시 재렌더 (사용자 눈에 곧바로 이동 결과 반영)
  try{ if(typeof renderExplorer3==='function') renderExplorer3(); }catch(_e){}
  try{ if(typeof renderExplorer==='function') renderExplorer(); }catch(_e){}
  // 서버 저장 — REQ ID 재생성 로직(expReassignIdsByFolder 안 옛 REQ 삭제) 이 tombstone 유발 + REQ 사라짐 버그의 원인.
  // 안전한 최소 저장: folder 값만 update. REQ/TC ID 는 그대로 유지(사용자가 명시적으로 rename 하기 전엔 안전).
  (async function(){
    try{
      if(_srcType==='folder'){
        if(typeof expMoveFolder==='function') await expMoveFolder(_srcId, targetFid);
        else if(typeof req2DropFolder==='function') await req2DropFolder(_srcId, targetFid);
      } else if(_srcType==='req'){
        var _r=reqList.find(function(x){return x.id===_srcId;});
        if(_r){
          if(_r.folder!==targetFid) _r.folder=targetFid;
          _r.updated_at=new Date().toISOString().slice(0,10);
          if(typeof saveOneREQ==='function') await saveOneREQ(_r);
        }
      }
      // 최종 재렌더
      try{ if(typeof renderExplorer3==='function') renderExplorer3(); }catch(_e){}
      try{ if(typeof renderExplorer==='function') renderExplorer(); }catch(_e){}
    }catch(e){ if(typeof showToast==='function') showToast('이동 처리 오류: '+(e&&e.message?e.message:e)); }
  })();
}
// 드래그 중 컨테이너 상/하단 근처로 커서가 오면 자동 스크롤 — 트리 밖으로 안 벗어나도 원하는 위치로 이동 가능
// zone: 위/아래 각 60px 영역, 속도는 커서가 가장자리에 가까울수록 최대 18px/tick
window._e3AutoScrollRAF=null;
function _e3AutoScrollTick(el, dir, speed){
  if(!el) return;
  if(dir<0 && el.scrollTop<=0) return;
  if(dir>0 && el.scrollTop+el.clientHeight>=el.scrollHeight) return;
  el.scrollTop += dir*speed;
  window._e3AutoScrollRAF=requestAnimationFrame(function(){ _e3AutoScrollTick(el, dir, speed); });
}
function _e3AutoScrollStop(){ if(window._e3AutoScrollRAF){ cancelAnimationFrame(window._e3AutoScrollRAF); window._e3AutoScrollRAF=null; } }
// 드래그 종료(성공·취소·ESC 등) 시 모든 시각 상태 원복 — opacity·outline·배경·boxShadow 정리
function _e3DragCleanupAll(){
  _e3AutoScrollStop();
  _e3HideDropPreview();
  // 드래그 중이던 소스 요소 시각 원복 (원본·Beta 양쪽 id 패턴)
  try{
    if(_drag && _drag.id){
      var _ids=['e3-fd-'+_drag.id,'e3-rq-'+_drag.id,'e3b-fd-'+_drag.id,'e3b-rq-'+_drag.id];
      _ids.forEach(function(x){
        var el=document.getElementById(x);
        if(el){ el.style.opacity=''; el.style.background=''; el.style.outline=''; el.style.outlineOffset=''; el.style.borderRadius=''; el.style.boxShadow=''; }
      });
    }
  }catch(_e){}
  // 컨테이너 강조 정리
  try{
    ['e3-req-body','e3b-req-body'].forEach(function(id){ var el=document.getElementById(id); if(el){ el.style.outline=''; el.style.outlineOffset=''; el.style.background=''; } });
  }catch(_e){}
  // 모든 폴더·REQ 요소 강조 정리 — 드롭 하이라이트가 남아있는 요소들
  try{
    document.querySelectorAll('[id^="e3-fd-"],[id^="e3b-fd-"],[id^="e3-rq-"],[id^="e3b-rq-"]').forEach(function(el){
      if(el.style){ el.style.outline=''; el.style.outlineOffset=''; el.style.background=''; el.style.boxShadow=''; el.style.opacity=''; }
    });
  }catch(_e){}
  _drag={type:null, id:null};
}
// 전역 리스너 — 한 번만 등록
// dragend 는 drop 이 완료된 뒤 실행되므로 capture 로 등록해도 실제 드롭 핸들러 방해 없음.
// drop 이벤트는 각 요소의 ondrop 핸들러가 이미 이동 로직을 수행하니 여기서 추가 정리는 불필요(중복 정리 시 _drag 가 미리 초기화돼서 이동 실패).
if(!window._e3AutoScrollListenerOn){
  document.addEventListener('dragend', _e3DragCleanupAll, true);
  window._e3AutoScrollListenerOn=true;
}
function _e3TryAutoScroll(el, clientY){
  if(!el) return;
  var r=el.getBoundingClientRect();
  var ZONE=60;   // 감지 영역 폭
  var _dTop=clientY - r.top;
  var _dBot=r.bottom - clientY;
  _e3AutoScrollStop();
  if(_dTop < ZONE){
    var _s=Math.max(3, Math.round((1 - _dTop/ZONE) * 18));
    window._e3AutoScrollRAF=requestAnimationFrame(function(){ _e3AutoScrollTick(el, -1, _s); });
  } else if(_dBot < ZONE){
    var _s2=Math.max(3, Math.round((1 - _dBot/ZONE) * 18));
    window._e3AutoScrollRAF=requestAnimationFrame(function(){ _e3AutoScrollTick(el, +1, _s2); });
  }
}

// 트리 컨테이너 빈 영역 드롭 — 폴더를 최상위(parent=null)로 이동
function e3RootDragOver(ev){
  // 도킹 드래그 중이면 폴더 루트 드롭 로직 스킵
  if(typeof _e3DragSrc!=='undefined' && _e3DragSrc!=null) return;
  var _tb=document.getElementById('e3-req-body');
  if(_drag && _drag.id && _tb) _e3TryAutoScroll(_tb, ev.clientY);
  if(!(_drag && _drag.type==='folder')) return;
  if(ev.target && ev.target.closest && ev.target.closest('[id^="e3-fd-"]')) return;
  ev.preventDefault(); try{ ev.dataTransfer.dropEffect='move'; }catch(e){}
  if(_tb){ _tb.style.outline='3px dashed #db2777'; _tb.style.outlineOffset='-4px'; _tb.style.background='rgba(219,39,119,0.08)'; }
  _e3ShowRootDropPreview('e3');
}
// 최상위 드롭 툴팁 — 폴더 breadcrumb 대신 "최상위(루트)" 표기
function _e3ShowRootDropPreview(ns){
  if(!_drag || !_drag.id) return;
  var _srcId=_drag.id;
  var _srcEl=document.getElementById((ns==='e3b'?'e3b-':'e3-')+(_drag.type==='folder'?'fd-':'rq-')+_srcId);
  var _srcLbl=_srcEl?(_srcEl.textContent||'').trim().replace(/\s+/g,' ').slice(0,40):'';
  var _tip=document.getElementById('e3-drop-path-tip');
  if(!_tip){
    _tip=document.createElement('div');
    _tip.id='e3-drop-path-tip';
    _tip.style.cssText='position:fixed;top:auto;bottom:24px;left:50%;transform:translateX(-50%);z-index:100000;background:#fff;border:2px solid #db2777;border-radius:10px;padding:9px 16px;font-size:12.5px;font-weight:700;color:#1a2236;box-shadow:0 8px 26px rgba(219,39,119,0.25);display:flex;align-items:center;gap:9px;max-width:min(720px,90vw);pointer-events:none;';
    document.body.appendChild(_tip);
  } else {
    _tip.style.borderColor='#db2777';
    _tip.style.boxShadow='0 8px 26px rgba(219,39,119,0.25)';
  }
  var _esc=function(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');};
  _tip.innerHTML=''
    +'<i class="ti ti-folder" style="font-size:16px;color:#e8a83c;flex-shrink:0;"></i>'
    +'<span style="font-weight:800;color:#1a2236;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px;">'+_esc(_srcLbl)+'</span>'
    +'<i class="ti ti-arrow-right" style="font-size:15px;color:#db2777;flex-shrink:0;"></i>'
    +'<span style="font-size:11px;font-weight:800;color:#fff;background:#db2777;border-radius:6px;padding:3px 8px;letter-spacing:0.3px;">최상위(루트)로 이동</span>';
}
function e3RootDragLeave(ev){
  var el=document.getElementById('e3-req-body'); if(!el) return;
  // 자식 요소 사이 이동 이벤트는 무시 — 실제 컨테이너 밖으로 나갔을 때만 정리
  if(ev.relatedTarget && el.contains(ev.relatedTarget)) return;
  el.style.outline=''; el.style.outlineOffset=''; el.style.background='';
  _e3AutoScrollStop();
}
async function e3DropOnRoot(ev){
  // 도킹 드래그 중이면 폴더 루트 drop 스킵
  if(typeof _e3DragSrc!=='undefined' && _e3DragSrc!=null) return;
  _e3AutoScrollStop();
  _e3HideDropPreview();
  // 폴더 요소 위에 드롭한 경우엔 개별 폴더 drop 이 처리하므로 스킵
  if(ev.target && ev.target.closest && ev.target.closest('[id^="e3-fd-"]')) return;
  ev.preventDefault(); ev.stopPropagation();
  var _el=document.getElementById('e3-req-body'); if(_el){ _el.style.outline=''; _el.style.outlineOffset=''; _el.style.background=''; }
  if(_drag && _drag.id){
    var _srcEl=(_drag.type==='folder')?document.getElementById('e3-fd-'+_drag.id):document.getElementById('e3-rq-'+_drag.id);
    if(_srcEl){ _srcEl.style.opacity=''; _srcEl.style.background=''; _srcEl.style.outline=''; _srcEl.style.boxShadow=''; }
  }
  if(!(_drag && _drag.type==='folder' && _drag.id)) return;
  var _srcId=_drag.id; _drag={type:null, id:null};
  var f=(reqFolders||[]).find(function(x){return x.id===_srcId;});
  if(!f || f.parent===null){ try{ if(typeof renderExplorer3==='function') renderExplorer3(); }catch(_e){} return; }
  // 낙관적 즉시 반영
  f.parent=null;
  try{ if(typeof renderExplorer3==='function') renderExplorer3(); }catch(_e){}
  try{ if(typeof renderExplorer==='function') renderExplorer(); }catch(_e){}
  // 백그라운드 저장·재조정
  (async function(){
    try{
      if(typeof expMoveFolder==='function') await expMoveFolder(_srcId, null);
      else if(typeof expSaveFolders==='function') await expSaveFolders();
      if(typeof showToast==='function') showToast('최상위로 이동했습니다');
      try{ if(typeof renderExplorer3==='function') renderExplorer3(); }catch(_e){}
    }catch(e){ if(typeof showToast==='function') showToast('이동 실패: '+(e&&e.message||e)); }
  })();
}
// ── e3b (Requirements & Test Coverage Beta) 트리 드래그 이동 ─────────
// 원본 e3Drag* 와 동일한 _drag 상태 공유 + Beta 렌더 재실행만 다름.
function e3bDragStart(ev, type, id){
  try{ _drag={type:type, id:id}; ev.dataTransfer.effectAllowed='move'; ev.dataTransfer.setData('text/plain', id);
    var el=(type==='folder')?document.getElementById('e3b-fd-'+id):document.getElementById('e3b-rq-'+id);
    if(el) _e3CustomDragImage(ev, el, type);
    setTimeout(function(){
      if(el){
        el.style.opacity='0.35';
        el.style.background='repeating-linear-gradient(45deg,rgba(45,111,212,0.08),rgba(45,111,212,0.08) 6px,rgba(45,111,212,0.16) 6px,rgba(45,111,212,0.16) 12px)';
        el.style.outline='2px dashed #2d6fd4';
        el.style.outlineOffset='-2px';
        el.style.borderRadius='6px';
      }
    },0);
  }catch(e){}
}
function e3bDragOver(ev, targetFid){
  ev.preventDefault(); ev.stopPropagation();
  try{ ev.dataTransfer.dropEffect='move'; }catch(e){}
  var _tb=document.getElementById('e3b-req-body');
  if(_tb) _e3TryAutoScroll(_tb, ev.clientY);
  if(_drag && _drag.id===targetFid) return;
  var el=document.getElementById('e3b-fd-'+targetFid);
  if(el){
    el.style.outline='3px solid #00875a';
    el.style.outlineOffset='-1px';
    el.style.background='rgba(0,135,90,0.15)';
    el.style.borderRadius='6px';
    el.style.boxShadow='0 0 0 3px rgba(0,135,90,0.18)';
  }
  _e3ShowDropPreview(el, 'e3b');
}
function e3bDragLeave(ev, targetFid){
  var el=document.getElementById('e3b-fd-'+targetFid);
  if(el){ el.style.outline=''; el.style.outlineOffset=''; el.style.background=''; el.style.boxShadow=''; }
  _e3HideDropPreview();
}
async function e3bDrop(ev, targetFid){
  ev.preventDefault(); ev.stopPropagation();
  _e3AutoScrollStop();
  _e3HideDropPreview();
  try{
    var t=document.getElementById('e3b-fd-'+targetFid); if(t){ t.style.outline=''; t.style.outlineOffset=''; t.style.background=''; t.style.boxShadow=''; }
    if(_drag && _drag.id){
      var sel=(_drag.type==='folder')?document.getElementById('e3b-fd-'+_drag.id):document.getElementById('e3b-rq-'+_drag.id);
      if(sel){ sel.style.opacity=''; sel.style.background=''; sel.style.outline=''; sel.style.boxShadow=''; }
    }
  }catch(e){}
  if(!_drag || !_drag.id) return;
  try{
    if(_drag.type==='folder'){
      if(typeof expMoveFolder==='function') await expMoveFolder(_drag.id, targetFid);
      else if(typeof req2DropFolder==='function') await req2DropFolder(_drag.id, targetFid);
    } else if(_drag.type==='req'){
      if(typeof expMoveREQToFolder==='function') await expMoveREQToFolder(_drag.id, targetFid);
      else if(typeof req2DropREQ==='function') await req2DropREQ(_drag.id, targetFid);
    } else if(_drag.type==='tc'){
      if(typeof expMoveTCToFolder==='function') await expMoveTCToFolder(_drag.id, targetFid);
    }
  }catch(e){ if(typeof showToast==='function') showToast('이동 실패: '+(e&&e.message?e.message:e)); }
  _drag={type:null, id:null};
  if(typeof renderExplorer3Beta==='function') renderExplorer3Beta();
  if(typeof renderExplorer3==='function') renderExplorer3();   // 원본도 열려있을 수 있으니 함께 갱신
}
// Beta 트리 빈 영역 드롭 — 폴더 최상위로 이동
function e3bRootDragOver(ev){
  var _tb=document.getElementById('e3b-req-body');
  if(_drag && _drag.id && _tb) _e3TryAutoScroll(_tb, ev.clientY);
  if(!(_drag && _drag.type==='folder')) return;
  if(ev.target && ev.target.closest && ev.target.closest('[id^="e3b-fd-"]')) return;
  ev.preventDefault(); try{ ev.dataTransfer.dropEffect='move'; }catch(e){}
  if(_tb){ _tb.style.outline='3px dashed #db2777'; _tb.style.outlineOffset='-4px'; _tb.style.background='rgba(219,39,119,0.08)'; }
  _e3ShowRootDropPreview('e3b');
}
function e3bRootDragLeave(ev){
  var el=document.getElementById('e3b-req-body'); if(!el) return;
  if(ev.relatedTarget && el.contains(ev.relatedTarget)) return;
  el.style.outline=''; el.style.outlineOffset=''; el.style.background='';
  _e3AutoScrollStop();
}
async function e3bDropOnRoot(ev){
  _e3AutoScrollStop();
  _e3HideDropPreview();
  if(ev.target && ev.target.closest && ev.target.closest('[id^="e3b-fd-"]')) return;
  ev.preventDefault(); ev.stopPropagation();
  if(_drag && _drag.id){
    var _srcEl=(_drag.type==='folder')?document.getElementById('e3b-fd-'+_drag.id):document.getElementById('e3b-rq-'+_drag.id);
    if(_srcEl){ _srcEl.style.opacity=''; _srcEl.style.background=''; _srcEl.style.outline=''; _srcEl.style.boxShadow=''; }
  }
  var _el=document.getElementById('e3b-req-body'); if(_el){ _el.style.outline=''; _el.style.outlineOffset=''; _el.style.background=''; }
  if(!(_drag && _drag.type==='folder' && _drag.id)) return;
  var f=(reqFolders||[]).find(function(x){return x.id===_drag.id;});
  if(f && f.parent!==null){
    try{
      if(typeof expMoveFolder==='function') await expMoveFolder(_drag.id, null);
      else { f.parent=null; if(typeof expSaveFolders==='function') await expSaveFolders(); }
      if(typeof showToast==='function') showToast('최상위로 이동했습니다');
    }catch(e){ if(typeof showToast==='function') showToast('이동 실패: '+(e&&e.message||e)); }
  }
  _drag={type:null, id:null};
  if(typeof renderExplorer3Beta==='function') renderExplorer3Beta();
  if(typeof renderExplorer3==='function') renderExplorer3();
}
// 폴더 순서 조정 (Ctrl+↑/↓) — 형제 폴더 사이에서만 이동. 최상단·최하단에서는 무시.
async function e3MoveFolderOrder(fid, dir){
  var f=reqFolders.find(function(x){return x.id===fid;}); if(!f) return;
  var siblings=reqFolders.filter(function(x){return (x.parent||null)===(f.parent||null);}).sort(function(a,b){return (a.order||0)-(b.order||0);});
  var idx=siblings.indexOf(f); if(idx<0) return;
  var to=idx+(dir>0?1:-1);
  if(to<0||to>=siblings.length) return;   // 경계
  siblings.splice(idx,1);
  siblings.splice(to,0,f);
  siblings.forEach(function(x,i){ x.order=i; });
  try{ if(typeof expSaveFolders==='function') await expSaveFolders(); }catch(e){}
  if(typeof renderExplorer3==='function') renderExplorer3();
  else { var rb=document.getElementById('e3-req-body'); if(rb) rb.innerHTML=e3TreeHtml(); }
  if(typeof showToast==='function') showToast('폴더 순서 '+(dir>0?'아래로':'위로')+' 이동');
}

// Ctrl+↑/↓ 리스너 — Requirements & Test Coverage 페이지, 선택된 폴더 있을 때만
// capture 단계 등록 + stopImmediatePropagation 로 다른 방향키 핸들러(REQ/TC 이동·스텝 이동)와의 이중 발동을 확실히 차단.
document.addEventListener('keydown', function(ev){
  if(!ev.ctrlKey && !ev.metaKey) return;
  if(ev.key!=='ArrowUp' && ev.key!=='ArrowDown') return;
  // 활성 페이지가 explorer3 또는 explorer3-beta 일 때만
  var p1=document.getElementById('page-explorer3'), p2=document.getElementById('page-explorer3-beta');
  var onPage=(p1&&p1.classList.contains('active')) || (p2&&p2.classList.contains('active'));
  if(!onPage) return;
  // 입력창에서 커서 이동 방해 방지
  var ae=document.activeElement;
  if(ae && (ae.tagName==='INPUT'||ae.tagName==='TEXTAREA'||ae.isContentEditable)) return;
  var fid=(typeof e3SelFolder!=='undefined'&&e3SelFolder) ? e3SelFolder
        : (typeof e3bSelFolder!=='undefined'&&e3bSelFolder) ? e3bSelFolder : null;
  if(!fid) return;
  ev.preventDefault();
  ev.stopPropagation();
  if(ev.stopImmediatePropagation) ev.stopImmediatePropagation();
  e3MoveFolderOrder(fid, ev.key==='ArrowDown'?+1:-1);
}, true);   // capture 단계에서 먼저 잡아 REQ/TC/스텝 이동 리스너 실행 자체를 막음

// 폴더/REQ 사이 드롭존 — 여기 놓으면 순서 이동(형제 사이 삽입) 됨.
// beforeKind: 'folder' 또는 'req', beforeId: 삽입할 앞 대상 id, depth: 들여쓰기(px)
function _e3DropZone(beforeKind, beforeId, depth){
  var pl=(8+(depth||0)*14);
  return '<div class="e3-dropzone" data-before-kind="'+beforeKind+'" data-before-id="'+beforeId+'" '
    +'ondragover="_e3ZoneDragOver(event,this)" '
    +'ondragleave="_e3ZoneDragLeave(event,this)" '
    +'ondrop="_e3ZoneDrop(event,this)" '
    +'style="height:4px;margin:0 6px 0 '+pl+'px;border-radius:2px;background:transparent;transition:all 0.1s ease;pointer-events:auto;"></div>';
}
// dropzone dragover — 파란 라인으로 강조
// 규칙: 폴더 드래그 중엔 폴더 앞 dropzone(beforeKind='folder')만 반응. REQ 앞은 무시.
//       REQ 드래그는 폴더 앞 dropzone 은 무시(폴더 위 드롭으로 이동), REQ 앞은 같은 폴더 내에서만 반응.
function _e3ZoneDragOver(ev, el){
  if(!(_drag && _drag.id) || (typeof _e3DragSrc!=='undefined' && _e3DragSrc!=null)) return;
  var beforeKind=el.getAttribute('data-before-kind');
  var beforeId=el.getAttribute('data-before-id');
  // 폴더는 REQ 사이(인라인)로 들어갈 수 없음 → REQ 앞 dropzone 은 스킵
  if(_drag.type==='folder' && beforeKind==='req') return;
  // REQ 는 REQ 앞 dropzone 만 유효, 폴더 앞은 스킵. 그리고 같은 폴더 내에서만 강조.
  if(_drag.type==='req'){
    if(beforeKind!=='req') return;
    var beforeReq=reqList.find(function(x){return x.id===beforeId;});
    var dr=reqList.find(function(x){return x.id===_drag.id;});
    if(!beforeReq || !dr || dr.folder!==beforeReq.folder) return;   // 다른 폴더면 미반응
  }
  ev.preventDefault(); ev.stopPropagation();
  try{ ev.dataTransfer.dropEffect='move'; }catch(e){}
  el.style.height='10px';
  el.style.background='var(--blue)';
  el.style.boxShadow='0 0 0 2px rgba(45,111,212,0.25)';
}
function _e3ZoneDragLeave(ev, el){
  el.style.height='4px';
  el.style.background='transparent';
  el.style.boxShadow='';
}
async function _e3ZoneDrop(ev, el){
  ev.preventDefault(); ev.stopPropagation();
  el.style.height='4px'; el.style.background='transparent'; el.style.boxShadow='';
  if(!(_drag && _drag.id)) return;
  var beforeKind=el.getAttribute('data-before-kind');
  var beforeId=el.getAttribute('data-before-id');
  var srcType=_drag.type, srcId=_drag.id;
  _drag={type:null,id:null};
  try{
    if(beforeKind==='folder'){
      var before=reqFolders.find(function(x){return x.id===beforeId;}); if(!before) return;
      var newParent=before.parent;
      if(srcType==='folder'){
        // 순환 방지
        var p=newParent, guard=0; while(p&&guard++<50){ if(p===srcId){ if(typeof showToast==='function')showToast('자기 하위로는 이동할 수 없습니다'); return; } var pf=reqFolders.find(function(x){return x.id===p;}); p=pf?pf.parent:null; }
        var dragged=reqFolders.find(function(x){return x.id===srcId;}); if(!dragged) return;
        dragged.parent=newParent;
        var siblings=reqFolders.filter(function(f){return f.parent===newParent&&f.id!==srcId;}).sort(function(a,b){return (a.order||0)-(b.order||0);});
        var result=[]; siblings.forEach(function(s){ if(s.id===beforeId) result.push(dragged); result.push(s); }); if(result.indexOf(dragged)<0) result.push(dragged);
        result.forEach(function(f,i){ f.order=i; });
        if(typeof expSaveFolders==='function') await expSaveFolders();
        if(typeof showToast==='function') showToast('폴더 순서 변경');
      } else if(srcType==='req'){
        // REQ 를 폴더 사이에 드롭 → 그 폴더의 부모 폴더로 이동 (형제 위치 배치는 다른 REQ 없이 애매하므로 스킵)
        var r=reqList.find(function(x){return x.id===srcId;}); if(r) r.folder=newParent;
        if(r && typeof saveOneREQ==='function') await saveOneREQ(r);
      }
    } else if(beforeKind==='req'){
      var beforeReq=reqList.find(function(x){return x.id===beforeId;}); if(!beforeReq) return;
      if(srcType==='req'){
        var dr=reqList.find(function(x){return x.id===srcId;}); if(!dr||dr.id===beforeId) return;
        // REQ 순서 이동은 같은 폴더 내에서만 허용 — 다른 폴더로 이동은 폴더 위 드롭으로 사용
        if(dr.folder!==beforeReq.folder){
          if(typeof showToast==='function') showToast('REQ 순서 이동은 같은 폴더 안에서만 가능합니다');
          return;
        }
        var siblings2=reqList.filter(function(x){return x.folder===beforeReq.folder&&x.id!==srcId;}).sort(function(a,b){return (a.order||0)-(b.order||0);});
        var result2=[]; siblings2.forEach(function(s){ if(s.id===beforeId) result2.push(dr); result2.push(s); }); if(result2.indexOf(dr)<0) result2.push(dr);
        result2.forEach(function(x,i){ x.order=i; });
        try{ if(typeof renderExplorer3==='function') renderExplorer3(); }catch(_re){}
        try{ if(typeof renderExplorer==='function') renderExplorer(); }catch(_re){}
        (async function(){
          try{
            if(typeof saveOneREQ==='function') await saveOneREQ(dr);
          }catch(_e){}
        })();
        if(typeof showToast==='function') showToast('REQ 순서 변경');
      } else if(srcType==='folder'){
        // 폴더를 REQ 앞에 드롭 → 그 REQ 가 속한 폴더의 부모 폴더로 이동
        var f=reqFolders.find(function(x){return x.id===srcId;}); if(!f) return;
        var parentFolder=reqFolders.find(function(x){return x.id===beforeReq.folder;});
        f.parent=parentFolder?parentFolder.parent:null;
        if(typeof expSaveFolders==='function') await expSaveFolders();
      }
    }
  }catch(_e){}
  try{ if(typeof renderExplorer3==='function') renderExplorer3(); }catch(_e){}
  try{ if(typeof renderExplorer==='function') renderExplorer(); }catch(_e){}
}
function e3TreeHtml(){
  if(e3Closed===null) e3Closed=new Set();
  e3FlatReqOrder=[];
  var roots=reqFolders.filter(function(f){return !f.parent;}).sort(function(a,b){return (a.order||0)-(b.order||0);});
  var h='';
  // pathLast: 각 depth 에서 "이 노드가 그 depth 의 마지막 자식인지" boolean 배열 → expGuides(pathLast) 로 세로 가이드 선 렌더.
  function folder(f, depth, pathLast){
    if(!e3FolderVisible(f)) return;
    var open=e3Search ? true : !e3Closed.has(f.id);
    var subs=reqFolders.filter(function(x){return x.parent===f.id;}).sort(function(a,b){return (a.order||0)-(b.order||0);});
    var rqs=e3SortReqs(reqList.filter(function(r){return r.folder===f.id;}).filter(e3ReqMatch));
    var hasChildren=subs.length||rqs.length;
    // 하위 합산 배지
    var aggIds=e3DescIds(f.id);
    var aggReqs=reqList.filter(function(r){return aggIds.indexOf(r.folder)>=0;});
    var reqCnt=aggReqs.length;
    var tcCnt=aggReqs.reduce(function(s,rr){return s+e3ReqTcs(rr).length;},0);
    var fsel=e3SelFolder===f.id;
    var fbg=fsel?'rgba(232,168,60,0.13)':'';
    // 트리 세로 가이드 선 — 사이클 트리와 동일 방식(expGuides). depth 만큼 세로선 + 마지막 자식은 짧은 세로선.
    var guides=(typeof expGuides==='function')?expGuides(pathLast||[]):'';
    var _lpad=guides?'':'padding-left:'+(8+depth*14)+'px;';   // 가이드 있을 땐 padding 대신 가이드 span 이 들여쓰기 담당
    // 이 폴더 앞 드롭존 — 여기 놓으면 이 폴더 앞으로 순서 이동
    h+=_e3DropZone('folder', f.id, depth);
    h+='<div class="rc-folder" id="e3-fd-'+f.id+'" draggable="true" ondragstart="e3DragStart(event,\'folder\',\''+f.id+'\')" ondragover="e3DragOver(event,\''+f.id+'\')" ondragleave="e3DragLeave(event,\''+f.id+'\')" ondrop="e3Drop(event,\''+f.id+'\')" oncontextmenu="e3ShowCtx(event,\''+f.id+'\',\'folder\')" title="드래그로 이동 · 우클릭으로 메뉴" style="display:flex;align-items:center;gap:6px;padding:0 8px;min-height:26px;'+_lpad+'cursor:grab;font-size:'+e3FS('folder')+';font-weight:'+e3FW('folder')+';color:'+e3Accent.folder+';border-radius:6px;user-select:none;background:'+fbg+';'+e3FFStyle('folder')+'" onmouseenter="this.style.background=\''+(fsel?'rgba(232,168,60,0.18)':'rgba(0,0,0,0.03)')+'\'" onmouseleave="this.style.background=\''+fbg+'\'">'
      +guides
      +(hasChildren?'<i class="ti ti-chevron-right" onclick="event.stopPropagation();e3ToggleFolder(\''+f.id+'\')" style="font-size:18px;flex-shrink:0;color:var(--text3);transition:transform 0.15s;cursor:pointer;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;border-radius:5px;'+(open?'transform:rotate(90deg)':'')+'"></i>':'<span style="width:22px;flex-shrink:0;"></span>')
      +(function(){ var _fi=e3IconGet('folder'); var _openIc=(_fi.ic==='ti-folder')?(_fi.ic+(open?'-open':'')):_fi.ic; return '<i class="ti '+_openIc+'" style="font-size:'+_fi.size+'px;color:'+_fi.color+';flex-shrink:0;"></i>'; })()
      +'<span onclick="e3PickFolder(\''+f.id+'\')" style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;">'+_bdEsc(f.name)+'</span>'
      +'<span style="display:flex;gap:4px;flex-shrink:0;align-items:center;">'
        +(reqCnt?'<span style="font-size:10px;font-weight:700;color:#c98a1e;background:rgba(232,168,60,0.16);border-radius:8px;padding:1px 7px;">REQ '+reqCnt+'</span>':'')
        +(tcCnt?'<span style="font-size:10px;font-weight:700;color:var(--blue);background:rgba(45,111,212,0.1);border-radius:8px;padding:1px 7px;">TC '+tcCnt+'</span>':'')
      +'</span>'
      +'</div>';
    if(open){
      // 자식 목록의 마지막 인덱스 계산 — 폴더+REQ 를 합친 "이 depth 의 자식 순서" 상에서 마지막이 누구인지
      var childTotal=subs.length+rqs.length;
      subs.forEach(function(s, i){
        folder(s, depth+1, (pathLast||[]).concat(i===childTotal-1));
      });
      rqs.forEach(function(r, i){
        e3FlatReqOrder.push(r.id);
        var tcs=e3ReqTcs(r);
        var sel=e3SelReq===r.id;
        var msel=e3SelReqs.has(r.id);
        var bg=msel?'rgba(45,111,212,0.16)':(sel?'rgba(45,111,212,0.12)':'');
        var childIdx=subs.length+i;
        var rGuides=(typeof expGuides==='function')?expGuides((pathLast||[]).concat(childIdx===childTotal-1)):'';
        var _rpad=rGuides?'':'padding-left:'+(8+(depth+1)*14)+'px;';
        // 이 REQ 앞 드롭존 — 여기 놓으면 이 REQ 앞으로 순서 이동
        h+=_e3DropZone('req', r.id, depth+1);
        h+='<div id="e3-rq-'+r.id+'" draggable="true" ondragstart="e3DragStart(event,\'req\',\''+r.id+'\')" onclick="e3RowClickReq(event,\''+r.id+'\')" oncontextmenu="e3ShowCtx(event,\''+r.id+'\',\'req\')" title="'+_bdEsc((r.reqid||'')+' '+(r.title||''))+' · 드래그하여 폴더로 이동" style="display:flex;align-items:center;gap:6px;padding:0 8px;min-height:24px;'+_rpad+'cursor:grab;font-size:12.5px;border-radius:6px;background:'+bg+';user-select:none;'+(msel?'box-shadow:inset 2px 0 0 var(--blue);':'')+'" onmouseenter="this.style.background=\''+(bg||'rgba(0,0,0,0.03)')+'\'" onmouseleave="this.style.background=\''+bg+'\'">'
          +rGuides
          +'<span style="width:12px;flex-shrink:0;"></span>'
          +(function(){ var _ri=e3IconGet('req'); return '<i class="ti '+_ri.ic+'" style="font-size:'+_ri.size+'px;color:'+_ri.color+';flex-shrink:0;"></i>'; })()
          +'<span style="flex:1;display:flex;align-items:baseline;gap:6px;min-width:0;overflow:hidden;">'
            +(e3ShowReqId?'<span class="rc-reqid" style="font-size:'+e3FS('reqid')+';font-weight:'+e3FW('reqid')+';color:'+e3Accent.reqid+';white-space:nowrap;flex-shrink:0;'+e3FFStyle('reqid')+'">'+_bdEsc(e3DispId(r.reqid||''))+'</span>':'')
            +'<span class="rc-reqtitle" style="font-size:'+e3FS('reqtitle')+';font-weight:'+e3FW('reqtitle')+';color:'+e3Accent.reqtitle+';opacity:'+(tcs.length?'1':'0.45')+';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'+e3FFStyle('reqtitle')+'" title="'+_bdEsc(e3DispId(r.reqid||''))+' '+_bdEsc(r.title||'')+'">'+_bdEsc(r.title||'')+'</span>'
          +'</span>'
          +'<span style="font-size:10px;font-weight:700;color:'+(tcs.length?'var(--blue)':'#aab0bd')+';background:'+(tcs.length?'rgba(45,111,212,0.1)':'#eef0f3')+';border-radius:8px;padding:1px 7px;flex-shrink:0;">TC '+tcs.length+'</span>'
          +'</div>';
      });
    }
  }
  // 최상위 폴더에는 가이드 선 그리지 않음 (pathLast=[]) — 하위 자식부터 가이드가 그려짐
  roots.forEach(function(r){ folder(r, 0, []); });
  return h || '<div style="padding:24px;text-align:center;color:var(--text3);font-size:12px;">REQ가 없습니다</div>';
}
// REQ 행 클릭: Ctrl/Shift면 다중선택, 아니면 단일 선택
function e3RowClickReq(ev, rid){
  if(ev) ev.stopPropagation();
  if(ev&&ev.shiftKey){
    // Shift: 앵커~현재 범위 선택 (앵커 없으면 현재를 앵커로)
    ev.preventDefault();
    if(!e3SelAnchorReq){ e3SelAnchorReq=rid; e3SelReqs.add(rid); e3RebuildReqBody(); return; }
    var a=e3FlatReqOrder.indexOf(e3SelAnchorReq), b=e3FlatReqOrder.indexOf(rid);
    if(a>=0&&b>=0){ e3SelReqs.clear(); var lo=Math.min(a,b),hi=Math.max(a,b); for(var i=lo;i<=hi;i++)e3SelReqs.add(e3FlatReqOrder[i]); e3RebuildReqBody(); } return;
  }
  if(ev&&(ev.ctrlKey||ev.metaKey)){
    // Ctrl: 개별 토글 (앵커 갱신)
    ev.preventDefault();
    var on=!e3SelReqs.has(rid); if(on)e3SelReqs.add(rid); else e3SelReqs.delete(rid);
    e3SelAnchorReq=rid; e3RebuildReqBody(); return;
  }
  // 일반 클릭: 단일 선택 + 앵커 갱신
  _e3SetFocus(1); e3ClearSel(); e3SelAnchorReq=rid; e3PickReq(rid);
}
// TC 행 클릭: Ctrl/Shift면 다중선택, 아니면 단일 선택
function e3RowClickTc(ev, tcid){
  if(ev) ev.stopPropagation();
  if(ev&&ev.shiftKey){
    ev.preventDefault();
    if(!e3SelAnchorTc){ e3SelAnchorTc=tcid; e3SelTcs.add(tcid); e3RebuildTcBody(); e3RenderPane(); return; }
    var a=e3FlatTcOrder.indexOf(e3SelAnchorTc), b=e3FlatTcOrder.indexOf(tcid);
    if(a>=0&&b>=0){ e3SelTcs.clear(); var lo=Math.min(a,b),hi=Math.max(a,b); for(var i=lo;i<=hi;i++)e3SelTcs.add(e3FlatTcOrder[i]); e3RebuildTcBody(); e3RenderPane(); } return;
  }
  if(ev&&(ev.ctrlKey||ev.metaKey)){
    ev.preventDefault();
    var on=!e3SelTcs.has(tcid); if(on)e3SelTcs.add(tcid); else e3SelTcs.delete(tcid);
    e3SelAnchorTc=tcid;
    if(e3SelTcs.size===1){ e3SelTc=Array.from(e3SelTcs)[0]; } else if(!e3SelTcs.size){ e3SelTc=null; }
    e3RebuildTcBody(); e3RenderPane(); return;
  }
  _e3SetFocus(2); e3ClearSel(); e3SelAnchorTc=tcid; e3PickTc(tcid);
}
// ── 페이지네이션 상태 (원본 Coverage 표) ─────────────────────────────
var e3TcPage=1;
var e3TcPageSize=(function(){ try{ var s=localStorage.getItem('utop_e3orig_tc_pagesize'); var n=parseInt(s); if(n>0) return n; }catch(e){} return 100; })();
var e3TcPagerCache='';
function e3TcPageGo(p){ e3TcPage=p; var tb=document.getElementById('e3-tc-body'); if(tb) tb.innerHTML=e3TcListHtml(); var pg=document.getElementById('e3-tc-pager'); if(pg) pg.innerHTML=e3TcPagerCache; }
function e3TcPageSizeSet(v){ var n=parseInt(v)||100; e3TcPageSize=n; e3TcPage=1; try{ localStorage.setItem('utop_e3orig_tc_pagesize',String(n)); }catch(e){} var tb=document.getElementById('e3-tc-body'); if(tb) tb.innerHTML=e3TcListHtml(); var pg=document.getElementById('e3-tc-pager'); if(pg) pg.innerHTML=e3TcPagerCache; }
function _e3TcPagerHtml(total,pageCount){
  var sizeOpts=[20,40,80,100,200];
  var start=total?((e3TcPage-1)*e3TcPageSize+1):0;
  var end=Math.min(total,e3TcPage*e3TcPageSize);
  var sizeSel='<select onchange="e3TcPageSizeSet(this.value)" style="font-size:11.5px;padding:3px 6px;border:1px solid var(--border);border-radius:6px;background:#fff;outline:none;cursor:pointer;">'+sizeOpts.map(function(n){ return '<option value="'+n+'"'+(n===e3TcPageSize?' selected':'')+'>'+n+'</option>'; }).join('')+'</select>';
  var btn=function(label,page,disabled,active){ return '<button '+(disabled?'disabled':'onclick="e3TcPageGo('+page+')"')+' style="min-width:26px;height:26px;padding:0 6px;border-radius:6px;border:1px solid '+(active?'var(--blue)':'var(--border)')+';background:'+(active?'var(--blue)':'#fff')+';color:'+(active?'#fff':disabled?'#c7ccd6':'var(--text2)')+';font-size:11.5px;font-weight:700;cursor:'+(disabled?'default':'pointer')+';">'+label+'</button>'; };
  var pages='';
  var winStart=Math.max(1,e3TcPage-2), winEnd=Math.min(pageCount,winStart+4); winStart=Math.max(1,winEnd-4);
  if(winStart>1){ pages+=btn('1',1,false,e3TcPage===1); if(winStart>2) pages+='<span style="color:var(--text3);padding:0 2px;">…</span>'; }
  for(var p=winStart;p<=winEnd;p++){ pages+=btn(String(p),p,false,p===e3TcPage); }
  if(winEnd<pageCount){ if(winEnd<pageCount-1) pages+='<span style="color:var(--text3);padding:0 2px;">…</span>'; pages+=btn(String(pageCount),pageCount,false,e3TcPage===pageCount); }
  return '<div style="display:flex;align-items:center;gap:6px;padding:6px 11px;border-top:1px solid var(--border);background:#fafbfc;flex-wrap:wrap;">'
    // 왼쪽: Rows 드롭
    +'<span style="font-size:11.5px;color:var(--text3);white-space:nowrap;">Rows:</span>'+sizeSel
    +'<div style="flex:1;"></div>'
    // 가운데: 페이지 번호 + 이전/다음
    +btn('<i class="ti ti-chevron-left" style="font-size:13px;"></i>',e3TcPage-1,e3TcPage<=1,false)
    +pages
    +btn('<i class="ti ti-chevron-right" style="font-size:13px;"></i>',e3TcPage+1,e3TcPage>=pageCount,false)
    +'<div style="flex:1;"></div>'
    // 오른쪽: 현재 표시 범위 / 전체
    +'<span style="font-size:11.5px;color:var(--text3);white-space:nowrap;">'+start+'-'+end+' / '+total+'</span>'
    +'</div>';
}
function e3TcListHtml(){
  var tcs;
  if(e3SelFolder){
    // 폴더 선택: 하위 전체 REQ의 TC 합산 표시
    var allFids=e3DescIds(e3SelFolder);
    var allReqs=reqList.filter(function(r){return allFids.indexOf(r.folder)>=0;});
    tcs=e3SortTcs(allReqs.reduce(function(arr,r){return arr.concat(e3ReqTcs(r));},[]));
    if(!tcs.length){ e3TcPagerCache=''; return '<div style="padding:34px 14px;text-align:center;color:var(--text3);font-size:12px;"><i class="ti ti-clipboard-off" style="font-size:28px;opacity:.3;display:block;margin-bottom:8px;"></i>이 폴더에는 TC가 없습니다</div>'; }
  } else {
    var rq=reqList.find(function(x){return x.id===e3SelReq;});
    if(!rq){
      // 아무것도 선택 안 됐을 때: 전체 폴더/REQ 통계 배지 표시
      var _tf=reqFolders.length, _tr=(reqList||[]).length;
      var _lguF=0,_ktF=0; (reqList||[]).forEach(function(r){var c=e3TcCarrier(r.reqid||r.id);if(c==='lgu')_lguF++;else if(c==='kt')_ktF++;});
      var _badge=function(ic,label,val,col,bg){ return '<span style="display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:800;color:'+col+';background:'+bg+';border-radius:8px;padding:2px 9px;white-space:nowrap;"><i class="ti '+ic+'" style="font-size:12px;"></i>'+label+' <span style="font-size:11px;">'+val+'</span></span>'; };
      return '<div style="padding:24px 14px;display:flex;flex-direction:column;align-items:center;gap:12px;">'
        +'<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;">'
        +_badge('ti-folder','폴더',_tf,'#e8a83c','rgba(232,168,60,0.13)')
        +_badge('ti-clipboard-text','REQ',_tr,'#7c3aed','rgba(124,58,237,0.10)')
        +'</div>'
        +'<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;">'
        +_badge('ti-sum','Total',_tr,'#475063','#eef1f5')
        +_badge('ti-building','LGU+',_lguF,'#c0392b','rgba(192,57,43,0.10)')
        +_badge('ti-building','KT',_ktF,'#1a52b0','rgba(26,82,176,0.10)')
        +'</div>'
        +'<div style="color:var(--text3);font-size:11px;">왼쪽에서 REQ 또는 폴더를 선택하세요</div>'
        +'</div>';
    }
    tcs=e3SortTcs(e3ReqTcs(rq));
  }
  if(!tcs.length){ e3TcPagerCache=''; return '<div style="padding:34px 14px;text-align:center;color:var(--text3);font-size:12px;"><i class="ti ti-clipboard-off" style="font-size:28px;opacity:.3;display:block;margin-bottom:8px;"></i>이 REQ에는 TC가 없습니다</div>'; }
  // Coverage 검색어 필터 (TC ID · Summary)
  if(e3TcSearch && String(e3TcSearch).trim()){
    var _q=String(e3TcSearch).trim().toLowerCase();
    tcs=tcs.filter(function(t){
      var _id=String(t.tcid||t.id||'').toLowerCase();
      var _nm=String(t.name||t.title||'').toLowerCase();
      return _id.indexOf(_q)>=0 || _nm.indexOf(_q)>=0;
    });
    if(!tcs.length){ e3TcPagerCache=''; return '<div style="padding:34px 14px;text-align:center;color:var(--text3);font-size:12px;"><i class="ti ti-search-off" style="font-size:28px;opacity:.3;display:block;margin-bottom:8px;"></i>검색 결과 없음</div>'; }
  }
  // 페이지네이션 — 총 개수 대비 슬라이스 + 페이저 HTML 계산
  var _e3TcTotal=tcs.length;
  var _e3TcPageCount=Math.max(1,Math.ceil(_e3TcTotal/e3TcPageSize));
  if(e3TcPage>_e3TcPageCount) e3TcPage=_e3TcPageCount;
  if(e3TcPage<1) e3TcPage=1;
  var _e3TcPageStart=(e3TcPage-1)*e3TcPageSize;
  tcs=tcs.slice(_e3TcPageStart,_e3TcPageStart+e3TcPageSize);
  e3TcPagerCache=_e3TcPagerHtml(_e3TcTotal,_e3TcPageCount);
  var th='position:sticky;top:0;padding:7px 9px;text-align:left;font-size:12.5px;font-weight:800;color:#475063;background:#eef1f5;border-bottom:1px solid #cfd4dc;white-space:nowrap;z-index:2;';
  var _stepN=function(t){
    // checks 배열이 실제 로드돼 있으면 그 결과(0 포함)를 신뢰. 배열 자체가 없을 때만 서버 메타 fallback.
    if(Array.isArray(t.checks)) return t.checks.filter(function(x){return (x.kind||'cli')==='cli';}).length;
    if(typeof t._cli_count==='number') return t._cli_count;
    if(typeof t._checks_count==='number') return t._checks_count;
    return (t.steps||[]).length;
  };
  e3FlatTcOrder=[];
  // 사용자가 톱니바퀴에서 켠 추가 컬럼(생성자·변경자·생성일·... 또는 커스텀 필드)
  var _extraCols=(function(){ try{ return e3TcColDefs().filter(function(f){ return _e3TcColShown(f.id); }); }catch(_e){ return []; } })();
  // Beta 와 동일한 커스텀 필드 값 조회 · 배지 렌더 (색상·MultiSelect 지원)
  var _cfVal=function(t,f){ if(f.sys) return f.get(t)||''; return ((t.custom_fields||{})[f.id]||''); };
  var _cfBadge=function(f,v){
    if(f.sys) return v?('<span style="font-size:13px;color:var(--text2);">'+_bdEsc(String(v))+'</span>'):'<span style="font-size:13px;color:#c7ccd6;">—</span>';
    if(!v) return '<span style="font-size:13px;color:#c7ccd6;">—</span>';
    if(f.type==='MultiSelect'){
      var arr=String(v).split(',').filter(Boolean);
      if(!arr.length) return '<span style="font-size:13px;color:#c7ccd6;">—</span>';
      return arr.map(function(sv){ var o=(f.options||[]).find(function(x){return cfOptValue(x)===sv;}); var oc=o?cfOptColor(o):'#666'; return '<span style="font-size:13px;font-weight:700;padding:1px 7px;border-radius:9px;background:'+cfTint(oc)+';color:'+oc+';white-space:nowrap;margin:1px;display:inline-block;">'+_bdEsc(sv)+'</span>'; }).join('');
    }
    var o=(f.options||[]).find(function(x){return cfOptValue(x)===v;}); var oc=o?cfOptColor(o):'#666';
    return '<span style="font-size:13px;font-weight:700;padding:2px 9px;border-radius:9px;background:'+cfTint(oc)+';color:'+oc+';white-space:nowrap;">'+_bdEsc(String(v))+'</span>';
  };
  // Beta 의 필터 상태(e3bTcCfFilter) 를 그대로 재사용 — 필터 적용도 동일 로직
  var _filters=(typeof e3bTcCfFilter!=='undefined'&&e3bTcCfFilter)?e3bTcCfFilter:{};
  tcs=tcs.filter(function(t){ return _extraCols.every(function(f){ if(f.sys) return true; var sel=_filters[f.id]; if(!sel||!sel.size) return true; var v=_cfVal(t,f); if(f.type==='MultiSelect'){ var arr=(v||'').split(',').filter(Boolean); return arr.some(function(x){return sel.has(x);}); } return sel.has(v); }); });
  var rows=tcs.map(function(t){
    var id=t.tcid||t.id; e3FlatTcOrder.push(id);
    var sel=e3SelTc===id; var msel=e3SelTcs.has(id); var sn=_stepN(t);
    var bg=msel?'rgba(0,135,90,0.10)':(sel?'rgba(45,111,212,0.10)':'');
    var _extra=_extraCols.map(function(f){
      var editing=!f.sys&&(typeof e3bTcCellEdit!=='undefined'&&e3bTcCellEdit&&e3bTcCellEdit.tcid===id&&e3bTcCellEdit.fieldId===f.id);
      var inner=editing?_e3bTcCellEditHtml(t,f):_cfBadge(f,_cfVal(t,f));
      // 시스템 필드(생성자/변경자/생성일/변경일)는 편집 불가. 커스텀 필드만 더블클릭으로 열림.
      var attrs=f.sys?'':(editing?'':' ondblclick="event.stopPropagation();e3TcCellEditOpen(\''+_bdEsc(id)+'\',\''+f.id+'\')"');
      // 우클릭 → 아래로 채우기 (커스텀 필드만)
      var ctxAttr=f.sys?'':' oncontextmenu="event.stopPropagation();e3TcCellCtx(event,\''+_bdEsc(id)+'\',\''+f.id+'\')"';
      // width:1%; white-space:nowrap 로 셀이 내용 폭만 차지 → TC Summary 가 남는 공간 흡수
      // data-colid — 헤더 드래그 시 본문 셀도 함께 슬라이드 애니메이션 되도록 표식
      return '<td'+attrs+ctxAttr+' data-colid="'+f.id+'" style="padding:'+(editing?'3px 5px':'6px 8px')+';border-bottom:1px solid #eef0f3;white-space:nowrap;text-align:right;width:1%;'+(f.sys?'':'cursor:pointer;')+'" title="'+(f.sys||editing?'':'더블클릭하여 값 수정 · 우클릭하여 아래로 채우기')+'">'+inner+'</td>';
    }).join('');
    var inlineOpen=(e3TcInlineOpen===id);
    var chevTd='<td style="width:26px;padding:6px 2px;border-bottom:1px solid #eef0f3;text-align:center;" onclick="event.stopPropagation();e3ToggleTcInline(event,\''+_bdEsc(id)+'\')" title="'+(inlineOpen?'접기':'세부 내용 펼치기')+'"><i class="ti ti-chevron-right" style="font-size:18px;color:'+(inlineOpen?'#00875a':'var(--text3)')+';cursor:pointer;transition:transform 0.15s;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;border-radius:5px;'+(inlineOpen?'transform:rotate(90deg);':'')+'"></i></td>';
    var _mainRow='<tr onclick="e3RowClickTc(event,\''+_bdEsc(id)+'\')" oncontextmenu="e3ShowCtx(event,\''+_bdEsc(id)+'\',\'tc\')" style="cursor:pointer;user-select:none;background:'+bg+';">'
      +'<td style="width:24px;padding:6px 9px;border-bottom:1px solid #eef0f3;text-align:center;" onclick="event.stopPropagation();e3TcCheckToggle(event,\''+_bdEsc(id)+'\')"><input type="checkbox" '+(msel?'checked':'')+' onclick="event.stopPropagation();e3TcCheckToggle(event,\''+_bdEsc(id)+'\')" style="width:14px;height:14px;cursor:pointer;vertical-align:middle;"></td>'
      +chevTd
      +(e3ShowTcId?'<td class="rc-tcid" onclick="event.stopPropagation();(typeof cbOpenTcPopup===\'function\')&&cbOpenTcPopup(\''+_bdEsc(id)+'\')" title="클릭: TC 상세 팝업 열기" style="padding:6px 9px;border-bottom:1px solid #eef0f3;font-size:'+e3FS('tcid')+';color:'+e3Accent.tcid+';font-weight:'+e3FW('tcid')+';white-space:nowrap;cursor:pointer;text-decoration:underline;text-underline-offset:2px;'+e3FFStyle('tcid')+'">'+_bdEsc(e3DispId(id))+'</td>':'')
      // TC Summary — Beta 처럼 이름 옆에 스텝 수 배지. 더블클릭 → 인라인 편집 (실시간 저장 · 편집 중 행 강조).
      +'<td class="rc-tcname" ondblclick="event.stopPropagation();e3TcNameEditStart(event,\''+_bdEsc(id)+'\')" style="padding:6px 9px;border-bottom:1px solid #eef0f3;font-size:'+e3FS('tcname')+';color:'+e3Accent.tcname+';font-weight:'+e3FW('tcname')+';'+e3FFStyle('tcname')+'" title="더블클릭하여 이름 수정"><span class="e3-tcname-text" data-tcid="'+_bdEsc(id)+'" style="outline:none;">'+_bdEsc(t.name||'')+'</span>'
      +' <span style="font-size:10.5px;font-weight:800;color:'+(sn?'#2d6fd4':'#aab0bd')+';background:'+(sn?'rgba(45,111,212,0.1)':'#eef0f3')+';border-radius:8px;padding:1px 7px;margin-left:4px;" title="시험 절차(스텝) 개수">'+sn+'</span></td>'
      +_extra+'</tr>';
    if(inlineOpen){
      // colspan = 체크박스(1) + chevron(1) + (tcid 열 있으면 1) + tcname(1) + extraCols
      var _colN = 3 + (e3ShowTcId?1:0) + _extraCols.length;
      _mainRow += '<tr id="e3-tc-inline-'+_bdEsc(id)+'"><td colspan="'+_colN+'" style="padding:0;border-top:2px solid rgba(0,135,90,0.35);border-bottom:1px solid #eef0f3;background:#fbfcfe;">'+e3TcInlineHtml(id)+'</td></tr>';
    }
    return _mainRow;
  }).join('');
  var _allChecked=tcs.length&&tcs.every(function(t){ return e3SelTcs.has(t.tcid||t.id); });
  // 헤더: 시스템 필드는 라벨만, 커스텀 필드는 클릭 시 필터 드롭다운 (Beta 스타일)
  // width:1%; white-space:nowrap 은 "내용 폭만" 차지시키는 표준 트릭 — TC Summary 컬럼이 남는 공간을 다 먹음
  // draggable + 드래그 핸들러 — 헤더 자체를 잡고 다른 위치로 놓으면 컬럼 순서 변경 (미리보기: 세로 파란 선)
  var _dragAttrs=function(fid){
    return ' draggable="true"'
      +' ondragstart="_e3TcHdrDragStart(event,\''+fid+'\')"'
      +' ondragover="_e3TcHdrDragOver(event,\''+fid+'\',this)"'
      +' ondragleave="_e3TcHdrDragLeave(event,this)"'
      +' ondrop="_e3TcHdrDrop(event,\''+fid+'\')"'
      +' ondragend="_e3TcHdrDragEnd(event)"';
  };
  var _dragging=(typeof _e3TcHdrDragId!=='undefined')?_e3TcHdrDragId:null;
  var _extraTh=_extraCols.map(function(f){
    var _drag=_dragAttrs(f.id);
    var _dragOpacity=(_dragging===f.id)?'opacity:0.35;':'';
    if(f.sys) return '<th'+_drag+' data-colid="'+f.id+'" title="드래그로 컬럼 순서 변경" style="'+th+'text-align:right;padding-left:8px;padding-right:8px;white-space:nowrap;width:1%;cursor:grab;position:relative;'+_dragOpacity+'">'+_bdEsc(f.label)+'</th>';
    var _filters2=(typeof e3bTcCfFilter!=='undefined'&&e3bTcCfFilter)?e3bTcCfFilter:{};
    var selHdr=_filters2[f.id]; var active=!!(selHdr&&selHdr.size);
    var isOpen=(typeof e3bTcCfPopOpen!=='undefined'&&e3bTcCfPopOpen===f.id);
    return '<th'+_drag+' data-colid="'+f.id+'" title="드래그로 컬럼 순서 변경 · 클릭으로 필터" style="'+th+'text-align:right;padding-left:8px;padding-right:8px;white-space:nowrap;width:1%;cursor:grab;position:relative;'+_dragOpacity+(active?'color:#2d6fd4;':'')+'">'
      +'<span style="position:relative;display:inline-block;">'
      +'<span onclick="event.stopPropagation();e3TcCfFilterOpen(event,\''+f.id+'\')" style="cursor:pointer;display:inline-flex;align-items:center;gap:3px;justify-content:flex-end;">'+_bdEsc(f.label)+'<i class="ti ti-chevron-down" style="font-size:11px;'+(active?'color:#2d6fd4;':'opacity:.5;')+'"></i>'+(active?'<span style="width:6px;height:6px;border-radius:50%;background:#2d6fd4;display:inline-block;"></span>':'')+'</span>'
      +'<span id="e3-tc-cf-pop" data-field="'+f.id+'" style="display:'+(isOpen?'flex':'none')+';position:absolute;top:calc(100% + 4px);right:0;z-index:10001;background:#fff;border:1px solid var(--border);border-radius:9px;box-shadow:0 10px 30px rgba(20,30,60,0.18);padding:8px;min-width:170px;max-height:280px;overflow:auto;font-size:12.5px;font-weight:400;text-align:left;flex-direction:column;cursor:default;">'+(isOpen?_e3bTcCfPopHtml(f.id):'')+'</span>'
      +'</span></th>';
  }).join('');
  return '<table style="width:100%;border-collapse:collapse;table-layout:auto;"><thead><tr>'
    +'<th style="'+th+'width:24px;text-align:center;"><input type="checkbox" '+(_allChecked?'checked':'')+' onclick="event.stopPropagation();e3TcCheckAll(this.checked)" title="전체 선택" style="width:14px;height:14px;cursor:pointer;vertical-align:middle;"></th>'
    +'<th style="'+th+'width:26px;text-align:center;" title="세부 내용 펼침/접기"></th>'
    +(e3ShowTcId?'<th style="'+th+'width:1%;white-space:nowrap;">TC ID</th>':'')
    +'<th style="'+th+'">TC Summary</th>'
    +_extraTh
    +'</tr></thead><tbody>'+rows+'</tbody></table>';
}
// 원본 Coverage 표 헤더 드래그 정렬 — 인터랙티브: 드래그 중 실시간으로 컬럼이 스르륵 자리를 바꾼다.
// 잡은 헤더는 반투명. 다른 헤더 위로 지나가면 즉시 순서 재계산 + 표 재렌더 (throttle 로 부드럽게).
// 저장은 drop 시점(사용자별 localStorage).
var _e3TcHdrDragId=null;
var _e3TcHdrLastSwapAt=0;   // dragover 재렌더 throttle 용
var _e3TcHdrOrigOrder=null; // 취소 시 복구용 원본 순서
function _e3TcHdrDragStart(ev,fid){
  _e3TcHdrDragId=fid; _e3TcHdrLastSwapAt=0;
  _e3TcColLoadIfNeeded();
  // 현재 순서 스냅샷 저장(취소 시 복구용). e3TcColDefs 는 e3TcColOrder 기반이므로 그 배열 사본을 저장.
  _e3TcHdrOrigOrder=Array.isArray(e3TcColOrder)?e3TcColOrder.slice():[];
  try{ ev.dataTransfer.effectAllowed='move'; ev.dataTransfer.setData('text/plain',fid); }catch(e){}
  // 드래그 중인 헤더 반투명 (일부 브라우저에서 timeout 필요)
  try{ var el=ev.currentTarget; setTimeout(function(){ if(el&&el.style) el.style.opacity='0.35'; },0); }catch(e){}
  // 애니메이션 CSS 를 페이지에 1회 주입 → 컬럼이 자리 이동할 때 부드럽게 슬라이드
  _e3TcHdrEnsureAnimStyle();
}
function _e3TcHdrDragOver(ev,fid,el){
  if(!_e3TcHdrDragId){ return; }
  ev.preventDefault();
  try{ ev.dataTransfer.dropEffect='move'; }catch(e){}
  if(_e3TcHdrDragId===fid) return;   // 자기 자신 위에서는 변화 없음
  // throttle — 짧은 시간에 여러 번 재렌더되면 깜박이므로 최소 80ms 간격
  var now=Date.now();
  if(now-_e3TcHdrLastSwapAt<80) return;
  var rc=el.getBoundingClientRect();
  var side=(ev.clientX-rc.left)<(rc.width/2)?'left':'right';
  // 지금의 e3TcColOrder 를 기준으로 dragId 위치를 targetFid 옆으로 즉시 이동
  var cols=e3TcColDefs().map(function(f){ return f.id; });
  var fromIdx=cols.indexOf(_e3TcHdrDragId); if(fromIdx<0) return;
  var oldIdx=fromIdx;
  cols.splice(fromIdx,1);
  var toIdx=cols.indexOf(fid);
  if(toIdx<0) cols.push(_e3TcHdrDragId);
  else cols.splice(side==='right'?(toIdx+1):toIdx,0,_e3TcHdrDragId);
  // 실제 변화 있을 때만 반영 (같은 위치면 skip)
  var newIdx=cols.indexOf(_e3TcHdrDragId);
  if(newIdx===oldIdx) return;
  _e3TcHdrLastSwapAt=now;
  e3TcColOrder=cols;
  // 재렌더 (localStorage 저장은 drop 시점) — 애니메이션은 CSS transition 이 담당
  e3RebuildTcBody();
  // 재렌더 후에도 잡은 헤더 반투명 유지 (새로운 DOM 이므로 다시 세팅)
  setTimeout(function(){
    var re=document.querySelector('#e3-tc-body th[data-colid="'+_e3TcHdrDragId+'"]');
    if(re) re.style.opacity='0.35';
  },0);
}
function _e3TcHdrDragLeave(ev,el){ /* live-swap 방식에선 별도 처리 불필요 */ }
function _e3TcHdrDrop(ev,targetFid){
  ev.preventDefault();
  // dragover 에서 이미 e3TcColOrder 를 계속 반영해 왔음 → drop 시엔 localStorage 저장만 확정.
  _e3TcHdrDragId=null; _e3TcHdrLastSwapAt=0; _e3TcHdrOrigOrder=null;
  try{ localStorage.setItem(_e3TcColOrderKey(),JSON.stringify(e3TcColOrder)); }catch(e){}
  e3RebuildTcBody();
}
function _e3TcHdrDragEnd(ev){
  // 브라우저 외부로 드롭되거나 ESC 로 취소된 경우 → 원본 순서로 복구
  if(_e3TcHdrDragId){
    if(_e3TcHdrOrigOrder){ e3TcColOrder=_e3TcHdrOrigOrder.slice(); }
    _e3TcHdrDragId=null; _e3TcHdrLastSwapAt=0; _e3TcHdrOrigOrder=null;
    e3RebuildTcBody();
  }
  try{ if(ev&&ev.currentTarget&&ev.currentTarget.style) ev.currentTarget.style.opacity=''; }catch(e){}
}
// 컬럼 슬라이드 애니메이션용 CSS 1회 주입 — position 이동 시 부드럽게 스르륵.
// CSS transition 만으로는 재렌더된 <th> 는 새 DOM 이라 애니메이션 없음. 대신
// 재렌더 직전 각 th 의 rect 를 기억했다가 재렌더 후 그 delta 만큼 transform 으로 이동시켰다가 0으로 돌려놓는
// FLIP 기법을 e3RebuildTcBody 시점에 적용.
function _e3TcHdrEnsureAnimStyle(){
  if(document.getElementById('e3-tc-hdr-anim-style')) return;
  var st=document.createElement('style'); st.id='e3-tc-hdr-anim-style';
  // 슬라이드 애니메이션 — 눈에 확실히 보이도록 380ms + 자연스러운 이징. 헤더 + 본문 셀 모두 함께 이동.
  st.textContent='#e3-tc-body th[data-colid],#e3-tc-body td[data-colid]{transition:transform 380ms cubic-bezier(.22,.61,.36,1);will-change:transform;}';
  document.head.appendChild(st);
}
// FLIP 애니메이션 훅 — e3RebuildTcBody 를 감싸서 재렌더 전/후 rect 차이만큼 transform 시작 → 0 으로 원상복귀
var _e3TcHdrRectsBefore=null;
(function(){
  if(typeof e3RebuildTcBody==='function' && !e3RebuildTcBody.__e3flipPatched){
    var _orig=e3RebuildTcBody;
    window.e3RebuildTcBody=function(){
      // 드래그 중일 때만 FLIP 애니메이션 적용 — 헤더 + 본문 셀 모두
      if(_e3TcHdrDragId){
        var before={};
        document.querySelectorAll('#e3-tc-body [data-colid]').forEach(function(el){
          var fid=el.getAttribute('data-colid'); var key=fid+'::'+(el.tagName==='TH'?'H':(el.parentNode&&el.parentNode.rowIndex));
          before[key]={left:el.getBoundingClientRect().left, fid:fid, el:el};
        });
        _e3TcHdrRectsBefore=before;
      } else {
        _e3TcHdrRectsBefore=null;
      }
      var r=_orig.apply(this,arguments);
      if(_e3TcHdrRectsBefore){
        var before2=_e3TcHdrRectsBefore; _e3TcHdrRectsBefore=null;
        // 재렌더 후 요소들은 새 DOM. fid+행번호 매칭으로 delta 계산.
        var newMap={};
        document.querySelectorAll('#e3-tc-body [data-colid]').forEach(function(el){
          var fid=el.getAttribute('data-colid'); var key=fid+'::'+(el.tagName==='TH'?'H':(el.parentNode&&el.parentNode.rowIndex));
          newMap[key]={left:el.getBoundingClientRect().left, el:el};
        });
        // delta transform 적용 (transition 없이 즉시)
        Object.keys(newMap).forEach(function(key){
          if(!(key in before2)) return;
          var dx=before2[key].left-newMap[key].left;
          if(!dx) return;
          var el=newMap[key].el;
          el.style.transition='none';
          el.style.transform='translateX('+dx+'px)';
        });
        // 다음 프레임에 transition 켜고 transform 0 → 브라우저 애니메이션
        requestAnimationFrame(function(){
          Object.keys(newMap).forEach(function(key){
            var el=newMap[key].el;
            el.style.transition=''; el.style.transform='';
          });
        });
      }
      return r;
    };
    window.e3RebuildTcBody.__e3flipPatched=true;
  }
})();

// Beta 의 필터/편집 함수들을 원본 표에서도 쓸 수 있게 얇게 감싼 wrapper — 상태는 Beta 와 공유.
// Beta 는 상태 변경 후 e3bSetTcBodyHtml() 로 재렌더하는데, 원본에서는 e3RebuildTcBody() 로 재렌더가 필요하므로
// 원본용 open 함수는 상태만 세팅하고 e3RebuildTcBody() 를 호출.
function e3TcCfFilterOpen(ev,fieldId){
  if(ev&&ev.stopPropagation) ev.stopPropagation();
  if(typeof e3bTcCfPopOpen==='undefined') return;
  e3bTcCfPopOpen=(e3bTcCfPopOpen===fieldId)?null:fieldId;
  e3RebuildTcBody();
  if(e3bTcCfPopOpen) setTimeout(function(){ document.addEventListener('mousedown',_e3TcCfPopOutside); },0);
  else document.removeEventListener('mousedown',_e3TcCfPopOutside);
}
function _e3TcCfPopOutside(ev){
  var p=document.getElementById('e3-tc-cf-pop');
  if(p&&!p.contains(ev.target)&&!ev.target.closest('span[onclick*="e3TcCfFilterOpen"]')){
    if(typeof e3bTcCfPopOpen!=='undefined') e3bTcCfPopOpen=null;
    e3RebuildTcBody(); document.removeEventListener('mousedown',_e3TcCfPopOutside);
  }
}
// Beta 필터 팝오버 안의 체크/해제 · 전체 해제 버튼은 e3bTcCfFilterToggle/Clear 를 호출.
// 그 함수들은 내부에서 e3bSetTcBodyHtml() 만 호출해 원본 body 는 갱신 안 됨 → 여기서 monkey patch 로 감싸서 원본도 재렌더.
(function(){
  if(typeof e3bTcCfFilterToggle==='function' && !e3bTcCfFilterToggle.__e3patched){
    var _orig=e3bTcCfFilterToggle;
    window.e3bTcCfFilterToggle=function(){ var r=_orig.apply(this,arguments); try{ e3RebuildTcBody(); }catch(_e){} return r; };
    window.e3bTcCfFilterToggle.__e3patched=true;
  }
  if(typeof e3bTcCfFilterClear==='function' && !e3bTcCfFilterClear.__e3patched){
    var _orig2=e3bTcCfFilterClear;
    window.e3bTcCfFilterClear=function(){ var r=_orig2.apply(this,arguments); try{ e3RebuildTcBody(); }catch(_e){} return r; };
    window.e3bTcCfFilterClear.__e3patched=true;
  }
})();
// 원본 표에서 셀 더블클릭 시 인라인 편집 — Beta 함수를 상태만 세팅해 호출하고 원본 body 재렌더
function e3TcCellEditOpen(tcid, fieldId){
  if(typeof e3bTcCellEdit==='undefined') return;
  e3bTcCellEdit={tcid:tcid,fieldId:fieldId};
  if(typeof e3bTcCellMultiDdOpen!=='undefined') e3bTcCellMultiDdOpen=false;
  e3RebuildTcBody();
  document.removeEventListener('mousedown',_e3TcCellEditOutside);
  setTimeout(function(){
    var el=document.getElementById('e3b-tc-celledit');
    if(el){ el.focus(); if(el.select) el.select(); }
    document.addEventListener('mousedown',_e3TcCellEditOutside);
  },0);
}
function _e3TcCellEditOutside(ev){
  if(ev.target.closest('#e3b-tc-celledit-wrap')) return;
  if(typeof e3bTcCellEdit!=='undefined') e3bTcCellEdit=null;
  if(typeof e3bTcCellMultiDdOpen!=='undefined') e3bTcCellMultiDdOpen=false;
  document.removeEventListener('mousedown',_e3TcCellEditOutside);
  e3RebuildTcBody();
}
// Beta 의 e3bTcCellEditCommit / e3bTcCellEditClose 도 monkey patch — commit 후 원본 body 재렌더
(function(){
  if(typeof e3bTcCellEditCommit==='function' && !e3bTcCellEditCommit.__e3patched){
    var _c=e3bTcCellEditCommit;
    window.e3bTcCellEditCommit=function(){ var r=_c.apply(this,arguments); try{ e3RebuildTcBody(); }catch(_e){} return r; };
    window.e3bTcCellEditCommit.__e3patched=true;
  }
  if(typeof e3bTcCellEditClose==='function' && !e3bTcCellEditClose.__e3patched){
    var _cl=e3bTcCellEditClose;
    window.e3bTcCellEditClose=function(){ var r=_cl.apply(this,arguments); try{ e3RebuildTcBody(); }catch(_e){} return r; };
    window.e3bTcCellEditClose.__e3patched=true;
  }
})();
// TC 체크박스 토글 · 전체선택 (Beta 의 e3bTcCheckToggle/CheckAll 과 동일 구조 — 원본 상태변수 e3SelTcs 사용)
function e3TcCheckToggle(ev,tcid){
  if(ev) ev.stopPropagation();
  var on=!e3SelTcs.has(tcid); if(on)e3SelTcs.add(tcid); else e3SelTcs.delete(tcid);
  e3SelAnchorTc=tcid;
  if(e3SelTcs.size===1){ e3SelTc=Array.from(e3SelTcs)[0]; } else if(!e3SelTcs.size){ e3SelTc=null; }
  e3RebuildTcBody();
}
function e3TcCheckAll(checked){
  if(checked){ e3FlatTcOrder.forEach(function(id){ e3SelTcs.add(id); }); }
  else { e3FlatTcOrder.forEach(function(id){ e3SelTcs.delete(id); }); e3SelTc=null; }
  if(e3SelTcs.size===1){ e3SelTc=Array.from(e3SelTcs)[0]; }
  e3RebuildTcBody();
}
function e3RenderDetail(tcid){
  var wrap=document.getElementById('e3-detail'); if(!wrap) return;
  var tc=tcList.find(function(t){return (t.tcid===tcid)||(t.id===tcid);});
  if(!tc){ wrap.innerHTML='<div style="flex:1;display:flex;align-items:center;justify-content:center;height:100%;color:var(--text3);font-size:13px;">가운데에서 TC를 선택하면<br>시험 절차가 표시됩니다</div>'; return; }
  // 메타 로드 상태에서는 checks가 없을 수 있으므로 _checks_count 우선 사용
  var steps=((tc.checks||[]).filter(function(x){return (x.kind||'cli')==='cli';}).length||tc._cli_count||tc._checks_count||(tc.steps||[]).length);
  var tab=e3TcTab[tcid]||'procedure';
  // History 배지 = 서버 실행 이력(_runHistory[tcid]) 만 참조. tc.result_history 는 죽은 필드라 무시.
  var _histN=0;
  try{
    if(typeof _runHistoryLoaded!=='undefined' && !_runHistoryLoaded[tcid] && typeof _loadRunHistoryFromServer==='function'){ _loadRunHistoryFromServer(tcid); }
    if(typeof _runHistory!=='undefined' && Array.isArray(_runHistory[tcid])) _histN=_runHistory[tcid].length;
  }catch(_e){}
  // Cycle Result 배지 = 이 TC 가 포함된 사이클 개수
  var _cycN=0;
  try{
    if(typeof cycleList!=='undefined'&&Array.isArray(cycleList)){
      cycleList.forEach(function(cy){ if((cy.items||[]).some(function(it){return (it.tcid===tcid)||(it.id===tcid);})) _cycN++; });
    }
  }catch(_e){}
  var rail=[ {id:'info',icon:'ti-info-circle',label:'Info'}, {id:'env',icon:'ti-clipboard-text',label:'Environment'}, {id:'topo',icon:'ti-topology-star',label:'Topology'}, {id:'traffic',icon:'ti-antenna',label:'Traffic'}, {id:'procedure',icon:'ti-list-check',label:'Step',badge:steps||''}, {id:'issue',icon:'ti-bug',label:'Issues'}, {id:'history',icon:'ti-history',label:'History',badge:_histN||''}, {id:'cycle',icon:'ti-recycle',label:'Cycle Result',badge:_cycN||''} ];
  // 사용자 액션(스텝 클릭/실행 등)마다 이 패널이 통째로 innerHTML 재생성되는데, 그 안에
  // 스크롤 컨테이너가 2겹(바깥 data-exp-scroll 영역 + 안쪽 절차 테이블 .stepTbl)이라
  // 재렌더 전후로 위치를 기억해뒀다가 복원하지 않으면 매번 화면이 맨 위로 튐.
  var _scs=wrap.querySelectorAll('[data-exp-scroll], .stepTbl');
  var _scTops=[]; _scs.forEach(function(el){ _scTops.push(el.scrollTop); });
  wrap.innerHTML=expDetailShell('TC', (typeof expDispId==='function'?expDispId(tc.tcid):tc.tcid), tc.name||'', 'var(--green)', rail, tab, rail.map(function(t){return 'e3SwitchTcTab(\''+tcid+'\',\''+t.id+'\')';}), tcTabContent(tc,tab), 'exportTCPDF(\''+tc.tcid+'\')', (typeof _procHeadBar==='function'?_procHeadBar(tcid):''), 'exportTCPPTX(\''+tc.tcid+'\')', 'shareTcMail(\''+tc.tcid+'\')', 'expCopyLink(\'tc\',\''+tc.tcid+'\')', '', true, false, '');
  var _scs2=wrap.querySelectorAll('[data-exp-scroll], .stepTbl');
  _scs2.forEach(function(el,i){ if(_scTops[i]) el.scrollTop=_scTops[i]; });
  if(typeof _tcManExpImgObserveAll==='function') _tcManExpImgObserveAll();
}
function e3SwitchTcTab(tcid,tab){ e3TcTab[tcid]=tab; e3RenderDetail(tcid); }
var e3ReqTab={};
function e3RenderReqDetail(reqid){
  var wrap=document.getElementById('e3-detail'); if(!wrap) return;
  var r=reqList.find(function(x){return x.id===reqid;});
  if(!r){ wrap.innerHTML='<div style="flex:1;display:flex;align-items:center;justify-content:center;height:100%;color:var(--text3);font-size:13px;">왼쪽에서 REQ를 선택하세요</div>'; return; }
  var tcCount=e3ReqTcs(r).length;
  var tab=e3ReqTab[reqid]||'details';
  var rail=[ {id:'details',icon:'ti-info-circle',label:'Info'}, {id:'scenario',icon:'ti-file-text',label:'Description'}, {id:'impl',icon:'ti-code',label:'Implementation'}, {id:'tc',icon:'ti-clipboard-check',label:'TC',badge:tcCount||''}, {id:'issues',icon:'ti-bug',label:'Issues'} ];
  var content=(typeof req2TabContent==='function')?req2TabContent(r,tab):'<div style="padding:20px;color:#888;">REQ 상세 로드 불가</div>';
  wrap.innerHTML=expDetailShell('REQ', (typeof expDispId==='function'?expDispId(r.reqid):r.reqid), r.title||'', 'var(--blue)', rail, tab, rail.map(function(t){return 'e3SwitchReqTab(\''+reqid+'\',\''+t.id+'\')';}), content, 'exportReqPDF(\''+r.id+'\')', '', '', 'shareReqMail(\''+r.id+'\')', '', '', true, false, '');
  if(tab==='scenario'){ if(typeof req2DestroyTiny==='function')req2DestroyTiny(r.id); setTimeout(function(){ if(typeof req2InitTiny==='function')req2InitTiny(r.id); },160); var topo=document.getElementById('req2-sc-topo-'+r.id); if(topo&&typeof renderTopoEditor==='function'){ topo.innerHTML=renderTopoEditor(r); setTimeout(function(){ if(typeof topoDrawioInit==='function')topoDrawioInit(r.id); },220); } }
  else if(tab==='impl'){ if(typeof req2DestroyTiny==='function')req2DestroyTiny(r.id); setTimeout(function(){ if(typeof req2InitTinyImpl==='function')req2InitTinyImpl(r.id); },160); }
}
function e3SwitchReqTab(reqid,tab){ e3ReqTab[reqid]=tab; e3RenderReqDetail(reqid); }
// 3열 우측 패널: TC 다중 선택(2개 이상)이면 일괄 편집, 아니면 단일 TC/REQ 상세
function e3RenderPane(){ if(e3SelTcs.size>=2){ e3RenderBulkEdit(); } else if(e3SelTc){ e3RenderDetail(e3SelTc); } else if(e3SelReq){ e3RenderReqDetail(e3SelReq); } else { var w=document.getElementById('e3-detail'); if(w)w.innerHTML='<div style="flex:1;display:flex;align-items:center;justify-content:center;height:100%;color:var(--text3);font-size:13px;">REQ 또는 TC를 선택하세요</div>'; } }
function e3RenderBulkEdit(){
  var wrap=document.getElementById('e3-detail'); if(!wrap) return;
  var ids=Array.from(e3SelTcs);
  var tcs=ids.map(function(id){ return tcList.find(function(t){return (t.tcid===id)||(t.id===id);}); }).filter(Boolean);
  var listHtml=tcs.map(function(t){ var id=t.tcid||t.id; return '<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:var(--green);background:rgba(0,135,90,0.10);border-radius:8px;padding:2px 9px;margin:2px;">'+_bdEsc(t.name||id)+'</span>'; }).join('');
  var fieldBlock=function(field,label,desc){
    return '<div style="margin-bottom:16px;">'
      +'<div style="display:flex;align-items:center;margin-bottom:4px;"><span style="font-size:12px;color:#aaa;flex:1;">'+label+' <span style="color:#7a7f95;">('+desc+')</span></span>'
      +'<button onclick="e3BulkApplyField(\''+field+'\')" style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:5px;border:1px solid rgba(0,135,90,0.35);background:rgba(0,135,90,0.08);color:var(--green);cursor:pointer;"><i class="ti ti-checks"></i> 선택된 '+tcs.length+'개 TC에 적용</button></div>'
      +'<div id="e3-bulk-tiny-'+field+'" style="width:100%;"></div></div>';
  };
  wrap.innerHTML='<div style="flex:1;overflow:auto;padding:16px;">'
    +'<div style="display:flex;align-items:center;gap:7px;margin-bottom:4px;font-size:13px;font-weight:800;color:var(--green);"><i class="ti ti-checks"></i>'+tcs.length+'개 TC 일괄 편집</div>'
    +'<div style="margin-bottom:14px;">'+listHtml+'</div>'
    +'<div style="font-size:11px;color:var(--text3);margin-bottom:14px;"><i class="ti ti-info-circle"></i> 아래 내용을 입력 후 "적용" 버튼을 누르면 선택된 모든 TC의 값이 덮어써집니다. 비워두면 적용되지 않습니다.</div>'
    +fieldBlock('object','Object','목적')
    +fieldBlock('precondition','Pre-Condition','사전 준비 조건')
    +'</div>';
  setTimeout(function(){ e3BulkTinyInit('object'); e3BulkTinyInit('precondition'); },140);
}
function _e3Hdr(ic,col,txt,btns){ return '<div style="height:42px;flex-shrink:0;display:flex;align-items:center;gap:7px;padding:0 11px;border-bottom:1px solid var(--border);font-size:12.5px;font-weight:800;color:'+col+';">'+'<i class="ti '+ic+'"></i><span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+txt+'</span>'+(btns||'')+'</div>'; }
function _e3Btn(onclick,ic,title){ return '<button onclick="'+onclick+'" title="'+title+'" style="width:32px;height:32px;border-radius:7px;border:1px solid #d6dce6;background:#fff;color:var(--text2);cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="ti '+ic+'" style="font-size:20px;"></i></button>'; }
function _e3Clp(label,color,n){
  // 3열(상세) 접힘은 오른쪽 → 클릭 시 왼쪽으로 펼침. 화살표를 왼쪽 방향으로.
  var _ic=(n===3)?'ti-chevron-left':'ti-chevron-right';
  return '<div onclick="e3ToggleCol('+n+')" title="'+label+' 펼치기" style="flex:0 0 38px;background:#fff;border:1px solid var(--border);border-radius:12px;box-shadow:0 2px 10px rgba(40,50,90,0.06);cursor:pointer;display:flex;flex-direction:column;align-items:center;padding-top:12px;gap:10px;"><i class="ti '+_ic+'" style="color:'+color+';font-size:14px;"></i><span style="writing-mode:vertical-rl;font-size:11.5px;font-weight:800;color:'+color+';letter-spacing:1.5px;">'+label+'</span></div>';
}
function _e3ReqPanelHdr(){
  // 1행: 아이콘+제목 / 우측: 열 접기만 — 이 행이 도킹 드래그 handle 역할 (data-dock-handle)
  var row1='<div data-dock-handle="1" style="display:flex;align-items:center;gap:4px;font-size:15px;font-weight:800;color:#7c3aed;padding-bottom:8px;border-bottom:1px solid var(--border);margin-bottom:6px;cursor:grab;">'
    +'<i class="ti ti-clipboard-text"></i>'
    +'<span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Requirements</span>'
    +_e3Btn('e3ToggleCol(1)','ti-layout-sidebar-left-collapse','이 열 접기')
    +'</div>';
  // 2행: 배지 + 우측 필터 토글 버튼 + 이동된 아이콘 4개 (상위폴더 생성·삭제·펼침·접기)
  var hasFilter=!!(e3FilterStatus||e3FilterPriority||e3Search);
  var row2='<div style="margin-top:5px;display:flex;align-items:center;gap:4px;">'
    +e3ReqCountBadges()
    +'<div style="flex:1;"></div>'
    +_e3Btn('e3AddRootFolder()','ti-folder-plus','상위 폴더 생성')
    +_e3Btn('e3ExpandAll()','ti-chevrons-down','전체 펼치기')
    +_e3Btn('e3CollapseAll()','ti-chevrons-up','전체 접기')
    +'<button id="e3-filter-btn" onclick="e3ToggleFilter()" title="검색/필터 열기·닫기" style="display:flex;align-items:center;gap:3px;font-size:14px;font-weight:700;padding:4px 12px;border-radius:5px;border:1px solid '+(e3FilterOpen?'var(--blue)':'#d6dce6')+';background:'+(e3FilterOpen?'rgba(45,111,212,0.10)':'#fff')+';color:'+(e3FilterOpen?'var(--blue)':'var(--text2)')+';cursor:pointer;white-space:nowrap;">'
      +'필터'+(hasFilter?' <span style="display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;background:var(--blue);color:#fff;font-size:9px;">!</span>':'')
    +'</button>'
    +'</div>';
  // 필터·검색 패널 (토글)
  var row3='<div id="e3-filter-wrap" style="display:'+(e3FilterOpen?'block':'none')+';margin-top:5px;">'
    +'<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:4px;">'
      +'<select id="e3-filter-status" onchange="e3OnFilterStatus(this.value)" style="font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:5px;background:#fff;outline:none;flex:1;cursor:pointer;">'
        +'<option value="">상태 전체</option>'
        +'<option'+(e3FilterStatus==='Draft'?' selected':'')+'>Draft</option>'
        +'<option'+(e3FilterStatus==='Work in Progress'?' selected':'')+'>Work in Progress</option>'
        +'<option'+(e3FilterStatus==='Review'?' selected':'')+'>Review</option>'
        +'<option'+(e3FilterStatus==='Approved'?' selected':'')+'>Approved</option>'
        +'<option'+(e3FilterStatus==='Deprecated'?' selected':'')+'>Deprecated</option>'
      +'</select>'
      +'<select id="e3-filter-priority" onchange="e3OnFilterPriority(this.value)" style="font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:5px;background:#fff;outline:none;flex:1;cursor:pointer;">'
        +'<option value="">중요도 전체</option>'
        +'<option'+(e3FilterPriority==='Very High'?' selected':'')+'>Very High</option>'
        +'<option'+(e3FilterPriority==='High'?' selected':'')+'>High</option>'
        +'<option'+(e3FilterPriority==='Medium'?' selected':'')+'>Medium</option>'
        +'<option'+(e3FilterPriority==='Low'?' selected':'')+'>Low</option>'
      +'</select>'
    +'</div>'
    +'<input id="e3-search" oninput="e3OnSearch(this.value)" value="'+_bdEsc(e3Search)+'" placeholder="REQ ID, 제목 검색..." style="width:100%;font-size:11px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;background:#fff;outline:none;box-sizing:border-box;">'
    +'</div>';
  return '<div style="flex-shrink:0;padding:8px 11px 6px;border-bottom:1px solid var(--border);background:#fff;">'+row1+row2+row3+'</div>';
}
function _e3TcPanelHdr(){
  var row1='<div style="display:flex;align-items:center;gap:7px;font-size:15px;font-weight:800;color:#00875a;">'
    +'<i class="ti ti-file-check"></i>'
    +'<span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Coverage</span>'
    +_e3Btn('e3ToggleCol(2)','ti-layout-sidebar-left-collapse','이 열 접기')
    +'</div>';
  // 선택 상태 : 다중선택 툴바만 표시 (New/일괄생성 액션바는 숨김)
  // 미선택 상태 : New/일괄생성 액션바만 표시
  var _selN=(typeof e3SelTcs!=='undefined'&&e3SelTcs)?e3SelTcs.size:0;
  var _bar=_selN?_e3TcSelToolbar():_e3TcActionBar();
  return '<div id="e3-tc-hdr" style="flex-shrink:0;padding:8px 11px 6px;border-bottom:1px solid var(--border);background:#fff;">'+row1+'</div>'+_bar;
}
// Detail 카드 상단 헤더 — REQ/Coverage 헤더와 동일 스타일. 헤더 자체가 도킹 드래그 핸들.
// 열 접기 버튼은 우측 방향(right-collapse) 으로 표시.
function _e3DetailPanelHdr(){
  var row1='<div style="display:flex;align-items:center;gap:7px;font-size:15px;font-weight:800;color:#e8820c;">'
    +'<i class="ti ti-info-square-rounded"></i>'
    +'<span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Test Details</span>'
    +_e3Btn('e3ToggleCol(3)','ti-layout-sidebar-right-collapse','이 열 접기')
    +'</div>';
  return '<div id="e3-detail-hdr" style="flex-shrink:0;padding:8px 11px 6px;border-bottom:1px solid var(--border);background:#fff;">'+row1+'</div>';
}
// Beta 처럼 Coverage 아래 상시 툴바: [New] [TC 일괄 생성] ... [톱니바퀴]
// 선택 상태 시 별도 다중선택 툴바(_e3TcSelToolbar)가 아래에 추가됨.
function _e3TcActionBar(){
  var curReqId=(function(){
    if(!e3SelFolder){ var r=(reqList||[]).find(function(x){return x.id===e3SelReq;}); return r?r.id:null; }
    var allFids=e3DescIds(e3SelFolder);
    var fr=(reqList||[]).find(function(r){return allFids.indexOf(r.folder)>=0;});
    return fr?fr.id:null;
  })();
  var left=(curReqId?_e3TcToolbarBtn('e3AddTcWrap(\''+curReqId+'\')','ti-plus','New'):'')
         +(curReqId?'<button onclick="e3BulkAddTcWrap(\''+curReqId+'\')" style="display:flex;align-items:center;justify-content:center;height:30px;padding:0 12px;border-radius:6px;border:1px solid #d6dce6;background:#fff;color:var(--text2);cursor:pointer;font-size:14px;font-weight:700;white-space:nowrap;">TC 일괄 생성</button>':'');
  var searchBox='<input id="e3-tc-search" oninput="e3TcSearchInput(this.value)" value="'+_bdEsc(e3TcSearch||'')+'" placeholder="검색 (TC ID · Summary)" style="flex:1;height:30px;font-size:14px;padding:0 10px;border:1px solid #d6dce6;border-radius:6px;background:#fff;outline:none;box-sizing:border-box;min-width:0;">';
  var colBtn='<div style="position:relative;display:inline-block;">'
    +'<button onclick="e3TcColMenuOpen(event)" title="표시 열 설정" style="display:flex;align-items:center;justify-content:center;height:32px;padding:0 10px;border-radius:6px;border:1px solid #d6dce6;background:#fff;color:var(--text2);cursor:pointer;"><i class="ti ti-settings" style="font-size:22px;"></i></button>'
    +'<div id="e3-tc-col-pop" style="display:none;position:absolute;top:calc(100% + 4px);right:0;z-index:10001;background:#fff;border:1px solid var(--border);border-radius:9px;box-shadow:0 10px 30px rgba(20,30,60,0.18);width:220px;max-height:min(600px,70vh);overflow:hidden;flex-direction:column;font-size:12.5px;"></div>'
  +'</div>';
  return '<div id="e3-tc-actbar" style="flex-shrink:0;display:flex;align-items:center;gap:6px;border-bottom:1px solid var(--border);padding:6px 11px;">'+left+searchBox+colBtn+'</div>';
}
// Coverage 검색 상태 (TC ID · Summary)
var e3TcSearch='';
// TC Summary 셀 인라인 편집 — 더블클릭 시작, 실시간 저장, 편집 중 행 강조
function e3TcNameEditStart(ev, tcid){
  if(ev){ try{ ev.stopPropagation(); ev.preventDefault(); }catch(_e){} }
  var span=document.querySelector('.e3-tcname-text[data-tcid="'+tcid+'"]');
  if(!span) return;
  var tr=span.closest('tr'); if(!tr) return;
  // 편집 상태로 전환 — 다른 행 편집 중이면 먼저 종료
  document.querySelectorAll('.e3-tcname-text[contenteditable="true"]').forEach(function(el){
    if(el!==span){ el.contentEditable='false'; var _p=el.closest('tr'); if(_p) _p.style.background=_p.dataset._e3EditPrevBg||''; }
  });
  span.contentEditable='true';
  span.style.outline='2px solid #2d6fd4';
  span.style.background='#fff';
  span.style.padding='2px 6px';
  span.style.borderRadius='4px';
  // 편집 중엔 셀 전체 폭 확보 — 스텝 수 배지 잠깐 숨기고 span 이 남은 공간 다 흡수
  span.style.display='block';
  span.style.width='100%';
  span.style.boxSizing='border-box';
  var _sib=span.nextElementSibling;   // 스텝 수 배지
  if(_sib){ span.dataset._e3EditPrevSibDisplay=_sib.style.display||''; _sib.style.display='none'; }
  // 행 전체 강조 (기존 배경 백업)
  tr.dataset._e3EditPrevBg=tr.style.background||'';
  tr.style.background='rgba(45,111,212,0.14)';
  // 커서를 텍스트 끝에 위치 (전체 선택 X → 클릭으로 커서 이동해도 편집 유지)
  span.focus();
  try{
    var range=document.createRange(); range.selectNodeContents(span); range.collapse(false);   // 끝으로
    var sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
  }catch(_e){}
  // 편집 중인 셀(td) 클릭 시 span 밖(padding 영역)이라도 focus 유지 — blur 방지
  var _td=span.closest('td');
  if(_td && !_td._e3TcNameEditGuard){
    _td._e3TcNameEditGuard=true;
    _td.addEventListener('mousedown', function(ev){
      if(span.contentEditable==='true' && ev.target!==span && !span.contains(ev.target)){
        ev.preventDefault();   // 기본 focus 이동 차단 → span 이 blur 되지 않음
        span.focus();
      }
    });
  }
  // 실시간 저장 (debounce 300ms)
  span._e3SaveTimer=null;
  var _commit=function(){
    var tc=(tcList||[]).find(function(x){return (x.tcid||x.id)===tcid;}); if(!tc) return;
    var _newName=(span.textContent||'').trim();
    if(_newName!==tc.name){
      tc.name=_newName;
      try{ saveTCFile(tc); }catch(_e){}
    }
  };
  span.oninput=function(){
    if(span._e3SaveTimer) clearTimeout(span._e3SaveTimer);
    span._e3SaveTimer=setTimeout(_commit, 300);
  };
  var _restoreVisuals=function(){
    span.contentEditable='false';
    span.style.outline='none'; span.style.background=''; span.style.padding=''; span.style.borderRadius='';
    span.style.display=''; span.style.width=''; span.style.boxSizing='';
    var _sib2=span.nextElementSibling;
    if(_sib2){ _sib2.style.display=span.dataset._e3EditPrevSibDisplay||''; delete span.dataset._e3EditPrevSibDisplay; }
    tr.style.background=tr.dataset._e3EditPrevBg||''; delete tr.dataset._e3EditPrevBg;
  };
  span.onblur=function(){
    if(span._e3SaveTimer) clearTimeout(span._e3SaveTimer);
    _commit();
    _restoreVisuals();
  };
  span.onkeydown=function(ev){
    if(ev.key==='Enter'){ ev.preventDefault(); span.blur(); }
    else if(ev.key==='Escape'){ ev.preventDefault();
      var tc=(tcList||[]).find(function(x){return (x.tcid||x.id)===tcid;});
      if(tc) span.textContent=tc.name||'';
      _restoreVisuals();
    }
  };
}
// TC 인라인 펼침 (한 번에 1개만 열림) — 원본 페이지 전용
var e3TcInlineOpen=null;
var e3TcTab={};   // tcid -> 활성 탭 (info/env/topo/traffic/procedure/issue/history/cycle)
function e3ToggleTcInline(ev, tcid){
  if(ev){ try{ ev.stopPropagation(); ev.preventDefault(); }catch(_e){} }
  var willOpen=(e3TcInlineOpen!==tcid);
  e3TcInlineOpen=willOpen?tcid:null;
  if(willOpen && !e3TcTab[tcid]) e3TcTab[tcid]='info';
  // body 만 재렌더 (툴바 유지)
  var tb=document.getElementById('e3-tc-body'); if(tb) tb.innerHTML=e3TcListHtml();
  var pg=document.getElementById('e3-tc-pager'); if(pg) pg.innerHTML=e3TcPagerCache||'';
  if(typeof _tcManExpImgObserveAll==='function') _tcManExpImgObserveAll();
}
function e3SwitchTcInlineTab(tcid, tab){
  e3TcTab[tcid]=tab;
  var w=document.getElementById('e3-tc-inline-'+tcid);
  if(w){ var td=w.querySelector('td'); if(td){ td.innerHTML=e3TcInlineHtml(tcid); if(typeof _tcManExpImgObserveAll==='function') _tcManExpImgObserveAll(); } }
}
function e3TcInlineHtml(tcid){
  var tc=tcList.find(function(x){return (x.tcid||x.id)===tcid;});
  if(!tc) return '<div style="padding:20px;color:var(--text3);">TC 를 찾을 수 없습니다</div>';
  var tab=e3TcTab[tcid]||'info';
  var rail=[
    {id:'info',     ic:'ti-info-circle',    lb:'Info'},
    {id:'env',      ic:'ti-clipboard-text', lb:'Environment'},
    {id:'topo',     ic:'ti-topology-star',  lb:'Topology'},
    {id:'traffic',  ic:'ti-antenna',        lb:'Traffic'},
    {id:'procedure',ic:'ti-list-check',     lb:'Step'},
    {id:'issue',    ic:'ti-bug',            lb:'Issues'},
    {id:'history',  ic:'ti-history',        lb:'History'},
    {id:'cycle',    ic:'ti-recycle',        lb:'Cycle Result'},
  ];
  var tabBar='<div style="display:flex;align-items:center;gap:1px;padding:0 12px;background:#fafbfc;border-bottom:1px solid var(--border);overflow-x:auto;flex-shrink:0;">'
    +rail.map(function(t){
      var on=(tab===t.id);
      return '<button onclick="e3SwitchTcInlineTab(\''+_bdEsc(tcid)+'\',\''+t.id+'\')" style="display:inline-flex;align-items:center;gap:5px;padding:9px 12px;cursor:pointer;border:none;background:transparent;border-bottom:2.5px solid '+(on?'#00875a':'transparent')+';color:'+(on?'#00875a':'var(--text3)')+';font-size:13px;font-weight:'+(on?'800':'600')+';white-space:nowrap;">'
        +'<i class="ti '+t.ic+'" style="font-size:15px;"></i>'+t.lb+'</button>';
    }).join('')
    +'</div>';
  var body='';
  try{
    if(typeof tcTabContent==='function'){ body=tcTabContent(tc, tab); }
    else body='<div style="padding:16px;color:var(--text3);">tcTabContent 함수 미로드</div>';
  }catch(e){ body='<div style="padding:16px;color:var(--red);">렌더 오류: '+_bdEsc(e.message)+'</div>'; }
  return '<div style="display:flex;flex-direction:column;background:#fff;">'
    +tabBar
    +'<div data-exp-scroll="1" style="max-height:60vh;overflow-y:auto;"><div style="padding:14px 18px;">'+body+'</div></div>'
    +'</div>';
}
function e3TcSearchInput(v){
  e3TcSearch=v||'';
  e3TcPage=1;
  var tb=document.getElementById('e3-tc-body'); if(tb) tb.innerHTML=e3TcListHtml();
  var pg=document.getElementById('e3-tc-pager'); if(pg) pg.innerHTML=e3TcPagerCache||'';
  var bd=document.getElementById('e3-tc-badges'); if(bd) bd.outerHTML=e3TcCountBadges();
  // 포커스 유지
  var inp=document.getElementById('e3-tc-search'); if(inp && document.activeElement!==inp){ inp.focus(); var _l=inp.value.length; try{inp.setSelectionRange(_l,_l);}catch(_e){} }
}
// New / TC 일괄 생성 은 Beta 와 동일 로직 사용 — 원본 명칭도 e3AddTcWrap/e3BulkAddTcWrap 로 위임
function e3AddTcWrap(reqId){ if(typeof e3bAddTcWrap==='function') return e3bAddTcWrap(reqId); if(typeof addTC==='function') return addTC(reqId); }
function e3BulkAddTcWrap(reqId){ if(typeof e3bBulkAddTcWrap==='function') return e3bBulkAddTcWrap(reqId); }
// TC 다중 선택 툴바 — Beta 의 _e3bTcToolbar 와 동일 UX. 선택 없으면 렌더 안 함.
function _e3TcToolbarBtn(onclick,ic,label){
  return '<button onclick="'+onclick+'" style="display:flex;align-items:center;justify-content:center;gap:5px;height:30px;padding:0 12px;border-radius:6px;border:1px solid #d6dce6;background:#fff;color:var(--text2);cursor:pointer;font-size:14px;font-weight:700;white-space:nowrap;"><i class="ti '+ic+'" style="font-size:15px;"></i>'+label+'</button>';
}
function e3SelTcsArr(){ return Array.from(e3SelTcs); }
function _e3TcSelToolbar(){
  var n=e3SelTcs.size; if(!n) return '';
  var ids=Array.from(e3SelTcs);
  var _btnNoIcon=function(onclick,label){ return '<button onclick="'+onclick+'" style="display:flex;align-items:center;justify-content:center;height:30px;padding:0 12px;border-radius:6px;border:1px solid #d6dce6;background:#fff;color:var(--text2);cursor:pointer;font-size:14px;font-weight:700;white-space:nowrap;">'+label+'</button>'; };
  var _btns=_btnNoIcon('expCloneTC(\''+ids[0]+'\')','Clone')
    +(n===1?_btnNoIcon('expCopyLink(\'tc\',\''+ids[0]+'\')','링크'):'')
    +_btnNoIcon('exportTCPPTX(\''+ids[0]+'\')','PPTX')
    +_btnNoIcon('e3FocusBulkEdit()','Edit in bulk')
    +_btnNoIcon('e3ExportTcsPDF(e3SelTcsArr())','Export PDF')
    +_btnNoIcon('e3ExportTcsExcel(e3SelTcsArr())','Export Excel')
    +_e3TcToolbarBtn('e3BulkDeleteTcs()','ti-trash','삭제');
  // 삭제 버튼 바로 오른쪽에 붙는 "N개 선택됨 · 선택 해제" — Beta 와 동일
  var _sel='<div style="display:flex;align-items:center;gap:6px;background:#eef0f3;border-radius:8px;padding:3px 4px 3px 10px;">'
    +'<span style="font-size:11px;font-weight:800;color:#475063;white-space:nowrap;">'+n+'개 선택됨</span>'
    +'<button onclick="e3SelTcs.clear();e3SelTc=null;e3RebuildTcBody();e3RenderPane();" style="display:flex;align-items:center;gap:4px;height:22px;padding:0 8px;border-radius:6px;border:none;background:transparent;color:var(--text2);cursor:pointer;font-size:11px;font-weight:700;white-space:nowrap;"><i class="ti ti-x" style="font-size:13px;"></i>선택 해제</button>'
    +'</div>';
  // 톱니바퀴(설정) — 액션바와 동일하게 우측 표시
  var colBtn='<div style="position:relative;display:inline-block;margin-left:auto;">'
    +'<button onclick="e3TcColMenuOpen(event)" title="표시 열 설정" style="display:flex;align-items:center;justify-content:center;height:32px;padding:0 10px;border-radius:6px;border:1px solid #d6dce6;background:#fff;color:var(--text2);cursor:pointer;"><i class="ti ti-settings" style="font-size:22px;"></i></button>'
    +'<div id="e3-tc-col-pop" style="display:none;position:absolute;top:calc(100% + 4px);right:0;z-index:10001;background:#fff;border:1px solid var(--border);border-radius:9px;box-shadow:0 10px 30px rgba(20,30,60,0.18);width:220px;max-height:min(600px,70vh);overflow:hidden;flex-direction:column;font-size:12.5px;"></div>'
  +'</div>';
  return '<div id="e3-tc-seltoolbar" style="flex-shrink:0;display:flex;align-items:center;gap:6px;flex-wrap:wrap;border-bottom:1px solid var(--border);padding:6px 11px;background:#fafbfc;">'+_btns+_sel+colBtn+'</div>';
}
// ── Coverage 표 열 표시 설정 (Beta 와 별도, 사용자별 저장) ─────────
// 사용자별로 다른 값을 유지하려면 localStorage 키에 사용자 식별자(currentUser 이름) 포함.
// 기본값: 모두 체크해제 (id 는 true 로 명시, 나머지는 false).
function _e3TcColKey(){
  var u='';
  try{ if(typeof currentUser!=='undefined'&&currentUser) u=currentUser.name||currentUser.username||''; }catch(_e){}
  return 'utop_e3orig_tc_col_vis::'+(u||'anon');
}
function _e3TcColOrderKey(){
  var u='';
  try{ if(typeof currentUser!=='undefined'&&currentUser) u=currentUser.name||currentUser.username||''; }catch(_e){}
  return 'utop_e3orig_tc_col_order::'+(u||'anon');
}
// 초기값은 즉시 load 하지 않는다 — 스크립트 로드 시점엔 currentUser 가 아직 세팅 안 됐을 수 있어
// "anon" 키로 저장되고 로그인 후엔 "권민수" 같은 키로 저장/읽기 → 새로고침마다 초기화 버그.
// 대신 매 read 마다 최신 키로 lazy-load 하고, 결과를 캐시 키와 함께 보관.
var e3TcColVis=null;      // 캐시된 저장값
var e3TcColOrder=[];      // 캐시된 순서
var _e3TcColLoadedKey=null;   // 마지막으로 로드한 사용자 키 — currentUser 바뀌면 재로드
function _e3TcColLoadIfNeeded(){
  var k=_e3TcColKey();
  if(_e3TcColLoadedKey===k) return;
  _e3TcColLoadedKey=k;
  try{ var s=localStorage.getItem(k); e3TcColVis=s?(JSON.parse(s)||null):null; }catch(e){ e3TcColVis=null; }
  try{ var s2=localStorage.getItem(_e3TcColOrderKey()); e3TcColOrder=s2?(JSON.parse(s2)||[]):[]; }catch(e){ e3TcColOrder=[]; }
}
// 기본으로 표시할 컬럼 id (사용자가 명시 해제하지 않는 한 항상 on)
var _E3_TC_COL_DEFAULT_ON = {'_sys_model_group':true, '_sys_model':true};
// 특정 컬럼이 표시 대상인지 — 저장값 있으면 그 값, 없으면 기본 (default_on 목록에 있으면 true, 나머지는 false)
function _e3TcColShown(fid){
  _e3TcColLoadIfNeeded();
  if(!e3TcColVis) return !!_E3_TC_COL_DEFAULT_ON[fid];
  if(fid in e3TcColVis) return e3TcColVis[fid]===true;
  return !!_E3_TC_COL_DEFAULT_ON[fid];
}
function e3TcColDefs(){
  _e3TcColLoadIfNeeded();
  // Beta 의 컬럼 정의를 그대로 재사용 — 시스템(생성자/변경자/생성일/변경일) + TC 커스텀필드
  var all=(typeof e3bTcColDefs==='function')?e3bTcColDefs():[];
  var ord=e3TcColOrder;
  if(ord&&ord.length){
    var idx={}; ord.forEach(function(id,i){ idx[id]=i; });
    var sorted=all.slice().sort(function(a,b){ var ia=(a.id in idx)?idx[a.id]:9999, ib=(b.id in idx)?idx[b.id]:9999; return ia-ib; });
    return sorted;
  }
  return all;
}
var _e3TcColSearch='';
// 팝업용 원본 정의 순서 — 시스템 4개 + 커스텀 필드 원본 순서 (사용자 정렬 무시).
function _e3TcColRawDefs(){
  var fmtDate=function(d){ if(!d) return '-'; var dt=new Date(d); return isNaN(dt)?d:dt.toLocaleDateString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).replace(/\. /g,'/').replace('.',''); };
  var sysCols=[
    {id:'_sys_model_group',label:'모델그룹', sys:true, get:function(t){ return t.modelGroup||''; }},
    {id:'_sys_model',      label:'모델명',   sys:true, get:function(t){ return t.model||''; }},
    {id:'_sys_created_by', label:'생성자', sys:true, get:function(t){ return t.created_by||t.author||t.owner||''; }},
    {id:'_sys_updated_by', label:'변경자', sys:true, get:function(t){ return t.updated_by||''; }},
    {id:'_sys_created_at', label:'생성일', sys:true, get:function(t){ return t.created_at?fmtDate(t.created_at):''; }},
    {id:'_sys_updated_at', label:'변경일', sys:true, get:function(t){ return t.updated_at?fmtDate(t.updated_at):''; }}
  ];
  var cfCols=((typeof customFields!=='undefined'&&customFields&&customFields.tc)||[]).filter(function(f){return f.active!==false&&f.show_info!==false;});
  return sysCols.concat(cfCols);
}
function _e3TcColPopHtml(){
  // 팝업 안 항목 순서는 사용자 정렬(e3TcColOrder)이 아니라 원본 정의 순서 고정.
  // 표(헤더) 순서만 e3TcColOrder 를 따르고, 이 체크리스트는 항상 같은 자리 유지.
  var cols=_e3TcColRawDefs();
  var q=(_e3TcColSearch||'').trim().toLowerCase();
  var opts=cols.filter(function(f){ return !q||f.label.toLowerCase().indexOf(q)>=0; }).map(function(f){
    var on=_e3TcColShown(f.id);
    // div 영역 전체가 클릭 감지 — grip 핸들은 pointer-events:none 로 클릭 이벤트 차단(드래그는 draggable 속성이라 별도로 동작)
    return '<div draggable="true" data-colid="'+f.id+'" onclick="e3TcColVisToggle(\''+f.id+'\')" ondragstart="_e3TcColDragStart(event,\''+f.id+'\')" ondragover="_e3TcColDragOver(event)" ondrop="_e3TcColDrop(event,\''+f.id+'\')" style="display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:6px;cursor:pointer;" onmouseenter="this.style.background=\'#f5f7fb\'" onmouseleave="this.style.background=\'transparent\'">'
      +'<i class="ti ti-grip-vertical" style="font-size:13px;color:#c7ccd6;cursor:grab;flex-shrink:0;pointer-events:none;"></i>'
      +'<span style="width:15px;height:15px;border-radius:4px;border:1.5px solid '+(on?'#2d6fd4':'#c7ccd6')+';background:'+(on?'#2d6fd4':'#fff')+';display:flex;align-items:center;justify-content:center;flex-shrink:0;pointer-events:none;">'+(on?'<i class="ti ti-check" style="font-size:10px;color:#fff;"></i>':'')+'</span>'
      +'<span style="flex:1;font-size:12.5px;pointer-events:none;'+(f.sys?'color:var(--text2);':'color:var(--text);')+'">'+_bdEsc(f.label)+'</span></div>';
  }).join('');
  if(!opts) opts='<div style="padding:14px 8px;text-align:center;color:var(--text3);font-size:11.5px;">일치하는 열이 없습니다</div>';
  return '<div style="padding:8px 8px 6px;">'
    +'<div style="position:relative;">'
      +'<i class="ti ti-search" style="position:absolute;left:8px;top:50%;transform:translateY(-50%);font-size:13px;color:#b8bcc9;"></i>'
      +'<input id="e3-tc-col-search" value="'+_bdEsc(_e3TcColSearch)+'" oninput="_e3TcColSearchInput(this.value)" placeholder="Search..." style="width:100%;box-sizing:border-box;font-size:12px;padding:6px 8px 6px 26px;border:1px solid var(--border);border-radius:6px;outline:none;">'
    +'</div>'
    +'<div onclick="_e3TcColRestoreDefaults()" style="margin-top:7px;font-size:11.5px;font-weight:700;color:#2d6fd4;cursor:pointer;">Restore defaults</div>'
  +'</div>'
  +'<div style="height:1px;background:var(--border);"></div>'
  +'<div style="padding:6px 4px;max-height:520px;overflow-y:auto;">'+opts+'</div>';
}
function _e3TcColSearchInput(v){
  _e3TcColSearch=v;
  var pop=document.getElementById('e3-tc-col-pop'); if(!pop) return;
  pop.innerHTML=_e3TcColPopHtml();
  var inp=document.getElementById('e3-tc-col-search'); if(inp){ inp.focus(); var l=inp.value.length; try{inp.setSelectionRange(l,l);}catch(e){} }
}
function _e3TcColRestoreDefaults(){
  e3TcColVis=null; e3TcColOrder=[];
  try{ localStorage.removeItem(_e3TcColKey()); localStorage.removeItem(_e3TcColOrderKey()); }catch(e){}
  var pop=document.getElementById('e3-tc-col-pop'); if(pop) pop.innerHTML=_e3TcColPopHtml();
  e3RebuildTcBody();
  if(typeof showToast==='function')showToast('기본 설정(모두 숨김)으로 복원되었습니다');
}
var _e3TcColDragId=null;
function _e3TcColDragStart(ev,id){ _e3TcColDragId=id; try{ ev.dataTransfer.effectAllowed='move'; }catch(e){} }
function _e3TcColDragOver(ev){ ev.preventDefault(); }
function _e3TcColDrop(ev,targetId){
  ev.preventDefault();
  var dragId=_e3TcColDragId; _e3TcColDragId=null;
  if(!dragId||dragId===targetId) return;
  var cols=e3TcColDefs().map(function(f){ return f.id; });
  var from=cols.indexOf(dragId), to=cols.indexOf(targetId);
  if(from<0||to<0) return;
  cols.splice(to,0,cols.splice(from,1)[0]);
  e3TcColOrder=cols;
  try{ localStorage.setItem(_e3TcColOrderKey(),JSON.stringify(e3TcColOrder)); }catch(e){}
  var pop=document.getElementById('e3-tc-col-pop'); if(pop) pop.innerHTML=_e3TcColPopHtml();
  e3RebuildTcBody();
}
function e3TcColMenuOpen(ev){
  ev.stopPropagation();
  var p=document.getElementById('e3-tc-col-pop'); if(!p) return;
  var isOpen=p.style.display!=='none';
  if(isOpen){ p.style.display='none'; document.removeEventListener('mousedown',_e3TcColPopOutside,true); return; }
  _e3TcColSearch='';
  p.style.display='flex';
  p.innerHTML=_e3TcColPopHtml();
  var inp=document.getElementById('e3-tc-col-search'); if(inp) inp.focus();
  // capture 단계로 등록 → mousedown 이 pop 안에서 시작됐는지 재렌더 전에 정확히 판정
  setTimeout(function(){ document.addEventListener('mousedown',_e3TcColPopOutside,true); },0);
}
function _e3TcColPopOutside(ev){
  var p=document.getElementById('e3-tc-col-pop');
  // ev.target 은 mousedown 시점의 원래 요소 → 이 시점엔 아직 e3RebuildTcBody 실행 전이라 정확
  if(p && !p.contains(ev.target) && !ev.target.closest('button[onclick*="e3TcColMenuOpen"]')){
    p.style.display='none';
    document.removeEventListener('mousedown',_e3TcColPopOutside,true);
  }
}
function e3TcColVisToggle(fieldId){
  _e3TcColLoadIfNeeded();
  if(!e3TcColVis) e3TcColVis={};
  var willShow=!_e3TcColShown(fieldId);
  e3TcColVis[fieldId]=willShow;
  // 체크 순서대로 오른쪽에 추가 · 해제 시 순서 목록에서 제거
  if(!Array.isArray(e3TcColOrder)) e3TcColOrder=[];
  var _i=e3TcColOrder.indexOf(fieldId);
  if(willShow){ if(_i<0) e3TcColOrder.push(fieldId); }
  else { if(_i>=0) e3TcColOrder.splice(_i,1); }
  // 1) body 만 재렌더 (툴바는 건드리지 않음 — 팝업이 툴바 안에 있어 함께 교체되면 닫히는 문제 방지)
  var tb=document.getElementById('e3-tc-body'); if(tb) tb.innerHTML=e3TcListHtml();
  var pg=document.getElementById('e3-tc-pager'); if(pg) pg.innerHTML=e3TcPagerCache||'';
  var bd=document.getElementById('e3-tc-badges'); if(bd) bd.outerHTML=e3TcCountBadges();
  // 2) 팝업의 체크 아이콘만 DOM 직접 수정 (innerHTML 재조립 없이) — 팝업이 열려 있어도 부드럽게 반영
  // row 안 첫 번째 span (체크박스 사각형) 이 대상. grip 아이콘(i) 다음에 오는 span.
  try{
    var pop=document.getElementById('e3-tc-col-pop');
    if(pop){
      var row=pop.querySelector('[data-colid="'+fieldId+'"]');
      if(row){
        var box=row.querySelector('span');
        if(box){
          box.style.background=willShow?'#2d6fd4':'#fff';
          box.style.borderColor=willShow?'#2d6fd4':'#c7ccd6';
          box.innerHTML=willShow?'<i class="ti ti-check" style="font-size:10px;color:#fff;"></i>':'';
        }
      }
    }
  }catch(_e){}
  // 3) localStorage 저장은 다음 이벤트 루프로 미룸 — 클릭 반응성 향상 (동기 저장이 rebuild 뒤에 들어가면 미묘한 렉)
  setTimeout(function(){
    try{ localStorage.setItem(_e3TcColKey(),JSON.stringify(e3TcColVis)); }catch(e){}
    try{ localStorage.setItem(_e3TcColOrderKey(),JSON.stringify(e3TcColOrder)); }catch(e){}
  },0);
  // 4) 팝업 유지 — e3RebuildTcBody 로 인해 팝업이 닫히거나 위치가 사라지는 경우 대비 강제 표시
  try{
    var _pop2=document.getElementById('e3-tc-col-pop');
    if(_pop2 && _pop2.style.display==='none'){ _pop2.style.display='flex'; }
  }catch(_e){}
}

// Beta 액션에 대응하는 원본 alias — 이미 정의되어 있으면 그걸 우선 사용, 없으면 Beta 함수를 그대로 호출.
function e3FocusBulkEdit(){ if(typeof e3bFocusBulkEdit==='function'){ return e3bFocusBulkEdit(); } if(typeof showToast==='function')showToast('Edit in bulk 는 Beta 페이지에서 지원됩니다'); }
function e3ExportTcsPDF(arr){ if(typeof e3bExportTcsPDF==='function'){ return e3bExportTcsPDF(arr); } if(typeof exportTcsPdf==='function'){ return exportTcsPdf(arr); } }
function e3ExportTcsExcel(arr){ if(typeof e3bExportTcsExcel==='function'){ return e3bExportTcsExcel(arr); } if(typeof exportTcsExcel==='function'){ return exportTcsExcel(arr); } }
// e3BulkDeleteTcs 는 위(라인 2934)에 e3SelTcs 를 사용하는 진짜 구현이 있으니 여기선 override 하지 않는다.
// (예전에는 alias 로 e3bBulkDeleteTcs 를 호출했지만 e3bSelTcs / e3SelTcs 상태 분리 때문에 삭제 대상이 빈 배열이 되는 버그)
// 현재 선택된 REQ의 폴더 ID (REQ 추가 시 폴더 기준)
function e3GetCurFolderId(){ var r=(reqList||[]).find(function(x){return x.id===e3SelReq;}); return r?r.folder:null; }
// 툴바 토글
function e3ToggleReqToolbar(){ var t=document.getElementById('e3-req-toolbar'); if(t) t.style.display=(t.style.display==='none'?'block':'none'); }
// sessionStorage 는 새로고침·탭 전환 시 유실될 수 있어 localStorage 에도 이중 저장. 폴더/접힘/페이지 상태까지 함께 유지.
// 사용자별 키 (로그인 사용자 이름을 접미어로) — 다른 사용자가 로그인해도 각자 접기 상태 유지
function _e3UsrSuffix(){
  var u='';
  try{ if(typeof currentUser!=='undefined'&&currentUser) u=currentUser.name||currentUser.username||''; }catch(_e){}
  return '::'+(u||'anon');
}
function e3SaveSession(){
  try{
    var suf=_e3UsrSuffix();
    var ss=[window.sessionStorage, window.localStorage];
    ss.forEach(function(st){
      if(!st) return;
      if(e3SelReq) st.setItem('utop_e3_req', e3SelReq); else st.removeItem('utop_e3_req');
      if(e3SelTc) st.setItem('utop_e3_tc', e3SelTc); else st.removeItem('utop_e3_tc');
      if(e3SelFolder) st.setItem('utop_e3_folder', e3SelFolder); else st.removeItem('utop_e3_folder');
      // 접힘 집합은 사용자별 키로 저장 (localStorage 에만 — 새로고침·재로그인 후에도 유지)
      var arr=Array.from(e3Closed||[]);
      st.setItem('utop_e3_closed'+suf, JSON.stringify(arr));
      // 하위 호환: 옛 전역 키에도 백업(다음 릴리즈에서 제거 가능)
      st.setItem('utop_e3_closed', JSON.stringify(arr));
    });
  }catch(e){}
}
// 폴더 fid 의 조상 폴더 체인을 접힘 집합에서 전부 제거 → 선택된 REQ/폴더가 접혀서 안 보이는 문제 방지
function e3UnfoldTo(fid){
  if(e3Closed===null) e3Closed=new Set();
  var f=reqFolders.find(function(x){return x.id===fid;});
  var guard=0;
  while(f&&guard++<50){
    e3Closed.delete(f.id);
    f=f.parent?reqFolders.find(function(x){return x.id===f.parent;}):null;
  }
}
function e3LoadSession(){
  try{
    var get=function(k){ var v=null; try{ v=sessionStorage.getItem(k); }catch(e){} if(v===null||v===undefined){ try{ v=localStorage.getItem(k); }catch(e){} } return v; };
    if(!e3SelReq){ var r=get('utop_e3_req'); if(r&&reqList.find(function(x){return x.id===r;})) e3SelReq=r; }
    if(!e3SelTc){ var t=get('utop_e3_tc'); if(t&&tcList.find(function(x){return (x.tcid||x.id)===t;})) e3SelTc=t; }
    if(!e3SelFolder){ var f=get('utop_e3_folder'); if(f&&reqFolders.find(function(x){return x.id===f;})) e3SelFolder=f; }
    if(e3Closed===null){
      var suf=_e3UsrSuffix();
      // 사용자별 키 우선 → 없으면 하위 호환 전역 키
      var c=get('utop_e3_closed'+suf) || get('utop_e3_closed');
      if(c){ try{ e3Closed=new Set(JSON.parse(c)); }catch(e2){} }
    }
    // 복원된 선택이 접힌 폴더 안에 있으면 그 조상까지 펼쳐서 트리에 보이게 함
    if(e3SelReq){ var rq=reqList.find(function(x){return x.id===e3SelReq;}); if(rq&&rq.folder) e3UnfoldTo(rq.folder); }
    else if(e3SelFolder){ e3UnfoldTo(e3SelFolder); }
  }catch(e){}
}
// ============================================================================
// 자체 도킹 시스템 — 3개 카드(REQ/TC/Detail) 를 트리 구조로 관리.
// 트리: {type:'row'|'col', size:비율, children:[node,...]} 또는 {type:'leaf', id:1|2|3, size:비율}
// 헤더 드래그로 다른 카드의 상/하/좌/우 영역에 드롭 → 새 트리로 재구성 → 재렌더.
// 사용자별 저장(localStorage, currentUser.name 포함). 기본값은 3열 row.
// ============================================================================
function _e3LayoutKey(){
  var u='';
  try{ if(typeof currentUser!=='undefined'&&currentUser) u=currentUser.name||currentUser.username||''; }catch(_e){}
  return 'utop_e3_dock_layout::'+(u||'anon');
}
function _e3DefaultLayout(){
  return {type:'row', children:[
    {type:'leaf', id:1, size:20},
    {type:'leaf', id:2, size:35},
    {type:'leaf', id:3, size:45}
  ]};
}
var _e3Layout=null;
function _e3LoadLayout(){
  try{ var s=localStorage.getItem(_e3LayoutKey()); if(s){ var o=JSON.parse(s); if(o&&(o.type==='row'||o.type==='col'||o.type==='leaf')) return o; } }catch(_e){}
  return _e3DefaultLayout();
}
function _e3SaveLayout(){ try{ localStorage.setItem(_e3LayoutKey(), JSON.stringify(_e3Layout)); }catch(_e){} }
function e3ResetDockLayout(){
  try{ localStorage.removeItem(_e3LayoutKey()); }catch(_e){}
  _e3Layout=_e3DefaultLayout(); _e3SaveLayout(); renderExplorer3();
  if(typeof showToast==='function') showToast('레이아웃을 기본값으로 복원했습니다');
}
// 트리에서 leaf id 의 부모와 자기 인덱스 찾기 · leaf 를 제거하고 트리 정규화(1자식 컨테이너 → leaf 로 승격)
function _e3FindLeaf(node, id, parent, idx){
  if(!node) return null;
  if(node.type==='leaf'){ return node.id===id?{node:node,parent:parent,idx:idx}:null; }
  var ch=node.children||[];
  for(var i=0;i<ch.length;i++){ var r=_e3FindLeaf(ch[i], id, node, i); if(r) return r; }
  return null;
}
function _e3RemoveLeaf(root, id){
  // 트리에서 leaf 하나 제거. 부모의 children 이 1개만 남으면 그 자식으로 부모 치환. root 자체가 leaf 였으면 null.
  function walk(node, parent, idx){
    if(node.type==='leaf'){
      if(node.id===id){ if(parent){ parent.children.splice(idx,1); return true; } return true; }
      return false;
    }
    var ch=node.children||[];
    for(var i=0;i<ch.length;i++){ if(walk(ch[i], node, i)) return true; }
    return false;
  }
  walk(root, null, -1);
  // 정규화: children 이 1개만 남은 컨테이너는 자식으로 대체
  function normalize(node){
    if(!node||node.type==='leaf') return node;
    node.children=(node.children||[]).map(normalize);
    if(node.children.length===1){ return node.children[0]; }
    return node;
  }
  return normalize(root);
}
// side: 'left'|'right'|'top'|'bottom' — targetId 옆에 sourceLeaf(제거 후 새 leaf) 삽입.
function _e3InsertBeside(root, targetId, srcLeaf, side){
  var loc=_e3FindLeaf(root, targetId, null, -1); if(!loc) return root;
  var wantAxis=(side==='left'||side==='right')?'row':'col';
  var wantAfter=(side==='right'||side==='bottom');
  var newLeaf={type:'leaf', id:srcLeaf.id, size:50};
  var target=loc.node;
  target.size=50;
  if(loc.parent && loc.parent.type===wantAxis){
    // 이미 원하는 축의 컨테이너에 속함 → 형제로 삽입
    var _ch=loc.parent.children;
    var _pos=wantAfter?(loc.idx+1):loc.idx;
    _ch.splice(_pos,0,newLeaf);
    // 형제 사이 size 재정규화
    _redistributeSize(_ch);
    return root;
  }
  // 다른 축이거나 부모가 없음 → 이 위치에 새 컨테이너로 감쌈
  var container={type:wantAxis, children: wantAfter?[target,newLeaf]:[newLeaf,target]};
  _redistributeSize(container.children);
  if(loc.parent){
    loc.parent.children[loc.idx]=container;
    return root;
  }
  // target 이 root 였음
  return container;
}
function _redistributeSize(children){
  if(!children||!children.length) return;
  var per=Math.floor(100/children.length);
  var rem=100-per*children.length;
  children.forEach(function(c,i){ c.size=per+(i===0?rem:0); });
}
// leaf 를 다른 leaf 옆으로 이동 (원래 위치에서 뽑아 새 위치에 삽입)
function _e3MoveLeaf(root, sourceId, targetId, side){
  if(sourceId===targetId) return root;
  var srcLoc=_e3FindLeaf(root, sourceId, null, -1); if(!srcLoc) return root;
  var srcLeaf={type:'leaf', id:sourceId, size:srcLoc.node.size||30};
  var newRoot=_e3RemoveLeaf(root, sourceId);
  if(!newRoot) newRoot=srcLeaf;
  // 타겟이 여전히 있는지 확인 후 삽입
  if(_e3FindLeaf(newRoot, targetId, null, -1)){
    return _e3InsertBeside(newRoot, targetId, srcLeaf, side);
  }
  // 타겟이 사라졌으면(정규화로 부모가 leaf 로 승격 등) 그냥 root 옆에 삽입
  var _wantAxis=(side==='left'||side==='right')?'row':'col';
  var _after=(side==='right'||side==='bottom');
  if(newRoot.type===_wantAxis){
    _after?newRoot.children.push(srcLeaf):newRoot.children.unshift(srcLeaf);
    _redistributeSize(newRoot.children);
    return newRoot;
  }
  var _c={type:_wantAxis, children:_after?[newRoot,srcLeaf]:[srcLeaf,newRoot]};
  _redistributeSize(_c.children);
  return _c;
}

// 카드가 접힘 상태인지
function _e3IsCollapsed(id){
  if(id===1) return !!e3C1;
  if(id===2) return !!e3C2;
  if(id===3) return !!e3C3;
  return false;
}
// 접힘 상태 카드 — 좁은 세로 바 표시. 클릭 시 펼침. 원래 slot 자리에 그대로 남음(왼쪽으로 붙지 않음).
function _e3RenderCollapsedCard(id){
  var labels={1:{lbl:'REQUIREMENT',color:'#7c3aed'}, 2:{lbl:'COVERAGE',color:'#00875a'}, 3:{lbl:'TEST DETAILS',color:'#e8820c'}};
  var m=labels[id]||{lbl:'',color:'#666'};
  return '<div id="e3-col-'+id+'" data-leaf="'+id+'" onclick="e3ToggleCol('+id+')" title="'+m.lbl+' 펼치기" '
    +'style="width:44px;background:#fff;border:1px solid var(--border);border-radius:12px;box-shadow:0 2px 10px rgba(40,50,90,0.06);cursor:pointer;display:flex;flex-direction:column;align-items:center;padding:14px 6px 10px;gap:12px;height:100%;">'
    +'<i class="ti ti-chevron-right" style="color:'+m.color+';font-size:16px;"></i>'
    +'<span style="writing-mode:vertical-rl;font-size:11.5px;font-weight:800;color:'+m.color+';letter-spacing:1.5px;">'+m.lbl+'</span>'
    +'</div>';
}
// 카드 HTML 생성 — id=1(REQ)·2(TC)·3(Detail). 헤더에 draggable, body 에 도킹 프리뷰 감지 handler.
function _e3RenderCard(id){
  if(_e3IsCollapsed(id)) return _e3RenderCollapsedCard(id);
  var _card='background:#fff;border:1px solid var(--border);border-radius:12px;box-shadow:0 2px 10px rgba(40,50,90,0.06);overflow:hidden;display:flex;flex-direction:column;height:100%;width:100%;min-width:0;min-height:0;position:relative;';
  var inner='';
  if(id===1){
    inner=_e3ReqPanelHdr()
      +'<div id="e3-req-body" ondragover="e3RootDragOver(event)" ondragleave="e3RootDragLeave(event)" ondrop="e3DropOnRoot(event)" style="flex:1;overflow:auto;padding:5px 6px;">'+e3TreeHtml()+'</div>';
  } else if(id===2){
    inner=_e3TcPanelHdr()
      +'<div id="e3-tc-body" oncontextmenu="e3TcBodyCtx(event)" style="flex:1;overflow:auto;">'+e3TcListHtml()+'</div>'
      +'<div id="e3-tc-pager" style="flex-shrink:0;">'+(e3TcPagerCache||'')+'</div>';
  } else {
    // Detail 카드 상단에 헤더 바 추가 — 이 헤더로 도킹 드래그 가능. REQ/Coverage 헤더와 동일 스타일.
    inner=_e3DetailPanelHdr()
      +'<div id="e3-detail" style="flex:1;display:flex;flex-direction:column;min-height:0;overflow:hidden;"></div>';
  }
  return '<div id="e3-col-'+id+'" class="e3-card" data-leaf="'+id+'" onclick="_e3SetFocus('+id+')" style="'+_card+'">'+inner+'</div>';
}

// 트리를 CSS flex/grid HTML 로 렌더 (재귀).
// 접힘 leaf 는 자기 자리(트리상 원래 위치)에 좁은 리본 카드로 남음. 리사이저는 접힘 leaf 옆엔 표시 안 함.
function _e3RenderTree(node){
  if(!node) return '';
  if(node.type==='leaf'){
    return _e3RenderCard(node.id);   // 접힘도 원래 자리에 리본으로
  }
  var dir=node.type==='row'?'row':'column';
  // 완전히 접혀서 아무것도 남지 않는 컨테이너만 스킵 (하위 leaf 는 접힘이어도 렌더됨)
  var visibleChildren=node.children||[];
  // size 재정규화 (합계 100 기준) — 접힘 leaf 는 flex 계산에서 제외 (고정 폭이라 sumSz 왜곡 방지)
  var sumSz=0; visibleChildren.forEach(function(c){
    if(c.type==='leaf' && _e3IsCollapsed(c.id)) return;
    sumSz+=(c.size||(100/visibleChildren.length));
  });
  if(sumSz<=0) sumSz=100;
  var h='<div class="e3-dock-container" style="display:flex;flex-direction:'+dir+';flex:1 1 auto;width:100%;height:100%;min-width:0;min-height:0;gap:6px;">';
  visibleChildren.forEach(function(ch,i){
    var rendered=_e3RenderTree(ch);
    if(!rendered) return;
    var isCollapsedLeaf=(ch.type==='leaf' && _e3IsCollapsed(ch.id));
    var slotStyle;
    if(isCollapsedLeaf){
      // 접힘 리본: 자기 자리 유지, 폭 고정(가로) 또는 높이 고정(세로)
      slotStyle=(dir==='row'
        ? 'flex:0 0 44px;'
        : 'flex:0 0 44px;')
        +'display:flex;flex-direction:column;min-width:0;min-height:0;position:relative;';
    } else {
      var sz=Math.max(5, ((ch.size||(100/visibleChildren.length))/sumSz)*100);
      slotStyle='flex:1 1 '+sz+'%;display:flex;flex-direction:column;min-width:0;min-height:0;position:relative;';
    }
    h+='<div class="e3-dock-slot" data-slot-idx="'+i+'"'+(isCollapsedLeaf?' data-collapsed="1"':'')+' style="'+slotStyle+'">'+rendered+'</div>';
    // 형제 사이 리사이저 (마지막 자식 뒤엔 없음; 접힘 leaf 양옆엔 붙이지 않음)
    var next=visibleChildren[i+1];
    var nextIsCollapsed=(next && next.type==='leaf' && _e3IsCollapsed(next.id));
    if(i<visibleChildren.length-1 && !isCollapsedLeaf && !nextIsCollapsed){
      var isRow=(dir==='row');
      h+='<div class="e3-dock-resizer" data-axis="'+(isRow?'x':'y')+'" onmousedown="_e3DockResizeStart(event,this)" title="드래그로 크기 조절" style="'
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
// 접힘 리본은 이제 각 leaf 의 원래 slot 자리에 렌더링됨 (_e3RenderTree). 이 함수는 하위 호환용으로 빈 문자열 반환.
function _e3RenderCollapsedRibbons(){ return ''; }
function _e3RenderCollapsedRibbons_LEGACY(){
  var labels={1:{lbl:'REQUIREMENT',color:'#7c3aed',side:'left'}, 2:{lbl:'COVERAGE',color:'#00875a',side:'left'}, 3:{lbl:'TEST DETAILS',color:'#e8820c',side:'right'}};
  var h='';
  // 같은 쪽에 여러 개가 접혔을 때 겹치지 않게 offset 누적
  var _offsetLeft=12, _offsetRight=12;
  [1,2,3].forEach(function(id){
    if(!_e3IsCollapsed(id)) return;
    var m=labels[id];
    var _off=(m.side==='right')?_offsetRight:_offsetLeft;
    if(m.side==='right') _offsetRight+=48; else _offsetLeft+=48;
    var sideCss=m.side==='right'?('right:'+_off+'px;'):('left:'+_off+'px;');
    h+='<div onclick="e3ToggleCol('+id+')" title="'+m.lbl+' 펼치기" '
      +'style="position:absolute;top:12px;bottom:12px;'+sideCss+'width:38px;background:#fff;border:1px solid var(--border);border-radius:12px;box-shadow:0 2px 10px rgba(40,50,90,0.06);cursor:pointer;display:flex;flex-direction:column;align-items:center;padding:12px 4px 12px;gap:12px;z-index:20;">'
      +'<i class="ti ti-chevron-'+(m.side==='right'?'left':'right')+'" style="color:'+m.color+';font-size:16px;"></i>'
      +'<span style="writing-mode:vertical-rl;font-size:11.5px;font-weight:800;color:'+m.color+';letter-spacing:1.5px;">'+m.lbl+'</span>'
      +'</div>';
  });
  return h;
}

// 리사이저 드래그 — 형제 두 슬롯의 flex-basis 를 조정. 저장은 up 시.
function _e3DockResizeStart(ev, handle){
  ev.preventDefault(); ev.stopPropagation();
  var prev=handle.previousElementSibling, next=handle.nextElementSibling;
  if(!prev||!next) return;
  var axis=handle.getAttribute('data-axis');   // 'x' or 'y'
  var parent=handle.parentNode;
  var rect=parent.getBoundingClientRect();
  var startPos=(axis==='x')?ev.clientX:ev.clientY;
  var startPrev=(axis==='x')?prev.getBoundingClientRect().width:prev.getBoundingClientRect().height;
  var startNext=(axis==='x')?next.getBoundingClientRect().width:next.getBoundingClientRect().height;
  var total=(axis==='x')?rect.width:rect.height;
  var MIN=100;
  var ov=document.createElement('div'); ov.id='e3-resize-ov';
  ov.style.cssText='position:fixed;inset:0;z-index:99999;cursor:'+(axis==='x'?'col-resize':'row-resize')+';';
  document.body.appendChild(ov);
  var _pu=document.body.style.userSelect; document.body.style.userSelect='none';
  function mv(e){
    var d=(axis==='x')?(e.clientX-startPos):(e.clientY-startPos);
    var nPrev=Math.max(MIN, Math.min(total-MIN, startPrev+d));
    var nNext=startPrev+startNext-nPrev;
    prev.style.flex='1 1 '+((nPrev/total)*100)+'%';
    next.style.flex='1 1 '+((nNext/total)*100)+'%';
  }
  function up(){
    document.removeEventListener('mousemove',mv);
    document.removeEventListener('mouseup',up);
    var _ov=document.getElementById('e3-resize-ov'); if(_ov&&_ov.parentNode) _ov.parentNode.removeChild(_ov);
    document.body.style.userSelect=_pu||'';
    // 모든 slot 들의 현재 실제 크기를 트리 size 에 반영 후 저장
    try{ _e3ApplySizesFromDom(); }catch(_e){}
    try{ _e3SaveLayout(); }catch(_e){}
  }
  document.addEventListener('mousemove',mv);
  document.addEventListener('mouseup',up);
}
// 현재 DOM 의 slot flex-basis 를 트리에 반영 (전체 순회)
function _e3ApplySizesFromDom(){
  function walk(node, container){
    if(!node||node.type==='leaf') return;
    var slots=Array.from(container.children).filter(function(c){return c.classList.contains('e3-dock-slot');});
    var total=(node.type==='row')?container.getBoundingClientRect().width:container.getBoundingClientRect().height;
    (node.children||[]).forEach(function(ch,i){
      var sl=slots[i]; if(!sl) return;
      var r=(node.type==='row')?sl.getBoundingClientRect().width:sl.getBoundingClientRect().height;
      ch.size=Math.max(5, (r/total)*100);
      if(ch.type!=='leaf'){ var inner=sl.querySelector('.e3-dock-container'); if(inner) walk(ch, inner); }
    });
  }
  var root=document.getElementById('e3-dock-root'); if(!root) return;
  if(_e3Layout.type==='leaf') return;
  // dock-root 의 직접 자식은 최상위 컨테이너(.e3-dock-container) 이므로 그것을 walk 의 컨테이너로 사용.
  var topContainer=root.querySelector(':scope > .e3-dock-container');
  if(!topContainer) return;
  walk(_e3Layout, topContainer);
}

// 도킹 드래그 — 헤더에서 시작. 다른 카드 위 mouseenter 시 4방향 프리뷰 오버레이 표시. 드롭 시 트리 재구성.
var _e3DragSrc=null;
var _e3DragOverlay=null;
function _e3DockDragStart(ev, id){
  _e3DragSrc=id;
  try{ ev.dataTransfer.effectAllowed='move'; ev.dataTransfer.setData('text/plain','e3-'+id); }catch(_e){}
  // 원본 카드는 그대로 두고(브라우저 기본 드래그 이미지 사용), 원본 카드 위에 "이동 중" 표식(반투명 + 잠금)
  try{
    var srcCard=document.getElementById('e3-col-'+id);
    if(srcCard){
      srcCard.style.opacity='0.35';
      srcCard.style.filter='saturate(0.6)';
      srcCard.style.transition='opacity 0.12s';
      srcCard._e3DragOn=true;
    }
  }catch(_e){}
}
function _e3DockDragEnd(){
  // 원본 카드 시각 복원
  try{
    [1,2,3].forEach(function(id){ var c=document.getElementById('e3-col-'+id); if(c&&c._e3DragOn){ c.style.opacity=''; c.style.filter=''; c._e3DragOn=false; } });
  }catch(_e){}
  _e3DragSrc=null; _e3HideDockOverlay();
}
function _e3DockDragOver(ev, targetId){
  if(_e3DragSrc==null||_e3DragSrc===targetId) return;
  ev.preventDefault();
  try{ ev.dataTransfer.dropEffect='move'; }catch(_e){}
  // 마우스 위치 기준으로 4방향 판정 → 카드 위에 반투명 파란 프리뷰
  var card=ev.currentTarget;
  var r=card.getBoundingClientRect();
  var x=(ev.clientX-r.left)/r.width, y=(ev.clientY-r.top)/r.height;
  var side;
  // 중앙 60% 는 방향 판정 애매 → 대각선 기준 (|x-.5| vs |y-.5|)
  if(Math.abs(x-0.5) > Math.abs(y-0.5)){ side=(x<0.5)?'left':'right'; }
  else { side=(y<0.5)?'top':'bottom'; }
  _e3ShowDockOverlay(card, side);
  card._e3PendingSide=side;
}
function _e3DockDragLeave(ev, targetId){
  // 다른 요소로 이동한 경우만 프리뷰 제거 (자식 요소 이동 시엔 유지)
  var rt=ev.relatedTarget;
  if(rt && ev.currentTarget.contains(rt)) return;
  _e3HideDockOverlay();
}
function _e3DockDrop(ev, targetId){
  ev.preventDefault();
  var side=ev.currentTarget._e3PendingSide||'right';
  _e3HideDockOverlay();
  var src=_e3DragSrc; _e3DragSrc=null;
  if(src==null||src===targetId) return;
  // 트리 재구성 → 재렌더
  _e3ApplySizesFromDom();   // 현재 리사이즈 결과 먼저 반영
  _e3Layout=_e3MoveLeaf(_e3Layout, src, targetId, side);
  _e3SaveLayout();
  renderExplorer3();
}
// 드롭 프리뷰 — 도킹 후 "전체 화면 배치" 를 그대로 반투명으로 표시.
// 방법: 트리 재구성 시뮬레이션 → dock-root 영역 내에서 각 leaf 의 정확한 위치·크기 계산 → 카드 이름 라벨과 함께 그림.
function _e3ShowDockOverlay(card, side){
  if(!_e3DragOverlay){
    _e3DragOverlay=document.createElement('div');
    _e3DragOverlay.id='e3-dock-overlay';
    // 도킹 프리뷰 컨테이너 — has-modal 오탐 방지를 위해 body 가 아닌 dock-root 안에 넣는다.
    // width/height 0 으로 시작(자식은 각자 fixed 좌표) → _isOverlay 판정 대상 안 됨.
    _e3DragOverlay.style.cssText='position:absolute;pointer-events:none;z-index:1000;width:0;height:0;left:0;top:0;';
    var _dr=document.getElementById('e3-dock-root')||document.body;
    _dr.appendChild(_e3DragOverlay);
  }
  var targetId=parseInt(card.getAttribute('data-leaf'));
  if(!targetId||!_e3DragSrc||_e3DragSrc===targetId){ _e3HideDockOverlay(); return; }
  // 현재 트리를 깊은 복사한 뒤 시뮬레이션
  var simTree=JSON.parse(JSON.stringify(_e3Layout));
  var newTree=_e3MoveLeaf(simTree, _e3DragSrc, targetId, side);
  // dock-root 영역 좌표 = 미리보기 캔버스 영역
  var root=document.getElementById('e3-dock-root'); if(!root){ _e3HideDockOverlay(); return; }
  var rr=root.getBoundingClientRect();
  // dock-root 는 padding:12px, gap:6px 규격 → 실제 카드 영역만 좁혀서 계산
  var _pad=12, _gap=6;
  var canvas={left:rr.left+_pad, top:rr.top+_pad, width:rr.width-_pad*2, height:rr.height-_pad*2};
  // 트리를 그대로 순회하며 각 leaf 의 좌표·크기 계산
  var boxes=[];   // {id, box, isSrc}
  function walk(node, box){
    if(!node) return;
    if(node.type==='leaf'){ boxes.push({id:node.id, box:box, isSrc:(node.id===_e3DragSrc)}); return; }
    var ch=node.children||[];
    if(!ch.length) return;
    // 총합에서 gap 을 뺀 나머지를 size 비율로 분배
    var isRow=(node.type==='row');
    var total=isRow?box.width:box.height;
    var innerTotal=total-_gap*(ch.length-1);
    // size 정규화 (합계 100 기준)
    var sumSz=0; ch.forEach(function(c){ sumSz+=(c.size||(100/ch.length)); });
    if(sumSz<=0) sumSz=100;
    var cursor=isRow?box.left:box.top;
    ch.forEach(function(c, i){
      var sz=(c.size||(100/ch.length))/sumSz;
      var span=Math.max(20, innerTotal*sz);
      var childBox=isRow
        ? {left:cursor, top:box.top, width:span, height:box.height}
        : {left:box.left, top:cursor, width:box.width, height:span};
      walk(c, childBox);
      cursor+=span+_gap;
    });
  }
  walk(newTree, canvas);
  var _names={1:'Requirements', 2:'Coverage', 3:'Detail'};
  var _colors={1:'#7c3aed', 2:'#00875a', 3:'#e8820c'};
  var _bgs={1:'rgba(124,58,237,0.18)', 2:'rgba(0,135,90,0.18)', 3:'rgba(232,130,12,0.18)'};
  _e3DragOverlay.style.display='block';
  var html='';
  boxes.forEach(function(b){
    var isSrc=b.isSrc;
    var border=isSrc?('2.5px solid '+_colors[b.id]):'2px dashed rgba(120,130,145,0.65)';
    var bg=isSrc?_bgs[b.id]:'rgba(255,255,255,0.55)';
    var shadow=isSrc?('box-shadow:0 0 0 3px '+_bgs[b.id]+';'):'';
    var color=_colors[b.id];
    // pointer-events:none — 프리뷰 카드가 클릭·드래그 이벤트 흡수하지 않도록 (top 메뉴 클릭 막힘 방지)
    html+='<div style="position:fixed;left:'+b.box.left+'px;top:'+b.box.top+'px;width:'+b.box.width+'px;height:'+b.box.height+'px;'
      +'border-radius:12px;background:'+bg+';border:'+border+';'+shadow
      +'display:flex;align-items:center;justify-content:center;font-size:'+(isSrc?'15px':'13px')+';font-weight:'+(isSrc?'900':'700')+';color:'+color+';text-shadow:0 1px 6px rgba(255,255,255,0.95);transition:all 0.12s ease;box-sizing:border-box;pointer-events:none;">'
      +_names[b.id]
      +'</div>';
  });
  _e3DragOverlay.innerHTML=html;
}
function _e3HideDockOverlay(){
  if(_e3DragOverlay){
    try{
      _e3DragOverlay.style.display='none';
      _e3DragOverlay.style.pointerEvents='none';
      _e3DragOverlay.innerHTML='';
    }catch(_e){}
  }
  // 리사이저 오버레이도 혹시 남아있으면 제거
  try{ var _ro=document.getElementById('e3-resize-ov'); if(_ro&&_ro.parentNode) _ro.parentNode.removeChild(_ro); }catch(_e){}
  // has-modal 오탐(대형 오버레이가 잠깐 표시됐다 사라진 뒤에도 클래스 남을 수 있음) 강제 해제
  try{ document.body.classList.remove('has-modal'); }catch(_e){}
}

function renderExplorer3(){
  var page=document.getElementById('page-explorer3'); if(!page) return;
  // 재렌더 전 스크롤 위치 저장 → 후에 복원
  var _lsGet=function(k){ try{ return parseInt(localStorage.getItem(k),10)||0; }catch(e){ return 0; } };
  var _prevScrolls={
    req:(function(){ var _e=document.getElementById('e3-req-body'); return _e?_e.scrollTop:_lsGet('utop_e3_scroll_req'); })(),
    tc:(function(){ var _e=document.getElementById('e3-tc-body'); return _e?_e.scrollTop:_lsGet('utop_e3_scroll_tc'); })(),
    detail:(function(){ var _e=document.querySelector('#e3-detail [data-exp-scroll]'); return _e?_e.scrollTop:_lsGet('utop_e3_scroll_detail'); })()
  };
  try{ if(typeof _rcSyncAccentFromLS==='function') _rcSyncAccentFromLS(); }catch(_){}
  try{ if(typeof _rcSyncBoldFromLS==='function') _rcSyncBoldFromLS(); }catch(_){}
  try{ if(typeof _rcSyncFontSizeFromLS==='function') _rcSyncFontSizeFromLS(); }catch(_){}
  try{ if(typeof _rcInjectStyleOverride==='function') _rcInjectStyleOverride(); }catch(_){}
  // 순서 주의: e3LoadSession 안에서 e3Closed===null 조건으로 저장된 접힘 상태를 읽음.
  // 따라서 반드시 e3Closed=new Set() 초기화 전에 로드 시도.
  e3LoadSession();
  if(e3Closed===null) e3Closed=new Set();
  if(e3SelTc){ var _tc=tcList.find(function(t){return (t.tcid||t.id)===e3SelTc;}); if(!_tc) e3SelTc=null; }
  if(e3SelTc){ var _tr=tcList.find(function(t){return (t.tcid||t.id)===e3SelTc;}); if(_tr&&_tr.req_id) e3SelReq=_tr.req_id; }
  // 도킹 드래그 상태 정리 — 재렌더 시 잔존 오버레이/드래그 플래그 확실히 제거 (top 메뉴 클릭 막힘 방지)
  try{
    _e3DragSrc=null; _e3HideDockOverlay();
    // 예전 body 에 붙어있던 오버레이가 있으면 제거 (has-modal 오탐 방지)
    var _oldOv=document.getElementById('e3-dock-overlay');
    if(_oldOv && _oldOv.parentNode===document.body){ _oldOv.parentNode.removeChild(_oldOv); }
    _e3DragOverlay=null;
    // 그 여파로 남은 body.has-modal 강제 해제
    try{ document.body.classList.remove('has-modal'); }catch(_e2){}
  }catch(_e){}
  // 레이아웃 트리 로드 (사용자별)
  if(!_e3Layout) _e3Layout=_e3LoadLayout();
  // 접힘 리본은 각 leaf 원래 slot 위치에 인라인으로 남아있음 → dock-root padding 은 균일하게.
  var h='<div id="e3-dock-root" style="flex:1;display:flex;height:100%;width:100%;padding:12px;background:var(--bg);box-sizing:border-box;position:relative;">'+_e3RenderTree(_e3Layout)+'</div>';
  page.innerHTML=h;
  // 각 카드의 헤더에 draggable + drop handler 부착 (도킹용). 리사이저는 이미 인라인 handler.
  try{
    [1,2,3].forEach(function(id){
      var card=document.getElementById('e3-col-'+id); if(!card) return;
      // 도킹 드래그 핸들 — data-dock-handle="1" 표식 있는 요소가 있으면 그것만, 없으면 카드 첫 자식 전체
      var hdr=card.firstElementChild;
      var attachHandle=function(h){
        if(!h||h._e3DockOn) return; h._e3DockOn=true;
        h.setAttribute('draggable','true');
        h.style.cursor='grab';
        h.title=(h.title?h.title+' · ':'')+'헤더를 다른 카드로 드래그하면 상/하/좌/우로 도킹';
        h.addEventListener('dragstart', function(ev){ _e3DockDragStart(ev, id); });
        h.addEventListener('dragend', _e3DockDragEnd);
      };
      // 명시 handle 우선 (Requirements 카드 등)
      var explicitHandle=card.querySelector('[data-dock-handle="1"]');
      if(explicitHandle){ attachHandle(explicitHandle); }
      else if(hdr){ attachHandle(hdr); }
      // 드롭 대상은 카드 전체 (도킹 미리보기·드롭)
      card.addEventListener('dragover', function(ev){ _e3DockDragOver(ev, id); });
      card.addEventListener('dragleave', function(ev){ _e3DockDragLeave(ev, id); });
      card.addEventListener('drop', function(ev){ _e3DockDrop(ev, id); });
    });
  }catch(_e){}
  // 저장해둔 스크롤 위치 복원
  try{
    if(_prevScrolls.req){ var _rb=document.getElementById('e3-req-body'); if(_rb) _rb.scrollTop=_prevScrolls.req; }
    if(_prevScrolls.tc){ var _tb=document.getElementById('e3-tc-body'); if(_tb) _tb.scrollTop=_prevScrolls.tc; }
    if(_prevScrolls.detail){
      requestAnimationFrame(function(){ var _dt=document.querySelector('#e3-detail [data-exp-scroll]'); if(_dt) _dt.scrollTop=_prevScrolls.detail; });
    }
  }catch(_e){}
  try{
    var _atach=function(id, key){
      var el=document.getElementById(id); if(!el||el._scListenerOn) return;
      el._scListenerOn=true;
      var _t=null;
      el.addEventListener('scroll', function(){
        clearTimeout(_t);
        _t=setTimeout(function(){ try{ localStorage.setItem(key, String(el.scrollTop||0)); }catch(_){} }, 120);
      });
    };
    _atach('e3-req-body','utop_e3_scroll_req');
    _atach('e3-tc-body','utop_e3_scroll_tc');
  }catch(_e){}
  e3RenderPane();
  setTimeout(_e3FocusUI,20);
}
function e3PickReq(rid){ e3SelReq=rid; e3SelTc=null; e3SelFolder=null; e3SelTcs.clear(); e3SaveSession(); e3RebuildReqBody(); var tb=document.getElementById('e3-tc-body'); if(tb)tb.innerHTML=e3TcListHtml(); var bd=document.getElementById('e3-tc-badges'); if(bd)bd.outerHTML=e3TcCountBadges(); e3RenderPane(); }
function e3PickTc(tcid){ e3SelTc=tcid; e3SelTcs.clear(); e3SaveSession(); var tb=document.getElementById('e3-tc-body'); if(tb)tb.innerHTML=e3TcListHtml(); e3RenderPane(); }
function e3ToggleFolder(fid){ if(e3Closed===null)e3Closed=new Set(); if(e3Closed.has(fid))e3Closed.delete(fid); else e3Closed.add(fid); e3SaveSession(); e3RebuildReqBody(); }
// 폴더명 클릭: 하위 전체 TC를 Coverage 열에 표시
function e3PickFolder(fid){
  e3SelFolder=fid; e3SelReq=null; e3SelTc=null; e3SelTcs.clear();
  e3SaveSession();
  e3RebuildReqBody();
  var tb=document.getElementById('e3-tc-body'); if(tb)tb.innerHTML=e3TcListHtml();
  var bd=document.getElementById('e3-tc-badges'); if(bd)bd.outerHTML=e3TcCountBadges();
  var w=document.getElementById('e3-detail');
  if(w) w.innerHTML='<div style="flex:1;display:flex;align-items:center;justify-content:center;height:100%;color:var(--text3);font-size:13px;">TC를 선택하면 상세가 표시됩니다</div>';
}
function e3ExpandAll(){ e3Closed=new Set(); e3SaveSession(); e3RebuildReqBody(); }
function e3CollapseAll(){ e3Closed=new Set(); (reqFolders||[]).forEach(function(f){ if(f&&f.id)e3Closed.add(f.id); }); e3SaveSession(); e3RebuildReqBody(); }
function e3ToggleCol(n){
  if(n===1)e3C1=!e3C1; else if(n===2)e3C2=!e3C2; else if(n===3)e3C3=!e3C3;
  try{ localStorage.setItem('utop_e3_c1', e3C1?'1':'0'); localStorage.setItem('utop_e3_c2', e3C2?'1':'0'); localStorage.setItem('utop_e3_c3', e3C3?'1':'0'); }catch(_e){}
  renderExplorer3();
}
// 열 구분선 드래그 리사이즈 (Grid) — grid-template-columns 를 직접 수정.
// leftId: 'e3-col-1' 또는 'e3-col-2' → 그 컬럼의 폭을 (마우스 X 이동만큼) 조정, 그 우측 컬럼은 자동으로 남는 공간 흡수.
function e3ResizeStartGrid(ev, leftId){
  ev.preventDefault(); ev.stopPropagation();
  var grid=document.getElementById('e3-cols'); if(!grid) return;
  var leftCol=document.getElementById(leftId); if(!leftCol) return;
  var startX=ev.clientX;
  var startWidth=leftCol.offsetWidth;
  var MIN=160;
  var ov=document.createElement('div');
  ov.id='e3-resize-ov';
  ov.style.cssText='position:fixed;inset:0;z-index:99999;cursor:col-resize;';
  document.body.appendChild(ov);
  var _pu=document.body.style.userSelect; document.body.style.userSelect='none';
  // 다른 컬럼의 현재 폭(1열/2열/3열)을 그대로 유지하기 위해 grid-template-columns 를 매번 재계산.
  function _cur(id, fallback){ var el=document.getElementById(id); return el?(el.offsetWidth+'px'):fallback; }
  function _apply(w1px, w2px){
    // 접힘 여부에 따라 슬롯이 auto(접힘 카드) 또는 폭 지정
    var c1=e3C1?'auto':(w1px||_cur('e3-col-1', e3W1+'px'));
    var c2=e3C2?'auto':(e3C3?'minmax(0,1fr)':(w2px||_cur('e3-col-2', e3W2+'px')));
    var c3=e3C3?'auto':'minmax(0,1fr)';
    grid.style.gridTemplateColumns=c1+' 6px '+c2+' 6px '+c3;
  }
  function mv(e){
    var d=e.clientX-startX;
    var nW=Math.max(MIN, startWidth+d);
    // 오른쪽 컬럼이 fr(가변)이면 자연히 좁아짐. 고정폭이면 최소값 보장 필요 없음(다른 컬럼도 스스로 유지).
    if(leftId==='e3-col-1'){
      // 남은 공간이 col-2, col-3 에 분배됨. col-2 가 e3C3 접힘이면 1fr 이라 자동, 아니면 e3W2 유지.
      _apply(nW+'px', null);
    } else if(leftId==='e3-col-2'){
      _apply(null, nW+'px');
    }
  }
  function up(){
    document.removeEventListener('mousemove',mv);
    document.removeEventListener('mouseup',up);
    window.removeEventListener('mouseup',up);
    window.removeEventListener('blur',up);
    var _ov=document.getElementById('e3-resize-ov'); if(_ov&&_ov.parentNode) _ov.parentNode.removeChild(_ov);
    document.body.style.userSelect=_pu||'';
    // 저장 — 사용자별 키(_e3WidthsKey) 로 반영
    if(leftId==='e3-col-1') e3W1=Math.max(MIN, leftCol.offsetWidth);
    else if(leftId==='e3-col-2') e3W2=Math.max(MIN, leftCol.offsetWidth);
    e3SaveWidths();
  }
  document.addEventListener('mousemove',mv);
  document.addEventListener('mouseup',up);
  window.addEventListener('mouseup',up);
  window.addEventListener('blur',up);
}
// 이하 원본 flex 기반 리사이저 (다른 곳에서 참조할 수 있어 남겨둠)
function e3ResizeStart(ev, handle){
  ev.preventDefault(); ev.stopPropagation();
  var leftCol=handle.previousElementSibling;
  var rightCol=handle.nextElementSibling;
  if(!leftCol||!rightCol) return;
  var leftId=leftCol.id;
  var startX=ev.clientX, startLeft=leftCol.offsetWidth;
  var MIN=160;
  var ov=document.createElement('div');
  ov.id='e3-resize-ov';
  ov.style.cssText='position:fixed;inset:0;z-index:99999;cursor:col-resize;';
  document.body.appendChild(ov);
  var _pu=document.body.style.userSelect;
  document.body.style.userSelect='none';
  function mv(e){
    var nLeft=Math.max(MIN, startLeft+(e.clientX-startX));
    leftCol.style.flex='0 0 '+nLeft+'px';
    leftCol.style.width=nLeft+'px';
  }
  function up(){
    document.removeEventListener('mousemove',mv);
    document.removeEventListener('mouseup',up);
    window.removeEventListener('mouseup',up);
    window.removeEventListener('blur',up);
    var _ov=document.getElementById('e3-resize-ov');
    if(_ov&&_ov.parentNode) _ov.parentNode.removeChild(_ov);
    document.body.style.userSelect=_pu||'';
    if(leftId==='e3-col-1') e3W1=leftCol.offsetWidth;
    else if(leftId==='e3-col-2') e3W2=leftCol.offsetWidth;
    e3SaveWidths();
  }
  document.addEventListener('mousemove',mv);
  document.addEventListener('mouseup',up);
  window.addEventListener('mouseup',up);
  window.addEventListener('blur',up);
}

// ===== Explorer3 포커스 열 관리 (1=REQ, 2=TC, 3=Detail) =====
var _e3Focus=1;
function _e3FocusUI(){
  var cols={1:'e3-col-1',2:'e3-col-2',3:'e3-col-3'};
  var borders={1:'2px solid #7c3aed',2:'2px solid #00875a',3:'2px solid #2d6fd4'};
  var shadows={1:'0 0 0 3px rgba(124,58,237,0.18),0 4px 18px rgba(124,58,237,0.14)',2:'0 0 0 3px rgba(0,135,90,0.18),0 4px 18px rgba(0,135,90,0.14)',3:'0 0 0 3px rgba(45,111,212,0.18),0 4px 18px rgba(45,111,212,0.14)'};
  [1,2,3].forEach(function(n){
    var el=document.getElementById(cols[n]); if(!el) return;
    if(_e3Focus===n){ el.style.border=borders[n]; el.style.boxShadow=shadows[n]; }
    else { el.style.border='1px solid var(--border)'; el.style.boxShadow='0 2px 10px rgba(40,50,90,0.06)'; }
  });
}
function _e3SetFocus(n){ _e3Focus=n; _e3FocusUI(); }

// ===== Explorer3 키보드 탐색 =====
// 1열: ↑↓ REQ 이동, → 2열 이동
// 2열: ↑↓ TC 이동, → 3열 이동, ← 1열 이동
// 3열: ← 2열 이동
function _e3ScrollInto(el){ if(el&&el.scrollIntoView) el.scrollIntoView({block:'nearest'}); }
function _e3KeyNav(ev){
  var page=document.getElementById('page-explorer3'); if(!page||!page.classList.contains('active')) return;
  // Ctrl/Meta+방향키는 TC 절차 그리드의 스텝 이동 단축키이므로 여기서는 절대 처리하지 않음
  if(ev.ctrlKey||ev.metaKey||ev.altKey) return;
  var tag=(ev.target&&ev.target.tagName)||''; if(/^(INPUT|TEXTAREA|SELECT)$/i.test(tag)||(ev.target&&ev.target.isContentEditable)) return;
  var k=ev.key;
  if(k==='ArrowDown'||k==='ArrowUp'){
    ev.preventDefault();
    if(_e3Focus===1){
      var idx=e3FlatReqOrder.indexOf(e3SelReq);
      if(idx<0) idx=0;
      var next=k==='ArrowDown'?Math.min(idx+1,e3FlatReqOrder.length-1):Math.max(idx-1,0);
      var nid=e3FlatReqOrder[next]; if(!nid) return;
      e3ClearSel(); e3PickReq(nid); _e3SetFocus(1);
      setTimeout(function(){ _e3ScrollInto(document.querySelector('#e3-req-body [onclick*="\''+nid+'\'"]')); },30);
    } else if(_e3Focus===2){
      var idx2=e3FlatTcOrder.indexOf(e3SelTc);
      if(idx2<0) idx2=-1;
      var next2=k==='ArrowDown'?Math.min(idx2+1,e3FlatTcOrder.length-1):Math.max(idx2-1,0);
      if(next2<0) next2=0;
      var nid2=e3FlatTcOrder[next2]; if(!nid2) return;
      e3ClearSel(); e3PickTc(nid2);
      setTimeout(function(){ _e3ScrollInto(document.querySelector('#e3-tc-body [onclick*="\''+nid2+'\'"]')); },30);
    }
  } else if(k==='ArrowRight'){
    ev.preventDefault();
    if(_e3Focus===1){
      // 2열로 이동 (TC 없어도 이동)
      _e3SetFocus(2);
      if(!e3SelTc&&e3FlatTcOrder.length>0){
        e3ClearSel(); e3PickTc(e3FlatTcOrder[0]);
        setTimeout(function(){ _e3ScrollInto(document.querySelector('#e3-tc-body [onclick*="\''+e3FlatTcOrder[0]+'\'"]')); },30);
      }
    } else if(_e3Focus===2){
      // 3열(상세)로 이동
      _e3SetFocus(3);
    }
  } else if(k==='ArrowLeft'){
    ev.preventDefault();
    if(_e3Focus===2){
      _e3SetFocus(1);
      setTimeout(function(){ if(e3SelReq) _e3ScrollInto(document.querySelector('#e3-req-body [onclick*="\''+e3SelReq+'\'"]')); },30);
    } else if(_e3Focus===3){
      _e3SetFocus(2);
    }
  }
}
document.addEventListener('keydown', _e3KeyNav);

// ===== Explorer3 우클릭 컨텍스트 메뉴 (원본 Explorer의 exp* 액션을 3열에 이식) =====
// 공용 렌더러 expShowCtxMenu(06-nav-misc)를 재사용. CRUD 액션은 전역 exp* 함수를 그대로 호출하고
// (그 함수들이 renderExplorer()를 부르면 renderExplorer 내부에서 explorer3도 자동 갱신됨),
// '열기'/'이름 변경'만 3열 전용 상태(e3SelReq/e3SelTc)에 맞춰 처리한다.
function e3FolderOpen(fid){ if(e3Closed===null)e3Closed=new Set(); e3Closed.delete(fid); e3RebuildReqBody(); }
async function e3RenameReq(reqId){
  var r=(reqList||[]).find(function(x){return x.id===reqId;}); if(!r){ if(typeof showToast==='function')showToast('REQ를 찾을 수 없습니다'); return; }
  var v=await uiPrompt({title:'REQ 이름 변경', label:'REQ 제목(Summary)', value:r.title||'', icon:'ti-pencil'}); if(v===null) return;
  r.title=(v||'').trim()||'(제목 없음)'; r.updated_at=new Date().toISOString().slice(0,10);
  try{ await saveOneREQ(r); }catch(e){}
  renderExplorer3();
}
async function e3RenameTc(tcid){
  var tc=(tcList||[]).find(function(t){return (t.tcid===tcid)||(t.id===tcid);}); if(!tc){ if(typeof showToast==='function')showToast('TC를 찾을 수 없습니다'); return; }
  var v=await uiPrompt({title:'TC 이름 변경', label:'TC 제목', value:tc.name||'', icon:'ti-pencil'}); if(v===null) return;
  tc.name=(v||'').trim()||'(제목 없음)';
  try{ await saveTCFile(tc); }catch(e){}
  var r=(reqList||[]).find(function(x){return x.id===tc.req_id;});
  if(r&&Array.isArray(r.tc)){ var ref=r.tc.find(function(x){return x.tcid===(tc.tcid||tc.id);}); if(ref){ ref.name=tc.name; try{ await saveOneREQ(r); }catch(e){} } }
  renderExplorer3();
}
// ── e3 전용 추가 래퍼 : 원본 exp* 추가 함수 호출 후 3열 재렌더 + 새 항목 선택 (실시간 반영 보장) ──
async function e3AddReqWrap(folderId){
  var before=(reqList||[]).map(function(x){return x.id;});
  try{ await expAddREQ(folderId); }catch(e){}
  var neo=(reqList||[]).find(function(x){return before.indexOf(x.id)<0;});
  if(e3Closed)e3Closed.delete(folderId);
  if(neo){ e3SelReq=neo.id; e3SelTc=null; }
  renderExplorer3();
}
async function e3BulkAddReqWrap(folderId){
  try{ await expBulkAddREQ(folderId); }catch(e){}
  if(e3Closed)e3Closed.delete(folderId);
  renderExplorer3();
}
async function e3AddTcWrap(reqId){
  var before=(tcList||[]).map(function(x){return x.tcid||x.id;});
  try{ await expAddTC(reqId); }catch(e){}
  var neo=(tcList||[]).find(function(x){return before.indexOf(x.tcid||x.id)<0;});
  e3SelReq=reqId;
  if(neo){ e3SelTc=neo.tcid||neo.id; }
  renderExplorer3();
}
async function e3BulkAddTcWrap(reqId){
  try{ await expBulkAddTC(reqId); }catch(e){}
  e3SelReq=reqId;
  renderExplorer3();
}
function e3ShowCtx(e, id, type){
  if(e&&e.preventDefault)e.preventDefault();
  if(e&&e.stopPropagation)e.stopPropagation();
  if(typeof expShowCtxMenu!=='function') return; // 공용 렌더러 없으면 무시
  // 우클릭한 노드를 먼저 선택 상태로 (컨텍스트 메뉴 액션이 지금 보이는 상세와 일치하도록)
  // 단, 다중선택 중이고 우클릭한 항목이 이미 그 집합에 포함되어 있으면 선택 유지 → 다중 삭제 등 지원
  try{
    if(type==='req'){
      var reqMulti=(e3SelReqs && e3SelReqs.size>=2 && e3SelReqs.has(id));
      if(!reqMulti && e3SelReq!==id) e3PickReq(id);
    } else if(type==='tc'){
      var tcMulti=(e3SelTcs && e3SelTcs.size>=2 && e3SelTcs.has(id));
      if(!tcMulti && e3SelTc!==id) e3PickTc(id);
    } else if(type==='folder' && e3SelFolder!==id){
      if(typeof e3PickFolder==='function') e3PickFolder(id);
    }
  }catch(_e){}
  var items;
  if(type==='folder'){
    items=[
      {label:'REQ 추가', icon:'ti-file-plus', onclick:function(){ e3AddReqWrap(id); }},
      {label:'REQ 일괄 생성', icon:'ti-files', onclick:function(){ e3BulkAddReqWrap(id); }},
      {label:'하위 폴더 추가', icon:'ti-folder-plus', onclick:function(){ expAddFolder(id); }},
      {label:'이름 변경', icon:'ti-pencil', onclick:function(){ expRenameFolder(id); }},
      {sep:true},
      {label:'폴더 삭제', icon:'ti-trash', danger:true, onclick:function(){ expDeleteFolder(id); }},
    ];
  } else if(type==='req'){
    var _reqMulti=(e3SelReqs && e3SelReqs.size>=2 && e3SelReqs.has(id));
    var _reqDelLabel=_reqMulti?('선택한 REQ '+e3SelReqs.size+'개 삭제'):'REQ 삭제';
    items=[
      {label:'TC 추가', icon:'ti-clipboard-plus', onclick:function(){ e3AddTcWrap(id); }},
      {label:'TC 일괄 생성', icon:'ti-files', onclick:function(){ e3BulkAddTcWrap(id); }},
      {label:'이름 변경', icon:'ti-pencil', onclick:function(){ e3RenameReq(id); }},
      {label:'TC ID 경로기준 재정렬', icon:'ti-list-numbers', onclick:function(){ expNormalizeReqTcIds(id); }},
      {label:'REQ 복제 (Clone)', icon:'ti-copy', onclick:function(){ expCloneREQ(id); }},
      {sep:true},
      {label:_reqDelLabel, icon:'ti-trash', danger:true, onclick:function(){ if(_reqMulti){ e3BulkDeleteReqs(); } else { expDeleteREQ(id); } }},
    ];
  } else if(type==='tc'){
    var _tcMulti=(e3SelTcs && e3SelTcs.size>=2 && e3SelTcs.has(id));
    var _delLabel=_tcMulti?('선택한 TC '+e3SelTcs.size+'개 삭제'):'TC 삭제';
    var _copyLabel=_tcMulti?('선택한 TC '+e3SelTcs.size+'개 복사'):'TC 복사';
    items=[
      {label:'이름 변경', icon:'ti-pencil', onclick:function(){ e3RenameTc(id); }},
      {label:'TC ID 수정', icon:'ti-id', onclick:function(){ tcRenameId(id); }},
      {label:_copyLabel, icon:'ti-clipboard-copy', onclick:function(){ e3TcCopyToClipboard(_tcMulti?Array.from(e3SelTcs):[id]); }},
      {label:'TC 복제 (Clone)', icon:'ti-copy', onclick:function(){ expCloneTC(id); }},
      {sep:true},
      {label:_delLabel, icon:'ti-trash', danger:true, onclick:function(){ if(_tcMulti){ e3BulkDeleteTcs(); } else { expDeleteTC(id); } }},
    ];
  } else { return; }
  expShowCtxMenu(e, items);
}

// ── TC 클립보드 복사·붙여넣기 (탭·페이지 이동해도 유지) ──
var _e3TcClipboard=null;   // {tcs:[full tc data...], sourceReqId, at}
async function e3TcCopyToClipboard(tcids){
  if(!Array.isArray(tcids)) tcids=[tcids];
  tcids=tcids.filter(Boolean); if(!tcids.length) return;
  var _copies=[];
  for(var i=0;i<tcids.length;i++){
    var _tc=tcList.find(function(x){return (x.tcid||x.id)===tcids[i];});
    if(!_tc) continue;
    // checks 가 없으면(meta 상태) 서버에서 상세 로드 후 복사 (스텝 유실 방지)
    if(!Array.isArray(_tc.checks)){
      try{ if(typeof loadTCFull==='function') await loadTCFull(_tc.tcid||_tc.id, true, true); }catch(_e){}
      _tc=tcList.find(function(x){return (x.tcid||x.id)===tcids[i];})||_tc;
    }
    _copies.push(JSON.parse(JSON.stringify(_tc)));
  }
  if(!_copies.length){ if(typeof showToast==='function') showToast('복사할 TC 를 찾지 못했습니다'); return; }
  _e3TcClipboard={tcs:_copies, sourceReqId:_copies[0].req_id||'', at:Date.now()};
  window._e3TcClipboard=_e3TcClipboard;   // 페이지 전환 후에도 유지
  if(typeof showToast==='function') showToast('📋 TC '+_copies.length+'개 복사 — 다른 REQ 의 Coverage 영역에서 우클릭 → 붙여넣기');
}
// Coverage(2열) body 우클릭 → 붙여넣기 메뉴 (붙일 위치 결정용)
function e3TcBodyCtx(ev){
  if(ev&&ev.preventDefault)ev.preventDefault();
  if(ev&&ev.stopPropagation)ev.stopPropagation();
  var _clip=window._e3TcClipboard||_e3TcClipboard;
  var _hasClip=!!(_clip&&_clip.tcs&&_clip.tcs.length);
  // 붙여넣기 대상 REQ 결정: 선택된 REQ (e3SelReq) 우선. 없으면 안내
  var _targetReq=(typeof e3SelReq!=='undefined'&&e3SelReq)?reqList.find(function(x){return x.id===e3SelReq;}):null;
  var _targetLabel=_targetReq?(' → '+_bdEsc(_targetReq.title||_targetReq.reqid||'')):'';
  if(typeof expShowCtxMenu!=='function') return;
  var items=[];
  if(_hasClip){
    items.push({
      label:'붙여넣기 ('+_clip.tcs.length+'개)'+_targetLabel,
      icon:'ti-clipboard-plus',
      onclick:function(){ e3TcPasteFromClipboard(); }
    });
    items.push({label:'클립보드 비우기', icon:'ti-x', onclick:function(){ _e3TcClipboard=null; window._e3TcClipboard=null; if(typeof showToast==='function')showToast('클립보드 비웠음'); }});
  } else {
    items.push({label:'붙여넣기 (클립보드 비어있음)', icon:'ti-clipboard-off', onclick:function(){ if(typeof showToast==='function')showToast('먼저 TC 를 우클릭 → 복사 하세요'); }});
  }
  expShowCtxMenu(ev, items);
}
async function e3TcPasteFromClipboard(){
  var _clip=window._e3TcClipboard||_e3TcClipboard;
  if(!_clip||!Array.isArray(_clip.tcs)||!_clip.tcs.length){ if(typeof showToast==='function')showToast('클립보드에 복사된 TC 가 없습니다'); return; }
  var _targetReq=(typeof e3SelReq!=='undefined'&&e3SelReq)?reqList.find(function(x){return x.id===e3SelReq;}):null;
  if(!_targetReq){ if(typeof showToast==='function')showToast('먼저 붙여넣을 REQ 를 좌측에서 선택하세요'); return; }
  // 대상 REQ prefix 계산 — expReassignIdsByFolder 와 동일한 방식
  var _prefix='';
  try{ _prefix=(typeof expFolderPath==='function'&&_targetReq.folder)?expFolderPath(_targetReq.folder):''; }catch(_e){}
  if(!_prefix){ _prefix=String(_targetReq.reqid||'REQ').replace(/-\d{3}$/,''); }
  var _added=[]; var _skipRender=window._expBulkSkipRender; window._expBulkSkipRender=true;
  try{
    // 새 tcid 순차 발급을 위한 next seq (사이에 발생하는 push 반영되도록 매 iteration 재계산)
    for(var i=0;i<_clip.tcs.length;i++){
      var _src=_clip.tcs[i];
      var _copy=JSON.parse(JSON.stringify(_src));
      // 새 tcid 생성 — <prefix>-TC-NNN
      var _s=(typeof _nextSeqFor==='function')?_nextSeqFor(_prefix,'-TC-','tc'):(tcList.filter(function(x){return String(x.tcid||'').indexOf(_prefix+'-TC-')===0;}).length+1);
      var _newTcid; do{ _newTcid=_prefix+'-TC-'+_pad3(_s); _s++; }while(tcList.some(function(x){return x.tcid===_newTcid;}));
      _copy.tcid=_newTcid; _copy.id=_newTcid;
      _copy.req_id=_targetReq.id;
      // 이름 뒤에 접미사 (충돌 방지)
      // step id 새로 발급 (원본과 참조 충돌 방지)
      if(Array.isArray(_copy.checks)){
        _copy.checks.forEach(function(ck){ ck.id='ck'+Date.now()+'_'+Math.floor(Math.random()*1000000); ck.output=''; ck.repeatResult=''; delete ck.executed_at; });
      }
      _copy.status='대기'; _copy.result_history=[]; _copy.issue_list=[];
      _copy.created_at=new Date().toISOString(); _copy.updated_at=_copy.created_at;
      tcList.push(_copy);
      try{ await saveTCFile(_copy); }catch(_e){}
      _added.push({tcid:_newTcid, name:_copy.name||'', status:_copy.status});
    }
    // REQ.tc 배열에 참조 추가 후 저장
    if(!Array.isArray(_targetReq.tc)) _targetReq.tc=[];
    _added.forEach(function(ref){ _targetReq.tc.push(ref); });
    try{ await saveOneREQ(_targetReq); }catch(_e){}
  } finally { window._expBulkSkipRender=_skipRender; }
  if(typeof renderExplorer==='function') renderExplorer();
  if(typeof renderExplorer3==='function') renderExplorer3();
  if(typeof showToast==='function') showToast('✅ TC '+_added.length+'개 붙여넣기 완료 → '+(_targetReq.title||_targetReq.reqid||''));
}

// 원본 페이지 Coverage 표의 셀 우클릭 → 아래로 채우기 (커스텀 필드만)
function e3TcCellCtx(e, tcid, fieldId){
  if(typeof expShowCtxMenu!=='function') return;
  var t=tcList.find(function(x){return (x.tcid||x.id)===tcid;});
  if(!t) return;
  var f=(e3TcColDefs()||[]).find(function(x){return x.id===fieldId;});
  var val=((t.custom_fields||{})[fieldId])||'';
  var idx=e3FlatTcOrder.indexOf(tcid);
  var below=idx>=0?e3FlatTcOrder.slice(idx+1):[];
  var items=below.length
    ?[{label:'아래로 채우기 ('+below.length+'개 행)', icon:'ti-arrow-bar-to-down', onclick:function(){ e3TcFillDown(tcid,fieldId,val,f&&f.label); }}]
    :[{label:'아래로 채우기 (대상 없음)', icon:'ti-arrow-bar-to-down', onclick:function(){}}];
  expShowCtxMenu(e, items);
}
function e3TcFillDown(tcid, fieldId, val, label){
  var idx=e3FlatTcOrder.indexOf(tcid);
  if(idx<0) return;
  var below=e3FlatTcOrder.slice(idx+1);
  if(!below.length) return;
  uiConfirm({
    title:'아래로 채우기',
    icon:'ti-arrow-bar-to-down',
    msg:'이 값을 아래 <b>'+below.length+'개</b> 행의 <b>'+_bdEsc(label||fieldId)+'</b> 값에 덮어씁니다. 계속할까요?',
    confirmText:'채우기',
    onConfirm:function(){
      below.forEach(function(id){ saveTCCustomField(id,fieldId,val); });
      e3RebuildTcBody();
    }
  });
}

// Coverage TC Summary 표의 커스텀필드 배지 셀 우클릭 메뉴 — 값을 아래 행들로 채우기
function e3bTcCellCtx(e, tcid, fieldId){
  if(typeof expShowCtxMenu!=='function') return;
  var t=tcList.find(function(x){return (x.tcid||x.id)===tcid;});
  if(!t) return;
  var f=(e3bTcColDefs()||[]).find(function(x){return x.id===fieldId;});
  var val=((t.custom_fields||{})[fieldId])||'';
  var idx=e3bFlatTcOrder.indexOf(tcid);
  var below=idx>=0?e3bFlatTcOrder.slice(idx+1):[];
  var items=below.length
    ?[{label:'아래로 채우기 ('+below.length+'개 행)', icon:'ti-arrow-bar-to-down', onclick:function(){ e3bTcFillDown(tcid,fieldId,val,f&&f.label); }}]
    :[{label:'아래로 채우기 (대상 없음)', icon:'ti-arrow-bar-to-down', onclick:function(){}}];
  expShowCtxMenu(e, items);
}
function e3bTcFillDown(tcid, fieldId, val, label){
  var idx=e3bFlatTcOrder.indexOf(tcid);
  if(idx<0) return;
  var below=e3bFlatTcOrder.slice(idx+1);
  if(!below.length) return;
  uiConfirm({
    title:'아래로 채우기',
    icon:'ti-arrow-bar-to-down',
    msg:'이 값을 아래 <b>'+below.length+'개</b> 행의 <b>'+_bdEsc(label||fieldId)+'</b> 값에 덮어씁니다. 계속할까요?',
    confirmText:'채우기',
    onConfirm:function(){
      below.forEach(function(id){ saveTCCustomField(id,fieldId,val); });
      e3bRebuildTcBody();
    }
  });
}
// Coverage TC Summary 표 커스텀필드 배지 셀 더블클릭 인라인 편집 — {tcid,fieldId} 또는 null
var e3bTcCellEdit=null;
var e3bTcCellMultiDdOpen=false;   // MultiSelect 편집 중 드롭다운(체크리스트) 펼침 상태
function e3bTcCellEditOpen(tcid, fieldId){
  e3bTcCellEdit={tcid:tcid,fieldId:fieldId};
  e3bTcCellMultiDdOpen=false;
  e3bSetTcBodyHtml();
  document.removeEventListener('mousedown',_e3bTcCellEditOutside);
  setTimeout(function(){
    var el=document.getElementById('e3b-tc-celledit');
    if(el){ el.focus(); if(el.select) el.select(); }
    document.addEventListener('mousedown',_e3bTcCellEditOutside);
  },0);
}
function e3bTcCellEditClose(){
  e3bTcCellEdit=null;
  e3bTcCellMultiDdOpen=false;
  document.removeEventListener('mousedown',_e3bTcCellEditOutside);
  e3bSetTcBodyHtml();
}
function _e3bTcCellEditOutside(ev){
  if(ev.target.closest('#e3b-tc-celledit-wrap')) return;
  e3bTcCellEditClose();
}
function e3bTcCellEditCommit(tcid, fieldId, val){
  saveTCCustomField(tcid, fieldId, val);
  e3bTcCellEdit=null;
  e3bTcCellMultiDdOpen=false;
  document.removeEventListener('mousedown',_e3bTcCellEditOutside);
  e3bSetTcBodyHtml();
}
function e3bTcCellEditMultiDdToggle(){
  e3bTcCellMultiDdOpen=!e3bTcCellMultiDdOpen;
  e3bSetTcBodyHtml();
  document.removeEventListener('mousedown',_e3bTcCellEditOutside);
  setTimeout(function(){ document.addEventListener('mousedown',_e3bTcCellEditOutside); },0);
}
function _e3bTcCellEditHtml(t, f){
  var tcid=t.tcid||t.id;
  var val=((t.custom_fields||{})[f.id])||'';
  var onSel="e3bTcCellEditCommit('"+tcid+"','"+f.id+"',this.value)";
  var common='font-size:11.5px;padding:3px 6px;border:1.5px solid var(--blue);border-radius:6px;outline:none;background:#fff;';
  var input;
  if(f.type==='Select'){
    input='<select id="e3b-tc-celledit" autofocus onchange="'+onSel+'" onblur="e3bTcCellEditClose()" style="'+common+'min-width:110px;">'
      +'<option value="">(값 선택)</option>'
      +(f.options||[]).map(function(o){ var ov=cfOptValue(o); return '<option value="'+_bdEsc(ov)+'" '+(val===ov?'selected':'')+'>'+_bdEsc(ov)+'</option>'; }).join('')
      +'</select>';
  } else if(f.type==='MultiSelect'){
    var sel=(val||'').split(',').filter(Boolean);
    var ddOpen=e3bTcCellMultiDdOpen;
    var summary=sel.length?sel.join(', '):'(값 선택)';
    input='<span style="position:relative;display:inline-block;">'
      +'<button onclick="event.stopPropagation();e3bTcCellEditMultiDdToggle()" style="'+common+'display:inline-flex;align-items:center;gap:5px;max-width:160px;cursor:pointer;">'
        +'<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:130px;">'+_bdEsc(summary)+'</span>'
        +'<i class="ti ti-chevron-down" style="font-size:11px;flex-shrink:0;"></i>'
      +'</button>'
      +'<span style="display:'+(ddOpen?'flex':'none')+';position:absolute;top:calc(100% + 4px);right:0;z-index:10001;background:#fff;border:1px solid var(--border);border-radius:9px;box-shadow:0 10px 30px rgba(20,30,60,0.18);padding:6px;min-width:150px;max-height:220px;overflow:auto;flex-direction:column;gap:2px;text-align:left;font-weight:400;">'
        +(f.options||[]).map(function(o){ var ov=cfOptValue(o); var oc=cfOptColor(o); var on=sel.indexOf(ov)>=0;
          return '<span onclick="event.stopPropagation();e3bTcCellEditMultiToggle(\''+tcid+'\',\''+f.id+'\',\''+ov.replace(/'/g,"\\'")+'\')" style="display:flex;align-items:center;gap:7px;padding:5px 7px;border-radius:6px;cursor:pointer;font-size:11.5px;" onmouseenter="this.style.background=\'#f5f7fb\'" onmouseleave="this.style.background=\'transparent\'">'
            +'<span style="width:13px;height:13px;border-radius:4px;border:1.5px solid '+(on?'#2d6fd4':'#c7ccd6')+';background:'+(on?'#2d6fd4':'#fff')+';display:flex;align-items:center;justify-content:center;flex-shrink:0;">'+(on?'<i class="ti ti-check" style="font-size:9px;color:#fff;"></i>':'')+'</span>'
            +'<span style="width:7px;height:7px;border-radius:2px;background:'+oc+';flex-shrink:0;"></span>'
            +'<span>'+_bdEsc(ov)+'</span></span>'; }).join('')
      +'</span>'
      +'</span>';
  } else if(f.type==='Date'){
    input='<input id="e3b-tc-celledit" type="date" value="'+_bdEsc(val)+'" onchange="'+onSel+'" onblur="e3bTcCellEditClose()" style="'+common+'">';
  } else if(f.type==='Number'){
    input='<input id="e3b-tc-celledit" type="number" value="'+_bdEsc(val)+'" onblur="e3bTcCellEditCommit(\''+tcid+'\',\''+f.id+'\',this.value)" onkeydown="if(event.key===\'Enter\')this.blur();if(event.key===\'Escape\')e3bTcCellEditClose();" style="'+common+'width:90px;">';
  } else if(f.type==='Checkbox'){
    input='<label style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;"><input id="e3b-tc-celledit" type="checkbox" '+(val==='true'?'checked':'')+' onchange="e3bTcCellEditCommit(\''+tcid+'\',\''+f.id+'\',String(this.checked))" style="width:14px;height:14px;"><span style="font-size:11px;color:var(--text2);">'+(f.placeholder||'예/아니오')+'</span></label>';
  } else {
    input='<input id="e3b-tc-celledit" value="'+_bdEsc(val)+'" onblur="e3bTcCellEditCommit(\''+tcid+'\',\''+f.id+'\',this.value)" onkeydown="if(event.key===\'Enter\')this.blur();if(event.key===\'Escape\')e3bTcCellEditClose();" style="'+common+'width:130px;">';
  }
  return '<span id="e3b-tc-celledit-wrap" onclick="event.stopPropagation()">'+input+'</span>';
}
function e3bTcCellEditMultiToggle(tcid, fieldId, ov){
  var t=tcList.find(function(x){return (x.tcid||x.id)===tcid;}); if(!t) return;
  var cur=((t.custom_fields||{})[fieldId]||'').split(',').filter(Boolean);
  var i=cur.indexOf(ov);
  if(i>=0) cur.splice(i,1); else cur.push(ov);
  saveTCCustomField(tcid, fieldId, cur.join(','));
  e3bSetTcBodyHtml();
  document.removeEventListener('mousedown',_e3bTcCellEditOutside);
  setTimeout(function(){ document.addEventListener('mousedown',_e3bTcCellEditOutside); },0);
}

function tcFolderHtml(f, depth){
  const children=reqFolders.filter(c=>c.parent===f.id).sort((a,b)=>(a.order||0)-(b.order||0));
  const open=req2ExpandedIds.has('tc-'+f.id);
  const sel=tcSelFolderId===f.id;
  const dotColor=f.color==='blue'?'var(--blue)':f.color==='green'?'var(--green)':f.color==='red'?'var(--red)':'var(--yellow)';
  // 하위 포함 REQ/TC 개수
  const allFids=tcGetAllFolderIds(f.id);
  const reqCnt=reqList.filter(r=>allFids.includes(r.folder)).length;
  const tcCnt=tcList.filter(t=>allFids.some(fid=>reqList.find(r=>r.id===t.req_id&&r.folder===fid))).length;
  const indent=depth*14;
  const childrenHtml=children.length&&open?'<div>'+children.map(c=>tcFolderHtml(c,depth+1)).join('')+'</div>':'';
  return '<div><div style="display:flex;align-items:center;gap:5px;padding:6px 8px;padding-left:'+(10+indent)+'px;border-radius:6px;cursor:pointer;background:'+(sel?'rgba(45,111,212,0.08)':'')+';color:'+(sel?'var(--blue)':'var(--text2)')+';font-size:12.5px;" id="tc-fi-'+f.id+'" onclick="tcSelectFolder(\''+f.id+'\')" ondblclick="tcExpandAll(\''+f.id+'\')" oncontextmenu="event.preventDefault();tcSelectFolderAll(\''+f.id+'\')">'+(children.length?'<i class="ti ti-chevron-right" style="font-size:12.5px;flex-shrink:0;transition:transform 0.15s;'+(open?'transform:rotate(90deg)':'')+'" onclick="event.stopPropagation();tcToggleFolder(\''+f.id+'\')"></i>':'<span style="width:14px;flex-shrink:0;"></span>')+'<i class="ti ti-folder'+(open?'-open':'')+'" style="font-size:15px;color:'+dotColor+';flex-shrink:0;"></i><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+f.name+'</span>'+(reqCnt?'<span style="font-size:10px;color:var(--blue);font-weight:600;flex-shrink:0;">'+reqCnt+'-'+tcCnt+'</span>':'')+'</div>'+childrenHtml+'</div>';
}

function tcGetAllFolderIds(fid){
  const ch=reqFolders.filter(c=>c.parent===fid).map(c=>c.id);
  return [fid,...ch.flatMap(tcGetAllFolderIds)];
}

function tcToggleFolder(fid){
  if(req2ExpandedIds.has('tc-'+fid)) req2ExpandedIds.delete('tc-'+fid);
  else req2ExpandedIds.add('tc-'+fid);
  renderTCReqTree();
}

function tcExpandAll(fid){ req2ExpandedIds.add('tc-'+fid); renderTCReqTree(); }

function tcHighlightFolder(fid){
  document.querySelectorAll('[id^="tc-fi-"]').forEach(el=>{
    const isSel=el.id==='tc-fi-'+fid;
    el.style.background=isSel?'rgba(45,111,212,0.08)':'';
    el.style.color=isSel?'var(--blue)':'var(--text2)';
  });
}

// 폴더 클릭: 자식 있으면 하위 전체, 자식 없으면 해당만
function tcSelectFolder(fid){
  tcSelFolderId=fid;
  const hasChildren=reqFolders.some(f=>f.parent===fid);
  tcFolderMode=hasChildren?'all':'single';
  tcSelReqId=null; // REQ 선택 초기화 → 3열에 전체 TC 표시
  tcSelTcId=null;
  req2ExpandedIds.add('tc-'+fid);
  renderTCReqTree();
  const f=reqFolders.find(x=>x.id===fid);
  const titleEl=document.getElementById('tc2-title');
  if(titleEl) titleEl.textContent=(f?.name||'REQ')+(hasChildren?' (하위전체)':'')+' 목록';
  tcRenderREQList();
  tcRenderTCList(); // 3열도 동시 갱신
}

// 우클릭: 항상 하위 전체
function tcSelectFolderAll(fid){
  tcSelFolderId=fid; tcFolderMode='all';
  tcSelReqId=null; tcSelTcId=null;
  renderTCReqTree();
  const f=reqFolders.find(x=>x.id===fid);
  const titleEl=document.getElementById('tc2-title');
  if(titleEl) titleEl.textContent=(f?.name||'REQ')+' (하위전체) 목록';
  tcRenderREQList();
  tcRenderTCList();
}

// ── 2열: REQ 목록 ──
function tcRenderREQList(){
  const wrap=document.getElementById('tc2-req-list');
  if(!wrap||!tcSelFolderId) return;
  const search=(document.getElementById('tc2-search')?.value||'').toLowerCase();
  const fStatus=document.getElementById('tc2-filter-status')?.value||'';
  const fPriority=document.getElementById('tc2-filter-priority')?.value||'';
  const fProduct=document.getElementById('tc2-filter-product')?.value||'';
  const fids=tcFolderMode==='all'?tcGetAllFolderIds(tcSelFolderId):[tcSelFolderId];
  let reqs=reqList.filter(r=>fids.includes(r.folder));
  if(search) reqs=reqs.filter(r=>(r.reqid||'').toLowerCase().includes(search)||(r.title||'').toLowerCase().includes(search));
  if(fStatus) reqs=reqs.filter(r=>r.status===fStatus);
  if(fPriority) reqs=reqs.filter(r=>r.priority===fPriority);
  if(fProduct) reqs=reqs.filter(r=>(r.products||[]).includes(fProduct));
  const cntEl=document.getElementById('tc2-count');
  if(cntEl) cntEl.textContent=reqs.length+'개';
  if(!reqs.length){
    wrap.innerHTML='<div style="padding:30px;text-align:center;color:var(--text3);font-size:12.5px;">REQ가 없습니다</div>';
    tcRenderTCList(reqs); // 빈 배열로 3열 갱신
    return;
  }
  const statusColor={'Draft':'#aaa','Work in Progress':'var(--yellow)','Review':'var(--blue)','Approved':'var(--green)','Deprecated':'var(--red)'};
  const priorityColor={'Very High':'var(--red)','High':'#e8820c','Medium':'var(--blue)','Low':'var(--green)'};
  wrap.innerHTML=reqs.map(r=>{
    const tcCnt=tcList.filter(t=>t.req_id===r.id).length||(r.tc||[]).length;
    const sel=tcSelReqId===r.id;
    return '<div onclick="tcSelectREQ(\''+r.id+'\')" style="padding:8px 12px;border-bottom:1px solid #f0f0f0;cursor:pointer;background:'+(sel?'rgba(45,111,212,0.06)':'')+';border-left:3px solid '+(sel?'var(--blue)':'transparent')+';">'+
      // 1줄: REQ ID + 상태/우선순위/TC수
      '<div style="display:flex;align-items:center;gap:4px;margin-bottom:3px;">'+
        '<span style="font-size:11px;color:var(--blue);font-weight:700;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+r.reqid+'</span>'+
        (r.status?'<span style="font-size:10px;padding:1px 6px;border-radius:4px;border:1px solid currentColor;color:'+(statusColor[r.status]||'#aaa')+';white-space:nowrap;flex-shrink:0;">'+r.status+'</span>':'')+
        (r.priority?'<span style="font-size:10px;padding:1px 6px;border-radius:4px;background:#f5f5f5;color:'+(priorityColor[r.priority]||'var(--text3)')+';white-space:nowrap;flex-shrink:0;font-weight:600;">'+r.priority+'</span>':'')+
        (tcCnt?'<span style="font-size:10px;font-weight:700;color:var(--blue);flex-shrink:0;white-space:nowrap;">TC '+tcCnt+'</span>':'')+
      '</div>'+
      // 2줄: Summary
      '<div style="font-size:12.5px;color:var(--text);line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+r.title+'</div>'+
    '</div>';
  }).join('');
  // 2열 필터 변경 시 3열도 갱신 (REQ 미선택이면 필터된 REQ 전체의 TC)
  tcRenderTCList(tcSelReqId?null:reqs);
}

// ── 2열 REQ 클릭 ──
function tcSelectREQ(reqId){
  // 같은 REQ 다시 클릭하면 선택 해제 (전체 보기)
  if(tcSelReqId===reqId){ tcSelReqId=null; tcSelTcId=null; tcRenderREQList(); return; }
  tcSelReqId=reqId; tcSelTcId=null;
  tcRenderREQList();
  tcRenderTCList(null); // null이면 tcSelReqId 사용
  const t3=document.getElementById('tc3-title');
  const r=reqList.find(x=>x.id===reqId);
  if(t3) t3.textContent=r?r.reqid+' TC':'TC';
}

// ── 3열: TC 목록 (reqsOverride: 특정 REQ 배열로 TC 표시) ──

// ═════════════════════════════════════════════════════════
// Requirements & Test Coverage (Beta) — explorer3 원본 복제본
// ═════════════════════════════════════════════════════════
// TC 일괄 편집용 TinyMCE (여러 TC의 Object/Pre-Condition을 한번에 덮어쓰기)
var _e3bBulkTiny={};
function e3bBulkTinyInit(field){
  if(!(window.toastui&&toastui.Editor)){ setTimeout(()=>e3bBulkTinyInit(field),400); return; }
  var box=document.getElementById('e3b-bulk-tiny-'+field); if(!box) return;
  try{ if(_e3bBulkTiny[field]&&_e3bBulkTiny[field].destroy) _e3bBulkTiny[field].destroy(); }catch(e){}
  box.innerHTML='';
  var ed=new toastui.Editor({ el:box, initialValue:'', initialEditType:'wysiwyg', previewStyle:'tab', height:'auto', usageStatistics:false, plugins:_tuiPlugins(),
    hooks:{addImageBlobHook:function(blob,cb){ var fr=new FileReader(); fr.onload=function(){ cb(fr.result,'image'); }; fr.readAsDataURL(blob); }} });
  _e3bBulkTiny[field]=ed;
}
async function e3bBulkApplyField(field){
  var ed=_e3bBulkTiny[field]; if(!ed) return;
  var md=ed.getMarkdown(), html=ed.getHTML();
  if(!md||!md.trim()){ if(typeof showToast==='function')showToast('내용을 입력하세요'); return; }
  var ids=Array.from(e3bSelTcs); if(!ids.length){ if(typeof showToast==='function')showToast('선택된 TC가 없습니다'); return; }
  var label=field==='object'?'Object':'Pre-Condition';
  if(!confirm('선택된 '+ids.length+'개 TC의 '+label+'을(를) 덮어씁니다. 계속하시겠습니까?')) return;
  for(var i=0;i<ids.length;i++){
    var tc=tcList.find(function(t){return (t.tcid===ids[i])||(t.id===ids[i]);}); if(!tc) continue;
    tc[field]=md; tc[field+'_md']=md; tc[field+'_html']=html;
    try{ await saveTCFile(tc); }catch(e){}
  }
  if(typeof showToast==='function')showToast(label+' — '+ids.length+'개 TC에 적용되었습니다');
}
async function e3bBulkApplyCF(fieldId){
  var sel=document.getElementById('e3b-bulk-cf-'+fieldId); if(!sel) return;
  var val=sel.value; if(!val){ if(typeof showToast==='function')showToast('값을 선택하세요'); return; }
  var f=((typeof customFields!=='undefined'&&customFields&&customFields.tc)||[]).find(function(x){return x.id===fieldId;});
  var ids=Array.from(e3bSelTcs); if(!ids.length){ if(typeof showToast==='function')showToast('선택된 TC가 없습니다'); return; }
  var label=f?f.label:'값';
  if(!confirm('선택된 '+ids.length+'개 TC의 '+label+'을(를) "'+val+'"(으)로 덮어씁니다. 계속하시겠습니까?')) return;
  for(var i=0;i<ids.length;i++){ try{ await saveTCCustomField(ids[i],fieldId,val); }catch(e){} }
  if(typeof showToast==='function')showToast(label+' — '+ids.length+'개 TC에 적용되었습니다');
  e3bSetTcBodyHtml();
}
// ===== Requirements & Coverage — 3열 베타 (explorer3-beta) : [REQ] | [TC] | [절차] =====
var e3bSelReq=null, e3bSelTc=null, e3bSelFolder=null, e3bClosed=null;
var e3bC1=(function(){ try{ return localStorage.getItem('utop_e3b_c1')==='1'; }catch(e){ return false; } })();
var e3bC2=(function(){ try{ return localStorage.getItem('utop_e3b_c2')==='1'; }catch(e){ return false; } })();
var e3bTcTab={};
var e3bReqOpen=false, e3bTcInlineOpen=null;   // 2열 인라인 아코디언 상태 (REQ 카드 펼침 여부 · 펼쳐진 TC id)
var e3bTcCfFilter={};   // TC Summary 표 커스텀 필드 헤더 필터 — {fieldId: Set(선택값)}
var e3bTcPage=1;   // TC Summary 표 페이지네이션 — 현재 페이지(1부터)
var e3bTcPagerCache='';   // 최근 e3bTcListHtml() 호출이 계산한 페이지네이션 바 HTML(스크롤 영역 밖 별도 렌더용)
var e3bTcToolbarCache='';   // 최근 e3bTcListHtml() 호출이 계산한 툴바(New/More/톱니바퀴) HTML(스크롤 영역 밖 별도 렌더용 — 톱니바퀴 드롭다운이 표 스크롤에 잘리지 않도록)
var e3bTcPageSize=(function(){ try{ var s=localStorage.getItem('utop_e3_tc_pagesize'); var n=parseInt(s); if(n>0) return n; }catch(e){} return 100; })();   // 페이지당 표시 개수
var e3bTcColVis=(function(){ try{ var s=localStorage.getItem('utop_e3_tc_col_vis'); if(s) return JSON.parse(s)||{}; }catch(e){} return {}; })();   // TC Summary 표 열 표시/숨김 — {fieldId: false=숨김}
var e3bTcColOrder=(function(){ try{ var s=localStorage.getItem('utop_e3_tc_col_order'); if(s) return JSON.parse(s)||[]; }catch(e){} return []; })();   // TC Summary 표 열 배치 순서 — [fieldId, ...]
// 열 폭 (PC/브라우저별 개인 설정 — localStorage)
var e3bW1=260, e3bW2=480;
(function(){
  try{
    // REQ 트리 패널 폭이 과도하게 넓게 저장된 사용자가 있어 1회성으로 리셋(배지가 숫자만 표시되며 실제 폭이 훨씬 좁아짐)
    if(!localStorage.getItem('utop_e3b_w1_reset_20260714')){ localStorage.removeItem('utop_e3b_widths'); localStorage.setItem('utop_e3b_w1_reset_20260714','1'); return; }
    var s=localStorage.getItem('utop_e3b_widths'); if(s){var o=JSON.parse(s);if(o.w1&&o.w1>80)e3bW1=o.w1;if(o.w2&&o.w2>80)e3bW2=o.w2;}
  }catch(e){}
})();
function e3bSaveWidths(){ try{localStorage.setItem('utop_e3b_widths',JSON.stringify({w1:e3bW1,w2:e3bW2}));}catch(e){} }
// ── 검색/정렬/필터 상태 ──
var e3bSearch='', e3bSortKey='reqid', e3bSortDir=1, e3bTcSortKey='tcid', e3bTcSortDir=1;
var e3bFilterStatus='', e3bFilterPriority='', e3bFilterOpen=false;
// 폴더 하위 전체 ID 수집 (전역 — e3bTcListHtml·e3bPickFolder 등에서 공용)
function e3bDescIds(fid){ var out=[fid]; (reqFolders||[]).filter(function(c){return c.parent===fid;}).forEach(function(c){ out.push.apply(out,e3bDescIds(c.id)); }); return out; }
// ── 다중선택 상태 ──
var e3bSelReqs=new Set(), e3bSelTcs=new Set();
var e3bFlatReqOrder=[], e3bFlatTcOrder=[], e3bSelAnchorReq=null, e3bSelAnchorTc=null;
// ── 강조 색상(Accent) : 폴더명 / REQ ID / REQ 제목 / TC ID / TC Summary (브라우저 localStorage 개인 설정 — 원본 explorer3와 동일 키로 공유) ──
var E3B_ACCENT_DEF={folder:'#564a7e', reqid:'#2d6fd4', reqtitle:'#1a1d2e', tcid:'#2d6fd4', tcname:'#1a1d2e'};
var e3bAccent=(function(){
  var d={folder:E3B_ACCENT_DEF.folder, reqid:E3B_ACCENT_DEF.reqid, reqtitle:E3B_ACCENT_DEF.reqtitle, tcid:E3B_ACCENT_DEF.tcid, tcname:E3B_ACCENT_DEF.tcname};
  try{ var s=localStorage.getItem('utop_e3_accent'); if(s){ var o=JSON.parse(s); ['folder','reqid','reqtitle','tcid','tcname'].forEach(function(k){ if(o&&o[k]) d[k]=o[k]; }); } }catch(e){}
  return d;
})();
function e3bAccentSave(){ try{ localStorage.setItem('utop_e3_accent', JSON.stringify(e3bAccent)); }catch(e){} }
function e3bAccentSet(key,val){ if(!(key in e3bAccent)) return; e3bAccent[key]=val; e3bAccentSave(); renderExplorer3Beta(); }
// ── 표시 여부 : REQ ID / TC ID (사용자별 localStorage — 원본 explorer3 와 동일 로직 공유) ──
var e3bShowReqId=(function(){ return (typeof _e3ShowLoad==='function')?_e3ShowLoad('reqid', true):true; })();
var e3bShowTcId=(function(){ return (typeof _e3ShowLoad==='function')?_e3ShowLoad('tcid', true):true; })();
function _e3bLoadUiOptions(cb){
  try{
    if(typeof _e3ShowLoad==='function'){ e3bShowReqId=_e3ShowLoad('reqid', true); e3bShowTcId=_e3ShowLoad('tcid', true); }
    if(typeof e3ShowReqId!=='undefined') e3ShowReqId=e3bShowReqId;
    if(typeof e3ShowTcId!=='undefined') e3ShowTcId=e3bShowTcId;
  }catch(_e){}
  if(cb) cb();
}
_e3bLoadUiOptions(function(){
  var p=document.getElementById('page-explorer3-beta');
  if(p&&p.classList.contains('active')) renderExplorer3Beta();
  if(typeof _rcAccentRefresh==='function') _rcAccentRefresh();
});
function e3bSetShowReqId(v){
  e3bShowReqId=!!v;
  try{ if(typeof _e3ShowKey==='function') localStorage.setItem(_e3ShowKey('utop_e3_show_reqid'), v?'1':'0'); }catch(e){}
  try{ if(typeof e3ShowReqId!=='undefined') e3ShowReqId=!!v; }catch(_e){}
  renderExplorer3Beta();
  if(typeof _rcAccentRefresh==='function') _rcAccentRefresh();
}
function e3bSetShowTcId(v){
  e3bShowTcId=!!v;
  try{ if(typeof _e3ShowKey==='function') localStorage.setItem(_e3ShowKey('utop_e3_show_tcid'), v?'1':'0'); }catch(e){}
  try{ if(typeof e3ShowTcId!=='undefined') e3ShowTcId=!!v; }catch(_e){}
  renderExplorer3Beta();
  if(typeof _rcAccentRefresh==='function') _rcAccentRefresh();
}
// ── 글씨 굵게(Bold) : 폴더명 / REQ ID / REQ 제목 / TC ID / TC Summary (원본 explorer3와 동일 localStorage 키로 공유) ──
var E3B_BOLD_DEF={folder:true, reqid:true, reqtitle:false, tcid:true, tcname:false};
var e3bBold=(function(){
  var d={folder:E3B_BOLD_DEF.folder, reqid:E3B_BOLD_DEF.reqid, reqtitle:E3B_BOLD_DEF.reqtitle, tcid:E3B_BOLD_DEF.tcid, tcname:E3B_BOLD_DEF.tcname};
  try{ var s=localStorage.getItem('utop_e3_bold'); if(s){ var o=JSON.parse(s); ['folder','reqid','reqtitle','tcid','tcname'].forEach(function(k){ if(o&&typeof o[k]==='boolean') d[k]=o[k]; }); } }catch(e){}
  return d;
})();
function e3bBoldSave(){ try{ localStorage.setItem('utop_e3_bold', JSON.stringify(e3bBold)); }catch(e){} }
function e3bBoldSet(key,val){ if(!(key in e3bBold)) return; e3bBold[key]=!!val; e3bBoldSave(); renderExplorer3Beta(); }
function e3bBoldReset(key){ if(!(key in E3B_BOLD_DEF)) return; e3bBold[key]=E3B_BOLD_DEF[key]; e3bBoldSave(); renderExplorer3Beta(); }
// 굵기 CSS 값(설정 true면 700, 아니면 400)
function e3bFW(key){ return e3bBold[key]?'700':'400'; }
function e3bAccentReset(key){ if(!(key in E3B_ACCENT_DEF)) return; e3bAccent[key]=E3B_ACCENT_DEF[key]; e3bAccentSave(); renderExplorer3Beta(); }
// ── 글씨 크기(Font size) : 폴더명 / REQ ID / REQ 제목 / TC ID / TC Summary (원본 explorer3와 동일 localStorage 키로 공유) ──
var E3B_FONTSIZE_DEF={folder:12.5, reqid:11, reqtitle:12.5, tcid:12.5, tcname:12.5};
var e3bFontSize=(function(){
  var d={folder:E3B_FONTSIZE_DEF.folder, reqid:E3B_FONTSIZE_DEF.reqid, reqtitle:E3B_FONTSIZE_DEF.reqtitle, tcid:E3B_FONTSIZE_DEF.tcid, tcname:E3B_FONTSIZE_DEF.tcname};
  try{ var s=localStorage.getItem('utop_e3_fontsize'); if(s){ var o=JSON.parse(s); ['folder','reqid','reqtitle','tcid','tcname'].forEach(function(k){ if(o&&typeof o[k]==='number') d[k]=o[k]; }); } }catch(e){}
  return d;
})();
function e3bFontSizeSave(){ try{ localStorage.setItem('utop_e3_fontsize', JSON.stringify(e3bFontSize)); }catch(e){} }
function e3bFontSizeSet(key,val){ if(!(key in e3bFontSize)) return; var n=parseFloat(val); if(isNaN(n))return; n=Math.max(9,Math.min(20,n)); e3bFontSize[key]=n; e3bFontSizeSave(); renderExplorer3Beta(); if(typeof _rcAccentRefresh==='function') _rcAccentRefresh(); }
function e3bFontSizeReset(key){ if(!(key in E3B_FONTSIZE_DEF)) return; e3bFontSize[key]=E3B_FONTSIZE_DEF[key]; e3bFontSizeSave(); renderExplorer3Beta(); if(typeof _rcAccentRefresh==='function') _rcAccentRefresh(); }
// 글씨 크기 CSS 값(px)
function e3bFS(key){ return (e3bFontSize[key]||E3B_FONTSIZE_DEF[key]||12.5)+'px'; }
// 폰트 종류 (Tests Color 에서 지정) — 없으면 상속
function e3bFF(key){ try{ var v=localStorage.getItem('uta_rc_ff_'+key); return v||''; }catch(e){ return ''; } }
function e3bFFStyle(key){ var v=e3bFF(key); return v?('font-family:'+v+';'):''; }
function e3bFontFamilySet(key,val){ if(typeof renderExplorer3Beta==='function') renderExplorer3Beta(); }
// 색상 선택 팝오버 (프리셋 팔레트 + 커스텀 컬러피커 + 기본값 복원)
function e3bAccentPopup(e, key, label){
  if(e&&e.stopPropagation)e.stopPropagation();
  var old=document.getElementById('e3b-accent-pop'); if(old) old.remove();
  var presets=['#2d6fd4','#7c3aed','#00875a','#e8820c','#e53e5a','#0ca678','#564a7e','#1a1d2e','#8890a4','#c0392b','#b5730a','#1a52b0'];
  var cur=e3bAccent[key]||'#000000';
  var p=document.createElement('div');
  p.id='e3b-accent-pop';
  p.style.cssText='position:fixed;z-index:10001;background:#fff;border:1px solid var(--border);border-radius:11px;box-shadow:0 10px 34px rgba(20,30,60,0.22);padding:12px;width:236px;font-size:12px;';
  var sw=presets.map(function(c){ var on=(String(c).toLowerCase()===String(cur).toLowerCase()); return '<div onclick="e3bAccentSet(\''+key+'\',\''+c+'\');(function(){var x=document.getElementById(\'e3b-accent-pop\');if(x)x.remove();})();" title="'+c+'" style="width:26px;height:26px;border-radius:7px;background:'+c+';cursor:pointer;box-shadow:'+(on?'0 0 0 2px #fff,0 0 0 4px '+c:'inset 0 0 0 1px rgba(0,0,0,0.08)')+';"></div>'; }).join('');
  p.innerHTML='<div style="font-weight:800;color:var(--text);margin-bottom:9px;display:flex;align-items:center;gap:6px;"><i class="ti ti-palette" style="color:'+cur+';"></i>'+label+' 색상</div>'
    +'<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:7px;margin-bottom:11px;">'+sw+'</div>'
    +'<div style="display:flex;align-items:center;gap:8px;">'
      +'<label style="display:flex;align-items:center;gap:6px;cursor:pointer;flex:1;"><input type="color" value="'+cur+'" oninput="e3bAccentSet(\''+key+'\',this.value)" style="width:30px;height:26px;border:1px solid var(--border);border-radius:6px;padding:0;background:none;cursor:pointer;"><span style="color:var(--text2);">직접 선택</span></label>'
      +'<button onclick="e3bAccentReset(\''+key+'\');(function(){var x=document.getElementById(\'e3b-accent-pop\');if(x)x.remove();})();" style="font-size:11px;padding:5px 10px;border:1px solid var(--border);border-radius:7px;background:#fff;color:var(--text2);cursor:pointer;font-weight:600;">기본값</button>'
    +'</div>';
  document.body.appendChild(p);
  var mw=p.offsetWidth, mh=p.offsetHeight, x=(e?e.clientX:120), y=(e?e.clientY:120);
  if(x+mw>window.innerWidth) x=window.innerWidth-mw-8;
  if(y+mh>window.innerHeight) y=window.innerHeight-mh-8;
  p.style.left=Math.max(6,x)+'px'; p.style.top=Math.max(6,y+6)+'px';
  setTimeout(function(){ document.addEventListener('click', function _cl(ev){ var pp=document.getElementById('e3b-accent-pop'); if(pp && !pp.contains(ev.target)){ pp.remove(); document.removeEventListener('click', _cl); } }); }, 0);
}
// 헤더용 색상 버튼 (현재 색을 점으로 표시)
function e3bAccentBtn(key,label){ return '<button onclick="e3bAccentPopup(event,\''+key+'\',\''+label+'\')" title="'+label+' 색상 변경" style="width:22px;height:22px;border-radius:5px;border:1px solid #d6dce6;background:#fff;cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;flex-shrink:0;position:relative;"><i class="ti ti-palette" style="font-size:13px;color:'+e3bAccent[key]+';"></i></button>'; }
// ── 검색/정렬 조작 ──
function e3bOnSearch(v){ e3bSearch=(v||'').trim().toLowerCase(); e3bRebuildReqBody(); }
function e3bSetSort(k){ e3bSortKey=k; e3bRebuildReqBody(); }
function e3bToggleSortDir(){ e3bSortDir*=-1; var b=document.getElementById('e3b-sort-dir'); if(b)b.textContent=e3bSortDir>0?'↑':'↓'; e3bRebuildReqBody(); }
function e3bSetTcSort(k){ e3bTcSortKey=k; e3bRebuildTcBody(); }
function e3bToggleTcSortDir(){ e3bTcSortDir*=-1; var b=document.getElementById('e3b-tcsort-dir'); if(b)b.textContent=e3bTcSortDir>0?'↑':'↓'; e3bRebuildTcBody(); }
function e3bOnFilterStatus(v){ e3bFilterStatus=v||''; e3bRebuildReqBody(); }
function e3bOnFilterPriority(v){ e3bFilterPriority=v||''; e3bRebuildReqBody(); }
function e3bToggleFilter(){
  e3bFilterOpen=!e3bFilterOpen;
  var wrap=document.getElementById('e3b-filter-wrap');
  var btn=document.getElementById('e3b-filter-btn');
  if(wrap) wrap.style.display=e3bFilterOpen?'':'none';
  if(btn){ btn.style.background=e3bFilterOpen?'rgba(45,111,212,0.10)':'#fff'; btn.style.color=e3bFilterOpen?'var(--blue)':'var(--text2)'; btn.style.borderColor=e3bFilterOpen?'var(--blue)':'#d6dce6'; }
}
function e3bAddRootFolder(){ if(typeof expAddFolder==='function') expAddFolder(null); else if(typeof req2OpenFolderModal==='function') req2OpenFolderModal(null,'new'); }
function e3bReqMatchSearch(r){ if(!e3bSearch)return true; return (r.reqid||'').toLowerCase().includes(e3bSearch)||(r.title||'').toLowerCase().includes(e3bSearch); }
function e3bReqMatch(r){ return e3bReqMatchSearch(r)&&(!e3bFilterStatus||r.status===e3bFilterStatus)&&(!e3bFilterPriority||r.priority===e3bFilterPriority); }
function e3bTcMatchSearch(t){ if(!e3bSearch)return true; return (t.tcid||t.id||'').toLowerCase().includes(e3bSearch)||(t.name||'').toLowerCase().includes(e3bSearch); }
function e3bSortReqs(arr){ return arr.slice().sort(function(a,b){ var va='',vb=''; if(e3bSortKey==='title'){va=a.title||'';vb=b.title||'';}else{va=a.reqid||'';vb=b.reqid||'';} return va.localeCompare(vb)*e3bSortDir; }); }
function e3bSortTcs(arr){ return arr.slice().sort(function(a,b){ var va='',vb=''; if(e3bTcSortKey==='name'){va=a.name||'';vb=b.name||'';}else{va=a.tcid||a.id||'';vb=b.tcid||b.id||'';} return va.localeCompare(vb)*e3bTcSortDir; }); }
// 부분 갱신 헬퍼 (전체 재렌더 없이 본문만 교체)
function e3bRebuildReqBody(){
  // 스크롤 위치 유지 — innerHTML 재세팅 시 scrollTop 이 0 으로 튀는 문제 방지
  var rb=document.getElementById('e3b-req-body'); if(!rb) return;
  var _sc=rb.scrollTop||0;
  rb.innerHTML=e3bTreeHtml();
  if(_sc) rb.scrollTop=_sc;
}
// e3b-tc-body(스크롤 영역) 갱신 + 그 바깥(하단 고정) 페이지네이션 바 동기화 — 공용 헬퍼
function e3bSetTcBodyHtml(){
  var tb=document.getElementById('e3b-tc-body'); if(!tb) return;
  var _sc=tb.scrollTop;
  var wasOpen=(function(){ var p=document.getElementById('e3b-tc-col-pop'); return p&&p.style.display!=='none'; })();   // 톱니바퀴 팝업이 열려 있던 상태면 재조립 후에도 유지
  tb.innerHTML=e3bTcListHtml();
  tb.scrollTop=_sc;
  var pg=document.getElementById('e3b-tc-pager'); if(pg)pg.innerHTML=e3bTcPagerCache;
  var tw=document.getElementById('e3b-tc-toolbar-wrap'); if(tw){ tw.innerHTML=e3bTcToolbarCache; if(wasOpen) _e3bTcColPopReopen(); }
}
function e3bRebuildTcBody(){ e3bSetTcBodyHtml(); var bd=document.getElementById('e3b-tc-badges'); if(bd)bd.outerHTML=e3bTcCountBadges(); e3bRebuildTcHdr(); }
// ── 다중선택 헬퍼 ──
function e3bIsSel(type,id){ return type==='tc'?e3bSelTcs.has(id):e3bSelReqs.has(id); }
function e3bClearSel(){ e3bSelReqs.clear(); e3bSelTcs.clear(); e3bSelAnchorReq=null; e3bSelAnchorTc=null; }
function e3bToggleSelReq(id,ev){
  if(ev&&ev.shiftKey&&e3bSelAnchorReq){
    var a=e3bFlatReqOrder.indexOf(e3bSelAnchorReq), b=e3bFlatReqOrder.indexOf(id);
    if(a>=0&&b>=0){ var lo=Math.min(a,b),hi=Math.max(a,b); for(var i=lo;i<=hi;i++)e3bSelReqs.add(e3bFlatReqOrder[i]); e3bRebuildReqBody(); return; }
  }
  var on=!e3bSelReqs.has(id); if(on)e3bSelReqs.add(id); else e3bSelReqs.delete(id);
  e3bSelAnchorReq=id; e3bRebuildReqBody();
}
function e3bToggleSelTc(id,ev){
  if(ev&&ev.shiftKey&&e3bSelAnchorTc){
    var a=e3bFlatTcOrder.indexOf(e3bSelAnchorTc), b=e3bFlatTcOrder.indexOf(id);
    if(a>=0&&b>=0){ var lo=Math.min(a,b),hi=Math.max(a,b); for(var i=lo;i<=hi;i++)e3bSelTcs.add(e3bFlatTcOrder[i]); e3bRebuildTcBody(); return; }
  }
  var on=!e3bSelTcs.has(id); if(on)e3bSelTcs.add(id); else e3bSelTcs.delete(id);
  e3bSelAnchorTc=id; e3bRebuildTcBody();
}
async function e3bBulkDeleteReqs(){
  var ids=Array.from(e3bSelReqs); if(!ids.length){if(typeof showToast==='function')showToast('선택된 REQ가 없습니다');return;}
  if(!confirm(ids.length+'개 REQ를 삭제하시겠습니까?'))return;
  for(var i=0;i<ids.length;i++){ try{await expDeleteREQ(ids[i],true);}catch(e){} }
  e3bSelReqs.clear(); renderExplorer3Beta();
}
async function e3bBulkDeleteTcs(){
  var ids=Array.from(e3bSelTcs); if(!ids.length){if(typeof showToast==='function')showToast('선택된 TC가 없습니다');return;}
  if(!confirm(ids.length+'개 TC를 삭제하시겠습니까?'))return;
  for(var i=0;i<ids.length;i++){ try{await expDeleteTC(ids[i],true);}catch(e){} }
  e3bSelTcs.clear(); renderExplorer3Beta();
}
// TC ID 첫 세그먼트로 통신사 판별: KT / LGU(LGU+) / 그 외(공통=U 등)
function e3bTcCarrier(id){ var seg=String(id||'').split('-')[0].toUpperCase(); if(seg==='KT') return 'kt'; if(seg==='LGU'||seg==='LGUPLUS'||seg==='LGU+') return 'lgu'; return 'etc'; }
// 화면 표시용 ID — 통신사/공통 접두어 제거. <통신사>-REQ[-SYS]- 마커까지(포함) 잘라 뒤쪽만 표시.
// 예) U-REQ-SYS-SW-EPON-001 → SW-EPON-001, KT-REQ-SYS-SW-EPON-IOP-001 → SW-EPON-IOP-001,
//     LGUPLUS-REQ-L2-E59xxRL-001 → L2-E59xxRL-001, U-REQ-SYS-SW-ENV-TC-002 → SW-ENV-TC-002
function e3bDispId(id){
  var s=String(id||'');
  // 1) 표준 형태 (`PA1T-REQ-...` / `KT-REQ-SYS-...` 등): 프로젝트-REQ 접두 벗기고 뒤쪽만 표기
  var m=s.match(/^[^-]+-REQ(?:-SYS)?-(.+)$/); if(m) return m[1];
  // 2) 폴더 경로가 통째로 붙어있는 형태 (`PA1T-TD-1. 부품 변경-1-1. 메인 메모리/WDT TC-1-1-1. 부팅 1000회 반복`):
  //    프리픽스(첫 2 토큰) + 가장 안쪽 계층 번호(`1-1-1`)만 남기고 폴더 이름 자체는 벗김.
  //    각 계층은 `숫자[-숫자]*. 폴더명` 패턴 → 앞의 계층 번호만 이어붙임.
  var parts=s.split(/-(?=\d+[\d.\-]*\.\s)/);   // "1. ", "1-1. ", "1-1-1. " 등 계층 마커 앞에서 분할
  if(parts.length>=2){
    var head=parts[0];   // 예: PA1T-TD
    // 가장 마지막(가장 안쪽) 계층에서 번호만 뽑음: "1-1-1. 부팅 1000회 반복" → "1-1-1"
    var last=parts[parts.length-1];
    var lm=last.match(/^([\d]+(?:[-.][\d]+)*)\.\s/);
    if(lm) return head+'-'+lm[1];
  }
  return s;
}
// 선택한 REQ의 TC들을 통신사별로 집계해 Total/LGU+/KT 배지 HTML 반환 (Test Cases 헤더용)
function e3bTcCountBadges(){
  var rq=(reqList||[]).find(function(x){return x.id===e3bSelReq;});
  var tcs=rq?e3bReqTcs(rq):[];
  var total=tcs.length, lgu=0, kt=0;
  tcs.forEach(function(t){ var c=e3bTcCarrier(t.tcid||t.id); if(c==='lgu')lgu++; else if(c==='kt')kt++; });
  var badge=function(label,val,col,bg){ return '<span style="display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:800;color:'+col+';background:'+bg+';border-radius:8px;padding:2px 8px;white-space:nowrap;">'+label+'<span style="font-size:11px;">'+val+'</span></span>'; };
  return '<div id="e3b-tc-badges" style="display:flex;gap:5px;align-items:center;margin-right:4px;">'
    +badge('Total', total, '#475063', '#eef1f5')
    +badge('LGU+', lgu, '#c0392b', 'rgba(192,57,43,0.10)')
    +badge('KT', kt, '#1a52b0', 'rgba(26,82,176,0.10)')
    +'</div>';
}
// 전체 폴더/REQ 카운트 배지 HTML 반환 (Requirements 헤더용) — Total/LGU+/KT 배지와 동일 스타일
function e3bReqCountBadges(){
  var folders=(reqFolders||[]).length;
  var reqs=(reqList||[]).length;
  var tcs=(tcList||[]).length;
  var badge=function(ic,label,val,col,bg){ return '<span style="display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:800;color:'+col+';background:'+bg+';border-radius:8px;padding:2px 8px;white-space:nowrap;"><i class="ti '+ic+'" style="font-size:11px;"></i>'+label+' <span style="font-size:11px;">'+val+'</span></span>'; };
  return '<div id="e3b-req-badges" style="display:flex;gap:5px;align-items:center;flex-wrap:wrap;">'
    +badge('ti-folder','폴더', folders, '#e8a83c', 'transparent')
    +badge('ti-clipboard-text','REQ', reqs, '#7c3aed', 'transparent')
    +badge('ti-file-check','TC', tcs, '#00875a', 'transparent')
    +'</div>';
}
function e3bGW(pl){ var gg=(typeof expGuides==='function')?expGuides(pl):''; return gg?'<span style="display:flex;gap:6px;align-self:stretch;flex-shrink:0;margin:-5px 0;">'+gg+'</span>':''; }
function e3bReqTcs(r){ if(!r)return []; return (typeof expReqTCs==='function')?expReqTCs(r):tcList.filter(function(t){return t.req_id===r.id;}); }
// 검색어로 폴더 또는 하위에 표시할 REQ가 있는지 확인
function e3bFolderVisible(f){
  if(!e3bSearch && !e3bFilterStatus && !e3bFilterPriority) return true;
  var reqs=reqList.filter(function(r){return r.folder===f.id;});
  if(reqs.some(e3bReqMatch)) return true;
  return reqFolders.filter(function(c){return c.parent===f.id;}).some(e3bFolderVisible);
}
function e3bTreeHtml(){
  if(e3bClosed===null) e3bClosed=new Set();
  e3bFlatReqOrder=[];
  var roots=reqFolders.filter(function(f){return !f.parent;}).sort(function(a,b){return (a.order||0)-(b.order||0);});
  var h='';
  function folder(f, depth){
    if(!e3bFolderVisible(f)) return;
    var open=e3bSearch ? true : !e3bClosed.has(f.id);
    var subs=reqFolders.filter(function(x){return x.parent===f.id;}).sort(function(a,b){return (a.order||0)-(b.order||0);});
    var rqs=e3bSortReqs(reqList.filter(function(r){return r.folder===f.id;}).filter(e3bReqMatch));
    var hasChildren=subs.length||rqs.length;
    // 하위 합산 배지
    var aggIds=e3bDescIds(f.id);
    var aggReqs=reqList.filter(function(r){return aggIds.indexOf(r.folder)>=0;});
    var reqCnt=aggReqs.length;
    var tcCnt=aggReqs.reduce(function(s,rr){return s+e3bReqTcs(rr).length;},0);
    var pl=(8+depth*14)+'px';
    var fsel=e3bSelFolder===f.id;
    var fbg=fsel?'rgba(232,168,60,0.13)':'';
    h+='<div id="e3b-fd-'+f.id+'" draggable="true" ondragstart="e3bDragStart(event,\'folder\',\''+f.id+'\')" ondragover="e3bDragOver(event,\''+f.id+'\')" ondragleave="e3bDragLeave(event,\''+f.id+'\')" ondrop="e3bDrop(event,\''+f.id+'\')" oncontextmenu="e3bShowCtx(event,\''+f.id+'\',\'folder\')" title="드래그로 이동" style="display:flex;align-items:center;padding:0 8px;min-height:26px;padding-left:'+pl+';cursor:grab;font-size:'+e3bFS('folder')+';font-weight:'+e3bFW('folder')+';user-select:none;'+e3bFFStyle('folder')+'">'
      +(hasChildren?'<i class="ti ti-chevron-right" onclick="event.stopPropagation();e3bToggleFolder(\''+f.id+'\')" style="font-size:18px;flex-shrink:0;color:var(--text3);transition:transform 0.15s;cursor:pointer;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;border-radius:5px;margin-right:6px;'+(open?'transform:rotate(90deg)':'')+'"></i>':'<span style="width:22px;flex-shrink:0;margin-right:6px;"></span>')
      +'<span class="rc-folder" style="display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:1px 6px;border-radius:6px;color:'+e3bAccent.folder+';background:'+fbg+';" onmouseenter="this.style.background=\''+(fsel?'rgba(232,168,60,0.18)':'rgba(0,0,0,0.03)')+'\'" onmouseleave="this.style.background=\''+fbg+'\'">'
        +(function(){ var _fi=e3IconGet('folder'); var _openIc=(_fi.ic==='ti-folder')?(_fi.ic+(open?'-open':'')):_fi.ic; return '<i class="ti '+_openIc+'" style="font-size:'+_fi.size+'px;color:'+_fi.color+';flex-shrink:0;"></i>'; })()
        +'<span onclick="e3bPickFolder(\''+f.id+'\')" style="min-width:0;max-width:280px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;flex-shrink:1;">'+_bdEsc(f.name)+'</span>'
        +(reqCnt?'<span title="REQ '+reqCnt+'개" style="font-size:10px;font-weight:700;color:#c98a1e;background:rgba(232,168,60,0.16);border-radius:8px;padding:1px 7px;flex-shrink:0;">'+reqCnt+'</span>':'')
        +(tcCnt?'<span title="TC '+tcCnt+'개" style="font-size:10px;font-weight:700;color:var(--blue);background:rgba(45,111,212,0.1);border-radius:8px;padding:1px 7px;flex-shrink:0;">'+tcCnt+'</span>':'')
      +'</span>'
      +'</div>';
    if(open){
      subs.forEach(function(s){ folder(s, depth+1); });
      rqs.forEach(function(r){
        e3bFlatReqOrder.push(r.id);
        var tcs=e3bReqTcs(r);
        var sel=e3bSelReq===r.id;
        var msel=e3bSelReqs.has(r.id);
        var bg=msel?'rgba(45,111,212,0.16)':(sel?'rgba(45,111,212,0.12)':'');
        var rpl=(8+(depth+1)*14)+'px';
        h+='<div id="e3b-rq-'+r.id+'" draggable="true" ondragstart="e3bDragStart(event,\'req\',\''+r.id+'\')" onclick="e3bRowClickReq(event,\''+r.id+'\')" oncontextmenu="e3bShowCtx(event,\''+r.id+'\',\'req\')" title="'+_bdEsc((r.reqid||'')+' '+(r.title||''))+'" style="display:flex;align-items:center;padding:0 8px;min-height:24px;padding-left:'+rpl+';cursor:grab;font-size:12.5px;user-select:none;">'
          +'<span style="display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:1px 6px;border-radius:6px;background:'+bg+';'+(msel?'box-shadow:inset 2px 0 0 var(--blue);':'')+'" onmouseenter="this.style.background=\''+(bg||'rgba(0,0,0,0.03)')+'\'" onmouseleave="this.style.background=\''+bg+'\'">'
            +'<span style="width:12px;flex-shrink:0;"></span>'
            +(function(){ var _ri=e3IconGet('req'); return '<i class="ti '+_ri.ic+'" style="font-size:'+_ri.size+'px;color:'+_ri.color+';flex-shrink:0;"></i>'; })()
            +'<span style="max-width:280px;display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden;flex-shrink:1;">'
              +(e3bShowReqId?'<span class="rc-reqid" style="font-size:'+e3bFS('reqid')+';font-weight:'+e3bFW('reqid')+';color:'+e3bAccent.reqid+';white-space:nowrap;flex-shrink:0;'+(e3bFF('reqid')?('font-family:'+e3bFF('reqid')+';'):'font-family:monospace;')+'">'+_bdEsc(e3bDispId(r.reqid||''))+'</span>':'')
              +'<span class="rc-reqtitle" style="font-size:'+e3bFS('reqtitle')+';font-weight:'+e3bFW('reqtitle')+';color:'+e3bAccent.reqtitle+';opacity:'+(tcs.length?'1':'0.45')+';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'+e3bFFStyle('reqtitle')+'" title="'+_bdEsc(e3bDispId(r.reqid||''))+' '+_bdEsc(r.title||'')+'">'+_bdEsc(r.title||'')+'</span>'
            +'</span>'
            +'<span title="TC '+tcs.length+'개" style="font-size:10px;font-weight:700;color:'+(tcs.length?'var(--blue)':'#aab0bd')+';background:'+(tcs.length?'rgba(45,111,212,0.1)':'#eef0f3')+';border-radius:8px;padding:1px 7px;flex-shrink:0;">'+tcs.length+'</span>'
          +'</span>'
          +'</div>';
      });
    }
  }
  roots.forEach(function(r){ folder(r,0); });
  return h || '<div style="padding:24px;text-align:center;color:var(--text3);font-size:12px;">REQ가 없습니다</div>';
}
// REQ 행 클릭: Ctrl/Shift면 다중선택, 아니면 단일 선택
function e3bRowClickReq(ev, rid){
  if(ev) ev.stopPropagation();
  if(ev&&ev.shiftKey){
    // Shift: 앵커~현재 범위 선택 (앵커 없으면 현재를 앵커로)
    ev.preventDefault();
    if(!e3bSelAnchorReq){ e3bSelAnchorReq=rid; e3bSelReqs.add(rid); e3bRebuildReqBody(); return; }
    var a=e3bFlatReqOrder.indexOf(e3bSelAnchorReq), b=e3bFlatReqOrder.indexOf(rid);
    if(a>=0&&b>=0){ e3bSelReqs.clear(); var lo=Math.min(a,b),hi=Math.max(a,b); for(var i=lo;i<=hi;i++)e3bSelReqs.add(e3bFlatReqOrder[i]); e3bRebuildReqBody(); } return;
  }
  if(ev&&(ev.ctrlKey||ev.metaKey)){
    // Ctrl: 개별 토글 (앵커 갱신)
    ev.preventDefault();
    var on=!e3bSelReqs.has(rid); if(on)e3bSelReqs.add(rid); else e3bSelReqs.delete(rid);
    e3bSelAnchorReq=rid; e3bRebuildReqBody(); return;
  }
  // 일반 클릭: 단일 선택 + 앵커 갱신 (인라인 펼침/접기는 화살표 클릭으로만 — e3bToggleReqInline)
  _e3bSetFocus(1); e3bClearSel(); e3bSelAnchorReq=rid;
  e3bPickReq(rid);
}
// TC 행 클릭: Ctrl/Shift면 다중선택, 아니면 인라인 상세 토글
function e3bRowClickTc(ev, tcid){
  if(ev) ev.stopPropagation();
  if(ev&&ev.shiftKey){
    ev.preventDefault();
    if(!e3bSelAnchorTc){ e3bSelAnchorTc=tcid; e3bSelTcs.add(tcid); e3bRebuildTcBody(); return; }
    var a=e3bFlatTcOrder.indexOf(e3bSelAnchorTc), b=e3bFlatTcOrder.indexOf(tcid);
    if(a>=0&&b>=0){ e3bSelTcs.clear(); var lo=Math.min(a,b),hi=Math.max(a,b); for(var i=lo;i<=hi;i++)e3bSelTcs.add(e3bFlatTcOrder[i]); e3bRebuildTcBody(); } return;
  }
  if(ev&&(ev.ctrlKey||ev.metaKey)){
    ev.preventDefault();
    var on=!e3bSelTcs.has(tcid); if(on)e3bSelTcs.add(tcid); else e3bSelTcs.delete(tcid);
    e3bSelAnchorTc=tcid;
    if(e3bSelTcs.size===1){ e3bSelTc=Array.from(e3bSelTcs)[0]; } else if(!e3bSelTcs.size){ e3bSelTc=null; }
    e3bRebuildTcBody(); return;
  }
  _e3bSetFocus(2); e3bClearSel(); e3bSelAnchorTc=tcid;
  var willOpen=e3bTcInlineOpen!==tcid;
  e3bTcInlineOpen=willOpen?tcid:null;
  if(willOpen&&!e3bTcTab[tcid]) e3bTcTab[tcid]='info';
  e3bSelTc=tcid; e3bSaveSession();
  if(typeof _expSetHash==='function') _expSetHash('tc',tcid);
  e3bRebuildTcBody();
}
// TC Summary 제목 셀 클릭: 해당 TC를 선택(+주소창 링크 갱신)하되 인라인 펼침은 열지 않음(더블클릭은 이름 변경).
// Shift/Ctrl 클릭은 기존처럼 다중선택으로 위임.
function e3bTcNameCellClick(ev,tcid){
  if(ev) ev.stopPropagation();
  if(ev&&(ev.shiftKey||ev.ctrlKey||ev.metaKey)){ e3bRowClickTc(ev,tcid); return; }
  _e3bSetFocus(2); e3bClearSel(); e3bSelAnchorTc=tcid;
  e3bSelTc=tcid; e3bSaveSession();
  if(typeof _expSetHash==='function') _expSetHash('tc',tcid);
  e3bRebuildTcBody();
}
// 행 앞 체크박스로 다중 선택 (일괄 편집용) — Ctrl/Shift 없이 단순 토글
function e3bTcCheckToggle(ev,tcid){
  if(ev) ev.stopPropagation();
  var on=!e3bSelTcs.has(tcid); if(on)e3bSelTcs.add(tcid); else e3bSelTcs.delete(tcid);
  e3bSelAnchorTc=tcid;
  if(e3bSelTcs.size===1){ e3bSelTc=Array.from(e3bSelTcs)[0]; } else if(!e3bSelTcs.size){ e3bSelTc=null; }
  e3bRebuildTcBody();
}
function e3bTcCheckAll(checked){
  if(checked){ e3bFlatTcOrder.forEach(function(id){ e3bSelTcs.add(id); }); }
  else { e3bFlatTcOrder.forEach(function(id){ e3bSelTcs.delete(id); }); e3bSelTc=null; }
  if(e3bSelTcs.size===1){ e3bSelTc=Array.from(e3bSelTcs)[0]; }
  e3bRebuildTcBody();
}
// REQ 인라인 카드 (2열 최상단 — REQ 선택 시 펼쳐짐. TC 다중선택 시에도 화면은 그대로 유지, 일괄편집은 팝업으로 별도 처리)
function e3bReqInlineHtml(){
  var rq=reqList.find(function(x){return x.id===e3bSelReq;});
  if(!rq||e3bSelFolder) return '';
  var tab=e3bReqTab[rq.id]||'details';
  var rail=[ {id:'details',icon:'ti-info-circle',label:'Info'}, {id:'scenario',icon:'ti-file-text',label:'Description'}, {id:'impl',icon:'ti-code',label:'Implementation'}, {id:'issues',icon:'ti-bug',label:'Issues'} ];
  var content=(typeof req2TabContent==='function')?req2TabContent(rq,tab):'<div style="padding:20px;color:#888;">REQ 상세 로드 불가</div>';
  var open=!!e3bReqOpen;
  var hdr='<div onclick="e3bToggleReqInline()" style="display:flex;align-items:center;gap:7px;padding:9px 12px;cursor:pointer;user-select:none;background:rgba(124,58,237,0.06);'+(open?'border-bottom:1px solid var(--border);':'border-radius:9px;')+'">'
    +'<i class="ti ti-caret-'+(open?'down':'right')+'-filled" style="font-size:18px;color:#7c3aed;flex-shrink:0;"></i>'
    +(function(){ var _ri=e3IconGet('req'); return '<i class="ti '+_ri.ic+'" style="font-size:'+_ri.size+'px;color:'+_ri.color+';flex-shrink:0;"></i>'; })()
    +(e3bShowReqId?'<span style="font-size:11px;font-weight:800;color:#7c3aed;font-family:monospace;flex-shrink:0;">'+_bdEsc(e3bDispId(rq.reqid||''))+'</span>':'')
    +'<span style="font-size:13px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;">'+_bdEsc(rq.title||'')+'</span>'
    +'</div>';
  if(!open) return '<div style="margin-bottom:8px;border:1px solid var(--border);border-radius:9px;overflow:hidden;background:#fff;">'+hdr+'</div>';
  var tabsHtml=rail.map(function(t){ return '<button onclick="event.stopPropagation();e3bSwitchReqTab(\''+rq.id+'\',\''+t.id+'\')" style="display:inline-flex;align-items:center;gap:5px;padding:7px 12px;cursor:pointer;border:none;background:transparent;border-bottom:2px solid '+(tab===t.id?'var(--blue)':'transparent')+';color:'+(tab===t.id?'var(--blue)':'var(--text3)')+';font-size:12px;font-weight:'+(tab===t.id?'800':'600')+';white-space:nowrap;"><i class="ti '+t.icon+'" style="font-size:14px;"></i>'+t.label+'</button>'; }).join('');
  var h='<div style="margin-bottom:8px;border:1px solid var(--border);border-radius:9px;overflow:hidden;background:#fff;">'+hdr
    +'<div style="display:flex;align-items:center;gap:1px;padding:0 8px;background:#fafbfc;border-bottom:1px solid var(--border);overflow-x:auto;">'+tabsHtml+'</div>'
    +'<div style="padding:14px 16px;max-height:420px;overflow-y:auto;">'+content+'</div>'
    +'</div>';
  return h;
}
function e3bToggleReqInline(){ e3bReqOpen=!e3bReqOpen; var w=document.getElementById('e3b-req-inline'); if(w) w.outerHTML='<div id="e3b-req-inline">'+e3bReqInlineHtml()+'</div>'; if(e3bReqOpen&&e3bSelReq){ var tab=e3bReqTab[e3bSelReq]||'details'; if(tab==='scenario'){ if(typeof req2DestroyTiny==='function')req2DestroyTiny(e3bSelReq); setTimeout(function(){ if(typeof req2InitTiny==='function')req2InitTiny(e3bSelReq); },160); } else if(tab==='impl'){ if(typeof req2DestroyTiny==='function')req2DestroyTiny(e3bSelReq); setTimeout(function(){ if(typeof req2InitTinyImpl==='function')req2InitTinyImpl(e3bSelReq); },160); } } }
function e3bSwitchReqTab(reqid,tab){ e3bReqTab[reqid]=tab; var w=document.getElementById('e3b-req-inline'); if(w) w.outerHTML='<div id="e3b-req-inline">'+e3bReqInlineHtml()+'</div>';
  if(tab==='scenario'){ if(typeof req2DestroyTiny==='function')req2DestroyTiny(reqid); setTimeout(function(){ if(typeof req2InitTiny==='function')req2InitTiny(reqid); },160); var topo=document.getElementById('req2-sc-topo-'+reqid); if(topo&&typeof renderTopoEditor==='function'){ var r=reqList.find(function(x){return x.id===reqid;}); topo.innerHTML=renderTopoEditor(r); setTimeout(function(){ if(typeof topoDrawioInit==='function')topoDrawioInit(reqid); },220); } }
  else if(tab==='impl'){ if(typeof req2DestroyTiny==='function')req2DestroyTiny(reqid); setTimeout(function(){ if(typeof req2InitTinyImpl==='function')req2InitTinyImpl(reqid); },160); }
}
function e3bTcListHtml(){
  var tcs;
  e3bTcPagerCache='';
  e3bTcToolbarCache=_e3bTcToolbar();   // 툴바(New/More/톱니바퀴)는 스크롤 영역 밖(패널 상단 고정)에 별도로 렌더링
  if(e3bSelFolder){
    // 폴더 선택: 하위 전체 REQ의 TC 합산 표시
    var allFids=e3bDescIds(e3bSelFolder);
    var allReqs=reqList.filter(function(r){return allFids.indexOf(r.folder)>=0;});
    tcs=e3bSortTcs(allReqs.reduce(function(arr,r){return arr.concat(e3bReqTcs(r));},[]));
    if(!tcs.length) return '<div style="padding:34px 14px;text-align:center;color:var(--text3);font-size:12px;"><i class="ti ti-clipboard-off" style="font-size:28px;opacity:.3;display:block;margin-bottom:8px;"></i>이 폴더에는 TC가 없습니다</div>';
  } else {
    var rq=reqList.find(function(x){return x.id===e3bSelReq;});
    if(!rq){
      // 아무것도 선택 안 됐을 때: 전체 폴더/REQ 통계 배지 표시
      var _tf=reqFolders.length, _tr=(reqList||[]).length;
      var _lguF=0,_ktF=0; (reqList||[]).forEach(function(r){var c=e3bTcCarrier(r.reqid||r.id);if(c==='lgu')_lguF++;else if(c==='kt')_ktF++;});
      var _badge=function(ic,label,val,col,bg){ return '<span style="display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:800;color:'+col+';background:'+bg+';border-radius:8px;padding:2px 9px;white-space:nowrap;"><i class="ti '+ic+'" style="font-size:12px;"></i>'+label+' <span style="font-size:11px;">'+val+'</span></span>'; };
      return '<div style="padding:24px 14px;display:flex;flex-direction:column;align-items:center;gap:12px;">'
        +'<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;">'
        +_badge('ti-folder','폴더',_tf,'#e8a83c','rgba(232,168,60,0.13)')
        +_badge('ti-clipboard-text','REQ',_tr,'#7c3aed','rgba(124,58,237,0.10)')
        +'</div>'
        +'<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;">'
        +_badge('ti-sum','Total',_tr,'#475063','#eef1f5')
        +_badge('ti-building','LGU+',_lguF,'#c0392b','rgba(192,57,43,0.10)')
        +_badge('ti-building','KT',_ktF,'#1a52b0','rgba(26,82,176,0.10)')
        +'</div>'
        +'<div style="color:var(--text3);font-size:11px;">왼쪽에서 REQ 또는 폴더를 선택하세요</div>'
        +'</div>';
    }
    tcs=e3bSortTcs(e3bReqTcs(rq));
  }
  var reqInlineHtml='<div id="e3b-req-inline">'+e3bReqInlineHtml()+'</div>';
  if(!tcs.length) return reqInlineHtml+'<div style="padding:34px 14px;text-align:center;color:var(--text3);font-size:12px;"><i class="ti ti-clipboard-off" style="font-size:28px;opacity:.3;display:block;margin-bottom:8px;"></i>이 REQ에는 TC가 없습니다</div>';
  var _cols=e3bTcColDefs();
  var _visCols=_cols.filter(function(f){ return e3bTcColVis[f.id]!==false; });
  var _cfVal=function(t,f){ if(f.sys) return f.get(t)||''; return ((t.custom_fields||{})[f.id]||''); };
  tcs=tcs.filter(function(t){ return _visCols.every(function(f){ if(f.sys) return true; var sel=e3bTcCfFilter[f.id]; if(!sel||!sel.size) return true; var v=_cfVal(t,f); if(f.type==='MultiSelect'){ var arr=(v||'').split(',').filter(Boolean); return arr.some(function(x){return sel.has(x);}); } return sel.has(v); }); });
  var _tcTotal=tcs.length;
  var _tcPageCount=Math.max(1,Math.ceil(_tcTotal/e3bTcPageSize));
  if(e3bTcPage>_tcPageCount) e3bTcPage=_tcPageCount;
  if(e3bTcPage<1) e3bTcPage=1;
  var _tcPageStart=(e3bTcPage-1)*e3bTcPageSize;
  tcs=tcs.slice(_tcPageStart,_tcPageStart+e3bTcPageSize);
  var th='position:sticky;top:0;padding:7px 9px;text-align:left;font-size:12.5px;font-weight:800;color:#475063;background:#eef1f5;border-bottom:1px solid #cfd4dc;white-space:nowrap;z-index:2;';
  var _stepN=function(t){
    // checks 배열이 실제 로드돼 있으면 그 결과(0 포함)를 신뢰. 배열 자체가 없을 때만 서버 메타 fallback.
    if(Array.isArray(t.checks)) return t.checks.filter(function(x){return (x.kind||'cli')==='cli';}).length;
    if(typeof t._cli_count==='number') return t._cli_count;
    if(typeof t._checks_count==='number') return t._checks_count;
    return (t.steps||[]).length;
  };
  var _colN=(e3bShowTcId?3:2)+_visCols.length;
  var _cfBadge=function(f,v){
    if(f.sys) return v?('<span style="font-size:11.5px;color:var(--text2);">'+_bdEsc(v)+'</span>'):'<span style="font-size:11px;color:#c7ccd6;">—</span>';
    if(!v) return '<span style="font-size:11px;color:#c7ccd6;">—</span>';
    if(f.type==='MultiSelect'){
      var arr=v.split(',').filter(Boolean);
      if(!arr.length) return '<span style="font-size:11px;color:#c7ccd6;">—</span>';
      return arr.map(function(sv){ var o=(f.options||[]).find(function(x){return cfOptValue(x)===sv;}); var oc=o?cfOptColor(o):'#666'; return '<span style="font-size:10px;font-weight:700;padding:1px 7px;border-radius:9px;background:'+cfTint(oc)+';color:'+oc+';white-space:nowrap;margin:1px;display:inline-block;">'+_bdEsc(sv)+'</span>'; }).join('');
    }
    var o=(f.options||[]).find(function(x){return cfOptValue(x)===v;}); var oc=o?cfOptColor(o):'#666';
    return '<span style="font-size:10.5px;font-weight:700;padding:2px 9px;border-radius:9px;background:'+cfTint(oc)+';color:'+oc+';white-space:nowrap;">'+_bdEsc(v)+'</span>';
  };
  e3bFlatTcOrder=[];
  var rows=tcs.map(function(t){
    var id=t.tcid||t.id; e3bFlatTcOrder.push(id);
    var sel=e3bSelTc===id; var msel=e3bSelTcs.has(id); var sn=_stepN(t);
    var open=e3bTcInlineOpen===id;
    var bg=(open||msel)?'rgba(0,200,150,0.28)':(sel?'rgba(45,111,212,0.10)':'');
    var hoverBg=(open||msel)?'rgba(0,200,150,0.28)':'rgba(0,200,150,0.14)';
    var row='<tr draggable="true" ondragstart="e3bDragStart(event,\'tc\',\''+_bdEsc(id)+'\')" oncontextmenu="e3bShowCtx(event,\''+_bdEsc(id)+'\',\'tc\')" style="user-select:none;background:'+bg+';cursor:grab;" onmouseenter="this.style.background=\''+hoverBg+'\'" onmouseleave="this.style.background=\''+bg+'\'">'
      +'<td style="width:24px;padding:6px 9px;border-bottom:1px solid #eef0f3;text-align:center;" onclick="event.stopPropagation();e3bTcCheckToggle(event,\''+_bdEsc(id)+'\')"><input type="checkbox" '+(msel?'checked':'')+' onclick="event.stopPropagation();e3bTcCheckToggle(event,\''+_bdEsc(id)+'\')" style="width:14px;height:14px;cursor:pointer;vertical-align:middle;"></td>'
      +'<td onclick="e3bRowClickTc(event,\''+_bdEsc(id)+'\')" title="펼쳐서 상세 정보 보기/수정" style="width:20px;padding:6px 9px;border-bottom:1px solid #eef0f3;text-align:center;cursor:pointer;"><i class="ti ti-caret-'+(open?'down':'right')+'-filled" style="font-size:17px;color:var(--text3);"></i></td>'
      +(e3bShowTcId?'<td class="rc-tcid" onclick="event.stopPropagation();(typeof cbOpenTcPopup===\'function\')&&cbOpenTcPopup(\''+_bdEsc(id)+'\')" title="클릭: TC 상세 팝업 열기" style="padding:6px 9px;border-bottom:1px solid #eef0f3;font-size:'+e3bFS('tcid')+';color:'+e3bAccent.tcid+';font-weight:'+e3bFW('tcid')+';white-space:nowrap;cursor:pointer;text-decoration:underline;text-underline-offset:2px;'+e3bFFStyle('tcid')+'">'+_bdEsc(e3bDispId(id))+'</td>':'')
      +'<td onclick="e3bTcNameCellClick(event,\''+_bdEsc(id)+'\')" title="더블클릭하여 이름 변경" style="padding:6px 9px;border-bottom:1px solid #eef0f3;font-size:'+e3bFS('tcname')+';'+e3bFFStyle('tcname')+'">'
        +'<span class="rc-tcname" ondblclick="e3bTcNameEditStart(event,this)" onblur="e3bTcNameEditCommit(this,\''+_bdEsc(id)+'\')" onkeydown="e3bTcNameEditKey(event,this)" style="color:'+e3bAccent.tcname+';font-weight:'+e3bFW('tcname')+';outline:none;border-radius:4px;padding:2px 4px;margin:-2px -4px;">'+_bdEsc(t.name||'')+'</span>'
        +' <span style="font-size:10.5px;font-weight:800;color:'+(sn?'#2d6fd4':'#aab0bd')+';background:'+(sn?'rgba(45,111,212,0.1)':'#eef0f3')+';border-radius:8px;padding:1px 7px;margin-left:4px;" title="시험 절차(스텝) 개수">'+sn+'</span></td>'
      +_visCols.map(function(f){
        var editing=!f.sys&&e3bTcCellEdit&&e3bTcCellEdit.tcid===id&&e3bTcCellEdit.fieldId===f.id;
        var inner=editing?_e3bTcCellEditHtml(t,f):_cfBadge(f,_cfVal(t,f));
        var attrs=f.sys?'':(' oncontextmenu="e3bTcCellCtx(event,\''+_bdEsc(id)+'\',\''+f.id+'\')"'+(editing?'':' ondblclick="event.stopPropagation();e3bTcCellEditOpen(\''+_bdEsc(id)+'\',\''+f.id+'\')"'));
        return '<td'+attrs+' style="padding:'+(editing?'3px 5px':'6px 5px')+';border-bottom:1px solid #eef0f3;white-space:nowrap;text-align:right;'+(f.sys?'':'cursor:pointer;')+'" title="'+(f.sys||editing?'':'더블클릭하여 값 수정')+'">'+inner+'</td>';
      }).join('')
      +'</tr>';
    if(open){ row+='<tr id="e3b-tc-inline-'+_bdEsc(id)+'"><td colspan="'+_colN+'" style="padding:0;border-top:2px solid rgba(0,135,90,0.35);border-bottom:1px solid #eef0f3;background:#fbfcfe;">'+e3bTcInlineHtml(id)+'</td></tr>'; }
    return row;
  }).join('');
  var _cfHeaderTh=function(f){
    var _drag='draggable="true" ondragstart="_e3bTcColDragStart(event,\''+f.id+'\')" ondragover="_e3bTcColDragOver(event)" ondrop="_e3bTcColDrop(event,\''+f.id+'\')"';
    if(f.sys) return '<th '+_drag+' style="'+th+'padding-left:5px;padding-right:5px;white-space:nowrap;text-align:right;cursor:grab;">'+_bdEsc(f.label)+'</th>';
    var sel=e3bTcCfFilter[f.id]; var active=!!(sel&&sel.size);
    var isOpen=e3bTcCfPopOpen===f.id;
    return '<th '+_drag+' style="'+th+'padding-left:5px;padding-right:5px;white-space:nowrap;text-align:right;cursor:grab;'+(active?'color:#2d6fd4;':'')+'">'
      +'<span style="position:relative;display:inline-block;">'
      +'<span onclick="event.stopPropagation();e3bTcCfFilterOpen(event,\''+f.id+'\')" style="cursor:pointer;display:inline-flex;align-items:center;gap:3px;justify-content:flex-end;">'+_bdEsc(f.label)+'<i class="ti ti-chevron-down" style="font-size:11px;'+(active?'color:#2d6fd4;':'opacity:.5;')+'"></i>'+(active?'<span style="width:6px;height:6px;border-radius:50%;background:#2d6fd4;display:inline-block;"></span>':'')+'</span>'
      +'<span id="e3b-tc-cf-pop" data-field="'+f.id+'" style="display:'+(isOpen?'flex':'none')+';position:absolute;top:calc(100% + 4px);right:0;z-index:10001;background:#fff;border:1px solid var(--border);border-radius:9px;box-shadow:0 10px 30px rgba(20,30,60,0.18);padding:8px;min-width:170px;max-height:280px;overflow:auto;font-size:12.5px;font-weight:400;text-align:left;flex-direction:column;cursor:default;">'+(isOpen?_e3bTcCfPopHtml(f.id):'')+'</span>'
      +'</span></th>';
  };
  var _allChecked=tcs.length&&tcs.every(function(t){ return e3bSelTcs.has(t.tcid||t.id); });
  e3bTcPagerCache=_e3bTcPagerHtml(_tcTotal,_tcPageCount);   // 페이지네이션 바는 스크롤 영역 밖(패널 하단 고정)에 별도로 렌더링 — e3bRebuildTcBody/조립부에서 사용
  return reqInlineHtml+'<table style="width:100%;border-collapse:collapse;table-layout:auto;"><thead><tr>'
    +'<th style="'+th+'width:24px;text-align:center;"><input type="checkbox" '+(_allChecked?'checked':'')+' onclick="event.stopPropagation();e3bTcCheckAll(this.checked)" title="전체 선택" style="width:14px;height:14px;cursor:pointer;vertical-align:middle;"></th>'
    +'<th style="'+th+'width:20px;"></th>'
    +(e3bShowTcId?'<th style="'+th+'width:1%;white-space:nowrap;">TC ID</th>':'')
    +'<th style="'+th+'width:100%;font-size:13.5px;">TC Summary</th>'
    +_visCols.map(_cfHeaderTh).join('')
    +'</tr></thead><tbody>'+(rows||'<tr><td colspan="'+(_colN+1)+'" style="padding:24px;text-align:center;color:var(--text3);font-size:12px;">필터 조건에 맞는 TC가 없습니다</td></tr>')+'</tbody></table>';
}
// Zephyr Scale식 표 하단 페이지네이션 — "1-100 of 2910" + 페이지당 개수 선택 + 페이지 번호 이동
function _e3bTcPagerHtml(total,pageCount){
  if(!total) return '';
  var start=total?((e3bTcPage-1)*e3bTcPageSize+1):0;
  var end=Math.min(total,e3bTcPage*e3bTcPageSize);
  var sizeOpts=[25,50,100,200,500];
  var sizeSel='<select onchange="e3bTcPageSizeSet(this.value)" style="font-size:11.5px;padding:3px 6px;border:1px solid var(--border);border-radius:6px;background:#fff;outline:none;cursor:pointer;">'+sizeOpts.map(function(n){ return '<option value="'+n+'"'+(n===e3bTcPageSize?' selected':'')+'>'+n+'</option>'; }).join('')+'</select>';
  var btn=function(label,page,disabled,active){ return '<button '+(disabled?'disabled':'onclick="e3bTcPageGo('+page+')"')+' style="min-width:26px;height:26px;padding:0 6px;border-radius:6px;border:1px solid '+(active?'var(--blue)':'var(--border)')+';background:'+(active?'var(--blue)':'#fff')+';color:'+(active?'#fff':disabled?'#c7ccd6':'var(--text2)')+';font-size:11.5px;font-weight:700;cursor:'+(disabled?'default':'pointer')+';">'+label+'</button>'; };
  var pages='';
  var winStart=Math.max(1,e3bTcPage-2), winEnd=Math.min(pageCount,winStart+4); winStart=Math.max(1,winEnd-4);
  if(winStart>1){ pages+=btn('1',1,false,e3bTcPage===1); if(winStart>2) pages+='<span style="color:var(--text3);padding:0 2px;">…</span>'; }
  for(var p=winStart;p<=winEnd;p++){ pages+=btn(String(p),p,false,p===e3bTcPage); }
  if(winEnd<pageCount){ if(winEnd<pageCount-1) pages+='<span style="color:var(--text3);padding:0 2px;">…</span>'; pages+=btn(String(pageCount),pageCount,false,e3bTcPage===pageCount); }
  return '<div style="display:flex;align-items:center;padding:9px 11px;border-top:1px solid var(--border);flex-wrap:wrap;">'
    +'<div style="flex:1;display:flex;align-items:center;gap:4px;">'
      +btn('<i class="ti ti-chevron-left" style="font-size:13px;"></i>',e3bTcPage-1,e3bTcPage<=1,false)
      +pages
      +btn('<i class="ti ti-chevron-right" style="font-size:13px;"></i>',e3bTcPage+1,e3bTcPage>=pageCount,false)
    +'</div>'
    +'<div style="flex:1;display:flex;align-items:center;justify-content:center;gap:10px;">'
      +'<span style="font-size:11.5px;color:var(--text3);white-space:nowrap;">페이지당</span>'+sizeSel
      +'<span style="font-size:11.5px;color:var(--text3);white-space:nowrap;">'+start+'-'+end+' / 전체 '+total+'</span>'
    +'</div>'
    +'<div style="flex:1;"></div>'
  +'</div>';
}
function e3bTcPageGo(p){ e3bTcPage=p; e3bSaveSession(); e3bRebuildTcBody(); }
function e3bTcPageSizeSet(v){ var n=parseInt(v)||100; e3bTcPageSize=n; e3bTcPage=1; try{ localStorage.setItem('utop_e3_tc_pagesize',String(n)); }catch(e){} e3bSaveSession(); e3bRebuildTcBody(); }
// TC Summary 표에 노출 가능한 전체 컬럼 정의 — 시스템 필드(생성자·변경자·생성일·변경일) + TC 커스텀 필드(show_info)
function e3bTcColDefs(){
  var fmtDate=function(d){ if(!d) return '-'; var dt=new Date(d); return isNaN(dt)?d:dt.toLocaleDateString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).replace(/\. /g,'/').replace('.',''); };
  var sysCols=[
    {id:'_sys_model_group',label:'모델그룹', sys:true, get:function(t){ return t.modelGroup||''; }},
    {id:'_sys_model',      label:'모델명',   sys:true, get:function(t){ return t.model||''; }},
    {id:'_sys_created_by', label:'생성자', sys:true, get:function(t){ return t.created_by||t.author||t.owner||''; }},
    {id:'_sys_updated_by', label:'변경자', sys:true, get:function(t){ return t.updated_by||''; }},
    {id:'_sys_created_at', label:'생성일', sys:true, get:function(t){ return t.created_at?fmtDate(t.created_at):''; }},
    {id:'_sys_updated_at', label:'변경일', sys:true, get:function(t){ return t.updated_at?fmtDate(t.updated_at):''; }}
  ];
  var cfCols=((typeof customFields!=='undefined'&&customFields&&customFields.tc)||[]).filter(function(f){return f.active!==false&&f.show_info!==false;});
  var all=sysCols.concat(cfCols);
  var order=e3bTcColOrder;
  if(order&&order.length){
    var byId={}; all.forEach(function(f){ byId[f.id]=f; });
    var sorted=order.map(function(id){ return byId[id]; }).filter(Boolean);
    all.forEach(function(f){ if(order.indexOf(f.id)<0) sorted.push(f); });   // 순서 정보 없는 새 필드는 뒤에 추가
    return sorted;
  }
  return all;
}
// 표시할 열 선택 메뉴 (열 설정 아이콘 클릭) — Zephyr Scale 스타일: 검색창 + Restore defaults + 체크리스트
var _e3bTcColSearch='';
function _e3bTcColPopHtml(){
  var cols=e3bTcColDefs();
  var q=(_e3bTcColSearch||'').trim().toLowerCase();
  var opts=cols.filter(function(f){ return !q||f.label.toLowerCase().indexOf(q)>=0; }).map(function(f){
    var on=(e3bTcColVis[f.id]!==false);
    return '<div draggable="true" data-colid="'+f.id+'" ondragstart="_e3bTcColDragStart(event,\''+f.id+'\')" ondragover="_e3bTcColDragOver(event)" ondrop="_e3bTcColDrop(event,\''+f.id+'\')" style="display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:6px;cursor:pointer;" onmouseenter="this.style.background=\'#f5f7fb\'" onmouseleave="this.style.background=\'transparent\'">'
      +'<i class="ti ti-grip-vertical" style="font-size:13px;color:#c7ccd6;cursor:grab;flex-shrink:0;"></i>'
      +'<span onclick="e3bTcColVisToggle(\''+f.id+'\')" style="width:15px;height:15px;border-radius:4px;border:1.5px solid '+(on?'#2d6fd4':'#c7ccd6')+';background:'+(on?'#2d6fd4':'#fff')+';display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:pointer;">'+(on?'<i class="ti ti-check" style="font-size:10px;color:#fff;"></i>':'')+'</span>'
      +'<span onclick="e3bTcColVisToggle(\''+f.id+'\')" style="flex:1;font-size:12.5px;cursor:pointer;'+(f.sys?'color:var(--text2);':'color:var(--text);')+'">'+_bdEsc(f.label)+'</span></div>';
  }).join('');
  if(!opts) opts='<div style="padding:14px 8px;text-align:center;color:var(--text3);font-size:11.5px;">일치하는 열이 없습니다</div>';
  return '<div style="padding:8px 8px 6px;">'
    +'<div style="position:relative;">'
      +'<i class="ti ti-search" style="position:absolute;left:8px;top:50%;transform:translateY(-50%);font-size:13px;color:#b8bcc9;"></i>'
      +'<input id="e3b-tc-col-search" value="'+_bdEsc(_e3bTcColSearch)+'" oninput="_e3bTcColSearchInput(this.value)" placeholder="Search..." style="width:100%;box-sizing:border-box;font-size:12px;padding:6px 8px 6px 26px;border:1px solid var(--border);border-radius:6px;outline:none;">'
    +'</div>'
    +'<div onclick="_e3bTcColRestoreDefaults()" style="margin-top:7px;font-size:11.5px;font-weight:700;color:#2d6fd4;cursor:pointer;">Restore defaults</div>'
  +'</div>'
  +'<div style="height:1px;background:var(--border);"></div>'
  +'<div style="padding:6px 4px;max-height:520px;overflow-y:auto;">'+opts+'</div>';
}
function _e3bTcColSearchInput(v){
  _e3bTcColSearch=v;
  var pop=document.getElementById('e3b-tc-col-pop'); if(!pop) return;
  pop.innerHTML=_e3bTcColPopHtml();
  var inp=document.getElementById('e3b-tc-col-search'); if(inp){ inp.focus(); var l=inp.value.length; try{inp.setSelectionRange(l,l);}catch(e){} }
}
function _e3bTcColRestoreDefaults(){
  e3bTcColVis={}; e3bTcColOrder=[];
  try{ localStorage.removeItem('utop_e3_tc_col_vis'); localStorage.removeItem('utop_e3_tc_col_order'); }catch(e){}
  e3bSetTcBodyHtml();
  if(typeof showToast==='function')showToast('기본 설정으로 복원되었습니다');
}
// e3bSetTcBodyHtml()가 툴바(톱니바퀴+팝업 컨테이너)를 통째로 새로 그리므로, 팝업이 열려 있던 상태였다면 재조립 후 다시 열어줌
function _e3bTcColPopReopen(){
  var pop=document.getElementById('e3b-tc-col-pop'); if(!pop) return;
  pop.style.display='flex'; pop.innerHTML=_e3bTcColPopHtml();
  var inp=document.getElementById('e3b-tc-col-search'); if(inp) inp.focus();
}
var _e3bTcColDragId=null;
function _e3bTcColDragStart(ev,id){ _e3bTcColDragId=id; try{ ev.dataTransfer.effectAllowed='move'; }catch(e){} }
function _e3bTcColDragOver(ev){ ev.preventDefault(); }
function _e3bTcColDrop(ev,targetId){
  ev.preventDefault();
  var dragId=_e3bTcColDragId; _e3bTcColDragId=null;
  if(!dragId||dragId===targetId) return;
  var cols=e3bTcColDefs().map(function(f){ return f.id; });
  var from=cols.indexOf(dragId), to=cols.indexOf(targetId);
  if(from<0||to<0) return;
  cols.splice(to,0,cols.splice(from,1)[0]);
  e3bTcColOrder=cols;
  try{ localStorage.setItem('utop_e3_tc_col_order',JSON.stringify(e3bTcColOrder)); }catch(e){}
  e3bSetTcBodyHtml();
}
function e3bTcColMenuOpen(ev){
  // 버튼을 감싼 position:relative 컨테이너 안의 팝업(position:absolute;top:100%;right:0)을 그대로 열고 닫음.
  // 좌표 계산(getBoundingClientRect/window.innerWidth) 없이 순수 CSS로 버튼에 물리적으로 붙어있어
  // 임베디드 웹뷰 등 환경과 무관하게 항상 버튼 바로 아래에 정확히 표시됨.
  ev.stopPropagation();
  var p=document.getElementById('e3b-tc-col-pop'); if(!p) return;
  var isOpen=p.style.display!=='none';
  if(isOpen){ p.style.display='none'; document.removeEventListener('mousedown',_e3bTcColPopOutside); return; }
  _e3bTcColSearch='';
  p.style.display='flex';
  p.innerHTML=_e3bTcColPopHtml();
  var inp=document.getElementById('e3b-tc-col-search'); if(inp) inp.focus();
  setTimeout(function(){ document.addEventListener('mousedown',_e3bTcColPopOutside); },0);
}
function _e3bTcColPopOutside(ev){ var p=document.getElementById('e3b-tc-col-pop'); if(p&&!p.contains(ev.target)&&!ev.target.closest('button[onclick*="e3bTcColMenuOpen"]')){ p.style.display='none'; document.removeEventListener('mousedown',_e3bTcColPopOutside); } }
function e3bTcColVisToggle(fieldId){
  e3bTcColVis[fieldId]=(e3bTcColVis[fieldId]===false)?true:false;
  try{ localStorage.setItem('utop_e3_tc_col_vis',JSON.stringify(e3bTcColVis)); }catch(e){}
  e3bSetTcBodyHtml();
}
// TC Summary 표 헤더 커스텀 필드 필터 드롭다운
// 열 설정(톱니바퀴) 드롭다운과 동일하게 좌표 계산 없이 순수 CSS(position:relative 헤더 + position:absolute 팝업)로
// 필드 바로 아래에 항상 붙어서 표시됨(임베디드 웹뷰 등 환경과 무관).
var e3bTcCfPopOpen=null;
function _e3bTcCfPopHtml(fieldId){
  var f=((typeof customFields!=='undefined'&&customFields&&customFields.tc)||[]).find(function(x){return x.id===fieldId;}); if(!f) return '';
  var sel=e3bTcCfFilter[fieldId]||new Set();
  var opts=(f.options||[]).map(function(o){
    var ov=cfOptValue(o); var oc=cfOptColor(o); var on=sel.has(ov);
    return '<div onclick="event.stopPropagation();e3bTcCfFilterToggle(\''+fieldId+'\',\''+ov.replace(/'/g,"\\'")+'\')" style="display:flex;align-items:center;gap:7px;padding:6px 8px;border-radius:6px;cursor:pointer;" onmouseenter="this.style.background=\'#f5f7fb\'" onmouseleave="this.style.background=\'transparent\'">'
      +'<span style="width:14px;height:14px;border-radius:4px;border:1.5px solid '+(on?'#2d6fd4':'#c7ccd6')+';background:'+(on?'#2d6fd4':'#fff')+';display:flex;align-items:center;justify-content:center;flex-shrink:0;">'+(on?'<i class="ti ti-check" style="font-size:10px;color:#fff;"></i>':'')+'</span>'
      +'<span style="width:8px;height:8px;border-radius:2px;background:'+oc+';flex-shrink:0;"></span>'
      +'<span style="flex:1;">'+_bdEsc(ov)+'</span></div>';
  }).join('');
  return '<div style="font-size:10.5px;font-weight:800;color:var(--text3);padding:2px 8px 6px;">'+_bdEsc(f.label)+' 필터</div>'+opts
    +(sel.size?'<div style="border-top:1px solid var(--border);margin-top:4px;padding-top:4px;"><div onclick="event.stopPropagation();e3bTcCfFilterClear(\''+fieldId+'\')" style="padding:6px 8px;border-radius:6px;cursor:pointer;color:var(--red);font-weight:700;text-align:center;" onmouseenter="this.style.background=\'#fdf0ee\'" onmouseleave="this.style.background=\'transparent\'">필터 해제</div></div>':'');
}
function e3bTcCfFilterOpen(ev,fieldId){
  ev.stopPropagation();
  e3bTcCfPopOpen=(e3bTcCfPopOpen===fieldId)?null:fieldId;
  e3bSetTcBodyHtml();
  if(e3bTcCfPopOpen) setTimeout(function(){ document.addEventListener('mousedown',_e3bTcCfPopOutside); },0);
  else document.removeEventListener('mousedown',_e3bTcCfPopOutside);
}
function _e3bTcCfPopOutside(ev){
  var p=document.getElementById('e3b-tc-cf-pop');
  if(p&&!p.contains(ev.target)&&!ev.target.closest('span[onclick*="e3bTcCfFilterOpen"]')){ e3bTcCfPopOpen=null; e3bSetTcBodyHtml(); document.removeEventListener('mousedown',_e3bTcCfPopOutside); }
}
function e3bTcCfFilterToggle(fieldId,val){
  var sel=e3bTcCfFilter[fieldId]; if(!sel){ sel=new Set(); e3bTcCfFilter[fieldId]=sel; }
  if(sel.has(val)) sel.delete(val); else sel.add(val);
  e3bTcPage=1;
  e3bSetTcBodyHtml();
}
function e3bTcCfFilterClear(fieldId){
  delete e3bTcCfFilter[fieldId];
  e3bTcPage=1;
  e3bTcCfPopOpen=null;
  e3bSetTcBodyHtml();
  document.removeEventListener('mousedown',_e3bTcCfPopOutside);
}
// TC 인라인 상세 (2열 TC 행 클릭 시 그 아래에 펼쳐짐) — 3열 상세(e3bRenderDetail)와 동일한 셸·탭 재사용
function e3bTcInlineHtml(tcid){
  var tc=tcList.find(function(t){return (t.tcid===tcid)||(t.id===tcid);});
  if(!tc) return '';
  // History 카운트 배지 반영 위해 서버 실행 이력을 lazy 로드 (History 탭 진입 전이라도)
  try{
    if(typeof _loadRunHistoryFromServer==='function' && typeof _runHistoryLoaded!=='undefined' && !_runHistoryLoaded[tcid]){
      _loadRunHistoryFromServer(tcid).then(function(){
        // 로드 완료 후 인라인 재렌더 (배지 갱신)
        var w=document.getElementById('e3b-tc-inline-'+tcid);
        if(w){ var td=w.querySelector('td'); if(td) td.innerHTML=e3bTcInlineHtml(tcid); }
      }).catch(function(){});
    }
  }catch(_e){}
  // 스텝 카운트: checks 배열이 실제 로드되어 있으면 그 결과(0 포함)를 신뢰. 배열 자체가 없을 때만 서버 메타(_cli_count/_checks_count) fallback.
  // ('|| 0' 은 0 을 falsy 로 취급해 옛 서버 메타가 잘못 뜨는 문제 방지 — 실제 스텝 0 인데 3 표시되던 버그)
  var steps;
  if(Array.isArray(tc.checks)) steps=tc.checks.filter(function(x){return (x.kind||'cli')==='cli';}).length;
  else if(typeof tc._cli_count==='number') steps=tc._cli_count;
  else if(typeof tc._checks_count==='number') steps=tc._checks_count;
  else steps=(tc.steps||[]).length;
  var tab=e3bTcTab[tcid]||'procedure';
  // History 카운트: 서버 저장 실행 이력(_runHistory[tcid]) 우선, 없으면 TC 파일의 result_history fallback
  var _histN=0;
  try{
    if(typeof _runHistory!=='undefined' && Array.isArray(_runHistory[tcid])) _histN=_runHistory[tcid].length;
    else if(Array.isArray(tc.result_history)) _histN=tc.result_history.length;
  }catch(_e){}
  // Cycle Result 배지 = 이 TC 가 포함된 사이클 개수
  var _cycN=0;
  try{
    if(typeof cycleList!=='undefined'&&Array.isArray(cycleList)){
      cycleList.forEach(function(cy){ if((cy.items||[]).some(function(it){return (it.tcid===tcid)||(it.id===tcid);})) _cycN++; });
    }
  }catch(_e){}
  var rail=[ {id:'info',icon:'ti-info-circle',label:'Info'}, {id:'env',icon:'ti-clipboard-text',label:'Environment'}, {id:'topo',icon:'ti-topology-star',label:'Topology'}, {id:'traffic',icon:'ti-antenna',label:'Traffic'}, {id:'procedure',icon:'ti-list-check',label:'Step',badge:steps||''}, {id:'issue',icon:'ti-bug',label:'Issues'}, {id:'history',icon:'ti-history',label:'History',badge:_histN||''}, {id:'cycle',icon:'ti-recycle',label:'Cycle Result',badge:_cycN||''} ];
  var tabsHtml=rail.map(function(t){ return '<button onclick="event.stopPropagation();e3bSwitchTcTab(\''+tcid+'\',\''+t.id+'\')" style="position:relative;display:inline-flex;align-items:center;gap:6px;padding:8px 13px;cursor:pointer;border:none;background:transparent;border-bottom:2.5px solid '+(tab===t.id?'var(--green)':'transparent')+';color:'+(tab===t.id?'var(--green)':'var(--text3)')+';font-size:12.5px;font-weight:'+(tab===t.id?'800':'600')+';white-space:nowrap;"><i class="ti '+t.icon+'" style="font-size:15px;"></i><span>'+t.label+'</span>'+((t.badge!==undefined&&t.badge!=='')?'<span style="font-size:9px;font-weight:800;background:var(--green);color:#fff;border-radius:9px;padding:1px 6px;min-width:15px;text-align:center;">'+t.badge+'</span>':'')+'</button>'; }).join('');
  return '<div style="display:flex;flex-direction:column;">'
    +'<div style="display:flex;align-items:center;gap:1px;padding:0 10px;background:#fafbfc;border-bottom:1px solid var(--border);overflow-x:auto;">'+tabsHtml+'</div>'
    +'<div style="padding:14px 18px;">'+tcTabContent(tc,tab)+'</div>'
    +'</div>';
}
function e3bSwitchTcTab(tcid,tab){ e3bTcTab[tcid]=tab; if(e3bTcInlineOpen===tcid) e3bSaveSession(); var w=document.getElementById('e3b-tc-inline-'+tcid); if(w){ var td=w.querySelector('td'); if(td){ td.innerHTML=e3bTcInlineHtml(tcid); if(typeof _tcManExpImgObserveAll==='function') _tcManExpImgObserveAll(); } } }
var e3bReqTab={};
// TC 다중 선택(2개 이상) 시 REQ 인라인 자리에 표시하는 일괄 편집 카드
function e3bBulkEditInlineHtml(){
  var ids=Array.from(e3bSelTcs);
  var tcs=ids.map(function(id){ return tcList.find(function(t){return (t.tcid===id)||(t.id===id);}); }).filter(Boolean);
  var listHtml=tcs.map(function(t){ var id=t.tcid||t.id; return '<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:var(--green);background:rgba(0,135,90,0.10);border-radius:8px;padding:2px 9px;margin:2px;">'+_bdEsc(t.name||id)+'</span>'; }).join('');
  var fieldBlock=function(field,label,desc){
    return '<div style="margin-bottom:16px;">'
      +'<div style="display:flex;align-items:center;margin-bottom:4px;"><span style="font-size:12px;color:#aaa;flex:1;">'+label+' <span style="color:#7a7f95;">('+desc+')</span></span>'
      +'<button onclick="e3bBulkApplyField(\''+field+'\')" style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:5px;border:1px solid rgba(0,135,90,0.35);background:rgba(0,135,90,0.08);color:var(--green);cursor:pointer;"><i class="ti ti-checks"></i> 선택된 '+tcs.length+'개 TC에 적용</button></div>'
      +'<div id="e3b-bulk-tiny-'+field+'" style="width:100%;"></div></div>';
  };
  var _cfDefs=((typeof customFields!=='undefined'&&customFields&&customFields.tc)||[]).filter(function(f){return f.active!==false&&f.show_info!==false;});
  var _cfFieldBlock=function(f){
    var opts=(f.options||[]).map(function(o){ return '<option value="'+_bdEsc(cfOptValue(o))+'">'+_bdEsc(cfOptValue(o))+'</option>'; }).join('');
    return '<div style="margin-bottom:12px;display:flex;align-items:center;gap:8px;">'
      +'<span style="font-size:12px;color:#aaa;width:90px;flex-shrink:0;">'+_bdEsc(f.label)+'</span>'
      +'<select id="e3b-bulk-cf-'+f.id+'" style="flex:1;font-size:12px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;outline:none;"><option value="">(값 선택)</option>'+opts+'</select>'
      +'<button onclick="e3bBulkApplyCF(\''+f.id+'\')" style="font-size:11px;font-weight:700;padding:5px 10px;border-radius:5px;border:1px solid rgba(0,135,90,0.35);background:rgba(0,135,90,0.08);color:var(--green);cursor:pointer;flex-shrink:0;"><i class="ti ti-checks"></i> 적용</button>'
      +'</div>';
  };
  var h='<div style="margin-bottom:8px;border:1px solid var(--border);border-radius:9px;overflow:hidden;background:#fff;padding:14px 16px;">'
    +'<div style="display:flex;align-items:center;gap:7px;margin-bottom:4px;font-size:13px;font-weight:800;color:var(--green);"><i class="ti ti-checks"></i>'+tcs.length+'개 TC 일괄 편집</div>'
    +'<div style="margin-bottom:14px;">'+listHtml+'</div>'
    +'<div style="font-size:11px;color:var(--text3);margin-bottom:14px;"><i class="ti ti-info-circle"></i> 값 입력 후 "적용" 버튼을 누르면 선택된 모든 TC의 값이 덮어써집니다.</div>'
    +(_cfDefs.length?('<div style="border-bottom:1px solid var(--border);margin-bottom:14px;padding-bottom:14px;">'+_cfDefs.map(_cfFieldBlock).join('')+'</div>'):'')
    +fieldBlock('object','Object','목적')
    +fieldBlock('precondition','Pre-Condition','사전 준비 조건')
    +'</div>';
  setTimeout(function(){ e3bBulkTinyInit('object'); e3bBulkTinyInit('precondition'); },140);
  return h;
}
function _e3bHdr(ic,col,txt,btns){ return '<div style="height:42px;flex-shrink:0;display:flex;align-items:center;gap:7px;padding:0 11px;border-bottom:1px solid var(--border);font-size:12.5px;font-weight:800;color:'+col+';">'+'<i class="ti '+ic+'"></i><span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+txt+'</span>'+(btns||'')+'</div>'; }
function _e3bBtn(onclick,ic,title){ return '<button onclick="'+onclick+'" title="'+title+'" style="width:22px;height:22px;border-radius:5px;border:1px solid #d6dce6;background:#fff;color:var(--text2);cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="ti '+ic+'" style="font-size:13px;"></i></button>'; }
function _e3bClp(label,color,n){ return '<div onclick="e3bToggleCol('+n+')" title="'+label+' 펼치기" style="flex:0 0 38px;background:#fff;border:1px solid var(--border);border-radius:12px;box-shadow:0 2px 10px rgba(40,50,90,0.06);cursor:pointer;display:flex;flex-direction:column;align-items:center;padding-top:12px;gap:10px;"><i class="ti ti-chevron-right" style="color:'+color+';font-size:14px;"></i><span style="writing-mode:vertical-rl;font-size:11.5px;font-weight:800;color:'+color+';letter-spacing:1.5px;">'+label+'</span></div>'; }
function _e3bReqPanelHdr(){
  // 1행: 아이콘+제목 / 우측: 상위폴더 생성·삭제·펼침·접기·열접기
  var row1='<div style="display:flex;align-items:center;gap:4px;font-size:15px;font-weight:800;color:#7c3aed;">'
    +'<i class="ti ti-clipboard-text"></i>'
    +'<span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Requirements</span>'
    +_e3bBtn('e3bAddRootFolder()','ti-folder-plus','상위 폴더 생성')
    +_e3bBtn('e3bBulkDeleteReqs()','ti-trash','선택 항목 삭제')
    +_e3bBtn('e3bExpandAll()','ti-chevrons-down','전체 펼치기')
    +_e3bBtn('e3bCollapseAll()','ti-chevrons-up','전체 접기')
    +_e3bBtn('e3bToggleCol(1)','ti-layout-sidebar-left-collapse','이 열 접기')
    +'</div>';
  // 2행: 배지 + 우측 필터 토글 버튼
  var hasFilter=!!(e3bFilterStatus||e3bFilterPriority||e3bSearch);
  var row2='<div style="margin-top:5px;display:flex;align-items:center;gap:4px;">'
    +e3bReqCountBadges()
    +'<div style="flex:1;"></div>'
    +'<button id="e3b-filter-btn" onclick="e3bToggleFilter()" title="검색/필터 열기·닫기" style="display:flex;align-items:center;gap:3px;font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:5px;border:1px solid '+(e3bFilterOpen?'var(--blue)':'#d6dce6')+';background:'+(e3bFilterOpen?'rgba(45,111,212,0.10)':'#fff')+';color:'+(e3bFilterOpen?'var(--blue)':'var(--text2)')+';cursor:pointer;white-space:nowrap;">'
      +'<i class="ti ti-filter" style="font-size:11px;"></i>필터'+(hasFilter?' <span style="display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;background:var(--blue);color:#fff;font-size:9px;">!</span>':'')
    +'</button>'
    +'</div>';
  // 필터·검색 패널 (토글)
  var row3='<div id="e3b-filter-wrap" style="display:'+(e3bFilterOpen?'block':'none')+';margin-top:5px;">'
    +'<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:4px;">'
      +'<select id="e3b-filter-status" onchange="e3bOnFilterStatus(this.value)" style="font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:5px;background:#fff;outline:none;flex:1;cursor:pointer;">'
        +'<option value="">상태 전체</option>'
        +'<option'+(e3bFilterStatus==='Draft'?' selected':'')+'>Draft</option>'
        +'<option'+(e3bFilterStatus==='Work in Progress'?' selected':'')+'>Work in Progress</option>'
        +'<option'+(e3bFilterStatus==='Review'?' selected':'')+'>Review</option>'
        +'<option'+(e3bFilterStatus==='Approved'?' selected':'')+'>Approved</option>'
        +'<option'+(e3bFilterStatus==='Deprecated'?' selected':'')+'>Deprecated</option>'
      +'</select>'
      +'<select id="e3b-filter-priority" onchange="e3bOnFilterPriority(this.value)" style="font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:5px;background:#fff;outline:none;flex:1;cursor:pointer;">'
        +'<option value="">중요도 전체</option>'
        +'<option'+(e3bFilterPriority==='Very High'?' selected':'')+'>Very High</option>'
        +'<option'+(e3bFilterPriority==='High'?' selected':'')+'>High</option>'
        +'<option'+(e3bFilterPriority==='Medium'?' selected':'')+'>Medium</option>'
        +'<option'+(e3bFilterPriority==='Low'?' selected':'')+'>Low</option>'
      +'</select>'
    +'</div>'
    +'<input id="e3b-search" oninput="e3bOnSearch(this.value)" value="'+_bdEsc(e3bSearch)+'" placeholder="REQ ID, 제목 검색..." style="width:100%;font-size:11px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;background:#fff;outline:none;box-sizing:border-box;">'
    +'</div>';
  return '<div style="flex-shrink:0;padding:8px 11px 6px;border-bottom:1px solid var(--border);background:#fff;">'+row1+row2+row3+'</div>';
}
function _e3bTcPanelHdr(){
  var row1='<div style="display:flex;align-items:center;gap:7px;font-size:15px;font-weight:800;color:#00875a;">'
    +'<i class="ti ti-file-check"></i>'
    +'<span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Coverage</span>'
    +'</div>';
  return '<div id="e3b-tc-hdr" style="flex-shrink:0;padding:8px 11px 6px;border-bottom:1px solid var(--border);background:#fff;">'+row1+'</div>';
}
function e3bRebuildTcHdr(){ var h=document.getElementById('e3b-tc-hdr'); if(h)h.outerHTML=_e3bTcPanelHdr(); }
// TC Summary 표 위 상시 툴바 (Zephyr Scale 스타일) — New/More는 항상 표시, 선택 시 More에 선택 전용 항목 활성화
function _e3bTcToolbarBtn(onclick,ic,label){
  var iconOnly=!label;
  return '<button onclick="'+onclick+'" style="display:flex;align-items:center;justify-content:center;gap:5px;height:26px;padding:'+(iconOnly?'0 8px':'0 10px')+';border-radius:6px;border:1px solid #d6dce6;background:#fff;color:var(--text2);cursor:pointer;font-size:11.5px;font-weight:700;white-space:nowrap;"><i class="ti '+ic+'" style="font-size:'+(iconOnly?'17px':'13px')+';"></i>'+(label||'')+'</button>';
}
function _e3bTcToolbar(){
  var n=e3bSelTcs.size;
  var curReqId=(function(){
    if(!e3bSelFolder){ var r=(reqList||[]).find(function(x){return x.id===e3bSelReq;}); return r?r.id:null; }
    var allFids=e3bDescIds(e3bSelFolder);
    var fr=(reqList||[]).find(function(r){return allFids.indexOf(r.folder)>=0;});
    return fr?fr.id:null;
  })();
  var ids=Array.from(e3bSelTcs);
  var colBtn='<div style="position:relative;display:inline-block;">'
    +'<button onclick="e3bTcColMenuOpen(event)" style="display:flex;align-items:center;justify-content:center;height:26px;padding:0 8px;border-radius:6px;border:1px solid #d6dce6;background:#fff;color:var(--text2);cursor:pointer;"><i class="ti ti-settings" style="font-size:17px;"></i></button>'
    +'<div id="e3b-tc-col-pop" style="display:none;position:absolute;top:calc(100% + 4px);right:0;z-index:10001;background:#fff;border:1px solid var(--border);border-radius:9px;box-shadow:0 10px 30px rgba(20,30,60,0.18);width:220px;max-height:min(600px,70vh);overflow:hidden;flex-direction:column;font-size:12.5px;"></div>'
  +'</div>';
  var left, mid;
  if(n>0){
    left=(n===1?_e3bTcToolbarBtn('expCloneTC(\''+ids[0]+'\')','ti-copy','Clone'):'')
      +(n===1?_e3bTcToolbarBtn('expCopyLink(\'tc\',\''+ids[0]+'\')','ti-link','링크'):'')
      +(n===1?_e3bTcToolbarBtn('exportTCPPTX(\''+ids[0]+'\')','ti-file-type-ppt','PPTX'):'')
      +_e3bTcToolbarBtn('e3bFocusBulkEdit()','ti-edit','Edit in bulk')
      +_e3bTcToolbarBtn('e3bExportTcsPDF(e3bSelTcsArr())','ti-file-type-pdf','Export PDF')
      +_e3bTcToolbarBtn('e3bExportTcsExcel(e3bSelTcsArr())','ti-file-spreadsheet','Export Excel')
      +_e3bTcToolbarBtn('e3bBulkDeleteTcs()','ti-trash','삭제');
    mid='<div style="display:flex;align-items:center;gap:6px;background:#eef0f3;border-radius:8px;padding:3px 4px 3px 10px;">'
      +'<span style="font-size:11px;font-weight:800;color:#475063;white-space:nowrap;">'+n+'개 선택됨</span>'
      +'<button onclick="e3bSelTcs.clear();e3bRebuildTcBody();" style="display:flex;align-items:center;gap:4px;height:22px;padding:0 8px;border-radius:6px;border:none;background:transparent;color:var(--text2);cursor:pointer;font-size:11px;font-weight:700;white-space:nowrap;"><i class="ti ti-x" style="font-size:13px;"></i>선택 해제</button>'
      +'</div>';
  } else {
    left=(curReqId?_e3bTcToolbarBtn('e3bAddTcWrap(\''+curReqId+'\')','ti-plus','New'):'')
      +(curReqId?_e3bTcToolbarBtn('e3bBulkAddTcWrap(\''+curReqId+'\')','ti-files','TC 일괄 생성'):'');
    mid='';
  }
  return '<div id="e3b-tc-toolbar" style="flex-shrink:0;display:flex;align-items:center;gap:6px;border-bottom:1px solid var(--border);padding:6px 11px;">'
    +left+mid+'<div style="flex:1;"></div>'+colBtn
    +'</div>';
}
function e3bSelTcsArr(){ return Array.from(e3bSelTcs); }
// Edit in bulk — 화면은 그대로 두고 팝업(모달)에서 선택 TC 일괄 편집 (Zephyr Scale 방식)
function e3bFocusBulkEdit(){
  if(e3bSelTcs.size<2){ if(typeof showToast==='function')showToast('2개 이상 선택 시 일괄 편집이 가능합니다'); return; }
  var old=document.getElementById('e3b-bulk-edit-modal'); if(old) old.remove();
  var modal=document.createElement('div');
  modal.id='e3b-bulk-edit-modal';
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:100000;';
  modal.onclick=function(e){ if(e.target===modal) e3bBulkEditModalClose(); };
  modal.innerHTML='<div style="background:var(--bg2);border-radius:12px;width:640px;max-width:92vw;max-height:86vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 16px 50px rgba(0,0,0,0.35);">'
    +'<div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;flex-shrink:0;">'
      +'<i class="ti ti-checks" style="color:var(--green);font-size:18px;"></i>'
      +'<div style="flex:1;font-size:14px;font-weight:800;color:var(--text);">Edit in bulk</div>'
      +'<button onclick="e3bBulkEditModalClose()" style="width:26px;height:26px;border-radius:6px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;">×</button>'
    +'</div>'
    +'<div style="flex:1;overflow-y:auto;padding:14px 16px;">'+e3bBulkEditInlineHtml()+'</div>'
  +'</div>';
  document.body.appendChild(modal);
}
function e3bBulkEditModalClose(){ var m=document.getElementById('e3b-bulk-edit-modal'); if(m) m.remove(); }
// 선택된 TC들을 이어붙여 PDF 인쇄 미리보기로 내보내기
function e3bExportTcsPDF(ids){
  var tcs=ids.map(function(id){ return tcList.find(function(t){return (t.tcid===id)||(t.id===id);}); }).filter(Boolean);
  if(!tcs.length){ if(typeof showToast==='function')showToast('선택된 TC가 없습니다'); return; }
  if(typeof buildTCPdfHtml!=='function'||typeof pdfPreview!=='function'){ if(typeof showToast==='function')showToast('PDF 내보내기 기능을 사용할 수 없습니다'); return; }
  var html=tcs.map(function(t,i){ var cust=(typeof cfV==='function')?(cfV('tc',t,'고객사')||''):''; return buildTCPdfHtml(t,i===0,{mode:(typeof _pdfMode!=='undefined'?_pdfMode:'고객사'),customer:cust}); }).join('<div style="page-break-before:always;"></div>');
  // TC 1개일 때만 메일 공유(shareTcMail) 연결 — 여러 건 합친 PDF는 공유 대상 TC가 하나로 특정 안 돼 지원 안 함
  var shareFn=(tcs.length===1&&typeof shareTcMail==='function')?function(){ shareTcMail(tcs[0].tcid||tcs[0].id); }:null;
  pdfPreview(html, 'TC 명세서 — '+tcs.length+'건', null, shareFn);
}
// 선택된 TC들을 Excel(CSV)로 내보내기
function e3bExportTcsExcel(ids){
  var tcs=ids.map(function(id){ return tcList.find(function(t){return (t.tcid===id)||(t.id===id);}); }).filter(Boolean);
  if(!tcs.length){ if(typeof showToast==='function')showToast('선택된 TC가 없습니다'); return; }
  var cols=e3bTcColDefs().filter(function(f){ return e3bTcColVis[f.id]!==false; });
  var _cfVal=function(t,f){ if(f.sys) return f.get(t)||''; return ((t.custom_fields||{})[f.id]||''); };
  var head=['TC ID','TC Summary'].concat(cols.map(function(f){return f.label;}));
  var ce=function(v){ v=String(v==null?'':v); return /[",\n]/.test(v)?('"'+v.replace(/"/g,'""')+'"'):v; };
  var rows=tcs.map(function(t){ return [t.tcid||t.id, t.name||''].concat(cols.map(function(f){ return _cfVal(t,f); })).map(ce).join(','); });
  var csv=head.map(ce).join(',')+'\n'+rows.join('\n');
  var blob=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8;'});
  var fn='TC_목록_'+((typeof _nowStr==='function'?_nowStr():'').replace(/[^0-9]/g,'').slice(0,12)||'export')+'.csv';
  var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=fn; document.body.appendChild(a); a.click(); setTimeout(function(){ a.remove(); URL.revokeObjectURL(a.href); },100);
  if(typeof showToast==='function')showToast('엑셀(CSV) 다운로드: '+tcs.length+'건');
}
// 현재 선택된 REQ의 폴더 ID (REQ 추가 시 폴더 기준)
function e3bGetCurFolderId(){ var r=(reqList||[]).find(function(x){return x.id===e3bSelReq;}); return r?r.folder:null; }
// 툴바 토글
function e3bToggleReqToolbar(){ var t=document.getElementById('e3b-req-toolbar'); if(t) t.style.display=(t.style.display==='none'?'block':'none'); }
function e3bSaveSession(){
  // sessionStorage는 임베디드 웹뷰 등 일부 환경에서 새로고침 시 유지되지 않을 수 있어
  // localStorage에도 함께 저장(둘 다 시도, 하나라도 되면 복원됨)
  try{
    var ss=[window.sessionStorage,window.localStorage];
    ss.forEach(function(st){
      if(!st) return;
      if(e3bSelReq)st.setItem('utop_e3b_req',e3bSelReq); else st.removeItem('utop_e3b_req');
      if(e3bSelTc)st.setItem('utop_e3b_tc',e3bSelTc); else st.removeItem('utop_e3b_tc');
      if(e3bSelFolder)st.setItem('utop_e3b_folder',e3bSelFolder); else st.removeItem('utop_e3b_folder');
      if(e3bTcInlineOpen)st.setItem('utop_e3b_tcopen',e3bTcInlineOpen); else st.removeItem('utop_e3b_tcopen');
      if(e3bTcInlineOpen&&e3bTcTab[e3bTcInlineOpen])st.setItem('utop_e3b_tctab',e3bTcTab[e3bTcInlineOpen]); else st.removeItem('utop_e3b_tctab');
      st.setItem('utop_e3b_page',String(e3bTcPage||1));
      st.setItem('utop_e3b_closed',JSON.stringify(Array.from(e3bClosed||[])));
    });
  }catch(e){}
}
// 폴더 fid의 조상 폴더 체인을 전부 e3bClosed(접힘 집합)에서 제거 — 접힌 폴더 속 REQ/폴더가 선택 복원돼도 안 보이는 문제 방지
function e3bUnfoldTo(fid){
  if(e3bClosed===null) e3bClosed=new Set();
  var f=reqFolders.find(function(x){return x.id===fid;});
  var guard=0;
  while(f&&guard++<50){
    e3bClosed.delete(f.id);
    f=f.parent?reqFolders.find(function(x){return x.id===f.parent;}):null;
  }
}
function e3bLoadSession(){
  try{
    var get=function(k){ var v=null; try{ v=sessionStorage.getItem(k); }catch(e){} if(v===null||v===undefined){ try{ v=localStorage.getItem(k); }catch(e){} } return v; };
    if(!e3bSelReq){ var r=get('utop_e3b_req'); if(r&&reqList.find(function(x){return x.id===r;})) e3bSelReq=r; }
    if(!e3bSelTc){ var t=get('utop_e3b_tc'); if(t&&tcList.find(function(x){return (x.tcid||x.id)===t;})) e3bSelTc=t; }
    if(!e3bSelFolder){ var f=get('utop_e3b_folder'); if(f&&reqFolders.find(function(x){return x.id===f;})) e3bSelFolder=f; }
    if(!e3bTcInlineOpen){ var o=get('utop_e3b_tcopen'); if(o&&tcList.find(function(x){return (x.tcid||x.id)===o;})) e3bTcInlineOpen=o; }
    if(e3bTcInlineOpen&&!e3bTcTab[e3bTcInlineOpen]){ var tb=get('utop_e3b_tctab'); if(tb) e3bTcTab[e3bTcInlineOpen]=tb; }
    var p=parseInt(get('utop_e3b_page')); if(p>0) e3bTcPage=p;
    if(e3bClosed===null){ var c=get('utop_e3b_closed'); if(c){ try{ e3bClosed=new Set(JSON.parse(c)); }catch(e2){} } }
    // 복원된 선택 REQ/폴더가 접힌 폴더 안에 있으면 그 조상까지 펼쳐서 트리에 보이게 함
    if(e3bSelReq){ var rq=reqList.find(function(x){return x.id===e3bSelReq;}); if(rq&&rq.folder) e3bUnfoldTo(rq.folder); }
    else if(e3bSelFolder){ e3bUnfoldTo(e3bSelFolder); }
  }catch(e){}
}
function renderExplorer3Beta(){
  var page=document.getElementById('page-explorer3-beta'); if(!page) return;
  // 재렌더 전 각 스크롤 컨테이너 위치 저장 → 후에 복원 (폴더/REQ 이동·추가·삭제 후에도 위치 유지)
  // 새로고침 직후 첫 렌더는 DOM 이 없으니 localStorage 에서 복원
  var _lsGet=function(k){ try{ return parseInt(localStorage.getItem(k),10)||0; }catch(e){ return 0; } };
  var _prevScrolls={
    req:(function(){ var _e=document.getElementById('e3b-req-body'); return _e?_e.scrollTop:_lsGet('utop_e3b_scroll_req'); })(),
    tc:(function(){ var _e=document.getElementById('e3b-tc-body'); return _e?_e.scrollTop:_lsGet('utop_e3b_scroll_tc'); })()
  };
  // 다른 페이지(Tests Color / 원본) 에서 값이 바뀌었을 수 있으니 매 렌더 시 localStorage 를 진실의 원천으로 재동기
  try{ if(typeof _rcSyncAccentFromLS==='function') _rcSyncAccentFromLS(); }catch(_){}
  try{ if(typeof _rcSyncBoldFromLS==='function') _rcSyncBoldFromLS(); }catch(_){}
  try{ if(typeof _rcSyncFontSizeFromLS==='function') _rcSyncFontSizeFromLS(); }catch(_){}
  try{ if(typeof _rcInjectStyleOverride==='function') _rcInjectStyleOverride(); }catch(_){}
  e3bLoadSession();
  if(e3bClosed===null) e3bClosed=new Set();
  // 자동 REQ 선택 제거 — 원본 renderExplorer3 와 동일하게, 사용자 선택 없으면 그대로 둔다.
  //if(!e3bSelReq&&!e3bSelFolder){ var fr=reqList.find(function(r){return e3bReqTcs(r).length;})||reqList[0]; if(fr) e3bSelReq=fr.id; }
  // e3bSelTc가 e3bSelReq 소속이 아니어도 유지 (폴더 선택 등으로 다른 REQ TC일 수 있음)
  if(e3bSelTc){ var _tc=tcList.find(function(t){return (t.tcid||t.id)===e3bSelTc;}); if(!_tc) e3bSelTc=null; }
  if(e3bSelTc){ var _tr=tcList.find(function(t){return (t.tcid||t.id)===e3bSelTc;}); if(_tr&&_tr.req_id) e3bSelReq=_tr.req_id; }
  var _card='background:#fff;border:1px solid var(--border);border-radius:12px;box-shadow:0 2px 10px rgba(40,50,90,0.06);overflow:hidden;';
  var _div='<div onmousedown="e3bResizeStart(event,this)" title="드래그로 폭 조절" style="width:5px;flex-shrink:0;cursor:col-resize;background:var(--border);opacity:0.4;" onmouseenter="this.style.opacity=\'1\';this.style.background=\'var(--blue)\'" onmouseleave="this.style.opacity=\'0.4\';this.style.background=\'var(--border)\'"></div>';
  var h='<div id="e3b-cols" style="flex:1;display:flex;overflow:hidden;height:100%;padding:12px;gap:6px;background:var(--bg);box-sizing:border-box;">';
  if(e3bC1){ h+=_e3bClp('REQUIREMENT','#7c3aed',1); }
  else { h+='<div id="e3b-col-1" style="flex:0 0 '+e3bW1+'px;display:flex;flex-direction:column;'+_card+'">'+_e3bReqPanelHdr()+'<div id="e3b-req-body" ondragover="e3bRootDragOver(event)" ondragleave="e3bRootDragLeave(event)" ondrop="e3bDropOnRoot(event)" style="flex:1;overflow:auto;padding:5px 6px;">'+e3bTreeHtml()+'</div></div>'; }
  h+=_div;
  var _tcBodyHtml=e3bTcListHtml();
  h+='<div id="e3b-col-2" onclick="_e3bSetFocus(2)" style="flex:1;min-width:0;display:flex;flex-direction:column;'+_card+'">'+_e3bTcPanelHdr()+'<div id="e3b-tc-toolbar-wrap" style="flex-shrink:0;">'+e3bTcToolbarCache+'</div><div id="e3b-tc-body" style="flex:1;overflow:auto;">'+_tcBodyHtml+'</div><div id="e3b-tc-pager" style="flex-shrink:0;">'+e3bTcPagerCache+'</div></div>';
  h+='</div>';
  page.innerHTML=h;
  // 저장해둔 스크롤 위치 복원
  try{
    if(_prevScrolls.req){ var _rb=document.getElementById('e3b-req-body'); if(_rb) _rb.scrollTop=_prevScrolls.req; }
    if(_prevScrolls.tc){ var _tb=document.getElementById('e3b-tc-body'); if(_tb) _tb.scrollTop=_prevScrolls.tc; }
  }catch(_e){}
  // 스크롤 이벤트 → localStorage 저장 (새로고침 후 복원용)
  try{
    var _atach=function(id, key){
      var el=document.getElementById(id); if(!el||el._scListenerOn) return;
      el._scListenerOn=true;
      var _t=null;
      el.addEventListener('scroll', function(){
        clearTimeout(_t);
        _t=setTimeout(function(){ try{ localStorage.setItem(key, String(el.scrollTop||0)); }catch(_){} }, 120);
      });
    };
    _atach('e3b-req-body','utop_e3b_scroll_req');
    _atach('e3b-tc-body','utop_e3b_scroll_tc');
  }catch(_e){}
  setTimeout(_e3bFocusUI,20);
}
function e3bPickReq(rid){ e3bSelReq=rid; e3bSelTc=null; e3bSelFolder=null; e3bSelTcs.clear(); e3bTcInlineOpen=null; e3bTcPage=1; e3bSaveSession(); if(rid&&typeof _expSetHash==='function') _expSetHash('req',rid); e3bRebuildReqBody(); e3bSetTcBodyHtml(); e3bRebuildTcHdr(); }
function e3bPickTc(tcid){ e3bSelTc=tcid; e3bSelTcs.clear(); e3bTcInlineOpen=tcid; e3bSaveSession(); if(tcid&&typeof _expSetHash==='function') _expSetHash('tc',tcid); e3bSetTcBodyHtml(); }
function e3bToggleFolder(fid){ if(e3bClosed===null)e3bClosed=new Set(); if(e3bClosed.has(fid))e3bClosed.delete(fid); else e3bClosed.add(fid); e3bSaveSession(); e3bRebuildReqBody(); }
// 폴더명 클릭: 하위 전체 TC를 Coverage 열에 표시
function e3bPickFolder(fid){
  e3bSelFolder=fid; e3bSelReq=null; e3bSelTc=null; e3bSelTcs.clear(); e3bTcInlineOpen=null; e3bTcPage=1;
  e3bSaveSession();
  e3bRebuildReqBody();
  e3bSetTcBodyHtml();
  e3bRebuildTcHdr();
}
function e3bExpandAll(){ e3bClosed=new Set(); e3bSaveSession(); e3bRebuildReqBody(); }
function e3bCollapseAll(){ e3bClosed=new Set(); (reqFolders||[]).forEach(function(f){ if(f&&f.id)e3bClosed.add(f.id); }); e3bSaveSession(); e3bRebuildReqBody(); }
function e3bToggleCol(n){
  if(n===1)e3bC1=!e3bC1; else e3bC2=!e3bC2;
  try{ localStorage.setItem('utop_e3b_c1', e3bC1?'1':'0'); localStorage.setItem('utop_e3b_c2', e3bC2?'1':'0'); }catch(_e){}
  renderExplorer3Beta();
}
// 열 구분선 드래그 리사이즈
function e3bResizeStart(ev, handle){
  ev.preventDefault(); ev.stopPropagation();
  var leftCol=handle.previousElementSibling;
  var rightCol=handle.nextElementSibling;
  if(!leftCol||!rightCol) return;
  var leftId=leftCol.id;
  var startX=ev.clientX, startLeft=leftCol.offsetWidth;
  var MIN=160;
  var ov=document.createElement('div');
  ov.id='e3b-resize-ov';
  ov.style.cssText='position:fixed;inset:0;z-index:99999;cursor:col-resize;';
  document.body.appendChild(ov);
  var _pu=document.body.style.userSelect;
  document.body.style.userSelect='none';
  function mv(e){
    var nLeft=Math.max(MIN, startLeft+(e.clientX-startX));
    leftCol.style.flex='0 0 '+nLeft+'px';
    leftCol.style.width=nLeft+'px';
  }
  function up(){
    document.removeEventListener('mousemove',mv);
    document.removeEventListener('mouseup',up);
    window.removeEventListener('mouseup',up);
    window.removeEventListener('blur',up);
    var _ov=document.getElementById('e3b-resize-ov');
    if(_ov&&_ov.parentNode) _ov.parentNode.removeChild(_ov);
    document.body.style.userSelect=_pu||'';
    if(leftId==='e3b-col-1') e3bW1=leftCol.offsetWidth;
    else if(leftId==='e3b-col-2') e3bW2=leftCol.offsetWidth;
    e3bSaveWidths();
  }
  document.addEventListener('mousemove',mv);
  document.addEventListener('mouseup',up);
  window.addEventListener('mouseup',up);
  window.addEventListener('blur',up);
}

// ===== Explorer3 Beta 포커스 열 관리 (1=REQ, 2=TC, 3=Detail) =====
var _e3bFocus=1;
function _e3bFocusUI(){
  var cols={1:'e3b-col-1',2:'e3b-col-2'};
  var borders={1:'2px solid #7c3aed',2:'2px solid #00875a'};
  var shadows={1:'0 0 0 3px rgba(124,58,237,0.18),0 4px 18px rgba(124,58,237,0.14)',2:'0 0 0 3px rgba(0,135,90,0.18),0 4px 18px rgba(0,135,90,0.14)'};
  [1,2].forEach(function(n){
    var el=document.getElementById(cols[n]); if(!el) return;
    if(_e3bFocus===n){ el.style.border=borders[n]; el.style.boxShadow=shadows[n]; }
    else { el.style.border='1px solid var(--border)'; el.style.boxShadow='0 2px 10px rgba(40,50,90,0.06)'; }
  });
}
function _e3bSetFocus(n){ _e3bFocus=n; _e3bFocusUI(); }

// ===== Explorer3 Beta 키보드 탐색 =====
// 1열: ↑↓ REQ 이동, → 2열 이동
// 2열: ↑↓ TC 이동(인라인 펼침 갱신), ← 1열 이동
function _e3bScrollInto(el){ if(el&&el.scrollIntoView) el.scrollIntoView({block:'nearest'}); }
function _e3bKeyNav(ev){
  var page=document.getElementById('page-explorer3-beta'); if(!page||!page.classList.contains('active')) return;
  // Ctrl/Meta+방향키는 TC 절차 그리드의 스텝 이동 단축키이므로 여기서는 절대 처리하지 않음
  if(ev.ctrlKey||ev.metaKey||ev.altKey) return;
  var tag=(ev.target&&ev.target.tagName)||''; if(/^(INPUT|TEXTAREA|SELECT)$/i.test(tag)||(ev.target&&ev.target.isContentEditable)) return;
  var k=ev.key;
  if(k==='ArrowDown'||k==='ArrowUp'){
    ev.preventDefault();
    if(_e3bFocus===1){
      var idx=e3bFlatReqOrder.indexOf(e3bSelReq);
      if(idx<0) idx=0;
      var next=k==='ArrowDown'?Math.min(idx+1,e3bFlatReqOrder.length-1):Math.max(idx-1,0);
      var nid=e3bFlatReqOrder[next]; if(!nid) return;
      e3bClearSel(); e3bPickReq(nid); _e3bSetFocus(1);
      setTimeout(function(){ _e3bScrollInto(document.querySelector('#e3b-req-body [onclick*="\''+nid+'\'"]')); },30);
    } else if(_e3bFocus===2){
      var idx2=e3bFlatTcOrder.indexOf(e3bSelTc);
      if(idx2<0) idx2=-1;
      var next2=k==='ArrowDown'?Math.min(idx2+1,e3bFlatTcOrder.length-1):Math.max(idx2-1,0);
      if(next2<0) next2=0;
      var nid2=e3bFlatTcOrder[next2]; if(!nid2) return;
      e3bClearSel(); e3bPickTc(nid2);
      setTimeout(function(){ _e3bScrollInto(document.querySelector('#e3b-tc-body [onclick*="\''+nid2+'\'"]')); },30);
    }
  } else if(k==='ArrowRight'){
    ev.preventDefault();
    if(_e3bFocus===1){
      // 2열로 이동 (TC 없어도 이동)
      _e3bSetFocus(2);
      if(!e3bSelTc&&e3bFlatTcOrder.length>0){
        e3bClearSel(); e3bPickTc(e3bFlatTcOrder[0]);
        setTimeout(function(){ _e3bScrollInto(document.querySelector('#e3b-tc-body [onclick*="\''+e3bFlatTcOrder[0]+'\'"]')); },30);
      }
    }
  } else if(k==='ArrowLeft'){
    ev.preventDefault();
    if(_e3bFocus===2){
      _e3bSetFocus(1);
      setTimeout(function(){ if(e3bSelReq) _e3bScrollInto(document.querySelector('#e3b-req-body [onclick*="\''+e3bSelReq+'\'"]')); },30);
    }
  }
}
document.addEventListener('keydown', _e3bKeyNav);

// ===== Explorer3 Beta 우클릭 컨텍스트 메뉴 (원본 Explorer의 exp* 액션을 3열에 이식) =====
// 공용 렌더러 expShowCtxMenu(06-nav-misc)를 재사용. CRUD 액션은 전역 exp* 함수를 그대로 호출하고
// (그 함수들이 renderExplorer()를 부르면 renderExplorer 내부에서 explorer3-beta도 자동 갱신됨),
// '열기'/'이름 변경'만 3열 전용 상태(e3bSelReq/e3bSelTc)에 맞춰 처리한다.
function e3bFolderOpen(fid){ if(e3bClosed===null)e3bClosed=new Set(); e3bClosed.delete(fid); e3bRebuildReqBody(); }
async function e3bRenameReq(reqId){
  var r=(reqList||[]).find(function(x){return x.id===reqId;}); if(!r){ if(typeof showToast==='function')showToast('REQ를 찾을 수 없습니다'); return; }
  var v=await uiPrompt({title:'REQ 이름 변경', label:'REQ 제목(Summary)', value:r.title||'', icon:'ti-pencil'}); if(v===null) return;
  r.title=(v||'').trim()||'(제목 없음)'; r.updated_at=new Date().toISOString().slice(0,10);
  try{ await saveOneREQ(r); }catch(e){}
  renderExplorer3Beta();
}
async function e3bRenameTc(tcid){
  var tc=(tcList||[]).find(function(t){return (t.tcid===tcid)||(t.id===tcid);}); if(!tc){ if(typeof showToast==='function')showToast('TC를 찾을 수 없습니다'); return; }
  var v=await uiPrompt({title:'TC 이름 변경', label:'TC 제목', value:tc.name||'', icon:'ti-pencil'}); if(v===null) return;
  await e3bSaveTcName(tc, v);
  renderExplorer3Beta();
}
// TC 이름 저장 공용 함수(파일 저장 + REQ의 tc 참조 갱신) — 모달/인라인 편집 공용
async function e3bSaveTcName(tc, v){
  tc.name=(v||'').trim()||'(제목 없음)';
  try{ await saveTCFile(tc); }catch(e){}
  var r=(reqList||[]).find(function(x){return x.id===tc.req_id;});
  if(r&&Array.isArray(r.tc)){ var ref=r.tc.find(function(x){return x.tcid===(tc.tcid||tc.id);}); if(ref){ ref.name=tc.name; try{ await saveOneREQ(r); }catch(e){} } }
  return tc.name;
}
// TC Summary 제목 더블클릭 → 팝업 없이 그 자리에서 바로 편집(contenteditable)
function e3bTcNameEditStart(ev,el){
  ev.stopPropagation();
  el.contentEditable='true';
  el.style.background='#fff'; el.style.boxShadow='0 0 0 2px rgba(45,111,212,0.35)';
  el.focus();
  try{ var r=document.createRange(); r.selectNodeContents(el); var s=window.getSelection(); s.removeAllRanges(); s.addRange(r); }catch(e){}
}
async function e3bTcNameEditCommit(el,tcid){
  if(el.contentEditable!=='true') return;
  el.contentEditable='false';
  el.style.background=''; el.style.boxShadow='';
  var v=(el.textContent||'').trim();
  var tc=(tcList||[]).find(function(t){return (t.tcid===tcid)||(t.id===tcid);}); if(!tc) return;
  if(v===(tc.name||'')) return;
  var name=await e3bSaveTcName(tc, v);
  el.textContent=name;
}
function e3bTcNameEditKey(ev,el){
  if(ev.key==='Enter'){ ev.preventDefault(); el.blur(); }
  else if(ev.key==='Escape'){
    ev.preventDefault();
    el.contentEditable='false'; el.style.background=''; el.style.boxShadow='';
    e3bSetTcBodyHtml();
  }
}
// ── e3 전용 추가 래퍼 : 원본 exp* 추가 함수 호출 후 3열 재렌더 + 새 항목 선택 (실시간 반영 보장) ──
async function e3bAddReqWrap(folderId){
  var before=(reqList||[]).map(function(x){return x.id;});
  try{ await expAddREQ(folderId); }catch(e){}
  var neo=(reqList||[]).find(function(x){return before.indexOf(x.id)<0;});
  if(e3bClosed)e3bClosed.delete(folderId);
  if(neo){ e3bSelReq=neo.id; e3bSelTc=null; }
  renderExplorer3Beta();
}
async function e3bBulkAddReqWrap(folderId){
  try{ await expBulkAddREQ(folderId); }catch(e){}
  if(e3bClosed)e3bClosed.delete(folderId);
  renderExplorer3Beta();
}
async function e3bAddTcWrap(reqId){
  var before=(tcList||[]).map(function(x){return x.tcid||x.id;});
  try{ await expAddTC(reqId); }catch(e){}
  var neo=(tcList||[]).find(function(x){return before.indexOf(x.tcid||x.id)<0;});
  e3bSelReq=reqId;
  if(neo){ e3bSelTc=neo.tcid||neo.id; e3bTcInlineOpen=e3bSelTc; }
  renderExplorer3Beta();
}
async function e3bBulkAddTcWrap(reqId){
  try{ await expBulkAddTC(reqId); }catch(e){}
  e3bSelReq=reqId;
  renderExplorer3Beta();
}
function e3bShowCtx(e, id, type){
  if(e&&e.preventDefault)e.preventDefault();
  if(e&&e.stopPropagation)e.stopPropagation();
  if(typeof expShowCtxMenu!=='function') return; // 공용 렌더러 없으면 무시
  var items;
  if(type==='folder'){
    items=[
      {label:'REQ 추가', icon:'ti-file-plus', onclick:function(){ e3bAddReqWrap(id); }},
      {label:'REQ 일괄 생성', icon:'ti-files', onclick:function(){ e3bBulkAddReqWrap(id); }},
      {label:'하위 폴더 추가', icon:'ti-folder-plus', onclick:function(){ expAddFolder(id); }},
      {label:'이름 변경', icon:'ti-pencil', onclick:function(){ expRenameFolder(id); }},
      {sep:true},
      {label:'폴더 삭제', icon:'ti-trash', danger:true, onclick:function(){ expDeleteFolder(id); }},
    ];
  } else if(type==='req'){
    items=[
      {label:'TC 추가', icon:'ti-clipboard-plus', onclick:function(){ e3bAddTcWrap(id); }},
      {label:'TC 일괄 생성', icon:'ti-files', onclick:function(){ e3bBulkAddTcWrap(id); }},
      {label:'이름 변경', icon:'ti-pencil', onclick:function(){ e3bRenameReq(id); }},
      {label:'TC ID 경로기준 재정렬', icon:'ti-list-numbers', onclick:function(){ expNormalizeReqTcIds(id); }},
      {label:'REQ 복제 (Clone)', icon:'ti-copy', onclick:function(){ expCloneREQ(id); }},
      {sep:true},
      {label:'REQ 삭제', icon:'ti-trash', danger:true, onclick:function(){ expDeleteREQ(id); }},
    ];
  } else if(type==='tc'){
    items=[
      {label:'이름 변경', icon:'ti-pencil', onclick:function(){ e3bRenameTc(id); }},
      {label:'TC ID 수정', icon:'ti-id', onclick:function(){ tcRenameId(id); }},
      {label:'TC 복제 (Clone)', icon:'ti-copy', onclick:function(){ expCloneTC(id); }},
      {sep:true},
      {label:'TC 삭제', icon:'ti-trash', danger:true, onclick:function(){ expDeleteTC(id); }},
    ];
  } else { return; }
  expShowCtxMenu(e, items);
}
