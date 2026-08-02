// ══════════════ 사용 도움말 (Help) ══════════════
// 좌측 메뉴 + 우측 마크다운 내용. 내용/메뉴 직접 편집 가능, /api/help 로 영속화.
let helpSections=null;     // [{key,label,icon,md}]
let helpCur='intro';
let _helpLoaded=false;
let helpEditing=null;   // 인라인 편집 중인 섹션 key (null=보기)
let _helpEd=null;       // TOAST UI Editor 인스턴스

const HELP_DEFAULT=[
  {key:'intro',label:'시작하기 · 개요',icon:'ti-rocket',md:[
    '# U-TOP 사용 도움말','',
    'U-TOP은 네트워크 장비 **시험 자동화 플랫폼**입니다. 상단 메뉴는 다음으로 구성됩니다.','',
    '| 메뉴 | 용도 |',
    '|------|------|',
    '| **대시보드** | 제품·계측기·시험 현황 요약 |',
    '| **AI** | AI 채팅, LLM 설정, AI 학습 데이터 |',
    '| **Test Management** | 요구사항·테스트 커버리지, 마일스톤, 테스트 사이클, 리포트 |',
    '| **Lab** | Rack 배치(Lab Rack View) |',
    '| **장비/계측기** | 장비·모델·벤더·라인카드·계측기 등록, **STC 트래픽 시험**, SNMP |',
    '| **시스템** | 테마·사용자·데이터·버전·설정, 그리고 이 **도움말** |','',
    '## 기본 사용 흐름','',
    '1. **장비·계측기 등록** (장비/계측기 메뉴)',
    '2. **요구사항(REQ) · 테스트케이스(TC)** 작성 및 연결',
    '3. **마일스톤 · 테스트 사이클**로 시험 계획·실행',
    '4. **STC 트래픽 시험** 등 실제 시험 수행',
    '5. **리포트**로 합격/불합격 집계','',
    '각 항목의 자세한 안내는 왼쪽 목록에서 선택하세요. (현재 **STC 트래픽 시험**이 가장 상세합니다.)'
  ].join('\n')},
  {key:'dashboard',label:'대시보드',icon:'ti-layout-dashboard',md:[
    '# 대시보드','',
    '현황을 한눈에 보는 화면입니다. 상단 메뉴 **대시보드**에서 세 가지로 전환할 수 있습니다.','',
    '- **제품 Dashboard** — 등록 제품/모델 현황',
    '- **계측기 Dashboard** — 계측기(STC 등) 상태',
    '- **시험 Dashboard** — 테스트 사이클 진행·합격률 요약'
  ].join('\n')},
  {key:'ai',label:'AI 채팅 · LLM',icon:'ti-message-circle',md:[
    '# AI 채팅 · LLM','',
    '- **AI 채팅** — 등록한 LLM에 질의하고 답변을 받습니다.',
    '- **LLM 설정** — 사용할 모델과 API 키 등을 등록/관리합니다.',
    '- **AI 학습 데이터** — 매뉴얼/문서를 업로드해 AI가 참고하도록 합니다.'
  ].join('\n')},
  {key:'tm',label:'요구사항 · 테스트 커버리지',icon:'ti-layout-columns',md:[
    '# 요구사항 · 테스트 커버리지','',
    '**Requirements & Test Coverage** 화면에서 요구사항(REQ)과 테스트케이스(TC)를 폴더로 관리하고 서로 **연결**해 커버리지를 확인합니다.','',
    '- 왼쪽 폴더 트리로 요구사항/테스트케이스를 정리합니다.',
    '- 요구사항에 테스트케이스를 매핑해 **어느 요구사항이 검증됐는지** 추적합니다.',
    '- **커스텀 필드 설정**으로 표에 필요한 항목을 추가할 수 있습니다.'
  ].join('\n')},
  {key:'plan',label:'마일스톤 · 사이클 · 리포트',icon:'ti-flag-3',md:[
    '# 마일스톤 · 테스트 사이클 · 리포트','',
    '## Milestone (Test Planning)','',
    '폴더 트리(승인)와 연속 간트로 시험 일정을 계획합니다. (요구사항·커버리지와 테스트 사이클 사이 단계)','',
    '## Test Cycle','',
    '사이클별로 테스트케이스를 실행하고 **합격/불합격/예정/제외** 판정을 기록합니다.','',
    '## Test Report','',
    '사이클 결과를 **도넛 차트와 계층별 통계**(합격·불합격·예정·제외)로 집계해 보여줍니다.'
  ].join('\n')},
  {key:'devices',label:'장비 · 모델 · 계측기 등록',icon:'ti-server-cog',md:[
    '# 장비 · 모델 · 계측기 등록','',
    '시험에 쓰는 자원을 등록합니다.','',
    '- **Device Registration** — 시험 대상(DUT) 장비',
    '- **Model / Line Card / Vendor Registration** — 모델·라인카드·제조사',
    '- **Traffic Generator Registration** — 트래픽 발생기(계측기)',
    '- **STC 트래픽 시험** — Spirent TestCenter 실트래픽 시험 (왼쪽 목록의 *STC 트래픽 시험* 참고)',
    '- **Rack 배치 (Lab Rack View)** — 랙에 장비를 배치/시각화'
  ].join('\n')},
  {key:'stc',label:'STC 트래픽 시험',icon:'ti-activity-heartbeat',md:[
    '# STC 트래픽 시험 도움말','',
    'Spirent TestCenter(STC) 실섀시에 REST API로 연결해, 가상 장비 간 UDP/TCP 트래픽을 보내고 **손실·지연을 실측**하는 기능입니다. 화면 상단 4단계를 순서대로 진행하세요.','',
    '## 시작 전 — 계측기 연결','',
    '- 우측 상단 **`REST:`** 표시가 *실행중*이어야 합니다. *대기*면 클릭해 STC REST 서버(stcweb.exe)를 켭니다.',
    '- 섀시는 1단계 진입 시 자동 연결됩니다. iTest와 섀시를 공유하므로 포트 점유에 유의하세요.','',
    '## 1단계 · 포트 예약','',
    '- 왼쪽 **포트 상태** 패널에 가능/내예약/타예약 수가 표시됩니다.',
    '- **가능**(초록) 포트를 클릭해 예약합니다. 양방향 시험이면 **2개**(A·B)를 예약하세요.',
    '- 예약한 포트는 *내 예약*으로 유지되어 다음 단계로 이어집니다.','',
    '## 2단계 · Device Setting (가상 장비)','',
    '- 예약한 포트 위에 가상 장비를 만듭니다. **L2**(EthernetII)와 **L3**(IPv4: IP·GW·Prefix) 지원.',
    '- **개수(Count)** 와 **증가(Step)** 로 한 포트에 장비를 여러 개(IP/MAC 자동 증가) 생성할 수 있습니다.',
    '- 플로우당 장비를 N개로 늘리면, 그 스트림이 **N개의 개별 스트림(플로우)** 으로 펼쳐집니다.','',
    '## 3단계 · Stream Block (트래픽 정의)','',
    '- 엑셀형 표에서 스트림을 정의합니다: **Source→Destination 장비**, 프레임 길이/모드, **부하(Load)+단위**(%·Mbps·bps·fps), 프로토콜(UDP/TCP), Dst/Src 포트.',
    '- 행별 **Active** 체크로 전송 여부를 정하고, **복사/삭제/추가**로 여러 스트림을 만듭니다.',
    '- **방향은 한 스트림당 하나(Source→Destination)** 입니다. 양방향이 필요하면 **반대 방향 스트림을 하나 더 추가**하세요. (예: `Stream_1` 2→3, `Stream_2` 3→2)','',
    '## 4단계 · 전송 · Result','',
    '- **지속 전송(정지까지)** 을 켜면 정지를 누를 때까지 보냅니다. 끄면 **시험 시간(초)** 동안만.',
    '- **결과 주기(초)** 마다 실시간 결과가 갱신됩니다.',
    '- **▶ 트래픽 전송** 시작 / **■ 정지** / **결과 지우기**(행은 유지, 값만 0).',
    '- 아래 **STC 콘솔**에 실제 REST 진행 로그가 실시간 표시됩니다.','',
    '## 결과 읽는 법 (개별 스트림)','',
    '결과표는 **개별 스트림(플로우)별**로 한 줄씩 보여줍니다. 같은 스트림이 여러 플로우면 `#1 #2 …`로 번호가 붙습니다.','',
    '| 컬럼 | 의미 |',
    '|------|------|',
    '| TX / RX | 그 스트림이 보낸/받은 프레임 수 |',
    '| 손실(Dropped) | STC가 **시퀀스 번호로 직접 센 실측 손실** |',
    '| 손실률 % | 손실 비율 |',
    '| 지연 µs (최소/평균/최대) | 전송 지연(latency) |',
    '| 지터 µs | 지연 변동(평균) |',
    '| 순서이탈/중복 | 순서 어긋남·중복 수신 프레임 |','',
    '- **무손실이면 손실=0, TX==RX** 가 됩니다. 맨 아래 합계에 **합격(무손실)/불합격** 판정이 표시됩니다.',
    '- 손실은 포트 TX−RX 뺄셈이 아니라 **시그니처(시퀀스) 기반 실측**이라 타이밍에 흔들리지 않습니다.',
    '- 정지 시 *송신정지 → 인플라이트 배수 → 정착값 읽기 → 분석정지* 순서라, 손실이 없으면 TX와 RX가 정확히 맞습니다.','',
    '## 자주 묻는 질문 / 문제해결','',
    '- **TX와 RX가 다른데 손실이 0?** 개별 스트림 기준으로는 손실이 없으면 TX==RX입니다. (양방향에서 한 *포트*의 TX와 RX는 서로 다른 스트림이라 포트 합산으로 보면 달라 보일 수 있습니다.)',
    '- **정지 후 재전송 시 에러?** 세션이 서버 연결을 잃으면(섀시 공유 환경) 자동으로 감지해 새 세션으로 복구합니다(콘솔에 *손상된 전송 세션 정리* 표시). 그래도 *이미 전송 중*이 반복되면 백엔드(서버)를 재시작하세요.',
    '- **시작이 오래 걸려요.** 섀시 *연결·예약·매핑(AttachPorts)* 에 시간이 듭니다. 콘솔의 **`⏱ 시작 준비 총 소요`** 로그로 어느 단계가 오래 걸리는지 확인할 수 있습니다.',
    '- **스트림이 정의한 개수보다 많이 나와요.** 2단계에서 장비 개수(Count)를 늘리면 한 스트림이 그 수만큼 개별 플로우로 펼쳐집니다(정상).'
  ].join('\n')},
  {key:'snmp',label:'SNMP OID 관리',icon:'ti-binary-tree',md:[
    '# SNMP OID 관리','',
    '**SNMP OID Management**에서 장비 모니터링/검증에 쓰는 OID를 등록·관리합니다.'
  ].join('\n')},
  {key:'system',label:'시스템 설정',icon:'ti-settings',md:[
    '# 시스템 설정','',
    '- **테마 설정** — 라이트/다크 등 화면 테마',
    '- **사용자 관리** — 계정 관리 (관리자 전용)',
    '- **데이터 내보내기 / 가져오기** — 설정·데이터 백업/복원',
    '- **버전 현황 / 시스템 설정** — 버전 정보 및 환경 설정','',
    '향후 설정류 메뉴는 관리자 전용으로 분류될 예정입니다.'
  ].join('\n')},
  {key:'install',label:'설치 방법 (새 PC 세팅)',icon:'ti-download',md:[
    '# 설치 방법 (새 PC 세팅)','',
    'U-TOP 구동에 필요한 **프로그램 · Python 패키지 · 실행 방법**입니다.','',
    '## 1. 필수 프로그램','',
    '| 프로그램 | 버전 | 용도 |',
    '|------|------|------|',
    '| Python | 3.13.14 (64-bit) | 백엔드 런타임 |',
    '| Spirent TestCenter Application x64 | 5.23.0756 | STC 트래픽 시험 (REST 서버 대상) |','',
    '> PostgreSQL 등은 U-TOP 에서 사용하지 않습니다. (데이터는 `data/` 폴더의 JSON 파일을 사용)','',
    '## 2. Python 패키지 설치','',
    '프로젝트 폴더에서 가상환경 생성 후 설치합니다.','',
    '```',
    'python -m venv .venv',
    '.venv\\Scripts\\activate',
    'pip install -r requirements.txt',
    '```','',
    '| 패키지 | 버전 | 용도 |',
    '|------|------|------|',
    '| fastapi | 0.115.0 | 웹 백엔드 프레임워크 |',
    '| uvicorn[standard] | 0.30.0 | ASGI 서버 |',
    '| websockets | 12.0 | 실시간(WebSocket) 통신 |',
    '| paramiko | 3.4.0 | SSH 접속 |',
    '| netmiko | 4.6.0 | 네트워크 장비 CLI 자동화 |',
    '| anthropic | 0.109.2 | AI Assistant |',
    '| stcrestclient | 1.9.6 | Spirent STC REST 연동 |',
    '| python-pptx | 1.0.2 | PPT 리포트 생성 |',
    '| Pillow | 12.2.0 | 이미지 처리 |',
    '| pydantic | 2.8.0 | 데이터 검증 |',
    '| httpx | 0.27.0 | HTTP 클라이언트 |',
    '| python-multipart | 0.0.9 | 파일 업로드 |',
    '| aiofiles | 23.2.1 | 비동기 파일 I/O |',
    '| python-dotenv | 1.0.0 | 환경변수(.env) |','',
    '> 그 외 패키지(starlette · cryptography · textfsm · ntc_templates · scp 등)는 위 패키지가 자동으로 설치하는 **간접 의존성**입니다.','',
    '## 2-1. 기능별 선택 설치','',
    '아래 기능을 쓸 때만 추가로 설치합니다(기본 `requirements.txt` 에는 미포함).','',
    '| 기능 | 설치 방법 | 비고 |',
    '|------|------|------|',
    '| SNMP OID · Trap | `pip install pysnmp` | SNMP 메뉴 사용 시 필요. 없으면 SNMP 기능만 비활성 |',
    '| IXIA N2X 트래픽 | Tcl(`tclsh`) 설치 후 PATH 등록 | N2X 연동 시. 예: `C:\\Program Files\\Agilent\\N2X\\bin\\tclsh.exe` |','',
    '## 3. 실행','',
    '```',
    'cd backend',
    'python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload',
    '```','',
    '또는 프로젝트 루트의 **`start.bat`** 을 실행합니다. 접속 주소: `http://localhost:8000`','',
    '> ⚠ `start.bat` 은 `py -3.11` 로 고정돼 있는데 현재 환경은 **Python 3.13** 입니다. start.bat 안의 `-3.11` 을 `-3.13` 으로 바꾸거나, 위의 수동 실행 명령을 사용하세요.'
  ].join('\n')}
];

function _helpEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

async function helpInit(){
  if(!_helpLoaded) await helpLoad();
  renderHelp();
}
async function helpLoad(){
  try{
    const r=await fetch('/api/help'); const d=await r.json();
    if(d && Array.isArray(d.sections) && d.sections.length) helpSections=d.sections;
    else helpSections=JSON.parse(JSON.stringify(HELP_DEFAULT));
  }catch(e){ helpSections=JSON.parse(JSON.stringify(HELP_DEFAULT)); }
  // 'install'(설치 방법) 섹션 보장 — 저장본에 없으면 기본에서 끌어와 추가
  if(Array.isArray(helpSections) && !helpSections.some(s=>s.key==='install')){ const _i=HELP_DEFAULT.find(s=>s.key==='install'); if(_i) helpSections.push(JSON.parse(JSON.stringify(_i))); }
  if(!helpSections.some(s=>s.key===helpCur)) helpCur=(helpSections[0]||{}).key||'intro';
  _helpLoaded=true;
}
async function helpSave(){
  try{ await fetch('/api/help',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sections:helpSections})}); }catch(e){}
}
function renderHelp(){
  if(!helpSections) helpSections=JSON.parse(JSON.stringify(HELP_DEFAULT));
  const menu=document.getElementById('help-menu');
  const pane=document.getElementById('help-content-pane');
  if(!menu||!pane) return;
  let mh='<div style="display:flex;justify-content:flex-end;margin-bottom:6px;"><button onclick="helpMenuEditStart()" style="font-size:10.5px;font-weight:700;padding:4px 9px;border-radius:6px;border:1px solid var(--border);background:var(--bg2);color:var(--text2);cursor:pointer;"><i class="ti ti-list-details"></i> 메뉴 편집</button></div>';
  helpSections.forEach(s=>{
    const on=s.key===helpCur;
    mh+='<div onclick="helpSel(\''+s.key+'\')" style="display:flex;align-items:center;gap:9px;padding:9px 13px;border-radius:9px;cursor:pointer;margin-bottom:3px;font-size:13px;font-weight:'+(on?'800':'600')+';background:'+(on?'#2d6fd4':'transparent')+';color:'+(on?'#fff':'var(--text2)')+';"><i class="ti '+_helpEsc(s.icon||'ti-file')+'" style="font-size:16px;"></i>'+_helpEsc(s.label)+'</div>';
  });
  menu.innerHTML=mh;
  const sec=helpSections.find(s=>s.key===helpCur)||helpSections[0];
  if(sec && helpEditing===sec.key){
    // 인라인 편집 모드 (페이지에서 바로)
    const hasTui=!!(window.toastui&&toastui.Editor); const edH='calc(100vh - 220px)';
    pane.innerHTML='<div style="padding:14px 22px;">'
      +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;"><i class="ti ti-edit" style="color:var(--blue);font-size:16px;"></i><span style="font-size:14px;font-weight:700;color:var(--text);">'+_helpEsc(sec.label)+' 편집</span><span style="font-size:11px;color:var(--text3);">'+(hasTui?'· WYSIWYG, 저장은 마크다운, 이미지 붙여넣기 가능':'· 마크다운')+'</span><span style="flex:1;"></span>'
        +'<span id="help-save-status" style="font-size:11px;color:var(--text3);margin-right:6px;white-space:nowrap;"></span>'
        +'<button onclick="helpDoneInline()" style="font-size:12px;padding:6px 16px;border-radius:7px;border:none;background:#2d6fd4;color:#fff;cursor:pointer;font-weight:700;"><i class="ti ti-check"></i> 완료</button>'
      +'</div>'
      +'<div style="background:#fff;border:1px solid var(--border);border-radius:8px;overflow:hidden;"><div id="help-edit-ed"></div></div>'
    +'</div>';
    const box=pane.querySelector('#help-edit-ed'); _helpEd=null;
    if(hasTui){ try{ _helpEd=new toastui.Editor({el:box, initialValue:sec.md||'', initialEditType:'wysiwyg', previewStyle:'tab', height:edH, usageStatistics:false, plugins:(typeof _tuiPlugins==='function'?_tuiPlugins():[]), hooks:{addImageBlobHook:function(blob,cb){var r=new FileReader();r.onload=function(){cb(r.result,'image');};r.readAsDataURL(blob);}}}); }catch(e){ _helpEd=null; } }
    if(!_helpEd){ box.innerHTML='<textarea id="help-edit-ta" spellcheck="false" style="width:100%;height:'+edH+';border:none;outline:none;resize:vertical;padding:14px;font-family:monospace;font-size:13px;line-height:1.7;background:var(--bg);color:var(--text);box-sizing:border-box;"></textarea>'; box.querySelector('#help-edit-ta').value=sec.md||''; }
    if(_helpEd){ try{ _helpEd.on('change',_helpAutoSave); }catch(e){} } else { var _ta=document.getElementById('help-edit-ta'); if(_ta) _ta.oninput=_helpAutoSave; }
    return;
  }
  const body=(sec&&typeof formatMsg==='function')?formatMsg(sec.md||''):_helpEsc(sec?sec.md:'');
  pane.innerHTML='<div style="padding:18px 26px;font-size:13.5px;line-height:1.75;"><div style="display:flex;justify-content:flex-end;margin-bottom:8px;"><button onclick="helpEdit(\''+(sec?sec.key:'')+'\')" style="font-size:12px;font-weight:700;padding:6px 13px;border-radius:7px;border:1.5px solid #2d6fd4;background:var(--bg2);color:#2d6fd4;cursor:pointer;"><i class="ti ti-edit"></i> 편집</button></div><div class="help-content">'+body+'</div></div>';
}
function helpSel(key){ try{ if(_helpEd) _helpEd.destroy(); }catch(e){} _helpEd=null; helpEditing=null; helpCur=key; renderHelp(); }

// 내용 인라인 편집 (페이지에서 바로) — renderHelp 가 편집 분기를 그림
function helpEdit(key){ helpEditing=key; helpCur=key; renderHelp(); }// 자동 저장(REQ/TC와 동일) — 입력 멈추면 0.7초 뒤 저장 + 상태 표시
var _helpSaveT=null;
function _helpAutoSave(){
  clearTimeout(_helpSaveT);
  var st=document.getElementById('help-save-status'); if(st)st.textContent='저장 중…';
  _helpSaveT=setTimeout(async function(){
    var sec=(helpSections||[]).find(s=>s.key===helpEditing); if(!sec) return;
    var md=sec.md||'';
    if(_helpEd){ try{ md=_helpEd.getMarkdown(); }catch(e){} } else { var ta=document.getElementById('help-edit-ta'); if(ta) md=ta.value; }
    sec.md=md;
    try{ await helpSave(); }catch(e){}
    var st2=document.getElementById('help-save-status'); if(st2)st2.textContent='✓ 저장됨';
  },700);
}
async function helpDoneInline(){
  var sec=(helpSections||[]).find(s=>s.key===helpEditing);
  if(sec){ var md=sec.md||''; if(_helpEd){ try{ md=_helpEd.getMarkdown(); }catch(e){} } else { var ta=document.getElementById('help-edit-ta'); if(ta) md=ta.value; } sec.md=md; clearTimeout(_helpSaveT); try{ await helpSave(); }catch(e){} }
  try{ if(_helpEd) _helpEd.destroy(); }catch(e){} _helpEd=null; helpEditing=null; renderHelp();
}

// 메뉴(항목) 편집 — 이름/아이콘/순서/추가/삭제
function helpMenuEditStart(){
  const ov=document.createElement('div'); ov.id='help-menu-modal';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:12000;display:flex;align-items:center;justify-content:center;';
  ov.innerHTML='<div style="background:var(--bg2);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,0.4);width:580px;max-width:94vw;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;">'
    +'<div style="padding:14px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;flex-shrink:0;"><i class="ti ti-list-details" style="color:var(--blue);font-size:18px;"></i><span style="font-size:15px;font-weight:700;color:var(--text);">도움말 메뉴 편집</span><span style="flex:1;"></span><span style="font-size:11px;color:var(--text3);">아이콘은 Tabler 이름 (예: ti-rocket)</span></div>'
    +'<div id="help-menu-rows" style="flex:1;overflow:auto;padding:14px 18px;"></div>'
    +'<div style="padding:10px 18px;border-top:1px solid var(--border);display:flex;gap:8px;flex-shrink:0;"><button id="help-menu-add" style="font-size:12px;padding:7px 13px;border-radius:7px;border:1px dashed var(--border);background:var(--bg2);color:var(--text2);cursor:pointer;font-weight:600;"><i class="ti ti-plus"></i> 항목 추가</button><span style="flex:1;"></span><button id="help-menu-cancel" style="font-size:13px;padding:8px 16px;border-radius:7px;border:1px solid var(--border);background:var(--bg2);color:var(--text2);cursor:pointer;font-weight:600;">취소</button><button id="help-menu-save" style="font-size:13px;padding:8px 22px;border-radius:7px;border:none;background:#2d6fd4;color:#fff;cursor:pointer;font-weight:700;">저장</button></div>'
  +'</div>';
  document.body.appendChild(ov);
  let work=JSON.parse(JSON.stringify(helpSections||HELP_DEFAULT));
  const rowsEl=ov.querySelector('#help-menu-rows');
  const draw=()=>{
    rowsEl.innerHTML=work.map((s,i)=>'<div style="display:flex;align-items:center;gap:6px;margin-bottom:7px;">'
      +'<i class="ti '+_helpEsc(s.icon||'ti-file')+'" style="font-size:16px;color:var(--text3);width:18px;text-align:center;flex-shrink:0;"></i>'
      +'<input value="'+_helpEsc(s.icon||'')+'" data-i="'+i+'" data-f="icon" placeholder="ti-..." style="width:92px;flex-shrink:0;font-size:11px;padding:6px 7px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-family:monospace;">'
      +'<input value="'+_helpEsc(s.label||'')+'" data-i="'+i+'" data-f="label" placeholder="메뉴 이름" style="flex:1;min-width:0;font-size:13px;padding:6px 9px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);">'
      +'<button data-i="'+i+'" data-act="up" '+(i===0?'disabled':'')+' style="padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg2);color:var(--text2);cursor:pointer;">↑</button>'
      +'<button data-i="'+i+'" data-act="down" '+(i===work.length-1?'disabled':'')+' style="padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg2);color:var(--text2);cursor:pointer;">↓</button>'
      +'<button data-i="'+i+'" data-act="del" title="삭제" style="padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg2);color:var(--red);cursor:pointer;"><i class="ti ti-trash"></i></button>'
    +'</div>').join('')||'<div style="color:var(--text3);font-size:13px;text-align:center;padding:20px;">항목이 없습니다. 아래 “항목 추가”로 만드세요.</div>';
    rowsEl.querySelectorAll('input').forEach(inp=>{ inp.oninput=()=>{ const i=+inp.dataset.i, f=inp.dataset.f; work[i][f]=inp.value; if(f==='icon'){ const ic=inp.previousElementSibling; if(ic) ic.className='ti '+(inp.value||'ti-file'); } }; });
    rowsEl.querySelectorAll('button[data-act]').forEach(b=>{ b.onclick=()=>{ const i=+b.dataset.i, a=b.dataset.act;
      if(a==='del'){ work.splice(i,1); }
      else if(a==='up'&&i>0){ const t=work[i-1]; work[i-1]=work[i]; work[i]=t; }
      else if(a==='down'&&i<work.length-1){ const t=work[i+1]; work[i+1]=work[i]; work[i]=t; }
      draw(); }; });
  };
  draw();
  const close=()=>{ try{ov.remove();}catch(e){} };
  ov.onclick=e=>{ if(e.target===ov) close(); };
  ov.querySelector('#help-menu-cancel').onclick=close;
  ov.querySelector('#help-menu-add').onclick=()=>{ work.push({key:'sec'+Date.now()+Math.floor(Math.random()*1000),label:'새 항목',icon:'ti-file',md:'# 새 항목\n\n내용을 입력하세요.'}); draw(); };
  ov.querySelector('#help-menu-save').onclick=async()=>{
    work=work.filter(s=>s&&s.key&&(s.label||'').trim());
    helpSections=work;
    if(!helpSections.some(s=>s.key===helpCur)) helpCur=(helpSections[0]||{}).key||'intro';
    await helpSave(); close(); renderHelp();
    if(typeof showToast==='function') showToast('메뉴 저장됨');
  };
}
