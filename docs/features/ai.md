# AI — Test AI · Knowledge AI · Coverage AI · LLM 설정

## 무엇을 하는 화면인가

LLM 으로 **시험을 만들고 고치는 것**(Test AI, Coverage AI)과 **자료를 찾아 답하는 것**(Knowledge AI)을 가른다.
쓰기와 읽기라 묻는 말도 답하는 꼴도 다르다. LLM 은 여러 개 등록해 두고 **용도별로** 어느 것을 쓸지 정한다.
사내 LLM(OpenAI 호환 주소)·Anthropic·Dify 를 붙일 수 있고, 밖으로 나가지 않는 로컬 LLM 만으로도 돈다.

## 어디 있나

왼쪽 메뉴 AI › **Test AI** · **Knowledge AI**. Coverage AI 는 REQ-Coverage 화면 안의 대화 판이다. 설정은 SETUP › **LLM 설정** · **용도별 프롬프트**.

## 하는 일

### LLM 설정 (SETUP)
- 「추가」: 이름·종류(anthropic·openai 호환·dify)·주소·모델·API 키·최대 토큰·온도·호환 모드. 「연결 시험」 으로 답이 오는지 본다.
- **용도**(purpose)마다 어느 LLM 을 쓸지 고른다 — 요구사항 의도 다듬기, 시험 생성, 시험 설명, Coverage AI 기본, 비슷한 항목 찾기, 사이클 요약, Jira 묻기, Knowledge AI 등.
  용도별 프롬프트와 파라미터(온도 등)도 여기서 고친다.
- 사용량(질문 수·토큰)과 피드백(좋아요/싫어요)이 쌓인다. 「AI 설정」 에서 자동 색인·자동 요약·자동 결함을 켜고 끈다.

### Test AI (자연어 시험)
- 「E6100 rate limit 시험해줘」 처럼 말하면 LLM 이 **시험 절차(스텝)** 를 만든다. 명령·판정 기준·SNMP·ping·계측기·반복·조건까지 스텝 꼴로 나온다.
- 만든 절차를 장비에 바로 돌려 보고(nl-exec), 응답을 보고 판정 기준을 뽑아 채운다(nl-criteria). 비슷한 기존 시험 항목을 찾아 가져올 수도 있다.
- 대화는 기록으로 남고 폴더로 정리한다. 첫 화면의 예시 질문은 관리자가 고친다.
- **학습한 절차** — 잘 만든 절차를 저장해 두면 다음에 비슷한 요청에서 참고한다.
- 장비 매뉴얼(PDF·워드)을 올려 두면 절차를 만들 때 근거로 쓴다(RAG).

### Coverage AI (REQ-Coverage 안)
- 「E6100 에서 VLAN 시험 추천해 줘」 → 장비·항목 후보를 **카드**로 세운다. 카드를 눌러 고르고, 고른 것으로 실행까지 이어진다.
- 한 문장에 다 말하면 끝까지, 하나씩 물으면 단계별로 간다. 실존하는 TC 키·IP 는 LLM 분류를 거치지 않고 바로 알아본다.
- 「찾아 줘」 는 RAG(BM25 + 임베딩 + 재정렬)로 후보를 찾아 LLM 이 재선별한다. 선택 상태가 정본이다 — 말로 고른 것도 카드로 선다.
  대화 규칙은 [../coverage-ai-chat-rules.md](../coverage-ai-chat-rules.md).

### 흐름은 프롬프트가 정한다 (Basic)

장비를 묻을지·한 대뿐이면 확정할지·항목을 물을지 같은 **다음 행동**은 SETUP › 용도별 프롬프트 › Coverage AI · Basic 의
[다음 행동] 절이 정한다. LLM 은 매 답에 `next` 하나를 적고(confirm_device · ask_device · use_device · repick_device ·
ask_tc · wait_tc · none), 화면은 그 행동만 실행한다. 판단 재료로 [현황]과 [선택 상태](대상 장비·모델, 먼저 정해진 항목과
그 모델, 말에 적힌 모델의 장비 후보 수, 떠 있는 카드)가 함께 실린다. 장비·항목이 실제 목록에 있는지, 확정은 클릭이라는
것은 코드가 지키고, LLM 이 없거나 답을 못 주면 코드의 기본 규칙(여럿이면 묻고 · 모델이 다르면 다시 고르고 · 장비만
말했으면 항목을 기다린다)으로 물러선다.

### Knowledge AI
- 「실패 항목 뭐 있어」 「Kernel Panic 이슈 찾아줘」 처럼 묻는다. 답의 **근거는 우리 자료**다 — WIKI 문서, 요구사항·시험 항목, 사이클 결과, Jira 저장본.
  범위를 「WIKI 문서에서만」 「시험 결과에서만」 으로 좁힐 수 있다. 근거가 없으면 없다고 답한다.
- 대화는 폴더로 정리하고, 폴더에는 지시문과 기억(자주 나온 출처)이 붙는다. 답에 투표할 수 있다.
- 내 문서를 올려 두면(docs) 그것도 근거가 된다.

### RAG 와 Confluence
- 위키·요구사항·시험 항목·매뉴얼을 잘라 색인한다. 임베딩 서버(bge-m3 등)와 재정렬 서버(bge-reranker)를 붙이면 검색이 좋아지고,
  없으면 단어 검색(BM25)만으로 돈다. 위키 색인 상태는 SETUP 의 RAG 카드에서 본다.
- Confluence 를 붙이면 문서를 검색하고 요구사항의 Confluence 주소를 본문으로 읽어 온다(TC 자동 생성용).

### 시험 항목 생성·설명 (REQ-Coverage 안)
- 요구사항에서 「시험 만들기」: 요구사항의 구현 내용과 매뉴얼을 근거로 시험 항목 초안을 만든다. 「의도 다듬기」 는 한 줄 요청을 구현 의도로 편다.
- 시험 항목에서 「설명」: 스텝을 읽어 무엇을 시험하는지 문장으로 적는다. 「매뉴얼 근거」 로 관련 매뉴얼 구절을 찾는다.

## 규칙과 주의

- LLM 이 없으면 모든 AI 길은 「등록된 LLM 이 없습니다」 로 안내한다. 500 이 아니다.
- Coverage AI 의 카드 판은 화면에 늘 한 장이다. 입력마다 화면 전체가 다시 그려지지 않게 입력칸은 따로 분리돼 있다.
- 응답을 흘려 보이는 길(SSE)은 압축을 끈다. nginx 도 버퍼링을 끈다.

## 관리자가 할 일

- SETUP › **LLM 설정**과 **용도별 프롬프트**. RAG 카드의 임베딩·재정렬 주소. Confluence 설정. Test AI 예시 질문.

## 동작 확인

```bash
./tools/smoke.sh ai
```

대본 `tests/smoke/ai_smoke.py`: LLM 추가·목록·고치기·연결 시험(가짜 키 → 안내)·차례·고르기·용도 → 프롬프트·AI 설정·page-ai·통계·사용량·피드백 →
매뉴얼·학습 절차 → 챗 세션·Dify·지식 출처·Confluence 설정·시험·읽기 → RAG 설정·정보·위키 색인 상태·검색·색인 →
Knowledge AI 대화 목록·폴더 만들기·이름·지우기·질문(근거 없음 안내)·출처 → Coverage AI·전체 검색·비슷한 항목·llm/ask·TC 생성·자연어 절차가 500 이 아닌가 →
자연어 시험(nl_test) 예시·기록·비슷한 TC·절차·판정 뽑기·실행 → LLM 지우기. 56개.

실제 LLM 답변·임베딩 검색은 서버가 있어야 한다. 새 판을 올린 뒤 Test AI 질문 하나, Coverage AI 추천 하나를 해 본다.

## 관련 API

`/api/llms` · `/api/llm/purposes·similar·wiring·generate·ask` · `/api/llm-choices` · `/api/anthropic/models` · `/api/openai/models` ·
`/api/prompts` · `/api/page-ai` · `/api/ai/settings·usage·feedback·stats·cov-chat·search-all·nl-exec` · `/api/ai/nl-*·examples`(Test AI) ·
`/api/kai/*`(Knowledge AI) · `/api/kb/*` · `/api/rag/*` · `/api/knowledge-sources` · `/api/confluence/*` · `/api/manuals·manual/*·manual-folders` ·
`/api/learn/*` · `/api/chat*` · `/api/dify/*` · `/api/nl/*` · `/api/tc/{id}/generate·describe·ai-manual` · `/api/req/{id}/ai-intent·ai-coverage·make-tcs·embed`.
