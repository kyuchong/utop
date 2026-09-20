<!-- 이 파일은 tools/gen_api_docs.py 가 생성합니다. 직접 수정하지 마세요. -->
<!-- 갱신: python tools/gen_api_docs.py -->

# API Reference

총 라우트 수: **453** (그룹 123개)

`auth` 컬럼은 endpoint 시그니처에서 감지한 인증/권한 의존성 이름 (best-effort).

## `/` (1개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/` |  |  |

## `/api/ai` (19개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/ai/examples` | 첫 화면에 뜰 질문 보기. 담아 둔 것이 없으면 기본 세 줄. |  |
| POST | `/api/ai/examples` | 질문 보기를 통째로 담는다 — **관리자만**. 빈 줄은 버리고 20개까지. | token param |
| GET | `/api/ai/feedback` |  |  |
| POST | `/api/ai/feedback` |  | token param |
| DELETE | `/api/ai/feedback/{fid}` |  | token param |
| GET | `/api/ai/nl-chats` | 내 대화 목록. 본문(메시지)은 빼고 제목·시각만 준다 — 목록은 가벼워야 한다. | token param |
| POST | `/api/ai/nl-chats` | 대화를 저장한다 (같은 id 면 덮어쓴다). | token param |
| DELETE | `/api/ai/nl-chats/{cid}` | 기록 하나 지우기 — **내 것만**. 남의 대화는 못 지운다. | token param |
| GET | `/api/ai/nl-chats/{cid}` | 대화 하나를 통째로 — 메시지·절차·실행 결과까지. | token param |
| POST | `/api/ai/nl-criteria` | 빈 판정 기준을 **실제 응답**을 근거로 채운다. |  |
| POST | `/api/ai/nl-exec` | 자연어 지시 → CLI 생성(Gemma) → (execute=true면) 실행 → 출력 해석·판정. |  |
| POST | `/api/ai/nl-plan` | 자연어 지시 → **시험 초안**(제목 + 스텝 목록). 장비에 접속하지 않는다. |  |
| POST | `/api/ai/nl-tc-adopt` | 고른 TC 를 **선택한 장비에 맞게 옮겨** 절차로 돌려준다. 장비에 접속하지 않는다. |  |
| GET | `/api/ai/nl-tc-like` | 지금 지시와 비슷한 TC 를 몇 건 골라 준다 (사용자 요청 2026-08-14). |  |
| POST | `/api/ai/search-all` |  |  |
| GET | `/api/ai/settings` |  |  |
| POST | `/api/ai/settings` |  | token param |
| GET | `/api/ai/stats` |  |  |
| POST | `/api/ai/usage` |  | token param |

## `/api/anthropic` (1개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/anthropic/models` | Claude 에서 쓸 수 있는 모델 목록 — **모델명을 손으로 치지 않게**(지시). |  |

## `/api/audit` (1개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/audit` | 수정 이력 — 알림 종이 읽는다. 최신이 앞. |  |

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

## `/api/branding` (5개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/branding` |  |  |
| POST | `/api/branding` |  | token param |
| POST | `/api/branding/login-image` | 로그인 화면 왼쪽 판에 깔 사진 — 회사 건물처럼 우리 것을 올린다(지시). | token param |
| POST | `/api/branding/login-logo` | 로그인 화면 로고 — 메뉴 로고와 **따로** 둔다(지시). | token param |
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

## `/api/codes` (7개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/codes` | 드롭다운에 들어가는 값 목록. 화면은 여기서만 읽는다. |  |
| POST | `/api/codes` | 드롭다운에 들어가는 값 추가·수정 — **관리자만**(지시). | token param |
| POST | `/api/codes/kind-label` | 기본 칸(탭)의 표시 이름 바꾸기 — 빈 이름이면 원래대로. **관리자만**(지시). | token param |
| GET | `/api/codes/kind-style` | 필드(탭) 단위 모양 — 폭·모양·정렬. |  |
| POST | `/api/codes/kind-style` | {kind, w, shape, align, weight, size, font, caps} — 빈 값은 지운다. | token param |
| GET | `/api/codes/orphans` | 쓰이고 있는데 목록에 없는 값 — 설정 화면이 「목록에 넣기」를 띄운다. |  |
| DELETE | `/api/codes/{kind}/{value}` |  | token param |

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

## `/api/copy-tree` (1개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/copy-tree` | Source 에서 고른 것들을 Destination 아래로 **복사**한다. | token param |

## `/api/custom-fields` (5개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/custom-fields` |  |  |
| GET | `/api/custom-fields` |  |  |
| POST | `/api/custom-fields` |  |  |
| POST | `/api/custom-fields` |  |  |
| DELETE | `/api/custom-fields/{cf_id}` |  |  |

## `/api/cycle` (21개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/cycle` | meta=1 : 목록·판정 집계에 필요한 필드만 반환 (각 item.steps 에서 output/verdictMsg 등 큰 필드 제거) |  |
| GET | `/api/cycle/rollup` | 폴더 한 층의 현황 — 화면(KPI·막대·추이·표)이 이 하나를 쓴다. |  |
| GET | `/api/cycle/rollup/csv` | 결과 상세를 원자료 그대로 — 지금 걸린 폴더·기간·거르개가 그대로 나간다. |  |
| GET | `/api/cycle/rollup/items` | 결과 상세 — 이 폴더에 걸린 **항목 한 줄씩**. 옛 Reports 의 아래 표다. |  |
| POST | `/api/cycle/rollup/mail` | 이 폴더의 현황을 메일로 보낸다 — 화면에서 보는 것과 같은 자료다. |  |
| GET | `/api/cycle/rollup/preview` | 메일로 나갈 그 모습 그대로 — 보내기 전에 눈으로 본다. |  |
| DELETE | `/api/cycle/{cycle_id}` |  |  |
| GET | `/api/cycle/{cycle_id}` |  |  |
| POST | `/api/cycle/{cycle_id}` |  |  |
| POST | `/api/cycle/{cycle_id}/auto-jira` | Fail 항목 → Gemma로 이슈 제목/설명 생성 → Jira 일괄 등록. {project, issuetype, tcids?, dry_r... |  |
| POST | `/api/cycle/{cycle_id}/exec-ids` | 실행 ID 부여 — 플랜에 포함되는 값이다. |  |
| POST | `/api/cycle/{cycle_id}/mail` |  | token param |
| GET | `/api/cycle/{cycle_id}/mail-log` | 결과서를 누구에게 언제 보냈나 — Test Summary 탭이 읽는다. |  |
| GET | `/api/cycle/{cycle_id}/mail-preview` |  | token param |
| POST | `/api/cycle/{cycle_id}/mail-preview` | 미리보기 — **본문이 길어 주소에 못 싣는다.** GET 판은 note 한 줄용이라 | token param |
| POST | `/api/cycle/{cycle_id}/picked` | 골라 둔 시험 항목을 사이클에 굳힌다(지시: 계정 말고 서버에). |  |
| GET | `/api/cycle/{cycle_id}/ppt` |  |  |
| POST | `/api/cycle/{cycle_id}/run` |  |  |
| POST | `/api/cycle/{cycle_id}/summarize` |  |  |
| GET | `/api/cycle/{cycle_id}/summary-body` | 메일 창이 **처음 채워 넣을 글**과 자동 제목. | token param |
| POST | `/api/cycle/{cycle_id}/test-cond` | 시험 조건을 사이클에 굳힌다 — 반복 횟수·간격·실패 처리·합격 기준. |  |

## `/api/cycle-desc-template` (2개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/cycle-desc-template` | 플랜 설명 틀 — 보고서 패턴을 맞추려고 사람이 정의해 둔다. |  |
| POST | `/api/cycle-desc-template` |  |  |

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

## `/api/cycle-version-groups` (4개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/cycle-version-groups` |  |  |
| POST | `/api/cycle-version-groups` |  |  |
| POST | `/api/cycle-version-groups/add` | 버전그룹 한 칸을 **더한다**. |  |
| DELETE | `/api/cycle-version-groups/{model}/{group}` | 버전그룹 폴더를 지운다. |  |

## `/api/dashboard` (1개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/dashboard` | 대시보드 집계 — 위젯 전부를 한 번에. 플랜은 요약본(data_summary)만 읽어 가볍다. |  |

## `/api/defects` (7개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/defects` |  |  |
| POST | `/api/defects` | 플랜 항목에서 결함을 하나 만든다. 깨진 스텝 내용을 통째로 담는다. |  |
| GET | `/api/defects/for-item` | 이 항목에 이미 건 결함이 있나 — 버튼이 「생성」/「봄」 을 가른다. |  |
| GET | `/api/defects/jira-status` | 등록한 이슈들의 **지금 지라 상태**를 한 번에 물어 온다. |  |
| DELETE | `/api/defects/{did}` |  |  |
| PATCH | `/api/defects/{did}` |  |  |
| POST | `/api/defects/{did}/push` | 결함을 Jira 이슈로 올린다. 프로젝트 키·이슈유형·우선순위·수정버전·구성요소·보고자를 함께 실어 보낸다. |  |

## `/api/device-catalog` (4개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/device-catalog` |  |  |
| POST | `/api/device-catalog` |  |  |
| GET | `/api/device-catalog/backups` | 자동 백업 목록 (최근 순). |  |
| GET | `/api/device-catalog/backups/{name}` |  |  |

## `/api/device-catalog2` (5개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/device-catalog2` |  |  |
| POST | `/api/device-catalog2` |  |  |
| POST | `/api/device-catalog2/classify` | 모델을 벤더·제품군·모델그룹으로 옮긴다 — 준 칸만 고친다. |  |
| POST | `/api/device-catalog2/rename` |  |  |
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

## `/api/devices2` (11개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/devices2` | `ifs=0` 이면 **인터페이스 줄을 싣지 않고 개수만** 준다(성능). |  |
| POST | `/api/devices2` |  |  |
| GET | `/api/devices2/export.csv` | 장비 목록을 CSV 로. 비밀번호는 기본적으로 비운다. |  |
| POST | `/api/devices2/import-csv` | CSV 로 일괄 등록·수정. IP 가 키라 같은 IP 는 덮어쓴다. |  |
| POST | `/api/devices2/import-legacy` | 옛 devices.json 을 PG 로 옮긴다. 여러 번 눌러도 안전하다(IP 기준 upsert). |  |
| DELETE | `/api/devices2/{dev_id}` |  |  |
| GET | `/api/devices2/{dev_id}` |  |  |
| POST | `/api/devices2/{dev_id}/check` | 접속해 보고 결과를 남긴다. |  |
| POST | `/api/devices2/{dev_id}/default-protocol` | 이 장비가 무엇으로 붙는지 바꾼다. |  |
| POST | `/api/devices2/{dev_id}/rack` | 랙 자리 지정/해제 — 랙뷰에서 끌어다 놓거나 뺀다. rack_id 비우면 해제. |  |
| GET | `/api/devices2/{dev_id}/snmp-ports` | 포트 형상 실측 — SNMP(ifDescr·ifOperStatus)로 링크 up/down 을 읽는다. |  |

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

## `/api/export` (1개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/export/xlsx` | 화면의 표를 **보이는 그대로** 엑셀로 내보낸다(승인). |  |

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

## `/api/id-alias` (1개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/id-alias` | 옛 ID 로 물으면 새 ID 를 준다. |  |

## `/api/id-migrate` (2개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/id-migrate/apply` | `letters` 로 **계열을 고른다**(R·T·V·P, 쉼표로 여럿). 비우면 전부. | token param |
| GET | `/api/id-migrate/plan` |  | token param |

## `/api/issues` (2개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/issues/sync` | 프로젝트 이슈를 Jira에서 가져와 utop에 저장. 마지막 마커 이후 변경분만(증분), full=True면 전체. |  |
| GET | `/api/issues/{project}` | utop에 저장된 이슈를 그대로 반환 (Jira 호출 없음). |  |

## `/api/jira` (33개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/jira/ask` | 질문 → Jira 이슈 검색 → LLM 답변 (비스트리밍). |  |
| POST | `/api/jira/ask-stream` | 질문 → Jira 검색 → LLM 답변 스트리밍 (SSE) — 느린 응답을 토큰 단위로 즉시 표시. |  |
| GET | `/api/jira/attachment` |  |  |
| GET | `/api/jira/base` | 지라 **주소만** 알려 준다 — 표에서 이슈로 건너뛰는 데 쓴다(지시). |  |
| GET | `/api/jira/cache-status` |  |  |
| POST | `/api/jira/cache-sync` | **곧장 돌아온다** — 일은 뒤에서 돈다(지적: 왜 이리 오래 걸려). |  |
| GET | `/api/jira/columns` |  |  |
| POST | `/api/jira/columns` |  | token param |
| GET | `/api/jira/components` | 프로젝트 구성요소 + 컴포넌트 리드(기본 담당자) 목록 — 구성요소 선택 시 담당자 자동 지정용. |  |
| GET | `/api/jira/config` |  |  |
| POST | `/api/jira/config` |  |  |
| GET | `/api/jira/createmeta` |  |  |
| GET | `/api/jira/defect/class` | 저장된 전체 분류 반환 {key: {...}}. |  |
| POST | `/api/jira/defect/class` | 수동 분류 저장/수정. payload={key, class:{source,device,category,item,type3}}. |  |
| POST | `/api/jira/defect/classify` | 이슈키 목록을 LLM(제마)으로 자동 분류 → 저장. payload={keys:[...], overwrite:bool}. |  |
| GET | `/api/jira/defect/schema` | 분류 스키마(드롭다운 옵션) 반환. |  |
| GET | `/api/jira/fields` | 지라의 칸 목록 — **타입까지** 준다. |  |
| POST | `/api/jira/issue` |  |  |
| GET | `/api/jira/issue/{key}` |  |  |
| POST | `/api/jira/issue/{key}/attach` |  |  |
| POST | `/api/jira/issue/{key}/comment` |  |  |
| POST | `/api/jira/issue/{key}/description` | 올린 뒤 **본문만** 다시 쓴다. |  |
| GET | `/api/jira/issues` | **우리 DB 에서** 읽는다 — 지라에 가지 않는다. |  |
| POST | `/api/jira/issues/backfill` | 더한 칸의 값을 **이미 받아 둔 이슈에** 채운다. |  |
| POST | `/api/jira/issues/sync` | 고른 프로젝트를 지라에서 **증분으로** 가져와 저장한다. |  |
| GET | `/api/jira/issuetypes` |  |  |
| GET | `/api/jira/login-check` | **Jira 로그인이 지금 되는 상태인가** — 계정 관리 화면이 묻는다. | token param |
| POST | `/api/jira/login-test` | **Jira 계정으로 로그인이 되는지** 관리자 자리에서 확인한다. | token param |
| GET | `/api/jira/projects` |  |  |
| GET | `/api/jira/search-all` |  |  |
| POST | `/api/jira/test` |  |  |
| GET | `/api/jira/user-search` | 담당자 목록/검색. project 지정 시 그 프로젝트에 할당 가능한 사용자 전체(assignable), |  |
| GET | `/api/jira/versions` |  |  |

## `/api/kai` (16개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/kai/ask` |  |  |
| POST | `/api/kai/ask-stream` | **흘려보내는 답**(승인: 스트리밍). 근거를 먼저 내보내고(meta), |  |
| DELETE | `/api/kai/doc/{did}` |  |  |
| GET | `/api/kai/docs` | 라이브러리 — 답을 **문서로 저장**한 것들. 계정별로 남는다. |  |
| POST | `/api/kai/docs` |  |  |
| DELETE | `/api/kai/folder/{fid}` | 프로젝트만 지운다 — **안의 대화는 밖으로 꺼낸다**. |  |
| PATCH | `/api/kai/folder/{fid}` |  |  |
| GET | `/api/kai/folder/{fid}/memory` | 이 프로젝트 대화에서 **자주 참조한 근거**를 센다. |  |
| GET | `/api/kai/folders` | 프로젝트 목록. 대화 수는 여기서 세어 준다 — 화면이 두 번 읽지 않게. |  |
| POST | `/api/kai/folders` |  |  |
| GET | `/api/kai/source` | 근거 **원문** — 미리보기 판이 조각이 아니라 문서를 통째로 펴게. |  |
| DELETE | `/api/kai/thread/{tid}` |  |  |
| GET | `/api/kai/thread/{tid}` |  |  |
| PATCH | `/api/kai/thread/{tid}` | 대화의 **이름을 바꾸거나 프로젝트로 옮긴다**. |  |
| GET | `/api/kai/threads` |  |  |
| POST | `/api/kai/vote` | 답이 도움이 됐는지 — 👍 · 👎. |  |

## `/api/kb` (2개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/kb/wiki-reindex` | 위키 다시 색인 — 캐시를 버려 코퍼스를 새로 짓고, 임베딩 서버가 |  |
| GET | `/api/kb/wiki-status` | 위키 색인 상태 — RAG 설정 화면의 「위키 색인」 카드가 읽는다. |  |

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

## `/api/llm` (6개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/llm/ask` | 자연어 질문 → 학습 데이터 검색 + LLM(gemma) 요약 답변 (근거 포함). | token param |
| POST | `/api/llm/generate` | 자연어 시험 목적 → 시험 절차(steps) 생성. 등록 LLM(vLLM) + 학습 예시 few-shot + JSON 강제. | token param |
| GET | `/api/llm/purposes` | 용도 목록 — 화면이 이것으로 설정 칸을 그린다. 기본 프롬프트도 함께 준다. |  |
| POST | `/api/llm/purposes` | 용도별 프롬프트·LLM 저장. 다른 설정(prompts.json)은 건드리지 않는다. |  |
| POST | `/api/llm/similar` | 목적 한 줄과 **닮은 시험**을 찾는다. |  |
| POST | `/api/llm/wiring` | 말로 적은 배선을 줄로 옮긴다. |  |

## `/api/llm-choices` (1개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/llm-choices` | 글을 맡길 수 있는 것들. 화면의 고르는 칸이 이것을 읽는다. |  |

## `/api/llms` (7개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/llms` |  |  |
| POST | `/api/llms` |  |  |
| POST | `/api/llms/import` | localStorage LLM 목록 일괄 import |  |
| POST | `/api/llms/reorder` | LLM 목록 순서 재배치 (드래그) |  |
| DELETE | `/api/llms/{llm_id}` |  |  |
| PUT | `/api/llms/{llm_id}` |  |  |
| POST | `/api/llms/{llm_id}/test` | 저장된 설정으로 실제로 한 번 불러 본다. |  |

## `/api/locks` (6개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/locks` | 지금 잡혀 있는 자원 전부. 화면이 '누가 언제부터' 를 보여줄 수 있게 |  |
| POST | `/api/locks` |  |  |
| POST | `/api/locks/bulk` | 플랜 실행이 거는 자동 점유(지시). 걸려는 장비 가운데 **남이 잡은 것이 |  |
| DELETE | `/api/locks/by-cycle/{cycle_id}` | 플랜이 끝나면 그 플랜이 잡은 것을 한꺼번에 푼다. |  |
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

## `/api/n2x` (17개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/n2x/arp` | GW 에게 ARP 를 보내 MAC 을 받아 온다. |  |
| GET | `/api/n2x/daemon.tcl` | 지금 서버가 갖고 있는 데몬 스크립트를 그대로 내려준다. |  |
| GET | `/api/n2x/diag` | 데몬 상태 진단 — 등록된 데몬 프로세스 목록, alive 여부, stderr 잔여 등. |  |
| GET | `/api/n2x/ping` |  |  |
| GET | `/api/n2x/ports` |  |  |
| GET | `/api/n2x/probe` |  |  |
| GET | `/api/n2x/relay.py` | 중계 스크립트도 같은 자리에서. 처음 깔 때 이것부터 필요하다. |  |
| POST | `/api/n2x/release` |  |  |
| POST | `/api/n2x/reserve` |  |  |
| POST | `/api/n2x/reserve-batch` | 여러 (module, port) 예약을 한 번의 요청으로. 데몬 파이프는 단일이라 서버 단에서 순차 처리 → |  |
| POST | `/api/n2x/reset` | 데몬 강제 재기동 — 섀시가 붙잡고 있는 세션을 놓게 한다. |  |
| POST | `/api/n2x/send` | 중계 창구 — 다른 UTOP 백엔드가 보낸 N2X 명령을 이 기계에서 실행한다. |  |
| POST | `/api/n2x/traffic/clear` |  |  |
| POST | `/api/n2x/traffic/start` |  |  |
| POST | `/api/n2x/traffic/stat` |  |  |
| POST | `/api/n2x/traffic/stop` |  |  |
| GET | `/api/n2x/ver` | 윈도우에서 도는 데몬이 몇 번째 판인가. |  |

## `/api/nl` (2개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/nl/plan` | 말 한 줄 → 돌릴 시험 목록. 고르기만 하고 실행하지는 않는다. |  |
| POST | `/api/nl/tc` | 말 한 줄 → **새 시험 초안**. 만들기만 하고 저장·실행은 화면이 한다. |  |

## `/api/notifications` (2개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/notifications` |  | token param |
| POST | `/api/notifications/read` |  | token param |

## `/api/notify` (1개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/notify/cycle` | 플랜 생성 시 담당자에게 배정 알림 메일 발송 (메일 발송 토글 ON일 때 프론트가 호출). | token param |

## `/api/openai` (1개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/openai/models` | OpenAI 호환 서버에서 고를 모델 목록 — Claude 와 같은 손놀림으로(지시). |  |

## `/api/org` (8개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/org` | 조직도 — 회사 → 그룹 → 담당 → 팀 → 사람. |  |
| POST | `/api/org` | 조직도 통째로 저장. 관리자만. | token param |
| POST | `/api/org/delete-node` | **빈 조직만** 지운다. 관리자만. | token param |
| POST | `/api/org/member-role` | 조직도의 **계정 없는 사람**에게 역할을 준다. 관리자만. | token param |
| POST | `/api/org/move-member` | 사람을 다른 조직으로 옮긴다. 관리자만. | token param |
| POST | `/api/org/node` | 조직을 하나 만든다 — 고른 조직 **아래**에. 관리자만. | token param |
| POST | `/api/org/rename` | 조직 이름을 바꾼다. 관리자만. | token param |
| POST | `/api/org/seed` | 이미지에 실린 조직도를 **손으로 심는다**. 관리자만. | token param |

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
| GET | `/api/permissions` | 모든 화면이 메뉴를 그리기 전에 읽는다 — 로그인만 하면 볼 수 있다. |  |
| POST | `/api/permissions` | **관리자만**(지시) — 여기서 잘못 저장하면 아무도 못 들어온다. | token param |

## `/api/ping` (1개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/ping` |  |  |

## `/api/ping-stream` (1개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/ping-stream` | ping 을 줄 단위로 흘려보낸다 (SSE). |  |

## `/api/plan-runs` (10개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/plan-runs` |  |  |
| POST | `/api/plan-runs` | 실행 만들기. 플랜을 주면 그 항목을 떠 담는다(복사). |  |
| DELETE | `/api/plan-runs/{run_id}` |  |  |
| GET | `/api/plan-runs/{run_id}` |  |  |
| POST | `/api/plan-runs/{run_id}` |  |  |
| GET | `/api/plan-runs/{run_id}/item` | 한 줄의 전문. 접힌 회차면 대표 회차의 것을 대신 준다. |  |
| POST | `/api/plan-runs/{run_id}/item` | 실행기가 항목 하나를 마칠 때마다 부른다. |  |
| GET | `/api/plan-runs/{run_id}/items` | Report 가 그리는 그 차례(끝난 것부터)로 회차 줄을 준다. |  |
| GET | `/api/plan-runs/{run_id}/rounds` | 회차 띠가 읽는 요약 — 회차마다 몇 건 돌고 몇 건 깨졌나. |  |
| GET | `/api/plan-runs/{run_id}/stat` | 몇 번 돌았고 몇 번 깨졌나 — 목록을 안 끌고 셈만 한다. |  |

## `/api/plan-runs-regression` (1개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/plan-runs-regression` | 빌드 간 회귀 — 두 빌드에서 같은 항목의 결과가 어떻게 달라졌나. |  |

## `/api/pptx-render` (1개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/pptx-render` | 고객사 양식에 값을 채워 결과서를 만든다. |  |

## `/api/pptx-templates` (1개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/pptx-templates` | 고를 수 있는 고객사 양식. 파일이 없는 것은 빼고 준다. |  |

## `/api/prefs` (2개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/prefs` | 화면 설정(보기) — 계정별(지시: PC 는 안 따라간다). 내 것 + 팀 기본. |  |
| POST | `/api/prefs` |  |  |

## `/api/prefs-team` (1개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/prefs-team` | 「모두의 기본으로 저장」 — 관리자만. 신규 계정·초기화의 기본이 된다. | token param |

## `/api/presence` (1개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/presence` | 지금 접속해 있는 사람들 — prefix 로 화면을 좁힌다 (cycle → cycle:*). |  |

## `/api/procedures` (4개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/procedures` |  |  |
| POST | `/api/procedures` |  |  |
| DELETE | `/api/procedures/{proc_id}` |  |  |
| PUT | `/api/procedures/{proc_id}` |  |  |

## `/api/projects` (3개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/projects` |  |  |
| POST | `/api/projects` |  |  |
| PUT | `/api/projects/{pid}` | 프로젝트의 **메타**를 고친다 — 고객사·모델그룹·설명. |  |

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

## `/api/rackview` (1개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/rackview` | 랙뷰 한 판 — 랙 틀(KV 'racks') + PG 장비 배치 + 아직 안 옮긴 옛 배치. |  |

## `/api/rag` (7개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/rag/chunks` |  |  |
| GET | `/api/rag/config` |  | token param |
| POST | `/api/rag/config` |  | token param |
| POST | `/api/rag/index` | RAG 색인 추가/갱신 — {id?, name, text, source?, folder?, url?}. 같은 id 재전송 = 덮어쓰기(업서트). | token param |
| GET | `/api/rag/info` |  |  |
| POST | `/api/rag/search` |  |  |
| POST | `/api/rag/test` | 임베딩·리랭커 연결 테스트. 실패하면 왜 안 되는지까지 돌려준다. | token param |

## `/api/release-summary` (2개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/release-summary` |  |  |
| POST | `/api/release-summary` |  |  |

## `/api/report` (1개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/report/summary` |  |  |

## `/api/req` (8개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/req` |  |  |
| DELETE | `/api/req/{req_id}` |  |  |
| GET | `/api/req/{req_id}` |  |  |
| POST | `/api/req/{req_id}` |  |  |
| POST | `/api/req/{req_id}/ai-coverage` | 구현의도 → **덮을 시험 항목 목록** 초안. 저장하지 않는다. |  |
| POST | `/api/req/{req_id}/ai-intent` | 짧은 요청 → **구현의도** 초안. 저장하지 않는다. |  |
| POST | `/api/req/{req_id}/embed` |  |  |
| POST | `/api/req/{req_id}/make-tcs` | 제안한 시험 항목을 **진짜 시험항목으로 만든다**. 고른 것만. | token param |

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

## `/api/req-next-id` (1개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/req-next-id` | 다음 요구사항 ID — **모델그룹 기준**(E61xx_R0001). |  |

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

## `/api/runner` (4개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/runner/claim` |  |  |
| POST | `/api/runner/login` | 실행기에게 보통 세션을 하나 내준다. |  |
| POST | `/api/runner/{run_id}/finish` |  |  |
| POST | `/api/runner/{run_id}/progress` |  |  |

## `/api/runs` (5개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/runs` | 실행 목록. |  |
| POST | `/api/runs` | 실행을 줄에 건다. 돌리는 것은 실행기가 한다. |  |
| GET | `/api/runs/{run_id}` | 진행 + 지난 로그. |  |
| POST | `/api/runs/{run_id}/resume` | 멈춰 선 반복 시험에 답한다 — 배너의 세 단추가 부르는 자리. |  |
| POST | `/api/runs/{run_id}/stop` |  |  |

## `/api/session-close` (1개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/session-close` |  |  |

## `/api/session-key` (1개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/session-key` | 탭 완성·`?` 도움말 — 터미널의 진짜 CLI 손맛(지적: 캡쳐 터미널에서 안 됨). |  |

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

## `/api/snmp-oids` (1개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/snmp-oids` | MIB 에서 뽑아 둔 OID 이름표를 찾는다. |  |

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
| POST | `/api/stc/server/start` | 이 섀시의 **REST 서버 주소**. 화면이 안 알려 주면 등록에서 찾는다. |  |
| GET | `/api/stc/server/status` |  |  |
| POST | `/api/stc/sess/{action}` |  |  |
| POST | `/api/stc/stop` |  |  |
| POST | `/api/stc/traffic/run` |  |  |
| POST | `/api/stc/traffic/stop` |  |  |

## `/api/tc` (19개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/tc` | meta=1 : 목록 렌더에 필요한 메타만 반환 (checks/steps 등 큰 필드 제외 → 초기 로딩 대폭 단축) |  |
| DELETE | `/api/tc/{tc_id}` |  |  |
| GET | `/api/tc/{tc_id}` |  |  |
| POST | `/api/tc/{tc_id}` |  |  |
| POST | `/api/tc/{tc_id}/ai-manual` | 목적·자동 스텝을 읽고 **수동 시험서** 초안. 저장하지 않는다. |  |
| GET | `/api/tc/{tc_id}/cycles` | 이 TC 가 어느 플랜에서 돌았고 결과가 어땠나. |  |
| POST | `/api/tc/{tc_id}/describe` | 스텝을 읽고 시험 목적·사전 준비 조건을 제안한다. 저장하지 않는다. |  |
| POST | `/api/tc/{tc_id}/generate` | 자연어 한 줄 → 슬롯·스텝 제안. 저장하지 않고 돌려만 준다. |  |
| GET | `/api/tc/{tc_id}/path` | 이 시험이 Coverage 트리의 **어디에 있나** — 사업자·폴더·요구사항 차례. |  |
| GET | `/api/tc/{tc_id}/revisions` | 이 시험의 지난 판들 — 최신이 앞. |  |
| POST | `/api/tc/{tc_id}/revisions/{rev_id}/restore` | 그 판으로 되돌린다. 지금 판은 되돌리기 직전에 자동으로 이력에 남는다. |  |
| POST | `/api/tc/{tc_id}/run` | 단일 TC 개별 실행. body: device_id(특정 장비), cycle_id(해당 Cycle 장비로 실행하고 결과 반영). |  |
| DELETE | `/api/tc/{tc_id}/run-history` |  |  |
| GET | `/api/tc/{tc_id}/run-history` |  |  |
| POST | `/api/tc/{tc_id}/run-history` |  | token param |
| GET | `/api/tc/{tc_id}/snapshots` |  |  |
| GET | `/api/tc/{tc_id}/snapshots/{name}` |  |  |
| POST | `/api/tc/{tc_id}/snapshots/{name}/restore` |  |  |
| GET | `/api/tc/{tcid}/crumb` | 결함 창이 3. 시험절차 머리에 세울 빵부스러기. |  |

## `/api/tc-last-result` (1개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/tc-last-result` | 시험마다 **가장 최근 시험 결과** — 목록의 한 열(지시). |  |

## `/api/tc-next-id` (1개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/tc-next-id` | 다음 시험 ID — **모델그룹 기준**(E61xx_T0001). |  |

## `/api/tc-running` (1개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/tc-running` | 지금 자동 실행 중인 시험들 — 방금 접속한 사람이 현황을 받는다. |  |

## `/api/todo` (2개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/todo` |  |  |
| POST | `/api/todo` |  |  |

## `/api/transfer` (2개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/transfer/export` |  |  |
| POST | `/api/transfer/import` | 합치기(upsert) — 같은 ID 는 덮고 없는 것은 만든다. 지우지는 않는다. |  |

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

## `/api/user-names` (1개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/user-names` | 담당자 드롭다운용 — **이름만**. /api/users 는 관리자 전용이라 | token param |

## `/api/users` (8개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/users` |  | token param |
| POST | `/api/users` |  | token param |
| POST | `/api/users/delete-retired` | Jira 에서 나간 사람(jira_active=False)을 **명단에서 지운다**(지시: 퇴사자 | token param |
| GET | `/api/users/jira-sync` | 지난번 동기화가 언제·어떻게 됐나 (화면 머리줄). | token param |
| POST | `/api/users/jira-sync` | Jira 사용자를 UTOP 명단으로 **끌어온다.** | token param |
| GET | `/api/users/mentionable` |  | token param |
| DELETE | `/api/users/{username}` |  | token param |
| PUT | `/api/users/{username}` |  | token param |

## `/api/views` (3개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/views` | 표 보기(탭) — 공용은 **모두가 같이 본다**. 개인 것은 만든 사람만. |  |
| POST | `/api/views` | 만들기·고치기 — 로그인한 사람이면 누구나(노션과 같은 결). | token param |
| DELETE | `/api/views/{vid}` | 지우기 — **만든 사람 또는 관리자**만(남의 탭이 실수로 사라지지 않게). | token param |

## `/api/wiki` (11개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/wiki` | 문서 트리 — 본문은 안 준다. 목록에 본문까지 실으면 수백 KB 가 된다. |  |
| POST | `/api/wiki/import-docx` | 워드(.docx) 를 위키가 읽을 수 있는 HTML 로 푼다. |  |
| POST | `/api/wiki/pdf` | 문서를 **PDF 파일로 구워서** 돌려준다. |  |
| GET | `/api/wiki/rev/{rev_id}` | 지난 판 하나. 되돌리려면 그때의 본문이 있어야 한다. |  |
| GET | `/api/wiki/search` | **본문까지** 찾는다 — 이름만으로는 「그 말이 어느 문서에 있더라」 를 못 찾는다. |  |
| DELETE | `/api/wiki/{pid}` | 지운다. **아래 문서가 있으면 안 지운다** — 통째로 사라지면 되돌릴 수 없다. |  |
| GET | `/api/wiki/{pid}` |  |  |
| PATCH | `/api/wiki/{pid}` | 자리 옮기기·이름 바꾸기 — 본문은 안 건드린다(지난 판도 안 남긴다). |  |
| POST | `/api/wiki/{pid}` | 만들기·고치기 공통. |  |
| POST | `/api/wiki/{pid}/duplicate` | 문서를 통째로 베낀다 — **안에 든 표까지.** |  |
| GET | `/api/wiki/{pid}/revs` |  |  |

## `/api/wiki-table` (6개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/wiki-table/{tid}` | 표 한 벌. **없으면 그 자리에서 만든다** — 블록이 처음 그려질 때 404 를 안 보게. | token param |
| POST | `/api/wiki-table/{tid}/cell` |  | token param |
| POST | `/api/wiki-table/{tid}/head` | 이름·열·집계·보기 — 보낸 것만 고친다(안 보낸 칸은 그대로). | token param |
| POST | `/api/wiki-table/{tid}/import` | 엑셀·노션에서 받은 자료를 통째로 들인다. | token param |
| DELETE | `/api/wiki-table/{tid}/rows` |  | token param |
| POST | `/api/wiki-table/{tid}/rows` | 줄 더하기({seed}) 또는 차례 바꾸기({order: [rid…]}). | token param |

## `/api/xlsx-read` (1개)

| method | path | summary | auth |
|---|---|---|---|
| POST | `/api/xlsx-read` | 올린 엑셀을 **글자 판**으로 돌려준다. |  |

## `/api/yjs` (1개)

| method | path | summary | auth |
|---|---|---|---|
| GET | `/api/yjs/peers/{room}` | 방에 지금 몇이 있나 — 문서를 여는 쪽이 「혼자인지」 를 기다려 보지 |  |

## `/ws` (2개)

| method | path | summary | auth |
|---|---|---|---|
| WS | `/ws` |  |  |
| WS | `/ws/yjs/{room}` |  |  |

