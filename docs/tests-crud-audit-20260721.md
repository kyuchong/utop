# Tests 페이지 CRUD 감사 결과 (2026-07-21)

Requirements & Test Coverage (explorer3, explorer3-beta) 의 REQ / TC / Step / Query / 폴더 CRUD 감사. 확실히 문제 있는 것만 우선순위별로 정리.

---

## HIGH

### 1. REQ 삭제가 DB 에 반영 안 됨 (id vs reqid PK 혼동)
- **위치**: `frontend/static/js/02-dashboard.js:487` `deleteOneREQ`, 호출부 `06-nav-misc.js:1110/1267/1453`, `03-requirements.js:1574/1741/1986`
- **재현**: 폴더에서 REQ 추가 → 우클릭 삭제 → 새로고침 하면 REQ 부활 (WS 로도 즉시 부활)
- **원인**: `saveOneREQ` 는 `r.id` (예 `req-1732...`) 를 URL PK 로 저장하지만, `deleteOneREQ(r.reqid)` 는 사용자 지정 번호 (예 `SW-EPON-001`) 를 URL 로 넘김. 서버 `db.req_delete(rid)` 는 `WHERE id=$1` 이라 매칭 실패 → 삭제 0건, 그러나 `{success:true}` 반환
- **권장**: 모든 호출부를 `deleteOneREQ(r.id)` 로 변경. 시그니처를 `deleteOneREQ(reqObj)` 로 바꿔 내부에서 `r.id` 쓰는 것도 안전

### 2. `expReassignIdsByFolder` 안 `deleteOneREQ(oldReqid)` 동일 원인
- **위치**: `frontend/static/js/06-nav-misc.js:878`
- **재현**: REQ 드래그로 폴더 이동해서 reqid 가 새 경로로 재계산될 때 `oldReqid` 로 DELETE 요청 → 다른 REQ 의 PK 가 우연히 이 문자열과 같으면 (관리자가 처음부터 id=reqid 로 넣은 REQ) 무관한 REQ 삭제될 수 있음
- **원인**: 위 이슈와 같음
- **권장**: 이 경로에서는 REQ PK 가 바뀌지 않으므로 `deleteOneREQ` 호출 자체를 제거 (`saveOneREQ` 만으로 충분)

### 3. `tcStepMoveSel` / `tcStepIndentSel` 다중 스텝 로직 dead code
- **위치**: `frontend/static/js/04-testcase.js:2730/2742` 정의, `2798/2809` 재선언
- **재현**: 스텝 여러 개 선택 → Ctrl+↑↓ 또는 Ctrl+←→ → "이동은 스텝 1개만 선택하세요" 토스트, 이동 안 됨. 인덴트는 undo 스냅샷 없이 즉시 적용
- **원인**: 함수 선언 (hoisted) 이 같은 이름으로 두 번 있어 뒤쪽 (1개 제한 + 스냅샷 미포함) 이 항상 이김. 상단의 다중 이동 / 스냅샷 지원 버전은 실행되지 않음
- **권장**: 중복 선언 중 하나만 남기고 삭제. 상단 (2730/2742) 이 다중 스텝 지원·경계 처리·snapshot 포함이라 이쪽 유지

### 4. `expAddREQ` 자동 REQ ID 가 마지막 요소 기준이라 충돌 가능
- **위치**: `frontend/static/js/06-nav-misc.js:1117-1128`
- **재현**: 폴더에 REQ 5개 (SW-001~005) 있는 상태에서 SW-003 편집 (updated_at 최근) → "REQ 추가" 클릭 → autoId 가 SW-003 뒷번호 (SW-004) 로 계산 → 이미 존재하므로 중복
- **원인**: `folderReqs[folderReqs.length-1].reqid` 로 다음 번호 만드는데 `reqList` 는 `updated_at DESC` 순이라 "마지막 원소" 는 가장 오래 편집된 REQ. `_nextSeqFor(...)` 미사용
- **권장**: `_nextSeqFor(base, '-', 'req')` 사용. 혹은 folderReqs 를 reqid 로 정렬 후 마지막 사용

### 5. TC Step 관련 여러 함수에서 undo 스냅샷 누락
- **위치**: `04-testcase.js:2540` `tcStepDistribute`, `6540` `tcAIGenSteps`, `2169` `tcQueryDel`, `2162` `tcQueryRename`, `3130` `tcSeqDrop`
- **재현**: 이런 편집 후 Ctrl+Z → 그 직전 사용자 편집이 잘못 되돌려짐 (예상은 방금 생성 취소)
- **원인**: `_tcSnapshot(tcid)` 호출 누락. 각 함수가 직접 `tc.checks` 를 mutate 하고 저장
- **권장**: mutate 전 `_tcSnapshot(tcid)` 추가

---

## MEDIUM

### 6. TC ID 재정렬 시 다른 TC 의 `callTcid` 참조 갱신 누락
- **위치**: `06-nav-misc.js:897` `expNormalizeReqTcIds`, `868` `expReassignIdsByFolder`
- **재현**: REQ 를 다른 폴더로 드래그 → 하위 TC ID 자동 재명명 → `call` 스텝으로 호출하던 다른 TC 의 `callTcid` 는 옛 ID 유지 → 실행 시 "TC 를 찾을 수 없습니다"
- **원인**: `tcRenameId` (단건) 는 다른 TC 의 callTcid 도 스캔·갱신하지만 폴더 이동/일괄 재정렬 경로는 그 로직이 없음
- **권장**: 두 함수에서도 `for(otc of tcList) 스캔 → c.callTcid===oldTcid 면 갱신 → saveTCFile(otc)` 추가

### 7. `loadTCFull` GET 요청이 `no-store` 없이 나가서 캐시된 옛 데이터 리턴 가능
- **위치**: `03-requirements.js:2452`, 서버 미들웨어 `backend/main.py:107-118`
- **재현**: TC 저장 직후 다른 페이지 갔다 돌아옴 → 브라우저가 `max-age=10` 캐시된 옛 응답 사용 → 스텝 편집이 반영 안 된 것처럼 보임
- **원인**: `/api/tc` 경로 전체에 `Cache-Control: public, max-age=10, stale-while-revalidate=60` 적용. `loadTCData` (meta 목록) 는 `{cache:'no-store'}` 로 회피하지만 `loadTCFull` 은 그 옵션 없음
- **권장**: `fetch('/api/tc/'+_tcUrl(tcid), {cache:'no-store'})` 로 변경

### 8. REQ 다중 삭제·폴더 삭제 시 broadcast 폭탄
- **위치**: `06-nav-misc.js:1440-1466` `expBulkDelete`, `1102-1116` `expDeleteFolder`
- **재현**: 30개 REQ 선택 후 삭제 → 서버에 `DELETE /api/req/*` 30번 순차 + 각 TC 마다 `tc_deleted` broadcast + `req_deleted` broadcast → 다중 사용자 환경에서 UI 리렌더 폭주
- **원인**: 배치 삭제 API 없음. 개별 DELETE + 개별 broadcast
- **권장**: 서버에 `POST /api/req/bulk-delete` 추가 → 한 트랜잭션 처리 + 단일 broadcast

### 9. `tcQueryRename` / `tcQueryDel` undo 스냅샷 없음
- **위치**: `04-testcase.js:2162/2169`
- **재현**: Query 변수명 변경 → 여러 스텝의 `criteria`, `cli`, `switchExpr`, `case.when`, `gotoElse` 등 일괄 치환됨 → Ctrl+Z 로 못 되돌림
- **원인**: mutation 전 `_tcSnapshot` 없음. 변경 범위가 큰데 안전망 없음
- **권장**: 두 함수 시작부에 `_tcSnapshot(tcid)` 추가

### 10. `expDeleteREQ` 는 로컬 참조만 청소, 서버 cascade 안 됨
- **위치**: `06-nav-misc.js:1261-1269`
- **재현**: REQ 삭제 → 그 REQ 아래 TC 들도 로컬에서 사라짐. 하지만 REQ 자체가 DB 에서 삭제 안 되어 (#1 이슈), 서버측 `_clean_cycle_refs` 도 안 돌음. 새 세션은 REQ 살아있고 TC 죽은 상태로 재로드
- **원인**: #1 의 파생
- **권장**: #1 해결이 우선

### 11. `expBulkAddTC` dedup 검사 범위가 좁음
- **위치**: `06-nav-misc.js:1244-1259`
- **재현**: 서버에 이미 존재하는 tcid 와 프론트 tcList 미로드 상태에서 대량 생성 → tcList.some 체크 통과하지만 서버 upsert 시 기존 데이터 덮어씀
- **원인**: `while(tcList.some(x=>x.tcid===tid))` 만 검사. 서버에 있고 클라 tcList 에 없는 항목 있으면 덮어씀
- **권장**: 사전에 `loadTCData(true)` 로 최신 상태 확보 후 생성. 또는 서버 API 에 "if not exists" 옵션 추가

### 12. `tcSeqDrop` (스텝 드래그 재정렬) undo 스냅샷 없음
- **위치**: `04-testcase.js:3130`
- **재현**: 스텝 드래그로 순서 바꿈 → Ctrl+Z 로 되돌리기 불가
- **원인**: mutation 전 `_tcSnapshot` 없음
- **권장**: 시작부에 `_tcSnapshot(tcid)` 추가

### 13. REQ 저장 후에도 echo skip 없음
- **위치**: `03-requirements.js:2593` `saveTCFile` (TC 는 있음), `2548-2557` `dataChangedOnWS.req_updated` (REQ 는 없음)
- **재현**: REQ 저장 직후 서버가 `req_updated` broadcast → 프론트가 `loadREQData` 로 통째 다시 로드 → 편집 중이던 REQ 상세가 리셋될 수 있음
- **원인**: TC 는 `_tcJustSaved` 로 skip 있지만 REQ 는 없음
- **권장**: `window._reqJustSaved[req_id]=Date.now()` 를 `saveOneREQ` 에서 셋하고 `dataChangedOnWS.req_updated` 에서 스킵 판정

---

## LOW

### 14. `expAddTC` 는 `_creating` 가드 있지만 `expBulkAddTC` 는 없음
- **위치**: `06-nav-misc.js:1244`
- **재현**: 대량 생성 다이얼로그 Enter 연타로 이중 생성 가능
- **권장**: 생성 중 플래그로 두 번째 호출 무시

### 15. `expCloneTC` 는 새 tcid 존재 여부만 tcList 로 검사 — 서버에 있고 로컬엔 없는 경우 덮어씀 가능
- **위치**: `06-nav-misc.js:1290-1309`
- **재현**: 다른 세션에서 방금 만든 tcid 로 이름 지정하면 서버에서 덮어씀
- **원인**: 서버측 upsert 는 존재 여부 무시. `_uniqueTcId` 미사용
- **권장**: `tcList.some(...)` 대신 `_uniqueTcId(newId)` 로 전역 유일 보장

### 16. 다중 삭제·이동 loop 안 매 iteration 렌더링
- **위치**: `renderExplorer3()` 다수 호출
- **재현**: N=30 이면 60번 재렌더 (bulk batch 로직 없음)
- **원인**: 각 하위 함수가 자체 render 호출
- **권장**: bulk 함수는 loop 중 `_expBatch=true` 로 각 하위 함수의 렌더 스킵, 끝난 뒤 한 번만 렌더 (`expMoveTCsToFolder` 는 이미 그렇게 함)

### 17. `delete_req` 의 파일 트래시 저장이 blocking
- **위치**: `backend/main.py:1830`
- **재현**: REQ 하나에 TC 200개 딸린 경우 삭제 시 백엔드가 몇 초 멎음
- **원인**: `_trash_put("req", ...)` 이 동기 파일 write. `delete_tc` 는 이미 executor 로 옮겼지만 REQ 삭제는 안 됨
- **권장**: `asyncio.get_event_loop().run_in_executor(None, _trash_put, ...)` 로 위임

### 18. `expSaveFolders` 는 오류 여부 검사 없이 fire-and-forget
- **위치**: `06-nav-misc.js:1080`
- **재현**: 폴더 대량 편집 중 서버 500 → 클라 로컬 상태만 반영, 새로고침하면 되돌아감
- **원인**: `try{await fetch...}catch(e){}` 로 실패도 무시
- **권장**: 실패 시 이전 folders 복구 + 토스트

### 19. `tcRenameId` 는 사이클 참조 갱신할 때 `saveCycle` 이 정의돼 있을 때만 동작
- **위치**: `06-nav-misc.js:1338`
- **재현**: 대시보드에서 사이클 리스트 아직 미로드 상태에서 tcid 변경 → 사이클 items[].tcid 안 바뀜 → 리포트에서 링크 깨짐
- **권장**: 사전에 `await loadCycleData()` 로 사이클 로드 후 갱신

---

## 문제 없음으로 확인된 것

- `_normalizeTCChecks` 는 output/repeatResult/executed_at 있는 스텝을 병합·제거 안 함 (앞서 수정 완료)
- `_stepClipPaste` 는 `_tcSnapshot` 순서 정상
- `expReassignIdsByFolder` 다중 REQ 처리 시 `_nextSeqFor` 매 iteration 재계산 정상
- `saveTCFile` echo skip 정상 동작 (1.5초 안)

---

## 이번 세션에 수정된 항목 (참고)

- `e3BulkDeleteTcs`: 개별 삭제 안 렌더 스킵 + Promise.all 로 병렬 처리
- `expDeleteTC`: `window._expBulkSkipRender` flag 존중
- `expBulkAddTC`: 완료 후 `loadTCData(true)` 로 서버 상태 강제 재로드
