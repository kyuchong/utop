# ubiQuoss-TOP 기능 목록 및 개발 요구사항 명세

> **문서 기준**: 2026-07-21, `backend/main.py`(7,900+줄) · `frontend/`(45,000+줄) 소스 분석 기반
> **플랫폼**: AI 연동 시험 자동화 플랫폼 (Ubiquoss Test Orchestration Platform)

---

## 1. 시스템 개요

| 항목 | 내용 |
|------|------|
| 형태 | 온프레미스 설치형 웹 플랫폼 (사내 서버, 브라우저 접속) |
| 백엔드 | Python FastAPI 단일 서버 (`backend/main.py`) + WebSocket 실시간 브로드캐스트 |
| 프론트엔드 | 단일 페이지 웹 UI (`frontend/index.html` + 모듈 JS) |
| 데이터 | 파일 기반 JSON 저장소 (`data/`), 저장 시 자동 백업 |
| 실행 | `start.bat` → uvicorn, 포트 8000 |
| 장비 연동 | SSH/Telnet CLI(netmiko/paramiko), SNMP(pysnmp + MIB enum 해석) |
| 계측기 연동 | IXIA N2X(Tcl API), Spirent TestCenter(세션/예약) |
| AI | 로컬 LLM(gemma) · Claude · Dify, RAG 임베딩 색인, 지식 소스 4종 스위치 |
| 외부 연동 | Jira REST, Confluence, SMTP 메일 |
| 규모(현재) | 기능 화면 34개, REQ 28건 · TC 87건 · Cycle 23건 운용, SNMP enum 688 OID |

---

## 2. 메뉴 구조 (Top Navigation)

```
Dashboard
Tests
 ├─ Requirements & Test Coverage (+ BETA)
 ├─ Global Parameters
 ├─ SNMP OID Management
 ├─ IXIA N2X 트래픽 시험
 └─ STC 트래픽 시험
Cycle
 ├─ Test Execution
 └─ Milestone
Reports
 └─ Test Report
Jira Integration
 ├─ Jira Issue Coverage / Jira Issue Report
 ├─ Issue Sync
 └─ Jira 연동 설정 / Jira 프로젝트 패널 설정
Resources
 ├─ Rack 배치 (Lab Rack View)
 └─ Device Management (카탈로그/모델/벤더)
AI Assistant
 ├─ 지식 검색
 ├─ 시험절차 학습/조회
 ├─ RAG Data
 ├─ LLM 설정 / Jira Search 설정 / 지식 소스 설정
 └─ AI 피드백·통계
System
 ├─ 커스텀 필드
 ├─ 테마 설정 / 메일(SMTP) 설정*
 ├─ 사용자 관리* / 권한 관리* / 조직 설정*
 ├─ 데이터 내보내기 / 가져오기
 ├─ 버전 현황 / 시스템 설정
 └─ 사용 도움말
요청사항 (게시판) · TO-DO*
```
`*` = 관리자 전용 (`data-admin-only`)

---

## 3. 기능 상세 (영역별)

### 3.1 인증 · 사용자 · 조직
- 로그인/로그아웃/세션 토큰, 회원가입 + 관리자 승인(승인 메일 발송)
- 내 정보: 아바타 업로드, 비밀번호 변경
- 사용자 CRUD(관리자), 역할(권한) 관리, 조직 옵션 관리
- 화면·기능 단위 권한 게이트(`applyRoleGates`, `data-admin-only`)
- 주요 API: `/api/login` `/api/signup` `/api/users` `/api/permissions` `/api/org-options`

### 3.2 요구사항(REQ) 관리
- 계층 폴더 트리 + REQ 문서 CRUD, 커스텀 필드, PDF 사양서 출력
- 휴지통(삭제 복원) 지원
- 주요 API: `/api/req` `/api/folders` `/api/custom-fields` `/api/trash`

### 3.3 테스트케이스(TC) 관리
- iTest식 컴팩트 스텝 그리드 편집 (상태마크: 오류/설정/BP/Skip)
- 스텝별 대상 장비 지정 + 자동 세션(open/close 스텝 불필요)
- `IF ${model}` 실시간 모델 분기 — TC 1건으로 다기종 대응
- 변수/전역 파라미터(`/api/global-params`), TC 스냅샷(버전) 저장·복원
- TC별 실행 이력(수행자·시각·결과) 자동 축적, 전 접속자 알림
- 주요 API: `/api/tc` `/api/tc/{id}/snapshots` `/api/tc/{id}/run-history`

### 3.4 커버리지(Coverage)
- REQ × TC 매핑 매트릭스, 갭(미연결 REQ) 식별
- REQ/TC 클릭 시 주소창 딥링크(`#req=`/`#tc=`) 실시간 갱신 — URL 공유

### 3.5 시험 실행(Cycle) · 마일스톤 · 리포트
- 사이클 단위 TC 묶음 실행 관리, 사이클 폴더, 마일스톤 연동
- 클라이언트 주도 자동 연속 실행 + 진행 상태 전 접속자 실시간 중계
- 원격 중지 요청(요청자 표시), 30분 무갱신 시 중단 간주
- Cycle 완료 시 AI 요약(`summarize`), Jira 자동 이슈 초안(`auto-jira`)
- Test Report / Release Summary 화면
- 주요 API: `/api/cycle` `/api/cycle-run-progress` `/api/cycle-run-stop` `/api/release-summary`

### 3.6 장비 제어 · 모니터링
- 장비 등록/카탈로그(제품군·모델·벤더, 백업 이력), 연결 확인
- CLI 실행: 일반/스트리밍, 자동완성(`cli-complete`), 세션 열기/닫기, ping
- 장비별 커넥션 캐시 + 락(같은 장비 순차, 다른 장비 병렬), 프롬프트 인식·자동 enable
- SNMP GET/SET/Trap 대기, MIB 추출 enum(688 OID) 이름 표시
- Rack 배치 뷰(실물 랙 기반), 인력/프로젝트 리소스 관리
- 주요 API: `/api/run-cli(-stream)` `/api/session-open/close` `/api/snmp-*` `/api/devices` `/api/device-catalog` `/api/racks` `/api/resource/*`

### 3.7 트래픽 계측기 연동
- **IXIA N2X**: Tcl 데몬 관리, 포트 그리드/probe, 예약·해제, 트래픽 시작/통계/중지/초기화
- **Spirent TestCenter**: 서버 기동/상태, 연결 확인, 예약 레지스트리(직렬화로 충돌 방지), 세션 제어, 미터
- 주요 API: `/api/n2x/*` `/api/stc/*`

### 3.8 AI 기능
- **AI FAB/채팅**: 화면 맥락 인지 질의, 채팅 세션 저장, 스트리밍 응답
- **LLM 관리**: 다중 LLM 등록/순서/가져오기(로컬 gemma·Claude·Dify 어시스턴트)
- **RAG**: 매뉴얼/문서 색인(임베딩 `rag_embed.npy`), 검색, 청크 조회, 설정/테스트
- **지식 소스 4종 스위치**: 일반 / UTOP 내부 / Jira / Confluence On·Off + 우선순위
- **통합 검색**: `search-all`(REQ·TC·Jira·문서 횡단), 자연어 명령 실행(`nl-exec`, 명령 차단 필터 포함)
- **시험절차 학습**: 성공 절차 학습/조회/삭제 → 유사 시험 재활용
- **후처리 자동화**: Cycle 요약, Jira 이슈 초안, 결함 자동 분류(`defect/classify`)
- **AI 운영**: 페이지별 AI 설정(`page-ai`), 사용량 집계, 피드백 수집/통계, 프롬프트 관리
- 주요 API: `/api/llm/*` `/api/chat*` `/api/rag/*` `/api/knowledge-sources` `/api/ai/*` `/api/learn/*` `/api/dify/*`

### 3.9 Jira · Confluence 연동
- Jira 설정/연결 테스트, 프로젝트·컴포넌트·이슈타입·필드·버전 메타 조회
- 이슈 생성/조회/댓글/첨부(실행 로그·이미지), 사용자 검색
- Jira Issue Coverage/Report, 프로젝트 패널, Issue Sync(프로젝트 단위 동기화)
- Jira 지식 질의(`jira/ask`, 스트리밍), 결함 분류 스키마/규칙
- Confluence 설정/테스트/검색/동기화/본문 fetch → RAG 지식 소스로 활용
- 주요 API: `/api/jira/*` `/api/issues/*` `/api/confluence/*`

### 3.10 협업 · 커뮤니케이션
- 동시 접속자 표시(제어권 없음, 전원 편집 가능), WebSocket 실시간 동기화
- 요청사항 게시판(첨부/댓글), TO-DO(관리자)
- @멘션 + 알림함, 메일(SMTP) 설정/테스트/공유 메일 발송, Cycle 완료 알림
- 주요 API: `/api/board*` `/api/todo` `/api/mention` `/api/notifications` `/api/mail/*` `/ws`

### 3.11 시스템 관리
- 커스텀 필드, 테마/브랜딩(로고 업로드), UI 옵션
- 데이터 내보내기/가져오기(전체 백업·이관), 저장 시 자동 백업(`data/backups/`)
- 버전 현황(릴리스 노트), 시스템 설정, 사용 도움말(내장 편집 가능 `/api/help`)

---

## 4. 개발 요구사항 명세

ID 체계: `UTOP-REQ-<영역>-<번호>` · 상태: ✅ 구현 / 🔶 부분 구현 / ⬜ 계획

### 4.1 기능 요구사항

#### 인증/권한 (AUTH)
| ID | 요구사항 | 상태 |
|----|----------|------|
| UTOP-REQ-AUTH-001 | 사용자는 ID/비밀번호로 로그인하고 세션 토큰으로 인증한다 | ✅ |
| UTOP-REQ-AUTH-002 | 회원가입은 관리자 승인 후 활성화되며 승인 시 메일이 발송된다 | ✅ |
| UTOP-REQ-AUTH-003 | 역할 기반으로 화면·기능 노출을 제어한다 (관리자 전용 메뉴) | ✅ |

#### 시험 자산 (TEST)
| ID | 요구사항 | 상태 |
|----|----------|------|
| UTOP-REQ-TEST-001 | 요구사항을 계층 폴더 트리로 관리하고 커스텀 필드를 지원한다 | ✅ |
| UTOP-REQ-TEST-002 | TC는 스텝 그리드로 편집하며 스텝별 대상 장비를 지정한다 | ✅ |
| UTOP-REQ-TEST-003 | TC 실행 시 장비 세션은 자동 관리한다 (open/close 스텝 불필요) | ✅ |
| UTOP-REQ-TEST-004 | `IF ${model}` 분기로 TC 1건이 여러 장비 모델을 커버한다 | ✅ |
| UTOP-REQ-TEST-005 | TC 스냅샷을 저장하고 복원할 수 있다 | ✅ |
| UTOP-REQ-TEST-006 | REQ×TC 커버리지 매트릭스와 갭을 제공하고 딥링크를 지원한다 | ✅ |
| UTOP-REQ-TEST-007 | 삭제된 자산은 휴지통에서 복원 가능하다 | ✅ |

#### 실행 (EXEC)
| ID | 요구사항 | 상태 |
|----|----------|------|
| UTOP-REQ-EXEC-001 | 사이클 단위로 TC를 묶어 자동 연속 실행한다 | ✅ |
| UTOP-REQ-EXEC-002 | 실행 진행 상태를 전 접속자에게 실시간 중계한다 | ✅ |
| UTOP-REQ-EXEC-003 | 다른 사용자가 실행을 원격 중지 요청할 수 있다 | ✅ |
| UTOP-REQ-EXEC-004 | TC별 실행 이력(수행자·시각·결과)을 자동 축적한다 | ✅ |
| UTOP-REQ-EXEC-005 | 동시 실행 시 실행별 독립 진행 상태를 유지한다 (runId 분리) | ⬜ 설계 확정 |
| UTOP-REQ-EXEC-006 | 실행 결과 저장은 항목 단위 병합으로 동시 저장 유실을 방지한다 | ⬜ 설계 확정 |
| UTOP-REQ-EXEC-007 | 장비·계측기 리소스 락으로 실행 충돌을 방지한다 | ⬜ 설계 확정 |
| UTOP-REQ-EXEC-008 | 서버 주도 실행으로 예약·무인 시험을 지원한다 | ⬜ 로드맵 |

#### 장비/계측기 (DEV)
| ID | 요구사항 | 상태 |
|----|----------|------|
| UTOP-REQ-DEV-001 | SSH/Telnet CLI를 자동 실행하며 프롬프트 인식·자동 enable 한다 | ✅ |
| UTOP-REQ-DEV-002 | 같은 장비 명령은 직렬화, 다른 장비는 병렬 실행한다 (세션 캐시) | ✅ |
| UTOP-REQ-DEV-003 | SNMP GET/SET/Trap을 지원하고 OID를 MIB 이름으로 해석한다 (688 OID) | ✅ |
| UTOP-REQ-DEV-004 | N2X를 Tcl API로 제어한다 (포트 그리드·예약·트래픽) | 🔶 트래픽 검증 예정 |
| UTOP-REQ-DEV-005 | STC 포트 예약을 레지스트리로 추적하고 직렬화로 충돌을 방지한다 | ✅ |
| UTOP-REQ-DEV-006 | 실물 랙 배치 기반으로 장비 현황을 시각화한다 | ✅ |

#### AI (AI)
| ID | 요구사항 | 상태 |
|----|----------|------|
| UTOP-REQ-AI-001 | 로컬 LLM(gemma)으로 폐쇄망에서 AI 기능을 제공한다 | ✅ |
| UTOP-REQ-AI-002 | 다중 LLM을 등록·전환할 수 있다 (로컬/Claude/Dify) | ✅ |
| UTOP-REQ-AI-003 | 사내 문서를 RAG 색인해 근거 기반으로 응답한다 | ✅ |
| UTOP-REQ-AI-004 | 지식 소스 4종을 On/Off·우선순위로 제어한다 | ✅ |
| UTOP-REQ-AI-005 | Cycle 완료 시 결과를 자동 요약한다 | ✅ |
| UTOP-REQ-AI-006 | FAIL 결과에서 Jira 이슈 초안을 생성한다 (기본 OFF 스위치) | ✅ |
| UTOP-REQ-AI-007 | 결함을 자동 분류하고 규칙을 관리한다 | ✅ |
| UTOP-REQ-AI-008 | 성공 절차를 학습해 유사 시험에 재활용한다 | ✅ |
| UTOP-REQ-AI-009 | 자연어 명령을 안전 필터(명령 차단) 하에 실행한다 | ✅ |
| UTOP-REQ-AI-010 | AI 사용량·피드백을 수집하고 통계를 제공한다 | ✅ |

#### 연동 (INT)
| ID | 요구사항 | 상태 |
|----|----------|------|
| UTOP-REQ-INT-001 | Jira 이슈 생성·조회·댓글·첨부를 플랫폼 내에서 수행한다 | ✅ |
| UTOP-REQ-INT-002 | Jira 프로젝트 단위 이슈 현황·커버리지·리포트를 제공한다 | ✅ |
| UTOP-REQ-INT-003 | Issue Sync — 프로젝트 수동/증분 동기화로 서버에 저장한다 | 🔶 현재 라이브 fetch, 저장·증분은 설계 |
| UTOP-REQ-INT-004 | Confluence 문서를 검색·동기화해 AI 지식으로 활용한다 | ✅ |
| UTOP-REQ-INT-005 | SMTP 메일로 승인·공유·Cycle 알림을 발송한다 | ✅ |

#### 협업/시스템 (SYS)
| ID | 요구사항 | 상태 |
|----|----------|------|
| UTOP-REQ-SYS-001 | 동시 접속자를 표시하되 편집 락은 두지 않는다 (전원 편집 가능) | ✅ |
| UTOP-REQ-SYS-002 | 변경 사항을 WebSocket으로 전 접속자에게 실시간 반영한다 | ✅ |
| UTOP-REQ-SYS-003 | @멘션·알림함·게시판·TO-DO를 내장한다 | ✅ |
| UTOP-REQ-SYS-004 | 전체 데이터 내보내기/가져오기와 저장 시 자동 백업을 제공한다 | ✅ |
| UTOP-REQ-SYS-005 | 테마·브랜딩(로고)·커스텀 필드·UI 옵션을 관리자가 설정한다 | ✅ |
| UTOP-REQ-SYS-006 | 버전 현황·도움말을 내장 화면으로 제공한다 | ✅ |

### 4.2 비기능 요구사항

| ID | 요구사항 | 상태 |
|----|----------|------|
| UTOP-REQ-NFR-001 | 온프레미스 운용 — 시험 데이터가 외부로 전송되지 않는다 | ✅ |
| UTOP-REQ-NFR-002 | AI는 폐쇄망(로컬 LLM)에서도 전 기능 동작한다 | ✅ |
| UTOP-REQ-NFR-003 | 장비 세션 캐시로 반복 명령 지연을 최소화한다 | ✅ |
| UTOP-REQ-NFR-004 | 파일 저장소는 저장 시점 자동 백업으로 유실을 방지한다 | ✅ |
| UTOP-REQ-NFR-005 | 자연어 실행 등 AI 발 명령은 차단 목록으로 안전을 보장한다 | ✅ |
| UTOP-REQ-NFR-006 | 동시 실행·동시 저장 경합에 대한 데이터 무결성 보장 | ⬜ EXEC-005~007과 연계 |

---

## 5. 현재 한계 및 로드맵

| 단계 | 항목 | 내용 |
|------|------|------|
| 1 | 실행 리소스 락 | 장비·계측기 점유 레지스트리 + `run-cli` 소유자 검사, 하트비트 자동 해제 |
| 1 | 실행 독립화 | runId 도입(진행 상태 딕셔너리), 결과 항목 단위 병합 저장 |
| 2 | 서버 실행 전환 | 실행 엔진 백엔드 이식 → 예약·야간 무인 시험, 강제 락 |
| 3 | Issue Sync 고도화 | Jira 증분 동기화 + 분류 필드 + LLM 이슈 분석 |
| 4 | 트래픽 검증 자동화 | N2X 다중 스트림 위저드, 트래픽 결과 자동 판정 |

**알려진 한계(소스 확인 기준)**
- Cycle 실행이 클라이언트(브라우저) 주도 — 브라우저 종료 시 실행 중단
- 실행 진행 상태가 전역 1개 — 동시 실행 시 배너 혼선
- Cycle/TC 저장이 파일 통째 덮어쓰기 — 동시 저장 시 last-writer-wins
- 장비·계측기 실행 락 미구현 — 같은 장비 동시 실행 시 명령 인터리브
