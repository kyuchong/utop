var _userFilter={company:'',dept:'',team:'',q:''};
async function renderUsers(skipFetch){
  const body=document.getElementById('users-body'); if(!body) return;
  if(!isAdmin()){ body.innerHTML='<div style="text-align:center;color:var(--text3);padding:60px;"><i class="ti ti-lock" style="font-size:46px;opacity:0.3;display:block;margin-bottom:14px;"></i><div style="font-size:16px;font-weight:700;">관리자만 접근할 수 있습니다.</div></div>'; return; }
  if(!skipFetch){
    body.innerHTML='<div style="color:var(--text3);padding:20px;">불러오는 중…</div>';
    try{ const d=await userApi('GET','/api/users'); _usersList=d.users||[]; if(d.roles) _userRoles=d.roles; }
    catch(e){ body.innerHTML='<div style="color:var(--red);padding:20px;">'+e.message+'</div>'; return; }
  }
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  const _flist=_usersList.filter(_userPass);
  const fOpt=(field,label)=>{ const opts=_userOpts(field); return '<select onchange="userFilterSet(\''+field+'\',this.value)" style="font-size:12.5px;padding:6px 9px;border:1px solid var(--border);border-radius:7px;cursor:pointer;outline:none;background:#fff;"><option value="">'+label+' 전체</option>'+opts.map(o=>'<option'+(_userFilter[field]===o?' selected':'')+'>'+esc(o)+'</option>').join('')+'</select>'; };
  const filterBar=`<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px;">
      <span style="font-size:11px;font-weight:800;color:var(--text3);"><i class="ti ti-filter"></i> 필터</span>
      ${fOpt('company','회사')}${fOpt('dept','소속담당')}${fOpt('team','소속팀')}
      <input id="user-q" value="${esc(_userFilter.q||'')}" oninput="userFilterSet('q',this.value)" placeholder="아이디·이름·이메일…" style="font-size:12.5px;padding:6px 10px;border:1px solid var(--border);border-radius:7px;outline:none;width:180px;">
      <button onclick="userFilterClear()" style="font-size:12px;padding:6px 11px;border:1px solid var(--border);border-radius:7px;background:#fff;color:var(--text2);cursor:pointer;"><i class="ti ti-rotate"></i> 초기화</button>
      <span style="flex:1;"></span>
      <span style="font-size:12px;color:var(--text3);">표시 <b style="color:var(--text2);">${_flist.length}</b> / 전체 ${_usersList.length}명</span>
      <button onclick="usersCopy()" title="현재 표시된 사용자 표를 클립보드로 복사 (엑셀에 붙여넣기)" style="font-size:12px;font-weight:700;padding:6px 14px;border:1px solid #2d6fd4;border-radius:7px;background:#fff;color:#2d6fd4;cursor:pointer;"><i class="ti ti-copy"></i> 복사</button>
      <button onclick="usersDeleteSelected()" title="체크한 사용자 일괄 삭제" style="font-size:12px;font-weight:700;padding:6px 14px;border:1px solid #f0c2cb;border-radius:7px;background:#fff;color:var(--red);cursor:pointer;"><i class="ti ti-trash"></i> 선택 삭제</button>
    </div>`;
  const rows=_flist.map((u,ri)=>{
    const col=ROLE_COLORS[u.role]||'#5a6072'; const isMe=currentUser&&currentUser.username===u.username; const on=u.active!==false; const pending=(u.pending&&!on);
    const statusCell = pending
      ? `<td style="padding:9px 12px;"><span style="font-size:10px;font-weight:700;color:#b5730f;background:#fff3e0;border:1px solid #f0c98a;border-radius:20px;padding:3px 9px;white-space:nowrap;">승인 대기</span></td>`
      : `<td style="padding:9px 12px;"><button onclick="userToggleActive('${esc(u.username)}',${on})" style="font-size:11px;font-weight:700;padding:4px 11px;border-radius:20px;border:1px solid ${on?'rgba(0,168,114,0.4)':'rgba(229,62,90,0.4)'};background:${on?'rgba(0,168,114,0.1)':'rgba(229,62,90,0.08)'};color:${on?'#00875a':'#d12d49'};cursor:pointer;">${on?'● 활성':'○ 비활성'}</button></td>`;
    const manageCell = pending
      ? `<td style="padding:9px 12px;white-space:nowrap;"><button onclick="userApprove('${esc(u.username)}')" style="font-size:11px;font-weight:700;padding:5px 11px;border:none;border-radius:6px;background:#00a872;color:#fff;cursor:pointer;margin-right:5px;"><i class="ti ti-check"></i> 승인</button><button onclick="userDelete('${esc(u.username)}','${esc(u.name)}')" style="font-size:11px;padding:5px 9px;border:1px solid #f0c2cb;border-radius:6px;background:#fff;color:var(--red);cursor:pointer;"><i class="ti ti-x"></i> 거절</button></td>`
      : `<td style="padding:9px 12px;white-space:nowrap;"><button onclick="userResetPw('${esc(u.username)}')" style="font-size:11px;padding:4px 9px;border:1px solid var(--border);border-radius:6px;background:#fff;color:var(--text2);cursor:pointer;margin-right:5px;"><i class="ti ti-key"></i> 비번</button><button onclick="userDelete('${esc(u.username)}','${esc(u.name)}')" ${u.username==='admin'?'disabled style="opacity:0.3;cursor:not-allowed;border:1px solid var(--border);border-radius:6px;background:#fff;padding:4px 9px;"':'style="font-size:11px;padding:4px 9px;border:1px solid #f0c2cb;border-radius:6px;background:#fff;color:var(--red);cursor:pointer;"'}><i class="ti ti-trash"></i></button></td>`;
    return `<tr style="border-bottom:1px solid var(--border);${pending?'background:#fffaf3;':''}">
      <td style="padding:9px 6px;text-align:center;"><input type="checkbox" class="user-chk" value="${esc(u.username)}" ${u.username==='admin'?'disabled title="기본 관리자는 삭제 불가"':''}></td>
      <td style="padding:9px 12px;font-family:monospace;font-weight:700;color:var(--text);">${esc(u.username)}${isMe?' <span style="font-size:9px;color:#2d6fd4;">(나)</span>':''}</td>
      <td style="padding:9px 12px;">${orgSel('',orgCompanyNames(),u.company||'','font-size:12.5px;padding:5px 7px;border:1px solid var(--border);border-radius:6px;',`onchange="userSave('${esc(u.username)}','company',this.value)" oncontextmenu="userGridCtx(event,'company',${ri},this.value)"`,'회사')}</td>
      <td style="padding:9px 12px;">${orgSel('',orgDeptNames(u.company),u.dept||'','font-size:12.5px;padding:5px 7px;border:1px solid var(--border);border-radius:6px;',`onchange="userSave('${esc(u.username)}','dept',this.value)" oncontextmenu="userGridCtx(event,'dept',${ri},this.value)"`,'소속담당')}</td>
      <td style="padding:9px 12px;">${orgSel('',orgTeamNames(u.company,u.dept),u.team||'','font-size:12.5px;padding:5px 7px;border:1px solid var(--border);border-radius:6px;',`onchange="userSave('${esc(u.username)}','team',this.value)" oncontextmenu="userGridCtx(event,'team',${ri},this.value)"`,'소속팀')}</td>
      <td style="padding:9px 12px;">${orgSel('',ORG_TREE.position,u.position||'','font-size:12.5px;padding:5px 7px;border:1px solid var(--border);border-radius:6px;',`onchange="userSave('${esc(u.username)}','position',this.value)" oncontextmenu="userGridCtx(event,'position',${ri},this.value)"`,'직책')}</td>
      <td style="padding:9px 12px;">${orgSel('',ORG_TREE.duty,u.duty||'','font-size:12.5px;padding:5px 7px;border:1px solid var(--border);border-radius:6px;',`onchange="userSave('${esc(u.username)}','duty',this.value)" oncontextmenu="userGridCtx(event,'duty',${ri},this.value)"`,'보직')}</td>
      <td style="padding:9px 12px;"><input value="${esc(u.name)}" onblur="userSave('${esc(u.username)}','name',this.value)" style="width:110px;font-size:13px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;outline:none;"></td>
      <td style="padding:9px 12px;"><input value="${esc(u.email||'')}" onblur="userSave('${esc(u.username)}','email',this.value)" placeholder="user@example.com" style="width:175px;font-size:12.5px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;outline:none;"></td>
      <td style="padding:9px 12px;"><select onchange="userSave('${esc(u.username)}','role',this.value)" ${u.username==='admin'?'disabled':''} style="font-size:12.5px;padding:5px 8px;border:1px solid ${col};border-radius:6px;color:${col};font-weight:700;outline:none;cursor:pointer;">${_userRoles.map(r=>`<option ${u.role===r?'selected':''}>${r}</option>`).join('')}</select></td>
      ${statusCell}
      <td style="padding:9px 12px;font-size:11px;color:var(--text3);">${esc(u.created_at||'')}</td>
      ${manageCell}</tr>`;
  }).join('');
  body.innerHTML=`<div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;"><i class="ti ti-users" style="font-size:24px;color:var(--blue);"></i><span style="font-size:20px;font-weight:700;">사용자 관리</span><span style="font-size:12px;color:var(--text3);">총 ${_usersList.length}명</span></div>
    <div style="border:1px solid var(--border);border-radius:10px;padding:16px 18px;margin-bottom:20px;background:#f8fafc;">
      <div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:10px;"><i class="ti ti-user-plus" style="color:var(--green);"></i> 사용자 추가</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
        <div><div style="font-size:10.5px;color:var(--text3);margin-bottom:3px;">아이디</div><input id="nu-username" placeholder="user1" style="width:120px;font-size:13px;padding:7px 9px;border:1px solid var(--border);border-radius:6px;outline:none;"></div>
        <div><div style="font-size:10.5px;color:var(--text3);margin-bottom:3px;">회사</div>${orgSel('nu-company',orgCompanyNames(),'','font-size:13px;padding:7px 9px;border:1px solid var(--border);border-radius:6px;',`onchange="orgCascade('nu','company')"`,'회사 선택')}</div>
        <div><div style="font-size:10.5px;color:var(--text3);margin-bottom:3px;">소속담당</div>${orgSel('nu-dept',[],'','font-size:13px;padding:7px 9px;border:1px solid var(--border);border-radius:6px;',`onchange="orgCascade('nu','dept')"`,'소속담당 선택')}</div>
        <div><div style="font-size:10.5px;color:var(--text3);margin-bottom:3px;">소속팀</div>${orgSel('nu-team',[],'','font-size:13px;padding:7px 9px;border:1px solid var(--border);border-radius:6px;','','소속팀 선택')}</div>
        <div><div style="font-size:10.5px;color:var(--text3);margin-bottom:3px;">직책</div>${orgSel('nu-position',ORG_TREE.position,'','font-size:13px;padding:7px 9px;border:1px solid var(--border);border-radius:6px;','','직책 선택')}</div>
        <div><div style="font-size:10.5px;color:var(--text3);margin-bottom:3px;">보직</div>${orgSel('nu-duty',ORG_TREE.duty,'','font-size:13px;padding:7px 9px;border:1px solid var(--border);border-radius:6px;','','보직 선택')}</div>
        <div><div style="font-size:10.5px;color:var(--text3);margin-bottom:3px;">이름</div><input id="nu-name" placeholder="홍길동" style="width:120px;font-size:13px;padding:7px 9px;border:1px solid var(--border);border-radius:6px;outline:none;"></div>
        <div><div style="font-size:10.5px;color:var(--text3);margin-bottom:3px;">이메일 <span style="color:#e53e5a;">*</span></div><input id="nu-email" placeholder="user@example.com" style="width:180px;font-size:13px;padding:7px 9px;border:1px solid var(--border);border-radius:6px;outline:none;"></div>
        <div><div style="font-size:10.5px;color:var(--text3);margin-bottom:3px;">역할</div><select id="nu-role" style="font-size:13px;padding:7px 9px;border:1px solid var(--border);border-radius:6px;outline:none;cursor:pointer;">${_userRoles.map(r=>`<option ${r==='팀원'?'selected':''}>${r}</option>`).join('')}</select></div>
        <div><div style="font-size:10.5px;color:var(--text3);margin-bottom:3px;">비밀번호</div><input id="nu-pw" placeholder="기본 1234" style="width:120px;font-size:13px;padding:7px 9px;border:1px solid var(--border);border-radius:6px;outline:none;"></div>
        <button onclick="userAdd()" style="font-size:13px;font-weight:700;padding:8px 18px;border:none;border-radius:7px;background:#00a872;color:#fff;cursor:pointer;"><i class="ti ti-plus"></i> 추가</button>
      </div>
    </div>
    ${filterBar}
    <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="background:#eef1f5;text-align:left;"><th style="padding:9px 6px;text-align:center;"><input type="checkbox" onclick="usersToggleAll(this.checked)" title="전체 선택"></th><th style="padding:9px 12px;font-size:11px;color:var(--text3);">아이디</th><th style="padding:9px 12px;font-size:11px;color:var(--text3);">회사</th><th style="padding:9px 12px;font-size:11px;color:var(--text3);">소속담당</th><th style="padding:9px 12px;font-size:11px;color:var(--text3);">소속팀</th><th style="padding:9px 12px;font-size:11px;color:var(--text3);">직책</th><th style="padding:9px 12px;font-size:11px;color:var(--text3);">보직</th><th style="padding:9px 12px;font-size:11px;color:var(--text3);">이름</th><th style="padding:9px 12px;font-size:11px;color:var(--text3);">이메일</th><th style="padding:9px 12px;font-size:11px;color:var(--text3);">역할</th><th style="padding:9px 12px;font-size:11px;color:var(--text3);">상태</th><th style="padding:9px 12px;font-size:11px;color:var(--text3);">생성일</th><th style="padding:9px 12px;font-size:11px;color:var(--text3);">관리</th></tr></thead><tbody>${rows}</tbody></table>
    </div>
    <div style="margin-top:14px;font-size:11.5px;color:var(--text3);"><i class="ti ti-info-circle"></i> 역할: <b style="color:#e53e5a;">관리자</b>(전체·사용자관리) · <b style="color:#7c3aed;">담당</b> · <b style="color:#0ea5e9;">팀장</b> · <b style="color:#00a872;">팀원</b></div>
    <div style="margin-top:6px;font-size:11.5px;color:var(--text3);"><i class="ti ti-info-circle"></i> 회사·소속담당·소속팀·직책·보직 셀에서 <b>우클릭</b> → "아래로 채우기 / 전체 채우기"로 엑셀처럼 값을 복사할 수 있습니다.</div>`;
}
function usersToggleAll(on){ document.querySelectorAll('.user-chk:not(:disabled)').forEach(function(c){ c.checked=on; }); }
async function usersDeleteSelected(){
  var names=[].slice.call(document.querySelectorAll('.user-chk:checked')).map(function(c){return c.value;}).filter(function(n){return n&&n!=='admin';});
  if(!names.length){ showToast('삭제할 사용자를 선택하세요 (체크박스)'); return; }
  if(!confirm(names.length+'명의 사용자를 삭제할까요?\n\n'+names.join(', ')+'\n\n되돌릴 수 없습니다.')) return;
  var ok=0, fail=0;
  for(var i=0;i<names.length;i++){ try{ await userApi('DELETE','/api/users/'+encodeURIComponent(names[i])); ok++; }catch(e){ fail++; } }
  showToast('삭제 완료 — '+ok+'명'+(fail?(' / 실패 '+fail):''));
  renderUsers();
}
async function userAdd(){
  const username=(document.getElementById('nu-username')?.value||'').trim();
  const name=(document.getElementById('nu-name')?.value||'').trim();
  const email=(document.getElementById('nu-email')?.value||'').trim();
  const company=(document.getElementById('nu-company')?.value||'').trim();
  const dept=(document.getElementById('nu-dept')?.value||'').trim();
  const team=(document.getElementById('nu-team')?.value||'').trim();
  const position=(document.getElementById('nu-position')?.value||'').trim();
  const duty=(document.getElementById('nu-duty')?.value||'').trim();
  const role=document.getElementById('nu-role')?.value||'팀원';
  const pw=document.getElementById('nu-pw')?.value||'';
  if(!username){ showToast('아이디를 입력하세요'); return; }
  if(!email){ showToast('이메일을 입력하세요 (필수)'); return; }
  try{ await userApi('POST','/api/users',{username,name,email,company,dept,team,position,duty,role,password:pw,active:true}); showToast('사용자 추가됨: '+username); renderUsers(); }
  catch(e){ showToast(e.message); }
}
async function userApprove(username){
  try{ await userApi('PUT','/api/users/'+encodeURIComponent(username),{active:true}); showToast('승인됨: '+username); renderUsers(); }
  catch(e){ showToast(e.message); }
}
async function userSave(username,field,value){
  try{ await userApi('PUT','/api/users/'+encodeURIComponent(username),{[field]:value}); const u=(_usersList||[]).find(x=>x.username===username); if(u)u[field]=value; showToast('저장됨'); if(field==='role'||field==='company'||field==='dept') renderUsers(true); }
  catch(e){ showToast(e.message); }
}
async function userToggleActive(username,cur){
  try{ await userApi('PUT','/api/users/'+encodeURIComponent(username),{active:!cur}); renderUsers(); }
  catch(e){ showToast(e.message); }
}
async function userResetPw(username){
  const pw=prompt('['+username+'] 새 비밀번호를 입력하세요',''); if(pw==null) return;
  if(!pw.trim()){ showToast('비밀번호가 비어있습니다'); return; }
  try{ await userApi('PUT','/api/users/'+encodeURIComponent(username),{password:pw}); showToast('비밀번호 변경됨'); }
  catch(e){ showToast(e.message); }
}
async function userDelete(username,name){
  if(username==='admin'){ showToast('기본 관리자는 삭제할 수 없습니다'); return; }
  if(!confirm('사용자 ['+(name||username)+'] 를 삭제하시겠습니까?')) return;
  try{ await userApi('DELETE','/api/users/'+encodeURIComponent(username)); showToast('삭제됨'); renderUsers(); }
  catch(e){ showToast(e.message); }
}

// ── 사용자 필터(회사▸소속담당▸소속팀 종속) + 복사 ──
function _userOpts(field){
  const set={};
  (_usersList||[]).forEach(u=>{
    if(field!=='company' && _userFilter.company && String(u.company||'')!==_userFilter.company) return;
    if(field==='team' && _userFilter.dept && String(u.dept||'')!==_userFilter.dept) return;
    const v=String(u[field]||'').trim(); if(v) set[v]=1;
  });
  return Object.keys(set).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
}
function _userPass(u){
  if(_userFilter.company && String(u.company||'')!==_userFilter.company) return false;
  if(_userFilter.dept && String(u.dept||'')!==_userFilter.dept) return false;
  if(_userFilter.team && String(u.team||'')!==_userFilter.team) return false;
  if(_userFilter.q){ const q=_userFilter.q.toLowerCase(); const hay=[u.username,u.name,u.email,u.company,u.dept,u.team,u.position,u.duty,u.role].map(x=>String(x==null?'':x)).join(' ').toLowerCase(); if(hay.indexOf(q)<0) return false; }
  return true;
}
async function userFilterSet(field,val){
  _userFilter[field]=val;
  if(field==='company'){ _userFilter.dept=''; _userFilter.team=''; }   // 상위 변경 시 하위 초기화(종속)
  if(field==='dept'){ _userFilter.team=''; }
  await renderUsers(true);
  if(field==='q'){ const el=document.getElementById('user-q'); if(el){ el.focus(); try{ el.setSelectionRange(el.value.length,el.value.length); }catch(_){} } }
}
function userFilterClear(){ _userFilter={company:'',dept:'',team:'',q:''}; renderUsers(true); }
function usersCopy(){
  const st=u=>(u.pending&&u.active===false)?'승인대기':(u.active!==false?'활성':'비활성');
  const cols=[['아이디',u=>u.username],['회사',u=>u.company],['소속담당',u=>u.dept],['소속팀',u=>u.team],['직책',u=>u.position],['보직',u=>u.duty],['이름',u=>u.name],['이메일',u=>u.email],['역할',u=>u.role],['상태',st],['생성일',u=>u.created_at]];
  const rows=(_usersList||[]).filter(_userPass);
  const cell=v=>String(v==null?'':v).replace(/[\t\r\n]/g,' ');
  const tsv=[cols.map(c=>c[0]).join('\t')].concat(rows.map(u=>cols.map(c=>cell(c[1](u))).join('\t'))).join('\n');
  const done=()=>{ if(typeof showToast==='function')showToast('복사됨: '+rows.length+'명 — 엑셀/시트에 붙여넣기'); };
  if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(tsv).then(done,()=>_userCopyFallback(tsv,done)); }
  else _userCopyFallback(tsv,done);
}
function _userCopyFallback(text,done){ const ta=document.createElement('textarea'); ta.value=text; ta.style.cssText='position:fixed;top:-9999px;opacity:0;'; document.body.appendChild(ta); ta.focus(); ta.select(); try{ document.execCommand('copy'); done&&done(); }catch(e){ if(typeof showToast==='function')showToast('복사 실패'); } ta.remove(); }
// 셀 우클릭 → 엑셀형 "아래로 채우기 / 전체 채우기" (회사·소속담당·소속팀·직책·보직)
let _userGridCtx={field:null,rowIdx:0,value:''};
function userGridCtx(e,field,rowIdx,value){
  e.preventDefault();
  _userGridCtx={field:field,rowIdx:rowIdx,value:value};
  let m=document.getElementById('user-grid-ctx');
  if(!m){ m=document.createElement('div'); m.id='user-grid-ctx'; m.style.cssText='position:fixed;z-index:9000;background:#fff;border:1px solid var(--border);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.18);padding:4px;font-size:12.5px;'; document.body.appendChild(m); document.addEventListener('mousedown',function(ev){ if(!m.contains(ev.target)) m.style.display='none'; }); }
  m.innerHTML='<div onclick="userGridFill(true)" style="padding:7px 14px;cursor:pointer;border-radius:5px;white-space:nowrap;color:var(--text);" onmouseenter="this.style.background=\'rgba(45,111,212,0.08)\'" onmouseleave="this.style.background=\'\'"><i class="ti ti-arrow-bar-to-down"></i> 이 값을 아래로 채우기</div>'
    +'<div onclick="userGridFill(false)" style="padding:7px 14px;cursor:pointer;border-radius:5px;white-space:nowrap;color:var(--text);" onmouseenter="this.style.background=\'rgba(45,111,212,0.08)\'" onmouseleave="this.style.background=\'\'"><i class="ti ti-arrows-down"></i> 전체 채우기</div>';
  m.style.display='block'; m.style.left=Math.min(e.clientX,window.innerWidth-220)+'px'; m.style.top=Math.min(e.clientY,window.innerHeight-90)+'px';
}
async function userGridFill(belowOnly){
  const c=_userGridCtx; const m=document.getElementById('user-grid-ctx'); if(m)m.style.display='none';
  const list=(_usersList||[]).filter(_userPass);
  let ok=0;
  for(let i=0;i<list.length;i++){
    if(i===c.rowIdx) continue;                 // 기준 행 제외(이미 값 있음)
    if(belowOnly && i<c.rowIdx) continue;       // 아래로만: 위쪽 행 제외
    const u=list[i];
    try{ await userApi('PUT','/api/users/'+encodeURIComponent(u.username),{[c.field]:c.value}); u[c.field]=c.value; ok++; }catch(e){}
  }
  if(typeof showToast==='function')showToast(ok+'명에 "'+(c.value||'(빈값)')+'" 채움');
  renderUsers(true);
}

// ── 권한 관리 (페이지×역할 RBAC) ──
async function renderPermsAdmin(){
  const body=document.getElementById('sys-perms-body'); if(!body) return;
  if(!isAdmin()){ body.innerHTML='<div style="text-align:center;color:var(--text3);padding:60px;"><i class="ti ti-lock" style="font-size:46px;opacity:0.3;display:block;margin-bottom:14px;"></i><div style="font-size:16px;font-weight:700;">관리자만 접근할 수 있습니다.</div></div>'; return; }
  body.innerHTML='<div style="padding:30px;color:var(--text3);">권한 불러오는 중…</div>';
  try{
  const _pe=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');};
  if(typeof loadPerms==='function'){ await loadPerms(); }
  const roles=((typeof _userRoles!=='undefined'&&_userRoles)?_userRoles:['관리자','담당','팀장','팀원']).filter(function(r){return r!=='관리자';});
  const PAGES=(typeof _RBAC_PAGES!=='undefined'&&_RBAC_PAGES)?_RBAC_PAGES:[];
  const PERMS=(typeof _perms!=='undefined'&&_perms)?_perms:{};
  const lvl=function(role,pg){ const r=PERMS[role]||{}; const v=r[pg]; return (v==='none'||v==='read'||v==='exec')?v:'exec'; };
  const LB={exec:'실행',read:'읽기',none:'접근불가'};
  let rows='';
  PAGES.forEach(function(pg){
    rows+='<tr style="border-bottom:1px solid #eef0f4;"><td style="padding:8px 13px;font-weight:600;">'+_pe(pg.t)+'</td>'
      +'<td style="padding:8px 10px;text-align:center;"><span style="font-size:11px;color:#e53e5a;font-weight:700;">실행(전체)</span></td>';
    roles.forEach(function(role){ const cur=lvl(role,pg.p);
      rows+='<td style="padding:6px 10px;text-align:center;"><select onchange="_permSet(\''+role+'\',\''+pg.p+'\',this.value)" style="font-size:12px;padding:4px 7px;border:1px solid var(--border);border-radius:6px;outline:none;cursor:pointer;background:'+(cur==='none'?'rgba(229,62,90,0.08)':cur==='read'?'rgba(232,130,12,0.08)':'rgba(0,168,114,0.08)')+';">'
        +['exec','read','none'].map(function(v){ return '<option value="'+v+'"'+(cur===v?' selected':'')+'>'+LB[v]+'</option>'; }).join('')+'</select></td>';
    });
    rows+='</tr>';
  });
  body.innerHTML='<div style="padding:18px 24px;">'
    +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;"><i class="ti ti-shield-lock" style="font-size:22px;color:#2d6fd4;"></i><div style="font-size:18px;font-weight:800;">권한 관리</div></div>'
    +'<div style="font-size:12px;color:var(--text3);margin-bottom:16px;line-height:1.6;">페이지별·역할별 권한 — <b style="color:#00a872;">실행</b>(전체) / <b style="color:#e8820c;">읽기</b>(보기 전용, 실행 버튼 비활성) / <b style="color:#e53e5a;">접근불가</b>(메뉴 숨김·차단). 관리자는 항상 전체. 변경 후 <b>저장</b>하세요. (미설정 = 전체 허용)</div>'
    +'<div style="background:#fff;border:1px solid var(--border);border-radius:12px;overflow:auto;"><table style="width:100%;border-collapse:collapse;font-size:12.5px;"><thead><tr style="background:#f4f5f7;font-size:11px;color:var(--text2);"><th style="padding:9px 13px;text-align:left;">페이지</th><th style="padding:9px 10px;">관리자</th>'+roles.map(function(r){return '<th style="padding:9px 10px;">'+_pe(r)+'</th>';}).join('')+'</tr></thead><tbody>'+rows+'</tbody></table></div>'
    +'<div style="margin-top:15px;display:flex;gap:9px;"><button onclick="_permSave()" style="font-size:13px;font-weight:700;padding:9px 18px;border-radius:8px;border:none;background:#2d6fd4;color:#fff;cursor:pointer;"><i class="ti ti-device-floppy"></i> 저장</button><button onclick="_permReset()" style="font-size:13px;font-weight:600;padding:9px 16px;border-radius:8px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;">전체 초기화(전체 허용)</button></div>'
    +'</div>';
  }catch(_e){ body.innerHTML='<div style="padding:28px;color:#e53e5a;font-size:13px;">권한 관리 렌더 오류: '+(_e&&_e.message||_e)+'</div>'; }
}
function _permSet(role,pg,val){ _perms[role]=_perms[role]||{}; _perms[role][pg]=val; }
async function _permSave(){ try{ await fetch('/api/permissions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({perms:_perms})}); window._permsLoaded=true; if(typeof applyPagePerms==='function') applyPagePerms(); try{showToast('✅ 권한 저장됨 — 각 사용자 새로고침 시 적용');}catch(e){} renderPermsAdmin(); }catch(e){ try{showToast('저장 실패: '+e.message);}catch(_){} } }
function _permReset(){ if(!confirm('모든 역할·페이지 권한을 초기화(전체 허용)할까요?'))return; _perms={}; _permSave(); }
// ══ 조직 설정: 회사 ▸ 소속담당 ▸ 소속팀 (계층) + 직책·보직(평면) ══
let _orgEdit=null, _orgOpen={};
async function renderOrgConfig(){
  const body=document.getElementById('org-config-body'); if(!body) return;
  if(!isAdmin()){ body.innerHTML='<div style="text-align:center;color:var(--text3);padding:60px;"><i class="ti ti-lock" style="font-size:46px;opacity:0.3;display:block;margin-bottom:14px;"></i><div style="font-size:16px;font-weight:700;">관리자만 접근할 수 있습니다.</div></div>'; return; }
  body.innerHTML='<div style="color:var(--text3);padding:20px;">불러오는 중…</div>';
  try{ await loadOrgOptions(); }catch(e){}
  _orgEdit={ companies:JSON.parse(JSON.stringify(ORG_TREE.companies||[])), position:(ORG_TREE.position||[]).slice(), duty:(ORG_TREE.duty||[]).slice() };
  if(!Object.keys(_orgOpen).length && _orgEdit.companies[0]) _orgOpen['c0']=true;
  _orgRender();
}
function _orgFocusId(id){ setTimeout(function(){ const x=document.getElementById(id); if(x)x.focus(); },0); }
function _orgRender(){
  const body=document.getElementById('org-config-body'); if(!body||!_orgEdit) return;
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const del=fn=>'<i class="ti ti-x" onclick="'+fn+'" title="삭제" style="cursor:pointer;color:#b6c0cf;font-size:15px;flex-shrink:0;" onmouseenter="this.style.color=\'#e53e5a\'" onmouseleave="this.style.color=\'#b6c0cf\'"></i>';
  const cpy=fn=>'<i class="ti ti-copy" onclick="'+fn+'" title="아래로 복제 (하위 구조 통째로 복사)" style="cursor:pointer;color:#9aa6b6;font-size:14px;flex-shrink:0;" onmouseenter="this.style.color=\'#2d6fd4\'" onmouseleave="this.style.color=\'#9aa6b6\'"></i>';
  const addIn=(id,fn,ph,color)=>'<div style="display:flex;gap:6px;align-items:center;margin:5px 0 9px;"><input id="'+id+'" onkeydown="if(event.key===\'Enter\')'+fn+'" placeholder="'+ph+'" style="flex:1;max-width:260px;font-size:12.5px;padding:6px 9px;border:1px solid var(--border);border-radius:6px;outline:none;"><button onclick="'+fn+'" style="font-size:12px;font-weight:700;padding:6px 11px;border:1px solid '+color+';border-radius:6px;background:#fff;color:'+color+';cursor:pointer;"><i class="ti ti-plus"></i></button></div>';
  const tog=(key,open)=>'<i class="ti ti-chevron-'+(open?'down':'right')+'" onclick="orgToggle(\''+key+'\')" style="font-size:14px;color:var(--text3);cursor:pointer;flex-shrink:0;"></i>';
  let tree='';
  (_orgEdit.companies||[]).forEach((c,ci)=>{
    const cOpen=!!_orgOpen['c'+ci];
    tree+='<div style="margin-bottom:3px;"><div style="display:flex;align-items:center;gap:7px;padding:6px 9px;border-radius:7px;background:#eef3fb;">'
      +tog('c'+ci,cOpen)+'<i class="ti ti-building" style="color:#2d6fd4;font-size:16px;flex-shrink:0;"></i><b style="font-size:13.5px;color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(c.name)+'</b>'
      +'<span style="font-size:10px;color:var(--text3);">담당 '+(c.depts||[]).length+'</span>'+cpy('orgDupCompany('+ci+')')+del('orgDelCompany('+ci+')')+'</div>';
    if(cOpen){
      tree+='<div style="padding-left:14px;border-left:2px solid #e3ebf5;margin-left:13px;">';
      (c.depts||[]).forEach((d,di)=>{
        const dOpen=!!_orgOpen['c'+ci+'d'+di];
        tree+='<div style="margin-top:5px;"><div style="display:flex;align-items:center;gap:7px;padding:5px 9px;border-radius:7px;background:#f6f1fc;">'
          +tog('c'+ci+'d'+di,dOpen)+'<i class="ti ti-user-cog" style="color:#7c3aed;font-size:15px;flex-shrink:0;"></i><span style="font-size:13px;font-weight:600;color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(d.name)+'</span>'
          +'<span style="font-size:10px;color:var(--text3);">팀 '+(d.teams||[]).length+'</span>'+cpy('orgDupDept('+ci+','+di+')')+del('orgDelDept('+ci+','+di+')')+'</div>';
        if(dOpen){
          tree+='<div style="padding-left:14px;border-left:2px solid #efe7fa;margin-left:13px;padding-top:5px;">'
            +'<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:3px;">'+((d.teams||[]).map((t,ti)=>'<span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;padding:4px 7px 4px 10px;border-radius:14px;background:#eafaf3;color:#0a6b48;border:1px solid #b8e6d2;"><i class="ti ti-users" style="font-size:12px;"></i>'+esc(t)+del('orgDelTeam('+ci+','+di+','+ti+')')+'</span>').join('')||'<span style="font-size:11.5px;color:var(--text3);">팀 없음</span>')+'</div>'
            +addIn('org-addteam-'+ci+'-'+di,'orgAddTeam('+ci+','+di+')','소속팀 추가','#00a872')
          +'</div>';
        }
        tree+='</div>';
      });
      tree+=addIn('org-adddept-'+ci,'orgAddDept('+ci+')','소속담당 추가','#7c3aed');
      tree+='</div>';
    }
    tree+='</div>';
  });
  if(!(_orgEdit.companies||[]).length) tree='<div style="font-size:12.5px;color:var(--text3);padding:10px;">회사가 없습니다. 아래에서 추가하세요.</div>';
  const flatCard=(kind,label,icon,color)=>{ const items=_orgEdit[kind]||[]; return '<div style="border:1px solid var(--border);border-radius:12px;padding:16px 18px;background:#fff;">'
    +'<div style="font-size:13px;font-weight:800;color:'+color+';margin-bottom:11px;"><i class="ti '+icon+'"></i> '+label+'</div>'
    +'<div style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:8px;">'+(items.map((v,i)=>'<span style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;padding:5px 7px 5px 11px;border-radius:16px;background:#f0f3f8;color:var(--text);border:1px solid var(--border);">'+esc(v)+del('orgRemoveFlat(\''+kind+'\','+i+')')+'</span>').join('')||'<span style="font-size:12px;color:var(--text3);">항목 없음</span>')+'</div>'
    +addIn('org-add-'+kind,'orgAddFlat(\''+kind+'\')',label+' 추가',color)+'</div>'; };
  body.innerHTML='<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;"><i class="ti ti-sitemap" style="font-size:24px;color:var(--blue);"></i><span style="font-size:20px;font-weight:700;">조직 설정</span></div>'
    +'<div style="font-size:12px;color:var(--text3);margin-bottom:16px;">회사 ▸ 소속담당 ▸ 소속팀 <b>트리</b>입니다. ▸를 눌러 펼치고, 각 단계 입력칸으로 하위 추가, ✕로 삭제하세요. 변경 후 <b>저장</b>.</div>'
    +'<div style="max-width:680px;border:1px solid var(--border);border-radius:12px;padding:14px 16px;background:#fff;margin-bottom:8px;">'+tree+'</div>'
    +'<div style="max-width:680px;">'+addIn('org-add-company','orgAddCompany()','회사 추가','#2d6fd4')+'</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;max-width:680px;margin-top:14px;">'+flatCard('position','직책 (공통)','ti-badge','#e8820c')+flatCard('duty','보직 (공통)','ti-shield-star','#0ea5e9')+'</div>'
    +'<div style="margin-top:18px;max-width:680px;display:flex;justify-content:flex-end;gap:8px;"><button onclick="renderOrgConfig()" style="font-size:13px;font-weight:700;padding:9px 16px;border:1px solid var(--border);border-radius:8px;background:#fff;color:var(--text2);cursor:pointer;">되돌리기</button><button onclick="orgSave()" style="font-size:13px;font-weight:800;padding:9px 22px;border:none;border-radius:8px;background:#00a872;color:#fff;cursor:pointer;"><i class="ti ti-device-floppy"></i> 저장</button></div>';
}
function orgToggle(key){ _orgOpen[key]=!_orgOpen[key]; _orgRender(); }
function orgAddCompany(){ const inp=document.getElementById('org-add-company'); if(!inp)return; const v=(inp.value||'').trim(); if(!v)return; if((_orgEdit.companies||[]).some(c=>c.name===v)){ showToast('이미 있는 회사'); return; } _orgEdit.companies.push({name:v,depts:[]}); _orgOpen['c'+(_orgEdit.companies.length-1)]=true; _orgRender(); _orgFocusId('org-add-company'); }
function orgAddDept(ci){ const c=_orgEdit.companies[ci]; if(!c)return; const inp=document.getElementById('org-adddept-'+ci); if(!inp)return; const v=(inp.value||'').trim(); if(!v)return; if((c.depts||[]).some(d=>d.name===v)){ showToast('이미 있는 담당'); return; } c.depts.push({name:v,teams:[]}); _orgOpen['c'+ci+'d'+(c.depts.length-1)]=true; _orgRender(); _orgFocusId('org-adddept-'+ci); }
function orgAddTeam(ci,di){ const d=((_orgEdit.companies[ci]||{}).depts||[])[di]; if(!d)return; const inp=document.getElementById('org-addteam-'+ci+'-'+di); if(!inp)return; const v=(inp.value||'').trim(); if(!v)return; if((d.teams||[]).indexOf(v)>=0){ showToast('이미 있는 팀'); return; } d.teams.push(v); _orgRender(); _orgFocusId('org-addteam-'+ci+'-'+di); }
function _orgUniq(names,base){ let n=base,i=2; while(names.indexOf(n)>=0){ n=base+' ('+i+')'; i++; } return n; }
function orgDupCompany(ci){ const c=_orgEdit.companies[ci]; if(!c)return; const copy=JSON.parse(JSON.stringify(c)); copy.name=_orgUniq(_orgEdit.companies.map(x=>x.name),(c.name||'회사')+' 사본'); _orgEdit.companies.splice(ci+1,0,copy); _orgOpen['c'+(ci+1)]=true; _orgRender(); showToast('회사 복제됨: '+copy.name); }
function orgDupDept(ci,di){ const c=_orgEdit.companies[ci]; if(!c)return; const d=c.depts[di]; if(!d)return; const copy=JSON.parse(JSON.stringify(d)); copy.name=_orgUniq(c.depts.map(x=>x.name),(d.name||'담당')+' 사본'); c.depts.splice(di+1,0,copy); _orgRender(); showToast('담당 복제됨: '+copy.name); }
function orgDelCompany(ci){ _orgEdit.companies.splice(ci,1); _orgRender(); }
function orgDelDept(ci,di){ const c=_orgEdit.companies[ci]; if(c)c.depts.splice(di,1); _orgRender(); }
function orgDelTeam(ci,di,ti){ const d=((_orgEdit.companies[ci]||{}).depts||[])[di]; if(d)d.teams.splice(ti,1); _orgRender(); }
function orgAddFlat(kind){ const inp=document.getElementById('org-add-'+kind); if(!inp)return; const v=(inp.value||'').trim(); if(!v)return; if((_orgEdit[kind]||[]).indexOf(v)>=0){ showToast('이미 있는 항목'); return; } (_orgEdit[kind]=_orgEdit[kind]||[]).push(v); _orgRender(); _orgFocusId('org-add-'+kind); }
function orgRemoveFlat(kind,i){ if(!_orgEdit||!_orgEdit[kind])return; _orgEdit[kind].splice(i,1); _orgRender(); }
async function orgSave(){ if(!_orgEdit)return; try{ const d=await userApi('POST','/api/org-options',{companies:_orgEdit.companies,position:_orgEdit.position,duty:_orgEdit.duty}); ORG_TREE.companies=Array.isArray(d.companies)?d.companies:ORG_TREE.companies; ORG_TREE.position=Array.isArray(d.position)?d.position:ORG_TREE.position; ORG_TREE.duty=Array.isArray(d.duty)?d.duty:ORG_TREE.duty; if(typeof showToast==='function')showToast('조직 설정 저장됨'); }catch(e){ if(typeof showToast==='function')showToast(e.message); } }

// ══ 메일(SMTP) 설정 ══
let _mailCfg=null; let _mailDefaults={subject:'',html:''}; let _mailCycleDefaults={subject:'',html:''}; let _shareCfg=null;
async function renderMailConfig(){
  const body=document.getElementById('mail-config-body'); if(!body) return;
  if(!isAdmin()){ body.innerHTML='<div style="text-align:center;color:var(--text3);padding:60px;"><i class="ti ti-lock" style="font-size:46px;opacity:0.3;display:block;margin-bottom:14px;"></i><div style="font-size:16px;font-weight:700;">관리자만 접근할 수 있습니다.</div></div>'; return; }
  body.innerHTML='<div style="color:var(--text3);padding:20px;">불러오는 중…</div>';
  try{ const d=await userApi('GET','/api/mail/config'); _mailCfg=d.config||{}; _mailDefaults={subject:d.default_approval_subject||'',html:d.default_approval_html||''}; _mailCycleDefaults={subject:d.default_cycle_subject||'',html:d.default_cycle_html||''}; }
  catch(e){ body.innerHTML='<div style="color:var(--red);padding:20px;">'+e.message+'</div>'; return; }
  try{ _shareCfg=await userApi('GET','/api/share-config'); }catch(e){ _shareCfg=null; }
  const c=_mailCfg; const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;');
  const fld='width:100%;font-size:13px;padding:9px 11px;border:1.5px solid var(--border);border-radius:8px;outline:none;box-sizing:border-box;background:#fff;';
  const lbl='font-size:11.5px;font-weight:700;color:var(--text2);display:block;margin-bottom:5px;';
  const secLabels={starttls:'STARTTLS (보통 587)',ssl:'SSL/TLS (보통 465)',none:'없음 (25)'};
  const secOpt=['starttls','ssl','none'].map(o=>'<option value="'+o+'"'+(String(c.security||'starttls')===o?' selected':'')+'>'+secLabels[o]+'</option>').join('');
  const escTa=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const tplSubject=(c.approval_subject!=null&&c.approval_subject!=='')?c.approval_subject:(_mailDefaults.subject||'');
  const tplHtml=(c.approval_html!=null&&c.approval_html!=='')?c.approval_html:(_mailDefaults.html||'');
  const phs=[['{{name}}','이름'],['{{username}}','아이디'],['{{email}}','메일'],['{{dept}}','소속담당'],['{{team}}','소속팀'],['{{position}}','직책'],['{{duty}}','보직'],['{{app_url}}','로그인 URL'],['{{login_button}}','로그인 버튼(자동)']];
  const phLegend=phs.map(p=>'<code onclick="mailTplInsert(\''+p[0]+'\')" title="클릭 → 커서 위치에 삽입" style="cursor:pointer;font-size:11.5px;background:#eef3fb;color:#2d6fd4;border:1px solid #cfe0f5;border-radius:6px;padding:2px 7px;">'+p[0]+'</code><span style="font-size:10.5px;color:var(--text3);margin:0 12px 0 3px;">'+p[1]+'</span>').join('');
  // 사이클 배정 폼 값·플레이스홀더
  const cySubject=(c.cycle_subject!=null&&c.cycle_subject!=='')?c.cycle_subject:((typeof _mailCycleDefaults!=='undefined'&&_mailCycleDefaults.subject)||'');
  const cyHtml=(c.cycle_html!=null&&c.cycle_html!=='')?c.cycle_html:((typeof _mailCycleDefaults!=='undefined'&&_mailCycleDefaults.html)||'');
  const cyPhs=[['{{assignee}}','담당자'],['{{model}}','모델'],['{{vgroup}}','버전그룹'],['{{version}}','버전'],['{{period}}','시험기간'],['{{count}}','항목수'],['{{items}}','시험항목 표(자동)'],['{{app_url}}','앱 URL'],['{{login_button}}','바로가기 버튼(자동)']];
  const cyPhLegend=cyPhs.map(p=>'<code onclick="mailCyclePhIns(\''+p[0]+'\')" title="클릭 → 본문 끝에 삽입" style="cursor:pointer;font-size:11.5px;background:#eef3fb;color:#2d6fd4;border:1px solid #cfe0f5;border-radius:6px;padding:2px 7px;">'+p[0]+'</code><span style="font-size:10.5px;color:var(--text3);margin:0 10px 0 3px;">'+p[1]+'</span>').join('');
  const _wbtn=(cmd,ic,t,edId)=>'<button onmousedown="event.preventDefault()" onclick="mailWys(\''+cmd+'\',undefined,'+(edId?('\''+edId+'\''):'undefined')+')" title="'+t+'" style="border:none;background:none;cursor:pointer;padding:4px 7px;border-radius:5px;color:var(--text2);font-size:14px;"><i class="ti '+ic+'"></i></button>';
  // 사이클 배정 폼 위지윅 툴바 (가입 메일 폼과 동일 구성, 대상 에디터: ml-cycle-html)
  const _cybar=function(edId){
    return '<div style="display:flex;flex-wrap:wrap;gap:2px;align-items:center;border:1.5px solid var(--border);border-bottom:none;border-radius:8px 8px 0 0;padding:6px 8px;background:#f7f9fc;">'
      +_wbtn('bold','ti-bold','굵게',edId)+_wbtn('italic','ti-italic','기울임',edId)+_wbtn('underline','ti-underline','밑줄',edId)
      +'<span style="width:1px;height:18px;background:var(--border);margin:0 4px;"></span>'
      +'<select onchange="mailWys(\'fontSize\',this.value,\''+edId+'\');this.selectedIndex=0" title="글자 크기" style="font-size:12px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;cursor:pointer;background:#fff;"><option value="">크기</option><option value="2">작게</option><option value="3">보통</option><option value="5">크게</option><option value="6">아주 크게</option></select>'
      +'<label title="글자색" style="display:inline-flex;align-items:center;gap:2px;cursor:pointer;padding:3px 5px;"><i class="ti ti-letter-a" style="font-size:14px;color:var(--text2);"></i><input type="color" onchange="mailWys(\'foreColor\',this.value,\''+edId+'\')" style="width:22px;height:20px;border:none;background:none;cursor:pointer;padding:0;"></label>'
      +'<label title="형광펜(배경색)" style="display:inline-flex;align-items:center;gap:2px;cursor:pointer;padding:3px 5px;"><i class="ti ti-highlight" style="font-size:14px;color:var(--text2);"></i><input type="color" value="#fff3a3" onchange="mailWys(\'hiliteColor\',this.value,\''+edId+'\')" style="width:22px;height:20px;border:none;background:none;cursor:pointer;padding:0;"></label>'
      +'<span style="width:1px;height:18px;background:var(--border);margin:0 4px;"></span>'
      +_wbtn('justifyLeft','ti-align-left','왼쪽 정렬',edId)+_wbtn('justifyCenter','ti-align-center','가운데 정렬',edId)+_wbtn('justifyRight','ti-align-right','오른쪽 정렬',edId)
      +'<span style="width:1px;height:18px;background:var(--border);margin:0 4px;"></span>'
      +'<button onmousedown="event.preventDefault()" onclick="mailWysLink(\''+edId+'\')" title="링크" style="border:none;background:none;cursor:pointer;padding:4px 6px;border-radius:5px;color:var(--text2);font-size:14px;"><i class="ti ti-link"></i></button>'
      +'<button onmousedown="event.preventDefault()" onclick="mailWys(\'removeFormat\',undefined,\''+edId+'\')" title="서식 지우기" style="border:none;background:none;cursor:pointer;padding:4px 6px;border-radius:5px;color:var(--text2);font-size:14px;"><i class="ti ti-clear-formatting"></i></button>'
    +'</div>';
  };
  body.innerHTML='<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;"><i class="ti ti-mail-cog" style="font-size:24px;color:var(--blue);"></i><span style="font-size:20px;font-weight:700;">메일 설정</span></div>'
    +'<div style="font-size:12px;color:var(--text3);margin-bottom:14px;">@멘션 알림·가입 승인 등 시스템 메일 발송에 사용됩니다. (관리자 전용)</div>'
    +'<div style="display:flex;gap:4px;border-bottom:1px solid var(--border);margin-bottom:18px;">'
      +'<button id="mltab-btn-config" onclick="mailTab(\'config\')" style="font-size:13.5px;font-weight:700;padding:9px 18px;border:none;background:none;cursor:pointer;border-bottom:2.5px solid #2d6fd4;color:#2d6fd4;"><i class="ti ti-server-cog"></i> 메일 설정</button>'
      +'<button id="mltab-btn-form" onclick="mailTab(\'form\')" style="font-size:13.5px;font-weight:700;padding:9px 18px;border:none;background:none;cursor:pointer;border-bottom:2.5px solid transparent;color:var(--text3);"><i class="ti ti-template"></i> 가입 메일 폼</button>'
      +'<button id="mltab-btn-sharereq" onclick="mailTab(\'sharereq\')" style="font-size:13.5px;font-weight:700;padding:9px 18px;border:none;background:none;cursor:pointer;border-bottom:2.5px solid transparent;color:var(--text3);"><i class="ti ti-file-text"></i> REQ 공유 폼</button>'
      +'<button id="mltab-btn-sharetc" onclick="mailTab(\'sharetc\')" style="font-size:13.5px;font-weight:700;padding:9px 18px;border:none;background:none;cursor:pointer;border-bottom:2.5px solid transparent;color:var(--text3);"><i class="ti ti-clipboard-check"></i> TC 공유 폼</button>'
      +'<button id="mltab-btn-cycle" onclick="mailTab(\'cycle\')" style="font-size:13.5px;font-weight:700;padding:9px 18px;border:none;background:none;cursor:pointer;border-bottom:2.5px solid transparent;color:var(--text3);"><i class="ti ti-clipboard-list"></i> 사이클 배정 폼</button>'
    +'</div>'
    +'<div id="mltab-config">'
    +'<div style="border:1px solid var(--border);border-radius:12px;padding:20px 22px;background:var(--bg2);display:flex;flex-direction:column;gap:14px;">'
      +'<label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;cursor:pointer;"><input type="checkbox" id="ml-enabled" '+(c.enabled?'checked':'')+' style="width:16px;height:16px;cursor:pointer;"> 메일 발송 사용</label>'
      +'<div style="display:flex;gap:12px;flex-wrap:wrap;"><div style="flex:2;min-width:180px;"><label style="'+lbl+'">SMTP 서버</label><input id="ml-host" value="'+esc(c.host)+'" placeholder="예: smtp.gmail.com" style="'+fld+'"></div>'
        +'<div style="flex:1;min-width:80px;"><label style="'+lbl+'">포트</label><input id="ml-port" type="number" value="'+esc(c.port)+'" placeholder="587" style="'+fld+'"></div>'
        +'<div style="flex:1.4;min-width:140px;"><label style="'+lbl+'">보안</label><select id="ml-sec" style="'+fld+'cursor:pointer;">'+secOpt+'</select></div></div>'
      +'<div style="display:flex;gap:12px;flex-wrap:wrap;"><div style="flex:1;min-width:160px;"><label style="'+lbl+'">계정(아이디)</label><input id="ml-user" value="'+esc(c.username)+'" placeholder="이메일 또는 사용자명" style="'+fld+'"></div>'
        +'<div style="flex:1;min-width:160px;"><label style="'+lbl+'">비밀번호 / 앱 비밀번호</label><input id="ml-pw" value="'+esc(c.password)+'" placeholder="SMTP 비밀번호" style="'+fld+'"></div></div>'
      +'<div style="display:flex;gap:12px;flex-wrap:wrap;"><div style="flex:1;min-width:160px;"><label style="'+lbl+'">발신 주소(From)</label><input id="ml-from" value="'+esc(c.from_addr)+'" placeholder="비우면 계정 주소 사용" style="'+fld+'"></div>'
        +'<div style="flex:1;min-width:160px;"><label style="'+lbl+'">발신자 이름</label><input id="ml-fromname" value="'+esc(c.from_name)+'" placeholder="ubiQuoss-TOP" style="'+fld+'"></div></div>'
      +'<div><label style="'+lbl+'">로그인(앱) 주소 <span style="font-weight:400;color:var(--text3);">— 가입 승인 메일의 「로그인 하러 가기」 버튼 링크</span></label><input id="ml-appurl" value="'+esc(c.app_url)+'" placeholder="예: http://220.1.1.241:8000 (비우면 버튼 대신 안내문)" style="'+fld+'"></div>'
      +'<div style="display:flex;justify-content:flex-end;margin-top:4px;"><button onclick="mailCfgSave()" style="font-size:13px;font-weight:700;padding:9px 22px;border:none;border-radius:8px;background:#2d6fd4;color:#fff;cursor:pointer;"><i class="ti ti-device-floppy"></i> 저장</button></div>'
    +'</div>'
    +'<div style="border:1px dashed var(--border);border-radius:12px;padding:18px 22px;margin-top:16px;background:var(--bg3);">'
      +'<div style="font-size:13px;font-weight:700;color:var(--text2);margin-bottom:10px;"><i class="ti ti-send" style="color:var(--green);"></i> 테스트 발송</div>'
      +'<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;"><input id="ml-test-to" placeholder="받는 사람 이메일" style="'+fld+'flex:1;min-width:180px;"><button onclick="mailCfgTest()" style="font-size:13px;font-weight:700;padding:9px 18px;border:none;border-radius:8px;background:#00a872;color:#fff;cursor:pointer;white-space:nowrap;">테스트 메일 보내기</button></div>'
      +'<div style="font-size:11px;color:var(--text3);margin-top:8px;"><i class="ti ti-info-circle"></i> 먼저 위 설정을 <b>저장</b>한 뒤 테스트하세요. Gmail은 2단계인증 후 <b>앱 비밀번호</b>가 필요합니다.</div>'
    +'</div>'
    +'</div>'  /* #mltab-config 닫기 */
    +'<div id="mltab-form" style="display:none;">'
      +'<div style="border:1px solid var(--border);border-radius:12px;padding:20px 22px;background:var(--bg2);">'
        +'<div style="font-size:12px;color:var(--text3);margin-bottom:14px;">가입 <b>승인</b> 시 신청자에게 보내는 축하 메일을 <b>보이는 대로</b> 편집합니다. (HTML 몰라도 OK)</div>'
        +'<label style="'+lbl+'">메일 제목</label><input id="ml-appr-subject" value="'+esc(tplSubject)+'" style="'+fld+'margin-bottom:14px;">'
        +'<label style="'+lbl+'">삽입 항목 <span style="font-weight:400;color:var(--text3);">(클릭 → 본문 커서 위치에 삽입)</span></label>'
        +'<div style="margin-bottom:12px;line-height:2.2;">'+phLegend+'</div>'
        +'<label style="'+lbl+'">메일 본문</label>'
        +'<div style="display:flex;flex-wrap:wrap;gap:2px;align-items:center;border:1.5px solid var(--border);border-bottom:none;border-radius:8px 8px 0 0;padding:6px 8px;background:#f7f9fc;">'
          +_wbtn('bold','ti-bold','굵게')+_wbtn('italic','ti-italic','기울임')+_wbtn('underline','ti-underline','밑줄')
          +'<span style="width:1px;height:18px;background:var(--border);margin:0 4px;"></span>'
          +'<select onchange="mailWys(\'fontSize\',this.value);this.selectedIndex=0" title="글자 크기" style="font-size:12px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;cursor:pointer;background:#fff;"><option value="">크기</option><option value="2">작게</option><option value="3">보통</option><option value="5">크게</option><option value="6">아주 크게</option></select>'
          +'<label title="글자색" style="display:inline-flex;align-items:center;gap:2px;cursor:pointer;padding:3px 5px;"><i class="ti ti-letter-a" style="font-size:14px;color:var(--text2);"></i><input type="color" onchange="mailWys(\'foreColor\',this.value)" style="width:22px;height:20px;border:none;background:none;cursor:pointer;padding:0;"></label>'
          +'<label title="형광펜(배경색)" style="display:inline-flex;align-items:center;gap:2px;cursor:pointer;padding:3px 5px;"><i class="ti ti-highlight" style="font-size:14px;color:var(--text2);"></i><input type="color" value="#fff3a3" onchange="mailWys(\'hiliteColor\',this.value)" style="width:22px;height:20px;border:none;background:none;cursor:pointer;padding:0;"></label>'
          +'<span style="width:1px;height:18px;background:var(--border);margin:0 4px;"></span>'
          +_wbtn('justifyLeft','ti-align-left','왼쪽 정렬')+_wbtn('justifyCenter','ti-align-center','가운데 정렬')+_wbtn('justifyRight','ti-align-right','오른쪽 정렬')
          +'<span style="width:1px;height:18px;background:var(--border);margin:0 4px;"></span>'
          +'<button onmousedown="event.preventDefault()" onclick="mailWysLink()" title="링크" style="border:none;background:none;cursor:pointer;padding:4px 6px;border-radius:5px;color:var(--text2);font-size:14px;"><i class="ti ti-link"></i></button>'
          +'<button onmousedown="event.preventDefault()" onclick="mailWysInsert(\'\\uD83C\\uDF89\')" title="축하 이모지" style="border:none;background:none;cursor:pointer;padding:4px 6px;font-size:15px;">🎉</button>'
          +'<button onmousedown="event.preventDefault()" onclick="mailWysInsert(\'\\u2705\')" title="체크 이모지" style="border:none;background:none;cursor:pointer;padding:4px 6px;font-size:15px;">✅</button>'
          +'<button onmousedown="event.preventDefault()" onclick="mailWys(\'removeFormat\')" title="서식 지우기" style="border:none;background:none;cursor:pointer;padding:4px 6px;border-radius:5px;color:var(--text2);font-size:14px;"><i class="ti ti-clear-formatting"></i></button>'
        +'</div>'
        +'<div id="ml-appr-wys" contenteditable="true" style="border:1.5px solid var(--border);border-radius:0 0 8px 8px;min-height:330px;max-height:560px;overflow:auto;padding:14px;background:#eef1f6;outline:none;font-size:14px;color:#1c2942;">'+tplHtml+'</div>'
        +'<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap;">'
          +'<button onclick="mailTplReset()" style="font-size:13px;font-weight:700;padding:9px 16px;border:1px solid var(--border);border-radius:8px;background:#fff;color:var(--text2);cursor:pointer;"><i class="ti ti-rotate"></i> 기본 디자인 복원</button>'
          +'<button onclick="mailTplPreview()" style="font-size:13px;font-weight:700;padding:9px 16px;border:1px solid #2d6fd4;border-radius:8px;background:#fff;color:#2d6fd4;cursor:pointer;"><i class="ti ti-eye"></i> 미리보기</button>'
          +'<button onclick="mailCfgSave()" style="font-size:13px;font-weight:700;padding:9px 22px;border:none;border-radius:8px;background:#2d6fd4;color:#fff;cursor:pointer;"><i class="ti ti-device-floppy"></i> 저장</button>'
        +'</div>'
        +'<div style="font-size:11px;color:var(--text3);margin-top:8px;"><i class="ti ti-info-circle"></i> 미리보기는 샘플 데이터(홍길동·hong@…)로 렌더됩니다. 「로그인 하러 가기」 버튼은 <b>메일 설정 탭 → 로그인(앱) 주소</b>를 사용합니다.</div>'
      +'</div>'
    +'</div>'  /* #mltab-form 닫기 */
    +(function(){
        var R=(_shareCfg&&_shareCfg.req)||{}; var T=(_shareCfg&&_shareCfg.tc)||{};
        var rs=R.sections||{info:true,desc:true,impl:true,scenario:false,tc:true};
        var ts=T.sections||{info:true,purpose:true,topo:true,traffic:true,steps:true,issue:true,history:true,cycle:true};
        var row=function(pfx,obj,k,label,d){ var id=pfx+'-'+k; return '<div style="display:flex;align-items:flex-start;gap:9px;padding:10px 12px;border:1px solid var(--border);border-radius:9px;background:#fff;"><input type="checkbox" id="'+id+'" '+(obj[k]?'checked':'')+' style="width:16px;height:16px;margin-top:1px;cursor:pointer;flex-shrink:0;"><label for="'+id+'" style="cursor:pointer;flex:1;"><b style="font-size:12.5px;">'+label+'</b><br><span style="font-size:11px;color:var(--text3);">'+d+'</span></label></div>'; };
        var box=function(idp,fnp,kn,color,subj,intro,outro,secRows){
          return '<div style="border:1px solid var(--border);border-radius:12px;padding:20px 22px;background:var(--bg2);">'
            +'<div style="font-size:12px;color:var(--text3);margin-bottom:14px;"><b style="color:'+color+';">'+kn+'</b> 메일 공유 양식 — 제목·포함 섹션·머리말/맺음말. (실제 공유는 '+kn+' 상세의 <b>📧 공유</b> 버튼)</div>'
            +'<label style="'+lbl+'">메일 제목 <span style="font-weight:400;color:var(--text3);">— {id} {title} {status} 치환</span></label>'
            +'<input id="'+idp+'-subject" value="'+esc(subj)+'" style="'+fld+'margin-bottom:16px;">'
            +'<label style="'+lbl+'">포함 섹션</label>'
            +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">'+secRows+'</div>'
            +'<label style="'+lbl+'">머리말 (선택)</label>'+_shWysEditor(idp+'-intro','메일 상단 안내문',intro)
            +'<label style="'+lbl+'">맺음말 (선택)</label>'+_shWysEditor(idp+'-outro','메일 하단 문구',outro)
            +'<div style="display:flex;gap:8px;justify-content:flex-end;">'
              +'<button onclick="'+fnp+'Preview()" style="font-size:13px;font-weight:700;padding:9px 16px;border:1px solid '+color+';border-radius:8px;background:#fff;color:'+color+';cursor:pointer;"><i class="ti ti-eye"></i> 미리보기</button>'
              +'<button onclick="'+fnp+'Save()" style="font-size:13px;font-weight:700;padding:9px 22px;border:none;border-radius:8px;background:'+color+';color:#fff;cursor:pointer;"><i class="ti ti-device-floppy"></i> 저장</button>'
            +'</div>'
          +'</div>';
        };
        var reqRows=row('sreq',rs,'info','정보','ID·제목·상태·작성자·날짜')+row('sreq',rs,'desc','설명','개요 / 동작 설명')+row('sreq',rs,'impl','구현 내용','구현 상세 · CLI')+row('sreq',rs,'scenario','시나리오','동작 시나리오 목록')+row('sreq',rs,'tc','연결 TC','연결된 시험 케이스 목록');
        var tcRows=row('stc',ts,'info','정보','ID·제목·상태·작성자·날짜')+row('stc',ts,'purpose','목적/사전조건','시험 목적 · 사전조건')+row('stc',ts,'topo','구성도','시험 구성도 · 장비표')+row('stc',ts,'traffic','트래픽','Traffic Generator')+row('stc',ts,'steps','스텝','Test Step · Test Data · Expected Result')+row('stc',ts,'issue','이슈','연결된 이슈')+row('stc',ts,'history','이력','시험 실행 이력')+row('stc',ts,'cycle','사이클','포함된 사이클 · 결과');
        return '<style>.sh-wys:empty:before{content:attr(data-ph);color:#9aa7bd;pointer-events:none;}.sh-wys ul,.sh-wys ol{padding-left:26px;margin:4px 0;}.sh-wys li{margin:2px 0;}</style>'
              +'<div id="mltab-sharereq" style="display:none;">'+box('sreq','shareReqForm','REQ','#2d6fd4',(R.subject||'[ubiQuoss-TOP] {id} {title}'),(R.intro||''),(R.outro||''),reqRows)+'</div>'
              +'<div id="mltab-sharetc" style="display:none;">'+box('stc','shareTcForm','TC','#00875a',(T.subject||'[ubiQuoss-TOP] {id} {title}'),(T.intro||''),(T.outro||''),tcRows)+'</div>';
      })()
    +'<div id="mltab-cycle" style="display:none;">'
      +'<div style="border:1px solid var(--border);border-radius:12px;padding:20px 22px;background:var(--bg2);">'
        +'<div style="font-size:12px;color:var(--text3);margin-bottom:14px;">사이클 배정 시 <b>담당자에게</b> 보내는 메일 폼입니다. 아래 <b>플레이스홀더</b>가 발송 시 실제 값으로 치환됩니다. <code>{{items}}</code> 는 시험 항목 표로 자동 생성됩니다.</div>'
        +'<label style="'+lbl+'">메일 제목</label><input id="ml-cycle-subject" value="'+esc(cySubject)+'" style="'+fld+'margin-bottom:14px;">'
        +'<label style="'+lbl+'">플레이스홀더 <span style="font-weight:400;color:var(--text3);">(클릭 → 본문 끝에 삽입 · 제목에도 사용 가능)</span></label>'
        +'<div style="margin-bottom:12px;line-height:2.4;">'+cyPhLegend+'</div>'
        +'<label style="'+lbl+'">메일 본문</label>'
        +_cybar('ml-cycle-html')
        +'<div id="ml-cycle-html" contenteditable="true" style="border:1.5px solid var(--border);border-radius:0 0 8px 8px;min-height:330px;max-height:560px;overflow:auto;padding:14px;background:#eef1f6;outline:none;font-size:14px;color:#1c2942;">'+cyHtml+'</div>'
        +'<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap;">'
          +'<button onclick="mailCycleReset()" style="font-size:13px;font-weight:700;padding:9px 16px;border:1px solid var(--border);border-radius:8px;background:#fff;color:var(--text2);cursor:pointer;"><i class="ti ti-rotate"></i> 기본 디자인 복원</button>'
          +'<button onclick="mailCyclePreview()" style="font-size:13px;font-weight:700;padding:9px 16px;border:1px solid #2d6fd4;border-radius:8px;background:#fff;color:#2d6fd4;cursor:pointer;"><i class="ti ti-eye"></i> 미리보기</button>'
          +'<button onclick="mailCfgSaveCycle()" style="font-size:13px;font-weight:700;padding:9px 22px;border:none;border-radius:8px;background:#2d6fd4;color:#fff;cursor:pointer;"><i class="ti ti-device-floppy"></i> 저장</button>'
        +'</div>'
        +'<div style="font-size:11px;color:var(--text3);margin-top:8px;"><i class="ti ti-info-circle"></i> 미리보기는 샘플 데이터로 렌더됩니다. 실제 발송은 사이클 수정 → 메일 발송 ON 시 담당자별로 전송됩니다.</div>'
      +'</div>'
    +'</div>'
    +'';
}
function mailTab(id){
  ['config','form','sharereq','sharetc','cycle'].forEach(t=>{
    const el=document.getElementById('mltab-'+t); if(el) el.style.display=(t===id?'block':'none');
    const b=document.getElementById('mltab-btn-'+t); if(b){ b.style.color=(t===id?'#2d6fd4':'var(--text3)'); b.style.borderBottom='2.5px solid '+(t===id?'#2d6fd4':'transparent'); }
  });
}
function shareReqFormSave(){ return _shareFormSave('req','sreq'); }
function shareTcFormSave(){ return _shareFormSave('tc','stc'); }
async function _shareFormSave(kind,pfx){
  const g=id=>document.getElementById(id);
  var sections=(kind==='req')
    ? {info:g(pfx+'-info').checked,desc:g(pfx+'-desc').checked,impl:g(pfx+'-impl').checked,scenario:g(pfx+'-scenario').checked,tc:g(pfx+'-tc').checked}
    : {info:g(pfx+'-info').checked,purpose:g(pfx+'-purpose').checked,topo:g(pfx+'-topo').checked,traffic:g(pfx+'-traffic').checked,steps:g(pfx+'-steps').checked,issue:g(pfx+'-issue').checked,history:g(pfx+'-history').checked,cycle:g(pfx+'-cycle').checked};
  var formObj={subject:(g(pfx+'-subject').value||'').trim(),sections:sections,intro:_shWysGet(pfx+'-intro'),outro:_shWysGet(pfx+'-outro')};
  var payload={}; payload[kind]=formObj;
  try{ await userApi('POST','/api/share-config',payload); _shareCfg=_shareCfg||{}; _shareCfg[kind]=Object.assign({},_shareCfg[kind]||{},formObj); showToast((kind==='req'?'REQ':'TC')+' 공유 폼 저장됨'); }
  catch(e){ showToast('저장 실패: '+((e&&e.message)||e)); }
}
function shareReqFormPreview(){ _shareFormPreview('req','sreq'); }
function shareTcFormPreview(){ _shareFormPreview('tc','stc'); }
function _shareFormPreview(kind,pfx){
  const g=id=>document.getElementById(id);
  if(typeof buildShareReportHtml!=='function'){ showToast('보고서 함수 로드 안됨 — 새로고침(Ctrl+Shift+R)'); return; }
  var sample, sections;
  if(kind==='tc'){
    sections={info:g(pfx+'-info').checked,purpose:g(pfx+'-purpose').checked,topo:g(pfx+'-topo').checked,traffic:g(pfx+'-traffic').checked,steps:g(pfx+'-steps').checked,issue:g(pfx+'-issue').checked,history:g(pfx+'-history').checked,cycle:g(pfx+'-cycle').checked};
    sample={kind:'TC',id:'SYS-SW-ENV-TC-002',title:'HW 식별 정보 확인',status:'Approved',author:'홍길동',date:'2026-06-19',
      object:'시스템 정보 조회를 통해 메모리·모델명·버전을 확인한다.',precondition:'장비 telnet 접속 가능 상태',
      steps:[{desc:'시스템 정보 조회',cli:'show system',criteria:'모델/시리얼/버전 표시',result:'합격'},{desc:'버전 확인',cli:'show version',criteria:'정상 버전 출력',result:'합격'}],
      traffic:{vendor:'IXIA',ip:'210.1.2.248',port:'1/1',src_mac:'00:11:22:33:44:55',dst_mac:'66:77:88:99:AA:BB',src_ip:'10.0.0.1',dst_ip:'10.0.0.2',gateway:'10.0.0.254'},
      topo2:{nodes:[{id:'n1',model:'E7124',role:'L3 스위치',vendor:'Ubiquoss',ip:'192.168.1.10'},{id:'n2',model:'E5010-24C',role:'L2 스위치',vendor:'Ubiquoss',ip:'192.168.1.11'}],links:[{a:'n1',b:'n2',ap:'Gi0/24',bp:'Gi0/1'}]},
      topo_nodes:[{model:'E7124',role:'L3 스위치',vendor:'Ubiquoss',ip:'192.168.1.10'},{model:'E5010-24C',role:'L2 스위치',vendor:'Ubiquoss',ip:'192.168.1.11'}],
      issues:[{key:'NETTEST-101',summary:'show system 응답 지연',status:'In Progress'}],
      history:[{date:'2026-06-18 14:20',result:'Pass',summary:'Step 전체 실행 — 2 Pass',executor:'홍길동'}],
      cycles:[{name:'E5010 v2.6.5 사이클',model:'E5010-24C',version:'2.6.5',result:'Pass',date:'2026-06-18'}]};
  }else{
    sections={info:g(pfx+'-info').checked,desc:g(pfx+'-desc').checked,impl:g(pfx+'-impl').checked,scenario:g(pfx+'-scenario').checked,tc:g(pfx+'-tc').checked};
    sample={kind:'REQ',id:'U-REQ-SYS-SW-001',title:'시스템 정보 조회',status:'Approved',author:'홍길동',date:'2026-06-19',
      overview:'장비의 시스템 정보를 CLI로 조회하여 모델·시리얼·버전을 확인한다.',
      description:'show system 명령으로 메모리/모델/버전을 확인하고 기준값과 비교한다.',
      implementation:'show system\nshow version\nshow inventory',
      scenarios:[{id:'SC-1',desc:'정상 조회'},{id:'SC-2',desc:'잘못된 명령 입력 시 오류 응답'}],
      tcs:[{id:'SYS-SW-ENV-TC-001',title:'시스템 정보 조회',result:'합격'},{id:'SYS-SW-ENV-TC-002',title:'HW 식별 정보 확인',result:'불합격'}]};
  }
  var html=buildShareReportHtml(sample,sections,{intro:_shWysGet(pfx+'-intro'),outro:_shWysGet(pfx+'-outro'),memo:'(보내는 사람 메모 예시)',appUrl:(_shareCfg&&_shareCfg.app_url)||''});
  if(typeof mailShowPreview==='function') mailShowPreview(html,(kind==='req'?'REQ':'TC')+' 공유 미리보기 (샘플)');
}
// ── 위지윅(WYSIWYG) 편집 ──
// ── 공용 위지윅(머리말/맺음말 등 임의 id) ──
function _shWys(id,cmd,val){ var e=document.getElementById(id); if(!e)return; if(document.activeElement!==e) e.focus(); try{ document.execCommand(cmd,false,(val===undefined?null:val)); }catch(_){} }
function _shWysLink(id){ var u=prompt('링크 주소(URL)를 입력하세요','https://'); if(!u)return; _shWys(id,'createLink',u); }
function _shWysGet(id){ var e=document.getElementById(id); if(!e) return ''; var h=e.innerHTML||''; if(/^(?:\s|&nbsp;|<br\s*\/?>)*$/i.test(h)) return ''; return h; }
function _shWysBar(id){
  var btn=function(cmd,inner,t,extra){ return '<button onmousedown="event.preventDefault()" onclick="_shWys(\''+id+'\',\''+cmd+'\')" title="'+t+'" style="border:none;background:none;cursor:pointer;padding:3px 7px;border-radius:5px;color:var(--text2);'+(extra||'')+'">'+inner+'</button>'; };
  return '<div style="display:flex;flex-wrap:wrap;gap:1px;align-items:center;border:1px solid var(--border);border-bottom:none;border-radius:8px 8px 0 0;padding:4px 6px;background:var(--bg3);">'
    +btn('bold','B','굵게','font-weight:800;')
    +btn('italic','I','기울임','font-style:italic;')
    +btn('underline','U','밑줄','text-decoration:underline;')
    +'<select onchange="_shWys(\''+id+'\',\'fontSize\',this.value);this.selectedIndex=0" title="글자 크기" style="font-size:11px;padding:2px 3px;border:1px solid var(--border);border-radius:5px;cursor:pointer;background:#fff;color:var(--text2);"><option value="">크기</option><option value="2">작게</option><option value="3">보통</option><option value="5">크게</option><option value="6">아주크게</option></select>'
    +btn('insertUnorderedList','<i class="ti ti-list"></i>','목록','font-size:13px;')
    +btn('insertOrderedList','<i class="ti ti-list-numbers"></i>','번호 목록','font-size:13px;')
    +'<label title="글자색" style="display:inline-flex;align-items:center;padding:2px 4px;cursor:pointer;"><i class="ti ti-letter-a" style="font-size:13px;color:var(--text2);"></i><input type="color" onchange="_shWys(\''+id+'\',\'foreColor\',this.value)" style="width:18px;height:16px;border:none;background:none;cursor:pointer;padding:0;"></label>'
    +'<button onmousedown="event.preventDefault()" onclick="_shWysLink(\''+id+'\')" title="링크" style="border:none;background:none;cursor:pointer;padding:3px 7px;border-radius:5px;color:var(--text2);font-size:13px;"><i class="ti ti-link"></i></button>'
    +btn('removeFormat','<i class="ti ti-clear-formatting"></i>','서식 지우기','font-size:13px;')
  +'</div>';
}
function _shWysEditor(id,ph,html){ return _shWysBar(id)+'<div id="'+id+'" contenteditable="true" data-ph="'+ph+'" class="sh-wys" style="border:1px solid var(--border);border-radius:0 0 8px 8px;min-height:58px;max-height:170px;overflow:auto;padding:8px 11px;background:#fff;outline:none;font-size:13px;color:#1c2942;line-height:1.6;margin-bottom:12px;">'+(html||'')+'</div>'; }
function mailWys(cmd,val,edId){
  const ed=document.getElementById(edId||'ml-appr-wys'); if(!ed) return;
  if(document.activeElement!==ed) ed.focus();
  try{ document.execCommand(cmd,false,(val===undefined?null:val)); }catch(e){}
}
function mailWysInsert(html,edId){
  const ed=document.getElementById(edId||'ml-appr-wys'); if(!ed) return;
  if(document.activeElement!==ed) ed.focus();
  try{ document.execCommand('insertHTML',false,html); }catch(e){ ed.innerHTML+=html; }
}
function mailWysLink(edId){
  const url=prompt('링크 주소(URL)를 입력하세요','https://'); if(!url) return;
  mailWys('createLink',url,edId);
}
function mailTplInsert(ph,edId){
  const ed=document.getElementById(edId||'ml-appr-wys'); if(!ed) return;
  if(document.activeElement!==ed) ed.focus();
  try{ document.execCommand('insertText',false,ph); }catch(e){ mailWysInsert(ph,edId); }
}
function mailTplReset(){
  if(!confirm('기본 디자인으로 되돌립니다. 편집 중인 내용은 사라집니다.\n(저장해야 실제 적용됩니다)')) return;
  const s=document.getElementById('ml-appr-subject'), h=document.getElementById('ml-appr-wys');
  if(s) s.value=_mailDefaults.subject||''; if(h) h.innerHTML=_mailDefaults.html||'';
  showToast('기본 디자인 불러옴 — [저장]을 눌러야 적용됩니다');
}
async function mailTplPreview(){
  const html=(document.getElementById('ml-appr-wys')||{}).innerHTML||'';
  try{ const d=await userApi('POST','/api/mail/preview-approval',{html}); mailShowPreview(d.html||'', '가입 승인 메일 미리보기 (샘플)'); }
  catch(e){ showToast('미리보기 실패: '+e.message); }
}
// ── 사이클 배정 메일 폼 ──
function mailCyclePhIns(ph){ mailTplInsert(ph,'ml-cycle-html'); }
function mailCycleReset(){ if(!confirm('기본 디자인으로 되돌립니다. 편집 중인 내용은 사라집니다.\n(저장해야 실제 적용됩니다)'))return; var s=document.getElementById('ml-cycle-subject'), h=document.getElementById('ml-cycle-html'); if(s)s.value=(_mailCycleDefaults&&_mailCycleDefaults.subject)||''; if(h)h.innerHTML=(_mailCycleDefaults&&_mailCycleDefaults.html)||''; showToast('기본 디자인 불러옴 — [저장]을 눌러야 적용됩니다'); }
function mailCyclePreview(){
  var html=(document.getElementById('ml-cycle-html')||{}).innerHTML||'';
  // 샘플 데이터로 클라이언트 치환
  var itemsTbl='<table style="border-collapse:collapse;width:100%;font-size:12.5px;"><thead><tr style="background:#f3f6fb;"><th style="padding:6px 10px;border:1px solid #e3e8ef;width:36px;">#</th><th style="padding:6px 10px;border:1px solid #e3e8ef;text-align:left;width:120px;">TC ID</th><th style="padding:6px 10px;border:1px solid #e3e8ef;text-align:left;">시험명</th></tr></thead><tbody>'
    +[['SW-MGMT-TC-001','sysDescr Get 동작 확인'],['SW-MGMT-TC-002','sysObjectID Get 동작 확인'],['SW-ENV-TC-004','모델명 확인 및 트래픽 로스 확인']].map(function(r,i){return '<tr><td style="padding:6px 10px;border:1px solid #e3e8ef;text-align:center;color:#6b7280;">'+(i+1)+'</td><td style="padding:6px 10px;border:1px solid #e3e8ef;font-family:monospace;color:#2563eb;">'+r[0]+'</td><td style="padding:6px 10px;border:1px solid #e3e8ef;">'+r[1]+'</td></tr>';}).join('')+'</tbody></table>';
  var appurl=(document.getElementById('ml-appurl')||{}).value||'';
  var btn=appurl?('<a href="'+appurl+'" style="display:inline-block;margin-top:14px;padding:9px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:7px;font-weight:700;">Test Workflow 열기 →</a>'):'';
  html=html.replace(/\{\{assignee\}\}/g,'홍길동').replace(/\{\{model\}\}/g,'E5724RL').replace(/\{\{vgroup\}\}/g,'R200').replace(/\{\{version\}\}/g,'R201_20261010').replace(/\{\{period\}\}/g,'2026-06-30 ~ 2026-07-15').replace(/\{\{count\}\}/g,'3').replace(/\{\{items\}\}/g,itemsTbl).replace(/\{\{app_url\}\}/g,appurl).replace(/\{\{login_button\}\}/g,btn);
  mailShowPreview(html, '사이클 배정 메일 미리보기 (샘플)');
}
async function mailCfgSaveCycle(){
  var s=(document.getElementById('ml-cycle-subject')||{}).value||''; var h=(document.getElementById('ml-cycle-html')||{}).innerHTML||'';
  try{ var d=await userApi('POST','/api/mail/config',{cycle_subject:s.trim(), cycle_html:h}); _mailCfg=d.config||_mailCfg; showToast('사이클 배정 폼 저장됨'); }
  catch(e){ showToast('저장 실패: '+e.message); }
}
function mailShowPreview(html, title){
  let m=document.getElementById('ml-preview-modal'); if(m) m.remove();
  m=document.createElement('div'); m.id='ml-preview-modal';
  m.style.cssText='position:fixed;inset:0;z-index:100060;background:rgba(15,22,38,0.55);display:flex;align-items:center;justify-content:center;';
  m.innerHTML='<div style="width:1100px;max-width:96vw;height:1123px;max-height:95vh;background:#fff;border-radius:12px;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,0.4);overflow:hidden;"><div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;"><i class="ti ti-eye" style="color:#2d6fd4;"></i><b style="font-size:14px;flex:1;">'+(title||'메일 미리보기 (샘플 데이터)')+'</b><span style="font-size:11px;color:var(--text3);font-weight:600;">A4</span><button onclick="document.getElementById(\'ml-preview-modal\').remove()" style="width:28px;height:28px;border:none;border-radius:7px;background:#eef1f5;cursor:pointer;"><i class="ti ti-x"></i></button></div><iframe style="flex:1;width:100%;border:none;background:#f3f5f8;"></iframe></div>';
  document.body.appendChild(m);
  m.addEventListener('click',e=>{ if(e.target===m) m.remove(); });
  const f=m.querySelector('iframe'); const doc=f.contentDocument||f.contentWindow.document;
  doc.open(); doc.write(html); doc.close();
}
async function mailCfgSave(){
  const g=id=>document.getElementById(id);
  const payload={enabled:g('ml-enabled').checked, host:(g('ml-host').value||'').trim(), port:(g('ml-port').value||'').trim()||587, security:g('ml-sec').value, username:(g('ml-user').value||'').trim(), password:g('ml-pw').value||'', from_addr:(g('ml-from').value||'').trim(), from_name:(g('ml-fromname').value||'').trim(), app_url:(g('ml-appurl').value||'').trim()};
  const _as=g('ml-appr-subject'), _ah=g('ml-appr-wys');   // 가입 메일 폼 탭(위지윅)
  if(_as) payload.approval_subject=(_as.value||'').trim();
  if(_ah) payload.approval_html=_ah.innerHTML||'';
  try{ const d=await userApi('POST','/api/mail/config',payload); _mailCfg=d.config; showToast('메일 설정 저장됨'); }
  catch(e){ showToast(e.message); }
}
async function mailCfgTest(){
  const to=((document.getElementById('ml-test-to')||{}).value||'').trim();
  if(!to){ showToast('받는 사람 이메일을 입력하세요'); return; }
  showToast('테스트 메일 발송 중…');
  try{ const d=await userApi('POST','/api/mail/test',{to}); showToast('✅ 발송 성공: '+((d.sent||[]).join(', ')||to)); }
  catch(e){ showToast('발송 실패: '+e.message); }
}

// ══ 🔔 알림함 (@멘션 알림) ══
let _notifData={items:[],unread:0};
async function notifLoad(){
  if(typeof authToken==='undefined'||!authToken) return;
  try{ const d=await userApi('GET','/api/notifications'); _notifData=d||{items:[],unread:0}; notifUpdateBadge(); }catch(e){}
}
function notifUpdateBadge(){
  const b=document.getElementById('notif-badge'); if(!b) return;
  const n=(_notifData&&_notifData.unread)||0;
  b.textContent=n>99?'99+':String(n); b.style.display=n>0?'flex':'none';
}
function notifToggle(){
  const ex=document.getElementById('notif-panel'); if(ex){ ex.remove(); document.removeEventListener('click',_notifPanelClose); return; }
  const p=document.createElement('div'); p.id='notif-panel';
  p.style.cssText='position:fixed;z-index:100050;background:var(--bg2);border:1px solid var(--border);border-radius:12px;box-shadow:0 16px 50px rgba(0,0,0,0.28);width:340px;max-height:440px;overflow:hidden;display:flex;flex-direction:column;';
  const bell=document.getElementById('notif-bell'); const r=bell?bell.getBoundingClientRect():{bottom:54,right:window.innerWidth-20};
  p.style.top=(r.bottom+8)+'px'; p.style.right=Math.max(8,(window.innerWidth-r.right))+'px';
  const esc=(typeof _bdEsc==='function')?_bdEsc:(s=>String(s==null?'':s));
  const items=(_notifData&&_notifData.items)||[];
  const list=items.length?items.map(n=>'<div onclick="notifClick(\''+n.id+'\',\''+encodeURIComponent(n.link||'')+'\')" style="padding:11px 14px;border-bottom:1px solid var(--border);cursor:pointer;background:'+(n.read?'transparent':'rgba(45,111,212,0.07)')+';"><div style="font-size:12.5px;color:var(--text);line-height:1.5;'+(n.read?'':'font-weight:700;')+'">'+esc(n.text||'')+'</div><div style="font-size:10.5px;color:var(--text3);margin-top:3px;">'+esc(n.ts||'')+'</div></div>').join('')
    :'<div style="padding:40px 14px;text-align:center;color:var(--text3);font-size:12.5px;"><i class="ti ti-bell-off" style="font-size:30px;opacity:0.3;display:block;margin-bottom:8px;"></i>알림이 없습니다</div>';
  p.innerHTML='<div style="padding:11px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;background:var(--bg3);flex-shrink:0;"><i class="ti ti-bell" style="color:#2d6fd4;"></i><b style="font-size:13px;flex:1;">알림</b><button onclick="notifReadAll()" style="font-size:11px;padding:4px 9px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);color:var(--text2);cursor:pointer;">모두 읽음</button></div><div style="overflow:auto;flex:1;">'+list+'</div>';
  document.body.appendChild(p);
  setTimeout(()=>document.addEventListener('click',_notifPanelClose),0);
}
function _notifPanelClose(ev){ const p=document.getElementById('notif-panel'); if(!p) return; const bell=document.getElementById('notif-bell'); if(p.contains(ev.target)||(bell&&bell.contains(ev.target))) return; p.remove(); document.removeEventListener('click',_notifPanelClose); }
async function notifClick(id, linkEnc){
  try{ await userApi('POST','/api/notifications/read',{id:id}); }catch(e){}
  const p=document.getElementById('notif-panel'); if(p)p.remove(); document.removeEventListener('click',_notifPanelClose);
  await notifLoad();
  const link=decodeURIComponent(linkEnc||'');
  if(link && typeof showPage==='function'){ try{ showPage(link); }catch(e){} }
}
async function notifReadAll(){
  try{ await userApi('POST','/api/notifications/read',{}); }catch(e){}
  const p=document.getElementById('notif-panel'); if(p)p.remove(); document.removeEventListener('click',_notifPanelClose);
  await notifLoad();
}

// ══ @멘션 (자동완성 + 알림 발송) ══
let _mentionUsers=null;
async function loadMentionUsers(){
  if(typeof authToken==='undefined'||!authToken) return [];
  try{ const d=await userApi('GET','/api/users/mentionable'); _mentionUsers=d.users||[]; }catch(e){ _mentionUsers=_mentionUsers||[]; }
  return _mentionUsers;
}
async function mentionNotify(text, context, link){
  if(!text) return;
  const found=(String(text).match(/@([A-Za-z0-9_.\-가-힣]+)/g)||[]).map(s=>s.slice(1));
  if(!found.length) return;
  const users=_mentionUsers||await loadMentionUsers();
  const valid=found.filter(u=>users.some(x=>x.username===u));
  if(!valid.length) return;
  try{ await userApi('POST','/api/mention',{mentions:Array.from(new Set(valid)), text:String(text).slice(0,200), context:context||'', link:link||''}); }catch(e){}
}
let _mentionBox=null,_mentionTarget=null,_mentionStart=-1,_mentionMatches=[],_mentionSel=0;
function mentionAttach(el){
  if(!el||el._mentionOn) return; el._mentionOn=true; loadMentionUsers();
  el.addEventListener('input', function(){ _mentionScan(el); });
  el.addEventListener('keydown', function(ev){ _mentionKey(el,ev); });
  el.addEventListener('blur', function(){ setTimeout(_mentionClose,160); });
}
function _mentionScan(el){
  const pos=el.selectionStart, val=el.value||'';
  const m=val.slice(0,pos).match(/@([A-Za-z0-9_.\-가-힣]*)$/);
  if(!m){ _mentionClose(); return; }
  _mentionTarget=el; _mentionStart=pos-m[0].length;
  const q=m[1].toLowerCase(); const users=_mentionUsers||[];
  _mentionMatches=users.filter(u=>(u.username||'').toLowerCase().indexOf(q)>=0||(u.name||'').toLowerCase().indexOf(q)>=0).slice(0,6);
  if(!_mentionMatches.length){ _mentionClose(); return; }
  _mentionSel=0; _mentionShow(el);
}
function _mentionShow(el){
  _mentionClose(true);
  const esc=(typeof _bdEsc==='function')?_bdEsc:(s=>String(s==null?'':s));
  _mentionBox=document.createElement('div'); _mentionBox.id='mention-box';
  _mentionBox.style.cssText='position:fixed;z-index:100060;background:var(--bg2);border:1px solid var(--border);border-radius:9px;box-shadow:0 10px 30px rgba(0,0,0,0.25);min-width:190px;max-width:290px;overflow:hidden;font-size:13px;';
  _mentionBox.innerHTML=_mentionMatches.map((u,i)=>'<div onmousedown="event.preventDefault();_mentionPick('+i+')" style="padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;background:'+(i===_mentionSel?'var(--bg3)':'transparent')+';"><i class="ti ti-at" style="color:#2d6fd4;font-size:14px;"></i><b>'+esc(u.name||u.username)+'</b><span style="color:var(--text3);font-size:11px;">@'+esc(u.username)+'</span></div>').join('');
  const r=el.getBoundingClientRect();
  _mentionBox.style.left=Math.min(r.left+12, window.innerWidth-300)+'px';
  document.body.appendChild(_mentionBox);
  const bh=_mentionBox.offsetHeight||(_mentionMatches.length*36);
  _mentionBox.style.top=(r.top>bh+10?(r.top-bh-4):(r.bottom+4))+'px';
}
function _mentionClose(keep){ if(_mentionBox){ _mentionBox.remove(); _mentionBox=null; } if(!keep){ _mentionMatches=[]; _mentionTarget=null; } }
function _mentionKey(el,ev){
  if(!_mentionBox||!_mentionMatches.length) return;
  if(ev.key==='ArrowDown'){ ev.preventDefault(); _mentionSel=(_mentionSel+1)%_mentionMatches.length; _mentionShow(el); }
  else if(ev.key==='ArrowUp'){ ev.preventDefault(); _mentionSel=(_mentionSel-1+_mentionMatches.length)%_mentionMatches.length; _mentionShow(el); }
  else if(ev.key==='Enter'||ev.key==='Tab'){ ev.preventDefault(); _mentionPick(_mentionSel); }
  else if(ev.key==='Escape'){ _mentionClose(); }
}
function _mentionPick(i){
  const u=_mentionMatches[i], el=_mentionTarget; if(!u||!el) return;
  const pos=el.selectionStart, val=el.value||'';
  el.value=val.slice(0,_mentionStart)+'@'+u.username+' '+val.slice(pos);
  const np=_mentionStart+(u.username.length)+2; el.setSelectionRange(np,np); el.focus();
  _mentionClose();
}
(async()=>{
  applyTheme();
  try{
    // authInit 는 세션 검증이라 반드시 먼저 (인증 안 되면 로그인 게이트로)
    await authInit();
    loadTemplates();
    // ★ 서로 독립인 초기 데이터 로드는 병렬로 (예전 순차 await 총 500ms → 병렬 최대 값만)
    //   showPage 호출 전에 준비돼야 하는 것들: customFields, difyAssistants(chat model select), devices, procedures, llms
    //   loadREQData 는 원래도 await 안 하고 있어 그대로 fire-and-forget
    loadREQData();
    initWS();   // 순수 WS 오픈, 반환값 사용 안 함
    await Promise.all([
      loadLLMsFromServer().catch(function(e){ console.warn('[init] llms', e); }),
      loadCustomFields().catch(function(e){ console.warn('[init] customFields', e); }),
      loadDifyAssistants().catch(function(e){ console.warn('[init] dify', e); }),
      loadDevices().catch(function(e){ console.warn('[init] devices', e); }),
      loadProcedures().catch(function(e){ console.warn('[init] procedures', e); }),
    ]);
    renderChatModelSelect();
  }catch(e){ console.error('[init] 초기화 중 오류(페이지 복원은 계속 진행):', e); }

  // 최초 접속(저장값 없음) → dashboard, 이후 새로고침 → 마지막 접속 페이지 복원(localStorage: 재실행에도 유지)
  let lastPage='dashboard';
  try{ lastPage=sessionStorage.getItem('utop_last_page')||localStorage.getItem('utop_last_page')||'dashboard'; }catch(e){} // 탭별(session) 우선 → 새 탭은 마지막(local)
  try{ if(new URLSearchParams(location.search).get('cycleEdit')){ lastPage='board'; } }catch(e){}   // ?cycleEdit= (별도 창) → 무조건 사이클 보드로 → 수정 다이얼로그 자동 오픈
  if(lastPage==='req'||lastPage==='tc'||lastPage==='tm') lastPage='explorer';  // req/tc/tm은 Test Workflow(explorer)로 통합됨 — 실제 존재 페이지로 복원
  if(lastPage==='jira-ai') lastPage='jira-ai-beta';  // 구 "지식 검색" 페이지 통합 → jira-ai-beta 로 자동 리다이렉트
  if(lastPage==='device-reg') lastPage='device-reg-beta';  // 구 "Device Registration" 통합 → device-reg-beta 로 자동 리다이렉트
  if(!document.getElementById('page-'+lastPage)) lastPage='dashboard';  // 없는 페이지면 안전하게 dashboard
  if(lastPage==='itms-rack'){ try{ const _sl=localStorage.getItem('utop_rack_lab'); if(_sl)_rackLab=_sl; _rackEdit=localStorage.getItem('utop_rack_edit')==='1'; }catch(_e){} }
  // 사이클 자동 실행 중 새로고침 → 원래 있던 사이클 페이지였을 때만 그대로 사이클 페이지 유지.
  // 다른 페이지에 있었다면 그 페이지 유지 (다중 탭·다중 창에서 각 탭의 페이지가 사이클로 강제 이동되던 버그 방지)
  await showPage(lastPage);

  // ★ 백그라운드 프리페치: 사용자가 첫 페이지 보는 동안 자주 쓰는 다른 페이지 데이터도 idle 시간에 미리 로드
  //   → 두 번째 페이지 클릭이 즉시. 첫 진입 시 로딩 안 늦춤 (idle 큐).
  try{
    var _idle=window.requestIdleCallback||function(cb){ return setTimeout(cb, 500); };
    _idle(function(){
      // 초기 페이지가 아니었던 데이터들 미리 로드 (inflight 재사용으로 중복 방지됨)
      try{ if(typeof loadTCData==='function') loadTCData().catch(function(){}); }catch(_e){}
      try{ if(typeof loadCycleData==='function') loadCycleData().catch(function(){}); }catch(_e){}
      try{ if(typeof loadREQData==='function') loadREQData(); }catch(_e){}
      try{ if(typeof loadDeviceData==='function') loadDeviceData().catch(function(){}); }catch(_e){}
    });
  }catch(_e){}
})();

// ══ PDF 출력 ══
// 인쇄 미리보기 팝업 — 내용 확인 후 인쇄/PDF 저장
let _pdfRebuild=null, _pdfMode='자체';
function _docBrand(mode,customer){ return mode==='고객사' ? (customer?('고객사 : '+customer):'고객사 제출용') : 'Ubiquoss-TOP · Ubiquoss Test Orchestration Platform'; }
function _commonCustomer(items,target){ const set=new Set(); (items||[]).forEach(o=>{ const v=cfV(target,o,'고객사'); if(v) set.add(v); }); return set.size===1?[...set][0]:''; }// 진행 체크리스트 섹션 (표지 없음) — 자체용 템플릿에서 상세 아래에 덧붙임
function _checklistSection(tcs){
  const list=Array.isArray(tcs)?tcs:[];
  let passN=0,failN=0,execN=0;
  const rows=list.map((tc,i)=>{
    const tcid=tc.tcid||tc.id||'';
    const res=(typeof tcLatestResult==='function')?tcLatestResult(tcid):null;
    const status=(res&&res.status&&res.status!=='UNEXECUTED')?res.status:'';
    if(status){ execN++; const v=(typeof resultVerdict==='function')?resultVerdict(status):''; if(v==='pass')passN++; else if(v==='fail')failN++; }
    const sev=(typeof tcSeverity==='function'?tcSeverity(tc):tc.severity)||'';
    const col=status?(_resColor(status)||'#888'):'#bbb';
    const badge=status
      ? `<span style="display:inline-block;min-width:46px;text-align:center;font-size:10px;font-weight:700;color:#fff;background:${col};padding:2px 8px;border-radius:4px;">${status}</span>`
      : `<span style="display:inline-block;min-width:46px;text-align:center;font-size:10px;color:#9aa0b8;border:1px solid #d0d5e0;padding:2px 8px;border-radius:4px;">미실행</span>`;
    return `<tr><td style="text-align:center;"><span style="display:inline-block;width:13px;height:13px;border:1.5px solid #9aa0b8;border-radius:3px;vertical-align:middle;"></span></td><td style="text-align:center;color:#9aa0b8;">${i+1}</td><td style="font-family:monospace;font-weight:700;color:#2d6fd4;font-size:10px;">${tcid}</td><td>${tc.name||''}</td><td style="text-align:center;">${sev||'-'}</td><td style="text-align:center;">${badge}</td></tr>`;
  }).join('');
  const summary=`<div style="display:flex;gap:14px;margin-bottom:12px;font-size:12px;"><span style="font-weight:700;">총 ${list.length}</span><span style="color:#00a872;font-weight:700;">Pass ${passN}</span><span style="color:#e53e5a;font-weight:700;">Fail ${failN}</span><span style="color:#9aa0b8;">미실행 ${list.length-execN}</span></div>`;
  return `<div class="pdf-section"><div class="pdf-section-title">✅ 진행 체크리스트</div>${summary}<table class="pdf-table"><thead><tr><th style="width:34px;text-align:center;">✓</th><th style="width:30px;text-align:center;">#</th><th style="width:180px;">TC ID</th><th>시험명</th><th style="width:70px;text-align:center;">심각도</th><th style="width:80px;text-align:center;">최근결과</th></tr></thead><tbody>${rows||'<tr><td colspan="6" style="text-align:center;color:#9aa0b8;padding:14px;">TC 없음</td></tr>'}</tbody></table></div>`;
}
// (구) 체크리스트 단독 빌더 — 표지 + 섹션
var _pdfShareFn=null;
function pdfPreview(html, title, rebuild, shareFn){
  _pdfRebuild=(typeof rebuild==='function')?rebuild:null;
  _pdfShareFn=(typeof shareFn==='function')?shareFn:null;
  const area=document.getElementById('pdf-print-area');
  if(area) area.innerHTML=html;
  const ex=document.getElementById('pdf-preview-modal'); if(ex) ex.remove();
  const modal=document.createElement('div');
  modal.id='pdf-preview-modal';
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:100000;';
  modal.onclick=function(e){ if(e.target===modal) modal.remove(); };
  modal.innerHTML='<div id="pdf-preview-box" style="background:var(--bg2);border-radius:12px;width:880px;max-width:95vw;height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 16px 50px rgba(0,0,0,0.35);">'
    +'<div onmousedown="pdfModalDragStart(event)" title="드래그하여 창 이동" style="padding:12px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;flex-shrink:0;cursor:move;user-select:none;">'
      +'<i class="ti ti-printer" style="color:#2d6fd4;font-size:22px;"></i>'
      +'<div style="flex:1;min-width:0;"><div style="font-size:15px;font-weight:700;color:var(--text);">'+(title||'인쇄 미리보기')+'</div><div style="font-size:11px;color:var(--text3);">내용을 확인하고 인쇄 또는 PDF로 저장하세요</div></div>'
      +''
      +(_pdfShareFn?'<button onclick="_pdfDoShare()" style="font-size:13px;padding:9px 16px;border-radius:8px;border:1px solid #2d6fd4;background:#fff;color:#2d6fd4;cursor:pointer;font-weight:700;"><i class="ti ti-mail-share"></i> 공유</button>':'')
      +'<button onclick="pdfPreviewPrint()" style="font-size:13px;padding:9px 20px;border-radius:8px;border:none;background:#2d6fd4;color:#fff;cursor:pointer;font-weight:700;"><i class="ti ti-printer"></i> 인쇄 / PDF 저장</button>'
      +'<button onclick="document.getElementById(\'pdf-preview-modal\').remove()" style="font-size:13px;padding:9px 16px;border-radius:8px;border:1px solid var(--border);background:var(--bg2);color:var(--text2);cursor:pointer;">닫기</button>'
    +'</div>'
    +'<div style="flex:1;overflow-y:auto;background:var(--bg3);padding:22px;"><div id="pdf-preview-paper" style="background:#fff;max-width:780px;margin:0 auto;padding:32px 38px;box-shadow:0 2px 14px rgba(0,0,0,0.14);font-family:\'Pretendard\',\'Noto Sans KR\',sans-serif;font-size:12px;color:#1a1d2e;line-height:1.6;">'+html+'</div></div>'
  +'</div>';
  document.body.appendChild(modal);
}
function pdfPreviewPrint(){ window.print(); }
function _pdfDoShare(){ var f=_pdfShareFn; var m=document.getElementById('pdf-preview-modal'); if(m) m.remove(); if(typeof f==='function') f(); }
// 보고서 팝업 헤더 드래그로 창 이동
let _pdfDrag=null;
function pdfModalDragStart(e){
  if(e.target.closest('button')||e.target.closest('select')||e.target.closest('input')) return; // 버튼/입력 클릭은 이동 아님
  const box=document.getElementById('pdf-preview-box'); if(!box) return;
  const m=(box.style.transform||'').match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
  _pdfDrag={sx:e.clientX, sy:e.clientY, ox:(m?parseFloat(m[1]):0), oy:(m?parseFloat(m[2]):0), box:box};
  document.addEventListener('mousemove', pdfModalDragMove);
  document.addEventListener('mouseup', pdfModalDragEnd);
  e.preventDefault();
}
function pdfModalDragMove(e){
  if(!_pdfDrag) return;
  _pdfDrag.box.style.transform='translate('+(_pdfDrag.ox+(e.clientX-_pdfDrag.sx))+'px,'+(_pdfDrag.oy+(e.clientY-_pdfDrag.sy))+'px)';
}
function pdfModalDragEnd(){
  _pdfDrag=null;
  document.removeEventListener('mousemove', pdfModalDragMove);
  document.removeEventListener('mouseup', pdfModalDragEnd);
}
function exportReqPDF(reqId){
  const r=reqList.find(x=>x.id===reqId);
  if(!r){showToast('REQ를 찾을 수 없습니다');return;}
  const tcs=tcList.filter(t=>t.req_id===r.id||t.req_id===r.reqid);
  let scs=[];
  try{scs=JSON.parse(r.scenarios||'[]');if(!Array.isArray(scs))scs=[];}catch(e){}
  const cust=cfV('req',r,'고객사')||'';
  const build=m=>{ let html=buildReqPdfHtml(r,tcs,scs,true,{mode:m,customer:cust}); if(m!=='고객사') html+=_checklistSection(tcs); return html; };
  pdfPreview(build(_pdfMode), 'REQ 명세서 — '+(r.reqid||r.id||''), build, function(){ if(typeof shareReqMail==='function') shareReqMail(r.id); });
}
function exportTCPDF(tcid){
  const tc=tcList.find(t=>t.tcid===tcid);
  if(!tc){showToast('TC를 찾을 수 없습니다');return;}
  const cust=cfV('tc',tc,'고객사')||'';
  const build=m=>buildTCPdfHtml(tc,true,{mode:m,customer:cust});
  pdfPreview(build(_pdfMode), 'TC 명세서 — '+(tc.tcid||'')+(tc.name?(' · '+tc.name):''), build, function(){ if(typeof shareTcMail==='function') shareTcMail(tc.tcid); });
}
const _TC_PPT_FONT='맑은 고딕';   // 한글 깨짐 방지용 폰트
let _pptMode='고객사';
function _tcpEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function exportTCPPTX(tcid){
  const tc=tcList.find(t=>t.tcid===tcid); if(!tc){showToast('TC를 찾을 수 없습니다');return;}
  let steps=[]; try{ steps=(typeof _checksToSteps==='function')?_checksToSteps(tc):[]; }catch(e){}
  _tcPptxPreview(tc, steps);
}
function _tcPptxPreview(tc, steps){
  const sev=(typeof tcSeverity==='function'?tcSeverity(tc):tc.severity)||'-';
  const st=(typeof tcStatus==='function'?tcStatus(tc):tc.status)||'-';
  const cust=cfV('tc',tc,'고객사')||'';
  const _brandLine=m=>(m==='고객사'?(cust?('고객사 : '+cust):'고객사 제출용'):'Ubiquoss-TOP')+' · '+_nowStr();
  const slide=(inner,dark)=>'<div style="aspect-ratio:16/9;border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:14px;box-shadow:0 2px 8px rgba(0,0,0,0.15);position:relative;'+(dark?'background:#1E2330;':'background:#fff;')+'">'+inner+'</div>';
  const s1=m=>slide('<div style="position:absolute;left:5%;top:33%;font-size:clamp(18px,3.4vw,34px);font-weight:800;color:#fff;">시험 항목 명세서</div><div style="position:absolute;left:5%;top:53%;font-size:clamp(11px,1.7vw,18px);color:#8FC9FF;">'+_tcpEsc(tc.tcid||'')+'  ·  '+_tcpEsc(tc.name||'')+'</div><div style="position:absolute;left:5%;bottom:6%;font-size:11px;color:#9AA3B5;">'+_tcpEsc(_brandLine(m))+'</div>',true);
  const s2=slide('<div style="padding:5% 6%;font-size:clamp(10px,1.5vw,15px);color:#222;line-height:1.7;height:100%;box-sizing:border-box;overflow:hidden;"><div style="font-size:1.45em;font-weight:800;color:#1A2030;margin-bottom:3%;">시험 정보</div><b style="color:#2D6FD4;">시험 목적</b><br>'+_tcpEsc(tc.object||'-')+'<br><br><b style="color:#2D6FD4;">사전조건</b><br>'+_tcpEsc(tc.precondition||'-')+'<br><br><b style="color:#2D6FD4;">심각도/상태</b><br>'+_tcpEsc(sev)+' / '+_tcpEsc(st)+'</div>');
  const rowsHtml=steps.slice(0,14).map((sp,i)=>'<tr><td style="border:1px solid #ddd;padding:3px 6px;text-align:center;">'+(i+1)+'</td><td style="border:1px solid #ddd;padding:3px 6px;">'+_tcpEsc(sp.action||'CLI')+'</td><td style="border:1px solid #ddd;padding:3px 6px;font-family:monospace;word-break:break-all;">'+_tcpEsc(sp.cli||'')+'</td><td style="border:1px solid #ddd;padding:3px 6px;">'+_tcpEsc(sp.criteria||'')+'</td></tr>').join('');
  const s3=slide('<div style="padding:4% 5%;height:100%;box-sizing:border-box;overflow:hidden;"><div style="font-size:clamp(12px,1.6vw,18px);font-weight:800;color:#1A2030;margin-bottom:2%;">시험 절차 ('+steps.length+' Step)</div><table style="width:100%;border-collapse:collapse;font-size:clamp(8px,1.1vw,11px);color:#222;"><tr style="background:#F4F5F7;font-weight:700;"><td style="border:1px solid #ddd;padding:3px 6px;">#</td><td style="border:1px solid #ddd;padding:3px 6px;">Action</td><td style="border:1px solid #ddd;padding:3px 6px;">Test Data</td><td style="border:1px solid #ddd;padding:3px 6px;">Expected Result</td></tr>'+rowsHtml+'</table>'+(steps.length>14?'<div style="font-size:11px;color:#999;margin-top:1.5%;">… 외 '+(steps.length-14)+' Step (전체는 다운로드/PDF 참조)</div>':'')+'</div>');
  // 자체용 체크리스트 슬라이드 (1개 TC)
  const _selfRes=(typeof tcLatestResult==='function')?tcLatestResult(tc.tcid):null;
  const _selfStat=(_selfRes&&_selfRes.status&&_selfRes.status!=='UNEXECUTED')?_selfRes.status:'미실행';
  const _selfCol=(_selfStat!=='미실행')?((typeof _resColor==='function'&&_resColor(_selfStat))||'#888'):'#9aa0b8';
  const cs1=slide('<div style="position:absolute;left:5%;top:33%;font-size:clamp(18px,3.4vw,34px);font-weight:800;color:#fff;">시험 진행 체크리스트</div><div style="position:absolute;left:5%;top:53%;font-size:clamp(11px,1.7vw,18px);color:#8FC9FF;">'+_tcpEsc(tc.tcid||'')+'  ·  '+_tcpEsc(tc.name||'')+'</div><div style="position:absolute;left:5%;bottom:6%;font-size:11px;color:#9AA3B5;">'+_tcpEsc('Ubiquoss-TOP · '+_nowStr())+'</div>',true);
  const cs2=slide('<div style="padding:4% 5%;height:100%;box-sizing:border-box;overflow:hidden;"><div style="font-size:clamp(12px,1.6vw,18px);font-weight:800;color:#1A2030;margin-bottom:2%;">진행 체크리스트 (1개)</div><table style="width:100%;border-collapse:collapse;font-size:clamp(9px,1.2vw,13px);color:#222;"><tr style="background:#F4F5F7;font-weight:700;"><td style="border:1px solid #ddd;padding:5px 7px;">✓</td><td style="border:1px solid #ddd;padding:5px 7px;">TC ID</td><td style="border:1px solid #ddd;padding:5px 7px;">시험명</td><td style="border:1px solid #ddd;padding:5px 7px;">심각도</td><td style="border:1px solid #ddd;padding:5px 7px;">최근결과</td></tr><tr><td style="border:1px solid #ddd;padding:5px 7px;text-align:center;">☐</td><td style="border:1px solid #ddd;padding:5px 7px;font-family:monospace;">'+_tcpEsc(tc.tcid||'')+'</td><td style="border:1px solid #ddd;padding:5px 7px;">'+_tcpEsc(tc.name||'')+'</td><td style="border:1px solid #ddd;padding:5px 7px;text-align:center;">'+_tcpEsc(sev)+'</td><td style="border:1px solid #ddd;padding:5px 7px;text-align:center;color:#fff;font-weight:700;background:'+_selfCol+';">'+_tcpEsc(_selfStat)+'</td></tr></table></div>');
  const renderSlides=m=> m==='고객사' ? (s1(m)+s2+s3) : (cs1+cs2);
  const slideLbl=m=> m==='고객사' ? '슬라이드 3장' : '슬라이드 2장';
  const ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:11000;display:flex;align-items:center;justify-content:center;';
  ov.innerHTML='<div style="background:var(--bg2);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,0.4);width:1060px;max-width:96vw;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;">'
    +'<div style="padding:14px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;flex-shrink:0;"><i class="ti ti-file-type-ppt" style="color:#c0392b;font-size:19px;"></i><span style="font-size:15px;font-weight:700;color:var(--text);">PPTX 미리보기</span><span style="font-size:12px;color:var(--text3);">'+_tcpEsc(tc.tcid||'')+'</span><span style="flex:1;"></span><select id="tcppt-tmpl-sel" title="명세서 템플릿" style="font-size:12px;padding:7px 9px;border-radius:7px;border:1px solid var(--border);background:var(--bg2);color:var(--text);cursor:pointer;outline:none;font-weight:600;"><option value="자체"'+(_pptMode==='자체'?' selected':'')+'>자체용 템플릿</option><option value="고객사"'+(_pptMode==='고객사'?' selected':'')+'>고객사용 템플릿</option></select><span id="tcppt-scount" style="font-size:11px;color:var(--text3);">'+slideLbl(_pptMode)+'</span></div>'
    +'<div id="tcppt-preview" style="flex:1;overflow-y:auto;padding:18px 22px;background:var(--bg3);">'+renderSlides(_pptMode)+'</div>'
    +'<div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;flex-shrink:0;"><button id="tcppt-cancel" style="font-size:13px;padding:8px 16px;border-radius:7px;border:1px solid var(--border);background:var(--bg2);color:var(--text2);cursor:pointer;font-weight:600;">닫기</button><button id="tcppt-dl" style="font-size:13px;padding:8px 20px;border-radius:7px;border:none;background:#c0392b;color:#fff;cursor:pointer;font-weight:700;"><i class="ti ti-download"></i> PPTX 다운로드</button></div>'
  +'</div>';
  document.body.appendChild(ov);
  const close=()=>{ try{ov.remove();}catch(e){} };
  ov.onclick=e=>{ if(e.target===ov) close(); };
  ov.querySelector('#tcppt-cancel').onclick=close;
  const _tsel=ov.querySelector('#tcppt-tmpl-sel'); if(_tsel) _tsel.onchange=()=>{ _pptMode=_tsel.value; const pv=ov.querySelector('#tcppt-preview'); if(pv) pv.innerHTML=renderSlides(_pptMode); const sc=ov.querySelector('#tcppt-scount'); if(sc) sc.textContent=slideLbl(_pptMode); };
  ov.querySelector('#tcppt-dl').onclick=async()=>{ await _tcPptxGen(tc, steps, _pptMode); };
}
async function _tcPptxGen(tc, steps, mode){
  mode=mode||_pptMode||'자체';
  const _cust=cfV('tc',tc,'고객사')||'';
  showToast('PPTX 생성 중…');
  let Pptx; try{ Pptx=await _loadPptxLib(); }catch(e){ showToast(e.message); return; }
  const F=_TC_PPT_FONT;
  if(mode!=='고객사'){
    const pc=new Pptx(); pc.layout='LAYOUT_WIDE';
    const c1=pc.addSlide(); c1.background={color:'1E2330'};
    c1.addText('시험 진행 체크리스트',{x:0.6,y:1.7,w:12,h:1,fontSize:36,bold:true,color:'FFFFFF',fontFace:F});
    c1.addText((tc.tcid||'')+'   ·   '+(tc.name||''),{x:0.6,y:2.9,w:12,h:0.8,fontSize:20,color:'8FC9FF',fontFace:F});
    c1.addText('Ubiquoss-TOP · '+_nowStr(),{x:0.6,y:6.9,w:12,h:0.4,fontSize:12,color:'9AA3B5',fontFace:F});
    const c2=pc.addSlide(); c2.addText('진행 체크리스트',{x:0.5,y:0.35,w:12,h:0.5,fontSize:22,bold:true,color:'1A2030',fontFace:F});
    const _r=(typeof tcLatestResult==='function')?tcLatestResult(tc.tcid):null; const _rs=(_r&&_r.status&&_r.status!=='UNEXECUTED')?_r.status:'미실행';
    const _sv=(typeof tcSeverity==='function'?tcSeverity(tc):tc.severity)||'-';
    const crows=[[{text:'✓',options:{bold:true,fill:'F4F5F7'}},{text:'TC ID',options:{bold:true,fill:'F4F5F7'}},{text:'시험명',options:{bold:true,fill:'F4F5F7'}},{text:'심각도',options:{bold:true,fill:'F4F5F7'}},{text:'최근결과',options:{bold:true,fill:'F4F5F7'}}]];
    crows.push([{text:'☐'},{text:String(tc.tcid||'')},{text:String(tc.name||'')},{text:String(_sv)},{text:String(_rs)}]);
    c2.addTable(crows,{x:0.4,y:1.0,w:12.5,fontSize:13,valign:'middle',border:{type:'solid',color:'DDDDDD',pt:1},colW:[0.8,3.6,5.3,1.6,1.7],fontFace:F});
    try{ await pc.writeFile({fileName:((tc.tcid||'TC')+'_체크리스트.pptx')}); showToast('✅ PPTX 생성 완료'); }catch(e){ showToast('저장 오류: '+e.message); }
    return;
  }
  const sev=(typeof tcSeverity==='function'?tcSeverity(tc):tc.severity)||'-';
  const st=(typeof tcStatus==='function'?tcStatus(tc):tc.status)||'-';
  const p=new Pptx(); p.layout='LAYOUT_WIDE';
  const s1=p.addSlide(); s1.background={color:'1E2330'};
  s1.addText('시험 항목 명세서',{x:0.6,y:1.7,w:12,h:1,fontSize:36,bold:true,color:'FFFFFF',fontFace:F});
  s1.addText((tc.tcid||'')+'   ·   '+(tc.name||''),{x:0.6,y:2.9,w:12,h:0.8,fontSize:20,color:'8FC9FF',fontFace:F});
  s1.addText(((mode==='고객사')?(_cust?('고객사 : '+_cust):'고객사 제출용'):'Ubiquoss-TOP')+' · '+_nowStr(),{x:0.6,y:6.9,w:12,h:0.4,fontSize:12,color:'9AA3B5',fontFace:F});
  const s2=p.addSlide(); s2.addText('시험 정보',{x:0.5,y:0.35,w:12,h:0.5,fontSize:22,bold:true,color:'1A2030',fontFace:F});
  s2.addText([{text:'시험 목적\n',options:{bold:true,color:'2D6FD4'}},{text:(tc.object||'-')+'\n\n'},{text:'사전조건\n',options:{bold:true,color:'2D6FD4'}},{text:(tc.precondition||'-')+'\n\n'},{text:'심각도/상태\n',options:{bold:true,color:'2D6FD4'}},{text:(sev+' / '+st)}],{x:0.5,y:1.0,w:12.3,h:5.6,fontSize:14,valign:'top',color:'222222',fontFace:F});
  const s3=p.addSlide(); s3.addText('시험 절차 ('+steps.length+' Step)',{x:0.5,y:0.35,w:12,h:0.5,fontSize:22,bold:true,color:'1A2030',fontFace:F});
  const rows=[[{text:'#',options:{bold:true,fill:'F4F5F7'}},{text:'Action',options:{bold:true,fill:'F4F5F7'}},{text:'Test Data',options:{bold:true,fill:'F4F5F7'}},{text:'Expected Result',options:{bold:true,fill:'F4F5F7'}}]];
  steps.slice(0,14).forEach(function(sp,i){ rows.push([{text:String(i+1)},{text:String(sp.action||'CLI')},{text:String(sp.cli||'')},{text:String(sp.criteria||'')}]); });
  s3.addTable(rows,{x:0.4,y:1.0,w:12.5,fontSize:10,valign:'top',border:{type:'solid',color:'DDDDDD',pt:1},colW:[0.6,1.8,6.1,4.0],fontFace:F});
  if(steps.length>14) s3.addText('… 외 '+(steps.length-14)+' Step (전체는 PDF 참조)',{x:0.5,y:6.95,w:12,h:0.3,fontSize:11,color:'999999',fontFace:F});
  try{ await p.writeFile({fileName:((tc.tcid||'TC')+'_명세서.pptx')}); showToast('✅ PPTX 생성 완료'); }catch(e){ showToast('저장 오류: '+e.message); }
}
function cfV(target, obj, label){
  try{ if(typeof customFields==='undefined'||!customFields||!customFields[target]) return ''; const f=customFields[target].find(x=>x.label===label); if(!f) return ''; let v=(obj&&obj.custom_fields&&obj.custom_fields[f.id]); if(Array.isArray(v)) v=v.filter(Boolean).join(', '); return v||''; }catch(e){ return ''; }
}function tcSeverity(tc){ return cfV('tc',tc,'심각도')||tc.severity||''; }
function tcStatus(tc){ return cfV('tc',tc,'상태')||tc.status||''; }
function tcCfFieldsHtml(tc){
  if(typeof customFields==='undefined'||!customFields||!customFields.tc) return '';
  return customFields.tc.filter(f=>f.active!==false&&f.show_pdf!==false).map(f=>{
    let v=tc.custom_fields&&tc.custom_fields[f.id]; if(Array.isArray(v)) v=v.filter(Boolean).join(', ');
    if(v==null||v==='') return '';
    return `<div class="pdf-field"><div class="pdf-field-label">${f.label}</div><div class="pdf-field-value">${v}</div></div>`;
  }).join('');
}function _resColor(v){ return {'Pass':'#00a872','Fail':'#e53e5a','WIP':'#f5b731','Blocked':'#e8820c','진행불가':'#999999'}[v]||'#888'; }
function tcStepLatestResult(tcid, si){
  try{ if(typeof cycleList==='undefined'||!cycleList) return ''; let best='',bestKey='';
    cycleList.forEach(cy=>{ (cy.items||[]).forEach(it=>{ if(it.tcid===tcid){ const s=(it.steps||[])[si]; if(s&&s.result){ const k=String(s.date||cy.created_at||cy.id||''); if(k>=bestKey){ bestKey=k; best=s.result; } } } }); });
    return best;
  }catch(e){ return ''; }
}
function cfPdfRows(target, obj, exclude){
  if(typeof customFields==='undefined'||!customFields||!customFields[target]) return '';
  const fields=(customFields[target]||[]).filter(f=>f.active!==false&&f.show_pdf!==false&&!(exclude&&exclude.indexOf(f.label)>=0));
  const cell=f=>{ let v=obj&&obj.custom_fields&&obj.custom_fields[f.id]; if(Array.isArray(v)) v=v.filter(Boolean).join(', '); return (v==null?'':String(v)); };
  const valued=fields.filter(f=>cell(f)!=='');
  let rows='';
  for(let i=0;i<valued.length;i+=2){ const a=valued[i],b=valued[i+1]; rows+=`<tr><th style="width:110px;">${a.label}</th><td>${cell(a)}</td>${b?`<th style="width:110px;">${b.label}</th><td>${cell(b)}</td>`:'<th></th><td></td>'}</tr>`; }
  return rows;
}
function buildTopo2PdfHtml(tc){
  const t2=(tc.topo2&&Array.isArray(tc.topo2.nodes)&&tc.topo2.nodes.length)?tc.topo2:null;
  if(!t2){
    var _bg=(tc.topo2&&tc.topo2.bgImage)||tc.topo_image;   // nodes 없어도 배경이미지(bgImage)면 구성도로 표시
    return _bg?`<div class="pdf-section" style="margin-bottom:0;"><div class="pdf-section-title">🖼 시험 구성도 (Test Diagram)</div><div style="text-align:center;border:1px solid #d0d5e0;border-radius:6px;padding:6px;background:#fff;"><img src="${_bg}" style="max-width:100%;max-height:210px;height:auto;width:auto;display:inline-block;object-fit:contain;"/></div></div>`:'';
  }
  // 시각 다이어그램 (SVG 도식)
  const ORD=['계측기','L3 스위치','L2 스위치','OLT','ONT','PC/서버','Cloud','기타'];
  const rkF=r=>{const i=ORD.indexOf(r);return i<0?99:i;};
  const NW=152,NH=56,GX=30,GY=60;
  const tierG={}; t2.nodes.forEach(n=>{const k=rkF(n.role);(tierG[k]=tierG[k]||[]).push(n);});
  const tkeys=Object.keys(tierG).map(Number).sort((a,b)=>a-b);
  const autoP={}; tkeys.forEach((k,ti)=>{tierG[k].forEach((n,ci)=>{autoP[n.id]={x:ci*(NW+GX)+16,y:ti*(NH+GY)+16};});});
  const posM={}; let mX=0,mY=0;
  t2.nodes.forEach(n=>{const p=(typeof n.x==='number'&&typeof n.y==='number')?{x:n.x,y:n.y}:autoP[n.id]; posM[n.id]=p; mX=Math.max(mX,p.x+NW); mY=Math.max(mY,p.y+NH);});
  const epF=(cx,cy,hw,hh,tx,ty)=>{const dx=tx-cx,dy=ty-cy;if(!dx&&!dy)return[cx,cy];const sx=dx?hw/Math.abs(dx):1e9,sy=dy?hh/Math.abs(dy):1e9,s=Math.min(sx,sy);return[cx+dx*s,cy+dy*s];};
  let svgLines='';
  (t2.links||[]).forEach(l=>{ const pa=posM[l.a],pb=posM[l.b]; if(!pa||!pb)return; const ax=pa.x+NW/2,ay=pa.y+NH/2,bx=pb.x+NW/2,by=pb.y+NH/2; const e1=epF(ax,ay,NW/2,NH/2,bx,by),e2=epF(bx,by,NW/2,NH/2,ax,ay); const mx=(e1[0]+e2[0])/2,my=(e1[1]+e2[1])/2; const lbl=(l.ap||'')+' ↔ '+(l.bp||''); const w=lbl.length*5.4+10; svgLines+=`<line x1="${e1[0]}" y1="${e1[1]}" x2="${e2[0]}" y2="${e2[1]}" stroke="#2d6fd4" stroke-width="1.4"/><circle cx="${e1[0]}" cy="${e1[1]}" r="2.4" fill="#2d6fd4"/><circle cx="${e2[0]}" cy="${e2[1]}" r="2.4" fill="#2d6fd4"/><rect x="${mx-w/2}" y="${my-7}" width="${w}" height="14" rx="3" fill="#fff" stroke="#2d6fd4" stroke-width="0.6"/><text x="${mx}" y="${my+3.5}" font-size="9" fill="#2d6fd4" text-anchor="middle" font-family="monospace">${lbl}</text>`; });
  let svgBoxes='';
  t2.nodes.forEach((n,i)=>{ const p=posM[n.id],c=(typeof DEVICE_ROLE_COLORS!=='undefined'&&DEVICE_ROLE_COLORS[n.role])||'#888'; svgBoxes+=`<g><rect x="${p.x}" y="${p.y}" width="${NW}" height="${NH}" rx="7" fill="#fff" stroke="${c}" stroke-width="1.5"/><rect x="${p.x}" y="${p.y}" width="${NW}" height="3.5" rx="1.5" fill="${c}"/><rect x="${p.x+6}" y="${p.y+7}" width="22" height="13" rx="3" fill="${c}"/><text x="${p.x+17}" y="${p.y+16.5}" font-size="8.5" font-weight="700" fill="#fff" text-anchor="middle">#${i+1}</text><text x="${p.x+NW/2}" y="${p.y+22}" font-size="10" font-weight="700" fill="#1a1d2e" text-anchor="middle">${(n.model||'').slice(0,18)}</text><text x="${p.x+NW/2}" y="${p.y+34}" font-size="8" fill="#9aa0b8" text-anchor="middle">${(n.role||'')}${n.vendor?' · '+n.vendor:''}</text><text x="${p.x+NW/2}" y="${p.y+48}" font-size="8.5" fill="#2d6fd4" text-anchor="middle" font-family="monospace">${n.ip||''}</text></g>`; });
  const svgDiagram=`<div style="border:1px solid #d0d5e0;border-radius:6px;padding:12px;background:#fafbfd;margin-bottom:10px;"><svg viewBox="0 0 ${mX+16} ${mY+16}" style="width:${mX+16}px;max-width:100%;height:auto;max-height:340px;display:block;margin:0 auto;" xmlns="http://www.w3.org/2000/svg">${svgLines}${svgBoxes}</svg></div>`;
  const devRows=t2.nodes.map((n,i)=>`<tr><td style="text-align:center;font-weight:700;color:#2d6fd4;">#${i+1}</td><td>${n.model||''}</td><td>${n.role||''}</td><td>${n.vendor||''}</td><td style="font-family:monospace;">${n.ip||'-'}</td><td style="text-align:center;">가입 ${(n.sub||[]).length} · 업 ${(n.up||[]).length}</td></tr>`).join('');
  const devTable=`<table class="pdf-table"><tbody><tr><th style="width:36px;">#</th><th>모델</th><th style="width:80px;">역할</th><th style="width:80px;">벤더</th><th style="width:100px;">IP</th><th style="width:120px;">포트</th></tr>${devRows}</tbody></table>`;
  let linkTable='';
  if((t2.links||[]).length){
    const lr=t2.links.map(l=>{ const ia=t2.nodes.findIndex(x=>x.id===l.a),ib=t2.nodes.findIndex(x=>x.id===l.b); const na=t2.nodes[ia],nb=t2.nodes[ib]; return `<tr><td>#${ia+1} ${na?na.model:'?'}</td><td style="font-family:monospace;color:#2d6fd4;text-align:center;">${l.ap}</td><td style="text-align:center;">↔</td><td>#${ib+1} ${nb?nb.model:'?'}</td><td style="font-family:monospace;color:#2d6fd4;text-align:center;">${l.bp}</td></tr>`; }).join('');
    linkTable=`<div style="margin-top:8px;font-size:11px;font-weight:700;color:#2d6fd4;margin-bottom:4px;">🔗 결선표</div><table class="pdf-table"><tbody><tr><th>장비 A</th><th style="width:80px;">포트</th><th style="width:30px;"></th><th>장비 B</th><th style="width:80px;">포트</th></tr>${lr}</tbody></table>`;
  }
  const allLog=[]; t2.nodes.forEach((n,i)=>{ (n.logical||[]).forEach(L=>allLog.push(`#${i+1} ${n.model||''} · <b>${L.name}</b> [${L.type}] = ${(L.members||[]).join(', ')}`)); });
  const logHtml=allLog.length?`<div style="margin-top:8px;font-size:11px;font-weight:700;color:#7c3aed;margin-bottom:4px;">⌥ 로지컬 인터페이스 (LACP/ECMP)</div><div style="font-size:11px;line-height:1.7;border:1px solid #e0d5f5;border-radius:6px;padding:8px 12px;background:#faf8ff;">${allLog.map(x=>'• '+x).join('<br>')}</div>`:'';
  return `<div class="pdf-section"><div class="pdf-section-title">🖼 시험 구성도 (Test Diagram)</div>${svgDiagram}${devTable}${linkTable}${logHtml}</div>`;
}
// ── 고객사(LG U+) 시험 결과서 양식 — TC당 2페이지 (시험 절차 / 시험 결과) ──
function _lguBrandLogo(){ return '<span style="font-family:Arial,Helvetica,sans-serif;font-weight:800;font-size:23px;color:#A50034;letter-spacing:-0.5px;">LG U<span style="color:#E6007E;font-size:15px;vertical-align:super;font-weight:800;">+</span></span>'; }
function _lguMeterText(tc){
  var mc=(tc&&tc.meterCfg)||{}; var tf=(tc&&tc.traffic)||{};
  var streams=(mc.streams||[]).filter(function(s){return s.enabled!==false;});
  var mv=mc.vendor||tf.vendor||tc.meter_vendor||''; var mip=mc.chassis||mc.ip||tf.ip||tc.meter_ip||''; var mdl=mc.model||''; var mp=mc.ports||tf.port||tc.meter_port||'';
  if(!(mv||mip||mdl||mp||streams.length)) return '';
  var head=[]; if(mv||mdl)head.push([mv,mdl].filter(Boolean).join(' ')); if(mip)head.push('IP '+mip); if(mp)head.push('포트 '+mp);
  var lines=head.length?['계측기: '+head.join(' · ')]:[];
  streams.forEach(function(s,i){ lines.push('S'+(i+1)+' '+(s.name||'')+': '+(s.src||'?')+'→'+(s.dst||'?')+' / '+String(s.l4proto||'udp').toUpperCase()+' / '+(s.minByte||'64')+'B / '+(s.load||'')+(s.unit||'')); });
  return lines.join('\n');
}
function buildTCLGUPdfHtml(tc, opts){
  opts=opts||{}; var esc=_tcpEsc; var nl=function(s){ return esc(s).replace(/\r?\n/g,'<br>'); };
  var steps=[];
  if(Array.isArray(tc.checks)&&tc.checks.length){ steps=tc.checks.filter(function(c){var k=c.kind||'cli';return k==='cli'||k==='wait';}).map(function(c){var _w=(c.kind==='wait');return {desc:_w?('대기 '+(parseInt(c.waitSec)||5)+'초'):(c.desc||''),cli:_w?'':(c.cli||''),criteria:c.criteria||'',result:c.repeatResult||c.result||'',output:c.output||'',n2xStats:(Array.isArray(c.n2xStats)&&c.n2xStats.length)?c.n2xStats:null,n2xNames:c.n2xNames||null,n2xElapsed:c.n2xElapsed||0};}); }
  if(!steps.length&&Array.isArray(tc.steps)) steps=tc.steps.map(function(s){return {desc:s.desc||'',cli:s.cli||s.input||'',criteria:s.criteria||s.expected||'',result:s.result||'',output:s.output||''};});
  var req=(typeof reqList!=='undefined'?reqList:[]).find(function(x){return x.id===tc.req_id||x.reqid===tc.req_id;});
  var tcid=cfV('tc',tc,'TC_ID')||tc.tcid||'';
  var reqid=cfV('tc',tc,'REQ ID')||cfV('tc',tc,'REQID')||(req?(req.reqid||req.id||''):'');
  var item=cfV('tc',tc,'시험항목')||tc.name||'';
  var spec=tc.object||tc.precondition||(req?(req.overview||req.title||''):'')||'';
  var topo=(typeof buildTopo2PdfHtml==='function')?buildTopo2PdfHtml(tc):'';
  var meterHtml='';   // 계측기 설정 표시 제거
  var remark=cfV('tc',tc,'비고')||cfV('tc',tc,'특이사항')||'';
  var _mFrom=(opts.methodRange&&opts.methodRange.length)?opts.methodRange[0]:0;
  var _mTo=(opts.methodRange&&opts.methodRange.length)?opts.methodRange[1]:steps.length;
  var methodTxt=steps.length?steps.map(function(s,i){return {s:s,i:i};}).filter(function(x){return x.i>=_mFrom&&x.i<_mTo;}).map(function(x){ return (x.i+1)+'. '+esc(x.s.desc||x.s.cli||'-'); }).join('<br>'):'(시험 절차 없음)';
  var BD='1.4px solid #111'; var YEL='background:#fcfcc6;';
  var th=function(txt,cs){ return '<td colspan="'+(cs||1)+'" style="border:'+BD+';'+YEL+'text-align:center;font-weight:800;padding:5px 6px;font-size:12.5px;">'+txt+'</td>'; };
  var lbl=function(txt,cs){ return '<td colspan="'+(cs||1)+'" style="border:'+BD+';'+YEL+'text-align:center;font-weight:800;padding:5px 4px;font-size:11.5px;line-height:1.25;">'+txt+'</td>'; };
  var val=function(txt,cs,extra){ return '<td colspan="'+(cs||1)+'" style="border:'+BD+';padding:5px 8px;font-size:11.5px;'+(extra||'')+'">'+txt+'</td>'; };
  var colg='<colgroup><col style="width:6%"><col style="width:23%"><col style="width:6%"><col style="width:15%"><col style="width:8%"><col style="width:42%"></colgroup>';   // 방법(1~4열)=50% · 결과(5~6열)=50%
  var headerRow='<tr>'+lbl('TC_ID',1)+val(esc(tcid),1,'font-weight:700;text-align:center;white-space:nowrap;')+lbl('REQ<br>ID',1)+val(esc(reqid),1,'text-align:center;font-weight:700;white-space:nowrap;')+lbl('시험항목',1)+val(esc(item),1,'font-weight:700;')+'</tr>';
  var pageHead=function(ttl){ return '<div style="display:flex;align-items:flex-end;justify-content:space-between;padding:0 6px 2px;"><div style="font-size:24px;font-weight:800;letter-spacing:6px;color:#111;">'+ttl+'</div>'+_lguBrandLogo()+'</div><div style="border-bottom:3px solid #111;"></div><div style="border-bottom:1.4px solid #111;margin-top:2px;margin-bottom:11px;"></div>'; };
  var pageFoot=function(no){ return '<div style="border-bottom:3px solid #111;margin-top:13px;"></div><div style="border-bottom:1.4px solid #111;margin-top:2px;"></div><div style="text-align:right;font-size:11px;color:#111;margin-top:4px;padding-right:4px;">'+(no||'')+'</div>'; };
  // 페이지 1: 시험 절차
  var page1='<table style="width:100%;border-collapse:collapse;border:'+BD+';table-layout:fixed;">'+colg+headerRow
    +'<tr>'+th('시험 규격',4)+th('시험 구성도 및 준비사항',2)+'</tr>'
    +'<tr>'+val((spec?nl(spec):'<span style="color:#9aa0b8;">(미작성)</span>'),4,'vertical-align:top;height:210px;line-height:1.55;overflow:hidden;')+val((topo||'<div style="color:#9aa0b8;text-align:center;padding-top:60px;">(구성도 없음)</div>')+meterHtml,2,'vertical-align:top;overflow:hidden;')+'</tr>'
    +'<tr>'+th('시험 방법',4)+th('시험 결과',2)+'</tr>'
    +'<tr>'+val(methodTxt,4,'vertical-align:top;height:210px;line-height:1.55;overflow:hidden;')+val('<div style="text-align:center;font-weight:700;color:#333;padding-top:80px;">시험 결과 참고 (다음장)</div>',2,'vertical-align:middle;')+'</tr>'
    +'<tr>'+lbl('비고<br>(특이사항)',2)+val((remark?nl(remark):''),4,'height:44px;vertical-align:top;')+'</tr>'
    +'</table>';
  // 페이지 2: 시험 결과 (실제 결과) — opts.resultRange=[from,to)면 그 스텝 범위만(슬라이드 분할용)
  var _rFrom=(opts.resultRange&&opts.resultRange.length)?opts.resultRange[0]:0;
  var _rTo=(opts.resultRange&&opts.resultRange.length)?opts.resultRange[1]:steps.length;
  var _stepsForRes=steps.map(function(s,i){return {s:s,i:i};}).filter(function(x){return x.i>=_rFrom && x.i<_rTo;});
  var resBody=_stepsForRes.length?_stepsForRes.map(function(_x){ var s=_x.s, i=_x.i;
    var rc=(s.result==='Pass'||s.result==='합격')?'#00875a':(s.result==='Fail'||s.result==='불합격')?'#d12d49':'#888';
    // 계측기(N2X) 통계는 표(HTML)로 그대로 표시 — 저장 PPTX도 이 표를 이미지로 캡처하여 폼 일치
    var out=(s.n2xStats&&Array.isArray(s.n2xStats)&&s.n2xStats.length&&typeof _n2xStatsHtml==='function')?_n2xStatsHtml(s.n2xStats,s.n2xNames,s.n2xElapsed,{pdf:true}):((s.output||'').trim()?'<pre style="display:inline-block;max-width:100%;margin:4px 0 0;white-space:pre;overflow-x:auto;font-family:Consolas,monospace;font-size:9px;line-height:1.45;color:#1c2030;background:#f5f6f8;border:1px solid #d8dce3;border-radius:4px;padding:7px 9px;box-sizing:border-box;">'+esc((s.output||'').trim())+'</pre>':'');
    return '<div style="margin-bottom:9px;border-bottom:1px dashed #ccc;padding-bottom:7px;"><div style="font-size:11.5px;font-weight:700;color:#111;">Step '+(i+1)+'. '+esc(s.desc||s.cli||'')+(s.result?(' <span style="color:'+rc+';font-weight:800;">['+esc(s.result)+']</span>'):'')+'</div>'+(s.cli?'<div style="font-family:Consolas,monospace;font-size:10px;color:#00733a;margin-top:2px;">$ '+esc(s.cli)+'</div>':'')+out+'</div>';
  }).join(''):'<div style="color:#9aa0b8;text-align:center;padding-top:60px;">시험 결과 데이터 없음 — 시험 실행 후 출력</div>';
  var page2='<table style="width:100%;border-collapse:collapse;border:'+BD+';table-layout:fixed;">'+colg+headerRow
    +'<tr>'+th('시험 결과',6)+'</tr>'
    +'<tr>'+val(resBody,6,'vertical-align:top;height:470px;max-height:470px;overflow:hidden;')+'</tr>'
    +'<tr>'+lbl('비고<br>(특이사항)',2)+val((remark?nl(remark):''),4,'height:44px;vertical-align:top;')+'</tr>'
    +'</table>';
  var W="font-family:'Malgun Gothic','맑은 고딕',sans-serif;color:#111;";
  var pg1Html='<div style="'+W+'">'+pageHead('시험 절차')+page1+pageFoot(opts.p1||'')+'</div>';
  var pg2Html='<div style="'+W+'">'+pageHead('시험 결과')+page2+pageFoot(opts.p2||'')+'</div>';
  if(opts.only==='page1') return pg1Html;
  if(opts.only==='page2') return pg2Html;
  return pg1Html+'<div class="pdf-page-break"></div>'+pg2Html;
}
function buildTCPdfHtml(tc,withCover,opts){
  const now=new Date().toLocaleDateString('ko-KR');
  const _mode=(opts&&opts.mode)||'자체';
  const _cust=(opts&&opts.customer)||cfV('tc',tc,'고객사')||'';
  if(_mode==='고객사' && typeof buildTCLGUPdfHtml==='function') return buildTCLGUPdfHtml(tc,{customer:_cust});
  let steps=[];
  if(Array.isArray(tc.checks) && tc.checks.length){ steps=tc.checks.filter(c=>(c.kind||'cli')==='cli').map(c=>({desc:c.desc||'',cli:c.cli||'',criteria:c.criteria||'',result:c.repeatResult||c.result||'',device:(c.model&&c.model!=='공통')?c.model:'',overrides:c.overrides||[],output:c.output||'',executed_at:c.executed_at||'',n2xStats:(Array.isArray(c.n2xStats)&&c.n2xStats.length)?c.n2xStats:null,n2xNames:c.n2xNames||null,n2xElapsed:c.n2xElapsed||0})); }
  if(!steps.length) steps=tc.steps||[];
  const stepsTable=steps.length
    ? steps.map((s,i)=>{const ov=(s.overrides||[]).filter(o=>o.model);const ovHtml=ov.length?`<tr><th>모델별</th><td style="white-space:pre-wrap;">${ov.map(o=>`<div style="margin-bottom:2px;white-space:pre-wrap;"><b style="color:#7c3aed;">${o.model}</b> ${o.cli?`<span style="font-family:monospace;color:#00a872;">${o.cli}</span>`:'<span style="color:#aaa;">(기본 CLI)</span>'}${o.criteria?` → ${o.criteria}`:''}</div>`).join('')}</td></tr>`:'';return `<div class="pdf-step"><div class="pdf-step-no" style="display:flex;align-items:center;gap:6px;">Step ${i+1}${s.device?` <span style="font-weight:400;color:#9aa0b8;">· ${s.device}</span>`:''}${(()=>{const rv=s.result||tcStepLatestResult(tc.tcid,i);return rv?`<span style="margin-left:auto;font-size:10px;font-weight:700;color:#fff;background:${_resColor(rv)};padding:2px 11px;border-radius:4px;">${rv}</span>`:'';})()}</div><table class="pdf-step-table"><tbody>${s.desc?`<tr><th>절차 설명</th><td style="white-space:pre-wrap;">${s.desc}</td></tr>`:''}${s.intent?`<tr><th>판정 의도</th><td style="white-space:pre-wrap;">${s.intent}</td></tr>`:''}<tr><th>CLI</th><td style="font-family:monospace;font-size:10px;color:#00a872;white-space:pre-wrap;">${s.cli||s.input||'-'}</td></tr><tr><th>기대결과 / 판정기준</th><td style="white-space:pre-wrap;">${s.criteria||s.expected||'-'}</td></tr><tr><th>결과</th><td>${(()=>{const rv=s.result||tcStepLatestResult(tc.tcid,i);return rv?`<span style="font-weight:800;color:${_resColor(rv)};">${rv}</span>`:'<span style="color:#9aa0b8;">미실행</span>';})()}</td></tr>${(s.n2xStats&&typeof _n2xStatsHtml==='function'?`<tr><th>측정 결과<br><span style="font-weight:400;font-size:9px;color:#9aa0b8;">N2X</span></th><td>${_n2xStatsHtml(s.n2xStats,s.n2xNames,s.n2xElapsed,{pdf:true})}</td></tr>`:((s.output||'').trim()?`<tr><th>실행 결과<br><span style="font-weight:400;font-size:9px;color:#9aa0b8;">Response</span></th><td><pre style="margin:0;white-space:pre-wrap;word-break:break-word;font-family:Consolas,monospace;font-size:8px;line-height:1.5;color:#2a2f3e;background:#fafbfc;border:1px solid #e6e9f0;border-radius:4px;padding:6px 8px;">${_tcpEsc((s.output||'').trim())}</pre></td></tr>`:''))}${ovHtml}</tbody></table></div>`;}).join('')
    : '<span style="color:#9aa0b8;">절차 없음</span>';
  const stepChecklist=steps.length?`<table class="pdf-table" style="margin-bottom:10px;"><thead><tr><th style="width:30px;text-align:center;">✓</th><th style="width:30px;text-align:center;">#</th><th>절차 항목</th></tr></thead><tbody>${steps.map((s,i)=>`<tr><td style="text-align:center;"><span style="display:inline-block;width:12px;height:12px;border:1.5px solid #9aa0b8;border-radius:3px;vertical-align:middle;"></span></td><td style="text-align:center;color:#9aa0b8;">${i+1}</td><td>${s.desc||s.cli||s.input||'-'}</td></tr>`).join('')}</tbody></table>`:'';
  const _tcIssues=tc.issue_list||tc.issues||[];
  const jiraHtml=_tcIssues.length?`<div class="pdf-section"><div class="pdf-section-title">🪲 연결된 JIRA 이슈 (${_tcIssues.length})</div><table class="pdf-table"><thead><tr><th style="width:130px;">이슈 키</th><th>요약</th><th style="width:70px;text-align:center;">유형</th><th style="width:70px;text-align:center;">상태</th></tr></thead><tbody>${_tcIssues.map(iss=>`<tr><td style="font-family:monospace;color:#2684ff;font-weight:700;">${iss.key||''}</td><td>${iss.summary||''}</td><td style="text-align:center;">${iss.issue_type||iss.type||'-'}</td><td style="text-align:center;">${iss.status||'-'}</td></tr>`).join('')}</tbody></table></div>`:'';
  const cover=withCover
    ? `<div class="pdf-cover"><div class="pdf-logo">${_docBrand(_mode,_cust)}</div><div class="pdf-title">시험 항목 명세서</div><div style="font-size:12px;color:#9aa0b8;margin-top:6px;">(${tc.tcid})${tc.name?` &nbsp;·&nbsp; ${tc.name}`:''}</div></div>`
    : `<div style="margin-bottom:16px;padding-bottom:10px;border-bottom:2px solid #2d6fd4;"><div style="font-family:monospace;font-size:13px;font-weight:800;color:#2d6fd4;">${tc.tcid}</div><div style="font-size:16px;font-weight:700;color:#1a1d2e;margin:4px 0;">${tc.name||''}</div><div style="display:flex;gap:8px;">${(cfV('tc',tc,'타입')||tc.type)?`<span class="pdf-badge approved">${cfV('tc',tc,'타입')||tc.type}</span>`:''}<span style="font-size:10px;color:#9aa0b8;">절차 ${steps.length}개</span></div></div>`;
  // Traffic Generator (샤시/트래픽) — tc.traffic(탭형 뷰) 우선, tc.meter_*(구버전) 폴백
  const tf=tc.traffic||{};
  const tg={
    vendor: tf.vendor||tc.meter_vendor||'',
    ip:     tf.ip||tc.meter_ip||'',
    port:   tf.port||tc.meter_port||'',
    src_mac:tf.src_mac||tc.meter_src_mac||'',
    dst_mac:tf.dst_mac||tc.meter_dst_mac||'',
    src_ip: tf.src_ip||tc.meter_src_ip||'',
    dst_ip: tf.dst_ip||tc.meter_dst_ip||'',
    gateway:tf.gateway||tc.meter_gw||'',
  };
  const hasTG=Object.values(tg).some(v=>v);
  const tgHtml=`<div class="pdf-section"><div class="pdf-section-title">🚦 Traffic Generator</div><table class="pdf-table"><tbody><tr><th colspan="6" style="background:#eef2fb;color:#2d6fd4;">샤시</th></tr><tr><th style="width:90px;">Vendor</th><td>${tg.vendor||'-'}</td><th style="width:90px;">IP Address</th><td style="font-family:monospace;">${tg.ip||'-'}</td><th style="width:90px;">Port Reserved</th><td>${tg.port||'-'}</td></tr><tr><th colspan="6" style="background:#eef2fb;color:#2d6fd4;">트래픽</th></tr><tr><th>Src Mac</th><td style="font-family:monospace;">${tg.src_mac||'-'}</td><th>Dst Mac</th><td colspan="3" style="font-family:monospace;">${tg.dst_mac||'-'}</td></tr><tr><th>Src IP</th><td style="font-family:monospace;">${tg.src_ip||'-'}</td><th>Dst IP</th><td style="font-family:monospace;">${tg.dst_ip||'-'}</td><th>Gateway IP</th><td style="font-family:monospace;">${tg.gateway||'-'}</td></tr></tbody></table></div>`;
  return `${cover}<div class="pdf-section"><div class="pdf-section-title">📋 기본 정보</div><table class="pdf-table"><tbody><tr><th style="width:110px;">시험 항목<br><span style="font-weight:400;font-size:9px;color:#9aa0b8;">Test Summary</span></th><td colspan="3" style="font-weight:700;">${tc.name||'-'}</td></tr><tr><th style="width:110px;">TC ID</th><td>${tc.tcid}</td><th style="width:110px;">타입</th><td>${cfV('tc',tc,'타입')||tc.type||'-'}</td></tr>${cfPdfRows('tc', tc, ['타입'])}</tbody></table></div>${tc.overview?`<div class="pdf-section"><div class="pdf-section-title">📝 개요</div><div style="padding:10px 12px;border:1px solid #d0d5e0;border-radius:6px;white-space:pre-wrap;font-size:11px;line-height:1.7;">${tc.overview}</div></div>`:''}<div class="pdf-section"><div class="pdf-section-title">🎯 목적 (Object)</div><div style="padding:10px 12px;border:1px solid #d0d5e0;border-radius:6px;font-size:11px;line-height:1.7;">${tc.object_html||tc.object||'<span style="color:#9aa0b8;">(미작성)</span>'}</div></div>${(tc.precondition_html||tc.precondition)?`<div class="pdf-section"><div class="pdf-section-title">📋 사전 준비 조건 (Pre-Condition)</div><div style="padding:10px 12px;border:1px solid #d0d5e0;border-radius:6px;font-size:11px;line-height:1.7;">${tc.precondition_html||tc.precondition}</div></div>`:''}${buildTopo2PdfHtml(tc)}${tgHtml}<div class="pdf-section"><div class="pdf-section-title">📋 시험 절차 (${steps.length}개)</div>${stepChecklist}${stepsTable}</div>${jiraHtml}`;
}function exportFolderPDF(folderId){
  const folder=reqFolders.find(f=>f.id===folderId);
  const reqs=reqList.filter(r=>r.folder===folderId);
  if(!reqs.length){showToast('폴더에 REQ가 없습니다');return;}
  const now=new Date().toLocaleDateString('ko-KR');
  const cust=_commonCustomer(reqs,'req');
  const allTcs=[]; reqs.forEach(r=>{ tcList.filter(t=>t.req_id===r.id||t.req_id===r.reqid).forEach(t=>allTcs.push(t)); });
  const build=m=>{ let html=`<div class="pdf-cover"><div class="pdf-logo">${_docBrand(m,cust)}</div><div class="pdf-title">${folder?.name||'폴더'} 요구사항 명세서</div><div class="pdf-meta"><span class="pdf-badge approved">REQ ${reqs.length}개</span><span style="font-size:11px;color:#9aa0b8;">출력일: ${now}</span></div></div>`;
    reqs.forEach((r,idx)=>{
      const tcs=tcList.filter(t=>t.req_id===r.id||t.req_id===r.reqid);
      let scs=[];
      try{scs=JSON.parse(r.scenarios||'[]');if(!Array.isArray(scs))scs=[];}catch(e){}
      if(idx>0) html+='<div class="pdf-page-break"></div>';
      html+=buildReqPdfHtml(r,tcs,scs,false);
    });
    if(m!=='고객사') html+=_checklistSection(allTcs);
    return html; };
  pdfPreview(build(_pdfMode), (folder?.name||'폴더')+' 요구사항 명세서', build);
}
function buildReqPdfHtml(r,tcs,scs,withCover,opts){
  const _mode=(opts&&opts.mode)||'자체';
  const _cust=(opts&&opts.customer)||cfV('req',r,'고객사')||'';
  const prioBadge=p=>p==='MUST'?'must':p==='SHOULD'?'should':'may';
  const statBadge=s=>s==='APPROVED'?'approved':'draft';
  const now=new Date().toLocaleDateString('ko-KR');
  const tcStepsHtml=tc=>{
    let steps=[];
    if(Array.isArray(tc.checks) && tc.checks.length){ steps=tc.checks.filter(c=>(c.kind||'cli')==='cli').map(c=>({desc:c.desc||'',cli:c.cli||'',criteria:c.criteria||'',result:c.repeatResult||c.result||'',device:(c.model&&c.model!=='공통')?c.model:'',overrides:c.overrides||[],output:c.output||'',executed_at:c.executed_at||'',n2xStats:(Array.isArray(c.n2xStats)&&c.n2xStats.length)?c.n2xStats:null,n2xNames:c.n2xNames||null,n2xElapsed:c.n2xElapsed||0})); }
    if(!steps.length) steps=tc.steps||[];
    if(!steps.length) return '<span style="color:#9aa0b8;">절차 없음</span>';
    return steps.map((s,i)=>{const ov=(s.overrides||[]).filter(o=>o.model);const ovHtml=ov.length?`<tr><th>모델별</th><td style="white-space:pre-wrap;">${ov.map(o=>`<div style="margin-bottom:2px;white-space:pre-wrap;"><b style="color:#7c3aed;">${o.model}</b> ${o.cli?`<span style="font-family:monospace;color:#00a872;">${o.cli}</span>`:'<span style="color:#aaa;">(기본 CLI)</span>'}${o.criteria?` → ${o.criteria}`:''}</div>`).join('')}</td></tr>`:'';return `<div class="pdf-step"><div class="pdf-step-no" style="display:flex;align-items:center;gap:6px;">Step ${i+1}${s.device?` <span style="font-weight:400;color:#9aa0b8;">· ${s.device}</span>`:''}${(()=>{const rv=s.result||tcStepLatestResult(tc.tcid,i);return rv?`<span style="margin-left:auto;font-size:10px;font-weight:700;color:#fff;background:${_resColor(rv)};padding:2px 11px;border-radius:4px;">${rv}</span>`:'';})()}</div><table class="pdf-step-table"><tbody>${s.desc?`<tr><th>절차 설명</th><td style="white-space:pre-wrap;">${s.desc}</td></tr>`:''}${s.intent?`<tr><th>판정 의도</th><td style="white-space:pre-wrap;">${s.intent}</td></tr>`:''}<tr><th>CLI</th><td style="font-family:monospace;font-size:10px;color:#00a872;white-space:pre-wrap;">${s.cli||s.input||'-'}</td></tr><tr><th>기대결과 / 판정기준</th><td style="white-space:pre-wrap;">${s.criteria||s.expected||'-'}</td></tr><tr><th>결과</th><td>${(()=>{const rv=s.result||tcStepLatestResult(tc.tcid,i);return rv?`<span style="font-weight:800;color:${_resColor(rv)};">${rv}</span>`:'<span style="color:#9aa0b8;">미실행</span>';})()}</td></tr>${(s.n2xStats&&typeof _n2xStatsHtml==='function'?`<tr><th>측정 결과<br><span style="font-weight:400;font-size:9px;color:#9aa0b8;">N2X</span></th><td>${_n2xStatsHtml(s.n2xStats,s.n2xNames,s.n2xElapsed,{pdf:true})}</td></tr>`:((s.output||'').trim()?`<tr><th>실행 결과<br><span style="font-weight:400;font-size:9px;color:#9aa0b8;">Response</span></th><td><pre style="margin:0;white-space:pre-wrap;word-break:break-word;font-family:Consolas,monospace;font-size:8px;line-height:1.5;color:#2a2f3e;background:#fafbfc;border:1px solid #e6e9f0;border-radius:4px;padding:6px 8px;">${_tcpEsc((s.output||'').trim())}</pre></td></tr>`:''))}${ovHtml}</tbody></table></div>`;}).join('');
  };
  const tcHtml=tcs.length?tcs.map(tc=>`<div class="pdf-tc-block"><div class="pdf-tc-head"><span style="font-family:monospace;font-size:12px;font-weight:800;color:#2d6fd4;">${tc.tcid}</span><span style="font-size:12px;font-weight:600;flex:1;">${tc.name||''}</span>${tcSeverity(tc)?`<span class="pdf-badge ${(tcSeverity(tc)==='Critical'||tcSeverity(tc)==='Blocker')?'must':tcSeverity(tc)==='Major'?'should':'may'}">${tcSeverity(tc)}</span>`:''}</div><div class="pdf-tc-body">${tcCfFieldsHtml(tc)}${tc.overview?`<div class="pdf-field"><div class="pdf-field-label">개요</div><div class="pdf-field-value">${tc.overview}</div></div>`:''} ${(tc.object_html||tc.object)?`<div class="pdf-field"><div class="pdf-field-label">목적</div><div class="pdf-field-value">${tc.object_html||tc.object}</div></div>`:''}${(tc.precondition_html||tc.precondition)?`<div class="pdf-field"><div class="pdf-field-label">사전 준비 조건</div><div class="pdf-field-value">${tc.precondition_html||tc.precondition}</div></div>`:''}<div class="pdf-field pdf-field-block"><div class="pdf-field-label">📋 시험 절차</div><div class="pdf-field-value">${tcStepsHtml(tc)}</div></div></div></div>`).join(''):'<div style="color:#9aa0b8;padding:12px;">연결된 TC 없음</div>';
  const coverHtml=withCover?`<div class="pdf-cover"><div class="pdf-logo">${_docBrand(_mode,_cust)}</div><div class="pdf-title">요구사항 명세서</div><div style="font-size:12px;color:#9aa0b8;margin-top:6px;">(${r.reqid})${r.title?` &nbsp;·&nbsp; ${r.title}`:''}</div></div>`:`<div style="margin-bottom:16px;padding-bottom:10px;border-bottom:2px solid #2d6fd4;"><div style="font-family:monospace;font-size:13px;font-weight:800;color:#2d6fd4;">${r.reqid}</div><div style="font-size:16px;font-weight:700;color:#1a1d2e;margin:4px 0;">${r.title||''}</div><div style="display:flex;gap:8px;">${cfV('req',r,'우선순위')?`<span class="pdf-badge should">${cfV('req',r,'우선순위')}</span>`:''}${cfV('req',r,'상태')?`<span class="pdf-badge approved">${cfV('req',r,'상태')}</span>`:''}<span style="font-size:10px;color:#9aa0b8;">TC ${tcs.length}개</span></div></div>`;
  return `${coverHtml}<div class="pdf-section"><div class="pdf-section-title">📋 기본 정보</div><table class="pdf-table"><tbody><tr><th style="width:110px;">생성일</th><td>${r.created_at?new Date(r.created_at).toLocaleDateString('ko-KR'):'-'}</td><th style="width:110px;">수정일</th><td>${r.updated_at?new Date(r.updated_at).toLocaleDateString('ko-KR'):'-'}</td></tr><tr><th style="width:110px;">우선순위</th><td>${r.priority||'-'}</td><th style="width:110px;">상태</th><td>${r.status||'-'}</td></tr><tr><th>Confluence</th><td colspan="3" style="font-size:11px;color:#2d6fd4;">${r.confluence||'-'}</td></tr>${cfPdfRows('req', r, ['우선순위','상태'])}</tbody></table></div>${r.overview?`<div class="pdf-section"><div class="pdf-section-title">📝 개요</div><div style="padding:10px 12px;border:1px solid #d0d5e0;border-radius:6px;white-space:pre-wrap;font-size:11px;line-height:1.7;">${r.overview}</div></div>`:''}${tcs.length?`<div class="pdf-section"><div class="pdf-section-title">🧪 시험 항목 (${tcs.length}개)</div><table class="pdf-table"><thead><tr><th style="width:190px;">TC ID</th><th>시험명</th><th style="width:70px;text-align:center;">심각도</th><th style="width:80px;text-align:center;">상태</th></tr></thead><tbody>${tcs.map(tc=>`<tr><td style="font-family:monospace;font-weight:700;color:#2d6fd4;font-size:10px;">${tc.tcid}</td><td>${tc.name||''}</td><td style="text-align:center;">${tcSeverity(tc)||'-'}</td><td style="text-align:center;">${tcStatus(tc)||'-'}</td></tr>`).join('')}</tbody></table></div>`:''}<div class="pdf-section"><div class="pdf-section-title">📋 시험 절차 (${tcs.length}개)</div>${tcHtml}</div>`;
}


// ── TM 다중선택 삭제 ──
function tmToggleREQSel(id, checked){
  if(checked) tmSelReqIds.add(id);
  else tmSelReqIds.delete(id);
  const bar=document.getElementById('tm-req-bulk-bar');
  const cnt=document.getElementById('tm-req-sel-count');
  if(bar) bar.style.display=tmSelReqIds.size>0?'flex':'none';
  if(cnt) cnt.textContent=tmSelReqIds.size+'개 선택됨';
}
function tmToggleTCSel(id, checked){
  if(checked) tmSelTcIds.add(id);
  else tmSelTcIds.delete(id);
  const bar=document.getElementById('tm-tc-bulk-bar');
  const cnt=document.getElementById('tm-tc-sel-count');
  if(bar) bar.style.display=tmSelTcIds.size>0?'flex':'none';
  if(cnt) cnt.textContent=tmSelTcIds.size+'개 선택됨';
}// ══════════════ AI 학습 데이터 (메뉴얼) ══════════════
let manualList=[];
let _manualImgMode=(function(){try{return localStorage.getItem('utop_manualImgMode')||'off';}catch(e){return 'off';}})(); // 문서 속 이미지 처리: 'off' | 'ocr' | 'vision' (localStorage 영구저장)
function _pickVisionLLM(){
  const sel=document.getElementById('chat-model-select')?(document.getElementById('chat-model-select').value):'';
  const L=(typeof llmList!=='undefined'?llmList:[]);
  return L.find(x=>x.id===sel&&x.type!=='claude')||L.find(x=>x.status==='active'&&(x.uses||[]).includes('chat')&&x.type!=='claude')||L.find(x=>x.status==='active'&&x.type!=='claude')||null;
}
function _blobToDataUrl(blob){ return new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=rej; fr.readAsDataURL(blob); }); }
async function _toDataUrl(input){ if(input&&input.tagName==='CANVAS') return input.toDataURL('image/png'); return await _blobToDataUrl(input); }
async function _visionExtractBlob(input){
  const llm=_pickVisionLLM();
  if(!llm) throw new Error('비전 LLM 없음 (AI 채팅에서 비전 모델 gemma를 선택하거나 LLM 설정에서 활성화하세요)');
  const url=await _toDataUrl(input);
  const prompt='이 이미지에 있는 모든 텍스트를 빠짐없이 그대로 추출하세요. CLI 명령어·출력 결과·표·설정 값을 원문 그대로(번역·요약·설명 없이) 텍스트만 출력하세요. 글자가 없으면 아무것도 쓰지 마세요.';
  // OpenAI 호환 비전 포맷 (LM Studio·llama.cpp·Ollama /v1 등)
  const payload={endpoint:llm.endpoint,model:llm.model,max_tokens:llm.max_tokens||2048,context_size:llm.context_size||262144,temperature:0.1,apikey:llm.apikey||'',messages:[{role:'user',content:[{type:'text',text:prompt},{type:'image_url',image_url:{url:url}}]}]};
  console.log('[비전] 모델:',llm.name,'/ endpoint:',llm.endpoint,'/ 이미지 base64',Math.round(url.length/1024)+'KB');
  const r=await fetch('/api/chat/local',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(!r.ok) throw new Error('서버 응답 실패('+r.status+')');
  const reply=String((await r.json()).reply||'').trim();
  console.log('[비전] 응답:',reply.slice(0,400));
  if(/^\[로컬 LLM 오류\]/.test(reply)) throw new Error('모델("'+llm.name+'") 비전 오류: '+reply.slice(0,400));
  return reply;
}
let _visionWarned=false;
async function _imgExtractBlob(input){
  if(_manualImgMode==='vision'){
    try{ return await _visionExtractBlob(input); }
    catch(e){
      console.warn('[비전] 실패:', e&&e.message);
      if(!_visionWarned){ _visionWarned=true; alert('AI 비전 이미지 인식 실패\n\n사유: '+((e&&e.message)||e)+'\n\n확인하세요:\n• AI 채팅 상단에서 비전 모델(gemma)을 선택했는지\n• 그 모델이 멀티모달(이미지 입력) 지원인지\n• 서버 엔드포인트가 OpenAI 호환(/v1)인지\n\n(이번 이미지는 OCR로 대체합니다)'); }
      return await _ocrImage(input);
    }
  }
  return await _ocrImage(input);
}
async function loadManuals(){ try{ const r=await fetch('/api/manuals'); manualList=(await r.json()).manuals||[]; }catch(e){ manualList=[]; } }
async function _extractPdfText(arrayBuffer){
  if(!window.pdfjsLib) throw new Error('PDF 라이브러리 로딩 중');
  try{ pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'; }catch(e){}
  const pdf=await pdfjsLib.getDocument({data:arrayBuffer}).promise;
  let text='';
  for(let i=1;i<=pdf.numPages;i++){ const page=await pdf.getPage(i); const c=await page.getTextContent(); text+=c.items.map(it=>it.str).join(' ')+'\n\n'; }
  return text.trim();
}
// ── OCR(이미지→텍스트) ──
let _ocrWorker=null, _ocrWorkerPromise=null;
function _ocrProg(msg){
  let el=document.getElementById('ocr-prog');
  if(!msg){ if(el) el.remove(); return; }
  if(!el){ el=document.createElement('div'); el.id='ocr-prog'; el.style.cssText='position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:11800;background:#1a1a1a;color:#fff;padding:9px 18px;border-radius:20px;font-size:13px;font-weight:600;box-shadow:0 6px 20px rgba(0,0,0,0.35);'; document.body.appendChild(el); }
  el.innerHTML='<i class="ti ti-loader-2" style="display:inline-block;animation:tcspin 0.9s linear infinite;margin-right:7px;"></i>'+msg;
}
async function _getOcr(){
  if(_ocrWorker) return _ocrWorker;
  if(typeof Tesseract==='undefined') throw new Error('OCR 라이브러리 로딩 중입니다. 잠시 후 다시 시도하세요.');
  if(!_ocrWorkerPromise){ _ocrProg('OCR 엔진 준비 중… (최초 1회 한국어 데이터 다운로드)'); _ocrWorkerPromise=Tesseract.createWorker('kor+eng'); }
  _ocrWorker=await _ocrWorkerPromise;
  return _ocrWorker;
}
async function _ocrImage(img){ try{ const w=await _getOcr(); const r=await w.recognize(img); return ((r&&r.data&&r.data.text)||'').trim(); }catch(e){ return ''; } }
async function _zipMediaBlobs(arrayBuffer){
  if(typeof JSZip==='undefined') return [];
  try{
    const zip=await JSZip.loadAsync(arrayBuffer);
    const names=Object.keys(zip.files).filter(n=>/\/media\/[^/]+\.(png|jpe?g|bmp|gif|webp|tiff?)$/i.test(n));
    const out=[];
    for(const n of names){
      try{ const b=await zip.files[n].async('blob'); if(b && b.size>=12000) out.push(b); }catch(e){} // 작은 이미지(아이콘·로고·불릿) 제외
      if(out.length>=40) break;
    }
    return out;
  }catch(e){ return []; }
}
function _blobToB64Resized(blob, maxW){
  return new Promise(function(res){
    try{ var fr=new FileReader(); fr.onload=function(){ var img=new Image(); img.onload=function(){ var w=img.width,h=img.height; var sc=Math.min((maxW||900)/w,1); var cw=Math.max(1,Math.round(w*sc)),ch=Math.max(1,Math.round(h*sc)); var cv=document.createElement('canvas'); cv.width=cw;cv.height=ch; cv.getContext('2d').drawImage(img,0,0,cw,ch); try{res(cv.toDataURL('image/jpeg',0.8));}catch(e){res('');} }; img.onerror=function(){res('');}; img.src=fr.result; }; fr.onerror=function(){res('');}; fr.readAsDataURL(blob); }catch(e){res('');}
  });
}
// 이미지 블롭들: base64 저장(표시용) + [[IMG:n]] 마커 + (모드 켜짐 시) OCR/비전 텍스트
async function _processImages(blobs, label){
  if(!blobs||!blobs.length) return '';
  window._mImgCollect=window._mImgCollect||[];
  var doOcr=(_manualImgMode!=='off'); var tag=_manualImgMode==='vision'?'AI비전':'OCR'; var t='';
  for(var i=0;i<blobs.length;i++){
    if(window._mImgCollect.length>=40) break;   // 문서당 이미지 상한
    var b=blobs[i]; var idx=window._mImgCollect.length;
    try{ var b64=await _blobToB64Resized(b,900); if(b64){ window._mImgCollect.push(b64); t+='\n[[IMG:'+idx+']]\n'; } }catch(e){}
    if(doOcr){ _ocrProg((label||'이미지')+' '+tag+' '+(i+1)+'/'+blobs.length+'…'); try{ var r=await _imgExtractBlob(b); if(r) t+='[이미지 인식] '+r+'\n'; }catch(e){} }
  }
  return t;
}
function _xmlText(s){ return String(s||'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#10;/g,'\n'); }
async function _extractDocx(file){
  const buf=await file.arrayBuffer();
  let text=((await mammoth.extractRawText({arrayBuffer:buf})).value||'').trim();
  text+=await _processImages(await _zipMediaBlobs(buf),'문서 이미지');   // 항상 이미지 저장(표시), OCR은 모드 켜짐 시
  return text.trim();
}
async function _extractPptx(file){
  if(typeof JSZip==='undefined') throw new Error('압축 해제 라이브러리 로딩 중입니다.');
  const buf=await file.arrayBuffer();
  const zip=await JSZip.loadAsync(buf);
  const slides=Object.keys(zip.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/i.test(n)).sort((a,b)=>(+a.match(/(\d+)/)[1])-(+b.match(/(\d+)/)[1]));
  let text='';
  for(let s=0;s<slides.length;s++){
    const xml=await zip.files[slides[s]].async('text');
    const m=xml.match(/<a:t>([\s\S]*?)<\/a:t>/g)||[];
    const st=m.map(x=>_xmlText(x.replace(/<[^>]+>/g,''))).join(' ').replace(/\s+/g,' ').trim();
    if(st) text+='\n[슬라이드 '+(s+1)+'] '+st+'\n';
  }
  const notes=Object.keys(zip.files).filter(n=>/^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(n));
  for(const n of notes){ const xml=await zip.files[n].async('text'); const m=xml.match(/<a:t>([\s\S]*?)<\/a:t>/g)||[]; const tt=m.map(x=>_xmlText(x.replace(/<[^>]+>/g,''))).join(' ').trim(); if(tt) text+='\n[노트] '+tt+'\n'; }
  text+=await _processImages(await _zipMediaBlobs(buf),'슬라이드 이미지');
  return text.trim();
}
async function _extractPdf(file){
  const buf=await file.arrayBuffer();
  let text='';
  try{ text=await _extractPdfText(new Uint8Array(buf).slice().buffer); }catch(e){}
  if(_manualImgMode!=='off' && text.replace(/\s/g,'').length<40 && window.pdfjsLib){
    try{
      const pdf=await pdfjsLib.getDocument({data:new Uint8Array(buf)}).promise;
      const n=Math.min(pdf.numPages,30);
      for(let i=1;i<=n;i++){ _ocrProg('PDF 페이지 '+(_manualImgMode==='vision'?'AI비전':'OCR')+' '+i+'/'+n+'…'); const page=await pdf.getPage(i); const vp=page.getViewport({scale:2}); const cv=document.createElement('canvas'); cv.width=vp.width; cv.height=vp.height; await page.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;
        window._mImgCollect=window._mImgCollect||[]; if(window._mImgCollect.length<40){ try{ window._mImgCollect.push(cv.toDataURL('image/jpeg',0.7)); text+='\n[[IMG:'+(window._mImgCollect.length-1)+']]\n'; }catch(e){} }
        const r=await _imgExtractBlob(cv); if(r) text+='\n'+r+'\n'; }
    }catch(e){}
  }
  return text.trim();
}
async function manualUpload(inp){
  const files=inp&&inp.files; if(!files||!files.length) return; const arr=[].slice.call(files); inp.value='';
  const IMG=['png','jpg','jpeg','webp','bmp','gif','tif','tiff'];
  for(const file of arr){
    const ext=(file.name.split('.').pop()||'').toLowerCase();
    try{
      let text='', source='';
      window._mImgCollect=[];   // 이 파일의 이미지 수집 초기화
      _ocrProg(null);
      if(typeof showToast==='function') showToast('⏳ '+file.name+' 처리 중…');
      if(ext==='docx'){ if(typeof mammoth==='undefined'){ alert('문서 변환 라이브러리 로딩 중입니다.'); continue; } text=await _extractDocx(file); source='Word'; }
      else if(ext==='pdf'){ text=await _extractPdf(file); source='PDF'; }
      else if(ext==='pptx'){ text=await _extractPptx(file); source='PPT'; }
      else if(ext==='ppt'||ext==='doc'){ alert(file.name+': 구버전(.ppt/.doc)은 .pptx/.docx로 저장 후 업로드하세요.'); continue; }
      else if(ext==='txt'||ext==='md'){ text=(await file.text()).trim(); source='Text'; }
      else if(IMG.includes(ext)){ _ocrProg(file.name+' '+(_manualImgMode==='vision'?'AI비전 인식':'OCR')+'…'); text=await _imgExtractBlob(file); source='Image'; try{ var _ib=await _blobToB64Resized(file,1000); if(_ib){ window._mImgCollect.push(_ib); text=(text||'')+'\n[[IMG:0]]\n'; } }catch(e){} }
      else { alert(file.name+': 지원하지 않는 형식입니다 (.docx/.pdf/.pptx/.txt/.png/.jpg 등)'); continue; }
      _ocrProg(null);
      if(!text){ alert(file.name+': 추출된 텍스트가 없습니다. (이미지 화질이 낮거나 빈 문서일 수 있어요)'); continue; }
      const id='man-'+Date.now()+'-'+Math.floor(Math.random()*10000);
      const m={id,name:file.name,text,chars:text.length,source,active:true,created_at:new Date().toISOString().slice(0,10),images:(window._mImgCollect||[]),folder:(window._manualFolder&&window._manualFolder!=='__none'?window._manualFolder:'')};
      const res=await fetch('/api/manual/'+id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(m)});
      if(!res.ok){ alert('저장 실패('+res.status+') — 백엔드 재시작이 필요할 수 있습니다.'); continue; }
      if(typeof showToast==='function') showToast('📚 '+file.name+' 학습 완료 ('+text.length.toLocaleString()+'자)');
    }catch(e){ _ocrProg(null); alert(file.name+' 처리 실패: '+((e&&e.message)||e)); }
  }
  _ocrProg(null);
  _manualClearCache();
  await loadManuals(); renderManuals();
}
// ── 통합 모델 화면: Chat LLM / 임베딩 / 리랭커 탭 (RAGFlow식) ──
function llmModelTab(k){
  window._llmMTab=k;
  try{ localStorage.setItem('utop_llm_tab', k); }catch(e){}   // 새로고침 시 마지막 탭 복원용
  // Dify 지식 어시스턴트 탭: 'dify:<id>' — Chat LLM 목록과 분리된 전용 콘텐츠(llm-tab-dify)에 편집 폼만
  var isDify=(typeof k==='string' && k.indexOf('dify:')===0);
  var difyId=isDify?k.slice(5):'';
  // 콘텐츠 컨테이너 표시 (Dify 탭이면 llm-tab-dify만, 고정 탭들은 숨김)
  var showId=isDify?'dify':k;
  ['chat','embed','rerank','pageai-tests','pageai-cycle','pageai-report','pageai-jira_ai','dify'].forEach(function(t){
    var tab=document.getElementById('llm-tab-'+t); if(tab)tab.style.display=(t===showId)?((t==='chat')?'flex':'block'):'none';
  });
  // 고정 탭 하이라이트 (Dify 탭이 활성일 땐 고정 탭 모두 비활성)
  ['chat','embed','rerank','pageai-tests','pageai-cycle','pageai-report','pageai-jira_ai'].forEach(function(t){
    var mt=document.getElementById('llm-mtab-'+t); if(mt){ var on=(t===k); mt.style.borderBottom='2px solid '+(on?'var(--blue)':'transparent'); mt.style.color=on?'var(--blue)':'var(--text3)'; }
  });
  // 동적 Dify 탭 하이라이트
  var bar=document.getElementById('llm-tab-bar');
  if(bar){ bar.querySelectorAll('[data-dify-tab]').forEach(function(el){ var on=(el.getAttribute('data-dify-tab')===difyId); el.style.borderBottom='2px solid '+(on?'#7c3aed':'transparent'); el.style.color=on?'#7c3aed':'var(--text3)'; }); }
  // 'LLM 추가' 버튼은 Chat LLM 탭에서만 (Dify 탭은 편집 전용이므로 숨김)
  var addBtn=document.getElementById('llm-add-btn'); if(addBtn)addBtn.style.display=(k==='chat')?'':'none';
  if(isDify){ window._llmMTab='dify:'+difyId; if(typeof renderDifyTab==='function') renderDifyTab(difyId); return; }
  if(k==='embed')renderEmbedTab();
  else if(k==='rerank')renderRerankTab();
  else if(k==='pageai-tests')renderPageAiTab('tests');
  else if(k==='pageai-cycle')renderPageAiTab('cycle');
  else if(k==='pageai-report')renderPageAiTab('report');
  else if(k==='pageai-jira_ai')renderPageAiTab('jira_ai');
}
// 새로고침 시 LLM 설정 마지막 상태(탭·선택 모델) 복원 — 없거나 무효면 Chat LLM
function _llmRestoreView(){
  var tab=''; var sel='';
  try{ tab=localStorage.getItem('utop_llm_tab')||''; sel=localStorage.getItem('utop_llm_sel')||''; }catch(e){}
  var fixed=['chat','embed','rerank','pageai-tests','pageai-cycle','pageai-report','pageai-jira_ai'];
  // Dify 탭: 저장된 어시스턴트가 아직 존재할 때만
  if(tab.indexOf('dify:')===0){
    var did=tab.slice(5);
    if((typeof difyList!=='undefined'?difyList:[]).some(function(a){return a.id===did;})){ llmModelTab(tab); return; }
    llmModelTab('chat'); return;
  }
  if(tab==='chat'||!tab){
    // Chat LLM 탭 + 저장된 모델이 유효하면 그 모델 선택
    if(sel && (typeof llmList!=='undefined'?llmList:[]).some(function(l){return l.id===sel;})){ llmModelTab('chat'); if(typeof selectLLM==='function') selectLLM(sel); return; }
    llmModelTab('chat'); return;
  }
  if(fixed.indexOf(tab)>=0){ llmModelTab(tab); return; }
  llmModelTab('chat');
}
// 지식 어시스턴트(Dify) 상단 탭을 Reports AI 오른쪽에 동적 생성 — difyList 개수만큼
function _llmRenderDifyTabs(){
  var bar=document.getElementById('llm-tab-bar'); if(!bar) return;
  // 기존 동적 탭 제거
  bar.querySelectorAll('[data-dify-tab],[data-dify-add]').forEach(function(el){ el.remove(); });
  var list=(typeof difyList!=='undefined'&&Array.isArray(difyList))?difyList:[];
  var esc=function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); };
  var active=window._llmMTab||'chat';
  list.forEach(function(a){
    var on=(active==='dify:'+a.id);
    var isLlm=(a.type==='llm'); var accent=isLlm?'#0d9488':'#7c3aed'; var ic=a.icon||(isLlm?'ti-message-chatbot':'ti-sparkles');
    var d=document.createElement('div');
    d.setAttribute('data-dify-tab', a.id);
    d.setAttribute('onclick', "llmModelTab('dify:"+a.id+"')");
    d.style.cssText='padding:9px 16px;font-size:13px;font-weight:700;cursor:pointer;border-bottom:2px solid '+(on?accent:'transparent')+';color:'+(on?accent:'var(--text3)')+';display:flex;align-items:center;gap:5px;';
    d.innerHTML='<i class="ti '+ic+'" style="font-size:15px;color:'+accent+';"></i>'+esc(a.name||'어시스턴트')+(a.public===false?' <span style="font-size:9px;font-weight:800;color:#8a93a4;">비공개</span>':'');
    bar.appendChild(d);
  });
  // + 추가 버튼 (탭 줄 맨 끝)
  var add=document.createElement('div');
  add.setAttribute('data-dify-add','1');
  add.setAttribute('onclick','difyAddNew()');
  add.title='지식 어시스턴트 추가';
  add.style.cssText='padding:9px 12px;font-size:15px;font-weight:800;cursor:pointer;color:#7c3aed;display:flex;align-items:center;';
  add.innerHTML='<i class="ti ti-plus"></i>';
  bar.appendChild(add);
}
// ══ 페이지 AI 설정: Tests/Cycle/Reports fab이 쓸 LLM + 시스템 프롬프트 (전 계정 공유) ══
var _PAGE_AI_META=[
  {key:'tests', name:'Tests AI', sub:'Requirements & Test Coverage', c:'#e8820c', icon:'ti-file-check',
   defPrompt:'당신은 UTOP의 "Tests AI"이며, "Requirements & Test Coverage" 페이지 전용 도우미다.\n\n[역할]\n- 이 페이지의 1열(Requirements), 2열(Test Coverage/매핑), 3열(Test Cases & Steps)의 모든 데이터를 이해하고 답변한다.\n- 특히 3열의 TC와 Step을 가장 정확하게 다룬다: TC 이름·설명, Step 번호·내용, CLI 입력, 기대 결과(판정기준), 비교 조건, 추출 변수, IF/Switch/Loop 조건, 결과 판정 기준까지 추적해 답변한다.\n\n[절대 원칙]\n- 답변은 반드시 [현재 화면 데이터]에 있는 내용만을 근거로 한다.\n- 데이터에 없는 내용은 추측하지 않는다. 확인되지 않으면 "현재 페이지 데이터에서 확인되지 않습니다"라고 명시한다.\n- 데이터는 최신 상태로 가정한다. 사용자가 방금 추가/수정한 항목도 [현재 화면 데이터]에 반영되어 들어온다.\n\n[할 수 있어야 하는 것]\n- Req와 TC의 연결(커버리지) 관계 설명 / Req는 있는데 TC 없는 항목 찾기\n- TC와 Step의 실행 흐름 순서대로 설명 (Step 번호 순)\n- Step의 CLI·기대결과·변수·조건문·반복문 관계 추적\n- 모델 감지 변수 기반 분기(Switch/IF/Loop)의 실행 흐름 분석 (조건 → 이동 Step)\n- 특정 Req/TC/Step 지목 시 그 항목 구체적으로 답변\n- 검토: 누락 TC, 커버리지 부족, 중복 Step, 동일 CLI 사용 TC/Step, 모델별 기대결과 갈리는 Step, 잘못된 IF 조건\n\n[응답 규칙]\n1. 항상 [현재 화면 데이터] 기준으로 답한다.\n2. Req/TC/Step은 가능한 한 ID 또는 이름을 명시한다.\n3. Step 흐름이 있으면 번호 순서대로 설명한다.\n4. 조건문/분기문이 있으면 "조건 → 이동 Step"을 함께 설명한다.\n5. 데이터에 없는 내용은 추측하지 않는다.\n6. 수정 방향을 물으면 현재 구조의 문제점 + 개선안을 함께 제시한다.\n7. TC 설계 개선은 "TC 복제 최소화 / 공통 Step 재사용 / 모델별 기대값 데이터 분리" 관점으로 제안한다.\n8. 답변이 길면 먼저 요약, 그다음 상세 순서로 답한다.\n9. 여러 항목을 속성과 함께 나열할 때(REQ 목록, TC 목록, Step 목록, 커버리지, 비교 등)는 반드시 마크다운 표(| 헤더 | ... |)로 답한다. 각 열은 짧은 헤더명을 쓰고 값이 없으면 - 로 표기한다.\n10. 한국어로 답한다.'},
  {key:'cycle', name:'Cycle AI', sub:'Test Execution', c:'#db2777', icon:'ti-rotate-clockwise',
   defPrompt:'당신은 UTOP의 "Cycle AI"이며, "Cycle > Test Execution" 페이지 전용 AI Assistant다.\n\n[역할]\n- 이 페이지의 1열(Cycle/Test Set/실행 대상/장비/세션/모델), 2열(TC/실행 상태/결과/매핑), 3열(Step/Action/CLI/기대값(criteria)/실제응답(output)/Pass·Fail·Skip/로그/에러)의 모든 데이터를 이해하고 답변한다.\n- 특히 3열의 Step 실행 정보를 가장 정확하게 다룬다: Step 번호·실행 순서·CLI 입력·장비 응답(output)·기대값(criteria)·판정 결과(result)·변수·IF/Switch/Loop·모델 감지·세션·실패 원인·재실행 대상·실행 로그.\n\n[절대 원칙]\n- 답변은 반드시 아래 [현재 화면 데이터]에 있는 내용만을 근거로 한다.\n- 데이터에 없는 내용은 추측하지 않는다. 확인되지 않으면 "현재 Test Execution 데이터에서 확인되지 않습니다"라고 명시한다.\n- 데이터는 최신 실행 상태로 가정한다. 방금 실행/갱신된 결과도 [현재 화면 데이터]에 반영되어 들어온다.\n\n[할 수 있어야 하는 것]\n- 1·2·3열 관계를 이해하고 특정 TC/Step/결과/로그/CLI/실패 원인을 찾아 설명\n- Step 실행 흐름을 순서대로 설명\n- IF/Switch/Loop 조건이 있으면 "조건 → 이동 Step"을 함께 설명\n- 모델별 분기·세션별 실행 결과가 다르면 구분해서 설명\n- 실패 분석: 기대값(criteria)과 실제응답(output)을 비교해 왜 Fail인지 설명 (실패 Step·실제 응답·기대값·비교 기준(type) 근거)\n- "어디부터 다시 실행?" → 실패 Step과 선행 Step 관계로 재실행 지점 제안\n- "이 세션/장비에서 실행된 TC", "Loop 실행 Step 범위", "Switch 이동 Step", "동일 CLI Step", "재실행 후보" 등 조회\n\n[응답 규칙]\n1. 항상 [현재 화면 데이터] 기준으로 답한다.\n2. TC명·Step 번호·CLI·결과값을 가능한 한 명시한다.\n3. 실패 분석 시 기대값(criteria)과 실제응답(output)을 비교해 제시한다.\n4. Step 흐름 질문에는 실행 순서대로 답한다.\n5. 조건문이 있으면 조건식과 이동 Step을 함께 설명한다.\n6. 데이터에 없는 내용은 추측하지 않는다.\n7. 답변이 길면 먼저 요약, 그다음 상세 순서로 답한다.\n8. 수정/개선 방향을 물으면 현재 구조의 문제점 + 개선안을 함께 제시한다.\n9. 여러 TC·Step·실패 항목을 속성과 함께 나열할 때는 반드시 마크다운 표(| 헤더 | ... |)로 답한다. 값이 없으면 - 로 표기한다.\n10. 한국어로 답한다.'},
  {key:'report', name:'Reports AI', sub:'Test Report', c:'#0d9488', icon:'ti-chart-bar',
   defPrompt:'당신은 UTOP의 "Reports AI"이며, "Report > Test Report" 페이지 전용 AI Assistant다.\n\n[역할]\n- 현재 선택된 Report의 모든 내용을 이해하고 답변한다: Report Summary(통계), Requirement 커버리지, TC 결과, Step 결과, 실행 로그, 실패 분석.\n- 특히 실패 분석을 정확히 다룬다: 실패한 TC·Step, CLI 입력, 장비 응답(실제=output), 기대값(criteria), 비교 조건(type), 실패 원인, 재시험 대상.\n- 답변은 항상 현재 선택된 Report(선택 범위) 기준으로 한다.\n\n[절대 원칙]\n- 답변은 반드시 아래 [현재 화면 데이터]에 있는 내용만을 근거로 한다.\n- 데이터에 없는 내용은 추측하지 않는다. 확인되지 않으면 "현재 Test Report 데이터에서 확인되지 않습니다"라고 명시한다.\n- 개수·비율은 제공된 Summary 집계 수치를 사용하고 목록을 직접 세지 않는다.\n- 데이터는 최신 상태로 가정한다. 선택 Report가 바뀌면 그 최신 데이터가 [현재 화면 데이터]에 반영되어 들어온다.\n\n[할 수 있어야 하는 것]\n- 전체 결과 요약: Pass/Fail/Skip/미실행 통계 + 주요 실패 원인\n- 실패한 TC/Step 찾기, 실패 원인 설명 (기대값 vs 실제응답 비교)\n- 특정 TC/Step의 상태·CLI·기대값·실제값·로그 조회\n- Requirement 기준 커버리지 결과 설명\n- 재시험 대상 제안 (Fail/미실행/에러 기준)\n- "가장 많이 실패한 원인" → 실패 항목 집계 후 설명\n- "결함 등록 초안" → 실패 원인·재현 Step·기대 결과·실제 결과·로그 요약을 이슈 초안 텍스트로 정리 (초안 텍스트만 — 실제 등록은 하지 않음)\n- "상급자 보고용 요약" → 통계 → 핵심 실패 → 원인 → 조치 권장 순의 간결한 보고\n- "실행 시간 긴 TC 순서", "동일 CLI에서 실패한 Step" 등 조회\n\n[응답 규칙]\n1. 항상 [현재 화면 데이터] 기준으로 답한다.\n2. TC명·Step 번호·CLI·결과값을 가능한 한 명시한다.\n3. 실패 분석 시 기대값(criteria)과 실제응답(output)을 비교한다.\n4. 전체 요약 요청에는 "통계 → 실패 항목 → 주요 원인 → 재시험 권장" 순으로 답한다.\n5. 특정 TC 질문에는 상태·관련 Step·실패 여부·로그 기준으로 답한다.\n6. 특정 Step 질문에는 Step 번호·명령·기대값·실제값·결과 기준으로 답한다.\n7. 데이터에 없는 내용은 추측하지 않는다.\n8. 답변이 길면 먼저 요약, 그다음 상세 순서로 답한다.\n9. 수정/개선 방향을 물으면 현재 Report 데이터 기준의 문제점 + 개선안을 함께 제시한다.\n10. 여러 TC·Step·실패 항목을 속성과 함께 나열할 때는 반드시 마크다운 표(| 헤더 | ... |)로 답한다. 값이 없으면 - 로 표기한다.\n11. 한국어로 답한다.'},
  {key:'jira_ai', name:'지식 검색 AI', sub:'AI Assistant › 지식 검색', c:'#7c3aed', icon:'ti-database-search',
   desc:'UTOP 지식 검색(사내 지식 RAG) 모드가 사용하는 LLM',
   info:'<b>AI Assistant › 지식 검색</b>의 <b>UTOP 지식 검색</b> 모드(매뉴얼·제품스펙 사내 지식 RAG)가 사용할 LLM과 시스템 프롬프트를 지정합니다. LLM 목록은 <b>Chat LLM</b> 탭에 등록된 것에서 선택합니다. 미지정 시 제마(Test WorkFlow)로 동작합니다. 저장 시 <b>모든 계정에 공유</b>됩니다.',
   hint:'이 프롬프트 뒤에 사내 지식(RAG) 검색 결과가 자동으로 붙습니다. 근거·출처 규칙은 유지하는 걸 권장합니다.',
   defPrompt:'당신은 UTOP의 "지식 검색 AI"이며, AI Assistant › 지식 검색의 "UTOP 지식 검색" 전용 어시스턴트다. 유비쿼스(Ubiquoss) 네트워크 장비(OLT·L2/L3 스위치·ONT·CPE 등) 시험 자동화 전문가로서 사내 지식을 근거로 답한다.\n\n[지식 소스 — 질문마다 아래 데이터가 자동으로 붙는다]\n1. 【시험절차 학습 데이터】: "시험절차 학습/조회"에 등록된 검증된 시험 절차. 시험항목(title)·대상 모델(models)·제품군(role)과 Step 목록(설명, CLI, 판정 방식 type·판정 기준 criteria, 이미지인식 텍스트)으로 구성된다.\n2. 【사내 지식 검색 결과】: "RAG Data"에 등록된 문서 발췌. 매뉴얼·제품스펙·설정 가이드(워드/PDF/PPT/이미지 OCR)와 TC·Requirement·Jira·Confluence 자동 색인. 각 발췌 앞에 (번호)[출처 · 문서명]이 붙는다.\n\n[절대 원칙]\n- 두 지식 소스를 최우선 근거로 답한다. 특히 시험절차 학습 데이터는 검증된 절차이므로 해당 질문에는 그 Step 순서·CLI·판정 기준을 그대로 우선 제시한다.\n- CLI 명령·판정 기준·수치·모델명은 지식 소스의 표기를 그대로 사용한다(임의로 바꾸지 않는다).\n- 근거가 지식 소스에 없으면 일반 지식으로 보완하되, 어디까지가 사내 지식이고 어디부터가 일반 지식인지 구분해 명시한다.\n- 출처를 밝힌다: 시험절차는 시험항목명, 문서는 (번호)[출처 · 문서명] 형식.\n\n[할 수 있어야 하는 것]\n- 제품 스펙·기능·제약 질문: 매뉴얼/제품스펙 발췌를 근거로 답변\n- CLI·설정 방법 안내: 명령은 코드블록으로, 필요한 사전 조건과 함께\n- 시험 절차 안내: 학습된 시험항목의 Step을 순서대로 "설명 → CLI → 기대 결과(판정 기준)" 형식으로 재구성\n- 모델별 차이: 시험절차의 모델(models)·제품군(role)이 다르면 모델별로 구분해 답변\n- 디버깅·트러블슈팅: 증상 → 확인용 CLI → 원인 후보 → 조치 순서로 안내\n- 관련 자료 추천: 질문과 관련된 학습 시험항목·문서 목록 제시\n\n[응답 규칙]\n1. CLI는 반드시 코드블록으로 표시한다.\n2. 절차는 Step 번호 순서대로: 설명 → CLI → 기대 결과(판정 기준).\n3. 여러 항목(시험항목·모델·문서·명령 비교 등)을 속성과 함께 나열할 때는 반드시 마크다운 표(| 헤더 | ... |)로 답한다. 값이 없으면 - 로 표기한다.\n4. 답변이 길면 먼저 요약, 그다음 상세 순서로 답한다.\n5. 지식 소스에 없는 내용을 사내 사실처럼 단정하지 않는다.\n6. 한국어로 정확하고 간결하게 답한다.'}
];
function _pageAiDefPrompt(key){ var m=_PAGE_AI_META.find(function(x){return x.key===key;}); return m?m.defPrompt:''; }
async function _pageAiLoad(){
  // 설정 화면은 항상 최신값을 fetch (편집 대상이므로 캐시 무시)
  try{ var d=await (await fetch('/api/page-ai')).json(); window._pageAiCfg=(d&&typeof d==='object')?d:{}; window._pageAiCfgTs=(new Date()).getTime(); }catch(e){ window._pageAiCfg=window._pageAiCfg||{}; }
  return window._pageAiCfg;
}
// key: 'tests'|'cycle'|'report' — 해당 페이지 AI 설정 1개만 렌더 (각각 별도 탭)
async function renderPageAiTab(key){
  var box=document.getElementById('llm-tab-pageai-'+key); if(!box) return;
  var m=_PAGE_AI_META.find(function(x){return x.key===key;}); if(!m) return;
  box.innerHTML='<div style="padding:40px;text-align:center;color:var(--text3);"><span class="ring-spin" style="width:18px;height:18px;border-width:2px;"></span> 불러오는 중…</div>';
  // Chat LLM 목록 확보
  var list=(typeof llmList!=='undefined'&&Array.isArray(llmList)&&llmList.length)?llmList:null;
  if(!list){ try{ if(typeof loadLLMsFromServer==='function') await loadLLMsFromServer(); list=(typeof llmList!=='undefined')?llmList:[]; }catch(e){ list=[]; } }
  list=list||[];
  var cfg=await _pageAiLoad();
  var esc=function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); };
  var optsFor=function(sel){
    if(!list.length) return '<option value="">등록된 LLM 없음 — Chat LLM 탭에서 추가</option>';
    var o='';
    list.forEach(function(l){ var id=l.id||l.name; o+='<option value="'+esc(id)+'"'+(String(sel)===String(id)?' selected':'')+'>'+esc(l.name||l.model||id)+(l.model?(' · '+esc(l.model)):'')+'</option>'; });
    return o;
  };
  var c=(cfg&&cfg[m.key])||{}; var llmId=c.llm_id||''; var pr=(c.prompt!=null&&c.prompt!=='')?c.prompt:m.defPrompt;
  var greet=c.greeting||''; var ph=c.placeholder||'';
  window['_pgaiQuick_'+m.key]=(Array.isArray(c.quick)?c.quick.slice():[]);
  var ragSrcHtml=(m.key==='jira_ai'&&typeof _difyRagSourceRows==='function')
    ? ('<div style="padding-top:13px;margin-top:13px;border-top:1px solid var(--border);"><div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:9px;display:flex;align-items:center;gap:6px;"><i class="ti ti-list-search" style="color:'+m.c+';font-size:15px;"></i> 지식 소스 활성화·우선순위</div><div id="pgai-ragsrc-jira_ai">'+_difyRagSourceRows(c.rag_sources,['tc','manual'])+'</div></div>')
    : '';
  var card='<div style="border:1px solid var(--border);border-radius:12px;padding:16px 18px;background:var(--bg2);">'
      +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">'
        +'<span style="width:34px;height:34px;border-radius:9px;background:'+m.c+'1a;color:'+m.c+';display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="ti '+m.icon+'" style="font-size:19px;"></i></span>'
        +'<div><div style="font-size:14.5px;font-weight:800;color:var(--text);">'+m.name+'</div><div style="font-size:11.5px;color:var(--text3);">'+(m.desc||(m.sub+' 화면의 AI 토글'))+'</div></div>'
        +'<span style="flex:1;"></span>'
        +'<span id="pgai-save-result-'+m.key+'" style="font-size:12px;color:var(--text3);"></span>'
        +'<button onclick="_pageAiSave(\''+m.key+'\')" style="font-size:13px;font-weight:800;padding:8px 18px;border:none;border-radius:8px;background:#2d6fd4;color:#fff;cursor:pointer;white-space:nowrap;flex-shrink:0;"><i class="ti ti-device-floppy"></i> '+m.name+' 저장</button>'
      +'</div>'
      +'<div style="display:grid;grid-template-columns:1fr 2.2fr;gap:18px;align-items:start;">'
        // ── 1열: 사용 LLM + AI 채팅 화면 ──
        +'<div style="display:flex;flex-direction:column;">'
          +'<div style="font-size:11.5px;color:var(--text3);margin-bottom:4px;font-weight:700;">사용 LLM</div>'
          +'<select id="pgai-llm-'+m.key+'" style="width:100%;font-size:13px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg2);color:var(--text);box-sizing:border-box;margin-bottom:16px;outline:none;">'+optsFor(llmId)+'</select>'
          +'<div style="padding-top:13px;border-top:1px solid var(--border);">'
            +'<div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:9px;display:flex;align-items:center;gap:6px;"><i class="ti ti-message-2" style="color:'+m.c+';font-size:15px;"></i> AI 채팅 화면 (이 AI 토글 열 때)</div>'
            +'<div style="font-size:11px;color:var(--text3);font-weight:600;margin-bottom:4px;">오프닝 멘트 · 마크다운</div>'
            +'<textarea id="pgai-greeting-'+m.key+'" rows="4" placeholder="예: 안녕하세요! 무엇을 도와드릴까요?" style="width:100%;font-size:12.5px;line-height:1.6;padding:9px 11px;border:1px solid var(--border);border-radius:8px;background:var(--bg2);color:var(--text);box-sizing:border-box;resize:vertical;outline:none;font-family:inherit;margin-bottom:10px;">'+esc(greet)+'</textarea>'
            +'<div style="font-size:11px;color:var(--text3);font-weight:600;margin-bottom:4px;">입력창 안내문</div>'
            +'<textarea id="pgai-ph-'+m.key+'" rows="2" placeholder="예: 질문을 입력하세요" style="width:100%;font-size:12.5px;line-height:1.5;padding:9px 11px;border:1px solid var(--border);border-radius:8px;background:var(--bg2);color:var(--text);box-sizing:border-box;resize:vertical;outline:none;font-family:inherit;margin-bottom:10px;">'+esc(ph)+'</textarea>'
            +'<div style="font-size:11px;color:var(--text3);font-weight:600;margin-bottom:4px;">추천 질문 (클릭형 칩)</div>'
            +'<div id="pgai-quick-'+m.key+'">'+_pgaiQuickHtml(m.key)+'</div>'
          +'</div>'
          +ragSrcHtml
        +'</div>'
        // ── 2열: 시스템 프롬프트 ──
        +'<div style="display:flex;flex-direction:column;">'
          +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;"><span style="font-size:11.5px;color:var(--text3);font-weight:700;">시스템 프롬프트</span><span style="flex:1;"></span><button onclick="_pageAiResetPrompt(\''+m.key+'\')" style="font-size:11px;padding:3px 9px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);color:var(--text2);cursor:pointer;"><i class="ti ti-refresh" style="font-size:12px;"></i> 기본값</button></div>'
          +'<textarea id="pgai-prompt-'+m.key+'" rows="32" placeholder="'+esc(m.defPrompt)+'" style="width:100%;font-size:12.5px;line-height:1.6;padding:9px 11px;border:1px solid var(--border);border-radius:8px;background:var(--bg2);color:var(--text);box-sizing:border-box;resize:vertical;outline:none;font-family:inherit;">'+esc(pr)+'</textarea>'
          +'<div style="font-size:10.5px;color:var(--text3);margin-top:5px;line-height:1.5;">'+(m.hint||'이 프롬프트 뒤에 화면 데이터가 자동으로 붙습니다. 데이터 근거·한국어 답변 규칙은 유지하는 걸 권장합니다.')+'</div>'
        +'</div>'
      +'</div>'
      +'</div>';
  box.innerHTML='<div style="max-width:2000px;">'
    +'<div style="font-size:11.5px;color:var(--text3);margin:0 0 16px;line-height:1.6;background:#faf7ff;border:1px solid #e7defb;border-radius:8px;padding:11px 13px;">'
      +(m.info||('<b>'+m.sub+'</b> 화면 우하단 <b>AI 토글</b>이 사용할 LLM과 시스템 프롬프트를 지정합니다. LLM 목록은 <b>Chat LLM</b> 탭에 등록된 것에서 선택합니다. 저장 시 <b>모든 계정에 공유</b>됩니다.'))+'</div>'
    +card
    +'</div>';
}
function _pageAiResetPrompt(key){ var t=document.getElementById('pgai-prompt-'+key); if(t){ t.value=_pageAiDefPrompt(key); } }
// 추천 질문(퀵 질문 칩) 편집 — window['_pgaiQuick_'+key]에 편집 중인 배열을 들고 있다가 저장 시 전송
function _pgaiQuickHtml(key){
  var esc=function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); };
  var list=window['_pgaiQuick_'+key]||[];
  var rows=list.map(function(q,i){
    return '<div style="display:flex;gap:6px;margin-bottom:6px;">'
      +'<input value="'+esc(q)+'" onchange="_pgaiQuickSet(\''+key+'\','+i+',this.value)" placeholder="추천 질문 문구" style="flex:1;font-size:12.5px;padding:7px 9px;border:1px solid var(--border);border-radius:7px;background:var(--bg2);color:var(--text);box-sizing:border-box;outline:none;">'
      +'<button type="button" onclick="_pgaiQuickDel(\''+key+'\','+i+')" title="삭제" style="flex-shrink:0;width:30px;border:1px solid rgba(229,62,90,0.3);border-radius:7px;background:#fff;color:var(--red);cursor:pointer;"><i class="ti ti-trash" style="font-size:13px;"></i></button>'
    +'</div>';
  }).join('');
  return rows+'<button type="button" onclick="_pgaiQuickAdd(\''+key+'\')" style="font-size:11.5px;font-weight:700;padding:6px 12px;border:1px dashed var(--border);border-radius:7px;background:var(--bg2);color:#2d6fd4;cursor:pointer;"><i class="ti ti-plus"></i> 질문 추가</button>';
}
function _pgaiQuickAdd(key){ window['_pgaiQuick_'+key]=(window['_pgaiQuick_'+key]||[]); window['_pgaiQuick_'+key].push(''); var box=document.getElementById('pgai-quick-'+key); if(box) box.innerHTML=_pgaiQuickHtml(key); }
function _pgaiQuickDel(key,i){ var list=window['_pgaiQuick_'+key]; if(list) list.splice(i,1); var box=document.getElementById('pgai-quick-'+key); if(box) box.innerHTML=_pgaiQuickHtml(key); }
function _pgaiQuickSet(key,i,val){ var list=window['_pgaiQuick_'+key]; if(list&&list[i]!=null) list[i]=val; }
// key 지정 시 그 페이지만 저장 (백엔드가 부분 병합) — 다른 페이지 설정은 보존됨
async function _pageAiSave(key){
  var m=_PAGE_AI_META.find(function(x){return x.key===key;}); if(!m) return;
  var sel=document.getElementById('pgai-llm-'+m.key); var ta=document.getElementById('pgai-prompt-'+m.key);
  var gr=document.getElementById('pgai-greeting-'+m.key); var phe=document.getElementById('pgai-ph-'+m.key);
  var payload={}; payload[m.key]={ llm_id:(sel?sel.value:'')||'', prompt:(ta?ta.value:'')||'', greeting:(gr?gr.value:'')||'', placeholder:(phe?phe.value:'')||'' };
  payload[m.key].quick=(window['_pgaiQuick_'+key]||[]).map(function(s){return String(s||'').trim();}).filter(Boolean);
  if(key==='jira_ai'&&window._difyRagSrcState){ payload[m.key].rag_sources=window._difyRagSrcState.map(function(x,i){ return {source:x.source, enabled:!!x.enabled, priority:i}; }); }
  var el=document.getElementById('pgai-save-result-'+key); if(el){ el.style.color='var(--text3)'; el.innerHTML='<span class="ring-spin" style="width:12px;height:12px;border-width:2px;"></span> 저장 중…'; }
  try{
    var d=await userApi('POST','/api/page-ai',payload);
    window._pageAiCfg=(d&&typeof d==='object')?d:(window._pageAiCfg||{}); window._pageAiCfgTs=(new Date()).getTime();
    if(el){ el.style.color='#00875a'; el.textContent='✅ 저장됨 (모든 계정 공유)'; }
    if(typeof showToast==='function') showToast(m.name+' 설정 저장됨');
  }catch(e){ if(el){ el.style.color='#e53e5a'; el.textContent='❌ 저장 실패: '+(e&&e.message||e); } }
}
async function _ragCfgGet(){ try{ return await (await fetch('/api/rag/config')).json(); }catch(e){ return {}; } }
async function renderEmbedTab(){ var box=document.getElementById('llm-tab-embed'); if(box)box.innerHTML=_modelCfgForm('embed', await _ragCfgGet()); }
async function renderRerankTab(){ var box=document.getElementById('llm-tab-rerank'); if(box)box.innerHTML=_modelCfgForm('rerank', await _ragCfgGet()); }
function _modelCfgForm(kind, rc){
  var esc=function(s){return String(s||'').replace(/"/g,'&quot;');};
  var isE=kind==='embed';
  var url=isE?rc.embed_url:rc.rerank_url, model=isE?rc.embed_model:rc.rerank_model, use=isE?rc.use_embed:rc.use_rerank;
  var title=isE?'임베딩 모델 (의미검색)':'리랭커 모델 (정밀 재정렬)', icon=isE?'ti-vector':'ti-sort-descending-2';
  var defModel=isE?'bge-m3':'bge-reranker-v2-m3', defPort=isE?'1000':'9081', on=!!url;
  return '<div style="max-width:560px;">'
    +'<div style="display:flex;align-items:center;gap:9px;margin-bottom:4px;"><i class="ti '+icon+'" style="font-size:22px;color:#7c3aed;"></i><div style="font-size:16px;font-weight:800;">'+title+'</div><span style="font-size:11.5px;font-weight:700;padding:3px 10px;border-radius:12px;'+(on?'color:#0a7a52;background:#e9f9f1;':'color:#b5730f;background:#fff8ec;')+'">'+(on?'✓ 설정됨':'미설정')+'</span></div>'
    +'<div style="font-size:11.5px;color:var(--text3);margin:6px 0 16px;line-height:1.6;background:#faf7ff;border:1px solid #e7defb;border-radius:8px;padding:10px 12px;">'+(isE?'질문·문서를 벡터로 변환해 <b>의미 기반 검색</b> (bge-m3).':'BM25·임베딩 후보를 <b>질의 적합도로 재정렬</b>해 정확도 향상 (bge-reranker).')+' OpenAI 호환 엔드포인트.</div>'
    +'<div style="font-size:11px;color:var(--text3);margin-bottom:4px;">엔드포인트 URL</div><input id="mc-'+kind+'-url" value="'+esc(url)+'" placeholder="http://10.10.30.219:'+defPort+'" style="width:100%;font-size:13px;padding:9px 11px;border:1px solid var(--border);border-radius:8px;box-sizing:border-box;margin-bottom:12px;outline:none;">'
    +'<div style="font-size:11px;color:var(--text3);margin-bottom:4px;">모델명</div><input id="mc-'+kind+'-model" value="'+esc(model||defModel)+'" placeholder="'+defModel+'" style="width:100%;font-size:13px;padding:9px 11px;border:1px solid var(--border);border-radius:8px;box-sizing:border-box;margin-bottom:12px;outline:none;">'
    +'<label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;margin-bottom:16px;cursor:pointer;"><input type="checkbox" id="mc-'+kind+'-use" '+(use?'checked':'')+' style="width:15px;height:15px;accent-color:#7c3aed;"> 사용</label>'
    +'<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;"><button onclick="_modelCfgSave(\''+kind+'\')" style="font-size:13px;font-weight:800;padding:9px 20px;border:none;border-radius:8px;background:#2d6fd4;color:#fff;cursor:pointer;">저장</button><button onclick="_modelCfgTest(\''+kind+'\')" style="font-size:13px;font-weight:700;padding:9px 16px;border:1px solid var(--border);border-radius:8px;background:#fff;color:var(--text2);cursor:pointer;"><i class="ti ti-plug"></i> 저장 후 연결테스트</button><span id="mc-'+kind+'-result" style="font-size:12px;color:var(--text3);"></span></div>'
    +'</div>';
}
function _modelCfgApply(kind, rc){
  var v=function(id){return ((document.getElementById(id)||{}).value||'').trim();};
  if(kind==='embed'){ rc.embed_url=v('mc-embed-url'); rc.embed_model=v('mc-embed-model'); rc.use_embed=!!(document.getElementById('mc-embed-use')||{}).checked; }
  else { rc.rerank_url=v('mc-rerank-url'); rc.rerank_model=v('mc-rerank-model'); rc.use_rerank=!!(document.getElementById('mc-rerank-use')||{}).checked; }
  return rc;
}
async function _modelCfgSave(kind){
  try{ await userApi('POST','/api/rag/config',_modelCfgApply(kind, await _ragCfgGet())); if(typeof showToast==='function')showToast((kind==='embed'?'임베딩':'리랭커')+' 설정 저장됨'); (kind==='embed'?renderEmbedTab():renderRerankTab()); }catch(e){ if(typeof showToast==='function')showToast('실패: '+e.message); }
}
async function _modelCfgTest(kind){
  var el=document.getElementById('mc-'+kind+'-result'); if(el){el.style.color='var(--text3)';el.innerHTML='<span class="ring-spin" style="width:13px;height:13px;border-width:2px;"></span> 저장 후 테스트…';}
  try{ await userApi('POST','/api/rag/config',_modelCfgApply(kind, await _ragCfgGet())); var d=await userApi('POST','/api/rag/test',{}); var r=(kind==='embed')?d.embed:d.rerank;
    if(el){ if(r&&r.ok){ el.style.color='#00875a'; el.innerHTML='✅ 연결됨'+(kind==='embed'?(' · 벡터 차원 '+(r.dim||0)):(' · 리랭크 결과 '+(r.results||0)+'개')); } else { el.style.color='#e53e5a'; el.textContent='❌ 응답 없음 — URL/모델/포트 확인'; } }
  }catch(e){ if(el){el.style.color='#e53e5a';el.textContent='실패: '+e.message;} }
}
function ragSettingsBody(rc){
  var esc=function(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');};
  var _rf=function(label,id,val,ph){ return '<div style="margin-bottom:8px;"><div style="font-size:10.5px;color:var(--text3);margin-bottom:3px;">'+label+'</div><input id="'+id+'" value="'+String(val||'').replace(/"/g,'&quot;')+'" placeholder="'+ph+'" style="width:100%;font-size:12.5px;padding:7px 9px;border:1px solid var(--border);border-radius:7px;box-sizing:border-box;outline:none;"></div>'; };
  var _llms=(typeof llmList!=='undefined'?llmList:[])||[];
  var _chat=_llms.filter(function(l){return l.status==='active' && (l.uses||[]).indexOf('chat')>=0;});
  var _embOn=!!rc.embed_url, _rrOn=!!rc.rerank_url, _llmOn=_chat.length>0;
  var chip=function(on,ic,label,detail){ return '<span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700;border-radius:14px;padding:5px 12px;margin:0 7px 7px 0;'+(on?'color:#0a7a52;background:#e9f9f1;border:1px solid #b6e6cf;':'color:#b5730f;background:#fff8ec;border:1px solid #f0d8a8;')+'"><i class="ti '+ic+'"></i> '+label+(detail?(' <span style="font-weight:500;color:var(--text3);">'+esc(detail)+'</span>'):'')+' '+(on?'<b>✓</b>':'미설정')+'</span>'; };
  var statusPanel='<div style="margin-bottom:16px;border:1px solid var(--border);border-radius:9px;padding:11px 13px;background:#fafbff;"><div style="font-size:12.5px;font-weight:800;margin-bottom:9px;"><i class="ti ti-arrow-guide" style="color:#2d6fd4;"></i> RAG 파이프라인 구성 <span style="font-size:10.5px;font-weight:500;color:var(--text3);">검색 → 답변</span></div>'
    + chip(_embOn,'ti-vector','① 임베딩', rc.embed_model||'bge-m3')
    + chip(_rrOn,'ti-sort-descending-2','② 리랭커', rc.rerank_model||'bge-reranker')
    + chip(_llmOn,'ti-robot','③ 답변 LLM', _chat.length?(_chat[0].name+(_chat.length>1?(' 외 '+(_chat.length-1)):'')):'')
    + '<div style="font-size:10.5px;color:var(--text3);margin-top:4px;">임베딩·리랭커=검색 정확도 / 답변 LLM=gemma 등(FAB 드롭다운에서 선택)</div></div>';
  return '<div style="max-width:680px;">'
    +statusPanel
    +'<div style="font-size:11px;font-weight:800;color:var(--text3);margin-bottom:6px;">① 검색 엔진(임베딩·리랭커)</div>'
    +'<div style="font-size:12px;color:var(--text3);margin-bottom:14px;line-height:1.6;background:#faf7ff;border:1px solid #e7defb;border-radius:8px;padding:10px 12px;">bge-m3(임베딩)·bge-reranker를 연결하면 <b>의미검색 + 리랭킹</b>으로 정확도가 올라갑니다. 비우면 BM25(키워드)만. <span style="color:#7c3aed;">포트: 임베딩 1000, 리랭커 9081</span></div>'
    +'<div style="display:flex;gap:14px;flex-wrap:wrap;"><div style="flex:1;min-width:250px;">'+_rf('임베딩 URL','rag-embed-url',rc.embed_url,'http://서버IP:1000')+_rf('임베딩 모델','rag-embed-model',rc.embed_model,'bge-m3')+'</div><div style="flex:1;min-width:250px;">'+_rf('리랭커 URL','rag-rerank-url',rc.rerank_url,'http://서버IP:9081')+_rf('리랭커 모델','rag-rerank-model',rc.rerank_model,'bge-reranker-v2-m3')+'</div></div>'
    +'<div style="display:flex;gap:18px;margin:10px 0 10px;font-size:12.5px;"><label style="display:flex;gap:6px;align-items:center;cursor:pointer;"><input type="checkbox" id="rag-use-embed" '+(rc.use_embed?'checked':'')+'> 의미검색 사용</label><label style="display:flex;gap:6px;align-items:center;cursor:pointer;"><input type="checkbox" id="rag-use-rerank" '+(rc.use_rerank?'checked':'')+'> 리랭킹 사용</label></div>'
    +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;font-size:12.5px;flex-wrap:wrap;"><span style="color:var(--text3);">최소 관련도(리랭크 점수):</span><input id="rag-min-score" type="number" step="0.05" min="0" max="1" value="'+(rc.min_score||0)+'" style="width:80px;font-size:12.5px;padding:6px 8px;border:1px solid var(--border);border-radius:7px;"><span style="font-size:11px;color:var(--text3);">0=필터없음 · 0.3~0.5 권장(무관 청크 제거 — RAGFlow식)</span></div>'
    +'<div style="display:flex;gap:8px;align-items:center;"><button onclick="ragSaveConfig()" style="font-size:13px;font-weight:800;padding:8px 20px;border:none;border-radius:8px;background:#7c3aed;color:#fff;cursor:pointer;">저장</button><button onclick="ragTestConn()" style="font-size:13px;font-weight:700;padding:8px 16px;border:1px solid var(--border);border-radius:8px;background:#fff;color:var(--text2);cursor:pointer;"><i class="ti ti-plug"></i> 저장+연결테스트</button><span id="rag-test-result" style="font-size:12px;color:var(--text3);"></span></div>'
  +'</div>';
}
function manualTab(k){ window._manualTab=k; renderManuals(); }
function manualSetImgMode(m){ _manualImgMode=m; try{localStorage.setItem('utop_manualImgMode',m);}catch(e){} if(typeof showToast==='function')showToast('📷 이미지 처리: '+(m==='off'?'끔(보관만)':m==='vision'?'AI비전 인식':'OCR 인식')); if(typeof renderManuals==='function')renderManuals(); }
function manualSelect(id){ window._manualSel=id; window._manualTab='chunks'; renderManuals(); }
function manualDrop(e){ e.preventDefault(); var dz=document.getElementById('manual-dropzone'); if(dz){dz.style.background='';dz.style.borderColor='var(--border)';} if(e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files.length){ manualUpload({files:e.dataTransfer.files}); } }
async function manualLoadChunks(m){
  var body=document.getElementById('manual-chunks-body'); if(!body||!m)return;
  var esc=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');};
  // 요청 취소 지원 — 사용자가 다른 파일 클릭 시 이전 요청 중단
  try{ if(window._manualLoadCtrl) window._manualLoadCtrl.abort(); }catch(e){}
  var ctrl=new AbortController(); window._manualLoadCtrl=ctrl;
  var reqAt=Date.now(); window._manualLoadAt=reqAt;
  body.innerHTML='<div style="font-size:13.5px;font-weight:800;margin-bottom:12px;"><i class="ti ti-file-text" style="color:#2d6fd4;"></i> '+esc(m.name)+'</div><div style="color:var(--text3);padding:14px;"><i class="ti ti-loader-2 spin"></i> 청크 불러오는 중…</div>';
  // 청크 먼저 fetch (가벼움) → 결과에 count 있으면 그때 이미지 fetch 여부 판단
  var d={chunks:[],count:0};
  try{ d=await (await fetch('/api/rag/chunks?manual='+encodeURIComponent(m.name)+'&limit=300',{signal:ctrl.signal})).json(); }
  catch(e){ if(e && e.name==='AbortError') return; }
  // 이후 요청이 이미 온 상태면 이 결과 버림
  if(window._manualLoadAt!==reqAt) return;
  var chunkCount=(d.count||0);
  // 청크 0 이면 이미지 fetch 스킵 (색인 안 된 파일)
  var imgsArr=[];
  if(chunkCount>0 && m.image_count){
    try{
      // 이미지만 별도 endpoint 로 fetch (매뉴얼 전체 data 안 가져옴 → 훨씬 빠름)
      var full=await (await fetch('/api/manual/'+m.id+'/images',{signal:ctrl.signal})).json();
      if(window._manualLoadAt!==reqAt) return;
      imgsArr=(full.images&&full.images.length)?full.images:((m.images&&m.images.length)?m.images:[]);
    }catch(e){ if(e && e.name==='AbortError') return; }
  } else if(m.images && m.images.length){
    imgsArr=m.images;
  }
  var imgs=imgsArr.length?('<div style="margin-bottom:16px;"><div style="font-size:12.5px;font-weight:800;margin-bottom:8px;">📷 문서 이미지 ('+imgsArr.length+')</div><div style="display:flex;gap:8px;flex-wrap:wrap;">'+imgsArr.map(function(im){var src=(im&&im.data)||im;return '<img loading="lazy" src="'+src+'" style="width:130px;height:88px;object-fit:cover;border-radius:8px;border:1px solid var(--border);cursor:zoom-in;" onclick="window.open(\''+src+'\',\'_blank\')">';}).join('')+'</div></div>'):'';
  var renderChunk=function(c){ return String(c).split(/(\[\[IMG:\d+\]\])/).map(function(p){ var mk=p.match(/^\[\[IMG:(\d+)\]\]$/); if(mk){ var src=imgsArr[+mk[1]]; src=(src&&src.data)||src; return src?('<img loading="lazy" src="'+src+'" style="max-width:260px;max-height:180px;border-radius:6px;border:1px solid var(--border);display:block;margin:6px 0;cursor:zoom-in;" onclick="window.open(\''+src+'\',\'_blank\')">'):''; } return esc(p); }).join(''); };
  var chunks=(d.chunks||[]).map(function(c,i){ return '<div style="border:1px solid var(--border);border-radius:8px;padding:9px 12px;margin-bottom:7px;background:#fff;"><div style="font-size:10px;font-weight:800;color:#7c3aed;margin-bottom:4px;">청크 '+(i+1)+'</div><div style="font-size:12px;color:var(--text2);line-height:1.55;white-space:pre-wrap;word-break:break-word;">'+renderChunk(c)+'</div></div>'; }).join('');
  body.innerHTML='<div style="font-size:13.5px;font-weight:800;margin-bottom:12px;"><i class="ti ti-file-text" style="color:#2d6fd4;"></i> '+esc(m.name)+' <span style="font-size:11px;color:var(--text3);font-weight:600;">· '+chunkCount+' 청크</span></div>'+imgs+(chunks||'<div style="padding:24px;text-align:center;color:var(--text3);border:2px dashed var(--border);border-radius:10px;">청크가 없습니다. <b>AI 참고</b>를 켜면 색인됩니다.</div>');
}
function confluenceBody(cc){
  var f=function(label,id,val,ph,type){ return '<div style="margin-bottom:8px;"><div style="font-size:10.5px;color:var(--text3);margin-bottom:3px;">'+label+'</div><input id="'+id+'" type="'+(type||'text')+'" value="'+String(val||'').replace(/"/g,'&quot;')+'" placeholder="'+ph+'" style="width:100%;font-size:12.5px;padding:7px 9px;border:1px solid var(--border);border-radius:7px;box-sizing:border-box;outline:none;"></div>'; };
  var setOn=!!cc.base_url; var esc=function(s){return String(s||'').replace(/"/g,'&quot;');};
  return '<div style="max-width:680px;margin-top:24px;border-top:1px dashed var(--border);padding-top:18px;">'
    +'<div style="font-size:14px;font-weight:800;margin-bottom:6px;"><i class="ti ti-brand-confluence" style="color:#2d6fd4;"></i> Confluence 연동 <span style="font-size:11px;font-weight:600;color:'+(setOn?'#00875a':'#b5730f')+';">'+(setOn?'설정됨':'미설정')+'</span></div>'
    +'<div style="font-size:11.5px;color:var(--text3);margin-bottom:10px;line-height:1.6;background:#f6f9ff;border:1px solid #cfe0fb;border-radius:8px;padding:10px 12px;"><b>라이브 조회</b>: 질문할 때마다 Confluence를 HTTP로 검색 — <b>import·페이지관리 불필요</b>, 항상 최신입니다 (Dify식).</div>'
    +'<label style="display:flex;align-items:center;gap:7px;font-size:13px;font-weight:700;margin-bottom:12px;cursor:pointer;padding:8px 11px;border:1px solid '+(cc.live_query?'#a8e0c8':'var(--border)')+';border-radius:8px;background:'+(cc.live_query?'#f0fbf6':'#fff')+';"><input type="checkbox" id="conf-live" '+(cc.live_query?'checked':'')+' style="width:15px;height:15px;accent-color:#00a872;"> <i class="ti ti-bolt" style="color:#00a872;"></i> 라이브 조회 사용 (질문 시 Confluence 실시간 검색)</label>'
    +f('Base URL','conf-url',cc.base_url,'https://wiki.ubiquoss.com')
    +'<div style="display:flex;gap:10px;margin-bottom:8px;"><div style="flex:1;"><div style="font-size:10.5px;color:var(--text3);margin-bottom:3px;">인증</div><select id="conf-auth" onchange="confAuthToggle()" style="width:100%;font-size:12.5px;padding:7px 9px;border:1px solid var(--border);border-radius:7px;cursor:pointer;"><option value="bearer"'+(cc.auth_type==='bearer'?' selected':'')+'>Bearer 토큰(PAT)</option><option value="basic"'+(cc.auth_type==='basic'?' selected':'')+'>계정+비밀번호</option></select></div><div style="flex:1;"><div style="font-size:10.5px;color:var(--text3);margin-bottom:3px;">Space Key (선택)</div><input id="conf-space" value="'+esc(cc.space_key)+'" placeholder="예: kb (비우면 전체)" style="width:100%;font-size:12.5px;padding:7px 9px;border:1px solid var(--border);border-radius:7px;box-sizing:border-box;outline:none;"></div></div>'
    +'<div id="conf-bearer" style="display:'+(cc.auth_type==='basic'?'none':'block')+';">'+f('토큰(PAT)'+(cc.token==='***'?' <span style="color:#00875a;">✓ 저장됨</span>':''),'conf-token',(cc.token==='***'?'********':''),(cc.token==='***'?'저장됨 — 변경하려면 새로 입력':'토큰 입력'),'password')+'</div>'
    +'<div id="conf-basic" style="display:'+(cc.auth_type==='basic'?'block':'none')+';"><div style="display:flex;gap:10px;"><div style="flex:1;">'+f('아이디','conf-user',cc.username,'username')+'</div><div style="flex:1;">'+f('비밀번호'+(cc.password==='***'?' <span style="color:#00875a;">✓ 저장됨</span>':''),'conf-pass',(cc.password==='***'?'********':''),(cc.password==='***'?'저장됨 — 변경하려면 새로 입력':'비밀번호 입력'),'password')+'</div></div></div>'
    +'<div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap;"><button onclick="confSave()" style="font-size:13px;font-weight:800;padding:8px 18px;border:none;border-radius:8px;background:#2d6fd4;color:#fff;cursor:pointer;">저장</button><button onclick="confTest()" style="font-size:13px;font-weight:700;padding:8px 14px;border:1px solid var(--border);border-radius:8px;background:#fff;color:var(--text2);cursor:pointer;"><i class="ti ti-plug"></i> 연결테스트</button><span id="conf-result" style="font-size:12px;color:var(--text3);"></span></div>'
  +'</div>';
}
function confAuthToggle(){ var a=((document.getElementById('conf-auth')||{}).value); var bz=document.getElementById('conf-bearer'),bs=document.getElementById('conf-basic'); if(bz)bz.style.display=(a==='basic'?'none':'block'); if(bs)bs.style.display=(a==='basic'?'block':'none'); }
function _confGather(){ var v=function(id){return ((document.getElementById(id)||{}).value||'').trim();}; var p={base_url:v('conf-url'),auth_type:v('conf-auth'),space_key:v('conf-space'),username:v('conf-user'),live_query:!!(document.getElementById('conf-live')||{}).checked}; var tk=v('conf-token'); if(tk && tk!=='********')p.token=tk; var pw=v('conf-pass'); if(pw && pw!=='********')p.password=pw; return p; }
async function confSave(){ try{ await userApi('POST','/api/confluence/config',_confGather()); if(typeof showToast==='function')showToast('Confluence 설정 저장됨'); renderManuals(); }catch(e){ if(typeof showToast==='function')showToast('실패: '+e.message); } }
async function confTest(){ var el=document.getElementById('conf-result'); if(el){el.style.color='var(--text3)';el.textContent='저장 후 테스트…';} try{ await userApi('POST','/api/confluence/config',_confGather()); var d=await userApi('POST','/api/confluence/test',{});
  if(el){ if(d.ok){ el.style.color='#00875a';
      if(d.space){ el.innerHTML='✅ 스페이스 <b>'+(d.space.key||'')+'</b>'+(d.space.name?(' ('+String(d.space.name).replace(/</g,'&lt;')+')'):'')+' 접근 확인 — 검색 준비 완료'; }
      else { el.innerHTML='✅ 연결됨 · 접근 가능 스페이스 '+(d.spaces||[]).length+'개'+((d.spaces&&d.spaces.length)?(' ('+d.spaces.slice(0,6).map(function(s){return s.key;}).join(', ')+')'):''); } }
    else { el.style.color='#e53e5a'; el.innerHTML='❌ '+String(d.error||'').replace(/</g,'&lt;')+((d.spaces&&d.spaces.length)?('<br><span style="color:var(--text3);">접근 가능 스페이스: '+d.spaces.slice(0,12).map(function(s){return s.key;}).join(', ')+'</span>'):''); } }
}catch(e){ if(el){el.style.color='#e53e5a';el.textContent='실패: '+e.message;} } }
// ══════════ 지식 소스 통합 설정 (AI Assistant › 지식 소스 설정) ══════════
// ① 일반 gemma 검색 ② UTOP 내부 지식(시험절차+매뉴얼) ③ Jira 전용 검색 ④ Confluence(스페이스+상위페이지 범위)
async function renderKnowledgeSrc(){
  var box=document.getElementById('knowledge-src-body'); if(!box) return;
  box.innerHTML='<div style="padding:40px;text-align:center;color:var(--text3);"><span class="ring-spin" style="width:18px;height:18px;border-width:2px;"></span> 불러오는 중…</div>';
  var d={}; try{ d=await (await fetch('/api/knowledge-sources')).json(); }catch(e){ d={}; }
  window._ksrcCfg=d; window._ksrcScopes=(d.confluence_scopes||[]).slice();
  box.innerHTML=_ksrcHtml(d);
}
function _ksrcCard(icon,color,title,desc,onKey,on,extraHtml){
  return '<div style="border:1px solid var(--border);border-radius:12px;padding:16px 18px;background:var(--bg2);margin-bottom:14px;">'
    +'<div style="display:flex;align-items:center;gap:12px;">'
      +'<span style="width:38px;height:38px;border-radius:10px;background:'+color+'1a;color:'+color+';display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="ti '+icon+'" style="font-size:20px;"></i></span>'
      +'<div style="flex:1;min-width:0;"><div style="font-size:14.5px;font-weight:800;color:var(--text);">'+title+'</div><div style="font-size:11.5px;color:var(--text3);">'+desc+'</div></div>'
      +'<label style="flex-shrink:0;display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:700;cursor:pointer;padding:6px 12px;border-radius:20px;border:1px solid '+(on?'#a8e0c8':'var(--border)')+';background:'+(on?'#f0fbf6':'var(--bg3)')+';color:'+(on?'#00875a':'var(--text3)')+';"><input type="checkbox" '+(on?'checked':'')+' onchange="_ksrcToggle(\''+onKey+'\',this.checked)" style="width:15px;height:15px;accent-color:#00a872;">'+(on?'활성':'비활성')+'</label>'
    +'</div>'
    +(extraHtml?('<div style="margin-top:13px;padding-top:13px;border-top:1px dashed var(--border);">'+extraHtml+'</div>'):'')
  +'</div>';
}
function _ksrcHtml(d){
  var scopes=window._ksrcScopes||[];
  var scopeRows=scopes.length
    ? scopes.map(function(sc,i){
        return '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:'+(sc.enabled?'var(--bg2)':'var(--bg3)')+';margin-bottom:6px;">'
          +'<input type="checkbox" '+(sc.enabled?'checked':'')+' onchange="_ksrcScopeSet('+i+',\'enabled\',this.checked)" style="width:15px;height:15px;accent-color:#0d9488;flex-shrink:0;">'
          +'<div style="flex:1;min-width:0;display:flex;gap:8px;flex-wrap:wrap;">'
            +'<input value="'+_ksrcEsc(sc.label)+'" placeholder="표시 이름(예: 스펙, 주간업무)" onchange="_ksrcScopeSet('+i+',\'label\',this.value)" style="flex:1;min-width:120px;font-size:12px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);color:var(--text);outline:none;">'
            +'<input value="'+_ksrcEsc(sc.space_key)+'" placeholder="Space Key" onchange="_ksrcScopeSet('+i+',\'space_key\',this.value)" style="width:110px;font-size:12px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);color:var(--text);outline:none;font-family:ui-monospace,monospace;">'
            +'<input value="'+_ksrcEsc(sc.parent_title)+'" placeholder="상위 페이지 제목(하위 전체 포함)" onchange="_ksrcScopeSet('+i+',\'parent_title\',this.value)" style="flex:1.4;min-width:180px;font-size:12px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg2);color:var(--text);outline:none;">'
          +'</div>'
          +'<button type="button" onclick="_ksrcScopeDel('+i+')" title="삭제" style="flex-shrink:0;width:26px;height:26px;border:1px solid rgba(229,62,90,0.3);border-radius:6px;background:#fff;color:var(--red);cursor:pointer;"><i class="ti ti-trash" style="font-size:13px;"></i></button>'
        +'</div>';
      }).join('')
    : '<div style="font-size:11.5px;color:var(--text3);padding:8px 2px;">등록된 범위가 없습니다 — 미등록 시 기존 기본 범위(스펙/디버깅 자동 판별)로 검색됩니다.</div>';
  var confExtra='<div style="font-size:11.5px;color:var(--text3);margin-bottom:9px;line-height:1.5;">스페이스 + 상위 페이지 제목을 등록하면 그 <b>하위 페이지 전체</b>가 검색 범위가 됩니다. 여러 개 등록해 각각 켜고 끌 수 있습니다.</div>'
    +scopeRows
    +'<button type="button" onclick="_ksrcScopeAdd()" style="margin-top:4px;font-size:12px;font-weight:700;padding:7px 14px;border:1px dashed var(--border);border-radius:8px;background:var(--bg2);color:#2d6fd4;cursor:pointer;"><i class="ti ti-plus"></i> 범위 추가</button>'
    +'<div style="margin-top:12px;display:flex;align-items:center;gap:8px;"><button onclick="_ksrcSave()" style="font-size:13px;font-weight:800;padding:8px 18px;border:none;border-radius:8px;background:#2d6fd4;color:#fff;cursor:pointer;"><i class="ti ti-device-floppy"></i> 저장</button><span id="ksrc-save-msg" style="font-size:12px;color:var(--text3);"></span><span style="flex:1;"></span><a href="javascript:void(0)" onclick="showPage(\'manual\')" style="font-size:11.5px;color:var(--text3);text-decoration:none;">Confluence 접속 정보는 RAG Data 화면에서 설정 →</a></div>';
  var jiraExtra='<a href="javascript:void(0)" onclick="showPage(\'sys-jira-search\')" style="font-size:11.5px;color:#2d6fd4;text-decoration:none;">Jira 서버 접속 정보는 Jira Search 설정에서 관리 →</a>';
  return '<div style="font-size:20px;font-weight:800;color:var(--text);margin-bottom:4px;">지식 소스 설정</div>'
    +'<div style="font-size:12px;color:var(--text3);margin-bottom:20px;line-height:1.6;">AI가 질문에 답할 때 어떤 지식 소스를 검색할지 켜고 끕니다. 여기서 끈 소스는 모든 어시스턴트·지식 검색에서 검색되지 않습니다.</div>'
    +_ksrcCard('ti-message-2','#e8820c','① 일반 gemma 검색','지식 소스 없이 LLM과 순수 대화(일반 검색 모드)','general',d.general!==false)
    +_ksrcCard('ti-database-search','#7c3aed','② UTOP 내부 시험 관련 지식 검색','시험절차 학습 데이터 + RAG Data(매뉴얼·문서)를 근거로 답변','internal',d.internal!==false)
    +_ksrcCard('ti-ticket','#2684ff','③ Jira 전용 검색','UMS(Jira) 이슈를 JQL로 검색해 답변','jira',d.jira!==false)
    +_ksrcCard('ti-brand-confluence','#0d9488','④ Confluence 지식 검색','등록한 스페이스·상위 페이지(하위 포함) 범위에서 검색','confluence',d.confluence!==false,confExtra);
}
function _ksrcEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
function _ksrcToggle(key,val){ if(window._ksrcCfg) window._ksrcCfg[key]=val; var box=document.getElementById('knowledge-src-body'); if(box) box.innerHTML=_ksrcHtml(window._ksrcCfg||{}); }
function _ksrcScopeAdd(){ window._ksrcScopes=window._ksrcScopes||[]; window._ksrcScopes.push({label:'',space_key:'',parent_title:'',enabled:true}); var box=document.getElementById('knowledge-src-body'); if(box) box.innerHTML=_ksrcHtml(window._ksrcCfg||{}); }
function _ksrcScopeDel(i){ if(window._ksrcScopes) window._ksrcScopes.splice(i,1); var box=document.getElementById('knowledge-src-body'); if(box) box.innerHTML=_ksrcHtml(window._ksrcCfg||{}); }
function _ksrcScopeSet(i,field,val){ if(window._ksrcScopes&&window._ksrcScopes[i]) window._ksrcScopes[i][field]=val; }
// scopes 즉시 저장 — _confSaveAll 로 위임 (프론트 편집 필드만 정확히 전송, 서버 재조회로 로컬 캐시 동기화)
async function _ksrcSaveScopes(){
  try{
    if(typeof _confSaveAll==='function') await _confSaveAll(false);
  }catch(e){}
}
async function _ksrcSave(){
  var msg=document.getElementById('ksrc-save-msg'); if(msg){ msg.style.color='var(--text3)'; msg.textContent='저장 중…'; }
  var cfg=window._ksrcCfg||{};
  try{
    await userApi('POST','/api/knowledge-sources',{general:cfg.general!==false,internal:cfg.internal!==false,jira:cfg.jira!==false,confluence:cfg.confluence!==false});
    await userApi('POST','/api/confluence/config',{scopes:(window._ksrcScopes||[]).filter(function(s){return (s.parent_title||'').trim();})});
    if(msg){ msg.style.color='#00875a'; msg.textContent='✅ 저장됨'; }
    if(typeof showToast==='function') showToast('지식 소스 설정 저장됨');
  }catch(e){ if(msg){ msg.style.color='#e53e5a'; msg.textContent='❌ 저장 실패: '+(e&&e.message||e); } }
}
function manualFolderSelect(f){ window._manualFolder=f; renderManuals(); }
async function _manualSetFolder(id, folder){ try{ var full=await (await fetch('/api/manual/'+id)).json(); full.folder=folder; await fetch('/api/manual/'+id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(full)}); var m=manualList.find(function(x){return x.id===id;}); if(m)m.folder=folder; }catch(e){} }
async function manualMoveFolder(id, folder){ await _manualSetFolder(id, folder); if(typeof showToast==='function')showToast('폴더 이동됨'); renderManuals(); }
async function manualAddFolder(){ var n=prompt('새 분류(폴더) 이름'); if(!n||!n.trim())return; var fs=(window._manualFolders||[]).slice(); if(fs.indexOf(n.trim())<0)fs.push(n.trim()); try{ await userApi('POST','/api/manual-folders',{folders:fs}); window._manualFolder=n.trim(); renderManuals(); }catch(e){ if(typeof showToast==='function')showToast('실패: '+e.message); } }
async function manualFolderDelete(f){ if(!confirm('분류 "'+f+'" 삭제? (안의 문서는 미분류로 이동)'))return; var fs=(window._manualFolders||[]).filter(function(x){return x!==f;}); try{ await userApi('POST','/api/manual-folders',{folders:fs}); for(var i=0;i<manualList.length;i++){ if(manualList[i].folder===f){ await _manualSetFolder(manualList[i].id,''); } } if(window._manualFolder===f)window._manualFolder=''; renderManuals(); }catch(e){ if(typeof showToast==='function')showToast('실패: '+e.message); } }
async function renderManuals(){
  const wrap=document.getElementById('manual-list'); if(!wrap) return;
  const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  var _rag={total_chunks:0,by_manual:{},chunk_size:500,overlap:80}; try{ _rag=await (await fetch('/api/rag/info')).json(); }catch(e){}
  var _rc={embed_url:'',embed_model:'bge-m3',rerank_url:'',rerank_model:'bge-reranker-v2-m3',use_embed:true,use_rerank:true,min_score:0}; try{ _rc=await (await fetch('/api/rag/config')).json(); }catch(e){}
  var _cc={base_url:'',auth_type:'bearer',space_key:''}; try{ _cc=await (await fetch('/api/confluence/config')).json(); }catch(e){}
  var _folders=[]; try{ _folders=((await (await fetch('/api/manual-folders')).json()).folders)||[]; }catch(e){}
  window._manualFolders=_folders;
  window._manualTab=window._manualTab||'chunks';
  if(window._manualFolder===undefined) window._manualFolder='';
  var curF=window._manualFolder, tab=window._manualTab, _setOn=!!(_rc.embed_url||_rc.rerank_url);
  const srcColor={Word:'#2d6fd4',PDF:'#e53e5a',Text:'#00a872',PPT:'#e8820c',Image:'#7c3aed'};
  var cnt=function(f){ return manualList.filter(function(m){ return f===''?true:(f==='__none'?!m.folder:m.folder===f); }).length; };
  // ── COL1: 분류(폴더) ──
  var fItem=function(key,label,delable){ var on=curF===key; return '<div onclick="manualFolderSelect(\''+key+'\')" style="display:flex;align-items:center;gap:6px;padding:7px 9px;border-radius:7px;cursor:pointer;margin-bottom:3px;font-size:12.5px;'+(on?'background:#ede7fb;color:#7c3aed;font-weight:800;':'color:var(--text2);')+'"><i class="ti '+(key===''?'ti-folders':key==='__none'?'ti-folder-off':'ti-folder')+'" style="font-size:14px;"></i><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(label)+'</span><span style="font-size:10px;color:var(--text3);">'+cnt(key)+'</span>'+(delable?'<i class="ti ti-x" onclick="event.stopPropagation();manualFolderDelete(\''+esc(key).replace(/\\\'/g,"")+'\')" style="font-size:12px;color:#c0c6d0;" title="분류 삭제"></i>':'')+'</div>'; };
  var col1='<div style="width:178px;flex-shrink:0;display:flex;flex-direction:column;min-height:0;border-right:1px solid var(--border);padding-right:10px;overflow-y:auto;"><div style="font-size:11px;font-weight:800;color:var(--text3);margin-bottom:8px;"><i class="ti ti-folders"></i> 분류</div>'+fItem('','전체',false)+_folders.map(function(f){return fItem(f,f,true);}).join('')+fItem('__none','미분류',false)+'<button onclick="manualAddFolder()" style="margin-top:8px;font-size:11.5px;padding:6px;border:1px dashed var(--border);border-radius:7px;background:#fff;color:#7c3aed;cursor:pointer;"><i class="ti ti-plus"></i> 폴더 추가</button></div>';
  // ── COL2: 파일 ──
  var files=manualList.filter(function(m){ return curF===''?true:(curF==='__none'?!m.folder:m.folder===curF); });
  var folderOpts=function(cur){ return '<option value=""'+(!cur?' selected':'')+'>(미분류)</option>'+_folders.map(function(f){return '<option'+(cur===f?' selected':'')+'>'+esc(f)+'</option>';}).join(''); };
  var fileCards=files.length?files.map(function(m){
    var col=srcColor[m.source]||'var(--text3)', sel=window._manualSel===m.id;
    var ck=(m.active&&_rag.by_manual&&_rag.by_manual[m.name])?_rag.by_manual[m.name]:0;
    return '<div onclick="manualSelect(\''+m.id+'\')" style="border:1px solid '+(sel?'#7c3aed':'var(--border)')+';border-radius:9px;background:'+(sel?'#faf7ff':'#fff')+';padding:9px 10px;margin-bottom:7px;cursor:pointer;'+(m.active?'':'opacity:0.6;')+'">'
      +'<div style="display:flex;align-items:center;gap:7px;"><i class="ti ti-file-text" style="font-size:16px;color:'+col+';flex-shrink:0;"></i><div style="flex:1;min-width:0;"><div style="font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(m.name)+'</div><div style="font-size:9.5px;color:var(--text3);"><span style="color:'+col+';font-weight:700;">'+esc(m.source||'')+'</span>'+(ck?(' · '+ck+'청크'):'')+(m.image_count?(' · <span style="color:#e8820c;">📷'+m.image_count+'</span>'):'')+'</div></div></div>'
      +'<div style="display:flex;align-items:center;gap:5px;margin-top:7px;" onclick="event.stopPropagation()"><input type="checkbox" '+(m.active?'checked':'')+' onclick="manualToggleActive(\''+m.id+'\')" title="AI 참고" style="width:13px;height:13px;accent-color:var(--green);cursor:pointer;"><select onchange="manualMoveFolder(\''+m.id+'\',this.value)" title="분류 이동" style="flex:1;min-width:0;font-size:10.5px;padding:3px 5px;border:1px solid var(--border);border-radius:6px;cursor:pointer;">'+folderOpts(m.folder)+'</select><button onclick="manualView(\''+m.id+'\')" title="원문" style="font-size:10px;padding:3px 6px;border:1px solid var(--border);border-radius:6px;background:#fff;cursor:pointer;"><i class="ti ti-eye"></i></button><button onclick="manualDelete(\''+m.id+'\')" title="삭제" style="font-size:10px;padding:3px 6px;border:1px solid var(--border);border-radius:6px;background:#fff;color:var(--red);cursor:pointer;"><i class="ti ti-trash"></i></button></div></div>';
  }).join(''):'<div style="padding:24px;text-align:center;color:var(--text3);font-size:12px;">이 분류에 문서가 없습니다.</div>';
  var dropzone='<div id="manual-dropzone" ondragover="event.preventDefault();this.style.background=\'#eef3ff\';" ondragleave="this.style.background=\'\';" ondrop="manualDrop(event)" onclick="document.getElementById(\'manual-file\').click()" style="border:2px dashed var(--border);border-radius:9px;padding:12px;text-align:center;cursor:pointer;margin-bottom:10px;color:var(--text3);font-size:11.5px;background:#fff;"><i class="ti ti-cloud-upload" style="font-size:20px;color:#2d6fd4;"></i> 끌어다 놓기 / 클릭</div>';
  var _im=(typeof _manualImgMode!=='undefined'?_manualImgMode:'off');
  var imgModeBar='<div style="margin-bottom:9px;"><div style="font-size:10px;color:var(--text3);font-weight:700;margin-bottom:4px;">📷 문서 속 이미지 처리</div><div style="display:flex;gap:4px;">'+[['off','끔'],['ocr','OCR'],['vision','AI비전']].map(function(o){ var on=_im===o[0]; return '<button onclick="manualSetImgMode(\''+o[0]+'\')" style="flex:1;padding:5px 2px;border:1px solid '+(on?'#7c3aed':'var(--border)')+';border-radius:6px;background:'+(on?'#ede7fb':'#fff')+';color:'+(on?'#7c3aed':'var(--text2)')+';font-weight:'+(on?'800':'600')+';cursor:pointer;font-size:10.5px;">'+o[1]+'</button>'; }).join('')+'</div>'+(_im!=='off'?'<div style="font-size:9.5px;color:#b5730f;margin-top:3px;">업로드·학습 시 이미지 속 글자를 '+(_im==='vision'?'AI비전':'OCR')+'으로 추출</div>':'<div style="font-size:9.5px;color:var(--text3);margin-top:3px;">사진은 보관만 됨(글자 학습 안 함)</div>')+'</div>';
  var col2='<div style="width:960px;flex-shrink:0;display:flex;flex-direction:column;min-height:0;border-right:1px solid var(--border);padding:0 10px;overflow-y:auto;"><div style="font-size:11px;font-weight:800;color:var(--text3);margin-bottom:8px;"><i class="ti ti-file-text"></i> 파일 ('+files.length+')</div>'+imgModeBar+dropzone+fileCards+'</div>';
  // ── COL3: 청크 / 검색 / 설정 ──
  var tb=function(k,ic,lab){ return '<div onclick="manualTab(\''+k+'\')" style="padding:7px 13px;font-size:12px;font-weight:700;cursor:pointer;border-bottom:2px solid '+(tab===k?'#7c3aed':'transparent')+';color:'+(tab===k?'#7c3aed':'var(--text3)')+';"><i class="ti '+ic+'"></i> '+lab+'</div>'; };
  var tabbar='<div style="display:flex;gap:2px;border-bottom:1px solid var(--border);margin-bottom:12px;flex-shrink:0;align-items:center;">'+tb('chunks','ti-stack-2','청크')+tb('search','ti-search','검색 테스트')+tb('rag','ti-settings','RAG 설정')+'<span style="flex:1;"></span><span style="font-size:10.5px;color:'+(_setOn?'#00875a':'#b5730f')+';font-weight:700;padding-right:6px;">'+(_setOn?'하이브리드':'BM25')+' · 총 '+(_rag.total_chunks||0).toLocaleString()+'청크</span></div>';
  var rb='';
  if(tab==='chunks'){ rb='<div id="manual-chunks-body"><div style="padding:30px;text-align:center;color:var(--text3);"><i class="ti ti-arrow-left" style="font-size:20px;opacity:0.3;display:block;margin-bottom:6px;"></i>가운데에서 파일을 선택하면<br>청크·이미지가 표시됩니다.</div></div>'; }
  else if(tab==='search'){ rb='<div style="display:flex;gap:8px;"><input id="rag-play-q" onkeydown="if(event.key===\'Enter\')ragPlayRun()" placeholder="예: vlan 설정 / 메모리 확인" style="flex:1;font-size:13px;padding:9px 12px;border:1px solid var(--border);border-radius:8px;outline:none;"><button onclick="ragPlayRun()" style="font-size:13px;font-weight:700;padding:9px 18px;border:none;border-radius:8px;background:#2d6fd4;color:#fff;cursor:pointer;"><i class="ti ti-send"></i> 검색</button></div><div id="rag-play-res" style="margin-top:12px;"></div>'; }
  else { rb=ragSettingsBody(_rc)+confluenceBody(_cc); }
  var col3='<div style="flex:1;min-width:0;display:flex;flex-direction:column;min-height:0;padding-left:12px;overflow-y:auto;">'+tabbar+'<div style="flex:1;min-height:0;">'+rb+'</div></div>';
  wrap.innerHTML='<div style="display:flex;height:100%;min-height:0;">'+col1+col2+col3+'</div>';
  if(tab==='chunks'&&window._manualSel){ var m=manualList.find(function(x){return x.id===window._manualSel;}); if(m) manualLoadChunks(m); }
}
function _ragGatherCfg(){ var v=function(id){return ((document.getElementById(id)||{}).value||'').trim();}; return {embed_url:v('rag-embed-url'),embed_model:v('rag-embed-model'),rerank_url:v('rag-rerank-url'),rerank_model:v('rag-rerank-model'),use_embed:!!(document.getElementById('rag-use-embed')||{}).checked,use_rerank:!!(document.getElementById('rag-use-rerank')||{}).checked,min_score:parseFloat((document.getElementById('rag-min-score')||{}).value)||0}; }
async function ragSaveConfig(){ try{ await userApi('POST','/api/rag/config',_ragGatherCfg()); showToast('RAG 설정 저장됨 — 첫 검색 시 임베딩 자동 재색인'); renderManuals(); }catch(e){ showToast('저장 실패: '+((e&&e.message)||e)); } }
async function ragPlayRun(){
  var q=((document.getElementById('rag-play-q')||{}).value||'').trim();
  var res=document.getElementById('rag-play-res'); if(!q){ if(res)res.innerHTML=''; return; }
  var esc=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');};
  if(res)res.innerHTML='<div style="color:#2d6fd4;font-size:12px;padding:8px;"><i class="ti ti-loader-2 spin"></i> 검색 중… (첫 검색은 임베딩으로 수 초 소요)</div>';
  try{ var d=await (await fetch('/api/rag/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:q,top_k:6})})).json();
    if(!d.hits||!d.hits.length){ if(res)res.innerHTML='<div style="color:var(--text3);font-size:12px;padding:14px;text-align:center;border:1px dashed var(--border);border-radius:8px;">검색 결과 없음 — 활성 매뉴얼에 관련 내용이 없거나 미색인</div>'; return; }
    var html='<div style="font-size:11px;color:var(--text3);margin-bottom:8px;">검색 모드: <b style="color:#7c3aed;">'+esc(d.mode||'')+'</b> · 청크 '+d.hits.length+'개 / 총 '+(d.total_chunks||0).toLocaleString()+'</div>';
    html+=d.hits.map(function(h,i){ var imgs=(h.images&&h.images.length)?('<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:7px;">'+h.images.map(function(im){return '<img src="'+im+'" style="width:140px;height:96px;object-fit:cover;border-radius:6px;border:1px solid var(--border);cursor:zoom-in;" onclick="window.open(\''+im+'\',\'_blank\')">';}).join('')+'</div>'):''; return '<div style="border:1px solid var(--border);border-radius:8px;padding:9px 12px;margin-bottom:7px;background:#fff;"><div style="display:flex;align-items:center;gap:7px;margin-bottom:4px;"><span style="font-size:10px;font-weight:800;color:#fff;background:#7c3aed;border-radius:5px;padding:1px 7px;flex-shrink:0;">'+(i+1)+'</span><span style="font-size:10.5px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><i class="ti ti-file-text" style="font-size:11px;"></i> '+esc(h.name||'')+(h.images&&h.images.length?(' <span style="color:#e8820c;">📷'+h.images.length+'</span>'):'')+'</span></div><div style="font-size:12px;color:var(--text2);line-height:1.55;white-space:pre-wrap;max-height:130px;overflow:auto;background:var(--bg3);border-radius:6px;padding:7px 9px;">'+esc(h.text||'')+'</div>'+imgs+'</div>'; }).join('');
    if(res)res.innerHTML=html;
  }catch(e){ if(res)res.innerHTML='<div style="color:#e53e5a;padding:8px;">오류: '+((e&&e.message)||e)+'</div>'; }
}
async function ragTestConn(){
  var el=document.getElementById('rag-test-result'); if(el){ el.style.color='var(--text3)'; el.textContent='저장 후 테스트 중…'; }
  try{ await userApi('POST','/api/rag/config',_ragGatherCfg());
    var d=await userApi('POST','/api/rag/test',{});
    var eo=d.embed&&d.embed.ok, ro=d.rerank&&d.rerank.ok;
    if(el){ el.style.color=(eo||ro)?'#00875a':'#e53e5a'; el.innerHTML='임베딩 '+(eo?('✅ dim '+d.embed.dim):'❌')+' · 리랭커 '+(ro?'✅':'❌'); }
  }catch(e){ if(el){ el.style.color='#e53e5a'; el.textContent='실패: '+((e&&e.message)||e); } }
}
async function manualToggleActive(id){
  const m=manualList.find(x=>x.id===id); if(!m) return;
  try{ const full=await (await fetch('/api/manual/'+id)).json(); full.active=!m.active; await fetch('/api/manual/'+id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(full)}); m.active=full.active; }catch(e){}
  renderManuals();
}
async function manualDelete(id){
  const m=manualList.find(x=>x.id===id);
  if(!confirm('"'+((m&&m.name)||'')+'" 매뉴얼을 삭제할까요?')) return;
  try{ await fetch('/api/manual/'+id,{method:'DELETE'}); }catch(e){}
  _manualClearCache();
  await loadManuals(); renderManuals();
}
function _manualCloseView(){ const o=document.getElementById('manual-view-ov'); if(o) o.remove(); }
let _manualViewMode='render';
function _manualViewBodyHtml(full){
  var esc=function(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');};
  if(_manualViewMode==='raw'){ return '<pre style="flex:1;overflow:auto;margin:0;padding:16px 20px;white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,SFMono-Regular,monospace;font-size:12.5px;line-height:1.65;color:var(--text);">'+esc(full.text)+'</pre>'; }
  var md=String(full.text||''), imgs=full.images||[];
  md=md.replace(/\[\[IMG:(\d+)\]\]/g,function(mm,n){ var im=imgs[+n], src=(im&&im.data)||im; return src?('\n\n![]('+src+')\n\n'):''; });
  var html=(typeof formatMsg==='function')?formatMsg(md):('<pre>'+esc(md)+'</pre>');
  return '<div class="manual-rendered" style="flex:1;overflow:auto;margin:0;padding:16px 24px;font-size:13.5px;line-height:1.7;color:var(--text);">'+html+'</div>';
}
function _manualViewSwitch(m){ _manualViewMode=m; _manualViewRender(); }
function _manualViewRender(){
  var ov=document.getElementById('manual-view-ov'), full=window._manualViewFull; if(!ov||!full) return;
  var esc=function(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');};
  var toggle='<div style="display:flex;gap:3px;margin-right:6px;">'+[['render','렌더링'],['raw','원문']].map(function(o){var on=_manualViewMode===o[0];return '<button onclick="_manualViewSwitch(\''+o[0]+'\')" style="font-size:11px;padding:4px 11px;border:1px solid '+(on?'#2d6fd4':'var(--border)')+';border-radius:6px;background:'+(on?'#eaf1fe':'#fff')+';color:'+(on?'#2d6fd4':'var(--text2)')+';font-weight:'+(on?'800':'600')+';cursor:pointer;">'+o[1]+'</button>';}).join('')+'</div>';
  ov.innerHTML='<style>#manual-view-ov .manual-rendered img{max-width:100%;height:auto;border-radius:8px;margin:6px 0;}#manual-view-ov .manual-rendered pre{background:#f5f6f8;color:#24292e;border:1px solid var(--border);padding:12px 14px;border-radius:8px;overflow:auto;font-size:12.5px;line-height:1.55;}#manual-view-ov .manual-rendered pre code{background:none;color:inherit;}#manual-view-ov .manual-rendered :not(pre)>code{background:#eef0f4;padding:1px 5px;border-radius:4px;font-size:.92em;}#manual-view-ov .manual-rendered table{border-collapse:collapse;margin:8px 0;width:auto;}#manual-view-ov .manual-rendered th,#manual-view-ov .manual-rendered td{border:1px solid var(--border);padding:5px 9px;}#manual-view-ov .manual-rendered h1,#manual-view-ov .manual-rendered h2,#manual-view-ov .manual-rendered h3{margin:14px 0 7px;border-bottom:none;}</style>'
    +'<div style="background:#fff;border-radius:14px;width:820px;max-width:94vw;height:82vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.3);">'
    +'<div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:9px;flex-shrink:0;"><i class="ti ti-book-2" style="color:var(--blue);font-size:19px;"></i><b style="flex:1;font-size:15px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(full.name)+'</b>'+toggle+'<span style="font-size:11px;color:var(--text3);">'+(full.chars||0).toLocaleString()+'자</span><i class="ti ti-x" onclick="_manualCloseView()" style="font-size:20px;cursor:pointer;color:var(--text3);margin-left:6px;"></i></div>'
    +_manualViewBodyHtml(full)
  +'</div>';
}
async function manualView(id){
  let full=null; try{ full=await (await fetch('/api/manual/'+id)).json(); }catch(e){ alert('불러오기 실패'); return; }
  window._manualViewFull=full; _manualCloseView();
  const ov=document.createElement('div'); ov.id='manual-view-ov';
  ov.style.cssText='position:fixed;inset:0;background:rgba(15,20,35,0.5);z-index:11200;display:flex;align-items:center;justify-content:center;';
  ov.onclick=function(e){ if(e.target===ov) _manualCloseView(); };
  document.body.appendChild(ov);
  _manualViewRender();
}
let _manualTextCache={};
function _manualClearCache(){ _manualTextCache={}; }
function _chunkText(text, size){
  size=size||1100;
  const lines=String(text||'').split(/\r?\n/);
  const chunks=[]; let cur='';
  for(const ln of lines){
    if((cur+'\n'+ln).length>size){ if(cur.trim()) chunks.push(cur); cur=ln; }
    else cur+=(cur?'\n':'')+ln;
  }
  if(cur.trim()) chunks.push(cur);
  return chunks;
}
function _queryKeywords(q){
  const ws=String(q||'').toLowerCase().match(/[a-z0-9]{2,}|[가-힣]{2,}/g)||[];
  return [...new Set(ws)].slice(0,50);
}
function _scoreChunk(chunkLc, kws){
  let s=0;
  for(const k of kws){ let i=0,c=0; while((i=chunkLc.indexOf(k,i))>=0){ c++; i+=k.length; if(c>=12)break; } s+=c; }
  return s;
}
// 활성 매뉴얼에서 query(REQ)와 관련된 부분만 발췌해 LLM 컨텍스트로 반환 (대용량 대응)
async function getActiveManualText(maxChars, query){
  maxChars=maxChars||60000;
  let list=[]; try{ list=(await (await fetch('/api/manuals')).json()).manuals||[]; }catch(e){ return ''; }
  const active=list.filter(m=>m.active);
  if(!active.length) return '';
  const texts=[];
  for(const m of active){
    let t=_manualTextCache[m.id];
    if(t==null){ try{ t=((await (await fetch('/api/manual/'+m.id)).json()).text)||''; }catch(e){ t=''; } _manualTextCache[m.id]=t; }
    if(t) texts.push({name:m.name||'', text:t});
  }
  const total=texts.reduce((s,x)=>s+x.text.length,0);
  // 작으면 전체 주입
  if(total<=maxChars || !query){
    let out=''; for(const x of texts){ out+='\n## 매뉴얼: '+x.name+'\n'+x.text+'\n'; if(out.length>=maxChars) break; }
    return out.slice(0,maxChars);
  }
  // 크면 키워드 검색으로 관련 청크만 발췌
  const kws=_queryKeywords(query);
  let scored=[];
  for(const x of texts){
    const chunks=_chunkText(x.text,1100);
    for(let i=0;i<chunks.length;i++){ const sc=_scoreChunk(chunks[i].toLowerCase(),kws); if(sc>0) scored.push({name:x.name,score:sc,text:chunks[i]}); }
  }
  scored.sort((a,b)=>b.score-a.score);
  let out='', n=0;
  for(const c of scored){
    if(out.length+c.text.length>maxChars) break;
    out+='\n## '+c.name+' (관련 발췌)\n'+c.text+'\n'; if(++n>=50) break;
  }
  if(!out){ out=texts[0].text.slice(0,maxChars); } // 매칭 없으면 앞부분
  return ('[대용량 매뉴얼에서 이 REQ와 관련된 부분만 발췌함]\n'+out).slice(0,maxChars+60);
}
// 검증된 시험절차 학습 데이터에서 질의와 관련된 항목 발췌 (TC 생성·채팅 근거)
async function getRelevantLearnedText(query, maxChars){
  maxChars=maxChars||8000;
  let items=[]; try{ items=((await (await fetch('/api/learn/procedures?limit=500')).json()).items)||[]; }catch(e){ return ''; }
  if(!items.length) return '';
  const terms=String(query||'').toLowerCase().split(/\s+/).filter(t=>t.length>=2);
  const score=it=>{ const hay=((it.title||'')+' '+((it.models||[]).join(' '))+' '+(it.role||'')+' '+((it.steps||[]).map(s=>(s.desc||'')+' '+(s.cli||'')+' '+(s.imageText||'')).join(' '))).toLowerCase(); return terms.length?terms.reduce((n,t)=>n+(hay.indexOf(t)>=0?1:0),0):0; };
  const hits=items.map(it=>[score(it),it]).filter(x=>x[0]>0).sort((a,b)=>b[0]-a[0]).slice(0,5).map(x=>x[1]);
  if(!hits.length) return '';
  let txt='';
  hits.forEach(it=>{ txt+='\n■ '+(it.title||'')+' (모델 '+((it.models||[]).join(','))+' / '+(it.role||'')+')\n'; (it.steps||[]).forEach(s=>{ txt+='   - '+(s.desc||'')+': '+(s.cli||'')+' [판정 '+(s.type||'')+' "'+(s.criteria||'')+'"]'+(s.output?(' / 정상출력: '+String(s.output).replace(/\s+/g,' ').slice(0,120)):'')+(s.imageText?(' / 이미지인식: '+String(s.imageText).replace(/\s+/g,' ').slice(0,120)):'')+'\n'; }); });
  if(txt.length>maxChars) txt=txt.slice(0,maxChars)+' …(생략)';
  return txt;
}

// ══════════════ 플로팅 AI 어시스턴트 ══════════════
let _aiFabOpen=false, _aiFabInit=false;
let _aiFabModelPick='';
function _aiFabFillModels(){
  const sel=document.getElementById('ai-fab-model'); if(!sel) return;
  const L=(typeof llmList!=='undefined'?llmList:[]).filter(function(x){return x.status==='active';});
  const D=(typeof difyList!=='undefined'?difyList:[])||[];
  var esc=function(s){return String(s==null?'':s).replace(/</g,'&lt;');};
  var opts=L.map(function(x){return '<option value="'+x.id+'" style="color:#1c1f27;background:#fff;">'+(x.type==='claude'?'☁ ':'🖥 ')+esc(x.name||x.model||x.id)+'</option>';}).join('');
  opts+=D.map(function(a){return '<option value="dify:'+a.id+'" style="color:#1c1f27;background:#fff;">📚 '+esc(a.name||a.id)+'</option>';}).join('');
  sel.innerHTML=opts||'<option value="" style="color:#1c1f27;background:#fff;">(활성 LLM 없음 — LLM 설정에서 등록)</option>';
  // 기본 선택: 이전 선택 유지 → 없으면 로컬(Test Workflow) 우선 → 첫번째
  var valid=function(id){ return (id&&id.indexOf('dify:')===0)?D.some(function(a){return 'dify:'+a.id===id;}):L.some(function(x){return x.id===id;}); };
  let pick=(_aiFabModelPick&&valid(_aiFabModelPick))?_aiFabModelPick:'';
  if(!pick){ var tw=L.find(function(x){return /test\s*work\s*flow/i.test(String(x.name||x.model||''));}); var local=L.find(function(x){return x.type!=='claude';}); pick=tw?tw.id:(local?local.id:(L[0]?L[0].id:'')); }
  _aiFabModelPick=pick; if(pick) sel.value=pick;
}
function aiFabToggle(){
  const p=document.getElementById('ai-fab-panel'); if(!p) return;
  _aiFabOpen=!_aiFabOpen;
  p.style.display=_aiFabOpen?'flex':'none';
  const fab=document.getElementById('ai-fab'); if(fab) fab.innerHTML='<i class="ti ti-'+(_aiFabOpen?'chevron-down':'sparkles')+'" style="font-size:26px;"></i>';
  if(_aiFabOpen){
    if((typeof difyList==='undefined'||!difyList.length)&&typeof loadDifyAssistants==='function'){ try{ loadDifyAssistants().then(_aiFabFillModels).catch(function(){}); }catch(e){} }
    _aiFabFillModels();
    if(!_aiFabInit){ _aiFabInit=true; aiFabAppend('ai',_aiFabGreetHtml(),{html:true}); }
    setTimeout(()=>{ const i=document.getElementById('ai-fab-input'); if(i) i.focus(); },50);
  }
}
let _aiFabBig=false;
function aiFabExpand(){
  const p=document.getElementById('ai-fab-panel'); if(!p) return;
  _aiFabBig=!_aiFabBig;
  if(_aiFabBig){
    p.style.left='20px'; p.style.top='20px'; p.style.right='20px'; p.style.bottom='20px';
    p.style.width='auto'; p.style.height='auto'; p.style.maxWidth='none'; p.style.maxHeight='none';
  } else {
    p.style.left='auto'; p.style.top='auto'; p.style.right='24px'; p.style.bottom='90px';
    p.style.width='1040px'; p.style.height='740px'; p.style.maxWidth='97vw'; p.style.maxHeight='88vh';
  }
  const ic=document.getElementById('ai-fab-expand-ic'); if(ic) ic.className='ti '+(_aiFabBig?'ti-minimize':'ti-maximize');
}
function aiFabKeydown(e){ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); aiFabSend(); } }
function aiFabClear(){
  const wrap=document.getElementById('ai-fab-msgs'); if(!wrap) return;
  wrap.innerHTML='';
  aiFabAppend('ai',_aiFabGreetHtml(),{html:true});
  const i=document.getElementById('ai-fab-input'); if(i) i.focus();
}
function aiFabAppend(role, text, opts){
  const wrap=document.getElementById('ai-fab-msgs'); if(!wrap) return null;
  const mine=role==='user';
  const row=document.createElement('div');
  row.style.cssText='display:flex;'+(mine?'justify-content:flex-end;':'justify-content:flex-start;');
  row.className='ai-fab-row';
  row.style.cssText='display:flex;gap:7px;align-items:flex-start;'+(mine?'flex-direction:row-reverse;':'flex-direction:row;');
  const body=(opts&&opts.html)?text:String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const _ab=function(icon,title,onclick,col){ return '<button onclick="'+onclick+'" title="'+title+'" style="width:25px;height:25px;border:none;background:transparent;color:'+(col||'#9aa1ad')+';cursor:pointer;border-radius:6px;font-size:14px;display:inline-flex;align-items:center;justify-content:center;" onmouseenter="this.style.background=\'rgba(0,0,0,0.07)\'" onmouseleave="this.style.background=\'transparent\'"><i class="ti '+icon+'"></i></button>'; };
  const acts=mine
    ? ('<div style="display:flex;gap:2px;padding:0 2px;">'+_ab('ti-pencil','수정','aiFabEditUser(this)')+_ab('ti-copy','복사','aiFabCopyMsg(this)')+'</div>')
    : ('<div style="display:flex;gap:2px;padding:0 2px;">'+_ab('ti-copy','복사','aiFabCopyMsg(this)')+_ab('ti-thumb-up','좋아요','_aiFabFb(this,1)','#00a872')+_ab('ti-thumb-down','별로','_aiFabFb(this,-1)','#e53e5a')+'</div>');
  var _av=mine?('<div style="flex-shrink:0;margin-top:2px;">'+(typeof _avatarHtml==='function'?_avatarHtml(currentUser,28):'')+'</div>'):'<div style="flex-shrink:0;margin-top:2px;width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#2d6fd4,#9d7bff);display:flex;align-items:center;justify-content:center;color:#fff;"><i class="ti ti-sparkles" style="font-size:15px;"></i></div>';
  row.innerHTML=_av+'<div style="display:flex;flex-direction:column;gap:3px;min-width:0;max-width:'+(mine?'80%':'94%')+';flex:'+(mine?'0 1 auto':'1 1 auto')+';'+(mine?'align-items:flex-end;':'align-items:stretch;')+'"><div class="ai-fab-bubble" style="width:'+(mine?'auto':'100%')+';max-width:100%;padding:9px 12px;border-radius:12px;font-size:13px;line-height:1.55;background:'+(mine?'var(--blue)':'#fff')+';color:'+(mine?'#fff':'var(--text)')+';border:'+(mine?'none':'1px solid var(--border)')+';box-shadow:0 1px 3px rgba(0,0,0,0.06);overflow-wrap:anywhere;text-align:left;box-sizing:border-box;">'+body+'</div>'+acts+'</div>';
  wrap.appendChild(row);
  wrap.scrollTop=wrap.scrollHeight;
  return row.querySelector('.ai-fab-bubble');
}
function _aiFabBubbleOf(btn){ var r=btn.closest('.ai-fab-row'); return r?r.querySelector('.ai-fab-bubble'):null; }
function aiFabCopyMsg(btn){ var b=_aiFabBubbleOf(btn); if(!b)return; var t=b.innerText||b.textContent||''; try{ navigator.clipboard.writeText(t); if(typeof showToast==='function')showToast('복사됨'); }catch(e){ var ta=document.createElement('textarea'); ta.value=t; document.body.appendChild(ta); ta.select(); try{document.execCommand('copy');}catch(_){} ta.remove(); if(typeof showToast==='function')showToast('복사됨'); } }
function aiFabEditUser(btn){ var b=_aiFabBubbleOf(btn); if(!b)return; var t=b.innerText||b.textContent||''; var inp=document.getElementById('ai-fab-input'); if(inp){ inp.value=t; inp.focus(); try{ inp.setSelectionRange(t.length,t.length); }catch(e){} } }
var _AI_FB_POS=['정확한 정보','지시사항을 완벽하게 따랐습니다','창의성을 선보였습니다','긍정적인 태도','세부 사항에 대한 주의','자세한 설명','다른'];
var _AI_FB_NEG=['스타일이 마음에 안 들어요','너무 장황하다','도움이 되지 않음','사실과 다릅니다','지시사항을 완전히 따르지 않았습니다','거절해서는 안 될 상황에서 거절당했다','게으름을 피우는 것','다른'];
function _aiFabFb(btn, thumb){
  var row=btn.closest('.ai-fab-row'); if(!row) return;
  var bubble=row.querySelector('.ai-fab-bubble'); var answer=bubble?(bubble.innerText||''):'';
  var q=''; var prev=row.previousElementSibling; while(prev){ var b=prev.querySelector?prev.querySelector('.ai-fab-bubble'):null; if(b){ q=b.innerText||''; break; } prev=prev.previousElementSibling; }
  // 클릭한 thumb 강조
  var grp=btn.parentNode; if(grp){ grp.querySelectorAll('button').forEach(function(x){ if(/thumb/.test(x.innerHTML)) x.style.background='transparent'; }); btn.style.background=thumb>0?'rgba(0,168,114,0.16)':'rgba(229,62,90,0.16)'; }
  var col=bubble?bubble.parentNode:row;
  var ex=col.querySelector('.ai-fb-panel'); if(ex) ex.remove();
  var panel=document.createElement('div'); panel.className='ai-fb-panel';
  panel._fb={thumb:thumb, score:0, reasons:[], q:q, answer:answer};
  panel.innerHTML=_aiFabFbHtml(thumb);
  col.appendChild(panel);
  var w=document.getElementById('ai-fab-msgs'); if(w)w.scrollTop=w.scrollHeight;
}
function _aiFabFbHtml(thumb){
  var nums=''; for(var i=1;i<=10;i++){ nums+='<span onclick="_aiFabFbScore(this,'+i+')" data-n="'+i+'" style="cursor:pointer;font-size:13px;font-weight:700;color:var(--text3);min-width:22px;text-align:center;padding:3px 0;border-radius:6px;">'+i+'</span>'; }
  var reasons=thumb>0?_AI_FB_POS:_AI_FB_NEG;
  var chips=reasons.map(function(r){ return '<span onclick="_aiFabFbChip(this)" data-on="0" style="cursor:pointer;font-size:11.5px;color:var(--text2);background:var(--bg3);border:1px solid var(--border);border-radius:14px;padding:4px 11px;">'+String(r).replace(/</g,'&lt;')+'</span>'; }).join('');
  return '<div style="margin-top:9px;border:1px solid var(--border);border-radius:11px;padding:13px 14px;background:#fff;position:relative;">'
    +'<i class="ti ti-x" onclick="_aiFabFbClose(this)" style="position:absolute;top:9px;right:10px;cursor:pointer;color:var(--text3);font-size:16px;"></i>'
    +'<div style="font-size:13px;font-weight:700;margin-bottom:10px;">이 답변에 대해 어떻게 평가하시겠습니까?</div>'
    +'<div class="ai-fb-nums" style="display:flex;gap:3px;flex-wrap:wrap;margin-bottom:3px;">'+nums+'</div>'
    +'<div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--text3);margin-bottom:13px;max-width:300px;"><span>1 · 끔찍해</span><span>10 · 놀랍다</span></div>'
    +'<div style="font-size:12.5px;font-weight:700;margin-bottom:7px;">왜?</div>'
    +'<div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:11px;">'+chips+'</div>'
    +'<textarea class="ai-fb-comment" rows="2" placeholder="자세한 내용을 자유롭게 추가해 주세요." style="width:100%;font-size:12px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;box-sizing:border-box;resize:vertical;"></textarea>'
    +'<div style="text-align:right;margin-top:9px;"><button onclick="_aiFabFbSubmit(this)" style="font-size:12.5px;font-weight:800;padding:7px 18px;border:none;border-radius:8px;background:#7c3aed;color:#fff;cursor:pointer;">제출</button></div>'
  +'</div>';
}
function _aiFabFbScore(el,n){ var p=el.closest('.ai-fb-panel'); if(!p)return; p._fb=p._fb||{}; p._fb.score=n; p.querySelectorAll('.ai-fb-nums span').forEach(function(s){ var on=(+s.getAttribute('data-n'))===n; s.style.background=on?'#7c3aed':''; s.style.color=on?'#fff':'var(--text3)'; }); }
function _aiFabFbChip(el){ var p=el.closest('.ai-fb-panel'); if(!p)return; p._fb=p._fb||{}; p._fb.reasons=p._fb.reasons||[]; var t=el.textContent; if(el.getAttribute('data-on')==='1'){ el.setAttribute('data-on','0'); el.style.background='var(--bg3)'; el.style.color='var(--text2)'; el.style.borderColor='var(--border)'; p._fb.reasons=p._fb.reasons.filter(function(x){return x!==t;}); } else { el.setAttribute('data-on','1'); el.style.background='rgba(124,58,237,0.12)'; el.style.color='#7c3aed'; el.style.borderColor='#c9b6f0'; p._fb.reasons.push(t); } }
function _aiFabFbClose(el){ var p=el.closest('.ai-fb-panel'); if(p)p.remove(); }
async function _aiFabFbSubmit(el){
  var p=el.closest('.ai-fb-panel'); if(!p)return; var fb=p._fb||{};
  var comment=((p.querySelector('.ai-fb-comment')||{}).value)||'';
  if(!fb.score && !(fb.reasons&&fb.reasons.length) && !comment.trim()){ if(typeof showToast==='function')showToast('점수나 이유를 선택해 주세요'); return; }
  var model=''; var sel=document.getElementById('ai-fab-model'); if(sel&&sel.selectedIndex>=0) model=sel.options[sel.selectedIndex].text;
  try{ await userApi('POST','/api/ai/feedback',{thumb:fb.thumb||0,score:fb.score||0,reasons:fb.reasons||[],comment:comment,question:fb.q||'',answer:fb.answer||'',model:model});
    p.innerHTML='<div style="font-size:12.5px;color:#00875a;padding:8px 2px;font-weight:700;"><i class="ti ti-circle-check-filled"></i> 피드백 감사합니다 🙏</div>';
    setTimeout(function(){ if(p&&p.parentNode)p.remove(); },1600);
  }catch(e){ if(typeof showToast==='function')showToast('피드백 저장 실패: '+((e&&e.message)||e)); }
}
function _aiFabLogUsage(llm, q, a){ try{ var model=(llm&&(llm.model||llm.name))||''; userApi('POST','/api/ai/usage',{model:model,kind:'chat',question:q||'',answer:a||''}).catch(function(){}); }catch(e){} }
// RAG 검색 — 매뉴얼 청크 BM25 (백엔드)// 이미지 라이트박스 (data: URI는 window.open이 막히므로 오버레이로 표시)
function _imgLightbox(idx){ try{ var arr=window._fabRagImages||[]; var it=arr[idx]; if(!it)return; var src=it.src||it;
  var o=document.createElement('div'); o.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.85);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:zoom-out;gap:10px;'; o.onclick=function(){o.remove();};
  var im=document.createElement('img'); im.src=src; im.style.cssText='max-width:92vw;max-height:86vh;border-radius:8px;box-shadow:0 8px 40px rgba(0,0,0,0.5);';
  o.appendChild(im); if(it.name){ var cap=document.createElement('div'); cap.style.cssText='color:#fff;font-size:13px;'; cap.textContent=it.name; o.appendChild(cap); }
  document.body.appendChild(o);
}catch(e){} }
// 질문 의도 분류 → 어느 지식 소스를 검색할지 라우팅
//  internal: 시험/사이클/현황(=UTOP 내부) · manual: 설정/메뉴얼(=학습 데이터) · spec: 스펙/디버깅(=Confluence) · general: 둘 다
// 라우팅 표(사용자 정의):
//  UTOP 내부 → 시험항목(TC)·시험실행·사이클·현황
//  학습 데이터 → 메뉴얼·설정
//  Confluence → 스펙·디버깅·요구사항(문서)
//  요구사항은 UTOP(목록/현황)와 Confluence(문서) 둘 다 → 'req'
function _fabIntent(m){ m=String(m||'');
  if(/디버깅|디버그|debug|트러블|장애|문제\s*해결/i.test(m)) return 'debug';            // → Confluence(디버깅 문서)
  if(/사이클|미시험|진행\s*중|시험\s*실행|시험\s*현황|등록\s*현황|합격|불합격|성공률|통계|마일스톤|시험\s*항목|테스트\s*케이스|\btc\b/i.test(m)) return 'internal'; // → UTOP
  if(/메뉴얼|매뉴얼|학습\s*데이터|설정|명령어|\bcli\b|config|환경설정|가이드/i.test(m)) return 'manual';   // → 학습 데이터
  if(/스펙|사양|형상|\bfan\b|팬|전원|온도|성능|포트|메모리|\bcpu\b|chip|datasheet|시리즈|[A-Za-z]{1,3}\d{3,}/i.test(m)) return 'spec'; // → Confluence
  if(/요구사항|\breq\b/i.test(m)) return 'req';   // → UTOP 목록 + Confluence 문서
  return 'general';
}
// 단계별 지식 검색: ① 학습 데이터(로컬 RAG) ② Confluence 라이브 — 각 단계 문구+스피너 표시
async function _aiFabRetrieve(msg, bubble){
  var setS=function(t){ if(bubble) bubble.innerHTML='<div style="display:flex;align-items:center;gap:11px;padding:7px 2px;"><span class="ring-spin" style="flex-shrink:0;"></span><span style="font-size:13.5px;font-weight:700;color:var(--text2);">'+t+'</span></div>'; var w=document.getElementById('ai-fab-msgs'); if(w)w.scrollTop=w.scrollHeight; };
  window._fabRagImages=[]; window._fabSources=[]; window._fabFiles=[]; window._fabInlined={}; var gImgs=window._fabRagImages; var kbParts=[], localN=0, confN=0;
  var pushImg=function(src,nm){ for(var k=0;k<gImgs.length;k++){ if(gImgs[k].src===src) return k; } gImgs.push({src:src,name:nm||''}); return gImgs.length-1; };
  // [[IMG:로컬n]] 마커를 전역 인덱스로 리맵 (히트별 이미지 배열 → 단일 전역 배열)
  var remap=function(t,imgs,nm){ return String(t||'').replace(/\[\[IMG:(\d+)\]\]/g, function(_m,n){ var src=(imgs||[])[+n]; if(!src) return ''; return '[[IMG:'+pushImg(src,nm)+']]'; }); };
  if(window._confLiveOn===undefined){ try{ var cc=await (await fetch('/api/confluence/config')).json(); window._confLiveOn=!!cc.live_query; }catch(e){ window._confLiveOn=false; } }
  if(window._specModels===undefined){ try{ window._specModels=((await (await fetch('/api/confluence/models')).json()).models)||[]; }catch(e){ window._specModels=[]; } }
  // ① 학습 데이터(로컬 RAG) — 마커 없음, 이미지는 갤러리로
  setS('📚 학습 데이터 조회 중…');
  window._fabLocalNames=[]; window._fabConfNames=[];
  try{ var d=await (await fetch('/api/rag/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:msg,top_k:6,confluence:false,min_score:0.15})})).json();
    if(d&&d.hits&&d.hits.length){ localN=d.hits.length; var lnames=[];
      kbParts.push('[사내 매뉴얼·시험절차]\n'+d.hits.map(function(h){ if(h.name&&lnames.indexOf(h.name)<0)lnames.push(h.name); return '· ['+(h.name||'')+'] '+String(h.text||'').replace(/\s+/g,' ').slice(0,600);}).join('\n'));
      window._fabLocalNames=lnames;
      d.hits.forEach(function(h){ (h.images||[]).forEach(function(im){ pushImg(im,h.name); }); }); }
  }catch(e){}
  // ② Confluence 라이브 — 본문 [[IMG:n]] 마커 보존(인라인) + 출처 + 첨부파일
  // 의도 라우팅: 스펙·디버깅·일반 → 위키 조회 / 시험(내부)·설정·메뉴얼 → 위키 건너뜀(무관 출처 방지)
  var _intent=window._fabForcedIntent || ((typeof _fabIntent==='function')?_fabIntent(msg):'general');
  window._fabForcedIntent=null;   // 라우팅 선택은 일회성
  window._fabIntent=_intent;
  // 방식 A: 소스를 정규식으로 가르지 않고 항상 매뉴얼+Confluence를 같이 검색 → 리랭커가 적합도로 결정
  // (목록·현황·사이클 같은 내부 즉답은 이미 aiFabSend의 직접답변에서 처리되어 여기 안 옴)
  if(window._confLiveOn){
    setS('🌐 Confluence 조회 중… <span style="font-size:10.5px;color:var(--text3);">위키 실시간 검색</span>');
    try{ var c=await (await fetch('/api/confluence/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:msg,limit:4})})).json();
      if(c&&c.hits&&c.hits.length){ confN=c.hits.length; var cps=[];
        c.hits.forEach(function(h,hi){ var nm=String(h.name||'').replace(/^Confluence\s*·\s*/,'');
          if(window._fabConfNames.indexOf(nm)<0)window._fabConfNames.push(nm);
          cps.push('=== 페이지: '+nm+' ===\n'+String(h.text||'').slice(0, hi===0?6000:2000));   // 1순위 페이지는 길게(잘림 방지), 본문에 ![image](URL) 인라인
          if(hi===0){   // 출처·관련파일은 1순위(리랭크 최상위) 페이지만
            if(h.url)window._fabSources.push({name:nm,url:h.url});
            (h.files||[]).forEach(function(f){ if(f&&f.url && !window._fabFiles.some(function(x){return x.url===f.url;})) window._fabFiles.push({name:f.name,url:f.url}); });
          }
        });
        kbParts.unshift('[Confluence 위키 (출처 우선 — 이미지는 ![image](URL) 형식으로 본문에 포함됨)]\n'+cps.join('\n\n')); }
    }catch(e){}
  }
  setS('🤖 답변 생성 중…');
  window._fabRetInfo={localN:localN,confN:confN};
  return kbParts.join('\n\n');
}
// 답변 섹션 순서를 코드로 강제: '요약'을 항상 맨 위로 (LLM이 표/목록을 요약 위에 둬도 교정)
function _aiFabFixOrder(t){
  t=String(t||'').replace(/^\s*\[CLARIFY\]\s*/i,'');   // 처리 안 된 [CLARIFY] 토큰 제거(누출 방지)
  if(!t || t.indexOf('요약')<0) return t;
  var rx=/(?:^|\n)[ \t]*(?:#{1,6}[ \t]*|\*\*[ \t]*)?요약\b/;
  var mm=t.match(rx); if(!mm) return t;
  var sumStart=mm.index + (/^\n/.test(mm[0])?1:0);
  if(sumStart<=3) return t;   // 이미 거의 맨 앞이면 그대로
  var afterSum=t.slice(sumStart);
  var endRel=afterSum.slice(3).search(/\n[ \t]*(?:#{1,6}[ \t]*|\*\*[ \t]*)?(?:세부|상세)\b/i);
  var sumBlock, restBlock;
  if(endRel>=0){ sumBlock=afterSum.slice(0, endRel+3); restBlock=afterSum.slice(endRel+3); }
  else { sumBlock=afterSum; restBlock=''; }
  var before=t.slice(0,sumStart).trim();   // 요약 위에 잘못 온 표/모델목록
  return (sumBlock.trim()+'\n\n'+restBlock.trim()+(before?('\n\n'+before):'')).replace(/\n{3,}/g,'\n\n').trim();
}
// 답변 본문의 [[IMG:n]] 마커를 인라인 이미지로 치환 (formatMsg 결과 HTML에 적용)
function _aiFabInlineImgs(html){
  return String(html||'').replace(/\[\[IMG:(\d+)\]\]/g, function(_m,n){ var i=+n; var it=(window._fabRagImages||[])[i]; if(!it) return ''; window._fabInlined=window._fabInlined||{}; window._fabInlined[i]=1;
    return '<img src="'+it.src+'" onclick="_imgLightbox('+i+')" style="display:block;max-width:340px;max-height:230px;border-radius:8px;border:1px solid var(--border);margin:8px 0;cursor:zoom-in;">'; });
}
function _aiFabAppendImages(bubble){
  try{ var imgs=window._fabRagImages||[]; var srcs=window._fabSources||[]; var files=window._fabFiles||[]; var inl=window._fabInlined||{}; var ri=window._fabRetInfo||{};
    var esc=function(s){return String(s||'').replace(/</g,'&lt;');};
    var lnames=window._fabLocalNames||[], cnames=window._fabConfNames||[];
    var chip='';
    if(ri.localN||ri.confN){
      var detId='fabdet'+(window._fabDetSeq=(window._fabDetSeq||0)+1);
      var det='';
      if(lnames.length) det+='<div style="margin-bottom:5px;"><b style="color:#6b3fc4;">📚 학습 데이터(사내 매뉴얼)</b>'+lnames.map(function(n){return '<div style="padding-left:6px;">· '+esc(n)+'</div>';}).join('')+'</div>';
      if(cnames.length) det+='<div><b style="color:#0a7a52;">🌐 Confluence 페이지</b>'+cnames.map(function(n){return '<div style="padding-left:6px;">· '+esc(n)+'</div>';}).join('')+'</div>';
      if(!det) det='<div style="color:var(--text3);">관련 항목 없음</div>';
      chip='<div onclick="var e=document.getElementById(\''+detId+'\');if(e)e.style.display=(e.style.display===\'none\'?\'block\':\'none\');" title="클릭하면 참조 출처를 펼쳐봅니다" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:7px;cursor:pointer;">'
        +'<span style="display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:800;color:#6b3fc4;background:#f3eefe;border:1px solid #d9c9f7;border-radius:16px;padding:5px 13px;">📚 학습 데이터 '+(ri.localN||0)+'건</span>'
        +(window._confLiveOn?('<span style="display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:800;color:#0a7a52;background:#e9f9f1;border:1px solid #b6e6cf;border-radius:16px;padding:5px 13px;">🌐 Confluence '+(ri.confN||0)+'건</span>'):'')
        +'<i class="ti ti-chevron-down" style="font-size:14px;color:var(--text3);"></i></div>'
        +'<div id="'+detId+'" style="display:none;font-size:11.5px;line-height:1.6;color:var(--text2);background:var(--bg3);border-radius:8px;padding:8px 11px;margin-bottom:8px;">'+det+'</div>';
    }
    // 관련 파일(첨부 PDF 등) — 열기 / 다운로드
    var fileHtml=files.length?('<div style="font-size:11px;font-weight:800;margin:6px 0 5px;">📁 관련 파일</div>'+files.map(function(f){var nm=esc(f.name||'파일');return '<div style="display:flex;gap:8px;align-items:center;margin-bottom:4px;"><a href="'+f.url+'" target="_blank" rel="noopener" style="flex:1;min-width:0;display:flex;align-items:center;gap:6px;font-size:12px;color:#2d6fd4;text-decoration:none;overflow:hidden;"><i class="ti ti-file-type-pdf"></i><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+nm+' 열기</span></a><a href="'+f.url+'" download style="font-size:11px;color:#00875a;text-decoration:none;white-space:nowrap;"><i class="ti ti-download"></i> 다운로드</a></div>';}).join('')):'';
    // 출처 링크
    var srcHtml=srcs.length?('<div style="font-size:11px;font-weight:800;margin:8px 0 5px;">🔗 출처</div>'+srcs.map(function(s){return '<a href="'+s.url+'" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:6px;font-size:12px;color:#2d6fd4;text-decoration:none;padding:4px 8px;border:1px solid #cfe0fb;border-radius:7px;background:#f6f9ff;margin-bottom:4px;"><i class="ti ti-brand-confluence"></i><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(s.name||s.url)+'</span><i class="ti ti-external-link" style="font-size:12px;"></i></a>';}).join('')):'';
    // 본문에 인라인되지 못한 이미지만 갤러리로 (폴백)
    var rest=imgs.map(function(it,i){return {it:it,i:i};}).filter(function(o){return !inl[o.i];});
    var gal=rest.length?('<div style="font-size:11px;font-weight:800;margin:8px 0 5px;">📎 관련 이미지</div><div style="display:flex;gap:8px;flex-wrap:wrap;">'+rest.map(function(o){return '<div onclick="_imgLightbox('+o.i+')" style="cursor:zoom-in;width:150px;"><img src="'+o.it.src+'" style="width:150px;height:104px;object-fit:cover;border-radius:7px;border:1px solid var(--border);display:block;">'+(o.it.name?('<div style="font-size:9.5px;color:var(--text3);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(o.it.name)+'</div>'):'')+'</div>';}).join('')+'</div>'):'';
    if(bubble && (fileHtml || srcHtml || gal || chip))
      bubble.insertAdjacentHTML('beforeend', '<div style="margin-top:9px;border-top:1px solid var(--border);padding-top:8px;text-align:left;">'+chip+fileHtml+srcHtml+gal+'</div>');
  }catch(e){}
  _aiFabScrollEnd(bubble);
}
// 답변+푸터가 다 들어온 뒤 맨 아래로 스크롤 (이미지는 로드 완료 시 한 번 더)
function _aiFabScrollEnd(bubble){
  var w=document.getElementById('ai-fab-msgs'); if(!w) return;
  var go=function(){ w.scrollTop=w.scrollHeight; };
  go(); setTimeout(go,60);
  try{ (bubble||w).querySelectorAll('img').forEach(function(im){ if(!im.complete) im.addEventListener('load', go, {once:true}); }); }catch(e){}
}
// Dify 지식 어시스턴트 호출 (FAB) — /api/dify/chat SSE 스트리밍
async function _aiFabDifySend(asst, msg, bubble){
  var _user=(typeof currentUser!=='undefined'&&currentUser&&currentUser.username)||'utop-user';
  window._aiFabDifyConv=window._aiFabDifyConv||{};
  var convId=window._aiFabDifyConv[asst]||'';
  var full='';
  try{
    var r=await fetch('/api/dify/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({assistant:asst,query:msg,conversation_id:convId,user:_user,files:[]})});
    if(!r.ok) throw new Error('HTTP '+r.status);
    var reader=r.body.getReader(), dec=new TextDecoder(), buf='';
    while(true){ var rd=await reader.read(); if(rd.done)break; buf+=dec.decode(rd.value,{stream:true}); var parts=buf.split('\n'); buf=parts.pop();
      for(var i=0;i<parts.length;i++){ var line=parts[i]; if(line.indexOf('data: ')!==0)continue; var ds=line.slice(6); if(ds==='[DONE]')continue;
        try{ var ch=JSON.parse(ds); if(ch.text){ full+=ch.text; bubble.innerHTML=(typeof formatMsg==='function'?formatMsg(full):String(full).replace(/&/g,'&amp;').replace(/</g,'&lt;')); var w=document.getElementById('ai-fab-msgs'); if(w)w.scrollTop=w.scrollHeight; } else if(ch.conv){ window._aiFabDifyConv[asst]=ch.conv; } }catch(e){}
      }
    }
    if(!full) bubble.innerHTML='<span style="color:var(--text3);">(응답 없음)</span>';
    _aiFabLogUsage({name:'Dify:'+asst}, msg, full);
  }catch(e){ bubble.innerHTML='⚠️ Dify 오류: '+String((e&&e.message)||e).replace(/</g,'&lt;'); }
}
// 현재 REQ/TC/사이클 상태를 실시간 컨텍스트로 (질문 관련 항목 발췌)
function _aiFabLiveContext(msg){
  try{
    var R=(typeof reqList!=='undefined'?reqList:[])||[], T=(typeof tcList!=='undefined'?tcList:[])||[], C=(typeof cycleList!=='undefined'?cycleList:[])||[];
    var q=String(msg||'').toLowerCase();
    var terms=q.split(/\s+/).filter(function(t){return t.length>=2;});
    var match=function(s){ s=String(s||'').toLowerCase(); return terms.some(function(t){return s.indexOf(t)>=0;}); };
    var lines=['[현재 시스템 데이터 — 실시간] REQ '+R.length+'개 · TC '+T.length+'개 · 사이클 '+C.length+'개'];
    var wantList=/리스트|목록|전체|모두|전부|등록된|어떤.*있|뭐.*있|있는지|보여/i.test(msg);
    var askReq=/요구사항|req/i.test(msg), askTc=/시험\s*항목|시험항목|테스트|tc\b/i.test(msg);
    if(wantList && (askReq||!askTc)){ lines.push('· REQ 목록('+Math.min(R.length,40)+'/'+R.length+'):'); R.slice(0,40).forEach(function(r){ var n=T.filter(function(t){return t.req_id===r.id;}).length; lines.push('   - '+(r.reqid||'')+' '+(r.title||'')+' (TC '+n+')'); }); }
    if(wantList && askTc){ lines.push('· TC 목록('+Math.min(T.length,60)+'/'+T.length+'):'); T.slice(0,60).forEach(function(t){ lines.push('   - '+(t.tcid||t.id||'')+' '+(t.name||'')); }); }
    var rq=R.filter(function(r){return match(r.reqid)||match(r.title);}).slice(0,6);
    if(rq.length){ lines.push('· 관련 REQ:'); rq.forEach(function(r){ var n=T.filter(function(t){return t.req_id===r.id;}).length; lines.push('   - '+(r.reqid||'')+' '+(r.title||'')+' (TC '+n+'개)'); }); }
    var tq=T.filter(function(t){return match(t.tcid)||match(t.name);}).slice(0,10);
    if(tq.length){ lines.push('· 관련 TC:'); tq.forEach(function(t){ var st=(t.result_history&&t.result_history[0]&&t.result_history[0].result)||'미실행'; var sc=(t.checks||[]).filter(function(c){return (c.kind||'cli')==='cli';}).length; lines.push('   - '+(t.tcid||t.id||'')+' '+(t.name||'')+' (스텝 '+sc+', 최근결과 '+st+')'); }); }
    var wantCyc=/사이클|cycle|버전|version|결과|회귀|regression|합격|불합격|pass|fail/i.test(msg);
    var cq=C.filter(function(c){return match(c.model)||match(c.version)||match(c.version_group);});
    if(!cq.length && wantCyc) cq=C.slice(0,6);
    cq=cq.slice(0,6);
    if(cq.length){ lines.push('· 관련 사이클:'); cq.forEach(function(c){ var items=c.items||[]; var pass=0,fail=0; items.forEach(function(it){ (it.steps||[]).forEach(function(s){ if(s.result==='Pass')pass++; else if(s.result==='Fail')fail++; }); }); lines.push('   - '+(c.model||'')+' '+(c.version_group||'')+'/'+(c.version||'')+' (TC '+items.length+', 합격 '+pass+'/불합격 '+fail+')'); }); }
    // 제품군/모델별 시험결과 집계 (결과·통계 질문 시)
    if(/결과|통계|제품군|모델별|합격|불합격|pass|fail|성공|실패|품질/i.test(msg) && C.length){
      var _role=function(m){ try{ var d=(typeof modelList!=='undefined'?modelList:[]).find(function(x){return x.name===m;}); return d&&d.role?d.role:''; }catch(e){return '';} };
      var byM={}, byR={};
      C.forEach(function(c){ var m=c.model||'(미상)'; var r=_role(m)||'(제품군 미상)';
        var dm=byM[m]||(byM[m]={pass:0,fail:0,tc:0,cyc:0}); dm.cyc++;
        var dr=byR[r]||(byR[r]={pass:0,fail:0,tc:0,cyc:0}); dr.cyc++;
        (c.items||[]).forEach(function(it){ dm.tc++; dr.tc++; (it.steps||[]).forEach(function(s){ if(s.result==='Pass'){dm.pass++;dr.pass++;} else if(s.result==='Fail'){dm.fail++;dr.fail++;} }); });
      });
      lines.push('· 제품군별 시험결과:'); Object.keys(byR).forEach(function(r){ var d=byR[r]; lines.push('   - '+r+': 사이클 '+d.cyc+', TC '+d.tc+', 합격 '+d.pass+'/불합격 '+d.fail); });
      lines.push('· 모델별 시험결과:'); Object.keys(byM).forEach(function(m){ var d=byM[m]; lines.push('   - '+m+': 사이클 '+d.cyc+', TC '+d.tc+', 합격 '+d.pass+'/불합격 '+d.fail); });
    }
    return lines.length>1?('[실시간 현황]\n'+lines.join('\n')):'';
  }catch(e){ return ''; }
}
// LLM이 [CLARIFY] 없이 "없습니다"류로 끝낸 경우의 안전망 — 모델/항목을 되물음(1회만, 루프 방지)
function _aiFabIsNoData(t){ t=String(t||''); return /학습된\s*데이터에\s*없습니다|찾을\s*수\s*없|정보가\s*없|데이터가\s*없|해당[^.]*없습니다|확인할\s*수\s*없/.test(t) && t.replace(/\s/g,'').length < 220; }
function _aiFabNoDataClarify(bubble, origQ){ return _aiFabHandleClarify(bubble, '[CLARIFY]\n- 정확한 모델명이나 찾으시는 항목을 알려주세요 (아래에서 선택해도 됩니다)', origQ); }
// HITL: 응답이 [CLARIFY]면 확인 질문을 입력 폼으로 띄움 (최대 3단까지)
function _aiFabHandleClarify(bubble, text, origQ){
  if(!bubble) return false;
  var t=String(text||'').trim();
  if(!/^\[CLARIFY\]/i.test(t)) return false;
  if((window._fabClarifyDepth||0)>=3) return false;   // 3단 초과면 더 안 되묻고 그냥 답
  try{ _aiFabShowStop(false); }catch(e){}   // 확인 대기 상태 → 입력 잠금 해제
  var qs=t.replace(/^\[CLARIFY\]/i,'').split(/\r?\n/).map(function(s){return s.replace(/^[\s\-*•]+/,'').trim();}).filter(Boolean).slice(0,3);
  if(!qs.length){ qs=['어떤 모델/제품군에 대한 질문인가요?']; }
  var esc=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');};
  window._clarifyCtx={origQ:origQ, qs:qs, bubble:bubble};
  // 모델 옵션: Confluence 스펙 모델(E6100·E7100·P8624XG…) 우선, 없으면 TC 모델그룹 폴백
  var _specM=(window._specModels||[]); var _tcM=(typeof _allTcModelGroups==='function')?(_allTcModelGroups()||[]):[];
  var _models=(_specM&&_specM.length)?_specM.slice():_tcM;
  if(window._specModels===undefined){ try{ fetch('/api/confluence/models').then(function(r){return r.json();}).then(function(d){window._specModels=(d.models)||[];}); }catch(e){} }
  // 클로드(AskUserQuestion) 형태: 질문 + 세로 옵션 카드 + 직접 입력
  var html='<div style="border:1px solid #e7defb;border-radius:9px;background:#faf8ff;padding:9px 10px;">'
    +'<div style="display:flex;align-items:center;gap:5px;font-size:11px;color:#6b3fc4;font-weight:700;margin-bottom:7px;"><i class="ti ti-help-circle-filled" style="font-size:13px;"></i> 확인이 필요해요</div>';
  qs.forEach(function(q,i){
    html+='<div style="margin-bottom:'+(i<qs.length-1?'9px':'7px')+';">'
      +'<div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:5px;line-height:1.4;">'+esc(q)+'</div>';
    if(/모델|제품|시리즈|장비|모뎀/.test(q) && _models.length){
      html+='<div style="display:flex;flex-direction:column;gap:3px;margin-bottom:5px;">'+_models.map(function(mn){ var s=String(mn).replace(/['"\\]/g,'');
        return '<div onclick="_aiFabPickModel(\''+s+'\')" style="display:flex;align-items:center;justify-content:space-between;gap:6px;padding:5px 9px;border:1px solid #e2d8f6;border-radius:7px;background:#fff;cursor:pointer;font-size:11.5px;font-weight:600;color:#3a2a5a;" onmouseenter="this.style.borderColor=\'#7c3aed\';this.style.background=\'#f3eefe\';" onmouseleave="this.style.borderColor=\'#e2d8f6\';this.style.background=\'#fff\';"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(s)+'</span><i class="ti ti-chevron-right" style="color:#c4b0ee;font-size:14px;flex-shrink:0;"></i></div>'; }).join('')+'</div>';
    }
    html+='<input id="_clr-'+i+'" onkeydown="if(event.key===\'Enter\')_aiFabClarifySubmit()" placeholder="'+((/모델|제품|시리즈|장비|모뎀/.test(q)&&_models.length)?'또는 직접 입력…':'답변 입력…')+'" style="width:100%;font-size:11.5px;padding:6px 9px;border:1px solid #d9caf5;border-radius:7px;box-sizing:border-box;outline:none;background:#fff;">';
    html+='</div>';
  });
  html+='<div style="display:flex;gap:5px;">'
    +'<button onclick="_aiFabClarifyCancel()" style="font-size:11.5px;font-weight:700;padding:6px 13px;border:1px solid #d9caf5;border-radius:7px;background:#fff;color:#8a8f9c;cursor:pointer;">취소</button>'
    +'<button onclick="_aiFabClarifySubmit()" style="flex:1;font-size:11.5px;font-weight:800;padding:6px 0;border:none;border-radius:7px;background:#7c3aed;color:#fff;cursor:pointer;"><i class="ti ti-send" style="font-size:12px;"></i> 보내기</button>'
    +'</div>'
    +'</div>';
  bubble.innerHTML=html;
  _aiFabScrollEnd(bubble);
  setTimeout(function(){ var f=document.getElementById('_clr-0'); if(f){ try{ f.focus({preventScroll:true}); }catch(_){ f.focus(); } } var wrap=document.getElementById('ai-fab-msgs'); if(wrap) wrap.scrollTop=wrap.scrollHeight; },40);
  return true;
}
// 답변 생성 중: 전송 버튼을 '멈춤' 버튼으로 토글 (별도 토스트 X)
function _aiFabShowStop(show){
  window._fabBusy=!!show;
  var inp=document.getElementById('ai-fab-input'); if(inp){ inp.disabled=!!show; inp.style.opacity=show?'0.5':''; inp.style.cursor=show?'not-allowed':''; if(show){ if(!inp.getAttribute('data-ph0')) inp.setAttribute('data-ph0', inp.placeholder||''); inp.placeholder='답변 생성 중… 끝나면 입력하세요'; } else { inp.placeholder=inp.getAttribute('data-ph0')||inp.placeholder; } }
  var btn=document.getElementById('ai-fab-send'); if(!btn) return;
  if(show){ btn.innerHTML='<i class="ti ti-player-stop-filled"></i>'; btn.title='생성 중지'; btn.style.background='#e53e5a'; btn.setAttribute('data-stop','1'); }
  else { btn.innerHTML='<i class="ti ti-send"></i>'; btn.title='전송'; btn.style.background='var(--blue)'; btn.removeAttribute('data-stop'); }
}
// 전송 버튼 클릭: 생성 중이면 멈춤, 아니면 전송
function aiFabSendOrStop(){ var btn=document.getElementById('ai-fab-send'); if(btn && btn.getAttribute('data-stop')==='1'){ _aiFabStopGen(); } else { aiFabSend(); } }
function _aiFabStopGen(){ window._fabStopped=true; try{ if(window._fabAbortCtrl) window._fabAbortCtrl.abort(); }catch(e){} _aiFabShowStop(false); }
// HITL 누적: 원 질문(_hitlOrig) + 추가답(_hitlAdds)을 깔끔히 합쳐 재질의 (중복·오염 없음)
function _aiFabHitlGo(addAnswers){
  window._hitlAdds=(window._hitlAdds||[]);
  (addAnswers||[]).forEach(function(a){ a=String(a||'').trim(); if(a && window._hitlAdds.indexOf(a)<0) window._hitlAdds.push(a); });
  window._clarifyCtx=null; window._fabFromClarify=true;
  var q=((window._hitlOrig||'')+' '+window._hitlAdds.join(' ')).replace(/\s+/g,' ').trim();
  var inp=document.getElementById('ai-fab-input'); if(inp) inp.value=q;
  aiFabSend();
}
// 모델 칩 클릭 → 그 모델을 누적에 추가해 조회
function _aiFabPickModel(model){ _aiFabHitlGo([model]); }
function _aiFabClarifySubmit(){
  var c=window._clarifyCtx||{}; var ans=[];
  (c.qs||[]).forEach(function(q,i){ var v=((document.getElementById('_clr-'+i)||{}).value||'').trim(); if(v) ans.push(v); });
  if(!ans.length){ if(typeof showToast==='function')showToast('답을 입력하거나 옵션을 선택하세요'); return; }
  _aiFabHitlGo(ans);
}
// HITL 취소 — 확인 질문을 닫고 누적 상태 초기화 (재질의 안 함)
function _aiFabClarifyCancel(){
  var c=window._clarifyCtx||{}; var b=c.bubble;
  window._clarifyCtx=null; window._fabFromClarify=false; window._hitlAdds=[]; window._fabClarifyDepth=0;
  try{ _aiFabShowStop(false); }catch(e){}
  if(b){ b.innerHTML='<span style="color:var(--text3);font-size:12.5px;"><i class="ti ti-x" style="color:#b0b6c2;"></i> 확인을 취소했어요. 필요하면 다시 질문해 주세요.</span>'; var wrap=document.getElementById('ai-fab-msgs'); if(wrap) wrap.scrollTop=wrap.scrollHeight; }
}
// ── AI 피드백·통계 페이지 ──
async function renderAIStats(){
  const body=document.getElementById('ai-stat-body'); if(!body)return;
  body.innerHTML='<div style="color:var(--text3);padding:20px;">불러오는 중…</div>';
  var days=(window._aiStatDays===undefined)?30:window._aiStatDays;
  let st={}, fb=[];
  try{ st=await (await fetch('/api/ai/stats?days='+days)).json(); }catch(e){}
  try{ fb=((await (await fetch('/api/ai/feedback?limit=300')).json()).items)||[]; }catch(e){}
  window._aiStat=st; window._aiFb=fb; _aiStatRender();
}
function aiStatPeriod(d){ window._aiStatDays=d; renderAIStats(); }
function _aiStatRender(){
  const body=document.getElementById('ai-stat-body'); if(!body)return;
  const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
  const st=window._aiStat||{}; const fb=window._aiFb||[];
  const nf=n=>Number(n||0).toLocaleString();
  const days=(window._aiStatDays===undefined)?30:window._aiStatDays;
  const card=(ic,lab,val,col)=>'<div style="flex:1;min-width:130px;border:1px solid var(--border);border-radius:12px;padding:13px 15px;background:#fff;"><div style="display:flex;align-items:center;gap:7px;color:'+col+';font-size:11.5px;font-weight:700;"><i class="ti '+ic+'"></i>'+lab+'</div><div style="font-size:23px;font-weight:800;margin-top:5px;color:var(--text);">'+val+'</div></div>';
  const perBtn=(d,l)=>'<button onclick="aiStatPeriod('+d+')" style="font-size:11.5px;font-weight:700;padding:5px 12px;border:1px solid '+(days===d?'#7c3aed':'var(--border)')+';border-radius:7px;background:'+(days===d?'#7c3aed':'#fff')+';color:'+(days===d?'#fff':'var(--text2)')+';cursor:pointer;">'+l+'</button>';
  const maxTok=Math.max(1,...(st.users||[]).map(u=>u.tokens||0));
  const userRows=(st.users||[]).length?(st.users||[]).map(function(u,i){ var pct=Math.round((u.tokens||0)/maxTok*100); return '<tr style="border-top:1px solid var(--border);"><td style="padding:7px 10px;color:var(--text3);font-weight:700;">'+(i+1)+'</td><td style="padding:7px 10px;font-weight:700;">'+esc(u.user)+'</td><td style="padding:7px 10px;text-align:right;">'+nf(u.questions)+'</td><td style="padding:7px 10px;text-align:right;color:#2d6fd4;">'+nf(u.tokens_in)+'</td><td style="padding:7px 10px;text-align:right;color:#7c3aed;">'+nf(u.tokens_out)+'</td><td style="padding:7px 10px;"><div style="display:flex;align-items:center;gap:8px;"><div style="flex:1;height:8px;background:var(--bg3);border-radius:5px;overflow:hidden;min-width:70px;"><div style="width:'+pct+'%;height:100%;background:linear-gradient(90deg,#7c3aed,#9d7bff);"></div></div><b style="font-size:12.5px;white-space:nowrap;">'+nf(u.tokens)+'</b></div></td></tr>'; }).join(''):'<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--text3);">사용 기록이 없습니다. AI 어시스턴트로 질문하면 집계됩니다.</td></tr>';
  const maxOrg=Math.max(1,...(st.orgs||[]).map(o=>o.tokens||0));
  const orgRows=(st.orgs||[]).length?(st.orgs||[]).map(function(o,i){ var pct=Math.round((o.tokens||0)/maxOrg*100); return '<tr style="border-top:1px solid var(--border);"><td style="padding:7px 10px;color:var(--text3);font-weight:700;">'+(i+1)+'</td><td style="padding:7px 10px;font-weight:700;">'+esc(o.org)+'</td><td style="padding:7px 10px;text-align:right;">'+nf(o.users)+'</td><td style="padding:7px 10px;text-align:right;">'+nf(o.questions)+'</td><td style="padding:7px 10px;"><div style="display:flex;align-items:center;gap:8px;"><div style="flex:1;height:8px;background:var(--bg3);border-radius:5px;overflow:hidden;min-width:70px;"><div style="width:'+pct+'%;height:100%;background:linear-gradient(90deg,#2d6fd4,#7c3aed);"></div></div><b style="font-size:12.5px;white-space:nowrap;">'+nf(o.tokens)+'</b></div></td></tr>'; }).join(''):'<tr><td colspan="5" style="padding:18px;text-align:center;color:var(--text3);">조직 정보 없음 (사용자에 회사·소속 설정 시 집계)</td></tr>';
  const modelRows=(st.models||[]).map(function(m){ return '<tr style="border-top:1px solid var(--border);"><td style="padding:6px 10px;font-weight:700;">'+esc(m.model||'(미상)')+'</td><td style="padding:6px 10px;text-align:right;">'+nf(m.questions)+'</td><td style="padding:6px 10px;text-align:right;font-weight:700;">'+nf(m.tokens)+'</td></tr>'; }).join('');
  const fbRows=fb.length?fb.map(function(f){ var th=f.thumb>0?'<i class="ti ti-thumb-up-filled" style="color:#00a872;font-size:14px;"></i>':(f.thumb<0?'<i class="ti ti-thumb-down-filled" style="color:#e53e5a;font-size:14px;"></i>':''); var sc=f.score?('<span style="font-weight:800;color:#7c3aed;font-size:12.5px;">'+f.score+'/10</span>'):''; var rs=(f.reasons&&f.reasons.length)?('<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:6px;">'+f.reasons.map(function(r){return '<span style="font-size:10.5px;background:var(--bg3);border:1px solid var(--border);border-radius:11px;padding:2px 8px;color:var(--text2);">'+esc(r)+'</span>';}).join('')+'</div>'):''; return '<div style="border:1px solid var(--border);border-radius:10px;padding:11px 13px;margin-bottom:8px;background:#fff;"><div style="display:flex;align-items:center;gap:8px;">'+th+sc+'<span style="font-size:11px;color:var(--text3);">'+esc(f.by||'')+' · '+esc(f.at||'')+(f.model?(' · '+esc(f.model)):'')+'</span><span style="flex:1;"></span><i class="ti ti-trash" onclick="aiFbDel(\''+f.id+'\')" title="삭제" style="cursor:pointer;color:#b6c0cf;font-size:14px;"></i></div>'+rs+(f.comment?('<div style="font-size:12.5px;color:var(--text);margin-top:6px;">'+esc(f.comment)+'</div>'):'')+(f.question?('<div style="font-size:11px;color:var(--text3);margin-top:5px;">Q: '+esc(String(f.question).slice(0,120))+'</div>'):'')+'</div>'; }).join(''):'<div style="padding:30px;text-align:center;color:var(--text3);border:2px dashed var(--border);border-radius:12px;">피드백이 없습니다.</div>';
  body.innerHTML='<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap;"><i class="ti ti-chart-bar" style="font-size:24px;color:#7c3aed;"></i><span style="font-size:20px;font-weight:700;">AI 피드백·통계</span><span style="flex:1;"></span><div style="display:flex;gap:5px;">'+perBtn(7,'7일')+perBtn(30,'30일')+perBtn(90,'90일')+perBtn(0,'전체')+'</div><button onclick="renderAIStats()" style="font-size:12px;font-weight:700;padding:5px 12px;border:1px solid var(--border);border-radius:7px;background:#fff;cursor:pointer;"><i class="ti ti-refresh"></i></button></div>'
    +'<div style="display:flex;gap:11px;flex-wrap:wrap;margin-bottom:20px;">'+card('ti-message-2','메시지',nf(st.total_questions),'#2d6fd4')+card('ti-coin','토큰(추정)',nf(st.total_tokens),'#7c3aed')+card('ti-users','사용자',nf(st.distinct_users),'#0ea5e9')+card('ti-thumb-up','피드백',nf(st.feedback_count)+'건','#f5b731')+card('ti-star-filled','평균',(st.feedback_avg||0)+' / 10','#00a872')+'</div>'
    +'<div style="font-size:14px;font-weight:800;margin-bottom:8px;"><i class="ti ti-chart-line"></i> 일별 사용 추이</div>'
    +'<div style="border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:24px;background:#fff;height:240px;position:relative;"><canvas id="ai-daily-chart"></canvas></div>'
    +'<div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start;">'
      +'<div style="flex:1;min-width:380px;"><div style="font-size:14px;font-weight:800;margin-bottom:8px;"><i class="ti ti-user"></i> 개인별 사용량 (토큰 순)</div><div style="border:1px solid var(--border);border-radius:12px;overflow:hidden;"><table style="width:100%;border-collapse:collapse;font-size:12.5px;"><thead><tr style="background:var(--bg2);"><th style="padding:8px 10px;text-align:left;">#</th><th style="padding:8px 10px;text-align:left;">사용자</th><th style="padding:8px 10px;text-align:right;">메시지</th><th style="padding:8px 10px;text-align:right;">입력</th><th style="padding:8px 10px;text-align:right;">출력</th><th style="padding:8px 10px;text-align:left;">총 토큰</th></tr></thead><tbody>'+userRows+'</tbody></table></div></div>'
      +'<div style="flex:1;min-width:340px;"><div style="font-size:14px;font-weight:800;margin-bottom:8px;"><i class="ti ti-building"></i> 조직별 사용량 (토큰 순)</div><div style="border:1px solid var(--border);border-radius:12px;overflow:hidden;"><table style="width:100%;border-collapse:collapse;font-size:12.5px;"><thead><tr style="background:var(--bg2);"><th style="padding:8px 10px;text-align:left;">#</th><th style="padding:8px 10px;text-align:left;">조직(회사▸담당▸팀)</th><th style="padding:8px 10px;text-align:right;">인원</th><th style="padding:8px 10px;text-align:right;">메시지</th><th style="padding:8px 10px;text-align:left;">총 토큰</th></tr></thead><tbody>'+orgRows+'</tbody></table></div></div>'
    +'</div>'
    +(modelRows?('<div style="font-size:14px;font-weight:800;margin:24px 0 8px;"><i class="ti ti-cpu"></i> 모델별</div><div style="border:1px solid var(--border);border-radius:12px;overflow:hidden;max-width:520px;"><table style="width:100%;border-collapse:collapse;font-size:12.5px;"><thead><tr style="background:var(--bg2);"><th style="padding:7px 10px;text-align:left;">모델</th><th style="padding:7px 10px;text-align:right;">메시지</th><th style="padding:7px 10px;text-align:right;">토큰</th></tr></thead><tbody>'+modelRows+'</tbody></table></div>'):'')
    +'<div style="font-size:14px;font-weight:800;margin:24px 0 8px;"><i class="ti ti-message-star"></i> 피드백 ('+fb.length+')</div><div style="max-width:760px;">'+fbRows+'</div>';
  // 일별 차트
  try{
    if(window.Chart){
      var daily=st.daily||[]; var cv=document.getElementById('ai-daily-chart');
      if(cv){ if(window._aiDailyChart){ try{window._aiDailyChart.destroy();}catch(e){} }
        window._aiDailyChart=new Chart(cv,{type:'line',data:{labels:daily.map(function(d){return String(d.day).slice(5);}),datasets:[{label:'메시지',data:daily.map(function(d){return d.messages;}),borderColor:'#2d6fd4',backgroundColor:'rgba(45,111,212,0.10)',fill:true,tension:0.3,yAxisID:'y',pointRadius:2},{label:'토큰',data:daily.map(function(d){return d.tokens;}),borderColor:'#7c3aed',backgroundColor:'rgba(124,58,237,0.06)',fill:true,tension:0.3,yAxisID:'y1',pointRadius:2}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:true,labels:{boxWidth:12,font:{size:11}}}},scales:{y:{position:'left',beginAtZero:true,title:{display:true,text:'메시지'}},y1:{position:'right',beginAtZero:true,grid:{drawOnChartArea:false},title:{display:true,text:'토큰'}}}}});
      }
    }
  }catch(e){}
}
async function aiFbDel(id){ if(!confirm('이 피드백을 삭제할까요?'))return; try{ await userApi('DELETE','/api/ai/feedback/'+encodeURIComponent(id)); renderAIStats(); }catch(e){ if(typeof showToast==='function')showToast(e.message); } }
// ── FAB 오프닝 메시지 (관리자 편집 가능, 서버 저장) ──
const _AI_FAB_GREET_DEF='안녕하세요! Ubiquoss-TOP AI 어시스턴트입니다.<br>장비·시험·REQ/TC 무엇이든 물어보세요. <span style="color:var(--text3);font-size:12px;">(REQ ID와 함께 "TC 생성해줘" 하면 자동 생성)</span>';
function _aiFabGreetHtml(){
  var g=(typeof window!=='undefined'&&window._fabGreeting)?String(window._fabGreeting).trim():'';
  var body=g?g.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\n/g,'<br>'):_AI_FAB_GREET_DEF;
  var quick=(window._fabQuick&&window._fabQuick.length)?window._fabQuick:['현재 등록된 요구사항/TC 어떻게 있어?','제품군·모델별 시험 결과 알려줘'];
  var esc=function(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');};
  var chips=quick.length?('<div style="margin-top:14px;"><div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:8px;letter-spacing:.3px;">추천 질문</div><div style="display:flex;flex-direction:column;gap:8px;">'+quick.map(function(q){ return '<div onclick="_aiFabQuick(this)" data-q="'+encodeURIComponent(q)+'" style="display:flex;align-items:center;gap:10px;font-size:13px;color:var(--text);background:#fff;border:1px solid var(--border);border-radius:11px;padding:12px 15px;cursor:pointer;transition:all .12s;box-shadow:0 1px 2px rgba(0,0,0,0.03);" onmouseenter="this.style.borderColor=\'#2d6fd4\';this.style.background=\'#f5f8ff\';this.style.transform=\'translateX(2px)\';" onmouseleave="this.style.borderColor=\'var(--border)\';this.style.background=\'#fff\';this.style.transform=\'none\';"><i class="ti ti-message-2-bolt" style="color:#2d6fd4;font-size:17px;flex-shrink:0;"></i><span style="flex:1;line-height:1.4;">'+esc(q)+'</span><i class="ti ti-arrow-right" style="color:var(--text3);font-size:15px;flex-shrink:0;"></i></div>'; }).join('')+'</div></div>'):'';
  return body+chips;   // 오프닝 편집은 'AI 어시스턴트 설정' 메뉴로 분리(채팅 인라인 편집 제거)
}
function _aiFabQuick(el){ var q=decodeURIComponent(el.getAttribute('data-q')||''); var inp=document.getElementById('ai-fab-input'); if(inp){ inp.value=q; aiFabSend(); } }
// 직접 조회 — 목록/현황/결과는 LLM 거치지 않고 실데이터로 즉답 (정확성 보장)
function _aiFabEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;'); }
function _aiFabReqListHtml(){
  var R=(typeof reqList!=='undefined'?reqList:[])||[], T=(typeof tcList!=='undefined'?tcList:[])||[];
  if(!R.length) return '<b>등록된 요구사항(REQ)이 없습니다.</b>';
  var rows=R.slice(0,200).map(function(r){ var n=T.filter(function(t){return t.req_id===r.id;}).length; return '<div style="padding:4px 0;border-bottom:1px solid var(--border);"><span style="color:#2d6fd4;font-weight:700;font-size:11.5px;">'+_aiFabEsc(r.reqid||'')+'</span> '+_aiFabEsc(r.title||'')+' <span style="color:var(--text3);font-size:11px;">· TC '+n+'</span></div>'; }).join('');
  return '<b>📋 요구사항(REQ) '+R.length+'개</b>'+(R.length>200?' (상위 200)':'')+'<div style="margin-top:6px;max-height:330px;overflow:auto;">'+rows+'</div>';
}
function _aiFabTcListHtml(){
  var T=(typeof tcList!=='undefined'?tcList:[])||[];
  if(!T.length) return '<b>등록된 시험항목(TC)이 없습니다.</b>';
  var rows=T.slice(0,300).map(function(t){ var st=(t.result_history&&t.result_history[0]&&t.result_history[0].result)||''; return '<div style="padding:4px 0;border-bottom:1px solid var(--border);"><span style="color:#00875a;font-weight:700;font-size:11.5px;">'+_aiFabEsc(t.tcid||t.id||'')+'</span> '+_aiFabEsc(t.name||'')+(st?(' <span style="font-size:10.5px;color:'+(st==='Fail'?'#e53e5a':'#00a872')+';">['+_aiFabEsc(st)+']</span>'):'')+'</div>'; }).join('');
  return '<b>🧪 시험항목(TC) '+T.length+'개</b>'+(T.length>300?' (상위 300)':'')+'<div style="margin-top:6px;max-height:330px;overflow:auto;">'+rows+'</div>';
}
function _aiFabResultHtml(){
  var C=(typeof cycleList!=='undefined'?cycleList:[])||[];
  if(!C.length) return '<b>사이클(시험 결과)이 없습니다.</b>';
  var _role=function(m){ try{ var d=(typeof modelList!=='undefined'?modelList:[]).find(function(x){return x.name===m;}); return d&&d.role?d.role:''; }catch(e){return '';} };
  var byM={}, byR={};
  C.forEach(function(c){ var m=c.model||'(미상)'; var r=_role(m)||'(제품군 미상)'; var dm=byM[m]||(byM[m]={pass:0,fail:0,tc:0}); var dr=byR[r]||(byR[r]={pass:0,fail:0,tc:0}); (c.items||[]).forEach(function(it){ dm.tc++; dr.tc++; (it.steps||[]).forEach(function(s){ if(s.result==='Pass'){dm.pass++;dr.pass++;} else if(s.result==='Fail'){dm.fail++;dr.fail++;} }); }); });
  var rrow=function(name,d){ var tot=d.pass+d.fail; var rate=tot?Math.round(d.pass/tot*100):0; return '<div style="padding:5px 0;border-bottom:1px solid var(--border);"><b>'+_aiFabEsc(name)+'</b> — TC '+d.tc+' · <span style="color:#00a872;">합격 '+d.pass+'</span> / <span style="color:#e53e5a;">불합격 '+d.fail+'</span>'+(tot?(' · '+rate+'%'):'')+'</div>'; };
  return '<b>📊 제품군별 시험결과</b><div style="margin-top:5px;">'+Object.keys(byR).map(function(r){return rrow(r,byR[r]);}).join('')+'</div><b style="display:block;margin-top:11px;">모델별 시험결과</b><div style="margin-top:5px;">'+Object.keys(byM).map(function(m){return rrow(m,byM[m]);}).join('')+'</div>';
}
async function _aiFabRenderManuals(bubble){
  var M=[]; try{ M=((await (await fetch('/api/manuals')).json()).manuals)||[]; }catch(e){}
  try{ if(typeof manualList!=='undefined') manualList=M; }catch(e){}
  if(bubble){ bubble.innerHTML=_aiFabManualListHtml(M); _aiFabScrollEnd(bubble); }
}
function _aiFabManualListHtml(M){
  M=M||(typeof manualList!=='undefined'?manualList:[])||[];
  if(!M.length) return '<b>📚 등록된 메뉴얼이 없습니다.</b><br><span style="font-size:12px;color:var(--text3);">AI 학습 데이터 페이지에서 문서를 업로드하세요. (Confluence는 라이브 조회로 별도 검색됩니다)</span>';
  var esc=function(s){return String(s||'').replace(/</g,'&lt;');};
  var byF={}; M.forEach(function(m){ var f=m.folder||'미분류'; (byF[f]=byF[f]||[]).push(m); });
  var rows=Object.keys(byF).map(function(f){
    var items=byF[f].map(function(m){ return '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);"><i class="ti ti-file-text" style="color:#2d6fd4;flex-shrink:0;"></i><div style="flex:1;min-width:0;"><div style="font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(m.name)+'</div><div style="font-size:10.5px;color:var(--text3);">'+esc(m.source||'')+(m.chars?(' · '+(m.chars).toLocaleString()+'자'):'')+(m.image_count?(' · 📷'+m.image_count):'')+(m.active===false?' · <span style="color:#c0392b;">비활성</span>':'')+'</div></div></div>'; }).join('');
    return '<div style="margin-top:8px;"><div style="font-size:11px;font-weight:800;color:#6b3fc4;"><i class="ti ti-folder"></i> '+esc(f)+' ('+byF[f].length+')</div>'+items+'</div>';
  }).join('');
  return '<b>📚 등록된 메뉴얼 ('+M.length+'개)</b>'+rows;
}
function _aiFabDirectAnswer(msg){
  var m=String(msg||'');
  // 위키/Confluence를 명시하면 UTOP 직접답변 안 하고 Confluence로 라우팅
  if(/컨플런스|컨플루언스|컨플|confluence|위키|wiki/i.test(m)) return null;
  // 모델코드/스펙 질문(E7100 시리즈 전체 스펙 등)은 내부 직접답변 대상 아님 → null로 넘겨 Confluence로 라우팅
  var _internalT=/요구사항|\breq\b|\btc\b|시험\s*항목|사이클|미시험|진행|합격|불합격|마일스톤|등록\s*현황/i.test(m);
  if(!_internalT && (/스펙|사양|형상|\bfan\b|팬|전원|온도|성능|디버깅|시리즈/i.test(m) || /[A-Za-z]{1,4}\d{3,}/.test(m))) return null;
  var R=(typeof reqList!=='undefined'?reqList:[])||[], T=(typeof tcList!=='undefined'?tcList:[])||[], C=(typeof cycleList!=='undefined'?cycleList:[])||[];
  var askReq=/요구사항|req/i.test(m), askTc=/시험\s*항목|시험항목|테스트|케이스|\btc\b/i.test(m), askResult=/결과|합격|불합격|통계|제품군|모델별|품질|성공률/i.test(m);
  var askManual=/메뉴얼|매뉴얼|학습\s*데이터|등록.{0,4}문서|지식\s*문서/i.test(m);
  var listWord=/리스트|목록|등록|조회|보여|알려|있는지|어떤|전체|현황|몇|개수/i.test(m);
  // "등록된 메뉴얼은/메뉴얼 목록" → 목록. 단 "메뉴얼에서 ~설정/방법"처럼 내용 검색이면 제외(RAG로 넘김)
  var _manualContent=/메뉴얼\s*(에서|에|의|안|중|로)|설정|방법|명령|어떻게|값|절차|구성|configure|vlan/i.test(m);
  if(askManual && listWord && !_manualContent) return '__MANUALS__';
  if(askResult && /결과|합격|불합격|통계|제품군|모델별|품질|성공률/i.test(m)) return _aiFabResultHtml();
  if(!listWord) return null;
  if(askTc && !askReq) return _aiFabTcListHtml();
  if(askReq && !askTc) return _aiFabReqListHtml();
  if(askReq && askTc) return _aiFabReqListHtml()+'<div style="margin-top:12px;"></div>'+_aiFabTcListHtml();
  if(/현황|개수|몇|전체|등록/i.test(m) && !/진행|미시험|중인|시험|사이클|결과/i.test(m)) return '<b>현재 등록 현황</b><br>· 요구사항(REQ): <b>'+R.length+'</b>개<br>· 시험항목(TC): <b>'+T.length+'</b>개<br>· 사이클: <b>'+C.length+'</b>개';
  return null;
}
// FAB 프롬프트 단일 출처 — 페르소나(sys, 편집 가능) + 고정 규칙(rules, 라우팅·형식·HITL)
function _fabPromptParts(){
  return {
    sys: '당신은 Ubiquoss-TOP(Ubiquoss Test Orchestration Platform)의 AI 어시스턴트입니다. 유비쿼스 네트워크 장비(스위치·OLT) 시험 자동화를 지원합니다. CLI 명령어는 코드 블록으로 표시하고 한국어로 답변하세요.',
    rules: '\n\n[UTOP 지식 구조] 너는 3가지 소스로 답한다 — ① 사내 매뉴얼: 사용자가 업로드한 문서([참고 지식]의 매뉴얼·시험절차). ② Confluence 위키: 제품 스펙·형상·FAN·전원 등은 주로 여기 *_Series_Spec 페이지에 있음([참고 지식]의 Confluence 항목, 본문에 ![image](URL) 이미지 포함). ③ 실시간 현황: REQ/TC/사이클 등 UTOP 자체 데이터([실시간 현황]). 제품 스펙/형상 질문은 ②를, 목록·현황·개수 질문은 ③을 우선 근거로 삼아라.\n[답변 규칙] 위 [실시간 현황]과 [참고 지식]에 근거해서만 답하라. REQ/TC/사이클의 목록·현황·개수·결과 질문은 반드시 [실시간 현황]으로 그대로 답하고 "학습된 데이터에 없습니다"라고 하지 마라. 질문의 모델/시리즈명이 페이지의 여러 모델을 포괄하면(예: "E7100"은 시리즈명, 실제 모델은 E7124·E7148·E7148T / "E6100 시리즈"는 E6100·E6124), "#### 요약"에서 "◯◯ 시리즈에는 A, B, C 모델이 있습니다"를 밝히고, 각 모델의 주요 스펙 비교 표는 "#### 세부 사항" 안에 넣어라 — 절대 한 모델만 답하지 마라. 입력한 이름이 개별 모델이면(예: E6100) 그 모델 위주로 답하되 같은 시리즈의 형제 모델도 함께 언급하라. 관련 내용이 [참고 지식]·[실시간 현황]에 전혀 없을 때만 "학습된 데이터에 없습니다"라고 한 줄로 밝혀라. 추측 금지.\n[형식/이미지] 제품 스펙·형상 질문이면 반드시 이 순서로만 작성하라 — 맨 위에 "#### 요약"(제품군·시리즈 개요와 어떤 모델들이 있는지 1~2줄), 그 다음 "#### 세부 사항"(여러 모델이면 비교 표를 먼저, 이어서 외형·이미지·하드웨어·성능·전원). 요약을 항상 최상단에 두고, 표·이미지는 세부 사항 안에만 넣어라(요약 위에 표·모델목록을 두지 마라). [참고 지식] 본문에 ![image](URL) 이미지가 있으면 관련 설명 바로 아래에 그 마크다운을 URL 그대로(변형·생략 금지) 출력하라 — 이미지는 반드시 함께 보여라. 본문이 영어면 영어 그대로 두라.\n[필수] 질문에 모델명/시리즈(예: E6100, E7100, P8624XG)가 이미 있으면 모델을 절대 되묻지 마라 — 그 모델 기준으로 [참고 지식]에서 바로 답하라. 모델이 명시됐는데 [CLARIFY]로 모델을 묻는 것은 금지.\n[디버깅] "디버깅/장애/문제 해결/방법(how-to)" 질문은 모델명을 되묻지 마라. [참고 지식]의 디버깅 문서(예: How to debuging)에서 일반 절차를 그대로 답하라. 모델별로 절차가 다를 때만 모델을 물어라.\n[HITL] 정보가 충분하면 절대 되묻지 말고 바로 답하라. 다만 (a) 질문이 모호해 무엇을 묻는지 이해하기 어렵거나, (b) 대상(모델/항목)이 특정되지 않아 후보가 여럿이거나, (c) [참고 지식]·[실시간 현황]에 답할 근거가 부족해 답이 애매·불확실할 때는 — "학습된 데이터에 없습니다"로 끝내지 말고, 응답 첫 줄에 정확히 [CLARIFY]만 쓰고 다음 줄에 "무엇을 더 알려주면 정확히 찾을 수 있는지"(예: 정확한 모델명, 구체 항목)를 "- 질문" 형식으로 물어라. 정확한 답을 위해 필요하면 한 번에 다 묻지 말고 2~3단계로 가장 중요한 것부터 하나씩 단계적으로 확인해도 된다(매 단계 질문 1개 권장). 사용자가 모델명을 말해야 할 때는 질문에 "모델"이라는 단어를 포함하라.'
  };
}
// AI 어시스턴트 설정 페이지 — 오프닝 메시지 관리 (메뉴: AI Assistant ▸ AI 어시스턴트 설정)
async function renderAiConfig(){
  var box=document.getElementById('ai-config-body'); if(!box)return;
  var admin=(typeof isAdmin==='function'&&isAdmin());
  var cur='', quick=[], prompt='', rules=''; try{ var d=await (await fetch('/api/branding')).json(); cur=(d&&typeof d.fab_greeting==='string')?d.fab_greeting:''; quick=(d&&Array.isArray(d.fab_quick))?d.fab_quick:[]; prompt=(d&&typeof d.fab_prompt==='string')?d.fab_prompt:''; rules=(d&&typeof d.fab_rules==='string')?d.fab_rules:''; window._fabGreeting=cur; window._fabQuick=quick; window._fabPrompt=prompt; window._fabRules=rules; }catch(e){}
  var esc=function(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');};
  if(!admin){ box.innerHTML='<div style="color:var(--text3);font-size:13px;">관리자만 수정할 수 있습니다.</div>'; return; }
  var pp=_fabPromptParts(); var tab=window._aiCfgCurTab||'opening';
  var tb=function(k,ic,lab){ return '<div onclick="_aiCfgTab(\''+k+'\')" id="aicfg-tab-'+k+'" style="padding:9px 17px;font-size:13.5px;font-weight:700;cursor:pointer;border-bottom:2px solid '+(tab===k?'#7c3aed':'transparent')+';color:'+(tab===k?'#7c3aed':'var(--text3)')+';"><i class="ti '+ic+'"></i> '+lab+'</div>'; };
  var openingTab='<div style="display:flex;align-items:center;gap:8px;font-size:15px;font-weight:800;margin-bottom:6px;"><i class="ti ti-message-dots" style="color:#7c3aed;"></i> 오프닝 메시지</div>'
    +'<div style="font-size:12px;color:var(--text3);margin-bottom:10px;line-height:1.6;">AI 어시스턴트(우하단 토글바)를 처음 열 때 표시되는 인사말입니다. 줄바꿈 가능 · 비우면 기본 문구가 표시됩니다.</div>'
    +'<textarea id="aicfg-greeting" rows="4" placeholder="예: 안녕하세요! 무엇을 도와드릴까요?" style="width:100%;font-size:13px;padding:11px 13px;border:1px solid var(--border);border-radius:9px;box-sizing:border-box;resize:vertical;line-height:1.6;outline:none;">'+esc(cur)+'</textarea>'
    +'<div style="display:flex;align-items:center;gap:8px;font-size:15px;font-weight:800;margin:26px 0 6px;"><i class="ti ti-bulb" style="color:#7c3aed;"></i> 추천 질문 (오프닝 칩)</div>'
    +'<div style="font-size:12px;color:var(--text3);margin-bottom:12px;line-height:1.6;">인사말 아래에 표시되는 클릭형 추천 질문입니다. <b>「+ 질문 추가」</b>로 추가, 최대 50개. 비우면 기본 질문이 표시됩니다.</div>'
    +'<div id="aicfg-quick-list">'+(quick.length?quick:['']).map(function(q){return _aiCfgQuickRow(q);}).join('')+'</div>'
    +'<button onclick="_aiCfgAddQuick()" style="font-size:12.5px;font-weight:700;padding:8px 14px;border:1px dashed var(--border);border-radius:8px;background:#fff;color:#2d6fd4;cursor:pointer;margin-top:2px;"><i class="ti ti-plus"></i> 질문 추가</button>'
    +'<div style="margin-top:18px;display:flex;gap:8px;align-items:center;border-top:1px solid var(--border);padding-top:16px;"><button onclick="_aiCfgSaveGreeting()" style="font-size:13px;font-weight:800;padding:9px 22px;border:none;border-radius:8px;background:#00a872;color:#fff;cursor:pointer;"><i class="ti ti-device-floppy"></i> 모두 저장</button><span id="aicfg-msg" style="font-size:12px;color:var(--text3);"></span></div>';
  var promptTab='<div style="display:flex;align-items:center;gap:8px;font-size:15px;font-weight:800;margin-bottom:6px;"><i class="ti ti-robot" style="color:#7c3aed;"></i> 어시스턴트 기본 지침 (페르소나)</div>'
    +'<div style="font-size:12px;color:var(--text3);margin-bottom:10px;line-height:1.6;">AI의 역할·어조를 정의합니다. 비우면 아래 기본 지침이 적용됩니다.</div>'
    +'<textarea id="aicfg-prompt" rows="4" placeholder="'+esc(pp.sys)+'" style="width:100%;font-size:13px;padding:11px 13px;border:1px solid var(--border);border-radius:9px;box-sizing:border-box;resize:vertical;line-height:1.6;outline:none;">'+esc(prompt)+'</textarea>'
    +'<div style="margin-top:10px;display:flex;gap:8px;align-items:center;"><button onclick="_aiCfgSavePrompt()" style="font-size:13px;font-weight:800;padding:9px 20px;border:none;border-radius:8px;background:#00a872;color:#fff;cursor:pointer;"><i class="ti ti-device-floppy"></i> 저장</button><button onclick="_aiCfgResetPrompt()" style="font-size:12.5px;font-weight:700;padding:9px 14px;border:1px solid var(--border);border-radius:8px;background:#fff;color:var(--text2);cursor:pointer;">기본값</button><span id="aicfg-pmsg" style="font-size:12px;color:var(--text3);"></span></div>'
    +'<div style="display:flex;align-items:center;gap:7px;font-size:13.5px;font-weight:800;color:var(--text2);margin:26px 0 6px;"><i class="ti ti-adjustments-alt" style="color:#7c3aed;"></i> 답변 규칙 (라우팅·형식·HITL · 모든 답변에 자동 적용)</div>'
    +'<div style="font-size:11.5px;color:#b5730f;margin-bottom:8px;line-height:1.6;background:#fff8ec;border:1px solid #f0d8a8;border-radius:7px;padding:8px 11px;">⚠ 이 규칙은 그동안 버그를 잡으며 정교하게 맞춘 것입니다. 잘못 수정하면 답변 형식·라우팅·되묻기 동작이 깨질 수 있습니다. 문제가 생기면 <b>「기본값 복원」</b>으로 되돌리세요. (비우면 기본 규칙 자동 적용)</div>'
    +'<textarea id="aicfg-rules" rows="14" style="width:100%;font-size:11.5px;padding:13px 15px;border:1px solid var(--border);border-radius:9px;box-sizing:border-box;resize:vertical;line-height:1.7;outline:none;font-family:Consolas,monospace;color:var(--text2);">'+esc(rules||pp.rules.trim())+'</textarea>'
    +'<div style="margin-top:10px;display:flex;gap:8px;align-items:center;"><button onclick="_aiCfgSaveRules()" style="font-size:13px;font-weight:800;padding:9px 20px;border:none;border-radius:8px;background:#00a872;color:#fff;cursor:pointer;"><i class="ti ti-device-floppy"></i> 규칙 저장</button><button onclick="_aiCfgResetRules()" style="font-size:12.5px;font-weight:700;padding:9px 14px;border:1px solid #f0c2cc;border-radius:8px;background:#fff;color:#e53e5a;cursor:pointer;"><i class="ti ti-refresh"></i> 기본값 복원</button><span id="aicfg-rmsg" style="font-size:12px;color:var(--text3);"></span></div>';
  box.innerHTML='<div style="max-width:780px;">'
    +'<div style="display:flex;gap:2px;border-bottom:1px solid var(--border);margin-bottom:20px;">'+tb('opening','ti-message-dots','오프닝 메시지')+tb('prompt','ti-prompt','프롬프트 설정')+'</div>'
    +(tab==='prompt'?promptTab:openingTab)   // 활성 탭 하나만 렌더 (이중 패널 없음 → 중첩·토글 버그 원천 제거)
    +'</div>';
}
// 탭 전환: 활성 탭만 다시 렌더 (상태는 _aiCfgCurTab — 함수명과 충돌 방지)
function _aiCfgTab(k){ window._aiCfgCurTab=k; renderAiConfig(); }
async function _aiCfgSavePrompt(){ var v=((document.getElementById('aicfg-prompt')||{}).value)||''; var el=document.getElementById('aicfg-pmsg'); try{ await userApi('POST','/api/branding',{fab_prompt:v}); window._fabPrompt=v; if(el){el.style.color='#00875a';el.textContent='✅ 저장됨 (다음 질문부터 적용)';} }catch(e){ if(el){el.style.color='#e53e5a';el.textContent='실패: '+e.message;} } }
function _aiCfgResetPrompt(){ var t=document.getElementById('aicfg-prompt'); if(t)t.value=''; _aiCfgSavePrompt(); }
async function _aiCfgSaveRules(){ var v=((document.getElementById('aicfg-rules')||{}).value)||''; var pp=_fabPromptParts(); if(v.trim()===pp.rules.trim())v=''; var el=document.getElementById('aicfg-rmsg'); try{ await userApi('POST','/api/branding',{fab_rules:v}); window._fabRules=v; if(el){el.style.color='#00875a';el.textContent='✅ 저장됨 (다음 질문부터 적용)';} }catch(e){ if(el){el.style.color='#e53e5a';el.textContent='실패: '+e.message;} } }
async function _aiCfgResetRules(){ if(!confirm('답변 규칙을 기본값으로 되돌릴까요?'))return; var t=document.getElementById('aicfg-rules'); var pp=_fabPromptParts(); if(t)t.value=pp.rules.trim(); var el=document.getElementById('aicfg-rmsg'); try{ await userApi('POST','/api/branding',{fab_rules:''}); window._fabRules=''; if(el){el.style.color='#00875a';el.textContent='✅ 기본값으로 복원됨';} }catch(e){ if(el){el.style.color='#e53e5a';el.textContent='실패: '+e.message;} } }
function _aiCfgQuickRow(q){ return '<div class="aicfg-qrow" style="display:flex;gap:8px;align-items:center;margin-bottom:8px;"><i class="ti ti-message-2-bolt" style="color:#2d6fd4;font-size:16px;flex-shrink:0;"></i><input class="aicfg-q" value="'+String(q||'').replace(/"/g,'&quot;')+'" placeholder="추천 질문 입력 (예: E6100 형상 알려줘)" style="flex:1;font-size:13px;padding:9px 12px;border:1px solid var(--border);border-radius:8px;outline:none;"><button onclick="this.closest(\'.aicfg-qrow\').remove()" title="삭제" style="width:34px;height:34px;flex-shrink:0;border:1px solid var(--border);border-radius:8px;background:#fff;color:var(--red);cursor:pointer;"><i class="ti ti-trash"></i></button></div>'; }
function _aiCfgAddQuick(){ var l=document.getElementById('aicfg-quick-list'); if(!l)return; if(l.querySelectorAll('.aicfg-qrow').length>=50){ if(typeof showToast==='function')showToast('최대 50개까지'); return; } l.insertAdjacentHTML('beforeend', _aiCfgQuickRow('')); var ins=l.querySelectorAll('.aicfg-q'); if(ins.length)ins[ins.length-1].focus(); }
async function _aiCfgSaveGreeting(){
  var v=((document.getElementById('aicfg-greeting')||{}).value)||''; var el=document.getElementById('aicfg-msg');
  var quick=[].slice.call(document.querySelectorAll('#aicfg-quick-list .aicfg-q')).map(function(i){return (i.value||'').trim();}).filter(Boolean).slice(0,50);
  try{ await userApi('POST','/api/branding',{fab_greeting:v, fab_quick:quick}); window._fabGreeting=v; window._fabQuick=quick;
    if(el){el.style.color='#00875a';el.textContent='✅ 저장됨';}
    try{ var wrap=document.getElementById('ai-fab-msgs'); if(wrap){ var fb=wrap.querySelector('.ai-fab-row .ai-fab-bubble'); if(fb&&typeof _aiFabGreetHtml==='function') fb.innerHTML=_aiFabGreetHtml(); } }catch(e){}
  }catch(e){ if(el){el.style.color='#e53e5a';el.textContent='실패: '+e.message;} }
}async function _aiFabGreetSave(){
  var v=((document.getElementById('fab-greet-input')||{}).value)||'';
  try{
    await userApi('POST','/api/branding',{fab_greeting:v});
    window._fabGreeting=v;
    var md=document.getElementById('fab-greet-modal'); if(md)md.remove();
    var wrap=document.getElementById('ai-fab-msgs');
    if(wrap){ var fb=wrap.querySelector('.ai-fab-row .ai-fab-bubble'); if(fb) fb.innerHTML=_aiFabGreetHtml(); }
    if(typeof showToast==='function')showToast('✅ 오프닝 메시지 저장됨');
  }catch(e){ if(typeof showToast==='function')showToast('저장 실패(관리자만 가능): '+((e&&e.message)||e)); }
}
function aiFindReqInText(text){
  const norm=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const t=norm(text); if(!t) return null;
  let full=null, disp=null;
  (typeof reqList!=='undefined'?reqList:[]).forEach(r=>{
    const f=norm(r.reqid); const d=norm(typeof expDispId==='function'?expDispId(r.reqid):r.reqid);
    if(f&&f.length>=5&&t.indexOf(f)>=0) full=full||r;
    if(d&&d.length>=5&&t.indexOf(d)>=0) disp=disp||r;
  });
  return full||disp;
}
async function aiFabSend(){
  const input=document.getElementById('ai-fab-input'); if(!input) return;
  if(window._fabBusy){ if(typeof showToast==='function')showToast('답변 생성 중입니다 — 끝나면 입력하세요'); return; }   // 답변 중 재입력 차단
  const msg=input.value.trim(); if(!msg) return;
  window._fabBusy=true; _aiFabShowStop(true);   // 즉시 입력 잠금
  input.value='';
  try{
  // HITL 단계 깊이: 클래리파이 답으로 들어온 호출이면 +1, 새로 타이핑한 질문이면 0 (최대 3단)
  var _fromCl=window._fabFromClarify; window._fabFromClarify=false;
  window._fabClarifyDepth=_fromCl?((window._fabClarifyDepth||0)+1):0;
  if(!_fromCl){ window._hitlOrig=msg; window._hitlAdds=[]; }   // 새 질문 → HITL 누적 초기화(중복 방지)
  aiFabAppend('user', msg);
  const wantTC=/TC/i.test(msg) && /(생성|만들|작성|추가)/.test(msg);
  const req=aiFindReqInText(msg);
  if(wantTC && req){
    const disp=(typeof expDispId==='function'?expDispId(req.reqid):req.reqid);
    const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const dispId=id=>(typeof expDispId==='function'?expDispId(id):id);
    const stepCnt=t=>((t.checks||[]).filter(c=>(c.kind||'cli')==='cli').length)||(t.steps||[]).length;
    const b=aiFabAppend('ai','<i class="ti ti-loader spin"></i> <b>'+esc(disp)+'</b> 의 TC를 생성하고 있어요…',{html:true});
    const beforeIds=new Set(((typeof expReqTCs==='function')?expReqTCs(req):[]).map(t=>t.tcid));
    try{
      await llmGenTC(req.id);
      const afterTcs=(typeof expReqTCs==='function')?expReqTCs(req):[];
      const newTcs=afterTcs.filter(t=>!beforeIds.has(t.tcid));
      if(newTcs.length>0){
        const list=newTcs.map(t=>
          '<div onclick="aiFabToggle();expSelectTC(\''+t.tcid+'\')" title="클릭하여 TC 열기" style="cursor:pointer;background:#fff;border:1px solid var(--border);border-radius:7px;padding:6px 9px;" onmouseenter="this.style.borderColor=\'var(--blue)\';this.style.background=\'#f5f8fe\'" onmouseleave="this.style.borderColor=\'var(--border)\';this.style.background=\'#fff\'">'
          +'<div style="font-family:monospace;font-size:11px;font-weight:700;color:var(--blue);">'+esc(dispId(t.tcid))+' <span style="color:var(--green);font-weight:600;">· '+stepCnt(t)+' step</span></div>'
          +'<div style="font-size:12px;color:var(--text);margin-top:1px;">'+esc(t.name)+'</div>'
        +'</div>').join('');
        b.innerHTML='✅ <b>'+esc(disp)+'</b> 에 TC <b>'+newTcs.length+'개</b>를 생성했습니다. (시험 절차 포함)'
          +'<div style="margin-top:7px;display:flex;flex-direction:column;gap:5px;">'+list+'</div>'
          +'<div style="font-size:11px;color:var(--text3);margin-top:6px;">각 항목을 클릭하면 해당 TC가 열립니다.</div>';
      } else {
        b.innerHTML='생성된 새 TC가 없습니다. 이미 동일한 TC가 있거나 LLM 응답이 비어있을 수 있어요.';
      }
    }catch(e){ if(b) b.innerHTML='⚠️ TC 생성 중 오류: '+String((e&&e.message)||e).replace(/</g,'&lt;'); }
    return;
  }
  if(wantTC && !req){
    aiFabAppend('ai','어떤 REQ의 TC를 만들까요? REQ ID를 함께 알려주세요. 예) <b>SYS-SW-ENV-001 TC 생성해줘</b>',{html:true});
    return;
  }
  // FAB에서 REQ/TC/사이클 데이터가 아직 로드 안 됐으면 즉시 로드 (직접답변 정확성 — "없습니다" 오답 방지)
  try{
    if((typeof tcList==='undefined'||!tcList||!tcList.length) && typeof loadTCData==='function') await loadTCData();
    if((typeof reqList==='undefined'||!reqList||!reqList.length) && typeof loadREQData==='function') await loadREQData();
    if((typeof cycleList==='undefined'||!cycleList||!cycleList.length) && typeof loadCycleData==='function') await loadCycleData();
  }catch(e){}
  // 직접 조회 — REQ/TC 목록·현황·시험결과는 LLM 거치지 않고 실데이터로 즉답
  var _direct=(typeof _aiFabDirectAnswer==='function')?_aiFabDirectAnswer(msg):null;
  if(_direct==='__MANUALS__'){ var _mb=aiFabAppend('ai','<span class="ring-spin"></span> 메뉴얼 목록 불러오는 중…',{html:true}); await _aiFabRenderManuals(_mb); return; }
  if(_direct){ aiFabAppend('ai', _direct, {html:true}); return; }
  // 라우팅이 모호하면(general) 먼저 "어떤 종류?"를 물어 선택받음 (강제 라우팅 미설정 시)
  if(!window._fabForcedIntent && (typeof _fabIntent==='function') && _fabIntent(msg)==='general'){ _aiFabRouteClarify(msg); return; }
  await _aiFabAnswer(msg);
  } finally { _aiFabShowStop(false); }   // 어떤 경로(직접답변·TC생성·클러리파이·스트리밍)로 끝나도 입력 잠금 해제
}
// 라우팅 모호 시: "어떤 정보를 찾으세요?" 3택 (클릭하면 해당 소스로 답변)
function _aiFabRouteClarify(origMsg){
  window._fabRouteMsg=origMsg;
  var b=aiFabAppend('ai','',{html:true});
  var opt=function(intent,ic,title,desc,col){ return '<button onclick="_aiFabRoutePick(\''+intent+'\')" style="display:block;width:100%;text-align:left;margin-top:7px;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:#fff;cursor:pointer;" onmouseenter="this.style.borderColor=\''+col+'\';this.style.background=\'#faf9ff\'" onmouseleave="this.style.borderColor=\'var(--border)\';this.style.background=\'#fff\'"><span style="font-size:13px;font-weight:800;color:'+col+';">'+ic+' '+title+'</span><br><span style="font-size:11px;color:var(--text3);">'+desc+'</span></button>'; };
  b.innerHTML='<div style="font-size:12.5px;color:#7c3aed;font-weight:800;margin-bottom:4px;"><i class="ti ti-help-circle-filled"></i> 어떤 정보를 찾으세요?</div>'
    +'<div style="font-size:11.5px;color:var(--text3);margin-bottom:2px;">선택하면 더 정확히 답해드려요.</div>'
    +opt('internal','📋','시험 항목·요구사항·사이클','REQ/TC/사이클 등 UTOP 내부 현황','#2d6fd4')
    +opt('manual','📚','메뉴얼·설정','업로드한 매뉴얼/설정 문서(학습 데이터)','#6b3fc4')
    +opt('spec','🌐','스펙·디버깅 방법','제품 사양·형상·디버깅(Confluence 위키)','#0a7a52');
  _aiFabScrollEnd(b);
}
function _aiFabRoutePick(intent){
  window._fabForcedIntent=intent;
  var msg=window._fabRouteMsg||''; if(msg) _aiFabAnswer(msg);
}
// 실제 답변 생성 (LLM 라우팅 + 지식 검색 + 스트리밍) — aiFabSend / 라우팅 선택 양쪽에서 호출
async function _aiFabAnswer(msg){
  // 선택/활성 LLM으로 라우팅 (로컬이면 로컬 LLM 사용)
  const _selId=document.getElementById('ai-fab-model')?.value||document.getElementById('chat-model-select')?.value;
  if(_selId && _selId.indexOf('dify:')===0){ var _da=_selId.slice(5); var _db=aiFabAppend('ai','<i class="ti ti-loader spin"></i>',{html:true}); await _aiFabDifySend(_da, msg, _db); return; }
  const _L=(typeof llmList!=='undefined'?llmList:[]);
  let llm=_L.find(x=>x.id===_selId);
  if(!llm) llm=_L.find(x=>x.status==='active'&&(x.uses||[]).includes('chat'))||_L.find(x=>x.status==='active'&&x.type!=='claude')||_L.find(x=>x.status==='active');
  const b=aiFabAppend('ai','<i class="ti ti-loader spin"></i>'+(llm?(' <span style="font-size:10px;color:var(--text3);">'+String(llm.name||'')+'</span>'):''),{html:true});
  const wrap=document.getElementById('ai-fab-msgs');
  const render=(txt)=>{ var _h=(typeof formatMsg==='function')?formatMsg(txt):String(txt||'').replace(/&/g,'&amp;').replace(/</g,'&lt;'); if(b) b.innerHTML=(typeof _aiFabInlineImgs==='function')?_aiFabInlineImgs(_h):_h; if(wrap) wrap.scrollTop=wrap.scrollHeight; };
  var _pp=_fabPromptParts();
  const sysPrompt=(window._fabPrompt&&String(window._fabPrompt).trim())?String(window._fabPrompt):_pp.sys;   // 관리자 커스텀 페르소나 우선
  const _ruleP=(window._fabRules&&String(window._fabRules).trim())?('\n\n'+String(window._fabRules).trim()):_pp.rules;   // 커스텀 규칙 우선, 없으면 기본
  let _kb=''; try{ _kb=await _aiFabRetrieve(msg, b); const _l=(typeof getRelevantLearnedText==='function')?await getRelevantLearnedText(msg,6000):''; if(_l) _kb=_kb+(_kb?'\n\n':'')+'[검증된 시험절차]\n'+_l; }catch(e){}
  const _live=(typeof _aiFabLiveContext==='function')?_aiFabLiveContext(msg):'';
  const _grounded=(llm&&llm.system_prompt?llm.system_prompt:sysPrompt)+_ruleP+(_live?('\n\n'+_live):'')+(_kb?('\n\n[참고 지식]\n'+_kb):'\n\n(참고 지식 없음 — 모호하면 먼저 질문하세요)');
  try{
    if(llm && llm.type!=='claude' && llm.endpoint){
      const payload={endpoint:llm.endpoint,model:llm.model,messages:[{role:'system',content:_grounded},{role:'user',content:msg}],max_tokens:llm.max_tokens||4096,context_size:llm.context_size||262144,temperature:Math.min((llm.temperature!=null?llm.temperature:0.7),0.35),apikey:llm.apikey||''};
      let full='';
      window._fabAbortCtrl=new AbortController(); window._fabStopped=false; _aiFabShowStop(true);
      try{
        await _streamSSE('/api/chat/local/stream', payload, (t)=>{ full+=t; render(full); }, window._fabAbortCtrl.signal);
      }catch(streamErr){
        if(streamErr&&(streamErr.name==='AbortError'||window._fabStopped)){ /* 사용자가 중지 — 부분 답변 유지 */ }
        else { const r=await fetch('/api/chat/local',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); full=(await r.json()).reply||''; }
      }
      _aiFabShowStop(false);
      if(window._fabStopped){ render(_aiFabFixOrder(full.trim())+(full.trim()?'\n\n_⏹ 중지됨_':'⏹ 중지됨')); _aiFabAppendImages(b); _aiFabLogUsage(llm, msg, full); return; }
      if(!_aiFabHandleClarify(b, full, msg)){ if(_aiFabIsNoData(full)&&(window._fabClarifyDepth||0)<3&&!/[A-Za-z]{1,4}\d{3,}/.test(msg)){ _aiFabNoDataClarify(b,msg); } else { render(_aiFabFixOrder(full.trim())||'(빈 응답)'); _aiFabAppendImages(b); } }
      _aiFabLogUsage(llm, msg, full);
    } else {
      const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:msg,history:[]})});
      const data=await r.json();
      if(!_aiFabHandleClarify(b, data.reply||'', msg)){ if(_aiFabIsNoData(data.reply||'')&&(window._fabClarifyDepth||0)<3&&!/[A-Za-z]{1,4}\d{3,}/.test(msg)){ _aiFabNoDataClarify(b,msg); } else { render(_aiFabFixOrder(data.reply||'')||'(빈 응답)'); _aiFabAppendImages(b); } }
      _aiFabLogUsage(llm, msg, data.reply||'');
    }
  }catch(e){ render('⚠️ 응답 오류: '+String((e&&e.message)||e)); }
  _aiFabShowStop(false);
}
