<!-- 이 파일은 tools/gen_api_docs.py 가 생성합니다. 직접 수정하지 마세요. -->
<!-- 갱신: python tools/gen_api_docs.py -->

# API Reference

총 라우트 수: **269** (그룹 81개)

`auth` 컬럼은 endpoint 시그니처에서 감지한 인증/권한 의존성 이름 (best-effort).

## `/` (1개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/` |  |  |

## `/api/ai` (9개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/ai/feedback` |  |  |
| POST | `/api/ai/feedback` |  | token param |
| DELETE | `/api/ai/feedback/{fid}` |  | token param |
| POST | `/api/ai/nl-exec` | 자연어 지시 → CLI 생성(Gemma) → (execute=true면) 실행 → 출력 해석·판정. |  |
| POST | `/api/ai/search-all` |  |  |
| GET | `/api/ai/settings` |  |  |
| POST | `/api/ai/settings` |  | token param |
| GET | `/api/ai/stats` |  |  |
| POST | `/api/ai/usage` |  | token param |

## `/api/baselines` (6개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/baselines` |  |  |
| GET | `/api/baselines/{device_id}` |  |  |
| DELETE | `/api/baselines/{device_id}/{key}` |  |  |
| GET | `/api/baselines/{device_id}/{key}` |  |  |
| POST | `/api/baselines/{device_id}/{key}` |  |  |
| POST | `/api/baselines/{device_id}/{key}/capture` |  |  |

## `/api/board` (8개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/board` |  |  |
| POST | `/api/board` |  |  |
| GET | `/api/board/file/{fname}` |  |  |
| DELETE | `/api/board/{pid}` |  |  |
| POST | `/api/board/{pid}` |  |  |
| POST | `/api/board/{pid}/reply` |  |  |
| DELETE | `/api/board/{pid}/reply/{rid}` |  |  |
| POST | `/api/board/{pid}/reply/{rid}` |  |  |

## `/api/board-upload` (1개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/board-upload` |  |  |

## `/api/branding` (3개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/branding` |  |  |
| POST | `/api/branding` |  | token param |
| POST | `/api/branding/logo` |  | token param |

## `/api/broadcast-reload` (1개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/broadcast-reload` |  |  |

## `/api/chat` (5개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/chat` |  |  |
| POST | `/api/chat/local` |  |  |
| GET | `/api/chat/local/models` |  |  |
| POST | `/api/chat/local/stream` |  |  |
| POST | `/api/chat/stream` |  |  |

## `/api/chat-sessions` (3개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/chat-sessions` |  | token param |
| POST | `/api/chat-sessions` |  | token param |
| POST | `/api/chat-sessions/delete` |  | token param |

## `/api/cli-complete` (1개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/cli-complete` | 터미널 Tab 자동완성: 영속 세션에 '부분명령+Tab'을 보내 장비가 완성한 명령을 읽어 반환. |  |

## `/api/codes` (3개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/codes` | 드롭다운에 들어가는 값 목록. 화면은 여기서만 읽는다. |  |
| POST | `/api/codes` |  |  |
| DELETE | `/api/codes/{kind}/{value}` |  |  |

## `/api/confluence` (7개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/confluence/config` |  |  |
| POST | `/api/confluence/config` |  | token param |
| POST | `/api/confluence/fetch` | REQ의 Confluence URL을 읽어 본문 텍스트를 반환 (TC 자동 생성용). |  |
| GET | `/api/confluence/models` | 11.Feature List 하위 스펙 페이지에서 실제 모델명 추출 (HITL 모델 칩용, 캐시). |  |
| POST | `/api/confluence/search` | 라이브 Confluence 검색만 (FAB 단계별 표시용). live_query 꺼져있으면 빈 결과. |  |
| POST | `/api/confluence/sync` |  | token param |
| POST | `/api/confluence/test` |  | token param |

## `/api/convert` (1개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/convert/markdown` |  |  |

## `/api/custom-fields` (5개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/custom-fields` |  |  |
| GET | `/api/custom-fields` |  |  |
| POST | `/api/custom-fields` |  |  |
| POST | `/api/custom-fields` |  |  |
| DELETE | `/api/custom-fields/{cf_id}` |  |  |

## `/api/cycle` (8개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/cycle` | meta=1 : 목록·판정 집계에 필요한 필드만 반환 (각 item.steps 에서 output/verdictMsg 등 큰 필드 제거) |  |
| DELETE | `/api/cycle/{cycle_id}` |  |  |
| GET | `/api/cycle/{cycle_id}` |  |  |
| POST | `/api/cycle/{cycle_id}` |  |  |
| POST | `/api/cycle/{cycle_id}/auto-jira` | Fail 항목 → Gemma로 이슈 제목/설명 생성 → Jira 일괄 등록. {project, issuetype, tcids?, dry_r... |  |
| GET | `/api/cycle/{cycle_id}/ppt` |  |  |
| POST | `/api/cycle/{cycle_id}/run` |  |  |
| POST | `/api/cycle/{cycle_id}/summarize` |  |  |

## `/api/cycle-folders` (2개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/cycle-folders` |  |  |
| POST | `/api/cycle-folders` |  |  |

## `/api/cycle-run-progress` (2개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/cycle-run-progress` | 진행 중인 실행 상태 조회 — 새로고침한 접속자가 배너·오버레이를 복원할 때 사용. |  |
| POST | `/api/cycle-run-progress` | 클라이언트 주도 Cycle 자동 실행 진행 상태를 전 접속자에게 중계 (WebSocket broadcast). |  |

## `/api/cycle-run-stop` (1개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/cycle-run-stop` | 다른 사용자가 실행 중인 Cycle 자동 실행을 원격으로 중지 요청. | token param |

## `/api/device-catalog` (4개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/device-catalog` |  |  |
| POST | `/api/device-catalog` |  |  |
| GET | `/api/device-catalog/backups` | 자동 백업 목록 (최근 순). |  |
| GET | `/api/device-catalog/backups/{name}` |  |  |

## `/api/device-catalog2` (3개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/device-catalog2` |  |  |
| POST | `/api/device-catalog2` |  |  |
| DELETE | `/api/device-catalog2/{kind}/{name}` |  |  |

## `/api/device-roles` (1개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/device-roles` |  |  |

## `/api/devices` (6개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/devices` |  |  |
| POST | `/api/devices` |  |  |
| DELETE | `/api/devices/{device_id}` |  |  |
| PUT | `/api/devices/{device_id}` |  |  |
| POST | `/api/devices/{device_id}/command` |  |  |
| POST | `/api/devices/{device_id}/connect` |  |  |

## `/api/devices2` (8개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/devices2` |  |  |
| POST | `/api/devices2` |  |  |
| GET | `/api/devices2/export.csv` | 장비 목록을 CSV 로. 비밀번호는 기본적으로 비운다. |  |
| POST | `/api/devices2/import-csv` | CSV 로 일괄 등록·수정. IP 가 키라 같은 IP 는 덮어쓴다. |  |
| POST | `/api/devices2/import-legacy` | 옛 devices.json 을 PG 로 옮긴다. 여러 번 눌러도 안전하다(IP 기준 upsert). |  |
| DELETE | `/api/devices2/{dev_id}` |  |  |
| GET | `/api/devices2/{dev_id}` |  |  |
| POST | `/api/devices2/{dev_id}/check` | 접속해 보고 결과를 남긴다. |  |

## `/api/dify` (7개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/dify/assistants` |  |  |
| POST | `/api/dify/assistants` |  |  |
| DELETE | `/api/dify/assistants/{aid}` |  |  |
| GET | `/api/dify/assistants/{aid}` |  |  |
| PUT | `/api/dify/assistants/{aid}` |  |  |
| POST | `/api/dify/chat` |  |  |
| POST | `/api/dify/upload` |  |  |

## `/api/folders` (2개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/folders` |  |  |
| POST | `/api/folders` |  |  |

## `/api/global-params` (2개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/global-params` |  |  |
| POST | `/api/global-params` |  |  |

## `/api/health` (1개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/health` | 도커 헬스체크가 부르는 곳. 로그인 없이 열려 있다. |  |

## `/api/help` (2개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/help` |  |  |
| POST | `/api/help` |  |  |

## `/api/issues` (2개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/issues/sync` | 프로젝트 이슈를 Jira에서 가져와 utop에 저장. 마지막 마커 이후 변경분만(증분), full=True면 전체. |  |
| GET | `/api/issues/{project}` | utop에 저장된 이슈를 그대로 반환 (Jira 호출 없음). |  |

## `/api/jira` (22개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/jira/ask` | 질문 → Jira 이슈 검색 → LLM 답변 (비스트리밍). |  |
| POST | `/api/jira/ask-stream` | 질문 → Jira 검색 → LLM 답변 스트리밍 (SSE) — 느린 응답을 토큰 단위로 즉시 표시. |  |
| GET | `/api/jira/attachment` |  |  |
| GET | `/api/jira/components` | 프로젝트 구성요소 + 컴포넌트 리드(기본 담당자) 목록 — 구성요소 선택 시 담당자 자동 지정용. |  |
| GET | `/api/jira/config` |  |  |
| POST | `/api/jira/config` |  |  |
| GET | `/api/jira/createmeta` |  |  |
| GET | `/api/jira/defect/class` | 저장된 전체 분류 반환 {key: {...}}. |  |
| POST | `/api/jira/defect/class` | 수동 분류 저장/수정. payload={key, class:{source,device,category,item,type3}}. |  |
| POST | `/api/jira/defect/classify` | 이슈키 목록을 LLM(제마)으로 자동 분류 → 저장. payload={keys:[...], overwrite:bool}. |  |
| GET | `/api/jira/defect/schema` | 분류 스키마(드롭다운 옵션) 반환. |  |
| GET | `/api/jira/fields` |  |  |
| POST | `/api/jira/issue` |  |  |
| GET | `/api/jira/issue/{key}` |  |  |
| POST | `/api/jira/issue/{key}/attach` |  |  |
| POST | `/api/jira/issue/{key}/comment` |  |  |
| GET | `/api/jira/issuetypes` |  |  |
| GET | `/api/jira/projects` |  |  |
| GET | `/api/jira/search-all` |  |  |
| POST | `/api/jira/test` |  |  |
| GET | `/api/jira/user-search` | 담당자 목록/검색. project 지정 시 그 프로젝트에 할당 가능한 사용자 전체(assignable), |  |
| GET | `/api/jira/versions` |  |  |

## `/api/knowledge-sources` (2개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/knowledge-sources` |  |  |
| POST | `/api/knowledge-sources` |  | token param |

## `/api/lab-test` (1개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/lab-test` |  |  |

## `/api/learn` (3개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/learn/procedure` |  | token param |
| DELETE | `/api/learn/procedure/{lp_id}` |  | token param |
| GET | `/api/learn/procedures` |  |  |

## `/api/llm` (2개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/llm/ask` | 자연어 질문 → 학습 데이터 검색 + LLM(gemma) 요약 답변 (근거 포함). | token param |
| POST | `/api/llm/generate` | 자연어 시험 목적 → 시험 절차(steps) 생성. 등록 LLM(vLLM) + 학습 예시 few-shot + JSON 강제. | token param |

## `/api/llms` (6개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/llms` |  |  |
| POST | `/api/llms` |  |  |
| POST | `/api/llms/import` | localStorage LLM 목록 일괄 import |  |
| POST | `/api/llms/reorder` | LLM 목록 순서 재배치 (드래그) |  |
| DELETE | `/api/llms/{llm_id}` |  |  |
| PUT | `/api/llms/{llm_id}` |  |  |

## `/api/locks` (5개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/locks` | 지금 잡혀 있는 자원 전부. 화면이 '누가 언제부터' 를 보여줄 수 있게 |  |
| POST | `/api/locks` |  |  |
| DELETE | `/api/locks/by-cycle/{cycle_id}` | 사이클이 끝나면 그 사이클이 잡은 것을 한꺼번에 푼다. |  |
| DELETE | `/api/locks/{resource_id}` | 해제는 잡은 본인과 관리자만. 남의 시험을 아무나 끊을 수 없어야 한다. |  |
| POST | `/api/locks/{resource_id}/heartbeat` |  |  |

## `/api/login` (1개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/login` |  |  |

## `/api/logout` (1개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/logout` |  |  |

## `/api/mail` (4개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/mail/config` |  | token param |
| POST | `/api/mail/config` |  | token param |
| POST | `/api/mail/preview-approval` | 가입 승인 메일 미리보기 — 입력 HTML을 샘플 데이터로 렌더. | token param |
| POST | `/api/mail/test` |  | token param |

## `/api/manual` (4개)

| method | path | summary | auth |
|---|---|---|---|
| DELETE | `/api/manual/{mid}` |  |  |
| GET | `/api/manual/{mid}` |  |  |
| POST | `/api/manual/{mid}` |  |  |
| GET | `/api/manual/{mid}/images` | 이미지만 별도 fetch — 청크 화면에서 지연 로드용 |  |

## `/api/manual-folders` (2개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/manual-folders` |  |  |
| POST | `/api/manual-folders` |  | token param |

## `/api/manuals` (1개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/manuals` |  |  |

## `/api/me` (3개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/me` |  | token param |
| POST | `/api/me/avatar` |  | token param |
| POST | `/api/me/change-password` | 본인 비밀번호 변경 — 현재 비밀번호 검증 후 새 비밀번호로 교체. | token param |

## `/api/mention` (1개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/mention` |  | token param |

## `/api/n2x` (12개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/n2x/diag` | 데몬 상태 진단 — 등록된 데몬 프로세스 목록, alive 여부, stderr 잔여 등. |  |
| GET | `/api/n2x/ping` |  |  |
| GET | `/api/n2x/ports` |  |  |
| GET | `/api/n2x/probe` |  |  |
| POST | `/api/n2x/release` |  |  |
| POST | `/api/n2x/reserve` |  |  |
| POST | `/api/n2x/reserve-batch` | 여러 (module, port) 예약을 한 번의 요청으로. 데몬 파이프는 단일이라 서버 단에서 순차 처리 → |  |
| POST | `/api/n2x/reset` | 데몬 강제 재기동. 사용자가 연결 조회 실패 시 수동 트리거. |  |
| POST | `/api/n2x/traffic/clear` |  |  |
| POST | `/api/n2x/traffic/start` |  |  |
| POST | `/api/n2x/traffic/stat` |  |  |
| POST | `/api/n2x/traffic/stop` |  |  |

## `/api/notifications` (2개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/notifications` |  | token param |
| POST | `/api/notifications/read` |  | token param |

## `/api/notify` (1개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/notify/cycle` | 사이클 생성 시 담당자에게 배정 알림 메일 발송 (메일 발송 토글 ON일 때 프론트가 호출). | token param |

## `/api/org-options` (2개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/org-options` |  |  |
| POST | `/api/org-options` |  | token param |

## `/api/page-ai` (2개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/page-ai` |  |  |
| POST | `/api/page-ai` |  | token param |

## `/api/permissions` (2개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/permissions` |  |  |
| POST | `/api/permissions` |  |  |

## `/api/ping` (1개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/ping` |  |  |

## `/api/procedures` (4개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/procedures` |  |  |
| POST | `/api/procedures` |  |  |
| DELETE | `/api/procedures/{proc_id}` |  |  |
| PUT | `/api/procedures/{proc_id}` |  |  |

## `/api/prompts` (2개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/prompts` |  |  |
| POST | `/api/prompts` |  |  |

## `/api/racks` (2개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/racks` |  |  |
| POST | `/api/racks` |  |  |

## `/api/rag` (7개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/rag/chunks` |  |  |
| GET | `/api/rag/config` |  | token param |
| POST | `/api/rag/config` |  | token param |
| POST | `/api/rag/index` | RAG 색인 추가/갱신 — {id?, name, text, source?, folder?, url?}. 같은 id 재전송 = 덮어쓰기(업서트). | token param |
| GET | `/api/rag/info` |  |  |
| POST | `/api/rag/search` |  |  |
| POST | `/api/rag/test` | 임베딩·리랭커 연결 테스트. | token param |

## `/api/release-summary` (2개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/release-summary` |  |  |
| POST | `/api/release-summary` |  |  |

## `/api/req` (5개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/req` |  |  |
| DELETE | `/api/req/{req_id}` |  |  |
| GET | `/api/req/{req_id}` |  |  |
| POST | `/api/req/{req_id}` |  |  |
| POST | `/api/req/{req_id}/embed` |  |  |

## `/api/req-categories` (5개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/req-categories` |  |  |
| POST | `/api/req-categories` |  |  |
| POST | `/api/req-categories/reorder` | 형제 순서 재배치 + 필요하면 상위 이동까지 한 번에. |  |
| DELETE | `/api/req-categories/{cat_id}` | 하위 분류까지 함께 지운다. 요구사항은 지우지 않고 '미분류'가 된다. |  |
| PUT | `/api/req-categories/{cat_id}` |  |  |

## `/api/req-images` (1개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/req-images/{name}` |  |  |

## `/api/resource` (4개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/resource/manpower` |  |  |
| POST | `/api/resource/manpower` |  |  |
| GET | `/api/resource/projects` |  |  |
| POST | `/api/resource/projects` |  |  |

## `/api/results` (1개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/results` |  |  |

## `/api/run` (1개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/run/{proc_id}` |  |  |

## `/api/run-cli` (1개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/run-cli` |  |  |

## `/api/run-cli-stream` (1개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/run-cli-stream` | 명령 출력을 줄 단위로 실시간(SSE) 전송 — 블로킹 대신 스트리밍. 명령 에코·끝 프롬프트는 빼고 출력만. |  |

## `/api/session-close` (1개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/session-close` |  |  |

## `/api/session-open` (1개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/session-open` |  |  |

## `/api/share-config` (2개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/share-config` |  | token param |
| POST | `/api/share-config` |  | token param |

## `/api/share-mail` (1개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/share-mail` |  | token param |

## `/api/signup` (1개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/signup` |  |  |

## `/api/snmp-get` (1개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/snmp-get` |  |  |

## `/api/snmp-set` (1개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/snmp-set` |  |  |

## `/api/snmp-trap` (1개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/snmp-trap/wait` |  |  |

## `/api/status` (1개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/status` |  |  |

## `/api/stc` (12개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/stc/conncheck` | 실제 섀시 연결 확인 (트래픽 생성 없음). 섀시/모듈 인벤토리를 반환. |  |
| POST | `/api/stc/meter/{action}` |  |  |
| POST | `/api/stc/release` |  |  |
| POST | `/api/stc/reserve` |  |  |
| POST | `/api/stc/reserve/status` |  |  |
| POST | `/api/stc/run` |  |  |
| POST | `/api/stc/server/start` |  |  |
| GET | `/api/stc/server/status` |  |  |
| POST | `/api/stc/sess/{action}` |  |  |
| POST | `/api/stc/stop` |  |  |
| POST | `/api/stc/traffic/run` |  |  |
| POST | `/api/stc/traffic/stop` |  |  |

## `/api/tc` (12개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/tc` | meta=1 : 목록 렌더에 필요한 메타만 반환 (checks/steps 등 큰 필드 제외 → 초기 로딩 대폭 단축) |  |
| DELETE | `/api/tc/{tc_id}` |  |  |
| GET | `/api/tc/{tc_id}` |  |  |
| POST | `/api/tc/{tc_id}` |  |  |
| POST | `/api/tc/{tc_id}/generate` | 자연어 한 줄 → 슬롯·스텝 제안. 저장하지 않고 돌려만 준다. |  |
| POST | `/api/tc/{tc_id}/run` | 단일 TC 개별 실행. body: device_id(특정 장비), cycle_id(해당 Cycle 장비로 실행하고 결과 반영). |  |
| DELETE | `/api/tc/{tc_id}/run-history` |  |  |
| GET | `/api/tc/{tc_id}/run-history` |  |  |
| POST | `/api/tc/{tc_id}/run-history` |  | token param |
| GET | `/api/tc/{tc_id}/snapshots` |  |  |
| GET | `/api/tc/{tc_id}/snapshots/{name}` |  |  |
| POST | `/api/tc/{tc_id}/snapshots/{name}/restore` |  |  |

## `/api/todo` (2개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/todo` |  |  |
| POST | `/api/todo` |  |  |

## `/api/trash` (3개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/trash` |  |  |
| POST | `/api/trash/restore/{trash_id}` |  |  |
| DELETE | `/api/trash/{trash_id}` |  |  |

## `/api/ui-options` (2개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/ui-options` |  |  |
| POST | `/api/ui-options` |  | token param |

## `/api/upload` (1개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/upload/image` |  |  |

## `/api/users` (5개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/users` |  | token param |
| POST | `/api/users` |  | token param |
| GET | `/api/users/mentionable` |  | token param |
| DELETE | `/api/users/{username}` |  | token param |
| PUT | `/api/users/{username}` |  | token param |

## `/ws` (1개)

| method | path | summary | auth |
|---|---|---|---|
| WS | `/ws` |  |  |

