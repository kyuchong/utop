# UTOP (NetTest Automation) 설치 매뉴얼

유비쿼스 네트워크 장비 시험 자동화 툴 — Windows 로컬 설치 가이드.

> 이 문서는 2026-06-16 클린 환경에서 실제 설치/검증한 절차를 그대로 정리한 것이다.
> 설치 결과: Python 3.13.14 + 가상환경(.venv) + 최신 호환 패키지로 서버 정상 부팅 확인 완료.

---

## 1. 사전 요구사항

| 항목 | 값 | 비고 |
|------|----|----|
| OS | Windows 10 / 11 | 본 매뉴얼은 Windows 11에서 검증 |
| Python | **3.13.x** | 본 설치는 3.13.14 사용 (원본 프로젝트는 3.11 기준) |
| 디스크 | 약 1 GB | Python + 패키지 + 가상환경 |
| 인터넷 | 필요 | 패키지 다운로드 |
| (선택) tclsh | N2X TCL 연동 시 | `C:\Program Files\Agilent\N2X\bin\tclsh.exe` |
| (선택) Anthropic API 키 | Claude 채팅 기능 사용 시 | `.env`에 설정 |

### 왜 Python 3.13인가?
- 원본 프로젝트(`AGENTS.md`, `start.bat`)는 Python **3.11** 기준이며 `requirements.txt`에 구버전이 고정(pin)되어 있다.
- 최신 Python으로 맞추기 위해 3.13을 선택. 3.14(최신)는 일부 패키지의 미리 빌드된 wheel이 아직 없어 컴파일러가 필요할 수 있으므로 제외했다.
- 3.13은 모든 의존 패키지가 미리 빌드된 wheel을 제공하여 **컴파일러 없이** 설치가 완료된다(검증됨).

---

## 2. 설치 절차

> 아래 명령은 **PowerShell** 기준이다. (CMD 사용 시 일부 문법이 다름)

### 2-1. Python 3.13 설치 (winget)

```powershell
winget install --id Python.Python.3.13 --source winget --silent --accept-package-agreements --accept-source-agreements
```

설치 위치(사용자 단위 설치 기준):
```
%LOCALAPPDATA%\Programs\Python\Python313\python.exe
```

설치 확인:
```powershell
& "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe" --version
# => Python 3.13.14
```

> ⚠️ Windows 기본 `python` 명령은 Microsoft Store 스텁(stub)일 수 있다.
> 새 PowerShell 창에서도 `python`이 안 잡히면 위 전체 경로를 사용하라.

### 2-2. 가상환경(venv) 생성

프로젝트 루트(`c:\utop`)에서:
```powershell
& "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe" -m venv c:\utop\.venv
```

가상환경 Python 확인:
```powershell
c:\utop\.venv\Scripts\python.exe --version
# => Python 3.13.14
```

> 가상환경을 쓰는 이유: 시스템 Python을 오염시키지 않고 프로젝트 의존성을 격리한다.
> 매번 활성화하기 번거로우면 아래처럼 `.venv\Scripts\python.exe`를 직접 호출해도 된다.

### 2-3. pip 업그레이드 + 패키지 설치

```powershell
c:\utop\.venv\Scripts\python.exe -m pip install --upgrade pip

c:\utop\.venv\Scripts\python.exe -m pip install `
  fastapi "uvicorn[standard]" websockets paramiko anthropic pydantic `
  python-multipart aiofiles httpx netmiko python-pptx Pillow stcrestclient
```

> **정확한 버전 재현**이 필요하면 동결된 lock 파일을 사용하라:
> ```powershell
> c:\utop\.venv\Scripts\python.exe -m pip install -r c:\utop\requirements.lock.txt
> ```

### 2-4. API 키 설정 (Claude 채팅 기능 사용 시)

루트의 `.env` 파일에 키 입력:
```
ANTHROPIC_API_KEY=sk-ant-여기에_API_키_입력
```

> ⚠️ **보안**: 루트에 API 키가 파일명으로 노출된 파일이 있었다(`sk-ant-...`).
> 이미 노출된 키이므로 Anthropic 콘솔에서 **폐기(revoke) 후 재발급**을 권장한다. (3.3 참고)

---

## 3. 실행 방법

### 3-1. 서버 직접 실행 (권장 / 검증된 방법)

```powershell
cd c:\utop\backend
c:\utop\.venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

접속:
```
http://localhost:8000
```

중지: `Ctrl + C`

### 3-2. 런처 GUI 실행

```powershell
.venv\Scripts\python.exe scripts\launcher.py    # 또는 루트의 launcher.bat 더블클릭
```

### 3-3. start.bat 관련 주의

> 기존 `start.bat`은 `py -3.11`을 호출하도록 작성되어 있어 **이 설치 환경(3.13 + venv)에서는 그대로 동작하지 않는다.**
> `start.bat`을 쓰려면 venv 기준으로 수정이 필요하다(아래 4-3 참고). 당장은 3-1 명령을 사용하라.

---

## 4. 설치 검증 (실제 수행 결과)

| 검증 항목 | 명령 | 결과 |
|----------|------|------|
| 백엔드 컴파일 | `python -m py_compile backend\main.py ...` | ✅ compile OK |
| 앱 import | `python -c "import main; print(main.app)"` | ✅ FastAPI, 124 routes |
| 서버 부팅 | uvicorn 기동 후 `/api/status` 호출 | ✅ `{connected:2, disconnected:4, unknown:2}` |

검증 재현용 명령:
```powershell
# 백엔드 문법 검사 (저장소 루트에서)
.venv\Scripts\python.exe -m py_compile backend\main.py backend\engine.py backend\db.py
.venv\Scripts\python.exe -m py_compile (Get-ChildItem backend\stc\*.py | ForEach-Object FullName)

# 서버 상태 확인 (서버 실행 중일 때, 별도 창에서)
Invoke-RestMethod -Uri http://127.0.0.1:8000/api/status
```

---

## 5. 설치된 패키지 버전 (최신 호환)

원본 `requirements.txt`는 구버전 고정이었으나, Python 3.13 호환을 위해 최신 버전으로 설치했다.

| 패키지 | 설치 버전 | 원본 고정 버전 |
|--------|----------|--------------|
| fastapi | 0.137.1 | 0.115.0 |
| uvicorn | 0.49.0 | 0.30.0 |
| websockets | 16.0 | 12.0 |
| pydantic | 2.13.4 | 2.8.0 |
| anthropic | 0.109.2 | >=0.40.0 |
| paramiko | 4.0.0 | 3.4.0 |
| netmiko | 4.7.0 | (미고정) |
| python-pptx | 1.0.2 | (미고정) |
| Pillow | 12.2.0 | (미고정) |
| python-multipart | 0.0.32 | 0.0.9 |
| aiofiles | 25.1.0 | 23.2.1 |
| httpx | 0.28.1 | 0.27.0 |
| stcrestclient | 1.9.6 | (미고정) |

> 전체 동결 목록은 `requirements.lock.txt` 참조.

---

## 6. 트러블슈팅

### `python : 명령을 찾을 수 없음` 또는 Microsoft Store 창이 뜸
- Windows 앱 실행 별칭(App execution alias)의 Python 스텁이 동작 중이다.
- 해결: venv의 전체 경로(`c:\utop\.venv\Scripts\python.exe`)를 직접 사용하거나,
  설정 > 앱 > 고급 앱 설정 > 앱 실행 별칭에서 python 별칭을 끈다.

### `py : 용어가 인식되지 않음`
- winget의 사용자 단위 설치에서는 `py` 런처가 PATH에 없을 수 있다.
- 해결: 위처럼 `python.exe` 전체 경로를 사용한다.

### 패키지 설치 중 컴파일/빌드 오류 (Rust/C++ 요구)
- 보통 Python을 너무 최신(예: 3.14)으로 설치해 미리 빌드된 wheel이 없을 때 발생한다.
- 해결: 본 매뉴얼대로 **Python 3.13**을 사용한다.

### 포트 8000 사용 중(Address already in use)
- 다른 프로세스가 8000을 점유 중이다.
- 해결: `--port 8011` 등 다른 포트로 실행하거나 점유 프로세스를 종료한다.
  ```powershell
  Get-NetTCPConnection -LocalPort 8000 | Select-Object OwningProcess
  ```

### Claude 채팅이 동작하지 않음
- `.env`의 `ANTHROPIC_API_KEY`가 비었거나 폐기된 키일 수 있다.
- 해결: 유효한 키를 `.env`에 설정 후 서버 재시작.

### N2X TCL 시험이 실행되지 않음
- `tclsh`가 PATH에 없다.
- 해결: `C:\Program Files\Agilent\N2X\bin`을 PATH에 추가한다.

---

## 7. 부록: 폴더 구조 요약

```
<저장소>\
├── .venv\                    # Python 3.13 가상환경 (이번 설치로 생성)
├── backend\
│   ├── main.py               # FastAPI 서버 (API, WebSocket, Netmiko, PPTX)
│   ├── engine.py
│   ├── stc\                  # Spirent TestCenter 연동 모듈
│   └── n2x\                  # IXIA N2X Tcl 스크립트
├── frontend\
│   ├── index.html            # 전체 웹 UI
│   └── static\js\<탑메뉴>\   # 탑메뉴 폴더별 JS
├── data\                     # 파일 저장소 (정본 대부분은 PG)
│   ├── config\ integrations\ state\ snmp\ MIB\
│   └── devices\ req\ tc\ cycle\ results\ baselines\ ...
├── scripts\                  # launcher.py, restart-server.ps1, setup-on-new-pc.ps1
├── tools\                    # verify.py, mib_enums.py, gen_* (개발 도구)
├── launcher.bat / start.bat  # 사용자 진입점
├── requirements.txt          # 원본 의존성 (구버전 고정)
├── requirements.lock.txt     # 이번 설치 동결 버전 (재현용)
└── docs\INSTALL.md           # 이 문서
```
