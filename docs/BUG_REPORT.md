# BUG_REPORT.md

> 리팩토링 정밀 분석(15개 영역) 중 **발견했으나 수정하지 않은** 의심 버그·이상 동작 목록입니다.
> 사용자 지침에 따라 **어느 것도 수정하지 않았습니다.** 각 항목은 위치·현상·비고만 기록합니다.
> 작성일: 2026-07-01 · 근거: `REFACTORING_PLAN.md` 분석 산출물.
>
> ⚠️ 이 목록은 정적 분석 기반 "의심"입니다. 실제 버그 여부는 런타임 재현으로 확인이 필요하며, 일부는 의도된 동작일 수 있습니다(각 항목의 "비고" 참조).

## 심각도 분류(참고용, 주관적)
- 🔴 데이터/권한/동작 오류 가능성: #7, #8, #13, #25, #26, #27
- 🟡 상태·일관성/경합 가능성: #1, #2, #6, #11, #16, #17, #18, #33, #34
- ⚪ 견고성/경미/관찰: 그 외

---

## launcher.py
1. 🟡 **[launcher.py:421-427 서버 기동 대기 루프]** 30회(~15초) 내에 서버가 바인딩되지 않으면 `set_status(True)` 없이 루프를 빠져나가 stdout 읽기 루프로 넘어감. uvicorn이 느리지만 결국 서비스되는 경우 UI가 '시작 중'에 멈추고 시작 버튼이 비활성인 채 running으로 전환되지 않을 수 있음.
2. 🟡 **[launcher.py:448-455 stop_server vs 438-439 _start 스레드]** `stop_server`가 `cleanup_server_process()`(server_proc=None) 후 `set_status(False)` 호출. 동시에 _start 워커 스레드가 스트림 종료 시 다시 `set_status(False)` + '서버가 중지되었습니다' 로그를 한 번 더 남김(중복 로그). GUI 스레드/워커 스레드가 전역을 동시 기록.
3. ⚪ **[launcher.py:464-469 on_close]** `is_running`일 때 Tk 메인스레드에서 `time.sleep(0.5)` 호출 → destroy 직전 GUI 잠깐 멈춤. 경미.

## backend/main.py
4. 🔴 **[main.py:4307, 4423 dify_chat/dify_upload]** Authorization 헤더 구성 시 `cfg['key']`를 직접 subscript. 어시스턴트가 key 없이 저장될 수 있어(4246에서 빈 key 허용) `KeyError`가 스트림 예외로만 표면화됨. (동일: #19)
5. ⚪ **[main.py:4102 run_procedure 종합 상태]** 알 수 없는 step 타입은 `else` 분기에서 그대로 status 'PASS' passthrough → 미인식 타입이 실행을 실패시키지 않음. 시뮬레이션 의도로 보임.
6. 🟡 **[main.py:3844-3853 portstatus 캐시 read]** `_stc_live_status` 실패(subprocess 오류) 시 캐시 부재로 rows가 []가 되지만 응답은 `cached:True, ts:0`로 보고 → 프론트가 오류 아닌 "빈 포트 목록"으로 해석할 수 있음.
7. 🔴 **[main.py:1559-1581 _trash_put]** `return tid`(1558줄) 뒤에 놓인 REQ 마이그레이션 블록은 **도달 불가 죽은 코드**. REQ_FILE을 참조하나 실행되지 않음. 오붙여넣기로 추정 — 시작 시 마이그레이션 의도였다면 현재 아무 동작 안 함. (구조 리팩토링 아님, 기록만 — Tier D의 죽은 코드 제거 후보이나 "의도된 마이그레이션이 실종된 것"일 수 있어 삭제 보류)
8. 🔴 **[main.py:1950-1961 delete_chat_session]** 삭제 조건이 `not s.get("user")`(주인 없음) 세션을 **모든 호출자**(비관리자 포함)에게 허용 → 비소유자가 주인 없는 세션 삭제 가능. 인라인 주석('주인없음 → 삭제')상 의도일 수 있으나 권한 갭 가능성.
9. ⚪ **[main.py:1358, 1421]** `ai_feedback_save`는 score를 `int(payload.get('score') or 0)`로 저장하나, `ai_stats` 평균은 truthy score만 포함 → 정상적인 0점이 평균에서 제외됨(저장/집계 비대칭).
10. ⚪ **[main.py:270-274 import_llms]** id 유니크 체크가 name+endpoint에만 있고 `llm.get('id')` 자체엔 없음 → import 시 기존 저장 id와 중복 가능.
11. 🟡 **[main.py:322-334, 384]** SESSIONS TTL 필터가 시작 로드 때만 적용, 런타임 만료 없음. `ts`는 로그인 시에만 설정(사용 시 갱신 안 함) → 30일 초과 활성 세션이 재시작 전까지 생존.
12. ⚪ **[main.py:1187, 1265 LLM 선택]** `status` 누락을 active로 취급하고 fallback `llms[0]`이 endpoint 없는 첫 llm을 고를 수 있으나 하위 가드(`if not llm or not llm.get('endpoint')`)로 크래시는 없음. 인지용.
13. 🔴 **[main.py:3415-3444 _n2x_send 경합]** `_n2x_get_daemon`이 죽은 데몬 재생성 후 `_n2x_send`가 다시 `poll()` 체크·pop·re-get. stdin.write/readline이 `_n2x_reg_lock`으로 보호되지 않아, 동시 호출 시 같은 key로 데몬 2개를 스폰 → 두 번째 Popen이 레지스트리를 덮어써 첫 프로세스가 고아가 될 수 있음.
14. ⚪ **[main.py:3178, 3273]** async 엔드포인트 내 `asyncio.get_event_loop()`는 최신 Python에서 deprecated. 현재 uvicorn 설정에선 정상이나 취약. `get_running_loop()`가 현대 관용.
15. ⚪ **[main.py:3477-3478 n2x_reserve force release]** 충돌 label 해제의 반환값 무시하고 0.5s만 sleep → 해제 실패/지연 시 이후 reserve(3481)가 실패할 수 있음.
19. 🔴 **[main.py:4307, 4423]** (#4와 동일 근원) present-but-empty key면 'Bearer ' 토큰 없이 전송되어 명확한 오류 대신 인증 실패로 이어짐.
20. ⚪ **[main.py:4685-4686 _embed_texts]** 임베딩 결과를 배치당 `x.get('index',0)`로 정렬·확장. index가 배치 로컬(0..63) 가정. 서버가 전역 index를 반환하면 벡터-텍스트 정렬이 어긋날 수 있음.
21. ⚪ **[main.py:4535 _embed_add]** 같은 `keys` 배치 안에 동일 key가 두 번 있으면 중복 방지가 없어 매트릭스에 매핑되지 않는 중복 행이 생길 수 있음.
22. ⚪ **[main.py:2664, 2674 _load_snmp_enums]** 동일 함수 스코프에서 `import json as _json` 2회(무해한 재import).
23. ⚪ **[main.py:2708-2711 _snmp_enum vs 2728-2731 _snmp_set_enum]** `cut==0` 처리가 다름(하나는 `oid_num` 문자열 직접, 다른 하나는 `'.'.join(ps)` lstrip 후). OID에 선행 점 유무에 따라 GET/SET enum 해석이 달라질 수 있음.
24. ⚪ **[main.py:2709 _snmp_enum]** `if cut > len(ps): continue` 가드가 strict `>`. cut==len(ps)면 빈 슬라이스 → `''` 조회. 대개 무해하나 `_snmp_set_enum`과 미묘히 다름.

## backend/engine.py
16. 🟡 **[engine.py:133-138 _clean_cli_output 에코 제거 루프]** `break`가 `if cmd and ln.strip()==cmd:` 밖 들여쓰기에 있어, 조건 거짓이어도 첫 non-blank 줄에서 항상 루프 종료. "첫 non-blank가 곧 에코 줄"이란 가정에선 대개 정상이나 의도와 다를 수 있음.
17. 🟡 **[engine.py:425-426 judge_by_criteria regex]** regex 규칙에서 `re.error` 시 함수 전체를 `return "FAIL"`로 조기 종료 → 이후 통과했을 다른 규칙 무시. 다른 규칙들이 fails/passed 누적 후 종합 판정하는 것과 비대칭.
18. 🟡 **[engine.py:305 judge_by_criteria OR 그룹]** OR 그룹 전부 result=None(판정 불가)이면 최종 None 반환 → 상위 `judge_cli_result`에서 falsy로 취급되어 expected/기본 판정 폴백. OR criteria가 무시될 수 있음.

## backend/stc_*.py
25. 🔴 **[stc_session.py:23-28 _sess_name vs 헤더 주석]** 주석/docstring은 "사용자별 세션 격리"를 시사하나 코드는 status 특수유저 외 모든 호출자에 `U_TOP_op` 동일 세션 반환. reserve/releaseports/forcereset가 유저 무관하게 같은 세션 공유 → 의도/동작 불일치 가능.
26. 🔴 **[stc_session.py:161 end 레지스트리 정리]** 'end' 시 `v == (user or '?')` 항목 제거. user가 빈 문자열이면 placeholder `'?'` 소유 항목을 전부 삭제 → 다른 익명 예약을 지울 수 있음.
27. 🔴 **[stc_live.py:289-290 _status_once chassis 폴백]** Hostname 매칭 실패 시 `clist[-1]`(마지막 연결 chassis)로 폴백해 그 포트를 요청 chassis인 것처럼 보고. 한 세션에 다수 chassis 연결 시 잘못된 chassis 포트 반환 가능.
28. ⚪ **[stc_meter.py:61 _session write-probe]** 세션 검증이 `create('project')` 후 `delete(t)`. 기존 project와 children-Project 순서 상호작용 또는 delete 무음 실패 시 이후 `_project()`가 예상 밖 핸들을 고를 수 있음. write-probe가 매 meter 액션마다 세션 상태 변경.

## frontend/index.html
29. ⚪ **[index.html:11, 29]** `chart.js@4.4.1`가 2회 로드(11줄 초기 head, 29줄 자원관리 그룹). 중복 네트워크 include(두 번째가 동일 전역 재등록). ※ 제거하면 로드 순서가 바뀌므로 이 동작 보존 패스에서는 범위 밖.

## frontend/static/js
30. ⚪ **[01-core.js:139-148 connectDevice]** 암묵 전역 `event`의 `event.currentTarget` 의존. Chromium에선 동작하나 취약.
31. ⚪ **[06-nav-misc.js:1479-1485 vs :207]** `isFolderDescendant`가 `f.parent==='root'`를 특수 처리하나 최신 explorer 코드는 `parent===null`을 top-level로 사용. 'root' 센티넬과 null 관례가 공존(현재 동작은 대체로 정상일 수 있음).
32. ⚪ **[09-system-init.js:1039, 1049 exportFolderPDF]** `reqList.filter(r=>r.folder===folderId)`(직계 자식만) vs 다른 folder-PDF 경로는 `expFolderDescendantIds`(재귀). 진입점마다 포함 REQ 집합이 달라 불일치 가능.
33. 🟡 **[01-core.js:1350-1354 vs :186]** `updateStatusBar`는 연결을 '연결됨'과 'connected' 둘로 카운트, `renderDeviceTree/selectDevice`는 'connected'만 비교. 데이터 모델이 한/영 상태값 혼재 → 로더에 따라 카운트가 어긋날 수 있음.
34. 🟡 **[11-board.js:371-376 vs :29/:44]** `bbsFilter`가 'all|open|done'인데 `bbsRowsHtml`은 'approved'/'rejected'도 처리, count(44줄)는 `status!=='done'`을 open으로 계산 → approved/rejected가 count엔 'open'으로 잡히나 'open' 버튼 필터엔 숨겨짐(라벨/필터 불일치).
35. ⚪ **[10-myreport.js:341-342 renderReport 재진입]** Chart 미정의 시 `setTimeout(renderReport,800)`을 상한 없이 스케줄 → Chart가 끝내 로드 안 되면 무한 재시도.
36. ⚪ **[08-milestone-cycle.js:730 nc2Submit]** folderId 미해결 시 매 제출마다 `'cf-'+Date.now()+'-'+rand` 폴더를 생성·push → 프로젝트 미선택 반복 제출 시 중복 폴더 양산 가능.

---

## 참고: 보안 관찰(리팩토링/버그 범위 밖, 별도 조치 권장)
- 프로젝트 루트에 **API 키 형태 파일명** `sk-ant-api03-...txt`(0바이트) 존재 → 실제 키는 비었으나 파일명 자체가 민감 형식. 정리 권장.
- `.env`, `backend/.env`에 시크릿 존재(정상이나 git 미사용·노출 주의).
