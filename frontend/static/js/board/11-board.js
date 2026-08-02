/* ===== 신규: 게시판 (수정사항 요청) — bbs 네임스페이스 (base 실행보드 board*와 분리) ===== */
let bbsPosts=[];
let bbsFilter='all'; // all | open | done
let bbsPending=[];   // 첨부 대기열: {orig, dataurl, is_image, size}
let bbsEditId=null;  // 수정 중인 글 id
let bbsEditAtts=[];   // 수정 중 기존 첨부(삭제 가능)
let bbsEditPending=[]; // 수정 중 새 첨부(base64, 저장 시 업로드)
let bbsReplyId=null;    // 답글 폼 열린 글 id
let bbsReplyPending=[]; // 답글 첨부 대기열
let bbsReplyEditId=null;    // 수정 중인 답글 id
let bbsReplyEditAtts=[];    // 수정 중 기존 첨부
let bbsReplyEditPending=[]; // 수정 중 새 첨부
let bbsCollapsed=new Set(); // 사용자가 토글한 접힘 상태
let bbsManual=new Set();    // 사용자가 직접 토글한 글(기본값 무시)
function _bbsIsCollapsed(p){ return bbsManual.has(p.id) ? bbsCollapsed.has(p.id) : (p.status==='done'||p.status==='rejected'); } // 기본: 완료·거부=접힘, 요청중=펼침

function _bbsEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function _bbsToast(m){ if(typeof showToast==='function') showToast(m); else console.log(m); }
function _bbsFmtSize(b){ b=b||0; if(b<1024) return b+' B'; if(b<1048576) return (b/1024).toFixed(1)+' KB'; return (b/1048576).toFixed(1)+' MB'; }
function _bbsReadFile(f){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=()=>rej(r.error); r.readAsDataURL(f); }); }

async function bbsLoad(){
  try{
    // 캐시 절대 사용 안 함 — 방금 상태 바뀐 최신 목록 필요
    const r=await fetch('/api/board',{cache:'no-store',headers:{'Cache-Control':'no-cache','Pragma':'no-cache'}});
    if(!r.ok) throw new Error('HTTP '+r.status);
    const d=await r.json(); bbsPosts=(d&&d.posts)||[];
  }catch(e){ bbsPosts=[]; console.error('bbsLoad',e); }
}
function bbsSetFilter(f){ bbsFilter=f; bbsRender(); }
function bbsToggleCollapse(id){
  const p=bbsPosts.find(x=>x.id===id);
  const willCollapse=!(p?_bbsIsCollapsed(p):bbsCollapsed.has(id));
  bbsManual.add(id);
  if(willCollapse) bbsCollapsed.add(id); else bbsCollapsed.delete(id);
  const body=document.getElementById('bbs-body-'+id); if(body) body.style.display=willCollapse?'none':'';
  const chev=document.getElementById('bbs-chev-'+id); if(chev) chev.className='ti ti-chevron-'+(willCollapse?'right':'down');
}
function bbsCollapseAll(collapse){ bbsPosts.forEach(p=>{ bbsManual.add(p.id); if(collapse) bbsCollapsed.add(p.id); else bbsCollapsed.delete(p.id); }); bbsRender(); }
async function bbsRefreshList(){
  if(bbsEditId||bbsReplyId||bbsReplyEditId) return; // 수정/답글 작성·수정 중 갱신 보류(입력 보호)
  await bbsLoad();
  const lst=document.getElementById('bbs-list'); if(lst) lst.innerHTML=bbsRowsHtml();
  const c=document.getElementById('bbs-count');
  if(c){ const cnt=bbsPosts.length, open=bbsPosts.filter(p=>p.status!=='done').length, done=cnt-open;
    c.innerHTML='전체 '+cnt+' · <span style="color:#e8820c;">요청중 '+open+'</span> · <span style="color:var(--green);">완료 '+done+'</span>'; }
}

/* ── 첨부 대기열 (파일선택 + 붙여넣기 공통) ── */
function bbsAddFile(file){
  if(!file) return;
  const isImg=(file.type||'').indexOf('image/')===0;
  _bbsReadFile(file).then(function(durl){
    bbsPending.push({orig:(file.name||('pasted-'+Date.now()+'.png')), dataurl:durl, is_image:isImg, size:file.size||0});
    bbsRenderPending();
  }).catch(e=>_bbsToast('파일 읽기 실패: '+e));
}
function bbsPreview(){
  const fi=document.getElementById('bbs-files'); if(!fi||!fi.files) return;
  Array.from(fi.files).forEach(bbsAddFile);
  fi.value='';
}
function bbsPaste(e){
  const cd=e.clipboardData||window.clipboardData; if(!cd) return;
  let found=false;
  const items=cd.items||[];
  for(let i=0;i<items.length;i++){
    const it=items[i];
    if(it.kind==='file' && (it.type||'').indexOf('image/')===0){ const f=it.getAsFile(); if(f){ bbsAddFile(f); found=true; } }
  }
  if(!found && cd.files && cd.files.length){
    Array.from(cd.files).forEach(function(f){ if((f.type||'').indexOf('image/')===0){ bbsAddFile(f); found=true; } });
  }
  if(found){ e.preventDefault(); _bbsToast('이미지를 첨부했어요'); }
}
function bbsRemovePending(i){ bbsPending.splice(i,1); bbsRenderPending(); }
function bbsRenderPending(){
  const el=document.getElementById('bbs-pending'); if(!el) return;
  if(!bbsPending.length){ el.innerHTML=''; return; }
  el.innerHTML='<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:9px;">'+bbsPending.map(function(a,i){
    const inner=a.is_image
      ? '<img src="'+a.dataurl+'" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--border);display:block;">'
      : '<div style="width:64px;height:64px;border-radius:8px;border:1px solid var(--border);background:var(--bg3);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;color:var(--text2);"><i class="ti ti-file" style="font-size:22px;"></i><span style="font-size:9px;max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 3px;">'+_bbsEsc(a.orig)+'</span></div>';
    return '<div style="position:relative;" title="'+_bbsEsc(a.orig)+'">'+inner
      +'<button onclick="bbsRemovePending('+i+')" title="제거" style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;border:none;background:var(--red);color:#fff;cursor:pointer;font-size:12px;line-height:1;padding:0;display:flex;align-items:center;justify-content:center;">&times;</button>'
    +'</div>';
  }).join('')+'</div>';
}

async function bbsAdd(){
  const ti=document.getElementById('bbs-title'), bo=document.getElementById('bbs-body'), au=document.getElementById('bbs-author');
  if(!ti) return;
  const title=ti.value.trim();
  if(!title){ _bbsToast('제목을 입력하세요'); ti.focus(); return; }
  const author=(au&&au.value.trim())||'';
  if(author) localStorage.setItem('utop_bbs_author', author);
  const btn=document.getElementById('bbs-submit'); if(btn){ btn.disabled=true; btn.innerHTML='<i class="ti ti-loader-2"></i> 등록 중...'; }
  try{
    let attachments=[];
    for(let i=0;i<bbsPending.length;i++){
      const a=bbsPending[i];
      const r=await fetch('/api/board-upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orig:a.orig, data:a.dataurl})});
      if(!r.ok){ const t=await r.text(); throw new Error('첨부 업로드 실패('+r.status+') '+t); }
      const d=await r.json();
      if(d&&d.success) attachments.push({name:d.name,orig:d.orig,url:d.url,size:d.size,is_image:d.is_image});
    }
    const r2=await fetch('/api/board',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:title, body:(bo?bo.value.trim():''), author:author, attachments:attachments})});
    if(!r2.ok){ const t=await r2.text(); throw new Error('등록 실패('+r2.status+') — 백엔드를 재시작했는지 확인하세요. '+t); }
    bbsPending=[];
    try{ if(typeof mentionNotify==='function') await mentionNotify(title+' '+(bo?bo.value:''), '게시판 글: '+title, 'bbs'); }catch(e){}
    await bbsLoad(); bbsRender();
  }catch(e){
    console.error('bbsAdd',e);
    _bbsToast(String((e&&e.message)||e));
    if(btn){ btn.disabled=false; btn.innerHTML='<i class="ti ti-send"></i> 등록'; }
  }
}

async function bbsSetStatus(id, status){
  const _valid=(['open','approved','rejected','done'].indexOf(status)>=0?status:'open');
  // Optimistic: 로컬 상태 바로 갱신 + 즉시 재렌더 → 사용자에게 즉각 반영
  var _post=(bbsPosts||[]).find(function(p){return p.id===id;});
  if(_post){ _post.status=_valid; if(_valid==='done') _post.done_at=(new Date()).toISOString().replace('T',' ').slice(0,16); bbsRender(); }
  // 서버는 백그라운드로 저장 — 성공 응답의 post 로 로컬 갱신 (bbsLoad GET 안 함 → 캐시 지연 회피).
  // 실패 시엔 토스트만 알림. 자동 롤백은 하지 않아 "완료 → 요청중으로 되돌아감" 현상 방지.
  try{
    const r=await fetch('/api/board/'+id,{method:'POST',headers:{'Content-Type':'application/json','Cache-Control':'no-cache'},body:JSON.stringify({status:_valid}),cache:'no-store'});
    if(!r.ok){ _bbsToast('상태 저장 실패: HTTP '+r.status+' — 새로고침 후 다시 시도해 주세요'); return; }
    try{
      const d=await r.json();
      if(d && d.post && _post){ Object.assign(_post, d.post); bbsRender(); }
    }catch(_je){}
  }catch(e){ _bbsToast('상태 저장 실패: '+(e&&e.message?e.message:e)+' — 새로고침 후 다시 시도'); }
}

async function bbsDelete(id){
  if(!confirm('이 글을 삭제할까요?')) return;
  try{
    const r=await fetch('/api/board/'+id,{method:'DELETE'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    await bbsLoad(); bbsRender();
  }catch(e){ _bbsToast('삭제 실패: '+e); }
}

function bbsEdit(id){
  const p=bbsPosts.find(x=>x.id===id);
  bbsEditId=id;
  bbsEditAtts=(p&&Array.isArray(p.attachments))?p.attachments.map(a=>({...a})):[];
  bbsEditPending=[];
  bbsRender();
  setTimeout(()=>{ const t=document.getElementById('bbs-edit-title-'+id); if(t) t.focus(); },30);
}
function bbsEditCancel(){ bbsEditId=null; bbsEditAtts=[]; bbsEditPending=[]; bbsRender(); }
function _bbsThumb(src,a){ return a.is_image?'<img src="'+src+'" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--border);display:block;">':'<div style="width:64px;height:64px;border-radius:8px;border:1px solid var(--border);background:var(--bg3);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;color:var(--text2);"><i class="ti ti-file" style="font-size:22px;"></i><span style="font-size:9px;max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 3px;">'+_bbsEsc(a.orig)+'</span></div>'; }
function bbsEditAttsHtml(){
  const chip=(inner,onx,tag)=>'<div style="position:relative;" title="'+tag+'">'+inner+'<button onclick="'+onx+'" title="제거" style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;border:none;background:var(--red);color:#fff;cursor:pointer;font-size:12px;line-height:1;padding:0;display:flex;align-items:center;justify-content:center;">&times;</button></div>';
  const items=[];
  bbsEditAtts.forEach((a,i)=>items.push(chip(_bbsThumb(a.url,a),'bbsEditRemoveAtt('+i+')',_bbsEsc(a.orig))));
  bbsEditPending.forEach((a,i)=>items.push(chip(_bbsThumb(a.dataurl,a),'bbsEditRemovePending('+i+')',_bbsEsc(a.orig)+' (새 첨부)')));
  if(!items.length) return '';
  return '<div style="display:flex;flex-wrap:wrap;gap:8px;margin:8px 0;">'+items.join('')+'</div>';
}
function bbsEditRenderAtts(id){ const el=document.getElementById('bbs-edit-atts-'+id); if(el) el.innerHTML=bbsEditAttsHtml(); }
function bbsEditAddFile(file){
  if(!file) return;
  const isImg=(file.type||'').indexOf('image/')===0;
  _bbsReadFile(file).then(function(durl){ bbsEditPending.push({orig:(file.name||('pasted-'+Date.now()+'.png')), dataurl:durl, is_image:isImg, size:file.size||0}); bbsEditRenderAtts(bbsEditId); }).catch(e=>_bbsToast('파일 읽기 실패: '+e));
}
function bbsEditPickFiles(){ const fi=document.getElementById('bbs-edit-files'); if(!fi||!fi.files) return; Array.from(fi.files).forEach(bbsEditAddFile); fi.value=''; }
function bbsEditPaste(e){
  const cd=e.clipboardData||window.clipboardData; if(!cd) return; let found=false; const items=cd.items||[];
  for(let i=0;i<items.length;i++){ const it=items[i]; if(it.kind==='file'&&(it.type||'').indexOf('image/')===0){ const f=it.getAsFile(); if(f){ bbsEditAddFile(f); found=true; } } }
  if(!found && cd.files && cd.files.length){ Array.from(cd.files).forEach(function(f){ if((f.type||'').indexOf('image/')===0){ bbsEditAddFile(f); found=true; } }); }
  if(found){ e.preventDefault(); _bbsToast('이미지를 추가했어요'); }
}
function bbsEditRemoveAtt(i){ bbsEditAtts.splice(i,1); bbsEditRenderAtts(bbsEditId); }
function bbsEditRemovePending(i){ bbsEditPending.splice(i,1); bbsEditRenderAtts(bbsEditId); }
async function bbsEditSave(id){
  const ti=document.getElementById('bbs-edit-title-'+id), bo=document.getElementById('bbs-edit-body-'+id);
  if(!ti) return;
  const title=ti.value.trim(); if(!title){ _bbsToast('제목을 입력하세요'); ti.focus(); return; }
  try{
    let uploaded=[];
    for(let i=0;i<bbsEditPending.length;i++){
      const a=bbsEditPending[i];
      const r=await fetch('/api/board-upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orig:a.orig, data:a.dataurl})});
      if(!r.ok){ const t=await r.text(); throw new Error('첨부 업로드 실패('+r.status+') '+t); }
      const d=await r.json(); if(d&&d.success) uploaded.push({name:d.name,orig:d.orig,url:d.url,size:d.size,is_image:d.is_image});
    }
    const finalAtts=bbsEditAtts.concat(uploaded);
    const r2=await fetch('/api/board/'+id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:title, body:(bo?bo.value.trim():''), attachments:finalAtts})});
    if(!r2.ok){ const t=await r2.text(); throw new Error('수정 실패('+r2.status+') '+t); }
    bbsEditId=null; bbsEditAtts=[]; bbsEditPending=[];
    await bbsLoad(); bbsRender();
  }catch(e){ _bbsToast(String((e&&e.message)||e)); }
}
function _bbsEditCardHtml(p){
  return '<div style="border:1.5px solid var(--blue);border-radius:10px;padding:13px 16px;margin-bottom:10px;background:var(--bg2);">'
    +'<div style="font-size:12px;font-weight:700;color:var(--blue);margin-bottom:8px;"><i class="ti ti-pencil"></i> 글 수정 <span style="font-weight:400;color:var(--text3);">— 내용란에 이미지 붙여넣기(Ctrl+V) 가능</span></div>'
    +'<input id="bbs-edit-title-'+p.id+'" value="'+_bbsEsc(p.title)+'" onpaste="bbsEditPaste(event)" style="width:100%;font-size:14px;font-weight:700;padding:8px 11px;border:1px solid var(--border);border-radius:7px;background:var(--bg2);color:var(--text);outline:none;box-sizing:border-box;margin-bottom:8px;">'
    +'<textarea id="bbs-edit-body-'+p.id+'" rows="4" placeholder="상세 내용 — 이미지 붙여넣기(Ctrl+V) 가능" onpaste="bbsEditPaste(event)" style="width:100%;font-size:13px;padding:8px 11px;border:1px solid var(--border);border-radius:7px;background:var(--bg2);color:var(--text);outline:none;resize:vertical;box-sizing:border-box;font-family:inherit;">'+_bbsEsc(p.body||'')+'</textarea>'
    +'<div id="bbs-edit-atts-'+p.id+'">'+bbsEditAttsHtml()+'</div>'
    +'<div style="display:flex;align-items:center;gap:8px;margin-top:9px;flex-wrap:wrap;">'
      +'<label style="font-size:12px;padding:6px 12px;border:1px dashed var(--border);border-radius:7px;background:var(--bg3);color:var(--text2);cursor:pointer;white-space:nowrap;"><i class="ti ti-paperclip"></i> 사진·파일 추가<input type="file" id="bbs-edit-files" multiple accept="image/*,*" style="display:none;" onchange="bbsEditPickFiles()"></label>'
      +'<span style="flex:1;"></span>'
      +'<button onclick="bbsEditCancel()" style="font-size:12px;padding:7px 16px;border-radius:7px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;font-weight:600;">취소</button>'
      +'<button onclick="bbsEditSave(\''+p.id+'\')" style="font-size:12px;padding:7px 18px;border-radius:7px;border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:700;">저장</button>'
    +'</div>'
  +'</div>';
}

function bbsLightbox(url){
  const ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:12000;display:flex;align-items:center;justify-content:center;';
  ov.innerHTML='<img src="'+url+'" style="max-width:94vw;max-height:94vh;border-radius:8px;box-shadow:0 10px 50px rgba(0,0,0,0.6);object-fit:contain;display:block;">'
    +'<button id="bbs-lb-close" title="닫기 (Esc)" style="position:fixed;top:18px;right:22px;width:42px;height:42px;border-radius:50%;border:none;background:rgba(255,255,255,0.18);color:#fff;font-size:24px;cursor:pointer;line-height:1;display:flex;align-items:center;justify-content:center;">&times;</button>';
  const onkey=(e)=>{ if(e.key==='Escape') close(); };
  const close=()=>{ try{ov.remove();}catch(e){} document.removeEventListener('keydown',onkey); };
  ov.addEventListener('click',(e)=>{ if(e.target===ov||(e.target&&e.target.id==='bbs-lb-close')) close(); });
  document.addEventListener('keydown',onkey);
  document.body.appendChild(ov);
}
function _bbsAttachHtml(atts){
  if(!atts||!atts.length) return '';
  const imgs=atts.filter(a=>a.is_image), files=atts.filter(a=>!a.is_image);
  let h='';
  if(imgs.length) h+='<div style="display:flex;flex-wrap:wrap;gap:8px;margin:8px 0;">'+imgs.map(a=>'<img src="'+a.url+'" alt="'+_bbsEsc(a.orig)+'" title="'+_bbsEsc(a.orig)+' — 클릭하면 크게 보기" onclick="bbsLightbox(\''+a.url+'\')" style="max-width:220px;max-height:200px;border-radius:8px;border:1px solid var(--border);object-fit:cover;cursor:zoom-in;display:block;">').join('')+'</div>';
  if(files.length) h+='<div style="display:flex;flex-direction:column;gap:4px;margin:6px 0;">'+files.map(a=>'<a href="'+a.url+'" download="'+_bbsEsc(a.orig)+'" style="font-size:12px;color:var(--blue);text-decoration:none;display:inline-flex;align-items:center;gap:5px;width:fit-content;"><i class="ti ti-paperclip"></i> '+_bbsEsc(a.orig)+' <span style="color:var(--text3);">('+_bbsFmtSize(a.size)+')</span></a>').join('')+'</div>';
  return h;
}

function bbsReplyOpen(id){ bbsReplyId=id; bbsReplyPending=[]; bbsRender(); setTimeout(()=>{ const t=document.getElementById('bbs-reply-body-'+id); if(t) t.focus(); },30); }
function bbsReplyCancel(){ bbsReplyId=null; bbsReplyPending=[]; bbsRender(); }
function bbsReplyAddFile(file){
  if(!file) return;
  const isImg=(file.type||'').indexOf('image/')===0;
  _bbsReadFile(file).then(function(durl){ bbsReplyPending.push({orig:(file.name||('pasted-'+Date.now()+'.png')), dataurl:durl, is_image:isImg, size:file.size||0}); bbsReplyRenderPending(); }).catch(e=>_bbsToast('파일 읽기 실패: '+e));
}
function bbsReplyPickFiles(){ const fi=document.getElementById('bbs-reply-files'); if(!fi||!fi.files) return; Array.from(fi.files).forEach(bbsReplyAddFile); fi.value=''; }
function bbsReplyPaste(e){
  const cd=e.clipboardData||window.clipboardData; if(!cd) return; let found=false; const items=cd.items||[];
  for(let i=0;i<items.length;i++){ const it=items[i]; if(it.kind==='file'&&(it.type||'').indexOf('image/')===0){ const f=it.getAsFile(); if(f){ bbsReplyAddFile(f); found=true; } } }
  if(!found && cd.files && cd.files.length){ Array.from(cd.files).forEach(function(f){ if((f.type||'').indexOf('image/')===0){ bbsReplyAddFile(f); found=true; } }); }
  if(found){ e.preventDefault(); _bbsToast('이미지를 첨부했어요'); }
}
function bbsReplyRemovePending(i){ bbsReplyPending.splice(i,1); bbsReplyRenderPending(); }
function bbsReplyRenderPending(){
  const el=document.getElementById('bbs-reply-pending'); if(!el) return;
  if(!bbsReplyPending.length){ el.innerHTML=''; return; }
  el.innerHTML='<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;">'+bbsReplyPending.map(function(a,i){ return '<div style="position:relative;" title="'+_bbsEsc(a.orig)+'">'+_bbsThumb(a.dataurl,a)+'<button onclick="bbsReplyRemovePending('+i+')" title="제거" style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;border:none;background:var(--red);color:#fff;cursor:pointer;font-size:12px;line-height:1;padding:0;display:flex;align-items:center;justify-content:center;">&times;</button></div>'; }).join('')+'</div>';
}
async function bbsReplySubmit(id){
  const au=document.getElementById('bbs-reply-author-'+id), bo=document.getElementById('bbs-reply-body-'+id);
  const body=(bo?bo.value.trim():'');
  if(!body && !bbsReplyPending.length){ _bbsToast('내용 또는 이미지를 입력하세요'); if(bo) bo.focus(); return; }
  const author=(au&&au.value.trim())||'';
  if(author) localStorage.setItem('utop_bbs_author', author);
  try{
    let uploaded=[];
    for(let i=0;i<bbsReplyPending.length;i++){
      const a=bbsReplyPending[i];
      const r=await fetch('/api/board-upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orig:a.orig, data:a.dataurl})});
      if(!r.ok){ const t=await r.text(); throw new Error('첨부 업로드 실패('+r.status+') '+t); }
      const d=await r.json(); if(d&&d.success) uploaded.push({name:d.name,orig:d.orig,url:d.url,size:d.size,is_image:d.is_image});
    }
    const r2=await fetch('/api/board/'+id+'/reply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({author:author, body:body, attachments:uploaded})});
    if(!r2.ok){ const t=await r2.text(); throw new Error('답글 등록 실패('+r2.status+') '+t); }
    bbsReplyId=null; bbsReplyPending=[];
    await bbsLoad(); bbsRender();
  }catch(e){ _bbsToast(String((e&&e.message)||e)); }
}
async function bbsReplyDelete(pid, rid){
  if(!confirm('답글을 삭제할까요?')) return;
  try{
    const r=await fetch('/api/board/'+pid+'/reply/'+rid,{method:'DELETE'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    await bbsLoad(); bbsRender();
  }catch(e){ _bbsToast('삭제 실패: '+e); }
}
function bbsReplyEdit(pid, rid){
  const p=bbsPosts.find(x=>x.id===pid); const rp=p&&(p.replies||[]).find(r=>r.id===rid);
  bbsReplyId=null;
  bbsReplyEditId=rid;
  bbsReplyEditAtts=(rp&&Array.isArray(rp.attachments))?rp.attachments.map(a=>({...a})):[];
  bbsReplyEditPending=[];
  bbsRender();
  setTimeout(()=>{ const t=document.getElementById('bbs-redit-body-'+rid); if(t) t.focus(); },30);
}
function bbsReplyEditCancel(){ bbsReplyEditId=null; bbsReplyEditAtts=[]; bbsReplyEditPending=[]; bbsRender(); }
function bbsReplyEditAddFile(file){ if(!file) return; const isImg=(file.type||'').indexOf('image/')===0; _bbsReadFile(file).then(function(durl){ bbsReplyEditPending.push({orig:(file.name||('pasted-'+Date.now()+'.png')), dataurl:durl, is_image:isImg, size:file.size||0}); bbsReplyEditRenderAtts(bbsReplyEditId); }).catch(e=>_bbsToast('파일 읽기 실패: '+e)); }
function bbsReplyEditPickFiles(){ const fi=document.getElementById('bbs-redit-files-'+bbsReplyEditId); if(!fi||!fi.files) return; Array.from(fi.files).forEach(bbsReplyEditAddFile); fi.value=''; }
function bbsReplyEditPaste(e){ const cd=e.clipboardData||window.clipboardData; if(!cd) return; let found=false; const items=cd.items||[]; for(let i=0;i<items.length;i++){ const it=items[i]; if(it.kind==='file'&&(it.type||'').indexOf('image/')===0){ const f=it.getAsFile(); if(f){ bbsReplyEditAddFile(f); found=true; } } } if(!found&&cd.files&&cd.files.length){ Array.from(cd.files).forEach(function(f){ if((f.type||'').indexOf('image/')===0){ bbsReplyEditAddFile(f); found=true; } }); } if(found){ e.preventDefault(); _bbsToast('이미지를 추가했어요'); } }
function bbsReplyEditRemoveAtt(i){ bbsReplyEditAtts.splice(i,1); bbsReplyEditRenderAtts(bbsReplyEditId); }
function bbsReplyEditRemovePending(i){ bbsReplyEditPending.splice(i,1); bbsReplyEditRenderAtts(bbsReplyEditId); }
function bbsReplyEditAttsHtml(){
  const chip=(inner,onx,tag)=>'<div style="position:relative;" title="'+tag+'">'+inner+'<button onclick="'+onx+'" title="제거" style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;border:none;background:var(--red);color:#fff;cursor:pointer;font-size:12px;line-height:1;padding:0;display:flex;align-items:center;justify-content:center;">&times;</button></div>';
  const items=[];
  bbsReplyEditAtts.forEach((a,i)=>items.push(chip(_bbsThumb(a.url,a),'bbsReplyEditRemoveAtt('+i+')',_bbsEsc(a.orig))));
  bbsReplyEditPending.forEach((a,i)=>items.push(chip(_bbsThumb(a.dataurl,a),'bbsReplyEditRemovePending('+i+')',_bbsEsc(a.orig)+' (새 첨부)')));
  if(!items.length) return '';
  return '<div style="display:flex;flex-wrap:wrap;gap:8px;margin:8px 0;">'+items.join('')+'</div>';
}
function bbsReplyEditRenderAtts(rid){ const el=document.getElementById('bbs-redit-atts-'+rid); if(el) el.innerHTML=bbsReplyEditAttsHtml(); }
async function bbsReplyEditSave(pid, rid){
  const bo=document.getElementById('bbs-redit-body-'+rid);
  const body=(bo?bo.value.trim():'');
  if(!body && !bbsReplyEditAtts.length && !bbsReplyEditPending.length){ _bbsToast('내용 또는 이미지를 입력하세요'); return; }
  try{
    let uploaded=[];
    for(let i=0;i<bbsReplyEditPending.length;i++){ const a=bbsReplyEditPending[i]; const r=await fetch('/api/board-upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orig:a.orig, data:a.dataurl})}); if(!r.ok){ const t=await r.text(); throw new Error('첨부 업로드 실패('+r.status+') '+t); } const d=await r.json(); if(d&&d.success) uploaded.push({name:d.name,orig:d.orig,url:d.url,size:d.size,is_image:d.is_image}); }
    const finalAtts=bbsReplyEditAtts.concat(uploaded);
    const r2=await fetch('/api/board/'+pid+'/reply/'+rid,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({body:body, attachments:finalAtts})});
    if(!r2.ok){ const t=await r2.text(); throw new Error('답글 수정 실패('+r2.status+') '+t); }
    bbsReplyEditId=null; bbsReplyEditAtts=[]; bbsReplyEditPending=[];
    await bbsLoad(); bbsRender();
  }catch(e){ _bbsToast(String((e&&e.message)||e)); }
}
function _bbsRepliesHtml(p){
  const reps=Array.isArray(p.replies)?p.replies:[];
  let h='';
  if(reps.length){
    h+='<div style="margin-top:10px;border-top:1px dashed var(--border);padding-top:9px;display:flex;flex-direction:column;gap:8px;">';
    reps.forEach(function(rp){
      if(rp.id===bbsReplyEditId){
        h+='<div style="border-left:3px solid var(--blue);background:var(--bg2);border-radius:0 9px 9px 0;padding:10px 12px;">'
          +'<div style="font-size:11px;font-weight:700;color:var(--blue);margin-bottom:6px;"><i class="ti ti-pencil"></i> 답글 수정 <span style="font-weight:400;color:var(--text3);">— 이미지 붙여넣기(Ctrl+V) 가능</span></div>'
          +'<textarea id="bbs-redit-body-'+rp.id+'" rows="3" onpaste="bbsReplyEditPaste(event)" style="width:100%;font-size:12.5px;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);color:var(--text);outline:none;resize:vertical;box-sizing:border-box;font-family:inherit;">'+_bbsEsc(rp.body||'')+'</textarea>'
          +'<div id="bbs-redit-atts-'+rp.id+'">'+bbsReplyEditAttsHtml()+'</div>'
          +'<div style="display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap;">'
            +'<label style="font-size:11px;padding:6px 11px;border:1px dashed var(--border);border-radius:6px;background:var(--bg3);color:var(--text2);cursor:pointer;white-space:nowrap;"><i class="ti ti-paperclip"></i> 사진·파일<input type="file" id="bbs-redit-files-'+rp.id+'" multiple accept="image/*,*" style="display:none;" onchange="bbsReplyEditPickFiles()"></label>'
            +'<span style="flex:1;"></span>'
            +'<button onclick="bbsReplyEditCancel()" style="font-size:12px;padding:6px 14px;border-radius:6px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;font-weight:600;">취소</button>'
            +'<button onclick="bbsReplyEditSave(\''+p.id+'\',\''+rp.id+'\')" style="font-size:12px;padding:6px 16px;border-radius:6px;border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:700;">저장</button>'
          +'</div>'
        +'</div>';
        return;
      }
      h+='<div style="border-left:3px solid var(--green);background:var(--bg3);border-radius:0 8px 8px 0;padding:8px 11px;">'
        +'<div style="display:flex;align-items:center;gap:7px;margin-bottom:3px;">'
          +'<i class="ti ti-corner-down-right" style="color:var(--green);font-size:13px;"></i>'
          +'<span style="font-size:11.5px;font-weight:700;color:var(--text);">'+_bbsEsc(rp.author||'익명')+'</span>'
          +'<span style="font-size:10px;color:var(--text3);">'+_bbsEsc(rp.updated_at||rp.created_at||'')+'</span>'
          +'<span style="flex:1;"></span>'
          +'<button onclick="bbsReplyEdit(\''+p.id+'\',\''+rp.id+'\')" title="답글 수정" style="font-size:11px;padding:2px 8px;border-radius:5px;border:1px solid var(--blue);background:var(--bg2);color:var(--blue);cursor:pointer;font-weight:700;"><i class="ti ti-pencil"></i> 수정</button>'
          +'<button onclick="bbsReplyDelete(\''+p.id+'\',\''+rp.id+'\')" title="답글 삭제" style="font-size:11px;padding:2px 7px;border-radius:5px;border:1px solid var(--border);background:var(--bg2);color:var(--red);cursor:pointer;"><i class="ti ti-x"></i></button>'
        +'</div>'
        +(rp.body?'<div style="font-size:12.5px;color:var(--text);line-height:1.6;white-space:pre-wrap;word-break:break-word;margin:2px 0;">'+_bbsEsc(rp.body)+'</div>':'')
        +_bbsAttachHtml(rp.attachments)
      +'</div>';
    });
    h+='</div>';
  }
  if(bbsReplyId===p.id){
    const author=localStorage.getItem('utop_bbs_author')||'';
    h+='<div style="margin-top:9px;border:1px solid var(--green);border-radius:9px;padding:11px 13px;background:var(--bg2);">'
      +'<div style="font-size:11.5px;font-weight:700;color:var(--green);margin-bottom:7px;"><i class="ti ti-corner-down-right"></i> 답글 작성 <span style="font-weight:400;color:var(--text3);">— 캡처 이미지 붙여넣기(Ctrl+V) 가능</span></div>'
      +'<input id="bbs-reply-author-'+p.id+'" value="'+_bbsEsc(author)+'" placeholder="작성자" style="width:150px;font-size:12.5px;padding:7px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);color:var(--text);outline:none;margin-bottom:7px;">'
      +'<textarea id="bbs-reply-body-'+p.id+'" rows="3" placeholder="처리 내용 / 결과 (이미지 붙여넣기 가능)" onpaste="bbsReplyPaste(event)" style="width:100%;font-size:12.5px;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);color:var(--text);outline:none;resize:vertical;box-sizing:border-box;font-family:inherit;"></textarea>'
      +'<div id="bbs-reply-pending"></div>'
      +'<div style="display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap;">'
        +'<label style="font-size:11.5px;padding:6px 11px;border:1px dashed var(--border);border-radius:6px;background:var(--bg3);color:var(--text2);cursor:pointer;white-space:nowrap;"><i class="ti ti-paperclip"></i> 사진·파일<input type="file" id="bbs-reply-files" multiple accept="image/*,*" style="display:none;" onchange="bbsReplyPickFiles()"></label>'
        +'<span style="flex:1;"></span>'
        +'<button onclick="bbsReplyCancel()" style="font-size:12px;padding:6px 14px;border-radius:6px;border:1px solid var(--border);background:var(--bg3);color:var(--text2);cursor:pointer;font-weight:600;">취소</button>'
        +'<button onclick="bbsReplySubmit(\''+p.id+'\')" style="font-size:12px;padding:6px 16px;border-radius:6px;border:none;background:var(--green);color:#fff;cursor:pointer;font-weight:700;">답글 등록</button>'
      +'</div>'
    +'</div>';
  } else {
    h+='<div style="margin-top:8px;"><button onclick="bbsReplyOpen(\''+p.id+'\')" style="font-size:11.5px;padding:5px 13px;border-radius:6px;border:1px solid var(--green);background:var(--bg2);color:var(--green);cursor:pointer;font-weight:700;"><i class="ti ti-corner-down-right"></i> 답글'+(reps.length?(' '+reps.length):'')+'</button></div>';
  }
  return h;
}
function bbsRowsHtml(){
  let list=bbsPosts.slice();
  if(bbsFilter==='open') list=list.filter(p=>(p.status||'open')==='open');
  else if(bbsFilter==='approved') list=list.filter(p=>p.status==='approved');
  else if(bbsFilter==='rejected') list=list.filter(p=>p.status==='rejected');
  else if(bbsFilter==='done') list=list.filter(p=>p.status==='done');
  if(!list.length) return '<div style="padding:46px;text-align:center;color:var(--text3);font-size:13px;"><i class="ti ti-inbox" style="font-size:40px;display:block;margin-bottom:10px;opacity:0.3;"></i>등록된 글이 없습니다.</div>';
  return list.map(function(p){
    if(p.id===bbsEditId) return _bbsEditCardHtml(p);
    const st=p.status||'open'; const done=st==='done'; const appr=st==='approved'; const rej=st==='rejected';
    const _sc=done?'var(--green)':appr?'var(--blue)':rej?'var(--red)':'#e8820c';   // 완료=녹/승인=파랑/거부=빨강/요청중=주황
    const col=_bbsIsCollapsed(p);
    const atC=(p.attachments||[]).length, rpC=(p.replies||[]).length;
    return '<div style="border:1px solid var(--border);border-radius:8px;padding:4px 13px;margin-bottom:4px;background:var(--bg2);'+((done||rej)?'opacity:0.7;':'')+'">'
      +'<div style="display:flex;align-items:center;gap:9px;'+(col?'':'margin-bottom:4px;')+'">'
        +'<i id="bbs-chev-'+p.id+'" class="ti ti-chevron-'+(col?'right':'down')+'" onclick="bbsToggleCollapse(\''+p.id+'\')" title="접기/펴기" style="color:var(--text3);font-size:16px;cursor:pointer;flex-shrink:0;"></i>'
        +'<span style="font-size:11px;font-weight:700;padding:2px 9px;border-radius:20px;white-space:nowrap;background:'+(done?'rgba(0,168,114,0.16)':appr?'rgba(45,111,212,0.16)':rej?'rgba(229,62,90,0.16)':'rgba(232,130,12,0.16)')+';color:'+_sc+';">'+(done?'완료':appr?'승인':rej?'거부':'요청중')+'</span>'
        +'<span onclick="bbsToggleCollapse(\''+p.id+'\')" style="font-size:14px;font-weight:700;color:var(--text);'+(done?'text-decoration:line-through;color:var(--text2);':rej?'text-decoration:line-through;color:var(--red);':'')+'flex:1;min-width:0;word-break:break-word;cursor:pointer;">'+_bbsEsc(p.title)+'</span>'
        +((atC||rpC)?'<span style="font-size:11px;color:var(--text3);white-space:nowrap;display:flex;align-items:center;gap:7px;">'+(atC?('<span><i class="ti ti-paperclip"></i> '+atC+'</span>'):'')+(rpC?('<span><i class="ti ti-message-circle"></i> '+rpC+'</span>'):'')+'</span>':'')
        +'<select onchange="bbsSetStatus(\''+p.id+'\',this.value)" title="상태 변경" style="font-size:11px;padding:4px 8px;border-radius:6px;cursor:pointer;font-weight:700;outline:none;border:1px solid '+_sc+';background:var(--bg2);color:'+_sc+';"><option value="open"'+(st==='open'?' selected':'')+'>요청중</option><option value="approved"'+(appr?' selected':'')+'>승인</option><option value="rejected"'+(rej?' selected':'')+'>거부</option><option value="done"'+(done?' selected':'')+'>완료</option></select>'
        +'<button onclick="bbsEdit(\''+p.id+'\')" title="글 수정" style="font-size:11px;padding:5px 11px;border-radius:6px;border:1px solid var(--blue);background:var(--bg2);color:var(--blue);cursor:pointer;font-weight:700;white-space:nowrap;"><i class="ti ti-pencil" style="font-size:12px;"></i> 수정</button>'
        +'<button onclick="bbsDelete(\''+p.id+'\')" title="삭제" style="font-size:13px;padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg3);color:var(--red);cursor:pointer;"><i class="ti ti-trash"></i></button>'
      +'</div>'
      +'<div id="bbs-body-'+p.id+'" style="'+(col?'display:none;':'')+'">'
        +(p.body?'<div style="font-size:13px;color:var(--text);line-height:1.65;white-space:pre-wrap;word-break:break-word;margin:2px 0 4px;padding-left:2px;">'+_bbsEsc(p.body)+'</div>':'')
        +_bbsAttachHtml(p.attachments)
        +'<div style="font-size:11px;color:var(--text3);"><i class="ti ti-user" style="font-size:11px;"></i> '+_bbsEsc(p.author||'익명')+' &middot; '+_bbsEsc(p.created_at||'')+(done&&p.done_at?(' &middot; <span style="color:var(--green);">완료 '+_bbsEsc(p.done_at)+'</span>'):'')+'</div>'
        +_bbsRepliesHtml(p)
      +'</div>'
    +'</div>';
  }).join('');
}

function bbsRender(){
  const host=document.getElementById('page-bbs'); if(!host) return;
  const cnt=bbsPosts.length, done=bbsPosts.filter(p=>p.status==='done').length, appr=bbsPosts.filter(p=>p.status==='approved').length, rej=bbsPosts.filter(p=>p.status==='rejected').length, open=cnt-done-appr-rej;
  const fbtn=(k,lab)=>'<button onclick="bbsSetFilter(\''+k+'\')" style="font-size:12px;padding:5px 14px;border:1px solid var(--border);cursor:pointer;font-weight:700;background:'+(bbsFilter===k?'var(--blue)':'var(--bg2)')+';color:'+(bbsFilter===k?'#fff':'var(--text2)')+';">'+lab+'</button>';
  const author=localStorage.getItem('utop_bbs_author')||'';
  host.innerHTML=
    '<div style="height:46px;display:flex;align-items:center;gap:11px;padding:0 18px;border-bottom:1px solid var(--border);background:var(--bg3);flex-shrink:0;">'
      +'<i class="ti ti-message-2" style="color:var(--blue);font-size:18px;"></i>'
      +'<b style="font-size:15px;color:var(--text);">게시판 <span style="font-size:12px;color:var(--text3);font-weight:600;">— 수정사항 요청</span></b>'
      +'<span id="bbs-count" style="font-size:12px;color:var(--text3);">전체 '+cnt+' · <span style="color:#e8820c;">요청중 '+open+'</span> · <span style="color:var(--blue);">승인 '+appr+'</span> · <span style="color:var(--red);">거부 '+rej+'</span> · <span style="color:var(--green);">완료 '+done+'</span></span>'
      +'<span style="flex:1;"></span>'
      +'<button onclick="bbsCollapseAll(true)" title="전체 접기" style="font-size:11.5px;padding:5px 11px;border-radius:6px;border:1px solid var(--border);background:var(--bg2);color:var(--text2);cursor:pointer;font-weight:600;white-space:nowrap;"><i class="ti ti-chevrons-up"></i> 모두 접기</button>'
      +'<button onclick="bbsCollapseAll(false)" title="전체 펴기" style="font-size:11.5px;padding:5px 11px;border-radius:6px;border:1px solid var(--border);background:var(--bg2);color:var(--text2);cursor:pointer;font-weight:600;white-space:nowrap;"><i class="ti ti-chevrons-down"></i> 모두 펴기</button>'
      +'<div style="display:flex;border-radius:6px;overflow:hidden;flex-shrink:0;">'+fbtn('all','전체')+fbtn('open','요청중')+fbtn('approved','승인')+fbtn('rejected','거부')+fbtn('done','완료')+'</div>'
    +'</div>'
    +'<div style="flex:1;overflow-y:auto;padding:18px 24px;">'
      +'<div style="border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:18px;background:var(--bg2);">'
        +'<div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:9px;"><i class="ti ti-pencil-plus"></i> 새 요청 등록 <span style="font-weight:400;color:var(--text3);">— 상세 내용에 이미지를 <b>붙여넣기(Ctrl+V)</b> 하면 첨부됩니다</span></div>'
        +'<div style="display:flex;gap:8px;margin-bottom:8px;">'
          +'<input id="bbs-author" value="'+_bbsEsc(author)+'" placeholder="작성자" style="width:150px;font-size:13px;padding:8px 11px;border:1px solid var(--border);border-radius:7px;background:var(--bg2);color:var(--text);outline:none;">'
          +'<input id="bbs-title" placeholder="수정 요청 제목" onpaste="bbsPaste(event)" onkeydown="if(event.key===\'Enter\'){var b=document.getElementById(\'bbs-body\');if(b)b.focus();}" style="flex:1;min-width:0;font-size:13px;padding:8px 11px;border:1px solid var(--border);border-radius:7px;background:var(--bg2);color:var(--text);outline:none;">'
        +'</div>'
        +'<textarea id="bbs-body" placeholder="상세 내용 (선택) — @로 멘션 · 캡처 이미지 붙여넣기(Ctrl+V) 가능" rows="4" onfocus="if(typeof mentionAttach===\'function\')mentionAttach(this)" onpaste="bbsPaste(event)" style="width:100%;font-size:13px;padding:8px 11px;border:1px solid var(--border);border-radius:7px;background:var(--bg2);color:var(--text);outline:none;resize:vertical;box-sizing:border-box;font-family:inherit;"></textarea>'
        +'<div id="bbs-pending"></div>'
        +'<div style="display:flex;align-items:center;gap:8px;margin-top:9px;flex-wrap:wrap;">'
          +'<label style="font-size:12px;padding:7px 13px;border:1px dashed var(--border);border-radius:7px;background:var(--bg3);color:var(--text2);cursor:pointer;white-space:nowrap;"><i class="ti ti-paperclip"></i> 사진·파일 첨부<input type="file" id="bbs-files" multiple accept="image/*,*" style="display:none;" onchange="bbsPreview()"></label>'
          +'<span style="flex:1;"></span>'
          +'<button id="bbs-submit" onclick="bbsAdd()" style="font-size:13px;padding:8px 22px;border-radius:7px;border:none;background:var(--blue);color:#fff;cursor:pointer;font-weight:700;white-space:nowrap;"><i class="ti ti-send"></i> 등록</button>'
        +'</div>'
      +'</div>'
      +'<div id="bbs-list">'+bbsRowsHtml()+'</div>'
    +'</div>';
  bbsRenderPending();
}
