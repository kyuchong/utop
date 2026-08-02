# NetTest Automation

유비쿼스 네트워크 장비 시험 자동화 툴 (Claude AI 연동)

## 설치 및 실행

### 1. 압축 해제
원하는 폴더에 압축을 풀어주세요.

### 2. API 키 설정
`.env.example` 파일을 복사해서 `.env` 로 이름 변경 후 API 키 입력:
```
ANTHROPIC_API_KEY=sk-ant-여기에_API_키_입력
```

### 3. 실행
`start.bat` 더블클릭 또는 CMD에서:
```
start.bat
```

### 4. 접속
브라우저에서 http://localhost:8000 접속

---

## 폴더 구조
```
nettest/
├── backend/
│   └── main.py          ← FastAPI 서버
├── frontend/
│   └── index.html       ← 웹 UI
├── data/
│   ├── devices/
│   │   └── devices.json ← 장비 목록 (자동 저장)
│   ├── procedures/
│   │   └── procedures.json ← 시험 절차 (자동 저장)
│   └── results/         ← 시험 결과 자동 저장
├── requirements.txt
├── start.bat            ← Windows 실행 스크립트
└── .env                 ← API 키 설정 (직접 생성)
```

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| 장비 관리 | 제품군/모델 트리 구조, SSH/Telnet/TCL 연결 상태 확인 |
| 터미널 | 장비 선택 후 CLI 명령 직접 실행 |
| 시험 절차 | 제품군/모델별 절차 등록/저장/재활용 |
| 시험 실행 | 절차 선택 후 자동 실행, 실시간 단계별 결과 |
| 결과 리포트 | PASS/FAIL 결과 자동 저장 및 조회 |
| Claude 채팅 | 장비 설정 방법, 시험 시나리오 문의 |

---

## N2X TCL 연동

N2X 7.9 TCL 스크립트는 `backend/` 폴더에 `.tcl` 파일로 저장 후
시험 절차 단계에서 타입을 `TCL`, 명령에 파일명을 입력하세요.

tclsh가 PATH에 있어야 합니다:
```
C:\Program Files\Agilent\N2X\bin\tclsh.exe
```

---

## 필요 환경

- Python 3.10 이상
- Windows 10/11
- Anthropic API 키 (Claude 채팅 기능 사용 시)
